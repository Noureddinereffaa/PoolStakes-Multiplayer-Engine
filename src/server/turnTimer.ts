import { activeRooms, animatingRoomIds, broadcastRoom, clientsByRoom, pushRoomLog } from './state';
import { triggerAiShot, findValidCueBallPosition } from './gameLogic';
import { prisma } from './db';

// Rooms in gameover/waiting with no connected clients are cleaned up after this many ticks (seconds)
const ROOM_CLEANUP_TICKS = 300; // 5 minutes
const roomIdleTicks = new Map<string, number>();

let apiLogCleanupCounter = 0;

export function startTurnTimer() {
  setInterval(() => {
    // ── ApiLog cleanup (every 600 ticks = 10 minutes) ──
    apiLogCleanupCounter++;
    if (apiLogCleanupCounter >= 600) {
      apiLogCleanupCounter = 0;
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      prisma.apiLog.deleteMany({ where: { timestamp: { lt: cutoff } } }).catch(() => {});
    }

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
        // بث فقط كل 5 ثوانٍ + آخر 10 ثوانٍ كل ثانية (لتجنب broadcast مستمر غير ضروري)
        if (room.turnTimer <= 10 || room.turnTimer % 5 === 0) {
          broadcastRoom(roomId);
        }
      } else {
        // انتهى وقت الضربة — تطبيق عقوبة WPA: Ball-in-Hand للخصم
        room.turnTimer = 60;
        const current = room.players.find(p => p.id === room.currentTurn);
        const other   = room.players.find(p => p.id !== room.currentTurn);
        if (current && other) {
          pushRoomLog(room, `⏰ SHOT CLOCK VIOLATION: ${current.username} exceeded the 60-second shot clock!`);
          pushRoomLog(room, `⚠️ WPA Rule 5.1: ${other.username} receives Ball-In-Hand anywhere on the table.`);
          room.currentTurn           = other.id;
          room.scratchOccurred       = true;
          room.ballInHandRestriction = 'anywhere';

          // استعادة كرة الضرب إذا كانت مُدخلة
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
}
