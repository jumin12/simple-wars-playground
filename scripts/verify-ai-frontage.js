'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/ai-frontage',process.env.AUDIT_VERSION||'focused');
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
   gameData.aiMoneyByOwner={2:100000};gameData.aiManpowerByOwner={2:100000};gameData.money=gameData.manpower=100000;
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

 results.staging=await page.evaluate(()=>{
  world();for(const h of gameData.hexList)h.owner=h.q<=0?1:2;town(-26,0,1,'Home');town(28,0,2,'Enemy');gameData.money=gameData.manpower=100000;const army=Array.from({length:24},(_,i)=>unit(-8-Math.floor(i/8)*2,(i%8-3.5)*2,'light',1));refresh();
  const jobs=Array.from({length:4},(_,i)=>({id:'group-'+i,kind:'main',role:'breakthrough',members:army.slice(i*6,i*6+6).map(u=>u.uid)}));
  const points=army.map((u,i)=>wodAiFormationSlot(u,jobs[Math.floor(i/6)],h(-3),h(15),army));
  const unique=new Set(points.map(getHexKey)).size,xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  for(const [i,u]of army.entries())wodAiMoveUnitTowardHex(u,points[i],true,.01);
  sim(90,null,army);return{unique,width:Math.max(...ys)-Math.min(...ys),depth:Math.max(...xs)-Math.min(...xs),arrived:army.filter((u,i)=>Math.hypot(u.x-points[i].x,u.y-points[i].y)<15).length,healthy:army.every(u=>u.hp===u.maxHp),units:army.map((u,i)=>({x:u.x,y:u.y,hp:u.hp,goal:u.orderTarget,expected:{x:points[i].x,y:points[i].y},target:u.target&&{x:u.target.x,y:u.target.y}}))};
 });
 results.battles=[];
 for(const fog of [false,true]){const battle=await page.evaluate(fog=>{
  world();const home=town(-26,0,2,'Home');town(28,0,1,'Enemy');gameData.aiMoneyByOwner[2]=100000;gameData.aiManpowerByOwner[2]=100000;
  const army=Array.from({length:30},(_,i)=>unit(-4-Math.floor(i/10)*2,(i%10-4.5)*2,i<3?'heavy':'light'));
  const foes=Array.from({length:8},(_,i)=>unit(3+Math.floor(i/4)*2,(i%4-1.5)*2,'light',1)),{p,guard}=planArmy(army,home);army[0].isGeneral=true;
  gameData.fogOfWar=fog;gameData._factionIntel={};refresh();if(fog){const intel=wodFogFactionIntel(2,true);for(const h of gameData.hexList)intel.explored.add(getHexKey(h));}wodAiPlanFrontOffensive(2,p,[...army,guard]);
  const initial=wodAiActiveFrontOperations(2).map(o=>({id:o.id,n:o.members.length,task:o.frontageTask?.role,route:o.jobs.find(j=>j.route)?.route.length}));
  const shots=new Set(),wings={},trace=[];let overlap=false,wet=false,supplyPeak=0;
  for(let i=0;i<120*20;i++){
   if(i%10===0){refresh();if(fog)wodFogFactionIntel(2,true);wodAiPlanFrontOffensive(2,p,[...army,guard]);
    const ops=wodAiActiveFrontOperations(2),ids=ops.flatMap(o=>o.members);overlap||=ids.length!==new Set(ids).size;
    for(const op of ops)for(const j of op.jobs.filter(j=>j.route)){const old=wings[j.id];if(!old||j.cursor>old.cursor)wings[j.id]={cursor:j.cursor,length:j.route.length,side:j.role};}
    for(const u of army.filter(u=>u.hp>0)){if(u._combatEngaged)shots.add(u.uid);wet||=isWaterHex(getNearestHexToPoint(u.x,u.y));supplyPeak=Math.max(supplyPeak,u.outOfSupplySeconds||0);const job=wodAiGetUnitTaskJob(u);if(job&&!wodAiShouldKeepCurrentOrder(u))wodAiIssueTaskForceOrder(u,job,u.hp/u.maxHp);}
    if(i%400===0)trace.push({t:wodAiOperationTime()/1000,n:shots.size,ops:ops.map(o=>({id:o.id,task:o.frontageTask?.role,phase:o.phase,n:o.members.length,goal:getHexKey(o.advanceGoal||o.goal)}))});
   }
   wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();
  }
  const ledger=wodBattleLedger().byOwner;return{fog,initial,shooters:shots.size,wings,damage:foes.reduce((n,u)=>n+u.maxHp-u.hp,0),foesAlive:foes.filter(u=>u.hp>0).length,encircledFoes:foes.filter(u=>u.hp>0&&wodGetUnitEncirclementState(u,wodUnitSupplyHex(u,getNearestHexToPoint(u.x,u.y)))).length,land:gameData.hexList.filter(h=>h.q>0&&h.owner===2).length,guard:guard.hp>0&&Math.hypot(guard.x-home.x,guard.y-home.y)<1,overlap,wet,supplyPeak,unpaidDamage:(ledger[1]?.unpaidAttritionDamage||0)+(ledger[2]?.unpaidAttritionDamage||0),events:wodAiDiagnostics(2).counts,trace};
 },fog);results.battles.push(battle);await page.evaluate(()=>{UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.style.display='block';gameData.camera={zoom:1.1,x:-650,y:-450};wodMarkTerrainFullDirty();updateTerrainCache();draw();});await page.screenshot({path:path.join(OUT,fog?'fog-battle.png':'clear-battle.png')});}


 results.surplus=await page.evaluate(()=>{
  world();const home=town(-26,0,2,'Home');town(28,0,1,'Enemy');gameData.aiMoneyByOwner[2]=gameData.aiManpowerByOwner[2]=100000;
  const army=Array.from({length:48},(_,i)=>unit(-1-Math.floor(i/8),i%8-4,i<3?'heavy':'light'));for(let i=0;i<6;i++)unit(3+(i%2),Math.floor(i/2)-1,'light',1);refresh();const {p,guard}=planArmy(army,home);
  wodAiPlanFrontOffensive(2,p,[...army,guard]);const assignments=wodAiActiveFrontOperations(2).map(o=>({id:o.id,task:o.frontageTask?.role,n:o.members.length,goal:getHexKey(o.advanceGoal||o.goal)}));
  const expands=wodAiActiveFrontOperations(2).filter(o=>o.frontageTask?.role==='expand'),ids=new Set(expands.flatMap(o=>o.members)),start=new Map(army.map(u=>[u.uid,{x:u.x,y:u.y}]));
  sim(60,p,army);return{assignments,expanded:army.filter(u=>ids.has(u.uid)&&Math.hypot(u.x-start.get(u.uid).x,u.y-start.get(u.uid).y)>60).length,goals:new Set(expands.map(o=>getHexKey(o.goal))).size,guard:Math.hypot(guard.x-home.x,guard.y-home.y)<1};
 });
 results.planReplacement=await page.evaluate(()=>{
  if(typeof wodAiCoordinateFrontage!=='function')return{notAvailable:true};
  world();const home=town(-26,0,2,'Home');town(28,0,1,'Enemy');const army=Array.from({length:30},(_,i)=>unit(-4-Math.floor(i/10)*2,(i%10-4.5)*2,i<3?'heavy':'light'));
  const foes=Array.from({length:8},(_,i)=>unit(3+Math.floor(i/4)*2,(i%4-1.5)*2,'light',1)),{p,guard}=planArmy(army,home);refresh();wodAiPlanFrontOffensive(2,p,[...army,guard]);
  const ops=wodAiActiveFrontOperations(2),campaign=ops.find(o=>o.frontageTask)?.frontageTask.campaign;const rebuilt={...p};delete rebuilt.frontageCampaigns;delete rebuilt.frontageCheckAt;gameData.aiTaskForces[2]=rebuilt;
  wodAiCoordinateFrontage(2,rebuilt,[...army,guard]);const inherited=!!campaign&&rebuilt.frontageCampaigns.includes(campaign);
  for(const e of foes)e.hp=0;gameData._aiEconomyClock+=6;refresh();wodAiCoordinateFrontage(2,rebuilt,[...army,guard]);gameData._aiEconomyClock+=9;refresh();wodAiCoordinateFrontage(2,rebuilt,[...army,guard]);
  return{inherited,released:!!campaign&&campaign.until<=wodAiOperationTime()&&ops.every(o=>o.frontageTask?.campaign!==campaign),guard:Math.hypot(guard.x-home.x,guard.y-home.y)<1};
 });
 results.commandOwnership=await page.evaluate(()=>{
  world();const home=town(-26,0,2,'Home');town(28,0,1,'Enemy');const army=Array.from({length:18},(_,i)=>unit(-4-Math.floor(i/6)*2,i%6-3)),{p}=planArmy(army,home);refresh();
  const ops=Array.from({length:3},(_,i)=>({id:'stable-'+i,hexes:gameData.hexes,until:180000,at:0,anchor:h(-4),goal:h(4),hostile:1,members:army.slice(i*6,i*6+6).map(u=>u.uid),phase:'advance',jobs:[]}));
  for(const [i,o]of ops.entries()){o.jobs=[{id:o.id,kind:'main',role:'breakthrough',members:o.members.slice(),frontOperation:o}];gameData._aiFrontOffensives['2:'+i]=o;}
  const old={id:'old',squads:ops.slice(0,2).map(o=>o.id),until:60000,at:0,anchor:h(-4),contact:h(4)},current={...old,id:'new',squads:ops.slice(1).map(o=>o.id)};ops[0].joint=old;ops[1].joint=ops[2].joint=current;
  const d=wodAiCommandDecision(2,ops[0]);return{onlyCurrentMembers:d.ids.length===6&&!ops[1].members.some(id=>d.ids.includes(id)),otherJointIntact:ops[1].joint===current&&ops[2].joint===current};
 });
 results.safety=await page.evaluate(()=>{
  world();const home=town(-26,0,2,'Home');town(28,0,1,'Enemy');const army=Array.from({length:18},(_,i)=>unit(-4-Math.floor(i/6)*2,(i%6-2.5)*2)),{p,guard}=planArmy(army,home);for(let i=0;i<20;i++)unit(3+(i%2)*2,(Math.floor(i/2)-4.5)*2,'heavy',1);refresh();wodAiPlanFrontOffensive(2,p,[...army,guard]);return{noSuicidalPincer:!wodAiActiveFrontOperations(2).some(o=>o.frontageTask?.role==='flank'),guard:!wodAiActiveFrontOperations(2).some(o=>o.members.includes(guard.uid))};
 });
 await page.evaluate(()=>{UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.style.display='block';gameData.camera={zoom:1.2,x:-650,y:-450};gameData.fogOfWar=false;wodMarkTerrainFullDirty();updateTerrainCache();draw();});
 await page.screenshot({path:path.join(OUT,'frontage.png')});fs.writeFileSync(path.join(OUT,'state.json'),await page.evaluate(()=>render_game_to_text()));
 console.log(JSON.stringify({...results,battles:results.battles.map(b=>({...b,trace:undefined}))},null,2));
 if(process.env.OBSERVE_ONLY!=='1'){
  assert(results.staging.unique===24&&results.staging.width>=240&&results.staging.depth<=results.staging.width*.3&&results.staging.arrived>=20&&results.staging.healthy,'separate squads share unique broad staging lanes and physically deploy');
  assert(results.battles.every(b=>b.trace.some(t=>t.ops.filter(o=>o.task==='flank').length>=2&&t.ops.some(o=>o.task==='pin'))&&b.initial.every(o=>o.n<=8)&&!b.overlap&&!b.wet&&b.guard&&b.unpaidDamage===0&&b.damage>200&&['left','right'].every(side=>Object.values(b.wings).some(w=>w.side===side&&w.cursor>=5))),'funded large forces pin, advance distinct wings, fight and preserve guards without duplicate membership or water shortcuts');
  assert(results.battles.some(b=>b.foesAlive===0||b.encircledFoes>=Math.min(2,b.foesAlive)),'a physical pincer cuts enemy supply, including the last survivor after the others are killed');
  assert(Object.values(results.safety).every(Boolean));assert(results.surplus.assignments.some(o=>o.task==='expand')&&results.surplus.expanded>=3&&results.surplus.guard,'surplus squads receive separate sectors and physically advance instead of parking behind the pin');assert(Object.values(results.commandOwnership).every(Boolean),'an old joint commander cannot count or order a reassigned squad');assert(Object.values(results.planReplacement).every(Boolean),'campaigns survive base-plan replacement and release their squads when contact clears');
 }
 assert.deepEqual(errors,[]);
 }finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({results,errors},null,2));await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
