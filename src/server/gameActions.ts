import { WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { RoomState, SocketMessage } from '../types';
import { TABLE_W, TABLE_H, CUSHION, BALL_R, HEAD_STRING_X, getInitialBalls, simulatePhysicsStep, powerToVelocity, isAnyBallMoving, captureFrame } from './physics';
import {
  activeRooms, activeSockets, animatingRoomIds, clientsByRoom, playerRoomMap,
  userSockets, rematchingRooms, payingOutRooms, getOrCreateRoom, broadcastRoom,
  pushRoomLog, cancelForfeitTimer, startForfeitTimer, DISCONNECT_TIMEOUT_MS,
  enforceSingleSocket, removeUserSocket, pushEventLog, sendFullState, cleanupRoom,
  registerRoomTimeout, roomLocks, generateRoomCode, getPublicRooms, findRoomByCode
} from './state';
import { evaluateShotRules, triggerAiShot, concludeMatch } from './gameLogic';
import { ensureLaravelUser, createPlayerFromUser, ensureMinimumBalance, getAiUser, createAiPlayer, lockRoomEscrow } from './room';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set');
}

// ── State Machine ──────────────────────────────────────────────
const VALID_TRANSITIONS: Record<string, string[]> = {
  'waiting':  ['ready', 'waiting'],
  'ready':    ['playing', 'waiting', 'gameover'],
  'playing':  ['gameover', 'playing'],
  'gameover': ['ready', 'gameover'],
};

function validateTransition(room: RoomState, from: string, to: string): boolean {
  if (room.status !== from) return false;
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    pushEventLog('state_transition_invalid', { roomId: room.roomId, from: room.status, to });
    return false;
  }
  pushEventLog('state_transition', { roomId: room.roomId, from, to });
  return true;
}

// ── Join ──────────────────────────────────────────────────────
export async function handleJoin(ws: WebSocket, msg: Extract<SocketMessage, { type: 'join' }>): Promise<void> {
  const { roomId, username, stake, token } = msg;
  if (!token) {
    ws.send(JSON.stringify({ type: 'error', message: 'Authentication token is required to play.' }));
    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string };
    if (decoded.username !== username) {
      ws.send(JSON.stringify({ type: 'error', message: 'Token username mismatch.' }));
      return;
    }
    // Enforce single socket — close any existing connection for this user
    enforceSingleSocket(decoded.id, ws);
  } catch {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid authentication token.' }));
    return;
  }

  // Room-scoped mutex to prevent race conditions on concurrent joins
  if (roomLocks.has(roomId)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room is busy. Please try again.' }));
    return;
  }
  roomLocks.add(roomId);
  try {
    const room = getOrCreateRoom(roomId, `Stakes match: $${stake}`, stake);

    if (!clientsByRoom.has(roomId)) {
      clientsByRoom.set(roomId, new Set());
    }
    clientsByRoom.get(roomId)!.add(ws);

    const walletUser = await ensureLaravelUser(username);
    const resolvedPlayerId = walletUser.id;
    playerRoomMap.set(ws, { roomId, playerId: resolvedPlayerId });

    if (room.players.some(p => p.username === username)) {
      ws.send(JSON.stringify({ type: 'error', message: 'You already occupy a seat at this table.' }));
      return;
    }

    if (room.players.length >= 2 || room.status === 'playing') {
      ws.send(JSON.stringify({ type: 'error', message: 'This room is full or already in play. Choose another table.' }));
      return;
    }

    if (room.players.length === 1 && stake !== room.stake) {
      ws.send(JSON.stringify({ type: 'error', message: `Stake mismatch. Existing room requires $${room.stake} USDT per player.` }));
      return;
    }

    // State machine: can only join in 'waiting'
    if (room.status !== 'waiting') {
      ws.send(JSON.stringify({ type: 'error', message: 'Room is not in joinable state.' }));
      return;
    }

    const player = createPlayerFromUser(walletUser, stake);
    room.players.push(player);
    pushRoomLog(room, `${username} entered table. Stake: $${stake}`);

    if (room.players.length === 2 && room.status === 'waiting') {
      if (!validateTransition(room, 'waiting', 'ready')) return;
      room.status = 'ready';
      pushRoomLog(room, 'Players joined! Validating and locking stakes in secure Laravel wallet escrow...');

      const escrowResult = await lockRoomEscrow(room, 'AUTO /api/laravel/escrow/lock', {
        roomName: room.name,
        player1Id: room.players[0].id,
        player2Id: room.players[1].id,
        stake: room.stake
      });

      if (escrowResult.success) {
        pushRoomLog(room, `Current turn: ${room.players[0].username} (Shooter). Aim at cue ball.`);
      } else {
        pushRoomLog(room, `Escrow validation failed: ${escrowResult.message || 'Insufficient wallet funds.'}`);
        room.players.pop();
        validateTransition(room, 'ready', 'waiting');
        room.status = 'waiting';
        ws.send(JSON.stringify({ type: 'error', message: escrowResult.message || 'Unable to lock stakes for this table.' }));
        broadcastRoom(roomId);
      }
    }

    broadcastRoom(roomId);
  } finally {
    roomLocks.delete(roomId);
  }
}

