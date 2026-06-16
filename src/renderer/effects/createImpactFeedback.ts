import * as THREE from 'three';
import { RenderService } from '../RenderService';
import { SceneGroup } from '../types';
import { LightController } from '../lights/createLightRig';

export interface ImpactFeedbackController {
  trigger(position: THREE.Vector3, normal: THREE.Vector3): void;
  update(dt: number): void;
  getActivePunch(): { offset: THREE.Vector3; fov: number } | null;
  dispose(): void;
}

const _up = new THREE.Vector3(0, 1, 0);

export function createImpactFeedback(
  rs: RenderService,
  lights: LightController,
): ImpactFeedbackController {
  const group = rs.getSceneGroup(SceneGroup.Debug);
  if (!group) throw new Error('DebugGroup not found');

  let active = false;
  let timer = 0;
  const duration = 0.18;
  let normal = new THREE.Vector3();

  let savedKeyIntensity = lights.key.intensity;
  let savedKeyColor = new THREE.Color().copy(lights.key.color);

  const particleMax = 4;
  const particlePos = new Float32Array(particleMax * 3);
  const particleAlpha = new Float32Array(particleMax);
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
  particleGeo.setAttribute('alpha', new THREE.BufferAttribute(particleAlpha, 1));
  particleGeo.setDrawRange(0, 0);

  const particleMat = new THREE.PointsMaterial({
    color: 0xFFEECC,
    size: 1.5,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const particleMesh = new THREE.Points(particleGeo, particleMat);
  particleMesh.name = 'ImpactSpark';
  particleMesh.visible = false;
  group.add(particleMesh);

  const _particleLifetime: number[] = [];
  const _particleVel: THREE.Vector3[] = [];

  const controller: ImpactFeedbackController = {
    trigger: (position: THREE.Vector3, _normal: THREE.Vector3) => {
      active = true;
      timer = 0;
      normal.copy(_normal).normalize();

      savedKeyIntensity = lights.key.intensity;
      savedKeyColor.copy(lights.key.color);

      _particleLifetime.length = 0;
      _particleVel.length = 0;
      const count = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < Math.min(count, particleMax); i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 10 + Math.random() * 20;
        _particleLifetime.push(0.08 + Math.random() * 0.08);
        _particleVel.push(
          new THREE.Vector3(
            Math.cos(angle) * speed + _normal.x * 5,
            5 + Math.random() * 10,
            Math.sin(angle) * speed + _normal.z * 5,
          ),
        );
        particlePos[i * 3] = position.x;
        particlePos[i * 3 + 1] = position.y + 2;
        particlePos[i * 3 + 2] = position.z;
        particleAlpha[i] = 1;
      }
      const flashCount = Math.min(count, particleMax);
      particleMesh.visible = true;
      particleGeo.setDrawRange(0, flashCount);
      (particleGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (particleGeo.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
    },

    getActivePunch: () => {
      if (!active) return null;
      const decay = Math.max(0, 1 - timer / duration);
      return {
        offset: normal.clone().multiplyScalar(decay * 0.8),
        fov: 1.5 * decay,
      };
    },

    update: (dt: number) => {
      if (!active) return;

      timer += dt;

      if (timer < duration) {
        const decay = Math.max(0, 1 - timer / duration);
        lights.key.intensity = savedKeyIntensity * (1 + 0.05 * decay);
      } else {
        lights.key.intensity = savedKeyIntensity;
        lights.key.color.copy(savedKeyColor);
        active = false;
        particleMesh.visible = false;
        particleGeo.setDrawRange(0, 0);
        return;
      }

      let anyAlive = false;
      for (let i = 0; i < _particleLifetime.length && i < particleMax; i++) {
        _particleLifetime[i] -= dt;
        if (_particleLifetime[i] <= 0) {
          particleAlpha[i] = 0;
          continue;
        }
        anyAlive = true;
        const life = Math.max(0, _particleLifetime[i] / 0.16);
        particleAlpha[i] = life * life;
        const v = _particleVel[i];
        particlePos[i * 3] += v.x * dt;
        particlePos[i * 3 + 1] += v.y * dt;
        particlePos[i * 3 + 2] += v.z * dt;
        v.y -= 100 * dt;
      }

      if (!anyAlive) {
        particleMesh.visible = false;
        particleGeo.setDrawRange(0, 0);
      }

      (particleGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (particleGeo.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
    },

    dispose: () => {
      group.remove(particleMesh);
      particleGeo.dispose();
      particleMat.dispose();
      lights.key.intensity = savedKeyIntensity;
      lights.key.color.copy(savedKeyColor);
    },
  };

  return controller;
}
