const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/city-supply');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(ROOT,'.'+(req.url.split('?')[0]==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0])));
 if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(err,body)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ogg':'audio/ogg','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream');res.end(body);});
});
(async()=>{
 const relay=new WebSocketServer({port:8080});relay.on('error',()=>{});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack));
 try{
  await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');
  await page.waitForFunction(()=>window.__wodDebug?.().gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
  await page.evaluate(()=>{setGameSpeed(0,true);wodDismissChangelogPopup?.();});
  const results=await page.evaluate(()=>{
   const reset=()=>{
    WOD.makeBlankMap(25);gameState='PLAYING';gameData.mp={enabled:false};gameData._campaignRun=null;gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.bridges=[];gameData.constructionJobs=[];
    gameData.alliances=[];gameData._citySupplyCache=null;gameData._supplyTopologyVersion=0;gameData.aiTaskForces={};gameData._aiDefenseByOwner={};gameData._aiStratWork=null;gameData._aiFormChunk=null;
    gameData.encircledHexes=new Set();gameData.encircledReliefHexes=new Set();gameData.marineWaterSupplyHexes=new Set();gameData._encircWork=null;
    gameData.money=100000;gameData.manpower=100000;gameData.aiMoneyByOwner={2:0,3:0};gameData.aiManpowerByOwner={2:100000,3:100000};gameData._matchReadyForEndChecks=false;
    gameData.cityCombatBlockForProd=new Set();gameData._cityCombatStagingKeys=new Set();
    for(const h of gameData.hexList){h.owner=2;h.type='grass';h.cityId=null;}
   };
   const hex=(q,r)=>gameData.hexes[`${q},${r}`];
   const city=(q,r,owner,id)=>{const h=hex(q,r);h.type='urban';h.owner=owner;h.cityId=id;const c={id,name:id,owner,q,r,x:h.x,y:h.y,hp:1000,maxHp:1000,hasFactory:false,hasHarbor:false,hasFarm:false};gameData.cities.push(c);return c;};
   const spawn=(q,r,type='light',owner=1)=>createUnitAt(type,hex(q,r).x,hex(q,r).y,owner,{startSpawn:true});
   const scan=()=>{gameData._encircWork=null;gameData.encirclementTimer=100;gameData._wodPlayerMovingN=0;updateEncirclements(2);let n=0;while(gameData._encircWork&&n++<2000)wodEncirclementProcessChunk();if(gameData._encircWork)throw Error('supply scan did not finish');};
   const out=u=>!!wodGetUnitEncirclementState(u,getNearestHexToPoint(u.x,u.y));
   reset();city(-12,0,1,'Original home');const captured=city(4,0,2,'Captured town');city(16,-12,2,'Enemy home');
   for(let q=0;q<=8;q++)for(let r=-5;r<=5;r++)if(hex(q,r).cityId!==captured.id)hex(q,r).owner=1;
   const foot=spawn(1,4),armor=spawn(2,4,'heavy'),marine=spawn(3,4,'marine');gameData.unitSpatialGrid=buildUnitSpatialGrid(200);
   scan();const before={infantry:out(foot),armor:out(armor),marine:out(marine)};
   const oldKeys=new Set(gameData.encircledHexes);wodExecuteCityCapture(captured,1);
   // Simulate an unfinished incremental scan still reporting the pre-capture pocket.
   gameData.encircledHexes=new Set(oldKeys);gameData._encircWork={idx:gameData.hexList.length,visited:new Set(),encircledHexes:new Set(oldKeys),encircledReliefHexes:new Set(),marineWaterSupplyHexes:new Set()};
   const immediate={infantry:out(foot),armor:out(armor),marine:out(marine),cityBlocked:isCityEncircledForProduction(captured),owner:captured.owner};
   for(const u of [foot,armor,marine]){u.hp=u.maxHp*.7;u.manpower=Math.round(u.maxManpower*.7);}
   gameData.unitSpatialGrid=buildUnitSpatialGrid(200);const hp=foot.hp,canHeal=canHealUnit(foot);update(.25);
   const afterTick={hp:foot.hp,before:hp,canHeal,infantry:out(foot),armor:out(armor),marine:out(marine)};
   // The city becomes hostile again: the original city across enemy land cannot supply this pocket.
   wodExecuteCityCapture(captured,2);scan();const lostCity={infantry:out(foot),armor:out(armor),marine:out(marine)};
   wodExecuteCityCapture(captured,3);gameData.alliances=[[1,3]];
   const allied={infantry:out(foot),armor:out(armor),marine:out(marine)};
   gameData.alliances=[];const allianceEnded=out(foot);
   gameData.mp={enabled:true,isHost:false,localSlot:1};
   wodMpApplySnapPayload({cities:[{q:captured.q,r:captured.r,owner:1,hp:1000}],hexOwners:gameData.hexList.map(h=>h.owner===3?1:h.owner),encircledKeys:[...oldKeys],encircledReliefKeys:[],marineWaterSupplyKeys:[]});
   const guestSupplied=!out(foot)&&!out(armor)&&!isCityEncircledForProduction(captured);
   reset();city(-8,0,1,'Connected town');city(15,12,2,'Enemy');
   for(const h of gameData.hexList)if(h.q<=0||h.q>=5&&h.q<=8&&Math.abs(h.r)<=3)h.owner=1;
   const runner=spawn(6,0);scan();const disconnected=out(runner);
   for(let q=1;q<=4;q++)setHexOwner(hex(q,0),1);
   const reconnected=out(runner);setHexOwner(hex(2,0),2);const cutAgain=out(runner);
   reset();city(0,0,1,'Diagonal town');city(-12,-12,2,'Enemy');hex(1,1).owner=1;hex(2,2).owner=1;
   const diagonal=spawn(2,2);scan();const diagonalCut=out(diagonal);
   hex(3,2).owner=0;scan();const neutralEdge=out(diagonal);
   const maxQ=Math.max(...gameData.hexList.filter(h=>h.r===0).map(h=>h.q));const edgeHex=hex(maxQ,0);edgeHex.owner=1;const edgeInf=spawn(maxQ,0),edgeMarine=spawn(maxQ,0,'marine');
   scan();const mapEdge=out(edgeInf);hex(maxQ-1,0).type='water';scan();const coast={infantry:out(edgeInf),marine:out(edgeMarine)};
   hex(maxQ-1,0).type='grass';scan();const waterLost=out(edgeMarine);
   // Show the city-supplied island after a real capture for visual inspection.
   reset();city(-12,0,1,'Original home');const islandTown=city(4,0,2,'Captured supply town');city(16,-12,2,'Enemy home');
   for(let q=0;q<=8;q++)for(let r=-5;r<=5;r++)if(hex(q,r).cityId!==islandTown.id)hex(q,r).owner=1;
   const troops=[spawn(1,4),spawn(2,4,'heavy'),spawn(3,4,'marine')];scan();wodExecuteCityCapture(islandTown,1);
   gameData.unitSpatialGrid=buildUnitSpatialGrid(200);gameData.selection=troops;gameData.fogOfWar=false;gameData.layers.territory=true;
   const editor=document.getElementById('mapEditorApp');if(editor)editor.style.display='none';UI.panels.forEach(p=>p.classList.add('hidden'));UI.mainMenu.classList.add('hidden');UI.inGameUI.classList.remove('hidden');canvas.style.display='block';WOD.setEditorSuppressTerrainBake(false);wodSyncViewportAndCanvas();
   const extent=Math.max(...gameData.hexList.map(h=>Math.max(Math.abs(h.x),Math.abs(h.y))));gameData.camera.zoom=Math.min(canvas.clientWidth,canvas.clientHeight)/(extent*2.1);gameData.camera.x=-canvas.clientWidth/2;gameData.camera.y=-canvas.clientHeight/2;
   wodMarkTerrainFullDirty();updateTerrainCache();draw();
   return {before,immediate,afterTick,lostCity,allied,allianceEnded,guestSupplied,disconnected,reconnected,cutAgain,diagonalCut,neutralEdge,mapEdge,coast,waterLost};
  });
  fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));await page.screenshot({path:path.join(OUT,'captured-city-supply.png')});
  assert(Object.values(results.before).every(Boolean),'townless pocket starts out of supply');
  assert(results.immediate.owner===1&&!results.immediate.infantry&&!results.immediate.armor&&!results.immediate.marine&&!results.immediate.cityBlocked,'captured city instantly supplies its pocket despite old and pending flags');
  assert(results.afterTick.canHeal&&results.afterTick.hp>results.afterTick.before&&!results.afterTick.infantry&&!results.afterTick.armor&&!results.afterTick.marine,'city-connected pocket has no attrition and can heal when safe');
  assert(Object.values(results.lostCity).every(Boolean),'losing the only connected city removes supply');
  assert(Object.values(results.allied).every(v=>!v)&&results.allianceEnded,'friendly allied cities supply the pocket until alliance ends');
  assert(results.guestSupplied,'multiplayer guests ignore stale encirclement flags after the host reports town capture');
  assert(results.disconnected&&!results.reconnected&&results.cutAgain,'opening or cutting a land corridor updates supply immediately');
  assert(results.diagonalCut&&results.neutralEdge&&results.mapEdge,'diagonals, neutral borders and map edges cannot replace a city route');
  assert(results.coast.infantry&&!results.coast.marine&&results.waterLost,'only marines retain ocean/river supply and lose it when cut off from water');
  assert.equal(errors.length,0,errors.join('\n'));console.log(JSON.stringify(results,null,2));
 }finally{fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const s of relay.clients)s.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