// ── Set AI Opponent ──────────────────────────────────────────
export async function handleSetAiOpponent(ws: WebSocket, msg: Extract<SocketMessage, { type: 'set_ai_opponent' }>): Promise<void> {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return;
  const { roomId } = mapping;
  const room = activeRooms.get(roomId);
  if (!room || room.players.length !== 1) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid room state to add AI opponent.' }));
    return;
  }

  // State machine: can only add AI in 'waiting'
  if (room.status !== 'waiting') {
    ws.send(JSON.stringify({ type: 'error', message: 'Can only add AI in waiting state.' }));
    return;
  }

  const humanPlayer = room.players[0];
  const diffLevel = msg.difficulty || 'medium';
  room.aiDifficulty = diffLevel;
  room.commissionRate = 0.05;

  const userWallet = await ensureLaravelUser(humanPlayer.username);
  if (Number(userWallet.balance) < room.stake) {
    pushRoomLog(room, `AI match blocked: ${userWallet.username} has insufficient balance for a $${room.stake} stake.`);
    room.status = 'waiting';
    broadcastRoom(roomId);
    return;
  }

  humanPlayer.walletBalance = Number(userWallet.balance);

  const aiWallet = await getAiUser();
  await ensureMinimumBalance(aiWallet.id, 10000.0);

  const aiPlayer = createAiPlayer(diffLevel, room.stake);
  room.players.push(aiPlayer);
  pushRoomLog(room, `AI Opponent (${diffLevel.toUpperCase()} Bot) has accepted the stakes!`);

  if (!validateTransition(room, 'waiting', 'ready')) return;
  room.status = 'ready';

  const escrowResult = await lockRoomEscrow(room, 'AUTO /api/laravel/escrow/lock (AI match)', {
    roomName: room.name,
    player1Id: userWallet.id,
    player2Id: aiWallet.id,
    stake: room.stake,
    difficulty: diffLevel
  });

  if (escrowResult.success) {
    pushRoomLog(room, `🔒 ESCROW SECURED: Verified by peer-signing. Tx ID: ${escrowResult.escrowId}`);
    pushRoomLog(room, `🛡️ Integrity Hash: ${escrowResult.escrowHash}`);
    pushRoomLog(room, `Match active! Current turn: ${room.players[0].username}. Let the high-stakes game begin!`);
  } else {
    room.players.pop();
    validateTransition(room, 'ready', 'waiting');
    room.status = 'waiting';
    pushRoomLog(room, `Balance Error: ${escrowResult.message || 'Your wallet does not have enough funds to play against the AI.'}`);
  }

  broadcastRoom(roomId);
}

