'use strict';
// Land troops ordered to dry ground across water go there. Two islands across a three-cell strait (west q<=-2, east q>=2).
// A click on the east island used to give no formation slot ("No reachable formation space") because only the unit's own
// island counted, so the order was dropped. Now: one infantry, a tank, a group of four and a line drawn on the far shore all
// cross and stand on the east island; the slots stay on the island that was clicked. With a land causeway three cells
// north of the crossing the infantry walks round by land and never gets wet. Across a bay it walks round to the short
// crossing (two cells of water) instead of swimming the six straight across from the beach nearest it, as it used to.
// (A town of ours stands on each island.)
const H=require('./lib/harness');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/cross-water-orders');fs.mkdirSync(OUT,{recursive:true});
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:60000});
 await page.evaluate(()=>{
  setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
  window.h=(q,r=0)=>gameData.hexes[q+','+r];
  window.unit=(q,r=0,type='light')=>{const p=h(q,r),u=createUnitAt(type,p.x,p.y,1,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
  window.world=causeway=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(28);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;gameData.entities=[];gameData.cities=[];gameData.selection=[];
   for(const p of gameData.hexList){p.type='grass';p.owner=1;p.cityId=null;if(Math.abs(p.q)<=1&&!(causeway&&p.r>=-5&&p.r<=-3)){p.type='water';p.owner=0;}}
   // a town of ours on each island, so the troops are in supply once ashore
   for(const [id,q] of [['home',-11],['east',11]]){const t=h(q,0);t.type='urban';t.cityId=id;gameData.cities.push({id,name:id,q,r:0,x:t.x,y:t.y,owner:1,hp:1000,maxHp:1000});}
   gameData._wodPfVer=(gameData._wodPfVer||0)+1;gameData.landGeometryRevision=(gameData.landGeometryRevision||0)+1;};
  // bay: our land is a band along the top (r<=-3) and a column down the west (q<=-6); the target island q -3..2, r 4..8.
  window.bay=()=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(28);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;gameData.entities=[];gameData.cities=[];gameData.selection=[];
   for(const p of gameData.hexList){const ours=p.r<=-3||p.q<=-6,isle=p.q>=-3&&p.q<=2&&p.r>=4&&p.r<=8;p.type=ours||isle?'grass':'water';p.owner=ours||isle?1:0;p.cityId=null;}
   for(const [id,q,r] of [['home',-12,-8],['isle',0,7]]){const t=h(q,r);t.type='urban';t.cityId=id;gameData.cities.push({id,name:id,q,r,x:t.x,y:t.y,owner:1,hp:1000,maxHp:1000});}
   gameData._wodPfVer=(gameData._wodPfVer||0)+1;gameData.landGeometryRevision=(gameData.landGeometryRevision||0)+1;};
  const refresh=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();gameData._generalAuraCache=null;gameData._citySupplyCache=null;};
  window.go=(make,order,seconds=70,causeway=false)=>{if(causeway==='bay')bay();else world(causeway);const us=make();refresh();gameData.selection=us.slice();
   const sn=window.showNotification;let note='';window.showNotification=m=>{note=m;};try{order(us);}finally{window.showNotification=sn;}wodPumpPlayerOrderQueue();
   const slots=us.map(u=>{const o=u.orderTarget,c=o&&getNearestHexToPoint(o.x,o.y);return c?c.q:null;});const wet=us.map(()=>0);
   for(let i=0;i<seconds*20;i++){refresh();wodBeginSimPfBudget(gameData.entities.length);update(.05);wodDrainAiMoveQueue();us.forEach((u,j)=>{const c=getNearestHexToPoint(u.x,u.y);if(c&&isWaterHex(c))wet[j]+=.05;});}
   return{note,slots,end:us.map((u,j)=>{const c=getNearestHexToPoint(u.x,u.y);return{q:c.q,r:c.r,dry:!isWaterHex(c),moving:!!u.target,hp:Math.round(100*u.hp/u.maxHp),wet:Math.round(wet[j])};})};};
  window.click=(q,r)=>us=>{const p=h(q,r);issueMoveOrder({x:p.x,y:p.y});};
  window.line=(a,b)=>us=>{const p=h(...a),q=h(...b);issueLineFormationOrder({x:p.x,y:p.y},{x:q.x,y:q.y});};
 });
 const res={};
 res.single=await page.evaluate(()=>go(()=>[unit(-6,0)],click(6,0)));
 res.tank=await page.evaluate(()=>go(()=>[unit(-6,3,'heavy')],click(6,3)));
 res.group=await page.evaluate(()=>go(()=>[unit(-6,0),unit(-6,1),unit(-7,0),unit(-7,1)],click(6,0),80));
 await page.evaluate(()=>{UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.style.display='block';gameData.camera={zoom:1,x:-640,y:-400};for(const u of gameData.entities){u._drawX=u.x;u._drawY=u.y;}wodMarkTerrainFullDirty?.();updateTerrainCache?.();draw();});
 await page.screenshot({path:path.join(OUT,'group-across.png')});
 res.line=await page.evaluate(()=>go(()=>[unit(-6,-1),unit(-6,1),unit(-7,0)],line([5,-2],[5,2]),80));
 res.causeway=await page.evaluate(()=>go(()=>[unit(-5,0)],click(5,0),90,true));
 res.bay=await page.evaluate(()=>go(()=>[unit(0,-4)],click(0,6),120,'bay'));
 console.log(JSON.stringify(res));
 for(const k of ['single','tank','group','line'])assert(!/No reachable/.test(res[k].note)&&res[k].slots.every(q=>q!=null&&q>=2),k+': the order across the water is given, its slots on the east island: '+JSON.stringify(res[k]));
 for(const k of ['single','tank','group','line'])assert(res[k].end.every(e=>e.dry&&e.q>=2&&!e.moving&&e.hp>50),k+': the troops crossed and stand on the east island: '+JSON.stringify(res[k].end));
 assert(res.causeway.end[0].dry&&res.causeway.end[0].q>=2&&res.causeway.end[0].wet===0,'with a causeway close by the infantry walks round by land: '+JSON.stringify(res.causeway));
 assert(res.bay.end[0].dry&&res.bay.end[0].r>=4&&res.bay.end[0].wet<=20&&res.bay.end[0].hp>80,'across a bay the infantry walks round to the short crossing: '+JSON.stringify(res.bay));
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
