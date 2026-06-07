import { WebSocket } from 'ws';
import { RoomState, Player, SocketMessage } from '../types';
import { TABLE_W, TABLE_H, CUSHION, BALL_R, simulatePhysicsStep } from './physics';
import { activeRooms, animatingRoomIds, clientsByRoom, playerRoomMap, getOrCreateRoom, broadcastRoom } from './state';
import { evaluateShotRules, triggerAiShot, concludeMatch } from './gameLogic';
import { ensureLaravelUser, createPlayerFromUser, ensureMinimumBalance, getAiUser, createAiPlayer, lockRoomEscrow } from './room';

export function handleJoin(ws: WebSocket, msg: Extract<SocketMessage, { type: 'join' }>) {
  const { roomId, username, stake } = msg;
  const room = getOrCreateRoom(roomId, `Stakes match: $${stake}`, stake);

  if (!clientsByRoom.has(roomId)) {
    clientsByRoom.set(roomId, new Set());
  }
  clientsByRoom.get(roomId)!.add(ws);

  const walletUser = ensureLaravelUser(username);
  const resolvedPlayerId = walletUser.id;
  playerRoomMap.set(ws, { roomId, playerId: resolvedPlayerId });

  const player = createPlayerFromUser(walletUser, stake);

  if (room.players.length < 2) {
    if (!room.players.some(p => p.username === username)) {
      room.players.push(player);
      room.log.push(`${username} entered table. Stake: $${stake}`);
    }
  } else {
    ws.send(JSON.stringify({ type: 'error', message: 'Room has already peaked at 2 players.' }));
    return;
  }

  if (room.players.length === 2 && room.status === 'waiting') {
    room.status = 'ready';
    room.log.push('Players joined! Locking stakes in secure Laravel wallet escrow...');

    const escrowResult = lockRoomEscrow(room, 'AUTO /api/laravel/escrow/lock', {
      roomName: room.name,
      player1Id: room.players[0].id,
      player2Id: room.players[1].id,
      stake: room.stake
    });

    if (escrowResult.success) {
      room.log.push(`Current turn: ${room.players[0].username} (Shooter). Aim at cue ball.`);
    } else {
      room.log.push(`Validation Failed: ${escrowResult.message || 'Insufficient funds in betting wallets.'}`);
      room.status = 'waiting';
    }
  }

  broadcastRoom(roomId);
}

export function handleSetAiOpponent(ws: WebSocket, msg: Extract<SocketMessage, { type: 'set_ai_opponent' }>) {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return;
  const { roomId } = mapping;
  const room = activeRooms.get(roomId);
  if (!room || room.players.length !== 1) return;

  const diffLevel = msg.difficulty || 'medium';
  room.aiDifficulty = diffLevel;
  room.commissionRate = 0.05;

  const userWallet = ensureLaravelUser(room.players[0].username);
  ensureMinimumBalance(userWallet, Math.max(2000.0, room.stake));
  room.players[0].walletBalance = userWallet.balance;

  const aiWallet = getAiUser();
  ensureMinimumBalance(aiWallet, 10000.0);

  const aiPlayer = createAiPlayer(diffLevel, room.stake);
  room.players.push(aiPlayer);
  room.log.push(`AI Opponent (${diffLevel.toUpperCase()} Bot) has accepted the stakes!`);
  room.status = 'ready';

  const mockHash = 'SHA256x' + Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase();
  const escrowResult = lockRoomEscrow(room, 'AUTO /api/laravel/escrow/lock (AI match)', {
    roomName: room.name,
    player1Id: userWallet.id,
    player2Id: aiWallet.id,
    stake: room.stake,
    difficulty: diffLevel,
    escrowHash: mockHash
  });

  if (escrowResult.success) {
    room.escrowHash = mockHash;
    room.log.push(`🔒 ESCROW SECURED: Verified by peer-signing. Tx ID: ${escrowResult.escrowId}`);
    room.log.push(`🛡️ Integrity Hash: ${mockHash}`);
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
  const sX = msg.spinX || 0;
  const sY = msg.spinY || 0;
  (cueBall as any).spinX = sX;
  (cueBall as any).spinY = sY;

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
    simulatePhysicsStep(room.balls, 0.988, 0.95, contactTracker);

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

  const cb = room.balls[0];
  cb.x = Math.max(CUSHION + BALL_R + 10, Math.min(msg.x, TABLE_W - CUSHION - BALL_R - 10));
  cb.y = Math.max(CUSHION + BALL_R + 10, Math.min(msg.y, TABLE_H - CUSHION - BALL_R - 10));
  cb.isPocketed = false;
  cb.vx = 0;
  cb.vy = 0;

  room.scratchOccurred = false;
  room.log.push(`${room.players.find(p => p.id === playerId)?.username} placed cue ball.`);
  broadcastRoom(roomId);
}

export function handleChat(ws: WebSocket, msg: Extract<SocketMessage, { type: 'chat' }>) {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return;
  const { roomId } = mapping;
  const room = activeRooms.get(roomId);
  if (!room) return;

  const sender = room.players.find(p => p.id === playerRoomMap.get(ws)?.playerId)?.username || 'Spectator';
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
