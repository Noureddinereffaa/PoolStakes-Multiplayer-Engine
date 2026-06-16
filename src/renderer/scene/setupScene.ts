import * as THREE from 'three';
import { RenderService } from '../RenderService';
import { FrameTiming } from '../types';
import { buildTable, disposeTable } from './createTable';
import { createBalls, BallSystemController, SnapshotBall } from '../objects/createBalls';
import { applyMaterialOverrides, BallUniformUpdater } from '../objects/applyMaterialOverrides';
import { setupPBRMaterials } from './setupPBRMaterials';
import { createLightRig, LightController } from '../lights/createLightRig';
import {
  createContactShadowSystem,
  ContactShadowController,
} from '../shadows/createContactShadowSystem';
import { disposeBallAtlas } from '../objects/createBalls';
import { debugLog } from '../../utils/debugLog';
import { createCueSystem, CueSystemController } from '../objects/createCueSystem';
import { createAimGuide, AimGuideController } from '../objects/createAimGuide';
import {
  createGhostSimulation,
  GhostSimController,
} from '../objects/createGhostSimulation';
import {
  createSpinVisualizer,
  SpinVisualizerController,
} from '../objects/createSpinVisualizer';
import {
  createShotReplayTrail,
  ShotReplayTrailController,
} from '../objects/createShotReplayTrail';
import {
  createCinematicCamera,
  CinematicCameraController,
  CameraState,
} from '../camera/createCinematicCamera';
import {
  createVisualEffects,
  VisualEffectsController,
} from '../effects/createVisualEffects';
import {
  createImpactFeedback,
  ImpactFeedbackController,
} from '../effects/createImpactFeedback';
import {
  createReplayRecorder,
  ReplayRecorder,
} from '../replay/ReplayRecorder';
import {
  createCameraDirector,
  CameraDirectorController,
} from '../replay/CameraDirector';
import {
  createReplayPlaybackController,
  ReplayPlaybackController,
} from '../replay/ReplayPlaybackController';
import {
  createGameLoopOrchestrator,
  GameLoopOrchestrator,
} from '../../game/GameLoopOrchestrator';
import {
  createGameEventBus,
  GameEventBus,
} from '../../game/events/GameEventBus';
import {
  createCasinoLayer,
  CasinoLayer,
} from '../casino/CasinoLayer';
import {
  addCasinoDecorations,
  CasinoDecorationsHandle,
} from '../casino/casinoDecorations';
import { EngineRegistry } from '../../engine/EngineRegistry';

export interface SceneHandle {
  balls: BallSystemController;
  lights: LightController;
  ballUpdater: BallUniformUpdater;
  shadows: ContactShadowController;
  cue: CueSystemController;
  aimGuide: AimGuideController;
  ghostSim: GhostSimController;
  spinVisualizer: SpinVisualizerController;
  trail: ShotReplayTrailController;
  cinematicCamera: CinematicCameraController;
  effects: VisualEffectsController;
  impact: ImpactFeedbackController;
  replayRecorder: ReplayRecorder;
  cameraDirector: CameraDirectorController;
  replayPlayback: ReplayPlaybackController;
  gameLoop: GameLoopOrchestrator;
  eventBus: GameEventBus;
  casino: CasinoLayer;
  decorations: CasinoDecorationsHandle;
  syncSnapshot(snapshot: SnapshotBall[], dt: number): void;
  frameSync(timing: FrameTiming): void;
  /** Clean up pipeline slot registrations and tracked systems. */
  dispose?: () => void;
}

const _camPos = new THREE.Vector3();
const _ballR = 10;

/**
 * Assemble the full 3D scene.
 *
 * Idempotent: if called again (e.g. HMR re-evaluation), the
 * EngineRegistry prevents duplicate pipeline registrations and
 * tracks all subsystems for clean teardown.
 */
