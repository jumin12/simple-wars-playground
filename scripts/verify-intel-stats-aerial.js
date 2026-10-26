const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/intel-stats-aerial');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(ROOT,'.'+(req.url.split('?')[0]==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0])));if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,body)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.json':'application/json','.png':'image/png','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream');res.end(body);});});
(async()=>{
 const relay=new WebSocketServer({port:8080});relay.on('error',()=>{});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],results={};page.on('pageerror',e=>errors.push(e.stack));
 try {
  await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
  await page.evaluate(()=>{
   setGameSpeed(0,true);wodDismissChangelogPopup();gameData.ownedShopVisuals={...gameData.ownedShopVisuals,map_atlas_hd:true};
   window.intelFixture=()=>{
    WOD.makeBlankMap(30);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.bridges=[];gameData.constructionJobs=[];gameData._factionIntel=null;gameData._fogVisible=null;gameData._fogExplored=null;gameData._fogCanvasDirty=true;gameData._battleLedger=null;gameData._matchReadyForEndChecks=false;gameData.aiTaskForces={};gameData._aiDefenseByOwner={};gameData._aiContactByOwner={};gameData.alliances=[];gameData.aiStrategySerial=1;
    for(const h of gameData.hexList){h.type='grass';h.cityId=null;h.owner=h.q<0?1:2;}
    gameData.money=12000;gameData.manpower=7000;gameData.aiMoneyByOwner={2:18000};gameData.aiManpowerByOwner={2:9000};gameData.fogOfWar=true;gameData._landIncomeCacheDirty=true;
    const town=(q,r,owner,id)=>{const h=gameData.hexes[`${q},${r}`];h.type='urban';h.cityId=id;const c={id,name:id,owner,q,r,x:h.x,y:h.y,hp:1000,maxHp:1000};gameData.cities.push(c);return c;};
    town(-15,0,1,'Westhaven');town(15,0,2,'Eastwatch');
    const add=(type,q,r,owner)=>{const h=gameData.hexes[`${q},${r}`];return createUnitAt(type,h.x,h.y,owner,{startSpawn:true});};
    window.testScout=add('light',-2,0,1);window.testHidden=add('heavy',15,2,2);window.testInvader=add('light',-15,7,1);
    for(let i=0;i<12;i++)add(i===11?'heavy':'light',3+(i%4)*2,6+Math.floor(i/4)*3,2);
    gameData.unitSpatialGrid=buildUnitSpatialGrid(96);wodInvalidateAiFrontlineHexCache();wodRefreshFogVision(1,true);
   };
   intelFixture();
  });
  results.fog=await page.evaluate(()=>{
   const owner1=wodFogFactionIntel(1,true),owner2=wodFogFactionIntel(2,true),h=gameData.hexes['3,0'];
   const initial={edge:owner1.visible.has('1,0'),scoutRadius:owner1.visible.has('3,0'),beyond:owner1.visible.has('4,0'),hiddenUnit:!wodFogCanSeeUnit(testHidden),hiddenTown:!wodAiKnownCities(1).some(c=>c.owner===2),aiHidden:!wodAiKnownEntities(2).includes(testInvader),aiThreat:countPlayerThreatNear(testInvader.x,testInvader.y,100,2),aiTown:!wodAiKnownCities(2).some(c=>c.owner===1)};
   const contact=wodAiReadContact(2),last=contact.engaged.find(u=>u.uid===testScout.uid),lastX=last?.x;
   testScout.x=gameData.hexes['-15,0'].x;wodFogFactionIntel(2,true);initial.cachedContact=!!last&&last!==testScout&&wodAiReadContact(2).engaged.find(u=>u.uid===testScout.uid)?.x===lastX;
   testScout.x=gameData.hexes['11,0'].x;testScout.y=0;testScout.target={x:testScout.x+100,y:0};gameData._wodPlayerMovingN=8;wodRefreshFogVision(1,true);gameData._fogCanvasDirty=true;wodFogRebuildNextMs=0;updateTerrainCache();wodTryRebuildFogCanvas();
   const at=(q,r)=>{const h=gameData.hexes[`${q},${r}`];return gameData._fogCtx.getImageData(Math.round(h.x-terrainBounds.minX),Math.round(h.y-terrainBounds.minY),1,1).data[3];};
   const advanced={visible:wodFogCanSeeUnit(testHidden),town:wodAiKnownCities(1).some(c=>c.owner===2),revealed:gameData._fogVisible.has('12,0'),baked:!gameData._fogCanvasDirty,clear:at(12,0)===0};
   testScout.x=gameData.hexes['-8,0'].x;wodRefreshFogVision(1,true);const lastKnown=wodAiKnownCities(1).find(c=>c.owner===2);gameData.cities.find(c=>c.owner===2).hasFactory=true;wodFogFactionIntel(1,true);
   wodRebuildFogCanvas();const memory={hidden:!wodFogCanSeeUnit(testHidden),explored:gameData._fogExplored.has('12,0'),remembered:!!lastKnown,notLive:!wodAiKnownCities(1).find(c=>c.owner===2).hasFactory,dimmed:at(12,0)>0&&at(12,0)<at(25,20)};
   return {initial,advanced,memory};
  });
  console.log(JSON.stringify(results.fog));
  assert(results.fog.initial.edge&&results.fog.initial.scoutRadius&&!results.fog.initial.beyond&&results.fog.initial.hiddenUnit&&results.fog.initial.hiddenTown&&results.fog.initial.aiHidden&&results.fog.initial.aiTown&&results.fog.initial.cachedContact&&results.fog.initial.aiThreat===0,'unit vision and AI knowledge respect independent fog, including cached last-seen contacts');
  assert(Object.values(results.fog.advanced).every(Boolean),'marching reveals units, towns and fog texture');assert(Object.values(results.fog.memory).every(Boolean),'exploration remembers discoveries without live hidden updates');
  results.scouts=await page.evaluate(()=>{
   intelFixture();const army=gameData.entities.filter(u=>u.owner===2);wodFogFactionIntel(2,true);wodBeginSimPfBudget(army.length);const plan=wodAiEnsureTaskForcePlan(2,army),scouts=plan.jobs.filter(j=>j.kind==='scout');
   const job=scouts[0],unit=job&&army.find(u=>plan.unitJob[u.uid]===job.id);wodBeginSimPfBudget(army.length);const assigned=!!(unit&&wodAiIssueScoutOrder(unit,job));
   const unknown=!!job?.scoutHex&&!wodFogFactionIntel(2).visible.has(getHexKey(job.scoutHex)),before=wodFogFactionIntel(2).explored.size,start=unit&&{x:unit.x,y:unit.y};
   if(unit)for(let i=0;i<150;i++){wodBeginSimPfBudget(army.length);gameData.unitSpatialGrid=buildUnitSpatialGrid(96);moveUnitTowardTarget(unit,.1);if(i%10===0){wodFogFactionIntel(2,true);wodAiIssueScoutOrder(unit,job);}}
   const explored=wodFogFactionIntel(2,true).explored.size;
   return {scouts:scouts.length,assigned,unknown,explored:explored>before,moved:!!unit&&Math.hypot(unit.x-start.x,unit.y-start.y)>gameData.hexRadius*1.35,hiddenObjective:plan.jobs.some(j=>j.objectiveCity?.owner===1),garrison:plan.jobs.some(j=>j.kind==='defend'&&j.city?.owner===2)};
  });console.log(JSON.stringify(results.scouts));assert(results.scouts.scouts>0&&results.scouts.assigned&&results.scouts.unknown&&results.scouts.moved&&results.scouts.explored&&!results.scouts.hiddenObjective&&results.scouts.garrison,'AI scouts move into unknown frontiers and expand knowledge while retaining town guards and cannot target undiscovered towns');
  results.metrics=await page.evaluate(()=>{
   gameData.fogOfWar=false;gameData._matchReadyForEndChecks=true;gameData._battleLedger=null;const u=gameData.entities.find(u=>u.owner===2);applyDamage(u,12,1);wodBattleMetric(1,'personnelRestored',25);spendForUnit(1,'light');wodDeductPlayerMoney(1,60);setHexOwner(gameData.hexes['1,1'],1);wodRecordOwnerLifetime(2,'unitsBuiltMarine',1);
   for(const key of ['-20,20','20,20']){gameData.hexes[key].type='water';gameData.hexes[key].owner=0;}gameData.hexes['-19,20'].type='mountain';gameData._landIncomeCacheDirty=true;
   const land=wodLandTileCounts(),r=wodFactionBattleStats(1),enemy=wodFactionBattleStats(2);
   return {land:r.land,expected:gameData.hexList.filter(h=>h.owner===1&&!isWaterHex(h)).length,total:land.total,m:r.metrics,enemy:enemy.metrics,waterExcluded:land.total===gameData.hexList.length-2};
  });assert(results.metrics.land===results.metrics.expected&&results.metrics.waterExcluded&&results.metrics.m.damageDealt===12&&results.metrics.m.moneySpent===1060&&results.metrics.m.manpowerCommitted===2000&&results.metrics.m.landGained===1&&results.metrics.enemy.unitsBuiltMarine===1,'detailed stats track land, damage, spending, production and every faction');
  results.multiplayer=await page.evaluate(()=>{
   gameData.mp={enabled:true,isHost:true,localSlot:1,humanSlots:[1,2],factionSlots:[1,2],allReady:true};
   const api=WodMultiplayer.api,oldConnected=api.connected,send=WodMultiplayer.hostSendSnap;api.connected=true;let payload;
   WodMultiplayer.hostSendSnap=(seq,p)=>payload=p;wodMpHostEmitSnapshot();WodMultiplayer.hostSendSnap=send;api.connected=oldConnected;
   gameData.mp={...gameData.mp,isHost:false,localSlot:2};gameData._battleLedger=null;wodMpApplySnapPayload(payload);wodMpApplySnapPayload(payload);
   const stats=wodFactionBattleStats(wodLocalPlayerOwner()),row={owner:stats.owner,built:stats.metrics.unitsBuiltMarine,hostDamage:wodBattleLedger().byOwner[1].damageDealt,land:stats.land,expected:wodLandTileCounts().counts[2]};gameData.mp={enabled:false};return row;
  });assert(results.multiplayer.owner===2&&results.multiplayer.built===1&&results.multiplayer.hostDamage===12&&results.multiplayer.land===results.multiplayer.expected,'guest reports retain authoritative counters and use their own faction without double counting snapshots');
  await page.evaluate(()=>{toggleWodStatsPanel(true);});
  results.layouts=[];
  for(const width of [1440,768,390,320]) {
   await page.setViewportSize({width,height:width>900?1000:844});await page.waitForTimeout(100);
   for(const section of ['economy','forces','combat','players']) {
   await page.locator(`#statsMenu [data-stats-page="${section}"].stats-m-tab`).click();await page.waitForTimeout(60);
   const clipped=await page.locator('#statsMenu .stats-m-page.active .resource-chip').evaluateAll(nodes=>nodes.filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>({text:e.innerText,w:e.clientWidth,scroll:e.scrollWidth})));if(clipped.length)await page.screenshot({path:path.join(OUT,'clipped-report.png')});assert.equal(clipped.length,0,JSON.stringify({width,section,clipped}));
    results.layouts.push(await page.evaluate(({width,section})=>{const p=document.querySelector('#statsMenu .stats-menu-panel'),active=document.querySelector('#statsMenu .stats-m-page.active'),cards=[...active.querySelectorAll('.battle-stat,.battle-faction')];return{width,section,active:active.dataset.statsPage,noOverflow:p.scrollWidth<=p.clientWidth+2,values:cards.length,inside:cards.every(c=>c.getBoundingClientRect().right<=p.getBoundingClientRect().right+1&&c.getBoundingClientRect().left>=p.getBoundingClientRect().left-1)};},{width,section}));
    if(width===1440||width===390)await page.screenshot({path:path.join(OUT,`stats-${width}-${section}.png`)});
   }
  }
  assert(results.layouts.every(r=>r.active===r.section&&r.noOverflow&&r.inside&&r.values>0),'all four report sections fit desktop, tablet and narrow phones');
  await page.evaluate(()=>{gameData.fogOfWar=true;wodRefreshFogVision(1,true);wodShowStatsPage('players');});
  assert(await page.locator('[data-stats-owner="2"]').innerText().then(t=>t.includes('Unknown')&&t.includes('Spotted forces')),'live report hides enemy treasury and unobserved totals');
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{toggleWodStatsPanel(false);intelFixture();gameData.fogOfWar=false;gameData.layers={terrain:true,diplomacy:true,territory:false,cities:true,cityNames:true,units:true,structures:true};setShopMapSkin('atlas_hd');for(const h of gameData.hexList){if(h.q>7&&h.q<22&&h.r>-15&&h.r<16)h.type=Math.sin(h.r*.3)+Math.cos(h.q*.25)>.3?'mountain':'hill';else if(h.r>15||h.q<-19)h.type='water';else if(h.q<-6&&h.r<10)h.type='forest';}gameData.camera.zoom=1.35;gameData.camera.x=-canvas.clientWidth/2;gameData.camera.y=-canvas.clientHeight/2;wodMarkTerrainFullDirty();updateTerrainCache();draw();});
  await page.waitForTimeout(300);await page.screenshot({path:path.join(OUT,'aerial-terrain.png')});
  await page.evaluate(()=>{gameData.fogOfWar=true;wodRefreshFogVision(1,true);wodFogRebuildNextMs=0;draw();});await page.screenshot({path:path.join(OUT,'fog-scouting.png')});
  results.endReport=await page.evaluate(()=>{gameData._lifetimeMatch=null;openCampaignBattleSummary('defeat','Test complete','Report layout verification');const cards=[...document.querySelectorAll('#campaignSummaryStats [data-stats-owner]')];return{owners:cards.map(c=>+c.dataset.statsOwner),land:cards.every(c=>c.querySelector('[data-land-tiles]')),full:cards.every(c=>c.textContent.includes('Damage dealt')&&c.textContent.includes('Combat damage received')&&!c.textContent.includes('Unknown'))};});
  assert(results.endReport.owners.includes(1)&&results.endReport.owners.includes(2)&&results.endReport.land&&results.endReport.full,'completed match shows full faction land and detailed records even when fog was enabled');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);await page.screenshot({path:path.join(OUT,'completed-report-mobile.png')});
  assert(await page.locator('#campaignSummaryPanel').evaluate(el=>el.scrollWidth<=el.clientWidth+2),'completed report fits a phone without horizontal overflow');
  await page.locator('.battle-final-stats').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(OUT,'completed-faction-details-mobile.png')});
  fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));assert.equal(errors.length,0,errors.join('\n'));console.log('Faction knowledge, scouting, fog reveal, detailed statistics and responsive layouts passed.');
 }finally{fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const s of relay.clients)s.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
