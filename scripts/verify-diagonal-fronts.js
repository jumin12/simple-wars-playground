'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {spawn}=require('child_process'),{chromium}=require('playwright');
const {WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/diagonal-fronts');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{const f=path.resolve(ROOT,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(ROOT+path.sep))return res.writeHead(403).end();fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[path.extname(f)]||'application/octet-stream');res.end(b);});});
(async()=>{
 const relay=new WebSocketServer({port:8080});relay.on('error',()=>{});relay.on('connection',s=>s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]})));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[],results={};
 await context.routeWebSocket(/.*/,s=>{s.onMessage(()=>{});s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]}));});page.on('pageerror',e=>errors.push(e.stack));page.setDefaultTimeout(180000);
 try{
  await page.goto(url+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks);
  await page.evaluate(()=>{
   setGameSpeed(0,true);wodDismissChangelogPopup();cancelAnimationFrame(animationFrameId);
   window.cornerWorld=(owner=2)=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(24);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.alliances=[];gameData._citySupplyCache=null;gameData._aiEconomyClock=0;gameData.aiTimer=gameData.aiStrategyTimer=gameData.convoyTimer=gameData._transportAiTimer=-1e6;gameData.money=gameData.manpower=100000;gameData.aiMoneyByOwner={2:100000};gameData.aiManpowerByOwner={2:100000};gameData.encircledHexes=new Set();gameData.encircledReliefHexes=new Set();gameData._encircWork=null;gameData._territoryCleanupKeys=new Set();for(const h of gameData.hexList){h.type='grass';h.owner=owner===1?2:1;h.cityId=null;}};
   window.cornerHex=(q,r)=>gameData.hexes[q+','+r];
   window.cornerTown=(q,r,owner)=>{const h=cornerHex(q,r);h.type='urban';h.owner=owner;h.cityId='Home';gameData.cities.push({id:'Home',name:'Home',q,r,x:h.x,y:h.y,owner,hp:1000,maxHp:1000});};
   window.cornerUnit=(q,r,owner,type='heavy')=>{const h=cornerHex(q,r),u=createUnitAt(type,h.x,h.y,owner,{startSpawn:true});u.x=u._drawX=h.x;u.y=u._drawY=h.y;u.holding=true;u.isGeneral=type==='heavy';return u;};
   window.cornerScan=()=>{gameData._encircWork=null;gameData.encirclementTimer=100;updateEncirclements(2);let n=0;while(gameData._encircWork&&n++<1000)wodEncirclementProcessChunk();if(gameData._encircWork)throw Error('scan unfinished');};
   window.cornerSteps=seconds=>{for(let i=0;i<Math.round(seconds*100);i++){wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.01);}finally{gameData._wodPfFrameActive=false;}}};
  });
  results.generals=[];
  for(const owner of [1,2])for(const sx of [-1,1])for(const sy of [-1,1]){
   const row=await page.evaluate(({owner,sx,sy})=>{
    cornerWorld(owner);cornerTown(6*sx,6*sy,owner);
    for(let i=1;i<=6;i++){cornerHex(i*sx,i*sy).owner=owner;if(i<6)cornerHex((i+1)*sx,i*sy).owner=owner;}
    cornerHex(0,0).owner=owner;const u=cornerUnit(0,0,owner);gameData.unitSpatialGrid=buildUnitSpatialGrid();
    const isolated=!!wodGetUnitEncirclementState(u,cornerHex(0,0));cornerScan();
    const flagged=wodHexKeyIsEncircled('0,0'),defense=wodAiReadDefense(owner,[u],true),hp=u.hp;
    cornerSteps(1.9);const noEarlyWarning=!wodUnitSupplyWarningState(u,cornerHex(0,0));cornerSteps(9.9);const gracePreserved=u.hp===hp;
    cornerSteps(1.3);const damage=hp-u.hp,warning=!!wodUnitSupplyWarningState(u,cornerHex(0,0));
    setHexOwner(cornerHex(sx,0),owner);cornerSteps(.1);const reconnected=!wodGetUnitEncirclementState(u,cornerHex(0,0))&&u.outOfSupplySeconds===0;
    setHexOwner(cornerHex(sx,0),owner===1?2:1);const before=u.hp;cornerSteps(1);const recutGrace=u.hp===before&&!wodUnitSupplyWarningState(u,cornerHex(0,0));
    return{owner,sx,sy,isolated,flagged,pockets:defense.pockets.length,noEarlyWarning,gracePreserved,damage,warning,reconnected,recutGrace};
   },{owner,sx,sy});assert(row.isolated&&row.flagged&&row.pockets>0&&row.noEarlyWarning&&row.gracePreserved&&row.damage>0&&row.warning&&row.reconnected&&row.recutGrace,JSON.stringify(row));results.generals.push(row);
  }
  results.townFootprint=await page.evaluate(()=>{
   cornerWorld(2);cornerTown(0,0,2);const h=cornerHex(1,1);h.type='urban';h.cityId='Home';h.owner=2;cornerUnit(1,1,2,'light');
   const pointOnly=!wodCurrentSupplyComponent(h,2).city;cornerScan();const pointFlagged=wodHexKeyIsEncircled('1,1');
   const side=cornerHex(1,0);side.type='urban';side.cityId='Home';delete gameData.cities[0]._urbanHexCache;setHexOwner(side,2);const realRoute=wodCurrentSupplyComponent(h,2).city;
   setHexOwner(cornerHex(0,0),1);const contestedCenter=wodCurrentSupplyComponent(h,2).city;
   return{pointOnly,pointFlagged,realRoute,contestedCenter};
  });assert(Object.values(results.townFootprint).every(Boolean),JSON.stringify(results.townFootprint));
  results.cleanup=await page.evaluate(()=>{
   cornerWorld(2);for(let q=0;q<=3;q++)for(let r=0;r<=3;r++)cornerHex(q,r).owner=2;
   cornerHex(-1,-1).owner=2;const general=cornerUnit(0,0,2),before=cornerHex(0,0).owner;wodQueueTerritoryRemnantCheck(cornerHex(-1,-1));wodCleanupTinyTerritoryPockets(100);
   const emptyTipRemoved=cornerHex(-1,-1).owner===1,occupiedPreserved=cornerHex(0,0).owner===before&&gameData.entities.includes(general);
   // A thin real corridor remains intact; hospitals and works are protected.
   for(let q=-8;q<=-2;q++)cornerHex(q,8).owner=2;cornerTown(-8,8,2);const u=cornerUnit(-2,8,2,'light');
   const hospital=cornerHex(-1,7);hospital.owner=2;gameData.hospitals.push({q:-1,r:7,owner:2,x:hospital.x,y:hospital.y});
   for(const h of gameData.hexList)wodQueueTerritoryRemnantCheck(h);for(let i=0;i<60&&gameData._territoryCleanupKeys.size;i++)wodCleanupTinyTerritoryPockets(1000);
   return{emptyTipRemoved,occupiedPreserved,corridorIntact:wodCurrentSupplyComponent(cornerHex(-2,8),2).city,hospitalPreserved:hospital.owner===2};
  });assert(Object.values(results.cleanup).every(Boolean),JSON.stringify(results.cleanup));
  results.alliedCorridor=await page.evaluate(()=>{
   cornerWorld(1);gameData.alliances=[[1,3]];cornerTown(0,-6,3);
   for(let r=-5;r<0;r++)cornerHex(0,r).owner=3;cornerHex(-1,0).owner=3;cornerHex(0,0).owner=cornerHex(1,1).owner=1;
   const protectedKeys=new Set(['1,0','0,1','1,1']);wodCleanupTerritoryCorner(cornerHex(0,0),protectedKeys);
   return cornerHex(0,0).owner===1&&wodCurrentSupplyComponent(cornerHex(-1,0),1).city;
  });assert(results.alliedCorridor,'rounding must preserve a corridor between allied regions');
  results.borders=await page.evaluate(()=>{
   cornerWorld(2);for(const h of gameData.hexList)h.owner=1;
   // Two real defended pockets touch only at a corner. Both need a complete ring.
   for(let q=0;q<=3;q++)for(let r=0;r<=3;r++)cornerHex(q,r).owner=2;
   for(let q=-4;q<=-1;q++)for(let r=-4;r<=-1;r++)cornerHex(q,r).owner=2;cornerUnit(2,2,2);cornerUnit(-3,-3,2,'light');
   const sp=gameData.hexRadius*1.35,chains=wodCollectDiplomacyBorderChains(gameData.hexList,gameData.hexes,0,0,sp);
   const edgeKey=(a,b)=>[`${Math.round(a.x/sp*2)},${Math.round(a.y/sp*2)}`,`${Math.round(b.x/sp*2)},${Math.round(b.y/sp*2)}`].sort().join('|'),expected=new Set(),got=new Map();
   for(const h of gameData.hexList)for(const d of [{q:1,r:0},{q:0,r:1}]){const n=cornerHex(h.q+d.q,h.r+d.r);if(!n||h.owner===n.owner)continue;const x=(h.x+n.x)/2,y=(h.y+n.y)/2;expected.add(edgeKey({x:x-d.r*sp/2,y:y-d.q*sp/2},{x:x+d.r*sp/2,y:y+d.q*sp/2}));}
   for(const ch of chains)for(let i=0;i<ch.pts.length-(ch.closed?0:1);i++){const k=edgeKey(ch.pts[i],ch.pts[(i+1)%ch.pts.length]);got.set(k,(got.get(k)||0)+1);}
   const painted=document.createElement('canvas');painted.width=painted.height=512;const ctx=painted.getContext('2d');
   for(const h of gameData.hexList){ctx.fillStyle=factionColors[h.owner];wodFillCellSquare(ctx,h,256,256,sp);}wodRoundPoliticalCorners(ctx,256,256);
   const pixel=[...ctx.getImageData(Math.round(256-sp/2+1),Math.round(256-sp/2+1),1,1).data];ctx.fillStyle=factionColors[1];ctx.fillRect(0,0,1,1);const expectedColor=[...ctx.getImageData(0,0,1,1).data];
   return{chains:chains.length,closed:chains.filter(c=>c.closed).length,expected:expected.size,drawn:got.size,missing:[...expected].filter(k=>!got.has(k)).length,duplicates:[...got.values()].filter(v=>v!==1).length,roundedFill:JSON.stringify(pixel)===JSON.stringify(expectedColor)};
  });assert(results.borders.closed===2&&results.borders.chains===2&&!results.borders.missing&&!results.borders.duplicates&&results.borders.roundedFill&&results.borders.expected===results.borders.drawn,JSON.stringify(results.borders));
  for(const skin of ['default','atlas_hd','chalkboard','whiteboard']){
   await page.evaluate(skin=>{
    for(const h of gameData.hexList)h.type=h.q<0&&h.r<0||h.q>=0&&h.r>=0?'mountain':'grass';
    cornerTown(12,12,1);gameData._artPreviewMapId=skin;gameData.layers={terrain:true,diplomacy:true,territory:true,cities:true,cityNames:true,structures:true,units:true};
    UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.style.display='block';UI.inGameUI.classList.remove('hidden');canvas.style.display='block';gameData.camera={zoom:2.1,x:-canvas.clientWidth/2,y:-canvas.clientHeight/2};gameData.unitSpatialGrid=buildUnitSpatialGrid();wodMarkTerrainFullDirty();updateTerrainCache();while(wodTerrainPolWork)wodStepTerrainPoliticalBake(100);draw();
   },skin);await page.screenshot({path:path.join(OUT,skin+'-diagonal-front.png')});
  }
  results.terrainRepair=await page.evaluate(async()=>{
   cornerWorld();for(const h of gameData.hexList)h.type='grass';for(let q=-5;q<=5;q++)for(let r=-5;r<=5;r++)cornerHex(q,r).type=(q+r)%2?'mountain':'forest';
   const before=gameData.hexList.map(h=>h.owner),repair=await wodResolveGeneratedTerrainCorners();let checkerboards=0;
   for(const h of gameData.hexList){const a=cornerHex(h.q+1,h.r),b=cornerHex(h.q,h.r+1),c=cornerHex(h.q+1,h.r+1);if(a&&b&&c&&h.type===c.type&&a.type===b.type&&h.type!==a.type)checkerboards++;}
   return{...repair,checkerboards,ownersUnchanged:before.every((o,i)=>o===gameData.hexList[i].owner)};
  });assert(results.terrainRepair.ok&&results.terrainRepair.changed>0&&!results.terrainRepair.checkerboards&&results.terrainRepair.ownersUnchanged,JSON.stringify(results.terrainRepair));
  assert.deepEqual(errors,[]);
  if(process.env.RUN_SKILL_CLIENT==='1'){
   if(fs.existsSync(path.join(OUT,'skill/errors-0.json')))fs.unlinkSync(path.join(OUT,'skill/errors-0.json'));
   const client=path.join(OUT,'skill-client.mjs');fs.copyFileSync(path.join(process.env.USERPROFILE,'.codex/skills/develop-web-game/scripts/web_game_playwright_client.js'),client);
   await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[client,'--url',url+'/?autostart=1','--actions-json',JSON.stringify({steps:[{buttons:[],frames:60},{buttons:['a'],frames:12},{buttons:[],frames:15}]}),'--iterations','1','--pause-ms','1000','--screenshot-dir',path.join(OUT,'skill')],{windowsHide:true,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code?reject(Error('skill client exit '+code)):resolve());});
   assert(!fs.existsSync(path.join(OUT,'skill/errors-0.json')),'bundled client has no console/page errors');
  }
  console.log(JSON.stringify(results,null,2));
 }finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors));await browser.close();server.close();for(const s of relay.clients)s.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
