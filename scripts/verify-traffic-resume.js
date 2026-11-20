'use strict';
// Units that step aside for others carry on with their own orders afterwards (wodResumeTrafficYield, js/movement.js):
//  - head-on in open ground: two of ours marching at each other both arrive where they were sent;
//  - a column of four marching through an idle unit of ours: the column arrives, the idle unit is back where it stood;
//  - a unit with two waypoints meeting an idle comrade on its road: it reaches its last waypoint;
//  - a unit with an attack order, or walking to board a transport, keeps it when its sidestep ends (taking up the march
//    again counted as a new order and dropped both);
//  - head-on on a strip of land two cells wide between water: both arrive, neither in the water.
const H=require('./lib/harness');
const assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:90000});
 const out=await page.evaluate(()=>{setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();updateAiStrategy=()=>{};
  const h=(q,r=0)=>gameData.hexes[q+','+r];
  const world=(strip)=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(26);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData.fogOfWar=false;
   gameData.entities=[];gameData.cities=[];gameData.selection=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData._aiEconomyClock=0;
   for(const p of gameData.hexList){const water=strip&&Math.abs(p.r)>=1&&p.r!==-1;p.type=water?'water':'grass';p.owner=water?0:1;p.cityId=null;}
   const t=h(-16,strip?0:0);t.type='urban';t.cityId='home';gameData.cities.push({id:'home',name:'home',q:-16,r:0,x:t.x,y:t.y,owner:1,hp:1000,maxHp:1000});
   gameData._wodPfVer=(gameData._wodPfVer||0)+1;gameData.aiMoneyByOwner={2:0};gameData.aiManpowerByOwner={2:0};};
  const unit=(q,r,type='light')=>{const p=h(q,r),u=createUnitAt(type,p.x,p.y,1,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
  const sim=s=>{for(let i=0;i<s*20;i++){gameData._aiEconomyClock+=.05;gameData.unitSpatialGrid=buildUnitSpatialGrid();wodRebuildHexCombatOccupancy();wodBeginSimPfBudget(gameData.entities.length);update(.05);}};
  const sp=(gameData.hexRadius||20)*1.35,at=(u,p)=>Math.hypot(u.x-p.x,u.y-p.y)<sp*.8;
  const o={};
  world(false);{const a=unit(-8,0),b=unit(8,0),ga=h(8,0),gb=h(-8,0);assignUnitMoveAlongWaypoints(a,[ga]);assignUnitMoveAlongWaypoints(b,[gb]);sim(100);o.headOn={a:at(a,ga),b:at(b,gb)};}
  world(false);{const idle=unit(0,0),home=h(0,0),col=[0,1,2,3].map(i=>unit(-8-i,0)),goals=[0,1,2,3].map(i=>h(8+i,0));col.forEach((u,i)=>assignUnitMoveAlongWaypoints(u,[goals[i]]));sim(140);
   o.column={arrived:col.filter((u,i)=>at(u,goals[i])).length,idleBack:at(idle,home)};}
  world(false);{const idle=unit(0,0),u=unit(-8,0),w1=h(4,0),w2=h(6,6);assignUnitMoveAlongWaypoints(u,[w1,w2]);sim(110);o.waypoints={arrived:at(u,w2),idleBack:at(idle,h(0,0))};}
  // an attack order on an enemy far down the road, an idle comrade standing on it
  // taking up the march after a sidestep is not a new order: a unit with an attack order, or walking to board a
  // transport, keeps it when its sidestep ends (the comrade it made way for has gone by)
  world(false);{const p=h(10,0),foe=createUnitAt('light',p.x,p.y,2,{startSpawn:true});foe.x=foe._drawX=p.x;foe.y=foe._drawY=p.y;foe.holding=true;foe.damage=0;
   const u=unit(-6,0);gameData.unitSpatialGrid=buildUnitSpatialGrid();wodSetPreferredTarget(1,[u.uid],foe.uid);const before=!!u._wodAttackOrder;
   u._trafficYield={points:[{x:h(4,0).x,y:h(4,0).y}],idle:false,internal:false,owner:1,leader:'gone',x:u.x,y:u.y+30,ax:1,ay:0,until:(gameData._aiEconomyClock||0)+25};
   wodResumeTrafficYield(u);o.attack={before,kept:!!u._wodAttackOrder,moving:!!u.target};}
  world(true);{const sea=h(0,3),boat=createUnitAt('transport',sea.x,sea.y,1,{startSpawn:true});boat.x=sea.x;boat.y=sea.y;const u=unit(-4,0);
   u.boardTransportUid=ensureUnitId(boat);boat.pickupUid=ensureUnitId(u);
   u._trafficYield={points:[{x:h(-1,0).x,y:h(-1,0).y}],idle:false,internal:false,owner:1,leader:'gone',x:u.x,y:u.y,ax:1,ay:0,until:(gameData._aiEconomyClock||0)+25};
   wodResumeTrafficYield(u);o.boarding={kept:u.boardTransportUid===boat.uid&&boat.pickupUid===u.uid};}
  world(true);{const a=unit(-8,0),b=unit(8,-1),ga=h(8,0),gb=h(-8,-1);assignUnitMoveAlongWaypoints(a,[ga]);assignUnitMoveAlongWaypoints(b,[gb]);let wet=0;
   for(let i=0;i<100*20;i++){sim(.05);for(const u of [a,b])if(wodUnitInUnsuppliedWater(u,getNearestHexToPoint(u.x,u.y)))wet++;}o.strip={a:at(a,ga),b:at(b,gb),wet};}
  return o;});
 console.log(JSON.stringify(out));
 assert(out.headOn.a&&out.headOn.b,'head-on in open ground both arrive: '+JSON.stringify(out.headOn));
 assert(out.column.arrived===4&&out.column.idleBack,'a column passes an idle comrade and he returns: '+JSON.stringify(out.column));
 assert(out.waypoints.arrived&&out.waypoints.idleBack,'a unit with waypoints carries on to its last one: '+JSON.stringify(out.waypoints));
 assert(out.attack.before&&out.attack.kept&&out.attack.moving,'a unit with an attack order keeps it when its sidestep ends: '+JSON.stringify(out.attack));
 assert(out.boarding.kept,'a unit walking to its boat keeps its boarding when its sidestep ends: '+JSON.stringify(out.boarding));
 assert(out.strip.a&&out.strip.b&&out.strip.wet===0,'head-on on a narrow strip both arrive and stay dry: '+JSON.stringify(out.strip));
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
