import * as THREE from 'three';
import { RenderService } from '../RenderService';

export interface CasinoDecorationsHandle {
  update(dt: number, cueBallPos?: THREE.Vector3): void;
  triggerConfetti(count: number, x?: number, z?: number): void;
  dispose(): void;
}

const HALF_W = 400;
const HALF_D = 200;

export function addCasinoDecorations(rs: RenderService): CasinoDecorationsHandle {
  const scene = rs.getScene()!;

  // ── Chandelier ──
  const chandelierGroup = new THREE.Group();
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xc8963e, roughness: 0.3, metalness: 0.8 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffeedd, transparent: true, opacity: 0.6 });

  const ring = new THREE.Mesh(new THREE.TorusGeometry(24, 1.5, 8, 24), goldMat);
  ring.position.y = 285;
  ring.rotation.x = Math.PI / 2;
  chandelierGroup.add(ring);

  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(14, 1, 8, 20), goldMat);
  innerRing.position.y = 283;
  innerRing.rotation.x = Math.PI / 2;
  chandelierGroup.add(innerRing);

  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 / 8) * i;
    const cx = Math.cos(angle) * 19;
    const cz = Math.sin(angle) * 19;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 6, 4), goldMat);
    arm.position.set(cx, 281, cz);
    chandelierGroup.add(arm);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.8, 6, 6), glowMat);
    bulb.position.set(cx, 277, cz);
    chandelierGroup.add(bulb);
  }

  const centerBulb = new THREE.Mesh(new THREE.SphereGeometry(2.5, 8, 8), glowMat);
  centerBulb.position.y = 278;
  chandelierGroup.add(centerBulb);
  scene.add(chandelierGroup);

  // ── Cue ball tracking spotlight ──
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0, 0, 0);
  scene.add(spotTarget);

  const spotLight = new THREE.SpotLight(0xffeedd, 4, 500, Math.PI / 10, 0.5, 1.5);
  spotLight.position.set(0, 280, 0);
  spotLight.target = spotTarget;
  spotLight.castShadow = true;
  spotLight.shadow.mapSize.set(256, 256);
  scene.add(spotLight);

  const spotGlow = new THREE.Mesh(
    new THREE.SphereGeometry(3, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffeedd }),
  );
  spotGlow.position.copy(spotLight.position);
  scene.add(spotGlow);

  // ── Table markings ──
  const diamondMat = new THREE.MeshStandardMaterial({ color: 0xeeddbb, roughness: 0.6, metalness: 0.3, emissive: 0x886633, emissiveIntensity: 0.1 });

  const longSideCount = 4;
  for (let i = 1; i <= longSideCount; i++) {
    const t = i / (longSideCount + 1);
    for (const sign of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(1.8, 4), diamondMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(sign * (HALF_W - 7), 4.5, -HALF_D + t * (HALF_D * 2));
      scene.add(d);
    }
  }

  const shortSideCount = 2;
  for (let i = 1; i <= shortSideCount; i++) {
    const t = i / (shortSideCount + 1);
    for (const sign of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(1.8, 4), diamondMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(-HALF_W + t * (HALF_W * 2), 4.5, sign * (HALF_D - 7));
      scene.add(d);
    }
  }

  const spotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 });
  const spot = new THREE.Mesh(new THREE.CircleGeometry(3, 12), spotMat);
  spot.rotation.x = -Math.PI / 2;
  spot.position.set(0, 4.1, -HALF_D * 0.32);
  scene.add(spot);

  const headMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06 });
  const headLine = new THREE.Mesh(new THREE.PlaneGeometry(0.5, HALF_D * 2 - 14), headMat);
  headLine.rotation.x = -Math.PI / 2;
  headLine.position.set(0, 4.1, 0);
  scene.add(headLine);

  // ── Floating particles ──
  const particleCount = 200;
  const positions = new Float32Array(particleCount * 3);
  const velocities: number[] = [];
  const sizes = new Float32Array(particleCount);
  const spread = 200;
  const height = 200;

  for (let i = 0; i < particleCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const r = Math.random() * spread;
    positions[i * 3] = Math.cos(theta) * r;
    positions[i * 3 + 1] = Math.random() * height + 10;
    positions[i * 3 + 2] = Math.sin(theta) * r;
    velocities.push(0.5 + Math.random() * 1.5);
    sizes[i] = 0.5 + Math.random() * 1.5;
  }

  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const particleMat = new THREE.PointsMaterial({
    color: 0xffeedd,
    size: 2,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const particlePoints = new THREE.Points(particleGeo, particleMat);
  scene.add(particlePoints);

  // ── Confetti system ──
  const CONFETTI_COLORS = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff, 0x44ffff, 0xff8800, 0xff4488];
  const CONFETTI_MAX = 400;
  const confPos = new Float32Array(CONFETTI_MAX * 3);
  const confColors = new Float32Array(CONFETTI_MAX * 3);
  const confSizes = new Float32Array(CONFETTI_MAX);
  const confLifetimes = new Float32Array(CONFETTI_MAX);
  const confVx = new Float32Array(CONFETTI_MAX);
  const confVy = new Float32Array(CONFETTI_MAX);
  const confVz = new Float32Array(CONFETTI_MAX);
  let confAlive = 0;

  const confGeo = new THREE.BufferGeometry();
  confGeo.setAttribute('position', new THREE.BufferAttribute(confPos, 3));
  confGeo.setAttribute('color', new THREE.BufferAttribute(confColors, 3));
  confGeo.setAttribute('size', new THREE.BufferAttribute(confSizes, 1));

  const confMat = new THREE.PointsMaterial({
    size: 4,
    transparent: true,
    opacity: 0.9,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const confPoints = new THREE.Points(confGeo, confMat);
  scene.add(confPoints);

  function spawnConfetti(count: number, cx: number, cz: number): void {
    for (let i = 0; i < count && confAlive < CONFETTI_MAX; i++, confAlive++) {
      const idx = confAlive;
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 60;
      confPos[idx * 3] = cx + Math.cos(angle) * dist;
      confPos[idx * 3 + 1] = 200 + Math.random() * 50;
      confPos[idx * 3 + 2] = cz + Math.sin(angle) * dist;
      const c = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      confColors[idx * 3] = ((c >> 16) & 0xff) / 255;
      confColors[idx * 3 + 1] = ((c >> 8) & 0xff) / 255;
      confColors[idx * 3 + 2] = (c & 0xff) / 255;
      confSizes[idx] = 2 + Math.random() * 4;
      confLifetimes[idx] = 2 + Math.random() * 2;
      confVx[idx] = (Math.random() - 0.5) * 60;
      confVy[idx] = 40 + Math.random() * 60;
      confVz[idx] = (Math.random() - 0.5) * 60;
    }
  }

  return {
    update(dt: number, cueBallPos?: THREE.Vector3) {
      if (cueBallPos) {
        spotTarget.position.copy(cueBallPos);
        spotTarget.position.y = 0;
      }

      const pos = particlePoints.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        pos[i * 3 + 1] -= velocities[i] * dt * 8;
        if (pos[i * 3 + 1] < 0) {
          pos[i * 3 + 1] = height;
          const theta = Math.random() * Math.PI * 2;
          const r = Math.random() * spread;
          pos[i * 3] = Math.cos(theta) * r;
          pos[i * 3 + 2] = Math.sin(theta) * r;
        }
      }
      particlePoints.geometry.attributes.position.needsUpdate = true;

      // Update confetti
      if (confAlive > 0) {
        let writeIdx = 0;
        for (let i = 0; i < confAlive; i++) {
          confLifetimes[i] -= dt;
          if (confLifetimes[i] <= 0) continue;
          confVy[i] -= 120 * dt;
          confPos[i * 3] += confVx[i] * dt;
          confPos[i * 3 + 1] += confVy[i] * dt;
          confPos[i * 3 + 2] += confVz[i] * dt;
          if (confPos[i * 3 + 1] < 0) continue;
          if (writeIdx !== i) {
            confPos[writeIdx * 3] = confPos[i * 3];
            confPos[writeIdx * 3 + 1] = confPos[i * 3 + 1];
            confPos[writeIdx * 3 + 2] = confPos[i * 3 + 2];
            confColors[writeIdx * 3] = confColors[i * 3];
            confColors[writeIdx * 3 + 1] = confColors[i * 3 + 1];
            confColors[writeIdx * 3 + 2] = confColors[i * 3 + 2];
            confSizes[writeIdx] = confSizes[i];
            confLifetimes[writeIdx] = confLifetimes[i];
          }
          writeIdx++;
        }
        confAlive = writeIdx;
        confGeo.setDrawRange(0, confAlive);
        confGeo.attributes.position.needsUpdate = true;
        confGeo.attributes.color.needsUpdate = true;
        confGeo.attributes.size.needsUpdate = true;
      }
    },

    triggerConfetti(count: number, x = 0, z = 0) {
      spawnConfetti(count, x, z);
    },

    dispose() {
      scene.remove(chandelierGroup);
      chandelierGroup.traverse(c => {
        if (c instanceof THREE.Mesh) {
          c.geometry.dispose();
          if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
          else c.material.dispose();
        }
      });
      scene.remove(particlePoints);
      particleGeo.dispose();
      particleMat.dispose();
      scene.remove(confPoints);
      confGeo.dispose();
      confMat.dispose();
    },
  };
}
