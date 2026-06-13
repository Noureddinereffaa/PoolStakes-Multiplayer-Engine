import { WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { RoomState, SocketMessage } from '../types';
import { TABLE_W, TABLE_H, CUSHION, BALL_R, HEAD_STRING_X, getInitialBalls, simulatePhysicsStep, powerToVelocity, isAnyBallMoving, captureFrame, forceSettleBalls, wakeAllForShot, resetYieldTimer, yieldIfNeeded } from './physics';
import {
  activeRooms, activeSockets, animatingRoomIds, clientsByRoom, playerRoomMap,
  userSockets, rematchingRooms, getOrCreateRoom, broadcastRoom,
  pushRoomLog, cancelForfeitTimer, startForfeitTimer, DISCONNECT_TIMEOUT_MS,
  enforceSingleSocket, removeUserSocket, pushEventLog, sendFullState, cleanupRoom,
  registerRoomTimeout, getPublicRooms, withRoomLock, roomIndex, ensureRoomLoaded,
  safeSend
} from './state';
import { evaluateShotRules, triggerAiShot, concludeMatch } from './gameLogic';
import { sendPushNotification } from './push';
import { ensureLaravelUser, createPlayerFromUser, ensureMinimumBalance, getAiUser, createAiPlayer, lockRoomEscrow } from './room';
import { addToQueue, removeFromQueue, tryMatch, isInQueue } from './services/matchingQueue';
import { createRoom, joinRoom, joinRoomByCode, cancelWaiting } from './services/roomManager';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('FATAL: JWT_SECRET environment variable is not set');

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

function decodeToken(token: string): { id: string; username: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET!) as unknown as { id: string; username: string };
  } catch { return null; }
}

// ── Authenticate ─────────────────────────────────────────────
export function handleAuthenticate(ws: WebSocket, msg: { token?: string }): void {
  if (!msg.token) { ws.send(JSON.stringify({ type: 'error', message: 'Token required.' })); return; }
  const decoded = decodeToken(msg.token);
  if (!decoded) { ws.send(JSON.stringify({ type: 'error', message: 'Invalid token.' })); return; }
  if (!enforceSingleSocket(decoded.id, ws)) return;
  activeSockets.add(ws);
  ws.send(JSON.stringify({ type: 'authenticated' }));
}

// ── Join (authenticate + join specific room) ────────────────
export async function handleJoin(ws: WebSocket, msg: Extract<SocketMessage, { type: 'join' }>): Promise<void> {
  const { roomId, username, stake, token } = msg;
  if (!token) { safeSend(ws, JSON.stringify({ type: 'error', message: 'Token required.' })); return; }
  const decoded = decodeToken(token);
  if (!decoded) { safeSend(ws, JSON.stringify({ type: 'error', message: 'Invalid token.' })); return; }
  if (!enforceSingleSocket(decoded.id, ws)) return;
  activeSockets.add(ws);

  const result = await joinRoom(ws, roomId, decoded.id, username, stake);
  if (result.success) {
    safeSend(ws, JSON.stringify({ type: 'join_success', roomId }));
  } else {
    safeSend(ws, JSON.stringify({ type: 'error', message: result.error || 'Failed to join room.' }));
  }
}

// ── Create Room ──────────────────────────────────────────────
export async function handleCreateRoom(ws: WebSocket, msg: Extract<SocketMessage, { type: 'create_room' }>): Promise<void> {
  const { stake, isPublic, token } = msg;
  if (!token) { safeSend(ws, JSON.stringify({ type: 'error', message: 'Authentication required.' })); return; }
  const decoded = decodeToken(token);
  if (!decoded) { safeSend(ws, JSON.stringify({ type: 'error', message: 'Invalid token.' })); return; }
  if (!enforceSingleSocket(decoded.id, ws)) return;

  const { room, code } = createRoom(ws, decoded.id, decoded.username, stake, isPublic !== false);

  const result = await joinRoom(ws, room.roomId, decoded.id, decoded.username, stake);
  if (result.success) {
    safeSend(ws, JSON.stringify({ type: 'room_created', roomId: room.roomId, roomCode: code }));
  }
  pushEventLog('room_created', { roomId: room.roomId, code, stake, isPublic });
}

