import * as THREE from 'three';
import { RenderService } from '../RenderService';
import { SceneGroup } from '../types';
import { SnapshotBall } from '../objects/createBalls';

// ═════════════════════════════════════════════════════════════════
//  CONTACT SHADOW SYSTEM
//  One InstancedMesh of soft radial-gradient circles projected onto
//  the felt (Y=0.01) — one per ball.  Single draw call.
// ═════════════════════════════════════════════════════════════════

const BALL_COUNT = 16;
const BALL_RADIUS = 10;
const SHADOW_SOFTNESS = 3.0;
const SHADOW_Y = 0.02;

const shadowVert = `
  attribute float shadowOpacity;

  varying vec2 vUv;
  varying float vFade;

  void main() {
    vUv = uv;
    vFade = shadowOpacity;

    vec4 wp = instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const shadowFrag = `
  precision highp float;

  uniform float uSoftness;

  varying vec2 vUv;
  varying float vFade;

  void main() {
    vec2 center = vUv - 0.5;
    float d = length(center) * 2.0;
    if (d > 1.0) discard;

    float shadow = exp(-d * d * uSoftness);
    float alpha = shadow * vFade;

    gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
  }
`;

// ── Reusable temp objects ───────────────────────────────────────

const _mat = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _prev = new Float32Array(BALL_COUNT * 2);
const _speed = new Float32Array(BALL_COUNT);

// ── Controller ──────────────────────────────────────────────────

export interface ContactShadowController {
  /** Call each frame with the latest ball snapshot. */
  update(snapshot: SnapshotBall[], dt: number): void;
  dispose(): void;
}

/**
 * Create 16 contact-shadow blobs (InstancedMesh, 1 draw call).
 * Each shadow is a soft radial gradient placed on the felt directly
 * under its corresponding ball.
 */
export function createContactShadowSystem(
  rs: RenderService,
): ContactShadowController {
  const group = rs.getSceneGroup(SceneGroup.Balls);
  if (!group) throw new Error('BallGroup not found');

  // ── Geometry: unit quad (circle mask in shader) ────────────
  const geo = new THREE.PlaneGeometry(1, 1);

  // ── Shader material ────────────────────────────────────────
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSoftness: { value: SHADOW_SOFTNESS },
    },
    vertexShader: shadowVert,
    fragmentShader: shadowFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.MultiplyBlending,
    side: THREE.DoubleSide,
  });

  // ── InstancedMesh ──────────────────────────────────────────
  const mesh = new THREE.InstancedMesh(geo, mat, BALL_COUNT);
  mesh.name = 'ContactShadows';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // Shadow opacity per instance
  const opacities = new Float32Array(BALL_COUNT);
  for (let i = 0; i < BALL_COUNT; i++) opacities[i] = 0;
  geo.setAttribute(
    'shadowOpacity',
    new THREE.InstancedBufferAttribute(opacities, 1),
  );

  group.add(mesh);

  // ── Update logic ───────────────────────────────────────────
  function update(snapshot: SnapshotBall[], dt: number): void {
    for (const ball of snapshot) {
      if (ball.id < 0 || ball.id >= BALL_COUNT) continue;
      const idx = ball.id;

      // Physics → Three.js coordinates
      const tx = ball.x - 400;
      const tz = ball.y - 200;

      // Speed from position delta
      const px = _prev[idx * 2];
      const py = _prev[idx * 2 + 1];
      const dx = tx - px;
      const dz = tz - py;
      const speed = dt > 0 ? Math.sqrt(dx * dx + dz * dz) / dt : 0;
      _speed[idx] = speed;
      _prev[idx * 2] = tx;
      _prev[idx * 2 + 1] = tz;

      // Shadow radius: larger when moving
      // Base = ball radius, grows with speed
      const radius = THREE.MathUtils.clamp(
        speed * 0.05 + BALL_RADIUS * 0.8,
        BALL_RADIUS * 0.8,
        BALL_RADIUS * 2.2,
      );

      // Opacity: max 0.5 on table, fades with elevation
      const height = ball.isPocketed ? 100 : Math.max(0, 0); // ball center Y - 10
      // We don't have elevation from snapshot, so just use speed+grounded
      const opacity = THREE.MathUtils.clamp(
        ball.isPocketed ? 0 : 0.5 - speed * 0.008,
        0.15,
        0.5,
      );

      // Build instance matrix
      _pos.set(tx, SHADOW_Y, tz);
      _scl.set(radius, radius, 1);
      _quat.identity();
      _mat.compose(_pos, _quat, _scl);
      mesh.setMatrixAt(idx, _mat);

      // Update opacity attribute
      opacities[idx] = opacity;
    }

    mesh.instanceMatrix.needsUpdate = true;
    geo.attributes.shadowOpacity.needsUpdate = true;
  }

  return {
    update,
    dispose: () => {
      group.remove(mesh);
      geo.dispose();
      mat.dispose();
    },
  };
}
