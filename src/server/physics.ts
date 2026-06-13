import { Ball } from '../types';

// ═══════════════════════════════════════════════════════
//  TABLE GEOMETRY
// ═══════════════════════════════════════════════════════
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
export const POCKET_RADIUS    = 20; // default, unused; see per-pocket below

// Bounds (ball center must stay within)
export const MIN_X = CUSHION + BALL_R;
export const MAX_X = TABLE_W - CUSHION - BALL_R;
export const MIN_Y = CUSHION + BALL_R;
export const MAX_Y = TABLE_H - CUSHION - BALL_R;

// ═══════════════════════════════════════════════════════
//  PHYSICS CONSTANTS (Calibrated to 8 Ball Pool feel)
// ═══════════════════════════════════════════════════════
const COR       = 0.92;   // ball-ball COR - Miniclip match: bouncier, ~8% energy loss per collision
const COR_R     = 0.75;   // ball-rail COR - Miniclip match: lively cushions for multi-bank shots
const MU_B      = 0.01;   // ball-ball friction - Miniclip match: phenolic resin, near-zero surface grab
const MU_RR     = 0.9982; // rolling friction/frame - longer, more natural rolls
const MU_RS     = 0.9935; // sliding friction/frame - slide decays slightly faster
const V_S       = 0.60;   // slide→roll transition speed threshold
const MU_RT     = 0.10;   // rail tangential friction - smoother rail slides (Miniclip feel)
const SUB       = 60;     // sub-steps - higher for smoother simulation
const S_IT      = 10;     // solver iterations - more accurate collision resolution

const K_CURVE   = 0.035;  // English curve (side spin) - Miniclip match: controlled, not exaggerated
const K_LONG    = 0.028;  // Draw/Follow (top/bottom spin) - Miniclip match: smooth action
const K_SWERVE  = 0.012;  // Swerve: pre-contact curve from heavy side spin (Miniclip match)
const SPIN_DEC  = 0.994;  // spin decay/frame - Miniclip match: spin fades naturally over shot travel

// ── Sleep / Hard-Stop Threshold ─────────────────────────
// Any ball below this speed is force-stopped and marked sleeping.
// MUST match the stop check inside applyFrictionAndSpin.
export const STOP_THRESHOLD = 0.01;
// ────────────────────────────────────────────────────────

// Ball-ball Coulomb impulse multiplier
const COR_TERM  = -(1 + COR) * 0.5;

// ═══════════════════════════════════════════════════════
//  POCKETS (8 Ball Pool style - forgiving, smooth)
// ═══════════════════════════════════════════════════════
// Corner pockets: 24px radius (generous), Side pockets: 23px
// More forgiving = closer to Miniclip feel
const POCKET_RADII        = [24, 23, 24, 24, 23, 24];

const POCKET_POS = [
  { x: CUSHION + 4,           y: CUSHION + 4           },
  { x: TABLE_W / 2,           y: CUSHION + 2           },
  { x: TABLE_W - CUSHION - 4, y: CUSHION + 4           },
  { x: CUSHION + 4,           y: TABLE_H - CUSHION - 4 },
  { x: TABLE_W / 2,           y: TABLE_H - CUSHION - 2 },
  { x: TABLE_W - CUSHION - 4, y: TABLE_H - CUSHION - 4 },
];

// ═══════════════════════════════════════════════════════
//  BALL COLORS
// ═══════════════════════════════════════════════════════
const BALL_COLORS: Record<number, string> = {
  1: '#E8C830',  2: '#2255C8',  3: '#CC3028',  4: '#6E44B8',
  5: '#E07018',  6: '#148B58',  7: '#8A2230',  8: '#111111',
  9: '#E8C030', 10: '#5580D8', 11: '#DD6058', 12: '#AD80D8',
 13: '#DD9830', 14: '#48B880', 15: '#9A2028',
};

