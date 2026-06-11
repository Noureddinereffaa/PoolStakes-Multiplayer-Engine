import { WebSocket } from 'ws';
import { Ball, Player, Difficulty } from '../types';
import { TABLE_W, TABLE_H, CUSHION, BALL_R, HEAD_STRING_X, getInitialBalls, simulatePhysicsStep, powerToVelocity, isAnyBallMoving, captureFrame } from './physics';
import { evaluateShotRules, triggerAiShot, findValidCueBallPosition } from './gameLogic';
import { pushEventLog } from './state';

// ── Types ──────────────────────────────────────────────
export interface AiMatch {
  roomId: string;
  players: Player[];
  balls: Ball[];
  currentTurn: string;
  status: 'waiting' | 'playing' | 'gameover';
  aiDifficulty: Difficulty;
  assignedSides: boolean;
  scratchOccurred: boolean;
  pocketedThisTurn: boolean;
  ballInHandRestriction?: 'anywhere' | 'behind_head_string';
  log: string[];
  animVersion: number;
  turnTimer: number;
  winnerId?: string;
  createdAt: number;
}

// ── Isolated storage — no overlap with PvP activeRooms ──
const aiMatches = new Map<string, AiMatch>();
const aiAnimatingIds = new Set<string>();
const aiClientsByRoom = new Map<string, Set<WebSocket>>();
const aiPlayerRoomMap = new Map<WebSocket, { roomId: string; playerId: string }>();
const aiTimeouts = new Map<string, Set<NodeJS.Timeout>>();

const MAX_LOG = 50;

// ── Public helpers ─────────────────────────────────────
export function isAiPlayer(ws: WebSocket): boolean {
  return aiPlayerRoomMap.has(ws);
}

export function isAiRoom(roomId: string): boolean {
  return aiMatches.has(roomId);
}

export function getAiPlayerRoom(ws: WebSocket): { roomId: string; playerId: string } | undefined {
  return aiPlayerRoomMap.get(ws);
}

// ── Create AI match ───────────────────────────────────
export function createAiMatch(
  ws: WebSocket,
  roomId: string,
  userId: string,
  username: string,
  difficulty: Difficulty
): AiMatch {
  const match: AiMatch = {
    roomId,
    players: [
      { id: userId, username, walletBalance: 0, bettingStake: 0, isConnected: true },
      { id: 'ai-bot', username: `Bot_${difficulty.toUpperCase()}`, walletBalance: 0, bettingStake: 0, isConnected: true },
    ],
    balls: getInitialBalls(),
    currentTurn: userId,
    status: 'playing',
    aiDifficulty: difficulty,
    assignedSides: false,
    scratchOccurred: false,
    pocketedThisTurn: false,
    log: ['AI Practice Match started.'],
    animVersion: 0,
    turnTimer: 60,
    createdAt: Date.now(),
  };

  aiMatches.set(roomId, match);
  if (!aiClientsByRoom.has(roomId)) aiClientsByRoom.set(roomId, new Set());
  aiClientsByRoom.get(roomId)!.add(ws);
  aiPlayerRoomMap.set(ws, { roomId, playerId: userId });

  pushEventLog('ai_match_created', { roomId, difficulty });
  return match;
}

export function handleStartAiMatch(ws: WebSocket, msg: { difficulty?: Difficulty; token?: string; username?: string }): void {
  const diff = msg.difficulty || 'medium';
  const roomId = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const userId = `ai-player-${Date.now()}`;
  const username = msg.username || 'Player';

  const match = createAiMatch(ws, roomId, userId, username, diff);
  broadcastAiRoom(roomId);

  // If AI goes first (never — human always breaks)
  if (match.currentTurn === 'ai-bot') triggerAiShot(match as any, {
    animSet: aiAnimatingIds,
    clientsMap: aiClientsByRoom,
    broadcastFn: broadcastAiRoom,
  });
}

