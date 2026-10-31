const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/naval-operations');fs.mkdirSync(OUT,{recursive:true});
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
    gameData._aiBridgeCooldown={};
    for(const h of gameData.hexList){h.type='grass';h.owner=owner;h.cityId=null;}
   };
   window.testTown=(q,r,owner,id)=>{const h=gameData.hexes[`${q},${r}`];h.type='urban';h.cityId=id;const c={id,name:id,owner,q,r,x:h.x,y:h.y,hp:1000,maxHp:1000,hasFactory:true,hasHarbor:true};gameData.cities.push(c);return c;};
  });

  results.coastClick=await page.evaluate(()=>{
   resetWaterTest();gameData._transportAiTimer=-1e6;
   for(const h of gameData.hexList){h.type=h.q>=5&&h.q<=25&&Math.abs(h.r)<=4?'grass':'water';h.owner=isWaterHex(h)?0:2;}
   const cargo=createUnitAt('heavy',270,0,1),t=createUnitAt('transport',0,-162,1);cargo.x=270;cargo.y=0;t.x=0;t.y=-162;t.cargo=cargo;gameData.entities=gameData.entities.filter(u=>u!==cargo);gameData.selection=[t];t.selected=true;
   const goal=gameData.hexes['24,4'];issueMoveOrder({x:goal.x,y:goal.y});const land=gameData.hexes[t.unloadHexKey];
   const planned={x:land?.x,y:land?.y,distance:land?Math.hypot(land.x-goal.x,land.y-goal.y):Infinity};
   let landed=false,invalid=0;for(let n=0;n<2500;n++){update(.1);if(!wodIsOpenWaterHex(getNearestHexToPoint(t.x,t.y)))invalid++;if(gameData.entities.includes(cargo)){landed=true;break;}}
   return {planned,landed,invalid,position:{x:cargo.x,y:cargo.y},goal:{x:goal.x,y:goal.y}};
  });console.log('coastClick',JSON.stringify(results.coastClick));

  results.liveAi=await page.evaluate(()=>{
   resetWaterTest(2);WOD.makeBlankMap(45);gameState='PLAYING';gameData.entities=[];gameData.cities=[];gameData.bridges=[];gameData.forts=[];gameData.constructionJobs=[];gameData._matchReadyForEndChecks=false;gameData._aiEconomyClock=0;gameData._transportAiTimer=0;gameData.aiStrategyTimer=99;gameData.aiTaskForces={};gameData._aiDefenseByOwner={};gameData._aiMoveQueue=new Map();gameData.fogOfWar=false;gameData._wodPfCache=new Map();gameData._wodPfVer++;
   for(const h of gameData.hexList){const home=Math.hypot(h.q+20,h.r)<8,island=Math.hypot(h.q-20,h.r)<7;h.type=home||island?'grass':'water';h.owner=isWaterHex(h)?0:home?2:1;h.cityId=null;}
   const home=testTown(-20,0,2,'Home');const forces=[];for(const [type,q,r]of [['light',-20,0],['light',-20,3],['light',-20,-3],['light',-23,0],['light',-23,3],['heavy',-23,-3],['heavy',-17,0]]){const u=createUnitAt(type,q*27,r*27,2);u.x=q*27;u.y=r*27;forces.push(u);}
   const fleet=[];for(const [type,q,r]of [['transport',-11,-4],['transport',-11,4],['supply',-10,0],['ship',-10,-8]]){const u=createUnitAt(type,q*27,r*27,2);u.x=q*27;u.y=r*27;fleet.push(u);}
   const loaded=new Set(),landed=new Set(),support={ticks:0,safe:0,events:[]},events=[];let invalid=0;
   for(let n=0;n<6000;n++){update(.1);for(const t of fleet)if(t.cargo)loaded.add(t.cargo.uid);for(const u of forces)if(u.hp>0&&gameData.entities.includes(u)&&u.x>13*27){if(!landed.has(u.uid)){landed.add(u.uid);events.push({time:n/10,unit:u.type});}if(u._navalLanded){support.ticks++;if(!wodGetUnitEncirclementState(u,getNearestHexToPoint(u.x,u.y)))support.safe++;else if(!u._testUnsupplied){u._testUnsupplied=true;support.events.push({at:n/10,type:u.type,x:u.x,y:u.y,goal:u.orderTarget,yield:u._trafficYield,hold:u.holding,retreat:u.retreating,supply:fleet.filter(t=>t.type==='supply').map(t=>({x:t.x,y:t.y,target:t.target,goal:t.orderTarget,yield:t._trafficYield})),path:u.path});}}}for(const t of fleet)if(t.hp>0&&!wodIsOpenWaterHex(getNearestHexToPoint(t.x,t.y)))invalid++;}
   gameData.camera={zoom:.7,x:-650,y:-390};gameData.layers.units=true;wodMarkTerrainFullDirty();draw();
   return{mission:(()=>{const p=gameData.aiNavalPlans?.[2];return p&&{phase:p.phase,reason:p.reason,canSail:p.canSail,at:p.at,goal:p.goal};})(),loaded:loaded.size,landed:landed.size,events,support,invalid,army:forces.map(u=>({type:u.type,hp:u.hp,x:u.x,y:u.y,job:u.aiTfKind,attrition:u.attritionHpLost||0,board:u.boardTransportUid,needs:u._needsTransport,goal:u.orderTarget})),fleet:fleet.map(t=>({type:t.type,x:t.x,y:t.y,retreating:t.retreating,medical:t._medicalRecovering,hp:t.hp,mp:t.manpower,maxMp:t.maxManpower,yield:t._trafficYield,cargo:t.cargo?.type,pickup:t.pickupUid,unload:t.unloadHexKey,goal:t.orderTarget})),owned:gameData.hexList.filter(h=>h.owner===2&&h.q>10).length};
  });console.log('liveAi',JSON.stringify(results.liveAi));await page.screenshot({path:path.join(OUT,'live-ai-beachhead.png')});
  results.routes=await page.evaluate(()=>{
   const rows=[];for(const type of ['light','heavy','marine','transport','supply']){
    resetWaterTest();gameData._transportAiTimer=-1e6;if(wodIsNavalUnit({type}))for(const h of gameData.hexList){h.type='water';h.owner=0;}
    const u=createUnitAt(type,-270,-135,1);u.x=-270;u.y=-135;const goal={x:270,y:162};const ok=assignUnitMoveAlongWaypoints(u,[goal]);const points=[{x:u.x,y:u.y},u.target,...u.path||[]].filter(Boolean);let length=0;for(let i=1;i<points.length;i++)length+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
    gameData.unitSpatialGrid=buildUnitSpatialGrid(96);let moved=0,invalid=0,old={x:u.x,y:u.y};for(let n=0;n<3000&&u.target;n++){moveUnitTowardTarget(u,.1);moved+=Math.hypot(u.x-old.x,u.y-old.y);old={x:u.x,y:u.y};if(!wodSamplePosOnWalkableTerrain(u,u.x,u.y))invalid++;}
    rows.push({type,ok,points:points.length,ratio:length/Math.hypot(540,297),moved,invalid,arrived:Math.hypot(u.x-goal.x,u.y-goal.y)<3});
   }return rows;
  });console.log('routes',JSON.stringify(results.routes));
  results.fogScout=await page.evaluate(()=>{
   resetWaterTest(2);gameData.fogOfWar=true;gameData._aiEconomyClock=0;gameData._transportAiTimer=0;gameData.aiStrategyTimer=99;gameData.aiTaskForces={};gameData._aiDefenseByOwner={};gameData._aiMoveQueue=new Map();
   for(const h of gameData.hexList){const home=Math.hypot(h.q+13,h.r)<5,island=Math.hypot(h.q-10,h.r)<5;h.type=home||island?'grass':'water';h.owner=isWaterHex(h)?0:home?2:1;h.cityId=null;}
   testTown(-13,0,2,'Hidden enemy test');for(const [type,q,r]of [['light',-13,0],['light',-13,2],['heavy',-13,-2],['transport',-7,0],['supply',-7,-4]]){const u=createUnitAt(type,q*27,r*27,2);u.x=q*27;u.y=r*27;}
   const initiallyKnown=wodAiNavalAssaultTargets(2).length,boat=gameData.entities.find(u=>u.type==='transport'),start={x:boat.x,y:boat.y};let discovered=false,loaded=false,landed=false;
   for(let n=0;n<6000;n++){if(n%20===0)wodFogFactionIntel(2,true);update(.1);discovered ||= wodAiNavalAssaultTargets(2).length>0;loaded ||= !!boat.cargo;landed ||= gameData.entities.some(u=>u._navalLanded&&u.x>5*27);if(landed)break;}
   return{initiallyKnown,discovered,loaded,landed,moved:Math.hypot(boat.x-start.x,boat.y-start.y),boat:{x:boat.x,y:boat.y,cargo:boat.cargo?.type,pickup:boat.pickupUid,goal:boat.orderTarget},army:gameData.entities.filter(isLandArmyUnit).map(u=>({type:u.type,x:u.x,y:u.y,job:u.aiTfKind,board:u.boardTransportUid}))};
  });console.log('fogScout',JSON.stringify(results.fogScout));
  results.groupLanding=await page.evaluate(()=>{
   resetWaterTest();gameData._transportAiTimer=-1e6;gameData.fogOfWar=false;
   for(const h of gameData.hexList){h.type=h.q>=5&&h.q<=25&&Math.abs(h.r)<=4?'grass':'water';h.owner=isWaterHex(h)?0:2;}
   const boats=[];for(const r of [-8,-5]){const cargo=createUnitAt('light',270,0,1),t=createUnitAt('transport',0,r*27,1);t.x=0;t.y=r*27;t.cargo=cargo;gameData.entities=gameData.entities.filter(u=>u!==cargo);boats.push(t);}
   const goal=gameData.hexes['24,4'];gameData.selection=boats;for(const t of boats)t.selected=true;issueMoveOrder(goal);let invalid=0;
   const planned=boats.map(t=>({key:t.unloadHexKey,distance:Math.hypot((gameData.hexes[t.unloadHexKey]?.x??1e6)-goal.x,(gameData.hexes[t.unloadHexKey]?.y??1e6)-goal.y)}));
   for(let n=0;n<4000&&boats.some(t=>t.cargo);n++){update(.1);for(const t of boats)if(!wodIsOpenWaterHex(getNearestHexToPoint(t.x,t.y)))invalid++;}
   return{planned,landed:boats.filter(t=>!t.cargo).length,invalid};
  });console.log('groupLanding',JSON.stringify(results.groupLanding));
  results.pointer=await page.evaluate(()=>{
   resetWaterTest();gameData._transportAiTimer=-1e6;gameData.fogOfWar=false;for(const h of gameData.hexList){h.type=h.q>=5&&h.q<=25&&Math.abs(h.r)<=4?'grass':'water';h.owner=isWaterHex(h)?0:2;}
   const cargo=createUnitAt('light',270,0,1),t=createUnitAt('transport',0,-162,1);t.x=0;t.y=-162;t.cargo=cargo;gameData.entities=gameData.entities.filter(u=>u!==cargo);gameData.selection=[t];t.selected=true;
   gameData.camera={zoom:.8,x:-90,y:-300};setMobileOrderMode(null);syncInfoCardPanel();wodMarkTerrainFullDirty();updateTerrainCache();draw();const h=gameData.hexes['24,4'],r=canvas.getBoundingClientRect();return {x:r.left+h.x*.8+90,y:r.top+h.y*.8+300};
  });await page.mouse.click(results.pointer.x,results.pointer.y,{button:'right'});results.pointer=await page.evaluate(()=>{const t=gameData.entities.find(u=>u.type==='transport');return {key:t.unloadHexKey,goal:t.unloadGoal,arrow:wodPlayerMarchArrowPoints(t)?.length};});await page.screenshot({path:path.join(OUT,'clicked-landing-order.png')});console.log('pointer',JSON.stringify(results.pointer));
  results.townAssault=await page.evaluate(()=>{
   resetWaterTest(2);gameData.fogOfWar=false;gameData._aiEconomyClock=0;gameData._transportAiTimer=0;gameData.aiStrategyTimer=99;gameData.aiTaskForces={};gameData._aiDefenseByOwner={};gameData._aiMoveQueue=new Map();
   for(const h of gameData.hexList){const home=h.q>=-18&&h.q<=-6&&Math.abs(h.r)<=6,island=h.q>=6&&h.q<=18&&Math.abs(h.r)<=6;h.type=home||island?'grass':'water';h.owner=isWaterHex(h)?0:home?2:1;h.cityId=null;}
   const home=testTown(-12,0,2,'Home'),town=testTown(7,0,1,'Invasion port');for(const p of getHexesInRadius(7,0,1)){const h=gameData.hexes[`${p.q},${p.r}`];if(h&&!isWaterHex(h)){h.type='urban';h.cityId=town.id;}}
   const invaders=[];for(const [type,q,r]of [['light',-12,0],['light',-12,3],['light',-12,-3],['heavy',-9,0],['heavy',-9,3],['transport',-5,-2],['transport',-5,2],['supply',-4,0],['ship',-3,-5]]){const u=createUnitAt(type,q*27,r*27,2);u.x=q*27;u.y=r*27;if(isLandArmyUnit(u)&&q!==-12||type==='light'&&r!==0)invaders.push(u);}
   const defender=createUnitAt('light',town.x,town.y,1);defender.x=town.x;defender.y=town.y;let loaded=false,landed=false;
   for(let n=0;n<5000;n++){update(.1);loaded ||= gameData.entities.some(t=>t.type==='transport'&&t.cargo);landed ||= invaders.some(u=>u._navalLanded);if(town.owner===2&&getCityUrbanTerrainHexes(town).every(h=>h.owner===2))break;}
   gameData.camera={zoom:1,x:-500,y:-390};wodMarkTerrainFullDirty();draw();return{mission:(()=>{const p=gameData.aiNavalPlans?.[2];return p&&{goal:p.goal,phase:p.phase,reason:p.reason};})(),loaded,landed,captured:town.owner===2,fullTown:getCityUrbanTerrainHexes(town).every(h=>h.owner===2),defenderHp:defender.hp,alive:invaders.filter(u=>u.hp>0).length,attrition:invaders.reduce((n,u)=>n+(u.attritionHpLost||0),0),fleet:gameData.entities.filter(wodIsNavalUnit).map(u=>({type:u.type,x:u.x,y:u.y,goal:u.orderTarget,cargo:u.cargo?.type})),troops:invaders.map(u=>({type:u.type,x:u.x,y:u.y,hp:u.hp,job:u.aiTfKind,advance:u._navalAdvanceGoal,landed:u._navalLanded,yield:u._trafficYield,goal:u.orderTarget}))};
  });console.log('townAssault',JSON.stringify(results.townAssault));await page.screenshot({path:path.join(OUT,'defended-town-invasion.png')});
  results.obstacles=await page.evaluate(()=>{
   const rows=[];for(const type of ['light','heavy','transport','supply']){
    resetWaterTest();gameData.fogOfWar=false;gameData._transportAiTimer=-1e6;const naval=wodIsNavalUnit({type});for(const h of gameData.hexList){h.type=naval?'water':'grass';h.owner=naval?0:1;if(h.q===0&&Math.abs(h.r)<=7)h.type=naval?'grass':'mountain';}
    const u=createUnitAt(type,-270,0,1);u.x=-270;u.y=0;const goal={x:270,y:0};gameData.unitSpatialGrid=buildUnitSpatialGrid(96);const ok=assignUnitMoveAlongWaypoints(u,[goal]);let invalid=0,length=0,old={x:u.x,y:u.y};const pts=[{...old},u.target,...u.path||[]].filter(Boolean);
    for(let n=0;n<4000&&u.target;n++){moveUnitTowardTarget(u,.1);length+=Math.hypot(u.x-old.x,u.y-old.y);old={x:u.x,y:u.y};if(!wodSamplePosOnWalkableTerrain(u,u.x,u.y))invalid++;}
    rows.push({type,ok,arrived:Math.hypot(u.x-goal.x,u.y-goal.y)<3,invalid,length,points:pts.length});
   }return rows;
  });console.log('obstacles',JSON.stringify(results.obstacles));
  fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));assert(!errors.length,errors.join('\n'));
  if(!process.env.WOD_PROBE){assert(results.coastClick.planned.distance<=54&&results.coastClick.landed&&!results.coastClick.invalid,'clicked coast must be the landing destination');assert(results.liveAi.landed>=4&&results.liveAi.army.every(u=>u.hp>0&&!u.attrition)&&results.liveAi.support.safe/results.liveAi.support.ticks>.95&&!results.liveAi.invalid,'normal AI must ferry and sustain successive waves');assert(results.routes.every(r=>r.arrived&&!r.invalid&&r.ratio<1.04),'clear routes should be direct and arrive');assert(results.fogScout.initiallyKnown===0&&results.fogScout.discovered&&results.fogScout.loaded&&results.fogScout.landed,'idle fleet must scout, discover and invade without hidden knowledge');assert(results.groupLanding.landed===2&&results.groupLanding.planned.every(r=>r.distance<=54)&&!results.groupLanding.invalid,'selected transports must land together near the clicked coast');assert(results.pointer.key==='24,4'&&results.pointer.arrow>=2,'real right click must set the correct landing and water-route arrow');assert(results.townAssault.loaded&&results.townAssault.landed&&results.townAssault.captured&&results.townAssault.fullTown,'AI must complete a defended coastal town assault');assert(results.obstacles.every(r=>r.arrived&&!r.invalid&&r.length<820),'land and naval units must take clean obstacle detours');}
 }finally{fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const c of relay.clients)c.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

