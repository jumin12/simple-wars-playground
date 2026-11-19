'use strict';
// Supply at the front (wodFrontlineSupplyTouch): a unit is in touch with its lines while supplied friendly land lies on the
// next cell, which the enemy's troops do not hold; troops that advance claim the ground they cross. Our land is q<=-6
// with a town; the enemy's beyond.
//  front   - one cell out from our land, nobody about: supplied; from a cell two out (before it claims the cell between,
//            as a unit does with nobody about) our land is out of touch.
//  blocked - one cell out with enemy troops standing on our land beside it: cut off.
//  march   - an infantry marched six cells into enemy land: supplied (the ground it crossed is ours).
//  beyond  - the same six cells in without that road (set down there): cut off. For a while supply reached 8 and then 24
//            cells over any ground no enemy stood on, so units near the front never starved however they were cut off.
//  pushed  - marched three cells into enemy land past enemy troops standing two cells off its road: supplied.
//  justIn  - one cell inside enemy land next to our own, with an enemy ring two cells out, or enemy troops on every tile
//            round it: cut off (their tiles turn theirs, and our tiles inside the ring are a pocket).
//  ring    - enemy troops all round ours, three cells out: cut off.
//  raid    - twelve cells into enemy land with nothing about: cut off; deep: thirty cells: cut off.
//  pocket  - a three-by-three patch of our land four cells from our lines in enemy land is an encircled pocket, with or
//            without enemy troops round it.
//  corner  - inside an enemy ring on a cell that touches the sea only at a corner: a marine is supplied, infantry is not.
const H=require('./lib/harness');
const assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:60000});
 const res=await page.evaluate(()=>{setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();updateAiStrategy=()=>{};
  const h=(q,r=0)=>gameData.hexes[q+','+r];
  const world=(ownEdge=-6)=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(30);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;
   gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.alliances=[];gameData.encircledHexes=new Set();gameData._encircWork=null;gameData._frontSupplyMemo=null;
   gameData.aiMoneyByOwner={2:0};gameData.aiManpowerByOwner={2:0};
   for(const p of gameData.hexList){p.type='grass';p.cityId=null;p.owner=p.q<=ownEdge?1:2;}
   for(const [id,q,o] of [['ours',ownEdge-5,1],['theirs',22,2]]){const p=h(q);p.type='urban';p.cityId=id;gameData.cities.push({id,name:id,q,r:0,x:p.x,y:p.y,owner:o,hp:1000,maxHp:1000});}
   gameData._supplyTopologyVersion=(gameData._supplyTopologyVersion||0)+1;gameData._citySupplyCache=null;gameData._wodPfVer=(gameData._wodPfVer||0)+1;};
  const unit=(q,r,o)=>{const p=h(q,r),u=createUnitAt('light',p.x,p.y,o,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
  const settle=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();wodRebuildHexCombatOccupancy();for(const u of gameData.entities)claimTerritoryAroundUnit(u);wodApplyTerritoryClaimBatch();gameData._frontSupplyMemo=null;gameData._citySupplyCache=null;};
  const cut=u=>!!wodGetUnitEncirclementState(u,getNearestHexToPoint(u.x,u.y));
  const out={};
  world();let u=unit(-5,0,1);settle();out.front=cut(u);
  world();out.touch1=wodFrontlineSupplyTouch(h(-5,0),1);out.touch2=wodFrontlineSupplyTouch(h(-4,0),1);
  world();u=unit(-5,0,1);for(let r=-29;r<=29;r++)unit(-6,r,2);settle();out.blocked=cut(u);
  world();u=unit(-8,0,1);settle();assignUnitMoveAlongWaypoints(u,[h(0,0)]);
  for(let i=0;i<60*20&&Math.hypot(u.x-h(0,0).x,u.y-h(0,0).y)>4;i++){gameData._aiEconomyClock+=.05;settle();wodBeginSimPfBudget(4);moveUnitTowardTarget(u,.05);}
  settle();out.march={cut:cut(u),arrived:Math.hypot(u.x-h(0,0).x,u.y-h(0,0).y)<6,road:[-5,-4,-3,-2,-1].every(q=>h(q,0).owner===1)};
  world();u=unit(0,0,1);settle();out.beyond=cut(u);
  // pushed in under fire: marched three cells into enemy land with enemy troops two cells off its road
  world();for(const r of [-2,2])for(const q of [-4,-3,-2]){const e=unit(q,r,2);e.damage=0;e.holding=true;}u=unit(-8,0,1);settle();assignUnitMoveAlongWaypoints(u,[h(-3,0)]);
  for(let i=0;i<40*20&&Math.hypot(u.x-h(-3,0).x,u.y-h(-3,0).y)>4;i++){gameData._aiEconomyClock+=.05;settle();wodBeginSimPfBudget(8);moveUnitTowardTarget(u,.05);}
  for(let i=0;i<3;i++)settle();out.pushedFight={cut:cut(u),at:getHexKey(getNearestHexToPoint(u.x,u.y))};
  // just inside enemy land, encircled: an enemy ring two cells out, and enemy troops on every tile round it
  const encircle=adjacent=>{world();u=unit(-5,0,1);for(const p of gameData.hexList){const d=Math.max(Math.abs(p.q+5),Math.abs(p.r));if(d===(adjacent?1:2)){const e=unit(p.q,p.r,2);e.damage=0;e.holding=true;}}
   for(let i=0;i<4;i++){gameData._aiEconomyClock+=.5;settle();}return cut(u);};
  out.justInRinged=encircle(false);out.justInSurrounded=encircle(true);
  world();u=unit(0,0,1);for(const p of gameData.hexList)if(Math.max(Math.abs(p.q),Math.abs(p.r))===3&&(p.q+p.r)%2===0)unit(p.q,p.r,2);settle();out.ring=cut(u);
  world(-12);u=unit(0,0,1);settle();out.raid=cut(u);
  world(-20);u=unit(10,0,1);settle();out.deep=cut(u);
  const pocket=ringed=>{world();for(const p of gameData.hexList)if(Math.abs(p.q)<=1&&Math.abs(p.r)<=1)p.owner=1;
   if(ringed)for(const p of gameData.hexList)if(Math.max(Math.abs(p.q),Math.abs(p.r))===3&&(p.q+p.r)%2===0)unit(p.q,p.r,2);
   const v=unit(0,0,1);settle();gameData._supplyTopologyVersion++;gameData.encirclementTimer=10;updateEncirclements(.1);for(let i=0;i<4000&&gameData._encircWork;i++)wodEncirclementProcessChunk();
   return{marked:gameData.encircledHexes.has('0,0'),cut:cut(v)};};
  out.pocketBare=pocket(false);out.pocketRinged=pocket(true);
  // inside an enemy ring, on a cell that meets the sea only at a corner (water at 1,1)
  const corner=type=>{world();const w=h(1,1);w.type='water';w.owner=0;gameData._wodPfVer++;
   for(const p of gameData.hexList)if(Math.max(Math.abs(p.q),Math.abs(p.r))===3&&(p.q+p.r)%2===0)unit(p.q,p.r,2);
   const p=h(0,0),v=createUnitAt(type,p.x,p.y,1,{startSpawn:true});v.x=p.x;v.y=p.y;v.isGeneral=false;settle();return cut(v);};
  out.marineCorner=corner('marine');out.infantryCorner=corner('light');
  return out;});
 console.log(JSON.stringify(res));
 assert(!res.front,'one cell out from our land, nobody about: supplied');
 assert(res.touch1&&!res.touch2,'our supplied land reaches one cell out, not two: '+JSON.stringify([res.touch1,res.touch2]));
 assert(res.blocked,'one cell out with enemy troops on our land beside it: cut off');
 assert(res.march.arrived&&res.march.road&&!res.march.cut,'marched six cells into enemy land, it keeps the road it took and is supplied: '+JSON.stringify(res.march));
 assert(res.beyond,'set down six cells in with no road: cut off');
 assert(!res.pushedFight.cut,'pushed three cells into enemy land past enemy troops, keeping its road: supplied: '+JSON.stringify(res.pushedFight));
 assert(res.justInRinged,'just inside enemy land, an enemy ring round it: cut off');
 assert(res.justInSurrounded,'just inside enemy land, enemy troops on every tile round it: cut off');
 assert(res.ring,'an enemy ring round a unit cuts it off');
 assert(res.raid,'twelve cells into enemy land with nobody about is beyond supply');
 assert(res.deep,'thirty cells into enemy land is beyond supply');
 assert(res.pocketBare.marked&&res.pocketBare.cut,'a patch of our land cut off by enemy land is an encircled pocket: '+JSON.stringify(res.pocketBare));
 assert(res.pocketRinged.marked&&res.pocketRinged.cut,'with enemy troops round it, it is an encircled pocket: '+JSON.stringify(res.pocketRinged));
 assert(!res.marineCorner&&res.infantryCorner,'inside a ring on a beach that meets the sea only at a corner, a marine is supplied from the sea and infantry is not: '+JSON.stringify([res.marineCorner,res.infantryCorner]));
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
