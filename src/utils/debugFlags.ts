export const DEBUG_FLAGS: Record<string, boolean> = {
  pipeline: false,
  mode: false,
  replay: false,
  fx: false,
  camera: false,
  memory: false,
};

export function setDebugFlag(name: string, value: boolean): void {
  if (name in DEBUG_FLAGS) DEBUG_FLAGS[name] = value;
}

if (typeof window !== 'undefined') {
  (window as any).__DEBUG = { flags: DEBUG_FLAGS, setDebugFlag };
}
