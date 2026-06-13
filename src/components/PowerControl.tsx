import React, { useState, useRef, useCallback } from 'react';

interface PowerControlProps {
  isVisible: boolean;
  disabled: boolean;
  onPowerChange: (power: number) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  onShoot?: () => void;
  mode?: 'mobile' | 'desktop';
}

const MIN_POWER = 0;
const MAX_DRAG_PX = 110;

function dragToPower(dragUpPx: number): number {
  const t = Math.max(0, Math.min(1, dragUpPx / MAX_DRAG_PX));
  return Math.round(t * 100);
}

function powerFromY(clientY: number, el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  const pct = ((rect.bottom - clientY) / rect.height) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function powerColors(pct: number): { thumb: string; glow: string; fill: string } {
  if (pct > 70) return { thumb: 'from-rose-500 to-red-600', glow: 'rgba(239,68,68,0.6)', fill: '#e11d48' };
  if (pct > 30) return { thumb: 'from-amber-400 to-orange-500', glow: 'rgba(245,158,11,0.6)', fill: '#d97706' };
  return { thumb: 'from-emerald-400 to-green-500', glow: 'rgba(52,211,153,0.6)', fill: '#059669' };
}

export default function PowerControl({
  isVisible, disabled, onPowerChange, onDragStateChange, onShoot, mode = 'mobile',
}: PowerControlProps) {
  const [power, setPower] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const powerRef = useRef(0);
  const firedRef = useRef(false);
  const zoneRef = useRef<HTMLDivElement>(null);
  const isDesktop = mode === 'desktop';

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return;
    firedRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    startYRef.current = e.clientY;
    isDraggingRef.current = true;
    setIsDragging(true);
    if (isDesktop) {
      if (zoneRef.current) {
        const p = powerFromY(e.clientY, zoneRef.current);
        powerRef.current = p;
        setPower(p);
        onPowerChange(p);
      }
    } else {
      setPower(0);
      powerRef.current = 0;
      onPowerChange(0);
    }
    onDragStateChange?.(true);
  }, [disabled, onPowerChange, onDragStateChange, isDesktop]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const deltaY = startYRef.current - e.clientY;
    const newPower = dragToPower(deltaY);
    powerRef.current = newPower;
    setPower(newPower);
    onPowerChange(newPower);
  }, [onPowerChange]);

  const handlePointerUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    onDragStateChange?.(false);
    if (isDesktop) return;
    const p = powerRef.current;
    if (!firedRef.current && p > 0) {
      firedRef.current = true;
      onShoot?.();
      setPower(0);
      powerRef.current = 0;
      onPowerChange(0);
    } else {
      setPower(0);
      powerRef.current = 0;
      onPowerChange(0);
    }
  }, [onShoot, onPowerChange, onDragStateChange, isDesktop]);

  const showMinWarning = isDragging && power > 0 && power < MIN_POWER;

  if (!isVisible) return null;

  return (
    <div
      ref={zoneRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`relative h-full w-[60px] flex flex-col items-center justify-center select-none touch-none transition-opacity duration-200 ${disabled ? 'opacity-25 pointer-events-none' : ''}`}
      style={{ touchAction: 'none' }}
    >
      {/* Premium power panel */}
      <div className="flex-1 w-full mx-1 rounded-2xl bg-gradient-to-b from-[#2a1508] via-[#1a0a04] to-[#0d0501] border border-[#3a1a0a]/80 relative overflow-hidden"
        style={{ boxShadow: 'inset 0 1px 0 rgba(180,120,60,0.08), -4px 0 16px rgba(0,0,0,0.6)' }}
      >
        {/* Power track */}
        <div className="absolute inset-y-3 inset-x-1">
          {/* Track groove */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-b from-[#0a0502] via-[#1a0a04] to-[#0a0502]"
            style={{ boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.9), inset 0 -1px 3px rgba(180,120,60,0.12)' }}
          >
            <div className="absolute inset-y-2 inset-x-0.5 rounded-full bg-black/40" />
          </div>

          {/* Minimum power threshold marker (mobile only) */}
          {!isDesktop && (
            <div
              className="absolute left-0 right-0 z-10 pointer-events-none"
              style={{ bottom: `${MIN_POWER}%`, height: 1 }}
            >
              <div className={`h-full w-full transition-opacity duration-300 ${showMinWarning ? 'bg-red-400 opacity-80' : 'bg-amber-500/20'}`} />
            </div>
          )}

          {/* Power fill glow */}
          {power > 0 && (
            <div
              className="absolute left-1/2 -translate-x-1/2 bottom-0 w-3 rounded-full transition-none"
              style={{
                height: `${Math.max(0, power)}%`,
                marginBottom: 2,
                background: `linear-gradient(to top, ${powerColors(power).glow}, transparent)`,
                boxShadow: `0 0 14px ${powerColors(power).glow}`,
              }}
            />
          )}

          {/* Center rail */}
          <div className="absolute left-1/2 -translate-x-1/2 top-3 bottom-3 w-[2.5px] rounded-full bg-gradient-to-b from-amber-300/10 via-amber-500/40 to-amber-300/10"
            style={{ boxShadow: '0 0 3px rgba(180,120,60,0.25)' }}
          />

          {/* Power fill bar */}
          <div
            className="absolute left-1/2 -translate-x-1/2 bottom-0 w-2.5 rounded-full transition-none overflow-hidden"
            style={{
              height: `${Math.max(0, power)}%`,
              marginBottom: 2,
            }}
          >
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `linear-gradient(to top, ${powerColors(power).fill}, ${powerColors(power).fill}dd)`,
              }}
            />
          </div>

          {/* Thumb indicator */}
          <div
            className="absolute left-1/2 -translate-x-1/2 pointer-events-none z-10"
            style={{ bottom: `${Math.max(0, power)}%`, marginBottom: -14, transition: isDragging ? 'none' : 'bottom 0.3s ease' }}
          >
            <div
              className={`w-7 h-7 rounded-full bg-gradient-to-br ${powerColors(power).thumb} border-2 ${
                power > 70 ? 'border-red-300' : power > 30 ? 'border-amber-300' : 'border-emerald-300'
              }`}
              style={{
                boxShadow: isDragging
                  ? `0 0 24px ${powerColors(power).glow}, 0 3px 10px rgba(0,0,0,0.6), inset 0 1.5px 0 rgba(255,255,255,0.3)`
                  : `0 0 10px ${powerColors(power).glow}, 0 2px 6px rgba(0,0,0,0.5), inset 0 1.5px 0 rgba(255,255,255,0.2)`,
              }}
            >
              <div className="absolute inset-[3px] rounded-full bg-white/15" />
              <span className="absolute inset-0 flex items-center justify-center text-[7px] font-black font-mono text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                {power}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Labels */}
      {isDragging ? (
        <span className="mt-1 text-[7px] font-mono font-bold text-amber-400 tracking-wider leading-tight text-center">
          POWER{'\n'}{power}%
        </span>
      ) : (
        <span className="mt-1 text-[6px] font-mono font-bold text-amber-600/50 tracking-[0.15em] uppercase leading-tight text-center">
          {isDesktop ? '' : 'DRAG\nUP'}
        </span>
      )}
    </div>
  );
}
