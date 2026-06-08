import React, { useRef, useEffect } from 'react';
import { RoomState } from '../types';
import PoolTable from './PoolTable';
import { Lock, MessageSquare, Send, Copy, Trophy } from 'lucide-react';
import { ProvablyFairVerify } from './ProvablyFairVerify';
import { motion, AnimatePresence } from 'framer-motion';

interface ArenaPageProps {
  roomState: RoomState | null;
  userSession: any;
  language: 'en' | 'ar';
  onQuitRoom: () => void;
  myPlayerObj: any;
  isMyTurn: boolean;
  physicsFrames: any;
  setPhysicsFrames: (f: any) => void;
  handleShoot: any;
  handleResetCueBall: any;
  opponentAim: any;
  handlePreviewAim: any;
  handleJoinAI: any;
  chatMessage: string;
  setChatMessage: (msg: string) => void;
  handleSendChat: (msg: string) => void;
}

export default function ArenaPage({
  roomState,
  userSession,
  language,
  onQuitRoom,
  myPlayerObj,
  isMyTurn,
  physicsFrames,
  setPhysicsFrames,
  handleShoot,
  handleResetCueBall,
  opponentAim,
  handlePreviewAim,
  handleJoinAI,
  chatMessage,
  setChatMessage,
  handleSendChat
}: ArenaPageProps) {
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [roomState?.log]);

  const onChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatMessage.trim()) {
      handleSendChat(chatMessage);
      setChatMessage('');
    }
  };

  const handleCopyRoomCode = () => {
    if (!roomState) return;
    navigator.clipboard.writeText(roomState.roomId).catch(() => {});
  };

  const activeEscrow = roomState && roomState.status !== 'waiting' && roomState.status !== 'gameover' ? roomState.stake * 2 : 0;

  if (!roomState) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center min-h-[300px] gap-5">
        <div className="text-amber-400 animate-pulse text-lg font-mono font-bold flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping" />
          {language === 'ar' ? 'جاري الاتصال بالخادم والتحقق من الرهان...' : 'Authenticating stake and connecting to arena...'}
        </div>
        <button onClick={onQuitRoom} className="px-6 py-3 rounded-xl bg-amber-950 hover:bg-amber-900 border border-amber-800 text-amber-300 font-black transition">
          {language === 'ar' ? 'إلغاء والعودة' : 'Cancel & Return'}
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="flex flex-col gap-5 w-full">
      {/* ── Match HUD Banner — Casino Gold ── */}
      <div className="rounded-2xl border border-amber-800/40 bg-gradient-to-r from-[#1a0f0a] to-[#0d0806] px-5 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 relative overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)]">
        <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-amber-500 via-amber-300 to-amber-500" />
        <div className="absolute bottom-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-amber-800/30 to-transparent" />
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <span className="text-lg">🎱</span>
          </div>
          <div>
            <div className="font-black text-amber-100 text-sm flex items-center gap-2">
              {language === 'ar' ? 'مباراة نشطة' : 'LIVE MATCH'}
              <span className="text-[9px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/20 font-mono animate-pulse shadow-[0_0_10px_rgba(217,119,6,0.3)]">● LIVE</span>
            </div>
            <div className="text-xs text-amber-600/80 font-mono">{roomState.name}</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-[9px] text-amber-600 uppercase tracking-wider font-mono">Prize Pool</div>
            <div className="font-black text-amber-400 font-mono text-base drop-shadow-[0_0_8px_rgba(217,119,6,0.3)]">${(roomState.stake * 2 * 0.95).toFixed(2)}</div>
          </div>
          <div className="text-center">
            <div className="text-[9px] text-amber-600 uppercase tracking-wider font-mono">Stake Each</div>
            <div className="font-black text-amber-300 font-mono text-base">${roomState.stake}</div>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onQuitRoom}
            className="px-4 py-2 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 text-xs font-bold transition"
          >
            🏳️ {language === 'ar' ? 'مغادرة' : 'Forfeit'}
          </motion.button>
        </div>
      </div>

      {/* ── Two-column game view ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Canvas board */}
        <motion.div layout className="lg:col-span-8 rounded-2xl border border-amber-900/30 bg-gradient-to-b from-[#0d0806] to-[#070503] p-3 flex flex-col items-center justify-center shadow-[0_0_40px_rgba(0,0,0,0.6)] relative">
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-amber-700/30 to-transparent pointer-events-none" />
          <PoolTable
            roomState={roomState}
            onShoot={handleShoot}
            onResetCueBall={handleResetCueBall}
            myPlayerId={myPlayerObj?.id || ''}
            isMyTurn={isMyTurn}
            physicsFrames={physicsFrames}
            onClearFrames={() => setPhysicsFrames(null)}
            opponentAim={opponentAim}
            onPreviewAim={handlePreviewAim}
            onJoinAI={handleJoinAI}
          />
        </motion.div>

        {/* Right sidebar — Casino Gold */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Players */}
          <div className="rounded-2xl border border-amber-900/30 bg-gradient-to-b from-[#1a0f0a] to-[#0d0806] p-4 shadow-lg">
            <div className="text-[10px] text-amber-600 uppercase font-bold mb-3 tracking-wider font-mono">Players</div>
            <div className="space-y-2">
              <AnimatePresence>
                {roomState.players.map((p: any, i: number) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all duration-300 ${p.username === userSession!.username ? 'border-amber-500/40 bg-amber-500/10 shadow-[0_0_15px_rgba(217,119,6,0.15)]' : 'border-amber-900/20 bg-black/30'}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-amber-700 font-mono shrink-0">#{i + 1}</span>
                      <span className="text-sm font-bold text-amber-200 truncate">{p.username}</span>
                      {p.username.startsWith('Bot_') && <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/30 shrink-0 font-bold">BOT</span>}
                      {p.side && <span className={`text-[9px] px-1.5 py-0.5 rounded font-black shrink-0 ${p.side === 'solids' ? 'bg-amber-400 text-amber-950' : 'bg-blue-600 text-white'}`}>{p.side}</span>}
                      {roomState.currentTurn === p.id && roomState.status === 'playing' && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0 shadow-[0_0_8px_rgba(217,119,6,0.8)]" />}
                    </div>
                    <span className="text-xs font-mono font-black text-amber-400 shrink-0">${p.walletBalance.toFixed(2)}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {roomState.players.length === 1 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
                <div className="text-[10px] text-amber-500 mb-2 font-bold uppercase tracking-wider">Waiting for opponent…</div>
                <p className="text-[11px] text-amber-600 mb-3">Share code: <span className="font-mono text-amber-400 font-bold bg-black/50 px-2 py-1 rounded border border-amber-900/30">{roomState.roomId}</span></p>
                <div className="grid grid-cols-2 gap-2">
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleCopyRoomCode} className="py-2 rounded-lg border border-amber-900/30 bg-black/30 text-amber-400 text-xs font-bold hover:bg-amber-900/20 transition flex items-center justify-center gap-1.5"><Copy className="w-3 h-3" /> Copy Code</motion.button>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleJoinAI('medium')} className="py-2 rounded-lg bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-black text-xs font-bold transition shadow-lg">Summon AI</motion.button>
                </div>
              </motion.div>
            )}
          </div>

          {/* Escrow — Gold Vault */}
          {activeEscrow > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-amber-500/30 bg-gradient-to-b from-[#1a0f0a] to-[#0d0806] p-4 shadow-[0_0_20px_rgba(217,119,6,0.05)] relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-amber-300 to-amber-500 opacity-50" />
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-amber-400 font-bold flex items-center gap-1.5 uppercase tracking-wider">
                  <Lock className="w-3.5 h-3.5" /> Secure Escrow Vault
                </span>
                <span className="text-[9px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-bold border border-amber-500/30">Audited</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-black/50 p-2 rounded-lg border border-amber-900/30">
                  <div className="text-[10px] text-amber-600 uppercase tracking-wider mb-1">Locked</div>
                  <div className="font-black text-amber-100 font-mono">${activeEscrow.toFixed(2)}</div>
                </div>
                <div className="bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                  <div className="text-[10px] text-amber-500 uppercase tracking-wider mb-1">Winner Gets</div>
                  <div className="font-black text-amber-400 font-mono drop-shadow-[0_0_6px_rgba(217,119,6,0.3)]">${(activeEscrow * 0.95).toFixed(2)}</div>
                </div>
              </div>
              {roomState.escrowHash && (
                <div className="mt-3 pt-3 border-t border-amber-900/30">
                  <div className="text-[9px] text-amber-600 mb-1 uppercase tracking-wider font-mono">SHA-256 Integrity Hash</div>
                  <div className="text-[9px] font-mono text-amber-400 bg-black/60 p-2 rounded-lg border border-amber-900/30 truncate select-all">{roomState.escrowHash}</div>
                  {roomState.status === 'gameover' && roomState.serverSeed && (
                    <ProvablyFairVerify hash={roomState.escrowHash} seed={roomState.serverSeed} />
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* Chat / Log — Gold Terminal */}
          <div className="rounded-2xl border border-amber-900/30 bg-gradient-to-b from-[#1a0f0a] to-[#0d0806] p-4 flex flex-col gap-3 shadow-lg flex-1 min-h-[250px]">
            <div className="flex items-center gap-2 text-xs">
              <MessageSquare className="w-4 h-4 text-amber-400" />
              <span className="font-bold text-amber-300 uppercase tracking-wider font-mono">Match Terminal</span>
            </div>
            <div ref={chatScrollRef} className="flex-1 bg-[#050302] rounded-xl p-3 border border-amber-900/20 overflow-y-auto space-y-1.5 shadow-inner">
              {roomState.log.map((line: string, idx: number) => (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} key={idx} className={`text-[11px] leading-relaxed break-words font-mono ${!line.includes(':') ? 'text-amber-500/90 italic' : line.includes('PROVABLY') ? 'text-amber-400 font-bold' : 'text-amber-600/80'}`}>{line}</motion.div>
              ))}
            </div>
            <form onSubmit={onChatSubmit} className="flex gap-2 mt-auto pt-2">
              <input
                type="text" value={chatMessage} onChange={e => setChatMessage(e.target.value)}
                placeholder={language === 'ar' ? 'رسالة…' : 'Type a message...'}
                className="flex-1 bg-[#050302] border border-amber-900/30 rounded-xl px-4 py-2.5 text-xs text-amber-200 placeholder-amber-800 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition shadow-inner"
              />
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} type="submit" className="p-2.5 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 hover:from-amber-500 hover:to-amber-300 text-black transition shadow-lg">
                <Send className="w-4 h-4" />
              </motion.button>
            </form>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
