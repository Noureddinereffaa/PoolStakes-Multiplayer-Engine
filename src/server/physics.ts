import { Ball } from '../types';

// ═══════════════════════════════════════════════════════════════
//  TABLE GEOMETRY
// ═══════════════════════════════════════════════════════════════
export const TABLE_W          = 800;
export const TABLE_H          = 400;
export const CUSHION          = 20;
export const BALL_R           = 10;
export const HEAD_STRING_X    = CUSHION + 220;
export const RACK_APEX_X      = 550;
export const RACK_APEX_Y      = 200;
export const RACK_COL_SPACING = BALL_R * 1.732050808;
export const FOOT_SPOT_X      = RACK_APEX_X + 2 * RACK_COL_SPACING;
export const FOOT_SPOT_Y      = RACK_APEX_Y;
export const POCKET_RADIUS    = 20;

export const MIN_X = CUSHION + BALL_R;
export const MAX_X = TABLE_W - CUSHION - BALL_R;
export const MIN_Y = CUSHION + BALL_R;
export const MAX_Y = TABLE_H - CUSHION - BALL_R;

// ═══════════════════════════════════════════════════════════════
//  PHYSICS CONFIG — single source of truth
// ═══════════════════════════════════════════════════════════════
export const PHYSICS = {
  // ── Timestep ──────────────────────────────────────────
  /** Fixed physics timestep (seconds) */
  FIXED_DT:           1 / 120,
  /** Sub-steps executed per call to simulatePhysicsStep */
  SUB_STEPS:          60,
  /** Base Gravity for friction calculation */
  GRAVITY:            980,

  // ── Friction ──────────────────────────────────────────
  /** Sliding friction coefficient */
  MU_SLIDE:           0.20,
  /** Rolling friction coefficient */
  MU_ROLL:            0.015,
  /** Speed threshold where slide transitions to roll */
  SLIDE_ROLL_SPEED:   15.0,

  // ── Collision ─────────────────────────────────────────
  /** Coefficient of restitution: ball→ball (professional: 0.95–0.97) */
  COR_BALL:           0.95,
  /** Coefficient of restitution: ball→cushion (professional: 0.80–0.85) */
  COR_CUSHION:        0.80,
  /** Coulomb friction tangential multiplier */
  MU_BALL:            0.015,
  /** Cushion tangential friction */
  MU_CUSHION:         0.15,
  /** Solver iterations for positional correction */
  SOLVER_ITERS:       10,

  // ── Spin / English ────────────────────────────────────
  /** Side spin → lateral curve strength */
  CURVE_FACTOR:       0.035,
  /** Top/back spin → follow/draw strength */
  LONG_FACTOR:        0.028,
  /** Swerve: pre-contact curve from heavy side spin */
  SWERVE_FACTOR:      0.012,
  /** Spin decay per second (fraction remaining) */
  SPIN_DECAY:         0.65,

  // ── Stability ─────────────────────────────────────────
  /** Speed below which a ball is force-stopped */
  STOP_THRESHOLD:     0.02,
  /** Maximum allowed ball speed (safe-guard) */
  MAX_SPEED:          4000,
} as const;

// ═══════════════════════════════════════════════════════════════
//  POCKETS
// ═══════════════════════════════════════════════════════════════
const POCKET_RADII = [24, 23, 24, 24, 23, 24];
export const POCKET_POS = [
  { x: CUSHION + 4,           y: CUSHION + 4           },
  { x: TABLE_W / 2,           y: CUSHION + 2           },
  { x: TABLE_W - CUSHION - 4, y: CUSHION + 4           },
  { x: CUSHION + 4,           y: TABLE_H - CUSHION - 4 },
  { x: TABLE_W / 2,           y: TABLE_H - CUSHION - 2 },
  { x: TABLE_W - CUSHION - 4, y: TABLE_H - CUSHION - 4 },
];

