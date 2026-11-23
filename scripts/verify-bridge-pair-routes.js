'use strict';
// Two bridges landing a few cells apart on one island. A unit crossing one of them to a place on that island must not be
// routed over to the other bridge's end and back. A bridge deck is linked to land up to five cells off (so a slanted
// deck always meets its bank); the bridge planner and the fallback search counted such a link as one step, so a nearby
// bridge's links became a shortcut over the water and the route went to the other bridge first.
// The bridge planner (wodFindBestBridgePath) and the fallback search (wodLandBfsPath with bridge links) stay off the
// second bridge for the player's infantry and a computer soldier; neither order's route steps onto it, and the player's
// unit is walked there and never goes near it.
const H = require('./lib/harness');
const assert = require('assert/strict');
const server = H.createStaticServer({});
(async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const browser = await H.launchBrowser();
    try {
        const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
        const errors = []; page.on('pageerror', e => errors.push(e.stack));
        await page.goto('http://127.0.0.1:' + server.address().port + '/?autostart=1');
        await page.waitForFunction(() => typeof gameData !== 'undefined' && gameState === 'PLAYING' && gameData._matchReadyForEndChecks, null, { timeout: 120000 });
        const out = await page.evaluate(() => {
            setGameSpeed(0, true); cancelAnimationFrame(animationFrameId); wodDismissChangelogPopup(); updateAiStrategy = () => {};
            const h = (q, r) => gameData.hexes[q + ',' + r];
            wodPrepareForNewMatch({ keepLiveMap: true }); WOD.makeBlankMap(30); gameState = 'PLAYING'; gameData.mp = { enabled: false }; gameData.menuAttractMode = false;
            gameData.entities = []; gameData.cities = []; gameData.forts = []; gameData.hospitals = []; gameData.bridges = []; gameData.constructionJobs = []; gameData.money = 1e6; gameData._aiEconomyClock = 0;
            // north island; a forest island south of it with a sand spit at its top; a west island
            const land = (q, r) => (q >= 7 && q <= 16 && r >= -14 && r <= -6) || (q >= 1 && q <= 11 && r >= 1 && r <= 16) || (q >= 3 && q <= 4 && r >= -1 && r <= 0) || (q >= -14 && q <= -3 && r >= -8 && r <= 4);
            for(const p of gameData.hexList) { p.type = !land(p.q, p.r) ? 'water' : p.r >= 12 ? 'grass' : p.q >= 1 && p.r >= 1 ? 'forest' : p.q >= 3 && p.q <= 4 && p.r <= 0 && p.r >= -1 ? 'sand' : 'grass'; p.owner = 1; p.cityId = null; }
            gameData._wodPfVer = (gameData._wodPfVer || 0) + 1; wodRebuildBridgeHexIndex();
            // bridge A: north island to the spit; bridge B: west island to the forest island's west coast, three cells off
            const builtA = placeBridgeSpan(1, 7, -6, 4, -1, { editor: true, suppressNotes: true }), builtB = placeBridgeSpan(1, -3, 0, 1, 3, { editor: true, suppressNotes: true });
            const B = gameData.bridges[1];
            const onB = path => (path || []).filter(c => c && isBridgeHex(c) && bridgeAtHex(c)?.id === B.id).length;
            const len = path => { let n = 0; for(let i = 1; i < (path || []).length; i++) n += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y); return n / (gameData.hexRadius * 1.35); };
            const res = { builtA, builtB, cases: [] };
            for(const [owner, goalQ] of [[1, 6], [1, 3], [2, 6], [2, 3]]) {
                const from = h(11, -10), goal = h(goalQ, 14);
                const u = createUnitAt('light', from.x, from.y, owner, { startSpawn: true }); u.x = u._drawX = from.x; u.y = u._drawY = from.y; u.isGeneral = false;
                gameData.unitSpatialGrid = buildUnitSpatialGrid(); gameData._wodPfCache?.clear();
                const start = getNearestWalkableHexForUnit(u, u.x, u.y);
                const compose = wodFindBestBridgePath(u, start, goal), bfs = wodLandBfsPath(u, start, goal, 26000, true);
                assignUnitMoveAlongWaypoints(u, [goal]);
                const order = [u.target, ...(u.path || [])].filter(Boolean).map(t => getNearestHexToPoint(t.x, t.y));
                let near = 99;
                const bEnd = h(1, 3);
                for(let t = 0; t < 140 && Math.hypot(u.x - goal.x, u.y - goal.y) > 8; t += .05) {
                    gameData._aiEconomyClock += .05; gameData.unitSpatialGrid = buildUnitSpatialGrid(); wodBeginSimPfBudget(4); moveUnitTowardTarget(u, .05);
                    near = Math.min(near, Math.hypot(u.x - bEnd.x, u.y - bEnd.y) / (gameData.hexRadius * 1.35));
                }
                res.cases.push({ owner, goal: goalQ + ',14', composeOnB: onB(compose), bfsOnB: onB(bfs), orderOnB: onB(order), composeLen: +len(compose).toFixed(1), bfsLen: +len(bfs).toFixed(1),
                    straight: +(Math.hypot(goal.x - from.x, goal.y - from.y) / (gameData.hexRadius * 1.35)).toFixed(1), arrived: Math.hypot(u.x - goal.x, u.y - goal.y) <= 8, nearestToB: +near.toFixed(1) });
                gameData.entities = gameData.entities.filter(e => e !== u);
            }
            return res;
        });
        console.log(JSON.stringify(out));
        assert(out.builtA && out.builtB, 'both bridges are built');
        for(const c of out.cases) {
            const tag = (c.owner === 1 ? 'player' : 'computer') + ' to ' + c.goal + ': ';
            assert.equal(c.composeOnB, 0, tag + 'the bridge planner stays off the other bridge ' + JSON.stringify(c));
            assert.equal(c.bfsOnB, 0, tag + 'the fallback search stays off the other bridge ' + JSON.stringify(c));
            assert(c.bfsLen <= c.straight * 1.2, tag + 'the fallback route is about as long as the walk needs ' + JSON.stringify(c));
            assert.equal(c.orderOnB, 0, tag + "the order's route stays off the other bridge's deck " + JSON.stringify(c));
            // (the computer's own search prices forest at half a step extra and deck steps at almost nothing, so its troops
            // may still walk past the other bridge's landing to save forest cells; the player's are priced by distance)
            if(c.owner === 1) assert(c.arrived && c.nearestToB > 2, tag + 'the unit walks there without going over to the other bridge ' + JSON.stringify(c));
            else assert(c.arrived, tag + 'the unit gets there ' + JSON.stringify(c));
        }
        assert.equal(errors.length, 0, errors.join('\n'));
        console.log('bridge pairs: routes across one bridge no longer go over to a nearby bridge\'s end');
    } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
