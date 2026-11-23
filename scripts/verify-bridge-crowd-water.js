'use strict';
// Crowds on a bridge stay out of the river (js/movement.js wodPointBesideBridge, js/mapgen.js wodUnitClingsToBridge).
// A river three cells wide with a bridge across; four enemy regiments hold its far end. Five of the player's regiments
// ordered across together queue on the deck and fight at its end: none of them wades into the river (troops were steered
// and pushed off the deck by their comrades, or sent from the bank straight across beside it, and drowned in a stalled
// fight), so none takes water attrition. And a click in the water right beside the deck sends a regiment to the bank
// there, on its own side, not out along the deck and off its side into the river.
const H=require('./lib/harness');
const assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:120000});
 const res=await page.evaluate(()=>{setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
  const h=(q,r)=>gameData.hexes[q+','+r],C=gameData.hexRadius*1.35;
  const world=()=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(24);gameState='PLAYING';gameData.mp={enabled:false};gameData.menuAttractMode=false;gameData.fogOfWar=false;gameData._matchReadyForEndChecks=false;
   gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.money=1e6;
   for(const p of gameData.hexList){p.type=Math.abs(p.q)<=1?'water':'grass';p.owner=p.q<0?1:2;p.cityId=null;}
   for(const [id,q,r,o] of [['w',-12,0,1],['e',12,0,2]]){const p=h(q,r);p.type='urban';p.cityId=id;p.owner=o;gameData.cities.push({id,name:id,q,r,x:p.x,y:p.y,owner:o,hp:1000,maxHp:1000});}
   gameData._wodPfVer=(gameData._wodPfVer||0)+1;wodRebuildBridgeHexIndex();placeBridgeSpan(1,-2,0,2,0,{editor:true,suppressNotes:true});
   gameData.aiMoneyByOwner={2:0};gameData.aiManpowerByOwner={2:0};gameData._aiSuspended={hexes:gameData.hexes,owners:new Set([2])};};
  const unit=(type,q,r,o)=>{const p=h(q,r),u=createUnitAt(type,p.x,p.y,o,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
  const step=()=>{if(wodPlayerOrderQueue.length)wodPumpPlayerOrderQueue();gameData.unitSpatialGrid=buildUnitSpatialGrid();wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;update(.05);gameData._wodPfFrameActive=false;wodDrainAiMoveQueue();};
  // the crowd
  world();const mine=[];for(let i=0;i<5;i++)mine.push(unit('light',-4-(i%2),-2+i,1));
  const foes=[[3,0],[3,1],[3,-1],[4,0]].map(([q,r])=>{const u=unit('light',q,r,2);u.holding=true;return u;});
  gameData.selection=mine.slice();const goal=h(8,0);issueMoveOrder({x:goal.x,y:goal.y});
  const wet={};let onDeckOrBeside=0,crossed=0;
  for(let i=0;i<90*20;i++){step();for(const u of mine){if(u.hp<=0)continue;if(wodUnitInUnsuppliedWater(u,getNearestHexToPoint(u.x,u.y)))wet[u.uid]=(wet[u.uid]||0)+.05;if(wodUnitClingsToBridge(u)||wodUnitOnBridgeDeck(u))onDeckOrBeside++;}}
  for(const u of mine)if(u.hp>0&&u.x>C*1.5)crossed++;
  const crowd={wet,maxWet:Math.max(0,...Object.values(wet)),drowned:mine.filter(u=>u.hp<=0&&(u.attritionHpLost||0)>0).length,attrition:mine.reduce((n,u)=>n+(u.attritionHpLost||0),0),onDeckOrBeside,crossed,alive:mine.filter(u=>u.hp>0).length};
  // water clicks beside the deck, from both sides of the bridge on the west bank
  const clicks=[];
  for(const [fq,fr] of [[-7,5],[-7,-5]])for(const [gq,gr] of [[-1,1],[0,2],[-1,-1]]){
   world();const u=unit('light',fq,fr,1),g=h(gq,gr);gameData.selection=[u];issueMoveOrder({x:g.x,y:g.y});
   let deck=0,wetT=0;for(let i=0;i<40*20;i++){step();if(wodUnitOnBridgeDeck(u))deck+=.05;if(wodUnitInUnsuppliedWater(u,getNearestHexToPoint(u.x,u.y)))wetT+=.05;}
   const end=getNearestHexToPoint(u.x,u.y);clicks.push({from:fq+','+fr,click:gq+','+gr,deck:+deck.toFixed(1),wet:+wetT.toFixed(1),end:end.q+','+end.r,endDry:!isWaterHex(end),westBank:end.q<0,off:+(Math.hypot(u.x-g.x,u.y-g.y)/C).toFixed(1)});
  }
  return{crowd,clicks};});
 console.log(JSON.stringify(res));
 const c=res.crowd;
 assert(c.maxWet<3,'no regiment of the crowd stands in the river (most seconds in unsupplied water: '+c.maxWet.toFixed(1)+'): '+JSON.stringify(c));
 assert.equal(c.drowned,0,'nobody drowns');
 assert.equal(c.attrition,0,'no water attrition at all');
 assert(c.onDeckOrBeside>0&&c.crossed>=1,'the crowd does cross (on the deck) and reaches the far bank: '+JSON.stringify(c));
 for(const k of res.clicks){
  assert(k.endDry&&k.westBank&&k.off<=2.5,'a click in the water beside the deck sends the regiment to the bank by it on its own side: '+JSON.stringify(k));
  assert(k.deck<1&&k.wet<1,'it does not go out along the deck or into the river: '+JSON.stringify(k));
 }
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('bridge crowds stay out of the river; water clicks beside a bridge go to the bank');
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
