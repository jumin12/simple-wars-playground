'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,process.env.ROUTE_ROOT||'output/line-routes',process.env.ROUTE_TAG||(process.env.BASELINE_DIR?'before':'after'));fs.mkdirSync(OUT,{recursive:true});
const enabled=name=>!process.env.ROUTE_CASE||process.env.ROUTE_CASE.split(',').includes(name);
const server=http.createServer((req,res)=>{let f=path.resolve(ROOT,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(ROOT+path.sep))return res.writeHead(403).end();if(process.env.BASELINE_DIR&&['index.html','ai-command.js'].includes(path.relative(ROOT,f)))f=path.join(ROOT,process.env.BASELINE_DIR,path.basename(f));fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.svg':'image/svg+xml','.json':'application/json'})[path.extname(f)]||'application/octet-stream');res.end(b);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:960},hasTouch:true}),page=await context.newPage(),errors=[],results={};page.setDefaultTimeout(180000);page.on('pageerror',e=>errors.push(e.stack));await context.routeWebSocket(/.*/,s=>{s.onMessage(()=>{});s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]}));});
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks);
 await page.evaluate(()=>{
  setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
  window.world=()=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(28);gameState='PLAYING';gameData.mp={enabled:false};gameData.menuAttractMode=false;gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.alliances=[];gameData._aiEconomyClock=0;gameData.aiTimer=gameData.aiStrategyTimer=gameData.convoyTimer=gameData._transportAiTimer=-1e6;for(const h of gameData.hexList){h.type='grass';h.owner=1;h.cityId=null;}const h=gameData.hexes['-25,0'];h.type='urban';h.cityId='home';gameData.cities.push({id:'home',name:'Home',q:h.q,r:h.r,x:h.x,y:h.y,owner:1,hp:1000,maxHp:1000});};
  window.h=(q,r=0)=>gameData.hexes[q+','+r];
  window.unit=(q,r=0,type='light')=>{const p=h(q,r),u=createUnitAt(type,p.x,p.y,1,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
  window.refresh=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();gameData._citySupplyCache=null;gameData._aiArrivalCache=null;wodInvalidateAiFrontlineHexCache();};
  window.pump=()=>{for(let n=0;n<100&&wodPlayerOrderQueue.length;n++){wodPfSpentMs=0;wodPfBudgetMs=100;wodPumpPlayerOrderQueue();}};
  window.route=u=>[{x:u.x,y:u.y},...(u.target?[u.target]:[]),...(u.path||[])];
  window.length=pts=>pts.slice(1).reduce((s,p,i)=>s+Math.hypot(p.x-pts[i].x,p.y-pts[i].y),0);
  window.sim=(army,seconds)=>{const goals=army.map(u=>({...u.orderTarget})),distance=army.map(()=>0),arrival=army.map(()=>null);let overlaps=0,invalid=0,changed=0;for(let t=0;t<seconds*20;t++){const prev=army.map(u=>({x:u.x,y:u.y}));wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodPumpPlayerOrderQueue();for(let i=0;i<army.length;i++){const u=army[i];distance[i]+=Math.hypot(u.x-prev[i].x,u.y-prev[i].y);if(arrival[i]===null&&Math.hypot(u.x-goals[i].x,u.y-goals[i].y)<2)arrival[i]=(t+1)/20;if(getNearestHexToPoint(u.x,u.y)?.type==='mountain'&&u.type!=='mountaineer')invalid++;if(u.orderTarget&&Math.hypot(u.orderTarget.x-goals[i].x,u.orderTarget.y-goals[i].y)>1)changed++;for(let j=i+1;j<army.length;j++)if(Math.hypot(u.x-army[j].x,u.y-army[j].y)<u.radius+army[j].radius-.05)overlaps++;}}return{arrived:army.filter((u,i)=>Math.hypot(u.x-goals[i].x,u.y-goals[i].y)<2).length,total:army.length,distance,arrival,overlaps,invalid,changed,remaining:army.map((u,i)=>Math.hypot(u.x-goals[i].x,u.y-goals[i].y))};};
  window.shape=(army,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy),ax=dx/l,ay=dy/l,goals=army.map(u=>u.orderTarget),projection=goals.map(g=>(g.x-a.x)*ax+(g.y-a.y)*ay).sort((a,b)=>a-b);return{maxPerpendicular:Math.max(...goals.map(g=>Math.abs((g.x-a.x)*ay-(g.y-a.y)*ax))),span:projection.at(-1)-projection[0],minGap:Math.min(...projection.slice(1).map((p,i)=>p-projection[i])),goals};};
 });
 for(const [name,a,b] of [['vertical',{x:280,y:-40},{x:280,y:40}],['diagonal',{x:200,y:-40},{x:280,y:40}],['horizontal',{x:200,y:150},{x:280,y:150}],['reverse',{x:280,y:40},{x:280,y:-40}],['long',{x:260,y:-350},{x:260,y:350}]]){
  if(!enabled(name))continue;
  results[name]=await page.evaluate(({a,b})=>{world();const army=Array.from({length:24},(_,i)=>unit(-15-i%6,Math.floor(i/6)*2-3));refresh();gameData.selection=army.slice().reverse();issueLineFormationOrder(a,b);pump();const geometry=shape(army,a,b);return{...geometry,...sim(army,230)};},{a,b});
  console.log(name,JSON.stringify({...results[name],goals:undefined,distance:undefined,remaining:undefined}));
 }
 for(const type of ['light','heavy','marine']){
  if(!enabled('ridge-'+type))continue;
  results['ridge-'+type]=await page.evaluate(type=>{world();for(const p of gameData.hexList)if(p.r===1&&Math.abs(p.q)<=20)p.type='mountain';const u=unit(-14,0,type),goal=h(14);refresh();assignUnitMoveAlongWaypoints(u,[{x:goal.x,y:goal.y}]);const straight=Math.hypot(goal.x-u.x,goal.y-u.y),planned=length(route(u));return{straight,planned,ratio:planned/straight,...sim([u],170)};},type);
  console.log('ridge-'+type,JSON.stringify(results['ridge-'+type]));
 }
 if(enabled('forest'))results.forest=await page.evaluate(()=>{world();for(const p of gameData.hexList)if(Math.abs(p.q)<5&&Math.abs(p.r)<5)p.type='forest';const u=unit(-14),g=h(14);refresh();assignUnitMoveAlongWaypoints(u,[{x:g.x,y:g.y}]);return{planned:length(route(u)),straight:g.x-u.x,...sim([u],170)};});
 if(enabled('parallel'))results.parallel=await page.evaluate(()=>{world();const army=Array.from({length:12},(_,i)=>unit(-14,i*2-11));refresh();wodApplyPlayerMoveOrders(army,u=>[{x:h(14,getNearestHexToPoint(u.x,u.y).r).x,y:u.y}]);pump();const planned=army.map(u=>length(route(u))),straight=army.map(u=>Math.hypot(u.orderTarget.x-u.x,u.orderTarget.y-u.y));return{planned,straight,...sim(army,190)};});
 if(enabled('obstacle'))results.obstacle=await page.evaluate(()=>{world();for(const p of gameData.hexList)if(p.q===0&&p.r>=-6&&p.r<=12)p.type='mountain';const u=unit(-14),g=h(14);refresh();assignUnitMoveAlongWaypoints(u,[{x:g.x,y:g.y}]);const routePoints=route(u),planned=length(routePoints);return{planned,routePoints,...sim([u],210)};});
 if(enabled('motorized'))results.motorized=await page.evaluate(()=>{world();for(const p of gameData.hexList)if(Math.abs(p.q)<8&&Math.abs(p.r)<=1)p.type='swamp';const u=unit(-14,0,'motorized'),g=h(14);refresh();assignUnitMoveAlongWaypoints(u,[{x:g.x,y:g.y}]);const points=route(u);return{points,planned:length(points),detours:points.some(p=>Math.abs(p.y)>40),...sim([u],230)};});
 if(enabled('obstacleGroup'))results.obstacleGroup=await page.evaluate(()=>{world();for(const p of gameData.hexList)if(p.q===0&&Math.abs(p.r)<=5)p.type='mountain';const army=Array.from({length:20},(_,i)=>unit(-15-i%5,Math.floor(i/5)*2-3));refresh();gameData.selection=army;issueLineFormationOrder({x:300,y:-40},{x:300,y:40});pump();const planned=army.map(u=>length(route(u)));return{planned,...sim(army,260)};});
 if(enabled('mixed'))results.mixed=await page.evaluate(()=>{world();const army=Array.from({length:18},(_,i)=>unit(-15-i%6,Math.floor(i/6)*2-2,i%3===0?'heavy':i%3===1?'motorized':'light'));refresh();gameData.selection=army;const a={x:300,y:-40},b={x:300,y:40};issueLineFormationOrder(a,b);pump();return{...shape(army,a,b),...sim(army,250)};});
 if(enabled('shiftLine'))results.shiftLine=await page.evaluate(()=>{world();const army=Array.from({length:12},(_,i)=>unit(-15-i%4,Math.floor(i/4)*2-2));refresh();const a={x:300,y:-40},b={x:300,y:40};wodApplyShiftWaypointPaths(army,[{x:-120,y:-200},{x:300,y:0}],{start:a,end:b});pump();return{...shape(army,a,b),...sim(army,260)};});
 if(enabled('remoteLine'))results.remoteLine=await page.evaluate(()=>{wodMpWireLobbyUi();world();for(const p of gameData.hexList)p.owner=2;gameData.cities[0].owner=2;gameData.mp={enabled:true,isHost:true,localSlot:1,humanSlots:[1,2],allReady:true};const army=Array.from({length:12},(_,i)=>{const u=unit(-15-i%4,Math.floor(i/4)*2-2);u.owner=2;return u;});refresh();const a={x:300,y:-40},b={x:300,y:40};dispatchEvent(new CustomEvent('wod-mp-RemoteCmd',{detail:{fromSlot:2,cmd:{kind:'lineFormation',uids:army.map(u=>u.uid).reverse(),sx:a.x,sy:a.y,ex:b.x,ey:b.y}}}));pump();return{...shape(army,a,b),...sim(army,240)};});
 if(enabled('optimal'))results.optimal=await page.evaluate(()=>{
  const rows=[];
  for(let seed=1;seed<=6;seed++)for(const type of ['light','motorized']){
   world();let rng=seed;const random=()=>((rng=Math.imul(rng,1664525)+1013904223>>>0)/4294967296);
   for(const p of gameData.hexList){const n=random();p.type=Math.abs(p.q)>10||Math.abs(p.r)>10?'mountain':n<.12?'mountain':n<.3?'swamp':n<.5?'hill':n<.7?'forest':'grass';}
   const start=h(-9,-8),goal=h(9,8);start.type=goal.type='grass';const u=unit(start.q,start.r,type);refresh();
   const key=p=>p.q+','+p.r,walk=p=>p&&p.type!=='mountain',speed=p=>type==='motorized'?({forest:.72,hill:.68,swamp:.42,urban:.8}[p.type]||1):1;
   const edge=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)*(1/speed(a)+1/speed(b))/2;
   const costs=new Map([[key(start),0]]),queue=[[0,start]],done=new Set();let optimum=Infinity;
   while(queue.length){queue.sort((a,b)=>b[0]-a[0]);const [cost,p]=queue.pop(),k=key(p);if(done.has(k))continue;done.add(k);if(p===goal){optimum=cost;break;}for(let dq=-1;dq<=1;dq++)for(let dr=-1;dr<=1;dr++){if(!dq&&!dr)continue;const n=h(p.q+dq,p.r+dr);if(!walk(n)||dq&&dr&&(!walk(h(p.q+dq,p.r))||!walk(h(p.q,p.r+dr))))continue;const next=cost+edge(p,n);if(next<(costs.get(key(n))??Infinity)){costs.set(key(n),next);queue.push([next,n]);}}}
   wodPfSpentMs=0;wodPfBudgetMs=100;u._wodPfRelaxUntil=performance.now()+10000;const points=findPathAroundTerrain(u,goal,start,true,'land',true);let actual=0;
   for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],steps=Math.max(Math.abs(b.q-a.q),Math.abs(b.r-a.r));let prev=a;for(let s=1;s<=steps;s++){const p=h(Math.round(a.q+(b.q-a.q)*s/steps),Math.round(a.r+(b.r-a.r)*s/steps));actual+=edge(prev,p);prev=p;}}
   rows.push({seed,type,optimum,actual,ratio:actual/optimum,reached:points.at(-1)===goal});
  }return rows;
 });
 if(enabled('gestures')){
  const cases=[
   {name:'right-short-out',zoom:.5,dy:8,line:true},
   {name:'right-short-in',zoom:2,dy:8,line:true},
   {name:'right-minimum',zoom:1,dy:4,line:true},
   {name:'right-diagonal',zoom:1,dx:8,dy:8,line:true},
   {name:'right-click',zoom:1,dy:0,line:false},
   {name:'right-jitter',zoom:1,dy:3,line:false},
   {name:'formation-tap',zoom:1,dy:0,mode:'formation',line:true},
   {name:'formation-tiny',zoom:1,dy:2,mode:'formation',line:true},
   {name:'formation-right-tap',zoom:1,dy:0,mode:'formation',button:'right',line:true},
   {name:'shift-short',zoom:1,dy:8,shift:true,line:true},
   {name:'waypoint-short',zoom:1,dy:8,mode:'waypoint',line:true},
   {name:'waypoint-right-short',zoom:1,dy:8,mode:'waypoint',button:'right',line:true},
   {name:'touch-formation-tap',zoom:.5,dy:0,mode:'formation',touch:true,line:true},
   {name:'touch-formation-tiny',zoom:.5,dy:2,mode:'formation',touch:true,line:true},
   {name:'touch-waypoint-short',zoom:.5,dy:8,mode:'waypoint',touch:true,line:true}
  ];
  for(const c of cases){
   await page.setViewportSize(c.touch?{width:390,height:844}:{width:1440,height:960});
   const points=await page.evaluate(c=>{world();wodSuppressCanvasMouseUntil=0;setMobileOrderMode(null);wodCancelMobileNavTouch();formationDrag.active=false;shiftWaypointDrag.active=false;leftMapOrderDrag.active=false;window.uiArmy=Array.from({length:c.zoom===2?8:12},(_,i)=>unit(-10-i%4*2,Math.floor(i/4)*2-2));gameData.selection=uiArmy;for(const u of uiArmy)u.selected=true;refresh();UI.panels.forEach(p=>p.classList.add('hidden'));UI.mainMenu.classList.add('hidden');UI.inGameUI.style.display='block';wodSyncViewportAndCanvas();gameData.camera={zoom:c.zoom,x:100*c.zoom-canvas.clientWidth*.55,y:-canvas.clientHeight*.37};syncInfoCardPanel();wodMarkTerrainFullDirty();updateTerrainCache();draw();const r=canvas.getBoundingClientRect(),a={x:100-(c.dx||0)/c.zoom/2,y:-(c.dy||0)/c.zoom/2},b={x:100+(c.dx||0)/c.zoom/2,y:(c.dy||0)/c.zoom/2},screen=p=>({x:r.left+p.x*c.zoom-gameData.camera.x,y:r.top+p.y*c.zoom-gameData.camera.y});window.gestureAxis=(c.dx||c.dy)?{a,b}:{a:{x:99,y:0},b:{x:101,y:0}};return{a:screen(a),b:screen(b)};},c);
   if(c.mode)await page.locator('#infoCard [data-mo="'+c.mode+'"]').click();
   if(c.shift)await page.keyboard.down('Shift');
   let touch;
   if(c.touch){touch=await context.newCDPSession(page);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[points.a]});if(c.dx||c.dy)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[points.b]});}
   else{await page.mouse.move(points.a.x,points.a.y);await page.mouse.down({button:c.button||(c.mode?'left':'right')});if(c.dx||c.dy)await page.mouse.move(points.b.x,points.b.y,{steps:4});}
   await page.evaluate(()=>draw());await page.screenshot({path:path.join(OUT,c.name+'-preview.png')});
   const preview=await page.evaluate(()=>typeof wodFormationDragPlan==='function'?[...wodFormationDragPlan(getMovableSelectedUnits()).slots].map(([u,p])=>({uid:u.uid,...p})):[...wodLineFormationPlan(uiArmy,formationDrag.startWorld,formationDrag.endWorld).slots].map(([u,p])=>({uid:u.uid,...p})));
   if(c.touch){await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.detach();}else await page.mouse.up({button:c.button||(c.mode?'left':'right')});
   if(c.shift)await page.keyboard.up('Shift');
   results['gesture-'+c.name]=await page.evaluate(({preview,c,planOnly})=>{pump();const geometry=shape(uiArmy,gestureAxis.a,gestureAxis.b),previewError=Math.max(0,...preview.map(p=>{const u=uiArmy.find(u=>u.uid===p.uid);return u.orderTarget?Math.hypot(u.orderTarget.x-p.x,u.orderTarget.y-p.y):9999;})),movement=planOnly?{}:sim(uiArmy,170);draw();return{expectLine:c.line,...geometry,previewError,...movement};},{preview,c,planOnly:!!process.env.GESTURE_PLAN_ONLY});
   await page.screenshot({path:path.join(OUT,c.name+'-arrived.png')});console.log(c.name,JSON.stringify({...results['gesture-'+c.name],goals:undefined,distance:undefined,arrival:undefined,remaining:undefined}));
  }
 }
 if(enabled('ui')){
 await page.setViewportSize({width:1440,height:960});
 const screen=await page.evaluate(()=>{world();setMobileOrderMode(null);wodSuppressCanvasMouseUntil=0;wodSyncViewportAndCanvas();window.uiArmy=Array.from({length:24},(_,i)=>unit(-15-i%6,Math.floor(i/6)*2-3));gameData.selection=uiArmy;for(const u of uiArmy)u.selected=true;refresh();UI.panels.forEach(p=>p.classList.add('hidden'));UI.mainMenu.classList.add('hidden');UI.inGameUI.style.display='block';gameData.camera={zoom:.8,x:-760,y:-520};wodMarkTerrainFullDirty();updateTerrainCache();draw();const r=canvas.getBoundingClientRect();const screen=p=>({x:r.left+(p.x*gameData.camera.zoom-gameData.camera.x)*r.width/canvas.clientWidth,y:r.top+(p.y*gameData.camera.zoom-gameData.camera.y)*r.height/canvas.clientHeight});return{a:screen({x:100,y:-40}),b:screen({x:100,y:40})};});
 await page.mouse.move(screen.a.x,screen.a.y);await page.mouse.down({button:'right'});await page.mouse.move(screen.b.x,screen.b.y,{steps:14});await page.evaluate(()=>draw());await page.screenshot({path:path.join(OUT,'line-preview.png')});
 const preview=await page.evaluate(()=>typeof wodLineFormationPlan==='function'?[...wodLineFormationPlan(uiArmy,formationDrag.startWorld,formationDrag.endWorld).slots].map(([u,p])=>({uid:u.uid,...p})):[]);
 await page.mouse.up({button:'right'});results.ui=await page.evaluate(preview=>{pump();const geometry=shape(uiArmy,{x:100,y:-40},{x:100,y:40}),previewError=Math.max(0,...preview.map(p=>{const u=uiArmy.find(u=>u.uid===p.uid);return Math.hypot(u.orderTarget.x-p.x,u.orderTarget.y-p.y);}));draw();return{...geometry,previewError,previewCount:preview.length,...sim(uiArmy,230)};},preview);await page.evaluate(()=>draw());await page.screenshot({path:path.join(OUT,'line-arrived.png')});
 }
 console.log('other',JSON.stringify({forest:results.forest,parallel:results.parallel,obstacle:results.obstacle,motorized:results.motorized,ui:{...results.ui,goals:undefined,distance:undefined,remaining:undefined}}));
 if(!process.env.OBSERVE_ONLY){
  for(const [name,r]of Object.entries(results)){if(Array.isArray(r))continue;assert.equal(r.arrived,r.total,name+' every unit reaches its unchanged target');assert.equal(r.overlaps,0,name+' no body overlap');assert.equal(r.invalid,0,name+' no illegal terrain');assert.equal(r.changed,0,name+' no command changes');}
  if(results.optimal)for(const r of results.optimal){assert(r.reached&&Number.isFinite(r.optimum),'oracle fixture must be reachable');assert(r.ratio<=1.00001,'A* must equal independent shortest travel-time oracle: '+JSON.stringify(r));}
  for(const [name,r]of Object.entries(results).filter(([n])=>n.startsWith('gesture-'))){assert(r.expectLine?r.maxPerpendicular<1:r.maxPerpendicular>10,name+' must distinguish a tight line from an ordinary click');assert(r.previewError<.1,name+' preview must match the issued formation');}
  if(results.obstacleGroup)assert(results.obstacleGroup.distance.every((d,i)=>d/results.obstacleGroup.planned[i]<1.5),'large group must not orbit or take excessive detours around the wall');
  for(const name of ['vertical','diagonal','horizontal','reverse','long','mixed','shiftLine','remoteLine','ui']){if(!results[name])continue;assert(results[name].maxPerpendicular<1,name+' must be a single line');assert(results[name].minGap>=26.9,name+' bodies must fit side by side');}if(results.ui){assert.equal(results.ui.previewCount,24);assert(results.ui.previewError<.1,'preview positions must equal issued positions');}
  for(const type of ['light','heavy','marine']){const r=results['ridge-'+type];if(!r)continue;assert(r.ratio<1.001,type+' clear land route must be straight');assert(r.distance[0]/r.straight<1.01,type+' actual movement must stay straight');}if(results.forest)assert(results.forest.planned/results.forest.straight<1.001,'infantry must not detour around forest');if(results.motorized)assert(results.motorized.detours,'motorized should prefer faster dry ground over long swamp');if(results.parallel)assert(results.parallel.distance.every((d,i)=>d/results.parallel.straight[i]<1.02),'parallel land group must not weave or detour');assert.equal(errors.length,0);
 }
}finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({results,errors},null,2));await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
