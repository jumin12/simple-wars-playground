'use strict';
// Saved games (js/game-saves.js): five named slots each for skirmish, campaign and missions, in one menu with a tab each.
//   encode    the save encoder: shared and circular references, Maps and Sets keyed by objects, odd numbers, a chain far
//             deeper than the stack, and what it leaves out
//   skirmish  save a running skirmish from the pause menu into a named slot, quit (not counted as a loss), load it from
//             the main menu: the same battle to the unit, which then plays on; rename, delete, five slots and no more
//   blocked   multiplayer and the tutorial cannot be saved (no Save button, and the save refuses)
//   campaign  save the campaign from the war map and load it back over a changed one; save a campaign battle (not while
//             deploying), quit (no failed assault), load it: the campaign and the battle come back
//   missions  save a mission and load it: the same mission, under the Missions tab
// Usage: node scripts/verify-game-saves.js [--only skirmish,campaign]
const assert = require('assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const H = require('./lib/harness');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7) || (process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : '');
const want = name => !ONLY || ONLY.split(',').includes(name);
const OUT = H.outDir('game-saves');

function encodePhase() {
    const ctx = { ArrayBuffer, Map, Set, Date, Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, WeakMap, console };
    vm.runInNewContext(fs.readFileSync(path.join(H.ROOT, 'js/game-saves.js'), 'utf8'), ctx);
    const { wodSaveEncode, wodSaveDecode } = ctx;
    // (built inside the game's context, as the game's own objects are)
    const src = vm.runInNewContext(`(() => {
        const a = { name: 'a' }, b = { name: 'b', peer: a };
        a.peer = b; a.self = a;
        const key = { k: 1 };
        class Thing { constructor() { this.x = 1; } }
        const src = {
            list: [a, b, a], map: new Map([[key, a], ['s', 2]]), set: new Set([key, 3]), key,
            odd: [NaN, Infinity, -Infinity, undefined, null, 0, -1.5, 'text', true],
            when: new Date(1234567890), f32: new Float32Array([1.5, 2.5]),
            fn() {}, weak: new WeakMap(), thing: new Thing(), omitMe: 5, nested: { omitMe: 6, keep: 7 },
            ['__proto__']: { polluted: true }
        };
        // a linked chain far deeper than the stack (map cells link to their neighbours)
        let head = { i: 0 }, cur = head;
        for(let i = 1; i < 200000; i++) { cur.next = { i }; cur = cur.next; }
        src.chain = head;
        return src;
    })()`, ctx);
    const enc = wodSaveEncode(src, { omitKeys: new Set(['omitMe']) });
    const out = wodSaveDecode(JSON.parse(JSON.stringify(enc)));
    assert.equal(out.list[0], out.list[2], 'a shared object stays one object');
    assert.equal(out.list[0].peer.peer, out.list[0], 'circular references survive');
    assert.equal(out.list[0].self, out.list[0]);
    assert.equal(out.map.get(out.key), out.list[0], 'a Map keyed by an object keeps the key object');
    assert.ok(out.set.has(out.key) && out.set.has(3));
    assert.ok(Number.isNaN(out.odd[0]) && out.odd[1] === Infinity && out.odd[2] === -Infinity && out.odd[3] === undefined && out.odd[4] === null);
    assert.equal(JSON.stringify(out.odd.slice(5)), JSON.stringify([0, -1.5, "text", true]));
    assert.equal(out.when.getTime(), 1234567890);
    assert.ok(ArrayBuffer.isView(out.f32) && out.f32.constructor.name === 'Float32Array' && out.f32[1] === 2.5);
    assert.ok(!('fn' in out) && !('weak' in out) && !('thing' in out), 'functions, WeakMaps and class instances are left out');
    assert.ok(!('omitMe' in out) && !('omitMe' in out.nested) && out.nested.keep === 7, 'omitted fields are left out wherever they are');
    assert.equal(Object.getPrototypeOf(out), vm.runInNewContext('Object.prototype', ctx), 'a "__proto__" key does not replace the prototype');
    assert.equal(vm.runInNewContext('({}).polluted', ctx), undefined, 'nor reach Object.prototype');
    assert.equal(Object.getOwnPropertyDescriptor(out, '__proto__').value.polluted, true, 'it stays an ordinary field');
    let n = 0; for(let c = out.chain; c; c = c.next) n++;
    assert.equal(n, 200000, 'a 200,000-long chain is encoded and decoded without recursion');
    assert.throws(() => wodSaveDecode({ shapes: [], objs: [[9]], root: { r: 0 } }), /damaged/);
    console.log('encode: OK (' + JSON.stringify(enc).length + ' bytes for the test graph, ' + enc.skipped + ' values left out)');
}

// a fingerprint of a running match, to compare a battle before saving with the same battle loaded back
const SIGNATURE = () => {
    const all = gameData.entities.flatMap(t => t.cargo ? [t, t.cargo] : [t]);
    let own = 0; for(const h of gameData.hexList) own = (own * 31 + (h.owner | 0) + 7) | 0;
    return {
        clock: +(gameData._aiEconomyClock || 0).toFixed(4), money: Math.round(gameData.money), manpower: Math.round(gameData.manpower),
        aiMoney: JSON.stringify(gameData.aiMoneyByOwner), units: all.length,
        unitRows: all.map(u => [u.uid, u.type, u.owner, Math.round(u.x * 100) / 100, Math.round(u.y * 100) / 100, Math.round(u.hp * 100) / 100, u.target ? 1 : 0, u.path ? u.path.length : 0].join(',')).sort().join(';'),
        cities: gameData.cities.map(c => c.q + ',' + c.r + ':' + c.owner + ':' + (c.hasFactory ? 1 : 0)).join(';'), owners: own,
        forts: (gameData.forts || []).length, bridges: (gameData.bridges || []).length, jobs: (gameData.constructionJobs || []).length,
        period: gameData._matchPeriod, fog: !!gameData.fogOfWar, explored: gameData._fogExplored ? gameData._fogExplored.size : 0,
        ledger: JSON.stringify((gameData._battleLedger && gameData._battleLedger.byOwner) || {}),
        aiDefense: Object.keys(gameData._aiDefenseByOwner || {}).sort().join(','), commanders: JSON.stringify(gameData.aiCommanderProfiles || {}),
        nextUnitId: gameData.nextUnitId, campaign: gameData._campaignRun ? gameData._campaignRun.nodeId : null,
        mission: gameData._selectedMissionEntry ? gameData._selectedMissionEntry.id : null, colors: factionColors.join(','),
        missionRuntime: JSON.stringify(gameData._missionRuntime || null), hasMission: !!gameData.mission
    };
};

async function bootPage(browser, url) {
    const context = await browser.newContext({ viewport: { width: 1400, height: 860 } });
    const page = await context.newPage();
    const errors = H.collectErrors(page);
    await H.gotoMenu(page, url);
    await H.closeChangelog(page);
    await page.evaluate(async () => { const idx = await wodGameSaveReadIndex(); for(const t of WOD_GAME_SAVE_TABS) for(let i = 0; i < 5; i++) if(idx.slots[t][i]) await wodDeleteGameSave(t, i); });
    return { context, page, errors };
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });
async function nameDialog(page, name) {
    await page.locator('#wodNameInputDlg:not(.hidden)').waitFor();
    await page.locator('#wodNameInputFld').fill(name);
    await page.locator('#wodNameInputOk').click();
}
async function confirmDialog(page) {
    await page.locator('#wodConfirmDlg:not(.hidden)').waitFor();
    await page.locator('#wodConfirmDlgOk').click();
}
// briefings and mission messages own the screen (the pause menu does not open under them): close any that are up
async function closePopups(page) {
    for(let i = 0; i < 6; i++) {
        const up = await page.evaluate(() => wodMissionPopupOpen());
        if(!up) return;
        await page.locator('#wodMissionPopupOk').click();
        await page.waitForTimeout(300);
    }
}
// run the battle on (at speed 3) until its clock passes `until`, closing mission messages that pause it
async function runUntil(page, until) {
    for(let i = 0; i < 240; i++) {
        if(await page.evaluate(t => (gameData._aiEconomyClock || 0) > t, until)) return;
        await closePopups(page);
        await page.evaluate(() => { window.checkCampaignEndConditions = () => {}; if(gameData.speed !== 3) setGameSpeed(3, true); });
        await page.waitForTimeout(500);
    }
    throw new Error('the battle did not run on to ' + until + ' s');
}
const slotRow = (page, i) => page.locator('#wodSavesSlots .wod-save-slot[data-slot="' + i + '"]');
async function waitSaved(page, tab, slot, name) {
    await page.waitForFunction(({ tab, slot, name }) => wodGameSavesUi.idx && wodGameSavesUi.idx.slots[tab][slot] && wodGameSavesUi.idx.slots[tab][slot].name === name && !wodGameSavesUi.busy, { tab, slot, name }, { timeout: 30000 });
}
// open the pause menu and save into a slot through the menus, the way a player does
async function saveFromPauseMenu(page, tab, slot, name, overwrite) {
    if(!await page.evaluate(() => wodGameSavesOpen())) {
        await page.evaluate(() => toggleEscMenu(true));
        const btn = page.locator('#wodEscSaveBtn');
        assert.ok(await btn.isVisible() && await btn.isEnabled(), 'the pause menu has an enabled Save game button');
        await btn.click();
        await page.locator('#savesPanel:not(.hidden)').waitFor();
    }
    await page.waitForFunction(tab => document.getElementById('wodSavesSlots').dataset.tab === tab && document.querySelectorAll('#wodSavesSlots .wod-save-slot').length === 5, tab);
    await slotRow(page, slot).locator('[data-save-act="' + (overwrite ? 'overwrite' : 'save') + '"]').click();
    if(overwrite) await confirmDialog(page);
    await nameDialog(page, name);
    await waitSaved(page, tab, slot, name);
}
// with a battle just saved: the save menu's Quit to main menu
async function quitAfterSave(page) {
    const quit = page.locator('#wodSavesQuit');
    await quit.waitFor({ state: 'visible' });
    await quit.click();
    await page.waitForFunction(() => gameState === 'MENU');
}
// from the main menu: Saved games, a tab, Load on a slot; returns the battle as it stood the moment it was put back
async function loadFromMenu(page, tab, slot, expectConfirm) {
    await page.evaluate(() => {
        window.__loadedSig = null; window.__loadedTimers = null;
        const apply = wodApplySavedMatchState;
        window.wodApplySavedMatchState = function(state, payload) {
            const r = apply.apply(this, arguments);
            window.__loadedSig = (window.__SIGNATURE)();
            const now = performance.now();
            window.__loadedTimers = gameData.entities.filter(u => ['_wodPathGiveUpUntil', '_wodPfRelaxUntil', '_wodAmpFailUntil', '_wodReplanLandUntil'].some(k => u[k] > now)).length;
            window.wodApplySavedMatchState = apply;
            return r;
        };
    });
    await page.locator('#wodMainSavesBtn').click();
    await page.locator('#savesPanel:not(.hidden)').waitFor();
    await page.locator('#savesPanel [data-save-tab="' + tab + '"]').click();
    await page.waitForFunction(tab => document.getElementById('wodSavesSlots').dataset.tab === tab, tab);
    await slotRow(page, slot).locator('[data-save-act="load"]').waitFor();
    await slotRow(page, slot).locator('[data-save-act="load"]').click();
    if(expectConfirm) await confirmDialog(page);
}

