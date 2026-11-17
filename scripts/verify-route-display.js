'use strict';
// The route drawn for a marching unit shows only where it is going: it starts at the unit and never reaches back to
// ground already passed; a deselected unit shows only the leg to its next waypoint, a selected one the whole route.
const H=require('./lib/harness');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/route-display');fs.mkdirSync(OUT,{recursive:true});
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[],results={};page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:60000});
 await page.evaluate(()=>{
  setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
  window.h=(q,r=0)=>gameData.hexes[q+','+r];
  wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(28);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData.fogOfWar=false;gameData.entities=[];gameData.cities=[];gameData.selection=[];
  for(const p of gameData.hexList){p.type='grass';p.owner=1;}
  {const p=h(-12,0);p.type='urban';p.cityId='home';gameData.cities.push({id:'home',name:'Home',q:-12,r:0,x:p.x,y:p.y,owner:1,hp:1000,maxHp:1000});}
  {const p=h(13,0);p.type='urban';p.cityId='far';p.owner=2;gameData.cities.push({id:'far',name:'Far',q:13,r:0,x:p.x,y:p.y,owner:2,hp:1000,maxHp:1000});}gameData._matchReadyForEndChecks=false;
  window.sim=s=>{for(let i=0;i<s*20;i++){wodBeginSimPfBudget(gameData.entities.length);update(.05);wodDrainAiMoveQueue();}};
  const p=h(-10,-6),u=createUnitAt('light',p.x,p.y,1,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;window.U=u;gameData.unitSpatialGrid=buildUnitSpatialGrid();
  window.W=[h(-2,-6),h(-2,4),h(8,4)];assignUnitMoveAlongWaypoints(u,W.map(w=>({x:w.x,y:w.y})));
  window.pts=()=>{wodEnsureOrderArrowFrozen(U);while(wodOrderArrowBuildQueue.length)wodProcessOrderArrowBuildJob(wodOrderArrowBuildQueue.shift());return getDisplayedUnitOrderPathPoints(U).map(p=>({x:Math.round(p.x),y:Math.round(p.y)}));};
  window.near=(p,w)=>Math.hypot(p.x-w.x,p.y-w.y)<(gameData.hexRadius||20)*1.6;
 });
 // deselected: the leg to the next waypoint only
 results.deselected=await page.evaluate(()=>{U.selected=false;gameData.selection=[];sim(3);const p=pts();return{n:p.length,start:Math.hypot(p[0].x-U.x,p[0].y-U.y)<2,endsAtFirst:near(p[p.length-1],W[0]),reachesLast:p.some(q=>near(q,W[2]))};});
 assert(results.deselected.start&&results.deselected.endsAtFirst&&!results.deselected.reachesLast,'deselected: current leg only '+JSON.stringify(results.deselected));
 // selected: the whole route
 results.selected=await page.evaluate(()=>{U.selected=true;gameData.selection=[U];const p=pts();return{n:p.length,start:Math.hypot(p[0].x-U.x,p[0].y-U.y)<2,endsAtLast:near(p[p.length-1],W[2])};});
 assert(results.selected.start&&results.selected.endsAtLast,'selected: whole route '+JSON.stringify(results.selected));
 // partway along the second leg, after the corner: nothing drawn behind the unit
 results.partway=await page.evaluate(()=>{sim(40);const p=pts();const leg2={x:W[1].x-W[0].x,y:W[1].y-W[0].y};
  // every drawn point lies at or ahead of the unit along its route: not back towards the first waypoint
  const back=p.slice(1).filter(q=>Math.hypot(q.x-W[0].x,q.y-W[0].y)<Math.hypot(U.x-W[0].x,U.y-W[0].y)-8&&Math.hypot(q.x-W[0].x,q.y-W[0].y)<Math.hypot(W[1].x-W[0].x,W[1].y-W[0].y));
  return{cursor:U.marchWpCursor||0,n:p.length,start:Math.hypot(p[0].x-U.x,p[0].y-U.y)<2,back:back.length,unit:{x:Math.round(U.x),y:Math.round(U.y)}};});
 assert(results.partway.cursor>=1&&results.partway.start&&results.partway.back===0,'partway: nothing behind '+JSON.stringify(results.partway));
 await page.evaluate(()=>{UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.style.display='block';gameData.camera={zoom:1,x:U.x-640,y:U.y-400};U._drawX=U.x;U._drawY=U.y;});
 for(const sel of [true,false]){await page.evaluate(sel=>{U.selected=sel;gameData.selection=sel?[U]:[];draw();},sel);await page.screenshot({path:path.join(OUT,sel?'selected.png':'deselected.png')});}
 assert.equal(errors.length,0,errors.join('\n'));
 console.log(JSON.stringify(results));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
