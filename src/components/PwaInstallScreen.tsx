import { useEffect, useState, useRef } from 'react';
import { isIOS, isAndroid, isStandalone, shareRoomCode } from '../utils/mobile';
import { Smartphone, AppWindow, Download, Share2, ArrowLeft, RotateCcw, CheckCircle, Tablet, Maximize2 } from 'lucide-react';

interface PwaInstallScreenProps {
  deferredInstall: any;
  language: 'en' | 'ar';
  onInstallComplete?: () => void;
}

export default function PwaInstallScreen({ deferredInstall, language, onInstallComplete }: PwaInstallScreenProps) {
  const [step, setStep] = useState<'checking' | 'install' | 'installing' | 'done'>('checking');
  const [installError, setInstallError] = useState<string | null>(null);
  const isAr = language === 'ar';
  const isiOS = isIOS();
  const isAndroidDevice = isAndroid();

  useEffect(() => {
    if (isStandalone()) {
      setStep('done');
      onInstallComplete?.();
    } else if (deferredInstall) {
      setStep('install');
    } else {
      setStep('install');
    }
  }, [deferredInstall, onInstallComplete]);

  const handleInstall = async () => {
    setStep('installing');
    setInstallError(null);

    if (deferredInstall) {
      try {
        deferredInstall.prompt();
        const result = await deferredInstall.userChoice;
        if (result.outcome === 'accepted') {
          setStep('done');
          onInstallComplete?.();
        } else {
          setInstallError(isAr ? 'لم يتم التثبيت. حاول مرة أخرى.' : 'Installation declined. Try again.');
          setStep('install');
        }
      } catch {
        setInstallError(isAr ? 'فشل التثبيت. اتبع التعليمات اليدوية.' : 'Installation failed. Follow manual steps.');
        setStep('install');
      }
    } else {
      setInstallError(isAr ? 'حاول مرة أخرى أو استخدم القائمة يدوياً' : 'Try again or use browser menu manually');
      setStep('install');
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-b from-[#0a0a0f] via-[#0d1117] to-[#0a0a0f] flex flex-col items-center justify-center overflow-y-auto" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Background effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md mx-auto px-6 py-10 flex flex-col items-center gap-8">

        {/* App Icon */}
        <div className="relative">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-700 flex items-center justify-center text-4xl shadow-2xl shadow-emerald-500/30 ring-2 ring-white/10">
            🎱
          </div>
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/50 animate-pulse">
            <Download className="w-3.5 h-3.5 text-white" />
          </div>
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-2">
            {isAr ? '8-Ball Pool' : '8-Ball Arena'}
          </h1>
          <p className="text-sm text-slate-400 max-w-xs mx-auto">
            {isAr
              ? 'جرّب التطبيق الأصلي لتجربة لعب احترافية وأداء فائق'
              : 'Get the native app for the best gaming experience'}
          </p>
        </div>

        {/* Step indicator */}
        {step === 'install' && (
          <div className="w-full space-y-4">
            {/* Feature cards */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Zap, label: isAr ? 'أداء أسرع' : 'Faster Performance', sub: isAr ? 'بدون تأخير' : 'No lag' },
                { icon: Maximize2, label: isAr ? 'ملء الشاشة' : 'Fullscreen', sub: isAr ? 'تجربة غامرة' : 'Immersive' },
                { icon: Bell, label: isAr ? 'إشعارات فورية' : 'Instant Alerts', sub: isAr ? 'عند دورك' : 'When your turn' },
                { icon: Tablet, label: isAr ? 'دون اتصال' : 'Offline Stable', sub: isAr ? 'اتصال ثابت' : 'Stable connection' },
              ].map((feat, i) => {
                const Icon = feat.icon;
                return (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white">{feat.label}</div>
                      <div className="text-[10px] text-slate-500">{feat.sub}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* iOS instructions */}
            {isiOS && (
              <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-3">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
                  <Share2 className="w-4 h-4" />
                  {isAr ? 'طريقة التثبيت على iPhone/iPad' : 'How to install on iPhone/iPad'}
                </div>
                <div className="space-y-2">
                  <Step num="1" text={isAr ? 'اضغط زر المشاركة' : 'Tap the Share button'} ios />
                  <Step num="2" text={isAr ? 'اختر "إضافة إلى الشاشة الرئيسية"' : 'Choose "Add to Home Screen"'} ios />
                  <Step num="3" text={isAr ? 'اضغط "إضافة" بالأعلى' : 'Tap "Add" at the top right'} ios />
                </div>
              </div>
            )}

            {/* Android instructions (when beforeinstallprompt not available) */}
            {!deferredInstall && !isiOS && (
              <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-3">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
                  <AppWindow className="w-4 h-4" />
                  {isAr ? 'التثبيت اليدوي' : 'Manual Installation'}
                </div>
                <div className="space-y-2">
                  <Step num="1" text={isAr ? 'اضغط على ⋮ في المتصفح' : 'Tap ⋮ in your browser'} />
                  <Step num="2" text={isAr ? 'اختر "تثبيت التطبيق"' : 'Select "Install app"'} />
                  <Step num="3" text={isAr ? 'اضغط "تثبيت"' : 'Tap "Install"'} />
                </div>
                <button
                  onClick={handleInstall}
                  className="w-full mt-2 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold hover:bg-amber-500/20 transition"
                >
                  {isAr ? 'حاول مرة أخرى' : 'Try Again'}
                </button>
              </div>
            )}

            {/* Install button (Android with prompt) */}
            {!!deferredInstall && (
              <button
                onClick={handleInstall}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-sm transition-all shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                {isAr ? 'تثبيت التطبيق' : 'Install App'}
              </button>
            )}

            {/* Error */}
            {installError && (
              <div className="text-center text-[11px] text-red-400/80 font-mono bg-red-500/5 border border-red-500/20 rounded-lg p-2">
                {installError}
              </div>
            )}

            {/* Info text */}
            <p className="text-[10px] text-slate-600 text-center">
              {isAr
                ? 'بعد التثبيت، افتح التطبيق من الشاشة الرئيسية للبدء'
                : 'After installation, open the app from your home screen to start playing'}
            </p>
          </div>
        )}

        {/* Installing / Done */}
        {step === 'installing' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-16 h-16 rounded-full border-4 border-emerald-500/30 border-t-emerald-400 animate-spin" />
            <p className="text-sm text-slate-400 animate-pulse">
              {isAr ? 'جاري التثبيت...' : 'Installing...'}
            </p>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-emerald-400" />
            </div>
            <p className="text-lg font-black text-emerald-400">
              {isAr ? '✓ تم التثبيت' : '✓ INSTALLED'}
            </p>
            <p className="text-xs text-slate-500 text-center max-w-xs">
              {isAr
                ? 'افتح التطبيق من الشاشة الرئيسية. سيتم التحديث تلقائياً عند توفر إصدار جديد.'
                : 'Open the app from your home screen. Updates are automatic.'}
            </p>
            <div className="flex items-center gap-2 text-[10px] text-slate-600 mt-4 animate-pulse">
              <ArrowLeft className="w-3 h-3" />
              {isAr ? 'ارجع إلى الشاشة الرئيسية' : 'Return to home screen'}
            </div>
          </div>
        )}
      </div>
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

function Zap(props: any) { return <Smartphone className="w-4 h-4" {...props} />; }
function Bell(props: any) { return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>; }