// ═══════════════════════════════════════════════════════
//  INITIAL SETUP
// ═══════════════════════════════════════════════════════
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
      
      // Add a microscopic random variation (jitter) to simulate real-world physical imperfections.
      // This ensures that break shots are non-deterministic and realistic, breaking the perfect symmetry.
      // We keep the apex ball (id=1) exact to guarantee a solid first contact.
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

// ═══════════════════════════════════════════════════════
//  POWER → VELOCITY (8 Ball Pool calibrated curve)
//  8 Ball Pool uses: very gentle at low power, exponential at high
// ═══════════════════════════════════════════════════════
export function powerToVelocity(powerPercent: number): number {
  const p = Math.max(0, Math.min(100, powerPercent)) / 100;
  // 8 Ball Pool curve: starts very slow, accelerates exponentially
  // 0-30%: gentle, 30-70%: medium curve, 70-100%: steep
  if (p < 0.3) return Math.min(26, Math.pow(p / 0.3, 1.8) * 7.8);
  if (p < 0.7) return Math.min(26, 7.8 + Math.pow((p - 0.3) / 0.4, 1.4) * 10.2);
  return Math.min(26, 18 + Math.pow((p - 0.7) / 0.3, 1.1) * 8);
}

// ═══════════════════════════════════════════════════════
//  SUB-STEP FUNCTIONS
// ═══════════════════════════════════════════════════════

function applyFrictionAndSpin(balls: Ball[], dt: number): void {
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.isPocketed || b.sleeping) continue;

    const vx = b.vx;
    const vy = b.vy;
    const spdSq = vx * vx + vy * vy;
    const spd = Math.sqrt(spdSq);

    // ── HARD STOP + SLEEP ──────────────────────────────
    // Single unified threshold: any ball at or below STOP_THRESHOLD
    // is force-stopped AND put to sleep. No exceptions.
    if (spd <= STOP_THRESHOLD) {
      b.vx = 0;
      b.vy = 0;
      b.spinX = 0;
      b.spinY = 0;
      b.sleeping = true;
      continue;
    }

    // ── Friction (exponential decay — physically correct) ──
    const t = Math.min(1, spd / V_S);
    const mu = MU_RR + (MU_RS - MU_RR) * (t * t);
    const f = Math.pow(mu, dt);
    b.vx = vx * f;
    b.vy = vy * f;

    // ── Cue ball spin effects ──────────────────────────
    const sx = b.spinX || 0;
    const sy = b.spinY || 0;

    if (b.id === 0 && spd > 0.05 && (sx !== 0 || sy !== 0)) {
      // Capture friction-only velocity direction BEFORE any spin modifications
      const nvx = b.vx;
      const nvy = b.vy;
      const nspd = Math.hypot(nvx, nvy);
      if (nspd > 0.05) {
        const px = -nvy / nspd;
        const py =  nvx / nspd;

        // Side spin → curve (english) — perpendicular to velocity
        const curve = sx * K_CURVE * nspd * dt;
        b.vx = nvx + px * curve;
        b.vy = nvy + py * curve;

        // Top/bottom spin → follow/draw — parallel to friction-only direction
        const le = sy * K_LONG * nspd * dt;
        b.vx += (nvx / nspd) * le;
        b.vy += (nvy / nspd) * le;

        // Swerve: heavy side spin induces pre-contact curve
        if (Math.abs(sx) > 0.3) {
          const swerveForce = K_SWERVE * (Math.abs(sx) - 0.3) * nspd * dt * Math.sign(sx);
          b.vx += px * swerveForce;
          b.vy += py * swerveForce;
        }
      }
    }

    // ── Spin decay (all balls) ─────────────────────────
    if (Math.abs(sx) > 0 || Math.abs(sy) > 0) {
      const sd = Math.pow(SPIN_DEC, dt);
      b.spinX = sx * sd;
      b.spinY = sy * sd;
    }
  }
}

function integrate(balls: Ball[], dt: number): void {
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.isPocketed || b.sleeping) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
}

