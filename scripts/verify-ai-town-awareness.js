'use strict';
// The AI does not send its army after one unit while another enemy faction threatens one of its towns
// (js/ai/field-command.js: otherDanger, needNow). The AI (P2) has two towns and twelve regiments by the
// southern one. A lone regiment of the player's stands in its land beside that town, the player's army of eight twenty
// cells off; a third faction's army of six stands eight cells from the AI's northern town, more than its guard. The
// strike on the lone regiment counts the player's distant army (and the third faction's) as on their way, which
// made it a big battle, and a big battle takes everyone in reach: most of the army went. Now, with the north in danger, the
// strike is sized for the fight in front of it and the rest stay free. With allIn=1 the old behaviour is back, which
// shows the scenario reaches the code.
const H=require('./lib/harness');
const assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:120000});
 await page.evaluate(()=>{setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
  window.h=(q,r=0)=>gameData.hexes[q+','+r];
  window.run=tune=>{
   wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(30);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData.fogOfWar=false;
   gameData.entities=[];gameData.cities=[];gameData.selection=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData._aiOps=null;gameData._aiLastStand=null;gameData._aiAlertAt=null;gameData.alliances=[];
   gameData._aiDecisionLog=null;gameData._aiEconomyPlans={};gameData.aiTaskForces={};WOD_OPS.T=Object.assign({},tune);gameData._aiEconomyClock=0;
   for(const p of gameData.hexList){p.type='grass';p.owner=p.r<=-21?3:p.q<=4?2:1;p.cityId=null;}
   for(const [id,q,r,o] of [['home',-8,4,2],['north',-8,-12,2],['p1',22,0,1],['p3',-8,-28,3]]){const p=h(q,r);p.type='urban';p.cityId=id;p.owner=o;gameData.cities.push({id,name:id,q,r,x:p.x,y:p.y,owner:o,hp:1000,maxHp:1000,hasFactory:true});}
   gameData._wodPfVer=(gameData._wodPfVer||0)+1;gameData.landGeometryRevision=(gameData.landGeometryRevision||0)+1;gameData._matchReadyForEndChecks=false;
   gameData.aiMoneyByOwner={2:0,3:0};gameData.aiManpowerByOwner={2:0,3:0};
   // the third faction's army only stands there (its own AI is off)
   gameData._aiSuspended={hexes:gameData.hexes,owners:new Set([3])};
   const unit=(q,r,o)=>{const p=h(q,r),u=createUnitAt('light',p.x,p.y,o,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
   const army=[];for(let i=0;i<12;i++)army.push(unit(-13+(i%3),-1+Math.floor(i/3),2));
   const loner=unit(-4,10,1);loner.holding=true;
   for(let i=0;i<8;i++){const u=unit(14+(i%3),12+Math.floor(i/3),1);u.holding=true;}
   for(let i=0;i<6;i++){const u=unit(-9+(i%3),-21+Math.floor(i/3)*0,3);u.holding=true;}
   let maxStrike=0,maxNear=0;const C=(gameData.hexRadius||20)*1.35;
   for(let i=0;i<40*20;i++){
    gameData.unitSpatialGrid=buildUnitSpatialGrid();wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;update(.05);gameData._wodPfFrameActive=false;wodDrainAiMoveQueue();
    loner.outOfSupplySeconds=0;loner.supplyPendingSeconds=0;
    const S=gameData._aiOps?.by?.[2];
    if(S&&loner.hp>0)for(const st of S.strikes||[])if(st.ids.has(loner.uid)){const t=S.ts[st.key];if(t?.members&&wodAiOperationTime()-t.seen<3000)maxStrike=Math.max(maxStrike,t.members.length);}
    if(loner.hp>0)maxNear=Math.max(maxNear,army.filter(u=>u.hp>0&&Math.hypot(u.x-loner.x,u.y-loner.y)<C*6).length);
   }
   return{maxStrike,maxNear,army:army.filter(u=>u.hp>0).length,lonerAlive:loner.hp>0};
  };
 });
 const now=await page.evaluate(()=>run({})),old=await page.evaluate(()=>run({allIn:1}));
 console.log(JSON.stringify({now,old}));
 assert(old.maxStrike>=6,'with the old sizing most of the army goes after the lone regiment (the scenario reaches the code): '+JSON.stringify(old));
 assert(now.maxStrike>=1&&now.maxStrike<=4,'with the north in danger the AI still deals with the lone regiment, with a few: '+JSON.stringify(now));
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('town awareness: one enemy unit no longer draws the army while another enemy threatens a town');
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
