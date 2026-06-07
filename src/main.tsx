// Gracefully suppress benign Vite HMR / WebSocket connection errors in sandboxed preview environments
if (typeof window !== 'undefined') {
  const suppressPatterns = ['websocket', 'hmr', 'vite', 'ws://', 'wss://', 'failed to connect', 'closed without opened'];

  const shouldSuppress = (val: any): boolean => {
    if (!val) return false;
    const str = String(val).toLowerCase();
    return suppressPatterns.some(p => str.includes(p));
  };

  window.addEventListener('unhandledrejection', (event) => {
    if (shouldSuppress(event.reason) || (event.reason && shouldSuppress(event.reason.message))) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });

  window.addEventListener('error', (event) => {
    if (shouldSuppress(event.message) || shouldSuppress(event.filename)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  // Suppress from console logging to maintain a completely clean workspace
  const originalError = console.error;
  console.error = function (...args: any[]) {
    if (args.some(arg => shouldSuppress(arg) || (arg && shouldSuppress(arg.message)))) {
      return;
    }
    originalError.apply(console, args);
  };

  const originalWarn = console.warn;
  console.warn = function (...args: any[]) {
    if (args.some(arg => shouldSuppress(arg) || (arg && shouldSuppress(arg.message)))) {
      return;
    }
    originalWarn.apply(console, args);
  };
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

