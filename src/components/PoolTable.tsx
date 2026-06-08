import React, { useRef, useEffect, useState, MouseEvent } from 'react';
import { useBilliardsRenderer } from '../hooks/useBilliardsRenderer';
import { Ball, RoomState } from '../types';
import { RotateCcw, Bot } from 'lucide-react';
import { poolAudio } from '../utils/audio';
import PoolHUD from './PoolTable/PoolHUD';
import { BallRotationData } from './PoolTable/rotation';

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
  onJoinAI?: (difficulty?: 'easy' | 'medium' | 'hard') => void;
}

export default function PoolTable({
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
}: PoolTableProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Interaction States
  const [aimAngle, setAimAngle] = useState(0); // angle in radians
  const [shotPower, setShotPower] = useState(40); // 1 - 100
  const [spinX, setSpinX] = useState(0); // Left/Right spin (English) from -1.0 to 1.0 (??????? ???????)
  const [spinY, setSpinY] = useState(0); // Backspin/Topspin (Draw/Follow) from -1.0 to 1.0 (??????? ??????? ?? ????? ????? ??????)
  const [isScratchPlacing, setIsScratchPlacing] = useState(false);
  const [placedPos, setPlacedPos] = useState({ x: 200, y: 200 });

  const HEAD_STRING_LINE = 220;
  const placementErrorMessage = () => {
    if (!isScratchPlacing) return null;

    const overOtherBall = roomState.balls.some((b) => {
      if (b.id === 0 || b.isPocketed) return false;
      const dx = placedPos.x - b.x;
      const dy = placedPos.y - b.y;
      const dist = Math.hypot(dx, dy);
      return dist < 20.0;
    });

    const minX = 30 + 10;
    const maxX = 770 - 10;
    const minY = 30 + 10;
    const maxY = 370 - 10;
    const outBounds = placedPos.x < minX || placedPos.x > maxX || placedPos.y < minY || placedPos.y > maxY;
    const behindHeadStringInvalid = roomState.ballInHandRestriction === 'behind_head_string' && placedPos.x > HEAD_STRING_LINE - 10;

    if (overOtherBall) return 'Cannot place cue ball over another ball.';
    if (outBounds) return 'Placement must remain inside the table boundaries.';
    if (behindHeadStringInvalid) return 'Head-string placement required after a break foul.';
    return null;
  };

  const isPlacementInvalid = () => Boolean(placementErrorMessage());

  const [isAimingWithMouse, setIsAimingWithMouse] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  // Difficulty / Guidelines style control: 'easy' (Full laser) | 'medium' (Semi-realistic) | 'hard' (Pro / Realistic)
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');

  // HUD floating notification logs and tracker
  const [hudNotification, setHudNotification] = useState<string | null>(null);
  const lastLogRef = useRef<string | null>(null);

  // Lock angle state & ref
  const [isAimLocked, setIsAimLocked] = useState(false);
  const isAimLockedRef = useRef(isAimLocked);
  useEffect(() => { isAimLockedRef.current = isAimLocked; }, [isAimLocked]);

  // Strike Animation State Ref
  const strikeAnimRef = useRef<{
    active: boolean;
    power: number;
    startTime: number;
    angle: number;
    duration: number;
    hasStruck?: boolean;
  } | null>(null);

  // Premium 3D & Sensory Polish Refs
  const turnStartTimestampRef = useRef<number>(Date.now());
  const ballRotationsRef = useRef<Record<number, BallRotationData>>({});
  const impactShakeRef = useRef<number>(0);
  const feltRipplesRef = useRef<Array<{ x: number; y: number; radius: number; maxRadius: number; opacity: number; color: string }>>([]);
  const chalkParticlesRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; size: number; opacity: number; color: string }>>([]);
  const dustSpecksRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; radius: number; alpha: number; speed: number }>>([]);
  const sinkingBallsRef = useRef<Array<{ id: number; ball: Ball; progress: number; maxProgress: number; pocketX: number; pocketY: number }>>([]);

  // Playback Animation States
  const [animatedBalls, setAnimatedBalls] = useState<Ball[]>(roomState.balls);
  const animatedBallsRef = useRef<Ball[]>(roomState.balls);
  const [isAnimating, setIsAnimating] = useState(false);

  // Synchronizing Refs to run the Canvas Rendering loop unthrottled at maximum buttery-smooth FPS limit
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

  // Set turnStartTimestampRef on turn switch or shot animation ending (for first few seconds indicators)
  useEffect(() => {
    if (!isAnimating) {
      turnStartTimestampRef.current = Date.now();
    }
  }, [roomState?.currentTurn, isAnimating]);

  // Synchronize dynamic preview updates with server so the opponent sees them in real-time
  useEffect(() => {
    if (isMyTurn && !isAnimating && roomState.status === 'playing') {
      onPreviewAim?.(aimAngle, shotPower, spinX, spinY);
    }
  }, [aimAngle, shotPower, spinX, spinY, isMyTurn, isAnimating, roomState.status]);

  // Capture new arena events instantly and display as a floating premium central top banner
  useEffect(() => {
    if (roomState?.log && roomState.log.length > 0) {
      const latestLog = roomState.log[roomState.log.length - 1];
      if (latestLog !== lastLogRef.current) {
        lastLogRef.current = latestLog;
        
        // Filter out debug/logs, keep game-changing notifications near table
        if (!latestLog.startsWith('[Chat]') && !latestLog.includes('api_log') && !latestLog.includes('API_LOG')) {
          setHudNotification(latestLog);
          const shadowTimer = setTimeout(() => {
            setHudNotification(null);
          }, 4500);
          return () => clearTimeout(shadowTimer);
        }
      }
    }
  }, [roomState?.log]);

  // Synchronize balls ref on every animatedBalls change
  useEffect(() => {
    animatedBallsRef.current = animatedBalls;
  }, [animatedBalls]);

  // Decorator/Animator separation to prevent shot replays
  const [waitingForSync, setWaitingForSync] = useState(false);
  const lastBallsRef = useRef<string>(JSON.stringify(roomState.balls));
  const pullStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // Sync static balls when NOT animating AND NOT waiting for next state sync from server
  useEffect(() => {
    if (!isAnimating && !waitingForSync) {
      setAnimatedBalls(roomState.balls);
      lastBallsRef.current = JSON.stringify(roomState.balls);
    }
  }, [roomState.balls, isAnimating, waitingForSync]);

  // Watch for incoming state sync from server to clear the waiting flag
  useEffect(() => {
    if (waitingForSync && !isAnimating) {
      const currentHash = JSON.stringify(roomState.balls);
      if (currentHash !== lastBallsRef.current) {
        setWaitingForSync(false);
        setAnimatedBalls(roomState.balls);
        lastBallsRef.current = currentHash;
      }
    }
  }, [roomState.balls, isAnimating, waitingForSync]);

  // Keyboard controls for high-precision aiming & professional power tuning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isMyTurn || isAnimating || isScratchPlacing) return;

      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return; // ignore typing input

      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          setAimAngle((prev) => {
            let n = prev - 0.015;
            while (n > Math.PI) n -= Math.PI * 2;
            while (n < -Math.PI) n += Math.PI * 2;
            return n;
          });
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          setAimAngle((prev) => {
            let n = prev + 0.015;
            while (n > Math.PI) n -= Math.PI * 2;
            while (n < -Math.PI) n += Math.PI * 2;
            return n;
          });
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          setShotPower((prev) => Math.min(100, prev + 2));
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          setShotPower((prev) => Math.max(5, prev - 2));
          break;
        case '1':
          setShotPower(25);
          break;
        case '2':
          setShotPower(50);
          break;
        case '3':
          setShotPower(75);
          break;
        case '4':
          setShotPower(100);
          break;
        case ' ':
        case 'Enter':
          e.preventDefault();
          handleShootClick();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMyTurn, isAnimating, isScratchPlacing, aimAngle, shotPower, spinX, spinY, animatedBalls]);

  // Handle physics animation separate from static sync to prevent double triggering/replays
  useEffect(() => {
    if (physicsFrames && physicsFrames.length > 0) {
      if (strikeAnimRef.current && strikeAnimRef.current.active && strikeAnimRef.current.startTime === -1) {
        strikeAnimRef.current.startTime = performance.now();
      }
      setIsAnimating(true);
      setWaitingForSync(true);
      let lastCheckedIntegerIdx = -1;
      const initialBallsCopy = [...roomState.balls];
      
      // Dynamic pacing: Powerful or long shots play up to 1.95x speed to keep action exciting, while regular shots run at 1.65x.
      const basePlayMultiplier = physicsFrames.length > 350 ? 1.95 : 1.65;

      let animationFrameId: number;
      let startTime = performance.now();

      const animate = (now: number) => {
        // Delay starting the physics animation until the strike animation actually makes contact with the cue ball
        let isCurrentlyStrikingBeforeContact = false;
        if (strikeAnimRef.current && strikeAnimRef.current.active) {
          const STRIKE_ACCEL = 40; // 40ms crispy forward strike acceleration
          const strikeElapsed = strikeAnimRef.current.startTime !== -1 ? (performance.now() - strikeAnimRef.current.startTime) : 0;
          if (strikeElapsed < STRIKE_ACCEL && !strikeAnimRef.current.hasStruck) {
            isCurrentlyStrikingBeforeContact = true;
          } else if (!strikeAnimRef.current.hasStruck) {
            strikeAnimRef.current.hasStruck = true;
            // Trigger local client particles and sound instantly to coupling perfectly
            poolAudio.playCueHit(strikeAnimRef.current.power);
            triggerShootParticles(strikeAnimRef.current.power);
            impactShakeRef.current = Math.min(14.0, 2.0 + (strikeAnimRef.current.power / 100) * 12.0);
          }
        }

        if (isCurrentlyStrikingBeforeContact) {
          startTime = now; // Shift start time forward as long as stick is moving towards the ball
          animationFrameId = requestAnimationFrame(animate);
          return;
        }

        const elapsed = now - startTime;
        // Map elapsed time to frame steps (assuming standard 60fps = 16.667ms per frame indices)
        const targetFrameIdx = (elapsed / 16.667) * basePlayMultiplier;

        if (physicsFrames && targetFrameIdx < physicsFrames.length) {
          const indexFloor = Math.floor(targetFrameIdx);
          const indexCeil = Math.min(physicsFrames.length - 1, Math.ceil(targetFrameIdx));
          const ratio = targetFrameIdx - indexFloor;

          const frameFloor = physicsFrames[indexFloor];
          const frameCeil = physicsFrames[indexCeil];

          // Sound triggers and collisions (checking integer frame indices as they are crossed)
          if (indexFloor > lastCheckedIntegerIdx) {
            for (let stepIdx = lastCheckedIntegerIdx + 1; stepIdx <= indexFloor; stepIdx++) {
              if (stepIdx === 0) continue;
              const frame = physicsFrames[stepIdx];
              const prevFrame = physicsFrames[stepIdx - 1];
              if (!frame || !prevFrame) continue;

              // Pocket score ripples & triggers
              frame.forEach((bf) => {
                const prevBf = prevFrame.find((b) => b.id === bf.id);
                if (bf.isPocketed && prevBf && !prevBf.isPocketed) {
                  poolAudio.playPocketIn();

                  // Find closest pocket center to lock the vortex attraction
                  const pCenters = [
                    { x: 22, y: 22 }, { x: 400, y: 18 }, { x: 778, y: 22 },
                    { x: 22, y: 378 }, { x: 400, y: 382 }, { x: 778, y: 378 }
                  ];
                  let closestP = pCenters[0];
                  let minDist = Infinity;
                  pCenters.forEach((p) => {
                    const dist = Math.hypot(bf.x - p.x, bf.y - p.y);
                    if (dist < minDist) {
                      minDist = dist;
                      closestP = p;
                    }
                  });

                  // Find original full ball structure
                  const origBall = initialBallsCopy.find(b => b.id === bf.id);

                  // Add to high-fidelity sinking simulation
                  sinkingBallsRef.current.push({
                    id: bf.id,
                    ball: origBall ? { ...origBall, x: bf.x, y: bf.y } : { ...bf, color: '#34d399', type: 'solid', radius: 10 } as any,
                    progress: 0,
                    maxProgress: 40, // 40 animation frames inside requestAnimationFrame
                    pocketX: closestP.x,
                    pocketY: closestP.y
                  });

                  feltRipplesRef.current.push({
                    x: bf.x,
                    y: bf.y,
                    radius: 5,
                    maxRadius: 36,
                    opacity: 0.9,
                    color: 'rgba(52, 211, 153, 0.6)'
                  });

                  // Generates extremely realistic splash sparks color-coded to the ball's actual color!
                  const ballColor = origBall?.color || '#34d399';
                  for (let k = 0; k < 15; k++) {
                    chalkParticlesRef.current.push({
                      x: bf.x,
                      y: bf.y,
                      vx: (Math.random() - 0.5) * 4.5 + (closestP.x - bf.x) * 0.1,
                      vy: (Math.random() - 0.5) * 4.5 + (closestP.y - bf.y) * 0.1,
                      size: Math.random() * 2.8 + 0.8,
                      opacity: 0.90,
                      color: ballColor
                    });
                  }
                }
              });

              // Ball collision audio & sparkles
              for (let i = 0; i < frame.length; i++) {
                const b1 = frame[i];
                if (b1.isPocketed) continue;
                for (let j = i + 1; j < frame.length; j++) {
                  const b2 = frame[j];
                  if (b2.isPocketed) continue;

                  const dx = b1.x - b2.x;
                  const dy = b1.y - b2.y;
                  const distSq = dx * dx + dy * dy;
                  if (distSq <= 405) {
                    const prevB1 = prevFrame.find((b) => b.id === b1.id);
                    const prevB2 = prevFrame.find((b) => b.id === b2.id);
                    if (prevB1 && prevB2) {
                      const pdx = prevB1.x - prevB2.x;
                      const pdy = prevB1.y - prevB2.y;
                      const pDistSq = pdx * pdx + pdy * pdy;
                      if (pDistSq > 405) {
                        const speed1 = Math.sqrt((b1.x - prevB1.x) ** 2 + (b1.y - prevB1.y) ** 2);
                        const speed2 = Math.sqrt((b2.x - prevB2.x) ** 2 + (b2.y - prevB2.y) ** 2);
                        const totalSpeed = speed1 + speed2;
                        poolAudio.playBallCollision(Math.max(0.15, totalSpeed));

                        // Trigger physically responsive camera shake
                        if (totalSpeed > 0.8) {
                          impactShakeRef.current = Math.min(10.0, impactShakeRef.current + totalSpeed * 1.65);
                        }

                        // Ball contact ripples
                        feltRipplesRef.current.push({
                          x: (b1.x + b2.x) / 2,
                          y: (b1.y + b2.y) / 2,
                          radius: 3,
                          maxRadius: Math.min(26, 11 + totalSpeed * 6),
                          opacity: Math.min(0.75, 0.22 + totalSpeed * 0.12),
                          color: 'rgba(255, 255, 255, 0.45)'
                        });

                        // Collision dust particles
                        const contactX = (b1.x + b2.x) / 2;
                        const contactY = (b1.y + b2.y) / 2;
                        const partCount = Math.min(12, Math.floor(4 + totalSpeed * 1.8));
                        for (let k = 0; k < partCount; k++) {
                          chalkParticlesRef.current.push({
                            x: contactX,
                            y: contactY,
                            vx: (Math.random() - 0.5) * (totalSpeed * 0.4 + 1.2),
                            vy: (Math.random() - 0.5) * (totalSpeed * 0.4 + 1.2),
                            size: Math.random() * 1.6 + 0.5,
                            opacity: 0.8,
                            color: 'rgba(254, 240, 138, 0.75)'
                          });
                        }
                      }
                    }
                  }
                }
              }

              // Cushion boundaries checks
              frame.forEach((bf) => {
                const prevBf = prevFrame.find((b) => b.id === bf.id);
                if (!prevBf || bf.isPocketed) return;

                const dx = bf.x - prevBf.x;
                const dy = bf.y - prevBf.y;
                const speed = Math.hypot(dx, dy);

                if (speed > 0.1) {
                  const minX = 30;
                  const maxX = 770;
                  const minY = 30;
                  const maxY = 370;

                  let hitCushion = false;
                  // Did it hit vertical cushion?
                  if ((bf.x <= minX + 0.05 && prevBf.x > minX + 0.05) || 
                      (bf.x >= maxX - 0.05 && prevBf.x < maxX - 0.05)) {
                    hitCushion = true;
                  }
                  // Did it hit horizontal cushion?
                  if ((bf.y <= minY + 0.05 && prevBf.y > minY + 0.05) || 
                      (bf.y >= maxY - 0.05 && prevBf.y < maxY - 0.05)) {
                    hitCushion = true;
                  }

                  if (hitCushion) {
                    poolAudio.playCushionHit(speed);
                    
                    // Trigger physically-coupled camera shake for high-impact cushion bounces!
                    if (speed > 0.4) {
                      impactShakeRef.current = Math.min(8.0, impactShakeRef.current + speed * 1.5);
                    }

                    // Sparkles on point of cushion contact
                    let contactX = bf.x;
                    let contactY = bf.y;
                    if (bf.x < minX + 1.0) contactX = 20; // felt edge
                    else if (bf.x > maxX - 1.0) contactX = 780;
                    if (bf.y < minY + 1.0) contactY = 20;
                    else if (bf.y > maxY - 1.0) contactY = 380;

                    const sparkCount = Math.min(8, Math.floor(2 + speed * 3));
                    for (let k = 0; k < sparkCount; k++) {
                      chalkParticlesRef.current.push({
                        x: contactX,
                        y: contactY,
                        vx: (Math.random() - 0.5) * (speed * 0.3 + 0.5),
                        vy: (Math.random() - 0.5) * (speed * 0.3 + 0.5),
                        size: Math.random() * 1.3 + 0.4,
                        opacity: 0.75,
                        color: 'rgba(245, 158, 11, 0.45)' // golden/amber/chalk particles
                      });
                    }
                  }
                }
              });
            }
            lastCheckedIntegerIdx = indexFloor;
          }

          // Buttery Smooth Linear-Interpolated Position Computations using latest animatedBallsRef
          const updatedBalls = initialBallsCopy.map((originalBall) => {
            const ballA = frameFloor ? frameFloor.find((fb) => fb.id === originalBall.id) : undefined;
            const ballB = frameCeil ? frameCeil.find((fb) => fb.id === originalBall.id) : undefined;
            if (ballA && ballB) {
              const interpolatedX = ballA.x + (ballB.x - ballA.x) * ratio;
              const interpolatedY = ballA.y + (ballB.y - ballA.y) * ratio;
              const isPocketed = ratio < 0.5 ? ballA.isPocketed : ballB.isPocketed;

              const prevB = animatedBallsRef.current.find(ab => ab.id === originalBall.id);
              if (prevB) {
                const dx = interpolatedX - prevB.x;
                const dy = interpolatedY - prevB.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 0.04) {
                  if (!ballRotationsRef.current[originalBall.id]) {
                    ballRotationsRef.current[originalBall.id] = {
                      ux: [1, 0, 0],
                      uy: [0, 1, 0],
                      uz: [0, 0, 1],
                      angle: 0,
                      pitch: 0,
                      yaw: 0
                    };
                  }
                  const rot = ballRotationsRef.current[originalBall.id];
                  
                  // Radius of the ball for physical rolling scale
                  const R = originalBall.radius || 10;
                  const dTheta = dist / R;

                  // Direction of rotation axis perpendicular to 2D trajectory path (dx, dy)
                  const ax = -dy / dist;
                  const ay = dx / dist;
                  const az = 0;

                  // Apply Rodrigues' rotation formula to the unit axes vectors
                  const rotateUnitVector = (v: number[]) => {
                    const c = Math.cos(dTheta);
                    const s = Math.sin(dTheta);
                    const dot = v[0] * ax + v[1] * ay + v[2] * az;
                    const cx = ay * v[2] - az * v[1];
                    const cy = az * v[0] - ax * v[2];
                    const cz = ax * v[1] - ay * v[0];

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
              return {
                ...originalBall,
                x: interpolatedX,
                y: interpolatedY,
                isPocketed: isPocketed,
              };
            }
            return originalBall;
          });
          
          setAnimatedBalls(updatedBalls);
          animatedBallsRef.current = updatedBalls;
          animationFrameId = requestAnimationFrame(animate);
        } else {
          setIsAnimating(false);
          const finalFrame = physicsFrames && physicsFrames.length > 0 ? physicsFrames[physicsFrames.length - 1] : undefined;
          const finalBalls = initialBallsCopy.map((originalBall) => {
            const fb = finalFrame ? finalFrame.find((b) => b.id === originalBall.id) : undefined;
            if (fb) {
              return {
                ...originalBall,
                x: fb.x,
                y: fb.y,
                isPocketed: fb.isPocketed
              };
            }
            return originalBall;
          });
          setAnimatedBalls(finalBalls);
          onClearFrames(); // clear frames back to state
        }
      };

      animationFrameId = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(animationFrameId);
    }
  }, [physicsFrames]);

  // Is scratch available for current user
  useEffect(() => {
    if (roomState.scratchOccurred && isMyTurn) {
      setIsScratchPlacing(true);
      // set placement initialized
      const cueBall = roomState.balls.find((b) => b.id === 0);
      if (cueBall) {
        setPlacedPos({ x: cueBall.x, y: cueBall.y });
      }
    } else {
      setIsScratchPlacing(false);
    }
  }, [roomState.scratchOccurred, isMyTurn, roomState.balls]);

  // Delegate canvas rendering to the extracted hook
  useBilliardsRenderer({
    canvasRef,
    offscreenCanvasRef,
    aimAngleRef,
    shotPowerRef,
    spinXRef,
    spinYRef,
    isMyTurnRef,
    isAnimatingRef,
    isScratchPlacingRef,
    placedPosRef,
    isPullingRef,
    roomStateRef,
    difficultyRef,
    myPlayerIdRef,
    ballRotationsRef,
    impactShakeRef,
    feltRipplesRef,
    chalkParticlesRef,
    dustSpecksRef,
    sinkingBallsRef,
    strikeAnimRef,
    turnStartTimestampRef,
    animatedBallsRef,
    opponentAim,
  });
  // Universal coordinates resolver for PC mouse & mobile touches
  const getPointerCoords = (e: any) => {
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

    const x = ((clientXRaw - rect.left) / rect.width) * 800;
    const y = ((clientYRaw - rect.top) / rect.height) * 400;
    return { x, y };
  };

  const handlePointerAction = (e: any, isInitialDown = false) => {
    if (isAnimating) return;
    const coords = getPointerCoords(e);
    if (!coords) return;

    if (isScratchPlacing) {
      const maxXAllowed = roomStateRef.current.ballInHandRestriction === 'behind_head_string' ? HEAD_STRING_LINE - 10 : 765;
      setPlacedPos({
        x: Math.max(35, Math.min(coords.x, maxXAllowed)),
        y: Math.max(35, Math.min(coords.y, 365)),
      });
      return;
    }

    if (isMyTurn && !roomState.scratchOccurred) {
      const cueBall = animatedBallsRef.current.find((b) => b.id === 0);
      if (cueBall && !cueBall.isPocketed) {
        // Unified elegant pullback charging mechanics for ALL PC & Mobile devices!
        if (isInitialDown) {
          pullStartPosRef.current = coords;
          setIsPulling(true);
          if (!isAimLocked) {
            const dx = coords.x - cueBall.x;
            const dy = coords.y - cueBall.y;
            setAimAngle(Math.atan2(dy, dx));
          }
        } else if (pullStartPosRef.current) {
          const dx = coords.x - pullStartPosRef.current.x;
          const dy = coords.y - pullStartPosRef.current.y;

          const baseDx = pullStartPosRef.current.x - cueBall.x;
          const baseDy = pullStartPosRef.current.y - cueBall.y;
          const baseAngle = Math.atan2(baseDy, baseDx);

          const baseCos = Math.cos(baseAngle);
          const baseSin = Math.sin(baseAngle);
          const projectionPull = -(dx * baseCos + dy * baseSin);

          // Proportional pullback force calculations: safe between 5% and 100% power
          const calculatedPower = Math.min(100, Math.max(5, Math.floor(Math.max(0, projectionPull) / 1.7) + 5));
          setShotPower(calculatedPower);

          if (!isAimLocked) {
            // Professional micro-tuning adjustments on lateral drag movements: only when aim is NOT locked!
            const orthogonalDrag = -dx * baseSin + dy * baseCos;
            
            // DYNAMIC ULTRA-SENSITIVE FINE CONTROL:
            // When user pulls the cue stick back, they need extreme sub-degree shooting precision.
            // We scale down the steering sensitivity dynamically based on an exponential decay curve
            // so standard aiming/dragging is extremely fast, while deep pullbacks allow pixel-perfect precision tracking.
            // This perfectly satisfies the demand: "???? ??? ??????? ???? ?????? ??????? ??? ??? ?????? ?????? ???????? ?????"
            const sensitivityFactor = Math.max(0.0002, 0.0028 * Math.exp(-calculatedPower * 0.024));
            const angleAdjustment = orthogonalDrag * sensitivityFactor;
            setAimAngle(baseAngle + angleAdjustment);
          }
        } else {
          if (!isAimLocked) {
            const dx = coords.x - cueBall.x;
            const dy = coords.y - cueBall.y;
            setAimAngle(Math.atan2(dy, dx));
          }
        }
      }
    }
  };

  // Drag states for PC mouse interaction
  const [isPointerActive, setIsPointerActive] = useState(false);

  const handlePointerDown = (e: any) => {
    if (isAnimating) return;
    setIsPointerActive(true);
    handlePointerAction(e, true);
  };

  const handlePointerMove = (e: any) => {
    if (isAnimating) return;
    if (isPointerActive) {
      handlePointerAction(e, false);
    } else {
      // EFFORTLESS HOVER AIMING: Hovering over the canvas automatically rotates the cue stick to aim at the cursor
      if (isMyTurn && !isScratchPlacing && !roomState.scratchOccurred && !isAimLocked) {
        const coords = getPointerCoords(e);
        if (coords) {
          const cueBall = animatedBallsRef.current.find((b) => b.id === 0);
          if (cueBall && !cueBall.isPocketed) {
            const dx = coords.x - cueBall.x;
            const dy = coords.y - cueBall.y;
            setAimAngle(Math.atan2(dy, dx));
          }
        }
      }
    }
  };

  const triggerShootParticles = (power: number) => {
    const cueBall = animatedBallsRef.current.find((b) => b.id === 0);
    if (cueBall && !cueBall.isPocketed) {
      const bAngle = aimAngle + Math.PI; // source angle of cue stick hit
      const hDx = Math.cos(bAngle);
      const hDy = Math.sin(bAngle);
      
      // 1. Generate vibrant blue chalk powder particles
      const partCount = Math.min(25, Math.floor(10 + power * 0.25));
      for (let i = 0; i < partCount; i++) {
        const spreadAngle = bAngle + (Math.random() - 0.5) * 1.1;
        const speed = (Math.random() * 2.5 + 0.8) * (power / 100 + 0.5);
        chalkParticlesRef.current.push({
          x: cueBall.x - hDx * 10,
          y: cueBall.y - hDy * 10,
          vx: Math.cos(spreadAngle) * speed,
          vy: Math.sin(spreadAngle) * speed,
          size: Math.random() * 2.0 + 0.6,
          opacity: 0.9,
          color: 'rgba(59, 130, 246, 0.8)' // vibrant cue tip blue chalk powder
        });
      }

      // 2. High energy striking sparks representing rich physics contact
      const sparkCount = Math.min(15, Math.floor(power * 0.15));
      for (let i = 0; i < sparkCount; i++) {
        const spreadAngle = bAngle + Math.PI + (Math.random() - 0.5) * 1.8; // spray outwards from contact point
        const speed = (Math.random() * 4.0 + 1.5) * (power / 100 + 0.3);
        chalkParticlesRef.current.push({
          x: cueBall.x - hDx * 10,
          y: cueBall.y - hDy * 10,
          vx: Math.cos(spreadAngle) * speed,
          vy: Math.sin(spreadAngle) * speed,
          size: Math.random() * 1.5 + 0.8,
          opacity: 1.0,
          color: Math.random() > 0.4 ? 'rgba(245, 158, 11, 0.95)' : 'rgba(255, 230, 150, 0.95)' // gold and hot white sparks
        });
      }

      // 3. Elegant physical hit ripple from the cue ball contact point on felt
      feltRipplesRef.current.push({
        x: cueBall.x - hDx * 10,
        y: cueBall.y - hDy * 10,
        radius: 4,
        maxRadius: 28,
        opacity: 0.8,
        color: 'rgba(59, 130, 246, 0.5)'
      });
    }
  };

  const executeAuthorizedShot = (angle: number, power: number, sX: number, sY: number) => {
    if (!isMyTurn || isAnimating) return;

    // Trigger local cue-sliding strike animation instantly on client to mask network sync latency!
    strikeAnimRef.current = {
      active: true,
      power: power,
      startTime: performance.now(), // Trigger instant forward swing kinetic movement
      angle: angle,
      duration: 450 // 450ms premium strike and follow-through fade animation
    };

    setIsAnimating(true); // lock user interaction instantly!

    // Send shot to server immediately to compute frames in parallel
    onShoot(angle, power, sX, sY);

    setSpinX(0);
    setSpinY(0);
  };

  const handlePointerUp = () => {
    setIsPointerActive(false);
    
    if (isPullingRef.current) {
      const currentPower = shotPowerRef.current;
      setIsPulling(false);
      pullStartPosRef.current = null;

      // If they pulled back past a minimum threshold, trigger the physical shot!
      if (currentPower >= 10 && isMyTurnRef.current && !isAnimatingRef.current) {
        executeAuthorizedShot(aimAngleRef.current, currentPower, spinXRef.current, spinYRef.current);
      }
    }
  };

  // Global window listeners to capture full canvas drag and pull release securely even outside canvas constraints
  useEffect(() => {
    const handleGlobalMove = (e: PointerEvent) => {
      if (isPointerActive) {
        handlePointerAction(e, false);
      }
    };

    const handleGlobalUp = () => {
      handlePointerUp();
    };

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
  }, [isPointerActive, isMyTurn, isAnimating]);

  const handleShootClick = () => {
    if (!isMyTurn || isAnimating) return;
    executeAuthorizedShot(aimAngle, shotPower, spinX, spinY);
  };

  const adjustAngle = (deg: number) => {
    setAimAngle((prev) => {
      let newAngle = prev + (deg * Math.PI) / 180;
      while (newAngle > Math.PI) newAngle -= Math.PI * 2;
      while (newAngle < -Math.PI) newAngle += Math.PI * 2;
      return newAngle;
    });
  };

  const handleConfirmPlacement = () => {
    if (isPlacementInvalid()) return;
    onResetCueBall(placedPos.x, placedPos.y);
    setIsScratchPlacing(false);
  };

  return (
    <div ref={containerRef} className="flex flex-col items-center bg-slate-900 border border-slate-700/60 rounded-xl overflow-hidden p-4 shadow-xl relative">
      <PoolHUD
        roomState={roomState}
        myPlayerId={myPlayerId}
        isMyTurn={isMyTurn}
        isAnimating={isAnimating}
        spinX={spinX}
        setSpinX={setSpinX}
        spinY={spinY}
        setSpinY={setSpinY}
        onJoinAI={onJoinAI}
        isScratchPlacing={isScratchPlacing}
        isPlacementInvalid={isPlacementInvalid()}
        placementErrorMessage={placementErrorMessage()}
        handleConfirmPlacement={handleConfirmPlacement}
        isAimLocked={isAimLocked}
        setIsAimLocked={setIsAimLocked}
      />

      {/* Billiard Table Area (Full Width Canvas Center Stage) */}
      <div className="w-full mb-5 flex flex-col gap-3">
        {/* Play Table Card Chassis */}
        <div className="relative overflow-auto max-w-full border-4 border-amber-900 rounded-lg bg-[#111827] shadow-2xl">
          <canvas
            ref={canvasRef}
            className={`block max-w-full mx-auto touch-none select-none ${isScratchPlacing ? 'cursor-move' : 'cursor-crosshair'}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClick={isScratchPlacing ? handleConfirmPlacement : undefined}
            style={{ touchAction: 'none', width: '100%', maxWidth: '800px', height: 'auto', aspectRatio: '2/1' }}
          />
        </div>
      </div>
    </div>
  );
}