export function setupScene(rs: RenderService): SceneHandle {
  buildTable(rs);
  setupPBRMaterials(rs);
  const lights = createLightRig(rs);
  const balls = createBalls(rs);
  const ballUpdater = applyMaterialOverrides(rs)!;
  const shadows = createContactShadowSystem(rs);

  const cue = createCueSystem(rs);
  const aimGuide = createAimGuide(rs);
  const ghostSim = createGhostSimulation(rs, balls);
  const spinVisualizer = createSpinVisualizer(rs);
  const trail = createShotReplayTrail(rs);

  cue.hide();
  aimGuide.hide();
  ghostSim.hide();
  spinVisualizer.hide();
  trail.reset();

  const camera = rs.getCamera()!;
  const cinematicCamera = createCinematicCamera(camera);
  const effects = createVisualEffects(rs);
  const impact = createImpactFeedback(rs, lights);

  const replayRecorder = createReplayRecorder();
  const cameraDirector = createCameraDirector(camera);
  const replayPlayback = createReplayPlaybackController(
    rs, balls, lights, ballUpdater, ghostSim, cameraDirector,
  );

  const eventBus = createGameEventBus();
  const gameLoop = createGameLoopOrchestrator(replayRecorder, replayPlayback, eventBus);

  const casino = createCasinoLayer(rs, eventBus);
  const decorations = addCasinoDecorations(rs);

  // ── Register subsystems with EngineRegistry (idempotent) ──────
  EngineRegistry.setRenderService(rs);
  EngineRegistry.setEventBus(eventBus);
  EngineRegistry.setCasino(casino);
  EngineRegistry.setDecorations(decorations);
  EngineRegistry.registerSystem('balls', { dispose: () => balls.dispose?.() });
  EngineRegistry.registerSystem('lights', { dispose: () => lights.dispose?.() });
  EngineRegistry.registerSystem('shadows', { dispose: () => shadows.dispose?.() });
  EngineRegistry.registerSystem('cue', { dispose: () => cue.dispose() });
  EngineRegistry.registerSystem('aimGuide', { dispose: () => aimGuide.dispose() });
  EngineRegistry.registerSystem('ghostSim', { dispose: () => ghostSim.dispose() });
  EngineRegistry.registerSystem('spinVisualizer', { dispose: () => spinVisualizer.dispose() });
  EngineRegistry.registerSystem('trail', { dispose: () => trail.dispose() });
  EngineRegistry.registerSystem('cinematicCamera', { dispose: () => cinematicCamera.dispose?.() });
  EngineRegistry.registerSystem('effects', { dispose: () => effects.dispose() });
  EngineRegistry.registerSystem('impact', { dispose: () => impact.dispose() });
  EngineRegistry.registerSystem('replayRecorder', { dispose: () => replayRecorder.dispose?.() });
  EngineRegistry.registerSystem('cameraDirector', { dispose: () => cameraDirector.dispose?.() });
  EngineRegistry.registerSystem('replayPlayback', { dispose: () => replayPlayback.dispose?.() });
  EngineRegistry.registerSystem('gameLoop', { dispose: () => gameLoop.dispose?.() });
  EngineRegistry.registerSystem('casino', { dispose: () => casino.dispose() });
  EngineRegistry.registerSystem('decorations', { dispose: () => decorations.dispose() });

  let lastSnapshot: SnapshotBall[] | null = null;
  let lastDt = 1 / 60;
  const _cueBallPos = new THREE.Vector3(0, _ballR, 0);

  const cleanups: (() => void)[] = [];

  // Register ambient FX as an independent pipeline slot — dedup-safe
  // via EngineRegistry (repeated calls are no-ops for the same key).
  const ambientFxCleanup = EngineRegistry.registerPipeline(rs, 'setupScene.ambientFx', 'effects', {
    name: 'setupScene.ambientFx',
    priority: 100,
    modes: ['LIVE', 'REPLAY', 'IDLE'],
    writes: ['trailBuffer', 'casinoEnv', 'decorations', 'lights'],
    callback: (timing: FrameTiming) => {
      camera.getWorldPosition(_camPos);
      lights.updateRim(_camPos);
      ballUpdater.sync(lights);
      trail.update();
      casino.update(timing.delta, _cueBallPos);
      decorations.update(timing.delta, _cueBallPos);
    },
  });
  cleanups.push(ambientFxCleanup);

  const sceneHandle: SceneHandle = {
    balls,
    lights,
    ballUpdater,
    shadows,
    cue,
    aimGuide,
    ghostSim,
    spinVisualizer,
    trail,
    cinematicCamera,
    effects,
    impact,
    replayRecorder,
    cameraDirector,
    replayPlayback,
    gameLoop,
    eventBus,
    casino,
    decorations,
    syncSnapshot: (snapshot: SnapshotBall[], dt: number) => {
      lastSnapshot = snapshot;
      lastDt = dt;
      gameLoop.updateFrame(snapshot, dt);
      balls.update(snapshot);
      shadows.update(snapshot, dt);

      const cueBall = snapshot.find(b => b.id === 0);
      if (cueBall && !cueBall.isPocketed) {
        _cueBallPos.set(cueBall.x - 400, _ballR, cueBall.y - 200);
      }
    },
    frameSync: (_timing: FrameTiming) => {
    },
    dispose: () => {
      for (const fn of cleanups) fn();
      disposeTable(rs);
      disposeBallAtlas();
    },
  };

  // Track the scene handle for global teardown
  EngineRegistry.setSceneHandle(sceneHandle);

  return sceneHandle;
}
