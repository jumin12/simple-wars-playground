'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/ai-mission-lifecycle',process.env.AUDIT_VERSION||'focused');
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

 results.marine=await page.evaluate(()=>{
  world();town(-26,0,2,'Home');town(18,0,1,'Weak');const u=unit(-3,0,'marine');refresh();
  gameData.aiMoneyByOwner[2]=100000;gameData.aiManpowerByOwner[2]=100000;
  u._navalAssaultUntil=999999;wodAiMaintainMissions(2,[]);gameData._aiEconomyClock=13;wodAiMaintainMissions(2,[]);
  const order=!!u.target,goal=u._navalAssaultGoal?.id,start=u.x;
  sim(20,null,[u]);return{order,goal,moved:u.x-start,groundLease:u._aiMarineGroundUntil>13000};
 });
 assert(results.marine.order&&results.marine.goal==='Weak'&&results.marine.moved>50&&results.marine.groundLease,'a marine with an orphaned lease receives and physically follows a land objective');

 results.waterMarine=await page.evaluate(()=>{
  world();for(const p of gameData.hexList)if(p.r>=1&&p.r<=4){p.type='water';p.owner=0;}
  town(-26,-8,2,'Home');town(26,-8,1,'Enemy');const u=unit(-8,2,'marine');refresh();
  gameData._navalCoastCells={hexes:gameData.hexes,cells:gameData.hexList.filter(p=>!isWaterHex(p)&&getNeighborHexes(p).some(wodIsOpenWaterHex))};
  wodAiMaintainMissions(2,[]);gameData._aiEconomyClock=13;wodAiMaintainMissions(2,[]);const ordered=!!u.target;const start={x:u.x,y:u.y};sim(25,null,[u]);
  return{ordered,moved:Math.hypot(u.x-start.x,u.y-start.y),dry:!isWaterHex(getNearestHexToPoint(u.x,u.y)),errors:wodAiDiagnostics(2).counts};
 });
 assert(results.waterMarine.ordered&&results.waterMarine.moved>30&&results.waterMarine.dry,'an idle marine in water receives a real sea route and reaches dry shore');
 results.ferry=await page.evaluate(()=>{
  world();for(const p of gameData.hexList)if(Math.abs(p.q)<=8){p.type='water';p.owner=0;}
  const home=town(-10,0,2,'Home');home.hasHarbor=true;town(24,0,1,'Enemy');
  const t=unit(0,0,'transport'),cargo=unit(-12,0);t.cargo=cargo;cargo.boardTransportUid=t.uid;gameData.entities=gameData.entities.filter(u=>u!==cargo);t._aiFleetId='expired';t.ferryGoal={x:h(16).x,y:h(16).y};refresh();
  wodAiMaintainMissions(2,[t]);gameData._aiEconomyClock=61;wodAiMaintainMissions(2,[t]);
  const returning=t._aiFerryReturning,sails=wodAiFerryCanSail(t),goal={...t.ferryGoal},start=t.x;
  for(let i=0;i<2400&&t.cargo;i++){wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();}
  return{returning,sails,goal,moved:t.x-start,unloaded:!t.cargo&&gameData.entities.includes(cargo),cargoX:cargo.x,homeX:home.x};
 });
 assert(results.ferry.returning&&results.ferry.sails&&results.ferry.goal.x<0&&results.ferry.moved<-100&&results.ferry.unloaded&&results.ferry.cargoX<0,'an orphaned loaded ferry returns and physically unloads at its safe home coast');
 results.liveFleet=await page.evaluate(()=>{
  world();for(const p of gameData.hexList)if(Math.abs(p.q)<=8){p.type='water';p.owner=0;}
  town(-10,0,2,'Home');town(24,0,1,'Enemy');const t=unit(0,0,'transport'),cargo=unit(-12);t.cargo=cargo;cargo.boardTransportUid=t.uid;gameData.entities=gameData.entities.filter(u=>u!==cargo);t._aiFleetId='active';t.ferryGoal={x:h(14).x,y:h(14).y};
  gameData.aiNavalPlans={2:{id:'active',hexes:gameData.hexes,phase:'prepare',at:0,progressAt:0,troops:[cargo.uid],ferries:[t.uid],support:[],escorts:[],goal:h(14),landing:h(14),rendezvous:h(-8)}};refresh();
  wodAiMaintainMissions(2,[t]);gameData._aiEconomyClock=20;wodAiMaintainMissions(2,[t]);
  const retained=t._aiFleetId==='active'&&!t._aiFerryReturning;
  const unsafe=!wodAiFerryLandingSafe(t,h(10));const s=unit(8,0,'supply');refresh();const supported=wodAiFerryLandingSafe(t,h(10));
  return{retained,unsafe,supported};
 });
 assert(Object.values(results.liveFleet).every(Boolean),'live staging keeps ownership; unsupplied infantry cannot land until actual ship support arrives');
 results.stalledFleetMember=await page.evaluate(()=>{
  world();for(const p of gameData.hexList)if(Math.abs(p.q)<=8){p.type='water';p.owner=0;}
  const home=town(-10,0,2,'Home');town(24,0,1,'Enemy');const t=unit(0,0,'transport'),cargo=unit(-12);
  gameData.aiMoneyByOwner[2]=gameData.aiManpowerByOwner[2]=gameData.money=gameData.manpower=100000;
  t.cargo=cargo;cargo.boardTransportUid=t.uid;gameData.entities=gameData.entities.filter(u=>u!==cargo);t._aiFleetId='active';
  gameData.aiNavalPlans={2:{id:'active',hexes:gameData.hexes,phase:'prepare',at:0,progressAt:0}};refresh();wodAiMaintainMissions(2,[t]);
  gameData._aiEconomyClock=95;gameData.aiNavalPlans[2].progressAt=95000;wodAiMaintainMissions(2,[t]);const returning=t._aiFerryReturning;
  sim(70,null,[t]);return{returning,unloaded:!t.cargo&&gameData.entities.includes(cargo),home:cargo.x<0,alive:t.hp>0&&cargo.hp>0};
 });
 assert(Object.values(results.stalledFleetMember).every(Boolean),'another vessel cannot renew a motionless loaded ferry forever; it returns and physically unloads safely');

 results.raidExpiry=await page.evaluate(()=>{
  world();for(const p of gameData.hexList)if(p.r>=1&&p.r<=4){p.type='water';p.owner=0;}
  town(-26,-8,2,'Home');const goal=town(26,-8,1,'Enemy'),u=unit(-4,2,'marine'),now=100000;
  const raid={id:'stalled',at:0,phase:'crossing',source:h(-10),beach:h(10),town:goal,water:[h(-4,2),h(4,2)],ids:[u.uid]};
  u._aiMarineRaid=raid.id;u._aiMarineRaidOrder=raid.id;u._aiRaidProgress={id:raid.id,x:u.x,y:u.y,at:20000};u.target=h(4,2);
  gameData._aiMarineRaids={hexes:gameData.hexes,owners:{2:raid},checked:{},blocked:{}};gameData._aiEconomyClock=100;refresh();wodAiPlanMarineRaids(2,[u]);const original=u._aiRaidProgress.at;
  gameData._aiEconomyClock=112;wodAiPlanMarineRaids(2,[u]);
  return{original,expired:!gameData._aiMarineRaids.owners[2],released:!u._aiMarineRaid&&u._navalAssaultUntil===0};
 });
 assert(results.raidExpiry.original===20000&&results.raidExpiry.expired&&results.raidExpiry.released,'reissuing a stalled sea leg never manufactures motion progress or renews an abandoned raid forever');
 results.newRaidClock=await page.evaluate(()=>{
  world();for(const p of gameData.hexList)if(p.r>=1&&p.r<=4){p.type='water';p.owner=0;}
  town(-26,-8,2,'Home');const goal=town(26,-8,1,'Enemy'),u=unit(-4,2,'marine');
  const raid={id:'new-crossing',at:100000,phase:'crossing',source:h(-10),beach:h(10),town:goal,water:[h(-4,2),h(4,2)],ids:[u.uid]};
  u._aiMarineRaid=raid.id;u._aiRaidProgress={id:'old-crossing',x:u.x,y:u.y,at:0};
  gameData._aiMarineRaids={hexes:gameData.hexes,owners:{2:raid},checked:{},blocked:{}};gameData._aiEconomyClock=102;refresh();
  wodAiPlanMarineRaids(2,[u]);const alive=gameData._aiMarineRaids.owners[2]===raid;
  const start=u._aiRaidProgress.at,x=u.x;sim(8,null,[u]);
  return{alive,start,id:u._aiRaidProgress.id,moved:Math.abs(u.x-x),ordered:!!u.target};
 });
 assert(results.newRaidClock.alive&&results.newRaidClock.start===102000&&results.newRaidClock.id==='new-crossing'&&results.newRaidClock.moved>10,'a veteran marine starts a new real crossing with a new mission clock and physically moves');
 results.groundRecovery=await page.evaluate(()=>{
  world();const home=town(-26,0,2,'Home'),enemy=town(26,0,1,'Enemy'),army=Array.from({length:6},(_,i)=>unit(-10,i));
  gameData.aiMoneyByOwner[2]=gameData.aiManpowerByOwner[2]=gameData.money=gameData.manpower=100000;
  const {p,guard}=planArmy(army,home),op={id:'stranded',hexes:gameData.hexes,at:0,until:999999,phase:'advance',anchor:h(-10),goal:enemy,members:army.map(u=>u.uid),jobs:[]};
  op.jobs=[{id:'stranded-breakthrough',kind:'main',role:'breakthrough',response:true,members:op.members.slice(),frontOperation:op,holdHex:h(-10),bound:0}];
  gameData._aiFrontOffensives={2:op};refresh();wodAiMaintainGroundWork(2,p,[...army,guard]);gameData._aiEconomyClock=46;wodAiMaintainGroundWork(2,p,[...army,guard]);
  const recovered=!!wodAiDiagnostics(2).counts['field-mission-recovered'],start=army.reduce((n,u)=>n+u.x,0)/army.length;
  for(const u of army)wodAiIssueFrontOffensive(u,op.jobs[0]);sim(25,null,army);
  return{recovered,moved:army.reduce((n,u)=>n+u.x,0)/army.length-start,guard:guard.x===home.x&&guard.y===home.y&&!guard.target,alive:army.every(u=>u.hp>0),dry:army.every(u=>!isWaterHex(getNearestHexToPoint(u.x,u.y)))};
 });
 assert(results.groundRecovery.recovered&&results.groundRecovery.moved>80&&results.groundRecovery.guard&&results.groundRecovery.alive&&results.groundRecovery.dry,'a healthy stranded cohort resumes a real advance without recalling its guard or entering water');
 results.groundWorkSafety=await page.evaluate(()=>{
  world();const home=town(-26,0,2,'Home');town(26,0,1,'Enemy');const army=Array.from({length:6},(_,i)=>unit(-8,i)),{p,guard}=planArmy(army,home);
  const op={id:'fixing',hexes:gameData.hexes,at:0,until:999999,phase:'advance',anchor:h(-8),goal:h(1),members:army.map(u=>u.uid),jobs:[],frontageTask:{role:'pin',until:999999}};
  op.jobs=[{id:'fixing-pin',kind:'hold',role:'pin',members:op.members.slice(),frontOperation:op}];gameData._aiFrontOffensives={2:op};
  const patient=army[0];patient._medicalRecovering=true;army[1]._combatEngaged=true;refresh();wodAiMaintainGroundWork(2,p,[...army,guard]);gameData._aiEconomyClock=60;wodAiMaintainGroundWork(2,p,[...army,guard]);
  return{retained:gameData._aiFrontOffensives[2]===op&&op.jobs[0].id==='fixing-pin',patient:patient._medicalRecovering,guard:!guard.target,recovered:wodAiDiagnostics(2).counts['field-mission-recovered']||0};
 });
 assert(results.groundWorkSafety.retained&&results.groundWorkSafety.patient&&results.groundWorkSafety.guard&&!results.groundWorkSafety.recovered,'purposeful fixing formations, healing patients and garrisons retain command ownership');
 results.deepSupplyExit=await page.evaluate(()=>{
  world();for(const p of gameData.hexList)p.owner=p.q<=-4?2:1;const home=town(-8,0,2,'Home');town(26,0,1,'Enemy');const u=unit(12);h(12).owner=2;u.outOfSupplySeconds=3;
  gameData.aiMoneyByOwner[2]=gameData.aiManpowerByOwner[2]=gameData.money=gameData.manpower=100000;refresh();
  const ordered=wodAiSupplyExit(u,{kind:'main'}),target=u.orderTarget,start=u.x;sim(35,null,[u]);
  return{ordered,home:target&&Math.hypot(target.x-home.x,target.y-home.y)<1,moved:u.x-start,alive:u.hp>0,dry:!isWaterHex(getNearestHexToPoint(u.x,u.y))};
 });
 assert(results.deepSupplyExit.ordered&&results.deepSupplyExit.home&&results.deepSupplyExit.moved<-150&&results.deepSupplyExit.alive&&results.deepSupplyExit.dry,'an isolated unit beyond the local scan physically escapes toward its real city through dry terrain');
 results.supplyExit=await page.evaluate(()=>{
  world();town(-26,0,2,'Home');town(26,0,1,'Enemy');const marine=unit(-2,0,'marine');h(-2).owner=1;h(-2).type='grass';marine.outOfSupplySeconds=3;refresh();
  const exited=wodAiSupplyExit(marine,{kind:'main'}),exit=marine.orderTarget;
  const supplied=unit(-10,0,'marine');refresh();const noExit=!wodAiSupplyExit(supplied,{kind:'main'});
  h(-2).type='water';h(-2).owner=0;marine.target=null;refresh();const waterExempt=!wodAiSupplyExit(marine,{kind:'main'});
  return{exited,target:!!exit,noExit,waterExempt};
 });
 assert(Object.values(results.supplyExit).every(Boolean),'genuinely isolated marines seek real supply while city-connected and water-exempt marines retain their missions');
 results.intent=await page.evaluate(()=>{
  world();town(-26,0,2,'Home');town(26,0,1,'Enemy');const u=unit(-4),op={id:'same',phase:'gather',goal:h(6)},job={id:'job',kind:'main',members:[u.uid],frontOperation:op};gameData.aiTaskForces[2]={jobs:[job],unitJob:{[u.uid]:job.id}};refresh();
  const a=wodAiMoveIntentKey(u);op.phase='advance';const b=wodAiMoveIntentKey(u);op.goal=h(12);const c=wodAiMoveIntentKey(u);
  return{phaseStable:a===b,goalChanges:b!==c};
 });
 assert(Object.values(results.intent).every(Boolean),'physical intent survives a harmless phase change and changes with its actual objective');
 results.replacement=await page.evaluate(()=>{
  world();const home=town(-26,0,2,'Home');town(26,0,1,'Enemy');const u=unit(-26);u.hp=u.maxHp*.5;u.manpower=500;u._medicalRecovering=true;
  const cost=getUnitCost('ship');gameData._aiEconomyPlans={2:{savingFor:'ship',desired:{light:1}}};gameData.aiManpowerByOwner[2]=cost.manpower-100;gameData._wodSimTick=1;refresh();
  const amount=wodAiReplacementAllowance(u,100,.05),mpBefore=wodPlayerMpPool(2),hpBefore=u.hp;gameData._wodSimTick++;updateUnitHealing(u,.05);
  return{protected:gameData._aiEconomyPlans[2].replacementBudget.protectedMp,expected:cost.manpower,amount,healed:u.hp>hpBefore,spent:mpBefore-wodPlayerMpPool(2),human:wodAiReplacementAllowance({owner:1},100,.05)};
 });
 assert(results.replacement.protected===results.replacement.expected&&results.replacement.amount>0&&results.replacement.amount<100&&results.replacement.healed&&results.replacement.spent>0&&results.replacement.human===100,'transient ship savings reserve recruitment manpower while paying for limited real healing');
 results.reservation=await page.evaluate(()=>{
  world();const port=town(-26,0,2,'Home');port.hasHarbor=true;town(26,0,1,'Enemy');for(const p of gameData.hexList)if(p.r< 0){p.type='water';p.owner=0;}
  const army=Array.from({length:12},(_,i)=>unit(-20,i));gameData.aiManpowerByOwner[2]=0;gameData.aiMoneyByOwner[2]=100000;refresh();
  const plan={},demand={desired:{light:12,ship:1},types:['ship','light'],missing:[],atRisk:false,expedition:{goal:h(26),preferred:['ship']}};
  const first=wodAiProcurementReserve(2,[port],army,[],demand,plan,100),deadline=first?.deadline;
  gameData._aiEconomyClock=181;const next=wodAiProcurementReserve(2,[port],army,[],demand,plan,100);
  return{type:first?.type,deadline,released:!next,cooldown:plan.reserveFailures.ship>181};
 });
 assert(results.reservation.type==='ship'&&results.reservation.deadline<=180&&results.reservation.released&&results.reservation.cooldown,'unproductive specialist savings expire despite slow income progress and permit fallback recruitment');
 await page.evaluate(()=>{UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.style.display='block';gameData.camera={zoom:.7,x:-350,y:-450};wodMarkTerrainFullDirty();updateTerrainCache();draw();});
 await page.screenshot({path:path.join(OUT,'mission-lifecycle.png')});fs.writeFileSync(path.join(OUT,'state.json'),await page.evaluate(()=>render_game_to_text()));
 assert.deepEqual(errors,[]);console.log(JSON.stringify(results,null,2));
 }finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({results,errors},null,2));await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
