import { useRef, useEffect, useCallback } from 'react';
import { Ball } from '../../types';

export interface PointerInteractionOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isMyTurn: boolean;
  isAnimating: boolean;
  isScratchPlacing: boolean;
  scratchRestriction: 'anywhere' | 'behind_head_string' | undefined;
  cueBall: Ball | undefined;
  aimAngle: number;
  shotPower: number;
  spinX: number;
  spinY: number;
  isAimLocked: boolean;
  onAimUpdate: (angle: number) => void;
  onPowerUpdate: (power: number) => void;
  onScratchPlacement: (x: number, y: number) => void;
  onShoot: (angle: number, power: number, spinX: number, spinY: number) => void;
  onAimingChange: (aiming: boolean) => void;
}

export function usePointerInteraction(options: PointerInteractionOptions) {
  const {
    canvasRef, isMyTurn, isAnimating, isScratchPlacing, scratchRestriction,
    cueBall, isAimLocked, onAimUpdate, onPowerUpdate, onScratchPlacement,
    onShoot, onAimingChange,
  } = options;

  const isPointerActiveRef = useRef(false);
  const pullStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isPullingRef = useRef(false);
  const shotPowerRef = useRef(40);
  const aimAngleRef = useRef(0);
  const spinXRef = useRef(0);
  const spinYRef = useRef(0);
  const isMyTurnRef = useRef(isMyTurn);
  const isAnimatingRef = useRef(isAnimating);
  const isScratchPlacingRef = useRef(isScratchPlacing);
  const scratchRestrictionRef = useRef(scratchRestriction);
  const cueBallRef = useRef(cueBall);

  useEffect(() => {
    isMyTurnRef.current = isMyTurn;
    isAnimatingRef.current = isAnimating;
    isScratchPlacingRef.current = isScratchPlacing;
    scratchRestrictionRef.current = scratchRestriction;
    cueBallRef.current = cueBall;
  }, [isMyTurn, isAnimating, isScratchPlacing, scratchRestriction, cueBall]);

  const HEAD_STRING_LINE = 220;

  const getPointerCoords = useCallback((e: any): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    let clientXRaw = 0;
    let clientYRaw = 0;
    if (e.touches && e.touches.length > 0) {
      clientXRaw = e.touches[0].clientX;
      clientYRaw = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      clientXRaw = e.changedTouches[0].clientX;
      clientYRaw = e.changedTouches[0].clientY;
    } else {
      clientXRaw = e.clientX;
      clientYRaw = e.clientY;
    }
    return {
      x: ((clientXRaw - rect.left) / rect.width) * 800,
      y: ((clientYRaw - rect.top) / rect.height) * 400,
    };
  }, [canvasRef]);

  const executeAuthorizedShot = useCallback((angle: number, power: number, sX: number, sY: number) => {
    onShoot(angle, power, sX, sY);
  }, [onShoot]);

  const handlePointerAction = useCallback((e: any, isInitialDown = false) => {
    if (isAnimatingRef.current) return;
    const coords = getPointerCoords(e);
    if (!coords) return;

    if (isScratchPlacingRef.current) {
      const maxXAllowed = scratchRestrictionRef.current === 'behind_head_string' ? HEAD_STRING_LINE - 10 : 765;
      onScratchPlacement(
        Math.max(35, Math.min(coords.x, maxXAllowed)),
        Math.max(35, Math.min(coords.y, 365)),
      );
      return;
    }

    const cb = cueBallRef.current;
    if (isMyTurnRef.current && cb && !cb.isPocketed) {
      if (isInitialDown) {
        pullStartPosRef.current = coords;
        isPullingRef.current = true;
        onAimingChange(true);
        if (!isAimLocked) {
          const dx = cb.x - coords.x;
          const dy = cb.y - coords.y;
          if (Math.hypot(dx, dy) > 3) {
            onAimUpdate(Math.atan2(-dy, -dx));
          }
        }
      } else if (pullStartPosRef.current) {
        const baseDx = pullStartPosRef.current.x - cb.x;
        const baseDy = pullStartPosRef.current.y - cb.y;
        const baseLen = Math.hypot(baseDx, baseDy) || 1;
        const baseCos = baseDx / baseLen;
        const baseSin = baseDy / baseLen;

        const moveDx = coords.x - pullStartPosRef.current.x;
        const moveDy = coords.y - pullStartPosRef.current.y;

        // Power = dragging downward on screen (positive Y = toward user)
        const projectionPull = moveDy;

        const rawPower = Math.max(0, projectionPull) / 120 * 100;
        const calculatedPower = Math.min(100, Math.max(5, Math.round(rawPower)));
        onPowerUpdate(calculatedPower);
        shotPowerRef.current = calculatedPower;

        if (!isAimLocked) {
          const totalDx = cb.x - coords.x;
          const totalDy = cb.y - coords.y;
          if (Math.hypot(totalDx, totalDy) > 5) {
            const dragAngle = Math.atan2(baseSin, baseCos);
            const orthogonal = -moveDx * baseSin + moveDy * baseCos;
            const sensitivity = 0.0030 * Math.exp(-calculatedPower * 0.018);
            const angleAdjust = orthogonal * sensitivity;
            let finalAngle = dragAngle + angleAdjust;
            while (finalAngle > Math.PI) finalAngle -= Math.PI * 2;
            while (finalAngle < -Math.PI) finalAngle += Math.PI * 2;
            onAimUpdate(finalAngle);
            aimAngleRef.current = finalAngle;
          }
        }
      } else {
        if (!isAimLocked) {
          const dx = cb.x - coords.x;
          const dy = cb.y - coords.y;
          if (Math.hypot(dx, dy) > 3) {
            onAimUpdate(Math.atan2(-dy, -dx));
          }
        }
      }
    }
  }, [getPointerCoords, isAimLocked, onAimUpdate, onPowerUpdate, onScratchPlacement, onAimingChange]);

  const handlePointerDown = useCallback((e: any) => {
    if (isAnimatingRef.current) return;
    isPointerActiveRef.current = true;
    handlePointerAction(e, true);
  }, [handlePointerAction]);

  const handlePointerMove = useCallback((e: any) => {
    if (isAnimatingRef.current) return;
    if (isPointerActiveRef.current) {
      handlePointerAction(e, false);
    } else {
      const cb = cueBallRef.current;
      if (isMyTurnRef.current && !isScratchPlacingRef.current && cb && !cb.isPocketed && !isAimLocked) {
        const coords = getPointerCoords(e);
        if (coords) {
          const dx = cb.x - coords.x;
          const dy = cb.y - coords.y;
          if (Math.hypot(dx, dy) > 5) {
            onAimUpdate(Math.atan2(-dy, -dx));
          }
        }
      }
    }
  }, [getPointerCoords, isAimLocked, onAimUpdate, handlePointerAction]);

  const handlePointerUp = useCallback(() => {
    isPointerActiveRef.current = false;
    onAimingChange(false);

    if (isPullingRef.current) {
      const currentPower = shotPowerRef.current;
      isPullingRef.current = false;
      pullStartPosRef.current = null;
      if (currentPower >= 10 && isMyTurnRef.current && !isAnimatingRef.current) {
        executeAuthorizedShot(aimAngleRef.current, currentPower, spinXRef.current, spinYRef.current);
      }
    }
  }, [onAimingChange, executeAuthorizedShot]);

  // Global window listeners
  useEffect(() => {
    const handleGlobalMove = (e: PointerEvent) => {
      if (isPointerActiveRef.current) {
        handlePointerAction(e, false);
      }
    };
    const handleGlobalUp = () => {
      handlePointerUp();
    };

    window.addEventListener('pointermove', handleGlobalMove);
    window.addEventListener('pointerup', handleGlobalUp);
    window.addEventListener('pointercancel', handleGlobalUp);

    return () => {
      window.removeEventListener('pointermove', handleGlobalMove);
      window.removeEventListener('pointerup', handleGlobalUp);
      window.removeEventListener('pointercancel', handleGlobalUp);
    };
  }, [handlePointerAction, handlePointerUp]);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    aimAngleRef,
    shotPowerRef,
    spinXRef,
    spinYRef,
    isPointerActiveRef,
    isPullingRef,
    pullStartPosRef,
  };
}
