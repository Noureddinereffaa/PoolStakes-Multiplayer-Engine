import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { RoomState, Difficulty, MatchHistory as MatchType } from './types';
import HomePage from './components/HomePage';
import RulesPage from './components/RulesPage';
import MemberDashboard from './components/MemberDashboard';
import ArenaPage from './components/ArenaPage';
import { ShieldAlert, LogOut, User, X } from 'lucide-react';
import { t } from './i18n';
import { useBilliardsSocket } from './useBilliardsSocket';

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

function isMobileAndNotInstalled(): boolean {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
  return isMobile && !(navigator as any).standalone && !window.matchMedia('(display-mode: standalone)').matches;
}

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  return fetch(url, { ...options, headers: { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
}

let toastIdCounter = 0;

export default function App() {
  const navigate = useNavigate();
  const [installed, setInstalled] = useState(false);
  const [showInstallOverlay, setShowInstallOverlay] = useState(false);
  const deferredInstallRef = useRef<any>(null);

  useEffect(() => {
    const onInstallPrompt = (e: any) => { e.preventDefault(); deferredInstallRef.current = e; };
    const onInstalled = () => { setInstalled(true); setShowInstallOverlay(false); addToast('success', languageRef.current === 'ar' ? 'تم التثبيت! افتح التطبيق من الشاشة الرئيسية' : 'App installed! Open from home screen.', 5000); };
    const onStandalone = () => { if (window.matchMedia('(display-mode: standalone)').matches) setInstalled(true); };
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    onStandalone();
    window.matchMedia('(display-mode: standalone)').addEventListener('change', onStandalone);
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.matchMedia('(display-mode: standalone)').removeEventListener('change', onStandalone);
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
  const [apiLogs, setApiLogs] = useState<any[]>([]);
  const [laravelUsers, setLaravelUsers] = useState<any[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchType[]>([]);

  // Client UI States
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const addToast = useCallback((type: 'success' | 'error', message: string, durationMs = 4000) => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), durationMs);
  }, []);
  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);
  const [chatMessage, setChatMessage] = useState('');
  const [joinDifficulty, setJoinDifficulty] = useState<Difficulty>('medium');
  const [language, setLanguage] = useState<'en' | 'ar'>('en');
  const languageRef = useRef(language);
  languageRef.current = language;

  // Initial DB fetches & periodic sync checks
  const fetchLaravelUsers = async () => {
    try {
      const res = await authFetch('/api/laravel/users');
      if (res.ok) {
        const data = await res.json();
        setLaravelUsers(data.users);
        
        // Sync the logged-in user balance with latest database
        if (userSession) {
          const freshUser = data.users.find((u: any) => u.id === userSession.id || u.username === userSession.username);
          if (freshUser) {
            if (freshUser.balance !== userSession.balance) {
              const updated = { ...userSession, balance: freshUser.balance };
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
        setApiLogs(data.logs);
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
    handleJoinRoom,
    handlePreviewAim,
    handleShoot,
    handleResetCueBall,
    handleJoinAI,
    handleSendChat,
    handleRematch,
    handleQuitRoom
  } = useBilliardsSocket({
    username: userSession?.username,
    fetchLaravelUsers,
    setApiLogs,
    setErrorBanner: (msg: string) => addToast('error', msg, 5000)
  });

  // Check saved session on load
  useEffect(() => {
    const saved = localStorage.getItem('billiards_session');
    if (saved) {
      try {
        const Parsed = JSON.parse(saved);
        setUserSession(Parsed);
        navigate('/dashboard');
      } catch (e) {
        console.error('Failed to parse saved session:', e);
      }
    }

    fetchLaravelUsers();
    fetchApiLogs();
  }, []);

  // Sync lobby connection state
  useEffect(() => {
    if (roomState?.status === 'gameover') {
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
  }, [roomState?.log]);

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
        if (isMobileAndNotInstalled()) {
          setShowInstallOverlay(true);
        } else {
          navigate('/dashboard');
        }

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
        if (isMobileAndNotInstalled()) {
          setShowInstallOverlay(true);
        } else {
          navigate('/dashboard');
        }

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

  const handleCopyRoomCode = () => {
    if (!roomState) return;
    navigator.clipboard.writeText(roomState.roomId).then(() => {
      addToast('success', 'Room access code copied. Share it with your opponent!');
    }).catch(() => {
      addToast('error', 'Unable to copy invite code automatically.');
    });
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
      const res = await authFetch('/api/laravel/users');
      if (!res.ok) return;
      const data = await res.json();
      const freshUser = data.users.find((u: any) => u.id === userId);
      if (!freshUser) return;
      const newBalance = Math.max(0, parseFloat((freshUser.balance + delta).toFixed(2)));

      const upd = await authFetch('/api/laravel/users/update', {
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

  const myPlayerObj = roomState?.players.find((p: any) => p.username === userSession!.username);
  const isMyTurn = !!(roomState && roomState.status === 'playing' && myPlayerObj && roomState.currentTurn === myPlayerObj.id);
  const activeEscrow = roomState && roomState.status !== 'waiting' && roomState.status !== 'gameover' ? roomState.stake * 2 : 0;

  return (
    <>
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
          !userSession || isMobileAndNotInstalled() ? (
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
          <RulesPage
            language={language}
            setLanguage={setLanguage}
            onNavigateBack={() => navigate('/')}
            onNavigateDashboard={() => navigate('/dashboard')}
          />
        } />
        <Route path="/dashboard" element={
          userSession && !isMobileAndNotInstalled() ? (
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
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
                if (isMobile && !installed && !(navigator as any).standalone && !window.matchMedia('(display-mode: standalone)').matches) {
                  return setShowInstallOverlay(true);
                }
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
            />
          ) : (
            <Navigate to="/" replace />
          )
        } />
        <Route path="/arena" element={
          userSession ? (
            <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-emerald-500 selection:text-slate-950">

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
                />
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
          ) : (
            <Navigate to="/" replace />
          )
        } />
      </Routes>

      {/* Mobile install overlay (always rendered when active, covers any page) */}
      {showInstallOverlay && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center gap-4 px-6">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-600/30 to-amber-800/30 border-2 border-amber-500/50 flex items-center justify-center shadow-[0_0_60px_rgba(245,158,11,0.2)]">
            <svg className="w-14 h-14 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div className="text-lg font-black font-mono text-amber-400">{language === 'ar' ? 'حمّل التطبيق للعب' : 'DOWNLOAD APP TO PLAY'}</div>
          <div className="text-xs text-amber-600/60 font-mono text-center px-8 max-w-[320px]">{language === 'ar' ? 'يجب تثبيت التطبيق للعب على الهاتف' : 'You must install the app to play on mobile.'}</div>
          <button
            onClick={async () => {
              if (deferredInstallRef.current) {
                deferredInstallRef.current.prompt();
                const res = await deferredInstallRef.current.userChoice;
                if (res.outcome === 'accepted') { setInstalled(true); setShowInstallOverlay(false); addToast('success', languageRef.current === 'ar' ? 'تم التثبيت! افتح التطبيق من الشاشة الرئيسية' : 'App installed! Open from home screen.', 5000); }
              } else {
                setInstalled(true);
                setShowInstallOverlay(false);
                addToast('success', languageRef.current === 'ar' ? 'تم التثبيت! افتح التطبيق من الشاشة الرئيسية' : 'App installed! Open from home screen.', 5000);
              }
            }}
            className="mt-6 px-10 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-base font-black tracking-wider active:scale-95 transition-all shadow-[0_0_30px_rgba(16,185,129,0.4)] hover:shadow-[0_0_50px_rgba(16,185,129,0.6)]"
          >📲 {language === 'ar' ? 'تثبيت التطبيق' : 'INSTALL APP'}</button>
        </div>
      )}
    </>
  );
}
