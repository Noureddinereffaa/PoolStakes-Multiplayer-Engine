import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createCasinoEnvironment } from '../renderer/casino/createCasinoEnvironment';
import { createCrowdController, CrowdController } from '../renderer/casino/CrowdController';
import { createSoundscapeSystem, SoundscapeSystem } from '../renderer/casino/SoundscapeSystem';

const SCALE = 0.35;
const PLAY_X_HALF = 400 * SCALE / 2;
const PLAY_Z_HALF = 800 * SCALE / 2;

const CUSHION = 40 * SCALE;
const RAIL_H = 14;

const BALL_COLORS: Record<number, string> = {
  0: '#ffffff',
  1: '#CFAF30', 2: '#1B4CA7', 3: '#B12724',
  4: '#5F3E9C', 5: '#C86414', 6: '#0F7B4D',
  7: '#7A1E2A', 8: '#111111', 9: '#D7B037',
  10: '#4A76C8', 11: '#D45851', 12: '#9D6FD1',
  13: '#D28D3E', 14: '#3CA972', 15: '#8A1A24',
};

interface BallData {
  id: number;
  x: number;
  y: number;
  isPocketed: boolean;
}

interface CasinoSpectatorProps {
  onClose: () => void;
  balls?: BallData[];
}

function gameTo3D(gx: number, gy: number): [number, number, number] {
  return [(gy - 200) * SCALE, RAIL_H + 2, (gx - 400) * SCALE];
}

function createFloatingParticles(scene: THREE.Scene): { update(dt: number): void; dispose(): void } {
  const count = 200;
  const positions = new Float32Array(count * 3);
  const velocities: number[] = [];
  const sizes = new Float32Array(count);

  const spread = 200;
  const height = 200;

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const r = Math.random() * spread;
    positions[i * 3] = Math.cos(theta) * r;
    positions[i * 3 + 1] = Math.random() * height + 10;
    positions[i * 3 + 2] = Math.sin(theta) * r;
    velocities.push(0.5 + Math.random() * 1.5);
    sizes[i] = 0.5 + Math.random() * 1.5;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    color: 0xffeedd,
    size: 2,
    transparent: true,
    opacity: 0.15,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);

  return {
    update: (dt: number) => {
      const pos = points.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < count; i++) {
        pos[i * 3 + 1] -= velocities[i] * dt * 8;
        if (pos[i * 3 + 1] < 0) {
          pos[i * 3 + 1] = height;
          const theta = Math.random() * Math.PI * 2;
          const r = Math.random() * spread;
          pos[i * 3] = Math.cos(theta) * r;
          pos[i * 3 + 2] = Math.sin(theta) * r;
        }
      }
      points.geometry.attributes.position.needsUpdate = true;
    },
    dispose: () => {
      scene.remove(points);
      geo.dispose();
      mat.dispose();
    },
  };
}

const CONFETTI_COLORS = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff, 0x44ffff, 0xff8800, 0xff4488];

