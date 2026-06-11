import React, { useState } from 'react';
import { Eye, EyeOff, ArrowRight, Zap, Shield, Trophy, Cpu, Wallet, TrendingUp, Users, Star, ChevronDown } from 'lucide-react';
import { Lang } from '../i18n';
import { motion, AnimatePresence } from 'framer-motion';

interface HomePageProps {
  loginUser: string; setLoginUser: (v: string) => void;
  loginPass: string; setLoginPass: (v: string) => void;
  regUser: string; setRegUser: (v: string) => void;
  regEmail: string; setRegEmail: (v: string) => void;
  regPass: string; setRegPass: (v: string) => void;
  regWallet: string; setRegWallet: (v: string) => void;
  isAuthLoading: boolean;
  handleLoginSubmit: (e: React.FormEvent) => void;
  handleRegisterSubmit: (e: React.FormEvent) => void;
  language: Lang; setLanguage: (l: Lang) => void;
  onNavigateToRules: () => void;
}

const LIVE_STATS = [
  { label: 'Active Players', value: '2,847', icon: Users },
  { label: 'Total Wagered', value: '$1.2M', icon: TrendingUp },
  { label: 'Matches Today', value: '12,430', icon: Trophy },
  { label: 'Avg Payout', value: '< 60s', icon: Zap },
];

const STEPS = [
  { n: '01', title: 'Create Account', desc: 'Register and receive 500 USDT demo credit instantly.' },
  { n: '02', title: 'Choose Your Stake', desc: 'Pick your entry fee from $5 to $10,000 USDT per match.' },
  { n: '03', title: 'Play & Win', desc: 'Server-authoritative physics — pure skill, zero luck.' },
  { n: '04', title: 'Instant Payout', desc: 'Winner receives 95% of the pot in under 60 seconds.' },
];

const TESTIMONIALS = [
  { name: 'CueMaster_AE', flag: '🇦🇪', text: 'The physics are incredible — feels just like real billiards. Made $840 last week.', rating: 5 },
  { name: 'SharpAngle_UK', flag: '🇬🇧', text: 'Fastest crypto payouts I\'ve used. No delays, no excuses.', rating: 5 },
  { name: 'BilliardKing_SA', flag: '🇸🇦', text: 'Arabic support is perfect. Finally a platform built for us too.', rating: 5 },
];

const FAQ = [
  { q: 'Is this provably fair?', a: 'Yes. Every match generates a SHA-256 integrity hash you can independently verify.' },
  { q: 'What is the minimum stake?', a: '$5 USDT per player. Maximum is $10,000 USDT per match.' },
  { q: 'How fast are payouts?', a: 'Winners receive their prize within 60 seconds of match conclusion via TRC20.' },
  { q: 'Can I practice for free?', a: 'Yes. Play against our AI bot at zero cost, any difficulty, anytime.' },
];

