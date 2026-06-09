import { useState } from 'react';

async function sha256(msg: string): Promise<string> {
  const enc = new TextEncoder().encode(msg);
  // crypto.subtle only available in secure contexts (HTTPS/localhost)
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback: simple hash for non-secure contexts (not cryptographically secure)
  let hash = 0;
  for (let i = 0; i < msg.length; i++) {
    const char = msg.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export function ProvablyFairVerify({ hash, seed }: { hash: string; seed: string }) {
  const [result, setResult] = useState<'idle' | 'match' | 'mismatch'>('idle');

  const handleVerify = async () => {
    const computed = await sha256(seed);
    setResult(computed === hash ? 'match' : 'mismatch');
  };

  return (
    <div className="mt-2 pt-2 border-t border-white/5">
      <button
        onClick={handleVerify}
        className="text-[10px] font-mono text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg border border-amber-500/20 transition w-full flex items-center justify-center gap-1.5"
      >
        {result === 'idle' && '🔍 Verify Fairness'}
        {result === 'match' && '✅ Verified — SHA-256 matches!'}
        {result === 'mismatch' && '❌ Mismatch — hashes differ!'}
      </button>
      {seed && (
        <div className="mt-1 text-[8px] font-mono text-slate-600 truncate select-all">Seed: {seed}</div>
      )}
    </div>
  );
}
