'use strict';
// Native game in Chromium: exercise repair, live topology and actual attrition ticks.
const fs = require('fs'), path = require('path'), http = require('http');
const assert = require('assert/strict'), { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output/naval-healing-encirclement');
fs.mkdirSync(OUT, { recursive: true });
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.resolve(ROOT, '.' + (url === '/' ? '/index.html' : url));
  if (!file.startsWith(ROOT + path.sep)) return res.writeHead(403).end();
  if (process.env.BASELINE && ['index.html', 'ai-command.js'].includes(path.relative(ROOT, file)))
    file = path.join(OUT, 'baseline', path.basename(file));
  fs.readFile(file, (err, body) => {
    if (err) return res.writeHead(404).end();
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.css': 'text/css', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' })[path.extname(file)] || 'application/octet-stream');
    res.end(body);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage(), errors = [], results = {};
  page.on('pageerror', err => errors.push(err.stack));
  await context.routeWebSocket(/.*/, socket => {
    socket.onMessage(() => {});
    socket.send(JSON.stringify({ t: 'welcome', online: 0, lobbies: [] }));
  });
  try {
    await page.goto('http://127.0.0.1:' + server.address().port + '/?autostart=1');
    await page.waitForFunction(() => gameState === 'PLAYING' && gameData._matchReadyForEndChecks, null, { timeout: 180000 });
    await page.evaluate(() => {
      setGameSpeed(0, true); cancelAnimationFrame(animationFrameId); wodDismissChangelogPopup(); wodCloudCanSync = () => false;
      window.tile = (q, r = 0) => gameData.hexes[q + ',' + r];
      window.resetCase = (owner = 1, water = false) => {
        wodPrepareForNewMatch({ keepLiveMap: true }); WOD.makeBlankMap(24);
        gameState = 'PLAYING'; gameData.menuAttractMode = false; gameData.mp = { enabled: false };
        gameData._campaignRun = null; gameData._matchReadyForEndChecks = false; gameData.fogOfWar = false;
        gameData.entities = []; gameData.cities = []; gameData.forts = []; gameData.hospitals = []; gameData.bridges = [];
        gameData.selection = []; gameData.constructionJobs = []; gameData.alliances = [];
        gameData.encircledHexes = new Set(); gameData.encircledReliefHexes = new Set(); gameData.marineWaterSupplyHexes = new Set(); gameData._encircWork = null;
        gameData._aiEconomyClock = 0; gameData.aiTimer = gameData.aiStrategyTimer = gameData.convoyTimer = gameData._transportAiTimer = -1e6;
        gameData.aiTaskForces = {}; gameData.aiBattlePlans = {}; gameData.aiNavalPlans = {};
        gameData._aiDefenseByOwner = {}; gameData._aiFrontOffensives = {}; gameData._aiCombatContexts = {};
        gameData._aiLocalSituation = new WeakMap(); gameData._aiMoveQueue = new Map(); gameData._wodClaimBatch = new Map();
        gameData.money = gameData.manpower = 1e6; gameData.aiMoneyByOwner = { 2: 1e6 }; gameData.aiManpowerByOwner = { 2: 1e6 };
        for (const h of gameData.hexList) { h.type = water ? 'water' : 'grass'; h.owner = water ? 0 : 3 - owner; h.cityId = null; }
      };
      window.addTown = (q, r, owner, id = 'Home') => {
        const h = tile(q, r); h.type = 'urban'; h.owner = owner; h.cityId = id;
        const city = { id, name: id, q, r, x: h.x, y: h.y, owner, hp: 1000, maxHp: 1000 };
        gameData.cities.push(city); return city;
      };
      window.addUnit = (q, r, type, owner) => {
        const h = tile(q, r), u = createUnitAt(type, h.x, h.y, owner, { startSpawn: true });
        u.x = u._drawX = h.x; u.y = u._drawY = h.y; u.isGeneral = false; return u;
      };
      window.hurt = u => { u.hp = u.maxHp * .5; u.manpower = u.maxManpower * .5; u.morale = 100; };
      window.refreshCase = () => { gameData.unitSpatialGrid = buildUnitSpatialGrid(); wodRebuildHexCombatOccupancy(); gameData._generalAuraCache = null; };
      window.tickCase = seconds => { for (let n = 0; n < Math.round(seconds * 20); n++) { wodBeginSimPfBudget(gameData.entities.length); update(.05); } };
      window.out = u => !!wodGetUnitEncirclementState(u, getNearestHexToPoint(u.x, u.y));
    });
    results.repairs = [];
    for (const owner of [1, 2]) for (const type of ['ship', 'transport', 'supply']) for (const distance of [2, 3]) {
      results.repairs.push(await page.evaluate(({ owner, type, distance }) => {
        resetCase(owner, true); addTown(0, 0, owner);
        const u = addUnit(distance, 0, type, owner); hurt(u); refreshCase();
        const site = wodUnitHealingSite(u), before = u.hp, allowed = canHealUnit(u); updateUnitHealing(u, 1);
        return { owner, type, distance, allowed, site: site?.kind || null, healed: u.hp > before };
      }, { owner, type, distance }));
    }
    results.hospitals = [];
    for (const owner of [1, 2]) for (const type of ['ship', 'transport', 'supply']) for (const inside of [true, false]) {
      results.hospitals.push(await page.evaluate(({ owner, type, inside }) => {
        resetCase(owner, true); const h = tile(0); h.type = 'grass'; h.owner = owner;
        const hospital = { q: 0, r: 0, x: 0, y: 0, owner }; gameData.hospitals.push(hospital);
        const u = addUnit(5, 0, type, owner); u.x = wodFortCombatAuraRadiusPx() + (inside ? -1 : 1); hurt(u); refreshCase();
        const allowed = canHealUnit(u), before = u.hp; updateUnitHealing(u, 1);
        return { owner, type, inside, allowed, healed: u.hp > before };
      }, { owner, type, inside }));
    }
    results.isolation = [];
    for (const owner of [1, 2]) for (const type of ['light', 'heavy', 'motorized', 'mountaineer', 'marine']) {
      results.isolation.push(await page.evaluate(({ owner, type }) => {
        resetCase(owner); addTown(-14, 0, owner);
        for (let q = -13; q <= 6; q++) tile(q).owner = owner;
        for (let q = 4; q <= 8; q++) for (let r = -2; r <= 2; r++) tile(q, r).owner = owner;
        const u = addUnit(6, 0, type, owner); u.isGeneral = type === 'heavy'; refreshCase();
        const connected = !out(u); setHexOwner(tile(0), 3 - owner);
        const immediate = out(u), tileFlag = !!wodGetHexEncirclementState(tile(6));
        tickCase(1.9); const earlyWarning = !!wodUnitSupplyWarningState(u, tile(6)), before = u.hp;
        tickCase(.2); const warning = !!wodUnitSupplyWarningState(u, tile(6));
        tickCase(9.8); const safeHp = u.hp; tickCase(.6);
        const loss = before - u.hp, countdown = u.outOfSupplySeconds, overhead = u.encircledFlash > 0;
        setHexOwner(tile(0), owner); tickCase(.1);
        return { owner, type, connected, immediate, tileFlag, earlyWarning, warning, safeBeforeGrace: Math.abs(safeHp - before) < 1e-7, loss, countdown, overhead, reconnected: !out(u), reset: u.outOfSupplySeconds === 0 };
      }, { owner, type }));
    }
    results.bridgeRemoval = [];
    for (const owner of [1, 2]) results.bridgeRemoval.push(await page.evaluate(owner => {
      resetCase(owner, true);
      for (const h of gameData.hexList) if (Math.abs(h.q) >= 4) { h.type = 'grass'; h.owner = owner; }
      addTown(-12, 0, owner); placeBridgeAt(owner, 0, 0, 0, 240, 30, { editor: true, suppressNotes: true });
      const u = addUnit(8, 0, 'light', owner); refreshCase(); const connected = !out(u);
      gameData.bridges = []; const isolated = out(u); tickCase(12.5);
      return { owner, connected, isolated, damage: u.maxHp - u.hp, warning: u.encircledFlash > 0 };
    }, owner));
    results.neutralFill = [];
    for (const owner of [1, 2]) results.neutralFill.push(await page.evaluate(owner => {
      resetCase(owner);
      for (const h of gameData.hexList) h.owner = h.q === 0 ? 0 : owner;
      addTown(-12, 0, owner); const u = addUnit(8, 0, 'light', owner); refreshCase();
      const isolated = out(u), filled = wodFillUnownedPoliticalHexes(1), reconnected = !out(u);
      return { owner, isolated, filled, reconnected };
    }, owner));
    results.repairDestinations = [];
    for (const owner of [1, 2]) for (const type of ['ship', 'transport', 'supply']) {
      results.repairDestinations.push(await page.evaluate(({ owner, type }) => {
        resetCase(owner, true); const city = addTown(0, 0, owner);
        const u = addUnit(5, 0, type, owner); hurt(u); u.hp = u.maxHp * .3; u.manpower = u.maxManpower * .3; refreshCase();
        const moraleGoal = wodMoraleHealingGoal(u);
        wodAiManageRecovery(owner);
        const goal = u.orderTarget && { ...u.orderTarget }, initial = u.hp;
        tickCase(90);
        return { owner, type, moraleGoalDistance: moraleGoal && wodHexCellDist(moraleGoal, tile(0)), aiGoalDistance: goal && wodHexCellDist(getNearestHexToPoint(goal.x, goal.y), tile(0)), moved: Math.hypot(u.x - tile(5).x, u.y) > 20, healed: u.hp > initial, finalDistance: wodHexCellDist(getNearestHexToPoint(u.x, u.y), tile(city.q, city.r)) };
      }, { owner, type }));
    }
    results.exceptions = [];
    for (const owner of [1, 2]) results.exceptions.push(await page.evaluate(owner => {
      resetCase(owner, true);
      for (const h of gameData.hexList) if (Math.abs(h.q) <= 3 && Math.abs(h.r) <= 3) { h.type = 'grass'; h.owner = owner; }
      const infantry = addUnit(0, 0, 'light', owner), marine = addUnit(1, 0, 'marine', owner);
      refreshCase(); const coast = { infantry: out(infantry), marine: out(marine), autoSurrenderFlag: wodHexKeyIsEncircled(getHexKey(tile(0))) };
      const boat = addUnit(5, 0, 'supply', owner); boat.x = tile(0).x + wodFortCombatAuraRadiusPx() - 1; boat.y = 0;
      const supplied = !out(infantry); boat.hp = 0; const supplyLost = out(infantry);
      resetCase(owner); addTown(0, 0, owner); tile(1, 1).owner = tile(2, 2).owner = owner;
      const diagonal = addUnit(2, 2, 'heavy', owner); refreshCase(); const diagonalConnected = !out(diagonal);
      setHexOwner(tile(1, 1), 3 - owner); const diagonalCut = out(diagonal);
      return { owner, coast, supplied, supplyLost, diagonalConnected, diagonalCut };
    }, owner));
    results.urbanEdge = await page.evaluate(() => {
      resetCase(1, true); const city = addTown(-6, 0, 1);
      for (let q = -5; q <= -2; q++) { const h = tile(q); h.type = 'urban'; h.owner = 1; h.cityId = city.id; }
      const u = addUnit(0, 0, 'ship', 1); hurt(u); refreshCase();
      return { nearestCell: 2, centerDistance: 6, allowed: canHealUnit(u) };
    });
    results.hospitalCombat = await page.evaluate(() => {
      resetCase(1, true); tile(0).type = 'grass'; tile(0).owner = 1;
      gameData.hospitals.push({ q: 0, r: 0, x: 0, y: 0, owner: 1 });
      const u = addUnit(2, 0, 'ship', 1); hurt(u); addUnit(3, 0, 'ship', 2); refreshCase();
      const before = u.hp; updateUnitHealing(u, 1); return { blocked: !canHealUnit(u), noHealing: u.hp === before };
    });
    await page.evaluate(() => {
      resetCase(1); addTown(-14, 0, 1);
      for (const h of gameData.hexList) if (Math.abs(h.q) < 4 && Math.abs(h.r) < 4) h.owner = 1;
      const u = addUnit(0, 0, 'heavy', 1); u.isGeneral = true; refreshCase(); tickCase(4);
      u.selected = true; gameData.selection = [u]; gameData.layers.territory = true;
      UI.mainMenu.classList.add('hidden'); UI.panels.forEach(p => p.classList.add('hidden')); UI.inGameUI.style.display = 'block';
      gameData.camera = { zoom: 2, x: -720, y: -420 }; wodMarkTerrainFullDirty(); updateTerrainCache(); syncInfoCardPanel(); draw();
    });
    await page.screenshot({ path: path.join(OUT, 'encircled-general.png') });
    await page.evaluate(() => {
      resetCase(1, true); addTown(-2, 0, 1, 'Port watch');
      const near = addUnit(0, 0, 'ship', 1), far = addUnit(1, 3, 'transport', 1); hurt(near); hurt(far); refreshCase();
      updateUnitHealing(near, .2); updateUnitHealing(far, .2); near.selected = true; gameData.selection = [near];
      gameData.camera = { zoom: 2, x: -720, y: -420 }; wodMarkTerrainFullDirty(); updateTerrainCache(); syncInfoCardPanel(); draw();
    });
    await page.screenshot({ path: path.join(OUT, 'two-tile-ship-repair.png') });
    fs.writeFileSync(path.join(OUT, process.env.BASELINE ? 'baseline-results.json' : 'results.json'), JSON.stringify({ results, errors }, null, 2));
    console.log(JSON.stringify({ results, errors }, null, 2));
    if (!process.env.OBSERVE_ONLY) {
      assert(results.repairs.every(r => r.allowed === (r.distance <= 2) && r.healed === r.allowed), 'naval town repairs are limited to two tiles');
      assert(results.hospitals.every(r => r.allowed === r.inside && r.healed === r.inside), 'all naval hulls obey hospital radius');
      assert(results.isolation.every(r => r.connected && r.immediate && r.tileFlag && !r.earlyWarning && r.warning && r.safeBeforeGrace && r.loss > 0 && r.overhead && r.reconnected && r.reset), 'cutoffs show reliable warnings, observe grace and take attrition');
      assert(results.bridgeRemoval.every(r => r.connected && r.isolated && r.damage > 0 && r.warning), 'removed crossings invalidate cached city supply');
      assert(results.neutralFill.every(r => r.isolated && r.filled && r.reconnected), 'neutral-cell cleanup invalidates cached disconnection');
      assert(results.repairDestinations.every(r => Number.isFinite(r.moraleGoalDistance) && Number.isFinite(r.aiGoalDistance) && r.moraleGoalDistance <= 2 && r.aiGoalDistance <= 2 && r.moved && r.healed && r.finalDistance <= 2), 'AI and rallied vessels reach actual repair water');
      assert(results.exceptions.every(r => r.coast.infantry && !r.coast.marine && !r.coast.autoSurrenderFlag && r.supplied && r.supplyLost && r.diagonalConnected && r.diagonalCut), 'coastal capture, marine/naval supply and legal diagonals retain their rules');
      assert(results.urbanEdge.allowed, 'repair range is measured from the closest friendly urban cell');
      assert(results.hospitalCombat.blocked && results.hospitalCombat.noHealing, 'hospital repairs stop during combat');
      assert.deepEqual(errors, []);
    }
  } finally { await browser.close(); server.close(); }
})().catch(err => { console.error(err); server.close(); process.exitCode = 1; });
