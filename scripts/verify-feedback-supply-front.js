'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/feedback-supply-front');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{const f=path.resolve(ROOT,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(ROOT+path.sep))return res.writeHead(403).end();fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[path.extname(f)]||'application/octet-stream');res.end(b);});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[],results={};
 await context.routeWebSocket(/.*/,s=>{s.onMessage(()=>{});s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]}));});page.on('pageerror',e=>errors.push(e.stack));page.setDefaultTimeout(180000);
 try{
  await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks);
  await page.evaluate(()=>{
   setGameSpeed(0,true);wodDismissChangelogPopup();cancelAnimationFrame(animationFrameId);
   window.feedbackWorld=(owner=2)=>{wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(28);gameState='PLAYING';gameData.menuAttractMode=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.alliances=[];gameData.encircledHexes=new Set();gameData.encircledReliefHexes=new Set();gameData._aiLocalSituation=new WeakMap();gameData._aiArrivalCache=null;gameData._aiFrontSupport=new WeakMap();gameData._aiEconomyClock=0;gameData.aiCommanderProfiles={2:'balanced'};gameData.money=gameData.manpower=100000;gameData.aiMoneyByOwner={2:100000};gameData.aiManpowerByOwner={2:100000};gameData.aiTimer=gameData.aiStrategyTimer=gameData.convoyTimer=gameData._transportAiTimer=-1e6;for(const h of gameData.hexList){h.type='grass';h.owner=owner===1?2:1;h.cityId=null;}};
   window.feedbackHex=(q,r=0)=>gameData.hexes[q+','+r];
   window.feedbackTown=(q,r,owner,id)=>{const h=feedbackHex(q,r);h.type='urban';h.owner=owner;h.cityId=id;const c={id,name:id,q,r,x:h.x,y:h.y,owner,hp:1000,maxHp:1000};gameData.cities.push(c);return c;};
   window.feedbackUnit=(q,r=0,type='light',owner=2)=>{const h=feedbackHex(q,r),u=createUnitAt(type,h.x,h.y,owner,{startSpawn:true});u.x=h.x;u.y=h.y;u.isGeneral=false;return u;};
   window.feedbackRefresh=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();gameData._citySupplyCache=null;gameData._aiArrivalCache=null;gameData._generalAuraCache=null;wodInvalidateAiFrontlineHexCache();};
   window.feedbackScan=()=>{gameData._encircWork=null;gameData.encirclementTimer=100;updateEncirclements(2);let i=0;while(gameData._encircWork&&i++<1000)wodEncirclementProcessChunk();if(gameData._encircWork)throw Error('scan unfinished');};
  });
  results.supply=[];
  for(const owner of [1,2]){
   const row=await page.evaluate(owner=>{
    feedbackWorld(owner);feedbackTown(0,0,owner,'Home');for(let i=1;i<=6;i++){feedbackHex(i,i).owner=owner;feedbackHex(i,i-1).owner=owner;}
    const u=feedbackUnit(6,6,'light',owner);feedbackRefresh();gameData.encircledHexes=new Set(['6,6']);
    const supplied=!wodGetUnitEncirclementState(u,feedbackHex(6,6)),flagCleared=!wodHexKeyIsEncircled('6,6');feedbackScan();
    const scanSupplied=!wodGetUnitEncirclementState(u,feedbackHex(6,6)),preserved=Array.from({length:7},(_,i)=>feedbackHex(i,i).owner).every(o=>o===owner);
    const ai=wodAiReadDefense(owner,[u],true);setHexOwner(feedbackHex(3,3),owner===1?2:1);const cut=!!wodGetUnitEncirclementState(u,feedbackHex(6,6));
    setHexOwner(feedbackHex(3,3),owner);const restored=!wodGetUnitEncirclementState(u,feedbackHex(6,6));
    return{owner,supplied,flagCleared,scanSupplied,preserved,pockets:ai.pockets.length,cut,restored};
   },owner);assert(row.supplied&&row.flagCleared&&row.scanSupplied&&row.preserved&&row.cut&&row.restored&&row.pockets===0);results.supply.push(row);
  }
  results.towns=[];
  for(const owner of [1,2]){
   const row=await page.evaluate(owner=>{
    feedbackWorld(owner);const c=feedbackTown(0,0,owner,'Besieged town');for(let q=1;q<=2;q++){const h=feedbackHex(q);h.type='urban';h.cityId=c.id;h.owner=owner;}for(let q=3;q<=7;q++)feedbackHex(q).owner=owner;
    const u=feedbackUnit(7,0,'heavy',owner);setHexOwner(feedbackHex(0),owner===1?2:1);feedbackRefresh();
    const supplied=!wodGetUnitEncirclementState(u,feedbackHex(7)),sources=wodCitySupplySourceHexes(c).length,defense=wodAiReadDefense(owner,[u],true);
    c.owner=owner===1?2:1;const lostTown=!!wodGetUnitEncirclementState(u,feedbackHex(7));c.owner=owner;const recaptured=!wodGetUnitEncirclementState(u,feedbackHex(7));
    return{owner,supplied,sources,pockets:defense.pockets.length,lostTown,recaptured};
   },owner);assert(row.supplied&&row.sources===2&&row.pockets===0&&row.lostTown&&row.recaptured);results.towns.push(row);
  }
  results.waterGap=await page.evaluate(()=>{feedbackWorld(1);feedbackTown(0,0,1,'Home');feedbackHex(1,1).owner=1;feedbackHex(1,0).type=feedbackHex(0,1).type='water';feedbackRefresh();return !wodCurrentSupplyComponent(feedbackHex(1,1),1).city;});assert(results.waterGap,'diagonal water gaps do not become land corridors');
  results.front=await page.evaluate(()=>{
   feedbackWorld();for(const h of gameData.hexList)h.owner=h.q<=0?2:1;const c=feedbackTown(-18,0,2,'Home');feedbackTown(18,0,1,'Target');
   const guard=feedbackUnit(-18),main=[feedbackUnit(0,-2),feedbackUnit(0,0),feedbackUnit(0,2),feedbackUnit(-2,4,'heavy')],reserves=[feedbackUnit(-10,-5),feedbackUnit(-10,-2),feedbackUnit(-10,2),feedbackUnit(-10,5)],line=[feedbackUnit(-8,10),feedbackUnit(-8,12)];
   for(let i=0;i<3;i++)feedbackUnit(2,i*2-2,i===1?'heavy':'light',1);feedbackRefresh();
   const jobs=[{id:'town',kind:'defend',role:'defend',city:c,members:[guard.uid]},{id:'push',kind:'main',role:'main',phase:'assault',members:main.map(u=>u.uid),holdHex:feedbackHex(-2),objectiveHex:feedbackHex(4)},{id:'reserve',kind:'reserve',role:'reserve',holdHex:feedbackHex(-12),members:reserves.map(u=>u.uid)},{id:'line',kind:'hold',role:'fix',holdHex:feedbackHex(-8,10),members:line.map(u=>u.uid)}];
   const p=gameData.aiTaskForces[2]={jobs,unitJob:Object.fromEntries(jobs.flatMap(j=>j.members.map(id=>[id,j.id])))};wodAiRefreshFrontSupport(2,p,[guard,...main,...reserves,...line]);
   const borrowed=[...reserves,...line].filter(u=>wodAiFrontSupportFor(u,jobs.find(j=>j.id===p.unitJob[u.uid]))),start=borrowed.map(u=>u.x);
   for(const u of borrowed)wodAiIssueTaskForceOrder(u,jobs.find(j=>j.id===p.unitJob[u.uid]),1);
   const ordered=borrowed.filter(u=>u.target).length,guardStays=!wodAiFrontSupportFor(guard,jobs[0]),reserveHeld=reserves.filter(u=>!borrowed.includes(u)).length,lineHeld=line.filter(u=>!borrowed.includes(u)).length;
   for(let i=0;i<800;i++){wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.1);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();}
   return{borrowed:borrowed.length,ordered,guardStays,reserveHeld,lineHeld,advanced:borrowed.filter((u,i)=>u.x>start[i]+gameData.hexRadius*3).length};
  });assert(results.front.borrowed>=2&&results.front.ordered>=2&&results.front.guardStays&&results.front.reserveHeld>=1&&results.front.lineHeld>=1&&results.front.advanced>=2,JSON.stringify(results.front));
  results.merge=await page.evaluate(()=>{feedbackWorld();for(const h of gameData.hexList)h.owner=h.q<0?2:1;feedbackTown(-18,0,2,'Home');const army=Array.from({length:8},(_,i)=>feedbackUnit(-8,i-4));feedbackRefresh();const a={id:'a',kind:'main',members:army.slice(0,4).map(u=>u.uid),waitingForStrength:true,objectiveHex:feedbackHex(18,-10),holdHex:feedbackHex(-6,-2)},b={id:'b',kind:'main',members:army.slice(4).map(u=>u.uid),waitingForStrength:true,objectiveHex:feedbackHex(18,10),holdHex:feedbackHex(-6,2)},p={jobs:[a,b],unitJob:Object.fromEntries(army.map((u,i)=>[u.uid,i<4?'a':'b']))};wodAiConcentrateAssaults(2,p,army);return{groups:p.jobs.length,members:p.jobs[0].members.length};});assert(results.merge.groups===1&&results.merge.members===8);
  await page.evaluate(()=>{feedbackWorld(1);for(const h of gameData.hexList)h.owner=1;feedbackTown(-10,0,1,'Home');placeFortAtHex(feedbackHex(-4,0),1,{editor:true});placeHospitalAtHex(feedbackHex(0,0),1,{editor:true});const g=feedbackUnit(5,0,'heavy',1);g.isGeneral=true;UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.style.display='block';gameData.camera={zoom:1.8,x:-canvas.clientWidth/2,y:-canvas.clientHeight/2};feedbackRefresh();wodMarkTerrainFullDirty();updateTerrainCache();draw();});
  await page.screenshot({path:path.join(OUT,'hospital-fort-purple-command.png')});assert.deepEqual(errors,[]);console.log(JSON.stringify(results,null,2));
 }finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors));await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
