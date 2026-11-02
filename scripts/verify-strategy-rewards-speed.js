'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{spawn}=require('child_process');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/strategy-rewards-speed');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{const f=path.resolve(ROOT,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(ROOT+path.sep))return res.writeHead(403).end();const selected=process.env.BASELINE_DIR&&['index.html','ai-command.js'].includes(path.relative(ROOT,f))?path.join(ROOT,process.env.BASELINE_DIR,path.basename(f)):f;fs.readFile(selected,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[path.extname(f)]||'application/octet-stream');res.end(b);});});
(async()=>{
 const relay=new WebSocketServer({port:8080});relay.on('error',()=>{});relay.on('connection',s=>s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]})));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),results={},errors=[];
 await context.routeWebSocket(/.*/,s=>{s.onMessage(()=>{});s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]}));});page.on('pageerror',e=>errors.push(e.stack));page.setDefaultTimeout(180000);
 try{
  await page.goto(url+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks);
  await page.evaluate(()=>{
   setGameSpeed(0,true);wodDismissChangelogPopup();cancelAnimationFrame(animationFrameId);
   window.marchWorld=()=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(28);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.alliances=[];gameData._aiFrontSupport=new WeakMap();gameData._aiLocalSituation=new WeakMap();gameData._aiDefenseByOwner={};gameData.aiTaskForces={};gameData.aiBattlePlans={};gameData.aiCommanderProfiles={2:'balanced'};gameData._aiEconomyClock=0;gameData.aiTimer=gameData.aiStrategyTimer=gameData.convoyTimer=gameData._transportAiTimer=-1e6;gameData.money=gameData.manpower=100000;gameData.aiMoneyByOwner={2:100000};gameData.aiManpowerByOwner={2:100000};for(const h of gameData.hexList){h.type='grass';h.owner=h.q<=0?2:1;h.cityId=null;}};
   window.mh=(q,r=0)=>gameData.hexes[q+','+r];
   window.mt=(q,r,owner,id)=>{const h=mh(q,r);h.type='urban';h.owner=owner;h.cityId=id;const c={id,name:id,q,r,x:h.x,y:h.y,owner,hp:1000,maxHp:1000};gameData.cities.push(c);return c;};
   window.mu=(q,r=0,type='light',owner=2)=>{const h=mh(q,r),u=createUnitAt(type,h.x,h.y,owner,{startSpawn:true});u.x=u._drawX=h.x;u.y=u._drawY=h.y;u.isGeneral=false;return u;};
   window.mr=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();gameData._citySupplyCache=null;gameData._aiArrivalCache=null;gameData._aiCombatContexts={};gameData._aiLocalSituation=new WeakMap();wodInvalidateAiFrontlineHexCache();};
   window.ms=seconds=>{for(let i=0;i<Math.round(seconds*20);i++){wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();}};
  });
  const check=(ok,label)=>{if(!process.env.OBSERVE_ONLY)assert(ok,label);};
  await page.evaluate(()=>{
   window.mplan=(army,goal,anchor,kind='main')=>{const job={id:'force',kind,role:kind,members:army.map(u=>u.uid),holdHex:anchor,attackHex:goal,objectiveCity:goal.id?goal:null,objectiveHex:goal.id?null:goal,phase:'assemble'};const plan={jobs:[job],unitJob:Object.fromEntries(army.map(u=>[u.uid,job.id])),sectors:[],readyN:army.length};gameData.aiTaskForces[2]=plan;return job;};
   window.engage=(army,job,seconds)=>{for(let i=0;i<seconds*20;i++){if(i%10===0){mr();for(const u of army)if(u.hp>0&&!u._medicalRecovering)wodAiIssueTaskForceOrder(u,job,u.hp/u.maxHp);}ms(.05);}};
  });
  results.gold=await page.evaluate(()=>{
   const rows=[];
   for(const outcome of ['victory','defeat'])for(const reason of ['', 'surrender','quit'])for(const seconds of [0,59.999,60,120])for(const damage of [0,.1]){
    const ledger={seconds:9000,activeSeconds:seconds,byOwner:{1:{damageDealt:damage,unitsDestroyed:100,unitsBuiltLight:100,citiesCaptured:100},2:{damageDealt:999}}};
    const reward=wodCalculateMatchGold(outcome,reason,ledger,1);rows.push({seconds,damage,outcome,reason,amount:reward.amount,eligible:reward.eligible});
   }
   const legacy=wodCalculateMatchGold('victory','',{seconds:600,byOwner:{1:{damageDealt:10}}},1);
   const guest=wodCalculateMatchGold('victory','',{activeSeconds:120,byOwner:{1:{damageDealt:99},3:{unitsDestroyed:99}}},3);
   return{rows,legacy:legacy.amount,guest:guest.amount};
  });
  check(results.gold.rows.every(r=>r.eligible===(r.seconds>=60&&r.damage>0)&&(r.eligible?r.amount>0&&r.amount<=50:r.amount===0))&&!results.gold.legacy&&!results.gold.guest,'gold requires 60 active seconds and damage by that player, for every ending');
  results.noGold=await page.evaluate(()=>{
   marchWorld();const ledger=wodBattleLedger();ledger.activeSeconds=59;ledger.byOwner[1]={damageDealt:100};
   const before=gameData.gold,match={};wodAwardMatchGold(match,'victory','');
   const early={amount:match.goldReward.amount,unchanged:gameData.gold===before,claimed:Object.hasOwn(wodProgress.matchGoldGranted||{},ledger.id)};
   gameData._lifetimeMatch=match;const report=wodMatchGoldReport();return{early,report};
  });check(results.noGold.early.amount===0&&results.noGold.early.unchanged&&!results.noGold.early.claimed&&results.noGold.report.includes('60 active seconds')&&!results.noGold.report.includes('Added to your wallet'),'ineligible awards do not touch wallet or create a receipt, and explain why');
  results.speed=await page.evaluate(()=>{
   const rows=[];
   for(const owner of [1,2])for(const type of ['light','motorized','mountaineer','marine','heavy','ship','transport','supply']){
    marchWorld();const u=mu(-10,0,type,owner);u.x=mh(-10).x;u.y=0;mr();
    const ordinary=u.speed*getUnitSpeedMultiplier(u,mh(-10));
    const g=mu(-12,0,'heavy',owner);g.isGeneral=true;gameData._generalAuraCache=null;
    const command=u.speed*getUnitSpeedMultiplier(u,mh(-10)),bonus=wodGeneralStatMultiplier(u);u.veteran=true;
    const veteran=u.speed*getUnitSpeedMultiplier(u,mh(-10));u.speed=999;ensureUnitId(u);
    rows.push({owner,type,ordinary,command,veteran,bonus,restored:u.speed});
   }return rows;
  });check(results.speed.every(r=>r.ordinary===15&&r.command===15&&r.veteran===15&&r.bonus===1.05&&r.restored===15),'all eight classes share infantry speed; command/veterancy do not alter it and old saved speeds normalize');
  results.travel=await page.evaluate(()=>{
   const rows=[];for(const type of ['light','motorized','mountaineer','heavy','ship','transport','supply']){
    marchWorld();for(const h of gameData.hexList){h.type=wodIsNavalType(type)?'water':'grass';h.owner=wodIsNavalType(type)?0:1;}
    const u=mu(-12,0,type,1),start=u.x;u.morale=100;mr();assignUnitMoveAlongWaypoints(u,[mh(12)]);ms(5);rows.push({type,distance:u.x-start});
   }return rows;
  });check(results.travel.every(r=>Math.abs(r.distance-results.travel[0].distance)<1),'actual dry and ship movement cover the same distance at full morale');
  results.solo=await page.evaluate(()=>{
   marchWorld();const city=mt(-18,0,2,'Home');mt(20,0,1,'Enemy');const u=mu(-2),guard=mu(-18),job=mplan([u],mh(1),mh(-2),'hold');job.objectiveHex=null;
   const p=gameData.aiTaskForces[2];p.jobs.push({id:'guard',kind:'defend',city,members:[guard.uid]});p.unitJob[guard.uid]='guard';mr();const start=u.x;engage([u],job,70);
   return{moved:u.x-start,radius:gameData.hexRadius,captured:mh(1).owner===2,guard:Math.hypot(guard.x-city.x,guard.y-city.y),orders:wodAiDiagnostics(2).counts};
  });check(results.solo.moved>results.solo.radius*2&&results.solo.captured&&results.solo.guard<20,'a lone healthy screen cautiously advances on an empty border while preserving its town guard');
  results.contact=await page.evaluate(()=>{
   marchWorld();mt(-22,20,2,'Home');mt(22,0,1,'Enemy');const us=[mu(-2,-2,'heavy'),mu(-2,0,'heavy'),mu(-2,2),mu(-3,1)],foe=mu(1,0,'light',1);mr();
   const job=mplan(us,mh(1),mh(-2)),plan=gameData.aiTaskForces[2],cluster={x:foe.x,y:foe.y,contacts:[foe.uid]};
   const covered=wodAiBorderBattleCovered(2,cluster,plan);mh(1).owner=2;mr();const invasion=wodAiBorderBattleCovered(2,cluster,plan);
   return{covered,invasion};
  });check(results.contact.covered&&!results.contact.invasion,'a supported border assault keeps its mission, but a real incursion still triggers defense');
  results.strategy=await page.evaluate(()=>{
   marchWorld();mt(-22,0,2,'Home');const strong=mt(5,12,1,'Strong'),weak=mt(16,-8,1,'Weak');strong.hasFactory=true;
   const us=[mu(-3,-7),mu(-4,-5,'heavy'),mu(-3,-3),mu(-4,-1)];for(let i=0;i<7;i++)mu(5+i%2,10+Math.floor(i/2)*2,'heavy',1);
   const a={id:'a',kind:'main',members:us.slice(0,2).map(u=>u.uid),objectiveCity:strong,holdHex:mh(-3,6),phase:'assemble',waitingForStrength:true};
   const b={id:'b',kind:'armor',members:us.slice(2).map(u=>u.uid),objectiveCity:strong,holdHex:mh(-3,2),phase:'assemble',waitingForStrength:true};
   const plan=gameData.aiTaskForces[2]={jobs:[a,b],unitJob:Object.fromEntries(us.map((u,i)=>[u.uid,i<2?'a':'b'])),sectors:[]};mr();
   wodAiCoordinateCampaign(2,plan,us);const first=plan.campaignAim.cityId;
   gameData._aiEconomyClock=6;wodAiCoordinateCampaign(2,plan,us);const stable=plan.campaignAim.cityId===first;
   wodAiConcentrateAssaults(2,plan,us);
   return{first,stable,goals:plan.jobs.map(j=>j.objectiveCity?.id),groups:plan.jobs.length,troops:plan.jobs[0].members.length,reason:plan.campaignAim.reason};
  });check(results.strategy.first==='Weak'&&results.strategy.stable&&results.strategy.goals.every(g=>g==='Weak')&&results.strategy.groups===1&&results.strategy.troops===4,'nearby stalled groups choose a reachable weak production target, stay committed and concentrate');
  results.allocation=await page.evaluate(()=>{
   marchWorld();mt(-20,15,2,'Home');mt(-20,-15,2,'Rear');mt(20,0,1,'Enemy');const us=Array.from({length:12},(_,i)=>mu(-5,i*3-18));mr();
   const sectors=buildAiFrontlineSectors(2,12),offensive=wodAiDefenseDemand(2,us,sectors,{intent:'attack',defenseShare:.58,reserveShare:.1},2),defensive=wodAiDefenseDemand(2,us,sectors,{intent:'defend',defenseShare:.58,reserveShare:.16},2);
   return{offensive:{line:offensive.line,reserve:offensive.reserve},defensive:{line:defensive.line,reserve:defensive.reserve}};
  });check(results.allocation.offensive.line<=5&&results.allocation.offensive.line>=1&&results.allocation.defensive.line>=results.allocation.offensive.line,'offensive coverage leaves a viable army rather than consuming all infantry, while defensive emergencies can recall more');
  results.fog=await page.evaluate(()=>{
   marchWorld();mt(-20,0,2,'Home');mt(22,0,1,'Hidden');const us=[mu(-12,-1),mu(-12,1)];gameData.fogOfWar=true;gameData._factionIntel={};mr();wodRefreshFogVision(1);
   const job=mplan(us,mh(-1),mh(-12)),plan=gameData.aiTaskForces[2];wodAiCoordinateCampaign(2,plan,us);return{goal:plan.campaignAim?.cityId};
  });check(!results.fog.goal,'campaign objectives do not read undiscovered enemy towns');
  await page.evaluate(()=>{UI.panels.forEach(p=>p.classList.add('hidden'));UI.mainMenu.classList.add('hidden');UI.inGameUI.style.display='block';wodMarkTerrainFullDirty();updateTerrainCache();draw();});
  await page.screenshot({path:path.join(OUT,'gameplay.png')});check(!errors.length,'no renderer errors');
  if(process.env.RUN_SKILL_CLIENT==='1'){
   const client=path.join(OUT,'skill-client.mjs');fs.writeFileSync(client,fs.readFileSync(path.join(process.env.USERPROFILE,'.codex/skills/develop-web-game/scripts/web_game_playwright_client.js'),'utf8').replace('await page.waitForTimeout(500);',"await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameData.hexList?.length>0&&window.render_game_to_text&&JSON.parse(window.render_game_to_text()).units.length>0,null,{timeout:180000});"));
   await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[client,'--url',url+'/?autostart=1','--actions-json',JSON.stringify({steps:[{buttons:[],frames:60},{buttons:['a'],frames:12},{buttons:[],frames:15}]}),'--iterations','1','--pause-ms','1000','--screenshot-dir',path.join(OUT,'skill')],{windowsHide:true,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code?reject(Error('skill client exit '+code)):resolve());});
  }
  console.log(JSON.stringify(results,null,2));
 }finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors));await browser.close();server.close();for(const s of relay.clients)s.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
