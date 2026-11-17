'use strict';
// The Stop order (unit card button and the H key): selected units drop their march, waypoints, queued move and attack
// order and hold where they stand; a routed unit keeps running. Screenshots of the unit card at desktop and phone width.
const H=require('./lib/harness');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/stop-order');fs.mkdirSync(OUT,{recursive:true});
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),errors=[],results={};
try{
 for(const view of [{name:'desktop',width:1440,height:960},{name:'phone',width:390,height:844}]){
  const context=await browser.newContext({viewport:{width:view.width,height:view.height},hasTouch:true}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.stack));
  await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:60000});
  await page.evaluate(()=>{
   setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
   window.h=(q,r=0)=>gameData.hexes[q+','+r];
   window.unit=(q,r=0,type='light',owner=1)=>{const p=h(q,r),u=createUnitAt(type,p.x,p.y,owner,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
   window.world=()=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(28);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;gameData.entities=[];gameData.cities=[];gameData.selection=[];for(const p of gameData.hexList){p.type='grass';p.owner=p.q<0?1:2;}wodMarkTerrainPoliticalDirty?.();};
   window.refresh=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();gameData._generalAuraCache=null;gameData._citySupplyCache=null;};
   window.sim=seconds=>{for(let i=0;i<seconds*20;i++){wodBeginSimPfBudget(gameData.entities.length);update(.05);wodDrainAiMoveQueue();}};
  });
  if(view.name==='desktop'){
   results.march=await page.evaluate(()=>{world();const u=unit(-6);refresh();assignUnitMoveAlongWaypoints(u,[h(-16)]);sim(3);const moving=!!u.target;gameData.selection=[u];const n=wodIssueStopOrder();const x=u.x,y=u.y;sim(6);
    return{moving,n,target:u.target,path:u.path,orderTarget:u.orderTarget,holding:u.holding,drift:Math.hypot(u.x-x,u.y-y)};});
   assert(results.march.moving&&results.march.n===1&&!results.march.target&&!results.march.path&&!results.march.orderTarget&&results.march.holding&&results.march.drift<2,JSON.stringify(results.march));
   results.attack=await page.evaluate(()=>{world();const u=unit(-6),e=unit(6,0,'heavy',2);e.damage=0;refresh();wodSetPreferredTarget(1,[u.uid],e.uid);sim(2);const chasing=!!u._wodAttackOrder;gameData.selection=[u];wodIssueStopOrder();const x=u.x;sim(6);
    return{chasing,order:u._wodAttackOrder,preferred:u.preferredTargetUid,drift:Math.abs(u.x-x)};});
   assert(results.attack.chasing&&!results.attack.order&&!results.attack.preferred&&results.attack.drift<2,JSON.stringify(results.attack));
   results.queued=await page.evaluate(()=>{world();const u=unit(-6);refresh();wodQueuePlayerMoveOrder(u,[h(-16)]);gameData.selection=[u];wodIssueStopOrder();wodPumpPlayerOrderQueue();const x=u.x;sim(4);return{target:u.target,drift:Math.abs(u.x-x)};});
   assert(!results.queued.target&&results.queued.drift<2,JSON.stringify(results.queued));
   results.routed=await page.evaluate(()=>{world();const u=unit(-6);refresh();u.moraleBroken=true;u.retreating=true;gameData.selection=[u];return{n:wodIssueStopOrder(),retreating:u.retreating};});
   assert(results.routed.n===0&&results.routed.retreating,JSON.stringify(results.routed));
   results.enemy=await page.evaluate(()=>{world();const e=unit(6,0,'light',2);refresh();assignUnitMoveAlongWaypoints(e,[h(14)]);gameData.selection=[e];return{n:wodIssueStopOrder(),target:!!e.target};});
   assert(results.enemy.n===0&&results.enemy.target,'an enemy unit is not stopped: '+JSON.stringify(results.enemy));
   await page.evaluate(()=>{world();window.k=unit(-6);refresh();assignUnitMoveAlongWaypoints(k,[h(-16)]);gameData.selection=[k];});
   await page.keyboard.press('h');results.key=await page.evaluate(()=>({target:!!k.target,holding:k.holding}));
   assert(!results.key.target&&results.key.holding,'H stops the selection: '+JSON.stringify(results.key));
  }
  // the button on the unit card
  await page.evaluate(()=>{world();window.b=unit(-3);refresh();assignUnitMoveAlongWaypoints(b,[h(-14)]);for(const u of gameData.entities){u._drawX=u.x;u._drawY=u.y;}
   UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.style.display='block';gameData.camera={zoom:2,x:b.x*2-innerWidth/2,y:b.y*2-innerHeight/2};
   gameData.selection=[b];b.selected=true;_infoCardUiThrottle.s=null;syncInfoCardPanel();draw();});
  const btn=page.locator('#infoCard .info-order-btn[data-mo="stop"]');
  const shown=await btn.isVisible();
  if(shown){const box=await btn.boundingBox();results[view.name+'Button']={w:Math.round(box.width),h:Math.round(box.height)};await btn.click();}
  else results[view.name+'Button']='hidden';
  results[view.name+'Click']=await page.evaluate(()=>({target:!!b.target,holding:b.holding}));
  const row=await page.evaluate(()=>{const r=document.querySelector('#infoCard .info-mobile-orders-row');if(!r||!r.offsetParent)return null;const kids=[...r.children].filter(c=>c.offsetParent);return{buttons:kids.map(c=>c.dataset.mo),overflow:kids.some(c=>c.scrollWidth>c.clientWidth+1),rowW:Math.round(r.getBoundingClientRect().width)};});
  results[view.name+'Row']=row;
  await page.screenshot({path:path.join(OUT,'card-'+view.name+'.png')});
  if(shown)assert(!results[view.name+'Click'].target&&results[view.name+'Click'].holding,view.name+' button stops the unit');
  if(row)assert(!row.overflow&&row.buttons.includes('stop'),view.name+' orders row: '+JSON.stringify(row));
  await context.close();
 }
 assert.equal(errors.length,0,errors.join('\n'));
 console.log(JSON.stringify(results,null,1));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
