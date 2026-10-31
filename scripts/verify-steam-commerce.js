'use strict';
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), crypto = require('crypto'), http = require('http'), vm = require('vm');
const { PGlite } = require('../server/node_modules/@electric-sql/pglite');
const { CommerceStore } = require('../server/commerce-store');
const { SteamCommerce } = require('../server/steam-commerce');
const { SteamApi } = require('../server/steam-api');
const { createDesktopCommerce } = require('../desktop/commerce');
const catalog = require('../store-catalog');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'output/steam-commerce'); fs.mkdirSync(OUT, { recursive: true });
const A = '76561198000000101', B = '76561198000000102', C = '76561198000000103';
const secret = crypto.randomBytes(16).toString('hex'), ticket = crypto.randomBytes(128).toString('hex');
const fixture = { steamId: A, dlc: false, dlcOwner: A, ownsGame: true, orders: new Map(), calls: [], finalizeCount: 0, loseFinalizeResponse: false, settle: [] };
let pool, store, service, directory, failCommit = false;
function makePool(db) {
  let tail = Promise.resolve();
  const query = async (sql, values) => {
    if (failCommit && sql.startsWith('UPDATE steam_commerce_accounts')) { failCommit = false; throw Error('Simulated database write interruption'); }
    return db.query(sql, values);
  };
  return { query, on() {}, async connect() { const previous = tail; let release; tail = new Promise(r => release = r); await previous; return { query, release }; }, end: () => db.close() };
}
async function transport(url, options) {
  const parsed = new URL(url), method = parsed.pathname.split('/')[2], params = options.method === 'POST' ? options.body : parsed.searchParams;
  assert.equal(params.get('key'), secret, 'publisher key stays server side');
  fixture.calls.push({ service: parsed.pathname.split('/')[1], method });
  const id = params.get('orderid'); let body;
  if (method === 'AuthenticateUserTicket') body = { response: { params: { result: 'OK', steamid: fixture.steamId } } };
  else if (method === 'CheckAppOwnership') body = { appownership: { ownsapp: params.get('appid') === '5043620' ? fixture.ownsGame : fixture.dlc, permanent: true, ownersteamid: fixture.dlcOwner } };
  else if (method === 'InitTxn') {
    assert.equal(params.get('currency'), 'USD'); assert.equal(params.get('usersession'), 'client');
    fixture.orders.set(id, { orderid: id, steamid: params.get('steamid'), currency: 'USD', status: 'Init', items: [{ itemid: Number(params.get('itemid[0]')), qty: 1, amount: Number(params.get('amount[0]')), vat: 0, itemstatus: 'Init' }] });
    body = { response: { result: 'OK', params: { orderid: id } } };
  } else if (method === 'QueryTxn') body = { response: { result: 'OK', params: fixture.orders.get(id) } };
  else if (method === 'FinalizeTxn') {
    fixture.finalizeCount++; const order = fixture.orders.get(id); order.status = order.items[0].itemstatus = 'Succeeded';
    if (fixture.loseFinalizeResponse) { fixture.loseFinalizeResponse = false; throw Error('Transport failure ' + url); }
    body = { response: { result: 'OK', params: { orderid: id } } };
  } else if (method === 'GetReport') body = { response: { result: 'OK', params: { orders: fixture.settle } } };
  else throw Error('Unexpected API method ' + method);
  return { ok: true, json: async () => JSON.parse(JSON.stringify(body)) };
}
async function open() {
  pool = makePool(new PGlite(directory));
  store = new CommerceStore('', 'sandbox', pool); await store.initialize();
  service = new SteamCommerce({ store, steam: new SteamApi(secret, 'sandbox', transport) });
}
async function login(progress = { profile: { gold: 100 } }) { return service.authenticate(ticket, progress); }
async function paid(session, sku, { interrupt = false, lostResponse = false } = {}) {
  const order = await service.begin(session, sku, crypto.randomUUID());
  fixture.orders.get(order.orderId).status = 'Approved';
  fixture.loseFinalizeResponse = lostResponse;
  if (interrupt) {
    const base = service.steam.microRequest.bind(service.steam);
    service.steam.microRequest = async (...args) => { const result = await base(...args); if (args[0] === 'FinalizeTxn') failCommit = true; return result; };
    await assert.rejects(service.resolve(session, order.orderId, true), /database write/);
    service.steam.microRequest = base;
    return service.resolve(session, order.orderId, true);
  }
  return service.resolve(session, order.orderId, true);
}
(async () => {
  for (const match of fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) if (match[1].trim()) new vm.Script(match[1]);
  directory = fs.mkdtempSync(path.join(OUT, 'postgres-'));
  await open();
  const results = {};
  try {
    await assert.rejects(service.authenticate('bad', {}), /ticket/);
    fixture.ownsGame = false; await assert.rejects(login(), /license/); fixture.ownsGame = true;
    const auth = await login({ profile: { gold: 100, supporterPack: true, ownedUnitSkins: { nato: true, usa: true, supporterGold: true } } });
    assert.equal(auth.wallet.gold, 100); assert(!auth.wallet.supporter); assert(auth.wallet.ownedSkins.usa); assert(!auth.wallet.ownedSkins.supporterGold);
    const session = service.session(auth.session);
    const first = await service.begin(session, 'gold1000', 'request-01234567890');
    const duplicate = await service.begin(session, 'gold1000', 'request-01234567890'); assert.equal(first.orderId, duplicate.orderId);
    assert(BigInt(first.orderId) > BigInt(Number.MAX_SAFE_INTEGER), 'uint64 order remains exact');
    assert.equal((await service.resolve(session, first.orderId, true)).wallet.gold, 100, 'authorization without Steam approval cannot grant');
    fixture.orders.get(first.orderId).status = 'Approved';
    await service.resolve(session, first.orderId, true); const repeated = await service.resolve(session, first.orderId, true);
    assert.equal(repeated.wallet.gold, 1100); assert.equal(fixture.finalizeCount, 1);
    await assert.rejects(service.resolve({ steamId: B }, first.orderId, true), /belong/);
    const canceled = await service.begin(session, 'gold1000', crypto.randomUUID());
    assert.equal((await service.resolve(session, canceled.orderId, false)).wallet.gold, 1100);
    assert.equal((await paid(session, 'gold6000', { lostResponse: true })).wallet.gold, 7100);
    assert.equal((await paid(session, 'gold15000', { interrupt: true })).wallet.gold, 22100, 'captured payment recovers after SQL rollback');
    const supporter = await paid(session, 'supporter'); assert.equal(supporter.wallet.gold, 27100); assert(supporter.wallet.supporter);
    for (const id of catalog.premiumVariants('supporterGold')) assert(supporter.wallet.ownedSkins[id]);
    await assert.rejects(service.begin(session, 'supporter', crypto.randomUUID()), /already own/);
    const forged = await service.sync(session, { profile: { gold: 999999999, supporterPack: true } }); assert.equal(forged.wallet.gold, 27100);
    const receipt = { matchGoldGranted: { 'battle-one': 5000 }, achievementGoldGranted: { brokenShield: true, inventedBadge: true }, secrets: { creditsCoin: 3 } };
    const earned = await service.sync(session, receipt); assert.equal(earned.wallet.gold, 27260);
    assert.equal((await service.sync(session, receipt)).wallet.gold, 27260);
    const skin = await service.spend(session, { kind: 'skin', itemId: 'atlasUnits', price: 1 }); assert.equal(skin.cost, 500); assert.equal(skin.wallet.gold, 26760);
    const map = await service.spend(session, { kind: 'map', itemId: 'shop_map_normandy-dday', price: 1 }); assert.equal(map.cost, 1000); assert.equal(map.wallet.gold, 25760);
    await assert.rejects(service.spend(session, {kind:'map',itemId:'shop_map_fake',price:1}), /Unknown/);
    const romans = await service.spend(session, {kind:'skin',itemId:'civRome'}); assert.equal(romans.cost,1000); assert(romans.wallet.ownedSkins.civRome2);
    assert.equal((await service.spend(session, {kind:'skin',itemId:'civRome'})).cost,0);
    const recentSupporter = [...fixture.orders.values()].find(order => order.items[0].itemid === 100);
    recentSupporter.status = recentSupporter.items[0].itemstatus = 'Refunded'; recentSupporter.time = '2026-10-31T01:01:01Z';
    fixture.settle = [recentSupporter]; await service.reconcile(); const refunded = await service.getWallet(session);
    assert.equal(refunded.gold, 19760); assert(!refunded.supporter); await service.reconcile(); assert.equal((await service.getWallet(session)).gold, 19760);
    fixture.steamId = C; fixture.dlc = false;
    const poorAuth = await login({profile:{gold:500}}), poor = service.session(poorAuth.session);
    const competition = await Promise.allSettled([service.spend(poor,{kind:'skin',itemId:'france'}),service.spend(poor,{kind:'skin',itemId:'germany'})]);
    assert.equal(competition.filter(r=>r.status==='fulfilled').length,1); assert.equal((await service.getWallet(poor)).gold,0);
    fixture.steamId = B; fixture.dlc = true; fixture.dlcOwner = B;
    const owner = await login(); assert.equal(owner.wallet.gold,5100); assert(owner.wallet.supporter);
    const bound = service.session(owner.session); assert.equal((await login()).wallet.gold,5100);
    fixture.steamId = C; fixture.dlcOwner = B; const borrowed = await login(); assert(!borrowed.wallet.supporter); assert.equal(borrowed.wallet.gold,0);
    await store.close(); await open(); fixture.steamId = B;
    const restored = await login({profile:{gold:9999999}}); assert.equal(restored.wallet.gold,5100); assert(restored.wallet.supporter);
    fixture.dlc = false; const removed = await login(); assert.equal(removed.wallet.gold,100); assert(!removed.wallet.supporter);
    await login(); assert.equal((await service.getWallet(service.session(removed.session))).gold,100);
    fixture.steamId = A; const again = await login({profile:{gold:9999999}}); assert.equal(again.wallet.gold,19760); assert(again.wallet.ownedSkins.atlasUnits);
    const unrevealing = new SteamApi(secret,'sandbox',async url=>{throw Error(url);});
    await assert.rejects(unrevealing.authenticate(ticket), error=>!error.message.includes(secret)&&!error.message.includes(ticket));
    assert(fixture.calls.filter(c=>['InitTxn','FinalizeTxn','QueryTxn','GetReport'].includes(c.method)).every(c=>c.service==='ISteamMicroTxnSandbox'));
    results.postgres = { rollbackRecovery:true, concurrentSpends:true, coldRestart:true, exactOrderIds:true };
    results.steam = { verifiedIdentity:true, fourProducts:true, duplicateCallback:true, canceledPurchase:true, receiptDeduplication:true, serverPrices:true, refunds:true, directDlcOwnersOnly:true, secretsRedacted:true, sandboxOnly:true };
    const notifications=[];let capturedAction;
    const native=createDesktopCommerce({getClient:()=>({localplayer:{getSteamId:()=>({steamId64:BigInt(A)})},auth:{getAuthTicketForWebApi:async identity=>{assert.equal(identity,'simple-wars-store');return{getBytes:()=>Buffer.from(ticket,'hex'),cancel(){}};}}}),notify:result=>notifications.push(result),request:async(url,options)=>{
      capturedAction=url.split('/').pop();const body=JSON.parse(options.body);
      assert(!JSON.stringify(body).includes(secret));
      return{ok:true,json:async()=>({ok:true,...(capturedAction==='authenticate'?{session:crypto.randomBytes(32).toString('hex'),steamId:A,environment:'sandbox',wallet:again.wallet}:{wallet:again.wallet,status:'Succeeded',pending:false})})};
    }});
    const nativeAuth=await native.action('connect',{progress:{}});assert(!nativeAuth.session,'bearer session never reaches renderer');
    await native.onAuthorized({app_id:5043620,order_id:9223372036854775001n,authorized:true}); assert.equal(notifications[0].orderId,'9223372036854775001');
    await native.onAuthorized({app_id:999,order_id:1n,authorized:true});assert.equal(notifications.length,1);
    await assert.rejects(native.action('https://evil.example',{}),/Unknown/);native.close();results.nativeBridge=true;
    fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
  } finally { await store.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
