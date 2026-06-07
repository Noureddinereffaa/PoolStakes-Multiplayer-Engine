import { WebSocket } from 'ws';
import { RoomState, MatchHistory } from '../types';
import { getInitialBalls } from './physics';

export const activeRooms = new Map<string, RoomState>();
export const animatingRoomIds = new Set<string>();
export const matchLogs: MatchHistory[] = [];
export const activeSockets = new Set<WebSocket>();
export const clientsByRoom = new Map<string, Set<WebSocket>>();
export const playerRoomMap = new Map<WebSocket, { roomId: string; playerId: string }>();

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
    log: ['Lobby created. Waiting for betting players.']
  };

  activeRooms.set(roomId, newRoom);
  return newRoom;
}

export function broadcastRoom(roomId: string) {
  const room = activeRooms.get(roomId);
  if (!room) return;

  const wssList = clientsByRoom.get(roomId) || [];
  const payload = JSON.stringify({
    type: 'sync_state',
    state: room
  });

  for (const client of wssList) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

export function broadcastToAllWebSockets(messageObj: any) {
  const payload = JSON.stringify(messageObj);
  for (const ws of activeSockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}