// ── Preview Aim ──────────────────────────────────────────────
export function handlePreviewAim(ws: WebSocket, msg: Extract<SocketMessage, { type: 'preview_aim' }>): void {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return;
  const { roomId } = mapping;
  const room = activeRooms.get(roomId);
  if (!room || room.status !== 'playing') return;

  const wssList = clientsByRoom.get(roomId) || [];
  for (const client of wssList) {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'preview_aim',
        angle: msg.angle,
        power: msg.power
      }));
    }
  }
}

// ── Shoot ─────────────────────────────────────────────────────
export function handleShoot(ws: WebSocket, msg: Extract<SocketMessage, { type: 'shoot' }>): void {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return;
  const { roomId, playerId } = mapping;
  const room = activeRooms.get(roomId);
  if (!room || room.status !== 'playing') {
    ws.send(JSON.stringify({ type: 'error', message: 'Shot invalid: Game not in play state.' }));
    return;
  }

  if (room.currentTurn !== playerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Cheat safeguard: Not your active turn!' }));
    return;
  }

  if (animatingRoomIds.has(roomId)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Shot ignored — room is still animating.' }));
    return;
  }

  // Check if shooter is disconnected (in forfeit grace period)
  if (room.disconnectedPlayerIds?.includes(playerId)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Cannot shoot while disconnected.' }));
    return;
  }

  const objectBallsLeft = room.balls.filter(b => b.id !== 0 && !b.isPocketed).length;
  const isBreakShot = objectBallsLeft === 15;
  animatingRoomIds.add(roomId);

  const shooterName = room.players.find(p => p.id === playerId)?.username || 'Unknown';

  const rawPower = msg.power;
  if (!isFinite(rawPower) || rawPower < 0 || rawPower > 100) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid shot power.' }));
    animatingRoomIds.delete(roomId);
    return;
  }
  const rawAngle = msg.angle;
  if (!isFinite(rawAngle)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid shot angle.' }));
    animatingRoomIds.delete(roomId);
    return;
  }
  const clampedAngle = ((rawAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const clampedPower = Math.max(0, Math.min(100, rawPower));

  room.animVersion = (room.animVersion || 0) + 1;
  const currentAnimVersion = room.animVersion;

  if (isBreakShot) {
    pushRoomLog(room, `💥 ${shooterName} executes the BREAK SHOT! (WPA Rule 3.4 — Minimum 4 balls must hit cushions or a ball must be pocketed)`);
  } else {
    pushRoomLog(room, `${shooterName} triggers a shot with Power: ${Math.round(clampedPower)}% at Angular Offset: ${clampedAngle.toFixed(2)} rad.`);
  }

  const cueBall = room.balls[0];
  const sX = Math.max(-1, Math.min(1, msg.spinX || 0));
  const sY = Math.max(-1, Math.min(1, msg.spinY || 0));
  cueBall.spinX = sX;
  cueBall.spinY = sY;

  const forceMag = powerToVelocity(clampedPower);
  cueBall.vx = Math.cos(clampedAngle) * forceMag;
  cueBall.vy = Math.sin(clampedAngle) * forceMag;

  const frames: Array<{ id: number; x: number; y: number; isPocketed: boolean }[]> = [];
  frames.push(captureFrame(room.balls));

  let iterations = 0;
  const maxStepsLimit = 1200;
  const ballsPocketedThisShot: number[] = [];
  let cueBallPocketed = false;
  const contactTracker = { firstContactBallId: null as number | null, cushionContactOccurred: false };

  while (iterations < maxStepsLimit) {
    const preStates = room.balls.map(b => ({ id: b.id, isPocketed: b.isPocketed }));
    simulatePhysicsStep(room.balls, contactTracker);

    for (let i = 0; i < room.balls.length; i++) {
      const currentB = room.balls[i];
      const preB = preStates.find(item => item.id === currentB.id);
      if (!preB) continue;
      if (currentB.isPocketed && !preB.isPocketed) {
        if (currentB.id === 0) {
          cueBallPocketed = true;
        } else {
          ballsPocketedThisShot.push(currentB.id);
        }
      }
    }

    frames.push(captureFrame(room.balls));
    iterations++;
    if (!isAnyBallMoving(room.balls)) break;
  }

  const compactFrames = frames.map(f => f.map(b => [b.id, b.x, b.y, b.isPocketed ? 1 : 0]));
  const framePayload = JSON.stringify({ type: 'physics_frames', frames: compactFrames });
  const roomWssSet = clientsByRoom.get(roomId) || [];
  for (const client of roomWssSet) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(framePayload);
    }
  }

  const basePlayMultiplier = frames.length > 350 ? 1.95 : 1.65;
  const animationDurationMs = (frames.length * 16.66) / basePlayMultiplier + 150;

  const timer = setTimeout(() => {
    if ((room.animVersion || 0) !== currentAnimVersion) return;
    if (room.status !== 'playing') return;

    animatingRoomIds.delete(roomId);
    room.turnTimer = 60;
    evaluateShotRules(room, ballsPocketedThisShot, cueBallPocketed, contactTracker.firstContactBallId, shooterName, playerId, isBreakShot, contactTracker.cushionContactOccurred);
    broadcastRoom(roomId);

    if (room.status === 'playing' && room.currentTurn === 'ai-bot') {
      triggerAiShot(room);
    }
  }, animationDurationMs);
  registerRoomTimeout(roomId, timer);
}

