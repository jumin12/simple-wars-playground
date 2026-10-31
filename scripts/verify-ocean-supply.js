const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/ocean-supply');fs.mkdirSync(OUT,{recursive:true});
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

  results.camera=await page.evaluate(()=>{
   resetWaterTest();gameData.entities=[];gameData.cities=[];gameData.selection=[];UI.escMenu.classList.add('hidden');UI.statsMenu.classList.add('hidden');UI.citiesMenu.classList.add('hidden');
   cancelAnimationFrame(animationFrameId);const raf=window.requestAnimationFrame;window.requestAnimationFrame=()=>0;keys.d=true;const rows=[];
   for(const branch of ['solo','guest','waiting'])for(const speed of [0,1,2,3]){
    gameState='PLAYING';gameData.mp=branch==='solo'?{enabled:false}:{enabled:true,isHost:branch==='waiting',allReady:branch!=='waiting',humanSlots:[1,2],localSlot:1};gameData.speed=speed;gameData.camera={x:0,y:0,zoom:1};lastTime=10000;
    for(let n=1;n<=15;n++)gameLoop(10000+n*1000/60);rows.push({branch,speed,x:gameData.camera.x});
   }
   keys.d=false;window.requestAnimationFrame=raf;gameData.mp={enabled:false};gameData.speed=0;gameState='PLAYING';lastTime=performance.now();animationFrameId=requestAnimationFrame(gameLoop);return rows;
  });assert(results.camera.every(r=>Math.abs(r.x-200)<.00001),JSON.stringify(results.camera));
  results.grace=await page.evaluate(()=>{
   const rows=[];for(const owner of [1,2])for(const type of ['light','heavy'])for(const water of [false,true]){
    resetWaterTest(owner);for(const h of gameData.hexList){h.type=water?'water':'grass';h.owner=water?0:owner;}
    const u=createUnitAt(type,0,0,owner);u.x=u.y=0;gameData._battleLedger=null;gameData.unitSpatialGrid=buildUnitSpatialGrid();const hp=u.hp;update(11.9);const before=u.hp,tip=getUnitEffects(u).find(e=>e.label==='Encircled'||e.label==='Water: out of supply')?.stats;update(.1);const atTen=u.hp;update(.5);const packet=wodEntityFromNet(wodStripEntityForNet(u));rows.push({owner,type,water,hp,before,atTen,loss:(hp-u.hp)/u.maxHp,timer:u.outOfSupplySeconds,replicated:packet.outOfSupplySeconds,tip,metrics:{...wodBattleLedger().byOwner[owner]}});
   }return rows;
  });assert(results.grace.every(r=>r.hp===r.before&&Math.abs(r.hp-r.atTen)<1e-7&&Math.abs(r.loss-.0175)<1e-7&&Math.abs(r.timer-10.5)<1e-7&&r.timer===r.replicated&&r.tip.includes('Attrition in')),JSON.stringify(results.grace));
  results.resupply=await page.evaluate(()=>{resetWaterTest();for(const h of gameData.hexList)if(h.q>=0){h.type='water';h.owner=0;}const u=createUnitAt('light',-54,0,1);u.x=-54;u.y=0;update(5);const first=u.outOfSupplySeconds;const s=createUnitAt('supply',27,0,1);s.x=27;s.y=0;update(.1);const reset=u.outOfSupplySeconds;s.x=600;const hp=u.hp;update(12);const safe=u.hp;update(.25);return{first,reset,hp,safe,loss:hp-u.hp};});assert(results.resupply.first===3&&results.resupply.reset===0&&results.resupply.hp===results.resupply.safe&&Math.abs(results.resupply.loss-.875)<1e-7,JSON.stringify(results.resupply));
  await page.evaluate(()=>{resetWaterTest();const u=createUnitAt('light',0,0,1);u.x=u.y=0;update(3);gameData.selection=[u];u.selected=true;gameData.camera={x:-240,y:-170,zoom:1.8};gameData.layers.units=true;wodMarkTerrainFullDirty();draw();});await page.screenshot({path:path.join(OUT,'supply-countdown.png')});
  results.losses=await page.evaluate(()=>{
   resetWaterTest();gameData._battleLedger=null;const armor=createUnitAt('heavy',0,0,1),inf=createUnitAt('light',150,0,2);applyDamage(armor,30,2);applyDamage(armor,500,0,'supply');applyDamage(inf,40,0,'water');applyDamage(inf,60,0,'unpaid');
   const a={...wodBattleLedger().byOwner[1]},b={...wodBattleLedger().byOwner[2]},unit=wodEntityFromNet(wodStripEntityForNet(armor));UI.statsMenu.classList.remove('hidden');wodRefreshBattleStats();wodShowStatsPage('combat');const live=document.getElementById('wodStatsCombatDetail').textContent,final=wodRenderFactionStats(true);return{a,b,unit:{losses:unit.attritionLosses,tanks:unit.attritionTankLosses},live,final};
  });assert(Math.abs(results.losses.a.attritionPersonnelLost-900)<.00001&&results.losses.a.attritionArmorLost===450&&results.losses.a.attritionUnitsLost===1&&results.losses.a.combatDamageTaken===30&&results.losses.a.attritionDamage===270&&results.losses.b.attritionPersonnelLost===1000&&results.losses.b.attritionUnitsLost===1&&results.losses.unit.losses===900&&results.losses.unit.tanks===450&&results.losses.live.includes('Attrition losses')&&results.losses.final.includes('ATTRITION LOSSES'),JSON.stringify(results.losses));
  await page.getByRole('heading',{name:'Attrition losses',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(OUT,'attrition-stats-desktop.png')});await page.setViewportSize({width:390,height:900});await page.getByRole('heading',{name:'Attrition losses',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(OUT,'attrition-stats-mobile.png')});await page.setViewportSize({width:1440,height:900});
  await page.evaluate(()=>{UI.statsMenu.classList.add('hidden');openCampaignBattleSummary('defeat','Attrition report','Integration test');});assert((await page.locator('#campaignSummaryStats').textContent()).includes('ATTRITION LOSSES'));await page.locator('#campaignSummaryStats [data-stats-owner="1"]').getByText('ATTRITION LOSSES',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(OUT,'attrition-end-report.png')});await page.evaluate(()=>{hideCampaignSummaryOverlay();gameState='PLAYING';});
  results.ocean=[];
  for(const townless of [false,true])results.ocean.push(await page.evaluate(townless=>{
   resetWaterTest(2);WOD.makeBlankMap(55);gameState='PLAYING';gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.bridges=[];gameData.constructionJobs=[];gameData._matchReadyForEndChecks=false;gameData._encircWork=null;gameData.encircledHexes=new Set();gameData._wodPfCache=new Map();gameData._wodPfVer++;gameData._aiEconomyClock=0;gameData._transportAiTimer=0;gameData._battleLedger=null;gameData._aiSpawnBurst=null;gameData._aiStratWork=null;gameData._aiFormChunk=null;gameData.aiTimer=-1e6;gameData.aiStrategyTimer=-1e6;gameData._aiFortGuardTimer=-1e6;gameData.convoyTimer=-1e6;gameData.fogOfWar=false;
   for(const h of gameData.hexList){const west=Math.hypot(h.q+24,h.r)<8,east=Math.hypot(h.q-24,h.r)<8,obstacle=h.q>=-2&&h.q<=3&&h.r>=-7&&h.r<=8,lake=Math.hypot(h.q+24,h.r-4)<1.7;h.type=(west||east||obstacle)&&!lake?'grass':'water';h.owner=h.type==='water'?0:west?2:east?1:0;h.cityId=null;}
   const home=testTown(-24,0,2,'Home port'),goal=!townless?testTown(24,0,1,'Enemy island'):null;const guard=createUnitAt('light',home.x,home.y,2);guard.x=home.x;guard.y=home.y;guard.aiTfKind='hold';const forces=[];for(const [type,q,r]of [['heavy',-24,-3],['light',-24,-6]]){const u=createUnitAt(type,q*27,r*27,2);u.x=q*27;u.y=r*27;forces.push(u);}
   const boats=[];for(const r of [-5,-1]){const t=createUnitAt('transport',-15*27,r*27,2);t.x=-15*27;t.y=r*27;boats.push(t);}const supply=createUnitAt('supply',-14*27,-8*27,2);supply.x=-14*27;supply.y=-8*27;
   const loaded=new Set(),landed=new Set();let invalid=0,supported=false,steps=0;
   for(;steps<6000&&landed.size<2;steps++){
    update(.1);for(const t of boats)if(t.cargo)loaded.add(t.cargo.uid);for(const u of forces)if(gameData.entities.includes(u)&&u.hp>0&&getNearestHexToPoint(u.x,u.y)?.q>15){landed.add(u.uid);supported ||= !!wodSupplyShipForUnit(u);}
    for(const t of [...boats,supply])if(t.hp>0&&!isWaterHex(getNearestHexToPoint(t.x,t.y)))invalid++;
   }
   const hp=forces.map(u=>u.hp);for(let n=0;n<100;n++)update(.1);const reboarded=boats.some(t=>t.cargo&&landed.has(t.cargo.uid)||t.pickupUid&&landed.has(t.pickupUid));
   gameData.camera={zoom:.45,x:-720,y:-430};gameData.layers.units=true;gameData.selection=[supply];supply.selected=true;wodMarkTerrainFullDirty();draw();return{townless,loaded:loaded.size,landed:landed.size,supported,invalid,reboarded,hp,guard:gameData.entities.includes(guard)&&!guard.boardTransportUid,seconds:steps*.1,boats:boats.map(t=>({x:t.x,y:t.y,cargo:t.cargo?.type,pickup:t.pickupUid})),supply:{x:supply.x,y:supply.y},forces:forces.map(u=>({x:u.x,y:u.y,hp:u.hp,goal:u.orderTarget}))};
  },townless));assert(results.ocean.every(r=>r.loaded===2&&r.landed===2&&r.supported&&!r.invalid&&!r.reboarded&&r.guard&&r.hp.every(h=>h>0)),JSON.stringify(results.ocean));await page.screenshot({path:path.join(OUT,'open-ocean-island-assault.png')});
  results.state=JSON.parse(await page.evaluate(()=>render_game_to_text()));assert(!errors.length,errors.join('\n'));fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({camera:results.camera,grace:results.grace.map(({metrics,...r})=>r),resupply:results.resupply,ocean:results.ocean}));
 }finally{fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const c of relay.clients)c.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
