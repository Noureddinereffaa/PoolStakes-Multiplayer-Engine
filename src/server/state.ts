import { WebSocket } from 'ws';
import { RoomState, MatchHistory } from '../types';
import { getInitialBalls } from './physics';
import { logger } from './logger';
import { deleteRoomSnapshot } from './persist';

export const activeRooms = new Map<string, RoomState>();
export const animatingRoomIds = new Set<string>();
export const matchLogs: MatchHistory[] = [];
export const activeSockets = new Set<WebSocket>();
export const clientsByRoom = new Map<string, Set<WebSocket>>();
export const playerRoomMap = new Map<WebSocket, { roomId: string; playerId: string }>();

/** Single socket per user: userId → WebSocket */
export const userSockets = new Map<string, WebSocket>();

export const rematchingRooms = new Set<string>();
export const payingOutRooms = new Set<string>();

export const DISCONNECT_TIMEOUT_MS = 30000;
export const forfeitTimers = new Map<string, NodeJS.Timeout>();

/** Per-room async mutex: queues operations instead of dropping */
const roomMutexQueues = new Map<string, Array<() => void>>();

/** Track all setTimeout handles per room for cleanup on deletion */
export const roomTimeouts = new Map<string, Set<NodeJS.Timeout>>();

export async function withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const runNext = () => {
      roomLocksCurrently.add(roomId);
      fn().then(res => {
        roomLocksCurrently.delete(roomId);
        resolve(res);
        const next = roomMutexQueues.get(roomId)?.shift();
        if (next) next();
        else roomMutexQueues.delete(roomId);
      }).catch(err => {
        roomLocksCurrently.delete(roomId);
        reject(err);
        const next = roomMutexQueues.get(roomId)?.shift();
        if (next) next();
        else roomMutexQueues.delete(roomId);
      });
    };

    if (roomLocksCurrently.has(roomId)) {
      if (!roomMutexQueues.has(roomId)) roomMutexQueues.set(roomId, []);
      roomMutexQueues.get(roomId)!.push(runNext);
    } else {
      runNext();
    }
  });
}

/** Track currently locked roomIds (used internally by withRoomLock) */
const roomLocksCurrently = new Set<string>();

export function registerRoomTimeout(roomId: string, timer: NodeJS.Timeout): void {
  if (!roomTimeouts.has(roomId)) roomTimeouts.set(roomId, new Set());
  roomTimeouts.get(roomId)!.add(timer);
}

export function clearRoomTimeouts(roomId: string): void {
  const timers = roomTimeouts.get(roomId);
  if (timers) {
    for (const t of timers) clearTimeout(t);
    roomTimeouts.delete(roomId);
  }
}

const MAX_ROOM_LOG = 100;
const MAX_MATCH_LOGS = 200;
const MAX_EVENT_LOGS = 500;
export const eventLogs: Array<{ timestamp: string; event: string; data?: any }> = [];

export function pushEventLog(event: string, data?: any): void {
  const entry = { timestamp: new Date().toISOString(), event, data };
  eventLogs.push(entry);
  if (eventLogs.length > MAX_EVENT_LOGS) {
    eventLogs.splice(0, eventLogs.length - MAX_EVENT_LOGS);
  }
  logger.debug(`[EVENT] ${event}`, data);
}

/**
 * Hybrid single-session enforcement:
 * - If existing socket is in a PvP match (room.status === 'playing'), REJECT new connection
 * - Otherwise, replace old socket (dashboard / AI / waiting)
 */
export function enforceSingleSocket(userId: string, ws: WebSocket, rejectOnMatch: boolean = true): boolean {
  const existing = userSockets.get(userId);
  if (!existing || existing === ws) {
    userSockets.set(userId, ws);
    return true;
  }

  // Check if existing socket is in a live PvP match
  if (rejectOnMatch) {
    const mapping = playerRoomMap.get(existing);
    if (mapping) {
      const room = activeRooms.get(mapping.roomId);
      if (room && room.status === 'playing') {
        pushEventLog('single_socket_rejected', { userId, roomId: mapping.roomId });
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message: 'Account already in a match. Complete or forfeit the current game first.' }));
        }
        return false;
      }
    }
  }

  // Safe to replace: close old socket after removing from tracking
  pushEventLog('single_socket_replace', { userId });
  try {
    existing.send(JSON.stringify({ type: 'error', message: 'New connection established. This session is closed.' }));
  } catch { /* ignore */ }
  playerRoomMap.delete(existing);
  for (const [roomId, clients] of clientsByRoom) {
    if (clients.has(existing)) {
      clients.delete(existing);
      if (clients.size === 0) {
        clientsByRoom.delete(roomId);
      }
    }
  }
  try { existing.close(); } catch { /* ignore */ }

  userSockets.set(userId, ws);
  return true;
}

export function removeUserSocket(userId: string, ws: WebSocket): void {
  const current = userSockets.get(userId);
  if (current === ws) {
    userSockets.delete(userId);
  }
}

export function pushRoomLog(room: RoomState, message: string): void {
  room.log.push(message);
  if (room.log.length > MAX_ROOM_LOG) {
    room.log.splice(0, room.log.length - MAX_ROOM_LOG);
  }
  pushEventLog('room_log', { roomId: room.roomId, message });
}

export function pushMatchLog(entry: MatchHistory): void {
  matchLogs.push(entry);
  if (matchLogs.length > MAX_MATCH_LOGS) {
    matchLogs.splice(0, matchLogs.length - MAX_MATCH_LOGS);
  }
}

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_CODE_RETRIES = 3;

export function generateRoomCode(): string {
  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
    // Check for collision
    let collision = false;
    for (const room of activeRooms.values()) {
      if (room.roomCode === code) { collision = true; break; }
    }
    if (!collision) return code;
  }
  // Fallback: add timestamp suffix to avoid collision
  return Date.now().toString(36).slice(-4).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();
}