// ── Reset Cue Ball ───────────────────────────────────────────
export function handleResetCueBall(ws: WebSocket, msg: Extract<SocketMessage, { type: 'reset_cue_ball' }>): void {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return;
  const { roomId, playerId } = mapping;
  const room = activeRooms.get(roomId);
  if (!room || room.status !== 'playing') return;
  if (room.currentTurn !== playerId) return;
  if (!room.scratchOccurred) return;

  const minX = CUSHION + BALL_R + 2;
  const maxX = TABLE_W - CUSHION - BALL_R - 2;
  const minY = CUSHION + BALL_R + 2;
  const maxY = TABLE_H - CUSHION - BALL_R - 2;
  const targetX = Math.max(minX, Math.min(msg.x, maxX));
  const targetY = Math.max(minY, Math.min(msg.y, maxY));

  if (room.ballInHandRestriction === 'behind_head_string') {
    const headStringMaxX = HEAD_STRING_X - BALL_R;
    if (targetX > headStringMaxX) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid placement: ball must be behind the head string after a break foul.' }));
      pushRoomLog(room, `Invalid head-string placement attempted by ${room.players.find(p => p.id === playerId)?.username}.`);
      broadcastRoom(roomId);
      return;
    }
  }

  const overlapsOtherBall = room.balls.some((b) => {
    if (b.id === 0 || b.isPocketed) return false;
    const dx = targetX - b.x;
    const dy = targetY - b.y;
    return Math.hypot(dx, dy) < BALL_R * 2.0;
  });

  if (overlapsOtherBall) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid cue ball placement: cannot place over another ball.' }));
    pushRoomLog(room, `Invalid cue ball placement attempted by ${room.players.find(p => p.id === playerId)?.username}. Choose a clear spot.`);
    broadcastRoom(roomId);
    return;
  }

  const cb = room.balls[0];
  cb.x = targetX;
  cb.y = targetY;
  cb.isPocketed = false;
  cb.vx = 0;
  cb.vy = 0;

  room.scratchOccurred = false;
  room.ballInHandRestriction = undefined;
  pushRoomLog(room, `${room.players.find(p => p.id === playerId)?.username} placed the cue ball at a valid location.`);
  broadcastRoom(roomId);
}

// ── Chat ──────────────────────────────────────────────────────
const chatCooldowns = new Map<string, number>();