function handleRails(balls: Ball[], tracker?: { firstContactBallId: number | null; cushionContactOccurred?: boolean }): void {
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.isPocketed || b.sleeping) continue;

    const sx = b.spinX || 0;
    let hit = false;

    // اختر الحافة الأكثر اختراقاً لمنع معالجة زاويتين في نفس sub-step
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

    if (rail === 'left') {
      b.x = MIN_X;
      const vn = b.vx;
      b.vx = -vn * COR_R;
      const tang = b.vy;
      const dt_t = MU_RT * Math.abs(vn);
      b.vy -= Math.sign(tang) * Math.min(Math.abs(tang), dt_t);
      const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const railTransfer = 0.3 + 0.3 * Math.min(1, spd / 15);
      const railRetain = 0.3 + 0.15 * Math.min(1, spd / 15);
      b.vy -= sx * railTransfer; b.spinX = -sx * railRetain;
      hit = true;
    } else if (rail === 'right') {
      b.x = MAX_X;
      const vn = b.vx;
      b.vx = -vn * COR_R;
      const tang = b.vy;
      const dt_t = MU_RT * Math.abs(vn);
      b.vy -= Math.sign(tang) * Math.min(Math.abs(tang), dt_t);
      const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const railTransfer = 0.3 + 0.3 * Math.min(1, spd / 15);
      const railRetain = 0.3 + 0.15 * Math.min(1, spd / 15);
      b.vy += sx * railTransfer; b.spinX = -sx * railRetain;
      hit = true;
    } else if (rail === 'top') {
      b.y = MIN_Y;
      const vn = b.vy;
      b.vy = -vn * COR_R;
      const tang = b.vx;
      const dt_t = MU_RT * Math.abs(vn);
      b.vx -= Math.sign(tang) * Math.min(Math.abs(tang), dt_t);
      const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const railTransfer = 0.3 + 0.3 * Math.min(1, spd / 15);
      const railRetain = 0.3 + 0.15 * Math.min(1, spd / 15);
      b.vx += sx * railTransfer; b.spinX = -sx * railRetain;
      hit = true;
    } else if (rail === 'bottom') {
      b.y = MAX_Y;
      const vn = b.vy;
      b.vy = -vn * COR_R;
      const tang = b.vx;
      const dt_t = MU_RT * Math.abs(vn);
      b.vx -= Math.sign(tang) * Math.min(Math.abs(tang), dt_t);
      const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const railTransfer = 0.3 + 0.3 * Math.min(1, spd / 15);
      const railRetain = 0.3 + 0.15 * Math.min(1, spd / 15);
      b.vx -= sx * railTransfer; b.spinX = -sx * railRetain;
      hit = true;
    }

    if (hit && tracker && tracker.firstContactBallId !== null) {
      tracker.cushionContactOccurred = true;
    }
  }
}

function detectPockets(balls: Ball[]): void {
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.isPocketed || b.sleeping) continue;

    for (let pi = 0; pi < POCKET_POS.length; pi++) {
      const p = POCKET_POS[pi];
      const r = POCKET_RADII[pi];
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      const d2 = dx * dx + dy * dy;

      if (d2 >= r * r) continue;

      // Ball center is within pocket radius → >50% of ball over the hole → pocket it
      b.isPocketed = true;
      b.vx = 0;
      b.vy = 0;
      b.spinX = 0;
      b.spinY = 0;
      break;
    }
  }
}

