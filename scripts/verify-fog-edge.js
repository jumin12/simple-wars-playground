'use strict';
// Fog of war: an enemy that leaves your sight fades out instead of vanishing (js/fog.js wodFogUnitAlpha). In a paused
// skirmish with fog, one of your units is moved next to an enemy nobody of yours can see, then back home:
//   - an enemy never seen stays hidden; once in sight it is shown at full strength at once
//   - just out of sight it is still shown at full strength (a unit on the edge of vision no longer blinks)
//   - then it fades, and soon after it is hidden and cannot be clicked
//   - back in sight it is shown at full strength again; one step outside vision it stays shown (the edge has a cell
//     of give), two steps out it fades; your own units are always shown
//   - frames draw cleanly while it fades
const assert = require('assert/strict');
const H = require('./lib/harness');

(async () => {
    const server = await H.startServer();
    const browser = await H.launchBrowser();
    try {
        const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
        const errors = H.collectErrors(page);
        await H.gotoMenu(page, server.url);
        await page.evaluate(() => { const f = document.getElementById('setupFogOfWar'); f.checked = true; f.dispatchEvent(new Event('change')); });
        await H.startSkirmish(page);
        const r = await page.evaluate(async () => {
            setGameSpeed(0, true);
            window.checkCampaignEndConditions = () => {};
            const me = wodLocalPlayerOwner(), sleep = ms => new Promise(res => setTimeout(res, ms));
            const refresh = () => wodRefreshFogVision(0, true);
            refresh();
            const cellSeen = u => wodFogHexVisible(getNearestHexToPoint(u.x, u.y));
            const enemy = gameData.entities.find(u => u.owner !== me && u.hp > 0 && u.type !== 'convoy' && !cellSeen(u));
            const scout = gameData.entities.find(u => u.owner === me && u.hp > 0 && !wodIsNavalUnit(u) && u.type !== 'convoy');
            if(!enemy || !scout) return { setup: false };
            const out = { setup: true, fog: wodFogActive() };
            out.neverSeen = wodFogUnitAlpha(enemy);
            out.ownAlpha = wodFogUnitAlpha(scout);
            const home = { x: scout.x, y: scout.y }, sp = (gameData.hexRadius || 20) * 1.35;
            // in sight: two cells from the enemy
            scout.x = enemy.x + sp * 2; scout.y = enemy.y; refresh();
            out.inSight = wodFogUnitAlpha(enemy);
            // out of sight again: back home
            scout.x = home.x; scout.y = home.y; refresh();
            const left = performance.now();
            out.cellHidden = !cellSeen(enemy);
            await sleep(150);
            out.at150 = { alpha: wodFogUnitAlpha(enemy), ms: Math.round(performance.now() - left) };
            await sleep(500);
            out.at650 = { alpha: wodFogUnitAlpha(enemy), ms: Math.round(performance.now() - left) };
            window.draw();
            await sleep(750);
            out.at1400 = { alpha: wodFogUnitAlpha(enemy), canSee: wodFogCanSeeUnit(enemy), ms: Math.round(performance.now() - left) };
            window.draw();
            // back in sight: at once
            scout.x = enemy.x + sp * 2; scout.y = enemy.y; refresh();
            out.again = wodFogUnitAlpha(enemy);
            // the edge: with the enemy's cell one step outside the scout's vision, it stays shown (going out of sight
            // takes a step further than coming in); two steps out, it fades as before
            const eh = getNearestHexToPoint(enemy.x, enemy.y), R = wodFogVisionRadiusForUnit(scout);
            const at = d => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => wodHexAt(eh.q + a * d, eh.r + b * d)).find(Boolean);
            const edge = at(R + 1), far = at(R + 3);
            if(!edge || !far) { out.edge = 'no room'; return out; }
            scout.x = edge.x; scout.y = edge.y; refresh();
            out.edgeCellSeen = cellSeen(enemy);
            const t0 = performance.now();
            await sleep(1600);
            out.edgeAfter1600 = { alpha: wodFogUnitAlpha(enemy), ms: Math.round(performance.now() - t0) };
            scout.x = far.x; scout.y = far.y; refresh();
            await sleep(1500);
            out.farAfter1500 = wodFogUnitAlpha(enemy);
            scout.x = home.x; scout.y = home.y; refresh();
            return out;
        });
        assert.ok(r.setup, 'found an enemy out of sight and a unit to scout with');
        assert.ok(r.fog, 'fog of war is on');
        assert.equal(r.ownAlpha, 1, 'your own units are always shown');
        assert.equal(r.neverSeen, 0, 'an enemy never seen stays hidden');
        assert.equal(r.inSight, 1, 'an enemy in sight is shown');
        assert.ok(r.cellHidden, 'the enemy\'s cell is out of sight again');
        assert.equal(r.at150.alpha, 1, 'just out of sight it is still shown in full: ' + JSON.stringify(r.at150));
        assert.ok(r.at650.alpha > 0 && r.at650.alpha < 1, 'then it fades: ' + JSON.stringify(r.at650));
        assert.equal(r.at1400.alpha, 0, 'then it is hidden: ' + JSON.stringify(r.at1400));
        assert.equal(r.at1400.canSee, false, 'and cannot be seen or clicked');
        assert.equal(r.again, 1, 'back in sight it is shown in full at once');
        assert.notEqual(r.edge, 'no room', 'room on the map for the edge case');
        assert.equal(r.edgeCellSeen, false, 'one step outside vision, its cell is out of sight');
        assert.equal(r.edgeAfter1600.alpha, 1, 'yet it stays shown while it is on the edge: ' + JSON.stringify(r.edgeAfter1600));
        assert.equal(r.farAfter1500, 0, 'two steps further out, it fades and is hidden');
        assert.deepEqual(errors.pageErrors, [], 'no page errors');
        console.log(JSON.stringify(r));
        console.log('verify-fog-edge: OK');
    } finally { await browser.close(); await server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
