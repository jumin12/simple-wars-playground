'use strict';

// Exercise the ordinary splash -> menu -> skirmish path. ?autostart bypasses
// the attract battle and therefore cannot catch menu-only startup regressions.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { _electron } = require('playwright');
const H = require('./lib/harness');
const ROOT = H.ROOT;
const OUT = H.outDir('startup-fix');
const WRAPPER = path.resolve(ROOT, '../simple wars steam');
const FAULT = 'Injected menu battlefield failure';
const results = [];

// A second server whose copy of the game throws once while starting the menu battle. The call is a
// line of its own in js/game.js (or inline in index.html for a pre-split build served via SW_EXTRA_ROOTS).
const KICKSTART_CALL = /^([ \t]*)kickstartMenuAttractSim\(\);[ \t]*$/m;
let faultsInjected = 0;
const server = H.createStaticServer();
const faultServer = H.createStaticServer({
  rewrite(pathname, body) {
    if (!/\.(html|js)$/.test(pathname) || !KICKSTART_CALL.test(String(body))) return undefined;
    faultsInjected++;
    return String(body).replace(KICKSTART_CALL, '$1if(!window._startupFaultInjected){window._startupFaultInjected=true;throw new Error(' + JSON.stringify(FAULT) + ');} kickstartMenuAttractSim();');
  },
});

// Test profiles must never log into or modify real multiplayer accounts (used for the Electron app;
// browsers from H.launchBrowser are isolated already).
const isolate = H.isolateContext;

async function verify(page, name, { navigate, fault = false, play = false, reload = false } = {}) {
  const errors = [], pageErrors = [];
  const onConsole = message => { if (message.type() === 'error') errors.push(message.text()); };
  const onError = error => pageErrors.push(error.stack);
  page.on('console', onConsole);
  page.on('pageerror', onError);
  const result = { name, errors, pageErrors };
  try {
    if (navigate) await page.goto(navigate);
    if (reload) await page.reload();
    await page.waitForFunction(() => window._wodBootStarted && !window._wodBootBusy &&
      document.querySelector('#wodBootOverlay')?.classList.contains('hidden') &&
      !document.querySelector('#mainMenu')?.classList.contains('hidden'), null, { timeout: 120000 });
    assert(!new URL(page.url()).searchParams.has('autostart'));
    result.menu = await page.evaluate(() => ({ queue: Array.isArray(gameData.constructionJobs), seeded: menuDemoSeeded,
      battleActive: gameData.menuAttractMode, units: gameData.entities.length, ready: document.querySelector('#wodBootCaption').textContent }));
    assert(result.menu.queue, 'construction queue exists during the first attract battle');
    assert.equal(result.menu.seeded, !fault);
    assert.equal(result.menu.battleActive, !fault);
    if (!fault) assert.equal(result.menu.ready, 'Ready.');
    await page.waitForTimeout(1500);
    if (await page.locator('#wodChangelogClose').isVisible()) await page.locator('#wodChangelogClose').click();
    await page.screenshot({ path: path.join(OUT, name + '-menu.png') });
    if (play) {
      await page.locator('#mainMenu').getByRole('button', { name: 'Play vs AI', exact: true }).click();
      await page.getByRole('button', { name: 'Skirmish', exact: true }).click();
      await page.waitForFunction(() => !wodIsMapPreviewGenerating(), null, { timeout: 120000 });
      await page.locator('#setupBtnStartAi').click();
      await page.waitForFunction(() => gameState === 'PLAYING' && gameData._matchReadyForEndChecks, null, { timeout: 120000 });
      await page.waitForTimeout(2500);
      result.game = await page.evaluate(() => ({ state: gameState, units: gameData.entities.length, towns: gameData.cities.length,
        queue: Array.isArray(gameData.constructionJobs), text: render_game_to_text() }));
      assert(result.game.units > 0 && result.game.towns >= 2 && result.game.queue);
      await page.screenshot({ path: path.join(OUT, name + '-game.png') });
      await page.evaluate(() => returnToMenu());
      await page.waitForFunction(() => gameState === 'MENU' && gameData.menuAttractMode && !UI.mainMenu.classList.contains('hidden'), null, { timeout: 120000 });
      result.returnedToMenu = true;
    }
    assert.deepEqual(pageErrors, [], 'no uncaught renderer exceptions');
    if (fault) assert(errors.some(error => error.includes(FAULT)), 'injected fault was actually exercised');
    // Blocked external services are unrelated to loading local gameplay.
    const unexpected = errors.filter(error => !/net::ERR_FAILED|net::ERR_BLOCKED_BY_CLIENT/.test(error) && !(fault && error.includes(FAULT)));
    assert.deepEqual(unexpected, [], 'no startup or gameplay console errors');
    result.passed = true;
    console.log(name + ': menu' + (play ? ', gameplay and return' : '') + ' passed');
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onError);
    results.push(result);
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  }
}

async function desktop(name, executable, profile, play) {
  const app = await _electron.launch({ executablePath: executable, cwd: WRAPPER,
    args: ['--user-data-dir=' + profile, '--proxy-server=http://127.0.0.1:9'], timeout: 45000 });
  try {
    const page = await app.firstWindow();
    await isolate(app.context());
    // Reload after listeners/interception are installed, preserving the real
    // shipped EXE, ASAR, sandboxed preload and native loopback HTTP server.
    await verify(page, name, { reload: true, play });
    assert(await page.evaluate(() => !!window.simpleWarsDesktop?.store), 'real Steam preload available');
  } finally { await app.close(); }
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => faultServer.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  const faultUrl = 'http://127.0.0.1:' + faultServer.address().port;
  const browser = await H.launchBrowser();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await verify(page, 'browser-cold', { navigate: url, play: true });
    await page.evaluate(() => localStorage.setItem('startup-test-save', 'preserved'));
    await verify(page, 'browser-warm', { reload: true });
    assert.equal(await page.evaluate(() => localStorage.getItem('startup-test-save')), 'preserved');
    await context.close();
    const recovery = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await verify(await recovery.newPage(), 'browser-recovery', { navigate: faultUrl + '/', fault: true, play: true });
    assert(faultsInjected > 0, 'the menu battle start-up call was found and patched');
    await recovery.close();
  } finally { await browser.close(); }

  if (process.argv.includes('--desktop')) {
    const profile = path.join(OUT, 'steam-profile-' + Date.now());
    await desktop('steam-cold', path.join(WRAPPER, 'dist/win-unpacked/Simple Wars.exe'), profile, true);
    await desktop('steam-relaunch', path.join(WRAPPER, 'dist/win-unpacked/Simple Wars.exe'), profile, false);
    await desktop('steam-second-depot', path.join(WRAPPER, 'dist-ship/win-unpacked/Simple Wars.exe'), path.join(OUT, 'ship-profile-' + Date.now()), false);
  }

  // Independent visual/action loop against ordinary boot, without the bypass flag.
  await H.smokeClient(url, { dir: path.join(OUT, 'skill'), pauseMs: 12000 });
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  server.close();
  faultServer.close();
});
