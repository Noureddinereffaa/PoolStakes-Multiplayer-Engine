import * as THREE from 'three';
import { RenderService } from '../RenderService';
import { SceneGroup } from '../types';
import { BallSystemController } from './createBalls';
import { SPIN } from './mapSpinToVisuals';

export interface GhostSimController {
  update(
    aimAngle: number,
    cueBallPos: THREE.Vector3,
    balls: Array<{ id: number; x: number; y: number; isPocketed: boolean }>,
  ): GhostResult;
  updateWithSpin(
    aimAngle: number,
    spinX: number,
    spinY: number,
    cueBallPos: THREE.Vector3,
    balls: Array<{ id: number; x: number; y: number; isPocketed: boolean }>,
    dt?: number,
  ): { result: GhostResult; path: THREE.Vector3[] };
  show(): void;
  hide(): void;
  dispose(): void;
  getGhostPosition(): THREE.Vector3;
}

export interface GhostResult {
  hitType: 'ball' | 'cushion' | 'none';
  hitPoint: THREE.Vector3;
  hitBallId: number | null;
  bouncePoint: THREE.Vector3 | null;
  bounceDirection: THREE.Vector3 | null;
}

const BALL_R = 10;
const MIN_X = -370;
const MAX_X = 370;
const MIN_Z = -170;
const MAX_Z = 170;
const MAX_RAYCAST = 1500;
const CURVE_STEPS = 30;

const _dir = new THREE.Vector3();
const _ballCenter = new THREE.Vector3();

function quadraticCollision(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  center: THREE.Vector3,
  radius2: number,
): number {
  const dx = origin.x - center.x;
  const dz = origin.z - center.z;
  const a = dir.x * dir.x + dir.z * dir.z;
  if (a < 1e-10) return -1;
  const b = 2 * (dx * dir.x + dz * dir.z);
  const c = dx * dx + dz * dz - radius2;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sqrtD = Math.sqrt(disc);
  const t1 = (-b - sqrtD) / (2 * a);
  if (t1 > 0.01) return t1;
  const t2 = (-b + sqrtD) / (2 * a);
  if (t2 > 0.01) return t2;
  return -1;
}

function cushionCollision(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
): { t: number; normal: THREE.Vector3 } | null {
  let bestT = Infinity;
  let bestNorm = new THREE.Vector3();

  const checks: { axis: 'x' | 'z'; value: number; normal: THREE.Vector3 }[] = [
    { axis: 'x', value: MIN_X, normal: new THREE.Vector3(-1, 0, 0) },
    { axis: 'x', value: MAX_X, normal: new THREE.Vector3(1, 0, 0) },
    { axis: 'z', value: MIN_Z, normal: new THREE.Vector3(0, 0, -1) },
    { axis: 'z', value: MAX_Z, normal: new THREE.Vector3(0, 0, 1) },
  ];

  for (const c of checks) {
    const d = c.axis === 'x' ? dir.x : dir.z;
    if (Math.abs(d) < 1e-8) continue;
    const t = (c.value - (c.axis === 'x' ? origin.x : origin.z)) / d;
    if (t <= 0.01) continue;
    const px = origin.x + dir.x * t;
    const pz = origin.z + dir.z * t;
    if (px < MIN_X - 0.1 || px > MAX_X + 0.1) continue;
    if (pz < MIN_Z - 0.1 || pz > MAX_Z + 0.1) continue;
    if (t < bestT) {
      bestT = t;
      bestNorm = c.normal;
    }
  }

  if (bestT < Infinity && bestT < MAX_RAYCAST) return { t: bestT, normal: bestNorm };
  return null;
}

function stepSpinPath(
  pos: THREE.Vector3,
  vel: THREE.Vector3,
  spinX: number,
  spinY: number,
  dt: number,
): void {
  const speed = vel.length();
  if (speed < 0.01) return;
  const ux = vel.x / speed;
  const uz = vel.z / speed;
  const px = -uz;
  const pz = ux;

  vel.x += px * spinX * SPIN.CURVE_FACTOR * dt;
  vel.z += pz * spinX * SPIN.CURVE_FACTOR * dt;
  vel.x += ux * spinY * SPIN.LONG_FACTOR * dt;
  vel.z += uz * spinY * SPIN.LONG_FACTOR * dt;

  if (Math.abs(spinX) > SPIN.SWERVE_THRESHOLD) {
    const swerveMag = SPIN.SWERVE_FACTOR * (Math.abs(spinX) - SPIN.SWERVE_THRESHOLD) * Math.sign(spinX);
    vel.x += px * swerveMag * dt;
    vel.z += pz * swerveMag * dt;
  }

  pos.x += vel.x * dt;
  pos.z += vel.z * dt;
  pos.y = BALL_R;
}

