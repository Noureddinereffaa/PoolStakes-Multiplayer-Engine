import * as THREE from 'three';
import { GameEventBus } from '../../game/events/GameEventBus';
import { GameEvent } from '../../game/events/GameEventTypes';
import { RenderService } from '../RenderService';
import { DirectorAI, createDirectorAI, ShotImportanceInput, CameraHint } from './DirectorAI';
import { CrowdController, createCrowdController } from './CrowdController';
import { SoundscapeSystem, createSoundscapeSystem } from './SoundscapeSystem';
import { CasinoEnvironmentController, createCasinoEnvironment } from './createCasinoEnvironment';
import { CameraHintIntegration, createCameraHintIntegration } from './cameraDirectorIntegration';
import { CameraState } from '../camera/createCinematicCamera';

export interface CasinoLayerConfig {
  npcCount?: number;
  enableCrowd?: boolean;
  enableSoundscape?: boolean;
  enableEnvironment?: boolean;
  enableDirector?: boolean;
}

export interface CasinoLayer {
  update(dt: number, cueBallPos: THREE.Vector3): void;
  dispose(): void;
}

export function createCasinoLayer(
  rs: RenderService,
  eventBus: GameEventBus,
  config?: CasinoLayerConfig,
): CasinoLayer {
  const scene = rs.getScene()!;
  const cfg = {
    npcCount: 64,
    enableCrowd: true,
    enableSoundscape: true,
    enableEnvironment: true,
    enableDirector: true,
    ...config,
  };

  let director: DirectorAI | null = null;
  let crowd: CrowdController | null = null;
  let soundscape: SoundscapeSystem | null = null;
  let environment: CasinoEnvironmentController | null = null;
  let hintIntegration: CameraHintIntegration | null = null;

  if (cfg.enableDirector) {
    director = createDirectorAI();
    hintIntegration = createCameraHintIntegration(director);
  }

  if (cfg.enableCrowd) {
    crowd = createCrowdController(scene);
  }

  if (cfg.enableSoundscape) {
    soundscape = createSoundscapeSystem();
  }

  if (cfg.enableEnvironment) {
    environment = createCasinoEnvironment(scene);
  }

  let shotCollisionCount = 0;
  let lastShotPower = 0;

  const onShotStart = (payload: any) => {
    shotCollisionCount = 0;
    lastShotPower = payload.power;

    if (director) {
      const importanceInput: ShotImportanceInput = {
        power: payload.power,
        spinIntensity: Math.abs(payload.spinX) + Math.abs(payload.spinY),
        collisionCount: 0,
        pocketProbability: 0,
      };
      const importance = director.evaluateImportance(importanceInput);
      if (importance > 0.5) {
        director.forceHint(
          importance > 0.8 ? CameraHint.IMPACT_DRAMA : CameraHint.FOLLOW_CUE,
        );
      }
    }

    if (soundscape) {
      soundscape.updateIntensity({
        shotPower: payload.power / 100,
        collisionCount: 0,
        crowdDensity: 0.5,
      });
    }
  };

  const onBallCollision = () => {
    shotCollisionCount++;
  };

  const onShotEnd = (payload: any) => {
    if (director) {
      const importanceInput: ShotImportanceInput = {
        power: lastShotPower,
        spinIntensity: 0,
        collisionCount: payload.totalCollisions,
        pocketProbability: payload.pocketedBalls.length > 0 ? 0.8 : 0.1,
      };
      const importance = director.evaluateImportance(importanceInput);

      if (importance > 0.7) {
        director.forceHint(CameraHint.CROWD_REACTION);
      }

      if (soundscape) {
        soundscape.updateIntensity({
          shotPower: lastShotPower / 100,
          collisionCount: shotCollisionCount,
          crowdDensity: 0.5,
        });
        if (payload.pocketedBalls.length > 0 && payload.pocketedBalls.length < 4) {
          soundscape.playAppealBurst(0.4 + payload.pocketedBalls.length * 0.15);
        } else if (payload.pocketedBalls.length >= 4) {
          soundscape.playAppealBurst(0.8);
        }
      }

      if (crowd && payload.pocketedBalls.length > 0) {
        const intensity = Math.min(1, 0.3 + payload.pocketedBalls.length * 0.15);
        crowd.triggerReaction(intensity, 'applause');
      }
    }
  };

  eventBus.on(GameEvent.SHOT_START, onShotStart);
  eventBus.on(GameEvent.BALL_COLLISION, onBallCollision);
  eventBus.on(GameEvent.SHOT_END, onShotEnd);

  let crowdTickAccum = 0;
  const CROWD_TICK_INTERVAL = 0.1;

  return {
    update: (dt: number, cueBallPos: THREE.Vector3) => {
      if (environment) {
        environment.update(performance.now() / 1000);
      }

      if (crowd) {
        crowdTickAccum += dt;
        if (crowdTickAccum >= CROWD_TICK_INTERVAL) {
          crowdTickAccum = 0;
          crowd.update(dt, cueBallPos);
        }
      }

      if (soundscape) {
        soundscape.update(dt);
      }
    },

    dispose: () => {
      eventBus.off(GameEvent.SHOT_START, onShotStart);
      eventBus.off(GameEvent.BALL_COLLISION, onBallCollision);
      eventBus.off(GameEvent.SHOT_END, onShotEnd);
      if (crowd) crowd.dispose();
      if (soundscape) soundscape.dispose();
      if (environment) environment.dispose();
      director = null;
      hintIntegration = null;
    },
  };
}
