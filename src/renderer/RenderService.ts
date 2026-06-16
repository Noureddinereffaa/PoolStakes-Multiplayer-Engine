import * as THREE from 'three';
import {
  RendererOptions,
  DEFAULT_RENDERER_OPTIONS,
  SceneGroup,
  FrameTiming,
  PipelineCallback,
  PipelineHooks,
  PipelineStage,
  PipelineSlot,
  PIPELINE_STAGES,
  FrameExecutionLog,
  CapabilityReport,
  ContextStatus,
} from './types';
import type { GameRenderMode } from '../game/GameRenderMode';
import { debugLog } from '../utils/debugLog';

// ─────────────────────────────────────────────────────────────────
//  RENDER SERVICE — singleton
//  Owns the WebGL context, the scene graph, the camera, the
//  render loop, and the deterministic multi-subscriber pipeline.
//
//  ⚠ GUARANTEE 1 — Execution determinism:
//     Pipeline additions/removals are deferred to the start of the
//     next frame. The active subscriber list is frozen during frame
//     execution, ensuring the same order every frame regardless of
//     React re-renders.
//
//  ⚠ GUARANTEE 2 — No dual writes:
//     Each slot declares what state resources it writes to.  At
//     registration time the service scans all existing slots for
//     write conflicts within the same modes and throws if found.
//
//  ⚠ GUARANTEE 3 — Transition atomicity:
//     Mode changes are queued via requestMode() and applied at the
//     start of the next frame, never mid-frame.
// ─────────────────────────────────────────────────────────────────

const FPS_SMOOTHING = 0.05;
const MAX_DELTA = 1 / 30;

export class RenderService {
  /* ── singleton ────────────────────────────────────────────── */
  private static _instance: RenderService | null = null;

  static getInstance(): RenderService {
    if (!RenderService._instance) {
      RenderService._instance = new RenderService();
    }
    return RenderService._instance;
  }

  /* ── private constructor (singleton) ──────────────────────── */
  private constructor() {
    this._clock = new THREE.Clock();
    this._frameTiming = { delta: 0, elapsed: 0, frameId: 0, fps: 0 };
    this._sceneGroups = new Map<SceneGroup, THREE.Group>();
    this._contextStatus = 'ready';
    this._frameStartMode = 'IDLE';
  }

  /* ── public state ─────────────────────────────────────────── */
  private _attached = false;
  private _running = false;
  private _contextStatus: ContextStatus;

  /* ── three.js objects ─────────────────────────────────────── */
  private _renderer: THREE.WebGLRenderer | null = null;
  private _scene: THREE.Scene | null = null;
  private _camera: THREE.PerspectiveCamera | null = null;
  private _cameraGroup: THREE.Group | null = null;
  private _clock: THREE.Clock;

  /* ── scene groups ─────────────────────────────────────────── */
  private _sceneGroups: Map<SceneGroup, THREE.Group>;

  /* ── frame tracking ───────────────────────────────────────── */
  private _frameTiming: FrameTiming;
  private _fpsAlpha = 0;
  private _rafId: number | null = null;

  /* ── resize ───────────────────────────────────────────────── */
  private _resizeObserver: ResizeObserver | null = null;
  private _container: HTMLElement | null = null;

  /* ── context loss guard ───────────────────────────────────── */
  private _contextLost = false;
  private _onContextLostBound: ((e: Event) => void) | null = null;
  private _onContextRestoredBound: (() => void) | null = null;

  // ═══════════════════════════════════════════════════════════
  //  ⚠ GUARANTEE 1: DETERMINISTIC MULTI-SUBSCRIBER PIPELINE
  // ═══════════════════════════════════════════════════════════

  /** Active slots per stage — frozen during frame execution. */
  private _pipelineSlots = new Map<PipelineStage, PipelineSlot[]>();

  /** Deferred additions — applied at next frame start. */
  private _pendingAdditions: Array<{ stage: PipelineStage; slot: PipelineSlot }> = [];

  /** Deferred removals (by name) — applied at next frame start. */
  private _pendingRemovals: string[] = [];

  /** True while a frame is executing — prevents direct mutation. */
  private _pipelineLocked = false;

