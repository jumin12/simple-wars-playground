'use strict';
// A routed unit always runs (wodRoutFallbackGoal, js/movement.js). Our infantry breaks with enemy regiments three cells off
// on all eight sides (no cell takes it farther from all of them, so the careful retreat finds nowhere) and its town fifteen
// cells west: within eight seconds it is on its way (more than a cell from where it broke, heading for the town). It used
// to stand where it broke, flashing. Also: routed with enemies on one side only, it still steps back from them.
const H=require('./lib/harness');
const assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:90000});
 const out=await page.evaluate(()=>{setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
  const h=(q,r=0)=>gameData.hexes[q+','+r];
  const world=()=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(28);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData.fogOfWar=false;
   gameData.entities=[];gameData.cities=[];gameData.selection=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData._aiEconomyClock=0;
   for(const p of gameData.hexList){p.type='grass';p.owner=p.q<=12?1:2;p.cityId=null;}
   for(const [id,q,o] of [['home',-15,1],['enemy',20,2]]){const p=h(q,0);p.type='urban';p.cityId=id;p.owner=o;gameData.cities.push({id,name:id,q,r:0,x:p.x,y:p.y,owner:o,hp:1000,maxHp:1000});}
   gameData._wodPfVer=(gameData._wodPfVer||0)+1;gameData.aiMoneyByOwner={2:0};gameData.aiManpowerByOwner={2:0};gameData.aiTimer=gameData.aiStrategyTimer=-1e9;};
  const unit=(q,r,o)=>{const p=h(q,r),u=createUnitAt('light',p.x,p.y,o,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
  const run=foes=>{world();const u=unit(0,0,1);u.hp=u.maxHp=5000;
   for(const [q,r] of foes){const e=unit(q,r,2);e.damage=0.5;e.range=60;e.holding=true;}
   gameData.unitSpatialGrid=buildUnitSpatialGrid();u.morale=1;triggerMoraleRout(u);const x0=u.x,y0=u.y,home=gameData.cities[0];
   for(let i=0;i<8*20;i++){gameData._aiEconomyClock+=.05;gameData.unitSpatialGrid=buildUnitSpatialGrid();wodRebuildHexCombatOccupancy();wodBeginSimPfBudget(gameData.entities.length);
    for(const e of gameData.entities)if(e.owner===1){wodUpdateUnitMorale(e,.05);moveUnitTowardTarget(e,.05);}}
   const sp=(gameData.hexRadius||20)*1.35;
   return{routed:!!u.moraleBroken,moved:Math.round(Math.hypot(u.x-x0,u.y-y0)/sp*10)/10,towardHome:Math.round((Math.hypot(x0-home.x,y0-home.y)-Math.hypot(u.x-home.x,u.y-home.y))/sp*10)/10};};
  const ring=[];for(let dq=-3;dq<=3;dq+=3)for(let dr=-3;dr<=3;dr+=3)if(dq||dr)ring.push([dq,dr]);
  return{ring:run(ring),side:run([[3,-1],[3,0],[3,1]])};});
 console.log(JSON.stringify(out));
 assert(out.ring.moved>1&&out.ring.towardHome>0.5,'a routed unit ringed by enemies runs for its town instead of standing where it broke: '+JSON.stringify(out.ring));
 assert(out.side.moved>1,'routed with enemies on one side, it steps back from them: '+JSON.stringify(out.side));
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
