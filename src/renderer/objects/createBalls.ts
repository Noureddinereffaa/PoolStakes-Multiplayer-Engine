import * as THREE from 'three';
import { RenderService } from '../RenderService';
import { SceneGroup } from '../types';

// ═════════════════════════════════════════════════════════════════
//  BALL DATA
// ═════════════════════════════════════════════════════════════════

const BALL_R = 10;
const BALL_COUNT = 16;

const SOLID_COLORS = [
  '#FFD700', // 1 yellow
  '#0055FF', // 2 blue
  '#FF0000', // 3 red
  '#800080', // 4 purple
  '#FF8C00', // 5 orange
  '#228B22', // 6 green
  '#800000', // 7 maroon
];

const STRIPE_COLORS = [
  '#FFD700', // 9  yellow
  '#0055FF', // 10 blue
  '#FF0000', // 11 red
  '#800080', // 12 purple
  '#FF8C00', // 13 orange
  '#228B22', // 14 green
  '#800000', // 15 maroon
];

type BallType = 'cue' | 'solid' | 'eight' | 'stripe';

const BALL_TYPES: BallType[] = [
  'cue',   // 0
  'solid', 'solid', 'solid', 'solid', 'solid', 'solid', 'solid', // 1-7
  'eight', // 8
  'stripe', 'stripe', 'stripe', 'stripe', 'stripe', 'stripe', 'stripe', // 9-15
];

const BALL_COLORS: string[] = [
  '#FFFFFF', // 0 cue
  ...SOLID_COLORS, // 1-7
  '#111111', // 8 black
  ...STRIPE_COLORS, // 9-15
];

// ═════════════════════════════════════════════════════════════════
//  TEXTURE ATLAS
// ═════════════════════════════════════════════════════════════════

