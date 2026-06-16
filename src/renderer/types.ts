import * as THREE from 'three';
import type { GameRenderMode } from '../game/GameRenderMode';

// ── Renderer configuration ───────────────────────────────────────

export interface RendererOptions {
  antialias: boolean;
  alpha: boolean;
  powerPreference: 'high-performance' | 'low-power';
  stencil: boolean;
  depth: boolean;
  preserveDrawingBuffer: boolean;
}

export const DEFAULT_RENDERER_OPTIONS: RendererOptions = {
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
  stencil: false,
  depth: true,
  preserveDrawingBuffer: false,
};

// ── Scene graph groups ───────────────────────────────────────────

export enum SceneGroup {
  Environment = 'EnvironmentGroup',
  Table = 'TableGroup',
  Balls = 'BallGroup',
  Cue = 'CueGroup',
  Lights = 'LightGroup',
  Camera = 'CameraGroup',
  Debug = 'DebugGroup',
}

// ── Frame timing ─────────────────────────────────────────────────

export interface FrameTiming {
  /** Raw delta from THREE.Clock (seconds), clamped */
  delta: number;
  /** Total elapsed time (seconds) */
  elapsed: number;
  /** Monotonic frame counter */
  frameId: number;
  /** Smoothed frames-per-second */
  fps: number;
}

// ── Pipeline hook signature (legacy, kept for compat) ────────────

export type PipelineCallback = (timing: FrameTiming) => void;

export interface PipelineHooks {
  onPreRender: PipelineCallback | null;
  onUpdate: PipelineCallback | null;
  onPostRender: PipelineCallback | null;
}

// ── Multi-subscriber render pipeline (new) ──────────────────────

export type PipelineStage =
  | 'simulation'
  | 'sceneSync'
  | 'effects'
  | 'camera'
  | 'postRender';

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  'simulation',
  'sceneSync',
  'effects',
  'camera',
  'postRender',
] as const;

/**
 * Each pipeline slot declares:
 * - name: unique identifier for debugging and conflict reporting
 * - priority: lower = runs earlier within the same stage
 * - modes: which GameRenderMode this slot is active in
 * - writes: list of state resource names this slot writes to
 *          (prevents dual-write conflicts)
 * - callback: the execution function
 */
export interface PipelineSlot {
  name: string;
  priority: number;
  modes: GameRenderMode[];
  writes: string[];
  callback: (timing: FrameTiming) => void;
}

// ── Pipeline execution debug ────────────────────────────────────

export interface FrameExecutionLog {
  frameId: number;
  mode: GameRenderMode;
  stages: Array<{
    stage: PipelineStage;
    slots: Array<{
      name: string;
      executed: boolean;
      durationMs: number;
      error?: string;
    }>;
  }>;
}

// ── WebGL capability report ──────────────────────────────────────

export interface CapabilityReport {
  webglVersion: 1 | 2;
  maxTextureSize: number;
  maxDrawBuffers: number;
  maxVertexAttributes: number;
  maxVaryingVectors: number;
  maxVertexUniforms: number;
  maxFragmentUniforms: number;
  maxTextureImageUnits: number;
  shaderTextureLod: boolean;
  instancedArrays: boolean;
  floatTextures: boolean;
}

// ── Context loss event ───────────────────────────────────────────

export type ContextStatus = 'ready' | 'lost' | 'restored';
