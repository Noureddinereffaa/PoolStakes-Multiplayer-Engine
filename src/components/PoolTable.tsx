import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { useBilliardsRenderer } from '../hooks/useBilliardsRenderer';
import { Ball, RoomState, Difficulty } from '../types';
import { poolAudio } from '../utils/audio';
import { BallRotationData } from './PoolTable/rotation';

const haptic = (ms: number) => { try { navigator.vibrate?.(ms); } catch (_) {} };

export interface PoolTableHandle {
  spinX: number;
  spinY: number;
  shotPower: number;
  isAimLocked: boolean;
  aimAngle: number;
  setSpinX: (v: number) => void;
  setSpinY: (v: number) => void;
  setShotPower: (v: number) => void;
  setIsAimLocked: (v: boolean) => void;
  setAimAngle: (v: number | ((prev: number) => number)) => void;
  handleShoot: () => void;
  hudNotification: string | null;
}

interface PoolTableProps {
  roomState: RoomState;
  onShoot: (angle: number, power: number, spinX: number, spinY: number) => void;
  onResetCueBall: (x: number, y: number) => void;
  myPlayerId: string;
  isMyTurn: boolean;
  physicsFrames: Array<Array<{ id: number; x: number; y: number; isPocketed: boolean }>> | null;
  onClearFrames: () => void;
  opponentAim?: { angle: number; power: number; spinX?: number; spinY?: number } | null;
  onPreviewAim?: (angle: number, power: number, spinX: number, spinY: number) => void;
  onJoinAI?: (difficulty?: Difficulty) => void;
  isFineAim?: boolean;
}

const isMobileTouch = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

