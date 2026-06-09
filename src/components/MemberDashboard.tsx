import React, { useState } from 'react';
import { RoomState, Difficulty, MatchHistory as MatchType } from '../types';
import {
  LayoutDashboard, Swords, History, BookOpen, LogOut, Wallet, Trophy,
  TrendingUp, Target, Users, Cpu, Play, ArrowDownRight, ArrowUpRight,
  X, Medal, ChevronRight, Star, Settings
} from 'lucide-react';
import { Lang } from '../i18n';
import { motion } from 'framer-motion';
import MatchHistory from './MatchHistory';
import { useNavigate, useLocation } from 'react-router-dom';

interface Props {
  userSession: { id: string; username: string; balance: number; walletAddress?: string };
  roomState: RoomState | null;
  stake: number; roomId: string; joinDifficulty: Difficulty;
  laravelUsers: Array<{ id: string; username: string; balance: number }>;
  matchHistory: MatchType[];
  language: Lang; setLanguage: (l: Lang) => void;
  onSetStake: (v: number) => void; onSetRoomId: (v: string) => void;
  onSetJoinDifficulty: (v: Difficulty) => void;
  onJoinRoom: (roomId: string, stake: number, autoJoinAI?: boolean | Difficulty) => void;
  onNavigateRules: () => void;
  onDeposit?: (amount: number, address: string, method: string) => void;
  onWithdraw?: (amount: number, address: string, method: string) => void;
}

const STAKES = [5, 25, 50, 100, 250, 500];