// ═══════════════════════════════════════════════════════════════
//  BALL COLORS
// ═══════════════════════════════════════════════════════════════
const BALL_COLORS: Record<number, string> = {
  1: '#E8C830',  2: '#2255C8',  3: '#CC3028',  4: '#6E44B8',
  5: '#E07018',  6: '#148B58',  7: '#8A2230',  8: '#111111',
  9: '#E8C030', 10: '#5580D8', 11: '#DD6058', 12: '#AD80D8',
 13: '#DD9830', 14: '#48B880', 15: '#9A2028',
};

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

/** Clamp speed to MAX_SPEED (safe-guard against explosions). */
function clampSpeed(b: Ball): void {
  const spdSq = b.vx * b.vx + b.vy * b.vy;
  if (spdSq > PHYSICS.MAX_SPEED * PHYSICS.MAX_SPEED) {
    const scale = PHYSICS.MAX_SPEED / Math.sqrt(spdSq);
    b.vx *= scale;
    b.vy *= scale;
  }
}

/** Wakes a ball from sleep state. */
function wake(b: Ball): void {
  if (b.sleeping) b.sleeping = false;
}

/** Force-stop a ball if below threshold. */
function checkSleep(b: Ball): void {
  if (b.isPocketed) return;
  const spdSq = b.vx * b.vx + b.vy * b.vy;
  if (spdSq <= PHYSICS.STOP_THRESHOLD * PHYSICS.STOP_THRESHOLD && Math.abs(b.spinX || 0) < 0.01 && Math.abs(b.spinY || 0) < 0.01) {
    b.vx = 0;
    b.vy = 0;
    b.spinX = 0;
    b.spinY = 0;
    b.sleeping = true;
  }
}

// ═══════════════════════════════════════════════════════════════
//  INITIAL SETUP
// ═══════════════════════════════════════════════════════════════
export function getInitialBalls(): Ball[] {
  const balls: Ball[] = [];
  balls.push({
    id: 0, x: 200, y: TABLE_H / 2,
    vx: 0, vy: 0, radius: BALL_R,
    isPocketed: false, sleeping: true,
    type: 'cue', color: '#FEFCFA',
    spinX: 0, spinY: 0,
  });

  const rackIds = [
    1, 9, 2, 10, 8, 3,
    4, 11, 5, 12,
    13, 6, 14, 7, 15,
  ];

  let idx = 0;
  for (let col = 0; col < 5; col++) {
    for (let row = 0; row <= col; row++) {
      const id = rackIds[idx++];
      const jitterX = id === 1 ? 0 : (Math.random() - 0.5) * 0.04;
      const jitterY = id === 1 ? 0 : (Math.random() - 0.5) * 0.04;
      const rx = RACK_APEX_X + col * RACK_COL_SPACING + jitterX;
      const ry = RACK_APEX_Y + (row - col * 0.5) * (BALL_R * 2) + jitterY;
      balls.push({
        id, x: rx, y: ry,
        vx: 0, vy: 0, radius: BALL_R,
        isPocketed: false, sleeping: true,
        type: id === 8 ? 'black' : id <= 7 ? 'solid' : 'stripe',
        color: BALL_COLORS[id],
        number: id,
        spinX: 0, spinY: 0,
      });
    }
  }
  return balls;
}

// ═══════════════════════════════════════════════════════════════
//  POWER → VELOCITY
// ═══════════════════════════════════════════════════════════════
export function powerToVelocity(powerPercent: number): number {
  const p = Math.max(0, Math.min(100, powerPercent)) / 100;
  // p^1.8 curve: extreme precision on low power, very explosive max power
  const cap = 48 * PHYSICS.SUB_STEPS;
  const v = cap * Math.pow(p, 1.8);
  return Math.min(cap, v);
}

export function breakPowerToVelocity(powerPercent: number): number {
  const p = Math.max(0, Math.min(100, powerPercent)) / 100;
  const multiplier = 0.5 + p; // Bonus multiplier for break shots
  return powerToVelocity(powerPercent) * multiplier;
}

