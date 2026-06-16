import * as THREE from 'three';
import { RenderService } from '../RenderService';

export interface EffectsInput {
  maxBallSpeed: number;
  isShooting: boolean;
  dt: number;
}

export interface VisualEffectsController {
  update(input: EffectsInput): void;
  dispose(): void;
}

export function createVisualEffects(rs: RenderService): VisualEffectsController {
  const renderer = rs.getRenderer();
  const scene = rs.getScene();
  if (!renderer || !scene) throw new Error('Renderer/Scene not ready');

  const fog = new THREE.FogExp2(0x0a0604, 0.0035);
  scene.fog = fog;

  let currentExposure = 1.0;
  let targetExposure = 1.0;

  const controller: VisualEffectsController = {
    update: (input: EffectsInput) => {
      if (input.isShooting && input.maxBallSpeed > 100) {
        targetExposure = 1.0 + Math.min(0.06, input.maxBallSpeed * 0.0001);
      } else {
        targetExposure = 1.0;
      }

      currentExposure += (targetExposure - currentExposure) * Math.min(1, input.dt * 4);
      renderer.toneMappingExposure = currentExposure;
    },
    dispose: () => {
      scene.fog = null;
      renderer.toneMappingExposure = 1.0;
    },
  };

  return controller;
}