function createConfettiSystem(scene: THREE.Scene): {
  burst(count: number, x: number, z: number): void;
  update(dt: number): void;
  dispose(): void;
} {
  const MAX = 400;
  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  const sizes = new Float32Array(MAX);
  const lifetimes = new Float32Array(MAX);
  const vx = new Float32Array(MAX);
  const vy = new Float32Array(MAX);
  const vz = new Float32Array(MAX);
  let alive = 0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    size: 4,
    transparent: true,
    opacity: 0.9,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);

  function spawn(count: number, cx: number, cz: number): void {
    for (let i = 0; i < count && alive < MAX; i++, alive++) {
      const idx = alive;
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 60;
      positions[idx * 3] = cx + Math.cos(angle) * dist;
      positions[idx * 3 + 1] = 200 + Math.random() * 50;
      positions[idx * 3 + 2] = cz + Math.sin(angle) * dist;

      const c = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      colors[idx * 3] = ((c >> 16) & 0xff) / 255;
      colors[idx * 3 + 1] = ((c >> 8) & 0xff) / 255;
      colors[idx * 3 + 2] = (c & 0xff) / 255;

      sizes[idx] = 2 + Math.random() * 4;
      lifetimes[idx] = 2 + Math.random() * 2;
      vx[idx] = (Math.random() - 0.5) * 60;
      vy[idx] = 40 + Math.random() * 60;
      vz[idx] = (Math.random() - 0.5) * 60;
    }
  }

  return {
    burst: (count: number, x: number, z: number) => {
      if (alive < MAX) spawn(count, x, z);
    },

    update: (dt: number) => {
      let writeIdx = 0;
      for (let i = 0; i < alive; i++) {
        lifetimes[i] -= dt;
        if (lifetimes[i] <= 0) continue;

        vy[i] -= 120 * dt;
        positions[i * 3] += vx[i] * dt;
        positions[i * 3 + 1] += vy[i] * dt;
        positions[i * 3 + 2] += vz[i] * dt;

        if (positions[i * 3 + 1] < 0) continue;

        if (writeIdx !== i) {
          positions[writeIdx * 3] = positions[i * 3];
          positions[writeIdx * 3 + 1] = positions[i * 3 + 1];
          positions[writeIdx * 3 + 2] = positions[i * 3 + 2];
          colors[writeIdx * 3] = colors[i * 3];
          colors[writeIdx * 3 + 1] = colors[i * 3 + 1];
          colors[writeIdx * 3 + 2] = colors[i * 3 + 2];
          sizes[writeIdx] = sizes[i];
          lifetimes[writeIdx] = lifetimes[i];
        }
        writeIdx++;
      }
      alive = writeIdx;

      geo.setDrawRange(0, alive);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.attributes.size.needsUpdate = true;
    },

    dispose: () => {
      scene.remove(points);
      geo.dispose();
      mat.dispose();
    },
  };
}

function createChandelier(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group();

  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xc8963e,
    roughness: 0.3,
    metalness: 0.8,
  });
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffeedd,
    transparent: true,
    opacity: 0.6,
  });

  const ring = new THREE.Mesh(new THREE.TorusGeometry(24, 1.5, 8, 24), goldMat);
  ring.position.y = 285;
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(14, 1, 8, 20), goldMat);
  innerRing.position.y = 283;
  innerRing.rotation.x = Math.PI / 2;
  group.add(innerRing);

  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 / 8) * i;
    const cx = Math.cos(angle) * 19;
    const cz = Math.sin(angle) * 19;

    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 6, 4),
      goldMat,
    );
    arm.position.set(cx, 281, cz);
    group.add(arm);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 6, 6),
      glowMat,
    );
    bulb.position.set(cx, 277, cz);
    group.add(bulb);
  }

  const centerBulb = new THREE.Mesh(
    new THREE.SphereGeometry(2.5, 8, 8),
    glowMat,
  );
  centerBulb.position.y = 278;
  group.add(centerBulb);

  scene.add(group);
  return group;
}

function createTableMarkings(scene: THREE.Scene, tableW: number, tableD: number): void {
  const diamondMat = new THREE.MeshStandardMaterial({
    color: 0xeeddbb,
    roughness: 0.6,
    metalness: 0.3,
    emissive: 0x886633,
    emissiveIntensity: 0.1,
  });

  const hw = tableW / 2 - 7;
  const hd = tableD / 2 - 7;

  const longSideCount = 4;
  for (let i = 1; i <= longSideCount; i++) {
    const t = i / (longSideCount + 1);
    for (const sign of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(1.8, 4), diamondMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(sign * hw, 14.5, -hd + t * (hd * 2));
      scene.add(d);
    }
  }

  const shortSideCount = 2;
  for (let i = 1; i <= shortSideCount; i++) {
    const t = i / (shortSideCount + 1);
    for (const sign of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(1.8, 4), diamondMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(-hw + t * (hw * 2), 14.5, sign * hd);
      scene.add(d);
    }
  }

  const spotMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.15,
  });
  const spot = new THREE.Mesh(new THREE.CircleGeometry(3, 12), spotMat);
  spot.rotation.x = -Math.PI / 2;
  spot.position.set(0, 14.1, -hd * 0.32);
  scene.add(spot);

  const headMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.06,
  });
  const headLine = new THREE.Mesh(new THREE.PlaneGeometry(0.5, hd * 2 - 14), headMat);
  headLine.rotation.x = -Math.PI / 2;
  headLine.position.set(0, 14.1, 0);
  scene.add(headLine);
}