// ── Handle set_ai_opponent (backward compat) ──────────
export function handleSetAiOpponent(ws: WebSocket, msg: { difficulty?: Difficulty }): void {
  const mapping = aiPlayerRoomMap.get(ws);
  if (!mapping) return;
  const match = aiMatches.get(mapping.roomId);
  if (!match) return;

  match.aiDifficulty = msg.difficulty || 'medium';
  match.players[1] = {
    id: 'ai-bot',
    username: `Bot_${match.aiDifficulty.toUpperCase()}`,
    walletBalance: 0,
    bettingStake: 0,
    isConnected: true,
  };
  match.status = 'playing';
  match.currentTurn = match.players[0].id;
  match.log.push(`AI Opponent (${match.aiDifficulty.toUpperCase()}) joined.`);
  broadcastAiRoom(mapping.roomId);

  if (match.currentTurn === 'ai-bot') triggerAiShot(match as any, {
    animSet: aiAnimatingIds,
    clientsMap: aiClientsByRoom,
    broadcastFn: broadcastAiRoom,
  });
}

// ── Shoot ──────────────────────────────────────────────
export function handleAiShoot(ws: WebSocket, msg: { angle: number; power: number; spinX?: number; spinY?: number }): void {
  const mapping = aiPlayerRoomMap.get(ws);
  if (!mapping) { ws.send(JSON.stringify({ type: 'error', message: 'Not in an AI match.' })); return; }
  const match = aiMatches.get(mapping.roomId);
  if (!match || match.status !== 'playing') { ws.send(JSON.stringify({ type: 'error', message: 'Match not in play.' })); return; }
  if (match.currentTurn !== mapping.playerId) { ws.send(JSON.stringify({ type: 'error', message: 'Not your turn.' })); return; }
  if (aiAnimatingIds.has(mapping.roomId)) { ws.send(JSON.stringify({ type: 'error', message: 'Still animating.' })); return; }

  aiAnimatingIds.add(mapping.roomId);
  match.animVersion++;
  const currentAnimVersion = match.animVersion;

  const isBreakShot = match.balls.filter(b => b.id !== 0 && !b.isPocketed).length === 15;
  const shooterName = match.players[0]?.username || 'Player';

  const clampedAngle = ((msg.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const clampedPower = Math.max(0, Math.min(100, msg.power));

  match.log.push(isBreakShot ? `💥 ${shooterName} executes the BREAK SHOT!` : `${shooterName} shoots (Power: ${Math.round(clampedPower)}%)`);

  const cueBall = match.balls[0];
  cueBall.spinX = Math.max(-1, Math.min(1, msg.spinX || 0));
  cueBall.spinY = Math.max(-1, Math.min(1, msg.spinY || 0));

  const force = powerToVelocity(clampedPower);
  cueBall.vx = Math.cos(clampedAngle) * force;
  cueBall.vy = Math.sin(clampedAngle) * force;

  const frames: Array<{ id: number; x: number; y: number; isPocketed: boolean }[]> = [captureFrame(match.balls)];
  let iterations = 0;
  const maxSteps = 1200;
  const pocketed: number[] = [];
  let cuePocketed = false;
  const contactTracker = { firstContactBallId: null as number | null, cushionContactOccurred: false };
  let lastCapture = match.balls.map(b => ({ x: b.x, y: b.y }));
  let framesSinceCapture = 0;

  while (iterations < maxSteps) {
    const preStates = match.balls.map(b => ({ id: b.id, isPocketed: b.isPocketed }));
    simulatePhysicsStep(match.balls, contactTracker);
    for (let i = 0; i < match.balls.length; i++) {
      const cb = match.balls[i], pb = preStates.find(s => s.id === cb.id);
      if (pb && cb.isPocketed && !pb.isPocketed) {
        if (cb.id === 0) cuePocketed = true;
        else pocketed.push(cb.id);
      }
    }
    const maxDeltaSq = Math.max(...match.balls.map((b, i) => {
      const dx = b.x - lastCapture[i].x, dy = b.y - lastCapture[i].y;
      return dx * dx + dy * dy;
    }));
    if (maxDeltaSq > 4 || framesSinceCapture >= 3) {
      frames.push(captureFrame(match.balls));
      lastCapture = match.balls.map(b => ({ x: b.x, y: b.y }));
      framesSinceCapture = 0;
    } else framesSinceCapture++;
    iterations++;
    if (!isAnyBallMoving(match.balls)) break;
  }
  frames.push(captureFrame(match.balls));

  const compactFrames = frames.map(f => f.map(b => [b.id, b.x, b.y, b.isPocketed ? 1 : 0]));
  for (const client of aiClientsByRoom.get(mapping.roomId) || []) {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'physics_frames', frames: compactFrames }));
  }

  const duration = (iterations * 16.66) / (iterations > 350 ? 2.4 : 2.0) + 80;

  const timer = setTimeout(() => {
    if ((match.animVersion || 0) !== currentAnimVersion || match.status !== 'playing') return;
    aiAnimatingIds.delete(mapping.roomId);
    evaluateShotRules(match as any, pocketed, cuePocketed, contactTracker.firstContactBallId, shooterName, mapping.playerId, isBreakShot, contactTracker.cushionContactOccurred);
    broadcastAiRoom(mapping.roomId);
    if (match.status === 'playing' && match.currentTurn === 'ai-bot') triggerAiShot(match as any, {
      animSet: aiAnimatingIds,
      clientsMap: aiClientsByRoom,
      broadcastFn: broadcastAiRoom,
    });
  }, duration);

  if (!aiTimeouts.has(mapping.roomId)) aiTimeouts.set(mapping.roomId, new Set());
  aiTimeouts.get(mapping.roomId)!.add(timer);
}

