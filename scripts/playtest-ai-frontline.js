// Full browser simulation replays: observed-only opponents, ordinary resources, saved map fixtures.
const fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),BASE=path.join(ROOT,'output/ai-frontline'),OUT=path.join(BASE,process.env.AUDIT_VERSION||'after');
fs.mkdirSync(OUT,{recursive:true});const SNAPSHOT=path.join(OUT,'source');fs.mkdirSync(SNAPSHOT,{recursive:true});for(const f of ['index.html','ai-command.js'])fs.copyFileSync(path.join(ROOT,f),path.join(SNAPSHOT,f));fs.writeFileSync(path.join(SNAPSHOT,'hashes.json'),JSON.stringify(Object.fromEntries(['index.html','ai-command.js'].map(f=>[f,require('crypto').createHash('sha256').update(fs.readFileSync(path.join(SNAPSHOT,f))).digest('hex')]))));fs.mkdirSync(path.join(BASE,'fixtures'),{recursive:true});
const maps=[
 {mapId:'open-flank',shape:'rectangle',seed:47101,style:'flank',seconds:1200},
 {mapId:'forest-push',shape:'forest',seed:47102,style:'push',seconds:1200},
 {mapId:'mountain-push',shape:'mountain',seed:47103,style:'push',seconds:1200},
 {mapId:'island-flank',shape:'island',seed:47104,style:'flank',seconds:1200},
 {mapId:'naval-invasion',shape:'archipelago',seed:47105,style:'navdefend',seconds:1800,armedStart:true}
];
const offset=Number(process.env.AUDIT_SEED_OFFSET||0);
if(offset)for(const m of maps){m.seed+=offset;m.mapId+='-'+offset;}
const cases=maps.flatMap(m=>[true,false].map(fog=>({...m,id:m.mapId+(fog?'-fog':'-clear'),fog})));
const SECONDS=Number(process.env.AUDIT_SECONDS||600),DT=Number(process.env.AUDIT_DT||1/60),SUFFIX=process.env.AUDIT_SUFFIX||'';
const server=http.createServer((req,res)=>{let f=path.resolve(ROOT,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(ROOT+path.sep))return res.writeHead(403).end();if(['index.html','ai-command.js'].includes(path.relative(ROOT,f)))f=path.join(SNAPSHOT,path.basename(f));fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ogg':'audio/ogg','.mp3':'audio/mpeg'})[path.extname(f)]||'application/octet-stream');res.end(b);});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r)); const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});fs.writeFileSync(path.join(OUT,'server.json'),JSON.stringify({url}));
 const all=[];
 try {for(const spec of cases.filter(c=>!process.env.AUDIT_CASE||process.env.AUDIT_CASE.split(',').includes(c.id))){
  const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[];
  await context.routeWebSocket(/.*/,s=>{s.onMessage(()=>{});s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]}));});
  page.on('pageerror',e=>errors.push(e.stack));page.setDefaultTimeout(180000);
  await page.addInitScript(seed=>{let s=seed;Math.random=()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};},spec.seed);
  await page.goto(url+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks);
  await page.evaluate(spec=>{setGameSpeed(0,true);wodDismissChangelogPopup();document.getElementById('setupMapSize').value='40';document.getElementById('setupMapShape').value=spec.shape;document.getElementById('setupAI').value='1';document.getElementById('setupFogOfWar').checked=spec.fog;gameData._mapGenSeedBase=spec.seed;gameData._mapGenSeed=spec.seed;gameData._wodReuseMapGenSeed=true;gameData.loadedCustomMap=false;gameData._soloPreviewSnapshot=null;gameData._soloMapPreviewMatchesStart=false;startGame('ai');},spec);
  await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks);
  const fixtureFile=path.join(BASE,'fixtures',(spec.mapId||spec.id)+'.json');
  if(!fs.existsSync(fixtureFile)){
   const map=await page.evaluate(spec=>{setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodAiCommander(2);const m=WOD.exportMapData();m.money=10000;m.manpower=5000;m.aiMoneyByOwner={2:10000};m.aiManpowerByOwner={2:5000};m.aiCommanderProfiles=gameData.aiCommanderProfiles;m.entities=m.entities.filter(u=>u.type!=='convoy');for(const u of m.entities)for(const k of Object.keys(u))if(k.startsWith('ai')||['target','path','orderTarget','fullMarchWaypoints','marchWpCursor','holding','retreating'].includes(k))delete u[k];return m;},spec);
   fs.writeFileSync(fixtureFile,JSON.stringify(map));
  }
  await page.evaluate(({map,spec})=>{cancelAnimationFrame(animationFrameId);wodPrepareForNewMatch({keepLiveMap:true});WOD.loadMapData(map);gameData.aiCommanderProfiles=map.aiCommanderProfiles;gameData._factionIntel={};gameData._fogVisionTimer=0;gameData.fogOfWar=spec.fog;gameData._landIncomeCacheDirty=true;if(spec.armedStart){const city=gameData.cities.find(c=>c.name==='Pine Point')||gameData.cities.find(c=>c.owner===1);const water=gameData.hexList.filter(h=>wodIsOpenWaterHex(h)).sort((a,b)=>Math.hypot(a.x-city.x,a.y-city.y)-Math.hypot(b.x-city.x,b.y-city.y))[0];const infantry=gameData.entities.find(u=>u.owner===1&&u.type==='light');if(infantry)gameData.entities=gameData.entities.filter(u=>u!==infantry);const ship=createUnitAt('ship',water.x,water.y,1,{startSpawn:true});ship.x=water.x;ship.y=water.y;}gameState='PLAYING';gameData.menuAttractMode=false;gameData.unitSpatialGrid=buildUnitSpatialGrid();wodRefreshFogVision(1);let seed=spec.seed+5000;Math.random=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}, {map:JSON.parse(fs.readFileSync(fixtureFile)),spec});
  await page.evaluate(spec=>{
   setGameSpeed(1,true);cancelAnimationFrame(animationFrameId);gameData._matchReadyForEndChecks=false;gameData.fogOfWar=spec.fog;
   wodAiCommander(2);let playSeed=spec.seed+9000;Math.random=()=>{playSeed|=0;playSeed=playSeed+0x6D2B79F5|0;let t=Math.imul(playSeed^playSeed>>>15,1|playSeed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
   window.audit={spec,t:0,tick:0,dt:spec.dt,events:[],samples:[],purchaseAttempts:[],startingOwners:Object.fromEntries(gameData.hexList.map(h=>[getHexKey(h),h.owner])),lastPos:{},metrics:{unitSeconds:0,idleSeconds:0,waterSeconds:0,unsuppliedSeconds:0,medicalSeconds:0,shipSeconds:0,shipIdleSeconds:0,firstCombat:null,firstTownThreat:null,emptyAffordableCitySeconds:0},seen:new Set(gameData.entities.map(u=>u.uid)),births:[],deaths:[],lastUnits:new Map(),landings:new Set(),traces:[]};
   const record=wodAiRecord;wodAiRecord=function(owner,event,detail){record(owner,event,detail);if(owner===2&&audit.events.length<30000){const tail=gameData._aiDecisionLog?.owners[owner]?.events.at(-1);if(tail&&audit.lastDecision!==tail){audit.lastDecision=tail;audit.events.push({...tail});}}};
   const build=wodApplyBuildAtCityForOwner;wodApplyBuildAtCityForOwner=function(city,type,owner){const ok=build(city,type,owner);if(ok)audit.purchaseAttempts.push({at:gameData._aiEconomyClock,city:city.name,owner,type});return ok;};
   window.auditPlayer=()=>{
    if(spec.style==='passive')return;
    const playerIntel=wodFogFactionIntel(1,true);const playerCanSee=item=>{const h=item.q!=null?item:getNearestHexToPoint(item.x,item.y);return h&&playerIntel.visible.has(getHexKey(h));};
    const cities=gameData.cities.filter(c=>c.owner===1),troops=gameData.entities.filter(u=>u.owner===1&&isLandArmyUnit(u)&&u.hp>0),free=cities.filter(c=>!wodCityProductionJob(c)&&!isCitySiegeBlockedForProduction(c));
    const navalSaving=spec.style==='navdefend'&&gameData.entities.filter(u=>u.owner===1&&u.type==='ship').length+gameData.constructionJobs.filter(j=>j.owner===1&&j.mode==='ship').length<1;
    for(const city of free){
     let type='light',n=troops.length;
     const harborPlanned=cities.some(c=>c.hasHarbor)||gameData.constructionJobs.some(j=>j.owner===1&&j.mode==='harbor');
     if(spec.style==='navdefend'&&navalSaving){
      if(!harborPlanned&&cityHasWaterNeighbor(city))type='harbor';
      else if(city.hasHarbor&&canAffordUnit(1,'ship'))type='ship';
      else continue;
     }else if(spec.style!=='navdefend'&&!cities.some(c=>c.hasFactory)&&audit.t<100&&gameData.money>WOD_PRICE_FACTORY+3000)type='factory';
     else if(city.hasFactory&&n>8)type=n%4===0?'heavy':n%3===0?'motorized':'light';
     if(cityEligibleForBuildPlacementForOwner(city,type,1))wodApplyBuildAtCityForOwner(city,type,1);
    }
    const guards=new Set();for(const c of cities){const u=troops.filter(u=>u.type==='light'&&!guards.has(u)).sort((a,b)=>Math.hypot(a.x-c.x,a.y-c.y)-Math.hypot(b.x-c.x,b.y-c.y))[0];if(u)guards.add(u);}
    if(spec.style==='navdefend'){
     const visible=gameData.entities.filter(u=>u.owner!==1&&u.hp>0&&playerCanSee(u));
     for(const [i,ship]of gameData.entities.filter(u=>u.owner===1&&u.type==='ship'&&u.hp>0).entries()){
      const harbor=cities.find(c=>c.hasHarbor)||cities[0],prey=visible.filter(u=>wodIsNavalUnit(u)||cities.some(c=>Math.hypot(c.x-u.x,c.y-u.y)<220)).sort((a,b)=>Math.hypot(a.x-ship.x,a.y-ship.y)-Math.hypot(b.x-ship.x,b.y-ship.y))[0];
      const aim=ship.hp/ship.maxHp<.35?harbor:prey||harbor;if(!aim)continue;
      const h=getNearestHexToPoint(aim.x,aim.y),sea=wodNavalWaterRegionKeys(ship,getNearestHexToPoint(ship.x,ship.y));
      const choices=getHexesInRadius(h.q,h.r,5).map(p=>gameData.hexes[p.q+','+p.r]).filter(p=>wodIsOpenWaterHex(p)&&sea?.has(getHexKey(p)));
      choices.sort((a,b)=>Math.abs(Math.hypot(a.x-aim.x,a.y-aim.y)-(prey?(ship.range||80)*.7:40))-Math.abs(Math.hypot(b.x-aim.x,b.y-aim.y)-(prey?(ship.range||80)*.7:40)));
      const goal=choices[i%Math.max(1,choices.length)];if(goal&&(!ship.target||audit.t%24===0))assignUnitMoveAlongWaypoints(ship,[goal]);
     }return;
    }
    if(spec.style==='defend')return;
    const moving=troops.filter(u=>!guards.has(u));if(!moving.length)return;
    const known=gameData.cities.filter(c=>c.owner===2&&playerCanSee(c)),center={x:moving.reduce((n,u)=>n+u.x,0)/moving.length,y:moving.reduce((n,u)=>n+u.y,0)/moving.length};
    let goal=known.sort((a,b)=>Math.hypot(a.x-center.x,a.y-center.y)-Math.hypot(b.x-center.x,b.y-center.y))[0];
    if(spec.style==='flank'||!goal){const visible=gameData.entities.filter(u=>u.owner===2&&playerCanSee(u));const land=gameData.hexList.filter(h=>isClaimableLand(h)&&h.owner===2&&playerCanSee(h)&&getNeighborHexes(h).some(n=>n.owner===1)&&moving.some(u=>wodAiCanReach(u,h)));land.sort((a,b)=>{const score=h=>Math.hypot(h.x-center.x,h.y-center.y)*.2+visible.reduce((n,u)=>n+Math.max(0,200-Math.hypot(u.x-h.x,u.y-h.y))*3,0)+(audit.t<300?h.y:-h.y)*.3;return score(a)-score(b);});goal=land[0]||goal;}
    if(!goal)return;
    for(const [i,u]of moving.entries()){if(u.hp/u.maxHp<.45){const c=cities.slice().sort((a,b)=>Math.hypot(u.x-a.x,u.y-a.y)-Math.hypot(u.x-b.x,u.y-b.y))[0];if(c)assignUnitMoveAlongWaypoints(u,[{x:c.x+(i%3-1)*35,y:c.y+(Math.floor(i/3)%3-1)*35}]);continue;}if(!wodAiCanReach(u,goal))continue;const h=getNearestHexToPoint(goal.x+(i%3-1)*32,goal.y+(Math.floor(i/3)%3-1)*32);if(h&&canUnitEnterHex(u,h)&&!isWaterHex(h))assignUnitMoveAlongWaypoints(u,[h]);}
   };
   window.auditSample=()=>{
    const owner=n=>{const units=gameData.entities.filter(u=>u.owner===n&&u.hp>0&&u.type!=='convoy'),ground=units.filter(isLandArmyUnit),cities=gameData.cities.filter(c=>c.owner===n),diag=n===2?wodAiDiagnostics(n):null;return{units:units.length,types:units.reduce((o,u)=>(o[u.type]=(o[u.type]||0)+1,o),{}),hp:Math.round(units.reduce((n,u)=>n+u.hp,0)),towns:cities.map(c=>c.name),land:gameData.hexList.filter(h=>isClaimableLand(h)&&h.owner===n).length,money:Math.round(n===1?gameData.money:gameData.aiMoneyByOwner[n]||0),manpower:Math.round(n===1?gameData.manpower:gameData.aiManpowerByOwner[n]||0),income:getOwnerIncome(n),upkeep:getOwnerExpenses(n),supply:ground.filter(u=>wodGetUnitEncirclementState(u,getNearestHexToPoint(u.x,u.y))).length,medical:units.filter(u=>u._medicalRecovering).length,jobs:gameData.constructionJobs.filter(j=>j.owner===n).map(j=>j.mode),ledger:wodBattleLedger().byOwner[n],diag,groups:n===2?gameData.aiTaskForces[n]?.jobs.map(j=>({id:j.id,kind:j.kind,phase:j.phase,stage:j.stage,n:j.members.length,goal:j.objectiveCity?.name||j.objectiveHex&&getHexKey(j.objectiveHex),rally:j.holdHex&&{x:j.holdHex.x,y:j.holdHex.y}})):null,knownEnemyTowns:n===2?wodAiKnownCities(n).filter(c=>wodIsHostileOwner(c.owner,n)).map(c=>c.id):[],hospitals:(gameData.hospitals||[]).filter(h=>h.owner===n).map(h=>({q:h.q,r:h.r})),naval:n===2?gameData.aiNavalPlans?.[n]:null};};
    const s={t:audit.t,player:owner(1),ai:owner(2)};s.player.ledger=structuredClone(s.player.ledger);s.ai.ledger=structuredClone(s.ai.ledger);if(s.ai.naval){const p=s.ai.naval,h=p.goal&&getNearestHexToPoint(p.goal.x,p.goal.y);s.ai.naval={phase:p.phase,reason:p.reason,canSail:p.canSail,forceRatio:p.forceRatio,waveRatio:p.waveRatio,requiredSupply:p.requiredSupply,requiredEscorts:p.requiredEscorts,waveTroops:p.waveTroops,transports:p.transports,escorts:p.escorts,landing:p.landing&&{x:p.landing.x,y:p.landing.y},rendezvous:p.rendezvous,goal:p.goal&&{id:p.goal.id,owner:p.goal.owner,actualOwner:h?.owner,key:h&&getHexKey(h),name:p.goal.name,x:p.goal.x,y:p.goal.y},knownCities:wodAiKnownCities(2).map(c=>({name:c.name,owner:c.owner})),supply:p.support};}audit.samples.push(s);return s;
   };
   window.auditStep=seconds=>{
    for(let i=0;i<Math.round(seconds/audit.dt);i++){
     if(audit.tick%Math.round(8/audit.dt)===0)auditPlayer();
     if(audit.tick%14===0)wodFogFactionIntel(2,true); // Advance the native vision cache at normal simulation cadence during accelerated play.
     wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(audit.dt);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();audit.tick++;audit.t=Math.round(audit.tick*audit.dt*1000)/1000;
     if(audit.tick%Math.round(1/audit.dt)!==0)continue;
     const live=gameData.entities.filter(u=>u.hp>0&&u.type!=='convoy'),ids=new Set(live.flatMap(u=>u.cargo?[u.uid,u.cargo.uid]:[u.uid]));
     for(const [uid,u]of audit.lastUnits)if(!ids.has(uid)){audit.deaths.push({at:audit.t,uid,...u});audit.lastUnits.delete(uid);}
     for(const u of live){audit.lastUnits.set(u.uid,{owner:u.owner,type:u.type,x:Math.round(u.x),y:Math.round(u.y),general:u.isGeneral});if(!audit.seen.has(u.uid)){audit.seen.add(u.uid);audit.births.push({at:audit.t,owner:u.owner,type:u.type});}if(u.owner!==2)continue;const m=audit.metrics,p=audit.lastPos[u.uid];m.unitSeconds++;if(p&&Math.hypot(u.x-p.x,u.y-p.y)<1&&!u.combatTargetUid&&!u._medicalRecovering)m.idleSeconds++;audit.lastPos[u.uid]={x:u.x,y:u.y};if(isWaterHex(getNearestHexToPoint(u.x,u.y)))m.waterSeconds++;if(isLandArmyUnit(u)&&wodGetUnitEncirclementState(u,getNearestHexToPoint(u.x,u.y)))m.unsuppliedSeconds++;if(u._medicalRecovering)m.medicalSeconds++;if(wodIsNavalUnit(u)){m.shipSeconds++;if(!u.target&&!u.cargo&&!u.pickupUid)m.shipIdleSeconds++;}if(u._navalLanded)audit.landings.add(u.uid);if(m.firstCombat===null&&u.combatTargetUid)m.firstCombat=audit.t;if(m.firstTownThreat===null&&gameData.cities.some(c=>c.owner===1&&Math.hypot(u.x-c.x,u.y-c.y)<(gameData.hexRadius||20)*8))m.firstTownThreat=audit.t;}
     const cities=gameData.cities.filter(c=>c.owner===2&&!wodCityProductionJob(c)&&!isCitySiegeBlockedForProduction(c));if(cities.length&&canAffordUnit(2,'light')&&getOwnerIncome(2)>=getOwnerExpenses(2)+getUnitUpkeep({type:'light'})&&!gameData._aiEconomyPlans?.[2]?.savingFor)audit.metrics.emptyAffordableCitySeconds++;
     if(audit.t%5===0)audit.traces.push({t:audit.t,cities:gameData.cities.map(c=>({id:c.id,name:c.name,owner:c.owner,x:c.x,y:c.y,siege:isCitySiegeBlockedForProduction(c)})),units:live.map(u=>({id:u.uid,owner:u.owner,type:u.type,hp:Math.round(u.hp),x:Math.round(u.x),y:Math.round(u.y),goal:u.orderTarget,step:u.target,role:u.aiTfKind,job:u.aiTfJobId,medical:u._medicalRecovering,healing:!!wodUnitHealingSite(u),canHeal:canHealUnit(u),evacuating:u._medicalEvacuating,medicalFerry:u._aiMedicalFor,unload:u.unloadHexKey,pickup:u.pickupUid,navalLease:u._navalAssaultUntil,unsupplied:!!wodGetUnitEncirclementState(u,getNearestHexToPoint(u.x,u.y)),out:u.outOfSupplySeconds,combat:u.combatTargetUid,loaded:u.cargo?.uid,general:u.isGeneral,commandPartners:u.isGeneral?gameData.entities.filter(a=>a!==u&&a.owner===u.owner&&a.hp>0&&(isLandArmyUnit(a)||a.type==='marine')&&Math.hypot(a.x-u.x,a.y-u.y)<wodFortCombatAuraRadiusPx()).length:undefined,scout:u._aiScoutUntil>wodAiOperationTime(),navalLanded:u._navalLanded,needsFerry:u._needsTransport,boarding:u.boardTransportUid,retreating:u.retreating,holding:u.holding,pathLength:u.path?.length||0,healingFlash:u.healingFlash,medicalWaiting:u._medicalWaiting,healGoal:u._medicalGoal,inWater:isWaterHex(getNearestHexToPoint(u.x,u.y)),supplyShip:wodSupplyShipForUnit(u)?.uid})),hospitals:(gameData.hospitals||[]).map(h=>({owner:h.owner,q:h.q,r:h.r})),corridors:gameData._aiDefenseByOwner?.[2]?.corridors.map(c=>({id:c.id,predictive:c.predictive,closure:c.closureSeconds,withdraw:c.withdrawSeconds,risk:[...c.riskUnits||[]]}))});
    }
    return auditSample();
   };
   auditSample();
  },{...spec,dt:DT});
  const LIMIT=Number(process.env.AUDIT_SECONDS)||spec.seconds||SECONDS;
  const initial=await page.evaluate(()=>({commander:wodAiCommander(2).id,profiles:gameData.aiCommanderProfiles,cells:gameData.hexList.length,sample:audit.samples[0]}));const fixed=JSON.parse(fs.readFileSync(fixtureFile));fixed.aiCommanderProfiles=initial.profiles;fs.writeFileSync(fixtureFile,JSON.stringify(fixed));fs.writeFileSync(path.join(OUT,spec.id+'-initial.json'),JSON.stringify(initial,null,2));console.log('START',spec.id,JSON.stringify({commander:initial.commander,cells:initial.cells,sample:initial.sample}));
  for(let t=0;t<LIMIT;t+=30){const sample=await page.evaluate(()=>auditStep(30));console.log('TICK',spec.id+SUFFIX,JSON.stringify({t:sample.t,player:sample.player.units,ai:sample.ai.units,towns:sample.ai.towns.length,land:sample.ai.land,money:sample.ai.money,types:sample.ai.types,jobs:sample.ai.jobs,intent:sample.ai.diag?.intent,naval:sample.ai.naval}));if(t===150||t===270||t===570||t===LIMIT-30){await page.evaluate(()=>{const land=gameData.hexList.filter(isClaimableLand),minX=Math.min(...land.map(h=>h.x)),maxX=Math.max(...land.map(h=>h.x)),minY=Math.min(...land.map(h=>h.y)),maxY=Math.max(...land.map(h=>h.y));gameData.camera.zoom=Math.min((canvas.clientWidth-80)/(maxX-minX),(canvas.clientHeight-240)/(maxY-minY));gameData.camera.x=(minX+maxX)/2*gameData.camera.zoom-canvas.clientWidth/2;gameData.camera.y=(minY+maxY)/2*gameData.camera.zoom-canvas.clientHeight/2;wodMarkTerrainFullDirty();updateTerrainCache();draw();});await page.screenshot({path:path.join(OUT,spec.id+SUFFIX+'-'+(t+30)+'.png')});}if(!sample.ai.towns.length||!sample.player.towns.length)break;}
  await page.evaluate(()=>{const land=gameData.hexList.filter(isClaimableLand),minX=Math.min(...land.map(h=>h.x)),maxX=Math.max(...land.map(h=>h.x)),minY=Math.min(...land.map(h=>h.y)),maxY=Math.max(...land.map(h=>h.y));gameData.camera.zoom=Math.min((canvas.clientWidth-80)/(maxX-minX),(canvas.clientHeight-240)/(maxY-minY));gameData.camera.x=(minX+maxX)/2*gameData.camera.zoom-canvas.clientWidth/2;gameData.camera.y=(minY+maxY)/2*gameData.camera.zoom-canvas.clientHeight/2;wodMarkTerrainFullDirty();updateTerrainCache();draw();});
  await page.screenshot({path:path.join(OUT,spec.id+SUFFIX+'-final.png')});
  const result=await page.evaluate(()=>({spec:audit.spec,metrics:audit.metrics,samples:audit.samples,traces:audit.traces,events:audit.events,purchases:audit.purchaseAttempts,births:audit.births,deaths:audit.deaths,landings:[...audit.landings],units:gameData.entities.filter(u=>u.type!=='convoy').map(u=>({uid:u.uid,owner:u.owner,type:u.type,hp:u.hp,mp:u.manpower,maxMp:u.maxManpower,morale:u.morale,x:u.x,y:u.y,target:u.target,order:u.orderTarget,group:u.aiTfKind,job:u.aiTfJobId,general:u.isGeneral,medical:u._medicalRecovering,out:u.outOfSupplySeconds,combat:u.combatTargetUid,cargo:u.cargo?.uid})),state:JSON.parse(render_game_to_text())}));result.errors=errors;all.push(result);fs.writeFileSync(path.join(OUT,spec.id+SUFFIX+'.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(OUT,'summary'+SUFFIX+'.json'),JSON.stringify(all.map(r=>({spec:r.spec,metrics:r.metrics,start:r.samples[0],end:r.samples.at(-1),purchases:r.purchases,deaths:r.deaths,landings:r.landings,errors:r.errors})),null,2));fs.writeFileSync(path.join(OUT,spec.id+SUFFIX+'-map-final.json'),JSON.stringify(await page.evaluate(()=>WOD.exportMapData())));console.log('DONE',spec.id+SUFFIX,JSON.stringify({metrics:result.metrics,deaths:result.deaths.length,errors}));await context.close();
 }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
