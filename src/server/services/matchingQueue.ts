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
let queueLock = false;
const QUEUE_LOCK_WAIT_MS = 5000;

async function acquireQueueLock(): Promise<boolean> {
  const deadline = Date.now() + QUEUE_LOCK_WAIT_MS;
  while (queueLock) {
    if (Date.now() > deadline) return false;
    await new Promise(r => setTimeout(r, 10));
  }
  queueLock = true;
  return true;
}

function releaseQueueLock(): void {
  queueLock = false;
}

export async function addToQueue(ws: WebSocket, userId: string, username: string, stake: number): Promise<boolean> {
  if (!await acquireQueueLock()) return false;
  try {
    for (const [, q] of queues) {
      if (q.some(e => e.ws === ws || e.userId === userId)) return true;
    }
    if (!queues.has(stake)) queues.set(stake, []);
    queues.get(stake)!.push({ ws, userId, username, stake, joinedAt: Date.now() });
    pushEventLog('queue_added', { userId, username, stake, queueSize: queues.get(stake)!.length });
    return true;
  } finally {
    releaseQueueLock();
  }
}

export async function removeFromQueue(ws: WebSocket, userId?: string): Promise<void> {
  if (!await acquireQueueLock()) return;
  try {
    for (const [stake, queue] of queues) {
      const idx = queue.findIndex(e => e.ws === ws || e.userId === userId);
      if (idx !== -1) {
        const removed = queue.splice(idx, 1)[0];
        if (queue.length === 0) queues.delete(stake);
        pushEventLog('queue_removed', { userId: removed.userId, username: removed.username, stake: removed.stake });
        return;
      }
    }
  } finally {
    releaseQueueLock();
  }
}

export async function tryMatch(stake: number): Promise<{ first: WaitingEntry; second: WaitingEntry } | null> {
  if (!await acquireQueueLock()) return null;
  try {
    const queue = queues.get(stake);
    if (!queue || queue.length < 2) return null;

    const first = queue.shift()!;
    const secondIdx = queue.findIndex(e => e.ws !== first.ws && e.userId !== first.userId);
    if (secondIdx === -1) {
      queue.unshift(first);
      return null;
    }
    const second = queue.splice(secondIdx, 1)[0];
    if (queue.length === 0) queues.delete(stake);

    pushEventLog('queue_matched', { stake, firstId: first.userId, secondId: second.userId });
    return { first, second };
  } finally {
    releaseQueueLock();
  }
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
