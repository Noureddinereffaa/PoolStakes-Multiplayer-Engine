import React, { useRef, useEffect } from 'react';
import { RoomState } from '../types';
import { MessageSquare, Send, Lock, Trophy, Copy, Bot, ArrowRight } from 'lucide-react';
import PoolTable from './PoolTable';

interface GameRoomProps {
  roomState: RoomState;
  myUsername: string;
  language: 'en' | 'ar';
  physicsFrames: Array<Array<{ id: number; x: number; y: number; isPocketed: boolean }>> | null;
  opponentAim: { angle: number; power: number; spinX?: number; spinY?: number } | null;
  chatMessage: string;
  onChatChange: (v: string) => void;
  onShoot: (angle: number, power: number, spinX: number, spinY: number) => void;
  onResetCueBall: (x: number, y: number) => void;
  onClearFrames: () => void;
  onPreviewAim: (angle: number, power: number, spinX: number, spinY: number) => void;
  onJoinAI: (difficulty?: 'easy' | 'medium' | 'hard') => void;
  onSendChat: (e: React.FormEvent) => void;
  onQuit: () => void;
  onCopyCode: () => void;
  onReturnToDashboard: () => void;
}

export default function GameRoom({
  roomState, myUsername, language, physicsFrames, opponentAim,
  chatMessage, onChatChange, onShoot, onResetCueBall, onClearFrames,
  onPreviewAim, onJoinAI, onSendChat, onQuit, onCopyCode, onReturnToDashboard,
}: GameRoomProps) {
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const isAr = language === 'ar';

  const myPlayer = roomState.players.find(p => p.username === myUsername);
  const isMyTurn = !!(roomState.status === 'playing' && myPlayer && roomState.currentTurn === myPlayer.id);
  const activeEscrow = roomState.status !== 'waiting' && roomState.status !== 'gameover' ? roomState.stake * 2 : 0;

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [roomState.log]);

  // ── Victory / Defeat overlay ───────────────────────────────────────────────
  if (roomState.status === 'gameover') {
    const isWinner = roomState.winnerId === myPlayer?.id;
    const winnerName = roomState.players.find(p => p.id === roomState.winnerId)?.username ?? '—';
    const prize = (roomState.stake * 2 * 0.95).toFixed(2);

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm">
        <div className="relative w-full max-w-md mx-4 rounded-3xl border overflow-hidden shadow-2xl
          bg-[#0d0d14]"
          style={{ borderColor: isWinner ? 'rgba(52,211,153,0.3)' : 'rgba(239,68,68,0.2)' }}
        >
          {/* top accent bar */}
          <div className={`h-1 w-full ${isWinner ? 'bg-gradient-to-r from-emerald-400 to-cyan-400' : 'bg-gradient-to-r from-red-500 to-orange-500'}`} />

          <div className="p-8 text-center">
            <div className="text-6xl mb-4">{isWinner ? '🏆' : '💀'}</div>

            <div className={`text-3xl font-black mb-2 ${isWinner ? 'text-emerald-400' : 'text-red-400'}`}>
              {isWinner
                ? (isAr ? 'فزت!' : 'Victory!')
                : (isAr ? 'هُزمت' : 'Defeated')}
            </div>

            <div className="text-sm text-slate-400 mb-6">
              {isWinner
                ? (isAr ? `حصلت على $${prize} USDT` : `You won $${prize} USDT`)
                : (isAr ? `فاز ${winnerName}` : `${winnerName} wins`)}
            </div>

            {/* stats row */}
            <div className="grid grid-cols-2 gap-3 mb-8">
              <div className="p-3 rounded-xl bg-white/4 border border-white/8">
                <div className="text-[10px] text-slate-500 mb-1">{isAr ? 'الرهان' : 'Stake'}</div>
                <div className="text-sm font-black text-white font-mono">${roomState.stake}</div>
              </div>
              <div className="p-3 rounded-xl bg-white/4 border border-white/8">
                <div className="text-[10px] text-slate-500 mb-1">{isAr ? 'المكافأة' : 'Prize'}</div>
                <div className={`text-sm font-black font-mono ${isWinner ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {isWinner ? `+$${prize}` : `-$${roomState.stake}`}
                </div>
              </div>
            </div>

            {roomState.escrowHash && (
              <div className="mb-6 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15 text-left">
                <div className="text-[9px] text-emerald-500 mb-1 font-mono">SHA-256 INTEGRITY HASH</div>
                <div className="text-[8.5px] font-mono text-emerald-400/70 truncate select-all">{roomState.escrowHash}</div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onReturnToDashboard}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black transition flex items-center justify-center gap-2"
              >
                {isAr ? 'العودة للوحة' : 'Back to Dashboard'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Waiting overlay (1 player seated, no opponent yet) ─────────────────────
  if (roomState.status === 'waiting' && roomState.players.length === 1) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-sm mx-4 rounded-3xl border border-white/8 bg-[#12121a] p-8 text-center shadow-2xl">
          {/* animated pulse ring */}
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-2 border-indigo-500/30 animate-ping" />
            <div className="absolute inset-2 rounded-full border-2 border-indigo-500/20 animate-ping [animation-delay:200ms]" />
            <div className="w-20 h-20 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-3xl relative">
              🎱
            </div>
          </div>

          <div className="text-lg font-black text-white mb-1">
            {isAr ? 'انتظار الخصم' : 'Waiting for Opponent'}
          </div>
          <div className="text-xs text-slate-500 mb-6">
            {isAr ? 'شارك الرمز ليدخل صديقك أو استدعِ بوتاً' : 'Share the room code or summon a bot to start'}
          </div>

          {/* Room code */}
          <div className="mb-6 p-3 rounded-xl bg-white/3 border border-white/8">
            <div className="text-[10px] text-slate-500 mb-1">{isAr ? 'رمز الغرفة' : 'ROOM CODE'}</div>
            <div className="text-sm font-mono text-emerald-300 font-bold truncate">{roomState.roomId}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onCopyCode}
              className="py-2.5 rounded-xl border border-white/10 bg-white/3 hover:bg-white/8 text-slate-200 text-sm font-bold transition flex items-center justify-center gap-2"
            >
              <Copy className="w-3.5 h-3.5" />
              {isAr ? 'نسخ الرمز' : 'Copy Code'}
            </button>
            <button
              onClick={() => onJoinAI('medium')}
              className="py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition flex items-center justify-center gap-2"
            >
              <Bot className="w-3.5 h-3.5" />
              {isAr ? 'استدعاء بوت' : 'Summon Bot'}
            </button>
          </div>

          <button
            onClick={onQuit}
            className="mt-4 w-full py-2.5 rounded-xl border border-red-500/15 text-red-400 hover:bg-red-500/8 text-xs font-bold transition"
          >
            {isAr ? 'إلغاء والخروج' : 'Cancel & Exit'}
          </button>
        </div>
      </div>
    );
  }

  // ── Active game ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {/* HUD banner */}
      <div className="rounded-2xl border border-white/8 bg-[#12121a] px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-emerald-500 to-cyan-500" />
        <div className="flex items-center gap-3">
          <span className="text-lg">🎱</span>
          <div>
            <div className="font-black text-white text-sm">{isAr ? 'مباراة مباشرة' : 'LIVE MATCH'}</div>
            <div className="text-xs text-slate-500 font-mono truncate max-w-[180px]">{roomState.name}</div>
          </div>
          <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono animate-pulse">● LIVE</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-[9px] text-slate-500 uppercase">{isAr ? 'الجائزة' : 'Prize'}</div>
            <div className="font-black text-emerald-400 font-mono text-sm">${(roomState.stake * 2 * 0.95).toFixed(2)}</div>
          </div>
          <div className="text-center">
            <div className="text-[9px] text-slate-500 uppercase">{isAr ? 'الرهان' : 'Stake'}</div>
            <div className="font-black text-amber-400 font-mono text-sm">${roomState.stake}</div>
          </div>
          {roomState.turnTimer !== undefined && roomState.status === 'playing' && (
            <div className="text-center">
              <div className="text-[9px] text-slate-500 uppercase">{isAr ? 'الوقت' : 'Time'}</div>
              <div className={`font-black font-mono text-sm ${roomState.turnTimer <= 10 ? 'text-red-400 animate-pulse' : 'text-slate-300'}`}>
                {roomState.turnTimer}s
              </div>
            </div>
          )}
          <button
            onClick={onQuit}
            className="px-3 py-1.5 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 hover:text-red-300 text-xs font-bold transition"
          >
            🏳️ {isAr ? 'استسلام' : 'Forfeit'}
          </button>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Canvas */}
        <div className="lg:col-span-8 rounded-2xl border border-white/8 bg-[#0d0d14] p-2 sm:p-3 flex flex-col items-center justify-center shadow-2xl overflow-hidden">
          <PoolTable
            roomState={roomState}
            onShoot={onShoot}
            onResetCueBall={onResetCueBall}
            myPlayerId={myPlayer?.id ?? ''}
            isMyTurn={isMyTurn}
            physicsFrames={physicsFrames}
            onClearFrames={onClearFrames}
            opponentAim={opponentAim}
            onPreviewAim={onPreviewAim}
            onJoinAI={onJoinAI}
          />
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          {/* Players */}
          <div className="rounded-2xl border border-white/8 bg-[#12121a] p-4">
            <div className="text-[10px] text-slate-500 uppercase font-bold mb-3">{isAr ? 'اللاعبون' : 'Players'}</div>
            <div className="space-y-2">
              {roomState.players.map((p, i) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition ${
                    p.username === myUsername ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-slate-500 font-mono shrink-0">#{i + 1}</span>
                    <span className="text-sm font-semibold text-slate-200 truncate">{p.username}</span>
                    {p.username.startsWith('Bot_') && (
                      <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1.5 rounded border border-amber-500/20 shrink-0">BOT</span>
                    )}
                    {p.side && (
                      <span className={`text-[9px] px-1.5 rounded font-black shrink-0 ${p.side === 'solids' ? 'bg-amber-400 text-slate-950' : 'bg-blue-500 text-white'}`}>
                        {p.side}
                      </span>
                    )}
                    {roomState.currentTurn === p.id && roomState.status === 'playing' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    )}
                  </div>
                  <span className="text-xs font-mono font-black text-emerald-400 shrink-0">${p.walletBalance.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Escrow */}
          {activeEscrow > 0 && (
            <div className="rounded-2xl border border-emerald-500/15 bg-[#12121a] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-emerald-400 font-bold flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" /> {isAr ? 'ضمان مؤمّن' : 'Secure Escrow'}
                </span>
                <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">{isAr ? 'مدقق' : 'Audited'}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] text-slate-500">{isAr ? 'محجوز' : 'Locked'}</div>
                  <div className="font-black text-white font-mono text-sm">${activeEscrow.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">{isAr ? 'للفائز' : 'Winner Gets'}</div>
                  <div className="font-black text-emerald-400 font-mono text-sm">${(activeEscrow * 0.95).toFixed(2)}</div>
                </div>
              </div>
              {roomState.escrowHash && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <div className="text-[9px] text-slate-500 mb-1">SHA-256</div>
                  <div className="text-[9px] font-mono text-emerald-400/80 bg-[#0a0a0f] p-2 rounded border border-white/5 truncate select-all">
                    {roomState.escrowHash}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Chat / Log */}
          <div className="rounded-2xl border border-white/8 bg-[#12121a] p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-bold text-slate-300">{isAr ? 'سجل المباراة' : 'Match Log'}</span>
            </div>
            <div
              ref={chatScrollRef}
              className="bg-[#0a0a0f] rounded-xl p-2.5 border border-white/5 h-36 overflow-y-auto space-y-1"
            >
              {roomState.log.map((line, idx) => (
                <div
                  key={idx}
                  className={`text-[10px] leading-relaxed break-words font-mono ${
                    !line.includes(':') ? 'text-amber-400/80 italic' : 'text-slate-400'
                  }`}
                >
                  {line}
                </div>
              ))}
            </div>
            <form onSubmit={onSendChat} className="flex gap-2">
              <input
                type="text"
                value={chatMessage}
                onChange={e => onChatChange(e.target.value)}
                placeholder={isAr ? 'رسالة…' : 'Message…'}
                className="flex-1 bg-[#0a0a0f] border border-white/8 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition"
              />
              <button type="submit" className="p-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition">
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
