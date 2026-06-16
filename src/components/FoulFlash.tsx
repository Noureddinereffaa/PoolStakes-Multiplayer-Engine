import React, { useEffect, useState } from 'react';

interface FoulFlashProps {
  onComplete: () => void;
}

export default function FoulFlash({ onComplete }: FoulFlashProps) {
  const [phase, setPhase] = useState<'enter' | 'exit' | 'gone'>('enter');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('exit'), 200);
    const t2 = setTimeout(() => onComplete(), 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onComplete]);

  if (phase === 'gone') return null;

  return (
    <div
      className="fixed inset-0 z-40 pointer-events-none"
      style={{
        background: `radial-gradient(circle at 50% 50%, transparent 40%, ${phase === 'enter' ? 'rgba(255,0,0,0.25)' : 'rgba(255,0,0,0)'})`,
        transition: phase === 'exit' ? 'all 0.4s ease-out' : 'none',
      }}
    />
  );
}
