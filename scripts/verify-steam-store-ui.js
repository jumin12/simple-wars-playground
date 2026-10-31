'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),crypto=require('crypto'),{spawn}=require('child_process');
const {chromium}=require('playwright'),{WebSocketServer}=require('../server/node_modules/ws'),{PGlite}=require('../server/node_modules/@electric-sql/pglite');
const {CommerceStore}=require('../server/commerce-store'),{SteamCommerce}=require('../server/steam-commerce'),{createCommerceHttp}=require('../server/commerce-http'),{createDesktopCommerce}=require('../desktop/commerce');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/steam-store-ui');fs.mkdirSync(OUT,{recursive:true});
let server,router,native,store,browser,relay,origin;const steamId='76561198000000201',orders=new Map(),events=[];
const readBody=async req=>{let body='';for await(const part of req)body+=part;return JSON.parse(body||'{}');};
(async()=>{
 const db=new PGlite();let tail=Promise.resolve();const pool={query:(...args)=>db.query(...args),on(){},async connect(){const prior=tail;let release;tail=new Promise(r=>release=r);await prior;return{query:(...args)=>db.query(...args),release};},end:()=>db.close()};
 store=new CommerceStore('','sandbox',pool);await store.initialize();
 const steam={authenticate:async()=>({result:'OK',steamid:steamId}),ownership:async(id,app)=>({ownsapp:app===5043620,permanent:true,ownersteamid:id}),microRequest:async(method,version,p)=>{
  if(method==='InitTxn'){orders.set(p.orderid,{orderid:p.orderid,steamid:steamId,currency:'USD',status:'Init',items:[{itemid:p['itemid[0]'],qty:1,amount:p['amount[0]'],vat:0,itemstatus:'Init'}]});return{};}
  if(method==='QueryTxn')return structuredClone(orders.get(p.orderid));
  if(method==='FinalizeTxn'){const o=orders.get(p.orderid);o.status=o.items[0].itemstatus='Succeeded';return{};}
  if(method==='GetReport')return{orders:[]};throw Error(method);
 }};
 router=createCommerceHttp({STEAM_MICROTXN_MODE:'sandbox'},new SteamCommerce({store,steam}));
 server=http.createServer(async(req,res)=>{
  if(req.url.startsWith('/api/steam/'))return router.handle(req,res);
  if(req.url==='/__events'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(events.splice(0)));}
  if(req.url==='/__native'){
   try{const body=await readBody(req),result=await native.action(body.action,body.payload);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,...result}));}
   catch(error){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:false,error:error.message}));}return;
  }
  const file=path.resolve(ROOT,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
  if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();
  fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[path.extname(file)]||'application/octet-stream');res.end(data);});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 native=createDesktopCommerce({getClient:()=>({localplayer:{getSteamId:()=>({steamId64:BigInt(steamId)})},auth:{getAuthTicketForWebApi:async()=>({getBytes:()=>crypto.randomBytes(128),cancel(){}})}}),notify:message=>events.push(message),request:(url,opts)=>fetch(origin+new URL(url).pathname,opts)});
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.routeWebSocket(/.*/,socket=>{socket.onMessage(()=>{});setTimeout(()=>socket.send(JSON.stringify({t:'welcome',online:0,lobbies:[]})),30);});
 await context.addInitScript(()=>{
  window.simpleWarsDesktop={quit(){},unlockAchievement(){},store:async(action,payload)=>(await fetch('/__native',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload})})).json(),onStoreUpdate(callback){setInterval(async()=>{try{for(const result of await(await fetch('/__events')).json())callback(result);}catch(_){}},80);}};
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.stack));
 try{
  await page.goto(origin);await page.waitForFunction(()=>WodSteamStore.state.connected&&!window._wodBootBusy&&!window._wodMenuBootstrapBusy,null,{timeout:180000});
  await page.evaluate(()=>{wodDismissChangelogPopup();pauseMenuBackgroundBattle();showPanel('shop');switchShopTab('gold');});
  assert.equal(await page.evaluate(()=>gameData.gold),100);
  async function buy(sku,gold){const before=orders.size;await page.locator('[data-steam-product="'+sku+'"]').click();await page.waitForFunction(()=>!WodSteamStore.state.busy);assert.equal(orders.size,before+1);const order=[...orders.values()].at(-1);assert.equal(await page.evaluate(()=>gameData.gold),gold-require('../store-catalog').products[sku].gold,'no credit before capture');order.status='Approved';await native.onAuthorized({app_id:5043620,order_id:BigInt(order.orderid),authorized:true});await page.waitForFunction(expected=>gameData.gold===expected,gold);}
  await buy('gold1000',1100);
  await page.evaluate(()=>{switchShopTab('troops');purchaseUnitSkin('atlasUnits');});await page.waitForFunction(()=>!WodSteamStore.state.busy&&gameData.ownedUnitSkins.atlasUnits);assert.equal(await page.evaluate(()=>gameData.gold),600);
  await page.evaluate(()=>switchShopTab('gold'));await buy('gold6000',6600);await buy('gold15000',21600);await buy('supporter',26600);
  assert(await page.evaluate(()=>wodHasSupporterPack()&&!wodShopSkinOwned('civRome')),'supporter is exclusive art plus gold, not whole-shop unlock');
  assert.equal(await page.locator('#supporterPackBtn').innerText(),'Supporter Pack owned');
  const products=await page.evaluate(()=>({skin:wodShopSkinCost('napoleonic'),roman:wodShopSkinCost('civRome'),visual:WOD_SHOP_VISUAL_COST,mission:wodShopMapCatalog.find(e=>e.id==='normandy-dday').price}));assert.deepEqual(products,{skin:500,roman:1000,visual:500,mission:1000});
  await page.evaluate(()=>{switchShopTab('command');syncShopVisualOptionsUi();});assert(!/\b100g\b/.test(await page.locator('#shopPanel').innerText()),'no old visual price labels');
  await page.evaluate(()=>{wodProgress.achievements.goldenChipMaster=true;WodSteamStore.queueSync();});await page.waitForFunction(()=>WodSteamStore.state.wallet.ownedSkins.goldenChip);
  const eras=[];
  for(const period of ['modern','napoleonic','medieval','ancient']){
   const id='supporterGold'+(period==='modern'?'':'_'+period);
   await page.evaluate(id=>{switchShopTab('troops');equipShopSkinChoice('player',id);},id);
   assert.equal(await page.evaluate(()=>gameData.gamePeriod),period);assert.equal(await page.evaluate(()=>gameData.unitSkin),id);
   await page.screenshot({path:path.join(OUT,'desktop-'+period+'.png')});eras.push(period);
  }
  const sheet=await page.evaluate(()=>{
   const c=document.createElement('canvas');c.width=1200;c.height=1850;const x=c.getContext('2d');x.fillStyle='#111e29';x.fillRect(0,0,c.width,c.height);
   const types=['light','motorized','mountaineer','marine','heavy','ship','transport','supply'],oldState=gameState,oldPeriod=gameData.gamePeriod;gameState='MENU';let row=0;
   for(const skin of ['supporterGold','goldenChip','ruseFrance'])for(const period of ['modern','napoleonic','medieval','ancient']){
    gameData.gamePeriod=period;x.fillStyle='#d6c59f';x.font='bold 19px Arial';x.fillText(({supporterGold:'Patron Gold',goldenChip:'Sovereign',ruseFrance:'WW2 chips'})[skin]+' / '+period,25,row*150+27);
    types.forEach((type,i)=>{x.save();x.translate(76+i*149,row*150+82);wodDrawUnitBodyUncached(x,{type,owner:1,x:0,y:0},34,'#65bc8d',skin);x.restore();x.fillStyle='#adbecb';x.font='12px Arial';x.textAlign='center';x.fillText(WOD_SPECIALIST_UNITS[type]?wodSpecialistLabel(type,period):(wodPeriodFlavor(period)[type]||type),76+i*149,row*150+137);x.textAlign='left';});row++;
   }
   gameState=oldState;gameData.gamePeriod=oldPeriod;return c.toDataURL('image/png').split(',')[1];
  });fs.writeFileSync(path.join(OUT,'all-unit-era-art.png'),Buffer.from(sheet,'base64'));
  const mobile=[];
  for(const size of [{width:390,height:844},{width:320,height:740},{width:844,height:390}]){
   await page.setViewportSize(size);await page.evaluate(()=>switchShopTab('gold'));await page.waitForTimeout(200);
   const layout=await page.evaluate(()=>{const p=document.querySelector('#shopPanel .panel');return{width:p.clientWidth,scrollWidth:p.scrollWidth,buttons:[...document.querySelectorAll('[data-steam-product]')].map(e=>{const r=e.getBoundingClientRect();return{width:r.width,height:r.height};})};});
   assert(layout.scrollWidth<=layout.width+2,'no horizontal overflow');assert(layout.buttons.every(b=>b.height>=43),'real touch targets');
   await page.locator('[data-steam-product="gold6000"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(OUT,'gold-'+size.width+'x'+size.height+'.png')});
   await page.locator('#supporterPackCard').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(OUT,'supporter-'+size.width+'x'+size.height+'.png')});mobile.push({...size,...layout});
  }
  await page.evaluate(()=>WodSteamStore.refresh());await page.waitForFunction(()=>!WodSteamStore.state.busy);assert.equal(await page.evaluate(()=>gameData.gold),26600);
  await page.setViewportSize({width:1440,height:900});await page.goto(origin+'/?autostart=1');
  await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks&&WodSteamStore.state.connected,null,{timeout:180000});
  const match=await page.evaluate(()=>{setGameSpeed(0,true);wodDismissChangelogPopup();gameData.unitSkin='supporterGold_ancient';gameData._matchPeriod='ancient';
   const general=gameData.entities.find(u=>u.owner===1&&u.isGeneral);gameData.selection=[general];for(const u of gameData.entities)u.selected=u===general;gameData.camera={zoom:2,x:general.x*2-innerWidth/2,y:general.y*2-innerHeight*.4};syncInfoCardPanel();wodMarkTerrainFullDirty();
   return{skin:getEffectiveUnitSkin(general),gold:gameData.gold,general:general.isGeneral};});
  assert.deepEqual(match,{skin:'supporterGold_ancient',gold:26600,general:true});await page.waitForTimeout(200);await page.screenshot({path:path.join(OUT,'patron-in-battle.png')});
  await page.evaluate(()=>{gameState='MENU';pauseMenuBackgroundBattle();showPanel('settings');});await page.locator('#settingsPanel [onclick="resetAllGameProgress()"]').click();
  await page.locator('#wodConfirmDlgOk').click();await page.waitForFunction(()=>document.getElementById('wodConfirmDlg').classList.contains('hidden'));
  assert(await page.evaluate(()=>gameData.gold===26600&&wodHasSupporterPack()&&gameData.ownedUnitSkins.atlasUnits),'progress reset preserves the Steam wallet and collection');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({products,eras,mobile,paidCheckout:true,noCreditBeforeCapture:true,restore:true,errors},null,2));console.log(JSON.stringify({products,eras,mobile:mobile.length,paidCheckout:true,errors}));
 }finally{fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors,null,2));await browser.close();browser=null;await router.close();await store.close();store=null;server.close();}
 // Required browser gameplay smoke uses the bundled action client and local relay.
 relay=new WebSocketServer({port:8080});relay.on('connection',s=>s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]})));
 server=http.createServer((req,res)=>{const f=path.resolve(ROOT,'.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[path.extname(f)]||'application/octet-stream');res.end(b);});});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const skill=path.join(require('os').homedir(),'.codex/skills/develop-web-game'),client=path.join(OUT,'client.mjs');fs.copyFileSync(path.join(skill,'scripts/web_game_playwright_client.js'),client);
 try{await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[client,'--url','http://127.0.0.1:'+server.address().port+'/?autostart=1','--actions-file',path.join(skill,'references/action_payloads.json'),'--iterations','1','--pause-ms','5000','--screenshot-dir',path.join(OUT,'skill')],{stdio:'inherit'});child.on('exit',code=>code===0?resolve():reject(Error('Client '+code)));});}
 finally{for(const s of relay.clients)s.terminate();relay.close();server.close();}
})().catch(async error=>{console.error(error);if(browser)await browser.close();if(store)await store.close();if(server)server.close();if(router)await router.close();process.exitCode=1;});