async function skirmishPhase(browser, url) {
    const { context, page, errors } = await bootPage(browser, url);
    await page.evaluate(() => { const f = document.getElementById('setupFogOfWar'); if(f) { f.checked = true; f.dispatchEvent(new Event('change')); } });
    await H.startSkirmish(page);
    await page.evaluate(sig => { window.__SIGNATURE = new Function('return (' + sig + ')()'); window.checkCampaignEndConditions = () => {}; setGameSpeed(3, true); }, SIGNATURE.toString());
    await page.waitForFunction(() => (gameData._aiEconomyClock || 0) > 40, null, { timeout: 120000 });
    const lost0 = await page.evaluate(() => ({ lost: wodProgress.lifetime.matchesLost || 0, started: wodProgress.lifetime.gamesStarted || 0 }));
    await saveFromPauseMenu(page, 'skirmish', 0, 'Probe battle');
    const before = await page.evaluate(() => window.__SIGNATURE());
    const entry = await page.evaluate(() => wodGameSavesUi.idx.slots.skirmish[0]);
    assert.equal(entry.kind, 'match');
    assert.ok(entry.lines.length >= 2 && /played/.test(entry.lines[1]) && /towns/.test(entry.lines[1]), 'the slot says how far in: ' + JSON.stringify(entry.lines));
    assert.ok(/^data:image\/jpeg/.test(entry.thumb), 'the slot has a picture of the map');
    assert.ok(await slotRow(page, 0).locator('.wod-save-slot-tag').isVisible(), 'the slot is marked as this battle');
    await shot(page, 'skirmish-saved');
    // the battle stayed paused while the menu was open
    assert.equal(await page.evaluate(() => +(gameData._aiEconomyClock).toFixed(4)), before.clock);
    await quitAfterSave(page);
    const lost1 = await page.evaluate(() => ({ lost: wodProgress.lifetime.matchesLost || 0, started: wodProgress.lifetime.gamesStarted || 0 }));
    assert.equal(lost1.lost, lost0.lost, 'quitting right after a save is not a lost match');
    await loadFromMenu(page, 'skirmish', 0, false);
    await H.waitForMatch(page);
    const loaded = await page.evaluate(() => window.__loadedSig);
    for(const k of Object.keys(before)) assert.deepEqual(loaded[k], before[k], 'the loaded battle matches the saved one: ' + k);
    assert.equal(await page.evaluate(() => window.__loadedTimers), 0, 'no unit waits on a page-clock deadline from the old page');
    const lost2 = await page.evaluate(() => ({ lost: wodProgress.lifetime.matchesLost || 0, started: wodProgress.lifetime.gamesStarted || 0 }));
    assert.equal(lost2.started, lost1.started, 'loading is not counted as a new match');
    // it plays on: the clock runs, units move and the computer gives orders
    await page.evaluate(() => { window.checkCampaignEndConditions = () => {}; setGameSpeed(3, true); window.__pos = new Map(gameData.entities.map(u => [u.uid, u.x + ',' + u.y])); });
    const clock0 = await page.evaluate(() => gameData._aiEconomyClock);
    await page.waitForFunction(c => gameData._aiEconomyClock > c + 25, clock0, { timeout: 120000 });
    const moved = await page.evaluate(() => ({ ai: gameData.entities.filter(u => u.owner > 1 && u.type !== 'convoy' && window.__pos.has(u.uid) && window.__pos.get(u.uid) !== u.x + ',' + u.y).length, fog: !!gameData._fogVisible && gameData._fogVisible.size }));
    assert.ok(moved.ai >= 3, 'the computer\'s armies move after loading: ' + moved.ai);
    assert.ok(moved.fog > 0, 'fog vision is rebuilt');
    await shot(page, 'skirmish-loaded');
    // save again over the same slot, then rename and delete; five slots and no sixth
    await saveFromPauseMenu(page, 'skirmish', 0, 'Probe battle 2', true);
    await slotRow(page, 0).locator('[data-save-act="rename"]').click();
    await nameDialog(page, 'Renamed battle');
    await waitSaved(page, 'skirmish', 0, 'Renamed battle');
    await saveFromPauseMenu(page, 'skirmish', 4, 'Last slot');
    await page.evaluate(() => document.querySelector('#savesPanel [data-save-tab="campaign"]').click());
    await page.waitForFunction(() => document.getElementById('wodSavesSlots').dataset.tab === 'campaign' && document.querySelectorAll('#wodSavesSlots .wod-save-slot').length === 5);
    assert.equal(await page.locator('#wodSavesSlots [data-save-act="save"]').count(), 0, 'a skirmish cannot be saved under Campaign');
    assert.equal(await page.locator('#wodSavesSlots [data-save-tab-of="skirmish"]').count(), 0, 'the Campaign tab shows only campaign slots');
    await page.evaluate(() => document.querySelector('#savesPanel [data-save-tab="skirmish"]').click());
    await slotRow(page, 4).locator('[data-save-act="delete"]').waitFor();
    await slotRow(page, 4).locator('[data-save-act="delete"]').click();
    await confirmDialog(page);
    await page.waitForFunction(() => wodGameSavesUi.idx && !wodGameSavesUi.idx.slots.skirmish[4] && !wodGameSavesUi.busy);
    assert.equal(await page.evaluate(async () => !!(await wodIdbKvGet(wodGameSaveKey('skirmish', 4)))), false, 'a deleted save is gone from storage');
    await assert.rejects(page.evaluate(() => wodWriteGameSave('skirmish', 5, 'sixth')), /No such save slot/);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !wodGameSavesOpen() && wodEscMenuOpen());
    // having played on since the save, Quit to main menu is not offered
    await page.evaluate(() => { toggleEscMenu(false); setGameSpeed(3, true); });
    await page.waitForFunction(c => gameData._aiEconomyClock > c + 2, await page.evaluate(() => gameData._aiEconomyClock));
    await page.evaluate(() => { toggleEscMenu(true); wodOpenGameSavesFromGame(); });
    await page.waitForFunction(() => wodGameSavesOpen() && !!wodGameSavesUi.idx);
    assert.equal(await page.locator('#wodSavesQuit').isVisible(), false, 'no quit shortcut once the battle has moved on');
    await shot(page, 'skirmish-menu');
    assert.deepEqual(errors.pageErrors, [], 'no page errors');
    await context.close();
    console.log('skirmish: OK (' + before.units + ' units, ' + Math.round(entry.bytes / 1024) + ' KB save, clock ' + before.clock + ')');
}

