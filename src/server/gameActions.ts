import crypto from 'crypto';
import { WebSocket } from 'ws';
import { RoomState, Player, SocketMessage } from '../types';
import { TABLE_W, TABLE_H, CUSHION, BALL_R, HEAD_STRING_X, getInitialBalls, simulatePhysicsStep, powerToVelocity, isAnyBallMoving, captureFrame } from './physics';
import { activeRooms, animatingRoomIds, clientsByRoom, playerRoomMap, getOrCreateRoom, broadcastRoom, pushRoomLog } from './state';
import { evaluateShotRules, triggerAiShot, concludeMatch } from './gameLogic';
import { ensureLaravelUser, createPlayerFromUser, ensureMinimumBalance, getAiUser, createAiPlayer, lockRoomEscrow } from './room';

export async function handleJoin(ws: WebSocket, msg: Extract<SocketMessage, { type: 'join' }>): Promise<void> {
  const { roomId, username, stake } = msg;
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

  const player = createPlayerFromUser(walletUser, stake);
  room.players.push(player);
  pushRoomLog(room, `${username} entered table. Stake: $${stake}`);

  if (room.players.length === 2 && room.status === 'waiting') {
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
      room.status = 'waiting';
      ws.send(JSON.stringify({ type: 'error', message: escrowResult.message || 'Unable to lock stakes for this table.' }));
      broadcastRoom(roomId);
    }
  }

  broadcastRoom(roomId);
}

export async function handleSetAiOpponent(ws: WebSocket, msg: Extract<SocketMessage, { type: 'set_ai_opponent' }>): Promise<void> {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return;
  const { roomId } = mapping;
  const room = activeRooms.get(roomId);
  // Ensure room exists and there's exactly one player (the human player) before adding AI
  if (!room || room.players.length !== 1) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid room state to add AI opponent.' }));
    return;
  }

  const humanPlayer = room.players[0]; // The human player should always be the first in an AI match
  const diffLevel = msg.difficulty || 'medium';
  room.aiDifficulty = diffLevel;
  room.commissionRate = 0.05;

  const userWallet = await ensureLaravelUser(humanPlayer.username);
  if (userWallet.balance < room.stake) {
    pushRoomLog(room, `AI match blocked: ${userWallet.username} has insufficient balance for a $${room.stake} stake.`);
    room.status = 'waiting';
    broadcastRoom(roomId);
    return;
  }

  humanPlayer.walletBalance = userWallet.balance;

  const aiWallet = await getAiUser();
  await ensureMinimumBalance(aiWallet.id, 10000.0);

  const aiPlayer = createAiPlayer(diffLevel, room.stake);
  room.players.push(aiPlayer);
  pushRoomLog(room, `AI Opponent (${diffLevel.toUpperCase()} Bot) has accepted the stakes!`);
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
    room.status = 'waiting';
    pushRoomLog(room, `Balance Error: ${escrowResult.message || 'Your wallet does not have enough funds to play against the AI.'}`);
  }

  broadcastRoom(roomId);
}

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
  const objectBallsLeft = room.balls.filter(b => b.id !== 0 && !b.isPocketed).length;
  const isBreakShot = objectBallsLeft === 15;
  animatingRoomIds.add(roomId);

  const shooterName = room.players.find(p => p.id === playerId)?.username || 'Unknown';

  // ── Input Validation (C3: Anti-cheat) ──
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

  // Increment animation version to invalidate stale timeouts (M5)
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

  // ── Force to velocity using shared formula ──
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

  // إرسال مضغوط: مصفوفات [id, x, y, isPocketed] بدلاً من كائنات لتقليل حجم JSON
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

  setTimeout(() => {
    // Stale animation check (M5): ignore if a newer shot was taken
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
}

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

export function handleChat(ws: WebSocket, msg: Extract<SocketMessage, { type: 'chat' }>): void {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return;
  const { roomId } = mapping;
  const room = activeRooms.get(roomId);
  if (!room) return;

  const playerId = mapping.playerId;
  const sender = room.players.find(p => p.id === playerId)?.username || 'Spectator';
  pushRoomLog(room, `[Chat] ${sender}: ${msg.message}`);
  broadcastRoom(roomId);
}

export function handleRematch(ws: WebSocket): void {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return;
  const { roomId, playerId } = mapping;
  const room = activeRooms.get(roomId);
  if (!room || room.status !== 'gameover') return;

  const requester = room.players.find(p => p.id === playerId);
  if (!requester) return;

  room.balls = getInitialBalls();
  room.players.forEach(p => { p.side = undefined; });
  room.assignedSides = false;
  room.scratchOccurred = false;
  room.pocketedThisTurn = false;
  room.ballInHandRestriction = undefined;
  room.status = 'playing';
  room.currentTurn = room.players[0]?.id || playerId;
  room.winnerId = undefined;
  room.turnTimer = 60;
  room.animVersion = (room.animVersion || 0) + 1;
  room.serverSeed = crypto.randomBytes(32).toString('hex');
  room.escrowHash = crypto.createHash('sha256').update(room.serverSeed).digest('hex');
  room.log = [`🔄 Rematch initiated by ${requester.username}!`];
  pushRoomLog(room, 'Match reset. New break shot incoming!');
  broadcastRoom(roomId);
}

export function handleDisconnect(ws: WebSocket): void {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return;

  const { roomId, playerId } = mapping;
  playerRoomMap.delete(ws);

  const room = activeRooms.get(roomId);
  if (!room) return;

  const pIdx = room.players.findIndex(p => p.id === playerId);
  if (pIdx !== -1) {
    const quittingPlayer = room.players[pIdx];
    pushRoomLog(room, `Disconnect Alert: ${quittingPlayer.username} left the server.`);

    if (room.status === 'playing') {
      const remainingPlayer = room.players.find(p => p.id !== playerId);
      if (remainingPlayer) {
        concludeMatch(room, remainingPlayer, quittingPlayer, `${remainingPlayer.username} wins by forfeit! (Opponent disconnected)`);
      }
    }

    room.players.splice(pIdx, 1);
  }

  const set = clientsByRoom.get(roomId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) {
      activeRooms.delete(roomId);
      clientsByRoom.delete(roomId);
    } else {
      broadcastRoom(roomId);
    }
  }
}
