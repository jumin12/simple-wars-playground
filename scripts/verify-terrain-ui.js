const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/terrain-ui');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(ROOT,'.'+(req.url.split('?')[0]==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0])));
 if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(err,body)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ogg':'audio/ogg','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream');res.end(body);});
});
(async()=>{
 const relay=new WebSocketServer({port:8080});relay.on('error',()=>{});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack));
 try{
  await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');
  await page.waitForFunction(()=>window.__wodDebug?.().gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
  await page.evaluate(()=>{setGameSpeed(0,true);wodDismissChangelogPopup?.();});
  const results={};
  results.hud=[];
  await page.evaluate(()=>{const units=gameData.entities.filter(u=>u.owner===1).slice(0,3);units.forEach(ensureUnitId);gameData.controlGroups={1:units.map(u=>u.uid)};wodRefreshCommandHud(true);});
  for(const viewport of [{width:1440,height:900},{width:1024,height:600}]) {
   await page.setViewportSize(viewport);await page.waitForTimeout(150);
   for(const pane of ['structures','units']) {
    await page.evaluate(pane=>{const root=document.getElementById('wodPcProdRoot');root.classList.add('wod-pc-collapsed');root.querySelector(`.wod-pc-prod-tab[data-wod-pc-pane="${pane}"]`).click();},pane);
    await page.waitForTimeout(70);
    const transition=await page.evaluate(()=>{const h=document.getElementById('wodCommandHud').getBoundingClientRect(),p=document.getElementById('wodPcProdRoot').getBoundingClientRect();return h.bottom<=p.top-6;});
    assert(transition,'HUD follows dock during expansion');
    await page.waitForTimeout(310);
    await page.screenshot({path:path.join(OUT,`hud-${viewport.width}-${pane}.png`)});
    results.hud.push(await page.evaluate(({viewport,pane})=>{const h=document.getElementById('wodCommandHud').getBoundingClientRect(),p=document.getElementById('wodPcProdRoot').getBoundingClientRect();return {viewport,pane,hudBottom:h.bottom,dockTop:p.top,visible:h.top>=0&&h.left>=0&&h.width>0};},{viewport,pane}));
   }
  }
  await page.setViewportSize({width:390,height:844});
  for(const pane of ['build','units']) {
   await page.evaluate(pane=>UI.inGameUI.setAttribute('data-mtab',pane),pane);await page.waitForTimeout(150);
   results.hud.push(await page.evaluate(pane=>{const h=document.getElementById('wodCommandHud').getBoundingClientRect(),p=document.querySelector('.wod-m-sheet--'+pane).getBoundingClientRect();return {viewport:{width:390,height:844},pane,hudBottom:h.bottom,dockTop:p.top,visible:h.top>=0&&h.left>=0&&h.width>0};},pane));
   await page.screenshot({path:path.join(OUT,`hud-mobile-${pane}.png`)});
  }
  await page.evaluate(()=>UI.inGameUI.removeAttribute('data-mtab'));await page.setViewportSize({width:1440,height:900});
  results.movement=await page.evaluate(()=>{
   const cases=[];
   for(const shape of ['straight','bend','shore','single','ai','closed']) {
    WOD.makeBlankMap(25);gameState='PLAYING';gameData.mp={enabled:false};gameData._campaignRun=null;gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.bridges=[];gameData.constructionJobs=[];gameData._wodClaimBatch=null;gameData._matchReadyForEndChecks=false;gameData._wodPfCache=new Map();
    gameData.aiTaskForces={};gameData._aiDefenseByOwner={};gameData._encircWork=null;gameData.encircledHexes=new Set();
    for(const h of gameData.hexList){h.owner=1;h.type='grass';h.cityId=null;
     if(Math.abs(h.q)<=4&&h.r!==0)h.type=shape==='shore'?'water':'mountain';
     if(shape==='bend'&&h.q>=-4&&h.q<=4){h.type='mountain';if(h.q<=0&&h.r===0||h.q===0&&h.r>=0&&h.r<=3||h.q>=0&&h.r===3)h.type='grass';}
     if(shape==='closed'&&h.q===0)h.type='mountain';
    }
    const n=['single','closed'].includes(shape)?1:6, units=[];
    for(let i=0;i<n;i++) {
     const h=gameData.hexes[`${-8-Math.floor(i/3)*2},${(i%3-1)*2}`];
     const u=createUnitAt(i%3===1?'heavy':'light',h.x,h.y,shape==='ai'?2:1,{startSpawn:true});units.push(u);
     const g=gameData.hexes[`${10+Math.floor(i/3)*2},${(shape==='bend'?3:0)+(i%3-1)*2}`];
     wodBeginSimPfBudget(n);assignUnitMoveAlongWaypoints(u,[{x:g.x,y:g.y}]);
    }
    let invalid=0, arrived=null;
    for(let step=0;step<3000;step++) {
     gameData._wodSimTick=(gameData._wodSimTick||0)+1;wodBeginSimPfBudget(n);gameData.unitSpatialGrid=buildUnitSpatialGrid(96);wodRebuildHexCombatOccupancy();
     for(const u of units) {moveUnitTowardTarget(u,.1);if(!wodSamplePosOnWalkableTerrain(u,u.x,u.y))invalid++;}
     gameData.unitSpatialGrid=buildUnitSpatialGrid(96);wodRunUnitSeparationSync(40,96);
     if(units.every(u=>getNearestHexToPoint(u.x,u.y)?.q>4)){arrived=(step+1)/10;break;}
    }
    cases.push({shape,arrived,invalid,positions:units.map(u=>({type:u.type,x:u.x,y:u.y,q:getNearestHexToPoint(u.x,u.y)?.q,r:getNearestHexToPoint(u.x,u.y)?.r,target:u.target,path:u.target?u.path?.slice(0,4):null,order:u.orderTarget}))});
   }
   return cases;
  });
  results.borders=await page.evaluate(()=>{
   const cases=[];
   for(const pattern of ['neck','junction','checkerboard','enclave','coast']) {
    WOD.makeBlankMap(20);
    for(const h of gameData.hexList){h.owner=h.q<0?1:2;h.type='grass';if(pattern==='neck'&&h.q>=0&&h.q<5&&Math.abs(h.r)>1)h.owner=1;if(pattern==='junction'&&h.r>0)h.owner=3;if(pattern==='checkerboard')h.owner=1+((h.q+h.r+1000)%2);if(pattern==='enclave'&&h.q===-6&&h.r===0)h.owner=2;if(pattern==='coast'&&h.r>0)h.type='water';}
    const spacing=gameData.hexRadius*1.35,chains=wodCollectDiplomacyBorderChains(gameData.hexList,gameData.hexes,0,0,spacing);
    const key=(a,b)=>[`${Math.round(a.x/spacing*2)},${Math.round(a.y/spacing*2)}`,`${Math.round(b.x/spacing*2)},${Math.round(b.y/spacing*2)}`].sort().join('|');
    const expected=new Set(),got=new Map();let invalid=0,repeats=0;
    for(const h of gameData.hexList)for(const d of [{q:1,r:0},{q:0,r:1}]){const n=gameData.hexes[`${h.q+d.q},${h.r+d.r}`];if(!n||!h.owner||!n.owner||h.owner===n.owner||pattern==='coast'&&(h.r>0||n.r>0))continue;const x=(h.x+n.x)/2,y=(h.y+n.y)/2;expected.add(key({x:x-(d.r?spacing/2:0),y:y-(d.q?spacing/2:0)},{x:x+(d.r?spacing/2:0),y:y+(d.q?spacing/2:0)}));}
    for(const c of chains){const seen=new Set();for(const p of c.pts){const k=p.x+','+p.y;if(seen.has(k))repeats++;seen.add(k);}for(let i=0;i<c.pts.length-(c.closed?0:1);i++){const a=c.pts[i],b=c.pts[(i+1)%c.pts.length],k=key(a,b);if(!expected.has(k))invalid++;got.set(k,(got.get(k)||0)+1);}}
    cases.push({pattern,chains:chains.length,expected:expected.size,got:got.size,invalid,repeats,missing:[...expected].filter(k=>!got.has(k)).length,duplicates:[...got.values()].filter(n=>n!==1).length});
   }
   WOD.makeBlankMap(20);gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.bridges=[];
   for(const h of gameData.hexList){h.owner=h.q<0?1:h.r<0?2:3;h.type=h.r>7?'water':'grass';h.cityId=null;if(h.q===-5&&h.r===2)h.owner=2;}
   const h=gameData.hexes['-5,2'];h.type='urban';h.cityId='Defended enclave';gameData.cities=[{id:h.cityId,name:'Defended enclave',owner:2,q:h.q,r:h.r,x:h.x,y:h.y,hp:1000,maxHp:1000}];
   gameState='PLAYING';gameData.mp={enabled:false};gameData._matchReadyForEndChecks=false;gameData.selection=[];gameData.constructionJobs=[];gameData.fogOfWar=false;gameData.layers.terrain=true;gameData.layers.diplomacy=true;gameData.layers.territory=true;gameData.layers.cities=true;
   document.getElementById('wodPcProdRoot').classList.add('wod-pc-collapsed');const editor=document.getElementById('mapEditorApp');if(editor)editor.style.display='none';UI.panels.forEach(p=>p.classList.add('hidden'));UI.mainMenu.classList.add('hidden');UI.inGameUI.classList.remove('hidden');canvas.style.display='block';WOD.setEditorSuppressTerrainBake(false);wodSyncViewportAndCanvas();
   gameData.camera.zoom=1.3;gameData.camera.x=-canvas.clientWidth/2;gameData.camera.y=-canvas.clientHeight/2;wodMarkTerrainFullDirty();updateTerrainCache();draw();
   return cases;
  });
  await page.waitForTimeout(350);await page.screenshot({path:path.join(OUT,'frontline-junction.png')});
  if(await page.evaluate(()=>typeof wodCleanupTinyTerritoryPockets==='function'))results.cleanup=await page.evaluate(()=>{
   const rows=[];
   for(const type of ['mountain','grass','water','pair','unit','city','fort','site','large','allied']) {
    WOD.makeBlankMap(20);gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.alliances=type==='allied'?[[1,2]]:[];gameData._territoryCleanupKeys=new Set();gameState='PLAYING';
    for(const h of gameData.hexList){h.type='grass';h.owner=1;h.cityId=null;}
    const h=gameData.hexes['0,0'];h.owner=2;if(['mountain','water'].includes(type))h.type=type;
    if(type==='pair'||type==='large')gameData.hexes['1,0'].owner=2;if(type==='large')gameData.hexes['2,0'].owner=2;
    if(type==='unit')createUnitAt('light',h.x,h.y,2,{startSpawn:true});
    if(type==='city'){h.type='urban';h.cityId='Protected town';gameData.cities=[{id:h.cityId,owner:2,q:0,r:0,x:h.x,y:h.y}];}
    if(type==='fort')gameData.forts=[{id:'Fort',owner:2,q:0,r:0,x:h.x,y:h.y}];
    if(type==='site')gameData.constructionJobs=[{mode:'fort',owner:2,q:0,r:0,x:h.x,y:h.y}];
    gameData._territoryCleanupKeys.add('0,0');wodCleanupTinyTerritoryPockets(100);
    if(type==='water'){gameData._waterPoliticsWork=null;gameData._waterPoliticsDirty=true;for(let i=0;i<1000&&(gameData._waterPoliticsWork||gameData._waterPoliticsDirty);i++)wodUpdateWaterPolitics();}
    rows.push({type,owner:h.owner,pair:gameData.hexes['1,0'].owner});
   }
   for(const mode of ['queued','guest','pregame']) {
    WOD.makeBlankMap(20);gameState='PLAYING';gameData._campaignRun=null;gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.alliances=[];gameData._territoryCleanupKeys=new Set();
    for(const h of gameData.hexList){h.owner=1;h.type='grass';h.cityId=null;}
    gameData.hexes['0,0'].owner=2;gameData.hexes['1,0'].owner=2;gameData._matchReadyForEndChecks=mode!=='pregame';gameData.mp=mode==='guest'?{enabled:true,isHost:false}:{enabled:false};
    setHexOwner(gameData.hexes['1,0'],1);const queued=gameData._territoryCleanupKeys.size;wodCleanupTinyTerritoryPockets(100);rows.push({type:mode,owner:gameData.hexes['0,0'].owner,queued});
   }
   // Hostile regiments continue to block a pass even though friends file closer.
   WOD.makeBlankMap(20);gameData.entities=[];gameData.mp={enabled:false};
   for(const h of gameData.hexList){h.owner=1;h.type=Math.abs(h.q)<=4&&h.r!==0?'mountain':'grass';}
   const h=gameData.hexes['0,0'],a=createUnitAt('light',h.x,h.y,1,{startSpawn:true}),b=createUnitAt('heavy',h.x+20,h.y,2,{startSpawn:true});a.x=h.x;a.y=h.y;b.x=h.x+20;b.y=h.y;gameData.unitSpatialGrid=buildUnitSpatialGrid(96);
   rows.push({type:'enemyCollision',blocked:isWorldPositionBlockedByUnits(a,a.x+1,a.y)});
   return rows;
  });
  fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
  if(process.env.WOD_BASELINE!=='1') {
   assert(results.hud.every(r=>r.visible&&r.hudBottom<=r.dockTop-6),'group controls always sit above expanded docks');
   assert(results.movement.filter(r=>r.shape!=='closed').every(r=>r.arrived!==null&&r.invalid===0),'infantry and armor cross narrow straight, bent and shore passages');
   assert(results.movement.find(r=>r.shape==='closed').arrived===null&&results.movement.find(r=>r.shape==='closed').invalid===0,'a solid mountain wall remains impassable');
   assert(results.borders.every(r=>r.invalid===0&&r.missing===0&&r.duplicates===0&&r.repeats===0),'every real territory boundary is drawn exactly once without synthetic crossings');
   assert(results.cleanup?.filter(r=>['mountain','grass','water','pair'].includes(r.type)).every(r=>r.owner===1&&r.pair===1),'empty tiny remnants are absorbed');
   assert(results.cleanup?.filter(r=>['unit','city','fort','site','large','allied'].includes(r.type)).every(r=>r.owner===2),'defended, inhabited, large and allied pockets remain');
   assert(results.cleanup.find(r=>r.type==='queued').owner===1&&results.cleanup.find(r=>r.type==='queued').queued>0,'live territory changes queue and clear nearby remnants');
   assert(results.cleanup.filter(r=>['guest','pregame'].includes(r.type)).every(r=>r.owner===2&&r.queued===0),'guests and map generation do not perform remnant captures');
   assert(results.cleanup.find(r=>r.type==='enemyCollision').blocked,'enemy bodies remain solid in narrow passages');
   assert.equal(errors.length,0,errors.join('\n'));
  }
 }finally{fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const s of relay.clients)s.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
