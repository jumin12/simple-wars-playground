'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/ai-combat-support',process.env.AUDIT_VERSION||'focused');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{let f=path.resolve(ROOT,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(ROOT+path.sep))return res.writeHead(403).end();if(process.env.BASELINE_DIR&&['index.html','ai-command.js'].includes(path.relative(ROOT,f)))f=path.join(ROOT,process.env.BASELINE_DIR,path.basename(f));fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ogg':'audio/ogg','.mp3':'audio/mpeg'})[path.extname(f)]||'application/octet-stream');res.end(b);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[],results={};page.on('pageerror',e=>errors.push(e.stack));page.setDefaultTimeout(180000);await context.routeWebSocket(/.*/,s=>{s.onMessage(()=>{});s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]}));});
try{await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks);
 await page.evaluate(()=>{
  setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
  window.h=(q,r=0)=>gameData.hexes[q+','+r];
  window.town=(q,r,owner,id)=>{const p=h(q,r);p.type='urban';p.cityId=id;p.owner=owner;const c={id,name:id,q,r,x:p.x,y:p.y,owner,hp:1000,maxHp:1000};gameData.cities.push(c);return c;};
  window.unit=(q,r=0,type='light',owner=2)=>{const p=h(q,r),u=createUnitAt(type,p.x,p.y,owner,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
  window.refresh=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();gameData._citySupplyCache=null;gameData._aiArrivalCache=null;gameData._aiCombatContexts={};gameData._aiLocalSituation=new WeakMap();wodInvalidateAiFrontlineHexCache();};
  window.supportWorld=(fog=false,kind='main')=>{
   wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(28);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=fog;gameData._factionIntel={};gameData.entities=[];gameData.nextUnitId=1;gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.alliances=[];gameData._aiFrontSupport=new WeakMap();gameData._aiLocalSituation=new WeakMap();gameData._aiDefenseByOwner={};gameData.aiTaskForces={};gameData.aiBattlePlans={};gameData.aiCommanderProfiles={2:'balanced'};gameData._aiEconomyClock=0;gameData.aiTimer=gameData.aiStrategyTimer=gameData.convoyTimer=gameData._transportAiTimer=-1e6;gameData.money=gameData.manpower=100000;gameData.aiMoneyByOwner={2:0};gameData.aiManpowerByOwner={2:100000};gameData._aiFrontOffensives={};gameData._aiFrontOffensiveChecks={};
   for(const p of gameData.hexList){p.type='grass';p.owner=p.q<=0?2:1;p.cityId=null;}
   const home=town(-20,0,2,'Home');town(20,0,1,'Enemy');
   const army=[unit(0),unit(-4,-2),unit(-4,0),unit(-4,2)],foes=[unit(1,-1,'light',1),unit(1,1,'light',1)],guard=unit(-20);
   const base={id:'group',kind:kind==='front'?'main':kind,role:'fix',holdHex:h(-4),attackHex:h(3),objectiveHex:kind==='main'?h(15):null,members:army.map(u=>u.uid)};
   const p={jobs:[base,{id:'guard',kind:'defend',city:home,members:[guard.uid]}],unitJob:Object.fromEntries(army.map(u=>[u.uid,base.id])),sectors:[],readyN:5};p.unitJob[guard.uid]='guard';gameData.aiTaskForces[2]=p;
   if(kind==='front'){const op={id:'front-test',hexes:gameData.hexes,at:0,until:180000,anchor:h(-4),goal:h(3),advanceGoal:h(15),hostile:1,members:base.members.slice(),initialN:4,phase:'advance',mode:'breakthrough',jobs:[]};op.jobs=[{id:'front-main',kind:'main',role:'breakthrough',response:true,frontOperation:op,members:op.members.slice(),holdHex:op.anchor,bound:0}];gameData._aiFrontOffensives[2]=op;}
   refresh();if(fog)wodFogFactionIntel(2,true);
   const initial=army.map(u=>({x:u.x,y:u.y}));
   for(const u of army.slice(1)){const j=wodAiGetUnitTaskJob(u);u.aiTfKind=j.kind;assignUnitMoveAlongWaypoints(u,[h(-10,u.r||0)]);wodAiStampOrder(u,false,h(-10),14000);u.aiOrderPhase=j.frontOperation?.phase;u.aiFrontBound=j.bound;u.aiOrderResponseId=j.response?j.id:null;}
   window.supportCase={army,foes,guard,p,base,initial,trace:[],combat:army.map(()=>0),first:army.map(()=>null)};return true;
  };
  window.supportSim=seconds=>{const c=supportCase;for(let i=0;i<seconds*20;i++){
   if(i%10===0){refresh();if(gameData.fogOfWar)wodFogFactionIntel(2,true);for(const u of c.army.filter(u=>u.hp>0)){const j=wodAiGetUnitTaskJob(u);if(j&&!wodAiShouldKeepCurrentOrder(u))wodAiIssueTaskForceOrder(u,j,u.hp/u.maxHp);}}
   wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();
   c.army.forEach((u,n)=>{if(u._combatEngaged){c.combat[n]+=.05;c.first[n]??=wodAiOperationTime()/1000;}});
   if(i%40===39){const u=c.army[2];c.trace.push({t:wodAiOperationTime()/1000,x:u.x,y:u.y,regroup:u._aiRegroupUntil,withdraw:u._aiWithdrawal,goal:u.orderTarget,battle:c.base._combatSupportBattle&&{enemy:c.base._combatSupportBattle.enemy,at:c.base._combatSupportBattle.at},stage:c.base.operationState?.stage});}
  }};
 });
 results.battles=[];
 for(const kind of ['main','front','hold'])for(const fog of [false,true]){
  await page.evaluate(({fog,kind})=>{supportWorld(fog,kind);supportSim(40);},{fog,kind});
  const r=await page.evaluate(()=>{const c=supportCase;return{trace:c.trace,combat:c.combat,first:c.first,guard:Math.hypot(c.guard.x-h(-20).x,c.guard.y)<1,alive:c.army.filter(u=>u.hp>0).length,damage:c.foes.reduce((n,u)=>n+u.maxHp-u.hp,0),forward:c.army.map((u,i)=>Math.round(u.x-c.initial[i].x)),events:wodAiDiagnostics(2).counts,units:c.army.map(u=>({id:u.uid,screen:c.base.operationState?.screenIds?.includes(u.uid)||false,moving:!!u.target,range:u.range,aimDistance:Math.min(...c.foes.filter(e=>e.hp>0).map(e=>Math.hypot(e.x-(u.orderTarget||u).x,e.y-(u.orderTarget||u).y))),x:u.x,y:u.y,hp:u.hp,holding:u.holding,target:u.orderTarget}))};});results.battles.push({kind,fog,...r});
  if(kind==='front'){await page.evaluate(()=>{for(const u of gameData.entities){u._drawX=u.x;u._drawY=u.y;}UI.panels.forEach(p=>p.classList.add('hidden'));UI.mainMenu.classList.add('hidden');UI.inGameUI.style.display='block';gameData.layers.territory=true;gameData.camera={zoom:2,x:-800,y:-480};wodMarkTerrainFullDirty();updateTerrainCache();draw();});await page.screenshot({path:path.join(OUT,fog?'fog-support.png':'clear-support.png')});fs.writeFileSync(path.join(OUT,fog?'fog-state.json':'clear-state.json'),await page.evaluate(()=>render_game_to_text()));}
 }
 results.safety=await page.evaluate(()=>{
  if(typeof wodAiIssueGroupCombatSupport!=='function')return{unavailable:true};
  const fresh=()=>{supportWorld(false,'hold');update(.05);refresh();return{...supportCase,u:supportCase.army[1],j:supportCase.base};};
  const denied=change=>{const c=fresh();change(c);return !wodAiIssueGroupCombatSupport(c.u,c.j,false);};
  const c=fresh(),before=JSON.stringify(c.u.orderTarget),positive=wodAiIssueGroupCombatSupport(c.u,c.j,false),probePreservesOrders=JSON.stringify(c.u.orderTarget)===before;
  const guard=denied(c=>c.j.city=gameData.cities[0]),fort=denied(c=>c.j.fort={}),recovery=denied(c=>c.u._medicalRecovering=true),wounded=denied(c=>c.u.hp=c.u.maxHp*.5),retreat=denied(c=>c.u.retreating=true);
  const wing=denied(c=>c.j.route=['-4,0','0,0']),trap=denied(c=>c.j.frontOperation={ambush:{stage:'lure'}}),screen=denied(c=>c.j.operationState={screenIds:[c.u.uid]}),naval=denied(c=>c.u._navalAssaultUntil=10000);
  const emergency=denied(c=>gameData._aiDefenseByOwner[2]={hexes:gameData.hexes,jobs:[{id:'urgent',kind:'counter',members:[c.u.uid]}],unitJob:{[c.u.uid]:'urgent'}});
  const superior=denied(()=>{for(let i=0;i<9;i++)unit(2,i-4,'heavy',1);refresh();});
  const otherFront=denied(c=>c.j.frontOwner=3),separateGroup=denied(c=>c.j.members=c.j.members.filter(id=>id!==c.army[0].uid));
  const noFight=denied(c=>{for(const u of [...c.army,...c.foes]){u._combatEngaged=false;u.combatTargetUid=null;}});
  const supply=denied(c=>{for(const p of gameData.hexList)if(p.q===-12)p.owner=1;refresh();});
  const river=denied(c=>{for(const p of gameData.hexList)if(p.q===-2){p.owner=0;p.type='water';}refresh();});
  const hidden=denied(c=>{gameData.fogOfWar=true;gameData._factionIntel={};for(const e of c.foes){e.x=h(24).x;e.y=h(24).y;}refresh();wodFogFactionIntel(2,true);});
  const firing=denied(c=>c.u._combatEngaged=true);
  const traffic=(()=>{const c=fresh();c.u._trafficYield={owner:2,until:25,points:[{x:-270,y:0}]};const initial=wodAiShouldKeepCurrentOrder(c.u);gameData._aiEconomyClock=4;return initial&&!wodAiShouldKeepCurrentOrder(c.u)&&!c.u._trafficYield;})();
  const expiry=(()=>{const c=fresh();c.u._aiCombatSupportAt=0;gameData._aiEconomyClock=3;for(const u of [...c.army,...c.foes])u._combatEngaged=false;return !wodAiShouldKeepCurrentOrder(c.u);})();
  return{positive,probePreservesOrders,guard,fort,recovery,wounded,retreat,wing,trap,screen,naval,emergency,superior,otherFront,separateGroup,noFight,supply,river,hidden,firing,traffic,expiry};
 });
 console.log(JSON.stringify(results,null,2));
 if(!process.env.OBSERVE_ONLY){assert(results.battles.every(r=>r.combat.filter(t=>t>.2).length>=3&&r.combat.every((t,i)=>t>.2||r.units[i].screen||r.units[i].moving&&!r.units[i].holding&&r.units[i].aimDistance<r.units[i].range&&r.forward[i]>=70)&&r.guard&&r.alive>=3),'all available nearby group members join the fight while deliberate flank screens and the town guard retain their duties in both fog modes');assert(Object.values(results.safety).every(Boolean),'support respects protected duties, strength, supply, visibility and stale-order expiry');assert.equal(errors.length,0);}
}finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({results,errors},null,2));await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
