// Units sent to a spot a comrade already stands on (or is making for) settle beside it instead of going back and forth
// around it for good (js/movement.js wodDestinationTakenNearby). On open ground:
//   - pairs and threes of infantry and armour, sent to one point (the computer used to send a town's holders that way),
//     all stop within a few seconds, then stand still: none keeps walking in a small circle;
//   - one that stepped aside for a later arrival goes back near its place and stops there: it used to want its exact
//     former pixel and tried again every second for good, jiggling on the spot (wodReturnIdleTraffic);
//   - a group given separate places still reaches every one of them (no unit stops short of a free place).
// Usage: node scripts/verify-shared-destination.js
const H = require('./lib/harness');
const assert = require('assert/strict');
const server = H.createStaticServer();
(async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const browser = await H.launchBrowser(), page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), errors = [];
    page.on('pageerror', e => errors.push(e.stack));
    try {
        await page.goto('http://127.0.0.1:' + server.address().port + '/?autostart=1');
        await page.waitForFunction(() => window.__wodDebug?.().gameState === 'PLAYING' && gameData._matchReadyForEndChecks, null, { timeout: 180000 });
        await page.evaluate(() => { setGameSpeed(0, true); wodDismissChangelogPopup?.(); cancelAnimationFrame(animationFrameId); });
        const results = await page.evaluate(() => {
            const world = () => {
                WOD.makeBlankMap(24); gameState = 'PLAYING'; gameData.mp = { enabled: false }; gameData._campaignRun = null;
                gameData.entities = []; gameData.cities = []; gameData.forts = []; gameData.bridges = []; gameData.constructionJobs = [];
                gameData._wodPfCache = new Map(); gameData.aiTaskForces = {}; gameData.encircledHexes = new Set();
                for (const h of gameData.hexList) { h.owner = 1; h.type = 'grass'; h.cityId = null; }
                gameData._wodPfVer = (gameData._wodPfVer || 0) + 1;
            };
            const run = (units, seconds) => {
                const trail = new Map(units.map(u => [u, []]));
                for (let i = 0; i < seconds * 10; i++) {
                    gameData._aiEconomyClock = (gameData._aiEconomyClock || 0) + .1; gameData._wodSimTick = (gameData._wodSimTick || 0) + 1;
                    wodBeginSimPfBudget(units.length); gameData.unitSpatialGrid = buildUnitSpatialGrid(96); wodRebuildHexCombatOccupancy();
                    for (const u of units) moveUnitTowardTarget(u, .1);
                    gameData.unitSpatialGrid = buildUnitSpatialGrid(96); wodRunUnitSeparationSync(40, 96);
                    for (const u of units) trail.get(u).push([u.x, u.y]);
                }
                return trail;
            };
            const walked = (pts, from) => { let L = 0; for (let k = from + 1; k < pts.length; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); return L; };
            const out = [];
            const sp = (gameData.hexRadius || 20) * 1.35;
            for (const [label, types, owner] of [['two infantry', ['light', 'light'], 1], ['infantry and armour', ['light', 'heavy'], 1], ['three, computer', ['light', 'light', 'heavy'], 2]]) {
                world();
                const goal = gameData.hexes['3,0'], units = types.map((type, i) => {
                    const h = gameData.hexes[`${-6 - i},${(i % 2) * 2 - 1}`], u = createUnitAt(type, h.x, h.y, owner, { startSpawn: true });
                    return u;
                });
                // (the first is given its order first and gets there first; the others make for the very same point)
                for (const u of units) { wodBeginSimPfBudget(units.length); assignUnitMoveAlongWaypoints(u, [{ x: goal.x, y: goal.y }]); }
                const trail = run(units, 120);
                out.push({ label, stopped: units.every(u => !u.target && !u._trafficYield), lastSeconds: units.map(u => +(walked(trail.get(u), 1050) / sp).toFixed(2)), fromGoal: units.map(u => +(Math.hypot(u.x - goal.x, u.y - goal.y) / sp).toFixed(2)) });
            }
            // a group given separate places reaches each of them
            world();
            const group = [0, 1, 2, 3, 4, 5].map(i => { const h = gameData.hexes[`${-8 + (i % 3)},${Math.floor(i / 3) * 2 - 1}`]; return createUnitAt(i % 3 === 1 ? 'heavy' : 'light', h.x, h.y, 1, { startSpawn: true }); });
            const slots = wodGroupDestinationSlots(group, gameData.hexes['5,0']);
            for (const u of group) { wodBeginSimPfBudget(group.length); assignUnitMoveAlongWaypoints(u, [slots.get(u)]); }
            run(group, 120);
            out.push({ label: 'group to its places', stopped: group.every(u => !u.target), offSlot: group.map(u => +Math.hypot(u.x - slots.get(u).x, u.y - slots.get(u).y).toFixed(1)) });
            return out;
        });
        for (const r of results) console.log(JSON.stringify(r));
        for (const r of results.slice(0, 3)) {
            assert.ok(r.stopped, r.label + ': every unit stopped');
            assert.ok(r.lastSeconds.every(L => L < 0.25), r.label + ': and then stood still (cells walked in the last fifteen seconds: ' + r.lastSeconds + ')');
            assert.ok(r.fromGoal.every(d => d < 2.5), r.label + ': beside the spot (' + r.fromGoal + ' cells away)');
        }
        const g = results[3];
        assert.ok(g.stopped && g.offSlot.every(d => d < 6), 'a group given separate places reaches every one: ' + g.offSlot);
        assert.deepEqual(errors, []);
        console.log('verify-shared-destination: OK');
    } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
