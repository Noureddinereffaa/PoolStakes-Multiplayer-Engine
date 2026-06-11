import { activeRooms, animatingRoomIds, broadcastRoom, clientsByRoom, pushRoomLog, cancelForfeitTimer, pushEventLog, cleanupRoom, DISCONNECT_TIMEOUT_MS } from './state';
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

      // ── Both-disconnected cleanup ──
      if (room.status === 'playing') {
        const disconnectedCount = room.disconnectedPlayerIds?.length || 0;
        if (disconnectedCount >= 2) {
          // Both players are disconnected — check if reconnect deadline passed
          const now = Date.now();
          const allExpired = (room.disconnectedPlayerIds || []).every(pid => {
            const deadline = room.reconnectDeadlines?.[pid];
            return deadline && now > deadline;
          });

          if (allExpired) {
            pushRoomLog(room, '⏰ Both players failed to reconnect. Match voided.');
            pushEventLog('both_disconnect_cleanup', { roomId });
            room.status = 'gameover';
            room.winnerId = undefined;
            cancelForfeitTimer(roomId);
            broadcastRoom(roomId);
            return;
          }
        }
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
