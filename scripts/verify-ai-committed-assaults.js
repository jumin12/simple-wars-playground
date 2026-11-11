'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{spawn}=require('child_process'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),ENGINE=process.env.GAME_ENGINE?path.resolve(ROOT,process.env.GAME_ENGINE):ROOT,OUT=path.join(ROOT,'output/ai-committed-assaults',process.env.AUDIT_VERSION||'current');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{const p=decodeURIComponent(req.url.split('?')[0]),f=path.resolve(ENGINE,'.'+(p==='/'?'/index.html':p));if(!f.startsWith(ENGINE+path.sep))return res.writeHead(403).end();fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[path.extname(f)]||'application/octet-stream');res.end(b);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[],results={};page.setDefaultTimeout(180000);page.on('pageerror',e=>errors.push(String(e.stack)));await context.routeWebSocket(/.*/,s=>{s.onMessage(()=>{});s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]}));});
const selectedCase=process.argv.find(a=>a.startsWith('--case='))?.slice(7)||process.env.AI_CASE||null;
assert(!selectedCase||['defense','handoff','town','concentration','planning','encircle','terrain','outmatched'].includes(selectedCase),'Unknown native regression case: '+selectedCase);
const wanted=x=>!selectedCase||selectedCase===x;
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

if(wanted('defense'))results.defense=await page.evaluate(()=>{
 world();const home=town(-20,0,2,'Home');town(26,0,1,'Enemy');
 const army=Array.from({length:6},(_,i)=>unit(-5,i-3)),{plan,guards}=planFor(army,[home]);
 const op={id:'committed',hexes:gameData.hexes,until:180000,at:0,anchor:h(-4),goal:h(8),advanceGoal:h(8),hostile:1,members:army.map(u=>u.uid),phase:'advance',jobs:[]};
 op.jobs=[{id:'assault',kind:'main',role:'breakthrough',response:true,members:op.members.slice(),frontOperation:op,holdHex:op.anchor}];gameData._aiFrontOffensives[2]=op;
 const u=army[0],north={id:'north',kind:'corridor',owner:2,holdHex:h(-3,-8),screenPoints:[h(-3,-8)],riskUnits:new Set(['exposed']),atRisk:4,predictive:false,closureSeconds:30,enemies:2,members:[u.uid]},south={...north,id:'south',holdHex:h(-3,8),screenPoints:[h(-3,8)],members:[]};
 unit(-1,-8,'light',1);unit(-1,8,'light',1);refresh();
 u._aiDefenseLease={id:'north',until:18000};const old={hexes:gameData.hexes,jobs:[north],unitJob:{[u.uid]:'north'},corridors:[north,south]};gameData._aiDefenseByOwner[2]=old;
 const allowed=typeof wodAiDefenseLeaseAllows==='function'?wodAiDefenseLeaseAllows(u,south,[south,north],old):true;
 const generator=wodAiReserveDefenseScreens(2,[south,north],army,plan,4,old);let step;do{step=generator.next();}while(!step.done);
 const held=step.value.byUnit.get(u.uid)==='north';
 gameData._aiEconomyClock=20;const after=wodAiReserveDefenseScreens(2,[south,north],army,plan,4,old);do{step=after.next();}while(!step.done);const heldAfterExpiry=step.value.byUnit.get(u.uid)==='north';gameData._aiEconomyClock=0;
 const outpost=town(-7,0,2,'Outpost'),attacker=unit(-6,1,'light',1);refresh();
 const emergency={id:'rescue-home',kind:'counter',owner:2,city:outpost,holdHex:h(-7),enemyIds:[attacker.uid],neededPower:3,deadline:45};
 const preempt=typeof wodAiDefenseLeaseAllows==='function'?wodAiDefenseLeaseAllows(u,emergency,[north,emergency],old):true;
 const remote={...north,id:'remote',holdHex:h(20,18),screenPoints:[h(20,18)],riskUnits:new Set(['far-army'])};unit(21,18,'light',1);refresh();
 const remoteLoan=wodAiDefenseFrontAvailable(army[1],remote,plan),mission=wodAiResolveMission(u,plan);
 return{held,heldAfterExpiry,allowed,preempt,remoteLoan,mission:mission?.id,guard:Math.hypot(guards[0].x-home.x,guards[0].y-home.y)<1};
});

