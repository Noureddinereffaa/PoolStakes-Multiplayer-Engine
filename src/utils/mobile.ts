export function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
}

export function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

export function isLandscape(): boolean {
  return window.innerWidth > window.innerHeight;
}

export function getSafeAreaInsets(): { top: number; right: number; bottom: number; left: number } {
  const style = getComputedStyle(document.documentElement);
  return {
    top: parseFloat(style.getPropertyValue('--sat') || '0'),
    right: parseFloat(style.getPropertyValue('--sar') || '0'),
    bottom: parseFloat(style.getPropertyValue('--sab') || '0'),
    left: parseFloat(style.getPropertyValue('--sal') || '0'),
  };
}

let wakeLockSentinel: any = null;

export async function requestWakeLock(): Promise<void> {
  try {
    if ('wakeLock' in navigator && !wakeLockSentinel) {
      wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; });
    }
  } catch (_) {}
}

export async function releaseWakeLock(): Promise<void> {
  try {
    if (wakeLockSentinel) {
      await wakeLockSentinel.release();
      wakeLockSentinel = null;
    }
  } catch (_) {}
}

export function hideBrowserChrome(): void {
  const d = document.documentElement;
  d.style.height = 'calc(100% + 1px)';
  window.scrollTo(0, 1);
  requestAnimationFrame(() => { d.style.height = ''; });
  setTimeout(() => { window.scrollTo(0, 1); }, 300);
}

export async function enterFullscreen(element: HTMLElement): Promise<boolean> {
  hideBrowserChrome();
  try {
    await element.requestFullscreen({ navigationUI: 'hide' } as any);
    if (isMobileDevice()) {
      try { await (screen.orientation as any)?.lock?.('landscape-primary'); } catch (_) {}
    }
    return true;
  } catch (_) {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch (_) {}
}

export function shareRoomCode(roomId: string): void {
  if ((navigator as any).share) {
    (navigator as any).share({
      title: '8-Ball Pool',
      text: `Join my 8-Ball Pool game! Room code: ${roomId}`,
      url: window.location.origin,
    }).catch(() => {});
  } else {
    navigator.clipboard.writeText(roomId).catch(() => {});
  }
}

export function vibrate(pattern: number | number[]): void {
  try { navigator.vibrate?.(pattern); } catch (_) {}
}

export function getConnectionInfo(): { type: string; effectiveType: string; downlink: number; rtt: number } | null {
  const conn = (navigator as any).connection;
  if (!conn) return null;
  return {
    type: conn.type || 'unknown',
    effectiveType: conn.effectiveType || 'unknown',
    downlink: conn.downlink || 0,
    rtt: conn.rtt || 0,
  };
}

export function onConnectionChange(callback: (info: any) => void): () => void {
  const conn = (navigator as any).connection;
  if (!conn) return () => {};
  const handler = () => callback(getConnectionInfo());
  conn.addEventListener('change', handler);
  return () => conn.removeEventListener('change', handler);
}

export function isLowEndDevice(): boolean {
  try {
    const mem = (navigator as any).deviceMemory;
    if (mem && mem < 4) return true;
    const cores = navigator.hardwareConcurrency;
    if (cores && cores < 4) return true;
  } catch (_) {}
  return isMobileDevice();
}

export function getOptimalDPR(): number {
  if (isLowEndDevice()) {
    return Math.min(window.devicePixelRatio || 1, 1.5);
  }
  return Math.min(window.devicePixelRatio || 1, 2);
}

export let audioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioContext = new AudioContextClass();
    }
  }
  if (audioContext?.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

export function setupAudioOnInteraction(): void {
  const handler = () => {
    getAudioContext();
    document.removeEventListener('click', handler);
    document.removeEventListener('touchstart', handler);
    document.removeEventListener('keydown', handler);
  };
  document.addEventListener('click', handler);
  document.addEventListener('touchstart', handler);
  document.addEventListener('keydown', handler);
}

export let isOnline = navigator.onLine;

export function onOnlineChange(callback: (online: boolean) => void): () => void {
  const goOnline = () => { isOnline = true; callback(true); };
  const goOffline = () => { isOnline = false; callback(false); };
  window.addEventListener('online', goOnline);
  window.addEventListener('offline', goOffline);
  return () => {
    window.removeEventListener('online', goOnline);
    window.removeEventListener('offline', goOffline);
  };
}
