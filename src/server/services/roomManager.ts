import { WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { RoomState, Player } from '../../types';
import {
  activeRooms, clientsByRoom, playerRoomMap, userSockets,
  getOrCreateRoom, broadcastRoom, cleanupRoom,
  pushRoomLog, generateRoomCode, findRoomByCode, pushEventLog,
  withRoomLock, sendFullState,
  cancelForfeitTimer, startForfeitTimer, DISCONNECT_TIMEOUT_MS
} from '../state';
import { ensureLaravelUser, createPlayerFromUser, lockRoomEscrow } from '../room';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('FATAL: JWT_SECRET environment variable is not set');

export interface RoomJoinResult {
  success: boolean;
  error?: string;
  room?: RoomState;
}

export function createRoom(ws: WebSocket, userId: string, username: string, stake: number, isPublic: boolean, customRoomId?: string): { room: RoomState; code: string } {
  const code = generateRoomCode();
  const roomId = customRoomId || `room_${code}_${Date.now()}`;
  const room = getOrCreateRoom(roomId, `Room ${code}`, stake);
  room.roomCode = code;
  room.isPublic = isPublic;
  room.createdAt = Date.now();
  return { room, code };
}

export async function joinRoom(ws: WebSocket, roomId: string, userId: string, username: string, stake: number): Promise<RoomJoinResult> {
  return withRoomLock<RoomJoinResult>(roomId, async () => {
    const room = activeRooms.get(roomId);
    if (!room) return { success: false, error: 'Room not found.' };
    if (room.status !== 'waiting') return { success: false, error: 'Room is not in joinable state.' };
    if (room.players.length >= 2) return { success: false, error: 'Room is full.' };
    if (room.stake !== stake) return { success: false, error: `Stake mismatch. Room requires $${room.stake}.` };
    if (room.players.some(p => p.id === userId)) return { success: false, error: 'You are already in this room.' };

    if (!clientsByRoom.has(roomId)) clientsByRoom.set(roomId, new Set());
    clientsByRoom.get(roomId)!.add(ws);
    playerRoomMap.set(ws, { roomId, playerId: userId });

    const walletUser = await ensureLaravelUser(username);
    const player = createPlayerFromUser(walletUser, stake);
    room.players.push(player);
    pushRoomLog(room, `${username} entered table. Stake: $${stake}`);

    if (room.players.length === 2) {
      room.status = 'ready';
      pushRoomLog(room, 'Players joined! Validating and locking stakes...');
      broadcastRoom(roomId);

      const escrowResult = await lockRoomEscrow(room, 'AUTO escrow lock', {
        roomName: room.name,
        player1Id: room.players[0].id,
        player2Id: room.players[1].id,
        stake: room.stake
      });

      if (escrowResult.success) {
        pushRoomLog(room, `Current turn: ${room.players[0].username} (Shooter). Aim at cue ball.`);
        broadcastRoom(roomId);
      } else {
        pushRoomLog(room, `Escrow failed: ${escrowResult.message || 'Insufficient funds.'}`);
        room.players.pop();
        room.status = 'waiting';
        ws.send(JSON.stringify({ type: 'error', message: escrowResult.message || 'Unable to lock stakes.' }));
        broadcastRoom(roomId);
        return { success: false, error: escrowResult.message };
      }
    } else {
      broadcastRoom(roomId);
    }

    return { success: true, room };
  });
}

export async function joinRoomByCode(ws: WebSocket, code: string, userId: string, username: string): Promise<RoomJoinResult> {
  const room = findRoomByCode(code);
  if (!room) return { success: false, error: `No room found with code: ${code}` };
  return joinRoom(ws, room.roomId, userId, username, room.stake);
}

export async function cancelWaiting(ws: WebSocket, userId: string): Promise<{ success: boolean; reason?: string }> {
  const mapping = playerRoomMap.get(ws);
  if (!mapping) return { success: false, reason: 'No active room.' };

  const roomId = mapping.roomId;
  return withRoomLock<{ success: boolean; reason?: string }>(roomId, async () => {
    const room = activeRooms.get(roomId);
    if (!room) return { success: false, reason: 'Room not found.' };
    if (room.status !== 'waiting') return { success: false, reason: 'Game already started.' };
    if (room.players.length !== 1 || room.players[0].id !== userId) return { success: false, reason: 'Cannot cancel — opponent already joined.' };

    const pIdx = room.players.findIndex(p => p.id === userId);
    if (pIdx === -1) return { success: false, reason: 'Player not in room.' };

    const playerName = room.players[pIdx]?.username || 'Player';
    room.players.splice(pIdx, 1);

    broadcastRoom(roomId);

    const set = clientsByRoom.get(roomId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) cleanupRoom(roomId);
    }
    playerRoomMap.delete(ws);
    pushRoomLog(room, `${playerName} left the table.`);
    return { success: true };
  });
}
