import { DEBUG_FLAGS } from './debugFlags';

const LOG_ENABLED: Record<string, boolean> = {};

for (const key of Object.keys(DEBUG_FLAGS)) {
  Object.defineProperty(LOG_ENABLED, key, { get: () => DEBUG_FLAGS[key] });
}

export function debugLog(flag: string, ...args: unknown[]): void {
  if (DEBUG_FLAGS[flag]) {
    console.log(`[${flag}]`, ...args);
  }
}
