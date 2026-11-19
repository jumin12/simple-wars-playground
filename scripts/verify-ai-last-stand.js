'use strict';
// An AI about to be wiped out throws everything into the fight for its last town (wodAiLastStand, js/ai/field-command.js).
//  - last: the AI's only town has four enemy regiments at its walls. Every AI unit that can walk there fights for it:
//    the two guards, two flank units far off, and a badly wounded unit beside a hospital (which the medical service
//    would otherwise keep). With the switch off (lastStand=0) the field command sends defenders in proportion and the
//    wounded unit goes to be treated.
//  - scout: one enemy scout near the only town of an AI with eight regiments is not a last stand.
//  - three: an AI with three towns is never in a last stand.
//  - start: two towns from the start, enemy regiments close by and stronger, no town lost or attacked in its streets: no
//    last stand (on a shared island that is how a game begins).
//  - two: down to its last two towns (it held three), one has enemies at its walls that outweigh its army: the other town raises troops
//    with all the money (recruit reason "last-stand"), no buildings.
const H=require('./lib/harness');
const assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:90000});
 await page.evaluate(()=>{
  setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
  window.h=(q,r=0)=>gameData.hexes[q+','+r];
  window.world=towns=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(28);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData.fogOfWar=false;
   gameData.entities=[];gameData.cities=[];gameData.selection=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData._aiOps=null;gameData._aiLastStand=null;gameData._aiDecisionLog=null;gameData._aiEconomyPlans={};gameData.aiTaskForces={};
   for(const p of gameData.hexList){p.type='grass';p.owner=p.q<=0?2:1;p.cityId=null;}
   for(const [id,q,r,o] of [...towns.map((t,i)=>['ai'+i,t[0],t[1],2]),['enemy',16,0,1]]){const p=h(q,r);p.type='urban';p.cityId=id;p.owner=o;gameData.cities.push({id,name:id,q,r,x:p.x,y:p.y,owner:o,hp:1000,maxHp:1000,hasFactory:true});}
   gameData._wodPfVer=(gameData._wodPfVer||0)+1;gameData.landGeometryRevision=(gameData.landGeometryRevision||0)+1;gameData._matchReadyForEndChecks=false;
   gameData.aiMoneyByOwner={2:0};gameData.aiManpowerByOwner={2:0};};
  window.unit=(q,r,owner)=>{const p=h(q,r),u=createUnitAt('light',p.x,p.y,owner,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
  window.sim=s=>{for(let i=0;i<s*20;i++){gameData.unitSpatialGrid=buildUnitSpatialGrid();wodBeginSimPfBudget(gameData.entities.length);update(.05);wodDrainAiMoveQueue();}};
  window.last=tune=>{world([[-10,0]]);WOD_OPS.T=Object.assign({},tune);
   const hp=h(-18,10);gameData.hospitals.push({q:-18,r:10,x:hp.x,y:hp.y,owner:2,hp:500,maxHp:500});
   const guards=[unit(-9,-1,2),unit(-9,1,2)],flank=[unit(-4,-14,2),unit(-4,14,2)],hurt=unit(-17,9,2);hurt.hp=hurt.maxHp*.35;
   const foes=[unit(-3,-1,1),unit(-3,0,1),unit(-3,1,1),unit(-3,2,1)];
   const town=gameData.cities[0],C=(gameData.hexRadius||20)*1.35,stand=!!wodAiLastStand(2);
   sim(25);
   const ai=[...guards,...flank,hurt];
   const toward=u=>{const t=u.orderTarget||u.target;return u._combatEngaged||Math.hypot(u.x-town.x,u.y-town.y)<C*10||!!t&&Math.hypot(t.x-town.x,t.y-town.y)<C*10;};
   return{stand,roles:ai.map(u=>u.hp>0?(u._opsRole||'-')+(u._opsUntil>wodAiOperationTime()?'':'(old)'):'dead'),fighting:ai.filter(u=>u.hp>0&&toward(u)).length,
    flankIn:flank.filter(u=>u.hp>0&&toward(u)).length,hurtIn:hurt.hp>0&&toward(hurt)&&!hurt._medicalRecovering,hurtTreated:!!hurt._medicalRecovering,
    events:(gameData._aiDecisionLog?.owners?.[2]?.events||[]).filter(e=>e.event==='ops-laststand').length};};
  window.scout=()=>{world([[-10,0]]);WOD_OPS.T={};for(let i=0;i<8;i++)unit(-12+(i%4),-3+Math.floor(i/4)*6,2);unit(-3,0,1);return{stand:!!wodAiLastStand(2)};};
  window.three=()=>{world([[-10,0],[-10,-14],[-10,14]]);WOD_OPS.T={};unit(-9,0,2);for(let i=0;i<6;i++)unit(-4,-3+i,1);return{stand:!!wodAiLastStand(2)};};
  window.two=lost=>{world([[-10,0],[-20,-14]]);WOD_OPS.T={};if(lost)gameData._aiTownPeak={hexes:gameData.hexes,2:3};unit(-9,0,2);unit(-9,1,2);for(let i=0;i<5;i++)unit(-4,-2+i,1);
   gameData.aiMoneyByOwner={2:20000};gameData.aiManpowerByOwner={2:20000};const stand=!!wodAiLastStand(2);sim(12);
   const ev=(gameData._aiDecisionLog?.owners?.[2]?.events||[]);
   return{stand,recruits:ev.filter(e=>e.event==='recruit').map(e=>e.reason+'@'+e.city),buildings:ev.filter(e=>e.event==='investment').length,
    jobs:gameData.constructionJobs.filter(j=>j.owner===2).map(j=>j.mode)};};
 });
 const res={};
 res.on=await page.evaluate(()=>last({}));res.off=await page.evaluate(()=>last({lastStand:0}));
 res.scout=await page.evaluate(()=>scout());res.three=await page.evaluate(()=>three());res.two=await page.evaluate(()=>two(true));res.start=await page.evaluate(()=>{const r=two(false);return{stand:r.stand};});
 console.log(JSON.stringify(res));
 assert(res.on.stand,'four regiments at the walls of the only town: a last stand');
 assert(res.on.fighting===5&&res.on.flankIn===2,'every unit fights for the town, the far flanks too: '+JSON.stringify(res.on));
 assert(res.on.hurtIn&&!res.on.hurtTreated,'the badly wounded unit fights instead of being treated: '+JSON.stringify(res.on));
 assert(res.on.events>=1,'the decision log records the last stand');
 assert(!res.off.stand&&(res.off.hurtTreated||res.off.fighting<5),'with the switch off the AI holds some back as before: '+JSON.stringify(res.off));
 assert(!res.scout.stand,'a scout near the only town of a strong AI is not a last stand');
 assert(!res.three.stand,'an AI with three towns is not in a last stand');
 assert(!res.start.stand,'two towns at the start, the first enemy regiments close by and stronger: no last stand');
 assert(res.two.stand&&res.two.recruits.some(r=>r.startsWith('last-stand@ai1'))&&res.two.buildings===0,'the other of its last two towns raises troops with the money: '+JSON.stringify(res.two));
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