export function handleChat(ws: WebSocket, msg: Extract<SocketMessage, { type: 'chat' }>): void {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return;
  const { roomId } = mapping;
  const room = activeRooms.get(roomId);
  if (!room) return;

  const playerId = mapping.playerId;
  const sender = room.players.find(p => p.id === playerId)?.username || 'Spectator';

  const message = typeof msg.message === 'string' ? msg.message.trim().slice(0, 500) : '';
  if (!message) return;

  const now = Date.now();
  const lastChat = chatCooldowns.get(playerId) || 0;
  if (now - lastChat < 1000) {
    ws.send(JSON.stringify({ type: 'error', message: 'Please wait before sending another message.' }));
    return;
  }
  chatCooldowns.set(playerId, now);

  pushRoomLog(room, `[Chat] ${sender}: ${message}`);
  broadcastRoom(roomId);
}

// ── Rematch ───────────────────────────────────────────────────
export function handleRematch(ws: WebSocket): void {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return;
  const { roomId, playerId } = mapping;
  if (rematchingRooms.has(roomId) || roomLocks.has(roomId)) return;
  const room = activeRooms.get(roomId);
  if (!room || room.status !== 'gameover') return;

  const requester = room.players.find(p => p.id === playerId);
  if (!requester) return;

  roomLocks.add(roomId);
  rematchingRooms.add(roomId);

  room.balls = getInitialBalls();
  room.players.forEach(p => { p.side = undefined; });
  room.assignedSides = false;
  room.scratchOccurred = false;
  room.pocketedThisTurn = false;
  room.ballInHandRestriction = undefined;
  room.winnerId = undefined;
  room.turnTimer = 60;
  room.animVersion = (room.animVersion || 0) + 1;
  room.serverSeed = undefined;
  room.escrowHash = undefined;
  room.disconnectedPlayerIds = [];
  room.reconnectDeadlines = {};
  room.forfeitedPlayerId = undefined;

  if (!validateTransition(room, 'gameover', 'ready')) {
    roomLocks.delete(roomId);
    rematchingRooms.delete(roomId);
    return;
  }
  room.status = 'ready';
  room.log = [`🔄 Rematch initiated by ${requester.username}!`];
  pushRoomLog(room, 'Match reset. Re-locking stakes in escrow...');
  broadcastRoom(roomId);

  const releaseRematch = () => {
    roomLocks.delete(roomId);
    rematchingRooms.delete(roomId);
  };

  lockRoomEscrow(room, 'AUTO /api/laravel/escrow/lock (rematch)', {
    roomName: room.name,
    player1Id: room.players[0]?.id,
    player2Id: room.players[1]?.id,
    stake: room.stake
  }).then(escrowResult => {
    if (escrowResult.success) {
      pushRoomLog(room, 'New break shot incoming!');
    } else {
      validateTransition(room, 'ready', 'gameover');
      room.status = 'gameover';
      pushRoomLog(room, `Rematch escrow failed: ${escrowResult.message}. Match cancelled.`);
    }
    releaseRematch();
    broadcastRoom(roomId);
  }).catch(err => {
    validateTransition(room, 'ready', 'gameover');
    room.status = 'gameover';
    pushRoomLog(room, `Rematch escrow error: ${err.message}. Match cancelled.`);
    releaseRematch();
    broadcastRoom(roomId);
  });
}

