const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/store-refresh');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(ROOT,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[path.extname(file)]||'application/octet-stream');res.end(b);});});
(async()=>{const relay=new WebSocketServer({port:8080});relay.on('error',()=>{});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],results={};page.on('pageerror',e=>errors.push(e.stack));
try{
 const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'custom-maps/manifest.json'),'utf8'));assert.equal(manifest.missions.length,7);assert.equal(new Set(manifest.maps.map(m=>m.id)).size,7);
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks&&!window._wodBootBusy&&!window._wodMenuBootstrapBusy,null,{timeout:180000});
 results.defaults=await page.evaluate(()=>{setGameSpeed(0,true);wodDismissChangelogPopup();const solo={...gameData.layers};gameData.layers.cities=true;gameData.layers.territory=true;wodMpEnsureDefaultMatchLayers(true);const multiplayer={...gameData.layers};gameState='MENU';pauseMenuBackgroundBattle();openMapEditor();const editor={...gameData.layers};closeMapEditor();return{solo,multiplayer,editor};});assert(Object.values(results.defaults).every(l=>!l.cities&&!l.territory));
 results.capture=await page.evaluate(()=>{
  gameState='MENU';pauseMenuBackgroundBattle();const rows=[];
  for(const owner of [1,2])for(const type of ['light','marine','heavy','ship'])for(const pressure of [false,true]){
   WOD.makeBlankMap(20);gameData.mp=null;for(const h of gameData.hexList){h.owner=3-owner;h.type=type==='ship'?'water':'grass';}
   const u={type,owner,x:0,y:0,hp:100,range:50};const other={type:'light',owner:3-owner,x:70,y:0,hp:100};gameData.entities=pressure?[u,other]:[u];gameData.unitSpatialGrid=buildUnitSpatialGrid();gameData._hexCombatOcc=null;gameData._wodClaimBatch=new Map();
   claimTerritoryAroundUnit(u);wodApplyTerritoryClaimBatch();
   const claimed=gameData.hexList.filter(h=>h.owner===owner),radius=type==='heavy'?2:1,allowed=new Set(getHexesInHexRadius(0,0,radius).map(h=>`${h.q},${h.r}`));
   rows.push({owner,type,pressure,count:claimed.length,outside:claimed.filter(h=>!allowed.has(`${h.q},${h.r}`)).length,keys:claimed.map(h=>`${h.q},${h.r}`).sort()});
  }
  return rows;
 });assert(results.capture.every(r=>r.count>0&&r.outside===0));for(const r of results.capture){const mirror=results.capture.find(n=>n.owner!==r.owner&&n.type===r.type&&n.pressure===r.pressure);assert.deepEqual(r.keys,mirror.keys,'player and AI capture the identical footprint');}
 await page.evaluate(async()=>{gameData.mp=null;gameState='MENU';pauseMenuBackgroundBattle();bootstrapMenuBackgroundBattle=async()=>{};wodPrewarmMenuBattleForSummary=()=>{};wodCloudCanSync=()=>false;gameData.gold=2000;flushGameProfileToWod();showPanel('shop');switchShopTab('missions');await renderShopMapsTab();});
 await page.locator('#shopMapOptions .shop-mission-card').first().waitFor({state:'visible'});await page.waitForFunction(()=>Object.keys(wodShopMapDataCache).length===7);await page.waitForTimeout(250);
 await page.screenshot({path:path.join(OUT,'shop-desktop.png')});
 for(const e of manifest.missions){await page.locator(`[data-mission-id="${e.id}"]`).click();await page.waitForFunction(id=>wodOwnsShopVisual(wodShopMapShopId(id)),e.id);}
 assert.equal(await page.evaluate(()=>gameData.gold),800,'three existing 200g and four new 150g purchases');
 await page.setViewportSize({width:390,height:844});await page.locator('#shopMapOptions .shop-mission-card').first().scrollIntoViewIfNeeded();await page.waitForTimeout(120);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.screenshot({path:path.join(OUT,'shop-mobile.png')});await page.setViewportSize({width:1440,height:1000});
 results.maps=[];
 for(const e of manifest.missions){
  const row=await page.evaluate(async e=>{
   gameState='MENU';pauseMenuBackgroundBattle();const data=await wodFetchShopMapData(wodShopMapCatalog.find(m=>m.id===e.id));
   let preview=document.getElementById('qaMissionPreview');if(!preview){preview=document.createElement('canvas');preview.id='qaMissionPreview';preview.width=900;preview.height=520;Object.assign(preview.style,{position:'fixed',left:'0',top:'0',width:'900px',height:'520px',zIndex:'99999'});document.body.appendChild(preview);}wodPaintMapDataOnCanvas(preview,data);
   const cells=new Map(data.hexList.map(h=>[`${h.q},${h.r}`,h])),roots=new Map(),dirs=[[1,0],[-1,0],[0,1],[0,-1]];
   for(const c of data.cities){if(!roots.has(c.owner))roots.set(c.owner,new Set());const seen=roots.get(c.owner),queue=[cells.get(`${c.q},${c.r}`)];for(const h of queue)seen.add(`${h.q},${h.r}`);for(let i=0;i<queue.length;i++)for(const [q,r]of dirs){const n=cells.get(`${queue[i].q+q},${queue[i].r+r}`),k=n&&`${n.q},${n.r}`;if(n&&n.owner===c.owner&&!['mountain','water','deep_water'].includes(n.type)&&!seen.has(k)){seen.add(k);queue.push(n);}}}
   const placements=new Set();let invalid=0,overlap=0;for(const u of data.entities){const h=cells.get(`${Math.round(u.x/27)},${Math.round(u.y/27)}`),k=h&&`${h.q},${h.r}`;if(placements.has(k))overlap++;placements.add(k);if(!h||u.type==='ship'&&h.type!=='water'||!['marine','ship'].includes(u.type)&&!roots.get(u.owner)?.has(k))invalid++;}
   let spacing=999;for(const a of data.cities)for(const b of data.cities)if(a!==b)spacing=Math.min(spacing,Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r)));
   return{id:e.id,cities:data.cities.length,units:data.entities.length,invalid,overlap,spacing,empty:data.cities.every(c=>!c.hasFactory&&!c.hasHarbor&&!c.hasFarm),era:data.gamePeriod,events:data.mission.events.length};
  },e);results.maps.push(row);assert(row.invalid===0&&row.overlap===0&&row.spacing>=8&&row.empty,JSON.stringify(row));await page.locator('#qaMissionPreview').screenshot({path:path.join(OUT,e.id+'.png')});
 }
 await page.evaluate(()=>{document.getElementById('qaMissionPreview').remove();_wodMissionListTab='store';showPanel('missions');});await page.waitForFunction(()=>document.querySelectorAll('#wodMissionList [data-mission-id]').length===7);
 // Every catalog mission must load through the mission launcher, including its authored era.
 results.launches=[];
 for(const e of manifest.missions){
  const row=await page.evaluate(async e=>{
   hideCampaignSummaryOverlay();wodHideMissionPopup();gameData._campaignRun=null;gameData.mp=null;gameData._launchingMission=true;gameData._selectedMissionEntry=wodShopMapCatalog.find(m=>m.id===e.id);gameState='PLAYING';await wodApplyMissionEntry(gameData._selectedMissionEntry);await initGame();gameData._campaignEnded=false;gameData._matchReadyForEndChecks=true;setGameSpeed(0,true);wodBeginLifetimeMatch();
   const initial=gameData.entities.filter(u=>u.owner===1).length;wodUpdateMissionEvents(.02);const first=gameData.mission.events[0];
   return{id:e.id,era:wodGetGamePeriod(),matchEra:wodGetMatchPeriod(),skin:getEffectiveUnitSkin(gameData.entities[0]),initial,empty:gameData.cities.every(c=>!c.hasFactory&&!c.hasHarbor&&!c.hasFarm),intro:gameData._missionRuntime.fired.has(first.id),outsideWater:gameData.entities.filter(u=>!['marine','ship'].includes(u.type)&&wodUnitInUnsuppliedWater(u,getNearestHexToPoint(u.x,u.y))).length};
  },e);results.launches.push(row);assert(row.era===e.gamePeriod&&row.matchEra===e.gamePeriod&&row.empty&&row.initial>0&&row.outsideWater===0,JSON.stringify(row));if(!['normandy-dday','kursk-citadel','midway-1942'].includes(e.id))assert(row.intro&&row.skin===(e.gamePeriod==='modern'?'nato':e.gamePeriod),JSON.stringify(row));
 }
 // Losing keeps a purchased mission available; a victory consumes it once.
 results.entitlement=await page.evaluate(()=>{const e=gameData._selectedMissionEntry;triggerSurrenderDefeat();const retry=wodStoreMissionPlayable(e);gameData._campaignEnded=false;gameData._lifetimeMatch.finished=false;triggerCampaignVictory('Objective secured',false);const consumed=wodIsStoreMissionSpent(e.id)&&!wodStoreMissionPlayable(e);return{retry,consumed};});assert(results.entitlement.retry&&results.entitlement.consumed);
 await page.evaluate(()=>{returnToMenu();_wodMissionListTab='store';showPanel('missions');});await page.waitForFunction(()=>document.querySelectorAll('#wodMissionList [data-mission-id]').length===7);
 await page.locator('#wodMissionList [data-mission-id="thermopylae-480"]').click();await page.evaluate(()=>{gameData._matchReadyForEndChecks=false;});await page.locator('#wodMissionStartBtn').click();
 await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks&&gameData._selectedMissionEntry?.id==='thermopylae-480',null,{timeout:180000});
 await page.evaluate(()=>{wodHideMissionPopup();setGameSpeed(0,true);gameData.fogOfWar=false;gameData.camera.zoom=.4;const c=gameData.cities.find(c=>c.owner===1);gameData.camera.x=c.x*.4-canvas.clientWidth/2;gameData.camera.y=c.y*.4-canvas.clientHeight/2;wodMarkTerrainFullDirty();updateTerrainCache();draw();});await page.screenshot({path:path.join(OUT,'historical-gameplay.png')});
 results.realLaunch=await page.evaluate(()=>({era:wodGetGamePeriod(),skin:getEffectiveUnitSkin(gameData.entities.find(u=>u.owner===1)),territory:gameData.layers.territory,cities:gameData.layers.cities}));assert(results.realLaunch.era==='ancient'&&results.realLaunch.skin==='ancient'&&!results.realLaunch.territory&&!results.realLaunch.cities);
 fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));assert.equal(errors.length,0,errors.join('\n'));
}finally{fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const c of relay.clients)c.terminate();relay.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
