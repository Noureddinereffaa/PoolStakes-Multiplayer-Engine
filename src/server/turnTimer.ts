import { activeRooms, animatingRoomIds, broadcastRoom } from './state';
import { triggerAiShot } from './gameLogic';

export function startTurnTimer() {
  setInterval(() => {
    activeRooms.forEach((room) => {
      if (room.status !== 'playing') return;
      if (animatingRoomIds.has(room.roomId)) return;

      if (room.turnTimer === undefined) {
        room.turnTimer = 60;
      }

      if (room.turnTimer > 0) {
        room.turnTimer -= 1;
        broadcastRoom(room.roomId);
      } else {
        room.turnTimer = 60;
        const currentActivePlayer = room.players.find(p => p.id === room.currentTurn);
        const otherPlayer = room.players.find(p => p.id !== room.currentTurn);

        if (currentActivePlayer && otherPlayer) {
          room.log.push(`⏰ SHOT CLOCK VIOLATION: ${currentActivePlayer.username} ran out of time!`);
          room.currentTurn = otherPlayer.id;
          room.scratchOccurred = true;
          room.log.push(`⚠️ Turn penalty: Free Cue Ball placement awarded to ${otherPlayer.username}.`);
          broadcastRoom(room.roomId);

          if (room.currentTurn === 'ai-bot') {
            triggerAiShot(room);
          }
        }
      }
    });
  }, 1000);
}