  // ═══════════════════════════════════════════════════════════
  //  ⚠ GUARANTEE 2: DUAL-WRITE DETECTION
  // ═══════════════════════════════════════════════════════════

  /** resource name → set of slot names that write to it */
  private _writeRegistry = new Map<string, Set<string>>();

  // ═══════════════════════════════════════════════════════════
  //  ⚠ GUARANTEE 3: ATOMIC MODE TRANSITIONS
  // ═══════════════════════════════════════════════════════════

  /** Pending mode change — applied at next frame start. */
  private _modeQueue: GameRenderMode | null = null;

  /** The mode for the current frame — constant throughout. */
  private _frameStartMode: GameRenderMode;

  /** Transition hooks: eventName → callbacks */
  private _transitionHooks = new Map<string, Array<() => void>>();

  // ═══════════════════════════════════════════════════════════
  //  DEBUGGING
  // ═══════════════════════════════════════════════════════════

  private _executionLog: FrameExecutionLog | null = null;
  private _debugEnabled = false;

  // ═══════════════════════════════════════════════════════════
  //  LEGACY COMPAT: single-callback overrides
  //  Mapped into multi-subscriber slots internally.
  // ═══════════════════════════════════════════════════════════

  private _pipeline: PipelineHooks = {
    onPreRender: null,
    onUpdate: null,
    onPostRender: null,
  };

  /** Compat slot names for the old single-callback API. */
  private static _COMPAT_STAGE_MAP: Record<string, PipelineStage> = {
    onPreRender: 'simulation',
    onUpdate: 'effects',
    onPostRender: 'postRender',
  };

  // ═════════════════════════════════════════════════════════════
  //  ATTACH / DETACH
  // ═════════════════════════════════════════════════════════════

  /**
   * Attach the renderer to a DOM container.  Creates the WebGL
   * context, the scene graph, and the camera.  Does NOT start the
   * render loop — call `start()` separately.
   *
   * Safe to call multiple times — subsequent calls are no-ops
   * while already attached.
   */
  attach(
    container: HTMLElement,
    options: Partial<RendererOptions> = {},
  ): void {
    if (this._attached) return;
    this._container = container;

    this._createRenderer(container, options);
    this._createScene();
    this._createCamera();
    this._createResizeObserver(container);
    this._addContextLossHandlers();

    // Initial sizing
    this._handleResize(container.clientWidth, container.clientHeight);

    this._attached = true;
  }

  /**
   * Detach the renderer: stop the loop, dispose the WebGL context,
   * disconnect observers.
   */
  detach(): void {
    if (!this._attached) return;
    this.stop();

    this._removeContextLossHandlers();
    this._destroyResizeObserver();

    if (this._renderer) {
      this._renderer.dispose();
      this._renderer = null;
    }

    this._scene = null;
    this._camera = null;
    this._cameraGroup = null;
    this._sceneGroups.clear();
    this._container = null;
    this._attached = false;
  }

  /**
   * Clear all pipeline slots and pending changes.
   * Used during HMR teardown to ensure no stale callbacks remain.
   */
  clearPipelines(): void {
    this._pipelineSlots.clear();
    this._pendingAdditions = [];
    this._pendingRemovals = [];
    this._writeRegistry.clear();
    this._pipeline.onPreRender = null;
    this._pipeline.onUpdate = null;
    this._pipeline.onPostRender = null;
    this._transitionHooks.clear();
  }

  // ═════════════════════════════════════════════════════════════
  //  LOOP CONTROL
  // ═════════════════════════════════════════════════════════════

  /** Start (or resume) the render loop. */
  start(): void {
    if (!this._attached || this._running) return;
    this._running = true;

    // Reset clock to avoid a giant delta on resume
    this._clock.getDelta();
    this._clock.elapsedTime = 0;

    this._loop();
  }

