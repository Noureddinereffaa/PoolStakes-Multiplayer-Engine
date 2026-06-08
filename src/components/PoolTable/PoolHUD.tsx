import React from 'react';
import { RoomState } from '../../types';
import { RotateCcw, Bot, Lock, Unlock } from 'lucide-react';

export const standardBallsList = [
  { id: 1, number: 1, type: 'solid', color: '#CFAF30', nameAr: 'الصفراء المصمتة', nameEn: 'Yellow Solid' },
  { id: 2, number: 2, type: 'solid', color: '#1B4CA7', nameAr: 'الزرقاء المصمتة', nameEn: 'Blue Solid' },
  { id: 3, number: 3, type: 'solid', color: '#B12724', nameAr: 'الحمراء المصمتة', nameEn: 'Red Solid' },
  { id: 4, number: 4, type: 'solid', color: '#5F3E9C', nameAr: 'البنفسجية المصمتة', nameEn: 'Purple Solid' },
  { id: 5, number: 5, type: 'solid', color: '#C86414', nameAr: 'البرتقالية المصمتة', nameEn: 'Orange Solid' },
  { id: 6, number: 6, type: 'solid', color: '#0F7B4D', nameAr: 'الخضراء المصمتة', nameEn: 'Green Solid' },
  { id: 7, number: 7, type: 'solid', color: '#7A1E2A', nameAr: 'العنابية المصمتة', nameEn: 'Maroon Solid' },
  { id: 8, number: 8, type: 'black', color: '#111111', nameAr: 'السوداء 8', nameEn: 'Black 8-Ball' },
  { id: 9, number: 9, type: 'stripe', color: '#D7B037', nameAr: 'الصفراء المخططة', nameEn: 'Yellow Stripe' },
  { id: 10, number: 10, type: 'stripe', color: '#4A76C8', nameAr: 'الزرقاء المخططة', nameEn: 'Blue Stripe' },
  { id: 11, number: 11, type: 'stripe', color: '#D45851', nameAr: 'الحمراء المخططة', nameEn: 'Red Stripe' },
  { id: 12, number: 12, type: 'stripe', color: '#9D6FD1', nameAr: 'البنفسجية المخططة', nameEn: 'Purple Stripe' },
  { id: 13, number: 13, type: 'stripe', color: '#D28D3E', nameAr: 'البرتقالية المخططة', nameEn: 'Orange Stripe' },
  { id: 14, number: 14, type: 'stripe', color: '#3CA972', nameAr: 'الخضراء المخططة', nameEn: 'Green Stripe' },
  { id: 15, number: 15, type: 'stripe', color: '#8A1A24', nameAr: 'العنابية المخططة', nameEn: 'Maroon Stripe' },
];

export interface PoolHUDProps {
  roomState: RoomState;
  myPlayerId: string;
  isMyTurn: boolean;
  isAnimating: boolean;
  spinX: number;
  setSpinX: (val: number) => void;
  spinY: number;
  setSpinY: (val: number) => void;
  onJoinAI?: (difficulty?: 'easy' | 'medium' | 'hard') => void;
  isScratchPlacing: boolean;
  isPlacementInvalid: boolean;
  placementErrorMessage: string | null;
  handleConfirmPlacement: () => void;
  isAimLocked: boolean;
  setIsAimLocked: (val: boolean) => void;
}

