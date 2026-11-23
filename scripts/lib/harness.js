'use strict';
/**
 * Shared harness for the Simple Wars test and capture scripts.
 *
 *   const H = require('./lib/harness');
 *   const { url, close } = await H.startServer();          // serves the playground
 *   const browser = await H.launchBrowser();                // Chromium, no internet
 *   const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
 *   const errors = H.collectErrors(page);
 *   await H.gotoAutostart(page, url);                       // or H.gotoMenu + H.startSkirmish
 *   await H.stepGame(page, 30);                             // 30 simulated seconds
 *   errors.assertNone();
 *
 * Environment:
 *   SW_EXTRA_ROOTS  Directories (separated by path.delimiter) served before the playground, first match
 *                   wins. Point it at a full or partial game copy to run any test against that copy,
 *                   e.g. the frozen pre-refactor build: SW_EXTRA_ROOTS=../headless/gen/prerefactor
 *   SW_HEADED=1     Show the browser window.
 */
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT = path.join(ROOT, 'output');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm',
};

/** `output/<name>`, created if needed. */
function outDir(name) {
  const dir = path.join(OUTPUT, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Roots from SW_EXTRA_ROOTS, resolved against the playground. */
function envRoots() {
  return (process.env.SW_EXTRA_ROOTS || '').split(path.delimiter).filter(Boolean).map(dir => path.resolve(ROOT, dir));
}

// ---------------------------------------------------------------- static server

/**
 * A static file server for the game (an http.Server that is not yet listening).
 *   root        main directory (default: the playground)
 *   extraRoots  directories searched before `root`, plus SW_EXTRA_ROOTS; the first that has the file wins.
 *               Lets a test overlay a baseline copy of some files without copying the rest.
 *   rewrite(pathname, body, file) -> string|Buffer|undefined
 *               change a served file, e.g. inject a script or a fault; return undefined to leave it.
 *   handle(req, res, pathname) -> true when it answered the request itself (custom endpoints).
 * Query strings are ignored, "/" serves index.html, paths cannot escape their root.
 */
function createStaticServer({ root = ROOT, extraRoots = [], rewrite, handle } = {}) {
  const roots = [...extraRoots.filter(Boolean).map(dir => path.resolve(ROOT, dir)), ...envRoots(), path.resolve(root)];
  return http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch (_) { return res.writeHead(400).end(); }
    if (pathname.endsWith('/')) pathname += 'index.html';
    if (handle && handle(req, res, pathname)) return;
    let file = null;
    for (const dir of roots) {
      const candidate = path.resolve(dir, '.' + pathname);
      if (!candidate.startsWith(dir + path.sep)) return res.writeHead(403).end();
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) { file = candidate; break; }
    }
    if (!file) return res.writeHead(404).end();
    fs.readFile(file, (error, body) => {
      if (error) return res.writeHead(500).end();
      if (rewrite) {
        const changed = rewrite(pathname, body, file);
        if (changed != null) body = Buffer.isBuffer(changed) ? changed : Buffer.from(String(changed));
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': body.length, 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    });
  });
}

/** createStaticServer + listen on a free loopback port. Resolves to { server, port, url, close() }. */
async function startServer(options = {}) {
  const server = createStaticServer(options);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(options.port || 0, '127.0.0.1', resolve); });
  const port = server.address().port;
  return { server, port, url: 'http://127.0.0.1:' + port, close: () => new Promise(resolve => server.close(() => resolve())) };
}

/** Insert markup (for example a <script>) at the start of <head> in an HTML body. */
function injectHead(body, markup) {
  return String(body).replace(/<head[^>]*>/i, match => match + markup);
}

// ---------------------------------------------------------------- browser

/** True for loopback http(s)/ws(s) URLs and for non-network schemes (data:, blob:, about:). */
function isLocalUrl(href) {
  let url;
  try { url = new URL(href); } catch (_) { return false; }
  if (!/^(https?|wss?):$/.test(url.protocol)) return true;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
}

/** Answer the game's relay handshake so pages behave as "online, no lobbies" without a real relay. */
function mockRelaySocket(socket) {
  socket.onMessage(raw => {
    let msg = null;
    try { msg = JSON.parse(String(raw)); } catch (_) { return; }
    if (msg && msg.t === 'list_lobbies') socket.send(JSON.stringify({ t: 'lobby_list', online: 0, lobbies: [] }));
  });
  socket.send(JSON.stringify({ t: 'welcome', online: 0, lobbies: [] }));
}

const DEV_RELAY_PORT = '8080';

/**
 * Block every non-loopback request in a browser context, and answer WebSockets to the outside world and
 * to the game's default development relay (ws://localhost:8080) with an in-browser mock, so tests never
 * need a relay on port 8080. WebSockets to other local ports (a real relay a test started) pass through.
 */
async function isolateContext(context) {
  await context.route(url => !isLocalUrl(url.href), route => route.abort('blockedbyclient'));
  await context.routeWebSocket(url => !isLocalUrl(url.href) || url.port === DEV_RELAY_PORT, mockRelaySocket);
}