export default function HomePage({
  loginUser, setLoginUser, loginPass, setLoginPass,
  regUser, setRegUser, regEmail, setRegEmail, regPass, setRegPass,
  regWallet, setRegWallet, isAuthLoading,
  handleLoginSubmit, handleRegisterSubmit,
  language, setLanguage, onNavigateToRules,
}: HomePageProps) {
  const [showPass, setShowPass] = useState(false);
  const [showRegPass, setShowRegPass] = useState(false);
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const isAr = language === 'ar';

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="h-screen overflow-y-auto bg-[#0a0a0f] text-slate-100">

      {/* ── NAV ─────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a0f]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-base shadow-lg shadow-emerald-500/30">🎱</div>
            <span className="font-black text-white tracking-tight">8-BALL ARENA</span>
            <span className="hidden sm:inline text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">TRC20</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onNavigateToRules} className="hidden sm:flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition">
              {isAr ? 'القواعد' : 'Rules'} <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setLanguage(isAr ? 'en' : 'ar')}
              className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm font-bold transition"
            >
              {isAr ? '🇺🇸 EN' : '🇸🇦 AR'}
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────── */}
      <section className="relative overflow-hidden px-5 pt-24 pb-20 text-center">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/20 to-transparent pointer-events-none" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/8 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative max-w-4xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-semibold mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {isAr ? 'منصة مراهنات عالمية PvP' : 'Global PvP Wagering Platform — Live Now'}
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }} className="text-5xl sm:text-7xl font-black leading-none tracking-tight text-white mb-5">
            {isAr ? (
              <>تنافس في<br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">البلياردو الاحترافي</span></>
            ) : (
              <>COMPETE FOR<br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">REAL USDT STAKES</span></>
            )}
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.5 }} className="text-lg text-slate-400 max-w-xl mx-auto mb-10">
            {isAr
              ? 'فيزياء دقيقة، تسويات فورية، منافسون حقيقيون. رهانات من 5$ إلى 10,000$ USDT.'
              : 'Physics-accurate 8-ball pool with instant crypto payouts. Real players, real stakes, proven integrity.'}
          </motion.p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => setTab('register')}
              className="group px-8 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black transition-all shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 flex items-center justify-center gap-2"
            >
              {isAr ? 'ابدأ الآن' : 'Start Playing'}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* bonus badge */}
          <div className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-amber-500/20 bg-amber-500/8 text-amber-300 text-sm">
            🎁 {isAr ? 'احصل على 500 USDT عند التسجيل' : 'Claim 500 USDT welcome bonus on signup'}
          </div>
        </div>
      </section>

      {/* ── LIVE STATS ──────────────────────── */}
      <section className="border-y border-white/5 bg-white/2 py-10 px-5">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {LIVE_STATS.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * i, duration: 0.5 }} className="text-center">
                <Icon className="w-5 h-5 text-emerald-400 mx-auto mb-2" />
                <div className="text-2xl font-black text-white">{s.value}</div>
                <div className="text-xs text-slate-500 mt-1">{s.label}</div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ── HOW IT WORKS + AUTH ─────────────── */}
      <section className="max-w-7xl mx-auto px-5 py-20 grid lg:grid-cols-2 gap-16 items-start">
        {/* Left: How it works */}
        <div>
          <h2 className="text-3xl font-black text-white mb-10">{isAr ? 'كيف يعمل؟' : 'How It Works'}</h2>
          <div className="space-y-6">
            {STEPS.map((s) => (
              <div key={s.n} className="flex gap-5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-sm flex items-center justify-center shrink-0">{s.n}</div>
                <div>
                  <div className="font-bold text-white mb-1">{s.title}</div>
                  <div className="text-sm text-slate-400">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* trust indicators */}
          <div className="mt-10 grid grid-cols-3 gap-3">
            {[
              { icon: Shield, label: 'Provably Fair' },
              { icon: Zap, label: 'Instant Payouts' },
              { icon: Cpu, label: 'AI Practice' },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <div key={t.label} className="p-3 rounded-xl border border-white/8 bg-white/3 text-center">
                  <Icon className="w-4 h-4 text-emerald-400 mx-auto mb-1.5" />
                  <div className="text-xs font-semibold text-slate-300">{t.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Auth Card */}
        <div className="rounded-2xl border border-white/10 bg-[#12121a] overflow-hidden shadow-2xl">
          {/* tab bar */}
          <div className="flex border-b border-white/8">
            {(['login', 'register'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-4 text-sm font-bold transition relative ${tab === t ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {t === 'login' ? (isAr ? 'تسجيل دخول' : 'Sign In') : (isAr ? 'إنشاء حساب' : 'Create Account')}
                {tab === t && <div className="absolute bottom-0 inset-x-0 h-0.5 bg-gradient-to-r from-emerald-500 to-cyan-500" />}
              </button>
            ))}
          </div>

          <div className="p-6">
            {tab === 'login' ? (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <Field label={isAr ? 'اسم المستخدم' : 'Username'}>
                  <input type="text" value={loginUser} onChange={e => setLoginUser(e.target.value)} placeholder="username" className={INPUT_CLS} required />
                </Field>
                <Field label={isAr ? 'كلمة المرور' : 'Password'}>
                  <div className="relative">
                    <input type={showPass ? 'text' : 'password'} value={loginPass} onChange={e => setLoginPass(e.target.value)} placeholder="••••••••" className={INPUT_CLS} required />
                    <button type="button" onClick={() => setShowPass(p => !p)} className="absolute right-3 top-3 text-slate-500 hover:text-slate-300">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </Field>
                <PrimaryBtn disabled={isAuthLoading}>{isAuthLoading ? '...' : (isAr ? 'دخول' : 'Sign In')}</PrimaryBtn>
              </form>
            ) : (
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <Field label={isAr ? 'اسم المستخدم' : 'Username'}>
                  <input type="text" value={regUser} onChange={e => setRegUser(e.target.value)} placeholder="username" className={INPUT_CLS} required />
                </Field>
                <Field label={isAr ? 'البريد الإلكتروني' : 'Email'}>
                  <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="you@example.com" className={INPUT_CLS} required />
                </Field>
                <Field label={isAr ? 'كلمة المرور' : 'Password'}>
                  <div className="relative">
                    <input type={showRegPass ? 'text' : 'password'} value={regPass} onChange={e => setRegPass(e.target.value)} placeholder="••••••••" className={INPUT_CLS} required />
                    <button type="button" onClick={() => setShowRegPass(p => !p)} className="absolute right-3 top-3 text-slate-500 hover:text-slate-300">
                      {showRegPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </Field>
                <Field label={isAr ? 'عنوان محفظة TRC20' : 'TRC20 Wallet (for payouts)'}>
                  <input type="text" value={regWallet} onChange={e => setRegWallet(e.target.value)} placeholder="T..." className={`${INPUT_CLS} font-mono text-xs`} />
                </Field>
                <PrimaryBtn disabled={isAuthLoading}>{isAuthLoading ? '...' : (isAr ? 'إنشاء الحساب + 500 USDT' : 'Register & Claim 500 USDT')}</PrimaryBtn>
              </form>
            )}

          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ───────────────────── */}
      <section className="border-t border-white/5 bg-white/2 px-5 py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-black text-white text-center mb-12">{isAr ? 'لماذا نحن؟' : 'Why Players Choose Us'}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: Wallet, color: 'emerald', title: 'Instant TRC20 Payouts', desc: 'P2P settlements in 60 seconds via blockchain' },
              { icon: Cpu, color: 'cyan', title: 'AI Practice Mode', desc: 'Easy / Medium / Hard bot opponents at no cost' },
              { icon: Trophy, color: 'amber', title: 'Global Leaderboards', desc: 'Real-time rankings and tournament brackets' },
              { icon: Shield, color: 'violet', title: 'Cryptographic Escrow', desc: 'SHA-256 integrity hash for every single match' },
            ].map((f) => {
              const Icon = f.icon;
              const colors: Record<string, string> = {
                emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
                cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
                amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
                violet: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
              };
              return (
                <div key={f.title} className="p-5 rounded-2xl border border-white/8 bg-[#12121a] hover:border-white/15 transition group">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${colors[f.color]}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-white mb-1.5">{f.title}</h3>
                  <p className="text-sm text-slate-400">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ────────────────────── */}
      <section className="px-5 py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black text-white text-center mb-12">{isAr ? 'آراء اللاعبين' : 'What Players Say'}</h2>
          <div className="grid sm:grid-cols-3 gap-5">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="p-5 rounded-2xl border border-white/8 bg-[#12121a]">
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-slate-300 mb-4">"{t.text}"</p>
                <div className="text-xs font-bold text-slate-400">{t.flag} {t.name}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────── */}
      <section className="border-t border-white/5 bg-white/2 px-5 py-20">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-black text-white text-center mb-10">{isAr ? 'الأسئلة الشائعة' : 'FAQ'}</h2>
          <div className="space-y-2">
            {FAQ.map((f, i) => (
              <div key={i} className="rounded-xl border border-white/8 bg-[#12121a] overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-5 py-4 flex items-center justify-between text-left font-semibold text-sm text-white hover:text-emerald-300 transition"
                >
                  {f.q}
                  <ChevronDown className={`w-4 h-4 transition-transform shrink-0 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="px-5 pb-4 text-sm text-slate-400">{f.a}</motion.div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────── */}
      <section className="px-5 py-20 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-black text-white mb-4">{isAr ? 'مستعد للعب؟' : 'Ready to Compete?'}</h2>
          <p className="text-slate-400 mb-8">{isAr ? 'انضم إلى آلاف اللاعبين الآن' : 'Join thousands of players competing right now.'}</p>
          <button
            onClick={() => setTab('register')}
            className="px-10 py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-lg transition shadow-xl shadow-emerald-500/25"
          >
            {isAr ? 'ابدأ الآن — مجاناً' : 'Get Started — Free'}
          </button>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────── */}
      <footer className="border-t border-white/5 px-5 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>© 2026 8-Ball Arena. Powered by USDT TRC20 Blockchain.</span>
          <div className="flex items-center gap-1.5 text-emerald-500 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            CERTIFIED PROVABLY FAIR
          </div>
        </div>
      </footer>
    </div>
  );
}

const INPUT_CLS = 'w-full bg-[#0a0a0f] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function PrimaryBtn({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="w-full py-3 mt-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-50 text-slate-950 font-black transition shadow-lg"
    >
      {children}
    </button>
  );
}