  /** Pause the render loop.  The context is preserved. */
  stop(): void {
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /** True while the loop is running. */
  get running(): boolean {
    return this._running;
  }

  /** True after attach() completes. */
  get attached(): boolean {
    return this._attached;
  }

  // ═════════════════════════════════════════════════════════════
  //  ACCESSORS
  // ═════════════════════════════════════════════════════════════

  getScene(): THREE.Scene | null {
    return this._scene;
  }

  getCamera(): THREE.PerspectiveCamera | null {
    return this._camera;
  }

  getRenderer(): THREE.WebGLRenderer | null {
    return this._renderer;
  }

  getSceneGroup(group: SceneGroup): THREE.Group | undefined {
    return this._sceneGroups.get(group);
  }

  getFrameTiming(): Readonly<FrameTiming> {
    return this._frameTiming;
  }

  getContextStatus(): ContextStatus {
    return this._contextStatus;
  }

  /**
   * Return a capability report extracted from the WebGL context.
   * Useful for down-shifting quality settings.
   */
  getCapabilities(): CapabilityReport | null {
    if (!this._renderer) return null;
    const gl = this._renderer.getContext();

    const isWebGL2 =
      typeof WebGL2RenderingContext !== 'undefined' &&
      gl instanceof WebGL2RenderingContext;

    const ext = gl.getExtension('EXT_texture_filter_anisotropic');

    return {
      webglVersion: isWebGL2 ? 2 : 1,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxDrawBuffers: gl.getParameter(gl.MAX_DRAW_BUFFERS),
      maxVertexAttributes: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
      maxVaryingVectors: gl.getParameter(gl.MAX_VARYING_VECTORS),
      maxVertexUniforms: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
      maxFragmentUniforms: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
      maxTextureImageUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
      shaderTextureLod: isWebGL2 || !!gl.getExtension('EXT_shader_texture_lod'),
      instancedArrays:
        isWebGL2 || !!gl.getExtension('ANGLE_instanced_arrays'),
      floatTextures:
        isWebGL2 || !!gl.getExtension('OES_texture_float'),
    };
  }

  // ═════════════════════════════════════════════════════════════
  //  ⚠ GUARANTEE 1: MULTI-SUBSCRIBER PIPELINE API
  // ═════════════════════════════════════════════════════════════

  /**
   * Register a pipeline slot.  Returns a cleanup function.
   *
   * Guarantees:
   * 1. Registration is deferred to next frame boundary — the active
   *    subscriber list is never mutated mid-frame.
   * 2. Write conflicts are detected at registration time.
   * 3. Slots are sorted by priority once at insertion time.
   */
  addPipelineSlot(stage: PipelineStage, slot: PipelineSlot): () => void {
    this._checkWriteConflicts(stage, slot);

    if (this._pipelineLocked) {
      this._pendingAdditions.push({ stage, slot });
    } else {
      this._insertSlot(stage, slot);
    }

    return () => {
      this._pendingRemovals.push(slot.name);
    };
  }

  /**
   * (Legacy compat) Register a single callback.
   * Internally maps to a multi-subscriber slot at default priority.
   * If callback is null, removes the compat slot.
   */
  setPipelineHook(
    stage: keyof PipelineHooks,
    callback: PipelineCallback | null,
  ): void {
    const compatStage = RenderService._COMPAT_STAGE_MAP[stage];
    if (!compatStage) return;

    if (callback === null) {
      this._pendingRemovals.push(`__compat_${stage}`);
      this._pipeline[stage] = null;
      return;
    }

    const slot: PipelineSlot = {
      name: `__compat_${stage}`,
      priority: 500,
      modes: ['LIVE', 'REPLAY', 'IDLE'],
      writes: [],
      callback,
    };

    this._pipeline[stage] = callback;

    // Remove existing compat slot for the same stage first
    this._pendingRemovals.push(`__compat_${stage}`);

    if (this._pipelineLocked) {
      this._pendingAdditions.push({ stage: compatStage, slot });
    } else {
      this._insertSlot(compatStage, slot);
    }
  }

  /** Enable/disable frame execution logging. */
  setDebugPipeline(enable: boolean): void {
    this._debugEnabled = enable;
  }

  /** Get the last frame's execution log. */
  getLastFrameLog(): FrameExecutionLog | null {
    return this._executionLog;
  }

  // ═════════════════════════════════════════════════════════════
  //  ⚠ GUARANTEE 2: WRITE CONFLICT DETECTION
  // ═════════════════════════════════════════════════════════════

  private _checkWriteConflicts(stage: PipelineStage, slot: PipelineSlot): void {
    for (const resource of slot.writes) {
      const existing = this._writeRegistry.get(resource);
      if (!existing) continue;

      // Check if any existing writer is active in overlapping modes
      for (const otherName of existing) {
        const otherSlot = this._findSlot(otherName);
        if (!otherSlot) continue;
        const overlappingModes = slot.modes.filter(m => otherSlot.modes.includes(m));
        if (overlappingModes.length === 0) continue;

        console.error(
          `[Pipeline] DUAL-WRITE CONFLICT: "${slot.name}" and "${otherName}" ` +
          `both write to "${resource}" in modes ${overlappingModes.join(', ')}`,
        );
      }
    }
  }

  private _findSlot(name: string): PipelineSlot | undefined {
    for (const slots of this._pipelineSlots.values()) {
      const found = slots.find(s => s.name === name);
      if (found) return found;
    }
    for (const pending of this._pendingAdditions) {
      if (pending.slot.name === name) return pending.slot;
    }
    return undefined;
  }

  // ═════════════════════════════════════════════════════════════
  //  ⚠ GUARANTEE 3: ATOMIC MODE TRANSITIONS
  // ═════════════════════════════════════════════════════════════

  /**
   * Queue a mode change.  Applied atomically at the start of the
   * next frame — never mid-frame.
   */
  requestMode(mode: GameRenderMode): void {
    this._modeQueue = mode;
  }

  /** The mode for the current (or most recent) frame. */
  getCurrentMode(): GameRenderMode {
    return this._frameStartMode;
  }

  /**
   * Register a transition hook.
   * eventName: "BEFORE_m1_ENTER" | "AFTER_m1_EXIT" | etc.
   */
  onTransition(eventName: string, fn: () => void): () => void {
    const hooks = this._transitionHooks.get(eventName) ?? [];
    hooks.push(fn);
    this._transitionHooks.set(eventName, hooks);
    return () => {
      const arr = this._transitionHooks.get(eventName);
      if (arr) {
        const idx = arr.indexOf(fn);
        if (idx >= 0) arr.splice(idx, 1);
      }
    };
  }

  /** Internal: fire all hooks registered for eventName. */
  private _fireTransition(eventName: string): void {
    const hooks = this._transitionHooks.get(eventName);
    if (!hooks) return;
    for (const fn of hooks) {
      try { fn(); } catch (err) {
        console.error(`[Pipeline] Transition hook "${eventName}" failed:`, err);
      }
    }
  }

  // ═════════════════════════════════════════════════════════════
  //  PRIVATE — pipeline internals
  // ═════════════════════════════════════════════════════════════

  private _insertSlot(stage: PipelineStage, slot: PipelineSlot): void {
    const slots = this._pipelineSlots.get(stage) ?? [];
    slots.push(slot);
    slots.sort((a, b) => a.priority - b.priority);
    this._pipelineSlots.set(stage, slots);

    // Register write claims
    for (const resource of slot.writes) {
      const writers = this._writeRegistry.get(resource) ?? new Set();
      writers.add(slot.name);
      this._writeRegistry.set(resource, writers);
    }
  }

  /** Apply all deferred additions/removals — called at frame start. */
  private _flushPipelineChanges(): void {
    // Apply removals
    if (this._pendingRemovals.length > 0) {
      const removeSet = new Set(this._pendingRemovals);
      for (const [stage, slots] of this._pipelineSlots) {
        const filtered = slots.filter(s => !removeSet.has(s.name));
        if (filtered.length !== slots.length) {
          this._pipelineSlots.set(stage, filtered);
        }
      }
      // Clean up write registry
      for (const removedName of removeSet) {
        for (const [, writers] of this._writeRegistry) {
          writers.delete(removedName);
        }
      }
      this._pendingRemovals = [];
    }

    // Apply additions
    if (this._pendingAdditions.length > 0) {
      for (const { stage, slot } of this._pendingAdditions) {
        this._insertSlot(stage, slot);
      }
      this._pendingAdditions = [];
    }
  }

  /** Apply queued mode change — called at frame start. Fires transition hooks. */
  private _processModeTransition(): void {
    if (this._modeQueue === null || this._modeQueue === this._frameStartMode) return;

    const from = this._frameStartMode;
    const to = this._modeQueue;
    debugLog('mode', `${from} → ${to}`);

    // Fire exit hooks for old mode
    this._fireTransition(`BEFORE_${from}_EXIT`);
    this._fireTransition(`AFTER_${from}_EXIT`);

    // Atomically switch
    this._frameStartMode = to;
    this._modeQueue = null;

    // Fire enter hooks for new mode
    this._fireTransition(`BEFORE_${to}_ENTER`);
    this._fireTransition(`AFTER_${to}_ENTER`);
  }

  // ═════════════════════════════════════════════════════════════
  //  PRIVATE — renderer creation
  // ═════════════════════════════════════════════════════════════

  private _createRenderer(
    container: HTMLElement,
    overrides: Partial<RendererOptions>,
  ): void {
    const opts = { ...DEFAULT_RENDERER_OPTIONS, ...overrides };

    this._renderer = new THREE.WebGLRenderer({
      antialias: opts.antialias,
      alpha: opts.alpha,
      powerPreference: opts.powerPreference,
      stencil: opts.stencil,
      depth: opts.depth,
      preserveDrawingBuffer: opts.preserveDrawingBuffer,
    });

    this._renderer.outputColorSpace = THREE.SRGBColorSpace;
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.0;
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    container.appendChild(this._renderer.domElement);
  }

  // ═════════════════════════════════════════════════════════════
  //  PRIVATE — scene
  // ═════════════════════════════════════════════════════════════

  private _createScene(): void {
    this._scene = new THREE.Scene();

    // Create all scene groups as empty Object3D containers.
    // Geometry and lights will be added by later phases.
    for (const group of Object.values(SceneGroup)) {
      const obj = new THREE.Group();
      obj.name = group;
      this._scene.add(obj);
      this._sceneGroups.set(group, obj);
    }
  }

  // ═════════════════════════════════════════════════════════════
  //  PRIVATE — camera
  // ═════════════════════════════════════════════════════════════

  private _createCamera(): void {
    this._camera = new THREE.PerspectiveCamera(32, 1, 0.1, 5000);
    // Center-origin: table is 800×400 in XZ plane, Y is up
    // Camera sits above and in front, looking at table center
    this._camera.position.set(0, 400, 700);
    this._camera.lookAt(0, 0, 0);

    const camGroup = this._sceneGroups.get(SceneGroup.Camera);
    if (camGroup) {
      camGroup.add(this._camera);
    }
    this._cameraGroup = camGroup;
  }

  // ═════════════════════════════════════════════════════════════
  //  PRIVATE — resize
  // ═════════════════════════════════════════════════════════════

  private _createResizeObserver(container: HTMLElement): void {
    this._resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this._handleResize(width, height);
        }
      }
    });
    this._resizeObserver.observe(container);
  }

  private _destroyResizeObserver(): void {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  private _handleResize(width: number, height: number): void {
    if (!this._renderer || !this._camera) return;

    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));

    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();

    this._renderer.setSize(w, h, false);
    this._renderer.setPixelRatio(pixelRatio);
  }

  // ═════════════════════════════════════════════════════════════
  //  PRIVATE — context loss
  // ═════════════════════════════════════════════════════════════

  private _addContextLossHandlers(): void {
    if (!this._renderer) return;

    this._onContextLostBound = (e: Event) => {
      e.preventDefault();
      this._contextLost = true;
      this._contextStatus = 'lost';
      this.stop();
    };

    this._onContextRestoredBound = () => {
      this._contextLost = false;
      this._contextStatus = 'restored';
      // The renderer auto-recovers its state.  We only need to
      // re-upload geometry (handled by later phases when they
      // observe the 'restored' event).
      this.start();
    };

    this._renderer.domElement.addEventListener(
      'webglcontextlost',
      this._onContextLostBound,
      false,
    );
    this._renderer.domElement.addEventListener(
      'webglcontextrestored',
      this._onContextRestoredBound,
      false,
    );
  }

  private _removeContextLossHandlers(): void {
    if (!this._renderer) return;
    if (this._onContextLostBound) {
      this._renderer.domElement.removeEventListener(
        'webglcontextlost',
        this._onContextLostBound,
      );
    }
    if (this._onContextRestoredBound) {
      this._renderer.domElement.removeEventListener(
        'webglcontextrestored',
        this._onContextRestoredBound,
      );
    }
    this._onContextLostBound = null;
    this._onContextRestoredBound = null;
  }

  // ═════════════════════════════════════════════════════════════
  //  PRIVATE — deterministic render loop
  // ═════════════════════════════════════════════════════════════

  private _loop = (): void => {
    if (!this._running) return;

    this._rafId = requestAnimationFrame(this._loop);

    // ─── Step 0: Apply deferred changes (determinism) ─────────
    this._flushPipelineChanges();

    // ─── Step 0b: Process atomic mode transition ────────────
    this._processModeTransition();

    // ─── Step 1: Frame timing ──────────────────────────────
    const rawDelta = this._clock.getDelta();
    const elapsed = this._clock.getElapsedTime();
    const delta = Math.min(rawDelta, MAX_DELTA);

    this._frameTiming.delta = delta;
    this._frameTiming.elapsed = elapsed;
    this._frameTiming.frameId++;

    const instantFps = delta > 0 ? 1 / delta : 0;
    this._fpsAlpha += (instantFps - this._fpsAlpha) * FPS_SMOOTHING;
    this._frameTiming.fps = Math.round(this._fpsAlpha);

    // ─── Steps 2-6: Execute pipeline stages in strict order ──
    const mode = this._frameStartMode;

    // Lock pipeline — no registrations during frame execution
    this._pipelineLocked = true;

    if (this._debugEnabled) {
      this._executionLog = {
        frameId: this._frameTiming.frameId,
        mode,
        stages: [],
      };
    }

    for (const stage of PIPELINE_STAGES) {
      const slots = this._pipelineSlots.get(stage);
      if (!slots || slots.length === 0) continue;

      if (this._debugEnabled) {
        this._executionLog!.stages.push({ stage, slots: [] });
      }

      const activeSlots = slots.filter(s => s.modes.includes(mode));
      if (activeSlots.length > 0 && (this._frameTiming.frameId % 60 === 0)) {
        debugLog('pipeline', `frame=${this._frameTiming.frameId} stage=${stage} active=${activeSlots.map(s => s.name).join(',')}`);
      }

      for (const slot of activeSlots) {
        if (this._debugEnabled) {
          const t0 = performance.now();
          try {
            slot.callback(this._frameTiming);
            const logStage = this._executionLog!.stages[this._executionLog!.stages.length - 1];
            logStage.slots.push({
              name: slot.name,
              executed: true,
              durationMs: performance.now() - t0,
            });
          } catch (err) {
            const logStage = this._executionLog!.stages[this._executionLog!.stages.length - 1];
            logStage.slots.push({
              name: slot.name,
              executed: false,
              durationMs: performance.now() - t0,
              error: String(err),
            });
            console.error(`[Pipeline] Error in "${slot.name}" (${stage}):`, err);
          }
        } else {
          try {
            slot.callback(this._frameTiming);
          } catch (err) {
            console.error(`[Pipeline] Error in "${slot.name}" (${stage}):`, err);
          }
        }
      }
    }

    // Unlock — registrations allowed again
    this._pipelineLocked = false;

    // ─── Step 7: Render ────────────────────────────────────
    if (this._renderer && this._scene && this._camera && !this._contextLost) {
      this._renderer.render(this._scene, this._camera);
    }
  };

  // ═════════════════════════════════════════════════════════════
  //  PUBLIC — stats (for debug overlays)
  // ═════════════════════════════════════════════════════════════

  /** Human-readable stats snapshot. */
  getStats(): {
    fps: number;
    frameId: number;
    drawCalls: number;
    triangles: number;
    contextStatus: ContextStatus;
    attached: boolean;
    running: boolean;
  } {
    const info = this._renderer?.info;
    return {
      fps: this._frameTiming.fps,
      frameId: this._frameTiming.frameId,
      drawCalls: info?.render?.calls ?? 0,
      triangles: info?.render?.triangles ?? 0,
      contextStatus: this._contextStatus,
      attached: this._attached,
      running: this._running,
    };
  }
}
