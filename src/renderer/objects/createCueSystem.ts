import * as THREE from 'three';
import { RenderService } from '../RenderService';
import { SceneGroup } from '../types';

const CUE_LENGTH = 140;
const CUE_TIP_RADIUS = 0.8;
const CUE_BUTT_RADIUS = 2.2;
const CUE_OFFSET_BASE = 14;
const CUE_PULL_MAX = 25;
const SPRING_K = 0.18;

export interface CueSystemController {
  update(
    aimAngle: number,
    power: number,
    cueBallPos: THREE.Vector3,
    dt: number,
  ): void;
  setAimDirection(angle: number): void;
  setPullBack(fraction: number): void;
  show(): void;
  hide(): void;
  dispose(): void;
}

const _dir = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export function createCueSystem(rs: RenderService): CueSystemController {
  const group = rs.getSceneGroup(SceneGroup.Cue);
  if (!group) throw new Error('CueGroup not found');

  const geo = new THREE.CylinderGeometry(CUE_TIP_RADIUS, CUE_BUTT_RADIUS, CUE_LENGTH, 16, 1);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xD4A656,
    roughness: 0.35,
    metalness: 0,
    clearcoat: 0.1,
    clearcoatRoughness: 0.3,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'CueStick';
  mesh.visible = false;

  const tipGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x88CCFF, transparent: true, opacity: 0, depthWrite: false }),
  );
  tipGlow.name = 'CueTipGlow';
  tipGlow.position.set(0, CUE_LENGTH / 2, 0);
  mesh.add(tipGlow);

  group.add(mesh);

  let visible = false;
  let aimAngle = 0;
  let pullFraction = 0;

  const currentPos = new THREE.Vector3();
  const currentQuat = new THREE.Quaternion().identity();

  const controller: CueSystemController = {
    setAimDirection: (angle: number) => {
      aimAngle = angle;
    },
    setPullBack: (fraction: number) => {
      pullFraction = Math.max(0, Math.min(1, fraction));
    },
    show: () => {
      mesh.visible = true;
      visible = true;
    },
    hide: () => {
      mesh.visible = false;
      visible = false;
    },
    update: (angle: number, power: number, cueBallPos: THREE.Vector3, dt: number) => {
      if (!visible) return;

      const dirX = Math.cos(angle);
      const dirZ = -Math.sin(angle);
      _dir.set(dirX, 0, dirZ).normalize();

      const offset = CUE_OFFSET_BASE + power / 100 * CUE_PULL_MAX;
      _targetPos.copy(cueBallPos).addScaledVector(_dir, -(offset + CUE_LENGTH / 2));

      const targetQuat = new THREE.Quaternion().setFromUnitVectors(_up, _dir);

      const lerpFactor = 1 - Math.pow(1 - SPRING_K, dt * 60);
      currentPos.lerp(_targetPos, lerpFactor);
      currentQuat.slerp(targetQuat, lerpFactor);

      mesh.position.copy(currentPos);
      mesh.quaternion.copy(currentQuat);

      const glowOpacity = (power / 100) * 0.8;
      tipGlow.material.opacity = glowOpacity;
    },
    dispose: () => {
      group.remove(mesh);
      geo.dispose();
      mat.dispose();
      tipGlow.geometry.dispose();
      (tipGlow.material as THREE.Material).dispose();
    },
  };

  return controller;
}
