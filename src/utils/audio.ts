// Synthesized Realistic Billiard Sound Effects utilizing the web browser's Web Audio API. 
// No external assets required — lightweight, fast, and completely immune to local network asset blocks.

class SoundSynth {
  private ctx: AudioContext | null = null;

  private initCtx() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    // resume suspended context if user just interacted
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Transient high-impact white wood strike on phenolic resin ball
  public playCueHit(powerPercent: number) {
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const vol = Math.min(1, Math.max(0.1, powerPercent / 100));

      // Wood knock sound (Low-mid resonant oscillator + click transient)
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.1);

      // High pitch wood snap click
      const snapOsc = this.ctx.createOscillator();
      const snapGain = this.ctx.createGain();
      snapOsc.type = 'sine';
      snapOsc.frequency.setValueAtTime(1200, now);
      snapOsc.frequency.exponentialRampToValueAtTime(300, now + 0.02);

      gainNode.gain.setValueAtTime(0.4 * vol, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      snapGain.gain.setValueAtTime(0.6 * vol, now);
      snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

      // Routing
      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      snapOsc.connect(snapGain);
      snapGain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.15);

      snapOsc.start(now);
      snapOsc.stop(now + 0.03);
    } catch (e) {
      console.warn('Audio synthesis failed (interacted state check):', e);
    }
  }

  // Sharp bright click of two pool balls colliding
  public playBallCollision(speedFactor = 1) {
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const vol = Math.min(0.8, Math.max(0.1, speedFactor));

      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1600, now);
      // extreme rapid frequency decay for clicking sound
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.008);

      gainNode.gain.setValueAtTime(0.55 * vol, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.015);

      // Add a lower resonant thud for ball inertia match
      const thudOsc = this.ctx.createOscillator();
      const thudGain = this.ctx.createGain();
      thudOsc.type = 'triangle';
      thudOsc.frequency.setValueAtTime(180, now);
      thudOsc.frequency.exponentialRampToValueAtTime(90, now + 0.016);
      thudGain.gain.setValueAtTime(0.18 * vol, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      thudOsc.connect(thudGain);
      thudGain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.02);

      thudOsc.start(now);
      thudOsc.stop(now + 0.025);
    } catch (e) {
      console.warn('Audio synthesis failed:', e);
    }
  }

  // Thick dull thud of a ball bumping into a cloth-bound rubber cushion
  public playCushionHit(speedFactor = 1) {
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const vol = Math.min(0.7, Math.max(0.1, speedFactor * 0.45));

      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(105, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.12);

      gainNode.gain.setValueAtTime(0.42 * vol, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.15);
    } catch (e) {
      console.warn('Audio synthesis failed:', e);
    }
  }

  // Smooth hollow sound of a ball slipping over the rim and dropping into leather pocket
  public playPocketIn() {
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;

      // 1. Sliding/friction sound (low pass noise-like)
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(190, now);
      osc1.frequency.exponentialRampToValueAtTime(80, now + 0.18);

      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

      // 2. Leather pocket thud (hollow echo resonance)
      const thudOsc = this.ctx.createOscillator();
      const thudGain = this.ctx.createGain();
      thudOsc.type = 'sine';
      thudOsc.frequency.setValueAtTime(90, now + 0.08);
      thudOsc.frequency.exponentialRampToValueAtTime(40, now + 0.25);

      thudGain.gain.setValueAtTime(0, now);
      thudGain.gain.setValueAtTime(0.45, now + 0.07);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);

      thudOsc.connect(thudGain);
      thudGain.connect(this.ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.2);

      thudOsc.start(now + 0.06);
      thudOsc.stop(now + 0.3);
    } catch (e) {
      console.warn('Audio synthesis failed:', e);
    }
  }

  // Warning synth bell notifying warning/foul
  public playFoul() {
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;

      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(330, now);
      osc1.frequency.setValueAtTime(293.66, now + 0.1); // decay alert

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(440, now);
      osc2.frequency.setValueAtTime(392, now + 0.1);

      gainNode.gain.setValueAtTime(0.25, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now);

      osc1.stop(now + 0.4);
      osc2.stop(now + 0.4);
    } catch (e) {
      console.warn('Audio synthesis failed:', e);
    }
  }

  // Win triumph jingle/sound
  public playWin() {
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const notes = [261.63, 329.63, 392.00, 523.25]; // C E G C major beautiful chord

      notes.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gainNode = this.ctx!.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.1);
        
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.setValueAtTime(0.18, now + idx * 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.45);

        osc.connect(gainNode);
        gainNode.connect(this.ctx!.destination);

        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 0.5);
      });
    } catch (e) {
      console.warn('Audio synthesis failed:', e);
    }
  }
}

export const poolAudio = new SoundSynth();
