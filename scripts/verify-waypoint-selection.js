'use strict';
// Shift-click waypoints belong to the units they were given to. Unit A gets two waypoints; then unit B, already marching
// somewhere of its own, is selected and given one waypoint: B must march to its own order and then that waypoint, not along
// A's waypoints (it used to take A's queue, so its new waypoint "snapped" onto A's route). A keeps its route; a second
// waypoint for B extends B's route; A selected again extends A's own route; a group of A and B starts from their own marches.
const H=require('./lib/harness');
const assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:90000});
 const out=await page.evaluate(()=>{
  setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
  const h=(q,r=0)=>gameData.hexes[q+','+r];
  const town=(q,r,owner,id)=>{const p=h(q,r);p.type='urban';p.cityId=id;p.owner=owner;gameData.cities.push({id,name:id,q,r,x:p.x,y:p.y,owner,hp:1000,maxHp:1000});};
  const unit=(q,r)=>{const p=h(q,r),u=createUnitAt('light',p.x,p.y,1,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
  wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(28);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;
  gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;gameData.entities=[];gameData.nextUnitId=1;gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];
  gameData.selection=[];gameData.constructionJobs=[];gameData.alliances=[];gameData.money=gameData.manpower=100000;
  for(const p of gameData.hexList){p.type='grass';p.owner=p.q<=8?1:2;p.cityId=null;}town(-20,0,1,'Home');town(20,0,2,'Enemy');
  const a=unit(-6,-6),b=unit(-6,6);gameData.unitSpatialGrid=buildUnitSpatialGrid();
  const select=list=>{gameData.selection=list;for(const u of gameData.entities)u.selected=list.includes(u);};
  const route=u=>(u.fullMarchWaypoints||[]).slice(Math.max(0,u.marchWpCursor||0)).map(p=>getNearestHexToPoint(p.x,p.y)).map(p=>p.q+','+p.r);
  const near=(u,q,r)=>route(u).some(k=>{const [x,y]=k.split(',').map(Number);return Math.max(Math.abs(x-q),Math.abs(y-r))<=1;});
  const res={};
  select([a]);wodCommitShiftWaypointAt(h(0,-10));wodCommitShiftWaypointAt(h(4,-12));res.a=route(a);
  select([b]);issueMoveOrder(h(-2,8));res.bMoving=!!(b.target||b.orderTarget);wodCommitShiftWaypointAt(h(2,10));res.b=route(b);
  res.bTookA=near(b,0,-10)||near(b,4,-12);res.bOwn=near(b,-2,8)&&near(b,2,10);res.aKept=near(a,0,-10)&&near(a,4,-12);
  wodCommitShiftWaypointAt(h(5,6));res.b2=route(b);res.bExtended=near(b,2,10)&&near(b,5,6)&&!near(b,0,-10);
  select([a]);wodCommitShiftWaypointAt(h(6,-6));res.a2=route(a);res.aExtended=near(a,4,-12)&&near(a,6,-6)&&!near(a,2,10);
  select([a,b]);wodCommitShiftWaypointAt(h(7,0));res.groupA=route(a);res.groupB=route(b);
  res.groupOwn=near(a,7,0)&&near(b,7,0)&&!near(a,5,6)&&!near(b,6,-6);
  return res;});
 console.log(JSON.stringify(out));
 assert(out.bMoving,'B is marching before its waypoint');
 assert(!out.bTookA,'B does not take the waypoints given to A: '+JSON.stringify(out));
 assert(out.bOwn,'B marches to its own order, then its waypoint: '+JSON.stringify(out.b));
 assert(out.aKept,'A keeps its route: '+JSON.stringify(out.a));
 assert(out.bExtended,'a second waypoint for B extends B\'s own route: '+JSON.stringify(out.b2));
 assert(out.aExtended,'A selected again extends its own route: '+JSON.stringify(out.a2));
 assert(out.groupOwn,'a group of both starts from their own marches: '+JSON.stringify({a:out.groupA,b:out.groupB}));
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