async function blockedPhase(browser, url) {
    const { context, page, errors } = await bootPage(browser, url);
    await H.startSkirmish(page);
    const mp = await page.evaluate(async () => {
        const real = gameData.mp;
        gameData.mp = { enabled: true, isHost: true, localSlot: 1 };
        toggleEscMenu(true);
        const hidden = document.getElementById('wodEscSaveBtn').classList.contains('hidden');
        let err = '';
        try { await wodWriteGameSave('skirmish', 0, 'mp'); } catch(e) { err = e.message; }
        gameData.mp = real; toggleEscMenu(false);
        return { hidden, err };
    });
    assert.ok(mp.hidden, 'no Save game button in multiplayer');
    assert.match(mp.err, /Multiplayer/);
    const tut = await page.evaluate(async () => {
        wodTutorial = { steps: [], index: 0 };
        toggleEscMenu(true);
        const hidden = document.getElementById('wodEscSaveBtn').classList.contains('hidden');
        let err = '';
        try { await wodWriteGameSave('skirmish', 0, 'tutorial'); } catch(e) { err = e.message; }
        wodTutorial = null; toggleEscMenu(false);
        return { hidden, err };
    });
    assert.ok(tut.hidden, 'no Save game button in the tutorial');
    assert.match(tut.err, /tutorial/);
    assert.equal(await page.evaluate(async () => !!(await wodGameSaveReadIndex()).slots.skirmish[0]), false, 'nothing was saved');
    assert.deepEqual(errors.pageErrors, [], 'no page errors');
    await context.close();
    console.log('blocked: OK');
}