if(wanted('handoff'))results.handoff=await page.evaluate(()=>{
 world();const home=town(-30,0,2,'Home'),objective=town(8,0,1,'Objective'),army=Array.from({length:12},(_,i)=>unit(-2-Math.floor(i/6),(i%6-3)*2)),{plan,guards}=planFor(army,[home]);
 const campaign={id:'finished',pins:['pin-0','pin-1'],contact:h(1),hostile:1,at:0,until:180000,clearAt:0};plan.frontageCampaigns=[campaign];
 gameData._aiEconomyClock=10;
 const ops=Array.from({length:2},(_,i)=>{const op={id:'pin-'+i,hexes:gameData.hexes,at:0,until:180000,anchor:h(-3),goal:h(1),resumeGoal:objective,hostile:1,members:army.slice(i*6,i*6+6).map(u=>u.uid),phase:'advance',mode:'breakthrough',jobs:[],frontageTask:{campaign,role:'pin',until:180000}};op.jobs=[{id:op.id,kind:'hold',role:'pin',response:true,members:op.members.slice(),frontOperation:op,holdHex:op.anchor}];gameData._aiFrontOffensives['2:'+i]=op;return op;});refresh();
 wodAiCoordinateFrontage(2,plan,[...army,...guards]);const released=ops.every(o=>!o.frontageTask),follow=ops.every(o=>o.advanceGoal?.id===objective.id&&o.jobs.every(j=>j.role!=='pin'));
 let takenAt=null;for(let i=0;i<100*20;i++){if(i%10===0){refresh();for(const u of army.filter(u=>u.hp>0)){const j=wodAiGetUnitTaskJob(u);if(j&&!wodAiShouldKeepCurrentOrder(u))wodAiIssueTaskForceOrder(u,j,u.hp/u.maxHp);}}wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();if(objective.owner===2&&takenAt==null)takenAt=i/20;}
 return{released,follow,takenAt,guard:Math.hypot(guards[0].x-home.x,guards[0].y-home.y)<1};
});

if(wanted('town'))results.towns=[];
for(const fog of wanted('town')?[false,true]:[])results.towns.push(await page.evaluate(fog=>{
 world();const home=town(-30,0,2,'Home'),target=town(7,0,1,'Objective');
 for(const q of [6,7,8])for(const r of [-1,0,1]){const x=h(q,r);x.type='urban';x.cityId=target.id;x.owner=1;}
 const army=Array.from({length:12},(_,i)=>unit(-1-Math.floor(i/6),(i%6-2.5)*2,i%6===0?'heavy':'light')),{plan,guards}=planFor(army,[home]);
 const foes=[unit(5,-1,'light',1),unit(5,1,'light',1),unit(8,0,'light',1)];for(const e of foes)e.hp=55;
 const joint={id:'siege',squads:['siege-0','siege-1'],anchor:h(-1),contact:target,at:0,until:180000};
 for(let i=0;i<2;i++){const op={id:'siege-'+i,hexes:gameData.hexes,at:0,until:180000,anchor:h(-1),goal:target,advanceGoal:target,strategicGoal:target,hostile:1,members:army.slice(i*6,i*6+6).map(u=>u.uid),phase:'advance',launchedAt:1,mode:'breakthrough',joint,jobs:[]};op.jobs=[{id:op.id,kind:'main',role:'breakthrough',response:true,members:op.members.slice(),frontOperation:op,holdHex:op.anchor}];gameData._aiFrontOffensives['2:'+i]=op;}
 gameData.fogOfWar=fog;gameData._factionIntel={};refresh();let takenAt=null,allAt=null,wet=false,shooters=new Set();
 for(let i=0;i<150*20;i++){if(i%10===0){refresh();if(fog)wodFogFactionIntel(2,true);for(const u of army.filter(u=>u.hp>0)){const j=wodAiGetUnitTaskJob(u);if(j&&!wodAiShouldKeepCurrentOrder(u))wodAiIssueTaskForceOrder(u,j,u.hp/u.maxHp);}}wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();for(const u of army){if(u._combatEngaged)shooters.add(u.uid);wet||=isWaterHex(getNearestHexToPoint(u.x,u.y));}if(target.owner===2&&takenAt==null)takenAt=i/20;if(getCityUrbanTerrainHexes(target).every(x=>x.owner===2)&&allAt==null)allAt=i/20;}
 return{fog,takenAt,allAt,urban:getCityUrbanTerrainHexes(target).length,shooters:shooters.size,alive:army.filter(u=>u.hp>0).length,wet,guard:Math.hypot(guards[0].x-home.x,guards[0].y-home.y)<1,breaches:wodAiDiagnostics(2).counts['objective-breach']||0};
},fog));

