'use strict';
// Two enemy landing craft (transports carry no guns) sailing straight at each other must get past one another and reach
// where they were sent. They used to stop bow to bow and stay there for good: a unit next to an enemy does not steer
// round anything (so as not to slip out of a fight), and an unarmed boat has no fight to stay in.
const H = require('./lib/harness');
const assert = require('assert/strict');
const server = H.createStaticServer();
(async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const browser = await H.launchBrowser();
    try {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await context.routeWebSocket(/.*/, s => { s.onMessage(() => {}); s.send(JSON.stringify({ t: 'welcome', online: 1, lobbies: [] })); });
        const page = await context.newPage();
        const errors = H.collectErrors(page);
        await H.gotoMenu(page, 'http://127.0.0.1:' + server.address().port);
        await page.evaluate(() => { try { wodDismissChangelogPopup(); } catch(e) {} showPanel('setup');
            const el = document.getElementById('setupMapShape'); el.value = 'archipelago'; el.dispatchEvent(new Event('change')); });
        await page.waitForTimeout(300);
        await page.waitForFunction(() => !wodIsMapPreviewGenerating(), null, { timeout: 180000 });
        await page.evaluate(() => startGame('ai'));
        await H.waitForMatch(page);
        const cases = [{ name: 'head on', lateral: 0, types: ['transport', 'transport'] }, { name: 'offset by a cell', lateral: 1, types: ['transport', 'transport'] },
            { name: 'transport and supply ship', lateral: 0, types: ['transport', 'supply'] }];
        for(const c of cases) {
            const r = await page.evaluate(({ lateral, types }) => {
                setGameSpeed(0, true);
                const open = h => h && wodIsOpenWaterHex(h) && !isBridgeHex(h);
                const used = window.__boatLines || (window.__boatLines = []);
                let best = null;
                for(const h of gameData.hexList) {
                    if(!open(h) || used.some(u => Math.abs(u.q - h.q) < 16 && Math.abs(u.r - h.r) < 6)) continue;
                    let ok = true;
                    for(let k = -7; k <= 7 && ok; k++) for(let w = -2; w <= 2 && ok; w++) ok = open(wodHexAt(h.q + k, h.r + w));
                    if(ok && !gameData.entities.some(u => u.hp > 0 && Math.hypot(u.x - h.x, u.y - h.y) < gameData.hexRadius * 12)) { best = h; break; }
                }
                if(!best) return { skip: 'no clear line of open water' };
                used.push(best);
                // the player's boat against one of a faction whose AI is switched off, so nothing but the two orders moves them
                wodAiSetSuspended(6, true); gameData.money = 1e7;
                const A = wodHexAt(best.q - 5, best.r), B = wodHexAt(best.q + 5, best.r + lateral);
                const a = createUnitAt(types[0], A.x, A.y, 1), b = createUnitAt(types[1], B.x, B.y, 6);
                a.x = A.x; a.y = A.y; b.x = B.x; b.y = B.y;
                const GA = wodHexAt(best.q + 6, best.r + lateral), GB = wodHexAt(best.q - 6, best.r);
                const ok = assignUnitMoveAlongWaypoints(a, [{ x: GA.x, y: GA.y }]) && assignUnitMoveAlongWaypoints(b, [{ x: GB.x, y: GB.y }]);
                const sp = gameData.hexRadius * 1.35, rr = (a.radius || 16) + (b.radius || 16);
                let met = false, arrived = false, t = 0;
                for(; t < 60; t += 0.1) {
                    update(0.1);
                    if(Math.hypot(a.x - b.x, a.y - b.y) < rr + 8) met = true;
                    if(Math.hypot(a.x - GA.x, a.y - GA.y) < sp * .6 && Math.hypot(b.x - GB.x, b.y - GB.y) < sp * .6) { arrived = true; break; }
                }
                const out = { ok, met, arrived, seconds: Math.round(t), a: +(Math.hypot(a.x - GA.x, a.y - GA.y) / sp).toFixed(2), b: +(Math.hypot(b.x - GB.x, b.y - GB.y) / sp).toFixed(2) };
                a.hp = 0; b.hp = 0; update(0.1);
                return out;
            }, { lateral: c.lateral, types: c.types });
            if(r.skip) { console.log(c.name + ': skipped (' + r.skip + ')'); continue; }
            assert(r.ok, c.name + ': both boats took their orders');
            assert(r.met, c.name + ': the boats came bow to bow on the way (' + JSON.stringify(r) + ')');
            assert(r.arrived, c.name + ': both boats got past each other and arrived, ' + JSON.stringify(r));
            console.log(c.name + ': both arrived after ' + r.seconds + ' s');
        }
        errors.assertNone();
        console.log('boats: enemy landing craft meeting on the water sail past each other');
    } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
