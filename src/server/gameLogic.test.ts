import { describe, it, expect } from 'vitest';
import {
  findValidCueBallPosition,
} from './gameLogic';
import { aiDist, ghostBallAngle } from './aiEngine';
import { getInitialBalls, BALL_R, TABLE_W, TABLE_H, CUSHION } from './physics';

describe('findValidCueBallPosition', () => {
  it('should return a position within table bounds', () => {
    const balls = getInitialBalls();
    const pos = findValidCueBallPosition(balls);
    expect(pos.x).toBeGreaterThanOrEqual(CUSHION + BALL_R);
    expect(pos.x).toBeLessThanOrEqual(TABLE_W - CUSHION - BALL_R);
    expect(pos.y).toBeGreaterThanOrEqual(CUSHION + BALL_R);
    expect(pos.y).toBeLessThanOrEqual(TABLE_H - CUSHION - BALL_R);
  });

  it('should not overlap any object ball', () => {
    const balls = getInitialBalls();
    const pos = findValidCueBallPosition(balls);
    const tooClose = balls.some(b => {
      if (b.id === 0) return false;
      return Math.hypot(pos.x - b.x, pos.y - b.y) < BALL_R * 2;
    });
    expect(tooClose).toBe(false);
  });

  it('should prefer head area when preferHeadArea is true', () => {
    const balls = getInitialBalls();
    for (const b of balls) {
      if (b.x < 300) b.x = 500;
    }
    const pos = findValidCueBallPosition(balls, true);
    expect(pos.x).toBeLessThanOrEqual(300);
  });

  it('should return a valid position when table is crowded', () => {
    const balls = getInitialBalls();
    for (const b of balls) {
      b.x = 300 + Math.random() * 50;
      b.y = 180 + Math.random() * 40;
    }
    const pos = findValidCueBallPosition(balls, true);
    const tooClose = balls.some(b => {
      const dx = pos.x - b.x;
      const dy = pos.y - b.y;
      return Math.hypot(dx, dy) < BALL_R * 2;
    });
    expect(tooClose).toBe(false);
  });

  it('should find a valid position when only cue ball exists', () => {
    const balls = [getInitialBalls()[0]];
    const pos = findValidCueBallPosition(balls, false);
    expect(pos.x).toBeGreaterThanOrEqual(CUSHION + BALL_R);
    expect(pos.x).toBeLessThanOrEqual(TABLE_W - CUSHION - BALL_R);
    expect(pos.y).toBeGreaterThanOrEqual(CUSHION + BALL_R);
    expect(pos.y).toBeLessThanOrEqual(TABLE_H - CUSHION - BALL_R);
  });
});



describe('aiDist', () => {
  it('should calculate Euclidean distance correctly', () => {
    expect(aiDist(0, 0, 3, 4)).toBe(5);
    expect(aiDist(0, 0, 0, 0)).toBe(0);
  });

  it('should be symmetric', () => {
    const d1 = aiDist(10, 20, 30, 50);
    const d2 = aiDist(30, 50, 10, 20);
    expect(d1).toBe(d2);
  });
});

describe('ghostBallAngle', () => {
  it('should return finite angle for valid inputs', () => {
    const angle = ghostBallAngle(200, 200, 500, 200, 780, 24);
    expect(Number.isFinite(angle)).toBe(true);
  });
});
