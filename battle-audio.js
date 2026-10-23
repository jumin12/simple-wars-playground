/* Local ElevenLabs-generated effects. No service credentials are used at runtime. */
(() => {
  'use strict';
  const ERAS = ['modern','napoleonic','medieval','ancient'];
  let context, master, loop, scene, lastTick=0, lastWork=0, generation=0;
  const buffers=new Map(), loading=new Map(), seen=new Set();
  let oldJobs=new Map();
  const plays={battle:0,mobilize:0,construction:0};
  let volume=.65, muted=false;
  try { volume=Math.max(0,Math.min(1,Number(localStorage.getItem('wodSfxVolume') ?? .65))); muted=localStorage.getItem('wodSfxMuted')==='1'; } catch(_) {}
  if(!Number.isFinite(volume)) volume=.65;
  function syncUi() {
    document.querySelectorAll('.wod-sfx-vol').forEach(e=>e.value=Math.round(volume*100));
    document.querySelectorAll('.wod-sfx-vol-label').forEach(e=>e.textContent=Math.round(volume*100));
    document.querySelectorAll('.wod-sfx-mute').forEach(e=>e.checked=muted);
    if(master) master.gain.setTargetAtTime(muted?0:volume,context.currentTime,.08);
  }
  async function unlock() {
    try {
      if(!context) { context=new (window.AudioContext||window.webkitAudioContext)(); master=context.createGain(); master.connect(context.destination); syncUi(); }
      await context.resume();
    } catch(_) {}
  }
  document.addEventListener('pointerdown',unlock,{passive:true});
  document.addEventListener('keydown',unlock,{passive:true});
  function load(era,kind) {
    const key=era+'/'+kind;
    if(buffers.has(key)) return Promise.resolve(buffers.get(key));
    if(!loading.has(key)) loading.set(key,fetch('sounds/sfx/'+era+'-'+kind+'.mp3')
      .then(r=>{if(!r.ok)throw Error('Unavailable sound');return r.arrayBuffer();})
      .then(b=>context.decodeAudioData(b)).then(b=>{buffers.set(key,b);return b;}).catch(()=>null));
    return loading.get(key);
  }
  // Screen-space attenuation keeps offscreen and hidden battles silent.
  function spatial(point,s=scene) {
    if(!s?.enabled || document.hidden || s.zoom<.7) return {gain:0,pan:0};
    let x=point.x*s.zoom-s.cameraX, y=point.y*s.zoom-s.cameraY;
    if(x<0||y<0||x>s.width||y>s.height) return {gain:0,pan:0};
    let radius=Math.min(520,Math.max(220,Math.min(s.width,s.height)*.65));
    let distance=Math.hypot(x-s.width/2,y-s.height/2);
    return {gain:Math.max(0,1-distance/radius)*Math.min(1,(s.zoom-.55)/.75),pan:Math.max(-1,Math.min(1,(x-s.width/2)/(s.width/2)))};
  }
  function source(buffer,gain,pan,isLoop=false) {
    let src=context.createBufferSource(), amp=context.createGain(), stereo=context.createStereoPanner();
    src.buffer=buffer;src.loop=isLoop;amp.gain.value=gain;stereo.pan.value=pan;
    src.connect(amp);amp.connect(stereo);stereo.connect(master);src.start();
    if(!isLoop) src.onended=()=>{src.disconnect();amp.disconnect();stereo.disconnect();};
    return {src,amp,stereo};
  }
  function stopLoop() {
    if(!loop)return;
    const stopped=loop;loop=null;
    stopped.amp.gain.setTargetAtTime(0,context.currentTime,.12);
    stopped.src.stop(context.currentTime+.6);
    stopped.src.onended=()=>{stopped.src.disconnect();stopped.amp.disconnect();stopped.stereo.disconnect();};
  }
  async function oneShot(kind,point) {
    if(!context||context.state!=='running'||muted||!scene?.enabled)return;
    let era=scene.era, token=generation, pos=spatial(point);
    if(pos.gain<=0)return;
    let buffer=await load(era,kind);
    if(!buffer||generation!==token||scene.era!==era||!scene.enabled)return;
    pos=spatial(point);
    if(pos.gain>0){source(buffer,pos.gain*(kind==='construction'?.13:.22),pos.pan);plays[kind]++;}
  }
  function update(s) {
    scene=s;
    if(!ERAS.includes(s.era))s.era='modern';
    let now=performance.now();
    if(!s.enabled||document.hidden){stopLoop();return;}
    if(now-lastTick<100)return;lastTick=now;
    if(context&&context.state==='running') for(let k of ['battle','mobilize','construction'])load(s.era,k);
    let strongest={gain:0,pan:0};
    for(let u of s.units) {
      let pos=spatial(u);
      if(u.activeCombatVisual>0 && pos.gain>strongest.gain)strongest=pos;
      if(u.spawnFx>0&&!seen.has(u.uid)) {seen.add(u.uid);oneShot('mobilize',u);}
    }
    if(loop&&loop.era!==s.era)stopLoop();
    if(strongest.gain>0&&context?.state==='running'&&!muted) {
      let b=buffers.get(s.era+'/battle');
      if(!loop&&b){loop=source(b,0,strongest.pan,true);loop.era=s.era;plays.battle++;}
      if(loop){loop.amp.gain.setTargetAtTime(strongest.gain*.16,context.currentTime,.25);loop.stereo.pan.setTargetAtTime(strongest.pan,context.currentTime,.25);}
    } else stopLoop();
    let jobs=new Map(s.jobs.map(j=>[j.key,j]));
    for(let [key,j] of oldJobs)if(!jobs.has(key)&&s.completed(j))oneShot('construction',j);
    oldJobs=jobs;
    if(now-lastWork>6500) {
      let work=s.jobs.filter(j=>!['light','marine','heavy','ship'].includes(j.mode)).sort((a,b)=>spatial(b).gain-spatial(a).gain)[0];
      if(work&&spatial(work).gain>0){lastWork=now;oneShot('construction',work);}
    }
  }
  function reset(){generation++;seen.clear();oldJobs.clear();stopLoop();}
  function bind() {
    document.querySelectorAll('.wod-sfx-vol').forEach(e=>e.addEventListener('input',()=>{volume=Number(e.value)/100;try{localStorage.setItem('wodSfxVolume',volume);}catch(_){}syncUi();}));
    document.querySelectorAll('.wod-sfx-mute').forEach(e=>e.addEventListener('change',()=>{muted=e.checked;try{localStorage.setItem('wodSfxMuted',muted?'1':'0');}catch(_){}syncUi();}));syncUi();
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopLoop();});
  window.wodBattleAudio={update,reset,spatial,debug:()=>({unlocked:context?.state==='running',era:scene?.era,playing:!!loop,volume,muted,loaded:buffers.size,plays:{...plays},gain:loop?.amp.gain.value||0})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
