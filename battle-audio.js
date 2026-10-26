/* Local field recordings; generated with ElevenLabs Sound Effects v3 and mastered offline. */
(() => {
  'use strict';
  const ERAS=['modern','napoleonic','medieval','ancient'];
  const KINDS=['battle','battle-alt','construction','mobilize','complete','select-light','select-light-alt','select-marine','select-heavy','select-ship','move-light','move-light-alt','move-marine','move-heavy','move-ship'];
  const REVISION='era-move-orders-v1';
  let context,master,scene,lastTick=0,lastWork=-10000,lastCue=-10000,generation=0;
  const buffers=new Map(),loading=new Map(),seen=new Set(),shots=new Set();
  let oldJobs=new Map(),activeEra=null,selectionToken=0,lastSelection=-10000,lastMove=-10000,selectionVoice=null;
  const buses=new Set(),battles=new Map(),selectionVariants={},recentPlays=[];
  const plays={battle:0,mobilize:0,construction:0,complete:0,selection:0,move:0};
  function record(era,kind){recentPlays.push({era,kind});if(recentPlays.length>40)recentPlays.shift();}
  let volume=1,muted=false;
  try{volume=Math.max(0,Math.min(1,Number(localStorage.getItem('wodSfxVolume')??1)));muted=localStorage.getItem('wodSfxMuted')==='1';}catch(_){}
  if(!Number.isFinite(volume))volume=1;
  function syncUi(){
    document.querySelectorAll('.wod-sfx-vol').forEach(e=>e.value=Math.round(volume*100));
    document.querySelectorAll('.wod-sfx-vol-label').forEach(e=>e.textContent=Math.round(volume*100));
    document.querySelectorAll('.wod-sfx-mute').forEach(e=>e.checked=muted);
    if(master)master.gain.setTargetAtTime(muted?0:volume,context.currentTime,.08);
    if(muted||volume===0){stopBattle();window.wodMusic?.setCommandPresence?.(0);}
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
      if(scene&&ERAS.includes(scene.era))for(let kind of KINDS)load(scene.era,kind);
    }catch(_){}
  }
  document.addEventListener('pointerdown',unlock,{passive:true});document.addEventListener('keydown',unlock,{passive:true});
  function load(era,kind){
    if(!ERAS.includes(era)||!KINDS.includes(kind))return Promise.resolve(null);
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
  function retireBus(bus,immediate){
    bus.amp.gain.cancelScheduledValues(context.currentTime);
    if(immediate)bus.amp.gain.setValueAtTime(0,context.currentTime);
    else bus.amp.gain.setTargetAtTime(0,context.currentTime,.22);
    for(let voice of bus.voices)try{voice.stop(context.currentTime+(immediate ? .015 : 1));}catch(_){}
  }
  function stopBattle(immediate=false){
    duck(0);
    if(immediate)for(let bus of buses)retireBus(bus,true);
    else for(let bus of battles.values())retireBus(bus,false);
    battles.clear();
  }
  // Reciprocal fire shares one channel; two different opponent pairs always have separate channels.
  function collectEngagements(units){
    let alive=new Map((units||[]).filter(u=>u.uid&&u.hp!==0).map(u=>[u.uid,u])),pairs=new Map();
    for(let unit of alive.values()){
      let target=alive.get(unit.combatTargetUid);
      if(!target||target.uid===unit.uid||target.owner===unit.owner)continue;
      let ids=[unit.uid,target.uid].sort(),key=ids.join('|');
      if(!pairs.has(key))pairs.set(key,{key,participants:ids,x:(unit.x+target.x)/2,y:(unit.y+target.y)/2});
    }
    return [...pairs.values()];
  }
  function setEra(era){
    let valid=ERAS.includes(era),next=valid?era:null;
    if(next!==activeEra){
      generation++;selectionToken++;activeEra=next;stopBattle(true);
      for(let shot of shots)try{shot.stop();}catch(_){}
      selectionVoice=null;oldJobs.clear();seen.clear();lastSelection=-10000;lastMove=-10000;
    }
    return valid;
  }
  async function acknowledge(era,units,action){
    if(!setEra(era)||scene?.selectionEnabled===false||document.hidden||muted||volume===0)return false;
    let counts={};
    for(let unit of units||[]){const type=['transport','supply'].includes(unit.type)?'ship':unit.type;if(['light','marine','heavy','ship'].includes(type))counts[type]=(counts[type]||0)+1;}
    let type=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
    const now=performance.now();
    if(!type||now-(action==='move'?lastMove:lastSelection)<(action==='move'?130:180))return false;
    if(action==='move')lastMove=now;else lastSelection=now;
    let request=++selectionToken,token=generation;
    const variantKey=era+'/'+action;
    let variant=type==='light'?((selectionVariants[variantKey]||0)%2):0;
    let kind=(action==='move'?'move-':'select-')+type+(variant?'-alt':'');
    await unlock();
    if(!context||context.state!=='running')return false;
    let buffer=await load(era,kind);
    if(!buffer||request!==selectionToken||token!==generation||activeEra!==era||muted||volume===0||document.hidden)return false;
    selectionVariants[variantKey]=(selectionVariants[variantKey]||0)+(type==='light'?1:0);
    if(selectionVoice)try{selectionVoice.stop();}catch(_){}
    let src=context.createBufferSource(),amp=context.createGain();src.buffer=buffer;src._wodEra=era;src._wodSelection=true;
    const level=action==='move'?.78:.6;
    amp.gain.setValueAtTime(0,context.currentTime);amp.gain.linearRampToValueAtTime(level,context.currentTime+.012);
    amp.gain.setValueAtTime(level,context.currentTime+Math.max(.02,buffer.duration-.04));amp.gain.linearRampToValueAtTime(0,context.currentTime+buffer.duration);
    if(action==='move')window.wodMusic?.setCommandPresence?.(1200);
    src.connect(amp);amp.connect(master);shots.add(src);selectionVoice=src;plays[action]++;record(era,kind);
    src.onended=()=>{shots.delete(src);if(selectionVoice===src)selectionVoice=null;src.disconnect();amp.disconnect();};src.start();return true;
  }
  function scheduleBed(bus,buffer,start,offset=0){
    let src=context.createBufferSource(),fade=context.createGain(),duration=buffer.duration-offset;
    src.buffer=buffer;fade.gain.setValueAtTime(0,start);fade.gain.linearRampToValueAtTime(1,start+Math.min(2,duration/4));
    fade.gain.setValueAtTime(1,start+duration-2);fade.gain.linearRampToValueAtTime(0,start+duration);
    src.connect(fade);fade.connect(bus.amp);bus.voices.add(src);src.start(start,offset);
    src.onended=()=>{src.disconnect();fade.disconnect();bus.voices.delete(src);if(battles.get(bus.key)!==bus&&!bus.voices.size){bus.amp.disconnect();bus.filter.disconnect();bus.pan.disconnect();buses.delete(bus);}};
    bus.nextAt=start+duration-2;bus.variant=1-bus.variant;plays.battle++;record(bus.era,'battle');
  }
  function startBattle(era,pair){
    let hash=0;for(let c of pair.key)hash=((hash*31)+c.charCodeAt(0))>>>0;
    let variant=hash%2,buffer=buffers.get(era+'/'+(variant?'battle-alt':'battle'))||buffers.get(era+'/battle');
    if(!buffer)return null;
    let amp=context.createGain(),filter=context.createBiquadFilter(),pan=context.createStereoPanner();
    amp.gain.value=0;filter.type='lowpass';filter.Q.value=.5;filter.frequency.value=2200;
    amp.connect(filter);filter.connect(pan);pan.connect(master);
    let offset=((hash>>>1)%8000)/1000;
    offset=Math.min(offset,Math.max(0,buffer.duration-6));
    let bus={key:pair.key,participants:pair.participants,era,amp,filter,pan,voices:new Set(),variant,nextAt:0,targetGain:0,offset};
    battles.set(pair.key,bus);buses.add(bus);scheduleBed(bus,buffer,context.currentTime,offset);return bus;
  }
  async function oneShot(kind,point){
    if(!context||context.state!=='running'||muted||volume===0||!scene?.enabled||shots.size>=3)return;
    let token=generation,era=scene.era,pos=spatial(point);
    if(pos.gain<=0)return;
    let buffer=await load(era,kind);
    if(!buffer||token!==generation||!scene.enabled||scene.era!==era||muted||shots.size>=3)return;
    pos=spatial(point);if(pos.gain<=0)return;
    let src=context.createBufferSource(),amp=context.createGain(),filter=context.createBiquadFilter(),pan=context.createStereoPanner();
    src.buffer=buffer;src._wodEra=era;filter.type='lowpass';filter.frequency.value=pos.cutoff+1000;filter.Q.value=.5;
    amp.gain.value=pos.gain*({construction:.32,mobilize:.38,complete:.48}[kind]||.3);pan.pan.value=pos.pan;
    src.connect(amp);amp.connect(filter);filter.connect(pan);pan.connect(master);shots.add(src);plays[kind]++;record(era,kind);
    src.onended=()=>{shots.delete(src);src.disconnect();amp.disconnect();filter.disconnect();pan.disconnect();};src.start();
  }
  function update(s){
    scene=s;if(!setEra(s.era)){stopBattle(true);return;}
    if(context?.state==='running')for(let kind of KINDS)load(s.era,kind);
    if(!s.enabled||document.hidden){stopBattle();for(let shot of shots)if(!shot._wodSelection||!s.selectionEnabled||document.hidden)try{shot.stop();}catch(_){}return;}
    let now=performance.now();if(now-lastTick<100)return;lastTick=now;
    for(let unit of s.units){
      let pos=spatial(unit);
      if(unit.spawnFx>0&&!seen.has(unit.uid)){
        seen.add(unit.uid);
        if(now-lastCue>450&&pos.gain>0){lastCue=now;oneShot('mobilize',unit);}
      }
    }
    const pairs=collectEngagements(s.units).map(pair=>({...pair,pos:spatial(pair)})).filter(pair=>pair.pos.gain>0);
    const desired=new Set(pairs.map(pair=>pair.key));
    for(let[key,bus]of battles)if(!desired.has(key)){battles.delete(key);retireBus(bus,false);}
    let presence=0;
    // Power normalization keeps each fight independent without an increasingly deafening sum.
    let densityGain=1/Math.sqrt(Math.max(1,pairs.length));
    if(context?.state==='running'&&!muted&&volume>0){
      for(let pair of pairs){
        let bus=battles.get(pair.key)||startBattle(s.era,pair);if(!bus)continue;
        bus.targetGain=pair.pos.gain*.84*densityGain;
        bus.amp.gain.setTargetAtTime(bus.targetGain,context.currentTime,.25);
        bus.pan.pan.setTargetAtTime(pair.pos.pan,context.currentTime,.25);
        bus.filter.frequency.setTargetAtTime(pair.pos.cutoff,context.currentTime,.4);
        if(context.currentTime>=bus.nextAt-1){let buffer=buffers.get(s.era+'/'+(bus.variant?'battle-alt':'battle'))||buffers.get(s.era+'/battle');if(buffer)scheduleBed(bus,buffer,Math.max(context.currentTime,bus.nextAt));}
        presence=Math.max(presence,pair.pos.gain);
      }
      duck(presence);
    }else stopBattle();
    let jobs=new Map(s.jobs.map(j=>[j.key,j]));
    for(let[key,j]of oldJobs)if(!jobs.has(key)&&s.completed(j)&&now-lastCue>450){lastCue=now;oneShot('complete',j);}
    let work=s.jobs.filter(j=>!['light','marine','heavy','ship','transport','supply'].includes(j.mode)).sort((a,b)=>spatial(b).gain-spatial(a).gain)[0];
    if(work&&spatial(work).gain>0&&now-lastWork>9000){lastWork=now;oneShot('construction',work);}
    oldJobs=jobs;
  }
  function reset(){generation++;selectionToken++;lastSelection=-10000;lastMove=-10000;seen.clear();oldJobs.clear();lastCue=-10000;lastWork=-10000;stopBattle(true);for(let shot of shots)try{shot.stop();}catch(_){}}
  function bind(){
    document.querySelectorAll('.wod-sfx-vol').forEach(e=>e.addEventListener('input',()=>{volume=Number(e.value)/100;try{localStorage.setItem('wodSfxVolume',volume);}catch(_){}syncUi();}));
    document.querySelectorAll('.wod-sfx-mute').forEach(e=>e.addEventListener('change',()=>{muted=e.checked;try{localStorage.setItem('wodSfxMuted',muted?'1':'0');}catch(_){}syncUi();}));syncUi();
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
  window.wodBattleAudio={update,reset,spatial,selectUnits:(era,units)=>acknowledge(era,units,'selection'),moveUnits:(era,units)=>acknowledge(era,units,'move'),collectEngagements,debug:()=>({
    unlocked:context?.state==='running',era:scene?.era,playing:battles.size>0,volume,muted,loaded:buffers.size,plays:{...plays},recentPlays:recentPlays.slice(),
    audibleEras:[...new Set([...buses].filter(bus=>bus.amp.gain.value>0).map(bus=>bus.era).concat([...shots].map(voice=>voice._wodEra)))],
    gain:Math.max(0,...[...battles.values()].map(bus=>bus.amp.gain.value)),
    targetGain:Math.max(0,...[...battles.values()].map(bus=>bus.targetGain)),
    voices:[...battles.values()].reduce((sum,bus)=>sum+bus.voices.size,0),
    cutoff:Math.max(0,...[...battles.values()].map(bus=>bus.filter.frequency.value)),
    engagements:[...battles.values()].map(bus=>({key:bus.key,participants:bus.participants,gain:bus.amp.gain.value,targetGain:bus.targetGain,pan:bus.pan.pan.value,offset:bus.offset,voices:bus.voices.size}))
  })};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
