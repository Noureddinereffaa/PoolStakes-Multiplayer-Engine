// Filter only genuine Vite HMR infrastructure noise in sandboxed environments.
// Uses strict pattern matching to avoid swallowing real application errors.
if (typeof window !== 'undefined') {
  const isHmrNoise = (val: unknown): boolean => {
    if (!val) return false;
    const s = String(val).toLowerCase();
    // Only suppress Vite-internal HMR connection errors, not app WS errors
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
import './index.css';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
    // If a new SW is waiting, notify user to update
    if (reg.waiting) {
      reg.waiting.postMessage('SKIP_WAITING');
    }
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
