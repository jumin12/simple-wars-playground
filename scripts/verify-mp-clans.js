'use strict';
// Multiplayer wins, rewards, clans and clan wars against the real relay, in real game pages.
//  1. A 1v1 played to a conquest win: both players see the right end screen; the winner and the loser get the same
//     rewards a single-player match gives (match gold, a battle won, match stats, achievements checked); the relay
//     records the result on both profiles and on the player leaderboard.
//  2. Clans: create (name, emblem, public or private), join a public clan from the list, join a private one by code
//     only, membership and clan shown on the leaderboard, membership kept across a relay restart and a new session.
//  3. Clan wars: the queue sizes of both tiers are shown before joining; 1v1 and 2v2 wars are matched, set up and
//     started on their own; a win is recorded in clan stats and the clan leaderboard; a side that leaves early loses.
// Usage: node scripts/verify-mp-clans.js [--only win,clans,wars]
const H = require('./lib/harness');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert/strict'), { fork } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'output/mp-clans');
fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7) || (process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : '');
const want = phase => !ONLY || ONLY.split(',').includes(phase);
const dataDir = fs.mkdtempSync(path.join(OUT, 'relay-')), errors = [], results = {};
let relay, relayPort, relayLog = '', rpcId = 0;
const requests = new Map();
const harness = path.join(OUT, 'relay.cjs');
fs.writeFileSync(harness, `require(${JSON.stringify(path.join(ROOT, 'server/index.js'))});const p=require(${JSON.stringify(path.join(ROOT, 'server/profiles.js'))});process.on('message',async m=>{try{let result;if(m.action==='profile')result=p.exportProfile(m.playerId);else if(m.action==='flush'){await p.flush();result=true;}process.send({id:m.id,result});}catch(e){process.send({id:m.id,error:e.message});}});`);
async function startRelay() {
    if(!relayPort) { const probe = http.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); relayPort = probe.address().port; await new Promise(r => probe.close(r)); }
    relay = fork(harness, [], { cwd: ROOT, env: { ...process.env, PORT: String(relayPort), DATABASE_URL: '', STEAM_PURCHASES_ENABLED: '0', WOD_DATA_DIR: dataDir, WOD_CW_SETUP_MS: '90000', WOD_MP_GRACE_MS: '3000' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    relay.stdout.on('data', b => relayLog += b); relay.stderr.on('data', b => relayLog += b);
    relay.on('message', m => { const q = requests.get(m.id); if(q) { requests.delete(m.id); m.error ? q.reject(Error(m.error)) : q.resolve(m.result); } });
    for(let i = 0; i < 100; i++) { try { const r = await fetch('http://127.0.0.1:' + relayPort + '/health'); if(r.ok) return; } catch(_) {} await new Promise(r => setTimeout(r, 50)); }
    throw Error('Relay failed: ' + relayLog);
}
async function stopRelay() { if(!relay) return; const old = relay; relay = null; await new Promise(resolve => { old.once('exit', resolve); old.kill('SIGTERM'); }); }
function rpc(action, payload = {}) { return new Promise((resolve, reject) => { const id = ++rpcId; requests.set(id, { resolve, reject }); relay.send({ id, action, ...payload }); }); }
const server = H.createStaticServer();
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
    await startRelay();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const url = 'http://127.0.0.1:' + server.address().port, browser = await H.launchBrowser();
    const clients = [];
    async function client(name, storageState) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(storageState ? { storageState } : {}) });
        await context.addInitScript(ws => { window.WOD_MP_WS_URL = ws; window.__clanLog = []; addEventListener('wod-mp-Clan', e => window.__clanLog.push(e.detail)); }, 'ws://127.0.0.1:' + relayPort);
        const page = await context.newPage();
        page.on('pageerror', e => errors.push(name + ': ' + e.stack));
        page.on('console', m => { if(m.type() === 'error' && !/net::ERR|Failed to load resource/.test(m.text())) errors.push(name + ' console: ' + m.text()); });
        await page.goto(url + '/');
        await page.waitForFunction(() => typeof wodProgress === 'object' && typeof WodMultiplayer === 'object' && WodMultiplayer.api.registered && !window._wodBootBusy, null, { timeout: 120000 });
        await page.evaluate(name => { wodDismissChangelogPopup(); showPanel('multiplayer'); wodMpWireLobbyUi(); document.getElementById('mpDisplayName').value = name; wodProgress.profile.mpDisplayName = name; void wodMpRegisterWithServer(); }, name);
        await page.waitForFunction(name => wodProgress.profile.mpDisplayName === name && WodMultiplayer.api.registered, name);
        const c = { name, context, page, id: await page.evaluate(() => wodEnsurePlayerId()) };
        clients.push(c);
        return c;
    }
    const shot = (c, file) => c.page.screenshot({ path: path.join(OUT, file) });
    // A small two-town-per-side map that makes the match start at once, with real lobby and launch code.
    async function launchTinyMatch(host, guests, opts = {}) {
        await host.page.evaluate(async () => { await wodMpWaitForLobbyPreviewIdle(90000); wodMpAbortLobbyPreviewJobs(); wodMpIsLobbyPreviewHost = () => false; wodIsMapPreviewGenerating = () => false; });
        const init = await host.page.evaluate(opts => {
            const slots = opts.slots || [1, 2];
            pauseMenuBackgroundBattle(); wodPrepareForNewMatch({ keepLiveMap: true }); WOD.makeBlankMap(20);
            Object.assign(gameData, { entities: [], cities: [], bridges: [], hospitals: [], forts: [], constructionJobs: [], roads: [], aiCount: 0 });
            gameData.alliances = opts.alliances || [];
            const seatTypes = [1, 2, 3, 4].map(s => slots.includes(s) ? 'human' : 'closed');
            gameData.mp = { enabled: true, isHost: true, localSlot: 1, humanSlots: slots.slice(), factionSlots: slots.slice(), seatTypes, connectedSlots: slots.slice(), maxLobbySlots: 4, allReady: false, playerPublic: window.wodMpRoomMeta.playerPublic };
            const spots = { 1: [-8, -3], 2: [8, 3], 3: [-8, 3], 4: [8, -3] };
            for(const h of gameData.hexList) { h.type = 'grass'; h.owner = 0; h.cityId = null; }
            for(const h of gameData.hexList) { let best = 0, bd = 1e9; for(const s of slots) { const [q, r] = spots[s], d = Math.abs(h.q - q) + Math.abs(h.r - r); if(d < bd) { bd = d; best = s; } } h.owner = best; }
            for(const s of slots) {
                const [q, r] = spots[s], h = gameData.hexes[q + ',' + r];
                h.type = 'urban'; h.cityId = 'town' + s;
                gameData.cities.push({ id: h.cityId, name: 'Town ' + s, owner: s, q: h.q, r: h.r, x: h.x, y: h.y, hp: 1000, maxHp: 1000 });
                createUnitAt('light', h.x + 20, h.y, s, { startSpawn: true });
            }
            gameData.mapShape = 'continent'; gameData._matchReadyForEndChecks = true; gameData.money = 10000; gameData.manpower = 8000;
            return wodMpBuildInitPayload();
        }, opts);
        await host.page.evaluate(p => { window.__tinyInit = p; wodMpPrepareHostLaunchPayload = async () => window.__tinyInit; wodMpCommittedIsCurrentForMeta = () => true; }, init);
        if(!opts.auto) await host.page.evaluate(() => document.getElementById('mpBtnGlLaunch').onclick());
        await Promise.all([host, ...guests].map(c => c.page.waitForFunction(() => gameState === 'PLAYING' && gameData.mp?.allReady, null, { timeout: 60000 })));
    }
    // The host's ledger: a minute of play with damage on both sides (the match-gold rules need both).
    const playedAMinute = host => host.page.evaluate(() => {
        const l = wodBattleLedger(); l.activeSeconds = 130; l.seconds = 130;
        for(const o of gameData.mp.humanSlots) { const row = l.byOwner[o] ||= {}; row.damageDealt = 40; row.unitsDestroyed = 1; row.unitsBuiltLight = 2; }
        wodMpHostEmitSnapshot();
    });
    // The host takes every town of the given seats and destroys their units.
    const conquer = (host, losers) => host.page.evaluate(losers => {
        for(const c of gameData.cities) if(losers.includes(c.owner)) { const h = gameData.hexes[c.q + ',' + c.r]; c.owner = 1; if(h) h.owner = 1; }
        for(const u of gameData.entities) if(losers.includes(u.owner)) u.hp = 0;
        setGameSpeed(1, true);
    }, losers);
    const endState = c => c.page.evaluate(() => ({
        ended: !!gameData._campaignEnded, title: document.getElementById('campaignSummaryTitle')?.textContent || '',
        gold: gameData._lifetimeMatch?.goldReward?.amount ?? null, goldWhy: gameData._lifetimeMatch?.goldReward?.ineligibleReason || '',
        outcome: gameData._lifetimeMatch?.outcome || '', battlesWon: wodProgress.lifetime.battlesWon || 0, wallet: gameData.gold | 0,
    }));
    const backToMenu = async cs => { for(const c of cs) await c.page.evaluate(() => { try { returnToMenu(); } catch(e) {} }); };

    try {
        // ---------------------------------------------------------------- 1. a 1v1 won by conquest
        if(want('win')) {
            const host = await client('Win Host'), guest = await client('Win Guest');
            const before = { host: await endState(host), guest: await endState(guest) };
            await host.page.evaluate(() => WodMultiplayer.createLobby({ name: 'Win test', password: '', meta: { seatTypes: ['human', 'human', 'closed', 'closed'], gamePeriod: 'modern' } }));
            const code = await host.page.evaluate(() => WodMultiplayer.api.code);
            await guest.page.evaluate(code => wodMpJoinWithPassword(code, false, { playerId: wodEnsurePlayerId() }), code);
            await host.page.waitForFunction(() => (window.wodMpRoomMeta?.occupiedSlots || []).length === 2, null, { timeout: 20000 });
            await launchTinyMatch(host, [guest]);
            await playedAMinute(host);
            await guest.page.waitForFunction(() => wodBattleLedger().activeSeconds >= 130, null, { timeout: 20000 });
            await conquer(host, [2]);
            await Promise.all([host, guest].map(c => c.page.waitForFunction(() => gameData._campaignEnded, null, { timeout: 30000 })));
            await sleep(800);
            const after = { host: await endState(host), guest: await endState(guest) };
            results.win = { before, after };
            await shot(host, 'win-host.png'); await shot(guest, 'win-guest.png');
            assert(/victory/i.test(after.host.title) && after.host.outcome === 'victory', 'the host sees its victory: ' + JSON.stringify(after.host));
            assert(/defeat/i.test(after.guest.title) && after.guest.outcome === 'defeat', 'the guest sees its defeat: ' + JSON.stringify(after.guest));
            assert(after.host.gold > 0 && after.host.wallet === before.host.wallet + after.host.gold, 'the winner is paid match gold: ' + JSON.stringify(after.host));
            assert(after.guest.gold > 0 && after.guest.wallet === before.guest.wallet + after.guest.gold, 'the loser is paid match gold for a defeat, as in single player: ' + JSON.stringify(after.guest));
            assert(after.host.gold > after.guest.gold, 'a win pays more than a defeat');
            assert.equal(after.host.battlesWon, before.host.battlesWon + 1, 'a multiplayer win counts as a battle won');
            assert.equal(after.guest.battlesWon, before.guest.battlesWon, 'a defeat does not');
            // the relay's record, on both profiles and the leaderboard, and back on each client
            await rpc('flush');
            const hp = await rpc('profile', { playerId: host.id }), gp = await rpc('profile', { playerId: guest.id });
            assert.deepEqual([hp.multiplayer.wins, hp.multiplayer.losses, gp.multiplayer.wins, gp.multiplayer.losses], [1, 0, 0, 1], 'the relay recorded the result once on each profile');
            await host.page.waitForFunction(() => wodProgress.multiplayer.wins === 1, null, { timeout: 20000 });
            await guest.page.waitForFunction(() => wodProgress.multiplayer.losses === 1, null, { timeout: 20000 });
            const lb = await host.page.evaluate(() => new Promise(res => { addEventListener('wod-mp-Leaderboard', e => res(e.detail.rows), { once: true }); WodMultiplayer.requestLeaderboard('wins'); }));
            const row = lb.find(r => r.playerId === host.id);
            assert(row && row.stats.wins >= 1, 'the winner is on the leaderboard with the win');
            await backToMenu([host, guest]);
            for(const c of [host, guest]) await c.context.close();
            clients.length = 0;
            console.log('win: victory and defeat screens, gold ' + after.host.gold + '/' + after.guest.gold + ', battle won, relay record and leaderboard ok');
        }
        // relay messages seen by a page: wait for one, then clear the log
        const clanMsg = (c, type, pred) => c.page.waitForFunction(([type, pred]) => { const f = pred ? new Function('m', 'return ' + pred) : () => true; const i = window.__clanLog.findIndex(m => m.t === type && f(m)); if(i < 0) return null; return window.__clanLog.splice(i, 1)[0]; }, [type, pred || ''], { timeout: 30000 }).then(h => h.jsonValue());
        // (back on the menu after a match the relay link is closed until Multiplayer is opened again, as for a player)
        const online = async c => { await c.page.evaluate(() => { if(gameState === 'MENU' && document.getElementById('multiplayerPanel').classList.contains('hidden')) showPanel('multiplayer'); }); await c.page.waitForFunction(() => WodMultiplayer.api.socketOpen && WodMultiplayer.api.registered, null, { timeout: 30000 }); };
        const send = async (c, msg) => { await online(c); await c.page.evaluate(msg => { window.__clanLog.length = 0; WodMultiplayer.clanSend(msg); }, msg); };
        const tab = async (c, id) => { await c.page.evaluate(id => { if(document.getElementById('multiplayerPanel').classList.contains('hidden')) showPanel('multiplayer'); wodMpSwitchHubTab(id); }, id); await online(c); };

        // ---------------------------------------------------------------- 0a. clans in the database (as on the live relay)
        if(want('db')) {
            const { PGlite } = require('../server/node_modules/@electric-sql/pglite'), { createClans } = require('../server/clans');
            const dir = fs.mkdtempSync(path.join(OUT, 'pg-')), noFiles = fs.mkdtempSync(path.join(OUT, 'nofile-'));
            let clock = Date.UTC(2026, 10, 22);
            const wins = { P2: 9, P3: 3 };  // multiplayer wins, for ranking members and the normal-play board
            const profilesStub = { getProfile: id => ({ id }), computeCombinedStats: p => ({ wins: wins[p.id] | 0, kills: (wins[p.id] | 0) * 10, losses: 4, defeats: 2, gamesPlayed: 12 }) };
            const open = async () => { const db = new PGlite(dir); const pool = { query: (q, v) => db.query(q, v) }; const store = createClans({ dataDir: noFiles, pool, profiles: profilesStub, nameOf: id => id, isOnline: () => false, now: () => clock }); await store.init(); return { db, store }; };
            let { db, store } = await open();
            const red = store.create('P1', { name: 'Db Reds', emblem: 'f:it', visibility: 'private' }).clan;
            const blue = store.create('P2', { name: 'Db Blues', emblem: 'p:anchor', visibility: 'public' }).clan;
            // a public clan is joined at once; a private one is listed and searchable, but takes an application
            assert(store.join('P9', { clanId: blue.id }).joined, 'a public clan is joined at once');
            assert(store.list('db reds', 'P5').clans.some(c => c.id === red.id && c.visibility === 'private'), 'a private clan is found by search');
            // the queue: at most 3 applicants from search and 2 invited ones (friends or the invite code) at a time
            for(const p of ['P10', 'P11', 'P12']) assert(store.join(p, { clanId: red.id }).applied, p + ' applies from search');
            assert.match(store.join('P13', { clanId: red.id }).msg, /queue is full/);
            for(const p of ['P20', 'P21']) assert(store.join(p, { code: red.code }).applied, p + ' applies with the invite code');
            assert.match(store.join('P22', { code: red.code }).msg, /queue is full/);
            assert.equal(store.clanOf('P10'), null, 'an applicant is not a member yet');
            assert.match(store.answerApplication('P10', 'P11', true).msg, /Only the clan leader/);
            assert(store.answerApplication('P1', 'P10', true).approved, 'the leader approves');
            assert.equal(store.clanOf('P10').id, red.id);
            assert(store.join('P13', { clanId: red.id }).applied, 'approving frees a place in the queue');
            assert(store.cancelApplication('P11', red.id).ok, 'an applicant may withdraw');
            assert(!store.answerApplication('P1', 'P12', false).approved && !store.clanOf('P12'), 'the leader declines');
            // members invite friends; a friend who accepts waits as an invited applicant (both invited places are full here)
            assert(store.inviteFriend('P10', 'P30', () => true).ok, 'a member invites a friend');
            assert.equal(store.pendingFor('P30').invitations[0].clan.id, red.id, 'the friend sees the invitation');
            assert.match(store.answerInvite('P30', red.id, true).msg, /queue is full/);
            store.answerApplication('P1', 'P20', false);
            assert(store.answerInvite('P30', red.id, true).applied, 'accepted: queued for the leader');
            assert.equal(store.detail(store.get(red.id), 'P1').applications.find(a => a.playerId === 'P30').invitedByName, 'P10', 'the leader sees who invited them');
            assert(store.inviteFriend('P9', 'P31', () => true).ok && store.answerInvite('P31', blue.id, true).joined, 'a friend invited to a public clan joins at once');
            // clan-war stats: wins by tier, defeats, kills and losses; the clan-war and normal-play leaderboards
            store.recordWar({ warId: 'W-db', tier: '2v2', sides: [{ clanId: red.id, outcome: 'won', players: ['P1', 'P10'], kills: 40, losses: 12 }, { clanId: blue.id, outcome: 'lost', players: ['P2', 'P9'], kills: 12, losses: 40 }] });
            store.recordWar({ warId: 'W-db2', tier: '1v1', sides: [{ clanId: red.id, outcome: 'lost', players: ['P10'], kills: 5, losses: 9 }, { clanId: blue.id, outcome: 'won', players: ['P2'], kills: 9, losses: 5 }] });
            const rs = store.get(red.id).stats;
            assert.deepEqual([rs.wins, rs.byTier['2v2'].wins, rs.byTier['1v1'].wins, rs.defeats, rs.kills, rs.losses], [1, 1, 0, 1, 45, 21]);
            assert.equal(store.leaderboard('war', 'kills').rows[0].id, red.id, 'clan-war board by kills');
            assert.equal(store.leaderboard('war', 'wins1v1').rows[0].id, blue.id, 'clan-war board by 1v1 wins');
            const normal = store.leaderboard('normal', 'wins');
            assert.equal(normal.rows[0].id, blue.id, 'normal-play board: the members\' wins added up');
            assert.deepEqual(normal.rows[0].totals, { wins: 9, kills: 90, losses: 12, defeats: 6, gamesPlayed: 36 });
            // a leader gone for 60 days hands the clan to its highest-ranked active member
            assert.equal(store.get(red.id).leaderId, 'P1');
            clock += 59 * 86400000; store.touch('P10'); store.checkInactiveLeaders();
            assert.equal(store.get(red.id).leaderId, 'P1', 'not before 60 days');
            clock += 2 * 86400000; store.touch('P10'); store.checkInactiveLeaders();
            assert.equal(store.get(red.id).leaderId, 'P10', 'after 60 days the highest-ranked member leads');
            assert(store.get(red.id).chat.some(m => m.system && /60 days/.test(m.text)), 'the clan chat says why');
            const gone = store.create('P4', { name: 'Db Gone', emblem: 'p:star', visibility: 'public' }).clan;
            store.leave('P4');
            await store.flush(); await db.close();
            ({ db, store } = await open());
            const back = store.get(red.id);
            assert(back && back.members.length === 2 && back.leaderId === 'P10' && back.stats.kills === 45 && back.applications.some(a => a.playerId === 'P30') && back.code === red.code, 'a clan, its members, leader, queue and stats come back from the database');
            assert.equal(store.clanOf('P10').id, red.id, 'membership is found again by player');
            assert.equal(store.get(gone.id), null, 'a disbanded clan is deleted from the database');
            assert.equal(fs.readdirSync(noFiles).length, 0, 'with a database nothing is written to the relay disk');
            await db.close();
            results.db = true;
            console.log('db: public join, private apply, queue 3 search + 2 invited, approve/decline/withdraw, friend invites, war and normal boards, 60-day leader hand-over, saved in the database');
        }

        // ---------------------------------------------------------------- 0. war setup edge cases, straight on the relay
        if(want('protocol')) {
            const { WebSocket } = require('../server/node_modules/ws'), crypto = require('crypto'), peers = [];
            async function peer(n) {
                const socket = new WebSocket('ws://127.0.0.1:' + relayPort), messages = [];
                socket.on('message', raw => messages.push(JSON.parse(raw)));
                const wait = async (type, pred = () => true) => { for(let i = 0; i < 240; i++) { const at = messages.findIndex(m => m.t === type && pred(m)); if(at >= 0) return messages.splice(at, 1)[0]; await sleep(25); } throw Error('Missing ' + type + ': ' + JSON.stringify(messages.map(m => m.t))); };
                await wait('welcome');
                const send = m => socket.send(JSON.stringify(m));
                send({ t: 'register_player', playerId: 'WOD-CW0' + n + '-TEST', deviceSecret: crypto.randomBytes(32).toString('hex'), displayName: 'War Peer ' + n });
                const p = { socket, send, wait, messages, id: (await wait('registered')).playerId };
                peers.push(p);
                return p;
            }
            try {
                const [p1, p2, p3, p4] = [await peer(1), await peer(2), await peer(3), await peer(4)];
                p3.send({ t: 'cw_queue', tier: '1v1' });
                assert.match((await p3.wait('cw_error')).msg, /clan/i, 'no clan, no clan war');
                p1.send({ t: 'clan_create', name: 'Proto Reds', emblem: 'p:flame', visibility: 'public' }); await p1.wait('clan_info');
                p2.send({ t: 'clan_create', name: 'Proto Blues', emblem: 'f:fr', visibility: 'private' }); await p2.wait('clan_info');
                p3.send({ t: 'clan_create', name: 'Proto Greens', emblem: 'f:ie', visibility: 'public' }); await p3.wait('clan_info');
                // queueing from inside a lobby is refused
                p3.send({ t: 'create_lobby', name: 'busy', meta: { seatTypes: ['human', 'human', 'closed', 'closed'] } }); await p3.wait('joined');
                p3.send({ t: 'cw_queue', tier: '1v1' });
                assert.match((await p3.wait('cw_error')).msg, /lobby/i);
                p3.send({ t: 'leave' }); await p3.wait('left');
                // a war is matched; nobody but its own host can open its lobby
                p1.send({ t: 'cw_queue', tier: '1v1' }); p2.send({ t: 'cw_queue', tier: '1v1' });
                const m1 = await p1.wait('cw_match'), m2 = await p2.wait('cw_match');
                assert.equal(m1.role, 'host'); assert.equal(m2.role, 'guest'); assert.equal(m1.war.id, m2.war.id);
                p3.send({ t: 'create_lobby', name: 'hijack', cwWarId: m1.war.id, meta: {} });
                assert.match((await p3.wait('error')).msg, /no longer waiting/);
                p1.send({ t: 'create_lobby', name: 'war', password: m1.secret, cwWarId: m1.war.id, meta: { seatTypes: ['human', 'human', 'human', 'human'] } });
                const hostJoined = await p1.wait('joined');
                assert.deepEqual(hostJoined.meta.seatTypes, ['human', 'human', 'closed', 'closed'], 'a war lobby keeps the war\'s seats');
                const invite = await p2.wait('cw_join');
                // the war lobby is not in the public list, and nobody outside the war can join it
                p4.send({ t: 'list_lobbies' });
                assert(!(await p4.wait('lobby_list')).lobbies.some(l => l.id === invite.code), 'a war lobby is private');
                p4.send({ t: 'join_lobby', id: invite.code, password: invite.password, playerId: p4.id });
                assert.match((await p4.wait('error')).msg, /clan war/);
                p2.send({ t: 'join_lobby', id: invite.code, password: invite.password, seat: invite.seat, playerId: p2.id });
                assert.equal((await p2.wait('joined')).slot, 2);
                // the host's settings cannot change a war's seats
                p1.send({ t: 'lobby_meta', meta: { seatTypes: ['human', 'bot', 'bot', 'closed'] } });
                assert.deepEqual((await p1.wait('room_meta', m => m.meta.seatTypes)).meta.seatTypes.slice(0, 2), ['human', 'human']);
                // a player leaving the war lobby before the war starts calls it off for both
                p2.send({ t: 'leave' });
                assert.match((await p1.wait('cw_cancelled')).msg, /left the war lobby/);
                assert.match((await p2.wait('cw_cancelled')).msg, /left the war lobby/);
                await p1.wait('left');
                // both can queue again at once
                await sleep(200); p1.messages.length = 0;
                p1.send({ t: 'cw_status' });
                const status = await p1.wait('cw_status', m => !m.war);
                assert.equal(status.queued, null);
                // 2v2 is fought only as a party of two clanmates
                p1.send({ t: 'cw_queue', tier: '2v2' });
                assert.match((await p1.wait('cw_error')).msg, /party/i, 'no party, no 2v2');
                p1.send({ t: 'cw_party_invite', playerId: p2.id });
                assert.match((await p1.wait('cw_error')).msg, /members of your clan/, 'only clanmates can be invited');
                p4.send({ t: 'clan_join', clanId: (await (async () => { p4.send({ t: 'clan_list', query: 'Proto Reds' }); return (await p4.wait('clan_list')).clans[0].id; })()) });
                await p4.wait('clan_info', m => m.done === 'clan_join');
                p1.send({ t: 'cw_party_invite', playerId: p4.id });
                const pinv = await p4.wait('cw_party_invite');
                assert.equal(pinv.from, p1.id);
                p4.send({ t: 'cw_party_answer', from: p1.id, accept: true });
                await p1.wait('cw_status', m => m.party && m.party.members.length === 2);
                p4.send({ t: 'cw_queue', tier: '1v1' });
                assert.match((await p4.wait('cw_error')).msg, /party/, 'a party member cannot queue 1v1');
                p4.send({ t: 'cw_party_leave' });
                await p1.wait('cw_status', m => !m.party);
                // a matched player who is busy in another game declines, and the war is called off at once
                p1.send({ t: 'cw_queue', tier: '1v1' }); p2.send({ t: 'cw_queue', tier: '1v1' });
                const again = await p2.wait('cw_match');
                p2.send({ t: 'cw_decline', warId: again.war.id });
                assert.match((await p1.wait('cw_cancelled')).msg, /another game/);
                results.protocol = true;
                console.log('protocol: no-clan and in-lobby queueing refused, war lobby private and seat-locked, hijack refused, leaving before start calls the war off, 2v2 only as a party of clanmates');
            } finally { for(const p of peers) p.socket.close(); }
        }

        // ---------------------------------------------------------------- 2. clans
        if(want('clans')) {
            const leader = await client('Clan Leader'), recruit = await client('Clan Recruit'), loner = await client('Lone Wolf');
            // emblems drawn by the game are exactly the ones the relay accepts
            await send(leader, { t: 'clan_list' });
            const listed = await clanMsg(leader, 'clan_list');
            const drawn = await leader.page.evaluate(() => WOD_CLAN_EMBLEM_IDS);
            assert.deepEqual(drawn.slice().sort(), listed.emblems.slice().sort(), 'the game draws every emblem the relay accepts, and no other');
            // found a public clan through the Clan tab: name, a country flag, public
            await tab(leader, 'clan');
            await leader.page.locator('#clanNameInput').fill('Iron Wolves');
            await leader.page.locator('[data-etab="flags"]').click();
            await leader.page.locator('[data-emblem="f:de"]').click();
            await leader.page.locator('[data-vis="public"]').click();
            await leader.page.locator('#clanDescInput').fill('Casual clan for weekend wars.');
            await leader.page.waitForFunction(() => document.getElementById('clanDescCount').textContent === '29 / 200');
            await leader.page.locator('#clanSubmitBtn').click();
            await leader.page.waitForFunction(() => document.querySelector('#mpClanRoot .clan-hero h3')?.textContent === 'Iron Wolves', null, { timeout: 15000 });
            await shot(leader, 'clan-home.png');
            const home = await leader.page.evaluate(() => ({ emblem: WodClans.detail.emblem, vis: WodClans.detail.visibility, leader: WodClans.detail.youAreLeader, code: WodClans.detail.code, badge: document.getElementById('mpProfileClan').textContent }));
            assert.deepEqual([home.emblem, home.vis, home.leader], ['f:de', 'public', true]);
            assert.equal(await leader.page.locator('#mpClanRoot .clan-hero-desc').textContent(), 'Casual clan for weekend wars.', 'the clan page shows its description');
            assert(/^CLAN-[0-9A-F]{8}$/.test(home.code) && /Iron Wolves/.test(home.badge), JSON.stringify(home));
            // names are unique, emblems must be real ones, one clan at a time
            await send(loner, { t: 'clan_create', name: 'iron wolves', emblem: 'p:star', visibility: 'public' });
            assert.match((await clanMsg(loner, 'clan_error')).msg, /taken/);
            await send(loner, { t: 'clan_create', name: 'Odd Emblem', emblem: 'p:unicorn', visibility: 'public' });
            assert.match((await clanMsg(loner, 'clan_error')).msg, /emblem/);
            await send(leader, { t: 'clan_create', name: 'Second Clan', emblem: 'p:star', visibility: 'public' });
            assert.match((await clanMsg(leader, 'clan_error')).msg, /Leave your clan/);
            // a recruit finds the public clan in the list and joins it
            await tab(recruit, 'clan');
            await recruit.page.waitForFunction(() => [...document.querySelectorAll('#mpClanRoot .clan-list-row strong')].some(e => e.textContent === 'Iron Wolves'), null, { timeout: 15000 });
            await shot(recruit, 'clan-join.png');
            await recruit.page.locator('#mpClanRoot .clan-list-row', { hasText: 'Iron Wolves' }).locator('.clan-join-btn').click();
            await recruit.page.waitForFunction(() => document.querySelector('#mpClanRoot .clan-hero h3')?.textContent === 'Iron Wolves', null, { timeout: 15000 });
            await leader.page.waitForFunction(() => WodClans.detail && WodClans.detail.members === 2, null, { timeout: 15000 });
            // a private clan: listed and searchable, but players apply and its leader approves
            await send(loner, { t: 'clan_create', name: 'Night Owls', emblem: 'p:eagle', visibility: 'private' });
            const owls = (await clanMsg(loner, 'clan_info', 'm.done === "clan_create"')).clan;
            assert.equal(owls.visibility, 'private');
            await send(recruit, { t: 'clan_leave' }); await clanMsg(recruit, 'clan_info', 'm.done === "clan_leave"');
            await tab(recruit, 'clan');
            await recruit.page.locator('#clanSearchInput').fill('night');
            const owlRow = recruit.page.locator('#mpClanRoot .clan-list-row', { hasText: 'Night Owls' });
            await owlRow.locator('.clan-apply-btn').click();
            await recruit.page.waitForFunction(() => (WodClans.pending.applications || []).some(a => a.clan.name === 'Night Owls') && !WodClans.mine, null, { timeout: 15000 });
            await recruit.page.waitForFunction(() => document.querySelector('#mpClanRoot .clan-pending') && [...document.querySelectorAll('#mpClanRoot .clan-list-row')].some(r => /Night Owls/.test(r.textContent) && /Applied/.test(r.textContent)), null, { timeout: 15000 });
            await shot(recruit, 'clan-applied.png');
            await tab(loner, 'clan');
            await loner.page.waitForFunction(() => document.querySelector('#mpClanRoot .clan-apps .clan-approve') && document.querySelector('#mpTabClan .mp-tab-badge'), null, { timeout: 15000 });
            await shot(loner, 'clan-applications.png');
            await loner.page.locator('#mpClanRoot .clan-apps .clan-approve').first().click();
            await recruit.page.waitForFunction(() => WodClans.mine && WodClans.mine.name === 'Night Owls', null, { timeout: 15000 });
            // a member invites a friend; the friend accepts in the Clan tab and waits for the leader, who approves
            const friend = await client('Owl Friend');
            await recruit.page.evaluate(f => { wodProgress.profile.friends.push({ playerId: f.id, displayName: f.name }); wodClanRenderPane(); }, { id: friend.id, name: friend.name });
            await tab(recruit, 'clan');
            await recruit.page.locator('#mpClanRoot .clan-invite-btn').first().click();
            await recruit.page.waitForFunction(() => /Invited/.test(document.querySelector('#mpClanRoot .clan-invite-friends')?.textContent || ''), null, { timeout: 15000 });
            await tab(friend, 'clan');
            await friend.page.waitForFunction(() => document.querySelector('#mpClanRoot .clan-pending .clan-inv-accept'), null, { timeout: 15000 });
            await friend.page.locator('#mpClanRoot .clan-pending .clan-inv-accept').click();
            await friend.page.waitForFunction(() => (WodClans.pending.applications || []).some(a => a.clan.name === 'Night Owls' && a.kind === 'invite'), null, { timeout: 15000 });
            await loner.page.waitForFunction(() => [...document.querySelectorAll('#mpClanRoot .clan-app')].some(e => /Invited by Clan Recruit/.test(e.textContent)), null, { timeout: 15000 });
            await loner.page.locator('#mpClanRoot .clan-apps .clan-approve').first().click();
            await friend.page.waitForFunction(() => WodClans.mine && WodClans.mine.name === 'Night Owls', null, { timeout: 15000 });
            await friend.context.close(); clients.splice(clients.indexOf(friend), 1);
            // finding a clan: search by name, filter public or private, and page through long results (8 to a page)
            {
                const { WebSocket } = require('../server/node_modules/ws'), cr = require('crypto'), sockets = [];
                try {
                    for(let i = 1; i <= 9; i++) {
                        const ws = new WebSocket('ws://127.0.0.1:' + relayPort), got = [];
                        ws.on('message', raw => got.push(JSON.parse(raw)));
                        const until = async t => { for(let k = 0; k < 600 && !got.some(m => m.t === t); k++) await sleep(25); if(!got.some(m => m.t === t)) throw Error('no ' + t); };
                        await until('welcome');
                        ws.send(JSON.stringify({ t: 'register_player', playerId: 'WOD-SRC0' + i + '-TEST', deviceSecret: cr.randomBytes(32).toString('hex'), displayName: 'Search Founder ' + i }));
                        await until('registered');
                        ws.send(JSON.stringify({ t: 'clan_create', name: 'Search Test 0' + i, emblem: 'f:fr', visibility: i % 2 ? 'public' : 'private', description: 'Test clan number ' + i }));
                        await until('clan_info');
                        sockets.push(ws);
                    }
                    const seeker = await client('Clan Seeker');
                    await tab(seeker, 'clan');
                    await seeker.page.locator('#clanSearchInput').fill('search test');
                    await seeker.page.waitForFunction(() => /^9 clans matching/.test(document.querySelector('.clan-results-head')?.textContent || '') && document.querySelectorAll('#clanSearchResults .clan-list-row').length === 8 && /Page 1 \/ 2/.test(document.querySelector('.clan-page-label')?.textContent || ''), null, { timeout: 15000 });
                    assert(await seeker.page.locator('#clanSearchResults .clan-list-desc', { hasText: 'Test clan number' }).count() > 0, 'search results show descriptions');
                    await shot(seeker, 'clan-search.png');
                    await seeker.page.locator('.clan-page-next').click();
                    await seeker.page.waitForFunction(() => document.querySelectorAll('#clanSearchResults .clan-list-row').length === 1 && /Page 2 \/ 2/.test(document.querySelector('.clan-page-label').textContent) && document.querySelector('.clan-page-next').disabled, null, { timeout: 15000 });
                    await seeker.page.locator('.clan-page-prev').click();
                    await seeker.page.waitForFunction(() => document.querySelectorAll('#clanSearchResults .clan-list-row').length === 8, null, { timeout: 15000 });
                    await seeker.page.locator('[data-clan-filter="private"]').click();
                    await seeker.page.waitForFunction(() => /^4 private clans matching/.test(document.querySelector('.clan-results-head').textContent) && document.querySelectorAll('#clanSearchResults .clan-apply-btn').length === 4 && !document.querySelector('.clan-pager'), null, { timeout: 15000 });
                    await seeker.page.locator('#clanSearchInput').fill('search test 07');
                    await seeker.page.locator('[data-clan-filter="all"]').click();
                    await seeker.page.waitForFunction(() => document.querySelectorAll('#clanSearchResults .clan-list-row').length === 1 && /Search Test 07/.test(document.querySelector('#clanSearchResults').textContent), null, { timeout: 15000 });
                    await seeker.page.locator('#clanSearchInput').fill('zzz no such clan');
                    await seeker.page.waitForFunction(() => /No clans match/.test(document.querySelector('#clanSearchResults').textContent), null, { timeout: 15000 });
                    await seeker.context.close(); clients.splice(clients.indexOf(seeker), 1);
                } finally { for(const ws of sockets) ws.close(); }
            }
            // the player leaderboard shows each player's clan
            const lb = await leader.page.evaluate(() => new Promise(res => { addEventListener('wod-mp-Leaderboard', e => res(e.detail.rows), { once: true }); WodMultiplayer.requestLeaderboard('wins'); }));
            assert.equal((lb.find(r => r.playerId === leader.id) || {}).clan?.name, 'Iron Wolves', 'leaderboard rows carry the clan');
            assert.equal((lb.find(r => r.playerId === recruit.id) || {}).clan?.name, 'Night Owls');
            await tab(leader, 'rankings');
            await leader.page.waitForFunction(() => document.querySelector('#mpLeaderboardList .wod-clan-badge'), null, { timeout: 15000 });
            await leader.page.locator('#mpLbKind [data-lb-kind="clans"]').click();
            await leader.page.waitForFunction(() => { const names = [...document.querySelectorAll('#mpClanLeaderboardList .clan-lb-row .mp-lb-name')].map(e => e.textContent); return ['Iron Wolves', 'Night Owls'].every(n => names.some(t => t.startsWith(n))); }, null, { timeout: 15000 });
            await shot(leader, 'clan-leaderboard.png');
            await leader.page.locator('#mpClanLbKind [data-clan-board="normal"]').click();
            await leader.page.waitForFunction(() => WodClans.lb.kind === 'normal' && document.querySelectorAll('#mpClanLeaderboardList .clan-lb-row').length >= 2 && /Kills/.test(document.getElementById('mpClanLbSort').textContent) && !/1v1/.test(document.getElementById('mpClanLbSort').textContent), null, { timeout: 15000 });
            await shot(leader, 'clan-leaderboard-normal.png');
            // only a clan's leader holds its invite code: the Owls' member sees no code and no invite card
            await send(recruit, { t: 'clan_mine' });
            const memberView = (await clanMsg(recruit, 'clan_info')).clan;
            assert.equal(memberView.code, undefined, 'a member is not given the invite code');
            await send(loner, { t: 'clan_mine' });
            assert.equal((await clanMsg(loner, 'clan_info')).clan.code, owls.code, 'the leader is');
            await tab(recruit, 'clan');
            await recruit.page.waitForFunction(() => document.querySelector('#mpClanRoot .clan-invite-note') && !document.getElementById('clanInviteCode'), null, { timeout: 15000 });
            // clan chat: a member writes in the Clan tab; the leader, on another tab, gets it with an unread badge
            await tab(loner, 'wars');
            await recruit.page.locator('#clanChatInput').fill('Owls, ready for a 2v2 tonight?');
            await recruit.page.locator('#clanChatForm button').click();
            await recruit.page.waitForFunction(() => [...document.querySelectorAll('#clanChatList .clan-chat-msg--mine .clan-chat-text')].some(e => e.textContent === 'Owls, ready for a 2v2 tonight?'), null, { timeout: 15000 });
            await loner.page.waitForFunction(() => document.querySelector('#mpTabClan .mp-tab-badge')?.textContent === '1', null, { timeout: 15000 });
            await tab(loner, 'clan');
            await loner.page.waitForFunction(() => !document.querySelector('#mpTabClan .mp-tab-badge') && [...document.querySelectorAll('#clanChatList .clan-chat-text')].some(e => e.textContent === 'Owls, ready for a 2v2 tonight?'), null, { timeout: 15000 });
            await loner.page.locator('#clanChatInput').fill('<b>Yes</b> — queue at 8');
            await loner.page.keyboard.press('Enter');
            await recruit.page.waitForFunction(() => [...document.querySelectorAll('#clanChatList .clan-chat-text')].some(e => e.textContent === '<b>Yes</b> — queue at 8'), null, { timeout: 15000 });
            assert.equal(await recruit.page.locator('#clanChatList b').count(), 0, 'chat text is shown as text, never as markup');
            await shot(recruit, 'clan-chat.png');
            // a clan's chat stays inside it; empty messages and floods are refused
            await send(leader, { t: 'clan_chat', text: 'Wolves only' });
            await clanMsg(leader, 'clan_chat');
            await sleep(500);
            assert(!(await recruit.page.evaluate(() => (WodClans.detail.chat || []).some(m => m.text === 'Wolves only'))), 'another clan does not see it');
            await send(leader, { t: 'clan_chat', text: '   ' });
            assert.match((await clanMsg(leader, 'clan_error')).msg, /Type a message/);
            await send(leader, { t: 'clan_chat', text: 'one' }); await send(leader, { t: 'clan_chat', text: 'two' });
            assert.match((await clanMsg(leader, 'clan_error')).msg, /Slow down/);
            // the leader leaves: the longest-standing member takes over, with the code, and the chat says so
            await send(loner, { t: 'clan_leave' }); await clanMsg(loner, 'clan_info', 'm.done === "clan_leave"');
            await recruit.page.waitForFunction(() => WodClans.detail && WodClans.detail.youAreLeader && /^CLAN-/.test(WodClans.detail.code || '') && (WodClans.detail.chat || []).some(m => m.system && /now leads it/.test(m.text)), null, { timeout: 15000 });
            await recruit.page.waitForFunction(() => document.getElementById('clanInviteCode') && document.getElementById('clanEditBtn'), null, { timeout: 15000 });
            // membership and chat outlive a relay restart and a new session of the game
            const saved = await leader.context.storageState();
            await leader.context.close(); clients.splice(clients.indexOf(leader), 1);
            await rpc('flush'); await stopRelay(); await startRelay();
            const back = await client('Clan Leader', saved);
            assert.equal(back.id, leader.id, 'same player after restart');
            await back.page.waitForFunction(() => WodClans.mine && WodClans.mine.name === 'Iron Wolves' && /Iron Wolves/.test(document.getElementById('mpProfileClan').textContent), null, { timeout: 20000 });
            await tab(back, 'clan');
            await back.page.waitForFunction(() => [...document.querySelectorAll('#clanChatList .clan-chat-text')].some(e => e.textContent === 'Wolves only'), null, { timeout: 20000 });
            results.clans = { home, owls: { id: owls.id, visibility: owls.visibility } };
            for(const c of clients.splice(0)) await c.context.close();
            console.log('clans: create (flag emblem, public), unique names, list and join, private apply + leader approval in the UI, friend invite + approval, leader-only invite code, both clan boards, chat (badge, text-only, clan-only, limits), leader hand-over, kept after restart ok');
        }

        // ---------------------------------------------------------------- 3. clan wars
        if(want('wars')) {
            const a = await client('Wolf Alpha'), b = await client('Wolf Beta'), c = await client('Owl Gamma'), d = await client('Owl Delta');
            const found = async (p, name, emblem, vis) => { await send(p, { t: 'clan_create', name, emblem, visibility: vis }); return (await clanMsg(p, 'clan_info', 'm.done === "clan_create"')).clan; };
            const wolves = await found(a, 'Grey Wolves', 'p:wolf', 'public'), owls = await found(c, 'Snow Owls', 'f:fi', 'private');
            await send(b, { t: 'clan_join', clanId: wolves.id }); await clanMsg(b, 'clan_info', 'm.done === "clan_join"');
            await send(d, { t: 'clan_join', code: owls.code }); await clanMsg(d, 'clan_info', 'm.done === "clan_apply"');
            await send(c, { t: 'clan_app_answer', playerId: d.id, approve: true }); await clanMsg(c, 'clan_info', 'm.done === "clan_approve"');
            await d.page.waitForFunction(() => WodClans.mine && WodClans.mine.name === 'Snow Owls', null, { timeout: 15000 });
            for(const p of [a, b, c, d]) await tab(p, 'wars');
            // the queue sizes show before joining
            await a.page.waitForFunction(() => document.querySelector('[data-tier-count="1v1"]')?.textContent === '0' && document.querySelector('[data-tier-count="2v2"]')?.textContent === '0', null, { timeout: 15000 });
            await c.page.locator('.cw-join[data-tier="1v1"]').click();
            await a.page.waitForFunction(() => document.querySelector('[data-tier-count="1v1"]')?.textContent === '1', null, { timeout: 15000 });
            await shot(a, 'wars-queue-counts.png');
            await c.page.waitForFunction(() => WodClans.cw.queued === '1v1' && document.querySelector('.cw-tier.is-queued .cw-searching'), null, { timeout: 15000 });
            // a member of the same clan is not matched against its own clan
            await send(d, { t: 'cw_queue', tier: '1v1' });
            await a.page.waitForFunction(() => document.querySelector('[data-tier-count="1v1"]')?.textContent === '2', null, { timeout: 15000 });
            await send(d, { t: 'cw_leave_queue' });
            await a.page.waitForFunction(() => document.querySelector('[data-tier-count="1v1"]')?.textContent === '1', null, { timeout: 15000 });
            // 1v1: Alpha joins and the war is matched, set up on a generated balanced map, and started by itself
            await a.page.locator('.cw-join[data-tier="1v1"]').click();
            // (the war lobby, while it gets ready: its banner names the clans)
            await Promise.race([a, c].map(p => p.page.waitForSelector('#mpGlWarBanner:not([hidden]) .wod-clan-badge', { timeout: 60000 }).then(() => p))).then(p => shot(p, 'war-lobby.png')).catch(() => {});
            await Promise.all([a, c].map(p => p.page.waitForFunction(() => gameState === 'PLAYING' && gameData.mp?.allReady, null, { timeout: 180000 })));
            const war1 = await Promise.all([a, c].map(p => p.page.evaluate(() => ({ host: WodMultiplayer.api.isHost, slot: gameData.mp.localSlot, humans: gameData.mp.humanSlots, cities: gameData.cities.length, alliances: gameData.alliances, cw: window.wodMpRoomMeta.cw && window.wodMpRoomMeta.cw.tier, balance: window.wodMpRoomMeta.mapBalance }))));
            assert.deepEqual(war1.map(w => w.cw), ['1v1', '1v1']);
            assert.deepEqual(war1[0].humans, [1, 2]); assert(war1[0].cities >= 2 && war1[0].alliances.length === 0 && war1[0].balance !== false, JSON.stringify(war1));
            const host1 = war1[0].host ? a : c, guest1 = host1 === a ? c : a, hostSlot = war1[host1 === a ? 0 : 1].slot;
            assert.equal(hostSlot, 1, 'the war host plays seat 1');
            await shot(host1, 'war1-playing.png');
            // the host's side (whoever that is) conquers the other
            await playedAMinute(host1);
            await host1.page.evaluate(() => { gameData._lifetimeStatsByOwner = { 1: { enemyTroopKills: 30, enemyTankKills: 2, ownTroopLosses: 7 }, 2: { enemyTroopKills: 7, ownTroopLosses: 30, ownTankLosses: 2 } }; wodMpHostEmitSnapshot(); });
            await sleep(400);
            await conquer(host1, [2]);
            await Promise.all([a, c].map(p => p.page.waitForFunction(() => gameData._campaignEnded, null, { timeout: 30000 })));
            const winnerClan = host1 === a ? 'Grey Wolves' : 'Snow Owls', loserClan = host1 === a ? 'Snow Owls' : 'Grey Wolves';
            const res1 = await clanMsg(a, 'cw_result');
            assert.deepEqual(res1.sides.map(s => [s.clan.name, s.outcome]).sort(), [[winnerClan, 'won'], [loserClan, 'lost']].sort(), 'the war result names the winning clan');
            for(const p of [a, c]) await p.page.evaluate(() => returnToMenu());
            // clan stats and the clan leaderboard
            await send(a, { t: 'clan_leaderboard', kind: 'war', sort: 'wins' });
            const board1 = (await clanMsg(a, 'clan_leaderboard')).rows;
            assert.equal(board1[0].name, winnerClan, 'the winner leads the clan-war leaderboard');
            const wRow = board1.find(r => r.name === winnerClan), lRow = board1.find(r => r.name === loserClan);
            assert.deepEqual([wRow.stats.wins, wRow.stats.byTier['1v1'].wins, wRow.stats.defeats, lRow.stats.defeats, lRow.stats.byTier['1v1'].defeats], [1, 1, 0, 1, 1]);
            // (the test wipes out the loser's army, which the host counts as its losses on top of the seeded ones)
            assert.deepEqual([wRow.stats.kills, wRow.stats.losses, lRow.stats.kills], [32, 7, 7], 'the war\'s kills and losses count for each clan');
            assert(lRow.stats.losses >= 32, 'the loser\'s losses include the troops it lost: ' + lRow.stats.losses);
            await tab(a, 'clan');
            await a.page.waitForFunction(() => document.querySelectorAll('#mpClanRoot .clan-war-row').length === 1, null, { timeout: 15000 });
            await shot(a, 'clan-stats-after-war.png');
            // 2v2: both clans queue two players; teams are allies; then the Owls leave early and lose the war
            await a.page.evaluate(() => {
                window.__tinyWar = true;
                wodMpIsLobbyPreviewHost = () => false; wodIsMapPreviewGenerating = () => false; wodMpCommittedIsCurrentForMeta = () => true;
                wodMpPrepareHostLaunchPayload = async () => {
                    WOD.makeBlankMap(20); Object.assign(gameData, { entities: [], cities: [], bridges: [], hospitals: [], forts: [], constructionJobs: [], roads: [] });
                    const spots = { 1: [-8, -3], 2: [-8, 3], 3: [8, -3], 4: [8, 3] };
                    for(const h of gameData.hexList) { h.type = 'grass'; h.cityId = null; let best = 1, bd = 1e9; for(const s of [1, 2, 3, 4]) { const d = Math.abs(h.q - spots[s][0]) + Math.abs(h.r - spots[s][1]); if(d < bd) { bd = d; best = s; } } h.owner = best; }
                    for(const s of [1, 2, 3, 4]) { const h = gameData.hexes[spots[s][0] + ',' + spots[s][1]]; h.type = 'urban'; h.cityId = 'town' + s; gameData.cities.push({ id: h.cityId, name: 'Town ' + s, owner: s, q: h.q, r: h.r, x: h.x, y: h.y, hp: 1000, maxHp: 1000 }); createUnitAt('light', h.x + 20, h.y, s, { startSpawn: true }); }
                    gameData.mapShape = 'continent'; gameData._matchReadyForEndChecks = true;
                    return wodMpBuildInitPayload();
                };
            });
            for(const p of [a, b, c, d]) await tab(p, 'wars');
            // alone, pressing 2v2 Search opens the list of clanmates online now, to invite one; it does not search
            const formParty = async (inviter, invitee, mateName) => {
                await inviter.page.locator('.cw-2v2-pick').click();
                await inviter.page.waitForFunction(name => [...document.querySelectorAll('#cwPickDlg:not([hidden]) .cw-mate-list li')].some(li => li.textContent.includes(name) && li.querySelector('.cw-party-invite-btn')), mateName, { timeout: 15000 });
                assert.equal(await inviter.page.evaluate(() => WodClans.cw.queued), null, 'alone, Search does not queue');
                if(inviter === a) await shot(a, 'wars-pick-teammate.png');
                await inviter.page.locator('#cwPickDlg .cw-mate-list li', { hasText: mateName }).locator('.cw-party-invite-btn').click();
                await inviter.page.waitForFunction(() => /Invited/.test(document.querySelector('#cwPickDlg .cw-mate-list')?.textContent || ''), null, { timeout: 15000 });
                await invitee.page.waitForFunction(() => document.querySelector('.cw-party-accept') && document.querySelector('#mpTabWars .mp-tab-badge'), null, { timeout: 15000 });
                await invitee.page.locator('.cw-party-accept').click();
                await invitee.page.waitForFunction(() => WodClans.cw.party && WodClans.cw.party.members.length === 2 && document.querySelector('.cw-join[data-tier="2v2"]:not([disabled])'), null, { timeout: 15000 });
                // the inviter's picker turns into "Party ready", with the search button
                await inviter.page.waitForFunction(() => WodClans.cw.party && WodClans.cw.party.members.length === 2 && document.querySelector('#cwPickDlg:not([hidden]) #cwPickSearch'), null, { timeout: 15000 });
            };
            await formParty(a, b, 'Wolf Beta');
            await shot(b, 'wars-party.png');
            await formParty(c, d, 'Owl Delta');
            await c.page.locator('#cwPickClose').click();
            // in a party, 1v1 is closed
            assert.equal(await a.page.locator('.cw-join[data-tier="1v1"]').count(), 0, 'a party member cannot queue 1v1');
            await a.page.locator('#cwPickSearch').click();
            await b.page.waitForFunction(() => WodClans.cw.queued === '2v2', null, { timeout: 15000 });
            await sleep(1600);
            await Promise.all([a, b].map(p => p.page.evaluate(() => wodClanSend({ t: 'cw_status' }))));
            await sleep(400);
            const timers = await Promise.all([a, b].map(p => p.page.evaluate(() => ({ at: WodClans.queuedAt, by: WodClans.queuedBy, shown: document.getElementById('cwWait') ? document.getElementById('cwWait').textContent : '', who: document.querySelector('.cw-searching')?.textContent || '' }))));
            assert(Math.abs(timers[0].at - timers[1].at) < 400, 'both players of the party count the search from the same moment: ' + JSON.stringify(timers));
            assert(timers.every(t => t.by === 'Wolf Alpha' && /started by Wolf Alpha/.test(t.who)), 'both see who started the search: ' + JSON.stringify(timers));
            await shot(b, 'wars-party-searching.png');
            await d.page.waitForFunction(() => document.querySelector('[data-tier-count="2v2"]')?.textContent === '2', null, { timeout: 15000 });
            await d.page.locator('.cw-join[data-tier="2v2"]').click();
            await Promise.all([a, b, c, d].map(p => p.page.waitForFunction(() => gameState === 'PLAYING' && gameData.mp?.allReady, null, { timeout: 120000 })));
            const war2 = await Promise.all([a, b, c, d].map(p => p.page.evaluate(() => ({ slot: gameData.mp.localSlot, host: WodMultiplayer.api.isHost, alliances: gameData.alliances.map(x => [x.a ?? x[0], x.b ?? x[1]]) }))));
            assert.deepEqual(war2.map(w => w.slot), [1, 2, 3, 4], 'each clan sits together: wolves 1 and 2, owls 3 and 4');
            assert(war2[0].host);
            for(const w of war2) assert.deepEqual(w.alliances, [[1, 2], [3, 4]], 'the two teams are allies');
            await shot(a, 'war2-playing.png');
            // Gamma quits the match, then Delta's game drops out for good: the Owls have nobody left and lose
            await c.page.evaluate(() => returnToMenu());
            await d.context.close(); clients.splice(clients.indexOf(d), 1);
            await Promise.all([a, b].map(p => p.page.waitForFunction(() => gameData._campaignEnded, null, { timeout: 60000 })));
            const end2 = await Promise.all([a, b].map(p => p.page.evaluate(() => document.getElementById('campaignSummaryTitle')?.textContent || '')));
            assert(end2.every(t => /victory/i.test(t)), 'both wolves win when the owls leave: ' + JSON.stringify(end2));
            const res2 = await clanMsg(b, 'cw_result', 'm.tier === "2v2"');
            assert.deepEqual(res2.sides.map(s => [s.clan.name, s.outcome]), [['Grey Wolves', 'won'], ['Snow Owls', 'lost']]);
            await send(b, { t: 'clan_mine' });
            const wolvesNow = (await clanMsg(b, 'clan_info', 'm.clan && m.clan.history && m.clan.history.length === 2')).clan;
            assert.deepEqual([wolvesNow.stats.byTier['2v2'].wins, wolvesNow.history[0].tier, wolvesNow.history[0].outcome], [1, '2v2', 'won']);
            assert.equal(wolvesNow.memberList.find(m => m.playerId === b.id).warWins, 1, 'the members who fought get the war on their record');
            results.wars = { war1, war2, board1 };
            for(const p of clients.splice(0)) await p.context.close();
            console.log('wars: queue sizes shown, same clan never matched, 1v1 set up and started by itself on a generated map, result in clan stats and leaderboard, 2v2 allies, side that left lost');
        }

        assert.deepEqual(errors, [], 'no page errors');
        fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
        console.log('PASS');
    } catch(e) {
        for(const c of clients) {
            try { await shot(c, 'fail-' + c.name.replace(/\W+/g, '-') + '.png'); } catch(_) {}
            try { console.log(c.name, JSON.stringify(await c.page.evaluate(() => ({ state: gameState, ended: !!gameData._campaignEnded, lastEnd: gameData._mpLastMatchEnd || null, slot: gameData.mp && gameData.mp.localSlot, host: WodMultiplayer.api.isHost, connected: WodMultiplayer.api.connected, code: WodMultiplayer.api.code, lastSeq: WodMultiplayer.api.lastSeq, eliminated: gameData.mp && gameData.mp.eliminatedSlots, deferredSnap: !!gameData._mpDeferredSnap, deferredEnd: gameData._mpDeferredEnd || null, alliances: gameData.alliances, cityOwners: gameData.cities.map(x => x.owner) }))).slice(0, 1500)); } catch(_) {}
        }
        fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, errors, relayLog: relayLog.slice(-4000) }, null, 2));
        throw e;
    } finally {
        await browser.close(); server.close(); await stopRelay();
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
