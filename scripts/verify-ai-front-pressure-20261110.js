'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{spawn}=require('child_process'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),ENGINE=process.env.GAME_ENGINE?path.resolve(ROOT,process.env.GAME_ENGINE):ROOT,OUT=path.join(ROOT,'output/ai-front-pressure-20261110',process.env.AUDIT_VERSION||'current');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{const p=decodeURIComponent(req.url.split('?')[0]),f=path.resolve(ENGINE,'.'+(p==='/'?'/index.html':p));if(!f.startsWith(ENGINE+path.sep))return res.writeHead(403).end();fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[path.extname(f)]||'application/octet-stream');res.end(b);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[],results={};page.setDefaultTimeout(180000);page.on('pageerror',e=>errors.push(String(e.stack)));await context.routeWebSocket(/.*/,s=>{s.onMessage(()=>{});s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]}));});
const wanted=x=>!process.env.AI_CASE||process.env.AI_CASE===x;
const snapshot=async name=>{await page.evaluate(()=>{UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.style.display='block';gameData.layers.territory=true;gameData.camera={zoom:.85,x:-canvas.clientWidth/2,y:-canvas.clientHeight/2};wodMarkTerrainFullDirty();updateTerrainCache();draw();});await page.screenshot({path:path.join(OUT,name+'.png')});fs.writeFileSync(path.join(OUT,name+'-state.json'),await page.evaluate(()=>render_game_to_text()));};
try{await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks);
await page.evaluate(()=>{
 setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
 window.world=()=>{let seed=6061100;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(40);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;gameData.entities=[];gameData.nextUnitId=1;gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.alliances=[];gameData.aiTaskForces={};gameData.aiBattlePlans={};gameData.aiNavalPlans={};gameData.aiCommanderProfiles={2:'balanced'};gameData._aiEconomyPlans={};gameData._aiEconomyClock=0;gameData.aiTimer=gameData.aiStrategyTimer=gameData.convoyTimer=gameData._transportAiTimer=-1e6;gameData.aiMoneyByOwner={2:100000};gameData.aiManpowerByOwner={2:100000};gameData.money=gameData.manpower=100000;gameData._aiFrontOffensives={};gameData._aiDefenseByOwner={};gameData._aiCombatContexts={};gameData._aiLocalSituation=new WeakMap();for(const x of gameData.hexList){x.type='grass';x.owner=x.q<0?2:1;x.cityId=null;}};
 window.h=(q,r=0)=>gameData.hexes[q+','+r];window.town=(q,r,owner,id)=>{const x=h(q,r);x.owner=owner;x.type='urban';x.cityId=id;const c={id,name:id,q,r,x:x.x,y:x.y,owner,hp:1000,maxHp:1000};gameData.cities.push(c);return c;};
 window.unit=(q,r=0,type='light',owner=2)=>{const x=h(q,r),u=createUnitAt(type,x.x,x.y,owner,{startSpawn:true});u.x=u._drawX=x.x;u.y=u._drawY=x.y;u.isGeneral=false;return u;};
 window.refresh=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();gameData._citySupplyCache=null;gameData._aiArrivalCache=null;gameData._aiCombatContexts={};gameData._aiLocalSituation=new WeakMap();wodInvalidateAiFrontlineHexCache();};
 window.planFor=(army,homes,kind='main')=>{const guards=homes.map(c=>unit(c.q,c.r)),job={id:'field',kind,role:kind,members:army.map(u=>u.uid),holdHex:h(-5),attackHex:h(2),objectiveHex:h(2)},jobs=[job,...homes.map((c,i)=>({id:'guard-'+i,kind:'defend',city:c,members:[guards[i].uid]}))],unitJob=Object.fromEntries([...army.map(u=>[u.uid,job.id]),...guards.map((u,i)=>[u.uid,'guard-'+i])]),plan={jobs,unitJob,sectors:buildAiFrontlineSectors(2,12),readyN:army.length+guards.length};gameData.aiTaskForces[2]=plan;return{job,plan,guards};};
 window.sim=(seconds,orders)=>{for(let n=0;n<seconds*20;n++){if(n%10===0){refresh();orders?.();}wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();}};
});

