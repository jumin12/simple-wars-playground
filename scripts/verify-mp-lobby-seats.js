'use strict';
// The game lobby's seats (four at most, players and AI together), on a mocked lobby with no relay:
//  - with three players (two in the lobby) the AI counter offers 0 or 1 only, and Players cannot go below the two present;
//  - four players leave no room for an AI; one player alone is given one;
//  - a seat's dropdown sets its kind, and the last seat but one cannot be closed (a match needs two sides);
//  - laying seats out from counts keeps every seat a player is sitting in a player seat;
//  - the counters apply on their own (no Apply button), and a guest sees no dropdowns or counters.
const H=require('./lib/harness'),assert=require('assert/strict');
const server=H.createStaticServer({});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await H.launchBrowser(),page=await (await browser.newContext({viewport:{width:1280,height:860}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.waitForFunction(()=>typeof gameState!=='undefined'&&gameState==='MENU'&&typeof wodMpRenderSeatCounters==='function',null,{timeout:90000});
 const setup=(isHost,seats,occ)=>page.evaluate(([isHost,seats,occ])=>{try{wodDismissChangelogPopup();}catch(e){}
  showPanel('multiplayer');Object.assign(WodMultiplayer.api,{code:'K7QX',slot:isHost?1:2,isHost,lobbyName:'Seats',socketOpen:true,connected:true});WodMultiplayer.sendLobbyMeta=()=>{};
  // (no map previews here: the counters apply at once)
  window.wodIsMapPreviewGenerating=()=>false;window.wodMpRefreshLobbyMapPreviewAfterMetaChange=()=>{};window.wodMpRefreshLobbyMapPreview=()=>{};
  window.wodMpRoomMeta=Object.assign(wodMpBuildInitialHostMeta(),{seatTypes:seats,occupiedSlots:occ,hostSlot:1});
  document.getElementById('mpLobbyBrowsePhase').classList.add('hidden');document.getElementById('mpGameLobbyScreen').classList.remove('hidden');
  wodMpSyncLayoutCountFieldsFromMeta(window.wodMpRoomMeta);wodMpRenderGameLobbyScreen();},[isHost,seats,occ]);
 const counters=()=>page.evaluate(()=>{const f=k=>[...document.querySelectorAll('#mpGlSeatCounters .mp-seg-btn[data-kind="'+k+'"]')].map(b=>b.textContent+(b.disabled?'x':'')+(b.classList.contains('on')?'*':'')).join(' ');return{h:f('h'),b:f('b'),st:window.wodMpRoomMeta.seatTypes.join(','),seats:document.querySelectorAll('.mp-gl-seat').length,dd:document.querySelectorAll('.mp-gl-seat-dd').length};});
 const o={};
 await setup(true,['human','human','human','bot'],[1,2]);o.three=await counters();
 await page.click('#mpGlSeatCounters .mp-seg-btn[data-kind="h"][data-n="4"]');await page.waitForTimeout(500);o.four=await counters();
 await page.click('#mpGlSeatCounters .mp-seg-btn[data-kind="h"][data-n="2"]');await page.waitForTimeout(500);await page.click('#mpGlSeatCounters .mp-seg-btn[data-kind="b"][data-n="2"]');await page.waitForTimeout(500);o.twoTwo=await counters();
 await setup(true,['human','bot','closed','closed'],[1]);o.alone=await page.evaluate(()=>{const before=window.wodMpRoomMeta.seatTypes.join(',');
  const dd=document.querySelector('.mp-gl-seat-dd[data-slot="2"]');dd.querySelector('.wod-dd-btn').click();const open=dd.classList.contains('open');
  const closedOff=dd.querySelector('.wod-dd-opt[data-value="closed"]').disabled;dd.querySelector('.wod-dd-opt[data-value="human"]').click();
  return{before,open,closedOff,after:window.wodMpRoomMeta.seatTypes.join(','),closedAfter:!document.querySelector('.wod-dd.open')};});
 o.build=await page.evaluate(()=>({occ3:wodMpBuildSeatTypesFromCounts(2,1,[1,3]).join(','),one:wodMpBuildSeatTypesFromCounts(1,0,[1]).join(','),over:wodMpBuildSeatTypesFromCounts(3,3,[1]).join(','),clamp:JSON.stringify(wodMpClampSeatCounts(1,0,3))}));
 await setup(false,['human','human','human','bot'],[1,2]);o.guest=await counters();
 console.log(JSON.stringify(o));
 assert.equal(o.three.b,'0 1* 2x 3x','three players: room for one AI at most: '+o.three.b);
 assert.equal(o.three.h,'1x 2 3* 4','two in the lobby: Players cannot go below two: '+o.three.h);
 assert(o.four.b==='0* 1x 2x 3x'&&o.four.st==='human,human,human,human','four players leave no room for an AI: '+JSON.stringify(o.four));
 assert.equal(o.twoTwo.st,'human,human,bot,bot','two players and two AI, applied at once: '+o.twoTwo.st);
 assert(o.alone.open&&o.alone.closedOff&&o.alone.after==='human,human,closed,closed'&&o.alone.closedAfter,'a seat dropdown sets the seat; the last but one cannot be closed: '+JSON.stringify(o.alone));
 assert.equal(o.build.occ3,'human,bot,human,closed','a player sitting in seat 3 keeps it: '+o.build.occ3);
 assert.equal(o.build.one,'human,bot,closed,closed','one player alone is given an AI');
 assert.equal(o.build.over,'human,human,human,bot','never more than four seats');
 assert.equal(o.build.clamp,'{"humans":3,"bots":0}','players present set the least number of player seats');
 assert(o.guest.dd===0&&o.guest.seats===4,'a guest sees the four seats and no dropdowns: '+JSON.stringify(o.guest));
 assert.equal(errors.length,0,errors.join('\n'));
}finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
