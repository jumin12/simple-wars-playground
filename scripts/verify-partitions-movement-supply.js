const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/partitions-movement-supply');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(ROOT,'.'+(req.url.split('?')[0]==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0])));
 if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(err,body)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ogg':'audio/ogg','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream');res.end(body);});
});
(async()=>{
 const relay=new WebSocketServer({port:8080});relay.on('error',()=>{});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],results={};page.on('pageerror',e=>errors.push(e.stack));
 try{
  await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');
  await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
  await page.evaluate(()=>{
   setGameSpeed(0,true);wodDismissChangelogPopup?.();
   window.fixtureReset=()=>{
    WOD.makeBlankMap(25);gameState='PLAYING';gameData.mp={enabled:false};gameData._campaignRun=null;gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.alliances=[];gameData.aiTaskForces={};gameData._aiDefenseByOwner={};gameData._aiStratWork=null;gameData._aiFormChunk=null;gameData._wodPfCache=new Map();gameData._citySupplyCache=null;gameData._supplyTopologyVersion=0;gameData.encircledHexes=new Set();gameData.encircledReliefHexes=new Set();gameData._encircWork=null;gameData.encirclementTimer=0;gameData._wodPlayerMovingN=0;gameData._wodMovingN=0;gameData._matchReadyForEndChecks=false;gameData._campaignEnded=false;gameData._aiEconomyClock=0;gameData.aiMoneyByOwner={2:0};gameData.aiManpowerByOwner={2:0};gameData.money=100000;gameData.manpower=100000;gameData._waterPoliticsWork=null;gameData._waterPoliticsDirty=false;gameData._territoryCleanupKeys=new Set();gameData._wodClaimBatch=null;gameData.aiStrategyTimer=0;
    for(const h of gameData.hexList){h.owner=1;h.type='grass';h.cityId=null;}
   };
   window.fixtureTown=(q,r,owner,id)=>{const h=gameData.hexes[`${q},${r}`];h.type='urban';h.cityId=id;const c={id,name:id,owner,q,r,x:h.x,y:h.y,hp:1000,maxHp:1000,hasFactory:false,hasHarbor:false};gameData.cities.push(c);return c;};
  });
  results.repeatGeneration=await page.evaluate(async()=>{
   const hashes=[],reports=[],snapshots=[];
   for(let repeat=0;repeat<2;repeat++) {
    fixtureReset();gameData.loadedCustomMap=false;gameData.aiCount=3;
    document.getElementById('setupAI').value='3';document.getElementById('setupMapSize').value='40';document.getElementById('setupMapShape').value='archipelago';
    gameData._mapGenSeed=230314;gameData._wodReuseMapGenSeed=true;gameData._wodSkipMapGenLoader=true;
    gameData._mapGenOptions={cities:true,territory:true,units:true,mapShape:'archipelago'};await generateMap();
    const snapshot={tiles:gameData.hexList.map(h=>[h.q,h.r,h.type,h.owner,h.cityId]),cities:gameData.cities.map(c=>[c.q,c.r,c.owner]),units:gameData.entities.map(u=>[u.type,u.owner,u.x,u.y,u._startDeployment])};snapshots.push(snapshot);hashes.push(JSON.stringify(snapshot));
    reports.push({seed:gameData._mapGenSeed,counts:wodCountBalancedLandByOwner([1,2,3,4]),units:gameData.entities.length,cities:gameData.cities.length});
   }
   gameData.fogOfWar=false;gameData.layers={terrain:true,diplomacy:true,territory:false,cities:true,cityNames:true,structures:true,units:true};
   const extent=Math.max(...gameData.hexList.map(h=>Math.max(Math.abs(h.x),Math.abs(h.y))));gameData.camera.zoom=Math.min(canvas.clientWidth,canvas.clientHeight)/(extent*2.1);gameData.camera.x=-canvas.clientWidth/2;gameData.camera.y=-canvas.clientHeight/2;wodMarkTerrainFullDirty();updateTerrainCache();draw();
   const differences={};for(const key of ['tiles','cities','units'])differences[key]=snapshots[0][key].map((v,i)=>({a:v,b:snapshots[1][key][i]})).filter(v=>JSON.stringify(v.a)!==JSON.stringify(v.b)).slice(0,8);
   return {identical:hashes[0]===hashes[1],reports,differences};
  });
  await page.screenshot({path:path.join(OUT,'balanced-archipelago.png')});
  results.ridge=await page.evaluate(async()=>{
   fixtureReset();for(const h of gameData.hexList){h.owner=h.q<0?1:2;if(h.r===0)h.type='mountain';}
   fixtureTown(-15,-10,1,'West');fixtureTown(15,-10,2,'East');
   const owners=gameData.hexList.map(h=>h.owner),mountains=gameData.hexList.filter(h=>h.type==='mountain').length;
   await wodCarveStartingFactionPasses([1,2]);wodRepairStartingLandSupply([1,2]);
   const supply=wodStartingTownSupply();
   return {changedOwnership:gameData.hexList.filter((h,i)=>h.owner!==owners[i]).length,carved:mountains-gameData.hexList.filter(h=>h.type==='mountain').length,
    unsupplied:gameData.hexList.filter(h=>h.type!=='mountain'&&!supply.get(h.owner)?.has(getHexKey(h))).length};
  });
  results.partitions=await page.evaluate(async()=>{
   const rows=[];
   for(let seed=1;seed<=8;seed++)for(const n of [2,3,4]) {
    fixtureReset();gameData.hexList=gameData.hexList.filter(h=>Math.abs(h.q)<=24&&Math.abs(h.r)<=20);gameData.hexes=Object.fromEntries(gameData.hexList.map(h=>[getHexKey(h),h]));gameData._mapGenSeed=seed*2039;
    // A biome checkerboard must not distort political distance or produce rings.
    for(const h of gameData.hexList)h.type=(h.q+2*h.r+1000)%3===0?'forest':'hill';
    const owners=Array.from({length:n},(_,i)=>i+1),phase=seed*.13;
    const sites=owners.map((owner,i)=>{const a=phase+i*Math.PI*2/n;return fixtureTown(Math.round(Math.cos(a)*15),Math.round(Math.sin(a)*14),owner,'Seed '+owner);});
    await wodEqualizePoliticsBiasedVoronoi(owners,sites,20);
    const seen=new Set(),components={};let edges=0;
    for(const h of gameData.hexList) {
     for(const d of [{q:1,r:0},{q:0,r:1}]){const nb=gameData.hexes[`${h.q+d.q},${h.r+d.r}`];if(nb&&nb.owner!==h.owner)edges++;}
     if(seen.has(getHexKey(h)))continue;const queue=[h];seen.add(getHexKey(h));components[h.owner]=(components[h.owner]||0)+1;
     for(let i=0;i<queue.length;i++)for(const d of cardinalHexDirections){const nb=gameData.hexes[`${queue[i].q+d.q},${queue[i].r+d.r}`];if(nb&&nb.owner===h.owner&&!seen.has(getHexKey(nb))){seen.add(getHexKey(nb));queue.push(nb);}}
    }
    const counts=wodCountBalancedLandByOwner(owners);rows.push({seed,n,counts,components,edges});
   }
   return rows;
  });
  results.routes=await page.evaluate(()=>{
   const rows=[];
   for(const kind of ['open','forest','wall','corner','water']) {
    fixtureReset();for(const h of gameData.hexList){if(kind==='forest'&&h.q<5)h.type='forest';if(kind==='wall'&&h.q===0&&Math.abs(h.r)<7||kind==='corner'&&(h.q===0&&h.r===1||h.q===1&&h.r===0))h.type='mountain';if(kind==='water'&&h.q===0&&Math.abs(h.r)<7)h.type='water';}
    const a=gameData.hexes['-15,-4'],b=gameData.hexes['15,4'],u=createUnitAt('light',a.x,a.y,1,{startSpawn:true});u.x=a.x;u.y=a.y;
    wodBeginSimPfBudget(1);assignUnitMoveAlongWaypoints(u,[{x:b.x,y:b.y}]);const points=[{x:u.x,y:u.y},u.target,...(u.path||[])].filter(Boolean);
    rows.push({kind,points:points.length,length:wodPathWorldLength(points),direct:Math.hypot(b.x-a.x,b.y-a.y),valid:!wodCorridorHasBlockedChord(u,points),endDistance:Math.hypot(points.at(-1).x-b.x,points.at(-1).y-b.y)});
   }
   return rows;
  });
  await page.evaluate(()=>{
   fixtureReset();for(const h of gameData.hexList)if(h.q<0)h.type='forest';
   const a=gameData.hexes['-12,-5'],b=gameData.hexes['12,5'],u=createUnitAt('light',a.x,a.y,1,{startSpawn:true});u.x=a.x;u.y=a.y;wodBeginSimPfBudget(1);assignUnitMoveAlongWaypoints(u,[{x:b.x,y:b.y}]);
   gameData.selection=[u];gameData.fogOfWar=false;gameData.camera.zoom=1.5;gameData.camera.x=-canvas.clientWidth/2;gameData.camera.y=-canvas.clientHeight/2;wodMarkTerrainFullDirty();updateTerrainCache();draw();
  });
  await page.screenshot({path:path.join(OUT,'straight-forest-order.png')});
  results.traffic=await page.evaluate(()=>{
   const rows=[];
   for(const kind of ['stationary','overlap','opposing','ai']) {
    fixtureReset();const units=[],goals=new Map();
    for(let i=0;i<8;i++) {
     const reverse=kind==='opposing'&&i>=4,owner=kind==='ai'?2:1;
     const x=kind==='overlap'?-250:(reverse?250:-250)+(i%4)*9,y=kind==='overlap'?0:(Math.floor(i/4)*2-1)*12;
     const u=createUnitAt(i%3===0?'heavy':'light',x,y,owner,{startSpawn:true});u.uid='traffic-'+kind+'-'+i;u.x=x;u.y=y;
     const goal={x:reverse?-350:350,y:(i%4-1.5)*55};goals.set(u,goal);wodBeginSimPfBudget(8);assignUnitMoveAlongWaypoints(u,[goal]);units.push(u);
    }
    if(kind==='stationary'){const u=createUnitAt('light',0,0,1,{startSpawn:true});u.x=0;u.y=0;}
    let invalid=0,elapsed=0;
    for(let step=0;step<3000;step++) {
     gameData._wodSimTick++;wodBeginSimPfBudget(8);gameData.unitSpatialGrid=buildUnitSpatialGrid(96);wodRebuildHexCombatOccupancy();
     for(const u of units){moveUnitTowardTarget(u,.1);if(!wodSamplePosOnWalkableTerrain(u,u.x,u.y))invalid++;}
     gameData.unitSpatialGrid=buildUnitSpatialGrid(96);wodRunUnitSeparationSync(40,96);elapsed+=.1;
     if(units.every(u=>Math.abs(u.x-goals.get(u).x)<150))break;
    }
    rows.push({kind,elapsed:Math.round(elapsed),invalid,crossed:units.filter(u=>Math.abs(u.x-goals.get(u).x)<150).length,total:units.length});
   }
   return rows;
  });
  results.supply=await page.evaluate(()=>{
   const rows=[];
   for(const owner of [1,2])for(const ground of ['own','hostile']) {
    fixtureReset();const enemy=owner===1?2:1;
    for(const h of gameData.hexList){h.owner=h.q>10?owner:enemy;if(ground==='own'&&Math.abs(h.q)<=2&&Math.abs(h.r)<=2)h.owner=owner;}
    fixtureTown(17,0,owner,'Own supply');fixtureTown(-17,0,enemy,'Hostile supply');
    const h=gameData.hexes['0,0'],u=createUnitAt('light',h.x,h.y,owner,{startSpawn:true});u.x=h.x;u.y=h.y;u.hp=90;
    gameData._wodPlayerMovingN=80;let ticks=0;
    for(;ticks<100;ticks++){gameData._wodSimTick=ticks*2;updateEncirclements(.1);if(!gameData._encircWork&&gameData.encircledHexes.size)break;}
    const state=wodGetUnitEncirclementState(u,h),before=u.hp,old=updateAiStrategy;updateAiStrategy=()=>{};update(.2);updateAiStrategy=old;
    rows.push({owner,ground,ticks,encircled:!!state,damage:before-u.hp,flash:u.encircledFlash,effect:getUnitEffects(u).some(e=>e.label==='Encircled')});
   }
   return rows;
  });
  await page.evaluate(()=>{
   fixtureReset();for(const h of gameData.hexList)h.owner=h.q<0?1:2;
   fixtureTown(-20,0,1,'Player supply');fixtureTown(20,0,2,'Enemy supply');
   for(const owner of [1,2]){const h=gameData.hexes[`${owner===1?5:-5},0`],u=createUnitAt('light',h.x,h.y,owner,{startSpawn:true});u.x=h.x;u.y=h.y;u.hp=90;}
   const old=updateAiStrategy;updateAiStrategy=()=>{};update(.2);updateAiStrategy=old;gameData.encirclementTimer=10;updateEncirclements(.1);let n=0;while(gameData._encircWork&&n++<1000)wodEncirclementProcessChunk();
   gameData.selection=[gameData.entities.find(u=>u.owner===1)];gameData.fogOfWar=false;gameData.camera.zoom=1.7;gameData.camera.x=-canvas.clientWidth/2;gameData.camera.y=-canvas.clientHeight/2;wodMarkTerrainFullDirty();updateTerrainCache();draw();
  });
  await page.screenshot({path:path.join(OUT,'both-factions-encircled.png')});
  results.town=await page.evaluate(()=>{
   fixtureReset();for(const h of gameData.hexList)h.owner=h.q<0?1:2;
   const target=fixtureTown(-9,0,1,'Entire town'),home=fixtureTown(15,0,2,'AI home');
   for(let q=-13;q<=-5;q++)for(let r=-3;r<=3;r++){const h=gameData.hexes[`${q},${r}`];h.cityId=target.id;h.type='urban';}
   delete target._urbanHexCache;
   for(let i=0;i<15;i++){const h=gameData.hexes[`${4+i%3},${-7+Math.floor(i/3)*3}`];createUnitAt(i<2?'heavy':'light',h.x,h.y,2,{startSpawn:true});}
   gameData.unitSpatialGrid=buildUnitSpatialGrid(200);const army=gameData.entities.filter(u=>u.owner===2),plan=wodAiEnsureTaskForcePlan(2,army);
   const assault=plan.jobs.find(j=>j.kind==='armor'),members=army.filter(u=>plan.unitJob[u.uid]===assault.id);
   assault.phase='assault';const assigned=members.map(u=>getHexKey(wodAiTownAssaultHex(u,target,members)));
   let elapsed=0,earlyFlip=false;
   for(let step=0;step<3600&&target.owner!==2;step++) {
    gameData._wodSimTick++;update(.1);elapsed+=.1;
    if(target.owner===2&&!attackerControlsAllCityUrbanTerrain(target,2))earlyFlip=true;
   }
   gameData.fogOfWar=false;gameData.selection=[];gameData.camera.zoom=1;gameData.camera.x=target.x-canvas.clientWidth/2;gameData.camera.y=target.y-canvas.clientHeight/2;wodMarkTerrainFullDirty();updateTerrainCache();draw();
   return {captured:target.owner===2,tiles:getCityUrbanTerrainHexes(target).length,remaining:getCityUrbanTerrainHexes(target).filter(h=>h.owner!==2).length,spread:new Set(assigned).size,members:members.length,elapsed:Math.round(elapsed),earlyFlip};
  });
  await page.screenshot({path:path.join(OUT,'whole-town-capture.png')});
  fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
  assert(results.repeatGeneration.identical&&results.repeatGeneration.reports.every(r=>r.units===28&&r.cities>=8),'unsafe tiny seed retries reproducibly into an even map with complete armies');
  assert(results.ridge.changedOwnership===0&&results.ridge.carved===2&&results.ridge.unsupplied===0,'two narrow mountain passes supply compact regions without distorting the frontier');
  assert(results.partitions.every(r=>Object.values(r.components).every(n=>n===1)&&Math.max(...Object.values(r.counts))-Math.min(...Object.values(r.counts))<=3),'compact even contiguous partitions across 24 seeded biome layouts');
  assert(results.routes.every(r=>r.valid&&r.endDistance<1));assert(results.routes.filter(r=>['open','forest'].includes(r.kind)).every(r=>r.points===2&&r.length<r.direct*1.01),'clear terrain follows a direct route');
  assert(results.traffic.every(r=>r.crossed===r.total&&r.invalid===0),'friendly crowds, overlapping spawns and opposing columns keep moving');
  assert(results.supply.every(r=>r.encircled&&Math.abs(r.damage-.7)<.001&&r.flash>0&&r.effect),'both factions take and display identical attrition on owned or hostile ground under march load');
  assert(results.town.captured&&results.town.tiles===63&&results.town.remaining===0&&results.town.spread===results.town.members&&!results.town.earlyFlip,'AI spreads across and captures the entire multi-cell town');
  assert.equal(errors.length,0,errors.join('\n'));
 }finally{fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const s of relay.clients)s.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
