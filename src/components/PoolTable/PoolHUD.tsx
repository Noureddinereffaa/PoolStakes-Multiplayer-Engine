import React from 'react';
import { RoomState } from '../../types';
import { RotateCcw, Bot } from 'lucide-react';

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
}: PoolHUDProps) {

  const renderBallBadge = (ball: typeof standardBallsList[0]) => {
    const isPocketed = roomState.balls.find((b) => b.id === ball.id)?.isPocketed ?? false;
    return (
      <div 
        key={ball.id} 
        className="relative flex flex-col items-center group cursor-help"
        title={`${ball.nameEn} - ${isPocketed ? 'Pocketed' : 'On Table'}`}
      >
        <div 
          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center relative transition-all hover:scale-110 shadow-lg select-none overflow-hidden ${
            isPocketed ? 'opacity-25 grayscale-[30%] scale-90 border border-slate-800' : 'opacity-100'
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
          {/* Spherizing 3D shade overlay for striped balls */}
          {ball.type === 'stripe' && !isPocketed && (
            <div className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25) 0%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.55) 100%)',
              }}
            />
          )}

          {/* Golden metallic rim surrounding the container */}
          {!isPocketed && (
            <div className="absolute inset-0 rounded-full border border-yellow-500/20 pointer-events-none" />
          )}

          {/* Core sphere specular hot point reflection */}
          {!isPocketed && (
            <div className="absolute top-0.5 left-1 w-2 h-1 bg-white/45 rounded-full rotate-[-15deg] pointer-events-none" />
          )}
          
          {/* Centered number wrapper - styled with gold-bordered elegant billiard number face */}
          <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-[#fffaeb] border border-yellow-600/30 flex items-center justify-center shadow-xs z-10">
            <span className="text-[7.5px] sm:text-[8.5px] font-black text-slate-900 font-mono leading-none">
              {ball.number}
            </span>
          </div>

          {/* Pocketed check overlay */}
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
    // Open table default grouping: show solids and stripes respectively
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
      {/* 1. Header Players & Spin Selector */}
      <div className="w-full bg-slate-950/80 border border-slate-800/60 rounded-xl p-3 flex flex-col md:flex-row items-center justify-between gap-4 shadow-md">
        
        {/* Left Side: You Profile & Your Pocketed Balls Group + Cue Contact Selector */}
        <div className={`px-4 py-2 rounded-lg border flex items-center gap-4 transition-all ${
          isMyTurn 
            ? 'bg-cyan-500/[0.04] border-cyan-500/35 shadow-[0_0_15px_rgba(6,182,212,0.15)] ring-1 ring-cyan-500/20' 
            : 'bg-slate-900/40 border-slate-850'
        }`}>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase font-bold text-slate-500 font-mono">YOU</span>
            <span className="text-xs font-black text-slate-200 tracking-wider font-mono flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isMyTurn ? 'bg-cyan-400 animate-ping' : 'bg-slate-600'}`} />
              {myPlayerObjMatched?.username || 'You'}
            </span>
            {mySideMatched ? (
              <span className="text-[9px] uppercase font-bold text-slate-400 font-mono">
                {mySideMatched}
              </span>
            ) : (
              <span className="text-[9px] uppercase font-bold text-amber-500/80 font-mono">
                OPEN TABLE
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-1 bg-slate-950/90 px-2 py-1 rounded border border-slate-900 min-h-[34px]">
            {myPocketedMatched.length > 0 ? (
              myPocketedMatched.map(renderBallBadge)
            ) : (
              <span className="text-[8px] font-mono text-slate-600">NO OBJECTS SUNK</span>
            )}
          </div>

          {/* Dynamic Compact 3D Draggable Spin Contact Selector */}
          <div 
            className="relative w-11 h-11 rounded-full bg-radial from-white via-slate-100 to-slate-200 shadow-[inset_-2px_-2px_5px_rgba(0,0,0,0.5),0_2px_5px_rgba(0,0,0,0.4)] border border-slate-400/40 flex items-center justify-center cursor-crosshair select-none shrink-0 group active:scale-105 transition-all"
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
                if (dist > 1.0) {
                  dx /= dist;
                  dy /= dist;
                }
                setSpinX(dx);
                setSpinY(-dy);
              };
              handlePointerMoveLocal(e);
              
              const handlePointerMoveGlobal = (event: PointerEvent) => {
                handlePointerMoveLocal(event);
              };
              const handlePointerUpLocal = () => {
                window.removeEventListener('pointermove', handlePointerMoveGlobal);
                window.removeEventListener('pointerup', handlePointerUpLocal);
              };
              window.addEventListener('pointermove', handlePointerMoveGlobal);
              window.addEventListener('pointerup', handlePointerUpLocal);
            }}
          >
            <div className="absolute inset-0 rounded-full border border-dashed border-slate-400/10 pointer-events-none" />
            <div className="absolute h-full w-[0.5px] bg-slate-400/20 pointer-events-none" />
            <div className="absolute w-full h-[0.5px] bg-slate-400/20 pointer-events-none" />
            <div 
              className="absolute w-2.5 h-2.5 bg-red-650 rounded-full border border-white shadow-[0_0_4px_#ef4444] transform -translate-x-1/2 -translate-y-1/2 animate-pulse"
              style={{
                left: `${22 + spinX * 22}px`,
                top: `${22 - spinY * 22}px`,
              }}
            />
          </div>
        </div>

        {/* Center: Upgraded Design Neon Turn Timer */}
        <div className="flex flex-col items-center justify-center bg-slate-1000 border border-slate-850 px-6 py-2 rounded-xl relative shadow-lg min-w-[150px]">
          <div className={`absolute -inset-[1px] rounded-xl opacity-15 blur-sm transition-colors ${
            isMyTurn ? 'bg-cyan-500' : 'bg-amber-500'
          }`} />
          
          <span className="text-[8px] tracking-widest text-slate-400 font-mono uppercase mb-0.5 z-10">
            {isMyTurn ? 'YOUR SHOT' : 'OPPONENT TURN'}
          </span>
          <span className={`text-xl sm:text-2xl font-black font-mono tracking-tight leading-none z-10 ${timerTextClass}`}>
            {timerVal}s
          </span>
          <div className="w-20 bg-slate-900 h-1 rounded-full overflow-hidden border border-slate-800/60 mt-1.5 z-10">
            <div 
              className={`h-full transition-all duration-1000 ${timerColorClass}`}
              style={{ width: `${timerPercentage}%` }}
            />
          </div>
        </div>

        {/* Right Side: Opponent Profile & Opponent's Pocketed Balls Group or Summon Bot */}
        {roomState.players.length < 2 ? (
          <div className="flex items-center gap-3 bg-slate-900/40 p-1.5 px-3 rounded-lg border border-slate-800">
            <div className="flex flex-col gap-0.5">
              <span className="text-[8px] uppercase font-bold text-slate-500 font-mono">OPPONENT</span>
              <span className="text-[10px] text-slate-400 leading-none">WAITING OPPONENT...</span>
            </div>
            {onJoinAI && (
              <button
                onClick={() => onJoinAI('medium')}
                className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black text-[10px] rounded border border-amber-400 flex items-center gap-1.5 shadow-[0_0_12px_rgba(245,158,11,0.22)] animate-pulse transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <Bot className="w-3.5 h-3.5 fill-current" />
                استدعاء البوت للعب
              </button>
            )}
          </div>
        ) : (
          <div className={`px-4 py-2 rounded-lg border flex items-center gap-3 transition-all ${
            !isMyTurn 
              ? 'bg-amber-500/[0.04] border-amber-500/35 shadow-[0_0_15px_rgba(234,179,8,0.15)] ring-1 ring-amber-500/20' 
              : 'bg-slate-900/40 border-slate-850'
          }`}>
            <div className="flex flex-col gap-0.5 items-end text-right">
              <span className="text-[9px] uppercase font-bold text-slate-500 font-mono">OPPONENT</span>
              <span className="text-xs font-black text-slate-200 tracking-wider font-mono flex items-center gap-1.5">
                {opponentObjMatched ? opponentObjMatched.username : 'AI Bot'}
                <span className={`w-2 h-2 rounded-full ${!isMyTurn ? 'bg-amber-400 animate-ping' : 'bg-slate-600'}`} />
              </span>
              {opponentSideMatched ? (
                <span className="text-[9px] uppercase font-bold text-slate-400 font-mono">
                  {opponentSideMatched}
                </span>
              ) : (
                <span className="text-[9px] uppercase font-bold text-amber-500/80 font-mono">
                  OPEN TABLE
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-1 bg-slate-950/90 px-2 py-1 rounded border border-slate-900 min-h-[34px]">
              {opponentPocketedMatched.length > 0 ? (
                opponentPocketedMatched.map(renderBallBadge)
              ) : (
                <span className="text-[8px] font-mono text-slate-600">NO OBJECTS SUNK</span>
              )}
            </div>
          </div>
        )}

      </div>

      {/* 2. Pocketed Balls runway runway shelf */}
      <div className="w-full max-w-[800px] mx-auto bg-amber-950 border-4 border-amber-900 rounded-lg p-2 shadow-2xl relative mt-2 mb-2">
        <div className="w-full bg-slate-950/90 border border-amber-950 rounded-md p-2 min-h-[56px] flex flex-wrap items-center justify-center gap-3 shadow-[inset_0_4px_10px_rgba(0,0,0,0.9)] relative overflow-hidden">
          {/* Visual Felt Lines to simulate bottom runway tube rails */}
          <div className="absolute left-0 right-0 h-[2px] bg-slate-900/40 top-[35%] pointer-events-none" />
          <div className="absolute left-0 right-0 h-[2px] bg-slate-900/40 bottom-[35%] pointer-events-none" />

          {pocketedList.length > 0 ? (
            pocketedList.map((ball) => (
              <div 
                key={ball.id} 
                className="relative flex flex-col items-center group transform active:scale-95 transition-all"
                title={`${ball.nameEn} - Pocketed`}
              >
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center relative shadow-lg transition-transform hover:scale-110"
                  style={{
                    background: ball.type === 'stripe' 
                      ? `linear-gradient(to right, #fafaf9 22%, ${ball.color} 22%, ${ball.color} 78%, #fafaf9 78%)`
                      : `radial-gradient(circle at 35% 35%, ${ball.color} 40%, #000000 110%)`,
                    boxShadow: 'inset -2px -2px 6px rgba(0,0,0,0.8), 0 3px 6px rgba(0,0,0,0.5)',
                  }}
                >
                  <div className="absolute top-0.5 left-1 w-2 h-1 bg-white/45 rounded-full rotate-[-15deg] pointer-events-none" />
                  <div className="w-4.5 h-4.5 rounded-full bg-[#fefcbd] border border-black/10 flex items-center justify-center shadow-inner z-10 select-none">
                    <span className="text-[9px] font-black text-slate-900 font-mono leading-none">
                      {ball.number}
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-[10px] font-medium text-slate-500 italic tracking-wider flex items-center gap-2 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-700 animate-pulse" />
              Fallen balls runway is empty • Awaiting first pocket
            </div>
          )}
        </div>
        
        {/* Runway label badge */}
        <div className="absolute -top-2.5 left-4 px-2 py-0.5 bg-amber-900 text-[8px] font-black text-amber-200 border border-amber-800 rounded uppercase font-mono tracking-wider shadow-md">
          POCKETED BALLS RUNWAY
        </div>
      </div>

      {/* 3. Bottom Status Confirmation Panel */}
      <div className="w-full flex flex-col items-center bg-slate-950 p-4 rounded-lg border border-slate-800 shadow-xl gap-4">
        {isScratchPlacing ? (
          <button
            onClick={handleConfirmPlacement}
            disabled={isPlacementInvalid}
            className={`w-full max-w-sm py-3 px-6 text-white font-bold font-mono rounded-lg transition-all shadow-lg text-xs flex flex-col items-center justify-center gap-1.5 ${
              isPlacementInvalid 
                ? 'bg-slate-800 border border-slate-700 text-slate-400 cursor-not-allowed' 
                : 'bg-red-650 hover:bg-red-700 focus:ring-2 focus:ring-red-400 cursor-pointer animate-pulse'
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
            <div className="w-full flex justify-center bg-slate-900/60 py-2.5 px-4 rounded-md border border-slate-800/40">
              {!isMyTurn && roomState.status === 'playing' && (
                <span className="text-xs font-bold text-slate-400 tracking-wide font-mono animate-pulse flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-500 animate-ping" />
                  WAITING FOR OPPONENT...
                </span>
              )}
              {roomState.status !== 'playing' && (
                <span className="text-xs font-bold text-slate-500 tracking-wide font-mono italic animate-pulse flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-600" />
                  WAITING RESUMPTION...
                </span>
              )}
              {roomState.scratchOccurred && (
                <span className="text-xs font-black tracking-wide flex items-center gap-1.5 text-white">
                  <span className={`w-2.5 h-2.5 rounded-full shadow-lg ${roomState.ballInHandRestriction === 'behind_head_string' ? 'bg-cyan-400 animate-pulse' : 'bg-emerald-400 animate-ping'}`} />
                  {isMyTurn ? (
                    roomState.ballInHandRestriction === 'behind_head_string' ?
                      'BREAK FOUL: Place the cue ball behind the head string.' :
                      'BALL-IN-HAND: Place the cue ball anywhere.'
                  ) : (
                    roomState.ballInHandRestriction === 'behind_head_string' ?
                      'Opponent has ball-in-hand behind the head string.' :
                      'Opponent has ball-in-hand anywhere.'
                  )}
                </span>
              )}
              {!roomState.scratchOccurred && isMyTurn && !isAnimating && roomState.status === 'playing' && (
                <span className="text-xs font-black text-emerald-400 tracking-wide animate-pulse flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] animate-ping" />
                  YOUR TURN • Drag cue ball back to aim and release to shoot
                </span>
              )}
              {isAnimating && (
                <span className="text-xs font-bold text-amber-400 tracking-wide font-mono animate-bounce flex items-center gap-1.5">
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