// ═══════════════════════════════════════════════════════════════
//  FRICTION + SPIN  (sub-step)
// ═══════════════════════════════════════════════════════════════
function applyFrictionAndSpin(balls: Ball[], dt: number): void {
  const cfg = PHYSICS;
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.isPocketed || b.sleeping) continue;

    const spdSq = b.vx * b.vx + b.vy * b.vy;
    const spd = Math.sqrt(spdSq);

    // ── Hard stop ──────────────────────────────────────
    if (spd <= cfg.STOP_THRESHOLD && Math.abs(b.spinX || 0) < 0.01 && Math.abs(b.spinY || 0) < 0.01) {
      b.vx = 0; b.vy = 0;
      b.spinX = 0; b.spinY = 0;
      b.sleeping = true;
      continue;
    }

    // ── Linear Coulomb Friction (Realistic Settle) ──────
    // Blend from sliding to rolling friction
    let mu = cfg.MU_ROLL;
    if (spd > cfg.SLIDE_ROLL_SPEED) {
      const t = Math.min(1, (spd - cfg.SLIDE_ROLL_SPEED) / 100.0);
      mu = cfg.MU_ROLL + (cfg.MU_SLIDE - cfg.MU_ROLL) * t;
    }
    const deceleration = mu * cfg.GRAVITY;
    const speedDrop = deceleration * dt;

    if (spd <= speedDrop) {
      b.vx = 0;
      b.vy = 0;
    } else {
      const ratio = (spd - speedDrop) / spd;
      b.vx *= ratio;
      b.vy *= ratio;
    }

    // ── Cue ball spin effects ──────────────────────────
    if (b.id === 0 && spd > 0.05) {
      const sx = b.spinX || 0;
      const sy = b.spinY || 0;
      if (sx !== 0 || sy !== 0) {
        const nvx = b.vx;
        const nvy = b.vy;
        const nspd = Math.hypot(nvx, nvy);
        if (nspd > 0.05) {
          const px = -nvy / nspd;
          const py =  nvx / nspd;

          // Side spin → lateral curve
          const curve = sx * cfg.CURVE_FACTOR * nspd * dt;
          b.vx += px * curve;
          b.vy += py * curve;

          // Top/back spin → follow/draw along velocity
          const follow = sy * cfg.LONG_FACTOR * nspd * dt;
          b.vx += (nvx / nspd) * follow;
          b.vy += (nvy / nspd) * follow;

          // Swerve: heavy side spin curves pre-contact
          if (Math.abs(sx) > 0.3) {
            const swerve = cfg.SWERVE_FACTOR * (Math.abs(sx) - 0.3) * nspd * dt * Math.sign(sx);
            b.vx += px * swerve;
            b.vy += py * swerve;
          }
        }
      }
    }

    // ── Spin decay ─────────────────────────────────────
    const sx = b.spinX || 0;
    const sy = b.spinY || 0;
    if (sx !== 0 || sy !== 0) {
      const sd = Math.exp(-cfg.SPIN_DECAY * dt);
      b.spinX = sx * sd;
      b.spinY = sy * sd;
    }

    // ── Safety clamp ───────────────────────────────────
    clampSpeed(b);
  }
}

// ═══════════════════════════════════════════════════════════════
//  INTEGRATION  (sub-step)
// ═══════════════════════════════════════════════════════════════
function integrate(balls: Ball[], dt: number): void {
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.isPocketed || b.sleeping) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
}

