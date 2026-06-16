/// <reference types="vite/client" />

interface Window {
  /** Global engine bootstrap guard — prevents double initialization. */
  __ENGINE_BOOTSTRAPPED__?: boolean;
}
