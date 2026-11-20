'use strict';
// Building sites under construction show their progress ring and time left to every player (js/render.js
// wodDrawConstructionJobs, drawn in the structures layer, so a multiplayer guest sees them too):
//  - your own sites of every kind;
//  - another player's or the computer's forts, hospitals, bridges, factories, farms and harbours, but under fog only
//    where you can see the ground;
//  - a multiplayer guest sees the host's sites and the computer's.
// And a building on a bridge's bank tile is drawn over the deck: bridges first, then forts (wodDrawStructuresLayer).
const H=require('./lib/harness'),assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:90000});
 const out=await page.evaluate(()=>{setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
  const h=(q,r=0)=>gameData.hexes[q+','+r];
  wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(24);gameState='PLAYING';gameData.menuAttractMode=false;gameData.entities=[];gameData.cities=[];gameData.bridges=[];gameData.forts=[];gameData.hospitals=[];
  for(const p of gameData.hexList){p.type='grass';p.owner=p.q<0?1:2;p.cityId=null;}
  const job=(q,owner,mode,left)=>{const p=h(q,3);return {id:'j'+q,owner,mode,q,r:3,x:p.x,y:p.y,total:30,remaining:left};};
  gameData.constructionJobs=[job(-6,1,'fort',11),job(4,2,'fort',22),job(8,2,'factory',23),job(-2,2,'recruit',24)];
  // a canvas stand-in that keeps the numbers written (each ring shows the seconds left)
  const seen=()=>{const texts=[];const ctx=new Proxy({},{get(t,k){if(k==='fillText')return s=>texts.push(String(s));if(k in t)return t[k];return ()=>{};},set(t,k,v){t[k]=v;return true;}});
   wodDrawConstructionJobs(ctx,true);return texts.sort().join(',');};
  const o={};
  gameData.fogOfWar=false;o.clear=seen();
  // fog: the factory at q=8 lies in unseen ground
  gameData.fogOfWar=true;gameData._fogVisible=new Set(gameData.hexList.filter(p=>p.q<6).map(getHexKey));o.fog=seen();
  // a guest in seat 2 of a match: the host's fort and its own
  gameData.fogOfWar=false;gameData.mp={enabled:true,isHost:false,localSlot:2,eliminatedSlots:[]};o.guest=seen();gameData.mp=null;
  // the structures layer draws bridges before forts
  const order=[],ob=drawBridgeSticker,of=drawFortSticker;
  drawBridgeSticker=function(){order.push('bridge');};drawFortSticker=function(){order.push('fort');};
  const b=h(0,0);gameData.bridges=[{x:b.x,y:b.y,angle:0,w:120,h:30,owner:1,hexKeys:[]}];gameData.forts=[{id:'f',owner:1,q:0,r:0,x:b.x,y:b.y}];
  try{wodDrawStructuresLayer(ctxForTest(),{camL:-1e5,camR:1e5,camT:-1e5,camB:1e5,camZ:1,culPad:0,wodCull:false,gfxLite:true,gfxDecorSkip:true});}catch(e){o.layerError=String(e).slice(0,200);}
  drawBridgeSticker=ob;drawFortSticker=of;o.order=order.join(',');
  function ctxForTest(){return new Proxy({},{get(t,k){if(k in t)return t[k];if(k==='measureText')return()=>({width:10});if(k==='createRadialGradient'||k==='createLinearGradient')return()=>({addColorStop(){}});return ()=>{};},set(t,k,v){t[k]=v;return true;}});}
  return o;});
 console.log(JSON.stringify(out));
 assert.equal(out.clear,'11,22,23','own and the computer\'s building sites show their rings (not its recruiting): '+out.clear);
 assert.equal(out.fog,'11,22','under fog, a computer site in unseen ground stays hidden: '+out.fog);
 assert.equal(out.guest,'11,22,23,24','a multiplayer guest sees the host\'s site and its own: '+out.guest);
 assert(out.order.indexOf('bridge')>=0&&out.order.indexOf('bridge')<out.order.indexOf('fort'),'bridges are drawn before (under) forts: '+out.order+(out.layerError?' '+out.layerError:''));
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
