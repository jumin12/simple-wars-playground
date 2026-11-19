'use strict';
// Ships stay on the water (wodBodiesMeet, js/movement.js; wodRebuildHexCombatOccupancy):
//  - cards: a warship's card is the size of a tank's (radius 16, it was 20, a card a quarter larger); a warship saved at
//    20 is brought to 16 on load;
//  - an enemy warship moored at the beach does not hold the land beside it: the shore cells are not held against our
//    supply and our troops may claim them;
//  - it does not block or push troops on land: infantry walks along the beach past it in a straight line, and an order
//    to the beach cell beside it is carried out to the cell (the old code stopped the walker against the ship's body);
//  - a unit in the water still meets a ship: overlapping, they are pushed apart.
const H=require('./lib/harness');
const assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:90000});
 const out=await page.evaluate(()=>{setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
  const h=(q,r)=>gameData.hexes[q+','+r];
  const world=()=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(24);gameState='PLAYING';gameData.mp={enabled:false};gameData.menuAttractMode=false;gameData.fogOfWar=false;
   gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData._aiEconomyClock=0;gameData._frontSupplyMemo=null;
   for(const p of gameData.hexList){p.type=p.q>=2?'water':'grass';p.owner=p.q>=2?0:1;p.cityId=null;}
   const t=h(-12,0);t.type='urban';t.cityId='Home';gameData.cities.push({id:'Home',name:'Home',q:-12,r:0,x:t.x,y:t.y,owner:1,hp:1000,maxHp:1000});
   gameData._wodPfVer=(gameData._wodPfVer||0)+1;wodRebuildBridgeHexIndex();};
  const unit=(type,q,r,owner)=>{const p=h(q,r),u=createUnitAt(type,p.x,p.y,owner,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;u.damage=0;return u;};
  const settle=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();wodRebuildHexCombatOccupancy();gameData._frontSupplyMemo=null;};
  const march=(u,goal,s)=>{assignUnitMoveAlongWaypoints(u,[goal]);let off=0;const y0=u.y;for(let i=0;i<s*20;i++){gameData._aiEconomyClock+=.05;settle();wodBeginSimPfBudget(4);for(const e of gameData.entities)moveUnitTowardTarget(e,.05);wodRunUnitSeparationSync(4,96);off=Math.max(off,Math.abs(u.x-goal.x));}return off;};
  const o={};
  world();const ship=unit('ship',2,0,2),tank=unit('heavy',-4,0,1);
  const sprite=u=>wodEnsureUnitBodySprite(u,u.radius,'#c0392b');
  o.cards={ship:ship.radius,tank:tank.radius,shipW:sprite(ship).dw,tankW:sprite(tank).dw};
  const old={type:'ship',hp:300,maxHp:300,radius:20};wodNormalizeNavalStats(old);o.oldSave=old.radius;
  settle();o.shoreHeld=wodSupplyCellHeldByEnemy(h(1,0),1);o.shoreContested=wodHexNearActiveEnemyCombat(h(1,0),1);
  // walk along the beach (q=1) past the ship moored at (2,0): a straight line, not pushed inland
  world();const s2=unit('ship',2,0,2);s2.holding=true;const walker=unit('light',1,-7,1);settle();
  const goal=h(1,7);o.walkOff=Math.round(march(walker,goal,90));o.walkArrived=Math.hypot(walker.x-goal.x,walker.y-goal.y)<6;
  // an order to the beach cell beside the ship
  world();const s3=unit('ship',2,0,2);s3.holding=true;const stand=unit('light',-3,0,1);settle();const beach=h(1,0);march(stand,beach,30);
  o.beach=Math.round(Math.hypot(stand.x-beach.x,stand.y-beach.y));o.beachGap=Math.round(Math.hypot(stand.x-s3.x,stand.y-s3.y));
  // a unit in the water overlapping a ship is pushed off it
  world();const s4=unit('ship',4,0,2),swim=unit('light',4,0,1);swim.x+=3;settle();wodRunUnitSeparationSync(4,96);
  o.swimGap=Math.round(Math.hypot(swim.x-s4.x,swim.y-s4.y));o.swimMin=s4.radius+swim.radius;
  return o;});
 console.log(JSON.stringify(out));
 assert.equal(out.cards.ship,out.cards.tank,'a warship is the size of a tank');
 assert.equal(out.cards.shipW,out.cards.tankW,'their cards are drawn the same size');
 assert.equal(out.oldSave,16,'a warship saved at radius 20 loads at 16');
 assert(!out.shoreHeld&&!out.shoreContested,'the shore beside an enemy warship is neither held against our supply nor contested: '+JSON.stringify(out));
 assert(out.walkArrived&&out.walkOff<=4,'infantry walks the beach past a moored warship in a straight line: '+JSON.stringify(out));
 assert(out.beach<=4,'an order to the beach cell beside a warship is carried out: '+JSON.stringify(out));
 assert(out.swimGap>=out.swimMin,'a unit in the water is still pushed off a ship: '+JSON.stringify(out));
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