if(wanted('pin-slots'))results.pinSlots=await page.evaluate(()=>{
 world();town(-30,0,2,'Home');town(30,0,1,'Enemy');
 const army=Array.from({length:24},(_,i)=>unit(-4-Math.floor(i/8),(i%8-4)*2)),foes=[-4,-1,2,5].map(r=>unit(1,r,'light',1));const {plan}=planFor(army,[]);refresh();
 const joint={id:'joint',anchor:h(-4),contact:h(1),at:0,until:120000,squads:[]};const ops=[];
 for(let i=0;i<4;i++){const members=army.slice(i*6,i*6+6),op={id:'pin-'+i,slot:i,hexes:gameData.hexes,at:0,until:120000,anchor:h(-4),goal:h(1),hostile:1,phase:'advance',members:members.map(u=>u.uid),jobs:[],joint};op.jobs=[{id:op.id,kind:'hold',role:'pin',response:true,members:op.members.slice(),frontOperation:op,holdHex:op.anchor,bound:0}];ops.push(op);gameData._aiFrontOffensives['2:'+i]=op;joint.squads.push(op.id);}
 for(const op of ops)for(const id of op.members){const u=army.find(u=>u.uid===id);wodAiIssueFrontOffensive(u,op.jobs[0]);}
 const goals=army.map(u=>u.orderTarget||u.target).filter(Boolean),keys=goals.map(p=>getHexKey(getNearestHexToPoint(p.x,p.y)));
 return{issued:goals.length,unique:new Set(keys).size,duplicates:keys.length-new Set(keys).size,spread:goals.length?Math.max(...goals.map(p=>p.y))-Math.min(...goals.map(p=>p.y)):0,decisions:ops.map(o=>o.joint.commandDecision?.phase)};
});

if(wanted('surplus'))results.surplus=await page.evaluate(()=>{
 world();const home=town(-30,0,2,'Home');town(30,0,1,'Enemy');const army=Array.from({length:24},(_,i)=>unit(-2-Math.floor(i/6),(i%6-3)*2));const {plan,guards}=planFor(army,[home]);for(const r of [-3,-1,1,3])unit(2,r,'light',1);refresh();
 plan.sectors=[-16,-10,0,10,16].map(r=>({holdHex:h(-1,r),attackHex:h(0,r)}));
 const ops=[];for(let i=0;i<4;i++){const members=army.slice(i*6,i*6+6),op={id:'cohort-'+i,slot:i,hexes:gameData.hexes,at:0,until:180000,anchor:h(-4),goal:h(1),hostile:1,phase:'advance',members:members.map(u=>u.uid),jobs:[]};op.jobs=[{id:op.id,kind:'main',role:'breakthrough',response:true,members:op.members.slice(),frontOperation:op,holdHex:op.anchor,bound:0}];ops.push(op);gameData._aiFrontOffensives['2:'+i]=op;}
 if(typeof wodAiDisperseSurplus==='function')wodAiDisperseSurplus(2,plan);
 const deployed=ops.filter(o=>o.pressureUntil>0),goals=deployed.map(o=>getHexKey(o.goal));wodAiCoordinateJointAssaults(2,plan);wodAiCoordinateFrontage(2,plan,army);const independent=deployed.every(o=>!o.joint&&o.pressureUntil>0);
 sim(60,()=>{for(const u of army.filter(u=>u.hp>0)){const job=wodAiGetUnitTaskJob(u);if(job&&!wodAiShouldKeepCurrentOrder(u))wodAiIssueTaskForceOrder(u,job,u.hp/u.maxHp);}});
 return{deployed:deployed.length,goals:new Set(goals).size,independent,moved:army.filter(u=>deployed.some(o=>o.members.includes(u.uid))&&Math.abs(u.y)>100).length,guard:Math.hypot(guards[0].x-home.x,guards[0].y-home.y)<1};
});
if(wanted('overmatched'))results.overmatched=await page.evaluate(()=>{
 world();town(-30,0,2,'Home');town(30,0,1,'Enemy');const army=Array.from({length:18},(_,i)=>unit(-4-Math.floor(i/6)*2,(i%6-3)*2));const {plan}=planFor(army,[]);for(let i=0;i<24;i++)unit(2+i%3,Math.floor(i/3)-4,'heavy',1);refresh();plan.sectors=[-12,0,12].map(r=>({holdHex:h(-1,r),attackHex:h(0,r)}));
 for(let i=0;i<3;i++){const op={id:'weak-'+i,hexes:gameData.hexes,at:0,until:180000,anchor:h(-4),goal:h(1),hostile:1,phase:'advance',members:army.slice(i*6,i*6+6).map(u=>u.uid),jobs:[]};op.jobs=[{id:op.id,kind:'main',role:'breakthrough',response:true,members:op.members,frontOperation:op,holdHex:op.anchor,bound:0}];gameData._aiFrontOffensives['2:'+i]=op;}
 if(typeof wodAiDisperseSurplus==='function')wodAiDisperseSurplus(2,plan);return{keptCover:!wodAiActiveFrontOperations(2).some(o=>o.pressureUntil>0)};
});

