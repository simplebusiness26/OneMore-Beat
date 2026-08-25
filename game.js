(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const ui = {
    score: $('score'), scoreLabel: $('score-label'), best: $('best'), bestLabel: $('best-label'), streak: $('streak'), phrase: $('phrase'),
    start: $('start'), startBest: $('start-best'), startButton: $('start-button'), modeDetail: $('mode-detail'),
    practiceOptions: $('practice-options'), themeButton: $('theme-button'), unlockSummary: $('unlock-summary'),
    death: $('death'), deathMode: $('death-mode'), deathScore: $('death-score'), deathBest: $('death-best'), deathRank: $('death-rank'),
    retryButton: $('retry-button'), deathMenu: $('death-menu'), choice: $('choice'), toast: $('toast'), mute: $('mute'), menuMini: $('menu-mini'),
    challenge: $('challenge'), challengeKicker: $('challenge-kicker'), challengeName: $('challenge-name'), challengeMeta: $('challenge-meta'),
    modeChips: [...document.querySelectorAll('.mode-chip')], practiceChips: [...document.querySelectorAll('.practice-chip')],
    dots: [...document.querySelectorAll('.beat-dots i')]
  };

  const STORAGE_KEY = 'one-more-beat-best-v1';
  const SETTINGS_KEY = 'one-more-beat-settings-v1';
  const PROGRESS_KEY = 'one-more-beat-progress-v2';
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const emit = (name, detail = {}) => window.dispatchEvent(new CustomEvent(`omb:${name}`, { detail }));

  const THEMES = {
    neon: { id:'neon', name:'NEON HEART', accent:'#49f8ff', secondary:'#ff3bd4', danger:'#ff3f59', bg0:'#111f3b', bg1:'#070812', star:'#7defff', trail:'#49f8ff' },
    pulse: { id:'pulse', name:'PULSE MACHINE', accent:'#61ff8b', secondary:'#49f8ff', danger:'#ff4d78', bg0:'#0d3025', bg1:'#06100d', star:'#8dffb0', trail:'#61ff8b' },
    afterburn: { id:'afterburn', name:'AFTERBURN', accent:'#ffad42', secondary:'#ff4d79', danger:'#ff3148', bg0:'#3a1607', bg1:'#120704', star:'#ffd08c', trail:'#ff9a2f' },
    blackout: { id:'blackout', name:'BLACKOUT', accent:'#f5f7ff', secondary:'#8c6cff', danger:'#ff315b', bg0:'#111116', bg1:'#020203', star:'#d8dcff', trail:'#a99cff' },
    redline: { id:'redline', name:'REDLINE', accent:'#ff3f59', secondary:'#ff8f2f', danger:'#ff1738', bg0:'#3c0710', bg1:'#100205', star:'#ff788a', trail:'#ff3f59' }
  };
  const THEME_ORDER = ['auto','neon','pulse','afterburn','blackout','redline'];

  const PHRASES = {
    easy: [
      { name:'HEARTLINE', seq:['none','tap','none','rest','none','tap','none','charge'] },
      { name:'LOCKSTEP', seq:['tap','none','tap','rest','none','charge','none','rest'] },
      { name:'BREATHE', seq:['none','tap','rest','none','charge','none','tap','rest'] }
    ],
    medium: [
      { name:'PULSE CUT', seq:['tap','rest','tap','charge','none','tap','rest','charge'] },
      { name:'CIRCUIT', seq:['charge','none','tap','rest','tap','none','charge','tap'] },
      { name:'SYNC LINE', seq:['tap','tap','none','rest','charge','none','tap','rest'] }
    ],
    hard: [
      { name:'RED SHIFT', seq:['charge','tap','rest','tap','charge','rest','tap','tap'] },
      { name:'AFTERIMAGE', seq:['tap','rest','tap','tap','charge','tap','rest','charge'] },
      { name:'NO BRAKES', seq:['tap','charge','tap','rest','tap','tap','charge','rest'] }
    ]
  };
  const BOSSES = [
    { name:'HEARTBREAK', seq:['tap','tap','rest','charge','tap','rest','tap','charge'] },
    { name:'OVERDRIVE TEST', seq:['tap','charge','tap','rest','tap','tap','charge','rest'] },
    { name:'BLACKOUT', seq:['rest','tap','charge','tap','rest','charge','tap','tap'] },
    { name:'AFTERBURN', seq:['tap','tap','charge','rest','tap','charge','tap','rest'] },
    { name:'REDLINE', seq:['charge','tap','tap','rest','tap','charge','rest','tap'] }
  ];
  const PRACTICE = {
    tap: { name:'TAP CONTROL', seq:['none','tap','none','tap','rest','tap','none','tap'] },
    hold: { name:'HOLD CONTROL', seq:['none','charge','none','rest','charge','none','rest','charge'] },
    mix: { name:'CORE MIX', seq:['tap','none','charge','rest','tap','tap','none','charge'] },
    hard: { name:'HARD PHRASE', seq:['tap','charge','tap','rest','tap','tap','charge','rest'] }
  };
  const SIGNATURES = {
    neon:{name:'NEON HEART',seq:['tap','none','tap','rest','none','charge','tap','rest']},
    pulse:{name:'PULSE MACHINE',seq:['tap','tap','none','rest','charge','tap','none','rest']},
    afterburn:{name:'AFTERBURN RUN',seq:['tap','charge','tap','none','tap','rest','charge','tap']},
    blackout:{name:'DARK SIGNAL',seq:['rest','tap','charge','none','rest','tap','charge','tap']},
    redline:{name:'REDLINE RUSH',seq:['tap','charge','tap','rest','tap','tap','charge','rest']}
  };

  function loadProgress() {
    let data = {};
    try { data = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); } catch (_) {}
    const legacyBest = Number(localStorage.getItem(STORAGE_KEY) || 0);
    return {
      best: Math.max(legacyBest, Number(data.best || 0)), maxBeat: Number(data.maxBeat || 0), perfectTotal: Number(data.perfectTotal || 0),
      maxPerfectStreak: Number(data.maxPerfectStreak || 0), doubleSurvives: Number(data.doubleSurvives || 0),
      daily: data.daily && typeof data.daily === 'object' ? data.daily : {}, unlocks: Array.isArray(data.unlocks) ? data.unlocks : ['neon'],
      selectedTheme: data.selectedTheme || 'auto'
    };
  }

  let progress = loadProgress();
  let selectedMode = 'endless';
  let selectedPractice = 'mix';
  let selectedTheme = THEME_ORDER.includes(progress.selectedTheme) ? progress.selectedTheme : 'auto';
  let muted = false;
  try { muted = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').muted === true; } catch (_) {}

  const state = {
    mode:'start', runMode:'endless', score:0, beatIndex:0, bpm:104, beatMs:60000/104, lastBeatAt:0, nextBeatAt:0, beatPhase:0,
    multiplier:1, doubleMode:false, doubleUntilBeat:0, choiceActive:false, choiceStart:0, choiceEndBeat:0, choiceHoldAt:0, lastChoiceBeat:-999,
    lane:0, laneVisual:0, held:false, pressBeat:-99, pressStarted:0, pressExpected:'none', input:new Map(), pending:[],
    performance:.76, perfectStreak:0, runPerfects:0, runMaxPerfectStreak:0, bossClears:0,
    phase:'intro', themeId:'neon', blockCache:new Map(), dailySeed:0,
    stars:[], particles:[], trails:[], flash:0, shake:0, nearMiss:0, visualKick:0, visualSnare:0, visualBass:0, dropPulse:0,
    practiceResetAt:0, messageTimer:0, runStartedAt:0
  };

  let W = 0, H = 0, DPR = 1;

  function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(seed) {
    return function() { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function dailyKey() { return new Date().toISOString().slice(0, 10); }
  function saveProgress() {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    localStorage.setItem(STORAGE_KEY, String(progress.best));
  }

  function refreshUnlocks(show = false) {
    const before = new Set(progress.unlocks);
    const unlock = (id) => { if (!progress.unlocks.includes(id)) progress.unlocks.push(id); };
    unlock('neon');
    if (progress.maxBeat >= 50) unlock('pulse');
    if (progress.maxBeat >= 100) unlock('afterburn');
    if (progress.perfectTotal >= 20 || progress.maxPerfectStreak >= 12) unlock('blackout');
    if (progress.maxBeat >= 250 || progress.doubleSurvives >= 1) unlock('redline');
    const added = progress.unlocks.filter(id => !before.has(id));
    if (added.length) {
      saveProgress();
      if (show) {
        const id = added[added.length - 1];
        toast(`UNLOCKED · ${THEMES[id].name}`);
        emit('milestone', { kind:'unlock', themeId:id, name:THEMES[id].name });
      }
    }
    ui.unlockSummary.textContent = `${progress.unlocks.length}/5 WORLDS`;
  }

  function cycleTheme() {
    const available = ['auto', ...THEME_ORDER.slice(1).filter(id => progress.unlocks.includes(id))];
    let i = available.indexOf(selectedTheme);
    selectedTheme = available[(i + 1) % available.length];
    progress.selectedTheme = selectedTheme; saveProgress(); updateMenu();
  }

  function autoThemeForBeat(beat) {
    if (beat >= 250) return 'redline';
    if (beat >= 150) return 'blackout';
    if (beat >= 100) return 'afterburn';
    if (beat >= 50) return 'pulse';
    return 'neon';
  }
  function desiredTheme() {
    if (state.runMode === 'daily') {
      const ids = ['neon','pulse','afterburn','blackout','redline'];
      return ids[state.dailySeed % ids.length];
    }
    return selectedTheme === 'auto' ? autoThemeForBeat(state.beatIndex) : selectedTheme;
  }
  function applyTheme(id, announce = false) {
    if (!THEMES[id]) id = 'neon';
    if (state.themeId === id && !announce) return;
    state.themeId = id;
    const t = THEMES[id];
    document.documentElement.style.setProperty('--accent', t.accent);
    document.documentElement.style.setProperty('--secondary', t.secondary);
    document.documentElement.style.setProperty('--danger', t.danger);
    emit('theme', { themeId:id, name:t.name });
    if (announce && state.mode === 'playing') toast(t.name);
  }

  function resize() {
    DPR = clamp(window.devicePixelRatio || 1, 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    seedStars();
  }
  function seedStars() {
    const count = Math.floor((W * H) / 8500);
    state.stars = Array.from({ length:count }, () => ({ x:Math.random()*W, y:Math.random()*H, z:rand(.25,1), a:rand(.08,.48) }));
  }
  function laneY(lane) { const center = H*.54; const gap = clamp(H*.17, 82, 138); return center + lane*gap*.5; }
  function playerX() { return clamp(W*.2, 72, 160); }
  function timingX() { return playerX()+16; }
  function inputGraceMs() { return clamp(state.beatMs*.31, 120, 165); }
  function goodWindowMs() { return clamp(state.beatMs*.31, 145, 170); }
  function perfectWindowMs() { return clamp(state.beatMs*.14, 68, 82); }

  function phaseForBeat(beat) {
    const cycle = beat % 50;
    if (beat < 12) return 'intro';
    if (beat >= 250) return cycle >= 42 ? 'build' : 'redline';
    if (cycle >= 42 || cycle === 49) return 'build';
    if (cycle === 0) return 'drop';
    if (beat >= 100) return 'overdrive';
    if (beat >= 50) return 'drive';
    return 'groove';
  }
  function intensityForBeat(beat) {
    if (beat >= 250) return 5;
    if (beat >= 100) return 4;
    if (beat >= 50) return 3;
    if (beat >= 24) return 2;
    if (beat >= 10) return 1;
    return 0;
  }

  function bossInfoForBeat(beat) {
    if (beat < 50) return null;
    const start = Math.floor(beat / 50) * 50;
    if (start < 50 || beat < start || beat > start + 7) return null;
    const bossNo = Math.floor(start / 50) - 1;
    return { boss:BOSSES[bossNo % BOSSES.length], start, step:beat-start };
  }

  function phrasePoolForBeat(beat) {
    if (beat >= 150) return PHRASES.hard;
    if (beat >= 55) return PHRASES.medium;
    return PHRASES.easy;
  }
  function normalPhraseForBlock(startBeat) {
    if (state.blockCache.has(startBeat)) return state.blockCache.get(startBeat);
    const pool = phrasePoolForBeat(startBeat);
    const world = desiredTheme();
    let phrase;
    if (state.runMode === 'daily') {
      const rng = mulberry32((state.dailySeed ^ Math.imul(startBeat, 2654435761)) >>> 0);
      phrase = startBeat > 8 && rng() < .28 ? SIGNATURES[world] : pool[Math.floor(rng()*pool.length)];
    } else {
      phrase = startBeat > 8 && Math.random() < .28 ? SIGNATURES[world] : pool[Math.floor(Math.random()*pool.length)];
    }
    state.blockCache.set(startBeat, phrase);
    return phrase;
  }
  function descriptorForBeat(beat) {
    if (state.choiceActive && beat <= state.choiceEndBeat) return { type:'none', phrase:'CHOICE', step:0, length:1, boss:false };
    if (state.runMode === 'practice') {
      const p = PRACTICE[selectedPractice]; const step = (beat-1) % p.seq.length;
      return { type:p.seq[step], phrase:p.name, step, length:p.seq.length, boss:false };
    }
    const bi = bossInfoForBeat(beat);
    if (bi) return { type:bi.boss.seq[bi.step], phrase:bi.boss.name, step:bi.step, length:8, boss:true, bossStart:bi.start };
    const blockStart = Math.floor((beat-1)/8)*8+1;
    const p = normalPhraseForBlock(blockStart); const step = beat-blockStart;
    return { type:p.seq[step], phrase:p.name, step, length:p.seq.length, boss:false };
  }

  function beatTimeFor(beat) {
    const p = state.pending.find(x => x.beat === beat);
    if (p) return p.beatAt;
    if (beat === state.beatIndex) return state.lastBeatAt;
    if (beat === state.beatIndex + 1) return state.nextBeatAt;
    return state.nextBeatAt + (beat - state.beatIndex - 1) * state.beatMs;
  }
  function nearestBeat(now) {
    return Math.abs(now-state.lastBeatAt) <= Math.abs(state.nextBeatAt-now) ? state.beatIndex : state.beatIndex+1;
  }
  function recordForBeat(beat) {
    if (!state.input.has(beat)) state.input.set(beat, { touched:false, downAt:null, upAt:null, tapAt:null });
    return state.input.get(beat);
  }

  function resetRun(now, practiceRetry = false) {
    state.mode = 'playing'; state.runMode = selectedMode; state.score = 0; state.beatIndex = 0;
    state.bpm = state.runMode === 'practice' ? (selectedPractice === 'hard' ? 122 : 98) : 104;
    state.beatMs = 60000/state.bpm; state.lastBeatAt = now; state.nextBeatAt = now + state.beatMs; state.beatPhase = 0;
    state.multiplier=1; state.doubleMode=false; state.doubleUntilBeat=0; state.choiceActive=false; state.choiceHoldAt=0; state.lastChoiceBeat=-999;
    state.lane=0; state.laneVisual=0; state.held=false; state.pressBeat=-99; state.pressStarted=0; state.pressExpected='none'; state.input.clear(); state.pending=[];
    state.performance=.76; state.perfectStreak=0; state.runPerfects=0; state.runMaxPerfectStreak=0; state.bossClears=0;
    state.phase='intro'; state.blockCache.clear(); state.flash=0; state.shake=0; state.nearMiss=0; state.dropPulse=0; state.practiceResetAt=0; state.particles=[]; state.trails=[];
    state.runStartedAt=now; state.dailySeed=hashString(dailyKey());
    ui.start.classList.remove('visible'); ui.death.classList.remove('visible'); ui.choice.classList.remove('visible'); ui.challenge.classList.remove('visible');
    ui.menuMini.classList.remove('hidden');
    applyTheme(desiredTheme()); updateUI();
    if (!practiceRetry) toast(state.runMode === 'practice' ? `${PRACTICE[selectedPractice].name} · PRACTICE` : state.runMode === 'daily' ? 'DAILY BEAT' : 'LOCK IN');
    emit('audio-unlock'); emit('state', stateEventDetail('start'));
    navigator.vibrate?.(16);
  }

  function stateEventDetail(kind='update') {
    return { kind, mode:state.runMode, bpm:state.bpm, score:state.score, beatIndex:state.beatIndex, intensity:intensityForBeat(state.beatIndex),
      phase:state.phase, themeId:state.themeId, performance:state.performance, doubleMode:state.doubleMode };
  }

  function resolveBeat(beatAt) {
    state.lastBeatAt = beatAt; state.beatIndex += 1;
    state.phase = phaseForBeat(state.beatIndex);
    const targetBpm = state.runMode === 'practice' ? (selectedPractice === 'hard' ? 122 : 98) : Math.min(210, 104 + state.beatIndex*.19 + (state.doubleMode ? 12 : 0));
    state.bpm = lerp(state.bpm, targetBpm, .10); state.beatMs = 60000/state.bpm; state.nextBeatAt = beatAt + state.beatMs;

    const desc = descriptorForBeat(state.beatIndex);
    state.pending.push({ beat:state.beatIndex, beatAt, resolveAt:beatAt+inputGraceMs(), desc });
    state.visualKick=1; state.visualBass=intensityForBeat(state.beatIndex)>=1 ? 1 : .35; if (state.beatIndex%2===0) state.visualSnare=1;
    if (state.phase === 'drop') { state.dropPulse=1; state.flash=1; state.shake=7; emit('milestone',{kind:'drop',beat:state.beatIndex,themeId:state.themeId}); }

    const newTheme = desiredTheme(); if (newTheme !== state.themeId) applyTheme(newTheme, true);
    updateChallenge(); updateUI();
    ui.dots.forEach((d,i)=>d.classList.toggle('active',i===state.beatIndex%4));
    setTimeout(()=>ui.dots.forEach(d=>d.classList.remove('active')),80);

    emit('beat', { ...stateEventDetail('beat'), target:desc.type, phrase:desc.phrase, phraseStep:desc.step, boss:desc.boss });

    if (state.runMode === 'endless' && !state.choiceActive && !state.doubleMode && state.beatIndex >= 64 && state.beatIndex-state.lastChoiceBeat >= 96 && state.beatIndex%32===0) startChoice(beatAt);
    if (state.doubleMode && state.beatIndex >= state.doubleUntilBeat) endDouble();
  }

  function processPending(now) {
    const ready = state.pending.filter(p => now >= p.resolveAt);
    state.pending = state.pending.filter(p => now < p.resolveAt);
    for (const p of ready) {
      if (state.mode !== 'playing') break;
      evaluateBeat(p, now);
      state.input.delete(p.beat-2);
    }
  }

  function evaluateBeat(p, now) {
    const { desc, beat, beatAt } = p;
    const rec = state.input.get(beat);
    const good = goodWindowMs(); const perfect = perfectWindowMs();
    let ok = true, quality = 'good', err = 0;

    if (desc.type === 'tap') {
      ok = !!rec?.tapAt; err = ok ? Math.abs(rec.tapAt-beatAt) : 999;
      ok = ok && err <= good; quality = err <= perfect ? 'perfect' : err >= good*.72 ? 'near' : 'good';
    } else if (desc.type === 'charge') {
      if (!rec?.downAt) ok = false;
      else {
        const up = rec.upAt ?? now; const overlap = rec.downAt <= beatAt+good && up >= beatAt-55; const heldFor = up-rec.downAt;
        ok = overlap && heldFor >= clamp(state.beatMs*.13,55,80); err = Math.abs(rec.downAt-beatAt);
        quality = err <= perfect && up >= beatAt+30 ? 'perfect' : err >= good*.72 ? 'near' : 'good';
      }
    } else if (desc.type === 'rest') {
      const restTouch = rec?.downAt ? Math.abs(rec.downAt-beatAt) <= good : false;
      ok = !restTouch; quality = ok ? 'perfect' : 'miss';
    }

    if (!ok) {
      emit('result',{quality:'miss',target:desc.type,beat,bpm:state.bpm,themeId:state.themeId});
      if (state.runMode === 'practice') { practiceMiss(desc); return; }
      die(desc.type === 'charge' ? 'HOLD THROUGH THE WALL' : desc.type === 'rest' ? 'WAIT MEANS WAIT' : 'TAP AS IT HITS THE LINE');
      return;
    }

    if (quality === 'perfect') {
      state.performance=clamp(state.performance+.035,0,1); state.perfectStreak++; state.runPerfects++; progress.perfectTotal++;
      state.runMaxPerfectStreak=Math.max(state.runMaxPerfectStreak,state.perfectStreak); progress.maxPerfectStreak=Math.max(progress.maxPerfectStreak,state.runMaxPerfectStreak);
      burst(timingX(),laneY(state.lane===0?-1:1),THEMES[state.themeId].accent,18,2.8);
      if (state.perfectStreak>0 && state.perfectStreak%8===0) toast(`PERFECT ×${state.perfectStreak}`);
    } else if (quality === 'near') {
      state.performance=clamp(state.performance-.035,0,1); state.perfectStreak=0; state.nearMiss=1; state.shake=Math.max(state.shake,3.5);
      toast('CLOSE');
    } else { state.performance=clamp(state.performance+.006,0,1); state.perfectStreak=0; }

    if (state.runMode !== 'practice') {
      state.score += state.multiplier;
      progress.best=Math.max(progress.best,state.score); progress.maxBeat=Math.max(progress.maxBeat,beat);
      if (state.runMode === 'daily') progress.daily[dailyKey()] = Math.max(Number(progress.daily[dailyKey()]||0),state.score);
      saveProgress(); refreshUnlocks(true);
    }

    emit('result',{quality,target:desc.type,beat,error:err,bpm:state.bpm,themeId:state.themeId,performance:state.performance,perfectStreak:state.perfectStreak});

    if (desc.boss && desc.step === 7) {
      state.bossClears++; state.dropPulse=1; state.shake=9; toast(`${desc.phrase} · CLEARED`);
      emit('milestone',{kind:'boss-clear',name:desc.phrase,beat,themeId:state.themeId});
    }
    updateUI();
  }

  function practiceMiss(desc) {
    state.nearMiss=1; state.shake=5; toast(`TRY AGAIN · ${desc.phrase}`);
    state.practiceResetAt=performance.now()+420;
  }

  function restartPractice(now) {
    const wasMode=selectedMode; selectedMode='practice'; resetRun(now,true); selectedMode=wasMode;
    toast(`${PRACTICE[selectedPractice].name} · AGAIN`);
  }

  function startChoice(now) {
    state.choiceActive=true; state.choiceStart=now; state.choiceEndBeat=state.beatIndex+4; state.choiceHoldAt=0; state.lastChoiceBeat=state.beatIndex;
    ui.choice.classList.add('visible'); toast('CHOOSE'); emit('milestone',{kind:'choice',themeId:state.themeId});
  }
  function acceptDouble() {
    if (!state.choiceActive) return;
    state.choiceActive=false; state.doubleMode=true; state.multiplier=2; state.doubleUntilBeat=state.beatIndex+24;
    ui.choice.classList.remove('visible'); state.flash=1; state.shake=7; toast('DOUBLE OR NOTHING');
    emit('milestone',{kind:'double',themeId:state.themeId,bpm:state.bpm});
  }
  function endDouble() {
    state.doubleMode=false; state.multiplier=1; progress.doubleSurvives++; saveProgress(); refreshUnlocks(true); toast('SURVIVED ×2');
    emit('milestone',{kind:'double-clear',themeId:state.themeId});
  }
  function updateChoice(now) {
    if (!state.choiceActive) return;
    if (state.held && state.choiceHoldAt && now-state.choiceHoldAt >= Math.min(380,state.beatMs*.75)) acceptDouble();
    if (state.beatIndex >= state.choiceEndBeat) { state.choiceActive=false; state.choiceHoldAt=0; ui.choice.classList.remove('visible'); toast('PLAY IT SAFE'); }
  }

  function updateChallenge() {
    if (state.runMode === 'practice') { ui.challenge.classList.remove('visible'); return; }
    const bi=bossInfoForBeat(state.beatIndex);
    if (bi) {
      ui.challengeKicker.textContent='CHALLENGE'; ui.challengeName.textContent=bi.boss.name; ui.challengeMeta.textContent=`${bi.step+1}/8 · STAY LOCKED`;
      ui.challenge.classList.add('visible');
      if (bi.step===0) emit('milestone',{kind:'boss-start',name:bi.boss.name,beat:state.beatIndex,themeId:state.themeId});
      return;
    }
    const nextBoss=Math.ceil(Math.max(50,state.beatIndex+1)/50)*50; const away=nextBoss-state.beatIndex;
    if (away>0 && away<=4) {
      const boss=BOSSES[(Math.floor(nextBoss/50)-1)%BOSSES.length]; ui.challengeKicker.textContent='INCOMING'; ui.challengeName.textContent=boss.name; ui.challengeMeta.textContent=`${away} BEAT${away===1?'':'S'}`; ui.challenge.classList.add('visible');
    } else ui.challenge.classList.remove('visible');
  }

  function expectedForBeat(beat) {
    const pending=state.pending.find(p=>p.beat===beat); return pending ? pending.desc : descriptorForBeat(beat);
  }
  function registerTap(beat, now, rec) {
    const beatAt=beatTimeFor(beat); const err=Math.abs(now-beatAt);
    if (err>goodWindowMs()) return false;
    rec.tapAt=now; state.lane=state.lane===0?1:0; state.flash=Math.max(state.flash,.18);
    burst(playerX(),laneY(state.lane===0?-1:1),THEMES[state.themeId].accent,8,1.8); navigator.vibrate?.(7);
    emit('input',{kind:'tap',beat,error:err,bpm:state.bpm,themeId:state.themeId}); return true;
  }

  function pointerDown(e) {
    e.preventDefault(); const now=performance.now(); emit('audio-unlock'); if (state.mode!=='playing') return;
    if (state.choiceActive) { state.held=true; state.choiceHoldAt=now; return; }
    const beat=nearestBeat(now); const desc=expectedForBeat(beat); const rec=recordForBeat(beat);
    rec.touched=true; rec.downAt=rec.downAt??now; rec.upAt=null; state.pressBeat=beat; state.pressStarted=now; state.pressExpected=desc.type; state.held=true;
    if (desc.type==='tap') registerTap(beat,now,rec);
    if (desc.type==='charge') emit('input',{kind:'hold',beat,error:Math.abs(now-beatTimeFor(beat)),bpm:state.bpm,themeId:state.themeId});
  }
  function pointerUp(e) {
    e.preventDefault(); const now=performance.now(); if (state.mode!=='playing') return;
    if (state.choiceActive) { if (state.choiceHoldAt && now-state.choiceHoldAt>=Math.min(380,state.beatMs*.75)) acceptDouble(); state.held=false; return; }
    const beat=state.pressBeat; const rec=state.input.get(beat); if (rec) rec.upAt=now;
    if (rec && state.pressExpected==='none' && now-state.pressStarted<=220) registerTap(beat,now,rec);
    state.held=false; state.pressBeat=-99; state.pressExpected='none';
  }
  function pointerCancel(e) { e.preventDefault(); const now=performance.now(); if (state.pressBeat>-1) { const rec=state.input.get(state.pressBeat); if (rec) rec.upAt=now; } state.held=false; state.choiceHoldAt=0; }

  function die(reason) {
    if (state.mode!=='playing') return;
    state.mode='dead'; state.pending=[]; state.held=false; ui.choice.classList.remove('visible'); ui.challenge.classList.remove('visible'); ui.menuMini.classList.add('hidden');
    saveProgress(); refreshUnlocks(false); emit('death',{reason,score:state.score,mode:state.runMode,themeId:state.themeId});
    navigator.vibrate?.([35,35,85]); state.shake=13; state.flash=.7;
    setTimeout(()=>{
      ui.deathMode.textContent=state.runMode==='daily'?'DAILY RUN ENDED':'RUN ENDED';
      ui.deathScore.textContent=`${state.score} BEATS`;
      ui.deathBest.textContent=state.runMode==='daily'?`TODAY: ${progress.daily[dailyKey()]||0}`:`BEST: ${progress.best}`;
      ui.deathRank.textContent=rankFor(state.score); ui.death.classList.add('visible'); toast(reason);
    },150);
  }
  function rankFor(score) {
    if (score>=500) return 'MACHINE HEART'; if (score>=250) return 'REDLINE'; if (score>=100) return 'OVERDRIVE'; if (score>=50) return 'LOCKED IN'; if (score>=25) return 'FOUND THE RHYTHM'; if (score>=10) return 'WARMING UP'; return 'ONE MORE';
  }

  function goMenu() {
    state.mode='start'; state.pending=[]; state.held=false; ui.death.classList.remove('visible'); ui.choice.classList.remove('visible'); ui.challenge.classList.remove('visible'); ui.menuMini.classList.add('hidden'); ui.start.classList.add('visible'); emit('death',{reason:'menu'}); updateMenu();
  }

  function updateMenu() {
    refreshUnlocks(false);
    ui.modeChips.forEach(b=>b.classList.toggle('selected',b.dataset.mode===selectedMode));
    ui.practiceOptions.classList.toggle('hidden',selectedMode!=='practice'); ui.practiceChips.forEach(b=>b.classList.toggle('selected',b.dataset.practice===selectedPractice));
    const themeName=selectedTheme==='auto'?'AUTO':THEMES[selectedTheme].name; ui.themeButton.textContent=`WORLD · ${themeName}`;
    ui.startBest.textContent=`BEST: ${progress.best}`;
    if (selectedMode==='daily') { ui.startButton.textContent='START DAILY BEAT'; ui.modeDetail.textContent=`${dailyKey()} · SAME PATTERN FOR EVERYONE · TODAY: ${progress.daily[dailyKey()]||0}`; }
    else if (selectedMode==='practice') { ui.startButton.textContent='START PRACTICE'; ui.modeDetail.textContent='NO SCORE · NO DEATH · MISSES REPEAT THE PHRASE.'; }
    else { ui.startButton.textContent='START ENDLESS'; ui.modeDetail.textContent='DESIGNED PHRASES · BUILDS · DROPS · CHALLENGES · NO MERCY.'; }
  }

  function updateUI() {
    const next=descriptorForBeat(state.beatIndex+1);
    if (state.runMode==='practice') { ui.scoreLabel.textContent='PRACTICE'; ui.score.textContent='—'; ui.bestLabel.textContent='TEMPO'; ui.best.textContent=Math.round(state.bpm); }
    else { ui.scoreLabel.textContent='BEATS'; ui.score.textContent=state.score; ui.bestLabel.textContent=state.runMode==='daily'?'TODAY':'BEST'; ui.best.textContent=state.runMode==='daily'?(progress.daily[dailyKey()]||0):progress.best; }
    const performanceLabel=state.performance>=.9?'FULL MIX':state.performance>=.7?'LOCKED':state.performance>=.5?'THIN MIX':'RECOVER';
    ui.streak.textContent=state.doubleMode?'×2 DANGER':state.phase==='build'?'BUILDING…':state.phase==='drop'?'DROP':`${Math.round(state.bpm)} BPM · ${performanceLabel}`;
    ui.phrase.textContent=`${next.phrase} · ${next.step+1}/${next.length} · ${next.type==='none'?'OPEN':next.type.toUpperCase()}`;
  }

  function toast(text) {
    ui.toast.textContent=text; ui.toast.classList.remove('visible'); void ui.toast.offsetWidth; ui.toast.classList.add('visible');
    clearTimeout(state.messageTimer); state.messageTimer=setTimeout(()=>ui.toast.classList.remove('visible'),620);
  }
  function burst(x,y,color,count,speed) {
    for(let i=0;i<count;i++){const a=Math.random()*TAU,s=rand(.4,speed);state.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,color,size:rand(1,3.5)})}
  }

  function update(dt,now) {
    state.flash=Math.max(0,state.flash-dt*2.8); state.shake=Math.max(0,state.shake-dt*18); state.nearMiss=Math.max(0,state.nearMiss-dt*2.7);
    state.visualKick=Math.max(0,state.visualKick-dt*5.8); state.visualSnare=Math.max(0,state.visualSnare-dt*8); state.visualBass=Math.max(0,state.visualBass-dt*4.5); state.dropPulse=Math.max(0,state.dropPulse-dt*1.8);
    state.laneVisual=lerp(state.laneVisual,state.lane,clamp(dt*14,0,1));
    state.stars.forEach(s=>{s.x-=(25+state.bpm*.18)*s.z*dt;if(s.x<-5){s.x=W+5;s.y=Math.random()*H}});
    state.particles.forEach(p=>{p.x+=p.vx*60*dt;p.y+=p.vy*60*dt;p.vx*=.98;p.vy*=.98;p.life-=dt*2.1}); state.particles=state.particles.filter(p=>p.life>0);
    if(state.mode!=='playing') return;
    if(state.practiceResetAt && now>=state.practiceResetAt){state.practiceResetAt=0;restartPractice(now);return}
    state.beatPhase=clamp((now-state.lastBeatAt)/state.beatMs,0,1); processPending(now); if(state.mode!=='playing')return; updateChoice(now);
    while(now>=state.nextBeatAt&&state.mode==='playing'){resolveBeat(state.nextBeatAt);processPending(now)}
  }

  function draw() {
    const t=THEMES[state.themeId]||THEMES.neon; const sx=state.shake?rand(-state.shake,state.shake):0, sy=state.shake?rand(-state.shake*.45,state.shake*.45):0;
    ctx.save();ctx.translate(sx,sy);drawBackground(t);drawStars(t);drawTunnel(t);drawTrack(t);drawObstacles(t);drawPulse(t);drawParticles();drawGlitch();ctx.restore();
  }
  function drawBackground(t) {
    const bass=state.visualBass*.16+state.dropPulse*.2; const g=ctx.createRadialGradient(W*.44,H*.54,0,W*.5,H*.54,Math.max(W,H)*.75);
    g.addColorStop(0,t.bg0);g.addColorStop(.5,t.bg1);g.addColorStop(1,'#010103');ctx.fillStyle=g;ctx.fillRect(-25,-25,W+50,H+50);
    if(bass>0){ctx.fillStyle=`${t.accent}${Math.round(clamp(bass,0,.35)*255).toString(16).padStart(2,'0')}`;ctx.fillRect(-25,-25,W+50,H+50)}
    if(state.flash>0){ctx.fillStyle=`rgba(255,255,255,${state.flash*.12})`;ctx.fillRect(-25,-25,W+50,H+50)}
  }
  function drawStars(t) {ctx.save();for(const s of state.stars){ctx.globalAlpha=s.a;ctx.fillStyle=t.star;const len=2+state.bpm/60*s.z;ctx.fillRect(s.x,s.y,len,Math.max(1,s.z))}ctx.restore()}
  function drawTunnel(t) {
    const cy=H*.54;ctx.save();ctx.strokeStyle=`${t.accent}20`;ctx.lineWidth=1+state.visualKick*.7;const spacing=clamp(W/7,55,110);const offset=(state.beatPhase*spacing)%spacing;
    const bossCountdown=Math.max(0,50-(state.beatIndex%50||50));const buildPinch=state.phase==='build'?clamp((8-bossCountdown)/8,0,1):0;
    for(let x=W+spacing-offset;x>-spacing;x-=spacing){const q=clamp((x-timingX())/Math.max(1,W-timingX()),0,1),pinch=1-buildPinch*.28*(1-q);const top=lerp(cy-H*.18,H*.08,q)*pinch+(cy*(1-pinch));const bottom=lerp(cy+H*.18,H*.96,q)*pinch+(cy*(1-pinch));ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke()}
    ctx.globalAlpha=.18+state.visualBass*.18;ctx.beginPath();ctx.moveTo(0,cy-H*.22);ctx.lineTo(W,H*.05);ctx.stroke();ctx.beginPath();ctx.moveTo(0,cy+H*.22);ctx.lineTo(W,H*.98);ctx.stroke();ctx.restore()
  }
  function drawTrack(t) {
    const upper=laneY(-1),lower=laneY(1);ctx.save();ctx.lineWidth=2+state.visualKick*.5;ctx.shadowBlur=14+state.visualBass*18;ctx.shadowColor=t.accent;
    for(const y of[upper,lower]){const g=ctx.createLinearGradient(0,0,W,0);g.addColorStop(0,'rgba(255,255,255,.06)');g.addColorStop(.2,`${t.accent}b5`);g.addColorStop(1,'rgba(255,255,255,.02)');ctx.strokeStyle=g;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
    ctx.shadowBlur=0;ctx.strokeStyle='rgba(255,255,255,.14)';ctx.setLineDash([3,10]);ctx.beginPath();ctx.moveTo(timingX(),upper-34);ctx.lineTo(timingX(),lower+34);ctx.stroke();ctx.setLineDash([]);ctx.restore()
  }
  function obstacleX(beatsAway){return timingX()+beatsAway*(W-timingX())*.82}
  function drawObstacleShape(desc,x,t,alpha=1){if(!desc||desc.type==='none'||x<-85||x>W+100)return;const scale=lerp(.68,1.15,clamp(1-(x-timingX())/W,0,1));ctx.save();ctx.globalAlpha=alpha;
    if(desc.type==='tap'){const y=H*.54,r=25*scale;ctx.shadowBlur=24;ctx.shadowColor=t.secondary;ctx.strokeStyle=t.secondary;ctx.lineWidth=4*scale;ctx.beginPath();ctx.moveTo(x,y-r);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r,y);ctx.closePath();ctx.stroke();ctx.font=`${Math.round(10*scale)}px system-ui`;ctx.textAlign='center';ctx.fillStyle=t.secondary;ctx.fillText('TAP',x,y-r-12*scale)}
    else if(desc.type==='charge'){const upper=laneY(-1),lower=laneY(1),h=lower-upper+74;ctx.shadowBlur=28;ctx.shadowColor=t.danger;ctx.strokeStyle=t.danger;ctx.lineWidth=5*scale;ctx.strokeRect(x-8*scale,upper-37,16*scale,h);ctx.fillStyle=`${t.danger}20`;ctx.fillRect(x-8*scale,upper-37,16*scale,h);ctx.font=`${Math.round(10*scale)}px system-ui`;ctx.textAlign='center';ctx.fillStyle=t.danger;ctx.fillText('HOLD',x,upper-48)}
    else if(desc.type==='rest'){const y=H*.54;ctx.shadowBlur=20;ctx.shadowColor='#fff';ctx.strokeStyle='rgba(255,255,255,.82)';ctx.lineWidth=2*scale;ctx.beginPath();ctx.arc(x,y,26*scale,0,TAU);ctx.stroke();ctx.font=`${Math.round(10*scale)}px system-ui`;ctx.textAlign='center';ctx.fillStyle='#fff';ctx.fillText('WAIT',x,y-38*scale)}ctx.restore()}
  function drawObstacles(t){const pending=state.pending[0];if(pending){const late=(performance.now()-pending.beatAt)/state.beatMs;drawObstacleShape(pending.desc,timingX()-late*(W-timingX())*.82,t,1)}const a=descriptorForBeat(state.beatIndex+1),b=descriptorForBeat(state.beatIndex+2);drawObstacleShape(a,obstacleX(1-state.beatPhase),t,1);drawObstacleShape(b,obstacleX(2-state.beatPhase),t,.7)}
  function drawPulse(t){const x=playerX(),y=lerp(laneY(-1),laneY(1),state.laneVisual),beatPulse=1+Math.pow(1-state.beatPhase,5)*.5+state.visualKick*.18,holdBoost=state.held?1.35:1;state.trails.unshift({x,y,life:1});state.trails=state.trails.slice(0,18).map(v=>({...v,life:v.life*.84}));ctx.save();state.trails.forEach((v,i)=>{ctx.globalAlpha=v.life*.24;ctx.fillStyle=t.trail;ctx.beginPath();ctx.arc(v.x-i*5,v.y,Math.max(1,6*v.life),0,TAU);ctx.fill()});ctx.globalAlpha=1;ctx.shadowBlur=28+state.visualBass*22+(state.held?16:0);ctx.shadowColor=t.accent;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,7*beatPulse*holdBoost,0,TAU);ctx.fill();ctx.fillStyle=t.accent;ctx.beginPath();ctx.arc(x,y,4*beatPulse*holdBoost,0,TAU);ctx.fill();if(state.held){ctx.strokeStyle=t.accent;ctx.lineWidth=2;ctx.globalAlpha=.6;ctx.beginPath();ctx.arc(x,y,15+Math.sin(performance.now()/70)*3,0,TAU);ctx.stroke()}ctx.restore()}
  function drawParticles(){ctx.save();for(const p of state.particles){ctx.globalAlpha=p.life;ctx.fillStyle=p.color;ctx.shadowBlur=8;ctx.shadowColor=p.color;ctx.fillRect(p.x,p.y,p.size,p.size)}ctx.restore()}
  function drawGlitch(){if(state.nearMiss<=0)return;ctx.save();ctx.globalAlpha=state.nearMiss*.16;for(let i=0;i<4;i++){const y=Math.random()*H,h=rand(2,10),dx=rand(-16,16);ctx.drawImage(canvas,0,y*DPR,canvas.width,h*DPR,dx,y,W,h)}ctx.restore()}

  let lastFrame=performance.now(); function frame(now){const dt=Math.min(.033,(now-lastFrame)/1000);lastFrame=now;update(dt,now);draw();requestAnimationFrame(frame)}

  ui.modeChips.forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();selectedMode=b.dataset.mode;updateMenu()}));
  ui.practiceChips.forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();selectedPractice=b.dataset.practice;updateMenu()}));
  ui.themeButton.addEventListener('click',e=>{e.stopPropagation();cycleTheme()});
  ui.startButton.addEventListener('click',e=>{e.stopPropagation();resetRun(performance.now())});
  ui.retryButton.addEventListener('click',e=>{e.stopPropagation();resetRun(performance.now())});
  ui.deathMenu.addEventListener('click',e=>{e.stopPropagation();goMenu()});
  ui.menuMini.addEventListener('click',e=>{e.stopPropagation();goMenu()});
  ui.mute.addEventListener('click',e=>{e.stopPropagation();muted=!muted;localStorage.setItem(SETTINGS_KEY,JSON.stringify({muted}));ui.mute.textContent=muted?'×':'♪';emit('mute',{muted});emit('audio-unlock')});
  canvas.addEventListener('pointerdown',pointerDown,{passive:false});canvas.addEventListener('pointerup',pointerUp,{passive:false});canvas.addEventListener('pointercancel',pointerCancel,{passive:false});canvas.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('keydown',e=>{if(e.code!=='Space'||e.repeat)return;e.preventDefault();pointerDown(e)});document.addEventListener('keyup',e=>{if(e.code==='Space')pointerUp(e)});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.mode==='playing'&&state.runMode!=='practice')die('RHYTHM LOST')});window.addEventListener('resize',resize);window.addEventListener('orientationchange',resize);

  refreshUnlocks(false); applyTheme('neon'); ui.mute.textContent=muted?'×':'♪'; resize(); updateMenu(); updateUI(); requestAnimationFrame(frame);
  if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
