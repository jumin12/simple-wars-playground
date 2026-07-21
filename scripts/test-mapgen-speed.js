const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('http://127.0.0.1:8765/index.html', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForFunction(() => {
    const m = document.getElementById('mainMenu');
    return m && !m.classList.contains('hidden');
  }, { timeout: 120000 });

  // Open skirmish / setup if needed
  await page.evaluate(() => {
    if (typeof showScreen === 'function') {
      try { showScreen('setupScreen'); } catch (_) {}
    }
    const btn = document.getElementById('btnVsAi') || document.querySelector('[onclick*="setup"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(500);

  async function timeGen(aiCount) {
    return page.evaluate(async (ai) => {
      const aiEl = document.getElementById('setupAI');
      if (aiEl) aiEl.value = String(ai);
      gameData.aiCount = ai;
      const sizeEl = document.getElementById('setupMapSize');
      if (sizeEl) sizeEl.value = '60';
      wodApplyMapSizePreset('60');
      gameData._wodReuseMapGenSeed = false;
      gameData.loadedCustomMap = false;
      const t0 = performance.now();
      wodMapGenYieldingStart(26);
      try {
        await generateMap();
      } finally {
        wodMapGenYieldingStop();
      }
      const ms = performance.now() - t0;
      const owners = {};
      for (const h of gameData.hexList) {
        if (!h || h.owner <= 0) continue;
        owners[h.owner] = (owners[h.owner] || 0) + 1;
      }
      return {
        ms: Math.round(ms),
        hexes: gameData.hexList.length,
        cities: gameData.cities.length,
        owners,
        factions: 1 + ai,
      };
    }, aiCount);
  }

  const r1 = await timeGen(1);
  console.log('1 AI', r1);
  const r2 = await timeGen(2);
  console.log('2 AI', r2);
  const r3 = await timeGen(3);
  console.log('3 AI', r3);

  console.log('errors', errors.slice(0, 10));
  const hang = r1.ms > 15000 || r2.ms > 15000 || r3.ms > 20000;
  console.log(hang ? 'TEST FAILED (too slow)' : 'TEST OK');
  process.exitCode = hang || errors.length ? 1 : 0;
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
