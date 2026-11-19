'use strict';
// Bridges may share their ends (wodBridgeDecksConflict, js/mapgen.js). Over a three-cell river with one bridge built:
//  - another bridge from the same landing at 37 or 45 degrees, or meeting it at its far landing, is allowed, and
//    infantry walks over each of the two dry;
//  - the same span, a deck beside it (one or two rows off), a deck crossing it over the water, or one fanning out at
//    under 35 degrees (lying on top of it) is refused; three rows off is fine;
//  - two bridges end to end across an island in a strait are allowed and walked dry;
//  - a bridge under construction is judged the same way (a fan beside it is allowed, its own span is not);
//  - a town on the bank is named as what is in the way, even with another bridge near (it used to say "Another bridge
//    is in the way").
const H=require('./lib/harness');
const assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:90000});
 const out=await page.evaluate(()=>{setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
  const h=(q,r)=>gameData.hexes[q+','+r];
  const world=(water=p=>Math.abs(p.q)<=1)=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(24);gameState='PLAYING';gameData.mp={enabled:false};gameData.menuAttractMode=false;
   gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.money=1e6;gameData._aiEconomyClock=0;
   for(const p of gameData.hexList){p.type=water(p)?'water':'grass';p.owner=1;p.cityId=null;}gameData._wodPfVer=(gameData._wodPfVer||0)+1;wodRebuildBridgeHexIndex();};
  const town=(q,r)=>{const p=h(q,r);p.type='urban';p.cityId='T';gameData.cities.push({id:'T',name:'T',q,r,x:p.x,y:p.y,owner:1,hp:1000,maxHp:1000});};
  const plan=(aq,ar,bq,br)=>wodBridgeSpanPlan(aq,ar,bq,br,1,{skipCost:true}).error||'ok';
  const build=(aq,ar,bq,br)=>placeBridgeSpan(1,aq,ar,bq,br,{editor:true,suppressNotes:true});
  const walk=(from,to)=>{const p=h(...from),goal=h(...to),u=createUnitAt('light',p.x,p.y,1,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;
   gameData.unitSpatialGrid=buildUnitSpatialGrid();assignUnitMoveAlongWaypoints(u,[goal]);let wet=0;
   for(let i=0;i<1600;i++){gameData._aiEconomyClock+=.05;gameData.unitSpatialGrid=buildUnitSpatialGrid();wodBeginSimPfBudget(4);moveUnitTowardTarget(u,.05);if(wodUnitInUnsuppliedWater(u,getNearestHexToPoint(u.x,u.y)))wet++;}
   const res={arrived:Math.hypot(u.x-goal.x,u.y-goal.y)<20,wet};gameData.entities=gameData.entities.filter(e=>e!==u);return res;};
  const o={};
  world();o.first=build(-2,0,2,0);
  o.refused={sameSpan:plan(-2,0,2,0),beside1:plan(-2,1,2,1),beside2:plan(-2,2,2,2),cross:plan(-2,-2,2,2),fan27:plan(-2,0,2,2)};
  o.allowed={beside3:plan(-2,3,2,3),fan45:plan(-2,0,2,4),fan37:plan(-2,0,2,-3),farLanding:plan(-2,4,2,0)};
  o.fanBuilt=build(-2,0,2,4);o.walkA=walk([-5,0],[5,0]);o.walkB=walk([-5,0],[5,5]);
  world();town(2,0);build(-2,2,2,2);o.townOnBank=plan(-2,0,2,0);
  world(p=>Math.abs(p.q)<=4&&p.q!==0);o.chainA=build(-5,0,0,0);o.chainB=plan(0,0,5,0);o.chainBuilt=build(0,0,5,0);o.walkChain=walk([-8,0],[8,0]);
  world();o.job=placeBridgeSpan(1,-2,0,2,0,{suppressNotes:true});o.jobFan=plan(-2,0,2,4);o.jobSame=plan(-2,0,2,0);
  return o;});
 console.log(JSON.stringify(out));
 assert(out.first&&out.fanBuilt&&out.chainA&&out.chainBuilt&&out.job,'the bridges are built');
 for(const [k,v] of Object.entries(out.refused))assert.equal(v,'Another bridge is in the way.',k+' is refused');
 for(const [k,v] of Object.entries(out.allowed))assert.equal(v,'ok',k+' is allowed');
 assert.equal(out.chainB,'ok','end to end across an island');
 for(const k of ['walkA','walkB','walkChain'])assert(out[k].arrived&&out[k].wet===0,k+': walked over dry '+JSON.stringify(out[k]));
 assert(/town streets/.test(out.townOnBank),'a town on the bank is named: '+out.townOnBank);
 assert.equal(out.jobFan,'ok','a fan beside a bridge under construction');
 assert(/under construction/.test(out.jobSame),'not its own span: '+out.jobSame);
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
