const http=require('http'),fs=require('fs'),path=require('path'),assert=process.env.WOD_PROBE?()=>{}:require('assert/strict');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/ai-judgment');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(ROOT,'.'+(req.url.split('?')[0]==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0])));
 if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(err,body)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ogg':'audio/ogg','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream');res.end(body);});
});
(async()=>{
 const relay=new WebSocketServer({port:8080});relay.on('error',()=>{});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],results={};page.on('pageerror',e=>errors.push(e.stack));
 try{
  await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
  await page.evaluate(()=>{
   setGameSpeed(0,true);wodDismissChangelogPopup();gameData.ownedShopVisuals={...gameData.ownedShopVisuals,map_atlas_hd:true};
   window.resetWaterTest=(owner=1)=>{
    WOD.makeBlankMap(30);gameState='PLAYING';gameData.mp={enabled:false};gameData._campaignRun=null;gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.bridges=[];gameData.constructionJobs=[];gameData._encircWork=null;gameData.encircledHexes=new Set();gameData.encircledReliefHexes=new Set();gameData._cityCombatStagingKeys=new Set();gameData.cityCombatBlockForProd=new Set();gameData._matchReadyForEndChecks=false;gameData._aiSpawnBurst=null;gameData._aiStratWork=null;gameData._aiFormChunk=null;gameData.aiTimer=-1e6;gameData.aiStrategyTimer=-1e6;gameData._aiFortGuardTimer=-1e6;gameData.convoyTimer=-1e6;gameData._wodPfCache=new Map();gameData._wodPfVer=(gameData._wodPfVer||0)+1;gameData.money=1e7;gameData.manpower=1e7;gameData.aiMoneyByOwner={2:1e7};gameData.aiManpowerByOwner={2:1e7};
    gameData._aiBridgeCooldown={};gameData.unitSpatialGrid=buildUnitSpatialGrid();
    for(const h of gameData.hexList){h.type='grass';h.owner=owner;h.cityId=null;}
   };
   window.testTown=(q,r,owner,id)=>{const h=gameData.hexes[`${q},${r}`];h.type='urban';h.cityId=id;const c={id,name:id,owner,q,r,x:h.x,y:h.y,hp:1000,maxHp:1000,hasFactory:true,hasHarbor:true};gameData.cities.push(c);return c;};
  });
  results.random=await page.evaluate(()=>{
   const styles=new Set(),seeds=new Set();for(let i=0;i<120;i++){gameData.aiCommanderProfiles={};gameData.aiCommanderStyle='defensive';const p=wodAiCommander(2);styles.add(p.id);seeds.add(p.seed);if(wodAiCommander(2).id!==p.id||wodAiCommander(2).seed!==p.seed)throw Error('unstable commander');}
   const old=gameData.aiCommanderProfiles;wodPrepareForNewMatch({keepLiveMap:true});const fresh=gameData.aiCommanderProfiles!==old&&Object.keys(gameData.aiCommanderProfiles).length===0;
   document.getElementById('setupAI').value='3';wodSyncSetupOpponentsBrief();return{styles:[...styles],unique:seeds.size,fresh,hidden:!document.getElementById('setupCommanderStyle')&&!/Traits:|Balanced|Defensive|General|Admiral/.test(document.getElementById('setupOpponentsBrief').textContent)};
  });assert(results.random.styles.length===6&&results.random.unique>110&&results.random.fresh&&results.random.hidden);console.log('random',JSON.stringify(results.random));
  results.bridges=await page.evaluate(()=>{
   const rows=[];for(const kind of['coast','shortInlet','riverDetour','islands','enemyOnly']){
    resetWaterTest(2);gameData.aiCommanderProfiles={2:'balanced'};for(const h of gameData.hexList){h.type='grass';h.owner=2;}
    for(const h of gameData.hexList){if(Math.abs(h.q)<=1&&(kind==='shortInlet'?h.r<=2&&h.r>=-15:kind==='riverDetour'?h.r<=18:kind==='coast'?h.r<=0:true)){h.type='water';h.owner=0;}}
    const a=gameData.hexes['-2,0'],b=gameData.hexes['2,0'];if(kind==='enemyOnly'){a.owner=b.owner=1;}
    const site={shoreA:a,shoreB:b,x:0,y:0,span:108,angle:0,w:120,h:24,kind:'link'};
    rows.push({kind,benefit:wodAiBridgeTravelBenefit(site,2)});
   }return rows;
  });console.log('bridges',JSON.stringify(results.bridges));assert(results.bridges.every(r=>['riverDetour','islands'].includes(r.kind)?r.benefit:!r.benefit));
  results.terrain=await page.evaluate(()=>{
   const rows=[];for(const type of['mountaineer','motorized']){
    resetWaterTest(2);gameData.aiCommanderProfiles={2:'balanced'};const start=gameData.hexes['-8,0'],goal=gameData.hexes['10,0'];for(const h of gameData.hexList){h.owner=h.q<0?2:1;h.type='grass';if(h.q>=-7&&h.q<=-5&&h.r!==0)h.type=type==='mountaineer'?'hill':'swamp';}
    const u=createUnitAt(type,start.x,start.y,2);u.x=start.x;u.y=start.y;const e=createUnitAt('light',-27,0,1);e.x=-27;e.y=0;
    const chosen=wodAiAdvanceHex(u,goal,[u]);rows.push({type,terrain:chosen.type,q:chosen.q,r:chosen.r,forward:chosen.x>u.x});
   }return rows;
  });console.log('terrain',JSON.stringify(results.terrain));assert(results.terrain.every(r=>r.forward&&(r.type==='mountaineer'?r.terrain==='hill':r.terrain==='grass')));
  results.contact=await page.evaluate(()=>{
   resetWaterTest(2);gameData.aiCommanderProfiles={2:'balanced'};const goal=gameData.hexes['15,0'],near=gameData.hexes['0,0'];const members=[];const point=(t,h,o)=>{const u=createUnitAt(t,h.x,h.y,o);u.x=h.x;u.y=h.y;return u;};members.push(point('motorized',near,2));for(let i=0;i<12;i++)members.push(point('heavy',gameData.hexes['-20,0'],2));for(let i=0;i<3;i++)point('heavy',gameData.hexes['2,'+(i-1)],1);
   const distant=wodAiAssaultBalance(2,members,goal);for(const u of members){u.x=near.x;u.y=near.y;}
   const gathered=wodAiAssaultBalance(2,members,goal);for(const u of members)u.hp=u.maxHp*.15;const wounded=wodAiAssaultBalance(2,members,goal);
   return{distant,gathered,wounded};
  });console.log('contact',JSON.stringify(results.contact));assert(!results.contact.distant.ready&&!results.contact.distant.contactSafe&&results.contact.gathered.ready&&!results.contact.wounded.maintain);
  results.eras=await page.evaluate(()=>Object.entries(WOD_SPECIALIST_ERAS).map(([era,v])=>({era,motorized:wodSpecialistLabel('motorized',era),mountaineer:wodSpecialistLabel('mountaineer',era),mobileMark:v.mobileMark,mountainMark:v.mountainMark})));
  assert(new Set(results.eras.map(r=>r.motorized)).size===4&&new Set(results.eras.map(r=>r.mountaineer)).size===4&&new Set(results.eras.map(r=>r.mobileMark)).size===4&&new Set(results.eras.map(r=>r.mountainMark)).size===4);
  await page.evaluate(()=>{
   resetWaterTest();gameData.selection=[];UI.inGameUI.style.display='flex';const gallery=document.createElement('canvas');gallery.id='eraGallery';gallery.width=1120;gallery.height=580;gallery.style='position:fixed;left:20px;top:80px;z-index:100000;background:#12212a';document.body.appendChild(gallery);const ctx=gallery.getContext('2d');ctx.font='16px sans-serif';
   for(const [i,era]of['ancient','medieval','napoleonic','modern'].entries()){
    gameData.ownedUnitSkins={...gameData.ownedUnitSkins,ancient:true,medieval:true,napoleonic:true};gameData._matchPeriod=era;const x=65+i*280;ctx.fillStyle='#f2dfaa';ctx.fillText(era.toUpperCase(),x,40);
    for(const [j,type]of['motorized','mountaineer'].entries())for(const[k,skin]of['nato',era==='modern'?'atlasUnits':era,'goldenChip'].entries()){
     const y=125+j*230;ctx.save();ctx.translate(x+k*82,y);wodDrawUnitBodyUncached(ctx,{type,owner:1,x:0,y:0,manpower:1000},27,'#42c588',skin);ctx.restore();if(k===0){ctx.fillStyle='#f2dfaa';ctx.fillText(wodSpecialistLabel(type,era),x,y+70);}}
   }gameData._matchPeriod='modern';draw();
  });await page.screenshot({path:path.join(OUT,'era-specialists.png')});await page.evaluate(()=>document.getElementById('eraGallery').remove());
  assert(!errors.length,errors.join('\n'));fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));
 }finally{fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const c of relay.clients)c.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
