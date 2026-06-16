export { RenderService } from './RenderService';
export type {
  RendererOptions,
  FrameTiming,
  PipelineCallback,
  PipelineHooks,
  CapabilityReport,
  ContextStatus,
} from './types';
export { SceneGroup } from './types';
export { buildTable } from './scene/createTable';
export { setupScene } from './scene/setupScene';
export type { SceneHandle } from './scene/setupScene';
export { createBalls } from './objects/createBalls';
export type { SnapshotBall, BallSystemController } from './objects/createBalls';
export { applyMaterialOverrides } from './objects/applyMaterialOverrides';
export type { BallUniformUpdater } from './objects/applyMaterialOverrides';
export { createLightRig } from './lights/createLightRig';
export type { LightController, LightData } from './lights/createLightRig';
export { createContactShadowSystem } from './shadows/createContactShadowSystem';
export type { ContactShadowController } from './shadows/createContactShadowSystem';
export { createCueSystem } from './objects/createCueSystem';
export type { CueSystemController } from './objects/createCueSystem';
export { createAimGuide } from './objects/createAimGuide';
export type { AimGuideController } from './objects/createAimGuide';
export { createGhostSimulation } from './objects/createGhostSimulation';
export type { GhostSimController, GhostResult } from './objects/createGhostSimulation';
export { createSpinVisualizer } from './objects/createSpinVisualizer';
export type { SpinVisualizerController } from './objects/createSpinVisualizer';
export { createShotReplayTrail } from './objects/createShotReplayTrail';
export type { ShotReplayTrailController } from './objects/createShotReplayTrail';
export { SPIN, aimDir, perpDir, spinLongColor, spinLongLabel, spinLatLabel } from './objects/mapSpinToVisuals';
export { createCinematicCamera, CameraState } from './camera/createCinematicCamera';
export type { CinematicCameraController, CameraInput, CollisionEvent } from './camera/createCinematicCamera';
export { createVisualEffects } from './effects/createVisualEffects';
export type { VisualEffectsController } from './effects/createVisualEffects';
export { createImpactFeedback } from './effects/createImpactFeedback';
export type { ImpactFeedbackController } from './effects/createImpactFeedback';
export { createReplayRecorder, createCameraDirector, createReplayPlaybackController } from './replay/index';
export type { ReplayRecorder, ReplayFrame, ReplayShotData } from './replay/ReplayRecorder';
export type { CameraDirectorController, DirectorInput, MovingBallData, RigId, RigTarget } from './replay/CameraDirector';
export type { ReplayPlaybackController, ReplayMode } from './replay/ReplayPlaybackController';
export { createGameLoopOrchestrator } from '../game/GameLoopOrchestrator';
export type { GameLoopOrchestrator, CueState, GameState } from '../game/GameLoopOrchestrator';