async function campaignPhase(browser, url) {
    const { context, page, errors } = await bootPage(browser, url);
    await page.evaluate(sig => { window.__SIGNATURE = new Function('return (' + sig + ')()'); }, SIGNATURE.toString());
    await page.evaluate(() => { wodRogueDeleteSave(); showPanel('playMode'); showPanel('campaign'); });
    assert.equal(await page.locator('#wodCampSaveBtn').isVisible(), false, 'no Save campaign before a campaign begins');
    await page.locator('#wodCampBeginBtn').click();
    await page.waitForFunction(() => !!wodRogueLoad() && !document.getElementById('wodCampSaveBtn').classList.contains('hidden'));
    const pts0 = await page.evaluate(() => wodRogueLoad().points);
    // save from the war map into Campaign slot 1
    await page.locator('#wodCampSaveBtn').click();
    await page.locator('#savesPanel:not(.hidden)').waitFor();
    await page.waitForFunction(() => document.getElementById('wodSavesSlots').dataset.tab === 'campaign' && wodGameSavesUi.kind === 'campaign-map' && document.querySelectorAll('#wodSavesSlots .wod-save-slot').length === 5);
    await slotRow(page, 0).locator('[data-save-act="save"]').click();
    await nameDialog(page, 'War map save');
    await waitSaved(page, 'campaign', 0, 'War map save');
    await page.locator('#wodSavesBack').click();
    await page.waitForFunction(() => !document.getElementById('campaignPanel').classList.contains('hidden'));
    // change the campaign, then load the save from Saved games on the campaign screen (it asks first)
    await page.evaluate(() => { const c = wodRogueLoad(); c.points = 1; c.turn = 9; wodRogueSave(); wodRefreshCampaignPanel(); });
    await page.locator('#wodCampLoadBtn').click();
    await page.locator('#savesPanel:not(.hidden)').waitFor();
    await page.waitForFunction(() => document.getElementById('wodSavesSlots').dataset.tab === 'campaign');
    await slotRow(page, 0).locator('[data-save-act="load"]').waitFor();
    await slotRow(page, 0).locator('[data-save-act="load"]').click();
    await confirmDialog(page);
    await page.waitForFunction(() => !document.getElementById('campaignPanel').classList.contains('hidden'));
    const back = await page.evaluate(() => ({ points: wodRogueLoad().points, turn: wodRogueLoad().turn, stored: JSON.parse(localStorage.getItem(WOD_ROGUE_LS_KEY)).points }));
    assert.deepEqual(back, { points: pts0, turn: 1, stored: pts0 }, 'the saved campaign is back, and kept as the current one');
    // a campaign battle: buy an army, launch the first playable region
    await page.evaluate(() => { for(let i = 0; i < 4; i++) wodRogueRosterAdd('light'); wodRogueRosterAdd('heavy'); });
    const node = await page.evaluate(() => wodRogueNodes().find(n => wodRogueNodePlayable(n.id)).id);
    await page.evaluate(node => wodRogueStartBattle(node), node);
    await page.waitForFunction(() => gameState === 'PLAYING' && !!gameData._campaignRun && wodMissionPopupOpen(), null, { timeout: 180000 });
    assert.match(await page.evaluate(() => wodGameSaveBlockReason()), /begin/, 'no saving during the briefing');
    await closePopups(page);
    await page.waitForFunction(() => gameData._campaignRun.deploying);
    const deploying = await page.evaluate(() => { toggleEscMenu(true); const b = document.getElementById('wodEscSaveBtn'); const r = { disabled: b.disabled, why: b.title }; toggleEscMenu(false); return r; });
    assert.ok(deploying.disabled && /deploy/i.test(deploying.why), 'no saving while deploying: ' + JSON.stringify(deploying));
    await page.evaluate(() => { wodFinishCampaignDeployPhase(); window.checkCampaignEndConditions = () => {}; setGameSpeed(3, true); });
    await page.waitForFunction(() => (gameData._aiEconomyClock || 0) > 20, null, { timeout: 120000 });
    await closePopups(page);
    const stats0 = await page.evaluate(() => JSON.stringify(wodRogueLoad().stats) + '|' + JSON.stringify(wodRogueLoad().nodesState));
    await saveFromPauseMenu(page, 'campaign', 1, 'Battle save');
    const before = await page.evaluate(() => window.__SIGNATURE());
    assert.equal(before.campaign, node);
    await quitAfterSave(page);
    assert.equal(await page.evaluate(() => JSON.stringify(wodRogueLoad().stats) + '|' + JSON.stringify(wodRogueLoad().nodesState)), stats0, 'quitting right after the save is not a failed assault');
    // change the campaign again: loading the battle save brings back the campaign as it was then
    await page.evaluate(() => { const c = wodRogueLoad(); c.points = 3; wodRogueSave(); });
    await loadFromMenu(page, 'campaign', 1, true);
    await H.waitForMatch(page);
    const loaded = await page.evaluate(() => window.__loadedSig);
    for(const k of Object.keys(before)) assert.deepEqual(loaded[k], before[k], 'the loaded campaign battle matches the saved one: ' + k);
    const after = await page.evaluate(() => ({ run: !!gameData._campaignRun && gameData._campaignRun.battleLive, deploying: gameData._campaignRun.deploying, hud: document.getElementById('inGameUI').classList.contains('wod-campaign-battle'), points: wodRogueLoad().points, roster: gameData.entities.filter(u => u.owner === 1 && u._campRosterId).length }));
    assert.ok(after.run && !after.deploying && after.hud, 'the battle resumes live, with the campaign HUD: ' + JSON.stringify(after));
    assert.notEqual(after.points, 3, 'the campaign is the one from the save');
    assert.ok(after.roster > 0, 'the campaign army is on the field');
    await shot(page, 'campaign-battle-loaded');
    assert.deepEqual(errors.pageErrors, [], 'no page errors');
    await context.close();
    console.log('campaign: OK');
}

