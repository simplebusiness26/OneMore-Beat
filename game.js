(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const ui = {
    score: $('score'), best: $('best'), streak: $('streak'), start: $('start'), death: $('death'),
    startBest: $('start-best'), deathScore: $('death-score'), deathBest: $('death-best'), deathRank: $('death-rank'),
    choice: $('choice'), toast: $('toast'), mute: $('mute'), startButton: $('start-button'), retryButton: $('retry-button'),
    dots: [...document.querySelectorAll('.beat-dots i')]
  };

  const STORAGE_KEY = 'one-more-beat-best-v1';
  const SETTINGS_KEY = 'one-more-beat-settings-v1';
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);

  let W = 0, H = 0, DPR = 1;
  let best = Number(localStorage.getItem(STORAGE_KEY) || 0);
  let muted = false;
  try { muted = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').muted === true; } catch (_) {}

  const state = {
    mode: 'start', score: 0, lane: 0, laneVisual: 0, held: false, holdStart: 0, pressStart: 0,
    bpm: 108, beatMs: 60000 / 108, beatIndex: 0, beatPhase: 0, nextBeatAt: 0, lastBeatAt: 0,
    flash: 0, shake: 0, danger: 0, multiplier: 1, doubleMode: false, doubleUntil: 0,
    choiceActive: false, choiceStart: 0, choiceHold: 0, choiceResolved: false,
    perfects: 0, lastActionBeat: -99, lastActionType: 'none', actionError: 999,
    obstacle: null, nextObstacle: null, particles: [], trails: [], stars: [],
    messageTimer: 0, overdrive: false, runStartedAt: 0, graceBeats: 4
  };

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.noise = null;
    }
    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = muted ? 0 : 0.36;
      this.master.connect(this.ctx.destination);
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * .25, this.ctx.sampleRate);
      const d = buffer.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buffer;
    }
    setMuted(value) {
      muted = value;
      if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : .36, this.ctx.currentTime, .02);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ muted }));
      ui.mute.textContent = muted ? '×' : '♪';
    }
    tone(freq, duration, gain = .12, type = 'sine', when = 0, endFreq = null) {
      if (!this.ctx || muted) return;
      const t = this.ctx.currentTime + when;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + .008);
      g.gain.exponentialRampToValueAtTime(.0001, t + duration);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + duration + .02);
    }
    hit() {
      this.ensure();
      if (!this.ctx || muted) return;
      this.tone(118, .14, .22, 'sine', 0, 42);
      this.tone(52, .11, .10, 'triangle', 0, 34);
    }
    tick(step, score) {
      this.ensure();
      this.hit();
      if (!this.ctx || muted) return;
      const scale = [55, 65.41, 73.42, 82.41, 98, 110];
      if (score >= 25 && step % 2 === 0) this.tone(scale[(step / 2) % scale.length | 0], .18, .065, 'triangle', .015);
      if (score >= 50) {
        this.hat(.045, .03);
        if (step % 2 === 0) this.hat(.035, state.beatMs / 2000);
      }
      if (score >= 100 && step % 4 === 0) {
        const note = [220, 293.66, 329.63, 440][(step / 4) % 4 | 0];
        this.tone(note, Math.min(.34, state.beatMs / 1000 * .75), .045, 'sawtooth', .025);
      }
      if (state.doubleMode) this.tone(880, .055, .025, 'square', .04);
    }
    hat(gain = .03, when = 0) {
      if (!this.ctx || !this.noise || muted) return;
      const t = this.ctx.currentTime + when;
      const s = this.ctx.createBufferSource();
      const f = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      s.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 6000;
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + .045);
      s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + .055);
    }
    success(perfect) {
      this.ensure();
      this.tone(perfect ? 740 : 620, .07, .05, 'triangle');
    }
    fail() {
      this.ensure();
      this.tone(120, .35, .17, 'sawtooth', 0, 34);
    }
    double() {
      this.ensure();
      [220, 330, 440, 660].forEach((f, i) => this.tone(f, .16, .045, 'square', i * .045));
    }
  }
  const audio = new AudioEngine();

  function resize() {
    DPR = clamp(window.devicePixelRatio || 1, 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    seedStars();
  }

  function seedStars() {
    const count = Math.floor((W * H) / 10000);
    state.stars = Array.from({ length: count }, () => ({ x: Math.random() * W, y: Math.random() * H, z: rand(.3, 1), a: rand(.08, .45) }));
  }

  function laneY(lane) {
    const center = H * .54;
    const gap = clamp(H * .17, 80, 135);
    return center + lane * gap * .5;
  }

  function playerX() { return clamp(W * .2, 72, 160); }
  function timingX() { return playerX() + 16; }

  function resetRun(now) {
    state.mode = 'playing'; state.score = 0; state.lane = 0; state.laneVisual = 0;
    state.held = false; state.bpm = 108; state.beatMs = 60000 / state.bpm;
    state.beatIndex = 0; state.lastBeatAt = now; state.nextBeatAt = now + state.beatMs;
    state.flash = 0; state.shake = 0; state.danger = 0; state.multiplier = 1; state.doubleMode = false;
    state.doubleUntil = 0; state.choiceActive = false; state.choiceResolved = false; state.perfects = 0;
    state.lastActionBeat = -99; state.lastActionType = 'none'; state.actionError = 999;
    state.obstacle = generateObstacle(1); state.nextObstacle = generateObstacle(2); state.particles = []; state.trails = [];
    state.overdrive = false; state.runStartedAt = now; state.graceBeats = 4;
    ui.start.classList.remove('visible'); ui.death.classList.remove('visible'); ui.choice.classList.remove('visible');
    updateUI(); toast('LOCK IN');
    audio.ensure(); audio.tick(0, 0);
    navigator.vibrate?.(18);
  }

  function difficulty() {
    return clamp(state.score / 400 + (state.doubleMode ? .2 : 0), 0, 1);
  }

  function generateObstacle(beatOffset = 1) {
    const d = difficulty();
    if (state.score < state.graceBeats) return { type: 'none', lane: 0, beat: state.beatIndex + beatOffset };
    const density = lerp(.48, .76, d) + (state.doubleMode ? .08 : 0);
    if (Math.random() > density) return { type: 'none', lane: 0, beat: state.beatIndex + beatOffset };
    const roll = Math.random();
    const chargeChance = lerp(.18, .30, d);
    const restChance = lerp(.10, .18, d);
    if (roll < chargeChance) return { type: 'charge', lane: 0, beat: state.beatIndex + beatOffset };
    if (roll < chargeChance + restChance) return { type: 'rest', lane: 0, beat: state.beatIndex + beatOffset };
    return { type: 'switch', lane: 0, beat: state.beatIndex + beatOffset };
  }

  function timingError(now) {
    const toPrev = Math.abs(now - state.lastBeatAt);
    const toNext = Math.abs(state.nextBeatAt - now);
    return Math.min(toPrev, toNext);
  }

  function actionBeat(now) {
    return Math.abs(now - state.lastBeatAt) < Math.abs(state.nextBeatAt - now) ? state.beatIndex : state.beatIndex + 1;
  }

  function handleTap(now) {
    if (state.mode !== 'playing') return;
    if (state.choiceActive) return;
    const beat = actionBeat(now);
    state.lane = state.lane === 0 ? 1 : 0;
    state.lastActionBeat = beat; state.lastActionType = 'tap'; state.actionError = timingError(now);
    state.flash = Math.max(state.flash, .16);
    burst(playerX(), laneY(state.lane === 0 ? -1 : 1), '#49f8ff', 8, 1.8);
    navigator.vibrate?.(8);
  }

  function setHold(active, now) {
    if (state.mode !== 'playing') return;
    state.held = active;
    if (active) state.holdStart = now;
    else if (state.choiceActive && !state.choiceResolved) {
      const heldFor = now - state.choiceHold;
      if (heldFor >= Math.min(420, state.beatMs * .72)) acceptDouble();
    }
  }

  function resolveBeat(now) {
    state.lastBeatAt = now;
    state.beatIndex += 1;
    state.score += state.multiplier;
    state.flash = Math.max(state.flash, state.doubleMode ? .22 : .13);
    state.shake = Math.max(state.shake, state.doubleMode ? 2.4 : 1.1);

    const newBpm = Math.min(220, 108 + state.score * .23 + (state.doubleMode ? 18 : 0));
    state.bpm = lerp(state.bpm, newBpm, .12);
    state.beatMs = 60000 / state.bpm;
    state.nextBeatAt = now + state.beatMs;

    audio.tick(state.beatIndex, state.score);
    ui.dots.forEach((dot, i) => dot.classList.toggle('active', i === state.beatIndex % 4));
    setTimeout(() => ui.dots.forEach(dot => dot.classList.remove('active')), 85);

    if (state.doubleMode && state.beatIndex >= state.doubleUntil) {
      state.doubleMode = false; state.multiplier = 1; toast('SURVIVED ×2');
    }

    if (!state.overdrive && state.score >= 100) {
      state.overdrive = true; toast('OVERDRIVE'); state.shake = 8; navigator.vibrate?.([30, 30, 60]);
    } else if ([10, 25, 50, 250, 500].includes(state.score)) {
      const labels = {10:'CHAIN ×10',25:'BASS ONLINE',50:'RHYTHM LAYER',250:'REDLINE',500:'UNREAL'};
      toast(labels[state.score]);
    }

    if (!state.choiceActive && state.score >= 48 && state.score % 64 < state.multiplier) startChoice(now);

    resolveObstacle();
    if (state.mode !== 'playing') return;
    state.obstacle = state.nextObstacle;
    state.nextObstacle = generateObstacle(2);
    updateUI();
  }

  function resolveObstacle() {
    const o = state.obstacle;
    if (!o || o.type === 'none') return;
    const perfectWindow = Math.max(55, state.beatMs * .12);
    const goodWindow = Math.max(105, state.beatMs * .23);
    let ok = false;
    let perfect = false;

    if (o.type === 'switch') {
      ok = state.lastActionType === 'tap' && state.lastActionBeat === state.beatIndex && state.actionError <= goodWindow;
      perfect = ok && state.actionError <= perfectWindow;
    } else if (o.type === 'charge') {
      const heldFor = performance.now() - state.holdStart;
      ok = state.held && heldFor >= Math.min(150, state.beatMs * .3);
      perfect = ok && heldFor >= Math.min(250, state.beatMs * .5);
    } else if (o.type === 'rest') {
      ok = !state.held && state.lastActionBeat !== state.beatIndex;
      perfect = ok;
    }

    if (!ok) {
      const hint = o.type === 'charge' ? 'HOLD THE WALL' : o.type === 'rest' ? 'WAIT MEANS WAIT' : 'TAP ON THE BEAT';
      die(hint);
      return;
    }
    state.perfects += perfect ? 1 : 0;
    state.danger = clamp(state.danger - .08, 0, 1);
    audio.success(perfect);
    burst(timingX(), laneY(state.lane === 0 ? -1 : 1), perfect ? '#ffffff' : '#49f8ff', perfect ? 20 : 11, perfect ? 3 : 2);
    if (perfect && state.perfects % 8 === 0) toast('PERFECT ×8');
  }

  function startChoice(now) {
    state.choiceActive = true; state.choiceResolved = false; state.choiceStart = now; state.choiceHold = 0;
    ui.choice.classList.add('visible');
    toast('CHOOSE');
  }

  function acceptDouble() {
    if (!state.choiceActive || state.choiceResolved) return;
    state.choiceResolved = true; state.choiceActive = false; state.doubleMode = true; state.multiplier = 2;
    state.doubleUntil = state.beatIndex + 32; state.danger = 1;
    ui.choice.classList.remove('visible'); toast('DOUBLE OR NOTHING'); audio.double(); navigator.vibrate?.([20,20,20,20,55]);
  }

  function resolveChoiceIfNeeded(now) {
    if (!state.choiceActive || state.choiceResolved) return;
    if (state.held && !state.choiceHold) state.choiceHold = now;
    if (state.held && state.choiceHold && now - state.choiceHold >= Math.min(420, state.beatMs * .72)) acceptDouble();
    if (now - state.choiceStart > state.beatMs * 3.2) {
      state.choiceResolved = true; state.choiceActive = false; ui.choice.classList.remove('visible'); toast('PLAY IT SAFE');
    }
  }

  function die(reason) {
    if (state.mode !== 'playing') return;
    state.mode = 'dead'; audio.fail(); navigator.vibrate?.([45, 40, 100]); state.shake = 14; state.flash = .8;
    const finalScore = state.score;
    if (finalScore > best) {
      best = finalScore; localStorage.setItem(STORAGE_KEY, String(best));
    }
    updateUI();
    ui.deathScore.textContent = `${finalScore} BEATS`;
    ui.deathBest.textContent = `BEST: ${best}`;
    ui.deathRank.textContent = rankFor(finalScore);
    ui.death.classList.add('visible');
    toast(reason);
  }

  function rankFor(score) {
    if (score >= 500) return 'MACHINE HEART';
    if (score >= 250) return 'REDLINE';
    if (score >= 100) return 'OVERDRIVE';
    if (score >= 50) return 'LOCKED IN';
    if (score >= 25) return 'FOUND THE RHYTHM';
    if (score >= 10) return 'WARMING UP';
    return 'ONE MORE';
  }

  function updateUI() {
    ui.score.textContent = state.score;
    ui.best.textContent = best;
    ui.startBest.textContent = `BEST: ${best}`;
    const label = state.doubleMode ? '×2 DANGER' : state.score >= 100 ? 'OVERDRIVE' : `${Math.round(state.bpm)} BPM`;
    ui.streak.textContent = label;
  }

  function toast(text) {
    ui.toast.textContent = text;
    ui.toast.classList.remove('visible');
    void ui.toast.offsetWidth;
    ui.toast.classList.add('visible');
    clearTimeout(state.messageTimer);
    state.messageTimer = setTimeout(() => ui.toast.classList.remove('visible'), 620);
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU, s = rand(.4, speed);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color, size: rand(1, 3.5) });
    }
  }

  function update(dt, now) {
    state.flash = Math.max(0, state.flash - dt * 2.8);
    state.shake = Math.max(0, state.shake - dt * 18);
    state.laneVisual = lerp(state.laneVisual, state.lane, clamp(dt * 14, 0, 1));

    state.stars.forEach(s => {
      s.x -= (25 + state.bpm * .18) * s.z * dt;
      if (s.x < -5) { s.x = W + 5; s.y = Math.random() * H; }
    });
    state.particles.forEach(p => { p.x += p.vx * 60 * dt; p.y += p.vy * 60 * dt; p.vx *= .98; p.vy *= .98; p.life -= dt * 2.1; });
    state.particles = state.particles.filter(p => p.life > 0);

    if (state.mode !== 'playing') return;
    state.beatPhase = clamp((now - state.lastBeatAt) / state.beatMs, 0, 1);
    resolveChoiceIfNeeded(now);
    while (now >= state.nextBeatAt && state.mode === 'playing') resolveBeat(state.nextBeatAt);
  }

  function draw() {
    const sx = state.shake ? rand(-state.shake, state.shake) : 0;
    const sy = state.shake ? rand(-state.shake * .45, state.shake * .45) : 0;
    ctx.save(); ctx.translate(sx, sy);

    const glow = state.doubleMode ? 0.16 : state.overdrive ? 0.1 : 0.04;
    const bg = ctx.createRadialGradient(W * .44, H * .54, 0, W * .5, H * .54, Math.max(W, H) * .7);
    bg.addColorStop(0, `rgba(${state.doubleMode ? '80,8,24' : '17,31,58'},${.75 + glow})`);
    bg.addColorStop(.45, '#080914'); bg.addColorStop(1, '#020205');
    ctx.fillStyle = bg; ctx.fillRect(-20, -20, W + 40, H + 40);

    drawStars(); drawTunnel(); drawTrack(); drawObstacle(); drawNextObstacle(); drawPulse(); drawParticles();

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(${state.doubleMode ? '255,45,80' : '73,248,255'},${state.flash * .18})`;
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }
    ctx.restore();
  }

  function drawStars() {
    ctx.save();
    for (const s of state.stars) {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = state.doubleMode ? '#ff5570' : '#7defff';
      const len = 2 + state.bpm / 65 * s.z;
      ctx.fillRect(s.x, s.y, len, Math.max(1, s.z));
    }
    ctx.restore();
  }

  function drawTunnel() {
    const cy = H * .54;
    ctx.save();
    ctx.strokeStyle = state.doubleMode ? 'rgba(255,63,89,.11)' : 'rgba(73,248,255,.075)';
    ctx.lineWidth = 1;
    const spacing = clamp(W / 7, 55, 110);
    const offset = (state.beatPhase * spacing) % spacing;
    for (let x = W + spacing - offset; x > -spacing; x -= spacing) {
      const t = clamp((x - timingX()) / Math.max(1, W - timingX()), 0, 1);
      const top = lerp(cy - H * .18, H * .1, t);
      const bottom = lerp(cy + H * .18, H * .95, t);
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
    }
    const pulse = 1 - Math.abs(state.beatPhase - .5) * 2;
    ctx.globalAlpha = .18 + pulse * .08;
    ctx.beginPath(); ctx.moveTo(0, cy - H*.22); ctx.lineTo(W, H*.05); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, cy + H*.22); ctx.lineTo(W, H*.98); ctx.stroke();
    ctx.restore();
  }

  function drawTrack() {
    const upper = laneY(-1), lower = laneY(1);
    ctx.save();
    ctx.lineWidth = 2;
    ctx.shadowBlur = 14; ctx.shadowColor = state.doubleMode ? '#ff3f59' : '#49f8ff';
    for (const y of [upper, lower]) {
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, 'rgba(255,255,255,.08)');
      g.addColorStop(.2, state.doubleMode ? 'rgba(255,63,89,.7)' : 'rgba(73,248,255,.7)');
      g.addColorStop(1, 'rgba(255,255,255,.025)');
      ctx.strokeStyle = g; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.setLineDash([3, 10]);
    ctx.beginPath(); ctx.moveTo(timingX(), upper - 34); ctx.lineTo(timingX(), lower + 34); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }

  function obstacleX(targetBeat) {
    const beatsAway = targetBeat - state.beatIndex - state.beatPhase;
    return timingX() + beatsAway * (W - timingX()) * .82;
  }

  function drawObstacleShape(o, alpha = 1) {
    if (!o || o.type === 'none') return;
    const x = obstacleX(o.beat);
    if (x < -80 || x > W + 100) return;
    const scale = lerp(.68, 1.15, clamp(1 - (x - timingX()) / W, 0, 1));
    ctx.save(); ctx.globalAlpha = alpha;
    if (o.type === 'switch') {
      const y = H * .54;
      const r = 25 * scale;
      ctx.shadowBlur = 24; ctx.shadowColor = '#ff3bd4';
      ctx.strokeStyle = '#ff65df'; ctx.lineWidth = 4 * scale;
      ctx.beginPath();
      ctx.moveTo(x, y-r); ctx.lineTo(x+r, y); ctx.lineTo(x, y+r); ctx.lineTo(x-r, y); ctx.closePath(); ctx.stroke();
      ctx.font = `${Math.round(10*scale)}px system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = '#ff9deb'; ctx.fillText('TAP', x, y-r-12*scale);
    } else if (o.type === 'charge') {
      const upper = laneY(-1), lower = laneY(1);
      const h = (lower-upper) + 74;
      ctx.shadowBlur = 28; ctx.shadowColor = '#ff3f59'; ctx.strokeStyle = '#ff4f66'; ctx.lineWidth = 5*scale;
      ctx.strokeRect(x-8*scale, upper-37, 16*scale, h);
      ctx.fillStyle = 'rgba(255,63,89,.12)'; ctx.fillRect(x-8*scale, upper-37, 16*scale, h);
      ctx.font = `${Math.round(10*scale)}px system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = '#ff8a99'; ctx.fillText('HOLD', x, upper-48);
    } else if (o.type === 'rest') {
      const y = H * .54;
      ctx.shadowBlur = 20; ctx.shadowColor = '#ffffff';
      ctx.strokeStyle = 'rgba(255,255,255,.78)'; ctx.lineWidth = 2 * scale;
      ctx.beginPath(); ctx.arc(x, y, 26 * scale, 0, TAU); ctx.stroke();
      ctx.font = `${Math.round(10*scale)}px system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'; ctx.fillText('WAIT', x, y - 38*scale);
    }
    ctx.restore();
  }

  function drawObstacle() { drawObstacleShape(state.obstacle, 1); }
  function drawNextObstacle() { drawObstacleShape(state.nextObstacle, .72); }

  function drawPulse() {
    const x = playerX();
    const y = lerp(laneY(-1), laneY(1), state.laneVisual);
    const beatPulse = 1 + Math.pow(1 - state.beatPhase, 5) * .45;
    const holdBoost = state.held ? 1.38 : 1;
    state.trails.unshift({ x, y, life: 1 });
    state.trails = state.trails.slice(0, 16).map(t => ({...t, life: t.life * .84}));

    ctx.save();
    state.trails.forEach((t, i) => {
      ctx.globalAlpha = t.life * .24; ctx.fillStyle = state.doubleMode ? '#ff3f59' : '#49f8ff';
      ctx.beginPath(); ctx.arc(t.x - i * 5, t.y, Math.max(1, 6 * t.life), 0, TAU); ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = state.held ? 42 : 28; ctx.shadowColor = state.doubleMode ? '#ff3f59' : '#49f8ff';
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 7 * beatPulse * holdBoost, 0, TAU); ctx.fill();
    ctx.fillStyle = state.doubleMode ? '#ff3f59' : '#49f8ff'; ctx.beginPath(); ctx.arc(x, y, 4 * beatPulse * holdBoost, 0, TAU); ctx.fill();
    if (state.held) {
      ctx.strokeStyle = state.doubleMode ? '#ff6b7f' : '#7effff'; ctx.lineWidth = 2;
      ctx.globalAlpha = .55; ctx.beginPath(); ctx.arc(x, y, 15 + Math.sin(performance.now()/70)*3, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    for (const p of state.particles) {
      ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.shadowBlur = 8; ctx.shadowColor = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.restore();
  }

  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min(.033, (now - lastFrame) / 1000); lastFrame = now;
    update(dt, now); draw(); requestAnimationFrame(frame);
  }

  function pointerDown(e) {
    e.preventDefault();
    const now = performance.now();
    audio.ensure();
    if (state.mode === 'start') { resetRun(now); return; }
    if (state.mode === 'dead') { resetRun(now); return; }
    state.pressStart = now;
    if (state.choiceActive) { state.choiceHold = now; setHold(true, now); return; }
    setHold(true, now);
  }

  function pointerUp(e) {
    e.preventDefault();
    const now = performance.now();
    if (state.mode !== 'playing') return;
    const duration = now - state.pressStart;
    const wasChoice = state.choiceActive;
    setHold(false, now);
    if (!wasChoice && duration < Math.min(190, state.beatMs * .34)) handleTap(now);
  }

  ui.startButton.addEventListener('click', (e) => { e.stopPropagation(); resetRun(performance.now()); });
  ui.retryButton.addEventListener('click', (e) => { e.stopPropagation(); resetRun(performance.now()); });
  ui.mute.addEventListener('click', (e) => { e.stopPropagation(); audio.ensure(); audio.setMuted(!muted); });
  canvas.addEventListener('pointerdown', pointerDown, { passive: false });
  canvas.addEventListener('pointerup', pointerUp, { passive: false });
  canvas.addEventListener('pointercancel', pointerUp, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    if (e.repeat) return;
    pointerDown(e);
  });
  document.addEventListener('keyup', (e) => { if (e.code === 'Space') pointerUp(e); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.mode === 'playing') die('RHYTHM LOST');
  });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  audio.setMuted(muted); resize(); updateUI(); requestAnimationFrame(frame);
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
})();
