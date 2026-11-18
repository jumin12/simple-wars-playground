'use strict';
// Supply at the front: troops pushed into enemy land stay supplied while a way back to their supplied lines passes no
// ground the enemy's troops hold; encircled troops are cut off. Our land is q<=-6 with a town; the enemy's beyond.
//  pushed  - an infantry six cells into enemy land, no enemy troops about: supplied (it used to be cut off beyond two cells).
//  gap     - an enemy line from edge to edge with one gap, one of ours standing in the gap and another three cells beyond
//            the line: supplied (our man in the gap holds the road open); with nobody in the gap: cut off.
//  ring    - enemy troops all round ours, three cells out: cut off.
//  deep    - thirty cells into enemy land with nothing about: cut off (beyond the 24 cells supply reaches).
//  pocket  - a three-by-three patch of our land in enemy land: marked encircled on the map only with an enemy ring round it.
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
  world();let u=unit(0,0,1);settle();out.pushed={cut:cut(u),own:h(0,0).owner};
  const line=(gapQ,keepGap)=>{world();for(let r=-29;r<=29;r+=2)unit(-3,r,2);const tip=unit(0,0,1);if(keepGap)unit(-3,0,1);settle();return cut(tip);};
  out.gapHeld=line(-3,true);out.gapOpen=line(-3,false);
  world();u=unit(0,0,1);for(const p of gameData.hexList)if(Math.max(Math.abs(p.q),Math.abs(p.r))===3&&(p.q+p.r)%2===0)unit(p.q,p.r,2);settle();out.ring=cut(u);
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
 assert(!res.pushed.cut,'six cells into enemy land with no enemy troops about: supplied');
 assert(!res.gapHeld,'with one of ours holding the gap in the enemy line, the man beyond it is supplied');
 assert(res.gapOpen,'with nobody in the gap, the enemy line cuts him off');
 assert(res.ring,'an enemy ring round a unit cuts it off');
 assert(res.deep,'thirty cells into enemy land is beyond supply');
 assert(!res.pocketBare.marked&&!res.pocketBare.cut,'a patch of our land in bare enemy land is not a pocket: '+JSON.stringify(res.pocketBare));
 assert(res.pocketRinged.marked&&res.pocketRinged.cut,'with enemy troops round it, it is an encircled pocket: '+JSON.stringify(res.pocketRinged));
 assert(!res.marineCorner&&res.infantryCorner,'inside a ring on a beach that meets the sea only at a corner, a marine is supplied from the sea and infantry is not: '+JSON.stringify([res.marineCorner,res.infantryCorner]));
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
