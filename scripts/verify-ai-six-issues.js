'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/ai-six-issues',process.env.AUDIT_VERSION||'current');fs.mkdirSync(OUT,{recursive:true});
const ENGINE=process.env.GAME_ENGINE?path.resolve(ROOT,process.env.GAME_ENGINE):ROOT;
const server=http.createServer((req,res)=>{const name=decodeURIComponent(req.url.split('?')[0]),file=path.resolve(ENGINE,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(ENGINE+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[path.extname(file)]||'application/octet-stream');res.end(b);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[],results={};page.setDefaultTimeout(180000);page.on('pageerror',e=>errors.push(String(e.stack)));await context.routeWebSocket(/.*/,s=>{s.onMessage(()=>{});s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]}));});
const wanted=name=>!process.env.AI_CASE||process.env.AI_CASE===name;
const snapshot=async name=>{await page.evaluate(()=>{UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.style.display='block';gameData.layers.territory=true;gameData.camera={zoom:.9,x:-canvas.clientWidth/2,y:-canvas.clientHeight/2};wodMarkTerrainFullDirty();updateTerrainCache();draw();});await page.screenshot({path:path.join(OUT,name+'.png')});fs.writeFileSync(path.join(OUT,name+'-state.json'),await page.evaluate(()=>render_game_to_text()));};
try{await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks);
await page.evaluate(()=>{
 setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
 window.world=()=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(40);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;gameData.entities=[];gameData.nextUnitId=1;gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.alliances=[];gameData.aiTaskForces={};gameData.aiBattlePlans={};gameData.aiCommanderProfiles={2:'balanced'};gameData._aiEconomyPlans={};gameData._aiEconomyClock=0;gameData.aiTimer=gameData.aiStrategyTimer=gameData.convoyTimer=gameData._transportAiTimer=-1e6;gameData.aiMoneyByOwner={2:100000};gameData.aiManpowerByOwner={2:100000};gameData.money=gameData.manpower=100000;gameData._aiFrontOffensives={};gameData._aiFrontOffensiveChecks={};gameData._aiDefenseByOwner={};gameData._aiCombatContexts={};gameData._aiLocalSituation=new WeakMap();for(const h of gameData.hexList){h.type='grass';h.owner=h.q<0?2:1;h.cityId=null;}};
 window.h=(q,r=0)=>gameData.hexes[q+','+r];window.town=(q,r,owner,id)=>{const p=h(q,r);p.owner=owner;p.type='urban';p.cityId=id;const c={id,name:id,q,r,x:p.x,y:p.y,owner,hp:1000,maxHp:1000};gameData.cities.push(c);return c;};
 window.unit=(q,r=0,type='light',owner=2)=>{const p=h(q,r),u=createUnitAt(type,p.x,p.y,owner,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
 window.refresh=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();gameData._citySupplyCache=null;gameData._aiArrivalCache=null;gameData._aiCombatContexts={};gameData._aiLocalSituation=new WeakMap();wodInvalidateAiFrontlineHexCache();};
 window.makePlan=(army,home)=>{const guard=unit(home.q,home.r),jobs=[{id:'guard',kind:'defend',city:home,members:[guard.uid]},{id:'army',kind:'main',role:'main',members:army.map(u=>u.uid),holdHex:h(-3),attackHex:h(1),objectiveHex:h(1)}],unitJob=Object.fromEntries([[guard.uid,'guard'],...army.map(u=>[u.uid,'army'])]),p={jobs,unitJob,sectors:buildAiFrontlineSectors(2,16),readyN:army.length+1};gameData.aiTaskForces[2]=p;return{p,guard};};
 window.sim=(seconds,orders)=>{for(let i=0;i<seconds*20;i++){if(i%10===0){refresh();orders?.();}wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();}};
});
if(wanted('procurement')){
 results.procurement=await page.evaluate(()=>{
  world();for(const x of gameData.hexList)if(x.r>=1){x.type='water';x.owner=0;}const home=town(-14,0,2,'Harbor');home.hasHarbor=true;town(26,-10,1,'Enemy');const army=Array.from({length:12},(_,i)=>unit(-14+i%3,-3-Math.floor(i/3)*2));refresh();
  const demand={desired:{ship:1,light:20},types:['ship','light'],missing:[],atRisk:false},plan={};gameData._aiEconomyPlans[2]=plan;const cost=getUnitCost('ship');gameData.aiMoneyByOwner[2]=cost.money+3000;gameData.aiManpowerByOwner[2]=1000;
  const first=wodAiProcurementReserve(2,[home],army,[],demand,plan,100),initialDeadline=first?.deadline;
  gameData._aiEconomyClock=200;gameData.aiManpowerByOwner[2]=4000;const continuing=wodAiProcurementReserve(2,[home],army,[],demand,plan,100);const kept=continuing===first;
  gameData._aiEconomyClock=400;gameData.aiManpowerByOwner[2]=cost.manpower;const funded=wodAiProcurementReserve(2,[home],army,[],demand,plan,100);
  const before={money:wodPlayerTreasury(2),mp:wodPlayerMpPool(2)},queued=!!funded&&wodApplyBuildAtCityForOwner(home,'ship',2),paid={money:wodPlayerTreasury(2),mp:wodPlayerMpPool(2)};wodUpdateConstruction(30);const ship=gameData.entities.find(u=>u.owner===2&&u.type==='ship');
  const more={...demand,desired:{...demand.desired,ship:2}},dead={reservation:{type:'ship',since:0,deadline:100,progressAt:0,bestDeficit:1}};gameData._aiEconomyClock=200;gameData.aiManpowerByOwner[2]=0;const stalled=wodAiProcurementReserve(2,[home],army,[],more,dead,100);
  const emergency={reservation:{type:'ship',since:200,deadline:500,progressAt:200}};const released=wodAiProcurementReserve(2,[home],army,[],{...more,missing:[home]},emergency,100);
  return{initialDeadline,kept,queued,built:!!ship,water:ship&&wodIsOpenWaterHex(getNearestHexToPoint(ship.x,ship.y)),moneySpent:before.money-paid.money,mpSpent:before.mp-paid.mp,cost,stalledReleased:!stalled,emergencyReleased:!released};
 });
 assert(results.procurement.kept&&results.procurement.queued&&results.procurement.built&&results.procurement.water,'a progressing long reservation survives its original deadline and completes a real warship');assert.equal(results.procurement.moneySpent,results.procurement.cost.money);assert.equal(results.procurement.mpSpent,results.procurement.cost.manpower);assert(results.procurement.stalledReleased&&results.procurement.emergencyReleased,'stalled savings and urgent garrisons still release the reservation');
 await snapshot('funded-warship');
}
if(wanted('capture')){
 results.capture=await page.evaluate(()=>{
  world();const home=town(-28,0,2,'Home'),goal=town(18,0,1,'Objective'),army=Array.from({length:6},(_,i)=>unit(-8,i-3)),{p,guard}=makePlan(army,home);
  for(const at of getHexesInRadius(goal.q,goal.r,2)){const cell=h(at.q,at.r);cell.type='urban';cell.cityId=goal.id;cell.owner=1;}
  // This fixture extends a town after its supply footprint was already read.
  // Invalidate that fixture cache so the assertion tests all thirteen cells.
  delete goal._urbanHexCache;gameData._citySupplyCache=null;
  const op={id:'capture-operation',hexes:gameData.hexes,at:0,until:300000,anchor:h(-8),goal,advanceGoal:goal,strategicGoal:goal,phase:'advance',mode:'breakthrough',hostile:1,members:army.map(u=>u.uid),initialN:6,jobs:[]};op.jobs=[{id:'capture-job',kind:'main',role:'breakthrough',members:op.members.slice(),frontOperation:op,holdHex:op.anchor,bound:0}];gameData._aiFrontOffensives[2]=op;
  const distance=army.reduce((n,u)=>n+Math.hypot(u.x-goal.x,u.y-goal.y),0)/army.length;
  op.strategicWatch={key:goal.id,at:0,distance,urban:0,kills:0};op.effect={goal:goal.id,at:0,distance,kills:0,bound:0};gameData._aiEconomyClock=35;refresh();wodAiFrontProgress(2,op,army,[]);const retained=op.advanceGoal?.id===goal.id;
  if(retained)sim(200,()=>{for(const u of army.filter(u=>u.hp>0)){const j=wodAiGetUnitTaskJob(u);if(j&&!wodAiShouldKeepCurrentOrder(u))wodAiIssueTaskForceOrder(u,j,u.hp/u.maxHp);}});
  return{retained,owner:goal.owner,urbanCells:getCityUrbanTerrainHexes(goal).length,allUrban:getCityUrbanTerrainHexes(goal).every(h=>h.owner===2),guard:guard.hp>0&&Math.hypot(guard.x-home.x,guard.y-home.y)<30,alive:army.filter(u=>u.hp>0).length};
 });
 assert(results.capture.retained&&results.capture.owner===2&&results.capture.urbanCells>=9&&results.capture.allUrban&&results.capture.guard&&results.capture.alive>=5,'a town campaign retains its objective through a tactical pause and physically captures the whole multi-cell town without pulling its garrison');
 await snapshot('town-captured');
}
if(wanted('orders')){
 results.orders=await page.evaluate(()=>{
  world();const home=town(-28,0,2,'Home'),goal=town(20,0,1,'Enemy'),army=Array.from({length:3},(_,i)=>unit(-12,i*3)),{p}=makePlan(army,home),u=army[0];
  const op={id:'stable-operation',hexes:gameData.hexes,at:0,until:180000,anchor:h(-12),goal,advanceGoal:goal,strategicGoal:goal,phase:'advance',mode:'breakthrough',hostile:1,members:army.map(u=>u.uid),jobs:[]};const job={id:'stable-job',kind:'main',role:'breakthrough',frontOperation:op,members:op.members.slice(),holdHex:op.anchor,bound:0};op.jobs=[job];gameData._aiFrontOffensives[2]=op;refresh();
  const issued=wodAiMoveUnitTowardHex(u,h(-4),false,0),original={...u.orderTarget};gameData._aiEconomyClock=2;wodAiMoveUnitTowardHex(u,h(-18),false,0);const retained=u.orderTarget&&Math.hypot(u.orderTarget.x-original.x,u.orderTarget.y-original.y)<1;
  unit(-18,0,'light',1);refresh();wodAiMoveUnitTowardHex(u,h(-18),false,0);const rearContact=u.orderTarget&&u.orderTarget.x<u.x-100;
  gameData._aiDefenseByOwner[2]={hexes:gameData.hexes,jobs:[{id:'emergency',kind:'counter',city:home,members:[u.uid],holdHex:h(-20)}],unitJob:{[u.uid]:'emergency'}};wodAiMoveUnitTowardHex(u,h(-20),false,0);const emergency=u.orderTarget&&u.orderTarget.x<u.x-100;
  return{issued,retained,rearContact,emergency,humanUnaffected:!wodAiKeepMoveIntent({...u,owner:1},goal.x,goal.y,false)};
 });
 assert(Object.values(results.orders).every(Boolean),'an advancing squad ignores a backwards formation correction while real emergency and human orders retain authority');
}
if(wanted('supply')){
 results.supply=await page.evaluate(()=>{
  const cases=[];
  for(const patient of [false,true]){
   world();for(const x of gameData.hexList)x.owner=x.q<0||x.q>=2?2:1;town(-20,0,2,'Supply');const u=unit(3,0);u.outOfSupplySeconds=3;u._medicalRecovering=patient;if(patient){u.hp=80;u.manpower=800;}refresh();
   const job={id:'trapped-relief',kind:patient?'main':'relief',members:[u.uid]};gameData.aiTaskForces[2]={jobs:[job],unitJob:{[u.uid]:job.id},sectors:[]};
   const issued=wodAiShouldKeepCurrentOrder(u)&&!!u._aiSupplyExit;if(issued)sim(35,()=>{if(u.hp>0)wodAiShouldKeepCurrentOrder(u);});
   cases.push({patient,issued,throughOrderGate:true,alive:u.hp>0,supplied:!!wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),2).city,supply:u.outOfSupplySeconds,x:u.x});
  }
  world();for(const x of gameData.hexList)x.owner=x.q<0||x.q>=2?2:1;town(-20,0,2,'Supply');const u=unit(3,0);u.outOfSupplySeconds=3;u._aiReliefCommitUntil=10000;refresh();const protectedBreakout=!wodAiSupplyExit(u,{kind:'relief',breakoutReady:true,breakoutBalance:{ratio:1.3}});
  world();for(const x of gameData.hexList)x.owner=x.q<0||x.q>=2?2:1;town(-20,0,2,'Supply');const force=Array.from({length:4},(_,i)=>unit(3,i*2-3));for(const v of force)v.outOfSupplySeconds=4;refresh();
  const relief={id:'stalled-breakout',kind:'relief',members:force.map(v=>v.uid),holdHex:h(-2),innerHex:h(3),pocketKeys:new Set(force.map(v=>getHexKey(getNearestHexToPoint(v.x,v.y))))};
  const ready=wodAiReliefReady(force[0],relief),protectedWhileReady=!wodAiSupplyExit(force[0],relief);gameData._aiEconomyClock=9;const stalled=!wodAiReliefReady(force[0],relief),escapes=wodAiSupplyExit(force[0],relief);
  world();for(const x of gameData.hexList)x.owner=x.q<0||x.q>=2&&x.q<=5&&Math.abs(x.r)<=2?2:1;const home=town(-20,0,2,'Supply');const trapped=Array.from({length:4},(_,i)=>unit(3,i-2)),outside=Array.from({length:4},(_,i)=>unit(-3,i-2));for(const v of trapped)v.outOfSupplySeconds=4;makePlan([...trapped,...outside],home);refresh();const states=[];
  for(const seconds of [0,2,4,6,9]){gameData._aiEconomyClock=seconds;refresh();const d=wodAiReadDefense(2,gameData.entities.filter(v=>v.owner===2),true),j=d.jobs.find(j=>j.kind==='relief'&&j.members.includes(trapped[0].uid));if(!j)throw Error('Real defense planner did not allocate pocket relief');const committed=wodAiReliefReady(trapped[0],j);states.push({seconds,committed,progressAt:j.breakoutProgress?.at});}
  const live=gameData._aiDefenseByOwner[2].jobs.find(j=>j.kind==='relief'&&j.members.includes(trapped[0].uid)),releasedThroughRefresh=!states.at(-1).committed&&wodAiSupplyExit(trapped[0],live);
  return{cases,protectedBreakout,reliefProgress:{ready,protectedWhileReady,stalled,escapes},refreshProgress:{states,releasedThroughRefresh}};
 });
 assert(results.supply.cases.every(c=>c.issued&&c.alive&&c.supplied&&c.supply===0)&&results.supply.protectedBreakout,'stranded relief troops and isolated patients physically regain supply while a ready breakout keeps its command');
 assert(Object.values(results.supply.reliefProgress).every(Boolean),'a real live breakout quorum retains its orders, while eight seconds without physical movement releases an urgent stranded unit to escape');
 assert(results.supply.refreshProgress.states[0].committed&&results.supply.refreshProgress.releasedThroughRefresh,'actual defense-plan rebuilding must preserve physical breakout progress instead of restarting its stall clock');
}
if(wanted('water')){
 results.water=await page.evaluate(()=>{
  world();for(const x of gameData.hexList)if(Math.abs(x.q)<=1&&Math.abs(x.r)<=10){x.type='water';x.owner=0;}town(-24,0,2,'Home');const u=unit(-8),goal=h(8);refresh();wodAiMoveUnitTowardHex(u,h(-6),false,0);const original={...u.orderTarget},native=wodAiLandRoute;wodAiLandRoute=()=>null;
  const cold=wodAiMoveUnitTowardHex(u,goal,false,0),preserved=u.orderTarget&&Math.hypot(u.orderTarget.x-original.x,u.orderTarget.y-original.y)<1;wodAiLandRoute=native;
  let issued=false;for(let i=0;i<30&&!issued;i++){gameData._aiEconomyClock+=.5;issued=wodAiMoveUnitTowardHex(u,goal,false,0);}let dry=true;if(issued)for(let i=0;i<1200;i++){wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();if(wodIsOpenWaterHex(getNearestHexToPoint(u.x,u.y)))dry=false;}
  return{cold,preserved,issued,dry,alive:u.hp>0,moved:Math.hypot(u.x-h(-8).x,u.y-h(-8).y)};
 });
 assert(!results.water.cold&&results.water.preserved&&results.water.issued&&results.water.dry&&results.water.alive&&results.water.moved>100,'an incomplete dry-route search preserves the existing order, then completes a real dry detour instead of falling back into water');
}
if(wanted('ambush')){
 results.ambush=await page.evaluate(()=>{
  world();for(const x of gameData.hexList)if(x.q===0)x.owner=2;const home=town(-30,0,2,'Home');town(30,0,1,'Enemy');const bait=unit(0),army=[bait,unit(-6,0,'heavy'),unit(-4,-5),unit(-3,-4),unit(-2,-6),unit(-4,5),unit(-3,4),unit(-2,6)];army[1].isGeneral=true;const {p}=makePlan(army,home),foes=[unit(5,-1,'light',1),unit(5,1,'light',1),unit(6,0,'light',1)];
  const op={id:'distant-trap',hexes:gameData.hexes,at:0,until:180000,anchor:h(-1),goal:h(3),hostile:1,members:army.map(u=>u.uid),phase:'gather',mode:'breakthrough',jobs:[]};op.jobs=[{id:'trap-main',kind:'main',members:op.members.slice(),frontOperation:op,holdHex:op.anchor,bound:0}];gameData._aiFrontOffensives[2]=op;refresh();wodAiTryAmbush(2,op,army,wodAiThreats(2));for(const e of foes)e.x-=20;gameData._aiEconomyClock=2;refresh();const started=wodAiTryAmbush(2,op,army,wodAiThreats(2));
  for(let i=0;i<8;i++)unit(6+i%2,4+Math.floor(i/2),'heavy',1);gameData._aiEconomyClock=3;refresh();wodAiStepAmbush(2,op,army);
  return{started,retained:!!op.ambush,events:wodAiDiagnostics(2).counts};
 });
 assert(results.ambush.started&&results.ambush.retained,'a locally viable trap does not abort because distant reinforcements cannot reach its fighting ground in time');
}
if(wanted('naval')){
 results.naval=await page.evaluate(()=>{
  world();for(const x of gameData.hexList){if(Math.abs(x.q)<=3||x.q>3&&x.r>=0&&x.r<=2){x.type='water';x.owner=0;}else x.owner=x.q<0?2:1;}
  const home=town(-15,-8,2,'Home');home.hasHarbor=true;town(20,12,1,'Other island town');const army=[unit(-7,-9,'marine'),unit(-7,-7,'marine'),unit(-9,-8,'marine')];refresh();
  const at=h(8,-8),shore={id:'shore-8,-8',shore:true,x:at.x,y:at.y,owner:1};
  const first=wodAiChooseNavalMission(2,[],army,[shore],[]);gameData._aiEconomyClock=2;refresh();const second=wodAiChooseNavalMission(2,[],army,[shore],[]);
  const sea=wodAiSeaRegionFrom(2,army[0],shore),region=wodTransportLandingRegion({type:'light',owner:2},at);
  const outcome={first:first?.id,second:second?.id,same:!!first&&second?.id===first.id,firstAt:first?.at,secondAt:second?.at,goal:second?.goal?.id,phase:second?.phase,sea:sea?.size,region:region?.size,onSea:wodAiLandingOnSea(2,shore,sea),landing:wodAiInvasionBeach(2,shore,army[0])?.q,from:getNearestHexToPoint(army[0].x,army[0].y)?.q};
  world();for(const x of gameData.hexList){if(Math.abs(x.q)<=3||x.q>3&&x.r>=0&&x.r<=2){x.type='water';x.owner=0;}else x.owner=x.q<0?2:1;}
  const base=town(-4,-8,2,'Building harbor');town(20,12,1,'Enemy');const soldiers=[unit(-6,-9),unit(-6,-7),unit(-8,-8)],boat=unit(-2,-8,'transport');refresh();const paidHarbor=wodApplyBuildAtCityForOwner(base,'harbor',2);const preparing=wodAiChooseNavalMission(2,[boat],soldiers,[shore],[]);wodUpdateConstruction(50);gameData._aiEconomyClock=50;refresh();const waiting=wodAiChooseNavalMission(2,[boat],soldiers,[shore],[]);
  outcome.fundedPreparation={paidHarbor,first:preparing?.id,second:waiting?.id,pending:gameData.constructionJobs.some(j=>j.mode==='harbor'),same:!!preparing&&waiting?.id===preparing.id};return outcome;
 });
 assert(results.naval.same&&results.naval.goal==='shore-8,-8','an already known town on another island cannot restart an active coastal landing every scan');
 assert(results.naval.fundedPreparation.paidHarbor&&results.naval.fundedPreparation.pending&&results.naval.fundedPreparation.same,'a real sixty-second harbor build keeps its pending invasion alive beyond the forty-five-second staging timeout');
}
assert.deepEqual(errors,[]);console.log(JSON.stringify(results,null,2));
}finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({results,errors},null,2));await browser.close();server.close();}})().catch(e=>{console.error(e.stack);server.close();process.exitCode=1;});
