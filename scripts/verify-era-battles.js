'use strict';
// The shop's era battles (scripts/era-battles.js, custom-maps/): four battles in every older era, sold only to a player
// who owns that era's army as well as the gold, listed in the shop by era with the modern era first.
//   - every older era has attacks and defences (and a fleet action at Salamis and Trafalgar), marked with its era; the
//     catalog and the server's copy know it
//   - the profile server and the Steam store refuse an era mission without the era's army (no gold taken) and sell
//     it with the army or the Supporter Pack (the Steam side is in verify-steam-commerce)
//   - Shop → Missions: one section per era, modern first; an era whose army you lack says so, its missions are marked
//     and refused, and "Get the army" opens that army in Troop skins; once the army is bought, the mission sells
//   - each battle loads in its era with its era's troops: the whole authored army (named units, cavalry, skirmishers
//     or archers, heavy troops), the era's unit art, its objective; in the attacks the defenders raise manpower at a
//     quarter of the usual rate; a minute of each battle plays without errors
//   - the four standalone modern missions are rebuilt the same way: their full named armies, objectives and limits
// Usage: node scripts/verify-era-battles.js
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const H = require('./lib/harness');
const ROOT = path.resolve(__dirname, '..'), OUT = H.outDir('era-battles');
const catalog = require('../store-catalog');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'custom-maps/manifest.json'), 'utf8'));
const serverCatalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/mission-catalog.json'), 'utf8'));
const BATTLES = {
    ancient: [{ id: 'gaugamela-331', objective: 'capture' }, { id: 'thermopylae-480', objective: 'hold', named: 'Spartan hoplites I' },
        { id: 'salamis-480', objective: 'fleet', named: "Themistocles' flagship" }, { id: 'cannae-216', objective: 'hold', named: 'Libyan infantry I' }],
    medieval: [{ id: 'hastings-1066', objective: 'capture' }, { id: 'agincourt-1415', objective: 'hold', named: 'English longbowmen I' },
        { id: 'stirling-bridge-1297', objective: 'capture', named: "Wallace's spearmen I" }, { id: 'hattin-1187', objective: 'hold', named: 'Ayyubid archers I' }],
    napoleonic: [{ id: 'austerlitz-1805', objective: 'capture' }, { id: 'waterloo-1815', objective: 'hold', named: 'British line I' },
        { id: 'borodino-1812', objective: 'capture', named: 'Voltigeurs I' }, { id: 'trafalgar-1805', objective: 'fleet', named: 'HMS Victory' }]
};
// the standalone modern missions, rebuilt the same way (scripts/modern-battles.js)
const MODERN = [
    { id: 'normandy-dday', objective: 'capture', named: '1st Infantry Division', levy: .25 },
    { id: 'kursk-citadel', objective: 'hold', named: 'Kursk garrison', levy: null },
    { id: 'midway-1942', objective: 'fleet', named: 'Enterprise task group', levy: null },
    { id: 'el-alamein-1942', objective: 'capture', named: '9th Australian Division', levy: .25 },
    { id: 'stalingrad-1942', objective: 'hold', named: '284th Rifle Division', levy: null },
    { id: 'bastogne-1944', objective: 'capture', named: '501st Parachute Infantry', levy: .25 }
];
const CASES = [
    ...Object.entries(BATTLES).flatMap(([era, list]) => list.map(b => ({ id: b.id, era, objective: b.objective, named: b.named || null, levy: b.objective === 'capture' ? .25 : null, art: true }))),
    ...MODERN.map(m => ({ ...m, era: 'modern', art: false }))
];

// ---- the catalog
for(const [era, list] of Object.entries(BATTLES)) for(const { id } of list) {
    const entry = manifest.missions.find(m => m.id === id);
    assert.equal(entry?.gamePeriod, era, id + ' is a ' + era + ' battle');
    assert.equal(catalog.shopItems({ kind: 'map', itemId: 'shop_map_' + id }, manifest)[0].requiresSkin, era, id + ' needs the ' + era + ' army');
    assert.equal(serverCatalog.missions.find(m => m.id === id)?.gamePeriod, era, 'the server catalog knows ' + id + '\'s era');
}
assert.equal(catalog.shopItems({ kind: 'map', itemId: 'shop_map_normandy-dday' }, manifest)[0].requiresSkin, null, 'a modern mission needs gold only');

