'use strict';
// Archipelago starts are fair island by island. Fixtures: an island where one player has two towns and another one is unfair;
// shared islands with equal towns each are fair; three players where one has a safe island of his own while the other two
// have every town on shared ground is unfair. Then real archipelago maps for two, three and four players: every island
// shared by players holds the same number of towns for each, and every player has the same number of towns.
const H=require('./lib/harness');
const assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));page.setDefaultTimeout(240000);
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/index.html',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>{const b=document.getElementById('wodBootOverlay'),m=document.getElementById('mainMenu');return b&&b.classList.contains('hidden')&&m&&!m.classList.contains('hidden');});
 const fixtures=await page.evaluate(()=>{wodDismissChangelogPopup?.();
  // islands three cells apart along q: A at q -14..-8, B at -4..2, C at 6..12 (r -4..4)
  const make=towns=>{WOD.makeBlankMap(20);gameData.entities=[];gameData.cities=[];gameData.mapShape='archipelago';
   for(const h of gameData.hexList){const inA=h.q>=-14&&h.q<=-8,inB=h.q>=-4&&h.q<=2,inC=h.q>=6&&h.q<=12;h.type=(inA||inB||inC)&&Math.abs(h.r)<=4?'grass':'water';h.cityId=null;h.owner=0;}
   const base={A:-11,B:-1,C:9};towns.forEach(([isl,owner],i)=>{const q=base[isl]+(i%2?1:-1)*(1+(i>>1)%2),r=((i*3)%7)-3,h=gameData.hexes[q+','+r];h.type='urban';gameData.cities.push({id:'t'+i,owner,q,r,x:h.x,y:h.y});});
   gameData._wodPfVer=(gameData._wodPfVer||0)+1;};
  const rows={};
  make([['A',1],['A',1],['A',2],['B',2]]);rows.lopsided=wodArchipelagoIslandsFair([1,2]);
  make([['A',1],['A',2],['B',1],['C',2]]);rows.sharedEven=wodArchipelagoIslandsFair([1,2]);
  make([['A',1],['A',1],['A',2],['A',2]]);rows.oneIsland=wodArchipelagoIslandsFair([1,2]);
  make([['A',1],['A',2],['A',3],['B',2],['B',3],['C',1]]);rows.exposed=wodArchipelagoIslandsFair([1,2,3]);
  make([['A',1],['A',2],['A',3],['B',1],['B',2],['B',3]]);rows.threeEven=wodArchipelagoIslandsFair([1,2,3]);
  return rows;});
 console.log('fixtures '+JSON.stringify(fixtures));
 assert(!fixtures.lopsided,'a lone town against two on one island is unfair');
 assert(fixtures.sharedEven&&fixtures.oneIsland&&fixtures.threeEven,'shared islands with equal towns each are fair');
 assert(!fixtures.exposed,'one player safe on his own island while the others have nothing but shared ground is unfair');
 const maps=[];
 for(const [ai,seed] of [[1,11],[1,29],[2,47],[3,83]]){
  await page.evaluate(([ai,seed])=>{const set=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v;};set('setupMapSize','40');set('setupMapShape','archipelago');set('setupAI',String(ai));
   const fog=document.getElementById('setupFogOfWar');if(fog)fog.checked=false;wodAbandonSoloPreviewForLaunch?.();gameData._soloMapPreviewMatchesStart=false;gameData._soloPreviewSnapshot=null;gameData.loadedCustomMap=false;gameData._wodReuseMapGenSeed=false;gameData._mapGenSeed=seed;startGame('ai');},[ai,seed]);
  await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks&&gameData.hexList.length>40);
  maps.push(await page.evaluate(()=>{setGameSpeed(0,true);const owners=[...new Set(gameData.cities.map(c=>c.owner).filter(o=>o>0))].sort();
   const towns={};for(const c of gameData.cities)if(c.owner>0)towns[c.owner]=(towns[c.owner]||0)+1;
   return{owners,towns,fair:wodArchipelagoIslandsFair(owners),rejections:gameData._mapGenValidation?.rejections||{}};}));
 }
 console.log('maps '+JSON.stringify(maps));
 for(const m of maps){assert(m.fair,'archipelago start fair island by island: '+JSON.stringify(m));
  const n=Object.values(m.towns);assert(n.length===m.owners.length&&Math.max(...n)===Math.min(...n)&&n[0]>=1,'every player starts with the same number of towns: '+JSON.stringify(m));}
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
