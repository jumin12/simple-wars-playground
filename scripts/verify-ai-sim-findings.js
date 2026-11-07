'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/ai-sim-six-fixes/focused');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{const f=path.resolve(ROOT,'.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(ROOT+path.sep))return res.writeHead(403).end();fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'})[path.extname(f)]||'application/octet-stream');res.end(b);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true}),context=await browser.newContext(),page=await context.newPage(),errors=[],results={};page.on('pageerror',e=>errors.push(e.stack));page.setDefaultTimeout(180000);await context.routeWebSocket(/.*/,s=>{s.onMessage(()=>{});s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]}));});try{
await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks);
await page.evaluate(()=>{
 setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
 window.world=()=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(36);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;gameData.entities=[];gameData.nextUnitId=1;gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.alliances=[];gameData.aiTaskForces={};gameData.aiBattlePlans={};gameData.aiCommanderProfiles={2:'balanced'};gameData._aiEconomyClock=0;gameData.aiTimer=gameData.aiStrategyTimer=gameData.convoyTimer=gameData._transportAiTimer=-1e6;gameData.aiMoneyByOwner={2:0};gameData.aiManpowerByOwner={2:100000};gameData.money=gameData.manpower=100000;gameData._aiFrontOffensives={};gameData._aiFrontOffensiveChecks={};gameData._aiDefenseByOwner={};gameData._aiCombatContexts={};for(const h of gameData.hexList){h.type='grass';h.owner=h.q<=0?2:1;h.cityId=null;}};
 window.h=(q,r=0)=>gameData.hexes[q+','+r];window.unit=(q,r=0,type='light',owner=2)=>{const p=h(q,r),u=createUnitAt(type,p.x,p.y,owner,{startSpawn:true});u.isGeneral=false;u.x=u._drawX=p.x;u.y=u._drawY=p.y;return u;};
 window.town=(q,r,owner,id)=>{const p=h(q,r);p.type='urban';p.cityId=id;p.owner=owner;const c={id,name:id,q,r,x:p.x,y:p.y,owner,hp:1000,maxHp:1000};gameData.cities.push(c);return c;};
 window.refresh=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();gameData._citySupplyCache=null;gameData._aiArrivalCache=null;gameData._aiCombatContexts={};gameData._aiLocalSituation=new WeakMap();wodInvalidateAiFrontlineHexCache();};
 window.setup=(n=12)=>{world();const home=town(-24,0,2,'Home'),goal=town(24,0,1,'Enemy'),army=Array.from({length:n},(_,i)=>unit(-3-Math.floor(i/6)*2,(i%6-2.5)*2)),guard=unit(-24),jobs=[{id:'guard',kind:'defend',city:home,members:[guard.uid]},{id:'attack',kind:'main',members:army.map(u=>u.uid),holdHex:h(-2),attackHex:h(1),objectiveCity:goal}],p={jobs,unitJob:Object.fromEntries([...army.map(u=>[u.uid,'attack']),[guard.uid,'guard']]),sectors:[{holdHex:h(-2),attackHex:h(1)}],readyN:n+1};gameData.aiTaskForces[2]=p;refresh();wodAiPlanFrontOffensive(2,p,[...army,guard]);return{home,goal,army,guard,p,ops:wodAiActiveFrontOperations(2)};};
});

