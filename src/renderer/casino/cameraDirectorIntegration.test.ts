import { describe, it, expect } from 'vitest';
import { createDirectorAI, CameraHint } from './DirectorAI';
import { createCameraHintIntegration } from './cameraDirectorIntegration';
import { CameraState } from '../camera/createCinematicCamera';

describe('cameraDirectorIntegration', () => {
  it('polls null when director has no hint', () => {
    const director = createDirectorAI();
    const integration = createCameraHintIntegration(director);
    expect(integration.pollHint(1 / 60)).toBeNull();
  });

  it('maps forced hint to CameraState', () => {
    const director = createDirectorAI();
    const integration = createCameraHintIntegration(director);
    director.forceHint(CameraHint.WIDE_ESTABLISHING);
    expect(integration.pollHint(1 / 60)).toBe(CameraState.BROADCAST_IDLE);
  });

  it('maps IMPACT_DRAMA to IMPACT_REACTION', () => {
    const director = createDirectorAI();
    const integration = createCameraHintIntegration(director);
    director.forceHint(CameraHint.IMPACT_DRAMA);
    expect(integration.pollHint(1 / 60)).toBe(CameraState.IMPACT_REACTION);
  });

  it('returns null after hint is consumed', () => {
    const director = createDirectorAI();
    const integration = createCameraHintIntegration(director);
    director.forceHint(CameraHint.FOLLOW_CUE);
    expect(integration.pollHint(1 / 60)).toBe(CameraState.BALL_TRACKING);
    expect(integration.pollHint(1 / 60)).toBeNull();
  });
});
