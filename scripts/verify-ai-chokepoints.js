'use strict';
// The AI holds choke points: a mountain wall with a two-cell pass between an AI town and the enemy. The pass is a choke
// (a strip under three cells wide). With the enemy army waiting at its own town, stronger, the AI army waits on its side
// of the pass; with an enemy force within eleven cells of the AI town beyond the pass, the AI holds the pass in front of
// the town. With the switches off (chokeHold, chokeGuard, chokeWide) neither happens.
const H=require('./lib/harness');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/ai-chokepoints');fs.mkdirSync(OUT,{recursive:true});
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[],results={};page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:60000});
 await page.evaluate(()=>{
  setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
  window.h=(q,r=0)=>gameData.hexes[q+','+r];
  window.world=()=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(28);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData.fogOfWar=false;gameData.entities=[];gameData.cities=[];gameData.selection=[];gameData._aiOps=null;
   for(const p of gameData.hexList){p.type='grass';p.owner=p.q<=0?2:1;if(p.q===-3&&!(p.r===0||p.r===1)){p.type='mountain';}}
   for(const [id,q,o] of [['ai',-10,2],['enemy',12,1]]){const p=h(q,0);p.type='urban';p.cityId=id;p.owner=o;gameData.cities.push({id,name:id,q,r:0,x:p.x,y:p.y,owner:o,hp:1000,maxHp:1000,hasFactory:true});}
   gameData._wodPfVer=(gameData._wodPfVer||0)+1;gameData.landGeometryRevision=(gameData.landGeometryRevision||0)+1;gameData._matchReadyForEndChecks=false;
   gameData.aiMoneyByOwner={2:0};gameData.aiManpowerByOwner={2:0};};
  window.unit=(q,r,owner)=>{const p=h(q,r),u=createUnitAt('light',p.x,p.y,owner,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
  // army: the enemy army stands at its own town, stronger than ours, so ours waits on its own ground; guard: an enemy force
  // has come within eleven cells of our town, four beyond the pass, and its garrison sees it coming
  window.run=(tune,kind)=>{world();WOD_OPS.T=Object.assign({},tune);
   const ai=[unit(-8,-1,2),unit(-8,1,2),unit(-9,0,2),unit(-9,2,2)];for(let i=0;i<6;i++)unit(10+(i%3),-1+Math.floor(i/3)*2,1);
   if(kind==='guard')for(let i=0;i<5;i++)unit(1,-2+i,1);
   const pass=[h(-3,0),h(-3,1)];const choke=pass.every(p=>wodOpsChokeCell(p,ai[0]));
   for(let i=0;i<60*20;i++){gameData.unitSpatialGrid=buildUnitSpatialGrid();wodBeginSimPfBudget(gameData.entities.length);update(.05);wodDrainAiMoveQueue();}
   const C=(gameData.hexRadius||20)*Math.sqrt(3);
   const holding=ai.filter(u=>u.hp>0&&pass.some(p=>Math.hypot(u.x-p.x,u.y-p.y)<C*2.6&&u.x<=p.x+C*.6)).length;
   const S=gameData._aiOps?.by?.[2];
   return{choke,holding,alive:ai.filter(u=>u.hp>0).length,post:S?.post?{choke:!!S.post.choke}:null,chokeGuard:S?.counts?.chokeGuard||0,roles:ai.map(u=>u._opsRole||'-')};};
 });
 results.army=await page.evaluate(()=>run({},'army'));results.armyOff=await page.evaluate(()=>run({chokeHold:0,chokeGuard:0,chokeWide:0},'army'));
 results.on=await page.evaluate(()=>run({},'guard'));
 await page.evaluate(()=>{UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.style.display='block';gameData.camera={zoom:.9,x:-600,y:-380};for(const u of gameData.entities){u._drawX=u.x;u._drawY=u.y;}wodMarkTerrainFullDirty?.();updateTerrainCache?.();draw();});
 await page.screenshot({path:path.join(OUT,'pass-held.png')});
 results.off=await page.evaluate(()=>run({chokeHold:0,chokeGuard:0,chokeWide:0},'guard'));
 console.log(JSON.stringify(results));
 assert(results.on.choke,'a two-cell pass is a choke');
 assert(results.army.holding>=1&&results.army.holding>results.armyOff.holding,'the waiting army holds the pass: '+JSON.stringify([results.army,results.armyOff]));
 assert(results.on.holding>=2,'the AI holds the pass on the road to its threatened town: '+JSON.stringify(results.on));
 assert(results.off.holding<results.on.holding,'without the switches the pass is not held as well: '+JSON.stringify(results.off));
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
