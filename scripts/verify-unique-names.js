'use strict';
// One name each for clans and players (server/names.js), against the real relay. Its data folder starts with two players
// and two clans that already share a name, written differently ("Dev Lead" / "dev<zero-width space> lead", "The Old
// Guard" / "the old  guard"), as happened on the live relay with "the dev clan". Bare relay sockets stand in for the players:
//   - names that differ only in case, spacing, punctuation, accents, invisible characters or look-alike letters match
//   - the older player and clan keep the name; the younger show as "thanks for noticing" in the rankings and lists
//   - the younger player cannot play under the name and is told why; with a new name they can
//   - the younger clan's leader can change nothing until the clan is renamed; the older clan's leader can
//   - nobody can take a used name in another spelling, or the placeholder itself
//   - "the dev clan" (server/clans.js NAME_KEEPERS) stays with jumin121's clan although it was founded after the other one
// Usage: node scripts/verify-unique-names.js
const H = require('./lib/harness');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert/strict'), crypto = require('crypto'), { fork } = require('child_process');
const { WebSocket } = require('../server/node_modules/ws');
const { nameMatchKey, isPlaceholderName, NAME_TAKEN_PLACEHOLDER } = require('../server/names');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'output/unique-names');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- the name key on its own
const same = ['The Dev Clan', 'the  dev-clan', 'Thе Dеv Clаn', 'the dev​ clan', 'ＴＨＥ ＤＥＶ ＣＬＡＮ', 'The Dév Clan', 'THE.DEV.CLAN'];
for(const n of same) assert.equal(nameMatchKey(n), 'thedevclan', 'reads as "the dev clan": ' + JSON.stringify(n));
assert.notEqual(nameMatchKey('Dev Clan'), nameMatchKey('The Dev Clan'), 'a different name stays different');
assert.notEqual(nameMatchKey('!!!'), nameMatchKey('???'), 'names of symbols alone stay apart');
assert.ok(isPlaceholderName('Thanks, for noticing!') && !isPlaceholderName('Thanks'));

// ---- the relay, with the duplicates already in its data
const dataDir = fs.mkdtempSync(path.join(OUT, 'relay-'));
const secret = () => crypto.randomBytes(32).toString('hex'), key = s => 'browser:' + crypto.createHash('sha256').update(s).digest('hex');
const P1 = 'WOD-AAAA-1111', P2 = 'WOD-BBBB-2222', S1 = secret(), S2 = secret();
const P4 = 'WOD-DDDD-4444', P5 = 'WOD-EEEE-5555', S4 = secret(), S5 = secret();
// (saved before profiles kept a creation date: the one with more multiplayer games is the older)
fs.writeFileSync(path.join(dataDir, 'player-profiles.json'), JSON.stringify({
    profiles: {
        [P1]: { profile: { mpDisplayName: 'Dev Lead' }, multiplayer: { gamesPlayed: 6, wins: 4, losses: 2 }, updatedAt: 1000 },
        [P2]: { profile: { mpDisplayName: 'dev​ lead' }, multiplayer: { gamesPlayed: 1, wins: 0, losses: 1 }, updatedAt: 2000 },
        [P4]: { profile: { mpDisplayName: 'Early Bird' }, multiplayer: { gamesPlayed: 3, wins: 1, losses: 2 }, updatedAt: 500 },
        [P5]: { profile: { mpDisplayName: 'jumin121' }, multiplayer: { gamesPlayed: 2, wins: 2, losses: 0 }, updatedAt: 4000 },
    },
    identities: { [key(S1)]: P1, [key(S2)]: P2, [key(S4)]: P4, [key(S5)]: P5 },
}));
const clan = (id, name, leader, createdAt) => ({ id, name, emblem: 'p:swords', visibility: 'public', description: '', code: 'CLAN-' + id, leaderId: leader, createdAt, members: [{ playerId: leader, joinedAt: createdAt, lastSeenAt: createdAt }] });
fs.writeFileSync(path.join(dataDir, 'clans.json'), JSON.stringify({ clans: [clan('C1', 'The Old Guard', P1, 1000), clan('C2', 'the old  guard', P2, 2000),
    // (the live pair: the other "dev clan" was founded first, jumin121's keeps the name)
    clan('C4', 'The Dev Clan', P4, 500), clan('C5', 'the dev clan', P5, 4000)] }));

