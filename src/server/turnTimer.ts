import { activeRooms, animatingRoomIds, broadcastRoom, clientsByRoom } from './state';
import { triggerAiShot } from './gameLogic';

// Rooms in gameover/waiting with no connected clients are cleaned up after this many ticks (seconds)
const ROOM_CLEANUP_TICKS = 300; // 5 minutes
const roomIdleTicks = new Map<string, number>();

export function startTurnTimer() {
  setInterval(() => {
    activeRooms.forEach((room, roomId) => {
      // ── Room cleanup ──
      const hasClients = (clientsByRoom.get(roomId)?.size ?? 0) > 0;
      if (!hasClients && (room.status === 'gameover' || room.status === 'waiting')) {
        const idle = (roomIdleTicks.get(roomId) ?? 0) + 1;
        if (idle >= ROOM_CLEANUP_TICKS) {
          activeRooms.delete(roomId);
          clientsByRoom.delete(roomId);
          roomIdleTicks.delete(roomId);
          return;
        }
        roomIdleTicks.set(roomId, idle);
        return;
      }
      roomIdleTicks.delete(roomId); // reset counter once clients reconnect

      // ── Turn timer ──
      if (room.status !== 'playing') return;
      if (animatingRoomIds.has(roomId)) return;

      if (room.turnTimer === undefined) room.turnTimer = 60;

      if (room.turnTimer > 0) {
        room.turnTimer -= 1;
        broadcastRoom(roomId);
      } else {
        room.turnTimer = 60;
        const current = room.players.find(p => p.id === room.currentTurn);
        const other = room.players.find(p => p.id !== room.currentTurn);
        if (current && other) {
          room.log.push(`⏰ SHOT CLOCK VIOLATION: ${current.username} ran out of time!`);
          room.currentTurn = other.id;
          room.scratchOccurred = true;
          room.log.push(`⚠️ Turn penalty: Free Cue Ball placement awarded to ${other.username}.`);
          broadcastRoom(roomId);
          if (room.currentTurn === 'ai-bot') triggerAiShot(room);
        }
      }
    });
  }, 1000);
}
