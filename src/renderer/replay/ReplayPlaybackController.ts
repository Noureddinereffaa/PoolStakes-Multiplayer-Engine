import * as THREE from 'three';
import { RenderService } from '../RenderService';
import { SceneGroup } from '../types';
import { SnapshotBall, BallSystemController } from '../objects/createBalls';
import { GhostSimController } from '../objects/createGhostSimulation';
import { LightController } from '../lights/createLightRig';
import { BallUniformUpdater } from '../objects/applyMaterialOverrides';
import { CameraDirectorController, DirectorInput, MovingBallData } from './CameraDirector';
import { ReplayShotData, ReplayFrame } from './ReplayRecorder';

export type ReplayMode = 'idle' | 'playing' | 'finished';

export interface ReplayPlaybackController {
  start(shotData: ReplayShotData): void;
  stop(): void;
  getMode(): ReplayMode;
  setComparisonMode(on: boolean): void;
  isComparisonMode(): boolean;
  update(dt: number): void;
  dispose(): void;
}

const BALL_R = 10;
const MAX_FRAME_DT = 0.05;

let _interpSnapshot: SnapshotBall[] = [];
const _matrix = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _movingBalls: MovingBallData[] = [];
const _ballA = new THREE.Vector3();
const _ballB = new THREE.Vector3();

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpSnapshot(
  a: SnapshotBall[],
  b: SnapshotBall[],
  alpha: number,
): SnapshotBall[] {
  const result: SnapshotBall[] = [];
  for (const ballA of a) {
    const ballB = b.find(bb => bb.id === ballA.id) ?? ballA;
    result.push({
      id: ballA.id,
      x: lerp(ballA.x, ballB.x, alpha),
      y: lerp(ballA.y, ballB.y, alpha),
      isPocketed: alpha < 0.5 ? ballA.isPocketed : ballB.isPocketed,
    });
  }
  return result;
}

