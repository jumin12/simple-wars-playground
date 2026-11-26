'use strict';
// The relay against a misbehaving client (bare sockets on a local relay, default limits). Each check is something one
// player could do to break the relay or the game for others before 2026-11-26:
//   - a host's match data the relay reads ({cities:[null]}, {factionSlots:"x"}, eliminatedSlots:5) used to throw inside a
//     timer or the match-end commit and kill the process: the relay stays up, and other players stay connected
//   - a second "start" in a room made a new match to report a result for: ignored
//   - a match reported at once (under a minute) is not counted
//   - one address (as the hosting proxy passes it on) may hold 32 connections; the next is refused
//   - a control message over 2 MB is dropped unread, the socket and relay carry on
//   - lobby settings over 64 KB are refused
//   - a leaderboard request naming hundreds of made-up friends no longer creates a profile for each
//   - a progress sync claiming multiplayer wins and kills, a made-up achievement or the Supporter Pack's skin gets none
//     of them (multiplayer results are the relay's own)
//   - friend requests go to existing players only, and "accepting" a request nobody sent adds no friend
//   - names keep no markup characters
// Usage: node scripts/verify-relay-hardening.js
const H = require('./lib/harness');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert/strict'), crypto = require('crypto'), { fork } = require('child_process');
const { WebSocket } = require('../server/node_modules/ws');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'output/relay-hardening');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dataDir = fs.mkdtempSync(path.join(OUT, 'relay-'));
const secret = () => crypto.randomBytes(32).toString('hex');

