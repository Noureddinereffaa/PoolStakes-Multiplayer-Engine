import React, { useRef, useEffect, useState, useCallback } from 'react';
import { RoomState, Difficulty } from '../types';
import { getSafeFrame, SafeFrame } from '../utils/safeFrame';

import {
  isMobileDevice,
  hideBrowserChrome,
  startChromeHiding,
  stopChromeHiding,
  enterFullscreen as enterMobileFS,
  exitFullscreen as exitMobileFS,
  isFullscreen as checkFullscreen,
  vibrate
} from '../utils/mobile';
import PoolTable, { PoolTableHandle } from './PoolTable';
import PoolTable3D from './PoolTable3D';
import PowerControl from './PowerControl';
import {
  Minimize, Maximize, MessageSquare, Send, Copy, Lock, Unlock, Cpu, X, Users, Bot, Volume2, VolumeX,
} from 'lucide-react';
import { ProvablyFairVerify } from './ProvablyFairVerify';
import { poolAudio } from '../utils/audio';
import { motion, AnimatePresence } from 'framer-motion';
import CasinoSpectator from './CasinoSpectator';
import CasinoCelebration from './CasinoCelebration';
import FoulFlash from './FoulFlash';
import CasinoAmbientParticles from './CasinoAmbientParticles';

interface ArenaPageProps {
  roomState: RoomState | null;
  userSession: { id: string; username: string; balance: number; email?: string; walletAddress?: string };
  language: 'en' | 'ar';
  onQuitRoom: () => void;
  myPlayerObj: { id: string; username: string; walletBalance: number; bettingStake: number; side?: 'solids' | 'stripes'; isConnected: boolean } | undefined;
  isMyTurn: boolean;
  physicsFrames: Array<Array<{ id: number; x: number; y: number; isPocketed: boolean }>> | null;
  setPhysicsFrames: (f: Array<Array<{ id: number; x: number; y: number; isPocketed: boolean }>> | null) => void;
  physicsTotalSteps: number | null;
  handleShoot: (angle: number, power: number, spinX?: number, spinY?: number) => void;
  handleResetCueBall: (x: number, y: number) => void;
  handleCallPocket: (pocketId: number) => void;
  opponentAim: { angle: number; power: number; spinX?: number; spinY?: number } | null | undefined;
  handlePreviewAim: (angle: number, power: number, spinX?: number, spinY?: number) => void;
  handleJoinAI: (difficulty?: Difficulty) => void;
  handleRematch: () => void;
  chatMessage: string;
  setChatMessage: (msg: string) => void;
  handleSendChat: (msg: string) => void;
  connectionGrade?: string;
  isOffline?: boolean;
}

const BALLS_META = [
  { id: 1, number: 1, type: 'solid', color: '#CFAF30' },
  { id: 2, number: 2, type: 'solid', color: '#1B4CA7' },
  { id: 3, number: 3, type: 'solid', color: '#B12724' },
  { id: 4, number: 4, type: 'solid', color: '#5F3E9C' },
  { id: 5, number: 5, type: 'solid', color: '#C86414' },
  { id: 6, number: 6, type: 'solid', color: '#0F7B4D' },
  { id: 7, number: 7, type: 'solid', color: '#7A1E2A' },
  { id: 8, number: 8, type: 'black', color: '#111111' },
  { id: 9, number: 9, type: 'stripe', color: '#D7B037' },
  { id: 10, number: 10, type: 'stripe', color: '#4A76C8' },
  { id: 11, number: 11, type: 'stripe', color: '#D45851' },
  { id: 12, number: 12, type: 'stripe', color: '#9D6FD1' },
  { id: 13, number: 13, type: 'stripe', color: '#D28D3E' },
  { id: 14, number: 14, type: 'stripe', color: '#3CA972' },
  { id: 15, number: 15, type: 'stripe', color: '#8A1A24' },
];

function BallIcon({ id, size = 20 }: { id: number; size?: number }) {
  const meta = BALLS_META.find(b => b.id === id);
  if (!meta) return null;
  const isStripe = meta.type === 'stripe';
  const s = size;
  return (
    <div className="rounded-full flex items-center justify-center relative select-none shrink-0"
      style={{
        width: s, height: s,
        background: isStripe
          ? `linear-gradient(135deg, #f5f0e8 18%, #ffffff 22%, ${meta.color} 22%, ${meta.color} 78%, #ffffff 78%, #f5f0e8 82%)`
          : `radial-gradient(circle at 32% 30%, ${lightenColor(meta.color, 30)} 0%, ${meta.color} 40%, ${darkenColor(meta.color, 40)} 110%)`,
        boxShadow: `inset -1.5px -1.5px 4px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)`,
      }}
    >
      {/* Stripe 3D shading overlay */}
      {isStripe && (
        <div className="absolute inset-0 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle at 30% 28%, rgba(255,255,255,0.3) 0%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.6) 100%)' }}
        />
      )}
      {/* Solid ball extra gloss */}
      {!isStripe && (
        <div className="absolute inset-0 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle at 30% 28%, rgba(255,255,255,0.15) 0%, transparent 50%)' }}
        />
      )}
      {/* Top highlight */}
      <div className="absolute top-[12%] left-[15%] w-[25%] h-[10%] bg-white/50 rounded-full rotate-[-20deg] pointer-events-none" />
      {/* Number badge */}
      <div className="rounded-full bg-[#fffaeb] border border-amber-600/40 flex items-center justify-center z-10 shadow-sm"
        style={{ width: s * 0.52, height: s * 0.52 }}
      >
        <span className="font-black text-slate-900 font-mono leading-none drop-shadow-[0_0.5px_0_rgba(255,255,255,0.5)]" style={{ fontSize: s * 0.3 }}>{meta.number}</span>
      </div>
    </div>
  );
}