export function createReplayPlaybackController(
  rs: RenderService,
  balls: BallSystemController,
  lights: LightController,
  ballUpdater: BallUniformUpdater,
  ghostSim: GhostSimController,
  cameraDirector: CameraDirectorController,
): ReplayPlaybackController {
  const camera = rs.getCamera()!;
  const debugGroup = rs.getSceneGroup(SceneGroup.Debug);

  let mode: ReplayMode = 'idle';
  let shotData: ReplayShotData | null = null;
  let comparisonMode = false;

  let replayTime = 0;
  let currentTimeScale = 1.0;
  let targetTimeScale = 1.0;

  let prevFrameIdx = 0;
  let frameA: ReplayFrame | null = null;
  let frameB: ReplayFrame | null = null;

  const _camPos = new THREE.Vector3();

  let highlightGlow: THREE.Mesh | null = null;
  let vignetteOpacity = 0;

  const _ghostTarget = new THREE.Vector3();

  function createHighlightGlow(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(15, 12, 12);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'ReplayGlow';
    mesh.visible = false;
    if (debugGroup) debugGroup.add(mesh);
    return mesh;
  }

  function findFrameIndices(time: number): { a: number; alpha: number } {
    if (!shotData || shotData.frames.length < 2) return { a: 0, alpha: 0 };
    const frames = shotData.frames;
    const last = frames.length - 1;

    if (time >= frames[last].t) return { a: last, alpha: 1 };

    let lo = 0;
    let hi = last;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (frames[mid].t < time) lo = mid + 1;
      else hi = mid;
    }

    const idx = Math.max(0, lo - 1);
    const next = Math.min(idx + 1, last);
    const fA = frames[idx];
    const fB = frames[next];
    const range = fB.t - fA.t;
    const alpha = range > 0 ? (time - fA.t) / range : 0;
    return { a: idx, alpha: Math.max(0, Math.min(1, alpha)) };
  }

  function advancePlayback(dt: number): boolean {
    if (!shotData || mode !== 'playing') return false;

    const rawDt = Math.min(dt, MAX_FRAME_DT);
    const scaleDt = rawDt * currentTimeScale;
    replayTime += scaleDt;

    if (replayTime >= shotData.duration) {
      mode = 'finished';
      return false;
    }

    const { a, alpha } = findFrameIndices(replayTime);
    if (a !== prevFrameIdx) {
      prevFrameIdx = a;
    }

    frameA = shotData.frames[a];
    frameB = shotData.frames[Math.min(a + 1, shotData.frames.length - 1)];

    if (!frameA || !frameB) return false;

    _interpSnapshot = lerpSnapshot(frameA.snapshot, frameB.snapshot, alpha);

    balls.update(_interpSnapshot);

    const cueBall = _interpSnapshot.find(b => b.id === 0);
    if (cueBall && !cueBall.isPocketed) {
      _pos.set(cueBall.x - 400, BALL_R, cueBall.y - 200);
    }

    _movingBalls.length = 0;
    for (const b of _interpSnapshot) {
      if (b.isPocketed) continue;
      const hitA = frameA.snapshot.find(s => s.id === b.id);
      const hitB = frameB.snapshot.find(s => s.id === b.id);
      if (hitA && hitB) {
        const dx = (hitB.x - hitA.x) / Math.max(frameB.t - frameA.t, 0.001);
        const dy = (hitB.y - hitA.y) / Math.max(frameB.t - frameA.t, 0.001);
        const speed = Math.sqrt(dx * dx + dy * dy);
        if (speed > 1) {
          _movingBalls.push({
            pos: new THREE.Vector3(b.x - 400, BALL_R, b.y - 200),
            speed,
          });
        }
      }
    }

    return true;
  }

  function updateCamera(dt: number): void {
    if (!shotData) return;

    const input: DirectorInput = {
      cueBallPos: _pos,
      movingBalls: _movingBalls,
      collisions: shotData.collisions.map((c) => ({
        position: c.position,
        time: c.time,
      })),
      time: dt,
    };

    const target = cameraDirector.evaluate(input);
    camera.position.copy(target.position);
    camera.fov = target.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(target.lookAt);
  }

  function updateTimeScale(dt: number): void {
    if (!shotData) return;

    const collisionTimes = shotData.collisions.map((c) => c.time).filter((t) => t > 0);
    const hasRecentCollision = collisionTimes.some(
      (t) => Math.abs(t - replayTime) < 0.3,
    );

    if (replayTime < 0.5) {
      targetTimeScale = 0.5;
    } else if (hasRecentCollision) {
      targetTimeScale = 0.2;
    } else if (replayTime > shotData.duration * 0.8) {
      targetTimeScale = 0.6;
    } else {
      targetTimeScale = 0.5;
    }

    const smoothFactor = 1 - Math.exp(-dt * 6);
    currentTimeScale += (targetTimeScale - currentTimeScale) * smoothFactor;
  }

  function updateComparison(dt: number): void {
    if (!comparisonMode || !shotData) return;

    const cueBall = _interpSnapshot.find(b => b.id === 0);
    if (cueBall && !cueBall.isPocketed) {
      _ghostTarget.set(cueBall.x - 400, BALL_R, cueBall.y - 200);
      ghostSim.update(shotData.cueAngle, _ghostTarget, _interpSnapshot);
      ghostSim.show();
    } else {
      ghostSim.hide();
    }
  }

  function updateVisualEffects(dt: number): void {
    if (mode === 'playing') {
      vignetteOpacity = Math.min(vignetteOpacity + dt * 2, 0.35);
    } else {
      vignetteOpacity = Math.max(vignetteOpacity - dt * 2, 0);
    }

    if (!highlightGlow) return;

    if (shotData && mode === 'playing') {
      const collisionActive = shotData.collisions.some(
        (c) => Math.abs(c.time - replayTime) < 0.08,
      );
      if (collisionActive) {
        highlightGlow.visible = true;
        const col = shotData.collisions.find(
          (c) => Math.abs(c.time - replayTime) < 0.08,
        );
        if (col) {
          highlightGlow.position.copy(col.position);
          highlightGlow.position.y = BALL_R + 5;
          const glowAlpha = 1 - Math.abs(replayTime - col.time) / 0.08;
          (highlightGlow.material as THREE.MeshBasicMaterial).opacity = glowAlpha * 0.5;
        }
      } else {
        highlightGlow.visible = false;
      }
    } else {
      highlightGlow.visible = false;
    }
  }

  function syncLights(): void {
    if (!camera) return;
    camera.getWorldPosition(_camPos);
    lights.updateRim(_camPos);
    ballUpdater.sync(lights);
  }

  const controller: ReplayPlaybackController = {
    getMode: () => mode,
    isComparisonMode: () => comparisonMode,
    setComparisonMode: (on: boolean) => {
      comparisonMode = on;
      if (!on) ghostSim.hide();
    },

    update: (dt: number) => {
      if (mode !== 'playing') return;

      if (comparisonMode) {
        ghostSim.show();
      }

      updateTimeScale(dt);

      const active = advancePlayback(dt);
      if (!active) {
        syncLights();
        return;
      }

      updateCamera(dt);
      updateComparison(dt);
      updateVisualEffects(dt);
      syncLights();
    },

    stop: () => {
      mode = 'idle';
      shotData = null;
      replayTime = 0;
      currentTimeScale = 1.0;
      targetTimeScale = 1.0;
      prevFrameIdx = 0;
      frameA = null;
      frameB = null;
      vignetteOpacity = 0;

      // Dispose highlight glow
      if (highlightGlow) {
        highlightGlow.geometry?.dispose();
        (highlightGlow.material as THREE.Material)?.dispose();
        debugGroup?.remove(highlightGlow);
        highlightGlow = null;
      }

      const renderer = rs.getRenderer();
      if (renderer) {
        renderer.toneMappingExposure = 1.0;
      }
    },

    start: (data: ReplayShotData) => {
      shotData = data;
      replayTime = 0;
      currentTimeScale = 1.0;
      targetTimeScale = 1.0;
      prevFrameIdx = 0;
      frameA = null;
      frameB = null;
      vignetteOpacity = 0;

      if (!highlightGlow) {
        highlightGlow = createHighlightGlow();
      }

      mode = 'playing';
    },
  };

  return controller;
}
