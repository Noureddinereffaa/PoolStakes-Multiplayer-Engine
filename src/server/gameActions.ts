import { WebSocket } from 'ws';
import { RoomState, Player, SocketMessage } from '../types';
import { TABLE_W, TABLE_H, CUSHION, BALL_R, HEAD_STRING_X, simulatePhysicsStep } from './physics';
import { activeRooms, animatingRoomIds, clientsByRoom, playerRoomMap, getOrCreateRoom, broadcastRoom } from './state';
import { evaluateShotRules, triggerAiShot, concludeMatch } from './gameLogic';
import { ensureLaravelUser, createPlayerFromUser, ensureMinimumBalance, getAiUser, createAiPlayer, lockRoomEscrow } from './room';

export async function handleJoin(ws: WebSocket, msg: Extract<SocketMessage, { type: 'join' }>) {
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
  room.log.push(`${username} entered table. Stake: $${stake}`);

  if (room.players.length === 2 && room.status === 'waiting') {
    room.status = 'ready';
    room.log.push('Players joined! Validating and locking stakes in secure Laravel wallet escrow...');

    const escrowResult = await lockRoomEscrow(room, 'AUTO /api/laravel/escrow/lock', {
      roomName: room.name,
      player1Id: room.players[0].id,
      player2Id: room.players[1].id,
      stake: room.stake
    });

    if (escrowResult.success) {
      room.log.push(`Current turn: ${room.players[0].username} (Shooter). Aim at cue ball.`);
    } else {
      room.log.push(`Escrow validation failed: ${escrowResult.message || 'Insufficient wallet funds.'}`);
      room.players.pop();
      room.status = 'waiting';
      ws.send(JSON.stringify({ type: 'error', message: escrowResult.message || 'Unable to lock stakes for this table.' }));
    }
  }

  broadcastRoom(roomId);
}

export async function handleSetAiOpponent(ws: WebSocket, msg: Extract<SocketMessage, { type: 'set_ai_opponent' }>) {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return;
  const { roomId } = mapping;
  const room = activeRooms.get(roomId);
  if (!room || room.players.length !== 1) return;

  const diffLevel = msg.difficulty || 'medium';
  room.aiDifficulty = diffLevel;
  room.commissionRate = 0.05;

  const userWallet = await ensureLaravelUser(room.players[0].username);
  if (userWallet.balance < room.stake) {
    room.log.push(`AI match blocked: ${userWallet.username} has insufficient balance for a $${room.stake} stake.`);
    room.status = 'waiting';
    broadcastRoom(roomId);
    return;
  }

  room.players[0].walletBalance = userWallet.balance;

  const aiWallet = await getAiUser();
  await ensureMinimumBalance(aiWallet.id, 10000.0);

  const aiPlayer = createAiPlayer(diffLevel, room.stake);
  room.players.push(aiPlayer);
  room.log.push(`AI Opponent (${diffLevel.toUpperCase()} Bot) has accepted the stakes!`);
  room.status = 'ready';

  const escrowResult = await lockRoomEscrow(room, 'AUTO /api/laravel/escrow/lock (AI match)', {
    roomName: room.name,
    player1Id: userWallet.id,
    player2Id: aiWallet.id,
    stake: room.stake,
    difficulty: diffLevel
  });

  if (escrowResult.success) {
    room.log.push(`🔒 ESCROW SECURED: Verified by peer-signing. Tx ID: ${escrowResult.escrowId}`);
    room.log.push(`🛡️ Integrity Hash: ${escrowResult.escrowHash}`);
    room.log.push(`Match active! Current turn: ${room.players[0].username}. Let the high-stakes game begin!`);
  } else {
    room.players.pop();
    room.status = 'waiting';
    room.log.push(`Balance Error: ${escrowResult.message || 'Your wallet does not have enough funds to play against the AI.'}`);
  }

  broadcastRoom(roomId);
}

