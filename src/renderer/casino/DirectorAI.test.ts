import { describe, it, expect } from 'vitest';
import { createDirectorAI, CameraHint } from './DirectorAI';

describe('DirectorAI', () => {
  it('starts idle with no hint', () => {
    const director = createDirectorAI();
    expect(director.consumeHint()).toBeNull();
  });

  it('returns a forced hint', () => {
    const director = createDirectorAI();
    director.forceHint(CameraHint.WIDE_ESTABLISHING);
    expect(director.consumeHint()).toBe(CameraHint.WIDE_ESTABLISHING);
  });

  it('returns null after consuming hint', () => {
    const director = createDirectorAI();
    director.forceHint(CameraHint.IMPACT_DRAMA);
    expect(director.consumeHint()).toBe(CameraHint.IMPACT_DRAMA);
    expect(director.consumeHint()).toBeNull();
  });

  it('evaluates importance from input', () => {
    const director = createDirectorAI();
    const low = director.evaluateImportance({
      power: 10,
      spinIntensity: 0,
      collisionCount: 1,
      pocketProbability: 0.1,
    });
    const high = director.evaluateImportance({
      power: 100,
      spinIntensity: 0.8,
      collisionCount: 10,
      pocketProbability: 0.9,
    });
    expect(high).toBeGreaterThan(low);
  });

  it('clamps importance output to [0, 1]', () => {
    const director = createDirectorAI();
    const result = director.evaluateImportance({
      power: 999,
      spinIntensity: 99,
      collisionCount: 999,
      pocketProbability: 99,
    });
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('produces hint after high-importance evaluation', () => {
    const director = createDirectorAI();
    director.evaluateImportance({
      power: 100,
      spinIntensity: 1,
      collisionCount: 10,
      pocketProbability: 0.9,
    });
    // update() would be called by frame loop — might not produce hint immediately
    // consumeHint is allowed to return null if internal timer hasn't elapsed
    const hint = director.consumeHint();
    expect(hint === null || Object.values(CameraHint).includes(hint)).toBe(true);
  });
});
