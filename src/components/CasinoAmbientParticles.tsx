import React, { useMemo } from 'react';

const PARTICLE_COUNT = 30;

interface ParticleSeed {
  id: number;
  left: number;
  delay: number;
  duration: number;
  size: number;
  drift: number;
}

export default function CasinoAmbientParticles({ active }: { active: boolean }) {
  const seeds = useMemo<ParticleSeed[]>(() => {
    const arr: ParticleSeed[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr.push({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 8,
        duration: 6 + Math.random() * 6,
        size: 2 + Math.random() * 3,
        drift: -20 + Math.random() * 40,
      });
    }
    return arr;
  }, []);

  return (
    <div
      className="absolute inset-0 pointer-events-none z-0 overflow-hidden"
      style={{ opacity: active ? 1 : 0, transition: 'opacity 0.8s ease' }}
    >
      <style>{`
        @keyframes floatUp {
          0% { transform: translateY(0) translateX(0) scale(1); opacity: 0; }
          10% { opacity: 0.6; }
          85% { opacity: 0.4; }
          100% { transform: translateY(-120px) translateX(var(--drift)) scale(0.6); opacity: 0; }
        }
        .casino-particle {
          position: absolute;
          bottom: -10%;
          border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, rgba(245,158,11,0.8), rgba(217,119,6,0.3));
          box-shadow: 0 0 4px rgba(245,158,11,0.3);
          animation: floatUp var(--dur) ease-out var(--delay) infinite;
          will-change: transform, opacity;
        }
      `}</style>
      {seeds.map(s => (
        <div
          key={s.id}
          className="casino-particle"
          style={{
            left: `${s.left}%`,
            width: s.size,
            height: s.size,
            '--dur': `${s.duration}s`,
            '--delay': `${s.delay}s`,
            '--drift': `${s.drift}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