// ═══════════════════════════════════════════════════════════════
//  CUSHION / RAIL  (sub-step)
// ═══════════════════════════════════════════════════════════════
function handleRails(balls: Ball[], tracker?: { firstContactBallId: number | null; cushionContactOccurred?: boolean }): void {
  const cfg = PHYSICS;
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.isPocketed || b.sleeping) continue;

    // Find deepest rail penetration
    let maxOverlap = 0;
    let rail: 'left' | 'right' | 'top' | 'bottom' | null = null;

    if (b.x < MIN_X && b.vx < 0) {
      const o = MIN_X - b.x;
      if (o > maxOverlap) { maxOverlap = o; rail = 'left'; }
    }
    if (b.x > MAX_X && b.vx > 0) {
      const o = b.x - MAX_X;
      if (o > maxOverlap) { maxOverlap = o; rail = 'right'; }
    }
    if (b.y < MIN_Y && b.vy < 0) {
      const o = MIN_Y - b.y;
      if (o > maxOverlap) { maxOverlap = o; rail = 'top'; }
    }
    if (b.y > MAX_Y && b.vy > 0) {
      const o = b.y - MAX_Y;
      if (o > maxOverlap) { maxOverlap = o; rail = 'bottom'; }
    }

    if (rail === null) continue;

    const sx = b.spinX || 0;
    const sy = b.spinY || 0;
    const corCush = cfg.COR_CUSHION;

    if (rail === 'left' || rail === 'right') {
      b.x = rail === 'left' ? MIN_X : MAX_X;
      const vn = b.vx;
      const tang = b.vy;
      // Normal reflection with restitution
      b.vx = -vn * corCush;
      // Tangential friction
      const dt_t = cfg.MU_CUSHION * Math.abs(vn);
      b.vy -= Math.sign(tang) * Math.min(Math.abs(tang), dt_t);
      // Spin influence: side spin → vertical deflection, top/back spin → horizontal boost
      const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const transfer = 0.3 + 0.3 * Math.min(1, spd / 15);
      b.vy += sx * transfer;
      b.spinX = -sx * (0.3 + 0.15 * Math.min(1, spd / 15));
      // Top/back spin adds follow/draw off the rail
      if (Math.abs(sy) > 0.05) {
        b.vx += sy * 0.15 * Math.sign(-vn);
      }
    } else {
      b.y = rail === 'top' ? MIN_Y : MAX_Y;
      const vn = b.vy;
      const tang = b.vx;
      b.vy = -vn * corCush;
      const dt_t = cfg.MU_CUSHION * Math.abs(vn);
      b.vx -= Math.sign(tang) * Math.min(Math.abs(tang), dt_t);
      const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const transfer = 0.3 + 0.3 * Math.min(1, spd / 15);
      b.vx -= sx * transfer;
      b.spinX = -sx * (0.3 + 0.15 * Math.min(1, spd / 15));
      if (Math.abs(sy) > 0.05) {
        b.vy += sy * 0.15 * Math.sign(-vn);
      }
    }

    // Ensure ball stays inside after correction
    b.x = Math.max(MIN_X, Math.min(MAX_X, b.x));
    b.y = Math.max(MIN_Y, Math.min(MAX_Y, b.y));

    if (tracker && tracker.firstContactBallId !== null) {
      tracker.cushionContactOccurred = true;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  POCKET DETECTION  (sub-step)
// ═══════════════════════════════════════════════════════════════
function detectPockets(balls: Ball[]): void {
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.isPocketed || b.sleeping) continue;
    for (let pi = 0; pi < POCKET_POS.length; pi++) {
      const p = POCKET_POS[pi];
      const r = POCKET_RADII[pi];
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      if (dx * dx + dy * dy >= r * r) continue;
      b.isPocketed = true;
      b.pocketedAtId = pi;  // record which pocket
      b.vx = 0; b.vy = 0;
      b.spinX = 0; b.spinY = 0;
      break;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  BALL–BALL COLLISION RESOLUTION  (solver iteration)
// ═══════════════════════════════════════════════════════════════
function resolveCollisions(balls: Ball[], tracker?: { firstContactBallId: number | null; cushionContactOccurred?: boolean }): void {
  const n = balls.length;
  const MIN_D2 = (BALL_R * 2) ** 2;
  const cfg = PHYSICS;
  const COR_TERM = -(1 + cfg.COR_BALL) * 0.5;

  for (let iter = 0; iter < cfg.SOLVER_ITERS; iter++) {
    let anyOverlap = false;

    for (let i = 0; i < n - 1; i++) {
      const b1 = balls[i];
      if (b1.isPocketed) continue;

      for (let j = i + 1; j < n; j++) {
        const b2 = balls[j];
        if (b2.isPocketed) continue;
        if (b1.sleeping && b2.sleeping) continue;

        const dx = b2.x - b1.x;
        const dy = b2.y - b1.y;
        const d2 = dx * dx + dy * dy;

        if (d2 >= MIN_D2) continue;

        anyOverlap = true;
        const dist = Math.sqrt(Math.max(0, d2)) || 1e-8;
        const nx   = dx / dist;
        const ny   = dy / dist;
        const tx   = -ny;
        const ty   =  nx;

        // ── Position correction (50%) ─────────────────
        const overlap = (BALL_R * 2 - dist) * 0.5;
        b1.x -= nx * overlap;
        b1.y -= ny * overlap;
        b2.x += nx * overlap;
        b2.y += ny * overlap;

        // Recompute normal after correction
        const rdx  = b2.x - b1.x;
        const rdy  = b2.y - b1.y;
        const rd   = Math.sqrt(Math.max(0, rdx * rdx + rdy * rdy)) || 1e-8;
        const rnx  = rdx / rd;
        const rny  = rdy / rd;

        // Normal relative velocity (approach speed)
        const rvx  = b1.vx - b2.vx;
        const rvy  = b1.vy - b2.vy;
        const vn   = rvx * rnx + rvy * rny;

        // Balls separating → skip
        if (vn < 0) continue;

        // Wake sleepers
        if (b1.sleeping) b1.sleeping = false;
        if (b2.sleeping) b2.sleeping = false;

        // ── Normal impulse ────────────────────────────
        const jn = COR_TERM * vn;
        b1.vx += jn * rnx;
        b1.vy += jn * rny;
        b2.vx -= jn * rnx;
        b2.vy -= jn * rny;

        // ── Tangential impulse (Coulomb friction) ────
        const rvx2 = b1.vx - b2.vx;
        const rvy2 = b1.vy - b2.vy;
        const vt   = rvx2 * tx + rvy2 * ty;
        const jt_raw = -vt * 0.5;
        const jt   = Math.max(-cfg.MU_BALL * Math.abs(jn), Math.min(cfg.MU_BALL * Math.abs(jn), jt_raw));
        b1.vx += jt * tx;
        b1.vy += jt * ty;
        b2.vx -= jt * tx;
        b2.vy -= jt * ty;

        // ── Throw (cut-induced deflection) ────────────
        if (iter === 0 && vn > cfg.STOP_THRESHOLD) {
          const rvMag = Math.sqrt(rvx * rvx + rvy * rvy) || 1;
          const cosCut = Math.abs(rnx * (rvx / rvMag) + rny * (rvy / rvMag));
          const throwAmount = 0.15 * (1 - cosCut) * Math.min(1, vn / 10);
          const sig = Math.sign(vt || 1);
          b2.vx += tx * throwAmount * sig;
          b2.vy += ty * throwAmount * sig;
          b1.vx -= tx * throwAmount * sig * 0.5;
          b1.vy -= ty * throwAmount * sig * 0.5;
        }

        // ── Cue spin transfer to target ball ──────────
        if (iter === 0 && vn > cfg.STOP_THRESHOLD && (b1.id === 0 || b2.id === 0)) {
          const cue    = b1.id === 0 ? b1 : b2;
          const tgt    = b1.id === 0 ? b2 : b1;
          const dir    = b1.id === 0 ? 1 : -1;
          const csx    = cue.spinX || 0;
          const csy    = cue.spinY || 0;
          const comboSpeed = Math.hypot(b1.vx, b1.vy) + Math.hypot(b2.vx, b2.vy);

          if (comboSpeed > 0.1 && (csx !== 0 || csy !== 0)) {
            const transfer = Math.min(1.0, comboSpeed * 0.025);
            tgt.vx += rnx * (csy * 1.2 * dir * transfer);
            tgt.vy += rny * (csy * 1.2 * dir * transfer);
            tgt.vx += tx  * (csx * 0.8 * dir * transfer);
            tgt.vy += ty  * (csx * 0.8 * dir * transfer);
          }

          cue.spinX = (cue.spinX || 0) * 0.70;
          cue.spinY = (cue.spinY || 0) * 0.65;
          tgt.spinY = (tgt.spinY || 0) + csy * 0.12 * dir;
          tgt.spinX = (tgt.spinX || 0) + csx * 0.08 * dir;
          // Keep spin bounded
          tgt.spinX = Math.max(-1, Math.min(1, tgt.spinX || 0));
          tgt.spinY = Math.max(-1, Math.min(1, tgt.spinY || 0));
        }

        // ── Track first ball contacted by cue ─────────
        if (iter === 0 && tracker && tracker.firstContactBallId === null) {
          if (b1.id === 0) tracker.firstContactBallId = b2.id;
          else if (b2.id === 0) tracker.firstContactBallId = b1.id;
        }

        // Post-collision sleep
        checkSleep(b1);
        checkSleep(b2);
        clampSpeed(b1);
        clampSpeed(b2);
      }
    }

    if (!anyOverlap) break;
  }
}

// ═══════════════════════════════════════════════════════════════
//  MAIN PHYSICS STEP
// ═══════════════════════════════════════════════════════════════
export function simulatePhysicsStep(
  balls: Ball[],
  tracker?: { firstContactBallId: number | null; cushionContactOccurred?: boolean }
): void {
  const cfg = PHYSICS;
  const dt = cfg.FIXED_DT;
  const subSteps = cfg.SUB_STEPS;
  // Scale dt per sub-step so total time = dt
  const subDt = dt / subSteps;

  for (let s = 0; s < subSteps; s++) {
    applyFrictionAndSpin(balls, subDt);
    integrate(balls, subDt);
    handleRails(balls, tracker);
    detectPockets(balls);
    resolveCollisions(balls, tracker);
  }

  // Final safety clamp on all balls
  for (const b of balls) {
    if (b.isPocketed) continue;
    clampSpeed(b);
    checkSleep(b);
  }
}

// ═══════════════════════════════════════════════════════════════
//  SINGLE-FRAME SIMULATION (alias, for client offline mode)
// ═══════════════════════════════════════════════════════════════
export function simulateOneFrame(balls: Ball[], tracker?: { firstContactBallId: number | null; cushionContactOccurred?: boolean }): void {
  simulatePhysicsStep(balls, tracker);
}

// ═══════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════
export function isAnyBallMoving(balls: Ball[]): boolean {
  const threshSq = PHYSICS.STOP_THRESHOLD * PHYSICS.STOP_THRESHOLD;
  return balls.some(b => !b.isPocketed && !b.sleeping && (b.vx * b.vx + b.vy * b.vy > threshSq || Math.abs(b.spinX || 0) >= 0.01 || Math.abs(b.spinY || 0) >= 0.01));
}

export function wakeAllForShot(balls: Ball[]): void {
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.isPocketed) continue;
    b.sleeping = false;
    if (b.id !== 0) {
      b.spinX = 0;
      b.spinY = 0;
    }
  }
}

