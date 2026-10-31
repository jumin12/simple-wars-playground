const http=require('http'),fs=require('fs'),path=require('path'),assert=process.env.WOD_PROBE?()=>{}:require('assert/strict');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/equipment-orders');fs.mkdirSync(OUT,{recursive:true});
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
   setGameSpeed(0,true);wodDismissChangelogPopup();gameData.ownedShopVisuals={...gameData.ownedShopVisuals,map_atlas_hd:true};
   window.resetWaterTest=(owner=1)=>{
    WOD.makeBlankMap(30);gameState='PLAYING';gameData.mp={enabled:false};gameData._campaignRun=null;gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.bridges=[];gameData.constructionJobs=[];gameData._encircWork=null;gameData.encircledHexes=new Set();gameData.encircledReliefHexes=new Set();gameData._cityCombatStagingKeys=new Set();gameData.cityCombatBlockForProd=new Set();gameData._matchReadyForEndChecks=false;gameData._aiSpawnBurst=null;gameData._aiStratWork=null;gameData._aiFormChunk=null;gameData.aiTimer=-1e6;gameData.aiStrategyTimer=-1e6;gameData._aiFortGuardTimer=-1e6;gameData.convoyTimer=-1e6;gameData._wodPfCache=new Map();gameData._wodPfVer=(gameData._wodPfVer||0)+1;gameData.money=1e7;gameData.manpower=1e7;gameData.aiMoneyByOwner={2:1e7};gameData.aiManpowerByOwner={2:1e7};
    gameData._aiBridgeCooldown={};gameData.unitSpatialGrid=buildUnitSpatialGrid();
    for(const h of gameData.hexList){h.type='grass';h.owner=owner;h.cityId=null;}
   };
   window.testTown=(q,r,owner,id)=>{const h=gameData.hexes[`${q},${r}`];h.type='urban';h.cityId=id;const c={id,name:id,owner,q,r,x:h.x,y:h.y,hp:1000,maxHp:1000,hasFactory:true,hasHarbor:true};gameData.cities.push(c);return c;};
  });
  results.equipment=await page.evaluate(()=>{
   const rows=[];for(const era of ['ancient','medieval','napoleonic','modern'])for(const owner of [1,2]){
    resetWaterTest(owner);gameData._matchPeriod=gameData.gamePeriod=era;gameData.ownedUnitSkins={ancient:true,medieval:true,napoleonic:true};gameData.menuAttractMode=false;gameData._lifetimeMatch=null;wodProgress=defaultWodProgress();wodBeginLifetimeMatch();testTown(-8,0,owner,'Supply');
    const motor=createUnitAt('motorized',0,0,owner),mount=createUnitAt('mountaineer',81,0,owner);motor.x=motor.y=0;mount.x=81;mount.y=0;gameData.unitSpatialGrid=buildUnitSpatialGrid();
    const cap=wodMotorizedEquipment(motor).capacity;applyDamage(motor,motor.maxHp*.25,3-owner);applyDamage(mount,mount.maxHp*.25,3-owner);const damaged=wodMotorizedEquipment(motor).count;
    applyDamage(motor,motor.maxHp*.1,0,'water');applyDamage(mount,mount.maxHp*.1,0,'supply');const beforeHeal=wodMotorizedEquipment(motor).count;gameData.hospitals=[{owner,q:0,r:0,x:0,y:0}];updateUnitHealing(motor,1);const healed=wodMotorizedEquipment(motor).count;
    const ledger=JSON.parse(JSON.stringify(wodBattleLedger().byOwner)),r=wodFactionBattleStats(owner,true),saved=wodStripEntityForNet(motor),restored=wodEntityFromNet(saved);
    const current=wodMotorizedEquipment(motor),kind=current.kind;
    rows.push({era,owner,label:wodSpecialistLabel('mountaineer'),gear:current.label,cap,damaged,beforeHeal,healed,current:r.motorizedEquipment,restored:wodMotorizedEquipment(restored).count,
     ownMotorized:ledger[owner].ownMotorizedLosses,ownMountaineer:ledger[owner].ownMountaineerLosses,enemyMountaineer:ledger[3-owner].enemyMountaineerKills,
     ownGear:ledger[owner]['own'+kind+'Losses'],enemyGear:ledger[3-owner]['enemy'+kind+'Kills'],attrition:ledger[owner]['attrition'+current.label+'Lost'],
     personnel:r.motorizedPersonnel,mountaineers:r.mountaineerPersonnel,lifetime:owner===1?wodProgress.lifetime.ownMountaineerLosses:wodProgress.lifetime.enemyMountaineerKills,
     endText:wodRenderFactionStats(true).includes(current.label+' in service')&&wodRenderFactionStats(true).includes(wodSpecialistLabel('mountaineer')+' lost')});
   }return rows;
  });console.log('equipment',JSON.stringify(results.equipment));for(const r of results.equipment){assert(Math.abs(r.damaged-r.cap*.75)<1e-6&&Math.abs(r.beforeHeal-r.cap*.65)<1e-6&&r.healed>r.beforeHeal&&r.current===r.healed&&r.restored===r.healed);assert(Math.abs(r.ownMotorized-350)<1e-6&&Math.abs(r.ownMountaineer-350)<1e-6&&r.enemyMountaineer===250);assert(Math.abs(r.ownGear-r.cap*.35)<1e-6&&Math.abs(r.enemyGear-r.cap*.25)<1e-6&&Math.abs(r.attrition-r.cap*.1)<1e-6&&r.endText);assert(r.lifetime===(r.owner===1?350:250));}
  results.traffic=await page.evaluate(()=>{
   const rows=[];for(const owner of [1,2])for(const mode of ['single','waypoints','override','idle']){
    resetWaterTest(owner);if(owner===2)gameData.mp={enabled:true,isHost:true,localSlot:2,humanSlots:[1,2],factionSlots:[1,2],seatTypes:['human','human','closed','closed']};gameData._aiEconomyClock=0;gameData._transportAiTimer=-1e6;gameData._aiMoveQueue=new Map();testTown(-10,10,owner,'Base');
    const a=createUnitAt('light',-29,0,owner),b=createUnitAt('light',0,0,owner);a.x=-29;a.y=0;b.x=b.y=0;
    wodBeginSimPfBudget(1);assignUnitMoveAlongWaypoints(a,[{x:216,y:0}]);if(mode!=='idle')assignUnitMoveAlongWaypoints(b,mode==='waypoints'?[{x:-162,y:54},{x:-216,y:108}]:[{x:-216,y:0}]);
    gameData.unitSpatialGrid=buildUnitSpatialGrid();const intent=new Map([a,b].map(u=>[u,JSON.stringify({goal:u.orderTarget,points:u.fullMarchWaypoints,cursor:u.marchWpCursor||0})]));wodBeginSimPfBudget(1);const yielded=wodYieldFriendlyTraffic(a),u=[a,b].find(u=>u._trafficYield),initial=u&&JSON.stringify({goal:u.orderTarget,points:u.fullMarchWaypoints,cursor:u.marchWpCursor||0})===intent.get(u),originalGoal=u?.orderTarget&&{...u.orderTarget};let goal=originalGoal;
    let changes=0,arrowChanges=0,seenYield=!!u,physical=0,override=false;const origin=u&&{x:u.x,y:u.y};
    if(mode==='override'&&u){assignUnitMoveAlongWaypoints(u,[{x:0,y:216}]);override=!u._trafficYield&&u.orderTarget.y===216;goal={...u.orderTarget};}
    for(let n=0;n<1800;n++){
     update(.1);if(u&&u._trafficYield){seenYield=true;physical=Math.max(physical,Math.hypot(u.x-origin.x,u.y-origin.y));
      if(mode!=='override'&&JSON.stringify({goal:u.orderTarget,points:u.fullMarchWaypoints,cursor:u.marchWpCursor||0})!==intent.get(u))changes++;
      if(goal){const pts=getUnitPathPoints(u),last=pts?.at(-1);if(!last||Math.hypot(last.x-goal.x,last.y-goal.y)>.1)arrowChanges++;}}
     if(mode==='override'&&u?.orderTarget&&u.orderTarget.y!==216)changes++;
    }
    rows.push({owner,mode,yielded,initial,changes,arrowChanges,seenYield,physical,override,arrived:mode==='override'?Math.hypot(u.x,u.y-216)<35:mode==='idle'?Math.hypot(a.x-216,a.y)<35:Math.hypot(a.x-216,a.y)<35&&Math.hypot(b.x+216,b.y-(mode==='waypoints'?108:0))<35,
     units:[a,b].map(x=>({x:x.x,y:x.y,target:x.target,goal:x.orderTarget,yield:!!x._trafficYield}))});
   }return rows;
  });console.log('traffic',JSON.stringify(results.traffic));assert(results.traffic.every(r=>r.yielded&&r.initial&&!r.changes&&!r.arrowChanges&&r.arrived&&(r.mode!=='override'||r.override)));
  results.supplyYield=await page.evaluate(()=>{const rows=[];for(const owner of [1,2]){resetWaterTest(owner);gameData._aiEconomyClock=0;for(const h of gameData.hexList){h.type=h.q<=12?'water':'grass';h.owner=isWaterHex(h)?0:owner;}const ship=createUnitAt('supply',320,-32,owner);ship.x=320;ship.y=-32;assignUnitMoveAlongWaypoints(ship,[{x:324,y:54}]);const intent=JSON.stringify({goal:ship.orderTarget,points:ship.fullMarchWaypoints});const record={points:[{x:324,y:54}],idle:false,internal:true,owner,leader:'passed',x:270,y:-54,ax:1,ay:0,until:25};const planned=wodPlanTrafficDetour(ship,[{x:270,y:-54}],record);const landed=createUnitAt('heavy',385,0,owner);landed.x=385;landed.y=0;landed._navalLanded=true;const safe=wodSupplyParkingSafe(ship,ship),unsafe=!wodSupplyParkingSafe(ship,(record.route?.orderTarget||ship.orderTarget));wodResumeTrafficYield(ship);rows.push({owner,planned,safe,unsafe,canceled:!ship._trafficYield,command:owner===1?JSON.stringify({goal:ship.orderTarget,points:ship.fullMarchWaypoints})===intent:ship.target===null});}return rows;});assert(results.supplyYield.every(r=>r.planned&&r.safe&&r.unsafe&&r.canceled&&r.command));
  results.guest=await page.evaluate(()=>{resetWaterTest();gameData.menuAttractMode=false;gameData._lifetimeMatch=null;gameData.mp={enabled:true,isHost:true,localSlot:3,humanSlots:[1,3],factionSlots:[1,2,3],seatTypes:['human','bot','human','closed']};wodProgress=defaultWodProgress();wodBeginLifetimeMatch();const u=createUnitAt('motorized',0,0,2),m=createUnitAt('mountaineer',54,0,2);applyDamage(u,90,3);applyDamage(m,42.5,3);const totals=JSON.parse(JSON.stringify(gameData._lifetimeStatsByOwner));wodSyncLocalMatchLifetime();wodSyncLocalMatchLifetime();return{truck:wodProgress.lifetime.enemyTruckKills,mountain:wodProgress.lifetime.enemyMountaineerKills,generic:wodProgress.lifetime.enemyTroopKills,totals};});assert(results.guest.truck===50&&results.guest.mountain===500&&results.guest.generic===1000);
  await page.evaluate(()=>{
   resetWaterTest();gameData.mp={enabled:false};gameData.menuAttractMode=false;gameData._matchPeriod=gameData.gamePeriod='ancient';gameData.ownedUnitSkins={ancient:true,medieval:true,napoleonic:true};const city=testTown(-8,0,1,'Base');const u=createUnitAt('motorized',0,0,1),m=createUnitAt('mountaineer',81,0,1);applyDamage(u,45,2);applyDamage(m,21.25,2);document.querySelectorAll('.wod-toast-note').forEach(n=>n.remove());UI.inGameUI.style.display='flex';UI.statsMenu.classList.remove('hidden');wodShowStatsPage('forces');wodRefreshBattleStats();
  });await page.screenshot({path:path.join(OUT,'ancient-forces.png')});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(OUT,'ancient-forces-mobile.png')});
  await page.evaluate(()=>{gameData._matchPeriod=gameData.gamePeriod='modern';wodRenumberOwnerUnits(1);wodRefreshBattleStats();});await page.screenshot({path:path.join(OUT,'modern-forces-mobile.png')});
  await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>{UI.statsMenu.classList.add('hidden');const u=gameData.entities.find(u=>u.type==='motorized');gameData.selection=[u];u.selected=true;gameData.camera={zoom:1,x:-500,y:-200};syncInfoCardPanel();draw();});await page.screenshot({path:path.join(OUT,'motorized-card.png')});
  await page.evaluate(()=>{resetWaterTest();gameData._matchPeriod=gameData.gamePeriod='modern';const a=createUnitAt('light',-29,0,1),b=createUnitAt('motorized',0,0,1);a.x=-29;a.y=0;b.x=b.y=0;gameData.selection=[a,b];a.selected=b.selected=true;assignUnitMoveAlongWaypoints(a,[{x:216,y:0}]);assignUnitMoveAlongWaypoints(b,[{x:-162,y:54},{x:-216,y:108}]);gameData.unitSpatialGrid=buildUnitSpatialGrid();wodBeginSimPfBudget(1);wodYieldFriendlyTraffic(a);gameData.camera={zoom:1.5,x:-650,y:-240};syncInfoCardPanel();draw();});await page.screenshot({path:path.join(OUT,'crowded-waypoint-arrows.png')});
  results.lifetimeLabels=await page.evaluate(()=>{const rows=[];for(const era of ['ancient','medieval','napoleonic','modern']){_achStatsPeriodFilter=era;renderAchievementsUi();const text=document.getElementById('achTabStatsBody').textContent;rows.push({era,name:text.includes(wodSpecialistLabel('mountaineer',era)+' lost'),gear:text.includes(era==='modern'?'Trucks lost':'Horses lost'),trained:text.includes(wodSpecialistLabel('motorized',era)+' trained')});}return rows;});assert(results.lifetimeLabels.every(r=>r.name&&r.gear&&r.trained));
  assert(!errors.length,errors.join('\n'));fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));
 }finally{fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const c of relay.clients)c.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
