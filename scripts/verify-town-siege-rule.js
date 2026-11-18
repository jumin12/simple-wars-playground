'use strict';
// A town stops recruiting and building only when the enemy has taken one of its cells, stands on one, or is fighting our
// troops standing in it. A town three cells long (q 0..2) with our infantry beside it:
//  near     - an enemy infantry two cells east of the town, nobody fighting: the town works (it used to stop).
//  fightOut - our infantry two cells east of the town fighting an enemy one beyond it: the town works.
//  onTile   - an enemy standing on a town cell: stopped.
//  taken    - a town cell turned enemy: stopped.
//  fightIn  - our infantry on a town cell exchanging fire with an enemy outside: stopped while they fight.
const H=require('./lib/harness');
const assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:60000});
 const res=await page.evaluate(()=>{setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();updateAiStrategy=()=>{};
  const h=(q,r=0)=>gameData.hexes[q+','+r];let town;
  const world=()=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(24);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;
   gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.alliances=[];gameData._cityCombatStagingKeys=new Set();gameData.cityCombatBlockForProd=new Set();gameData.encircledHexes=new Set();
   gameData.money=1e6;gameData.manpower=1e6;gameData.aiMoneyByOwner={2:1e6};gameData.aiManpowerByOwner={2:1e6};
   for(const p of gameData.hexList){p.type='grass';p.cityId=null;p.owner=p.q<=9?1:2;}
   town={id:'town',name:'Town',owner:1,q:0,r:0,x:h(0).x,y:h(0).y,hp:1000,maxHp:1000,hasFactory:true};for(let q=0;q<=2;q++){const p=h(q);p.type='urban';p.cityId='town';}gameData.cities.push(town);
   const e=h(20);e.type='urban';e.cityId='theirs';gameData.cities.push({id:'theirs',name:'Theirs',owner:2,q:20,r:0,x:e.x,y:e.y,hp:1000,maxHp:1000});
   gameData._supplyTopologyVersion=(gameData._supplyTopologyVersion||0)+1;gameData._citySupplyCache=null;delete town._urbanHexCache;};
  const unit=(q,r,o)=>{const p=h(q,r),u=createUnitAt('light',p.x,p.y,o,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;u.holding=true;return u;};
  const sim=s=>{for(let i=0;i<s*20;i++){gameData.unitSpatialGrid=buildUnitSpatialGrid();wodBeginSimPfBudget(gameData.entities.length);update(.05);}};
  const blocked=()=>isCitySiegeBlockedForProduction(town);
  const out={};
  world();unit(0,2,1);unit(4,0,2);gameData.unitSpatialGrid=buildUnitSpatialGrid();out.near=blocked();
  world();const a=unit(4,0,1),b=unit(5,0,2);sim(1.5);out.fightOut={blocked:blocked(),fought:a.hp<a.maxHp||b.hp<b.maxHp};
  world();unit(2,0,2);out.onTile=blocked();
  world();h(2).owner=2;out.taken=blocked();
  world();const c=unit(2,0,1),d=unit(3,0,2);sim(1.5);out.fightIn={blocked:blocked(),fought:c.hp<c.maxHp||d.hp<d.maxHp};
  return out;});
 console.log(JSON.stringify(res));
 assert(!res.near,'an enemy two cells off with nobody fighting does not stop the town');
 assert(res.fightOut.fought&&!res.fightOut.blocked,'a fight outside the town does not stop it: '+JSON.stringify(res.fightOut));
 assert(res.onTile,'an enemy standing on a town cell stops it');
 assert(res.taken,'a town cell taken by the enemy stops it');
 assert(res.fightIn.fought&&res.fightIn.blocked,'our troops in the town under fire stop it: '+JSON.stringify(res.fightIn));
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
