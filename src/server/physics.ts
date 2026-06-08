import { Ball } from '../types';

export const TABLE_W = 800;
export const TABLE_H = 400;
export const CUSHION = 20;
export const BALL_R = 10;
export const HEAD_STRING_X = CUSHION + 220;
export const RACK_APEX_X = 550;
export const RACK_APEX_Y = 200;
export const RACK_COL_SPACING = BALL_R * 1.732;
export const FOOT_SPOT_X = RACK_APEX_X + 2 * RACK_COL_SPACING;
export const FOOT_SPOT_Y = RACK_APEX_Y;
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
  1: '#CFAF30',
  2: '#1B4CA7',
  3: '#B12724',
  4: '#5F3E9C',
  5: '#C86414',
  6: '#0F7B4D',
  7: '#7A1E2A',
  8: '#111111',
  9: '#D7B037',
  10: '#4A76C8',
  11: '#D45851',
  12: '#9D6FD1',
  13: '#D28D3E',
  14: '#3CA972',
  15: '#8A1A24'
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

  const startX = RACK_APEX_X;
  const startY = RACK_APEX_Y;
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
  friction = 0.997,
  elasticLoss = 0.92,
  tracker?: { firstContactBallId: number | null; cushionContactOccurred?: boolean }
) {
  const S = 16;
  const subSlideFriction = Math.pow(0.9935, 1 / S);
  const subRollFriction = Math.pow(0.9975, 1 / S);
  const spinCurveMax = 0.06;
  const slidingThreshold = 0.28;

  for (let s = 0; s < S; s++) {
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.isPocketed) continue;

      if (b.id === 0) {
        const spinX = b.spinX || 0;
        const spinY = b.spinY || 0;
        const speed = Math.hypot(b.vx, b.vy);

        if (speed > 0.08) {
          const nx = -b.vy / speed;
          const ny = b.vx / speed;
          const curveForce = Math.max(-spinCurveMax, Math.min(spinCurveMax, spinX * 0.05 * Math.min(speed, 6) / S));
          b.vx += nx * curveForce;
          b.vy += ny * curveForce;
          const rollForce = Math.max(-spinCurveMax, Math.min(spinCurveMax, spinY * 0.026 / S));
          b.vx += (b.vx / speed) * rollForce;
          b.vy += (b.vy / speed) * rollForce;
        }

        b.spinX = spinX * Math.pow(0.95, 1 / S);
        b.spinY = spinY * Math.pow(0.95, 1 / S);
      }

      b.x += b.vx / S;
      b.y += b.vy / S;

      const speed = Math.hypot(b.vx, b.vy);
      const frictionFactor = speed > slidingThreshold ? subSlideFriction : subRollFriction;
      b.vx *= frictionFactor;
      b.vy *= frictionFactor;

      if (Math.abs(b.vx) < 0.04) b.vx = 0;
      if (Math.abs(b.vy) < 0.04) b.vy = 0;

      const minX = CUSHION + BALL_R;
      const maxX = TABLE_W - CUSHION - BALL_R;
      const minY = CUSHION + BALL_R;
      const maxY = TABLE_H - CUSHION - BALL_R;

      if (b.x < minX) {
        b.x = minX;
        b.vx = -b.vx * elasticLoss;
        if (tracker && tracker.firstContactBallId !== null) tracker.cushionContactOccurred = true;
        if (b.id === 0) {
          const spinX = b.spinX || 0;
          const tangentX = 0;
          const tangentY = -1;
          const spinEffect = spinX * 1.55 * Math.min(1, speed / 6);
          b.vx += tangentX * spinEffect;
          b.vy += tangentY * spinEffect;
          b.spinX = -spinX * 0.42;
        }
      } else if (b.x > maxX) {
        b.x = maxX;
        b.vx = -b.vx * elasticLoss;
        if (tracker && tracker.firstContactBallId !== null) tracker.cushionContactOccurred = true;
        if (b.id === 0) {
          const spinX = b.spinX || 0;
          const tangentX = 0;
          const tangentY = 1;
          const spinEffect = spinX * 1.55 * Math.min(1, speed / 6);
          b.vx += tangentX * spinEffect;
          b.vy += tangentY * spinEffect;
          b.spinX = -spinX * 0.42;
        }
      }

      if (b.y < minY) {
        b.y = minY;
        b.vy = -b.vy * elasticLoss;
        if (tracker && tracker.firstContactBallId !== null) tracker.cushionContactOccurred = true;
        if (b.id === 0) {
          const spinX = b.spinX || 0;
          const tangentX = 1;
          const tangentY = 0;
          const spinEffect = spinX * 1.55 * Math.min(1, speed / 6);
          b.vx += tangentX * spinEffect;
          b.vy += tangentY * spinEffect;
          b.spinX = -spinX * 0.42;
        }
      } else if (b.y > maxY) {
        b.y = maxY;
        b.vy = -b.vy * elasticLoss;
        if (tracker && tracker.firstContactBallId !== null) tracker.cushionContactOccurred = true;
        if (b.id === 0) {
          const spinX = b.spinX || 0;
          const tangentX = -1;
          const tangentY = 0;
          const spinEffect = spinX * 1.55 * Math.min(1, speed / 6);
          b.vx += tangentX * spinEffect;
          b.vy += tangentY * spinEffect;
          b.spinX = -spinX * 0.42;
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
          b.spinX = 0;
          b.spinY = 0;
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
          const dist = Math.sqrt(distSq) || minDist;
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;

          b1.x -= nx * overlap * 0.5;
          b1.y -= ny * overlap * 0.5;
          b2.x += nx * overlap * 0.5;
          b2.y += ny * overlap * 0.5;

          const relVx = b1.vx - b2.vx;
          const relVy = b1.vy - b2.vy;
          const relSpeed = relVx * nx + relVy * ny;

          if (relSpeed < 0) {
            const impulse = -(1 + elasticLoss) * relSpeed * 0.5;
            b1.vx += impulse * nx;
            b1.vy += impulse * ny;
            b2.vx -= impulse * nx;
            b2.vy -= impulse * ny;

            const tangentX = -ny;
            const tangentY = nx;
            const relTangent = relVx * tangentX + relVy * tangentY;
            const frictionImpulse = relTangent * 0.08;
            b1.vx -= frictionImpulse * tangentX;
            b1.vy -= frictionImpulse * tangentY;
            b2.vx += frictionImpulse * tangentX;
            b2.vy += frictionImpulse * tangentY;

            const cueSpinBall = b1.id === 0 ? b1 : b2.id === 0 ? b2 : null;
            if (cueSpinBall) {
              const spinX = cueSpinBall.spinX || 0;
              const spinY = cueSpinBall.spinY || 0;
              const impactDir = cueSpinBall === b1 ? 1 : -1;
              cueSpinBall.vx += nx * spinY * 4.2 * impactDir + tangentX * spinX * 2.3 * impactDir;
              cueSpinBall.vy += ny * spinY * 4.2 * impactDir + tangentY * spinX * 2.3 * impactDir;
              cueSpinBall.spinY *= 0.12;
              cueSpinBall.spinX *= 0.22;

              const targetBall = cueSpinBall === b1 ? b2 : b1;
              targetBall.vx += tangentX * spinX * 1.1 * impactDir;
              targetBall.vy += tangentY * spinX * 1.1 * impactDir;
            }
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
