'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{spawn}=require('child_process');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/assault-bridges',process.env.TEST_TAG||'verified');fs.mkdirSync(OUT,{recursive:true});
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
  results.bridge=await page.evaluate(()=>{
   const rows=[];
   for(const angle of [0,Math.PI/4,-Math.PI/4])for(const owner of [1,2])for(const type of ['light','marine'])for(const offset of [4,8,30,54,81]){
    marchWorld();const c=Math.cos(angle),s=Math.sin(angle);for(const h of gameData.hexList){const a=h.x*c+h.y*s;h.type=Math.abs(a)<45?'water':'grass';h.owner=isWaterHex(h)?0:owner;}
    placeBridgeAt(owner,0,0,angle,190,30,{editor:true,suppressNotes:true});
    const start={x:-81*c-offset*s,y:-81*s+offset*c},goal={x:-81*c+offset*s,y:-81*s-offset*c};
    const u=createUnitAt(type,start.x,start.y,owner);u.x=start.x;u.y=start.y;mr();
    const deckClaim=!!wodBridgeHexAtPoint(u,start.x,start.y),ok=assignUnitMoveAlongWaypoints(u,[goal]),points=[u.target,...(u.path||[])].filter(Boolean).map(p=>({x:p.x,y:p.y}));
    let length=0,old={...start},deck=0,invalid=0;for(let i=0;i<1800&&u.target;i++){gameData._aiEconomyClock+=.05;wodBeginSimPfBudget(1);moveUnitTowardTarget(u,.05);length+=Math.hypot(u.x-old.x,u.y-old.y);old={x:u.x,y:u.y};if(wodPointOnBridgeForUnit(u,u.x,u.y,1)&&isWaterHex(getNearestHexToPoint(u.x,u.y)))deck++;if(!wodSamplePosOnWalkableTerrain(u,u.x,u.y)&&!wodPointOnBridgeForUnit(u,u.x,u.y,1))invalid++;}
    rows.push({angle,owner,type,offset,ok,deckClaim,points,deck,invalid,length,direct:offset*2,arrived:Math.hypot(u.x-goal.x,u.y-goal.y)<5,order:u.orderTarget});
   }return rows;
  });
  if(!process.env.BRIDGE_ONLY)results.assault=await page.evaluate(()=>{
   const rows=[];for(const count of [4,8,12])for(const contact of [false,true]){
    marchWorld();mt(-20,0,2,'Home');const goal=mt(14,0,1,'Enemy'),army=Array.from({length:count},(_,i)=>mu(-4-Math.floor(i/5)*2,(i%5-2)*2,i===0?'heavy':'light'));if(contact)mu(2,0,'light',1);mr();
    const job={id:'push',kind:'main',role:'main',members:army.map(u=>u.uid),holdHex:mh(-1),attackHex:goal,objectiveCity:goal,phase:'assemble'},plan=gameData.aiTaskForces[2]={jobs:[job],unitJob:Object.fromEntries(army.map(u=>[u.uid,job.id])),sectors:[],readyN:army.length};
    const trace=[];for(let n=0;n<240;n++){mr();for(const u of army)if(u.hp>0&&!wodAiShouldKeepCurrentOrder(u))wodAiIssueTaskForceOrder(u,job,u.hp/u.maxHp);ms(.5);if(n%20===0)trace.push({time:n*.5,stage:job.operationState?.stage,rally:job.holdHex?.q,positions:army.map(u=>({q:Math.round(u.x/27),r:Math.round(u.y/27),target:u.orderTarget&&[Math.round(u.orderTarget.x/27),Math.round(u.orderTarget.y/27)]}))});}
    rows.push({count,contact,trace,advanced:army.filter(u=>u.x>mh(2).x).length,owner:goal.owner});
   }return rows;
  });

  results.localAssembly=await page.evaluate(()=>{
   marchWorld();mt(-24,0,2,'Home');const goal=mt(22,0,1,'Enemy'),army=[mu(-17,-3,'heavy'),mu(-17,0),mu(-17,3),mu(-19,0)],start=army.map(u=>u.x);
   const job={id:'local-force',kind:'main',role:'main',members:army.map(u=>u.uid),holdHex:mh(-1),attackHex:goal,objectiveCity:goal,phase:'assemble'},plan=gameData.aiTaskForces[2]={jobs:[job],unitJob:Object.fromEntries(army.map(u=>[u.uid,job.id])),sectors:[],readyN:army.length};mr();
   for(const u of army)wodAiIssueTaskForceOrder(u,job,1);const rallyDistance=Math.hypot(job.holdHex.x-army[0].x,job.holdHex.y-army[0].y)/gameData.hexRadius;
   const trace=[];for(let n=0;n<160;n++){mr();for(const u of army)if(!wodAiShouldKeepCurrentOrder(u))wodAiIssueTaskForceOrder(u,job,u.hp/u.maxHp);ms(.5);if(n%10===0)trace.push({t:n*.5,stage:job.operationState?.stage,bound:job.operationState?.march?.id,slots:Object.values(job.operationState?.march?.slots||{}),q:army.map(u=>u.x)});}
   return{rallyDistance,trace,advanced:army.filter((u,i)=>u.x>start[i]+gameData.hexRadius*10).length,firstAttack:trace.find(t=>t.stage==='attack')?.t};
  });
  results.boundCommitment=await page.evaluate(()=>{
   if(typeof wodAiAssaultMarchHex!=='function')return{supported:false};
   marchWorld();mt(-20,0,2,'Home');const goal=mt(22,0,1,'Enemy'),army=[mu(-3,-3),mu(-3,-1),mu(-3,1),mu(-3,3)],op={stage:'attack'},slots=[];mr();
   for(let i=0;i<20&&!op.march;i++){gameData._aiEconomyClock+=.5;wodAiAssaultMarchHex(army[0],op,goal,army);}
   for(const u of army)slots.push(getHexKey(wodAiAssaultMarchHex(u,op,goal,army)));const serial=op.march.id;
   const recruit=mu(-20,0);army.push(recruit);mr();for(const u of army)wodAiAssaultMarchHex(u,op,goal,army);const retained=op.march.id===serial;
   const lead=army[0],anchor=op.march.anchor;lead.x=anchor.x+gameData.hexRadius*3;lead.y=anchor.y;
   const skipPassed=wodAiAssaultMarchHex(lead,op,goal,army)===null;
   return{unique:new Set(slots).size,retained,skipPassed};
  });
  check(results.bridge.every(r=>r.ok&&!r.deckClaim&&!r.deck&&!r.invalid&&r.arrived&&r.length<=r.direct*1.5),'bank moves preserve dry ground and the exact destination, with no trip to the deck');
  check(results.localAssembly.rallyDistance<7&&results.localAssembly.firstAttack<=25&&results.localAssembly.advanced===4,'distant-objective armies assemble locally and actually advance');
  check(results.boundCommitment.unique===4&&results.boundCommitment.retained&&results.boundCommitment.skipPassed,'formation slots are distinct, recruit arrival does not reset the bound, and vanguards never turn back');
  if(results.assault)check(results.assault.every(r=>r.advanced>=Math.ceil(r.count*.6)&&r.trace.some(t=>t.stage==='attack')),'gathered forces advance through both empty and contested fronts');
  await page.evaluate(()=>{UI.panels.forEach(p=>p.classList.add('hidden'));UI.mainMenu.classList.add('hidden');UI.inGameUI.style.display='block';gameData.camera={zoom:1.5,x:-450,y:-500};wodMarkTerrainFullDirty();updateTerrainCache();draw();});await page.screenshot({path:path.join(OUT,'formations.png')});check(errors.length===0,'no renderer errors');
  console.log(JSON.stringify({bridgeFailures:results.bridge.filter(r=>r.deckClaim||!r.arrived||r.deck||r.length>r.direct*1.4),assault:results.assault},null,2));
  if(process.env.RUN_SKILL_CLIENT==='1'){
   const client=path.join(OUT,'skill-client.mjs');fs.writeFileSync(client,fs.readFileSync(path.join(process.env.USERPROFILE,'.codex/skills/develop-web-game/scripts/web_game_playwright_client.js'),'utf8').replace('await page.waitForTimeout(500);',"await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameData.hexList?.length>0&&window.render_game_to_text&&JSON.parse(window.render_game_to_text()).units.length>0,null,{timeout:180000});"));
   await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[client,'--url',url+'/?autostart=1','--actions-json',JSON.stringify({steps:[{buttons:[],frames:60},{buttons:['a'],frames:12},{buttons:[],frames:15}]}),'--iterations','1','--pause-ms','1000','--screenshot-dir',path.join(OUT,'skill')],{windowsHide:true,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code?reject(Error('skill client exit '+code)):resolve());});
  }
  console.log(JSON.stringify(results,null,2));
 }finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors));await browser.close();server.close();for(const s of relay.clients)s.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
