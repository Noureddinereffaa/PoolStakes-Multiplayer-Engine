import { useEffect, RefObject } from 'react';
import { Ball, RoomState } from '../types';
import {
  createBallRotation,
  updateBallRotation,
  BallRotationData,
} from '../components/PoolTable/rotation';
import {
  triggerShootParticles as triggerShootParticlesFn,
  RippleData,
  ChalkParticle,
  DustSpeck,
  SinkingBall,
} from '../components/PoolTable/effects';
import { poolAudio } from '../utils/audio';

interface RenderContext {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  offscreenCanvasRef: RefObject<HTMLCanvasElement | null>;
  aimAngleRef: RefObject<number>;
  shotPowerRef: RefObject<number>;
  spinXRef: RefObject<number>;
  spinYRef: RefObject<number>;
  isMyTurnRef: RefObject<boolean>;
  isAnimatingRef: RefObject<boolean>;
  isScratchPlacingRef: RefObject<boolean>;
  placedPosRef: RefObject<{ x: number; y: number }>;
  isPullingRef: RefObject<boolean>;
  roomStateRef: RefObject<RoomState>;
  difficultyRef: RefObject<'easy' | 'medium' | 'hard'>;
  myPlayerIdRef: RefObject<string>;
  ballRotationsRef: RefObject<Record<number, BallRotationData>>;
  impactShakeRef: RefObject<number>;
  feltRipplesRef: RefObject<RippleData[]>;
  chalkParticlesRef: RefObject<ChalkParticle[]>;
  dustSpecksRef: RefObject<DustSpeck[]>;
  sinkingBallsRef: RefObject<SinkingBall[]>;
  strikeAnimRef: RefObject<any>;
  turnStartTimestampRef: RefObject<number>;
  animatedBallsRef: RefObject<Ball[]>;
  opponentAim:
    | { angle: number; power: number; spinX?: number; spinY?: number }
    | null
    | undefined;
}

function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (num >> 16) + Math.round(255 * percent / 100));
  const g = Math.min(255, ((num >> 8) & 0x00FF) + Math.round(255 * percent / 100));
  const b = Math.min(255, (num & 0x0000FF) + Math.round(255 * percent / 100));
  return `rgb(${r},${g},${b})`;
}

function darkenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - Math.round(255 * percent / 100));
  const g = Math.max(0, ((num >> 8) & 0x00FF) - Math.round(255 * percent / 100));
  const b = Math.max(0, (num & 0x0000FF) - Math.round(255 * percent / 100));
  return `rgb(${r},${g},${b})`;
}

