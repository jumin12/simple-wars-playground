'use strict';
// node scripts/verify-mp-three-players.js — a real three-player match over a local relay (host, guest A, guest B on a bad line, one AI
// seat). Guest B's messages arrive late and out of step (each held 150-1050 ms, in order) and its socket is cut while the
// host's map is still loading, so it rejoins mid-load. Then the host leaves and guest A takes over hosting. Checks that
// B ends up with the same map and towns as A, keeps receiving the battle after the host changes, and that no page threw.
const H=require('./lib/harness');
const http=require('http'),fs=require('fs'),path=require('path'),{fork}=require('child_process');
const assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/mp-three-players');fs.mkdirSync(OUT,{recursive:true});
const dataDir=fs.mkdtempSync(path.join(OUT,'relay-'));let relay,relayPort,relayLog='';
const server=H.createStaticServer({rewrite:(p,b)=>p==='/index.html'?H.injectHead(b,"<script>window.WOD_MP_WS_URL='ws://127.0.0.1:"+relayPort+"';</script>"):undefined});
const harness=path.join(OUT,'relay.cjs');fs.writeFileSync(harness,`require(${JSON.stringify(path.join(ROOT,'server/index.js'))});`);
async function startRelay(){const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));relayPort=probe.address().port;await new Promise(r=>probe.close(r));
 relay=fork(harness,[],{cwd:ROOT,env:{...process.env,PORT:String(relayPort),DATABASE_URL:'',STEAM_PURCHASES_ENABLED:'0',WOD_MIN_MATCH_SECONDS: '0', WOD_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe','ipc']});
 relay.stdout.on('data',b=>relayLog+=b);relay.stderr.on('data',b=>relayLog+=b);
 for(let i=0;i<100&&!/listening|ws:\/\/|port/i.test(relayLog);i++)await new Promise(r=>setTimeout(r,100));}
// a bad line: every incoming message is held back 150-1050 ms (in order); window.__cutSocket() drops the connection
const LAG=`(()=>{const Native=window.WebSocket;window.__sockets=[];
 window.WebSocket=function(url,proto){const ws=proto?new Native(url,proto):new Native(url);window.__sockets.push(ws);let last=0;
  const hold=(fn,ev)=>{const now=performance.now(),at=Math.max(last,now+150+Math.random()*900);last=at;setTimeout(()=>fn.call(ws,ev),at-now);};
  return new Proxy(ws,{set(t,k,v){if(k==='onmessage'&&typeof v==='function'){t.onmessage=ev=>hold(v,ev);return true;}t[k]=v;return true;},get(t,k){const v=t[k];return typeof v==='function'?v.bind(t):v;}});};
 window.WebSocket.prototype=Native.prototype;Object.assign(window.WebSocket,{CONNECTING:0,OPEN:1,CLOSING:2,CLOSED:3});
 window.__cutSocket=()=>{const s=window.__sockets[window.__sockets.length-1];if(s)s.close();};})();`;
(async()=>{
 await startRelay();await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port,browser=await H.launchBrowser();
 const errors=[];
 async function client(name,lag){const context=await browser.newContext({viewport:{width:1100,height:700}});await context.addInitScript(ws=>window.WOD_MP_WS_URL=ws,'ws://127.0.0.1:'+relayPort);
  if(lag)await context.addInitScript(LAG);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(name+': '+e.message));page.on('console',m=>{if(m.type()==='error')errors.push(name+' console: '+m.text().slice(0,200));});
  await page.goto(url+'/');await page.waitForFunction(()=>typeof wodProgress==='object'&&WodMultiplayer.api.registered,null,{timeout:90000});
  await page.evaluate(name=>{wodDismissChangelogPopup();showPanel('multiplayer');wodMpWireLobbyUi();document.getElementById('mpDisplayName').value=name;wodProgress.profile.mpDisplayName=name;void wodMpRegisterWithServer();},name);
  await page.waitForFunction(name=>wodProgress.profile.mpDisplayName===name&&WodMultiplayer.api.registered,name,{timeout:30000});
  await page.evaluate(()=>{window.__applies=0;const a=wodMpApplySnapPayload;wodMpApplySnapPayload=function(){window.__applies++;return a.apply(this,arguments);};
   window.__loads=0;const m=wodMpApplyMatchStartPayload;wodMpApplyMatchStartPayload=function(){window.__loads++;return m.apply(this,arguments);};});
  return{context,page};}
 const host=await client('Probe Host'),a=await client('Probe Guest A'),b=await client('Probe Guest B',true);
 const seats=['human','human','human','bot'];
 const code=await host.page.evaluate(async seats=>{await WodMultiplayer.createLobby({name:'Three probe',meta:{seatTypes:seats,gamePeriod:'modern'}});return WodMultiplayer.api.code;},seats);
 await a.page.evaluate(code=>WodMultiplayer.joinLobby(code,{playerId:wodEnsurePlayerId()}),code);
 await b.page.evaluate(code=>WodMultiplayer.joinLobby(code,{playerId:wodEnsurePlayerId()}),code);
 await host.page.waitForTimeout(2500);
 await host.page.evaluate(seats=>{const built=wodMpBuildLobbyMetaFromSetup();Object.assign(window.wodMpRoomMeta,built);wodMpEnsureDefaultSeatTypes(window.wodMpRoomMeta);window.wodMpRoomMeta.seatTypes=seats;WodMultiplayer.sendLobbyMeta(window.wodMpRoomMeta);},seats);
 await host.page.waitForTimeout(1500);
 await host.page.evaluate(()=>wodMpRefreshLobbyMapPreview({force:true}));
 await host.page.waitForFunction(()=>!wodIsMapPreviewGenerating()&&wodMpCommittedIsCurrentForMeta(window.wodMpRoomMeta),null,{timeout:180000,polling:1000});
 console.log('lobby '+await host.page.evaluate(()=>JSON.stringify({seats:window.wodMpRoomMeta.seatTypes,occ:window.wodMpRoomMeta.occupiedSlots})));
 await host.page.evaluate(()=>document.getElementById('mpBtnGlLaunch').click());
 // cut B's line while the host's map is on its way to it
 await b.page.waitForFunction(()=>gameData.mp?.enabled&&gameState==='PLAYING',null,{timeout:60000}).catch(()=>{});
 const cutAt=await b.page.evaluate(()=>({loading:!!gameData._mpLoadingMatch,hexes:gameData.hexList.length}));await b.page.evaluate(()=>window.__cutSocket());
 console.log('cut B during load '+JSON.stringify(cutAt));
 const all=[host,a,b],state=()=>Promise.all(all.map(c=>c.page.evaluate(()=>({gameState,mp:!!gameData.mp?.enabled,host:!!gameData.mp?.isHost,ents:gameData.entities.length,hexes:gameData.hexList.length,loading:!!gameData._mpLoadingMatch,applies:window.__applies,loads:window.__loads}))));
 for(let i=0;i<30;i++){const st=await state();if(i%3===0)console.log('wait '+i*4+'s '+JSON.stringify(st));if(st.every(x=>x.gameState==='PLAYING'&&x.mp&&x.ents>0&&!x.loading&&x.applies>3))break;await host.page.waitForTimeout(4000);}
 await host.page.waitForTimeout(10000);
 const view=p=>p.evaluate(()=>({hexes:gameData.hexList.length,terrain:gameData.hexList.reduce((s,h,i)=>(s*31+h.type.length*7+i)|0,0),cities:gameData.cities.map(c=>c.q+','+c.r+':'+c.owner).sort().join(' '),ents:gameData.entities.length,applies:window.__applies,loads:window.__loads,host:!!gameData.mp?.isHost,state:gameState,seq:WodMultiplayer.api.lastSeq}));
 const before={host:await view(host.page),a:await view(a.page),b:await view(b.page)};
 // the host leaves: A takes over hosting; B must keep receiving the battle
 await host.page.evaluate(()=>WodMultiplayer.leaveLobby());
 await a.page.waitForTimeout(25000);
 const posB0=await b.page.evaluate(()=>gameData.entities.slice(0,40).map(u=>Math.round(u.x)+','+Math.round(u.y)).join(' '));
 const after1={a:await view(a.page),b:await view(b.page)};
 await a.page.waitForTimeout(15000);
 const after2={a:await view(a.page),b:await view(b.page)};
 const posB1=await b.page.evaluate(()=>gameData.entities.slice(0,40).map(u=>Math.round(u.x)+','+Math.round(u.y)).join(' '));
 await b.page.screenshot({path:path.join(OUT,'guest-b.png')});await a.page.screenshot({path:path.join(OUT,'guest-a.png')});
 const res={before,after1,after2,bMoving:posB0!==posB1,sameMapAB:after2.a.hexes===after2.b.hexes&&after2.a.terrain===after2.b.terrain,sameTownsAB:after2.a.cities===after2.b.cities,bStillApplying:after2.b.applies>after1.b.applies,errors:errors.slice(0,10)};
 console.log(JSON.stringify(res,null,1));
 await browser.close();relay.kill();server.close();
 assert(res.sameMapAB&&res.sameTownsAB,'the lagged guest, cut off mid-load, ends up with the same map and towns as the other guest');
 assert(res.bStillApplying&&res.bMoving,'after the host leaves the lagged guest keeps receiving the battle from the new host');
 assert(after2.a.host&&after2.b.state==='PLAYING','the other guest took over hosting and the lagged guest still plays');
 assert.deepEqual(res.errors,[]);
 process.exit(0);
})().catch(e=>{console.log('CRASH',e.stack);console.log(relayLog.slice(-1500));process.exit(1);});