export function createGhostSimulation(
  rs: RenderService,
  balls: BallSystemController,
): GhostSimController {
  const group = rs.getSceneGroup(SceneGroup.Balls);
  if (!group) throw new Error('BallGroup not found');

  const ghostMat = new THREE.MeshPhysicalMaterial({
    color: 0x88DDFF,
    emissive: 0x44AADD,
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.25,
    roughness: 0.1,
    metalness: 0,
    clearcoat: 0.8,
    clearcoatRoughness: 0.1,
    depthWrite: false,
  });
  const ghostGeo = new THREE.SphereGeometry(BALL_R * 1.02, 24, 24);
  const ghostMesh = new THREE.Mesh(ghostGeo, ghostMat);
  ghostMesh.name = 'AimGhostBall';
  ghostMesh.visible = false;
  ghostMesh.position.set(0, BALL_R, 0);
  group.add(ghostMesh);

  let visible = false;

  const _pathPoints: THREE.Vector3[] = [];
  const _ballPos = new THREE.Vector3();

  const controller: GhostSimController = {
    getGhostPosition: () => ghostMesh.position,
    show: () => {
      ghostMesh.visible = true;
      visible = true;
    },
    hide: () => {
      ghostMesh.visible = false;
      visible = false;
    },
    update: (
      aimAngle: number,
      cueBallPos: THREE.Vector3,
      ballList: Array<{ id: number; x: number; y: number; isPocketed: boolean }>,
    ): GhostResult => {
      const dirX = Math.cos(aimAngle);
      const dirZ = -Math.sin(aimAngle);
      _dir.set(dirX, 0, dirZ).normalize();

      let bestT = MAX_RAYCAST;
      let hitType: 'ball' | 'cushion' | 'none' = 'none';
      let hitBallId: number | null = null;
      let hitBallCenter: THREE.Vector3 | null = null;
      let cushionNormal: THREE.Vector3 | null = null;

      for (const b of ballList) {
        if (b.id === 0 || b.isPocketed) continue;
        _ballPos.set(b.x - 400, BALL_R, b.y - 200);
        const t = quadraticCollision(cueBallPos, _dir, _ballPos, (BALL_R * 2) ** 2);
        if (t > 0 && t < bestT) {
          bestT = t;
          hitType = 'ball';
          hitBallId = b.id;
          hitBallCenter = _ballPos.clone();
        }
      }

      const cushionHit = cushionCollision(cueBallPos, _dir);
      if (cushionHit && cushionHit.t < bestT) {
        bestT = cushionHit.t;
        hitType = 'cushion';
        hitBallId = null;
        hitBallCenter = null;
        cushionNormal = cushionHit.normal;
      }

      const hitPoint = new THREE.Vector3()
        .copy(cueBallPos)
        .addScaledVector(_dir, bestT);
      hitPoint.y = BALL_R;

      let bouncePoint: THREE.Vector3 | null = null;
      let bounceDirection: THREE.Vector3 | null = null;

      if (hitType === 'cushion' && cushionNormal) {
        bounceDirection = _dir.clone().reflect(cushionNormal).normalize();
        const bounceT = 300;
        bouncePoint = hitPoint.clone().addScaledVector(bounceDirection, bounceT);
        bouncePoint.x = Math.max(MIN_X - 10, Math.min(MAX_X + 10, bouncePoint.x));
        bouncePoint.z = Math.max(MIN_Z - 10, Math.min(MAX_Z + 10, bouncePoint.z));
        bouncePoint.y = BALL_R;
      } else if (hitType === 'ball' && hitBallCenter) {
        const toBall = new THREE.Vector3().copy(hitBallCenter).sub(hitPoint).normalize();
        bounceDirection = _dir.clone().reflect(toBall).normalize();
        const bounceT = 200;
        bouncePoint = hitPoint.clone().addScaledVector(bounceDirection, bounceT);
        bouncePoint.x = Math.max(MIN_X - 10, Math.min(MAX_X + 10, bouncePoint.x));
        bouncePoint.z = Math.max(MIN_Z - 10, Math.min(MAX_Z + 10, bouncePoint.z));
        bouncePoint.y = BALL_R;
      }

      if (visible && hitType !== 'none') {
        ghostMesh.position.copy(hitPoint);
      }

      return { hitType, hitPoint, hitBallId, bouncePoint, bounceDirection };
    },
    updateWithSpin: (
      aimAngle: number,
      spinX: number,
      spinY: number,
      cueBallPos: THREE.Vector3,
      ballList: Array<{ id: number; x: number; y: number; isPocketed: boolean }>,
      dt: number = 0.02,
    ): { result: GhostResult; path: THREE.Vector3[] } => {
      const dirX = Math.cos(aimAngle);
      const dirZ = -Math.sin(aimAngle);
      _dir.set(dirX, 0, dirZ).normalize();

      const baseSpeed = 600;
      const vel = new THREE.Vector3(_dir.x * baseSpeed, 0, _dir.z * baseSpeed);
      const pos = cueBallPos.clone();
      pos.y = BALL_R;

      _pathPoints.length = 0;
      _pathPoints.push(pos.clone());

      const noSpin = Math.abs(spinX) < 0.01 && Math.abs(spinY) < 0.01;
      if (noSpin) {
        return {
          result: controller.update(aimAngle, cueBallPos, ballList),
          path: _pathPoints,
        };
      }

      let hitType: 'ball' | 'cushion' | 'none' = 'none';
      let hitBallId: number | null = null;
      let hitBallCenter: THREE.Vector3 | null = null;
      let cushionNormal: THREE.Vector3 | null = null;
      let finalPos = pos.clone();
      let finalHitT = MAX_RAYCAST;

      for (let step = 0; step < CURVE_STEPS; step++) {
        stepSpinPath(pos, vel, spinX, spinY, dt);

        let minT = Infinity;
        let localHitType: 'ball' | 'cushion' | 'none' = 'none';
        let localBallId: number | null = null;
        let localBallCenter: THREE.Vector3 | null = null;
        let localCushionNormal: THREE.Vector3 | null = null;

        for (const b of ballList) {
          if (b.id === 0 || b.isPocketed) continue;
          _ballCenter.set(b.x - 400, BALL_R, b.y - 200);
          const t = quadraticCollision(finalPos, _dir, _ballCenter, (BALL_R * 2) ** 2);
          if (t > 0 && t < minT) {
            minT = t;
            localHitType = 'ball';
            localBallId = b.id;
            localBallCenter = _ballCenter.clone();
          }
        }

        const stepDir = vel.clone().normalize();
        const cushionHit = cushionCollision(pos, stepDir);
        if (cushionHit && cushionHit.t < minT) {
          minT = cushionHit.t;
          localHitType = 'cushion';
          localBallId = null;
          localBallCenter = null;
          localCushionNormal = cushionHit.normal;
        }

        if (localHitType !== 'none' && minT < finalHitT) {
          const t = Math.min(minT, MAX_RAYCAST);
          finalPos.copy(pos).addScaledVector(stepDir, t);
          finalPos.y = BALL_R;
          finalHitT = t;
          hitType = localHitType;
          hitBallId = localBallId;
          hitBallCenter = localBallCenter;
          cushionNormal = localCushionNormal;
          break;
        }

        finalPos.copy(pos);
        _pathPoints.push(finalPos.clone());

        if (pos.x < MIN_X || pos.x > MAX_X || pos.z < MIN_Z || pos.z > MAX_Z) {
          hitType = 'cushion';
          break;
        }
      }

      const hitPoint = finalPos.clone();
      let bouncePoint: THREE.Vector3 | null = null;
      let bounceDirection: THREE.Vector3 | null = null;

      if (hitType === 'cushion' && cushionNormal) {
        const bounceDir = new THREE.Vector3().copy(vel).normalize().reflect(cushionNormal).normalize();
        bounceDirection = bounceDir;
        bouncePoint = hitPoint.clone().addScaledVector(bounceDir, 200);
        bouncePoint.x = Math.max(MIN_X - 10, Math.min(MAX_X + 10, bouncePoint.x));
        bouncePoint.z = Math.max(MIN_Z - 10, Math.min(MAX_Z + 10, bouncePoint.z));
        bouncePoint.y = BALL_R;
      } else if (hitType === 'ball' && hitBallCenter) {
        const toBall = new THREE.Vector3().copy(hitBallCenter).sub(hitPoint).normalize();
        bounceDirection = new THREE.Vector3().copy(vel).normalize().reflect(toBall).normalize();
        bouncePoint = hitPoint.clone().addScaledVector(bounceDirection, 200);
        bouncePoint.x = Math.max(MIN_X - 10, Math.min(MAX_X + 10, bouncePoint.x));
        bouncePoint.z = Math.max(MIN_Z - 10, Math.min(MAX_Z + 10, bouncePoint.z));
        bouncePoint.y = BALL_R;
      }

      if (visible && hitType !== 'none') {
        ghostMesh.position.copy(hitPoint);
      } else if (visible) {
        ghostMesh.position.copy(finalPos);
      }

      const result: GhostResult = { hitType, hitPoint, hitBallId, bouncePoint, bounceDirection };
      return { result, path: _pathPoints };
    },
    dispose: () => {
      group.remove(ghostMesh);
      ghostGeo.dispose();
      ghostMat.dispose();
    },
  };

  return controller;
}