/**
 * Launch Chromium with all non-local network blocked. Every context and page made from the returned
 * browser goes through isolateContext; a dead proxy also stops anything the routes would miss.
 * Options are passed to chromium.launch (headless defaults to true; `args` are appended).
 */
async function launchBrowser({ args = [], ...options } = {}) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({
    headless: process.env.SW_HEADED !== '1',
    ...options,
    args: ['--proxy-server=http://127.0.0.1:9', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1', ...args],
  });
  const newContext = browser.newContext.bind(browser);
  const newPage = browser.newPage.bind(browser);
  browser.newContext = async (contextOptions) => {
    const context = await newContext(contextOptions);
    await isolateContext(context);
    return context;
  };
  browser.newPage = async (pageOptions) => {
    const page = await newPage(pageOptions);
    await isolateContext(page.context());
    return page;
  };
  return browser;
}

// Console noise from requests the harness blocked on purpose.
const BLOCKED_NETWORK = /net::ERR_(BLOCKED_BY_CLIENT|PROXY_CONNECTION_FAILED|NAME_NOT_RESOLVED|TUNNEL_CONNECTION_FAILED)/;

/**
 * Record uncaught page errors and console.error messages (deduplicated). Blocked-network noise is ignored,
 * plus anything matching options.ignore (a RegExp). Returns
 *   { pageErrors, consoleErrors, all(), assertNone(label), stop() }.
 */
function collectErrors(page, { ignore = null, console: watchConsole = true } = {}) {
  const pageErrors = [], consoleErrors = [], seen = new Set();
  const add = (list, text) => {
    if (BLOCKED_NETWORK.test(text) || (ignore && ignore.test(text)) || seen.has(text)) return;
    seen.add(text);
    list.push(text);
  };
  const onPageError = error => add(pageErrors, error && error.stack ? error.stack : String(error));
  const onConsole = msg => {
    if (msg.type() !== 'error') return;
    const where = msg.location && msg.location().url;
    if (where && !isLocalUrl(where)) return;
    add(consoleErrors, msg.text());
  };
  page.on('pageerror', onPageError);
  if (watchConsole) page.on('console', onConsole);
  return {
    pageErrors, consoleErrors,
    all: () => [...pageErrors, ...consoleErrors],
    assertNone(label = 'page errors') {
      const all = [...pageErrors, ...consoleErrors];
      if (all.length) throw new Error(label + ':\n' + all.join('\n'));
    },
    stop() { page.off('pageerror', onPageError); page.off('console', onConsole); },
  };
}

// ---------------------------------------------------------------- game helpers

/** Wait until the boot sequence reached the main menu (gameState === 'MENU', menu visible, boot idle). */
async function waitForMenu(page, { timeout = 180000 } = {}) {
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState === 'MENU' && window._wodBootStarted &&
    !window._wodBootBusy && !window._wodMenuBootstrapBusy && !document.getElementById('mainMenu')?.classList.contains('hidden'),
  null, { timeout });
}

/** Open the game at `baseUrl` (plus optional query string) and wait for the main menu. */
async function gotoMenu(page, baseUrl, { query = '', timeout } = {}) {
  await page.goto(baseUrl + '/' + (query ? '?' + query.replace(/^\?/, '') : ''));
  await waitForMenu(page, { timeout });
}

/** Wait until a match is running and past its start-up checks. */
async function waitForMatch(page, { timeout = 180000 } = {}) {
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState === 'PLAYING' && gameData._matchReadyForEndChecks &&
    !window._wodBootBusy && !window._wodMenuBootstrapBusy, null, { timeout });
}

/** Open `baseUrl/?autostart=1` (a skirmish against the AI, skipping the menu) and wait for the match. */
async function gotoAutostart(page, baseUrl, { query = '', timeout } = {}) {
  await page.goto(baseUrl + '/?autostart=1' + (query ? '&' + query.replace(/^[?&]/, '') : ''));
  await waitForMatch(page, { timeout });
}

/** Close the "what's new" popup if it is open. */
async function closeChangelog(page) {
  await page.evaluate(() => { if (typeof wodDismissChangelogPopup === 'function') wodDismissChangelogPopup(); });
}

/** From the main menu, start a default skirmish the way a player does and wait for the match. */
async function startSkirmish(page, { timeout = 180000 } = {}) {
  await closeChangelog(page);
  await page.locator('#mainMenu').getByRole('button', { name: 'Play vs AI', exact: true }).click();
  await page.getByRole('button', { name: 'Skirmish', exact: true }).click();
  await page.waitForFunction(() => !wodIsMapPreviewGenerating(), null, { timeout });
  await page.locator('#setupBtnStartAi').click();
  await waitForMatch(page, { timeout });
}

/** Advance the simulation by `seconds` of game time in steps of `dt`, independent of real time. */
async function stepGame(page, seconds, { dt = 0.1, draw = false } = {}) {
  return page.evaluate(({ seconds, dt, draw }) => {
    const steps = Math.max(1, Math.round(seconds / dt));
    for (let i = 0; i < steps; i++) update(dt);
    if (draw) window.draw();
    return steps * dt;
  }, { seconds, dt, draw });
}

/** Parsed render_game_to_text() snapshot. */
async function gameText(page) {
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()));
}