// ── Rematch ────────────────────────────────────────────
export function handleAiRematch(ws: WebSocket): void {
  const mapping = aiPlayerRoomMap.get(ws);
  if (!mapping) return;
  const match = aiMatches.get(mapping.roomId);
  if (!match || match.status !== 'gameover') return;

  match.balls = getInitialBalls();
  match.players.forEach(p => { p.side = undefined; });
  match.assignedSides = false;
  match.scratchOccurred = false;
  match.pocketedThisTurn = false;
  match.ballInHandRestriction = undefined;
  match.winnerId = undefined;
  match.animVersion++;
  match.log = ['🔄 AI Rematch started!'];
  match.status = 'playing';
  match.currentTurn = match.players[0].id;
  match.turnTimer = 60;
  broadcastAiRoom(mapping.roomId);
}

// ── Disconnect / cleanup ───────────────────────────────
export function handleAiDisconnect(ws: WebSocket): void {
  const mapping = aiPlayerRoomMap.get(ws);
  if (!mapping) return;

  aiPlayerRoomMap.delete(ws);
  const clients = aiClientsByRoom.get(mapping.roomId);
  if (clients) {
    clients.delete(ws);
    if (clients.size === 0) {
      // Clean up match resources
      const timers = aiTimeouts.get(mapping.roomId);
      if (timers) { timers.forEach(t => clearTimeout(t)); aiTimeouts.delete(mapping.roomId); }
      aiAnimatingIds.delete(mapping.roomId);
      aiMatches.delete(mapping.roomId);
      aiClientsByRoom.delete(mapping.roomId);
      pushEventLog('ai_match_cleaned', { roomId: mapping.roomId });
    }
  }
}

// ── Preview aim relay ──────────────────────────────────
export function handleAiPreviewAim(ws: WebSocket, msg: { angle: number; power: number; spinX?: number; spinY?: number }): void {
  const mapping = aiPlayerRoomMap.get(ws);
  if (!mapping) return;
  const match = aiMatches.get(mapping.roomId);
  if (!match || match.status !== 'playing') return;
  // Only relay current turn holder's aim
  if (match.currentTurn !== mapping.playerId) return;
  for (const client of aiClientsByRoom.get(mapping.roomId) || []) {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'preview_aim', angle: msg.angle, power: msg.power }));
    }
  }
}

// ── Reset cue ball ─────────────────────────────────────
export function handleAiResetCueBall(ws: WebSocket, msg: { x: number; y: number }): void {
  const mapping = aiPlayerRoomMap.get(ws);
  if (!mapping) return;
  const match = aiMatches.get(mapping.roomId);
  if (!match || match.status !== 'playing' || match.currentTurn !== mapping.playerId || !match.scratchOccurred) return;

  const minX = CUSHION + BALL_R + 2, maxX = TABLE_W - CUSHION - BALL_R - 2;
  const minY = CUSHION + BALL_R + 2, maxY = TABLE_H - CUSHION - BALL_R - 2;
  const tx = Math.max(minX, Math.min(msg.x, maxX)), ty = Math.max(minY, Math.min(msg.y, maxY));

  if (match.ballInHandRestriction === 'behind_head_string' && tx > HEAD_STRING_X - BALL_R) {
    ws.send(JSON.stringify({ type: 'error', message: 'Ball must be behind head string.' }));
    return;
  }

  if (match.balls.some(b => b.id !== 0 && !b.isPocketed && Math.hypot(tx - b.x, ty - b.y) < BALL_R * 2)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Cannot place over another ball.' }));
    return;
  }

  const cb = match.balls[0];
  cb.x = tx; cb.y = ty; cb.isPocketed = false; cb.vx = 0; cb.vy = 0;
  match.scratchOccurred = false;
  match.ballInHandRestriction = undefined;
  match.turnTimer = 60;
  broadcastAiRoom(mapping.roomId);
}

