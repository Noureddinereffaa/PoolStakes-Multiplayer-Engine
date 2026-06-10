if (typeof window !== 'undefined') {
  const isHmrNoise = (val: unknown): boolean => {
    if (!val) return false;
    const s = String(val).toLowerCase();
    return (
      (s.includes('vite') || s.includes('[hmr]')) &&
      (s.includes('failed to connect') || s.includes('closed without opened') || s.includes('websocket'))
    );
  };

  window.addEventListener('unhandledrejection', (e) => {
    if (isHmrNoise(e.reason) || isHmrNoise(e.reason?.message)) {
      e.preventDefault();
    }
  });
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { isMobileDevice, setupAudioOnInteraction } from './utils/mobile';
import './index.css';

setupAudioOnInteraction();

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
    if (reg.waiting) {
      reg.waiting.postMessage('SKIP_WAITING');
    }

    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          newWorker.postMessage('SKIP_WAITING');
        }
      });
    });

    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            newWorker.postMessage('SKIP_WAITING');
          }
        });
      }
    });
  }).catch((err) => {
    console.warn('SW registration failed:', err);
  });
}

registerServiceWorker();

if ('connection' in navigator) {
  const conn = (navigator as any).connection;
  const updateOnlineStatus = () => {
    document.documentElement.dataset.online = navigator.onLine ? 'true' : 'false';
  };
  updateOnlineStatus();
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  conn.addEventListener('change', () => {
    document.documentElement.dataset.effectiveType = conn.effectiveType || 'unknown';
  });
}

if (isMobileDevice()) {
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => {
    if (document.fullscreenElement) e.preventDefault();
  }, { passive: false });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
