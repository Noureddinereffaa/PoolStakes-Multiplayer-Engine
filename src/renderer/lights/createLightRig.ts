import * as THREE from 'three';
import { RenderService } from '../RenderService';
import { SceneGroup } from '../types';

// ═════════════════════════════════════════════════════════════════
//  LIGHT RIG — physically inspired 3-light setup for billiards
// ═════════════════════════════════════════════════════════════════

export interface LightData {
  direction: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
}

export interface LightController {
  key: LightData;
  fill: LightData;
  rim: LightData;
  ambient: { sky: THREE.Color; ground: THREE.Color; intensity: number };
  /** Update rim light to follow camera — call each frame in onUpdate. */
  updateRim(cameraPos: THREE.Vector3): void;
  /** Return a Three.js light (for reference). */
  getKeyLight(): THREE.DirectionalLight;
  getFillLight(): THREE.DirectionalLight;
  getRimLight(): THREE.DirectionalLight;
  dispose(): void;
}

export function createLightRig(rs: RenderService): LightController {
  const group = rs.getSceneGroup(SceneGroup.Lights);
  if (!group) throw new Error('LightGroup not found');

  const target = new THREE.Object3D();
  target.position.set(0, 0, 0);

  // ── 1. Key Light ───────────────────────────────────────────
  const keyLight = new THREE.DirectionalLight(0xfff3e0, 1.6);
  keyLight.position.set(350, 600, 250);
  keyLight.target = target.clone();
  keyLight.name = 'KeyLight';
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 100;
  keyLight.shadow.camera.far = 1200;
  keyLight.shadow.camera.left = -600;
  keyLight.shadow.camera.right = 600;
  keyLight.shadow.camera.top = 400;
  keyLight.shadow.camera.bottom = -400;
  keyLight.shadow.bias = 0.0015;
  keyLight.shadow.normalBias = 0.02;
  keyLight.shadow.radius = 4;
  group.add(keyLight);
  group.add(keyLight.target);

  // ── 2. Fill Light ──────────────────────────────────────────
  const fillLight = new THREE.DirectionalLight(0xcfe8ff, 0.5);
  fillLight.position.set(-300, 250, -200);
  fillLight.target = target.clone();
  fillLight.name = 'FillLight';
  fillLight.castShadow = false;
  group.add(fillLight);
  group.add(fillLight.target);

  // ── 3. Rim Light ───────────────────────────────────────────
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.35);
  // Initial position — will be updated per frame
  rimLight.position.set(0, 600, -600);
  rimLight.target = target.clone();
  rimLight.name = 'RimLight';
  rimLight.castShadow = false;
  group.add(rimLight);
  group.add(rimLight.target);

  // ── 4. Ambient Hemisphere ──────────────────────────────────
  const hemi = new THREE.HemisphereLight(0xdde6f2, 0x7a5c3e, 0.35);
  hemi.name = 'AmbientHemisphere';
  group.add(hemi);

  // ── Helper: extract direction from light position ──────────
  function directionFrom(pos: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3().copy(pos).normalize();
  }

  const controller: LightController = {
    key: {
      direction: directionFrom(keyLight.position),
      color: new THREE.Color(0xfff3e0),
      intensity: 1.6,
    },
    fill: {
      direction: directionFrom(fillLight.position),
      color: new THREE.Color(0xcfe8ff),
      intensity: 0.5,
    },
    rim: {
      direction: directionFrom(rimLight.position),
      color: new THREE.Color(0xffffff),
      intensity: 0.35,
    },
    ambient: {
      sky: new THREE.Color(0xdde6f2),
      ground: new THREE.Color(0x7a5c3e),
      intensity: 0.35,
    },
    updateRim: (cameraPos: THREE.Vector3) => {
      // Reflect camera direction around table normal (up)
      const dir = new THREE.Vector3()
        .copy(cameraPos)
        .negate()
        .normalize();
      const normal = new THREE.Vector3(0, 1, 0);
      const refDir = dir.clone().reflect(normal).normalize();
      const rimPos = refDir.clone().multiplyScalar(600);
      rimLight.position.copy(rimPos);
      rimLight.target.position.set(0, 0, 0);

      // Update rim direction in controller
      controller.rim.direction.copy(refDir);
    },
    getKeyLight: () => keyLight,
    getFillLight: () => fillLight,
    getRimLight: () => rimLight,
    dispose: () => {
      group.remove(keyLight);
      group.remove(keyLight.target);
      group.remove(fillLight);
      group.remove(fillLight.target);
      group.remove(rimLight);
      group.remove(rimLight.target);
      group.remove(hemi);
      keyLight.dispose();
      fillLight.dispose();
      rimLight.dispose();
      hemi.dispose();
    },
  };

  return controller;
}
