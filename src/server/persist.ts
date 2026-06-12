import { prisma } from './db';
import { activeRooms, roomIndex } from './state';
import { logger } from './logger';
import { RoomState } from '../types';

function serializeRoomState(room: RoomState): string {
  return JSON.stringify({
    roomId: room.roomId,
    name: room.name,
    stake: room.stake,
    status: room.status,
    players: room.players,
    balls: room.balls.map(b => ({
      id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy,
      radius: b.radius,
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
}

export async function saveRoomSnapshot(room: RoomState): Promise<void> {
  try {
    const data = serializeRoomState(room);
    await prisma.roomSnapshot.upsert({
      where: { roomId: room.roomId },
      create: { roomId: room.roomId, name: room.name, stake: room.stake, status: room.status, state: data },
      update: { stake: room.stake, status: room.status, state: data, name: room.name },
    });
  } catch (err) {
    logger.error('Failed to persist room snapshot', { roomId: room.roomId, error: String(err) });
  }
}

/** Delete a single room snapshot from the database (called on room cleanup) */
export async function deleteRoomSnapshot(roomId: string): Promise<void> {
  try {
    await prisma.roomSnapshot.deleteMany({ where: { roomId } });
    logger.info('Deleted room snapshot', { roomId });
  } catch (err) {
    logger.error('Failed to delete room snapshot', { roomId, error: String(err) });
  }
}

const MAX_QUEUE_SIZE = 50;
let persistQueue: Array<{ roomId: string; data: string; name: string; stake: number; status: string }> = [];
let persistScheduled = false;

async function flushPersistQueue(): Promise<void> {
  const batch = persistQueue;
  persistQueue = [];
  persistScheduled = false;

  for (const item of batch) {
    try {
      await prisma.roomSnapshot.upsert({
        where: { roomId: item.roomId },
        create: { roomId: item.roomId, name: item.name, stake: item.stake, status: item.status, state: item.data },
        update: { stake: item.stake, status: item.status, state: item.data, name: item.name },
      });
    } catch (err) {
      logger.error('Failed to persist room snapshot', { roomId: item.roomId, error: String(err) });
    }
  }
}

function enqueuePersist(room: RoomState): void {
  if (persistQueue.length >= MAX_QUEUE_SIZE) return;
  const data = serializeRoomState(room);
  const existing = persistQueue.findIndex(e => e.roomId === room.roomId);
  if (existing >= 0) {
    persistQueue[existing] = { roomId: room.roomId, data, name: room.name, stake: room.stake, status: room.status };
  } else {
    persistQueue.push({ roomId: room.roomId, data, name: room.name, stake: room.stake, status: room.status });
  }
  if (!persistScheduled) {
    persistScheduled = true;
    setImmediate(flushPersistQueue);
  }
}

/**
 * Parse a raw snapshot DB record into a RoomState object.
 * Shared between lazyLoadRoom and the snapshot interval.
 */
function parseSnapshotState(snap: { roomId: string; state: string }): RoomState | null {
  try {
    const state = JSON.parse(snap.state) as {
      roomId: string; name: string; stake: number; status: string;
      players: RoomState['players']; balls: RoomState['balls'];
      currentTurn: string; assignedSides: boolean;
      scratchOccurred: boolean; pocketedThisTurn: boolean;
      ballInHandRestriction?: string; log: string[];
      commissionRate: number; turnTimer?: number; animVersion?: number;
    };

    return {
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
  } catch (parseErr) {
    logger.warn('Failed to parse room snapshot', { roomId: snap.roomId, error: String(parseErr) });
    return null;
  }
}

/**
 * Lazy load a single room from DB snapshot.
 * Called by ensureRoomLoaded() when a client connects to a room not in memory.
 */
export async function lazyLoadRoom(roomId: string): Promise<RoomState | null> {
  try {
    const snap = await prisma.roomSnapshot.findUnique({ where: { roomId } });
    if (!snap) return null;
    return parseSnapshotState(snap);
  } catch (err) {
    logger.error('Failed to lazy load room snapshot', { roomId, error: String(err) });
    return null;
  }
}

/** Lightweight restore: only populate the roomIndex, don't load full room state into memory */
const SNAPSHOT_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

export async function restoreRoomSnapshots(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - SNAPSHOT_MAX_AGE_MS);

    // Fetch roomId, status, updatedAt plus state (for player IDs only)
    const snapshots = await prisma.roomSnapshot.findMany({
      where: {
        status: { in: ['playing', 'waiting', 'ready', 'gameover', 'paused'] },
        updatedAt: { gte: cutoff },
      },
      select: { roomId: true, status: true, updatedAt: true, state: true },
    });

    let indexedCount = 0;
    for (const snap of snapshots) {
      // Extract player IDs from the state JSON (lightweight — no full room parsing)
      let playerIds: string[] = [];
      try {
        const parsed = JSON.parse(snap.state);
        if (Array.isArray(parsed.players)) {
          playerIds = parsed.players.map((p: any) => p.id).filter(Boolean);
        }
      } catch {
        // State is malformed; proceed with empty playerIds
      }

      roomIndex.set(snap.roomId, {
        status: snap.status,
        updatedAt: snap.updatedAt,
        playerIds,
      });
      indexedCount++;
    }

    if (indexedCount > 0) {
      logger.info(`Indexed ${indexedCount} room(s) from DB snapshots (lazy load on demand)`);
    } else {
      logger.info('No room snapshots found in DB');
    }

    // Immediately purge stale snapshots on startup
    await purgeStaleSnapshots();
  } catch (err) {
    logger.error('Failed to restore room snapshots', { error: String(err) });
  }
}

/** Delete snapshots that are completed/cancelled OR older than the max age */
export async function purgeStaleSnapshots(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - SNAPSHOT_MAX_AGE_MS);

    // 1. Delete all finished-state snapshots
    const finishedResult = await prisma.roomSnapshot.deleteMany({
      where: { status: { in: ['gameover', 'completed', 'cancelled', 'forfeited'] } },
    });

    // 2. Delete any snapshot older than the cutoff regardless of status
    const staleResult = await prisma.roomSnapshot.deleteMany({
      where: { updatedAt: { lt: cutoff } },
    });

    const totalPurged = finishedResult.count + staleResult.count;
    if (totalPurged > 0) {
      logger.info(`Purged ${totalPurged} stale room snapshots`, {
        finished: finishedResult.count,
        expired: staleResult.count,
      });
    }
  } catch (err) {
    logger.error('Failed to purge stale snapshots', { error: String(err) });
  }
}

const SNAPSHOT_INTERVAL_MS = 10_000;
const PAUSED_SNAPSHOT_INTERVAL_MS = 60_000; // Paused rooms snapshot less frequently
const PURGE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

let snapshotTimer: ReturnType<typeof setInterval> | null = null;
let purgeTimer: ReturnType<typeof setInterval> | null = null;
let pausedTickCounter = 0;

export function startSnapshotInterval(): void {
  if (snapshotTimer) return;
  snapshotTimer = setInterval(() => {
    pausedTickCounter++;
    const snapshotPaused = (pausedTickCounter % 6 === 0); // Every 6th tick (~60s)

    for (const room of activeRooms.values()) {
      if (room.status === 'playing' || room.status === 'waiting') {
        enqueuePersist(room);
      } else if (room.status === 'paused' && snapshotPaused) {
        enqueuePersist(room);
      }
    }
  }, SNAPSHOT_INTERVAL_MS);
  logger.info(`Room snapshot interval started (${SNAPSHOT_INTERVAL_MS}ms)`);

  // Periodic stale snapshot purge
  if (!purgeTimer) {
    purgeTimer = setInterval(() => {
      purgeStaleSnapshots().catch(() => {});
    }, PURGE_INTERVAL_MS);
    logger.info(`Stale snapshot purge scheduled every ${PURGE_INTERVAL_MS / 60_000}min`);
  }
}

export function stopSnapshotInterval(): void {
  if (snapshotTimer) {
    clearInterval(snapshotTimer);
    snapshotTimer = null;
  }
  if (purgeTimer) {
    clearInterval(purgeTimer);
    purgeTimer = null;
  }
}
