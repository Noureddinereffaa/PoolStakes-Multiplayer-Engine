import React, { useRef, useEffect, useState, useCallback } from 'react';
import { RoomState } from '../types';
import PoolTable from './PoolTable';
import { 
  Lock, MessageSquare, Send, Copy, Trophy, Maximize, Minimize, RotateCcw, Volume2, VolumeX, Settings, X, 
  ChevronLeft, ChevronRight, Smartphone, Monitor, Wifi, WifiOff, BatteryCharging, Battery
} from 'lucide-react';
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
  const gameContainerRef = useRef<HTMLDivElement | null>(null); // Main container for fullscreen
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [orientationLocked, setOrientationLocked] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false); // For mobile fullscreen
  const [showControlsOverlay, setShowControlsOverlay] = useState(false); // For mobile aiming controls
  const [overlayTimeout, setOverlayTimeout] = useState<NodeJS.Timeout | null>(null);

  // Determine if it's a mobile device (for responsive adjustments)
  useEffect(() => {
    const checkMobile = () => {
      const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
      setIsMobile(mobile);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    // Initial fullscreen on mount
    enterFullscreen(); 

    return () => {
      window.removeEventListener('resize', checkMobile);
      exitFullscreen(); // Exit fullscreen on unmount
    };
  }, []);

  // Scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [roomState?.log]);

  // Handle fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      const fs = document.fullscreenElement === gameContainerRef.current;
      setIsFullscreen(fs);
      if (!fs) { // If exiting fullscreen
        setOrientationLocked(false);
        screen.orientation?.unlock?.();
        setShowSidebar(false); // Hide sidebar if it was open
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Fullscreen logic
  const enterFullscreen = async () => {
    if (!gameContainerRef.current) return;
    try {
      await gameContainerRef.current.requestFullscreen();
      if (isMobile) {
        try {
          await screen.orientation?.lock('landscape-primary');
          setOrientationLocked(true);
        } catch (e) {
          console.log('Orientation lock not supported or failed:', e);
        }
      }
      setShowControlsOverlay(true); // Show initial controls overlay
      startOverlayTimeout();
    } catch (e) {
      console.error('Fullscreen failed:', e);
    }
  };

  const exitFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
      if (orientationLocked) {
        screen.orientation?.unlock?.();
        setOrientationLocked(false);
      }
      setShowControlsOverlay(false);
      if (overlayTimeout) clearTimeout(overlayTimeout);
    } catch (e) {
      console.error('Exit fullscreen failed:', e);
    }
  };

  const toggleFullscreen = () => {
    if (isFullscreen) exitFullscreen();
    else enterFullscreen();
  };

  // Overlay controls timeout (hide after a few seconds of inactivity)
  const startOverlayTimeout = useCallback(() => {
    if (overlayTimeout) clearTimeout(overlayTimeout);
    setOverlayTimeout(setTimeout(() => setShowControlsOverlay(false), 3000));
  }, [overlayTimeout]);

  const handleOverlayInteraction = useCallback(() => {
    setShowControlsOverlay(true);
    startOverlayTimeout();
  }, [startOverlayTimeout]);

  // Prevent body scroll in fullscreen
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [isFullscreen]);

  const onChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatMessage.trim()) {
      handleSendChat(chatMessage);
      setChatMessage('');
    }
  };

  const handleCopyRoomCode = () => {
    if (!roomState) return;
    navigator.clipboard.writeText(roomState.roomId).then(() => {
      // addToast('success', 'Room code copied!'); // Assuming addToast is available or passed down
    }).catch(err => {
      console.error('Failed to copy room code:', err);
      // addToast('error', 'Failed to copy room code.');
    });
  };

  const activeEscrow = roomState && roomState.status !== 'waiting' && roomState.status !== 'gameover' ? roomState.stake * 2 : 0;

  // Render loading state if roomState is null
  if (!roomState) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center min-h-[300px] gap-5 text-slate-100">
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

  // Fullscreen class management
  const fullscreenClass = isFullscreen ? 'fixed inset-0 z-50 bg-black flex flex-col items-center justify-center' : 'flex flex-col gap-5 w-full';
  const tableWrapperClass = isFullscreen 
    ? (isMobile ? 'w-full h-full landscape:h-screen landscape:w-auto landscape:max-w-none' : 'w-full h-full') + ' flex-1 flex items-center justify-center overflow-hidden'
    : 'lg:col-span-8 p-3 flex flex-col items-center justify-center';
  const sidebarClass = isFullscreen 
    ? `absolute top-0 right-0 h-full w-2/3 md:w-1/3 bg-slate-950/90 backdrop-blur-md shadow-lg transform transition-transform duration-300 ease-in-out ${showSidebar ? 'translate-x-0' : 'translate-x-full'} p-4 flex flex-col gap-4 z-50`
    : 'lg:col-span-4 flex flex-col gap-4';
  const headerClass = isFullscreen 
    ? 'absolute top-0 inset-x-0 bg-gradient-to-b from-black/80 to-transparent p-4 flex justify-between items-center z-50 text-white'
    : 'rounded-2xl border border-amber-800/40 bg-gradient-to-r from-[#1a0f0a] to-[#0d0806] px-5 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 relative overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)]';


  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: -20 }} 
      className={`relative w-full h-full ${fullscreenClass}`}
      ref={gameContainerRef}
      onPointerMove={isFullscreen ? handleOverlayInteraction : undefined}
      onClick={isFullscreen ? handleOverlayInteraction : undefined}
    >
      {/* Overlay Header / Controls */}
      <AnimatePresence>
      { (isFullscreen && showControlsOverlay) && (
        <motion.div 
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          transition={{ duration: 0.3 }}
          className={headerClass}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-lg shadow-lg">🎱</div>
            <span className="font-black text-amber-100 text-sm">{roomState.name}</span>
            <span className="text-[9px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/20 font-mono animate-pulse shadow-[0_0_10px_rgba(217,119,6,0.3)]">● LIVE</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onQuitRoom} className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs font-bold transition">🏳️ {language === 'ar' ? 'مغادرة' : 'Forfeit'}</button>
            <button onClick={toggleFullscreen} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition text-white">
              <Minimize className="w-4 h-4" />
            </button>
            {isMobile && (
              <button onClick={() => setShowSidebar(prev => !prev)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition text-white">
                <MessageSquare className="w-4 h-4" />
              </button>
            )}
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Main Game Content */}
      <div className={isFullscreen ? 'w-full h-full flex flex-col items-center justify-center' : 'grid grid-cols-1 lg:grid-cols-12 gap-5 items-start'}>
        {/* Pool Table Canvas */}
        <div className={tableWrapperClass}>
          <motion.div layout className="relative rounded-2xl border border-amber-900/30 bg-gradient-to-b from-[#0d0806] to-[#070503] shadow-[0_0_40px_rgba(0,0,0,0.6)]"
            style={{ 
              width: isFullscreen ? (isMobile ? 'auto' : '100%') : '100%', 
              height: isFullscreen ? (isMobile ? '100%' : 'auto') : 'auto', 
              maxWidth: isFullscreen ? (isMobile ? 'calc(100vh * 2)' : '100%') : '800px', // Landscape mobile fit
              maxHeight: isFullscreen ? (isMobile ? '100%' : 'calc(100vw * 0.5)') : 'auto',
              aspectRatio: '2 / 1' 
            }}
          >
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
             <AnimatePresence>
            { (isFullscreen && showControlsOverlay && !isMobile) && (
              <motion.button 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.5, duration: 0.3 }}
                onClick={toggleFullscreen} 
                className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition text-white z-50"
              >
                <Minimize className="w-5 h-5" />
              </motion.button>
            )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Sidebar / Chat / Player Info */}
        <AnimatePresence>
        { (!isFullscreen || (isMobile && showSidebar)) && (
          <motion.div 
            initial={isMobile && isFullscreen ? { x: '100%' } : { opacity: 0 }}
            animate={isMobile && isFullscreen ? { x: '0%' } : { opacity: 1 }}
            exit={isMobile && isFullscreen ? { x: '100%' } : { opacity: 0 }}
            transition={{ duration: 0.3 }}
            className={sidebarClass}
            style={isMobile && isFullscreen ? { position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: '350px' } : {}}
          >
            {isMobile && isFullscreen && (
              <button onClick={() => setShowSidebar(false)} className="absolute top-4 left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition text-white z-50">
                <X className="w-4 h-4" />
              </button>
            )}
            {/* Players */}
            <div className="rounded-2xl border border-amber-900/30 bg-gradient-to-b from-[#1a0f0a] to-[#0d0806] p-4 shadow-lg">
              <div className="text-[10px] text-amber-600 uppercase font-bold mb-3 tracking-wider font-mono">{language === 'ar' ? 'اللاعبون' : 'Players'}</div>
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
                  <div className="text-[10px] text-amber-500 mb-2 font-bold uppercase tracking-wider">{language === 'ar' ? 'في انتظار الخصم...' : 'Waiting for opponent…'}</div>
                  <p className="text-[11px] text-amber-600 mb-3">{language === 'ar' ? 'شارك الرمز:' : 'Share code:'} <span className="font-mono text-amber-400 font-bold bg-black/50 px-2 py-1 rounded border border-amber-900/30">
                    {roomState.roomId}
                    <button onClick={handleCopyRoomCode} className="ml-2 p-1 rounded-md bg-amber-700/30 hover:bg-amber-700/50 transition"><Copy className="w-3 h-3" /></button>
                  </span></p>
                  <div className="grid grid-cols-2 gap-2">
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleJoinAI('medium')} className="py-2 rounded-lg bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-black text-xs font-bold transition shadow-lg flex items-center justify-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5" /> {language === 'ar' ? 'استدعاء AI' : 'Summon AI'}
                    </motion.button>
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
                    <Lock className="w-3.5 h-3.5" /> {language === 'ar' ? 'صندوق الضمان الآمن' : 'Secure Escrow Vault'}
                  </span>
                  <span className="text-[9px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-bold border border-amber-500/30">Audited</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-black/50 p-2 rounded-lg border border-amber-900/30">
                    <div className="text-[10px] text-amber-600 uppercase tracking-wider mb-1">{language === 'ar' ? 'مقفل' : 'Locked'}</div>
                    <div className="font-black text-amber-100 font-mono">${activeEscrow.toFixed(2)}</div>
                  </div>
                  <div className="bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                    <div className="text-[10px] text-amber-500 uppercase tracking-wider mb-1">{language === 'ar' ? 'يفوز الرابح بـ' : 'Winner Gets'}</div>
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
                <span className="font-bold text-amber-300 uppercase tracking-wider font-mono">{language === 'ar' ? 'سجل المباراة' : 'Match Terminal'}</span>
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
          </motion.div>
        )}
        </AnimatePresence>
      </div>

      {/* Fullscreen Toggle (outside of header for non-fullscreen mode) */}
      {!isFullscreen && (
        <button 
          onClick={toggleFullscreen} 
          className="absolute bottom-4 right-4 p-3 rounded-full bg-emerald-700/80 hover:bg-emerald-600/80 transition text-white shadow-lg z-30"
          title={language === 'ar' ? 'تكبير الشاشة' : 'Enter Fullscreen'}
        >
          <Maximize className="w-5 h-5" />
        </button>
      )}

      {/* Mobile Controls Overlay (only in fullscreen mobile, shows on interaction) */}
      {isFullscreen && isMobile && showControlsOverlay && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-4 flex justify-around items-center z-50 text-white"
        >
          {/* Add compact controls here for mobile */}
          <button onClick={() => onQuitRoom()} className="p-3 rounded-full bg-red-700/80 hover:bg-red-600/80 transition"><X className="w-5 h-5" /></button>
          <button onClick={() => { /* aim left */ }} className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition"><ChevronLeft className="w-5 h-5" /></button>
          <button onClick={() => { /* aim right */ }} className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition"><ChevronRight className="w-5 h-5" /></button>
          <button onClick={() => { /* shoot */ }} className="p-3 rounded-full bg-emerald-700/80 hover:bg-emerald-600/80 transition"><Trophy className="w-5 h-5" /></button>
        </motion.div>
      )}
    </motion.div>
  );
}
