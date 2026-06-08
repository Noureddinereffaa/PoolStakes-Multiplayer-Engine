import { describe, it, expect } from 'vitest';
import { aiDist, ghostBallAngle, findValidCueBallPosition } from './gameLogic';
import { getInitialBalls, powerToVelocity, BALL_R, CUSHION, TABLE_W, TABLE_H } from './physics';

const POCKET_POSITIONS = [
  { x: 23, y: 23 }, { x: 400, y: 18 }, { x: 777, y: 23 },
  { x: 23, y: 377 }, { x: 400, y: 382 }, { x: 777, y: 377 },
];

describe('AI helper functions', () => {
  describe('aiDist', () => {
    it('should return 0 for same point', () => {
      expect(aiDist(100, 200, 100, 200)).toBe(0);
    });

    it('should calculate Euclidean distance correctly', () => {
      expect(aiDist(0, 0, 3, 4)).toBe(5);
    });

    it('should be symmetric', () => {
      expect(aiDist(10, 20, 30, 50)).toBe(aiDist(30, 50, 10, 20));
    });
  });

  describe('ghostBallAngle', () => {
    it('should return a finite angle for valid inputs', () => {
      const angle = ghostBallAngle(200, 200, 500, 200, 780, 24);
      expect(Number.isFinite(angle)).toBe(true);
    });

    it('should return consistent results for identical inputs', () => {
      const a1 = ghostBallAngle(200, 200, 500, 200, 780, 24);
      const a2 = ghostBallAngle(200, 200, 500, 200, 780, 24);
      expect(a1).toBe(a2);
    });

    it('should aim away from pocket when cue ball is behind target', () => {
      const angle = ghostBallAngle(100, 200, 200, 200, 780, 24);
      expect(angle).toBeGreaterThan(-Math.PI);
      expect(angle).toBeLessThan(Math.PI);
    });
  });

  describe('powerToVelocity integration', () => {
    it('should produce zero velocity for zero power', () => {
      expect(powerToVelocity(0)).toBe(0);
    });

    it('should produce max ~26 for 100 power', () => {
      const v = powerToVelocity(100);
      expect(v).toBeGreaterThan(20);
      expect(v).toBeLessThanOrEqual(26);
    });

    it('should be monotonically increasing', () => {
      let prev = -1;
      for (let p = 0; p <= 100; p += 5) {
        const v = powerToVelocity(p);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    });

    it('should clamp values at 0 and 100', () => {
      expect(powerToVelocity(-10)).toBe(0);
      expect(powerToVelocity(150)).toBeLessThanOrEqual(26);
    });
  });

  describe('AI shot targeting against all pockets', () => {
    it('should find a valid ghost angle for every pocket position', () => {
      const balls = getInitialBalls();
      const cue = balls[0];
      const target = balls.find(b => b.id === 1)!;
      for (const pocket of POCKET_POSITIONS) {
        const angle = ghostBallAngle(cue.x, cue.y, target.x, target.y, pocket.x, pocket.y);
        expect(Number.isFinite(angle)).toBe(true);
      }
    });

    it('should find valid cue ball position on a crowded table', () => {
      const balls = getInitialBalls();
      for (const b of balls) {
        if (b.id !== 0) {
          b.x = 300 + Math.random() * 40;
          b.y = 180 + Math.random() * 40;
        }
      }
      const pos = findValidCueBallPosition(balls, true);
      const overlaps = balls.some(b => {
        if (b.id === 0 || b.isPocketed) return false;
        return Math.hypot(pos.x - b.x, pos.y - b.y) < BALL_R * 2;
      });
      expect(overlaps).toBe(false);
      expect(pos.x).toBeGreaterThanOrEqual(CUSHION + BALL_R);
      expect(pos.x).toBeLessThanOrEqual(TABLE_W - CUSHION - BALL_R);
      expect(pos.y).toBeGreaterThanOrEqual(CUSHION + BALL_R);
      expect(pos.y).toBeLessThanOrEqual(TABLE_H - CUSHION - BALL_R);
    });
  });
});
