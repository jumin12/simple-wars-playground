'use strict';
// node scripts/probe-mp-guest.js [seconds] — a real two-human multiplayer match over a local relay (host + guest
// browser pages, two AI seats). Measures what the guest sees: frame times, snapshot gaps and apply times, snapshot
// size, how far drawn units lag their true positions, and whether the guest's own recruit finishes its build
// animation. Screenshots of both screens go to output/mp-guest-probe/.
const H=require('./lib/harness');
const http=require('http'),fs=require('fs'),path=require('path'),{fork}=require('child_process');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/mp-guest-probe');fs.mkdirSync(OUT,{recursive:true});
const SECONDS=Number(process.argv[2]||40);
const dataDir=fs.mkdtempSync(path.join(OUT,'relay-'));let relay,relayPort,relayLog='';
const server=H.createStaticServer({rewrite:(p,b)=>p==='/index.html'?H.injectHead(b,"<script>window.WOD_MP_WS_URL='ws://127.0.0.1:"+relayPort+"';</script>"):undefined});
const harness=path.join(OUT,'relay.cjs');fs.writeFileSync(harness,`require(${JSON.stringify(path.join(ROOT,'server/index.js'))});`);
async function startRelay(){const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));relayPort=probe.address().port;await new Promise(r=>probe.close(r));
 relay=fork(harness,[],{cwd:ROOT,env:{...process.env,PORT:String(relayPort),DATABASE_URL:'',STEAM_PURCHASES_ENABLED:'0',WOD_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe','ipc']});
 relay.stdout.on('data',b=>relayLog+=b);relay.stderr.on('data',b=>relayLog+=b);
 for(let i=0;i<100&&!/listening|ws:\/\/|port/i.test(relayLog);i++)await new Promise(r=>setTimeout(r,100));}
(async()=>{
 await startRelay();await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port,browser=await H.launchBrowser();
 const errors=[];
 async function client(name){const context=await browser.newContext({viewport:{width:1280,height:800}});await context.addInitScript(ws=>window.WOD_MP_WS_URL=ws,'ws://127.0.0.1:'+relayPort);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(name+': '+e.message));page.on('console',m=>{if(m.type()==='error')errors.push(name+' console: '+m.text().slice(0,200));});
  await page.goto(url+'/');await page.waitForFunction(()=>typeof wodProgress==='object'&&WodMultiplayer.api.registered,null,{timeout:60000});
  await page.evaluate(name=>{wodDismissChangelogPopup();showPanel('multiplayer');wodMpWireLobbyUi();document.getElementById('mpDisplayName').value=name;wodProgress.profile.mpDisplayName=name;void wodMpRegisterWithServer();},name);
  await page.waitForFunction(name=>wodProgress.profile.mpDisplayName===name&&WodMultiplayer.api.registered,name);return{context,page};}
 const host=await client('Probe Host'),guest=await client('Probe Guest');
 const code=await host.page.evaluate(async()=>{await WodMultiplayer.createLobby({name:'Guest probe',meta:{seatTypes:['human','human','bot','bot'],gamePeriod:'modern'}});return WodMultiplayer.api.code;});
 await guest.page.evaluate(code=>WodMultiplayer.joinLobby(code,{playerId:wodEnsurePlayerId()}),code);
 await host.page.waitForTimeout(800);
 await host.page.evaluate(()=>{window.wodMpRoomMeta.seatTypes=['human','human','bot','bot'];WodMultiplayer.sendLobbyMeta(window.wodMpRoomMeta);});
 await host.page.evaluate(()=>{const built=wodMpBuildLobbyMetaFromSetup();Object.assign(window.wodMpRoomMeta,built);wodMpEnsureDefaultSeatTypes(window.wodMpRoomMeta);window.wodMpRoomMeta.seatTypes=['human','human','bot','bot'];WodMultiplayer.sendLobbyMeta(window.wodMpRoomMeta);});
 await host.page.waitForTimeout(1500);
 await host.page.evaluate(()=>wodMpRefreshLobbyMapPreview({force:true}));
 await host.page.waitForFunction(()=>!wodIsMapPreviewGenerating()&&wodMpCommittedIsCurrentForMeta(window.wodMpRoomMeta),null,{timeout:180000,polling:1000});
 await host.page.evaluate(()=>{window.__snapBytes=[];const send=WodMultiplayer.hostSendSnap.bind(WodMultiplayer);window.__fieldBytes={};window.__entBytes={};WodMultiplayer.hostSendSnap=(seq,p)=>{if(window.__snapBytes.length<400){window.__snapBytes.push(JSON.stringify(p).length);for(const k of Object.keys(p))if(p[k]!==undefined)window.__fieldBytes[k]=(window.__fieldBytes[k]||0)+JSON.stringify(p[k]).length;for(const e of p.entities||[])for(const k of Object.keys(e))window.__entBytes[k]=(window.__entBytes[k]||0)+JSON.stringify(e[k]??null).length;}return send(seq,p);};window.__notes=[];const sn=showNotification;showNotification=function(m){window.__notes.push(String(m).slice(0,160));return sn.apply(this,arguments);};window.__meta=JSON.stringify({seat:window.wodMpRoomMeta.seatTypes,occ:window.wodMpRoomMeta.occupiedSlots,isHost:WodMultiplayer.api.isHost});document.getElementById('mpBtnGlLaunch').click();});
 await host.page.waitForTimeout(4000);console.log('after launch '+await host.page.evaluate(()=>window.__meta+' notes '+JSON.stringify(window.__notes)+' btn '+!!document.getElementById('mpBtnGlLaunch')+' onclick '+!!document.getElementById('mpBtnGlLaunch')?.onclick));
 const state=()=>Promise.all([host,guest].map(c=>c.page.evaluate(()=>({gameState,mp:!!gameData.mp?.enabled,canPlay:typeof wodMpMatchCanPlay==='function'&&!!gameData.mp&&wodMpMatchCanPlay(),ents:gameData.entities.length,loading:!!gameData._mpLoadingMatch,allReady:!!gameData.mp?.allReady,note:document.querySelector('#notification, .notification, #wodToast')?.textContent?.slice(0,120)||''}))));
 for(let i=0;i<36;i++){const st=await state();if(i%3===0)console.log('wait '+i*5+'s '+JSON.stringify(st));if(st.every(x=>x.gameState==='PLAYING'&&x.mp&&x.canPlay&&x.ents>0))break;await host.page.waitForTimeout(5000);}
 await guest.page.waitForTimeout(3000);await guest.page.screenshot({path:path.join(OUT,'guest-start.png')});
 console.log('guest view '+await guest.page.evaluate(()=>JSON.stringify({hexes:gameData.hexList.length,cities:gameData.cities.length,cam:gameData.camera,canvas:[document.getElementById('gameCanvas')?.width,document.getElementById('gameCanvas')?.height],me:wodLocalPlayerOwner(),myTown:gameData.cities.filter(c=>c.owner===wodLocalPlayerOwner()).map(c=>[Math.round(c.x),Math.round(c.y)]),xs:[Math.min(...gameData.hexList.map(h=>h.x)),Math.max(...gameData.hexList.map(h=>h.x))],layers:gameData.layers||gameData.mapLayers||null})));
 console.log('host view '+await host.page.evaluate(()=>JSON.stringify({hexes:gameData.hexList.length,cam:gameData.camera,me:wodLocalPlayerOwner()})));
 // guest-side instruments: frame gaps, snapshot gaps and apply cost, drawn-vs-true offset of its own units
 await guest.page.evaluate(()=>{const P=window.__probe={frames:[],snapGaps:[],applyMs:[],lag:[],lastSnap:0};
  let last=performance.now();const tick=t=>{P.frames.push(t-last);last=t;
   {const me=wodLocalPlayerOwner(),now=performance.now();P.seen||(P.seen=new Map());
    for(const e of gameData.entities){if(e.owner!==me||e.type==='convoy')continue;const o=P.seen.get(e.uid);if(!o||o.x!==e.x||o.y!==e.y)P.seen.set(e.uid,{x:e.x,y:e.y,at:now});}
    const moving=e=>{const o=P.seen.get(e.uid);return o&&now-o.at<400&&e._drawX!=null;};
    let u=P.track&&gameData.entities.find(e=>e.uid===P.track);if(!u||!moving(u)){u=gameData.entities.find(e=>e.owner===me&&e.type!=='convoy'&&moving(e)&&P.seen.get(e.uid));P.track=u?.uid;P.lastPos=null;}
    if(u){const z=gameData.camera.zoom||1;gameData.camera.x=u.x*z-innerWidth/2;gameData.camera.y=u.y*z-innerHeight/2;if(P.lastPos)(P.steps||(P.steps=[])).push(Math.hypot(u._drawX-P.lastPos[0],u._drawY-P.lastPos[1]));P.lastPos=[u._drawX,u._drawY];}}
   if(P.frames.length%30===0){let n=0,s=0;for(const u of gameData.entities){if(u._drawX==null)continue;n++;s+=Math.hypot(u._drawX-u.x,u._drawY-u.y);}P.lag.push(n?s/n:0);}
   requestAnimationFrame(tick);};requestAnimationFrame(tick);
  const apply=wodMpApplySnapPayload;wodMpApplySnapPayload=function(s){const t0=performance.now();if(P.lastSnap)P.snapGaps.push(t0-P.lastSnap);P.lastSnap=t0;const r=apply.apply(this,arguments);P.applyMs.push(performance.now()-t0);return r;};});
 // the guest recruits infantry in one of its towns, as the build button does
 const built=await guest.page.evaluate(()=>{const me=wodLocalPlayerOwner(),c=gameData.cities.find(c=>c.owner===me);if(!c)return 'no town';gameData.selectedCity=c;
  const before=new Set(gameData.entities.filter(u=>u.owner===me).map(u=>u.uid));window.__before=[...before];
  return wodMpSendCmd({kind:'build',mode:'light',cq:c.q,cr:c.r})?'sent at '+c.name:'not sent';});
 // host: give its armies something to do so units move (march every host-owned unit toward the map centre)
 await host.page.evaluate(()=>{const me=wodLocalPlayerOwner();const cx=gameData.hexList.reduce((a,h)=>a+h.x,0)/gameData.hexList.length,cy=gameData.hexList.reduce((a,h)=>a+h.y,0)/gameData.hexList.length;
  const units=gameData.entities.filter(u=>u.owner===me&&!wodIsNavalUnit(u));const slots=wodGroupDestinationSlots(units,{x:cx,y:cy});wodApplyPlayerMoveOrders(units,u=>slots.has(u)?[slots.get(u)]:null);});
 await guest.page.evaluate(()=>{const me=wodLocalPlayerOwner();const cx=gameData.hexList.reduce((a,h)=>a+h.x,0)/gameData.hexList.length,cy=gameData.hexList.reduce((a,h)=>a+h.y,0)/gameData.hexList.length;
  const uids=gameData.entities.filter(u=>u.owner===me&&!wodIsNavalUnit(u)).map(u=>u.uid);wodMpSendCmd({kind:'move',uids,x:cx,y:cy});
  });
 for(let t=0;t<SECONDS;t+=10){await guest.page.waitForTimeout(10000);
  await guest.page.screenshot({path:path.join(OUT,'guest-'+t+'.png')});if(t===0)await host.page.screenshot({path:path.join(OUT,'host-'+t+'.png')});}
 const g=await guest.page.evaluate(()=>{const P=window.__probe,me=wodLocalPlayerOwner(),q=(a,p)=>{const s=a.slice().sort((x,y)=>x-y);return s.length?Math.round(s[Math.floor((s.length-1)*p)]*10)/10:null;};
  const mine=gameData.entities.filter(u=>u.owner===me),fresh=mine.filter(u=>!window.__before.includes(u.uid));
  return {frames:P.frames.length,frameMs:{p50:q(P.frames,.5),p95:q(P.frames,.95),max:q(P.frames,1)},longFrames:P.frames.filter(f=>f>50).length,
   snaps:P.snapGaps.length,snapGapMs:{p50:q(P.snapGaps,.5),p95:q(P.snapGaps,.95),max:q(P.snapGaps,1)},applyMs:{p50:q(P.applyMs,.5),p95:q(P.applyMs,.95),max:q(P.applyMs,1)},
   drawLagPx:{p50:q(P.lag,.5),max:q(P.lag,1)},marchSteps:{n:(P.steps||[]).length,stalls:(P.steps||[]).filter(x=>x<.05).length,p50:q(P.steps||[],.5),p95:q(P.steps||[],.95),max:q(P.steps||[],1)},myUnits:mine.length,recruited:fresh.map(u=>({type:u.type,spawnFx:u.spawnFx})),jobs:(gameData.constructionJobs||[]).filter(j=>j.owner===me).map(j=>j.mode+' '+Math.round(j.remaining)+'/'+j.total)};});
 const h=await host.page.evaluate(()=>{const b=window.__snapBytes,me=2;return {snapKB:{avg:Math.round(b.reduce((a,x)=>a+x,0)/Math.max(1,b.length)/1024),max:Math.round(Math.max(...b)/1024)},snaps:b.length,entities:gameData.entities.length,hexes:gameData.hexList.length,
   fieldsKBperSnap:Object.fromEntries(Object.entries(window.__fieldBytes).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k,v])=>[k,Math.round(v/b.length/102.4)/10])),entityFieldsKBperSnap:Object.fromEntries(Object.entries(window.__entBytes).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([k,v])=>[k,Math.round(v/b.length/102.4)/10])),guestUnitsOnHost:gameData.entities.filter(u=>u.owner===me).map(u=>({type:u.type,spawnFx:Math.round((u.spawnFx||0)*100)/100}))};});
 const stopSent=await guest.page.evaluate(()=>{const me=wodLocalPlayerOwner();gameData.selection=gameData.entities.filter(u=>u.owner===me&&u.target&&u.type!=='convoy');return [gameData.selection.length,typeof wodIssueStopOrder==="function"?wodIssueStopOrder():"n/a"];});
 await guest.page.waitForTimeout(1500);
 const stopOnHost=await host.page.evaluate(()=>gameData.entities.filter(u=>u.owner===2&&u.type!=='convoy'&&u.target).length);
 console.log('guest stop: selected '+stopSent[0]+' sent '+stopSent[1]+', still marching on the host '+stopOnHost);
 const sig=()=>gameData.entities.filter(u=>u.hp>0).map(u=>[u.uid,u.type,u.owner,!!u.isGeneral,!!u.veteran,u.cargo?.uid||null,u.boardTransportUid||null].join('|')).sort();
 const [hs,gs]=await Promise.all([host.page.evaluate(sig),guest.page.evaluate(sig)]);const hset=new Set(hs);const mismatch=gs.filter(x=>!hset.has(x));
 console.log(JSON.stringify({build:built,consistency:{host:hs.length,guest:gs.length,mismatch:mismatch.slice(0,5)},guest:g,host:h,errors:errors.slice(0,10)},null,1));
 await browser.close();relay.kill();server.close();process.exit(0);
})().catch(e=>{console.log('CRASH',e.stack);console.log(relayLog.slice(-800));process.exit(1);});
