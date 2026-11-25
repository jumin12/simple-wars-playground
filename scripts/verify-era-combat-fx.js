'use strict';
// Combat effects by era (js/world.js wodCombatFxStyle). In a paused skirmish, small fights are staged on open ground and
// open water in each era, and only their combat is stepped:
//   - modern units fire tracers, as before
//   - ancient and medieval foot lunge at each other and meet in the middle with a clash, then step back; horse,
//     chariots and knights charge harder; medieval rangers and the warships of both eras loose arrows, ancient
//     skirmishers throw javelins
//   - Napoleonic foot fires a volley every few seconds, with smoke that lingers and thins; chasseurs fire single shots;
//     ships of the line fire broadsides; horse regiments charge
//   - a lunge never leaves a unit drawn out of place, and frames draw cleanly
// Screenshots of each era's fights go to output/era-combat-fx.
// Usage: node scripts/verify-era-combat-fx.js
const assert = require('assert/strict');
const path = require('path');
const H = require('./lib/harness');
const OUT = H.outDir('era-combat-fx');

(async () => {
    const server = await H.startServer();
    const browser = await H.launchBrowser();
    try {
        const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
        const errors = H.collectErrors(page);
        await H.gotoAutostart(page, server.url);
        // ---- which effect each unit fires in each era
        const styles = await page.evaluate(() => {
            const out = {};
            for(const era of ['modern', 'ancient', 'medieval', 'napoleonic'])
                out[era] = Object.fromEntries(['light', 'marine', 'heavy', 'motorized', 'mountaineer', 'ship'].map(t => [t, wodCombatFxStyle({ type: t }, era)]));
            return out;
        });
        assert.deepEqual(styles.modern, { light: 'tracer', marine: 'tracer', heavy: 'tracer', motorized: 'tracer', mountaineer: 'tracer', ship: 'tracer' });
        assert.deepEqual(styles.ancient, { light: 'melee', marine: 'melee', heavy: 'charge', motorized: 'charge', mountaineer: 'javelins', ship: 'arrows' });
        assert.deepEqual(styles.medieval, { light: 'melee', marine: 'melee', heavy: 'charge', motorized: 'charge', mountaineer: 'arrows', ship: 'arrows' });
        assert.deepEqual(styles.napoleonic, { light: 'volley', marine: 'volley', heavy: 'charge', motorized: 'charge', mountaineer: 'skirmish', ship: 'broadside' });

        await page.evaluate(() => {
            setGameSpeed(0, true);
            window.checkCampaignEndConditions = () => {};
            gameData.fogOfWar = false;
            gameData.ownedUnitSkins = Object.assign({}, gameData.ownedUnitSkins, { ancient: true, medieval: true, napoleonic: true });
            const me = wodLocalPlayerOwner(), foe = gameData.entities.find(u => u.owner > 0 && wodIsHostileOwner(u.owner, me)).owner;
            // open ground and open water with nobody near
            const clear = (h, water) => getHexesInRadius(h.q, h.r, 4).every(c => { const x = wodHexAt(c.q, c.r); return x && (water ? isWaterHex(x) : isClaimableLand(x) && canUnitEnterHex({ type: 'light' }, x)); })
                && gameData.entities.every(u => Math.hypot(u.x - h.x, u.y - h.y) > 360);
            const land = gameData.hexList.find(h => clear(h, false)), sea = gameData.hexList.find(h => clear(h, true));
            const view = window.__view = (x, y) => { const z = gameData.camera.zoom = 2; gameData.camera.x = x * z - innerWidth / 2; gameData.camera.y = y * z - innerHeight / 2; };
            const make = (type, owner, x, y) => { const u = createUnitAt(type, x, y, owner); u.x = u._drawX = x; u.y = u._drawY = y; u.spawnFx = 0; u.target = null; u.path = null; u.hp = u.maxHp = 5000; return u; };
            window.__stage = (era, where) => {
                gameData._matchPeriod = gameData.gamePeriod = era;
                for(const u of window.__staged || []) { const i = gameData.entities.indexOf(u); if(i >= 0) gameData.entities.splice(i, 1); }
                wodCombatFxClear();
                let pairs;
                if(where === 'sea') {
                    if(!sea) return null;
                    pairs = [['ship', 'ship', sea.x, sea.y, 70]];
                    view(sea.x, sea.y);
                } else {
                    // (rows 95 apart: each unit's nearest enemy is the one across from it)
                    pairs = [['light', 'light', land.x, land.y - 95, 44], ['heavy', 'light', land.x, land.y, 56], ['mountaineer', 'light', land.x, land.y + 95, 46]];
                    view(land.x, land.y);
                }
                window.__staged = [];
                const rows = pairs.map(([ta, tb, x, y, gap]) => { const a = make(ta, me, x - gap / 2, y), b = make(tb, foe, x + gap / 2, y); window.__staged.push(a, b); return { a, b }; });
                return rows.map(r => ({ a: r.a.uid, b: r.b.uid }));
            };
            // step only the staged units' fighting (and the effects), the way the combat step does each frame
            window.__fight = (seconds, dt = 1 / 30, each) => {
                const steps = Math.round(seconds / dt);
                for(let s = 0; s < steps; s++) {
                    gameData._wodSimTick = (gameData._wodSimTick | 0) + 1;
                    gameData._combatShotBudget = WOD_COMBAT_SHOTS_PER_FRAME;
                    gameData.unitSpatialGrid = buildUnitSpatialGrid();
                    wodRefreshCombatCamBounds();
                    for(const u of window.__staged) { u.target = null; wodStepUnitCombat(u, dt); }
                    wodUpdateCombatFx(dt);
                    if(each) each(s * dt);
                }
            };
            window.__kinds = () => {
                const out = {};
                for(const f of gameData._combatFx || []) { const k = f.kind === 'volley' ? f.style : f.kind === 'arrows' ? (f.javelin ? 'javelins' : 'arrows') : f.kind === 'bump' ? (f.knock ? 'knock' : f.charge ? 'charge' : 'bump') : f.kind; out[k] = (out[k] || 0) + 1; }
                return out;
            };
        });

        const shots = [];
        const snap = async (name, seconds) => {
            if(seconds) await page.evaluate(s => window.__fight(s), seconds);
            await page.evaluate(() => window.draw());
            const file = path.join(OUT, name + '.png');
            await page.screenshot({ path: file });
            shots.push(file);
        };

        // ---- a land fight in each era: what is fired, and the units' lunges
        const land = {};
        for(const era of ['modern', 'ancient', 'medieval', 'napoleonic']) {
            const rows = await page.evaluate(e => window.__stage(e, 'land'), era);
            assert.ok(rows, 'found open ground to stage the fights');
            land[era] = await page.evaluate(rows => {
                const byUid = uid => gameData.entities.find(u => u.uid === uid);
                const melee = { a: byUid(rows[0].a), b: byUid(rows[0].b) }, horse = byUid(rows[1].a), struck = byUid(rows[1].b);
                const seen = {}, out = { firstAt: {}, closest: Infinity, standing: 0, maxLunge: 0, horseLunge: 0, knocked: 0, volleys: 0, meetBoth: false };
                const gap0 = Math.hypot(melee.a.x - melee.b.x, melee.a.y - melee.b.y);
                const drawnGap = () => {
                    const oa = wodCombatBumpOffset(melee.a), ax = melee.a.x + (oa ? oa.x : 0), ay = melee.a.y + (oa ? oa.y : 0);
                    const ob = wodCombatBumpOffset(melee.b), bx = melee.b.x + (ob ? ob.x : 0), by = melee.b.y + (ob ? ob.y : 0);
                    return Math.hypot(ax - bx, ay - by);
                };
                let lastVolley = null;
                window.__fight(7, 1 / 30, t => {
                    for(const [k, n] of Object.entries(window.__kinds())) { seen[k] = Math.max(seen[k] || 0, n); if(out.firstAt[k] == null) out.firstAt[k] = +t.toFixed(2); }
                    out.closest = Math.min(out.closest, drawnGap());
                    const oa = wodCombatBumpOffset(melee.a), oh = wodCombatBumpOffset(horse);
                    if(oa) out.maxLunge = Math.max(out.maxLunge, Math.hypot(oa.x, oa.y));
                    if(oh) out.horseLunge = Math.max(out.horseLunge, Math.hypot(oh.x, oh.y));
                    const ok = wodCombatBumpOffset(struck);
                    if(ok) out.knocked = Math.max(out.knocked, Math.hypot(ok.x, ok.y));
                    if(wodCombatBumpOffset(melee.a) && wodCombatBumpOffset(melee.b)) out.meetBoth = true;
                    // the line's volleys: count new ones fired by the first musket line
                    const v = (gameData._combatFx || []).filter(f => f.kind === 'volley' && f.style === 'volley' && Math.abs(f.x0 - melee.a.x) < 20 && Math.abs(f.y0 - melee.a.y) < 20);
                    for(const f of v) if(f !== lastVolley && f.life > f.maxLife - 0.05) { out.volleys++; lastVolley = f; }
                });
                out.seen = seen;
                out.gap0 = +gap0.toFixed(1);
                out.closest = +out.closest.toFixed(1);
                out.maxLunge = +out.maxLunge.toFixed(1);
                out.horseLunge = +out.horseLunge.toFixed(1);
                out.knocked = +out.knocked.toFixed(1);
                // once every lunge is over, every unit is drawn where it stands
                window.__fight(1.2, 1 / 30);
                for(const u of window.__staged) u.damage = 0;
                window.__fight(1.6, 1 / 30);
                out.standing = window.__staged.filter(u => wodCombatBumpOffset(u)).length;
                for(const u of window.__staged) u.damage = 8;
                return out;
            }, rows);
            // the screenshots: restaged, a moment into the fight, and a moment later
            await page.evaluate(e => window.__stage(e, 'land'), era);
            await snap(era + '-land-a', 1.15);
            await snap(era + '-land-b', 0.25);
            await snap(era + '-land-c', 0.6);
        }
        const L = land;
        assert.ok(L.modern.seen.tracer > 0 && !L.modern.seen.bump && !L.modern.seen.volley && !L.modern.seen.arrows, 'modern units fire tracers only: ' + JSON.stringify(L.modern.seen));
        for(const era of ['ancient', 'medieval']) {
            const r = L[era];
            assert.ok(r.seen.bump > 0 && !r.seen.tracer, era + ': foot fight hand to hand, no tracers: ' + JSON.stringify(r.seen));
            assert.ok(r.seen.charge > 0, era + ': horse and chariots or knights charge: ' + JSON.stringify(r.seen));
            assert.ok(r.meetBoth, era + ': two units fighting each other lunge together');
            // (two foot units drawn about 32 wide: from 44 apart, they close to under 28 and strike into each other)
            assert.ok(r.closest < 28, era + ': they meet in the middle: ' + r.closest + ' apart, from ' + r.gap0);
            assert.ok(r.maxLunge > 6 && r.maxLunge < 20, era + ': each lunges about half the way: ' + r.maxLunge);
            assert.ok(r.knocked > 0 && r.knocked < 9, era + ': a unit struck by a charge it is not fighting back is knocked back a little: ' + r.knocked);
            assert.ok(r.horseLunge > r.maxLunge, era + ': a charge goes further: ' + r.horseLunge + ' vs ' + r.maxLunge);
            assert.equal(r.standing, 0, era + ': after the fight every unit is drawn where it stands');
            assert.ok(r.firstAt.bump != null && r.firstAt.bump < 1.2, era + ': the first clash comes within about a second: ' + r.firstAt.bump);
        }
        assert.ok(L.ancient.seen.javelins > 0 && !L.ancient.seen.arrows, 'ancient skirmishers throw javelins: ' + JSON.stringify(L.ancient.seen));
        assert.ok(L.medieval.seen.arrows > 0 && !L.medieval.seen.javelins, 'medieval rangers loose arrows: ' + JSON.stringify(L.medieval.seen));
        const N = L.napoleonic;
        assert.ok(N.seen.volley > 0 && N.seen.skirmish > 0 && N.seen.charge > 0 && !N.seen.tracer && !N.seen.bump, 'napoleonic: line volleys, chasseurs\' single shots, horse charges: ' + JSON.stringify(N.seen));
        assert.ok(N.volleys >= 2 && N.volleys <= 3, 'a musket line volleys every few seconds (7 s): ' + N.volleys);
        assert.ok(N.firstAt.volley < 1.2, 'the first volley comes within about a second: ' + N.firstAt.volley);
        assert.equal(N.standing, 0, 'napoleonic: every unit drawn where it stands after the fight');
        // the smoke lingers well after the volley's flash
        const smoke = await page.evaluate(() => { window.__stage('napoleonic', 'land'); window.__fight(1.2); const f = (gameData._combatFx || []).find(x => x.kind === 'volley' && x.style === 'volley'); return f ? f.maxLife : 0; });
        assert.ok(smoke > 2.4, 'volley smoke lasts a few seconds: ' + smoke);

        // ---- the fighting icon above units: crossed swords before the Napoleonic era, the burst of fire from it on
        const icons = await page.evaluate(() => {
            const out = {}, swords = window.drawCrossedSwordsIcon, burst = window.drawCombatBurstIcon;
            for(const era of ['modern', 'ancient', 'medieval', 'napoleonic']) {
                window.__stage(era, 'land');
                window.__fight(1.2);
                const n = { swords: 0, burst: 0 };
                window.drawCrossedSwordsIcon = (...a) => { n.swords++; return swords(...a); };
                window.drawCombatBurstIcon = (...a) => { n.burst++; return burst(...a); };
                try { window.draw(); } finally { window.drawCrossedSwordsIcon = swords; window.drawCombatBurstIcon = burst; }
                out[era] = n;
            }
            return out;
        });
        for(const era of ['ancient', 'medieval']) assert.ok(icons[era].swords >= 6 && icons[era].burst === 0, era + ': units fighting show crossed swords: ' + JSON.stringify(icons[era]));
        for(const era of ['modern', 'napoleonic']) assert.ok(icons[era].burst >= 6 && icons[era].swords === 0, era + ': units fighting show the burst: ' + JSON.stringify(icons[era]));
        await page.evaluate(() => { window.__stage('medieval', 'land'); window.__fight(1.2); const s = window.__staged[0]; const z = gameData.camera.zoom = 5; gameData.camera.x = s.x * z - innerWidth / 2 + 60; gameData.camera.y = s.y * z - innerHeight / 2; });
        await snap('medieval-icons-close', 0);

        // ---- warships
        const sea = {};
        for(const era of ['modern', 'ancient', 'medieval', 'napoleonic']) {
            const rows = await page.evaluate(e => window.__stage(e, 'sea'), era);
            if(!rows) { sea[era] = 'no open water'; continue; }
            sea[era] = await page.evaluate(() => { const seen = {}; window.__fight(5, 1 / 30, () => { for(const [k, n] of Object.entries(window.__kinds())) seen[k] = Math.max(seen[k] || 0, n); }); return seen; });
            await page.evaluate(e => window.__stage(e, 'sea'), era);
            await snap(era + '-sea', era === 'napoleonic' ? 1.2 : 1.0);
        }
        if(sea.modern !== 'no open water') {
            assert.ok(sea.modern.tracer > 0, 'modern ships fire tracers: ' + JSON.stringify(sea.modern));
            assert.ok(sea.ancient.arrows > 0 && !sea.ancient.tracer, 'triremes loose arrows: ' + JSON.stringify(sea.ancient));
            assert.ok(sea.medieval.arrows > 0 && !sea.medieval.tracer, 'galleys loose arrows: ' + JSON.stringify(sea.medieval));
            assert.ok(sea.napoleonic.broadside > 0 && !sea.napoleonic.tracer, 'ships of the line fire broadsides: ' + JSON.stringify(sea.napoleonic));
        }

        assert.deepEqual(errors.pageErrors, [], 'no page errors');
        console.log(JSON.stringify({ land, sea }));
        console.log('screenshots: ' + OUT);
        console.log('verify-era-combat-fx: OK');
    } finally { await browser.close(); await server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
