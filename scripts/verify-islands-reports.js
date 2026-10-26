const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/islands-reports');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(ROOT,'.'+(req.url.split('?')[0]==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0])));if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();fs.readFile(file,(err,body)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream');res.end(body);});});
(async()=>{
 const relay=new WebSocketServer({port:8080});relay.on('error',()=>{});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],results={};page.on('pageerror',e=>errors.push(e.stack));
 try {
  await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
  await page.evaluate(()=>{setGameSpeed(0,true);wodDismissChangelogPopup();bootstrapMenuBackgroundBattle=async()=>{};wodPrewarmMenuBattleForSummary=()=>{};
   window.islandFixture=(invader=1,width=11,height=9)=>{
    WOD.makeBlankMap(30);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData.entities=[];gameData._hexCombatOcc=new Map();gameData.unitSpatialGrid=null;gameData.cities=[];gameData.forts=[];gameData.bridges=[];gameData.constructionJobs=[];gameData._encircWork=null;gameData.encircledHexes=new Set();gameData.encircledReliefHexes=new Set();gameData._citySupplyCache=null;gameData._cityLandFootprint=null;gameData._territoryCleanupKeys=new Set();gameData._matchReadyForEndChecks=false;gameData._wodClaimBatch=null;gameData.fogOfWar=false;gameData.alliances=[];gameData.uiSettings.mapSkin='default';
    for(const h of gameData.hexList){h.type='water';h.owner=0;h.cityId=null;}
    for(let q=-20;q<=-10;q++)for(let r=-14;r<=14;r++){const h=gameData.hexes[`${q},${r}`];h.type='grass';h.owner=r<0?1:2;}
    for(const [q,r,owner]of[[-15,-8,1],[-15,8,2]]){const h=gameData.hexes[`${q},${r}`];h.type='urban';h.cityId='home-'+owner;gameData.cities.push({id:h.cityId,q,r,x:h.x,y:h.y,owner,hp:1000,maxHp:1000,name:'Home '+owner});}
    const island=[];for(let q=2;q<2+width;q++)for(let r=0;r<height;r++){const h=gameData.hexes[`${q},${r}`];h.type='sand';h.owner=3-invader;island.push(h);}
    wodMarkTerrainFullDirty();return island;
   };
   window.scanIslands=()=>{gameData.encirclementTimer=100;gameData._encircWork=null;updateEncirclements(1);for(let i=0;i<2000&&gameData._encircWork;i++)wodEncirclementProcessChunk();if(gameData._encircWork)throw Error('Supply scan did not finish');};
  });
  results.coasts=await page.evaluate(()=>{
   const rows=[],sheet=document.createElement('canvas');sheet.width=900;sheet.height=300;const sc=sheet.getContext('2d');sc.fillStyle='#142d3b';sc.fillRect(0,0,900,300);
   for(const [index,offset]of[0,.25,.5].entries()){
    islandFixture();for(const h of gameData.hexList){h.type='water';h.owner=0;}gameData.hexes['0,0'].type='sand';
    const c=document.createElement('canvas');c.width=c.height=150;const cc=c.getContext('2d'),sp=gameData.hexRadius*1.35,ox=75+offset,oy=75+offset;
    for(const type of ['water','sand','grass','forest','swamp','hill','mountain','urban'])drawTerrainBlobLayer(cc,type,ox,oy);
    const l=Math.round(ox-sp/2),r=Math.round(ox+sp/2),t=Math.round(oy-sp/2),b=Math.round(oy+sp/2);
    const points=[[r-1,b-4],[r-4,b-1],[l,t+3],[l+3,t],[l,b-4],[l+3,b-1],[r-1,t+3],[r-4,t]];
    const leaked=points.filter(([x,y])=>{const p=cc.getImageData(x,y,1,1).data;return p[0]>40;}).length;
    sc.drawImage(c,index*300,0,300,300);rows.push({offset,leaked});
   }
   window.coastImage=sheet.toDataURL();return rows;
  });assert(results.coasts.every(r=>r.leaked===0),JSON.stringify(results.coasts));fs.writeFileSync(path.join(OUT,'rounded-coasts.png'),Buffer.from((await page.evaluate(()=>window.coastImage)).split(',')[1],'base64'));
  results.landings=await page.evaluate(()=>{
   const rows=[];for(const invader of[1,2])for(const [width,height]of[[11,9],[6,4]]){
    const island=islandFixture(invader,width,height),h=island.find(h=>h.q===2&&h.r===1),u=createUnitAt('marine',h.x,h.y,invader,{startSpawn:true});u.x=h.x;u.y=h.y;
    claimTerritoryAroundUnit(u);wodApplyTerritoryClaimBatch();const initial=island.filter(h=>h.owner===invader).length;
    scanIslands();for(const hex of island)gameData._territoryCleanupKeys.add(getHexKey(hex));for(let i=0;i<10;i++)wodCleanupTinyTerritoryPockets(1000);scanIslands();
    const final=island.filter(h=>h.owner===invader).length,flagged=island.filter(h=>gameData.encircledHexes.has(getHexKey(h))).length;
    const ordinary=createUnitAt('light',h.x,h.y,invader,{startSpawn:true});ordinary.x=h.x;ordinary.y=h.y;
    rows.push({invader,width,height,initial,final,flagged,marineSupplied:wodGetUnitEncirclementState(u,h)===null,infantryUnsupplied:!!wodGetUnitEncirclementState(ordinary,h)});
   }return rows;
  });assert(results.landings.every(r=>r.initial===6&&r.initial===r.final&&r.flagged===0&&r.marineSupplied&&r.infantryUnsupplied),JSON.stringify(results.landings));
  results.enclosed=await page.evaluate(()=>{
   const island=islandFixture();for(const h of island)h.owner=1;const pocket=gameData.hexes['7,4'];pocket.owner=2;scanIslands();return pocket.owner===1;
  });assert(results.enclosed,'a genuinely enclosed inland pocket on an island still transfers');
  // Make a multiplayer report whose local player is not faction one.
  await page.evaluate(()=>{
   islandFixture();gameData.mp={enabled:true,isHost:false,localSlot:2,factionSlots:[1,2],humanSlots:[1,2]};gameData.money=12000;gameData.manpower=8000;gameData.aiMoneyByOwner={2:18000};gameData.aiManpowerByOwner={2:9000};
   for(const owner of[1,2])for(const [i,type]of['light','marine','heavy','ship','transport'].entries()){const u=createUnitAt(type,-15*27,(owner===1?-8:8)*27+i*45,owner,{startSpawn:true});u.hp=u.maxHp;}
   gameData._battleLedger={seconds:245,byOwner:{1:{unitsLost:2,unitsDestroyed:1,landGained:15},2:{unitsLost:1,unitsDestroyed:3,landGained:20,landLost:5,moneySpent:6000,damageDealt:125.5,combatDamageTaken:48.2}}};gameData._battleLedgerMap=gameData.hexes;
   UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.classList.remove('hidden');UI.escMenu.classList.add('hidden');toggleWodStatsPanel(true);
  });
  assert.equal(await page.locator('.stats-m-page.active').getAttribute('data-stats-page'),'players','Players opens first');
  assert.equal(await page.locator('#playerSummaryBody [data-stats-owner]').first().getAttribute('data-stats-owner'),'2','local multiplayer seat appears first');
  results.tabs=[];
  for(const width of[1440,768,390,320]){
   await page.setViewportSize({width,height:width>900?1000:844});
   for(const section of['players','economy','forces','combat']){
    await page.locator('#statsMenu .stats-m-pages').evaluate(e=>e.scrollTop=e.scrollHeight);await page.locator(`#report-tab-${section}`).click();
    const state=await page.evaluate(()=>{const root=document.querySelector('#statsMenu'),scroll=root.querySelector('.stats-m-pages'),active=root.querySelector('.stats-m-page.active');return{active:active.dataset.statsPage,visible:[...root.querySelectorAll('[role="tabpanel"]')].filter(p=>getComputedStyle(p).display!=='none').length,scroll:scroll.scrollTop,noOverflow:scroll.scrollWidth<=scroll.clientWidth+2,heading:active.querySelector('h3').getBoundingClientRect().top,viewport:scroll.getBoundingClientRect().top,tabs:root.querySelector('.stats-m-tabs').getBoundingClientRect().bottom,display:getComputedStyle(active).display,gap:getComputedStyle(active).gap};});
    assert(state.active===section&&state.visible===1&&state.display==='grid'&&state.scroll===0&&state.noOverflow&&state.heading>=state.tabs&&Math.abs(state.heading-state.viewport)<5,JSON.stringify({width,section,state}));
    results.tabs.push({width,section,...state});if(width===1440||width===390)await page.screenshot({path:path.join(OUT,`report-${width}-${section}.png`)});
   }
  }
  await page.locator('#report-tab-combat').focus();await page.keyboard.press('Home');assert.equal(await page.locator('.stats-m-tab[aria-selected="true"]').getAttribute('data-stats-page'),'players');await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.stats-m-page.active').getAttribute('data-stats-page'),'economy');await page.keyboard.press('End');assert.equal(await page.locator('.stats-m-page.active').getAttribute('data-stats-page'),'combat');
  assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
 }finally{fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const s of relay.clients)s.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
