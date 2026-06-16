import * as THREE from 'three';
import { RenderService } from '../RenderService';
import { SceneGroup } from '../types';

// ── Table dimensions (mirrored from server physics.ts) ──────────

const TABLE_W = 800;
const TABLE_H = 400;
const CUSHION = 20;
const FRAME_EXTRA = 30;
const POCKET_RADII = [24, 23, 24, 24, 23, 24];
const POCKET_POS = [
  { x: 24, y: 24 },
  { x: 400, y: 22 },
  { x: 776, y: 24 },
  { x: 24, y: 376 },
  { x: 400, y: 378 },
  { x: 776, y: 376 },
];

// Physics top-left origin → Three.js center origin (XZ plane, Y up)
const CX = TABLE_W / 2;
const CY = TABLE_H / 2;
const HALF_W = CX;
const HALF_H = CY;

function px(physicsX: number): number {
  return physicsX - CX;
}
function pz(physicsY: number): number {
  return physicsY - CY;
}

// ── Materials ───────────────────────────────────────────────────

const feltMat = new THREE.MeshPhysicalMaterial({
  color: 0x0e6b0e,
  roughness: 0.85,
  metalness: 0,
  clearcoat: 0,
});

const cushionMat = new THREE.MeshPhysicalMaterial({
  color: 0x1a8a1a,
  roughness: 0.80,
  metalness: 0,
  clearcoat: 0,
});

const frameMat = new THREE.MeshPhysicalMaterial({
  color: 0x5c3a1e,
  roughness: 0.90,
  metalness: 0,
  clearcoat: 0,
});

const pocketMat = new THREE.MeshPhysicalMaterial({
  color: 0x000000,
  roughness: 1.0,
  metalness: 0,
  side: THREE.DoubleSide,
});

const collarMat = new THREE.MeshPhysicalMaterial({
  color: 0x2a1a0a,
  roughness: 0.9,
  metalness: 0,
});

// ── Cushion shape (ring with 6 pocket holes) ────────────────────

function buildCushionShape(): THREE.Shape {
  // The cushion ring sits at the table edge.  Outer boundary extends
  // FRAME_EXTRA past the felt; inner boundary is CUSHION inside the felt.
  // Shape coordinates: X = Three.js X, Y = Three.js Z (horizontal plane).

  const outer = new THREE.Shape();
  const oX = HALF_W + FRAME_EXTRA;
  const oZ = HALF_H + FRAME_EXTRA;
  outer.moveTo(-oX, -oZ);
  outer.lineTo(oX, -oZ);
  outer.lineTo(oX, oZ);
  outer.lineTo(-oX, oZ);
  outer.lineTo(-oX, -oZ);

  const inner = new THREE.Path();
  const iX = HALF_W - CUSHION;
  const iZ = HALF_H - CUSHION;
  inner.moveTo(-iX, -iZ);
  inner.lineTo(iX, -iZ);
  inner.lineTo(iX, iZ);
  inner.lineTo(-iX, iZ);
  inner.lineTo(-iX, -iZ);
  outer.holes.push(inner);

  for (let i = 0; i < 6; i++) {
    const cx = px(POCKET_POS[i].x);
    const cz = pz(POCKET_POS[i].y);
    const r = POCKET_RADII[i];
    const hole = new THREE.Path();
    const SEG = 32;
    for (let j = 0; j <= SEG; j++) {
      const theta = (j / SEG) * Math.PI * 2;
      const hx = cx + r * Math.cos(theta);
      const hz = cz + r * Math.sin(theta);
      if (j === 0) hole.moveTo(hx, hz);
      else hole.lineTo(hx, hz);
    }
    outer.holes.push(hole);
  }

  return outer;
}

// ── Disposal ────────────────────────────────────────────────────

const _uniqueGeo = new Set<THREE.BufferGeometry>();
const _uniqueMat = new Set<THREE.Material>();

function collectResources(obj: THREE.Object3D): void {
  const mesh = obj as THREE.Mesh;
  if (mesh.isMesh) {
    if (mesh.geometry) _uniqueGeo.add(mesh.geometry);
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(m => _uniqueMat.add(m));
    } else if (mesh.material) {
      _uniqueMat.add(mesh.material);
    }
  }
  for (const child of obj.children) collectResources(child);
}

export function disposeTable(rs: RenderService): void {
  const group = rs.getSceneGroup(SceneGroup.Table);
  if (!group) return;
  _uniqueGeo.clear();
  _uniqueMat.clear();
  collectResources(group);
  _uniqueGeo.forEach(g => g.dispose());
  _uniqueMat.forEach(m => m.dispose());
  group.clear();
}

// ── Public builder ──────────────────────────────────────────────

export function buildTable(rs: RenderService): void {
  const group = rs.getSceneGroup(SceneGroup.Table);
  if (!group) return;

  // ── 1. Wood frame (below the felt) ─────────────────────────
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE_W + FRAME_EXTRA * 2, 8, TABLE_H + FRAME_EXTRA * 2),
    frameMat,
  );
  frame.position.set(0, -6, 0); // y: -10 to -2
  frame.name = 'TableFrame';
  group.add(frame);

  // ── 2. Felt (playing surface, top at y=0) ──────────────────
  const felt = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE_W, 2, TABLE_H),
    feltMat,
  );
  felt.position.set(0, -1, 0); // y: -2 to 0
  felt.name = 'Felt';
  group.add(felt);

  // ── 3. Cushion ring (raised, with pocket holes) ────────────
  const cushionShape = buildCushionShape();
  const cushionGeo = new THREE.ExtrudeGeometry(cushionShape, {
    depth: 4,
    bevelEnabled: false,
  });
  // Rotate so extrusion (original Z) becomes world Y (upward)
  cushionGeo.rotateX(Math.PI / 2);
  // After rotation: y ranges from -depth (top) to 0 (base).
  // Translate so base is at y=0 (sits on felt surface).
  cushionGeo.translate(0, 4, 0);
  // Now extends from y=0 (base) to y=4 (top).
  cushionGeo.computeVertexNormals();

  const cushion = new THREE.Mesh(cushionGeo, cushionMat);
  cushion.position.set(0, 0, 0);
  cushion.name = 'Cushion';
  group.add(cushion);

  // ── 4. Pocket tubes (black, visible through cushion holes) ─
  for (let i = 0; i < 6; i++) {
    const cx = px(POCKET_POS[i].x);
    const cz = pz(POCKET_POS[i].y);
    const r = POCKET_RADII[i];

    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r * 1.15, 14, 24),
      pocketMat,
    );
    tube.position.set(cx, -3.5, cz); // y: -10.5 to 3.5
    tube.name = `PocketTube_${i}`;
    group.add(tube);
  }

  // ── 5. Pocket collars (thin ring around opening) ────────────
  for (let i = 0; i < 6; i++) {
    const cx = px(POCKET_POS[i].x);
    const cz = pz(POCKET_POS[i].y);
    const r = POCKET_RADII[i];

    const collar = new THREE.Mesh(
      new THREE.RingGeometry(r - 3, r, 24),
      collarMat,
    );
    collar.position.set(cx, 4.01, cz); // just above cushion surface
    collar.name = `PocketCollar_${i}`;
    group.add(collar);
  }
}
