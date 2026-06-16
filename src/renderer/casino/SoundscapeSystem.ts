export interface AudioIntensityInput {
  shotPower: number;
  collisionCount: number;
  crowdDensity: number;
}

export interface SoundscapeSystem {
  setMuted(muted: boolean): void;
  updateIntensity(input: AudioIntensityInput): void;
  playAppealBurst(intensity: number): void;
  playGaspWave(intensity: number): void;
  playWhisperCluster(): void;
  update(dt: number): void;
  dispose(): void;
}

function getCtx(): AudioContext | null {
  const ctx = (window as any).__audioCtx as AudioContext | undefined;
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx ?? null;
}

function noiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * duration);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buf;
}

export function createSoundscapeSystem(): SoundscapeSystem {
  let muted = false;
  let currentIntensity = 0;
  let targetIntensity = 0;

  let ambienceNode: AudioBufferSourceNode | null = null;
  let ambienceGain: GainNode | null = null;
  let musicGain: GainNode | null = null;
  let reverbNode: ConvolverNode | null = null;
  let reverbGain: GainNode | null = null;

  function initAmbience(): void {
    const ctx = getCtx();
    if (!ctx || ambienceNode) return;

    const buf = noiseBuffer(ctx, 4);
    ambienceNode = ctx.createBufferSource();
    ambienceNode.buffer = buf;
    ambienceNode.loop = true;

    ambienceGain = ctx.createGain();
    ambienceGain.gain.value = 0;

    const lpFilter = ctx.createBiquadFilter();
    lpFilter.type = 'lowpass';
    lpFilter.frequency.value = 400;

    ambienceNode.connect(lpFilter).connect(ambienceGain).connect(ctx.destination);
    ambienceNode.start();
  }

  function initReverb(): void {
    const ctx = getCtx();
    if (!ctx || reverbNode) return;

    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 1.5);
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.3));
      }
    }
    reverbNode = ctx.createConvolver();
    reverbNode.buffer = buf;

    reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.2;
  }

  function playNoiseBurst(duration: number, volume: number, freq: number): void {
    if (muted) return;
    const ctx = getCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const buf = noiseBuffer(ctx, duration);
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 0.8;

    src.connect(bp).connect(gain).connect(ctx.destination);
    src.start(now);
    src.stop(now + duration + 0.05);
  }

  function playToneBurst(freq: number, duration: number, volume: number): void {
    if (muted) return;
    const ctx = getCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  initAmbience();
  initReverb();

  return {
    setMuted: (m: boolean) => {
      muted = m;
    },

    updateIntensity: (input: AudioIntensityInput) => {
      const raw = input.shotPower * 0.5 + input.collisionCount * 0.3 + input.crowdDensity * 0.2;
      targetIntensity = Math.min(1, Math.max(0, raw));
    },

    playAppealBurst: (intensity: number) => {
      if (muted) return;
      const vol = Math.min(0.5, intensity * 0.4);
      playNoiseBurst(0.8 + intensity * 0.6, vol, 1200);
      playToneBurst(800 + intensity * 400, 0.4, vol * 0.3);
    },

    playGaspWave: (intensity: number) => {
      if (muted) return;
      const vol = Math.min(0.35, intensity * 0.3);
      playNoiseBurst(0.5, vol, 2000);
      playToneBurst(600, 0.3, vol * 0.2);
    },

    playWhisperCluster: () => {
      if (muted) return;
      playNoiseBurst(0.3, 0.08, 1500);
    },

    update: (dt: number) => {
      currentIntensity += (targetIntensity - currentIntensity) * Math.min(1, dt * 3);
      if (ambienceGain && !muted) {
        ambienceGain.gain.value = 0.03 + currentIntensity * 0.06;
      } else if (ambienceGain) {
        ambienceGain.gain.value = 0;
      }
    },

    dispose: () => {
      if (ambienceNode) {
        ambienceNode.stop();
        ambienceNode.disconnect();
        ambienceNode = null;
      }
      ambienceGain = null;
      musicGain = null;
      reverbNode = null;
      reverbGain = null;
    },
  };
}
