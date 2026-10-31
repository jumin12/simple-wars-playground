'use strict';
// Runs only in Electron's main process. Steam tickets and bearer sessions never
// enter localStorage, page scripts, URLs, logs or the distributed game assets.
const API = 'https://simple-wars.onrender.com/api/steam/';
function createDesktopCommerce({ getClient, notify, request = fetch }) {
  let session = '', steamId = '', environment = '', ticket = null, connecting = null, lastProgress = null, authenticatedAt = 0;
  async function post(action, body = {}) {
    let response, data;
    try {
      response = await request(API + action, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: 'Bearer ' + session } : {}) },
        body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
      data = await response.json();
    } catch (_) { throw new Error('Could not reach the Steam store. Please try again.'); }
    if (!response.ok || !data.ok) { if (response.status === 401) session = ''; const error = new Error(data.error || 'Steam could not complete this request.'); error.status = response.status; throw error; }
    return data;
  }
  async function connect(progress) {
    if (connecting) return connecting;
    connecting = (async () => {
      const client = getClient();
      if (!client) throw new Error('Launch Simple Wars through Steam to purchase gold.');
      const currentId = String(client.localplayer.getSteamId().steamId64);
      lastProgress = progress;
      if (session && currentId === steamId && Date.now() - authenticatedAt < 5 * 60 * 1000) return { ...(await post('sync', { progress })), steamId, environment };
      session = ''; steamId = currentId;
      if (ticket) ticket.cancel();
      ticket = await client.auth.getAuthTicketForWebApi('simple-wars-store', 15);
      const result = await post('authenticate', { ticket: ticket.getBytes().toString('hex'), progress });
      if (result.steamId !== currentId) throw new Error('Steam account verification failed.');
      session = result.session; environment = result.environment; authenticatedAt = Date.now();
      return { wallet: result.wallet, steamId, environment };
    })().finally(() => { connecting = null; });
    return connecting;
  }
  async function action(name, body) {
    if (name === 'identity') {
      const client = getClient();
      return { steamId: client ? String(client.localplayer.getSteamId().steamId64) : '' };
    }
    const allowed = ['connect', 'sync', 'spend', 'begin', 'refresh'];
    if (!allowed.includes(name)) throw new Error('Unknown Steam store action.');
    if (Buffer.byteLength(JSON.stringify(body || {})) > 256 * 1024) throw new Error('Store request is too large.');
    if (name === 'connect') return connect(body?.progress);
    if (!session) await connect(body?.progress || lastProgress);
    let result;
    try { result = await post(name, body || {}); }
    catch (error) { if (error.status !== 401) throw error; await connect(body?.progress || lastProgress); result = await post(name, body || {}); }
    return { ...result, steamId, environment };
  }
  async function onAuthorized(event) {
    if (event.app_id !== 5043620 || !session) return;
    // Order IDs are uint64: always preserve them as strings across IPC/JSON.
    const orderId = String(event.order_id);
    if (typeof event.order_id === 'number' && !Number.isSafeInteger(event.order_id)) {
      notify({ error: 'Steam is checking your purchase. Refresh purchases to recover the result.' }); return;
    }
    if (!/^\d{1,20}$/.test(orderId)) return;
    try {
      const result = await post('resolve', { orderId, authorized: event.authorized === true });
      notify({ ...result, orderId, authorized: event.authorized === true, steamId, environment });
    } catch (_) { notify({ orderId, error: 'Your purchase is being checked. Use Refresh purchases to recover it.' }); }
  }
  return { action, onAuthorized, close() { session = ''; if (ticket) ticket.cancel(); ticket = null; } };
}
module.exports = { createDesktopCommerce };
