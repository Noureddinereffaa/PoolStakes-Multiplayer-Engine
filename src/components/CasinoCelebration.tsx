import React, { useEffect, useState } from 'react';

const CONFETTI_COLORS = [
  '#ff4444', '#44ff44', '#4488ff', '#ffff44',
  '#ff44ff', '#44ffff', '#ff8800', '#ff4488',
  '#88ff44', '#4488ff',
];

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  rotation: number;
  vx: number;
  vy: number;
  vr: number;
  life: number;
}

interface CasinoCelebrationProps {
  intensity: number;
  onComplete: () => void;
}

export default function CasinoCelebration({ intensity, onComplete }: CasinoCelebrationProps) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const count = Math.min(60, 10 + intensity * 25);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const startX = w / 2;
    const startY = h * 0.3;

    const newP: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8;
      const speed = 200 + Math.random() * 400;
      newP.push({
        id: i,
        x: startX + (Math.random() - 0.5) * 80,
        y: startY,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        size: 4 + Math.random() * 8,
        rotation: Math.random() * 360,
        vx: Math.cos(angle) * speed * (0.5 + Math.random()),
        vy: Math.sin(angle) * speed * (0.5 + Math.random()),
        vr: (Math.random() - 0.5) * 360,
        life: 1.5 + Math.random() * 1.5,
      });
    }
    setParticles(newP);

    const interval = setInterval(() => {
      setParticles(prev => {
        const next = prev.map(p => ({
          ...p,
          x: p.x + p.vx * 0.016,
          y: p.y + p.vy * 0.016,
          vy: p.vy + 200 * 0.016,
          rotation: p.rotation + p.vr * 0.016,
          life: p.life - 0.016,
        })).filter(p => p.life > 0);

        if (next.length === 0) {
          clearInterval(interval);
          setTimeout(onComplete, 50);
        }
        return next;
      });
    }, 16);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      onComplete();
    }, 4000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [intensity, onComplete]);

  if (particles.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute"
          style={{
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
            borderRadius: 1,
            transform: `rotate(${p.rotation}deg)`,
            opacity: Math.max(0, p.life / 2),
            boxShadow: `0 0 2px ${p.color}44`,
          }}
        />
      ))}
    </div>
  );
}
