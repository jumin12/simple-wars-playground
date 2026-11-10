'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{spawn}=require('child_process'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),ENGINE=process.env.GAME_ENGINE?path.resolve(ROOT,process.env.GAME_ENGINE):ROOT,OUT=path.join(ROOT,'output/ai-five-fixes',process.env.AUDIT_VERSION||'current');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{const p=decodeURIComponent(req.url.split('?')[0]),f=path.resolve(ENGINE,'.'+(p==='/'?'/index.html':p));if(!f.startsWith(ENGINE+path.sep))return res.writeHead(403).end();fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[path.extname(f)]||'application/octet-stream');res.end(b);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[],results={};page.setDefaultTimeout(180000);page.on('pageerror',e=>errors.push(String(e.stack)));await context.routeWebSocket(/.*/,s=>{s.onMessage(()=>{});s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]}));});
const wanted=x=>!process.env.AI_CASE||process.env.AI_CASE===x;
const snapshot=async name=>{await page.evaluate(()=>{UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.style.display='block';gameData.layers.territory=true;gameData.camera={zoom:.85,x:-canvas.clientWidth/2,y:-canvas.clientHeight/2};wodMarkTerrainFullDirty();updateTerrainCache();draw();});await page.screenshot({path:path.join(OUT,name+'.png')});fs.writeFileSync(path.join(OUT,name+'-state.json'),await page.evaluate(()=>render_game_to_text()));};
try{await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks);
await page.evaluate(()=>{
 setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
 window.world=()=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(40);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;gameData.entities=[];gameData.nextUnitId=1;gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.alliances=[];gameData.aiTaskForces={};gameData.aiBattlePlans={};gameData.aiNavalPlans={};gameData.aiCommanderProfiles={2:'balanced'};gameData._aiEconomyPlans={};gameData._aiEconomyClock=0;gameData.aiTimer=gameData.aiStrategyTimer=gameData.convoyTimer=gameData._transportAiTimer=-1e6;gameData.aiMoneyByOwner={2:100000};gameData.aiManpowerByOwner={2:100000};gameData.money=gameData.manpower=100000;gameData._aiFrontOffensives={};gameData._aiDefenseByOwner={};gameData._aiCombatContexts={};gameData._aiLocalSituation=new WeakMap();for(const x of gameData.hexList){x.type='grass';x.owner=x.q<0?2:1;x.cityId=null;}};
 window.h=(q,r=0)=>gameData.hexes[q+','+r];window.town=(q,r,owner,id)=>{const x=h(q,r);x.owner=owner;x.type='urban';x.cityId=id;const c={id,name:id,q,r,x:x.x,y:x.y,owner,hp:1000,maxHp:1000};gameData.cities.push(c);return c;};
 window.unit=(q,r=0,type='light',owner=2)=>{const x=h(q,r),u=createUnitAt(type,x.x,x.y,owner,{startSpawn:true});u.x=u._drawX=x.x;u.y=u._drawY=x.y;u.isGeneral=false;return u;};
 window.refresh=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();gameData._citySupplyCache=null;gameData._aiArrivalCache=null;gameData._aiCombatContexts={};gameData._aiLocalSituation=new WeakMap();wodInvalidateAiFrontlineHexCache();};
 window.planFor=(army,homes,kind='main')=>{const guards=homes.map(c=>unit(c.q,c.r)),job={id:'field',kind,role:kind,members:army.map(u=>u.uid),holdHex:h(-5),attackHex:h(2),objectiveHex:h(2)},jobs=[job,...homes.map((c,i)=>({id:'guard-'+i,kind:'defend',city:c,members:[guards[i].uid]}))],unitJob=Object.fromEntries([...army.map(u=>[u.uid,job.id]),...guards.map((u,i)=>[u.uid,'guard-'+i])]),plan={jobs,unitJob,sectors:buildAiFrontlineSectors(2,12),readyN:army.length+guards.length};gameData.aiTaskForces[2]=plan;return{job,plan,guards};};
 window.sim=(seconds,orders)=>{for(let n=0;n<seconds*20;n++){if(n%10===0){refresh();orders?.();}wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();}};
});
if(wanted('cohorts')){
 results.cohorts=await page.evaluate(()=>{
  world();const home=town(-25,0,2,'Home');town(25,0,1,'Enemy');const army=Array.from({length:7},(_,i)=>unit(-8,-6+i*2));const {plan,guards}=planFor(army,[home]);refresh();wodAiPlanFrontOffensive(2,plan,gameData.entities.filter(u=>u.owner===2));const ops=wodAiActiveFrontOperations(2);
  return{sizes:ops.map(o=>o.members.length),unique:new Set(ops.flatMap(o=>o.members)).size,guardAssigned:ops.some(o=>o.members.includes(guards[0].uid))};
 });
 assert.deepEqual(results.cohorts.sizes,[7],'seven ready troops form one viable attack rather than fragile three/four-unit fragments');assert.equal(results.cohorts.unique,7);assert(!results.cohorts.guardAssigned);await snapshot('cohorts');
}
if(wanted('island-marine')){
 results.marine=await page.evaluate(()=>{
  world();for(const p of gameData.hexList){p.type='water';p.owner=0;if(p.q>=-24&&p.q<=-18&&Math.abs(p.r)<=4){p.type='grass';p.owner=2;}if(p.q>=2&&p.q<=18&&Math.abs(p.r)<=8){p.type='grass';p.owner=1;}}
  const home=town(-21,0,2,'Home');town(14,0,1,'Enemy');const marine=unit(-18,0,'marine');refresh();wodNavalWaterRegionKeys({type:'ship',owner:2},h(-17));
  const start={x:marine.x,y:marine.y};sim(150,()=>{wodAiMaintainMissions(2,[]);});
  return{moved:Math.hypot(marine.x-start.x,marine.y-start.y),goal:marine.orderTarget,hp:marine.hp,waterLost:marine.waterAttritionDamage||0};
 });
 assert(results.marine.moved>120,'an isolated idle marine receives and follows a useful sea movement instead of settling on its nearest friendly coast');assert(results.marine.hp>0);await snapshot('island-marine');
}
if(wanted('cityless-ferry')){
 results.cityless=await page.evaluate(()=>{
  world();for(const p of gameData.hexList){p.type='water';p.owner=0;if(p.q>=5&&p.q<=12&&Math.abs(p.r)<=5){p.type='grass';p.owner=2;}}
  town(10,0,1,'Lost town');const passenger=unit(6,0),ferry=unit(-5,0,'transport'),supply=unit(3,2,'supply');gameData.entities=gameData.entities.filter(u=>u!==passenger);ferry.cargo=passenger;passenger._navalEvacuating=true;passenger._medicalEvacuating=true;passenger._medicalEvacHome={id:'Lost town',x:h(10).x,y:h(10).y};ferry._aiMedicalFor=passenger.uid;ferry._aiFerryReturning=true;ferry._aiFerryMission=true;ferry.ferryGoal={x:h(10).x,y:h(10).y};refresh();
  sim(150,()=>{wodAiPlanMedicalFerries(2,[ferry]);wodAiMaintainMissions(2,[ferry]);});return{loaded:!!ferry.cargo,landed:gameData.entities.includes(passenger),hp:passenger.hp,supply:passenger.outOfSupplySeconds||0,position:{x:passenger.x,y:passenger.y},ferryGoal:ferry.ferryGoal,medical:!!passenger._medicalEvacuating};
 });
 assert(!results.cityless.loaded&&results.cityless.landed&&results.cityless.hp>0,'after the last town falls a loaded evacuation ferry finds a real supplied friendly shore');assert.equal(results.cityless.supply,0);await snapshot('cityless-ferry');
}
if(wanted('supply-arrival')){
 results.supplyArrival=await page.evaluate(()=>{
  world();for(const p of gameData.hexList){p.type='water';p.owner=0;if(p.q>=-30&&p.q<=-20&&Math.abs(p.r)<=5||p.q>=5&&p.q<=12&&Math.abs(p.r)<=5){p.type='grass';p.owner=2;}}
  town(-25,0,2,'Home');town(30,20,1,'Enemy');const infantry=unit(7,0),supply=unit(-19,0,'supply'),ferry=unit(4,0,'transport');refresh();wodAiRescueIslandTroops(2,[supply]);return{evacuating:!!infantry._navalEvacuating,boarding:infantry.boardTransportUid,landed:!!infantry._navalLanded,goal:infantry._navalAssaultGoal,supplyDistance:Math.hypot(supply.x-infantry.x,supply.y-infantry.y)};
 });
 assert(results.supplyArrival.evacuating&&results.supplyArrival.goal,'a distant ship sharing the ocean must not cancel urgent island evacuation');await snapshot('supply-arrival');
}
if(wanted('evacuation')){
 results.evacuation=await page.evaluate(()=>{
  world();for(const p of gameData.hexList){p.type='water';p.owner=0;if(p.q>=-24&&p.q<=-17&&Math.abs(p.r)<=5||p.q>=8&&p.q<=18&&Math.abs(p.r)<=7){p.type='grass';p.owner=2;}}
  const home=town(14,0,2,'Home');town(28,20,1,'Enemy');const general=unit(-20,0,'heavy'),ferry=unit(-16,0,'transport');general.isGeneral=true;general._navalLanded=true;unit(14,0);refresh();const start={x:general.x,y:general.y},trace=[];let boarded=false;
  sim(240,()=>{wodAiRetireBeachheads(2);wodAiPlanEvacuationFerries(2,[ferry]);if(ferry.cargo===general)boarded=true;if(Math.round(wodAiOperationTime())%10000<500)trace.push({t:wodAiOperationTime()/1000,hp:general.hp,evac:general._navalEvacuating,board:general.boardTransportUid,general:{x:general.x,y:general.y},ferry:{x:ferry.x,y:ferry.y,goal:ferry.orderTarget,cargo:ferry.cargo?.uid,pickup:ferry.pickupUid}});});
  return{boarded,loaded:!!ferry.cargo,alive:general.hp>0,moved:Math.hypot(general.x-start.x,general.y-start.y),onHome:wodTransportLandingRegion(general,home).has(getHexKey(getNearestHexToPoint(general.x,general.y))),supply:general.outOfSupplySeconds||0,events:wodAiDiagnostics(2).counts,trace};
 });
 assert(results.evacuation.boarded&&!results.evacuation.loaded&&results.evacuation.alive&&results.evacuation.onHome,'a healthy stranded general is physically picked up and returned, not repeatedly marked for redeployment');await snapshot('evacuation');
}
if(wanted('medical-route')){
 results.medical=await page.evaluate(()=>{
  world();for(const p of gameData.hexList){p.owner=2;if(p.q>=-3&&p.q<=3&&p.r<14){p.type='water';p.owner=0;}}
  const home=town(10,0,2,'Home');town(30,30,1,'Enemy');const u=unit(-12,0);u.hp=35;u.manpower=350;refresh();let wet=0,min=u.hp;
  sim(260,()=>{wodAiManageRecovery(2);if(wodUnitStandingOnOpenWater(u))wet++;min=Math.min(min,u.hp);});
  return{wet,hp:u.hp,min,alive:u.hp>0,homeDistance:Math.hypot(u.x-home.x,u.y-home.y),out:u.outOfSupplySeconds||0};
 });
 assert.equal(results.medical.wet,0,'medical travel takes the dry detour instead of swimming across the gulf');assert(results.medical.alive&&results.medical.hp>35,'patient actually reaches treatment');await snapshot('medical-route');
}
if(wanted('separate-seas')){
 results.seas=await page.evaluate(()=>{
  world();for(const p of gameData.hexList){p.type=p.q===0?'mountain':'water';p.owner=0;for(const [q,owner]of [[-27,2],[-10,1],[10,2],[27,1]])if(Math.abs(p.q-q)<=3&&Math.abs(p.r)<=4){p.type='grass';p.owner=owner;}}
  for(const [q,owner,id]of [[-27,2,'WestHome'],[-10,1,'WestEnemy'],[10,2,'EastHome'],[27,1,'EastEnemy']])town(q,0,owner,id);
  unit(-27,0);unit(10,0);const ferries=[unit(-23,0,'transport'),unit(14,0,'transport')];unit(-23,3,'supply');unit(14,3,'supply');const marines=[unit(-24,-2),unit(-24,2),unit(13,-2),unit(13,2)];refresh();wodAiPlanFerryAssaults(2,ferries);
  const missions=[...wodAiNavalMissionStore(2).values()];return{missions:missions.map(m=>({id:m.id,goal:m.goal.id,seaSize:m.sea.size,ships:m.transports})),distinctSeas:new Set(missions.map(m=>m.sea)).size,marineMissions:marines.map(u=>u._aiFleetId)};
 });
 assert.equal(results.seas.distinctSeas,2,'each disconnected sea retains its own expedition');assert.equal(new Set(results.seas.missions.map(m=>m.id)).size,2,'expedition identities are unique across seas');await snapshot('separate-seas');
}
if(wanted('fog-beachhead')){
 results.fogKnowledge=await page.evaluate(()=>{
  const run=north=>{world();for(const p of gameData.hexList){p.type='water';p.owner=0;if(p.q>=-30&&p.q<=-22&&Math.abs(p.r)<=6){p.type='grass';p.owner=2;}if(p.q>=2&&p.q<=29&&Math.abs(p.r)<=8){p.type='grass';p.owner=p.q>=17&&(north?p.r< -3:p.r>3)?1:0;}}
   town(-26,0,2,'Home');const enemy=town(24,north?-6:6,1,'Hidden town'),marines=[unit(2,-3,'marine'),unit(2,0,'marine'),unit(2,3,'marine')];for(const u of marines){u._navalLanded=true;claimTerritoryAroundUnit(u);}gameData.fogOfWar=true;gameData._factionIntel={};refresh();wodFogFactionIntel(2,true);const hidden=!wodAiKnownCities(2).some(c=>c.id===enemy.id);wodAiDirectBeachhead(2,[]);return{hidden,goals:marines.map(u=>u.orderTarget&&{x:u.orderTarget.x,y:u.orderTarget.y})};};return{north:run(true),south:run(false)};
 });
 assert(results.fogKnowledge.north.hidden&&results.fogKnowledge.south.hidden);assert(results.fogKnowledge.north.goals.some(Boolean),'a landed force with a reachable frontier immediately receives useful scouting work');assert.deepEqual(results.fogKnowledge.north.goals,results.fogKnowledge.south.goals,'changing only unseen territory must not change the landing force scouting orders');
 results.fogBeachhead=await page.evaluate(()=>{
  world();for(const p of gameData.hexList){p.type='water';p.owner=0;if(p.q>=-30&&p.q<=-22&&Math.abs(p.r)<=6){p.type='grass';p.owner=2;}if(p.q>=2&&p.q<=29&&Math.abs(p.r)<=8){p.type='grass';p.owner=p.q<15?0:1;}}
  town(-26,0,2,'Home');const enemy=town(24,0,1,'Hidden town'),marines=[unit(2,-3,'marine'),unit(2,0,'marine'),unit(2,3,'marine')];for(const u of marines){u._navalLanded=true;claimTerritoryAroundUnit(u);}gameData.fogOfWar=true;gameData._factionIntel={};refresh();wodFogFactionIntel(2,true);const initiallyHidden=!wodAiKnownCities(2).some(c=>c.id===enemy.id),start=marines.reduce((n,u)=>n+u.x,0)/marines.length;let scouts=0;
  sim(180,()=>{wodFogFactionIntel(2,true);wodAiDirectBeachhead(2,[]);if(marines.some(u=>u._aiBeachheadPlan?.kind==='scout'))scouts++;});
  return{initiallyHidden,advanced:marines.reduce((n,u)=>n+u.x,0)/marines.length-start,scouts,discovered:wodAiKnownCities(2).some(c=>c.id===enemy.id),alive:marines.every(u=>u.hp>0),owner:enemy.owner};
 });
 assert(results.fogBeachhead.initiallyHidden&&results.fogBeachhead.advanced>180&&results.fogBeachhead.alive,'a landed force explores inland frontiers without knowing a hidden town position');assert(results.fogBeachhead.discovered,'physical scouting discovers the inland town');await snapshot('fog-beachhead');
}
if(wanted('one-wing-cut')){
 results.oneWing=await page.evaluate(()=>{
  world();for(const p of gameData.hexList){p.owner=2;if(p.q>=1&&p.q<=8&&Math.abs(p.r)<=2||p.q>=9&&p.r===0)p.owner=1;if(p.q>=6&&p.r!==0)p.type='mountain';}
  const home=town(-28,0,2,'Home');town(30,0,1,'Enemy');const army=[unit(0),unit(-5,0,'heavy'),unit(-2,-6,'mountaineer'),unit(-2,-8,'mountaineer'),unit(-2,6),unit(-2,8),unit(-3,-2),unit(-3,2)],{guards}=planFor(army,[home]),foes=[unit(5,-1,'light',1),unit(5,1,'light',1)];refresh();const initialConnected=foes.every(u=>!wodGetUnitEncirclementState(u,getNearestHexToPoint(u.x,u.y)));
  const op={id:'terrain-cut',hexes:gameData.hexes,at:0,until:240000,anchor:h(-1),goal:h(5),hostile:1,members:army.map(u=>u.uid),phase:'advance',jobs:[],ambush:{stage:'lure',at:0,stageAt:0,center:h(1),rear:h(-4),start:h(0),wings:[h(-2,-7),h(-2,7)],ax:1,ay:0,width:gameData.hexRadius*5,bait:army[0].uid,contacts:foes.map(u=>u.uid),initial:foes.map(u=>({uid:u.uid,x:u.x,y:u.y}))}};
  op.jobs=[{id:'bait',role:'bait',members:[army[0].uid],holdHex:h(0)},{id:'top',role:'ambush-left',members:army.slice(2,4).map(u=>u.uid),holdHex:h(-2,-7)},{id:'bottom',role:'ambush-right',members:army.slice(4,6).map(u=>u.uid),holdHex:h(-2,7)},{id:'pin',role:'ambush-pin',members:[army[1].uid,...army.slice(6).map(u=>u.uid)],holdHex:h(-3)}].map(j=>({...j,kind:'main',response:true,frontOperation:op,bound:0}));gameData._aiFrontOffensives={2:op};
  const cut=wodAiCutObjective(2,army),sprung=wodAiSpringAmbush(2,op,army,foes),wings=op.jobs.filter(j=>j.route),start=army.slice(2,4).map(u=>({x:u.x,y:u.y}));
  sim(130,()=>{for(const u of army.filter(u=>u.hp>0)){const job=wodAiGetUnitTaskJob(u);if(job&&!wodAiShouldKeepCurrentOrder(u))wodAiIssueTaskForceOrder(u,job,u.hp/u.maxHp);}});
  return{initialConnected,cut:cut?.cutHexes,sprung,wings:wings.length,mountaineerWing:wings.some(j=>j.members.every(id=>army.slice(2,4).some(u=>u.uid===id))),moved:army.slice(2,4).map((u,i)=>Math.hypot(u.x-start[i].x,u.y-start[i].y)),captured:cut?.cutHexes.every(k=>gameData.hexes[k].owner===2),guard:guards[0].hp>0};
 });
 assert(results.oneWing.initialConnected&&results.oneWing.cut?.length&&results.oneWing.sprung&&results.oneWing.wings===1&&results.oneWing.mountaineerWing,'mountaineers can close a verified supply choke when the other wing is blocked by mountains');assert(results.oneWing.moved.every(d=>d>100)&&results.oneWing.captured&&results.oneWing.guard,'the legal wing physically captures the cut and retains its town guard');await snapshot('one-wing-cut');
}
if(wanted('escort-budget')){
 results.escortBudget=await page.evaluate(()=>{
  world();for(const p of gameData.hexList)if(Math.abs(p.q)<=4){p.type='water';p.owner=0;}
  const home=town(-6,0,2,'Home');home.hasHarbor=true;home.hasFactory=true;home.hasFarm=true;const enemy=town(6,0,1,'Enemy');const troops=Array.from({length:18},(_,i)=>unit(-12-i%3,-12+Math.floor(i/3)*4));unit(-6,0);const marines=[unit(-6,-3,'marine'),unit(-6,3,'marine')],ship=unit(-2,2,'ship'),foe=unit(2,2,'ship',1);for(const r of [-3,-1,1,3])unit(12,r,'light',1);refresh();
  const sea=wodAiSeaRegionFrom(2,ship);gameData.aiNavalPlans[2]={id:'blockaded',hexes:gameData.hexes,sea,at:0,goal:enemy,reason:'escort',phase:'prepare',requiredEscorts:2,canSail:false};
  const army=gameData.entities.filter(u=>u.owner===2),demand=wodAiRecruitPriorities(2,[home],army,[],{}),price=getUnitCost('ship');gameData.aiMoneyByOwner[2]=price.money-1;
  const budget=gameData._aiEconomyPlans[2]||=( {} );const reserved=wodAiProcurementReserve(2,[home],army,[],demand,budget,100);gameData.aiMoneyByOwner[2]+=price.money;
  wodRunAiSpawnBurstForOwner('2',{'2':[home]},{'2':100},{'2':30});const queued=gameData.constructionJobs.map(j=>j.mode);wodUpdateConstruction(30);
  return{desired:demand.desired.ship,preferred:demand.expedition.preferred,reason:gameData.aiNavalPlans[2].reason,reserved:reserved?.type,queued,ships:gameData.entities.filter(u=>u.owner===2&&u.type==='ship').length};
 });
 assert(results.escortBudget.desired>=2&&results.escortBudget.preferred[0]==='ship'&&results.escortBudget.reserved==='ship','a blocked expedition funds the missing escort before additional specialists');assert(results.escortBudget.queued.includes('ship')&&results.escortBudget.ships>=2,'the reserved escort is actually paid for and built');await snapshot('escort-budget');
}
if(wanted('invasion-wave')){
 results.invasionWave=await page.evaluate(()=>{
  world();for(const p of gameData.hexList)if(Math.abs(p.q)<=4){p.type='water';p.owner=0;}
  const home=town(-6,0,2,'Home'),enemy=town(6,0,1,'Enemy'),troops=Array.from({length:6},(_,i)=>unit(-10,-5+i*2));unit(-6,0);const supply=unit(-2,5,'supply'),ferries=[unit(-2,0,'transport')];for(const r of [-3,-1,1,3])unit(13,r,'light',1);
  const load=(t,u)=>{t.cargo=u;t._aiFerryMission=true;gameData.entities=gameData.entities.filter(v=>v!==u);};load(ferries[0],troops[0]);refresh();const before=wodAiChooseNavalMission(2,ferries,troops.slice(1),[enemy],[supply]),unsafe=before?.canSail,responders=before?.responseEnemies;
  for(let i=1;i<5;i++){const t=unit(-2,-5+i*2,'transport');load(t,troops[i]);ferries.push(t);}refresh();const after=wodAiChooseNavalMission(2,ferries,[troops[5]],[enemy],[supply]),attack={unsafe,responders,ready:after?.canSail,ratio:after?.waveRatio,wave:after?.waveTroops.length};
  world();for(const p of gameData.hexList){if(Math.abs(p.q)<=4){p.type='water';p.owner=0;}else if(p.q>4)p.owner=p.q<16?2:1;}town(-6,0,2,'Home');town(12,0,2,'Foothold');const next=town(25,0,1,'Next town'),guard=unit(12),passenger=unit(-8),transport=unit(-2,0,'transport');load(transport,passenger);refresh();const reinforcement=wodAiChooseNavalMission(2,[transport],[],[next],[]);return{...attack,reinforcement:reinforcement?.canSail};
 });
 assert(!results.invasionWave.unsafe,'one loaded regiment cannot launch into defenders able to reach its beach promptly');assert(results.invasionWave.ready&&results.invasionWave.wave>=5,'a physically loaded, superior wave is allowed to sail');assert(results.invasionWave.reinforcement,'a safe supplied foothold still accepts individual reinforcements');await snapshot('invasion-wave');
}
if(wanted('assembly-arrival')){
 results.assemblyArrival=await page.evaluate(()=>{
  world();for(const p of gameData.hexList){if(p.q>=0&&p.q<10){p.type='water';p.owner=0;}else p.owner=p.q<0?2:1;}
  town(-5,0,2,'Home');unit(-5,0);const enemy=town(18,0,1,'Enemy'),first=unit(-5,4),second=unit(-36,-4),a=unit(0,4,'transport'),b=unit(0,-4,'transport'),supply=unit(8,0,'supply');
  a.cargo=first;a._aiFerryMission=true;gameData.entities=gameData.entities.filter(u=>u!==first);refresh();const requested=wodOrderBoardTransport(second,b);b._aiFerryMission=true;let premature=false,joined=false,wait=0;
  sim(240,()=>{wodAiPlanFerryAssaults(2,[a,b]);if(b.cargo)joined=true;if(!joined&&a._aiFerryReturning)premature=true;if(!joined&&a.cargo)wait=wodAiOperationTime()/1000;});
  return{requested,premature,joined,wait,firstAlive:first.hp>0,secondAlive:second.hp>0,firstLanded:gameData.entities.includes(first)&&getNearestHexToPoint(first.x,first.y).q>=10,secondLanded:gameData.entities.includes(second)&&getNearestHexToPoint(second.x,second.y).q>=10,mission:{reason:gameData.aiNavalPlans[2]?.reason,canSail:gameData.aiNavalPlans[2]?.canSail},boats:[a,b].map(t=>({cargo:!!t.cargo,radius:t.radius,cargoRadius:t.cargo?.radius,land:t.unloadHexKey,returning:t._aiFerryReturning,goal:t.ferryGoal,target:t.orderTarget,x:t.x,y:t.y}))};
 });
 assert(results.assemblyArrival.requested&&results.assemblyArrival.joined,'the distant second passenger actually reaches and boards its ferry');assert(!results.assemblyArrival.premature,'a loaded ferry must not abandon a valid assembly while another assigned passenger makes real progress');assert(results.assemblyArrival.firstLanded&&results.assemblyArrival.secondLanded&&results.assemblyArrival.firstAlive&&results.assemblyArrival.secondAlive,'the assembled wave physically lands both living passengers');await snapshot('assembly-arrival');
}
if(wanted('incremental-route')){
 results.route=await page.evaluate(()=>{
  world();for(const p of gameData.hexList){p.type=p.q===0&&p.r<26?'mountain':'water';p.owner=0;}refresh();let path=[],calls=0,pending=0;
  do{path=wodAiMarineWaterPath(2,h(-28),h(28));if(path.pending)pending++;calls++;}while(path.pending&&calls<60);
  return{calls,pending,n:path.length,complete:path.length>0&&wodHexKeysEqual(path.at(-1),h(28)),legal:path.every(p=>wodIsOpenWaterHex(p))};
 });
 assert(results.route.pending>0&&results.route.complete&&results.route.legal,'budget-limited sea search resumes and completes a real safe route');await snapshot('incremental-route');
}
assert.deepEqual(errors,[]);console.log(JSON.stringify(results,null,2));
if(process.env.SKILL_CHECK==='1'){
 const {WebSocketServer}=require('../server/node_modules/ws'),relay=new WebSocketServer({port:8080,host:'127.0.0.1'});await new Promise((r,j)=>{relay.once('listening',r);relay.once('error',j);});relay.on('connection',s=>s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]})));
 try{const skill=path.join(require('os').homedir(),'.codex/skills/develop-web-game'),client=path.join(OUT,'client.mjs');fs.copyFileSync(path.join(skill,'scripts/web_game_playwright_client.js'),client);await new Promise((r,j)=>{const child=spawn(process.execPath,[client,'--url','http://127.0.0.1:'+server.address().port+'/?autostart=1','--actions-file',path.join(skill,'references/action_payloads.json'),'--iterations','1','--pause-ms','15000','--screenshot-dir',path.join(OUT,'skill')],{stdio:'inherit'});child.on('error',j);child.on('exit',c=>c?j(Error('Required client failed '+c)):r());});const state=JSON.parse(fs.readFileSync(path.join(OUT,'skill/state-0.json')));assert(state.landCells>0&&state.units?.length>0);const err=path.join(OUT,'skill/errors-0.json');if(fs.existsSync(err))assert.deepEqual(JSON.parse(fs.readFileSync(err)),[]);}finally{for(const s of relay.clients)s.terminate();await new Promise(r=>relay.close(r));}
}
}finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({results,errors},null,2));await browser.close();server.close();}})().catch(e=>{console.error(e.stack);server.close();process.exitCode=1;});