export default forwardRef<PoolTableHandle, PoolTableProps>(function PoolTable({
  roomState,
  onShoot,
  onResetCueBall,
  myPlayerId,
  isMyTurn,
  physicsFrames,
  onClearFrames,
  opponentAim,
  onPreviewAim,
  onJoinAI,
  isFineAim = false,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isMobile = useRef(isMobileTouch());

  const [aimAngle, setAimAngle] = useState(0);
  const [shotPower, setShotPower] = useState(0);
  const [spinX, setSpinX] = useState(0);
  const [spinY, setSpinY] = useState(0);
  const [isScratchPlacing, setIsScratchPlacing] = useState(false);
  const [placedPos, setPlacedPos] = useState({ x: 200, y: 200 });

  const [dragMode, setDragMode] = useState<'rotate' | 'pan' | 'pull' | null>(null);
  const dragModeRef = useRef<'rotate' | 'pan' | 'pull' | null>(null);

  const HEAD_STRING_LINE = 240; // Must match server HEAD_STRING_X = CUSHION + 220 = 240
  const placementErrorMessage = () => {
    if (!isScratchPlacing) return null;
    const overOtherBall = roomState.balls.some((b) => {
      if (b.id === 0 || b.isPocketed) return false;
      return Math.hypot(placedPos.x - b.x, placedPos.y - b.y) < 20.0;
    });
    const outBounds = placedPos.x < 40 || placedPos.x > 760 || placedPos.y < 40 || placedPos.y > 360;
    const behindHeadStringInvalid = roomState.ballInHandRestriction === 'behind_head_string' && placedPos.x > HEAD_STRING_LINE - 10;
    if (overOtherBall) return 'Cannot place cue ball over another ball.';
    if (outBounds) return 'Placement must remain inside the table boundaries.';
    if (behindHeadStringInvalid) return 'Head-string placement required after a break foul.';
    return null;
  };
  const isPlacementInvalid = () => Boolean(placementErrorMessage());

  const [isPulling, setIsPulling] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const isBreakShotRef = useRef(false);
  const initialAimAngleRef = useRef(0);

  const [hudNotification, setHudNotification] = useState<string | null>(null);
  const lastLogRef = useRef<string | null>(null);

  const [isAimLocked, setIsAimLocked] = useState(false);
  const isAimLockedRef = useRef(isAimLocked);
  useEffect(() => { isAimLockedRef.current = isAimLocked; }, [isAimLocked]);

  const strikeAnimRef = useRef<{
    active: boolean; power: number; startTime: number; angle: number; duration: number; hasStruck?: boolean;
  } | null>(null);

  const turnStartTimestampRef = useRef<number>(Date.now());
  const ballRotationsRef = useRef<Record<number, BallRotationData>>({});
  const impactShakeRef = useRef<number>(0);
  const feltRipplesRef = useRef<Array<{ x: number; y: number; radius: number; maxRadius: number; opacity: number; color: string }>>([]);
  const chalkParticlesRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; size: number; opacity: number; color: string }>>([]);
  const dustSpecksRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; radius: number; alpha: number; speed: number }>>([]);
  const sinkingBallsRef = useRef<Array<{ id: number; ball: Ball; progress: number; maxProgress: number; pocketX: number; pocketY: number }>>([]);

  const [animatedBalls, setAnimatedBalls] = useState<Ball[]>(roomState.balls);
  const animatedBallsRef = useRef<Ball[]>(roomState.balls);
  const [isAnimating, setIsAnimating] = useState(false);

  const aimAngleRef = useRef(aimAngle);
  const shotPowerRef = useRef(shotPower);
  const spinXRef = useRef(spinX);
  const spinYRef = useRef(spinY);
  const isMyTurnRef = useRef(isMyTurn);
  const isAnimatingRef = useRef(isAnimating);
  const isScratchPlacingRef = useRef(isScratchPlacing);
  const placedPosRef = useRef(placedPos);
  const isPullingRef = useRef(isPulling);
  const roomStateRef = useRef(roomState);
  const difficultyRef = useRef(difficulty);
  const myPlayerIdRef = useRef(myPlayerId);
  
  const isFineAimRef = useRef(isFineAim);
  useEffect(() => { isFineAimRef.current = isFineAim; }, [isFineAim]);
  
  const aimInertiaVelocityRef = useRef(0);
  const impactFlashesRef = useRef<{x: number, y: number, startTime: number}[]>([]);

  useEffect(() => { aimAngleRef.current = aimAngle; }, [aimAngle]);
  useEffect(() => { shotPowerRef.current = shotPower; }, [shotPower]);
  useEffect(() => { spinXRef.current = spinX; }, [spinX]);
  useEffect(() => { spinYRef.current = spinY; }, [spinY]);
  useEffect(() => { isMyTurnRef.current = isMyTurn; }, [isMyTurn]);
  useEffect(() => { isAnimatingRef.current = isAnimating; }, [isAnimating]);
  useEffect(() => { isScratchPlacingRef.current = isScratchPlacing; }, [isScratchPlacing]);
  useEffect(() => { placedPosRef.current = placedPos; }, [placedPos]);
  useEffect(() => { isPullingRef.current = isPulling; }, [isPulling]);
  useEffect(() => { roomStateRef.current = roomState; }, [roomState]);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);
  useEffect(() => { myPlayerIdRef.current = myPlayerId; }, [myPlayerId]);
  useEffect(() => { dragModeRef.current = dragMode; }, [dragMode]);

  useEffect(() => {
    if (!isAnimating) turnStartTimestampRef.current = Date.now();
  }, [roomState?.currentTurn, isAnimating]);

  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isMyTurn && !isAnimating && roomState.status === 'playing') {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
      }
      previewTimeoutRef.current = setTimeout(() => {
        onPreviewAim?.(aimAngle, shotPower, spinX, spinY);
      }, 16);
    }
    return () => {
      if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
    };
  }, [aimAngle, shotPower, spinX, spinY, isMyTurn, isAnimating, roomState.status, onPreviewAim]);

  useEffect(() => {
    if (roomState?.log?.length) {
      const latest = roomState.log[roomState.log.length - 1];
      if (latest !== lastLogRef.current) {
        lastLogRef.current = latest;
        if (!latest.startsWith('[Chat]')) {
          setHudNotification(latest);
          const t = setTimeout(() => setHudNotification(null), 3500);
          return () => clearTimeout(t);
        }
      }
    }
  }, [roomState?.log]);

  useEffect(() => { animatedBallsRef.current = animatedBalls; }, [animatedBalls]);

  const [waitingForSync, setWaitingForSync] = useState(false);
  const lastBallsRef = useRef<string>(JSON.stringify(roomState.balls));
  const pullStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isShiftHeldRef = useRef(false);
  const DEAD_ZONE_PX = 3; // minimum drag distance before power registers
  const AIM_SENSITIVITY = 0.0010; // radians per pixel of ortho drag — smoother
  const SHIFT_MODIFIER = 0.25; // precision mode sensitivity multiplier
  const SMOOTH_FACTOR = 0.45; // lerp factor for angle smoothing (higher = more responsive)
  const targetAimAngleRef = useRef(0);
  const DRAG_ROTATION_SENSITIVITY = 0.006; // radians per pixel for mobile drag rotation
  const dragStartXRef = useRef(0);
  const dragStartAngleRef = useRef(0);

  useEffect(() => {
    if (!isAnimating && !waitingForSync) {
      setAnimatedBalls(roomState.balls);
      lastBallsRef.current = JSON.stringify(roomState.balls);
    }
  }, [roomState.balls, isAnimating, waitingForSync]);

  useEffect(() => {
    if (waitingForSync && !isAnimating) {
      const hash = JSON.stringify(roomState.balls);
      if (hash !== lastBallsRef.current) {
        setWaitingForSync(false);
        setAnimatedBalls(roomState.balls);
        lastBallsRef.current = hash;
      }
    }
  }, [roomState.balls, isAnimating, waitingForSync]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') { isShiftHeldRef.current = true; return; }
      if (!isMyTurn || isAnimating || isScratchPlacing) return;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      const step = isShiftHeldRef.current ? 0.004 : 0.015;
      const powerStep = isShiftHeldRef.current ? 1 : 2;
      switch (e.key) {
        case 'ArrowLeft': case 'a': case 'A': e.preventDefault(); setAimAngle(p => { let n = p - step; while (n > Math.PI) n -= Math.PI * 2; while (n < -Math.PI) n += Math.PI * 2; return n; }); break;
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); setAimAngle(p => { let n = p + step; while (n > Math.PI) n -= Math.PI * 2; while (n < -Math.PI) n += Math.PI * 2; return n; }); break;
        case 'ArrowUp': case 'w': case 'W': e.preventDefault(); setShotPower(p => Math.min(100, p + powerStep)); break;
        case 'ArrowDown': case 's': case 'S': e.preventDefault(); setShotPower(p => Math.max(5, p - powerStep)); break;
        case '1': setShotPower(25); break;
        case '2': setShotPower(50); break;
        case '3': setShotPower(75); break;
        case '4': setShotPower(100); break;
        case ' ': case 'Enter': e.preventDefault(); handleShootClick(); break;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') isShiftHeldRef.current = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [isMyTurn, isAnimating, isScratchPlacing, aimAngle, shotPower, spinX, spinY, animatedBalls]);

  useEffect(() => {
    if (physicsFrames && physicsFrames.length > 0) {
      strikeAnimRef.current = { active: false, power: 0, startTime: -1, angle: 0, duration: 0, hasStruck: false };
      setIsAnimating(true);
      setWaitingForSync(true);
      let lastCheckedIntegerIdx = -1;
      const initialBallsCopy = [...roomState.balls];
      const basePlayMultiplier = physicsFrames.length > 350 ? (isMobile.current ? 3.5 : 1.95) : (isMobile.current ? 3.0 : 1.65);
      let animationFrameId: number;
      const animStartTime = performance.now();
      const STRIKE_ACCEL = isMobile.current ? 3 : 8;
      const physicsStartTime = animStartTime + STRIKE_ACCEL;
      animatedBallsRef.current = initialBallsCopy.map(b => {
        const fb = physicsFrames[0]?.find((f: any) => f.id === b.id);
        return fb ? { ...b, x: fb.x, y: fb.y, isPocketed: fb.isPocketed } : b;
      });
      setAnimatedBalls(animatedBallsRef.current);
      const animate = (now: number) => {
        if (strikeAnimRef.current && strikeAnimRef.current.active) {
          const strikeElapsed = strikeAnimRef.current.startTime !== -1 ? (performance.now() - strikeAnimRef.current.startTime) : 0;
          if (strikeElapsed < STRIKE_ACCEL && !strikeAnimRef.current.hasStruck) {
            /* cue wind-up — physics is delayed by 40ms via physicsStartTime */
          } else if (!strikeAnimRef.current.hasStruck) {
            strikeAnimRef.current.hasStruck = true;
            poolAudio.playCueHit(strikeAnimRef.current.power); haptic(30);
            isBreakShotRef.current = roomStateRef.current.balls.filter(b => b.id !== 0 && b.isPocketed).length === 0;
            triggerShootParticles(strikeAnimRef.current.power, isBreakShotRef.current);
            if (isBreakShotRef.current) {
              impactShakeRef.current = Math.min(24.0, 6.0 + (strikeAnimRef.current.power / 100) * 18.0);
              setHudNotification('💥 BREAK!');
              setTimeout(() => setHudNotification(null), 2000);
            } else {
              impactShakeRef.current = Math.min(14.0, 2.0 + (strikeAnimRef.current.power / 100) * 12.0);
            }
          }
        }
        const elapsed = Math.max(0, now - physicsStartTime);
        const targetFrameIdx = (elapsed / 16.667) * basePlayMultiplier;
        if (physicsFrames && targetFrameIdx < physicsFrames.length) {
          const indexFloor = Math.floor(targetFrameIdx);
          const indexCeil = Math.min(physicsFrames.length - 1, Math.ceil(targetFrameIdx));
          const ratio = targetFrameIdx - indexFloor;
          const frameFloor = physicsFrames[indexFloor];
          const frameCeil = physicsFrames[indexCeil];
          if (indexFloor > lastCheckedIntegerIdx) {
            for (let stepIdx = lastCheckedIntegerIdx + 1; stepIdx <= indexFloor; stepIdx++) {
              if (stepIdx === 0) continue;
              const frame = physicsFrames[stepIdx];
              const prevFrame = physicsFrames[stepIdx - 1];
              if (!frame || !prevFrame) continue;
              frame.forEach((bf) => {
                const prevBf = prevFrame.find((b) => b.id === bf.id);
                if (bf.isPocketed && prevBf && !prevBf.isPocketed) {
                  poolAudio.playPocketIn(); haptic(40);
                  const pCenters = [{ x: 22, y: 22 }, { x: 400, y: 18 }, { x: 778, y: 22 }, { x: 22, y: 378 }, { x: 400, y: 382 }, { x: 778, y: 378 }];
                  let closestP = pCenters[0]; let minDist = Infinity;
                  pCenters.forEach(p => { const d = Math.hypot(bf.x - p.x, bf.y - p.y); if (d < minDist) { minDist = d; closestP = p; } });
                  const origBall = initialBallsCopy.find(b => b.id === bf.id);
                  sinkingBallsRef.current.push({ id: bf.id, ball: origBall ? { ...origBall, x: bf.x, y: bf.y } : { ...bf, color: '#34d399', type: 'solid', radius: 10 } as any, progress: 0, maxProgress: 40, pocketX: closestP.x, pocketY: closestP.y });
                  feltRipplesRef.current.push({ x: bf.x, y: bf.y, radius: 5, maxRadius: 36, opacity: 0.9, color: 'rgba(52, 211, 153, 0.6)' });
                  const ballColor = origBall?.color || '#34d399';
                  for (let k = 0; k < 15; k++) chalkParticlesRef.current.push({ x: bf.x, y: bf.y, vx: (Math.random() - 0.5) * 4.5 + (closestP.x - bf.x) * 0.1, vy: (Math.random() - 0.5) * 4.5 + (closestP.y - bf.y) * 0.1, size: Math.random() * 2.8 + 0.8, opacity: 0.90, color: ballColor });
                }
              });
              for (let i = 0; i < frame.length; i++) {
                const b1 = frame[i]; if (b1.isPocketed) continue;
                for (let j = i + 1; j < frame.length; j++) {
                  const b2 = frame[j]; if (b2.isPocketed) continue;
                  const dx = b1.x - b2.x, dy = b1.y - b2.y;
                  if (dx * dx + dy * dy <= 405) {
                    const prevB1 = prevFrame.find((b) => b.id === b1.id);
                    const prevB2 = prevFrame.find((b) => b.id === b2.id);
                    if (prevB1 && prevB2) {
                      const pdx = prevB1.x - prevB2.x, pdy = prevB1.y - prevB2.y;
                      if (pdx * pdx + pdy * pdy > 405) {
                        const speed1 = Math.sqrt((b1.x - prevB1.x) ** 2 + (b1.y - prevB1.y) ** 2);
                        const speed2 = Math.sqrt((b2.x - prevB2.x) ** 2 + (b2.y - prevB2.y) ** 2);
                        const totalSpeed = speed1 + speed2;
                        poolAudio.playBallCollision(Math.max(0.15, totalSpeed)); haptic(Math.min(20, Math.floor(5 + totalSpeed * 8)));
                        if (totalSpeed > 0.8) impactShakeRef.current = Math.min(10.0, impactShakeRef.current + totalSpeed * 1.65);
                        if (totalSpeed > 0.2) impactFlashesRef.current.push({ x: (b1.x + b2.x) / 2, y: (b1.y + b2.y) / 2, startTime: performance.now() });
                        feltRipplesRef.current.push({ x: (b1.x + b2.x) / 2, y: (b1.y + b2.y) / 2, radius: 3, maxRadius: Math.min(26, 11 + totalSpeed * 6), opacity: Math.min(0.75, 0.22 + totalSpeed * 0.12), color: 'rgba(255, 255, 255, 0.45)' });
                        const contactX = (b1.x + b2.x) / 2, contactY = (b1.y + b2.y) / 2;
                        const partCount = Math.min(12, Math.floor(4 + totalSpeed * 1.8));
                        for (let k = 0; k < partCount; k++) chalkParticlesRef.current.push({ x: contactX, y: contactY, vx: (Math.random() - 0.5) * (totalSpeed * 0.4 + 1.2), vy: (Math.random() - 0.5) * (totalSpeed * 0.4 + 1.2), size: Math.random() * 1.6 + 0.5, opacity: 0.8, color: 'rgba(254, 240, 138, 0.75)' });
                      }
                    }
                  }
                }
              }
              frame.forEach((bf) => {
                const prevBf = prevFrame.find((b) => b.id === bf.id);
                if (!prevBf || bf.isPocketed) return;
                const dx = bf.x - prevBf.x, dy = bf.y - prevBf.y;
                const speed = Math.hypot(dx, dy);
                if (speed > 0.1) {
                  const minX = 30, maxX = 770, minY = 30, maxY = 370;
                  let hitCushion = false;
                  if ((bf.x <= minX + 0.05 && prevBf.x > minX + 0.05) || (bf.x >= maxX - 0.05 && prevBf.x < maxX - 0.05)) hitCushion = true;
                  if ((bf.y <= minY + 0.05 && prevBf.y > minY + 0.05) || (bf.y >= maxY - 0.05 && prevBf.y < maxY - 0.05)) hitCushion = true;
                  if (hitCushion) {
                    poolAudio.playCushionHit(speed); haptic(Math.min(15, Math.floor(3 + speed * 6)));
                    if (speed > 0.4) impactShakeRef.current = Math.min(8.0, impactShakeRef.current + speed * 1.5);
                    let contactX = bf.x, contactY = bf.y;
                    if (bf.x < minX + 1.0) contactX = 20; else if (bf.x > maxX - 1.0) contactX = 780;
                    if (bf.y < minY + 1.0) contactY = 20; else if (bf.y > maxY - 1.0) contactY = 380;
                    const sparkCount = Math.min(8, Math.floor(2 + speed * 3));
                    for (let k = 0; k < sparkCount; k++) chalkParticlesRef.current.push({ x: contactX, y: contactY, vx: (Math.random() - 0.5) * (speed * 0.3 + 0.5), vy: (Math.random() - 0.5) * (speed * 0.3 + 0.5), size: Math.random() * 1.3 + 0.4, opacity: 0.75, color: 'rgba(245, 158, 11, 0.45)' });
                  }
                }
              });
            }
            lastCheckedIntegerIdx = indexFloor;
          }
          const updatedBalls = initialBallsCopy.map((originalBall) => {
            const ballA = frameFloor ? frameFloor.find((fb) => fb.id === originalBall.id) : undefined;
            const ballB = frameCeil ? frameCeil.find((fb) => fb.id === originalBall.id) : undefined;
            if (ballA && ballB) {
              const interpolatedX = ballA.x + (ballB.x - ballA.x) * ratio;
              const interpolatedY = ballA.y + (ballB.y - ballA.y) * ratio;
              const isPocketed = ratio < 0.5 ? ballA.isPocketed : ballB.isPocketed;
              const prevB = animatedBallsRef.current.find(ab => ab.id === originalBall.id);
              if (prevB) {
                const dx = interpolatedX - prevB.x, dy = interpolatedY - prevB.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 0.04) {
                  if (!ballRotationsRef.current[originalBall.id]) ballRotationsRef.current[originalBall.id] = { ux: [1, 0, 0], uy: [0, 1, 0], uz: [0, 0, 1], angle: 0, pitch: 0, yaw: 0 };
                  const rot = ballRotationsRef.current[originalBall.id];
                  const R = originalBall.radius || 10;
                  const dTheta = dist / R;
                  const ax = -dy / dist, ay = dx / dist, az = 0;
                  const rotateUnitVector = (v: number[]) => {
                    const c = Math.cos(dTheta), s = Math.sin(dTheta);
                    const dot = v[0] * ax + v[1] * ay + v[2] * az;
                    const cx = ay * v[2] - az * v[1], cy = az * v[0] - ax * v[2], cz = ax * v[1] - ay * v[0];
                    const rx = v[0] * c + cx * s + ax * dot * (1 - c);
                    const ry = v[1] * c + cy * s + ay * dot * (1 - c);
                    const rz = v[2] * c + cz * s + az * dot * (1 - c);
                    const len = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
                    return [rx / len, ry / len, rz / len];
                  };
                  rot.ux = rotateUnitVector(rot.ux || [1, 0, 0]);
                  rot.uy = rotateUnitVector(rot.uy || [0, 1, 0]);
                  rot.uz = rotateUnitVector(rot.uz || [0, 0, 1]);
                  rot.angle += dist * 0.12;
                  rot.pitch += dy * 0.12;
                  rot.yaw += dx * 0.12;
                }
              }
              return { ...originalBall, x: interpolatedX, y: interpolatedY, isPocketed };
            }
            return originalBall;
          });
          setAnimatedBalls(updatedBalls);
          animatedBallsRef.current = updatedBalls;
          animationFrameId = requestAnimationFrame(animate);
        } else {
          setIsAnimating(false);
          const finalFrame = physicsFrames?.length ? physicsFrames[physicsFrames.length - 1] : undefined;
          setAnimatedBalls(initialBallsCopy.map(b => {
            const fb = finalFrame?.find(f => f.id === b.id);
            return fb ? { ...b, x: fb.x, y: fb.y, isPocketed: fb.isPocketed } : b;
          }));
          onClearFrames();
        }
      };
      animationFrameId = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(animationFrameId);
    }
  }, [physicsFrames]);

  useEffect(() => {
    if (roomState.scratchOccurred && isMyTurn) {
      setIsScratchPlacing(true);
      const cueBall = roomState.balls.find((b) => b.id === 0);
      if (cueBall) setPlacedPos({ x: cueBall.x, y: cueBall.y });
    } else setIsScratchPlacing(false);
  }, [roomState.scratchOccurred, isMyTurn, roomState.balls]);

  useBilliardsRenderer({
    canvasRef, offscreenCanvasRef, aimAngleRef, shotPowerRef, spinXRef, spinYRef,
    isMyTurnRef, isAnimatingRef, isScratchPlacingRef, placedPosRef, isPullingRef,
    roomStateRef, difficultyRef, myPlayerIdRef, ballRotationsRef, impactShakeRef,
    feltRipplesRef, chalkParticlesRef, dustSpecksRef, sinkingBallsRef, strikeAnimRef,
    turnStartTimestampRef, animatedBallsRef, isMobileRef: isMobile, opponentAim,
    impactFlashesRef, isFineAimRef, aimInertiaVelocityRef,
  });

  const getPointerCoords = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    let clientXRaw = 0, clientYRaw = 0;
    if (e.touches?.length) { clientXRaw = e.touches[0].clientX; clientYRaw = e.touches[0].clientY; }
    else if (e.changedTouches?.length) { clientXRaw = e.changedTouches[0].clientX; clientYRaw = e.changedTouches[0].clientY; }
    else { clientXRaw = e.clientX; clientYRaw = e.clientY; }
    
    // Scale to 800x400 coordinate space
    const screenX = ((clientXRaw - rect.left) / rect.width) * 800;
    const screenY = ((clientYRaw - rect.top) / rect.height) * 400;
    
    // Account for camera pan offset to get world coordinates
    return { x: screenX, y: screenY };
  };

  const handlePointerAction = (e: any, isInitialDown = false) => {
    if (isAnimatingRef.current) return;
    const coords = getPointerCoords(e);
    if (!coords) return;
    
    if (isScratchPlacingRef.current) {
      setPlacedPos({
        x: Math.max(35, Math.min(coords.x, roomStateRef.current.ballInHandRestriction === 'behind_head_string' ? HEAD_STRING_LINE - 10 : 765)),
        y: Math.max(35, Math.min(coords.y, 365)),
      });
      return;
    }

    if (isMyTurnRef.current && !roomStateRef.current.scratchOccurred) {
      const cueBall = animatedBallsRef.current.find((b) => b.id === 0);
      if (cueBall && !cueBall.isPocketed && !isAimLockedRef.current) {
        if (!isMobile.current) {
          // ================= DESKTOP CLASSIC CONTROLS =================
          if (isInitialDown) {
            pullStartPosRef.current = coords;
            setIsPulling(true);
            isPullingRef.current = true;
            setDragMode('pull');
            dragModeRef.current = 'pull';
            if (!isAimLockedRef.current) {
              const newAngle = Math.atan2(coords.y - cueBall.y, coords.x - cueBall.x);
              targetAimAngleRef.current = newAngle;
              setAimAngle(newAngle);
              aimAngleRef.current = newAngle;
              initialAimAngleRef.current = newAngle;
            }
          } else if (pullStartPosRef.current) {
            const pullDx = coords.x - pullStartPosRef.current.x;
            const pullDy = coords.y - pullStartPosRef.current.y;
            const dragDist = Math.hypot(pullDx, pullDy);
            
            // Power
            const effectiveDrag = Math.max(0, dragDist - DEAD_ZONE_PX);
            const dragFactor = 2.4;
            const rawPower = Math.min(100, effectiveDrag / dragFactor);
            const curvedPower = Math.pow(rawPower / 100, 0.85) * 100;
            const power = Math.min(100, Math.max(0, Math.floor(curvedPower)));
            setShotPower(power);
            shotPowerRef.current = power;
            
            // Aim Ortho Adjust
            if (!isAimLockedRef.current) {
              const orthoDrag = -pullDx * Math.sin(initialAimAngleRef.current) + pullDy * Math.cos(initialAimAngleRef.current);
              const sens = isShiftHeldRef.current ? AIM_SENSITIVITY * SHIFT_MODIFIER : AIM_SENSITIVITY;
              const newAngle = initialAimAngleRef.current + orthoDrag * sens;
              targetAimAngleRef.current = newAngle;
              const smoothed = aimAngleRef.current + (newAngle - aimAngleRef.current) * SMOOTH_FACTOR;
              setAimAngle(smoothed);
              aimAngleRef.current = smoothed;
            }
          } else if (!isAimLockedRef.current) {
            // Hover logic
            const rawAngle = Math.atan2(coords.y - cueBall.y, coords.x - cueBall.x);
            targetAimAngleRef.current = rawAngle;
            const sens = isShiftHeldRef.current ? SHIFT_MODIFIER : 1;
            const smoothed = aimAngleRef.current + (rawAngle - aimAngleRef.current) * SMOOTH_FACTOR * sens;
            setAimAngle(smoothed);
            aimAngleRef.current = smoothed;
          }
        } else {
          // ================= MOBILE SMART ZONES =================
          if (isInitialDown) {
            dragStartXRef.current = coords.x;
            pullStartPosRef.current = coords;
            aimInertiaVelocityRef.current = 0;
            
            // On mobile, touching the canvas ALWAYS rotates the aim.
            // Power and shooting are handled by the CueStickSlider on the left.
            setDragMode('rotate');
            dragModeRef.current = 'rotate';
          } else {
            // pointer move logic
            if (dragModeRef.current === 'pan' && pullStartPosRef.current) {
              // Pan camera removed
              pullStartPosRef.current = coords;
            } 
            else if (dragModeRef.current === 'rotate') {
              const rawAngle = Math.atan2(coords.y - cueBall.y, coords.x - cueBall.x);
              targetAimAngleRef.current = rawAngle;
              const sens = isFineAimRef.current ? SHIFT_MODIFIER : 1;
              const smoothed = aimAngleRef.current + (rawAngle - aimAngleRef.current) * SMOOTH_FACTOR * sens;
              setAimAngle(smoothed);
              aimAngleRef.current = smoothed;
            }
          }
        }
      }
    }
  };

  const [isPointerActive, setIsPointerActive] = useState(false);

  // Inertia loop removed for 1-to-1 precise manual control

  const handlePointerDown = (e: any) => { if (isAnimatingRef.current) return; setIsPointerActive(true); handlePointerAction(e, true); };
  const handlePointerMove = (e: any) => {
    if (isAnimatingRef.current) return;
    if (isPointerActive || pullStartPosRef.current) handlePointerAction(e, false);
    else if (!isMobile.current && isMyTurnRef.current && !isScratchPlacingRef.current && !roomStateRef.current.scratchOccurred && !isAimLockedRef.current) {
      const coords = getPointerCoords(e);
      if (coords) {
        const cueBall = animatedBallsRef.current.find((b) => b.id === 0);
        if (cueBall && !cueBall.isPocketed) {
          const rawAngle = Math.atan2(coords.y - cueBall.y, coords.x - cueBall.x);
          targetAimAngleRef.current = rawAngle;
          const sens = isShiftHeldRef.current ? SHIFT_MODIFIER : 1;
          const smoothed = aimAngleRef.current + (rawAngle - aimAngleRef.current) * SMOOTH_FACTOR * sens;
          setAimAngle(smoothed);
          aimAngleRef.current = smoothed;
        }
      }
    }
  };

  const triggerShootParticles = (power: number, isBreak = false) => {
    const cueBall = animatedBallsRef.current.find((b) => b.id === 0);
    if (cueBall && !cueBall.isPocketed) {
      const bAngle = aimAngleRef.current + Math.PI;
      const hDx = Math.cos(bAngle), hDy = Math.sin(bAngle);
      const mult = isBreak ? 2.5 : 1;
      for (let i = 0; i < Math.min(Math.floor(25 * mult), Math.floor((10 + power * 0.25) * mult)); i++) {
        const sa = bAngle + (Math.random() - 0.5) * (isBreak ? 1.8 : 1.1);
        const sp = (Math.random() * 2.5 + 0.8) * (power / 100 + 0.5) * (isBreak ? 2.0 : 1);
        chalkParticlesRef.current.push({ x: cueBall.x - hDx * 10, y: cueBall.y - hDy * 10, vx: Math.cos(sa) * sp, vy: Math.sin(sa) * sp, size: (Math.random() * 2.0 + 0.6) * (isBreak ? 1.5 : 1), opacity: 0.9, color: 'rgba(59, 130, 246, 0.8)' });
      }
      for (let i = 0; i < Math.min(Math.floor(15 * mult), Math.floor(power * 0.15 * mult)); i++) {
        const sa = bAngle + Math.PI + (Math.random() - 0.5) * (isBreak ? 2.5 : 1.8);
        const sp = (Math.random() * 4.0 + 1.5) * (power / 100 + 0.3) * (isBreak ? 2.5 : 1);
        chalkParticlesRef.current.push({ x: cueBall.x - hDx * 10, y: cueBall.y - hDy * 10, vx: Math.cos(sa) * sp, vy: Math.sin(sa) * sp, size: (Math.random() * 1.5 + 0.8) * (isBreak ? 1.5 : 1), opacity: 1.0, color: Math.random() > 0.4 ? 'rgba(245, 158, 11, 0.95)' : 'rgba(255, 230, 150, 0.95)' });
      }
      feltRipplesRef.current.push({ x: cueBall.x - hDx * 10, y: cueBall.y - hDy * 10, radius: isBreak ? 12 : 4, maxRadius: isBreak ? 60 : 28, opacity: isBreak ? 1.0 : 0.8, color: 'rgba(59, 130, 246, 0.5)' });
    }
  };

  const executeAuthorizedShot = (angle: number, power: number, sX: number, sY: number) => {
    if (!isMyTurnRef.current || isAnimatingRef.current) return;
    // Shot Stick Snap Animation: short delay before hit for visual impact
    strikeAnimRef.current = { active: true, power, startTime: performance.now(), angle, duration: isMobile.current ? 80 : 150 };
    setIsAnimating(true);
    if (isMobile.current) {
      poolAudio.playCueHit(power);
      haptic(30);
    }
    onShoot(angle, power, sX, sY);
    setSpinX(0); setSpinY(0);
  };

  const handlePointerUp = () => {
    setIsPointerActive(false);

    if (isMobile.current) {
      // Mobile rotate/other: just clear drag state (shoot is via CueStickSlider)
      setDragMode(null);
      dragModeRef.current = null;
      pullStartPosRef.current = null;
      return;
    }

    if (dragModeRef.current === 'pull' && isPullingRef.current) {
      const p = shotPowerRef.current;
      setIsPulling(false);
      isPullingRef.current = false;
      setDragMode(null);
      dragModeRef.current = null;
      pullStartPosRef.current = null;
      if (p >= 5 && isMyTurnRef.current && !isAnimatingRef.current) {
        executeAuthorizedShot(aimAngleRef.current, p, spinXRef.current, spinYRef.current);
      } else {
        // Cancel shot
        setShotPower(0);
        shotPowerRef.current = 0;
      }
    } else {
      setDragMode(null);
      dragModeRef.current = null;
      pullStartPosRef.current = null;
    }
  };

  useEffect(() => {
    const handleGlobalMove = (e: PointerEvent) => { if (isPointerActive) handlePointerAction(e, false); };
    const handleGlobalUp = () => handlePointerUp();
    if (isPointerActive) {
      window.addEventListener('pointermove', handleGlobalMove);
      window.addEventListener('pointerup', handleGlobalUp);
      window.addEventListener('pointercancel', handleGlobalUp);
    }
    return () => {
      window.removeEventListener('pointermove', handleGlobalMove);
      window.removeEventListener('pointerup', handleGlobalUp);
      window.removeEventListener('pointercancel', handleGlobalUp);
    };
  }, [isPointerActive]);

  const handleShootClick = () => { if (isMyTurnRef.current && !isAnimatingRef.current) executeAuthorizedShot(aimAngleRef.current, shotPowerRef.current, spinXRef.current, spinYRef.current); };

  const handleConfirmPlacement = () => { if (!isPlacementInvalid()) { onResetCueBall(placedPos.x, placedPos.y); setIsScratchPlacing(false); } };

  useImperativeHandle(ref, () => ({
    spinX, spinY, shotPower, isAimLocked, aimAngle,
    setSpinX, setSpinY, setShotPower: (v: number) => { setShotPower(v); shotPowerRef.current = v; },
    setIsAimLocked: (v: boolean) => { setIsAimLocked(v); isAimLockedRef.current = v; },
    setAimAngle: (v: number | ((prev: number) => number)) => {
      if (typeof v === 'function') {
        setAimAngle((prev) => { const n = v(prev); aimAngleRef.current = n; return n; });
      } else {
        setAimAngle(v); aimAngleRef.current = v;
      }
    },
    handleShoot: handleShootClick,
    hudNotification,
    handleResetCueBall: (x: number, y: number) => { onResetCueBall(x, y); setIsScratchPlacing(false); },
  }), [spinX, spinY, shotPower, isAimLocked, aimAngle, hudNotification, onResetCueBall]);

  return (
    <div ref={containerRef} className="w-full h-full relative bg-gradient-to-b from-[#0a0604] to-[#040201] overflow-hidden touch-none" style={{ touchAction: 'none' }}>
      {/* Pure Canvas - fills container, zero overlays */}
      <div className="absolute inset-0 flex items-center justify-center touch-none">
        <div className="w-full h-full flex items-center justify-center">
          <canvas
            ref={canvasRef}
            className={`touch-none select-none ${isScratchPlacing ? 'cursor-move' : 'cursor-crosshair'}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClick={isScratchPlacing ? handleConfirmPlacement : undefined}
            style={{ touchAction: 'none', width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
      </div>

      {/* Minimal scratch confirm - only UI that stays inside for gameplay necessity */}
      {isScratchPlacing && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center pb-3">
          <button
            onClick={handleConfirmPlacement}
            disabled={isPlacementInvalid()}
            className={`px-3 py-1.5 rounded-lg font-bold text-[9px] font-mono transition-all ${
              isPlacementInvalid()
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-amber-600 to-amber-500 text-black shadow-lg shadow-amber-500/20 hover:from-amber-500 hover:to-amber-400'
            }`}
          >
            {isPlacementInvalid() ? placementErrorMessage() : 'PLACE CUE BALL'}
          </button>
        </div>
      )}
    </div>
  );
});
