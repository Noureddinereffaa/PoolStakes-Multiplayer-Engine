import { useEffect, useState, useRef } from 'react';
import { isIOS, isStandalone } from '../utils/mobile';
import { Download, Share2, ArrowLeft, CheckCircle, Smartphone, Tablet, Zap, Shield, Star, Users, Trophy, Sparkles, ExternalLink, RefreshCw } from 'lucide-react';

interface PwaInstallScreenProps {
  deferredInstall: any;
  language: 'en' | 'ar';
  onInstallComplete?: () => void;
}

const ballEmojis = ['🔴', '🟡', '🔵', '🟢', '🟠', '🟣', '⚫', '🔴', '🟡', '🔵', '🟢', '🟠', '🟣', '⚪', '⚫'];

export default function PwaInstallScreen({ deferredInstall, language, onInstallComplete }: PwaInstallScreenProps) {
  const [step, setStep] = useState<'checking' | 'install' | 'installing' | 'open'>('checking');
  const [installError, setInstallError] = useState<string | null>(null);
  const [detectedInstalled, setDetectedInstalled] = useState(false);
  const [closeAttempted, setCloseAttempted] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const isAr = language === 'ar';
  const isiOS = isIOS();
  const deferredRef = useRef(deferredInstall);
  deferredRef.current = deferredInstall;

  useEffect(() => {
    if (isStandalone()) {
      setDetectedInstalled(true);
      setStep('open');
      onInstallComplete?.();
      return;
    }

    const lsFlag = localStorage.getItem('pwa_installed') === 'true';
    if (lsFlag) {
      setDetectedInstalled(true);
      setStep('open');
      return;
    }

    setStep('install');

    const poll = setInterval(() => {
      if (isStandalone()) {
        localStorage.setItem('pwa_installed', 'true');
        setDetectedInstalled(true);
        setStep('open');
        onInstallComplete?.();
        clearInterval(poll);
      }
    }, 2000);

    return () => clearInterval(poll);
  }, [onInstallComplete]);

  useEffect(() => {
    const onAppInstalled = () => {
      localStorage.setItem('pwa_installed', 'true');
      setDetectedInstalled(true);
      setStep('open');
      onInstallComplete?.();
    };
    window.addEventListener('appinstalled', onAppInstalled);
    return () => window.removeEventListener('appinstalled', onAppInstalled);
  }, [onInstallComplete]);

  const handleInstall = async () => {
    const promptEvent = deferredRef.current;
    if (promptEvent) {
      setStep('installing');
      setInstallError(null);
      try {
        promptEvent.prompt();
        const result = await promptEvent.userChoice;
        if (result.outcome === 'accepted') {
          localStorage.setItem('pwa_installed', 'true');
          setDetectedInstalled(true);
          setStep('open');
          onInstallComplete?.();
        } else {
          setInstallError(isAr ? 'لم يتم التثبيت. حاول مرة أخرى.' : 'Installation declined. Try again.');
          setStep('install');
        }
      } catch {
        setInstallError(isAr ? 'فشل التثبيت.' : 'Installation failed.');
        setStep('install');
      }
    } else {
      setInstallError(isAr ? 'حاول من القائمة ⋮ ← تثبيت التطبيق' : 'Use ⋮ → Install app');
      setStep('install');
    }
  };

  const handleOpenApp = () => {
    setCloseAttempted(true);
    window.close();
  };

  if (step === 'checking') {
    return (
      <div className="fixed inset-0 z-[9999] bg-gradient-to-b from-[#0a0a0f] via-[#0d1117] to-[#0a0a0f] flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-emerald-500/30 border-t-emerald-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-b from-[#0a0a0f] via-[#0d1117] to-[#0a0a0f] flex flex-col items-center justify-center overflow-y-auto" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Floating decorative balls */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {ballEmojis.slice(0, 6).map((emoji, i) => (
          <div
            key={i}
            className="absolute text-lg animate-float"
            style={{
              left: `${10 + i * 16}%`,
              top: `${20 + (i % 3) * 25}%`,
              animationDelay: `${i * 0.7}s`,
              animationDuration: `${4 + i * 0.5}s`,
              opacity: 0.08,
              transform: `rotate(${i * 45}deg)`,
            }}
          >
            {emoji}
          </div>
        ))}
      </div>

      <div className="relative z-10 w-full max-w-md mx-auto px-6 py-10 flex flex-col items-center gap-6">

        {/* App Icon with animated ring */}
        <div className="relative group">
          <div className="absolute -inset-4 rounded-full bg-emerald-500/10 animate-pulse blur-md" />
          <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-700 flex items-center justify-center text-4xl shadow-2xl shadow-emerald-500/30 ring-2 ring-white/10 group-hover:ring-emerald-400/30 transition-all duration-500">
            🎱
          </div>
          <div className={`absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center shadow-lg transition-all duration-500 ${
            detectedInstalled ? 'bg-emerald-500 scale-100' : 'bg-amber-500 scale-110'
          }`}>
            {detectedInstalled ? (
              <CheckCircle className="w-3.5 h-3.5 text-white" />
            ) : (
              <Download className="w-3.5 h-3.5 text-white" />
            )}
          </div>
        </div>

        {/* Title + Subtitle */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            8-Ball Arena
          </h1>
          <p className="text-sm text-slate-400 max-w-xs mx-auto leading-relaxed">
            {detectedInstalled
              ? (isAr ? '✓ التطبيق مثبت على جهازك' : '✓ App is installed on your device')
              : (isAr ? 'ثبّت التطبيق واستمتع بتجربة لعب احترافية' : 'Install the app for a pro pool experience')}
          </p>
        </div>

        {/* ════════════════════════════════════════════════ */}
        {/* INSTALL VIEW */}
        {/* ════════════════════════════════════════════════ */}
        {(step === 'install' && !detectedInstalled) || showInstall ? (
          <div className="w-full space-y-5">

            {/* Social proof */}
            <div className="flex items-center justify-center gap-6 text-center">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] font-mono text-slate-500">
                  <strong className="text-emerald-400">12K+</strong> {isAr ? 'لاعب' : 'players'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] font-mono text-slate-500">
                  <strong className="text-amber-400">4.8</strong> ★
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] font-mono text-slate-500">
                  <strong className="text-amber-400">#1</strong> {isAr ? 'بلياردو' : 'Pool'}
                </span>
              </div>
            </div>

            {/* Feature cards */}
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { icon: Zap, label: isAr ? 'أداء خارق' : 'Turbo Speed', sub: isAr ? 'بدون تقطيع ولا تأخير' : 'Zero lag. Smooth 60fps', color: 'text-yellow-400', border: 'border-yellow-500/20', bg: 'bg-yellow-500/10' },
                { icon: Tablet, label: isAr ? 'شاشة كاملة' : 'Fullscreen', sub: isAr ? 'تجربة غامرة بدون حدود' : 'Immersive edge-to-edge', color: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/10' },
                { icon: Shield, label: isAr ? 'لعب عادل' : 'Provably Fair', sub: isAr ? 'خوارزمية شفافة ومصدقة' : 'Audited. Trusted. Fair.', color: 'text-blue-400', border: 'border-blue-500/20', bg: 'bg-blue-500/10' },
                { icon: Smartphone, label: isAr ? 'تحكم ذكي' : 'Smart Touch', sub: isAr ? 'إيماءات بديهية وسلسة' : 'Intuitive gesture controls', color: 'text-purple-400', border: 'border-purple-500/20', bg: 'bg-purple-500/10' },
                { icon: Sparkles, label: isAr ? 'إشعارات فورية' : 'Instant Alerts', sub: isAr ? 'نبّهني عندما يحين دوري' : 'Know when it\'s your turn', color: 'text-rose-400', border: 'border-rose-500/20', bg: 'bg-rose-500/10' },
                { icon: Trophy, label: isAr ? 'بطولات حية' : 'Live Tourneys', sub: isAr ? 'تنافس مع الأبطال' : 'Compete for the crown', color: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/10' },
              ].map((feat, i) => {
                const Icon = feat.icon;
                return (
                  <div key={i} className={`flex items-center gap-2.5 p-3 rounded-xl ${feat.bg} ${feat.border} border transition-all hover:scale-[1.02]`}>
                    <div className={`w-7 h-7 rounded-lg ${feat.bg} ${feat.border} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-3.5 h-3.5 ${feat.color}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-white">{feat.label}</div>
                      <div className="text-[8px] text-slate-500 truncate">{feat.sub}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Install action */}
            {isiOS ? (
              <div className="w-full space-y-3">
                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-3">
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
                    <Share2 className="w-4 h-4" />
                    {isAr ? 'طريقة التثبيت على iPhone/iPad' : 'How to install on iPhone/iPad'}
                  </div>
                  <div className="space-y-2">
                    <Step num="1" text={isAr ? 'اضغط زر المشاركة' : 'Tap the Share button'} ios />
                    <Step num="2" text={isAr ? 'اختر "إضافة إلى الشاشة الرئيسية"' : 'Choose "Add to Home Screen"'} ios />
                    <Step num="3" text={isAr ? 'اضغط "إضافة" بالأعلى' : 'Tap "Add"'} ios />
                  </div>
                </div>
                <button
                  onClick={handleInstall}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-sm transition-all shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 active:scale-[0.97] flex items-center justify-center gap-2 group"
                >
                  <Download className="w-5 h-5 group-hover:animate-bounce" />
                  {isAr ? 'تثبيت التطبيق' : 'Install App'}
                </button>
                <p className="text-[10px] text-amber-600/60 text-center">
                  {isAr ? 'مجاني • آمن • بدون إعلانات' : 'Free • Secure • No Ads'}
                </p>
              </div>
            ) : (
              <div className="w-full space-y-3">
                <button
                  onClick={handleInstall}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-sm transition-all shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 active:scale-[0.97] flex items-center justify-center gap-2 group"
                >
                  <Download className="w-5 h-5 group-hover:animate-bounce" />
                  {isAr ? 'تثبيت التطبيق مجاناً' : 'Install App — Free'}
                </button>

                {!deferredInstall && (
                  <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
                    <div className="flex items-center gap-2 text-amber-400 text-xs font-bold mb-2">
                      <Smartphone className="w-4 h-4" />
                      {isAr ? 'التثبيت اليدوي' : 'Manual Install'}
                    </div>
                    <div className="space-y-2">
                      <Step num="1" text={isAr ? 'اضغط على ⋮ في المتصفح' : 'Tap ⋮ in browser'} />
                      <Step num="2" text={isAr ? 'اختر "تثبيت التطبيق"' : 'Select "Install app"'} />
                      <Step num="3" text={isAr ? 'اضغط "تثبيت"' : 'Tap "Install"'} />
                    </div>
                  </div>
                )}

                {installError && (
                  <div className="text-center text-[11px] text-red-400/80 font-mono bg-red-500/5 border border-red-500/20 rounded-lg p-2">
                    {installError}
                  </div>
                )}

                <p className="text-[10px] text-slate-600 text-center">
                  {isAr ? 'أقل من 30 ثانية • مجاني • تحديثات تلقائية' : 'Takes 30s • Free • Auto-updates'}
                </p>
              </div>
            )}

            {/* Toggle to Open App */}
            {(detectedInstalled || localStorage.getItem('pwa_installed') === 'true') && (
              <button
                onClick={() => { setShowInstall(false); setDetectedInstalled(true); setStep('open'); }}
                className="w-full py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-bold transition-all flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {isAr ? 'التطبيق مثبت مسبقاً — افتحه' : 'Already installed — Open App'}
              </button>
            )}
          </div>
        ) : null}

        {/* ════════════════════════════════════════════════ */}
        {/* INSTALLING */}
        {/* ════════════════════════════════════════════════ */}
        {step === 'installing' && !detectedInstalled && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-20 h-20 rounded-full border-[3px] border-emerald-500/30 border-t-emerald-400 animate-spin" />
            <p className="text-sm text-slate-400 animate-pulse font-mono">
              {isAr ? 'جاري التثبيت...' : 'Installing...'}
            </p>
            <div className="flex items-center gap-3 text-[10px] text-slate-600">
              <div className="flex items-center gap-1"><Zap className="w-3 h-3 text-emerald-500/60" />{isAr ? 'تحضير التطبيق' : 'Preparing app'}</div>
              <div className="flex items-center gap-1"><Shield className="w-3 h-3 text-emerald-500/60" />{isAr ? 'التحقق من الأمان' : 'Security check'}</div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════ */}
        {/* OPEN APP VIEW */}
        {/* ════════════════════════════════════════════════ */}
        {detectedInstalled && step === 'open' && !closeAttempted && (
          <div className="w-full space-y-5">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="relative">
                <div className="absolute -inset-3 rounded-full bg-emerald-500/10 animate-ping" />
                <div className="relative w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center">
                  <CheckCircle className="w-10 h-10 text-emerald-400" />
                </div>
              </div>
              <p className="text-lg font-black text-emerald-400 tracking-wider">
                {isAr ? '✓ جاهز للانطلاق' : '✓ READY TO PLAY'}
              </p>
              <p className="text-xs text-slate-500 text-center max-w-xs leading-relaxed">
                {isAr
                  ? 'التطبيق مثبت. ارجع إلى الشاشة الرئيسية وافتح 8-Ball Arena.'
                  : 'Installed. Go to your home screen and tap 8-Ball Arena.'}
              </p>
            </div>

            <button
              onClick={handleOpenApp}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-sm transition-all shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 active:scale-[0.97] flex items-center justify-center gap-2"
            >
              <Sparkles className="w-5 h-5" />
              {isAr ? 'افتح التطبيق الآن' : 'Open App Now'}
            </button>

            <p className="text-[10px] text-slate-600 text-center flex items-center justify-center gap-1.5">
              <ArrowLeft className="w-3 h-3" />
              {isAr ? 'ثم ارجع إلى هنا وأغلق علامة التبويب' : 'Then close this browser tab'}
            </p>

            {/* Didn't install? */}
            <button
              onClick={() => { setShowInstall(true); setStep('install'); }}
              className="w-full py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/5 text-slate-500 hover:text-slate-300 text-[11px] font-bold transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-3 h-3" />
              {isAr ? 'لم يتم التثبيت؟ اضغط هنا للعودة' : 'Didn\'t install? Click here'}
            </button>
          </div>
        )}

        {/* Close attempt failed */}
        {detectedInstalled && step === 'open' && closeAttempted && (
          <div className="w-full space-y-5">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-20 h-20 rounded-full bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center">
                <Smartphone className="w-10 h-10 text-amber-400" />
              </div>
              <p className="text-lg font-black text-amber-400">
                {isAr ? '✋ أغلق علامة التبويب' : '✋ CLOSE THIS TAB'}
              </p>
              <p className="text-xs text-slate-500 text-center max-w-xs leading-relaxed">
                {isAr
                  ? 'التطبيق جاهز. اذهب إلى الشاشة الرئيسية وافتح 8-Ball Arena، ثم عد وأغلق علامة التبويب هذه.'
                  : 'App is ready. Go to your home screen, open 8-Ball Arena, then close this tab.'}
              </p>
            </div>

            <button
              onClick={() => window.close()}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm transition-all shadow-xl shadow-amber-500/25 hover:shadow-amber-500/40 active:scale-[0.97] flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              {isAr ? 'إغلاق علامة التبويب' : 'Close Tab'}
            </button>

            <button
              onClick={() => { setCloseAttempted(false); }}
              className="w-full py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/5 text-slate-500 hover:text-slate-300 text-[11px] font-bold transition-all"
            >
              {isAr ? 'رجوع' : 'Go back'}
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          33% { transform: translateY(-12px) rotate(3deg); }
          66% { transform: translateY(6px) rotate(-2deg); }
        }
        .animate-float {
          animation: float 5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

function Step({ num, text, ios }: { num: string; text: string; ios?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${ios ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
        {num}
      </div>
      <span className="text-xs text-slate-400">{text}</span>
    </div>
  );
}