if(wanted('concentration'))results.concentration=await page.evaluate(()=>{
 world();const home=town(-28,0,2,'Home'),target=town(10,0,1,'Enemy');
 const army=Array.from({length:24},(_,i)=>unit(-4-Math.floor(i/8),(i%8-3.5)*2)),{plan,guards}=planFor(army,[home]);
 for(let i=0;i<12;i++)unit(3+Math.floor(i/6),(i%6-2.5)*2,'light',1);
 for(let i=0;i<6;i++){const op={id:'cohort-'+i,hexes:gameData.hexes,at:0,until:240000,anchor:h(-4),goal:target,strategicGoal:target,advanceGoal:target,hostile:1,members:army.slice(i*4,i*4+4).map(u=>u.uid),phase:'gather',jobs:[]};op.jobs=[{id:op.id,kind:'main',role:'breakthrough',response:true,members:op.members.slice(),frontOperation:op,holdHex:op.anchor}];gameData._aiFrontOffensives['2:'+i]=op;}
 refresh();const ops=wodAiActiveFrontOperations(2),far=h(-30,20);for(const [i,o]of ops.entries())o.goal=o.advanceGoal=o.strategicGoal=i<2?target:far;
 const needsHelpPenalty=wodAiFrontTargetPenalty(2,ops[5],target)/(gameData.hexRadius||20);
 for(const [i,o]of ops.entries())o.goal=o.advanceGoal=o.strategicGoal=i<4?target:far;
 const enoughPenalty=wodAiFrontTargetPenalty(2,ops[5],target)/(gameData.hexRadius||20);for(const o of ops)o.goal=o.advanceGoal=o.strategicGoal=target;
 wodAiCoordinateJointAssaults(2,plan);const joints=[...new Set(wodAiActiveFrontOperations(2).map(o=>o.joint).filter(Boolean))],sizes=joints.map(j=>j.squads.length),rosters=wodAiActiveFrontOperations(2).map(o=>o.members.length);
 let captured=null,shooters=new Set();sim(300,()=>{wodAiPlanFrontOffensive(2,plan,[...army,...guards]);for(const u of army.filter(u=>u.hp>0)){const job=wodAiGetUnitTaskJob(u);if(job&&!wodAiShouldKeepCurrentOrder(u))wodAiIssueTaskForceOrder(u,job,u.hp/u.maxHp);if(u._combatEngaged)shooters.add(u.uid);}if(target.owner===2&&captured==null)captured=wodAiOperationTime()/1000;});
 return{sizes,rosters,needsHelpPenalty,enoughPenalty,captured,shooters:shooters.size,alive:army.filter(u=>u.hp>0).length,foes:gameData.entities.filter(u=>u.owner===1&&u.hp>0).length,guard:Math.hypot(guards[0].x-home.x,guards[0].y-home.y)<1,decisions:wodAiDiagnostics(2).events.filter(e=>e.event==='command-decision'),final:wodAiActiveFrontOperations(2).map(o=>({id:o.id,phase:o.phase,goal:(o.strategicGoal||o.advanceGoal||o.goal)?.id,decision:(()=>{const d=wodAiCommandDecision(2,o);return{phase:d.phase,reason:d.reason,ratio:d.ratio,projected:d.projectedRatio,troops:d.ids.length,arrivals:d.arrivals.length,enemy:d.enemy};})()}))};
});

