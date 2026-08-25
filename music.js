(() => {
  'use strict';

  const SETTINGS_KEY='one-more-beat-settings-v1';
  const ROOTS={neon:55,pulse:49,afterburn:61.735,blackout:46.249,redline:65.406};
  const SCALES={
    neon:[1,1.12246,1.33484,1.49831,1.7818,2],
    pulse:[1,1.1892,1.33484,1.5874,1.7818,2],
    afterburn:[1,1.12246,1.2599,1.49831,1.68179,2],
    blackout:[1,1.1892,1.4142,1.49831,1.7818,2],
    redline:[1,1.12246,1.33484,1.5874,1.88775,2]
  };
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

  class AdaptiveMusic {
    constructor(){
      this.ctx=null;this.master=null;this.musicBus=null;this.fxBus=null;this.comp=null;this.noise=null;
      this.muted=false;this.running=false;this.theme='neon';this.performance=.76;this.phase='intro';this.intensity=0;this.doubleMode=false;
      this.lastBeat=0;this.scar=0;this.pressHum=null;this.syncMuted();this.bind();
    }
    syncMuted(){try{this.muted=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}').muted===true}catch(_){this.muted=false}}
    bind(){
      window.addEventListener('omb:audio-unlock',()=>this.ensure());
      window.addEventListener('omb:mute',e=>{this.muted=!!e.detail.muted;this.applyMute()});
      window.addEventListener('omb:theme',e=>{this.theme=e.detail.themeId||'neon'});
      window.addEventListener('omb:state',e=>this.onState(e.detail));
      window.addEventListener('omb:beat',e=>this.onBeat(e.detail));
      window.addEventListener('omb:input',e=>this.onInput(e.detail));
      window.addEventListener('omb:result',e=>this.onResult(e.detail));
      window.addEventListener('omb:milestone',e=>this.onMilestone(e.detail));
      window.addEventListener('omb:death',()=>this.cutToSilence());
    }
    ensure(){
      if(this.ctx){if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});return}
      const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
      this.ctx=new AC();
      this.master=this.ctx.createGain();this.musicBus=this.ctx.createGain();this.fxBus=this.ctx.createGain();this.comp=this.ctx.createDynamicsCompressor();
      this.master.gain.value=this.muted?0:.46;this.musicBus.gain.value=.86;this.fxBus.gain.value=.78;
      this.comp.threshold.value=-17;this.comp.knee.value=16;this.comp.ratio.value=5;this.comp.attack.value=.004;this.comp.release.value=.16;
      this.musicBus.connect(this.comp);this.fxBus.connect(this.comp);this.comp.connect(this.master);this.master.connect(this.ctx.destination);
      const b=this.ctx.createBuffer(1,this.ctx.sampleRate*.6,this.ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;this.noise=b;
    }
    applyMute(){if(!this.ctx||!this.master)return;const t=this.ctx.currentTime;this.master.gain.cancelScheduledValues(t);this.master.gain.setTargetAtTime(this.muted?0:(this.running?.46:.0001),t,.02)}
    wake(){this.ensure();if(!this.ctx||!this.master)return;this.running=true;const t=this.ctx.currentTime;this.master.gain.cancelScheduledValues(t);this.master.gain.setValueAtTime(Math.max(.0001,this.master.gain.value),t);this.master.gain.exponentialRampToValueAtTime(this.muted?.0001:.46,t+.08)}
    cutToSilence(){if(!this.ctx||!this.master)return;this.running=false;const t=this.ctx.currentTime;this.master.gain.cancelScheduledValues(t);this.master.gain.setValueAtTime(Math.max(.0001,this.master.gain.value),t);this.master.gain.exponentialRampToValueAtTime(.0001,t+.025)}
    onState(d){this.theme=d.themeId||this.theme;this.performance=d.performance??this.performance;this.phase=d.phase||'intro';this.intensity=d.intensity||0;this.doubleMode=!!d.doubleMode;if(d.kind==='start')this.wake()}
    root(oct=1){return(ROOTS[this.theme]||55)*oct}
    note(step,oct=1){const s=SCALES[this.theme]||SCALES.neon;return this.root(oct)*s[((step%s.length)+s.length)%s.length]}
    tone(freq,dur,gain=.06,type='sine',when=0,bus='music',end=null,detune=0){
      if(!this.ctx||this.muted)return;const t=this.ctx.currentTime+when,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(Math.max(20,freq),t);o.detune.value=detune;if(end)o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+dur);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),t+.006);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g);g.connect(bus==='fx'?this.fxBus:this.musicBus);o.start(t);o.stop(t+dur+.03)
    }
    noiseHit(dur=.05,gain=.03,when=0,filter=6000,type='highpass',bus='music'){
      if(!this.ctx||!this.noise||this.muted)return;const t=this.ctx.currentTime+when,s=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();s.buffer=this.noise;f.type=type;f.frequency.value=filter;g.gain.setValueAtTime(Math.max(.0002,gain),t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);s.connect(f);f.connect(g);g.connect(bus==='fx'?this.fxBus:this.musicBus);s.start(t);s.stop(t+dur+.02)
    }
    kick(g=.23,when=0){if(!this.ctx||this.muted)return;const t=this.ctx.currentTime+when,o=this.ctx.createOscillator(),gain=this.ctx.createGain();o.type='sine';o.frequency.setValueAtTime(142,t);o.frequency.exponentialRampToValueAtTime(43,t+.11);gain.gain.setValueAtTime(g,t);gain.gain.exponentialRampToValueAtTime(.0001,t+.17);o.connect(gain);gain.connect(this.musicBus);o.start(t);o.stop(t+.19)}
    snare(g=.09,when=0){this.noiseHit(.12,g,when,1700,'highpass');this.tone(185,.08,g*.34,'triangle',when)}
    hat(g=.035,when=0,open=false){this.noiseHit(open?.12:.04,g,when,6800,'highpass')}
    bass(step,g=.085,when=0){const f=this.note(step,.5);this.tone(f,.19,g,'sawtooth',when,'music',f*.78);this.tone(f,.24,g*.7,'sine',when)}
    arp(step,g=.035,when=0){const f=this.note(step,2);this.tone(f,.10,g,'triangle',when);this.tone(f*2,.065,g*.24,'sine',when+.012)}
    lead(step,g=.038,when=0){const f=this.note(step,4);this.tone(f,.16,g,'sawtooth',when,'music',f*.92);this.tone(f*1.005,.13,g*.35,'square',when+.008)}
    impact(){this.kick(.32);this.noiseHit(.36,.12,0,520,'lowpass','fx');this.tone(this.root(1),.42,.08,'sawtooth',0,'fx',this.root(.5))}
    riser(strength=.5){const dur=.16+.12*strength;this.noiseHit(dur,.025+.035*strength,0,2200+strength*2400,'bandpass');this.tone(this.root(2),dur,.018+.018*strength,'sawtooth',0,'music',this.root(4))}
    wobble(){if(!this.ctx||this.muted)return;this.tone(this.root(1),.18,.045,'sawtooth',0,'fx',this.root(.72),-28);this.noiseHit(.11,.045,0,900,'bandpass','fx')}
    successChord(){const g=.024+.018*this.performance;[0,2,4].forEach((n,i)=>this.tone(this.note(n,2),.17,g,'triangle',i*.008,'fx'))}
    perfectSpark(){this.tone(this.note((this.lastBeat+2)%6,4),.07,.035,'sine',0,'fx');this.tone(this.note((this.lastBeat+4)%6,8),.045,.018,'triangle',.018,'fx')}
    onBeat(d){
      this.ensure();if(!this.ctx)return;this.wake();this.theme=d.themeId||this.theme;this.performance=d.performance??this.performance;this.phase=d.phase||this.phase;this.intensity=d.intensity||0;this.doubleMode=!!d.doubleMode;this.lastBeat=d.beatIndex||0;this.scar=Math.max(0,this.scar-.09);
      const beat=d.beatIndex||0,stage=this.intensity,build=this.phase==='build',drop=this.phase==='drop',boss=!!d.boss,rich=clamp(this.performance-this.scar,0,1),beatSec=60/Math.max(70,d.bpm||104);
      if(drop){this.impact()}
      const kickGain=build?.12:.19+(stage*.012)+(boss?.035:0)+(this.doubleMode?.03:0);this.kick(kickGain);
      if(stage>=1&&!build){const bassPattern=[0,0,3,0,4,3,0,2];this.bass(bassPattern[beat%8],.055+.045*rich+(this.doubleMode?.018:0))}
      if(stage>=2){if(beat%4===2||beat%4===0)this.snare(.055+.04*rich+(boss?.02:0));this.hat(.022+.022*rich,.03);if(beatSec>.22)this.hat(.017+.014*rich,beatSec*.5);if(stage>=4)this.hat(.014+.012*rich,beatSec*.25)}
      if(build){this.riser(clamp((beat%50-41)/8,0,1));if(beat%2===0)this.snare(.04)}
      if(stage>=3&&rich>.48&&!build){const p=[0,2,4,2,3,5,4,2];this.arp(p[beat%8],.022+.026*rich,.018);if(stage>=4)this.arp(p[(beat+2)%8],.015+.018*rich,beatSec*.5)}
      if(stage>=4&&rich>.7&&!build&&(beat%4===1||beat%4===3)){const lead=[4,5,3,4,2,5,4,3];this.lead(lead[beat%8],.022+.024*rich)}
      if(stage>=5&&!build){this.kick(.085,beatSec*.5);this.hat(.018+.016*rich,beatSec*.125);this.hat(.018+.016*rich,beatSec*.625)}
      if(boss&&!build){this.tone(this.note((beat*3)%6,4),.075,.018+.02*rich,'square',beatSec*.25);this.hat(.025,beatSec*.75)}
      if(this.doubleMode&&!build){this.kick(.075,beatSec*.5);this.arp((beat*2)%6,.022+.018*rich,beatSec*.25);this.hat(.02,beatSec*.75)}
    }
    onInput(d){this.ensure();if(!this.ctx||this.muted)return;this.theme=d.themeId||this.theme;if(d.kind==='tap'){this.tone(this.note((d.beat||0)%6,4),.045,.026,'square',0,'fx');this.noiseHit(.025,.018,0,7200,'highpass','fx')}else if(d.kind==='hold'){this.tone(this.root(2),.14,.025,'sawtooth',0,'fx',this.root(3))}}
    onResult(d){this.performance=d.performance??this.performance;this.theme=d.themeId||this.theme;if(d.quality==='perfect'){this.scar=Math.max(0,this.scar-.04);this.perfectSpark();if((d.perfectStreak||0)>0&&(d.perfectStreak||0)%8===0)this.successChord()}else if(d.quality==='near'){this.scar=clamp(this.scar+.13,0,.42);this.wobble()}else if(d.quality==='good'){this.scar=Math.max(0,this.scar-.01)}}
    onMilestone(d){this.ensure();if(!this.ctx)return;this.theme=d.themeId||this.theme;if(d.kind==='drop'){this.impact()}else if(d.kind==='boss-start'){this.tone(this.root(1),.32,.065,'sawtooth',0,'fx',this.root(2));this.snare(.1,.06)}else if(d.kind==='boss-clear'){this.successChord();this.impact()}else if(d.kind==='unlock'){[0,2,4,5].forEach((n,i)=>this.tone(this.note(n,2),.22,.04,'triangle',i*.07,'fx'))}else if(d.kind==='double'){[0,3,5,4].forEach((n,i)=>{this.kick(.13,i*.055);this.tone(this.note(n,4),.09,.027,'square',i*.055,'fx')})}else if(d.kind==='double-clear'){this.successChord()}}
  }

  new AdaptiveMusic();
})();
