'use strict';
// Bridges are limited by the water they cross (four cells), the same in every direction. A river three cells wide along q:
// the straight crossing (four steps between the banks), a slant (four by three) and a full diagonal (four by four) are all
// accepted, and so is a five-by-five diagonal over four cells of water; a five-cell crossing is too long in any direction.
// (The full diagonals used to be refused by a cap on the deck's length.) Infantry then walks over the diagonal deck dry.
const H=require('./lib/harness');
const assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:60000});
 const res=await page.evaluate(()=>{setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();const h=(q,r)=>gameData.hexes[q+','+r];
  const world=width=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(30);gameState='PLAYING';gameData.mp={enabled:false};gameData.entities=[];gameData.cities=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.fogOfWar=false;
   for(const p of gameData.hexList){const wet=p.q>=0&&p.q<width;p.type=wet?'water':'grass';p.owner=wet?0:1;p.cityId=null;}
   for(const [id,q] of [['west',-8],['east',width+8]]){const p=h(q,0);p.type='urban';p.cityId=id;gameData.cities.push({id,name:id,q,r:0,x:p.x,y:p.y,owner:1,hp:1000,maxHp:1000});}
   gameData._wodPfVer=(gameData._wodPfVer||0)+1;gameData.landGeometryRevision=(gameData.landGeometryRevision||0)+1;};
  const plan=(a,b)=>{const p=wodBridgeSpanPlan(a[0],a[1],b[0],b[1],1,{skipCost:true});return{error:p.error,cells:p.count};};
  world(3);
  const out={straight:plan([-1,0],[3,0]),slant:plan([-1,0],[3,3]),diagonal:plan([-1,0],[3,4]),five:null,wide:null};
  world(4);out.five=plan([-1,0],[4,5]);world(5);out.wide=plan([-1,0],[5,0]);out.wideDiagonal=plan([-1,0],[5,6]);
  // walk over the four-by-four diagonal
  world(3);placeBridgeSpan(1,-1,0,3,4,{suppressNotes:true,editor:true});for(let i=0;i<200&&gameData.constructionJobs.length;i++)wodUpdateConstruction(1);
  gameData._wodPfVer++;gameData.landGeometryRevision++;
  const s=h(-3,-2),g=h(5,6),u=createUnitAt('light',s.x,s.y,1,{startSpawn:true});u.x=s.x;u.y=s.y;u.isGeneral=false;gameData.unitSpatialGrid=buildUnitSpatialGrid();
  gameData.selection=[u];issueMoveOrder({x:g.x,y:g.y});wodPumpPlayerOrderQueue();let wet=0;
  for(let i=0;i<70*20;i++){gameData.unitSpatialGrid=buildUnitSpatialGrid();wodBeginSimPfBudget(1);update(.05);wodDrainAiMoveQueue();const c=getNearestHexToPoint(u.x,u.y);if(c&&isWaterHex(c)&&!wodUnitOnBridgeDeck(u))wet+=.05;}
  out.walk={bridges:gameData.bridges.length,arrived:Math.hypot(u.x-g.x,u.y-g.y)<(gameData.hexRadius||20)*1.6,wet:Math.round(wet*10)/10,hp:Math.round(u.hp)};
  return out;});
 console.log(JSON.stringify(res));
 for(const k of ['straight','slant','diagonal'])assert(!res[k].error&&res[k].cells===3,k+' over three cells of water is allowed: '+JSON.stringify(res[k]));
 assert(!res.five.error&&res.five.cells===4,'a five-by-five diagonal over four cells is allowed: '+JSON.stringify(res.five));
 assert(/Too long/.test(res.wide.error||'')&&/Too long/.test(res.wideDiagonal.error||''),'five cells of water are too long straight or slanted: '+JSON.stringify([res.wide,res.wideDiagonal]));
 assert(res.walk.bridges===1&&res.walk.arrived&&res.walk.wet===0&&res.walk.hp>0,'infantry walks over the diagonal bridge dry: '+JSON.stringify(res.walk));
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