// ---------------------------------------------------------------- smoke client

/** Default input script for smokeClient: tap Left, wait, tap Space (frames are 1/60 s). */
const SMOKE_STEPS = [{ buttons: ['left'], frames: 6 }, { buttons: [], frames: 4 }, { buttons: ['space'], frames: 3 }];
const SMOKE_KEYS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', enter: 'Enter', space: 'Space', a: 'KeyA', b: 'KeyB' };

/** Predicate for smokeClient's `ready`: the map exists and units are on it. */
const GAME_HAS_UNITS = () => typeof gameData !== 'undefined' && gameData.hexList?.length > 0 && typeof window.render_game_to_text === 'function' &&
  JSON.parse(window.render_game_to_text()).units.length > 0;

/**
 * Independent end-to-end smoke pass in a fresh browser: load `url`, play an input script through the
 * game's window.advanceTime hook, then save a screenshot (shot-N.png) and render_game_to_text (state-N.json)
 * to `dir`. Console and page errors fail the pass (written to errors-N.json) unless allowErrors is set.
 *   steps      [{ buttons: ['left'|'space'|'left_mouse_button'|...], frames, mouse_x, mouse_y }]
 *   ready      page predicate to wait for before playing (default: a fixed 500 ms, like a cold start)
 *   pauseMs    real time to let the game run after each iteration
 * Resolves to { errors, states }.
 */
async function smokeClient(url, { dir = outDir('smoke'), steps = SMOKE_STEPS, iterations = 1, pauseMs = 250, ready = null,
  viewport = null, allowErrors = false, timeout = 180000 } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of fs.readdirSync(dir)) if (/^errors-\d+\.json$/.test(name)) fs.rmSync(path.join(dir, name), { force: true });
  const browser = await launchBrowser({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const errors = [], states = [];
  try {
    const page = await browser.newPage(viewport ? { viewport } : {});
    const seen = collectErrors(page);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    if (ready) await page.waitForFunction(ready, null, { timeout });
    else await page.waitForTimeout(500);
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    for (let i = 0; i < iterations; i++) {
      const canvas = await page.evaluateHandle(() => [...document.querySelectorAll('canvas')]
        .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0] || null);
      const box = canvas.asElement() ? await canvas.asElement().boundingBox() : null;
      for (const step of steps) {
        const buttons = [...new Set(step.buttons || [])];
        for (const button of buttons) {
          if (/_mouse_button$/.test(button)) {
            if (!box) continue;
            await page.mouse.move(box.x + (step.mouse_x ?? box.width / 2), box.y + (step.mouse_y ?? box.height / 2));
            await page.mouse.down({ button: button.startsWith('left') ? 'left' : 'right' });
          } else if (SMOKE_KEYS[button]) await page.keyboard.down(SMOKE_KEYS[button]);
        }
        for (let f = 0; f < (step.frames || 1); f++) {
          await page.evaluate(() => typeof window.advanceTime === 'function' ? window.advanceTime(1000 / 60)
            : new Promise(resolve => requestAnimationFrame(() => resolve())));
        }
        for (const button of buttons) {
          if (/_mouse_button$/.test(button)) { if (box) await page.mouse.up({ button: button.startsWith('left') ? 'left' : 'right' }); }
          else if (SMOKE_KEYS[button]) await page.keyboard.up(SMOKE_KEYS[button]);
        }
      }
      await page.waitForTimeout(pauseMs);
      await page.screenshot({ path: path.join(dir, `shot-${i}.png`), ...(box ? { clip: box } : {}) });
      const state = await page.evaluate(() => typeof window.render_game_to_text === 'function' ? window.render_game_to_text() : null);
      if (state) { fs.writeFileSync(path.join(dir, `state-${i}.json`), state); states.push(JSON.parse(state)); }
      const fresh = seen.all().slice(errors.length);
      errors.push(...fresh);
      if (fresh.length) { fs.writeFileSync(path.join(dir, `errors-${i}.json`), JSON.stringify(fresh, null, 2)); break; }
    }
  } finally {
    await browser.close();
  }
  if (errors.length && !allowErrors) throw new Error('smoke client saw errors:\n' + errors.join('\n'));
  return { errors, states };
}

// The 'hello' a game page sends the relay as soon as it connects: which build it is (the date of the newest changelog
// entry). Tests that talk to the relay over a bare socket send it too, or the relay treats them as an out-of-date game.
function relayHello() {
  const list = require('vm').runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'changelog.js'), 'utf8') + '\n;WOD_CHANGELOG', {});
  const t = Math.max(...list.map(e => Date.parse(e && e.at)).filter(Number.isFinite));
  return { t: 'hello', build: new Date(t).toISOString(), version: '' };
}

module.exports = {
  ROOT, OUTPUT, MIME, outDir, relayHello,
  createStaticServer, startServer, injectHead,
  isLocalUrl, isolateContext, launchBrowser, collectErrors,
  waitForMenu, gotoMenu, waitForMatch, gotoAutostart, closeChangelog, startSkirmish, stepGame, gameText,
  SMOKE_STEPS, GAME_HAS_UNITS, smokeClient,
};
