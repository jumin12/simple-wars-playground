'use strict';
// Land units in the water (pushed in by a fight, or ordered in) can walk back out: ordered ashore from 1-6 cells out, in a
// group, from a one-cell channel and from the middle of a lake; left in the water with no order they wade to the nearest
// shore, a routed one too; sent into the water on purpose they stay. Coast: land at q<0, sea at q>=0; also a narrow inlet and
// a small lake.
const H=require('./lib/harness'),assert=require('assert/strict');
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.stack);console.log('PAGEERROR '+e.message);});page.on('crash',()=>console.log('PAGE CRASHED'));page.on('framenavigated',f=>{if(f===page.mainFrame())console.log('NAVIGATED '+f.url());});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE '+m.text().slice(0,300));});
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:60000});
 await page.evaluate(()=>{
  setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
  window.h=(q,r=0)=>gameData.hexes[q+','+r];
  window.unit=(q,r=0,type='light',owner=1)=>{const p=h(q,r),u=createUnitAt(type,p.x,p.y,owner,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
  window.world=(shape)=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(28);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;gameData.entities=[];gameData.cities=[];gameData.selection=[];window.__town=true;
   for(const p of gameData.hexList){p.type='grass';p.owner=1;
    if(shape==='coast'&&p.q>=0){p.type='water';p.owner=0;}
    if(shape==='inlet'&&p.q>=0&&Math.abs(p.r)<=0){p.type='water';p.owner=0;}           // a one-cell-wide channel into the land
    if(shape==='lake'&&Math.abs(p.q)<=2&&Math.abs(p.r)<=2){p.type='water';p.owner=0;}  // a 5x5 lake
   }
   {const p=h(-11,0);p.type='urban';p.cityId='home';p.owner=1;gameData.cities.push({id:'home',name:'Home',q:-11,r:0,x:p.x,y:p.y,owner:1,hp:1000,maxHp:1000});}
   wodMarkTerrainPoliticalDirty?.();gameData._wodPfVer=(gameData._wodPfVer||0)+1;gameData.landGeometryRevision=(gameData.landGeometryRevision||0)+1;};
  window.refresh=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();gameData._generalAuraCache=null;gameData._citySupplyCache=null;};
  window.sim=seconds=>{for(let i=0;i<seconds*20;i++){wodBeginSimPfBudget(gameData.entities.length);update(.05);wodDrainAiMoveQueue();}};
  window.order=(units,q,r=0)=>{const pt=h(q,r);const slots=wodGroupDestinationSlots(units,{x:pt.x,y:pt.y});wodApplyPlayerMoveOrders(units,u=>slots.has(u)?[slots.get(u)]:null);wodPumpPlayerOrderQueue();};
  window.where=u=>{const c=getNearestHexToPoint(u.x,u.y);return{q:c?.q,r:c?.r,dry:!!c&&!isWaterHex(c),hp:Math.round(u.hp),target:!!u.target,stuck:Math.round((u.stuckTimer||0)*10)/10};};
 });
 const cases=[
  ['coast','CONTROL: on land, ordered along the land',()=>{const u=unit(-6,0);refresh();order([u],-12,0);return [u];}],
  ['coast','pushed 1 cell out, ordered ashore',()=>{const u=unit(0,2);refresh();order([u],-6,2);return [u];}],
  ['coast','pushed 3 cells out, ordered ashore',()=>{const u=unit(2,-3);refresh();order([u],-6,-3);return [u];}],
  ['coast','6 cells out, ordered ashore',()=>{const u=unit(5,4);refresh();order([u],-6,4);return [u];}],
  ['coast','pushed 1 cell out, no order',()=>{const u=unit(0,-1);refresh();return [u];}],
  ['coast','a group of 4 in the water, ordered ashore',()=>{const us=[unit(1,0),unit(1,1),unit(2,0),unit(2,1)];refresh();order(us,-7,0);return us;}],
  ['coast','ordered into the water then back',()=>{const u=unit(-3,6);refresh();order([u],3,6);sim(25);order([u],-6,6);return [u];}],
  ['coast','tank pushed 2 cells out, ordered ashore',()=>{const u=unit(1,-6,'heavy');refresh();order([u],-6,-6);return [u];}],
  ['coast','ordered ashore to a cell along the coast',()=>{const u=unit(2,7);refresh();order([u],-1,-5);return [u];}],
  ['inlet','in a one-cell channel, ordered out sideways',()=>{const u=unit(4,0);refresh();order([u],4,5);return [u];}],
  ['inlet','in a one-cell channel, ordered back up it',()=>{const u=unit(6,0);refresh();order([u],-5,0);return [u];}],
  ['lake','in the middle of a lake, ordered out',()=>{const u=unit(0,0);refresh();order([u],6,0);return [u];}],
  ['lake','at a lake edge, no order',()=>{const u=unit(2,1);refresh();return [u];}],
  ['coast','routed in the water with no order (broke while swimming)',()=>{const u=unit(2,-10);u.morale=4;u.moraleBroken=true;refresh();return [u];}],
  ['coast','KEEP: sent into the water on purpose, no further order',()=>{const u=unit(-3,-8);refresh();order([u],3,-8);return [u];}]
 ];
 const out=[];
 for(let i=0;i<cases.length;i++){
const res=await page.evaluate(([shape,i])=>{world(shape);const fn=window['case'+i];return null;},[cases[i][0],i]);
  await page.evaluate(`window.__units=(${cases[i][2].toString()})();0`);
  const r=await page.evaluate(()=>{const us=window.__units;const start=us.map(where);const ordered=us.map(u=>({target:!!u.target,orderTarget:!!u.orderTarget,path:u.path?.length||0,queued:wodPlayerOrderQueue.some(j=>j.unit===u),intoWater:!!u._wodOrderIntoWater,shoreExit:!!u._wodShoreExitRouting}));window.__ord=ordered;sim(40);return{start,ordered:window.__ord,end:us.map(where)};});
  const keep=/KEEP/.test(cases[i][1]);out.push({case:cases[i][0]+': '+cases[i][1],...r,ok:keep?r.end.every(e=>!e.dry):r.end.every(e=>e.dry)});
 }
 for(const o of out)console.log((o.ok?'OK   ':'STUCK')+' '+o.case+' | end '+o.end.map(e=>`(${e.q},${e.r}) ${e.dry?'dry':'WET'} hp${e.hp}${e.target?' moving':''}${e.stuck?' stuck'+e.stuck:''}`).join('; ')+' | after order '+JSON.stringify(o.ordered[0]));
 assert(out.every(o=>o.ok),'units stuck in the water');assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