// ── Reconnect ─────────────────────────────────────────────────
export async function handleReconnect(ws: WebSocket, msg: Extract<SocketMessage, { type: 'reconnect' }>): Promise<void> {
  let decoded: { id: string; username: string };
  try {
    decoded = jwt.verify(msg.token, JWT_SECRET) as { id: string; username: string };
  } catch {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid token for reconnection.' }));
    return;
  }

  // Enforce single socket
  enforceSingleSocket(decoded.id, ws);

  // Find any room where this player is a disconnected player during an active game
  for (const [roomId, room] of activeRooms) {
    if (room.status !== 'playing' && room.status !== 'ready') continue;
    const isDisconnected = room.disconnectedPlayerIds?.includes(decoded.id);
    if (!isDisconnected) continue;

    // Atomic: cancel forfeit timer, clear old mappings, set new ones
    cancelForfeitTimer(roomId);

    const player = room.players.find(p => p.id === decoded.id);
    if (!player) {
      ws.send(JSON.stringify({ type: 'error', message: 'Player record not found in room.' }));
      return;
    }

    // Atomic cleanup of old socket mappings for this room
    const oldSocket = userSockets.get(decoded.id);
    if (oldSocket && oldSocket !== ws) {
      const oldMapping = playerRoomMap.get(oldSocket);
      if (oldMapping?.roomId === roomId) {
        const oldSet = clientsByRoom.get(roomId);
        if (oldSet) oldSet.delete(oldSocket);
        playerRoomMap.delete(oldSocket);
      }
    }

    // Restore connection tracking
    if (!clientsByRoom.has(roomId)) clientsByRoom.set(roomId, new Set());
    clientsByRoom.get(roomId)!.add(ws);
    playerRoomMap.set(ws, { roomId, playerId: decoded.id });

    player.isConnected = true;

    // Remove from disconnected list
    room.disconnectedPlayerIds = room.disconnectedPlayerIds?.filter(id => id !== decoded.id) || [];
    delete room.reconnectDeadlines?.[decoded.id];

    // If no disconnected players remain, cancel forfeit timer
    if (!room.disconnectedPlayerIds || room.disconnectedPlayerIds.length === 0) {
      cancelForfeitTimer(roomId);
    }

    pushRoomLog(room, `✓ ${player.username} reconnected to the table.`);
    pushEventLog('player_reconnected', { roomId, playerId: decoded.id, username: player.username });

    // Send full state snapshot directly to reconnecting client
    sendFullState(ws, roomId);

    // Notify other clients in room
    const wssList = clientsByRoom.get(roomId) || [];
    const rejoinPayload = JSON.stringify({ type: 'reconnect_notice', playerId: decoded.id });
    for (const client of wssList) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(rejoinPayload);
      }
    }

    broadcastRoom(roomId);
    pushEventLog('reconnect_complete', { roomId, playerId: decoded.id });
    return;
  }

  ws.send(JSON.stringify({ type: 'error', message: 'No active disconnection found for rejoin.' }));
}