function resolveCollisions(balls: Ball[], tracker?: { firstContactBallId: number | null; cushionContactOccurred?: boolean }): void {
  const n = balls.length;
  const MIN_D2 = (BALL_R * 2) ** 2;

  // ── Post-collision hard stop ─────────────────────────
  // After impulse is applied, if a ball's resulting velocity
  // is below STOP_THRESHOLD, force-zero it and mark sleeping.
  const clampToSleep = (b: Ball) => {
    if (b.isPocketed) return;
    if (Math.hypot(b.vx, b.vy) < STOP_THRESHOLD) {
      b.vx = 0; b.vy = 0;
      b.spinX = 0; b.spinY = 0;
      b.sleeping = true;
    }
  };

  for (let iter = 0; iter < S_IT; iter++) {
    let anyOverlap = false;

    for (let i = 0; i < n - 1; i++) {
      const b1 = balls[i];
      if (b1.isPocketed) continue;

      for (let j = i + 1; j < n; j++) {
        const b2 = balls[j];
        if (b2.isPocketed) continue;

        // ── SLEEP CHECK ─────────────────────────────────
        // If both are sleeping, skip entirely.
        // If one is sleeping, it can be awakened by the moving ball.
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

        // Position correction (50%) — always applied regardless of sleep
        const minD = BALL_R * 2;
        const overlap = (minD - dist) * 0.50;
        b1.x -= nx * overlap;
        b1.y -= ny * overlap;
        b2.x += nx * overlap;
        b2.y += ny * overlap;

        // Recalculate normal after position correction
        const rdx  = b2.x - b1.x;
        const rdy  = b2.y - b1.y;
        const rd   = Math.sqrt(Math.max(0, rdx * rdx + rdy * rdy)) || 1e-8;
        const rnx  = rdx / rd;
        const rny  = rdy / rd;

        // Normal relative velocity
        const rvx  = b1.vx - b2.vx;
        const rvy  = b1.vy - b2.vy;
        const vn   = rvx * rnx + rvy * rny;

        if (vn < 0) continue;

        // ── WAKE SLEEPING BALLS ─────────────────────────
        // A moving ball hitting a sleeping ball wakes it up.
        if (b1.sleeping) b1.sleeping = false;
        if (b2.sleeping) b2.sleeping = false;

        // Normal impulse (COR)
        const jn = COR_TERM * vn;
        b1.vx += jn * rnx;
        b1.vy += jn * rny;
        b2.vx -= jn * rnx;
        b2.vy -= jn * rny;

        // Tangential impulse (Coulomb friction)
        const rvx2 = b1.vx - b2.vx;
        const rvy2 = b1.vy - b2.vy;
        const vt   = rvx2 * tx + rvy2 * ty;

        const jt_raw = -vt * 0.5;
        const jt     = Math.max(-MU_B * Math.abs(jn), Math.min(MU_B * Math.abs(jn), jt_raw));
        b1.vx += jt * tx;
        b1.vy += jt * ty;
        b2.vx -= jt * tx;
        b2.vy -= jt * ty;

        // Collision-induced throw — MIN SPEED GATE
        // Only apply throw if the collision speed is significant.
        // Prevents micro-throw from creating ghost velocity.
        if (iter === 0 && vn > STOP_THRESHOLD) {
          const cosCut = Math.abs(rnx * (rvx / (Math.sqrt(rvx * rvx + rvy * rvy) || 1)) + rny * (rvy / (Math.sqrt(rvx * rvx + rvy * rvy) || 1)));
          const throwAmount = 0.15 * (1 - cosCut) * Math.min(1, vn / 10);
          b2.vx += tx * throwAmount * Math.sign(vt || 1);
          b2.vy += ty * throwAmount * Math.sign(vt || 1);
          b1.vx -= tx * throwAmount * Math.sign(vt || 1) * 0.5;
          b1.vy -= ty * throwAmount * Math.sign(vt || 1) * 0.5;
        }

        // Cue spin transfer
        if (iter === 0 && (b1.id === 0 || b2.id === 0) && vn > STOP_THRESHOLD) {
          const cue    = b1.id === 0 ? b1 : b2;
          const tgt    = b1.id === 0 ? b2 : b1;
          const dir    = b1.id === 0 ? 1 : -1;
          const sx     = cue.spinX || 0;
          const sy     = cue.spinY || 0;
          const spd    = Math.hypot(b1.vx, b1.vy) + Math.hypot(b2.vx, b2.vy);

          if (spd > 0.1) {
            const transfer = Math.min(1.0, spd * 0.025);
            tgt.vx += rnx * (sy * 1.2 * dir * transfer);
            tgt.vy += rny * (sy * 1.2 * dir * transfer);
            tgt.vx += tx  * (sx * 0.8 * dir * transfer);
            tgt.vy += ty  * (sx * 0.8 * dir * transfer);
          }

          cue.spinY = sy * 0.65;
          cue.spinX = sx * 0.70;
          tgt.spinY = (tgt.spinY || 0) + sy * 0.12 * dir;
          tgt.spinX = (tgt.spinX || 0) + sx * 0.08 * dir;
        }

        // Track first contact
        if (iter === 0 && tracker && tracker.firstContactBallId === null) {
          if (b1.id === 0) tracker.firstContactBallId = b2.id;
          else if (b2.id === 0) tracker.firstContactBallId = b1.id;
        }

        // ── POST-COLLISION HARD STOP ────────────────────
        // Immediately clamp any ball whose collision result
        // is below threshold, preventing ghost micro-velocity.
        clampToSleep(b1);
        clampToSleep(b2);
      }
    }

    if (!anyOverlap) break;
  }
}

