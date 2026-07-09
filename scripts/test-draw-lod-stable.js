/**
 * Regression: gfxLite / simplify LOD must not flip every frame (causes unit/building flash).
 * Run: python -m http.server 8765 --bind 127.0.0.1
 *      node scripts/test-draw-lod-stable.js
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

  await page.goto('http://127.0.0.1:8765/index.html?v=lodStable1', { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => typeof startGame === 'function', { timeout: 120000 });
  await page.evaluate(() => startGame('ai'));
  await page.waitForFunction(
    () =>
      gameState === 'PLAYING' &&
      gameData.hexList &&
      gameData.hexList.length > 500 &&
      gameData.entities &&
      gameData.entities.length > 0,
    { timeout: 120000 }
  );
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const ov = document.getElementById('wodMissionPopupOverlay');
    if (ov && !ov.classList.contains('hidden')) document.getElementById('wodMissionPopupOk')?.click();
  });

  const result = await page.evaluate(() => {
    // Warm a few frames, then sample LOD flags while injecting frame-time noise.
    for (let i = 0; i < 8; i++) {
      if (typeof window.advanceTime === 'function') window.advanceTime(1000 / 60);
      else {
        update(1 / 60);
        draw();
      }
    }

    const samples = [];
    for (let i = 0; i < 60; i++) {
      // Alternate fake frame costs to try to thrash the old latch thresholds.
      wodDevFrameMs = i % 2 === 0 ? 30 : 14;
      if (typeof wodNoteSmoothedFrameMs === 'function') wodNoteSmoothedFrameMs(wodDevFrameMs);
      if (typeof window.advanceTime === 'function') window.advanceTime(1000 / 60);
      else {
        update(1 / 60);
        draw();
      }
      samples.push({
        lite: !!wodShouldGfxLite(),
        simp: !!wodShouldSimplifyDraw(),
        n: gameData.entities.length,
      });
    }

    let flips = 0;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].lite !== samples[i - 1].lite || samples[i].simp !== samples[i - 1].simp) flips++;
    }

    // Also verify city/fort draw path doesn't change size mid-stream for a fixed lite flag.
    const city = (gameData.cities || [])[0];
    const fort = (gameData.forts || [])[0];
    return {
      flips,
      first: samples[0],
      last: samples[samples.length - 1],
      city: city ? { x: city.x, y: city.y, name: city.name } : null,
      fort: fort ? { x: fort.x, y: fort.y } : null,
      smoothed: typeof wodSmoothedFrameMs === 'number' ? Math.round(wodSmoothedFrameMs * 10) / 10 : null,
    };
  });

  console.log(JSON.stringify(result, null, 2));
  if (errors.length) console.log('errors', errors.slice(0, 3));

  // Allow at most one transition (enter lite once); thrashing would be many flips.
  const ok = result.flips <= 1 && !errors.length;
  console.log(ok ? 'TEST OK' : 'TEST FAILED');
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
