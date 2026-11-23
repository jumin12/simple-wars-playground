'use strict';
// A retreat the player orders goes on while the enemy follows (js/movement.js wodContinueRetreatUnderPursuit). One of the
// player's regiments in a fight is ordered to retreat while two enemy regiments chase it. The order is a short pullback
// (a few cells); arriving with the pursuers still close, it pulls back again, up to three legs, and keeps out of their
// reach. It used to stop after the first leg and be shot at where it stood (the arrival check also released a healthy
// unit's retreat, cancelling a new leg the moment it was given). With nobody following, one leg is all it takes.
const H=require('./lib/harness');
const assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:120000});
 const res=await page.evaluate(()=>{setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
  const h=(q,r)=>gameData.hexes[q+','+r],C=gameData.hexRadius*1.35;
  const run=chase=>{
   wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(24);gameState='PLAYING';gameData.mp={enabled:false};gameData.menuAttractMode=false;gameData.fogOfWar=false;gameData._matchReadyForEndChecks=false;
   gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];
   for(const p of gameData.hexList){p.type='grass';p.owner=p.q<=1?1:2;p.cityId=null;}
   for(const [id,q,r,o] of [['w',-14,0,1],['e',14,0,2]]){const p=h(q,r);p.type='urban';p.cityId=id;p.owner=o;gameData.cities.push({id,name:id,q,r,x:p.x,y:p.y,owner:o,hp:1000,maxHp:1000});}
   gameData._wodPfVer=(gameData._wodPfVer||0)+1;gameData._aiSuspended={hexes:gameData.hexes,owners:new Set([2])};
   const unit=(q,r,o)=>{const p=h(q,r),u=createUnitAt('light',p.x,p.y,o,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
   const me=unit(0,0,1),foes=[unit(3,0,2),unit(3,1,2)];for(const e of foes)e.holding=true;
   const step=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();wodBeginSimPfBudget(9);gameData._wodPfFrameActive=true;update(.05);gameData._wodPfFrameActive=false;wodDrainAiMoveQueue();};
   for(let i=0;i<60;i++)step();
   if(chase)for(const e of foes){e.holding=false;wodSetPreferredTarget(2,[e.uid],me.uid,{pursue:true});}
   gameData.selection=[me];const ordered=wodIssueRetreatOrder();const x0=me.x,hp0=me.hp;let legs=1,minGap=Infinity;
   for(let i=0;i<45*20;i++){step();legs=Math.max(legs,me._wodRetreatLeg||1);if(i>40)minGap=Math.min(minGap,...foes.map(e=>Math.hypot(e.x-me.x,e.y-me.y)/C));}
   return{chase,ordered,legs,net:+((x0-me.x)/C).toFixed(1),hpLost:Math.round(hp0-me.hp),minGap:+minGap.toFixed(1),retreatingAtEnd:!!me.retreating};
  };
  return{chased:run(true),quiet:run(false)};});
 console.log(JSON.stringify(res));
 const c=res.chased,q=res.quiet;
 assert(c.ordered===1&&c.legs>=2&&c.net>=5,'chased, the retreat goes on past the first pullback: '+JSON.stringify(c));
 assert(c.hpLost<=5,'and keeps out of the pursuers\' reach: '+JSON.stringify(c));
 assert(q.ordered===1&&q.legs===1&&q.net>=1.5&&q.net<=4.5,'with nobody following, one short pullback: '+JSON.stringify(q));
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('retreat under pursuit: the player\'s retreat keeps going while the enemy follows');
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
