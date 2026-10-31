(function (global) {
  'use strict';
  const state = { wallet: null, steamId: '', environment: '', busy: false, error: '', connected: false };
  let syncTimer = null, syncing = false, applying = false, lastReceipts = '';
  const native = () => global.simpleWarsDesktop && typeof global.simpleWarsDesktop.store === 'function';
  function progress() {
    const p = typeof wodProgress === 'object' && wodProgress || {};
    return { profile: { gold: gameData.gold, ownedUnitSkins: gameData.ownedUnitSkins, ownedShopVisuals: gameData.ownedShopVisuals,
      steamCommerceAccount: p.profile?.steamCommerceAccount || '' }, matchGoldGranted: p.matchGoldGranted || {},
      achievementGoldGranted: p.achievementGoldGranted || {}, secrets: p.secrets || {}, achievements: { goldenChipMaster: !!p.achievements?.goldenChipMaster } };
  }
  const receiptKey = () => JSON.stringify([wodProgress?.matchGoldGranted, wodProgress?.achievementGoldGranted, wodProgress?.secrets, wodProgress?.achievements?.goldenChipMaster]);
  async function call(action, payload) {
    if (!native()) throw new Error('Open Simple Wars in Steam to purchase gold.');
    const response = await global.simpleWarsDesktop.store(action, payload || {});
    if (!response?.ok) throw new Error(response?.error || 'Steam store is unavailable.');
    return response;
  }
  function apply(result, persist = true) {
    if (!result?.wallet) return;
    if (state.steamId === result.steamId && state.environment === result.environment && state.wallet && result.wallet.revision < state.wallet.revision) return;
    Object.assign(state, { wallet: result.wallet, steamId: result.steamId, environment: result.environment });
    gameData.gold = result.wallet.gold;
    gameData.supporterPack = !!result.wallet.supporter;
    gameData.ownedUnitSkins = { ...result.wallet.ownedSkins, nato: true };
    gameData.ownedShopVisuals = { ...result.wallet.ownedVisuals };
    if (!gameData.ownedUnitSkins[gameData.unitSkin]) gameData.unitSkin = 'nato';
    if (!gameData.ownedUnitSkins[gameData.aiUnitSkin]) gameData.aiUnitSkin = 'nato';
    if (wodProgress?.profile) wodProgress.profile.steamCommerceAccount = state.environment + ':' + state.steamId;
    try { localStorage.setItem('wod-steam-wallet-v1', JSON.stringify({ wallet: state.wallet, steamId: state.steamId, environment: state.environment })); } catch (_) {}
    if (persist) { applying = true; try { persistWodProgressNow(); } finally { applying = false; } }
    if (typeof updateSkinShop === 'function') updateSkinShop();
  }
  function render() {
    const status = document.getElementById('steamStoreStatus');
    if (status) status.textContent = state.error || (state.busy ? 'Waiting for Steam…' : state.connected
      ? (state.environment === 'sandbox' ? 'Steam test store · no real money is charged' : 'Purchases use Steam Wallet. Prices shown in USD; Steam handles wallet conversion.')
      : native() ? 'Connect to Steam to purchase or restore gold.' : 'Open the Steam version to purchase gold. Earned gold still works here.');
    for (const button of document.querySelectorAll('[data-steam-product]')) button.disabled = state.busy;
    const owned = !!state.wallet?.supporter;
    const card = document.getElementById('supporterPackCard');
    if (card) card.classList.toggle('owned', owned);
    const btn = document.getElementById('supporterPackBtn');
    if (btn) { btn.disabled = state.busy; btn.textContent = owned ? 'Supporter Pack owned' : 'Get the Supporter Pack · $10'; }
    const restore = document.getElementById('steamRestorePurchases'); if (restore) restore.disabled = state.busy;
    drawSupporterPreview();
  }
  async function connect() {
    if (!native() || state.busy) return false;
    state.busy = true; state.error = ''; render();
    try {
      const sent = receiptKey();
      apply(await call('connect', { progress: progress() }));
      lastReceipts = sent; state.connected = true;
      if (receiptKey() !== sent) queueSync();
      return true;
    } catch (error) { state.error = error.message; state.connected = false; return false; }
    finally { state.busy = false; render(); }
  }
  function queueSync() {
    if (!native() || applying || !state.connected || syncTimer || syncing || receiptKey() === lastReceipts) return;
    syncTimer = setTimeout(async () => {
      syncTimer = null; syncing = true;
      const sent = receiptKey();
      try { apply(await call('sync', { progress: progress() })); lastReceipts = sent; }
      catch (_) { state.connected = false; }
      finally { syncing = false; if (receiptKey() !== lastReceipts) queueSync(); }
    }, 350);
  }
  async function buy(productId) {
    if (!native()) { window.open('https://store.steampowered.com/app/5043620/', '_blank', 'noopener'); return false; }
    if (state.busy) return false;
    if (!state.connected && !(await connect())) { showNotification(state.error); return false; }
    state.busy = true; state.error = ''; render();
    try {
      const result = await call('begin', { productId, requestId: crypto.randomUUID() });
      if (result.wallet) apply(result);
      showNotification('Confirm your purchase in the Steam overlay. Gold is added after payment completes.', 'info');
      return true;
    } catch (error) { state.error = error.message; showNotification(error.message); return false; }
    finally { state.busy = false; render(); }
  }
  async function spend(request) {
    if (state.busy) return false;
    if (!state.connected && !(await connect())) { showNotification(state.error); return false; }
    state.busy = true; render();
    try {
      // Sync receipts before spending; neither client balances nor client prices
      // are accepted as proof of funds or product cost.
      apply(await call('sync', { progress: progress() })); lastReceipts = receiptKey();
      apply(await call('spend', request));
      return true;
    } catch (error) { state.error = error.message; showNotification(error.message); return false; }
    finally { state.busy = false; render(); }
  }
  async function refresh(silent = false) {
    if (!native()) { showNotification('Open Simple Wars in Steam to restore purchases.'); return; }
    if (!(await connect())) return;
    state.busy = true; render();
    try { apply(await call('refresh')); state.error = ''; if (!silent) showNotification('Steam purchases refreshed.', 'success'); }
    catch (error) { state.error = error.message; }
    finally { state.busy = false; render(); }
  }
  function drawSupporterPreview() {
    const canvas = document.getElementById('supporterPackPreview');
    if (!canvas || typeof global.wodDrawPremiumChip !== 'function' || typeof gameData !== 'object') return;
    const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
    const units = ['light', 'motorized', 'mountaineer', 'marine', 'heavy', 'ship', 'transport', 'supply'];
    units.forEach((type, i) => { ctx.save(); ctx.translate(37 + i % 4 * 78, 38 + Math.floor(i / 4) * 72); global.wodDrawPremiumChip(ctx, { type, owner: 1, x: 0, y: 0 }, 22, '#69c68c', true); ctx.restore(); });
  }
  global.WodSteamStore = { state, native, apply, connect, buy, spend, refresh, queueSync, render };
  global.addEventListener('DOMContentLoaded', async () => {
    if (native()) {
      try {
        const identity = await call('identity'), cached = JSON.parse(localStorage.getItem('wod-steam-wallet-v1') || 'null');
        if (identity.steamId && cached?.steamId === identity.steamId) apply(cached, false);
      } catch (_) {}
      global.simpleWarsDesktop.onStoreUpdate(result => {
        if (result.wallet) { apply(result); showNotification(result.authorized ? result.status === 'Succeeded' ? 'Steam purchase completed. Your gold and items are ready.' : 'Steam is processing your purchase. Your wallet will update when it completes.' : 'Steam purchase canceled.', result.authorized && result.status === 'Succeeded' ? 'success' : 'info'); }
        if (result.error) { state.error = result.error; render(); }
      });
      await connect();
    }
    render();
  });
  global.addEventListener('focus', () => { if (native() && !state.busy) void refresh(true); });
})(window);
