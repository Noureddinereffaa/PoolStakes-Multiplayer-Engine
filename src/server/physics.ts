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
//  PHYSICS CONSTANTS (Aramith Pro Cup calibrated)
// ═══════════════════════════════════════════════════════
const COR       = 0.88;   // ball-ball COR (was 0.93)
const COR_R     = 0.72;   // ball-rail COR (was 0.79)
const MU_B      = 0.20;   // ball-ball friction
const MU_RR     = 0.9968; // rolling friction/frame
const MU_RS     = 0.9910; // sliding friction/frame
const V_S       = 0.60;   // slide→roll transition (was 0.40)
const MU_RT     = 0.15;   // rail tangential friction
const SUB       = 48;     // sub-steps
const S_IT      = 8;      // solver iterations

const K_CURVE   = 0.035;  // English curve (was 0.028)
const K_LONG    = 0.028;  // Draw/Follow (was 0.035)
const SPIN_DEC  = 0.997;  // spin decay/frame

// Ball-ball Coulomb impulse multiplier
const COR_TERM  = -(1 + COR) * 0.5;

// ═══════════════════════════════════════════════════════
//  POCKETS
// ═══════════════════════════════════════════════════════
// Corner pockets are tighter (18) than middle pockets (22)
const POCKET_RADII        = [22, 26, 22, 22, 26, 22];
const POCKET_INNER_FACTOR = 0.92;
const POCKET_ACCEPT_DEG   = 75; // acceptance angle in degrees

const POCKET_POS = [
  { x: CUSHION + 3,           y: CUSHION + 3           },
  { x: TABLE_W / 2,           y: CUSHION               },
  { x: TABLE_W - CUSHION - 3, y: CUSHION + 3           },
  { x: CUSHION + 3,           y: TABLE_H - CUSHION - 3 },
  { x: TABLE_W / 2,           y: TABLE_H - CUSHION     },
  { x: TABLE_W - CUSHION - 3, y: TABLE_H - CUSHION - 3 },
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
    isPocketed: false, type: 'cue', color: '#FEFCFA',
    spinX: 0, spinY: 0,
  });

  const rackIds = [
    1, 9, 2, 10, 8, 3,
    4, 11, 5, 12,
    13, 6, 14, 7, 15,
  ];

  let idx = 0;
  for (let col = 0; col < 5; col++) {
    const rx = RACK_APEX_X + col * RACK_COL_SPACING;
    for (let row = 0; row <= col; row++) {
      const id = rackIds[idx++];
      const ry = RACK_APEX_Y + (row - col * 0.5) * (BALL_R * 2);
      balls.push({
        id, x: rx, y: ry,
        vx: 0, vy: 0, radius: BALL_R,
        isPocketed: false,
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
//  POWER → VELOCITY
//  Shared function for both server and client
// ═══════════════════════════════════════════════════════
export function powerToVelocity(powerPercent: number): number {
  const p = Math.max(0, Math.min(100, powerPercent)) / 100;
  return Math.min(26, Math.pow(p, 1.15) * 26);
}

// ═══════════════════════════════════════════════════════
//  SUB-STEP FUNCTIONS
// ═══════════════════════════════════════════════════════

function applyFrictionAndSpin(balls: Ball[], dt: number): void {
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.isPocketed) continue;

    const vx = b.vx;
    const vy = b.vy;
    const spdSq = vx * vx + vy * vy;

    // Dead-ball stop
    if (spdSq < 0.01) {
      b.vx = 0;
      b.vy = 0;
      continue;
    }

    // Gradual slide→roll friction
    const spd = Math.sqrt(spdSq);
    const t = Math.min(1, spd / V_S);
    const mu = MU_RR + (MU_RS - MU_RR) * (t * t);
    const f = Math.pow(mu, dt);
    b.vx = vx * f;
    b.vy = vy * f;

    // Cue ball spin
    if (b.id === 0) {
      const sx = b.spinX || 0;
      const sy = b.spinY || 0;

      if (spd > 0.05 && (sx !== 0 || sy !== 0)) {
        const nvx = b.vx;
        const nvy = b.vy;
        const nspd = Math.sqrt(nvx * nvx + nvy * nvy);
        if (nspd > 0.05) {
          const px = -nvy / nspd;
          const py =  nvx / nspd;

          const curve = sx * K_CURVE * nspd * dt;
          b.vx = nvx + px * curve;
          b.vy = nvy + py * curve;

          const le = sy * K_LONG * nspd * dt;
          b.vx += (nvx / nspd) * le;
          b.vy += (nvy / nspd) * le;
        }
      }

      const sd = Math.pow(SPIN_DEC, dt);
      b.spinX = (b.spinX || 0) * sd;
      b.spinY = (b.spinY || 0) * sd;
    }
  }
}

function integrate(balls: Ball[], dt: number): void {
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.isPocketed) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
}

function handleRails(balls: Ball[], tracker?: { firstContactBallId: number | null; cushionContactOccurred?: boolean }): void {
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.isPocketed) continue;

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
      b.vy -= sx * 0.9; b.spinX = -sx * 0.30;
      hit = true;
    } else if (rail === 'right') {
      b.x = MAX_X;
      const vn = b.vx;
      b.vx = -vn * COR_R;
      const tang = b.vy;
      const dt_t = MU_RT * Math.abs(vn);
      b.vy -= Math.sign(tang) * Math.min(Math.abs(tang), dt_t);
      b.vy += sx * 0.9; b.spinX = -sx * 0.30;
      hit = true;
    } else if (rail === 'top') {
      b.y = MIN_Y;
      const vn = b.vy;
      b.vy = -vn * COR_R;
      const tang = b.vx;
      const dt_t = MU_RT * Math.abs(vn);
      b.vx -= Math.sign(tang) * Math.min(Math.abs(tang), dt_t);
      b.vx += sx * 0.9; b.spinX = -sx * 0.30;
      hit = true;
    } else if (rail === 'bottom') {
      b.y = MAX_Y;
      const vn = b.vy;
      b.vy = -vn * COR_R;
      const tang = b.vx;
      const dt_t = MU_RT * Math.abs(vn);
      b.vx -= Math.sign(tang) * Math.min(Math.abs(tang), dt_t);
      b.vx -= sx * 0.9; b.spinX = -sx * 0.30;
      hit = true;
    }

    if (hit && tracker && tracker.firstContactBallId !== null) {
      tracker.cushionContactOccurred = true;
    }
  }
}

