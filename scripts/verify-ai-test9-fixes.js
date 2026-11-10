'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{spawn}=require('child_process'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),ENGINE=process.env.GAME_ENGINE?path.resolve(ROOT,process.env.GAME_ENGINE):ROOT,OUT=path.join(ROOT,'output/ai-test9',process.env.AUDIT_VERSION||'current');fs.mkdirSync(OUT,{recursive:true});
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
if(wanted('missions')){
 results.missions=await page.evaluate(()=>{
  world();const home=town(-25,0,2,'Home');town(25,0,1,'Enemy');const army=[unit(-8),unit(-8,2),unit(-8,-2)],u=army[0],{plan}=planFor(army,[home]);refresh();
  u._medicalRecovering=true;u._aiMission={id:'previous',kind:'offensive',until:20000};u.aiOrderUntil=12345;
  const queued={x:h(-20).x,y:h(-20).y};gameData._aiMoveQueue=new Map([[u,queued]]);
  const before=JSON.stringify(u._aiMission);for(let i=0;i<50;i++){wodAiGetUnitTaskJob(u);wodAiMoveIntentKey(u);}
  const pure=JSON.stringify(u._aiMission)===before&&u.aiOrderUntil===12345&&gameData._aiMoveQueue.get(u)===queued;
  const oldGroup=u.aiTfJobId;wodAiIssueTaskForceOrder(u,plan.jobs[0],.4);
  return{pure,recoveryKept:u._aiMission?.kind==='recovery',groupKept:u.aiTfJobId===oldGroup,queuedKept:gameData._aiMoveQueue.get(u)===queued};
 });
 assert(results.missions.pure,'mission/intention queries must not rewrite command state or delete queued movement');
 assert(results.missions.recoveryKept&&results.missions.groupKept&&results.missions.queuedKept,'ordinary offensive dispatch must leave medical recovery and its queued route intact');
}
if(wanted('performance')){
 results.performance=await page.evaluate(()=>{
  world();town(-20,0,2,'Home');town(20,0,1,'Enemy');const a=unit(-4),b=unit(4,0,'heavy',1);refresh();let comparisons=0,maxError=0;
  for(const type of ['light','motorized','heavy','mountaineer','marine','ship','transport','supply'])for(const terrain of ['grass','forest','hill','mountain','urban','sand','swamp']){
   const original={...a,type,_campAtkMult:1.15,_campDefMult:.85},copy={...original,_observerOwner:2},view=wodAiThreatView(original,2),hex={...h(-4),type:terrain};
   const values=[wodAiUnitCombatPower(copy,hex),wodAiDpsAgainst(copy,b,2,hex)],actual=[wodAiUnitCombatPower(view,hex),wodAiDpsAgainst(view,b,2,hex)];
   for(let i=0;i<values.length;i++)maxError=Math.max(maxError,Math.abs(values[i]-actual[i]));comparisons+=values.length;
   original.x+=100;original.hp=1;if(view.x!==copy.x||view.hp!==copy.hp)maxError=Infinity;
  }
  const source={...a};for(let i=0;i<180;i++)source['_history'+i]={path:[],at:i};let checksum=0,start=performance.now();for(let i=0;i<20000;i++)checksum+=({...source,_observerOwner:2}).hp;const cloneMs=performance.now()-start;
  start=performance.now();for(let i=0;i<20000;i++)checksum+=wodAiThreatView(source,2).hp;const viewMs=performance.now()-start;
  return{comparisons,maxError,cloneMs,viewMs,checksum};
 });
 assert.equal(results.performance.maxError,0,'lightweight threat snapshots preserve all native power/DPS estimates and observable position/health');
}
if(wanted('ambush')){
 results.ambush=await page.evaluate(()=>{
  world();const home=town(-30,0,2,'Home');town(25,0,1,'Enemy');const army=[unit(-4),unit(-6,0,'heavy'),unit(-4,-4),unit(-4,-6),unit(-4,4),unit(-4,6),unit(-6,-2),unit(-6,2)],{guards}=planFor(army,[home]),foes=[unit(6,-1,'light',1),unit(6,1,'light',1)];gameData._aiEconomyClock=10;refresh();
  const op={id:'refused-lure',hexes:gameData.hexes,at:0,until:240000,anchor:h(-4),goal:h(6),hostile:1,members:army.map(u=>u.uid),phase:'advance',jobs:[],ambush:{stage:'lure',at:0,stageAt:0,approach:{at:0,distance:500},center:h(2),rear:h(-8),start:h(-4),wings:[h(-4,-5),h(-4,5)],ax:1,ay:0,width:gameData.hexRadius*5,bait:army[0].uid,contacts:foes.map(u=>u.uid)}};
  op.jobs=[{id:'bait',role:'bait',members:[army[0].uid],holdHex:h(-4)},{id:'left',role:'ambush-left',members:army.slice(2,4).map(u=>u.uid),holdHex:h(-4,-5)},{id:'right',role:'ambush-right',members:army.slice(4,6).map(u=>u.uid),holdHex:h(-4,5)},{id:'pin',role:'ambush-pin',members:[army[1].uid,...army.slice(6).map(u=>u.uid)],holdHex:h(-6)}].map(j=>({...j,kind:'main',response:true,frontOperation:op,bound:0}));
  const emptyRejected=wodAiSpringAmbush(2,op,army,[])===false;
  wodAiCombatContext(2)['ambush-cut:'+op.id]=null;
  const offMapRejected=wodAiSpringAmbush(2,op,army,[{...foes[0],x:1e9,y:1e9}])===false;
  for(let i=0;i<foes.length;i++){const at=h(-6,i?1:-1);foes[i].x=at.x;foes[i].y=at.y;}refresh();
  wodAiStepAmbush(2,op,army);const leftClosingRadius=!!op.ambush&&op.ambush.closingAt!=null;
  for(let i=0;i<foes.length;i++){const at=h(6,i?1:-1);foes[i].x=at.x;foes[i].y=at.y;}refresh();
  op.ambush.checkedAt=-10000;delete op.ambush.closingAt;
  const distance=foes.reduce((n,e)=>n+Math.hypot(e.x-op.ambush.center.x,e.y-op.ambush.center.y),0)/foes.length;op.ambush.approach.distance=distance;gameData._aiFrontOffensives={2:op};
  wodAiStepAmbush(2,op,army);const adapted=!op.ambush,mode=op.mode,wings=op.jobs.filter(j=>j.route).length;
  return{adapted,mode,wings,emptyRejected,offMapRejected,leftClosingRadius,guard:Math.hypot(guards[0].x-home.x,guards[0].y-home.y)<30};
 });
 assert(results.ambush.adapted&&results.ambush.wings===2&&results.ambush.guard,'a staged superior force converts a refused lure into two legal attacking wings promptly');
 assert(results.ambush.emptyRejected&&results.ambush.offMapRejected&&results.ambush.leftClosingRadius,'an ambush safely rejects empty/out-of-map closing routes when tracked contacts leave the closing radius');
}
if(wanted('procurement')){
 results.procurement=await page.evaluate(()=>{
  world();const home=town(-20,0,2,'Home');home.hasFactory=home.hasFarm=true;town(20,0,1,'Enemy');const army=Array.from({length:14},(_,i)=>unit(-10-i%4,-6+Math.floor(i/4)*3));refresh();
  const cost=getUnitCost('heavy'),light=getUnitCost('light'),demand={desired:{light:22,heavy:4},types:['heavy','light'],missing:[],lineDeficit:0,atRisk:false,reinforcements:[{id:'depleted',source:home.id,type:'light',n:1,priority:52}]};
  gameData.aiMoneyByOwner[2]=light.money+100;const plan={reservation:{type:'heavy',since:0,progressAt:0}},first=wodAiProcurementReserve(2,[home],army,[],demand,plan,100);
  const firstType=first?.type,queued=firstType==='light'&&wodApplyBuildAtCityForOwner(home,firstType,2);
  gameData.constructionJobs=[];gameData.aiMoneyByOwner[2]=cost.money-10;const nearPlan={reservation:{type:'heavy',since:0,progressAt:0}},near=wodAiProcurementReserve(2,[home],army,[],demand,nearPlan,100);
  return{firstType,queued,nearType:near?.type};
 });
 assert.equal(results.procurement.firstType,'light','an affordable third regiment for an understrength squad precedes a distant duplicate armor purchase');
 assert(results.procurement.queued&&results.procurement.nearType==='heavy','reinforcements use real paid construction while nearly funded armor retains its savings');
}
if(wanted('naval')){
 results.naval=await page.evaluate(()=>{
  world();for(const x of gameData.hexList){x.type='water';x.owner=0;if(x.q<=-10){x.type='grass';x.owner=2;}if(x.q>=10){x.type='grass';x.owner=1;}}
  const home=town(-12,0,2,'Home'),enemy=town(12,0,1,'Enemy'),u=unit(-11,0),t=unit(-8,0,'transport'),support=unit(0,0,'supply');
  t.cargo=u;gameData.entities=gameData.entities.filter(e=>e!==u);t._aiFerryMission=true;t._aiFleetId='invasion';t.ferryGoal={x:enemy.x,y:enemy.y};t._aiCargoWatch={cargo:u.uid,x:t.x,y:t.y,at:0,retryAt:0};
  support.target={x:t.x,y:t.y};support.orderTarget={x:t.x,y:t.y};support._aiWork={progressAt:95000};
  gameData._aiEconomyClock=100;const mission={id:'invasion',hexes:gameData.hexes,owner:2,phase:'prepare',reason:'gathering',at:0,progressAt:95000,canSail:false,requiredSupply:1,support:[support.uid],escorts:[],transports:[t.uid],troops:[u.uid],landing:h(10)};gameData.aiNavalPlans={2:mission};refresh();wodAiMaintainMissions(2,[t]);
  const waited=!t._aiFerryReturning&&t._aiFleetId==='invasion';
  support.target=null;support._aiWork.progressAt=0;gameData._aiEconomyClock=400;wodAiMaintainMissions(2,[t]);const recovered=!!t._aiFerryReturning;
  return{waited,recovered};
 });
 assert(results.naval.waited,'a loaded invasion waits for physically approaching required supply support instead of prematurely unloading at home');
 assert(results.naval.recovered,'a genuinely stalled unsupported wave still safely recovers after its bounded assembly window');
}
if(wanted('corridors')){
 results.corridors=await page.evaluate(()=>{
  world();for(const x of gameData.hexList){x.owner=2;if(x.q===-6){x.type='water';x.owner=0;}if(x.q< -6)x.owner=1;}
  town(-3,12,2,'Home');const u=unit(-2),foe=unit(-7,0,'heavy',1),gate=h(-5);refresh();
  const cut={id:'bank-warning',kind:'corridor',holdHex:gate,screenPoints:[gate],cutHexes:[gate],riskUnits:new Set([u.uid]),atRisk:1,predictive:true,closureSeconds:8,withdrawSeconds:20};
  const defense={hexes:gameData.hexes,jobs:[],unitJob:{},corridors:[cut],supplyDistance:new Map([[getHexKey(h(-2)),10],[getHexKey(gate),5]])};gameData._aiDefenseByOwner[2]=defense;
  const acrossRiver=!!wodAiCorridorWithdrawal(u);
  // Open a real crossing and put the threat on the gate's approach.
  h(-6).type='grass';h(-6).owner=1;gameData._wodLandTopologyVersion=(gameData._wodLandTopologyVersion||0)+1;gameData._navalPathTerrainVersion=(gameData._navalPathTerrainVersion||0)+1;
  foe.x=h(-5,-2).x;foe.y=h(-5,-2).y;gameData._aiEconomyClock=2;refresh();cut._holdStamp=null;cut._captureThreatStamp=null;
  const threatened=!!wodAiCorridorWithdrawal(u);foe.hp=0;gameData._aiEconomyClock=4;refresh();
  const released=!wodAiCorridorWithdrawal(u);
  return{acrossRiver,threatened,released};
 });
 assert(!results.corridors.acrossRiver,'an enemy across an impassable river cannot force an evacuation of the land corridor');
 assert(results.corridors.threatened&&results.corridors.released,'a physically reachable closing force triggers withdrawal, which releases when that force is gone');
 results.supplyEscape=await page.evaluate(()=>{
  world();for(const x of gameData.hexList)x.owner=x.q===0?1:2;town(-18,0,2,'Home');const u=unit(4),foe=unit(0,0,'heavy',1);u.outOfSupplySeconds=3;refresh();
  const started=wodAiSupplyExit(u,null),safeRoute=!!u._wodRiskRetreat,goal=u.orderTarget;
  const kept=wodAiShouldKeepCurrentOrder(u);sim(60);const here=getNearestHexToPoint(u.x,u.y);
  return{started,safeRoute,kept,supplied:wodCurrentSupplyComponent(here,2).city,hp:u.hp,goal};
 });
 assert(results.supplyEscape.started&&results.supplyEscape.safeRoute&&results.supplyEscape.kept&&results.supplyEscape.supplied&&results.supplyEscape.hp>0,'a real pocket escape uses the native danger-aware retreat route and physically reaches supply without being reassigned midway');
}
if(wanted('objectives')){
 results.objectives=await page.evaluate(()=>{
  world();const home=town(-25,0,2,'Home'),enemy=town(5,0,1,'Enemy'),army=[unit(-3,-1),unit(-3,1)],{plan,guards}=planFor(army,[home]);refresh();
  const op={id:'pair',at:0,until:300000,phase:'gather',mode:'breakthrough',anchor:h(-3),goal:enemy,advanceGoal:enemy,strategicGoal:enemy,hostile:1,frontOwner:1,members:army.map(u=>u.uid),jobs:[]};
  const job={id:'pair-main',kind:'main',role:'breakthrough',members:op.members.slice(),holdHex:op.anchor,frontOperation:op};op.jobs=[job];op.hexes=gameData.hexes;gameData._aiFrontOffensives={2:op};gameData._aiEconomyClock=20;
  const decision=wodAiCommandDecision(2,op),start=army.map(u=>u.x);
  const trace=[];sim(75,()=>{const a=wodAiIssueFrontOffensive(army[0],job),b=wodAiIssueFrontOffensive(army[1],job);if(trace.length<5)trace.push({a,b,phase:op.phase,available:wodAiSquadAvailable(2,op).length,t:army[0].target,queued:gameData._aiMoveQueue?.has(army[0]),job:army[0]._aiMission});});
  const progressed=army.every((u,i)=>u.x>start[i]+80),urban=getCityUrbanTerrainHexes(enemy),taken=urban.filter(x=>x.owner===2).length;
  const stranger=unit(-5,6,'heavy',1);stranger.hp=stranger.maxHp;refresh();op.commandDecision=null;army[1].hp=army[1].maxHp*.7;stranger.x=army[0].x+40;stranger.y=army[0].y;refresh();
  const contested=wodAiCommandDecision(2,op);
  return{decision:decision.phase,progressed,taken,total:urban.length,guard:Math.hypot(guards[0].x-home.x,guards[0].y-home.y)<30,contested:contested.phase,positions:army.map(u=>({x:u.x,y:u.y,target:u.orderTarget,phase:u.aiOrderPhase})),stage:op.phase,trace};
 });
 assert.equal(results.objectives.decision,'advance','a coherent supplied pair can clear an undefended nearby objective instead of waiting forever for a third unit');
 assert(results.objectives.progressed&&results.objectives.taken>0&&results.objectives.guard,'the pair physically advances, captures town cells and preserves its home guard: '+JSON.stringify(results.objectives));
 assert.notEqual(results.objectives.contested,'advance','a depleted pair still respects real local opposition');
 await snapshot('objective-pair');
}
assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify(results));
}finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({results,errors},null,2));await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
