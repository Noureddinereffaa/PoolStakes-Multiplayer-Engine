import * as THREE from 'three';
import { RenderService } from '../RenderService';
import { SceneGroup } from '../types';

export interface ShotReplayTrailController {
  record(pos: THREE.Vector3, speed: number): void;
  update(): void;
  show(): void;
  hide(): void;
  reset(): void;
  dispose(): void;
}

const MAX_POINTS = 120;
const TRAIL_DURATION = 2.0;
const TRAIL_WIDTH = 0.8;

const _color = new THREE.Color();

export function createShotReplayTrail(rs: RenderService): ShotReplayTrailController {
  const group = rs.getSceneGroup(SceneGroup.Debug);
  if (!group) throw new Error('DebugGroup not found');

  const maxQuads = MAX_POINTS - 1;
  const vertexCount = maxQuads * 4;
  const indexCount = maxQuads * 6;

  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const alphas = new Float32Array(vertexCount);
  const indices: number[] = [];

  for (let i = 0; i < maxQuads; i++) {
    const base = i * 4;
    indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
  geo.setIndex(indices);
  geo.setDrawRange(0, 0);

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ShotTrail';
  mesh.visible = false;
  mesh.frustumCulled = false;

  group.add(mesh);

  const _points: { pos: THREE.Vector3; speed: number; time: number }[] = [];
  const _camRight = new THREE.Vector3();
  const _camDir = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();

  let visible = false;
  let camera: THREE.Camera | null = null;

  const controller: ShotReplayTrailController = {
    show: () => {
      mesh.visible = true;
      visible = true;
    },
    hide: () => {
      mesh.visible = false;
      visible = false;
    },
    reset: () => {
      _points.length = 0;
      mesh.visible = false;
      visible = false;
    },
    record: (pos: THREE.Vector3, speed: number) => {
      const now = performance.now() / 1000;
      _points.push({ pos: pos.clone(), speed, time: now });

      while (_points.length > MAX_POINTS) {
        _points.shift();
      }

      if (!camera) {
        camera = rs.getCamera();
      }
    },
    update: () => {
      if (!visible || _points.length < 2) {
        geo.setDrawRange(0, 0);
        return;
      }

      if (!camera) {
        camera = rs.getCamera();
      }
      if (!camera) return;

      camera.getWorldDirection(_camDir);
      _camRight.crossVectors(_camDir, _up).normalize();

      const now = performance.now() / 1000;
      const cutoff = now - TRAIL_DURATION;
      while (_points.length > 2 && _points[1].time < cutoff) {
        _points.shift();
      }

      const n = _points.length;
      const quads = n - 1;
      if (quads < 1) {
        geo.setDrawRange(0, 0);
        return;
      }

      const posAttr = geo.attributes.position as THREE.BufferAttribute;
      const colAttr = geo.attributes.color as THREE.BufferAttribute;
      const alpAttr = geo.attributes.alpha as THREE.BufferAttribute;
      const pArr = posAttr.array as Float32Array;
      const cArr = colAttr.array as Float32Array;
      const aArr = alpAttr.array as Float32Array;

      for (let i = 0; i < quads; i++) {
        const p0 = _points[i];
        const p1 = _points[i + 1];
        const age0 = (now - p0.time) / TRAIL_DURATION;
        const age1 = (now - p1.time) / TRAIL_DURATION;
        const alpha0 = Math.max(0, 1 - age0 * age0);
        const alpha1 = Math.max(0, 1 - age1 * age1);

        const w0 = Math.max(0.2, Math.min(TRAIL_WIDTH, p0.speed * 0.02));
        const w1 = Math.max(0.2, Math.min(TRAIL_WIDTH, p1.speed * 0.02));

        _color.setHSL(0.3 - age0 * 0.3, 1, 0.5);
        const cr0 = _color.r, cg0 = _color.g, cb0 = _color.b;
        _color.setHSL(0.3 - age1 * 0.3, 1, 0.5);
        const cr1 = _color.r, cg1 = _color.g, cb1 = _color.b;

        const base4 = i * 4 * 3;
        const baseA = i * 4;

        _a.copy(p0.pos).addScaledVector(_camRight, w0);
        _b.copy(p0.pos).addScaledVector(_camRight, -w0);
        pArr[base4] = _a.x;
        pArr[base4 + 1] = _a.y;
        pArr[base4 + 2] = _a.z;
        pArr[base4 + 3] = _b.x;
        pArr[base4 + 4] = _b.y;
        pArr[base4 + 5] = _b.z;

        _a.copy(p1.pos).addScaledVector(_camRight, w1);
        _b.copy(p1.pos).addScaledVector(_camRight, -w1);
        pArr[base4 + 6] = _a.x;
        pArr[base4 + 7] = _a.y;
        pArr[base4 + 8] = _a.z;
        pArr[base4 + 9] = _b.x;
        pArr[base4 + 10] = _b.y;
        pArr[base4 + 11] = _b.z;

        cArr[base4] = cr0; cArr[base4 + 1] = cg0; cArr[base4 + 2] = cb0;
        cArr[base4 + 3] = cr0; cArr[base4 + 4] = cg0; cArr[base4 + 5] = cb0;
        cArr[base4 + 6] = cr1; cArr[base4 + 7] = cg1; cArr[base4 + 8] = cb1;
        cArr[base4 + 9] = cr1; cArr[base4 + 10] = cg1; cArr[base4 + 11] = cb1;

        aArr[baseA] = alpha0;
        aArr[baseA + 1] = alpha0;
        aArr[baseA + 2] = alpha1;
        aArr[baseA + 3] = alpha1;
      }

      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      alpAttr.needsUpdate = true;
      geo.setDrawRange(0, quads * 6);
    },
    dispose: () => {
      group.remove(mesh);
      geo.dispose();
      mat.dispose();
    },
  };

  return controller;
}
