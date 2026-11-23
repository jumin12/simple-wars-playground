'use strict';
// One frame that throws part-way through drawing must not spoil the frames after it. It used to leave its camera
// transform on the canvas, so every later frame was drawn moved and zoomed on top of the last: the map showed again
// and again at other sizes. And a multiplayer match that starts must not bring the menu's background battle back.
const H = require('./lib/harness');
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const OUT = path.join(path.resolve(__dirname, '..'), 'output/draw-recovery');
fs.mkdirSync(OUT, { recursive: true });
const server = H.createStaticServer();
(async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const browser = await H.launchBrowser();
    try {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
        await context.routeWebSocket(/.*/, s => { s.onMessage(() => {}); s.send(JSON.stringify({ t: 'welcome', online: 1, lobbies: [] })); });
        const page = await context.newPage();
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.goto('http://127.0.0.1:' + server.address().port + '/');
        await page.waitForFunction(() => typeof startGame === 'function' && !window._wodBootBusy && !window._wodMenuBootstrapBusy && gameState === 'MENU', null, { timeout: 180000 });
        await page.evaluate(() => { try { wodDismissChangelogPopup(); } catch(e) {} showPanel('setup'); });
        await page.waitForFunction(() => !wodIsMapPreviewGenerating(), null, { timeout: 120000 });
        await page.evaluate(() => startGame('ai'));
        await page.waitForFunction(() => gameState === 'PLAYING' && gameData.entities.length > 0, null, { timeout: 120000 });
        await page.waitForTimeout(1000);
        const r = await page.evaluate(() => {
            setGameSpeed(0, true);
            const t = () => { const m = ctx.getTransform(); return [m.a, m.b, m.c, m.d, m.e, m.f].map(v => +v.toFixed(3)); };
            const base = t();
            // a frame that throws while the camera transform is on the canvas
            const layer = window.wodDrawCitiesLayer;
            window.wodDrawCitiesLayer = function() { throw new Error('test: a layer failed'); };
            let threw = false;
            try { draw(); } catch(e) { threw = true; }
            const afterFailed = t();
            window.wodDrawCitiesLayer = layer;
            draw();
            const afterNext = t();
            return { dpr: wodCanvasAllocSize.dpr, base, threw, afterFailed, afterNext };
        });
        assert(r.threw, 'the test frame threw');
        assert.notDeepEqual(r.afterFailed, r.base, 'the failed frame left its camera transform behind');
        assert.deepEqual(r.afterNext, [r.dpr, 0, 0, r.dpr, 0, 0], 'the next frame draws from a clean canvas: ' + JSON.stringify(r));
        await page.screenshot({ path: path.join(OUT, 'after-failed-frame.png') });
        // a multiplayer start closes its panels only once it is in the match, so the menu battle stays paused
        const mp = await page.evaluate(() => {
            returnToMenu();
            const calls = [];
            for(const n of ['applyMenuBattleState', 'wodRestoreMenuTerrain']) { const f = window[n]; window[n] = function() { calls.push(n + ':' + gameState); return f.apply(this, arguments); }; }
            showPanel('multiplayer');
            // the guest's match start: the panels close as the match begins
            gameState = 'PLAYING'; hidePanels();
            const out = { calls, attract: !!gameData.menuAttractMode, menuLoop: !!menuDemoAnimId };
            gameState = 'MENU';
            return out;
        });
        assert.deepEqual(mp, { calls: [], attract: false, menuLoop: false }, 'closing the panels inside a match leaves the menu battle alone');
        const src = fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'js/multiplayer.js'), 'utf8');
        assert(!/hidePanels\(\);\s*\n\s*gameState = 'PLAYING';/.test(src), 'no multiplayer start closes its panels before it is in the match');
        assert.deepEqual(errors, []);
        console.log('draw recovery: a failed frame no longer spoils the next; multiplayer starts leave the menu battle paused');
    } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