export function handlePreviewAim(ws: WebSocket, msg: Extract<SocketMessage, { type: 'preview_aim' }>) {
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

export function handleShoot(ws: WebSocket, msg: Extract<SocketMessage, { type: 'shoot' }>) {
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

  const objectBallsLeft = room.balls.filter(b => b.id !== 0 && !b.isPocketed).length;
  const isBreakShot = objectBallsLeft === 15;
  animatingRoomIds.add(roomId);

  const shooterName = room.players.find(p => p.id === playerId)?.username || 'Unknown';
  room.log.push(`${shooterName} triggers a shot with Power: ${Math.round(msg.power)}% at Angular Offset: ${msg.angle.toFixed(2)} rad.`);

  const cueBall = room.balls[0];
  const sX = Math.max(-1, Math.min(1, msg.spinX || 0));
  const sY = Math.max(-1, Math.min(1, msg.spinY || 0));
  cueBall.spinX = sX;
  cueBall.spinY = sY;

  const normPower = msg.power / 100;
  const powerCurve = Math.pow(normPower, 1.35);
  const forceMagnitude = powerCurve * 22;
  cueBall.vx = Math.cos(msg.angle) * forceMagnitude;
  cueBall.vy = Math.sin(msg.angle) * forceMagnitude;

  const frames: Array<{ id: number; x: number; y: number; isPocketed: boolean }[]> = [];
  frames.push(room.balls.map(b => ({ id: b.id, x: b.x, y: b.y, isPocketed: b.isPocketed })));

  let iterations = 0;
  let anyBallMoving = true;
  const maxStepsLimit = 1200;
  const ballsPocketedThisShot: number[] = [];
  let cueBallPocketed = false;
  const contactTracker = { firstContactBallId: null as number | null, cushionContactOccurred: false };

  while (anyBallMoving && iterations < maxStepsLimit) {
    const preStates = room.balls.map(b => ({ id: b.id, isPocketed: b.isPocketed }));
    simulatePhysicsStep(room.balls, 0.995, 0.92, contactTracker);

    for (let i = 0; i < room.balls.length; i++) {
      const currentB = room.balls[i];
      const preB = preStates.find(item => item.id === currentB.id)!;
      if (currentB.isPocketed && !preB.isPocketed) {
        if (currentB.id === 0) {
          cueBallPocketed = true;
        } else {
          ballsPocketedThisShot.push(currentB.id);
        }
      }
    }

    anyBallMoving = room.balls.some(b => !b.isPocketed && (Math.abs(b.vx) > 0.05 || Math.abs(b.vy) > 0.05));
    frames.push(room.balls.map(b => ({ id: b.id, x: b.x, y: b.y, isPocketed: b.isPocketed })));
    iterations++;
  }

  const framePayload = JSON.stringify({ type: 'physics_frames', frames });
  const roomWssSet = clientsByRoom.get(roomId) || [];
  for (const client of roomWssSet) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(framePayload);
    }
  }

  const basePlayMultiplier = frames.length > 350 ? 1.95 : 1.65;
  const animationDurationMs = (frames.length * 16.66) / basePlayMultiplier + 150;

  setTimeout(() => {
    animatingRoomIds.delete(roomId);
    room.turnTimer = 60;
    evaluateShotRules(room, ballsPocketedThisShot, cueBallPocketed, contactTracker.firstContactBallId, shooterName, playerId, isBreakShot, contactTracker.cushionContactOccurred);
    broadcastRoom(roomId);

    if (room.status === 'playing' && room.currentTurn === 'ai-bot') {
      triggerAiShot(room);
    }
  }, animationDurationMs);
}

export function handleResetCueBall(ws: WebSocket, msg: Extract<SocketMessage, { type: 'reset_cue_ball' }>) {
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
      room.log.push(`Invalid head-string placement attempted by ${room.players.find(p => p.id === playerId)?.username}.`);
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
    room.log.push(`Invalid cue ball placement attempted by ${room.players.find(p => p.id === playerId)?.username}. Choose a clear spot.`);
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
  room.log.push(`${room.players.find(p => p.id === playerId)?.username} placed the cue ball at a valid location.`);
  broadcastRoom(roomId);
}

export function handleChat(ws: WebSocket, msg: Extract<SocketMessage, { type: 'chat' }>) {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return;
  const { roomId } = mapping;
  const room = activeRooms.get(roomId);
  if (!room) return;

  const playerId = mapping.playerId;
  const sender = room.players.find(p => p.id === playerId)?.username || 'Spectator';
  room.log.push(`[Chat] ${sender}: ${msg.message}`);
  broadcastRoom(roomId);
}

export function handleDisconnect(ws: WebSocket) {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return;

  const { roomId, playerId } = mapping;
  playerRoomMap.delete(ws);

  const room = activeRooms.get(roomId);
  if (!room) return;

  const pIdx = room.players.findIndex(p => p.id === playerId);
  if (pIdx !== -1) {
    const quittingPlayer = room.players[pIdx];
    room.log.push(`Disconnect Alert: ${quittingPlayer.username} left the server.`);

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
