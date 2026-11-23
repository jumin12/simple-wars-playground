'use strict';
// Supply through a checkerboard corner (wodSupplyCornerOpen): the map is split in four quarters round the centre; the
// player holds the north-west and south-east quarters, the enemy the other two, so each side's two quarters meet only at
// one corner. The map draws one of the two diagonals joined and rounds the other off (wodCornerPinchedOwner); supply
// follows the picture. Two cells of the player's beside the enemy's corner cells make the player's diagonal the one
// drawn joined: the player's troops in the far quarter are supplied (both sides were cut there, so two whole regions
// starved over one corner), the enemy's in its far quarter are cut off. With those two cells given to the enemy instead,
// the picture and the supply both go the other way.
const H=require('./lib/harness');
const assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:120000});
 const res=await page.evaluate(()=>{setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();updateAiStrategy=()=>{};
  const h=(q,r)=>gameData.hexes[q+','+r];
  const run=favour=>{
   wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(24);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;
   gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.alliances=[];gameData.encircledHexes=new Set();gameData._encircWork=null;gameData._frontSupplyMemo=null;
   gameData.aiMoneyByOwner={2:0};gameData.aiManpowerByOwner={2:0};
   for(const p of gameData.hexList){p.type='grass';p.cityId=null;p.owner=(p.q<=0)===(p.r<=0)?1:2;}
   // the two cells beside the enemy's corner cells decide which diagonal is drawn joined
   for(const [q,r] of [[2,0],[0,2]])h(q,r).owner=favour;
   for(const [id,q,r,o] of [['nw',-10,-10,1],['ne',10,-10,2]]){const p=h(q,r);p.type='urban';p.cityId=id;p.owner=o;gameData.cities.push({id,name:id,q,r,x:p.x,y:p.y,owner:o,hp:1000,maxHp:1000});}
   gameData._supplyTopologyVersion=(gameData._supplyTopologyVersion||0)+1;gameData._citySupplyCache=null;gameData._wodPfVer=(gameData._wodPfVer||0)+1;
   const unit=(q,r,o)=>{const p=h(q,r),u=createUnitAt('light',p.x,p.y,o,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
   const mine=unit(10,10,1),theirs=unit(-10,10,2);
   gameData.unitSpatialGrid=buildUnitSpatialGrid();wodRebuildHexCombatOccupancy();
   const cut=u=>!!wodGetUnitEncirclementState(u,getNearestHexToPoint(u.x,u.y));
   return{drawnPinched:wodCornerPinchedOwner([h(0,0),h(1,0),h(0,1),h(1,1)],gameData.hexes),mineCut:cut(mine),theirsCut:cut(theirs),
    mineTown:wodCurrentSupplyComponent(h(10,10),1).city,theirsTown:wodCurrentSupplyComponent(h(-10,10),2).city};
  };
  const out={player:run(1),enemy:run(2)};
  // a change of hands three cells off that turns the picture is seen by the supply cache of both sides
  {const base=run(1);const before=wodCurrentSupplyComponent(h(10,10),1).city;
   for(const [q,r] of [[2,0],[0,2]])setHexOwner(h(q,r),2);
   out.flipped={before,drawnPinched:wodCornerPinchedOwner([h(0,0),h(1,0),h(0,1),h(1,1)],gameData.hexes),mineTown:wodCurrentSupplyComponent(h(10,10),1).city,theirsTown:wodCurrentSupplyComponent(h(-10,10),2).city,base};}
  return out;});
 console.log(JSON.stringify(res));
 const p=res.player,e=res.enemy;
 assert.equal(p.drawnPinched,2,'the map rounds off the enemy diagonal when the player has the cells beside it: '+JSON.stringify(p));
 assert(!p.mineCut&&p.mineTown,'the player\'s troops in the far quarter, drawn joined to their town over the corner, are supplied: '+JSON.stringify(p));
 assert(p.theirsCut&&!p.theirsTown,'the enemy\'s troops beyond the rounded-off corner are cut off: '+JSON.stringify(p));
 assert.equal(e.drawnPinched,1,'with those cells the enemy\'s, the player\'s diagonal is rounded off: '+JSON.stringify(e));
 assert(e.mineCut&&!e.theirsCut,'and supply goes the other way: '+JSON.stringify(e));
 assert(res.flipped.before&&!res.flipped.mineTown&&res.flipped.theirsTown&&res.flipped.drawnPinched===1,'a change of hands beside the corner turns supply with the picture (the cached networks of both sides are dropped): '+JSON.stringify(res.flipped));
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('checkerboard corners: the side the map draws joined keeps its supply, the other is cut');
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
