'use strict';
// The AI builds a bridge it has good use for on a land map (wodAiPrudentBridge, js/ai/economy.js). A river three cells wide
// runs between the AI and the enemy town, with a way round its ends twenty cells off; the AI army (nine units) waits on its
// bank. With the bridge's price and one regiment's in hand after the opening farm, but not four regiments' to spare, and
// the economy saving for something else:
//  - it finds the site (its far bank is found from the shore the army stands at: the river is the whole border, so there
//    is no frontline cell to look across from) and builds the bridge within 45 s (it waits 25 s after the opening farm, as for any building);
//  - with landBridges=0 it does not (the economy only looked with four regiments' price to spare, ten units in the field
//    and nothing put by for anything else).
const H=require('./lib/harness');
const assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:90000});
 await page.evaluate(()=>{setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
  window.h=(q,r=0)=>gameData.hexes[q+','+r];
  window.run=tune=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(28);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData.fogOfWar=false;
   gameData.entities=[];gameData.cities=[];gameData.selection=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData._aiOps=null;gameData._aiLastStand=null;gameData._aiPrudentBridge=null;
   gameData._aiDecisionLog=null;gameData._aiEconomyPlans={};gameData.aiTaskForces={};gameData._aiBridgeCooldown={};gameData._aiBridgeSearches=null;WOD_OPS.T=Object.assign({},tune);
   for(const p of gameData.hexList){const river=p.q>=0&&p.q<=2&&Math.abs(p.r)<=22;p.type=river?'water':'grass';p.owner=river?0:p.q<1?2:1;p.cityId=null;}
   for(const [id,q,o] of [['ai',-12,2],['enemy',12,1]]){const p=h(q,0);p.type='urban';p.cityId=id;p.owner=o;gameData.cities.push({id,name:id,q,r:0,x:p.x,y:p.y,owner:o,hp:1000,maxHp:1000,hasFactory:true});}
   gameData._wodPfVer=(gameData._wodPfVer||0)+1;gameData.landGeometryRevision=(gameData.landGeometryRevision||0)+1;wodRebuildBridgeHexIndex();gameData._matchReadyForEndChecks=false;
   const unit=(q,r,o)=>{const p=h(q,r),u=createUnitAt('light',p.x,p.y,o,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
   unit(-11,1,2);for(let i=0;i<8;i++)unit(-2-(i%2),-4+i,2);for(let i=0;i<3;i++)unit(10,-1+i,1);
   gameData.aiManpowerByOwner={2:0};gameData.aiMoneyByOwner={2:5300};gameData._aiEconomyPlans[2]={lastBuilding:-90,lastFort:-90,savingFor:'factory'};
   const found=wodAiPrudentBridge(2);
   for(let i=0;i<45*20;i++){gameData.unitSpatialGrid=buildUnitSpatialGrid();wodBeginSimPfBudget(gameData.entities.length);update(.05);wodDrainAiMoveQueue();}
   const jobs=gameData.constructionJobs.filter(j=>j.owner===2&&j.mode==='bridge').length,built=(gameData.bridges||[]).filter(b=>b.owner===2).length;
   return{found:found?{cost:found.cost}:null,jobs,built,cash:Math.round(gameData.aiMoneyByOwner[2])};};
 });
 const on=await page.evaluate(()=>run({})),off=await page.evaluate(()=>run({landBridges:0}));
 console.log(JSON.stringify({on,off}));
 assert(on.found&&on.found.cost<=3000,'the AI finds the crossing toward the town it is going for: '+JSON.stringify(on));
 assert(on.jobs+on.built>=1,'and builds it: '+JSON.stringify(on));
 assert.equal(off.jobs+off.built,0,'with landBridges=0 it does not: '+JSON.stringify(off));
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
