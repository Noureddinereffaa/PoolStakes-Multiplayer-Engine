import { useEffect, useState, useRef } from 'react';
import { isIOS, isStandalone } from '../utils/mobile';
import { Smartphone, Download, Share2, ArrowLeft, CheckCircle, Tablet, Maximize2, ExternalLink } from 'lucide-react';

interface PwaInstallScreenProps {
  deferredInstall: any;
  language: 'en' | 'ar';
  onInstallComplete?: () => void;
}

export default function PwaInstallScreen({ deferredInstall, language, onInstallComplete }: PwaInstallScreenProps) {
  const [step, setStep] = useState<'checking' | 'install' | 'installing' | 'done' | 'open'>('checking');
  const [installError, setInstallError] = useState<string | null>(null);
  const [detectedInstalled, setDetectedInstalled] = useState(false);
  const [closeAttempted, setCloseAttempted] = useState(false);
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

  // Listen for appinstalled event even if it fires later
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

  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-b from-[#0a0a0f] via-[#0d1117] to-[#0a0a0f] flex flex-col items-center justify-center overflow-y-auto" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md mx-auto px-6 py-10 flex flex-col items-center gap-8">

        {/* App Icon */}
        <div className="relative">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-700 flex items-center justify-center text-4xl shadow-2xl shadow-emerald-500/30 ring-2 ring-white/10">
            🎱
          </div>
          <div className={`absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center shadow-lg ${detectedInstalled ? 'bg-emerald-500' : 'bg-amber-500'} ${!detectedInstalled ? 'animate-pulse' : ''}`}>
            {detectedInstalled ? (
              <CheckCircle className="w-3.5 h-3.5 text-white" />
            ) : (
              <Download className="w-3.5 h-3.5 text-white" />
            )}
          </div>
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-2">
            {isAr ? '8-Ball Arena' : '8-Ball Arena'}
          </h1>
          <p className="text-sm text-slate-400 max-w-xs mx-auto">
            {detectedInstalled
              ? (isAr ? 'التطبيق مثبت ✓ افتحه من الشاشة الرئيسية' : 'App installed ✓ Open from home screen')
              : (isAr ? 'ثبّت التطبيق لتجربة لعب احترافية' : 'Install the app for the best experience')}
          </p>
        </div>

        {/* Step: Install */}
        {step === 'install' && !detectedInstalled && (
          <div className="w-full space-y-4">
            {/* Feature cards */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Smartphone, label: isAr ? 'أداء أسرع' : 'Faster', sub: isAr ? 'بدون تأخير' : 'No lag' },
                { icon: Maximize2, label: isAr ? 'ملء الشاشة' : 'Fullscreen', sub: isAr ? 'تجربة غامرة' : 'Immersive' },
                { icon: Bell, label: isAr ? 'إشعارات' : 'Notifications', sub: isAr ? 'عند دورك' : 'Your turn' },
                { icon: Tablet, label: isAr ? 'دون اتصال' : 'Offline', sub: isAr ? 'اتصال ثابت' : 'Stable' },
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

            {/* Install section */}
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
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-sm transition-all shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  {isAr ? 'تثبيت التطبيق' : 'Install App'}
                </button>
                <p className="text-[10px] text-amber-600/60 text-center">
                  {isAr ? 'بعد التثبيت، افتح التطبيق من الشاشة الرئيسية' : 'After install, open from home screen'}
                </p>
              </div>
            ) : (
              <div className="w-full space-y-3">
                <button
                  onClick={handleInstall}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-sm transition-all shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  {isAr ? 'تثبيت التطبيق' : 'Install App'}
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
                  {isAr ? 'بعد التثبيت، افتح التطبيق من الشاشة الرئيسية' : 'After install, open the app from your home screen'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Installing */}
        {step === 'installing' && !detectedInstalled && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-16 h-16 rounded-full border-4 border-emerald-500/30 border-t-emerald-400 animate-spin" />
            <p className="text-sm text-slate-400 animate-pulse">
              {isAr ? 'جاري التثبيت...' : 'Installing...'}
            </p>
          </div>
        )}

        {/* Open App state (detected as installed) */}
        {detectedInstalled && !closeAttempted && (
          <div className="w-full space-y-4">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-emerald-400" />
              </div>
              <p className="text-lg font-black text-emerald-400">
                {isAr ? '✓ تم التثبيت' : '✓ INSTALLED'}
              </p>
              <p className="text-xs text-slate-500 text-center max-w-xs">
                {isAr
                  ? 'التطبيق مثبت على جهازك. افتحه من الشاشة الرئيسية.'
                  : 'The app is installed on your device. Open from home screen.'}
              </p>
            </div>

            <button
              onClick={handleOpenApp}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-sm transition-all shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-5 h-5" />
              {isAr ? 'فتح التطبيق' : 'Open App'}
            </button>

            <p className="text-[10px] text-slate-600 text-center flex items-center justify-center gap-1">
              <ArrowLeft className="w-3 h-3" />
              {isAr ? 'ارجع إلى الشاشة الرئيسية وافتح التطبيق' : 'Go to home screen and open the app'}
            </p>
          </div>
        )}

        {/* Close attempt failed - tab didn't close */}
        {detectedInstalled && closeAttempted && (
          <div className="w-full space-y-4">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-20 h-20 rounded-full bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center">
                <Smartphone className="w-10 h-10 text-amber-400" />
              </div>
              <p className="text-lg font-black text-amber-400">
                {isAr ? '✋ اغلق علامة التبويب' : '✋ CLOSE THIS TAB'}
              </p>
              <p className="text-xs text-slate-500 text-center max-w-xs">
                {isAr
                  ? 'التطبيق مثبت. اخرج إلى الشاشة الرئيسية وافتح التطبيق من هناك، ثم اغلق علامة التبويب هذه.'
                  : 'App is installed. Go to your home screen and open the app from there, then close this tab.'}
              </p>
            </div>

            <button
              onClick={() => window.close()}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm transition-all shadow-xl shadow-amber-500/25 hover:shadow-amber-500/40 active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              {isAr ? 'إغلاق علامة التبويب' : 'Close Tab'}
            </button>
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

function Bell(props: any) {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>;
}