let relay, relayPort, relayLog = '', exited = null;
const harness = path.join(OUT, 'relay.cjs');
fs.writeFileSync(harness, `const fs=require('fs'),rename=fs.renameSync;fs.renameSync=(a,b)=>{for(let i=0;;i++){try{return rename(a,b);}catch(e){if(i>=20||!/EPERM|EBUSY|EACCES/.test(e.code))throw e;const t=Date.now()+25;while(Date.now()<t);}}};require(${JSON.stringify(path.join(ROOT, 'server/index.js'))});`);
async function startRelay() {
    const probe = http.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); relayPort = probe.address().port; await new Promise(r => probe.close(r));
    // (default limits: WOD_MIN_MATCH_SECONDS is not set, so a match must last a minute to count)
    relay = fork(harness, [], { cwd: ROOT, env: { ...process.env, PORT: String(relayPort), DATABASE_URL: '', STEAM_PURCHASES_ENABLED: '0', WOD_DATA_DIR: dataDir, WOD_MIN_CLIENT_BUILD: '', WOD_VERSION_GATE: '', WOD_MIN_MATCH_SECONDS: '' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    relay.on('exit', code => { exited = code; });
    relay.stdout.on('data', b => relayLog += b); relay.stderr.on('data', b => relayLog += b);
    for(let i = 0; i < 100; i++) { try { const r = await fetch('http://127.0.0.1:' + relayPort + '/health'); if(r.ok) { await sleep(300); return; } } catch(_) {} await sleep(50); }
    throw Error('Relay failed: ' + relayLog);
}
const alive = async () => { if(exited !== null) return false; try { return (await fetch('http://127.0.0.1:' + relayPort + '/health')).ok; } catch(_) { return false; } };
const sockets = [];
async function connect(label, fromAddress) {
    const socket = new WebSocket('ws://127.0.0.1:' + relayPort, fromAddress ? { headers: { 'x-forwarded-for': '198.51.100.7, ' + fromAddress } } : undefined), messages = [];
    let closeCode = null; socket.on('close', c => { closeCode = c; });
    socket.on('message', raw => { try { messages.push(JSON.parse(raw)); } catch(_) {} });
    socket.on('error', () => {});
    const s = { socket, messages, label, get closeCode() { return closeCode; } };
    s.wait = async (types, pred = () => true, tries = 200) => { types = [].concat(types); for(let i = 0; i < tries; i++) { const at = messages.findIndex(m => types.includes(m.t) && pred(m)); if(at >= 0) return messages.splice(at, 1)[0]; await sleep(25); } throw Error(label + ': missing ' + types + ': ' + JSON.stringify(messages).slice(-500)); };
    s.none = async (types, ms = 800) => { await sleep(ms); return !messages.some(m => [].concat(types).includes(m.t)); };
    s.send = m => socket.send(typeof m === 'string' ? m : JSON.stringify(m));
    await s.wait('welcome');
    s.send(H.relayHello());
    s.register = async (playerId, displayName) => { s.secret ||= secret(); messages.length = 0; s.send({ t: 'register_player', playerId, deviceSecret: s.secret, displayName }); const r = await s.wait(['registered', 'register_failed']); s.id = r.playerId; return r; };
    s.close = () => new Promise(r => { if(socket.readyState > 1) return r(); socket.once('close', r); socket.close(); });
    sockets.push(s);
    return s;
}
const profileCount = () => { try { return Object.keys(JSON.parse(fs.readFileSync(path.join(dataDir, 'player-profiles.json'), 'utf8')).profiles || {}).length; } catch(_) { return 0; } };

(async () => {
    await startRelay();
    try {
        const host = await connect('host'), guest = await connect('guest'), other = await connect('other');
        assert.equal((await host.register('WOD-HOST-0001', 'Host Player')).t, 'registered');
        assert.equal((await guest.register('WOD-GUES-0002', 'Guest Player')).t, 'registered');
        const named = await other.register('WOD-OTHR-0003', '<b>Bold</b> Name');
        assert.equal(named.profile.profile.mpDisplayName, 'bBold/b Name', 'names keep no markup characters');

        // ---- lobby settings, then a room with a host and a guest
        host.send({ t: 'create_lobby', name: '<script>Lobby</script>', meta: { huge: 'x'.repeat(70 * 1024) } });
        assert.match((await host.wait('error')).msg, /too large/, 'lobby settings over 64 KB are refused');
        host.send({ t: 'create_lobby', name: 'Test <room>', meta: { seatTypes: ['human', 'human', 'closed', 'closed'] } });
        const room = (await host.wait('joined')).code;
        guest.send({ t: 'join_lobby', id: room, playerId: guest.id });
        await guest.wait('joined');
        const listed = (await other.wait('lobby_list', m => (m.lobbies || []).some(l => l.id === room))).lobbies.find(l => l.id === room);
        assert.equal(listed.name, 'Test room', 'lobby names keep no markup characters');

        // ---- a malformed match start, a second start, malformed snapshots, an instant result
        guest.messages.length = 0;
        host.send({ t: 'start', payload: { factionSlots: 'x', humanSlots: 'y', cities: [null], eliminatedSlots: 5, lifetimeStatsByOwner: [1, 2] } });
        const started = await guest.wait('match_start');
        assert.ok(Array.isArray(started.payload.factionSlots) && Array.isArray(started.payload.cities), 'the relay passes the host data on in shape');
        host.send({ t: 'start', payload: { again: true } });
        assert.ok(await guest.none('match_start'), 'a second start in the same room is ignored');
        host.send({ t: 'snap', payload: { cities: [null, 7, 'x'], eliminatedSlots: 5, lifetimeStatsByOwner: { 1: null, x: 3, 2: { enemyTroopKills: 1e12 } } } });
        host.send({ t: 'snap', payload: [1, 2, 3] });
        host.send({ t: 'mp_match_end', outcomes: { 1: 'won', 2: 'lost' }, participants: [{ slot: 1, playerId: host.id }, { slot: 2, playerId: guest.id }] });
        assert.ok(await host.none('mp_match_end_ack', 1500), 'a match reported at once is not counted');
        await guest.close(); await host.close();
        await sleep(800);
        assert.ok(await alive(), 'the relay survives all of it, and the host and guest leaving after: ' + relayLog.slice(-400));
        other.send({ t: 'ping', ts: 1 });
        assert.ok(other.socket.readyState === 1, 'and other players stay connected');

        // ---- big messages and many connections
        const loud = await connect('loud');
        loud.send(JSON.stringify({ t: 'list_lobbies', pad: 'y'.repeat(3 * 1024 * 1024) }));
        await sleep(500);
        loud.messages.length = 0; loud.send({ t: 'list_lobbies' });
        await loud.wait('lobby_list');
        assert.ok(await alive(), 'a 3 MB control message is dropped and the socket carries on');
        // (the proxy's address for the client is the last one in X-Forwarded-For; the first may be the client's own claim)
        const many = [];
        for(let i = 0; i < 32; i++) many.push(await connect('many' + i, '203.0.113.9'));
        const extra = new WebSocket('ws://127.0.0.1:' + relayPort, { headers: { 'x-forwarded-for': '10.0.0.' + 1 + ', 203.0.113.9' } });
        const extraCode = await new Promise(r => { extra.on('close', c => r(c)); extra.on('error', () => {}); setTimeout(() => r(null), 3000); });
        assert.equal(extraCode, 1013, 'the 33rd connection from one address is refused');
        const elsewhere = await connect('another address', '203.0.113.10');
        assert.ok(elsewhere.socket.readyState === 1, 'one from another address is not');
        for(const s of many) await s.close();
        await sleep(300);
        const again = await connect('after the crowd left', '203.0.113.9');
        assert.ok(again.socket.readyState === 1, 'and the address is let in again once the others have gone');

        // ---- the leaderboard, progress sync and friends
        const before = profileCount();
        const fakes = Array.from({ length: 300 }, (_, i) => 'WOD-F' + String(i).padStart(3, '0') + '-ZZZZ');
        other.messages.length = 0; other.send({ t: 'leaderboard', sort: 'wins', friendIds: fakes });
        await other.wait('leaderboard');
        const cheat = await connect('cheat');
        await cheat.register('WOD-CHEA-0004', 'Cheater');
        cheat.send({ t: 'sync_progress', playerId: cheat.id, progress: {
            multiplayer: { gamesPlayed: 9999, wins: 9999, losses: 0 },
            statsByMode: { multiplayer: { totals: { enemyTroopKills: 99999, matchesWon: 9999 }, byPeriod: {} } },
            achievements: { madeUpAchievement: true },
            lifetimeByPeriod: Object.fromEntries(Array.from({ length: 50 }, (_, i) => ['era' + i, { battlesWon: 1 }])),
            profile: { ownedUnitSkins: { supporterGold: true, nato: true } },
        } });
        const synced = (await cheat.wait(['profile', 'profile_failed'])).profile;
        assert.ok(!synced.profile.ownedUnitSkins.supporterGold, 'the Supporter Pack skin is not taken from a sync');
        assert.ok(!('madeUpAchievement' in (synced.achievements || {})), 'nor a made-up achievement');
        assert.ok(!Object.keys(synced.lifetimeByPeriod || {}).some(k => k.startsWith('era')), 'nor made-up eras');
        cheat.messages.length = 0; cheat.send({ t: 'leaderboard', sort: 'wins' });
        const row = (await cheat.wait('leaderboard')).rows.find(r => r.playerId === cheat.id);
        assert.ok(!row || (row.stats.wins === 0 && row.stats.kills === 0 && row.stats.gamesPlayed === 0), 'multiplayer wins and kills come from the relay only: ' + JSON.stringify(row && row.stats));
        assert.ok(profileCount() <= before + 1, 'made-up leaderboard friends create no profiles (' + before + ' -> ' + profileCount() + ')');
        cheat.messages.length = 0; cheat.send({ t: 'friend_request', targetPlayerId: 'WOD-NOBO-DY00' });
        assert.match((await cheat.wait('error')).msg, /No player has that ID/, 'friend requests go to existing players only');
        cheat.messages.length = 0; cheat.send({ t: 'friend_request_reply', fromPlayerId: other.id, accept: true });
        await sleep(500);
        other.messages.length = 0; other.send({ t: 'get_profile', playerId: other.id });
        const theirs = (await other.wait('profile')).profile;
        assert.ok(!(theirs.profile.friends || []).some(f => f.playerId === cheat.id), '"accepting" a request nobody sent adds no friend');

        assert.ok(await alive() && exited === null, 'the relay is still up at the end');
        console.log('verify-relay-hardening: OK');
    } finally {
        for(const s of sockets) try { s.socket.close(); } catch(_) {}
        if(relay && exited === null) relay.kill();
    }
})().catch(e => { console.error(e); console.error(relayLog.slice(-1500)); process.exitCode = 1; });
