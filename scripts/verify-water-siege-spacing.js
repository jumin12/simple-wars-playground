const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/water-siege-spacing');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(ROOT,'.'+(req.url.split('?')[0]==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0])));
 if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(err,body)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ogg':'audio/ogg','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream');res.end(body);});
});
(async()=>{
 const relay=new WebSocketServer({port:8080});relay.on('error',()=>{});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],results={};page.on('pageerror',e=>errors.push(e.stack));
 try{
  await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
  await page.evaluate(()=>{
   setGameSpeed(0,true);wodDismissChangelogPopup();
   window.resetWaterTest=(owner=1)=>{
    WOD.makeBlankMap(30);gameState='PLAYING';gameData.mp={enabled:false};gameData._campaignRun=null;gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.bridges=[];gameData.constructionJobs=[];gameData._encircWork=null;gameData.encircledHexes=new Set();gameData.encircledReliefHexes=new Set();gameData._cityCombatStagingKeys=new Set();gameData.cityCombatBlockForProd=new Set();gameData._matchReadyForEndChecks=false;gameData._aiSpawnBurst=null;gameData._aiStratWork=null;gameData._aiFormChunk=null;gameData.aiTimer=-1e6;gameData.aiStrategyTimer=-1e6;gameData._aiFortGuardTimer=-1e6;gameData.convoyTimer=-1e6;gameData._wodPfCache=new Map();gameData._wodPfVer=(gameData._wodPfVer||0)+1;gameData.money=1e7;gameData.manpower=1e7;gameData.aiMoneyByOwner={2:1e7};gameData.aiManpowerByOwner={2:1e7};
    gameData._aiBridgeCooldown={};
    for(const h of gameData.hexList){h.type='grass';h.owner=owner;h.cityId=null;}
   };
   window.testTown=(q,r,owner,id)=>{const h=gameData.hexes[`${q},${r}`];h.type='urban';h.cityId=id;const c={id,name:id,owner,q,r,x:h.x,y:h.y,hp:1000,maxHp:1000,hasFactory:true,hasHarbor:true};gameData.cities.push(c);return c;};
  });
  results.sieges=await page.evaluate(()=>{
   const rows=[];
   for(const owner of [1,2])for(const pressure of ['intruder','contested','staged']) {
    resetWaterTest(owner);const city=testTown(0,0,owner,'Town');
    const rim=gameData.hexes['1,0'];rim.type='urban';rim.cityId=city.id;city._urbanHexCache=null;
    const queued=wodApplyBuildAtCityForOwner(city,'light',owner),job=gameData.constructionJobs[0];job.remaining=.01;
    if(pressure==='intruder'){const u=createUnitAt('light',rim.x,rim.y,owner===1?2:1);u.x=rim.x;u.y=rim.y;}
    if(pressure==='contested')rim.owner=owner===1?2:1;
    if(pressure==='staged')gameData._cityCombatStagingKeys.add('0,0');
    const before=job.remaining,blocked=isCitySiegeBlockedForProduction(city),spawnBlocked=!spawnUnit('light',city,owner),newOrderBlocked=!wodApplyBuildAtCityForOwner(city,'heavy',owner);
    wodUpdateConstruction(10);const paused=job.remaining===before&&gameData.constructionJobs.length===1;
    const n=gameData.entities.length;
    if(owner===2)wodRunAiSpawnBurstForOwner('2',{'2':[city]},{'2':100},{2:0});
    const noAiQueue=gameData.constructionJobs.length===1;
    gameData.entities=[];rim.owner=owner;gameData._cityCombatStagingKeys.clear();gameData.cityCombatBlockForProd.clear();wodUpdateConstruction(.02);
    rows.push({owner,pressure,queued,blocked,spawnBlocked,newOrderBlocked,paused,noAiQueue,resumed:gameData.entities.length===1&&!gameData.constructionJobs.length,n});
   }
   return rows;
  });console.log('sieges',JSON.stringify(results.sieges));
  assert(results.sieges.every(r=>r.queued&&r.blocked&&r.spawnBlocked&&r.newOrderBlocked&&r.paused&&r.noAiQueue&&r.resumed));
  results.water=await page.evaluate(()=>{
   const rows=[];
   for(const owner of [1,2])for(const type of ['light','heavy','convoy','marine','ship'])for(const ordered of [false,true]) {
    resetWaterTest(owner);testTown(-8,0,owner,'Supply town');const h=gameData.hexes['0,0'];h.type='water';h.owner=0;
    const u=createUnitAt(type,h.x,h.y,owner);u.x=h.x;u.y=h.y;u.range=0;u.hp=u.maxHp*.75;u.manpower=(u.maxManpower||1000)*.75;
    if(type==='convoy')u.convoySeaRoute=true;
    if(ordered){u.orderTarget={x:h.x,y:h.y,intoWater:true};u._wodOrderIntoWater=true;u.target={x:h.x,y:h.y,pathPrepared:true};}
    u.waterExposureSeconds=10;u.outOfSupplySeconds=10;const before=u.hp,unsupplied=!!wodGetUnitEncirclementState(u,h),heals=canHealUnit(u);update(.5);
    rows.push({owner,type,ordered,unsupplied,heals,loss:(before-u.hp)/u.maxHp,stillInWater:isWaterHex(getNearestHexToPoint(u.x,u.y))});
   }
   return rows;
  });console.log('water',JSON.stringify(results.water));
  for(const r of results.water) {
   if(['marine','ship'].includes(r.type))assert(!r.unsupplied&&(r.type==='marine'?!r.heals&&r.loss===0:r.heals&&r.loss<0),'amphibious/naval exemption '+JSON.stringify(r));
   else assert(r.unsupplied&&!r.heals&&r.stillInWater&&Math.abs(r.loss-.0175)<.00001,'same water attrition for every owner/order '+JSON.stringify(r));
  }
  results.grace=await page.evaluate(()=>{
   const rows=[];
   for(const owner of [1,2])for(const type of ['light','heavy','convoy']) {
    resetWaterTest(owner);testTown(-8,0,owner,'Supply town');const h=gameData.hexes['0,0'];h.type='water';h.owner=0;
    const u=createUnitAt(type,h.x,h.y,owner);u.x=h.x;u.y=h.y;u.hp=u.maxHp*.75;u.range=0;
    const hp=u.hp;for(let i=0;i<99;i++)update(.1);const at49=u.hp;
    update(.1);const at5=u.hp;update(.25);const after=u.hp;
    const synced=wodEntityFromNet(wodStripEntityForNet(u)).waterExposureSeconds;
    h.type='grass';update(.1);const reset=u.waterExposureSeconds;h.type='water';const fresh=u.hp;update(2);const reentry=u.hp;
    const dt=wodAdvanceWaterExposure(u,9,h); // 2 + 9 crosses the threshold by exactly 1 second.
    rows.push({owner,type,hp,at49,at5,loss:(at5-after)/u.maxHp,synced,reset,fresh,reentry,dt});
   }
   return rows;
  });
  for(const r of results.grace){assert(Math.abs(r.at49-r.hp)<1e-7&&Math.abs(r.at5-r.hp)<1e-7,'ten full seconds without damage '+JSON.stringify(r));assert(Math.abs(r.loss-.00875)<1e-7,'only time after threshold damages '+JSON.stringify(r));assert(Math.abs(r.synced-10.25)<1e-7&&r.reset===0&&r.fresh===r.reentry&&Math.abs(r.dt-1)<1e-7,'replicated timer, reset, fresh crossing and partial tick '+JSON.stringify(r));}
  results.routes=await page.evaluate(async()=>{
   const rows=[];
   for(const owner of [1,2])for(const kind of ['detour','necessary','explicit']) {
    resetWaterTest(owner);const start=gameData.hexes['-6,0'],goal=gameData.hexes['6,0'];
    for(const h of gameData.hexList)if(h.q===0&&(kind==='necessary'||Math.abs(h.r)<=8))h.type='water';
    const u=createUnitAt('light',start.x,start.y,owner);u.x=start.x;u.y=start.y;
    gameData.unitSpatialGrid=buildUnitSpatialGrid();
    wodBeginSimPfBudget(gameData.entities.length);
    const wet=gameData.hexes['0,0'];const accidentalPermission=wodOrderIntoWater(u,wet),accidentalChord=wodSamplePosOnWalkableTerrain(u,wet.x,wet.y);
    const target=kind==='explicit'?wet:goal;
    const assigned=assignUnitMoveAlongWaypoints(u,[{x:target.x,y:target.y}]);
    const initial={flags:u._wodOrderIntoWater,order:{...u.orderTarget},target:{...u.target},path:u.path?.map(p=>({...p})),walksWater:wodSamplePosOnWalkableTerrain(u,wet.x,wet.y)};
    let wetTicks=0;for(let i=0;i<1800&&Math.hypot(u.x-target.x,u.y-target.y)>4;i++){wodBeginSimPfBudget(gameData.entities.length);moveUnitTowardTarget(u,.1);if(isWaterHex(getNearestHexToPoint(u.x,u.y)))wetTicks++;}
    if(kind==='necessary'&&Math.hypot(u.x-target.x,u.y-target.y)>20) {
     // Live AI retries after a bounded search's wall-clock cooldown; virtual
     // movement ticks alone cannot advance performance.now().
     await new Promise(r=>setTimeout(r,1700));wodBeginSimPfBudget(1);assignUnitMoveAlongWaypoints(u,[{x:target.x,y:target.y}]);
     for(let i=0;i<1800&&Math.hypot(u.x-target.x,u.y-target.y)>4;i++){wodBeginSimPfBudget(1);moveUnitTowardTarget(u,.1);if(isWaterHex(getNearestHexToPoint(u.x,u.y)))wetTicks++;}
    }
    const probe={...u,_wodAmpPathKey:null,_wodAmpFailKey:null,_wodPfRelaxUntil:performance.now()+1000};
    const diagnostic=findAmphibiousMarchPath(probe,start,target).map(h=>[h.q,h.r]);
    rows.push({owner,kind,assigned,accidentalPermission,accidentalChord,wetTicks,arrived:Math.hypot(u.x-target.x,u.y-target.y)<20,x:u.x,y:u.y,initial,diagnostic,finalFlag:u._wodOrderIntoWater,finalOrder:u.orderTarget,walksWater:wodSamplePosOnWalkableTerrain(u,wet.x,wet.y),unitHex:getHexKey(getNearestHexToPoint(u.x,u.y)),bridgeNear:!!wodBridgeHexAtPoint(u,wet.x,wet.y)});
   }
   return rows;
  });console.log('routes',JSON.stringify(results.routes));
  for(const r of results.routes){if(r.owner===2&&r.kind!=='detour'){assert(r.wetTicks===0&&!r.arrived,'AI infantry waits for safe access rather than swimming');continue;}assert(r.assigned&&r.arrived&&!r.accidentalPermission&&!r.accidentalChord,JSON.stringify(r));assert(r.kind==='detour'?r.wetTicks===0:r.wetTicks>0,JSON.stringify(r));}
  results.spacing=await page.evaluate(()=>{
   const rows=[];
   for(const kind of ['adjacentCenters','touchingFootprints','separated']) {
    resetWaterTest();const a=testTown(-8,0,1,'A'),b=testTown(kind==='adjacentCenters'?-1:8,0,2,'B');
    if(kind==='touchingFootprints'){for(const [q,id] of [[0,a.id],[1,b.id]]){const h=gameData.hexes[`${q},0`];h.type='urban';h.cityId=id;}}
    rows.push({kind,...wodValidateStartingBorders([1,2])});
   }
   return rows;
  });
  assert(results.spacing.filter(r=>r.kind!=='separated').every(r=>r.reason==='town-spacing'),'both center and footprint spacing are hard acceptance rules');
  assert(results.spacing.find(r=>r.kind==='separated').reason!=='town-spacing');
  results.connectivity=await page.evaluate(()=>{
   resetWaterTest();const u={type:'light',owner:1},a=gameData.hexes['-6,0'],b=gameData.hexes['6,0'];
   for(let i=0;i<20;i++)wodMarchBlockedWithoutBridge(u,a,b);
   const before=gameData._wodDryLandConnectivity.labels.get(getHexKey(a))===gameData._wodDryLandConnectivity.labels.get(getHexKey(b));
   for(const h of gameData.hexList)if(h.q===0)h.type='water';WOD.invalidateTerrain();
   let blocked=false;for(let i=0;i<20&&!blocked;i++)blocked=wodMarchBlockedWithoutBridge(u,a,b);
   gameData.hexes['0,0'].type='grass';WOD.invalidateTerrain();
   for(let i=0;i<20;i++)wodMarchBlockedWithoutBridge(u,a,b);
   const after=gameData._wodDryLandConnectivity.labels.get(getHexKey(a))===gameData._wodDryLandConnectivity.labels.get(getHexKey(b));
   return{before,blocked,after};
  });
  assert(results.connectivity.before&&results.connectivity.blocked&&results.connectivity.after,'terrain edits invalidate shared land connectivity and new gaps restore the route');
  results.guest=await page.evaluate(()=>{
   resetWaterTest(2);const city=testTown(0,0,2,'Guest town');gameData.mp={enabled:true,isHost:false,localSlot:2};gameData._mpSyncCityWarKeys=new Set(['0,0']);
   const blocked=isCitySiegeBlockedForProduction(city);gameData._mpSyncCityWarKeys.clear();return{blocked,cleared:!isCitySiegeBlockedForProduction(city)};
  });assert(results.guest.blocked&&results.guest.cleared,'guest production UI honors host siege state');
  results.bridge=await page.evaluate(()=>{
   resetWaterTest(2);testTown(-10,0,2,'AI town');
   for(const h of gameData.hexList)if(h.q===0)h.type='water';
   for(let i=0;i<12;i++){const h=gameData.hexes[`-3,${i-6}`];createUnitAt('light',h.x,h.y,2);}
   const random=Math.random;Math.random=()=>0;
   let built;try{wodAiTryBridgeForOwner(2,'2');for(let i=0;i<300&&!gameData.constructionJobs.some(j=>j.mode==='bridge');i++)wodStepAiBridgeSearches();built=gameData.constructionJobs.some(j=>j.mode==='bridge');}finally{Math.random=random;}
   const job=gameData.constructionJobs.find(j=>j.mode==='bridge'),duplicate=wodAiTryBridgeForOwner(2,'2');
   if(!job)return{built,duplicate,jobs:gameData.constructionJobs,sites:wodAiCollectBridgeCandidateSites(2).slice(0,5).map(s=>({score:wodAiScoreBridgeSite(s,2),error:wodBridgePlacementError(s,2),a:[s.shoreA.q,s.shoreA.r],b:[s.shoreB.q,s.shoreB.r]})),money:wodPlayerTreasury(2),cooldown:gameData._aiBridgeCooldown?.[2]};
   const moving=gameData.entities[1];assignUnitMoveAlongWaypoints(moving,[{x:-8*gameData.hexRadius*1.35,y:moving.y}]);const priorPath=moving.path,priorTarget=moving.target;
   const point={x:job.x,y:job.y};wodUpdateConstruction(59);const early=gameData.bridges.length;wodUpdateConstruction(1);const preserved=moving.path===priorPath&&moving.target===priorTarget&&!!priorTarget;
   const u=gameData.entities[0];u.x=point.x;u.y=point.y;const h=getNearestHexToPoint(u.x,u.y);
   const deck=wodUnitOnBridgeDeck(u),unsupplied=!!wodGetUnitEncirclementState(u,h),sp=gameData.hexRadius*1.35;
   gameData.entities=[u];u.x=-4*sp;u.y=point.y;gameData.unitSpatialGrid=buildUnitSpatialGrid();wodBeginSimPfBudget(1);
   const goal={x:4*sp,y:point.y},assigned=assignUnitMoveAlongWaypoints(u,[goal]);let wetTicks=0;
   for(let i=0;i<1800&&Math.hypot(u.x-goal.x,u.y-goal.y)>4;i++){wodBeginSimPfBudget(1);moveUnitTowardTarget(u,.1);if(wodUnitInUnsuppliedWater(u,getNearestHexToPoint(u.x,u.y)))wetTicks++;}
   return{built,duplicate,early,preserved,ready:gameData.bridges.length,total:job.total,deck,unsupplied,assigned,wetTicks,arrived:Math.hypot(u.x-goal.x,u.y-goal.y)<20};
  });console.log('bridge',JSON.stringify(results.bridge));
  assert(results.bridge.built&&results.bridge.preserved&&!results.bridge.duplicate&&!results.bridge.early&&results.bridge.ready===1&&results.bridge.total===60&&results.bridge.deck&&!results.bridge.unsupplied&&results.bridge.assigned&&results.bridge.arrived&&results.bridge.wetTicks===0);
  await page.evaluate(()=>{for(const h of gameData.hexList){h.baseColor=getTerrainColor(h.type);h.renderColor=h.baseColor;}gameData.fogOfWar=false;UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.style.display='';gameState='PLAYING';gameData.camera.zoom=.75;gameData.camera.x=-canvas.clientWidth/2;gameData.camera.y=-canvas.clientHeight/2;wodMarkTerrainFullDirty();updateTerrainCache();draw();});
  await page.screenshot({path:path.join(OUT,'ai-bridge.png')});
  fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));assert.equal(errors.length,0,errors.join('\n'));
 }finally{fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const s of relay.clients)s.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
