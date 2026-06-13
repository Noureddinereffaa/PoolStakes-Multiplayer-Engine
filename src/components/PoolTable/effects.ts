import { Ball } from '../../types';

export interface RippleData {
  x: number; y: number;
  radius: number; maxRadius: number;
  opacity: number; color: string;
}

export interface ChalkParticle {
  x: number; y: number;
  vx: number; vy: number;
  size: number; opacity: number;
  color: string;
}

export interface DustSpeck {
  x: number; y: number;
  vx: number; vy: number;
  radius: number; alpha: number; speed: number;
}

export interface SinkingBall {
  id: number;
  ball: Ball;
  progress: number;
  maxProgress: number;
  pocketX: number;
  pocketY: number;
}

export function triggerShootParticles(
  power: number,
  cueBall: Ball | undefined,
  aimAngle: number,
  chalkParticles: ChalkParticle[],
  feltRipples: RippleData[]
): void {
  if (!cueBall || cueBall.isPocketed) return;

  const bAngle = aimAngle + Math.PI;
  const hDx = Math.cos(bAngle);
  const hDy = Math.sin(bAngle);

  // Chalk puff — scales with power
  const partCount = Math.min(14, Math.floor(5 + power * 0.12));
  for (let i = 0; i < partCount; i++) {
    const spreadAngle = bAngle + (Math.random() - 0.5) * 1.3;
    const speed = (Math.random() * 3.0 + 0.8) * (power / 100 + 0.5);
    chalkParticles.push({
      x: cueBall.x - hDx * 10,
      y: cueBall.y - hDy * 10,
      vx: Math.cos(spreadAngle) * speed,
      vy: Math.sin(spreadAngle) * speed,
      size: Math.random() * 2.2 + 0.6,
      opacity: 0.95,
      color: 'rgba(59, 130, 246, 0.85)',
    });
  }

  // Sparks — scale with power, more on hard shots
  const sparkCount = power > 40 ? Math.min(8, Math.floor((power - 40) * 0.15)) : 0;
  for (let i = 0; i < sparkCount; i++) {
    const spreadAngle = bAngle + Math.PI + (Math.random() - 0.5) * 2.0;
    const speed = (Math.random() * 5.0 + 2.0) * (power / 100 + 0.3);
    chalkParticles.push({
      x: cueBall.x - hDx * 10,
      y: cueBall.y - hDy * 10,
      vx: Math.cos(spreadAngle) * speed,
      vy: Math.sin(spreadAngle) * speed,
      size: Math.random() * 1.8 + 0.8,
      opacity: 1.0,
      color: Math.random() > 0.3 ? 'rgba(245, 158, 11, 0.95)' : 'rgba(255, 230, 150, 0.95)',
    });
  }

  // Felt ripple — larger on power shots
  const rippleRadius = 4 + power * 0.06;
  const rippleMax = 28 + power * 0.2;
  feltRipples.push({
    x: cueBall.x - hDx * 10,
    y: cueBall.y - hDy * 10,
    radius: rippleRadius,
    maxRadius: rippleMax,
    opacity: 0.85,
    color: 'rgba(59, 130, 246, 0.5)',
  });
}




