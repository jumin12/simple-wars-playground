// Store/entitlement integration and visual regressions for connected terrain/fog.
const http=require('http'),fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/hd-cosmetics');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(ROOT,'.'+(req.url.split('?')[0]==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0])));
 if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(err,body)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream');res.end(body);});
});
(async()=>{
 const relay=new WebSocketServer({port:8080});relay.on('error',()=>{});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],results={};page.on('pageerror',e=>errors.push(e.stack));
 try {
  await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
  await page.evaluate(()=>{setGameSpeed(0,true);wodDismissChangelogPopup();bootstrapMenuBackgroundBattle=async()=>{};wodPrewarmMenuBattleForSummary=()=>{};window.originalCloudCanSync=wodCloudCanSync;wodCloudCanSync=()=>false;gameData.supporterPack=false;gameData.ownedUnitSkins={nato:true};gameData.ownedShopVisuals={};gameData.uiSettings.mapSkin='default';});
  results.localPurchases=await page.evaluate(async()=>{
   gameData.gold=99;const denied=await setShopMapSkin('atlas_hd');purchaseUnitSkin('atlasUnits');
   const insufficient=!denied&&gameData.uiSettings.mapSkin==='default'&&!wodShopSkinOwned('atlasUnits')&&gameData.gold===99;
   gameData.gold=2000;await setShopMapSkin('atlas_hd');const mapOnly=gameData.gold===1500&&wodHdMapActive()&&!wodShopSkinOwned('atlasUnits');
   purchaseUnitSkin('atlasUnits');const both=gameData.gold===1000&&wodShopSkinOwned('atlasUnits');
   await setShopMapSkin('default');await setShopMapSkin('atlas_hd');purchaseUnitSkin('atlasUnits');
   const noDoubleCharge=gameData.gold===1000;updateSkinShop();
   const equipOption=[...document.querySelector('#shopSelectPlayer').options].some(o=>o.value==='atlasUnits');
   persistWodProgressNow();return{insufficient,mapOnly,both,noDoubleCharge,equipOption};
  });assert(Object.values(results.localPurchases).every(Boolean),JSON.stringify(results.localPurchases));
  results.independence=await page.evaluate(async()=>{
   const image=(map,skin,type='light')=>{gameData.uiSettings.mapSkin=map;return wodEnsureUnitBodySprite({type,owner:1,skinOverride:skin},24,'#57b3de').c.toDataURL();};
   const rows=[];for(const skin of ['nato','atlasUnits','usa','ancient','ruseGermany'])rows.push({skin,sameAcrossMaps:image('default',skin)===image('atlas_hd',skin)});
   gameData.loadedCustomMap=true;gameData._selectedMissionEntry={storeMission:true};gameData._loadedMapGamePeriod='ancient';gameData.unitSkin='atlasUnits';
   const historicalPack=getEffectiveUnitSkin({owner:1,type:'transport'})==='atlasUnits';gameData.loadedCustomMap=false;gameData._selectedMissionEntry=null;gameData.unitSkin='nato';
   return{rows,historicalPack,differentPacks:image('atlas_hd','nato')!==image('atlas_hd','atlasUnits')};
  });assert(results.independence.rows.every(r=>r.sameAcrossMaps)&&results.independence.differentPacks&&results.independence.historicalPack);
  results.cloudPurchases=await page.evaluate(async()=>{
   delete gameData.ownedShopVisuals.map_atlas_hd;gameData.uiSettings.mapSkin='default';gameData.gold=1500;wodCloudCanSync=()=>true;
   const original=wodCloudTryPurchase,requests=[];
   wodCloudTryPurchase=async req=>{requests.push(req);await new Promise(r=>setTimeout(r,30));gameData.gold-=500;gameData.ownedShopVisuals[req.itemId]=true;return true;};
   const attempts=await Promise.all([setShopMapSkin('atlas_hd'),setShopMapSkin('atlas_hd')]);
   const success=gameData.gold===1000&&requests.length===1&&attempts[0]&&!attempts[1]&&wodHdMapActive();
   delete gameData.ownedShopVisuals.map_atlas_hd;gameData.uiSettings.mapSkin='default';wodCloudTryPurchase=async()=>false;
   const rejected=!(await setShopMapSkin('atlas_hd'))&&gameData.uiSettings.mapSkin==='default'&&gameData.gold===1000;
   wodCloudTryPurchase=original;wodCloudCanSync=()=>false;
   gameData.supporterPack=true;gameData.gold=0;const supporter=await setShopMapSkin('atlas_hd');const included=!supporter&&gameData.gold===0&&!wodOwnsShopVisual('map_atlas_hd');gameData.supporterPack=false;gameData.ownedShopVisuals.map_atlas_hd=true;
   return{success,rejected,included};
  });assert(Object.values(results.cloudPurchases).every(Boolean),JSON.stringify(results.cloudPurchases));
  // Every pack retains its own body; each transport is distinct from its warship.
  results.transports=await page.evaluate(()=>{
   const skins=shopSkinMetaList().map(r=>r.id),c=document.createElement('canvas');c.width=1000;c.height=Math.ceil(skins.length/4)*150;const cx=c.getContext('2d');cx.fillStyle='#263c46';cx.fillRect(0,0,c.width,c.height);const rows=[];
   for(const [i,skin]of skins.entries()){
    const render=type=>wodEnsureUnitBodySprite({type,owner:1,skinOverride:skin},24,'#65bedb').c.toDataURL();
    rows.push({skin,distinct:render('transport')!==render('ship')});cx.save();cx.translate((i%4)*250+125,Math.floor(i/4)*150+60);wodDrawUnitBodyUncached(cx,{type:'transport',owner:1,x:0,y:0},27,'#65bedb',skin);cx.restore();cx.fillStyle='#fff';cx.font='15px sans-serif';cx.fillText(skin,(i%4)*250+65,Math.floor(i/4)*150+120);
   }window.transportSheet=c.toDataURL();return rows;
  });assert(results.transports.every(r=>r.distinct));fs.writeFileSync(path.join(OUT,'transport-packs.png'),Buffer.from((await page.evaluate(()=>window.transportSheet)).split(',')[1],'base64'));
  results.terrain=await page.evaluate(()=>{
   WOD.makeBlankMap(30);gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.bridges=[];gameData.menuAttractMode=false;
   const types=['grass','forest','hill','mountain','sand'];for(const h of gameData.hexList){h.type=types[Math.abs(Math.floor(h.q/4)+Math.floor(h.r/6))%types.length];h.owner=h.q<0?1:2;if(Math.abs(h.q-Math.floor(h.r*.60))<=1)h.type='water';}
   // Preserve an isolated lake, tiny island and a one-cell land crossing.
   gameData.hexes['-10,-5'].type='water';gameData.hexes['1,1'].type='grass';
   const sp=gameData.hexRadius*1.35,c=document.createElement('canvas');c.width=1000;c.height=1100;const cc=c.getContext('2d');wodDrawHdTerrain(cc,500,550);
   const d=cc.getImageData(100,100,800,900).data;let holes=0;for(let i=3;i<d.length;i+=4)if(d[i]!==255)holes++;
   const water=cc.getImageData(500,550,1,1).data,bridge=cc.getImageData(Math.round(500+sp),Math.round(550+sp),1,1).data;
   // Rendering into a translated editor patch must match the full bake exactly.
   const patch=document.createElement('canvas');patch.width=patch.height=300;wodDrawHdTerrain(patch.getContext('2d'),-100,-100);
   const a=cc.getImageData(600,650,300,300).data,b=patch.getContext('2d').getImageData(0,0,300,300).data;let mismatches=0,maxDelta=0,interiorMismatches=0;for(let i=0;i<a.length;i++){const delta=Math.abs(a[i]-b[i]);maxDelta=Math.max(maxDelta,delta);if(delta>2){mismatches++;const pixel=Math.floor(i/4),x=pixel%300,y=Math.floor(pixel/300);if(x>2&&x<297&&y>2&&y<297)interiorMismatches++;}}
   wodTraceCellRegion(cc,wodHdRegionGeometry().land,sp,500,550);let changedCenters=0;
   for(const h of gameData.hexList)if(cc.isPointInPath(h.x+500,h.y+550)===isWaterHex(h))changedCenters++;
   window.terrainSheet=c.toDataURL();return{holes,mismatches,maxDelta,interiorMismatches,changedCenters,waterNeutral:water[2]>water[0],landCrossing:bridge[1]>bridge[2]};
  });assert.equal(results.terrain.holes,0);assert.equal(results.terrain.changedCenters,0,'smoothing preserves every land/water cell center');assert(results.terrain.mismatches<360&&results.terrain.maxDelta<40,JSON.stringify(results.terrain));assert(results.terrain.waterNeutral&&results.terrain.landCrossing);fs.writeFileSync(path.join(OUT,'connected-terrain.png'),Buffer.from((await page.evaluate(()=>window.terrainSheet)).split(',')[1],'base64'));
  results.fog=await page.evaluate(()=>{
   const visible=new Set();for(let q=-11;q<=11;q++)for(let r=-10;r<=10;r++)if(q<Math.floor(r*.6)+4)visible.add(`${q},${r}`);
   visible.delete('-7,0');visible.delete('-7,1');const explored=new Set(visible);wodCloseTinyVisionHoles(visible,explored);
   const filled=visible.has('-7,0')&&visible.has('-7,1'),unseenPreserved=!visible.has('10,0');
   // Exercise holes and diagonal contacts in the actual shared contour painter.
   const ring=new Set();for(let q=-5;q<=5;q++)for(let r=-5;r<=5;r++)if(Math.max(Math.abs(q),Math.abs(r))>=3)ring.add(`${q},${r}`);
   const c=document.createElement('canvas');c.width=c.height=300;const cc=c.getContext('2d');wodTraceCellRegion(cc,wodCellRegionLoops(ring),20,150,150);cc.fill();const holeKept=cc.getImageData(150,150,1,1).data[3]===0,ringKept=cc.getImageData(230,150,1,1).data[3]===255;
   const diagonals=wodCellRegionLoops(new Set(['0,0','1,1']));
   gameData.fogOfWar=true;gameState='PLAYING';gameData._fogVisible=visible;gameData._fogExplored=explored;
   for(let q=0;q<7;q++)for(let r=-10;r<=10;r++)explored.add(`${q},${r}`);
   wodMarkTerrainFullDirty();WOD.setEditorSuppressTerrainBake(false);updateTerrainCache();wodRebuildFogCanvas();
   const sp=gameData.hexRadius*1.35,fc=gameData._fogCtx,alpha=(q,r)=>fc.getImageData(Math.round(q*sp-terrainBounds.minX),Math.round(r*sp-terrainBounds.minY),1,1).data[3];
   const centerClear=alpha(-7,0)===0,memoryDim=alpha(6,0)>0&&alpha(6,0)<alpha(14,0);
   window.fogSheet=gameData._fogCanvas.toDataURL();return{filled,unseenPreserved,holeKept,ringKept,diagonalIslands:diagonals.length===2,centerClear,memoryDim};
  });assert(Object.values(results.fog).every(Boolean),JSON.stringify(results.fog));fs.writeFileSync(path.join(OUT,'rounded-fog.png'),Buffer.from((await page.evaluate(()=>window.fogSheet)).split(',')[1],'base64'));
  // Real dropdowns and shop cards at phone width; then persist independent choices.
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{gameData.fogOfWar=false;gameData.gold=200;gameData.unitSkin='atlasUnits';gameData.aiUnitSkin='nato';gameData.uiSettings.mapSkin='atlas_hd';updateSkinShop();showPanel('shop');switchShopTab('troops');});
  await page.locator('#skinAtlasUnits').scrollIntoViewIfNeeded();await page.waitForTimeout(2200);await page.screenshot({path:path.join(OUT,'unit-shop-mobile.png')});
  await page.locator('[data-shop-tab="mapSkins"]').click();await page.screenshot({path:path.join(OUT,'map-shop-mobile.png')});
  await page.evaluate(()=>{persistWodProgressNow();saveUiSettings();});await page.reload();await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
  results.persistence=await page.evaluate(()=>({map:wodHdMapActive(),unit:gameData.unitSkin==='atlasUnits',ai:gameData.aiUnitSkin==='nato',mapOwned:wodOwnsShopVisual('map_atlas_hd'),unitOwned:wodShopSkinOwned('atlasUnits')}));assert(Object.values(results.persistence).every(Boolean),JSON.stringify(results.persistence));
  // Validate authoritative purchases without loading or writing actual profiles.
  const module={exports:{}},sandbox={module,exports:module.exports,require:require('module').createRequire(path.join(ROOT,'server/profiles.js')),console,__dirname:path.join(ROOT,'server'),setTimeout:()=>1,clearTimeout:()=>{}};vm.runInNewContext(fs.readFileSync(path.join(ROOT,'server/profiles.js'),'utf8'),sandbox);const profiles=module.exports,id='WOD-TEST-HDCP',p=profiles.getProfile(id);p.profile.gold=999;
  assert(profiles.shopPurchase(id,{kind:'visual',itemId:'map_atlas_hd'}).ok);assert(!profiles.shopPurchase(id,{kind:'skin',itemId:'atlasUnits'}).ok);p.profile.gold=1000;
  assert(profiles.shopPurchase(id,{kind:'skin',itemId:'atlasUnits'}).ok);assert.equal(p.profile.gold,500);assert(profiles.shopPurchase(id,{kind:'skin',itemId:'atlasUnits'}).alreadyOwned);assert.equal(p.profile.gold,500);assert.equal(profiles.validateEquippedSkin(p,'atlasUnits'),'atlasUnits');results.server=true;
  assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
 } finally {fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const s of relay.clients)s.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
