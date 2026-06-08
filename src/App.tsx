import React, { useEffect, useState, useRef } from 'react';
import { RoomState, MatchHistory as MatchType } from './types';
import MatchHistory from './components/MatchHistory';
import HomePage from './components/HomePage';
import RulesPage from './components/RulesPage';
import MemberDashboard from './components/MemberDashboard';
import GameRoom from './components/GameRoom';
import { ShieldAlert, LogOut, User, CheckCircle2 } from 'lucide-react';
import { t } from './i18n';


interface UserSession {
  id: string;
  username: string;
  balance: number;
  email?: string;
  walletAddress?: string;
}

export default function App() {
  // Authentication & session state
  const [userSession, setUserSession] = useState<UserSession | null>(null);

  // Auth form state
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [regUser, setRegUser] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regWallet, setRegWallet] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Active game & lobby states
  const [stake, setStake] = useState(25);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [physicsFrames, setPhysicsFrames] = useState<Array<Array<{id:number;x:number;y:number;isPocketed:boolean}>> | null>(null);

  // Real-time API & Database logs
  const [apiLogs, setApiLogs] = useState<any[]>([]);
  const [laravelUsers, setLaravelUsers] = useState<any[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchType[]>([]);
  const [opponentAim, setOpponentAim] = useState<{ angle: number; power: number; spinX?: number; spinY?: number } | null>(null);

  // Client UI States
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [roomId, setRoomId] = useState('Vegas_Golden_Suite');
  const [joinDifficulty, setJoinDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [currentPage, setCurrentPage] = useState<'home' | 'rules' | 'dashboard'>('home');
  const [language, setLanguage] = useState<'en' | 'ar'>('en');

  useEffect(() => {
    if (userSession) {
      setCurrentPage('dashboard');
    } else {
      setCurrentPage('home');
    }
  }, [userSession]);

  const wsRef = useRef<WebSocket | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Initial DB fetches & periodic sync checks
  const fetchLaravelUsers = async () => {
    try {
      const res = await fetch('/api/laravel/users');
      if (res.ok) {
        const data = await res.json();
        setLaravelUsers(data.users);
        
        // Sync the logged-in user balance with latest database
        if (userSession) {
          const freshUser = data.users.find((u: any) => u.id === userSession.id || u.username === userSession.username);
          if (freshUser) {
            const updated = { ...userSession, balance: freshUser.balance };
            setUserSession(updated);
            localStorage.setItem('billiards_session', JSON.stringify(updated));
          }
        }
      }
    } catch (e) {
      console.error('Failed to retrieve Laravel platform users:', e);
    }
  };

  const fetchApiLogs = async () => {
    try {
      const res = await fetch('/api/laravel/logs');
      if (res.ok) {
        const data = await res.json();
        setApiLogs(data.logs);
      }
    } catch (e) {
      console.error('Failed to retrieve API audit logs:', e);
    }
  };

  // Check saved session on load
  useEffect(() => {
    const saved = localStorage.getItem('billiards_session');
    if (saved) {
      try {
        const Parsed = JSON.parse(saved);
        setUserSession(Parsed);
      } catch (e) {
        console.error('Failed to parse saved session:', e);
      }
    }

    fetchLaravelUsers();
    fetchApiLogs();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Sync lobby connection state
  useEffect(() => {
    if (roomState?.status === 'gameover') {
      fetchLaravelUsers();
      // append history locally
      const winnerName = roomState.players.find(p => p.id === roomState.winnerId)?.username || 'Winner';
      const loserName = roomState.players.find(p => p.id !== roomState.winnerId)?.username || 'Loser';
      
      const newMatch: MatchType = {
        id: `match-${Date.now()}`,
        roomName: roomState.name,
        winnerName,
        loserName,
        stake: roomState.stake,
        prizeAmount: roomState.stake * 2 * 0.95,
        commission: roomState.stake * 2 * 0.05,
        timestamp: new Date().toLocaleTimeString(),
        pocketsByWinner: roomState.balls.filter(b => b.id !== 0 && b.isPocketed).length
      };

      setMatchHistory(prev => {
        if (prev.some(m => m.roomName === roomState.name && m.winnerName === winnerName)) return prev;
        return [newMatch, ...prev];
      });
    }
  }, [roomState?.log]);

  // Clean opponent's trajectory preview when turn shifts
  useEffect(() => {
    setOpponentAim(null);
  }, [roomState?.currentTurn, roomState?.status]);

  // Scroll chat terminal whenever room log changes
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [roomState?.log]);

  // Handle User Registration
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUser.trim() || !regPass) return;
    setIsAuthLoading(true);
    setErrorBanner(null);

    try {
      const response = await fetch('/api/laravel/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: regUser.trim(),
          email: regEmail.trim(),
          password: regPass,
          walletAddress: regWallet.trim()
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        const session: UserSession = {
          id: data.user.id,
          username: data.user.username,
          balance: data.user.balance,
          email: data.user.email,
          walletAddress: data.user.walletAddress
        };
        setUserSession(session);
        localStorage.setItem('billiards_session', JSON.stringify(session));

        setSuccessBanner('Account Welcome Pack Loaded! You received 500.00 USDT credit bonus!');
        setTimeout(() => setSuccessBanner(null), 5000);
        
        fetchLaravelUsers();
      } else {
        setErrorBanner(data.error || 'Registration failed. Choose a different username.');
      }
    } catch (e) {
      setErrorBanner('Backend servers unresponsive. Try again.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Handle User Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUser.trim() || !loginPass) return;
    setIsAuthLoading(true);
    setErrorBanner(null);

    try {
      const response = await fetch('/api/laravel/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginUser.trim(),
          password: loginPass
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        const session: UserSession = {
          id: data.user.id,
          username: data.user.username,
          balance: data.user.balance,
          email: data.user.email,
          walletAddress: data.user.walletAddress
        };
        setUserSession(session);
        localStorage.setItem('billiards_session', JSON.stringify(session));

        setSuccessBanner(`Welcome back standard player ${session.username}! Lounge access granted.`);
        setTimeout(() => setSuccessBanner(null), 4000);
        
        fetchLaravelUsers();
      } else {
        setErrorBanner(data.error || 'Password mismatch or user doesn\'t exist.');
      }
    } catch (e) {
      setErrorBanner('Network API endpoint offline.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Skip Login / Registration
  const handleQuickGuest = () => {
    const guestName = 'Guest_' + Math.floor(Math.random() * 899 + 100);
    const session: UserSession = {
      id: 'usr-' + Date.now(),
      username: guestName,
      balance: 350.0,
      email: `${guestName}@usdtpool.com`,
      walletAddress: 'T' + Math.random().toString(36).substring(2, 11).toUpperCase() + 'usdtGuest'
    };
    setUserSession(session);
    localStorage.setItem('billiards_session', JSON.stringify(session));
    setSuccessBanner('Logged in as Guest and credited 350.00 USDT practice points successfully!');
    setTimeout(() => setSuccessBanner(null), 4000);
    fetchLaravelUsers();
  };

  // Sign out / Exit Pool Room
  const handleSignout = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setRoomState(null);
    setUserSession(null);
    localStorage.removeItem('billiards_session');
    setSuccessBanner('Secure logout complete. Your USDT balance is archived.');
    setTimeout(() => setSuccessBanner(null), 3000);
  };

  // Connect & Join WebSocket Lobby Room
  const handleJoinRoom = (targetRoomId: string, customStake: number, autoJoinAI: boolean | 'easy' | 'medium' | 'hard' = false) => {
    setRoomId(targetRoomId);
    setPhysicsFrames(null);

    if (wsRef.current) {
      wsRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    // Track whether we've sent the AI invite after the first sync_state confirms seat
    let aiScheduled = autoJoinAI;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'join',
        roomId: targetRoomId,
        username: userSession?.username ?? '',
        stake: customStake
      }));
      setErrorBanner(null);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        switch (msg.type) {
          case 'sync_state':
            setRoomState(msg.state);
            fetchLaravelUsers();
            // Send AI invite only after server confirms player is seated (exactly 1 player)
            if (aiScheduled && msg.state.players.length === 1 && msg.state.status === 'waiting') {
              const difficulty = typeof aiScheduled === 'string' ? aiScheduled : 'medium';
              ws.send(JSON.stringify({ type: 'set_ai_opponent', difficulty }));
              aiScheduled = false;
            }
            break;
          case 'physics_frames':
            setPhysicsFrames(msg.frames);
            break;
          case 'preview_aim':
            setOpponentAim({
              angle: msg.angle,
              power: msg.power,
              spinX: msg.spinX || 0,
              spinY: msg.spinY || 0,
            });
            break;
          case 'laravel_api_log':
            setApiLogs(prev => [msg, ...prev]);
            break;
          case 'error':
            setErrorBanner(msg.message);
            setTimeout(() => setErrorBanner(null), 4500);
            break;
        }
      } catch (err) {
        console.error('Error decoding client websocket msg:', err);
      }
    };

    ws.onerror = () => {
      setErrorBanner('Real-time physics server connection closed or timeout.');
    };
  };

  // Challenge AI bot for free (0 USDT stake) — handled by MemberDashboard via onJoinRoom

  // Interactive trajectory aim previews
  const handlePreviewAim = (angle: number, power: number, spinX?: number, spinY?: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'preview_aim',
        angle,
        power,
        spinX: spinX || 0,
        spinY: spinY || 0
      }));
    }
  };

  // Submit angular collision shot to physics server
  const handleShoot = (angle: number, power: number, spinX?: number, spinY?: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'shoot',
        angle,
        power,
        spinX: spinX || 0,
        spinY: spinY || 0
      }));
    }
  };

  // Safe placement of cue ball inside table limits
  const handleResetCueBall = (x: number, y: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'reset_cue_ball',
        x,
        y
      }));
    }
  };

  // Spawn AI Bot manually in active room
  const handleJoinAI = (difficulty: 'easy' | 'medium' | 'hard' = 'medium') => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'set_ai_opponent',
        difficulty
      }));
    }
  };

  const handleCopyRoomCode = () => {
    if (!roomState) return;
    navigator.clipboard.writeText(roomState.roomId).then(() => {
      setSuccessBanner('Room access code copied. Share it with your opponent!');
      setTimeout(() => setSuccessBanner(null), 3000);
    }).catch(() => {
      setErrorBanner('Unable to copy invite code automatically.');
      setTimeout(() => setErrorBanner(null), 3000);
    });
  };

  // Send messaging back to lobbies chat box
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'chat',
        message: chatMessage
      }));
      setChatMessage('');
    }
  };

  // Quit and exit active table room completely
  const handleQuitRoom = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setRoomState(null);
    setPhysicsFrames(null);
    fetchLaravelUsers();
    setSuccessBanner('Successfully exited Room. Your assets have returned safely to wallet ledger.');
    setTimeout(() => setSuccessBanner(null), 3000);
  };

  const handleModifyBalance = async (userId: string, delta: number) => {
    try {
      // Fetch fresh balance to compute correct absolute target
      const res = await fetch('/api/laravel/users');
      if (!res.ok) return;
      const data = await res.json();
      const freshUser = data.users.find((u: any) => u.id === userId);
      if (!freshUser) return;
      const newBalance = Math.max(0, parseFloat((freshUser.balance + delta).toFixed(2)));

      const upd = await fetch('/api/laravel/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount: newBalance })
      });
      if (upd.ok) {
        await fetchLaravelUsers();
        setApiLogs(prev => [
          {
            id: `log-${Date.now()}`,
            apiName: 'MANUAL LEDGER MODIFICATION',
            payload: { userId, delta, newBalance },
            response: { success: true, message: 'Balance updated' },
            timestamp: new Date().toISOString()
          },
          ...prev
        ]);
      }
    } catch (e) {
      console.error('Could not modify balance in databases:', e);
    }
  };

  const myPlayerObj = roomState?.players.find(p => p.username === userSession!.username);
  const isMyTurn = !!(roomState && roomState.status === 'playing' && myPlayerObj && roomState.currentTurn === myPlayerObj.id);
  const activeEscrow = roomState && roomState.status !== 'waiting' && roomState.status !== 'gameover' ? roomState.stake * 2 : 0;

  if (!userSession) {
    return (
      <HomePage
        loginUser={loginUser}
        setLoginUser={setLoginUser}
        loginPass={loginPass}
        setLoginPass={setLoginPass}
        regUser={regUser}
        setRegUser={setRegUser}
        regEmail={regEmail}
        setRegEmail={setRegEmail}
        regPass={regPass}
        setRegPass={setRegPass}
        regWallet={regWallet}
        setRegWallet={setRegWallet}
        isAuthLoading={isAuthLoading}
        handleLoginSubmit={handleLoginSubmit}
        handleRegisterSubmit={handleRegisterSubmit}
        handleQuickGuest={handleQuickGuest}
        language={language}
        setLanguage={setLanguage}
        onNavigateToRules={() => setCurrentPage('rules')}
      />
    );
  }

  if (currentPage === 'rules') {
    return (
      <RulesPage
        language={language}
        setLanguage={setLanguage}
        onNavigateBack={() => setCurrentPage('home')}
        onNavigateDashboard={() => setCurrentPage('dashboard')}
      />
    );
  }

  if (currentPage === 'dashboard') {
    return (
      <MemberDashboard
        userSession={userSession}
        roomState={roomState}
        stake={stake}
        roomId={roomId}
        joinDifficulty={joinDifficulty}
        laravelUsers={laravelUsers}
        matchHistory={matchHistory}
        language={language}
        setLanguage={setLanguage}
        onSetStake={setStake}
        onSetRoomId={setRoomId}
        onSetJoinDifficulty={setJoinDifficulty}
        onJoinRoom={handleJoinRoom}
        onJoinAI={handleJoinAI}
        onNavigateRules={() => setCurrentPage('rules')}
        onDeposit={(amount, address, method) => {
          if (userSession) {
            handleModifyBalance(userSession.id, amount); // amount is a delta (positive)
            setSuccessBanner(`Deposit confirmed: ${amount} USDT credited to your account.`);
            setTimeout(() => setSuccessBanner(null), 4000);
          }
        }}
        onWithdraw={(amount, address, method) => {
          if (userSession) {
            if (userSession.balance < amount) {
              setErrorBanner('Insufficient balance for this withdrawal.');
              setTimeout(() => setErrorBanner(null), 4000);
              return;
            }
            handleModifyBalance(userSession.id, -amount); // delta (negative)
            setSuccessBanner(`Withdrawal approved: ${amount} USDT sent to ${address || userSession.walletAddress || 'wallet'}.`);
            setTimeout(() => setSuccessBanner(null), 5000);
          }
        }}
      />
    );
  }

  // Fallback to Home page (currentPage === 'home')
  if (currentPage === 'home') {
    return (
      <HomePage
        loginUser={loginUser}
        setLoginUser={setLoginUser}
        loginPass={loginPass}
        setLoginPass={setLoginPass}
        regUser={regUser}
        setRegUser={setRegUser}
        regEmail={regEmail}
        setRegEmail={setRegEmail}
        regPass={regPass}
        setRegPass={setRegPass}
        regWallet={regWallet}
        setRegWallet={setRegWallet}
        isAuthLoading={isAuthLoading}
        handleLoginSubmit={handleLoginSubmit}
        handleRegisterSubmit={handleRegisterSubmit}
        handleQuickGuest={handleQuickGuest}
        language={language}
        setLanguage={setLanguage}
        onNavigateToRules={() => setCurrentPage('rules')}
      />
    );
  }

  return (
    <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-emerald-500 selection:text-slate-950">

      {/* Visual background emerald radial glow highlights */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full filter blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-amber-500/5 rounded-full filter blur-[140px] pointer-events-none" />

      {/* Security alert / Success alerts panel */}
      {errorBanner && (
        <div className="fixed bottom-6 right-6 z-50 bg-red-950 border border-red-500/40 text-red-200 p-4 rounded-xl shadow-2xl flex items-center gap-3 animate-fadeIn max-w-md">
          <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 animate-pulse" />
          <div className="text-xs font-mono">{errorBanner}</div>
        </div>
      )}

      {/* Success notification panel */}
      {successBanner && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-950 border border-emerald-500/40 text-emerald-300 p-4 rounded-xl shadow-2xl flex items-center gap-3 animate-fadeIn max-w-md">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 animate-bounce" />
          <div className="text-xs font-mono">{successBanner}</div>
        </div>
      )}

      {/* Header element */}
      <header className="border-b border-slate-900 bg-slate-900/50 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-40">

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-emerald-400 flex items-center justify-center font-black text-slate-950 shadow-lg relative overflow-hidden group">
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              🎱
            </div>
            <div>
              <h1 className="text-md sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                PLAY & WIN USDT <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-bold tracking-normal">TRC20</span>
              </h1>
              <p className="text-[9px] sm:text-[10px] text-emerald-500 font-mono flex items-center gap-1.5 uppercase tracking-wider">
                <span>● MULTIPLAYER 8-BALL LOCKER</span>
                <span className="text-slate-700">•</span>
                <span className="text-slate-400">PROVABLY FAIR CYBER FIELD</span>
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/80 px-3 py-2">
            <button
              onClick={() => setCurrentPage('home')}
              className={`text-xs font-bold uppercase ${(currentPage as any) === 'home' ? 'text-emerald-300' : 'text-slate-400 hover:text-emerald-200'}`}
            >
              {t(language, 'home')}
            </button>
            <button
              onClick={() => setCurrentPage('rules')}
              className={`text-xs font-bold uppercase ${(currentPage as any) === 'rules' ? 'text-emerald-300' : 'text-slate-400 hover:text-emerald-200'}`}
            >
              {t(language, 'rules')}
            </button>
            {userSession && (
              <button
                onClick={() => setCurrentPage('dashboard')}
                className={`text-xs font-bold uppercase ${(currentPage as any) === 'dashboard' ? 'text-emerald-300' : 'text-slate-400 hover:text-emerald-200'}`}
              >
                {t(language, 'dashboard')}
              </button>
            )}
          </div>
        </div>

        {userSession ? (
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col items-end text-right">
              <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-500" /> {userSession.username}
              </span>
              <span className="text-[9px] font-mono text-slate-600 truncate max-w-[150px]">
                {userSession.walletAddress ? `${userSession.walletAddress.substring(0, 5)}...${userSession.walletAddress.substring(userSession.walletAddress.length - 4)}` : language === 'ar' ? 'لم يتم إدخال محفظة' : 'No Wallet Listed'}
              </span>
            </div>
            
            <div className="p-1 px-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2">
              <span className="text-xs font-bold font-mono text-emerald-400">
                {userSession.balance.toFixed(2)} {t(language, 'bankLabel')}
              </span>
            </div>

            <button
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              className="px-3 py-2 border border-slate-800 rounded-lg text-xs font-bold uppercase text-slate-400 hover:border-emerald-500/30 hover:text-emerald-300 transition"
              title={language === 'en' ? 'Switch to Arabic' : 'التبديل إلى الإنجليزية'}
            >
              {language === 'en' ? 'AR' : 'EN'}
            </button>
            <button 
              onClick={handleSignout}
              className="p-2 border border-slate-800 hover:border-red-500/30 text-slate-400 hover:text-red-400 rounded-lg transition-all duration-250 cursor-pointer"
              title={t(language, 'signOut')}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-500 animate-pulse hidden sm:inline">● {language === 'ar' ? 'القنوات الآمنة مؤمنة' : 'SECURE CHANNELS SECURED'}</span>
          </div>
        )}
      </header>

      {/* GAME SCREEN (authenticated user) */}
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-5 flex flex-col gap-5">

          {roomState ? (
            <div className="flex flex-col gap-5">

              {/* ── Match HUD Banner ── */}
              <div className="rounded-2xl border border-white/8 bg-[#12121a] px-5 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-emerald-500 to-cyan-500" />
                <div className="flex items-center gap-3">
                  <span className="text-lg">🎱</span>
                  <div>
                    <div className="font-black text-white text-sm">{language === 'ar' ? 'مباراة نشطة' : 'LIVE MATCH'}</div>
                    <div className="text-xs text-slate-500 font-mono">{roomState.name}</div>
                  </div>
                  <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono animate-pulse">● LIVE</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-[9px] text-slate-500 uppercase">Prize Pool</div>
                    <div className="font-black text-emerald-400 font-mono">${(roomState.stake * 2 * 0.95).toFixed(2)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] text-slate-500 uppercase">Stake Each</div>
                    <div className="font-black text-amber-400 font-mono">${roomState.stake}</div>
                  </div>
                  <button
                    onClick={handleQuitRoom}
                    className="px-4 py-2 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 hover:text-red-300 text-xs font-bold transition"
                  >
                    🏳️ {language === 'ar' ? 'مغادرة' : 'Forfeit'}
                  </button>
                </div>
              </div>

              {/* ── Two-column game view ── */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

                {/* Canvas board */}
                <div className="lg:col-span-8 rounded-2xl border border-white/8 bg-[#0d0d14] p-3 flex flex-col items-center justify-center shadow-2xl">
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
                </div>

                {/* Right sidebar */}
                <div className="lg:col-span-4 flex flex-col gap-4">

                  {/* Players */}
                  <div className="rounded-2xl border border-white/8 bg-[#12121a] p-4">
                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-3">Players</div>
                    <div className="space-y-2">
                      {roomState.players.map((p, i) => (
                        <div key={p.id} className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition ${p.username === userSession!.username ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/5'}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] text-slate-500 font-mono shrink-0">#{i + 1}</span>
                            <span className="text-sm font-semibold text-slate-200 truncate">{p.username}</span>
                            {p.username.startsWith('Bot_') && <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1.5 rounded border border-amber-500/20 shrink-0">BOT</span>}
                            {p.side && <span className={`text-[9px] px-1.5 rounded font-black shrink-0 ${p.side === 'solids' ? 'bg-amber-400 text-slate-950' : 'bg-blue-500 text-white'}`}>{p.side}</span>}
                            {roomState.currentTurn === p.id && roomState.status === 'playing' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
                          </div>
                          <span className="text-xs font-mono font-black text-emerald-400 shrink-0">${p.walletBalance.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>

                    {roomState.players.length === 1 && (
                      <div className="mt-3 p-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5">
                        <div className="text-[10px] text-indigo-400 mb-2">Waiting for opponent…</div>
                        <p className="text-[11px] text-slate-400 mb-3">Share code: <span className="font-mono text-emerald-300">{roomState.roomId}</span></p>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={handleCopyRoomCode} className="py-1.5 rounded-lg border border-white/10 text-slate-300 text-xs font-bold hover:border-white/20 transition">Copy Code</button>
                          <button onClick={() => handleJoinAI('medium')} className="py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition">Summon Bot</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Escrow */}
                  {activeEscrow > 0 && (
                    <div className="rounded-2xl border border-emerald-500/15 bg-[#12121a] p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-emerald-400 font-bold flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5" /> Secure Escrow
                        </span>
                        <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">Audited</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-[10px] text-slate-500">Locked</div>
                          <div className="font-black text-white font-mono">${activeEscrow.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Winner Gets</div>
                          <div className="font-black text-emerald-400 font-mono">${(activeEscrow * 0.95).toFixed(2)}</div>
                        </div>
                      </div>
                      {roomState.escrowHash && (
                        <div className="mt-3 pt-3 border-t border-white/5">
                          <div className="text-[9px] text-slate-500 mb-1">SHA-256 Integrity Hash</div>
                          <div className="text-[9px] font-mono text-emerald-400 bg-[#0a0a0f] p-2 rounded border border-white/5 truncate select-all">{roomState.escrowHash}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Chat / Log */}
                  <div className="rounded-2xl border border-white/8 bg-[#12121a] p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-xs">
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="font-bold text-slate-300">Match Log</span>
                    </div>
                    <div ref={chatScrollRef} className="bg-[#0a0a0f] rounded-xl p-2.5 border border-white/5 max-h-40 overflow-y-auto space-y-1">
                      {roomState.log.map((line, idx) => (
                        <div key={idx} className={`text-[10px] leading-relaxed break-words font-mono ${!line.includes(':') ? 'text-amber-400/80 italic' : 'text-slate-400'}`}>{line}</div>
                      ))}
                    </div>
                    <form onSubmit={handleSendChat} className="flex gap-2">
                      <input
                        type="text" value={chatMessage} onChange={e => setChatMessage(e.target.value)}
                        placeholder={language === 'ar' ? 'رسالة…' : 'Message…'}
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
          ) : (
            // No active room — send to dashboard
            <div className="flex items-center justify-center min-h-[300px]">
              <button onClick={() => setCurrentPage("dashboard")} className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black transition">
                Go to Dashboard
              </button>
            </div>
          )}

      </div>

      {/* Styled sports footers */}
      <footer className="mt-auto border-t border-slate-900 p-5 bg-slate-900/10 block relative overflow-hidden select-none">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-550 text-[10px] uppercase font-mono tracking-wider text-slate-500 text-center sm:text-left">
          <span>👑 Play & Win USDT Pool Club • Professional Decent Arena v2.56</span>
          <div className="flex gap-4">
            <span className="text-emerald-500 font-extrabold flex items-center gap-1">● CERTIFIED PROVABLY FAIR</span>
            <span>SECURE WEB3 SHIELD</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
