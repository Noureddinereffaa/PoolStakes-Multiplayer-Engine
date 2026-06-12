import { activeRooms, animatingRoomIds, broadcastRoom, clientsByRoom, pushRoomLog, pushEventLog, cleanupRoom, pauseRoomIfInactive } from './state';
import { triggerAiShot, findValidCueBallPosition } from './gameLogic';
import { prisma } from './db';

const ROOM_CLEANUP_TICKS = 300; // 5 minutes
const roomIdleTicks = new Map<string, number>();

let apiLogCleanupCounter = 0;

export function startTurnTimer(): void {
  const timer = setInterval(() => {
    // ApiLog cleanup (every 600 ticks = 10 minutes)
    apiLogCleanupCounter++;
    if (apiLogCleanupCounter >= 600) {
      apiLogCleanupCounter = 0;
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      prisma.apiLog.deleteMany({ where: { timestamp: { lt: cutoff } } }).catch((err) => {
        console.error('API log cleanup failed:', err);
      });
    }

    activeRooms.forEach((room, roomId) => {
      // ── Room cleanup for idle rooms ──
      const hasClients = (clientsByRoom.get(roomId)?.size ?? 0) > 0;
      if (!hasClients && (room.status === 'gameover' || room.status === 'waiting')) {
        const idle = (roomIdleTicks.get(roomId) ?? 0) + 1;
        if (idle >= ROOM_CLEANUP_TICKS) {
          pushEventLog('room_idle_cleanup', { roomId, status: room.status });
          cleanupRoom(roomId);
          roomIdleTicks.delete(roomId);
          return;
        }
        roomIdleTicks.set(roomId, idle);
        return;
      }
      roomIdleTicks.delete(roomId);

      // ── Skip paused rooms entirely (no timers, no physics) ──
      if (room.status === 'paused' || room.status === 'archived') return;

      // ── Auto-pause rooms with no clients during active game ──
      if (room.status === 'playing' && !hasClients) {
        pauseRoomIfInactive(roomId);
        return;
      }

      // ── Turn timer ──
      if (room.status !== 'playing') return;
      if (animatingRoomIds.has(roomId)) return;

      // Pause timer if current turn player is disconnected
      if (room.disconnectedPlayerIds?.includes(room.currentTurn)) return;

      if (room.turnTimer === undefined) room.turnTimer = 60;

      if (room.turnTimer > 0) {
        room.turnTimer -= 1;
        if (room.turnTimer <= 10 || room.turnTimer % 5 === 0) {
          broadcastRoom(roomId);
        }
      } else {
        room.turnTimer = 60;
        const current = room.players.find(p => p.id === room.currentTurn);
        const other   = room.players.find(p => p.id !== room.currentTurn);
        if (current && other) {
          pushRoomLog(room, `⏰ SHOT CLOCK VIOLATION: ${current.username} exceeded the 60-second shot clock!`);
          pushRoomLog(room, `⚠️ WPA Rule 5.1: ${other.username} receives Ball-In-Hand anywhere on the table.`);
          room.currentTurn           = other.id;
          room.scratchOccurred       = true;
          room.ballInHandRestriction = 'anywhere';

          const cueBall = room.balls.find(b => b.id === 0);
          if (cueBall && cueBall.isPocketed) {
            const validPos = findValidCueBallPosition(room.balls);
            cueBall.isPocketed = false;
            cueBall.x = validPos.x;
            cueBall.y = validPos.y;
            cueBall.vx = 0;
            cueBall.vy = 0;
          }

          broadcastRoom(roomId);
          if (room.currentTurn === 'ai-bot') triggerAiShot(room);
        }
      }
    });
  }, 1000);
  timer.unref();
}
