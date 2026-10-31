'use strict';
const crypto = require('crypto');
const catalog = require('./store-catalog');
const missionManifest = require('./mission-catalog.json');
const REVERSED = /^(Refunded|PartialRefund|Chargedback|RefundedSuspectedFraud|RefundedFriendlyFraud)$/;
const integer = (value, max) => Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));
const safeMap = object => object && typeof object === 'object' && !Array.isArray(object) ? object : {};
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
class CommerceError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function initializeAccount(data) {
  if (data.version) return;
  Object.assign(data, { version: 1, gold: 100, revision: 0, ownedSkins: { nato: true }, ownedVisuals: {},
    grants: {}, spends: {}, orders: {}, migrated: false, dlcActive: false, dlcGranted: false });
}
function isSupporter(data) {
  return !!data.dlcActive || Object.values(data.orders).some(o => o.product.supporter && o.granted && !o.reversed);
}
function wallet(data) {
  const ownedSkins = { ...data.ownedSkins };
  for (const base of ['goldenChip', 'supporterGold']) for (const id of catalog.premiumVariants(base)) ownedSkins[id] = base === 'supporterGold' ? isSupporter(data) : !!data.ownedSkins.goldenChip;
  return { gold: Math.max(0, data.gold), debt: Math.max(0, -data.gold), revision: data.revision,
    supporter: isSupporter(data), ownedSkins,
    ownedVisuals: data.ownedVisuals };
}
function knownSkin(id) { return id === 'nato' || id === 'goldenChip' || catalog.skins.includes(id) || Object.values(catalog.ancient).flat().includes(id); }
function importAndReward(data, progress) {
  progress = safeMap(progress);
  const matches = Object.entries(safeMap(progress.matchGoldGranted)).slice(-2000);
  const badges = Object.entries(safeMap(progress.achievementGoldGranted)).slice(0, 200);
  const rewards = [...matches.filter(([id]) => /^[a-zA-Z0-9_:.\-]{1,128}$/.test(id)).map(([id, value]) => ['match:' + id, integer(value, 50)]),
    ...badges.filter(([id, yes]) => yes && catalog.achievementIds.includes(id)).map(([id]) => ['badge:' + id, 10])];
  if (Number(progress.secrets?.creditsCoin) === 3) rewards.push(['credits-coin', 100]);
  if (!data.migrated) {
    // One-time import preserves earned currency and individually acquired items.
    // Launch flags/supporter fields never grant a paid product.
    const legacy = !progress.profile?.steamCommerceAccount;
    data.gold = legacy ? integer(progress.profile?.gold ?? 100, 1000000) : 100;
    for (const [id, yes] of Object.entries(safeMap(legacy && progress.profile?.ownedUnitSkins))) if (yes && knownSkin(id)) data.ownedSkins[id] = true;
    const missionIds = [...(missionManifest.maps || []), ...(missionManifest.missions || [])].map(e => 'shop_map_' + e.id);
    for (const [id, yes] of Object.entries(safeMap(legacy && progress.profile?.ownedShopVisuals))) if (yes && (catalog.visuals.includes(id) || missionIds.includes(id))) data.ownedVisuals[id] = true;
    for (const [id] of rewards) data.grants[id] = true;
    data.migrated = true;
  } else {
    for (const [id, amount] of rewards) if (!Object.hasOwn(data.grants, id)) { data.grants[id] = true; data.gold += amount; }
  }
  if (progress.achievements?.goldenChipMaster) data.ownedSkins.goldenChip = true;
}
function applyPaidState(data, order, params) {
  if (String(params.steamid) !== order.steamId || String(params.orderid) !== order.id || params.currency !== 'USD') throw new CommerceError('Steam transaction identity did not match.');
  const items = Array.isArray(params.items) ? params.items : params.items?.item;
  const amount = Number(items?.[0]?.amount), tax = Number(items?.[0]?.vat || 0);
  // Steam adds sales tax in some regions and includes VAT in others. Validate
  // our stored price against the verified net OR tax-inclusive Steam amount.
  const priceMatches = Number.isSafeInteger(amount) && Number.isSafeInteger(tax) && amount >= 0 && tax >= 0
    && (amount === order.product.usdCents || amount + tax === order.product.usdCents);
  if (!Array.isArray(items) || items.length !== 1 || Number(items[0].itemid) !== order.product.itemId || Number(items[0].qty) !== 1 || !priceMatches) throw new CommerceError('Steam transaction contents did not match.');
  if (REVERSED.test(params.status) || REVERSED.test(items[0].itemstatus)) {
    if (order.granted && !order.reversed) data.gold -= order.product.gold;
    order.reversed = true;
    order.status = params.status;
  } else if (params.status === 'Succeeded' && !order.reversed) {
    if (!order.granted) { data.gold += order.product.gold; order.granted = true; }
    order.status = 'Succeeded';
  }
}
class SteamCommerce {
  constructor({ store, steam, environment = 'sandbox', now = Date.now }) {
    Object.assign(this, { store, steam, environment, now });
    this.sessions = new Map();
    this.reportBusy = false;
  }
  async authenticate(ticket, progress) {
    if (typeof ticket !== 'string' || !/^(?:[a-f0-9]{2}){1,16384}$/i.test(ticket)) throw new CommerceError('Steam sign-in ticket is invalid.', 401);
    const auth = await this.steam.authenticate(ticket);
    if (auth?.result !== 'OK' || !/^\d{17}$/.test(String(auth.steamid)) || auth.publisherbanned) throw new CommerceError('Steam could not verify this account.', 401);
    const steamId = String(auth.steamid);
    const [base, dlc] = await Promise.all([this.steam.ownership(steamId, 5043620), this.steam.ownership(steamId, 5475970)]);
    if (!base?.ownsapp) throw new CommerceError('A Steam license for Simple Wars is required.', 403);
    const directDlcOwner = !!(dlc?.ownsapp && dlc.permanent && !dlc.sitelicense && !dlc.usercanceled && String(dlc.ownersteamid) === steamId);
    const state = await this.store.transaction(steamId, data => {
      if (!data.version && progress?.profile?.steamCommerceAccount === this.environment + ':' + steamId)
        throw new CommerceError('Your existing Steam wallet needs recovery. Please contact support before purchasing more gold.', 503);
      initializeAccount(data);
      importAndReward(data, progress);
      if (directDlcOwner && !data.dlcGranted) { data.gold += 5000; data.dlcGranted = true; }
      if (data.dlcActive && !directDlcOwner && data.dlcGranted && !data.dlcReversed) { data.gold -= 5000; data.dlcReversed = true; }
      data.dlcActive = directDlcOwner;
      data.revision++;
      return wallet(data);
    });
    for (const [key, session] of this.sessions) if (session.expires <= this.now()) this.sessions.delete(key);
    if (this.sessions.size >= 10000) throw new CommerceError('Store is busy. Please reconnect shortly.', 503);
    const token = crypto.randomBytes(32).toString('hex');
    this.sessions.set(digest(token), { steamId, expires: this.now() + 8 * 60 * 60 * 1000 });
    return { session: token, steamId, wallet: state, environment: this.environment };
  }
  session(token) {
    const session = typeof token === 'string' && token.length === 64 && this.sessions.get(digest(token));
    if (!session || session.expires <= this.now()) throw new CommerceError('Reconnect to Steam to use the store.', 401);
    return session;
  }
  async sync(session, progress) {
    return this.store.transaction(session.steamId, data => { initializeAccount(data); importAndReward(data, progress); data.revision++; return { wallet: wallet(data) }; });
  }
  async spend(session, request) {
    let items;
    try { items = catalog.shopItems(request, missionManifest); }
    catch (_) { throw new CommerceError('Unknown shop item.'); }
    return this.store.transaction(session.steamId, data => {
      initializeAccount(data);
      const remaining = items.filter(item => !item.grants.every(id => (item.kind === 'skin' ? data.ownedSkins : data.ownedVisuals)[id]));
      const cost = remaining.reduce((total, item) => total + item.price, 0);
      if (data.gold < cost) throw new CommerceError('Not enough gold.');
      data.gold -= cost;
      for (const item of remaining) for (const id of item.grants) (item.kind === 'skin' ? data.ownedSkins : data.ownedVisuals)[id] = true;
      data.revision++;
      return { wallet: wallet(data), cost, alreadyOwned: remaining.length === 0 };
    });
  }
  async begin(session, productId, requestId) {
    const product = Object.hasOwn(catalog.products, productId) ? catalog.products[productId] : null;
    if (!product || typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) throw new CommerceError('Unknown purchase.');
    const reservedId = await this.store.nextOrderId();
    const order = await this.store.transaction(session.steamId, data => {
      initializeAccount(data);
      const duplicate = Object.values(data.orders).find(o => o.requestId === requestId);
      if (duplicate) { if (duplicate.sku !== productId) throw new CommerceError('Purchase request does not match.'); return { ...duplicate, existing: true }; }
      if (product.supporter && isSupporter(data)) throw new CommerceError('You already own the Supporter Pack.');
      if (Object.values(data.orders).filter(o => this.now() - o.created < 60000).length >= 10) throw new CommerceError('Please wait a minute before starting another purchase.', 429);
      const pending = Object.values(data.orders).find(o => !o.granted && !o.reversed && !['Failed', 'Canceled'].includes(o.status) && this.now() - o.created < 30 * 60 * 1000);
      if (pending) throw new CommerceError('Finish or cancel your pending Steam purchase first.');
      const id = reservedId;
      const order = { id, requestId, sku: productId, product: { ...product }, steamId: session.steamId, created: this.now(), status: 'Creating', granted: false, reversed: false };
      data.orders[id] = order;
      return order;
    });
    if (order.existing) return { orderId: order.id, pending: !order.granted, wallet: await this.getWallet(session) };
    try {
      await this.steam.microRequest('InitTxn', 3, { orderid: order.id, steamid: session.steamId, itemcount: 1,
        language: 'en', currency: 'USD', usersession: 'client', 'itemid[0]': product.itemId, 'qty[0]': 1,
        'amount[0]': product.usdCents, 'description[0]': 'Simple Wars — ' + product.name, 'category[0]': product.supporter ? 'Supporter' : 'Gold' }, true);
      await this.store.transaction(session.steamId, data => { if (!data.orders[order.id].granted) data.orders[order.id].status = 'Init'; });
    } catch (error) {
      // No grant on an ambiguous timeout. Query the stored order before any retry.
      await this.store.transaction(session.steamId, data => { data.orders[order.id].status = 'Unconfirmed'; });
      throw new CommerceError('Steam could not open checkout. Refresh purchases before trying again.', 502);
    }
    return { orderId: order.id, pending: true };
  }
  async getWallet(session) { return this.store.transaction(session.steamId, data => { initializeAccount(data); return wallet(data); }); }
  async resolve(session, orderId, authorized) {
    if (!/^\d{1,20}$/.test(String(orderId))) throw new CommerceError('Invalid order.');
    return this.store.transaction(session.steamId, async data => {
      const order = data.orders?.[orderId];
      if (!order || order.steamId !== session.steamId) throw new CommerceError('Purchase does not belong to this account.', 403);
      if (order.reversed) return { wallet: wallet(data), pending: false, status: order.status };
      let params = await this.steam.microRequest('QueryTxn', 3, { orderid: order.id });
      if (authorized === true && params.status === 'Approved') {
        // A browser callback alone never proves payment. Check Steam first.
        applyPaidState(data, order, params);
        try { await this.steam.microRequest('FinalizeTxn', 2, { orderid: order.id }, true); }
        catch (_) { /* Query below resolves an ambiguous finalization response. */ }
        params = await this.steam.microRequest('QueryTxn', 3, { orderid: order.id });
      }
      applyPaidState(data, order, params);
      if (authorized === false && params.status === 'Init') order.status = 'Canceled';
      else if (params.status === 'Failed') order.status = 'Failed';
      data.revision++;
      return { wallet: wallet(data), pending: !order.granted && !order.reversed && !['Canceled', 'Failed'].includes(order.status), status: order.status };
    });
  }
  async refresh(session) {
    const orders = await this.store.transaction(session.steamId, data => Object.values(data.orders || {}).filter(o => !o.reversed && (o.granted || this.now() - o.created < 86400000)).slice(-30).map(o => o.id));
    for (const id of orders) {
      // Steam's Approved state proves user consent even if the native callback
      // was interrupted. Unapproved Init orders still cannot be captured.
      await this.resolve(session, id, true).catch(() => {});
    }
    return { wallet: await this.getWallet(session) };
  }
  async reconcile() {
    if (this.reportBusy) return;
    this.reportBusy = true;
    try {
      const cursor = await this.store.getCursor();
      const report = await this.steam.microRequest('GetReport', 5, { type: 'SETTLEMENT', time: cursor, maxresults: 1000 });
      const orders = report?.orders || [];
      let latest = cursor;
      for (const params of orders) {
        if (!/^\d{17}$/.test(String(params.steamid))) continue;
        await this.store.transaction(String(params.steamid), data => {
          const order = data.orders?.[params.orderid];
          if (order) { applyPaidState(data, order, params); data.revision++; }
        });
        if (params.time && params.time > latest) latest = params.time;
      }
      // Overlap the boundary so same-second settlements are never skipped.
      if (latest > cursor) await this.store.setCursor(new Date(Date.parse(latest) - 1000).toISOString().replace('.000Z', 'Z'));
    } finally { this.reportBusy = false; }
  }
}
module.exports = { SteamCommerce, CommerceError, wallet, applyPaidState };
