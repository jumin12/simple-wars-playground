const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict'),vm=require('vm');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/lifetime-stats');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(ROOT,'.'+(req.url.split('?')[0]==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0])));if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[path.extname(file)]||'application/octet-stream');res.end(b);});});
(async()=>{
const relay=new WebSocketServer({port:8080});relay.on('error',()=>{});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],results={};page.on('pageerror',e=>errors.push(e.stack));
try{
const url='http://127.0.0.1:'+server.address().port;
await page.goto(url+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
results.opening=await page.evaluate(()=>{setGameSpeed(0,true);wodDismissChangelogPopup();return{started:wodProgress.lifetime.gamesStarted,trained:wodProgress.lifetime.unitsBuiltLight,period:gameData._lifetimeMatch?.period};});assert.equal(results.opening.started,1);assert.equal(results.opening.trained,0);
await page.evaluate(()=>{
 window.statsFixture=(period='modern',mp=null)=>{
  hideCampaignSummaryOverlay();UI.panels.forEach(p=>p.classList.add('hidden'));UI.escMenu.classList.add('hidden');UI.mainMenu.classList.add('hidden');pauseMenuBackgroundBattle();gameState='PLAYING';gameData.menuAttractMode=false;
  wodPrepareForNewMatch({keepLiveMap:true});gameData.mp=mp;gameData._campaignRun=null;gameData._selectedMissionEntry=null;gameData._launchingMission=false;gameData._matchReadyForEndChecks=true;WOD.makeBlankMap(20);
  for(const h of gameData.hexList){h.type='grass';h.owner=h.q<0?1:2;}
  gameData.cities=[[-9,1],[9,2]].map(([q,owner])=>{const h=gameData.hexes[`${q},0`];return{id:'town-'+owner,name:'Town '+owner,q,r:0,x:h.x,y:h.y,owner,hp:1000};});
  gameData.entities=[];for(const owner of [1,2])createUnitAt('light',(owner===1?-6:6)*27,0,owner,{startSpawn:true});
  gameData._matchPeriod=period;gameData.gamePeriod=period;gameData._campaignEnded=false;gameData._lifetimeMatch=null;gameData._lifetimeStatsByOwner={};gameData._lifetimeEndReason=null;wodBeginLifetimeMatch();setGameSpeed(0,true);wodResetEndCountdowns();
 };
 window.savedStats=()=>JSON.parse(localStorage.getItem(SL_PROGRESS_LS_KEY));
 wodProgress=defaultWodProgress();statsFixture('ancient');
 addCasualties(2,125,1,'light');addCasualties(1,40,2,'marine');addTankCasualties(2,3,1);addShipCasualties(1,2,2);
 createUnitAt('marine',-100,100,1);wodRecordOwnerLifetime(1,'factoriesBuilt',1);
});
// Exercise the actual surrender action without editing match counters.
await page.evaluate(()=>confirmSurrender());assert.equal(await page.locator('#wodConfirmDlg:visible').count(),0,'surrender has no confirmation popup');await page.locator('#campaignSummaryOverlay').waitFor({state:'visible'});
results.surrender=await page.evaluate(()=>({live:{...wodProgress.lifetime},saved:savedStats(),period:gameData._lifetimeMatch.period}));
assert.equal(results.surrender.saved.lifetime.matchesCompleted,1);assert.equal(results.surrender.saved.lifetime.matchesLost,1);assert.equal(results.surrender.saved.lifetime.matchesSurrendered,1);assert.equal(results.surrender.saved.lifetime.campaignLosses,1);assert.equal(results.surrender.saved.lifetime.enemyTroopKills,125);assert.equal(results.surrender.saved.lifetime.ownMarineLosses,40);assert.equal(results.surrender.saved.lifetime.unitsBuiltMarine,1);assert.equal(results.surrender.saved.lifetimeByPeriod.ancient.matchesLost,1);
await page.evaluate(()=>{triggerSurrenderDefeat();returnToMenu();});assert.equal(await page.evaluate(()=>savedStats().lifetime.matchesCompleted),1,'summary plus menu exit does not double-count');
// Immediate reload must retain the result and combat totals, without waiting for debounce.
await page.reload();await page.waitForFunction(()=>wodProgress&&window.WOD);assert.equal(await page.evaluate(()=>wodProgress.lifetime.matchesSurrendered),1);
// Reinstall fixture after a real browser reload.
await page.goto(url+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
await page.waitForFunction(()=>!window._wodBootBusy&&!window._wodMenuBootstrapBusy&&!gameData._mapGenInProgress,null,{timeout:180000});
// Keep unrelated asynchronous menu generation out of synchronous end-condition fixtures.
await page.evaluate(()=>{bootstrapMenuBackgroundBattle=async()=>{};wodPrewarmMenuBattleForSummary=()=>{};setGameSpeed(0,true);wodDismissChangelogPopup();window.statsFixture=(period='modern',mp=null)=>{
 hideCampaignSummaryOverlay();UI.panels.forEach(p=>p.classList.add('hidden'));UI.escMenu.classList.add('hidden');pauseMenuBackgroundBattle();gameState='PLAYING';wodPrepareForNewMatch({keepLiveMap:true});gameData.mp=mp;gameData._campaignRun=null;gameData._selectedMissionEntry=null;gameData._launchingMission=false;WOD.makeBlankMap(20);for(const h of gameData.hexList){h.type='grass';h.owner=h.q<0?1:2;}gameData.cities=[[-9,1],[9,2]].map(([q,owner])=>{const h=gameData.hexes[`${q},0`];return{id:'town-'+owner,name:'Town '+owner,q,r:0,x:h.x,y:h.y,owner,hp:1000};});gameData.entities=[];for(const owner of [1,2])createUnitAt('light',(owner===1?-6:6)*27,0,owner,{startSpawn:true});gameData._matchPeriod=period;gameData.gamePeriod=period;gameData._matchReadyForEndChecks=true;gameData._mapGenInProgress=false;gameData._lifetimeMatch=null;wodBeginLifetimeMatch();setGameSpeed(0,true);wodResetEndCountdowns();};window.savedStats=()=>JSON.parse(localStorage.getItem(SL_PROGRESS_LS_KEY));});
results.endings=await page.evaluate(()=>{
 const rows=[];
 for(const kind of ['dominationWin','annihilationWin','cityLoss','annihilationLoss','missionLoss','quit']){
  statsFixture('medieval');const before=wodProgress.lifetime.matchesCompleted;
  if(kind==='dominationWin'){gameData.victoryMode='domination';gameData.cities.forEach(c=>c.owner=1);}
  if(kind==='annihilationWin'){gameData.victoryMode='annihilation';gameData.entities=gameData.entities.filter(u=>u.owner===1);}
  if(kind==='cityLoss'){gameData.cities.forEach(c=>c.owner=2);handleWodTownCaptureAndElimination(1,2);}
  if(kind==='annihilationLoss'){gameData.victoryMode='annihilation';gameData.entities=gameData.entities.filter(u=>u.owner===2);}
  if(kind==='missionLoss'){gameData._selectedMissionEntry={id:'fixture'};triggerCampaignDefeat('Scenario objective failed');}
  else if(kind==='quit')returnToMenu();else for(let i=0;i<20&&!gameData._campaignEnded;i++)checkCampaignEndConditions(1);
  const L=savedStats().lifetime;rows.push({kind,delta:L.matchesCompleted-before,won:L.matchesWon,lost:L.matchesLost});
  triggerCampaignDefeat('Duplicate');returnToMenu();
  if(savedStats().lifetime.matchesCompleted!==before+1)throw new Error('Duplicate result '+kind);
 }
 return rows;
});assert(results.endings.every(r=>r.delta===1),JSON.stringify(results.endings));
// A real campaign battle/roster resolution must also persist once on surrender.
results.campaign=await page.evaluate(()=>{
 statsFixture('napoleonic');wodRogueBegin();for(const t of ['light','light','heavy','marine'])wodRogueRosterAdd(t);wodRogueSave();const node=wodRogueNodes().find(n=>wodRogueNodePlayable(n.id)),map=wodRogueBuildRegionBattleMap(node.id);WOD.loadMapData(map);
 gameData._campaignRun={nodeId:node.id,fromNodeId:null,defense:false,battleLive:false,deploying:false};gameData._campaignRegionMap=map;const popup=wodShowMissionPopupDialog;wodShowMissionPopupDialog=()=>{};wodCampaignOnBattleStart();wodShowMissionPopupDialog=popup;gameData._campaignRun.battleLive=true;gameData._campaignRun.deploying=false;gameData._matchReadyForEndChecks=true;
 const before=wodProgress.lifetime.matchesCompleted,run=gameData._campaignRun;triggerSurrenderDefeat();const delta=savedStats().lifetime.matchesCompleted-before;return{delta,synced:run.synced,surrenders:savedStats().lifetime.matchesSurrendered};
});assert(results.campaign.delta===1&&results.campaign.synced);
results.multiplayer=await page.evaluate(()=>{
 const meta={enabled:true,isHost:true,localSlot:3,allReady:true,humanSlots:[1,3],factionSlots:[1,2,3],seatTypes:['human','bot','human','closed']};statsFixture('modern',meta);
 const before={...wodProgress.lifetime};addCasualties(2,90,3,'marine');addCasualties(3,25,2,'light');addTankCasualties(2,4,3);addShipCasualties(3,1,2);createUnitAt('heavy',0,100,3);wodRecordOwnerLifetime(3,'fortsBuilt',1);wodRecordOwnerLifetime(1,'enemyTroopKills',999);
 gameData._lifetimeMatch.finished=true;wodRecordOwnerLifetime(2,'enemyMarineKills',11);if(gameData._lifetimeStatsByOwner[2].enemyMarineKills!==11)throw new Error('Eliminated host lost peer stats');gameData._lifetimeMatch.finished=false;
 const api=WodMultiplayer.api,oldConnected=api.connected,send=WodMultiplayer.hostSendSnap;api.connected=true;let payload;WodMultiplayer.hostSendSnap=(seq,p)=>payload=p;wodMpHostEmitSnapshot();WodMultiplayer.hostSendSnap=send;api.connected=oldConnected;
 const host={marine:wodProgress.lifetime.enemyMarineKills-before.enemyMarineKills,loss:wodProgress.lifetime.ownTroopLosses-before.ownTroopLosses,heavy:wodProgress.lifetime.enemyTankKills-before.enemyTankKills,ship:wodProgress.lifetime.ownShipLosses-before.ownShipLosses,build:wodProgress.lifetime.unitsBuiltHeavy-before.unitsBuiltHeavy,wrong:wodProgress.lifetime.enemyTroopKills-before.enemyTroopKills};
 // A new guest applies host totals twice, then its final result snapshot twice.
 gameData._lifetimeMatch=null;gameData.mp.isHost=false;gameData._lifetimeStatsByOwner={};wodBeginLifetimeMatch();const guestBefore={...wodProgress.lifetime};wodMpApplySnapPayload(payload);wodMpApplySnapPayload(payload);const guest=wodProgress.lifetime.enemyMarineKills-guestBefore.enemyMarineKills;wodPrepareForNewMatch({keepMp:true,keepLifetimeMatch:true});gameData._matchReadyForEndChecks=true;wodMpApplySnapPayload(payload);if(wodProgress.lifetime.enemyMarineKills-guestBefore.enemyMarineKills!==90)throw new Error('Rejoin duplicated totals');if(wodLifetimeBucket().peakFieldManpower<1000)throw new Error('Guest army peak was not tracked');
 const end={...payload,matchEnd:{outcomes:{'3':'won','1':'lost'},message:'Guest victory'}};wodMpApplySnapPayload(end);wodMpApplySnapPayload(end);const won=savedStats().lifetime.matchesWon-guestBefore.matchesWon;
 return{host,guest,won,payload:payload.lifetimeStatsByOwner};
});assert.deepEqual(results.multiplayer.host,{marine:90,loss:25,heavy:4,ship:1,build:1,wrong:0});assert.equal(results.multiplayer.guest,90);assert.equal(results.multiplayer.won,1);
// Continuous combat cannot postpone disk persistence indefinitely; menu demo/editor changes stay out.
results.saving=await page.evaluate(async()=>{
 statsFixture();const before=wodProgress.lifetime.enemyTroopKills;for(let i=0;i<9;i++){addCasualties(2,1,1);await new Promise(r=>setTimeout(r,60));}const saved=savedStats().lifetime.enemyTroopKills;
 const live=wodProgress.lifetime.enemyTroopKills;gameData.menuAttractMode=true;addCasualties(2,500,1);createUnitAt('light',0,0,1);gameData.menuAttractMode=false;
 addCasualties(2,3,1);window.dispatchEvent(new Event('pagehide'));return{before,saved,live,after:wodProgress.lifetime.enemyTroopKills,flushed:savedStats().lifetime.enemyTroopKills};
});assert(results.saving.saved>results.saving.before&&results.saving.after===results.saving.live+3&&results.saving.flushed===results.saving.after);
await page.evaluate(()=>{gameData.mp=null;gameState='MENU';pauseMenuBackgroundBattle();showPanel('achievements');switchAchTab('stats');renderAchievementsUi();});await page.locator('#achievementsPanel').waitFor({state:'visible'});await page.waitForTimeout(200);await page.screenshot({path:path.join(OUT,'lifetime-results.png')});
assert((await page.locator('#achievementsPanel').innerText()).toLowerCase().includes('matches completed'));
await page.evaluate(()=>showPanel('credits'));const names=page.locator('#playtesterCredits .credit-name');assert.equal(await names.innerText(),'Chris Meehan\nBailey Carpenter');await page.locator('#playtesterCredits').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(OUT,'separate-tester-lines.png')});
// Load server profile code into an isolated sandbox to avoid touching real player saves.
const module={exports:{}},sandbox={module,exports:module.exports,require,console,__dirname:path.join(ROOT,'server'),setTimeout:()=>1,clearTimeout:()=>{}};vm.runInNewContext(fs.readFileSync(path.join(ROOT,'server/profiles.js'),'utf8'),sandbox);const profiles=module.exports;
const id='WOD-TEST-STTS';profiles.syncProgress(id,{lifetime:{matchesCompleted:4,matchesWon:1,matchesLost:3,matchesSurrendered:2},lifetimeByPeriod:{ancient:{matchesCompleted:4,matchesLost:3}}});profiles.syncProgress(id,{lifetime:{matchesCompleted:1,matchesLost:1}});const cloud=profiles.exportProfile(id);assert.equal(cloud.lifetime.matchesCompleted,4);assert.equal(cloud.lifetime.matchesSurrendered,2);assert.equal(cloud.lifetimeByPeriod.ancient.matchesLost,3);const specialistFields=['enemyMotorizedKills','ownMotorizedLosses','enemyMountaineerKills','ownMountaineerLosses','enemyTruckKills','ownTruckLosses','enemyHorseKills','ownHorseLosses'];const added=Object.fromEntries(specialistFields.map(k=>[k,123]));profiles.syncProgress(id,{lifetime:added,lifetimeByPeriod:{ancient:added}});profiles.syncProgress(id,{lifetime:Object.fromEntries(specialistFields.map(k=>[k,12]))});const equipmentCloud=profiles.exportProfile(id);assert(specialistFields.every(k=>equipmentCloud.lifetime[k]===123&&equipmentCloud.lifetimeByPeriod.ancient[k]===123));results.cloud=true;
assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}finally{fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const c of relay.clients)c.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});


