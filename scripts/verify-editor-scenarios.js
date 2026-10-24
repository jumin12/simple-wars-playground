const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/editor-scenarios');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(ROOT,'.'+(req.url.split('?')[0]==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0])));
 if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(err,body)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ogg':'audio/ogg','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream');res.end(body);});
});
(async()=>{
 const relay=new WebSocketServer({port:8080});relay.on('error',()=>{});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[],results={};page.on('pageerror',e=>errors.push(e.stack));
 try{
  await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
  results.defaults=await page.evaluate(()=>{setGameSpeed(0,true);wodDismissChangelogPopup();return{cities:gameData.layers.cities,territory:gameData.layers.territory};});assert(results.defaults.cities&&results.defaults.territory);
  results.movement=await page.evaluate(()=>{
   const rows=[];gameState='MENU';pauseMenuBackgroundBattle();gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;
   for(const type of ['light','marine','heavy','ship','convoy']) {
    WOD.makeBlankMap(40);for(const h of gameData.hexList){h.owner=1;h.type=type==='ship'?'water':'grass';}
    const u=createUnitAt(type,0,0,1);u.x=0;u.y=0;if(!Number.isFinite(u.speed))u.speed=12;u.target={x:300,y:0,pathPrepared:true};u.orderTarget={x:300,y:0};u.path=null;
    gameData.entities=[u];gameData.unitSpatialGrid=buildUnitSpatialGrid();const previous=u.speed*getUnitSpeedMultiplier(u)*.36;
    moveUnitTowardTarget(u,1);rows.push({type,ratio:Math.hypot(u.x,u.y)/previous});
   }
   openMapEditor();window.__editorDrawPositions={};const original=WOD.drawEditorUnitAtScreen;
   WOD.drawEditorUnitAtScreen=(ctx,x,y,scale,u)=>{window.__editorDrawPositions[u.uid]={x,y};return original(ctx,x,y,scale,u);};
   return rows;
  });assert(results.movement.every(r=>Math.abs(r.ratio-1.2)<.000001),JSON.stringify(results.movement));
  const fixture=await page.evaluate(()=>{
   WOD.makeBlankMap(40);for(const h of gameData.hexList){h.owner=h.q<0?1:2;if(h.q===0)h.type='water';}
   const town=(q,r,owner,id)=>{const h=gameData.hexes[`${q},${r}`];h.type='urban';h.cityId=id;return{id,name:id,owner,q,r,x:h.x,y:h.y,hp:1000,maxHp:1000,hasFactory:true,hasHarbor:false};};
   gameData.cities=[town(-10,0,1,'West'),town(10,0,2,'East')];gameData.roads=[{from:gameData.cities[0],to:gameData.cities[1]}];
   for(const [type,q,r,owner] of [['light',-14,-8,1],['heavy',-8,7,1],['marine',8,7,2],['ship',0,12,2]]){const h=gameData.hexes[`${q},${r}`],u=createUnitAt(type,h.x,h.y,owner);u.x=h.x;u.y=h.y;u.name='Authored '+type;}
   const middle=gameData.hexes['0,6'],dims=wodBridgeDefaultDims();placeBridgeAt(1,middle.x,middle.y,0,dims.w,dims.h,{editor:true});
   const fort=gameData.hexes['-6,5'];placeFortAtHex(fort,1,{editor:true,suppressNotes:true});WOD.addAlliance(1,2);
   gameData.money=4321;gameData.manpower=9876;gameData.aiMoneyByOwner={2:12345};gameData.aiManpowerByOwner={2:56789};
   wodApplyGamePeriod('ancient',{allowAnyPeriod:true,saveProfile:false});
   gameData.mission={version:1,title:'Crossing scenario',victoryMode:'annihilation',events:[
    {id:'intro',name:'Start',once:true,trigger:{type:'timer',seconds:0},popup:{title:'At once',body:'Scenario round trip',style:'briefing',kicker:'Orders'},reinforcements:[],pathOrders:[]},
    {id:'reserve',name:'Reserves',once:true,trigger:{type:'time_survived',seconds:25},popup:{title:'Reserve',body:'Incoming',style:'alert'},reinforcements:[{owner:2,type:'marine',count:3,anchor:'coords',x:200,y:200}],pathOrders:[{owner:2,scope:'reinforcements',x:-200,y:200}]},
    {id:'kills',name:'Pressure',once:false,trigger:{type:'troops_killed',count:9},popup:{title:'Advance',body:'Press on',style:'victory'},reinforcements:[],pathOrders:[{owner:2,scope:'all',x:-200,y:0}]}]};
   const data=WOD.exportMapData(),before=gameData.hexList[0].owner;data.hexList[0].owner=99;const detached=gameData.hexList[0].owner===before;data.hexList[0].owner=before;
   return{data,detached};
  });assert(fixture.detached,'export is detached from the live editor');
  await page.locator('[data-gen-tab="files"]').click();
  const importData=async data=>{await page.locator('#editorImportJsonFile').setInputFiles({name:'scenario.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await page.waitForFunction(title=>gameData.mission?.title===title,data.mission.title);};
  await importData(fixture.data);
  results.loaded=await page.evaluate(()=>({era:gameData.gamePeriod,mission:gameData.mission,units:gameData.entities.map(u=>({uid:u.uid,type:u.type,name:u.name,hp:u.hp})),money:gameData.money,mp:gameData.manpower,aiMoney:gameData.aiMoneyByOwner[2],aiMp:gameData.aiManpowerByOwner[2],forts:gameData.forts.length,bridge:isBridgeHex(gameData.hexes['0,6']),road:gameData.roads[0].from===gameData.cities[0],radius:gameData.hexRadius,layers:gameData.layers}));
  console.log('loaded',JSON.stringify(results.loaded));
  assert(results.loaded.era==='ancient'&&Math.abs(results.loaded.radius-18)<.00001&&results.loaded.bridge&&results.loaded.forts===1&&results.loaded.road);
  assert(results.loaded.money===4321&&results.loaded.mp===9876&&results.loaded.aiMoney===12345&&results.loaded.aiMp===56789);
  assert.equal(await page.locator('#editorEconomyCash').inputValue(),'4321');
  assert.equal(await page.locator('#editorEconomyMp').inputValue(),'9876');
  assert(results.loaded.mission.events[0].trigger.seconds===0&&results.loaded.mission.victoryMode==='annihilation'&&results.loaded.units.length===4&&results.loaded.layers.cities&&results.loaded.layers.territory);
  const exportFile=async(selector,name)=>{const waiting=page.waitForEvent('download');await page.locator(selector).click();const dl=await waiting,file=path.join(OUT,name);await dl.saveAs(file);return JSON.parse(fs.readFileSync(file,'utf8'));};
  const exported=await exportFile('#editorExportMission','scenario.json');assert.equal(exported.format,'simple-wars-mission');assert.deepEqual(exported.mission,results.loaded.mission);assert.equal(exported.gamePeriod,'ancient');
  // Live edits after a load cannot alter the source library/import object.
  results.alias=await page.evaluate(data=>{WOD.loadMapData(data);const before=JSON.stringify(data);gameData.cities[0].name='Changed live';gameData.entities[0].hp=1;gameData.hexList[0].owner=3;return JSON.stringify(data)===before;},fixture.data);assert(results.alias);
  await importData({...exported,mission:{...exported.mission,title:'Reloaded scenario'}});
  await page.locator('[data-tool="select"]').click();
  const selectUnit=async()=>{
   const pos=await page.evaluate(()=>{const u=gameData.entities.find(u=>u.type==='light')||gameData.entities[0],p=window.__editorDrawPositions[u.uid],cv=document.getElementById('editorCanvas'),r=cv.getBoundingClientRect();return{x:r.left+p.x*r.width/cv.width,y:r.top+p.y*r.height/cv.height};});
   await page.mouse.click(pos.x,pos.y);await page.locator('#editorDeleteUnit').waitFor({state:'visible'});
  };
  await page.waitForFunction(()=>Object.keys(window.__editorDrawPositions).length>=4);await selectUnit();await page.screenshot({path:path.join(OUT,'selected-unit-delete.png')});
  await page.setViewportSize({width:850,height:1000});await page.waitForTimeout(150);
  const mobileX=await page.locator('#editorDeleteUnit').boundingBox();assert(mobileX&&mobileX.x>=0&&mobileX.x+mobileX.width<=850,'delete control follows the responsive canvas');
  await page.screenshot({path:path.join(OUT,'selected-unit-delete-narrow.png')});await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(100);
  await page.locator('#editorDeleteUnit').click();assert.equal(await page.evaluate(()=>gameData.entities.length),3);assert(await page.locator('#editorDeleteUnit').isHidden());
  await page.locator('#editorUndoBtn').click();assert.equal(await page.evaluate(()=>gameData.entities.length),4);
  await page.locator('#editorRedoBtn').click();assert.equal(await page.evaluate(()=>gameData.entities.length),3);
  await page.locator('#editorUndoBtn').click();await selectUnit();await page.locator('#selName').focus();await page.keyboard.press('Backspace');assert.equal(await page.evaluate(()=>gameData.entities.length),4,'typing does not delete a regiment');
  await page.locator('#editorCanvas').click({position:{x:20,y:20}});await selectUnit();await page.keyboard.press('Delete');assert.equal(await page.evaluate(()=>gameData.entities.length),3);await page.locator('#editorUndoBtn').click();
  results.deletion={click:true,undo:true,redo:true,keyboard:true,inputGuard:true};
  // Title/victory settings must survive without scripted events, even without a change event.
  await importData({...exported,mission:{version:1,title:'Quiet scenario',victoryMode:'annihilation',events:[]}});
  await page.evaluate(()=>{document.getElementById('editorMissionTitle').value='Silent hold';document.getElementById('editorMissionVictoryMode').value='annihilation';});
  const quiet=await exportFile('#editorExportMission','quiet-scenario.json');assert.equal(quiet.mission.title,'Silent hold');assert.equal(quiet.mission.victoryMode,'annihilation');assert.deepEqual(quiet.mission.events,[]);
  const quietMap=await exportFile('#editorExportJson','quiet-map.json');assert.deepEqual(quietMap.mission,quiet.mission);assert(await page.evaluate(data=>wodMissionDataLooksValid(data),quiet));
  await page.locator('#editorSave').click();await page.locator('#editorSaveNewName').fill('Scenario round-trip QA');await page.locator('#editorSaveAsNewBtn').click();
  const saved=await page.evaluate(()=>wodGetSavedMapsList().find(m=>m.name==='Scenario round-trip QA'));
  assert(saved?.data.mission.title==='Silent hold'&&saved.data.gamePeriod==='ancient'&&saved.data.money===4321);
  await page.evaluate(()=>{gameData.mission.title='Unsaved live change';gameData.entities[0].hp=5;});
  await page.locator(`#mapBrowser .map-card[data-map-id="${saved.id}"]`).click();await page.waitForFunction(()=>gameData.mission?.title==='Silent hold');
  assert.equal(await page.evaluate(()=>gameData.entities[0].hp),saved.data.entities[0].hp);results.library={saved:true,reloaded:true};
  await importData(quiet);const beforeInvalid=await page.evaluate(()=>JSON.stringify(WOD.exportMapData()));const dialog=page.waitForEvent('dialog').then(d=>d.accept());
  await page.locator('#editorImportJsonFile').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{"mission":{}}')});await dialog;
  assert.equal(await page.evaluate(()=>JSON.stringify(WOD.exportMapData())),beforeInvalid,'invalid import preserves the edited scenario');
  // New blank clears prior mission state; undo restores scenario metadata.
  await page.locator('#editorBlank').click();assert(await page.evaluate(()=>gameData.mission?.events.length===0&&!gameData.mission?.title&&gameData.entities.length===0));
  await importData(exported);
  results.play=await page.evaluate(async data=>{
   closeMapEditor();pauseMenuBackgroundBattle();gameState='PLAYING';WOD.loadMapData(data);gameData.alliances=[];gameData._launchingMission=true;gameData._selectedMissionEntry={id:'test-scenario'};await initGame();
   gameState='PLAYING';setGameSpeed(0,true);const before={money:gameData.money,mp:gameData.manpower,victory:gameData.victoryMode,units:gameData.entities.length,era:gameData.gamePeriod};
   wodUpdateMissionEvents(0.01);return{...before,popup:!!gameData._missionRuntime?.popupOpen,fired:gameData._missionRuntime?.fired.has('intro')};
  },exported);assert(results.play.money===4321&&results.play.mp===9876&&results.play.victory==='annihilation'&&results.play.era==='ancient'&&results.play.popup&&results.play.fired,'scenario starts with authored economy, era, victory and a zero-second intro');
  fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));assert.equal(errors.length,0,errors.join('\n'));
 }finally{fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const s of relay.clients)s.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
