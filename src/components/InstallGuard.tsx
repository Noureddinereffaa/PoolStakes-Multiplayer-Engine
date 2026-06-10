import { useEffect, useState, useRef, ReactNode } from 'react';
import { isMobileDevice, isStandalone } from '../utils/mobile';
import PwaInstallScreen from './PwaInstallScreen';

interface InstallGuardProps {
  children: ReactNode;
  language: 'en' | 'ar';
  onInstallComplete?: () => void;
}

export default function InstallGuard({ children, language, onInstallComplete }: InstallGuardProps) {
  const [installState, setInstallState] = useState<'loading' | 'blocked' | 'allowed'>('loading');
  const deferredInstallRef = useRef<any>(null);

  useEffect(() => {
    const check = () => {
      const isMobile = isMobileDevice();
      const isInstalled = isStandalone() || localStorage.getItem('pwa_installed') === 'true';

      if (!isMobile) {
        setInstallState('allowed');
        return;
      }

      if (isInstalled && isStandalone()) {
        setInstallState('allowed');
        return;
      }

      setInstallState('blocked');
    };

    check();

    const onInstallPrompt = (e: any) => {
      e.preventDefault();
      deferredInstallRef.current = e;
    };

    const onAppInstalled = () => {
      localStorage.setItem('pwa_installed', 'true');
      setInstallState('allowed');
      onInstallComplete?.();
    };

    const onStandaloneChange = () => {
      if (isStandalone()) {
        localStorage.setItem('pwa_installed', 'true');
        setInstallState('allowed');
        onInstallComplete?.();
      }
    };

    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    window.matchMedia('(display-mode: standalone)').addEventListener('change', onStandaloneChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      window.matchMedia('(display-mode: standalone)').removeEventListener('change', onStandaloneChange);
    };
  }, [onInstallComplete]);

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
        deferredInstall={deferredInstallRef.current}
        language={language}
        onInstallComplete={() => {
          localStorage.setItem('pwa_installed', 'true');
          setInstallState('allowed');
          onInstallComplete?.();
        }}
      />
    );
  }

  return <>{children}</>;
}