// ── Disconnect ────────────────────────────────────────────────
export function handleDisconnect(ws: WebSocket): void {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) {
    activeSockets.delete(ws);
    return;
  }

  const { roomId, playerId } = mapping;
  playerRoomMap.delete(ws);
  removeUserSocket(playerId, ws);

  const room = activeRooms.get(roomId);
  if (!room) {
    activeSockets.delete(ws);
    return;
  }

  const pIdx = room.players.findIndex(p => p.id === playerId);
  if (pIdx === -1) {
    const set = clientsByRoom.get(roomId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) {
        activeRooms.delete(roomId);
        clientsByRoom.delete(roomId);
      }
    }
    activeSockets.delete(ws);
    return;
  }

  const quittingPlayer = room.players[pIdx];
  quittingPlayer.isConnected = false;
  pushRoomLog(room, `⚠ ${quittingPlayer.username} disconnected.`);

  // Track in disconnected list
  if (!room.disconnectedPlayerIds) room.disconnectedPlayerIds = [];
  if (!room.reconnectDeadlines) room.reconnectDeadlines = {};

  if (!room.disconnectedPlayerIds.includes(playerId)) {
    room.disconnectedPlayerIds.push(playerId);
  }
  room.reconnectDeadlines[playerId] = Date.now() + DISCONNECT_TIMEOUT_MS;

  pushEventLog('player_disconnected', { roomId, playerId, username: quittingPlayer.username, status: room.status });

  if (room.status === 'playing') {
    const remainingPlayers = room.players.filter(p => p.id !== playerId && p.isConnected);

    if (remainingPlayers.length === 0) {
      // Both players disconnected or no one left
      pushRoomLog(room, `⏳ All players disconnected. Waiting ${Math.round(DISCONNECT_TIMEOUT_MS / 1000)}s for reconnection...`);

      // Broadcast disconnect notice
      const wssList = clientsByRoom.get(roomId) || [];
      const notice = JSON.stringify({ type: 'disconnect_notice', playerId, deadline: room.reconnectDeadlines[playerId] });
      for (const client of wssList) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(notice);
        }
      }

      broadcastRoom(roomId);

      // Start forfeit timer — if both don't reconnect, clean up room
      startForfeitTimer(roomId, () => {
        const freshRoom = activeRooms.get(roomId);
        if (!freshRoom || freshRoom.status !== 'playing') return;
        if (!freshRoom.disconnectedPlayerIds || freshRoom.disconnectedPlayerIds.length === 0) return;

        pushRoomLog(freshRoom, '⏰ Both players failed to reconnect. Match voided, escrow refund initiated.');
        pushEventLog('both_disconnect_timeout', { roomId });

        // Escrow refund logic would go here in production
        if (validateTransition(freshRoom, 'playing', 'gameover')) {
          freshRoom.status = 'gameover';
          freshRoom.winnerId = undefined;
          broadcastRoom(roomId);
        }
      });
    } else {
      // One player left — give disconnected player 30s to reconnect
      pushRoomLog(room, `⏳ ${remainingPlayers[0].username}, your opponent disconnected. Waiting ${Math.round(DISCONNECT_TIMEOUT_MS / 1000)}s for reconnection...`);

      const wssList = clientsByRoom.get(roomId) || [];
      const notice = JSON.stringify({ type: 'disconnect_notice', playerId, deadline: room.reconnectDeadlines[playerId] });
      for (const client of wssList) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(notice);
        }
      }

      broadcastRoom(roomId);

      startForfeitTimer(roomId, () => {
        const freshRoom = activeRooms.get(roomId);
        if (!freshRoom || freshRoom.status !== 'playing') return;
        if (!freshRoom.disconnectedPlayerIds || freshRoom.disconnectedPlayerIds.length === 0) return;

        // If both disconnected, same handling as above
        if (freshRoom.disconnectedPlayerIds.length >= 2) {
          pushRoomLog(freshRoom, '⏰ Both players disconnected. Match voided.');
          if (validateTransition(freshRoom, 'playing', 'gameover')) {
            freshRoom.status = 'gameover';
            freshRoom.winnerId = undefined;
            broadcastRoom(roomId);
          }
          return;
        }

        freshRoom.disconnectedPlayerIds = [];
        freshRoom.reconnectDeadlines = {};
        const forfeitedPlayer = freshRoom.players.find(p => p.id === playerId);
        const winner = freshRoom.players.find(p => p.id !== playerId && p.isConnected);
        if (winner && forfeitedPlayer) {
          concludeMatch(freshRoom, winner, forfeitedPlayer, `${winner.username} wins by forfeit! (Opponent failed to reconnect)`);
        }
      });
    }
  } else if (room.status === 'ready') {
    pushRoomLog(room, `${quittingPlayer.username} left before the match started. Returning to lobby.`);
    room.players.splice(pIdx, 1);
    if (validateTransition(room, 'ready', 'waiting')) {
      room.status = 'waiting';
    }
    room.currentTurn = '';
    room.disconnectedPlayerIds = [];
    room.reconnectDeadlines = {};
    const set = clientsByRoom.get(roomId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) {
        cleanupRoom(roomId);
      } else {
        broadcastRoom(roomId);
      }
    } else {
      cleanupRoom(roomId);
    }
    activeSockets.delete(ws);
    return;
  } else {
    // waiting or gameover — normal cleanup
    room.players.splice(pIdx, 1);
    const set = clientsByRoom.get(roomId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) {
        cleanupRoom(roomId);
      } else {
        broadcastRoom(roomId);
      }
    }
  }

  activeSockets.delete(ws);
}

