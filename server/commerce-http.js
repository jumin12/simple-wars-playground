'use strict';
const { CommerceStore } = require('./commerce-store');
const { SteamApi } = require('./steam-api');
const { SteamCommerce, CommerceError } = require('./steam-commerce');
const catalog = require('./store-catalog');
const crypto = require('crypto');
function createCommerceHttp(env = process.env, testService) {
  const environment = env.STEAM_MICROTXN_MODE === 'live' ? 'live' : 'sandbox';
  let commerce = testService || null, store = null, initializing = null;
  const authRates = new Map();
  async function initialize() {
    if (commerce || initializing || env.STEAM_PURCHASES_ENABLED !== '1' || !env.STEAM_PUBLISHER_KEY || !env.DATABASE_URL) return;
    initializing = (async () => {
      store = new CommerceStore(env.DATABASE_URL, environment);
      try {
        await store.initialize();
        const steam = new SteamApi(env.STEAM_PUBLISHER_KEY, environment);
        await steam.microRequest('GetReport', 5, { type: 'SETTLEMENT', time: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), maxresults: 1 });
        commerce = new SteamCommerce({ store, steam, environment });
      } catch (_) {
        console.warn('[commerce] store verification unavailable; checkout remains disabled');
        await store.close().catch(() => {}); store = null;
      }
    })().finally(() => { initializing = null; });
    await initializing;
  }
  void initialize();
  const timer = setInterval(() => {
    void initialize();
    if (commerce) void commerce.reconcile().catch(() => console.warn('[commerce] settlement reconciliation will retry'));
    for (const [key, value] of authRates) if (value.until < Date.now()) authRates.delete(key);
  }, 60000);
  timer.unref();
  function reply(res, status, body) {
    if (res.destroyed) return;
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(body));
  }
  async function readBody(req) {
    let size = 0, chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 256 * 1024) throw new CommerceError('Purchase request is too large.', 413);
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch (_) { throw new CommerceError('Invalid purchase request.'); }
  }
  async function handle(req, res) {
    try {
      const action = req.url.split('?')[0].replace(/^\/api\/steam\//, '');
      if (action === 'catalog' && req.method === 'GET') {
        reply(res, 200, { ready: !!commerce, environment, currency: 'USD', products: catalog.products }); return;
      }
      if (req.method !== 'POST') throw new CommerceError('Use POST for store requests.', 405);
      if (!commerce) throw new CommerceError('Steam checkout is not available yet. Please try again later.', 503);
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new CommerceError('Use a JSON purchase request.', 415);
      const body = await readBody(req);
      let result;
      if (action === 'authenticate') {
        const address = env.RENDER === 'true' ? String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0] : req.socket.remoteAddress;
        const key = crypto.createHash('sha256').update(String(address)).digest('hex');
        const rate = authRates.get(key) || { count: 0, until: Date.now() + 60000 };
        if (++rate.count > 30) throw new CommerceError('Too many Steam sign-in attempts. Please wait a minute.', 429);
        authRates.set(key, rate);
        result = await commerce.authenticate(body.ticket, body.progress);
      } else {
        const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
        const session = commerce.session(token);
        if (action === 'multiplayer') result = await require('./profiles').steamIdentity(session.steamId,body.progress);
        else if (action === 'sync') result = await commerce.sync(session, body.progress);
        else if (action === 'spend') result = await commerce.spend(session, body);
        else if (action === 'begin') result = await commerce.begin(session, body.productId, body.requestId);
        else if (action === 'resolve') result = await commerce.resolve(session, body.orderId, body.authorized);
        else if (action === 'refresh') result = await commerce.refresh(session);
        else throw new CommerceError('Unknown store action.', 404);
      }
      reply(res, 200, { ok: true, ...result });
    } catch (error) {
      const status = error instanceof CommerceError ? error.status : error.name === 'SteamApiError' ? 502 : 503;
      reply(res, status, { ok: false, error: error instanceof CommerceError ? error.message : 'The Steam store is temporarily unavailable. Your purchases are preserved.' });
    }
  }
  async function profileWallet(steamId,progress,purchase){
    if(!commerce){if(env.STEAM_PURCHASES_ENABLED==='1')throw new CommerceError('Steam wallet is temporarily unavailable. Please try again.',503);return null;}
    const session={steamId};
    return purchase?await commerce.spend(session,purchase):progress?await commerce.sync(session,progress):{wallet:await commerce.getWallet(session)};
  }
  return { handle,profileWallet, close: async () => { clearInterval(timer); if (store) await store.close(); } };
}
module.exports = { createCommerceHttp };
