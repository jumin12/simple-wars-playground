'use strict';
// Uses the actual packaged executable and Steam client. Refuses production mode.
// No keys, tickets or bearer sessions are printed or saved by this script.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { _electron } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const WRAPPER = path.resolve(ROOT, '../simple wars steam');
const OUT = path.join(ROOT, 'output/steam-commerce/real-sandbox');
const CATALOG = 'https://simple-wars.onrender.com/api/steam/catalog';
const purchase = process.argv.find(value => value.startsWith('--purchase='))?.split('=')[1];
const resultFile = path.join(OUT, purchase ? purchase + (process.argv.includes('--cancel') ? '-canceled' : '') + '.json' : 'authentication.json');
// The Supporter Pack is no longer sold; only the gold bundles can be checked out.
assert(!purchase || ['gold1000', 'gold6000', 'gold15000'].includes(purchase), 'Unknown sandbox product');
fs.mkdirSync(OUT, { recursive: true });
async function sandboxOnly() {
  const response = await fetch(CATALOG, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.environment, 'sandbox', 'REFUSING: checkout must be in sandbox mode');
  assert.equal(data.ready, true, 'Sandbox backend is not ready');
}
(async () => {
  await sandboxOnly();
  const app = await _electron.launch({
    executablePath: path.join(WRAPPER, 'dist/win-unpacked/Simple Wars.exe'),
    args: ['--user-data-dir=' + path.join(OUT, 'profile')], cwd: WRAPPER, timeout: 45000,
  });
  const errors = [], result = { environment: 'sandbox', realSteamClient: true };
  try {
    const page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => window.WodSteamStore, null, { timeout: 60000 });
    const identity = await page.evaluate(() => simpleWarsDesktop.store('identity'));
    assert(identity.ok && /^\d{17}$/.test(identity.steamId), 'Steam SDK is unavailable');
    await page.waitForFunction(() => WodSteamStore.state.connected || WodSteamStore.state.error, null, { timeout: 90000 });
    const status = await page.evaluate(() => ({ connected: WodSteamStore.state.connected, error: WodSteamStore.state.error, environment: WodSteamStore.state.environment, gold: WodSteamStore.state.wallet?.gold, supporter: WodSteamStore.state.wallet?.supporter }));
    assert.equal(status.connected, true, status.error || 'Real Steam authentication failed');
    assert.equal(status.environment, 'sandbox');
    Object.assign(result, { authenticated: true, startingGold: status.gold, supporter: status.supporter });
    await page.waitForFunction(() => !window._wodBootBusy && !window._wodMenuBootstrapBusy, null, { timeout: 180000 });
    await page.evaluate(() => { wodDismissChangelogPopup(); pauseMenuBackgroundBattle(); showPanel('shop'); switchShopTab('gold'); });
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setFullScreen(false); w.setSize(1600, 1200); w.showInactive(); });
    await page.screenshot({ path: path.join(OUT, 'authenticated-shop.png') });
    assert.equal(await page.locator('#supporterPackCard, [data-steam-product="supporter"]').count(), 0, 'The Supporter Pack is no longer offered');
    // Existing Supporter Pack owners (DLC or a granted order) keep Patron Gold in every era.
    if (status.supporter) {
      const variants = require('../store-catalog').premiumVariants('supporterGold');
      result.supporterKept = await page.evaluate(ids => ids.every(id => WodSteamStore.state.wallet.ownedSkins[id]), variants);
      assert(result.supporterKept, 'Existing Supporter Pack owners keep every Patron Gold era');
    }
    // Use the real native refresh directly so a focus-triggered UI refresh
    // cannot make this explicit verification return early while already busy.
    const recovery = await page.evaluate(async () => {
      const response = await simpleWarsDesktop.store('refresh');
      if (response.ok) WodSteamStore.apply(response);
      return { ok: response.ok, error: response.error, gold: response.wallet?.gold };
    });
    assert(recovery.ok, recovery.error || 'Native purchase recovery failed');
    if (purchase) {
      await sandboxOnly();
      const before = await page.evaluate(() => WodSteamStore.state.wallet.gold);
      await page.evaluate(() => { window.__sandboxStoreEvents = []; simpleWarsDesktop.onStoreUpdate(event => window.__sandboxStoreEvents.push({ authorized: event.authorized, status: event.status, pending: event.pending, error: event.error })); });
      await page.locator('[data-steam-product="' + purchase + '"]').click();
      await page.waitForFunction(() => !WodSteamStore.state.busy, null, { timeout: 45000 });
      const pending = await page.evaluate(() => ({ error: WodSteamStore.state.error }));
      assert(!pending.error, pending.error);
      console.log('SANDBOX CHECKOUT OPEN: approve or cancel in the Steam overlay. No wallet funds are charged.');
      await page.waitForFunction(() => window.__sandboxStoreEvents.some(event => event.pending === false || event.error), null, { timeout: 600000 });
      result.callbacks = await page.evaluate(() => window.__sandboxStoreEvents);
      assert(!result.callbacks.some(event => event.error), 'Steam authorization callback reported a verification failure');
      result.product = purchase;
      result.endingGold = await page.evaluate(() => WodSteamStore.state.wallet.gold);
      result.grantedGold = result.endingGold - before;
      assert.equal(result.grantedGold, process.argv.includes('--cancel') ? 0 : require('../store-catalog').products[purchase].gold, 'Sandbox purchase grant must match the selected product');
      await page.screenshot({ path: path.join(OUT, purchase + '-result.png') });
    }
    await page.waitForFunction(() => !WodSteamStore.state.busy);
    await page.evaluate(() => WodSteamStore.refresh(true));
    const restored = await page.evaluate(() => ({ connected: WodSteamStore.state.connected, gold: WodSteamStore.state.wallet.gold, error: WodSteamStore.state.error }));
    assert.equal(restored.connected, true);
    assert(!restored.error, restored.error);
    result.restoredGold = restored.gold;
    assert.deepEqual(errors, []);
    result.errors = errors;
    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } catch (error) {
    result.error = error.message;
    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
    throw error;
  } finally { await app.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
