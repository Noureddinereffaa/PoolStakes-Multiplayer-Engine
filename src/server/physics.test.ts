import { describe, it, expect } from 'vitest';
import {
  getInitialBalls, simulatePhysicsStep, simulateOneFrame,
  BALL_R, TABLE_W, TABLE_H, CUSHION,
  isAnyBallMoving, captureFrame, powerToVelocity,
  MIN_X, MAX_X, MIN_Y, MAX_Y,
  HEAD_STRING_X, FOOT_SPOT_X, FOOT_SPOT_Y,
} from './physics';

describe('getInitialBalls', () => {
  it('should create 16 balls (1 cue + 15 object)', () => {
    const balls = getInitialBalls();
    expect(balls).toHaveLength(16);
    expect(balls[0].id).toBe(0);
    expect(balls[0].type).toBe('cue');
  });

  it('should have exactly one black ball (id: 8)', () => {
    const balls = getInitialBalls();
    const black = balls.filter(b => b.id === 8);
    expect(black).toHaveLength(1);
    expect(black[0].type).toBe('black');
  });

  it('should have 7 solids and 7 stripes', () => {
    const balls = getInitialBalls();
    expect(balls.filter(b => b.type === 'solid')).toHaveLength(7);
    expect(balls.filter(b => b.type === 'stripe')).toHaveLength(7);
  });

  it('should place the 8-ball in the center of the rack', () => {
    const balls = getInitialBalls();
    const eight = balls.find(b => b.id === 8)!;
    expect(eight.x).toBeGreaterThan(500);
    expect(eight.y).toBeCloseTo(200, 0);
  });

  it('should not have overlapping balls', () => {
    const balls = getInitialBalls();
    const hasOverlap = balls.some((b1, i) =>
      balls.slice(i + 1).some(b2 => {
        const dx = b1.x - b2.x;
        const dy = b1.y - b2.y;
        return Math.hypot(dx, dy) < BALL_R * 2 - 0.5;
      })
    );
    expect(hasOverlap).toBe(false);
  });

  it('should place balls within table bounds', () => {
    const balls = getInitialBalls();
    const minX = CUSHION + BALL_R;
    const maxX = TABLE_W - CUSHION - BALL_R;
    const minY = CUSHION + BALL_R;
    const maxY = TABLE_H - CUSHION - BALL_R;
    for (const b of balls) {
      expect(b.x).toBeGreaterThanOrEqual(minX);
      expect(b.x).toBeLessThanOrEqual(maxX);
      expect(b.y).toBeGreaterThanOrEqual(minY);
      expect(b.y).toBeLessThanOrEqual(maxY);
    }
  });
});

describe('simulatePhysicsStep', () => {
  it('should slow down a moving ball due to friction', () => {
    const balls = getInitialBalls();
    balls[0].vx = 10;
    balls[0].vy = 0;
    balls[0].sleeping = false;

    const initialSpeed = Math.abs(balls[0].vx);
    simulatePhysicsStep(balls);

    const speed = Math.hypot(balls[0].vx, balls[0].vy);
    expect(speed).toBeLessThan(initialSpeed);
  });

  it('should not move stationary balls', () => {
    const balls = getInitialBalls();
    for (const b of balls) { b.vx = 0; b.vy = 0; }
    const positions = balls.map(b => ({ x: b.x, y: b.y }));
    simulatePhysicsStep(balls);
    for (let i = 0; i < balls.length; i++) {
      expect(balls[i].x).toBeCloseTo(positions[i].x, 1);
      expect(balls[i].y).toBeCloseTo(positions[i].y, 1);
    }
  });

  it('should detect ball being pocketed when near pocket center', () => {
    const balls = getInitialBalls();
    const targetBall = balls.find(b => b.id === 1)!;
    targetBall.x = 23;
    targetBall.y = 23;
    targetBall.vx = 5;
    targetBall.vy = 5;
    targetBall.sleeping = false;

    simulatePhysicsStep(balls);
    expect(targetBall.isPocketed).toBe(true);
    expect(targetBall.vx).toBe(0);
    expect(targetBall.vy).toBe(0);
  });

  it('should bounce ball off rail when velocity is toward cushion', () => {
    const balls = getInitialBalls();
    const cue = balls[0];
    cue.x = 100;
    cue.y = MIN_Y;
    cue.vx = 0;
    cue.vy = -10;
    cue.sleeping = false;

    simulatePhysicsStep(balls);
    expect(cue.vy).toBeGreaterThan(0);
    expect(cue.y).toBeGreaterThanOrEqual(MIN_Y);
  });

  it('should transfer momentum on ball-ball collision', () => {
    const balls = getInitialBalls();
    const b1 = balls.find(b => b.id === 1)!;
    const b2 = balls.find(b => b.id === 2)!;
    b1.x = 300; b1.y = 200; b1.vx = 5; b1.vy = 0;
    b2.x = 325; b2.y = 200; b2.vx = 0; b2.vy = 0;

    const totalMomentumX = b1.vx * 1 + b2.vx * 1;
    simulatePhysicsStep(balls);
    const newTotalMomentumX = (b1.isPocketed ? 0 : b1.vx) + (b2.isPocketed ? 0 : b2.vx);

    // Momentum should be roughly conserved (within numerical tolerances)
    expect(Math.abs(newTotalMomentumX)).toBeLessThanOrEqual(Math.abs(totalMomentumX) + 1);
  });

  it('should stop dead ball with very low velocity', () => {
    const balls = getInitialBalls();
    balls[0].vx = 0.004;
    balls[0].vy = 0.004;

    simulatePhysicsStep(balls);
    expect(balls[0].vx).toBe(0);
    expect(balls[0].vy).toBe(0);
  });
});