export default function PoolHUD({
  roomState,
  myPlayerId,
  isMyTurn,
  isAnimating,
  spinX,
  setSpinX,
  spinY,
  setSpinY,
  onJoinAI,
  isScratchPlacing,
  isPlacementInvalid,
  placementErrorMessage,
  handleConfirmPlacement,
  isAimLocked,
  setIsAimLocked,
}: PoolHUDProps) {

  const renderBallBadge = (ball: typeof standardBallsList[0], size: 'sm' | 'md' = 'sm') => {
    const isPocketed = roomState.balls.find((b) => b.id === ball.id)?.isPocketed ?? false;
    const sz = size === 'md' ? 'w-8 h-8' : 'w-7 h-7 sm:w-8 sm:h-8';
    const numSz = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5 sm:w-4 sm:h-4';
    const numFont = size === 'md' ? 'text-[9px]' : 'text-[7.5px] sm:text-[8.5px]';
    return (
      <div
        key={ball.id}
        className="relative flex flex-col items-center group cursor-help"
        title={`${ball.nameEn} - ${isPocketed ? 'Pocketed' : 'On Table'}`}
      >
        <div
          className={`${sz} rounded-full flex items-center justify-center relative transition-all duration-300 hover:scale-110 select-none overflow-hidden ${
            isPocketed ? 'opacity-20 grayscale scale-90' : 'opacity-100'
          }`}
          style={{
            background: ball.type === 'stripe'
              ? `linear-gradient(135deg, #ffffff 18%, ${ball.color} 18%, ${ball.color} 82%, #fafaf9 82%)`
              : `radial-gradient(circle at 30% 30%, ${ball.color} 30%, #000000 120%)`,
            boxShadow: isPocketed
              ? 'none'
              : 'inset -2px -2px 6px rgba(0,0,0,0.65), 0 3px 6px rgba(0,0,0,0.45)',
          }}
        >
          {ball.type === 'stripe' && !isPocketed && (
            <div className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25) 0%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.55) 100%)',
              }}
            />
          )}
          {!isPocketed && (
            <div className="absolute inset-0 rounded-full border border-yellow-500/20 pointer-events-none" />
          )}
          {!isPocketed && (
            <div className="absolute top-0.5 left-1 w-2 h-1 bg-white/45 rounded-full rotate-[-15deg] pointer-events-none" />
          )}
          <div className={`${numSz} rounded-full bg-[#fffaeb] border border-yellow-600/30 flex items-center justify-center shadow-xs z-10`}>
            <span className={`${numFont} font-black text-slate-900 font-mono leading-none`}>
              {ball.number}
            </span>
          </div>
          {isPocketed && (
            <div className="absolute inset-0 rounded-full bg-slate-950/45 flex items-center justify-center font-bold text-emerald-400 text-xs z-20">
              ✓
            </div>
          )}
        </div>
      </div>
    );
  };

  const myPlayerObjMatched = roomState.players.find((p) => p.id === myPlayerId);
  const mySideMatched = myPlayerObjMatched?.side;
  const opponentObjMatched = roomState.players.find((p) => p.id !== myPlayerId);
  const opponentSideMatched = opponentObjMatched?.side;

  const pocketedSolidsMatched = standardBallsList.filter(ball => {
    const tableBall = roomState.balls.find(b => b.id === ball.id);
    return tableBall && tableBall.isPocketed && ball.type === 'solid';
  });
  const pocketedStripesMatched = standardBallsList.filter(ball => {
    const tableBall = roomState.balls.find(b => b.id === ball.id);
    return tableBall && tableBall.isPocketed && ball.type === 'stripe';
  });

  let myPocketedMatched: typeof standardBallsList = [];
  let opponentPocketedMatched: typeof standardBallsList = [];

  if (mySideMatched === 'solids') {
    myPocketedMatched = pocketedSolidsMatched;
    opponentPocketedMatched = pocketedStripesMatched;
  } else if (mySideMatched === 'stripes') {
    myPocketedMatched = pocketedStripesMatched;
    opponentPocketedMatched = pocketedSolidsMatched;
  } else {
    myPocketedMatched = pocketedSolidsMatched;
    opponentPocketedMatched = pocketedStripesMatched;
  }

  const timerVal = roomState.turnTimer ?? 60;
  const timerPercentage = (timerVal / 60) * 100;

  let timerColorClass = "bg-emerald-500 shadow-[0_0_8px_#10b981]";
  let timerTextClass = "text-emerald-400";
  if (timerVal <= 10) {
    timerColorClass = "bg-rose-500 animate-pulse shadow-[0_0_12px_#ef4444]";
    timerTextClass = "text-rose-400 font-extrabold animate-pulse";
  } else if (timerVal <= 20) {
    timerColorClass = "bg-amber-500 shadow-[0_0_8px_#f59e0b]";
    timerTextClass = "text-amber-400";
  }

  const pocketedList = standardBallsList.filter(ball => {
    const tableBall = roomState.balls.find(b => b.id === ball.id);
    return tableBall && tableBall.isPocketed;
  }).sort((a, b) => a.id - b.id);

  return (
    <div className="w-full flex flex-col gap-4">
      {/* 1. Header Players & Spin Selector — Casino Gold/Black */}
      <div className="w-full bg-gradient-to-b from-[#1a0f0a] to-[#0d0806] border border-amber-900/50 rounded-xl p-3 flex flex-col md:flex-row items-center justify-between gap-4 shadow-[0_0_20px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(217,119,6,0.15)]">
        {/* Left: Player Profile */}
        <div className={`px-4 py-2 rounded-lg border flex items-center gap-4 transition-all ${
          isMyTurn
            ? 'bg-amber-500/[0.04] border-amber-500/35 shadow-[0_0_15px_rgba(217,119,6,0.15)] ring-1 ring-amber-500/20'
            : 'bg-black/40 border-amber-900/30'
        }`}>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase font-bold text-amber-600/80 font-mono tracking-widest">YOU</span>
            <span className="text-xs font-black text-amber-200 tracking-wider font-mono flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isMyTurn ? 'bg-amber-400 animate-ping shadow-[0_0_6px_#f59e0b]' : 'bg-amber-800'}`} />
              {myPlayerObjMatched?.username || 'You'}
            </span>
            {mySideMatched ? (
              <span className="text-[9px] uppercase font-bold text-amber-400/60 font-mono">
                {mySideMatched}
              </span>
            ) : (
              <span className="text-[9px] uppercase font-bold text-amber-500/80 font-mono">
                OPEN TABLE
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 bg-black/60 px-2 py-1 rounded border border-amber-900/30 min-h-[34px]">
            {myPocketedMatched.length > 0 ? (
              myPocketedMatched.map(b => renderBallBadge(b))
            ) : (
              <span className="text-[8px] font-mono text-amber-700">NO POTS</span>
            )}
          </div>

          {/* Gold Spin Contact Selector */}
          <div
            className="relative w-11 h-11 rounded-full bg-gradient-to-b from-amber-800 to-amber-950 shadow-[inset_-2px_-2px_5px_rgba(0,0,0,0.6),inset_2px_2px_5px_rgba(217,119,6,0.2),0_2px_5px_rgba(0,0,0,0.4)] border border-amber-600/40 flex items-center justify-center cursor-crosshair select-none shrink-0 group active:scale-105 transition-all"
            title="Cue Ball Spin Contact Point (English)"
            onPointerDown={(e) => {
              if (!isMyTurn || isAnimating) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const handlePointerMoveLocal = (event: PointerEvent | React.MouseEvent) => {
                const x = event.clientX - rect.left;
                const y = event.clientY - rect.top;
                const r = rect.width / 2;
                let dx = (x - r) / r;
                let dy = (y - r) / r;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist > 1.0) { dx /= dist; dy /= dist; }
                setSpinX(dx);
                setSpinY(-dy);
              };
              handlePointerMoveLocal(e);
              const handlePointerMoveGlobal = (event: PointerEvent) => handlePointerMoveLocal(event);
              const handlePointerUpLocal = () => {
                window.removeEventListener('pointermove', handlePointerMoveGlobal);
                window.removeEventListener('pointerup', handlePointerUpLocal);
              };
              window.addEventListener('pointermove', handlePointerMoveGlobal);
              window.addEventListener('pointerup', handlePointerUpLocal);
            }}
          >
            <div className="absolute inset-0 rounded-full border border-amber-400/10 pointer-events-none" />
            <div className="absolute h-full w-[0.5px] bg-amber-400/15 pointer-events-none" />
            <div className="absolute w-full h-[0.5px] bg-amber-400/15 pointer-events-none" />
            <div
              className="absolute w-2.5 h-2.5 bg-amber-400 rounded-full border border-amber-200 shadow-[0_0_6px_#f59e0b] transform -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${22 + spinX * 22}px`,
                top: `${22 - spinY * 22}px`,
              }}
            />
          </div>

          {/* Aim Lock Toggle */}
          <button
            onClick={() => setIsAimLocked(!isAimLocked)}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer active:scale-95 shrink-0 ${
              isAimLocked
                ? 'bg-rose-500/20 border border-rose-500/50 text-rose-300 shadow-[0_0_8px_rgba(244,63,94,0.15)]'
                : 'bg-black/40 border border-amber-900/30 text-amber-600 hover:border-amber-500/50'
            }`}
            title={isAimLocked ? 'Aim locked' : 'Aim free'}
          >
            {isAimLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            {isAimLocked ? 'LOCKED' : 'FREE'}
          </button>
        </div>

        {/* Center: Gold Timer */}
        <div className="flex flex-col items-center justify-center bg-black/60 border border-amber-900/40 px-6 py-2 rounded-xl relative shadow-lg min-w-[150px]">
          <div className={`absolute -inset-[1px] rounded-xl opacity-10 blur-sm transition-colors ${
            isMyTurn ? 'bg-amber-500' : 'bg-amber-800'
          }`} />
          <span className="text-[8px] tracking-widest text-amber-600 font-mono uppercase mb-0.5 z-10">
            {isMyTurn ? 'YOUR SHOT' : 'OPPONENT TURN'}
          </span>
          <span className={`text-xl sm:text-2xl font-black font-mono tracking-tight leading-none z-10 ${timerTextClass}`}>
            {timerVal}s
          </span>
          <div className="w-20 bg-amber-950 h-1 rounded-full overflow-hidden border border-amber-900/60 mt-1.5 z-10">
            <div
              className={`h-full transition-all duration-1000 ${timerColorClass}`}
              style={{ width: `${timerPercentage}%` }}
            />
          </div>
        </div>

        {/* Right: Opponent */}
        {roomState.players.length < 2 ? (
          <div className="flex items-center gap-3 bg-black/40 p-1.5 px-3 rounded-lg border border-amber-900/30">
            <div className="flex flex-col gap-0.5">
              <span className="text-[8px] uppercase font-bold text-amber-600/60 font-mono">OPPONENT</span>
              <span className="text-[10px] text-amber-700 leading-none">WAITING...</span>
            </div>
            {onJoinAI && (
              <button
                onClick={() => onJoinAI('medium')}
                className="px-3 py-1.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-black font-black text-[10px] rounded border border-amber-400 flex items-center gap-1.5 shadow-[0_0_12px_rgba(245,158,11,0.22)] animate-pulse transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <Bot className="w-3.5 h-3.5 fill-current" />
                استدعاء البوت
              </button>
            )}
          </div>
        ) : (
          <div className={`px-4 py-2 rounded-lg border flex items-center gap-3 transition-all ${
            !isMyTurn
              ? 'bg-amber-500/[0.04] border-amber-500/35 shadow-[0_0_15px_rgba(234,179,8,0.15)] ring-1 ring-amber-500/20'
              : 'bg-black/40 border-amber-900/30'
          }`}>
            <div className="flex flex-col gap-0.5 items-end text-right">
              <span className="text-[9px] uppercase font-bold text-amber-600/60 font-mono tracking-widest">OPPONENT</span>
              <span className="text-xs font-black text-amber-200 tracking-wider font-mono flex items-center gap-1.5">
                {opponentObjMatched ? opponentObjMatched.username : 'AI Bot'}
                <span className={`w-2 h-2 rounded-full ${!isMyTurn ? 'bg-amber-400 animate-ping shadow-[0_0_6px_#f59e0b]' : 'bg-amber-800'}`} />
              </span>
              {opponentSideMatched ? (
                <span className="text-[9px] uppercase font-bold text-amber-400/60 font-mono">{opponentSideMatched}</span>
              ) : (
                <span className="text-[9px] uppercase font-bold text-amber-500/80 font-mono">OPEN TABLE</span>
              )}
            </div>
            <div className="flex items-center gap-1 bg-black/60 px-2 py-1 rounded border border-amber-900/30 min-h-[34px]">
              {opponentPocketedMatched.length > 0 ? (
                opponentPocketedMatched.map(b => renderBallBadge(b))
              ) : (
                <span className="text-[8px] font-mono text-amber-700">NO POTS</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. Pocketed Balls Runway — Velvet-lined Luxury Display */}
      <div className="w-full max-w-[800px] mx-auto bg-gradient-to-b from-amber-950 to-black border-2 border-amber-700/60 rounded-lg p-2 shadow-[0_0_30px_rgba(0,0,0,0.8)] relative mt-2 mb-2">
        {/* Velvet background */}
        <div className="w-full bg-gradient-to-b from-[#2a0f05] via-[#1a0804] to-[#0d0402] border border-amber-900/40 rounded-md p-3 min-h-[60px] flex flex-wrap items-center justify-center gap-3 shadow-[inset_0_4px_15px_rgba(0,0,0,0.9)] relative overflow-hidden">
          {/* Velvet texture lines */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
            {Array.from({length: 12}).map((_, i) => (
              <div key={i} className="w-full h-[1px] bg-amber-700/20" style={{marginTop: `${i * 5 + 2}px`}} />
            ))}
          </div>
          {/* Gold trim top/bottom */}
          <div className="absolute left-2 right-2 h-[1px] bg-gradient-to-r from-transparent via-amber-500/40 to-transparent top-2" />
          <div className="absolute left-2 right-2 h-[1px] bg-gradient-to-r from-transparent via-amber-500/40 to-transparent bottom-2" />
          {/* Left/right gold trim */}
          <div className="absolute top-2 bottom-2 w-[1px] bg-gradient-to-b from-transparent via-amber-500/30 to-transparent left-2" />
          <div className="absolute top-2 bottom-2 w-[1px] bg-gradient-to-b from-transparent via-amber-500/30 to-transparent right-2" />

          {pocketedList.length > 0 ? (
            pocketedList.map((ball) => (
              <div
                key={ball.id}
                className="relative flex flex-col items-center group transform active:scale-95 transition-all"
                title={`${ball.nameEn} - Pocketed`}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center relative shadow-xl transition-transform hover:scale-110 hover:shadow-[0_0_15px_rgba(217,119,6,0.3)]"
                  style={{
                    background: ball.type === 'stripe'
                      ? `linear-gradient(to right, #fafaf9 22%, ${ball.color} 22%, ${ball.color} 78%, #fafaf9 78%)`
                      : `radial-gradient(circle at 35% 35%, ${ball.color} 40%, #000000 110%)`,
                    boxShadow: 'inset -2px -2px 6px rgba(0,0,0,0.8), 0 3px 8px rgba(0,0,0,0.5), 0 0 10px rgba(217,119,6,0.1)',
                  }}
                >
                  <div className="absolute top-0.5 left-1 w-2 h-1 bg-white/45 rounded-full rotate-[-15deg] pointer-events-none" />
                  <div className="w-4.5 h-4.5 rounded-full bg-[#fefcbd] border border-yellow-600/30 flex items-center justify-center shadow-inner z-10 select-none">
                    <span className="text-[9px] font-black text-slate-900 font-mono leading-none">
                      {ball.number}
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-[10px] font-medium text-amber-700/60 italic tracking-wider flex items-center gap-2 font-mono z-10">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-700/40 animate-pulse" />
              Runway empty • Awaiting first pocket
            </div>
          )}
        </div>

        {/* Runway label — Gold badge */}
        <div className="absolute -top-2.5 left-4 px-3 py-0.5 bg-gradient-to-r from-amber-900 to-amber-800 text-[8px] font-black text-amber-200 border border-amber-700/50 rounded uppercase font-mono tracking-wider shadow-md">
          POCKETED BALLS RUNWAY
        </div>
      </div>

      {/* 3. Bottom Status Panel */}
      <div className="w-full flex flex-col items-center bg-gradient-to-b from-[#1a0f0a] to-[#0d0806] p-4 rounded-lg border border-amber-900/30 shadow-xl gap-4">
        {isScratchPlacing ? (
          <button
            onClick={handleConfirmPlacement}
            disabled={isPlacementInvalid}
            className={`w-full max-w-sm py-3 px-6 text-white font-bold font-mono rounded-lg transition-all shadow-lg text-xs flex flex-col items-center justify-center gap-1.5 ${
              isPlacementInvalid
                ? 'bg-slate-800 border border-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 border border-amber-400/30 cursor-pointer animate-pulse shadow-[0_0_15px_rgba(217,119,6,0.2)]'
            }`}
          >
            <span className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4" />
              {isPlacementInvalid ? 'INVALID PLACEMENT' : 'CONFIRM CUE PLACEMENT'}
            </span>
            {isPlacementInvalid && placementErrorMessage && (
              <span className="text-[10px] text-slate-300/90">{placementErrorMessage}</span>
            )}
          </button>
        ) : (
          <div className="flex flex-col gap-4 w-full">
            <div className="w-full flex justify-center bg-black/40 py-2.5 px-4 rounded-md border border-amber-900/20">
              {!isMyTurn && roomState.status === 'playing' && (
                <span className="text-xs font-bold text-amber-600 tracking-wide font-mono animate-pulse flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-700 animate-ping" />
                  WAITING FOR OPPONENT...
                </span>
              )}
              {roomState.status !== 'playing' && (
                <span className="text-xs font-bold text-amber-700 tracking-wide font-mono italic animate-pulse flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-800" />
                  WAITING RESUMPTION...
                </span>
              )}
              {roomState.scratchOccurred && (
                <span className="text-xs font-black tracking-wide flex items-center gap-1.5 text-amber-200">
                  <span className={`w-2.5 h-2.5 rounded-full shadow-lg ${roomState.ballInHandRestriction === 'behind_head_string' ? 'bg-amber-400 animate-pulse' : 'bg-amber-300 animate-ping'}`} />
                  {isMyTurn ? (
                    roomState.ballInHandRestriction === 'behind_head_string'
                      ? 'BREAK FOUL: Place behind head string.'
                      : 'BALL-IN-HAND: Place the cue ball anywhere.'
                  ) : (
                    roomState.ballInHandRestriction === 'behind_head_string'
                      ? 'Opponent has ball-in-hand behind head string.'
                      : 'Opponent has ball-in-hand anywhere.'
                  )}
                </span>
              )}
              {!roomState.scratchOccurred && isMyTurn && !isAnimating && roomState.status === 'playing' && (
                <span className="text-xs font-black text-amber-400 tracking-wide animate-pulse flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_#f59e0b] animate-ping" />
                  YOUR TURN • Drag to aim and shoot
                </span>
              )}
              {isAnimating && (
                <span className="text-xs font-bold text-amber-500 tracking-wide font-mono animate-bounce flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  BALLS IN MOTION...
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
