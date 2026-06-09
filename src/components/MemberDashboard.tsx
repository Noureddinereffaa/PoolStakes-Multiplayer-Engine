import React, { useState } from 'react';
import { RoomState, Difficulty, MatchHistory as MatchType } from '../types';
import { ArrowRight, Trophy, Wallet, Users, Cpu, Play, Shield, Target, TrendingUp, ArrowDownRight, ArrowUpRight, X } from 'lucide-react';
import { Lang } from '../i18n';
import { motion, AnimatePresence } from 'framer-motion';
import MatchHistory from './MatchHistory';

interface Props {
  userSession: { id: string; username: string; balance: number; walletAddress?: string };
  roomState: RoomState | null;
  stake: number; roomId: string;   joinDifficulty: Difficulty;
  laravelUsers: Array<{ id: string; username: string; balance: number }>;
  matchHistory: MatchType[];
  language: Lang; setLanguage: (l: Lang) => void;
  onSetStake: (v: number) => void; onSetRoomId: (v: string) => void;
  onSetJoinDifficulty: (v: Difficulty) => void;
  onJoinRoom: (roomId: string, stake: number, autoJoinAI?: boolean | Difficulty) => void;
  onJoinAI?: (difficulty?: Difficulty) => void;
  onNavigateRules: () => void;
  // financial handlers passed from App
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

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0a0a0f] text-slate-100">
      {/* ── TOP NAV ── */}
      <div className="sticky top-0 z-40 border-b border-white/5 bg-[#0a0a0f]/90 backdrop-blur-xl px-5 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-sm shadow-lg shadow-emerald-500/30">🎱</div>
          <span className="font-black text-white text-sm tracking-tight">8-BALL ARENA</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onNavigateRules}
            className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
          >
            {isAr ? 'القواعد' : 'Rules'} <ArrowRight className="w-3 h-3" />
          </button>
          <button
            onClick={() => setLanguage(isAr ? 'en' : 'ar')}
            className="px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 text-xs font-bold hover:bg-white/10 transition"
          >
            {isAr ? 'EN' : 'AR'}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-5 py-8 flex flex-col gap-6">

        {/* ── WALLET OVERVIEW ── */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Balance card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="sm:col-span-2 rounded-2xl border border-white/8 bg-[#12121a] p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/8 rounded-full blur-3xl pointer-events-none" />
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-emerald-400" />
              {isAr ? 'الرصيد' : 'Available Balance'}
            </div>
            <div className="text-4xl font-black text-emerald-400 mb-1">${userSession.balance.toFixed(2)}</div>
            <div className="text-xs text-slate-500 font-mono mb-4">USDT TRC20 {userSession.walletAddress ? `• ${userSession.walletAddress.slice(0, 8)}...` : ''}</div>
            <div className="flex gap-2">
              <button
                onClick={() => { setDepositOpen(true); setWithdrawOpen(false); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition"
              >
                <ArrowDownRight className="w-3.5 h-3.5" /> {isAr ? 'إيداع' : 'Deposit'}
              </button>
              <button
                onClick={() => { setWithdrawOpen(true); setDepositOpen(false); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold transition"
              >
                <ArrowUpRight className="w-3.5 h-3.5" /> {isAr ? 'سحب' : 'Withdraw'}
              </button>
            </div>
          </motion.div>

          {/* Stats cards */}
          <StatCard icon={Trophy} color="amber" label={isAr ? 'انتصارات' : 'Wins'} value={String(wins)} sub={`${losses} ${isAr ? 'خسارة' : 'losses'}`} />
          <StatCard icon={TrendingUp} color="cyan" label={isAr ? 'إجمالي الأرباح' : 'Total Earned'} value={`$${totalEarned.toFixed(0)}`} sub={`${matchHistory.length} ${isAr ? 'مباراة' : 'matches'}`} />
        </div>

        {/* ── DEPOSIT / WITHDRAW FORMS (inline) ── */}
        {depositOpen && (
          <div className="rounded-2xl border border-emerald-500/20 bg-[#12121a] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold flex items-center gap-2 text-emerald-400"><ArrowDownRight className="w-4 h-4" /> {isAr ? 'إيداع USDT' : 'Deposit USDT'}</h3>
              <button onClick={() => setDepositOpen(false)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <MethodToggle
              options={[{ id: 'crypto', label: 'USDT TRC20' }, { id: 'card', label: isAr ? 'بطاقة' : 'Card' }]}
              value={depMethod} onChange={v => setDepMethod(v as any)} color="emerald"
            />
            <form onSubmit={e => { e.preventDefault(); onDeposit?.(parseFloat(depAmt) || 100, depAddr, depMethod); setDepositOpen(false); }} className="mt-4 space-y-3">
              <FinInput label={depMethod === 'crypto' ? 'TRC20 Source Wallet' : isAr ? 'رقم البطاقة' : 'Card Number'} value={depAddr} onChange={setDepAddr} placeholder={depMethod === 'crypto' ? 'T...' : '4000 1234 ...'} required />
              <div className="flex gap-3 items-end">
                <FinInput label={isAr ? 'المبلغ (USDT)' : 'Amount (USDT)'} value={depAmt} onChange={setDepAmt} type="number" min="10" max="10000" />
                <button type="submit" className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm transition shrink-0">
                  {isAr ? 'تأكيد' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        )}

        {withdrawOpen && (
          <div className="rounded-2xl border border-red-500/20 bg-[#12121a] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold flex items-center gap-2 text-red-400"><ArrowUpRight className="w-4 h-4" /> {isAr ? 'سحب USDT' : 'Withdraw USDT'}</h3>
              <button onClick={() => setWithdrawOpen(false)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <MethodToggle
              options={[{ id: 'crypto', label: 'USDT TRC20' }, { id: 'bank', label: 'IBAN' }]}
              value={wdMethod} onChange={v => setWdMethod(v as any)} color="red"
            />
            <form onSubmit={e => { e.preventDefault(); onWithdraw?.(parseFloat(wdAmt) || 50, wdAddr, wdMethod); setWithdrawOpen(false); }} className="mt-4 space-y-3">
              <FinInput label={wdMethod === 'crypto' ? isAr ? 'عنوان المحفظة' : 'Receiving Wallet' : 'IBAN'} value={wdAddr} onChange={setWdAddr} placeholder={wdMethod === 'crypto' ? 'T...' : 'AE50 1200...'} required />
              <div className="flex gap-3 items-end">
                <FinInput label={isAr ? 'المبلغ (USDT)' : 'Amount (USDT)'} value={wdAmt} onChange={setWdAmt} type="number" min="10" max="5000" />
                <button type="submit" className="px-5 py-2.5 rounded-lg bg-red-500 hover:bg-red-400 text-white font-black text-sm transition shrink-0">
                  {isAr ? 'تأكيد' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── MATCHMAKING + PRACTICE ── */}
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Host match */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="rounded-2xl border border-white/8 bg-[#12121a] p-5 relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-emerald-500 to-cyan-500" />
            <h2 className="font-black text-white mb-1 flex items-center gap-2">
              ⚔️ {isAr ? 'استضافة مباراة' : 'Host Match'}
            </h2>
            <p className="text-xs text-slate-500 mb-5">{isAr ? 'حدد رمز الغرفة والرهان.' : 'Set room code and stake, share with opponent.'}</p>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wide mb-1 block">{isAr ? 'رمز الغرفة' : 'Room Code'}</label>
                <input
                  value={roomId} onChange={e => onSetRoomId(e.target.value)}
                  placeholder={isAr ? 'أدخل رمز الغرفة' : 'Enter room code'}
                  className="w-full bg-[#0a0a0f] border border-white/8 rounded-lg px-4 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wide mb-2 block">{isAr ? 'مبلغ الرهان' : 'Stake'}</label>
                <div className="grid grid-cols-6 gap-1.5 mb-3">
                  {STAKES.map(v => (
                    <button
                      key={v} type="button" onClick={() => onSetStake(v)}
                      className={`py-1.5 rounded-lg text-xs font-bold transition border ${stake === v ? 'bg-emerald-500 border-emerald-500 text-slate-950' : 'border-white/8 text-slate-400 hover:border-white/20 hover:text-white'}`}
                    >
                      ${v}
                    </button>
                  ))}
                </div>
                <input
                  type="number" min={5} max={10000} value={stake}
                  onChange={e => onSetStake(Math.max(5, parseInt(e.target.value) || 5))}
                  className="w-full bg-[#0a0a0f] border border-white/8 rounded-lg px-4 py-2 text-sm text-emerald-400 font-bold focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <button
                onClick={() => onJoinRoom(roomId, stake)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black transition shadow-lg shadow-emerald-500/15 flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" /> {isAr ? 'إطلاق الغرفة' : 'Launch Room'}
              </button>
            </div>
          </motion.div>

          {/* Practice bot */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="rounded-2xl border border-white/8 bg-[#12121a] p-5 relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-amber-500 to-orange-500" />
            <h2 className="font-black text-white mb-1 flex items-center gap-2">
              🤖 {isAr ? 'تدريب مجاني' : 'Practice vs AI'}
            </h2>
            <p className="text-xs text-slate-500 mb-5">{isAr ? 'صفر مراهنات. صقل مهاراتك.' : 'Zero stakes. Sharpen your game anytime.'}</p>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wide mb-2 block">{isAr ? 'صعوبة البوت' : 'Bot Difficulty'}</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['easy', 'medium', 'hard'] as const).map(d => (
                    <button
                      key={d} type="button" onClick={() => onSetJoinDifficulty(d)}
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
                {isAr ? 'الربح في 3 مباريات hard يمنحك لقب محترف.' : 'Win 3 Hard matches to earn the Pro rank badge.'}
              </div>

              <button
                onClick={() => onJoinRoom(`PRACTICE_${Date.now()}`, 0, joinDifficulty)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black transition shadow-lg shadow-amber-500/15 flex items-center justify-center gap-2"
              >
                <Cpu className="w-4 h-4" /> {isAr ? 'ابدأ التدريب (0 USDT)' : 'Enter Practice Arena (0 USDT)'}
              </button>
            </div>
          </motion.div>
        </div>

        {/* ── LEADERBOARD + PROFILE ── */}
        <div className="grid lg:grid-cols-3 gap-5">
          {/* Leaderboard */}
          <div className="lg:col-span-2 rounded-2xl border border-white/8 bg-[#12121a] p-5">
            <h2 className="font-black text-white mb-4 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" /> {isAr ? 'أفضل اللاعبين' : 'Leaderboard'}
            </h2>
            <div className="space-y-2">
              {topPlayers.map((u, i) => (
                <div
                  key={u.id}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border transition ${
                    u.id === userSession.id
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-white/5 hover:border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${
                      i === 0 ? 'bg-amber-500 text-slate-950' : i === 1 ? 'bg-slate-400 text-slate-900' : i === 2 ? 'bg-orange-700 text-white' : 'bg-white/8 text-slate-400'
                    }`}>{i + 1}</div>
                    <span className="font-semibold text-sm text-slate-200">{u.username}</span>
                    {u.id === userSession.id && <span className="text-[9px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded font-mono">YOU</span>}
                  </div>
                  <span className="font-black text-emerald-400 font-mono text-sm">${u.balance.toFixed(2)}</span>
                </div>
              ))}
              {topPlayers.length === 0 && <div className="text-xs text-slate-600 italic py-4 text-center">Loading rankings…</div>}
            </div>
          </div>

          {/* Profile + alerts */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/8 bg-[#12121a] p-5">
              <h2 className="font-black text-white mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" /> {isAr ? 'الملف الشخصي' : 'My Profile'}
              </h2>
              <div className="space-y-3 text-sm">
                <Row label={isAr ? 'المستخدم' : 'Username'} value={userSession.username} />
                <Row label={isAr ? 'الترتيب' : 'Rank'} value={userRank ? `#${userRank}` : '—'} highlight />
                <Row label="W/L" value={`${wins} / ${losses}`} />
                <Row label={isAr ? 'المحفظة' : 'Wallet'} value={userSession.walletAddress ? `${userSession.walletAddress.slice(0, 8)}…` : '—'} mono />
              </div>
            </div>

            <div className="rounded-2xl border border-orange-500/15 bg-[#12121a] p-4">
              <div className="flex items-center gap-2 mb-3 text-orange-400">
                <Shield className="w-4 h-4" />
                <span className="font-bold text-sm">{isAr ? 'تنبيهات' : 'Alerts'}</span>
              </div>
              <ul className="space-y-2 text-xs text-slate-400">
                <li className="flex gap-2"><Target className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />{isAr ? 'راجع القواعد قبل البدء.' : 'Review rules before starting.'}</li>
                <li className="flex gap-2"><Target className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />{isAr ? 'مشاركة الرمز لا تبدأ اللعبة.' : 'Sharing the code doesn\'t start the match.'}</li>
                <li className="flex gap-2"><Target className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />{isAr ? 'الانقطاع = خسارة تلقائية.' : 'Disconnect = automatic forfeit.'}</li>
              </ul>
              <button onClick={onNavigateRules} className="mt-3 w-full py-2 rounded-lg border border-orange-500/20 text-orange-400 text-xs font-bold hover:bg-orange-500/10 transition flex items-center justify-center gap-1.5">
                {isAr ? 'القواعد' : 'View Rules'} <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ── MATCH HISTORY ── */}
        <MatchHistory history={matchHistory} language={language} />

      </div>
    </div>
  );
}

function StatCard({ icon: Icon, color, label, value, sub }: { icon: any; color: string; label: string; value: string; sub: string }) {
  const cls: Record<string, string> = {
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  };
  return (
    <div className="rounded-2xl border border-white/8 bg-[#12121a] p-5">
      <div className={`w-9 h-9 rounded-lg border flex items-center justify-center mb-3 ${cls[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-2xl font-black text-white">{value}</div>
      <div className="text-xs text-slate-400 mt-0.5">{label}</div>
      <div className="text-xs text-slate-600 mt-0.5">{sub}</div>
    </div>
  );
}

function Row({ label, value, highlight, mono }: { label: string; value: string; highlight?: boolean; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className={`text-xs font-bold ${highlight ? 'text-emerald-400' : 'text-slate-200'} ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function MethodToggle({ options, value, onChange, color }: { options: { id: string; label: string }[]; value: string; onChange: (v: string) => void; color: string }) {
  const active = `border-${color}-500 bg-${color}-500/10 text-${color}-400`;
  return (
    <div className="flex gap-2">
      {options.map(o => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)}
          className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition ${value === o.id ? (color === 'emerald' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-red-500 bg-red-500/10 text-red-400') : 'border-white/8 text-slate-500 hover:border-white/15'}`}
        >{o.label}</button>
      ))}
    </div>
  );
}

function FinInput({ label, value, onChange, type = 'text', ...rest }: { label: string; value: string; onChange: (v: string) => void; type?: string; [k: string]: any }) {
  return (
    <div className="flex-1">
      <label className="text-[10px] text-slate-400 uppercase font-bold tracking-wide mb-1 block">{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-[#0a0a0f] border border-white/8 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 transition"
        {...rest}
      />
    </div>
  );
}