if(wanted('planning'))results.planning=await page.evaluate(()=>{
 world();for(const p of gameData.hexList)if(p.q>=7&&Math.abs(p.r)>1){p.type='water';p.owner=0;}
 const home=town(-28,0,2,'Home');town(22,0,1,'Enemy');
 const army=Array.from({length:24},(_,i)=>unit(-2-Math.floor(i/8),(i%8-3.5)*2,i<6?'heavy':'light'));planFor(army,[home]);
 for(let i=0;i<6;i++)unit(3+i%2,Math.floor(i/2)-1,'heavy',1);refresh();
 const cut=wodAiCutObjective(2,army),lead=army[0],start=h(-17,6),end=h(-4,6),legal=p=>!!p&&!isWaterHex(p)&&canUnitEnterHex(lead,p);
 gameData._aiFlankSearchWork={hexes:gameData.hexes,tick:gameData._wodSimTick,spent:4,deferred:0};
 const first=wodAiFrontDetour(lead,start,end,legal,'budget-fixture'),saved=[...gameData._aiFlankPaths.queries.values()][0],deferred=gameData._aiFlankSearchWork.deferred;
 gameData._supplyTopologyVersion=(gameData._supplyTopologyVersion||0)+1;
 let path=null;for(let i=0;i<6&&!path;i++){gameData._wodSimTick=(gameData._wodSimTick||0)+1;path=wodAiFrontDetour(lead,start,end,legal,'budget-fixture');}
 const resumed=!!saved&&[...gameData._aiFlankPaths.queries.values()].includes(saved),steps=path?.length,valid=!!path&&path.every((p,i)=>legal(p)&&(!i||wodCanStepBetweenHexes(lead,path[i-1],p,true)));
 h(-10,6).type='water';let replacement=null,escape=null;
 for(let i=0;i<6&&(!replacement||!escape);i++){gameData._wodSimTick=(gameData._wodSimTick||0)+1;replacement||=wodAiFrontDetour(lead,start,end,legal,'budget-fixture');escape||=wodAiFrontDetour(lead,start,end,p=>p!==start&&legal(p),'exposed-start');}
 return{cutWidth:cut?.cutHexes?.length,isolates:cut?.cutoffTroops,yielded:!first&&deferred>0,resumed,steps,legal:valid,revalidated:!!replacement&&replacement.every(legal),exitsExposed:!!escape&&escape.slice(1).every(legal)};
});

if(wanted('encircle'))results.encircle=await page.evaluate(()=>{
 world();for(const p of gameData.hexList)if(p.q>=7&&Math.abs(p.r)>1){p.type='water';p.owner=0;}
 const home=town(-28,0,2,'Home'),enemyCity=town(22,0,1,'Enemy');
 const army=Array.from({length:24},(_,i)=>unit(-2-Math.floor(i/8),(i%8-3.5)*2,i<6?'heavy':'light')),{plan,guards}=planFor(army,[home]);
 const foes=Array.from({length:6},(_,i)=>unit(3+(i%2),Math.floor(i/2)-1,'heavy',1));refresh();
 let peak=0,peakWithCity=0,cutAt=null,cityAtCut=null,shots=new Set(),initial=null;const trace=[];
 for(let i=0;i<220*20;i++){if(i%10===0){refresh();wodAiPlanFrontOffensive(2,plan,[...army,...guards]);if(!initial)initial=wodAiActiveFrontOperations(2).map(o=>({n:o.members.length,role:o.frontageTask?.role,routes:o.jobs.filter(j=>j.route).map(j=>j.route.length)}));for(const u of army.filter(u=>u.hp>0)){const j=wodAiGetUnitTaskJob(u);if(j&&!wodAiShouldKeepCurrentOrder(u))wodAiIssueTaskForceOrder(u,j,u.hp/u.maxHp);}}
  wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();
  if(i%20===0){const n=foes.filter(u=>u.hp>0&&wodGetUnitEncirclementState(u,wodUnitSupplyHex(u,getNearestHexToPoint(u.x,u.y)))).length;peak=Math.max(peak,n);if(enemyCity.owner===1)peakWithCity=Math.max(peakWithCity,n);if(n&&cutAt==null){cutAt=i/20;cityAtCut=enemyCity.owner;}for(const u of army)if(u._combatEngaged)shots.add(u.uid);if(i%400===0)trace.push({t:i/20,encircled:n,foes:foes.filter(u=>u.hp>0).length,city:enemyCity.owner,ops:wodAiActiveFrontOperations(2).map(o=>({role:o.frontageTask?.role,phase:o.phase,jobs:o.jobs.map(j=>({role:j.role,cursor:j.cursor,n:j.route?.length}))}))});}
 }
 return{peak,peakWithCity,cutAt,cityAtCut,shots:shots.size,initial,foesAlive:foes.filter(u=>u.hp>0).length,alive:army.filter(u=>u.hp>0).length,guard:Math.hypot(guards[0].x-home.x,guards[0].y-home.y)<1,events:wodAiDiagnostics(2).counts,trace};
});

