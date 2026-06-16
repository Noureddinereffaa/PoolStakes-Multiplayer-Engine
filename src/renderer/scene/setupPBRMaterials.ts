import * as THREE from 'three';
import { RenderService } from '../RenderService';
import { SceneGroup } from '../types';

/**
 * Replace scene materials with PBR-calibrated equivalents.
 * Walks the TableGroup by mesh name and swaps materials in-place.
 */
export function setupPBRMaterials(rs: RenderService): void {
  const group = rs.getSceneGroup(SceneGroup.Table);
  if (!group) return;

  group.children.forEach((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mesh = child as THREE.Mesh;

    switch (mesh.name) {
      case 'Felt':
        setupFelt(mesh);
        break;
      case 'TableFrame':
        setupFrame(mesh);
        break;
      case 'Cushion':
        setupCushion(mesh);
        break;
      case 'PocketCollar_0':
      case 'PocketCollar_1':
      case 'PocketCollar_2':
      case 'PocketCollar_3':
      case 'PocketCollar_4':
      case 'PocketCollar_5':
        setupCollar(mesh);
        break;
      // Pocket tubes keep their existing black material
    }
  });
}

// ── Felt ────────────────────────────────────────────────────────

function setupFelt(mesh: THREE.Mesh): void {
  mesh.receiveShadow = true;
  // Dispose old material (shared feltMat from createTable)
  (mesh.material as THREE.Material)?.dispose();
  const geo = mesh.geometry;
  // Add vertex color gradient: darker center, lighter edges (fake AO)
  const pos = geo.getAttribute('position');
  if (pos && !geo.getAttribute('color')) {
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      // Normalize distance from center (0..1)
      const dx = x / 400;
      const dz = z / 200;
      const dist = Math.sqrt(dx * dx + dz * dz) / 1.414; // max dist ≈ 1.414
      const brightness = 0.88 + 0.12 * (1 - dist * dist);
      colors[i * 3] = brightness;
      colors[i * 3 + 1] = brightness;
      colors[i * 3 + 2] = brightness;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.attributes.color.needsUpdate = true;
  }

  mesh.material = new THREE.MeshPhysicalMaterial({
    color: 0x0b5e3b,
    roughness: 0.92,
    metalness: 0,
    vertexColors: true,
    clearcoat: 0,
    envMapIntensity: 0,
  });
}

// ── Wooden Frame ────────────────────────────────────────────────

function setupFrame(mesh: THREE.Mesh): void {
  (mesh.material as THREE.Material)?.dispose();
  mesh.material = new THREE.MeshPhysicalMaterial({
    color: 0x5c3a1e,
    roughness: 0.45,
    metalness: 0,
    clearcoat: 0.1,
    clearcoatRoughness: 0.3,
    anisotropy: 0.6,
    anisotropyRotation: 0, // along X axis (table length)
    envMapIntensity: 0.15,
  });
}

// ── Rubber Cushions ─────────────────────────────────────────────

function setupCushion(mesh: THREE.Mesh): void {
  (mesh.material as THREE.Material)?.dispose();
  mesh.material = new THREE.MeshPhysicalMaterial({
    color: 0x0f5a2a,
    roughness: 0.85,
    metalness: 0,
    clearcoat: 0,
    envMapIntensity: 0,
  });
}

// ── Pocket Collars ──────────────────────────────────────────────

function setupCollar(mesh: THREE.Mesh): void {
  (mesh.material as THREE.Material)?.dispose();
  mesh.material = new THREE.MeshPhysicalMaterial({
    color: 0x2a1a0a,
    roughness: 0.9,
    metalness: 0,
    clearcoat: 0,
    envMapIntensity: 0,
  });
}
