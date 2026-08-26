from pathlib import Path
import re

path = Path('game.js')
s = path.read_text()
marker = 'DIAGONAL_HOLD_RAMP_V1'
if marker in s:
    raise SystemExit(0)

old = "tutorialLessonStartBeat:0,tutorialMissed:false};"
new = "tutorialLessonStartBeat:0,tutorialMissed:false,holdSlideFrom:0};"
if old not in s:
    raise SystemExit('state marker not found')
s = s.replace(old, new, 1)

old = "state.tutorialLesson=0;state.tutorialLessonStartBeat=0;state.tutorialMissed=false;"
new = "state.tutorialLesson=0;state.tutorialLessonStartBeat=0;state.tutorialMissed=false;state.holdSlideFrom=0;"
if old not in s:
    raise SystemExit('reset marker not found')
s = s.replace(old, new, 1)

old = "if(desc.type==='charge'){buzz(8);emit('input',{kind:'hold',beat,error:Math.abs(now-beatTimeFor(beat)),bpm:state.bpm,themeId:state.themeId})}"
new = "if(desc.type==='charge'){state.holdSlideFrom=state.laneVisual;buzz(8);emit('input',{kind:'hold',beat,error:Math.abs(now-beatTimeFor(beat)),bpm:state.bpm,themeId:state.themeId})}"
if old not in s:
    raise SystemExit('pointerDown charge marker not found')
s = s.replace(old, new, 1)

old = "if(state.pressExpected==='charge')emit('input',{kind:'hold-release',beat,duration:Math.max(0,now-state.pressStarted),bpm:state.bpm,themeId:state.themeId});"
new = "if(state.pressExpected==='charge'){const holdDuration=Math.max(0,now-state.pressStarted);emit('input',{kind:'hold-release',beat,duration:holdDuration,bpm:state.bpm,themeId:state.themeId});if(holdDuration>=45)state.lane=1;}"
if old not in s:
    raise SystemExit('pointerUp charge marker not found')
s = s.replace(old, new, 1)

ramp_func = r"""function drawObstacleShape(desc,x,t,alpha=1){
    if(!desc||desc.type==='none'||x<-110||x>W+130)return;
    const scale=lerp(.68,1.15,clamp(1-(x-timingX())/W,0,1)),tm=performance.now()/1000;
    ctx.save();ctx.globalAlpha=alpha;
    if(desc.type==='tap'){
      const y=H*.54,r=25*scale,rot=tm*2.6+state.beatPhase*.7;
      ctx.translate(x,y);ctx.rotate(rot);ctx.shadowBlur=24;ctx.shadowColor=t.secondary;ctx.strokeStyle=t.secondary;ctx.lineWidth=4*scale;
      ctx.beginPath();ctx.moveTo(0,-r);ctx.lineTo(r,0);ctx.lineTo(0,r);ctx.lineTo(-r,0);ctx.closePath();ctx.stroke();
      ctx.globalAlpha*=.35;ctx.rotate(-rot*1.8);ctx.strokeRect(-r*.55,-r*.55,r*1.1,r*1.1);
    }else if(desc.type==='charge'){
      const upper=laneY(-1)-52,lower=laneY(1)+52,dx=58*scale,thick=11*scale,pulse=.62+.38*Math.sin(tm*7-state.beatPhase*2.5);
      ctx.shadowBlur=24+14*pulse;ctx.shadowColor=t.danger;ctx.lineWidth=(3.2+1.8*pulse)*scale;
      const glass=ctx.createLinearGradient(x-dx,upper,x+dx,lower);
      glass.addColorStop(0,hexA(t.danger,.10+.06*pulse));glass.addColorStop(.48,hexA(t.danger,.20+.09*pulse));glass.addColorStop(1,hexA(t.secondary,.08+.05*pulse));
      ctx.fillStyle=glass;ctx.strokeStyle=hexA(t.danger,.88);
      ctx.beginPath();ctx.moveTo(x-dx-thick,upper);ctx.lineTo(x-dx+thick,upper);ctx.lineTo(x+dx+thick,lower);ctx.lineTo(x+dx-thick,lower);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.shadowBlur=8;ctx.lineWidth=1.2*scale;
      for(let i=0;i<5;i++){
        const q=((tm*1.7+i/5)%1),yy=lerp(upper,lower,q),xx=lerp(x-dx,x+dx,q);
        ctx.globalAlpha=alpha*(.18+.30*pulse)*(1-Math.abs(q-.5)*.7);ctx.strokeStyle=hexA('#ffffff',.7);
        ctx.beginPath();ctx.moveTo(xx-15*scale,yy-12*scale);ctx.lineTo(xx+15*scale,yy+12*scale);ctx.stroke();
      }
      ctx.globalAlpha=alpha*.34;ctx.strokeStyle=hexA(t.secondary,.8);ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(x-dx,upper);ctx.lineTo(x+dx,lower);ctx.stroke();
    }else if(desc.type==='rest'){
      const y=H*.54,breathe=1+.12*Math.sin(tm*3.2),r=26*scale*breathe;
      ctx.shadowBlur=18+8*breathe;ctx.shadowColor='#fff';ctx.strokeStyle='rgba(255,255,255,.82)';ctx.lineWidth=2*scale;
      ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();ctx.globalAlpha*=.25;ctx.beginPath();ctx.arc(x,y,r+9,0,TAU);ctx.stroke();
    }
    ctx.restore();
  }"""

