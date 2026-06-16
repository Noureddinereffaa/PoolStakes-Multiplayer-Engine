import * as THREE from 'three';
import { RenderService } from '../RenderService';
import { SceneGroup } from '../types';
import { LightController } from '../lights/createLightRig';

// ═════════════════════════════════════════════════════════════════
//  PBR SHADER — GGX microfacet + clearcoat layer
//  Replaces the ball ShaderMaterial with production-quality PBR.
// ═════════════════════════════════════════════════════════════════

const pbrVert = `
  attribute float ballIndex;
  varying vec2 vAtlasUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    float tileX = mod(ballIndex, 4.0);
    float tileY = floor(ballIndex / 4.0);
    vAtlasUv = vec2(
      (tileX + uv.x) / 4.0,
      (tileY + uv.y) / 4.0
    );

    vec4 wp = instanceMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vNormal = normalize((instanceMatrix * vec4(normal, 0.0)).xyz);

    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const pbrFrag = `
  precision highp float;

  uniform sampler2D ballAtlas;

  uniform vec3 uKeyDir;
  uniform vec3 uKeyColor;
  uniform float uKeyIntensity;
  uniform vec3 uFillDir;
  uniform vec3 uFillColor;
  uniform float uFillIntensity;
  uniform vec3 uRimDir;
  uniform vec3 uRimColor;
  uniform float uRimIntensity;
  uniform vec3 uAmbSky;
  uniform vec3 uAmbGround;
  uniform float uAmbIntensity;

  uniform float uRoughness;
  uniform float uMetalness;
  uniform float uClearcoat;
  uniform float uClearcoatRoughness;

  varying vec2 vAtlasUv;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  // ── PBR helpers ───────────────────────────────────────────

  float D_GGX(float NdotH, float a) {
    float a2 = a * a;
    float f = NdotH * NdotH * (a2 - 1.0) + 1.0;
    return a2 / (3.14159265 * f * f);
  }

  float G1(float NdotV, float a) {
    float a2 = a * a;
    float NdotV2 = NdotV * NdotV;
    return 2.0 / (1.0 + sqrt(1.0 + a2 * (1.0 - NdotV2) / max(NdotV2, 1e-6)));
  }

  float G_Smith(float NdotL, float NdotV, float a) {
    return G1(NdotL, a) * G1(NdotV, a);
  }

  vec3 F_Schlick(vec3 f0, float cosTheta) {
    return f0 + (1.0 - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
  }

  // ── Main ──────────────────────────────────────────────────

  void main() {
    vec4 texel = texture2D(ballAtlas, vAtlasUv);
    vec3 baseColor = texel.rgb;

    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float NdotV = max(dot(N, V), 1e-4);

    vec3 F0 = mix(vec3(0.04), baseColor, uMetalness);

    // Structure: surfaces lights[3]
    vec3 lightDirs[3];
    lightDirs[0] = normalize(uKeyDir);
    lightDirs[1] = normalize(uFillDir);
    lightDirs[2] = normalize(uRimDir);

    vec3 lightCols[3];
    lightCols[0] = uKeyColor * uKeyIntensity;
    lightCols[1] = uFillColor * uFillIntensity;
    lightCols[2] = uRimColor * uRimIntensity;

    // Cue ball roughness bump (index 0 is always white)
    // We detect by baseColor luminance — purely white → higher roughness
    float lum = dot(baseColor, vec3(0.299, 0.587, 0.114));
    float roughness = lum > 0.95 ? max(uRoughness, 0.15) : uRoughness;
    float a = max(roughness * roughness, 1e-4);
    float ac = max(uClearcoatRoughness * uClearcoatRoughness, 1e-4);

    vec3 finalColor = vec3(0.0);

    for (int i = 0; i < 3; i++) {
      vec3 L = lightDirs[i];
      vec3 H = normalize(L + V);

      float NdotL = max(dot(N, L), 1e-4);
      float NdotH = max(dot(N, H), 1e-4);
      float VdotH = max(dot(V, H), 1e-4);

      // ---- Base layer ----
      // Diffuse (Lambert)
      vec3 diffuse = (1.0 - F0) * (1.0 - uMetalness) * baseColor / 3.14159265;
      // Specular (GGX)
      float D = D_GGX(NdotH, a);
      float G = G_Smith(NdotL, NdotV, a);
      vec3 F = F_Schlick(F0, VdotH);
      vec3 specular = D * G * F / max(4.0 * NdotL * NdotV, 1e-4);

      // ---- Clearcoat layer ----
      float Dc = D_GGX(NdotH, ac);
      float Gc = G_Smith(NdotL, NdotV, ac);
      vec3 Fc = F_Schlick(vec3(0.04), VdotH);
      vec3 clearcoat = uClearcoat * Dc * Gc * Fc / max(4.0 * NdotL * NdotV, 1e-4);

      // Attenuate base by clearcoat Fresnel (angle-dependent darkening)
      float clearcoatAtten = 1.0 - uClearcoat * Fc.r;
      vec3 BRDF = clearcoatAtten * (diffuse + specular) + clearcoat;
      finalColor += BRDF * lightCols[i] * NdotL;
    }

    // Ambient hemisphere
    float hemiWeight = N.y * 0.5 + 0.5;
    vec3 ambient = mix(uAmbGround, uAmbSky, hemiWeight) * uAmbIntensity * baseColor;
    finalColor += ambient;

    // Contact ground darkening — balls feel anchored to the felt
    // ballBottom = ball center (Y=10 on table) minus radius
    float elevation = max(vWorldPos.y - 10.0, 0.0);
    float contact = 1.0 - smoothstep(0.0, 2.0, elevation);
    finalColor *= 1.0 - contact * 0.12;

    // Output linear (renderer handles tone map + color space)
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// ═════════════════════════════════════════════════════════════════
//  PUBLIC API
// ═════════════════════════════════════════════════════════════════

export interface BallUniformUpdater {
  /** Sync shader uniforms with current light states. Call each frame. */
  sync(controller: LightController): void;
  /** Get the PBR material for direct access. */
  getMaterial(): THREE.ShaderMaterial;
}

/**
 * Replace the ball InstancedMesh material with a PBR GGX + clearcoat
 * shader that reads from the texture atlas and uses the 3-light rig.
 *
 * Must be called AFTER createBalls().
 */
export function applyMaterialOverrides(rs: RenderService): BallUniformUpdater | null {
  const group = rs.getSceneGroup(SceneGroup.Balls);
  if (!group) return null;

  // Find the InstancedMesh
  let mesh: THREE.InstancedMesh | null = null;
  for (const child of group.children) {
    if (child instanceof THREE.InstancedMesh && child.name === 'Balls') {
      mesh = child;
      break;
    }
  }
  if (!mesh) return null;

  // Find existing atlas texture from current material
  const oldMat = mesh.material as THREE.ShaderMaterial | THREE.MeshPhysicalMaterial | null;
  let atlasTexture: THREE.Texture | null = null;
  if (oldMat instanceof THREE.ShaderMaterial) {
    const val = oldMat.uniforms?.ballAtlas?.value;
    if (val instanceof THREE.Texture) atlasTexture = val;
  }

  // Create uniforms
  const uniforms: Record<string, THREE.IUniform> = {
    ballAtlas: { value: atlasTexture },
    uKeyDir: { value: new THREE.Vector3(0.46, 0.79, 0.33) },
    uKeyColor: { value: new THREE.Color(0xfff3e0) },
    uKeyIntensity: { value: 1.6 },
    uFillDir: { value: new THREE.Vector3(-0.77, 0.64, -0.51) },
    uFillColor: { value: new THREE.Color(0xcfe8ff) },
    uFillIntensity: { value: 0.5 },
    uRimDir: { value: new THREE.Vector3(0, 0.707, -0.707) },
    uRimColor: { value: new THREE.Color(0xffffff) },
    uRimIntensity: { value: 0.35 },
    uAmbSky: { value: new THREE.Color(0xdde6f2) },
    uAmbGround: { value: new THREE.Color(0x7a5c3e) },
    uAmbIntensity: { value: 0.35 },
    uRoughness: { value: 0.12 },
    uMetalness: { value: 0.0 },
    uClearcoat: { value: 0.35 },
    uClearcoatRoughness: { value: 0.25 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: pbrVert,
    fragmentShader: pbrFrag,
    side: THREE.DoubleSide,
  });

  // Replace material
  const oldMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  mesh.material = mat;
  oldMats.forEach((m) => m.dispose());

  // Enable shadow casting with a depth material compatible with InstancedMesh
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  const depthMat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
  });
  mesh.customDepthMaterial = depthMat;

  const updater: BallUniformUpdater = {
    sync: (controller: LightController) => {
      uniforms.uKeyDir.value.copy(controller.key.direction);
      uniforms.uKeyColor.value.copy(controller.key.color);
      uniforms.uKeyIntensity.value = controller.key.intensity;
      uniforms.uFillDir.value.copy(controller.fill.direction);
      uniforms.uFillColor.value.copy(controller.fill.color);
      uniforms.uFillIntensity.value = controller.fill.intensity;
      uniforms.uRimDir.value.copy(controller.rim.direction);
      uniforms.uRimColor.value.copy(controller.rim.color);
      uniforms.uRimIntensity.value = controller.rim.intensity;
      uniforms.uAmbSky.value.copy(controller.ambient.sky);
      uniforms.uAmbGround.value.copy(controller.ambient.ground);
      uniforms.uAmbIntensity.value = controller.ambient.intensity;
    },
    getMaterial: () => mat,
  };

  return updater;
}
