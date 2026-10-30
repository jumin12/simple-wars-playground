'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { _electron } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output/desktop-multiplayer');
const WRAPPER = path.resolve(ROOT, '../simple wars steam');
const PUBLIC_RELAY = 'wss://simple-wars.onrender.com';
fs.mkdirSync(OUT, { recursive: true });

// Exercise the actual client, preserving explicit overrides and browser LAN mode.
const client = fs.readFileSync(path.join(ROOT, 'multiplayer-client.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const productionConfig = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(match => /window\.WOD_MP_WS_URL\s*=\s*'wss:\/\/simple-wars\.onrender\.com'/.test(match[1]));
assert(productionConfig, 'public web configuration remains present');
const cases = [
  { name: 'Steam loopback', url: 'http://127.0.0.1:49152', desktop: true, expected: PUBLIC_RELAY },
  { name: 'Steam localhost', url: 'http://localhost:49153', desktop: true, expected: PUBLIC_RELAY },
  { name: 'Steam LAN override', url: 'http://127.0.0.1:49154', desktop: true, override: 'ws://192.168.1.10:8080', expected: 'ws://192.168.1.10:8080' },
  { name: 'Steam custom override', url: 'http://127.0.0.1:49155', desktop: true, override: 'wss://relay.example.test', expected: 'wss://relay.example.test' },
  { name: 'browser LAN loopback', url: 'http://127.0.0.1:9000', expected: 'ws://localhost:8080' },
  { name: 'browser LAN localhost', url: 'http://localhost:9000', expected: 'ws://localhost:8080' },
  { name: 'public web', url: 'https://simple-wars-live.onrender.com', production: true, expected: PUBLIC_RELAY },
  { name: 'custom HTTPS host', url: 'https://game.example.test', expected: 'wss://game.example.test' },
  { name: 'custom HTTP host', url: 'http://game.example.test:9000', expected: 'ws://game.example.test:9000' },
];
for (const c of cases) {
  const location = new URL(c.url), window = { location };
  if (c.desktop) window.simpleWarsDesktop = { quit() {} };
  if (c.override) window.WOD_MP_WS_URL = c.override;
  const context = vm.createContext({ window, location });
  if (c.production) vm.runInContext(productionConfig[1], context);
  vm.runInContext(client, context);
  assert.equal(window.WodMultiplayer.getUrl(), c.expected, c.name);
}

async function verifyPackagedDesktop() {
  // Use the shipped executable, ASAR, preload and random-port HTTP server.
  // A dead proxy prevents test profiles reaching production during initial boot;
  // only our intercepted handshake is allowed. Loopback assets bypass the proxy.
  const app = await _electron.launch({
    executablePath: path.join(WRAPPER, 'dist/win-unpacked/Simple Wars.exe'),
    args: ['--proxy-server=http://127.0.0.1:9', '--user-data-dir=' + path.join(OUT, 'test-profile')],
    cwd: WRAPPER,
    timeout: 45000,
  });
  const errors = [], sockets = [];
  try {
    const page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await app.evaluate(({ BrowserWindow }) => {
      for (const w of BrowserWindow.getAllWindows()) {
        w.removeAllListeners('ready-to-show');
        w.hide();
      }
    });
    await app.context().routeWebSocket(/.*/, socket => {
      sockets.push(socket.url());
      socket.onMessage(raw => {
        const msg = JSON.parse(String(raw));
        if (msg.t === 'list_lobbies') socket.send(JSON.stringify({ t: 'lobby_list', online: 1, lobbies: [] }));
      });
      setTimeout(() => socket.send(JSON.stringify({ t: 'welcome', online: 1, lobbies: [] })), 30);
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.WodMultiplayer && typeof showPanel === 'function');
    assert.equal(await page.evaluate(() => !!window.simpleWarsDesktop), true, 'real sandboxed preload bridge');
    assert.equal(new URL(page.url()).hostname, '127.0.0.1', 'real desktop loopback origin');
    assert.equal(await page.evaluate(() => WodMultiplayer.getUrl()), PUBLIC_RELAY);
    await page.waitForFunction(() => !window._wodBootBusy && !window._wodMenuBootstrapBusy, null, { timeout: 180000 });
    await page.evaluate(() => { wodDismissChangelogPopup(); showPanel('multiplayer'); });
    await page.waitForFunction(() => WodMultiplayer.api.socketOpen);
    assert.match(await page.locator('#mpStatus').innerText(), /Connected/);
    assert(sockets.length > 0 && sockets.every(url => url === PUBLIC_RELAY + '/'), 'all desktop sockets use public WSS');
    console.log('Packaged Steam preload, public URL and multiplayer UI handshake passed');
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setFullScreen(false);
      w.setSize(1280, 900);
      w.showInactive();
    });
    await page.screenshot({ path: path.join(OUT, 'steam-multiplayer.png') });
    assert.deepEqual(errors, [], 'no renderer errors');
    return { origin: new URL(page.url()).origin, url: await page.evaluate(() => WodMultiplayer.getUrl()), sockets: sockets.length, connected: true, errors };
  } finally {
    fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(errors, null, 2));
    await app.close();
  }
}

async function verifyLiveRelay() {
  // Read-only, anonymous handshake: never register profiles or create/join games.
  const { WebSocket } = require('../server/node_modules/ws');
  const response = await fetch('https://simple-wars.onrender.com/health', { signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, 200);
  assert.equal((await response.text()).trim(), 'simple-wars-mp ok');
  const origins = ['http://127.0.0.1:49152', 'https://simple-wars-live.onrender.com'];
  for (const origin of origins) {
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(PUBLIC_RELAY, { origin, handshakeTimeout: 30000 });
      const timer = setTimeout(() => { socket.terminate(); reject(Error('Relay welcome timed out')); }, 45000);
      socket.on('error', reject);
      socket.on('message', raw => {
        const msg = JSON.parse(String(raw));
        if (msg.t === 'welcome') {
          assert(Array.isArray(msg.lobbies));
          clearTimeout(timer);
          socket.close();
          resolve();
        }
      });
      socket.on('close', () => clearTimeout(timer));
    });
  }
  return { healthy: true, desktopOriginAccepted: true, webOriginAccepted: true };
}

(async () => {
  const results = { urlCases: cases.map(c => c.name) };
  if (process.argv.includes('--desktop')) results.desktop = await verifyPackagedDesktop();
  if (process.argv.includes('--live')) results.liveRelay = await verifyLiveRelay();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
})().catch(error => { console.error(error); process.exitCode = 1; });
