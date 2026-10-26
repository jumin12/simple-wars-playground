const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/naval-transports');fs.mkdirSync(OUT,{recursive:true});
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

  results.combat=await page.evaluate(()=>{
   const rows=[];
   for(const owner of [1,2])for(const type of ['marine','light','heavy']) {
    resetWaterTest();for(const h of gameData.hexList)if(h.q>=0){h.type='water';h.owner=0;}const sea=gameData.hexes['0,0'];
    const a=createUnitAt(type,type==='marine'?0:-27,0,owner);a.x=type==='marine'?0:-27;a.y=0;a.hp=a.maxHp*.8;a.manpower=a.maxManpower*.8;
    const bx=type==='marine'?40:13,b=createUnitAt('ship',bx,0,3-owner);b.x=bx;b.y=0;
    const before=a.hp,ship=b.hp;update(.5);rows.push({owner,type,loss:before-a.hp,shipLoss:ship-b.hp,target:a.combatTargetUid,shipTarget:b.combatTargetUid,shipHp:b.maxHp,icon:a.waterFlash>0});
   }return rows;
  });assert(results.combat.every(r=>r.loss>0&&r.shipLoss>0&&r.target&&r.shipTarget&&r.shipHp===300&&(r.type==='marine'?r.icon:!r.icon)),'both owners exchange fire between dry land and water, and marines also fight afloat');
  results.marineAndHealing=await page.evaluate(()=>{
   resetWaterTest();testTown(-8,0,1,'Supply');const h=gameData.hexes['0,0'];h.type='water';h.owner=0;const u=createUnitAt('marine',0,0,1);u.x=u.y=0;u.hp=70;u.manpower=700;update(7);const afloat={hp:u.hp,heals:canHealUnit(u),icon:u.waterFlash>0};
   h.type='grass';h.owner=1;u.hp=100;u.manpower=1000;u.healingFlash=.25;const fullIcon=wodUnitHealingIcon(u);updateUnitHealing(u,.1);const flash=u.healingFlash;
   u.hp=99;u.manpower=990;gameData.manpower=0;updateUnitHealing(u,.1);const unfunded=u.healingFlash;gameData.manpower=5000;updateUnitHealing(u,1);
   return{afloat,fullIcon,flash,unfunded,repaired:u.hp===100&&u.manpower===1000,endIcon:wodUnitHealingIcon(u)};
  });console.log('healing',JSON.stringify(results.marineAndHealing));assert(results.marineAndHealing.afloat.hp===70&&!results.marineAndHealing.afloat.heals&&results.marineAndHealing.afloat.icon&&!results.marineAndHealing.fullIcon&&results.marineAndHealing.flash===0&&results.marineAndHealing.unfunded===0&&results.marineAndHealing.repaired&&!results.marineAndHealing.endIcon,'marine embarkment is visible without immunity to fire or healing; full/unfunded units have no healing icon');
  results.trips=await page.evaluate(()=>{
   const rows=[];
   for(const owner of [1,2])for(const type of ['light','heavy','marine']) {
    resetWaterTest(owner);gameData._transportAiTimer=-1e6;
    for(const h of gameData.hexList){h.type=h.q>=0&&h.q<8?'water':'grass';h.owner=isWaterHex(h)?0:h.q<0?owner:3-owner;}
    testTown(-8,0,owner,'Origin');testTown(11,0,3-owner,'Destination');
    const u=createUnitAt(type,-108,0,owner),t=createUnitAt('transport',27,0,owner);u.x=-108;u.y=0;t.x=27;t.y=0;u.hp=u.maxHp*.8;u.manpower=u.maxManpower*.8;const hp=u.hp;
    gameData.unitSpatialGrid=buildUnitSpatialGrid();wodBeginSimPfBudget(2);
    const ordered=wodOrderBoardTransport(u,t);
    let steps=0;for(;steps<1800&&!t.cargo;steps++){wodBeginSimPfBudget(2);for(const e of gameData.entities)moveUnitTowardTarget(e,.1);wodRunUnitSeparation(false,5,96);wodUpdateTransports(.1);}
    if(!t.cargo){rows.push({owner,type,ordered,loaded:false,steps,positions:gameData.entities.map(e=>({type:e.type,x:e.x,y:e.y,target:e.target,board:e.boardTransportUid,pick:e.pickupUid}))});continue;}
    const loaded=!gameData.entities.includes(u),second=createUnitAt('light',-100,80,owner),rejectSecond=!wodOrderBoardTransport(second,t);
    const packet=wodStripEntityForNet(t),copy=wodEntityFromNet(packet),net=copy.cargo.uid===u.uid&&copy.cargo.hp===hp;
    update(6);const protectedHp=t.cargo?.hp;
    const destination=gameData.hexes['10,0'],unload=wodOrderUnloadTransport(t,destination);
    for(steps=0;steps<3000&&t.cargo;steps++){wodBeginSimPfBudget(3);for(const e of gameData.entities)moveUnitTowardTarget(e,.1);wodRunUnitSeparation(false,5,96);wodUpdateTransports(.1);}
    const land=getNearestHexToPoint(u.x,u.y);
    rows.push({owner,type,ordered,loaded,rejectSecond,net,protectedHp,hp,unload,unloaded:!t.cargo&&gameData.entities.includes(u),dry:land&&!isWaterHex(land)&&land.q>=8,steps,pos:[t.x,t.y,u.x,u.y],target:t.target});
   }return rows;
  });console.log('trips',JSON.stringify(results.trips));assert(results.trips.every(r=>r.ordered&&r.loaded&&r.rejectSecond&&r.net&&r.protectedHp===r.hp&&r.unload&&r.unloaded&&r.dry),'each owner carries exactly one intact land unit to the far shore and restores it with the same identity/health');
  results.spacing=await page.evaluate(()=>{
   const rows=[];for(const owner of [1,2])for(const type of ['light','heavy','ship','transport']){
    resetWaterTest(owner);if(['ship','transport'].includes(type))for(const h of gameData.hexList){h.type='water';h.owner=0;}
    for(let i=0;i<18;i++){const u=createUnitAt(type,0,0,owner);u.x=u.y=0;u.target={x:400,y:0,pathPrepared:true};}
    wodRunUnitSeparation(false,5,96);let bad=0,min=1e9;for(const a of gameData.entities)for(const b of gameData.entities){if(a===b)continue;const gap=Math.hypot(a.x-b.x,a.y-b.y)-(a.radius+b.radius);if(gap<-.05)bad++;min=Math.min(min,gap);}
    rows.push({owner,type,bad,min});
   }return rows;
  });console.log('spacing',JSON.stringify(results.spacing));assert(results.spacing.every(r=>r.bad===0),'even exact spawn stacks separate for both owners and all hull/body sizes');
  results.aiAvoidsSwimming=await page.evaluate(()=>{
   resetWaterTest(2);for(const h of gameData.hexList)if(h.q===0){h.type='water';h.owner=0;}const u=createUnitAt('light',-135,0,2);u.x=-135;u.y=0;
   const target=gameData.hexes['5,0'];wodBeginSimPfBudget(1);assignUnitMoveAlongWaypoints(u,[target]);let wet=0;for(let i=0;i<1000;i++){wodBeginSimPfBudget(1);moveUnitTowardTarget(u,.1);if(isWaterHex(getNearestHexToPoint(u.x,u.y)))wet++;}
   return{wet,x:u.x};
  });assert.equal(results.aiAvoidsSwimming.wet,0,'ordinary AI waits for dry access, a bridge or transport');
  results.aiFerry=await page.evaluate(()=>{
   resetWaterTest(2);gameData._transportAiTimer=0;for(const h of gameData.hexList){h.type=h.q>=0&&h.q<8?'water':'grass';h.owner=isWaterHex(h)?0:h.q<0?2:1;}testTown(-8,0,2,'Own');testTown(11,0,1,'Enemy');
   const u=createUnitAt('heavy',-108,0,2),t=createUnitAt('transport',27,0,2);u.x=-108;u.y=0;t.x=27;t.y=0;gameData.unitSpatialGrid=buildUnitSpatialGrid();wodBeginSimPfBudget(2);
   const request=wodAiMoveUnitToward(u,297,0,false);let loaded=false,landed=false;
   for(let i=0;i<3000;i++){wodBeginSimPfBudget(2);for(const e of gameData.entities)moveUnitTowardTarget(e,.1);wodRunUnitSeparation(false,5,96);wodUpdateTransports(.1);loaded||=!!t.cargo;if(loaded&&!t.cargo){landed=true;break;}}
   for(let i=0;i<50;i++)wodUpdateTransports(.1);
   return{request,loaded,landed,requestedAgain:u._needsTransport,pickup:t.pickupUid,aboard:!!t.cargo,ashore:!isWaterHex(getNearestHexToPoint(u.x,u.y))};
  });console.log("aiFerry",JSON.stringify(results.aiFerry));assert(results.aiFerry.request&&results.aiFerry.loaded&&results.aiFerry.landed&&results.aiFerry.ashore&&!results.aiFerry.requestedAgain&&!results.aiFerry.aboard&&!results.aiFerry.pickup,'AI ferries a stranded assault unit once and leaves it ashore to advance');
  results.rescue=await page.evaluate(()=>{resetWaterTest();for(const h of gameData.hexList){h.type='water';h.owner=0;}const u=createUnitAt('light',0,0,1),t=createUnitAt('transport',35,0,1);u.x=u.y=0;t.x=35;t.y=0;const ordered=wodOrderBoardTransport(u,t);wodUpdateTransports(.1);return{ordered,loaded:t.cargo===u};});assert(results.rescue.ordered&&results.rescue.loaded,'transports can also pick up friendly land units already afloat');
  results.sinking=await page.evaluate(()=>{
   resetWaterTest();const t=createUnitAt('transport',0,0,1),u=createUnitAt('marine',0,0,1);gameData.entities=gameData.entities.filter(e=>e!==u);t.cargo=u;applyDamage(t,100,2);wodUpdateTransports(.1);return{cargoGone:!t.cargo,hull:t.hp,passenger:u.hp};
  });assert(results.sinking.cargoGone&&results.sinking.hull===0&&results.sinking.passenger===0,'sinking loses the passenger, including marines');
  results.production=await page.evaluate(()=>{
   resetWaterTest();for(const h of gameData.hexList)if(h.q>=0){h.type='water';h.owner=0;}const c=testTown(-2,0,1,'Shipyard');c.hasHarbor=true;gameData.money=100000;gameData.manpower=100000;
   const before={cash:gameData.money,mp:gameData.manpower},queued=wodApplyBuildAtCityForOwner(c,'transport',1);wodUpdateConstruction(17.9);const early=gameData.entities.some(u=>u.type==='transport');wodUpdateConstruction(.11);const t=gameData.entities.find(u=>u.type==='transport');
   return{queued,early,ready:!!t,price:before.cash-gameData.money,mp:before.mp-gameData.manpower,hp:t?.maxHp,fire:t?.damage,replacement:replacementMoneyFromLosses(t,500,0),afloat:isWaterHex(getNearestHexToPoint(t?.x,t?.y))};
  });assert(results.production.queued&&!results.production.early&&results.production.ready&&results.production.price===2000&&results.production.mp===1000&&results.production.hp===50&&results.production.fire===4&&results.production.afloat,'18-second harbor production has the correct price, crew and half-infantry strength');
  assert.equal(results.production.replacement,2000,'transport casualty value uses its own price and crew');
  results.blockedLanding=await page.evaluate(()=>{
   resetWaterTest();for(const h of gameData.hexList)if(h.q>=0){h.type='water';h.owner=0;}
   const t=createUnitAt('transport',0,0,1),u=createUnitAt('heavy',-100,0,1);t.x=t.y=0;gameData.entities=gameData.entities.filter(e=>e!==u);t.cargo=u;t.unloadHexKey='-1,0';
   const blockers=[];for(let q=-2;q<0;q++)for(let r=-2;r<=2;r++){const b=createUnitAt('heavy',q*27,r*27,1);b.x=q*27;b.y=r*27;blockers.push(b);}
   const waited=!wodTryUnloadTransport(t)&&t.cargo===u;gameData.entities=[t];const clear=wodTryUnloadTransport(t);return{waited,clear,dry:!isWaterHex(getNearestHexToPoint(u.x,u.y)),safe:Math.hypot(t.x-u.x,t.y-u.y)>=t.radius+u.radius};
  });assert(results.blockedLanding.waited&&results.blockedLanding.clear&&results.blockedLanding.dry&&results.blockedLanding.safe,'blocked unload waits and later lands the unit without overlap');
  results.explicitWater=await page.evaluate(()=>{
   resetWaterTest();for(const h of gameData.hexList){h.type=h.r>=1?'water':'grass';h.owner=h.r>=1?0:1;}
   const start=gameData.hexes['-10,-2'],goal=gameData.hexes['10,2'],u=createUnitAt('light',start.x,start.y,1);u.x=start.x;u.y=start.y;u.selected=true;gameData.selection=[u];gameData.unitSpatialGrid=buildUnitSpatialGrid();wodBeginSimPfBudget(1);issueMoveOrder(goal);
   const exact=u.orderTarget&&Math.hypot(u.orderTarget.x-goal.x,u.orderTarget.y-goal.y)<1;let waterDistance=0;const route={target:u.target,path:u.path?.map(p=>({...p})),direct:wodFindExplicitWaterRoute(u,start,goal).map(h=>[h.q,h.r])};
   for(let i=0;i<2400&&Math.hypot(u.x-goal.x,u.y-goal.y)>4;i++){const x=u.x,y=u.y;wodBeginSimPfBudget(1);moveUnitTowardTarget(u,.1);if(isWaterHex(getNearestHexToPoint(u.x,u.y)))waterDistance+=Math.hypot(u.x-x,u.y-y);}
   return{exact,arrived:Math.hypot(u.x-goal.x,u.y-goal.y)<5,waterDistance,route};
  });console.log('explicitWater',JSON.stringify(results.explicitWater));assert(results.explicitWater.exact&&results.explicitWater.arrived&&results.explicitWater.waterDistance<27*4,'right-click water stays a water order and uses land along the coast for most of the journey');
  await page.evaluate(()=>{
   resetWaterTest();for(const h of gameData.hexList){h.type=h.q>=0?'water':'grass';h.owner=h.q>=0?0:1;h.baseColor=getTerrainColor(h.type);}testTown(-6,-3,1,'Port');
   const t=createUnitAt('transport',50,0,1),u=createUnitAt('heavy',-100,0,1);gameData.entities=gameData.entities.filter(e=>e!==u);t.cargo=u;t.spawnFx=0;t.selected=true;gameData.selection=[t];gameData.fogOfWar=false;gameData.layers={terrain:true,diplomacy:true,territory:false,cities:true,cityNames:true,units:true,structures:true};
   UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.style.display='block';UI.inGameUI.classList.remove('hidden');UI.escMenu.classList.add('hidden');canvas.classList.remove('menu-bg-active');canvas.style.display='block';gameState='PLAYING';setGameSpeed(0,true);WOD.setEditorSuppressTerrainBake(false);wodSyncViewportAndCanvas();gameData.camera.zoom=1.8;gameData.camera.x=-canvas.clientWidth/2;gameData.camera.y=-canvas.clientHeight/2;setShopMapSkin('atlas_hd');syncInfoCardPanel();draw();
  });await page.waitForTimeout(100);await page.screenshot({path:path.join(OUT,'loaded-transport-ui.png')});assert(await page.locator('#wodTransportControls [data-unload-transport]').isVisible(),'loaded transport exposes its unload control');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);await page.screenshot({path:path.join(OUT,'loaded-transport-mobile.png')});const unloadBounds=await page.locator('#wodTransportControls [data-unload-transport]').boundingBox();assert(unloadBounds&&unloadBounds.y>=0&&unloadBounds.y+unloadBounds.height<await page.locator('#wodCommandHud').evaluate(e=>e.getBoundingClientRect().top)-4,'unload stays visible on narrow screens');await page.setViewportSize({width:1440,height:900});
  results.scenarioCargo=await page.evaluate(()=>{const data=WOD.exportMapData(),t=data.entities.find(t=>t.type==='transport'),uid=t.cargo.uid,hp=t.cargo.hp;WOD.loadMapData(data);const loaded=gameData.entities.find(t=>t.type==='transport');return{cargo:loaded.cargo?.uid===uid&&loaded.cargo?.hp===hp,capacity:!loaded.cargo?.cargo,active:!gameData.entities.some(u=>u.uid===uid)};});assert(Object.values(results.scenarioCargo).every(Boolean),'scenario import/export preserves a single detached passenger');
  results.guest=await page.evaluate(()=>{const old=WodMultiplayer.sendCmd,rows=[];WodMultiplayer.sendCmd=cmd=>rows.push(cmd);gameData.mp={enabled:true,isHost:false,localSlot:1,allReady:true};const t=gameData.entities.find(t=>t.type==='transport');wodSendTransportCommand('unloadTransport',null,t,{x:-100,y:0});WodMultiplayer.sendCmd=old;gameData.mp={enabled:false};return rows;});assert(results.guest.length===1&&results.guest[0].kind==='unloadTransport'&&results.guest[0].transportUid,'guests send transport commands to the authoritative host');
  // Era art and UI controls are captured for actual visual review.
  for(const era of ['modern','napoleonic','medieval','ancient']) {
   const data=await page.evaluate(era=>{const old=wodGetRenderPeriod;wodGetRenderPeriod=()=>era;try{const c=document.createElement('canvas');c.width=700;c.height=220;const cx=c.getContext('2d');cx.fillStyle='#284d60';cx.fillRect(0,0,700,220);for(let i=0;i<2;i++){cx.save();cx.translate(180+i*330,105);wodDrawTransport(cx,{x:0,y:0,type:'transport',cargo:i?{type:'heavy'}:null},55,'#57b4dc');cx.restore();}return c.toDataURL();}finally{wodGetRenderPeriod=old;}},era);fs.writeFileSync(path.join(OUT,'transport-'+era+'.png'),Buffer.from(data.split(',')[1],'base64'));
  }
  fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));assert.equal(errors.length,0,errors.join('\n'));console.log('Naval combat, healing, ferry trips, spacing and AI water preferences passed.');
 }finally{fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const s of relay.clients)s.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});



