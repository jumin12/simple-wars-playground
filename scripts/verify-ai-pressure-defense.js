'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/ai-expert-pressure/focused');fs.mkdirSync(OUT,{recursive:true});
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
results.townApproaches=await page.evaluate(()=>{
 world();const north=town(-18,-6,2,'North'),south=town(-18,6,2,'South');town(24,0,1,'Enemy');const defenders=[unit(-18,-6),unit(-18,6),unit(-17,0)],enemies=Array.from({length:8},(_,i)=>unit(-16,i%2,'light',1));refresh();
 const first=wodAiTownDefenseThreats(2,defenders),firstTown=first.find(j=>j.enemyIds.includes(enemies[0].uid))?.city.id;
 const ids=first.flatMap(j=>j.enemyIds),unique=ids.length===new Set(ids).size&&ids.length===enemies.length;
 gameData._aiEconomyClock=3;enemies[0].y+=2;const second=wodAiTownDefenseThreats(2,defenders),stable=second.find(j=>j.enemyIds.includes(enemies[0].uid))?.city.id===firstTown;
 gameData._aiEconomyClock=6;enemies[0].y=south.y;const third=wodAiTownDefenseThreats(2,defenders),turns=third.find(j=>j.enemyIds.includes(enemies[0].uid))?.city.id===south.id;
 const hidden=unit(25,25,'heavy',1);gameData.fogOfWar=true;gameData._factionIntel={};refresh();wodFogFactionIntel(2,true);const fog=wodAiTownDefenseThreats(2,defenders);
 return{unique,stable,turns,hidden:!fog.some(j=>j.enemyIds.includes(hidden.uid)),ids,expected:enemies.map(u=>u.uid),first:first.map(j=>({city:j.city.id,ids:j.enemyIds}))};
});
results.twoTowns=await page.evaluate(()=>{
 world();const north=town(-18,-6,2,'North'),south=town(-18,6,2,'South');town(24,0,1,'Enemy');const guards=[unit(-18,-6),unit(-18,6)],army=Array.from({length:16},(_,i)=>unit(-19-i%3,(i%8-3.5)*2));
 const jobs=[{id:'north',kind:'defend',city:north,members:[guards[0].uid]},{id:'south',kind:'defend',city:south,members:[guards[1].uid]},{id:'field',kind:'main',members:army.map(u=>u.uid),holdHex:h(-18),attackHex:h(1)}];
 gameData.aiTaskForces[2]={jobs,unitJob:Object.fromEntries([...guards.map((u,i)=>[u.uid,i?'south':'north']),...army.map(u=>[u.uid,'field'])]),sectors:[]};
 for(const r of [-7,-6,-5,5,6,7])unit(-14,r,'light',1);refresh();const d=wodAiReadDefense(2,[...army,...guards],true),counters=d.jobs.filter(j=>j.kind==='counter');
 return{both:counters.length===2,sizes:counters.map(j=>j.members.length),guards:guards.every(u=>!d.unitJob[u.uid]),unique:counters.flatMap(j=>j.members).length===new Set(counters.flatMap(j=>j.members)).size};
});
results.recruitment=await page.evaluate(()=>{
 const {army,guard,home,p}=setup(8);home.hasFactory=true;gameData.aiMoneyByOwner[2]=getUnitCost('light').money*1.2;gameData.aiManpowerByOwner[2]=100000;refresh();
 wodRunAiSpawnBurstForOwner('2',{2:[home]},{2:1000},{2:0});
 return{queued:gameData.constructionJobs.some(j=>j.mode==='light'),reservation:gameData._aiEconomyPlans?.[2]?.reservation?.type||null};
});
results.fireControl=await page.evaluate(()=>{
 world();town(-24,0,2,'Home');town(24,0,1,'Enemy');const shooter=unit(-2),general=unit(-1,-1,'heavy',1),infantry=unit(-1,1,'light',1);general.isGeneral=true;general.hp=100;refresh();gameData._generalAuraCache=null;
 shooter.target={x:200,y:30};const movement=shooter.target;wodAiSelectCombatTarget(shooter,{});const priority=shooter.preferredTargetUid===general.uid,kept=shooter.target===movement;
 infantry.preferredTargetUid=shooter.uid;wodAiSelectCombatTarget(infantry,{});const human=infantry.preferredTargetUid===shooter.uid;
 general.x+=300;infantry.x+=300;wodAiSelectCombatTarget(shooter,{});const released=!shooter.preferredTargetUid&&shooter.target===movement;
 return{priority,kept,human,released};
});
results.damageAllocation=await page.evaluate(()=>{
 world();town(-24,0,2,'Home');town(24,0,1,'Enemy');const shooters=[unit(-2,-1),unit(-2),unit(-2,1)],weak=unit(-1,0,'light',1),healthy=unit(-1,1,'light',1);weak.hp=1;refresh();const control={};for(const u of shooters)wodAiSelectCombatTarget(u,control);
 return{weak:shooters.filter(u=>u.preferredTargetUid===weak.uid).length,healthy:shooters.filter(u=>u.preferredTargetUid===healthy.uid).length};
});
results.visibleFire=await page.evaluate(()=>{
 world();town(-24,0,2,'Home');town(24,0,1,'Enemy');const shooter=unit(-2),hidden=unit(20,0,'heavy',1);shooter.range=1000;gameData.fogOfWar=true;gameData._factionIntel={};refresh();wodFogFactionIntel(2,true);wodAiSelectCombatTarget(shooter,{});
 return{unseen:!wodOwnerCanSee(2,hidden),notTargeted:!shooter.preferredTargetUid};
});
results.actualCombat=await page.evaluate(()=>{
 world();town(-24,0,2,'Home');town(24,0,1,'Enemy');const shooters=[unit(-2,-1),unit(-2),unit(-2,1)],general=unit(-1,-1,'heavy',1),infantry=unit(-1,1,'light',1);general.isGeneral=true;general.hp=100;refresh();gameData._generalAuraCache=null;const control={};for(const u of shooters)wodAiSelectCombatTarget(u,control);
 for(let i=0;i<40;i++){wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();}
 return{generalDamage:100-general.hp,infantryDamage:100-infantry.hp,alive:shooters.every(u=>u.hp>0)};
});
results.townCover=await page.evaluate(()=>{
 world();const home=town(-18,0,2,'Home');town(24,0,1,'Enemy');for(const r of [-1,0,1])for(const q of [-19,-18,-17]){h(q,r).type='urban';h(q,r).cityId=home.id;}
 const army=[unit(-18,-1),unit(-18,1),unit(-19,0)],foe=unit(-16,0,'light',1),job={id:'town-response',kind:'counter',city:home,members:army.map(u=>u.uid),enemyIds:[foe.uid],holdHex:h(-18)};refresh();
 wodAiIssueTownDefense(army[0],job);const goal=army[0].orderTarget||gameData._aiMoveQueue?.get(army[0]);
 return{urban:goal&&getNearestHexToPoint(goal.x,goal.y)?.type==='urban',firing:goal&&Math.hypot(goal.x-foe.x,goal.y-foe.y)<=army[0].range*1.02};
});
results.supportTargets=await page.evaluate(()=>{
 world();town(-24,0,2,'Home');town(24,0,1,'Enemy');h(-1,-1).type='water';const shooter=unit(-2),supply=unit(-1,-1,'supply',1),foe=unit(-1,1,'light',1);refresh();wodAiSelectCombatTarget(shooter,{});
 const support=shooter.preferredTargetUid===supply.uid;shooter.retreating=true;shooter.target={x:-500,y:0};const order=shooter.target;wodAiSelectCombatTarget(shooter,{});
 return{support,retreat:shooter.target===order&&!shooter.preferredTargetUid};
});
assert(Object.values(results.townApproaches).every(Boolean),JSON.stringify(results.townApproaches));
assert(results.twoTowns.both&&results.twoTowns.sizes.every(n=>n>=3)&&results.twoTowns.guards&&results.twoTowns.unique,JSON.stringify(results.twoTowns));
assert(results.recruitment.queued&&!results.recruitment.reservation,JSON.stringify(results.recruitment));
assert(Object.values(results.fireControl).every(Boolean),JSON.stringify(results.fireControl));
assert(results.damageAllocation.weak===1&&results.damageAllocation.healthy===2,JSON.stringify(results.damageAllocation));
assert(Object.values(results.visibleFire).every(Boolean),JSON.stringify(results.visibleFire));
assert(results.actualCombat.generalDamage>results.actualCombat.infantryDamage+1&&results.actualCombat.alive,JSON.stringify(results.actualCombat));assert.deepEqual(errors,[]);
assert(Object.values(results.townCover).every(Boolean),JSON.stringify(results.townCover));assert(Object.values(results.supportTargets).every(Boolean),JSON.stringify(results.supportTargets));
console.log(JSON.stringify(results,null,2));
}finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({results,errors},null,2));await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