export function forceSettleBalls(balls: Ball[]): void {
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.isPocketed) continue;
    b.vx = 0; b.vy = 0;
    b.spinX = 0; b.spinY = 0;
    b.sleeping = true;
  }
}

export function captureFrame(balls: Ball[]): Array<{ id: number; x: number; y: number; isPocketed: boolean }> {
  return balls.map(b => ({ id: b.id, x: b.x, y: b.y, isPocketed: b.isPocketed }));
}

// ═══════════════════════════════════════════════════════════════
//  YIELDING  (prevent physics from blocking event loop)
// ═══════════════════════════════════════════════════════════════
const YIELD_INTERVAL_ITERATIONS = 60;
const YIELD_TIME_THRESHOLD_MS = 16;

let _yieldIterationCounter = 0;
let _yieldStartTime = 0;

export function resetYieldTimer(): void {
  _yieldIterationCounter = 0;
  _yieldStartTime = Date.now();
}

export async function yieldIfNeeded(): Promise<void> {
  _yieldIterationCounter++;
  if (_yieldIterationCounter < YIELD_INTERVAL_ITERATIONS) return;
  _yieldIterationCounter = 0;
  const elapsed = Date.now() - _yieldStartTime;
  if (elapsed > YIELD_TIME_THRESHOLD_MS) {
    await new Promise<void>(resolve => setImmediate(resolve));
    _yieldStartTime = Date.now();
  }
}
