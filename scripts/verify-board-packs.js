'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),vm=require('vm'),assert=require('assert/strict'),{spawn}=require('child_process');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws'),catalog=require('../store-catalog');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/board-packs');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(ROOT,'.'+(req.url.split('?')[0]==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0])));if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,b)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ogg':'audio/ogg','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream');res.end(b);});});
(async()=>{
 const relay=new WebSocketServer({port:8080});relay.on('error',()=>{});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],results={};page.on('pageerror',e=>errors.push(e.stack));
 try{
  const url='http://127.0.0.1:'+server.address().port;
  await page.goto(url+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
  await page.evaluate(()=>{setGameSpeed(0,true);wodDismissChangelogPopup();wodCloudCanSync=()=>false;gameData.ownedShopVisuals={};gameData.gold=100;gameData.uiSettings.mapSkin='default';showPanel('shop');switchShopTab('mapSkins');});
  for(const id of ['chalkboard','whiteboard']){
   const before=await page.evaluate(()=>gameData.gold);await page.locator('[data-map-skin="'+id+'"]').click();await page.waitForSelector('.board-pack-dialog[open]');
   assert.equal(await page.evaluate(()=>gameData.gold),before,'Preview must not spend gold');assert.equal(await page.evaluate(()=>gameData.uiSettings.mapSkin),'default');
   await page.locator('.board-pack-equip').click();assert.equal(await page.evaluate(()=>gameData.gold),before,'Insufficient funds must not deduct');assert.equal(await page.evaluate(()=>gameData.uiSettings.mapSkin),'default');
   results[id]={eraHashes:[]};
   for(const era of ['ancient','medieval','napoleonic','modern']){
    await page.locator('#boardPackEra').selectOption(era);await page.waitForFunction(key=>document.querySelector('.board-pack-scene').dataset.previewReady===key,id+'-'+era);const data=await page.locator('.board-pack-roster').evaluate(c=>c.toDataURL());const hash=require('crypto').createHash('sha256').update(data).digest('hex');results[id].eraHashes.push(hash);
    if(era==='ancient'||era==='modern')await page.screenshot({path:path.join(OUT,id+'-preview-'+era+'.png')});
   }
   assert.equal(new Set(results[id].eraHashes).size,4,'Each era needs distinct art');
   await page.keyboard.press('Escape');await page.waitForSelector('.board-pack-dialog',{state:'detached'});assert(await page.locator('[data-map-skin="'+id+'"]').evaluate(el=>el===document.activeElement));
  }
  await page.screenshot({path:path.join(OUT,'map-shop-desktop.png')});
  await page.locator('[data-map-skin="chalkboard"]').click();await page.evaluate(()=>{gameData.gold=5000;});await page.locator('.board-pack-equip').click();
  await page.waitForFunction(()=>gameData.uiSettings.mapSkin==='chalkboard');assert.equal(await page.evaluate(()=>gameData.gold),2500);assert.equal(await page.locator('.board-pack-equip').innerText(),'Equipped');await page.keyboard.press('Escape');
  await page.locator('[data-map-skin="whiteboard"]').click();await page.locator('.board-pack-equip').click();await page.waitForFunction(()=>gameData.uiSettings.mapSkin==='whiteboard');assert.equal(await page.evaluate(()=>gameData.gold),0);await page.keyboard.press('Escape');
  await page.locator('[data-map-skin="chalkboard"]').click();await page.locator('.board-pack-equip').click();assert.equal(await page.evaluate(()=>gameData.gold),0,'Owned packs are free to equip');await page.keyboard.press('Escape');
  results.purchase=true;
  results.unified=[];
  for(const id of ['default','atlas_hd']){
   await page.locator('[data-map-skin="'+id+'"]').click();assert.equal(await page.locator('#boardPackTitle').innerText(),id==='default'?'Default':'Atlas HD');
   for(const era of ['ancient','medieval','napoleonic','modern']){await page.locator('#boardPackEra').selectOption(era);await page.waitForFunction(key=>document.querySelector('.board-pack-scene').dataset.previewReady===key,id+'-'+era);if(era==='modern'||era==='ancient')await page.screenshot({path:path.join(OUT,id+'-preview-'+era+'.png')});}
   results.unified.push(id);await page.keyboard.press('Escape');await page.waitForSelector('.board-pack-dialog',{state:'detached'});
  }
  assert(await page.evaluate(()=>!document.getElementById('skinAtlasUnits')&&!shopSkinMetaList().some(s=>s.id==='atlasUnits')&&!gameData._artPreviewMapId&&!gameData._artPreviewPeriod));
  results.screenshots=await page.evaluate(async()=>{
   const manifest=await (await fetch('skins/map-packs/capture.json')).json(),rows=[];
   for(const {file}of manifest.images){const r=await fetch('skins/map-packs/'+file);if(!r.ok)throw Error('Screenshot missing '+file);const img=new Image();img.src='skins/map-packs/'+file;await img.decode();rows.push({file,width:img.naturalWidth,height:img.naturalHeight});}
   return{kind:manifest.kind,hash:manifest.geometryHash,cells:manifest.cells,rows};
  });assert.equal(results.screenshots.rows.length,16);assert(results.screenshots.cells>1000&&results.screenshots.rows.every(r=>r.width===1280&&r.height===720));
  results.legacy=await page.evaluate(async()=>{gameData.ownedUnitSkins.atlasUnits=true;const before=gameData.gold;const ok=await setShopMapSkin('atlas_hd');const same=gameData.gold===before,units=[1,2].every(owner=>getEffectiveUnitSkin({type:'heavy',owner})==='atlasUnits');delete gameData.ownedUnitSkins.atlasUnits;gameData.ownedShopVisuals.map_atlas_hd=true;return{ok,same,units};});assert(Object.values(results.legacy).every(Boolean));
  // Compare both actual render paths, all eras/classes, safe ownership, and cache reuse.
  results.rendering=await page.evaluate(async()=>{
   gameData.ownedUnitSkins.napoleonic=true;gameData.ownedUnitSkins.medieval=true;gameData.ownedUnitSkins.ancient=true;
   const rows=[];
   for(const id of ['chalkboard','whiteboard','atlas_hd','default'])for(const period of ['ancient','medieval','napoleonic','modern']){
    gameData.gamePeriod=period;gameData._matchPeriod=period;gameData.unitSkin=period==='modern'?'nato':period;gameData.aiUnitSkin=gameData.unitSkin;await setShopMapSkin(id);const cv=document.createElement('canvas');cv.width=1000;cv.height=230;const ctx=cv.getContext('2d');ctx.fillStyle=WodBoardArt.palette(id).surface;ctx.fillRect(0,0,1000,230);
    const types=['light','motorized','mountaineer','marine','heavy','ship','transport','supply','convoy'];const skins=[];
    for(let i=0;i<types.length;i++){const u={type:types[i],owner:i%2+1,x:0,y:0,hp:100,maxHp:100};ctx.save();ctx.translate(55+i*110,100);drawUnitSkin(ctx,u,29,i%2?'#dc765f':'#4ba0a5');ctx.restore();skins.push(getEffectiveUnitSkin(u));const a=wodEnsureUnitBodySprite(u,29,'#4ba0a5'),b=wodEnsureUnitBodySprite(u,29,'#4ba0a5');if(a!==b)throw Error('Sprite cache missed');}
    rows.push({id,period,skins,data:cv.toDataURL()});
   }
   await setShopMapSkin('default');const restored=getEffectiveUnitSkin({type:'light',owner:1})===gameData.unitSkin;await setShopMapSkin('whiteboard');const shop=getEffectiveUnitSkin({type:'light',owner:1,skinOverride:'nato',_skinPreview:true})==='nato';return{rows,restored,shop};
  });assert(results.rendering.restored&&results.rendering.shop);
  for(const row of results.rendering.rows){const expected=row.id==='atlas_hd'?'atlasUnits':row.id==='default'?(row.period==='modern'?'nato':row.period):'board_'+row.id;assert(row.skins.every(s=>s===expected));fs.writeFileSync(path.join(OUT,row.id+'-actual-roster-'+row.period+'.png'),Buffer.from(row.data.split(',')[1],'base64'));delete row.data;}
  // Build a small controlled world for screenshot review of real terrain, borders, structures and routes.
  await page.evaluate(()=>{
   cancelAnimationFrame(animationFrameId);WOD.makeBlankMap(16);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData.fogOfWar=false;gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.roads=[];gameData.gamePeriod='modern';gameData._matchReadyForEndChecks=false;
   for(const h of gameData.hexList){h.type=h.r<-6?'water':h.q>8?'mountain':h.q<-8&&h.r>2?'forest':h.r>8?'hill':h.q>5&&h.r<0?'sand':'grass';h.owner=isWaterHex(h)?0:h.q>1?2:1;}
   const city=(q,r,owner,name)=>{const h=gameData.hexes[q+','+r];h.type='urban';const c={q,r,x:h.x,y:h.y,owner,id:name,name,hp:1000,maxHp:1000,hasFactory:true,hasHarbor:true};gameData.cities.push(c);return c;};city(-8,-2,1,'Slateford');city(7,5,2,'Ridgewatch');
   gameData.forts=[{x:gameData.hexes['-3,7'].x,y:gameData.hexes['-3,7'].y,owner:1}];gameData.hospitals=[{x:gameData.hexes['-7,5'].x,y:gameData.hexes['-7,5'].y,owner:1}];
   for(const [i,type]of ['light','motorized','mountaineer','marine','heavy','ship','transport','supply','convoy'].entries()){const q=-6+i*1.6,h=gameData.hexes[Math.round(q)+','+(i>4?-9:1)];const u=createUnitAt(type,h.x,h.y,i===2?2:1,{startSpawn:true});u.radius=17;u.isGeneral=type==='heavy';if(i<2){u.selected=true;u.target={x:h.x+110,y:h.y-20};u.orderTarget={...u.target};u.path=[gameData.hexes[(h.q+4)+','+(h.r-1)]];}}
   gameData.layers={terrain:true,diplomacy:true,territory:false,cities:true,cityNames:true,units:true,structures:true};gameData.camera.zoom=1;const w=canvas.clientWidth,h=canvas.clientHeight;gameData.camera.x=-w/2;gameData.camera.y=-h/2;gameData._unitSpriteCache=new Map();
   UI.panels.forEach(el=>el.classList.add('hidden'));UI.mainMenu.classList.add('hidden');document.getElementById('inGameUI').classList.remove('hidden');wodMarkTerrainFullDirty();updateTerrainCache();draw();
  });
  for(const id of ['chalkboard','whiteboard']){await page.evaluate(async id=>{await setShopMapSkin(id);draw();},id);await page.screenshot({path:path.join(OUT,id+'-gameplay.png')});}
  results.terrain=await page.evaluate(()=>['chalkboard','whiteboard'].map(id=>{const full=document.createElement('canvas'),patch=document.createElement('canvas');full.width=full.height=1000;patch.width=patch.height=200;const a=full.getContext('2d'),b=patch.getContext('2d'),sp=gameData.hexRadius*1.35,geo=wodHdRegionGeometry();WodBoardArt.terrain(a,id,gameData.hexList,geo,wodTraceCellRegion,sp,500,500);WodBoardArt.terrain(b,id,gameData.hexList,geo,wodTraceCellRegion,sp,-100,-100);const aa=a.getImageData(600,600,200,200).data,bb=b.getImageData(0,0,200,200).data;let max=0,holes=0,changed=0;for(let y=3;y<197;y++)for(let x=3;x<197;x++)for(let ch=0;ch<4;ch++){const i=(y*200+x)*4+ch,delta=Math.abs(aa[i]-bb[i]);max=Math.max(max,delta);if(delta>3)changed++;if(ch===3&&bb[i]<255)holes++;}return{id,max,holes,changed};}));assert(results.terrain.every(t=>t.holes===0&&t.changed<500),JSON.stringify(results.terrain));
  // Mobile preview remains within the viewport; roster scrolls inside its own region.
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{showPanel('shop');switchShopTab('mapSkins');});await page.screenshot({path:path.join(OUT,'map-shop-mobile.png')});await page.locator('[data-map-skin="whiteboard"]').click();
  results.mobile=await page.evaluate(()=>{const d=document.querySelector('.board-pack-dialog'),r=d.getBoundingClientRect(),wrap=d.querySelector('.board-pack-roster-wrap');return{fits:r.left>=0&&r.right<=innerWidth&&d.scrollWidth<=d.clientWidth+1,scroll:wrap.scrollWidth>wrap.clientWidth,close:d.querySelector('button').getBoundingClientRect().height>=44,rect:{left:r.left,right:r.right,screen:innerWidth,scrollWidth:d.scrollWidth,clientWidth:d.clientWidth}};});await page.screenshot({path:path.join(OUT,'preview-mobile.png')});assert(results.mobile.fits&&results.mobile.scroll&&results.mobile.close,JSON.stringify(results.mobile));await page.keyboard.press('Escape');
  await page.evaluate(()=>{saveUiSettings();persistWodProgressNow();});await page.reload();await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameData.uiSettings,null,{timeout:180000});
  results.persist=await page.evaluate(()=>({skin:gameData.uiSettings.mapSkin,owned:wodOwnsShopVisual('map_chalkboard')&&wodOwnsShopVisual('map_whiteboard'),active:wodBoardMapActive(),gold:gameData.gold}));assert.equal(results.persist.skin,'whiteboard');assert(results.persist.owned);assert.equal(results.persist.active,'whiteboard');assert.equal(results.persist.gold,0);
  const mod={exports:{}},sandbox={module:mod,exports:mod.exports,require:require('module').createRequire(path.join(ROOT,'server/profiles.js')),console,__dirname:path.join(ROOT,'server'),setTimeout:()=>1,clearTimeout:()=>{}};vm.runInNewContext(fs.readFileSync(path.join(ROOT,'server/profiles.js'),'utf8'),sandbox);const profiles=mod.exports,id='WOD-BORD-TEST',p=profiles.getProfile(id);p.profile.gold=2499;assert(!profiles.shopPurchase(id,{kind:'visual',itemId:'map_chalkboard'}).ok);assert.equal(p.profile.gold,2499);p.profile.gold=5000;
  for(const pack of ['map_chalkboard','map_whiteboard']){assert.equal(catalog.shopItems({kind:'visual',itemId:pack,price:1})[0].price,2500);assert(profiles.shopPurchase(id,{kind:'visual',itemId:pack}).ok);assert(profiles.shopPurchase(id,{kind:'visual',itemId:pack}).alreadyOwned);}assert.equal(p.profile.gold,0);results.server=true;
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({...results,rendering:{...results.rendering,rows:results.rendering.rows.length}},null,2));
  const skill=path.join(require('os').homedir(),'.codex/skills/develop-web-game'),client=path.join(OUT,'client.mjs');fs.copyFileSync(path.join(skill,'scripts/web_game_playwright_client.js'),client);await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[client,'--url',url+'/?autostart=1','--actions-file',path.join(skill,'references/action_payloads.json'),'--iterations','1','--pause-ms','500','--screenshot-dir',path.join(OUT,'skill')],{stdio:'inherit'});child.on('exit',code=>code?reject(Error('skill client '+code)):resolve());});
 }finally{fs.writeFileSync(path.join(OUT,'partial.json'),JSON.stringify(results,null,2));fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const s of relay.clients)s.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