export function useBilliardsRenderer(ctx: RenderContext) {
  const getEligibleBallIds = (
    room: RoomState,
    activePlayerId: string
  ): number[] => {
    if (room.status !== 'playing') return [];
    const player = room.players.find((p) => p.id === activePlayerId);
    if (!player) return [];

    const remainingObjectBalls = room.balls.filter(
      (b) => b.id !== 0 && b.id !== 8 && !b.isPocketed
    );

    if (!room.assignedSides || !player.side) {
      return remainingObjectBalls.map((b) => b.id);
    }

    const isSolids = player.side === 'solids';
    const playerGroup = isSolids ? 'solid' : 'stripe';

    const ownGroupRemaining = remainingObjectBalls.filter(
      (b) => b.type === playerGroup
    );
    if (ownGroupRemaining.length > 0) {
      return ownGroupRemaining.map((b) => b.id);
    } else {
      const blackBall = room.balls.find((b) => b.id === 8);
      if (blackBall && !blackBall.isPocketed) {
        return [8];
      }
    }
    return [];
  };

  const triggerLocalShootParticles = (power: number) => {
    const cueBall = ctx.animatedBallsRef.current.find((b: Ball) => b.id === 0);
    triggerShootParticlesFn(
      power,
      cueBall,
      ctx.aimAngleRef.current,
      ctx.chalkParticlesRef.current,
      ctx.feltRipplesRef.current
    );
  };

  // Main Canvas Rendering Loop with continuous micro-particle & ripple animations
  useEffect(() => {
    let animationId: number;

    const canvas = ctx.canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = 800 * dpr;
    canvas.height = 400 * dpr;
    ctx2d.scale(dpr, dpr);

    // Render loop with idle stop
    let lastFrameTime = performance.now();
    let idleFrames = 0;
    const MAX_IDLE_FRAMES = 30;

    const BALL_R = 10;

    // Cache static background table graphics on offscreen canvas for extreme performance
    if (!ctx.offscreenCanvasRef.current) {
      const offCanvas = document.createElement('canvas');
      offCanvas.width = 800;
      offCanvas.height = 400;
      const offCtx = offCanvas.getContext('2d');
      if (offCtx) {
        const topRailGrad = offCtx.createLinearGradient(0, 0, 800, 20);
        topRailGrad.addColorStop(0, '#0a0301');
        topRailGrad.addColorStop(0.15, '#220c05');
        topRailGrad.addColorStop(0.5, '#3a150b');
        topRailGrad.addColorStop(0.85, '#220c05');
        topRailGrad.addColorStop(1, '#0a0301');
        offCtx.fillStyle = topRailGrad;
        offCtx.fillRect(0, 0, 800, 20);
        offCtx.fillRect(0, 380, 800, 20);

        const sideRailGrad = offCtx.createLinearGradient(0, 0, 20, 400);
        sideRailGrad.addColorStop(0, '#080100');
        sideRailGrad.addColorStop(0.5, '#2c0f07');
        sideRailGrad.addColorStop(1, '#080100');
        offCtx.fillStyle = sideRailGrad;
        offCtx.fillRect(0, 20, 20, 360);
        offCtx.fillRect(780, 20, 20, 360);

        offCtx.strokeStyle = 'rgba(74, 25, 10, 0.28)';
        offCtx.lineWidth = 1.25;
        for (let i = 3; i < 18; i += 4) {
          offCtx.beginPath();
          for (let x = 20; x <= 780; x += 15) {
            const wave = Math.sin(x * 0.03 + i) * 1.8;
            if (x === 20) offCtx.moveTo(x, i + wave);
            else offCtx.lineTo(x, i + wave);
          }
          offCtx.stroke();

          offCtx.beginPath();
          for (let x = 20; x <= 780; x += 15) {
            const wave = Math.sin(x * 0.035 + i) * 1.5;
            if (x === 20) offCtx.moveTo(x, 380 + i + wave);
            else offCtx.lineTo(x, 380 + i + wave);
          }
          offCtx.stroke();
        }

        for (let i = 3; i < 18; i += 4) {
          offCtx.beginPath();
          for (let y = 20; y <= 380; y += 15) {
            const wave = Math.sin(y * 0.03 + i) * 1.8;
            if (y === 20) offCtx.moveTo(i + wave, y);
            else offCtx.lineTo(i + wave, y);
          }
          offCtx.stroke();

          offCtx.beginPath();
          for (let y = 20; y <= 380; y += 15) {
            const wave = Math.sin(y * 0.035 + i) * 1.5;
            if (y === 20) offCtx.moveTo(780 + i + wave, y);
            else offCtx.lineTo(780 + i + wave, y);
          }
          offCtx.stroke();
        }

        offCtx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        offCtx.lineWidth = 1;
        offCtx.strokeRect(1, 1, 798, 398);

        offCtx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        offCtx.fillRect(18, 18, 764, 3);
        offCtx.fillRect(18, 379, 764, 3);
        offCtx.fillRect(18, 18, 3, 364);
        offCtx.fillRect(779, 18, 3, 364);

        offCtx.strokeStyle = '#c2780e';
        offCtx.lineWidth = 1.5;
        offCtx.strokeRect(19, 19, 762, 362);

        const feltSpotlight = offCtx.createRadialGradient(
          400,
          200,
          40,
          400,
          200,
          520
        );
        feltSpotlight.addColorStop(0, '#0fa696');
        feltSpotlight.addColorStop(0.3, '#11655d');
        feltSpotlight.addColorStop(0.65, '#0d544c');
        feltSpotlight.addColorStop(1, '#083833');
        offCtx.fillStyle = feltSpotlight;
        offCtx.fillRect(20, 20, 760, 360);

        offCtx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        for (let i = 0; i < 35; i++) {
          const rx = 25 + (i * 47) % 750;
          const ry = 25 + (i * 23) % 350;
          offCtx.fillRect(rx - 0.5, ry - 0.5, 1.2, 1.2);
        }

        offCtx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        offCtx.beginPath();
        offCtx.ellipse(260, 200, 110, 45, 0, 0, Math.PI * 2);
        offCtx.fill();
        offCtx.beginPath();
        offCtx.ellipse(540, 200, 110, 45, 0, 0, Math.PI * 2);
        offCtx.fill();

        const shadowTop = offCtx.createLinearGradient(20, 32, 20, 48);
        shadowTop.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
        shadowTop.addColorStop(1, 'rgba(0, 0, 0, 0)');
        offCtx.fillStyle = shadowTop;
        offCtx.fillRect(32, 32, 736, 16);

        const shadowBottom = offCtx.createLinearGradient(20, 368, 20, 352);
        shadowBottom.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
        shadowBottom.addColorStop(1, 'rgba(0, 0, 0, 0)');
        offCtx.fillStyle = shadowBottom;
        offCtx.fillRect(32, 352, 736, 16);

        const shadowLeft = offCtx.createLinearGradient(32, 20, 48, 20);
        shadowLeft.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
        shadowLeft.addColorStop(1, 'rgba(0, 0, 0, 0)');
        offCtx.fillStyle = shadowLeft;
        offCtx.fillRect(32, 32, 16, 336);

        const shadowRight = offCtx.createLinearGradient(768, 20, 752, 20);
        shadowRight.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
        shadowRight.addColorStop(1, 'rgba(0, 0, 0, 0)');
        offCtx.fillStyle = shadowRight;
        offCtx.fillRect(752, 32, 16, 336);

        const topBrush = offCtx.createLinearGradient(20, 20, 20, 32);
        topBrush.addColorStop(0, '#0a4234');
        topBrush.addColorStop(0.3, '#0f6e56');
        topBrush.addColorStop(1, '#138b6d');
        offCtx.fillStyle = topBrush;
        offCtx.beginPath();
        offCtx.moveTo(32, 20);
        offCtx.lineTo(768, 20);
        offCtx.lineTo(752, 32);
        offCtx.lineTo(48, 32);
        offCtx.closePath();
        offCtx.fill();

        const bottomBrush = offCtx.createLinearGradient(20, 380, 20, 368);
        bottomBrush.addColorStop(0, '#052920');
        bottomBrush.addColorStop(0.4, '#0b5240');
        bottomBrush.addColorStop(1, '#117b60');
        offCtx.fillStyle = bottomBrush;
        offCtx.beginPath();
        offCtx.moveTo(32, 380);
        offCtx.lineTo(768, 380);
        offCtx.lineTo(752, 368);
        offCtx.lineTo(48, 368);
        offCtx.closePath();
        offCtx.fill();

        const leftBrush = offCtx.createLinearGradient(20, 20, 32, 20);
        leftBrush.addColorStop(0, '#052920');
        leftBrush.addColorStop(0.4, '#0b5240');
        leftBrush.addColorStop(1, '#117b60');
        offCtx.fillStyle = leftBrush;
        offCtx.beginPath();
        offCtx.moveTo(20, 32);
        offCtx.lineTo(20, 368);
        offCtx.lineTo(32, 352);
        offCtx.lineTo(32, 48);
        offCtx.closePath();
        offCtx.fill();

        const rightBrush = offCtx.createLinearGradient(780, 20, 768, 20);
        rightBrush.addColorStop(0, '#052920');
        rightBrush.addColorStop(0.4, '#0b5240');
        rightBrush.addColorStop(1, '#117b60');
        offCtx.fillStyle = rightBrush;
        offCtx.beginPath();
        offCtx.moveTo(780, 32);
        offCtx.lineTo(780, 368);
        offCtx.lineTo(768, 352);
        offCtx.lineTo(768, 48);
        offCtx.closePath();
        offCtx.fill();

        offCtx.strokeStyle = '#94a3b8';
        offCtx.lineWidth = 1.5;
        offCtx.beginPath();
        offCtx.moveTo(400, 20);
        offCtx.lineTo(400, 32);
        offCtx.stroke();
        offCtx.beginPath();
        offCtx.moveTo(400, 368);
        offCtx.lineTo(400, 380);
        offCtx.stroke();

        const diamondSpacingX = 800 / 8;
        const pearlGrad = offCtx.createRadialGradient(0, 0, 0.5, 0, 0, 4);
        pearlGrad.addColorStop(0, '#ffffff');
        pearlGrad.addColorStop(0.4, '#e2e8f0');
        pearlGrad.addColorStop(1, '#94a3b8');

        for (let i = 1; i <= 7; i++) {
          if (i !== 4) {
            offCtx.save();
            offCtx.translate(i * diamondSpacingX, 10);
            offCtx.beginPath();
            offCtx.moveTo(0, -4);
            offCtx.lineTo(3, 0);
            offCtx.lineTo(0, 4);
            offCtx.lineTo(-3, 0);
            offCtx.closePath();
            offCtx.fillStyle = pearlGrad;
            offCtx.fill();
            offCtx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            offCtx.lineWidth = 0.5;
            offCtx.stroke();
            offCtx.restore();

            offCtx.save();
            offCtx.translate(i * diamondSpacingX, 390);
            offCtx.beginPath();
            offCtx.moveTo(0, -4);
            offCtx.lineTo(3, 0);
            offCtx.lineTo(0, 4);
            offCtx.lineTo(-3, 0);
            offCtx.closePath();
            offCtx.fillStyle = pearlGrad;
            offCtx.fill();
            offCtx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            offCtx.lineWidth = 0.5;
            offCtx.stroke();
            offCtx.restore();
          }
        }
        const diamondSpacingY = 400 / 4;
        for (let j = 1; j <= 3; j++) {
          offCtx.save();
          offCtx.translate(10, j * diamondSpacingY);
          offCtx.beginPath();
          offCtx.moveTo(-4, 0);
          offCtx.lineTo(0, -3);
          offCtx.lineTo(4, 0);
          offCtx.lineTo(0, 3);
          offCtx.closePath();
          offCtx.fillStyle = pearlGrad;
          offCtx.fill();
          offCtx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
          offCtx.lineWidth = 0.5;
          offCtx.stroke();
          offCtx.restore();

          offCtx.save();
          offCtx.translate(790, j * diamondSpacingY);
          offCtx.beginPath();
          offCtx.moveTo(-4, 0);
          offCtx.lineTo(0, -3);
          offCtx.lineTo(4, 0);
          offCtx.lineTo(0, 3);
          offCtx.closePath();
          offCtx.fillStyle = pearlGrad;
          offCtx.fill();
          offCtx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
          offCtx.lineWidth = 0.5;
          offCtx.stroke();
          offCtx.restore();
        }

        const pockets = [
          { x: 22, y: 22, ang: Math.PI * 0.25 },
          { x: 400, y: 18, ang: Math.PI * 0.5 },
          { x: 778, y: 22, ang: Math.PI * 0.75 },
          { x: 22, y: 378, ang: -Math.PI * 0.25 },
          { x: 400, y: 382, ang: -Math.PI * 0.5 },
          { x: 778, y: 378, ang: -Math.PI * 0.75 },
        ];

        pockets.forEach((p) => {
          offCtx.beginPath();
          offCtx.arc(p.x, p.y, 27, 0, Math.PI * 2);
          offCtx.fillStyle = 'rgba(0, 0, 0, 0.75)';
          offCtx.fill();

          const pocketPlateGrad = offCtx.createRadialGradient(
            p.x,
            p.y,
            15,
            p.x,
            p.y,
            25
          );
          pocketPlateGrad.addColorStop(0, '#1e293b');
          pocketPlateGrad.addColorStop(0.4, '#475569');
          pocketPlateGrad.addColorStop(0.75, '#f1f5f9');
          pocketPlateGrad.addColorStop(0.9, '#cbd5e1');
          pocketPlateGrad.addColorStop(1, '#1e293b');

          offCtx.beginPath();
          offCtx.arc(p.x, p.y, 24, 0, Math.PI * 2);
          offCtx.fillStyle = pocketPlateGrad;
          offCtx.fill();

          offCtx.strokeStyle = 'rgba(217, 119, 6, 0.65)';
          offCtx.lineWidth = 1;
          offCtx.beginPath();
          offCtx.arc(p.x, p.y, 23.5, 0, Math.PI * 2);
          offCtx.stroke();

          offCtx.fillStyle = 'rgba(217, 119, 6, 0.9)';
          const screwAngs = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
          screwAngs.forEach((sa) => {
            const sx = p.x + Math.cos(sa) * 20.5;
            const sy = p.y + Math.sin(sa) * 20.5;
            offCtx.beginPath();
            offCtx.arc(sx, sy, 1.2, 0, Math.PI * 2);
            offCtx.fill();
          });

          const voidGrad = offCtx.createRadialGradient(
            p.x,
            p.y,
            3,
            p.x,
            p.y,
            18
          );
          voidGrad.addColorStop(0, '#000000');
          voidGrad.addColorStop(0.7, '#070a0f');
          voidGrad.addColorStop(0.9, '#111827');
          voidGrad.addColorStop(1, 'rgba(0, 0, 0, 0.85)');

          offCtx.beginPath();
          offCtx.arc(p.x, p.y, 18, 0, Math.PI * 2);
          offCtx.fillStyle = voidGrad;
          offCtx.fill();

          offCtx.beginPath();
          offCtx.arc(p.x, p.y, 18.5, p.ang - 0.75, p.ang + 0.75);
          offCtx.lineWidth = 4;
          offCtx.strokeStyle = '#05070a';
          offCtx.stroke();
        });

        const cornerPlates = [
          { x: 0, y: 0, w: 25, h: 25, r: 0 },
          { x: 800, y: 0, w: 25, h: 25, r: Math.PI * 0.5 },
          { x: 0, y: 400, w: 25, h: 25, r: -Math.PI * 0.5 },
          { x: 800, y: 400, w: 25, h: 25, r: Math.PI },
        ];
        cornerPlates.forEach((cp) => {
          offCtx.save();
          offCtx.translate(cp.x, cp.y);
          offCtx.rotate(cp.r);
          const brassGrad = offCtx.createLinearGradient(0, 0, 20, 20);
          brassGrad.addColorStop(0, '#78350f');
          brassGrad.addColorStop(0.4, '#fbbf24');
          brassGrad.addColorStop(0.85, '#fef08a');
          brassGrad.addColorStop(1, '#92400e');
          offCtx.fillStyle = brassGrad;
          offCtx.beginPath();
          offCtx.moveTo(0, 0);
          offCtx.lineTo(26, 0);
          offCtx.bezierCurveTo(24, 15, 15, 24, 0, 26);
          offCtx.closePath();
          offCtx.fill();
          offCtx.restore();
        });

        offCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        offCtx.lineWidth = 1;
        offCtx.beginPath();
        offCtx.moveTo(200, 21);
        offCtx.lineTo(200, 379);
        offCtx.stroke();

        offCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        offCtx.beginPath();
        offCtx.arc(200, 200, 48, Math.PI * 0.5, Math.PI * 1.5, false);
        offCtx.stroke();

        offCtx.beginPath();
        offCtx.arc(200, 200, 3.5, 0, Math.PI * 2);
        offCtx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        offCtx.fill();
        offCtx.beginPath();
        offCtx.arc(200, 200, 1.2, 0, Math.PI * 2);
        offCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        offCtx.fill();

        offCtx.beginPath();
        offCtx.arc(600, 200, 3, 0, Math.PI * 2);
        offCtx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        offCtx.fill();
        offCtx.beginPath();
        offCtx.arc(600, 200, 1, 0, Math.PI * 2);
        offCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        offCtx.fill();
      }
      ctx.offscreenCanvasRef.current = offCanvas;
    }

    // Initialize atmospheric dust specks if empty
    if (ctx.dustSpecksRef.current.length === 0) {
      for (let i = 0; i < 15; i++) {
        ctx.dustSpecksRef.current.push({
          x: Math.random() * 760 + 20,
          y: Math.random() * 360 + 20,
          vx: (Math.random() - 0.5) * 0.16,
          vy: (Math.random() - 0.5) * 0.16,
          radius: Math.random() * 1.5 + 0.6,
          alpha: Math.random() * 0.28 + 0.12,
          speed: Math.random() * 0.04 + 0.015,
        });
      }
    }

    const drawLoop = () => {
      // Clear background
      ctx2d.clearRect(0, 0, 800, 400);

      // Decay impact camera shake based on real time (not frame rate dependent)
      const now = performance.now();
      const dtMs = now - lastFrameTime;
      lastFrameTime = now;
      if (ctx.impactShakeRef.current > 0.05) {
        ctx.impactShakeRef.current = Math.max(
          0,
          ctx.impactShakeRef.current * Math.pow(0.88, dtMs / 16.667)
        );
      } else {
        ctx.impactShakeRef.current = 0;
      }

      ctx2d.save();
      if (ctx.impactShakeRef.current > 0.05) {
        const sx = (Math.random() - 0.5) * ctx.impactShakeRef.current;
        const sy = (Math.random() - 0.5) * ctx.impactShakeRef.current;
        ctx2d.translate(sx, sy);
      }

      // Draw Cached Static Table Background
      if (ctx.offscreenCanvasRef.current) {
        ctx2d.drawImage(ctx.offscreenCanvasRef.current, 0, 0);
      }

      // 4.5. Render Sinking Balls with Ultimate Realism
      ctx.sinkingBallsRef.current = ctx.sinkingBallsRef.current.filter(
        (sb) => {
          sb.progress += 1;
          if (sb.progress >= sb.maxProgress) return false;

          const t = sb.progress / sb.maxProgress;
          const tEase = 1 - Math.pow(1 - t, 3);

          const pullForce = tEase;
          const currentX =
            sb.ball.x + (sb.pocketX - sb.ball.x) * pullForce;
          const currentY =
            sb.ball.y + (sb.pocketY - sb.ball.y) * pullForce;

          const scale = 1.0 - tEase * 0.45;

          const alpha = 1.0 - Math.pow(t, 2);

          const px = currentX;
          const py = currentY;
          const r = sb.ball.radius * scale;

          ctx2d.save();
          ctx2d.globalAlpha = alpha;

          const pocketShadow = ctx2d.createRadialGradient(
            px + 1.5,
            py + 2.0,
            1,
            px + 1.5,
            py + 2.0,
            r * 1.5
          );
          pocketShadow.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
          pocketShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx2d.beginPath();
          ctx2d.arc(px + 1.5, py + 2.0, r * 1.5, 0, Math.PI * 2);
          ctx2d.fillStyle = pocketShadow;
          ctx2d.fill();

          ctx2d.beginPath();
          ctx2d.arc(px, py, r, 0, Math.PI * 2);
          ctx2d.fillStyle = sb.ball.color;
          ctx2d.fill();

          if (sb.ball.type === 'stripe') {
            ctx2d.save();
            ctx2d.beginPath();
            ctx2d.arc(px, py, r, 0, Math.PI * 2);
            ctx2d.clip();

            ctx2d.fillStyle = '#fafaf9';
            ctx2d.beginPath();
            ctx2d.arc(px, py, r, 0, Math.PI * 2);
            ctx2d.fill();

            ctx2d.fillStyle = sb.ball.color;
            ctx2d.beginPath();
            ctx2d.ellipse(
              px,
              py,
              r,
              r * 0.6,
              Math.PI * 0.15,
              0,
              Math.PI * 2
            );
            ctx2d.fill();
            ctx2d.restore();
          }

          if (sb.ball.id !== 0 && sb.ball.number !== undefined) {
            ctx2d.beginPath();
            ctx2d.arc(px, py, r * 0.42, 0, Math.PI * 2);
            ctx2d.fillStyle = '#fffaeb';
            ctx2d.fill();
            ctx2d.strokeStyle = '#000000';
            ctx2d.lineWidth = 0.5 * scale;
            ctx2d.stroke();

            ctx2d.fillStyle = '#1e293b';
            ctx2d.font = `bold ${Math.max(4, 5.5 * scale)}px "JetBrains Mono", Courier New, monospace`;
            ctx2d.textAlign = 'center';
            ctx2d.textBaseline = 'middle';
            ctx2d.fillText(String(sb.ball.number), px, py + 0.35);
          }

          const levelDarkness = t * 0.92;
          const depthShader = ctx2d.createRadialGradient(
            px,
            py,
            0,
            px,
            py,
            r
          );
          depthShader.addColorStop(0, `rgba(0, 0, 0, ${levelDarkness})`);
          depthShader.addColorStop(
            1,
            `rgba(0, 0, 0, ${levelDarkness * 1.05})`
          );
          ctx2d.beginPath();
          ctx2d.arc(px, py, r, 0, Math.PI * 2);
          ctx2d.fillStyle = depthShader;
          ctx2d.fill();

          const localSpecular = ctx2d.createRadialGradient(
            px - r * 0.35,
            py - r * 0.35,
            0.1,
            px,
            py,
            r
          );
          localSpecular.addColorStop(
            0,
            `rgba(255, 255, 255, ${0.8 * (1 - t * 0.9)})`
          );
          localSpecular.addColorStop(1, 'rgba(0,0,0,0)');
          ctx2d.beginPath();
          ctx2d.arc(px, py, r, 0, Math.PI * 2);
          ctx2d.fillStyle = localSpecular;
          ctx2d.fill();

          ctx2d.restore();

          return true;
        }
      );

      // 5. Render All Balls using Ultra-Realistic 3D Spherical Glistening Shaders
      const eligibleIds = getEligibleBallIds(
        ctx.roomStateRef.current,
        ctx.roomStateRef.current.currentTurn
      );
      ctx.animatedBallsRef.current.forEach((b) => {
        if (b.isPocketed) return;

        const px =
          ctx.isScratchPlacingRef.current && b.id === 0
            ? ctx.placedPosRef.current.x
            : b.x;
        const py =
          ctx.isScratchPlacingRef.current && b.id === 0
            ? ctx.placedPosRef.current.y
            : b.y;
        const ballRadius = b.radius || 10;
        const softShadow = ctx2d.createRadialGradient(
          px + 3,
          py + 4,
          0,
          px + 3,
          py + 4,
          ballRadius * 2.0
        );
        softShadow.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
        softShadow.addColorStop(0.3, 'rgba(0, 0, 0, 0.30)');
        softShadow.addColorStop(0.6, 'rgba(0, 0, 0, 0.08)');
        softShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx2d.beginPath();
        ctx2d.arc(px + 3, py + 4, ballRadius * 2.0, 0, Math.PI * 2);
        ctx2d.fillStyle = softShadow;
        ctx2d.fill();

        const darkShadow = ctx2d.createRadialGradient(
          px + 1,
          py + 1.5,
          0,
          px + 1,
          py + 1.5,
          ballRadius * 1.1
        );
        darkShadow.addColorStop(0, 'rgba(0, 0, 0, 0.70)');
        darkShadow.addColorStop(0.5, 'rgba(0, 0, 0, 0.25)');
        darkShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx2d.beginPath();
        ctx2d.arc(px + 1, py + 1.5, ballRadius * 1.1, 0, Math.PI * 2);
        ctx2d.fillStyle = darkShadow;
        ctx2d.fill();

        const isTarget = eligibleIds.includes(b.id);

        if (isTarget) {
          const time = Date.now();
          const elapsed =
            time - ctx.turnStartTimestampRef.current;
          const visibleTime = 4000;
          const fadeTime = 1500;
          let baseAlphaScalar = 1.0;
          if (elapsed > visibleTime) {
            baseAlphaScalar = Math.max(
              0,
              1.0 - (elapsed - visibleTime) / fadeTime
            );
          }

          if (baseAlphaScalar > 0) {
            const isMyTurnActive =
              ctx.roomStateRef.current.currentTurn ===
              ctx.myPlayerIdRef.current;
            const baseAlpha =
              (isMyTurnActive ? 0.75 : 0.5) * baseAlphaScalar;
            const mainColor = isMyTurnActive
              ? '34, 211, 238'
              : '245, 158, 11';
            const accentColor = isMyTurnActive
              ? '6, 182, 212'
              : '234, 140, 8';

            ctx2d.save();
            const underGlow = ctx2d.createRadialGradient(
              px,
              py,
              ballRadius - 1,
              px,
              py,
              ballRadius + 6
            );
            underGlow.addColorStop(
              0,
              `rgba(${mainColor}, ${0.25 * baseAlpha})`
            );
            underGlow.addColorStop(
              0.6,
              `rgba(${accentColor}, ${0.08 * baseAlpha})`
            );
            underGlow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx2d.beginPath();
            ctx2d.arc(
              px,
              py,
              ballRadius + 6,
              0,
              Math.PI * 2
            );
            ctx2d.fillStyle = underGlow;
            ctx2d.fill();
            ctx2d.restore();

            for (let rIndex = 0; rIndex < 2; rIndex++) {
              const wavePhase =
                ((time / 1200) + rIndex * 0.5) % 1.0;
              const rippleRadius =
                ballRadius + 1.5 + wavePhase * 4.5;
              const rippleAlpha =
                (1.0 - wavePhase) * 0.35 * baseAlpha;

              ctx2d.save();
              ctx2d.beginPath();
              ctx2d.arc(
                px,
                py,
                rippleRadius,
                0,
                Math.PI * 2
              );
              ctx2d.strokeStyle = `rgba(${mainColor}, ${rippleAlpha})`;
              ctx2d.lineWidth = 0.8 + (1.0 - wavePhase) * 0.5;
              ctx2d.stroke();
              ctx2d.restore();
            }

            ctx2d.save();
            ctx2d.beginPath();
            ctx2d.arc(
              px,
              py,
              ballRadius + 2.2,
              0,
              Math.PI * 2
            );
            ctx2d.strokeStyle = `rgba(${mainColor}, ${0.65 * baseAlpha})`;
            ctx2d.lineWidth = 1.0;
            ctx2d.setLineDash([3, 2]);
            ctx2d.lineDashOffset = -(time / 25) % 100;
            ctx2d.stroke();
            ctx2d.restore();

            ctx2d.save();
            ctx2d.translate(px, py);
            ctx2d.rotate(time * 0.0004);
            ctx2d.strokeStyle = `rgba(${mainColor}, ${0.35 * baseAlpha})`;
            ctx2d.lineWidth = 0.8;
            const bLen = 2.0;
            const bDist = ballRadius + 3.8;

            for (let aCorner = 0; aCorner < 4; aCorner++) {
              ctx2d.save();
              ctx2d.rotate(
                (aCorner * Math.PI) / 2 + Math.PI / 4
              );
              ctx2d.beginPath();
              ctx2d.moveTo(bDist - bLen, bDist);
              ctx2d.lineTo(bDist, bDist);
              ctx2d.lineTo(bDist, bDist - bLen);
              ctx2d.stroke();
              ctx2d.restore();
            }
            ctx2d.restore();
          }
        }

        if (!ctx.ballRotationsRef.current[b.id]) {
          ctx.ballRotationsRef.current[b.id] = {
            ux: [1, 0, 0],
            uy: [0, 1, 0],
            uz: [0, 0, 1],
            angle: 0,
            pitch: 0,
            yaw: 0,
          };
        }
        const rot = ctx.ballRotationsRef.current[b.id];
        const ux = rot.ux || [1, 0, 0];
        const uy = rot.uy || [0, 1, 0];
        const uz = rot.uz || [0, 0, 1];

        if (b.id === 0) {
          ctx2d.save();
          ctx2d.beginPath();
          ctx2d.arc(px, py, ballRadius, 0, Math.PI * 2);
          ctx2d.clip();

          const cueGrad = ctx2d.createRadialGradient(
            px - ballRadius * 0.35,
            py - ballRadius * 0.35,
            0,
            px + ballRadius * 0.1,
            py + ballRadius * 0.1,
            ballRadius * 1.2
          );
          cueGrad.addColorStop(0, '#ffffff');
          cueGrad.addColorStop(0.15, '#fffefa');
          cueGrad.addColorStop(0.4, '#faf5ea');
          cueGrad.addColorStop(0.7, '#f0e8d8');
          cueGrad.addColorStop(0.85, '#e0d5c0');
          cueGrad.addColorStop(0.95, '#d0c4ae');
          cueGrad.addColorStop(1, '#b8ab94');
          ctx2d.fillStyle = cueGrad;
          ctx2d.fill();

          const measleDirs = [
            [1, 0, 0], [-1, 0, 0],
            [0, 1, 0], [0, -1, 0],
            [0, 0, 1], [0, 0, -1],
          ];
          measleDirs.forEach((dir) => {
            const wx = dir[0] * ux[0] + dir[1] * uy[0] + dir[2] * uz[0];
            const wy = dir[0] * ux[1] + dir[1] * uy[1] + dir[2] * uz[1];
            const wz = dir[0] * ux[2] + dir[1] * uy[2] + dir[2] * uz[2];
            if (wz > 0) {
              const sx = px + wx * ballRadius;
              const sy = py + wy * ballRadius;
              const dotSize = 1.8 * wz;
              if (dotSize > 0.25) {
                const dotGrad = ctx2d.createRadialGradient(sx, sy, 0, sx, sy, dotSize);
                dotGrad.addColorStop(0, '#ef4444');
                dotGrad.addColorStop(0.5, '#dc2626');
                dotGrad.addColorStop(1, 'rgba(180,40,40,0.3)');
                ctx2d.beginPath();
                ctx2d.arc(sx, sy, dotSize, 0, Math.PI * 2);
                ctx2d.fillStyle = dotGrad;
                ctx2d.fill();

                ctx2d.beginPath();
                ctx2d.arc(sx - dotSize * 0.15, sy - dotSize * 0.15, dotSize * 0.35, 0, Math.PI * 2);
                ctx2d.fillStyle = 'rgba(255,200,200,0.35)';
                ctx2d.fill();
              }
            }
          });
          ctx2d.restore();
        } else if (b.type === 'stripe') {
          ctx2d.save();
          ctx2d.beginPath();
          ctx2d.arc(px, py, ballRadius, 0, Math.PI * 2);
          ctx2d.clip();

          const ivoryGrad = ctx2d.createRadialGradient(
            px - ballRadius * 0.35,
            py - ballRadius * 0.35,
            0,
            px + ballRadius * 0.1,
            py + ballRadius * 0.1,
            ballRadius * 1.2
          );
          ivoryGrad.addColorStop(0, '#ffffff');
          ivoryGrad.addColorStop(0.25, '#fcfaf5');
          ivoryGrad.addColorStop(0.55, '#f2ecde');
          ivoryGrad.addColorStop(0.8, '#e6ddcc');
          ivoryGrad.addColorStop(0.95, '#d4cbb8');
          ivoryGrad.addColorStop(1, '#c0b6a2');
          ctx2d.fillStyle = ivoryGrad;
          ctx2d.fill();

          const beltW = Math.abs(uy[2]);
          const beltVisible = 0.08 + 0.58 * beltW;
          const minorR = ballRadius * beltVisible;
          const beltAng = Math.atan2(uy[1], uy[0]) + Math.PI / 2;

          ctx2d.fillStyle = 'rgba(0,0,0,0.20)';
          ctx2d.beginPath();
          ctx2d.ellipse(px, py, ballRadius + 0.5, minorR + beltW * 1.4, beltAng, 0, Math.PI * 2);
          ctx2d.fill();

          const beltGrad = ctx2d.createRadialGradient(
            px - ballRadius * 0.2,
            py - ballRadius * 0.2,
            0,
            px + ballRadius * 0.05,
            py + ballRadius * 0.05,
            ballRadius * 1.1
          );
          beltGrad.addColorStop(0, lightenColor(b.color, 30));
          beltGrad.addColorStop(0.2, b.color);
          beltGrad.addColorStop(0.65, b.color);
          beltGrad.addColorStop(0.88, darkenColor(b.color, 40));
          beltGrad.addColorStop(1, '#000000');
          ctx2d.fillStyle = beltGrad;
          ctx2d.beginPath();
          ctx2d.ellipse(px, py, ballRadius, minorR, beltAng, 0, Math.PI * 2);
          ctx2d.fill();

          ctx2d.restore();

          ctx2d.beginPath();
          ctx2d.arc(px, py, ballRadius - 0.2, 0, Math.PI * 2);
          ctx2d.strokeStyle = 'rgba(0,0,0,0.15)';
          ctx2d.lineWidth = 0.8;
          ctx2d.stroke();
        } else {
          ctx2d.save();
          ctx2d.beginPath();
          ctx2d.arc(px, py, ballRadius, 0, Math.PI * 2);
          ctx2d.clip();

          const c = b.color;
          const isBlack = b.id === 8;

          // Subsurface scattering base
          const solidGrad = ctx2d.createRadialGradient(
            px - ballRadius * 0.35,
            py - ballRadius * 0.35,
            0,
            px + ballRadius * 0.1,
            py + ballRadius * 0.1,
            ballRadius * 1.2
          );
          if (isBlack) {
            solidGrad.addColorStop(0, '#2a2a2a');
            solidGrad.addColorStop(0.2, '#1a1a1a');
            solidGrad.addColorStop(0.5, '#111111');
            solidGrad.addColorStop(0.85, '#080808');
            solidGrad.addColorStop(1, '#000000');
          } else {
            const brightColor = lightenColor(c, 35);
            const midColor = c;
            const darkColor = darkenColor(c, 30);
            solidGrad.addColorStop(0, brightColor);
            solidGrad.addColorStop(0.15, midColor);
            solidGrad.addColorStop(0.5, midColor);
            solidGrad.addColorStop(0.78, darkColor);
            solidGrad.addColorStop(0.92, '#111111');
            solidGrad.addColorStop(1, '#000000');
          }
          ctx2d.fillStyle = solidGrad;
          ctx2d.fill();

          // Inner subsurface glow (light scattering through material)
          if (!isBlack) {
            const sssGlow = ctx2d.createRadialGradient(
              px - ballRadius * 0.25,
              py - ballRadius * 0.25,
              0,
              px,
              py,
              ballRadius * 0.7
            );
            sssGlow.addColorStop(0, 'rgba(255,255,255,0.12)');
            sssGlow.addColorStop(0.3, 'rgba(255,255,255,0.05)');
            sssGlow.addColorStop(0.7, 'rgba(255,255,255,0.01)');
            sssGlow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx2d.fillStyle = sssGlow;
            ctx2d.beginPath();
            ctx2d.arc(px, py, ballRadius, 0, Math.PI * 2);
            ctx2d.fill();
          }

          ctx2d.restore();

          ctx2d.beginPath();
          ctx2d.arc(px, py, ballRadius - 0.3, 0, Math.PI * 2);
          ctx2d.strokeStyle = isBlack ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.18)';
          ctx2d.lineWidth = 0.8;
          ctx2d.stroke();
        }

        // Universal 3D Shading & Reflections
        ctx2d.save();
        ctx2d.beginPath();
        ctx2d.arc(px, py, ballRadius, 0, Math.PI * 2);
        ctx2d.clip();

        // Table felt reflection (bottom of ball)
        const tableReflect = ctx2d.createRadialGradient(
          px + ballRadius * 0.15,
          py + ballRadius * 0.25,
          ballRadius * 0.05,
          px,
          py + ballRadius * 0.1,
          ballRadius * 1.0
        );
        tableReflect.addColorStop(0, 'rgba(0,0,0,0)');
        tableReflect.addColorStop(0.5, 'rgba(0,0,0,0)');
        tableReflect.addColorStop(0.78, 'rgba(0,60,30,0.18)');
        tableReflect.addColorStop(0.92, 'rgba(0,80,40,0.10)');
        tableReflect.addColorStop(1, 'rgba(0,100,50,0.05)');
        ctx2d.fillStyle = tableReflect;
        ctx2d.fill();

        // Fresnel edge glow (rim light)
        const fresnelGrad = ctx2d.createRadialGradient(
          px, py, 0,
          px, py, ballRadius
        );
        fresnelGrad.addColorStop(0, 'rgba(255,255,255,0)');
        fresnelGrad.addColorStop(0.7, 'rgba(255,255,255,0)');
        fresnelGrad.addColorStop(0.88, 'rgba(255,255,255,0.04)');
        fresnelGrad.addColorStop(0.96, 'rgba(255,255,255,0.12)');
        fresnelGrad.addColorStop(1, 'rgba(255,255,255,0.20)');
        ctx2d.fillStyle = fresnelGrad;
        ctx2d.fill();

        // Bottom rim light (bounce light from table)
        const rimLight = ctx2d.createRadialGradient(
          px, py + ballRadius * 0.6, 0,
          px, py + ballRadius * 0.4, ballRadius * 0.6
        );
        rimLight.addColorStop(0, 'rgba(100,180,150,0.06)');
        rimLight.addColorStop(1, 'rgba(0,0,0,0)');
        ctx2d.fillStyle = rimLight;
        ctx2d.beginPath();
        ctx2d.arc(px, py, ballRadius, 0, Math.PI * 2);
        ctx2d.fill();

        ctx2d.restore();

        // Primary specular highlight (sharp)
        ctx2d.save();
        ctx2d.globalCompositeOperation = 'lighter';
        const specGrad = ctx2d.createRadialGradient(
          px - ballRadius * 0.42,
          py - ballRadius * 0.40,
          0,
          px - ballRadius * 0.25,
          py - ballRadius * 0.22,
          ballRadius * 0.32
        );
        specGrad.addColorStop(0, 'rgba(255,255,255,0.95)');
        specGrad.addColorStop(0.08, 'rgba(255,255,255,0.60)');
        specGrad.addColorStop(0.2, 'rgba(255,255,255,0.20)');
        specGrad.addColorStop(0.4, 'rgba(255,255,255,0.05)');
        specGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx2d.beginPath();
        ctx2d.arc(px, py, ballRadius, 0, Math.PI * 2);
        ctx2d.fillStyle = specGrad;
        ctx2d.fill();
        ctx2d.restore();

        // Secondary soft highlight (wider spread)
        ctx2d.save();
        ctx2d.globalCompositeOperation = 'lighter';
        const softSpecGrad = ctx2d.createRadialGradient(
          px - ballRadius * 0.34,
          py - ballRadius * 0.34,
          0,
          px,
          py,
          ballRadius * 0.75
        );
        softSpecGrad.addColorStop(0, 'rgba(255,255,255,0.15)');
        softSpecGrad.addColorStop(0.4, 'rgba(255,255,255,0.05)');
        softSpecGrad.addColorStop(0.7, 'rgba(255,255,255,0.02)');
        softSpecGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx2d.beginPath();
        ctx2d.arc(px, py, ballRadius, 0, Math.PI * 2);
        ctx2d.fillStyle = softSpecGrad;
        ctx2d.fill();
        ctx2d.restore();

        // Environment reflection (light from room/windows)
        ctx2d.save();
        ctx2d.globalCompositeOperation = 'lighter';
        const envGrad = ctx2d.createRadialGradient(
          px + ballRadius * 0.28,
          py - ballRadius * 0.32,
          0,
          px + ballRadius * 0.15,
          py - ballRadius * 0.15,
          ballRadius * 0.30
        );
        envGrad.addColorStop(0, 'rgba(180,200,255,0.12)');
        envGrad.addColorStop(0.3, 'rgba(160,190,255,0.05)');
        envGrad.addColorStop(1, 'rgba(150,180,255,0)');
        ctx2d.beginPath();
        ctx2d.arc(px, py, ballRadius, 0, Math.PI * 2);
        ctx2d.fillStyle = envGrad;
        ctx2d.fill();
        ctx2d.restore();

        // Subtle light caustic (warm spot reflection)
        ctx2d.save();
        ctx2d.globalCompositeOperation = 'lighter';
        const warmGrad = ctx2d.createRadialGradient(
          px - ballRadius * 0.1,
          py - ballRadius * 0.5,
          0,
          px - ballRadius * 0.05,
          py - ballRadius * 0.3,
          ballRadius * 0.20
        );
        warmGrad.addColorStop(0, 'rgba(255,220,180,0.06)');
        warmGrad.addColorStop(1, 'rgba(255,200,150,0)');
        ctx2d.beginPath();
        ctx2d.arc(px, py, ballRadius, 0, Math.PI * 2);
        ctx2d.fillStyle = warmGrad;
        ctx2d.fill();
        ctx2d.restore();

        // Number Badges
        if (b.id !== 0 && b.number) {
          const badgeDirs = [{ sign: 1 }, { sign: -1 }];
          badgeDirs.forEach(({ sign }) => {
            const wx = sign * uz[0];
            const wy = sign * uz[1];
            const wz = sign * uz[2];
            if (wz > 0.15) {
              const bx = px + wx * ballRadius * 0.9;
              const by = py + wy * ballRadius * 0.9;
              const textAngle = Math.atan2(uy[1], uy[0]) - Math.PI / 2;

              ctx2d.save();
              ctx2d.translate(bx, by);
              ctx2d.rotate(textAngle);

              const badgeR = 5.0;
              const badgeScaleY = Math.max(wz, 0.4);

              // Badge shadow
              ctx2d.beginPath();
              ctx2d.ellipse(0.6, 0.8, badgeR, badgeR * badgeScaleY, 0, 0, Math.PI * 2);
              ctx2d.fillStyle = 'rgba(0,0,0,0.20)';
              ctx2d.fill();

              // Badge base
              ctx2d.beginPath();
              ctx2d.ellipse(0, 0, badgeR, badgeR * badgeScaleY, 0, 0, Math.PI * 2);
              const badgeGrad = ctx2d.createRadialGradient(0, -badgeR * 0.2, 0, 0, 0, badgeR);
              badgeGrad.addColorStop(0, '#ffffff');
              badgeGrad.addColorStop(0.7, '#f8f6f0');
              badgeGrad.addColorStop(1, '#e8e4da');
              ctx2d.fillStyle = badgeGrad;
              ctx2d.fill();

              // Badge outline
              ctx2d.strokeStyle = 'rgba(0,0,0,0.20)';
              ctx2d.lineWidth = 0.5;
              ctx2d.stroke();

              // Number with better contrast
              ctx2d.scale(1, badgeScaleY);
              ctx2d.font = 'bold 9px "Segoe UI", Arial, sans-serif';
              ctx2d.textAlign = 'center';
              ctx2d.textBaseline = 'middle';

              // Text shadow
              ctx2d.fillStyle = 'rgba(0,0,0,0.35)';
              ctx2d.fillText(String(b.number), 0.5, 0.6);

              // Main text
              ctx2d.fillStyle = '#000000';
              ctx2d.fillText(String(b.number), 0, 0);
              ctx2d.restore();
            }
          });
        }
      });

      // 6. Draw Glowing Trajectory Laser Guide Lines & Cue Stick Shadow
      const isStrikingNow =
        ctx.strikeAnimRef.current &&
        ctx.strikeAnimRef.current.active;
      const isMyTurnActive =
        ctx.isMyTurnRef.current &&
        !ctx.roomStateRef.current.scratchOccurred &&
        (!ctx.isAnimatingRef.current || isStrikingNow);
      const showCueStickAndPaths =
        isMyTurnActive ||
        (!ctx.isMyTurnRef.current &&
          ctx.opponentAim &&
          !ctx.isAnimatingRef.current &&
          ctx.roomStateRef.current.status === 'playing');

      if (showCueStickAndPaths) {
        const cueBall =
          ctx.animatedBallsRef.current.find(
            (b) => b.id === 0
          );
        if (cueBall && !cueBall.isPocketed) {
          const showLasers = isMyTurnActive
            ? !ctx.isAnimatingRef.current && !isStrikingNow
            : true;

          const activeAngle = isMyTurnActive
            ? isStrikingNow
              ? ctx.strikeAnimRef.current!.angle
              : ctx.aimAngleRef.current
            : ctx.opponentAim
              ? ctx.opponentAim.angle
              : 0;

          const activePower = isMyTurnActive
            ? isStrikingNow
              ? ctx.strikeAnimRef.current!.power
              : ctx.shotPowerRef.current
            : ctx.opponentAim
              ? ctx.opponentAim.power
              : 40;

          const activeSpinX = isMyTurnActive
            ? ctx.spinXRef.current
            : ctx.opponentAim?.spinX || 0;
          const activeSpinY = isMyTurnActive
            ? ctx.spinYRef.current
            : ctx.opponentAim?.spinY || 0;

          const aimDx = Math.cos(activeAngle);
          const aimDy = Math.sin(activeAngle);

          if (showLasers) {
            const radius = 10;
            const minX = 20 + radius;
            const maxX = 780 - radius;
            const minY = 20 + radius;
            const maxY = 380 - radius;

            let tMin = Infinity;
            let pType: 'cushion' | 'ball' | 'none' =
              'none';
            let cushionNormalX = 0;
            let cushionNormalY = 0;
            let targetBallObj: Ball | null = null;

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

            for (
              let idx = 0;
              idx < ctx.animatedBallsRef.current.length;
              idx++
            ) {
              const b =
                ctx.animatedBallsRef.current[idx];
              if (b.id === 0 || b.isPocketed) continue;
              const ocX = cueBall.x - b.x;
              const ocY = cueBall.y - b.y;
              const bGrad =
                2 * (aimDx * ocX + aimDy * ocY);
              const cGrad =
                ocX * ocX +
                ocY * ocY -
                400;
              const discriminant =
                bGrad * bGrad - 4 * cGrad;
              if (discriminant >= 0) {
                const t1 =
                  (-bGrad - Math.sqrt(discriminant)) /
                  2;
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

            const realContactX =
              cueBall.x + aimDx * tMin;
            const realContactY =
              cueBall.y + aimDy * tMin;

            // PRO MODE: Guides are always visible and accurate, ignoring difficulty limits
            let drawTMin = tMin;

            const contactX =
              cueBall.x + aimDx * drawTMin;
            const contactY =
              cueBall.y + aimDy * drawTMin;

            // PRO MODE: Enhanced colors with higher visibility
            const mainLaserColor = isMyTurnActive
              ? '#ffaa00'
              : '#00e5ff';
            const mainShadowColor = isMyTurnActive
              ? '#ff8800'
              : '#00bbdd';
            const mainHazeColor = isMyTurnActive
              ? 'rgba(255, 170, 0, 0.35)'
              : 'rgba(0, 229, 255, 0.35)';
            const pulseBorderPrefix = isMyTurnActive
              ? 'rgba(255, 170, 0,'
              : 'rgba(0, 229, 255,';
            const centerBeadColor = isMyTurnActive
              ? '#ffaa00'
              : '#00e5ff';

            // PRO MODE: Enhanced multi-layer aiming line with intense glow
            {
              const lineLen =
                Math.hypot(
                  contactX - cueBall.x,
                  contactY - cueBall.y
                ) || 1;

              // Layer 1: Ultra-wide outer glow (atmospheric)
              ctx2d.save();
              const outerGlowGrad =
                ctx2d.createLinearGradient(
                  cueBall.x,
                  cueBall.y,
                  contactX,
                  contactY
                );
              const hazeBase = isMyTurnActive
                ? [255, 170, 0]
                : [0, 229, 255];
              outerGlowGrad.addColorStop(
                0,
                `rgba(${hazeBase[0]}, ${hazeBase[1]}, ${hazeBase[2]}, 0.18)`
              );
              outerGlowGrad.addColorStop(
                0.5,
                `rgba(${hazeBase[0]}, ${hazeBase[1]}, ${hazeBase[2]}, 0.08)`
              );
              outerGlowGrad.addColorStop(
                1,
                `rgba(${hazeBase[0]}, ${hazeBase[1]}, ${hazeBase[2]}, 0)`
              );
              ctx2d.strokeStyle = outerGlowGrad;
              ctx2d.lineWidth = 18;
              ctx2d.lineCap = 'round';
              ctx2d.shadowColor = mainShadowColor;
              ctx2d.shadowBlur = 25;
              ctx2d.beginPath();
              ctx2d.moveTo(cueBall.x, cueBall.y);
              ctx2d.lineTo(contactX, contactY);
              ctx2d.stroke();
              ctx2d.restore();

              // Layer 2: Medium glow (core beam)
              ctx2d.save();
              const midGlowGrad =
                ctx2d.createLinearGradient(
                  cueBall.x,
                  cueBall.y,
                  contactX,
                  contactY
                );
              midGlowGrad.addColorStop(
                0,
                `rgba(${hazeBase[0]}, ${hazeBase[1]}, ${hazeBase[2]}, 0.35)`
              );
              midGlowGrad.addColorStop(
                0.6,
                `rgba(${hazeBase[0]}, ${hazeBase[1]}, ${hazeBase[2]}, 0.15)`
              );
              midGlowGrad.addColorStop(
                1,
                `rgba(${hazeBase[0]}, ${hazeBase[1]}, ${hazeBase[2]}, 0)`
              );
              ctx2d.strokeStyle = midGlowGrad;
              ctx2d.lineWidth = 10;
              ctx2d.lineCap = 'round';
              ctx2d.shadowColor = mainShadowColor;
              ctx2d.shadowBlur = 14;
              ctx2d.beginPath();
              ctx2d.moveTo(cueBall.x, cueBall.y);
              ctx2d.lineTo(contactX, contactY);
              ctx2d.stroke();
              ctx2d.restore();

              // Layer 3: Core bright line (the actual aiming line)
              ctx2d.save();
              const coreGrad =
                ctx2d.createLinearGradient(
                  cueBall.x,
                  cueBall.y,
                  contactX,
                  contactY
                );
              coreGrad.addColorStop(0, mainLaserColor);
              coreGrad.addColorStop(
                0.6,
                mainLaserColor
              );
              coreGrad.addColorStop(
                1,
                `rgba(${hazeBase[0]}, ${hazeBase[1]}, ${hazeBase[2]}, 0)`
              );
              ctx2d.strokeStyle = coreGrad;
              ctx2d.lineWidth = 2.5;
              ctx2d.setLineDash([8, 5]);
              ctx2d.lineDashOffset =
                -(Date.now() / 50) % 13;
              ctx2d.shadowColor = mainShadowColor;
              ctx2d.shadowBlur = 8;
              ctx2d.beginPath();
              ctx2d.moveTo(cueBall.x, cueBall.y);
              ctx2d.lineTo(contactX, contactY);
              ctx2d.stroke();
              ctx2d.setLineDash([]);
              ctx2d.restore();

              // Layer 4: Center precision line (thin, solid for exact aiming)
              ctx2d.save();
              const precisionGrad =
                ctx2d.createLinearGradient(
                  cueBall.x,
                  cueBall.y,
                  contactX,
                  contactY
                );
              precisionGrad.addColorStop(0, '#ffffff');
              precisionGrad.addColorStop(0.5, mainLaserColor);
              precisionGrad.addColorStop(1, `rgba(${hazeBase[0]}, ${hazeBase[1]}, ${hazeBase[2]}, 0)`);
              ctx2d.strokeStyle = precisionGrad;
              ctx2d.lineWidth = 1.0;
              ctx2d.lineCap = 'round';
              ctx2d.shadowColor = mainShadowColor;
              ctx2d.shadowBlur = 4;
              ctx2d.beginPath();
              ctx2d.moveTo(cueBall.x, cueBall.y);
              ctx2d.lineTo(contactX, contactY);
              ctx2d.stroke();
              ctx2d.restore();

              // Layer 5: Distance markers (subtle dots along the line)
              ctx2d.save();
              ctx2d.strokeStyle = `rgba(${hazeBase[0]}, ${hazeBase[1]}, ${hazeBase[2]}, 0.6)`;
              ctx2d.lineWidth = 1;
              const markerSpacing = 30;
              const numMarkers = Math.floor(lineLen / markerSpacing);
              for (let m = 1; m <= numMarkers; m++) {
                const mx = cueBall.x + aimDx * m * markerSpacing;
                const my = cueBall.y + aimDy * m * markerSpacing;
                const alpha = 0.3 + 0.4 * Math.sin(Date.now() / 300 + m * 0.8);
                ctx2d.beginPath();
                ctx2d.arc(mx, my, 1.2, 0, Math.PI * 2);
                ctx2d.strokeStyle = `rgba(${hazeBase[0]}, ${hazeBase[1]}, ${hazeBase[2]}, ${alpha})`;
                ctx2d.stroke();
              }
              ctx2d.restore();
            }

            if (
              Math.abs(activeSpinX) > 0.05 ||
              Math.abs(activeSpinY) > 0.05
            ) {
              const spinIndicatorRadius = 14;
              const spinDirection = Math.atan2(
                -activeSpinY,
                activeSpinX
              );
              ctx2d.save();
              ctx2d.translate(cueBall.x, cueBall.y);
              ctx2d.strokeStyle =
                'rgba(248, 113, 113, 0.95)';
              ctx2d.lineWidth = 1.2;
              ctx2d.setLineDash([4, 3]);
              ctx2d.beginPath();
              ctx2d.arc(
                0,
                0,
                spinIndicatorRadius,
                0,
                Math.PI * 2
              );
              ctx2d.stroke();

              const arrowTipX =
                Math.cos(spinDirection) *
                spinIndicatorRadius;
              const arrowTipY =
                Math.sin(spinDirection) *
                spinIndicatorRadius;
              ctx2d.beginPath();
              ctx2d.moveTo(0, 0);
              ctx2d.lineTo(arrowTipX, arrowTipY);
              ctx2d.stroke();

              ctx2d.fillStyle =
                'rgba(248, 113, 113, 0.75)';
              ctx2d.beginPath();
              ctx2d.arc(
                arrowTipX,
                arrowTipY,
                2.2,
                0,
                Math.PI * 2
              );
              ctx2d.fill();
              ctx2d.restore();

              ctx2d.save();
              ctx2d.font =
                '600 10px sans-serif';
              ctx2d.fillStyle =
                'rgba(248, 113, 113, 0.92)';
              ctx2d.textAlign = 'center';
              const spinLabel =
                activeSpinY > 0
                  ? 'FOLLOW'
                  : activeSpinY < 0
                    ? 'DRAW'
                    : 'NEUTRAL';
              const englishLabel =
                activeSpinX > 0
                  ? 'RIGHT ENGLISH'
                  : activeSpinX < 0
                    ? 'LEFT ENGLISH'
                    : 'CENTER';
              ctx2d.fillText(
                `${spinLabel} • ${englishLabel}`,
                cueBall.x,
                cueBall.y + 44
              );
              ctx2d.restore();
            }

            // PRO MODE: Guides are ALWAYS visible, fully detailed, and high contrast
            {
              const pulseCycle =
                (Date.now() % 1200) / 1200;

              // 1. Double pulse ring around contact point
              ctx2d.save();
              ctx2d.beginPath();
              ctx2d.arc(
                contactX,
                contactY,
                radius + pulseCycle * 10,
                0,
                Math.PI * 2
              );
              ctx2d.strokeStyle = `${pulseBorderPrefix} ${0.6 * (1 - pulseCycle)}`;
              ctx2d.lineWidth = 1.6;
              ctx2d.stroke();
              ctx2d.restore();

              ctx2d.save();
              ctx2d.beginPath();
              ctx2d.arc(
                contactX,
                contactY,
                radius + ((pulseCycle + 0.5) % 1.0) * 10,
                0,
                Math.PI * 2
              );
              ctx2d.strokeStyle = `${pulseBorderPrefix} ${0.35 * (1 - ((pulseCycle + 0.5) % 1.0))}`;
              ctx2d.lineWidth = 1.0;
              ctx2d.stroke();
              ctx2d.restore();

              // 2. Draw Ghost Ball (semi-transparent 3D cue ball) at contact point
              if (pType === 'ball') {
                ctx2d.save();
                ctx2d.beginPath();
                ctx2d.arc(contactX, contactY, radius, 0, Math.PI * 2);
                ctx2d.clip();

                // Semitransparent cue ball base
                const cueGrad = ctx2d.createRadialGradient(
                  contactX - radius * 0.35,
                  contactY - radius * 0.35,
                  0,
                  contactX + radius * 0.1,
                  contactY + radius * 0.1,
                  radius * 1.2
                );
                cueGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
                cueGrad.addColorStop(0.3, 'rgba(250, 245, 234, 0.35)');
                cueGrad.addColorStop(0.7, 'rgba(240, 228, 208, 0.25)');
                cueGrad.addColorStop(1, 'rgba(184, 171, 148, 0.15)');
                ctx2d.fillStyle = cueGrad;
                ctx2d.fill();

                // Alignment ring inside
                ctx2d.strokeStyle = 'rgba(239, 68, 68, 0.4)';
                ctx2d.lineWidth = 1;
                ctx2d.beginPath();
                ctx2d.arc(contactX, contactY, radius * 0.5, 0, Math.PI * 2);
                ctx2d.stroke();
                ctx2d.restore();

                // Draw alignment ring (high tech glass border)
                ctx2d.save();
                ctx2d.beginPath();
                ctx2d.arc(contactX, contactY, radius, 0, Math.PI * 2);
                ctx2d.strokeStyle = isMyTurnActive ? 'rgba(255, 170, 0, 0.85)' : 'rgba(0, 229, 255, 0.85)';
                ctx2d.lineWidth = 1.6;
                ctx2d.setLineDash([4, 2]);
                ctx2d.lineDashOffset = (Date.now() / 40) % 6;
                ctx2d.stroke();
                ctx2d.restore();

                // Draw glossy overlay reflection
                ctx2d.save();
                ctx2d.globalCompositeOperation = 'lighter';
                const specGrad = ctx2d.createRadialGradient(
                  contactX - radius * 0.4,
                  contactY - radius * 0.4,
                  0,
                  contactX - radius * 0.25,
                  contactY - radius * 0.22,
                  radius * 0.35
                );
                specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
                specGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.30)');
                specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx2d.beginPath();
                ctx2d.arc(contactX, contactY, radius, 0, Math.PI * 2);
                ctx2d.fillStyle = specGrad;
                ctx2d.fill();
                ctx2d.restore();
              } else {
                // If hitting cushion, draw a solid contact circle
                ctx2d.save();
                ctx2d.beginPath();
                ctx2d.arc(contactX, contactY, radius, 0, Math.PI * 2);
                ctx2d.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                ctx2d.lineWidth = 1.4;
                ctx2d.stroke();
                ctx2d.restore();
              }

              // Glass specular spot inside contact circle
              ctx2d.save();
              const glassSpot =
                ctx2d.createRadialGradient(
                  contactX - radius * 0.3,
                  contactY - radius * 0.3,
                  0.5,
                  contactX,
                  contactY,
                  radius
                );
              glassSpot.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
              glassSpot.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
              glassSpot.addColorStop(1, 'rgba(255, 255, 255, 0)');
              ctx2d.fillStyle = glassSpot;
              ctx2d.beginPath();
              ctx2d.arc(contactX, contactY, radius, 0, Math.PI * 2);
              ctx2d.fill();

              // Center precision bead
              ctx2d.beginPath();
              ctx2d.arc(
                contactX,
                contactY,
                2.5,
                0,
                Math.PI * 2
              );
              ctx2d.fillStyle = '#ffffff';
              ctx2d.fill();
              ctx2d.beginPath();
              ctx2d.arc(
                contactX,
                contactY,
                1.3,
                0,
                Math.PI * 2
              );
              ctx2d.fillStyle = centerBeadColor;
              ctx2d.fill();
              ctx2d.restore();
            }

            // PRO MODE: CUESTICK REFLECTED TRAJECTORY (Always Visible & Extended)
            if (pType === 'cushion') {
              const refDx =
                aimDx -
                2 *
                  (aimDx * cushionNormalX +
                    aimDy * cushionNormalY) *
                  cushionNormalX;
              const refDy =
                aimDy -
                2 *
                  (aimDx * cushionNormalX +
                    aimDy * cushionNormalY) *
                  cushionNormalY;

              let curDx = refDx;
              let curDy = refDy;
              if (cushionNormalY !== 0) {
                curDx += activeSpinX * 0.45 * -cushionNormalY;
              } else if (cushionNormalX !== 0) {
                curDy += activeSpinX * 0.45 * cushionNormalX;
              }

              const curMag = Math.sqrt(curDx * curDx + curDy * curDy) || 1;
              curDx /= curMag;
              curDy /= curMag;

              let currentX = contactX;
              let currentY = contactY;

              const bouncePoints = [
                { x: cueBall.x, y: cueBall.y },
                { x: contactX, y: contactY },
              ];
              
              // PRO MODE: Extended to 6 bounces for maximum professional precision
              const maxBounces = 6;
              let totalLengthLeft = 800; 

              for (let bIndex = 0; bIndex < maxBounces - 1; bIndex++) {
                let tMinB = Infinity;
                let nextNormalX = 0;
                let nextNormalY = 0;

                if (curDx > 0) {
                  const t = (maxX - currentX) / curDx;
                  if (t > 0.001 && t < tMinB) { tMinB = t; nextNormalX = -1; nextNormalY = 0; }
                } else if (curDx < 0) {
                  const t = (minX - currentX) / curDx;
                  if (t > 0.001 && t < tMinB) { tMinB = t; nextNormalX = 1; nextNormalY = 0; }
                }

                if (curDy > 0) {
                  const t = (maxY - currentY) / curDy;
                  if (t > 0.001 && t < tMinB) { tMinB = t; nextNormalX = 0; nextNormalY = -1; }
                } else if (curDy < 0) {
                  const t = (minY - currentY) / curDy;
                  if (t > 0.001 && t < tMinB) { tMinB = t; nextNormalX = 0; nextNormalY = 1; }
                }

                if (tMinB === Infinity || tMinB > 1000) break;

                const stepLen = Math.min(tMinB, totalLengthLeft);
                const nextX = currentX + curDx * stepLen;
                const nextY = currentY + curDy * stepLen;

                bouncePoints.push({ x: nextX, y: nextY });
                totalLengthLeft -= stepLen;
                if (totalLengthLeft <= 0) break;
                if (stepLen < tMinB) break;

                const newRefDx = curDx - 2 * (curDx * nextNormalX + curDy * nextNormalY) * nextNormalX;
                const newRefDy = curDy - 2 * (curDx * nextNormalX + curDy * nextNormalY) * nextNormalY;
                curDx = newRefDx;
                curDy = newRefDy;
                currentX = nextX;
                currentY = nextY;
              }

              // Render professional glowing paths
              ctx2d.save();
              ctx2d.strokeStyle = isMyTurnActive ? 'rgba(255, 170, 0, 0.25)' : 'rgba(0, 229, 255, 0.25)';
              ctx2d.lineWidth = 6;
              ctx2d.shadowColor = mainShadowColor;
              ctx2d.shadowBlur = 12;
              ctx2d.beginPath();
              ctx2d.moveTo(bouncePoints[0].x, bouncePoints[0].y);
              for (let i = 1; i < bouncePoints.length; i++) ctx2d.lineTo(bouncePoints[i].x, bouncePoints[i].y);
              ctx2d.stroke();
              ctx2d.restore();

              ctx2d.save();
              ctx2d.lineWidth = 2;
              ctx2d.strokeStyle = mainLaserColor;
              ctx2d.setLineDash([6, 4]);
              ctx2d.beginPath();
              ctx2d.moveTo(bouncePoints[0].x, bouncePoints[0].y);
              for (let i = 1; i < bouncePoints.length; i++) ctx2d.lineTo(bouncePoints[i].x, bouncePoints[i].y);
              ctx2d.stroke();
              ctx2d.restore();

              // Render high-tech bounce points
              for (let i = 1; i < bouncePoints.length; i++) {
                const bp = bouncePoints[i];
                const bpPulse = ((Date.now() + i * 200) % 1000) / 1000;
                ctx2d.save();
                ctx2d.beginPath();
                ctx2d.arc(bp.x, bp.y, 3 + bpPulse * 4, 0, Math.PI * 2);
                ctx2d.strokeStyle = `${pulseBorderPrefix} ${0.6 * (1 - bpPulse)}`;
                ctx2d.lineWidth = 1.5;
                ctx2d.stroke();
                ctx2d.beginPath();
                ctx2d.arc(bp.x, bp.y, 2, 0, Math.PI * 2);
                ctx2d.fillStyle = '#ffffff';
                ctx2d.fill();
                ctx2d.restore();
              }
            } else if (
              pType === 'ball' &&
              targetBallObj &&
              ctx.difficultyRef.current !== 'hard'
            ) {
              const phiDx =
                targetBallObj.x - realContactX;
              const phiDy =
                targetBallObj.y - realContactY;
              const phiDist =
                Math.sqrt(
                  phiDx * phiDx + phiDy * phiDy
                ) || 1;
              const phiNormX = phiDx / phiDist;
              const phiNormY = phiDy / phiDist;

              const cosCut =
                aimDx * phiNormX + aimDy * phiNormY;
              const cutAngleRad = Math.acos(
                Math.max(
                  -1,
                  Math.min(1, cosCut)
                )
              );
              const cutAngleDeg = Math.round(
                (cutAngleRad * 180) / Math.PI
              );

              let tcMin = Infinity;
              let targetCushionNormalX = 0;
              let targetCushionNormalY = 0;

              if (phiNormX > 0) {
                const t =
                  (maxX - targetBallObj.x) /
                  phiNormX;
                if (t > 0 && t < tcMin) {
                  tcMin = t;
                  targetCushionNormalX = -1;
                  targetCushionNormalY = 0;
                }
              } else if (phiNormX < 0) {
                const t =
                  (minX - targetBallObj.x) /
                  phiNormX;
                if (t > 0 && t < tcMin) {
                  tcMin = t;
                  targetCushionNormalX = 1;
                  targetCushionNormalY = 0;
                }
              }
              if (phiNormY > 0) {
                const t =
                  (maxY - targetBallObj.y) /
                  phiNormY;
                if (t > 0 && t < tcMin) {
                  tcMin = t;
                  targetCushionNormalX = 0;
                  targetCushionNormalY = -1;
                }
              } else if (phiNormY < 0) {
                const t =
                  (minY - targetBallObj.y) /
                  phiNormY;
                if (t > 0 && t < tcMin) {
                  tcMin = t;
                  targetCushionNormalX = 0;
                  targetCushionNormalY = 1;
                }
              }

              if (
                tcMin === Infinity ||
                tcMin > 1000
              ) {
                tcMin = 150;
              }

              if (
                ctx.difficultyRef.current === 'medium'
              ) {
                tcMin = Math.min(tcMin, 65);
              }

              const targetContactX =
                targetBallObj.x + phiNormX * tcMin;
              const targetContactY =
                targetBallObj.y + phiNormY * tcMin;

              let targetPocket = null;

              // Render Target Ball Primary path
              ctx2d.save();
              ctx2d.shadowColor = '#059669';
              ctx2d.shadowBlur = 8;
              ctx2d.strokeStyle =
                'rgba(16, 185, 129, 0.18)';
              ctx2d.lineWidth = 3.5;
              ctx2d.beginPath();
              ctx2d.moveTo(
                targetBallObj.x,
                targetBallObj.y
              );
              ctx2d.lineTo(
                targetContactX,
                targetContactY
              );
              ctx2d.stroke();

              ctx2d.strokeStyle = '#10b981';
              ctx2d.lineWidth = 1.6;
              ctx2d.setLineDash([4, 3]);
              ctx2d.beginPath();
              ctx2d.moveTo(
                targetBallObj.x,
                targetBallObj.y
              );
              ctx2d.lineTo(
                targetContactX,
                targetContactY
              );
              ctx2d.stroke();
              ctx2d.restore();

              if (
                !targetPocket &&
                tcMin !== Infinity &&
                ctx.difficultyRef.current === 'easy'
              ) {
                const firstTargetRefDx =
                  phiNormX -
                  2 *
                    (phiNormX *
                      targetCushionNormalX +
                      phiNormY *
                        targetCushionNormalY) *
                    targetCushionNormalX;
                const firstTargetRefDy =
                  phiNormY -
                  2 *
                    (phiNormX *
                      targetCushionNormalX +
                      phiNormY *
                        targetCushionNormalY) *
                    targetCushionNormalY;

                let curTDx = firstTargetRefDx;
                let curTDy = firstTargetRefDy;
                let currentTX = targetContactX;
                let currentTY = targetContactY;
                let activeTargetNormalX =
                  targetCushionNormalX;
                let activeTargetNormalY =
                  targetCushionNormalY;

                const targetPoints = [
                  {
                    x: targetBallObj.x,
                    y: targetBallObj.y,
                  },
                  {
                    x: targetContactX,
                    y: targetContactY,
                  },
                ];

                let tMinT2 = Infinity;
                let nextTNormalX = 0;
                let nextTNormalY = 0;

                if (curTDx > 0) {
                  const t =
                    (maxX - currentTX) / curTDx;
                  if (
                    t > 0.001 &&
                    t < tMinT2
                  ) {
                    tMinT2 = t;
                    nextTNormalX = -1;
                    nextTNormalY = 0;
                  }
                } else if (curTDx < 0) {
                  const t =
                    (minX - currentTX) / curTDx;
                  if (
                    t > 0.001 &&
                    t < tMinT2
                  ) {
                    tMinT2 = t;
                    nextTNormalX = 1;
                    nextTNormalY = 0;
                  }
                }

                if (curTDy > 0) {
                  const t =
                    (maxY - currentTY) / curTDy;
                  if (
                    t > 0.001 &&
                    t < tMinT2
                  ) {
                    tMinT2 = t;
                    nextTNormalX = 0;
                    nextTNormalY = -1;
                  }
                } else if (curTDy < 0) {
                  const t =
                    (minY - currentTY) / curTDy;
                  if (
                    t > 0.001 &&
                    t < tMinT2
                  ) {
                    tMinT2 = t;
                    nextTNormalX = 0;
                    nextTNormalY = 1;
                  }
                }

                if (
                  tMinT2 !== Infinity &&
                  tMinT2 > 0
                ) {
                  const tContactX2 =
                    currentTX +
                    curTDx * tMinT2;
                  const tContactY2 =
                    currentTY +
                    curTDy * tMinT2;

                  targetPoints.push({
                    x: tContactX2,
                    y: tContactY2,
                  });

                  const curTDx3 =
                    curTDx -
                    2 *
                      (curTDx * nextTNormalX +
                        curTDy *
                          nextTNormalY) *
                      nextTNormalX;
                  const curTDy3 =
                    curTDy -
                    2 *
                      (curTDx * nextTNormalX +
                        curTDy *
                          nextTNormalY) *
                      nextTNormalY;

                  let tMinT3 = Infinity;
                  let nextTNormalX3 = 0;
                  let nextTNormalY3 = 0;

                  if (curTDx3 > 0) {
                    const t =
                      (maxX - tContactX2) /
                      curTDx3;
                    if (
                      t > 0.001 &&
                      t < tMinT3
                    ) {
                      tMinT3 = t;
                      nextTNormalX3 = -1;
                      nextTNormalY3 = 0;
                    }
                  } else if (
                    curTDx3 < 0
                  ) {
                    const t =
                      (minX - tContactX2) /
                      curTDx3;
                    if (
                      t > 0.001 &&
                      t < tMinT3
                    ) {
                      tMinT3 = t;
                      nextTNormalX3 = 1;
                      nextTNormalY3 = 0;
                    }
                  }
                  if (curTDy3 > 0) {
                    const t =
                      (maxY - tContactY2) /
                      curTDy3;
                    if (
                      t > 0.001 &&
                      t < tMinT3
                    ) {
                      tMinT3 = t;
                      nextTNormalX3 = 0;
                      nextTNormalY3 = -1;
                    }
                  } else if (
                    curTDy3 < 0
                  ) {
                    const t =
                      (minY - tContactY2) /
                      curTDy3;
                    if (
                      t > 0.001 &&
                      t < tMinT3
                    ) {
                      tMinT3 = t;
                      nextTNormalX3 = 0;
                      nextTNormalY3 = 1;
                    }
                  }

                  if (
                    tMinT3 !== Infinity &&
                    tMinT3 > 0
                  ) {
                    const tContactX3 =
                      tContactX2 +
                      curTDx3 *
                        Math.min(tMinT3, 110);
                    const tContactY3 =
                      tContactY2 +
                      curTDy3 *
                        Math.min(tMinT3, 110);
                    targetPoints.push({
                      x: tContactX3,
                      y: tContactY3,
                    });
                  }
                }

                ctx2d.save();
                ctx2d.shadowColor = '#059669';
                ctx2d.shadowBlur = 6;
                ctx2d.strokeStyle =
                  'rgba(16, 185, 129, 0.3)';
                ctx2d.lineWidth = 2;
                ctx2d.setLineDash([3, 2.5]);
                ctx2d.beginPath();
                ctx2d.moveTo(
                  targetPoints[0].x,
                  targetPoints[0].y
                );
                for (
                  let i = 1;
                  i < targetPoints.length;
                  i++
                ) {
                  ctx2d.lineTo(
                    targetPoints[i].x,
                    targetPoints[i].y
                  );
                }
                ctx2d.stroke();
                ctx2d.restore();

                for (
                  let i = 1;
                  i < targetPoints.length;
                  i++
                ) {
                  const tp = targetPoints[i];
                  ctx2d.save();
                  ctx2d.beginPath();
                  ctx2d.arc(
                    tp.x,
                    tp.y,
                    3,
                    0,
                    Math.PI * 2
                  );
                  ctx2d.fillStyle = '#10b981';
                  ctx2d.fill();
                  ctx2d.restore();
                }
              }

              // Cue Ball Tangent Path after collision
              const crossZ =
                aimDx * phiNormY -
                aimDy * phiNormX;
              let perpDx =
                crossZ >= 0
                  ? -phiNormY
                  : phiNormY;
              let perpDy =
                crossZ >= 0
                  ? phiNormX
                  : -phiNormX;

              if (
                aimDx * perpDx + aimDy * perpDy <
                0
              ) {
                perpDx = -perpDx;
                perpDy = -perpDy;
              }

              let tpMin = Infinity;
              let tangentCushionNormalX = 0;
              let tangentCushionNormalY = 0;

              if (perpDx > 0) {
                const t =
                  (maxX - realContactX) / perpDx;
                if (t > 0 && t < tpMin) {
                  tpMin = t;
                  tangentCushionNormalX = -1;
                  tangentCushionNormalY = 0;
                }
              } else if (perpDx < 0) {
                const t =
                  (minX - realContactX) / perpDx;
                if (t > 0 && t < tpMin) {
                  tpMin = t;
                  tangentCushionNormalX = 1;
                  tangentCushionNormalY = 0;
                }
              }
              if (perpDy > 0) {
                const t =
                  (maxY - realContactY) / perpDy;
                if (t > 0 && t < tpMin) {
                  tpMin = t;
                  tangentCushionNormalX = 0;
                  tangentCushionNormalY = -1;
                }
              } else if (perpDy < 0) {
                const t =
                  (minY - realContactY) / perpDy;
                if (t > 0 && t < tpMin) {
                  tpMin = t;
                  tangentCushionNormalX = 0;
                  tangentCushionNormalY = 1;
                }
              }

              if (
                tpMin === Infinity ||
                tpMin > 1000
              ) {
                tpMin = 65;
              }

              if (
                ctx.difficultyRef.current === 'medium'
              ) {
                tpMin = Math.min(tpMin, 55);
              }

              const tangentContactX =
                realContactX + perpDx * tpMin;
              const tangentContactY =
                realContactY + perpDy * tpMin;

              ctx2d.save();
              ctx2d.strokeStyle = isMyTurnActive
                ? 'rgba(245, 158, 11, 0.85)'
                : 'rgba(6, 182, 212, 0.85)';
              ctx2d.lineWidth = 1.3;
              ctx2d.setLineDash([3, 3]);
              ctx2d.beginPath();
              ctx2d.moveTo(
                realContactX,
                realContactY
              );
              if (
                activeSpinY !== 0 &&
                ctx.difficultyRef.current === 'easy'
              ) {
                const midX =
                  (realContactX + tangentContactX) /
                  2;
                const midY =
                  (realContactY + tangentContactY) /
                  2;
                const bendAmt = activeSpinY * 40;
                const ctrlX =
                  midX + aimDx * bendAmt;
                const ctrlY =
                  midY + aimDy * bendAmt;
                ctx2d.quadraticCurveTo(
                  ctrlX,
                  ctrlY,
                  tangentContactX,
                  tangentContactY
                );
              } else {
                ctx2d.lineTo(
                  tangentContactX,
                  tangentContactY
                );
              }
              ctx2d.stroke();

              if (
                tpMin < 200 &&
                tpMin > 1 &&
                ctx.difficultyRef.current === 'easy'
              ) {
                let tangRefDx =
                  perpDx -
                  2 *
                    (perpDx *
                      tangentCushionNormalX +
                      perpDy *
                        tangentCushionNormalY) *
                    tangentCushionNormalX;
                let tangRefDy =
                  perpDy -
                  2 *
                    (perpDx *
                      tangentCushionNormalX +
                      perpDy *
                        tangentCushionNormalY) *
                    tangentCushionNormalY;

                if (
                  tangentCushionNormalY !== 0
                ) {
                  tangRefDx +=
                    activeSpinX *
                    0.45 *
                    -tangentCushionNormalY;
                } else if (
                  tangentCushionNormalX !== 0
                ) {
                  tangRefDy +=
                    activeSpinX *
                    0.45 *
                    tangentCushionNormalX;
                }

                const tangMag =
                  Math.sqrt(
                    tangRefDx * tangRefDx +
                      tangRefDy * tangRefDy
                  ) || 1;
                tangRefDx /= tangMag;
                tangRefDy /= tangMag;

                const tangentPoints = [
                  { x: contactX, y: contactY },
                  {
                    x: tangentContactX,
                    y: tangentContactY,
                  },
                ];
                let curCdx = tangRefDx;
                let curCdy = tangRefDy;
                let curCX = tangentContactX;
                let curCY = tangentContactY;

                const maxTangBounces = 3;
                let totalLengthLeft = 320;

                for (
                  let bIndex = 0;
                  bIndex < maxTangBounces - 1;
                  bIndex++
                ) {
                  let tMinB = Infinity;
                  let nextNormalX = 0;
                  let nextNormalY = 0;

                  if (curCdx > 0) {
                    const t =
                      (maxX - curCX) / curCdx;
                    if (
                      t > 0.001 &&
                      t < tMinB
                    ) {
                      tMinB = t;
                      nextNormalX = -1;
                      nextNormalY = 0;
                    }
                  } else if (
                    curCdx < 0
                  ) {
                    const t =
                      (minX - curCX) / curCdx;
                    if (
                      t > 0.001 &&
                      t < tMinB
                    ) {
                      tMinB = t;
                      nextNormalX = 1;
                      nextNormalY = 0;
                    }
                  }

                  if (curCdy > 0) {
                    const t =
                      (maxY - curCY) / curCdy;
                    if (
                      t > 0.001 &&
                      t < tMinB
                    ) {
                      tMinB = t;
                      nextNormalX = 0;
                      nextNormalY = -1;
                    }
                  } else if (
                    curCdy < 0
                  ) {
                    const t =
                      (minY - curCY) / curCdy;
                    if (
                      t > 0.001 &&
                      t < tMinB
                    ) {
                      tMinB = t;
                      nextNormalX = 0;
                      nextNormalY = 1;
                    }
                  }

                  if (
                    tMinB === Infinity ||
                    tMinB > 1000
                  ) {
                    break;
                  }

                  const stepLen = Math.min(
                    tMinB,
                    totalLengthLeft
                  );
                  const nextX =
                    curCX + curCdx * stepLen;
                  const nextY =
                    curCY + curCdy * stepLen;

                  tangentPoints.push({
                    x: nextX,
                    y: nextY,
                  });
                  totalLengthLeft -= stepLen;
                  if (
                    totalLengthLeft <= 0
                  )
                    break;

                  if (stepLen < tMinB) {
                    break;
                  }

                  const newRefDx =
                    curCdx -
                    2 *
                      (curCdx *
                        nextNormalX +
                        curCdy *
                          nextNormalY) *
                      nextNormalX;
                  const newRefDy =
                    curCdy -
                    2 *
                      (curCdx *
                        nextNormalX +
                        curCdy *
                          nextNormalY) *
                      nextNormalY;
                  curCdx = newRefDx;
                  curCdy = newRefDy;
                  curCX = nextX;
                  curCY = nextY;
                }

                ctx2d.save();
                ctx2d.strokeStyle = isMyTurnActive
                  ? 'rgba(245, 158, 11, 0.55)'
                  : 'rgba(6, 182, 212, 0.55)';
                ctx2d.lineWidth = 1.1;
                ctx2d.setLineDash([1.5, 2]);
                ctx2d.beginPath();
                ctx2d.moveTo(
                  tangentPoints[1].x,
                  tangentPoints[1].y
                );
                for (
                  let i = 2;
                  i < tangentPoints.length;
                  i++
                ) {
                  ctx2d.lineTo(
                    tangentPoints[i].x,
                    tangentPoints[i].y
                  );
                }
                ctx2d.stroke();

                for (
                  let i = 1;
                  i < tangentPoints.length;
                  i++
                ) {
                  const tp = tangentPoints[i];
                  ctx2d.beginPath();
                  ctx2d.arc(
                    tp.x,
                    tp.y,
                    2.5,
                    0,
                    Math.PI * 2
                  );
                  ctx2d.fillStyle =
                    centerBeadColor;
                  ctx2d.fill();
                }
                ctx2d.restore();
              }
              ctx2d.restore();

              // Render telemetry labels
              ctx2d.save();
              ctx2d.fillStyle = '#fffaeb';
              ctx2d.font =
                'bold 8.5px "JetBrains Mono", monospace';
              ctx2d.textAlign = 'center';
              ctx2d.shadowColor =
                'rgba(0, 0, 0, 0.8)';
              ctx2d.shadowBlur = 4;

              let angleText = `${cutAngleDeg}° Cut`;
              if (cutAngleDeg < 3.5)
                angleText =
                  'Straight Shot (مباشر)';
              else if (cutAngleDeg > 78)
                angleText =
                  'Thin Cut (رقيق جداً)';

              ctx2d.fillText(
                angleText,
                contactX,
                contactY - 15
              );
              ctx2d.restore();
            }
          }

          // 7. CUE STICK
          let stickOpacity = 1.0;
          let stickDist =
            18 + (activePower / 100) * 105;
          const stickLength = 250;

          const activePulling = isMyTurnActive
            ? ctx.isPullingRef.current
            : ctx.opponentAim &&
              ctx.opponentAim.power > 5;
          if (activePulling && activePower > 35) {
            const tensionRatio =
              (activePower - 35) / 65;
            const trembleIntensity =
              tensionRatio * 0.75;
            stickDist +=
              Math.sin(
                performance.now() * 0.08
              ) * trembleIntensity;
          }

          if (
            isStrikingNow &&
            ctx.strikeAnimRef.current
          ) {
            if (
              ctx.strikeAnimRef.current
                .startTime === -1
            ) {
              stickDist =
                18 +
                (ctx.strikeAnimRef.current
                  .power /
                  100) *
                  105;
              stickOpacity = 1.0;
            } else {
              const STRIKE_ACCEL = 40;
              const FOLLOW_FADE = 320;
              const totalDuration =
                STRIKE_ACCEL + FOLLOW_FADE;

              const elapsed =
                performance.now() -
                ctx.strikeAnimRef.current
                  .startTime;

              if (elapsed < STRIKE_ACCEL) {
                const t = Math.min(
                  1,
                  elapsed / STRIKE_ACCEL
                );
                const chargeDist =
                  18 +
                  (ctx.strikeAnimRef.current
                    .power /
                    100) *
                    105;
                const easeT = t * t * t;
                stickDist =
                  chargeDist -
                  easeT * (chargeDist - 9.0);
                stickOpacity = 1.0;
              } else if (
                elapsed < totalDuration
              ) {
                const tFade = Math.min(
                  1,
                  (elapsed - STRIKE_ACCEL) /
                    FOLLOW_FADE
                );

                const baseFollowThrough = 8;
                const maxFollowThrough =
                  baseFollowThrough +
                  (ctx.strikeAnimRef.current
                    .power /
                    100) *
                    20;
                stickDist =
                  9.0 -
                  Math.sin(
                    tFade * Math.PI * 0.5
                  ) * maxFollowThrough;

                stickOpacity = Math.max(
                  0,
                  Math.pow(1.0 - tFade, 2.0)
                );

                if (
                  !ctx.strikeAnimRef.current
                    .hasStruck
                ) {
                  ctx.strikeAnimRef.current.hasStruck =
                    true;
                  poolAudio.playCueHit(
                    ctx.strikeAnimRef.current
                      .power
                  );
                  triggerLocalShootParticles(
                    ctx.strikeAnimRef.current
                      .power
                  );

                  ctx.impactShakeRef.current =
                    Math.min(
                      14.0,
                      2.0 +
                        (ctx.strikeAnimRef
                          .current.power /
                          100) *
                          12.0
                    );
                }
              } else {
                ctx.strikeAnimRef.current.active =
                  false;
                ctx.strikeAnimRef.current.hasStruck =
                  true;
                stickOpacity = 0;
              }
            }
          }

          ctx2d.save();
          ctx2d.globalAlpha = stickOpacity;

          const stickBackX =
            cueBall.x -
            aimDx * (stickDist + stickLength);
          const stickBackY =
            cueBall.y -
            aimDy * (stickDist + stickLength);
          const stickTipX =
            cueBall.x - aimDx * stickDist;
          const stickTipY =
            cueBall.y - aimDy * stickDist;

          const shadowOffsetDistance = 15;
          const shadowBlurStrength = 6;
          const shadowTipX =
            stickTipX +
            aimDy * shadowOffsetDistance +
            2;
          const shadowTipY =
            stickTipY -
            aimDx * shadowOffsetDistance +
            3;
          const shadowBackX =
            stickBackX +
            aimDy * shadowOffsetDistance +
            2;
          const shadowBackY =
            stickBackY -
            aimDx * shadowOffsetDistance +
            3;

          ctx2d.save();
          ctx2d.beginPath();
          ctx2d.moveTo(shadowBackX, shadowBackY);
          ctx2d.lineTo(shadowTipX, shadowTipY);
          ctx2d.lineWidth = 5;
          ctx2d.strokeStyle =
            'rgba(0, 0, 0, 0.35)';
          ctx2d.lineCap = 'round';
          ctx2d.shadowColor =
            'rgba(0, 0, 0, 0.45)';
          ctx2d.shadowBlur = shadowBlurStrength;
          ctx2d.stroke();
          ctx2d.restore();

          const stickNormX = -aimDy;
          const stickNormY = aimDx;

          const drawSegment = (
            startX: number,
            startY: number,
            endX: number,
            endY: number,
            startW: number,
            endW: number,
            style: any
          ) => {
            ctx2d.save();
            ctx2d.fillStyle = style;
            ctx2d.beginPath();
            ctx2d.moveTo(
              startX - stickNormX * startW,
              startY - stickNormY * startW
            );
            ctx2d.lineTo(
              endX - stickNormX * endW,
              endY - stickNormY * endW
            );
            ctx2d.lineTo(
              endX + stickNormX * endW,
              endY + stickNormY * endW
            );
            ctx2d.lineTo(
              startX + stickNormX * startW,
              startY + stickNormY * startW
            );
            ctx2d.closePath();
            ctx2d.fill();
            ctx2d.restore();
          };

          const getCylinderGrad = (
            sx: number,
            sy: number,
            ex: number,
            ey: number,
            color1: string,
            color2: string,
            color3: string
          ) => {
            const lG = ctx2d.createLinearGradient(
              sx - stickNormX * 4,
              sy - stickNormY * 4,
              sx + stickNormX * 4,
              sy + stickNormY * 4
            );
            lG.addColorStop(0, color1);
            lG.addColorStop(0.3, color2);
            lG.addColorStop(0.7, color2);
            lG.addColorStop(1, color3);
            return lG;
          };

          const buttLen = stickLength * 0.35;
          const Joint1X =
            stickBackX + aimDx * buttLen;
          const Joint1Y =
            stickBackY + aimDy * buttLen;

          const shaftLen = stickLength * 0.58;
          const Joint2X =
            Joint1X + aimDx * shaftLen;
          const Joint2Y =
            Joint1Y + aimDy * shaftLen;

          const Joint3X =
            Joint2X +
            aimDx * (stickLength * 0.05);
          const Joint3Y =
            Joint2Y +
            aimDy * (stickLength * 0.05);

          const buttGrad = getCylinderGrad(
            stickBackX,
            stickBackY,
            Joint1X,
            Joint1Y,
            '#110602',
            '#3f1a0d',
            '#1a0a04'
          );
          drawSegment(
            stickBackX,
            stickBackY,
            Joint1X,
            Joint1Y,
            5.0,
            4.3,
            buttGrad
          );

          const goldRingGrad = getCylinderGrad(
            Joint1X,
            Joint1Y,
            Joint1X + aimDx * 2,
            Joint1Y + aimDy * 2,
            '#78350f',
            '#fef08a',
            '#92400e'
          );
          drawSegment(
            Joint1X,
            Joint1Y,
            Joint1X + aimDx * 2,
            Joint1Y + aimDy * 2,
            4.3,
            4.2,
            goldRingGrad
          );

          const mapleGrad = getCylinderGrad(
            Joint1X + aimDx * 2,
            Joint1Y + aimDy * 2,
            Joint2X,
            Joint2Y,
            '#a16207',
            '#fef08a',
            '#ca8a04'
          );
          drawSegment(
            Joint1X + aimDx * 2,
            Joint1Y + aimDy * 2,
            Joint2X,
            Joint2Y,
            4.2,
            3.2,
            mapleGrad
          );

          const boneGrad = getCylinderGrad(
            Joint2X,
            Joint2Y,
            Joint3X,
            Joint3Y,
            '#e2e8f0',
            '#ffffff',
            '#cbd5e1'
          );
          drawSegment(
            Joint2X,
            Joint2Y,
            Joint3X,
            Joint3Y,
            3.2,
            3.0,
            boneGrad
          );

          const chalkTipX =
            Joint3X + aimDx * 3.5;
          const chalkTipY =
            Joint3Y + aimDy * 3.5;
          const chalkGrad = getCylinderGrad(
            Joint3X,
            Joint3Y,
            chalkTipX,
            chalkTipY,
            '#3b82f6',
            '#93c5fd',
            '#1d4ed8'
          );
          drawSegment(
            Joint3X,
            Joint3Y,
            chalkTipX,
            chalkTipY,
            3.0,
            2.9,
            chalkGrad
          );

          ctx2d.restore();

          const showPullHUD = isMyTurnActive
            ? ctx.isPullingRef.current && showLasers
            : ctx.opponentAim &&
              ctx.opponentAim.power > 5;
          if (showPullHUD) {
            const progress = activePower / 100;

            ctx2d.beginPath();
            ctx2d.arc(
              cueBall.x,
              cueBall.y,
              25,
              0,
              Math.PI * 2
            );
            ctx2d.strokeStyle =
              'rgba(15, 23, 42, 0.5)';
            ctx2d.lineWidth = 5;
            ctx2d.stroke();

            ctx2d.beginPath();
            ctx2d.arc(
              cueBall.x,
              cueBall.y,
              25,
              -Math.PI / 2,
              -Math.PI / 2 +
                Math.PI * 2 * progress
            );

            let ringColor = '#10b981';
            if (activePower > 75) {
              ringColor = '#ef4444';
            } else if (activePower > 35) {
              ringColor = '#f59e0b';
            }

            ctx2d.strokeStyle = ringColor;
            ctx2d.lineWidth = 5;
            ctx2d.stroke();

            ctx2d.save();
            ctx2d.font =
              'bold 9px monospace, Courier New';
            ctx2d.fillStyle = '#f8fafc';
            ctx2d.textAlign = 'center';
            ctx2d.fillText(
              `PULL: ${Math.round(activePower)}%`,
              cueBall.x,
              cueBall.y - 36
            );

            ctx2d.font = 'bold 9px sans-serif';
            ctx2d.fillStyle = '#fbbf24';
            ctx2d.fillText(
              isMyTurnActive
                ? 'RELEASE TO SHOOT'
                : 'OPPONENT CHARGING FORCE',
              cueBall.x,
              cueBall.y - 20
            );
            ctx2d.restore();
          } else {
            ctx2d.font =
              '500 9.5px "Inter", sans-serif';
            ctx2d.fillStyle =
              'rgba(255, 255, 255, 0.55)';
            ctx2d.textAlign = 'center';
            ctx2d.fillText(
              isMyTurnActive
                ? 'إسحب في أي مكان وقـف بالقـوة • SLIDE TO AIM & PULL TO SHOOT'
                : 'الخصم يقوم بضبط الضربة الآن • OPPONENT IS ADJUSTING AIM...',
              cueBall.x,
              cueBall.y - 20
            );
          }
        }
      }

      // 8. Render Placing ghost position in scratch mode
      if (ctx.isScratchPlacingRef.current) {
        const isOverlapping =
          ctx.roomStateRef.current.balls.some(
            (b) => {
              if (b.id === 0 || b.isPocketed)
                return false;
              const dx =
                ctx.placedPosRef.current.x - b.x;
              const dy =
                ctx.placedPosRef.current.y - b.y;
              const dist = Math.hypot(dx, dy);
              return dist < 20.0;
            }
          );

        const minX_ghost = 30 + 10;
        const maxX_ghost = 770 - 10;
        const minY_ghost = 30 + 10;
        const maxY_ghost = 370 - 10;
        const isOutOfBounds =
          ctx.placedPosRef.current.x <
            minX_ghost ||
          ctx.placedPosRef.current.x >
            maxX_ghost ||
          ctx.placedPosRef.current.y <
            minY_ghost ||
          ctx.placedPosRef.current.y >
            maxY_ghost;

        const isInvalidPos =
          isOverlapping || isOutOfBounds;
        const behindHeadStringRestriction =
          ctx.roomStateRef.current
            .ballInHandRestriction ===
          'behind_head_string';
        const headStringLineX = 220;
        const isHeadStringOutOfBounds =
          behindHeadStringRestriction &&
          ctx.placedPosRef.current.x >
            headStringLineX - 10;
        const finalInvalid =
          isInvalidPos || isHeadStringOutOfBounds;

        ctx2d.strokeStyle = finalInvalid
          ? 'rgba(239, 68, 68, 0.45)'
          : 'rgba(16, 185, 129, 0.35)';
        ctx2d.lineWidth = 2;
        ctx2d.strokeRect(20, 20, 760, 360);

        if (behindHeadStringRestriction) {
          ctx2d.beginPath();
          ctx2d.moveTo(headStringLineX, 20);
          ctx2d.lineTo(headStringLineX, 380);
          ctx2d.strokeStyle = finalInvalid
            ? 'rgba(239, 68, 68, 0.55)'
            : 'rgba(59, 130, 246, 0.55)';
          ctx2d.setLineDash([6, 6]);
          ctx2d.lineWidth = 2;
          ctx2d.stroke();
          ctx2d.setLineDash([]);

          ctx2d.save();
          ctx2d.font =
            'bold 10px sans-serif';
          ctx2d.fillStyle = finalInvalid
            ? '#f87171'
            : '#60a5fa';
          ctx2d.textAlign = 'center';
          ctx2d.fillText(
            'HEAD STRING',
            headStringLineX,
            18
          );
          ctx2d.fillText(
            'BALL-IN-HAND ZONE',
            headStringLineX,
            34
          );
          ctx2d.restore();

          ctx2d.save();
          ctx2d.fillStyle =
            'rgba(37, 99, 235, 0.08)';
          ctx2d.fillRect(
            22,
            20,
            headStringLineX - 22,
            360
          );
          ctx2d.restore();
        }

        const pulseRatio =
          (Date.now() % 800) / 800;
        ctx2d.beginPath();
        ctx2d.arc(
          ctx.placedPosRef.current.x,
          ctx.placedPosRef.current.y,
          BALL_R + pulseRatio * 4,
          0,
          Math.PI * 2
        );
        ctx2d.strokeStyle = isInvalidPos
          ? `rgba(239, 68, 68, ${0.45 * (1 - pulseRatio)})`
          : `rgba(16, 185, 129, ${0.45 * (1 - pulseRatio)})`;
        ctx2d.lineWidth = 1.5;
        ctx2d.stroke();

        ctx2d.beginPath();
        ctx2d.arc(
          ctx.placedPosRef.current.x,
          ctx.placedPosRef.current.y,
          BALL_R,
          0,
          Math.PI * 2
        );
        ctx2d.fillStyle = isInvalidPos
          ? 'rgba(239, 68, 68, 0.25)'
          : 'rgba(239, 246, 255, 0.6)';
        ctx2d.fill();
        ctx2d.strokeStyle = isInvalidPos
          ? '#ef4444'
          : '#10b981';
        ctx2d.stroke();

        ctx2d.fillStyle = isInvalidPos
          ? '#f87171'
          : '#10b981';
        ctx2d.font =
          'bold 10px sans-serif';
        ctx2d.textAlign = 'center';

        if (isInvalidPos) {
          ctx2d.fillText(
            'INVALID POSITION (Overlapping ball) | لا يمكن وضع الكرة هنا',
            ctx.placedPosRef.current.x,
            ctx.placedPosRef.current.y - 18
          );
        } else {
          ctx2d.fillText(
            'Drag to place, click Confirm | اسحب لوضع الكرة ثم اضغط تأكيد',
            ctx.placedPosRef.current.x,
            ctx.placedPosRef.current.y - 18
          );
        }
      }

      // ── POWER BAR (vertical, right side of table) ───────────
      if (
        ctx.isMyTurnRef.current &&
        !ctx.isScratchPlacingRef.current &&
        !ctx.isAnimatingRef.current
      ) {
        const barX = 785;
        const barTop = 30;
        const barBottom = 370;
        const barH = barBottom - barTop;
        const barW = 10;
        const power =
          ctx.shotPowerRef.current / 100;

        ctx2d.save();
        ctx2d.beginPath();
        ctx2d.roundRect(
          barX - barW / 2,
          barTop,
          barW,
          barH,
          4
        );
        ctx2d.fillStyle = 'rgba(0,0,0,0.55)';
        ctx2d.fill();
        ctx2d.strokeStyle =
          'rgba(255,255,255,0.12)';
        ctx2d.lineWidth = 1;
        ctx2d.stroke();

        const fillH = barH * power;
        const barFillGrad =
          ctx2d.createLinearGradient(
            0,
            barBottom,
            0,
            barBottom - fillH
          );
        barFillGrad.addColorStop(0, '#10b981');
        barFillGrad.addColorStop(0.45, '#f59e0b');
        barFillGrad.addColorStop(1, '#ef4444');
        ctx2d.save();
        ctx2d.beginPath();
        ctx2d.roundRect(
          barX - barW / 2,
          barBottom - fillH,
          barW,
          fillH,
          4
        );
        ctx2d.fillStyle = barFillGrad;
        ctx2d.fill();

        ctx2d.shadowColor =
          power > 0.75
            ? '#ef4444'
            : power > 0.4
              ? '#f59e0b'
              : '#10b981';
        ctx2d.shadowBlur = 8;
        ctx2d.fill();
        ctx2d.restore();

        ctx2d.font =
          'bold 8px monospace';
        ctx2d.fillStyle =
          'rgba(255,255,255,0.75)';
        ctx2d.textAlign = 'center';
        ctx2d.fillText(
          `${Math.round(ctx.shotPowerRef.current)}%`,
          barX,
          barBottom + 11
        );

        ctx2d.font = '7px monospace';
        ctx2d.fillStyle =
          'rgba(255,255,255,0.4)';
        ctx2d.fillText('PWR', barX, barTop - 5);
        ctx2d.restore();
      }

      // ── GAME OVER OVERLAY ───────────────
      const gsRoom = ctx.roomStateRef.current;
      if (
        gsRoom.status === 'gameover' &&
        gsRoom.winnerId
      ) {
        ctx2d.save();
        ctx2d.fillStyle =
          'rgba(0, 0, 0, 0.62)';
        ctx2d.fillRect(20, 20, 760, 360);

        const panelW = 340;
        const panelH = 130;
        const panelX = 400 - panelW / 2;
        const panelY = 200 - panelH / 2;
        const panelGrad =
          ctx2d.createLinearGradient(
            panelX,
            panelY,
            panelX,
            panelY + panelH
          );
        panelGrad.addColorStop(
          0,
          'rgba(15, 23, 42, 0.95)'
        );
        panelGrad.addColorStop(
          1,
          'rgba(30, 41, 59, 0.95)'
        );
        ctx2d.beginPath();
        (
          ctx2d as any
        ).roundRect?.(
          panelX,
          panelY,
          panelW,
          panelH,
          14
        ) ??
          ctx2d.rect(
            panelX,
            panelY,
            panelW,
            panelH
          );
        ctx2d.fillStyle = panelGrad;
        ctx2d.shadowColor = '#f59e0b';
        ctx2d.shadowBlur = 28;
        ctx2d.fill();
        ctx2d.strokeStyle = '#f59e0b';
        ctx2d.lineWidth = 1.5;
        ctx2d.stroke();
        ctx2d.restore();

        ctx2d.save();
        ctx2d.translate(400, panelY + 30);
        ctx2d.fillStyle = '#fbbf24';
        ctx2d.shadowColor = '#f59e0b';
        ctx2d.shadowBlur = 16;
        ctx2d.font = '26px serif';
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText('🏆', 0, 0);
        ctx2d.restore();

        const isMyWin =
          gsRoom.winnerId ===
          ctx.myPlayerIdRef.current;
        const winnerObj = gsRoom.players.find(
          (p: any) => p.id === gsRoom.winnerId
        );
        const winnerName =
          winnerObj?.username || 'Player';
        ctx2d.save();
        ctx2d.font =
          'bold 22px "JetBrains Mono", monospace';
        ctx2d.fillStyle = isMyWin
          ? '#fbbf24'
          : '#f87171';
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.shadowColor = isMyWin
          ? '#f59e0b'
          : '#dc2626';
        ctx2d.shadowBlur = 10;
        ctx2d.fillText(
          isMyWin
            ? '🎉 YOU WIN!'
            : `${winnerName} wins`,
          400,
          panelY + 70
        );
        ctx2d.restore();

        ctx2d.save();
        ctx2d.font = '11px sans-serif';
        ctx2d.fillStyle =
          'rgba(255,255,255,0.55)';
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText(
          '8-BALL POOL • GAME OVER',
          400,
          panelY + 98
        );
        ctx2d.restore();

        if (isMyWin) {
          const now = Date.now();
          const confettiColors = [
            '#fbbf24',
            '#f87171',
            '#34d399',
            '#60a5fa',
            '#a78bfa',
            '#fb923c',
          ];
          for (let ci = 0; ci < 28; ci++) {
            const seed =
              ci * 137.508 + now / 30;
            const cx =
              150 +
              ((ci * 23 +
                Math.sin(seed * 0.012) *
                  300 +
                300) %
                500);
            const cy =
              30 +
              ((now / 5 + ci * 19) % 340);
            const cr =
              2.5 + (ci % 4) * 1.2;
            const angle =
              (now / 800 + ci) * 0.8;
            ctx2d.save();
            ctx2d.translate(cx, cy);
            ctx2d.rotate(angle);
            ctx2d.fillStyle =
              confettiColors[
                ci % confettiColors.length
              ];
            ctx2d.globalAlpha = 0.75;
            ctx2d.fillRect(
              -cr,
              -cr * 0.5,
              cr * 2,
              cr
            );
            ctx2d.restore();
          }
        }
      }

      ctx2d.restore();

      // 9. Frame continuation
      animationId =
        requestAnimationFrame(drawLoop);
    };

    drawLoop();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, []);
}
