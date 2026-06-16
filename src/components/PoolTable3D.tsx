import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThreeRenderer } from '../hooks/useThreeRenderer';
import { RenderService } from '../renderer/RenderService';
import { setupScene, SceneHandle } from '../renderer/scene/setupScene';
import { CameraState } from '../renderer/camera/createCinematicCamera';
import { GameRenderMode } from '../game/GameRenderMode';
import { ReplayController } from '../game/ReplayController';
import { SnapshotBall } from '../renderer/objects/createBalls';
import { EngineRegistry } from '../engine/EngineRegistry';
import { debugLog } from '../utils/debugLog';
import type { RoomState, Difficulty } from '../types';

export interface PoolTableHandle {
  spinX: number;
  spinY: number;
  shotPower: number;
  isAimLocked: boolean;
  aimAngle: number;
  setSpinX: (v: number) => void;
  setSpinY: (v: number) => void;
  setShotPower: (v: number) => void;
  setIsAimLocked: (v: boolean) => void;
  setIsPulling: (v: boolean) => void;
  setAimAngle: (v: number | ((prev: number) => number)) => void;
  handleShoot: () => void;
  hudNotification: string | null;
  triggerConfetti?: (count: number) => void;
}

interface PoolTableProps {
  roomState: RoomState;
  onShoot: (angle: number, power: number, spinX: number, spinY: number) => void;
  onResetCueBall: (x: number, y: number) => void;
  myPlayerId: string;
  isMyTurn: boolean;
  physicsFrames: Array<Array<{ id: number; x: number; y: number; isPocketed: boolean }>> | null;
  physicsTotalSteps: number | null;
  onClearFrames: () => void;
  opponentAim?: { angle: number; power: number; spinX?: number; spinY?: number } | null;
  onPreviewAim?: (angle: number, power: number, spinX: number, spinY: number) => void;
  onJoinAI?: (difficulty?: Difficulty) => void;
  isFineAim?: boolean;
}

const BALL_R = 10;
const TABLE_X_BOUND = 370;
const TABLE_Z_BOUND = 170;
const STRIKE_DURATION = 0.12;
const SETTLE_DURATION = 0.25;
const FRAME_WAIT_TIMEOUT = 5;

const _matrix = new THREE.Matrix4();
const _cuePos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _prevCuePos = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _bp1 = new THREE.Vector3();
const _collPos = new THREE.Vector3();
const _collNormal = new THREE.Vector3();
const _movingPositions: THREE.Vector3[] = [];

