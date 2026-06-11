import React, { useEffect, useState, useCallback, useRef, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { RoomState, Difficulty, MatchHistory as MatchType } from './types';
import HomePage from './components/HomePage';
import ConnectionStatus from './components/ConnectionStatus';
import InstallGuard from './components/InstallGuard';
import ProtectedRoute from './components/ProtectedRoute';
import { ShieldAlert, LogOut, User, X } from 'lucide-react';
import { t } from './i18n';
import { useBilliardsSocket } from './useBilliardsSocket';
import { usePushNotifications } from './hooks/usePushNotifications';
import { isMobileDevice, requestWakeLock, releaseWakeLock } from './utils/mobile';
import { PageLoader } from './components/ui/Spinner';

const ArenaPage = lazy(() => import('./components/ArenaPage'));
const MemberDashboard = lazy(() => import('./components/MemberDashboard'));
const RulesPage = lazy(() => import('./components/RulesPage'));

interface ToastItem {
  id: number;
  type: 'success' | 'error';
  message: string;
}

interface UserSession {
  id: string;
  username: string;
  balance: number;
  email?: string;
  walletAddress?: string;
  token?: string;
}

function getAuthToken(): string | null {
  try { const s = JSON.parse(localStorage.getItem('billiards_session') || '{}'); return s.token || null; } catch { return null; }
}

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  return fetch(url, { ...options, headers: { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
}

let toastIdCounter = 0;

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  // استعادة التمرير عند مغادرة صفحة الساحة
  function restoreBodyScroll() {
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('position');
    document.body.style.removeProperty('width');
    document.body.style.removeProperty('height');
    document.body.style.removeProperty('top');
    document.body.style.removeProperty('left');
    document.body.style.removeProperty('overscroll-behavior');
    document.documentElement.style.removeProperty('overflow');
    document.documentElement.style.removeProperty('height');
    document.documentElement.style.removeProperty('position');
    // Force reflow to ensure browser processes the changes
    void document.body.offsetHeight;
    window.scrollTo(0, 0);
  }

  useEffect(() => {
    const isArena = location.pathname === '/arena';
    if (!isArena) {
      restoreBodyScroll();
    }
  }, [location.pathname]);

  // تأكد من التمرير عند تحميل الصفحة الرئيسية أول مرة
  useEffect(() => {
    if (location.pathname !== '/arena') {
      restoreBodyScroll();
    }
  }, []);
  const toastTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const mountedRef = useRef(true);
  const gameoverProcessedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => { 
      mountedRef.current = false;
      for (const timer of toastTimersRef.current.values()) clearTimeout(timer);
      toastTimersRef.current.clear();
    };
  }, []);

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

  // Real-time API & Database logs
  const [, setApiLogs] = useState<any[]>([]);
  const [laravelUsers, setLaravelUsers] = useState<any[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchType[]>([]);

  // Client UI States
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const addToast = useCallback((type: 'success' | 'error', message: string, durationMs = 4000) => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev, { id, type, message }]);
    const timer = setTimeout(() => {
      toastTimersRef.current.delete(id);
      setToasts(prev => prev.filter(t => t.id !== id));
    }, durationMs);
    toastTimersRef.current.set(id, timer);
  }, []);
  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);
  const [chatMessage, setChatMessage] = useState('');
  const [joinDifficulty, setJoinDifficulty] = useState<Difficulty>('medium');
  const [language, setLanguage] = useState<'en' | 'ar'>('en');

  // Initial DB fetches & periodic sync checks
  const fetchLaravelUsers = async () => {
    try {
      const res = await authFetch('/api/laravel/users');
      if (res.ok) {
        const data = await res.json();
        if (mountedRef.current) {
          setLaravelUsers(data.users);
          
          // Sync the logged-in user balance with latest database
          if (userSession && data.currentUser) {
            const freshBalance = Number(data.currentUser.balance);
            if (freshBalance !== userSession.balance) {
              const updated = { ...userSession, balance: freshBalance };
              setUserSession(updated);
              localStorage.setItem('billiards_session', JSON.stringify(updated));
            }
          }
        }
      }
    } catch (e) {
      console.error('Failed to retrieve Laravel platform users:', e);
    }
  };

  const fetchApiLogs = async () => {
    try {
      const res = await authFetch('/api/laravel/logs');
      if (res.ok) {
        const data = await res.json();
        if (mountedRef.current) {
          setApiLogs(data.logs);
        }
      }
    } catch (e) {
      console.error('Failed to retrieve API audit logs:', e);
    }
  };

  const {
    roomId,
    setRoomId,
    roomState,
    physicsFrames,
    setPhysicsFrames,
    opponentAim,
    isReconnecting,
    connectionGrade,
    isOffline,
    handleJoinRoom,
    handlePreviewAim,
    handleShoot,
    handleResetCueBall,
    handleJoinAI,
    handleSendChat,
    handleRematch,
    handleQuitRoom,
    publicRooms,
    roomCreationCode,
    handleCreateRoom,
    handleListRooms,
    handleJoinByCode,
    handleJoinRandom,
    handleCancelWaiting,
    isSearching,
    ensureWsConnected,
  } = useBilliardsSocket({
    username: userSession?.username,
    fetchLaravelUsers,
    setApiLogs,
    setErrorBanner: (msg: string | null) => msg !== null ? addToast('error', msg, 5000) : null
  });

  const sessionToken = userSession?.token || null;
  usePushNotifications(sessionToken);

  // Check saved session on load
  useEffect(() => {
    const saved = localStorage.getItem('billiards_session');
    if (saved) {
      try {
        const Parsed = JSON.parse(saved);
        if (Parsed.token) {
          // Verify token is still valid with the server
          authFetch('/api/laravel/users').then(res => {
            if (res.ok) {
              if (mountedRef.current) setUserSession(Parsed);
              navigate('/dashboard');
            } else {
              // Token expired or invalid - clear session
              localStorage.removeItem('billiards_session');
              if (mountedRef.current) navigate('/');
            }
          }).catch(() => {
            // Network error — session may still be valid, allow access
            if (mountedRef.current) { setUserSession(Parsed); }
            navigate('/dashboard');
          });
        }
      } catch (e) {
        console.error('Failed to parse saved session:', e);
        localStorage.removeItem('billiards_session');
      }
    }

    fetchLaravelUsers();
    fetchApiLogs();
  }, []);

  // Auto-navigate to arena when a game state arrives from dashboard
  const prevRoomStateRef = useRef<RoomState | null>(null);
  useEffect(() => {
    const prev = prevRoomStateRef.current;
    const curr = roomState;
    prevRoomStateRef.current = curr;
    if (!curr || location.pathname !== '/dashboard') return;
    const prevPlayers = prev?.players?.length ?? 0;
    const currPlayers = curr.players?.length ?? 0;
    if (currPlayers >= 1 || curr.status === 'ready' || curr.status === 'playing') {
      navigate('/arena');
    }
  }, [roomState, location.pathname, navigate]);

  // Ensure WebSocket is connected when user is on the dashboard or arena (no active game)
  useEffect(() => {
    if (userSession && (location.pathname === '/dashboard' || (location.pathname === '/arena' && !roomState))) {
      ensureWsConnected();
    }
  }, [location.pathname, roomState, userSession, ensureWsConnected]);

  // Reconnect to active game on page refresh
  useEffect(() => {
    if (location.pathname === '/arena' && !roomState && userSession) {
      const savedRoomId = (() => { try { return sessionStorage.getItem('arena_room_id'); } catch { return null; } })();
      const savedStake = (() => { try { return Number(sessionStorage.getItem('arena_stake')) || 25; } catch { return 25; } })();
      if (savedRoomId) {
        handleJoinRoom(savedRoomId, savedStake);
      }
    }
  }, [location.pathname, roomState, userSession, handleJoinRoom]);

  // Wake lock for mobile when in game
  useEffect(() => {
    if (roomState && (roomState.status === 'playing' || roomState.status === 'ready')) {
      if (isMobileDevice()) requestWakeLock();
    } else {
      if (isMobileDevice()) releaseWakeLock();
    }
    return () => { releaseWakeLock(); };
  }, [roomState?.status]);

  // Sync lobby connection state
  useEffect(() => {
    if (roomState?.status === 'gameover' && mountedRef.current) {
      const roomKey = roomState.name;
      if (gameoverProcessedRef.current.has(roomKey)) return;
      gameoverProcessedRef.current.add(roomKey);

      fetchLaravelUsers();
      // append history locally
      const winnerName = roomState.players.find((p: any) => p.id === roomState.winnerId)?.username || 'Winner';
      const loserName = roomState.players.find((p: any) => p.id !== roomState.winnerId)?.username || 'Loser';
      
      const newMatch: MatchType = {
        id: `match-${Date.now()}`,
        roomName: roomState.name,
        winnerName,
        loserName,
        stake: roomState.stake,
        prizeAmount: roomState.stake * 2 * 0.95,
        commission: roomState.stake * 2 * 0.05,
        timestamp: new Date().toLocaleTimeString(),
        pocketsByWinner: roomState.balls.filter((b: any) => b.id !== 0 && b.isPocketed).length
      };

      setMatchHistory(prev => {
        if (prev.some(m => m.roomName === roomState.name && m.winnerName === winnerName)) return prev;
        return [newMatch, ...prev];
      });
    }
  }, [roomState?.status, roomState?.winnerId]);

  // Handle User Registration
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUser.trim() || !regPass) return;
    setIsAuthLoading(true);

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
          walletAddress: data.user.walletAddress,
          token: data.token
        };
        setUserSession(session);
        localStorage.setItem('billiards_session', JSON.stringify(session));
        navigate('/dashboard');

        addToast('success', 'Account Welcome Pack Loaded! You received 500.00 USDT credit bonus!', 5000);
        
        fetchLaravelUsers();
      } else {
        addToast('error', data.error || 'Registration failed. Choose a different username.');
      }
    } catch (e) {
      addToast('error', 'Backend servers unresponsive. Try again.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Handle User Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUser.trim() || !loginPass) return;
    setIsAuthLoading(true);

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
          walletAddress: data.user.walletAddress,
          token: data.token
        };
        setUserSession(session);
        localStorage.setItem('billiards_session', JSON.stringify(session));
        navigate('/dashboard');

        addToast('success', `Welcome back ${session.username}! Lounge access granted.`);
        
        fetchLaravelUsers();
      } else {
        addToast('error', data.error || 'Password mismatch or user doesn\'t exist.');
      }
    } catch (e) {
      addToast('error', 'Network API endpoint offline.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Sign out / Exit Pool Room
  const handleSignout = () => {
    handleQuitRoom();
    setUserSession(null);
    navigate('/');
    localStorage.removeItem('billiards_session');
    addToast('success', 'Secure logout complete. Your USDT balance is archived.');
  };

  const handleShareRoom = () => {
    if (!roomState) return;
    if ((navigator as any).share) {
      (navigator as any).share({
        title: '8-Ball Pool',
        text: `Join my 8-Ball Pool game! Room: ${roomState.roomId}`,
        url: window.location.origin,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(roomState.roomId).then(() => {
        addToast('success', 'Room access code copied. Share it with your opponent!');
      }).catch(() => {
        addToast('error', 'Unable to copy invite code automatically.');
      });
    }
  };

  const onChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendChat(chatMessage);
    setChatMessage('');
  };

  const onQuitRoomClick = () => {
    handleQuitRoom();
    navigate('/dashboard');
    addToast('success', 'Successfully exited Room. Your assets have returned safely to wallet ledger.');
  };

  const handleModifyBalance = async (userId: string, delta: number) => {
    try {
      const upd = await authFetch('/api/laravel/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, delta })
      });
      if (upd.ok) {
        await fetchLaravelUsers();
        setApiLogs(prev => [
          {
            id: `log-${Date.now()}`,
            apiName: 'MANUAL LEDGER MODIFICATION',
            payload: { userId, delta },
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

  const myPlayerObj = roomState?.players.find((p: any) => p.username === userSession?.username);
  const isMyTurn = !!(roomState && roomState.status === 'playing' && myPlayerObj && roomState.currentTurn === myPlayerObj.id);
  const activeEscrow = roomState && roomState.status !== 'waiting' && roomState.status !== 'gameover' ? roomState.stake * 2 : 0;

  return (
    <InstallGuard language={language} onInstallComplete={() => localStorage.setItem('pwa_installed', 'true')}>
      {/* Toast notification stack */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-md">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`relative p-4 rounded-xl shadow-2xl flex items-center gap-3 animate-fadeIn border overflow-hidden ${
              toast.type === 'error'
                ? 'bg-red-950 border-red-500/40 text-red-200'
                : 'bg-gradient-to-r from-amber-950 to-amber-900 border-amber-500/40 text-amber-200'
            }`}
          >
            {toast.type === 'error' ? (
              <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 animate-pulse" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-400 text-xs shrink-0">✓</div>
            )}
            <div className="text-xs font-mono flex-1">{toast.message}</div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-current/50 hover:text-current/80 transition shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            {toast.type === 'success' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-500 to-amber-300 animate-shrink-right" style={{animationDuration: '4s'}} />
            )}
          </div>
        ))}
      </div>

      <Routes>
        <Route path="/" element={
          !userSession ? (
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
              language={language}
              setLanguage={setLanguage}
              onNavigateToRules={() => navigate('/rules')}
            />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        } />
        <Route path="/rules" element={
          <Suspense fallback={<PageLoader />}>
            <RulesPage
              language={language}
              setLanguage={setLanguage}
              onNavigateBack={() => navigate('/')}
              onNavigateDashboard={() => navigate('/dashboard')}
            />
          </Suspense>
        } />
        <Route path="/dashboard" element={
          <ProtectedRoute userSession={userSession}>
            <Suspense fallback={<PageLoader />}>
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
              onJoinRoom={(targetRoomId: string, customStake: number, autoJoinAI?: boolean | Difficulty) => {
                handleJoinRoom(targetRoomId, customStake, autoJoinAI || false);
                navigate('/arena');
              }}
              onNavigateRules={() => navigate('/rules')}
              onDeposit={(amount, address, method) => {
                if (userSession) {
                  handleModifyBalance(userSession.id, amount);
                  addToast('success', `Deposit confirmed: ${amount} USDT credited to your account.`);
                }
              }}
              onWithdraw={(amount, address, method) => {
                if (userSession) {
                  if (userSession.balance < amount) {
                    addToast('error', 'Insufficient balance for this withdrawal.');
                    return;
                  }
                  handleModifyBalance(userSession.id, -amount);
                  addToast('success', `Withdrawal approved: ${amount} USDT sent to ${address || userSession.walletAddress || 'wallet'}.`);
                }
              }}
              publicRooms={publicRooms}
              roomCreationCode={roomCreationCode}
              isSearching={isSearching}
              onCreateRoom={handleCreateRoom}
              onListRooms={handleListRooms}
              onJoinByCode={handleJoinByCode}
              onJoinRandom={handleJoinRandom}
              onCancelWaiting={handleCancelWaiting}
              onSignOut={handleSignout}
            />
            </Suspense>
          </ProtectedRoute>
        } />
        <Route path="/arena" element={
          <ProtectedRoute userSession={userSession}>
            <Suspense fallback={<PageLoader />}>
            <div id="arena-container" dir={language === 'ar' ? 'rtl' : 'ltr'} className="h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-emerald-500 selection:text-slate-950">

              {/* Visual background emerald radial glow highlights */}
              <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-emerald-500/5 rounded-full filter blur-[120px] pointer-events-none" />
              <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-amber-500/5 rounded-full filter blur-[140px] pointer-events-none" />

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
                      onClick={() => { if (roomState) handleQuitRoom(); navigate('/'); }}
                      className="text-xs font-bold uppercase text-slate-400 hover:text-emerald-200"
                    >
                      {t(language, 'home')}
                    </button>
                    <button
                      onClick={() => { if (roomState) handleQuitRoom(); navigate('/rules'); }}
                      className="text-xs font-bold uppercase text-slate-400 hover:text-emerald-200"
                    >
                      {t(language, 'rules')}
                    </button>
                    {userSession && (
                      <button
                        onClick={() => { if (roomState) handleQuitRoom(); navigate('/dashboard'); }}
                        className="text-xs font-bold uppercase text-slate-400 hover:text-emerald-200"
                      >
                        {t(language, 'dashboard')}
                      </button>
                    )}
                  </div>
                </div>

                {userSession ? (
                  <div className="flex items-center gap-2">
                    <ConnectionStatus connectionGrade={connectionGrade} isOffline={isOffline} language={language} />
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
                <ArenaPage
                  roomState={roomState}
                  userSession={userSession}
                  language={language}
                  onQuitRoom={onQuitRoomClick}
                  myPlayerObj={myPlayerObj}
                  isMyTurn={isMyTurn}
                  physicsFrames={physicsFrames}
                  setPhysicsFrames={setPhysicsFrames}
                  handleShoot={handleShoot}
                  handleResetCueBall={handleResetCueBall}
                  opponentAim={opponentAim}
                  handlePreviewAim={handlePreviewAim}
                  handleJoinAI={handleJoinAI}
                  handleRematch={handleRematch}
                  chatMessage={chatMessage}
                  setChatMessage={setChatMessage}
                  handleSendChat={handleSendChat}
                  connectionGrade={connectionGrade}
                  isOffline={isOffline}
                />
                {isReconnecting && roomState?.status === 'playing' && (
                  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="p-6 rounded-2xl border border-amber-500/30 bg-gradient-to-b from-[#1a1208] to-[#0d0806] shadow-[0_0_60px_rgba(245,158,11,0.15)] text-center">
                      <div className="flex items-center justify-center gap-3 mb-2">
                        <span className="w-3 h-3 rounded-full bg-amber-400 animate-ping shadow-[0_0_10px_#f59e0b]" />
                        <span className="text-lg font-black font-mono text-amber-400">{language === 'ar' ? 'جاري إعادة الاتصال...' : 'RECONNECTING...'}</span>
                      </div>
                      <p className="text-xs font-mono text-amber-600/70">{language === 'ar' ? 'يرجى الانتظار، نحاول استعادة الاتصال بالمباراة' : 'Please wait while we restore your connection to the match'}</p>
                    </div>
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
            </Suspense>
          </ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </InstallGuard>
  );
}
