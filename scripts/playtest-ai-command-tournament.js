'use strict';
// Paired, complete domination games. Identical authored maps, starts, resources
// and observed-only scripted opponents for the baseline and candidate builds.
const fs=require('fs'),path=require('path'),http=require('http'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),BASE=path.join(ROOT,process.env.AUDIT_OUT_ROOT||'output/ai-command-overhaul'),OUT=path.join(BASE,process.env.AUDIT_VERSION||'tournament');fs.mkdirSync(OUT,{recursive:true});
const cases=[{id:'open-rush',terrain:'open',style:'rush',seed:81101},{id:'woods-defense',terrain:'woods',style:'defend',seed:81102},{id:'hills-flank',terrain:'hills',style:'flank',seed:81103},{id:'river-rush',terrain:'river',style:'rush',seed:81104},{id:'coast-probe',terrain:'coast',style:'probe',seed:81105}].flatMap(c=>[false,true].map(fog=>({...c,seed:c.seed+Number(process.env.AUDIT_SEED_OFFSET||0),profile:process.env.AUDIT_PROFILE||'balanced',trace:process.env.AUDIT_TRACE==='1',fog,id:c.id+(fog?'-fog':'-clear')})));
const server=http.createServer((req,res)=>{let f=path.resolve(ROOT,'.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(ROOT+path.sep))return res.writeHead(403).end();if(process.env.AUDIT_SOURCE&&['index.html','ai-command.js'].includes(path.relative(ROOT,f)))f=path.join(ROOT,process.env.AUDIT_SOURCE,path.basename(f));fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ogg':'audio/ogg','.mp3':'audio/mpeg'})[path.extname(f)]||'application/octet-stream');res.end(b);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true}),all=[];try{for(const spec of cases.filter(c=>!process.env.AUDIT_CASE||process.env.AUDIT_CASE.split(',').includes(c.id))){
 const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(180000);page.on('pageerror',e=>errors.push(e.stack));await context.routeWebSocket(/.*/,s=>{s.onMessage(()=>{});s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]}));});
 await page.addInitScript(seed=>{let s=seed;Math.random=()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};},spec.seed);
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks);
 await page.evaluate(spec=>{
  let seed=spec.seed+5000;Math.random=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
  setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(40);
  const kept=gameData.hexList.filter(h=>Math.abs(h.q)<=18&&Math.abs(h.r)<=12);gameData.hexList=kept;gameData.hexes=Object.fromEntries(kept.map(h=>[getHexKey(h),h]));gameData.mapRadius=18;
  gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=spec.fog;
  gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.alliances=[];gameData.nextUnitId=1;
  gameData.aiTaskForces={};gameData.aiBattlePlans={};gameData.aiCommanderProfiles={2:{id:spec.profile,seed:spec.seed}};gameData._aiEconomyClock=0;gameData.aiTimer=gameData.aiStrategyTimer=gameData.convoyTimer=gameData._transportAiTimer=0;
  gameData.money=10000;gameData.manpower=5000;gameData.aiMoneyByOwner={2:10000};gameData.aiManpowerByOwner={2:5000};gameData._aiFrontOffensives={};gameData._aiDefenseByOwner={};
  for(const h of kept){h.type='grass';h.owner=h.q<=0?2:1;h.cityId=null;
   if(spec.terrain==='woods'&&Math.sin(h.q*.5+h.r*.2)>.1)h.type='forest';
   if(spec.terrain==='hills'&&Math.sin(h.q*.4-h.r*.6)>.4)h.type='hill';
   if(spec.terrain==='hills'&&Math.abs(h.r)>7&&Math.abs(h.q)<3)h.type='mountain';
   if(spec.terrain==='river'&&h.q===Math.round(Math.sin(h.r*.2)*2)&&Math.abs(h.r)>2){h.type='water';h.owner=0;}
   if(spec.terrain==='coast'&&h.r<-8+Math.round(Math.cos(h.q*.2)*2)){h.type='water';h.owner=0;}
  }
  const at=(q,r)=>gameData.hexes[q+','+r];
  for(const owner of [1,2]){const side=owner===2?-1:1;
   for(const [i,r]of [-6,6].entries()){const h=at(side*12,r),id='town-'+owner+'-'+i;for(const p of getHexesInRadius(h.q,h.r,1)){const x=at(p.q,p.r);if(x){x.type='urban';x.owner=owner;x.cityId=id;}}
    gameData.cities.push({id,name:id,q:h.q,r:h.r,x:h.x,y:h.y,owner,hp:1000,maxHp:1000,hasFactory:false,hasHarbor:false});}
   for(let i=0;i<14;i++){const h=at(side*(i<2?12:4+Math.floor((i-2)/6)*2),i<2?(i===0?-6:6):(i%6-2.5)*2+1),type=i===2?'heavy':i===3?'motorized':i===4?'mountaineer':'light';
    const u=createUnitAt(type,h.x,h.y,owner,{startSpawn:true});u.isGeneral=i===2;}
  }
  gameData.unitSpatialGrid=buildUnitSpatialGrid();gameData._citySupplyCache=null;gameData._landIncomeCacheDirty=true;gameData._factionIntel={};gameData._fogVisionTimer=0;wodInvalidateAiFrontlineHexCache();wodRefreshFogVision(1);wodFogFactionIntel(2,true);setGameSpeed(1,true);cancelAnimationFrame(animationFrameId);
  window.audit={spec,t:0,tick:0,metrics:{offensiveSeconds:0,idleSeconds:0,supplySeconds:0,unitSeconds:0},last:{},samples:[],traces:[],events:[],captures:[],purchases:[],start:WOD.exportMapData(),winner:null};
  const record=wodAiRecord;wodAiRecord=function(owner,event,detail){record(owner,event,detail);if(owner===2&&audit.events.length<20000)audit.events.push({t:audit.t,event,...detail});};
  const build=wodApplyBuildAtCityForOwner;wodApplyBuildAtCityForOwner=function(city,type,owner){const ok=build(city,type,owner);if(ok)audit.purchases.push({t:audit.t,owner,type,city:city.id});return ok;};
  window.playerOrders=()=>{
   const cities=gameData.cities.filter(c=>c.owner===1),army=gameData.entities.filter(u=>u.owner===1&&u.hp>0&&isLandArmyUnit(u));
   for(const c of cities)if(!wodCityProductionJob(c)&&!isCitySiegeBlockedForProduction(c)){
    const type=!cities.some(x=>x.hasFactory)&&army.length>=10&&gameData.money>6000?'factory':c.hasFactory&&army.length%5===0?'motorized':'light';
    if(getOwnerIncome(1)-getOwnerExpenses(1)>=getUnitUpkeep({type})&&cityEligibleForBuildPlacementForOwner(c,type,1))wodApplyBuildAtCityForOwner(c,type,1);
   }
   const guards=new Set();for(const c of cities){const u=army.filter(u=>!guards.has(u)).sort((a,b)=>Math.hypot(a.x-c.x,a.y-c.y)-Math.hypot(b.x-c.x,b.y-c.y))[0];if(u)guards.add(u);}
   const active=army.filter(u=>!guards.has(u)),intel=wodFogActive()?wodFogFactionIntel(1,true):null,visible=gameData.entities.filter(u=>u.owner===2&&u.hp>0&&wodFogCanSeeUnit(u));
   const towns=gameData.cities.filter(c=>c.owner===2&&wodFogCanSeeCity(c));
   const frontier=gameData.hexList.filter(h=>h.owner===2&&isClaimableLand(h)&&(!intel||intel.explored.has(getHexKey(h)))&&getNeighborHexes(h).some(n=>n.owner===1));
   for(const [i,u]of active.entries()){
    const home=cities.slice().sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y))[0];
    if(u.hp<u.maxHp*.4)u._auditRecover=true;if(u.hp>u.maxHp*.88)u._auditRecover=false;
    let goal=u._auditRecover?home:null;
    if(!goal&&spec.style==='defend'){const close=visible.filter(e=>cities.some(c=>Math.hypot(c.x-e.x,c.y-e.y)<gameData.hexRadius*12));goal=close.sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y))[0]||home;}
    if(!goal){const aims=spec.style==='flank'?frontier:towns.length?towns:frontier;const score=h=>Math.hypot(h.x-u.x,h.y-u.y)+(spec.style==='flank'||spec.style==='probe'?visible.reduce((n,e)=>n+Math.max(0,140-Math.hypot(e.x-h.x,e.y-h.y)),0)*2:0)+(spec.style==='flank'?(i%2?1:-1)*h.y*.8:0);goal=aims.slice().sort((a,b)=>score(a)-score(b))[0];}
    if(!goal||u.retreating||u.moraleBroken||u._combatEngaged&&!u._auditRecover)continue;
    const h=getNearestHexToPoint(goal.x+(i%3-1)*27,goal.y+(Math.floor(i/3)%3-1)*27);
    if(h&&!isWaterHex(h)&&canUnitEnterHex(u,h)&&wodAiCanReach(u,h))assignUnitMoveAlongWaypoints(u,[h]);
   }
  };
  window.step=seconds=>{const dt=.05;for(let i=0;i<seconds/dt&&!audit.winner;i++){
   if(audit.tick%160===0)playerOrders();if(audit.tick%14===0){wodFogFactionIntel(2,true);if(spec.fog)wodFogFactionIntel(1,true);}
   wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(dt);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();audit.tick++;audit.t=Math.round(audit.tick*dt*100)/100;
   if(audit.tick%20)continue;
   const own=gameData.entities.filter(u=>u.owner===2&&u.hp>0&&isLandArmyUnit(u));
   for(const u of own){const job=wodAiGetUnitTaskJob(u),old=audit.last[u.uid],duty=job?.city||job?.fort||['defend','scout','support','reserve','corridor','relief','counter'].includes(job?.kind)||u._medicalRecovering||u.retreating||u.moraleBroken||u.boardTransportUid;
    audit.metrics.unitSeconds++;if(wodGetUnitEncirclementState(u,getNearestHexToPoint(u.x,u.y)))audit.metrics.supplySeconds++;
    if(!duty){audit.metrics.offensiveSeconds++;if(old&&Math.hypot(u.x-old.x,u.y-old.y)<1&&!u._combatEngaged)audit.metrics.idleSeconds++;}audit.last[u.uid]={x:u.x,y:u.y};}
   for(const c of gameData.cities){if(c._auditOwner!==undefined&&c._auditOwner!==c.owner)audit.captures.push({t:audit.t,city:c.id,owner:c.owner});c._auditOwner=c.owner;}
   for(const owner of [1,2])if(!gameData.cities.some(c=>c.owner===owner)){audit.winner=owner===1?2:1;break;}
   if(spec.trace&&audit.tick%100===0){const plan=gameData.aiTaskForces[2],defense=gameData._aiDefenseByOwner?.[2];audit.traces.push({t:audit.t,cities:gameData.cities.map(c=>({id:c.id,owner:c.owner,x:c.x,y:c.y})),units:gameData.entities.filter(u=>u.hp>0&&u.type!=='convoy').map(u=>({id:u.uid,owner:u.owner,type:u.type,x:u.x,y:u.y,hp:u.hp,morale:u.morale,general:u.isGeneral,combat:u.combatTargetUid,goal:u.orderTarget,job:u.aiTfJobId,base:plan?.unitJob[u.uid],response:defense?.unitJob[u.uid],withdrawal:u._aiWithdrawal,medical:u._medicalRecovering,healGoal:u._medicalGoal,retreating:u.retreating,out:u.outOfSupplySeconds})),defense:defense?.jobs.map(j=>({id:j.id,kind:j.kind,members:j.members,city:j.city?.id,hold:j.holdHex&&getHexKey(j.holdHex),power:j.neededPower,deadline:j.deadline,primary:j.primaryTheater,risk:[...j.riskUnits||[]]}))});}
   if(audit.tick%600===0)audit.samples.push({t:audit.t,units:own.length,towns:gameData.cities.filter(c=>c.owner===2).length,land:gameData.hexList.filter(h=>h.owner===2&&isClaimableLand(h)).length,ledger:structuredClone(wodBattleLedger().byOwner),operations:wodAiActiveFrontOperations(2).map(o=>({id:o.id,n:o.members.length,phase:o.phase,goal:(o.strategicGoal||o.advanceGoal||o.goal)?.id||getHexKey(o.advanceGoal||o.goal),joint:o.joint?.id}))});
  }return{t:audit.t,winner:audit.winner,captures:audit.captures.length,units:gameData.entities.filter(u=>u.owner===2&&u.hp>0).length};};
 },spec);
 fs.writeFileSync(path.join(OUT,spec.id+'-start.json'),JSON.stringify(await page.evaluate(()=>audit.start)));
 console.log('START',spec.id);
 for(let t=0;t<Number(process.env.AUDIT_SECONDS||1800);t+=30){const s=await page.evaluate(()=>step(30));if(s.winner||t%180===0)console.log('TICK',spec.id,JSON.stringify(s));if(s.winner)break;}
 const result=await page.evaluate(()=>({spec:audit.spec,t:audit.t,winner:audit.winner,completed:!!audit.winner,reason:audit.winner?'all-enemy-towns-captured':'time-limit-draw',metrics:audit.metrics,captures:audit.captures,purchases:audit.purchases,ledger:wodBattleLedger().byOwner,samples:audit.samples,traces:audit.traces,events:audit.events,state:JSON.parse(render_game_to_text())}));result.errors=errors;
 await page.evaluate(()=>{const land=gameData.hexList,minX=Math.min(...land.map(h=>h.x)),maxX=Math.max(...land.map(h=>h.x)),minY=Math.min(...land.map(h=>h.y)),maxY=Math.max(...land.map(h=>h.y));gameData.camera.zoom=Math.min((canvas.clientWidth-80)/(maxX-minX),(canvas.clientHeight-240)/(maxY-minY));gameData.camera.x=(minX+maxX)/2*gameData.camera.zoom-canvas.clientWidth/2;gameData.camera.y=(minY+maxY)/2*gameData.camera.zoom-canvas.clientHeight/2;wodMarkTerrainFullDirty();updateTerrainCache();draw();});await page.screenshot({path:path.join(OUT,spec.id+'.png')});
 fs.writeFileSync(path.join(OUT,spec.id+'.json'),JSON.stringify(result,null,2));all.push({...result,events:undefined,samples:undefined,traces:undefined,state:undefined});fs.writeFileSync(path.join(OUT,'summary.json'),JSON.stringify(all,null,2));console.log('DONE',spec.id,JSON.stringify({winner:result.winner,t:result.t,metrics:result.metrics,errors}));await context.close();
 }}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