function detectPockets(balls: Ball[]): void {
  const MAX_COS = Math.cos(POCKET_ACCEPT_DEG * Math.PI / 180);
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.isPocketed) continue;

    for (let pi = 0; pi < POCKET_POS.length; pi++) {
      const p = POCKET_POS[pi];
      const r = POCKET_RADII[pi];
      const r2 = r * r;
      const inner2 = (r * POCKET_INNER_FACTOR) ** 2;
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      const d2 = dx * dx + dy * dy;

      if (d2 >= r2) continue;

      if (d2 >= inner2) {
        const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (spd > 0.05) {
          const dot = -(b.vx * dx + b.vy * dy) / (spd * Math.sqrt(d2));
          if (dot < MAX_COS) continue;
        }
      }

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
  const MIN_D2 = (BALL_R * 2) ** 2; // 400 — all balls share the same radius

  for (let iter = 0; iter < S_IT; iter++) {
    let anyOverlap = false;

    for (let i = 0; i < n - 1; i++) {
      const b1 = balls[i];
      if (b1.isPocketed) continue;

      for (let j = i + 1; j < n; j++) {
        const b2 = balls[j];
        if (b2.isPocketed) continue;

        const dx = b2.x - b1.x;
        const dy = b2.y - b1.y;
        const d2 = dx * dx + dy * dy;

        if (d2 >= MIN_D2) continue;

        anyOverlap = true;
        const dist = Math.sqrt(d2) || 1e-8;
        const nx   = dx / dist;
        const ny   = dy / dist;
        const tx   = -ny;
        const ty   =  nx;

        // Position correction (50%)
        const minD = BALL_R * 2;
        const overlap = (minD - dist) * 0.50;
        b1.x -= nx * overlap;
        b1.y -= ny * overlap;
        b2.x += nx * overlap;
        b2.y += ny * overlap;

        // Recalculate normal after position correction
        const rdx  = b2.x - b1.x;
        const rdy  = b2.y - b1.y;
        const rd   = Math.sqrt(rdx * rdx + rdy * rdy) || 1e-8;
        const rnx  = rdx / rd;
        const rny  = rdy / rd;

        // Normal relative velocity
        const rvx  = b1.vx - b2.vx;
        const rvy  = b1.vy - b2.vy;
        const vn   = rvx * rnx + rvy * rny;

        if (vn < 0) continue;

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

        // Cue spin transfer (conservative model)
        if (iter === 0 && (b1.id === 0 || b2.id === 0)) {
          const cue    = b1.id === 0 ? b1 : b2;
          const tgt    = b1.id === 0 ? b2 : b1;
          const dir    = b1.id === 0 ? 1 : -1;
          const sx     = cue.spinX || 0;
          const sy     = cue.spinY || 0;
          const spd    = Math.sqrt(b1.vx * b1.vx + b1.vy * b1.vy + b2.vx * b2.vx + b2.vy * b2.vy);

          // Spin → velocity transfer proportional to relative speed
          if (spd > 0.1) {
            const transfer = Math.min(1.0, spd * 0.08);
            tgt.vx += rnx * (sy * 1.2 * dir * transfer);
            tgt.vy += rny * (sy * 1.2 * dir * transfer);
            tgt.vx += tx  * (sx * 0.8 * dir * transfer);
            tgt.vy += ty  * (sx * 0.8 * dir * transfer);
          }

          // Spin conservation: cue retains most, target gets residual
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
  return balls.some(b => !b.isPocketed && (Math.abs(b.vx) > 0.05 || Math.abs(b.vy) > 0.05));
}

export function captureFrame(balls: Ball[]): Array<{ id: number; x: number; y: number; isPocketed: boolean }> {
  return balls.map(b => ({ id: b.id, x: b.x, y: b.y, isPocketed: b.isPocketed }));
}