// ═══════════════════════════════════════════════════════
//  MAIN PHYSICS STEP
// ═══════════════════════════════════════════════════════
export function simulatePhysicsStep(
  balls: Ball[],
  tracker?: { firstContactBallId: number | null; cushionContactOccurred?: boolean }
): void {
  const dt = 1 / SUB;
  for (let s = 0; s < SUB; s++) {
    applyFrictionAndSpin(balls, dt);
    integrate(balls, dt);
    handleRails(balls, tracker);
    detectPockets(balls);
    resolveCollisions(balls, tracker);
  }
}

// ═══════════════════════════════════════════════════════
//  SINGLE-FRAME SIMULATION (for client offline mode)
//  Runs one full frame with friction, spin, collisions.
//  Returns the number of frames simulated.
// ═══════════════════════════════════════════════════════
export function simulateOneFrame(balls: Ball[], tracker?: { firstContactBallId: number | null; cushionContactOccurred?: boolean }): void {
  simulatePhysicsStep(balls, tracker);
}

export function isAnyBallMoving(balls: Ball[]): boolean {
  return balls.some(b => !b.isPocketed && !b.sleeping && Math.hypot(b.vx, b.vy) > STOP_THRESHOLD);
}

/**
 * Wake all sleeping balls (called at the START of a new shot).
 * The cue ball receives new velocity; other balls are reset
 * to moving state so they can participate in collisions.
 */
export function wakeAllForShot(balls: Ball[]): void {
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.isPocketed) continue;
    b.sleeping = false;
    // Reset spin on ALL non-cue balls (cue spin set by shooter)
    if (b.id !== 0) {
      b.spinX = 0;
      b.spinY = 0;
    }
  }
}

/**
 * After the simulation loop ends (or max steps reached),
 * UNCONDITIONALLY zero ALL ball velocities and mark them sleeping.
 * This guarantees NO residual velocity across turn boundaries,
 * even if maxSteps was reached with balls still technically "moving."
 */
export function forceSettleBalls(balls: Ball[]): void {
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.isPocketed) continue;
    b.vx = 0;
    b.vy = 0;
    b.spinX = 0;
    b.spinY = 0;
    b.sleeping = true;
  }
}

export function captureFrame(balls: Ball[]): Array<{ id: number; x: number; y: number; isPocketed: boolean }> {
  return balls.map(b => ({ id: b.id, x: b.x, y: b.y, isPocketed: b.isPocketed }));
}

/**
 * Yield to the event loop if the simulation has been running too long.
 * Prevents physics from blocking other WebSocket messages.
 */
const YIELD_INTERVAL_ITERATIONS = 60; // Yield every ~60 physics frames (~1s simulated)
const YIELD_TIME_THRESHOLD_MS = 16;    // Yield if wall-clock elapsed > 16ms

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