if(wanted('terrain'))results.terrain=await page.evaluate(()=>{
 world();town(-30,0,2,'Home');town(30,0,1,'Enemy');const u=unit(-3,0,'mountaineer'),enemy=unit(1,0,'light',1);for(const q of [-1,0])for(const r of [-1,0,1])h(q,r).type='hill';refresh();const at=typeof wodAiContactFiringHex==='function'?wodAiContactFiringHex(u,[enemy],null,true):null;return{terrain:at?.hex.type,legal:!!at&&canUnitEnterHex(u,at.hex),range:at&&Math.hypot(at.hex.x-enemy.x,at.hex.y-enemy.y),distance:at&&Math.hypot(at.hex.x-u.x,at.hex.y-u.y)};
});

if(wanted('outmatched'))results.outmatched=await page.evaluate(()=>{
 world();const home=town(-30,0,2,'Home');town(30,0,1,'Enemy');const army=Array.from({length:6},(_,i)=>unit(-3-Math.floor(i/3),(i%3-1)*2)),{plan,guards}=planFor(army,[home]);for(let i=0;i<18;i++)unit(1+Math.floor(i/6),(i%6-2.5)*2,'heavy',1);refresh();
 const op={id:'losing',hexes:gameData.hexes,at:0,until:180000,anchor:h(-4),goal:h(2),hostile:1,members:army.map(u=>u.uid),phase:'advance',jobs:[]};op.jobs=[{id:'losing',kind:'main',role:'breakthrough',members:op.members.slice(),frontOperation:op,holdHex:op.anchor}];gameData._aiFrontOffensives[2]=op;const d=wodAiCommandDecision(2,op);return{phase:d.phase,ratio:d.ratio,guard:Math.hypot(guards[0].x-home.x,guards[0].y-home.y)<1};
});
await snapshot('native-assault');console.log(JSON.stringify(results));
assert(Object.keys(results).length>0&&Object.values(results).every(v=>v!==undefined),'Missing or unserializable native regression result: '+selectedCase);
if(process.env.OBSERVE_ONLY!=='1'){
 if(results.defense)assert(results.defense.held&&results.defense.heldAfterExpiry&&!results.defense.allowed&&results.defense.preempt&&!results.defense.remoteLoan&&results.defense.guard,'a live defense screen keeps its gate beyond the lease, rejects remote commandeering and yields to actual town relief');
 if(results.handoff)assert(results.handoff.released&&results.handoff.follow&&results.handoff.takenAt!=null&&results.handoff.guard,'cleared pinning squads receive and physically finish their next town objective');
 if(results.towns)assert(results.towns.every(r=>r.takenAt!=null&&r.allAt!=null&&r.alive>=8&&r.shooters>=3&&!r.wet&&r.guard),'viable supported assaults fight through and occupy every urban cell in clear and fog conditions');
 if(results.terrain)assert(results.terrain.terrain==='hill'&&results.terrain.legal,'mountaineers choose legal advantageous firing terrain');
 if(results.planning)assert(results.planning.cutWidth>=2&&results.planning.isolates>=2&&results.planning.yielded&&results.planning.resumed&&results.planning.steps>1&&results.planning.legal&&results.planning.revalidated&&results.planning.exitsExposed,'known coasts close real supply necks; yielded native paths resume, revalidate changed terrain and can leave exposed origins');
 if(results.concentration)assert(Math.max(...results.concentration.sizes)>=4&&Math.max(...results.concentration.sizes)<=6&&results.concentration.rosters.every(n=>n===4)&&results.concentration.needsHelpPenalty<8&&results.concentration.enoughPenalty>=18&&results.concentration.shooters>=8&&results.concentration.alive>=16&&results.concentration.captured!=null&&results.concentration.guard,'separate small cohorts reserve enough real strength, reinforce losses and finish a defended town while preserving most attackers');
 if(results.encircle)assert(results.encircle.peakWithCity>=1&&results.encircle.shots>=3&&results.encircle.guard,'supported wings physically cut living enemies off from a city they still own around a dry choke');
 if(results.outmatched)assert(results.outmatched.phase!=='advance'&&results.outmatched.ratio<.7&&results.outmatched.guard,'overwhelming armor prevents a suicidal assault');
}
assert.deepEqual(errors,[]);
}finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({selection:selectedCase,results,errors},null,2));await browser.close();server.close();}
})().catch(e=>{console.error(e.stack);server.close();process.exitCode=1;});