// ── Join Random (Quick Play) ─────────────────────────────────
export async function handleJoinRandom(ws: WebSocket, msg: Extract<SocketMessage, { type: 'join_random' }>): Promise<void> {
  const { stake, username, token } = msg;
  if (!token) { safeSend(ws, JSON.stringify({ type: 'error', message: 'Authentication required.' })); return; }
  const decoded = decodeToken(token);
  if (!decoded) { safeSend(ws, JSON.stringify({ type: 'error', message: 'Invalid token.' })); return; }
  if (!enforceSingleSocket(decoded.id, ws)) return;

  // Check if already in queue
  if (isInQueue(ws, decoded.id)) {
    safeSend(ws, JSON.stringify({ type: 'error', message: 'Already searching for a match.' }));
    return;
  }

  // Try to find existing waiting room first
  let targetRoom: RoomState | undefined;
  for (const room of activeRooms.values()) {
    if (room.status === 'waiting' && room.isPublic && room.stake === stake && room.players.length === 1) {
      targetRoom = room;
      break;
    }
  }

  if (targetRoom) {
    const result = await joinRoom(ws, targetRoom.roomId, decoded.id, username, stake);
    if (!result.success) {
      safeSend(ws, JSON.stringify({ type: 'error', message: result.error || 'Failed to join.' }));
    }
    return;
  }

  // No existing room — add to matching queue
  const queued = await addToQueue(ws, decoded.id, username, stake);
  if (!queued) {
    safeSend(ws, JSON.stringify({ type: 'error', message: 'Queue is full. Try again later.' }));
    return;
  }
  safeSend(ws, JSON.stringify({ type: 'searching', stake, queueSize: 1 }));

  // Try to match immediately
  const match = await tryMatch(stake);
  if (match) {
    const { first, second } = match;
    const code = `qm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const roomId = `room_${code}`;
    const room = getOrCreateRoom(roomId, `Quick Match $${stake}`, stake);
    room.roomCode = code;
    room.isPublic = true;
    room.createdAt = Date.now();

    // Join both players
    const r1 = await joinRoom(first.ws, roomId, first.userId, first.username, stake);
    const r2 = await joinRoom(second.ws, roomId, second.userId, second.username, stake);

    if (!r1.success || !r2.success) {
      // If one failed, refund both and clean up
      cleanupRoom(roomId);
      if (!r1.success) safeSend(first.ws, JSON.stringify({ type: 'error', message: r1.error }));
      if (!r2.success) safeSend(second.ws, JSON.stringify({ type: 'error', message: r2.error }));
    }
  }
}

// ── Join by Code ─────────────────────────────────────────────
export async function handleJoinByCode(ws: WebSocket, msg: Extract<SocketMessage, { type: 'join_by_code' }>): Promise<void> {
  const { code, username, token } = msg;
  if (!token) { safeSend(ws, JSON.stringify({ type: 'error', message: 'Authentication required.' })); return; }
  const decoded = decodeToken(token);
  if (!decoded) { safeSend(ws, JSON.stringify({ type: 'error', message: 'Invalid token.' })); return; }
  if (!enforceSingleSocket(decoded.id, ws)) return;

  const result = await joinRoomByCode(ws, code, decoded.id, username);
  if (!result.success) {
    safeSend(ws, JSON.stringify({ type: 'room_not_found', message: result.error || `No room found with code: ${code}` }));
  }
}

// ── List Public Rooms ────────────────────────────────────────
export function handleListRooms(ws: WebSocket, msg: Extract<SocketMessage, { type: 'list_rooms' }>): void {
  const rooms = getPublicRooms(msg.stake);
  safeSend(ws, JSON.stringify({ type: 'rooms_list', rooms }));
}

// ── Cancel Waiting ───────────────────────────────────────────
export async function handleCancelWaiting(ws: WebSocket): Promise<void> {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) {
    // Maybe in queue but not in a room yet
    await removeFromQueue(ws);
    safeSend(ws, JSON.stringify({ type: 'cancel_waiting_confirmed', playerId: undefined }));
    return;
  }

  const result = await cancelWaiting(ws, mapping.playerId);
  if (result.success) {
    safeSend(ws, JSON.stringify({ type: 'cancel_waiting_confirmed', playerId: mapping.playerId }));
  } else {
    safeSend(ws, JSON.stringify({ type: 'error', message: result.reason || 'Failed to cancel.' }));
  }
}

// ── Set AI Opponent (PvP rooms with stake > 0) ──────────────
export async function handleSetAiOpponent(ws: WebSocket, msg: Extract<SocketMessage, { type: 'set_ai_opponent' }>): Promise<void> {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return;
  const { roomId } = mapping;
  const room = activeRooms.get(roomId);
  if (!room || room.players.length !== 1) { safeSend(ws, JSON.stringify({ type: 'error', message: 'Invalid room state to add AI opponent.' })); return; }
  if (room.status !== 'waiting') { safeSend(ws, JSON.stringify({ type: 'error', message: 'Can only add AI in waiting state.' })); return; }

  const humanPlayer = room.players[0];
  const diffLevel = msg.difficulty || 'medium';
  room.aiDifficulty = diffLevel;
  room.commissionRate = 0.05;

  const userWallet = await ensureLaravelUser(humanPlayer.username);
  if (Number(userWallet.balance) < room.stake) {
    pushRoomLog(room, `AI match blocked: ${userWallet.username} has insufficient balance for a $${room.stake} stake.`);
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

  const escrowResult = await lockRoomEscrow(room, 'AUTO escrow lock (AI match)', {
    roomName: room.name, player1Id: userWallet.id, player2Id: aiWallet.id, stake: room.stake, difficulty: diffLevel
  });

  if (escrowResult.success) {
    pushRoomLog(room, `🔒 ESCROW SECURED. Tx ID: ${escrowResult.escrowId}`);
    pushRoomLog(room, `Integrity Hash: ${escrowResult.escrowHash}`);
    pushRoomLog(room, `Match active! Current turn: ${room.players[0].username}.`);
  } else {
    room.players.pop();
    validateTransition(room, 'ready', 'waiting');
    room.status = 'waiting';
    pushRoomLog(room, `Balance Error: ${escrowResult.message || 'Insufficient funds.'}`);
  }
  broadcastRoom(roomId);
}

// ── Preview Aim ──────────────────────────────────────────────
export function handlePreviewAim(ws: WebSocket, msg: Extract<SocketMessage, { type: 'preview_aim' }>): void {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return;
  const { roomId, playerId } = mapping;
  const room = activeRooms.get(roomId);
  if (!room || room.status !== 'playing') return;
  if (animatingRoomIds.has(roomId)) return;
  // Only relay current turn holder's aim to prevent cue leak
  if (room.currentTurn !== playerId) return;
  for (const client of clientsByRoom.get(roomId) || []) {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      safeSend(client, JSON.stringify({ type: 'preview_aim', angle: msg.angle, power: msg.power, spinX: msg.spinX, spinY: msg.spinY }));
    }
  }
}

// ── Shoot ────────────────────────────────────────────────────
export async function handleShoot(ws: WebSocket, msg: Extract<SocketMessage, { type: 'shoot' }>): Promise<void> {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return;
  const { roomId, playerId } = mapping;
  const room = activeRooms.get(roomId);
  if (!room || room.status !== 'playing') { safeSend(ws, JSON.stringify({ type: 'error', message: 'Shot invalid: Game not in play state.' })); return; }
  if (room.currentTurn !== playerId) { safeSend(ws, JSON.stringify({ type: 'error', message: 'Cheat safeguard: Not your active turn!' })); return; }
  if (animatingRoomIds.has(roomId)) { safeSend(ws, JSON.stringify({ type: 'error', message: 'Shot ignored — room is still animating.' })); return; }
  if (room.disconnectedPlayerIds?.includes(playerId)) { safeSend(ws, JSON.stringify({ type: 'error', message: 'Cannot shoot while disconnected.' })); return; }
  if (room.scratchOccurred) { safeSend(ws, JSON.stringify({ type: 'error', message: 'Must reset cue ball before shooting (ball-in-hand).' })); return; }

  const objectBallsLeft = room.balls.filter(b => b.id !== 0 && !b.isPocketed).length;
  const isBreakShot = objectBallsLeft === 15;
  animatingRoomIds.add(roomId);

  const shooterName = room.players.find(p => p.id === playerId)?.username || 'Unknown';
  if (!isFinite(msg.power) || msg.power < 0 || msg.power > 100) { safeSend(ws, JSON.stringify({ type: 'error', message: 'Invalid shot power.' })); animatingRoomIds.delete(roomId); return; }
  if (!isFinite(msg.angle)) { safeSend(ws, JSON.stringify({ type: 'error', message: 'Invalid shot angle.' })); animatingRoomIds.delete(roomId); return; }

  const clampedAngle = ((msg.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const clampedPower = Math.max(0, Math.min(100, msg.power));
  room.animVersion = (room.animVersion || 0) + 1;
  const currentAnimVersion = room.animVersion;

  pushRoomLog(room, isBreakShot
    ? `💥 ${shooterName} executes the BREAK SHOT!`
    : `${shooterName} shoots with Power: ${Math.round(clampedPower)}%`);

  // ── WAKE ALL BALLS ──────────────────────────────────
  // A new shot can hit ANY stationary ball. Waking them all
  // ensures they participate in collisions and friction.
  wakeAllForShot(room.balls);

  const cueBall = room.balls[0];
  cueBall.spinX = Math.max(-1, Math.min(1, msg.spinX || 0));
  cueBall.spinY = Math.max(-1, Math.min(1, msg.spinY || 0));

  const forceMag = powerToVelocity(clampedPower);
  cueBall.vx = Math.cos(clampedAngle) * forceMag;
  cueBall.vy = Math.sin(clampedAngle) * forceMag;

  const frames: Array<{ id: number; x: number; y: number; isPocketed: boolean }[]> = [captureFrame(room.balls)];
  let iterations = 0;
  const maxStepsLimit = 1200;
  const ballsPocketedThisShot: number[] = [];
  let cueBallPocketed = false;
  const contactTracker = { firstContactBallId: null as number | null, cushionContactOccurred: false };
  let lastCapturePositions = room.balls.map(b => ({ x: b.x, y: b.y }));
  const MOVEMENT_THRESHOLD_SQ = 4;
  let framesSinceLastCapture = 0;

  resetYieldTimer();

  while (iterations < maxStepsLimit) {
    const preStates = room.balls.map(b => ({ id: b.id, isPocketed: b.isPocketed }));
    simulatePhysicsStep(room.balls, contactTracker);
    await yieldIfNeeded();
    let pocketedThisStep = false;
    for (let i = 0; i < room.balls.length; i++) {
      const cb = room.balls[i], pb = preStates.find(s => s.id === cb.id);
      if (pb && cb.isPocketed && !pb.isPocketed) {
        pocketedThisStep = true;
        if (cb.id === 0) cueBallPocketed = true;
        else ballsPocketedThisShot.push(cb.id);
      }
    }
    const collidedThisStep = contactTracker.firstContactBallId !== null && iterations < 5;
    let significantMovement = framesSinceLastCapture >= 3;
    if (!significantMovement) {
      const maxDeltaSq = Math.max(...room.balls.map((b, i) => {
        const dx = b.x - lastCapturePositions[i].x, dy = b.y - lastCapturePositions[i].y;
        return dx * dx + dy * dy;
      }));
      significantMovement = maxDeltaSq > MOVEMENT_THRESHOLD_SQ;
    }
    if (pocketedThisStep || significantMovement || collidedThisStep) {
      frames.push(captureFrame(room.balls));
      lastCapturePositions = room.balls.map(b => ({ x: b.x, y: b.y }));
      framesSinceLastCapture = 0;
    } else framesSinceLastCapture++;
    iterations++;
    if (!isAnyBallMoving(room.balls)) break;
  }
  if (framesSinceLastCapture > 0 || frames.length === 0) frames.push(captureFrame(room.balls));
  forceSettleBalls(room.balls);

  const compactFrames = frames.map(f => f.map(b => [b.id, b.x, b.y, b.isPocketed ? 1 : 0]));
  const payload = JSON.stringify({ type: 'physics_frames', frames: compactFrames, totalSteps: iterations });
  for (const client of clientsByRoom.get(roomId) || []) {
    safeSend(client, payload);
  }

  const totalSteps = iterations;
  const animationDurationMs = (totalSteps * 16.66) / (totalSteps > 350 ? 2.4 : 2.0) + 80;

  const timer = setTimeout(() => {
    if ((room.animVersion || 0) !== currentAnimVersion || room.status !== 'playing') return;
    animatingRoomIds.delete(roomId);
    room.turnTimer = 60;
    evaluateShotRules(room, ballsPocketedThisShot, cueBallPocketed, contactTracker.firstContactBallId, shooterName, playerId, isBreakShot, contactTracker.cushionContactOccurred);
    broadcastRoom(roomId);
    if (room.status === 'playing' && room.currentTurn !== 'ai-bot') {
      const turnPlayer = room.players.find(p => p.id === room.currentTurn);
      if (turnPlayer) sendPushNotification(turnPlayer.id, '🎱 Your turn!', `It's your shot in ${room.name}.`, '/');
    }
    if (room.status === 'playing' && room.currentTurn === 'ai-bot') triggerAiShot(room);
  }, animationDurationMs);
  registerRoomTimeout(roomId, timer);
}