if(wanted('town'))results.town=await page.evaluate(()=>{
 const setup=(count,enemyCount)=>{
  world();const home=town(-30,0,2,'Home'),objective=town(8,0,1,'Objective');
  const army=Array.from({length:count},(_,i)=>unit(-2-Math.floor(i/6),(i%6-3)*2)),{plan,guards}=planFor(army,[home]);
  for(let i=0;i<enemyCount;i++)unit(2,i-Math.floor(enemyCount/2),'light',1);refresh();
  plan.sectors=[-16,-10,10,16].map(r=>({holdHex:h(-1,r),attackHex:h(0,r)}));
  const ops=Array.from({length:count/6},(_,i)=>{const op={id:'town-'+i,slot:i,hexes:gameData.hexes,at:0,until:180000,anchor:h(-4),goal:h(1),strategicGoal:objective,hostile:1,phase:'advance',members:army.slice(i*6,i*6+6).map(u=>u.uid),jobs:[]};op.jobs=[{id:op.id,kind:'main',role:'breakthrough',response:true,members:op.members.slice(),frontOperation:op,holdHex:op.anchor,bound:0}];gameData._aiFrontOffensives['2:'+i]=op;return op;});
  return{army,plan,guards,ops,objective,home};
 };
 let s=setup(12,5),force=s.army.slice(0,6),foes=wodAiThreats(2,false),ratio=wodAiForecast(2,force,foes).ratio,threshold=wodAiAttackThreshold(2);
 if(typeof wodAiDisperseSurplus==='function')wodAiDisperseSurplus(2,s.plan);
 const attackMarginKept=!s.ops.some(o=>o.pressureUntil>0);
 s=setup(24,4);if(typeof wodAiDisperseSurplus==='function')wodAiDisperseSurplus(2,s.plan);
 const wings=s.ops.filter(o=>o.pressureUntil>0),retained=wings.length>=2&&wings.every(o=>o.resumeGoal===s.objective);
 sim(180,()=>{for(const u of s.army.filter(u=>u.hp>0)){const j=wodAiGetUnitTaskJob(u);if(j&&!wodAiShouldKeepCurrentOrder(u))wodAiIssueTaskForceOrder(u,j,u.hp/u.maxHp);}});
 return{ratio,threshold,attackMarginKept,retained,wings:wings.length,taken:s.objective.owner===2,guard:Math.hypot(s.guards[0].x-s.home.x,s.guards[0].y-s.home.y)<1};
});

