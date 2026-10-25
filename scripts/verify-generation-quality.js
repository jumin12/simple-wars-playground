const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/generation-quality');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(ROOT,'.'+(req.url.split('?')[0]==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0])));
 if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(err,body)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ogg':'audio/ogg','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream');res.end(body);});
});
(async()=>{
 const relay=new WebSocketServer({port:8080});relay.on('error',()=>{});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],results={};page.on('pageerror',e=>errors.push(e.stack));
 try{
  await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');
  await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
  await page.evaluate(()=>{setGameSpeed(0,true);wodDismissChangelogPopup();gameData._matchReadyForEndChecks=false;gameState='MENU';pauseMenuBackgroundBattle();UI.mainMenu.classList.add('hidden');UI.inGameUI.style.display='none';UI.panels.forEach(p=>p.classList.add('hidden'));document.getElementById('setupPanel').classList.remove('hidden');});
  results.fixtures=await page.evaluate(()=>{
   const rows=[];
   for(const kind of ['clean','enclave','enclosed','thread','comb','unsupplied','offshore']) {
    WOD.makeBlankMap(20);gameData.entities=[];gameData.cities=[];
    gameData.hexList=gameData.hexList.filter(h=>Math.abs(h.q)<=18&&Math.abs(h.r)<=15);gameData.hexes=Object.fromEntries(gameData.hexList.map(h=>[getHexKey(h),h]));
    for(const h of gameData.hexList){h.type=Math.abs(h.q)<=15&&Math.abs(h.r)<=12?'grass':'water';h.owner=h.q<0?1:2;h.cityId=null;}
    for(const [owner,q] of [[1,-12],[2,12]])for(const r of [-7,7]){const h=gameData.hexes[`${q},${r}`];gameData.cities.push({id:`${owner}-${r}`,owner,q,r,x:h.x,y:h.y});}
    const reference=wodStartingFrontierLength();
    if(kind==='enclave')gameData.hexes['-7,0'].owner=2;
    if(kind==='enclosed')for(const h of gameData.hexList)if(!isWaterHex(h))h.owner=Math.abs(h.q)<=3&&Math.abs(h.r)<=3?2:1;
    if(kind==='thread')for(let q=0;q<=9;q++)gameData.hexes[`${q},0`].owner=1;
    if(kind==='comb')for(const h of gameData.hexList)if(!isWaterHex(h)&&h.q<=10&&Math.floor((h.r+12)/4)%2===0)h.owner=1;
    if(kind==='unsupplied')for(let r=-12;r<=12;r++)gameData.hexes[`-8,${r}`].type='mountain';
    if(kind==='offshore')for(const h of gameData.hexList)if(h.q>=17&&Math.abs(h.r)<=1){h.type='grass';h.owner=1;}
    rows.push({kind,...wodValidateStartingBorders([1,2],reference)});
   }
   return rows;
  });
  console.log('fixtures',JSON.stringify(results.fixtures));
  assert(results.fixtures.find(r=>r.kind==='clean').ok);
  assert(results.fixtures.find(r=>r.kind==='offshore').ok,'real separate islands remain valid');
  for(const kind of ['enclave','enclosed','thread','comb','unsupplied'])assert(!results.fixtures.find(r=>r.kind===kind).ok,kind+' must be rejected');
  results.coastalFixtures=await page.evaluate(()=>{
   const rows=[];
   for(const kind of ['coastalSliver','smallSplitIsland','lakePocket','foldedCoast']) {
    WOD.makeBlankMap(20);gameData.entities=[];gameData.cities=[];
    gameData.hexList=gameData.hexList.filter(h=>Math.abs(h.q)<=20&&Math.abs(h.r)<=16);gameData.hexes=Object.fromEntries(gameData.hexList.map(h=>[getHexKey(h),h]));
    for(const h of gameData.hexList){h.type=Math.abs(h.q)<=15&&Math.abs(h.r)<=12?'grass':'water';h.owner=h.q<0?1:2;h.cityId=null;}
    for(const [owner,q] of [[1,-12],[2,12]])for(const r of [-7,7]){const h=gameData.hexes[`${q},${r}`];gameData.cities.push({id:`${owner}-${r}`,owner,q,r,x:h.x,y:h.y});}
    if(kind==='coastalSliver')for(const h of gameData.hexList)if(!isWaterHex(h))h.owner=h.q>=14?2:1;
    if(kind==='smallSplitIsland')for(const h of gameData.hexList)if(h.q>=18&&Math.abs(h.r)<=4){h.type='grass';h.owner=h.r<0?1:2;}
    if(kind==='lakePocket')for(const h of gameData.hexList)if(Math.abs(h.q+7)<=2&&Math.abs(h.r)<=2){h.type='water';h.owner=2;}
    if(kind==='foldedCoast')for(const h of gameData.hexList)if(!isWaterHex(h))h.owner=h.q<(h.r>=-3&&h.r<=3?10:-3)?1:2;
    rows.push({kind,...wodValidateStartingBorders([1,2])});
   }
   return rows;
  });
  console.log('coastalFixtures',JSON.stringify(results.coastalFixtures));
  assert(results.coastalFixtures.filter(r=>r.kind!=='lakePocket').every(r=>!r.ok),'coastal slivers, tiny split islands and folded coastlines reject');
  assert(results.coastalFixtures.find(r=>r.kind==='lakePocket').ok,'legacy water ownership does not create a political pocket');
  results.offshoreRepair=await page.evaluate(async()=>{
   WOD.makeBlankMap(20);gameData.entities=[];gameData.cities=[];
   for(const h of gameData.hexList){h.type=Math.abs(h.q)<=12&&Math.abs(h.r)<=12?'grass':'water';h.owner=h.q<0?1:2;h.cityId=null;}
   const island=[];for(const h of gameData.hexList)if(h.q>=16&&h.q<=19&&Math.abs(h.r)<=3){h.type='grass';h.owner=h.r<0?1:2;island.push(h);}
   for(const [owner,q] of [[1,-9],[2,9]])for(const r of [-7,7]){const h=gameData.hexes[`${q},${r}`];gameData.cities.push({id:`${owner}-${r}`,owner,q,r,x:h.x,y:h.y});}
   await wodExactEqualizePoliticalLandCounts([1,2],gameData.cities,700);
   const counts=wodCountBalancedLandByOwner([1,2]);return{owners:[...new Set(island.map(h=>h.owner))],counts,reason:gameData._startingLandBalance.reason};
  });
  assert(results.offshoreRepair.owners.length===1&&Math.abs(results.offshoreRepair.counts[1]-results.offshoreRepair.counts[2])<=1,'offshore island stays whole while mainland supplies exact quotas');
  // Reject more candidates than the former retry cap, including valid-looking
  // layouts. No army assignment/preview publication may run before acceptance.
  results.retries=[];
  for(const mode of ['solo','nested','lobby']) {
   const row=await page.evaluate(async mode=>{
    const externalRng=mode!=='solo',lobby=mode==='lobby';
    gameData.loadedCustomMap=false;gameData.mp=lobby?{enabled:true,factionSlots:[1,2]}:{enabled:false};gameData._campaignRun=null;
    gameData._wodLobbyPreviewGen=lobby;gameData._mapGenSeedBase=241024;
    document.getElementById('setupAI').value='1';document.getElementById('setupMapSize').value='40';document.getElementById('setupMapShape').value='island';
    document.getElementById('mpCfgMapSize').value='40';
    gameData._mapGenSeed=241024;gameData._wodReuseMapGenSeed=true;gameData._wodSkipMapGenLoader=true;
    gameData._mapGenOptions={cities:true,territory:true,units:true,mapShape:'island'};
    const validate=wodValidateStartingBorders,assign=assignStartingCities,ambient=Math.random;
    let calls=0,assignments=0,ticks=0;const seeds=[];const timer=setInterval(()=>ticks++,10);
    wodValidateStartingBorders=(...args)=>{calls++;seeds.push(gameData._mapGenSeed);const report=validate(...args);return calls<=24?{...report,ok:false,reason:'injected-malformed-border'}:report;};
    assignStartingCities=async(...args)=>{if(calls<=24)throw new Error('Rejected map was published');assignments++;return assign(...args);};
    if(externalRng)wodPushSeededRandom(241024);
    const start=performance.now();let row;
    try{
     await generateMap();previewLoadedMap('mapPreview');
     const layout=JSON.stringify([gameData.hexList.map(h=>[h.q,h.r,h.type,h.owner]),gameData.cities.map(c=>[c.q,c.r,c.owner])]);
     let fingerprint=0x811c9dc5;for(let i=0;i<layout.length;i++)fingerprint=Math.imul(fingerprint^layout.charCodeAt(i),0x01000193)>>>0;
     row={mode,calls,assignments,ticks,seeds:[...new Set(seeds)],ms:Math.round(performance.now()-start),diagnostics:gameData._mapGenValidation,counts:wodCountBalancedLandByOwner([1,2]),towns:gameData.cities.length,units:gameData.entities.length,fingerprint};
    }
    finally{clearInterval(timer);wodValidateStartingBorders=validate;assignStartingCities=assign;if(externalRng)wodPopRandom();gameData._wodLobbyPreviewGen=false;gameData._mapGenSeedBase=0;gameData.mp={enabled:false};}
    row.rngRestored=Math.random===ambient;return row;
   },mode);
   console.log('retries',JSON.stringify(row));results.retries.push(row);
   assert(row.calls>24&&row.assignments===1&&row.diagnostics.terrainAttempts>8);
   assert(row.seeds.length>8&&row.diagnostics.rejections['injected-malformed-border']===24);
   assert(row.diagnostics.quality.ok&&row.towns>=4&&row.units>0&&row.ticks>10&&row.rngRestored);
   assert(Math.abs(row.counts[1]-row.counts[2])<=1);
   await page.locator('#mapPreview').screenshot({path:path.join(OUT,`accepted-after-retries-${mode}.png`)});
  }
  assert.equal(results.retries[0].fingerprint,results.retries[1].fingerprint,'seeded outer callers and solo retries choose the same map');
  assert.equal(results.retries[0].fingerprint,results.retries[2].fingerprint,'lobby retries preserve the same stable base seed');
  results.politicsOnly=await page.evaluate(async()=>{
   const validate=wodValidateStartingBorders,assign=assignStartingCities;let assignments=0;
   wodValidateStartingBorders=(...args)=>({...validate(...args),ok:false,reason:'injected-malformed-border'});
   assignStartingCities=async()=>{assignments++;throw new Error('Rejected politics were deployed');};
   try{return{accepted:await wodRegeneratePoliticsOnCurrentTerrain(),assignments,quality:gameData._startingBorderQuality};}
   finally{wodValidateStartingBorders=validate;assignStartingCities=assign;}
  });
  assert(!results.politicsOnly.accepted&&results.politicsOnly.assignments===0&&!results.politicsOnly.quality.ok,'politics-only refreshes also reject malformed borders');
  results.editor=await page.evaluate(async()=>{
   const validate=wodValidateStartingBorders;let calls=0;wodValidateStartingBorders=()=>{calls++;throw new Error('Editor must not require faction borders');};
   try{gameData._mapGenOptions={cities:true,territory:false,units:false,mapShape:'island'};gameData._wodSkipMapGenLoader=true;await generateMap();return{calls,cities:gameData.cities.length,units:gameData.entities.length,owners:[...new Set(gameData.hexList.map(h=>h.owner))]};}
   finally{wodValidateStartingBorders=validate;}
  });
  assert(results.editor.calls===0&&results.editor.cities>0&&results.editor.units===0&&results.editor.owners.every(o=>o===0));
  await page.evaluate(()=>showPanel('credits'));
  const testers=page.locator('#playtesterCredits');await testers.scrollIntoViewIfNeeded();
  assert((await testers.innerText()).includes('Chris Meehan')&&(await testers.innerText()).includes('Bailey Carpenter'));
  assert(await testers.evaluate(e=>e.previousElementSibling.textContent.includes('Andrew Meehan')));
  await page.locator('#creditsPanel').screenshot({path:path.join(OUT,'playtester-credits.png')});
  await page.setViewportSize({width:390,height:844});await testers.scrollIntoViewIfNeeded();
  assert(await testers.evaluate(e=>e.scrollWidth<=e.clientWidth));
  await page.screenshot({path:path.join(OUT,'playtester-credits-mobile.png')});
  fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));assert.equal(errors.length,0,errors.join('\n'));
 }finally{fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const s of relay.clients)s.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
