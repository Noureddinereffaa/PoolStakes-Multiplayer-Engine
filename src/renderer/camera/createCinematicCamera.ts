import * as THREE from 'three';

export enum CameraState {
  BROADCAST_IDLE,
  AIM_FOCUS,
  SHOT_CHARGE,
  BALL_TRACKING,
  IMPACT_REACTION,
  BALL_SETTLE,
}

export interface CollisionEvent {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  time: number;
}

export interface CameraInput {
  aimAngle: number;
  cueBallPos: THREE.Vector3;
  movingBalls: THREE.Vector3[];
  shotPower: number;
  isPulling: boolean;
  isAiming: boolean;
  collisions: CollisionEvent[];
  /** Monotonic elapsed time (seconds) — used for frame-rate-independent noise */
  elapsed: number;
}

export interface CinematicCameraController {
  update(dt: number, input: CameraInput): void;
  forceState(state: CameraState): void;
  getState(): CameraState;
  dispose(): void;
}

const _up = new THREE.Vector3(0, 1, 0);

class Spring1D {
  x: number;
  v: number = 0;
  omega: number;

  constructor(value: number, omega: number = 6) {
    this.x = value;
    this.omega = omega;
  }

  update(target: number, dt: number): number {
    const dx = this.x - target;
    const w2 = this.omega * this.omega;
    const accel = -w2 * dx - 2 * this.omega * this.v;
    this.v += accel * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

class Spring3D {
  pos: THREE.Vector3;
  vel: THREE.Vector3 = new THREE.Vector3();
  omega: number;

  constructor(pos: THREE.Vector3, omega: number = 6) {
    this.pos = pos.clone();
    this.omega = omega;
  }

  update(target: THREE.Vector3, dt: number): THREE.Vector3 {
    const dx = new THREE.Vector3().copy(this.pos).sub(target);
    const w2 = this.omega * this.omega;
    const accel = dx.multiplyScalar(-w2).add(this.vel.clone().multiplyScalar(-2 * this.omega));
    this.vel.add(accel.multiplyScalar(dt));
    this.pos.add(this.vel.clone().multiplyScalar(dt));
    return this.pos;
  }
}

let _orbitNoise = 0;
let _noiseOffset = 0;

function hash(x: number): number {
  const f = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return f - Math.floor(f);
}

function smoothNoise(t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

export function createCinematicCamera(
  camera: THREE.PerspectiveCamera,
): CinematicCameraController {
  const _broadcastTarget = new THREE.Vector3(0, 0, 0);
  const _aimFocusTarget = new THREE.Vector3(0, 0, 0);
  const _trackTarget = new THREE.Vector3(0, 0, 0);

  const _camOffset = new THREE.Vector3(0, 400, 700);
  const _lookTarget = new THREE.Vector3(0, 0, 0);
  const _springLookTarget = new THREE.Vector3(0, 0, 0);

  const posSpring = new Spring3D(_camOffset, 5);
  const fovSpring = new Spring1D(32, 6);
  const lookSpring = new Spring3D(new THREE.Vector3(0, 0, 0), 4);

  let state: CameraState = CameraState.BROADCAST_IDLE;
  let stateTimer = 0;
  let punchActive = false;
  let punchPos = new THREE.Vector3();
  let punchTime = 0;
  let punchFov = 0;

  const _ballPos = new THREE.Vector3();
  const _prevBallPositions = new Map<number, THREE.Vector3>();
  const _collisionCooldown: number[] = [];

  const controller: CinematicCameraController = {
    getState: () => state,

    forceState: (s: CameraState) => {
      state = s;
      stateTimer = 0;
    },

    update: (dt: number, input: CameraInput) => {
      stateTimer += dt;

      const cameraPos = camera.position;
      _noiseOffset += dt * 0.15;

      _orbitNoise = (smoothNoise(_noiseOffset) - 0.5) * 0.4 +
                     (smoothNoise(_noiseOffset * 0.3) - 0.5) * 0.6;

      let targetPos = _camOffset.clone();
      let targetFov = 32;

      switch (state) {
        case CameraState.BROADCAST_IDLE: {
          const theta = Math.PI / 2 + _orbitNoise * 0.15;
          const phi = THREE.MathUtils.degToRad(28 + _orbitNoise * 2);
          const r = 780 + _orbitNoise * 20;

          targetPos.set(
            r * Math.cos(phi) * Math.cos(theta),
            r * Math.sin(phi),
            r * Math.cos(phi) * Math.sin(theta),
          );
          _lookTarget.copy(_broadcastTarget);
          targetFov = 32;
          break;
        }

        case CameraState.AIM_FOCUS:
        case CameraState.SHOT_CHARGE: {
          const aimDirX = Math.cos(input.aimAngle);
          const aimDirZ = -Math.sin(input.aimAngle);
          const behind = new THREE.Vector3(-aimDirX * 300, 0, -aimDirZ * 300);

          _aimFocusTarget.copy(input.cueBallPos).add(behind);
          _aimFocusTarget.y = 0;

          const midpoint = new THREE.Vector3()
            .copy(input.cueBallPos)
            .lerp(_aimFocusTarget, 0.5);

          const r = state === CameraState.SHOT_CHARGE ? 450 : 500;
          const phi = THREE.MathUtils.degToRad(state === CameraState.SHOT_CHARGE ? 32 : 30);
          const theta = input.aimAngle + Math.PI / 2;

          targetPos.set(
            midpoint.x + r * Math.cos(phi) * Math.cos(theta),
            r * Math.sin(phi),
            midpoint.z + r * Math.cos(phi) * Math.sin(theta),
          );
          _lookTarget.copy(input.cueBallPos);

          targetFov = state === CameraState.SHOT_CHARGE
            ? 28 - (input.shotPower / 100) * 3
            : 30;
          break;
        }

        case CameraState.BALL_TRACKING: {
          if (input.movingBalls.length > 0) {
            _trackTarget.set(0, 0, 0);
            for (const p of input.movingBalls) {
              _trackTarget.add(p);
            }
            _trackTarget.divideScalar(input.movingBalls.length);
            _trackTarget.y = 0;
          }

          const theta = Math.PI / 2 + _orbitNoise * 0.05;
          const phi = THREE.MathUtils.degToRad(30);
          const r = 700;

          targetPos.set(
            _trackTarget.x + r * Math.cos(phi) * Math.cos(theta),
            r * Math.sin(phi),
            _trackTarget.z + r * Math.cos(phi) * Math.sin(theta),
          );
          _lookTarget.copy(_trackTarget);
          targetFov = 32;
          break;
        }

        case CameraState.IMPACT_REACTION: {
          const decay = Math.max(0, 1 - stateTimer / 0.2);
          const offset = punchPos.clone().multiplyScalar(decay * 0.8);
          targetPos.copy(cameraPos).add(offset);
          _lookTarget.set(0, 0, 0);
          targetFov = 32 + punchFov * decay;
          if (stateTimer > 0.2) {
            state = input.movingBalls.length > 0
              ? CameraState.BALL_TRACKING
              : CameraState.BALL_SETTLE;
            stateTimer = 0;
          }
          break;
        }

        case CameraState.BALL_SETTLE: {
          const theta = Math.PI / 2 + _orbitNoise * 0.15;
          const phi = THREE.MathUtils.degToRad(28);
          const r = 780;

          targetPos.set(
            r * Math.cos(phi) * Math.cos(theta),
            r * Math.sin(phi),
            r * Math.cos(phi) * Math.sin(theta),
          );
          _lookTarget.copy(_broadcastTarget);
          targetFov = 32;

          const dist = cameraPos.distanceTo(targetPos);
          if (dist < 10 && Math.abs(camera.fov - targetFov) < 1) {
            state = CameraState.BROADCAST_IDLE;
            stateTimer = 0;
          }
          break;
        }
      }

      posSpring.update(targetPos, dt);
      cameraPos.copy(posSpring.pos);

      fovSpring.update(targetFov, dt);
      camera.fov = fovSpring.x;
      camera.updateProjectionMatrix();

      camera.lookAt(_lookTarget);

      currentExposure += (exposureTarget - currentExposure) * Math.min(1, dt * 3);
    },

    dispose: () => {},
  };

  return controller;
}
