'use strict';
// AI land troops keep out of the water (wodAiEndSwimLeave and wodUnitAfloatForLeave, js/movement.js and js/world.js):
//  - one in a bay, sent to the far side of it, wades out at the nearest shore and walks round the bay (its route, searched
//    from the water with water allowed the whole way, swam it straight across);
//  - one sent to a point a cell or two off the shore stops on the shore (the point was taken as a swim);
//  - one standing on a bridge deck, sent to a bank off the bridge's line, walks off the deck and never wades (an order
//    given on a deck, a water cell, granted leave to swim, and the way off cut through the water beside the landing).
// A player's troops are unchanged: sent to a point in the water, they go in.
const H=require('./lib/harness');
const assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:90000});
 const out=await page.evaluate(()=>{setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();updateAiStrategy=()=>{};
  const h=(q,r=0)=>gameData.hexes[q+','+r];
  const world=(shape)=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(28);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;
   gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.selection=[];gameData.constructionJobs=[];gameData._aiEconomyClock=0;gameData._aiMoveQueue=new Map();
   for(const p of gameData.hexList){const water=shape(p);p.type=water?'water':'grass';p.owner=water?0:2;p.cityId=null;}
   gameData._wodPfVer=(gameData._wodPfVer||0)+1;gameData.landGeometryRevision=(gameData.landGeometryRevision||0)+1;wodMarkTerrainPoliticalDirty?.();};
  const unit=(q,r,owner=2)=>{const p=h(q,r),u=createUnitAt('light',p.x,p.y,owner,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
  const wet=u=>wodUnitInUnsuppliedWater(u,getNearestHexToPoint(u.x,u.y));
  // movement only (no generals giving the unit other orders)
  const march=(u,seconds,goal)=>{let wetFor=0,arrivedAt=null;for(let i=0;i<seconds*20;i++){gameData._aiEconomyClock+=.05;gameData.unitSpatialGrid=buildUnitSpatialGrid();wodBeginSimPfBudget(gameData.entities.length);
    moveUnitTowardTarget(u,.05);if(wet(u))wetFor+=.05;if(arrivedAt==null&&goal&&Math.hypot(u.x-goal.x,u.y-goal.y)<20)arrivedAt=i/20;}return{wetFor:Math.round(wetFor*10)/10,arrivedAt};};
  const o={};
  // a bay open to the north edge, seven cells across; land round its south end
  world(p=>Math.abs(p.q)<=3&&p.r<=1);{const u=unit(-3,-4),goal=h(6,-4);assignUnitMoveAlongWaypoints(u,[{x:goal.x,y:goal.y}]);o.bay=march(u,220,goal);}
  // a coast, sea east of q=0: sent to a point two cells out
  world(p=>p.q>=0);{const u=unit(-5,0),goal=h(1,0);assignUnitMoveAlongWaypoints(u,[{x:goal.x,y:goal.y}]);const into=!!u.orderTarget?.intoWater,m=march(u,40);o.offshore={into,...m,dry:!wet(u),q:getNearestHexToPoint(u.x,u.y).q};}
  // a river five cells wide with a bridge on r=0; the unit on the deck, sent up the far bank
  world(p=>Math.abs(p.x)<72);{placeBridgeAt(2,0,0,0,240,30,{editor:true,suppressNotes:true});const u=unit(0,0);u.x=-10;u.y=0;const goal=h(6,-6);
   assignUnitMoveAlongWaypoints(u,[{x:goal.x,y:goal.y}]);const leave=!!u._wodAiRescueWater||!!u._wodOrderIntoWater;o.deck={leave,...march(u,90,goal)};}
  // a player's troops sent into the sea go in
  world(p=>p.q>=0);{const u=unit(-3,0,1),goal=h(2,0);assignUnitMoveAlongWaypoints(u,[{x:goal.x,y:goal.y}]);const m=march(u,40,goal);o.player=m;}
  return o;});
 console.log(JSON.stringify(out));
 assert(out.bay.arrivedAt!=null&&out.bay.wetFor<=8,'an AI soldier in a bay wades out at the nearest shore and walks round: '+JSON.stringify(out.bay));
 assert(!out.offshore.into&&out.offshore.wetFor===0&&out.offshore.dry&&out.offshore.q<0,'an AI march to a point off the shore stops on the shore: '+JSON.stringify(out.offshore));
 assert(!out.deck.leave&&out.deck.wetFor===0&&out.deck.arrivedAt!=null,'an AI soldier sent off a bridge deck walks off it without wading: '+JSON.stringify(out.deck));
 assert(out.player.wetFor>5&&out.player.arrivedAt!=null,'a player sending troops into the sea still sends them in: '+JSON.stringify(out.player));
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
