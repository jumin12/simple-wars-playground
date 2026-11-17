'use strict';
// node scripts/probe-mp-leave.js guest|host — a real two-human multiplayer match over a local relay (two AI seats);
// after 20 s one player leaves the match. Checks that the leaver's troops, towns and ground stay on the map and that
// the computer then commands them (on the remaining machine, which becomes host if the host left).
const H=require('./lib/harness');
const http=require('http'),fs=require('fs'),path=require('path'),{fork}=require('child_process');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/mp-leave-probe');fs.mkdirSync(OUT,{recursive:true});
const WHO=process.argv[2]||'guest';
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

 await host.page.waitForTimeout(20000);
 const leaver=WHO==="host"?host:guest,stay=WHO==="host"?guest:host,leaverSlot=WHO==="host"?1:2;
 const snapOf=p=>p.evaluate(slot=>({units:gameData.entities.filter(u=>u.owner===slot&&u.hp>0).length,towns:gameData.cities.filter(c=>c.owner===slot).length,ground:gameData.hexList.filter(h=>h.owner===slot).length,orders:gameData.entities.filter(u=>u.owner===slot&&(u.target||u.path?.length)).length,human:wodMpIsHumanOwner(slot),isHost:!!gameData.mp?.isHost,eliminated:wodMpIsSlotEliminated(slot)}),leaverSlot);
 const before=await snapOf(stay.page);
 await leaver.page.evaluate(()=>WodMultiplayer.leaveLobby());
 await stay.page.waitForTimeout(8000);
 const after=await snapOf(stay.page);
 const recruits0=await stay.page.evaluate(slot=>gameData.entities.filter(u=>u.owner===slot).map(u=>u.uid),leaverSlot);
 await stay.page.waitForTimeout(40000);
 const later=await snapOf(stay.page);
 const fresh=await stay.page.evaluate(([slot,old])=>gameData.entities.filter(u=>u.owner===slot&&!old.includes(u.uid)).map(u=>u.type),[leaverSlot,recruits0]);
 const notes=await stay.page.evaluate(()=>[...document.querySelectorAll(".notification,#notification,.wod-toast")].map(n=>n.textContent).slice(-3));
 await stay.page.screenshot({path:path.join(OUT,"after-"+WHO+"-left.png")});
 console.log(JSON.stringify({leaver:WHO,before,after,later,newUnitsForLeaverSeat:fresh,errors:errors.slice(0,8)},null,1));
 await browser.close();relay.kill();server.close();process.exit(0);
})().catch(e=>{console.log("CRASH",e.stack);console.log(relayLog.slice(-800));process.exit(1);});