const TILE_SIZE = 64;
const GRID = 4;
const ATLAS_SIZE = TILE_SIZE * GRID; // 256

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function createBallAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d')!;

  for (let i = 0; i < BALL_COUNT; i++) {
    const tileX = i % GRID;
    const tileY = Math.floor(i / GRID);
    const px = tileX * TILE_SIZE;
    const py = tileY * TILE_SIZE;
    const type = BALL_TYPES[i];
    const color = BALL_COLORS[i];
    const [cr, cg, cb] = hexToRgb(color);

    // White base (for stripes)
    if (type === 'stripe') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

      // Colored stripe: horizontal band covering mid 40% of tile
      // On a sphere UV, v≈0.3–0.7 maps to equatorial band
      ctx.fillStyle = color;
      ctx.fillRect(px, py + TILE_SIZE * 0.3, TILE_SIZE, TILE_SIZE * 0.4);
    } else {
      // Solid fill
      ctx.fillStyle = color;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }

    // Cue ball: subtle shiny spot
    if (type === 'cue') {
      const gradient = ctx.createRadialGradient(
        px + TILE_SIZE * 0.32, py + TILE_SIZE * 0.3, 1,
        px + TILE_SIZE * 0.32, py + TILE_SIZE * 0.3, TILE_SIZE * 0.3,
      );
      gradient.addColorStop(0, 'rgba(255,255,255,0.6)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    }

    // 8-ball: white equatorial band
    if (type === 'eight') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(px, py + TILE_SIZE * 0.3, TILE_SIZE, TILE_SIZE * 0.1);
    }

    // Specular highlight on all balls
    const shade = ctx.createRadialGradient(
      px + TILE_SIZE * 0.28, py + TILE_SIZE * 0.25, 1,
      px + TILE_SIZE * 0.28, py + TILE_SIZE * 0.25, TILE_SIZE * 0.18,
    );
    shade.addColorStop(0, 'rgba(255,255,255,0.35)');
    shade.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shade;
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

    // Dark edge at bottom for depth illusion
    const edge = ctx.createRadialGradient(
      px + TILE_SIZE * 0.5, py + TILE_SIZE * 0.85, 1,
      px + TILE_SIZE * 0.5, py + TILE_SIZE * 0.85, TILE_SIZE * 0.25,
    );
    edge.addColorStop(0, 'rgba(0,0,0,0.15)');
    edge.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = edge;
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

// ═════════════════════════════════════════════════════════════════
//  SHADER MATERIAL
// ═════════════════════════════════════════════════════════════════

const atlasTexture = createBallAtlas();

/** Dispose the module-level atlas texture (call on full teardown). */
export function disposeBallAtlas(): void {
  atlasTexture.dispose();
}

const ballVertexShader = `
  attribute float ballIndex;
  varying vec2 vAtlasUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;

  void main() {
    float tileX = mod(ballIndex, 4.0);
    float tileY = floor(ballIndex / 4.0);
    vec2 tileUv = vec2(
      (tileX + uv.x) / 4.0,
      (tileY + uv.y) / 4.0
    );
    vAtlasUv = tileUv;

    vec4 worldPos = instanceMatrix * vec4(position, 1.0);
    vec4 mvPos = modelViewMatrix * worldPos;
    vViewPos = -mvPos.xyz;
    vNormal = normalize((instanceMatrix * vec4(normal, 0.0)).xyz);

    gl_Position = projectionMatrix * mvPos;
  }
`;

const ballFragmentShader = `
  uniform sampler2D ballAtlas;
  uniform vec3 uAmbient;
  uniform vec3 uLightDir;
  uniform vec3 uLightColor;
  uniform float uShininess;

  varying vec2 vAtlasUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;

  void main() {
    vec4 tex = texture2D(ballAtlas, vAtlasUv);
    vec3 N = normalize(vNormal);
    vec3 L = normalize(uLightDir);
    vec3 V = normalize(vViewPos);

    // Diffuse
    float diff = max(dot(N, -L), 0.0);

    // Specular (Blinn-Phong)
    vec3 H = normalize(-L + V);
    float spec = pow(max(dot(N, H), 0.0), uShininess);

    // Ambient + diffuse + specular
    vec3 color = tex.rgb * (uAmbient + diff * uLightColor) + spec * uLightColor * 0.5;

    // Fresnel-like rim darkening
    float rim = 1.0 - max(dot(N, V), 0.0);
    color *= 0.85 + 0.15 * rim;

    gl_FragColor = vec4(color, 1.0);
  }
`;

function createBallMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ballAtlas: { value: atlasTexture },
      uAmbient: { value: new THREE.Color(0x333333) },
      uLightDir: { value: new THREE.Vector3(0.3, -0.8, 0.5).normalize() },
      uLightColor: { value: new THREE.Color(0xffffff) },
      uShininess: { value: 64.0 },
    },
    vertexShader: ballVertexShader,
    fragmentShader: ballFragmentShader,
    side: THREE.DoubleSide,
  });
}

// ═════════════════════════════════════════════════════════════════
//  REUSABLE TEMPS (zero allocs per frame)
// ═════════════════════════════════════════════════════════════════

const _matrix = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quat = new THREE.Quaternion();

// ═════════════════════════════════════════════════════════════════
//  BALL SYSTEM CONTROLLER
// ═════════════════════════════════════════════════════════════════

export interface SnapshotBall {
  id: number;
  x: number;
  y: number;
  isPocketed: boolean;
}

export interface BallSystemController {
  /** Update ball positions from a physics snapshot (center-origin). */
  update(snapshot: SnapshotBall[], alpha?: number): void;
  /** Show/hide the ghost ball. */
  showGhost(visible: boolean): void;
  /** Position the ghost ball at a 3D point. */
  setGhostPosition(x: number, y: number, z: number): void;
  /** Get the underlying InstancedMesh (for debug or advanced use). */
  getMesh(): THREE.InstancedMesh;
  /** Get the ghost ball mesh. */
  getGhostMesh(): THREE.Mesh;
  /** Tear down and dispose. */
  dispose(): void;
}

// ═════════════════════════════════════════════════════════════════
//  PUBLIC BUILDER
// ═════════════════════════════════════════════════════════════════

/**
 * Create the 16-ball InstancedMesh system inside the RenderService's
 * BallGroup.  Returns a controller for per-frame updates.
 */
