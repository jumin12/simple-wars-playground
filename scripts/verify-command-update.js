const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const { WebSocketServer } = require('../server/node_modules/ws');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output', 'command-update');
fs.mkdirSync(OUT, { recursive: true });
const server = http.createServer((req, res) => {
  const file = path.resolve(ROOT, '.' + decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', ({'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg'})[path.extname(file)] || 'application/octet-stream');
    res.end(body);
  });
});
(async () => {
  // The UI probes its local relay on boot; keep that probe local and quiet.
  const relay = new WebSocketServer({port:8080});
  relay.on('error',()=>{});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  let errors = [];
  page.on('pageerror', e => errors.push(e.stack));
  try {
    await page.goto(url + '/?autostart=1');
    await page.waitForFunction(() => window.__wodDebug?.().gameState === 'PLAYING' && window.__wodGetGameData?.()._matchReadyForEndChecks, {timeout:180000});
    await page.evaluate(() => { setGameSpeed(0,true); wodDismissChangelogPopup?.(); });
    console.log('match ready');
    await page.screenshot({path:path.join(OUT,'01-opening.png')});
    const opening = await page.evaluate(() => {
      const g = window.__wodGetGameData();
      return { mapRadius:g.mapRadius, cities:g.cities.map(c=>({owner:c.owner,factory:c.hasFactory,harbor:c.hasHarbor,farm:c.hasFarm})),
        units:g.entities.map(u=>({owner:u.owner,type:u.type,deployment:u._startDeployment,border:isFrontlineHex(getNearestHexToPoint(u.x,u.y),u.owner)})) };
    });
    fs.writeFileSync(path.join(OUT,'opening.json'),JSON.stringify(opening,null,2));
    assert(opening.cities.every(c=>!c.factory&&!c.harbor&&!c.farm),'empty starting cities');
    assert(opening.units.filter(u=>u.type==='heavy').every(u=>u.deployment==='town'&&!u.border),'rear armor');
    for(const owner of new Set(opening.units.map(u=>u.owner))) {
      const army=opening.units.filter(u=>u.owner===owner);
      const expected=Math.round(Math.max(12,Math.min(28,Math.floor(opening.mapRadius/3.5)))/2)+1;
      assert.equal(army.length,expected,'half-size army');
      assert.equal(army.filter(u=>u.deployment==='front').length,Math.round(army.length*.2),'20% front');
    }
    await page.evaluate(() => {
      let g=window.__wodGetGameData();
      g.selection=g.entities.filter(u=>u.owner===1).slice(0,3);
      g.selection.forEach(u=>u.selected=true); syncInfoCardPanel();
    });
    await page.keyboard.press('Control+1');
    await page.evaluate(()=>{ for(let u of gameData.selection)u.selected=false; gameData.selection=[]; });
    await page.keyboard.press('1');
    assert.equal(await page.evaluate(()=>gameData.selection.length),3,'recall group');
    await page.locator('[data-control-group="1"]').click();
    const production = await page.evaluate(() => {
      let g=gameData, c=g.cities.find(c=>c.owner===1); g.money=100000; g.manpower=100000;
      let money=g.money, ok=wodApplyBuildAtCityForOwner(c,'factory',1);
      let before={ok,has:c.hasFactory,money:g.money,duplicate:wodApplyBuildAtCityForOwner(c,'factory',1)};
      wodUpdateConstruction(29); let at29=c.hasFactory;
      wodUpdateConstruction(1); let at30=c.hasFactory;
      let count=g.entities.length, trained=wodApplyBuildAtCityForOwner(c,'heavy',1);
      wodUpdateConstruction(19); let beforeTrain=g.entities.length;
      wodUpdateConstruction(1);
      return {before,at29,at30,trained,count,beforeTrain,afterTrain:g.entities.length,paid:money-g.money};
    });
    assert(production.before.ok&&!production.before.has&&!production.before.duplicate);
    assert(!production.at29&&production.at30,'factory finishes at 30s');
    assert(production.trained&&production.beforeTrain===production.count&&production.afterTrain===production.count+1,'armor waits 20s');
    await page.evaluate(()=>{let c=gameData.cities.find(c=>c.owner===1&&!wodCityProductionJob(c));wodApplyBuildAtCityForOwner(c,'farm',1);draw();});
    await page.screenshot({path:path.join(OUT,'02-groups-production.png')});
    console.log('opening, groups and production passed');
    const structures = await page.evaluate(() => {
      let g=gameData; g.money=100000;
      let h=g.hexList.find(h=>hexEligibleForFortPlacementForOwner(h,1));
      let n=g.forts.length, money=g.money;
      let queued=placeFortAtHex(h,1,{suppressNotes:true});
      let duplicate=placeFortAtHex(h,1,{suppressNotes:true});
      let before=g.forts.length; wodUpdateConstruction(29); let at29=g.forts.length;
      // Completion must not charge money twice or depend on remaining treasury.
      g.money=0; wodUpdateConstruction(1); let after=g.forts.length;
      g.money=100000;
      let c=g.cities.find(c=>c.owner===1&&!c.hasFarm&&!wodCityProductionJob(c));
      let canceled=wodApplyBuildAtCityForOwner(c,'farm',1); c.owner=2;
      wodUpdateConstruction(30); let capturedBuilt=c.hasFarm; c.owner=1;
      return {queued,duplicate,n,before,at29,after,canceled,capturedBuilt};
    });
    assert(structures.queued&&!structures.duplicate&&structures.before===structures.n&&structures.at29===structures.n&&structures.after===structures.n+1,'fort timer and no duplicate charges');
    assert(structures.canceled&&!structures.capturedBuilt,'capture cancels construction');
    const ai = await page.evaluate(() => {
      let g=gameData,c=g.cities.find(c=>c.owner===2), water=g.hexList.find(h=>h.owner===2&&isWaterHex(h));
      for(let i=0;i<32;i++)createUnitAt('light',c.x,c.y,2);
      for(let i=0;i<7;i++)createUnitAt('heavy',c.x,c.y,2);
      for(let i=0;i<7;i++)createUnitAt('marine',c.x,c.y,2);
      if(water)for(let i=0;i<8;i++)createUnitAt('ship',water.x,water.y,2);
      let units=g.entities.filter(u=>u.owner===2&&u.type!=='convoy');
      let plan=wodAiEnsureTaskForcePlan(2,units);
      let groups=plan.jobs.map(j=>({kind:j.kind,members:units.filter(u=>plan.unitJob[u.uid]===j.id).map(u=>u.type)}));
      let orders=0;
      for(let j of plan.jobs) {
        let u=units.find(u=>plan.unitJob[u.uid]===j.id);
        if(u&&wodAiIssueTaskForceOrder(u,j,u.hp/u.maxHp))orders++;
      }
      let c2=g.cities.find(c=>c.owner===2); g.aiMoneyByOwner[2]=100000;
      let cash=g.aiMoneyByOwner[2], building=wodApplyBuildAtCityForOwner(c2,'factory',2);
      let instant=c2.hasFactory; wodUpdateConstruction(30);
      return {groups,orders,assigned:Object.keys(plan.unitJob).length,total:units.length,building,instant,finished:c2.hasFactory,paid:cash-g.aiMoneyByOwner[2]};
    });
    for(const kind of ['defend','hold','main','raid','armor','marine','naval']) assert(ai.groups.some(g=>g.kind===kind),'AI '+kind+' group');
    for(const [role,type] of [['armor','heavy'],['marine','marine'],['naval','ship']]) assert(ai.groups.filter(g=>g.kind===role).every(g=>g.members.every(t=>t===type)),'specialized '+role);
    assert(ai.groups.filter(g=>g.kind==='main').length>1&&ai.assigned===ai.total&&ai.orders>3,'multiple coordinated AI groups');
    assert(ai.building&&!ai.instant&&ai.finished&&ai.paid===2000,'AI obeys production costs and times');
    console.log('forts, capture and AI formations passed');
    const multiplayer = await page.evaluate(() => {
      let oldMp=gameData.mp, oldConnected=WodMultiplayer.api.connected, oldSend=WodMultiplayer.hostSendSnap;
      gameData.mp={enabled:true,isHost:true,localSlot:1,humanSlots:[1,2],factionSlots:[1,2],connectedSlots:[1,2],seatTypes:['human','human'],maxLobbySlots:2};
      WodMultiplayer.api.connected=true;
      let sent;
      WodMultiplayer.hostSendSnap=(seq,s)=>{sent=JSON.parse(JSON.stringify(s));};
      gameData.money=100000;
      let c=gameData.cities.find(c=>c.owner===1&&(cityEligibleForBuildPlacementForOwner(c,'harbor',1)||cityEligibleForBuildPlacementForOwner(c,'farm',1)));
      let queued=wodApplyBuildAtCityForOwner(c,'harbor',1);
      if(!queued)queued=wodApplyBuildAtCityForOwner(c,'farm',1);
      wodMpHostEmitSnapshot();
      let queueLength=sent.constructionJobs.length;
      gameData.mp.isHost=false; gameData.constructionJobs=[];
      wodMpApplySnapPayload(sent);
      let remaining=gameData.constructionJobs[0]?.remaining;
      wodUpdateConstruction(90);
      let guestUnchanged=gameData.constructionJobs[0]?.remaining===remaining;
      gameData.mp.isHost=true; wodUpdateConstruction(30); wodMpHostEmitSnapshot();
      let completed=sent.constructionJobs.length===0;
      gameData.mp=oldMp; WodMultiplayer.api.connected=oldConnected; WodMultiplayer.hostSendSnap=oldSend;
      return {queued,queueLength,guestUnchanged,completed};
    });
    console.log('snapshot check', multiplayer);
    assert(multiplayer.queued&&multiplayer.queueLength>0&&multiplayer.guestUnchanged&&multiplayer.completed,'host-authoritative construction snapshots');
    // Campaign UI uses real native drag-and-drop events.
    await page.evaluate(()=>{
      wodRogueBegin(); for(let t of ['light','light','heavy','marine','light','heavy','marine','ship'])wodRogueRosterAdd(t);
      wodRogueSave(); showPanel('campaign'); wodRefreshCampaignPanel();
    });
    let ids=await page.locator('[data-roster-id]').evaluateAll(rows=>rows.map(r=>r.dataset.rosterId));
    await page.locator('[data-roster-id="'+ids[1]+'"]').dragTo(page.locator('[data-roster-id="'+ids[0]+'"]'),{targetPosition:{x:20,y:5}});
    assert.equal(await page.evaluate(()=>wodRogueLoad().roster[0].id),ids[1],'campaign drag persists order');
    const points=await page.evaluate(()=>wodRogueLoad().points);
    await page.locator('[data-camp-del="'+ids[0]+'"]').click();
    assert.equal(await page.locator('[data-roster-id]').count(),7,'direct dismiss');
    await page.getByRole('button',{name:'Undo last dismissal'}).click();
    assert.equal(await page.locator('[data-roster-id]').count(),8,'undo dismiss');
    assert.equal(await page.evaluate(()=>wodRogueLoad().points),points,'undo refund balance');
    await page.screenshot({path:path.join(OUT,'03-campaign-roster.png')});
    const campaign=await page.evaluate(()=>{
      // Use the actual battle-start and resolution paths on a generated region.
      let c=wodRogueLoad(), node=wodRogueNodes().find(n=>wodRogueNodePlayable(n.id));
      let map=wodRogueBuildRegionBattleMap(node.id);
      WOD.loadMapData(map);
      gameData._campaignRun={nodeId:node.id,fromNodeId:null,defense:false,battleLive:false,deploying:false};
      gameData._campaignRegionMap=map;
      let popup=wodShowMissionPopupDialog;
      wodShowMissionPopupDialog=()=>{};
      wodCampaignOnBattleStart(); wodShowMissionPopupDialog=popup;
      let initial=gameData.entities.filter(u=>u.owner===1).length;
      let reserves=wodCampaignReserveUnits();
      let reserveIds=reserves.map(r=>r.id);
      let reserve=reserves.find(r=>r.type!=='ship')||reserves[0];
      reserve.name='Reserve veteran';reserve.nameCustom=true;reserve.hp=reserve.maxHp-15;reserve.xp=123;
      gameData._campaignRun.battleLive=true;
      gameData.money=0;gameData.manpower=0;
      let town=gameData.cities.find(ct=>ct.owner===1&&findSpawnHex(reserve.type,ct,1));
      let called=wodApplyBuildAtCityForOwner(town,reserve.type,1);
      let queued=gameData.constructionJobs.find(j=>j.rosterId===reserve.id);
      let remaining=wodCampaignReserveUnits(reserve.type).length;
      wodUpdateConstruction(WOD_PRODUCTION_SECONDS[reserve.type]-1);
      let early=gameData.entities.some(u=>u._campRosterId===reserve.id);
      wodUpdateConstruction(1);
      let arrived=gameData.entities.find(u=>u._campRosterId===reserve.id);
      let stats=arrived&&arrived.name===reserve.name&&arrived.hp===reserve.hp&&arrived.xp===123;
      let money=gameData.money,mp=gameData.manpower;
      let safe=wodCampaignReserveUnits().map(r=>r.id);
      window.__reinforcementCheck={safe,id:reserve.id};
      document.getElementById('campaignPanel').classList.add('hidden');UI.inGameUI.classList.remove('hidden');
      document.getElementById('wodPcProdTabUnits').click();wodRefreshCommandHud(true);draw();
      return {initial,reserves:reserveIds.length,called,queued:!!queued,early,stats,money,mp,emptyCities:gameData.cities.every(c=>!c.hasFactory&&!c.hasHarbor)};
    });
    let reinforcementType=await page.evaluate(()=>wodCampaignReserveUnits().find(r=>r.type==='heavy')?.type);
    assert(reinforcementType,'armor reserve available for UI check');
    await page.locator('button[onclick="buyUnit(\''+reinforcementType+'\')"]:visible').first().click();
    const arrivalPoint=await page.evaluate(type=>{
      let c=gameData.cities.find(c=>cityEligibleForBuildPlacementForOwner(c,type,1));
      wodFocusOwnedCityFromList(c.id);
      let rect=canvas.getBoundingClientRect();return {x:rect.left+c.x*gameData.camera.zoom-gameData.camera.x,y:rect.top+c.y*gameData.camera.zoom-gameData.camera.y};
    },reinforcementType);
    await page.mouse.click(arrivalPoint.x,arrivalPoint.y);
    assert.equal(await page.evaluate(()=>gameData.constructionJobs.filter(j=>j.rosterId).length),1,'UI calls reserve reinforcements');
    await page.waitForTimeout(300);
    await page.screenshot({path:path.join(OUT,'05-campaign-reinforcements.png')});
    Object.assign(campaign,await page.evaluate(()=>{
      let {safe,id}=window.__reinforcementCheck;
      // A lost reinforcement is a real casualty; untouched reserves remain in the roster.
      gameData.entities.find(u=>u._campRosterId===id).hp=0;
      wodCampaignAfterBattle(false);delete window.__reinforcementCheck;
      return {safePreserved:safe.every(id=>wodRogueLoad().roster.some(r=>r.id===id)),lostRemoved:!wodRogueLoad().roster.some(r=>r.id===id)};
    }));
    assert(campaign.initial===4&&campaign.reserves===4&&campaign.called&&campaign.queued&&!campaign.early&&campaign.stats&&campaign.money===0&&campaign.mp===0&&campaign.safePreserved&&campaign.lostRemoved&&campaign.emptyCities,'campaign half deployment and finite, persistent reinforcements');
    console.log('multiplayer payloads, campaign drag, undo, reserves and reinforcements passed');
    await page.evaluate(()=>{gameData._campaignRun=null;gameState='MENU';UI.inGameUI.classList.add('hidden');openMapEditor();});
    assert.equal(await page.evaluate(()=>gameData.hexList.filter(h=>h.type==='forest').length),0,'blank editor baseline');
    await page.selectOption('#editorTerrain','forest');
    const canvas=page.locator('#editorCanvas');
    const box=await canvas.boundingBox();
    const y=box.y+box.height*.5, x1=box.x+box.width*.25, x2=box.x+box.width*.75;
    // A single pointermove across half the canvas reproduces dropped fast samples.
    await page.mouse.move(x1,y); await page.mouse.down();await page.mouse.move(x2,y,{steps:1});await page.mouse.up();
    const painting=await page.evaluate(({x1,x2,y})=>{
      const cv=document.getElementById('editorCanvas'),r=cv.getBoundingClientRect(),hs=gameData.hexList;
      const minX=Math.min(...hs.map(h=>h.x)),maxX=Math.max(...hs.map(h=>h.x)),minY=Math.min(...hs.map(h=>h.y)),maxY=Math.max(...hs.map(h=>h.y));
      const scale=Math.min(cv.width/(maxX-minX+80),cv.height/(maxY-minY+80))*.92;
      const world=x=>({x:(x-r.left-cv.width/2)/scale+(minX+maxX)/2,y:(y-r.top-cv.height/2)/scale+(minY+maxY)/2});
      let good=0,total=30;
      for(let i=0;i<total;i++){let p=world(x1+(x2-x1)*i/(total-1)),h=getNearestHexToPoint(p.x,p.y);if(h?.type==='forest')good++;}
      return {good,total,forest:hs.filter(h=>h.type==='forest').length,types:[...new Set(hs.map(h=>h.type))],canvas:{width:cv.width,height:cv.height,rect:{x:r.x,y:r.y,width:r.width,height:r.height}},from:world(x1),to:world(x2)};
    },{x1,x2,y});
    await page.screenshot({path:path.join(OUT,'04-fast-paint.png')});
    console.log('painting',painting);
    assert.equal(painting.good,painting.total,'continuous fast brush stroke');
    console.log('continuous fast painting passed');
    await page.mouse.move(x1,y+40);await page.mouse.down();
    const beforeCancel=await page.evaluate(()=>gameData.hexList.filter(h=>h.type==='forest').length);
    await canvas.dispatchEvent('pointercancel',{pointerId:1,pointerType:'mouse',clientX:box.x,clientY:box.y});
    await page.mouse.up();
    assert.equal(await page.evaluate(()=>gameData.hexList.filter(h=>h.type==='forest').length),beforeCancel,'canceling a stroke does not paint a spurious final segment');
    const arrivals=await page.evaluate(()=>{
      // Deterministic river fixture covers harbor/ship/marine/bridge prerequisites.
      WOD.makeBlankMap(20);gameState='PLAYING';gameData._campaignRun=null;gameData.constructionJobs=[];
      gameData.encircledHexes=new Set();gameData.cityCombatBlockForProd=new Set();gameData._cityCombatStagingKeys=new Set();
      gameData.money=100000;gameData.manpower=100000;
      for(let h of gameData.hexList){h.owner=1;if(h.q===0){h.type='water';h.baseColor=getTerrainColor('water');}}
      let h=gameData.hexes['-1,0'];h.type='urban';h.cityId='test-harbor';
      let c={id:'test-harbor',name:'Test harbor',owner:1,q:h.q,r:h.r,x:h.x,y:h.y,hp:1000,maxHp:1000,hasFactory:false,hasHarbor:false};gameData.cities=[c];
      let harbor=wodApplyBuildAtCityForOwner(c,'harbor',1);wodUpdateConstruction(29);let earlyHarbor=c.hasHarbor;wodUpdateConstruction(1);
      let result={harbor,earlyHarbor,readyHarbor:c.hasHarbor};
      for(let [type,seconds] of [['ship',25],['marine',15],['light',10]]){
        let count=gameData.entities.length,ok=wodApplyBuildAtCityForOwner(c,type,1);
        wodUpdateConstruction(seconds-1);let early=gameData.entities.length>count;
        wodUpdateConstruction(1);result[type]={ok,early,arrived:gameData.entities.length===count+1};
      }
      let mid=gameData.hexes['0,6'],dims=wodBridgeDefaultDims();
      let bridge=placeBridgeAt(1,mid.x,mid.y,0,dims.w,dims.h,{suppressNotes:true});
      let pendingDeck=isBridgeHex(mid);wodUpdateConstruction(29);let earlyDeck=isBridgeHex(mid);gameData.money=0;wodUpdateConstruction(1);
      result.bridge={queued:bridge,pendingDeck,earlyDeck,readyDeck:isBridgeHex(mid)};
      return result;
    });
    assert(arrivals.harbor&&!arrivals.earlyHarbor&&arrivals.readyHarbor,'harbor waits 30 seconds');
    for(let type of ['ship','marine','light'])assert(arrivals[type].ok&&!arrivals[type].early&&arrivals[type].arrived,'timed '+type+' production');
    assert(arrivals.bridge.queued&&!arrivals.bridge.pendingDeck&&!arrivals.bridge.earlyDeck&&arrivals.bridge.readyDeck,'bridge inactive until 30 seconds');
    console.log('harbor, bridge, ship, marine and infantry timers passed');
    const authored=await page.evaluate(()=>{
      gameData.entities=[];
      let c=gameData.cities[0];
      for(let i=0;i<6;i++)createUnitAt('light',c.x,c.y,1,{startSpawn:true});
      for(let i=0;i<2;i++)createUnitAt('heavy',c.x,c.y,1,{startSpawn:true});
      wodNormalizeStartingCityEconomy([1]);wodReduceAuthoredStartingArmy([1]);
      let once=gameData.entities.length;wodReduceAuthoredStartingArmy([1]);
      return {once,twice:gameData.entities.length,empty:gameData.cities.every(c=>!c.hasFactory&&!c.hasHarbor&&!c.hasFarm),armorSafe:gameData.entities.filter(u=>u.type==='heavy').every(u=>u._startDeployment==='town'&&!isFrontlineHex(getNearestHexToPoint(u.x,u.y),1))};
    });
    assert(authored.once===4&&authored.twice===4&&authored.empty&&authored.armorSafe,'authored and committed lobby starts are halved once with safe armor');
    if(errors.length) throw new Error(errors.join('\n'));
    fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({opening:true,groups:true,production,structures,ai,multiplayer,campaign,painting,arrivals,authored,errors},null,2));
    if(process.env.WOD_SKILL_SMOKE === '1') {
      const client=path.join(ROOT,'output','web-game-client.mjs');
      const skill=process.env.WEB_GAME_SKILL_DIR || path.join(require('os').homedir(),'.codex','skills','develop-web-game');
      fs.copyFileSync(path.join(skill,'scripts','web_game_playwright_client.js'),client);
      fs.rmSync(path.join(OUT,'skill','errors-0.json'),{force:true});
      await new Promise((resolve,reject)=>{
        let child=spawn(process.execPath,[client,'--url',url+'/?autostart=1','--actions-file',path.join(skill,'references','action_payloads.json'),'--iterations','1','--pause-ms','1000','--screenshot-dir',path.join(OUT,'skill')],{stdio:'inherit',env:process.env});
        child.on('exit',code=>code===0?resolve():reject(Error('Skill client exited '+code)));
      });
    }
  } finally {
    fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));
    await browser.close(); server.close();
    for(const socket of relay.clients)socket.terminate();relay.close();
  }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
