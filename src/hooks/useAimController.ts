import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RenderService } from '../renderer/RenderService';
import { SceneHandle } from '../renderer/scene/setupScene';
import {
  createCueSystem,
  CueSystemController,
} from '../renderer/objects/createCueSystem';
import {
  createAimGuide,
  AimGuideController,
} from '../renderer/objects/createAimGuide';
import {
  createGhostSimulation,
  GhostSimController,
} from '../renderer/objects/createGhostSimulation';
import {
  createSpinVisualizer,
  SpinVisualizerController,
} from '../renderer/objects/createSpinVisualizer';
import {
  createShotReplayTrail,
  ShotReplayTrailController,
} from '../renderer/objects/createShotReplayTrail';
import {
  CameraState,
} from '../renderer/camera/createCinematicCamera';

export interface AimInputRefs {
  aimAngleRef: React.MutableRefObject<number>;
  shotPowerRef: React.MutableRefObject<number>;
  isMyTurnRef: React.MutableRefObject<boolean>;
  isAnimatingRef: React.MutableRefObject<boolean>;
  isPullingRef: React.MutableRefObject<boolean>;
  spinXRef: React.MutableRefObject<number>;
  spinYRef: React.MutableRefObject<number>;
  ballsRef: React.MutableRefObject<
    Array<{ id: number; x: number; y: number; isPocketed: boolean }>
  >;
}

const _matrix = new THREE.Matrix4();
const _cuePos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _prevCuePos = new THREE.Vector3();
const _prevCueSpeed = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _bp1 = new THREE.Vector3();
const _bp2 = new THREE.Vector3();
const _collPos = new THREE.Vector3();
const _collNormal = new THREE.Vector3();
const _movingPositions: THREE.Vector3[] = [];

const BALL_R = 10;
const TABLE_X_BOUND = 370;
const TABLE_Z_BOUND = 170;

