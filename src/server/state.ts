import { WebSocket } from 'ws';
import { RoomState, MatchHistory } from '../types';
import { getInitialBalls } from './physics';

export const activeRooms = new Map<string, RoomState>();
export const animatingRoomIds = new Set<string>();
export const matchLogs: MatchHistory[] = [];
export const activeSockets = new Set<WebSocket>();
export const clientsByRoom = new Map<string, Set<WebSocket>>();
export const playerRoomMap = new Map<WebSocket, { roomId: string; playerId: string }>();

const MAX_ROOM_LOG = 100;
const MAX_MATCH_LOGS = 200;

export function pushRoomLog(room: RoomState, message: string): void {
  room.log.push(message);
  if (room.log.length > MAX_ROOM_LOG) {
    room.log.splice(0, room.log.length - MAX_ROOM_LOG);
  }
}

export function pushMatchLog(entry: MatchHistory): void {
  matchLogs.push(entry);
  if (matchLogs.length > MAX_MATCH_LOGS) {
    matchLogs.splice(0, matchLogs.length - MAX_MATCH_LOGS);
  }
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
    animVersion: 0
  };

  activeRooms.set(roomId, newRoom);
  return newRoom;
}

const MAX_LOG_SYNC = 30;

export function broadcastRoom(roomId: string): void {
  const room = activeRooms.get(roomId);
  if (!room) return;

  const wssList = clientsByRoom.get(roomId) || [];
  const stateForSync = { ...room, log: room.log.slice(-MAX_LOG_SYNC) };
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

export function broadcastToAllWebSockets(messageObj: Record<string, unknown>): void {
  const payload = JSON.stringify(messageObj);
  for (const ws of activeSockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}
