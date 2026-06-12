import { useEffect, RefObject } from 'react';
import { Ball, RoomState, Difficulty } from '../types';
import { BallRotationData } from '../components/PoolTable/rotation';
import {
  RippleData,
  ChalkParticle,
  DustSpeck,
  SinkingBall,
} from '../components/PoolTable/effects';
import { poolAudio } from '../utils/audio';
import { getOptimalDPR } from '../utils/mobile';

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
  difficultyRef: RefObject<Difficulty>;
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
  isMobileRef: RefObject<boolean>;
  opponentAim:
    | { angle: number; power: number; spinX?: number; spinY?: number }
    | null
  impactFlashesRef?: RefObject<{x: number, y: number, startTime: number}[]>;
  isFineAimRef?: RefObject<boolean>;
  aimInertiaVelocityRef?: RefObject<number>;
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

function drawArrowhead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size, size / 1.5);
  ctx.lineTo(-size, -size / 1.5);
  ctx.closePath();
  ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 3;
  ctx.fill();
  ctx.restore();
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

  // Main Canvas Rendering Loop
  useEffect(() => {
    let animationId: number;

    const canvas = ctx.canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx2d) return;

    const dpr = getOptimalDPR();
    canvas.width = 800 * dpr;
    canvas.height = 400 * dpr;
    ctx2d.scale(dpr, dpr);
    ctx2d.imageSmoothingEnabled = true;

    // Render loop with idle stop
    let lastFrameTime = performance.now();
    let idleFrames = 0;
    const MAX_IDLE_FRAMES = 30;

    const BALL_R = 10;

    // Cache static background table graphics on offscreen canvas for extreme performance
    if (!ctx.offscreenCanvasRef.current) {
      const offCanvas = document.createElement('canvas');
      offCanvas.width = 800 * dpr;
      offCanvas.height = 400 * dpr;
      const offCtx = offCanvas.getContext('2d', { willReadFrequently: false });
      if (offCtx) {
        offCtx.scale(dpr, dpr);
        // ── Outer table frame (wood rails) ──
        const RAIL_W = 28;
        const INNER = RAIL_W;
        const PLAY_W = 800 - RAIL_W * 2;
        const PLAY_H = 400 - RAIL_W * 2;
        const PX = RAIL_W;
        const PY = RAIL_W;

        // Wood rail base (rich mahogany - Miniclip style)
        const railColors = ['#0d0301', '#1a0702', '#3a0f05', '#2e0c04', '#0d0301'];
        const topRailGrad = offCtx.createLinearGradient(0, 0, 800, 8);
        railColors.forEach((c, i) => topRailGrad.addColorStop(i / 4, c));
        offCtx.fillStyle = topRailGrad;
        offCtx.fillRect(0, 0, 800, RAIL_W);
        offCtx.fillRect(0, 400 - RAIL_W, 800, RAIL_W);

        const sideRailGrad = offCtx.createLinearGradient(0, 0, 8, 400);
        railColors.forEach((c, i) => sideRailGrad.addColorStop(i / 4, c));
        offCtx.fillStyle = sideRailGrad;
        offCtx.fillRect(0, RAIL_W, RAIL_W, PLAY_H);
        offCtx.fillRect(800 - RAIL_W, RAIL_W, RAIL_W, PLAY_H);

        // Rich wood grain lines on rails (enhanced multi-layer procedural)
        // Layer 1: coarse grain - deeper, richer
        offCtx.strokeStyle = 'rgba(90, 35, 15, 0.14)';
        offCtx.lineWidth = 1.0;
        for (let i = 0; i < 40; i++) {
          const gY = 2 + Math.random() * (RAIL_W - 4);
          offCtx.beginPath();
          offCtx.moveTo(0, gY);
          for (let x = 0; x <= 800; x += 3) {
            const wave = Math.sin(x * 0.04 + i * 1.7) * 2.5 + Math.sin(x * 0.015 + i * 3.1) * 1.8 + Math.cos(x * 0.01 + i * 5.3) * 1.0;
            offCtx.lineTo(x, gY + wave);
          }
          offCtx.stroke();
        }
        for (let i = 0; i < 25; i++) {
          const gX = 2 + Math.random() * (RAIL_W - 4);
          offCtx.beginPath();
          offCtx.moveTo(gX, 0);
          for (let y = 0; y <= 400; y += 3) {
            const wave = Math.sin(y * 0.04 + i * 1.7) * 2.5 + Math.sin(y * 0.015 + i * 3.1) * 1.8 + Math.cos(y * 0.01 + i * 5.3) * 1.0;
            offCtx.lineTo(gX + wave, y);
          }
          offCtx.stroke();
        }

        // Layer 2: fine grain detail
        offCtx.strokeStyle = 'rgba(160, 80, 30, 0.10)';
        offCtx.lineWidth = 0.3;
        for (let i = 0; i < 60; i++) {
          const gY = Math.random() * RAIL_W;
          offCtx.beginPath();
          offCtx.moveTo(0, gY);
          for (let x = 0; x <= 800; x += 2) {
            offCtx.lineTo(x, gY + Math.sin(x * 0.08 + i * 5.3) * 0.8 + Math.cos(x * 0.03 + i * 2.7) * 0.5 + Math.sin(x * 0.02 + i * 8.1) * 0.3);
          }
          offCtx.stroke();
        }

        // Layer 3: wood pore dots
        offCtx.fillStyle = 'rgba(60, 25, 10, 0.10)';
        for (let i = 0; i < 60; i++) {
          const px = Math.random() * 800;
          const py = Math.random() * (i < 30 ? RAIL_W : 0) + (i < 30 ? 0 : 400 - RAIL_W);
          offCtx.beginPath();
          offCtx.ellipse(px, py, 0.5 + Math.random() * 0.8, 0.2 + Math.random() * 0.3, Math.random() * Math.PI, 0, Math.PI * 2);
          offCtx.fill();
        }
        for (let i = 0; i < 40; i++) {
          const px = Math.random() * (i < 20 ? RAIL_W : 0) + (i < 20 ? 0 : 800 - RAIL_W);
          const py = RAIL_W + Math.random() * (400 - RAIL_W * 2);
          offCtx.beginPath();
          offCtx.ellipse(px, py, 0.5 + Math.random() * 0.8, 0.2 + Math.random() * 0.3, Math.random() * Math.PI, 0, Math.PI * 2);
          offCtx.fill();
        }

        // 3D bevel on outer edge (top highlight)
        const bevelGradTop = offCtx.createLinearGradient(0, 0, 0, 4);
        bevelGradTop.addColorStop(0, 'rgba(255,200,150,0.18)');
        bevelGradTop.addColorStop(1, 'rgba(0,0,0,0)');
        offCtx.fillStyle = bevelGradTop;
        offCtx.fillRect(0, 0, 800, 3);
        offCtx.fillRect(0, 400 - 3, 800, 3);

        const bevelGradSide = offCtx.createLinearGradient(0, 0, 4, 0);
        bevelGradSide.addColorStop(0, 'rgba(255,200,150,0.14)');
        bevelGradSide.addColorStop(1, 'rgba(0,0,0,0)');
        offCtx.fillStyle = bevelGradSide;
        offCtx.fillRect(0, 0, 3, 400);
        offCtx.fillRect(800 - 3, 0, 3, 400);

        // Inner shadow for depth
        const innerShadow = offCtx.createRadialGradient(400, 200, 280, 400, 200, 420);
        innerShadow.addColorStop(0, 'rgba(0,0,0,0)');
        innerShadow.addColorStop(0.7, 'rgba(0,0,0,0)');
        innerShadow.addColorStop(1, 'rgba(0,0,0,0.3)');
        offCtx.fillStyle = innerShadow;
        offCtx.fillRect(PX - 8, PY - 8, PLAY_W + 16, PLAY_H + 16);

        // ── 3D Rubber Cushions with realistic profile ──
        // Cushion base (darker, at felt level) - vibrant green rubber
        const cushionBaseGrad = offCtx.createLinearGradient(PX, PY, PX, PY + 10);
        cushionBaseGrad.addColorStop(0, '#0c5a45');
        cushionBaseGrad.addColorStop(0.5, '#0e7055');
        cushionBaseGrad.addColorStop(1, '#094838');
        
        // Cushion top surface (raised, rounded appearance) - Miniclip vibrant green
        const cushionTopGrad = offCtx.createLinearGradient(PX, PY, PX, PY + 7);
        cushionTopGrad.addColorStop(0, '#0e7058');
        cushionTopGrad.addColorStop(0.2, '#169a78');
        cushionTopGrad.addColorStop(0.55, '#12866a');
        cushionTopGrad.addColorStop(0.85, '#0c7058');
        cushionTopGrad.addColorStop(1, '#0a4838');
        
        // Top cushion - two layers for 3D profile
        offCtx.fillStyle = cushionBaseGrad;
        offCtx.beginPath();
        offCtx.moveTo(PX - 2, PY);
        offCtx.lineTo(800 - PX + 2, PY);
        offCtx.lineTo(800 - PX - 4, PY + 8);
        offCtx.lineTo(PX + 4, PY + 8);
        offCtx.closePath();
        offCtx.fill();
        
        offCtx.fillStyle = cushionTopGrad;
        offCtx.beginPath();
        offCtx.moveTo(PX + 1, PY - 2);
        offCtx.lineTo(800 - PX - 1, PY - 2);
        offCtx.lineTo(800 - PX - 5, PY + 4);
        offCtx.lineTo(PX + 5, PY + 4);
        offCtx.closePath();
        offCtx.fill();
        
        // Bottom cushion
        offCtx.fillStyle = cushionBaseGrad;
        offCtx.beginPath();
        offCtx.moveTo(PX - 2, 400 - PY);
        offCtx.lineTo(800 - PX + 2, 400 - PY);
        offCtx.lineTo(800 - PX - 4, 400 - PY - 8);
        offCtx.lineTo(PX + 4, 400 - PY - 8);
        offCtx.closePath();
        offCtx.fill();
        
        offCtx.fillStyle = cushionTopGrad;
        offCtx.beginPath();
        offCtx.moveTo(PX + 1, 400 - PY + 2);
        offCtx.lineTo(800 - PX - 1, 400 - PY + 2);
        offCtx.lineTo(800 - PX - 5, 400 - PY - 4);
        offCtx.lineTo(PX + 5, 400 - PY - 4);
        offCtx.closePath();
        offCtx.fill();
        
        // Left cushion
        offCtx.fillStyle = cushionBaseGrad;
        offCtx.beginPath();
        offCtx.moveTo(PX, PY - 2);
        offCtx.lineTo(PX, 400 - PY + 2);
        offCtx.lineTo(PX + 8, 400 - PY - 4);
        offCtx.lineTo(PX + 8, PY + 4);
        offCtx.closePath();
        offCtx.fill();
        
        offCtx.fillStyle = cushionTopGrad;
        offCtx.beginPath();
        offCtx.moveTo(PX - 2, PY + 1);
        offCtx.lineTo(PX - 2, 400 - PY - 1);
        offCtx.lineTo(PX + 4, 400 - PY - 5);
        offCtx.lineTo(PX + 4, PY + 5);
        offCtx.closePath();
        offCtx.fill();
        
        // Right cushion
        offCtx.fillStyle = cushionBaseGrad;
        offCtx.beginPath();
        offCtx.moveTo(800 - PX, PY - 2);
        offCtx.lineTo(800 - PX, 400 - PY + 2);
        offCtx.lineTo(800 - PX - 8, 400 - PY - 4);
        offCtx.lineTo(800 - PX - 8, PY + 4);
        offCtx.closePath();
        offCtx.fill();
        
        offCtx.fillStyle = cushionTopGrad;
        offCtx.beginPath();
        offCtx.moveTo(800 - PX + 2, PY + 1);
        offCtx.lineTo(800 - PX + 2, 400 - PY - 1);
        offCtx.lineTo(800 - PX - 4, 400 - PY - 5);
        offCtx.lineTo(800 - PX - 4, PY + 5);
        offCtx.closePath();
        offCtx.fill();
        
        // Cushion top edge highlight (ball contact surface) - smoother, more realistic
        const edgeHL = offCtx.createLinearGradient(PX, PY, PX, PY + 4);
        edgeHL.addColorStop(0, 'rgba(100,230,190,0.48)');
        edgeHL.addColorStop(0.3, 'rgba(80,200,160,0.30)');
        edgeHL.addColorStop(0.6, 'rgba(60,180,140,0.15)');
        edgeHL.addColorStop(1, 'rgba(0,0,0,0)');
        offCtx.fillStyle = edgeHL;
        offCtx.fillRect(PX + 3, PY - 1, PLAY_W - 6, 4);
        offCtx.fillRect(PX + 3, 400 - PY - 3, PLAY_W - 6, 4);
        offCtx.fillStyle = edgeHL;
        offCtx.fillRect(PX - 1, PY + 3, 4, PLAY_H - 6);
        offCtx.fillRect(800 - PX - 3, PY + 3, 4, PLAY_H - 6);
        
        // Cushion rail bolts (screws along the cushion every ~70px)
        const boltGrad = offCtx.createRadialGradient(0, 0, 0.3, 0, 0, 1.8);
        boltGrad.addColorStop(0, '#2a1a08');
        boltGrad.addColorStop(0.5, '#4a3018');
        boltGrad.addColorStop(1, '#1a0e04');
        
        for (let bx = PX + 30; bx < 800 - PX - 20; bx += 72) {
          [PY - 1, 400 - PY + 1].forEach((by) => {
            offCtx.beginPath();
            offCtx.arc(bx, by, 2, 0, Math.PI * 2);
            offCtx.fillStyle = 'rgba(0,0,0,0.35)';
            offCtx.fill();
            offCtx.beginPath();
            offCtx.arc(bx - 0.3, by - 0.3, 1.5, 0, Math.PI * 2);
            offCtx.fillStyle = boltGrad;
            offCtx.fill();
          });
        }
        for (let by = PY + 30; by < 400 - PY - 20; by += 72) {
          [PX - 1, 800 - PX + 1].forEach((bx) => {
            offCtx.beginPath();
            offCtx.arc(bx, by, 2, 0, Math.PI * 2);
            offCtx.fillStyle = 'rgba(0,0,0,0.35)';
            offCtx.fill();
            offCtx.beginPath();
            offCtx.arc(bx - 0.3, by - 0.3, 1.5, 0, Math.PI * 2);
            offCtx.fillStyle = boltGrad;
            offCtx.fill();
          });
        }
        
        // Cushion inner shadow (transition from cushion to felt)
        const cushiShad = offCtx.createLinearGradient(PX, PY + 8, PX, PY + 18);
        cushiShad.addColorStop(0, 'rgba(0,0,0,0.15)');
        cushiShad.addColorStop(1, 'rgba(0,0,0,0)');
        offCtx.fillStyle = cushiShad;
        offCtx.fillRect(PX + 4, PY + 8, PLAY_W - 8, 10);
        offCtx.fillRect(PX + 4, 400 - PY - 18, PLAY_W - 8, 10);
        offCtx.fillStyle = cushiShad;
        offCtx.fillRect(PX + 8, PY + 4, 10, PLAY_H - 8);
        offCtx.fillRect(800 - PX - 18, PY + 4, 10, PLAY_H - 8);

        // Felt playing surface with vibrant tournament-green (Miniclip-style)
        const feltSpotlight = offCtx.createRadialGradient(400, 200, 30, 400, 200, 440);
        feltSpotlight.addColorStop(0, '#2ecca8');
        feltSpotlight.addColorStop(0.12, '#20c09a');
        feltSpotlight.addColorStop(0.3, '#14a884');
        feltSpotlight.addColorStop(0.55, '#0e8a6a');
        feltSpotlight.addColorStop(0.8, '#086a50');
        feltSpotlight.addColorStop(1, '#043a2a');
        offCtx.fillStyle = feltSpotlight;
        offCtx.beginPath();
        offCtx.roundRect(PX + 6, PY + 6, PLAY_W - 12, PLAY_H - 12, 4);
        offCtx.fill();

        // Procedural woven cloth texture (thread crosshatch)
        offCtx.globalAlpha = 0.035;
        for (let y = 0; y < PLAY_H - 12; y += 3) {
          const weaveX = PX + 8 + (y % 6 < 3 ? 0 : 1.5);
          offCtx.strokeStyle = y % 6 < 3 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
          offCtx.lineWidth = 0.4;
          offCtx.beginPath();
          offCtx.moveTo(weaveX, PY + 8 + y);
          offCtx.lineTo(weaveX + PLAY_W - 16, PY + 8 + y);
          offCtx.stroke();
        }
        for (let x = 0; x < PLAY_W - 12; x += 3) {
          const weaveY = PY + 8 + (x % 6 < 3 ? 0 : 1.5);
          offCtx.strokeStyle = x % 6 < 3 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
          offCtx.lineWidth = 0.4;
          offCtx.beginPath();
          offCtx.moveTo(PX + 8 + x, weaveY);
          offCtx.lineTo(PX + 8 + x, weaveY + PLAY_H - 16);
          offCtx.stroke();
        }
        offCtx.globalAlpha = 1.0;

        // Felt surface noise (micro-variation)
        const imageData = offCtx.getImageData(PX + 8, PY + 8, PLAY_W - 16, PLAY_H - 16);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const noise = (Math.random() - 0.5) * 6;
          data[i] = Math.max(0, Math.min(255, data[i] + noise));
          data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
          data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
        }
        offCtx.putImageData(imageData, PX + 8, PY + 8);

        // Felt brush stroke marks (subtle directional)
        offCtx.strokeStyle = 'rgba(255,255,255,0.015)';
        offCtx.lineWidth = 0.5;
        for (let i = 0; i < 30; i++) {
          const bx = PX + 10 + Math.random() * (PLAY_W - 20);
          const by = PY + 10 + Math.random() * (PLAY_H - 20);
          const bLen = 8 + Math.random() * 25;
          const bAng = Math.random() * Math.PI;
          offCtx.beginPath();
          offCtx.moveTo(bx, by);
          offCtx.lineTo(bx + Math.cos(bAng) * bLen, by + Math.sin(bAng) * bLen);
          offCtx.stroke();
        }

        // Felt nap directional effect (subtle grain along the table)
        const napGrad = offCtx.createLinearGradient(PX + 8, PY + 8, PX + 8 + PLAY_W - 16, PY + 8);
        napGrad.addColorStop(0, 'rgba(0,0,0,0.015)');
        napGrad.addColorStop(0.3, 'rgba(0,0,0,0)');
        napGrad.addColorStop(0.5, 'rgba(255,255,255,0.01)');
        napGrad.addColorStop(0.7, 'rgba(0,0,0,0)');
        napGrad.addColorStop(1, 'rgba(0,0,0,0.015)');
        offCtx.fillStyle = napGrad;
        offCtx.fillRect(PX + 8, PY + 8, PLAY_W - 16, PLAY_H - 16);

        // Felt edge shadows (table depth effect) - smoother, more natural
        const edgeShadowTop = offCtx.createLinearGradient(PX, PY + 6, PX, PY + 28);
        edgeShadowTop.addColorStop(0, 'rgba(0,0,0,0.30)');
        edgeShadowTop.addColorStop(0.2, 'rgba(0,0,0,0.18)');
        edgeShadowTop.addColorStop(0.5, 'rgba(0,0,0,0.06)');
        edgeShadowTop.addColorStop(1, 'rgba(0,0,0,0)');
        offCtx.fillStyle = edgeShadowTop;
        offCtx.fillRect(PX + 8, PY + 6, PLAY_W - 16, 22);

        const edgeShadowBot = offCtx.createLinearGradient(PX, 400 - PY - 6, PX, 400 - PY - 28);
        edgeShadowBot.addColorStop(0, 'rgba(0,0,0,0.55)');
        edgeShadowBot.addColorStop(0.2, 'rgba(0,0,0,0.30)');
        edgeShadowBot.addColorStop(0.5, 'rgba(0,0,0,0.10)');
        edgeShadowBot.addColorStop(1, 'rgba(0,0,0,0)');
        offCtx.fillStyle = edgeShadowBot;
        offCtx.fillRect(PX + 8, 400 - PY - 28, PLAY_W - 16, 22);

        const edgeShadowL = offCtx.createLinearGradient(PX + 6, PY, PX + 28, PY);
        edgeShadowL.addColorStop(0, 'rgba(0,0,0,0.55)');
        edgeShadowL.addColorStop(0.2, 'rgba(0,0,0,0.30)');
        edgeShadowL.addColorStop(0.5, 'rgba(0,0,0,0.10)');
        edgeShadowL.addColorStop(1, 'rgba(0,0,0,0)');
        offCtx.fillStyle = edgeShadowL;
        offCtx.fillRect(PX + 6, PY + 8, 22, PLAY_H - 16);

        const edgeShadowR = offCtx.createLinearGradient(800 - PX - 6, PY, 800 - PX - 28, PY);
        edgeShadowR.addColorStop(0, 'rgba(0,0,0,0.55)');
        edgeShadowR.addColorStop(0.2, 'rgba(0,0,0,0.30)');
        edgeShadowR.addColorStop(0.5, 'rgba(0,0,0,0.10)');
        edgeShadowR.addColorStop(1, 'rgba(0,0,0,0)');
        offCtx.fillStyle = edgeShadowR;
        offCtx.fillRect(800 - PX - 28, PY + 8, 22, PLAY_H - 16);

        // Head string & foot spot marks
        offCtx.strokeStyle = 'rgba(255,255,255,0.06)';
        offCtx.lineWidth = 1;
        offCtx.beginPath();
        offCtx.moveTo(200, PY + 7);
        offCtx.lineTo(200, 400 - PY - 7);
        offCtx.stroke();

        offCtx.strokeStyle = 'rgba(255,255,255,0.06)';
        offCtx.beginPath();
        offCtx.arc(200, 200, 48, Math.PI * 0.5, Math.PI * 1.5, false);
        offCtx.stroke();

        offCtx.beginPath();
        offCtx.arc(200, 200, 3.5, 0, Math.PI * 2);
        offCtx.fillStyle = 'rgba(255,255,255,0.10)';
        offCtx.fill();
        offCtx.beginPath();
        offCtx.arc(200, 200, 1.2, 0, Math.PI * 2);
        offCtx.fillStyle = 'rgba(255,255,255,0.5)';
        offCtx.fill();

        offCtx.beginPath();
        offCtx.arc(600, 200, 3, 0, Math.PI * 2);
        offCtx.fillStyle = 'rgba(255,255,255,0.10)';
        offCtx.fill();
        offCtx.beginPath();
        offCtx.arc(600, 200, 1, 0, Math.PI * 2);
        offCtx.fillStyle = 'rgba(255,255,255,0.5)';
        offCtx.fill();

        // Diamond markers (pearl inlays - glossy)
        const diamondSpacingX = 800 / 8;
        const pearlGrad = offCtx.createRadialGradient(-0.5, -0.5, 0.3, 0, 0, 4.5);
        pearlGrad.addColorStop(0, '#ffffff');
        pearlGrad.addColorStop(0.3, '#f8fafc');
        pearlGrad.addColorStop(0.7, '#e2e8f0');
        pearlGrad.addColorStop(1, '#94a3b8');
        const dY = RAIL_W / 2;

        for (let i = 1; i <= 7; i++) {
          if (i !== 4) {
            [dY, 400 - dY].forEach((yPos) => {
              offCtx.save();
              offCtx.translate(i * diamondSpacingX, yPos);
              offCtx.beginPath();
              offCtx.moveTo(0, -3.8);
              offCtx.lineTo(2.8, 0);
              offCtx.lineTo(0, 3.8);
              offCtx.lineTo(-2.8, 0);
              offCtx.closePath();
              offCtx.fillStyle = pearlGrad;
              offCtx.fill();
              offCtx.strokeStyle = 'rgba(255,255,255,0.4)';
              offCtx.lineWidth = 0.5;
              offCtx.stroke();
              offCtx.restore();
            });
          }
        }
        const diamondSpacingY = 400 / 4;
        [RAIL_W / 2, 800 - RAIL_W / 2].forEach((xPos) => {
          for (let j = 1; j <= 3; j++) {
            offCtx.save();
            offCtx.translate(xPos, j * diamondSpacingY);
            offCtx.beginPath();
            offCtx.moveTo(-3.8, 0);
            offCtx.lineTo(0, -2.8);
            offCtx.lineTo(3.8, 0);
            offCtx.lineTo(0, 2.8);
            offCtx.closePath();
            offCtx.fillStyle = pearlGrad;
            offCtx.fill();
            offCtx.strokeStyle = 'rgba(255,255,255,0.4)';
            offCtx.lineWidth = 0.5;
            offCtx.stroke();
            offCtx.restore();
          }
        });

        // ── POCKETS with 3D depth ──
        const pockets = [
          { x: PX, y: PY, ang: Math.PI * 0.25 },
          { x: 400, y: PY - 4, ang: Math.PI * 0.5 },
          { x: 800 - PX, y: PY, ang: Math.PI * 0.75 },
          { x: PX, y: 400 - PY, ang: -Math.PI * 0.25 },
          { x: 400, y: 400 - PY + 4, ang: -Math.PI * 0.5 },
          { x: 800 - PX, y: 400 - PY, ang: -Math.PI * 0.75 },
        ];

        pockets.forEach((p, idx) => {
          const isMiddle = idx === 1 || idx === 4;
          const s = (val: number) => isMiddle ? val * 0.82 : val; // Scale down middle pockets 18%

          // Outer shadow ring (subtle falloff)
          const outerRing = offCtx.createRadialGradient(p.x, p.y, s(18), p.x, p.y, s(34));
          outerRing.addColorStop(0, 'rgba(0,0,0,0)');
          outerRing.addColorStop(0.4, 'rgba(0,0,0,0.10)');
          outerRing.addColorStop(0.7, 'rgba(0,0,0,0.04)');
          outerRing.addColorStop(1, 'rgba(0,0,0,0)');
          offCtx.beginPath();
          offCtx.arc(p.x, p.y, s(34), 0, Math.PI * 2);
          offCtx.fillStyle = outerRing;
          offCtx.fill();

          // Dark pocket hole with more depth
          offCtx.beginPath();
          offCtx.arc(p.x, p.y, s(28), 0, Math.PI * 2);
          offCtx.fillStyle = 'rgba(0,0,0,0.85)';
          offCtx.fill();

          // Brass pocket rim (rich metallic ring) - enhanced 3D depth
          const rimGrad = offCtx.createRadialGradient(p.x, p.y, s(21), p.x, p.y, s(27));
          rimGrad.addColorStop(0, '#2a1005');
          rimGrad.addColorStop(0.10, '#4a2510');
          rimGrad.addColorStop(0.25, '#a07020');
          rimGrad.addColorStop(0.40, '#e8c550');
          rimGrad.addColorStop(0.55, '#f5d97a');
          rimGrad.addColorStop(0.70, '#d4a030');
          rimGrad.addColorStop(0.85, '#8a6018');
          rimGrad.addColorStop(1, '#3a1808');
          rimGrad.addColorStop(1, '#3a1808');
          offCtx.beginPath();
          offCtx.arc(p.x, p.y, s(27), 0, Math.PI * 2);
          offCtx.strokeStyle = rimGrad;
          offCtx.lineWidth = 3.8;
          offCtx.stroke();

          // Pocket inner darkness (deep void) - smoother depth
          const voidGrad = offCtx.createRadialGradient(p.x, p.y, 1, p.x, p.y, s(20));
          voidGrad.addColorStop(0, '#000000');
          voidGrad.addColorStop(0.15, '#000001');
          voidGrad.addColorStop(0.35, '#020408');
          voidGrad.addColorStop(0.60, '#050810');
          voidGrad.addColorStop(0.85, '#080c18');
          voidGrad.addColorStop(1, 'rgba(5,8,16,0.92)');
          offCtx.beginPath();
          offCtx.arc(p.x, p.y, s(20), 0, Math.PI * 2);
          offCtx.fillStyle = voidGrad;
          offCtx.fill();

          // Pocket Net (Crosshatch inside the void)
          offCtx.save();
          offCtx.beginPath();
          offCtx.arc(p.x, p.y, s(20), 0, Math.PI * 2);
          offCtx.clip();
          offCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          offCtx.lineWidth = 0.5;
          for (let i = -20; i <= 20; i += 3) {
            offCtx.beginPath();
            offCtx.moveTo(p.x - s(20), p.y + s(i));
            offCtx.lineTo(p.x + s(20), p.y + s(i));
            offCtx.stroke();
            offCtx.beginPath();
            offCtx.moveTo(p.x + s(i), p.y - s(20));
            offCtx.lineTo(p.x + s(i), p.y + s(20));
            offCtx.stroke();
          }
          // Inner drop shadow to give depth to the net
          const innerShadow = offCtx.createRadialGradient(p.x, p.y, s(5), p.x, p.y, s(22));
          innerShadow.addColorStop(0, 'rgba(0,0,0,0.55)');
          innerShadow.addColorStop(0.35, 'rgba(0,0,0,0.25)');
          innerShadow.addColorStop(1, 'rgba(0,0,0,0)');
          offCtx.fillStyle = innerShadow;
          offCtx.fill();
          offCtx.restore();

          // Pocket rim highlight (inner bevel - subtle metallic gleam)
          offCtx.beginPath();
          offCtx.arc(p.x, p.y, 22, p.ang - 0.6, p.ang + 0.6);
          offCtx.strokeStyle = 'rgba(255,230,170,0.35)';
          offCtx.lineWidth = 1.8;
          offCtx.stroke();

          // Screws on rim (brighter brass)
          offCtx.fillStyle = 'rgba(217, 119, 6, 0.9)';
          const screwAngs = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
          screwAngs.forEach((sa) => {
            const sx = p.x + Math.cos(sa) * 23;
            const sy = p.y + Math.sin(sa) * 23;
            offCtx.beginPath();
            offCtx.arc(sx, sy, 1.6, 0, Math.PI * 2);
            offCtx.fill();
            offCtx.beginPath();
            offCtx.arc(sx - 0.3, sy - 0.3, 0.6, 0, Math.PI * 2);
            offCtx.fillStyle = 'rgba(255,255,220,0.5)';
            offCtx.fill();
            offCtx.fillStyle = 'rgba(217, 119, 6, 0.9)';
          });

          // Pocket shadow (directional - darker)
          offCtx.beginPath();
          offCtx.arc(p.x, p.y, 20, p.ang - 0.8, p.ang + 0.8);
          offCtx.lineWidth = 6;
          offCtx.strokeStyle = '#000';
          offCtx.stroke();
        });

        // ── Brass corner plates (rich, polished) ──
        const cornerPlates = [
          { x: 0, y: 0, w: 28, h: 28, r: 0 },
          { x: 800, y: 0, w: 28, h: 28, r: Math.PI * 0.5 },
          { x: 0, y: 400, w: 28, h: 28, r: -Math.PI * 0.5 },
          { x: 800, y: 400, w: 28, h: 28, r: Math.PI },
        ];
        cornerPlates.forEach((cp) => {
          offCtx.save();
          offCtx.translate(cp.x, cp.y);
          offCtx.rotate(cp.r);
          // Deeper shadow
          offCtx.fillStyle = 'rgba(0,0,0,0.4)';
          offCtx.beginPath();
          offCtx.moveTo(1, 2);
          offCtx.lineTo(30, 2);
          offCtx.bezierCurveTo(28, 17, 17, 28, 2, 30);
          offCtx.closePath();
          offCtx.fill();

          // Richer brass gradient
          const brassGrad = offCtx.createLinearGradient(0, 0, 28, 28);
          brassGrad.addColorStop(0, '#4a2008');
          brassGrad.addColorStop(0.1, '#8a6020');
          brassGrad.addColorStop(0.35, '#f5d97a');
          brassGrad.addColorStop(0.6, '#e8c04a');
          brassGrad.addColorStop(0.8, '#f0cc60');
          brassGrad.addColorStop(1, '#5a2810');
          offCtx.fillStyle = brassGrad;
          offCtx.beginPath();
          offCtx.moveTo(0, 0);
          offCtx.lineTo(28, 0);
          offCtx.bezierCurveTo(26, 16, 16, 26, 0, 28);
          offCtx.closePath();
          offCtx.fill();

          // Screw in corner plate
          offCtx.beginPath();
          offCtx.arc(7, 7, 2.0, 0, Math.PI * 2);
          offCtx.fillStyle = '#2a1006';
          offCtx.fill();
          offCtx.beginPath();
          offCtx.arc(6.8, 6.8, 0.8, 0, Math.PI * 2);
          offCtx.fillStyle = 'rgba(255,255,220,0.4)';
          offCtx.fill();

          offCtx.restore();
        });
      }
      ctx.offscreenCanvasRef.current = offCanvas;
    }

    // Atmospheric dust specks (ambient effect)
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

      let lastDrawContactX: number | null = null;
      let lastDrawContactY: number | null = null;

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
        ctx2d.drawImage(ctx.offscreenCanvasRef.current, 0, 0, 800, 400);
      }

      // 4.5. Sinking ball animation — balls shrink + fade as they fall into pocket
      const aliveSink: SinkingBall[] = [];
      for (const sb of ctx.sinkingBallsRef.current) {
        sb.progress += 1.2;
        if (sb.progress >= sb.maxProgress) continue;
        const t = sb.progress / sb.maxProgress;
        const sx = sb.ball.x + (sb.pocketX - sb.ball.x) * t;
        const sy = sb.ball.y + (sb.pocketY - sb.ball.y) * t;
        const scale = 1 - t * 0.8;
        const alpha = 1 - t * t;
        const r = (sb.ball.radius || 10) * scale;
        ctx2d.save();
        ctx2d.globalAlpha = alpha;
        
        // 3D drop shadow
        ctx2d.beginPath();
        ctx2d.ellipse(sx + 4 * t, sy + 6 * t, r * 1.4, r * 1.0, 0, 0, Math.PI * 2);
        ctx2d.fillStyle = `rgba(0,0,0,${0.3 * (1 - t)})`;
        ctx2d.fill();
        
        // Rotate while falling
        ctx2d.translate(sx, sy);
        ctx2d.rotate(t * Math.PI * 4); // fast spin
        ctx2d.translate(-sx, -sy);
        
        const grad = ctx2d.createRadialGradient(sx - r * 0.25, sy - r * 0.25, 0, sx, sy, r);
        grad.addColorStop(0, lightenColor(sb.ball.color, 40));
        grad.addColorStop(0.5, sb.ball.color);
        grad.addColorStop(1, darkenColor(sb.ball.color, 50));
        ctx2d.beginPath();
        ctx2d.arc(sx, sy, r, 0, Math.PI * 2);
        ctx2d.fillStyle = grad;
        ctx2d.fill();
        ctx2d.restore();
        aliveSink.push(sb);
      }
      ctx.sinkingBallsRef.current = aliveSink;

      // 4.6. Render Impact Flashes
      if (ctx.impactFlashesRef?.current) {
        for (let i = ctx.impactFlashesRef.current.length - 1; i >= 0; i--) {
          const flash = ctx.impactFlashesRef.current[i];
          const elapsed = performance.now() - flash.startTime;
          if (elapsed > 40) {
            ctx.impactFlashesRef.current.splice(i, 1);
            continue;
          }
          const t = elapsed / 40; // 40ms flash
          ctx2d.save();
          ctx2d.globalCompositeOperation = 'lighter';
          const fGrad = ctx2d.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, 60 * (1 - t));
          fGrad.addColorStop(0, `rgba(255, 255, 255, ${0.8 * (1 - t)})`);
          fGrad.addColorStop(0.3, `rgba(255, 220, 180, ${0.4 * (1 - t)})`);
          fGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx2d.fillStyle = fGrad;
          ctx2d.beginPath();
          ctx2d.arc(flash.x, flash.y, 60 * (1 - t), 0, Math.PI * 2);
          ctx2d.fill();
          ctx2d.restore();
        }
      }

      // Motion Blur / Speed trails removed to make ball movement realistic and professional without artificial trails.

      // Felt wear marks from rolling balls (subtle nap compression)
      ctx2d.save();
      ctx2d.globalAlpha = 0.06;
      ctx2d.filter = 'blur(1px)';
      for (const b of ctx.animatedBallsRef.current) {
        if (b.isPocketed || b.id === 0) continue;
        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (speed > 0.5) {
          const wearAlpha = Math.min(0.08, speed * 0.003);
          ctx2d.fillStyle = 'rgba(40,35,30,0.3)';
          ctx2d.globalAlpha = wearAlpha;
          ctx2d.beginPath();
          ctx2d.arc(b.x - b.vx * 0.3, b.y - b.vy * 0.3, 10, 0, Math.PI * 2);
          ctx2d.fill();
        }
      }
      ctx2d.filter = 'none';
      ctx2d.globalAlpha = 1;
      ctx2d.restore();

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

        // Dynamic Lighting: light direction varies by ball position
        // Overhead lights at table center produce different look across the felt
        const tableCenterX = 400, tableCenterY = 200;
        const dxCenter = (px - tableCenterX) / 400;
        const dyCenter = (py - tableCenterY) / 200;
        const distFromCenter = Math.sqrt(dxCenter * dxCenter + dyCenter * dyCenter);
        // Balls near edges get more grazing light
        const edgeFactor = Math.min(1, distFromCenter * 0.8);
        const baseLightDir = -0.7;
        // Tilt light direction toward center for balls near edges
        const posAngle = Math.atan2(py - tableCenterY, px - tableCenterX);
        const lightTilt = edgeFactor * 0.25 * Math.sin(posAngle);
        const lightDir = baseLightDir + lightTilt;
        const lightDist = 6;
        const shadowOffX = Math.cos(lightDir) * lightDist;
        const shadowOffY = Math.sin(lightDir) * lightDist + 3;
        // Specular position shifts per ball
        const specOffX = -0.40 + dxCenter * 0.12;
        const specOffY = -0.38 + dyCenter * 0.10;

        const castShadow = ctx2d.createRadialGradient(
          px + shadowOffX + 2, py + shadowOffY + 2, 0,
          px + shadowOffX + 2, py + shadowOffY + 2, ballRadius * 2.0
        );
        // Softer shadows at edges, sharper near center
        const shadowDensity = 0.32 + (1 - edgeFactor) * 0.12;
        castShadow.addColorStop(0, `rgba(0, 0, 0, ${shadowDensity + 0.08})`);
        castShadow.addColorStop(0.08, `rgba(0, 0, 0, ${shadowDensity * 0.65})`);
        castShadow.addColorStop(0.25, `rgba(0, 0, 0, ${shadowDensity * 0.25})`);
        castShadow.addColorStop(0.5, `rgba(0, 0, 0, ${shadowDensity * 0.06})`);
        castShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx2d.beginPath();
        ctx2d.ellipse(px + shadowOffX + 2, py + shadowOffY + 2, ballRadius * (1.8 + edgeFactor * 0.4), ballRadius * (1.2 + edgeFactor * 0.3), lightDir + edgeFactor * 0.15, 0, Math.PI * 2);
        ctx2d.fillStyle = castShadow;
        ctx2d.fill();

        // Ambient soft shadow (contact shadow - tighter, position-aware)
        const contactDensity = 0.38 + (1 - edgeFactor) * 0.12;
        const contactShadow = ctx2d.createRadialGradient(
          px + 1, py + 2, 0,
          px + 1, py + 3, ballRadius * 1.3
        );
        contactShadow.addColorStop(0, `rgba(0, 0, 0, ${contactDensity})`);
        contactShadow.addColorStop(0.15, `rgba(0, 0, 0, ${contactDensity * 0.50})`);
        contactShadow.addColorStop(0.4, `rgba(0, 0, 0, ${contactDensity * 0.12})`);
        contactShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx2d.beginPath();
        ctx2d.ellipse(px + 1, py + 2, ballRadius * (1.05 + edgeFactor * 0.08), ballRadius * (0.82 + edgeFactor * 0.06), lightDir + edgeFactor * 0.1, 0, Math.PI * 2);
        ctx2d.fillStyle = contactShadow;
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
            ballRadius * 1.4
          );
          cueGrad.addColorStop(0, '#ffffff');
          cueGrad.addColorStop(0.08, '#ffffff');
          cueGrad.addColorStop(0.18, '#fffefa');
          cueGrad.addColorStop(0.35, '#f8f4ec');
          cueGrad.addColorStop(0.55, '#f0e8dc');
          cueGrad.addColorStop(0.75, '#e0d4c4');
          cueGrad.addColorStop(0.9, '#d4c8b4');
          cueGrad.addColorStop(1, '#c8b8a4');
          ctx2d.fillStyle = cueGrad;
          ctx2d.fill();

          // Subsurface glow (brighter)
          const sssCue = ctx2d.createRadialGradient(
            px - ballRadius * 0.25, py - ballRadius * 0.25, 0,
            px, py, ballRadius * 0.75
          );
          sssCue.addColorStop(0, 'rgba(255,255,255,0.25)');
          sssCue.addColorStop(0.3, 'rgba(255,245,235,0.10)');
          sssCue.addColorStop(0.6, 'rgba(255,235,220,0.03)');
          sssCue.addColorStop(1, 'rgba(0,0,0,0)');
          ctx2d.fillStyle = sssCue;
          ctx2d.beginPath();
          ctx2d.arc(px, py, ballRadius, 0, Math.PI * 2);
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
              const dotSize = 2.0 * wz;
              if (dotSize > 0.3) {
                const dotGrad = ctx2d.createRadialGradient(sx, sy, 0, sx, sy, dotSize);
                dotGrad.addColorStop(0, '#ef4444');
                dotGrad.addColorStop(0.4, '#dc2626');
                dotGrad.addColorStop(1, 'rgba(180,30,30,0.4)');
                ctx2d.beginPath();
                ctx2d.arc(sx, sy, dotSize, 0, Math.PI * 2);
                ctx2d.fillStyle = dotGrad;
                ctx2d.fill();

                ctx2d.beginPath();
                ctx2d.arc(sx - dotSize * 0.25, sy - dotSize * 0.25, dotSize * 0.4, 0, Math.PI * 2);
                ctx2d.fillStyle = 'rgba(255,220,220,0.5)';
                ctx2d.fill();
              }
            }
          });
          ctx2d.restore();

          // Cue ball outline
          ctx2d.beginPath();
          ctx2d.arc(px, py, ballRadius - 0.2, 0, Math.PI * 2);
          ctx2d.strokeStyle = 'rgba(0,0,0,0.20)';
          ctx2d.lineWidth = 0.7;
          ctx2d.stroke();

          // Subtle rim light
          ctx2d.beginPath();
          ctx2d.arc(px, py, ballRadius - 0.5, -Math.PI * 0.85, -Math.PI * 0.15);
          ctx2d.strokeStyle = 'rgba(255,255,255,0.20)';
          ctx2d.lineWidth = 0.5;
          ctx2d.stroke();
        } else if (b.type === 'stripe') {
          ctx2d.save();
          ctx2d.beginPath();
          ctx2d.arc(px, py, ballRadius, 0, Math.PI * 2);
          ctx2d.clip();

          // White/ivory base with radial gloss
          const ivoryGrad = ctx2d.createRadialGradient(
            px - ballRadius * 0.35,
            py - ballRadius * 0.35,
            0,
            px + ballRadius * 0.1,
            py + ballRadius * 0.1,
            ballRadius * 1.3
          );
          ivoryGrad.addColorStop(0, '#ffffff');
          ivoryGrad.addColorStop(0.2, '#fefcf8');
          ivoryGrad.addColorStop(0.5, '#f5f0e8');
          ivoryGrad.addColorStop(0.75, '#ece4d8');
          ivoryGrad.addColorStop(0.9, '#ded3c0');
          ivoryGrad.addColorStop(1, '#c8b8a4');
          ctx2d.fillStyle = ivoryGrad;
          ctx2d.fill();

          // Stripe band - use uy as the stripe axis
          // Project uy to screen space to determine stripe orientation
          const syx = uy[0], syy = uy[1], syz = uy[2];
          const stripeDot = Math.abs(syz);
          
          // Improved 3D spherical stripe projection
          // The stripe band wraps around the equator perpendicular to uy
          const beltVisible = 0.08 + 0.58 * stripeDot;
          const minorR = ballRadius * beltVisible;
          const majorR = ballRadius * (1.0 - 0.04 * (1 - stripeDot));
          // Rotation angle of the stripe in screen space
          const stripeAngle = Math.atan2(syy, syx);
          
          // Draw shadow/glow behind stripe (deeper shadow)
          ctx2d.fillStyle = 'rgba(0,0,0,0.18)';
          ctx2d.beginPath();
          ctx2d.ellipse(px + 0.8, py + 0.8, majorR + 1, minorR + stripeDot * 2.0 + 0.5, stripeAngle, 0, Math.PI * 2);
          ctx2d.fill();
          
          // Main colored stripe band
          const colLight = lightenColor(b.color, 35);
          const colMid = b.color;
          const colDark = darkenColor(b.color, 35);
          
          const beltGrad = ctx2d.createLinearGradient(
            px - Math.cos(stripeAngle) * majorR,
            py - Math.sin(stripeAngle) * majorR,
            px + Math.cos(stripeAngle) * majorR,
            py + Math.sin(stripeAngle) * majorR
          );
          beltGrad.addColorStop(0, colLight);
          beltGrad.addColorStop(0.08, colLight);
          beltGrad.addColorStop(0.2, colMid);
          beltGrad.addColorStop(0.5, colMid);
          beltGrad.addColorStop(0.8, colDark);
          beltGrad.addColorStop(0.92, darkenColor(b.color, 45));
          beltGrad.addColorStop(1, darkenColor(b.color, 55));
          
          ctx2d.fillStyle = beltGrad;
          ctx2d.beginPath();
          ctx2d.ellipse(px, py, majorR, minorR, stripeAngle, 0, Math.PI * 2);
          ctx2d.fill();
          
          // Stripe edge curvature - spherical cap shading (smoother falloff)
          const edgeShade = ctx2d.createLinearGradient(
            px - Math.cos(stripeAngle) * majorR * 0.92,
            py - Math.sin(stripeAngle) * majorR * 0.92,
            px + Math.cos(stripeAngle) * majorR * 0.92,
            py + Math.sin(stripeAngle) * majorR * 0.92
          );
          edgeShade.addColorStop(0, 'rgba(0,0,0,0.35)');
          edgeShade.addColorStop(0.10, 'rgba(0,0,0,0.08)');
          edgeShade.addColorStop(0.25, 'rgba(0,0,0,0)');
          edgeShade.addColorStop(0.5, 'rgba(0,0,0,0)');
          edgeShade.addColorStop(0.75, 'rgba(0,0,0,0)');
          edgeShade.addColorStop(0.90, 'rgba(0,0,0,0.08)');
          edgeShade.addColorStop(1, 'rgba(0,0,0,0.40)');
          ctx2d.fillStyle = edgeShade;
          ctx2d.beginPath();
          ctx2d.ellipse(px, py, majorR * 1.02, minorR + 1.2, stripeAngle, 0, Math.PI * 2);
          ctx2d.fill();

          // Subsurface glow
          const sssStripe = ctx2d.createRadialGradient(
            px - ballRadius * 0.25, py - ballRadius * 0.25, 0,
            px, py, ballRadius * 0.8
          );
          sssStripe.addColorStop(0, 'rgba(255,255,255,0.12)');
          sssStripe.addColorStop(0.5, 'rgba(255,240,220,0.04)');
          sssStripe.addColorStop(1, 'rgba(0,0,0,0)');
          ctx2d.fillStyle = sssStripe;
          ctx2d.beginPath();
          ctx2d.arc(px, py, ballRadius, 0, Math.PI * 2);
          ctx2d.fill();

          ctx2d.restore();

          // Ball outline
          ctx2d.beginPath();
          ctx2d.arc(px, py, ballRadius - 0.2, 0, Math.PI * 2);
          ctx2d.strokeStyle = 'rgba(0,0,0,0.25)';
          ctx2d.lineWidth = 0.7;
          ctx2d.stroke();

          // Subtle rim light - thin bright arc on top edge for 3D definition
          ctx2d.beginPath();
          ctx2d.arc(px, py, ballRadius - 0.5, -Math.PI * 0.85, -Math.PI * 0.15);
          ctx2d.strokeStyle = 'rgba(255,255,255,0.18)';
          ctx2d.lineWidth = 0.5;
          ctx2d.stroke();
        } else {
          ctx2d.save();
          ctx2d.beginPath();
          ctx2d.arc(px, py, ballRadius, 0, Math.PI * 2);
          ctx2d.clip();

          const c = b.color;
          const isBlack = b.id === 8;

          // Main color gradient with rich 3D shading
          const solidGrad = ctx2d.createRadialGradient(
            px - ballRadius * (0.35 + dxCenter * 0.06),
            py - ballRadius * (0.35 + dyCenter * 0.05),
            0,
            px + ballRadius * (0.1 + dxCenter * 0.04),
            py + ballRadius * (0.1 + dyCenter * 0.03),
            ballRadius * 1.3
          );
          if (isBlack) {
            solidGrad.addColorStop(0, '#3a3a3a');
            solidGrad.addColorStop(0.10, '#282828');
            solidGrad.addColorStop(0.30, '#1a1a1a');
            solidGrad.addColorStop(0.55, '#0e0e0e');
            solidGrad.addColorStop(0.80, '#060606');
            solidGrad.addColorStop(1, '#000000');
          } else {
            const brightColor = lightenColor(c, 42);
            const midColor = c;
            const darkColor = darkenColor(c, 35);
            solidGrad.addColorStop(0, brightColor);
            solidGrad.addColorStop(0.10, midColor);
            solidGrad.addColorStop(0.35, midColor);
            solidGrad.addColorStop(0.60, darkColor);
            solidGrad.addColorStop(0.82, darkenColor(c, 50));
            solidGrad.addColorStop(0.95, '#0a0a0a');
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
              ballRadius * 0.75
            );
            sssGlow.addColorStop(0, 'rgba(255,255,255,0.15)');
            sssGlow.addColorStop(0.3, 'rgba(255,255,255,0.06)');
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
          ctx2d.strokeStyle = isBlack ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.25)';
          ctx2d.lineWidth = 0.7;
          ctx2d.stroke();

          // Subtle rim light - thin bright arc on top edge for 3D definition
          ctx2d.beginPath();
          ctx2d.arc(px, py, ballRadius - 0.6, -Math.PI * 0.85, -Math.PI * 0.15);
          ctx2d.strokeStyle = 'rgba(255,255,255,0.15)';
          ctx2d.lineWidth = 0.5;
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
        tableReflect.addColorStop(0.78, 'rgba(0,80,40,0.2)');
        tableReflect.addColorStop(0.92, 'rgba(0,100,50,0.12)');
        tableReflect.addColorStop(1, 'rgba(0,120,60,0.06)');
        ctx2d.fillStyle = tableReflect;
        ctx2d.fill();

        // Fresnel edge glow (rim light) - stronger at glancing angles
        const fresnelGrad = ctx2d.createRadialGradient(
          px, py, 0,
          px, py, ballRadius
        );
        fresnelGrad.addColorStop(0, 'rgba(255,255,255,0)');
        fresnelGrad.addColorStop(0.55, 'rgba(255,255,255,0)');
        fresnelGrad.addColorStop(0.78, 'rgba(255,255,255,0.02)');
        fresnelGrad.addColorStop(0.88, 'rgba(255,255,255,0.07)');
        fresnelGrad.addColorStop(0.95, 'rgba(255,255,255,0.14)');
        fresnelGrad.addColorStop(1, 'rgba(255,255,255,0.28)');
        ctx2d.fillStyle = fresnelGrad;
        ctx2d.fill();

        // Bottom rim light (bounce light from table) - stronger near center
        const bounceIntensity = 0.06 + (1 - edgeFactor) * 0.04;
        const rimLight = ctx2d.createRadialGradient(
          px, py + ballRadius * 0.6, 0,
          px, py + ballRadius * 0.4, ballRadius * 0.6
        );
        rimLight.addColorStop(0, `rgba(80,180,140,${bounceIntensity})`);
        rimLight.addColorStop(1, 'rgba(0,0,0,0)');
        ctx2d.fillStyle = rimLight;
        ctx2d.beginPath();
        ctx2d.arc(px, py, ballRadius, 0, Math.PI * 2);
        ctx2d.fill();

        ctx2d.restore();

        // Primary specular highlight (sharp, high-gloss, position-aware)
        ctx2d.save();
        ctx2d.globalCompositeOperation = 'lighter';
        const specGrad = ctx2d.createRadialGradient(
          px + specOffX * ballRadius,
          py + specOffY * ballRadius,
          0,
          px + (specOffX + 0.15) * ballRadius,
          py + (specOffY + 0.15) * ballRadius,
          ballRadius * 0.28
        );
        specGrad.addColorStop(0, 'rgba(255,255,255,1.0)');
        specGrad.addColorStop(0.03, 'rgba(255,255,255,0.95)');
        specGrad.addColorStop(0.08, 'rgba(255,255,255,0.40)');
        specGrad.addColorStop(0.15, 'rgba(255,255,255,0.12)');
        specGrad.addColorStop(0.25, 'rgba(255,255,255,0.03)');
        specGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx2d.beginPath();
        ctx2d.arc(px, py, ballRadius, 0, Math.PI * 2);
        ctx2d.fillStyle = specGrad;
        ctx2d.fill();
        ctx2d.restore();

        // Secondary soft highlight (wider spread, glossy sheen, position-aware)
        ctx2d.save();
        ctx2d.globalCompositeOperation = 'lighter';
        const softSpecGrad = ctx2d.createRadialGradient(
          px + specOffX * ballRadius * 0.8,
          py + specOffY * ballRadius * 0.8,
          0,
          px + specOffX * ballRadius * 0.05,
          py + specOffY * ballRadius * 0.05,
          ballRadius * 0.75
        );
        softSpecGrad.addColorStop(0, 'rgba(255,255,255,0.35)');
        softSpecGrad.addColorStop(0.08, 'rgba(255,255,255,0.18)');
        softSpecGrad.addColorStop(0.20, 'rgba(255,255,255,0.06)');
        softSpecGrad.addColorStop(0.40, 'rgba(255,255,255,0.02)');
        softSpecGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx2d.beginPath();
        ctx2d.arc(px, py, ballRadius, 0, Math.PI * 2);
        ctx2d.fillStyle = softSpecGrad;
        ctx2d.fill();
        ctx2d.restore();

        // Environment reflection (simulated room with warm ceiling and cool windows)
        // Position-aware: balls near edges see more of the room
        ctx2d.save();
        ctx2d.globalCompositeOperation = 'lighter';
        const envIntensity = 0.18 + edgeFactor * 0.06;
        // Room ceiling light panel reflection (top area) - brighter near center
        const ceilingRefl = ctx2d.createRadialGradient(
          px + dxCenter * 0.5, py - ballRadius * (0.45 - dyCenter * 0.1), 0,
          px + dxCenter * 0.3, py - ballRadius * (0.35 - dyCenter * 0.08), ballRadius * (0.35 + edgeFactor * 0.08)
        );
        ceilingRefl.addColorStop(0, `rgba(255,245,220,${envIntensity})`);
        ceilingRefl.addColorStop(0.35, `rgba(255,235,200,${envIntensity * 0.45})`);
        ceilingRefl.addColorStop(1, 'rgba(200,200,180,0)');
        ctx2d.beginPath();
        ctx2d.arc(px, py, ballRadius, 0, Math.PI * 2);
        ctx2d.fillStyle = ceilingRefl;
        ctx2d.fill();

        // Cool window reflection (left/right side based on position)
        const winSide = px < tableCenterX ? -1 : 1;
        const windowRefl = ctx2d.createRadialGradient(
          px + winSide * ballRadius * (0.42 + edgeFactor * 0.05),
          py - ballRadius * (0.12 - dyCenter * 0.04),
          0,
          px + winSide * ballRadius * (0.22 + edgeFactor * 0.03),
          py - ballRadius * (0.04 - dyCenter * 0.02),
          ballRadius * (0.28 + edgeFactor * 0.06)
        );
        windowRefl.addColorStop(0, `rgba(180,210,255,${0.12 + edgeFactor * 0.04})`);
        windowRefl.addColorStop(0.4, `rgba(160,200,240,${0.04 + edgeFactor * 0.02})`);
        windowRefl.addColorStop(1, 'rgba(100,150,200,0)');
        ctx2d.beginPath();
        ctx2d.arc(px, py, ballRadius, 0, Math.PI * 2);
        ctx2d.fillStyle = windowRefl;
        ctx2d.fill();
        ctx2d.restore();

        // Warm caustic highlight - position-aware
        ctx2d.save();
        ctx2d.globalCompositeOperation = 'lighter';
        const warmGrad = ctx2d.createRadialGradient(
          px + dxCenter * 0.3, py - ballRadius * (0.50 - dyCenter * 0.08),
          0,
          px + dxCenter * 0.15, py - ballRadius * (0.30 - dyCenter * 0.05),
          ballRadius * (0.20 + edgeFactor * 0.04)
        );
        warmGrad.addColorStop(0, `rgba(255,230,190,${0.08 + edgeFactor * 0.03})`);
        warmGrad.addColorStop(1, 'rgba(255,210,160,0)');
        ctx2d.beginPath();
        ctx2d.arc(px, py, ballRadius, 0, Math.PI * 2);
        ctx2d.fillStyle = warmGrad;
        ctx2d.fill();
        ctx2d.restore();

        // Number Badges - improved 3D tracking
        if (b.id !== 0 && b.number) {
          const badgeDirs = [{ sign: 1 }, { sign: -1 }];
          badgeDirs.forEach(({ sign }) => {
            // Use uy axis for badge position (poles of the stripe axis)
            const bwx = sign * uy[0];
            const bwy = sign * uy[1];
            const bwz = sign * uy[2];
            if (bwz > 0.1) {
              const bx = px + bwx * ballRadius * 0.88;
              const by = py + bwy * ballRadius * 0.88;
              
              // Rotation angle for text to align with ball surface
              const textAngle = Math.atan2(uy[1], uy[0]) + (sign > 0 ? -Math.PI / 2 : Math.PI / 2);
              const perspScale = Math.max(bwz, 0.3);

              ctx2d.save();
              ctx2d.translate(bx, by);
              ctx2d.rotate(textAngle);

              const badgeR = 5.0;

              // Badge shadow (deeper)
              ctx2d.beginPath();
              ctx2d.ellipse(0.8, 1.0, badgeR + 0.8, (badgeR + 0.8) * perspScale, 0, 0, Math.PI * 2);
              ctx2d.fillStyle = 'rgba(0,0,0,0.35)';
              ctx2d.fill();

              // Badge base with rich 3D gradient
              ctx2d.beginPath();
              ctx2d.ellipse(0, 0, badgeR, badgeR * perspScale, 0, 0, Math.PI * 2);
              const badgeGrad = ctx2d.createRadialGradient(0, -badgeR * 0.3 * perspScale, 0, 0, 0, badgeR);
              badgeGrad.addColorStop(0, '#ffffff');
              badgeGrad.addColorStop(0.4, '#faf8f2');
              badgeGrad.addColorStop(0.8, '#f0ece2');
              badgeGrad.addColorStop(1, '#ddd8cc');
              ctx2d.fillStyle = badgeGrad;
              ctx2d.fill();

              // Badge metallic outline (sharper)
              ctx2d.strokeStyle = 'rgba(80,60,30,0.25)';
              ctx2d.lineWidth = 0.8;
              ctx2d.stroke();

              // Number text with perspective
              ctx2d.save();
              ctx2d.scale(1, perspScale);
              ctx2d.font = 'bold 9px "Segoe UI", Arial, sans-serif';
              ctx2d.textAlign = 'center';
              ctx2d.textBaseline = 'middle';

              // Text shadow (darker)
              ctx2d.fillStyle = 'rgba(0,0,0,0.4)';
              ctx2d.fillText(String(b.number), 0.6, 0.8);

              // Main text with richer dark color
              ctx2d.fillStyle = '#111111';
              ctx2d.fillText(String(b.number), 0, 0);
              ctx2d.restore();

              // Specular glint on badge (brighter, more glossy)
              ctx2d.beginPath();
              ctx2d.ellipse(-badgeR * 0.3, -badgeR * 0.3 * perspScale, badgeR * 0.3, badgeR * 0.2 * perspScale, -0.5, 0, Math.PI * 2);
              ctx2d.fillStyle = 'rgba(255,255,255,0.35)';
              ctx2d.fill();

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

          let aimDx = Math.cos(activeAngle);
          let aimDy = Math.sin(activeAngle);

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

            aimDx = contactX - cueBall.x;
            aimDy = contactY - cueBall.y;
            const aimLen = Math.sqrt(aimDx * aimDx + aimDy * aimDy) || 1;
            // Spin-based aim curve preview (subtle visual feedback)
            const showSpinCurve = (Math.abs(activeSpinX) > 0.05 || Math.abs(activeSpinY) > 0.05) && aimLen > 30;
            let ctrlX = 0, ctrlY = 0;
            if (showSpinCurve) {
              const perpX = -aimDy / aimLen;
              const perpY = aimDx / aimLen;
              const curveAmt = Math.min(aimLen * 0.20, 55);
              ctrlX = (cueBall.x + contactX) / 2 + perpX * activeSpinX * curveAmt - aimDx / aimLen * activeSpinY * curveAmt * 0.4;
              ctrlY = (cueBall.y + contactY) / 2 + perpY * activeSpinX * curveAmt - aimDy / aimLen * activeSpinY * curveAmt * 0.4;
            }

            // Aiming line: beam + precision center
            {
              ctx2d.save();
              const amHaze = isMyTurnActive
                ? [255, 170, 0]
                : [0, 229, 255];
              const beamGrad = ctx2d.createLinearGradient(cueBall.x, cueBall.y, contactX, contactY);
              beamGrad.addColorStop(0, `rgba(${amHaze[0]}, ${amHaze[1]}, ${amHaze[2]}, 0.25)`);
              beamGrad.addColorStop(0.6, `rgba(${amHaze[0]}, ${amHaze[1]}, ${amHaze[2]}, 0.10)`);
              beamGrad.addColorStop(1, `rgba(${amHaze[0]}, ${amHaze[1]}, ${amHaze[2]}, 0)`);
              ctx2d.strokeStyle = beamGrad;
              ctx2d.lineWidth = 6;
              ctx2d.lineCap = 'round';
              ctx2d.beginPath();
              ctx2d.moveTo(cueBall.x, cueBall.y);
              if (showSpinCurve) {
                ctx2d.quadraticCurveTo(ctrlX, ctrlY, contactX, contactY);
              } else {
                ctx2d.lineTo(contactX, contactY);
              }
              ctx2d.stroke();
              ctx2d.restore();

              // Precision center line
              ctx2d.save();
              const precGrad = ctx2d.createLinearGradient(cueBall.x, cueBall.y, contactX, contactY);
              precGrad.addColorStop(0, '#ffffff');
              precGrad.addColorStop(0.5, mainLaserColor);
              precGrad.addColorStop(1, `rgba(${amHaze[0]}, ${amHaze[1]}, ${amHaze[2]}, 0)`);
              ctx2d.strokeStyle = precGrad;
              ctx2d.lineWidth = 1.0;
              ctx2d.lineCap = 'round';
              ctx2d.shadowColor = mainShadowColor;
              ctx2d.shadowBlur = 4;
              ctx2d.beginPath();
              ctx2d.moveTo(cueBall.x, cueBall.y);
              if (showSpinCurve) {
                ctx2d.quadraticCurveTo(ctrlX, ctrlY, contactX, contactY);
              } else {
                ctx2d.lineTo(contactX, contactY);
              }
              ctx2d.stroke();
              ctx2d.restore();

              // Add Arrowhead at the end of the main aim line
              drawArrowhead(ctx2d, contactX, contactY, Math.atan2(aimDy, aimDx), 5, mainLaserColor);


            }

            if (Math.abs(activeSpinX) > 0.05 || Math.abs(activeSpinY) > 0.05) {
              const isMobile = ctx.isMobileRef.current;
              const SIR = isMobile ? 36 : 28;
              const siCX = isMobile ? 56 : 760;
              const siCY = isMobile ? 56 : 50;
              const spinLen = Math.sqrt(activeSpinX * activeSpinX + activeSpinY * activeSpinY);

              ctx2d.save();

              ctx2d.fillStyle = 'rgba(0,0,0,0.65)';
              ctx2d.beginPath();
              ctx2d.arc(siCX, siCY, SIR + 3, 0, Math.PI * 2);
              ctx2d.fill();

              const ballGrad = ctx2d.createRadialGradient(siCX - 4, siCY - 4, 1, siCX, siCY, SIR);
              ballGrad.addColorStop(0, '#ffffff');
              ballGrad.addColorStop(0.5, '#f8f4ec');
              ballGrad.addColorStop(0.85, '#e8dcc8');
              ballGrad.addColorStop(1, '#c8b8a4');
              ctx2d.fillStyle = ballGrad;
              ctx2d.beginPath();
              ctx2d.arc(siCX, siCY, SIR, 0, Math.PI * 2);
              ctx2d.fill();

              ctx2d.strokeStyle = 'rgba(100,100,100,0.25)';
              ctx2d.lineWidth = 0.5;
              ctx2d.beginPath();
              ctx2d.moveTo(siCX - SIR + 4, siCY); ctx2d.lineTo(siCX + SIR - 4, siCY);
              ctx2d.moveTo(siCX, siCY - SIR + 4); ctx2d.lineTo(siCX, siCY + SIR - 4);
              ctx2d.stroke();

              const dotRadius = 4;
              const maxDist = SIR - dotRadius - 2;
              let dx = -activeSpinX * 30;
              let dy = -activeSpinY * 30;
              const dLen = Math.sqrt(dx * dx + dy * dy);
              if (dLen > maxDist) { dx = (dx / dLen) * maxDist; dy = (dy / dLen) * maxDist; }

              ctx2d.beginPath();
              ctx2d.arc(siCX + dx, siCY + dy, dotRadius + 3, 0, Math.PI * 2);
              ctx2d.fillStyle = 'rgba(239, 68, 68, 0.2)';
              ctx2d.fill();

              ctx2d.beginPath();
              ctx2d.arc(siCX + dx, siCY + dy, dotRadius, 0, Math.PI * 2);
              ctx2d.fillStyle = '#ef4444';
              ctx2d.fill();

              ctx2d.beginPath();
              ctx2d.arc(siCX + dx - 1, siCY + dy - 1, 1.5, 0, Math.PI * 2);
              ctx2d.fillStyle = 'rgba(255,255,255,0.4)';
              ctx2d.fill();

              ctx2d.font = '500 7px sans-serif';
              ctx2d.fillStyle = 'rgba(255,255,255,0.5)';
              ctx2d.textAlign = 'center';
              let label = 'CENTER';
              if (activeSpinY > 0.05 && activeSpinX > 0.05) label = 'FOL+R';
              else if (activeSpinY > 0.05 && activeSpinX < -0.05) label = 'FOL+L';
              else if (activeSpinY < -0.05 && activeSpinX > 0.05) label = 'DRAW+R';
              else if (activeSpinY < -0.05 && activeSpinX < -0.05) label = 'DRAW+L';
              else if (activeSpinY > 0.05) label = 'FOLLOW';
              else if (activeSpinY < -0.05) label = 'DRAW';
              else if (activeSpinX > 0.05) label = 'R.ENG';
              else if (activeSpinX < -0.05) label = 'L.ENG';
              ctx2d.fillText(label, siCX, siCY + SIR + 10);

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

              // === Contact Point Preview (8 Ball Pool style) ===
              if (pType === 'ball' && targetBallObj) {
                lastDrawContactX = realContactX;
                lastDrawContactY = realContactY;

                // Calculate where the cue ball would touch the target ball surface
                const dirX = targetBallObj.x - realContactX;
                const dirY = targetBallObj.y - realContactY;
                const dirLen = Math.hypot(dirX, dirY) || 1;
                const normDirX = dirX / dirLen;
                const normDirY = dirY / dirLen;
                
                // White Contact Dot on target ball surface (where the cue ball hits)
                const dotX = targetBallObj.x - normDirX * (targetBallObj.radius || 10);
                const dotY = targetBallObj.y - normDirY * (targetBallObj.radius || 10);
                
                ctx2d.save();
                // Outer white glow
                ctx2d.beginPath();
                ctx2d.arc(dotX, dotY, 4.5, 0, Math.PI * 2);
                ctx2d.fillStyle = 'rgba(255, 255, 255, 0.25)';
                ctx2d.fill();
                // Solid white dot
                ctx2d.beginPath();
                ctx2d.arc(dotX, dotY, 2.5, 0, Math.PI * 2);
                ctx2d.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx2d.fill();
                // Inner bright core
                ctx2d.beginPath();
                ctx2d.arc(dotX, dotY, 1.2, 0, Math.PI * 2);
                ctx2d.fillStyle = '#ffffff';
                ctx2d.fill();
                ctx2d.restore();

                // Contact Ring — hollow circle at the contact point
                ctx2d.save();
                ctx2d.beginPath();
                ctx2d.arc(contactX, contactY, radius * 0.6, 0, Math.PI * 2);
                ctx2d.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                ctx2d.lineWidth = 1.2;
                ctx2d.setLineDash([3, 3]);
                ctx2d.lineDashOffset = -(Date.now() / 30) % 6;
                ctx2d.stroke();
                ctx2d.setLineDash([]);
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
          ctx2d.shadowBlur = 4;
              ctx2d.beginPath();
              ctx2d.moveTo(bouncePoints[0].x, bouncePoints[0].y);
              for (let i = 1; i < bouncePoints.length; i++) ctx2d.lineTo(bouncePoints[i].x, bouncePoints[i].y);
              ctx2d.stroke();
              ctx2d.restore();

              // Add Arrowhead at the end of the reflection path
              if (bouncePoints.length > 1) {
                const last = bouncePoints[bouncePoints.length - 1];
                const prev = bouncePoints[bouncePoints.length - 2];
                const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
                drawArrowhead(ctx2d, last.x, last.y, angle, 4, isMyTurnActive ? '#ffaa00' : '#00e5ff');
              }

              // Replaced with dotted path logic
              ctx2d.save();
              const dotSpacing = 8;
              let currentDist = 0;
              for (let i = 0; i < bouncePoints.length - 1; i++) {
                const p1 = bouncePoints[i];
                const p2 = bouncePoints[i+1];
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const segLen = Math.hypot(dx, dy);
                if (segLen === 0) continue;
                const dirX = dx / segLen;
                const dirY = dy / segLen;
                
                while (currentDist < segLen) {
                  const px = p1.x + dirX * currentDist;
                  const py = p1.y + dirY * currentDist;
                  // Opacity fades out based on distance from cue ball
                  const distFromCue = Math.hypot(px - cueBall.x, py - cueBall.y);
                  const opacity = Math.max(0, 0.9 - (distFromCue / 800));
                  
                  ctx2d.beginPath();
                  ctx2d.arc(px, py, 1.8, 0, Math.PI * 2);
                  ctx2d.fillStyle = isMyTurnActive ? `rgba(255, 170, 0, ${opacity})` : `rgba(0, 229, 255, ${opacity})`;
                  ctx2d.fill();
                  
                  currentDist += dotSpacing;
                }
                currentDist -= segLen; // carry over remaining spacing to next segment
              }
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
              targetBallObj
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
                tcMin = Math.min(tcMin, 120);
              } else if (ctx.difficultyRef.current === 'hard') {
                tcMin = Math.min(tcMin, 200);
              }

              const targetContactX =
                targetBallObj.x + phiNormX * tcMin;
              const targetContactY =
                targetBallObj.y + phiNormY * tcMin;

              let targetPocket = null;

              // Render Target Ball Primary path
              ctx2d.save();
          ctx2d.shadowColor = '#059669';
          ctx2d.shadowBlur = 3;
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

              // Add Arrowhead at the end of the object ball target path
              drawArrowhead(ctx2d, targetContactX, targetContactY, Math.atan2(phiNormY, phiNormX), 5, '#10b981');

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
                ctx2d.shadowBlur = 2;
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
              if (activeSpinY !== 0) {
                const midX =
                  (realContactX + tangentContactX) /
                  2;
                const midY =
                  (realContactY + tangentContactY) /
                  2;
                const bendAmt = activeSpinY * 50;
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
                tpMin < 300 &&
                tpMin > 1
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
                'rgba(0, 0, 0, 0.4)';
              ctx2d.shadowBlur = 2;

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
          const stickLength = 260;

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
              const STRIKE_ACCEL = 20;
              const FOLLOW_FADE = 280;
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
                const easeT = t * t * (3 - 2 * t); // smoothstep
                stickDist =
                  chargeDist -
                  easeT * (chargeDist - 8.0);
                stickOpacity = 1.0;
              } else if (
                elapsed < totalDuration
              ) {
                const tFade = Math.min(
                  1,
                  (elapsed - STRIKE_ACCEL) /
                    FOLLOW_FADE
                );

                const baseFollowThrough = 6;
                const maxFollowThrough =
                  baseFollowThrough +
                  (ctx.strikeAnimRef.current
                    .power /
                    100) *
                    16;
                const followT = tFade * tFade;
                stickDist =
                  8.0 -
                  Math.sin(
                    tFade * Math.PI * 0.5
                  ) * maxFollowThrough;

                stickOpacity = Math.max(
                  0,
                  Math.pow(1.0 - tFade, 1.6)
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

          // Shadow — wider, softer, with perspective
          const shadowOff = 18;
          const shadowBlur = 10;
          const shadowTipX =
            stickTipX + aimDy * shadowOff + 3;
          const shadowTipY =
            stickTipY - aimDx * shadowOff + 4;
          const shadowBackX =
            stickBackX + aimDy * shadowOff + 3;
          const shadowBackY =
            stickBackY - aimDx * shadowOff + 4;

          ctx2d.save();
          ctx2d.shadowColor = 'rgba(0,0,0,0.35)';
          ctx2d.shadowBlur = shadowBlur;
          ctx2d.beginPath();
          ctx2d.moveTo(shadowBackX, shadowBackY);
          ctx2d.lineTo(shadowTipX, shadowTipY);
          ctx2d.lineWidth = 6;
          ctx2d.strokeStyle = 'rgba(0,0,0,0.12)';
          ctx2d.lineCap = 'round';
          ctx2d.stroke();
          ctx2d.restore();

          // Spin visual glow near tip
          const sx = activeSpinX || 0;
          const sy = activeSpinY || 0;
          const hasSpin = !isStrikingNow && (Math.abs(sx) > 0.05 || Math.abs(sy) > 0.05);
          if (hasSpin && !isStrikingNow) {
            const spinMag = Math.sqrt(
              sx * sx + sy * sy
            );
            const spinGlowR = Math.min(
              1,
              spinMag * 1.2
            );
            const r =
              sx > 0.05
                ? 255 * spinGlowR
                : 0;
            const g =
              sy > 0.05
                ? 200 * spinGlowR
                : sy < -0.05
                ? 80 * spinGlowR
                : 0;
            const b =
              sx < -0.05
                ? 255 * spinGlowR
                : sy < -0.05
                ? 200 * spinGlowR
                : 0;
            ctx2d.save();
            const glowGrad = ctx2d.createRadialGradient(
              stickTipX + aimDx * 4,
              stickTipY + aimDy * 4,
              0,
              stickTipX + aimDx * 4,
              stickTipY + aimDy * 4,
              18 * spinGlowR
            );
            glowGrad.addColorStop(
              0,
              `rgba(${r},${g},${b},${0.3 * spinGlowR})`
            );
            glowGrad.addColorStop(
              1,
              'rgba(0,0,0,0)'
            );
            ctx2d.fillStyle = glowGrad;
            ctx2d.beginPath();
            ctx2d.arc(
              stickTipX + aimDx * 4,
              stickTipY + aimDy * 4,
              18 * spinGlowR,
              0,
              Math.PI * 2
            );
            ctx2d.fill();
            ctx2d.restore();
          }

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
            halfW: number,
            color1: string,
            color2: string,
            color3: string
          ) => {
            const w = Math.max(halfW, 3);
            const lG = ctx2d.createLinearGradient(
              sx - stickNormX * w,
              sy - stickNormY * w,
              sx + stickNormX * w,
              sy + stickNormY * w
            );
            // Shadow edge
            lG.addColorStop(0, color1);
            lG.addColorStop(0.08, color1);
            // Ramp up to lit face
            lG.addColorStop(0.18, color2);
            lG.addColorStop(0.30, color2);
            // Specular highlight
            const hp = 0.45 + Math.cos(activeAngle * 2 + 1.2) * 0.12;
            lG.addColorStop(Math.max(0.20, hp - 0.04), color2);
            lG.addColorStop(Math.max(0.20, hp), 'rgba(255,255,255,0.55)');
            lG.addColorStop(Math.min(1, hp + 0.04), color2);
            // Lit face
            lG.addColorStop(0.65, color2);
            // Shadow side
            lG.addColorStop(0.85, color2);
            lG.addColorStop(0.95, color3);
            lG.addColorStop(1, color3);
            return lG;
          };

          const buttLen = stickLength * 0.40;
          const Joint1X =
            stickBackX + aimDx * buttLen;
          const Joint1Y =
            stickBackY + aimDy * buttLen;

          const shaftLen = stickLength * 0.50;
          const Joint2X =
            Joint1X + aimDx * shaftLen;
          const Joint2Y =
            Joint1Y + aimDy * shaftLen;

          const ferruleLen = stickLength * 0.06;
          const Joint3X =
            Joint2X + aimDx * ferruleLen;
          const Joint3Y =
            Joint2Y + aimDy * ferruleLen;

          // Segment 1 — Butt (ebony/walnut), rich dark wood with subtle grain simulation
          const buttGrad = getCylinderGrad(
            stickBackX, stickBackY,
            Joint1X, Joint1Y,
            5.0,
            '#0a0200', '#5a2210', '#1a0702'
          );
          drawSegment(
            stickBackX, stickBackY,
            Joint1X, Joint1Y,
            5.0, 4.5,
            buttGrad
          );

          // Decorative wrap/grip section at bottom of butt
          const wrapLen = 18;
          const wrapStartX =
            stickBackX + aimDx * wrapLen;
          const wrapStartY =
            stickBackY + aimDy * wrapLen;
          const wrapGrad = getCylinderGrad(
            stickBackX, stickBackY,
            wrapStartX, wrapStartY,
            5.0,
            '#1a0502', '#3a1508', '#1a0502'
          );
          drawSegment(
            stickBackX, stickBackY,
            wrapStartX, wrapStartY,
            5.0, 5.0,
            wrapGrad
          );

          // Silver ring 1 (butt joint ring)
          const ring1Grad = getCylinderGrad(
            Joint1X - aimDx * 3, Joint1Y - aimDy * 3,
            Joint1X + aimDx * 1, Joint1Y + aimDy * 1,
            4.5,
            '#334155', '#cbd5e1', '#1e293b'
          );
          drawSegment(
            Joint1X - aimDx * 3, Joint1Y - aimDy * 3,
            Joint1X + aimDx * 1, Joint1Y + aimDy * 1,
            4.5, 4.5,
            ring1Grad
          );

          // Segment 2 — Maple shaft (lighter, warm wood)
          const shaftGrad = getCylinderGrad(
            Joint1X + aimDx * 1, Joint1Y + aimDy * 1,
            Joint2X, Joint2Y,
            4.5,
            '#633d0a', '#fef3c7', '#7a4d0e'
          );
          drawSegment(
            Joint1X + aimDx * 1, Joint1Y + aimDy * 1,
            Joint2X, Joint2Y,
            4.5, 3.0,
            shaftGrad
          );

          // Silver ring 2 (shaft→ferrule)
          const ring2Grad = getCylinderGrad(
            Joint2X - aimDx * 2, Joint2Y - aimDy * 2,
            Joint2X + aimDx * 2, Joint2Y + aimDy * 2,
            3.0,
            '#334155', '#e2e8f0', '#1e293b'
          );
          drawSegment(
            Joint2X - aimDx * 2, Joint2Y - aimDy * 2,
            Joint2X + aimDx * 2, Joint2Y + aimDy * 2,
            3.0, 3.0,
            ring2Grad
          );

          // Segment 3 — Ferrule (ivory/bone)
          const ferruleGrad = getCylinderGrad(
            Joint2X + aimDx * 2, Joint2Y + aimDy * 2,
            Joint3X, Joint3Y,
            3.0,
            '#e2e8f0', '#fdfcf8', '#cbd5e1'
          );
          drawSegment(
            Joint2X + aimDx * 2, Joint2Y + aimDy * 2,
            Joint3X, Joint3Y,
            3.0, 2.8,
            ferruleGrad
          );

          // Segment 4 — Chalk Tip (blue, with small specular dot)
          const tipLen = 5;
          const tipX = Joint3X + aimDx * tipLen;
          const tipY = Joint3Y + aimDy * tipLen;
          const tipGrad = getCylinderGrad(
            Joint3X, Joint3Y,
            tipX, tipY,
            2.8,
            '#1e3a8a', '#60a5fa', '#172554'
          );
          drawSegment(
            Joint3X, Joint3Y,
            tipX, tipY,
            2.8, 2.6,
            tipGrad
          );

          // Tip highlight dot
          ctx2d.save();
          ctx2d.beginPath();
          ctx2d.arc(
            tipX - aimDx * 1.5 + stickNormX * 0.8,
            tipY - aimDy * 1.5 + stickNormY * 0.8,
            0.8,
            0,
            Math.PI * 2
          );
          ctx2d.fillStyle = 'rgba(255,255,255,0.4)';
          ctx2d.fill();
          ctx2d.restore();

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
        ctx2d.shadowBlur = 10;
        ctx2d.fill();
        ctx2d.strokeStyle = '#f59e0b';
        ctx2d.lineWidth = 1.5;
        ctx2d.stroke();
        ctx2d.restore();

        ctx2d.save();
        ctx2d.translate(400, panelY + 30);
        ctx2d.fillStyle = '#fbbf24';
        ctx2d.shadowColor = '#f59e0b';
        ctx2d.shadowBlur = 6;
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
        ctx2d.shadowBlur = 4;
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

      // 9. Post-processing: cinematic vignette for depth and focus
      ctx2d.save();
      const vigGrad = ctx2d.createRadialGradient(400, 200, 150, 400, 200, 420);
      vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vigGrad.addColorStop(0.5, 'rgba(0,0,0,0)');
      vigGrad.addColorStop(0.75, 'rgba(0,0,0,0.08)');
      vigGrad.addColorStop(0.9, 'rgba(0,0,0,0.25)');
      vigGrad.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx2d.fillStyle = vigGrad;
      ctx2d.fillRect(0, 0, 800, 400);
      ctx2d.restore();

      // Warm light glow from overhead (dramatic spotlight - Miniclip style)
      ctx2d.save();
      ctx2d.globalCompositeOperation = 'screen';
      const lightGlow = ctx2d.createRadialGradient(400, 180, 5, 400, 180, 360);
      lightGlow.addColorStop(0, 'rgba(255,248,230,0.10)');
      lightGlow.addColorStop(0.2, 'rgba(255,240,210,0.05)');
      lightGlow.addColorStop(0.5, 'rgba(255,230,190,0.02)');
      lightGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx2d.fillStyle = lightGlow;
      ctx2d.fillRect(0, 0, 800, 400);
      ctx2d.restore();

      // Bright pass bloom (subtle glow on white areas)
      {
        ctx2d.save();
        ctx2d.globalCompositeOperation = 'lighter';
        ctx2d.globalAlpha = 0.06;
        ctx2d.filter = 'blur(3px)';
        ctx2d.drawImage(canvas, 0, 0);
        ctx2d.filter = 'none';
        ctx2d.restore();
      }

      // === 9.5. Magnifier Zoom (Professional Aim Window) ===
      const isFineAim = ctx.isFineAimRef?.current || false;
      const velocity = Math.abs(ctx.aimInertiaVelocityRef?.current || 0);
      const showMagnifier = isMyTurnActive && !isStrikingNow && ctx.isPullingRef.current === false && (isFineAim || (velocity > 0.0001 && velocity < 0.005));

      if (showMagnifier && lastDrawContactX !== null && lastDrawContactY !== null) {
        ctx2d.save();
        ctx2d.resetTransform(); // Draw in pure screen space without camera pan

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        
        // Settings
        const magZoom = 2; // 2x Zoom
        const magW = 160;
        const magH = 90;
        const destX = 800 / 2 - magW / 2;
        const destY = 8;
        
        // Calculate source rectangle in unscaled coordinates
        const srcW = magW / magZoom;
        const srcH = magH / magZoom;
        
        // Target in screen space
        const targetScreenX = lastDrawContactX;
        const targetScreenY = lastDrawContactY;
        
        const srcX = targetScreenX - srcW / 2;
        const srcY = targetScreenY - srcH / 2;

        // Draw Magnifier Border & Background
        ctx2d.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx2d.shadowBlur = 10;
        ctx2d.fillStyle = '#0a0a0a';
        ctx2d.fillRect(destX, destY, magW, magH);
        
        ctx2d.shadowBlur = 0;
        // Clip area for drawing canvas
        ctx2d.beginPath();
        ctx2d.rect(destX + 1, destY + 1, magW - 2, magH - 2);
        ctx2d.clip();
        
        // Draw zoomed region from the current canvas
        // (Note: canvas coordinates are in pixels = logical * dpr)
        ctx2d.drawImage(
          canvas,
          srcX * dpr, srcY * dpr, srcW * dpr, srcH * dpr,
          destX + 1, destY + 1, magW - 2, magH - 2
        );

        // Add a crosshair / center marker over the magnifier
        ctx2d.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx2d.lineWidth = 1;
        ctx2d.beginPath();
        ctx2d.moveTo(destX + magW / 2, destY + 1);
        ctx2d.lineTo(destX + magW / 2, destY + magH - 1);
        ctx2d.moveTo(destX + 1, destY + magH / 2);
        ctx2d.lineTo(destX + magW - 1, destY + magH / 2);
        ctx2d.stroke();

        ctx2d.restore(); // restore clip

        // Outer border stroke
        ctx2d.save();
        ctx2d.resetTransform();
        ctx2d.strokeStyle = '#f59e0b';
        ctx2d.lineWidth = 1.5;
        ctx2d.strokeRect(destX, destY, magW, magH);
        ctx2d.restore();
      }

      // 10. Frame continuation
      animationId = requestAnimationFrame(drawLoop);
    };

    drawLoop();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, []);
}
