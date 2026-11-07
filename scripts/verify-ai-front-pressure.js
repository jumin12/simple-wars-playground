'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/ai-front-pressure-20261107',process.env.AUDIT_VERSION||'focused');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{let f=path.resolve(ROOT,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(ROOT+path.sep))return res.writeHead(403).end();if(process.env.BASELINE_DIR&&['index.html','ai-command.js'].includes(path.relative(ROOT,f)))f=path.join(ROOT,process.env.BASELINE_DIR,path.basename(f));fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.css':'text/css','.ogg':'audio/ogg','.mp3':'audio/mpeg'})[path.extname(f)]||'application/octet-stream');res.end(b);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[],results={};page.setDefaultTimeout(180000);page.on('pageerror',e=>errors.push(e.stack));await context.routeWebSocket(/.*/,s=>{s.onMessage(()=>{});s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]}));});
try{await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks);
await page.evaluate(()=>{
 setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
 window.world=()=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(36);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;gameData.entities=[];gameData.nextUnitId=1;gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.alliances=[];gameData.aiTaskForces={};gameData.aiBattlePlans={};gameData.aiCommanderProfiles={2:'balanced'};gameData._aiEconomyClock=0;gameData.aiTimer=gameData.aiStrategyTimer=gameData.convoyTimer=gameData._transportAiTimer=-1e6;gameData.aiMoneyByOwner={2:0};gameData.aiManpowerByOwner={2:100000};gameData.money=gameData.manpower=100000;gameData._aiFrontOffensives={};gameData._aiFrontOffensiveChecks={};gameData._aiDefenseByOwner={};gameData._aiCombatContexts={};gameData._aiLocalSituation=new WeakMap();for(const h of gameData.hexList){h.type='grass';h.owner=h.q<=0?2:1;h.cityId=null;}};
 window.h=(q,r=0)=>gameData.hexes[q+','+r];window.town=(q,r,owner,id)=>{const p=h(q,r);p.type='urban';p.cityId=id;p.owner=owner;const c={id,name:id,q,r,x:p.x,y:p.y,owner,hp:1000,maxHp:1000};gameData.cities.push(c);return c;};window.unit=(q,r=0,type='light',owner=2)=>{const p=h(q,r),u=createUnitAt(type,p.x,p.y,owner,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
 window.refresh=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();gameData._citySupplyCache=null;gameData._aiArrivalCache=null;gameData._aiCombatContexts={};gameData._aiLocalSituation=new WeakMap();wodInvalidateAiFrontlineHexCache();};
 window.makePlan=(army,home)=>{const guard=unit(home.q,home.r),jobs=[{id:'guard',kind:'defend',city:home,members:[guard.uid]}],unitJob={[guard.uid]:'guard'};for(const [i,u]of army.entries()){const j={id:'j'+i,kind:'main',role:'breakthrough',members:[u.uid],holdHex:h(-2),attackHex:h(1),objectiveHex:h(1)};jobs.push(j);unitJob[u.uid]=j.id;}const p={jobs,unitJob,sectors:[{holdHex:h(-2),attackHex:h(1)}],readyN:army.length+1};gameData.aiTaskForces[2]=p;return{p,guard};};
 window.sim=(seconds,orders)=>{for(let i=0;i<Math.round(seconds*20);i++){if(i%10===0){refresh();orders?.();}wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();}};
 window.flankWorld=(n=18)=>{world();const home=town(-24,0,2,'Home');town(27,0,1,'Enemy');const army=Array.from({length:n},(_,i)=>unit(-4-Math.floor(i/9)*2,(i%9-4)*2,i<3?'heavy':'light'));const foes=Array.from({length:8},(_,i)=>unit(3+Math.floor(i/4)*2,(i%4-1.5)*2,'light',1));const{p,guard}=makePlan(army,home);refresh();return{army,foes,p,guard};};
});


results.approach=[];
for(const fog of [false,true])results.approach.push(await page.evaluate(fog=>{
 world();const home=town(-24,0,2,'Home');town(28,0,1,'Enemy');
 for(const x of gameData.hexList)if(!x.cityId)x.type='forest';
 const army=Array.from({length:6},(_,i)=>unit(-3-Math.floor(i/3),(i%3-1)*2,'motorized')),foe=unit(4,0,'light',1),{p,guard}=makePlan(army,home);
 const op={id:'approach',hexes:gameData.hexes,at:0,until:180000,anchor:h(-3),goal:h(4),hostile:1,frontOwner:0,members:army.map(u=>u.uid),initialN:6,capacity:6,phase:'gather',mode:'breakthrough',jobs:[]};
 op.jobs=[{id:'approach-main',kind:'main',role:'breakthrough',response:true,members:op.members.slice(),frontOperation:op,holdHex:op.anchor,bound:0}];gameData._aiFrontOffensives[2]=op;
 gameData.fogOfWar=fog;gameData._factionIntel={};refresh();if(fog)wodFogFactionIntel(2,true);
 const initial=wodAiCommandDecision(2,op),start=army.map(u=>u.x);let contacted=false;
 sim(100,()=>{for(const u of army.filter(u=>u.hp>0)){const j=wodAiGetUnitTaskJob(u);if(j&&!wodAiShouldKeepCurrentOrder(u))wodAiIssueTaskForceOrder(u,j,u.hp/u.maxHp);}contacted ||=foe.hp<foe.maxHp;});
 return{fog,initial:{phase:initial.phase,reason:initial.reason,arrivals:initial.arrivals.length,ratio:initial.ratio,approach:initial.approach},advanced:army.filter((u,i)=>u.x>start[i]+55).length,contacted,damage:foe.maxHp-foe.hp,guard:Math.hypot(guard.x-home.x,guard.y-home.y)<1,alive:army.filter(u=>u.hp>0).length};
},fog));
results.distribution=await page.evaluate(()=>[9,10,12,72].map(n=>{
 world();const home=town(-27,0,2,'Home');town(28,0,1,'Enemy');const army=Array.from({length:n},(_,i)=>unit(-3-Math.floor(i/24)*2,(i%24-11.5)*2)),{p,guard}=makePlan(army,home);p.sectors=[-20,0,20].map(r=>({holdHex:h(-2,r),attackHex:h(2,r)}));refresh();wodAiPlanFrontOffensive(2,p,[...army,guard]);const ops=wodAiActiveFrontOperations(2),ids=ops.flatMap(o=>o.members);return{n,counts:ops.map(o=>o.members.length),committed:ids.length,disjoint:ids.length===new Set(ids).size,guard:!ids.includes(guard.uid),goals:new Set(ops.map(o=>getHexKey(o.goal))).size};
}));
results.joint=await page.evaluate(()=>[1,4].map(enemies=>{
 world();const home=town(-26,0,2,'Home');town(28,0,1,'Enemy');const army=[];for(const r of [-6,0,6])for(let i=0;i<6;i++)army.push(unit(-4-i%2,r+Math.floor(i/2)-1));const{p,guard}=makePlan(army,home);refresh();
 for(let slot=0;slot<3;slot++){const ids=army.slice(slot*6,slot*6+6).map(u=>u.uid),op={id:'force-'+slot,slot,frontOwner:0,hexes:gameData.hexes,at:0,until:180000,anchor:h(-4,(slot-1)*6),goal:h(3,(slot-1)*12),hostile:1,members:ids,initialN:6,capacity:6,phase:'advance',mode:'breakthrough',jobs:[]};op.jobs=[{id:op.id+'-main',kind:'main',role:'breakthrough',response:true,members:ids.slice(),frontOperation:op,holdHex:op.anchor,bound:0}];gameData._aiFrontOffensives[slot?'2:group-'+slot:2]=op;}
 for(let i=0;i<enemies;i++)unit(3,(i-(enemies-1)/2)*2,'light',1);refresh();wodAiCoordinateJointAssaults(2,p);const ops=wodAiActiveFrontOperations(2),joint=ops.find(o=>o.joint)?.joint,joined=ops.filter(o=>o.joint&&o.joint===joint);return{enemies,joined:joined.length,independent:ops.filter(o=>!o.joint).length,anchors:new Set(joined.map(o=>getHexKey(o.jobs[0].holdHex))).size,roles:joined.flatMap(o=>o.jobs.map(j=>j.role)),guard:!joined.some(o=>o.members.includes(guard.uid))};
}));
await page.evaluate(()=>{
 const p=gameData.aiTaskForces[2],guard=gameData.entities.find(u=>p.jobs.find(j=>j.id===p.unitJob[u.uid])?.city),army=gameData.entities.filter(u=>u.owner===2&&u!==guard),foes=gameData.entities.filter(u=>u.owner===1);
 window.pressureBattle={p,guard,army,foes,start:army.map(u=>u.x)};
 window.pressureOrders=()=>{wodAiPlanFrontOffensive(2,p,[...army,guard]);for(const u of army.filter(u=>u.hp>0)){const j=wodAiGetUnitTaskJob(u);if(j&&!wodAiShouldKeepCurrentOrder(u))wodAiIssueTaskForceOrder(u,j,u.hp/u.maxHp);}};
 sim(35,pressureOrders);UI.panels.forEach(p=>p.classList.add('hidden'));UI.mainMenu.classList.add('hidden');UI.inGameUI.style.display='block';gameData.layers.territory=true;gameData.camera={zoom:1.5,x:-canvas.clientWidth/2,y:-canvas.clientHeight/2};wodMarkTerrainFullDirty();updateTerrainCache();draw();
});
await page.screenshot({path:path.join(OUT,'coordinated-front.png')});fs.writeFileSync(path.join(OUT,'state.json'),await page.evaluate(()=>render_game_to_text()));
results.battle=await page.evaluate(()=>{sim(65,pressureOrders);const c=pressureBattle;return{damage:c.foes.reduce((n,u)=>n+u.maxHp-u.hp,0),advanced:[0,6,12].map(start=>c.army.slice(start,start+6).filter((u,i)=>u.x>c.start[start+i]+55).length),guard:c.guard.hp>0&&Math.hypot(c.guard.x-h(-26).x,c.guard.y)<1,land:gameData.hexList.filter(h=>h.q>0&&h.owner===2).length,events:wodAiDiagnostics(2).counts};});
results.safety=await page.evaluate(()=>{
 world();town(-24,0,2,'Home');town(28,0,1,'Enemy');const army=[unit(-3,-2),unit(-3,0),unit(-3,2)],{p}=makePlan(army,gameData.cities[0]);for(let i=0;i<7;i++)unit(3,i-3,'heavy',1);refresh();const op={id:'weak',hexes:gameData.hexes,at:0,until:180000,anchor:h(-3),goal:h(3),hostile:1,members:army.map(u=>u.uid),phase:'gather',jobs:[]};op.jobs=[{id:'weak-main',kind:'main',role:'breakthrough',response:true,members:op.members.slice(),frontOperation:op,holdHex:op.anchor}];gameData._aiFrontOffensives[2]=op;const weak=wodAiCommandDecision(2,op);for(const u of army.slice(1)){u.x=h(-28).x;u.y=h(-28).y;}refresh();gameData._aiEconomyClock=3;op.commandDecision=null;const split=wodAiCommandDecision(2,op);return{weak:weak.phase!=='advance',split:split.phase!=='advance'};
});
results.reinforcements=await page.evaluate(()=>{
 world();const home=town(-24,0,2,'Home');town(28,0,1,'Enemy');const army=Array.from({length:16*3},(_,i)=>unit(-4-Math.floor(i/16)*2,(i%16-7.5)*2)),{p}=makePlan(army,home);refresh();
 for(let slot=0;slot<16;slot++){const members=army.slice(slot*3,slot*3+3).map(u=>u.uid),op={id:'squad-'+slot,slot,frontOwner:0,hexes:gameData.hexes,at:0,until:180000,anchor:h(-3),goal:h(3),hostile:1,members,initialN:3,capacity:slot===15?6:3,phase:'advance',jobs:[]};op.jobs=[{id:op.id+'-main',kind:'main',role:'breakthrough',members:members.slice(),frontOperation:op,holdHex:op.anchor}];gameData._aiFrontOffensives[slot?'2:group-'+slot:2]=op;}
 const requests=wodAiForceRequests(2,[home],army,[]);return{rearSquad:requests.some(r=>r.squad==='squad-15'&&r.n>0),source:requests.find(r=>r.squad==='squad-15')?.source};
});
results.banks=await page.evaluate(()=>{
 world();for(const x of gameData.hexList)if(x.q===0){x.type='water';x.owner=0;}const home=town(-24,0,2,'Home'),goal=town(-5,12,1,'Reachable');town(28,0,1,'Far');const army=Array.from({length:6},(_,i)=>unit(-3-Math.floor(i/3),(i%3-1)*2)),{p}=makePlan(army,home);unit(3,0,'light',1);refresh();const op={id:'bank',hexes:gameData.hexes,at:0,until:180000,anchor:h(-3),goal,hostile:1,members:army.map(u=>u.uid),phase:'gather',jobs:[]};op.jobs=[{id:'bank-main',kind:'main',role:'breakthrough',response:true,members:op.members.slice(),frontOperation:op,holdHex:op.anchor}];gameData._aiFrontOffensives[2]=op;const distant=wodAiCommandDecision(2,op);const e=gameData.entities.find(u=>u.owner===1);e.type='heavy';e.range=90;e.x=h(1).x;for(const u of army){u.x=h(-1).x;u.y=0;}refresh();gameData._aiEconomyClock=3;op.commandDecision=null;const firing=wodAiCommandDecision(2,op);return{distant:distant.phase==='advance'&&distant.enemy===0,firing:firing.enemy>0};
});
console.log(JSON.stringify(results,null,2));
if(!process.env.OBSERVE_ONLY){
 assert(results.approach.every(r=>r.initial.phase==='advance'&&r.advanced>=3&&r.contacted&&r.guard&&r.alive>=4),'a supported group closes a terrain-slowed approach and engages in fog and clear');
 assert(results.distribution.every(r=>r.committed===r.n&&r.disjoint&&r.guard&&r.counts.every(n=>n>=3&&n<=8)&&r.goals>=2),'small remnants and large armies all receive distinct viable attacking forces');
 assert(results.joint.find(r=>r.enemies===1).joined===0,'one weak opponent does not consume three attack groups');
 const j=results.joint.find(r=>r.enemies===4);assert(j.joined===2&&j.independent===1&&j.anchors===2&&j.roles.includes('pin')&&j.roles.some(r=>r==='left'||r==='right')&&j.guard,'two squads fix and flank while a third retains its own mission and distinct staging');
 assert(results.battle.damage>50&&results.battle.advanced.every(n=>n>=2)&&results.battle.guard&&results.battle.land>10,'separate squads physically advance, engage and capture while the garrison holds');
 assert(results.reinforcements.rearSquad&&results.reinforcements.source==='Home','additional attacking squads receive reachable reinforcements instead of falling outside the old recruitment scan');
 assert(Object.values(results.banks).every(Boolean),'unreachable bank contacts do not freeze another objective, but cross-river firing threats still count');
 assert(Object.values(results.safety).every(Boolean));assert.deepEqual(errors,[]);
}
}finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({results,errors},null,2));await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