let relay, relayPort, relayLog = '';
const harness = path.join(OUT, 'relay.cjs');
fs.writeFileSync(harness, `const fs=require('fs'),rename=fs.renameSync;fs.renameSync=(a,b)=>{for(let i=0;;i++){try{return rename(a,b);}catch(e){if(i>=20||!/EPERM|EBUSY|EACCES/.test(e.code))throw e;const t=Date.now()+25;while(Date.now()<t);}}};require(${JSON.stringify(path.join(ROOT, 'server/index.js'))});`);
async function startRelay() {
    const probe = http.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); relayPort = probe.address().port; await new Promise(r => probe.close(r));
    relay = fork(harness, [], { cwd: ROOT, env: { ...process.env, PORT: String(relayPort), DATABASE_URL: '', STEAM_PURCHASES_ENABLED: '0', WOD_DATA_DIR: dataDir, WOD_MIN_CLIENT_BUILD: '', WOD_VERSION_GATE: '' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    relay.stdout.on('data', b => relayLog += b); relay.stderr.on('data', b => relayLog += b);
    for(let i = 0; i < 100; i++) { try { const r = await fetch('http://127.0.0.1:' + relayPort + '/health'); if(r.ok) { await sleep(300); return; } } catch(_) {} await sleep(50); }
    throw Error('Relay failed: ' + relayLog);
}
const sockets = [];
async function connect(label) {
    const socket = new WebSocket('ws://127.0.0.1:' + relayPort), messages = [];
    socket.on('message', raw => messages.push(JSON.parse(raw)));
    const wait = async (types, pred = () => true) => { types = [].concat(types); for(let i = 0; i < 400; i++) { const at = messages.findIndex(m => types.includes(m.t) && pred(m)); if(at >= 0) return messages.splice(at, 1)[0]; await sleep(25); } throw Error(label + ': missing ' + types + ': ' + JSON.stringify(messages).slice(-600)); };
    await wait('welcome');
    const send = m => socket.send(JSON.stringify(m));
    send(H.relayHello());
    const s = { socket, send, wait, messages };
    s.register = async (playerId, deviceSecret, displayName) => { messages.length = 0; send({ t: 'register_player', playerId, deviceSecret, displayName }); return wait(['registered', 'register_failed']); };
    s.clan = async msg => { messages.length = 0; send(msg); return wait(['clan_info', 'clan_error', 'clan_list', 'clan_leaderboard']); };
    sockets.push(s);
    return s;
}

(async () => {
    await startRelay();
    try {
        const older = await connect('older'), younger = await connect('younger'), fresh = await connect('fresh');
        // the older player plays under the shared name; the younger cannot, and is told why
        assert.equal((await older.register(P1, S1, 'Dev Lead')).t, 'registered', 'the older player keeps the name');
        const refused = await younger.register(P2, S2, 'dev​ lead');
        assert.equal(refused.t, 'register_failed');
        assert.equal(refused.reason, 'display_name_taken', 'the game asks the younger player for a new name');
        assert.match(refused.msg, /had this name first/);
        assert.match(refused.msg, /thanks for noticing/);
        // the rankings and clan lists show the younger player and clan as the placeholder
        older.messages.length = 0; older.send({ t: 'leaderboard', sort: 'wins' });
        const lb = await older.wait('leaderboard');
        const row = id => lb.rows.find(r => r.playerId === id);
        assert.equal(row(P1).displayName, 'Dev Lead');
        assert.equal(row(P2).displayName, NAME_TAKEN_PLACEHOLDER, 'the younger player shows as the placeholder in the rankings');
        const clansSeen = await older.clan({ t: 'clan_list', browse: true, sort: 'newest' });
        const byId = id => clansSeen.clans.find(c => c.id === id);
        assert.deepEqual([byId('C1').name, byId('C1').nameFlagged], ['The Old Guard', false], 'the older clan keeps its name');
        assert.deepEqual([byId('C5').name, byId('C5').nameFlagged], ['the dev clan', false], "jumin121's dev clan keeps the name although it is younger");
        assert.deepEqual([byId('C4').name, byId('C4').nameFlagged], [NAME_TAKEN_PLACEHOLDER, true], 'the other dev clan shows as the placeholder');
        assert.deepEqual([byId('C2').name, byId('C2').nameFlagged], [NAME_TAKEN_PLACEHOLDER, true], 'the younger clan shows as the placeholder');
        const clanLb = await older.clan({ t: 'clan_leaderboard', kind: 'war', sort: 'wins' });
        assert.ok(clanLb.rows.some(r => r.id === 'C2' && r.name === NAME_TAKEN_PLACEHOLDER) && clanLb.rows.some(r => r.id === 'C1' && r.name === 'The Old Guard') && clanLb.rows.some(r => r.id === 'C4' && r.name === NAME_TAKEN_PLACEHOLDER) && clanLb.rows.some(r => r.id === 'C5' && r.name === 'the dev clan'), 'the clan rankings too');
        // the older clan's leader can still change the clan with its name kept
        assert.equal((await older.clan({ t: 'clan_update', emblem: 'p:star' })).t, 'clan_info', 'the older clan can still be changed');
        // the younger player, with a new name, plays; their clan can change nothing until it is renamed
        assert.equal((await younger.register(P2, S2, 'Fresh Name')).t, 'registered', 'with a new name the younger player plays');
        const blocked = await younger.clan({ t: 'clan_update', emblem: 'p:star' });
        assert.equal(blocked.t, 'clan_error');
        assert.match(blocked.msg, /had this name first/, 'the younger clan has to be renamed first');
        assert.equal((await younger.clan({ t: 'clan_update', name: 'Thanks for noticing' })).t, 'clan_error', 'the placeholder cannot be taken');
        const mine = await younger.clan({ t: 'clan_mine' });
        assert.ok(mine.clan && mine.clan.nameFlagged && mine.clan.name === NAME_TAKEN_PLACEHOLDER && mine.clan.youAreLeader, 'its leader sees the clan needs a new name');
        assert.equal((await younger.clan({ t: 'clan_update', name: 'Second Squad' })).t, 'clan_info', 'renamed');
        const after = await older.clan({ t: 'clan_list', browse: true, sort: 'newest' });
        assert.deepEqual([after.clans.find(c => c.id === 'C2').name, after.clans.find(c => c.id === 'C2').nameFlagged], ['Second Squad', false], 'renamed, the clan shows its new name');
        older.messages.length = 0; older.send({ t: 'leaderboard', sort: 'wins' });
        assert.equal((await older.wait('leaderboard')).rows.find(r => r.playerId === P2).displayName, 'Fresh Name', 'renamed, the player shows their new name');
        // a new player cannot take a used name in another spelling, nor the placeholder; their clan neither
        const P3 = 'WOD-CCCC-3333', S3 = secret();
        for(const n of ['DEV LEAD', 'Dеv Lеad', 'dev.lead', 'Thanks for noticing', 'Fresh  name'])
            assert.equal((await fresh.register(P3, S3, n)).t, 'register_failed', 'refused: ' + JSON.stringify(n));
        assert.equal((await fresh.register(P3, S3, 'Third Person')).t, 'registered');
        for(const n of ['THE OLD GUARD', 'Thе Old Guаrd', 'the old​guard', 'THE DEV CLAN', 'Thе Dеv Clаn', 'the dev​clan', 'second-squad', 'thanks for noticing'])
            assert.equal((await fresh.clan({ t: 'clan_create', name: n, emblem: 'p:wolf', visibility: 'public' })).t, 'clan_error', 'refused clan name: ' + JSON.stringify(n));
        assert.equal((await fresh.clan({ t: 'clan_create', name: 'Brand New Clan', emblem: 'p:wolf', visibility: 'public' })).t, 'clan_info');
        const early = await connect('early'), jumin = await connect('jumin');
        assert.equal((await early.register(P4, S4, 'Early Bird')).t, 'registered');
        assert.equal((await jumin.register(P5, S5, 'jumin121')).t, 'registered');
        const notKept = await early.clan({ t: 'clan_update', emblem: 'p:star' });
        assert.equal(notKept.t, 'clan_error'); assert.match(notKept.msg, /had this name first/, 'the other dev clan has to be renamed');
        assert.equal((await jumin.clan({ t: 'clan_update', emblem: 'p:star' })).t, 'clan_info', "jumin121's dev clan can still be changed");
        console.log('verify-unique-names: OK');
    } finally {
        for(const s of sockets) try { s.socket.close(); } catch(_) {}
        if(relay) relay.kill();
    }
})().catch(e => { console.error(e); console.error(relayLog.slice(-1200)); process.exitCode = 1; });