// ---- the profile server (server/profiles.js, as the relay runs it)
{
    const mod = { exports: {} }, sandbox = { module: mod, exports: mod.exports, require: require('module').createRequire(path.join(ROOT, 'server/profiles.js')), console, __dirname: path.join(ROOT, 'server'), setTimeout: () => 1, clearTimeout: () => {} };
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'server/profiles.js'), 'utf8'), sandbox);
    const profiles = mod.exports, id = 'WOD-ERAS-TEST', p = profiles.getProfile(id);
    p.profile.gold = 5000; p.profile.ownedUnitSkins = { nato: true }; p.profile.supporterPack = false;
    const refused = profiles.shopPurchase(id, { kind: 'map', itemId: 'shop_map_hastings-1066' });
    assert.ok(!refused.ok && /Medieval army/.test(refused.msg), 'refused without the Medieval army: ' + JSON.stringify(refused.msg));
    assert.equal(p.profile.gold, 5000, 'no gold taken');
    assert.ok(profiles.shopPurchase(id, { kind: 'map', itemId: 'shop_map_normandy-dday' }).ok, 'a modern mission sells for gold alone');
    p.profile.ownedUnitSkins.medieval = true;
    assert.ok(profiles.shopPurchase(id, { kind: 'map', itemId: 'shop_map_hastings-1066' }).ok, 'sold with the Medieval army');
    assert.equal(p.profile.gold, 5000 - 1000 - 750);
    p.profile.supporterPack = true;
    assert.ok(profiles.shopPurchase(id, { kind: 'map', itemId: 'shop_map_waterloo-1815' }).ok, 'the Supporter Pack includes every era');
}