export default function MemberDashboard({
  userSession, stake, roomId, joinDifficulty,
  laravelUsers, matchHistory, language, setLanguage,
  onSetStake, onSetRoomId, onSetJoinDifficulty, onJoinRoom, onNavigateRules,
  onDeposit, onWithdraw,
}: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'play' | 'history'>('play');
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [depAmt, setDepAmt] = useState('100');
  const [depAddr, setDepAddr] = useState('');
  const [depMethod, setDepMethod] = useState<'crypto' | 'card'>('crypto');
  const [wdAmt, setWdAmt] = useState('100');
  const [wdAddr, setWdAddr] = useState('');
  const [wdMethod, setWdMethod] = useState<'crypto' | 'bank'>('crypto');
  const isAr = language === 'ar';

  const topPlayers = [...laravelUsers].filter(u => u.id !== 'ai-bot').sort((a, b) => b.balance - a.balance).slice(0, 5);
  const userRank = topPlayers.findIndex(u => u.id === userSession.id) + 1;
  const wins = matchHistory.filter(m => m.winnerName === userSession.username).length;
  const losses = matchHistory.filter(m => m.loserName === userSession.username).length;
  const totalEarned = matchHistory.filter(m => m.winnerName === userSession.username).reduce((s, m) => s + m.prizeAmount, 0);
  const totalMatches = wins + losses;
  const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

  const sidebarItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: isAr ? 'لوحة التحكم' : 'Dashboard', path: '/dashboard' },
    { id: 'rules', icon: BookOpen, label: isAr ? 'القواعد' : 'Rules', path: '', onClick: onNavigateRules },
  ];

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="min-h-screen bg-[#07070a] text-slate-100 flex">
      {/* ── SIDEBAR ── */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-white/5 bg-[#0a0a0f] shrink-0">
        <div className="p-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-base shadow-lg shadow-emerald-500/30">🎱</div>
            <div>
              <div className="font-black text-white text-sm tracking-tight">8-BALL ARENA</div>
              <div className="text-[9px] text-emerald-400 font-mono">TRC20</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {sidebarItems.map(item => (
            <button
              key={item.id}
              onClick={() => item.onClick ? item.onClick() : navigate(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition ${
                location.pathname === item.path ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-white/5 space-y-1">
          <button
            onClick={() => setLanguage(isAr ? 'en' : 'ar')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-white/5 transition"
          >
            <Settings className="w-4 h-4" />
            {isAr ? 'English' : 'العربية'}
          </button>
          <button
            onClick={() => { localStorage.removeItem('billiards_session'); navigate('/'); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-red-400 hover:bg-red-500/10 transition"
          >
            <LogOut className="w-4 h-4" />
            {isAr ? 'تسجيل خروج' : 'Sign Out'}
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* ── TOP BAR ── */}
        <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0a0a0f]/90 backdrop-blur-xl">
          <div className="flex items-center justify-between px-5 h-14">
            <div className="flex items-center gap-3">
              {/* Mobile menu toggle */}
              <div className="lg:hidden w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-xs">🎱</div>
              <h1 className="font-black text-sm text-white">{isAr ? 'لوحة التحكم' : 'Dashboard'}</h1>
            </div>

            <div className="flex items-center gap-3">
              {/* Mobile nav buttons */}
              <div className="flex lg:hidden items-center gap-2">
                <button onClick={onNavigateRules} className="px-2.5 py-1.5 rounded-lg border border-white/10 text-xs font-bold text-slate-400 hover:text-white transition">{isAr ? 'القواعد' : 'Rules'}</button>
                <button onClick={() => { localStorage.removeItem('billiards_session'); navigate('/'); }} className="px-2.5 py-1.5 rounded-lg border border-red-500/20 text-xs font-bold text-red-400 hover:bg-red-500/10 transition">{isAr ? 'خروج' : 'Sign Out'}</button>
              </div>

              {/* Balance badge */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-sm font-black font-mono text-emerald-400">${userSession.balance.toFixed(2)}</span>
              </div>

              {/* User */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-bold text-slate-300">{userSession.username}</span>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-5 py-6 space-y-6">
            {/* ── STATS ROW ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                icon={Wallet} label={isAr ? 'الرصيد' : 'Balance'} value={`$${userSession.balance.toFixed(2)}`}
                sub={userSession.walletAddress ? `${userSession.walletAddress.slice(0, 6)}...` : ''}
                color="emerald"
              />
              <StatCard
                icon={Trophy} label={isAr ? 'الانتصارات' : 'Wins'} value={String(wins)}
                sub={`${losses} ${isAr ? 'خسارة' : 'losses'}`}
                color="amber"
              />
              <StatCard
                icon={Target} label={isAr ? 'نسبة الفوز' : 'Win Rate'} value={totalMatches > 0 ? `${winRate}%` : '—'}
                sub={`${totalMatches} ${isAr ? 'مباراة' : 'matches'}`}
                color="cyan"
              />
              <StatCard
                icon={TrendingUp} label={isAr ? 'إجمالي الأرباح' : 'Total Earned'} value={`$${totalEarned.toFixed(0)}`}
                sub={isAr ? 'بما في ذلك العمولة' : 'incl. commission'}
                color="violet"
              />
            </div>

            {/* ── QUICK ACTIONS ── */}
            <div className="flex gap-2">
              <button
                onClick={() => { setDepositOpen(true); setWithdrawOpen(false); }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-black transition"
              >
                <ArrowDownRight className="w-4 h-4" /> {isAr ? 'إيداع' : 'Deposit'}
              </button>
              <button
                onClick={() => { setWithdrawOpen(true); setDepositOpen(false); }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm font-bold transition"
              >
                <ArrowUpRight className="w-4 h-4" /> {isAr ? 'سحب' : 'Withdraw'}
              </button>
            </div>

            {/* ── DEPOSIT / WITHDRAW ── */}
            {depositOpen && (
              <div className="rounded-2xl border border-emerald-500/20 bg-[#0a0a0f] p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold flex items-center gap-2 text-emerald-400"><ArrowDownRight className="w-4 h-4" /> {isAr ? 'إيداع USDT' : 'Deposit USDT'}</h3>
                  <button onClick={() => setDepositOpen(false)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
                </div>
                <MethodToggle options={[{ id: 'crypto', label: 'USDT TRC20' }, { id: 'card', label: isAr ? 'بطاقة' : 'Card' }]} value={depMethod} onChange={v => setDepMethod(v as any)} />
                <form onSubmit={e => { e.preventDefault(); onDeposit?.(parseFloat(depAmt) || 100, depAddr, depMethod); setDepositOpen(false); }} className="mt-4 space-y-3">
                  <FinInput label={depMethod === 'crypto' ? 'TRC20 Source Wallet' : isAr ? 'رقم البطاقة' : 'Card Number'} value={depAddr} onChange={setDepAddr} placeholder={depMethod === 'crypto' ? 'T...' : '4000 1234 ...'} required />
                  <div className="flex gap-3 items-end">
                    <FinInput label={isAr ? 'المبلغ (USDT)' : 'Amount (USDT)'} value={depAmt} onChange={setDepAmt} type="number" min="10" max="10000" />
                    <button type="submit" className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm transition shrink-0">{isAr ? 'تأكيد' : 'Confirm'}</button>
                  </div>
                </form>
              </div>
            )}

            {withdrawOpen && (
              <div className="rounded-2xl border border-red-500/20 bg-[#0a0a0f] p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold flex items-center gap-2 text-red-400"><ArrowUpRight className="w-4 h-4" /> {isAr ? 'سحب USDT' : 'Withdraw USDT'}</h3>
                  <button onClick={() => setWithdrawOpen(false)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
                </div>
                <MethodToggle options={[{ id: 'crypto', label: 'USDT TRC20' }, { id: 'bank', label: 'IBAN' }]} value={wdMethod} onChange={v => setWdMethod(v as any)} />
                <form onSubmit={e => { e.preventDefault(); onWithdraw?.(parseFloat(wdAmt) || 50, wdAddr, wdMethod); setWithdrawOpen(false); }} className="mt-4 space-y-3">
                  <FinInput label={wdMethod === 'crypto' ? isAr ? 'عنوان المحفظة' : 'Receiving Wallet' : 'IBAN'} value={wdAddr} onChange={setWdAddr} placeholder={wdMethod === 'crypto' ? 'T...' : 'AE50 1200...'} required />
                  <div className="flex gap-3 items-end">
                    <FinInput label={isAr ? 'المبلغ (USDT)' : 'Amount (USDT)'} value={wdAmt} onChange={setWdAmt} type="number" min="10" max="5000" />
                    <button type="submit" className="px-5 py-2.5 rounded-lg bg-red-500 hover:bg-red-400 text-white font-black text-sm transition shrink-0">{isAr ? 'تأكيد' : 'Confirm'}</button>
                  </div>
                </form>
              </div>
            )}

            {/* ── TAB BAR: Play / History ── */}
            <div className="flex gap-1 rounded-xl bg-white/5 p-1">
              {(['play', 'history'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition ${
                    activeTab === tab ? 'bg-emerald-500/20 text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-white'
                  }`}
                >
                  {tab === 'play' ? <Swords className="w-4 h-4" /> : <History className="w-4 h-4" />}
                  {tab === 'play' ? (isAr ? 'العب' : 'Play') : (isAr ? 'السجل' : 'History')}
                </button>
              ))}
            </div>

            {/* ── CONTENT: PLAY TAB ── */}
            {activeTab === 'play' && (
              <div className="grid lg:grid-cols-2 gap-5">
                {/* Host Match */}
                <div className="rounded-2xl border border-white/5 bg-[#0a0a0f] p-5 relative overflow-hidden">
                  <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-emerald-500 to-cyan-500" />
                  <h2 className="font-black text-white mb-1 flex items-center gap-2">
                    <Swords className="w-4 h-4 text-emerald-400" /> {isAr ? 'استضافة مباراة' : 'Host Match'}
                  </h2>
                  <p className="text-xs text-slate-500 mb-5">{isAr ? 'حدد الرهان وشارك الرمز مع الخصم' : 'Set stake and share room code with opponent.'}</p>

                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wide mb-1.5 block">{isAr ? 'رمز الغرفة' : 'Room Code'}</label>
                      <input
                        value={roomId} onChange={e => onSetRoomId(e.target.value)}
                        placeholder={isAr ? 'أدخل رمز الغرفة' : 'Enter room code'}
                        className="w-full bg-[#07070a] border border-white/8 rounded-lg px-4 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500 transition"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wide mb-2 block">{isAr ? 'مبلغ الرهان' : 'Stake'}</label>
                      <div className="grid grid-cols-6 gap-1.5 mb-3">
                        {STAKES.map(v => (
                          <button key={v} type="button" onClick={() => onSetStake(v)}
                            className={`py-1.5 rounded-lg text-xs font-bold transition border ${stake === v ? 'bg-emerald-500 border-emerald-500 text-slate-950' : 'border-white/8 text-slate-500 hover:border-white/20 hover:text-white'}`}
                          >${v}</button>
                        ))}
                      </div>
                      <input type="number" min={5} max={10000} value={stake}
                        onChange={e => onSetStake(Math.max(5, parseInt(e.target.value) || 5))}
                        className="w-full bg-[#07070a] border border-white/8 rounded-lg px-4 py-2 text-sm text-emerald-400 font-bold focus:outline-none focus:border-emerald-500 transition"
                      />
                    </div>
                    <button
                      onClick={() => onJoinRoom(roomId, stake)}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black transition shadow-lg shadow-emerald-500/15 flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4" /> {isAr ? 'إطلاق الغرفة' : 'Launch Room'}
                    </button>
                  </div>
                </div>

                {/* Practice AI */}
                <div className="rounded-2xl border border-white/5 bg-[#0a0a0f] p-5 relative overflow-hidden">
                  <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-amber-500 to-orange-500" />
                  <h2 className="font-black text-white mb-1 flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-amber-400" /> {isAr ? 'تدريب مع الذكاء الاصطناعي' : 'Practice vs AI'}
                  </h2>
                  <p className="text-xs text-slate-500 mb-5">{isAr ? 'صفر مراهنات — صقل مهاراتك مجاناً' : 'Zero stakes — sharpen your game for free.'}</p>

                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wide mb-2 block">{isAr ? 'مستوى الصعوبة' : 'AI Difficulty'}</label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['easy', 'medium', 'hard'] as const).map(d => (
                          <button key={d} type="button" onClick={() => onSetJoinDifficulty(d)}
                            className={`py-2.5 rounded-lg border text-xs font-bold transition flex flex-col items-center gap-0.5 ${
                              joinDifficulty === d ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-white/8 text-slate-500 hover:border-white/20 hover:text-white'
                            }`}
                          >
                            <span className="uppercase">{d}</span>
                            <span className="text-[9px] opacity-60">{d === 'easy' ? '★☆☆' : d === 'medium' ? '★★☆' : '★★★'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/15 text-xs text-amber-300/70">
                      {isAr ? '3 انتصارات في مستوى Hard تمنحك شارة محترف' : 'Win 3 Hard matches to earn the Pro rank badge.'}
                    </div>
                    <button
                      onClick={() => onJoinRoom(`PRACTICE_${Date.now()}`, 0, joinDifficulty)}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black transition shadow-lg shadow-amber-500/15 flex items-center justify-center gap-2"
                    >
                      <Cpu className="w-4 h-4" /> {isAr ? 'ابدأ التدريب (0 USDT)' : 'Enter Practice Arena (0 USDT)'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── CONTENT: HISTORY TAB ── */}
            {activeTab === 'history' && (
              <MatchHistory history={matchHistory} language={language} />
            )}

            {/* ── LEADERBOARD ── */}
            <div className="rounded-2xl border border-white/5 bg-[#0a0a0f] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                <h2 className="font-black text-sm text-white flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" /> {isAr ? 'أفضل اللاعبين' : 'Leaderboard'}
                </h2>
                {userRank > 0 && (
                  <span className="text-[10px] text-slate-500 font-mono">
                    {isAr ? 'ترتيبك' : 'Your Rank'}: #{userRank}
                  </span>
                )}
              </div>
              <div className="divide-y divide-white/5">
                {topPlayers.map((u, i) => {
                  const isMe = u.id === userSession.id;
                  const medals = ['🥇', '🥈', '🥉'];
                  return (
                    <div key={u.id} className={`flex items-center justify-between px-5 py-3.5 transition ${isMe ? 'bg-emerald-500/5' : 'hover:bg-white/3'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${
                          i < 3 ? 'bg-transparent text-lg' : 'bg-white/8 text-slate-500'
                        }`}>
                          {i < 3 ? medals[i] : i + 1}
                        </div>
                        <span className={`text-sm font-bold ${isMe ? 'text-emerald-400' : 'text-slate-200'}`}>{u.username}</span>
                        {isMe && <span className="text-[8px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded-full font-mono font-bold">{isAr ? 'أنت' : 'YOU'}</span>}
                      </div>
                      <span className="font-black font-mono text-sm text-emerald-400">${u.balance.toFixed(2)}</span>
                    </div>
                  );
                })}
                {topPlayers.length === 0 && (
                  <div className="px-5 py-8 text-center text-xs text-slate-600 italic">{isAr ? 'جاري التحميل…' : 'Loading rankings...'}</div>
                )}
              </div>
            </div>

            {/* ── PROFILE CARD ── */}
            <div className="rounded-2xl border border-white/5 bg-[#0a0a0f] p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-black text-sm text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" /> {isAr ? 'الملف الشخصي' : 'Profile'}
                </h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <ProfileRow label={isAr ? 'المستخدم' : 'Username'} value={userSession.username} />
                <ProfileRow label={isAr ? 'الترتيب' : 'Rank'} value={userRank ? `#${userRank}` : '—'} highlight />
                <ProfileRow label="W/L" value={`${wins} / ${losses}`} />
                <ProfileRow label={isAr ? 'المحفظة' : 'Wallet'} value={userSession.walletAddress ? `${userSession.walletAddress.slice(0, 8)}…` : '—'} mono />
              </div>
            </div>

            {/* ── ALERTS ── */}
            <div className="rounded-2xl border border-orange-500/15 bg-[#0a0a0f] p-5">
              <div className="flex items-center gap-2 mb-3 text-orange-400">
                <ShieldAlert className="w-4 h-4" />
                <span className="font-bold text-xs">{isAr ? 'تنبيهات' : 'Alerts'}</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-500">
                <li className="flex gap-2"><Target className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />{isAr ? 'راجع القواعد قبل البدء' : 'Review rules before starting.'}</li>
                <li className="flex gap-2"><Target className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />{isAr ? 'مشاركة الرمز لا تبدأ اللعبة' : 'Sharing the code doesn\'t start the match.'}</li>
                <li className="flex gap-2"><Target className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />{isAr ? 'الانقطاع = خسارة تلقائية' : 'Disconnect = automatic forfeit.'}</li>
              </ul>
              <button onClick={onNavigateRules} className="mt-3 w-full py-2.5 rounded-lg border border-orange-500/20 text-orange-400 text-xs font-bold hover:bg-orange-500/10 transition flex items-center justify-center gap-1.5">
                {isAr ? 'عرض القواعد' : 'View Rules'} <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ── MOBILE BOTTOM NAV ── */}
        <nav className="lg:hidden flex border-t border-white/5 bg-[#0a0a0f]">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: isAr ? 'الرئيسية' : 'Home', path: '/dashboard' },
            { id: 'play', icon: Swords, label: isAr ? 'العب' : 'Play', path: '', onClick: () => setActiveTab('play') },
            { id: 'history', icon: History, label: isAr ? 'السجل' : 'History', path: '', onClick: () => setActiveTab('history') },
            { id: 'rules', icon: BookOpen, label: isAr ? 'القواعد' : 'Rules', path: '', onClick: onNavigateRules },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => item.onClick ? item.onClick() : navigate(item.path)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold transition ${
                (item.path && location.pathname === item.path) || (item.id === 'play' && activeTab === 'play') || (item.id === 'history' && activeTab === 'history')
                  ? 'text-emerald-400' : 'text-slate-600 hover:text-slate-400'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

function ShieldAlert({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub: string; color: string }) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    violet: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  };
  return (
    <div className="rounded-2xl border border-white/5 bg-[#0a0a0f] p-4">
      <div className={`w-8 h-8 rounded-lg border flex items-center justify-center mb-2.5 ${colors[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-xl font-black text-white">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
      <div className="text-[10px] text-slate-600 mt-0.5">{sub}</div>
    </div>
  );
}

function ProfileRow({ label, value, highlight, mono }: { label: string; value: string; highlight?: boolean; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className={`text-xs font-bold ${highlight ? 'text-emerald-400' : 'text-slate-200'} ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function MethodToggle({ options, value, onChange }: { options: { id: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      {options.map(o => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)}
          className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition ${value === o.id ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-white/8 text-slate-500 hover:border-white/15'}`}
        >{o.label}</button>
      ))}
    </div>
  );
}

function FinInput({ label, value, onChange, type = 'text', ...rest }: { label: string; value: string; onChange: (v: string) => void; type?: string; [k: string]: any }) {
  return (
    <div className="flex-1">
      <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wide mb-1 block">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-[#07070a] border border-white/8 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 transition" {...rest} />
    </div>
  );
}
