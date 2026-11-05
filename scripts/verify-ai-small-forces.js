'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/ai-small-forces',process.env.AUDIT_VERSION||'focused');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{let f=path.resolve(ROOT,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(ROOT+path.sep))return res.writeHead(403).end();if(process.env.BASELINE_DIR&&['index.html','ai-command.js'].includes(path.relative(ROOT,f)))f=path.join(ROOT,process.env.BASELINE_DIR,path.basename(f));fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.css':'text/css','.ogg':'audio/ogg','.mp3':'audio/mpeg'})[path.extname(f)]||'application/octet-stream');res.end(b);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[],results={};page.setDefaultTimeout(180000);page.on('pageerror',e=>errors.push(e.stack));await context.routeWebSocket(/.*/,s=>{s.onMessage(()=>{});s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]}));});
try{await page.addInitScript(()=>{let seed=71351;Math.random=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};});await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks);
await page.evaluate(()=>{
 setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
 window.world=()=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(36);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;gameData.entities=[];gameData.nextUnitId=1;gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.alliances=[];gameData.aiTaskForces={};gameData.aiBattlePlans={};gameData.aiCommanderProfiles={2:'balanced'};gameData._aiEconomyClock=0;gameData.aiTimer=gameData.aiStrategyTimer=gameData.convoyTimer=gameData._transportAiTimer=-1e6;gameData.aiMoneyByOwner={2:0};gameData.aiManpowerByOwner={2:100000};gameData.money=gameData.manpower=100000;gameData._aiFrontOffensives={};gameData._aiFrontOffensiveChecks={};gameData._aiDefenseByOwner={};gameData._aiCombatContexts={};gameData._aiLocalSituation=new WeakMap();for(const h of gameData.hexList){h.type='grass';h.owner=h.q<=0?2:1;h.cityId=null;}};
 window.h=(q,r=0)=>gameData.hexes[q+','+r];window.town=(q,r,owner,id)=>{const p=h(q,r);p.type='urban';p.cityId=id;p.owner=owner;const c={id,name:id,q,r,x:p.x,y:p.y,owner,hp:1000,maxHp:1000};gameData.cities.push(c);return c;};window.unit=(q,r=0,type='light',owner=2)=>{const p=h(q,r),u=createUnitAt(type,p.x,p.y,owner,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
 window.refresh=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();gameData._citySupplyCache=null;gameData._aiArrivalCache=null;gameData._aiCombatContexts={};gameData._aiLocalSituation=new WeakMap();wodInvalidateAiFrontlineHexCache();};
 window.makePlan=(army,home)=>{const guard=unit(home.q,home.r),jobs=[{id:'guard',kind:'defend',city:home,members:[guard.uid]}],unitJob={[guard.uid]:'guard'};for(const [i,u]of army.entries()){const j={id:'j'+i,kind:'main',role:'breakthrough',members:[u.uid],holdHex:h(-2),attackHex:h(1),objectiveHex:h(1)};jobs.push(j);unitJob[u.uid]=j.id;}const p={jobs,unitJob,sectors:[{holdHex:h(-2),attackHex:h(1)}],readyN:army.length+1};gameData.aiTaskForces[2]=p;return{p,guard};};
 window.sim=(seconds,orders)=>{for(let i=0;i<Math.round(seconds*20);i++){if(i%10===0){refresh();orders?.();}wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();}};
 window.flankWorld=(n=18)=>{world();const home=town(-24,0,2,'Home');town(27,0,1,'Enemy');const army=Array.from({length:n},(_,i)=>unit(-4-Math.floor(i/9)*2,(i%9-4)*2,i<3?'heavy':'light'));const foes=Array.from({length:8},(_,i)=>unit(3+Math.floor(i/4)*2,(i%4-1.5)*2,'light',1));const{p,guard}=makePlan(army,home);refresh();return{army,foes,p,guard};};
});

