'use strict';
// node scripts/verify-mp-map-modes.js [--only N,M] — multiplayer matches over a local relay for every player count and both
// Balance settings: one against one, three and four players, with AI seats and without, several shapes and sizes.
// For each match:
//  - the host's lobby preview has the shape, towns per player and Balance asked for; every player has the same towns and
//    the same land (Balance off too); Balance on is symmetric (terrain and owners); every player starts with the same army
//  - launched, every client has the same terrain and towns as the host; the guests keep receiving the battle (their
//    troops move); AI seats play; no page error.
// Edge cases: Balance, towns per player and seats changed in the lobby with a guest present (each change makes a valid
// preview, the guest sees the setting); a guest leaving a match (the AI takes its seat and the battle goes on); the host
// leaving (a guest takes over hosting, the other keeps receiving); one human with three AI; a small map with four towns.
const H = require('./lib/harness');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert/strict'), { fork } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'output/mp-map-modes'); fs.mkdirSync(OUT, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(OUT, 'relay-')); let relay, relayPort, relayLog = '';
const server = H.createStaticServer({ rewrite: (p, b) => p === '/index.html' ? H.injectHead(b, "<script>window.WOD_MP_WS_URL='ws://127.0.0.1:" + relayPort + "';</script>") : undefined });
const harness = path.join(OUT, 'relay.cjs'); fs.writeFileSync(harness, `require(${JSON.stringify(path.join(ROOT, 'server/index.js'))});`);
async function startRelay() {
    const probe = http.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); relayPort = probe.address().port; await new Promise(r => probe.close(r));
    relay = fork(harness, [], { cwd: ROOT, env: { ...process.env, PORT: String(relayPort), DATABASE_URL: '', STEAM_PURCHASES_ENABLED: '0', WOD_MIN_MATCH_SECONDS: '0', WOD_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    relay.stdout.on('data', b => relayLog += b); relay.stderr.on('data', b => relayLog += b);
    for(let i = 0; i < 100 && !/listening|ws:\/\/|port/i.test(relayLog); i++) await new Promise(r => setTimeout(r, 100));
}
const only = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? new Set(process.argv[i + 1].split(',').map(Number)) : null; })();
let browser, url;
const errors = [];
async function client(name, early) {
    const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
    await context.addInitScript(ws => window.WOD_MP_WS_URL = ws, 'ws://127.0.0.1:' + relayPort);
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(name + ': ' + e.message));
    page.on('console', m => { if(m.type() === 'error' && !/WebSocket|ERR_CONNECTION|Failed to load resource/i.test(m.text())) errors.push(name + ' console: ' + m.text().slice(0, 1500)); });
    await page.goto(url + '/');
    await page.waitForFunction(() => typeof wodProgress === 'object' && WodMultiplayer.api.registered, null, { timeout: 90000 });
    // (a player opens multiplayer from the menu once the game has started up; `early` opens it while the menu's
    // background battle is still being made, which must then stay paused behind the lobby)
    if(!early) await page.waitForFunction(() => !window._wodBootBusy && !window._wodMenuBootstrapBusy, null, { timeout: 180000, polling: 250 });
    // simulated seconds while playing, so watches are game time however busy the machine is
    await page.evaluate(() => { window.__simT = 0; const u = update; update = function(dt) { if(dt > 0 && gameState === 'PLAYING') window.__simT += dt; return u.apply(this, arguments); }; });
    await page.evaluate(name => { wodDismissChangelogPopup(); showPanel('multiplayer'); wodMpWireLobbyUi(); document.getElementById('mpDisplayName').value = name; wodProgress.profile.mpDisplayName = name; void wodMpRegisterWithServer(); }, name);
    await page.waitForFunction(name => wodProgress.profile.mpDisplayName === name && WodMultiplayer.api.registered, name, { timeout: 30000 });
    await page.evaluate(() => { window.__applies = 0; const a = wodMpApplySnapPayload; wodMpApplySnapPayload = function() { window.__applies++; return a.apply(this, arguments); }; });
    await page.evaluate(() => {
        window.__badBorder = [];
        const f = wodSmoothDiplomacyBorderPoints;
        wodSmoothDiplomacyBorderPoints = function(points, spacing) {
            if(window.__badBorder.length < 3 && points && points.length >= 8) {
                let bad = !(spacing > 0) || !Number.isFinite(spacing), at = null;
                if(!bad) for(const p of points) if(!Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 1e7 || Math.abs(p.y) > 1e7) { bad = true; at = { x: p.x, y: p.y }; break; }
                if(bad) window.__badBorder.push({ spacing, n: points.length, at, state: gameState, attract: !!gameData.menuAttractMode, hexR: gameData.hexRadius,
                    stack: (new Error().stack || '').split('\n').slice(2, 9).map(s => s.trim().replace(/\(http[^)]*\/js\//, '(')).join(' < ') });
            }
            return f.apply(this, arguments);
        };
    });
    // (a log of the room settings going out and coming in, printed when a check on them fails)
    await page.evaluate(() => {
        window.__metaLog = [];
        const t0 = performance.now(), log = (k, o) => { window.__metaLog.push(Math.round(performance.now() - t0) + ' ' + k + ' ' + JSON.stringify(o)); if(window.__metaLog.length > 80) window.__metaLog.shift(); };
        addEventListener('wod-mp-RoomMeta', ev => { const m = (ev.detail && ev.detail.meta) || {}; const s = WodMultiplayer.api.lobbyMetaSent; log('in', { rev: m.hostMetaRev, shape: m.mapShape, bal: m.mapBalance, sentRev: s && s.hostMetaRev }); });
        addEventListener('wod-mp-Error', ev => log('error', ev.detail));
        const send = WodMultiplayer.sendLobbyMeta;
        WodMultiplayer.sendLobbyMeta = function(m) { const r = send.apply(this, arguments); log('out', { rev: WodMultiplayer.api.lobbyMetaRev, shape: m && m.mapShape, bal: m && m.mapBalance }); return r; };
        const apply = wodMpApplyRoomMeta;
        wodMpApplyRoomMeta = function(m) { log('apply', { shape: m && m.mapShape, bal: m && m.mapBalance, at: (new Error().stack || '').split('\n').slice(2, 5).map(s => s.trim().replace(/\(http[^)]*\/js\//, '(')).join(' < ') }); return apply.apply(this, arguments); };
        let last = '';
        setInterval(() => { const m = window.wodMpRoomMeta || {}, k = m.mapShape + '/' + m.mapBalance; if(k !== last) { log('meta now', k); last = k; } }, 25);
    });
    return { name, context, page };
}
/** Border lines drawn with no size or with points off at infinity (recorded with where they came from). */
const badBorders = [];
async function closeClient(c) {
    try { badBorders.push(...(await c.page.evaluate(() => window.__badBorder || [])).map(b => Object.assign({ client: c.name }, b))); } catch(e) {}
    await c.context.close();
}
const seatsFor = (humans, bots) => { const s = []; for(let i = 0; i < 4; i++) s.push(i < humans ? 'human' : i < humans + bots ? 'bot' : 'closed'); return s; };
const idle = host => host.page.waitForFunction(() => !wodIsMapPreviewGenerating() && !document.getElementById('mpCfgMapApply').disabled && !document.getElementById('mpBtnGlMap').disabled, null, { timeout: 180000, polling: 100 });
const ready = host => host.page.waitForFunction(() => !wodIsMapPreviewGenerating() && wodMpCommittedIsCurrentForMeta(window.wodMpRoomMeta), null, { timeout: 180000, polling: 500 });
/** Map settings through the host's map dialog (the real Apply path). Several at once are applied back to back, with no
 *  pause, before the relay has echoed the first (the host must end on the last, not on an echo of an earlier one). */
async function applyMap(host, cfg, burst) {
    const list = burst || [cfg];
    // (the map dialog is locked while a preview is being made, as for a player: wait for it like one)
    await idle(host);
    await host.page.evaluate(list => {
        for(const cfg of list) {
            document.getElementById('mpBtnGlMap').click();
            document.getElementById('mpCfgMapShape').value = cfg.shape;
            document.getElementById('mpCfgMapSize').value = String(cfg.size);
            document.getElementById('mpCfgCitiesPerPlayer').value = String(cfg.towns);
            document.getElementById('mpCfgMapBalance').checked = cfg.balance;
            document.getElementById('mpCfgMapApply').click();
        }
    }, list);
    const last = list[list.length - 1];
    for(let i = 0; i < 6; i++) {
        await host.page.waitForTimeout(500);
        // (the room keeps what was applied: an echo of an earlier update must not put the old settings back)
        const m = await host.page.evaluate(() => { const m = window.wodMpRoomMeta || {}; return { shape: m.mapShape, size: m.mapSize, towns: m.citiesPerPlayer, balance: m.mapBalance !== false,
            ui: { shape: document.getElementById('mpCfgMapShape').value, towns: document.getElementById('mpCfgCitiesPerPlayer').value, balance: document.getElementById('mpCfgMapBalance').checked } }; });
        if(m.shape !== last.shape || +m.size !== last.size || +m.towns !== last.towns || m.balance !== last.balance)
            console.log('META LOG ' + JSON.stringify(await host.page.evaluate(() => window.__metaLog), null, 1));
        assert.deepEqual({ shape: m.shape, size: +m.size, towns: +m.towns, balance: m.balance }, { shape: last.shape, size: last.size, towns: last.towns, balance: last.balance }, 'host room settings after Apply ' + JSON.stringify(m));
        assert.deepEqual({ shape: m.ui.shape, towns: +m.ui.towns, balance: m.ui.balance }, { shape: last.shape, towns: last.towns, balance: last.balance }, 'host dialog after Apply ' + JSON.stringify(m));
    }
    await ready(host);
}
/** What the host's map gives each player: in the lobby the committed preview (the lobby puts its own state back after
 *  generating, as its preview painter does), in a match the live map. Symmetry is measured from the cells themselves
 *  against the group the player count calls for (two and four players: exact; three: nearest-cell copies). */
const previewStats = (c, n) => c.page.evaluate(n => {
    const inLobby = gameState !== 'PLAYING';
    const cm = inLobby ? _wodMpCommittedLobbyMap : null;
    const back = cm ? wodMpSnapshotLobbyGenBackup() : null;
    try {
        if(cm) wodMpApplyDeepMapSnapshot(cm.data);
        const owners = [...new Set(gameData.cities.map(c => c.owner))].sort((a, b) => a - b);
        const land = wodCountBalancedLandByOwner(owners), towns = {}, army = {};
        for(const c of gameData.cities) towns[c.owner] = (towns[c.owner] || 0) + 1;
        for(const u of gameData.entities) if(u.hp > 0 && u.type !== 'convoy') { army[u.owner] = army[u.owner] || {}; army[u.owner][u.type] = (army[u.owner][u.type] || 0) + 1; }
        const cols = gameData.mapRadius, rows = Math.floor(gameData.mapRadius * 0.8);
        const G = WodTerrainGen.buildSymGroup(gameData.mapShape === 'continents' && n === 4 ? { type: 'cont4' } : { type: 'rot', n }, cols, rows);
        const cells = new Array(G.N);
        for(const h of gameData.hexList) { const i = G.at(h.q, h.r); if(i >= 0) cells[i] = h; }
        let pairs = 0, typeBad = 0, ownerBad = 0;
        const ownerMaps = [];
        const pair = (a, b, k) => {
            if(!a || !b) return;
            pairs++;
            if(a.type !== b.type) { typeBad++; return; }
            if(isWaterHex(a) || !(a.owner > 0)) return;
            const m = ownerMaps[k] || (ownerMaps[k] = new Map());
            if(!m.has(a.owner)) m.set(a.owner, b.owner); else if(m.get(a.owner) !== b.owner) ownerBad++;
        };
        if(G.exact) { for(let k = 1; k < G.order; k++) for(let i = 0; i < G.N; i++) if(!G.outside[i] && G.img[k][i] >= 0 && G.img[k][i] !== i) pair(cells[i], cells[G.img[k][i]], k); }
        else for(let i = 0; i < G.N; i++) if(!G.outside[i] && G.rep[i] !== i) pair(cells[G.rep[i]], cells[i], G.repK[i]);
        const meta = window.wodMpRoomMeta || {};
        return { lobby: inLobby, committed: !!cm, shape: gameData.mapShape, owners, land, towns, army, exact: G.exact, pairs, typeBad, ownerBad,
            typeBadFrac: pairs ? typeBad / pairs : 1, metaBalance: meta.mapBalance, metaTowns: meta.citiesPerPlayer, hexes: gameData.hexList.length };
    } finally {
        if(back) wodMpRestoreLobbyGenBackup(back);
    }
}, n);
function checkStats(st, want, tag) {
    const n = want.humans + want.bots;
    assert.equal(st.owners.length, n, tag + ': players on the map ' + JSON.stringify(st));
    assert.equal(st.shape, want.shape, tag + ': shape');
    for(const o of st.owners) assert.equal(st.towns[o], st.towns[st.owners[0]], tag + ': equal towns ' + JSON.stringify(st.towns));
    assert(st.towns[st.owners[0]] >= 1 && st.towns[st.owners[0]] <= want.towns, tag + ': towns per player ' + JSON.stringify(st.towns));
    const l = st.owners.map(o => st.land[o]);
    assert(Math.max(...l) - Math.min(...l) <= 1, tag + ': equal land ' + JSON.stringify(st.land));
    if(want.balance) {
        if(st.exact) assert(st.typeBad === 0 && st.ownerBad === 0, tag + ': balanced map is exactly symmetric ' + JSON.stringify({ typeBad: st.typeBad, ownerBad: st.ownerBad, pairs: st.pairs }));
        else assert(st.typeBadFrac < 0.03, tag + ': balanced three-player map is symmetric ' + JSON.stringify({ typeBad: st.typeBad, pairs: st.pairs }));
    } else {
        // Balance off: free-form terrain, nothing like a turned copy of itself
        assert(st.typeBadFrac > 0.06, tag + ': Balance off map is not symmetric ' + JSON.stringify({ typeBad: st.typeBad, pairs: st.pairs }));
    }
}
const sig = page => page.evaluate(() => ({ n: gameData.hexList.length, shape: gameData.mapShape,
    terrain: gameData.hexList.reduce((s, h, i) => (s * 31 + h.type.charCodeAt(0) * 7 + h.type.length + i) | 0, 0),
    towns: gameData.cities.map(c => c.q + ',' + c.r + ':' + c.owner).sort().join(' ') }));
const playing = c => c.page.evaluate(() => ({ playing: gameState === 'PLAYING' && !!gameData.mp?.enabled && wodMpMatchCanPlay(), loading: !!gameData._mpLoadingMatch,
    host: !!gameData.mp?.isHost, slot: gameData.mp?.localSlot, applies: window.__applies, ents: gameData.entities.length }));
async function launch(host, guests) {
    await host.page.evaluate(() => document.getElementById('mpBtnGlLaunch').click());
    for(let i = 0; i < 45; i++) {
        await host.page.waitForTimeout(2000);
        const s = await Promise.all([host, ...guests].map(playing));
        if(s.every(x => x.playing && !x.loading)) return s;
    }
    return null;
}
/** A human player orders up to three of their land troops to a spot of their own land five to nine cells away. */
const orderTroops = c => c.page.evaluate(() => {
    const me = wodLocalPlayerOwner();
    const units = gameData.entities.filter(u => u.owner === me && u.hp > 0 && !wodIsNavalUnit(u) && u.type !== 'convoy' && u.type !== 'transport' && !u.id && !u.moraleBroken).slice(0, 3);
    if(!units.length) return { me, uids: [] };
    const h0 = getNearestHexToPoint(units[0].x, units[0].y);
    const goal = gameData.hexList.filter(h => h.owner === me && !isWaterHex(h) && h.type !== 'mountain' && !h.cityId)
        .map(h => ({ h, d: Math.max(Math.abs(h.q - h0.q), Math.abs(h.r - h0.r)) })).filter(x => x.d >= 5 && x.d <= 9)
        .sort((a, b) => a.d - b.d)[0];
    if(!goal) return { me, uids: [], why: 'no goal' };
    for(const u of gameData.entities) u.selected = false;
    gameData.selection = units; for(const u of units) u.selected = true;
    issueMoveOrder({ x: goal.h.x, y: goal.h.y });
    return { me, uids: units.map(u => u.uid), types: units.map(u => u.type) };
});
/** Wait until the host's battle has run this many simulated seconds (at most four minutes of wall time). */
async function waitSim(c, seconds) {
    const t0 = await c.page.evaluate(() => window.__simT), end = Date.now() + 240000;
    while(Date.now() < end) {
        await c.page.waitForTimeout(1000);
        const t = await c.page.evaluate(() => window.__simT);
        if(t - t0 >= seconds) return Math.round((t - t0) * 10) / 10;
    }
    return null;
}
const positions = page =>page.evaluate(() => { const m = {}; for(const u of gameData.entities) if(u.hp > 0) m[u.uid] = { o: u.owner, x: Math.round(u.x), y: Math.round(u.y) }; return m; });
function moved(a, b) { const by = {}; for(const k in b) { const p = a[k], q = b[k]; if(!p) { by[q.o] = (by[q.o] || 0) + 1; continue; } if(p.x !== q.x || p.y !== q.y) by[q.o] = (by[q.o] || 0) + 1; } return by; }
async function match(spec, idx) {
    const tag = '#' + idx + ' ' + spec.humans + 'h+' + spec.bots + 'ai ' + spec.shape + ' ' + spec.size + ' towns ' + spec.towns + ' balance ' + (spec.balance ? 'on' : 'off');
    const res = { tag };
    const host = await client('Host ' + idx, spec.earlyLobby), guests = [];
    for(let g = 1; g < spec.humans; g++) guests.push(await client('Guest ' + idx + '.' + g));
    const seats = seatsFor(spec.humans, spec.bots);
    const code = await host.page.evaluate(async seats => { await WodMultiplayer.createLobby({ name: 'Modes', meta: { seatTypes: seats, gamePeriod: 'modern' } }); return WodMultiplayer.api.code; }, seats);
    for(const g of guests) await g.page.evaluate(code => WodMultiplayer.joinLobby(code, { playerId: wodEnsurePlayerId() }), code);
    await host.page.waitForTimeout(1500);
    await host.page.evaluate(seats => { const built = wodMpBuildLobbyMetaFromSetup(); Object.assign(window.wodMpRoomMeta, built); wodMpEnsureDefaultSeatTypes(window.wodMpRoomMeta); window.wodMpRoomMeta.seatTypes = seats; WodMultiplayer.sendLobbyMeta(window.wodMpRoomMeta); }, seats);
    await host.page.waitForTimeout(800);
    await applyMap(host, spec);
    if(spec.edits) {
        // lobby edits with the guest present: each makes a valid preview the guest is told about
        res.edits = [];
        for(const e of spec.edits) {
            const { seats: se, burst, ...rest } = e;
            if(se) { await idle(host); await host.page.evaluate(se => wodMpApplyLayoutCounts(se[0], se[1]), se); await host.page.waitForTimeout(1200); await ready(host); spec.bots = se[1]; }
            if(burst) {
                const list = [];
                for(const b of burst) list.push(Object.assign(spec, b) && Object.assign({}, spec));
                await applyMap(host, null, list);
            }
            Object.assign(spec, rest);
            if(Object.keys(rest).length) await applyMap(host, spec);
            const st = await previewStats(host, spec.humans + spec.bots);
            checkStats(st, spec, tag + ' edit ' + JSON.stringify(e));
            await guests[0].page.waitForFunction(b => window.wodMpRoomMeta && (window.wodMpRoomMeta.mapBalance !== false) === b, spec.balance, { timeout: 15000 });
            const guestSees = await guests[0].page.evaluate(() => ({ balance: window.wodMpRoomMeta.mapBalance !== false, seats: (window.wodMpRoomMeta.seatTypes || []).join(',') }));
            res.edits.push({ e, typeBad: st.typeBad, towns: st.towns, land: st.land, guestSees });
        }
    }
    // (the menu's background battle must not run behind the lobby: it simulated on the state previews are made in)
    const behind = await Promise.all([host, ...guests].map(c => c.page.evaluate(() => !!gameData.menuAttractMode || !!menuDemoAnimId)));
    assert(behind.every(b => !b), tag + ': no menu battle running behind the lobby ' + JSON.stringify(behind));
    const pre = await previewStats(host, spec.humans + spec.bots);
    checkStats(pre, spec, tag + ' preview');
    // every player starts with the same army
    const armies = pre.owners.map(o => JSON.stringify(Object.entries(pre.army[o] || {}).sort()));
    if(Object.keys(pre.army).length) assert(armies.every(a => a === armies[0]), tag + ': same starting army ' + JSON.stringify(pre.army));
    res.preview = { symMismatch: pre.typeBad + '/' + pre.pairs, land: pre.land, towns: pre.towns };
    const st = await launch(host, guests);
    assert(st, tag + ': every client is playing after launch');
    const sigs = await Promise.all([host, ...guests].map(c => sig(c.page)));
    for(const s of sigs) assert.deepEqual(s, sigs[0], tag + ': every client has the host map');
    const live = await previewStats(host, spec.humans + spec.bots);
    checkStats(live, spec, tag + ' launched');
    const p0 = await Promise.all([host, ...guests].map(c => positions(c.page)));
    // every human orders a few troops across their own land (a guest's order travels to the host)
    const orders = await Promise.all([host, ...guests].map(orderTroops));
    res.orders = orders.map(o => o.me + ':' + o.uids.length);
    for(const o of orders) assert(o.uids.length > 0, tag + ': player ' + o.me + ' has troops to order ' + JSON.stringify(o));
    // (an AI with no land route to its enemy, on continents or islands, needs longer to get going)
    res.simSeconds = await waitSim(host, (spec.watch || (spec.bots && /continents|archipelago/.test(spec.shape) ? 45000 : 14000)) / 1000);
    assert(res.simSeconds, tag + ': the match clock advances on the host');
    const p1 = await Promise.all([host, ...guests].map(c => positions(c.page)));
    const st1 = await Promise.all([host, ...guests].map(playing));
    const hostMoved = moved(p0[0], p1[0]);
    res.hostMoved = hostMoved;
    res.guestApplies = st1.slice(1).map(x => x.applies);
    for(const o of orders) {
        // the host's simulation carried out the order; every client shows it
        const went = o.uids.filter(uid => p0[0][uid] && p1[0][uid] && (p0[0][uid].x !== p1[0][uid].x || p0[0][uid].y !== p1[0][uid].y));
        assert(went.length > 0, tag + ': player ' + o.me + "'s order is carried out by the host " + JSON.stringify(o));
        for(let g = 0; g < guests.length; g++) {
            const seen = o.uids.filter(uid => p0[g + 1][uid] && p1[g + 1][uid] && (p0[g + 1][uid].x !== p1[g + 1][uid].x || p0[g + 1][uid].y !== p1[g + 1][uid].y));
            assert(seen.length > 0, tag + ': guest ' + (g + 1) + ' sees player ' + o.me + "'s troops move");
        }
    }
    for(let g = 0; g < guests.length; g++)
        assert(st1[g + 1].applies > st[g + 1].applies + 5, tag + ': guest ' + (g + 1) + ' keeps receiving the battle ' + JSON.stringify(st1));
    // AI seats play (their troops move or new ones appear)
    for(let s = spec.humans + 1; s <= spec.humans + spec.bots; s++) assert((hostMoved[s] || 0) > 0, tag + ': AI seat ' + s + ' plays ' + JSON.stringify(hostMoved));
    if(spec.guestLeaves && guests.length) {
        // a guest leaves mid-match: the AI takes its seat and the battle goes on for the rest
        const leaver = guests[guests.length - 1], slot = (await playing(leaver)).slot;
        await leaver.page.evaluate(() => WodMultiplayer.leaveLobby());
        await closeClient(leaver); guests.pop();
        await host.page.waitForTimeout(6000);
        const after = await host.page.evaluate(slot => ({ ai: (gameData.mp.aiControlledSlots || []).includes(slot), forfeited: [...(gameData.mp.forfeitedSlots || [])], playing: gameState === 'PLAYING', towns: gameData.cities.filter(c => c.owner === slot).length }), slot);
        res.guestLeft = after;
        assert(after.playing && (after.ai || after.forfeited.includes(slot)), tag + ': a guest leaving hands its seat to the AI or concedes ' + JSON.stringify(after));
        const q0 = await positions(host.page); await host.page.waitForTimeout(8000); const q1 = await positions(host.page);
        assert(Object.values(moved(q0, q1)).reduce((a, b) => a + b, 0) > 0, tag + ': the battle goes on after a guest leaves');
    }
    if(spec.hostLeaves && guests.length >= 1) {
        // the host leaves: a guest takes over hosting, the others keep receiving the battle
        await host.page.evaluate(() => WodMultiplayer.leaveLobby());
        await closeClient(host);
        let newHost = null;
        for(let i = 0; i < 20 && !newHost; i++) {
            await guests[0].page.waitForTimeout(2000);
            const s = await Promise.all(guests.map(playing));
            const k = s.findIndex(x => x.host);
            if(k >= 0) newHost = guests[k];
        }
        assert(newHost, tag + ': a guest takes over hosting');
        const others = guests.filter(g => g !== newHost);
        const a0 = await Promise.all(others.map(playing)), r0 = await positions(newHost.page);
        await newHost.page.waitForTimeout(12000);
        const a1 = await Promise.all(others.map(playing)), r1 = await positions(newHost.page);
        res.hostLeft = { others: others.length, applies: a1.map((x, i) => x.applies - a0[i].applies) };
        assert(Object.values(moved(r0, r1)).reduce((a, b) => a + b, 0) > 0, tag + ': the new host runs the battle');
        for(let i = 0; i < others.length; i++) assert(a1[i].applies > a0[i].applies + 3, tag + ': guests keep receiving from the new host ' + JSON.stringify(res.hostLeft));
        for(const g of guests) await closeClient(g);
    } else {
        await closeClient(host);
        for(const g of guests) await closeClient(g);
    }
    return res;
}
const MATRIX = [
    // one against one
    { humans: 2, bots: 0, shape: 'island', size: 60, towns: 2, balance: true },
    { humans: 2, bots: 0, shape: 'archipelago', size: 60, towns: 3, balance: false },
    { humans: 1, bots: 1, shape: 'rectangle', size: 40, towns: 2, balance: false },
    { humans: 1, bots: 1, shape: 'continents', size: 60, towns: 2, balance: true },
    // three players
    { humans: 3, bots: 0, shape: 'continents', size: 60, towns: 2, balance: true },
    { humans: 3, bots: 0, shape: 'ring', size: 60, towns: 2, balance: false },
    { humans: 2, bots: 1, shape: 'archipelago', size: 60, towns: 2, balance: true, watch: 45000 },
    { humans: 2, bots: 1, shape: 'continents', size: 60, towns: 2, balance: false },
    { humans: 1, bots: 2, shape: 'forest', size: 60, towns: 3, balance: true },
    // four players
    { humans: 4, bots: 0, shape: 'archipelago', size: 80, towns: 2, balance: true },
    { humans: 4, bots: 0, shape: 'desert', size: 60, towns: 2, balance: false, hostLeaves: true },
    { humans: 2, bots: 2, shape: 'continents', size: 60, towns: 2, balance: false, guestLeaves: true },
    { humans: 3, bots: 1, shape: 'island', size: 60, towns: 2, balance: true, guestLeaves: true, hostLeaves: true },
    { humans: 1, bots: 3, shape: 'mountain', size: 40, towns: 4, balance: false },
    { humans: 1, bots: 3, shape: 'archipelago', size: 40, towns: 2, balance: true, watch: 45000 },
    // lobby edits with a guest present: Balance off and on, towns per player, seats (player count) changed
    { humans: 2, bots: 1, shape: 'island', size: 60, towns: 2, balance: true, earlyLobby: true,
        edits: [{ balance: false }, { towns: 3 }, { seats: [2, 0] }, { seats: [2, 2], balance: true }, { shape: 'archipelago' }, { towns: 1, balance: false },
            { burst: [{ shape: 'ring' }, { balance: true }, { towns: 2 }, { shape: 'desert', balance: false }] }] }
];
(async () => {
    await startRelay(); await new Promise(r => server.listen(0, '127.0.0.1', r)); url = 'http://127.0.0.1:' + server.address().port; browser = await H.launchBrowser();
    const results = [];
    let failed = null;
    try {
        for(let i = 0; i < MATRIX.length; i++) {
            if(only && !only.has(i)) continue;
            const t0 = Date.now();
            const r = await match(Object.assign({}, MATRIX[i]), i);
            r.seconds = Math.round((Date.now() - t0) / 1000);
            results.push(r);
            console.log(JSON.stringify(r));
            assert.deepEqual(errors, [], 'no page errors after ' + r.tag);
        }
    } catch(e) { failed = e; }
    if(badBorders.length) console.log('BAD BORDER CALLS ' + JSON.stringify(badBorders, null, 1));
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, errors, badBorders }, null, 2));
    await browser.close(); relay.kill(); server.close();
    if(!failed && badBorders.length) failed = new Error('border lines drawn with no size or off-map points: ' + JSON.stringify(badBorders).slice(0, 1500));
    if(failed) { console.log('FAILED', failed.stack); console.log(relayLog.slice(-1500)); process.exit(1); }
    console.log('all ' + results.length + ' matches passed');
    process.exit(0);
})().catch(e => { console.log('CRASH', e.stack); process.exit(1); });