function lightenColor(hex: string, amt: number): string {
  let r = parseInt(hex.slice(1,3), 16), g = parseInt(hex.slice(3,5), 16), b = parseInt(hex.slice(5,7), 16);
  r = Math.min(255, r + amt); g = Math.min(255, g + amt); b = Math.min(255, b + amt);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function darkenColor(hex: string, amt: number): string {
  let r = parseInt(hex.slice(1,3), 16), g = parseInt(hex.slice(3,5), 16), b = parseInt(hex.slice(5,7), 16);
  r = Math.max(0, r - amt); g = Math.max(0, g - amt); b = Math.max(0, b - amt);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function SpinControl({ spinX, spinY, onChange, disabled, isMobile }: {
  spinX: number; spinY: number; onChange: (x: number, y: number) => void; disabled: boolean; isMobile: boolean;
}) {
  const [open, setOpen] = useState(false);
  const padRef = useRef<HTMLDivElement>(null);
  const isMobileDevice = window.innerWidth < 768;
  const padSize = isMobileDevice ? 120 : (isMobile ? 120 : 200);

  const spinLabel = () => {
    if (Math.abs(spinX) < 0.05 && Math.abs(spinY) < 0.05) return 'CENTER';
    const f = spinY > 0.05, d = spinY < -0.05;
    const r = spinX > 0.05, l = spinX < -0.05;
    if (f && r) return 'FOL+R'; if (f && l) return 'FOL+L';
    if (d && r) return 'DRAW+R'; if (d && l) return 'DRAW+L';
    if (f) return 'FOLLOW'; if (d) return 'DRAW';
    if (r) return 'R.ENG'; if (l) return 'L.ENG';
    return 'CENTER';
  };

  const updateFromEvent = (e: React.PointerEvent) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 - 1;
    const dist = Math.sqrt(x * x + y * y);
    onChange(dist > 1 ? x / dist : x, dist > 1 ? y / dist : y);
  };

  const handleDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromEvent(e);
  };

  const handleMove = (e: React.PointerEvent) => {
    updateFromEvent(e);
  };

  const handleUp = () => {
    if (isMobileDevice) return; // persistent on mobile — don't close
    setOpen(false);
  };

  const hasSpin = Math.abs(spinX) > 0.05 || Math.abs(spinY) > 0.05;

  // Desktop: overlay mode (existing behavior)
  if (open && !isMobileDevice) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onPointerDown={() => setOpen(false)}
      >
        <div className="flex flex-col items-center gap-4"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold text-amber-400/80 tracking-[0.2em] uppercase">Cue Ball Spin</span>
            {hasSpin && (
              <button onClick={() => { onChange(0, 0); setOpen(false); }}
                className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition"
              >CENTER</button>
            )}
          </div>
          <div
            ref={padRef}
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
            className="rounded-full cursor-crosshair select-none touch-none relative"
            style={{
              width: 200, height: 200,
              background: 'radial-gradient(circle at 40% 35%, #78350f, #451a03 80%, #1a0a02)',
              boxShadow: 'inset -4px -5px 14px rgba(0,0,0,0.85), inset 4px 4px 10px rgba(245,158,11,0.12), 0 0 50px rgba(0,0,0,0.5), 0 0 0 2px rgba(217,119,6,0.25)',
              touchAction: 'none',
            }}
          >
            <div className="absolute inset-[18%] flex items-center justify-center pointer-events-none">
              <div className="w-full h-px bg-white/8" />
            </div>
            <div className="absolute inset-[18%] flex items-center justify-center pointer-events-none">
              <div className="h-full w-px bg-white/8" />
            </div>
            <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] font-mono font-bold text-white/30 pointer-events-none">FOLLOW</span>
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-mono font-bold text-white/30 pointer-events-none">DRAW</span>
            <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[8px] font-mono font-bold text-white/30 pointer-events-none">LEFT</span>
            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] font-mono font-bold text-white/30 pointer-events-none">RIGHT</span>
            <div className="absolute pointer-events-none"
              style={{
                left: `calc(50% + ${spinX * (200 / 2 - 16)}px)`,
                top: `calc(50% + ${-spinY * (200 / 2 - 16)}px)`,
                width: 24, height: 24,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div className="w-full h-full rounded-full"
                style={{
                  background: 'radial-gradient(circle at 30% 30%, #ffffff, #f0e8dc 60%, #d4c8b4)',
                  boxShadow: '0 0 12px rgba(245,158,11,0.5), inset -1px -1px 3px rgba(0,0,0,0.3)',
                }}
              />
              <div className="absolute rounded-full"
                style={{
                  width: 7, height: 7,
                  left: '50%', top: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: 'radial-gradient(circle at 35% 35%, #ef4444, #b91c1c)',
                  boxShadow: '0 0 8px rgba(239,68,68,0.7)',
                }}
              />
            </div>
          </div>
          <span className="text-sm font-mono font-bold text-amber-500 min-h-[1.2em]">{spinLabel()}</span>
        </div>
      </div>
    );
  }

  // Mobile: Persistent bottom-center spin wheel (always visible)
  if (isMobileDevice) {
    return (
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 pointer-events-auto"
        style={{ touchAction: 'none' }}
      >
        <div className="flex flex-col items-center gap-0.5">
          {/* Compact spin pad — always visible */}
          <div
            ref={padRef}
            onPointerDown={disabled ? undefined : handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
            className={`rounded-full cursor-crosshair select-none touch-none relative ${disabled ? 'opacity-25' : ''}`}
            style={{
              width: padSize, height: padSize,
              background: hasSpin
                ? 'radial-gradient(circle at 40% 35%, #78350f, #451a03 80%, #1a0a02)'
                : 'radial-gradient(circle at 40% 35%, #292524, #1c1917 80%, #0a0a0a)',
              boxShadow: hasSpin
                ? '0 0 16px rgba(245,158,11,0.2), inset -3px -4px 10px rgba(0,0,0,0.85), inset 3px 3px 8px rgba(245,158,11,0.08), 0 0 0 1.5px rgba(217,119,6,0.2)'
                : 'inset -3px -4px 10px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.05)',
              touchAction: 'none',
            }}
          >
            {/* Crosshair */}
            <div className="absolute inset-[20%] flex items-center justify-center pointer-events-none">
              <div className="w-full h-px bg-white/10" />
            </div>
            <div className="absolute inset-[20%] flex items-center justify-center pointer-events-none">
              <div className="h-full w-px bg-white/10" />
            </div>
            {/* Labels */}
            <span className="absolute top-0.5 left-1/2 -translate-x-1/2 text-[6px] font-mono font-bold text-white/20 pointer-events-none">F</span>
            <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[6px] font-mono font-bold text-white/20 pointer-events-none">D</span>
            <span className="absolute left-0.5 top-1/2 -translate-y-1/2 text-[6px] font-mono font-bold text-white/20 pointer-events-none">L</span>
            <span className="absolute right-0.5 top-1/2 -translate-y-1/2 text-[6px] font-mono font-bold text-white/20 pointer-events-none">R</span>
            {/* Mini cue ball + red contact dot */}
            <div className="absolute pointer-events-none"
              style={{
                left: `calc(50% + ${spinX * (padSize / 2 - 10)}px)`,
                top: `calc(50% + ${-spinY * (padSize / 2 - 10)}px)`,
                width: 16, height: 16,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div className="w-full h-full rounded-full"
                style={{
                  background: 'radial-gradient(circle at 30% 30%, #ffffff, #f0e8dc 60%, #d4c8b4)',
                  boxShadow: '0 0 8px rgba(245,158,11,0.4), inset -1px -1px 2px rgba(0,0,0,0.3)',
                }}
              />
              <div className="absolute rounded-full"
                style={{
                  width: 5, height: 5,
                  left: '50%', top: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: 'radial-gradient(circle at 35% 35%, #ef4444, #b91c1c)',
                  boxShadow: '0 0 5px rgba(239,68,68,0.6)',
                }}
              />
            </div>
          </div>
          {/* Label below */}
          <span className="text-[7px] font-mono font-bold text-white/25 tracking-wider">{spinLabel()}</span>
        </div>
      </div>
    );
  }

  // Desktop closed — small toggle button
  return (
    <button
      onClick={() => { if (!disabled) setOpen(true); }}
      disabled={disabled}
      className="rounded-full flex items-center justify-center cursor-pointer select-none touch-none transition hover:scale-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        width: 32, height: 32,
        background: hasSpin
          ? 'radial-gradient(circle at 40% 35%, #92400e, #78350f 60%, #451a03)'
          : 'radial-gradient(circle at 40% 35%, #292524, #1c1917 60%, #0a0a0a)',
        boxShadow: hasSpin
          ? '0 0 12px rgba(245,158,11,0.25), inset 0 1px 0 rgba(255,255,255,0.06)'
          : 'inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
      title="Adjust spin"
    >
      {hasSpin ? (
        <div className="rounded-full"
          style={{
            width: 8, height: 8,
            background: 'radial-gradient(circle at 30% 30%, #fde68a, #f59e0b 60%, #b45309)',
            boxShadow: '0 0 6px rgba(245,158,11,0.5)',
          }}
        />
      ) : (
        <span className="text-[10px] font-mono font-bold text-white/40">S</span>
      )}
    </button>
  );
}

function SidePanel({ roomState, userSession, language, activeEscrow, chatMessage, setChatMessage, handleSendChat, handleJoinAI, chatRef, onClose }: {
  roomState: RoomState; userSession: { id: string; username: string; balance: number; email?: string; walletAddress?: string }; language: 'en' | 'ar'; activeEscrow: number;
  chatMessage: string; setChatMessage: (v: string) => void; handleSendChat: (v: string) => void;
  handleJoinAI: (difficulty?: Difficulty) => void; chatRef: React.RefObject<HTMLDivElement | null>; onClose: () => void;
}) {
  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-[#0d0806] to-black border-l border-amber-900/30 overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-amber-900/20 shrink-0">
        <span className="text-xs font-bold text-amber-400 font-mono tracking-wider">INFO</span>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 transition text-white/50 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="rounded-xl border border-amber-900/30 bg-black/40 p-3">
          <div className="text-[10px] text-amber-600 font-bold mb-2 font-mono tracking-wider">{language === 'ar' ? 'اللاعبون' : 'Players'}</div>
          <div className="space-y-2">
            {roomState.players.map((p: { id: string; username: string; walletBalance: number; side?: 'solids' | 'stripes'; isConnected: boolean }, i: number) => (
              <div key={p.id}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all ${p.username === userSession!.username ? 'border-amber-500/40 bg-amber-500/10' : 'border-amber-900/20 bg-black/30'}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] text-amber-700 font-mono shrink-0">#{i + 1}</span>
                  <span className="text-sm font-bold text-amber-200 truncate">{p.username}</span>
                  {p.username.startsWith('Bot_') && <span className="text-[8px] bg-amber-500/20 text-amber-400 px-1 py-0.5 rounded border border-amber-500/30 font-bold shrink-0">BOT</span>}
                  {p.side && <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold shrink-0 ${p.side === 'solids' ? 'bg-amber-400 text-amber-950' : 'bg-blue-600 text-white'}`}>{p.side}</span>}
                  {roomState.currentTurn === p.id && roomState.status === 'playing' && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />}
                </div>
                <span className="text-xs font-mono font-bold text-amber-400 shrink-0">${p.walletBalance.toFixed(2)}</span>
              </div>
            ))}
          </div>
          {roomState.players.length === 1 && (
            <div className="mt-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
              <p className="text-[10px] text-amber-500 mb-2 font-bold">{language === 'ar' ? 'في انتظار الخصم...' : 'Waiting for opponent...'}</p>
              <div className="flex items-center gap-2 text-[10px] text-amber-600 mb-2">
                <span className="font-mono text-amber-400 font-bold bg-black/50 px-2 py-1 rounded border border-amber-900/30 truncate">{roomState.roomId}</span>
                <button onClick={() => navigator.clipboard.writeText(roomState.roomId)} className="p-1 rounded bg-amber-700/30 hover:bg-amber-700/50 transition shrink-0"><Copy className="w-3 h-3" /></button>
              </div>
              <button onClick={() => handleJoinAI('medium')} className="w-full py-2 rounded-lg bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-black text-xs font-bold transition flex items-center justify-center gap-1.5"><Cpu className="w-3.5 h-3.5" />{language === 'ar' ? 'استدعاء AI' : 'Summon AI'}</button>
            </div>
          )}
        </div>
        {activeEscrow > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-black/40 p-3 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-amber-500 via-amber-300 to-amber-500 opacity-50" />
            <div className="flex items-center gap-1.5 mb-2 text-xs text-amber-400 font-bold">
              <Lock className="w-3 h-3" />{language === 'ar' ? 'صندوق الضمان' : 'Escrow'}
              <span className="text-[8px] ml-auto bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold border border-amber-500/30">Audited</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-black/50 p-2 rounded border border-amber-900/30"><div className="text-[9px] text-amber-600">{language === 'ar' ? 'مقفل' : 'Locked'}</div><div className="font-bold text-amber-100 font-mono">${activeEscrow.toFixed(2)}</div></div>
              <div className="bg-amber-500/10 p-2 rounded border border-amber-500/20"><div className="text-[9px] text-amber-500">{language === 'ar' ? 'الرابح يأخذ' : 'Winner Gets'}</div><div className="font-bold text-amber-400 font-mono">${(activeEscrow * 0.95).toFixed(2)}</div></div>
            </div>
            {roomState.escrowHash && (
              <div className="mt-2 pt-2 border-t border-amber-900/30">
                <div className="text-[8px] text-amber-600 font-mono mb-1">SHA-256</div>
                <div className="text-[8px] font-mono text-amber-400 bg-black/60 p-1.5 rounded border border-amber-900/30 truncate select-all">{roomState.escrowHash}</div>
                {roomState.status === 'gameover' && roomState.serverSeed && <ProvablyFairVerify hash={roomState.escrowHash} seed={roomState.serverSeed} />}
              </div>
            )}
          </div>
        )}
        <div className="rounded-xl border border-amber-900/30 bg-black/40 flex flex-col min-h-[200px] overflow-hidden">
          <div className="p-2 border-b border-amber-900/20">
            <div className="flex items-center gap-1.5 text-xs"><MessageSquare className="w-3.5 h-3.5 text-amber-400" /><span className="font-bold text-amber-300 font-mono">{language === 'ar' ? 'الدردشة' : 'Chat'}</span></div>
          </div>
          <div ref={chatRef} className="flex-1 p-2 overflow-y-auto space-y-1 bg-black/30 min-h-0">
            {roomState.log.map((line: string, idx: number) => (
              <div key={idx} className={`text-[10px] leading-relaxed font-mono ${!line.includes(':') ? 'text-amber-500/80 italic' : line.includes('PROVABLY') ? 'text-amber-400 font-bold' : 'text-amber-600/70'}`}>{line}</div>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (chatMessage.trim()) { handleSendChat(chatMessage); setChatMessage(''); } }}
            className="flex gap-1.5 p-2 border-t border-amber-900/20 shrink-0"
          >
            <input type="text" value={chatMessage} onChange={e => setChatMessage(e.target.value)}
              placeholder={language === 'ar' ? 'رسالة...' : 'Message...'}
              className="flex-1 bg-black/60 border border-amber-900/30 rounded-lg px-3 py-1.5 text-xs text-amber-200 placeholder-amber-800 focus:outline-none focus:border-amber-500"
            />
            <button type="submit" className="p-1.5 rounded-lg bg-gradient-to-tr from-amber-600 to-amber-400 hover:from-amber-500 hover:to-amber-300 text-black transition shrink-0"><Send className="w-3.5 h-3.5" /></button>
          </form>
        </div>
      </div>
    </div>
  );
}

function ArenaLoadingState({ onQuitRoom, language }: { onQuitRoom: () => void; language: 'en' | 'ar' }) {
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col overflow-hidden overscroll-none select-none">
      <style>{`
        @keyframes neonPulse {
          0%, 100% { border-color: #2a1005; box-shadow: 0 0 30px rgba(0,0,0,0.8) inset, 0 0 0 rgba(245,158,11,0); }
          50% { border-color: #5c2a0a; box-shadow: 0 0 30px rgba(0,0,0,0.8) inset, 0 0 25px rgba(245,158,11,0.15); }
        }
        @keyframes spin3d {
          0% { transform: rotateY(0deg) rotateX(10deg); }
          100% { transform: rotateY(360deg) rotateX(10deg); }
        }
        @keyframes chipStack {
          0% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-4px) scale(1.02); }
          100% { transform: translateY(0) scale(1); }
        }
        @keyframes cardFlip {
          0% { transform: rotateY(0deg); }
          50% { transform: rotateY(180deg); }
          100% { transform: rotateY(360deg); }
        }
        @keyframes fadeDots {
          0%, 20% { opacity: 0; }
          50% { opacity: 1; }
          80%, 100% { opacity: 0; }
        }
        .loading-8ball {
          animation: spin3d 3s linear infinite;
          transform-style: preserve-3d;
        }
        .loading-chip {
          animation: chipStack 1.2s ease-in-out infinite;
        }
        .loading-chip:nth-child(2) { animation-delay: 0.15s; }
        .loading-chip:nth-child(3) { animation-delay: 0.3s; }
        .loading-card {
          animation: cardFlip 2s ease-in-out infinite;
          transform-style: preserve-3d;
        }
        .loading-dot:nth-child(1) { animation: fadeDots 1.4s ease-in-out infinite; }
        .loading-dot:nth-child(2) { animation: fadeDots 1.4s ease-in-out infinite 0.2s; }
        .loading-dot:nth-child(3) { animation: fadeDots 1.4s ease-in-out infinite 0.4s; }
      `}</style>
      <div className="h-12 bg-gradient-to-b from-black/80 to-transparent px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="loading-chip w-5 h-5 rounded-full border-2 border-amber-600/60 bg-gradient-to-br from-amber-400 to-amber-700 flex items-center justify-center text-[6px] font-black text-amber-900">$</div>
          <div className="w-20 h-3 rounded bg-gradient-to-r from-amber-900/30 via-amber-700/20 to-amber-900/30" />
        </div>
        <div className="w-16 h-4 rounded bg-gradient-to-r from-amber-900/20 via-amber-700/15 to-amber-900/20" />
      </div>
      <div className="flex-1 w-full max-w-6xl mx-auto flex items-center justify-center p-2 sm:p-4">
        <div className="w-full aspect-[2/1] rounded-[2rem] sm:rounded-[3rem] bg-gradient-to-br from-[#1a0c06] to-[#0a0402] border-[16px] sm:border-[24px] border-[#2a1005] shadow-[0_0_60px_rgba(0,0,0,0.8)_inset,0_0_25px_rgba(245,158,11,0.08)] relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23f59e0b' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/10 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-6">
              <div className="flex items-center gap-4">
                <div className="loading-8ball w-10 h-10 rounded-full bg-gradient-to-br from-gray-900 to-black border-2 border-white/20 flex items-center justify-center text-sm font-black text-white shadow-lg">
                  8
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="loading-chip w-8 h-2 rounded-sm bg-gradient-to-r from-amber-500 to-amber-700 border border-amber-400/30" />
                  <div className="loading-chip w-8 h-2 rounded-sm bg-gradient-to-r from-amber-400 to-amber-600 border border-amber-300/30" style={{ animationDelay: '0.15s' }} />
                  <div className="loading-chip w-8 h-2 rounded-sm bg-gradient-to-r from-amber-600 to-amber-800 border border-amber-500/30" style={{ animationDelay: '0.3s' }} />
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-amber-500/70 font-mono font-bold text-xs sm:text-sm uppercase tracking-widest">
                  {language === 'ar' ? 'جاري تجهيز الطاولة' : 'PREPARING ARENA'}
                </span>
                <span className="flex gap-0.5">
                  <span className="loading-dot w-1 h-1 rounded-full bg-amber-500" />
                  <span className="loading-dot w-1 h-1 rounded-full bg-amber-500" />
                  <span className="loading-dot w-1 h-1 rounded-full bg-amber-500" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="h-20 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-center pb-4">
        <button onClick={onQuitRoom} className="px-8 py-2.5 rounded-xl bg-amber-950/40 border border-amber-900/30 text-amber-600 font-black tracking-widest hover:bg-amber-900/60 hover:text-amber-400 transition-colors">
          {language === 'ar' ? 'إلغاء وإلعودة' : 'CANCEL & RETURN'}
        </button>
      </div>
    </div>
  );
}

export default function ArenaPage({
  roomState, userSession, language, onQuitRoom, myPlayerObj, isMyTurn,
  physicsFrames, setPhysicsFrames, physicsTotalSteps, handleShoot, handleResetCueBall, handleCallPocket, opponentAim,
  handlePreviewAim, handleJoinAI, handleRematch, chatMessage, setChatMessage, handleSendChat,
  connectionGrade, isOffline
}: ArenaPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<PoolTableHandle>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showSpinUI, setShowSpinUI] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.6);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [foulNotification, setFoulNotification] = useState<string | null>(null);
  const [turnChanged, setTurnChanged] = useState(false);
  const prevTurnRef = useRef(roomState?.currentTurn);
  const [isPortrait, setIsPortrait] = useState(() => window.innerHeight > window.innerWidth);
  const overlayTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  const [headerVisible, setHeaderVisible] = useState(true);
  const [showCallPocket, setShowCallPocket] = useState(false);
  const [calledPocketId, setCalledPocketId] = useState<number | null>(null);
  const [showCasinoView, setShowCasinoView] = useState(false);
  const [use3D, setUse3D] = useState(false);
  const [celebrationIntensity, setCelebrationIntensity] = useState(0);
  const [foulFlash, setFoulFlash] = useState(false);
  const [winCelebration, setWinCelebration] = useState(0);
  const prevPocketedCountRef = useRef(0);
  const wasGameOverRef = useRef(false);

  const toggleHeader = useCallback(() => setHeaderVisible(v => !v), []);

  useEffect(() => {
    let wasPortrait: boolean | null = null;
    const checkMobile = () => setIsMobile(isMobileDevice());
    const checkOrientation = () => {
      const portrait = window.innerHeight > window.innerWidth;
      if (wasPortrait === true && !portrait) {
        setTimeout(hideBrowserChrome, 50);
        setTimeout(hideBrowserChrome, 500);
      }
      wasPortrait = portrait;
      setIsPortrait(portrait);
    };
    const onResize = () => { checkMobile(); checkOrientation(); };
    checkMobile();
    checkOrientation();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); };
  }, []);

  useEffect(() => {
    const handler = () => {
      const fs = document.fullscreenElement === containerRef.current;
      setIsFullscreen(fs);
      if (!fs) { screen.orientation?.unlock?.(); setShowSidebar(false); }
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    document.body.style.top = '0';
    document.body.style.left = '0';
    document.body.style.touchAction = 'none';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.touchAction = 'none';

    // Mobile: aggressively hide browser chrome + auto-fullscreen
    if (isMobile) {
      startChromeHiding();
      // Auto-request fullscreen on mount (user gesture from navigation counts)
      if (!checkFullscreen() && containerRef.current) {
        enterMobileFS(containerRef.current);
      }
      // Fallback: if fullscreen failed, keep trying chrome hiding
    } else {
      hideBrowserChrome();
      setTimeout(hideBrowserChrome, 400);
    }

    return () => {
      stopChromeHiding();
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('position');
      document.body.style.removeProperty('width');
      document.body.style.removeProperty('height');
      document.body.style.removeProperty('top');
      document.body.style.removeProperty('left');
      document.body.style.removeProperty('touch-action');
      document.documentElement.style.removeProperty('overflow');
      document.documentElement.style.removeProperty('touch-action');
      document.body.style.removeProperty('overscroll-behavior');
    };
  }, []);

  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;   }, [roomState?.log]);

  // Inject pocketed ball insert animation
  useEffect(() => {
    const id = 'arena-page-anim';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
    style.textContent = `@keyframes fadeScaleIn {
      from { opacity: 0; transform: scale(0.3) translateY(-16px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes turnPulse {
      0%, 100% { border-color: rgba(251,191,36,0.5); box-shadow: 0 0 6px rgba(245,158,11,0.15); }
      50% { border-color: rgba(251,191,36,0.85); box-shadow: 0 0 16px rgba(245,158,11,0.35); }
    }
    .turn-active { animation: turnPulse 1.8s ease-in-out infinite; }`;
      document.head.appendChild(style);
    }
  }, []);

  // One-shot fullscreen on first user interaction (captures any click/touch)
  useEffect(() => {
    if (checkFullscreen()) return;
    const el = containerRef.current;
    if (!el) return;
    const handler = () => {
      if (!checkFullscreen()) enterMobileFS(el);
    };
    el.addEventListener('pointerdown', handler, { once: true });
    el.addEventListener('touchstart', handler, { once: true });
    return () => {
      el.removeEventListener('pointerdown', handler);
      el.removeEventListener('touchstart', handler);
    };
  }, []);

  const toggleFullscreen = () => {
    if (isFullscreen) {
      exitMobileFS();
    } else {
      if (containerRef.current) enterMobileFS(containerRef.current);
    }
  };

  const resetOverlayTimer = useCallback(() => {
    setShowOverlay(true);
    clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => setShowOverlay(false), 3000);
  }, []);

  const activeEscrow = roomState && roomState.status !== 'waiting' && roomState.status !== 'gameover' ? roomState.stake * 2 : 0;

  const myPlayer = roomState?.players.find(p => p.id === myPlayerObj?.id);
  const opponent = roomState?.players.find(p => p.id !== myPlayerObj?.id);
  const mySide = myPlayer?.side;
  const opponentSide = opponent?.side;

  const myPocketed = roomState ? BALLS_META.filter(b => {
    if (!mySide) return false;
    const tb = roomState.balls.find(t => t.id === b.id);
    return tb?.isPocketed && (mySide === 'solids' ? b.type === 'solid' : b.type === 'stripe');
  }) : [];
  const opponentPocketed = roomState ? BALLS_META.filter(b => {
    if (!opponentSide) return false;
    const tb = roomState.balls.find(t => t.id === b.id);
    return tb?.isPocketed && (opponentSide === 'solids' ? b.type === 'solid' : b.type === 'stripe');
  }) : [];
  const allPocketed = roomState ? BALLS_META.filter(b => roomState.balls.find(t => t.id === b.id)?.isPocketed) : [];

  const timerVal = roomState?.turnTimer ?? 60;
  const timerPct = (timerVal / 60) * 100;
  const timerColor = timerVal <= 10 ? 'from-rose-500 to-rose-400' : timerVal <= 20 ? 'from-amber-500 to-amber-400' : 'from-emerald-500 to-emerald-400';

  const spinX = tableRef.current?.spinX ?? 0;
  const spinY = tableRef.current?.spinY ?? 0;
  const shotPower = tableRef.current?.shotPower ?? 40;
  const isAimLocked = tableRef.current?.isAimLocked ?? false;
  const aimAngle = tableRef.current?.aimAngle ?? 0;
  const hudNotification = tableRef.current?.hudNotification ?? null;
  const setSpinX = (v: number) => tableRef.current?.setSpinX(v);
  const setSpinY = (v: number) => tableRef.current?.setSpinY(v);
  const setIsAimLocked = (v: boolean) => tableRef.current?.setIsAimLocked(v);
  const handleShootClick = () => tableRef.current?.handleShoot();

  const isGameOver = roomState?.status === 'gameover';
  const isWinner = isGameOver && roomState.winnerId === myPlayerObj?.id;
  const winnerName = isGameOver ? roomState.players.find(p => p.id === roomState.winnerId)?.username || 'Player' : '';

  const myPocketCount = mySide && roomState ? roomState.balls.filter(b => {
    if (b.id === 0 || b.id === 8 || !b.isPocketed) return false;
    return (mySide === 'solids' ? b.type === 'solid' : b.type === 'stripe');
  }).length : 0;
  const oppPocketCount = opponentSide && roomState ? roomState.balls.filter(b => {
    if (b.id === 0 || b.id === 8 || !b.isPocketed) return false;
    return (opponentSide === 'solids' ? b.type === 'solid' : b.type === 'stripe');
  }).length : 0;

  // Show Call Pocket dialog when it's my turn and 8-ball is my next target
  const myGroupCleared = mySide && roomState ? roomState.balls.filter(b => !b.isPocketed && b.id !== 0 && b.id !== 8 && (mySide === 'solids' ? b.type === 'solid' : b.type === 'stripe')).length === 0 : false;
  const eightBallAlive = roomState ? !roomState.balls.find(b => b.id === 8)?.isPocketed : false;
  const shouldCallPocket = isMyTurn && !!roomState && roomState.status === 'playing' && myGroupCleared && eightBallAlive && calledPocketId === null;

  useEffect(() => {
    if (isGameOver && !wasGameOverRef.current) {
      if (isWinner) {
        poolAudio.playWin();
        setWinCelebration(2);
      } else {
        poolAudio.playLose();
      }
    }
    wasGameOverRef.current = isGameOver;
  }, [isGameOver, isWinner]);

  const prevTimerRef = useRef(timerVal);
  useEffect(() => {
    if (timerVal <= 10 && timerVal > 0 && timerVal !== prevTimerRef.current && isMyTurn) {
      poolAudio.playCountdown();
    }
    prevTimerRef.current = timerVal;
  }, [timerVal, isMyTurn]);

  // Turn change sound
  useEffect(() => {
    if (prevTurnRef.current && prevTurnRef.current !== roomState?.currentTurn && roomState?.status === 'playing') {
      poolAudio.playTurnChange();
      setTurnChanged(true);
      setTimeout(() => setTurnChanged(false), 800);
    }
    prevTurnRef.current = roomState?.currentTurn;
  }, [roomState?.currentTurn, roomState?.status]);

  // Foul notification detection
  useEffect(() => {
    if (roomState?.log && roomState.log.length > 0) {
      const lastLog = roomState.log[roomState.log.length - 1];
      if (lastLog.toLowerCase().includes('foul') || lastLog.toLowerCase().includes('scratch')) {
        setFoulNotification(lastLog);
        setFoulFlash(true);
        poolAudio.playFoul();
        setTimeout(() => setFoulNotification(null), 3000);
      }
    }
  }, [roomState?.log]);

  // Reset calledPocketId when turn changes or game status changes
  useEffect(() => {
    if (!isMyTurn || roomState?.status !== 'playing') {
      setCalledPocketId(null);
      setShowCallPocket(false);
    }
  }, [isMyTurn, roomState?.status]);

  // Auto-show call pocket dialog when needed
  useEffect(() => {
    if (shouldCallPocket && !showCallPocket) {
      setShowCallPocket(true);
    }
  }, [shouldCallPocket, showCallPocket]);

  // Volume sync
  useEffect(() => {
    poolAudio.volume = volume;
  }, [volume]);

  const toggleMute = useCallback(() => {
    const newMuted = poolAudio.toggle();
    setIsMuted(newMuted);
  }, []);

  const frame = getSafeFrame(roomState);
  if (!frame) {
    return <ArenaLoadingState onQuitRoom={onQuitRoom} language={language} />;
  }

  const pocketedCount = frame.balls.filter(b => b.isPocketed && b.id !== 0).length;
  useEffect(() => {
    if (pocketedCount > prevPocketedCountRef.current) {
      const diff = pocketedCount - prevPocketedCountRef.current;
      setCelebrationIntensity(diff);
      if (use3D) {
        (tableRef.current as any)?.triggerConfetti?.(diff);
      }
    }
    prevPocketedCountRef.current = pocketedCount;
  }, [pocketedCount, use3D]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      ref={containerRef} className="fixed inset-0 z-50 bg-black flex flex-col overflow-hidden overscroll-none"
      onPointerMove={resetOverlayTimer}
      {...(isMobile ? { onClick: toggleHeader } : { onClick: resetOverlayTimer })}
    >
      {/* Mobile overlay: only portrait rotation warning (auto-fullscreen on mount) */}
      {isMobile && isPortrait && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4">
          <div className="text-5xl animate-pulse rotate-90">🎱</div>
          <div className="text-lg font-black font-mono text-amber-400">{language === 'ar' ? 'دور الهاتف' : 'ROTATE DEVICE'}</div>
          <div className="text-xs text-amber-600/80 font-mono text-center px-8">{language === 'ar' ? 'الرجاء تدوير الهاتف إلى الوضع الأفقي للعب' : 'Please rotate your phone to landscape'}</div>
          <div className="mt-4 w-16 h-16 rounded-2xl border-2 border-amber-500/40 flex items-center justify-center animate-pulse">
            <svg className="w-10 h-10 text-amber-400 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
        </div>
      )}

      {/* Header - Overlay on mobile, inline on desktop */}
      <header
        className={`${isMobile ? `absolute top-0 inset-x-0 transition-opacity duration-300 ${headerVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}` : 'relative'} z-40 bg-gradient-to-b from-black/80 to-transparent px-2 md:px-4 shrink-0`}
        style={{ paddingTop: isMobile ? '2px' : 'calc(var(--sat) + 4px)', paddingBottom: isMobile ? '2px' : '6px' }}
        role="banner"
        aria-label={language === 'ar' ? 'معلومات اللعبة' : 'Game Information'}
      >
            <div className="flex items-center justify-between gap-1 md:gap-2 max-w-4xl mx-auto">
              
              {/* Left Player (Me) - compact: avatar + name only */}
              <div className={`flex items-center gap-1 md:gap-2 min-w-0 flex-[2] bg-black/30 rounded-full px-1 py-0.5 md:p-1 border border-white/5 ${isMyTurn ? 'turn-active' : ''}`}
                role="status" aria-label={`${myPlayer?.username || 'You'} - ${myPocketed.length} balls pocketed${isMyTurn ? ' - your turn' : ''}`}
              >
                <div className="w-5 h-5 md:w-8 md:h-8 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-[8px] md:text-sm shadow shrink-0">🎱</div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[9px] md:text-xs font-bold text-amber-50 truncate">{myPlayer?.username || 'You'}</span>
                </div>
                {/* My pocket count badge */}
                <div className="flex items-center gap-1">
                  <span className="text-[8px] md:text-[10px] font-black font-mono text-amber-300">{myPocketed.length}</span>
                  <div className="w-[6px] h-[6px] rounded-full border border-white/20 bg-amber-500/40" />
                </div>
              </div>

              {/* Center Timer */}
              <div className="flex flex-col items-center shrink-0 px-1 md:px-2" role="timer" aria-label={`${timerVal} seconds remaining`} aria-live="polite">
                <span className={`text-sm md:text-lg font-black font-mono leading-none ${timerVal <= 10 ? 'text-rose-400 animate-pulse' : 'text-amber-300'}`}>
                  {timerVal}
                </span>
                <div className="w-8 md:w-16 h-[2px] mt-0.5 rounded-full bg-black overflow-hidden">
                  <div className={`h-full rounded-full bg-gradient-to-r ${timerColor} transition-all duration-1000`} style={{ width: `${timerPct}%` }} />
                </div>
              </div>

              {/* Escrow chip badge */}
              {activeEscrow > 0 && (
                <motion.div
                  key={activeEscrow}
                  initial={{ scale: 1.3, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex items-center gap-1 shrink-0 bg-gradient-to-br from-amber-600/20 to-amber-800/10 border border-amber-500/30 rounded-full px-1.5 md:px-2 py-0.5"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <circle cx="12" cy="12" r="10" fill="#f59e0b" fillOpacity="0.1" />
                    <path d="M12 6v12M6 12h12" stroke="#f59e0b" />
                  </svg>
                  <span className="text-[9px] md:text-xs font-black font-mono text-amber-300 leading-none">${activeEscrow.toFixed(0)}</span>
                </motion.div>
              )}

              {/* Right Player (Opponent) - compact: avatar + name + pocket badge */}
              <div className={`flex items-center gap-1 md:gap-2 min-w-0 flex-[2] justify-end bg-black/30 rounded-full px-1 py-0.5 md:p-1 border border-white/5 ${!isMyTurn && frame.status === 'playing' ? 'turn-active' : ''}`}
                role="status" aria-label={`${opponent?.username || 'Waiting'} - ${opponentPocketed.length} balls pocketed${!isMyTurn && frame.status === 'playing' ? ' - their turn' : ''}`}
              >
                {/* Opponent pocket count badge */}
                <div className="flex items-center gap-1">
                  <div className="w-[6px] h-[6px] rounded-full border border-white/20 bg-blue-500/40" />
                  <span className="text-[8px] md:text-[10px] font-black font-mono text-blue-300">{opponentPocketed.length}</span>
                </div>
                <div className="flex flex-col items-end min-w-0 flex-1">
                  <span className="text-[9px] md:text-xs font-bold text-amber-50 truncate">{opponent?.username || 'Waiting...'}</span>
                </div>
                <div className="w-5 h-5 md:w-8 md:h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-[8px] md:text-sm shadow shrink-0">👤</div>
              </div>

              {/* Quit button - always visible */}
              <button onClick={onQuitRoom} className="shrink-0 p-1.5 rounded-full bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 transition" aria-label="Quit game">
                <svg width={isMobile ? 12 : 16} height={isMobile ? 12 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>
                </svg>
              </button>

              {/* 3D Toggle button */}
              <button
                onClick={() => setUse3D(v => !v)}
                className={`shrink-0 p-1.5 rounded-full transition border ${use3D ? 'bg-amber-500/20 border-amber-400/30 text-amber-400' : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80'}`}
                title={use3D ? 'Switch to 2D' : 'Switch to 3D'}
              >
                <svg width={isMobile ? 12 : 14} height={isMobile ? 12 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              </button>

              {/* Casino View button */}
              <button
                onClick={() => setShowCasinoView(true)}
                className="shrink-0 p-1.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 transition"
                title="Casino Spectator View"
              >
                <svg width={isMobile ? 12 : 14} height={isMobile ? 12 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="14" rx="2" ry="2" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                  <line x1="9" y1="3" x2="9" y2="10" />
                  <line x1="15" y1="3" x2="15" y2="10" />
                </svg>
              </button>

              {/* Info/Sidebar toggle */}
              <button onClick={() => setShowSidebar(v => !v)}
                className={`shrink-0 p-1.5 rounded-full transition border ${showSidebar ? 'bg-amber-500/20 border-amber-400/30 text-amber-400' : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80'}`}
                aria-label="Toggle info panel"
              >
                <svg width={isMobile ? 12 : 14} height={isMobile ? 12 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </button>

              {/* Volume control */}
              <div className="relative shrink-0">
                <button onClick={toggleMute}
                  onMouseEnter={() => !isMobile && setShowVolumeSlider(true)}
                  onMouseLeave={() => !isMobile && setShowVolumeSlider(false)}
                  className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white/80 transition"
                  aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
                >
                  {isMuted ? <VolumeX size={isMobile ? 12 : 14} /> : <Volume2 size={isMobile ? 12 : 14} />}
                </button>
                {showVolumeSlider && !isMobile && (
                  <div className="absolute top-full right-0 mt-1 p-2 rounded-lg bg-[#1a1208] border border-amber-900/30 shadow-xl z-50"
                    onMouseEnter={() => setShowVolumeSlider(true)}
                    onMouseLeave={() => setShowVolumeSlider(false)}
                  >
                    <input type="range" min="0" max="100" value={Math.round(volume * 100)}
                      onChange={(e) => setVolume(Number(e.target.value) / 100)}
                      className="w-20 h-1 accent-amber-500 cursor-pointer"
                    />
                    <div className="text-[8px] text-amber-500 text-center mt-1 font-mono">{Math.round(volume * 100)}%</div>
                  </div>
                )}
              </div>

            </div>
      </header>

      {/* Main - PoolTable fills everything */}
      <div className="flex-1 flex overflow-hidden relative" role="main" aria-label={language === 'ar' ? 'طاولة اللعب' : 'Pool Table'}>
        {/* Mobile: Power Control — right-side vertical drag zone */}
        {isMobile && (
          <div className="flex-shrink-0 h-full z-30 flex items-center">
            <PowerControl
              isVisible={isMyTurn && frame.status === 'playing' && !isGameOver}
              disabled={!isMyTurn || frame.status !== 'playing'}
              onPowerChange={(p: number) => { tableRef.current?.setShotPower(p); }}
              onDragStateChange={(d: boolean) => { tableRef.current?.setIsPulling(d); }}
              onShoot={handleShootClick}
            />
          </div>
        )}
        <div className={`flex-1 relative ${showSidebar && isMobile ? 'hidden' : ''}`}>
          <CasinoAmbientParticles active={frame.status === 'playing'} />
          {use3D ? (
            <PoolTable3D ref={tableRef as React.Ref<any>}
              roomState={frame} onShoot={handleShoot} onResetCueBall={handleResetCueBall}
              myPlayerId={myPlayerObj?.id || ''} isMyTurn={isMyTurn}
              physicsFrames={physicsFrames} physicsTotalSteps={physicsTotalSteps} onClearFrames={() => setPhysicsFrames(null)}
              opponentAim={opponentAim} onPreviewAim={handlePreviewAim} onJoinAI={handleJoinAI}
            />
          ) : (
            <PoolTable ref={tableRef}
              roomState={frame} onShoot={handleShoot} onResetCueBall={handleResetCueBall}
              myPlayerId={myPlayerObj?.id || ''} isMyTurn={isMyTurn}
              physicsFrames={physicsFrames} physicsTotalSteps={physicsTotalSteps} onClearFrames={() => setPhysicsFrames(null)}
              opponentAim={opponentAim} onPreviewAim={handlePreviewAim} onJoinAI={handleJoinAI}
            />
          )}

          {/* Desktop: Power slider — overlaid left side */}
          {!isMobile && (
            <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20 flex items-start pointer-events-none">
              <div className="pointer-events-auto">
                <PowerControl
                  isVisible={true}
                  disabled={!isMyTurn || frame.status !== 'playing' || isGameOver}
                  onPowerChange={(p: number) => { tableRef.current?.setShotPower(p); }}
                  mode="desktop"
                />
              </div>
            </div>
          )}

          {/* AI summon centered overlay */}
          {frame.players.length === 1 && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
              <button onClick={() => handleJoinAI('medium')}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-black text-xs font-bold transition flex items-center gap-2 shadow-[0_0_25px_rgba(245,158,11,0.25)] hover:shadow-[0_0_35px_rgba(245,158,11,0.4)] border border-amber-400/20"
              ><Bot className="w-4 h-4" />Summon AI</button>
            </div>
          )}

          {/* "YOUR TURN" overlay */}
          {isMyTurn && frame.status === 'playing' && turnChanged && (
            <div className="absolute left-1/2 top-8 -translate-x-1/2 z-20 pointer-events-none">
              <div className="px-4 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/40 backdrop-blur-sm animate-pulse">
                <span className="text-xs font-black font-mono text-amber-300 tracking-widest">
                  {language === 'ar' ? 'دورك!' : 'YOUR TURN'}
                </span>
              </div>
            </div>
          )}

          {/* Ball group assignment display */}
          {mySide && (
            <div className="absolute top-2 left-2 z-10 pointer-events-none">
              <div className={`px-2 py-0.5 rounded-full text-[8px] font-bold font-mono ${
                mySide === 'solids'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              }`}>
                {mySide === 'solids' ? '● SOLIDS' : '◐ STRIPES'}
              </div>
            </div>
          )}

          {/* Foul notification toast */}
          {foulNotification && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
              <div className="px-4 py-2 rounded-xl bg-rose-900/80 border border-rose-500/40 backdrop-blur-sm shadow-lg shadow-rose-500/20">
                <span className="text-xs font-black font-mono text-rose-300 tracking-wider">
                  ⚠ {foulNotification}
                </span>
              </div>
            </div>
          )}

          {/* ── CALL POCKET DIALOG ──────────────────────────── */}
          {(showCallPocket || shouldCallPocket) && isMyTurn && frame.status === 'playing' && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="relative p-5 rounded-2xl border border-amber-500/40 bg-gradient-to-b from-[#1a1208] to-[#0d0806] shadow-[0_0_60px_rgba(245,158,11,0.2)] max-w-xs w-full mx-4 text-center">
                <div className="text-3xl mb-1">🎱</div>
                <div className="text-sm font-black font-mono text-amber-400 mb-1 tracking-wider">
                  {language === 'ar' ? 'حدد الحفرة!' : 'CALL YOUR POCKET!'}
                </div>
                <div className="text-[10px] font-mono text-amber-600 mb-4">
                  {language === 'ar' ? 'أين ستدخل الكرة الثامنة؟' : 'Where will the 8-ball drop?'}
                </div>
                {/* Table pocket layout — 2 rows of 3 */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  {[
                    { id: 0, label: language === 'ar' ? 'يسار أعلى' : 'Top Left' },
                    { id: 1, label: language === 'ar' ? 'وسط أعلى' : 'Top Center' },
                    { id: 2, label: language === 'ar' ? 'يمين أعلى' : 'Top Right' },
                    { id: 3, label: language === 'ar' ? 'يسار أسفل' : 'Bot Left' },
                    { id: 4, label: language === 'ar' ? 'وسط أسفل' : 'Bot Center' },
                    { id: 5, label: language === 'ar' ? 'يمين أسفل' : 'Bot Right' },
                  ].map(pocket => (
                    <button
                      key={pocket.id}
                      onClick={() => {
                        setCalledPocketId(pocket.id);
                        setShowCallPocket(false);
                        handleCallPocket(pocket.id);
                      }}
                      className="flex flex-col items-center gap-1 py-3 px-2 rounded-xl border border-amber-700/40 bg-black/50 hover:bg-amber-500/10 hover:border-amber-500/60 transition-all active:scale-95"
                    >
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-gray-800 to-black border-2 border-amber-600/50 flex items-center justify-center shadow-inner text-xs font-black text-amber-500">
                        {pocket.id + 1}
                      </div>
                      <span className="text-[8px] font-mono text-amber-600 leading-tight">{pocket.label}</span>
                    </button>
                  ))}
                </div>
                <div className="text-[8px] font-mono text-amber-800">
                  {language === 'ar' ? '⚠ اختيار الحفرة الخاطئة يعني الخسارة' : '⚠ Wrong pocket = instant loss'}
                </div>
              </div>
            </div>
          )}

          {/* Called pocket reminder badge */}
          {calledPocketId !== null && isMyTurn && frame.status === 'playing' && eightBallAlive && (
            <div className="absolute top-2 right-2 z-10 pointer-events-auto">
              <button
                onClick={() => { setCalledPocketId(null); setShowCallPocket(true); }}
                className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 hover:bg-amber-500/30 transition"
              >
                <span className="text-[8px] font-mono text-amber-400">🎱 Pocket #{calledPocketId + 1}</span>
                <span className="text-[7px] text-amber-600">{language === 'ar' ? '(تغيير)' : '(change)'}</span>
              </button>
            </div>
          )}

          {/* Spin control — bottom-right on desktop, bottom-center on mobile */}
          <div className={`${isMobile ? 'absolute bottom-2 left-1/2 -translate-x-1/2 z-20' : 'absolute bottom-1 right-1 md:bottom-3 md:right-3 z-10 origin-bottom-right'}`}>
            <SpinControl spinX={spinX} spinY={spinY} onChange={(x, y) => { setSpinX(x); setSpinY(y); }} disabled={!isMyTurn} isMobile={isMobile} />
          </div>
        </div>

        {/* Mobile: pocketed balls — safe zone rail, always visible, never overlays table */}
        {isMobile && (allPocketed.length > 0 || (frame.status !== 'waiting' && frame.status !== 'gameover')) && (
          <div className="flex-shrink-0 h-full z-10 flex items-stretch">
            <div className="flex flex-col items-center justify-end gap-0.5 py-4 px-1.5 bg-gradient-to-b from-[#2a1508] via-[#1a0a04] to-[#0d0501] border border-[#3a1a0a]/70 shadow-lg shadow-black/50 min-w-[40px]"
              style={{
                boxShadow: 'inset 3px 0 10px rgba(0,0,0,0.5), 0 0 0 1px rgba(180,120,60,0.08), 0 8px 24px rgba(0,0,0,0.6)',
                borderTopRightRadius: '0',
                borderBottomRightRadius: '0',
                maxHeight: '320px',
                borderLeft: 'none',
              }}
            >
              <div className="flex flex-col items-center gap-0.5 justify-end flex-1">
                {[...allPocketed].reverse().map((b, idx) => (
                  <div key={b.id}
                    className="transition-all duration-300"
                    style={{
                      animation: `fadeScaleIn 0.3s ease-out ${idx * 0.05}s both`,
                    }}
                  >
                    <BallIcon id={b.id} size={20} />
                  </div>
                ))}
              </div>
              {allPocketed.length === 0 && (
                <div className="flex flex-col items-center gap-1 py-1">
                  <div className="w-4 h-4 rounded-full border border-dashed border-amber-800/20" />
                  <span className="text-[4px] font-mono font-bold text-amber-800/30 tracking-[0.2em] uppercase">Pocketed</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Desktop: Pocketed Balls Panel — premium right rail, single column */}
        {!isMobile && (
          <div className="shrink-0 flex items-stretch ml-0 z-10 pointer-events-none">
            {(allPocketed.length > 0 || (frame.status !== 'waiting' && frame.status !== 'gameover')) && (
              <div className="flex flex-col items-center justify-end gap-1 py-5 px-2.5 rounded-r-2xl border-l-0 border border-[#3a1a0a]/80 bg-gradient-to-b from-[#2a1508] via-[#1a0a04] to-[#0d0501] shadow-lg shadow-black/50 min-w-[48px]"
                style={{
                  boxShadow: 'inset 3px 0 12px rgba(0,0,0,0.5), inset -1px 0 6px rgba(180,120,60,0.08), 5px 0 20px rgba(0,0,0,0.4)',
                  borderTopRightRadius: '14px',
                  borderBottomRightRadius: '14px',
                  maxHeight: '340px',
                }}
              >
                {/* Balls stack from bottom */}
                <div className="flex flex-col items-center gap-1 justify-end flex-1">
                  {[...allPocketed].reverse().map((b, idx) => (
                    <div key={b.id}
                      className="transition-all duration-300"
                      style={{
                        animation: `fadeScaleIn 0.3s ease-out ${idx * 0.06}s both`,
                      }}
                    >
                      <BallIcon id={b.id} size={22} />
                    </div>
                  ))}
                </div>
                {/* Empty state */}
                {allPocketed.length === 0 && (
                  <div className="flex flex-col items-center gap-1.5 py-2">
                    <div className="w-4 h-4 rounded-full border border-dashed border-amber-700/20" />
                    <span className="text-[5px] font-mono font-bold text-amber-700/30 tracking-[0.15em] uppercase">Pocketed</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Sidebar */}
        <AnimatePresence>
          {showSidebar && !isMobile && (
            <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: 280, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25 }} className="overflow-hidden shrink-0"
            >
              <SidePanel roomState={frame} userSession={userSession} language={language} activeEscrow={activeEscrow}
                chatMessage={chatMessage} setChatMessage={setChatMessage} handleSendChat={handleSendChat}
                handleJoinAI={handleJoinAI} chatRef={chatRef} onClose={() => setShowSidebar(false)} />
            </motion.aside>
          )}
          {showSidebar && isMobile && (
            <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="absolute inset-y-0 right-0 w-full max-w-sm z-30"
            >
              <SidePanel roomState={frame} userSession={userSession} language={language} activeEscrow={activeEscrow}
                chatMessage={chatMessage} setChatMessage={setChatMessage} handleSendChat={handleSendChat}
                handleJoinAI={handleJoinAI} chatRef={chatRef} onClose={() => setShowSidebar(false)} />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Game Over overlay with stats + rematch */}
      {isGameOver && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          role="dialog" aria-label="Game Over" aria-modal="true"
        >
          <motion.div initial={{ scale: 0.8, y: 30 }} animate={{ scale: 1, y: 0 }}
            className="relative p-6 rounded-2xl border-2 border-amber-500/30 bg-gradient-to-b from-[#1a1208] to-[#0d0806] shadow-[0_0_80px_rgba(245,158,11,0.12),0_0_0_1px_rgba(245,158,11,0.06)_inset] max-w-xs w-full mx-4 text-center"
          >
            {/* Gold trim corners */}
            <div className="absolute -top-px -left-px w-4 h-4 border-t-2 border-l-2 border-amber-400/40 rounded-tl" />
            <div className="absolute -top-px -right-px w-4 h-4 border-t-2 border-r-2 border-amber-400/40 rounded-tr" />
            <div className="absolute -bottom-px -left-px w-4 h-4 border-b-2 border-l-2 border-amber-400/40 rounded-bl" />
            <div className="absolute -bottom-px -right-px w-4 h-4 border-b-2 border-r-2 border-amber-400/40 rounded-br" />
            <div className={`text-3xl mb-2 ${isWinner ? '' : 'text-rose-400'}`}>
              {isWinner ? (
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto">
                  <circle cx="12" cy="8" r="5" fill="#f59e0b" fillOpacity="0.15" />
                  <path d="M12 2v1m0 10v1m5-6h1M6 8H5m3.5-3.5l.7.7m5.1-.7l-.7.7" stroke="#f59e0b" strokeWidth="1.2" />
                  <path d="M6 21c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#f59e0b" />
                  <path d="M8 21c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="#f59e0b" strokeOpacity="0.5" />
                  <path d="M16 17.5A8 8 0 0 0 8 21" stroke="#f59e0b" strokeOpacity="0.3" />
                  <path d="M9 13s1.5 2 3 2 3-2 3-2" stroke="#f59e0b" strokeWidth="1.2" />
                </svg>
              ) : (
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto">
                  <path d="M12 12L7 7m0 5l5-5" stroke="#f43f5e" strokeWidth="2" />
                  <circle cx="12" cy="12" r="9" stroke="#f43f5e" fill="#f43f5e" fillOpacity="0.08" />
                  <path d="M16 16l-4-4" stroke="#f43f5e" strokeOpacity="0.4" strokeWidth="1.5" />
                  <path d="M8 16l4-4" stroke="#f43f5e" strokeOpacity="0.4" strokeWidth="1.5" />
                </svg>
              )}
            </div>
            <div className={`text-xl font-black font-mono mb-1 ${isWinner ? 'text-amber-400' : 'text-rose-400'}`}>
              {isWinner ? (language === 'ar' ? 'فوز!' : 'YOU WIN!') : (language === 'ar' ? 'خسارة' : 'DEFEAT')}
            </div>
            {!isWinner && (
              <div className="text-xs font-mono text-amber-500/70 mb-3">{winnerName} {language === 'ar' ? 'فاز' : 'wins'}</div>
            )}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-black/50 rounded-lg border border-amber-900/30 p-2">
                <div className="text-[9px] text-amber-600 font-mono">{language === 'ar' ? 'كراتي' : 'My Pockets'}</div>
                <div className="text-lg font-black font-mono text-amber-300">{myPocketCount}</div>
              </div>
              <div className="bg-black/50 rounded-lg border border-amber-900/30 p-2">
                <div className="text-[9px] text-amber-600 font-mono">{language === 'ar' ? 'كرات الخصم' : 'Opponent'}</div>
                <div className="text-lg font-black font-mono text-blue-400">{oppPocketCount}</div>
              </div>
              {mySide && (
                <>
                  <div className="bg-black/50 rounded-lg border border-amber-900/30 p-2">
                    <div className="text-[9px] text-amber-600 font-mono">{language === 'ar' ? 'مجموعتي' : 'My Group'}</div>
                    <div className="text-sm font-black font-mono text-amber-300">{mySide === 'solids' ? 'SOLIDS' : 'STRIPES'}</div>
                  </div>
                  <div className="bg-black/50 rounded-lg border border-amber-900/30 p-2">
                    <div className="text-[9px] text-amber-600 font-mono">{language === 'ar' ? 'المتبقي' : 'Remaining'}</div>
                    <div className="text-sm font-black font-mono text-amber-300">{7 - myPocketCount}</div>
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={handleRematch}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-black text-xs font-black transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-1.5"
                autoFocus
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                {language === 'ar' ? 'إعادة' : 'REMATCH'}
              </button>
              <button onClick={onQuitRoom}
                className="flex-1 py-2.5 rounded-xl bg-black/60 border border-amber-900/40 hover:border-amber-700/60 text-amber-400 text-xs font-black transition flex items-center justify-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                {language === 'ar' ? 'خروج' : 'QUIT'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Casino Spectator Overlay */}
      {showCasinoView && (
        <CasinoSpectator onClose={() => setShowCasinoView(false)} balls={frame.balls} />
      )}

      {/* Pocket Celebration */}
      {celebrationIntensity > 0 && (
        <CasinoCelebration
          intensity={celebrationIntensity}
          onComplete={() => setCelebrationIntensity(0)}
        />
      )}

      {/* Win Celebration */}
      {winCelebration > 0 && (
        <CasinoCelebration
          intensity={winCelebration}
          onComplete={() => setWinCelebration(0)}
        />
      )}

      {/* Foul Flash */}
      {foulFlash && (
        <FoulFlash onComplete={() => setFoulFlash(false)} />
      )}
    </motion.div>
  );
}



