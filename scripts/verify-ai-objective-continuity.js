'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/ai-objective-continuity',process.env.AUDIT_VERSION||'focused');
fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{
 let f=path.resolve(ROOT,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
 if(!f.startsWith(ROOT+path.sep))return res.writeHead(403).end();
 if(process.env.BASELINE_DIR&&['index.html','ai-command.js'].includes(path.relative(ROOT,f)))f=path.join(ROOT,process.env.BASELINE_DIR,path.basename(f));
 fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[path.extname(f)]||'application/octet-stream');res.end(b);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[],results={};
 page.setDefaultTimeout(180000);page.on('pageerror',e=>errors.push(e.stack));
 await context.routeWebSocket(/.*/,s=>{s.onMessage(()=>{});s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]}));});
 await page.addInitScript(()=>{window.resetContinuityRng=()=>{let seed=81555;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};};resetContinuityRng();});
 try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks);
 await page.evaluate(()=>{
  setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
  window.world=()=>{
   resetContinuityRng();wodPrepareForNewMatch({keepLiveMap:true});gameData.nextUnitId=1;WOD.makeBlankMap(36);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;
   gameData.fogOfWar=false;gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.alliances=[];
   gameData.aiTaskForces={};gameData.aiBattlePlans={};gameData.aiCommanderProfiles={2:'balanced'};gameData._aiEconomyClock=0;
   gameData.aiTimer=gameData.aiStrategyTimer=gameData.convoyTimer=gameData._transportAiTimer=-1e6;
   gameData.aiMoneyByOwner={2:0};gameData.aiManpowerByOwner={2:0};gameData.money=gameData.manpower=0;
   gameData._aiFrontOffensives={};gameData._aiFrontOffensiveChecks={};gameData._aiDefenseByOwner={};gameData._aiCombatContexts={};gameData._aiLocalSituation=new WeakMap();
   for(const h of gameData.hexList){h.type='grass';h.owner=h.q<=0?2:1;h.cityId=null;}
  };
  window.h=(q,r=0)=>gameData.hexes[q+','+r];
  window.town=(q,r,owner,id)=>{const p=h(q,r);p.type='urban';p.cityId=id;p.owner=owner;const c={id,name:id,q,r,x:p.x,y:p.y,owner,hp:1000,maxHp:1000};gameData.cities.push(c);return c;};
  window.unit=(q,r=0,type='light',owner=2)=>{const p=h(q,r),u=createUnitAt(type,p.x,p.y,owner,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
  window.refresh=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();gameData._citySupplyCache=null;gameData._aiArrivalCache=null;gameData._aiCombatContexts={};gameData._aiLocalSituation=new WeakMap();wodInvalidateAiFrontlineHexCache();};
  window.planArmy=(army,home)=>{
   const guard=unit(home.q,home.r),job={id:'push',kind:'main',role:'main',members:army.map(u=>u.uid),quota:army.length,objectiveHex:h(1),attackHex:h(1),holdHex:h(-2),phase:'assemble'};
   const p={owner:2,jobs:[{id:'guard',kind:'defend',role:'defend',city:home,members:[guard.uid],quota:1},job],unitJob:Object.fromEntries([[guard.uid,'guard'],...army.map(u=>[u.uid,'push'])]),sectors:buildAiFrontlineSectors(2,12),readyN:army.length+1};gameData.aiTaskForces[2]=p;return{p,guard,job};
  };
  window.sim=(seconds,p,army)=>{
   const trace=[];
   for(let i=0;i<seconds*20;i++){
    if(i%10===0){refresh();if(p){wodAiPlanFrontOffensive(2,p,army);for(const u of army){if(u.hp<=0)continue;const j=wodAiGetUnitTaskJob(u);if(j&&!wodAiShouldKeepCurrentOrder(u))wodAiIssueTaskForceOrder(u,j,u.hp/u.maxHp);}}}
    wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();
    if(i%200===199)trace.push({t:Math.round(gameData._aiEconomyClock),cities:gameData.cities.map(c=>({id:c.id,owner:c.owner})),meanX:army.reduce((n,u)=>n+u.x,0)/army.length,op:wodAiActiveFrontOperations(2).map(o=>({id:o.id,goal:o.advanceGoal?.id||o.advanceGoal&&getHexKey(o.advanceGoal)||getHexKey(o.goal),phase:o.phase,n:o.members.length})),units:army.map(u=>({x:Math.round(u.x),y:Math.round(u.y),goal:u.orderTarget,job:wodAiGetUnitTaskJob(u)?.id}))});
   }
   return trace;
  };
 });
 results.chain=await page.evaluate(()=>{
  world();const home=town(-26,0,2,'Home'),first=town(3,0,1,'First'),second=town(17,0,1,'Second'),last=town(29,0,1,'Last');
  const army=Array.from({length:8},(_,i)=>unit(-3-(i%2),(i%4-1.5)*2,i<2?'heavy':'light'));unit(3,2,'light',1);refresh();
  const {p,guard}=planArmy(army,home),trace=sim(300,p,army),events=wodAiDiagnostics(2);
  return{cities:[first,second,last].map(c=>({id:c.id,owner:c.owner})),secondAt:trace.find(s=>s.cities.find(c=>c.id==='Second').owner===2)?.t,land:gameData.hexList.filter(x=>x.q>0&&x.owner===2).length,guard:Math.hypot(guard.x-home.x,guard.y-home.y)<1,trace,events:events.counts};
 });
 console.log('chain',JSON.stringify({...results.chain,trace:results.chain.trace.filter((_,i)=>i%3===2)}));
 results.local=await page.evaluate(()=>{
  world();const home=town(-26,0,2,'Home');town(29,28,1,'Distant');const army=Array.from({length:6},(_,i)=>unit(7,i*2-5));
  for(const x of gameData.hexList)if(x.q<11)x.owner=2;refresh();
  const {p,guard}=planArmy(army,home);p.jobs[1].objectiveHex=h(8);p.jobs[1].attackHex=h(8);p.jobs[1].holdHex=h(6);
  const op={id:'finished',hexes:gameData.hexes,at:0,until:180000,anchor:h(-2),goal:h(2),advanceGoal:h(8),hostile:1,members:army.map(u=>u.uid),initialN:6,phase:'advance',mode:'breakthrough',jobs:[],bound:0};
  op.jobs=[{id:'finished-push',kind:'main',role:'breakthrough',members:op.members.slice(),frontOperation:op,holdHex:op.anchor,bound:0}];gameData._aiFrontOffensives[2]=op;
  const start=army.map(u=>u.x),trace=sim(150,p,army);
  return{advanced:army.filter((u,i)=>u.x>start[i]+150).length,trace,events:wodAiDiagnostics(2).counts,guard:Math.hypot(guard.x-home.x,guard.y-home.y)<1};
 });
 console.log('local',JSON.stringify({...results.local,trace:results.local.trace.filter((_,i)=>i%3===2)}));
 results.quietSweep=await page.evaluate(()=>{
  world();const home=town(-26,0,2,'Home');town(29,0,1,'Inaccessible');
  for(const x of gameData.hexList){if(x.q<5)x.owner=2;if(x.q===16){x.type='water';x.owner=0;}}
  const army=Array.from({length:6},(_,i)=>unit(3,i*2-5));refresh();const {p,guard}=planArmy(army,home);
  const op={id:'sweep',hexes:gameData.hexes,at:0,until:180000,anchor:h(-2),goal:h(1),advanceGoal:h(3),hostile:1,members:army.map(u=>u.uid),initialN:6,phase:'advance',mode:'breakthrough',jobs:[],bound:0};
  op.jobs=[{id:'sweep-push',kind:'main',role:'breakthrough',members:op.members.slice(),frontOperation:op,holdHex:op.anchor,bound:0}];gameData._aiFrontOffensives[2]=op;
  const trace=sim(90,p,army);return{meanX:army.reduce((n,u)=>n+u.x,0)/army.length,land:gameData.hexList.filter(x=>x.q>=5&&x.q<16&&x.owner===2).length,guard:Math.hypot(guard.x-home.x,guard.y-home.y)<1,trace};
 });
 results.capturePlan=await page.evaluate(()=>{
  world();const home=town(-26,0,2,'Home'),captured=town(3,0,1,'Captured');town(26,0,1,'Next');
  const guard=unit(-26),army=Array.from({length:10},(_,i)=>unit(-3,i*2-9,i===0?'heavy':'light'));refresh();
  const p=wodAiEnsureTaskForcePlan(2,[guard,...army]),before=Object.fromEntries(army.map(u=>[u.uid,p.unitJob[u.uid]]));
  for(const x of gameData.hexList)if(x.q<=5)x.owner=2;captured.owner=2;
  for(const [i,u]of army.entries()){u.x=h(3).x;u.y=h(3,i*2-9).y;}
  gameData._aiEconomyClock=12;refresh();const after=wodAiEnsureTaskForcePlan(2,[guard,...army]);
  const unchanged=army.filter(u=>after.unitJob[u.uid]===before[u.uid]).length,newGuard=after.jobs.find(j=>j.city?.id===captured.id)?.members.length;
  home.owner=1;h(-26).owner=1;gameData._aiEconomyClock=16;refresh();const loss=wodAiEnsureTaskForcePlan(2,[guard,...army]);
  return{same:after===p,unchanged,newGuard,lossReplanned:loss!==after,staleGuard:loss.jobs.some(j=>j.city?.id===home.id)};
 });
 results.contestedWing=await page.evaluate(()=>{
  world();const home=town(-26,0,2,'Home');town(24,0,1,'Next');for(const x of gameData.hexList)if(x.q<=4)x.owner=2;
  const army=Array.from({length:6},(_,i)=>unit(2,i*2-5));for(let i=0;i<5;i++)unit(6,i*2-4,'heavy',1);refresh();planArmy(army,home);
  const op={id:'contested',hexes:gameData.hexes,anchor:h(-2),goal:h(2),hostile:1,members:army.map(u=>u.uid),phase:'advance',mode:'envelopment',jobs:[]};
  return{changed:typeof wodAiExploitClearedFront==='function'&&wodAiExploitClearedFront(2,op,army),mode:op.mode};
 });
 results.clearedWing=await page.evaluate(()=>{
  world();const home=town(-26,0,2,'Home');town(20,0,1,'Next');for(const x of gameData.hexList)if(x.q<=5)x.owner=2;
  const army=Array.from({length:5},(_,i)=>unit(3,i*2-4));refresh();const {p}=planArmy(army,home);
  const op={id:'obsolete-wing',hexes:gameData.hexes,at:0,until:180000,anchor:h(-5),goal:h(2),hostile:1,members:army.map(u=>u.uid),initialN:16,phase:'advance',mode:'envelopment',jobs:[]};
  op.jobs=[{id:'old-wing',kind:'main',role:'left',members:op.members.slice(),frontOperation:op,holdHex:op.anchor,route:['-5,0','-5,8','8,8'],cursor:0,bound:0}];gameData._aiFrontOffensives[2]=op;
  const changed=typeof wodAiExploitClearedFront==='function'&&wodAiExploitClearedFront(2,op,army),goal=op.advanceGoal?.id,oldRoute=op.jobs.some(j=>j.route),roster=op.initialN;
  const trace=sim(40,p,army);return{changed,goal,oldRoute,roster,advanced:army.filter(u=>u.x>h(3).x+100).length,trace};
 });
 results.healthyContact=await page.evaluate(()=>{
  world();const home=town(-26,0,2,'Home');town(20,0,1,'Next');for(const x of gameData.hexList)if(x.q<=5)x.owner=2;
  const army=Array.from({length:6},(_,i)=>unit(3,i*2-5)),foe=unit(6,0,'light',1);refresh();planArmy(army,home);
  const op={id:'contact',hexes:gameData.hexes,anchor:h(-5),goal:h(2),hostile:1,members:army.map(u=>u.uid),initialN:6,phase:'advance',mode:'envelopment',jobs:[]};
  const premature=typeof wodAiExploitClearedFront==='function'&&wodAiExploitClearedFront(2,op,army);foe.hp=0;gameData.entities=gameData.entities.filter(u=>u!==foe);op.victoryCheckAt=null;refresh();
  const cleared=typeof wodAiExploitClearedFront==='function'&&wodAiExploitClearedFront(2,op,army);return{premature,cleared,goal:op.advanceGoal?.id};
 });
 results.uncertainContact=await page.evaluate(()=>{
  world();const home=town(-26,0,2,'Home'),next=town(20,0,1,'Known next');for(const x of gameData.hexList)if(x.q<=5)x.owner=2;
  const army=Array.from({length:6},(_,i)=>unit(3,i*2-5));refresh();planArmy(army,home);gameData.fogOfWar=true;gameData._factionIntel={};
  const intel=wodFogFactionIntel(2,true);intel.cities.set(next.id,{...next});
  const record={uid:'last-seen',owner:1,type:'light',x:h(6).x,y:0,hp:100,maxHp:100,damage:10,attackCooldown:2,range:50,speed:15,seenAt:0};intel.units.set(record.uid,record);gameData._aiEconomyClock=5;refresh();
  const op={id:'memory',hexes:gameData.hexes,anchor:h(-5),goal:h(2),hostile:1,members:army.map(u=>u.uid),initialN:6,phase:'advance',mode:'envelopment',jobs:[]};
  const remembered=wodAiThreats(2).some(e=>e.uid===record.uid&&e._intelMemory),continued=typeof wodAiExploitClearedFront==='function'&&wodAiExploitClearedFront(2,op,army);
  return{remembered,continued,goal:op.advanceGoal?.id};
 });
 results.rearStructure=await page.evaluate(()=>{
  world();const home=town(-26,0,2,'Home');town(20,0,1,'Next');for(const x of gameData.hexList)if(x.q<=5)x.owner=2;
  const rear=h(-5,8);rear.owner=1;gameData.hospitals=[{id:'Rear',q:rear.q,r:rear.r,x:rear.x,y:rear.y,owner:1}];
  const army=Array.from({length:5},(_,i)=>unit(3,i*2-4));refresh();planArmy(army,home);
  const op={id:'forward',hexes:gameData.hexes,anchor:h(-5),goal:h(2),hostile:1,members:army.map(u=>u.uid),initialN:5,phase:'consolidate',mode:'breakthrough',jobs:[]};
  const changed=wodAiContinueFrontOffensive(2,op,army);return{changed,goal:op.advanceGoal?.id,structure:op.advanceStructure?.id};
 });
 results.reservedOrders=await page.evaluate(()=>{
  world();const home=town(-26,0,2,'Home');town(20,0,1,'Next');for(const x of gameData.hexList)if(x.q<=5)x.owner=2;
  const army=Array.from({length:5},(_,i)=>unit(3,i*2-4));refresh();const {p,guard}=planArmy(army,home),emergency=army.pop();
  emergency.aiOrderUntil=guard.aiOrderUntil=77777;gameData._aiMoveQueue=new Map([[guard,{x:home.x,y:home.y}],[emergency,{x:home.x,y:home.y}]]);
  gameData._aiDefenseByOwner[2]={hexes:gameData.hexes,jobs:[{id:'urgent',kind:'counter',response:true,members:[emergency.uid]}],unitJob:{[emergency.uid]:'urgent'}};
  const op={id:'reserved',hexes:gameData.hexes,anchor:h(-5),goal:h(2),hostile:1,members:[...army,guard,emergency].map(u=>u.uid),initialN:7,phase:'consolidate',mode:'breakthrough',jobs:[]};
  const changed=wodAiContinueFrontOffensive(2,op,[...army,guard,emergency]);return{changed,protected:[guard,emergency].every(u=>u.aiOrderUntil===77777&&gameData._aiMoveQueue.has(u)&&!op.members.includes(u.uid))};
 });
 results.autonomous=await page.evaluate(()=>{
  world();town(-26,0,2,'Home');const first=town(3,0,1,'First'),next=town(20,0,1,'Next');unit(-26);
  const army=Array.from({length:9},(_,i)=>unit(-3-(i%2),i*2-8,i===0?'heavy':'light'));refresh();
  gameData.aiTimer=gameData.aiStrategyTimer=0;
  const trace=sim(300,null,army);return{first:first.owner,next:next.owner,firstAt:trace.find(s=>s.cities.find(c=>c.id==='First').owner===2)?.t,nextAt:trace.find(s=>s.cities.find(c=>c.id==='Next').owner===2)?.t,advanced:army.filter(u=>u.x>h(12).x).length,trace};
 });
 console.log('handoffs',JSON.stringify({quietSweep:{...results.quietSweep,trace:undefined},capturePlan:results.capturePlan,contestedWing:results.contestedWing,clearedWing:{...results.clearedWing,trace:undefined}}));
 await page.evaluate(()=>{UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.style.display='block';gameData.layers.territory=true;gameData.camera={zoom:.7,x:-350,y:-450};wodMarkTerrainFullDirty();updateTerrainCache();draw();});
 await page.screenshot({path:path.join(OUT,'continuity.png')});fs.writeFileSync(path.join(OUT,'state.json'),await page.evaluate(()=>render_game_to_text()));
 if(process.env.OBSERVE_ONLY!=='1'){
  assert(results.chain.cities.every(c=>c.owner===2)&&results.chain.secondAt<=140&&results.chain.guard,'a successful army promptly captures successive weak towns without abandoning its guard');
  assert(results.local.advanced>=4&&results.local.guard,'a completed sector advances along the current front instead of returning to the original rally');
  assert(results.quietSweep.meanX>=190&&results.quietSweep.land>=70&&results.quietSweep.guard,'a quiet successful force advances through deeper territory with a continuing direction');
  assert(results.capturePlan.same&&results.capturePlan.unchanged>=8&&results.capturePlan.newGuard===1&&results.capturePlan.lossReplanned&&!results.capturePlan.staleGuard,'capturing a town adds one guard without rebuilding the army; losing an asset still replans');
  assert(!results.contestedWing.changed&&results.contestedWing.mode==='envelopment','a substantial live defense retains its encirclement plan');
  assert(results.clearedWing.changed&&results.clearedWing.goal==='Next'&&!results.clearedWing.oldRoute&&results.clearedWing.roster===5&&results.clearedWing.advanced>=4,'a victorious remnant abandons its obsolete wing and physically advances as the same viable force');
  assert(!results.healthyContact.premature&&results.healthyContact.cleared&&results.healthyContact.goal==='Next','friendly paint alone does not declare victory while a healthy defender remains');
  assert(results.uncertainContact.remembered&&results.uncertainContact.continued&&results.uncertainContact.goal==='Known next','a small last-seen contact does not freeze a superior force after its cleared objective');
  assert(results.rearStructure.changed&&results.rearStructure.goal==='Next'&&!results.rearStructure.structure,'the main victorious force does not reverse toward a distant structure behind its completed objective');
  assert(results.reservedOrders.changed&&results.reservedOrders.protected,'continuing an offensive preserves queued garrison and emergency defense orders');
  assert(results.autonomous.first===2&&results.autonomous.next===2&&results.autonomous.advanced>=3,'the complete autonomous AI captures consecutive undefended towns without manual orders');
 }
 assert.deepEqual(errors,[]);
 }finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors));await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
