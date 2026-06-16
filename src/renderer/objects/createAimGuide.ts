import * as THREE from 'three';
import { RenderService } from '../RenderService';
import { SceneGroup } from '../types';

export interface AimGuideController {
  update(
    cueBallPos: THREE.Vector3,
    aimAngle: number,
    balls: Array<{ id: number; x: number; y: number; isPocketed: boolean }>,
    dt: number,
  ): void;
  show(): void;
  hide(): void;
  dispose(): void;
}

const SEGMENT_MAX = 3;
const BALL_R = 10;
const MIN_X = -370;
const MAX_X = 370;
const MIN_Z = -170;
const MAX_Z = 170;

const _pos = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _hit1 = new THREE.Vector3();
const _hit2 = new THREE.Vector3();
const _reflected = new THREE.Vector3();

function quadraticCollision(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  center: THREE.Vector3,
  r2: number,
): number {
  const dx = origin.x - center.x;
  const dz = origin.z - center.z;
  const a = dir.x * dir.x + dir.z * dir.z;
  const b = 2 * (dx * dir.x + dz * dir.z);
  const c = dx * dx + dz * dz - r2;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sqrtD = Math.sqrt(disc);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);
  if (t1 > 0.01) return t1;
  if (t2 > 0.01) return t2;
  return -1;
}

function cushionCollisionT(
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
  if (bestT < Infinity) return { t: bestT, normal: bestNorm };
  return null;
}

export function createAimGuide(rs: RenderService): AimGuideController {
  const group = rs.getSceneGroup(SceneGroup.Debug);
  if (!group) throw new Error('DebugGroup not found');

  const positions = new Float32Array(SEGMENT_MAX * 2 * 3);
  const colors = new Float32Array(SEGMENT_MAX * 2 * 3);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setDrawRange(0, 0);

  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  const line = new THREE.Line(geo, mat);
  line.name = 'AimGuide';
  line.visible = false;

  const dotMat = new THREE.MeshBasicMaterial({
    color: 0x4488FF,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  const dotGeo = new THREE.SphereGeometry(0.5, 8, 8);
  const hitDot = new THREE.Mesh(dotGeo, dotMat);
  hitDot.name = 'HitDot';
  hitDot.visible = false;

  group.add(line);
  group.add(hitDot);

  let visible = false;

  const controller: AimGuideController = {
    show: () => {
      line.visible = true;
      hitDot.visible = true;
      visible = true;
    },
    hide: () => {
      line.visible = false;
      hitDot.visible = false;
      visible = false;
    },
    update: (
      cueBallPos: THREE.Vector3,
      aimAngle: number,
    balls: Array<{ id: number; x: number; y: number; isPocketed: boolean }>,
      _dt: number,
    ) => {
      if (!visible) return;

      const dirX = Math.cos(aimAngle);
      const dirZ = -Math.sin(aimAngle);
      _dir.set(dirX, 0, dirZ).normalize();

      const ballCenters = balls
        .filter((b) => b.id !== 0 && !b.isPocketed)
        .map((b) => new THREE.Vector3(b.x - 400, BALL_R, b.y - 200));

      let bestT = 5000;
      let hitType: 'ball' | 'cushion' | null = null;
      let hitBallCenter: THREE.Vector3 | null = null;
      let cushionNormal: THREE.Vector3 | null = null;

      for (const center of ballCenters) {
        const t = quadraticCollision(cueBallPos, _dir, center, (BALL_R * 2) ** 2);
        if (t > 0 && t < bestT) {
          bestT = t;
          hitType = 'ball';
          hitBallCenter = center;
        }
      }

      const cushionHit = cushionCollisionT(cueBallPos, _dir);
      if (cushionHit && cushionHit.t < bestT) {
        bestT = cushionHit.t;
        hitType = 'cushion';
        hitBallCenter = null;
        cushionNormal = cushionHit.normal;
      }

      _hit1.copy(cueBallPos).addScaledVector(_dir, bestT);

      const posAttr = geo.attributes.position as THREE.BufferAttribute;
      const colAttr = geo.attributes.color as THREE.BufferAttribute;
      const pArray = posAttr.array as Float32Array;
      const cArray = colAttr.array as Float32Array;

      let vertCount = 0;

      const addSeg = (from: THREE.Vector3, to: THREE.Vector3) => {
        const idx = vertCount * 3;
        pArray[idx] = from.x;
        pArray[idx + 1] = from.y;
        pArray[idx + 2] = from.z;
        pArray[idx + 3] = to.x;
        pArray[idx + 4] = to.y;
        pArray[idx + 5] = to.z;

        const tSeg = vertCount / 2;
        const fade = Math.min(1, tSeg * 0.6);
        const wr = 1 - fade * 0.4;
        const wg = 1 - fade * 0.5;
        const wb = 1 - fade * 0.8;
        const wr2 = 1 - (fade + 0.1) * 0.4;
        const wg2 = 1 - (fade + 0.1) * 0.5;
        const wb2 = 1 - (fade + 0.1) * 0.8;

        const ci = vertCount * 6;
        cArray[ci] = wr; cArray[ci + 1] = wg; cArray[ci + 2] = wb;
        cArray[ci + 3] = Math.max(0.05, wr2); cArray[ci + 4] = Math.max(0.05, wg2); cArray[ci + 5] = Math.max(0.05, wb2);
        vertCount += 2;
      };

      addSeg(cueBallPos, _hit1);

      if (hitType === 'cushion' && cushionNormal) {
        _reflected.copy(_dir).reflect(cushionNormal).normalize();
        const bounceT = 300;
        _hit2.copy(_hit1).addScaledVector(_reflected, bounceT);
        _hit2.x = Math.max(MIN_X - 10, Math.min(MAX_X + 10, _hit2.x));
        _hit2.z = Math.max(MIN_Z - 10, Math.min(MAX_Z + 10, _hit2.z));
        addSeg(_hit1, _hit2);
      } else if (hitType === 'ball' && hitBallCenter) {
        _reflected.copy(_dir).reflect(new THREE.Vector3().copy(_hit1).sub(hitBallCenter).normalize()).normalize();
        const bounceT = 200;
        _hit2.copy(_hit1).addScaledVector(_reflected, bounceT);
        _hit2.x = Math.max(MIN_X - 10, Math.min(MAX_X + 10, _hit2.x));
        _hit2.z = Math.max(MIN_Z - 10, Math.min(MAX_Z + 10, _hit2.z));
        addSeg(_hit1, _hit2);
      }

      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      geo.setDrawRange(0, vertCount);

      hitDot.position.copy(_hit1);
    },
    dispose: () => {
      group.remove(line);
      group.remove(hitDot);
      geo.dispose();
      mat.dispose();
      dotGeo.dispose();
      dotMat.dispose();
    },
  };

  return controller;
}
