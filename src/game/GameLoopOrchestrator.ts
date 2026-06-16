import * as THREE from 'three';
import { SnapshotBall } from '../renderer/objects/createBalls';
import { CollisionEvent } from '../renderer/camera/createCinematicCamera';
import {
  ReplayRecorder,
  ReplayShotData,
} from '../renderer/replay/ReplayRecorder';
import {
  ReplayPlaybackController,
} from '../renderer/replay/ReplayPlaybackController';
import { GameEventBus } from './events/GameEventBus';
import { GameEvent } from './events/GameEventTypes';

export interface CueState {
  spinX: number;
  spinY: number;
  power: number;
  angle: number;
}

export type GameState = 'IDLE' | 'SHOOTING' | 'REPLAY';

export interface GameLoopOrchestrator {
  getState(): GameState;
  startShot(cue: CueState): void;
  updateFrame(snapshot: SnapshotBall[], dt: number): void;
  recordCollision(event: CollisionEvent): void;
  endShot(): void;
  exitReplay(): void;
  tick(dt: number): void;
  dispose?: () => void;
}

export function createGameLoopOrchestrator(
  replay: ReplayRecorder,
  playback: ReplayPlaybackController,
  eventBus?: GameEventBus,
): GameLoopOrchestrator {
  let state: GameState = 'IDLE';
  let shotData: ReplayShotData | null = null;
  let replayTimer: ReturnType<typeof setTimeout> | null = null;
  let exitScheduled = false;

  let shotCollisionCount = 0;

  function cancelTimer(): void {
    if (replayTimer !== null) {
      clearTimeout(replayTimer);
      replayTimer = null;
    }
  }

  return {
    getState: () => state,

    startShot: (cue: CueState) => {
      cancelTimer();
      exitScheduled = false;
      state = 'SHOOTING';
      shotCollisionCount = 0;
      replay.startShot({
        cueAngle: cue.angle,
        spinX: cue.spinX,
        spinY: cue.spinY,
        power: cue.power,
      });

      if (eventBus) {
        eventBus.emit(GameEvent.SHOT_START, {
          cueAngle: cue.angle,
          power: cue.power,
          spinX: cue.spinX,
          spinY: cue.spinY,
          cueBallPos: new THREE.Vector3(0, 0, 0),
          timestamp: Date.now(),
        });
      }
    },

    updateFrame: (snapshot: SnapshotBall[], dt: number) => {
      if (state === 'SHOOTING') {
        replay.recordFrame(snapshot, dt);
      }
    },

    recordCollision: (event: CollisionEvent) => {
      if (state === 'SHOOTING') {
        shotCollisionCount++;
        replay.recordCollision(event);

        if (eventBus) {
          eventBus.emit(GameEvent.BALL_COLLISION, {
            position: event.position,
            speed: 0,
            ballIds: [0, 1],
            timestamp: Date.now(),
          });
        }
      }
    },

    endShot: () => {
      if (state !== 'SHOOTING') return;
      state = 'IDLE';

      shotData = replay.endShot();
      if (!shotData) return;

      if (eventBus) {
        eventBus.emit(GameEvent.SHOT_END, {
          totalCollisions: shotCollisionCount,
          pocketedBalls: [],
          duration: 0,
          timestamp: Date.now(),
        });
      }

      replayTimer = setTimeout(() => {
        state = 'REPLAY';
        exitScheduled = false;
        playback.start(shotData!);
      }, 800);
    },

    exitReplay: () => {
      cancelTimer();
      exitScheduled = false;
      if (state === 'REPLAY') {
        playback.stop();
      }
      state = 'IDLE';
      shotData = null;
    },

    tick: (dt: number) => {
      if (state === 'REPLAY') {
        playback.update(dt);

        if (playback.getMode() === 'finished' && !exitScheduled) {
          exitScheduled = true;
          replayTimer = setTimeout(() => {
            exitScheduled = false;
            if (state === 'REPLAY' && playback.getMode() === 'finished') {
              playback.stop();
            }
            state = 'IDLE';
          }, 500);
        }
      }
    },
  };
}
