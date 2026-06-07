import { Ball } from '../types';

export const TABLE_W = 800;
export const TABLE_H = 400;
export const CUSHION = 20;
export const BALL_R = 10;
export const POCKET_RADIUS = 24;

const pocketCenters = [
  { x: CUSHION + 4, y: CUSHION + 4 },
  { x: TABLE_W / 2, y: CUSHION + 1 },
  { x: TABLE_W - CUSHION - 4, y: CUSHION + 4 },
  { x: CUSHION + 4, y: TABLE_H - CUSHION - 4 },
  { x: TABLE_W / 2, y: TABLE_H - CUSHION - 1 },
  { x: TABLE_W - CUSHION - 4, y: TABLE_H - CUSHION - 4 }
];

const colColors: { [key: number]: string } = {
  1: '#F59E0B',
  2: '#3B82F6',
  3: '#EF4444',
  4: '#8B5CF6',
  5: '#F97316',
  6: '#10B981',
  7: '#7F1D1D',
  8: '#111827',
  9: '#FBBF24',
  10: '#60A5FA',
  11: '#FCA5A5',
  12: '#C084FC',
  13: '#FEB08A',
  14: '#34D399',
  15: '#991B1B'
};

export function getInitialBalls(): Ball[] {
  const balls: Ball[] = [];
  balls.push({
    id: 0,
    x: 200,
    y: 200,
    vx: 0,
    vy: 0,
    radius: BALL_R,
    isPocketed: false,
    type: 'cue',
    color: '#FAF9F6'
  });

  const startX = 550;
  const startY = 200;
  const colSpacing = BALL_R * 1.732;
  const rowSpacing = BALL_R * 2;

  const rackBallIds = [
    1,
    9, 2,
    10, 8, 3,
    4, 11, 5, 12,
    13, 6, 14, 7, 15
  ];

  let idx = 0;
  for (let col = 0; col < 5; col++) {
    const rx = startX + col * colSpacing;
    for (let row = 0; row <= col; row++) {
      const ballId = rackBallIds[idx++];
      const ry = startY + (row - col / 2) * rowSpacing;
      balls.push({
        id: ballId,
        x: rx,
        y: ry,
        vx: 0,
        vy: 0,
        radius: BALL_R,
        isPocketed: false,
        type: ballId === 8 ? 'black' : (ballId <= 7 ? 'solid' : 'stripe'),
        color: colColors[ballId],
        number: ballId
      });
    }
  }

  return balls;
}

