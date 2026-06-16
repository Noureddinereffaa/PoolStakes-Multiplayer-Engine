import * as THREE from 'three';

const NPC_COUNT = 64;
const REACTION_SUBSET_MIN = 0.1;
const REACTION_SUBSET_MAX = 0.3;

export interface NPCDef {
  id: number;
  seatPos: THREE.Vector3;
  zone: 'vip' | 'normal';
  animSeed: number;
}

export interface CrowdState {
  npcs: NPCDef[];
  mesh: THREE.InstancedMesh | null;
  dirty: boolean;
}

export interface CrowdController {
  getState(): CrowdState;
  triggerReaction(intensity: number, type: 'applause' | 'gasp' | 'whisper'): void;
  update(dt: number, cueBallPos: THREE.Vector3): void;
  dispose(): void;
}

export function createCrowdController(scene: THREE.Scene): CrowdController {
  const npcs: NPCDef[] = [];
  const dummy = new THREE.Object3D();

  let mesh: THREE.InstancedMesh | null = null;

  function buildCrowd(): void {
    const geo = new THREE.CylinderGeometry(4, 5, 14, 6);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a1a0a,
      roughness: 0.8,
      metalness: 0.1,
    });
    mesh = new THREE.InstancedMesh(geo, mat, NPC_COUNT);
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    const positions = generateSeatingPositions(NPC_COUNT);

    for (let i = 0; i < NPC_COUNT; i++) {
      const pos = positions[i];
      npcs.push({
        id: i,
        seatPos: pos,
        zone: i < 8 ? 'vip' : 'normal',
        animSeed: Math.random() * 100,
      });

      dummy.position.copy(pos);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  }

  function generateSeatingPositions(count: number): THREE.Vector3[] {
    const positions: THREE.Vector3[] = [];
    const tableRadius = 80;
    const angleStep = (Math.PI * 2) / count;

    for (let i = 0; i < count; i++) {
      const angle = angleStep * i + Math.random() * 0.3;
      const dist = 160 + Math.random() * 90;
      const spreadX = (Math.random() - 0.5) * 40;
      const spreadZ = (Math.random() - 0.5) * 40;

      positions.push(
        new THREE.Vector3(
          Math.cos(angle) * dist + spreadX - 0,
          0,
          Math.sin(angle) * dist + spreadZ,
        ),
      );
    }
    return positions;
  }

  buildCrowd();

  const reactionTimers: Map<number, number> = new Map();

  return {
    getState: () => ({ npcs, mesh, dirty: false }),

    triggerReaction: (intensity: number, type: 'applause' | 'gasp' | 'whisper') => {
      if (!mesh) return;

      const fraction = THREE.MathUtils.clamp(
        intensity * (REACTION_SUBSET_MAX - REACTION_SUBSET_MIN) + REACTION_SUBSET_MIN,
        REACTION_SUBSET_MIN,
        REACTION_SUBSET_MAX,
      );
      const subsetSize = Math.floor(NPC_COUNT * fraction);

      const shuffled = [...npcs].sort(() => Math.random() - 0.5);
      const reacting = shuffled.slice(0, subsetSize);

      const now = performance.now();
      for (const npc of reacting) {
        reactionTimers.set(npc.id, now + 400 + intensity * 600);
      }
    },

    update: (dt: number, cueBallPos: THREE.Vector3) => {
      if (!mesh) return;

      const now = performance.now();

      for (let i = 0; i < npcs.length; i++) {
        const npc = npcs[i];
        mesh.getMatrixAt(i, dummy.matrix);
        dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

        const reactionEnd = reactionTimers.get(npc.id);
        const isReacting = reactionEnd !== undefined && now < reactionEnd;

        if (isReacting) {
          const phase = (now * 0.003 + npc.animSeed) % (Math.PI * 2);
          const lean = Math.sin(phase) * 0.08;
          dummy.rotation.x = lean * 0.3;
          dummy.rotation.z = Math.cos(phase * 0.7) * 0.05;
        } else {
          const idlePhase = now * 0.0008 + npc.animSeed;
          const idleRotX = Math.sin(idlePhase) * 0.02;
          const idleRotZ = Math.cos(idlePhase * 0.6) * 0.015;

          const dx = cueBallPos.x - npc.seatPos.x;
          const dz = cueBallPos.z - npc.seatPos.z;
          const headAngle = Math.atan2(dx, dz);
          dummy.rotation.y = headAngle;

          dummy.rotation.x = idleRotX;
          dummy.rotation.z = idleRotZ;
        }

        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
    },

    dispose: () => {
      if (mesh) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        } else {
          mesh.material.dispose();
        }
        mesh = null;
      }
    },
  };
}