// ── Reset Cue Ball ───────────────────────────────────────────
export function handleResetCueBall(ws: WebSocket, msg: Extract<SocketMessage, { type: 'reset_cue_ball' }>): void {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return;
  const { roomId, playerId } = mapping;
  const room = activeRooms.get(roomId);
  if (!room || room.status !== 'playing' || room.currentTurn !== playerId || !room.scratchOccurred) return;

  const minX = CUSHION + BALL_R + 2, maxX = TABLE_W - CUSHION - BALL_R - 2;
  const minY = CUSHION + BALL_R + 2, maxY = TABLE_H - CUSHION - BALL_R - 2;
  const targetX = Math.max(minX, Math.min(msg.x, maxX)), targetY = Math.max(minY, Math.min(msg.y, maxY));

  if (room.ballInHandRestriction === 'behind_head_string' && targetX > HEAD_STRING_X - BALL_R) {
    safeSend(ws, JSON.stringify({ type: 'error', message: 'Invalid placement: ball must be behind the head string.' }));
    return;
  }

  if (room.balls.some(b => b.id !== 0 && !b.isPocketed && Math.hypot(targetX - b.x, targetY - b.y) < BALL_R * 2)) {
    safeSend(ws, JSON.stringify({ type: 'error', message: 'Invalid placement: cannot place over another ball.' }));
    return;
  }

  const cb = room.balls[0];
  cb.x = targetX; cb.y = targetY; cb.isPocketed = false; cb.vx = 0; cb.vy = 0;
  room.scratchOccurred = false;
  room.ballInHandRestriction = undefined;
  broadcastRoom(roomId);
}

