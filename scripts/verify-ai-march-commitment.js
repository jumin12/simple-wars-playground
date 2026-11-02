'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{spawn}=require('child_process');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/ai-march-commitment');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{const f=path.resolve(ROOT,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(ROOT+path.sep))return res.writeHead(403).end();fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[path.extname(f)]||'application/octet-stream');res.end(b);});});
(async()=>{
 const relay=new WebSocketServer({port:8080});relay.on('error',()=>{});relay.on('connection',s=>s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]})));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),results={},errors=[];
 await context.routeWebSocket(/.*/,s=>{s.onMessage(()=>{});s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]}));});page.on('pageerror',e=>errors.push(e.stack));page.setDefaultTimeout(180000);
 try{
  await page.goto(url+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks);
  await page.evaluate(()=>{
   setGameSpeed(0,true);wodDismissChangelogPopup();cancelAnimationFrame(animationFrameId);
   window.marchWorld=()=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(28);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.alliances=[];gameData._aiFrontSupport=new WeakMap();gameData._aiLocalSituation=new WeakMap();gameData._aiDefenseByOwner={};gameData.aiTaskForces={};gameData.aiBattlePlans={};gameData.aiCommanderProfiles={2:'balanced'};gameData._aiEconomyClock=0;gameData.aiTimer=gameData.aiStrategyTimer=gameData.convoyTimer=gameData._transportAiTimer=-1e6;gameData.money=gameData.manpower=100000;gameData.aiMoneyByOwner={2:100000};gameData.aiManpowerByOwner={2:100000};for(const h of gameData.hexList){h.type='grass';h.owner=h.q<=0?2:1;h.cityId=null;}};
   window.mh=(q,r=0)=>gameData.hexes[q+','+r];
   window.mt=(q,r,owner,id)=>{const h=mh(q,r);h.type='urban';h.owner=owner;h.cityId=id;const c={id,name:id,q,r,x:h.x,y:h.y,owner,hp:1000,maxHp:1000};gameData.cities.push(c);return c;};
   window.mu=(q,r=0,type='light',owner=2)=>{const h=mh(q,r),u=createUnitAt(type,h.x,h.y,owner,{startSpawn:true});u.x=u._drawX=h.x;u.y=u._drawY=h.y;u.isGeneral=false;return u;};
   window.mr=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();gameData._citySupplyCache=null;gameData._aiArrivalCache=null;gameData._aiCombatContexts={};gameData._aiLocalSituation=new WeakMap();wodInvalidateAiFrontlineHexCache();};
   window.ms=seconds=>{for(let i=0;i<Math.round(seconds*20);i++){wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();}};
  });
  results.reinforcements=await page.evaluate(()=>{
   marchWorld();const city=mt(-20,0,2,'Home');mt(20,0,1,'Enemy');const guard=mu(-20),front=[mu(0,-2),mu(0,1)],rear=[mu(-14,-5),mu(-14,-1),mu(-14,3),mu(-14,7)];mu(2,-2,'heavy',1);mu(2,2,'light',1);mr();
   const jobs=[{id:'guard',kind:'defend',role:'defend',city,members:[guard.uid]},{id:'push',kind:'main',role:'main',members:front.map(u=>u.uid)},{id:'reserve',kind:'reserve',role:'reserve',holdHex:mh(-15),attackHex:mh(2),members:rear.map(u=>u.uid)}],plan=gameData.aiTaskForces[2]={jobs,unitJob:Object.fromEntries(jobs.flatMap(j=>j.members.map(id=>[id,j.id])))};
   const ready=[guard,...front,...rear];wodAiRefreshFrontSupport(2,plan,ready);const borrowed=rear.filter(u=>wodAiFrontSupportFor(u,jobs[2])),targets=borrowed.map(u=>getHexKey(wodAiFrontSupportFor(u,jobs[2]).h)),start=borrowed.map(u=>u.x);
   gameData._aiEconomyClock=3;wodAiRefreshFrontSupport(2,plan,ready);const same=borrowed.every((u,i)=>getHexKey(wodAiFrontSupportFor(u,jobs[2])?.h)===targets[i]);
   for(let n=0;n<14;n++){for(const u of borrowed){const j=jobs[2];if(!wodAiShouldKeepCurrentOrder(u))wodAiIssueTaskForceOrder(u,j,1);}ms(2.5);wodAiRefreshFrontSupport(2,plan,ready);}
   const advanced=borrowed.filter((u,i)=>u.x>start[i]+gameData.hexRadius*4).length;
   const u=borrowed[0];gameData._aiDefenseByOwner[2]={unitJob:{[u.uid]:'urgent-cut'}};wodAiRefreshFrontSupport(2,plan,ready);const emergencyReleased=!wodAiFrontSupportFor(u,jobs[2]);
   return{borrowed:borrowed.length,same,advanced,emergencyReleased,guardHeld:plan.unitJob[guard.uid]==='guard'};
  });assert(results.reinforcements.borrowed>=2&&results.reinforcements.same&&results.reinforcements.advanced>=2&&results.reinforcements.emergencyReleased&&results.reinforcements.guardHeld,JSON.stringify(results.reinforcements));
  results.contactIdentity=await page.evaluate(()=>{
   marchWorld();mt(-20,0,2,'Home');mt(20,0,1,'Enemy');const army=[mu(-4,-4),mu(-4,-1),mu(-4,2),mu(-4,5)],foe=mu(1,0,'light',1);mr();const ids=[],members=[];
   for(let i=0;i<8;i++){foe.y=mh(1,(i%3)-1).y;gameData._aiEconomyClock=i*3;mr();const d=wodAiReadDefense(2,army,true),j=d.jobs.find(j=>j.kind==='territory');if(j){ids.push(j.id);members.push(j.members.slice().sort().join(','));}}
   return{samples:ids.length,identities:new Set(ids).size,rosters:new Set(members).size};
  });assert(results.contactIdentity.samples===8&&results.contactIdentity.identities===1&&results.contactIdentity.rosters===1,JSON.stringify(results.contactIdentity));
  results.counteradvance=await page.evaluate(()=>{
   marchWorld();mt(-20,0,2,'Home');mt(20,0,1,'Enemy');const army=[mu(-4,-3),mu(-4,0),mu(-4,3),mu(-5,5,'heavy')],foe=mu(1,0,'light',1);mr();
   const job={id:'stable-front',kind:'territory',role:'fix',response:true,holdHex:mh(0),contactPoint:{x:foe.x,y:foe.y},contacts:[foe.uid],members:army.map(u=>u.uid)},plan=gameData.aiTaskForces[2]={jobs:[job],unitJob:Object.fromEntries(army.map(u=>[u.uid,job.id]))};gameData._aiDefenseByOwner[2]={jobs:[job],unitJob:plan.unitJob};
   const start=army.map(u=>u.x);let attacking=false;
   for(let n=0;n<12;n++){for(const u of army)if(u.hp>0){u.aiTfJobId=job.id;u.aiTfKind='territory';if(!wodAiShouldKeepCurrentOrder(u))wodAiIssueTaskForceOrder(u,job,u.hp/u.maxHp);}attacking ||= !!job.responseState?.attack;ms(2);}
   return{attacking,advanced:army.filter((u,i)=>u.x>start[i]+gameData.hexRadius*3).length,foeHp:foe.hp,terrain:mh(0).owner};
  });assert(results.counteradvance.attacking&&results.counteradvance.advanced>=3,JSON.stringify(results.counteradvance));
  await page.evaluate(()=>{UI.panels.forEach(p=>p.classList.add('hidden'));UI.mainMenu.classList.add('hidden');UI.inGameUI.style.display='block';gameData.layers.territory=true;gameData.camera={zoom:1.6,x:-canvas.clientWidth/2,y:-canvas.clientHeight/2};wodMarkTerrainFullDirty();updateTerrainCache();draw();});await page.screenshot({path:path.join(OUT,'counteradvance.png')});
  results.outnumbered=await page.evaluate(()=>{marchWorld();mt(-20,0,2,'Home');mt(20,0,1,'Enemy');const u=mu(-4);const foes=[mu(1,-2,'heavy',1),mu(1,0,'heavy',1),mu(1,2,'heavy',1)];mr();const job={id:'weak-front',kind:'territory',holdHex:mh(-1),contactPoint:{x:mh(1).x,y:0},members:[u.uid],contacts:foes.map(u=>u.uid)};const ordered=wodAiIssueTerritoryResponse(u,job);return{ordered,attack:job.responseState?.attack,friendly:!u.orderTarget||getNearestHexToPoint(u.orderTarget.x,u.orderTarget.y).owner===2};});assert(results.outnumbered.ordered&&!results.outnumbered.attack&&results.outnumbered.friendly,JSON.stringify(results.outnumbered));
  results.adjacentSupport=await page.evaluate(()=>{marchWorld();mt(-20,0,2,'Home');mt(20,0,1,'Enemy');const u=mu(-2),helpers=[mu(-1,-1,'heavy'),mu(-1,1,'heavy')],foe=mu(1,0,'heavy',1);mr();const job={id:'supported-front',kind:'territory',holdHex:mh(-1),contactPoint:{x:foe.x,y:foe.y},members:[u.uid],contacts:[foe.uid]};wodAiIssueTerritoryResponse(u,job);const attack=job.responseState?.attack,count=job.responseGathered;for(const helper of helpers)helper.x=mh(-15).x;gameData._aiEconomyClock=2;mr();wodAiIssueTerritoryResponse(u,job);return{attack,count,distantIgnored:job.responseGathered===1&&!job.responseState?.attack};});assert(results.adjacentSupport.attack&&results.adjacentSupport.count===3&&results.adjacentSupport.distantIgnored,JSON.stringify(results.adjacentSupport));
  results.replan=await page.evaluate(()=>{
   marchWorld();mt(-20,0,2,'Home');mt(20,0,1,'Enemy');const army=[mu(-8,0,'heavy'),...Array.from({length:14},(_,i)=>mu(-10-i%3,(Math.floor(i/3)-2)*3))];mr();const first=wodAiEnsureTaskForcePlan(2,army),j=first.jobs.find(j=>j.kind==='armor'&&j.objectiveCity);if(!j)throw Error('missing original assault');const key=j.objectiveCity.id,op={id:key,stage:'attack',stageAt:0,roster:j.members.length,commitUntil:25000};j.phase='assault';j.stage='attack';j.operationState=op;first.landOperations={[key]:op};first.assetSignature='routine-assets-changed';gameData._aiEconomyClock=12;
   const next=wodAiEnsureTaskForcePlan(2,army),replacement=next.jobs.find(j=>j.kind==='armor'&&j.members.includes(army[0].uid));
   const preserved=next!==first&&next.landOperations[key]===op&&replacement?.stage==='attack'&&replacement.objectiveCity?.id===key;
   const realDefeat=wodAiOperationMustRecover(op,army,{strategicMaintain:false,forecast:{ratio:.5}},12000);
   return{preserved,realDefeat};
  });assert(results.replan.preserved&&results.replan.realDefeat,JSON.stringify(results.replan));
  results.withdrawal=await page.evaluate(()=>{
   marchWorld();mt(-20,0,2,'Home');mt(20,0,1,'Enemy');const u=mu(-2),foes=[mu(1,-2,'heavy',1),mu(1,0,'heavy',1),mu(1,2,'heavy',1)];mr();
   const started=wodAiTacticalFallback(u,{id:'push',kind:'main'}),goal=u._aiWithdrawal?.goal;gameData.entities=[u];mr();ms(9);
   const stillTravelling=!!u.target&&Math.hypot(u.x-mh(...goal.split(',').map(Number)).x,u.y-mh(...goal.split(',').map(Number)).y)>gameData.hexRadius*1.5;
   const kept=wodAiTacticalFallback(u,{id:'push',kind:'main'},false)&&u._aiWithdrawal?.goal===goal;
   ms(30);const finished=!wodAiTacticalFallback(u,{id:'push',kind:'main'},false);
   return{started,stillTravelling,kept,finished};
  });assert(results.withdrawal.started&&results.withdrawal.stillTravelling&&results.withdrawal.kept&&results.withdrawal.finished,JSON.stringify(results.withdrawal));
  results.cancelledWithdrawal=await page.evaluate(()=>{
   marchWorld();mt(-20,0,2,'Home');mt(20,0,1,'Enemy');const u=mu(-2);mu(1,-2,'heavy',1);mu(1,0,'heavy',1);mu(1,2,'heavy',1);mr();assignUnitMoveAlongWaypoints(u,[mh(5)]);
   gameData._wodPfFrameActive=true;const started=wodAiTacticalFallback(u,{id:'push',kind:'main'});gameData._wodPfFrameActive=false;
   const goal=gameData.hexes[u._aiWithdrawal.goal];gameData._aiMoveQueue.delete(u);gameData.entities=[u];mr();wodAiTacticalFallback(u,{id:'push',kind:'main'});
   return{started,reissued:Math.hypot(u.orderTarget.x-goal.x,u.orderTarget.y-goal.y)<gameData.hexRadius};
  });assert(results.cancelledWithdrawal.started&&results.cancelledWithdrawal.reissued,JSON.stringify(results.cancelledWithdrawal));
  results.slots=await page.evaluate(()=>{marchWorld();mt(-20,0,2,'Home');const goal=mt(20,0,1,'Enemy'),army=Array.from({length:6},(_,i)=>mu(-12,i*3-8)),job={id:'slots',members:army.map(u=>u.uid)};mr();const anchor=mh(-4),initial=army.map(u=>getHexKey(wodAiFormationSlot(u,job,anchor,goal,army)));let stable=true;for(let i=0;i<8;i++)for(const [n,u]of army.entries()){u.x+=.4;stable&&=getHexKey(wodAiFormationSlot(u,job,anchor,goal,army))===initial[n];}return{stable,unique:new Set(initial).size};});assert(results.slots.stable&&results.slots.unique===6,JSON.stringify(results.slots));
  results.rally=await page.evaluate(()=>{marchWorld();mt(-20,0,2,'Home');const goal=mt(20,0,1,'Enemy'),army=[mu(-12,-2),mu(-11,2),mu(-18,0)],job={id:'rally',members:army.map(u=>u.uid),holdHex:mh(-1)};mr();wodAiRefreshRally(2,job,army,goal);const lead=job._rallyLead,x=job.holdHex.x;army[2].x=mh(-8).x;gameData._aiEconomyClock=5;wodAiRefreshRally(2,job,army,goal);return{sameLead:job._rallyLead===lead,forward:job.holdHex.x>=x};});assert(results.rally.sameLead&&results.rally.forward,JSON.stringify(results.rally));
  results.trafficResume=await page.evaluate(()=>{
   marchWorld();mt(-20,0,2,'Home');mt(20,0,1,'Enemy');const u=mu(-12),goal=mh(12),start=u.x;mr();assignUnitMoveAlongWaypoints(u,[goal]);
   const detour=mh(-10,3),record={points:wodUnitRemainingMarchPoints(u),idle:false,internal:false,owner:2,leader:'already-passed',x:detour.x,y:detour.y,ax:1,ay:0,until:25};
   const sidestepped=wodPlanTrafficDetour(u,[detour],record);ms(45);
   return{sidestepped,resumed:!u._trafficYield&&Math.hypot(u.orderTarget.x-goal.x,u.orderTarget.y-goal.y)<1,advanced:u.x>start+gameData.hexRadius*4};
  });assert(results.trafficResume.sidestepped&&results.trafficResume.resumed&&results.trafficResume.advanced,JSON.stringify(results.trafficResume));
  await page.evaluate(()=>{UI.panels.forEach(p=>p.classList.add('hidden'));UI.mainMenu.classList.add('hidden');UI.inGameUI.style.display='block';gameData.layers.territory=true;gameData.camera={zoom:.8,x:-canvas.clientWidth/2,y:-canvas.clientHeight/2};wodMarkTerrainFullDirty();updateTerrainCache();draw();});await page.screenshot({path:path.join(OUT,'march-fixture.png')});assert.deepEqual(errors,[]);
  if(process.env.RUN_SKILL_CLIENT==='1'){
   const client=path.join(OUT,'skill-client.mjs');fs.copyFileSync(path.join(process.env.USERPROFILE,'.codex/skills/develop-web-game/scripts/web_game_playwright_client.js'),client);const errorFile=path.join(OUT,'skill/errors-0.json');if(fs.existsSync(errorFile))fs.unlinkSync(errorFile);
   await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[client,'--url',url+'/?autostart=1','--actions-json',JSON.stringify({steps:[{buttons:[],frames:60},{buttons:['a'],frames:12},{buttons:[],frames:15}]}),'--iterations','1','--pause-ms','1000','--screenshot-dir',path.join(OUT,'skill')],{windowsHide:true,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code?reject(Error('skill client exit '+code)):resolve());});assert(!fs.existsSync(errorFile),'bundled game client has no renderer/console errors');
  }
  console.log(JSON.stringify(results,null,2));
 }finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors));await browser.close();server.close();for(const s of relay.clients)s.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
