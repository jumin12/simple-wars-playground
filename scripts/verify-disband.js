'use strict';
// The skull beside a unit's name on its card disbands it (wodDisbandSelected, js/ui.js; wodDisbandUnit, js/orders.js):
//  - shown for one of our units, hidden for an enemy unit or a town;
//  - a first click arms it (red) and disbands nothing; left alone it disarms after three seconds;
//  - a second click disbands the unit: it leaves the field and the selection, and no casualties are booked;
//  - a guest's 'disband' command disbands its own unit on the host, never another player's.
const H=require('./lib/harness');
const path=require('path'),fs=require('fs'),assert=require('assert/strict');
const OUT=path.join(path.resolve(__dirname,'..'),'output/disband');fs.mkdirSync(OUT,{recursive:true});
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>typeof gameData!=='undefined'&&gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:90000});
 await page.evaluate(()=>{setGameSpeed(0,true);wodDismissChangelogPopup();});
 const pick=who=>page.evaluate(who=>{const lo=wodLocalPlayerOwner();const u=gameData.entities.find(e=>e.hp>0&&e.type!=='convoy'&&!e.cargo&&!e.isGeneral&&(who==='mine'?e.owner===lo:e.owner!==lo&&e.owner>0));
  for(const e of gameData.entities)e.selected=false;gameData.selection=u?[u]:[];if(u)u.selected=true;_infoCardUiThrottle.s=null;syncInfoCardPanel();return u?u.uid:null;},who);
 const state=()=>page.evaluate(()=>{const b=document.getElementById('infoDisband');return{shown:!!b&&!b.hidden&&!!b.getClientRects().length,armed:!!b&&b.classList.contains('is-armed')};});
 const res={};
 await pick('enemy');res.enemy=await state();
 await page.evaluate(()=>{const c=gameData.cities.find(c=>c.owner===wodLocalPlayerOwner());gameData.selection=[c];syncInfoCardPanel();});res.town=await state();
 const uid=await pick('mine');res.mine=await state();
 const before=await page.evaluate(()=>JSON.stringify(gameData.casualtiesByOwner||{})+'|'+(gameData.casualties||0));
 await page.click('#infoDisband');res.armed=await state();res.afterOne=await page.evaluate(uid=>!!gameData.entities.find(e=>e.uid===uid&&e.hp>0),uid);
 await page.screenshot({path:path.join(OUT,'armed.png'),clip:{x:0,y:400,width:640,height:400}});
 await page.waitForTimeout(3300);res.disarmed=await state();
 await page.click('#infoDisband');await page.click('#infoDisband');
 await page.evaluate(()=>{for(let i=0;i<3;i++){wodBeginSimPfBudget(gameData.entities.length);update(.05);}syncInfoCardPanel();});
 res.gone=await page.evaluate(uid=>!gameData.entities.some(e=>e.uid===uid),uid);
 res.selection=await page.evaluate(()=>gameData.selection.length);
 res.casualtiesSame=(await page.evaluate(()=>JSON.stringify(gameData.casualtiesByOwner||{})+'|'+(gameData.casualties||0)))===before;
 // a guest's command on the host: its own unit goes, another player's does not
 res.mp=await page.evaluate(()=>{const lo=wodLocalPlayerOwner(),mine=gameData.entities.find(e=>e.hp>0&&e.owner===lo&&e.type!=='convoy'&&!e.cargo),theirs=gameData.entities.find(e=>e.hp>0&&e.owner!==lo&&e.owner>0&&e.type!=='convoy'&&!e.cargo);
  const was=gameData.mp;gameData.mp={enabled:true,isHost:true,humanSlots:[lo,theirs.owner],seatTypes:['human','human'],connectedSlots:[lo,theirs.owner],allReady:true,localSlot:lo};
  const canPlay=wodMpMatchCanPlay();wodMpHostHandleRemoteCmd({detail:{fromSlot:theirs.owner,cmd:{kind:'disband',uids:[mine.uid,theirs.uid]}}});gameData.mp=was;
  return{canPlay,mineKept:mine.hp>0,theirsGone:theirs.hp<=0};});
 console.log(JSON.stringify(res));
 assert(!res.enemy.shown&&!res.town.shown,'no skull for an enemy unit or a town');
 assert(res.mine.shown&&!res.mine.armed,'a skull beside our unit\'s name');
 assert(res.armed.armed&&res.afterOne,'the first click arms it and disbands nothing');
 assert(!res.disarmed.armed,'left alone it disarms');
 assert(res.gone&&res.selection===0,'the second click disbands the unit and clears the selection');
 assert(res.casualtiesSame,'no casualties are booked for a disbanded unit');
 assert(res.mp.theirsGone&&res.mp.mineKept,'a guest\'s command disbands only its own unit: '+JSON.stringify(res.mp));
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