// ── Chat ─────────────────────────────────────────────────────
const chatCooldowns = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [playerId, timestamp] of chatCooldowns.entries()) {
    if (now - timestamp > 5000) {
      chatCooldowns.delete(playerId);
    }
  }
}, 60000);

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
  if (now - (chatCooldowns.get(playerId) || 0) < 1000) {
    safeSend(ws, JSON.stringify({ type: 'error', message: 'Please wait before sending another message.' }));
    return;
  }
  chatCooldowns.set(playerId, now);
  pushRoomLog(room, `[Chat] ${sender}: ${message}`);
  broadcastRoom(roomId);
}

// ── Rematch ──────────────────────────────────────────────────
export function handleRematch(ws: WebSocket): void {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return;
  const { roomId, playerId } = mapping;

  // Use withRoomLock for atomic rematch
  withRoomLock(roomId, async () => {
    try {
      const room = activeRooms.get(roomId);
      if (!room || room.status !== 'gameover') return;
      if (rematchingRooms.has(roomId)) {
        safeSend(ws, JSON.stringify({ type: 'error', message: 'Rematch already in progress.' }));
        return;
      }

      const requester = room.players.find(p => p.id === playerId);
      if (!requester) return;

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

      if (!validateTransition(room, 'gameover', 'ready')) { rematchingRooms.delete(roomId); return; }
      room.status = 'ready';
      room.log = [`🔄 Rematch initiated by ${requester.username}!`];
      pushRoomLog(room, 'Match reset. Re-locking stakes in escrow...');
      broadcastRoom(roomId);

      const escrowResult = await lockRoomEscrow(room, 'AUTO escrow lock (rematch)', {
        roomName: room.name, player1Id: room.players[0]?.id, player2Id: room.players[1]?.id, stake: room.stake
      });

      if (escrowResult.success) {
        pushRoomLog(room, 'New break shot incoming!');
      } else {
        validateTransition(room, 'ready', 'gameover');
        room.status = 'gameover';
        pushRoomLog(room, `Rematch escrow failed: ${escrowResult.message}. Match cancelled.`);
      }
      rematchingRooms.delete(roomId);
      broadcastRoom(roomId);
    } catch (err) {
      console.error('Rematch error:', err);
      rematchingRooms.delete(roomId);
    }
  }).catch((err) => {
    console.error('Rematch lock error:', err);
  });
}

