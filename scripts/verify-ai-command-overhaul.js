'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/ai-command-overhaul/focused');fs.mkdirSync(OUT,{recursive:true});
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
results.persistent=await page.evaluate(()=>{
 const {army,guard,p,ops}=setup(),op=ops[0],original=op.members.slice(),borrowed=original.slice(0,3),patient=army.find(u=>u.uid===original.at(-1));
 const response={id:'emergency',kind:'counter',response:true,members:borrowed};gameData._aiDefenseByOwner[2]={jobs:[response],unitJob:Object.fromEntries(borrowed.map(id=>[id,response.id])),corridors:[]};patient._medicalRecovering=true;
 const loaned=borrowed.every(id=>wodAiGetUnitTaskJob(army.find(u=>u.uid===id))===response);
 for(const time of [3,6,12]){gameData._aiEconomyClock=time;wodAiPlanFrontOffensive(2,p,[...army.filter(u=>u!==patient),guard]);}
 const kept=original.every(id=>op.members.includes(id));delete gameData._aiDefenseByOwner[2];patient._medicalRecovering=false;gameData._aiEconomyClock=15;wodAiPlanFrontOffensive(2,p,[...army,guard]);
 const returned=original.every(id=>wodAiGetUnitTaskJob(army.find(u=>u.uid===id))?.frontOperation===op);
 army.find(u=>u.uid===original[0]).hp=0;wodAiSquadRoster(2,op);
 guard.hp=0;const transferred=army.find(u=>u.uid===original[1]);p.jobs[0].members=[transferred.uid];p.unitJob[transferred.uid]='guard';wodAiSquadRoster(2,op);
 return{loaned,kept,returned,deadRemoved:!op.members.includes(original[0]),guard:!ops.some(o=>o.members.includes(guard.uid)),garrisonSlotFreed:!op.members.includes(transferred.uid)};
});
results.joint=[];
for(const fog of [false,true])results.joint.push(await page.evaluate(fog=>{
 const {army,p,ops,guard}=setup(18);const original=ops.map(o=>({id:o.id,members:o.members.slice()}));
 for(const o of ops){o.phase='gather';o.mode='breakthrough';o.ambush=null;o.jobs=[{id:o.id+'-test',kind:'main',role:'breakthrough',members:o.members.slice(),frontOperation:o,holdHex:h(-2),bound:0}];}
 const foes=Array.from({length:4},(_,i)=>unit(2,(i-1.5)*2,'light',1));gameData.fogOfWar=fog;gameData._factionIntel={};refresh();if(fog)wodFogFactionIntel(2,true);
 p.jointCheckAt=null;wodAiCoordinateJointAssaults(2,p);const joint=ops.find(o=>o.joint)?.joint,participating=ops.filter(o=>o.joint===joint&&joint);
 const decision=joint&&wodAiCommandDecision(2,participating[0]);
 const rosters=original.every(a=>ops.find(o=>o.id===a.id).members.join()===a.members.join()),roles=participating.flatMap(o=>o.jobs.map(j=>j.role));
 const same=participating.every(o=>wodAiCommandDecision(2,o)===decision),guards=!decision?.ids.includes(guard.uid);
 for(const e of foes)e.hp=0;gameData._aiEconomyClock=10;p.jointCheckAt=null;wodAiCoordinateJointAssaults(2,p);gameData._aiEconomyClock=20;p.jointCheckAt=null;wodAiCoordinateJointAssaults(2,p);
 return{fog,squads:participating.length,roles,phase:decision?.phase,same,rosters,guards,released:participating.every(o=>!o.joint),towns:participating.filter(o=>o.advanceGoal?.id==='Enemy').length};
},fog));
results.arrivals=await page.evaluate(()=>{
 const {army,guard,p,ops}=setup(6),op=ops[0];for(const u of army.slice(2)){u.x=h(-30).x;u.y=h(0,25).y;}
 for(let i=0;i<5;i++)unit(1,i-2,'light',1);refresh();op.commandDecision=null;const decision=wodAiCommandDecision(2,op);
 return{phase:decision.phase,arrivals:decision.arrivals.length,guardExcluded:!decision.ids.includes(guard.uid),farExcluded:army.slice(2).every(u=>!decision.arrivals.some(a=>a.uid===u.uid))};
});
results.projection=await page.evaluate(()=>{
 const {army,ops}=setup(12),op=ops[0];
 for(const [i,u]of army.entries()){u.x=h(i<6?-3:-11).x;u.y=(i%6-2.5)*15;}
 const foes=Array.from({length:12},(_,i)=>unit(5,i%3-1,'light',1));refresh();op.phase='gather';op.anchor=h(-3);op.commandDecision=null;
 wodAiCommandDecision(2,op);gameData._aiEconomyClock=7;op.commandDecision=null;const distant=wodAiCommandDecision(2,op);
 for(const u of foes)u.x=h(0).x;refresh();gameData._aiEconomyClock=14;op.commandDecision=null;const immediate=wodAiCommandDecision(2,op);
 return{stages:distant.phase==='gather',withdrawsWhenThreatened:immediate.phase==='recover'};
});
results.recruitment=await page.evaluate(()=>{
 const {army,home,goal,p,ops}=setup(6),op=ops[0];const dead=army[0];dead.hp=0;wodAiSquadRoster(2,op);op.strategicGoal=goal;refresh();
 const req=wodAiForceRequests(2,[home],army.filter(u=>u.hp>0),[]).find(r=>r.id===op.id);op.goal=h(3,5);op.advanceGoal=h(6,5);p.recruitRequests=null;
 const pending={_aiReinforceFor:op.id},after=wodAiForceRequests(2,[home],army.filter(u=>u.hp>0),[pending]).find(r=>r.id===op.id);
 p.recruitRequests=null;gameData.aiMoneyByOwner[2]=100000;wodRunAiSpawnBurstForOwner('2',{2:[home]},{2:1000},{2:0});
 const queued=gameData.constructionJobs.find(j=>j._aiReinforceSquad===op.id);if(!queued)throw Error(JSON.stringify({req:{id:req.id,type:req.type,n:req.n,source:req.source,squad:req.squad},jobs:gameData.constructionJobs.map(j=>({mode:j.mode,for:j._aiReinforceFor,squad:j._aiReinforceSquad})),idle:gameData._aiEconomyPlans?.[2]?.idleReason,types:wodAiRecruitPriorities(2,[home],army.filter(u=>u.hp>0),[],{}).types}));if(queued)wodUpdateConstruction(30);
 const recruit=gameData.entities.find(u=>u._aiRequestedSquad===op.id);if(recruit)wodAiAdoptSquadRecruits(2,p,[...army,recruit]);
 return{requested:!!req,stable:req?.squad===op.id,reachable:req?.source===home.id,pendingCounted:!after||after.n===req.n-1,tagged:!!queued,joined:!!recruit&&op.members.includes(recruit.uid),bounded:op.members.length<=op.capacity};
});
results.strategicProgress=await page.evaluate(()=>{
 const {army,goal,ops}=setup(6),op=ops[0];op.phase='advance';op.strategicGoal=goal;op.advanceGoal=h(4);op.joint=null;
 for(const r of [2,3,4])h(-1,r).owner=1;
 wodAiFrontProgress(2,op,army,[]);
 for(const time of [20,40,61]){gameData._aiEconomyClock=time;h(-1,time===20?2:time===40?3:4).owner=2;army[0].kills=(army[0].kills||0)+1;op.effectCheckAt=null;wodAiFrontProgress(2,op,army,[]);}
 return{deadline:(wodAiDiagnostics(2).counts['strategic-progress-replan']||0)>0,town:op.advanceGoal===goal,roster:op.members.length===6,drive:op.objectiveDriveUntil>wodAiOperationTime()};
});
assert(Object.values(results.persistent).every(Boolean),JSON.stringify(results.persistent));
assert(results.joint.every(r=>r.squads>=2&&r.same&&r.rosters&&r.guards&&r.phase==='advance'&&r.released&&(r.fog||r.towns>=1)),JSON.stringify(results.joint));
assert(results.arrivals.phase!=='advance'&&results.arrivals.arrivals<3&&results.arrivals.guardExcluded&&results.arrivals.farExcluded,JSON.stringify(results.arrivals));
assert(Object.values(results.recruitment).every(Boolean),JSON.stringify(results.recruitment));assert.deepEqual(errors,[]);
assert(Object.values(results.strategicProgress).every(Boolean),JSON.stringify(results.strategicProgress));
assert(Object.values(results.projection).every(Boolean),JSON.stringify(results.projection));
console.log(JSON.stringify(results,null,2));
}finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({results,errors},null,2));await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
