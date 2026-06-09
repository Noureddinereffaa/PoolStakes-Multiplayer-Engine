import { prisma } from './db';
import { activeRooms } from './state';
import { logger } from './logger';
import { RoomState } from '../types';

export async function saveRoomSnapshot(room: RoomState): Promise<void> {
  try {
    const state = JSON.stringify({
      roomId: room.roomId,
      name: room.name,
      stake: room.stake,
      status: room.status,
      players: room.players,
  balls: room.balls.map(b => ({
    id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy,
    isPocketed: b.isPocketed, type: b.type,
    color: b.color, number: b.number,
    spinX: b.spinX, spinY: b.spinY,
  })),
      currentTurn: room.currentTurn,
      assignedSides: room.assignedSides,
      scratchOccurred: room.scratchOccurred,
      pocketedThisTurn: room.pocketedThisTurn,
      ballInHandRestriction: room.ballInHandRestriction,
      log: room.log,
      commissionRate: room.commissionRate,
      turnTimer: room.turnTimer,
      animVersion: room.animVersion || 0,
    });

    await prisma.roomSnapshot.upsert({
      where: { roomId: room.roomId },
      create: { roomId: room.roomId, name: room.name, stake: room.stake, status: room.status, state },
      update: { stake: room.stake, status: room.status, state, name: room.name },
    });
  } catch (err) {
    logger.error('Failed to persist room snapshot', { roomId: room.roomId, error: String(err) });
  }
}

export async function restoreRoomSnapshots(): Promise<void> {
  try {
    const snapshots = await prisma.roomSnapshot.findMany();
    for (const snap of snapshots) {
      try {
        const state = JSON.parse(snap.state) as {
          roomId: string; name: string; stake: number; status: string;
          players: RoomState['players']; balls: RoomState['balls'];
          currentTurn: string; assignedSides: boolean;
          scratchOccurred: boolean; pocketedThisTurn: boolean;
          ballInHandRestriction?: string; log: string[];
          commissionRate: number; turnTimer?: number; animVersion?: number;
        };

        const room: RoomState = {
          roomId: state.roomId,
          name: state.name,
          stake: state.stake,
          status: state.status as RoomState['status'],
          players: state.players.map(p => ({
            id: p.id,
            username: p.username,
            walletBalance: p.walletBalance,
            bettingStake: p.bettingStake,
            side: p.side,
            isConnected: p.isConnected,
          })),
          balls: state.balls,
          currentTurn: state.currentTurn,
          assignedSides: state.assignedSides,
          scratchOccurred: state.scratchOccurred,
          pocketedThisTurn: state.pocketedThisTurn,
          ballInHandRestriction: state.ballInHandRestriction as RoomState['ballInHandRestriction'],
          log: state.log,
          commissionRate: state.commissionRate,
          turnTimer: state.turnTimer || 60,
          animVersion: state.animVersion || 0,
        };

        activeRooms.set(room.roomId, room);
        logger.info('Restored room from snapshot', { roomId: room.roomId });
      } catch (parseErr) {
        logger.warn('Failed to parse room snapshot', { roomId: snap.roomId, error: String(parseErr) });
      }
    }
    if (snapshots.length > 0) {
      logger.info(`Restored ${snapshots.length} room(s) from DB snapshots`);
    }
  } catch (err) {
    logger.error('Failed to restore room snapshots', { error: String(err) });
  }
}

const SNAPSHOT_INTERVAL_MS = 10_000;

let snapshotTimer: ReturnType<typeof setInterval> | null = null;

export function startSnapshotInterval(): void {
  if (snapshotTimer) return;
  snapshotTimer = setInterval(() => {
    for (const room of activeRooms.values()) {
      if (room.status === 'playing' || room.status === 'waiting') {
        saveRoomSnapshot(room);
      }
    }
  }, SNAPSHOT_INTERVAL_MS);
  logger.info(`Room snapshot interval started (${SNAPSHOT_INTERVAL_MS}ms)`);
}

export function stopSnapshotInterval(): void {
  if (snapshotTimer) {
    clearInterval(snapshotTimer);
    snapshotTimer = null;
  }
}
