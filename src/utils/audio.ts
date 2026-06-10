import { getAudioContext, setupAudioOnInteraction } from './mobile';

setupAudioOnInteraction();

class SoundSynth {
  private _muted = false;
  private _volume = 0.6;

  get muted() { return this._muted; }
  set muted(v: boolean) { this._muted = v; }
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
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.1);

    const snap = ctx.createOscillator();
    const snapGain = ctx.createGain();
    snap.type = 'sine';
    snap.frequency.setValueAtTime(1200, now);
    snap.frequency.exponentialRampToValueAtTime(300, now + 0.02);

    gain.gain.setValueAtTime(0.4 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    snapGain.gain.setValueAtTime(0.6 * vol, now);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    osc.connect(gain).connect(ctx.destination);
    snap.connect(snapGain).connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.15);
    snap.start(now); snap.stop(now + 0.03);
  }

  public playBallCollision(speedFactor = 1) {
    if (this._muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const vol = Math.min(0.8, Math.max(0.1, speedFactor)) * this._volume;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1600, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.008);
    gain.gain.setValueAtTime(0.55 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);

    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(180, now);
    thud.frequency.exponentialRampToValueAtTime(90, now + 0.016);
    thudGain.gain.setValueAtTime(0.18 * vol, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

    osc.connect(gain).connect(ctx.destination);
    thud.connect(thudGain).connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.02);
    thud.start(now); thud.stop(now + 0.025);
  }

  public playCushionHit(speedFactor = 1) {
    if (this._muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const vol = Math.min(0.7, Math.max(0.1, speedFactor * 0.45)) * this._volume;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(105, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.12);
    gain.gain.setValueAtTime(0.42 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.15);
  }

  public playPocketIn() {
    if (this._muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const s = 1.0;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(190 * s, now);
    osc1.frequency.exponentialRampToValueAtTime(80 * s, now + 0.18);
    gain1.gain.setValueAtTime(0.3 * this._volume, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

    const thud = ctx.createOscillator();
    const thudG = ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(90 * s, now + 0.08);
    thud.frequency.exponentialRampToValueAtTime(40 * s, now + 0.25);
    thudG.gain.setValueAtTime(0, now);
    thudG.gain.setValueAtTime(0.45 * this._volume, now + 0.07);
    thudG.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc1.connect(gain1).connect(ctx.destination);
    thud.connect(thudG).connect(ctx.destination);
    osc1.start(now); osc1.stop(now + 0.2);
    thud.start(now + 0.06); thud.stop(now + 0.3);
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
}

export const poolAudio = new SoundSynth();