results.dense=[];
for(const n of [8,14,18,30])results.dense.push(await page.evaluate(n=>{world();const home=town(-24,0,2,'Home');town(25,0,1,'Enemy');const army=Array.from({length:n},(_,i)=>unit(-5-Math.floor(i/6)*2,(i%6-2.5)*2,i%6===0?'heavy':'light'));const{p,guard}=makePlan(army,home);refresh();wodAiPlanFrontOffensive(2,p,[...army,guard]);const ops=wodAiActiveFrontOperations(2),ids=ops.flatMap(o=>o.members);return{n,groups:ops.map(o=>o.members.length),goals:ops.map(o=>getHexKey(o.goal)),unique:ids.length===new Set(ids).size,guard:!ids.includes(guard.uid),committed:ids.length};},n));
results.merges=await page.evaluate(()=>{world();const home=town(-24,0,2,'Home');town(25,0,1,'Enemy');const army=Array.from({length:8},(_,i)=>unit(-5-i%4,(Math.floor(i/4)-1)*2)),{p}=makePlan(army,home);p.jobs=p.jobs.filter(j=>j.city);for(let i=0;i<2;i++){const members=army.slice(i*4,i*4+4).map(u=>u.uid),j={id:'cohort'+i,kind:'main',members,holdHex:h(-3),objectiveHex:h(3,i*3),waitingForStrength:true};p.jobs.push(j);for(const id of members)p.unitJob[id]=j.id;}refresh();for(let i=0;i<10;i++)wodAiConcentrateAssaults(2,p,army);return p.jobs.filter(j=>j.kind==='main').map(j=>j.members.length);});
results.objectives=await page.evaluate(()=>{world();const home=town(-24,0,2,'Home'),a=town(20,-9,1,'North'),b=town(20,9,1,'South'),army=Array.from({length:12},(_,i)=>unit(-5-i%4,(Math.floor(i/4)-1)*3)),{p}=makePlan(army,home);p.jobs=p.jobs.filter(j=>j.city);for(let i=0;i<3;i++){const members=army.slice(i*4,i*4+4).map(u=>u.uid),j={id:'task'+i,kind:i===2?'raid':'main',members,holdHex:h(-3,i*3),objectiveCity:i===0?a:i===1?b:null,objectiveHex:i===2?h(3,13):null,phase:'assemble',waitingForStrength:true};p.jobs.push(j);for(const id of members)p.unitJob[id]=j.id;}refresh();wodAiCoordinateCampaign(2,p,army);return p.jobs.filter(j=>!j.city).map(j=>j.objectiveCity?.id||getHexKey(j.objectiveHex));});
results.advances=[];
for (const fog of [false, true]) {
 const r=await page.evaluate(fog=>{
  world();const home=town(-24,0,2,'Home');town(25,0,1,'Enemy');
  const army=Array.from({length:24},(_,i)=>unit(-5-Math.floor(i/8)*2,Math.round((i%8-3.5)*3),i%8===0?'heavy':'light'));
  const {p,guard}=makePlan(army,home);gameData.fogOfWar=fog;gameData._factionIntel={};
  refresh();if(fog)wodFogFactionIntel(2,true);wodAiPlanFrontOffensive(2,p,[...army,guard]);
  const before=wodAiActiveFrontOperations(2).map(o=>({id:o.id,members:o.members.slice()})),start=new Map(army.map(u=>[u.uid,u.x]));
  let overlap=false,oversize=false;const checkpoints=[];
  sim(100,()=>{
   if(fog)wodFogFactionIntel(2,true);wodAiPlanFrontOffensive(2,p,[...army,guard]);
   const ops=wodAiActiveFrontOperations(2),ids=ops.flatMap(o=>o.members);
   overlap||=ids.length!==new Set(ids).size;oversize||=ops.some(o=>o.members.length>8);
   if(Math.round(wodAiOperationTime()/1000)%20===0)checkpoints.push(ops.map(o=>getHexKey(o.advanceGoal||o.goal)));
   for(const u of army.filter(u=>u.hp>0)){const job=wodAiGetUnitTaskJob(u);if(job&&!wodAiShouldKeepCurrentOrder(u))wodAiIssueTaskForceOrder(u,job,u.hp/u.maxHp);}
  });
  const ops=wodAiActiveFrontOperations(2);
  return {fog,before,overlap,oversize,goals:checkpoints,advanced:army.filter(u=>u.x>start.get(u.uid)+100).length,
   land:gameData.hexList.filter(t=>t.q>0&&t.owner===2).length,
   active:ops.map(o=>({n:o.members.length,goal:getHexKey(o.advanceGoal||o.goal),x:Math.round(army.filter(u=>o.members.includes(u.uid)).reduce((n,u)=>n+u.x,0)/o.members.length)})),
   guard:Math.hypot(guard.x-home.x,guard.y-home.y)<1};
 },fog);
 results.advances.push(r);
 if(!process.env.OBSERVE_ONLY)assert(r.before.length>=4&&!r.overlap&&!r.oversize&&r.advanced>=12&&r.land>30&&r.guard&&r.goals.some(g=>new Set(g).size>=3),JSON.stringify(r));
}
results.support=[];
for(const fog of [false,true])results.support.push(await page.evaluate(fog=>{
 world();const home=town(-24,0,2,'Home');town(25,0,1,'Enemy');const army=Array.from({length:18},(_,i)=>unit(-5-Math.floor(i/6)*2,(i%6-2.5)*2)),{p,guard}=makePlan(army,home);refresh();wodAiPlanFrontOffensive(2,p,[...army,guard]);const ops=wodAiActiveFrontOperations(2);if(ops.length<3)return{fog,groups:ops.length};
 const [lead,helper,independent]=ops,own=o=>army.filter(u=>o.members.includes(u.uid));
 for(const [n,op]of ops.entries()){op.phase='advance';op.advanceGoal=h(8,n===0?0:n===1?-8:14);for(const [i,u]of own(op).entries()){u.x=-30-i%3*33-(n===1?65:0);u.y=n===0?(Math.floor(i/3)-.5)*32:n===1?-80+Math.floor(i/3)*32:300+Math.floor(i/3)*32;u._drawX=u.x;u._drawY=u.y;}}
 const foes=[unit(1,-3,'heavy',1),unit(1,3,'heavy',1),unit(2,-1,'light',1),unit(2,1,'light',1)],shooter=own(lead)[0],original=new Map(ops.map(o=>[o.id,new Set(o.members)])),goal=helper.advanceGoal;
 shooter._combatEngaged=true;shooter.combatTargetUid=foes[0].uid;shooter._combatEnemy=foes[0];gameData.fogOfWar=fog;gameData._factionIntel={};refresh();if(fog)wodFogFactionIntel(2,true);if(typeof wodAiCoordinateFrontSupport!=='function')return{fog,unavailable:true};
 const denied=(change,restore)=>{change();wodAiCoordinateFrontSupport(2,p,[...army,guard]);const ok=!helper.supporting;restore();return ok;};
 const care=denied(()=>own(helper).forEach(u=>u._medicalRecovering=true),()=>own(helper).forEach(u=>u._medicalRecovering=false));
 const retreat=denied(()=>own(helper).forEach(u=>u.retreating=true),()=>own(helper).forEach(u=>u.retreating=false));
 const route=denied(()=>helper.jobs[0].route=['-1,0','1,0'],()=>helper.jobs[0].route=null);
 const hostile=helper.hostile,front=denied(()=>helper.hostile=3,()=>helper.hostile=hostile);
 const emergency=denied(()=>{const j={id:'urgent',kind:'counter',members:helper.members.slice()};gameData._aiDefenseByOwner[2]={jobs:[j],unitJob:Object.fromEntries(j.members.map(id=>[id,j.id]))};},()=>gameData._aiDefenseByOwner[2]=null);
 const safety={care,retreat,route,front,emergency};
 wodAiCoordinateFrontSupport(2,p,[...army,guard]);const bound=helper.supporting===lead.id,thirdFree=!independent.supporting;
 const participants=new Set();sim(45,()=>{if(fog)wodFogFactionIntel(2,true);wodAiCoordinateFrontSupport(2,p,[...army,guard]);for(const u of army){if(u._combatEngaged&&helper.members.includes(u.uid))participants.add(u.uid);const job=wodAiGetUnitTaskJob(u);if(job&&!wodAiShouldKeepCurrentOrder(u))wodAiIssueTaskForceOrder(u,job,u.hp/u.maxHp);}});
 const retained=ops.every(o=>o.members.every(id=>original.get(o.id).has(id))),keptGoal=helper.advanceGoal===goal,damage=foes.reduce((n,e)=>n+e.maxHp-e.hp,0);for(const f of foes)f.hp=0;for(const u of army){u._combatEngaged=false;u.combatTargetUid=null;}gameData._aiEconomyClock+=10;wodAiCoordinateFrontSupport(2,p,[...army,guard]);
 return{fog,bound,thirdFree,retained,keptGoal,safety,shooters:participants.size,damage,released:!helper.supporting,guard:Math.hypot(guard.x-home.x,guard.y-home.y)<1};
},fog));
if(!process.env.OBSERVE_ONLY){assert(results.dense.every(r=>r.groups.length>=2&&r.groups.every(n=>n>=3&&n<=8)&&r.unique&&r.guard&&r.committed>=r.n-2&&new Set(r.goals).size>=2),JSON.stringify(results.dense));assert.deepEqual(results.merges,[4,4]);assert(new Set(results.objectives).size===3,JSON.stringify(results.objectives));assert(results.support.every(r=>r.bound&&Object.values(r.safety).every(Boolean)&&r.thirdFree&&r.retained&&r.keptGoal&&r.shooters>=2&&r.damage>100&&r.released&&r.guard),JSON.stringify(results.support));assert.deepEqual(errors,[]);}
await page.evaluate(()=>{gameData.fogOfWar=false;UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.style.display='block';gameData.camera={zoom:1.1,x:-600,y:-420};wodMarkTerrainFullDirty();updateTerrainCache();draw();});await page.screenshot({path:path.join(OUT,'small-forces.png')});fs.writeFileSync(path.join(OUT,'state.json'),await page.evaluate(()=>render_game_to_text()));console.log(JSON.stringify(results,null,2));
}finally{fs.writeFileSync(path.join(OUT,process.env.BASELINE_DIR?'baseline.json':'results.json'),JSON.stringify({results,errors},null,2));await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