describe('simulateOneFrame', () => {
  it('should advance the simulation without error', () => {
    const balls = getInitialBalls();
    balls[0].vx = 8;
    balls[0].vy = 3;
    expect(() => simulateOneFrame(balls)).not.toThrow();
  });
});

describe('isAnyBallMoving', () => {
  it('should return false when all balls are stationary', () => {
    const balls = getInitialBalls();
    for (const b of balls) { b.vx = 0; b.vy = 0; }
    expect(isAnyBallMoving(balls)).toBe(false);
  });

  it('should return true when at least one ball moves', () => {
    const balls = getInitialBalls();
    balls[0].vx = 1;
    balls[0].sleeping = false;
    expect(isAnyBallMoving(balls)).toBe(true);
  });

  it('should ignore pocketed balls', () => {
    const balls = getInitialBalls();
    for (const b of balls) { b.vx = 0; b.vy = 0; }
    balls[0].isPocketed = true;
    balls[0].vx = 5;
    expect(isAnyBallMoving(balls)).toBe(false);
  });
});

describe('captureFrame', () => {
  it('should return correct number of entries matching input', () => {
    const balls = getInitialBalls();
    const frame = captureFrame(balls);
    expect(frame).toHaveLength(balls.length);
  });

  it('should capture id, x, y, isPocketed for each ball', () => {
    const balls = getInitialBalls();
    const frame = captureFrame(balls);
    for (const f of frame) {
      expect(f).toHaveProperty('id');
      expect(f).toHaveProperty('x');
      expect(f).toHaveProperty('y');
      expect(f).toHaveProperty('isPocketed');
    }
  });
});

describe('powerToVelocity', () => {
  it('should return 0 for power 0', () => {
    expect(powerToVelocity(0)).toBe(0);
  });

  it('should return max velocity for power 100', () => {
    const v = powerToVelocity(100);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThanOrEqual(26 * 60);
  });

  it('should clamp out-of-range values', () => {
    expect(powerToVelocity(-50)).toBe(0);
    expect(powerToVelocity(200)).toBeLessThanOrEqual(26 * 60);
  });
});

describe('Edge cases', () => {
  it('should handle cue ball spin correctly', () => {
    const balls = getInitialBalls();
    const cue = balls[0];
    cue.spinX = 0.5;
    cue.spinY = 0.3;
    cue.vx = 5;
    cue.vy = 0;
    cue.sleeping = false;

    const posBefore = { x: cue.x, y: cue.y };
    simulatePhysicsStep(balls);
    const posAfter = { x: cue.x, y: cue.y };

    expect(posAfter.x).not.toBe(posBefore.x);
  });

  it('should handle ball pocketed at high speed', () => {
    const balls = getInitialBalls();
    const target = balls.find(b => b.id === 1)!;
    target.x = 30;
    target.y = 30;
    target.vx = 20;
    target.vy = 20;
    target.sleeping = false;

    simulatePhysicsStep(balls);
    expect(target.isPocketed).toBe(true);
  });
});
