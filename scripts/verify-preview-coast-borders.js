const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/preview-coast-borders');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(ROOT,'.'+(req.url.split('?')[0]==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0])));
 if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(err,body)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ogg':'audio/ogg','.mp3':'audio/mpeg'})[path.extname(file)]||'application/octet-stream');res.end(body);});
});
(async()=>{
 const relay=new WebSocketServer({port:8080});relay.on('error',()=>{});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],results={};page.on('pageerror',e=>errors.push(e.stack));
 try{
  await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');
  await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
  await page.evaluate(()=>{
   setGameSpeed(0,true);wodDismissChangelogPopup?.();gameData._matchReadyForEndChecks=false;
   // Independent edge audit: flood only water connected to the map boundary.
   window.auditCoastBorders=()=>{
    const g=gameData,water=h=>h&&(h.type==='water'||h.type==='deep_water'),dirs=[[1,0],[-1,0],[0,1],[0,-1]],ocean=new Set(),queue=[];
    for(const h of g.hexList)if(water(h)&&dirs.some(([q,r])=>!g.hexes[`${h.q+q},${h.r+r}`])){ocean.add(`${h.q},${h.r}`);queue.push(h);}
    for(let i=0;i<queue.length;i++)for(const [q,r] of dirs){const n=g.hexes[`${queue[i].q+q},${queue[i].r+r}`],k=n&&`${n.q},${n.r}`;if(water(n)&&!ocean.has(k)){ocean.add(k);queue.push(n);}}
    const spacing=g.hexRadius*1.35,key=(a,b)=>[`${Math.round(a.x/spacing*2)},${Math.round(a.y/spacing*2)}`,`${Math.round(b.x/spacing*2)},${Math.round(b.y/spacing*2)}`].sort().join('|'),expected=new Set(),got=new Map();
    let rawOceanEdges=0;
    for(const h of g.hexList)for(const [q,r] of [[1,0],[0,1]]) {
     const n=g.hexes[`${h.q+q},${h.r+r}`];if(!n||!h.owner||!n.owner||h.owner===n.owner)continue;
     if(ocean.has(`${h.q},${h.r}`)||ocean.has(`${n.q},${n.r}`)){rawOceanEdges++;continue;}
     const x=(h.x+n.x)/2,y=(h.y+n.y)/2;expected.add(key({x:x-(r?spacing/2:0),y:y-(q?spacing/2:0)},{x:x+(r?spacing/2:0),y:y+(q?spacing/2:0)}));
    }
    const chains=wodCollectDiplomacyBorderChains(g.hexList,g.hexes,0,0,spacing);let forbidden=0;
    for(const c of chains)for(let i=0;i<c.pts.length-(c.closed?0:1);i++){const k=key(c.pts[i],c.pts[(i+1)%c.pts.length]);if(!expected.has(k))forbidden++;got.set(k,(got.get(k)||0)+1);}
    const protectedKeys=new Set(g.cities.map(c=>`${c.q},${c.r}`));
    for(const u of g.entities)if(u.hp>0){const h=getNearestHexToPoint(u.x,u.y);if(h)protectedKeys.add(`${h.q},${h.r}`);}
    const checked=new Set();let unsupportedLandPockets=0;
    for(const h of g.hexList) {
     const key=`${h.q},${h.r}`;if(water(h)||checked.has(key))continue;
     const component=[h];checked.add(key);let enclosed=true,protectedSite=false;
     for(let i=0;i<component.length;i++) {
      const cell=component[i];protectedSite||=protectedKeys.has(`${cell.q},${cell.r}`);
      for(const [q,r] of dirs){const nb=g.hexes[`${cell.q+q},${cell.r+r}`];if(!nb||water(nb)){enclosed=false;continue;}const k=`${nb.q},${nb.r}`;if(nb.owner===h.owner&&!checked.has(k)){checked.add(k);component.push(nb);}}
     }
     if(enclosed&&!protectedSite)unsupportedLandPockets++;
    }
    const physicalSeen=new Set();let splitTownlessIslands=0;
    for(const h of g.hexList) {
     const hk=`${h.q},${h.r}`;if(water(h)||physicalSeen.has(hk))continue;
     const island=[h],owners=new Set();let town=false;physicalSeen.add(hk);
     for(let i=0;i<island.length;i++) {
      const cell=island[i];owners.add(cell.owner);town||=g.cities.some(c=>c.q===cell.q&&c.r===cell.r);
      for(const [q,r] of dirs){const n=g.hexes[`${cell.q+q},${cell.r+r}`],key=n&&`${n.q},${n.r}`;if(n&&!water(n)&&!physicalSeen.has(key)){physicalSeen.add(key);island.push(n);}}
     }
     if(!town&&owners.size>1)splitTownlessIslands++;
    }
    return {splitTownlessIslands,chains:chains.length,closed:chains.filter(c=>c.closed).length,expected:expected.size,drawn:got.size,missing:[...expected].filter(k=>!got.has(k)).length,duplicates:[...got.values()].filter(n=>n!==1).length,forbidden,rawOceanEdges,unsupportedLandPockets};
   };
  });
  results.fixtures=await page.evaluate(()=>{
   const rows=[];
   for(const kind of ['oceanSplit','offshoreClaims','lake','defendedEnclave','allOcean']) {
    WOD.makeBlankMap(20);gameData.hexList=gameData.hexList.filter(h=>Math.abs(h.q)<=20&&Math.abs(h.r)<=16);gameData.hexes=Object.fromEntries(gameData.hexList.map(h=>[getHexKey(h),h]));
    gameData.cities=[];gameData.entities=[];gameData.forts=[];gameData.bridges=[];
    for(const h of gameData.hexList){h.type=h.q*h.q/196+h.r*h.r/100<1?'grass':'water';h.owner=h.q<0?1:2;h.cityId=null;}
    // Deliberate ocean loop and spur, like the reported preview screenshots.
    for(const h of gameData.hexList)if(isWaterHex(h)&&(h.q>=-2&&h.q<=1&&h.r>=-15&&h.r<=-13||h.q>=17&&h.r>=2))h.owner=3;
    if(kind==='offshoreClaims'){const h=gameData.hexes['-18,-11'];h.type='mountain';h.owner=4;}
    if(kind==='lake')for(const h of gameData.hexList)if(Math.abs(h.q)<=3&&Math.abs(h.r)<=3)h.type='water';
    if(kind==='defendedEnclave'){const h=gameData.hexes['-7,0'];h.type='urban';h.owner=2;h.cityId='Enclave';gameData.cities=[{id:h.cityId,q:h.q,r:h.r,x:h.x,y:h.y,owner:2}];}
    if(kind==='allOcean')for(const h of gameData.hexList)h.type='deep_water';
    const before=JSON.stringify(gameData.hexList.map(h=>[h.type,h.owner]));const row={kind,...auditCoastBorders()};
    row.unchanged=before===JSON.stringify(gameData.hexList.map(h=>[h.type,h.owner]));rows.push(row);
    if(kind==='lake') {
     const first=wodOpenOceanHexKeys(gameData.hexList,gameData.hexes);rows.push({kind:'lakeMask',inland:!first.has('0,0')});
     gameData.hexes['-15,0'].owner=4;const same=wodOpenOceanHexKeys(gameData.hexList,gameData.hexes);
     for(let r=-16;r<=-3;r++)gameData.hexes[`0,${r}`].type='water';
     const opened=wodOpenOceanHexKeys(gameData.hexList,gameData.hexes);rows.push({kind:'openChannel',reusedForOwnership:same===first,opened:opened.has('0,0'),...auditCoastBorders()});
     gameData.hexes['0,-5'].type='grass';const closed=wodOpenOceanHexKeys(gameData.hexList,gameData.hexes);rows.push({kind:'closeChannel',inland:!closed.has('0,0'),...auditCoastBorders()});
    }
   }
   return rows;
  });
  results.balanceFixtures=await page.evaluate(async()=>{
   const rows=[];
   for(const mode of ['orphanPeak','protectedFront']) {
    WOD.makeBlankMap(20);gameData.hexList=gameData.hexList.filter(h=>Math.abs(h.q)<=10&&Math.abs(h.r)<=8);gameData.hexes=Object.fromEntries(gameData.hexList.map(h=>[getHexKey(h),h]));gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.bridges=[];
    for(const h of gameData.hexList){h.type='grass';h.owner=h.q<2?1:2;h.cityId=null;if(h.q===-7&&Math.abs(h.r)<=3)h.type='mountain';}
    for(const [owner,q] of [[1,mode==='protectedFront'?1:-5],[2,mode==='protectedFront'?2:5]]) {
     const h=gameData.hexes[`${q},0`],id='Town '+owner;h.cityId=id;h.type='urban';gameData.cities.push({id,q,r:0,x:h.x,y:h.y,owner});
     if(mode==='protectedFront')for(let r=-8;r<=8;r++){const t=gameData.hexes[`${q},${r}`];t.type='urban';t.cityId=id;}
    }
    const peak=gameData.hexes['-7,0'];if(mode==='orphanPeak')peak.owner=2;
    const before=auditCoastBorders().unsupportedLandPockets;await wodExactEqualizePoliticalLandCounts([1,2],gameData.cities,700);
    rows.push({mode,before,after:auditCoastBorders().unsupportedLandPockets,peakOwner:peak.owner,reason:gameData._startingLandBalance.reason,counts:wodCountBalancedLandByOwner([1,2]),mountainsUnchanged:gameData.hexList.filter(h=>h.type==='mountain').every(h=>h.owner===1)});
   }
   return rows;
  });
  results.generated=[];
  const cases=['island','ring','archipelago','mountain'].flatMap((shape,i)=>[2,4].map(players=>({shape,players,seed:130026+i*200+players,size:40})));
  cases.push({shape:'island',players:2,seed:130044,size:60},{shape:'island',players:4,seed:130026,size:80});
  for(let i=0;i<18;i++)cases.push({shape:'island',players:2+i%3,seed:240024+i*137,size:40});
  for(let i=0;i<16;i++)cases.push({shape:i%2?'island':'archipelago',players:2+i%3,seed:24170824+i*997,size:i%4===3?60:40});
  await page.evaluate(()=>{gameState='MENU';pauseMenuBackgroundBattle();UI.mainMenu.classList.add('hidden');UI.inGameUI.style.display='none';UI.panels.forEach(p=>p.classList.add('hidden'));document.getElementById('setupPanel').classList.remove('hidden');});
  for(const c of cases) {
   const row=await page.evaluate(async c=>{
    gameData.loadedCustomMap=false;gameData.mp={enabled:false};gameData._campaignRun=null;gameData.aiCount=c.players-1;
    document.getElementById('setupAI').value=String(c.players-1);document.getElementById('setupMapSize').value=String(c.size);document.getElementById('setupMapShape').value=c.shape;
    gameData._mapGenSeed=c.seed;gameData._wodReuseMapGenSeed=true;gameData._wodSkipMapGenLoader=true;gameData._mapGenOptions={cities:true,territory:true,units:true,mapShape:c.shape};await generateMap();
    previewLoadedMap('mapPreview');const before=JSON.stringify(gameData.hexList.map(h=>[h.type,h.owner]));const audit=auditCoastBorders();
    const counts=wodCountBalancedLandByOwner(Array.from({length:c.players},(_,i)=>i+1));
    // Exercise lobby preview rendering against the identical world too.
    const lobby=document.createElement('canvas');lobby.width=600;lobby.height=300;wodPaintMapPreviewPolitical(lobby.getContext('2d'),gameData.hexList,gameData.cities,null,300,150,.15,gameData.hexRadius,gameData.hexes);
    return {...c,...audit,counts,validation:gameData._mapGenValidation,unchanged:before===JSON.stringify(gameData.hexList.map(h=>[h.type,h.owner]))};
   },c);
   console.log(JSON.stringify({shape:c.shape,players:c.players,size:c.size,validation:row.validation}));
   results.generated.push(row);await page.locator('#mapPreview').screenshot({path:path.join(OUT,`${c.shape}-${c.players}-${c.size}-${c.seed}.png`)});
  }
  // Real Generate New interaction, followed by the production gameplay renderer.
  await page.locator('#setupBtnGenerateNew').click();await page.waitForFunction(()=>!gameData._soloPreviewGenerating&&!gameData._mapGenInProgress,null,{timeout:180000});
  results.regenerate=await page.evaluate(()=>auditCoastBorders());await page.locator('#mapPreview').screenshot({path:path.join(OUT,'regenerate-click.png')});
  await page.evaluate(()=>{UI.panels.forEach(p=>p.classList.add('hidden'));UI.mainMenu.classList.add('hidden');UI.inGameUI.style.display='';UI.inGameUI.classList.remove('hidden');gameState='PLAYING';gameData.speed=0;gameData.fogOfWar=false;gameData.layers.diplomacy=true;gameData.layers.terrain=true;gameData._matchReadyForEndChecks=false;canvas.style.display='block';wodSyncViewportAndCanvas();const extent=Math.max(...gameData.hexList.map(h=>Math.max(Math.abs(h.x),Math.abs(h.y))));gameData.camera.zoom=Math.min(canvas.clientWidth,canvas.clientHeight)/(extent*2.1);gameData.camera.x=-canvas.clientWidth/2;gameData.camera.y=-canvas.clientHeight/2;wodMarkTerrainFullDirty();updateTerrainCache();draw();});
  await page.screenshot({path:path.join(OUT,'gameplay-coasts.png')});
  fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
  const audits=[...results.fixtures,...results.generated,results.regenerate].filter(r=>r.expected!==undefined);
  assert(audits.every(r=>!r.forbidden&&!r.missing&&!r.duplicates&&r.expected===r.drawn),'only real land/inland-lake boundaries are drawn, exactly once');
  assert(results.fixtures.filter(r=>['oceanSplit','offshoreClaims'].includes(r.kind)).every(r=>r.chains===1&&!r.closed&&r.rawOceanEdges>0),'ocean-only hooks, loops and offshore contours disappear');
  assert(results.fixtures.find(r=>r.kind==='allOcean').drawn===0);
  assert(results.fixtures.find(r=>r.kind==='defendedEnclave').closed===1,'real defended land enclaves retain their border');
  assert(results.fixtures.find(r=>r.kind==='lakeMask').inland&&results.fixtures.find(r=>r.kind==='openChannel').opened&&results.fixtures.find(r=>r.kind==='openChannel').reusedForOwnership&&results.fixtures.find(r=>r.kind==='closeChannel').inland,'terrain edits refresh ocean topology while ownership changes reuse it');
  assert([...results.fixtures,...results.generated].filter(r=>r.unchanged!==undefined).every(r=>r.unchanged),'rendering never changes ownership or terrain');
  assert(results.generated.every(r=>Math.max(...Object.values(r.counts))-Math.min(...Object.values(r.counts))<=1));
  assert(results.generated.every(r=>r.splitTownlessIslands===0),'every townless physical island has one owner');
  assert(results.generated.every(r=>r.validation?.quality.ok),'every preview passed the strict border acceptance gate');
  assert(results.generated.every(r=>!r.closed&&r.validation.quality.maxBorderDetour<=1.8),'starting frontlines have no visible loops or folded detours');
  assert([...results.generated,results.regenerate].every(r=>r.unsupportedLandPockets===0),'generation never leaves empty surrounded mountain or land remnants');
  const repaired=results.balanceFixtures.find(r=>r.mode==='orphanPeak'),blocked=results.balanceFixtures.find(r=>r.mode==='protectedFront');
  assert(repaired.before===1&&repaired.after===0&&repaired.peakOwner===1&&Math.abs(repaired.counts[1]-repaired.counts[2])<=1,'orphan mountain ownership is repaired and area quotas remain even');
  assert(blocked.reason==='blocked'&&blocked.mountainsUnchanged&&blocked.after===0,'a fully protected frontier is rejected instead of converting inland peaks into offshore claims');
  assert.equal(errors.length,0,errors.join('\n'));
 }finally{fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();server.close();for(const s of relay.clients)s.terminate();relay.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