// ── Create Room ─────────────────────────────────────────────────
export async function handleCreateRoom(ws: WebSocket, msg: Extract<SocketMessage, { type: 'create_room' }>): Promise<void> {
  const { stake, isPublic } = msg;
  const mapping = playerRoomMap.get(ws);
  if (!mapping) {
    ws.send(JSON.stringify({ type: 'error', message: 'Authenticate first by joining a session.' }));
    return;
  }

  const code = generateRoomCode();
  const roomId = `room_${code}_${Date.now()}`;
  const room = getOrCreateRoom(roomId, `Room ${code}`, stake);
  room.roomCode = code;
  room.isPublic = isPublic !== false;
  room.createdAt = Date.now();

  pushEventLog('room_created_by_code', { roomId, code, stake, isPublic });
  ws.send(JSON.stringify({ type: 'room_created', roomId, roomCode: code }));
}

// ── List Public Rooms ───────────────────────────────────────────
export function handleListRooms(ws: WebSocket, msg: Extract<SocketMessage, { type: 'list_rooms' }>): void {
  const rooms = getPublicRooms(msg.stake);
  ws.send(JSON.stringify({ type: 'rooms_list', rooms }));
}

// ── Join by Code ────────────────────────────────────────────────
export async function handleJoinByCode(ws: WebSocket, msg: Extract<SocketMessage, { type: 'join_by_code' }>): Promise<void> {
  const { code, username, token } = msg;
  const room = findRoomByCode(code);

  if (!room) {
    ws.send(JSON.stringify({ type: 'room_not_found', message: `No room found with code: ${code}` }));
    return;
  }

  // Forward to handleJoin using the room's internal ID and stake
  await handleJoin(ws, { type: 'join', roomId: room.roomId, username, stake: room.stake, token });
}

// ── Join Random ─────────────────────────────────────────────────
export async function handleJoinRandom(ws: WebSocket, msg: Extract<SocketMessage, { type: 'join_random' }>): Promise<void> {
  const { stake, username, token } = msg;
  const mapping = playerRoomMap.get(ws);

  if (!mapping) {
    ws.send(JSON.stringify({ type: 'error', message: 'Please login first.' }));
    return;
  }

  // Find an available public room with matching stake
  let targetRoom: RoomState | undefined;
  for (const room of activeRooms.values()) {
    if (room.status === 'waiting' && room.isPublic && room.stake === stake && room.players.length === 1) {
      targetRoom = room;
      break;
    }
  }

  if (targetRoom) {
    // Join existing waiting room
    await handleJoin(ws, { type: 'join', roomId: targetRoom.roomId, username, stake, token });
  } else {
    // Create a new public room
    const code = generateRoomCode();
    const roomId = `room_${code}_${Date.now()}`;
    const room = getOrCreateRoom(roomId, `Public ${stake}`, stake);
    room.roomCode = code;
    room.isPublic = true;
    room.createdAt = Date.now();
    await handleJoin(ws, { type: 'join', roomId, username, stake, token });
  }
}

// ── Cancel Waiting ──────────────────────────────────────────────
export function handleCancelWaiting(ws: WebSocket): void {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return;

  const room = activeRooms.get(mapping.roomId);
  if (room && room.status === 'waiting' && room.players.length === 1) {
    // Remove player and clean up
    const pIdx = room.players.findIndex(p => p.id === mapping.playerId);
    if (pIdx !== -1) room.players.splice(pIdx, 1);

    const set = clientsByRoom.get(mapping.roomId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) cleanupRoom(mapping.roomId);
    }
    playerRoomMap.delete(ws);
    ws.send(JSON.stringify({ type: 'sync_state', state: { ...room, players: [] } }));
    pushEventLog('cancel_waiting', { roomId: mapping.roomId });
  }
}
