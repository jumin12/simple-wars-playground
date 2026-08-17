/**
 * Boot Simple Wars, start a real skirmish, hide HUD, and save canvas
 * screenshots of the live front for logo / Steam art compositing.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'output', 'store-captures');
const PORT = 8765;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function startServer() {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const file = path.normalize(path.join(ROOT, urlPath));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function saveCanvasPng(page, filename) {
  const dataUrl = await page.evaluate(() => {
    const c = document.getElementById('gameCanvas');
    if (!c) return null;
    return c.toDataURL('image/png');
  });
  if (!dataUrl || !dataUrl.startsWith('data:image/png')) {
    throw new Error('canvas toDataURL failed for ' + filename);
  }
  const dest = path.join(OUT, filename);
  fs.writeFileSync(dest, Buffer.from(dataUrl.split(',')[1], 'base64'));
  const st = fs.statSync(dest);
  console.log('wrote', filename, st.size);
  return dest;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  });
  page.setDefaultTimeout(180000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  try {
    await page.addInitScript(() => {
      const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
      if (!desc || !desc.get || !desc.set) return;
      Object.defineProperty(HTMLSelectElement.prototype, 'value', {
        get() {
          if (this.id === 'setupMapSize') return '40';
          return desc.get.call(this);
        },
        set(v) {
          desc.set.call(this, this.id === 'setupMapSize' ? '40' : v);
        },
        configurable: true,
      });
    });

    await page.goto(`http://127.0.0.1:${PORT}/index.html?autostart=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    console.log('starting skirmish via autostart');

    try {
      await page.waitForFunction(() => {
        return typeof gameState !== 'undefined' &&
          gameState === 'PLAYING' &&
          gameData &&
          gameData._matchReadyForEndChecks &&
          gameData.hexList &&
          gameData.hexList.length > 40 &&
          gameData.entities &&
          gameData.entities.filter((e) => e && e.hp > 0 && e.owner > 0).length >= 4;
      }, { timeout: 180000 });
    } catch (err) {
      const dump = await page.evaluate(() => ({
        gameState: typeof gameState === 'undefined' ? null : gameState,
        bootBusy: !!window._wodBootBusy,
        menuBusy: !!window._wodMenuBootstrapBusy,
        hexes: gameData && gameData.hexList ? gameData.hexList.length : 0,
        units: gameData && gameData.entities ? gameData.entities.length : 0,
        ready: !!(gameData && gameData._matchReadyForEndChecks),
        caption: document.getElementById('wodBootCaption') && document.getElementById('wodBootCaption').textContent,
        mapGenHidden: !!(document.getElementById('wodMapGenOverlay') && document.getElementById('wodMapGenOverlay').classList.contains('hidden')),
      })).catch(() => null);
      console.error('match wait failed', dump);
      await page.screenshot({ path: path.join(OUT, 'debug-boot.png') }).catch(() => {});
      throw err;
    }

    await page.waitForFunction(() => {
      const ov = document.getElementById('wodMapGenOverlay');
      return !ov || ov.classList.contains('hidden');
    }, { timeout: 180000 });

    const spawned = await page.evaluate(() => {
      const counts = {};
      for (const e of gameData.entities) {
        if (!e || e.hp <= 0) continue;
        counts[e.owner] = (counts[e.owner] || 0) + 1;
      }
      return { units: gameData.entities.length, counts, hexes: gameData.hexList.length };
    });
    console.log('match ready', JSON.stringify(spawned));

    await page.screenshot({ path: path.join(OUT, 'screenshot-hud.png') });
    console.log('wrote screenshot-hud.png');

    await page.evaluate(() => {
      function hide(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.add('hidden');
        el.style.display = 'none';
      }
      hide('inGameUI');
      hide('mainMenu');
      hide('wodBootOverlay');
      hide('wodMapGenOverlay');
      hide('wodMpSyncOverlay');
      hide('escMenu');
      hide('selectionBox');
      document.querySelectorAll('.overlay, .wod-load-overlay').forEach((el) => {
        el.classList.add('hidden');
        el.style.display = 'none';
      });
      const canvas = document.getElementById('gameCanvas');
      if (canvas) {
        canvas.style.display = 'block';
        canvas.style.zIndex = '1';
      }
      gameData.fogOfWar = false;
      gameData.selection = [];
      gameData.layers.terrain = true;
      gameData.layers.diplomacy = true;
      gameData.layers.territory = false;
      gameData.layers.cityNames = false;
      gameData.layers.structures = true;
      gameData.layers.units = true;
      if (typeof wodSyncViewportAndCanvas === 'function') wodSyncViewportAndCanvas();
      if (typeof draw === 'function') draw();
    });

    for (let chunk = 0; chunk < 10; chunk++) {
      const snap = await page.evaluate(() => {
        const dt = 1 / 20;
        for (let i = 0; i < 50; i++) update(dt);
        const units = (gameData.entities || []).filter((e) => e && e.hp > 0 && e.owner > 0 && e.type !== 'convoy');
        const by = {};
        for (const u of units) (by[u.owner] ||= []).push(u);
        const owners = Object.keys(by).map(Number);
        let bestD = Infinity;
        for (let i = 0; i < owners.length; i++) {
          for (let j = i + 1; j < owners.length; j++) {
            for (const a of by[owners[i]]) {
              for (const b of by[owners[j]]) {
                const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
                if (d < bestD) bestD = d;
              }
            }
          }
        }
        if (typeof draw === 'function') draw();
        return { dist: Number.isFinite(bestD) ? Math.sqrt(bestD) : null, n: units.length };
      });
      console.log('sim', chunk, snap);
      if (snap.dist != null && snap.dist < 220) break;
    }

    await page.evaluate(() => {
      if (typeof setGameSpeed === 'function') setGameSpeed(0, true);
    });

    async function frameAt(opts) {
      return page.evaluate((opts) => {
        function isWater(h) {
          return typeof isWaterHex === 'function' ? isWaterHex(h) : !!(h && h.terrain === 'water');
        }
        function lookAt(wx, wy, zoom) {
          const canvas = document.getElementById('gameCanvas');
          const vw = canvas.clientWidth || 1920;
          const vh = canvas.clientHeight || 1080;
          gameData.camera.zoom = zoom;
          gameData.camera.x = wx * zoom - vw / 2;
          gameData.camera.y = wy * zoom - vh / 2;
        }
        const units = (gameData.entities || []).filter((e) => e && e.hp > 0 && e.owner > 0 && e.type !== 'convoy');
        const by = {};
        for (const u of units) (by[u.owner] ||= []).push(u);
        const owners = Object.keys(by).map(Number);
        let clashX = 0, clashY = 0, clashN = 0, bestD = Infinity;
        for (let i = 0; i < owners.length; i++) {
          for (let j = i + 1; j < owners.length; j++) {
            for (const a of by[owners[i]]) {
              for (const b of by[owners[j]]) {
                const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
                if (d < bestD) {
                  bestD = d;
                  clashX = (a.x + b.x) / 2;
                  clashY = (a.y + b.y) / 2;
                  clashN = 1;
                }
              }
            }
          }
        }
        const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
        const borderPts = [];
        if (gameData.hexes && gameData.hexList) {
          for (const h of gameData.hexList) {
            if (!h || h.owner <= 0 || isWater(h)) continue;
            for (const [dq, dr] of dirs) {
              const nb = gameData.hexes[`${h.q + dq},${h.r + dr}`];
              if (nb && nb.owner > 0 && nb.owner !== h.owner && !isWater(nb)) {
                borderPts.push({ x: h.x, y: h.y, owner: h.owner });
                break;
              }
            }
          }
        }
        let sx = clashX, sy = clashY, mode = opts.mode || 'clash';
        if (mode === 'landmass') {
          if (typeof wodCenterCameraOnLandmassForMenu === 'function') {
            gameData.camera.zoom = opts.zoom;
            wodCenterCameraOnLandmassForMenu();
          }
        } else if (mode === 'city') {
          const cities = (gameData.cities || []).filter((c) => c && isFinite(c.x) && isFinite(c.y));
          let best = null, bestCityD = Infinity;
          for (const c of cities) {
            const d = (c.x - clashX) ** 2 + (c.y - clashY) ** 2;
            if (d < bestCityD) {
              bestCityD = d;
              best = c;
            }
          }
          if (best) {
            sx = best.x * 0.55 + clashX * 0.45;
            sy = best.y * 0.55 + clashY * 0.45;
            lookAt(sx, sy, opts.zoom);
          } else {
            lookAt(clashX, clashY, opts.zoom);
          }
        } else if (mode === 'offset' && borderPts.length) {
          let far = borderPts[0], farD = -1;
          for (const p of borderPts) {
            const d = (p.x - clashX) ** 2 + (p.y - clashY) ** 2;
            if (d > farD) {
              farD = d;
              far = p;
            }
          }
          sx = far.x * 0.72 + clashX * 0.28;
          sy = far.y * 0.72 + clashY * 0.28;
          lookAt(sx, sy, opts.zoom);
        } else {
          lookAt(clashX, clashY, opts.zoom);
        }
        gameData.layers.cityNames = !!opts.cityNames;
        gameData.layers.territory = !!opts.territory;
        gameData.layers.diplomacy = true;
        if (typeof wodMarkTerrainFullDirty === 'function') wodMarkTerrainFullDirty();
        if (typeof draw === 'function') draw();
        return {
          mode,
          x: sx, y: sy, clashN,
          dist: Number.isFinite(bestD) ? Math.sqrt(bestD) : null,
          zoom: gameData.camera.zoom,
          cities: (gameData.cities || []).length,
          owners: Object.fromEntries(owners.map((o) => [o, (by[o] || []).length])),
        };
      }, opts);
    }

    async function snap(name, opts) {
      const info = await frameAt(opts);
      console.log('frame', name, info);
      await page.waitForTimeout(opts.territory ? 800 : 500);
      await page.evaluate(() => { if (typeof draw === 'function') draw(); });
      await saveCanvasPng(page, name);
    }

    await snap('front-close.png', { zoom: 1.7, cityNames: false, territory: false, mode: 'clash' });
    await snap('front-city.png', { zoom: 1.15, cityNames: true, territory: false, mode: 'city' });
    await snap('front-wide.png', { zoom: 0.52, cityNames: true, territory: false, mode: 'landmass' });
    await snap('front-territory.png', { zoom: 0.95, cityNames: false, territory: true, mode: 'offset' });

    if (errors.length) console.log('page errors', errors.slice(0, 8));
    console.log('CAPTURE OK');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
