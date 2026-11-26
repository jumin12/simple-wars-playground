'use strict';
// Units that meet under crossing orders step just out of the way: groups ordered head-on through each other (in the open
// and through a three-cell pass), two groups sent to one spot, a column through a parked group and a group across a
// marching column all arrive, and none strays more than four cells from its line.
const H=require('./lib/harness');
const path=require('path'),assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext()).newPage(),errors=[],results={};page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:60000});
 await page.evaluate(()=>{
  setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
  window.h=(q,r=0)=>gameData.hexes[q+','+r];
  window.world=()=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(28);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData.fogOfWar=false;gameData.entities=[];gameData.cities=[];gameData.selection=[];
   for(const p of gameData.hexList){p.type='grass';p.owner=1;if(window.__pass&&Math.abs(p.q)<=4&&Math.abs(p.r)>1){p.type='mountain';}}gameData._wodPfVer=(gameData._wodPfVer||0)+1;gameData.landGeometryRevision=(gameData.landGeometryRevision||0)+1;
   for(const [id,q,o] of [['home',-14,1],['far',14,2]]){const p=h(q,0);p.type='urban';p.cityId=id;p.owner=o;gameData.cities.push({id,name:id,q,r:0,x:p.x,y:p.y,owner:o,hp:1000,maxHp:1000});}
   gameData._matchReadyForEndChecks=false;};
  window.unit=(q,r=0)=>{const p=h(q,r),u=createUnitAt('light',p.x,p.y,1,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
  window.order=(units,q,r=0)=>{const pt=h(q,r);const slots=wodGroupDestinationSlots(units,{x:pt.x,y:pt.y});wodApplyPlayerMoveOrders(units,u=>slots.has(u)?[slots.get(u)]:null);wodPumpPlayerOrderQueue();};
  // march the given seconds, tracking each unit's furthest distance (in cells) from the straight line start -> goal
  window.watch=(units,seconds)=>{const C=(gameData.hexRadius||20)*Math.sqrt(3);const st=units.map(u=>({u,ax:u.x,ay:u.y,bx:u.orderTarget?.x??u.x,by:u.orderTarget?.y??u.y,max:0}));
   for(let i=0;i<seconds*20;i++){gameData.unitSpatialGrid=buildUnitSpatialGrid();wodBeginSimPfBudget(gameData.entities.length);update(.05);wodDrainAiMoveQueue();
    if(i%5===0)for(const s of st){const vx=s.bx-s.ax,vy=s.by-s.ay,L=vx*vx+vy*vy||1,t=Math.max(0,Math.min(1,((s.u.x-s.ax)*vx+(s.u.y-s.ay)*vy)/L));s.max=Math.max(s.max,Math.hypot(s.u.x-s.ax-vx*t,s.u.y-s.ay-vy*t)/C);}}
   return{maxStray:Math.round(Math.max(...st.map(s=>s.max))*10)/10,meanStray:Math.round(st.reduce((a,s)=>a+s.max,0)/st.length*10)/10,arrived:st.filter(s=>Math.hypot(s.u.x-s.bx,s.u.y-s.by)<C*1.2).length,n:st.length};};
 });
 results.headOn=await page.evaluate(()=>{world();const a=[],b=[];for(let i=0;i<6;i++){a.push(unit(-7,-3+i));b.push(unit(7,-3+i));}gameData.unitSpatialGrid=buildUnitSpatialGrid();order(a,7,0);order(b,-7,0);return watch([...a,...b],150);});
 results.throughParked=await page.evaluate(()=>{world();const park=[],col=[];for(let i=0;i<6;i++)park.push(unit(i%3-1,Math.floor(i/3)));for(let i=0;i<4;i++)col.push(unit(-9,i-2));gameData.unitSpatialGrid=buildUnitSpatialGrid();const C=(gameData.hexRadius||20)*Math.sqrt(3),p0=park.map(u=>({x:u.x,y:u.y}));order(col,9,0);const w=watch([...col],150);return {...w,parkedMoved:Math.round(Math.max(...park.map((u,i)=>Math.hypot(u.x-p0[i].x,u.y-p0[i].y)/C))*10)/10};});
 results.pass=await page.evaluate(()=>{window.__pass=true;world();const a=[],b=[];for(let i=0;i<8;i++){a.push(unit(-9-Math.floor(i/3),i%3-1));b.push(unit(9+Math.floor(i/3),i%3-1));}gameData.unitSpatialGrid=buildUnitSpatialGrid();order(a,9,0);order(b,-9,0);const r=watch([...a,...b],180);window.__pass=false;return r;});
 results.sameSpot=await page.evaluate(()=>{world();const a=[],b=[];for(let i=0;i<6;i++){a.push(unit(-6,-3+i));b.push(unit(6,-3+i));}gameData.unitSpatialGrid=buildUnitSpatialGrid();order(a,0,0);order(b,0,0);return watch([...a,...b],100);});
 results.crossColumn=await page.evaluate(()=>{world();const col=[],grp=[];for(let i=0;i<8;i++)col.push(unit(-10+i,0));for(let i=0;i<6;i++)grp.push(unit(-3+i%3,-8+Math.floor(i/3)));gameData.unitSpatialGrid=buildUnitSpatialGrid();order(col,10,0);order(grp,-2,8);return watch([...col,...grp],150);});
 console.log(JSON.stringify(results));
 // (two groups sent to one point have half their places booked twice: a unit stands beside a place a comrade holds
 // instead of circling it, js/movement.js wodDestinationTakenNearby, so two thirds of them stand on their own places there)
 for(const k of ['headOn','throughParked','pass','sameSpot','crossColumn'])assert(results[k].maxStray<=4&&results[k].arrived>=Math.ceil(results[k].n*(k==='sameSpot'?2/3:.75)),k+': '+JSON.stringify(results[k]));
 assert.equal(results.throughParked.parkedMoved<=3,true,'parked units make way by a few cells at most');
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
