const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/terrain-hd');fs.mkdirSync(OUT,{recursive:true});
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

  results.mountains=await page.evaluate(()=>{
   const rows=[];
   for(const kind of ['mountain','mixed','occupied','city','offshore']) {
    resetWaterTest(1);testTown(-10,0,1,'Surrounding town');
    if(kind==='offshore')for(const h of gameData.hexList)if(Math.abs(h.q)<=5&&Math.abs(h.r)<=5)h.type='water';
    const region=[];for(let q=-3;q<=3;q++)for(let r=-3;r<=3;r++){const h=gameData.hexes[`${q},${r}`];h.type=kind==='mixed'&&q%2?'grass':'mountain';h.owner=2;region.push(h);}
    if(kind==='occupied'){const h=gameData.hexes['0,0'];h.type='grass';const u=createUnitAt('light',h.x,h.y,2);u.x=h.x;u.y=h.y;}
    if(kind==='city')testTown(0,0,2,'Pocket town');
    gameData.encirclementTimer=100;gameData._encircWork=null;updateEncirclements(10);for(let i=0;i<1000&&gameData._encircWork;i++)wodEncirclementProcessChunk();
    rows.push({kind,owners:[...new Set(region.map(h=>h.owner))],encircled:region.filter(h=>gameData.encircledHexes.has(getHexKey(h))).length});
   }
   return rows;
  });
  assert(results.mountains.filter(r=>['mountain','mixed'].includes(r.kind)).every(r=>r.owners.length===1&&r.owners[0]===1),'empty mountain ranges transfer to their encircler');
  assert(results.mountains.filter(r=>['occupied','city','offshore'].includes(r.kind)).every(r=>r.owners.length===1&&r.owners[0]===2),'occupied pockets, supplied towns and separate islands remain');
  results.corners=await page.evaluate(async()=>{
   resetWaterTest();for(const h of gameData.hexList)h.type=(h.q+h.r)%2?'water':'grass';
   const repaired=await wodResolveGeneratedTerrainCorners();let ambiguous=0;
   for(const h of gameData.hexList){const a=gameData.hexes[`${h.q+1},${h.r}`],b=gameData.hexes[`${h.q},${h.r+1}`],c=gameData.hexes[`${h.q+1},${h.r+1}`];if(a&&b&&c&&isWaterHex(h)===isWaterHex(c)&&isWaterHex(a)===isWaterHex(b)&&isWaterHex(h)!==isWaterHex(a))ambiguous++;}
   return{...repaired,ambiguous};
  });assert(results.corners.ok&&results.corners.changed>0&&results.corners.ambiguous===0,'terrain data has no fake diagonal isthmuses');
  results.shortBorders=await page.evaluate(()=>{
   const rows=[];
   for(const skin of ['default','atlas_hd'])for(const length of [1,2,3]) {
    resetWaterTest();for(const h of gameData.hexList){h.type='water';h.owner=h.q<0?1:2;}
    for(let q=-4;q<=4;q++)for(let r=0;r<length;r++)gameData.hexes[`${q},${r}`].type='grass';
    const sp=gameData.hexRadius*1.35,c=document.createElement('canvas');c.width=c.height=300;const cx=c.getContext('2d');
    gameData.uiSettings.mapSkin=skin;cx.translate(150,150);
    if(skin==='atlas_hd')wodDrawHdTerrain(cx,0,0);else for(const type of ['water','sand','grass','forest','swamp','hill','mountain','urban'])drawTerrainBlobLayer(cx,type,0,0);
    const chains=wodCollectDiplomacyBorderChains(gameData.hexList,gameData.hexes,0,0,sp);
    const before=cx.getImageData(Math.floor(150-sp/2),150,1,1).data.slice();
    cx.strokeStyle='#ff00ff';cx.lineWidth=3;for(const ch of chains)drawPaintStroke(cx,ch.pts,sp,{closedLoop:ch.closed,suppressDegenerate:true,hybridBorder:true});
    const after=cx.getImageData(Math.floor(150-sp/2),150,1,1).data;
    rows.push({skin,length,chains:chains.length,points:chains[0]?.pts.length,painted:after[0]>before[0]+30&&after[2]>before[2]+30});
   }return rows;
  });assert(results.shortBorders.every(r=>r.chains===1&&r.points===r.length+1&&r.painted),'even single-cell land borders are visible in both skins');
  // Every point between cell centers is painted by its actual cell, never a disc gap.
  results.coverage=await page.evaluate(()=>{
   resetWaterTest();const types=['water','sand','grass','forest','swamp','hill','mountain','urban'];for(const h of gameData.hexList)h.type=types[((h.q*3+h.r)%8+8)%8];
   const c=document.createElement('canvas');c.width=c.height=500;const cx=c.getContext('2d');gameData.uiSettings.mapSkin='default';for(const type of types)drawTerrainBlobLayer(cx,type,250,250);
   const d=cx.getImageData(75,75,350,350).data;let holes=0;for(let i=3;i<d.length;i+=4)if(d[i]!==255)holes++;
   return{holes};
  });assert.equal(results.coverage.holes,0,'no unassigned subcell pixels');
  results.rounded=await page.evaluate(()=>{
   const rows=[];for(const skin of ['default','atlas_hd']) {
    resetWaterTest();for(const h of gameData.hexList){h.type='water';h.owner=0;}const h=gameData.hexes['0,0'];h.type='grass';h.owner=1;
    gameData.uiSettings.mapSkin=skin;const c=document.createElement('canvas');c.width=c.height=100;const cc=c.getContext('2d'),sp=gameData.hexRadius*1.35;
    if(skin==='atlas_hd')wodDrawHdTerrain(cc,50,50);else for(const type of ['water','sand','grass','forest','swamp','hill','mountain','urban'])drawTerrainBlobLayer(cc,type,50,50);
    const corner=cc.getImageData(Math.round(50-sp*.46),Math.round(50-sp*.46),1,1).data,center=cc.getImageData(50,50,1,1).data;
    gameData.layers.territory=true;drawTerritoryOverlay(cc,50,50);const overlay=territoryOverlayCanvas.getContext('2d').getImageData(Math.round(50-sp*.46),Math.round(50-sp*.46),1,1).data;
    rows.push({skin,cornerWater:corner[2]>corner[0],centerLand:center[1]>center[2],cornerUnclaimed:overlay[3]<10});
   }return rows;
  });assert(results.rounded.every(r=>r.cornerWater&&r.centerLand&&r.cornerUnclaimed),'both skins follow circular end cells and territory excludes the rounded water corners');
  results.neutralWater=await page.evaluate(()=>{
   resetWaterTest();for(const h of gameData.hexList)if(h.q>0)h.type='water';
   normalizeTerrainHexes();wodAssignAllWaterFromNearestLand(true);const h=gameData.hexes['1,0'];setHexOwner(h,2);
   gameData._landIncomeCacheDirty=true;getOwnerLandIncome(1);const expected=gameData.hexList.filter(h=>!isWaterHex(h)&&h.owner===1).length;
   const u=createUnitAt('marine',h.x,h.y,2);u.x=h.x;u.y=h.y;claimTerritoryAroundUnit(u);wodApplyTerritoryClaimBatch();
   return{claims:gameData.hexList.filter(h=>isWaterHex(h)&&h.owner!==0).length,count:gameData._landIncomeCache[1],expected};
  });assert(results.neutralWater.claims===0&&results.neutralWater.count===results.neutralWater.expected,'water is neither claimable nor counted as territory');
  // Exercise switching and persistence through the real shop buttons, then capture live terrain.
  await page.evaluate(()=>{
   resetWaterTest();gameData._matchPeriod='modern';gameData.gamePeriod='modern';
   for(const h of gameData.hexList){const q=h.q,r=h.r;h.type=q<-11||r>12?'water':q<-8?'sand':Math.abs(q-7)<4&&r<-3?'mountain':q>5&&r<3?'hill':q<2&&r>-9?'forest':'grass';h.owner=q<0?1:2;h.baseColor=getTerrainColor(h.type);}
   for(const [q,r,owner] of [[-4,-10,1],[10,8,2]]){const city=testTown(q,r,owner,'Town '+owner);city.hasFactory=false;city.hasHarbor=false;for(let x=q-1;x<=q+1;x++)for(let y=r-1;y<=r+1;y++){const h=gameData.hexes[`${x},${y}`];h.type='urban';h.cityId=city.id;}}
   for(const [type,q,r,owner] of [['light',-3,-3,1],['heavy',2,-1,1],['marine',-9,5,1],['ship',-13,-3,1],['convoy',3,6,2],['light',6,5,2],['heavy',9,3,2]]){const h=gameData.hexes[`${q},${r}`],u=createUnitAt(type,h.x,h.y,owner,{startSpawn:true});u.x=h.x;u.y=h.y;}
   gameData.fogOfWar=false;gameData.layers={terrain:true,diplomacy:true,territory:false,cities:true,cityNames:true,units:true};gameState='PLAYING';gameData._campaignEnded=false;UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.classList.remove('hidden');UI.inGameUI.style.display='';WOD.setEditorSuppressTerrainBake(false);canvas.style.display='block';wodSyncViewportAndCanvas();
   gameData.camera.zoom=1.6;gameData.camera.x=-canvas.clientWidth/2;gameData.camera.y=-canvas.clientHeight/2;setShopMapSkin('atlas_hd');draw();
  });
  await page.screenshot({path:path.join(OUT,'atlas-hd-gameplay.png')});
  results.skins=await page.evaluate(()=>{
   const units=gameData.entities.map(u=>({type:u.type,x:u.x,y:u.y})),canvasBefore=terrainBaseCanvas.toDataURL();setShopMapSkin('default');const different=canvasBefore!==terrainBaseCanvas.toDataURL();setShopMapSkin('atlas_hd');
   return{different,unitsUnchanged:JSON.stringify(units)===JSON.stringify(gameData.entities.map(u=>({type:u.type,x:u.x,y:u.y}))),active:gameData.uiSettings.mapSkin,saved:JSON.parse(localStorage.getItem(SL_UI_SETTINGS_KEY)).mapSkin,textures:Object.keys(wodHdTextureCache).length};
  });assert(results.skins.different&&results.skins.unitsUnchanged&&results.skins.active==='atlas_hd'&&results.skins.textures>=8&&results.skins.saved==='atlas_hd','skin changes visuals without changing simulation');
  // At high zoom all five unit types remain readable and era-appropriate.
  for(const era of ['modern','napoleonic','medieval','ancient']) {
   await page.evaluate(era=>{
    const c=document.createElement('canvas');c.width=1200;c.height=240;const ctx=c.getContext('2d');ctx.fillStyle='#747f53';ctx.fillRect(0,0,1200,240);const old=wodGetRenderPeriod;wodGetRenderPeriod=()=>era;
    try{for(const [i,type] of ['light','heavy','marine','ship','convoy'].entries()){ctx.save();ctx.translate(130+i*235,110);wodDrawHdUnit(ctx,{type,x:0,y:0,owner:1},42,'#5db6e5');ctx.restore();ctx.fillStyle='#fff';ctx.font='16px sans-serif';ctx.fillText(era+' '+type,65+i*235,205);}}finally{wodGetRenderPeriod=old;}
    window.unitSheet=c.toDataURL();
   },era);
   fs.writeFileSync(path.join(OUT,'units-'+era+'.png'),Buffer.from((await page.evaluate(()=>window.unitSheet)).split(',')[1],'base64'));
  }
  await page.evaluate(async()=>{
   gameData.loadedCustomMap=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData.aiCount=1;document.getElementById('setupAI').value='1';document.getElementById('setupMapSize').value='40';gameData._mapGenSeed=250101;gameData._wodReuseMapGenSeed=true;gameData._wodSkipMapGenLoader=true;gameData._mapGenOptions={cities:true,territory:true,units:true,mapShape:'island'};await generateMap();
   gameData.menuAttractMode=false;gameState='PLAYING';setGameSpeed(0,true);gameData.fogOfWar=false;gameData.layers.territory=false;gameData.layers.cities=false;gameData.layers.cityNames=true;gameData.layers.units=true;for(const u of gameData.entities)u.spawnFx=0;
   UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.classList.remove('hidden');UI.inGameUI.style.display='block';UI.canvas.classList.remove('menu-bg-active');document.getElementById('mapEditorApp')?.style.setProperty('display','none');
   gameData.camera.zoom=.85;gameData.camera.x=-canvas.clientWidth/2;gameData.camera.y=-canvas.clientHeight/2;wodMarkTerrainFullDirty();updateTerrainCache();draw();
  });
  await page.screenshot({path:path.join(OUT,'atlas-hd-generated-island.png')});
  await page.evaluate(()=>{document.getElementById('shopPanel').classList.remove('hidden');wodInitShopTabs();});
  await page.locator('[data-shop-tab="mapSkins"]').click();await page.locator('[data-map-skin="default"]').click();assert.equal(await page.evaluate(()=>gameData.uiSettings.mapSkin),'default');
  await page.locator('[data-map-skin="atlas_hd"]').click();assert.equal(await page.locator('[data-map-skin="atlas_hd"].active').count(),1);
  await page.screenshot({path:path.join(OUT,'atlas-hd-shop.png')});
  await page.reload();await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
  assert.equal(await page.evaluate(()=>gameData.uiSettings.mapSkin),'atlas_hd','HD skin survives reload and startup');
  fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));assert.equal(errors.length,0,errors.join('\n'));
 }finally{fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const s of relay.clients)s.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
