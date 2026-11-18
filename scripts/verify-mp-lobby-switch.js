'use strict';
// Multiplayer lobby map changes and what the guest sees, over a local relay (host + guest pages, two AI seats).
// Match 1: with the guest in the lobby the host regenerates the map, changes the map dialog and closes it unapplied, then
// applies another shape; the match launches on that shape and both players get the same map. Then two units fight where
// both look, a host unit against one of the guest's (with fog a guest rightly sees no shots at a fight it cannot see):
// the guest draws gunfire too (it runs no simulation and used to draw none; it also culled shots to the view of the last
// game the page had simulated itself). Regenerate used to leave the
// preview never "ready" (the room's echo put the old seed back) and an unapplied dialog made Launch refuse.
// Match 2: the guest cannot load the host's map: it lands on the main menu (it used to sit on a black screen) and the
// host's AI takes its seat.
const H=require('./lib/harness');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict'),{fork}=require('child_process');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/mp-lobby-switch');fs.mkdirSync(OUT,{recursive:true});
const dataDir=fs.mkdtempSync(path.join(OUT,'relay-'));let relay,relayPort,relayLog='';
const server=H.createStaticServer({rewrite:(p,b)=>p==='/index.html'?H.injectHead(b,"<script>window.WOD_MP_WS_URL='ws://127.0.0.1:"+relayPort+"';</script>"):undefined});
const harness=path.join(OUT,'relay.cjs');fs.writeFileSync(harness,`require(${JSON.stringify(path.join(ROOT,'server/index.js'))});`);
async function startRelay(){const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));relayPort=probe.address().port;await new Promise(r=>probe.close(r));
 relay=fork(harness,[],{cwd:ROOT,env:{...process.env,PORT:String(relayPort),DATABASE_URL:'',STEAM_PURCHASES_ENABLED:'0',WOD_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe','ipc']});
 relay.stdout.on('data',b=>relayLog+=b);relay.stderr.on('data',b=>relayLog+=b);
 for(let i=0;i<100&&!/listening|ws:\/\/|port/i.test(relayLog);i++)await new Promise(r=>setTimeout(r,100));}
const errors=[];let browser,url;
async function client(name){const context=await browser.newContext({viewport:{width:1280,height:800}});await context.addInitScript(ws=>window.WOD_MP_WS_URL=ws,'ws://127.0.0.1:'+relayPort);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(name+': '+e.message));
 await page.goto(url+'/');await page.waitForFunction(()=>typeof wodProgress==='object'&&WodMultiplayer.api.registered,null,{timeout:60000});
 await page.evaluate(name=>{wodDismissChangelogPopup();showPanel('multiplayer');wodMpWireLobbyUi();document.getElementById('mpDisplayName').value=name;wodProgress.profile.mpDisplayName=name;void wodMpRegisterWithServer();},name);
 await page.waitForFunction(name=>wodProgress.profile.mpDisplayName===name&&WodMultiplayer.api.registered,name);
 await page.evaluate(()=>{window.__notes=[];const sn=showNotification;showNotification=function(m){window.__notes.push(String(m).slice(0,160));return sn.apply(this,arguments);};});
 return{context,page};}
async function lobby(tag){
 const host=await client('Host '+tag),guest=await client('Guest '+tag);
 const code=await host.page.evaluate(async tag=>{await WodMultiplayer.createLobby({name:'Switch '+tag,meta:{seatTypes:['human','human','bot','bot'],gamePeriod:'modern'}});return WodMultiplayer.api.code;},tag);
 await guest.page.evaluate(code=>WodMultiplayer.joinLobby(code,{playerId:wodEnsurePlayerId()}),code);
 await host.page.waitForTimeout(800);
 await host.page.evaluate(()=>{const built=wodMpBuildLobbyMetaFromSetup();Object.assign(window.wodMpRoomMeta,built);wodMpEnsureDefaultSeatTypes(window.wodMpRoomMeta);window.wodMpRoomMeta.seatTypes=['human','human','bot','bot'];WodMultiplayer.sendLobbyMeta(window.wodMpRoomMeta);});
 await host.page.waitForTimeout(1500);
 await host.page.evaluate(()=>wodMpRefreshLobbyMapPreview({force:true}));
 await ready(host);return{host,guest};}
const ready=c=>c.page.waitForFunction(()=>!wodIsMapPreviewGenerating()&&wodMpCommittedIsCurrentForMeta(window.wodMpRoomMeta),null,{timeout:180000,polling:500});
const launched=async(host,guest)=>{await host.page.evaluate(()=>document.getElementById('mpBtnGlLaunch').click());
 for(let i=0;i<40;i++){await host.page.waitForTimeout(2000);const s=await Promise.all([host,guest].map(c=>c.page.evaluate(()=>({playing:gameState==='PLAYING'&&!!gameData.mp?.enabled&&wodMpMatchCanPlay(),menu:!UI.mainMenu.classList.contains('hidden')}))));
  if(s[0].playing&&(s[1].playing||s[1].menu))return s;}return null;};
const sig=page=>page.evaluate(()=>({n:gameData.hexList.length,shape:gameData.mapShape,sig:gameData.hexList.filter((h,i)=>i%53===0).map(h=>h.type[0]+h.owner).join('')}));
(async()=>{
 await startRelay();await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;browser=await H.launchBrowser();
 const res={};
 try{
  // match 1
  const {host,guest}=await lobby('one');
  await host.page.evaluate(()=>document.getElementById('mpBtnGlRegenMap').click());await host.page.waitForTimeout(1500);await ready(host);
  await host.page.evaluate(()=>{document.getElementById('mpBtnGlMap').click();document.getElementById('mpCfgMapShape').value='archipelago';document.getElementById('mpCfgMapClose').click();});
  const target=await host.page.evaluate(()=>window.wodMpRoomMeta.mapShape==='rectangle'?'continents':'rectangle');
  await host.page.evaluate(t=>{document.getElementById('mpBtnGlMap').click();document.getElementById('mpCfgMapShape').value=t;document.getElementById('mpCfgMapApply').click();},target);
  await host.page.waitForTimeout(1500);await ready(host);
  const st=await launched(host,guest);res.launch=!!st&&st[1].playing;
  const [hs,gs]=await Promise.all([sig(host.page),sig(guest.page)]);res.map={target,host:hs.shape,guest:gs.shape,same:hs.sig===gs.sig&&hs.n===gs.n};
  await host.page.waitForTimeout(2000);
  const spot=await host.page.evaluate(()=>{const me=wodLocalPlayerOwner(),a=gameData.entities.find(u=>u.owner===me&&isLandArmyUnit(u)),guestSlot=(gameData.mp.humanSlots||[]).find(x=>x!==me),b=gameData.entities.filter(u=>u.hp>0&&isLandArmyUnit(u)&&u.owner===guestSlot&&wodIsHostileOwner(u.owner,me)).sort((x,y)=>Math.hypot(x.x-a.x,x.y-a.y)-Math.hypot(y.x-a.x,y.y-a.y))[0];
   if(!a||!b)return null;b.x=b._drawX=a.x+30;b.y=b._drawY=a.y;for(const u of [a,b]){u.target=null;u.path=null;u.orderTarget=null;u.maxHp*=5;u.hp=u.maxHp;}return{x:a.x,y:a.y,a:a.uid,b:b.uid};});
  const look=page=>page.evaluate(s=>{const z=gameData.camera.zoom||1;gameData.camera.x=s.x*z-innerWidth/2;gameData.camera.y=s.y*z-innerHeight/2;return (gameData._combatFx||[]).filter(f=>f.kind==='tracer').length;},spot);
  // a page that simulated a game before (a solo skirmish) holds that game's view rectangle for culling shots: put it far away
  await guest.page.evaluate(()=>{gameData._combatCamBounds={l:-1e6,r:-1e6+10,t:-1e6,b:-1e6+10};window.__frames=0;window.__snaps=0;window.__snapEv=0;addEventListener('wod-mp-Snap',()=>window.__snapEv++);const ap=wodMpApplySnapPayload;wodMpApplySnapPayload=function(){window.__snaps++;window.__snapAt=performance.now();return ap.apply(this,arguments);};const tick=()=>{window.__frames++;requestAnimationFrame(tick);};requestAnimationFrame(tick);});
  let hostShots=0,guestShots=0;for(let i=0;i<24;i++){await host.page.waitForTimeout(250);if(await look(host.page))hostShots++;if(await look(guest.page))guestShots++;}
  res.gunfire={hostShots,guestShots};
  // what the guest saw of the two units (for a failure): frames drawn while sampling, speed, their distance and fight fields
  res.gunfireGuest=await guest.page.evaluate(s=>{const f=id=>gameData.entities.find(e=>e.uid===id),a=f(s.a),b=f(s.b),v=u=>u&&{hp:Math.round(u.hp),target:u.combatTargetUid,visual:Math.round((u.activeCombatVisual||0)*100)/100,timer:u._guestShotTimer};
   return{frames:window.__frames,state:gameState,speed:gameData.speed,distance:a&&b?Math.round(Math.hypot(a.x-b.x,a.y-b.y)):null,a:v(a),b:v(b),fx:(gameData._combatFx||[]).length,owners:[a?.owner,b?.owner],fog:wodFogActive(),snaps:window.__snaps,snapEvents:window.__snapEv,rafPending:typeof _wodMpClientSnapRaf!=='undefined'?_wodMpClientSnapRaf:'?',loading:!!gameData._mpLoadingMatch,isHost:!!gameData.mp?.isHost,mp:!!gameData.mp?.enabled,connected:typeof WodMultiplayer!=='undefined'&&!!WodMultiplayer.api.connected,slot:gameData.mp?.localSlot,snapAge:window.__snapAt?Math.round(performance.now()-window.__snapAt):null};},spot);
  await guest.page.screenshot({path:path.join(OUT,'guest-fight.png')});
  await host.context.close();await guest.context.close();
  // match 2
  const two=await lobby('two');
  await two.guest.page.evaluate(()=>{window.wodMpApplyMatchStartPayload=async()=>{throw new Error('verify: load fails');};});
  await launched(two.host,two.guest);await two.host.page.waitForTimeout(3000);
  res.fail={guest:await two.guest.page.evaluate(()=>({menu:!UI.mainMenu.classList.contains('hidden'),inGame:UI.inGameUI.style.display,state:gameState,note:(window.__notes||[]).slice(-1)[0]||''})),
   host:await two.host.page.evaluate(()=>({playing:gameState==='PLAYING',forfeited:[...(gameData.mp?.forfeitedSlots||[])]}))};
  await two.guest.page.screenshot({path:path.join(OUT,'guest-after-failed-load.png')});
  console.log(JSON.stringify(res));
  assert(res.launch,'the match launches after regenerating, an unapplied dialog and a new shape');
  assert(res.map.same&&res.map.host===res.map.target&&res.map.guest===res.map.target,'both players get the new map: '+JSON.stringify(res.map));
  assert(res.gunfire.hostShots>=6&&res.gunfire.guestShots>=6,'the guest draws gunfire as the host does: '+JSON.stringify(res.gunfire)+' guest view '+JSON.stringify(res.gunfireGuest));
  assert(res.fail.guest.menu&&res.fail.guest.inGame==='none'&&res.fail.guest.state==='MENU'&&/left the match/.test(res.fail.guest.note),'a guest that cannot load lands on the menu: '+JSON.stringify(res.fail.guest));
  assert(res.fail.host.playing&&res.fail.host.forfeited.length===1,'the host plays on, the AI on that seat: '+JSON.stringify(res.fail.host));
  const real=errors.filter(e=>!/verify: load fails/.test(e));assert.equal(real.length,0,real.join('\n'));
 }finally{await browser.close();relay.kill();server.close();}
 process.exit(0);
})().catch(e=>{console.error(e);console.log(relayLog.slice(-600));process.exit(1);});
