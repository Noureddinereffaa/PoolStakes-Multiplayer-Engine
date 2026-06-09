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

  const partCount = Math.min(25, Math.floor(10 + power * 0.25));
  for (let i = 0; i < partCount; i++) {
    const spreadAngle = bAngle + (Math.random() - 0.5) * 1.1;
    const speed = (Math.random() * 2.5 + 0.8) * (power / 100 + 0.5);
    chalkParticles.push({
      x: cueBall.x - hDx * 10,
      y: cueBall.y - hDy * 10,
      vx: Math.cos(spreadAngle) * speed,
      vy: Math.sin(spreadAngle) * speed,
      size: Math.random() * 2.0 + 0.6,
      opacity: 0.9,
      color: 'rgba(59, 130, 246, 0.8)',
    });
  }

  const sparkCount = Math.min(15, Math.floor(power * 0.15));
  for (let i = 0; i < sparkCount; i++) {
    const spreadAngle = bAngle + Math.PI + (Math.random() - 0.5) * 1.8;
    const speed = (Math.random() * 4.0 + 1.5) * (power / 100 + 0.3);
    chalkParticles.push({
      x: cueBall.x - hDx * 10,
      y: cueBall.y - hDy * 10,
      vx: Math.cos(spreadAngle) * speed,
      vy: Math.sin(spreadAngle) * speed,
      size: Math.random() * 1.5 + 0.8,
      opacity: 1.0,
      color: Math.random() > 0.4 ? 'rgba(245, 158, 11, 0.95)' : 'rgba(255, 230, 150, 0.95)',
    });
  }

  feltRipples.push({
    x: cueBall.x - hDx * 10,
    y: cueBall.y - hDy * 10,
    radius: 4,
    maxRadius: 28,
    opacity: 0.8,
    color: 'rgba(59, 130, 246, 0.5)',
  });
}




