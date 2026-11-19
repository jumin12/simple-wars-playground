'use strict';
// Transports and supply ships carry no guns and run from warships (wodVesselEvade, js/movement.js):
//  - an idle transport of ours with an enemy warship two cells off: it puts water between them (more than one and a half
//    cells gained in eight seconds; transports are slow) and the warship takes no damage from it (it used to stand and trade shots);
//  - the same for a supply ship, and for a computer's transport sailing on its own orders;
//  - a player's transport ordered past the warship keeps to its order and arrives;
//  - a computer's transport landing troops within two cells of its beach stays to put them ashore;
//  - an idle transport with enemy troops on the shore in range backs off.
const H=require('./lib/harness');
const assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:90000});
 const out=await page.evaluate(()=>{setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();updateAiStrategy=()=>{};
  const h=(q,r=0)=>gameData.hexes[q+','+r];
  const world=()=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(26);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData.fogOfWar=false;
   gameData.entities=[];gameData.cities=[];gameData.selection=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData._aiEconomyClock=0;
   for(const p of gameData.hexList){const land=p.q<=-10||p.q>=10;p.type=land?'grass':'water';p.owner=land?(p.q<0?1:2):0;p.cityId=null;}
   for(const [id,q,o] of [['ours',-14,1],['theirs',14,2]]){const p=h(q,0);p.type='urban';p.cityId=id;p.owner=o;gameData.cities.push({id,name:id,q,r:0,x:p.x,y:p.y,owner:o,hp:1000,maxHp:1000,hasHarbor:true});}
   gameData._wodPfVer=(gameData._wodPfVer||0)+1;gameData.aiMoneyByOwner={2:0};gameData.aiManpowerByOwner={2:0};};
  const unit=(type,q,r,o)=>{const p=h(q,r),u=createUnitAt(type,p.x,p.y,o,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
  const sp=(gameData.hexRadius||20)*1.35;
  const sim=s=>{for(let i=0;i<s*20;i++){gameData._aiEconomyClock+=.05;gameData.unitSpatialGrid=buildUnitSpatialGrid();wodRebuildHexCombatOccupancy();wodBeginSimPfBudget(gameData.entities.length);update(.05);}};
  const flee=(type,owner)=>{world();const v=unit(type,0,0,owner),ship=unit('ship',2,0,3-owner);ship.holding=true;ship.hp=ship.maxHp=5000;
   const d0=Math.hypot(v.x-ship.x,v.y-ship.y);sim(8);return{alive:v.hp>0,gained:Math.round((Math.hypot(v.x-ship.x,v.y-ship.y)-d0)/sp*10)/10,shipHurt:Math.round(5000-ship.hp),damage:v.damage};};
  const o={};
  o.transport=flee('transport',1);o.supply=flee('supply',1);o.aiTransport=flee('transport',2);
  // a player's transport ordered past the warship
  world();{const v=unit('transport',-6,-4,1),ship=unit('ship',0,-2,2);ship.holding=true;ship.damage=0;const goal=h(3,-4);assignUnitMoveAlongWaypoints(v,[goal]);sim(55);o.ordered={arrived:Math.hypot(v.x-goal.x,v.y-goal.y)<sp,alive:v.hp>0};}
  // a computer's transport landing troops at its beach, a warship near
  world();{const v=unit('transport',-8,0,2),ship=unit('ship',-6,2,1);ship.holding=true;ship.damage=0;const passenger=unit('light',-8,0,2);gameData.entities=gameData.entities.filter(e=>e!==passenger);v.cargo=passenger;
   const beach=h(-9,0);v.orderTarget={x:beach.x,y:beach.y};v.target={x:beach.x,y:beach.y};const x0=v.x;sim(1.5);o.landing={stayed:Math.hypot(v.x-x0,v.y-v.y)<sp,toward:Math.hypot(v.x-beach.x,v.y-beach.y)<=Math.hypot(x0-beach.x,0)+1};}
  // an idle transport with enemy infantry on the shore in range
  world();{const v=unit('transport',8,0,1),inf=unit('light',10,0,2);inf.holding=true;const d0=Math.hypot(v.x-inf.x,v.y-inf.y);sim(8);o.shore={gained:Math.round((Math.hypot(v.x-inf.x,v.y-inf.y)-d0)/sp*10)/10};}
  return o;});
 console.log(JSON.stringify(out));
 for(const k of ['transport','supply','aiTransport'])assert(out[k].alive&&out[k].gained>1.5&&out[k].shipHurt===0&&out[k].damage===0,k+' runs from the warship and does not shoot: '+JSON.stringify(out[k]));
 assert(out.ordered.arrived,'a player\'s transport with an order keeps to it: '+JSON.stringify(out.ordered));
 assert(out.landing.toward,'a transport landing troops at its beach stays to put them ashore: '+JSON.stringify(out.landing));
 assert(out.shore.gained>1,'an idle transport backs off from enemy troops on shore: '+JSON.stringify(out.shore));
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
