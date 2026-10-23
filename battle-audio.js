/* Local field recordings; generated with ElevenLabs Sound Effects v3 and mastered offline. */
(() => {
  'use strict';
  const ERAS=['modern','napoleonic','medieval','ancient'];
  const KINDS=['battle','battle-alt','construction','mobilize','complete'];
  const REVISION='field-v3-2';
  let context,master,scene,battle,lastTick=0,lastWork=-10000,lastCue=-10000,generation=0;
  const buffers=new Map(),loading=new Map(),seen=new Set(),shots=new Set();
  let oldJobs=new Map();
  const plays={battle:0,mobilize:0,construction:0,complete:0};
  let volume=.65,muted=false;
  try{volume=Math.max(0,Math.min(1,Number(localStorage.getItem('wodSfxVolume')??.65)));muted=localStorage.getItem('wodSfxMuted')==='1';}catch(_){}
  if(!Number.isFinite(volume))volume=.65;
  function syncUi(){
    document.querySelectorAll('.wod-sfx-vol').forEach(e=>e.value=Math.round(volume*100));
    document.querySelectorAll('.wod-sfx-vol-label').forEach(e=>e.textContent=Math.round(volume*100));
    document.querySelectorAll('.wod-sfx-mute').forEach(e=>e.checked=muted);
    if(master)master.gain.setTargetAtTime(muted?0:volume,context.currentTime,.08);
    if(muted||volume===0)stopBattle();
  }
  async function unlock(){
    try{
      if(!context){
        context=new(window.AudioContext||window.webkitAudioContext)();
        master=context.createGain();
        let limiter=context.createDynamicsCompressor();limiter.threshold.value=-10;limiter.knee.value=8;limiter.ratio.value=3;limiter.attack.value=.005;limiter.release.value=.2;
        master.connect(limiter);limiter.connect(context.destination);syncUi();
      }
      await context.resume();
    }catch(_){}
  }
  document.addEventListener('pointerdown',unlock,{passive:true});document.addEventListener('keydown',unlock,{passive:true});
  function load(era,kind){
    const key=era+'/'+kind;
    if(buffers.has(key))return Promise.resolve(buffers.get(key));
    if(!loading.has(key)){
      const promise=fetch('sounds/sfx/'+era+'-'+kind+'.mp3?v='+REVISION)
        .then(r=>{if(!r.ok)throw Error('Unavailable sound');return r.arrayBuffer();})
        .then(b=>context.decodeAudioData(b)).then(b=>{buffers.set(key,b);return b;})
        .catch(()=>{setTimeout(()=>loading.delete(key),15000);return null;});
      loading.set(key,promise);
    }
    return loading.get(key);
  }
  // A quiet overview floor preserves real combat cues at every zoom. Fog is filtered by the caller.
  function spatial(point,s=scene){
    if(!s?.enabled||document.hidden)return{gain:0,pan:0,cutoff:1800};
    let x=point.x*s.zoom-s.cameraX,y=point.y*s.zoom-s.cameraY;
    if(x<0||y<0||x>s.width||y>s.height)return{gain:0,pan:0,cutoff:1800};
    let distance=Math.min(1,Math.hypot((x-s.width/2)/(s.width*.71),(y-s.height/2)/(s.height*.71)));
    let proximity=Math.max(0,Math.min(1,(s.zoom-.2)/1.3));
    return{gain:(.68+.32*proximity)*(1-.72*distance),pan:Math.max(-.8,Math.min(.8,(x-s.width/2)/(s.width*.65))),cutoff:1800+3400*proximity};
  }
  function duck(presence){window.wodMusic?.setBattlePresence?.(muted?0:presence*volume/.65);}
  function stopBattle(){
    duck(0);
    if(!battle)return;
    const old=battle;battle=null;
    old.amp.gain.cancelScheduledValues(context.currentTime);
    old.amp.gain.setTargetAtTime(0,context.currentTime,.22);
    for(let voice of old.voices)try{voice.stop(context.currentTime+1);}catch(_){}
  }
  function scheduleBed(bus,buffer,start){
    let src=context.createBufferSource(),fade=context.createGain(),duration=buffer.duration;
    src.buffer=buffer;fade.gain.setValueAtTime(0,start);fade.gain.linearRampToValueAtTime(1,start+Math.min(2,duration/4));
    fade.gain.setValueAtTime(1,start+duration-2);fade.gain.linearRampToValueAtTime(0,start+duration);
    src.connect(fade);fade.connect(bus.amp);bus.voices.add(src);src.start(start);
    src.onended=()=>{src.disconnect();fade.disconnect();bus.voices.delete(src);if(bus!==battle&&!bus.voices.size){bus.amp.disconnect();bus.filter.disconnect();bus.pan.disconnect();}};
    bus.nextAt=start+duration-2;bus.variant=1-bus.variant;plays.battle++;
  }
  function startBattle(era){
    let buffer=buffers.get(era+'/battle');if(!buffer)return;
    let amp=context.createGain(),filter=context.createBiquadFilter(),pan=context.createStereoPanner();
    amp.gain.value=0;filter.type='lowpass';filter.Q.value=.5;filter.frequency.value=2200;
    amp.connect(filter);filter.connect(pan);pan.connect(master);
    battle={era,amp,filter,pan,voices:new Set(),variant:0,nextAt:0,lastHeard:performance.now(),lastUid:null,targetGain:0};
    scheduleBed(battle,buffer,context.currentTime);
  }
  async function oneShot(kind,point){
    if(!context||context.state!=='running'||muted||volume===0||!scene?.enabled||shots.size>=3)return;
    let token=generation,era=scene.era,pos=spatial(point);
    if(pos.gain<=0)return;
    let buffer=await load(era,kind);
    if(!buffer||token!==generation||!scene.enabled||scene.era!==era||muted||shots.size>=3)return;
    pos=spatial(point);if(pos.gain<=0)return;
    let src=context.createBufferSource(),amp=context.createGain(),filter=context.createBiquadFilter(),pan=context.createStereoPanner();
    src.buffer=buffer;filter.type='lowpass';filter.frequency.value=pos.cutoff+1000;filter.Q.value=.5;
    amp.gain.value=pos.gain*({construction:.32,mobilize:.38,complete:.48}[kind]||.3);pan.pan.value=pos.pan;
    src.connect(amp);amp.connect(filter);filter.connect(pan);pan.connect(master);shots.add(src);plays[kind]++;
    src.onended=()=>{shots.delete(src);src.disconnect();amp.disconnect();filter.disconnect();pan.disconnect();};src.start();
  }
  function update(s){
    scene=s;if(!ERAS.includes(s.era))s.era='modern';
    if(!s.enabled||document.hidden){stopBattle();for(let shot of shots)try{shot.stop();}catch(_){}return;}
    let now=performance.now();if(now-lastTick<100)return;lastTick=now;
    if(context?.state==='running')for(let kind of KINDS)load(s.era,kind);
    let strongest={gain:0,pan:0,cutoff:1800},heard=null;
    for(let unit of s.units){
      let pos=spatial(unit);
      if(unit.activeCombatVisual>0&&pos.gain>strongest.gain){strongest=pos;heard=unit;}
      if(unit.spawnFx>0&&!seen.has(unit.uid)){
        seen.add(unit.uid);
        if(now-lastCue>450&&pos.gain>0){lastCue=now;oneShot('mobilize',unit);}
      }
    }
    if(battle&&battle.era!==s.era)stopBattle();
    // Bridge short gaps between volleys without carrying sound through the fog or out of view.
    if(!heard&&battle&&now-battle.lastHeard<1400){
      let unit=s.units.find(u=>u.uid===battle.lastUid);
      if(unit){strongest=spatial(unit);strongest.gain*=.7;}
    }
    if(strongest.gain>0&&context?.state==='running'&&!muted&&volume>0){
      if(!battle)startBattle(s.era);
      if(battle){
        if(heard){battle.lastHeard=now;battle.lastUid=heard.uid;}
        let density=Math.min(1,s.units.filter(u=>u.activeCombatVisual>0&&spatial(u).gain>0).length/10);
        battle.targetGain=strongest.gain*(.8+.1*density);
        battle.amp.gain.setTargetAtTime(battle.targetGain,context.currentTime,.45);
        battle.pan.pan.setTargetAtTime(strongest.pan,context.currentTime,.7);
        battle.filter.frequency.setTargetAtTime(strongest.cutoff,context.currentTime,.6);
        if(context.currentTime>=battle.nextAt-1){let b=buffers.get(s.era+'/'+(battle.variant?'battle-alt':'battle'))||buffers.get(s.era+'/battle');if(b)scheduleBed(battle,b,Math.max(context.currentTime,battle.nextAt));}
        duck(Math.min(1,strongest.gain));
      }
    }else stopBattle();
    let jobs=new Map(s.jobs.map(j=>[j.key,j]));
    for(let[key,j]of oldJobs)if(!jobs.has(key)&&s.completed(j)&&now-lastCue>450){lastCue=now;oneShot('complete',j);}
    let work=s.jobs.filter(j=>!['light','marine','heavy','ship'].includes(j.mode)).sort((a,b)=>spatial(b).gain-spatial(a).gain)[0];
    if(work&&spatial(work).gain>0&&now-lastWork>9000){lastWork=now;oneShot('construction',work);}
    oldJobs=jobs;
  }
  function reset(){generation++;seen.clear();oldJobs.clear();lastCue=-10000;lastWork=-10000;stopBattle();for(let shot of shots)try{shot.stop();}catch(_){}}
  function bind(){
    document.querySelectorAll('.wod-sfx-vol').forEach(e=>e.addEventListener('input',()=>{volume=Number(e.value)/100;try{localStorage.setItem('wodSfxVolume',volume);}catch(_){}syncUi();}));
    document.querySelectorAll('.wod-sfx-mute').forEach(e=>e.addEventListener('change',()=>{muted=e.checked;try{localStorage.setItem('wodSfxMuted',muted?'1':'0');}catch(_){}syncUi();}));syncUi();
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
  window.wodBattleAudio={update,reset,spatial,debug:()=>({unlocked:context?.state==='running',era:scene?.era,playing:!!battle,volume,muted,loaded:buffers.size,plays:{...plays},gain:battle?.amp.gain.value||0,targetGain:battle?.targetGain||0,voices:battle?.voices.size||0,cutoff:battle?.filter.frequency.value||0})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