(async () => {
    const server = await H.startServer();
    const browser = await H.launchBrowser();
    try {
        const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
        const errors = H.collectErrors(page);
        await H.gotoMenu(page, server.url);
        // ---- Shop → Missions
        await page.evaluate(async () => {
            wodDismissChangelogPopup(); wodCloudCanSync = () => false; WodSteamStore.native = () => false;
            gameData.gold = 3000; gameData.ownedUnitSkins = { nato: true, medieval: true }; gameData.ownedShopVisuals = {};
            showPanel('shop'); switchShopTab('missions'); await renderShopMapsTab();
        });
        await page.waitForFunction(() => document.querySelectorAll('#shopMapOptions .shop-mission-card').length === 21);
        const shop = await page.evaluate(() => {
            const rows = [...document.querySelectorAll('#shopMapOptions > .shop-mission-era, #shopMapOptions > .shop-mission-card')];
            const sections = [];
            for(const r of rows) {
                if(r.classList.contains('shop-mission-era')) sections.push({ era: r.dataset.era, locked: r.classList.contains('shop-mission-era-locked'), get: !!r.querySelector('.shop-mission-era-get'), cards: [] });
                else sections.at(-1).cards.push({ id: r.dataset.missionId, era: r.dataset.era, needsArmy: r.classList.contains('shop-mission-needs-army'), tag: r.querySelector('.shop-codex-tag').textContent });
            }
            return sections;
        });
        assert.deepEqual(shop.map(s => s.era), ['modern', 'napoleonic', 'medieval', 'ancient'], 'one section per era, modern first');
        assert.ok(shop.every(s => s.cards.every(c => c.era === s.era)), 'each mission sits in its own era');
        assert.equal(shop[0].cards.length, 9);
        for(const s of shop.slice(1)) assert.deepEqual(s.cards.map(c => c.id).sort(), BATTLES[s.era].map(b => b.id).sort(), s.era + ': its four battles');
        const by = era => shop.find(s => s.era === era);
        assert.ok(!by('modern').locked && !by('medieval').locked && by('napoleonic').locked && by('ancient').locked, 'only the eras whose army you lack are locked');
        assert.ok(by('napoleonic').get && by('ancient').get && !by('medieval').get, '"Get the army" only where the army is missing');
        assert.ok(by('napoleonic').cards.every(c => c.needsArmy && /Needs Napoleonic army/.test(c.tag)) && by('medieval').cards.every(c => !c.needsArmy), 'locked missions say what they need');
        await page.screenshot({ path: path.join(OUT, 'shop.png') });
        // a mission whose army you lack is refused, and the shop shows that army
        await page.locator('#shopMapOptions [data-mission-id="waterloo-1815"]').click();
        const refused = await page.evaluate(() => ({ owned: wodOwnsShopVisual('shop_map_waterloo-1815'), gold: gameData.gold, tab: document.querySelector('#shopPanel .shop-tab.active')?.dataset.shopTab }));
        assert.deepEqual(refused, { owned: false, gold: 3000, tab: 'troops' }, 'refused without the Napoleonic army, and Troop skins opened');
        // with the army bought, the mission sells for its gold
        const bought = await page.evaluate(async () => {
            purchaseUnitSkin('napoleonic');
            switchShopTab('missions'); await renderShopMapsTab();
            const head = document.querySelector('#shopMapOptions .shop-mission-era[data-era="napoleonic"]');
            const before = gameData.gold;
            document.querySelector('#shopMapOptions [data-mission-id="waterloo-1815"]').click();
            return { unlocked: !head.classList.contains('shop-mission-era-locked'), owned: wodOwnsShopVisual('shop_map_waterloo-1815'), spent: before - gameData.gold };
        });
        assert.deepEqual(bought, { unlocked: true, owned: true, spent: 750 }, 'with the army, the mission sells: ' + JSON.stringify(bought));
        // a medieval mission (army owned) sells straight away
        assert.ok(await page.evaluate(() => { document.querySelector('#shopMapOptions [data-mission-id="agincourt-1415"]').click(); return wodOwnsShopVisual('shop_map_agincourt-1415'); }));
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(async () => { switchShopTab('missions'); await renderShopMapsTab(); });
        await page.locator('#shopMapOptions .shop-mission-era[data-era="ancient"]').scrollIntoViewIfNeeded();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'the shop fits a phone');
        await page.screenshot({ path: path.join(OUT, 'shop-phone.png') });
        await page.setViewportSize({ width: 1280, height: 900 });

        // ---- each battle, in its era
        await page.evaluate(() => { gameData.ownedUnitSkins = { nato: true, ancient: true, medieval: true, napoleonic: true }; });
        const battles = {};
        for(const { id, era, objective, named, levy, art } of CASES) {
            await page.evaluate(async id => {
                gameData._campaignRun = null; gameData.mp = null; gameState = 'MENU'; pauseMenuBackgroundBattle(); wodHideMissionPopup();
                await wodLoadShopMapCatalog(); for(const p of wodShopMapCatalog) gameData.ownedShopVisuals[wodShopMapShopId(p.id)] = true;
                const entry = wodFindMissionEntryById(id); gameData._selectedMissionEntry = entry;
                if(!await wodApplyMissionEntry(entry)) throw Error('could not load ' + id);
                startGame('ai', { mission: true });
            }, id);
            await page.waitForFunction(() => gameState === 'PLAYING' && gameData._matchReadyForEndChecks && !window._wodBootBusy, null, { timeout: 120000 });
            battles[id] = await page.evaluate(async ({ id, named }) => {
                setGameSpeed(0, true); cancelAnimationFrame(animationFrameId); wodHideMissionPopup();
                const data = await wodFetchMissionData(wodFindMissionEntryById(id)), authored = new Set(data.entities.map(u => u.uid));
                const live = gameData.entities.filter(u => u.hp > 0);
                const types = o => [...new Set(live.filter(u => (o === 1 ? u.owner === 1 : u.owner > 1) && !u.isGeneral).map(u => u.type))].sort();
                const out = {
                    era: wodGetMatchPeriod(), objective: gameData.mission.objective?.type, levy: gameData.mission.enemyManpowerRate ?? null,
                    full: data.entities.every(u => live.some(l => l.uid === u.uid)), extra: live.filter(u => !authored.has(u.uid) && !u.isGeneral && !u.cargo?.isGeneral).length, // (a side with no land, Midway's carriers, embarks its general in a landing craft)
                    named: live.some(u => u.owner === 1 && u.name === named) || null, mine: types(1), theirs: types(2),
                    art: [...new Set(live.filter(u => u.type !== 'ship').map(u => getEffectiveUnitSkin(u)))]
                };
                // a minute of the battle
                const mp0 = gameData.aiManpowerByOwner[2], inc = getOwnerManpowerIncome(2);
                for(let i = 0; i < 600; i++) {
                    gameData.speed = 1; wodBeginSimPfBudget(gameData.entities.length); gameData._wodPfFrameActive = true;
                    try { update(.1); } finally { gameData._wodPfFrameActive = false; }
                    wodDrainAiMoveQueue(); if(wodMissionPopupOpen()) wodHideMissionPopup(); if(gameData._missionRuntime) gameData._missionRuntime.popupOpen = false;
                }
                out.levyRate = +((gameData.aiManpowerByOwner[2] - mp0 + 0) / (inc * 60)).toFixed(2);
                out.fought = gameData.entities.some(u => (u.activeCombatVisual || 0) > 0) || (gameData._combatFx || []).length > 0;
                out.ended = !!gameData._campaignEnded;
                gameState = 'PLAYING'; draw();
                return out;
            }, { id, named: named || '' });
            await page.screenshot({ path: path.join(OUT, id + '.png') });
            const r = battles[id];
            assert.equal(r.era, era, id + ' is fought in the ' + era + ' era');
            assert.equal(r.objective, objective, id + ': its objective');
            assert.ok(r.full && r.extra === 0, id + ': the whole authored army starts, and nothing else: ' + JSON.stringify(r));
            if(named) assert.equal(r.named, true, id + ': units keep their historical names');
            const mixed = objective === 'fleet' ? ['ship'] : ['motorized', 'mountaineer', 'heavy'];
            for(const side of ['mine', 'theirs']) assert.ok(r[side].length >= 2 && r[side].some(t => mixed.includes(t)), id + ': ' + side + ' fields mixed troops: ' + r[side]);
            if(art) assert.deepEqual(r.art, [era], id + ': every army wears the ' + era + ' unit art: ' + r.art);
            assert.equal(r.levy, levy, id + ': the defenders\' manpower rate');
            if(levy != null) assert.ok(r.levyRate > levy - .05 && r.levyRate < levy + .05, id + ': and the economy step applies it: ' + r.levyRate);
            assert.ok(!r.ended, id + ': a minute in, the battle is still going');
        }
        assert.deepEqual(errors.pageErrors, [], 'no page errors');
        console.log(JSON.stringify(battles));
        console.log('verify-era-battles: OK');
    } finally { await browser.close(); await server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
