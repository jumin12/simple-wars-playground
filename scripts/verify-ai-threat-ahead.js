'use strict';
// The AI sees enemies coming (WOD_OPS.T.threatAhead, js/ai/field-command.js; the default counts them at its walls, within
// fourteen cells, and at its forts and hospitals). An enemy column of four marches on one of
// the AI's two towns from twenty cells off; the AI's army stands well away from it. When the column's lead is seven cells
// from the town (where enemies at the walls used to start counting), the AI has posted more defenders to the town than
// with the switch off: it saw the column at fourteen cells. (Its decision, not where the troops have got to, which
// depends on how much path finding a loaded machine allows.) A column marching past the town (not toward it) draws no such defence.
const H=require('./lib/harness');
const assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:90000});
 await page.evaluate(()=>{setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
  window.h=(q,r=0)=>gameData.hexes[q+','+r];
  window.run=(tune,dest)=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(30);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData.fogOfWar=false;
   gameData.entities=[];gameData.cities=[];gameData.selection=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData._aiOps=null;gameData._aiLastStand=null;gameData._aiAlertAt=null;
   gameData._aiDecisionLog=null;gameData._aiEconomyPlans={};gameData.aiTaskForces={};WOD_OPS.T=Object.assign({},tune);gameData._aiEconomyClock=0;
   for(const p of gameData.hexList){p.type='grass';p.owner=p.q<=4?2:1;p.cityId=null;}
   for(const [id,q,r,o] of [['north',-6,-14,2],['south',-6,14,2],['enemy',22,0,1]]){const p=h(q,r);p.type='urban';p.cityId=id;p.owner=o;gameData.cities.push({id,name:id,q,r,x:p.x,y:p.y,owner:o,hp:1000,maxHp:1000,hasFactory:true});}
   gameData._wodPfVer=(gameData._wodPfVer||0)+1;gameData.landGeometryRevision=(gameData.landGeometryRevision||0)+1;gameData._matchReadyForEndChecks=false;
   gameData.aiMoneyByOwner={2:0};gameData.aiManpowerByOwner={2:0};
   const unit=(q,r,o)=>{const p=h(q,r),u=createUnitAt('light',p.x,p.y,o,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
   unit(-6,-13,2);unit(-6,13,2);for(let i=0;i<8;i++)unit(-14,-3+i,2);
   const col=[];for(let i=0;i<4;i++)col.push(unit(12,10+i%2,1));
   const town=gameData.cities[1],goal=dest==='town'?h(-5,14):h(-5,-24);for(const u of col)assignUnitMoveAlongWaypoints(u,[goal]);
   const C=(gameData.hexRadius||20)*1.35;let near=null,minD=Infinity,guards=0;
   for(let i=0;i<120*20;i++){gameData.unitSpatialGrid=buildUnitSpatialGrid();wodBeginSimPfBudget(gameData.entities.length);update(.05);wodDrainAiMoveQueue();
    const lead=Math.min(...col.filter(u=>u.hp>0).map(u=>Math.hypot(u.x-town.x,u.y-town.y)));minD=Math.min(minD,lead);
    if(lead<C*14)guards=Math.max(guards,(gameData._aiOps?.by?.[2]?.garrison?.[town.id]||[]).length);
    if(lead<C*7){near=gameData.entities.filter(u=>u.owner===2&&u.hp>0&&Math.hypot(u.x-town.x,u.y-town.y)<C*6).length;break;}}
   return{near,guards,minCells:Math.round(minD/C*10)/10,alerts:gameData._aiAlertAt!=null};};
 });
 const on=await page.evaluate(()=>run({},'town')),off=await page.evaluate(()=>run({threatAhead:0},'town')),past=await page.evaluate(()=>run({},'past'));
 console.log(JSON.stringify({on,off,past}));
 assert(on.near!=null&&off.near!=null,'the column reaches seven cells from the town');
 assert(on.alerts,'the AI saw the column coming');
 assert(on.guards>off.guards,'the AI posts more defenders to the town while the column closes from fourteen to seven cells: '+JSON.stringify({on,off}));
 assert(!past.alerts||past.near==null||past.near<=off.near,'a column marching past the town does not draw the defence: '+JSON.stringify(past));
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
