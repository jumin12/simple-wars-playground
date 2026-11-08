'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/ai-ambush',process.env.AUDIT_VERSION||'focused');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{let f=path.resolve(ROOT,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(ROOT+path.sep))return res.writeHead(403).end();if(process.env.BASELINE_DIR&&['index.html','ai-command.js'].includes(path.relative(ROOT,f)))f=path.join(ROOT,process.env.BASELINE_DIR,path.basename(f));fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.css':'text/css','.ogg':'audio/ogg','.mp3':'audio/mpeg'})[path.extname(f)]||'application/octet-stream');res.end(b);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[],results={};page.setDefaultTimeout(180000);page.on('pageerror',e=>errors.push(e.stack));await context.routeWebSocket(/.*/,s=>{s.onMessage(()=>{});s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]}));});
try{await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks);
await page.evaluate(()=>{
 setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
 window.world=()=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(36);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;gameData.entities=[];gameData.nextUnitId=1;gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.alliances=[];gameData.aiTaskForces={};gameData.aiBattlePlans={};gameData.aiCommanderProfiles={2:'balanced'};gameData._aiEconomyClock=0;gameData.aiTimer=gameData.aiStrategyTimer=gameData.convoyTimer=gameData._transportAiTimer=-1e6;gameData.aiMoneyByOwner={2:0};gameData.aiManpowerByOwner={2:100000};gameData.money=gameData.manpower=100000;gameData._aiFrontOffensives={};gameData._aiFrontOffensiveChecks={};gameData._aiDefenseByOwner={};gameData._aiCombatContexts={};gameData._aiLocalSituation=new WeakMap();for(const h of gameData.hexList){h.type='grass';h.owner=h.q<=0?2:1;h.cityId=null;}};
 window.h=(q,r=0)=>gameData.hexes[q+','+r];window.town=(q,r,owner,id)=>{const p=h(q,r);p.type='urban';p.cityId=id;p.owner=owner;const c={id,name:id,q,r,x:p.x,y:p.y,owner,hp:1000,maxHp:1000};gameData.cities.push(c);return c;};window.unit=(q,r=0,type='light',owner=2)=>{const p=h(q,r),u=createUnitAt(type,p.x,p.y,owner,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
 window.refresh=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();gameData._citySupplyCache=null;gameData._aiArrivalCache=null;gameData._aiCombatContexts={};gameData._aiLocalSituation=new WeakMap();wodInvalidateAiFrontlineHexCache();};
 window.makePlan=(army,home)=>{const guard=unit(home.q,home.r),jobs=[{id:'guard',kind:'defend',city:home,members:[guard.uid]}],unitJob={[guard.uid]:'guard'};for(const [i,u]of army.entries()){const j={id:'j'+i,kind:'main',role:'breakthrough',members:[u.uid],holdHex:h(-2),attackHex:h(1),objectiveHex:h(1)};jobs.push(j);unitJob[u.uid]=j.id;}const p={jobs,unitJob,sectors:[{holdHex:h(-2),attackHex:h(1)}],readyN:army.length+1};gameData.aiTaskForces[2]=p;return{p,guard};};
 window.sim=(seconds,orders)=>{for(let i=0;i<Math.round(seconds*20);i++){if(i%10===0){refresh();orders?.();}wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();}};
});


await page.evaluate(()=>{
 window.ambushWorld=(fog=false)=>{
  world();gameData.aiManpowerByOwner={2:0};gameData.money=gameData.manpower=0;
  const home=town(-27,0,2,'Home');town(28,0,1,'Enemy');
  for(const hex of gameData.hexList)if(hex.q<0&&Math.abs(hex.r)>3&&Math.abs(hex.r)<9)hex.type='forest';
  const bait=unit(0),army=[bait,unit(-6,0,'heavy'),unit(-4,-5),unit(-3,-4),unit(-2,-6),unit(-4,5),unit(-3,4),unit(-2,6)],{p,guard}=makePlan(army,home);
  const foes=[unit(5,-1,'light',1),unit(5,1,'light',1),unit(6,0,'light',1)];army[1].isGeneral=true;
  const op={id:'test-ambush',hexes:gameData.hexes,at:0,until:180000,anchor:h(-1),goal:h(3),hostile:1,members:army.map(u=>u.uid),initialN:army.length,phase:'gather',mode:'breakthrough',jobs:[]};
  op.jobs=[{id:op.id+'-main',kind:'main',role:'breakthrough',response:true,members:op.members.slice(),frontOperation:op,holdHex:op.anchor,bound:0}];gameData._aiFrontOffensives[2]=op;
  gameData.fogOfWar=fog;gameData._factionIntel={};refresh();if(fog)wodFogFactionIntel(2,true);
  window.ambushCase={army,bait,foes,op,p,guard,trace:[],started:false,initialBaitX:bait.x};return ambushCase;
 };
 window.ambushSim=(seconds,chase=true,plan=true)=>{
  const c=ambushCase;for(let i=0;i<Math.round(seconds*20);i++){
   if(i%10===0){refresh();if(gameData.fogOfWar)wodFogFactionIntel(2,true);
    if(chase)for(const e of c.foes.filter(e=>e.hp>0))assignUnitMoveAlongWaypoints(e,[getNearestHexToPoint(c.bait.x,c.bait.y)]);
    if(plan&&!c.started)c.started=wodAiTryAmbush(2,c.op,c.army,wodAiThreats(2))||c.started;
    if(c.started)for(const u of c.army.filter(u=>u.hp>0)){const j=wodAiGetUnitTaskJob(u);if(j&&!wodAiShouldKeepCurrentOrder(u))wodAiIssueTaskForceOrder(u,j,u.hp/u.maxHp);}
   }
   wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();
   if(i%100===99)c.trace.push({t:Math.round(wodAiOperationTime()/1000),stage:c.op.ambush?.stage,mode:c.op.mode,bait:Math.round(c.bait.x),foes:c.foes.map(e=>({x:Math.round(e.x),y:Math.round(e.y),hp:Math.round(e.hp),out:e.outOfSupplySeconds})),wings:c.op.jobs.filter(j=>j.route).map(j=>({cursor:j.cursor,n:j.route.length,closed:j.closed})),own:c.army.map(u=>({id:u.uid,x:Math.round(u.x),y:Math.round(u.y),hp:Math.round(u.hp)}))});
  }
 };
});
results.physical=[];
for(const fog of [false,true]){
 await page.evaluate(fog=>ambushWorld(fog),fog);for(let t=0;t<100;t+=10){await page.evaluate(()=>ambushSim(10));if(t===20){
  await page.evaluate(()=>{UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.style.display='block';gameData.layers.territory=true;gameData.camera={zoom:1.4,x:-880,y:-480};wodMarkTerrainFullDirty();updateTerrainCache();draw();});
  await page.screenshot({path:path.join(OUT,fog?'fog-spring.png':'clear-spring.png')});fs.writeFileSync(path.join(OUT,fog?'fog-spring-state.json':'clear-spring-state.json'),await page.evaluate(()=>render_game_to_text()));
 }}
 const r=await page.evaluate(()=>{const c=ambushCase,events=wodAiDiagnostics(2);return{fog:gameData.fogOfWar,started:c.started,events:events.counts,baitRetreated:c.trace.some(s=>s.bait<c.initialBaitX-40),baitAlive:c.bait.hp>0,generalNotBait:events.events.filter(e=>e.event==='ambush-prepare').every(e=>e.bait!==c.army[1].uid),allAlive:c.army.every(u=>u.hp>0),guard:Math.hypot(c.guard.x-h(-27).x,c.guard.y)<1&&c.guard.hp>0,damage:c.foes.reduce((n,e)=>n+e.maxHp-e.hp,0),isolated:c.foes.some(e=>e.outOfSupplySeconds>0),trace:c.trace};});results.physical.push(r);
 await page.evaluate(()=>{UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.style.display='block';gameData.fogOfWar=false;gameData.layers.territory=true;gameData.camera={zoom:1.1,x:-600,y:-480};wodMarkTerrainFullDirty();updateTerrainCache();draw();});await page.screenshot({path:path.join(OUT,fog?'fog-result.png':'clear-result.png')});fs.writeFileSync(path.join(OUT,fog?'fog-state.json':'clear-state.json'),await page.evaluate(()=>render_game_to_text()));
}



// Start from an assembled task force and exercise the production front planner,
// not the lure helper. The ordinary dispatcher and physics execute its choices.
results.plannerIntegration=[];
for(const fog of [false,true])results.plannerIntegration.push(await page.evaluate(fog=>{
 const log=[],record=wodAiRecord;wodAiRecord=function(owner,event,detail){record(owner,event,detail);if(event.startsWith('ambush'))log.push({t:wodAiOperationTime()/1000,event,...detail});};
 const c=ambushWorld(fog);gameData._aiFrontOffensives={};gameData._aiFrontOffensiveChecks={};
 for(let i=0;i<110*20;i++){
  if(i%10===0){refresh();if(fog)wodFogFactionIntel(2,true);
   const trap=wodAiActiveFrontOperations(2).find(o=>o.ambush),decoy=trap&&gameData.entities.find(u=>u.uid===trap.ambush.bait)||c.bait;
   for(const e of c.foes.filter(e=>e.hp>0))assignUnitMoveAlongWaypoints(e,[getNearestHexToPoint(decoy.x,decoy.y)]);
   wodAiPlanFrontOffensive(2,c.p,[...c.army,c.guard]);
   for(const u of c.army.filter(u=>u.hp>0)){const job=wodAiGetUnitTaskJob(u);if(job&&!wodAiShouldKeepCurrentOrder(u))wodAiIssueTaskForceOrder(u,job,u.hp/u.maxHp);}
  }
  wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();
 }
 wodAiRecord=record;return{fog,events:wodAiDiagnostics(2).counts,log,damage:c.foes.reduce((n,e)=>n+e.maxHp-e.hp,0),guard:c.guard.hp>0&&Math.hypot(c.guard.x-h(-27).x,c.guard.y)<50};
},fog));
results.refused=await page.evaluate(()=>{ambushWorld();ambushSim(4);const c=ambushCase;for(const e of c.foes){e.target=null;e.path=null;e.orderTarget=null;e.holding=true;}ambushSim(85,false);return{started:c.started,aborted:!!wodAiDiagnostics(2).counts['ambush-abort'],counterattacked:!!wodAiDiagnostics(2).counts['ambush-counterattack'],attempts:wodAiDiagnostics(2).counts['ambush-prepare'],waiting:!!c.op.ambush,forward:c.army.some(u=>u.x>100),trace:c.trace};});
results.safety=await page.evaluate(()=>{
 const start=()=>{ambushWorld();ambushSim(4);return ambushCase;};
 let c=start();const trap=c.op.ambush,covered=wodAiBorderBattleCovered(2,{x:c.foes[0].x,y:c.foes[0].y,contacts:c.foes.map(e=>e.uid)},c.p);
 c.bait.hp=c.bait.maxHp*.5;gameData._aiEconomyClock+=1;wodAiStepAmbush(2,c.op,c.army);const moderateBaitRetained=!!c.op.ambush;c.bait.hp=c.bait.maxHp*.4;gameData._aiEconomyClock+=1;wodAiStepAmbush(2,c.op,c.army);const woundedBaitAborts=!c.op.ambush;
 c=start();for(let i=0;i<14;i++)unit(1,(i-7)*2,'heavy',1);refresh();gameData._aiEconomyClock+=1;wodAiStepAmbush(2,c.op,c.army);const superiorReinforcementAborts=!c.op.ambush;
 c=start();c.op.ambush.center.owner=1;refresh();gameData._aiEconomyClock+=1;wodAiStepAmbush(2,c.op,c.army);const capturedCenterRetained=!!c.op.ambush;
 c=start();c.op.ambush.wings[0].owner=1;refresh();gameData._aiEconomyClock+=1;wodAiStepAmbush(2,c.op,c.army);const lostWingAborts=!c.op.ambush;
 c=start();const left=c.op.jobs.find(j=>j.role==='ambush-left'),loan=left.members.slice();gameData._aiDefenseByOwner[2]={hexes:gameData.hexes,jobs:[{id:'real-relief',kind:'counter',response:true,members:loan,city:gameData.cities[0]}],unitJob:Object.fromEntries(loan.map(id=>[id,'real-relief']))};const protectedUnits=c.army.filter(u=>loan.includes(u.uid));for(const u of protectedUnits){u.aiOrderUntil=77777;gameData._aiMoveQueue.set(u,{x:-600,y:0});}gameData._aiEconomyClock+=1;const free=c.army.filter(u=>!loan.includes(u.uid));wodAiStepAmbush(2,c.op,free);const emergencyAborts=!c.op.ambush&&protectedUnits.every(u=>u.aiOrderUntil===77777&&gameData._aiMoveQueue.has(u)&&!c.op.jobs.some(j=>j.members.includes(u.uid)));
 c=ambushWorld(true);for(const e of c.foes){e.x=h(27).x;e.y=h(27).y;}refresh();wodFogFactionIntel(2,true);const hiddenFoes=wodAiThreats(2,false).length===0,hiddenRejected=!wodAiTryAmbush(2,c.op,c.army,wodAiThreats(2));
 c=ambushWorld();wodAiTryAmbush(2,c.op,c.army,wodAiThreats(2));gameData._aiEconomyClock=2;const staticRejected=!wodAiTryAmbush(2,c.op,c.army,wodAiThreats(2));
 c=ambushWorld();wodAiTryAmbush(2,c.op,c.army,wodAiThreats(2));for(const e of c.foes){e.x-=20;e.retreating=true;}gameData._aiEconomyClock=2;refresh();const retreatingRejected=!wodAiTryAmbush(2,c.op,c.army,wodAiThreats(2));
 c=ambushWorld();for(const hex of gameData.hexList)if(hex.r>1){hex.type='water';hex.owner=0;}refresh();wodAiTryAmbush(2,c.op,c.army,wodAiThreats(2));for(const e of c.foes)e.x-=20;gameData._aiEconomyClock=2;refresh();const riverRejected=!wodAiTryAmbush(2,c.op,c.army,wodAiThreats(2));
 return{covered,capturedCenterRetained,moderateBaitRetained,woundedBaitAborts,superiorReinforcementAborts,lostWingAborts,emergencyAborts,hiddenFoes,hiddenRejected,staticRejected,retreatingRejected,riverRejected};
});
console.log(JSON.stringify({...results,physical:results.physical.map(r=>({...r,trace:undefined})),refused:{...results.refused,trace:undefined}},null,2));

if(!process.env.OBSERVE_ONLY)assert(results.physical.every(r=>r.started&&r.events['ambush-lure']&&r.events['ambush-sprung']&&r.baitRetreated&&r.baitAlive&&r.generalNotBait&&r.guard&&r.damage>50&&r.isolated),'a real pursuing force follows the bait and the prepared wings spring an attack in clear and fog');
if(!process.env.OBSERVE_ONLY){assert(results.plannerIntegration.every(r=>r.events['ambush-prepare']&&r.events['ambush-sprung']&&r.damage>50&&r.guard),'the production front planner chooses and completes the trap for a coherent force without direct lure calls');assert(results.refused.started&&(results.refused.aborted||results.refused.counterattacked)&&results.refused.attempts===1&&!results.refused.waiting&&results.refused.forward,'a refused lure expires once and the force resumes advancing');assert(Object.values(results.safety).every(Boolean),'unsafe traps abort, preserve emergency loans, and never use hidden or static targets');}assert.deepEqual(errors,[]);
}finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({results,errors},null,2));await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