function PoolTable3D(props: PoolTableProps, ref: React.Ref<PoolTableHandle>) {
  const { roomState, isMyTurn, onShoot, onResetCueBall } = props;

  const sceneRef = useRef<SceneHandle | null>(null);
  const rsRef = useRef<RenderService | null>(null);
  const [ready, setReady] = useState(false);
  const initializedRef = useRef(false);

  const aimAngleRef = useRef(0);
  const shotPowerRef = useRef(40);
  const isPullingRef = useRef(false);
  const spinXRef = useRef(0);
  const spinYRef = useRef(0);
  const ballsRef = useRef<SnapshotBall[]>([]);
  const isMyTurnRef = useRef(isMyTurn);
  const isAnimatingRef = useRef(false);
  const wasAnimatingRef = useRef(false);

  const renderMode = useRef<GameRenderMode>('IDLE');
  const phaseTimerRef = useRef(0);
  const waitingForFramesRef = useRef(false);
  const framesWaitTimerRef = useRef(0);
  const prevBallData = useRef<Map<number, { x: number; y: number; z: number }>>(new Map());
  const collisionCooldownRef = useRef(0);
  const oppAimRef = useRef(props.opponentAim);

  const replayController = useRef(new ReplayController());

  isMyTurnRef.current = isMyTurn;
  useEffect(() => { oppAimRef.current = props.opponentAim; }, [props.opponentAim]);

  const { containerRef } = useThreeRenderer({
    onReady: (rs: RenderService) => {
      rsRef.current = rs;
      const scene = setupScene(rs);
      sceneRef.current = scene;
      setReady(true);
    },
  });

  useEffect(() => {
    if (!ready || initializedRef.current) return;
    initializedRef.current = true;

    const rs = rsRef.current!;
    const scene = sceneRef.current!;

    // Use systems from setupScene — NO duplicate creation.
    // setupScene already creates cue, aim, ghost, spin, trail,
    // and they are tracked in EngineRegistry for dedup safety.
    const cue = scene.cue;
    const aim = scene.aimGuide;
    const ghost = scene.ghostSim;
    const spinVis = scene.spinVisualizer;
    const trail = scene.trail;

    const camera = rs.getCamera()!;

    const oppLineMat = new THREE.LineBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.5 });
    const oppLineGeo = new THREE.BufferGeometry();
    const oppLinePos = new Float32Array(6);
    oppLineGeo.setAttribute('position', new THREE.BufferAttribute(oppLinePos, 3));
    const oppLine = new THREE.Line(oppLineGeo, oppLineMat);
    oppLine.visible = false;
    rs.getScene()?.add(oppLine);

    // Register the main game pipeline hook via EngineRegistry
    // for dedup-safe registration (replaces old setPipelineHook).
    const cleanupPipeline = EngineRegistry.registerPipeline(rs, 'PoolTable3D.onUpdate', 'effects', {
      name: 'PoolTable3D.onUpdate',
      priority: 500,
      modes: ['LIVE', 'REPLAY', 'IDLE'],
      writes: ['cueStick', 'aimGuide', 'ghostBall', 'spinVis', 'trail', 'camera', 'effects', 'decorations'],
      callback: (timing) => {
        const dt = Math.min(timing.delta, 0.05);
        const mode = renderMode.current;

        // ── REPLAY mode: ReplayController owns everything ───────
        if (mode === 'REPLAY') {
          replayController.current.tick(dt);

          const cb = ballsRef.current.find(b => b.id === 0);
          if (cb && !cb.isPocketed) {
            _cuePos.set(cb.x - 400, BALL_R, cb.y - 200);
          }

          scene.cinematicCamera.forceState(CameraState.BALL_TRACKING);
          scene.cinematicCamera.update(dt, {
            aimAngle: aimAngleRef.current,
            cueBallPos: _cuePos,
            movingBalls: _movingPositions,
            shotPower: shotPowerRef.current,
            isPulling: false,
            isAiming: false,
            collisions: [],
          });

          scene.effects.update({ maxBallSpeed: 0, isShooting: true, dt });
          scene.impact.update(dt);
          scene.decorations.update(dt, _cuePos);
          return;
        }

        // ── LIVE or IDLE ───────────────────────────────────────
        const aimAngle = aimAngleRef.current;
        const power = shotPowerRef.current;
        const isMyTurnVal = isMyTurnRef.current;
        const isPulling = isPullingRef.current;
        const spinX = spinXRef.current;
        const spinY = spinYRef.current;
        const balls = ballsRef.current;

        phaseTimerRef.current += dt;

        const cb = balls.find(b => b.id === 0);
        if (cb && !cb.isPocketed) {
          _cuePos.set(cb.x - 400, BALL_R, cb.y - 200);
        }

        // ── Phase machine ──────────────────────────────────────
        let phase: 'idle' | 'strike' | 'waiting' | 'settle' = 'idle';
        if (mode === 'IDLE') {
          phase = 'idle';
        } else {
          if (phaseTimerRef.current < STRIKE_DURATION) {
            phase = 'strike';
          } else if (waitingForFramesRef.current) {
            phase = 'waiting';
          } else {
            phase = 'idle';
          }
        }

        const isAnimating = phase !== 'idle';

        if (isAnimating && !wasAnimatingRef.current) {
          scene.gameLoop.startShot({ angle: aimAngle, spinX, spinY, power });
        }
        if (!isAnimating && wasAnimatingRef.current) {
          scene.gameLoop.endShot();
        }

        if (isAiming(isMyTurnVal, isAnimating)) {
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

        if (isAnimating && !wasAnimatingRef.current) {
          trail.show();
          trail.reset();
        }
        wasAnimatingRef.current = isAnimating;

        if (isAnimating) {
          const speed = _prevCuePos.distanceTo(_cuePos) / Math.max(dt, 0.001);
          trail.record(_cuePos, speed);
        }
        _prevCuePos.copy(_cuePos);

        if (!isMyTurnVal && !isAnimating) {
          trail.hide();
        }

        if (!isMyTurnVal && oppAimRef.current && !isAnimating) {
          const oppAngle = oppAimRef.current.angle;
          const oppLen = 150;
          const ex = _cuePos.x + Math.cos(oppAngle) * oppLen;
          const ez = _cuePos.z + Math.sin(oppAngle) * oppLen;
          oppLinePos[0] = _cuePos.x; oppLinePos[1] = BALL_R; oppLinePos[2] = _cuePos.z;
          oppLinePos[3] = ex; oppLinePos[4] = BALL_R; oppLinePos[5] = ez;
          oppLine.geometry.attributes.position.needsUpdate = true;
          oppLine.visible = true;
        } else {
          oppLine.visible = false;
        }

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
          for (const sb of balls) {
            const curr = currentData.get(sb.id);
            const prev = prevBallData.current.get(sb.id);
            if (!curr || !prev) continue;
            const absX = Math.abs(curr.x);
            const absZ = Math.abs(curr.z);
            if (absX > TABLE_X_BOUND && Math.abs(prev.x) <= TABLE_X_BOUND) {
              _collPos.set(curr.x, BALL_R, curr.z);
              _collNormal.set(Math.sign(-curr.x), 0, 0);
              scene.impact.trigger(_collPos, _collNormal);
              scene.gameLoop.recordCollision({ position: _collPos.clone(), normal: _collNormal.clone(), time: 0 });
              collisionCooldownRef.current = 0.1;
            }
            if (absZ > TABLE_Z_BOUND && Math.abs(prev.z) <= TABLE_Z_BOUND) {
              _collPos.set(curr.x, BALL_R, curr.z);
              _collNormal.set(0, 0, Math.sign(-curr.z));
              scene.impact.trigger(_collPos, _collNormal);
              scene.gameLoop.recordCollision({ position: _collPos.clone(), normal: _collNormal.clone(), time: 0 });
              collisionCooldownRef.current = 0.1;
            }
          }

          const ballIds = balls.filter(b => b.id >= 0 && b.id < 16).map(b => b.id);
          const currPositions = new Map<number, THREE.Vector3>();
          for (const id of ballIds) {
            const d = currentData.get(id);
            if (d) currPositions.set(id, new THREE.Vector3(d.x, d.y, d.z));
          }
          for (let ai = 0; ai < ballIds.length; ai++) {
            const idA = ballIds[ai];
            const ci = currPositions.get(idA);
            if (!ci) continue;
            for (let bi = ai + 1; bi < ballIds.length; bi++) {
              const idB = ballIds[bi];
              const cj = currPositions.get(idB);
              if (!cj) continue;
              const dist = ci.distanceTo(cj);
              const pi = prevBallData.current.get(idA);
              const pj = prevBallData.current.get(idB);
              const prevDist = pi && pj ? Math.sqrt((pi.x - pj.x) ** 2 + (pi.z - pj.z) ** 2) : 999;
              if (dist < BALL_R * 2 && prevDist >= BALL_R * 2) {
                _collPos.copy(ci).add(cj).multiplyScalar(0.5);
                _collNormal.copy(cj).sub(ci).normalize();
                scene.impact.trigger(_collPos, _collNormal);
                scene.gameLoop.recordCollision({ position: _collPos.clone(), normal: _collNormal.clone(), time: 0 });
                collisionCooldownRef.current = 0.1;
              }
            }
          }
        }

        prevBallData.current = currentData;

        if (isAiming(isMyTurnVal, isAnimating)) {
          scene.cinematicCamera.forceState(isPulling ? CameraState.SHOT_CHARGE : CameraState.AIM_FOCUS);
        } else if (phase === 'strike') {
          scene.cinematicCamera.forceState(CameraState.SHOT_CHARGE);
        } else if (phase === 'waiting') {
          scene.cinematicCamera.forceState(CameraState.BALL_TRACKING);
        } else {
          scene.cinematicCamera.forceState(CameraState.BROADCAST_IDLE);
        }

        scene.cinematicCamera.update(dt, {
          aimAngle,
          cueBallPos: _cuePos,
          movingBalls: _movingPositions,
          shotPower: power,
          isPulling,
          isAiming: isAiming(isMyTurnVal, isAnimating),
          collisions: [],
        });

        const maxSpeed = _prevCuePos.length() / Math.max(dt, 0.001);
        scene.effects.update({ maxBallSpeed: isAnimating ? maxSpeed : 0, isShooting: isAnimating, dt });
        scene.impact.update(dt);
        scene.decorations.update(dt, _cuePos);
      },
    });

    return () => {
      // Remove pipeline slot
      cleanupPipeline();
      // Dispose the opponent line geometry
      oppLine.geometry.dispose();
      oppLineMat.dispose();
      rs.getScene()?.remove(oppLine);
      // NOTE: scene.dispose() is called by EngineRegistry.disposeAll()
      // during HMR teardown, not here — the scene handle is shared.
    };
  }, [ready]);

  // LIVE mode: sync ball positions from roomState
  useEffect(() => {
    if (!sceneRef.current || !ready) return;
    if (renderMode.current === 'REPLAY') {
      debugLog('replay', 'roomState SKIP — in REPLAY mode');
      return;
    }
    const scene = sceneRef.current;
    const snapshot = roomState.balls.map(b => ({ id: b.id, x: b.x, y: b.y, isPocketed: b.isPocketed }));
    scene.syncSnapshot(snapshot, 1 / 60);
    ballsRef.current = snapshot;
  }, [roomState?.balls, ready]);

  // Physics frames arrive → start deterministic REPLAY mode
  useEffect(() => {
    if (!props.physicsFrames || props.physicsFrames.length < 2) return;

    const scene = sceneRef.current;
    const rs = rsRef.current;
    if (!scene || !ready || !rs) return;

    // Cancel any pending local game loop replay
    scene.gameLoop.exitReplay();

    // Transition to REPLAY mode
    renderMode.current = 'REPLAY';
    rs.requestMode('REPLAY');
    isAnimatingRef.current = true;
    waitingForFramesRef.current = false;

    replayController.current.start(
      props.physicsFrames.map(frames => ({ balls: frames })),
      (snapshot) => {
        scene.syncSnapshot(snapshot, 1 / 60);
        ballsRef.current = snapshot;
      },
      () => {
        renderMode.current = 'IDLE';
        rs.requestMode('IDLE');
        isAnimatingRef.current = false;
        prevBallData.current.clear();
        props.onClearFrames?.();
      },
    );
  }, [props.physicsFrames, ready]);

  // Transition from IDLE to LIVE when it's the player's turn
  useEffect(() => {
    if (!ready || renderMode.current === 'REPLAY') return;
    const rs = rsRef.current;
    if (!rs) return;
    if (isMyTurn) {
      renderMode.current = 'LIVE';
      rs.requestMode('LIVE');
    } else {
      renderMode.current = 'IDLE';
      rs.requestMode('IDLE');
    }
  }, [isMyTurn, ready]);

  const handleShoot = useRef(() => {
    const rs = rsRef.current;
    if (rs) rs.requestMode('LIVE');
    renderMode.current = 'LIVE';
    phaseTimerRef.current = 0;
    waitingForFramesRef.current = true;
    framesWaitTimerRef.current = 0;
    isAnimatingRef.current = true;
    onShoot(aimAngleRef.current, shotPowerRef.current, spinXRef.current, spinYRef.current);
  });

  function isAiming(isMyTurnVal: boolean, isAnimatingVal: boolean): boolean {
    return isMyTurnVal && !isAnimatingVal;
  }

  useImperativeHandle(ref, () => ({
    get spinX() { return spinXRef.current; },
    get spinY() { return spinYRef.current; },
    get shotPower() { return shotPowerRef.current; },
    get isAimLocked() { return !isMyTurnRef.current || isAnimatingRef.current; },
    get aimAngle() { return aimAngleRef.current; },
    setSpinX: (v: number) => { spinXRef.current = v; },
    setSpinY: (v: number) => { spinYRef.current = v; },
    setShotPower: (v: number) => { shotPowerRef.current = v; },
    setIsAimLocked: (v: boolean) => {},
    setIsPulling: (v: boolean) => { isPullingRef.current = v; },
    setAimAngle: (v: number | ((prev: number) => number)) => {
      aimAngleRef.current = typeof v === 'function' ? v(aimAngleRef.current) : v;
    },
    handleShoot: () => { handleShoot.current(); },
    hudNotification: null,
    triggerConfetti: (count: number) => {
      const scene = sceneRef.current;
      if (scene) scene.decorations.triggerConfetti(Math.min(count, 3) * 60, 0, 0);
    },
  }), []);

  const _ndc = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isMyTurnRef.current || isAnimatingRef.current || renderMode.current === 'REPLAY') return;
    const rs = rsRef.current;
    if (!rs) return;
    const camera = rs.getCamera();
    if (!camera) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    _ndc.set(x, y, 0.5);
    _ndc.unproject(camera);
    _dir.copy(_ndc).sub(camera.position).normalize();
    const t = (10 - camera.position.y) / _dir.y;
    const targetX = camera.position.x + _dir.x * t;
    const targetZ = camera.position.z + _dir.z * t;
    if (isFinite(targetX) && isFinite(targetZ)) {
      aimAngleRef.current = Math.atan2(targetZ, targetX);
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      onPointerMove={handlePointerMove}
      style={{ touchAction: 'none' }}
    />
  );
}

export default forwardRef(PoolTable3D);
