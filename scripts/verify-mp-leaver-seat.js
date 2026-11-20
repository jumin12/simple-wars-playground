'use strict';
// A player leaving a multiplayer match (game.js confirmSurrender, the only way out of a match) hands their faction to the
// computer while the battle would go on without them (wodMpSurrenderConcedes): towns, ground and troops stay for the
// others to fight for. Only a surrender that ends the battle (everyone left on one side, not theirs) removes the faction.
// And a town that is nobody's (a faction that conceded, a map's empty towns) is taken like any other, by holding its
// streets (wodEvaluateAllCityCaptures skipped it, so it stayed nobody's for good).
const H=require('./lib/harness'),assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:90000});
 const out=await page.evaluate(()=>{setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();
  const h=(q,r=0)=>gameData.hexes[q+','+r];
  wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(20);gameState='PLAYING';gameData.menuAttractMode=false;gameData.fogOfWar=false;gameData.entities=[];gameData.cities=[];gameData.alliances=[];
  for(const p of gameData.hexList){p.type='grass';p.owner=p.q<-6?2:p.q>6?3:1;p.cityId=null;}
  const town=(q,owner,id)=>{const p=h(q,0);p.type='urban';p.cityId=id;p.owner=owner;const c={id,name:id,q,r:0,x:p.x,y:p.y,owner,hp:1000,maxHp:1000};gameData.cities.push(c);return c;};
  town(0,1,'Mine');town(-9,2,'West');town(9,3,'East');
  const o={};
  // seat 1 leaves a match of three sides: the computer takes it
  gameData.mp={enabled:true,isHost:false,localSlot:1,eliminatedSlots:[]};
  o.threeSides=wodMpSurrenderConcedes();
  // the other two are allies: leaving ends the battle, the faction goes
  gameData.alliances=[[2,3]];o.oneSideLeft=wodMpSurrenderConcedes();
  // an ally of ours is still fighting: the computer takes over beside them
  gameData.alliances=[[1,2]];o.allyFights=wodMpSurrenderConcedes();
  // one against one
  gameData.alliances=[];gameData.cities=gameData.cities.filter(c=>c.id!=='East');o.oneOnOne=wodMpSurrenderConcedes();
  gameData.mp=null;
  // a town nobody holds, its streets taken by seat 2's ground
  const free=town(4,0,'Free');const t=h(4,0);t.owner=0;for(const u of getCityUrbanTerrainHexes(free)){const x=gameData.hexes[getHexKey(u)];if(x)x.owner=0;}
  wodEvaluateAllCityCaptures();o.emptyStays=free.owner;
  for(const u of getCityUrbanTerrainHexes(free)){const x=gameData.hexes[getHexKey(u)];if(x)x.owner=2;}t.owner=2;
  wodEvaluateAllCityCaptures();o.taken=free.owner;
  return o;});
 console.log(JSON.stringify(out));
 assert.equal(out.threeSides,false,'leaving a match of three sides hands the faction to the computer');
 assert.equal(out.oneSideLeft,true,'leaving when the rest are all on one side concedes');
 assert.equal(out.allyFights,false,'leaving while an ally fights on hands the faction to the computer');
 assert.equal(out.oneOnOne,true,'leaving a match of two concedes');
 assert.equal(out.emptyStays,0,'a town nobody holds stays so while nobody holds its streets');
 assert.equal(out.taken,2,'a town nobody holds is taken by holding its streets');
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