export function createBalls(rs: RenderService): BallSystemController {
  const group = rs.getSceneGroup(SceneGroup.Balls);
  if (!group) {
    throw new Error('BallGroup not found in scene');
  }

  // ── Geometry ───────────────────────────────────────────────
  const geo = new THREE.SphereGeometry(BALL_R, 32, 32);

  // ── Material ───────────────────────────────────────────────
  const mat = createBallMaterial();

  // ── InstancedMesh ──────────────────────────────────────────
  const mesh = new THREE.InstancedMesh(geo, mat, BALL_COUNT);
  mesh.name = 'Balls';

  // Per-instance ball index attribute for UV atlas lookup
  const indices = new Float32Array(BALL_COUNT);
  for (let i = 0; i < BALL_COUNT; i++) indices[i] = i;
  mesh.geometry.setAttribute(
    'ballIndex',
    new THREE.InstancedBufferAttribute(indices, 1),
  );
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // Initial positions (off-screen, updated on first frame)
  for (let i = 0; i < BALL_COUNT; i++) {
    _matrix.identity();
    mesh.setMatrixAt(i, _matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);

  // ── Ghost Ball ─────────────────────────────────────────────
  const ghostMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.3,
    roughness: 0.2,
    metalness: 0,
    clearcoat: 0.5,
    depthWrite: false,
  });
  const ghostGeo = new THREE.SphereGeometry(BALL_R * 1.02, 24, 24);
  const ghostMesh = new THREE.Mesh(ghostGeo, ghostMat);
  ghostMesh.name = 'GhostBall';
  ghostMesh.visible = false;
  ghostMesh.position.set(0, BALL_R, 0);
  group.add(ghostMesh);

  // ── Controller ─────────────────────────────────────────────
  const update = (snapshot: SnapshotBall[], alpha = 1): void => {
    for (const ball of snapshot) {
      if (ball.id < 0 || ball.id >= BALL_COUNT) continue;
      const pocketed = ball.isPocketed;

      const tx = ball.x - 400;
      const tz = ball.y - 200;

      if (pocketed) {
        _scale.set(0, 0, 0);
      } else {
        _scale.set(1, 1, 1);
      }
      _pos.set(tx, BALL_R, tz);
      _quat.identity();
      _matrix.compose(_pos, _quat, _scale);
      mesh.setMatrixAt(ball.id, _matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  const controller: BallSystemController = {
    update,
    showGhost: (visible: boolean) => {
      ghostMesh.visible = visible;
    },
    setGhostPosition: (x: number, y: number, z: number) => {
      ghostMesh.position.set(x, y, z);
    },
    getMesh: () => mesh,
    getGhostMesh: () => ghostMesh,
    dispose: () => {
      group.remove(mesh);
      group.remove(ghostMesh);
      geo.dispose();
      mat.dispose();
      ghostGeo.dispose();
      ghostMat.dispose();
    },
  };

  return controller;
}

// ═════════════════════════════════════════════════════════════════
//  DEBUG HELPERS
// ═════════════════════════════════════════════════════════════════

export function createBallDebugOverlay(
  rs: RenderService,
  controller: BallSystemController,
): () => void {
  const group = rs.getSceneGroup(SceneGroup.Debug);
  if (!group) return () => {};

  const labelGroup = new THREE.Group();
  labelGroup.name = 'BallDebugLabels';
  group.add(labelGroup);

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 20px monospace';
  ctx.fillStyle = '#00ff00';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const sprites: THREE.Sprite[] = [];
  for (let i = 0; i < BALL_COUNT; i++) {
    canvas.width = 64;
    ctx.clearRect(0, 0, 64, 32);
    ctx.fillText(String(i), 32, 16);

    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(20, 10, 1);
    sprite.position.set(0, BALL_R + 15, 0);
    sprite.visible = false;
    labelGroup.add(sprite);
    sprites.push(sprite);
  }

  return () => {
    const mesh = controller.getMesh();
    const dummy = new THREE.Object3D();

    for (let i = 0; i < BALL_COUNT; i++) {
      mesh.getMatrixAt(i, _matrix);
      _matrix.decompose(_pos, _quat, _scale);
      if (_scale.x > 0.5) {
        sprites[i].position.set(_pos.x, _pos.y + 15, _pos.z);
        sprites[i].visible = true;
      } else {
        sprites[i].visible = false;
      }
    }

    // Dispose GPU resources
    group.remove(labelGroup);
    for (const sprite of sprites) {
      sprite.material.map?.dispose();
      sprite.material.dispose();
    }
  };
}
