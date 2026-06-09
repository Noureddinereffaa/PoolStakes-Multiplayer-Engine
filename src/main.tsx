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
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
