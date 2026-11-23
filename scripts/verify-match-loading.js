'use strict';
// The match loading screen (js/game.js wodMatchLoadBegin ... wodWarmMatchForPlay): a skirmish started from Setup opens
// behind it; the clock does not run while it is up (speed 0, no end checks); its bar only moves forward, through the real
// steps (map, terrain, supply, view), and reaches 100%; it lifts once the match is ready, with the terrain and borders
// already painted, and the match then runs at normal speed. No other loading overlay shows on top of it meanwhile.
const H=require('./lib/harness');
const assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser();
try{
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 await context.routeWebSocket(/.*/,socket=>{socket.onMessage(()=>{});socket.send(JSON.stringify({t:'welcome',online:1,lobbies:[]}));});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 await page.waitForFunction(()=>typeof startGame==='function'&&!window._wodBootBusy&&!window._wodMenuBootstrapBusy&&gameState==='MENU',null,{timeout:180000});
 await page.evaluate(()=>{try{wodDismissChangelogPopup();}catch(e){}showPanel('setup');});
 await page.waitForFunction(()=>!wodIsMapPreviewGenerating(),null,{timeout:180000});
 await page.evaluate(()=>{
  const S=window.__ml={samples:[],steps:[]};const el=document.getElementById('wodMatchLoadOverlay');
  const iv=setInterval(()=>{
   const bar=document.getElementById('wodMatchLoadBarInner'),m=/matrix\(([-\d.e]+)/.exec(getComputedStyle(bar).transform||'');
   const cap=document.getElementById('wodMatchLoadCaption').textContent;
   S.samples.push({up:!el.classList.contains('hidden')&&!el.classList.contains('wod-match-load-out'),bar:m?+m[1]:0,speed:gameData.speed,ready:!!gameData._matchReadyForEndChecks,
    other:['wodMapGenOverlay','wodBootOverlay'].some(id=>{const o=document.getElementById(id);return o&&!o.classList.contains('hidden')&&getComputedStyle(o).display!=='none';}),
    painted:typeof terrainNeedsUpdate!=='undefined'&&!terrainNeedsUpdate});
   if(!S.steps.length||S.steps[S.steps.length-1]!==cap)S.steps.push(cap);
   if(gameData._matchReadyForEndChecks&&el.classList.contains('hidden')){clearInterval(iv);S.done=true;}
  },25);
  startGame('ai');
 });
 await page.waitForFunction(()=>window.__ml.done,null,{timeout:180000});
 await page.waitForTimeout(1500);
 const res=await page.evaluate(()=>{const S=window.__ml,up=S.samples.filter(s=>s.up);let back=0;for(let i=1;i<S.samples.length;i++)if(S.samples[i].bar<S.samples[i-1].bar-.01&&S.samples[i].up)back++;
  const firstReady=S.samples.find(s=>s.ready);
  return{n:S.samples.length,upN:up.length,steps:S.steps,maxBar:Math.max(...S.samples.map(s=>s.bar)),back,ranWhileUp:up.filter(s=>s.speed>0&&!s.ready).length,readyWhileUpPainted:firstReady?firstReady.painted:null,
   otherWhileUp:up.filter(s=>s.other).length,speedAfter:gameData.speed,state:gameState,clock:gameData._aiEconomyClock||0};});
 console.log(JSON.stringify(res));
 assert(res.upN>5,'the loading screen is up while the match loads: '+JSON.stringify(res));
 assert.equal(res.ranWhileUp,0,'the clock does not run while the loading screen is up');
 assert(res.maxBar>.99,'the bar reaches 100%: '+res.maxBar);
 assert.equal(res.back,0,'the bar never goes backwards');
 for(const s of ['Generating the map','Painting the terrain','Laying supply lines','Readying the battlefield','Ready'])assert(res.steps.includes(s),'step shown: '+s+' '+JSON.stringify(res.steps));
 assert.equal(res.readyWhileUpPainted,true,'the terrain and borders are painted before play starts');
 assert.equal(res.otherWhileUp,0,'no other loading overlay shows over the match loading screen');
 assert(res.state==='PLAYING'&&res.speedAfter===1&&res.clock>0,'the match runs at normal speed once the screen lifts: '+JSON.stringify(res));
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('match loading screen: shown, steps through the work, clock held until ready');
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
