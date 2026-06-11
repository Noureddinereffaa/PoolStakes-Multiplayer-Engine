import { useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { isMobileDevice, isStandalone } from '../utils/mobile';
import PwaInstallScreen from './PwaInstallScreen';

const ALLOWED_MOBILE_PATHS = ['/'];

const isDev = import.meta.env.DEV;

interface InstallGuardProps {
  children: ReactNode;
  language: 'en' | 'ar';
  onInstallComplete?: () => void;
}

export default function InstallGuard({ children, language, onInstallComplete }: InstallGuardProps) {
  const location = useLocation();
  const [installState, setInstallState] = useState<'loading' | 'blocked' | 'allowed'>('loading');
  const [deferredInstall, setDeferredInstall] = useState<any>(null);
  const isMobile = useRef(false);

  const checkInstallState = useCallback(() => {
    const mobile = isMobileDevice();
    isMobile.current = mobile;
    if (!mobile) return 'allowed';

    const standalone = isStandalone();
    const lsFlag = localStorage.getItem('pwa_installed') === 'true';

    if (standalone) {
      if (!lsFlag) localStorage.setItem('pwa_installed', 'true');
      return 'allowed';
    }

    if (lsFlag) {
      return 'blocked';
    }

    return 'blocked';
  }, []);

  // Capture any already-fired beforeinstallprompt from main.tsx
  useEffect(() => {
    import('../main').then((m) => {
      const pending = m.getPendingInstallPrompt();
      if (pending) setDeferredInstall(pending);
    });
  }, []);

  useEffect(() => {
    setInstallState(checkInstallState());
  }, [checkInstallState, location.pathname]);

  useEffect(() => {
    const handlePrompt = (e: any) => {
      e.preventDefault();
      setDeferredInstall(e);
    };

    const handleInstalled = () => {
      localStorage.setItem('pwa_installed', 'true');
      setInstallState(checkInstallState());
      onInstallComplete?.();
    };

    const handleStandalone = () => {
      if (isStandalone()) {
        localStorage.setItem('pwa_installed', 'true');
        setInstallState('allowed');
        onInstallComplete?.();
      }
    };

    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', handleInstalled);
    window.matchMedia('(display-mode: standalone)').addEventListener('change', handleStandalone);

    const poll = setInterval(() => {
      if (isStandalone()) {
        localStorage.setItem('pwa_installed', 'true');
        setInstallState('allowed');
        onInstallComplete?.();
        clearInterval(poll);
      }
    }, 2000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      window.matchMedia('(display-mode: standalone)').removeEventListener('change', handleStandalone);
      clearInterval(poll);
    };
  }, [checkInstallState, onInstallComplete]);

  const isOnHomePage = ALLOWED_MOBILE_PATHS.includes(location.pathname);

  // Mobile browser on home page → show content normally
  if (isMobile.current && installState === 'blocked' && isOnHomePage) {
    return <>{children}</>;
  }

  // Dev mode: bypass install guard so mobile browser testing works
  if (isDev) return <>{children}</>;

  if (installState === 'loading') {
    return (
      <div className="fixed inset-0 z-[9999] bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-emerald-500/30 border-t-emerald-400 animate-spin" />
      </div>
    );
  }

  if (installState === 'blocked') {
    return (
      <PwaInstallScreen
        deferredInstall={deferredInstall}
        language={language}
        onInstallComplete={() => {
          localStorage.setItem('pwa_installed', 'true');
          const state = checkInstallState();
          setInstallState(state);
          if (state === 'allowed') onInstallComplete?.();
        }}
      />
    );
  }

  return <>{children}</>;
}
