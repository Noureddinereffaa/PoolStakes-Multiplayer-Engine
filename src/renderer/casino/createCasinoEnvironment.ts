import * as THREE from 'three';

export interface CasinoEnvironmentController {
  update(time: number): void;
  dispose(): void;
}

export function createCasinoEnvironment(scene: THREE.Scene): CasinoEnvironmentController {
  const envGroup = new THREE.Group();
  envGroup.name = 'CasinoEnvironment';
  scene.add(envGroup);

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x1a0e06,
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x0d0804,
    roughness: 0.4,
    metalness: 0.6,
  });

  // ── Walls ──
  const wallData = [
    { w: 1200, h: 300, x: 0, z: -500 },
    { w: 1200, h: 300, x: 0, z: 500 },
    { w: 1000, h: 300, x: -600, z: 0 },
    { w: 1000, h: 300, x: 600, z: 0 },
  ];
  for (const wd of wallData) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(wd.w, wd.h), wallMat);
    wall.position.set(wd.x, 150, wd.z);
    wall.rotation.y = wd.x === 0 ? 0 : Math.PI / 2;
    envGroup.add(wall);
  }

  // ── Floor ──
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1000), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -1, 0);
  envGroup.add(floor);

  // ── Pillars ──
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x2a1a0a,
    roughness: 0.7,
    metalness: 0.2,
  });
  const pillarPositions = [
    { x: -350, z: -280 },
    { x: 350, z: -280 },
    { x: -350, z: 280 },
    { x: 350, z: 280 },
  ];
  for (const pp of pillarPositions) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(12, 14, 300, 8), pillarMat);
    pillar.position.set(pp.x, 150, pp.z);
    envGroup.add(pillar);
  }

  // ── Neon strips ──
  const neonMat = new THREE.MeshBasicMaterial({ color: 0x4a1a8a });
  const neonPositions = [
    { x: -580, z: -480, len: 220, rot: 0 },
    { x: -580, z: 480, len: 220, rot: 0 },
    { x: 580, z: -480, len: 220, rot: 0 },
    { x: 580, z: 480, len: 220, rot: 0 },
    { x: -480, z: -490, len: 200, rot: Math.PI / 2 },
    { x: -480, z: 490, len: 200, rot: Math.PI / 2 },
    { x: 480, z: -490, len: 200, rot: Math.PI / 2 },
    { x: 480, z: 490, len: 200, rot: Math.PI / 2 },
  ];
  for (const np of neonPositions) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(np.len, 1.5, 1.5), neonMat);
    strip.position.set(np.x, 290, np.z);
    strip.rotation.y = np.rot;
    envGroup.add(strip);
  }

  // ── Gold trim (luxury accent) ──
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xc8963e,
    roughness: 0.3,
    metalness: 0.7,
  });
  const trim = new THREE.Mesh(new THREE.BoxGeometry(1200, 2, 4), trimMat);
  trim.position.set(0, 296, -498);
  envGroup.add(trim);
  const trim2 = new THREE.Mesh(new THREE.BoxGeometry(1200, 2, 4), trimMat);
  trim2.position.set(0, 296, 498);
  envGroup.add(trim2);
  const trim3 = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 1000), trimMat);
  trim3.position.set(-598, 296, 0);
  envGroup.add(trim3);
  const trim4 = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 1000), trimMat);
  trim4.position.set(598, 296, 0);
  envGroup.add(trim4);

  // ── Subtle fog ──
  scene.fog = new THREE.FogExp2(0x0a0502, 0.0025);

  // ── Floor reflection plane (SSR-lite: semi-transparent flipped) ──
  const reflMat = new THREE.MeshBasicMaterial({
    color: 0x1a0e06,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
  });
  const reflPlane = new THREE.Mesh(new THREE.PlaneGeometry(800, 400), reflMat);
  reflPlane.rotation.x = -Math.PI / 2;
  reflPlane.position.set(0, 1, 0);
  envGroup.add(reflPlane);

  // ── Ceiling spotlights (point light markers) ──
  const spotMat = new THREE.MeshBasicMaterial({ color: 0xffeedd });
  for (let i = -2; i <= 2; i++) {
    const spot = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 8), spotMat);
    spot.position.set(i * 150, 295, 0);
    envGroup.add(spot);
  }

  let elapsed = 0;

  return {
    update: (time: number) => {
      elapsed = time;
      const neonPulse = 0.6 + Math.sin(time * 2) * 0.4;
      neonMat.color.setHSL(0.75, 0.8, neonPulse * 0.15);
    },

    dispose: () => {
      scene.remove(envGroup);
      scene.fog = null;
      envGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    },
  };
}
