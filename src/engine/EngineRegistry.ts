import type { RenderService } from '../renderer/RenderService';
import type { SceneHandle } from '../renderer/scene/setupScene';
import type { GameEventBus } from '../game/events/GameEventBus';
import type { CasinoLayer } from '../renderer/casino/CasinoLayer';
import type { CasinoDecorationsHandle } from '../renderer/casino/casinoDecorations';

// ─────────────────────────────────────────────────────────────────
//  ENGINE REGISTRY — central identity tracker for all subsystems
//
//  Guarantees:
//  • Every system has a unique ID
//  • Duplicate registration is detected and rejected
//  • All tracked disposables are cleaned on teardown
//  • Pipeline slot keys are deduplicated
// ─────────────────────────────────────────────────────────────────

export type Disposable = { dispose(): void };

export interface TrackedSystem {
  id: string;
  disposable?: Disposable;
  registeredAt: number;
}

export interface TrackedPipeline {
  key: string;
  cleanup: () => void;
  registeredAt: number;
}

class EngineRegistryImpl {
  /** All registered system instances keyed by unique ID. */
  readonly systems = new Map<string, TrackedSystem>();

  /** All registered pipeline slot keys — prevents double-registration. */
  readonly pipelines = new Map<string, TrackedPipeline>();

  /** Event bus subscriptions tracked for cleanup. */
  readonly eventCleanups: Array<() => void> = [];

  /** Scene references tracked for teardown. */
  private _sceneHandle: SceneHandle | null = null;
  private _casino: CasinoLayer | null = null;
  private _decorations: CasinoDecorationsHandle | null = null;
  private _eventBus: GameEventBus | null = null;
  private _renderService: RenderService | null = null;

  // ── System registration ────────────────────────────────────────

  /**
   * Register a subsystem.  Returns true if registered, false if
   * duplicate (already tracked with same ID).
   */
  registerSystem(id: string, disposable?: Disposable): boolean {
    if (this.systems.has(id)) {
      if (import.meta.env.DEV) {
        console.warn(`[ENGINE] Duplicate system registration ignored: "${id}"`);
      }
      return false;
    }
    this.systems.set(id, {
      id,
      disposable,
      registeredAt: performance.now(),
    });
    return true;
  }

  /** Check if a system is already registered. */
  hasSystem(id: string): boolean {
    return this.systems.has(id);
  }

  /** Unregister and dispose a specific system by ID. */
  unregisterSystem(id: string): void {
    const sys = this.systems.get(id);
    if (!sys) return;
    try { sys.disposable?.dispose(); } catch { /* best-effort */ }
    this.systems.delete(id);
  }

  // ── Pipeline deduplication ─────────────────────────────────────

  /**
   * Register a pipeline slot exactly once.
   * If key already exists, the call is a no-op and returns the
   * existing cleanup function.
   */
  registerPipeline(
    rs: RenderService,
    key: string,
    stage: import('../renderer/types').PipelineStage,
    slot: import('../renderer/types').PipelineSlot,
  ): () => void {
    if (this.pipelines.has(key)) {
      if (import.meta.env.DEV) {
        console.warn(`[ENGINE] Duplicate pipeline registration ignored: "${key}"`);
      }
      return this.pipelines.get(key)!.cleanup;
    }

    const cleanup = rs.addPipelineSlot(stage, slot);
    this.pipelines.set(key, { key, cleanup, registeredAt: performance.now() });
    return () => {
      cleanup();
      this.pipelines.delete(key);
    };
  }

  /** Remove all pipeline slots. */
  clearPipelines(): void {
    for (const [, entry] of this.pipelines) {
      try { entry.cleanup(); } catch { /* best-effort */ }
    }
    this.pipelines.clear();
  }

  // ── Scene handle tracking ──────────────────────────────────────

  setSceneHandle(handle: SceneHandle | null): void {
    this._sceneHandle = handle;
  }

  getSceneHandle(): SceneHandle | null {
    return this._sceneHandle;
  }

  // ── Event bus tracking ─────────────────────────────────────────

  setEventBus(bus: GameEventBus | null): void {
    this._eventBus = bus;
  }

  trackEventCleanup(fn: () => void): void {
    this.eventCleanups.push(fn);
  }

  // ── Casino subsystem tracking ──────────────────────────────────

  setCasino(casino: CasinoLayer | null): void {
    this._casino = casino;
  }

  setDecorations(decorations: CasinoDecorationsHandle | null): void {
    this._decorations = decorations;
  }

  // ── RenderService reference ────────────────────────────────────

  setRenderService(rs: RenderService | null): void {
    this._renderService = rs;
  }

  getRenderService(): RenderService | null {
    return this._renderService;
  }

  // ── Full teardown ──────────────────────────────────────────────

  /**
   * Dispose everything tracked by the registry:
   * all systems, all pipelines, all event subscriptions,
   * scene handle, casino, decorations.
   *
   * Does NOT detach the RenderService (WebGL context persists).
   */
  disposeAll(): void {
    // 1. Scene handle (includes all sub-controllers)
    if (this._sceneHandle) {
      try { this._sceneHandle.dispose?.(); } catch { /* best-effort */ }
      this._sceneHandle = null;
    }

    // 2. Casino & decorations
    if (this._casino) {
      try { this._casino.dispose(); } catch { /* best-effort */ }
      this._casino = null;
    }
    if (this._decorations) {
      try { this._decorations.dispose(); } catch { /* best-effort */ }
      this._decorations = null;
    }

    // 3. Event subscriptions
    for (const fn of this.eventCleanups) {
      try { fn(); } catch { /* best-effort */ }
    }
    this.eventCleanups.length = 0;

    // 4. Event bus
    if (this._eventBus) {
      try { this._eventBus.removeAllListeners(); } catch { /* best-effort */ }
      this._eventBus = null;
    }

    // 5. All pipeline slots
    this.clearPipelines();

    // 6. All tracked systems
    for (const [id, sys] of this.systems) {
      try { sys.disposable?.dispose(); } catch { /* best-effort */ }
    }
    this.systems.clear();
  }

  // ── Debug diagnostics ──────────────────────────────────────────

  /** Log a snapshot of all tracked registrations. */
  debugSnapshot(): void {
    if (!import.meta.env.DEV) return;
    console.group('[ENGINE] Registry snapshot');
    console.log('Systems:', [...this.systems.keys()]);
    console.log('Pipelines:', [...this.pipelines.keys()]);
    console.log('Event cleanups:', this.eventCleanups.length);
    console.log('Scene handle:', !!this._sceneHandle);
    console.log('Casino:', !!this._casino);
    console.groupEnd();
  }
}

/** Singleton registry — survives HMR via module-level instance. */
export const EngineRegistry = new EngineRegistryImpl();
