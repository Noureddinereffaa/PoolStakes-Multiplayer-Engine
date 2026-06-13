import { getAudioContext, setupAudioOnInteraction } from './mobile';

setupAudioOnInteraction();

class SoundSynth {
  private _muted = false;
  private _volume = 0.6;

  get muted() { return this._muted; }
  set muted(v: boolean) { this._muted = v; }
  get volume() { return this._volume; }
  set volume(v: number) { this._volume = Math.max(0, Math.min(1, v)); }
  toggle() { this._muted = !this._muted; return this._muted; }

  private initCtx(): AudioContext | null {
    const ctx = getAudioContext();
    if (ctx?.state === 'suspended') ctx.resume();
    return ctx;
  }

  public playCueHit(powerPercent: number) {
    if (this._muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const vol = Math.min(1, Math.max(0.1, powerPercent / 100)) * this._volume;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.15);

    const snap = ctx.createOscillator();
    const snapGain = ctx.createGain();
    snap.type = 'sine';
    snap.frequency.setValueAtTime(1800, now);
    snap.frequency.exponentialRampToValueAtTime(250, now + 0.025);

    const noise = ctx.createOscillator();
    const noiseGain = ctx.createGain();
    noise.type = 'sawtooth';
    noise.frequency.setValueAtTime(3200, now);
    noise.frequency.exponentialRampToValueAtTime(400, now + 0.01);

    gain.gain.setValueAtTime(0.45 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    snapGain.gain.setValueAtTime(0.7 * vol, now);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    noiseGain.gain.setValueAtTime(0.15 * vol, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.008);

    osc.connect(gain).connect(ctx.destination);
    snap.connect(snapGain).connect(ctx.destination);
    noise.connect(noiseGain).connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.2);
    snap.start(now); snap.stop(now + 0.035);
    noise.start(now); noise.stop(now + 0.01);
  }

  public playBreakShot(powerPercent: number) {
    if (this._muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const vol = Math.min(1, Math.max(0.15, powerPercent / 100)) * this._volume;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.35);
    gain.gain.setValueAtTime(0.5 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    const crack = ctx.createOscillator();
    const crackGain = ctx.createGain();
    crack.type = 'triangle';
    crack.frequency.setValueAtTime(2400, now);
    crack.frequency.exponentialRampToValueAtTime(800, now + 0.03);
    crackGain.gain.setValueAtTime(0.8 * vol, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    const boom = ctx.createOscillator();
    const boomGain = ctx.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(60, now);
    boom.frequency.exponentialRampToValueAtTime(20, now + 0.3);
    boomGain.gain.setValueAtTime(0.35 * vol, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain).connect(ctx.destination);
    crack.connect(crackGain).connect(ctx.destination);
    boom.connect(boomGain).connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.45);
    crack.start(now); crack.stop(now + 0.05);
    boom.start(now); boom.stop(now + 0.4);
  }

  public playBallCollision(speedFactor = 1) {
    if (this._muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const vol = Math.min(0.85, Math.max(0.08, speedFactor)) * this._volume;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2000, now);
    osc.frequency.exponentialRampToValueAtTime(500, now + 0.006);
    gain.gain.setValueAtTime(0.6 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.012);

    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(200, now);
    thud.frequency.exponentialRampToValueAtTime(80, now + 0.02);
    thudGain.gain.setValueAtTime(0.2 * vol, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    osc.connect(gain).connect(ctx.destination);
    thud.connect(thudGain).connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.015);
    thud.start(now); thud.stop(now + 0.03);
  }

  public playCushionHit(speedFactor = 1) {
    if (this._muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const vol = Math.min(0.8, Math.max(0.08, speedFactor * 0.5)) * this._volume;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);
    gain.gain.setValueAtTime(0.45 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    const thud = ctx.createOscillator();
    const thudG = ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(50, now);
    thud.frequency.exponentialRampToValueAtTime(20, now + 0.12);
    thudG.gain.setValueAtTime(0.25 * vol, now);
    thudG.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain).connect(ctx.destination);
    thud.connect(thudG).connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.2);
    thud.start(now); thud.stop(now + 0.15);
  }

  public playPocketIn() {
    if (this._muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(220, now);
    osc1.frequency.exponentialRampToValueAtTime(70, now + 0.2);
    gain1.gain.setValueAtTime(0.35 * this._volume, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    const thud = ctx.createOscillator();
    const thudG = ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(80, now + 0.06);
    thud.frequency.exponentialRampToValueAtTime(25, now + 0.3);
    thudG.gain.setValueAtTime(0, now);
    thudG.gain.setValueAtTime(0.55 * this._volume, now + 0.06);
    thudG.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    const jingle = ctx.createOscillator();
    const jingleG = ctx.createGain();
    jingle.type = 'sine';
    jingle.frequency.setValueAtTime(1400, now + 0.1);
    jingle.frequency.exponentialRampToValueAtTime(600, now + 0.25);
    jingleG.gain.setValueAtTime(0, now);
    jingleG.gain.setValueAtTime(0.12 * this._volume, now + 0.1);
    jingleG.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc1.connect(gain1).connect(ctx.destination);
    thud.connect(thudG).connect(ctx.destination);
    jingle.connect(jingleG).connect(ctx.destination);
    osc1.start(now); osc1.stop(now + 0.25);
    thud.start(now + 0.05); thud.stop(now + 0.35);
    jingle.start(now + 0.08); jingle.stop(now + 0.3);
  }

  public playFoul() {
    if (this._muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(330, now);
    osc1.frequency.setValueAtTime(293.66, now + 0.1);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(440, now);
    osc2.frequency.setValueAtTime(392, now + 0.1);
    gain.gain.setValueAtTime(0.25 * this._volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain); osc2.connect(gain);
    gain.connect(ctx.destination);
    osc1.start(now); osc2.start(now);
    osc1.stop(now + 0.4); osc2.stop(now + 0.4);
  }

  public playCountdown() {
    if (this._muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.12 * this._volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.1);
  }

  public playWin() {
    if (this._muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      gain.gain.setValueAtTime(0, now);
      gain.gain.setValueAtTime(0.18 * this._volume, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.5);
    });
  }

  public playLose() {
    if (this._muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [392.00, 329.63, 261.63, 196.00];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);
      gain.gain.setValueAtTime(0, now);
      gain.gain.setValueAtTime(0.14 * this._volume, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.55);
    });
  }

  public playTurnChange() {
    if (this._muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.06);
    gain.gain.setValueAtTime(0.1 * this._volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.12);
  }
}

export const poolAudio = new SoundSynth();