export function simulatePhysicsStep(
  balls: Ball[],
  friction = 0.988,
  elasticLoss = 0.95,
  tracker?: { firstContactBallId: number | null; cushionContactOccurred?: boolean }
) {
  const S = 10;
  const subFriction = Math.pow(friction, 1 / S);

  for (let s = 0; s < S; s++) {
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.isPocketed) continue;

      if (b.id === 0) {
        const bX = (b as any).spinX || 0;
        const bY = (b as any).spinY || 0;
        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);

        if (speed > 0.08) {
          const nx = -b.vy / speed;
          const ny = b.vx / speed;
          const curveForce = bX * 0.048 * Math.min(speed, 5.5) / S;
          b.vx += nx * curveForce;
          b.vy += ny * curveForce;
          const rollForce = bY * 0.024 / S;
          b.vx += (b.vx / speed) * rollForce;
          b.vy += (b.vy / speed) * rollForce;
        }

        if ((b as any).spinX) (b as any).spinX *= Math.pow(0.98, 1 / S);
        if ((b as any).spinY) (b as any).spinY *= Math.pow(0.98, 1 / S);
      }

      b.x += b.vx / S;
      b.y += b.vy / S;
      b.vx *= subFriction;
      b.vy *= subFriction;

      if (Math.abs(b.vx) < 0.05) b.vx = 0;
      if (Math.abs(b.vy) < 0.05) b.vy = 0;

      const minX = CUSHION + BALL_R;
      const maxX = TABLE_W - CUSHION - BALL_R;
      const minY = CUSHION + BALL_R;
      const maxY = TABLE_H - CUSHION - BALL_R;

      if (b.x < minX) {
        b.x = minX;
        b.vx = -b.vx * elasticLoss;
        if (tracker && tracker.firstContactBallId !== null) tracker.cushionContactOccurred = true;
        if (b.id === 0) {
          const sX = (b as any).spinX || 0;
          b.vy -= sX * 1.5 * Math.abs(b.vx);
          (b as any).spinX *= -0.4;
        }
      } else if (b.x > maxX) {
        b.x = maxX;
        b.vx = -b.vx * elasticLoss;
        if (tracker && tracker.firstContactBallId !== null) tracker.cushionContactOccurred = true;
        if (b.id === 0) {
          const sX = (b as any).spinX || 0;
          b.vy += sX * 1.5 * Math.abs(b.vx);
          (b as any).spinX *= -0.4;
        }
      }

      if (b.y < minY) {
        b.y = minY;
        b.vy = -b.vy * elasticLoss;
        if (tracker && tracker.firstContactBallId !== null) tracker.cushionContactOccurred = true;
        if (b.id === 0) {
          const sX = (b as any).spinX || 0;
          b.vx += sX * 1.5 * Math.abs(b.vy);
          (b as any).spinX *= -0.4;
        }
      } else if (b.y > maxY) {
        b.y = maxY;
        b.vy = -b.vy * elasticLoss;
        if (tracker && tracker.firstContactBallId !== null) tracker.cushionContactOccurred = true;
        if (b.id === 0) {
          const sX = (b as any).spinX || 0;
          b.vx -= sX * 1.5 * Math.abs(b.vy);
          (b as any).spinX *= -0.4;
        }
      }

      for (const pocket of pocketCenters) {
        const dx = b.x - pocket.x;
        const dy = b.y - pocket.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < POCKET_RADIUS * POCKET_RADIUS) {
          b.isPocketed = true;
          b.vx = 0;
          b.vy = 0;
          break;
        }
      }
    }

    for (let i = 0; i < balls.length; i++) {
      const b1 = balls[i];
      if (b1.isPocketed) continue;

      for (let j = i + 1; j < balls.length; j++) {
        const b2 = balls[j];
        if (b2.isPocketed) continue;

        const dx = b2.x - b1.x;
        const dy = b2.y - b1.y;
        const distSq = dx * dx + dy * dy;
        const minDist = b1.radius + b2.radius;
        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq) || 0.001;
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;

          b1.x -= nx * overlap * 0.5;
          b1.y -= ny * overlap * 0.5;
          b2.x += nx * overlap * 0.5;
          b2.y += ny * overlap * 0.5;

          const kx = b1.vx - b2.vx;
          const ky = b1.vy - b2.vy;
          const p = nx * kx + ny * ky;

          if (p > 0) {
            const impulse = p * elasticLoss;
            b1.vx -= impulse * nx;
            b1.vy -= impulse * ny;
            b2.vx += impulse * nx;
            b2.vy += impulse * ny;
          }

          if (b1.id === 0) {
            const sY = (b1 as any).spinY || 0;
            b1.vx += nx * sY * 4.8;
            b1.vy += ny * sY * 4.8;
            (b1 as any).spinY *= 0.1;
          } else if (b2.id === 0) {
            const sY = (b2 as any).spinY || 0;
            b2.vx -= nx * sY * 4.8;
            b2.vy -= ny * sY * 4.8;
            (b2 as any).spinY *= 0.1;
          }

          if (tracker && tracker.firstContactBallId === null) {
            if (b1.id === 0) {
              tracker.firstContactBallId = b2.id;
            } else if (b2.id === 0) {
              tracker.firstContactBallId = b1.id;
            }
          }
        }
      }
    }
  }
}