export function useAimController(
  inputRefs: AimInputRefs,
  sceneHandle: SceneHandle,
  rs: RenderService,
): void {
  const cueRef = useRef<CueSystemController | null>(null);
  const aimRef = useRef<AimGuideController | null>(null);
  const ghostRef = useRef<GhostSimController | null>(null);
  const spinRef = useRef<SpinVisualizerController | null>(null);
  const trailRef = useRef<ShotReplayTrailController | null>(null);
  const initializedRef = useRef(false);
  const wasAnimatingRef = useRef(false);
  const prevBallData = useRef<Map<number, { x: number; y: number; z: number }>>(new Map());
  const collisionCooldownRef = useRef(0);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const cue = createCueSystem(rs);
    const aim = createAimGuide(rs);
    const ghost = createGhostSimulation(rs, sceneHandle.balls);
    const spinVis = createSpinVisualizer(rs);
    const trail = createShotReplayTrail(rs);
    cueRef.current = cue;
    aimRef.current = aim;
    ghostRef.current = ghost;
    spinRef.current = spinVis;
    trailRef.current = trail;

    const camera = rs.getCamera()!;

    rs.setPipelineHook('onUpdate', (timing) => {
      // ── Replay active? delegate to orchestrator ──
      if (sceneHandle.gameLoop.getState() === 'REPLAY') {
        sceneHandle.gameLoop.tick(timing.delta);
        return;
      }

      const aimAngle = inputRefs.aimAngleRef.current;
      const power = inputRefs.shotPowerRef.current;
      const isMyTurn = inputRefs.isMyTurnRef.current;
      const isAnimating = inputRefs.isAnimatingRef.current;
      const isPulling = inputRefs.isPullingRef.current;
      const spinX = inputRefs.spinXRef.current;
      const spinY = inputRefs.spinYRef.current;
      const balls = inputRefs.ballsRef.current;
      const dt = Math.min(timing.delta, 0.05);

      const cb = balls.find(b => b.id === 0);
      if (cb && !cb.isPocketed) {
        _cuePos.set(cb.x - 400, BALL_R, cb.y - 200);
      }

      const isAiming = isMyTurn && !isAnimating;

      // ── Shot lifecycle via orchestrator ──
      if (isAnimating && !wasAnimatingRef.current) {
        sceneHandle.gameLoop.startShot({
          angle: aimAngle,
          spinX,
          spinY,
          power,
        });
      }
      if (!isAnimating && wasAnimatingRef.current) {
        sceneHandle.gameLoop.endShot();
      }

      // ── Cue / Aim / Ghost / Spin ──
      if (isAiming) {
        cue.show();
        cue.update(aimAngle, isPulling ? power : 0, _cuePos, dt);
        aim.show();
        aim.update(_cuePos, aimAngle, balls, dt);
        ghost.show();
        ghost.update(aimAngle, _cuePos, balls);
        spinVis.show();
        spinVis.update(aimAngle, spinX, spinY, _cuePos);
      } else {
        cue.hide();
        aim.hide();
        ghost.hide();
        spinVis.hide();
      }

      // ── Shot trail ──
      if (isAnimating && !wasAnimatingRef.current) {
        trail.show();
        trail.reset();
      }
      wasAnimatingRef.current = isAnimating;

      if (isAnimating) {
        const speed = _prevCueSpeed.distanceTo(_cuePos) / Math.max(dt, 0.001);
        trail.record(_cuePos, speed);
      }
      _prevCueSpeed.copy(_cuePos);

      if (!isMyTurn && !isAnimating) {
        trail.hide();
      }

      // ── Ball tracking & collision detection ──
      collisionCooldownRef.current = Math.max(0, collisionCooldownRef.current - dt);
      _movingPositions.length = 0;
      const currentData = new Map<number, { x: number; y: number; z: number }>();

      for (const sb of balls) {
        const tx = sb.x - 400;
        const tz = sb.y - 200;
        currentData.set(sb.id, { x: tx, y: BALL_R, z: tz });
        const prev = prevBallData.current.get(sb.id);
        if (prev) {
          const dx = tx - prev.x;
          const dz = tz - prev.z;
          if (dx * dx + dz * dz > 0.25) {
            _movingPositions.push(new THREE.Vector3(tx, BALL_R, tz));
          }
        }
      }

      if (collisionCooldownRef.current <= 0 && isAnimating) {
        const ballIds = balls.filter(b => b.id >= 0 && b.id < 16).map(b => b.id);
        const currPositions = new Map<number, THREE.Vector3>();
        for (const id of ballIds) {
          const d = currentData.get(id);
          if (d) currPositions.set(id, new THREE.Vector3(d.x, d.y, d.z));
        }

        for (let ai = 0; ai < ballIds.length; ai++) {
          const idA = ballIds[ai];
          const curr = currentData.get(idA);
          const prev = prevBallData.current.get(idA);
          if (!curr || !prev) continue;

          const absX = Math.abs(curr.x);
          const absZ = Math.abs(curr.z);
          if (absX > TABLE_X_BOUND && Math.abs(prev.x) <= TABLE_X_BOUND) {
            _collPos.set(curr.x, BALL_R, curr.z);
            _collNormal.set(Math.sign(-curr.x), 0, 0);
            sceneHandle.impact.trigger(_collPos, _collNormal);
            sceneHandle.gameLoop.recordCollision({
              position: _collPos.clone(),
              normal: _collNormal.clone(),
              time: 0,
            });
            collisionCooldownRef.current = 0.1;
          }
          if (absZ > TABLE_Z_BOUND && Math.abs(prev.z) <= TABLE_Z_BOUND) {
            _collPos.set(curr.x, BALL_R, curr.z);
            _collNormal.set(0, 0, Math.sign(-curr.z));
            sceneHandle.impact.trigger(_collPos, _collNormal);
            sceneHandle.gameLoop.recordCollision({
              position: _collPos.clone(),
              normal: _collNormal.clone(),
              time: 0,
            });
            collisionCooldownRef.current = 0.1;
          }

          for (let bi = ai + 1; bi < ballIds.length; bi++) {
            const idB = ballIds[bi];
            const ci = currPositions.get(idA);
            const cj = currPositions.get(idB);
            if (!ci || !cj) continue;
            const dist = ci.distanceTo(cj);
            const pi = prevBallData.current.get(idA);
            const pj = prevBallData.current.get(idB);
            const prevDist = pi && pj ? Math.sqrt((pi.x - pj.x) ** 2 + (pi.z - pj.z) ** 2) : 999;
            if (dist < BALL_R * 2 && prevDist >= BALL_R * 2) {
              _collPos.copy(ci).add(cj).multiplyScalar(0.5);
              _collNormal.copy(cj).sub(ci).normalize();
              sceneHandle.impact.trigger(_collPos, _collNormal);
              sceneHandle.gameLoop.recordCollision({
                position: _collPos.clone(),
                normal: _collNormal.clone(),
                time: 0,
              });
              collisionCooldownRef.current = 0.1;
            }
          }
        }
      }

      prevBallData.current = currentData;

      // ── Camera state machine ──
      if (isAiming) {
        if (isPulling) {
          sceneHandle.cinematicCamera.forceState(CameraState.SHOT_CHARGE);
        } else {
          sceneHandle.cinematicCamera.forceState(CameraState.AIM_FOCUS);
        }
      } else if (isAnimating) {
        if (collisionCooldownRef.current > 0.05) {
          sceneHandle.cinematicCamera.forceState(CameraState.IMPACT_REACTION);
        } else {
          sceneHandle.cinematicCamera.forceState(CameraState.BALL_TRACKING);
        }
      } else {
        sceneHandle.cinematicCamera.forceState(CameraState.BROADCAST_IDLE);
      }

      sceneHandle.cinematicCamera.update(dt, {
        aimAngle,
        cueBallPos: _cuePos,
        movingBalls: _movingPositions,
        shotPower: power,
        isPulling,
        isAiming,
        collisions: [],
      });

      // ── Effects ──
      const maxSpeed = _prevCueSpeed.length() / Math.max(dt, 0.001);
      sceneHandle.effects.update({
        maxBallSpeed: isAnimating ? maxSpeed : 0,
        isShooting: isAnimating,
        dt,
      });

      // ── Impact feedback ──
      sceneHandle.impact.update(dt);

      // ── BallUpdater / Light sync ──
      camera.getWorldPosition(_camPos);
      sceneHandle.lights.updateRim(_camPos);
      sceneHandle.ballUpdater.sync(sceneHandle.lights);
    });

    return () => {
      rs.setPipelineHook('onUpdate', null);
      cue.dispose();
      aim.dispose();
      ghost.dispose();
      spinVis.dispose();
      trail.dispose();
    };
  }, [inputRefs, sceneHandle, rs]);
}
