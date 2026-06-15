// Phase 1.4 — Lightweight physics telemetry logger
// Passive, append-only, sampleable. Zero behavioral impact on simulation.

export type TelemetryEventType =
  | 'shot_initiated'
  | 'shot_complete'
  | 'ball_collision'
  | 'cushion_collision'
  | 'pocket_captured'
  | 'ball_settled';

export interface TelemetryEvent {
  type: TelemetryEventType;
  ts: number;
  shotId: number;
  data: Record<string, unknown>;
}

// ── Global ring buffer ────────────────────────────────────────
const MAX_EVENTS = 10000;
const buffer: TelemetryEvent[] = [];
let nextShotId = 0;
let sampleRate = 1; // 1 = every shot, 2 = every 2nd, etc.

let enabled = true;

export function setTelemetryEnabled(v: boolean): void { enabled = v; }
export function setSampleRate(rate: number): void { sampleRate = Math.max(1, Math.floor(rate)); }
export function allocateShotId(): number { return ++nextShotId; }

export function pushEvent(type: TelemetryEventType, data: Record<string, unknown>, shotId: number): void {
  if (!enabled) return;
  if (buffer.length >= MAX_EVENTS) buffer.shift();
  buffer.push({ type, ts: Date.now(), shotId, data });
}

export function flushEvents(): TelemetryEvent[] {
  const copy = buffer.slice();
  buffer.length = 0;
  return copy;
}

export function peekEvents(): ReadonlyArray<TelemetryEvent> {
  return buffer;
}

export function clearEvents(): void {
  buffer.length = 0;
}

/** Build a context object for a ball collision event. */
export function collisionData(
  b1Id: number, b2Id: number,
  vn: number, vt: number, cor: number,
  d2: number
): Record<string, unknown> {
  return { b1Id, b2Id, vn, vt, cor, sepSq: d2 };
}

/** Build a context object for a cushion event. */
export function cushionData(
  ballId: number, rail: string,
  vnBefore: number, vnAfter: number,
  spd: number
): Record<string, unknown> {
  return { ballId, rail, vnBefore, vnAfter, cor: Math.abs(vnAfter / (vnBefore || 1e-8)), spd };
}

/** Build a context object for a pocket event. */
export function pocketData(
  ballId: number, pocketIdx: number,
  speed: number, distFromCenter: number
): Record<string, unknown> {
  return { ballId, pocketIdx, speed, distFromCenter };
}
