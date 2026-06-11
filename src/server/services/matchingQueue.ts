import { WebSocket } from 'ws';
import { pushEventLog } from '../state';

interface WaitingEntry {
  ws: WebSocket;
  userId: string;
  username: string;
  stake: number;
  joinedAt: number;
}

const queues = new Map<number, WaitingEntry[]>();
const MAX_QUEUE_SIZE = 100;

// ── Per-stake async mutex ──────────────────────────────
const stakeLocks = new Map<number, Array<() => void>>();
const stakeLocked = new Set<number>();

function acquireStakeLock(stake: number): Promise<void> {
  return new Promise(resolve => {
    if (stakeLocked.has(stake)) {
      if (!stakeLocks.has(stake)) stakeLocks.set(stake, []);
      stakeLocks.get(stake)!.push(resolve);
    } else {
      stakeLocked.add(stake);
      resolve();
    }
  });
}

function releaseStakeLock(stake: number): void {
  const next = stakeLocks.get(stake)?.shift();
  if (next) next();
  else {
    stakeLocked.delete(stake);
    stakeLocks.delete(stake);
  }
}

// ── Queue operations ───────────────────────────────────

function sweepStaleEntries(): void {
  for (const [stake, queue] of queues) {
    const alive = queue.filter(e => e.ws.readyState === WebSocket.OPEN);
    if (alive.length !== queue.length) {
      if (alive.length === 0) queues.delete(stake);
      else queues.set(stake, alive);
    }
  }
}

export async function addToQueue(ws: WebSocket, userId: string, username: string, stake: number): Promise<boolean> {
  await acquireStakeLock(stake);
  try {
    sweepStaleEntries();
    for (const [, q] of queues) {
      if (q.some(e => e.ws === ws || e.userId === userId)) return true;
    }
    const existing = queues.get(stake);
    if (existing && existing.length >= MAX_QUEUE_SIZE) return false;
    if (!existing) queues.set(stake, []);
    queues.get(stake)!.push({ ws, userId, username, stake, joinedAt: Date.now() });
    pushEventLog('queue_added', { userId, username, stake, queueSize: queues.get(stake)!.length });
    return true;
  } finally {
    releaseStakeLock(stake);
  }
}

export async function removeFromQueue(ws: WebSocket, userId?: string): Promise<void> {
  // Need to try all stakes since we don't know which one the user is in
  let targetStake: number | undefined;
  for (const [stake, queue] of queues) {
    if (queue.some(e => e.ws === ws || e.userId === userId)) {
      targetStake = stake;
      break;
    }
  }
  if (targetStake === undefined) return;

  await acquireStakeLock(targetStake);
  try {
    const queue = queues.get(targetStake);
    if (!queue) return;
    const idx = queue.findIndex(e => e.ws === ws || e.userId === userId);
    if (idx !== -1) {
      const removed = queue.splice(idx, 1)[0];
      if (queue.length === 0) queues.delete(targetStake);
      pushEventLog('queue_removed', { userId: removed.userId, username: removed.username, stake: removed.stake });
    }
  } finally {
    releaseStakeLock(targetStake);
  }
}

export async function tryMatch(stake: number): Promise<{ first: WaitingEntry; second: WaitingEntry } | null> {
  await acquireStakeLock(stake);
  try {
    // Sweep stale entries before matching
    const queue = queues.get(stake);
    if (!queue || queue.length < 2) return null;
    const alive = queue.filter(e => e.ws.readyState === WebSocket.OPEN);
    if (alive.length < 2) {
      if (alive.length === 0) queues.delete(stake);
      else queues.set(stake, alive);
      return null;
    }
    // Rebuild with stale entries removed
    queues.set(stake, alive);

    const first = alive.shift()!;
    const secondIdx = alive.findIndex(e => e.ws !== first.ws && e.userId !== first.userId);
    if (secondIdx === -1) {
      alive.unshift(first);
      return null;
    }
    const second = alive.splice(secondIdx, 1)[0];
    if (alive.length === 0) queues.delete(stake);

    pushEventLog('queue_matched', { stake, firstId: first.userId, secondId: second.userId });
    return { first, second };
  } finally {
    releaseStakeLock(stake);
  }
}

export function getAllQueueSizes(): Array<{ stake: number; size: number }> {
  return Array.from(queues.entries()).map(([stake, entries]) => ({ stake, size: entries.length }));
}

export function getQueueSize(stake: number): number {
  return queues.get(stake)?.length || 0;
}

export function isInQueue(ws: WebSocket, userId?: string): boolean {
  for (const queue of queues.values()) {
    if (queue.some(e => e.ws === ws || e.userId === userId)) return true;
  }
  return false;
}