async function missionsPhase(browser, url) {
    const { context, page, errors } = await bootPage(browser, url);
    await page.evaluate(sig => { window.__SIGNATURE = new Function('return (' + sig + ')()'); }, SIGNATURE.toString());
    await page.evaluate(() => showPanel('missions'));
    await page.waitForFunction(() => wodMissionCatalogLoaded && wodMissionCatalog.length > 0, null, { timeout: 60000 });
    const id = await page.evaluate(() => wodMissionCatalog[0].id);
    await page.evaluate(id => { wodSelectMissionEntry(wodFindMissionEntryById(id)); document.getElementById('wodMissionStartBtn').click(); }, id);
    await page.waitForFunction(() => gameState === 'PLAYING' && gameData._matchReadyForEndChecks && !!gameData._selectedMissionEntry, null, { timeout: 180000 });
    await runUntil(page, 15);
    await closePopups(page);
    await saveFromPauseMenu(page, 'missions', 2, 'Mission save');
    const before = await page.evaluate(() => ({ sig: window.__SIGNATURE() }));
    assert.equal(before.sig.mission, id);
    assert.ok(before.sig.hasMission && before.sig.missionRuntime !== 'null', 'a mission with its event progress');
    await quitAfterSave(page);
    await loadFromMenu(page, 'missions', 2, false);
    await H.waitForMatch(page);
    const loaded = await page.evaluate(() => ({ sig: window.__loadedSig }));
    for(const k of Object.keys(before.sig)) assert.deepEqual(loaded.sig[k], before.sig[k], 'the loaded mission matches the saved one (with its definition and event progress): ' + k);
    await runUntil(page, before.sig.clock + 10);
    await shot(page, 'mission-loaded');
    assert.deepEqual(errors.pageErrors, [], 'no page errors');
    await context.close();
    console.log('missions: OK');
}

(async () => {
    if(want('encode')) encodePhase();
    if(!['skirmish', 'blocked', 'campaign', 'missions'].some(want)) return;
    const server = await H.startServer();
    const browser = await H.launchBrowser();
    try {
        const url = server.url;
        if(want('skirmish')) await skirmishPhase(browser, url);
        if(want('blocked')) await blockedPhase(browser, url);
        if(want('campaign')) await campaignPhase(browser, url);
        if(want('missions')) await missionsPhase(browser, url);
        console.log('verify-game-saves: OK');
    } finally { await browser.close(); await server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