// ── Reconnect ────────────────────────────────────────────────
export async function handleReconnect(ws: WebSocket, msg: Extract<SocketMessage, { type: 'reconnect' }>): Promise<void> {
  const decoded = decodeToken(msg.token);
  if (!decoded) { safeSend(ws, JSON.stringify({ type: 'error', message: 'Invalid token for reconnection.' })); return; }
  if (!enforceSingleSocket(decoded.id, ws, false)) return;

  // First pass: scan activeRooms (rooms already in memory)
  for (const [roomId, room] of activeRooms) {
    if (room.status !== 'playing' && room.status !== 'ready') continue;
    if (!room.disconnectedPlayerIds?.includes(decoded.id)) continue;

    cancelForfeitTimer(roomId);

    const player = room.players.find(p => p.id === decoded.id);
    if (!player) { safeSend(ws, JSON.stringify({ type: 'error', message: 'Player record not found.' })); return; }

    // enforceSingleSocket already cleaned up old socket if needed

    if (!clientsByRoom.has(roomId)) clientsByRoom.set(roomId, new Set());
    clientsByRoom.get(roomId)!.add(ws);
    playerRoomMap.set(ws, { roomId, playerId: decoded.id });
    player.isConnected = true;
    room.disconnectedPlayerIds = room.disconnectedPlayerIds!.filter(id => id !== decoded.id);
    delete room.reconnectDeadlines?.[decoded.id];
    if (!room.disconnectedPlayerIds.length) cancelForfeitTimer(roomId);

    sendFullState(ws, roomId);
    for (const client of clientsByRoom.get(roomId) || []) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        safeSend(client, JSON.stringify({ type: 'reconnect_notice', playerId: decoded.id }));
      }
    }
    broadcastRoom(roomId);
    pushEventLog('reconnect_complete', { roomId, playerId: decoded.id });
    return;
  }

  // Second pass: check roomIndex for rooms not in memory (e.g., after server restart)
  for (const [roomId, meta] of roomIndex) {
    if (meta.status !== 'playing' && meta.status !== 'ready' && meta.status !== 'paused') continue;

    const room = await ensureRoomLoaded(roomId);
    if (!room) continue;
    if (!room.disconnectedPlayerIds?.includes(decoded.id)) continue;

    cancelForfeitTimer(roomId);

    const player = room.players.find(p => p.id === decoded.id);
    if (!player) { safeSend(ws, JSON.stringify({ type: 'error', message: 'Player record not found.' })); return; }

    if (!clientsByRoom.has(roomId)) clientsByRoom.set(roomId, new Set());
    clientsByRoom.get(roomId)!.add(ws);
    playerRoomMap.set(ws, { roomId, playerId: decoded.id });
    player.isConnected = true;
    room.disconnectedPlayerIds = room.disconnectedPlayerIds!.filter(id => id !== decoded.id);
    delete room.reconnectDeadlines?.[decoded.id];
    if (!room.disconnectedPlayerIds.length) cancelForfeitTimer(roomId);

    // Resume from paused state
    if (room.status === 'paused') {
      room.status = 'playing';
      room.lastActiveAt = Date.now();
    }

    sendFullState(ws, roomId);
    for (const client of clientsByRoom.get(roomId) || []) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        safeSend(client, JSON.stringify({ type: 'reconnect_notice', playerId: decoded.id }));
      }
    }
    broadcastRoom(roomId);
    pushEventLog('reconnect_complete', { roomId, playerId: decoded.id });
    return;
  }

  safeSend(ws, JSON.stringify({ type: 'error', message: 'No active disconnection found for rejoin.' }));
}