pattern = re.compile(r"function drawObstacleShape\(desc,x,t,alpha=1\)\{.*?\n  function drawObstacles", re.S)
m = pattern.search(s)
if not m:
    raise SystemExit('drawObstacleShape function not found')
s = s[:m.start()] + ramp_func + "\n  function drawObstacles" + s[m.end():]

pulse_func = r"""function drawPulse(t){
    let x=playerX();
    const normalY=lerp(laneY(-1),laneY(1),state.laneVisual),activeSlide=state.held&&state.pressExpected==='charge';
    let y=normalY,slideP=0;
    if(activeSlide){
      slideP=clamp((performance.now()-state.pressStarted)/Math.max(1,state.beatMs*.74),0,1);
      const eased=slideP*slideP*(3-2*slideP),startY=lerp(laneY(-1),laneY(1),state.holdSlideFrom),endY=laneY(1)+clamp(H*.025,10,22);
      y=lerp(startY,endY,eased);x+=Math.sin(eased*Math.PI)*7;
    }
    const beatPulse=1+Math.pow(1-state.beatPhase,5)*.5+state.visualKick*.18,holdBoost=state.held?1.35:1;
    state.trails.unshift({x,y,life:1});state.trails=state.trails.slice(0,18).map(v=>({...v,life:v.life*.84}));ctx.save();
    state.trails.forEach((v,i)=>{ctx.globalAlpha=v.life*.24;ctx.fillStyle=t.trail;ctx.beginPath();ctx.arc(v.x-i*5,v.y,Math.max(1,6*v.life),0,TAU);ctx.fill()});
    ctx.globalAlpha=1;ctx.shadowBlur=28+state.visualBass*22+(state.held?16:0);ctx.shadowColor=activeSlide?t.danger:t.accent;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,7*beatPulse*holdBoost,0,TAU);ctx.fill();ctx.fillStyle=activeSlide?t.danger:t.accent;ctx.beginPath();ctx.arc(x,y,4*beatPulse*holdBoost,0,TAU);ctx.fill();
    if(state.held){ctx.strokeStyle=activeSlide?t.danger:t.accent;ctx.lineWidth=2;ctx.globalAlpha=.6;ctx.beginPath();ctx.arc(x,y,15+Math.sin(performance.now()/70)*3,0,TAU);ctx.stroke()}
    if(activeSlide){ctx.globalAlpha=.72;ctx.strokeStyle=t.secondary;ctx.lineWidth=2;ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(x-16,y-16);ctx.lineTo(x+17,y+17);ctx.stroke();ctx.setLineDash([])}
    ctx.restore();
  }"""

pattern = re.compile(r"function drawPulse\(t\)\{.*?\n  function drawParticles", re.S)
m = pattern.search(s)
if not m:
    raise SystemExit('drawPulse function not found')
s = s[:m.start()] + pulse_func + "\n  function drawParticles" + s[m.end():]

s = s.replace("\n})();", f"\n  // {marker}\n})();", 1)
path.write_text(s)