results.missingAnchor=await page.evaluate(()=>{
 const {army,guard,p}=setup(12),u=army[0];for(const j of p.jobs)j.members=j.members.filter(id=>id!==u.uid);
 p.jobs.push({id:'orphan-hold',kind:'hold',members:[u.uid],quota:1});p.unitJob[u.uid]='orphan-hold';u.aiTfJobId='orphan-hold';
 p.rebalancedAt=null;wodAiRebalanceGroups(2,p,[...army,guard]);
 const assigned=p.jobs.find(j=>j.id===p.unitJob[u.uid]);return {assigned:!!assigned,anchor:!!assigned&&(!!assigned.city||!!assigned.fort||Number.isFinite(assigned.holdHex?.x)),alive:u.hp>0};
});
assert(results.missingAnchor.assigned&&results.missingAnchor.anchor&&results.missingAnchor.alive);
results.missionOwnership=await page.evaluate(()=>{
 const {army,p,ops}=setup(12),op=ops[0],u=army.find(u=>op.members.includes(u.uid));wodAiGetUnitTaskJob(u);
 let stayed=0;
 for(let i=0;i<30;i++){gameData._aiEconomyClock=i*.5;const t={id:'screen-'+i,kind:i%2?'territory':'corridor',coverageRequired:true,predictive:true,closureSeconds:90,withdrawSeconds:15,atRisk:4,holdHex:h(-3),contactPoint:h(0),members:[u.uid]};
 gameData._aiDefenseByOwner[2]={hexes:gameData.hexes,jobs:[t],unitJob:{[u.uid]:t.id}};if(wodAiGetUnitTaskJob(u)?.frontOperation===op)stayed++;}
 const counter={id:'town-emergency',kind:'counter',city:gameData.cities.find(c=>c.owner===2),holdHex:h(-24),members:[u.uid]};gameData._aiDefenseByOwner[2]={hexes:gameData.hexes,jobs:[counter],unitJob:{[u.uid]:counter.id}};
 const emergency=wodAiGetUnitTaskJob(u)===counter;delete gameData._aiDefenseByOwner[2];const resumes=wodAiGetUnitTaskJob(u)?.frontOperation===op;
 return{stayed,emergency,resumes,distantCut:wodAiCorridorUrgent({predictive:true,closureSeconds:90,withdrawSeconds:20,atRisk:6}),imminentCut:wodAiCorridorUrgent({predictive:true,closureSeconds:12,withdrawSeconds:20,atRisk:6})};
});
assert.equal(results.missionOwnership.stayed,30);assert(results.missionOwnership.emergency&&results.missionOwnership.resumes&&!results.missionOwnership.distantCut&&results.missionOwnership.imminentCut);
results.procurement=await page.evaluate(()=>{
 world();for(const x of gameData.hexList)if(x.r<-8){x.type='water';x.owner=0;}
 const port=town(-20,-8,2,'Port');port.hasHarbor=true;const enemy=town(20,-8,1,'EnemyPort');enemy.hasHarbor=true;
 const home=town(-20,8,2,'Home'),army=Array.from({length:12},(_,i)=>unit(-12-Math.floor(i/6)*2,i%6-3));refresh();
 gameData.aiMoneyByOwner[2]=9000;gameData.aiManpowerByOwner[2]=12000;
 const plan={lastBuilding:-90,lastFort:-90,desired:{light:12,ship:1}},demand={desired:{light:12,ship:1},types:['ship','light'],missing:[],atRisk:false,reinforcements:[],expedition:{goal:enemy,preferred:['ship'],desired:{ship:1}}};gameData._aiEconomyPlans={2:plan};
 const first=wodAiProcurementReserve(2,[port,home],army,[],demand,plan,100);
 const queued=wodApplyBuildAtCityForOwner(port,'light',2);gameData._aiEconomyClock=61;
 const duringBusy=wodAiProcurementReserve(2,[port,home],army,gameData.constructionJobs,demand,plan,100);
 const patient=unit(-20,8);patient.hp=50;patient.manpower=500;patient._medicalRecovering=true;refresh();
 gameData.aiManpowerByOwner[2]=9500;const before=patient.hp,mpBefore=wodPlayerMpPool(2),income=getOwnerManpowerIncome(2);
 for(let i=0;i<40;i++){gameData._wodSimTick=(gameData._wodSimTick||0)+1;gameData.aiManpowerByOwner[2]+=income*.05;updateUnitHealing(patient,.05);}
 const growing=wodPlayerMpPool(2)>mpBefore,healed=patient.hp>before;
 wodUpdateConstruction(20);gameData.aiMoneyByOwner[2]=9000;gameData.aiManpowerByOwner[2]=12000;
 const purchased=wodApplyBuildAtCityForOwner(port,'ship',2);wodUpdateConstruction(31);
 return{reserved:first?.type,busySame:duringBusy===first,queued,growing,healed,purchased,ship:gameData.entities.some(u=>u.owner===2&&u.type==='ship'),humanAllowance:wodAiReplacementAllowance({owner:1},100,.05)};
});
assert.equal(results.procurement.reserved,'ship');assert(results.procurement.busySame&&results.procurement.queued&&results.procurement.growing&&results.procurement.healed&&results.procurement.purchased&&results.procurement.ship);assert.equal(results.procurement.humanAllowance,100);
results.raidContinuity=await page.evaluate(()=>{
 world();for(const x of gameData.hexList)if(x.r>=1&&x.r<=4){x.type='water';x.owner=0;}
 const source=h(-10),beach=h(10),home=town(-20,-8,2,'Home'),goal=town(20,-8,1,'Enemy');
 const marines=[unit(-2,2,'marine'),unit(0,2,'marine'),unit(2,2,'marine')];refresh();gameData._aiEconomyClock=250;const now=wodAiOperationTime();
 const raid={id:'raid-regression',at:0,phase:'crossing',source,rally:source,beach,town:goal,water:Array.from({length:21},(_,i)=>h(i-10,2)),ids:marines.map(u=>u.uid)};
 for(const u of marines){u._aiMarineRaid=raid.id;u._aiMarineRaidOrder=raid.id;u.target=beach;u._aiRaidProgress={id:raid.id,x:u.x,y:u.y,at:now-1000};}
 gameData._aiMarineRaids={hexes:gameData.hexes,owners:{2:raid},checked:{},blocked:{}};wodAiPlanMarineRaids(2,marines);const retained=gameData._aiMarineRaids.owners[2]===raid;
 for(const u of marines.slice(0,2)){u.x=beach.x;u.y=beach.y;}
 wodAiPlanMarineRaids(2,marines);
 return{retained,phase:raid.phase,landed:marines.filter(u=>u._navalLanded).length,goal:marines[0]._navalAssaultGoal?.id};
});
assert(results.raidContinuity.retained&&results.raidContinuity.phase==='exploit'&&results.raidContinuity.landed===2&&results.raidContinuity.goal==='Enemy');
assert.deepEqual(errors,[]);results.errors=errors;console.log(JSON.stringify(results,null,2));fs.writeFileSync(path.join(OUT,'sim-findings.json'),JSON.stringify(results,null,2));await page.screenshot({path:path.join(OUT,'sim-findings.png')});
}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