// ── Disconnect ───────────────────────────────────────────────
export async function handleDisconnect(ws: WebSocket): Promise<void> {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) {
    await removeFromQueue(ws);
    activeSockets.delete(ws);
    return;
  }

  const { roomId, playerId } = mapping;
  playerRoomMap.delete(ws);
  removeUserSocket(playerId, ws);
  const room = activeRooms.get(roomId);
  if (!room) { activeSockets.delete(ws); return; }

  const pIdx = room.players.findIndex(p => p.id === playerId);
  if (pIdx === -1) {
    const set = clientsByRoom.get(roomId);
    if (set) { set.delete(ws); if (set.size === 0) { activeRooms.delete(roomId); clientsByRoom.delete(roomId); } }
    activeSockets.delete(ws);
    return;
  }

  const quittingPlayer = room.players[pIdx];
  quittingPlayer.isConnected = false;
  pushRoomLog(room, `⚠ ${quittingPlayer.username} disconnected.`);

  if (!room.disconnectedPlayerIds) room.disconnectedPlayerIds = [];
  if (!room.reconnectDeadlines) room.reconnectDeadlines = {};
  if (!room.disconnectedPlayerIds.includes(playerId)) room.disconnectedPlayerIds.push(playerId);
  room.reconnectDeadlines[playerId] = Date.now() + DISCONNECT_TIMEOUT_MS;
  pushEventLog('player_disconnected', { roomId, playerId, username: quittingPlayer.username, status: room.status });

  if (room.status === 'playing') {
    const remainingPlayers = room.players.filter(p => p.id !== playerId && p.isConnected);
    const notice = JSON.stringify({ type: 'disconnect_notice', playerId, deadline: room.reconnectDeadlines[playerId] });
    for (const client of clientsByRoom.get(roomId) || []) {
      if (client.readyState === WebSocket.OPEN) safeSend(client, notice);
    }
    broadcastRoom(roomId);

    const forfeitFn = () => {
      const freshRoom = activeRooms.get(roomId);
      if (!freshRoom || freshRoom.status !== 'playing') return;
      if (!freshRoom.disconnectedPlayerIds || freshRoom.disconnectedPlayerIds.length === 0) return;
      if (freshRoom.disconnectedPlayerIds.length >= 2) {
        pushRoomLog(freshRoom, '⏰ Both players disconnected. Match voided.');
        if (validateTransition(freshRoom, 'playing', 'gameover')) { freshRoom.status = 'gameover'; freshRoom.winnerId = undefined; }
      } else {
        freshRoom.disconnectedPlayerIds = [];
        freshRoom.reconnectDeadlines = {};
        const forfeitedPlayer = freshRoom.players.find(p => p.id === playerId);
        const winner = freshRoom.players.find(p => p.id !== playerId && p.isConnected);
        if (winner && forfeitedPlayer) {
          freshRoom.forfeitedPlayerId = forfeitedPlayer.id;
          concludeMatch(freshRoom, winner, forfeitedPlayer, `${winner.username} wins by forfeit! (Opponent failed to reconnect)`);
        }
      }
      broadcastRoom(roomId);
    };

    if (remainingPlayers.length === 0) {
      pushRoomLog(room, `⏳ All players disconnected. Waiting ${Math.round(DISCONNECT_TIMEOUT_MS / 1000)}s...`);
      startForfeitTimer(roomId, forfeitFn);
    } else {
      pushRoomLog(room, `⏳ ${remainingPlayers[0].username}, opponent disconnected. Waiting ${Math.round(DISCONNECT_TIMEOUT_MS / 1000)}s...`);
      startForfeitTimer(roomId, () => {
        const freshRoom = activeRooms.get(roomId);
        if (!freshRoom || freshRoom.status !== 'playing') return;
        if (freshRoom.disconnectedPlayerIds?.length >= 2) {
          pushRoomLog(freshRoom, '⏰ Both players disconnected. Match voided.');
          if (validateTransition(freshRoom, 'playing', 'gameover')) { freshRoom.status = 'gameover'; freshRoom.winnerId = undefined; }
          broadcastRoom(roomId);
          return;
        }
        forfeitFn();
      });
    }
  } else if (room.status === 'ready') {
    pushRoomLog(room, `${quittingPlayer.username} left before match started.`);
    room.players.splice(pIdx, 1);
    if (validateTransition(room, 'ready', 'waiting')) room.status = 'waiting';
    room.currentTurn = '';
    room.disconnectedPlayerIds = [];
    room.reconnectDeadlines = {};
    const set = clientsByRoom.get(roomId);
    if (set) { set.delete(ws); if (set.size === 0) cleanupRoom(roomId); else broadcastRoom(roomId); }
    else cleanupRoom(roomId);
    activeSockets.delete(ws);
    return;
  } else {
    room.players.splice(pIdx, 1);
    const set = clientsByRoom.get(roomId);
    if (set) { set.delete(ws); if (set.size === 0) cleanupRoom(roomId); else broadcastRoom(roomId); }
  }
  activeSockets.delete(ws);
}
