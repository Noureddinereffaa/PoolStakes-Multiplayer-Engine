import React, { useEffect, useState, useRef } from 'react';
import { RoomState, Ball, MatchHistory as MatchType } from './types';
import PoolTable from './components/PoolTable';
import MatchHistory from './components/MatchHistory';
import { 
  Trophy, 
  MessageSquare, 
  Send, 
  ExternalLink, 
  ShieldAlert, 
  AlertCircle,
  Coins,
  LogOut,
  User,
  Wallet,
  Key,
  Mail,
  ArrowRight,
  Lock,
  Plus,
  Play,
  RefreshCw,
  Cpu,
  Globe,
  History,
  UserPlus,
  ArrowDownRight,
  ArrowUpRight,
  LockKeyhole,
  Sparkles,
  Timer,
  ChevronRight,
  CheckCircle2,
  Tv,
  Info
} from 'lucide-react';

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
  
  // Active game & lobby states
  const [currentUser, setCurrentUser] = useState('CueMaster');
  const [stake, setStake] = useState(25);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [physicsFrames, setPhysicsFrames] = useState<any[] | null>(null);
  
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
  
  // Auth Form UI
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [regUser, setRegUser] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regWallet, setRegWallet] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Financial simulation state
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('100');
  const [depositAddress, setDepositAddress] = useState('');
  const [depositMethod, setDepositMethod] = useState('crypto');
  const [withdrawAmount, setWithdrawAmount] = useState('100');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState('crypto');

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
        setCurrentUser(Parsed.username);
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
        setCurrentUser(session.username);
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
        setCurrentUser(session.username);
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
    setCurrentUser(session.username);
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

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'join',
        roomId: targetRoomId,
        username: currentUser,
        stake: customStake
      }));
      
      if (autoJoinAI) {
        const difficulty = typeof autoJoinAI === 'string' ? autoJoinAI : 'medium';
        ws.send(JSON.stringify({
          type: 'set_ai_opponent',
          difficulty
        }));
      }
      
      setErrorBanner(null);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        switch (msg.type) {
          case 'sync_state':
            setRoomState(msg.state);
            fetchLaravelUsers();
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

  // Challenge AI bot for free (0 USDT stake)
  const handleLaunchFreeBotDuel = () => {
    const practiceRoom = `Practice_${currentUser.replace(/\s+/g, '_')}_${Date.now()}`;
    setStake(0); // Free play
    handleJoinRoom(practiceRoom, 0, joinDifficulty);
    setSuccessBanner(`Loading private practice arena with ${joinDifficulty.toUpperCase()} AI Bot Opponent...`);
    setTimeout(() => setSuccessBanner(null), 4000);
  };

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

  // Deposit/Withdrawal financial simulator transactions logic
  const handleModifyBalance = async (userId: string, amount: number) => {
    try {
      const res = await fetch('/api/laravel/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount })
      });
      if (res.ok) {
        await fetchLaravelUsers();
        setApiLogs(prev => [
          {
            id: `log-${Date.now()}`,
            apiName: 'MANUAL LEDGER MODIFICATION',
            payload: { userId, amountAdded: amount },
            response: { success: true, message: 'Balance completed instantly' },
            timestamp: new Date().toISOString()
          },
          ...prev
        ]);
      }
    } catch (e) {
      console.error('Could not modify balance in databases:', e);
    }
  };

  const handleDepositSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(depositAmount) || 100;
    if (userSession) {
      handleModifyBalance(userSession.id, userSession.balance + amt);
      setSuccessBanner(`Checkout secure! ${amt} USDT was credited to your ledger.`);
      setTimeout(() => setSuccessBanner(null), 4000);
      setIsDepositOpen(false);
    }
  };

  const handleWithdrawSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(withdrawAmount) || 50;
    if (userSession) {
      if (userSession.balance < amt) {
        setErrorBanner('Insufficient USDT funds in player bankroll wallet.');
        setTimeout(() => setErrorBanner(null), 4000);
        return;
      }
      handleModifyBalance(userSession.id, userSession.balance - amt);
      setSuccessBanner(`Cashout Approved! ${amt} USDT was sent to the wallet address: ${withdrawAddress || userSession.walletAddress || 'Registered Addr'}`);
      setTimeout(() => setSuccessBanner(null), 6000);
      setIsWithdrawOpen(false);
    }
  };

  const myPlayerObj = roomState?.players.find(p => p.username === currentUser);
  const isMyTurn = !!(roomState && roomState.status === 'playing' && myPlayerObj && roomState.currentTurn === myPlayerObj.id);
  const activeEscrow = roomState && roomState.status !== 'waiting' && roomState.status !== 'gameover' ? roomState.stake * 2 : 0;

  // Sorting high scores leaderboards
  const leaderboardList = [...laravelUsers]
    .filter(u => u.id !== 'ai-bot')
    .sort((a,b) => b.balance - a.balance)
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased selection:bg-emerald-500 selection:text-slate-950">
      
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

        {userSession ? (
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col items-end text-right">
              <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-500" /> {userSession.username}
              </span>
              <span className="text-[9px] font-mono text-slate-600 truncate max-w-[150px]">
                {userSession.walletAddress ? `${userSession.walletAddress.substring(0, 5)}...${userSession.walletAddress.substring(userSession.walletAddress.length - 4)}` : 'No Wallet Listed'}
              </span>
            </div>
            
            <div className="p-1 px-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2">
              <span className="text-xs font-bold font-mono text-emerald-400">
                {userSession.balance.toFixed(2)} USDT
              </span>
            </div>

            <button 
              onClick={handleSignout}
              className="p-2 border border-slate-800 hover:border-red-500/30 text-slate-400 hover:text-red-400 rounded-lg transition-all duration-250 cursor-pointer"
              title="Sign Out Account"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-500 animate-pulse hidden sm:inline">● SECURE CHANNELS SECURED</span>
          </div>
        )}
      </header>

      {/* SCREEN 1: LANDING & AUTH PAGE (IF NOT LOGGED IN) */}
      {!userSession ? (
        <div className="flex-1 flex flex-col justify-center items-center py-10 px-4 max-w-7xl mx-auto w-full gap-12 font-sans select-none">
          
          {/* Main Hero Marketing Panel */}
          <div className="text-center flex flex-col items-center gap-4 max-w-3xl animate-fadeIn">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-mono rounded-lg flex items-center gap-2 mb-2 font-black tracking-wider uppercase">
              <Sparkles className="w-4 h-4 animate-spin text-emerald-400" />
              Standardized Decentralized PvP Payout Arena
            </div>
            
            <h2 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white uppercase leading-none font-sans">
              THE ULTIMATE CRYPTO <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-yellow-400 to-amber-500">
                8-BALL COMBAT ARENA
              </span>
            </h2>
            
            <p className="text-slate-400 text-sm sm:text-lg leading-relaxed mt-1 max-w-2xl font-mono">
              Leverage your billiard angles with high stakes. Lock standard USDT wagers, dominate the authoritative real-time felt, and cashout high-octane peer payouts in 60 seconds!
            </p>

            <div className="flex items-center gap-4 flex-wrap justify-center mt-3 text-xs text-slate-500 font-mono">
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Server-Authoritative Physics</span>
              <span>•</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Instantly Simulated TRC20 Cashouts</span>
              <span>•</span>
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> 5% House Fee Pool</span>
            </div>
          </div>

          {/* Core Feature Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 w-full text-slate-350">
            <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 hover:border-emerald-500/20 transition-all group flex flex-col gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 text-lg font-black group-hover:scale-110 transition-transform">
                ⚔️
              </div>
              <h4 className="font-bold text-white text-md uppercase tracking-tight">PVP Matchmaker</h4>
              <p className="text-xs text-slate-400 leading-normal font-mono">
                Face global billiard sharks across custom stakes from 5 USDT to 1,000 USDT. Absolute winner-takes-all mechanics.
              </p>
            </div>

            <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 hover:border-emerald-500/20 transition-all group flex flex-col gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 text-lg font-black group-hover:scale-110 transition-transform">
                🤖
              </div>
              <h4 className="font-bold text-white text-md uppercase tracking-tight">Free Bot Duel</h4>
              <p className="text-xs text-slate-400 leading-normal font-mono">
                No funds at risk? Fine. Duel our highly calibrated physics bot at 0 cost. Develop precise angle trajectories anytime!
              </p>
            </div>

            <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 hover:border-emerald-500/20 transition-all group flex flex-col gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-400 text-lg font-black group-hover:scale-110 transition-transform">
                💳
              </div>
              <h4 className="font-bold text-white text-md uppercase tracking-tight">Instant TRC20 Gate</h4>
              <p className="text-xs text-slate-400 leading-normal font-mono">
                Seamless deposit and withdrawal checkout simulator. Enter your crypto TRC20 layout and cash out automatically!
              </p>
            </div>

            <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 hover:border-emerald-500/20 transition-all group flex flex-col gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 text-lg font-black group-hover:scale-110 transition-transform">
                🛡️
              </div>
              <h4 className="font-bold text-white text-md uppercase tracking-tight">Audit Ledgers</h4>
              <p className="text-xs text-slate-400 leading-normal font-mono">
                Verify each payout through live cryptographic hashes. Audited in-depth logs showcase real-time transaction signatures.
              </p>
            </div>
          </div>

          {/* Registration Section and Standings Leaderboard columns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full mt-4">
            
            {/* Column Left: Live High-Rollers list & stats */}
            <div className="bg-slate-900/30 border border-slate-900 rounded-3xl p-6 flex flex-col gap-5 justify-between">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-white mb-2 uppercase flex items-center gap-2">
                  🏆 HALL OF CHAMPION HIGH-ROLLERS
                </h3>
                <p className="text-xs text-slate-400 font-mono leading-relaxed">
                  Real-time leaderboard payouts of registered billiard members. Your performance determines your bankroll rank!
                </p>
              </div>

              <div className="flex flex-col gap-3 font-mono my-2.5">
                {leaderboardList.length === 0 ? (
                  <div className="text-xs text-slate-600 italic">Pre-fetching top tournament seed database...</div>
                ) : (
                  leaderboardList.map((user, idx) => (
                    <div 
                      key={user.id} 
                      className={`p-3 bg-slate-950/80 border rounded-xl flex items-center justify-between transition-colors ${
                        idx === 0 ? 'border-amber-500/20 bg-amber-500/5' : 'border-slate-905'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-lg font-black text-xs flex items-center justify-center ${
                          idx === 0 ? 'bg-amber-500 text-slate-950' :
                          idx === 1 ? 'bg-slate-450 text-slate-900 font-bold bg-slate-400' :
                          idx === 2 ? 'bg-amber-800 text-slate-100' :
                          'bg-slate-900 text-slate-400'
                        }`}>
                          {idx + 1}
                        </span>
                        <div>
                          <div className="text-xs font-black text-slate-100 flex items-center gap-1.5">
                            {user.username}
                          </div>
                          <span className="text-[8px] text-slate-650 opacity-60">REGISTRY: Verified Wallet Verified</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-emerald-450 text-emerald-400">
                          ${user.balance.toFixed(2)} USDT
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Verified Badge */}
              <div className="p-4 bg-emerald-950/20 border border-emerald-500/10 rounded-2xl flex items-center gap-3">
                <div className="text-lg">🔐</div>
                <span className="text-[10px] text-emerald-400 leading-normal font-mono flex-1">
                  <strong>PROMOTIONAL BONUS ON SIGNUP:</strong> Register an original wallet key today and receive <strong>$500.00 USDT Credit</strong> welcomed immediately into your betting wallet!
                </span>
              </div>
            </div>

            {/* Column Right: Interactive Registration & Login forms */}
            <div className="bg-slate-900/60 border border-slate-900 rounded-3xl p-6 flex flex-col gap-4 shadow-xl select-none relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-emerald-500 to-yellow-500" />
              
              {/* Form switcher tabs */}
              <div className="grid grid-cols-2 bg-slate-950 p-1 border border-slate-900 rounded-xl mb-2 font-mono text-xs text-slate-400">
                <button
                  type="button"
                  onClick={() => setAuthTab('login')}
                  className={`py-2 rounded-lg font-bold transition-colors cursor-pointer ${
                    authTab === 'login' ? 'bg-emerald-500 text-slate-950' : 'hover:text-slate-200'
                  }`}
                >
                  ACCESS LOUNGE (Login)
                </button>
                <button
                  type="button"
                  onClick={() => setAuthTab('register')}
                  className={`py-2 rounded-lg font-bold transition-colors cursor-pointer ${
                    authTab === 'register' ? 'bg-emerald-500 text-slate-950' : 'hover:text-slate-200'
                  }`}
                >
                  CREATE WALLET (Register)
                </button>
              </div>

              {/* Login Form */}
              {authTab === 'login' && (
                <form onSubmit={handleLoginSubmit} className="flex flex-col gap-3 font-mono animate-fadeIn">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-emerald-500" /> Username / Registered Email:
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. mohawkbigger or PoolMaster99"
                      value={loginUser}
                      onChange={(e) => setLoginUser(e.target.value)}
                      className="bg-slate-950 border border-slate-850 focus:border-emerald-500 text-slate-100 text-xs rounded-xl p-3 focus:outline-none transition-all font-bold placeholder-slate-650"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Key className="w-3.5 h-3.5 text-emerald-500" /> Account Security Pin (Password):
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={loginPass}
                      onChange={(e) => setLoginPass(e.target.value)}
                      className="bg-slate-950 border border-slate-850 focus:border-emerald-500 text-slate-100 text-xs rounded-xl p-3 focus:outline-none transition-all font-bold placeholder-slate-650"
                    />
                    <span className="text-[9px] text-slate-600 block">Default password for seeds is '123456'</span>
                  </div>

                  <button
                    type="submit"
                    disabled={isAuthLoading}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold p-3 rounded-xl transition-all font-sans uppercase mt-2 shadow-lg disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isAuthLoading ? 'Authorizing credentials...' : 'Enter Betting Club'} 
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              {/* Registration Form */}
              {authTab === 'register' && (
                <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-3 font-mono animate-fadeIn">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-emerald-500" /> Username:
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. SharpShooter"
                        value={regUser}
                        onChange={(e) => setRegUser(e.target.value)}
                        className="bg-slate-950 border border-slate-850 focus:border-emerald-500 text-slate-100 text-xs rounded-xl p-3 focus:outline-none font-bold"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-emerald-500" /> Contact Email:
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="shoot@billiardusdt.com"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        className="bg-slate-950 border border-slate-850 focus:border-emerald-500 text-slate-100 text-xs rounded-xl p-3 focus:outline-none font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Key className="w-3.5 h-3.5 text-emerald-500" /> Access Password:
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="Create security password"
                      value={regPass}
                      onChange={(e) => setRegPass(e.target.value)}
                      className="bg-slate-950 border border-slate-850 focus:border-emerald-500 text-slate-100 text-xs rounded-xl p-3 focus:outline-none font-bold"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1-5">
                      🎒 Receiving USDT TRC20 Wallet (For cashouts):
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. TY7v19asUnV9scwN829g101Hsuj"
                      value={regWallet}
                      onChange={(e) => setRegWallet(e.target.value)}
                      className="bg-slate-950 border border-slate-850 focus:border-emerald-500 text-slate-100 text-xs rounded-xl p-3 focus:outline-none font-bold"
                    />
                    <span className="text-[8.5px] text-slate-550 italic leading-normal">Required for fast withdrawals. Non-crypto players can also use card checkout inside dashboard.</span>
                  </div>

                  <button
                    type="submit"
                    disabled={isAuthLoading}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold p-3 rounded-xl transition-all font-sans uppercase mt-1 shadow-lg disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isAuthLoading ? 'Deploying wallet credentials...' : 'Register & Claim 500 USDT'} 
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              {/* Free Sandbox Access Divider */}
              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-900"></div>
                <span className="flex-shrink mx-4 text-[10px] text-slate-600 font-mono">OR PRACTICE WITHOUT RISK</span>
                <div className="flex-grow border-t border-slate-900"></div>
              </div>

              {/* Free Play Actions */}
              <button
                onClick={handleQuickGuest}
                className="w-full py-3 border border-slate-800 hover:border-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-mono font-bold transition-all bg-slate-950/60 flex items-center justify-center gap-2 hover:bg-slate-900/40 cursor-pointer"
              >
                <span>🚀 Play instantly as guest (No signup needed)</span>
              </button>
            </div>

          </div>

        </div>
      ) : (

        /* SCREEN 2: PREMIUM MEMBER CONSOLE & MAIN LOUNGE (LOGGED IN) */
        <div className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 flex flex-col gap-6">
          
          {/* Active room match container is prioritized if connected */}
          {roomState ? (
            <div className="flex flex-col gap-6 animate-fadeIn">
              
              {/* Active Match top scoreboard / header banner */}
              <div className="bg-slate-900 border border-emerald-500/20 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 font-mono shadow-xl relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-[2px] bg-emerald-400 animate-pulse" />
                <div className="flex items-center gap-3">
                  <span className="text-xl animate-spin inline-block">🎱</span>
                  <div>
                    <h3 className="text-xs font-black text-slate-200">ACTIVE MULTIPLAYER MATCHUP</h3>
                    <p className="text-[10px] text-slate-500">Arena: {roomState.name} • Pool Rule: Standard 8-ball</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-center">
                  <div className="px-3 py-1.5 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-[8px] text-slate-500 block">TOTAL PRIZE POOL</span>
                    <span className="text-xs font-black text-emerald-400">${(roomState.stake * 2 * 0.95).toFixed(2)} USDT</span>
                  </div>
                  <div className="px-3 py-1.5 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-[8px] text-slate-500 block">STAKE EACH CUEIST</span>
                    <span className="text-xs font-black text-amber-500">${roomState.stake} USDT</span>
                  </div>
                </div>

                <button
                  onClick={handleQuitRoom}
                  className="px-4 py-2 bg-gradient-to-r from-red-950 to-red-900 hover:from-red-900 hover:to-red-800 text-red-200 hover:text-white rounded-lg text-xs font-bold border border-red-500/20 transition-all cursor-pointer shadow-lg w-full sm:w-auto"
                >
                  🏳️ Surrender & Quit Arena
                </button>
              </div>

              {/* Two Column Active Game View */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Left Column: Interactive 3D Canvas Board */}
                <div className="lg:col-span-8 bg-slate-900/40 p-4 border border-slate-900 rounded-3xl flex flex-col items-center justify-center shadow-2xl">
                  {roomState ? (
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
                  ) : (
                    <div className="w-full h-[400px] bg-slate-950 rounded-2xl flex items-center justify-center">
                      <span className="text-slate-500 font-mono text-xs animate-pulse">Establishing game synchronizer...</span>
                    </div>
                  )}
                </div>

                {/* Right Column: Active Match Stats / Chats / Verification */}
                <div className="lg:col-span-4 flex flex-col gap-4">
                  
                  {/* Seating roster with ball indicators */}
                  <div className="bg-slate-900 border border-slate-850 rounded-2xl p-4 flex flex-col gap-3 shadow-xl font-mono">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Players Seating Positions</span>
                    
                    {roomState.players.map((p, i) => (
                      <div key={p.id} className={`p-2.5 rounded-lg border flex items-center justify-between ${
                        p.username === currentUser ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-slate-950 border-slate-905'
                      }`}>
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] bg-slate-900 p-1 rounded font-bold text-slate-500">SEAT {i+1}</span>
                          <span className="text-xs font-bold text-slate-200 truncate max-w-[120px]">{p.username}</span>
                          {p.username.startsWith('Bot_') && <span className="text-[8px] bg-amber-500/10 text-amber-500 px-1 rounded">bot</span>}
                          {p.side && (
                            <span className={`text-[8.5px] px-1 rounded uppercase font-black ${
                              p.side === 'solids' ? 'bg-amber-500 text-slate-950' : 'bg-blue-500 text-white'
                            }`}>
                              {p.side}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-emerald-400">${p.walletBalance.toFixed(2)}</span>
                      </div>
                    ))}

                    {roomState.players.length === 1 && (
                      <div className="p-3 bg-indigo-950/20 border border-indigo-500/25 rounded-lg flex flex-col gap-2">
                        <span className="text-[9px] text-indigo-400">WAITING FOR OPPONENT TO SEAT</span>
                        <p className="text-[10px] text-slate-400 leading-normal">Wager match hosted. Share the Access Code `{roomState.id}` for other players to sit or trigger active Bot opponent instead.</p>
                        <button
                          onClick={() => handleJoinAI('medium')}
                          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[9px] py-1.5 rounded transition-all cursor-pointer uppercase"
                        >
                          Summon Practice Bot Inside
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Secure match token escrow integrity */}
                  {activeEscrow > 0 && (
                    <div className="bg-slate-900 border border-emerald-500/15 p-4 rounded-2xl flex flex-col gap-2.5 font-mono">
                      <div className="flex items-center justify-between pointer-events-none">
                        <span className="text-[9px] text-emerald-400 flex items-center gap-1 font-extrabold uppercase">
                          <Lock className="w-3.5 h-3.5 text-emerald-500" /> Secure Escrow Active
                        </span>
                        <span className="text-[8px] bg-emerald-500/10 text-emerald-400 px-1 rounded text-right uppercase">Audited</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div>
                          <span className="text-[8px] text-slate-500 block">STAKES TOTAL LOCKED</span>
                          <span className="font-extrabold text-slate-200">${activeEscrow.toFixed(2)} USDT</span>
                        </div>
                        <div>
                          <span className="text-[8px] text-slate-500 block">NET TO WINNER (95%)</span>
                          <span className="font-extrabold text-emerald-400">${(activeEscrow * 0.95).toFixed(2)} USDT</span>
                        </div>
                      </div>

                      {roomState.escrowHash && (
                        <div className="border-t border-slate-950 pt-2.5">
                          <span className="text-[7.5px] text-slate-600 dark:text-slate-500 block mb-0.5">SHA256 Match Integrity Signature:</span>
                          <div className="text-[8px] bg-slate-950 p-1 rounded border border-slate-800 text-emerald-500 truncate select-all">{roomState.escrowHash}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Match Lobby Real-time Chats */}
                  <div className="bg-slate-900 border border-slate-850 rounded-2xl p-4 flex flex-col gap-3 font-mono shadow-xl relative">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-400 font-bold uppercase flex items-center gap-1.5">
                        <MessageSquare className="w-4 h-4 text-emerald-500 animate-pulse" /> Arena Chatbox
                      </span>
                      <span className="text-slate-600">Secure Peer Channel</span>
                    </div>

                    <div 
                      ref={chatScrollRef}
                      className="bg-slate-950 rounded-lg p-2.5 border border-slate-905 max-h-[160px] overflow-y-auto flex flex-col gap-2 scrollbar-thin"
                    >
                      {roomState.log.map((logStr, idx) => {
                        let isSystem = !logStr.includes(':');
                        return (
                          <div 
                            key={idx} 
                            className={`text-[10px] leading-relaxed break-words font-mono ${
                              isSystem ? 'text-amber-500 border-l border-amber-500/20 pl-1.5 py-0.5 italic text-[9.5px]' : 'text-slate-350'
                            }`}
                          >
                            {logStr}
                          </div>
                        );
                      })}
                    </div>

                    <form onSubmit={handleSendChat} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Wager chat message..."
                        value={chatMessage}
                        onChange={(e) => setChatMessage(e.target.value)}
                        className="bg-slate-950 border border-slate-850 text-slate-100 placeholder-slate-600 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none flex-1 font-bold"
                      />
                      <button
                        type="submit"
                        className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 p-2 rounded-lg cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </div>

                </div>

              </div>
            </div>
          ) : (
            
            /* GUEST/USER LOBBY CONSOLE VIEW (MEMBERS LANDING LOUNGE) */
            <div className="flex flex-col gap-6 animate-fadeIn">
              
              {/* Top Row User Info, Dynamic Wallets Control Panel Banner */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Card 1: Balance Vault Wallet Card */}
                <div className="bg-slate-900 border border-slate-900 rounded-2xl p-5 shadow-xl flex flex-col justify-between gap-4 font-mono relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full filter blur-xl pointer-events-none group-hover:scale-125 transition-transform" />
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-400 font-bold uppercase flex items-center gap-1">
                      <Wallet className="w-4 h-4 text-emerald-400" /> SECURE CLUB ACCOUNT BALANCE
                    </span>
                    <span className="bg-emerald-500/10 text-emerald-400 p-0.5 rounded text-[8.5px] uppercase">Verified Wallet</span>
                  </div>

                  <div>
                    <span className="text-2xl sm:text-3xl font-black text-emerald-400">${userSession.balance.toFixed(2)}</span>
                    <span className="text-[10px] text-slate-500 block uppercase mt-0.5">Wager Balance Capable (USDT)</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      onClick={() => {
                        setIsDepositOpen(true);
                        setIsWithdrawOpen(false);
                      }}
                      className="py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-bold transition-all cursor-pointer text-center uppercase"
                    >
                      + Deposit
                    </button>
                    <button
                      onClick={() => {
                        setIsWithdrawOpen(true);
                        setIsDepositOpen(false);
                      }}
                      className="py-1.5 border border-slate-800 hover:border-slate-700 hover:bg-slate-950 text-slate-200 text-xs font-bold rounded-lg transition-all cursor-pointer text-center uppercase"
                    >
                      - Cashout
                    </button>
                  </div>
                </div>

                {/* Card 2: Interactive Deposit Card Model (inline) */}
                {isDepositOpen && (
                  <form onSubmit={handleDepositSubmit} className="bg-slate-900 border border-emerald-500/25 rounded-2xl p-5 shadow-xl flex flex-col gap-3 font-mono animate-fadeIn md:col-span-2">
                    <div className="flex justify-between items-center pb-1 border-b border-slate-950">
                      <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 uppercase">
                        <ArrowDownRight className="w-4 h-4 text-emerald-400" /> DEPOSIT USDT GATEWAY CHECKOUT
                      </span>
                      <button type="button" onClick={() => setIsDepositOpen(false)} className="text-slate-500 hover:text-slate-350 text-xs">Close</button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setDepositMethod('crypto')}
                        className={`py-1 rounded border text-center font-bold font-mono transition-colors ${
                          depositMethod === 'crypto' ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : 'border-slate-800 text-slate-600'
                        }`}
                      >
                        USDT TRC20 Wallet
                      </button>
                      <button
                        type="button"
                        onClick={() => setDepositMethod('visa')}
                        className={`py-1 rounded border text-center font-bold font-mono transition-colors ${
                          depositMethod === 'visa' ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : 'border-slate-800 text-slate-600'
                        }`}
                      >
                        Visa / Mastercard
                      </button>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] text-slate-500 uppercase font-black">
                        {depositMethod === 'crypto' ? 'Tether TRC20 Source Wallet Key:' : 'Mastercard Account Number:'}
                      </label>
                      <input
                        type="text"
                        required
                        placeholder={depositMethod === 'crypto' ? 'TXXXX...usdtAddress' : '4000 1234 5678 9000'}
                        value={depositAddress}
                        onChange={(e) => setDepositAddress(e.target.value)}
                        className="bg-slate-950 border border-slate-850 p-2 text-xs rounded-lg text-slate-200 outline-none font-bold"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 items-end">
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] text-slate-500 uppercase font-black">Amount USDT:</label>
                        <input
                          type="number"
                          min="10"
                          max="10000"
                          required
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          className="bg-slate-950 border border-slate-850 p-1.5 text-xs rounded-lg text-slate-200 focus:outline-none font-bold text-center"
                        />
                      </div>
                      <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold py-2 rounded-lg cursor-pointer uppercase font-sans">
                        Authorize Deposit
                      </button>
                    </div>
                  </form>
                )}

                {/* Card 3: Interactive Cashout Withdraw Card (inline) */}
                {isWithdrawOpen && (
                  <form onSubmit={handleWithdrawSubmit} className="bg-slate-900 border border-red-500/25 rounded-2xl p-5 shadow-xl flex flex-col gap-3 font-mono animate-fadeIn md:col-span-2">
                    <div className="flex justify-between items-center pb-1 border-b border-slate-950">
                      <span className="text-[10px] text-red-400 font-bold flex items-center gap-1 uppercase">
                        <ArrowUpRight className="w-4 h-4 text-red-400 animate-pulse" /> CASHOUT PAYOUT CHANNEL
                      </span>
                      <button type="button" onClick={() => setIsWithdrawOpen(false)} className="text-slate-500 hover:text-slate-350 text-xs">Close</button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setWithdrawMethod('crypto')}
                        className={`py-1 rounded border text-center font-bold font-mono transition-colors ${
                          withdrawMethod === 'crypto' ? 'border-red-500 text-red-400 bg-red-500/5' : 'border-slate-800 text-slate-600'
                        }`}
                      >
                        USDT TRC20 Wallet
                      </button>
                      <button
                        type="button"
                        onClick={() => setWithdrawMethod('bank')}
                        className={`py-1 rounded border text-center font-bold font-mono transition-colors ${
                          withdrawMethod === 'bank' ? 'border-red-500 text-red-400 bg-red-500/5' : 'border-slate-800 text-slate-600'
                        }`}
                      >
                        Local Bank (IBAN)
                      </button>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] text-slate-500 uppercase font-black">
                        {withdrawMethod === 'crypto' ? 'Receiving TRC20 Payout Key Address:' : 'Receiving Bank Routing Account (IBAN):'}
                      </label>
                      <input
                        type="text"
                        required
                        placeholder={withdrawMethod === 'crypto' ? 'Enter Receiving USDT Addr' : 'AE50 1200 4567 8901'}
                        value={withdrawAddress}
                        onChange={(e) => setWithdrawAddress(e.target.value)}
                        className="bg-slate-950 border border-slate-850 p-2 text-xs rounded-lg text-slate-200 outline-none font-bold"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 items-end">
                      <div className="flex flex-col gap-1">
                        <label className="text-[8px] text-slate-500 uppercase font-black">Cashout Amount USDT:</label>
                        <input
                          type="number"
                          min="10"
                          max="5000"
                          required
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                          className="bg-slate-950 border border-slate-850 p-1.5 text-xs rounded-lg text-slate-200 focus:outline-none font-bold text-center"
                        />
                      </div>
                      <button type="submit" className="w-full bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-2 rounded-lg cursor-pointer uppercase font-sans">
                        Approve Withdrawal
                      </button>
                    </div>
                  </form>
                )}

                {/* Empty columns spacers if deposit or withdrawal is not open */}
                {!isDepositOpen && !isWithdrawOpen && (
                  <div className="bg-slate-900 border border-slate-900 rounded-2xl p-5 shadow-xl flex flex-col justify-between font-mono md:col-span-2">
                    <span className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Account Identity credentials</span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs font-mono">
                      <div>
                        <span className="text-[8.5px] text-slate-500 uppercase block">Registered Username:</span>
                        <span className="font-extrabold text-slate-200">{userSession.username}</span>
                      </div>
                      <div>
                        <span className="text-[8.5px] text-slate-500 uppercase block">USDT TRC20 Address:</span>
                        <span className="font-bold text-emerald-400 select-all truncate block">
                          {userSession.walletAddress || 'None Provided'}
                        </span>
                      </div>
                      <div className="hidden sm:block">
                        <span className="text-[8.5px] text-slate-500 uppercase block">Session ID Ref:</span>
                        <span className="text-slate-400 truncate block text-[10px]">{userSession.id}</span>
                      </div>
                    </div>

                    <div className="text-[9px] text-slate-500 leading-normal border-t border-slate-950 pt-2.5 mt-2">
                      Your registered account is safely synced with the Laravel simulation pool database. Practice play balances can be replenished for free instantly.
                    </div>
                  </div>
                )}

              </div>

              {/* Matchmaking Lobby Grid Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full items-start">
                
                {/* Panel Left: Host Custom Multiplayer USDT Stakes Match */}
                <div className="bg-slate-900 border border-slate-900 rounded-3xl p-6 flex flex-col gap-5 shadow-2xl relative">
                  <div className="absolute top-0 inset-x-0 h-[2px] bg-emerald-500" />
                  
                  <div>
                    <h3 className="text-lg font-bold tracking-tight text-white mb-1 uppercase flex items-center gap-2">
                      ⚔️ HOST MULTIPLAYER STAKES MATCH
                    </h3>
                    <p className="text-xs text-slate-450 text-slate-400 font-mono">
                      Host a real pool table, specify standard USDT staking size and link together to battle with global friends peer-to-peer!
                    </p>
                  </div>

                  {/* Form fields for Host staking */}
                  <div className="flex flex-col gap-4 font-mono">
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] text-slate-500 uppercase font-black">Configure Room Access Code ID:</label>
                      <input
                        type="text"
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                        className="bg-slate-950 border border-slate-850 focus:border-emerald-500 text-slate-200 text-xs rounded-xl p-3 focus:outline-none transition-all font-bold text-emerald-400"
                        placeholder="Room Access Code ID"
                      />
                    </div>

                    {/* Quick values buttons for quick staking */}
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] text-slate-500 uppercase font-black">Dynamic Match Stake per Cueist:</label>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {[5, 25, 50, 100, 250, 500].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setStake(val)}
                            className={`py-2 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                              stake === val 
                                ? 'bg-emerald-500 text-slate-950 border-emerald-500' 
                                : 'bg-slate-950 text-slate-300 border-slate-850 hover:border-slate-700'
                            }`}
                          >
                            ${val}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] text-slate-500 uppercase">Input Custom Stake Wager Amount (USDT):</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="5"
                          max="10000"
                          value={stake}
                          onChange={(e) => setStake(Math.max(5, parseInt(e.target.value) || 5))}
                          className="bg-slate-950 border border-slate-850 p-2 px-3 text-xs rounded-lg text-slate-200 outline-none font-bold"
                        />
                        <span className="text-[9px] text-slate-650">Min $5 • Max $10,000 USDT</span>
                      </div>
                    </div>

                    {/* Join button */}
                    <button
                      onClick={() => {
                        if (userSession.balance < stake) {
                          setErrorBanner('Your wallet balance is lower than the room stake. top up for free above!');
                          setTimeout(() => setErrorBanner(null), 4000);
                          return;
                        }
                        handleJoinRoom(roomId, stake);
                      }}
                      className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black p-3.5 rounded-xl text-xs transition-all uppercase flex items-center justify-center gap-2 cursor-pointer shadow-lg font-sans"
                    >
                      <Play className="w-4 h-4 text-slate-950 shrink-0" />
                      Sit and Host Stakes Table Room
                    </button>
                  </div>
                </div>

                {/* Panel Right: Training grounds bot duels (FREE) */}
                <div className="bg-slate-900 border border-slate-900 rounded-3xl p-6 flex flex-col gap-5 shadow-2xl relative select-none">
                  <div className="absolute top-0 inset-x-0 h-[2px] bg-amber-500" />

                  <div>
                    <h3 className="text-lg font-bold tracking-tight text-white mb-1 uppercase flex items-center gap-2">
                      🤖 RISK-FREE BOT TRAINING DUELS (FREE)
                    </h3>
                    <p className="text-xs text-slate-450 text-slate-400 font-mono">
                      Sharpen your curves, practice cue spin, and analyze rebound paths against our high-precision robotic cueist. Absolutely zero wagers required!
                    </p>
                  </div>

                  {/* AI Bot difficulty settings */}
                  <div className="bg-slate-950 p-4 border border-slate-850 rounded-2xl flex flex-col gap-3 font-mono">
                    <span className="text-[10px] text-slate-500 uppercase font-black">Choose Bot Aggression Index (Difficulty):</span>
                    
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {[
                        { level: 'easy', desc: 'Amateur Cue' },
                        { level: 'medium', desc: 'Expert Spin' },
                        { level: 'hard', desc: 'Terminated Pool' }
                      ].map((item) => (
                        <button
                          key={item.level}
                          type="button"
                          onClick={() => setJoinDifficulty(item.level as any)}
                          className={`py-2 px-1 rounded-lg border text-center transition-all cursor-pointer flex flex-col items-center ${
                            joinDifficulty === item.level
                              ? 'border-amber-500 text-amber-400 bg-amber-500/5 font-black'
                              : 'border-slate-850 text-slate-400'
                          }`}
                        >
                          <span className="font-bold uppercase text-[10px]">{item.level}</span>
                          <span className="text-[8px] text-slate-500 mt-0.5">{item.desc}</span>
                        </button>
                      ))}
                    </div>

                    <div className="text-[10px] text-slate-500 leading-normal border-t border-slate-900 pt-2.5">
                      Bot calculations are triggered on server-side using standard angular collision dynamics. Win 3 hard matches to claim rank!
                    </div>
                  </div>

                  <button
                    onClick={handleLaunchFreeBotDuel}
                    className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black p-3.5 rounded-xl text-xs transition-all uppercase flex items-center justify-center gap-2 cursor-pointer shadow-lg font-sans"
                  >
                    <Cpu className="w-4 h-4 text-slate-950 animate-pulse shrink-0" />
                    Enter Free Bot Practice Arena (0 USDT)
                  </button>
                </div>

              </div>

              {/* Standings ledgers / Past transactions stream tab block */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">
                
                {/* Left Side (Col 7): Historical match transactions log from Express */}
                <div className="lg:col-span-7 flex flex-col gap-4">
                  <MatchHistory history={matchHistory} />
                </div>

                {/* Right Side (Col 5): Cryptographic ledger stream / Laravel API sink logs */}
                <div className="lg:col-span-5 bg-slate-900 border border-slate-900 rounded-3xl p-5 shadow-xl flex flex-col gap-3 font-mono">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-950 select-none">
                    <span className="text-xs font-bold text-slate-100 flex items-center gap-1.5 uppercase">
                      🔗 LARES CRYPTOGRAPHIC AUDIT STREAM
                    </span>
                    <span className="bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 text-[8.5px] px-1.5 py-0.5 rounded animate-pulse">Live API Sink</span>
                  </div>

                  <div className="bg-slate-950 border border-slate-905 rounded-2xl p-3 text-[10.5px] max-h-[350px] overflow-auto flex flex-col gap-3.5 font-mono">
                    {apiLogs.length === 0 ? (
                      <span className="text-slate-600 italic">No Laravel active endpoints registered yet. Host rooms or run wallet deposits above to audit checkout API.</span>
                    ) : (
                      apiLogs.map((log, idx) => (
                        <div key={log.id || `log-${idx}`} className="border-b border-slate-900 pb-3 last:border-0 last:pb-0">
                          <div className="flex items-center justify-between text-[10px] mb-1">
                            <span className="text-amber-500 font-bold block">{log.apiName}</span>
                            <span className="text-slate-500 text-[8.5px]">{new Date(log.timestamp).toLocaleTimeString()}</span>
                          </div>

                          <div className="grid grid-cols-1 gap-2 text-[8.5px] bg-slate-900/60 p-2 rounded border border-slate-900/80 leading-normal">
                            <div>
                              <span className="text-slate-500 block text-[7.5px] uppercase">POST REQ PAYLOAD:</span>
                              <pre className="text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap">{JSON.stringify(log.payload, null, 2)}</pre>
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[7.5px] uppercase leading-normal font-black">LARAVEL RESPONSE SECURE OUT:</span>
                              <pre className="text-emerald-400 font-mono overflow-x-auto whitespace-pre-wrap">{JSON.stringify(log.response, null, 2)}</pre>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

            </div>
          )}

        </div>
      )}

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
