'use strict';
// The AI bridges its way to a fight on another island. Two islands across a three-cell strait: the AI town on the west one,
// four AI infantry fighting four enemy infantry on the east one, and no enemy town anywhere (so no assault bridge). The AI
// builds a bridge from its own island to the east island's coast near the fight; with fightBridges=0 it builds none, and
// with no fight over there (the AI troops alone on the east island, or the fight on its own town's island) it builds none.
const H=require('./lib/harness');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/ai-fight-bridges');fs.mkdirSync(OUT,{recursive:true});
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:60000});
 await page.evaluate(()=>{
  setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
  window.h=(q,r=0)=>gameData.hexes[q+','+r];
  window.world=()=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(30);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData.fogOfWar=false;
   gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.selection=[];gameData._aiOps=null;gameData._aiFightIslands=null;gameData._aiBridgeCooldown={};gameData._aiBridgeSearches=null;gameData._matchReadyForEndChecks=false;
   // west island q<=-2 is the AI's, the strait is q -1..1, the east island q>=2 the enemy's
   for(const p of gameData.hexList){p.cityId=null;p.type=Math.abs(p.q)<=1?'water':'grass';p.owner=p.q<=-2?2:p.q>=2?1:0;}
   const t=h(-10,0);t.type='urban';t.cityId='ai';t.owner=2;gameData.cities.push({id:'ai',name:'AI town',q:-10,r:0,x:t.x,y:t.y,owner:2,hp:1000,maxHp:1000,hasFactory:true});
   gameData._wodPfVer=(gameData._wodPfVer||0)+1;gameData.landGeometryRevision=(gameData.landGeometryRevision||0)+1;
   gameData.aiMoneyByOwner={2:1e6};gameData.aiManpowerByOwner={2:1e6};};
  window.unit=(q,r,owner)=>{const p=h(q,r),u=createUnitAt('light',p.x,p.y,owner,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
  window.run=(tune,kind)=>{world();WOD_OPS.T=Object.assign({},tune);
   const at=kind==='home'?-8:6;for(let i=0;i<4;i++)unit(at,-2+i,2);
   if(kind!=='alone')for(let i=0;i<4;i++)unit(kind==='home'?-5:9,-2+i,1);
   gameData.unitSpatialGrid=buildUnitSpatialGrid();
   const random=Math.random;Math.random=()=>0;let job;
   try{const fights=wodAiFightIslands(2).map(f=>({n:f.n,ownTown:f.ownTown}));
    wodAiTryBridgeForOwner(2,'2',fights.some(f=>!f.ownTown&&f.n>=2));
    for(let i=0;i<300&&!gameData.constructionJobs.some(j=>j.mode==='bridge');i++)wodStepAiBridgeSearches();
    job=gameData.constructionJobs.find(j=>j.mode==='bridge');
    const ends=job&&[getNearestHexToPoint(job.x-Math.cos(job.angle||0)*job.w/2,job.y-Math.sin(job.angle||0)*job.w/2),getNearestHexToPoint(job.x+Math.cos(job.angle||0)*job.w/2,job.y+Math.sin(job.angle||0)*job.w/2)];
    return{fights,built:!!job,at:job&&{x:Math.round(job.x),y:Math.round(job.y)},ends:ends&&ends.map(e=>e&&[e.q,e.r]),fightY:Math.round(h(6,0).y)};}
   finally{Math.random=random;}};
 });
 const res={};
 res.on=await page.evaluate(()=>run({},'fight'));
 res.finished=await page.evaluate(()=>{for(let i=0;i<90&&!gameData.bridges.length;i++)wodUpdateConstruction(1);const b=gameData.bridges[0];return{bridges:gameData.bridges.length,owner:b?.owner};});
 await page.evaluate(()=>{UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.style.display='block';gameData.camera={zoom:.8,x:-640,y:-400};wodMarkTerrainFullDirty?.();updateTerrainCache?.();draw();});
 await page.screenshot({path:path.join(OUT,'fight-bridge.png')});
 res.off=await page.evaluate(()=>run({fightBridges:0},'fight'));
 res.alone=await page.evaluate(()=>run({},'alone'));
 res.home=await page.evaluate(()=>run({},'home'));
 console.log(JSON.stringify(res));
 assert(res.on.fights.some(f=>!f.ownTown&&f.n===4),'the fight on the east island is seen: '+JSON.stringify(res.on.fights));
 assert(res.on.built,'a bridge goes up to the fight on the other island: '+JSON.stringify(res.on));
 assert(res.on.ends.some(e=>e[0]<=-2)&&res.on.ends.some(e=>e[0]>=2),'the bridge joins the AI island to the fight island: '+JSON.stringify(res.on.ends));
 assert(res.finished.bridges===1&&res.finished.owner===2,'the bridge is finished and stands: '+JSON.stringify(res.finished));
 assert(!res.off.built,'with fightBridges=0 no bridge: '+JSON.stringify(res.off));
 assert(!res.alone.built,'no fight over there, no bridge: '+JSON.stringify(res.alone));
 assert(!res.home.built,'a fight on the home island needs no bridge: '+JSON.stringify(res.home));
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
