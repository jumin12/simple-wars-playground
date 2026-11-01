'use strict';

// Exercise the ordinary splash -> menu -> skirmish path. ?autostart bypasses
// the attract battle and therefore cannot catch menu-only startup regressions.
const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { chromium, _electron } = require('playwright');
const { WebSocketServer } = require('../server/node_modules/ws');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output/startup-fix');
const WRAPPER = path.resolve(ROOT, '../simple wars steam');
const FAULT = 'Injected menu battlefield failure';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
let relay;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = path.resolve(ROOT, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, bytes) => {
    if (error) return res.writeHead(404).end();
    if (url.searchParams.has('startupFault') && file === path.join(ROOT, 'index.html')) {
      const html = bytes.toString();
      assert(html.includes('            kickstartMenuAttractSim();'));
      bytes = Buffer.from(html.replace('            kickstartMenuAttractSim();', '            if(!window._startupFaultInjected){window._startupFaultInjected=true;throw new Error(' + JSON.stringify(FAULT) + ');} kickstartMenuAttractSim();'));
    }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' })[path.extname(file)] || 'application/octet-stream');
    res.end(bytes);
  });
});

async function isolate(context) {
  // Test profiles must never log into or modify real multiplayer accounts.
  await context.route('**/*', route => /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(route.request().url()) ? route.continue() : route.abort());
  await context.routeWebSocket(/.*/, socket => {
    socket.onMessage(() => {});
    socket.send(JSON.stringify({ t: 'welcome', online: 0, lobbies: [] }));
  });
}

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
  const url = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await isolate(context);
    const page = await context.newPage();
    await verify(page, 'browser-cold', { navigate: url, play: true });
    await page.evaluate(() => localStorage.setItem('startup-test-save', 'preserved'));
    await verify(page, 'browser-warm', { reload: true });
    assert.equal(await page.evaluate(() => localStorage.getItem('startup-test-save')), 'preserved');
    await context.close();
    const recovery = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await isolate(recovery);
    await verify(await recovery.newPage(), 'browser-recovery', { navigate: url + '/?startupFault=1', fault: true, play: true });
    await recovery.close();
  } finally { await browser.close(); }

  if (process.argv.includes('--desktop')) {
    const profile = path.join(OUT, 'steam-profile-' + Date.now());
    await desktop('steam-cold', path.join(WRAPPER, 'dist/win-unpacked/Simple Wars.exe'), profile, true);
    await desktop('steam-relaunch', path.join(WRAPPER, 'dist/win-unpacked/Simple Wars.exe'), profile, false);
    await desktop('steam-second-depot', path.join(WRAPPER, 'dist-ship/win-unpacked/Simple Wars.exe'), path.join(OUT, 'ship-profile-' + Date.now()), false);
  }

  // Required visual/action loop against ordinary boot, without the bypass flag.
  const skill = path.join(require('os').homedir(), '.codex/skills/develop-web-game');
  const client = path.join(OUT, 'client.mjs');
  fs.copyFileSync(path.join(skill, 'scripts/web_game_playwright_client.js'), client);
  relay = new WebSocketServer({ port: 8080 });
  await new Promise((resolve, reject) => { relay.once('listening', resolve); relay.once('error', reject); });
  relay.on('connection', socket => socket.send(JSON.stringify({ t: 'welcome', online: 0, lobbies: [] })));
  const errorFile = path.join(OUT, 'skill/errors-0.json');
  fs.rmSync(errorFile, { force: true });
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [client, '--url', url, '--actions-file', path.join(skill, 'references/action_payloads.json'),
      '--iterations', '1', '--pause-ms', '12000', '--screenshot-dir', path.join(OUT, 'skill')], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code ? reject(Error('Skill client exited ' + code)) : resolve());
  });
  if (fs.existsSync(errorFile)) assert.deepEqual(JSON.parse(fs.readFileSync(errorFile)), [], 'no bundled-client errors');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  server.close();
  if (relay) { for (const socket of relay.clients) socket.terminate(); relay.close(); }
});
