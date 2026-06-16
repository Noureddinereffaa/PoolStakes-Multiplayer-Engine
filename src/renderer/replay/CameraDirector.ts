import * as THREE from 'three';

export type RigId = 'OVERHEAD_WIDE' | 'CUE_FOLLOW' | 'IMPACT_DRAMATIC' | 'BALL_POV';

export interface MovingBallData {
  pos: THREE.Vector3;
  speed: number;
}

export interface DirectorInput {
  cueBallPos: THREE.Vector3;
  movingBalls: MovingBallData[];
  collisions: Array<{ position: THREE.Vector3; time: number }>;
  time: number;
}

export interface RigTarget {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  fov: number;
}

export interface CameraDirectorController {
  evaluate(input: DirectorInput): RigTarget;
  getCurrentRig(): RigId;
  forceRig(rig: RigId): void;
  dispose(): void;
}

class Spring3D {
  pos: THREE.Vector3;
  vel: THREE.Vector3 = new THREE.Vector3();
  omega: number;

  constructor(pos: THREE.Vector3, omega: number = 4) {
    this.pos = pos.clone();
    this.omega = omega;
  }

  update(target: THREE.Vector3, dt: number): THREE.Vector3 {
    const dx = new THREE.Vector3().copy(this.pos).sub(target);
    const accel = dx.multiplyScalar(-this.omega * this.omega).add(
      this.vel.clone().multiplyScalar(-2 * this.omega),
    );
    this.vel.add(accel.multiplyScalar(dt));
    this.pos.add(this.vel.clone().multiplyScalar(dt));
    return this.pos;
  }
}

class Spring1D {
  x: number;
  v: number = 0;
  omega: number;

  constructor(value: number, omega: number = 4) {
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

const _zero = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _behind = new THREE.Vector3();
const _origin = new THREE.Vector3(0, 0, 0);
const _orbitPos = new THREE.Vector3();

function computeOverheadWide(target: RigTarget): void {
  const theta = THREE.MathUtils.degToRad(90);
  const phi = THREE.MathUtils.degToRad(60);
  const r = 900;
  target.position.set(
    r * Math.cos(phi) * Math.cos(theta),
    r * Math.sin(phi),
    r * Math.cos(phi) * Math.sin(theta),
  );
  target.lookAt.set(0, 0, 0);
  target.fov = 40;
}

function computeCueFollow(target: RigTarget, cueBallPos: THREE.Vector3, orbitAngle: number): void {
  const dir = new THREE.Vector3().copy(cueBallPos).sub(_origin).normalize();
  if (dir.lengthSq() < 0.01) dir.set(0, 0, -1);
  _behind.copy(cueBallPos).add(dir.clone().multiplyScalar(-350));
  _behind.y = 180 + Math.sin(orbitAngle * 0.5) * 20;

  target.position.copy(_behind);
  target.lookAt.copy(cueBallPos);
  target.fov = 32;
}

function computeImpactDramatic(target: RigTarget, collisionPos: THREE.Vector3, orbitAngle: number): void {
  const angle = orbitAngle;
  const dist = 280;
  const height = 120 + Math.sin(angle * 2) * 30;
  _orbitPos.set(
    collisionPos.x + dist * Math.cos(angle),
    height,
    collisionPos.z + dist * Math.sin(angle),
  );
  target.position.copy(_orbitPos);
  target.lookAt.copy(collisionPos);
  target.fov = 26;
}

function computeBallPov(target: RigTarget, ball: MovingBallData): void {
  const vel = _dir.copy(ball.pos).sub(_zero);
  if (vel.lengthSq() < 0.01) vel.set(0, 0, -1);

  const aimDir = new THREE.Vector3().copy(ball.pos).sub(_origin).normalize();
  if (aimDir.lengthSq() > 0.01) {
    _dir.copy(aimDir);
  }

  _behind.copy(ball.pos).add(_dir.clone().multiplyScalar(-250));
  _behind.y = 80 + ball.pos.y + (ball.speed / 100) * 20;

  target.position.copy(_behind);
  target.lookAt.copy(ball.pos);
  target.fov = 35;
}

export function createCameraDirector(
  camera: THREE.PerspectiveCamera,
): CameraDirectorController {
  const posSpring = new Spring3D(camera.position.clone(), 4);
  const fovSpring = new Spring1D(camera.fov, 4);
  const lookAt = new THREE.Vector3(0, 0, 0);

  let currentRig: RigId = 'OVERHEAD_WIDE';
  let rigHoldTimer = 0;
  let impactHoldTimer = 0;
  let orbitTimer = 0;

  const _target: RigTarget = {
    position: new THREE.Vector3(0, 500, 700),
    lookAt: new THREE.Vector3(0, 0, 0),
    fov: 40,
  };
  const _rawTarget: RigTarget = {
    position: new THREE.Vector3(),
    lookAt: new THREE.Vector3(),
    fov: 40,
  };

  const evaluate = (input: DirectorInput): RigTarget => {
    rigHoldTimer += input.time;
    orbitTimer += input.time;

    const hasCueBall = input.movingBalls.some(
      (b) => b.pos.distanceToSquared(input.cueBallPos) < 100,
    );
    const fastestBall = input.movingBalls.reduce(
      (best, b) => (b.speed > best.speed ? b : best),
      input.movingBalls[0] || { pos: _zero, speed: 0 },
    );

    const lastCollision = input.collisions.length > 0
      ? input.collisions[input.collisions.length - 1]
      : null;

    const collisionRecent = lastCollision
      ? input.time - lastCollision.time < 0.6
      : false;

    let selectedRig: RigId;

    if (collisionRecent && impactHoldTimer < 2.0) {
      selectedRig = 'IMPACT_DRAMATIC';
      if (currentRig !== 'IMPACT_DRAMATIC') impactHoldTimer = 0;
      impactHoldTimer += input.time;
    } else if (input.movingBalls.length > 4) {
      selectedRig = 'OVERHEAD_WIDE';
    } else if (hasCueBall && input.movingBalls.length > 0) {
      selectedRig = 'CUE_FOLLOW';
    } else if (input.movingBalls.length > 0) {
      selectedRig = 'BALL_POV';
    } else {
      selectedRig = 'OVERHEAD_WIDE';
    }

    if (selectedRig !== currentRig) {
      currentRig = selectedRig;
      rigHoldTimer = 0;
    }

    switch (currentRig) {
      case 'OVERHEAD_WIDE':
        computeOverheadWide(_rawTarget);
        break;
      case 'CUE_FOLLOW':
        computeCueFollow(_rawTarget, input.cueBallPos, orbitTimer);
        break;
      case 'IMPACT_DRAMATIC': {
        const colPos = lastCollision ? lastCollision.position : input.cueBallPos;
        computeImpactDramatic(_rawTarget, colPos, orbitTimer);
        break;
      }
      case 'BALL_POV':
        computeBallPov(_rawTarget, fastestBall);
        break;
    }

    const dt = input.time;
    posSpring.update(_rawTarget.position, dt);
    fovSpring.update(_rawTarget.fov, dt);

    _target.position.copy(posSpring.pos);
    _target.fov = fovSpring.x;

    _target.lookAt.lerp(_rawTarget.lookAt, Math.min(1, dt * 3));

    return _target;
  };

  return {
    evaluate,
    getCurrentRig: () => currentRig,
    forceRig: (rig: RigId) => {
      currentRig = rig;
      rigHoldTimer = 0;
    },
    dispose: () => {
      // No GPU resources to release — springs are pure math.
    },
  };
}
