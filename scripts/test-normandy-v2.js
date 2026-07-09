const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const outDir = path.join(__dirname, '..', 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('http://127.0.0.1:8765/index.html?v=dday2', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => {
    const m = document.getElementById('mainMenu');
    return m && !m.classList.contains('hidden') && typeof wodLoadShopMapCatalog === 'function';
  }, { timeout: 120000 });
  await page.waitForTimeout(1200);

  const start = await page.evaluate(async () => {
    gameData.gold = 1000;
    if (wodProgress && wodProgress.profile) wodProgress.profile.gold = 1000;
    await wodLoadShopMapCatalog();
    const entry = wodShopMapCatalog.find((m) => m.id === 'normandy-dday');
    if (!entry) return { ok: false, reason: 'no catalog' };
    gameData.ownedShopVisuals = gameData.ownedShopVisuals || {};
    gameData.ownedShopVisuals[wodShopMapShopId(entry.id)] = true;
    const full = Object.assign({}, entry, { storeMission: true, packType: 'oneshot' });
    const ok = await wodApplyMissionEntry(full);
    if (!ok) return { ok: false, reason: 'apply failed' };
    startGame('ai', { mission: true });
    return {
      ok: true,
      title: gameData.mission && gameData.mission.title,
      cities: (gameData.cities || []).map((c) => c.name),
      units: (gameData.entities || []).length,
      named: (gameData.entities || []).filter((e) => e.name && /Div\.|Force |Panzer|Airborne|Ranger|Warspite|Texas/.test(e.name)).map((e) => e.name),
    };
  });
  console.log('start', JSON.stringify(start, null, 2));

  for (let i = 0; i < 120; i++) {
    await page.evaluate(() => {
      if (typeof window.advanceTime === 'function') window.advanceTime(1000 / 60);
    });
  }
  await page.waitForTimeout(400);

  const popup = await page.evaluate(() => {
    const ov = document.getElementById('wodMissionPopupOverlay');
    return {
      visible: ov && !ov.classList.contains('hidden'),
      title: document.getElementById('wodMissionPopupTitle')?.textContent,
      body: document.getElementById('wodMissionPopupBody')?.textContent?.slice(0, 220),
    };
  });
  console.log('popup', JSON.stringify(popup, null, 2));
  await page.screenshot({ path: path.join(outDir, 'dday-normandy-v2.png') });

  // Dismiss popup and capture map overview
  await page.evaluate(() => {
    const btn = document.getElementById('wodMissionPopupOk');
    if (btn) btn.click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    // Zoom out to see Cotentin + beaches
    if (gameData.camera) {
      gameData.camera.zoom = 0.22;
      gameData.camera.x = -200;
      gameData.camera.y = 80;
    }
    if (typeof draw === 'function') draw();
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, 'dday-normandy-map.png') });

  const need = ['Cherbourg', 'Caen', 'Bayeux', 'Carentan', 'Sainte-Mère-Église', 'Ouistreham', 'Portsmouth'];
  const missing = need.filter((n) => !(start.cities || []).includes(n));
  const failed = !start.ok || missing.length || !popup.visible || !(start.named || []).length;
  console.log('missing cities', missing);
  console.log('errors', errors.slice(0, 6));
  console.log(failed ? 'TEST FAILED' : 'TEST OK');
  process.exitCode = failed ? 1 : 0;
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
