import { useEffect, useRef, useCallback } from 'react';
import { RenderService } from '../renderer/RenderService';
import { RendererOptions, FrameTiming, PipelineCallback, SceneGroup } from '../renderer/types';

/**
 * useThreeRenderer
 *
 * Integrates the singleton RenderService with a React component's
 * lifecycle.  The renderer is attached once when the component mounts
 * and detached when it unmounts.
 *
 * The returned ref must be attached to a `<div>` (or any block-level
 * element) that the Three.js canvas will be placed into.
 *
 * ```tsx
 * function Arena() {
 *   const containerRef = useThreeRenderer();
 *   return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
 * }
 * ```
 */
export interface UseThreeRendererOptions extends Partial<RendererOptions> {
  /** Called once after the RenderService is attached and started. */
  onReady?: (service: RenderService) => void;
}

/**
 * Module-level guard: ensures onReady fires only once per page
 * lifecycle (survives React StrictMode double-mount and HMR).
 */
let _onReadyFired = false;

/** Reset the onReady guard — called by bootstrap HMR dispose. */
export function resetOnReadyGuard(): void {
  _onReadyFired = false;
}

export function useThreeRenderer(options?: UseThreeRendererOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const serviceRef = useRef<RenderService | null>(null);

  // Attach once on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const rs = RenderService.getInstance();
    serviceRef.current = rs;

    rs.attach(container, options);
    rs.start();

    // Fire onReady exactly once per page lifecycle.
    // In dev, _onReadyFired is reset by bootstrap HMR dispose,
    // so the next mount fires onReady again cleanly.
    if (!_onReadyFired) {
      _onReadyFired = true;
      queueMicrotask(() => {
        options?.onReady?.(rs);
      });
    }

    return () => {
      rs.stop();
      // We do NOT call rs.detach() here because the RenderService
      // singleton persists across hot-reloads.  detach() disposes
      // the WebGL context, which would require a full re-creation
      // on re-mount.  Instead, we only stop the loop.  The context
      // survives until the tab is closed.
    };
    // Run only once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Convenience helpers ──────────────────────────────────────

  const getService = useCallback((): RenderService | null => {
    return serviceRef.current ?? RenderService.getInstance();
  }, []);

  const getScene = useCallback(() => {
    return getService()?.getScene();
  }, [getService]);

  const getCamera = useCallback(() => {
    return getService()?.getCamera();
  }, [getService]);

  const getSceneGroup = useCallback((group: SceneGroup) => {
    return getService()?.getSceneGroup(group);
  }, [getService]);

  const setPipelineHook = useCallback(
    (stage: 'onPreRender' | 'onUpdate' | 'onPostRender', cb: PipelineCallback | null) => {
      getService()?.setPipelineHook(stage, cb);
    },
    [getService],
  );

  return {
    containerRef,
    getService,
    getScene,
    getCamera,
    getSceneGroup,
    setPipelineHook,
  };
}
