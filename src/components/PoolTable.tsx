import React, { useRef, useEffect, useState, MouseEvent } from 'react';
import { Ball, RoomState } from '../types';
import { RotateCcw, ShieldCheck, Zap, Crosshair, Sliders, Play, Flame, Lock, Bot } from 'lucide-react';
import { poolAudio } from '../utils/audio';

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

  // Interaction States
  const [aimAngle, setAimAngle] = useState(0); // angle in radians
  const [shotPower, setShotPower] = useState(40); // 1 - 100
  const [spinX, setSpinX] = useState(0); // Left/Right spin (English) from -1.0 to 1.0 (الدوران الجانبي)
  const [spinY, setSpinY] = useState(0); // Backspin/Topspin (Draw/Follow) from -1.0 to 1.0 (الدوران العمودي أو ضربات السحب والدفع)
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

  const getEligibleBallIds = (room: typeof roomState, activePlayerId: string): number[] => {
    if (room.status !== 'playing') return [];
    const player = room.players.find(p => p.id === activePlayerId);
    if (!player) return [];

    const remainingObjectBalls = room.balls.filter(b => b.id !== 0 && b.id !== 8 && !b.isPocketed);

    // If sides are not assigned yet, all object balls (except cue and 8) are open to be played
    if (!room.assignedSides || !player.side) {
      return remainingObjectBalls.map(b => b.id);
    }

    // Sides are assigned
    const isSolids = player.side === 'solids';
    const playerGroup = isSolids ? 'solid' : 'stripe';

    const ownGroupRemaining = remainingObjectBalls.filter(b => b.type === playerGroup);
    if (ownGroupRemaining.length > 0) {
      return ownGroupRemaining.map(b => b.id);
    } else {
      // 8-ball is final target
      const blackBall = room.balls.find(b => b.id === 8);
      if (blackBall && !blackBall.isPocketed) {
        return [8];
      }
    }
    return [];
  };

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
  const ballRotationsRef = useRef<Record<number, { ux?: number[]; uy?: number[]; uz?: number[]; angle: number; pitch: number; yaw: number }>>({});
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

  // Main Canvas Rendering Loop with continuous micro-particle & ripple animations
  useEffect(() => {
    let animationId: number;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // HighDPI (Retina) Resolution Backing-Store Scaling
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 800 * dpr;
    canvas.height = 400 * dpr;
    ctx.scale(dpr, dpr);

    const BALL_R = 10;

    // Initialize atmospheric dust specks if empty
    if (dustSpecksRef.current.length === 0) {
      for (let i = 0; i < 15; i++) {
        dustSpecksRef.current.push({
          x: Math.random() * 760 + 20,
          y: Math.random() * 360 + 20,
          vx: (Math.random() - 0.5) * 0.16,
          vy: (Math.random() - 0.5) * 0.16,
          radius: Math.random() * 1.5 + 0.6,
          alpha: Math.random() * 0.28 + 0.12,
          speed: Math.random() * 0.04 + 0.015
        });
      }
    }

    const drawLoop = () => {
      // Clear background
      ctx.clearRect(0, 0, 800, 400);

      // Decay impact cameras shake slightly over time
      impactShakeRef.current = Math.max(0, impactShakeRef.current * 0.88);

      ctx.save();
      if (impactShakeRef.current > 0.05) {
        const sx = (Math.random() - 0.5) * impactShakeRef.current;
        const sy = (Math.random() - 0.5) * impactShakeRef.current;
        ctx.translate(sx, sy);
      }

    // 1. Draw Table Cushion Borders & Luxurious Wood Frame
    // Real mahogany wood rails with 3D bevels and grain linear gradients of rich dark burgundy wood
    const topRailGrad = ctx.createLinearGradient(0, 0, 800, 20);
    topRailGrad.addColorStop(0, '#0a0301');
    topRailGrad.addColorStop(0.15, '#220c05');
    topRailGrad.addColorStop(0.5, '#3a150b');
    topRailGrad.addColorStop(0.85, '#220c05');
    topRailGrad.addColorStop(1, '#0a0301');
    
    // Draw outer heavy wooden rails
    ctx.fillStyle = topRailGrad;
    ctx.fillRect(0, 0, 800, 20); // Top wood border
    ctx.fillRect(0, 380, 800, 20); // Bottom wood border
    
    const sideRailGrad = ctx.createLinearGradient(0, 0, 20, 400);
    sideRailGrad.addColorStop(0, '#080100');
    sideRailGrad.addColorStop(0.5, '#2c0f07');
    sideRailGrad.addColorStop(1, '#080100');
    ctx.fillStyle = sideRailGrad;
    ctx.fillRect(0, 20, 20, 360); // Left wood border
    ctx.fillRect(780, 20, 20, 360); // Right wood border

    // Draw Realistic Wood Grain Lines inside Wood Frame (realistic organic mahogany growth curves!)
    ctx.strokeStyle = 'rgba(74, 25, 10, 0.28)';
    ctx.lineWidth = 1.25;
    for (let i = 3; i < 18; i += 4) {
      // Horizontal top wood wavy grain
      ctx.beginPath();
      for (let x = 20; x <= 780; x += 15) {
        const wave = Math.sin(x * 0.03 + i) * 1.8;
        if (x === 20) ctx.moveTo(x, i + wave);
        else ctx.lineTo(x, i + wave);
      }
      ctx.stroke();

      // Horizontal bottom wood wavy grain
      ctx.beginPath();
      for (let x = 20; x <= 780; x += 15) {
        const wave = Math.sin(x * 0.035 + i) * 1.5;
        if (x === 20) ctx.moveTo(x, 380 + i + wave);
        else ctx.lineTo(x, 380 + i + wave);
      }
      ctx.stroke();
    }
    for (let i = 3; i < 18; i += 4) {
      // Vertical left wood wavy grain
      ctx.beginPath();
      for (let y = 20; y <= 380; y += 15) {
        const wave = Math.sin(y * 0.03 + i) * 1.8;
        if (y === 20) ctx.moveTo(i + wave, y);
        else ctx.lineTo(i + wave, y);
      }
      ctx.stroke();

      // Vertical right wood wavy grain
      ctx.beginPath();
      for (let y = 20; y <= 380; y += 15) {
        const wave = Math.sin(y * 0.035 + i) * 1.5;
        if (y === 20) ctx.moveTo(780 + i + wave, y);
        else ctx.lineTo(780 + i + wave, y);
      }
      ctx.stroke();
    }

    // Specular Bevel Line for 3D Wood Edges
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, 798, 398);

    // Deep ambient occlusion shadow inside the wood rail boards to simulate deep carve recess
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(18, 18, 764, 3); // top inner recess shadow
    ctx.fillRect(18, 379, 764, 3); // bottom inner recess shadow
    ctx.fillRect(18, 18, 3, 364); // left inner recess shadow
    ctx.fillRect(779, 18, 3, 364); // right inner recess shadow

    // Golden/Brass Luxury Miter Inlay separating Wood frame from Cushion Felt bounds (1.5px golden bevel)
    ctx.strokeStyle = '#c2780e';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(19, 19, 762, 362);

    // Inner Green Felt Base area with a gorgeous Overhead Spotlight (Radial illumination) + Ambient Sheen
    // Center spotlight source centered overhead at (400, 200).
    const feltSpotlight = ctx.createRadialGradient(400, 200, 40, 400, 200, 520);
    feltSpotlight.addColorStop(0, '#0fa696'); // Glowing premium teal-emerald lit center
    feltSpotlight.addColorStop(0.3, '#11655d'); // Deep teal-green
    feltSpotlight.addColorStop(0.65, '#0d544c'); // Shadowy velvet-felt
    feltSpotlight.addColorStop(1, '#083833'); // Deep rich forest edges

    ctx.fillStyle = feltSpotlight;
    ctx.fillRect(20, 20, 760, 360);

    // Elegant Chalk & Felt Friction Overlay (subtle texture particles) - HIGH-PERFORMANCE STATIC RECTS
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    for (let i = 0; i < 35; i++) {
      const rx = 25 + (i * 47) % 750;
      const ry = 25 + (i * 23) % 350;
      ctx.fillRect(rx - 0.5, ry - 0.5, 1.2, 1.2);
    }

    // DRAW DUAL PROFESSIONAL OVERHEAD LAMP REFLECTIONS on the felt (Translucent capsules)
    // This gives incredible "billiard-room" realism where ceiling fluorescent tubes reflect on the cloth
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.beginPath();
    ctx.ellipse(260, 200, 110, 45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(540, 200, 110, 45, 0, 0, Math.PI * 2);
    ctx.fill();

    // UPDATE & DRAW ACTIVE FELT RIPPLES
    feltRipplesRef.current = feltRipplesRef.current.filter((r) => {
      r.radius += 0.55;
      r.opacity -= 0.015;
      if (r.opacity <= 0 || r.radius >= r.maxRadius) return false;
      
      ctx.save();
      ctx.strokeStyle = r.color.replace(/[\d\.]+\)$/, `${r.opacity})`);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return true;
    });

    // UPDATE & DRAW CLASH / CHALK SPARK PARTICLES
    chalkParticlesRef.current = chalkParticlesRef.current.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.size = Math.max(0.1, p.size - 0.012);
      p.opacity -= 0.012;
      if (p.opacity <= 0) return false;

      ctx.save();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.opacity;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return true;
    });

    // UPDATE & DRAW DUST SPECKS UNDER THE spotlight (hovering atmosphere) - HIGH-PERFORMANCE ENGINE
    dustSpecksRef.current.forEach((d) => {
      d.x += d.vx;
      d.y += d.vy;
      if (d.x < 20) d.x = 780;
      if (d.x > 780) d.x = 20;
      if (d.y < 20) d.y = 380;
      if (d.y > 380) d.y = 20;

      const shineIntensity = 0.15 + Math.sin(Date.now() * d.speed) * 0.08;
      // Draw a subtle translucent dust particle, bypassing slower shadowBlur
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${d.alpha * shineIntensity})`;
      ctx.fill();
    });

    // Cushion Bevel Drop Shadows (Realistic Ambient Occlusion casting onto the felt)
    // Top Cushion Ambient Shadow
    const shadowTop = ctx.createLinearGradient(20, 32, 20, 48);
    shadowTop.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
    shadowTop.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shadowTop;
    ctx.fillRect(32, 32, 736, 16);

    // Bottom Cushion Ambient Shadow
    const shadowBottom = ctx.createLinearGradient(20, 368, 20, 352);
    shadowBottom.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
    shadowBottom.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shadowBottom;
    ctx.fillRect(32, 352, 736, 16);

    // Left Cushion Ambient Shadow
    const shadowLeft = ctx.createLinearGradient(32, 20, 48, 20);
    shadowLeft.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
    shadowLeft.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shadowLeft;
    ctx.fillRect(32, 32, 16, 336);

    // Right Cushion Ambient Shadow
    const shadowRight = ctx.createLinearGradient(768, 20, 752, 20);
    shadowRight.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
    shadowRight.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shadowRight;
    ctx.fillRect(752, 32, 16, 336);

    // Rail Cushions Felt Surface styling with 3D Depth bevel gradients
    // Top Cushion Bevel
    const topBrush = ctx.createLinearGradient(20, 20, 20, 32);
    topBrush.addColorStop(0, '#0a4234'); // dark underside felt
    topBrush.addColorStop(0.3, '#0f6e56'); // mid
    topBrush.addColorStop(1, '#138b6d'); // lighter face
    ctx.fillStyle = topBrush;
    ctx.beginPath();
    ctx.moveTo(32, 20);
    ctx.lineTo(768, 20);
    ctx.lineTo(752, 32);
    ctx.lineTo(48, 32);
    ctx.closePath();
    ctx.fill();

    // Bottom Cushion Bevel
    const bottomBrush = ctx.createLinearGradient(20, 380, 20, 368);
    bottomBrush.addColorStop(0, '#052920'); // deep dark shadow
    bottomBrush.addColorStop(0.4, '#0b5240');
    bottomBrush.addColorStop(1, '#117b60');
    ctx.fillStyle = bottomBrush;
    ctx.beginPath();
    ctx.moveTo(32, 380);
    ctx.lineTo(768, 380);
    ctx.lineTo(752, 368);
    ctx.lineTo(48, 368);
    ctx.closePath();
    ctx.fill();

    // Left Cushion Bevel
    const leftBrush = ctx.createLinearGradient(20, 20, 32, 20);
    leftBrush.addColorStop(0, '#052920');
    leftBrush.addColorStop(0.4, '#0b5240');
    leftBrush.addColorStop(1, '#117b60');
    ctx.fillStyle = leftBrush;
    ctx.beginPath();
    ctx.moveTo(20, 32);
    ctx.lineTo(20, 368);
    ctx.lineTo(32, 352);
    ctx.lineTo(32, 48);
    ctx.closePath();
    ctx.fill();

    // Right Cushion Bevel
    const rightBrush = ctx.createLinearGradient(780, 20, 768, 20);
    rightBrush.addColorStop(0, '#052920');
    rightBrush.addColorStop(0.4, '#0b5240');
    rightBrush.addColorStop(1, '#117b60');
    ctx.fillStyle = rightBrush;
    ctx.beginPath();
    ctx.moveTo(780, 32);
    ctx.lineTo(780, 368);
    ctx.lineTo(768, 352);
    ctx.lineTo(768, 48);
    ctx.closePath();
    ctx.fill();

    // Draw luxury silver-plated cushion cap lines dividing rail sections
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    // Top-Center cushion divide
    ctx.beginPath();
    ctx.moveTo(400, 20);
    ctx.lineTo(400, 32);
    ctx.stroke();
    // Bottom-Center cushion divide
    ctx.beginPath();
    ctx.moveTo(400, 368);
    ctx.lineTo(400, 380);
    ctx.stroke();

    // 2. Draw Table diamonds/markers (Gleaming mother-of-pearl diamond inlays) - HIGH SPEED
    const diamondSpacingX = 800 / 8;
    for (let i = 1; i <= 7; i++) {
       if (i !== 4) { // omit center pockets areas
         // Top diamonds
         ctx.save();
         ctx.translate(i * diamondSpacingX, 10);
         ctx.beginPath();
         ctx.moveTo(0, -4);
         ctx.lineTo(3, 0);
         ctx.lineTo(0, 4);
         ctx.lineTo(-3, 0);
         ctx.closePath();
         // Mother of pearl luster gradient
         const pearlGrad = ctx.createRadialGradient(0, 0, 0.5, 0, 0, 4);
         pearlGrad.addColorStop(0, '#ffffff');
         pearlGrad.addColorStop(0.4, '#e2e8f0');
         pearlGrad.addColorStop(1, '#94a3b8');
         ctx.fillStyle = pearlGrad;
         ctx.fill();
         ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
         ctx.lineWidth = 0.5;
         ctx.stroke();
         ctx.restore();

         // Bottom diamonds
         ctx.save();
         ctx.translate(i * diamondSpacingX, 390);
         ctx.beginPath();
         ctx.moveTo(0, -4);
         ctx.lineTo(3, 0);
         ctx.lineTo(0, 4);
         ctx.lineTo(-3, 0);
         ctx.closePath();
         ctx.fillStyle = pearlGrad;
         ctx.fill();
         ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
         ctx.lineWidth = 0.5;
         ctx.stroke();
         ctx.restore();
       }
    }
    const diamondSpacingY = 400 / 4;
    for (let j = 1; j <= 3; j++) {
      // Left diamonds
      ctx.save();
      ctx.translate(10, j * diamondSpacingY);
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(0, -3);
      ctx.lineTo(4, 0);
      ctx.lineTo(0, 3);
      ctx.closePath();
      const pearlGrad = ctx.createRadialGradient(0, 0, 0.5, 0, 0, 4);
      pearlGrad.addColorStop(0, '#ffffff');
      pearlGrad.addColorStop(0.4, '#e2e8f0');
      pearlGrad.addColorStop(1, '#94a3b8');
      ctx.fillStyle = pearlGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.restore();

      // Right diamonds
      ctx.save();
      ctx.translate(790, j * diamondSpacingY);
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(0, -3);
      ctx.lineTo(4, 0);
      ctx.lineTo(0, 3);
      ctx.closePath();
      ctx.fillStyle = pearlGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.restore();
    }

    // 3. Draw The 6 World-Class Pockets (Cast Iron Plate Covers & Mesh Net visual depth)
    const pockets = [
      { x: 22, y: 22, ang: Math.PI * 0.25 }, // TL
      { x: 400, y: 18, ang: Math.PI * 0.5 }, // TC
      { x: 778, y: 22, ang: Math.PI * 0.75 }, // TR
      { x: 22, y: 378, ang: -Math.PI * 0.25 }, // BL
      { x: 400, y: 382, ang: -Math.PI * 0.5 }, // BC
      { x: 778, y: 378, ang: -Math.PI * 0.75 }, // BR
    ];

    pockets.forEach((p) => {
      // A. Outer dark shadow ring underneath iron castings
      ctx.beginPath();
      ctx.arc(p.x, p.y, 27, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fill();

      // B. Specular Chrome/Metallic Corner castings
      // High-pressure polished steel/brass texture
      const pocketPlateGrad = ctx.createRadialGradient(p.x, p.y, 15, p.x, p.y, 25);
      pocketPlateGrad.addColorStop(0, '#1e293b'); // black steel core
      pocketPlateGrad.addColorStop(0.4, '#475569'); // slate iron
      pocketPlateGrad.addColorStop(0.75, '#f1f5f9'); // brilliant specular chrome sheen
      pocketPlateGrad.addColorStop(0.9, '#cbd5e1'); // highlight
      pocketPlateGrad.addColorStop(1, '#1e293b'); // shadowed outer rim

      ctx.beginPath();
      ctx.arc(p.x, p.y, 24, 0, Math.PI * 2);
      ctx.fillStyle = pocketPlateGrad;
      ctx.fill();

      // Draw an elegant gold/brass rim highlight on the metallic plate cover
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.65)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 23.5, 0, Math.PI * 2);
      ctx.stroke();

      // Add a couple of tiny gold screws on the metal plates to simulate real structural craft
      ctx.fillStyle = 'rgba(217, 119, 6, 0.9)'; // tiny gold screws
      const screwAngs = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
      screwAngs.forEach((sa) => {
        const sx = p.x + Math.cos(sa) * 20.5;
        const sy = p.y + Math.sin(sa) * 20.5;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
        ctx.fill();
      });

      // C. Inner Black Void Leather Nest
      const voidGrad = ctx.createRadialGradient(p.x, p.y, 3, p.x, p.y, 18);
      voidGrad.addColorStop(0, '#000000'); // total absolute velvet darkness
      voidGrad.addColorStop(0.7, '#070a0f'); // heavy stitch-leather
      voidGrad.addColorStop(0.9, '#111827'); // rim highlight
      voidGrad.addColorStop(1, 'rgba(0, 0, 0, 0.85)'); // edge

      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      ctx.fillStyle = voidGrad;
      ctx.fill();

      // D. High physical thick rubber pocket linings facing cloth cushions
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18.5, p.ang - 0.75, p.ang + 0.75);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#05070a';
      ctx.stroke();
    });

    // Draw Luxurious Polished Gold Corner Bracket Plates protecting wood framing
    const cornerPlates = [
      { x: 0, y: 0, w: 25, h: 25, r: 0 },
      { x: 800, y: 0, w: 25, h: 25, r: Math.PI * 0.5 },
      { x: 0, y: 400, w: 25, h: 25, r: -Math.PI * 0.5 },
      { x: 800, y: 400, w: 25, h: 25, r: Math.PI },
    ];
    cornerPlates.forEach((cp) => {
      ctx.save();
      ctx.translate(cp.x, cp.y);
      ctx.rotate(cp.r);
      const brassGrad = ctx.createLinearGradient(0, 0, 20, 20);
      brassGrad.addColorStop(0, '#78350f'); // shadow brass
      brassGrad.addColorStop(0.4, '#fbbf24'); // shiny gold
      brassGrad.addColorStop(0.85, '#fef08a'); // specular glint
      brassGrad.addColorStop(1, '#92400e');
      ctx.fillStyle = brassGrad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(26, 0);
      ctx.bezierCurveTo(24, 15, 15, 24, 0, 26);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });

    // 4. Draw Table Headstring (D-Zone) and Spot Marker with fine luxury details
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(200, 21);
    ctx.lineTo(200, 379);
    ctx.stroke();

    // Characteristics of classic professional tables: Elegant D-Zone curve
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.arc(200, 200, 48, Math.PI * 0.5, Math.PI * 1.5, false); // Semi-circle pointing to the left D-zone
    ctx.stroke();

    // Center Spot marker (D-spot) with silver outline
    ctx.beginPath();
    ctx.arc(200, 200, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(200, 200, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fill();

    // Foot spot marker (billiard ball racking spot)
    ctx.beginPath();
    ctx.arc(600, 200, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(600, 200, 1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fill();

     // 4.5. Render Sinking Balls with Ultimate Realism (Vortex suction, progressive shrinking, and atmospheric pocket-depth shadow overlays)
    sinkingBallsRef.current = sinkingBallsRef.current.filter((sb) => {
      sb.progress += 1;
      if (sb.progress >= sb.maxProgress) return false;

      // Cubic ease-out calculation for smooth decelerating spiral vortex entry
      const t = sb.progress / sb.maxProgress;
      const tEase = 1 - Math.pow(1 - t, 3); // ease out

      // Move the ball dynamically towards the pocket center with spiral/curved path (vortex simulation!)
      const pullForce = tEase;
      const currentX = sb.ball.x + (sb.pocketX - sb.ball.x) * pullForce;
      const currentY = sb.ball.y + (sb.pocketY - sb.ball.y) * pullForce;

      // Realistic scale: shrink ball as it "drops" down into depth of the pocket (z-dimension)
      const scale = 1.0 - tEase * 0.45; // up to 45% smaller

      // Alpha fade: fade out as it sinks deeper into total leather pocket dark area
      const alpha = 1.0 - Math.pow(t, 2); // fast fade-out at the very end

      const px = currentX;
      const py = currentY;
      const r = sb.ball.radius * scale;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Level A: Sinking shadow on pocket leather
      const pocketShadow = ctx.createRadialGradient(px + 1.5, py + 2.0, 1, px + 1.5, py + 2.0, r * 1.5);
      pocketShadow.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
      pocketShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.beginPath();
      ctx.arc(px + 1.5, py + 2.0, r * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = pocketShadow;
      ctx.fill();

      // Sphere base color path
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = sb.ball.color;
      ctx.fill();

      // Stripe stripe design
      if (sb.ball.type === 'stripe') {
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.clip();

        // Cream base
        ctx.fillStyle = '#fafaf9';
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();

        // Belt curve
        ctx.fillStyle = sb.ball.color;
        ctx.beginPath();
        ctx.ellipse(px, py, r, r * 0.60, Math.PI * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Render Number Badge
      if (sb.ball.id !== 0 && sb.ball.number !== undefined) {
        ctx.beginPath();
        ctx.arc(px, py, r * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = '#fffaeb';
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 0.5 * scale;
        ctx.stroke();

        ctx.fillStyle = '#1e293b';
        ctx.font = `bold ${Math.max(4, 5.5 * scale)}px "JetBrains Mono", Courier New, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(sb.ball.number), px, py + 0.35);
      }

      // Overlap real Depth black layer simulating how it enters the dark abyss of the hollow pocket
      const levelDarkness = t * 0.92; // up to 92% dark
      const depthShader = ctx.createRadialGradient(px, py, 0, px, py, r);
      depthShader.addColorStop(0, `rgba(0, 0, 0, ${levelDarkness})`);
      depthShader.addColorStop(1, `rgba(0, 0, 0, ${levelDarkness * 1.05})`);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = depthShader;
      ctx.fill();

      // Overhead glare reflection fade out
      const localSpecular = ctx.createRadialGradient(px - r * 0.35, py - r * 0.35, 0.1, px, py, r);
      localSpecular.addColorStop(0, `rgba(255, 255, 255, ${0.8 * (1 - t * 0.9)})`);
      localSpecular.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = localSpecular;
      ctx.fill();

      ctx.restore();

      return true;
    });

    // 5. Render All Balls using Ultra-Realistic 3D Spherical Glistening Shaders
    animatedBallsRef.current.forEach((b) => {
      if (b.isPocketed) return;

      const px = isScratchPlacingRef.current && b.id === 0 ? placedPosRef.current.x : b.x;
      const py = isScratchPlacingRef.current && b.id === 0 ? placedPosRef.current.y : b.y;
      // Level A: Ambient shadow (blurred large outer layer)
      const outerShadow = ctx.createRadialGradient(px + 2.4, py + 3.4, 0.5, px + 2.4, py + 3.4, b.radius * 1.6);
      outerShadow.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
      outerShadow.addColorStop(0.35, 'rgba(0, 0, 0, 0.32)');
      outerShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.beginPath();
      ctx.arc(px + 2.4, py + 3.4, b.radius * 1.6, 0, Math.PI * 2);
      ctx.fillStyle = outerShadow;
      ctx.fill();

      // Level B: Direct contact shadow (tight, very dark layer grounding the sphere)
      ctx.beginPath();
      ctx.arc(px + 0.6, py + 0.9, b.radius * 0.95, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fill();

      // TARGET BALLS GLOWING CROWN/HALO SYSTEM (Premium 8-Ball Game Vibe)
      const eligibleIds = getEligibleBallIds(roomStateRef.current, roomStateRef.current.currentTurn);
      const isTarget = eligibleIds.includes(b.id);
      
      if (isTarget) {
        const time = Date.now();
        const elapsed = time - turnStartTimestampRef.current;
        const visibleTime = 4000; // 4 seconds full visibility
        const fadeTime = 1500;    // 1.5 seconds smooth fade out
        let baseAlphaScalar = 1.0;
        if (elapsed > visibleTime) {
          baseAlphaScalar = Math.max(0, 1.0 - (elapsed - visibleTime) / fadeTime);
        }

        if (baseAlphaScalar > 0) {
          const isMyTurnActive = (roomStateRef.current.currentTurn === myPlayerIdRef.current);
          const baseAlpha = (isMyTurnActive ? 0.75 : 0.5) * baseAlphaScalar;
          const mainColor = isMyTurnActive ? '34, 211, 238' : '245, 158, 11'; // Cyan vs Amber
          const accentColor = isMyTurnActive ? '6, 182, 212' : '234, 140, 8';

          // Under-glow underneath the shadow (much tighter & more professional)
          ctx.save();
          const underGlow = ctx.createRadialGradient(px, py, b.radius - 1, px, py, b.radius + 6);
          underGlow.addColorStop(0, `rgba(${mainColor}, ${0.25 * baseAlpha})`);
          underGlow.addColorStop(0.6, `rgba(${accentColor}, ${0.08 * baseAlpha})`);
          underGlow.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.beginPath();
          ctx.arc(px, py, b.radius + 6, 0, Math.PI * 2);
          ctx.fillStyle = underGlow;
          ctx.fill();
          ctx.restore();

          // 1. Concentric Radial Ripples (Extremely subtle, tightly hugged fluid wave rings)
          for (let rIndex = 0; rIndex < 2; rIndex++) {
            const wavePhase = ((time / 1200) + rIndex * 0.5) % 1.0; // cycle from 0 to 1
            const rippleRadius = b.radius + 1.5 + wavePhase * 4.5;
            const rippleAlpha = (1.0 - wavePhase) * 0.35 * baseAlpha;

            ctx.save();
            ctx.beginPath();
            ctx.arc(px, py, rippleRadius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${mainColor}, ${rippleAlpha})`;
            ctx.lineWidth = 0.8 + (1.0 - wavePhase) * 0.5;
            ctx.stroke();
            ctx.restore();
          }

          // 2. High-Tech Rotating Dotted Orbital Ring (Tighter profile around the ball)
          ctx.save();
          ctx.beginPath();
          ctx.arc(px, py, b.radius + 2.2, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${mainColor}, ${0.65 * baseAlpha})`;
          ctx.lineWidth = 1.0;
          // Rotating dash effect:
          ctx.setLineDash([3, 2]);
          ctx.lineDashOffset = -(time / 25) % 100;
          ctx.stroke();
          ctx.restore();

          // 3. Subtle outer crosshair corner brackets (Slightly smaller, nestled cleanly)
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(time * 0.0004); // slowly rotating brackets
          ctx.strokeStyle = `rgba(${mainColor}, ${0.35 * baseAlpha})`;
          ctx.lineWidth = 0.8;
          const bLen = 2.0; // bracket line length
          const bDist = b.radius + 3.8; // bracket distance from center
          
          // 4 Brackets at 45, 135, 225, 315 degrees
          for (let aCorner = 0; aCorner < 4; aCorner++) {
            ctx.save();
            ctx.rotate((aCorner * Math.PI) / 2 + Math.PI / 4);
            ctx.beginPath();
            ctx.moveTo(bDist - bLen, bDist);
            ctx.lineTo(bDist, bDist);
            ctx.lineTo(bDist, bDist - bLen);
            ctx.stroke();
            ctx.restore();
          }
          ctx.restore();
        }
      }

      // Get stored 3D rotation phase
      if (!ballRotationsRef.current[b.id]) {
        ballRotationsRef.current[b.id] = {
          ux: [1, 0, 0],
          uy: [0, 1, 0],
          uz: [0, 0, 1],
          angle: 0,
          pitch: 0,
          yaw: 0
        };
      }
      const rot = ballRotationsRef.current[b.id];
      const ux = rot.ux || [1, 0, 0];
      const uy = rot.uy || [0, 1, 0];
      const uz = rot.uz || [0, 0, 1];

      // Premium blending utility to keep colors incredibly vibrant and beautiful
      const blendColor = (hex: string, targetColor: string, factor: number): string => {
        const cleanHex = hex.startsWith('#') ? hex.slice(1) : hex;
        const cleanTarget = targetColor.startsWith('#') ? targetColor.slice(1) : targetColor;
        
        const r1 = parseInt(cleanHex.slice(0, 2), 16);
        const g1 = parseInt(cleanHex.slice(2, 4), 16);
        const b1 = parseInt(cleanHex.slice(4, 6), 16);
        
        const r2 = parseInt(cleanTarget.slice(0, 2), 16);
        const g2 = parseInt(cleanTarget.slice(2, 4), 16);
        const b2 = parseInt(cleanTarget.slice(4, 6), 16);
        
        const R = Math.max(0, Math.min(255, Math.round(r1 + (r2 - r1) * factor)));
        const G = Math.max(0, Math.min(255, Math.round(g1 + (g2 - g1) * factor)));
        const B = Math.max(0, Math.min(255, Math.round(b1 + (b2 - b1) * factor)));
        
        return "#" + ((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1);
      };

      // Helper to generate a gorgeous 3D radial gradient for ball pigment with premium varnish depth
      const getBallBaseGradient = (color: string, radius: number): CanvasGradient => {
        const highlightColor = blendColor(color, '#ffffff', 0.18); // softer, more believable white specular
        const coreTone = blendColor(color, '#111111', 0.14);
        const shadowColor = blendColor(color, '#000000', 0.82); // rich edge depth
        const rimGlow = blendColor(color, '#ffffff', 0.08); // subtle reflection rim

        const grad = ctx.createRadialGradient(
          px - radius * 0.34,
          py - radius * 0.34,
          Math.max(1.2, radius * 0.18),
          px,
          py,
          radius
        );
        grad.addColorStop(0, highlightColor);
        grad.addColorStop(0.18, color);
        grad.addColorStop(0.42, coreTone);
        grad.addColorStop(0.72, shadowColor);
        grad.addColorStop(0.9, rimGlow);
        grad.addColorStop(1, blendColor(color, '#000000', 0.92));
        return grad;
      };

      // SPHERE BASE & STRIPE GORGEOUS RENDER
      if (b.id !== 0 && b.type === 'stripe') {
        // Stripe ball background is pure cream white ivory (with subtle 3D depth gradient)
        ctx.beginPath();
        ctx.arc(px, py, b.radius, 0, Math.PI * 2);
        
        const ivoryGrad = ctx.createRadialGradient(
          px - b.radius * 0.32,
          py - b.radius * 0.32,
          0,
          px,
          py,
          b.radius
        );
        ivoryGrad.addColorStop(0, '#ffffff');
        ivoryGrad.addColorStop(0.6, '#f7f4ef');
        ivoryGrad.addColorStop(1, '#d9d4cb'); // warmer ivory edge shadow
        
        ctx.fillStyle = ivoryGrad;
        ctx.fill();

        // Clip the colored belt to the boundaries of the sphere
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, b.radius, 0, Math.PI * 2);
        ctx.clip();

        // Draw equatorial colored belt of about 62% width of the ball, warped by 3D rotation
        const minorRadius = b.radius * (0.16 + 0.46 * Math.abs(uy[2]));
        const beltAngle = Math.atan2(uy[1], uy[0]) + Math.PI / 2;

        // Draw micro-embossed shadow seam (3D edge line where stripe meets ivory on the sphere)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
        ctx.beginPath();
        ctx.ellipse(px, py, b.radius + 0.35, minorRadius + 0.35, beltAngle, 0, Math.PI * 2);
        ctx.fill();

        // Main stripe belt body with 3D color gradient
        ctx.fillStyle = getBallBaseGradient(b.color, b.radius);
        ctx.beginPath();
        ctx.ellipse(px, py, b.radius, minorRadius, beltAngle, 0, Math.PI * 2);
        ctx.fill();

        // High gloss inner highlight inside stripe belt
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.26)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(px, py, b.radius * 0.9, minorRadius * 0.9, beltAngle, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();

        // Add a subtle dark rim for stronger depth
        ctx.beginPath();
        ctx.arc(px, py, b.radius - 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Soft highlight overlay for polished resin finish
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const stripeHighlight = ctx.createRadialGradient(
          px - b.radius * 0.32,
          py - b.radius * 0.34,
          0,
          px - b.radius * 0.16,
          py - b.radius * 0.18,
          b.radius * 0.55
        );
        stripeHighlight.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
        stripeHighlight.addColorStop(0.35, 'rgba(255, 255, 255, 0.12)');
        stripeHighlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = stripeHighlight;
        ctx.beginPath();
        ctx.arc(px, py, b.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        // Solid or Cue Ball: base is filled with premium 3D radial color gradient
        ctx.beginPath();
        ctx.arc(px, py, b.radius, 0, Math.PI * 2);
        ctx.fillStyle = getBallBaseGradient(b.color, b.radius);
        ctx.fill();

        // Add a subtle dark rim for stronger depth on solids/cue
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Add a strong directional specular highlight
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const whiteGlare = ctx.createRadialGradient(
          px - b.radius * 0.34,
          py - b.radius * 0.28,
          0,
          px - b.radius * 0.26,
          py - b.radius * 0.24,
          b.radius * 0.38
        );
        whiteGlare.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
        whiteGlare.addColorStop(0.18, 'rgba(255, 255, 255, 0.26)');
        whiteGlare.addColorStop(0.42, 'rgba(255, 255, 255, 0.06)');
        whiteGlare.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = whiteGlare;
        ctx.beginPath();
        ctx.arc(px, py, b.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Fine edge rim highlight for a polished glass-like border
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.arc(px, py, b.radius - 0.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // If it is a cue ball (id === 0), render high-fidelity "Measle Dots" to make spin visible!
      if (b.id === 0) {
        // A professional Aramith Pro-Cup TV cue ball has 6 red dots at local axes [±1, 0, 0], [0, ±1, 0], [0, 0, ±1]
        const directions = [
          [1, 0, 0], [-1, 0, 0],
          [0, 1, 0], [0, -1, 0],
          [0, 0, 1], [0, 0, -1]
        ];
        directions.forEach((dir) => {
          // World coordinate of this spot: W = lx * ux + ly * uy + lz * uz
          const wx = dir[0] * ux[0] + dir[1] * uy[0] + dir[2] * uz[0];
          const wy = dir[0] * ux[1] + dir[1] * uy[1] + dir[2] * uz[1];
          const wz = dir[0] * ux[2] + dir[1] * uy[2] + dir[2] * uz[2];

          // If facing the camera, draw it
          if (wz > 0) {
            const spotX = px + wx * b.radius;
            const spotY = py + wy * b.radius;
            const spotSize = 1.62 * wz; // scale size based on 3D depth to look rounded
            if (spotSize > 0.25) {
              // Shaded measle-dots for supreme realistic integration under light
              ctx.beginPath();
              ctx.arc(spotX, spotY, spotSize, 0, Math.PI * 2);
              
              const dotGrad = ctx.createRadialGradient(
                spotX - spotSize * 0.28, spotY - spotSize * 0.28, 0,
                spotX, spotY, spotSize
              );
              dotGrad.addColorStop(0, '#f87171'); // Specular focus on the red dot
              dotGrad.addColorStop(0.5, '#b91c1c'); // Official Aramith red
              dotGrad.addColorStop(1, '#6b1111'); // Dark shaded edge
              ctx.fillStyle = dotGrad;
              ctx.fill();
            }
          }
        });
      }

      // 3D SPHERICAL SHADING & VEILS OF THE TABLE REFLECTIONS
      // Overhead specular spot + Ambient green felt glow reflecting upwards onto the bottom of the ball
      const sphereShader = ctx.createRadialGradient(
        px - b.radius * 0.4,
        py - b.radius * 0.4,
        0.5,
        px - b.radius * 0.15,
        py - b.radius * 0.15,
        b.radius
      );
      sphereShader.addColorStop(0, 'rgba(255, 255, 255, 0.85)'); // Hot shiny specular point from overhead light source
      sphereShader.addColorStop(0.22, 'rgba(255, 255, 255, 0.38)'); // Sphere curve transition
      sphereShader.addColorStop(0.55, 'rgba(255, 255, 255, 0)'); // Core pigment
      sphereShader.addColorStop(0.85, 'rgba(0, 0, 0, 0.28)'); // Highly realistic soft 3D shadowed underside
      sphereShader.addColorStop(1, 'rgba(16, 185, 129, 0.18)'); // Soft, pristine green-felt bouncing reflection!

      ctx.beginPath();
      ctx.arc(px, py, b.radius, 0, Math.PI * 2);
      ctx.fillStyle = sphereShader;
      ctx.fill();

      // EXTRA DUAL SPECULAR LIGHTREFLECTION GLINT (Professional "overhead tube light glass-reflection" effect)
      // This is a thin white pill capsule that adds enormous realistic gloss factor!
      ctx.save();
      ctx.translate(px - b.radius * 0.42, py - b.radius * 0.42);
      ctx.rotate(-Math.PI * 0.25);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 1.1, 2.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Second soft point light to give volume depth
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.beginPath();
      ctx.arc(px - b.radius * 0.1, py - b.radius * 0.58, 1.2, 0, Math.PI * 2);
      ctx.fill();

      // Additional Secondary Sharp Backlight Glare Crescent (For high polished resin look)
      const secondaryGlare = ctx.createLinearGradient(px - b.radius, py - b.radius, px + b.radius, py + b.radius);
      secondaryGlare.addColorStop(0, 'rgba(255, 255, 255, 0)');
      secondaryGlare.addColorStop(0.8, 'rgba(255, 255, 255, 0)');
      secondaryGlare.addColorStop(1, 'rgba(255, 255, 255, 0.35)'); // bottom right crescent glare
      
      ctx.beginPath();
      ctx.arc(px, py, b.radius, 0, Math.PI * 2);
      ctx.fillStyle = secondaryGlare;
      ctx.fill();

      // DRAW NUMBER WITH 3D SPHERE ALIGNED PLACEMENT & CONCENTRIC BEVELED GOLD ACCENT RIM (Omit cue ball, id 0)
      if (b.id !== 0) {
        // We have two badges: Front at local [0, 0, 1] and Back at local [0, 0, -1]
        const badgeDirs = [
          { sign: 1 },
          { sign: -1 }
        ];

        badgeDirs.forEach(({ sign }) => {
          // World coordinate of this badge: W = sign * uz (since badges are at local [0, 0, ±1])
          const wx = sign * uz[0];
          const wy = sign * uz[1];
          const wz = sign * uz[2];

          if (wz > 0.15) {
            const badgeX = px + wx * b.radius * 0.92; // shift to follow sphere curvature perfectly
            const badgeY = py + wy * b.radius * 0.92;
            
            // Text orientation in screen space: derived from local upper axis uy
            const textAngle = Math.atan2(uy[1], uy[0]) - Math.PI / 2;

            ctx.save();
            ctx.translate(badgeX, badgeY);
            ctx.rotate(textAngle);

            // Gilded Metallic Luxurious Bevel Ring
            ctx.beginPath();
            ctx.ellipse(0, 0, 4.8, 4.8 * wz, 0, 0, Math.PI * 2);
            const metallicRim = ctx.createLinearGradient(-4, -4 * wz, 4, 4 * wz);
            metallicRim.addColorStop(0, '#fef08a'); // gold light
            metallicRim.addColorStop(0.5, '#ca8a04'); // gold raw
            metallicRim.addColorStop(1, '#713f12'); // shadow gold
            ctx.strokeStyle = metallicRim;
            ctx.lineWidth = 0.72;
            ctx.stroke();

            // Draw crisp circular badge for number (oval-warped by 3D spherical foreshortening)
            ctx.beginPath();
            ctx.ellipse(0, 0, 4.2, 4.2 * wz, 0, 0, Math.PI * 2);
            ctx.fillStyle = '#fffaeb'; // Elegant cream-colored badge
            ctx.fill();

            // Elegant tiny border around the number container
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
            ctx.lineWidth = 0.5;
            ctx.stroke();

            // 3D lettering indentation and crisp text
            ctx.scale(1, wz); // scale vertical text coordinate for 3D perspective warping

            ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
            ctx.font = 'bold 6.2px "JetBrains Mono", Courier New, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(b.number), 0.3, 0.5); // text shadow

            ctx.fillStyle = '#0f172a'; // true rich solid black ink
            ctx.fillText(String(b.number), 0, 0);
            ctx.restore();
          }
        });
      }
    });

    // 6. Draw Glowing Trajectory Laser Guide Lines & Cue Stick Shadow
    const isStrikingNow = strikeAnimRef.current && strikeAnimRef.current.active;
    const isMyTurnActive = isMyTurnRef.current && !roomStateRef.current.scratchOccurred && (!isAnimatingRef.current || isStrikingNow);
    const showCueStickAndPaths = isMyTurnActive || (!isMyTurnRef.current && opponentAim && !isAnimatingRef.current && roomStateRef.current.status === 'playing');
    
    if (showCueStickAndPaths) {
      const cueBall = animatedBallsRef.current.find((b) => b.id === 0);
      if (cueBall && !cueBall.isPocketed) {
        const showLasers = isMyTurnActive ? (!isAnimatingRef.current && !isStrikingNow) : true;
        
        const activeAngle = isMyTurnActive
          ? (isStrikingNow ? strikeAnimRef.current!.angle : aimAngleRef.current)
          : (opponentAim ? opponentAim.angle : 0);

        const activePower = isMyTurnActive
          ? (isStrikingNow ? strikeAnimRef.current!.power : shotPowerRef.current)
          : (opponentAim ? opponentAim.power : 40);

        const activeSpinX = isMyTurnActive ? spinXRef.current : (opponentAim?.spinX || 0);
        const activeSpinY = isMyTurnActive ? spinYRef.current : (opponentAim?.spinY || 0);

        const aimDx = Math.cos(activeAngle);
        const aimDy = Math.sin(activeAngle);

        if (showLasers) {
          const radius = 10;
        const minX = 20 + radius;
        const maxX = 780 - radius;
        const minY = 20 + radius;
        const maxY = 380 - radius;

        let tMin = Infinity;
        let pType: 'cushion' | 'ball' | 'none' = 'none';
        let cushionNormalX = 0;
        let cushionNormalY = 0;
        let targetBallObj: Ball | null = null;

        // A. Intersection with table bounds cushions
        if (aimDx > 0) {
          const t = (maxX - cueBall.x) / aimDx;
          if (t > 0 && t < tMin) {
            tMin = t;
            pType = 'cushion';
            cushionNormalX = -1;
            cushionNormalY = 0;
          }
        } else if (aimDx < 0) {
          const t = (minX - cueBall.x) / aimDx;
          if (t > 0 && t < tMin) {
            tMin = t;
            pType = 'cushion';
            cushionNormalX = 1;
            cushionNormalY = 0;
          }
        }
        if (aimDy > 0) {
          const t = (maxY - cueBall.y) / aimDy;
          if (t > 0 && t < tMin) {
            tMin = t;
            pType = 'cushion';
            cushionNormalX = 0;
            cushionNormalY = -1;
          }
        } else if (aimDy < 0) {
          const t = (minY - cueBall.y) / aimDy;
          if (t > 0 && t < tMin) {
            tMin = t;
            pType = 'cushion';
            cushionNormalX = 0;
            cushionNormalY = 1;
          }
        }

        // B. Intersection with any target balls on the felt
        for (let idx = 0; idx < animatedBallsRef.current.length; idx++) {
          const b = animatedBallsRef.current[idx];
          if (b.id === 0 || b.isPocketed) continue;
          const ocX = cueBall.x - b.x;
          const ocY = cueBall.y - b.y;
          const bGrad = 2 * (aimDx * ocX + aimDy * ocY);
          const cGrad = ocX * ocX + ocY * ocY - 400; // Combined radius squared (R_cue + R_target)^2 = 20^2 = 400
          const discriminant = bGrad * bGrad - 4 * cGrad;
          if (discriminant >= 0) {
            const t1 = (-bGrad - Math.sqrt(discriminant)) / 2;
            if (t1 > 0.001 && t1 < tMin) {
              tMin = t1;
              pType = 'ball';
              targetBallObj = b;
            }
          }
        }

        if (tMin === Infinity || tMin > 1000) {
          tMin = 240;
        }

        // Apply difficulty scaling to trace limits
        let drawTMin = tMin;
        if (difficultyRef.current === 'hard') {
          drawTMin = Math.min(tMin, 85); // 85px short line of sight for ultimate professional realism
        }

        const contactX = cueBall.x + aimDx * drawTMin;
        const contactY = cueBall.y + aimDy * drawTMin;

        // DRAW MULTI-LAYER GLOWING NEON LASER TRAJECTORY PATH (Outer light haze + sharp interior beam)
        const mainLaserColor = isMyTurnActive ? '#f59e0b' : '#06b6d4';
        const mainShadowColor = isMyTurnActive ? '#d97706' : '#0891b2';
        const mainHazeColor = isMyTurnActive ? 'rgba(245, 158, 11, 0.16)' : 'rgba(6, 182, 212, 0.16)';
        const pulseBorderPrefix = isMyTurnActive ? 'rgba(245, 158, 11,' : 'rgba(6, 182, 212,';
        const centerBeadColor = isMyTurnActive ? '#f59e0b' : '#06b6d4';

        // Draw Wide glowing pulse halo
        ctx.save();
        ctx.shadowColor = mainShadowColor;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = mainHazeColor;
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.moveTo(cueBall.x, cueBall.y);
        ctx.lineTo(contactX, contactY);
        ctx.stroke();
        ctx.restore();

        // Draw Sharp high-precision core beam
        ctx.save();
        ctx.strokeStyle = mainLaserColor; // gleaming gold or cyber cyan
        ctx.lineWidth = 1.6;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(cueBall.x, cueBall.y);
        ctx.lineTo(contactX, contactY);
        ctx.stroke();
        ctx.restore();

        if (Math.abs(activeSpinX) > 0.05 || Math.abs(activeSpinY) > 0.05) {
          const spinIndicatorRadius = 14;
          const spinDirection = Math.atan2(-activeSpinY, activeSpinX);
          ctx.save();
          ctx.translate(cueBall.x, cueBall.y);
          ctx.strokeStyle = 'rgba(248, 113, 113, 0.95)';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.arc(0, 0, spinIndicatorRadius, 0, Math.PI * 2);
          ctx.stroke();

          const arrowTipX = Math.cos(spinDirection) * spinIndicatorRadius;
          const arrowTipY = Math.sin(spinDirection) * spinIndicatorRadius;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(arrowTipX, arrowTipY);
          ctx.stroke();

          ctx.fillStyle = 'rgba(248, 113, 113, 0.75)';
          ctx.beginPath();
          ctx.arc(arrowTipX, arrowTipY, 2.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          ctx.save();
          ctx.font = '600 10px sans-serif';
          ctx.fillStyle = 'rgba(248, 113, 113, 0.92)';
          ctx.textAlign = 'center';
          const spinLabel = activeSpinY > 0 ? 'FOLLOW' : activeSpinY < 0 ? 'DRAW' : 'NEUTRAL';
          const englishLabel = activeSpinX > 0 ? 'RIGHT ENGLISH' : activeSpinX < 0 ? 'LEFT ENGLISH' : 'CENTER';
          ctx.fillText(`${spinLabel} • ${englishLabel}`, cueBall.x, cueBall.y + 44);
          ctx.restore();
        }

        if (difficultyRef.current !== 'hard') {
          // Animated target pulse rings radiating from collision points
          const pulseCycle = (Date.now() % 1200) / 1200;
          ctx.beginPath();
          ctx.arc(contactX, contactY, radius + pulseCycle * 7, 0, Math.PI * 2);
          ctx.strokeStyle = `${pulseBorderPrefix} ${0.5 * (1 - pulseCycle)})`;
          ctx.lineWidth = 1.4;
          ctx.stroke();

          // Draw glassy ghost ball positioned exactly at target contact intersection point
          ctx.beginPath();
          ctx.arc(contactX, contactY, radius, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          
          const glassSpot = ctx.createRadialGradient(
            contactX - radius * 0.3, contactY - radius * 0.3, 0.5,
            contactX, contactY, radius
          );
          glassSpot.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
          glassSpot.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
          glassSpot.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = glassSpot;
          ctx.fill();

          // Collision Node center bead
          ctx.beginPath();
          ctx.arc(contactX, contactY, 2.2, 0, Math.PI * 2);
          ctx.fillStyle = centerBeadColor;
          ctx.fill();
        }

        // CUESTICK REFLECTED TRAJECTORY DEFLECTIONS (Cushions or other spheres)
        if (pType === 'cushion' && difficultyRef.current !== 'hard') {
          // Bounce path off rail cushion
          const refDx = aimDx - 2 * (aimDx * cushionNormalX + aimDy * cushionNormalY) * cushionNormalX;
          const refDy = aimDy - 2 * (aimDx * cushionNormalX + aimDy * cushionNormalY) * cushionNormalY;

          // Apply ENGLISH side spin rebound angle deviation to the first bounce
          let curDx = refDx;
          let curDy = refDy;
          if (cushionNormalY !== 0) {
            curDx += activeSpinX * 0.45 * (-cushionNormalY);
          } else if (cushionNormalX !== 0) {
            curDy += activeSpinX * 0.45 * cushionNormalX;
          }

          // Normalize the post-spin trajectory vector
          const curMag = Math.sqrt(curDx * curDx + curDy * curDy) || 1;
          curDx /= curMag;
          curDy /= curMag;

          let currentX = contactX;
          let currentY = contactY;

          const bouncePoints = [{ x: cueBall.x, y: cueBall.y }, { x: contactX, y: contactY }];
          const maxBounces = difficultyRef.current === 'medium' ? 2 : 4; // Trace up to 4 segments (3 bounces) for maximum pro level guidance, 2 segments (1 bounce) in medium
          let totalLengthLeft = difficultyRef.current === 'medium' ? 65 : 450; // Total trajectory distance tracing limit

          for (let bIndex = 0; bIndex < maxBounces - 1; bIndex++) {
            let tMinB = Infinity;
            let nextNormalX = 0;
            let nextNormalY = 0;

            if (curDx > 0) {
              const t = (maxX - currentX) / curDx;
              if (t > 0.001 && t < tMinB) {
                tMinB = t;
                nextNormalX = -1;
                nextNormalY = 0;
              }
            } else if (curDx < 0) {
              const t = (minX - currentX) / curDx;
              if (t > 0.001 && t < tMinB) {
                tMinB = t;
                nextNormalX = 1;
                nextNormalY = 0;
              }
            }

            if (curDy > 0) {
              const t = (maxY - currentY) / curDy;
              if (t > 0.001 && t < tMinB) {
                tMinB = t;
                nextNormalX = 0;
                nextNormalY = -1;
              }
            } else if (curDy < 0) {
              const t = (minY - currentY) / curDy;
              if (t > 0.001 && t < tMinB) {
                tMinB = t;
                nextNormalX = 0;
                nextNormalY = 1;
              }
            }

            if (tMinB === Infinity || tMinB > 1000) {
              break;
            }

            const stepLen = Math.min(tMinB, totalLengthLeft);
            const nextX = currentX + curDx * stepLen;
            const nextY = currentY + curDy * stepLen;

            bouncePoints.push({ x: nextX, y: nextY });
            totalLengthLeft -= stepLen;
            if (totalLengthLeft <= 0) break;

            if (stepLen < tMinB) {
              break; // tracking reached trace range limit
            }

            // Reflect for the next segment if there is still tracing distance left
            const newRefDx = curDx - 2 * (curDx * nextNormalX + curDy * nextNormalY) * nextNormalX;
            const newRefDy = curDy - 2 * (curDx * nextNormalX + curDy * nextNormalY) * nextNormalY;
            curDx = newRefDx;
            curDy = newRefDy;
            currentX = nextX;
            currentY = nextY;
          }

          // Render the entire multi-reflection cue ball guide path
          ctx.save();
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.16)';
          ctx.lineWidth = 4.5;
          ctx.shadowColor = '#d97706';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(bouncePoints[0].x, bouncePoints[0].y);
          for (let i = 1; i < bouncePoints.length; i++) {
            ctx.lineTo(bouncePoints[i].x, bouncePoints[i].y);
          }
          ctx.stroke();
          ctx.restore();

          // Precise core segmented line with gold gradient aesthetics
          ctx.save();
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = '#f59e0b';
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.moveTo(bouncePoints[0].x, bouncePoints[0].y);
          for (let i = 1; i < bouncePoints.length; i++) {
            ctx.lineTo(bouncePoints[i].x, bouncePoints[i].y);
          }
          ctx.stroke();
          ctx.restore();

          // Render concentric glowing node beads at each rail deflection
          for (let i = 1; i < bouncePoints.length; i++) {
            const bp = bouncePoints[i];
            const bpPulse = ((Date.now() + i * 250) % 1100) / 1100;
            
            ctx.save();
            ctx.beginPath();
            ctx.arc(bp.x, bp.y, 4 + bpPulse * 5, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(245, 158, 11, ${0.45 * (1 - bpPulse)})`;
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(bp.x, bp.y, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#f59e0b';
            ctx.fill();

            // Render cushion bounce tags "BANK X" 
            if (difficultyRef.current === 'easy') {
              ctx.fillStyle = '#fffaeb';
              ctx.font = 'bold 7px "JetBrains Mono", monospace';
              ctx.textAlign = 'center';
              ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
              ctx.shadowBlur = 3;
              ctx.fillText(`BANK ${i}`, bp.x, bp.y < 35 ? bp.y + 12 : bp.y - 8);
            }
            ctx.restore();
          }
        } else if (pType === 'ball' && targetBallObj && difficultyRef.current !== 'hard') {
          // Ball to Ball displacement deflected routing paths
          const phiDx = targetBallObj.x - contactX;
          const phiDy = targetBallObj.y - contactY;
          const phiDist = Math.sqrt(phiDx * phiDx + phiDy * phiDy) || 1;
          const phiNormX = phiDx / phiDist;
          const phiNormY = phiDy / phiDist;

          // Compute cut angle in degrees for pro telemetry
          const cosCut = aimDx * phiNormX + aimDy * phiNormY;
          const cutAngleRad = Math.acos(Math.max(-1, Math.min(1, cosCut)));
          const cutAngleDeg = Math.round((cutAngleRad * 180) / Math.PI);

          // Calculate Target Ball's trajectory to cushions to make it continuous and highly precise
          let tcMin = Infinity;
          let targetCushionNormalX = 0;
          let targetCushionNormalY = 0;

          if (phiNormX > 0) {
            const t = (maxX - targetBallObj.x) / phiNormX;
            if (t > 0 && t < tcMin) {
              tcMin = t;
              targetCushionNormalX = -1;
              targetCushionNormalY = 0;
            }
          } else if (phiNormX < 0) {
            const t = (minX - targetBallObj.x) / phiNormX;
            if (t > 0 && t < tcMin) {
              tcMin = t;
              targetCushionNormalX = 1;
              targetCushionNormalY = 0;
            }
          }
          if (phiNormY > 0) {
            const t = (maxY - targetBallObj.y) / phiNormY;
            if (t > 0 && t < tcMin) {
              tcMin = t;
              targetCushionNormalX = 0;
              targetCushionNormalY = -1;
            }
          } else if (phiNormY < 0) {
            const t = (minY - targetBallObj.y) / phiNormY;
            if (t > 0 && t < tcMin) {
              tcMin = t;
              targetCushionNormalX = 0;
              targetCushionNormalY = 1;
            }
          }

          if (tcMin === Infinity || tcMin > 1000) {
            tcMin = 150; // fallback length
          }

          if (difficultyRef.current === 'medium') {
            tcMin = Math.min(tcMin, 65); // Short direct impact guidelines for intermediate realistic guidance
          }

          const targetContactX = targetBallObj.x + phiNormX * tcMin;
          const targetContactY = targetBallObj.y + phiNormY * tcMin;

          // Check if Target Ball's line of sight intersects any of the 6 pocket centers
          const pockets = [
            { id: 'TL', x: 22, y: 22 },
            { id: 'TC', x: 400, y: 18 },
            { id: 'TR', x: 778, y: 22 },
            { id: 'BL', x: 22, y: 378 },
            { id: 'BC', x: 400, y: 382 },
            { id: 'BR', x: 778, y: 378 },
          ];

          let targetPocket = null;

          // Render Target Ball Primary path
          ctx.save();
          ctx.shadowColor = '#059669';
          ctx.shadowBlur = 8;
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.18)';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(targetBallObj.x, targetBallObj.y);
          ctx.lineTo(targetContactX, targetContactY);
          ctx.stroke();

          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 1.6;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(targetBallObj.x, targetBallObj.y);
          ctx.lineTo(targetContactX, targetContactY);
          ctx.stroke();
          ctx.restore();

          // If no pocket hit, draw cushion deflection bounce path for the target ball (Multi-Reflection Bank shoot trajectory! - Easy mode only)
          if (!targetPocket && tcMin !== Infinity && difficultyRef.current === 'easy') {
            const firstTargetRefDx = phiNormX - 2 * (phiNormX * targetCushionNormalX + phiNormY * targetCushionNormalY) * targetCushionNormalX;
            const firstTargetRefDy = phiNormY - 2 * (phiNormX * targetCushionNormalX + phiNormY * targetCushionNormalY) * targetCushionNormalY;

            let curTDx = firstTargetRefDx;
            let curTDy = firstTargetRefDy;
            let currentTX = targetContactX;
            let currentTY = targetContactY;
            let activeTargetNormalX = targetCushionNormalX;
            let activeTargetNormalY = targetCushionNormalY;

            const targetPoints = [{ x: targetBallObj.x, y: targetBallObj.y }, { x: targetContactX, y: targetContactY }];
            let targetPocketOnBank = null;

            // Trace second segment
            let tMinT2 = Infinity;
            let nextTNormalX = 0;
            let nextTNormalY = 0;

            if (curTDx > 0) {
              const t = (maxX - currentTX) / curTDx;
              if (t > 0.001 && t < tMinT2) {
                tMinT2 = t;
                nextTNormalX = -1;
                nextTNormalY = 0;
              }
            } else if (curTDx < 0) {
              const t = (minX - currentTX) / curTDx;
              if (t > 0.001 && t < tMinT2) {
                tMinT2 = t;
                nextTNormalX = 1;
                nextTNormalY = 0;
              }
            }

            if (curTDy > 0) {
              const t = (maxY - currentTY) / curTDy;
              if (t > 0.001 && t < tMinT2) {
                tMinT2 = t;
                nextTNormalX = 0;
                nextTNormalY = -1;
              }
            } else if (curTDy < 0) {
              const t = (minY - currentTY) / curTDy;
              if (t > 0.001 && t < tMinT2) {
                tMinT2 = t;
                nextTNormalX = 0;
                nextTNormalY = 1;
              }
            }

            if (tMinT2 !== Infinity && tMinT2 > 0) {
              const tContactX2 = currentTX + curTDx * tMinT2;
              const tContactY2 = currentTY + curTDy * tMinT2;

              targetPoints.push({ x: tContactX2, y: tContactY2 });

              // We trace a THIRD bank segment too for extra visual assistance !
              const curTDx3 = curTDx - 2 * (curTDx * nextTNormalX + curTDy * nextTNormalY) * nextTNormalX;
              const curTDy3 = curTDy - 2 * (curTDx * nextTNormalX + curTDy * nextTNormalY) * nextTNormalY;

              let tMinT3 = Infinity;
              let nextTNormalX3 = 0;
              let nextTNormalY3 = 0;

              if (curTDx3 > 0) {
                const t = (maxX - tContactX2) / curTDx3;
                if (t > 0.001 && t < tMinT3) { tMinT3 = t; nextTNormalX3 = -1; nextTNormalY3 = 0; }
              } else if (curTDx3 < 0) {
                const t = (minX - tContactX2) / curTDx3;
                if (t > 0.001 && t < tMinT3) { tMinT3 = t; nextTNormalX3 = 1; nextTNormalY3 = 0; }
              }
              if (curTDy3 > 0) {
                const t = (maxY - tContactY2) / curTDy3;
                if (t > 0.001 && t < tMinT3) { tMinT3 = t; nextTNormalX3 = 0; nextTNormalY3 = -1; }
              } else if (curTDy3 < 0) {
                const t = (minY - tContactY2) / curTDy3;
                if (t > 0.001 && t < tMinT3) { tMinT3 = t; nextTNormalX3 = 0; nextTNormalY3 = 1; }
              }

              if (tMinT3 !== Infinity && tMinT3 > 0) {
                const tContactX3 = tContactX2 + curTDx3 * Math.min(tMinT3, 110);
                const tContactY3 = tContactY2 + curTDy3 * Math.min(tMinT3, 110);
                targetPoints.push({ x: tContactX3, y: tContactY3 });
              }
            }

            // Draw multi-bounce path for the target ball
            ctx.save();
            ctx.shadowColor = '#059669';
            ctx.shadowBlur = 6;
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 2.5]);
            ctx.beginPath();
            ctx.moveTo(targetPoints[0].x, targetPoints[0].y);
            for (let i = 1; i < targetPoints.length; i++) {
              ctx.lineTo(targetPoints[i].x, targetPoints[i].y);
            }
            ctx.stroke();
            ctx.restore();

            // Render cushion bounce rings & contact point nodes
            for (let i = 1; i < targetPoints.length; i++) {
              const tp = targetPoints[i];
              ctx.save();
              ctx.beginPath();
              ctx.arc(tp.x, tp.y, 3, 0, Math.PI * 2);
              ctx.fillStyle = '#10b981';
              ctx.fill();
              ctx.restore();
            }
          }

          // Render Cue Ball tangent vector deflection path (gold/yellow deflection) with secondary wall bounce check too!
          let perpDx = -phiNormY;
          let perpDy = phiNormX;
          const dot = aimDx * perpDx + aimDy * perpDy;
          if (dot < 0) {
            perpDx = phiNormY;
            perpDy = -phiNormX;
          }

          // Calculate Cue Ball tangent path projection to boundaries
          let tpMin = Infinity;
          let tangentCushionNormalX = 0;
          let tangentCushionNormalY = 0;

          if (perpDx > 0) {
            const t = (maxX - contactX) / perpDx;
            if (t > 0 && t < tpMin) {
              tpMin = t;
              tangentCushionNormalX = -1;
              tangentCushionNormalY = 0;
            }
          } else if (perpDx < 0) {
            const t = (minX - contactX) / perpDx;
            if (t > 0 && t < tpMin) {
              tpMin = t;
              tangentCushionNormalX = 1;
              tangentCushionNormalY = 0;
            }
          }
          if (perpDy > 0) {
            const t = (maxY - contactY) / perpDy;
            if (t > 0 && t < tpMin) {
              tpMin = t;
              tangentCushionNormalX = 0;
              tangentCushionNormalY = -1;
            }
          } else if (perpDy < 0) {
            const t = (minY - contactY) / perpDy;
            if (t > 0 && t < tpMin) {
              tpMin = t;
              tangentCushionNormalX = 0;
              tangentCushionNormalY = 1;
            }
          }

          if (tpMin === Infinity || tpMin > 1000) {
            tpMin = 65;
          }

          if (difficultyRef.current === 'medium') {
            tpMin = Math.min(tpMin, 50); // Short direct impact tangent line for semi-realistic guidance
          }

          const tangentContactX = contactX + perpDx * tpMin;
          const tangentContactY = contactY + perpDy * tpMin;

          // Draw first tier deflection line for Cue Ball (curving if spinY is active)
          ctx.save();
          ctx.strokeStyle = isMyTurnActive ? 'rgba(245, 158, 11, 0.85)' : 'rgba(6, 182, 212, 0.85)';
          ctx.lineWidth = 1.3;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(contactX, contactY);
          if (activeSpinY !== 0 && difficultyRef.current === 'easy') {
            // Draw a high-quality quadratic curved guide representing Follow (activeSpinY > 0) or Draw (activeSpinY < 0) dynamic bends! (Easy only)
            const midX = (contactX + tangentContactX) / 2;
            const midY = (contactY + tangentContactY) / 2;
            // Displacement along the original aim shot axis
            const bendAmt = activeSpinY * 40;
            const ctrlX = midX + aimDx * bendAmt;
            const ctrlY = midY + aimDy * bendAmt;
            ctx.quadraticCurveTo(ctrlX, ctrlY, tangentContactX, tangentContactY);
          } else {
            ctx.lineTo(tangentContactX, tangentContactY);
          }
          ctx.stroke();

          // Draw second tier cue ball reflection off the rail cushion, factoring in dynamic side spin (English) (Multi-Reflection trajectory) - Easy Only
          if (tpMin < 200 && tpMin > 1 && difficultyRef.current === 'easy') {
            let tangRefDx = perpDx - 2 * (perpDx * tangentCushionNormalX + perpDy * tangentCushionNormalY) * tangentCushionNormalX;
            let tangRefDy = perpDy - 2 * (perpDx * tangentCushionNormalX + perpDy * tangentCushionNormalY) * tangentCushionNormalY;

            // Apply ENGLISH angle deviation to post-bounce line of sight to make game elements extremely professional!
            if (tangentCushionNormalY !== 0) {
              // horizontal cushion impact: side-spin deflects along horizontal axis (factor of vertical rebound normal)
              // If hitting top cushion (normalY = -1), spinX > 0 pushes it right. If bottom (normalY = 1), spinX > 0 pushes it left.
              tangRefDx += activeSpinX * 0.45 * (-tangentCushionNormalY);
            } else if (tangentCushionNormalX !== 0) {
              // vertical cushion impact: side-spin deflects along vertical axis
              // If hitting left cushion (normalX = 1), spinX > 0 pushes it up (negative Y). If right (normalX = -1), spinX > 0 pushes it down (positive Y).
              tangRefDy += activeSpinX * 0.45 * tangentCushionNormalX;
            }

            // Normalize deviated post-spin vector
            const tangMag = Math.sqrt(tangRefDx * tangRefDx + tangRefDy * tangRefDy) || 1;
            tangRefDx /= tangMag;
            tangRefDy /= tangMag;

            const tangentPoints = [{ x: contactX, y: contactY }, { x: tangentContactX, y: tangentContactY }];
            let curCdx = tangRefDx;
            let curCdy = tangRefDy;
            let curCX = tangentContactX;
            let curCY = tangentContactY;

            const maxTangBounces = 3; // Trace up to 3 segments (2 bounces) for post-collision tangent movement
            let totalLengthLeft = 320;

            for (let bIndex = 0; bIndex < maxTangBounces - 1; bIndex++) {
              let tMinB = Infinity;
              let nextNormalX = 0;
              let nextNormalY = 0;

              if (curCdx > 0) {
                const t = (maxX - curCX) / curCdx;
                if (t > 0.001 && t < tMinB) { tMinB = t; nextNormalX = -1; nextNormalY = 0; }
              } else if (curCdx < 0) {
                const t = (minX - curCX) / curCdx;
                if (t > 0.001 && t < tMinB) { tMinB = t; nextNormalX = 1; nextNormalY = 0; }
              }

              if (curCdy > 0) {
                const t = (maxY - curCY) / curCdy;
                if (t > 0.001 && t < tMinB) { tMinB = t; nextNormalX = 0; nextNormalY = -1; }
              } else if (curCdy < 0) {
                const t = (minY - curCY) / curCdy;
                if (t > 0.001 && t < tMinB) { tMinB = t; nextNormalX = 0; nextNormalY = 1; }
              }

              if (tMinB === Infinity || tMinB > 1000) {
                break;
              }

              const stepLen = Math.min(tMinB, totalLengthLeft);
              const nextX = curCX + curCdx * stepLen;
              const nextY = curCY + curCdy * stepLen;

              tangentPoints.push({ x: nextX, y: nextY });
              totalLengthLeft -= stepLen;
              if (totalLengthLeft <= 0) break;

              if (stepLen < tMinB) {
                break;
              }

              // Reflect for the next segment
              const newRefDx = curCdx - 2 * (curCdx * nextNormalX + curCdy * nextNormalY) * nextNormalX;
              const newRefDy = curCdy - 2 * (curCdx * nextNormalX + curCdy * nextNormalY) * nextNormalY;
              curCdx = newRefDx;
              curCdy = newRefDy;
              curCX = nextX;
              curCY = nextY;
            }

            ctx.save();
            ctx.strokeStyle = isMyTurnActive ? 'rgba(245, 158, 11, 0.55)' : 'rgba(6, 182, 212, 0.55)';
            ctx.lineWidth = 1.1;
            ctx.setLineDash([1.5, 2]);
            ctx.beginPath();
            ctx.moveTo(tangentPoints[1].x, tangentPoints[1].y);
            for (let i = 2; i < tangentPoints.length; i++) {
              ctx.lineTo(tangentPoints[i].x, tangentPoints[i].y);
            }
            ctx.stroke();

            // Contact nodes for secondary tangent bounces
            for (let i = 1; i < tangentPoints.length; i++) {
              const tp = tangentPoints[i];
              ctx.beginPath();
              ctx.arc(tp.x, tp.y, 2.5, 0, Math.PI * 2);
              ctx.fillStyle = centerBeadColor;
              ctx.fill();
            }
            ctx.restore();
          }
          ctx.restore();

          // Render telemetry labels overlay on top of the contact point (Cut angle, Straight score, etc)
          ctx.save();
          ctx.fillStyle = '#fffaeb';
          ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
          ctx.shadowBlur = 4;
          
          let angleText = `${cutAngleDeg}° Cut`;
          if (cutAngleDeg < 3.5) angleText = "Straight Shot (مباشر)";
          else if (cutAngleDeg > 78) angleText = "Thin Cut (رقيق جداً)";
          
          ctx.fillText(angleText, contactX, contactY - 15);
          ctx.restore();
        }
      }

        // 7. Render Magnificent Wooden Graduated Cue Stick WITH FLOATING GAP CAST SHADOW
        // Physical stick pullback clearance
        let stickOpacity = 1.0;
        let stickDist = 18 + (activePower / 100) * 105; 
        const stickLength = 250;

        // Realistic hand tremor / tension vibration when pulling back powerful shots
        const activePulling = isMyTurnActive ? isPullingRef.current : (opponentAim && opponentAim.power > 5);
        if (activePulling && activePower > 35) {
          const tensionRatio = (activePower - 35) / 65; // 0.0 to 1.0
          const trembleIntensity = tensionRatio * 0.75; // max 0.75px tremble
          stickDist += Math.sin(performance.now() * 0.08) * trembleIntensity;
        }

        if (isStrikingNow && strikeAnimRef.current) {
          if (strikeAnimRef.current.startTime === -1) {
            // Wait with stick fully pulled back until physics frames arrive
            stickDist = 18 + (strikeAnimRef.current.power / 100) * 105;
            stickOpacity = 1.0;
          } else {
            const STRIKE_ACCEL = 40;  // Ultra-snappy 40ms forward hit acceleration
            const FOLLOW_FADE = 320;   // Elegant 320ms follow-through and blend-out
            const totalDuration = STRIKE_ACCEL + FOLLOW_FADE;
            
            const elapsed = performance.now() - strikeAnimRef.current.startTime;
            
            if (elapsed < STRIKE_ACCEL) {
              const t = Math.min(1, elapsed / STRIKE_ACCEL);
              const chargeDist = 18 + (strikeAnimRef.current.power / 100) * 105;
              const easeT = t * t * t; // Smooth acceleration representing coiling muscle relief
              stickDist = chargeDist - easeT * (chargeDist - 9.0);
              stickOpacity = 1.0;
            } else if (elapsed < totalDuration) {
              const tFade = Math.min(1, (elapsed - STRIKE_ACCEL) / FOLLOW_FADE);
              
              // Professional follow-through: Depth of forward stroke penetrates ball radius relative to power!
              const baseFollowThrough = 8;
              const maxFollowThrough = baseFollowThrough + (strikeAnimRef.current.power / 100) * 20; 
              stickDist = 9.0 - Math.sin(tFade * Math.PI * 0.5) * maxFollowThrough;
              
              // Professional power-curve ease out (exponential decay so it disappears cleanly instead of abruptly)
              stickOpacity = Math.max(0, Math.pow(1.0 - tFade, 2.0));
              
              // Trigger hit sound, responsive screen shake, and sparks exactly on contact!
              if (!strikeAnimRef.current.hasStruck) {
                strikeAnimRef.current.hasStruck = true;
                poolAudio.playCueHit(strikeAnimRef.current.power);
                triggerShootParticles(strikeAnimRef.current.power);
                
                // Synchronize physical strike shock with table viewport camera vibration
                impactShakeRef.current = Math.min(14.0, 2.0 + (strikeAnimRef.current.power / 100) * 12.0);
              }
            } else {
              // Animation finished
              strikeAnimRef.current.active = false;
              strikeAnimRef.current.hasStruck = true;
              stickOpacity = 0;
            }
          }
        }
        
        ctx.save();
        ctx.globalAlpha = stickOpacity;

        const stickBackX = cueBall.x - aimDx * (stickDist + stickLength);
        const stickBackY = cueBall.y - aimDy * (stickDist + stickLength);
        const stickTipX = cueBall.x - aimDx * stickDist;
        const stickTipY = cueBall.y - aimDy * stickDist;

        // HIGH END CUE STICK FLOATING SHADOW (Casts further offset based on dynamic height, simulating lift!)
        // The shadow should shift away by ~14px with realistic high blur
        const shadowOffsetDistance = 15; 
        const shadowBlurStrength = 6;
        const shadowTipX = stickTipX + aimDy * shadowOffsetDistance + 2;
        const shadowTipY = stickTipY - aimDx * shadowOffsetDistance + 3;
        const shadowBackX = stickBackX + aimDy * shadowOffsetDistance + 2;
        const shadowBackY = stickBackY - aimDx * shadowOffsetDistance + 3;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(shadowBackX, shadowBackY);
        ctx.lineTo(shadowTipX, shadowTipY);
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'; // soft ambient shadow casting
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = shadowBlurStrength;
        ctx.stroke();
        ctx.restore();

        // DRAW ELEGANT MULTI-GRADIENT TAPERING WOOD CUESTICK
        // Professional cue sticks taper from thick grip back butt to narrow front tip.
        // We will draw customized polygons for the stick segments representing different materials:
        // A. Grip Butt section (Ebony wood with gold wrap / Irish Linen thread textures)
        // B. Shaft maple wood taper
        // C. Clean white bone joints & joints caps
        // D. Blue chalked tip

        const stickNormX = -aimDy; // normal vector perpendicular to aim direction
        const stickNormY = aimDx; 

        const drawSegment = (startX: number, startY: number, endX: number, endY: number, startW: number, endW: number, style: any) => {
          ctx.save();
          ctx.fillStyle = style;
          ctx.beginPath();
          ctx.moveTo(startX - stickNormX * startW, startY - stickNormY * startW);
          ctx.lineTo(endX - stickNormX * endW, endY - stickNormY * endW);
          ctx.lineTo(endX + stickNormX * endW, endY + stickNormY * endW);
          ctx.lineTo(startX + stickNormX * startW, startY + stickNormY * startW);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        };

        // Define wood linear gradients that reflect cylindrical round lighting shadows on top (specular sheen)
        const getCylinderGrad = (sx: number, sy: number, ex: number, ey: number, color1: string, color2: string, color3: string) => {
          const lG = ctx.createLinearGradient(
            sx - stickNormX * 4, sy - stickNormY * 4,
            sx + stickNormX * 4, sy + stickNormY * 4
          );
          lG.addColorStop(0, color1); // shaded edge
          lG.addColorStop(0.3, color2); // highlight
          lG.addColorStop(0.7, color2);
          lG.addColorStop(1, color3); // bottom shadow
          return lG;
        };

        const buttLen = stickLength * 0.35;
        const Joint1X = stickBackX + aimDx * buttLen;
        const Joint1Y = stickBackY + aimDy * buttLen;

        const shaftLen = stickLength * 0.58;
        const Joint2X = Joint1X + aimDx * shaftLen;
        const Joint2Y = Joint1Y + aimDy * shaftLen;

        const Joint3X = Joint2X + aimDx * (stickLength * 0.05);	// ivory collar ferrule
        const Joint3Y = Joint2Y + aimDy * (stickLength * 0.05);

        // 1. Butt section: Rich Premium Dark Rosewood Ebony Core with golden leather wraps
        const buttGrad = getCylinderGrad(stickBackX, stickBackY, Joint1X, Joint1Y, '#110602', '#3f1a0d', '#1a0a04');
        drawSegment(stickBackX, stickBackY, Joint1X, Joint1Y, 5.0, 4.3, buttGrad);

        // Draw a golden ring inlay separating the butt grip from shaft wood
        const goldRingGrad = getCylinderGrad(Joint1X, Joint1Y, Joint1X + aimDx * 2, Joint1Y + aimDy * 2, '#78350f', '#fef08a', '#92400e');
        drawSegment(Joint1X, Joint1Y, Joint1X + aimDx * 2, Joint1Y + aimDy * 2, 4.3, 4.2, goldRingGrad);

        // 2. Shaft section: Sleek pale Canadian blonde maple tapered nicely
        const mapleGrad = getCylinderGrad(Joint1X + aimDx * 2, Joint1Y + aimDy * 2, Joint2X, Joint2Y, '#a16207', '#fef08a', '#ca8a04');
        drawSegment(Joint1X + aimDx * 2, Joint1Y + aimDy * 2, Joint2X, Joint2Y, 4.2, 3.2, mapleGrad);

        // 3. Bone Ivory Ferrule joint cap
        const boneGrad = getCylinderGrad(Joint2X, Joint2Y, Joint3X, Joint3Y, '#e2e8f0', '#ffffff', '#cbd5e1');
        drawSegment(Joint2X, Joint2Y, Joint3X, Joint3Y, 3.2, 3.0, boneGrad);

        // 4. Pressed leather cue tip styled with high grade blue chalk residue!
        const chalkTipX = Joint3X + aimDx * 3.5;
        const chalkTipY = Joint3Y + aimDy * 3.5;
        const chalkGrad = getCylinderGrad(Joint3X, Joint3Y, chalkTipX, chalkTipY, '#3b82f6', '#93c5fd', '#1d4ed8');
        drawSegment(Joint3X, Joint3Y, chalkTipX, chalkTipY, 3.0, 2.9, chalkGrad);

        ctx.restore(); // RESTORE cue stick opacity wrapper

        // 7.5. Dynamic premium interactive HUD directly on cue ball
        const showPullHUD = isMyTurnActive ? (isPullingRef.current && showLasers) : (opponentAim && opponentAim.power > 5);
        if (showPullHUD) {
          const progress = activePower / 100;
          
          // Draw a background circular tracker ring around cue ball
          ctx.beginPath();
          ctx.arc(cueBall.x, cueBall.y, 25, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.5)';
          ctx.lineWidth = 5;
          ctx.stroke();

          // Draw charging power ring arc (starts at top -Math.PI / 2)
          ctx.beginPath();
          ctx.arc(cueBall.x, cueBall.y, 25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
          
          let ringColor = '#10b981'; // emerald green (soft charge)
          if (activePower > 75) {
            ringColor = '#ef4444'; // hot scarlet (maximum smash force)
          } else if (activePower > 35) {
            ringColor = '#f59e0b'; // golden amber (regular-firm force)
          }
          
          ctx.strokeStyle = ringColor;
          ctx.lineWidth = 5;
          ctx.stroke();

          // Render Floating HUD Text indicator above ball coordinates with shadow
          ctx.save();
          ctx.font = 'bold 9px monospace, Courier New';
          ctx.fillStyle = '#f8fafc';
          ctx.textAlign = 'center';
          ctx.fillText(`PULL: ${Math.round(activePower)}%`, cueBall.x, cueBall.y - 36);

          ctx.font = 'bold 9px sans-serif';
          ctx.fillStyle = '#fbbf24';
          ctx.fillText(isMyTurnActive ? 'RELEASE TO SHOOT' : 'OPPONENT CHARGING FORCE', cueBall.x, cueBall.y - 20);
          ctx.restore();
        } else {
          // Normal elegant guide text overlay near cue ball
          ctx.font = '500 9.5px "Inter", sans-serif';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
          ctx.textAlign = 'center';
          ctx.fillText(isMyTurnActive ? 'إسحب في أي مكان وقـف بالقـوة • SLIDE TO AIM & PULL TO SHOOT' : 'الخصم يقوم بضبط الضربة الآن • OPPONENT IS ADJUSTING AIM...', cueBall.x, cueBall.y - 20);
        }
      }
    }

    // 8. Render Placing ghost position in scratch mode
    if (isScratchPlacing) {
      // Check if current placedPos overlaps another ball
      const isOverlapping = roomStateRef.current.balls.some((b) => {
        if (b.id === 0 || b.isPocketed) return false;
        const dx = placedPosRef.current.x - b.x;
        const dy = placedPosRef.current.y - b.y;
        const dist = Math.hypot(dx, dy);
        return dist < 20.0;
      });

      const minX_ghost = 30 + 10;
      const maxX_ghost = 770 - 10;
      const minY_ghost = 30 + 10;
      const maxY_ghost = 370 - 10;
      const isOutOfBounds = placedPosRef.current.x < minX_ghost || 
                            placedPosRef.current.x > maxX_ghost || 
                            placedPosRef.current.y < minY_ghost || 
                            placedPosRef.current.y > maxY_ghost;
      
      const isInvalidPos = isOverlapping || isOutOfBounds;
      const behindHeadStringRestriction = roomStateRef.current.ballInHandRestriction === 'behind_head_string';
      const headStringLineX = 220;
      const isHeadStringOutOfBounds = behindHeadStringRestriction && placedPosRef.current.x > headStringLineX - 10;
      const finalInvalid = isInvalidPos || isHeadStringOutOfBounds;

      // Draw placing boundary canvas highlights
      ctx.strokeStyle = finalInvalid ? 'rgba(239, 68, 68, 0.45)' : 'rgba(16, 185, 129, 0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(20, 20, 760, 360);

      if (behindHeadStringRestriction) {
        ctx.beginPath();
        ctx.moveTo(headStringLineX, 20);
        ctx.lineTo(headStringLineX, 380);
        ctx.strokeStyle = finalInvalid ? 'rgba(239, 68, 68, 0.55)' : 'rgba(59, 130, 246, 0.55)';
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.save();
        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = finalInvalid ? '#f87171' : '#60a5fa';
        ctx.textAlign = 'center';
        ctx.fillText('HEAD STRING', headStringLineX, 18);
        ctx.fillText('BALL-IN-HAND ZONE', headStringLineX, 34);
        ctx.restore();

        ctx.save();
        ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
        ctx.fillRect(22, 20, headStringLineX - 22, 360);
        ctx.restore();
      }

      // ghost cue ball with glowing pulse
      const pulseRatio = (Date.now() % 800) / 800;
      ctx.beginPath();
      ctx.arc(placedPos.x, placedPos.y, BALL_R + pulseRatio * 4, 0, Math.PI * 2);
      ctx.strokeStyle = isInvalidPos 
        ? `rgba(239, 68, 68, ${0.45 * (1 - pulseRatio)})`
        : `rgba(16, 185, 129, ${0.45 * (1 - pulseRatio)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(placedPosRef.current.x, placedPosRef.current.y, BALL_R, 0, Math.PI * 2);
      ctx.fillStyle = isInvalidPos ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 246, 255, 0.6)';
      ctx.fill();
      ctx.strokeStyle = isInvalidPos ? '#ef4444' : '#10b981';
      ctx.stroke();

      // guide boundary text
      ctx.fillStyle = isInvalidPos ? '#f87171' : '#10b981';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      
      if (isInvalidPos) {
        ctx.fillText('INVALID POSITION (Overlapping ball) | لا يمكن وضع الكرة هنا', placedPosRef.current.x, placedPosRef.current.y - 18);
      } else {
        ctx.fillText('Drag to place, click Confirm | اسحب لوضع الكرة ثم اضغط تأكيد', placedPosRef.current.x, placedPosRef.current.y - 18);
      }
    }

    ctx.restore();

    // 9. Frame continuation for smooth reactive elements Redraw Ticks
    animationId = requestAnimationFrame(drawLoop);
  };

  drawLoop();

  return () => {
    cancelAnimationFrame(animationId);
  };
}, []);

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
            // This perfectly satisfies the demand: "وعند ضغط للتسديد اريد حساسية التحريك اقل لكي نستطيع التحكم المتجاوب القوي"
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

  const standardBallsList = [
    { id: 1, number: 1, type: 'solid', color: '#CFAF30', nameAr: 'الصفراء المصمتة', nameEn: 'Yellow Solid' },
    { id: 2, number: 2, type: 'solid', color: '#1B4CA7', nameAr: 'الزرقاء المصمتة', nameEn: 'Blue Solid' },
    { id: 3, number: 3, type: 'solid', color: '#B12724', nameAr: 'الحمراء المصمتة', nameEn: 'Red Solid' },
    { id: 4, number: 4, type: 'solid', color: '#5F3E9C', nameAr: 'البنفسجية المصمتة', nameEn: 'Purple Solid' },
    { id: 5, number: 5, type: 'solid', color: '#C86414', nameAr: 'البرتقالية المصمتة', nameEn: 'Orange Solid' },
    { id: 6, number: 6, type: 'solid', color: '#0F7B4D', nameAr: 'الخضراء المصمتة', nameEn: 'Green Solid' },
    { id: 7, number: 7, type: 'solid', color: '#7A1E2A', nameAr: 'العنابية المصمتة', nameEn: 'Maroon Solid' },
    { id: 8, number: 8, type: 'black', color: '#111111', nameAr: 'السوداء 8', nameEn: 'Black 8-Ball' },
    { id: 9, number: 9, type: 'stripe', color: '#D7B037', nameAr: 'الصفراء المخططة', nameEn: 'Yellow Stripe' },
    { id: 10, number: 10, type: 'stripe', color: '#4A76C8', nameAr: 'الزرقاء المخططة', nameEn: 'Blue Stripe' },
    { id: 11, number: 11, type: 'stripe', color: '#D45851', nameAr: 'الحمراء المخططة', nameEn: 'Red Stripe' },
    { id: 12, number: 12, type: 'stripe', color: '#9D6FD1', nameAr: 'البنفسجية المخططة', nameEn: 'Purple Stripe' },
    { id: 13, number: 13, type: 'stripe', color: '#D28D3E', nameAr: 'البرتقالية المخططة', nameEn: 'Orange Stripe' },
    { id: 14, number: 14, type: 'stripe', color: '#3CA972', nameAr: 'الخضراء المخططة', nameEn: 'Green Stripe' },
    { id: 15, number: 15, type: 'stripe', color: '#8A1A24', nameAr: 'العنابية المخططة', nameEn: 'Maroon Stripe' },
  ];

  const myPlayerObj = roomState.players.find((p) => p.id === myPlayerId);
  const mySide = myPlayerObj?.side;

  const renderBallBadge = (ball: typeof standardBallsList[0]) => {
    const isPocketed = roomState.balls.find((b) => b.id === ball.id)?.isPocketed ?? false;
    return (
      <div 
        key={ball.id} 
        className="relative flex flex-col items-center group cursor-help"
        title={`${ball.nameEn} - ${isPocketed ? 'Pocketed' : 'On Table'}`}
      >
        <div 
          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center relative transition-all hover:scale-110 shadow-lg select-none overflow-hidden ${
            isPocketed ? 'opacity-25 grayscale-[30%] scale-90 border border-slate-800' : 'opacity-100'
          }`}
          style={{
            background: ball.type === 'stripe' 
              ? `linear-gradient(135deg, #ffffff 18%, ${ball.color} 18%, ${ball.color} 82%, #fafaf9 82%)`
              : `radial-gradient(circle at 30% 30%, ${ball.color} 30%, #000000 120%)`,
            boxShadow: isPocketed 
              ? 'none' 
              : 'inset -2px -2px 6px rgba(0,0,0,0.65), 0 3px 6px rgba(0,0,0,0.45)',
          }}
        >
          {/* Spherizing 3D shade overlay for striped balls */}
          {ball.type === 'stripe' && !isPocketed && (
            <div className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25) 0%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.55) 100%)',
              }}
            />
          )}

          {/* Golden metallic rim surrounding the container */}
          {!isPocketed && (
            <div className="absolute inset-0 rounded-full border border-yellow-500/20 pointer-events-none" />
          )}

          {/* Core sphere specular hot point reflection */}
          {!isPocketed && (
            <div className="absolute top-0.5 left-1 w-2 h-1 bg-white/45 rounded-full rotate-[-15deg] pointer-events-none" />
          )}
          
          {/* Centered number wrapper - styled with gold-bordered elegant billiard number face */}
          <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-[#fffaeb] border border-yellow-600/30 flex items-center justify-center shadow-xs z-10">
            <span className="text-[7.5px] sm:text-[8.5px] font-black text-slate-900 font-mono leading-none">
              {ball.number}
            </span>
          </div>

          {/* Pocketed check overlay */}
          {isPocketed && (
            <div className="absolute inset-0 rounded-full bg-slate-950/45 flex items-center justify-center font-bold text-emerald-400 text-xs z-20">
              ✓
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="flex flex-col items-center bg-slate-900 border border-slate-700/60 rounded-xl overflow-hidden p-4 shadow-xl relative">
      {/* Upgraded Premium Match HUD Header (English Only, High density, no labels) */}
      {(() => {
        const myPlayerObjMatched = roomState.players.find((p) => p.id === myPlayerId);
        const mySideMatched = myPlayerObjMatched?.side;
        const opponentObjMatched = roomState.players.find((p) => p.id !== myPlayerId);
        const opponentSideMatched = opponentObjMatched?.side;

        const pocketedSolidsMatched = standardBallsList.filter(ball => {
          const tableBall = roomState.balls.find(b => b.id === ball.id);
          return tableBall && tableBall.isPocketed && ball.type === 'solid';
        });

        const pocketedStripesMatched = standardBallsList.filter(ball => {
          const tableBall = roomState.balls.find(b => b.id === ball.id);
          return tableBall && tableBall.isPocketed && ball.type === 'stripe';
        });

        let myPocketedMatched = [];
        let opponentPocketedMatched = [];

        if (mySideMatched === 'solids') {
          myPocketedMatched = pocketedSolidsMatched;
          opponentPocketedMatched = pocketedStripesMatched;
        } else if (mySideMatched === 'stripes') {
          myPocketedMatched = pocketedStripesMatched;
          opponentPocketedMatched = pocketedSolidsMatched;
        } else {
          // Open table default grouping: show solids and stripes respectively
          myPocketedMatched = pocketedSolidsMatched;
          opponentPocketedMatched = pocketedStripesMatched;
        }

        const timerVal = roomState.turnTimer ?? 60;
        const timerPercentage = (timerVal / 60) * 100;
        
        let timerColorClass = "bg-emerald-500 shadow-[0_0_8px_#10b981]";
        let timerTextClass = "text-emerald-400";
        if (timerVal <= 10) {
          timerColorClass = "bg-rose-500 animate-pulse shadow-[0_0_12px_#ef4444]";
          timerTextClass = "text-rose-400 font-extrabold animate-pulse";
        } else if (timerVal <= 20) {
          timerColorClass = "bg-amber-500 shadow-[0_0_8px_#f59e0b]";
          timerTextClass = "text-amber-400";
        }

        return (
          <div className="w-full bg-slate-950/80 border border-slate-800/60 rounded-xl p-3 mb-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-md">
            
            {/* Left Side: You Profile & Your Pocketed Balls Group + Cue Contact Selector */}
            <div className={`px-4 py-2 rounded-lg border flex items-center gap-4 transition-all ${
              isMyTurn 
                ? 'bg-cyan-500/[0.04] border-cyan-500/35 shadow-[0_0_15px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/20' 
                : 'bg-slate-900/40 border-slate-850'
            }`}>
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] uppercase font-bold text-slate-500 font-mono">YOU</span>
                <span className="text-xs font-black text-slate-200 tracking-wider font-mono flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isMyTurn ? 'bg-cyan-400 animate-ping' : 'bg-slate-600'}`} />
                  {myPlayerObjMatched?.username || 'You'}
                </span>
                {mySideMatched ? (
                  <span className="text-[9px] uppercase font-bold text-slate-400 font-mono">
                    {mySideMatched}
                  </span>
                ) : (
                  <span className="text-[9px] uppercase font-bold text-amber-500/80 font-mono">
                    OPEN TABLE
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-1 bg-slate-950/90 px-2 py-1 rounded border border-slate-900 min-h-[34px]">
                {myPocketedMatched.length > 0 ? (
                  myPocketedMatched.map(renderBallBadge)
                ) : (
                  <span className="text-[8px] font-mono text-slate-600">NO OBJECTS SUNK</span>
                )}
              </div>

              {/* Dynamic Compact 3D Draggable Spin Contact Selector */}
              <div 
                className="relative w-11 h-11 rounded-full bg-radial from-white via-slate-100 to-slate-200 shadow-[inset_-2px_-2px_5px_rgba(0,0,0,0.5),0_2px_5px_rgba(0,0,0,0.4)] border border-slate-400/40 flex items-center justify-center cursor-crosshair select-none shrink-0 group active:scale-105 transition-all"
                title="Cue Ball Spin Contact Point (English)"
                onPointerDown={(e) => {
                  if (!isMyTurn || isAnimating) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const handlePointerMoveLocal = (event: PointerEvent | MouseEvent) => {
                    const x = event.clientX - rect.left;
                    const y = event.clientY - rect.top;
                    const r = rect.width / 2;
                    let dx = (x - r) / r;
                    let dy = (y - r) / r;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist > 1.0) {
                      dx /= dist;
                      dy /= dist;
                    }
                    setSpinX(dx);
                    setSpinY(-dy);
                  };
                  handlePointerMoveLocal(e as any);
                  
                  const handlePointerUpLocal = () => {
                    window.removeEventListener('pointermove', handlePointerMoveLocal as any);
                    window.removeEventListener('pointerup', handlePointerUpLocal);
                  };
                  window.addEventListener('pointermove', handlePointerMoveLocal as any);
                  window.addEventListener('pointerup', handlePointerUpLocal);
                }}
              >
                <div className="absolute inset-0 rounded-full border border-dashed border-slate-400/10 pointer-events-none" />
                <div className="absolute h-full w-[0.5px] bg-slate-400/20 pointer-events-none" />
                <div className="absolute w-full h-[0.5px] bg-slate-400/20 pointer-events-none" />
                <div 
                  className="absolute w-2.5 h-2.5 bg-red-650 rounded-full border border-white shadow-[0_0_4px_#ef4444] transform -translate-x-1/2 -translate-y-1/2 animate-pulse"
                  style={{
                    left: `${22 + spinX * 22}px`,
                    top: `${22 - spinY * 22}px`,
                  }}
                />
              </div>
            </div>

            {/* Center: Upgraded Design Neon Turn Timer */}
            <div className="flex flex-col items-center justify-center bg-slate-1000 border border-slate-850 px-6 py-2 rounded-xl relative shadow-lg min-w-[150px]">
              <div className={`absolute -inset-[1px] rounded-xl opacity-15 blur-sm transition-colors ${
                isMyTurn ? 'bg-cyan-500' : 'bg-amber-500'
              }`} />
              
              <span className="text-[8px] tracking-widest text-slate-400 font-mono uppercase mb-0.5 z-10">
                {isMyTurn ? 'YOUR SHOT' : 'OPPONENT TURN'}
              </span>
              <span className={`text-xl sm:text-2xl font-black font-mono tracking-tight leading-none z-10 ${timerTextClass}`}>
                {timerVal}s
              </span>
              <div className="w-20 bg-slate-900 h-1 rounded-full overflow-hidden border border-slate-800/60 mt-1.5 z-10">
                <div 
                  className={`h-full transition-all duration-1000 ${timerColorClass}`}
                  style={{ width: `${timerPercentage}%` }}
                />
              </div>
            </div>

            {/* Right Side: Opponent Profile & Opponent's Pocketed Balls Group or Summon Bot */}
            {roomState.players.length < 2 ? (
              <div className="flex items-center gap-3 bg-slate-900/40 p-1.5 px-3 rounded-lg border border-slate-800">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[8px] uppercase font-bold text-slate-500 font-mono">OPPONENT</span>
                  <span className="text-[10px] text-slate-400 leading-none">WAITING OPPONENT...</span>
                </div>
                <button
                  onClick={() => onJoinAI?.('medium')}
                  className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black text-[10px] rounded border border-amber-400 flex items-center gap-1.5 shadow-[0_0_12px_rgba(245,158,11,0.22)] animate-pulse transition-all cursor-pointer active:scale-95 shrink-0"
                >
                  <Bot className="w-3.5 h-3.5 fill-current" />
                  استدعاء البوت للعب
                </button>
              </div>
            ) : (
              <div className={`px-4 py-2 rounded-lg border flex items-center gap-3 transition-all ${
                !isMyTurn 
                  ? 'bg-amber-500/[0.04] border-amber-500/35 shadow-[0_0_15px_rgba(234,179,8,0.15)] ring-1 ring-amber-500/20' 
                  : 'bg-slate-900/40 border-slate-850'
              }`}>
                <div className="flex flex-col gap-0.5 items-end text-right">
                  <span className="text-[9px] uppercase font-bold text-slate-500 font-mono">OPPONENT</span>
                  <span className="text-xs font-black text-slate-200 tracking-wider font-mono flex items-center gap-1.5">
                    {opponentObjMatched ? opponentObjMatched.username : 'AI Bot'}
                    <span className={`w-2 h-2 rounded-full ${!isMyTurn ? 'bg-amber-400 animate-ping' : 'bg-slate-600'}`} />
                  </span>
                  {opponentSideMatched ? (
                    <span className="text-[9px] uppercase font-bold text-slate-400 font-mono">
                      {opponentSideMatched}
                    </span>
                  ) : (
                    <span className="text-[9px] uppercase font-bold text-amber-500/80 font-mono">
                      OPEN TABLE
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-1 bg-slate-950/90 px-2 py-1 rounded border border-slate-900 min-h-[34px]">
                  {opponentPocketedMatched.length > 0 ? (
                    opponentPocketedMatched.map(renderBallBadge)
                  ) : (
                    <span className="text-[8px] font-mono text-slate-600">NO OBJECTS SUNK</span>
                  )}
                </div>
              </div>
            )}

          </div>
        );
      })()}

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

        {/* Global Championship Pocketed Balls Returns Runway (Wood Rail Shelf Under the Table) */}
        {(() => {
          const pocketedList = standardBallsList.filter(ball => {
            const tableBall = roomState.balls.find(b => b.id === ball.id);
            return tableBall && tableBall.isPocketed;
          }).sort((a, b) => a.id - b.id);

          return (
            <div className="w-full max-w-[800px] mx-auto bg-amber-950 border-4 border-amber-900 rounded-lg p-2 shadow-2xl relative">
              {/* Inner dark runway with velvet shadow */}
              <div className="w-full bg-slate-950/90 border border-amber-950 rounded-md p-2 min-h-[56px] flex flex-wrap items-center justify-center gap-3 shadow-[inset_0_4px_10px_rgba(0,0,0,0.9)] relative overflow-hidden">
                {/* Visual Felt Lines to simulate bottom runway tube rails */}
                <div className="absolute left-0 right-0 h-[2px] bg-slate-900/40 top-[35%] pointer-events-none" />
                <div className="absolute left-0 right-0 h-[2px] bg-slate-900/40 bottom-[35%] pointer-events-none" />

                {pocketedList.length > 0 ? (
                  pocketedList.map((ball) => (
                    <div 
                      key={ball.id} 
                      className="relative flex flex-col items-center group transform active:scale-95 transition-all"
                      title={`${ball.nameEn} - Pocketed`}
                    >
                      {/* Realistic Ball Sphere */}
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center relative shadow-lg transition-transform hover:scale-110"
                        style={{
                          background: ball.type === 'stripe' 
                            ? `linear-gradient(to right, #fafaf9 22%, ${ball.color} 22%, ${ball.color} 78%, #fafaf9 78%)`
                            : `radial-gradient(circle at 35% 35%, ${ball.color} 40%, #000000 110%)`,
                          boxShadow: 'inset -2px -2px 6px rgba(0,0,0,0.8), 0 3px 6px rgba(0,0,0,0.5)',
                        }}
                      >
                        {/* Highlights */}
                        <div className="absolute top-0.5 left-1 w-2 h-1 bg-white/45 rounded-full rotate-[-15deg] pointer-events-none" />
                        
                        {/* White circular plate with number */}
                        <div className="w-4.5 h-4.5 rounded-full bg-[#fefcbd] border border-black/10 flex items-center justify-center shadow-inner z-10 select-none">
                          <span className="text-[9px] font-black text-slate-900 font-mono leading-none">
                            {ball.number}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-[10px] font-medium text-slate-500 italic tracking-wider flex items-center gap-2 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-700 animate-pulse" />
                    Fallen balls runway is empty • Awaiting first pocket
                  </div>
                )}
              </div>
              
              {/* Runway label badge */}
              <div className="absolute -top-2.5 left-4 px-2 py-0.5 bg-amber-900 text-[8px] font-black text-amber-200 border border-amber-800 rounded uppercase font-mono tracking-wider shadow-md">
                POCKETED BALLS RUNWAY
              </div>
            </div>
          );
        })()}
      </div>

      {/* Centered Premium Cue Ball Spin Controller */}
      <div className="w-full flex flex-col items-center bg-slate-950 p-4 rounded-lg border border-slate-800 shadow-xl gap-4">
        {isScratchPlacing ? (
          (() => {
            const invalidPlacing = isPlacementInvalid();
            const errorMessage = placementErrorMessage();
            return (
              <button
                onClick={handleConfirmPlacement}
                disabled={invalidPlacing}
                className={`w-full max-w-sm py-3 px-6 text-white font-bold font-mono rounded-lg transition-all shadow-lg text-xs flex flex-col items-center justify-center gap-1.5 ${
                  invalidPlacing 
                    ? 'bg-slate-800 border border-slate-700 text-slate-400 cursor-not-allowed' 
                    : 'bg-red-650 hover:bg-red-700 focus:ring-2 focus:ring-red-400 cursor-pointer animate-pulse'
                }`}
              >
                <span className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" /> 
                  {invalidPlacing ? 'INVALID PLACEMENT' : 'CONFIRM CUE PLACEMENT'}
                </span>
                {invalidPlacing && errorMessage && (
                  <span className="text-[10px] text-slate-300/90">{errorMessage}</span>
                )}
              </button>
            );
          })()
        ) : (
          <div className="flex flex-col gap-4 w-full">
            {/* Status Feedback Indicator */}
            <div className="w-full flex justify-center bg-slate-900/60 py-2.5 px-4 rounded-md border border-slate-800/40">
              {!isMyTurn && roomState.status === 'playing' && (
                <span className="text-xs font-bold text-slate-400 tracking-wide font-mono animate-pulse flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-500 animate-ping" />
                  WAITING FOR OPPONENT...
                </span>
              )}
              {roomState.status !== 'playing' && (
                <span className="text-xs font-bold text-slate-500 tracking-wide font-mono italic animate-pulse flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-600" />
                  WAITING RESUMPTION...
                </span>
              )}
              {roomState.scratchOccurred && (
                <span className="text-xs font-black tracking-wide flex items-center gap-1.5 text-white">
                  <span className={`w-2.5 h-2.5 rounded-full shadow-lg ${roomState.ballInHandRestriction === 'behind_head_string' ? 'bg-cyan-400 animate-pulse' : 'bg-emerald-400 animate-ping'}`} />
                  {isMyTurn ? (
                    roomState.ballInHandRestriction === 'behind_head_string' ?
                      'BREAK FOUL: Place the cue ball behind the head string.' :
                      'BALL-IN-HAND: Place the cue ball anywhere.'
                  ) : (
                    roomState.ballInHandRestriction === 'behind_head_string' ?
                      'Opponent has ball-in-hand behind the head string.' :
                      'Opponent has ball-in-hand anywhere.'
                  )}
                </span>
              )}
              {!roomState.scratchOccurred && isMyTurn && !isAnimating && roomState.status === 'playing' && (
                <span className="text-xs font-black text-emerald-400 tracking-wide animate-pulse flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] animate-ping" />
                  YOUR TURN • Drag cue ball back to aim and release to shoot
                </span>
              )}
              {isAnimating && (
                <span className="text-xs font-bold text-amber-400 tracking-wide font-mono animate-bounce flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  BALLS IN MOTION...
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
