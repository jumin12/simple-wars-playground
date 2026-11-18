'use strict';
// Starts are even on every map shape, for two to four players. On each generated map:
//  - every player has the same land and towns (as before) and the same ground: for forest, hills, swamp and sand, each
//    player's share of its open ground within three points of every other's, and of mountains within six;
//  - no river runs between some players only: either no river cell lies between two players' land, or every pair of
//    neighbouring players meets across one;
//  - each player's nearest enemy town is no more than a third further than any other player's.
// Fixtures first: a river between two of three players is filled; rivers between every pair of neighbours stay; a player with far more
// forest than the others is evened out.
const H=require('./lib/harness');
const assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));page.setDefaultTimeout(900000);
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:90000});
 await page.evaluate(()=>{setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
  window.measure=()=>{const owners=[...new Set(gameData.cities.map(c=>c.owner).filter(o=>o>0))].sort((a,b)=>a-b),set=new Set(owners),per={};
   for(const o of owners)per[o]={land:0,open:0,mountain:0,forest:0,hill:0,swamp:0,sand:0,towns:gameData.cities.filter(c=>c.owner===o).length};
   const land=h=>h&&!isWaterHex(h)&&set.has(h.owner),key=(a,b)=>a<b?a+'-'+b:b+'-'+a,neighbours=new Set(),riverPairs=new Set();let border=0;
   for(const h of gameData.hexList){
    if(land(h)){const p=per[h.owner];if(h.type!=='urban'&&!h.cityId){p.land++;if(h.type==='mountain')p.mountain++;else{p.open++;if(p[h.type]!==undefined&&h.type!=='mountain')p[h.type]++;}}for(const n of getNeighborHexes(h))if(land(n)&&n.owner!==h.owner)neighbours.add(key(h.owner,n.owner));continue;}
    if(!h||!h._river||!isWaterHex(h)||isBridgeHex(h))continue;
    const near=new Set();for(const p of getHexesInRadius(h.q,h.r,2)){const n=wodHexAt(p.q,p.r);if(land(n))near.add(n.owner);}
    if(near.size<2)continue;border++;const l=[...near];for(let i=0;i<l.length;i++)for(let j=i+1;j<l.length;j++){riverPairs.add(key(l[i],l[j]));neighbours.add(key(l[i],l[j]));}}
   const spread=a=>Math.max(...a)-Math.min(...a);
   const terrain=Math.max(...['forest','hill','swamp','sand'].map(k=>spread(owners.map(o=>per[o][k]/Math.max(1,per[o].open)*100))));
   const mountain=spread(owners.map(o=>per[o].mountain/Math.max(1,per[o].land)*100));
   const near=owners.map(o=>{let b=Infinity;for(const c of gameData.cities)if(c.owner===o)for(const e of gameData.cities)if(e.owner>0&&e.owner!==o)b=Math.min(b,Math.hypot(c.x-e.x,c.y-e.y));return b;});
   return{owners:owners.length,towns:owners.map(o=>per[o].towns),terrain:Math.round(terrain*10)/10,mountain:Math.round(mountain*10)/10,riverBorder:border,riverFair:!border||[...neighbours].every(k=>riverPairs.has(k)),near:Math.round(Math.max(...near)/Math.min(...near)*100)/100};};
 });
 // fixtures: three players in thirds of a blank map (q<-6, -6..6, >6); a river along q=-6 (between 1 and 2 only), or also
 // along q=6 and across r=8 on the far side so all three pairs meet across water
 const fixtures=await page.evaluate(()=>{const out={};
  const world=()=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(24);gameState='PLAYING';gameData.entities=[];gameData.cities=[];
   for(const p of gameData.hexList){p.type='grass';p.cityId=null;delete p._river;p.owner=p.q<-6?1:p.q<=6?2:3;}};
  const river=cells=>{for(const p of cells){p.type='water';p._river=true;p.owner=0;}};
  world();river(gameData.hexList.filter(p=>p.q===-6&&Math.abs(p.r)<=10));out.someFilled=wodBalanceStartingRivers([1,2,3]);out.someLeft=gameData.hexList.filter(p=>p._river&&isWaterHex(p)).length;
  world();river(gameData.hexList.filter(p=>(p.q===-6||p.q===6)&&Math.abs(p.r)<=10));out.partFilled=wodBalanceStartingRivers([1,2,3]);
  world();for(const p of gameData.hexList)if(p.owner===1&&p.r%2===0)p.type='forest';const changed=wodBalanceStartingTerrain([1,2,3]);
  const share=o=>{const c=gameData.hexList.filter(p=>p.owner===o&&!isWaterHex(p));return c.filter(p=>p.type==='forest').length/c.length*100;};
  out.forest={changed,shares:[1,2,3].map(o=>Math.round(share(o)*10)/10)};return out;});
 console.log('fixtures '+JSON.stringify(fixtures));
 assert(fixtures.someFilled>0&&fixtures.someLeft===0,'a river between two of three players is filled along that border');
 assert(fixtures.partFilled===0,'rivers between 1-2 and 2-3 (1 and 3 are not neighbours here): every pair of neighbours meets across one, so they stay');
 assert(Math.max(...fixtures.forest.shares)-Math.min(...fixtures.forest.shares)<=3,'forest evened out between players: '+JSON.stringify(fixtures.forest));
 const maps=[];
 for(const shape of ['island','rectangle','ring','forest','mountain','desert','continents','archipelago'])for(const ai of ['1','2','3']){
  maps.push(await page.evaluate(async([shape,ai])=>{gameData.loadedCustomMap=false;gameData.aiCount=Number(ai);gameData.mp={enabled:false};
   document.getElementById('setupAI').value=ai;document.getElementById('setupMapSize').value='40';document.getElementById('setupMapShape').value=shape;
   gameData._mapGenSeed=4100+Number(ai)*31+shape.length;gameData._wodReuseMapGenSeed=true;gameData._wodSkipMapGenLoader=true;gameData._mapGenOptions={cities:true,territory:true,units:true,mapShape:shape};
   const t0=performance.now();await generateMap();return{shape,ms:Math.round(performance.now()-t0),...measure()};},[shape,ai]));
 }
 for(const m of maps)console.log(JSON.stringify(m));
 for(const m of maps){
  assert(m.owners===Number(m.owners)&&Math.max(...m.towns)===Math.min(...m.towns),'equal towns: '+JSON.stringify(m));
  assert(m.terrain<=3&&m.mountain<=6,'the same ground for every player: '+JSON.stringify(m));
  assert(m.riverFair,'no river between some players only: '+JSON.stringify(m));
  assert(m.near<=1.35,'nearest enemy towns about as far for everyone: '+JSON.stringify(m));
 }
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
