import { RenderService } from '../renderer/RenderService';
import { EngineRegistry } from './EngineRegistry';
import { resetOnReadyGuard } from '../hooks/useThreeRenderer';

// ─────────────────────────────────────────────────────────────────
//  ENGINE BOOTSTRAP — HMR-safe, idempotent initialization
//
//  Flow:
//    1. Global guard check  → prevent double bootstrap
//    2. Create engine core  → RenderService singleton
//    3. Register systems    → via EngineRegistry (dedup-safe)
//    4. Attach pipeline     → via EngineRegistry (dedup-safe)
//    5. Start render loop   → RenderService.start()
//
//  On HMR dispose:
//    1. Tear down all tracked systems
//    2. Clear all pipeline slots
//    3. Reset global guard
//    4. Preserve WebGL context (RenderService singleton persists)
// ─────────────────────────────────────────────────────────────────

let _bootstrapFired = false;

/**
 * Bootstrap the 3D engine exactly once per page lifecycle.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 * On HMR, the dispose handler tears down everything so the next
 * module evaluation re-bootstraps cleanly.
 */
export function bootstrapEngine(): RenderService {
  // ── Step 1: Global guard ──────────────────────────────────────
  if (window.__ENGINE_BOOTSTRAPPED__ && _bootstrapFired) {
    return RenderService.getInstance();
  }

  // ── Step 2: Create engine core ────────────────────────────────
  const rs = RenderService.getInstance();
  EngineRegistry.setRenderService(rs);

  // ── Step 3: Mark bootstrapped ─────────────────────────────────
  _bootstrapFired = true;
  window.__ENGINE_BOOTSTRAPPED__ = true;

  if (import.meta.env.DEV) {
    console.log('[ENGINE] Bootstrap complete');
  }

  // ── Step 4: Wire HMR dispose ──────────────────────────────────
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      if (import.meta.env.DEV) {
        console.log('[ENGINE] HMR dispose — tearing down subsystems');
      }

      // Tear down everything the registry tracks
      EngineRegistry.disposeAll();

      // Stop the render loop (WebGL context survives)
      rs.stop();

      // Clear all pipeline slots and pending changes
      rs.clearPipelines();

      // Reset the onReady guard so next mount fires onReady again
      resetOnReadyGuard();

      // Reset global guard so next module evaluation re-bootstraps
      window.__ENGINE_BOOTSTRAPPED__ = false;
      _bootstrapFired = false;
    });
  }

  return rs;
}

/**
 * Teardown the engine completely.
 * Called by HMR dispose or manual cleanup.
 */
export function teardownEngine(): void {
  EngineRegistry.disposeAll();
  const rs = RenderService.getInstance();
  rs.stop();
  window.__ENGINE_BOOTSTRAPPED__ = false;
  _bootstrapFired = false;

  if (import.meta.env.DEV) {
    console.log('[ENGINE] Teardown complete');
  }
}
