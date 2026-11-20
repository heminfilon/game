// Web Audio API procedural sound engine - zero external sound files required!
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.wheelGain = null;
    this.wheelOsc = null;
    this.kilnGain = null;
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();
    this.setupContinuousSounds();
  }

  ensureContext() {
    if (!this.ctx) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setupContinuousSounds() {
    if (!this.ctx) return;

    try {
      this.wheelOsc = this.ctx.createOscillator();
      this.wheelOsc.type = 'triangle';
      this.wheelOsc.frequency.setValueAtTime(65, this.ctx.currentTime);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(120, this.ctx.currentTime);

      this.wheelGain = this.ctx.createGain();
      this.wheelGain.gain.setValueAtTime(0, this.ctx.currentTime);

      this.wheelOsc.connect(filter);
      filter.connect(this.wheelGain);
      this.wheelGain.connect(this.ctx.destination);
      this.wheelOsc.start();
    } catch (e) {
      console.warn("Audio init warning:", e);
    }
  }

  setWheelSound(active, speed = 1.0) {
    if (!this.ctx || !this.enabled || !this.wheelGain) return;
    const target = active ? 0.08 : 0;
    this.wheelGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
    if (this.wheelOsc) {
      this.wheelOsc.frequency.setTargetAtTime(55 * speed, this.ctx.currentTime, 0.1);
    }
  }

  // Squish / molding sound when dragging clay
  playClayTouch(intensity = 0.5) {
    if (!this.ctx || !this.enabled) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(140 + Math.random() * 40, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.15);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, now);

      gain.gain.setValueAtTime(0.04 * intensity, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.16);
    } catch (e) {}
  }

  // Brush paint stroke sound
  playBrushStroke() {
    if (!this.ctx || !this.enabled) return;
    try {
      const now = this.ctx.currentTime;
      const bufferSize = this.ctx.sampleRate * 0.1;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.4));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1600;
      filter.Q.value = 2.5;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start(now);
    } catch (e) {}
  }

  // Kiln furnace fire hum & crackle
  startKilnSound() {
    if (!this.ctx || !this.enabled) return;
    try {
      this.stopKilnSound();
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      this.kilnNoise = this.ctx.createBufferSource();
      this.kilnNoise.buffer = buffer;
      this.kilnNoise.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 450;

      this.kilnGain = this.ctx.createGain();
      this.kilnGain.gain.setValueAtTime(0.01, this.ctx.currentTime);
      this.kilnGain.gain.exponentialRampToValueAtTime(0.12, this.ctx.currentTime + 1.5);

      this.kilnNoise.connect(filter);
      filter.connect(this.kilnGain);
      this.kilnGain.connect(this.ctx.destination);

      this.kilnNoise.start();
    } catch (e) {}
  }

  stopKilnSound() {
    if (this.kilnGain && this.ctx) {
      try {
        this.kilnGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
        setTimeout(() => {
          if (this.kilnNoise) {
            this.kilnNoise.stop();
            this.kilnNoise.disconnect();
            this.kilnNoise = null;
          }
        }, 500);
      } catch (e) {}
    }
  }

  // Firing complete chime
  playCeramicPing() {
    if (!this.ctx || !this.enabled) return;
    try {
      const now = this.ctx.currentTime;
      const freqs = [880, 1320, 1760];
      freqs.forEach((f, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + idx * 0.08);

        gain.gain.setValueAtTime(0.08 / (idx + 1), now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 1.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 1.3);
      });
    } catch (e) {}
  }

  // Ceramic Shatter / Crash Sound when pot breaks
  playShatterSound() {
    if (!this.ctx || !this.enabled) return;
    try {
      const now = this.ctx.currentTime;
      // White noise explosion + descending high-frequency shards
      const bufferSize = this.ctx.sampleRate * 0.5;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1800, now);
      filter.frequency.exponentialRampToValueAtTime(300, now + 0.4);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start(now);

      // Metallic/ceramic dissonant clinks
      [1200, 950, 720, 480].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq + Math.random() * 100, now + idx * 0.04);
        osc.frequency.exponentialRampToValueAtTime(120, now + idx * 0.04 + 0.25);

        g.gain.setValueAtTime(0.18, now + idx * 0.04);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.25);

        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.26);
      });
    } catch (e) {}
  }

  // Unlock / Purchase celebration chime
  playUnlockSound() {
    if (!this.ctx || !this.enabled) return;
    try {
      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);

        gain.gain.setValueAtTime(0.1, now + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.4);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.42);
      });
    } catch (e) {}
  }

  // Coins collected chime
  playCoinsSound() {
    if (!this.ctx || !this.enabled) return;
    try {
      const now = this.ctx.currentTime;
      const notes = [987.77, 1318.51, 1567.98, 1975.53];
      notes.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.06);

        gain.gain.setValueAtTime(0.12, now + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.4);
      });
    } catch (e) {}
  }

  // Bargain deal gavel sound
  playGavelSound() {
    if (!this.ctx || !this.enabled) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.16);
    } catch (e) {}
  }

  // UI click
  playClick() {
    if (!this.ctx || !this.enabled) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    } catch (e) {}
  }

  toggleMute() {
    this.enabled = !this.enabled;
    if (!this.enabled && this.wheelGain) {
      this.wheelGain.gain.setValueAtTime(0, this.ctx ? this.ctx.currentTime : 0);
    }
    return this.enabled;
  }
}

export const sound = new SoundEngine();
