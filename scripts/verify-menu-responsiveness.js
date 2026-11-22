'use strict';
// The main menu answers presses quickly, and the battle behind it still comes back exactly as it was left.
//  - No full-screen blur over the moving menu battle (it had to be redone every frame: the menu ran at ~20 fps).
//  - A press does not copy the battle's terrain canvases (four map-sized images, ~20 ms) before its panel shows: the
//    copy is only marked due, and made later (before anything paints terrain again, or in idle time).
//  - Changelog entries out of view skip layout (laying out all ~1,500 changelog elements cost ~20 ms per return).
//  - Menu buttons show a pressed state at once.
//  - After a plain panel, after the skirmish setup preview (which replaces the map), and after a whole match, the
//    battle's terrain is exactly the picture it was paused with at the moment it is back (before its first new frame).
const H = require('./lib/harness');
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'output/menu-responsiveness');
fs.mkdirSync(OUT, { recursive: true });
const server = H.createStaticServer();
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await H.launchBrowser(), context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(), errors = [], results = {};
    page.on('pageerror', e => errors.push(e.stack));
    page.on('console', m => { if(m.type() === 'error' && !/net::ERR/.test(m.text())) errors.push(m.text()); });
    await context.route('**/*', route => /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(route.request().url()) ? route.fallback() : route.abort());
    await context.routeWebSocket(/.*/, socket => { socket.onMessage(() => {}); socket.send(JSON.stringify({ t: 'welcome', online: 0, lobbies: [] })); });
    try {
        await page.goto('http://127.0.0.1:' + server.address().port + '/');
        await page.waitForFunction(() => typeof showPanel === 'function' && !window._wodBootBusy && !window._wodMenuBootstrapBusy && gameState === 'MENU' && gameData.menuAttractMode && !UI.mainMenu.classList.contains('hidden'), null, { timeout: 180000 });
        await page.evaluate(() => { try { wodDismissChangelogPopup(); } catch(e) {} });
        await page.waitForTimeout(2000);

        // 1. styles: no blur over the battle, off-screen changelog entries skip layout, buttons show a press
        results.styles = await page.evaluate(() => {
            const menu = getComputedStyle(UI.mainMenu), entry = document.querySelector('#wodChangelogList .wod-changelog-entry');
            const sheetHasActive = [...document.styleSheets].some(s => { try { return [...s.cssRules].some(r => /\.menu-btn:active/.test(r.selectorText || '')); } catch(e) { return false; } });
            return { blur: menu.backdropFilter || menu.webkitBackdropFilter || 'none', entryVisibility: entry && getComputedStyle(entry).contentVisibility, pressedState: sheetHasActive };
        });
        assert.equal(results.styles.blur, 'none', 'no backdrop blur over the menu battle');
        assert.equal(results.styles.entryVisibility, 'auto', 'changelog entries out of view skip layout');
        assert(results.styles.pressedState, 'menu buttons have a pressed state');

        // watch the battle's canvases: their pixels at the capturing pause, and again when the battle is back (the
        // first draw of a resume, before it paints anything new)
        await page.evaluate(() => {
            const grab = c => { if(!c || c.width < 2) return null; const s = document.createElement('canvas'); s.width = c.width; s.height = c.height; const x = s.getContext('2d', { willReadFrequently: true }); x.drawImage(c, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let h1 = 2166136261, h2 = 0; for(let i = 0; i < d.length; i++) { h1 = Math.imul(h1 ^ d[i], 16777619); h2 = (h2 * 31 + d[i]) | 0; } return c.width + 'x' + c.height + ':' + (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16); };
            const grabAll = () => ({ composite: grab(terrainCanvas), base: grab(terrainBaseCanvas), borders: grab(wodBorderLayerCanvas), bounds: JSON.stringify(terrainBounds) });
            const diff = (a, b) => a === b ? 0 : (a || 'none') + ' became ' + (b || 'none');
            window.__menuCheck = { paused: null, back: null, pauseMs: [], dueAfterPress: [] };
            const pause = pauseMenuBackgroundBattle, resume = resumeMenuBackgroundBattle, drawFn = draw;
            window.pauseMenuBackgroundBattle = function() {
                const capturing = gameData.menuAttractMode && menuDemoSeeded;
                if(capturing) window.__menuCheck.paused = grabAll();
                const a = performance.now(); const out = pause.apply(this, arguments);
                if(capturing) { window.__menuCheck.pauseMs.push(performance.now() - a); window.__menuCheck.dueAfterPress.push({ due: wodMenuTerrainCopyDue, copy: !!menuTerrainSnap }); }
                return out;
            };
            let resuming = false;
            window.resumeMenuBackgroundBattle = function() { resuming = true; try { return resume.apply(this, arguments); } finally { resuming = false; } };
            window.draw = function() { if(resuming && window.__menuCheck.paused && !window.__menuCheck.back) window.__menuCheck.back = grabAll(); return drawFn.apply(this, arguments); };
            window.__menuCheckResult = () => { const c = window.__menuCheck, p = c.paused, b = c.back; const r = { back: !!b, composite: b && diff(p.composite, b.composite), base: b && diff(p.base, b.base), borders: b && diff(p.borders, b.borders), bounds: b && p.bounds === b.bounds, due: wodMenuTerrainCopyDue }; c.paused = c.back = null; return r; };
        });
        const same = async label => {
            await page.waitForFunction(() => window.__menuCheck.back, null, { timeout: 120000 });
            const r = await page.evaluate(() => window.__menuCheckResult());
            (results.restored = results.restored || {})[label] = r;
            assert.deepEqual({ composite: r.composite, base: r.base, borders: r.borders, bounds: r.bounds, due: r.due }, { composite: 0, base: 0, borders: 0, bounds: true, due: false }, label + ': the menu battle came back exactly as it was paused');
            await page.waitForTimeout(600);
        };
        const menuButton = name => page.locator('#mainMenu').getByRole('button', { name, exact: true });

        // 2. plain panels: straight back (the copy is dropped), and back after an idle moment (the copy was made)
        await menuButton('Credits').click(); await page.evaluate(() => hidePanels()); await same('credits, straight back');
        await menuButton('Settings').click(); await page.waitForTimeout(2500); await page.evaluate(() => hidePanels()); await same('settings, back after a while');
        // 3. the skirmish setup: its preview replaces the map
        await menuButton('Play vs AI').click();
        await page.getByRole('button', { name: 'Skirmish', exact: true }).click();
        await page.waitForFunction(() => !wodIsMapPreviewGenerating(), null, { timeout: 120000 });
        results.previewReplacedMap = await page.evaluate(() => gameData.hexList !== menuBattleHexListRef);
        assert(results.previewReplacedMap, 'the setup preview has its own map');
        await page.evaluate(() => hidePanels()); await same('skirmish setup preview');
        // 4. a whole match, then back to the menu
        await menuButton('Play vs AI').click();
        await page.getByRole('button', { name: 'Skirmish', exact: true }).click();
        await page.waitForFunction(() => !wodIsMapPreviewGenerating(), null, { timeout: 120000 });
        await page.locator('#setupBtnStartAi').click();
        await page.waitForFunction(() => gameState === 'PLAYING' && gameData._matchReadyForEndChecks, null, { timeout: 120000 });
        await page.waitForTimeout(2000);
        await page.evaluate(() => returnToMenu());
        await page.waitForFunction(() => gameState === 'MENU' && gameData.menuAttractMode, null, { timeout: 120000 });
        await same('skirmish match and back');

        // 5. each press only marked the copy as due; none made it inside the press
        results.presses = await page.evaluate(() => ({ dueAfterPress: window.__menuCheck.dueAfterPress, pauseMs: window.__menuCheck.pauseMs.map(x => +x.toFixed(1)) }));
        assert(results.presses.dueAfterPress.length >= 4, 'each capturing press was seen');
        for(const p of results.presses.dueAfterPress) assert.deepEqual(p, { due: true, copy: false }, 'a press leaves the terrain copy for later');
        // 6. the battle runs on
        await page.waitForTimeout(1200);
        results.running = await page.evaluate(() => ({ attract: gameData.menuAttractMode, anim: !!menuDemoAnimId, canvas: UI.canvas.style.display }));
        assert.deepEqual(results.running, { attract: true, anim: true, canvas: 'block' }, 'the menu battle runs after coming back');
        assert.deepEqual(errors, [], 'no page errors');
        results.passed = true;
        console.log('menu responsiveness passed: ' + Object.keys(results.restored).join(', ') + ' came back unchanged; press pause ' + results.presses.pauseMs.join('/') + ' ms');
    } finally {
        fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
        await browser.close(); server.close();
    }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
