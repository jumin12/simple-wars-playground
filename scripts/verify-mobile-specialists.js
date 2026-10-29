'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/mobile-specialists');
fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{const f=path.resolve(ROOT,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(ROOT+path.sep))return res.writeHead(403).end();fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[path.extname(f)]||'application/octet-stream');res.end(b);});});
(async()=>{
 const relay=new WebSocketServer({port:8080});relay.on('error',()=>{});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2}),errors=[],results={};
 page.on('pageerror',e=>errors.push(e.stack));
 const capture=async options=>{await page.evaluate(()=>{document.querySelectorAll('.wod-toast-note').forEach(e=>e.remove());if(gameState==='PLAYING'){wodSyncViewportAndCanvas();draw();}});await page.screenshot(options);};
 try{
  await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');
  await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks&&!window._wodBootBusy&&!window._wodMenuBootstrapBusy,null,{timeout:180000});
  await page.evaluate(()=>{setGameSpeed(0,true);wodDismissChangelogPopup();pauseMenuBackgroundBattle();gameState='MENU';bootstrapMenuBackgroundBattle=async()=>{};wodCloudCanSync=()=>false;gameData.gold=10000;gameData.ownedUnitSkins={nato:true,ancient:true,medieval:true,napoleonic:true,atlasUnits:true};showPanel('shop');});
  // Both independent skin pickers and all era names drive all eight previews.
  await page.locator('#shopSkinTriggerPlayer').tap();await page.locator('#shopSkinMenuPlayer button').filter({hasText:/Ancient/}).first().tap();
  await page.locator('#shopSkinTriggerAi').tap();await page.locator('#shopSkinMenuAi button').filter({hasText:/Medieval/}).first().tap();
  assert.deepEqual(await page.evaluate(()=>[gameData.unitSkin,gameData.aiUnitSkin]),['ancient','medieval']);
  results.eras=[];
  for(const era of ['ancient','medieval','napoleonic','modern']){
   await page.locator('#shopGamePeriod').selectOption(era);await page.waitForTimeout(80);
   const row=await page.evaluate(()=>wodShopUnitPreviewEntries().map(([id,type])=>{const c=document.getElementById(id),data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let hash=0;for(let i=0;i<data.length;i+=4)hash=(Math.imul(hash,31)+data[i]*3+data[i+1]*5+data[i+2]*7)|0;return{id,type,label:c.nextElementSibling.textContent,hash,aria:c.getAttribute('aria-label')};}));
   assert.equal(row.length,16);assert.equal(new Set(row.map(r=>r.id)).size,16);
   const names={ancient:['Cavalry','Skirmishers'],medieval:['Mounted men-at-arms','Rangers'],napoleonic:['Dragoons','Chasseurs'],modern:['Motorized infantry','Mountaineers']}[era];
   for(const prefix of ['shopPv','shopAi']){assert.equal(row.find(r=>r.id===prefix+'Motorized').label,names[0]);assert.equal(row.find(r=>r.id===prefix+'Mountaineer').label,names[1]);assert.equal(new Set(row.filter(r=>r.id.startsWith(prefix)).map(r=>r.hash)).size,8,'all eight class silhouettes are distinct');}
   results.eras.push({era,rows:row});await page.locator('.shop-preview-card').first().scrollIntoViewIfNeeded();await capture({path:path.join(OUT,'shop-'+era+'.png')});
  }
  results.shopLayouts=[];
  for(const size of [{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:844,height:390},{width:1440,height:900}]){
   await page.setViewportSize(size);await page.waitForTimeout(100);
   for(const tab of ['troops','missions','mapSkins','command']){
    await page.locator(`[data-shop-tab="${tab}"]`).click();await page.waitForTimeout(80);
    if(tab==='missions')await page.waitForFunction(()=>document.querySelectorAll('#shopMapOptions .shop-mission-card').length>0);
    const r=await page.evaluate(()=>{const p=document.querySelector('#shopPanel .shop-tab-pane.active'),b=p.getBoundingClientRect();return{pageWidth:document.documentElement.scrollWidth,innerWidth,body:p.scrollWidth,width:p.clientWidth,height:b.height,controls:[...document.querySelectorAll('#shopPanel .shop-tab')].map(e=>e.getBoundingClientRect().height)};});
    assert(r.pageWidth<=size.width+1&&r.body<=r.width+2&&r.height>95,JSON.stringify({size,tab,r}));assert(r.controls.every(h=>h>=43),JSON.stringify({size,tab,r}));results.shopLayouts.push({size,tab,...r});
   }
   await page.locator('[data-shop-tab="troops"]').click();await page.locator('.shop-preview-card').first().scrollIntoViewIfNeeded();await capture({path:path.join(OUT,`shop-${size.width}.png`)});
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{
   document.querySelectorAll('.overlay').forEach(e=>e.classList.add('hidden'));UI.canvas.style.display='block';WOD.makeBlankMap(40);gameState='PLAYING';gameData.mp=null;gameData.menuAttractMode=false;gameData._campaignRun=null;gameData._selectedMissionEntry=null;gameData.mission=null;gameData._matchReadyForEndChecks=false;gameData._matchPeriod=gameData.gamePeriod='modern';gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.encircledHexes=new Set();gameData.encircledReliefHexes=new Set();gameData._cityCombatStagingKeys=new Set();gameData.cityCombatBlockForProd=new Set();gameData.aiTimer=gameData.aiStrategyTimer=gameData.convoyTimer=-1e6;gameData.money=1e6;gameData.manpower=1e6;
   for(const h of gameData.hexList){h.owner=h.q<0?1:2;h.cityId=null;h.type=h.q>=4&&h.q<=7?'water':'grass';h.baseColor=getTerrainColor(h.type);}
   for(const [q,owner]of[[-18,1],[18,2]]){const h=gameData.hexes[`${q},0`];h.type='urban';h.cityId='Town'+owner;gameData.cities.push({id:h.cityId,name:h.cityId,owner,q,r:0,x:h.x,y:h.y,hasFactory:true,hasHarbor:false});}
   window.mobileTestUnits=['motorized','mountaineer','light','transport','supply'].map((t,i)=>{const u=createUnitAt(t,i<3?-81+i*54:135,i<3?0:(i-3)*81,1);u.x=i<3?-81+i*54:135;u.y=i<3?0:(i-3)*81;return u;});
   const enemy=createUnitAt('light',-135,-135,2);enemy.x=-135;enemy.y=-135;gameData.unitSpatialGrid=buildUnitSpatialGrid();gameData.controlGroups={};gameData.selection=[mobileTestUnits[0]];mobileTestUnits[0].selected=true;UI.inGameUI.style.display='flex';wodSyncViewportAndCanvas();gameData.camera={zoom:1,x:-canvas.clientWidth/2,y:-canvas.clientHeight*.24};gameData.layers.territory=true;gameData.layers.cities=true;wodApplyPeriodUiLabels();syncInfoCardPanel();wodRefreshCommandHud(true);wodMarkTerrainFullDirty();updateTerrainCache();draw();
  });
  await page.locator('[data-save-control-group]').tap();assert.equal(await page.evaluate(()=>gameData.controlGroups[1].length),1);
  await page.evaluate(()=>deselectAllSelection());await page.locator('[data-control-group="1"]').tap();assert.equal(await page.evaluate(()=>gameData.selection[0].type),'motorized');
  await capture({path:path.join(OUT,'unit-390.png')});
  await page.locator('#infoKpiTerrainBtn').tap();await page.locator('.info-terrain-entry').last().scrollIntoViewIfNeeded();await capture({path:path.join(OUT,'terrain-390.png')});
  assert((await page.locator('#infoTerrainEffectsMount').textContent()).includes('Motorized infantry'));
  await page.locator('#infoCardPage2 .info-stats-back').click();await page.locator('[data-mo="stats"]').tap();assert(await page.locator('#infoCardPage1').isVisible());await page.locator('#infoCardPage1 .info-stats-back').tap();
  // Every unit remains selectable; six/seven-button transport rows wrap rather than shrinking.
  results.units=[];
  for(const type of ['motorized','mountaineer','transport','supply']){
   await page.evaluate(type=>{gameData.selection.forEach(u=>u.selected=false);const u=mobileTestUnits.find(u=>u.type===type);u.selected=true;gameData.selection=[u];_infoCardUiThrottle.s=null;syncInfoCardPanel();},type);
   const row=await page.locator('#infoCard .info-order-btn:visible').evaluateAll(es=>es.map(e=>({text:e.textContent.trim(),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})));
   assert(row.every(r=>r.width>=43&&r.height>=43),JSON.stringify({type,row}));results.units.push({type,row});await capture({path:path.join(OUT,`unit-${type}.png`)});
  }
  results.recruitment=[];
  for(const size of[{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:768,height:1024}]){
   await page.setViewportSize(size);await page.locator('[data-wod-mtab="units"]').click();
   const rows=await page.locator('#buildUnitsBarMobile [data-production-mode]').evaluateAll(es=>es.map(e=>({mode:e.dataset.productionMode,name:e.querySelector('strong').textContent,cost:e.querySelector('.production-cost').textContent,meta:e.querySelector('small').textContent,clipped:e.scrollWidth>e.clientWidth+1,height:e.getBoundingClientRect().height})));
   assert.equal(rows.length,8);assert(rows.every(r=>!r.clipped&&r.height>=76));assert(rows.some(r=>r.mode==='motorized'&&r.cost==='$3k · 2.4k MP'&&r.meta==='23s · Factory'));
   await page.locator('#buildUnitsBarMobile [data-production-mode="supply"]').scrollIntoViewIfNeeded();
   const bounds=await page.locator('#buildUnitsBarMobile [data-production-mode="supply"]').boundingBox(),dock=await page.locator('.wod-m-dock').first().boundingBox();assert(bounds.y+bounds.height<=dock.y+1,'last recruitment card scrolls above dock');
   await page.locator('#buildUnitsBarMobile [data-production-mode="motorized"]').scrollIntoViewIfNeeded();await capture({path:path.join(OUT,`recruit-${size.width}.png`)});
   results.recruitment.push({size,rows});await page.locator('[data-wod-mtab="units"]').click();
  }
  // The real touch recruit control opens valid town placement, then queues exactly one job.
  await page.setViewportSize({width:390,height:844});await page.locator('[data-wod-mtab="units"]').tap();await page.locator('#buildUnitsBarMobile [data-production-mode="motorized"]').tap();
  assert.equal(await page.evaluate(()=>gameData.buildMode),'motorized');
  const cityPoint=await page.evaluate(()=>{const c=gameData.cities.find(c=>c.owner===1);gameData.camera.x=c.x-canvas.clientWidth/2;gameData.camera.y=c.y-canvas.clientHeight*.3;draw();const r=canvas.getBoundingClientRect();return{x:r.left+c.x-gameData.camera.x,y:r.top+c.y-gameData.camera.y};});await page.touchscreen.tap(cityPoint.x,cityPoint.y);
  await page.waitForFunction(()=>gameData.constructionJobs.some(j=>j.mode==='motorized'&&j.owner===1));
  await page.locator('[data-wod-mtab="build"]').tap();
  assert.equal(await page.locator('.wod-m-sheet--build [data-production-mode]').count(),5);await capture({path:path.join(OUT,'structures-390.png')});await page.locator('[data-wod-mtab="build"]').tap();
  results.stats=[];
  for(const size of[{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:768,height:1024}]){
   await page.setViewportSize(size);await page.locator('[data-wod-mtab="intel"]').click();
   for(const tab of['economy','forces','combat','players']){
    await page.locator(`#statsMenu button[data-stats-page="${tab}"]`).click();
    const r=await page.evaluate(()=>{const p=document.querySelector('#statsMenu .stats-m-pages');return{height:p.clientHeight,width:p.clientWidth,scrollWidth:p.scrollWidth,tab:document.querySelector('#statsMenu .stats-m-tab.active')?.textContent};});
    assert(r.height>=95&&r.scrollWidth<=r.width+1,JSON.stringify({size,tab,r}));results.stats.push({size,tab,...r});
    await capture({path:path.join(OUT,`stats-${tab}-${size.width}.png`)});
   }
   await page.locator('#statsMenu .report-close').click();
  }
  results.state=JSON.parse(await page.evaluate(()=>render_game_to_text()));
  await page.evaluate(()=>{gameState='MENU';pauseMenuBackgroundBattle();showPanel('campaign');wodRogueBegin();const c=wodRogueLoad();c.points=50000;wodRogueRosterAdd('motorized');wodRogueRosterAdd('mountaineer');c.roster[0].name='The very long specialist regiment of the northern mountains';c.roster[0].nameCustom=true;wodRogueSave();wodRefreshCampaignPanel();document.querySelectorAll('.wod-toast-note').forEach(e=>e.remove());});
  results.campaign=[];
  for(const size of[{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(size);await page.locator('#wodCampShop').scrollIntoViewIfNeeded();
   const r=await page.locator('#wodCampShop button').evaluateAll(es=>es.map(e=>({text:e.textContent,height:e.getBoundingClientRect().height,clipped:e.scrollWidth>e.clientWidth+1})));
   assert.equal(r.length,8);assert(r.every(b=>b.height>=57&&!b.clipped),JSON.stringify({size,r}));results.campaign.push({size,rows:r});await capture({path:path.join(OUT,`campaign-${size.width}.png`)});
  }
  await page.setViewportSize({width:390,height:844});
  const rosterBefore=await page.evaluate(()=>wodRogueLoad().roster.length);await page.locator('#wodCampShop button').filter({hasText:'Mountaineers'}).tap();assert.equal(await page.evaluate(()=>wodRogueLoad().roster.length),rosterBefore+1);
  const del=page.locator('#wodCampRoster [data-camp-del]').first();await del.scrollIntoViewIfNeeded();assert((await del.boundingBox()).height>=44);await capture({path:path.join(OUT,'roster-390.png')});
  await page.evaluate(()=>openMapEditor());await page.locator('#editorUnitPalette').waitFor({state:'visible'});
  results.editor=[];
  for(const size of[{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(size);await page.locator('#editorUnitPalette [data-unit-type="motorized"]').scrollIntoViewIfNeeded();
   const r=await page.locator('#editorUnitPalette [data-unit-type]').evaluateAll(es=>es.map(e=>({type:e.dataset.unitType,height:e.getBoundingClientRect().height,clipped:e.scrollWidth>e.clientWidth+1})));
   assert.equal(r.length,8);assert(r.every(e=>e.height>=88&&!e.clipped));results.editor.push({size,rows:r});await capture({path:path.join(OUT,`editor-${size.width}.png`)});
  }
  await page.setViewportSize({width:390,height:844});await page.locator('#editorUnitPalette [data-unit-type="mountaineer"]').tap();assert.equal(await page.locator('#editorPlaceUnitType').inputValue(),'mountaineer');assert(await page.locator('[data-tool="unit"]').evaluate(e=>e.classList.contains('active')));
  const editorBefore=await page.evaluate(()=>gameData.entities.length);await page.locator('#editorCanvas').scrollIntoViewIfNeeded();const editBounds=await page.locator('#editorCanvas').boundingBox();await page.touchscreen.tap(editBounds.x+editBounds.width*.4,editBounds.y+editBounds.height*.35);await page.waitForFunction(n=>gameData.entities.length===n+1,editorBefore);assert.equal(await page.evaluate(()=>gameData.entities.at(-1).type),'mountaineer');
  await page.evaluate(()=>{closeMapEditor();gameState='MENU';gameData._campaignRun=null;});results.menus=[];
  for(const size of[{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(size);
   for(const panel of['settings','helpGuide','achievements']){
    await page.evaluate(panel=>showPanel(panel),panel);if(panel==='achievements')await page.locator('#achTabBtnStats').click();
    const r=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));assert(r.width<=r.viewport+1,JSON.stringify({size,panel,r}));results.menus.push({size,panel,...r});if(size.width===390)await capture({path:path.join(OUT,panel+'-390.png')});
    if(panel==='settings'){const fits=await page.locator('#settingsPanel .settings-section .menu-btn').evaluateAll(es=>es.map(e=>({text:e.textContent,width:e.getBoundingClientRect().width,parent:e.parentElement.clientWidth})));assert(fits.every(r=>r.width<=r.parent+1),'nested settings buttons fit their cards: '+JSON.stringify({size,fits}));}
   }
  }
  assert.equal(errors.length,0,errors.join('\n'));
  fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify({eras:results.eras.length,shopLayouts:results.shopLayouts.length,unitTypes:results.units.length,recruitmentLayouts:results.recruitment.length,reportPages:results.stats.length,campaignLayouts:results.campaign.length,editorLayouts:results.editor.length,errors}));
 }finally{fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const c of relay.clients)c.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
