const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const outDir = path.join(__dirname, '..', 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('console:' + msg.text());
  });

  await page.goto('http://127.0.0.1:8765/index.html', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  await page.waitForFunction(() => {
    const m = document.getElementById('mainMenu');
    return m && !m.classList.contains('hidden');
  }, { timeout: 120000 });
  await page.waitForTimeout(1500);

  const state1 = await page.evaluate(() => {
    if (typeof gameData !== 'undefined') gameData.gold = 1000;
    if (typeof wodProgress !== 'undefined' && wodProgress && wodProgress.profile) {
      wodProgress.profile.gold = 1000;
    }
    if (typeof updateSkinShop === 'function') updateSkinShop();
    return {
      gold: gameData.gold,
      menu: !document.getElementById('mainMenu').classList.contains('hidden'),
    };
  });
  console.log('menu', JSON.stringify(state1));

  await page.evaluate(() => showPanel('shop'));
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    if (typeof switchShopTab === 'function') switchShopTab('missions');
  });
  await page.waitForTimeout(900);

  const shopState = await page.evaluate(async () => {
    await wodLoadShopMapCatalog();
    const host = document.getElementById('shopMapOptions');
    return {
      catalog: wodShopMapCatalog.map((m) => ({
        id: m.id,
        name: m.name,
        price: m.price,
        packType: m.packType,
      })),
      cards: host ? host.querySelectorAll('.shop-map-card').length : 0,
      tabLabel: document.querySelector('[data-shop-tab="missions"]')?.textContent,
      lead: document.querySelector('#shopTabMaps .shop-tab-lead')?.textContent?.slice(0, 100),
    };
  });
  console.log('shop', JSON.stringify(shopState, null, 2));

  const bought = await page.evaluate(() => {
    const entry = wodShopMapCatalog.find((m) => m.id === 'normandy-dday');
    if (!entry) return { ok: false, reason: 'missing entry' };
    const ok = purchaseShopMap(entry);
    return {
      ok,
      owned: wodOwnsShopVisual(wodShopMapShopId('normandy-dday')),
      gold: gameData.gold,
    };
  });
  console.log('purchase', JSON.stringify(bought));

  await page.evaluate(() => {
    _wodMissionListTab = 'store';
    showPanel('missions');
  });
  await page.waitForTimeout(1200);

  const missionPanel = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#wodMissionList .wod-mission-row')].map((r) => ({
      id: r.dataset.missionId,
      text: r.innerText.replace(/\s+/g, ' ').slice(0, 140),
      locked: r.classList.contains('locked'),
    }));
    return {
      rows,
      sub: document.getElementById('wodMissionPanelSub')?.textContent,
      storeActive: document.getElementById('wodMissionTabStore')?.classList.contains('active'),
      campaignActive: document
        .getElementById('wodMissionTabCampaign')
        ?.classList.contains('active'),
    };
  });
  console.log('missions', JSON.stringify(missionPanel, null, 2));

  const start = await page.evaluate(async () => {
    const entry = wodFindMissionEntryById('normandy-dday');
    if (!entry) return { ok: false, reason: 'no entry' };
    if (!wodStoreMissionPlayable(entry)) return { ok: false, reason: 'not playable' };
    const ok = await wodApplyMissionEntry(entry);
    if (!ok) return { ok: false, reason: 'apply failed' };
    startGame('ai', { mission: true });
    return {
      ok: true,
      title: gameData.mission && gameData.mission.title,
      events: gameData.mission && gameData.mission.events && gameData.mission.events.length,
      cities: (gameData.cities || []).map((c) => c.name),
      storeFlag: !!(gameData._selectedMissionEntry && gameData._selectedMissionEntry.storeMission),
    };
  });
  console.log('start', JSON.stringify(start, null, 2));

  for (let i = 0; i < 120; i++) {
    await page.evaluate(() => {
      if (typeof window.advanceTime === 'function') window.advanceTime(1000 / 60);
    });
  }
  await page.waitForTimeout(600);

  const popup = await page.evaluate(() => {
    const ov = document.getElementById('wodMissionPopupOverlay');
    return {
      visible: ov && !ov.classList.contains('hidden'),
      title: document.getElementById('wodMissionPopupTitle')?.textContent,
      kicker: document.getElementById('wodMissionPopupKicker')?.textContent,
      body: document.getElementById('wodMissionPopupBody')?.textContent?.slice(0, 180),
    };
  });
  console.log('popup', JSON.stringify(popup, null, 2));

  await page.screenshot({ path: path.join(outDir, 'dday-mission-test.png') });
  console.log('errors', errors.slice(0, 12));

  const failed =
    !shopState.catalog.some((c) => c.id === 'normandy-dday') ||
    !bought.owned ||
    !missionPanel.rows.some((r) => r.id === 'normandy-dday') ||
    !start.ok ||
    !popup.visible;
  if (failed) {
    console.error('TEST FAILED');
    process.exitCode = 1;
  } else {
    console.log('TEST OK');
  }

  await browser.close();
})().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