// ── Broadcast AiMatch state ────────────────────────────
function broadcastAiRoom(roomId: string): void {
  const match = aiMatches.get(roomId);
  if (!match) return;

  const stateForSync = {
    ...match,
    balls: match.balls.map(b => ({ ...b })),
    players: match.players.map(p => ({ ...p })),
    log: match.log.slice(-MAX_LOG),
    stake: 0,
    escrowHash: undefined,
    serverSeed: undefined,
    status: match.status,
  };

  const payload = JSON.stringify({ type: 'sync_state', state: stateForSync });
  for (const client of aiClientsByRoom.get(roomId) || []) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

// ── Get live state for reconnect / sync ────────────────
export function sendAiFullState(ws: WebSocket, roomId: string): void {
  const match = aiMatches.get(roomId);
  if (!match || ws.readyState !== WebSocket.OPEN) return;
  const stateForSync = {
    ...match,
    balls: match.balls.map(b => ({ ...b })),
    players: match.players.map(p => ({ ...p })),
    log: match.log.slice(-MAX_LOG),
    stake: 0,
    escrowHash: undefined,
    serverSeed: undefined,
  };
  ws.send(JSON.stringify({ type: 'sync_state', state: stateForSync }));
}

// ── AI match turn timer countdown ──────────────────────
export function startAiMatchTimer(): void {
  setInterval(() => {
    for (const [roomId, match] of aiMatches) {
      if (match.status !== 'playing') continue;
      if (aiAnimatingIds.has(roomId)) continue;

      // Pause timer if human player is disconnected
      const hasConnectedHuman = [...(aiClientsByRoom.get(roomId) || [])].some(c => c.readyState === WebSocket.OPEN);
      if (!hasConnectedHuman) continue;

      if (match.turnTimer > 0) {
        match.turnTimer -= 1;
        if (match.turnTimer <= 10 || match.turnTimer % 5 === 0) {
          broadcastAiRoom(roomId);
        }
      } else {
        match.turnTimer = 60;
        const current = match.players.find(p => p.id === match.currentTurn);
        const other = match.players.find(p => p.id !== match.currentTurn);
        if (current && other) {
          match.log.push(`⏰ SHOT CLOCK VIOLATION: ${current.username} exceeded the 60-second shot clock!`);
          match.log.push(`⚠️ ${other.username} receives Ball-In-Hand.`);
          match.currentTurn = other.id;
          match.scratchOccurred = true;
          match.ballInHandRestriction = 'anywhere';

          const cueBall = match.balls.find(b => b.id === 0);
          if (cueBall && cueBall.isPocketed) {
            const validPos = findValidCueBallPosition(match.balls as any);
            cueBall.isPocketed = false;
            cueBall.x = validPos.x;
            cueBall.y = validPos.y;
            cueBall.vx = 0;
            cueBall.vy = 0;
          }

          broadcastAiRoom(roomId);
          if (match.currentTurn === 'ai-bot') triggerAiShot(match as any, {
            animSet: aiAnimatingIds,
            clientsMap: aiClientsByRoom,
            broadcastFn: broadcastAiRoom,
          });
        }
      }
    }
  }, 1000).unref();
}

// ── Periodic cleanup for idle AI matches ───────────────
const AI_IDLE_TIMEOUT = 10 * 60 * 1000; // 10 minutes

export function startAiCleanup(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [id, match] of aiMatches) {
      if (now - match.createdAt > AI_IDLE_TIMEOUT) {
        const clients = aiClientsByRoom.get(id);
        if (clients) {
          for (const ws of clients) { aiPlayerRoomMap.delete(ws); }
        }
        const timers = aiTimeouts.get(id);
        if (timers) { timers.forEach(t => clearTimeout(t)); aiTimeouts.delete(id); }
        aiAnimatingIds.delete(id);
        aiClientsByRoom.delete(id);
        aiMatches.delete(id);
        pushEventLog('ai_idle_cleanup', { roomId: id });
      }
    }
  }, 120_000);
}
