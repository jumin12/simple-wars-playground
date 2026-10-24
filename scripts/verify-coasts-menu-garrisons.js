const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/coasts-menu-garrisons');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(ROOT,'.'+(req.url.split('?')[0]==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0])));
 if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(err,body)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ogg':'audio/ogg','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream');res.end(body);});
});
(async()=>{
 const relay=new WebSocketServer({port:8080});relay.on('error',()=>{});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],results={};
 page.on('pageerror',e=>errors.push(e.stack));
 try{
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  await page.waitForFunction(()=>menuDemoSeeded&&gameData.menuAttractMode&&!window._wodMenuBootstrapBusy,null,{timeout:180000});
  await page.evaluate(()=>{wodDismissChangelogPopup?.();startGame('ai');});
  await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
  results.menu=await page.evaluate(()=>{
   setGameSpeed(0,true);window.testFinalHexes=gameData.hexList;window.testMenuSource=menuBattleLive;window.testMenuCanvas=menuTerrainSnap?.composite;
   window.testGenerateCalls=0;const original=generateMap;generateMap=(...args)=>{window.testGenerateCalls++;return original(...args);};
   triggerCampaignVictory('Menu prewarm verification',false);
   window.testSummaryText=document.getElementById('campaignSummaryStats').textContent;
   return {cachePreserved:!!menuBattleLive&&!!menuTerrainSnap,ended:gameData._campaignEnded};
  });
  await page.waitForFunction(()=>!!menuBattlePrepared,null,{timeout:10000});
  Object.assign(results.menu,await page.evaluate(()=>({finalBattlePreserved:gameData.hexList===window.testFinalHexes,statsUnchanged:window.testSummaryText===document.getElementById('campaignSummaryStats').textContent,preparedTiles:menuBattlePrepared.hexList.length,generated:window.testGenerateCalls})));
  await page.screenshot({path:path.join(OUT,'summary-preloaded.png')});
  Object.assign(results.menu,await page.evaluate(()=>{const begin=performance.now();returnToMenu();return {returnMs:performance.now()-begin,generatedOnReturn:window.testGenerateCalls,warmCanvasAdopted:terrainCanvas===window.testMenuCanvas,menuRunning:gameState==='MENU'&&gameData.menuAttractMode,summaryHidden:document.getElementById('campaignSummaryOverlay').classList.contains('hidden')};}));
  await page.waitForTimeout(250);await page.screenshot({path:path.join(OUT,'menu-return.png')});
  // A second match must save a fresh menu snapshot, and an immediate exit must
  // cancel pending preparation rather than replace the resumed world later.
  await page.evaluate(()=>startGame('ai'));
  await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
  Object.assign(results.menu,await page.evaluate(()=>{triggerCampaignDefeat('Immediate exit verification');returnToMenu();window.testResumedHexes=gameData.hexList;return {secondMenuRunning:gameState==='MENU'&&gameData.menuAttractMode};}));
  await page.waitForTimeout(250);
  results.menu.fastExitStable=await page.evaluate(()=>gameData.hexList===window.testResumedHexes&&menuBattlePrepared===null);
  await page.evaluate(()=>{pauseMenuBackgroundBattle();gameState='PLAYING';setGameSpeed(0,true);});
  results.territory=await page.evaluate(()=>{
   const rows=[];
   const reset=()=>{
    WOD.makeBlankMap(20);gameState='PLAYING';gameData.mp={enabled:false};gameData._campaignRun=null;gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.alliances=[];gameData._territoryCleanupKeys=new Set();gameData._waterPoliticsWork=null;gameData._waterPoliticsDirty=false;
    for(const h of gameData.hexList){h.type='grass';h.owner=1;h.cityId=null;}
   };
   const drain=()=>{let n=0;while((gameData._waterPoliticsDirty||gameData._waterPoliticsWork)&&n++<1000)wodUpdateWaterPolitics();return n;};
   for(const type of ['lake','river','ocean','splitLake','guest']) {
    reset();for(const h of gameData.hexList)if(type==='ocean'?h.r>=0:type==='river'?Math.abs(h.q)<=1:Math.abs(h.q)<=3&&Math.abs(h.r)<=3){h.type='water';h.owner=2;}
    if(type==='splitLake')for(const h of gameData.hexList)if(h.q>0&&!isWaterHex(h))h.owner=2;
    if(type==='guest')gameData.mp={enabled:true,isHost:false};
    gameData._waterPoliticsDirty=true;const rounds=type==='guest'?(wodUpdateWaterPolitics(),1):drain();
    rows.push({type,rounds,water:gameData.hexList.filter(isWaterHex).length,enemyWater:gameData.hexList.filter(h=>isWaterHex(h)&&h.owner===2).length,left:gameData.hexes['-3,0'].owner,right:gameData.hexes['3,0'].owner,terrainIntact:gameData.hexes['0,0'].type==='water'});
   }
   for(const type of ['coastal','mountainCoast','unit','town','allied','island']) {
    reset();for(const h of gameData.hexList)if(h.r>=0){h.type='water';h.owner=2;}
    for(let q=-3;q<=3;q++)for(let r=-2;r<0;r++){const h=gameData.hexes[`${q},${r}`];h.owner=2;if(type==='mountainCoast')h.type='mountain';}
    const h=gameData.hexes['0,-1'];
    if(type==='unit')createUnitAt('light',h.x,h.y,2,{startSpawn:true});
    if(type==='town'){h.cityId='Coastal town';h.type='urban';gameData.cities=[{id:h.cityId,owner:2,q:h.q,r:h.r,x:h.x,y:h.y}];}
    if(type==='allied')gameData.alliances=[[1,2]];
    if(type==='island')for(const n of gameData.hexList)if(n.owner===1){n.type='water';n.owner=1;}
    wodQueueTerritoryRemnantCheck(h);for(let i=0;i<30&&gameData._territoryCleanupKeys.size;i++)wodCleanupTinyTerritoryPockets(96);
    rows.push({type,owner:h.owner,remaining:gameData.hexList.filter(h=>!isWaterHex(h)&&h.owner===2).length});
   }
   // Ownership follows an actual bank capture, without altering water movement.
   reset();for(const h of gameData.hexList)if(Math.abs(h.q)<=2&&Math.abs(h.r)<=2){h.type='water';h.owner=2;}
   const bank=gameData.hexes['-3,0'];bank.owner=2;gameData._matchReadyForEndChecks=true;setHexOwner(bank,1);const queued=gameData._waterPoliticsDirty;drain();
   rows.push({type:'bankCapture',queued,enemyWater:gameData.hexList.filter(h=>isWaterHex(h)&&h.owner===2).length});
   return rows;
  });
  results.garrisons=await page.evaluate(()=>{
   WOD.makeBlankMap(25);gameState='PLAYING';gameData.mp={enabled:false};gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.aiTaskForces={};gameData._aiDefenseByOwner={};gameData._aiEconomyClock=0;gameData.alliances=[];
   for(const h of gameData.hexList){h.type='grass';h.owner=h.q<0?1:2;h.cityId=null;}
   const towns=[];for(let i=0;i<4;i++){const h=gameData.hexes[`15,${-15+i*10}`];h.type='urban';h.cityId='Town '+i;const c={id:h.cityId,name:h.cityId,owner:2,q:h.q,r:h.r,x:h.x,y:h.y,hp:1000,maxHp:1000};towns.push(c);gameData.cities.push(c);}
   const e=gameData.hexes['-15,0'];gameData.cities.push({id:'Enemy',owner:1,q:e.q,r:e.r,x:e.x,y:e.y,hp:1000,maxHp:1000});
   for(let i=0;i<22;i++){const h=gameData.hexes[`${8+i%4},${-10+Math.floor(i/4)*3}`];createUnitAt('light',h.x,h.y,2,{startSpawn:true});}
   wodDeployStartingArmy([1,2]);
   const openingGuards=towns.every(c=>gameData.entities.some(u=>u.owner===2&&u.type==='light'&&getNearestHexToPoint(u.x,u.y)===gameData.hexes[`${c.q},${c.r}`]));
   gameData.unitSpatialGrid=buildUnitSpatialGrid(200);const army=gameData.entities.filter(u=>u.owner===2),plan=wodAiEnsureTaskForcePlan(2,army);
   const guards=towns.map(c=>{const j=plan.jobs.find(j=>j.city?.id===c.id),u=army.find(u=>plan.unitJob[u.uid]===j?.id);wodAiIssueTaskForceOrder(u,j,1);const target=u.orderTarget||u.target;return {town:c.id,uid:u.uid,type:u.type,valid:wodAiJobStillValid(j,2),targetDistance:Math.hypot(target.x-c.x,target.y-c.y)};});
   const old=army.find(u=>u.uid===guards[1].uid);old.hp=0;const again=wodAiEnsureTaskForcePlan(2,army.filter(u=>u.hp>0));
   const replacement=gameData.entities.find(u=>u.hp>0&&again.unitJob[u.uid]===again.jobs.find(j=>j.city?.id===towns[1].id)?.id);
   const defense=wodAiReadDefense(2,army.filter(u=>u.hp>0),true);
   return {guards,openingGuards,replaced:!!replacement&&replacement.uid!==old.uid,stablePlan:again===plan,guardNotPeeled:guards.filter(g=>g.uid!==old.uid).every(g=>!defense.unitJob[g.uid]),defenseCount:plan.jobs.filter(j=>['defend','hold'].includes(j.kind)).reduce((n,j)=>n+j.members.length,0),army:army.length,offense:plan.jobs.some(j=>j.kind==='main'&&j.members.length>0)};
  });
  results.smoothing=await page.evaluate(()=>{
   const points=[];for(let i=0;i<30;i++){points.push({x:i*20,y:i*20});points.push({x:(i+1)*20,y:i*20});}
   const p=wodSmoothDiplomacyBorderPoints(points,20,false),turns=a=>a.slice(1,-1).reduce((n,v,i)=>{const before=a[i],after=a[i+2];return n+Math.abs(Math.atan2(after.y-v.y,after.x-v.x)-Math.atan2(v.y-before.y,v.x-before.x));},0);
   return {first:JSON.stringify(points[0])===JSON.stringify(p[0]),last:JSON.stringify(points.at(-1))===JSON.stringify(p.at(-1)),maxOffset:Math.max(...p.map((v,i)=>Math.hypot(v.x-points[i].x,v.y-points[i].y))),rawTurns:turns(points),smoothTurns:turns(p)};
  });
  fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
  assert(results.menu.cachePreserved&&results.menu.finalBattlePreserved&&results.menu.statsUnchanged&&results.menu.preparedTiles>0);
  assert.equal(results.menu.generatedOnReturn,0);assert(results.menu.warmCanvasAdopted&&results.menu.menuRunning&&results.menu.summaryHidden&&results.menu.secondMenuRunning&&results.menu.fastExitStable);
  for(const type of ['lake','river','ocean','bankCapture'])assert.equal(results.territory.find(r=>r.type===type).enemyWater,0,type);
  const split=results.territory.find(r=>r.type==='splitLake');assert(split.left===1&&split.right===2&&split.enemyWater>0&&split.enemyWater<split.water);
  assert(results.territory.filter(r=>r.water).every(r=>r.terrainIntact));assert.equal(results.territory.find(r=>r.type==='guest').enemyWater,49);
  assert(results.territory.filter(r=>['coastal','mountainCoast'].includes(r.type)).every(r=>r.owner===1&&r.remaining===0));
  assert(results.territory.filter(r=>['unit','town','allied','island'].includes(r.type)).every(r=>r.owner===2));
  assert(results.garrisons.guards.every(g=>g.type==='light'&&g.valid&&g.targetDistance<1));
  assert(results.garrisons.openingGuards&&results.garrisons.replaced&&results.garrisons.stablePlan&&results.garrisons.guardNotPeeled&&results.garrisons.offense);
  assert(results.smoothing.first&&results.smoothing.last&&results.smoothing.maxOffset<=20*.42+.01&&results.smoothing.smoothTurns<results.smoothing.rawTurns*.3);
  assert.equal(errors.length,0,errors.join('\n'));
 }finally{fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const s of relay.clients)s.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