results.native=[];
for(const fog of wanted('native')?[false,true]:[])results.native.push(await page.evaluate(fog=>{
 world();const home=town(-30,0,2,'Home');home.hasFactory=home.hasFarm=true;const second=town(-26,18,2,'Second');second.hasFactory=second.hasFarm=true;town(28,0,1,'Enemy');
 const army=Array.from({length:36},(_,i)=>unit(-4-Math.floor(i/9)*2,(i%9-4)*2,i<3?'heavy':'light'));
 army[0].isGeneral=true;const guard=unit(-30),secondGuard=unit(-26,18);const foes=Array.from({length:8},(_,i)=>unit(2+Math.floor(i/4)*2,(i%4-1.5)*2,'light',1));
 gameData.aiMoneyByOwner[2]=gameData.aiManpowerByOwner[2]=1000000;gameData.aiTimer=gameData.aiStrategyTimer=gameData._transportAiTimer=0;gameData.aiCount=1;gameData.fogOfWar=fog;gameData._factionIntel={};refresh();
 const start=new Map(army.map(u=>[u.uid,{x:u.x,y:u.y}])),shooters=new Set(),trace=[];let wet=false,supplySeconds=0;
 for(let tick=0;tick<180*20;tick++){
  wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();
  if(tick%20===0){for(const u of army){if(u._combatEngaged)shooters.add(u.uid);if(u.outOfSupplySeconds>0)supplySeconds++;wet||=isWaterHex(getNearestHexToPoint(u.x,u.y));}if(tick%600===0){const ops=wodAiActiveFrontOperations(2);trace.push({t:tick/20,advanced:army.filter(u=>u.hp>0&&u.x>start.get(u.uid).x+80).length,shots:shooters.size,ops:ops.map(o=>({id:o.id,n:o.members.length,phase:o.phase,joint:o.joint?.id,role:o.frontageTask?.role,goal:getHexKey(o.advanceGoal||o.goal)}))});}}
 }
 const healthy=army.filter(u=>u.hp>u.maxHp*.6&&!u._medicalRecovering&&!u.retreating),ops=wodAiActiveFrontOperations(2),ids=ops.flatMap(o=>o.members);
 return{fog,supplySeconds,attritionDamage:wodBattleLedger().byOwner[2]?.attritionDamage||0,advanced:army.filter(u=>u.hp>0&&u.x>start.get(u.uid).x+80).length,shooters:shooters.size,damage:foes.reduce((n,u)=>n+u.maxHp-u.hp,0),land:gameData.hexList.filter(h=>h.q>=0&&h.owner===2).length,healthyBack:healthy.filter(u=>u.x<-80).length,healthy:healthy.length,wet,unique:ids.length===new Set(ids).size,guard:gameData.entities.some(u=>u.owner===2&&u.type==='light'&&u.hp>0&&Math.hypot(u.x-home.x,u.y-home.y)<60),events:wodAiDiagnostics(2).counts,trace};
},fog));
await snapshot('native-pressure');
console.log(JSON.stringify(results));
if(process.env.OBSERVE_ONLY!=='1'){
 if(results.surplus)assert(results.surplus.deployed>=2&&results.surplus.goals>=2&&results.surplus.independent&&results.surplus.moved>=6&&results.surplus.guard,'surplus cohorts take distinct open sectors and physically advance without being immediately pulled back');
 if(results.overmatched)assert(results.overmatched.keptCover,'a superior nearby enemy retains the covering force');
 if(results.town)assert(results.town.attackMarginKept&&results.town.retained&&results.town.taken&&results.town.guard,'town assaults retain a full attacking margin and flanking squads physically return to capture the town');
 if(results.pinSlots)assert(results.pinSlots.issued===24&&results.pinSlots.duplicates===0,'separate pinning squads reserve unique future positions across the whole battle');
 assert(results.native.every(r=>r.advanced>=20&&r.shooters>=12&&r.land>30&&!r.wet&&r.unique&&r.guard),'healthy rear troops physically advance and engage through distinct lanes with fog and without fog, preserving guards and dry paths');
}
assert.deepEqual(errors,[]);
}finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({results,errors},null,2));await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