export default function CasinoSpectator({ onClose, balls }: CasinoSpectatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ballMeshesRef = useRef<Map<number, THREE.Mesh>>(new Map());
  const ballGroupRef = useRef<THREE.Group>(new THREE.Group());
  const crowdRef = useRef<CrowdController | null>(null);
  const cueBallPosRef = useRef(new THREE.Vector3(0, 0, 0));
  const confettiRef = useRef<ReturnType<typeof createConfettiSystem> | null>(null);
  const soundscapeRef = useRef<SoundscapeSystem | null>(null);
  const prevPocketedRef = useRef<Set<number>>(new Set());
  const prevEightPocketedRef = useRef(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [autoOrbit, setAutoOrbit] = useState(true);
  const autoOrbitRef = useRef(true);
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0502);

    const camera = new THREE.PerspectiveCamera(50, w / h, 1, 2000);
    camera.position.set(0, 200, 450);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.8;
    controls.minDistance = 100;
    controls.maxDistance = 900;
    controls.maxPolarAngle = Math.PI / 2.1;

    const ambientLight = new THREE.AmbientLight(0xffeedd, 0.25);
    scene.add(ambientLight);

    const ceilingLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    ceilingLight.position.set(0, 350, 0);
    ceilingLight.castShadow = true;
    ceilingLight.shadow.mapSize.set(512, 512);
    ceilingLight.shadow.camera.near = 1;
    ceilingLight.shadow.camera.far = 700;
    ceilingLight.shadow.camera.left = -400;
    ceilingLight.shadow.camera.right = 400;
    ceilingLight.shadow.camera.top = 400;
    ceilingLight.shadow.camera.bottom = -400;
    scene.add(ceilingLight);

    const fillLight = new THREE.DirectionalLight(0x8866ff, 0.4);
    fillLight.position.set(-300, 100, 200);
    scene.add(fillLight);

    const env = createCasinoEnvironment(scene);
    const crowd = createCrowdController(scene);
    crowdRef.current = crowd;

    const particles = createFloatingParticles(scene);
    const confetti = createConfettiSystem(scene);
    confettiRef.current = confetti;

    const soundscape = createSoundscapeSystem();
    soundscapeRef.current = soundscape;

    const tableGroup = new THREE.Group();
    scene.add(tableGroup);

    const railMat = new THREE.MeshStandardMaterial({ color: 0x1a5a2a, roughness: 0.7, metalness: 0.1 });
    const feltMat = new THREE.MeshStandardMaterial({ color: 0x0a7a3a, roughness: 0.85, metalness: 0 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.6, metalness: 0.3 });
    const pocketMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1, metalness: 0 });

    const tableW = PLAY_Z_HALF * 2 + CUSHION * 2;
    const tableD = PLAY_X_HALF * 2 + CUSHION * 2;

    const outerX = tableW;
    const outerZ = tableD + 20;

    const apron = new THREE.Mesh(new THREE.BoxGeometry(outerX, 8, outerZ), frameMat);
    apron.position.set(0, RAIL_H - 4, 0);
    apron.castShadow = true;
    tableGroup.add(apron);

    const topFrame = new THREE.Mesh(new THREE.BoxGeometry(outerX + 20, 4, outerZ + 20), frameMat);
    topFrame.position.set(0, RAIL_H, 0);
    tableGroup.add(topFrame);

    const felt = new THREE.Mesh(new THREE.PlaneGeometry(tableW - 14 * 2, tableD - 14 * 2), feltMat);
    felt.rotation.x = -Math.PI / 2;
    felt.position.set(0, RAIL_H + 1, 0);
    felt.receiveShadow = true;
    tableGroup.add(felt);

    const halfW = tableW / 2;
    const halfD = tableD / 2;
    const rails = [
      { l: tableW, x: 0, z: -(halfD + 7) },
      { l: tableW, x: 0, z: halfD + 7 },
      { l: tableD, x: -(halfW + 7), z: 0 },
      { l: tableD, x: halfW + 7, z: 0 },
    ];
    for (const r of rails) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(r.l, RAIL_H, 14), railMat);
      rail.position.set(r.x, RAIL_H / 2, r.z);
      rail.castShadow = true;
      rail.receiveShadow = true;
      tableGroup.add(rail);
    }

    const pocketR = 5;
    const pocketPositions = [
      [0, -(halfD + 1)], [0, halfD + 1],
      [-(halfW + 1), 0], [halfW + 1, 0],
      [-(halfW + 1), -(halfD + 1)], [halfW + 1, -(halfD + 1)],
      [-(halfW + 1), halfD + 1], [halfW + 1, halfD + 1],
    ];
    for (const [px, pz] of pocketPositions) {
      const pocket = new THREE.Mesh(new THREE.CircleGeometry(pocketR, 12), pocketMat);
      pocket.rotation.x = -Math.PI / 2;
      pocket.position.set(px, RAIL_H + 0.1, pz);
      tableGroup.add(pocket);
    }

    for (let dx = -1; dx <= 1; dx += 2) {
      for (let dz = -1; dz <= 1; dz += 2) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 50, 6), frameMat);
        leg.position.set(dx * (halfW + 10), -25, dz * (halfD + 10));
        leg.castShadow = true;
        tableGroup.add(leg);
      }
    }

    const ballGroup = new THREE.Group();
    ballGroupRef.current = ballGroup;
    scene.add(ballGroup);

    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, 0, 0);
    scene.add(spotTarget);

    const spotLight = new THREE.SpotLight(0xffeedd, 3, 500, Math.PI / 12, 0.6, 1.5);
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

    const chandelier = createChandelier(scene);
    createTableMarkings(scene, tableW, tableD);

    let animTime = 0;
    let rafId: number;

    function animate() {
      animTime += 0.016;
      env.update(animTime);
      particles.update(0.016);
      confetti.update(0.016);
      soundscape.update(0.016);
      crowd.update(0.016, cueBallPosRef.current);
      controls.update();
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    }
    rafId = requestAnimationFrame(animate);

    function handleResize() {
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      renderer.setSize(cw, ch);
    }
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
      env.dispose();
      scene.remove(chandelier);
      chandelier.traverse(c => { if (c instanceof THREE.Mesh) { c.geometry.dispose(); if (Array.isArray(c.material)) c.material.forEach(m => m.dispose()); else c.material.dispose(); } });
      particles.dispose();
      confetti.dispose();
      soundscape.dispose();
      crowd.dispose();
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    const group = ballGroupRef.current;
    const map = ballMeshesRef.current;
    if (!balls) return;

    const newPocketed = new Set<number>();
    for (const b of balls) {
      if (b.isPocketed && b.id !== 0) newPocketed.add(b.id);
    }

    const justPocketed: number[] = [];
    for (const id of newPocketed) {
      if (!prevPocketedRef.current.has(id)) justPocketed.push(id);
    }

    if (justPocketed.length > 0) {
      const confetti = confettiRef.current;
      if (confetti) {
        const intensity = Math.min(justPocketed.length, 3);
        confetti.burst(40 + intensity * 30, 0, 0);
      }
      const crowd = crowdRef.current;
      if (crowd) {
        crowd.triggerReaction(0.2 + justPocketed.length * 0.15, 'applause');
      }
      const ss = soundscapeRef.current;
      if (ss) {
        ss.playAppealBurst(0.3 + justPocketed.length * 0.2);
      }
    }

    const eightPocketed = balls.some(b => b.id === 8 && b.isPocketed);
    if (eightPocketed && !prevEightPocketedRef.current) {
      const confetti = confettiRef.current;
      if (confetti) confetti.burst(200, 0, 0);
      const crowd = crowdRef.current;
      if (crowd) crowd.triggerReaction(1, 'applause');
      const ss = soundscapeRef.current;
      if (ss) ss.playGaspWave(1);
    }
    prevEightPocketedRef.current = eightPocketed;

    prevPocketedRef.current = newPocketed;

    const existingIds = new Set(map.keys());
    const incomingIds = new Set<number>();

    for (const b of balls) {
      incomingIds.add(b.id);
      if (b.id === 0 && !b.isPocketed) {
        const [bx, , bz] = gameTo3D(b.x, b.y);
        cueBallPosRef.current.set(bx, 0, bz);
      }
      if (b.isPocketed) {
        if (map.has(b.id)) {
          group.remove(map.get(b.id)!);
          map.delete(b.id);
        }
        continue;
      }

      const [bx, by, bz] = gameTo3D(b.x, b.y);

      if (map.has(b.id)) {
        const mesh = map.get(b.id)!;
        mesh.position.set(bx, by, bz);
      } else {
        const colorHex = parseInt(BALL_COLORS[b.id] ?? '#888888', 16);
        const mat = new THREE.MeshStandardMaterial({
          color: colorHex,
          roughness: 0.3,
          metalness: 0.1,
        });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 16), mat);
        mesh.position.set(bx, by, bz);
        mesh.castShadow = true;
        group.add(mesh);
        map.set(b.id, mesh);
      }
    }

    for (const id of existingIds) {
      if (!incomingIds.has(id)) {
        const mesh = map.get(id)!;
        group.remove(mesh);
        (mesh.material as THREE.Material).dispose();
        mesh.geometry.dispose();
        map.delete(id);
      }
    }
  }, [balls]);

  useEffect(() => {
    const ss = soundscapeRef.current;
    if (ss) ss.setMuted(!soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    const c = controlsRef.current;
    if (c) c.autoRotate = autoOrbit;
  }, [autoOrbit]);

  return (
    <div className="fixed inset-0 z-50 bg-black" style={{ touchAction: 'none' }}>
      <div ref={containerRef} className="w-full h-full" />

      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <button
          onClick={() => setAutoOrbit(v => !v)}
          className="px-3 py-2 rounded-xl bg-amber-950/60 border border-amber-700/40 text-amber-400 font-bold text-sm hover:bg-amber-900/60 hover:border-amber-500/60 transition-all backdrop-blur-sm"
        >
          {autoOrbit ? '⟳' : '⊘'}
        </button>
        <button
          onClick={() => setSoundEnabled(v => !v)}
          className="px-3 py-2 rounded-xl bg-amber-950/60 border border-amber-700/40 text-amber-400 font-bold text-sm hover:bg-amber-900/60 hover:border-amber-500/60 transition-all backdrop-blur-sm"
        >
          {soundEnabled ? '♪' : '✕'}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-xl bg-amber-950/60 border border-amber-700/40 text-amber-400 font-bold text-sm hover:bg-amber-900/60 hover:border-amber-500/60 transition-all backdrop-blur-sm"
        >
          ✕ Exit
        </button>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-full bg-black/60 border border-amber-900/30 backdrop-blur-sm">
        <span className="text-[10px] font-mono text-amber-500/70 tracking-wider">
          Drag to orbit &bull; Scroll to zoom &bull; Auto-orbit {autoOrbit ? 'ON' : 'OFF'}
        </span>
      </div>
    </div>
  );
}
