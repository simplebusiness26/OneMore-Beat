(() => {
  'use strict';

  const scoreEl = document.getElementById('score');
  const streakEl = document.getElementById('streak');
  const canvas = document.getElementById('game');
  const muteButton = document.getElementById('mute');
  const deathEl = document.getElementById('death');

  if (!scoreEl || !streakEl || !canvas) return;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const SETTINGS_KEY = 'one-more-beat-settings-v1';

  class BeatMusic {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicBus = null;
      this.fxBus = null;
      this.compressor = null;
      this.noise = null;
      this.lastBeatWall = 0;
      this.beatSeconds = 60 / 108;
      this.step = 0;
      this.lastScore = 0;
      this.lastMilestone = 0;
      this.pressStarted = 0;
      this.running = false;
      this.muted = false;
      this.syncMuted();
    }

    syncMuted() {
      try {
        this.muted = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').muted === true;
      } catch (_) {
        this.muted = false;
      }
      if (this.master && this.ctx) {
        this.master.gain.cancelScheduledValues(this.ctx.currentTime);
        this.master.gain.setTargetAtTime(this.muted ? 0.0001 : 0.72, this.ctx.currentTime, 0.025);
      }
    }

    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return true;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;

      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.fxBus = this.ctx.createGain();
      this.compressor = this.ctx.createDynamicsCompressor();

      this.master.gain.value = this.muted ? 0.0001 : 0.72;
      this.musicBus.gain.value = 0.0001;
      this.fxBus.gain.value = 0.72;
      this.compressor.threshold.value = -18;
      this.compressor.knee.value = 16;
      this.compressor.ratio.value = 5;
      this.compressor.attack.value = 0.004;
      this.compressor.release.value = 0.16;

      this.musicBus.connect(this.master);
      this.fxBus.connect(this.master);
      this.master.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);

      const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.4), this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;
      return true;
    }

    startRun() {
      if (!this.ensure()) return;
      const t = this.ctx.currentTime;
      this.running = true;
      this.step = 0;
      this.lastScore = 0;
      this.lastMilestone = 0;
      this.lastBeatWall = performance.now();
      this.beatSeconds = 60 / 108;
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.setValueAtTime(0.0001, t);
      this.musicBus.gain.exponentialRampToValueAtTime(0.92, t + 0.18);
      this.impact(0.02, 0.65);
      this.filteredTone(73.42, 0.34, 0.035, 'sine', 0.02, 420, this.fxBus);
    }

    stopRun() {
      if (!this.ctx || !this.musicBus) return;
      const t = this.ctx.currentTime;
      this.running = false;
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.setTargetAtTime(0.0001, t, 0.035);
    }

    tone(freq, duration, gain, type = 'sine', when = 0, bus = this.musicBus, endFreq = null) {
      if (!this.ctx || this.muted || !bus) return;
      const t = this.ctx.currentTime + Math.max(0, when);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(Math.max(20, freq), t);
      if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      o.connect(g);
      g.connect(bus);
      o.start(t);
      o.stop(t + duration + 0.03);
    }

    filteredTone(freq, duration, gain, type = 'sawtooth', when = 0, cutoff = 900, bus = this.musicBus, endFreq = null) {
      if (!this.ctx || this.muted || !bus) return;
      const t = this.ctx.currentTime + Math.max(0, when);
      const o = this.ctx.createOscillator();
      const f = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(Math.max(20, freq), t);
      if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
      f.type = 'lowpass';
      f.frequency.setValueAtTime(Math.max(120, cutoff), t);
      f.Q.value = 1.6;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      o.connect(f);
      f.connect(g);
      g.connect(bus);
      o.start(t);
      o.stop(t + duration + 0.03);
    }

    noiseHit(duration, gain, cutoff = 7000, when = 0, highpass = true) {
      if (!this.ctx || !this.noise || this.muted) return;
      const t = this.ctx.currentTime + Math.max(0, when);
      const src = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      src.buffer = this.noise;
      filter.type = highpass ? 'highpass' : 'bandpass';
      filter.frequency.value = cutoff;
      if (!highpass) filter.Q.value = 0.8;
      g.gain.setValueAtTime(Math.max(0.0002, gain), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      src.connect(filter);
      filter.connect(g);
      g.connect(this.musicBus);
      src.start(t);
      src.stop(t + duration + 0.02);
    }

    kick(when = 0, gain = 0.21) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime + when;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
      o.connect(g);
      g.connect(this.musicBus);
      o.start(t);
      o.stop(t + 0.19);
    }

    snare(when = 0, gain = 0.075) {
      this.noiseHit(0.11, gain, 1500, when, false);
      this.tone(185, 0.075, gain * 0.55, 'triangle', when, this.musicBus, 125);
    }

    hat(when = 0, gain = 0.026, open = false) {
      this.noiseHit(open ? 0.12 : 0.045, gain, 6500, when, true);
    }

    bass(freq, when, duration, gain, intensity) {
      this.filteredTone(freq, duration, gain, 'sawtooth', when, 420 + intensity * 1150, this.musicBus);
      this.tone(freq / 2, duration * 0.9, gain * 0.55, 'sine', when, this.musicBus);
    }

    arp(freq, when, intensity, accent = 1) {
      this.filteredTone(freq, Math.min(0.16, this.beatSeconds * 0.32), 0.022 * accent + intensity * 0.013, 'square', when, 1450 + intensity * 2600, this.musicBus);
    }

    impact(when = 0, gain = 1) {
      if (!this.ctx || this.muted) return;
      this.kick(when, 0.24 * gain);
      this.noiseHit(0.16, 0.075 * gain, 900, when, false);
      this.filteredTone(110, 0.28, 0.055 * gain, 'sawtooth', when, 650, this.fxBus, 48);
    }

    milestone(score) {
      const points = [10, 25, 50, 100, 250];
      const reached = points.filter(p => score >= p).pop() || 0;
      if (!reached || reached <= this.lastMilestone) return;
      this.lastMilestone = reached;
      const beat = this.beatSeconds;
      this.impact(0, 0.95);
      [293.66, 349.23, 440, 587.33].forEach((f, i) => {
        this.filteredTone(f, Math.min(0.2, beat * 0.38), 0.035, 'sawtooth', i * beat * 0.16, 2800, this.fxBus);
      });
    }

    readBpm() {
      const match = streakEl.textContent.match(/(\d+)\s*BPM/i);
      return match ? Number(match[1]) : null;
    }

    beat(score) {
      if (!this.ensure()) return;
      if (!this.running && score === 0) this.startRun();
      if (!this.running) return;

      const wallNow = performance.now();
      if (this.lastBeatWall) {
        const measured = (wallNow - this.lastBeatWall) / 1000;
        if (measured > 0.22 && measured < 0.9) this.beatSeconds = this.beatSeconds * 0.68 + measured * 0.32;
      }
      this.lastBeatWall = wallNow;

      const bpm = this.readBpm();
      if (bpm) this.beatSeconds = this.beatSeconds * 0.7 + (60 / bpm) * 0.3;

      const beat = clamp(this.beatSeconds, 0.27, 0.62);
      const intensity = clamp(score / 170, 0, 1);
      const danger = streakEl.textContent.includes('×2');
      const step = this.step++;
      const bar = step % 8;

      this.kick(0, 0.17 + intensity * 0.065 + (danger ? 0.025 : 0));

      if (score >= 10) {
        const roots = [36.71, 36.71, 43.65, 32.70, 36.71, 49.00, 43.65, 32.70];
        const root = roots[bar];
        this.bass(root, 0.018, beat * 0.68, 0.038 + intensity * 0.022, intensity);
      }

      if (score >= 18 && step % 4 === 1) this.snare(0.01, 0.055 + intensity * 0.025);
      if (score >= 18 && step % 4 === 3) this.snare(0.01, 0.065 + intensity * 0.028);

      if (score >= 25) {
        this.hat(beat * 0.5, 0.020 + intensity * 0.010);
        if (step % 4 === 3) this.hat(0, 0.018 + intensity * 0.009, true);
      }

      if (score >= 50) {
        const arpNotes = [293.66, 349.23, 440.00, 523.25, 440.00, 349.23, 293.66, 261.63];
        this.arp(arpNotes[bar], beat * 0.06, intensity, 1.05);
        this.arp(arpNotes[(bar + 2) % arpNotes.length], beat * 0.56, intensity, 0.78);
      }

      if (score >= 80) {
        this.hat(beat * 0.25, 0.017 + intensity * 0.009);
        this.hat(beat * 0.75, 0.019 + intensity * 0.010);
      }

      if (score >= 100) {
        const lead = [587.33, 523.25, 440.00, 698.46, 587.33, 783.99, 698.46, 523.25];
        if (step % 2 === 0) this.filteredTone(lead[bar], beat * 0.42, 0.026 + intensity * 0.018, 'sawtooth', beat * 0.08, 2400 + intensity * 3000, this.musicBus);
        this.kick(beat * 0.5, 0.075 + intensity * 0.045);
      }

      if (score >= 160) {
        const high = [880, 1046.5, 1174.66, 1396.91];
        this.arp(high[step % high.length], beat * 0.32, intensity, 0.55);
        this.arp(high[(step + 1) % high.length], beat * 0.82, intensity, 0.48);
      }

      if (score >= 250) {
        this.hat(beat * 0.125, 0.016, false);
        this.hat(beat * 0.375, 0.016, false);
        this.hat(beat * 0.625, 0.017, false);
        this.hat(beat * 0.875, 0.019, false);
        this.filteredTone(146.83, beat * 0.18, 0.026, 'square', beat * 0.72, 1800 + intensity * 2600, this.musicBus);
      }

      if (danger) {
        this.kick(beat * 0.25, 0.058 + intensity * 0.035);
        this.kick(beat * 0.75, 0.068 + intensity * 0.038);
        this.hat(beat * 0.125, 0.02);
        this.hat(beat * 0.625, 0.023);
        const rave = [440, 523.25, 587.33, 698.46];
        this.filteredTone(rave[step % rave.length], beat * 0.22, 0.027, 'square', beat * 0.36, 3600, this.musicBus);
      }

      this.milestone(score);
      this.lastScore = score;
    }

    inputDown() {
      if (!this.ensure() || !this.running || this.muted) return;
      this.pressStarted = performance.now();
      const intensity = clamp(this.lastScore / 180, 0, 1);
      this.filteredTone(660, 0.045, 0.018 + intensity * 0.008, 'square', 0, 3200, this.fxBus);
    }

    inputUp() {
      if (!this.ctx || !this.running || this.muted || !this.pressStarted) return;
      const held = performance.now() - this.pressStarted;
      this.pressStarted = 0;
      if (held > 120) {
        this.filteredTone(120, 0.11, 0.026, 'sawtooth', 0, 900, this.fxBus, 62);
      }
    }
  }

  const music = new BeatMusic();

  let previousScore = Number(scoreEl.textContent) || 0;
  const scoreObserver = new MutationObserver(() => {
    const score = Number(scoreEl.textContent) || 0;
    if (score !== previousScore) music.beat(score);
    previousScore = score;
  });
  scoreObserver.observe(scoreEl, { childList: true, characterData: true, subtree: true });

  const deathObserver = new MutationObserver(() => {
    if (deathEl && deathEl.classList.contains('visible')) music.stopRun();
  });
  if (deathEl) deathObserver.observe(deathEl, { attributes: true, attributeFilter: ['class'] });

  canvas.addEventListener('pointerdown', () => music.inputDown(), { passive: true });
  canvas.addEventListener('pointerup', () => music.inputUp(), { passive: true });
  canvas.addEventListener('pointercancel', () => music.inputUp(), { passive: true });

  document.getElementById('start-button')?.addEventListener('click', () => {
    music.ensure();
    setTimeout(() => music.startRun(), 0);
  });
  document.getElementById('retry-button')?.addEventListener('click', () => {
    music.ensure();
    setTimeout(() => music.startRun(), 0);
  });

  muteButton?.addEventListener('click', () => setTimeout(() => music.syncMuted(), 0));
  window.addEventListener('storage', () => music.syncMuted());
})();
