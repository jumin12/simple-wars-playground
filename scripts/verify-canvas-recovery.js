'use strict';
// When the system takes a canvas back (graphics memory short, the GPU process restarted) the map layers come back blank.
// A running skirmish: the terrain caches are wiped and reported lost for half a second, then given back. The map must be
// drawn again (it used to stay black for the rest of the match), with one notice. The desktop app also reloads the game
// when its page process dies (desktop/main.js, render-process-gone; not exercised here).
const H=require('./lib/harness');
const assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:90000});
 await page.waitForTimeout(2000);
 const sample=()=>page.evaluate(()=>{const c=document.getElementById('gameCanvas'),t=document.createElement('canvas');t.width=32;t.height=20;const x=t.getContext('2d');x.drawImage(c,0,0,32,20);const d=x.getImageData(0,0,32,20).data;let s=0;const col=new Set();for(let i=0;i<d.length;i+=4){s+=d[i]+d[i+1]+d[i+2];col.add(d[i]>>4<<8|d[i+1]>>4<<4|d[i+2]>>4);}return{bright:Math.round(s/(d.length/4)/3),colours:col.size};});
 const before=await sample();
 await page.evaluate(()=>{window.__lost=true;const orig=terrainCtx.isContextLost?.bind(terrainCtx);terrainCtx.isContextLost=()=>window.__lost||(orig?orig():false);
  for(const [c,g] of [[terrainCanvas,terrainCtx],[terrainBaseCanvas,terrainBaseCtx]]){g.fillStyle='#000';g.fillRect(0,0,c.width,c.height);}
  window.__notes=[];const sn=showNotification;showNotification=function(m){window.__notes.push(m);return sn.apply(this,arguments);};});
 await page.waitForTimeout(500);
 const during=await page.evaluate(()=>window.__notes.length);
 await page.evaluate(()=>{window.__lost=false;});await page.waitForTimeout(2500);
 const after=await sample(),notes=await page.evaluate(()=>window.__notes);
 console.log(JSON.stringify({before,after,during,notes}));
 assert(before.colours>10,'the map is drawn to begin with');
 assert(after.colours>=before.colours*.6&&Math.abs(after.bright-before.bright)<25,'after the graphics come back the map is drawn again: '+JSON.stringify({before,after}));
 assert(during===0&&notes.filter(n=>/reset the graphics/.test(n)).length===1,'one notice, once the graphics are back: '+JSON.stringify(notes));
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
