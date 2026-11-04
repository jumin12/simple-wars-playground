'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{spawn}=require('child_process');
const {chromium}=require('playwright');
const {WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/coastal-group-movement/final');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(ROOT,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.ogg':'audio/ogg','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream');res.end(b);});});
(async()=>{const relay=new WebSocketServer({port:8080,host:'127.0.0.1'});relay.on('error',()=>{});relay.on('connection',s=>s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]})));await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[],results={};
page.on('pageerror',e=>errors.push(e.stack));await context.routeWebSocket(/.*/,s=>{s.onMessage(()=>{});s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]}));});page.setDefaultTimeout(180000);
try{
 const url='http://127.0.0.1:'+server.address().port;await page.goto(url+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks);
 const installFixtures=()=>{
  setGameSpeed(0,true);wodDismissChangelogPopup();cancelAnimationFrame(animationFrameId);
  window.world=(radius=32)=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(radius);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.aiTaskForces={};gameData.aiBattlePlans={};gameData.aiNavalPlans={};gameData._aiDefenseByOwner={};gameData._aiCombatContexts={};gameData._aiEconomyPlans={};gameData.aiCommanderProfiles={2:'balanced'};gameData._aiStratWork=null;gameData._aiMoveQueue=new Map();gameData._wodPlayerMovingN=0;gameData._aiEconomyClock=0;gameData.fogOfWar=false;gameData._factionIntel={};gameData.aiFrontFocus={};gameData._wodPfFrameActive=false;gameData._matchReadyForEndChecks=false;gameData._cityCombatStagingKeys=new Set();gameData.cityCombatBlockForProd=new Set();gameData._transportAiTimer=-1e6;gameData.aiTimer=-1e6;gameData.aiStrategyTimer=-1e6;gameData.convoyTimer=-1e6;gameData.aiMoneyByOwner={2:100000};gameData.aiManpowerByOwner={2:100000};gameData._aiLocalSituation=new WeakMap();for(const h of gameData.hexList){h.type='grass';h.owner=h.q<0?2:1;h.cityId=null;}wodInvalidateAiFrontlineHexCache();};
  window.hex=(q,r=0)=>gameData.hexes[q+','+r];
  window.town=(q,r,owner,id)=>{const h=hex(q,r);h.type='urban';h.owner=owner;h.cityId=id;const c={id,name:id,owner,q,r,x:h.x,y:h.y,hp:1000,maxHp:1000,hasFactory:false,hasHarbor:false};gameData.cities.push(c);return c;};
  window.unit=(q,r=0,type='light',owner=2)=>{const h=hex(q,r),u=createUnitAt(type,h.x,h.y,owner,{startSpawn:true});u.x=h.x;u.y=h.y;u.isGeneral=false;return u;};
  window.refresh=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();gameData._generalAuraCache=null;gameData._aiCombatContexts={};gameData._aiLocalSituation=new WeakMap();wodInvalidateAiFrontlineHexCache();};
  window.step=(seconds)=>{for(let n=0;n<seconds*20;n++){wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();}};
 };await page.evaluate(installFixtures);




 for(const kind of ['click','waypoints','line'].filter(k=>!process.env.COAST_CASE||k===process.env.COAST_CASE)){
  await page.evaluate(kind=>{
   world(28);for(const h of gameData.hexList){h.type=h.q>=0&&h.r>=0?'water':'grass';h.owner=isWaterHex(h)?0:1;}town(-25,0,1,'Home');
   window.coastArmy=Array.from({length:16},(_,i)=>unit(-12-i%4*2,4+Math.floor(i/4)*2,['light','heavy','marine','motorized'][i%4],1));
   refresh();gameData.selection=coastArmy;for(const u of coastArmy)u.selected=true;
   if(kind==='click')issueMoveOrder(hex(8,-2));else if(kind==='line')issueLineFormationOrder({x:-27,y:40},{x:-27,y:100});else wodApplyShiftWaypointPaths(coastArmy,[hex(-1,8),hex(8,-2)]);
   window.coastGoals=new Map(coastArmy.filter(u=>u.orderTarget).map(u=>[u,{...u.orderTarget}]));
   window.coastTotals={elapsed:0,wet:0,overlaps:0,goalChanges:0};
  },kind);
  let row;
  for(let chunk=0;chunk<18;chunk++){
   row=await page.evaluate(()=>{
    for(let i=0;i<400;i++){
     wodPumpPlayerOrderQueue();for(const u of coastArmy)if(!coastGoals.has(u)&&u.orderTarget)coastGoals.set(u,{...u.orderTarget});
     wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;
     try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();coastTotals.elapsed+=.05;
     for(const u of coastArmy){if(isWaterHex(getNearestHexToPoint(u.x,u.y)))coastTotals.wet++;const g=coastGoals.get(u);if(g&&u.orderTarget&&Math.hypot(g.x-u.orderTarget.x,g.y-u.orderTarget.y)>1)coastTotals.goalChanges++;}
     for(let a=0;a<coastArmy.length;a++)for(let b=a+1;b<coastArmy.length;b++)if(Math.hypot(coastArmy[a].x-coastArmy[b].x,coastArmy[a].y-coastArmy[b].y)<coastArmy[a].radius+coastArmy[b].radius-.05)coastTotals.overlaps++;
     if(coastGoals.size===coastArmy.length&&coastArmy.every(u=>!u.target&&!u._trafficYield&&Math.hypot(u.x-coastGoals.get(u).x,u.y-coastGoals.get(u).y)<3))break;
    }
    return{...coastTotals,total:coastArmy.length,arrived:coastArmy.filter(u=>coastGoals.has(u)&&Math.hypot(u.x-coastGoals.get(u).x,u.y-coastGoals.get(u).y)<9).length,
     settled:coastArmy.every(u=>!u.target&&!u._trafficYield),positions:coastArmy.map(u=>({uid:u.uid,type:u.type,x:u.x,y:u.y,goal:coastGoals.get(u),target:u.target,traffic:u._trafficYield&&{idle:u._trafficYield.idle,returning:u._trafficYield.returning,target:u._trafficYield.route?.target}}))};
   });
   console.log(kind,JSON.stringify({t:Math.round(row.elapsed),arrived:row.arrived,total:row.total,wet:row.wet,overlaps:row.overlaps,changed:row.goalChanges}));
   if(row.arrived===row.total&&row.settled)break;
  }
  results[kind]=row;fs.writeFileSync(path.join(OUT,'partial.json'),JSON.stringify({results,errors},null,2));
  await page.evaluate(()=>{UI.panels.forEach(p=>p.classList.add('hidden'));UI.mainMenu.classList.add('hidden');UI.inGameUI.style.display='block';gameData.camera={zoom:1.1,x:-450,y:-300};wodMarkTerrainFullDirty();updateTerrainCache();draw();});
  await page.screenshot({path:path.join(OUT,kind+'.png')});
  assert(row.arrived===row.total&&row.settled&&!row.wet&&!row.overlaps&&!row.goalChanges,kind+' coastal group must reach all fixed slots on land without overlap');
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({results,errors},null,2));
}finally{fs.writeFileSync(path.join(OUT,'partial.json'),JSON.stringify({results,errors},null,2));fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const s of relay.clients)s.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