export function getPublicRooms(stakeFilter?: number): Array<{ roomId: string; roomCode: string; stake: number; players: number; status: string }> {
  const list: Array<{ roomId: string; roomCode: string; stake: number; players: number; status: string }> = [];
  for (const [id, room] of activeRooms) {
    if (room.status === 'waiting' && room.isPublic && room.players.length < 2) {
      if (stakeFilter !== undefined && room.stake !== stakeFilter) continue;
      list.push({ roomId: id, roomCode: room.roomCode || '', stake: room.stake, players: room.players.length, status: room.status });
    }
  }
  return list;
}

export function findRoomByCode(code: string): RoomState | undefined {
  for (const room of activeRooms.values()) {
    if (room.roomCode === code && room.players.length < 2) return room;
  }
  return undefined;
}

export function getOrCreateRoom(roomId: string, name: string, stake = 10): RoomState {
  if (activeRooms.has(roomId)) {
    return activeRooms.get(roomId)!;
  }

  const newRoom: RoomState = {
    roomId,
    name,
    stake,
    status: 'waiting',
    players: [],
    balls: getInitialBalls(),
    currentTurn: '',
    assignedSides: false,
    scratchOccurred: false,
    pocketedThisTurn: false,
    ballInHandRestriction: undefined,
    log: ['Lobby created. Waiting for betting players.'],
    commissionRate: 0.05,
    animVersion: 0,
    disconnectedPlayerIds: [],
    reconnectDeadlines: {},
    createdAt: Date.now(),
  };

  activeRooms.set(roomId, newRoom);
  pushEventLog('room_created', { roomId, name, stake });
  return newRoom;
}

const MAX_LOG_SYNC = 30;

export function broadcastRoom(roomId: string): void {
  const room = activeRooms.get(roomId);
  if (!room) return;

  const wssList = clientsByRoom.get(roomId) || [];
  // Deep clone balls and players to prevent mutation during serialization
  const stateForSync = {
    ...room,
    balls: room.balls.map(b => ({ ...b })),
    players: room.players.map(p => ({ ...p })),
    log: room.log.slice(-MAX_LOG_SYNC)
  };
  const payload = JSON.stringify({
    type: 'sync_state',
    state: stateForSync
  });

  for (const client of wssList) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

export function sendFullState(ws: WebSocket, roomId: string): void {
  const room = activeRooms.get(roomId);
  if (!room || ws.readyState !== WebSocket.OPEN) return;
  const stateForSync = {
    ...room,
    balls: room.balls.map(b => ({ ...b })),
    players: room.players.map(p => ({ ...p })),
    log: room.log.slice(-MAX_LOG_SYNC)
  };
  ws.send(JSON.stringify({ type: 'sync_state', state: stateForSync }));
}

export function startForfeitTimer(roomId: string, fn: () => void): void {
  cancelForfeitTimer(roomId);
  const timer = setTimeout(() => {
    forfeitTimers.delete(roomId);
    fn();
  }, DISCONNECT_TIMEOUT_MS);
  forfeitTimers.set(roomId, timer);
  pushEventLog('forfeit_timer_started', { roomId, timeout: DISCONNECT_TIMEOUT_MS });
}

export function cancelForfeitTimer(roomId: string): void {
  const existing = forfeitTimers.get(roomId);
  if (existing) {
    clearTimeout(existing);
    forfeitTimers.delete(roomId);
    pushEventLog('forfeit_timer_cancelled', { roomId });
  }
}

export function broadcastToAllWebSockets(messageObj: Record<string, unknown>): void {
  const payload = JSON.stringify(messageObj);
  for (const ws of activeSockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

export function cleanupRoom(roomId: string): void {
  const room = activeRooms.get(roomId);
  if (!room) return;

  // Notify connected clients before cleanup
  const clients = clientsByRoom.get(roomId);
  if (clients) {
    const msg = JSON.stringify({ type: 'room_closed', message: 'This room has been closed.' });
    for (const ws of clients) {
      try { if (ws.readyState === WebSocket.OPEN) ws.send(msg); } catch { /* ignore */ }
      playerRoomMap.delete(ws);
    }
  }

  // Remove user socket mappings for players in this room
  for (const player of room.players) {
    userSockets.delete(player.id);
  }

  cancelForfeitTimer(roomId);
  clearRoomTimeouts(roomId);
  roomMutexQueues.delete(roomId);
  roomLocksCurrently.delete(roomId);
  activeRooms.delete(roomId);
  clientsByRoom.delete(roomId);
  animatingRoomIds.delete(roomId);

  // Delete the DB snapshot so it doesn't accumulate
  deleteRoomSnapshot(roomId).catch(() => {});

  pushEventLog('room_cleaned_up', { roomId });
}

// ── Idle Room Expiry ──────────────────────────────────────────
const IDLE_ROOM_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

let idleCleanupInterval: NodeJS.Timeout | null = null;

export function startIdleRoomCleanup(): void {
  if (idleCleanupInterval) return;
  idleCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of activeRooms) {
      // Only clean waiting rooms with < 2 players that are idle
      if (room.status === 'waiting' && room.players.length < 2 && room.createdAt) {
        if (now - room.createdAt > IDLE_ROOM_TIMEOUT_MS) {
          pushEventLog('idle_room_cleanup', { roomId, code: room.roomCode, age: now - room.createdAt });
          cleanupRoom(roomId);
        }
      }
    }
  }, 60_000); // Check every minute
}

export function stopIdleRoomCleanup(): void {
  if (idleCleanupInterval) {
    clearInterval(idleCleanupInterval);
    idleCleanupInterval = null;
  }
}
