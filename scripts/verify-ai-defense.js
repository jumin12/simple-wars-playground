const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/ai-defense');fs.mkdirSync(OUT,{recursive:true});
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
  const results=await page.evaluate(()=>{
   const reset=(radius=30)=>{
    WOD.makeBlankMap(radius);gameState='PLAYING';gameData.mp={enabled:false};gameData._campaignRun=null;
    gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.aiTaskForces={};gameData._aiDefenseByOwner={};gameData._aiEconomyClock=0;
    gameData._aiStratWork=null;gameData._aiFormChunk=null;gameData.aiStrategyTimer=0;gameData.aiFocusTimer=0;
    gameData.encircledHexes=new Set();gameData._encircWork=null;gameData.marineWaterSupplyHexes=new Set();gameData._matchReadyForEndChecks=false;
    for(const h of gameData.hexList){h.type='grass';h.owner=1;h.cityId=null;}
    wodInvalidateAiFrontlineHexCache();
   };
   const hex=(q,r)=>gameData.hexes[`${q},${r}`];
   const town=(q,r,owner,id)=>{const h=hex(q,r);h.type='urban';h.owner=owner;h.cityId=id;const c={id,name:id,owner,q,r,x:h.x,y:h.y,hp:1000,maxHp:1000,hasFactory:false,hasHarbor:false};gameData.cities.push(c);return c;};
   const spawn=(q,r,type='light',owner=2)=>{const h=hex(q,r);return createUnitAt(type,h.x,h.y,owner,{startSpawn:true});};
   const refresh=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid(200);wodInvalidateAiFrontlineHexCache();};
   const corridor=(width=1)=>{
    reset();for(const h of gameData.hexList)if(h.q<=-10&&Math.abs(h.r)<=7||h.q>=4&&h.q<=23&&Math.abs(h.r)<=12||h.q>=-9&&h.q<=3&&h.r>=0&&h.r<width)h.owner=2;
    town(-17,0,2,'Supply base');town(-22,-20,1,'Enemy base');
    for(let i=0;i<10;i++)spawn(14+i%3,-5+Math.floor(i/3));for(let i=0;i<8;i++)spawn(-14+i%2,-3+Math.floor(i/2));spawn(-3,3,'light',1);refresh();
   };
   corridor();let army=gameData.entities.filter(u=>u.owner===2),plan=wodAiEnsureTaskForcePlan(2,army), defense=wodAiReadDefense(2,army,true);
   const result={corridors:defense.corridors.map(t=>({q:t.holdHex.q,r:t.holdHex.r,atRisk:t.atRisk,area:t.area})),preventive:defense.jobs.filter(j=>j.kind==='corridor').map(j=>j.members.length)};
   const saved=Object.fromEntries(army.map(u=>[u.uid,plan.unitJob[u.uid]]));
   for(let q=0;q<=1;q++)hex(q,0).owner=1;gameData._aiEconomyClock=7;refresh();
   const hurt=army.find(u=>u.x>0);hurt.hp=hurt.maxHp*.2;hurt.retreating=true;
   defense=wodAiReadDefense(2,army,true);const relief=defense.jobs.find(j=>j.kind==='relief');
   result.relief=relief&&{area:relief.area,trapped:relief.trapped.length,members:relief.members.length,inner:relief.innerHex.q,outer:relief.holdHex.q,hurtIncluded:relief.members.includes(hurt.uid)};
   const inside=army.find(u=>relief?.trapped.includes(u.uid)&&u!==hurt),outside=army.find(u=>relief?.members.includes(u.uid)&&!relief.trapped.includes(u.uid));
   const targets=[];
   for(const u of [inside,outside])if(u){u.target={x:-1000,y:0};u.orderTarget={x:-1000,y:0};u.aiOrderResponseId=null;const interrupted=!wodAiShouldKeepCurrentOrder(u);wodAiIssueTaskForceOrder(u,wodAiGetUnitTaskJob(u),1);targets.push({inside:u===inside,interrupted,q:getNearestHexToPoint(u.orderTarget?.x,u.orderTarget?.y)?.q});}
   result.targets=targets;
   for(let q=0;q<=1;q++)hex(q,0).owner=2;gameData._aiEconomyClock=14;refresh();wodAiReadDefense(2,army,true);
   gameData.entities=gameData.entities.filter(u=>u.owner===2);refresh();wodAiReadDefense(2,army,true);
   result.reconnected=army.every(u=>wodAiGetUnitTaskJob(u)?.id===saved[u.uid]);
   corridor(2);army=gameData.entities.filter(u=>u.owner===2);defense=wodAiReadDefense(2,army,true);result.wideCorridors=defense.corridors.map(t=>({q:t.holdHex.q,atRisk:t.atRisk}));
   // A front-line attack far from either city still receives a territory response.
   reset();for(const h of gameData.hexList)h.owner=h.q>=0?2:1;town(20,20,2,'Remote base');town(-20,20,1,'Enemy');
   for(let i=0;i<12;i++)spawn(5+i%3,-15+Math.floor(i/3));for(let i=0;i<4;i++)spawn(-1,-15+i,'light',1);refresh();
   army=gameData.entities.filter(u=>u.owner===2);plan=wodAiEnsureTaskForcePlan(2,army);defense=wodAiReadDefense(2,army,true);
   result.territory=defense.jobs.filter(j=>j.kind==='territory').map(j=>({members:j.members.length,q:j.holdHex.q,r:j.holdHex.r}));
   const anchor=hex(5,0),forest=hex(5,1),swamp=hex(4,0);forest.type='forest';swamp.type='swamp';
   const foot=spawn(5,0),tank=spawn(5,0,'heavy');refresh();
   const footStand=wodAiDefendStandHex(2,anchor,foot),tankStand=wodAiDefendStandHex(2,anchor,tank);
   result.terrain={infantry:footStand.type,armor:tankStand.type};
   for(let r=-2;r<=2;r++)hex(6,r).type='water';hex(7,0).type='urban';
   result.riverSafe=wodAiDefendStandHex(2,anchor,foot)!==hex(7,0); // A blocked direct approach must not jump a river.
   const border=hex(0,-12),safe=hex(5,-12),remote=hex(16,-12);
   result.forts={border:wodAiScoreFortHex(border,2),safe:wodAiScoreFortHex(safe,2),remote:wodAiScoreFortHex(remote,2)};
   gameData.forts.push({id:'Garrison fort',owner:2,q:5,r:-12,x:safe.x,y:safe.y,hp:1000,maxHp:1000});
   gameData.aiTaskForces={};gameData._aiDefenseByOwner={};plan=wodAiEnsureTaskForcePlan(2,army);
   result.garrison=plan.jobs.filter(j=>j.fort).map(j=>({id:j.fort.id,n:j.members.length}));
   gameData.entities=gameData.entities.filter(u=>u.owner===2);refresh();
   result.quietGarrisonNeed=wodAiFortThreatNeed(gameData.forts[0],2);
   gameData.constructionJobs.push({mode:'fort',owner:2,q:8,r:8,x:hex(8,8).x,y:hex(8,8).y,total:60,remaining:60});
   plan=wodAiEnsureTaskForcePlan(2,army);result.constructionGuard=plan.jobs.some(j=>j.fort?.mode==='fort'&&j.members.length);
   result.forts.overlap=wodAiScoreFortHex(hex(6,-12),2);
   // Water supplies only the marines of an otherwise trapped coastal formation.
   reset();for(const h of gameData.hexList){h.owner=h.q<0?1:2;if(h.q===8)h.owner=1;if(h.r===10)h.type='water';}
   town(3,0,2,'Home');town(-10,0,1,'Enemy');const marine=spawn(12,8,'marine'),infantry=spawn(13,8);spawn(4,0);refresh();
   defense=wodAiReadDefense(2,gameData.entities.filter(u=>u.owner===2),true);
   result.marineSupply={marineTrapped:defense.pockets.some(p=>p.trapped.includes(marine.uid)),infantryTrapped:defense.pockets.some(p=>p.trapped.includes(infantry.uid))};
   // Let actual strategy, pathfinding, movement and territorial capture reopen a cut.
   reset(24);for(const h of gameData.hexList)if(h.q<=-1||h.q>=1&&h.q<=10&&Math.abs(h.r)<=4)h.owner=2;
   town(-8,0,2,'Relief base');town(15,-15,1,'Enemy');
   const pocketTroops=[spawn(2,-1),spawn(2,1),spawn(3,0)],relievers=[spawn(-2,-1),spawn(-2,1),spawn(-3,0)];refresh();
   gameData.aiMoneyByOwner={2:0};gameData.aiManpowerByOwner={2:100000};gameData.money=100000;gameData.manpower=100000;
   gameData._aiEconomyPlans={};gameData._aiSpawnPulse=null;gameData._aiSpawnBurst=null;gameData._aiContactByOwner={};
   let openedAt=null;
   for(let i=0;i<700;i++) {
    update(.1);
    if(i%10===0){const report=wodAiReadDefense(2,gameData.entities.filter(u=>u.owner===2),true);if(!report.pockets.some(p=>p.trapped.some(id=>pocketTroops.some(u=>u.uid===id&&u.hp>0)))){openedAt=(i+1)/10;break;}}
   }
   result.breakout={openedAt,alive:pocketTroops.filter(u=>u.hp>0&&gameData.entities.includes(u)).length,captured:gameData.hexList.filter(h=>h.q===0&&h.owner===2).length,
    inside:pocketTroops.map(u=>({hp:u.hp,q:getNearestHexToPoint(u.x,u.y)?.q})),outside:relievers.map(u=>({hp:u.hp,q:getNearestHexToPoint(u.x,u.y)?.q}))};
   // Linear graph scan on a large map, without recursive stack overflow.
   reset(80);for(const h of gameData.hexList)h.owner=h.q>=0?2:1;town(40,0,2,'Large home');town(-40,0,1,'Enemy');
   for(let i=0;i<90;i++)spawn(3+i%10,-25+Math.floor(i/10));for(let i=0;i<20;i++)spawn(-1,-25+i*2,'light',1);refresh();
   const times=[];for(let i=0;i<3;i++){const t=performance.now();defense=wodAiReadDefense(2,gameData.entities.filter(u=>u.owner===2),true);times.push(performance.now()-t);}
   result.performance={tiles:gameData.hexList.length,scanMs:times,cached:(()=>{const t=performance.now();for(let i=0;i<100;i++)wodAiReadDefense(2,gameData.entities.filter(u=>u.owner===2));return performance.now()-t;})()};
   gameData.selection=[];gameData.fogOfWar=false;
   gameData.camera.zoom=.25;gameData.camera.x=-canvas.clientWidth/2;gameData.camera.y=-canvas.clientHeight/2;
   const editor=document.getElementById('mapEditorApp');if(editor)editor.style.display='none';UI.panels.forEach(p=>p.classList.add('hidden'));UI.mainMenu.classList.add('hidden');UI.inGameUI.classList.remove('hidden');canvas.style.display='block';WOD.setEditorSuppressTerrainBake(false);wodSyncViewportAndCanvas();wodMarkTerrainFullDirty();updateTerrainCache();draw();
   return result;
  });
  fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));
  await page.screenshot({path:path.join(OUT,'territory-defense.png')});
  assert(results.corridors.some(c=>c.atRisk>=10&&c.area>100),'large army beyond a threatened supply neck is detected');
  assert(results.preventive.some(n=>n>=2),'troops defend the corridor before it closes');
  assert(results.relief?.area>100&&results.relief.trapped===10&&results.relief.members>10&&results.relief.hurtIncluded,'large pocket has trapped and outside relief troops, including wounded');
  assert(results.targets.length===2&&results.targets.every(t=>t.interrupted)&&results.targets.find(t=>t.inside).q===1&&results.targets.find(t=>!t.inside).q===0,'stale orders interrupt and both forces attack opposing ends of the breach');
  assert(results.reconnected,'original missions resume after supply is restored');
  assert(results.wideCorridors.some(c=>c.atRisk>=10),'two-tile supply corridors receive preventive defense');
  assert(results.territory.some(t=>t.members>=2&&t.r<0),'territory away from cities is defended');
  assert.equal(results.terrain.infantry,'forest');assert.equal(results.terrain.armor,'grass');assert(results.riverSafe);
  assert(results.forts.border<=-1e9&&results.forts.remote<=-1e9&&results.forts.safe>52&&results.forts.overlap<=-1e9,'forts require depth, nearby troops, spacing and strategic purpose');
  assert(results.garrison.some(g=>g.n>=1)&&results.quietGarrisonNeed===1&&results.constructionGuard,'completed forts retain a permanent garrison');
  assert(!results.marineSupply.marineTrapped&&results.marineSupply.infantryTrapped,'marine-only water supply is preserved');
  assert(results.breakout.openedAt!==null&&results.breakout.alive>=2&&results.breakout.captured>=1,'autonomous breakout reopens supply before trapped troops die');
  assert(results.performance.scanMs.every(ms=>ms<150)&&results.performance.cached<30,'global supply scans remain bounded and reused');
  assert.equal(errors.length,0,errors.join('\n'));console.log(JSON.stringify(results,null,2));
 }finally{fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const s of relay.clients)s.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
