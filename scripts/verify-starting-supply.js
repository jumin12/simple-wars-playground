const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const {chromium} = require('playwright');
const {WebSocketServer} = require('../server/node_modules/ws');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output', 'starting-supply');
fs.mkdirSync(OUT, {recursive:true});
const server = http.createServer((req,res)=>{
  const file = path.resolve(ROOT, '.'+(req.url.split('?')[0]==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0])));
  if(!file.startsWith(ROOT+path.sep)) return res.writeHead(403).end();
  fs.readFile(file,(err,body)=>{
    if(err) return res.writeHead(404).end();
    res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[path.extname(file)]||'application/octet-stream');
    res.end(body);
  });
});
(async()=>{
  const relay = new WebSocketServer({port:8080}); relay.on('error',()=>{});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[], rows=[];
  page.on('pageerror',e=>errors.push(e.stack));
  try {
    await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');
    await page.waitForFunction(()=>window.__wodDebug?.().gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
    await page.evaluate(()=>{setGameSpeed(0,true);wodDismissChangelogPopup();gameData._matchReadyForEndChecks=false;});
    // Independent audit: no production supply helper is used to prove a route.
    await page.evaluate(()=>{
      window.auditStart=()=>{
        const g=gameData, keys=new Set(), queue=[];
        const walk=h=>h&&h.type!=='water'&&h.type!=='deep_water'&&h.type!=='mountain';
        for(const c of g.cities) {
          const key=`${c.q},${c.r}`,h=g.hexes[key];
          if(walk(h)&&h.owner===c.owner&&!keys.has(key)){keys.add(key);queue.push(h);}
        }
        for(let i=0;i<queue.length;i++) for(const [dq,dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const key=`${queue[i].q+dq},${queue[i].r+dr}`,h=g.hexes[key];
          if(walk(h)&&h.owner===queue[i].owner&&!keys.has(key)){keys.add(key);queue.push(h);}
        }
        const orphanUnits=g.entities.filter(u=>u.hp>0&&u.type!=='ship'&&u.type!=='convoy'&&!keys.has(getHexKey(getNearestHexToPoint(u.x,u.y))))
          .map(u=>({owner:u.owner,type:u.type,x:u.x,y:u.y}));
        const inhabited=new Set(),visited=new Set();
        const towns=new Set(g.cities.map(c=>`${c.q},${c.r}`));
        for(const start of g.hexList) if(walk(start)&&!visited.has(getHexKey(start))) {
          const component=[start];visited.add(getHexKey(start));let hasTown=false;
          for(let i=0;i<component.length;i++) {
            const h=component[i];hasTown ||= towns.has(getHexKey(h));
            for(const [dq,dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
              const key=`${h.q+dq},${h.r+dr}`,nb=g.hexes[key];
              if(walk(nb)&&!visited.has(key)){visited.add(key);component.push(nb);}
            }
          }
          if(hasTown) for(const h of component)inhabited.add(getHexKey(h));
        }
        const counts={},cities={},units={},front={};
        for(const h of g.hexList)if(h.type!=='water'&&h.type!=='deep_water'&&h.owner>0) counts[h.owner]=(counts[h.owner]||0)+1;
        for(const c of g.cities)cities[c.owner]=(cities[c.owner]||0)+1;
        for(const u of g.entities)if(u.hp>0){units[u.owner]=(units[u.owner]||0)+1;if(u._startDeployment==='front')front[u.owner]=(front[u.owner]||0)+1;}
        return {counts,cities,units,front,orphanUnits,
          strandedLand:g.hexList.filter(h=>walk(h)&&h.owner>0&&inhabited.has(getHexKey(h))&&!keys.has(getHexKey(h))).map(h=>({q:h.q,r:h.r,owner:h.owner})),
          foreignTowns:g.cities.filter(c=>g.hexes[`${c.q},${c.r}`]?.owner!==c.owner).length,
          borderArmor:g.entities.filter(u=>u.type==='heavy'&&isFrontlineHex(getNearestHexToPoint(u.x,u.y),u.owner)).length};
      };
    });
    const fixture=await page.evaluate(async()=>{
      WOD.makeBlankMap(40);gameData.entities=[];
      for(const h of gameData.hexList){h.type=Math.abs(h.r)<=2?'water':'grass';h.owner=h.q<0?1:2;}
      gameData.cities=[1,2].map(owner=>{const h=gameData.hexes[`${owner===1?-15:15},15`];return{id:'island-'+owner,owner,q:h.q,r:h.r,x:h.x,y:h.y};});
      for(const c of gameData.cities){for(let i=0;i<19;i++)createUnitAt('light',c.x,-c.y,c.owner,{startSpawn:true});createUnitAt('heavy',c.x,-c.y,c.owner,{startSpawn:true});}
      const before=auditStart().counts;wodDeployStartingArmy([1,2]);
      const after=auditStart();
      return {before,after,south:gameData.entities.filter(u=>u.y<0).length};
    });
    assert.deepEqual(fixture.after.counts,fixture.before,'deployment preserves balanced offshore ownership');
    assert.equal(fixture.south,0,'uninhabited islands receive no starting troops');
    assert.equal(fixture.after.orphanUnits.length,0);
    assert.deepEqual(Object.values(fixture.after.units),[20,20]);
    const neck=await page.evaluate(async()=>{
      WOD.makeBlankMap(40);gameData.entities=[];
      gameData.hexList=gameData.hexList.filter(h=>Math.abs(h.q)<=15&&Math.abs(h.r)<=10);
      gameData.hexes=Object.fromEntries(gameData.hexList.map(h=>[getHexKey(h),h]));
      for(const h of gameData.hexList){h.type='grass';h.owner=((h.q>=-14&&h.q<=-5||h.q>=-3&&h.q<=6)&&Math.abs(h.r)<=8||h.q===-4&&h.r===0)?1:2;}
      gameData.cities=[[-10,0,1],[12,0,2]].map(([q,r,owner])=>{const h=gameData.hexes[`${q},${r}`];return{id:'neck-'+owner,owner,q,r,x:h.x,y:h.y};});
      await wodExactEqualizePoliticalLandCounts([1,2],gameData.cities,700);
      const balanced=auditStart();
      // An isolated enclave on a populated island must reconnect politically.
      for(const key of ['10,7','11,7','10,8'])gameData.hexes[key].owner=1;
      wodRepairStartingLandSupply([1,2]);
      await wodExactEqualizePoliticalLandCounts([1,2],gameData.cities,700);
      return {balanced,repaired:auditStart()};
    });
    for(const state of [neck.balanced,neck.repaired]) {
      assert.equal(state.strandedLand.length,0,'narrow supply links and repaired enclaves stay supplied');
      assert(Math.max(...Object.values(state.counts))-Math.min(...Object.values(state.counts))<=1,'repair preserves equal land');
      assert.equal(state.foreignTowns,0);
    }
    console.log('offshore deployment, narrow corridors and enclave repair passed');
    const townFallback=await page.evaluate(async()=>{
      WOD.makeBlankMap(40);gameData.entities=[];
      for(const h of gameData.hexList){
        const big=h.q>=-20&&h.q<=0&&Math.abs(h.r)<=10,small=h.q>=12&&h.q<=20&&Math.abs(h.r)<=5;
        h.type=big||small?'grass':'water';h.owner=big?1:2;
      }
      gameData.cities=[[-10,0,1],[16,0,2]].map(([q,r,owner])=>{const h=gameData.hexes[`${q},${r}`];return{id:'fallback-'+owner,owner,q,r,x:h.x,y:h.y};});
      await wodExactEqualizePoliticalLandCounts([1,2],gameData.cities);
      const before=auditStart().counts;
      await wodBalanceStartingIslandTowns([1,2]);spawnInitialFrontlineUnits([1,2]);
      return {before,after:auditStart(),sharedIsland:gameData.cities.every(c=>c.q<=0)};
    });
    assert.notEqual(townFallback.before[1],townFallback.before[2],'fixture needs a shared-island town fallback');
    assert(townFallback.sharedIsland,'both factions can receive supplied land on the main island');
    assert.deepEqual(townFallback.after.counts,{1:270,2:270});
    assert.deepEqual(townFallback.after.cities,{1:1,2:1},'fallback preserves town counts');
    assert.equal(townFallback.after.orphanUnits.length,0);
    assert.equal(townFallback.after.strandedLand.length,0);
    assert.equal(townFallback.after.borderArmor,0);
    const offshoreCapture=await page.evaluate(()=>{
      WOD.makeBlankMap(40);gameData.entities=[];gameData.cities=[];gameData.forts=[];
      for(const h of gameData.hexList){h.type='water';h.owner=2;}
      for(const h of gameData.hexList)if(Math.abs(h.q)<=8&&Math.abs(h.r)<=4){h.type='grass';h.owner=h.q<0?1:2;}
      const left=gameData.hexList.filter(h=>h.type==='grass'&&h.owner===1);
      const work=()=>({encircledHexes:new Set(),encircledReliefHexes:new Set(),marineWaterSupplyHexes:new Set()});
      wodEncirclementApplyPocket(left,1,work());
      const emptyPreserved=left.every(h=>h.owner===1);
      const h=gameData.hexes['5,0'];createUnitAt('light',h.x,h.y,2,{startSpawn:true});
      wodEncirclementApplyPocket(left,1,work());
      const occupiedCaptures=left.every(h=>h.owner===2);
      for(const h of left)h.owner=1;
      const own=gameData.hexes['-5,0'],u=createUnitAt('light',own.x,own.y,1,{startSpawn:true}),w=work();
      wodEncirclementApplyPocket(left,1,w);gameData.encircledHexes=w.encircledHexes;gameData._encircWork=null;
      return {emptyPreserved,occupiedCaptures,infantryStillEncircled:!!wodGetUnitEncirclementState(u,own)};
    });
    assert(offshoreCapture.emptyPreserved&&offshoreCapture.occupiedCaptures&&offshoreCapture.infantryStillEncircled,'empty claims stay balanced; occupied islands use normal capture and supply rules');
    const shapes=['island','rectangle','ring','archipelago','forest','mountain','desert'];
    const cases=shapes.flatMap((shape,i)=>[2,3,4].map(players=>({shape,players,size:40,seed:230010+i*100+players})));
    cases.push(...['island','archipelago','mountain'].flatMap((shape,i)=>[2,4].map(players=>({shape,players,size:80,mp:players===4,seed:423000+i*100+players}))));
    cases.push(...['island','ring','archipelago'].map((shape,i)=>({shape,players:3,size:60,mp:true,slots:[1,3,4],seed:623000+i*100})));
    for(const c of cases) {
      if(process.env.WOD_SUPPLY_CASE && `${c.shape}-${c.players}-${c.size}`!==process.env.WOD_SUPPLY_CASE)continue;
      const result=await page.evaluate(async c=>{
        const g=gameData;
        g.loadedCustomMap=false;g._campaignRun=null;
        g.mp=c.mp?{enabled:true,factionSlots:c.slots||Array.from({length:c.players},(_,i)=>i+1)}:{enabled:false};g.aiCount=c.players-1;
        document.getElementById('setupAI').value=String(c.players-1);
        document.getElementById('setupMapSize').value=String(c.size);
        document.getElementById('mpCfgMapSize').value=String(c.size);
        document.getElementById('setupMapShape').value=c.shape;
        g._mapGenSeed=c.seed;g._wodReuseMapGenSeed=true;g._wodSkipMapGenLoader=true;
        g._mapGenOptions={cities:true,territory:true,units:true,mapShape:c.shape};
        const begin=performance.now();await generateMap();
        g._encircWork=null;g.encircledHexes=new Set();g.encirclementTimer=10;g._wodPlayerMovingN=0;
        updateEncirclements(2);let chunks=0;while(g._encircWork&&chunks++<1000)wodEncirclementProcessChunk();
        const encircledUnits=g.entities.filter(u=>u.type!=='ship'&&!!wodGetUnitEncirclementState(u,getNearestHexToPoint(u.x,u.y))).length;
        return {...auditStart(),encircledUnits,encirclementComplete:!g._encircWork,balance:g._startingLandBalance,ms:Math.round(performance.now()-begin)};
      },c);
      rows.push({...c,...result});
      const report=process.env.WOD_SUPPLY_CASE?'results-'+process.env.WOD_SUPPLY_CASE.replace(/[^a-z0-9-]/gi,'')+'.json':'results.json';
      fs.writeFileSync(path.join(OUT,report),JSON.stringify({fixture,neck,townFallback,offshoreCapture,rows,errors},null,2));
      console.log(JSON.stringify({ ...c,counts:result.counts,balance:result.balance,stranded:result.strandedLand.length,orphanUnits:result.orphanUnits.length,ms:result.ms}));
      assert.equal(result.orphanUnits.length,0,'all starting units supplied '+JSON.stringify(c));
      assert(result.encirclementComplete&&result.encircledUnits===0,'simulation agrees that starting units have supply');
      assert.equal(result.strandedLand.length,0,'no artificial populated-island enclaves '+JSON.stringify(c));
      assert.equal(result.foreignTowns,0);
      assert.equal(result.borderArmor,0);
      assert.equal(Object.keys(result.cities).length,c.players);
      assert.equal(new Set(Object.values(result.cities)).size,1,'equal town counts');
      const values=Object.values(result.counts);
      if(Math.max(...values)-Math.min(...values)>1) {
        fs.writeFileSync(path.join(OUT,'unbalanced-map.json'),JSON.stringify(await page.evaluate(()=>({hexes:gameData.hexList.map(h=>({q:h.q,r:h.r,type:h.type,owner:h.owner})),cities:gameData.cities.map(c=>({q:c.q,r:c.r,owner:c.owner})),protected:[...wodProtectedLandBalanceKeys(gameData.cities)]})),null,2));
      }
      assert(Math.max(...values)-Math.min(...values)<=1,'equal starting land '+JSON.stringify(c));
      const expected=Math.round(Math.max(12,Math.min(28,Math.floor(c.size/3.5)))*.5)+1;
      assert.equal(Object.keys(result.units).length,c.players,'every faction has its starting army');
      for(const [owner,n] of Object.entries(result.units)) {
        assert.equal(n,expected,'supply guard preserves full starting army');
        assert.equal(result.front[owner],Math.round(n*.2),'front quota');
      }
      if(c.shape==='archipelago'&&c.size===80) {
        await page.evaluate(()=>{
          gameData.fogOfWar=false;
          const extent=Math.max(...gameData.hexList.map(h=>Math.max(Math.abs(h.x),Math.abs(h.y))));
          gameData.camera.zoom=Math.min(canvas.clientWidth,canvas.clientHeight)/(extent*2.15);
          gameData.camera.x=-canvas.clientWidth/2;gameData.camera.y=-canvas.clientHeight/2;
          wodMarkTerrainFullDirty();updateTerrainCache();draw();
        });
        await page.screenshot({path:path.join(OUT,`archipelago-${c.players}.png`)});
      }
    }
    assert.equal(errors.length,0,errors.join('\n'));
    console.log(`Passed ${rows.length} seeded maps, independent supply and land-balance audits, with no browser errors.`);
  } finally {
    fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));
    await browser.close();server.close();for(const s of relay.clients)s.terminate();relay.close();
  }
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
