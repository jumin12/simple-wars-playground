/**
 * Stress: spawn a huge army and measure update/draw frame times.
 * Run with local server: python -m http.server 8765 --bind 127.0.0.1
 *   node scripts/test-huge-army-perf.js
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

  await page.goto('http://127.0.0.1:8765/index.html?v=hugeArmy3', { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(2000);
  await page.waitForFunction(() => typeof startGame === 'function' && document.getElementById('mainMenu'), {
    timeout: 120000,
  });

  await page.evaluate(() => {
    startGame('ai');
  });

  // Wait for procedural map + initial units.
  await page.waitForFunction(
    () =>
      gameState === 'PLAYING' &&
      gameData.hexList &&
      gameData.hexList.length > 500 &&
      gameData.entities &&
      gameData.entities.length > 0,
    { timeout: 120000 }
  );
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const ov = document.getElementById('wodMissionPopupOverlay');
    if (ov && !ov.classList.contains('hidden')) document.getElementById('wodMissionPopupOk')?.click();
  });

  const result = await page.evaluate(() => {
    function forceUnit(type, owner, x, y, i) {
      const base = {
        type,
        owner,
        name: 'Stress ' + i,
        x,
        y,
        target: null,
        hp: type === 'heavy' ? 300 : 100,
        maxHp: type === 'heavy' ? 300 : 100,
        manpower: 1000,
        maxManpower: 1000,
        tanks: type === 'heavy' ? 500 : 0,
        maxTanks: type === 'heavy' ? 500 : 0,
        selected: false,
        shake: 0,
        activeCombatVisual: 0,
        morale: 100,
        maxMorale: 100,
        moraleBroken: false,
        xp: 0,
        kills: 0,
        losses: 0,
        tankKills: 0,
        tankLosses: 0,
        veteran: false,
        uid: 'stress_' + owner + '_' + i,
        speed: type === 'heavy' ? 10 : 15,
        damage: type === 'heavy' ? 18 : 8,
        range: type === 'heavy' ? 60 : 50,
        attackCooldown: type === 'heavy' ? 2.8 : 2.0,
        radius: type === 'heavy' ? 16 : 12,
      };
      gameData.entities.push(base);
      return base;
    }

    function spawnFlood(count, owner, type, startIdx) {
      const land = (gameData.hexList || []).filter(
        (h) => h && h.type !== 'water' && h.type !== 'mountain' && h.type !== 'urban'
      );
      if (!land.length) return 0;
      let n = 0;
      for (let i = 0; i < count; i++) {
        const h = land[(startIdx + i * 7) % land.length];
        const jitter = ((i * 17) % 21) - 10;
        const u = createUnitAt(type, h.x + jitter, h.y + ((i * 13) % 17) - 8, owner, { startSpawn: true });
        if (u) n++;
        else {
          forceUnit(type, owner, h.x + jitter, h.y + ((i * 13) % 17) - 8, startIdx + i);
          n++;
        }
      }
      return n;
    }

    const before = gameData.entities.length;
    spawnFlood(320, 1, 'light', 0);
    spawnFlood(120, 1, 'heavy', 1000);
    spawnFlood(280, 2, 'light', 2000);
    spawnFlood(100, 2, 'heavy', 3000);
    const afterSpawn = gameData.entities.length;

    let ordered = 0;
    const foeCity = (gameData.cities || []).find((c) => c.owner === 2) || (gameData.cities || [])[0];
    for (const u of gameData.entities) {
      if (!u || u.owner !== 1 || u.hp <= 0 || u.type === 'convoy') continue;
      if (ordered >= 140) break;
      if (typeof assignUnitMoveAlongWaypoints === 'function' && foeCity) {
        assignUnitMoveAlongWaypoints(u, [{ x: foeCity.x, y: foeCity.y }]);
        ordered++;
      }
    }

    const samples = [];
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      if (typeof window.advanceTime === 'function') window.advanceTime(1000 / 60);
      else {
        update(1 / 60);
        draw();
      }
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const p50 = samples[Math.floor(samples.length * 0.5)];
    const p90 = samples[Math.floor(samples.length * 0.9)];
    const p95 = samples[Math.floor(samples.length * 0.95)];

    return {
      before,
      afterSpawn,
      ordered,
      hexes: (gameData.hexList || []).length,
      tier: typeof wodArmyScaleTier === 'function' ? wodArmyScaleTier(afterSpawn) : -1,
      avg: Math.round(avg * 10) / 10,
      p50: Math.round(p50 * 10) / 10,
      p90: Math.round(p90 * 10) / 10,
      p95: Math.round(p95 * 10) / 10,
      max: Math.round(samples[samples.length - 1] * 10) / 10,
    };
  });

  console.log(JSON.stringify(result, null, 2));
  if (errors.length) console.log('errors', errors.slice(0, 3));

  const ok =
    result.afterSpawn >= 700 &&
    result.tier >= 4 &&
    result.p50 < 55 &&
    result.p90 < 100 &&
    !errors.length;

  console.log(ok ? 'TEST OK' : 'TEST FAILED');
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
