const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/assault-commands');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(ROOT,'.'+(req.url.split('?')[0]==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0])));
 if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(err,body)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ogg':'audio/ogg','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream');res.end(body);});
});
(async()=>{
 const relay=new WebSocketServer({port:8080});relay.on('error',()=>{});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack));
 try{
  await page.goto(url+'/?autostart=1');
  await page.waitForFunction(()=>window.__wodDebug?.().gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
  await page.evaluate(()=>{setGameSpeed(0,true);wodDismissChangelogPopup();gameData._matchReadyForEndChecks=false;});
  assert.equal(await page.evaluate(()=>wodBattleAudio.debug().volume),1,'fresh SFX default is 100%');
  assert(await page.locator('.wod-sfx-vol').evaluateAll(els=>els.every(e=>e.value==='100')));
  await page.evaluate(()=>wodMusic.loadPlaylist());
  const credits=await page.evaluate(()=>({count:document.querySelector('.credits-music-count').textContent,rows:[...document.querySelectorAll('.credits-music-list li')].map(li=>({file:li.dataset.trackFile,text:li.textContent,links:[...li.querySelectorAll('a')].map(a=>a.href)})),tracks:wodMusic.getTracks().map(t=>t.file)}));
  assert.equal(credits.count,'25 music tracks');assert.equal(credits.rows.length,25);
  assert.deepEqual(credits.rows.map(r=>r.file),credits.tracks,'credit and playback catalogs match exactly');
  assert(credits.rows.every(r=>r.links.length===2&&r.links.every(u=>u.startsWith('https://'))));
  assert(credits.rows.some(r=>r.text.includes('Markus Krumpöck'))&&credits.rows.some(r=>r.text.includes('Jmfayard')),'real recording credits replace generic Commons performer');
  await page.evaluate(()=>document.getElementById('creditsPanel').classList.remove('hidden'));
  await page.screenshot({path:path.join(OUT,'music-credits.png')});
  await page.locator('.credits-music-list li').nth(12).scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(OUT,'music-credits-attributions.png')});
  await page.evaluate(()=>document.getElementById('creditsPanel').classList.add('hidden'));
  await page.mouse.click(700,400);await page.waitForFunction(()=>wodBattleAudio.debug().loaded>=15);
  const click=await page.evaluate(()=>{
   const u=gameData.entities.find(u=>u.owner===1&&u.type==='light');wodReplaceMapSelection(u);
   const candidates=gameData.hexList.filter(h=>h.owner===1&&!isWaterHex(h)&&h.type!=='mountain'&&Math.hypot(h.x-u.x,h.y-u.y)>gameData.hexRadius*5);
   const h=candidates.sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y))[0];
   gameData.camera.x=h.x*gameData.camera.zoom-canvas.clientWidth/2;gameData.camera.y=h.y*gameData.camera.zoom-canvas.clientHeight/2;draw();
   const rect=canvas.getBoundingClientRect();return{x:rect.x+canvas.clientWidth/2,y:rect.y+canvas.clientHeight/2,before:wodBattleAudio.debug().plays.move};
  });
  await page.waitForTimeout(200);await page.mouse.click(click.x,click.y,{button:'right'});
  await page.waitForFunction(n=>wodBattleAudio.debug().plays.move===n+1,click.before);
  assert(await page.evaluate(()=>wodMusic.getMixState().target<.9&&wodMusic.getVolume()===1),'move acknowledgement gently ducks music without changing saved volume');
  await page.waitForTimeout(1250);assert.equal(await page.evaluate(()=>wodMusic.getMixState().target),1,'command music dip restores automatically');
  assert(await page.evaluate(()=>gameData.selection[0].target||gameData.selection[0].orderTarget),'right-click actually issues a move');
  await page.waitForTimeout(180);
  const group=await page.evaluate(()=>{
   const us=gameData.entities.filter(u=>u.owner===1).slice(0,5);wodReplaceMapSelection(us[0]);gameData.selection=us;
   const h=gameData.hexList.find(h=>h.owner===1&&h.type==='grass');const before=wodBattleAudio.debug().plays.move;
   issueMoveOrder({x:h.x,y:h.y});return before;
  });
  await page.waitForFunction(n=>wodBattleAudio.debug().plays.move===n+1,group);
  const ai=await page.evaluate(()=>{
   WOD.makeBlankMap(30);gameState='PLAYING';gameData.mp={enabled:false};gameData._campaignRun=null;gameData.entities=[];gameData.aiTaskForces={};gameData.forts=[];gameData.bridges=[];gameData.constructionJobs=[];gameData._aiEconomyClock=0;
   for(const h of gameData.hexList){h.type=h.r>=17?'water':'grass';h.owner=h.q<0?1:2;h.baseColor=getTerrainColor(h.type);}
   const town=(q,r,owner,id)=>{const h=gameData.hexes[`${q},${r}`];h.type='urban';h.cityId=id;return{id,name:id,owner,q,r,x:h.x,y:h.y,hp:1000,maxHp:1000,hasFactory:false,hasHarbor:false};};
   const strong=town(-17,-10,1,'Strong town'),weak=town(-17,12,1,'Unguarded rear coast'),home=town(18,0,2,'AI town');gameData.cities=[strong,weak,home];
   const spawn=(type,q,r,owner=2)=>{const h=gameData.hexes[`${q},${r}`];return createUnitAt(type,h.x,h.y,owner,{startSpawn:true});};
   for(let i=0;i<12;i++)spawn('light',15+(i%3),5+Math.floor(i/3));for(let i=0;i<2;i++)spawn('heavy',18,5+i*3);
   for(let i=0;i<3;i++)spawn('marine',17+i,15);for(let i=0;i<2;i++)spawn('ship',18+i,20);
   for(let i=0;i<10;i++)spawn('light',-17+(i%2),-10+Math.floor(i/2),1);
   gameData.unitSpatialGrid=buildUnitSpatialGrid(200);
   const army=gameData.entities.filter(u=>u.owner===2),plan=wodAiEnsureTaskForcePlan(2,army);
   const mixed=plan.jobs.filter(j=>j.kind==='armor');
   const initial=mixed.map(j=>({id:j.id,target:j.objectiveCity?.id,types:army.filter(u=>plan.unitJob[u.uid]===j.id).map(u=>u.type)}));
   const original=Object.fromEntries(army.map(u=>[u.uid,plan.unitJob[u.uid]]));
   const newUnit=spawn('light',22,0);const again=wodAiEnsureTaskForcePlan(2,[...army,newUnit]);
   const stable=again===plan&&army.every(u=>again.unitJob[u.uid]===original[u.uid]);
   const job=mixed[0],members=gameData.entities.filter(u=>plan.unitJob[u.uid]===job.id),tank=members.find(u=>u.type==='heavy');
   for(const u of members){u.x=job.holdHex.x+gameData.hexRadius*12;u.y=job.holdHex.y;u.target=null;u.path=null;u.orderTarget=null;}
   tank.x=job.holdHex.x;tank.y=job.holdHex.y;
   wodAiIssueTaskForceOrder(tank,job,1);const waits=job.phase==='assemble';
   for(const u of members){u.x=job.holdHex.x;u.y=job.holdHex.y;}
   wodAiIssueTaskForceOrder(tank,job,1);
   for(const u of members)wodAiIssueTaskForceOrder(u,job,1);
   const pushes=job.phase==='assault'&&members.every(u=>!u.holding&&u.orderTarget&&Math.hypot(u.orderTarget.x-weak.x,u.orderTarget.y-weak.y)<gameData.hexRadius*3);
   plan.expireAt=0;
   const committed=wodAiEnsureTaskForcePlan(2,[...army,newUnit])===plan&&job.phase==='assault';
   const marine=plan.jobs.find(j=>j.kind==='marine'&&j.operation),naval=plan.jobs.find(j=>j.kind==='naval'&&j.operation);
   const op=marine?.operation,coast={linked:!!op&&naval?.operation===op,target:op?.objectiveCity?.id};
   if(op){
    const raiders=gameData.entities.filter(u=>op.jobIds.includes(plan.unitJob[u.uid]));
    for(const u of raiders){u.x=op.rallyHex.x;u.y=op.rallyHex.y;u.target=null;u.path=null;u.orderTarget=null;}
    for(const u of raiders)wodAiIssueTaskForceOrder(u,wodAiGetUnitTaskJob(u),1);
    coast.crossing=op.phase==='crossing'&&raiders.every(u=>isWaterHex(getNearestHexToPoint(u.orderTarget.x,u.orderTarget.y)));
    const swimmer=raiders.find(u=>u.type==='marine');swimmer.x=op.beachHex.x;swimmer.y=op.beachHex.y;
    for(const u of raiders)wodAiIssueTaskForceOrder(u,wodAiGetUnitTaskJob(u),1);
    coast.landing=op.phase==='landing'&&raiders.filter(u=>u.type==='marine').every(u=>Math.hypot(u.orderTarget.x-weak.x,u.orderTarget.y-weak.y)<gameData.hexRadius*3);
    coast.shipsStayWater=raiders.filter(u=>u.type==='ship').every(u=>isWaterHex(getNearestHexToPoint(u.orderTarget.x,u.orderTarget.y)));
   }
   weak.owner=2;gameData.hexes[`${weak.q},${weak.r}`].owner=2;wodAiIssueTaskForceOrder(tank,job,1);
   const continuesForward=job.objectiveCity===strong&&!tank.holding&&tank.orderTarget&&Math.hypot(tank.orderTarget.x-strong.x,tank.orderTarget.y-strong.y)<gameData.hexRadius*3;
   gameData.selection=[];gameData.fogOfWar=false;gameData._matchReadyForEndChecks=false;
   const extent=Math.max(...gameData.hexList.map(h=>Math.max(Math.abs(h.x),Math.abs(h.y))));gameData.camera.zoom=Math.min(canvas.clientWidth,canvas.clientHeight)/(extent*2.2);gameData.camera.x=-canvas.clientWidth/2;gameData.camera.y=-canvas.clientHeight/2;
   const editor=document.getElementById('mapEditorApp');if(editor)editor.style.display='none';UI.panels.forEach(p=>p.classList.add('hidden'));UI.mainMenu.classList.add('hidden');UI.inGameUI.classList.remove('hidden');canvas.style.display='block';WOD.setEditorSuppressTerrainBake(false);wodSyncViewportAndCanvas();wodMarkTerrainFullDirty();updateTerrainCache();draw();
   return {initial,stable,committed,waits,pushes,coast,continuesForward,defenders:plan.jobs.filter(j=>j.kind==='defend'||j.kind==='hold').reduce((n,j)=>n+j.quota,0),total:army.length,movePlays:wodBattleAudio.debug().plays.move};
  });
  fs.writeFileSync(path.join(OUT,'ai-results.json'),JSON.stringify(ai,null,2));
  assert(ai.initial.length>=2&&ai.initial.every(j=>j.target==='Unguarded rear coast'&&j.types.includes('heavy')&&j.types.includes('light')),'mixed groups concentrate on a reachable weak town');
  assert(ai.stable,'new recruit reinforces existing jobs without recalling the assault');
  assert(ai.committed,'routine plan expiry does not send an active assault back to its staging point');
  assert(ai.waits&&ai.pushes,'tank waits for infantry, then the whole group attacks the town');
  assert(ai.coast.linked&&ai.coast.target==='Unguarded rear coast'&&ai.coast.crossing&&ai.coast.landing&&ai.coast.shipsStayWater,'marines and boats assemble, cross and land together at rear coast');
  assert(ai.continuesForward,'capturing a town advances to the next objective instead of returning home');
  assert.equal(ai.movePlays,group+1,'AI moves do not play local-player command cues');
  await page.screenshot({path:path.join(OUT,'coordinated-assault.png')});
  const simulation=await page.evaluate(()=>{
   WOD.makeBlankMap(25);gameState='PLAYING';gameData.mp={enabled:false};gameData.entities=[];gameData.aiTaskForces={};gameData.forts=[];gameData.bridges=[];gameData.constructionJobs=[];gameData._aiStratWork=null;gameData._aiFormChunk=null;gameData._aiEconomyClock=0;gameData.aiStrategyTimer=0;gameData._matchReadyForEndChecks=false;
   gameData.encircledHexes=new Set();gameData._encircWork=null;gameData.money=100000;gameData.manpower=100000;gameData.aiMoneyByOwner={2:0};gameData.aiManpowerByOwner={2:100000};
   for(const h of gameData.hexList){h.type='grass';h.owner=h.q<0?1:2;h.cityId=null;}
   const city=(q,r,owner,id)=>{const h=gameData.hexes[`${q},${r}`];h.type='urban';h.cityId=id;return{id,name:id,owner,q,r,x:h.x,y:h.y,hp:1000,maxHp:1000,hasFactory:false,hasHarbor:false};};
   const target=city(-12,8,1,'Open target'),home=city(12,8,2,'AI base');gameData.cities=[target,home];
   for(let i=0;i<9;i++)createUnitAt('light',home.x+(i%3)*15,home.y+Math.floor(i/3)*15,2,{startSpawn:true});
   const tank=createUnitAt('heavy',home.x,home.y-30,2,{startSpawn:true});tank.hp=tank.maxHp*.6;
   const start=tank.x;let crossed=0,elapsed=0;
   for(let i=0;i<3600&&target.owner!==2;i++){
    gameData._wodSimTick=(gameData._wodSimTick||0)+1;update(.1);elapsed+=.1;
    crossed=Math.max(crossed,gameData.entities.filter(u=>u.owner===2&&u.x<0).length);
   }
   return {captured:target.owner===2,crossed,elapsed:Math.round(elapsed),tankAdvance:start-tank.x,tankRetreating:!!tank.retreating,tankAlive:tank.hp>0,jobs:gameData.aiTaskForces[2]?.jobs.map(j=>({kind:j.kind,phase:j.phase,target:j.objectiveCity?.id})),positions:gameData.entities.filter(u=>u.owner===2).map(u=>({type:u.type,x:Math.round(u.x),y:Math.round(u.y),holding:u.holding,retreating:u.retreating,kind:u.aiTfKind,target:u.orderTarget,stuck:u.stuckTimer}))};
  });
  fs.writeFileSync(path.join(OUT,'simulation.json'),JSON.stringify(simulation,null,2));
  assert(simulation.captured&&simulation.crossed>=3&&simulation.tankAdvance>100&&simulation.tankAlive&&!simulation.tankRetreating,'AI autonomously assembles, crosses the frontier and captures an undefended town with a healthy assault');
  fs.writeFileSync(path.join(OUT,'audio.html'),'<!doctype html><base href="/"><button>Enable</button><input class="wod-sfx-vol" type="range" min="0" max="100"><span class="wod-sfx-vol-label"></span><script src="battle-audio.js"></script>');
  const audio=await browser.newPage();audio.on('pageerror',e=>errors.push(e.stack));await audio.goto(url+'/output/assault-commands/audio.html');await audio.locator('button').click();const moves=[];
  for(const era of ['ancient','medieval','napoleonic','modern']){
   await audio.evaluate(era=>wodBattleAudio.update({era,enabled:false,selectionEnabled:true,units:[],jobs:[]}),era);
   await audio.waitForFunction(n=>wodBattleAudio.debug().loaded>=n,(['ancient','medieval','napoleonic','modern'].indexOf(era)+1)*15);
   for(const type of ['light','light','marine','heavy','ship']){
    await audio.waitForTimeout(150);assert(await audio.evaluate(({era,type})=>wodBattleAudio.moveUnits(era,[{type}]),{era,type}));
    moves.push(await audio.evaluate(()=>wodBattleAudio.debug().recentPlays.at(-1)));
   }
   assert((await audio.evaluate(()=>wodBattleAudio.debug().audibleEras)).every(e=>e===era),'move cues never inherit another era');
  }
  assert.equal(moves.length,20);assert(moves.every(m=>m.kind.startsWith('move-')));assert.notEqual(moves[0].kind,moves[1].kind,'infantry order cues alternate');
  await audio.locator('input').evaluate(el=>{el.value='42';el.dispatchEvent(new Event('input',{bubbles:true}));});await audio.reload();assert.equal(await audio.evaluate(()=>wodBattleAudio.debug().volume),.42,'saved SFX preference survives reload');
  await audio.close();assert.equal(errors.length,0,errors.join('\n'));
  fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({credits,ai,simulation,moves,errors},null,2));
  console.log('Default/saved SFX, real right-click and group orders, 20 era-specific move cues, 25 credits, persistent mixed assaults and coastal raids passed.');
 }finally{fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const s of relay.clients)s.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
