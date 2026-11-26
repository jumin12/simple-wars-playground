'use strict';
// The relay's admin tools (server/admin.js), against the real relay with bare sockets standing in for players. Its data
// folder starts with five players and two clans, and WOD_ADMIN_PLAYER_IDS names one player:
//   - only that player is told they are an admin (registered.admin); anybody else's admin_ request is refused, unregistered
//     or not, and learns nothing
//   - the admin finds players by name or ID and clans by name or ID, and opens a clan's member list
//   - renaming a clan to a name another clan holds is refused; a free name is taken, and its online members are told
//   - renaming a player to a taken name is refused; a free name is taken, the player's game is told at once and the
//     rankings show it; when their game connects again still holding the old name it gets the new one, while a name
//     they pick themselves is theirs
//   - making a member the leader, removing a member (told, and out of the clan) and disbanding a clan (members told)
//   - every change is in the admin log; after the relay restarts the changes, the admin and the renamed player's
//     protection against their old name are all still there
// Usage: node scripts/verify-admin-tools.js
const H = require('./lib/harness');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert/strict'), crypto = require('crypto'), { fork } = require('child_process');
const { WebSocket } = require('../server/node_modules/ws');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'output/admin-tools');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const dataDir = fs.mkdtempSync(path.join(OUT, 'relay-'));
const secret = () => crypto.randomBytes(32).toString('hex'), key = s => 'browser:' + crypto.createHash('sha256').update(s).digest('hex');
const PA = 'WOD-ADMN-0001', PB = 'WOD-BBBB-0002', PC = 'WOD-CCCC-0003', PD = 'WOD-DDDD-0004', PE = 'WOD-EEEE-0005';
const S = { [PA]: secret(), [PB]: secret(), [PC]: secret(), [PD]: secret(), [PE]: secret() };
const player = (name, games, at) => ({ profile: { mpDisplayName: name }, multiplayer: { gamesPlayed: games, wins: 1, losses: games - 1 }, createdAt: at, updatedAt: at });
fs.writeFileSync(path.join(dataDir, 'player-profiles.json'), JSON.stringify({
    profiles: { [PA]: player('Head Admin', 3, 1000), [PB]: player('Rude Name', 2, 2000), [PC]: player('Clan Founder', 4, 3000), [PD]: player('Member Dee', 2, 4000), [PE]: player('Other Leader', 1, 5000) },
    identities: Object.fromEntries(Object.entries(S).map(([pid, s]) => [key(s), pid])),
}));
// (seen just now: a leader unseen for sixty days hands the clan on when the relay starts)
const member = (playerId, at) => ({ playerId, joinedAt: at, lastSeenAt: Date.now() });
fs.writeFileSync(path.join(dataDir, 'clans.json'), JSON.stringify({ clans: [
    { id: 'C1', name: 'Spare Dev Clan', emblem: 'p:swords', visibility: 'public', description: 'the duplicate', code: 'CLAN-C1', leaderId: PC, createdAt: 1000, members: [member(PC, 1000), member(PD, 1500)] },
    { id: 'C2', name: 'Another Clan', emblem: 'p:wolf', visibility: 'private', description: '', code: 'CLAN-C2', leaderId: PE, createdAt: 2000, members: [member(PE, 2000)] },
] }));

let relay, relayPort, relayLog = '';
const harness = path.join(OUT, 'relay.cjs');
fs.writeFileSync(harness, `const fs=require('fs'),rename=fs.renameSync;fs.renameSync=(a,b)=>{for(let i=0;;i++){try{return rename(a,b);}catch(e){if(i>=20||!/EPERM|EBUSY|EACCES/.test(e.code))throw e;const t=Date.now()+25;while(Date.now()<t);}}};require(${JSON.stringify(path.join(ROOT, 'server/index.js'))});`);
async function startRelay() {
    const probe = http.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); relayPort = probe.address().port; await new Promise(r => probe.close(r));
    // (written loosely on purpose: lower case, spaces, a stray comma, and a malformed ID that must not count)
    relay = fork(harness, [], { cwd: ROOT, env: { ...process.env, PORT: String(relayPort), DATABASE_URL: '', STEAM_PURCHASES_ENABLED: '0', WOD_MIN_MATCH_SECONDS: '0', WOD_DATA_DIR: dataDir, WOD_MIN_CLIENT_BUILD: '', WOD_VERSION_GATE: '',
        WOD_ADMIN_PLAYER_IDS: ' ' + PA.toLowerCase() + ' , not-an-id,' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    relay.stdout.on('data', b => relayLog += b); relay.stderr.on('data', b => relayLog += b);
    for(let i = 0; i < 100; i++) { try { const r = await fetch('http://127.0.0.1:' + relayPort + '/health'); if(r.ok) { await sleep(300); return; } } catch(_) {} await sleep(50); }
    throw Error('Relay failed: ' + relayLog);
}
async function stopRelay() { if(!relay) return; const gone = new Promise(r => relay.once('exit', r)); relay.kill(); await gone; relay = null; }
const sockets = [];
async function connect(label) {
    const socket = new WebSocket('ws://127.0.0.1:' + relayPort), messages = [];
    socket.on('message', raw => messages.push(JSON.parse(raw)));
    const wait = async (types, pred = () => true) => { types = [].concat(types); for(let i = 0; i < 400; i++) { const at = messages.findIndex(m => types.includes(m.t) && pred(m)); if(at >= 0) return messages.splice(at, 1)[0]; await sleep(25); } throw Error(label + ': missing ' + types + ': ' + JSON.stringify(messages).slice(-600)); };
    await wait('welcome');
    const send = m => socket.send(JSON.stringify(m));
    send(H.relayHello());
    const s = { socket, send, wait, messages, label };
    s.register = async (playerId, displayName) => { messages.length = 0; send({ t: 'register_player', playerId, deviceSecret: S[playerId], displayName }); return wait(['registered', 'register_failed']); };
    s.admin = async msg => { send(msg); return wait(['admin_players', 'admin_clans', 'admin_clan', 'admin_log', 'admin_done', 'admin_error']); };
    s.close = () => new Promise(r => { socket.once('close', r); socket.close(); });
    sockets.push(s);
    return s;
}
const clanInfo = (s, pred) => s.wait('clan_info', pred);

(async () => {
    await startRelay();
    try {
        const boss = await connect('admin'), rude = await connect('rude'), founder = await connect('founder'), dee = await connect('dee'), other = await connect('other'), stranger = await connect('stranger');
        // ---- who is an admin
        const bossReg = await boss.register(PA, 'Head Admin');
        assert.equal(bossReg.t, 'registered'); assert.equal(bossReg.admin, true, 'the admin is told they are one');
        const rudeReg = await rude.register(PB, 'Rude Name');
        assert.equal(rudeReg.t, 'registered'); assert.ok(!('admin' in rudeReg), 'nobody else is told anything about admins');
        for(const [s, pid, name] of [[founder, PC, 'Clan Founder'], [dee, PD, 'Member Dee'], [other, PE, 'Other Leader']]) assert.equal((await s.register(pid, name)).t, 'registered');
        for(const t of ['admin_players', 'admin_clans', 'admin_clan', 'admin_log', 'admin_rename_player', 'admin_rename_clan', 'admin_kick', 'admin_set_leader', 'admin_disband']) {
            const r = await rude.admin({ t, clanId: 'C1', playerId: PA, name: 'Hacked', query: '' });
            assert.deepEqual(r, { t: 'admin_error', msg: 'Not available.' }, 'a player who is not an admin is refused ' + t + ' and learns nothing');
        }
        assert.deepEqual(await stranger.admin({ t: 'admin_clans', query: '' }), { t: 'admin_error', msg: 'Not available.' }, 'so is a game that has not registered');

        // ---- finding players and clans
        let r = await boss.admin({ t: 'admin_players', query: 'rude' });
        assert.deepEqual(r.players.map(p => p.playerId), [PB], 'players by part of their name');
        assert.ok(r.players[0].online && r.players[0].name === 'Rude Name' && r.players[0].gamesPlayed === 2 && !r.players[0].clan);
        r = await boss.admin({ t: 'admin_players', query: PC.toLowerCase() });
        assert.deepEqual(r.players.map(p => [p.playerId, p.clan && p.clan.id]), [[PC, 'C1']], 'a player by ID, with their clan');
        assert.equal((await boss.admin({ t: 'admin_players', query: '' })).players.length, 5, 'everyone, with an empty search');
        r = await boss.admin({ t: 'admin_clans', query: 'dev' });
        assert.deepEqual(r.clans.map(c => [c.id, c.name, c.leaderName, c.members]), [['C1', 'Spare Dev Clan', 'Clan Founder', 2]], 'clans by part of their name');
        assert.deepEqual((await boss.admin({ t: 'admin_clans', query: 'c2' })).clans.map(c => c.id), ['C2'], 'a clan by ID');
        r = await boss.admin({ t: 'admin_clan', clanId: 'C1' });
        assert.deepEqual(r.clan.memberList.map(m => [m.playerId, m.leader, m.online]), [[PC, true, true], [PD, false, true]], 'a clan\'s members');
        assert.equal(r.clan.code, 'CLAN-C1');

        // ---- renaming a clan
        r = await boss.admin({ t: 'admin_rename_clan', clanId: 'C1', name: 'another-CLAN' });
        assert.equal(r.t, 'admin_error'); assert.match(r.msg, /Another Clan.*C2/, 'a name another clan holds is refused, naming that clan');
        assert.equal((await boss.admin({ t: 'admin_rename_clan', clanId: 'C1', name: 'thanks for noticing' })).t, 'admin_error', 'nor the placeholder');
        founder.messages.length = 0; dee.messages.length = 0;
        assert.equal((await boss.admin({ t: 'admin_rename_clan', clanId: 'C1', name: 'Renamed Squad' })).t, 'admin_done');
        for(const s of [founder, dee]) {
            const info = await clanInfo(s, m => m.mine && m.mine.name === 'Renamed Squad');
            assert.ok(info.clan.chat.some(c => /admin renamed the clan from Spare Dev Clan to Renamed Squad/.test(c.text)), s.label + ' sees the new name, and why, in the clan chat');
        }

        // ---- renaming a player
        r = await boss.admin({ t: 'admin_rename_player', playerId: PB, name: 'head admin' });
        assert.equal(r.t, 'admin_error'); assert.match(r.msg, /taken/, 'a name another player holds is refused');
        rude.messages.length = 0;
        assert.equal((await boss.admin({ t: 'admin_rename_player', playerId: PB, name: 'Polite Name' })).t, 'admin_done');
        const told = await rude.wait('registered');
        assert.equal(told.profile.profile.mpDisplayName, 'Polite Name', 'the renamed player\'s game is told the new name at once');
        boss.messages.length = 0; boss.send({ t: 'leaderboard', sort: 'wins' });
        assert.equal((await boss.wait('leaderboard')).rows.find(row => row.playerId === PB).displayName, 'Polite Name', 'the rankings show it');
        await rude.close();
        const rudeAgain = await connect('rude again');
        const stale = await rudeAgain.register(PB, 'Rude Name');
        assert.equal(stale.t, 'registered'); assert.equal(stale.profile.profile.mpDisplayName, 'Polite Name', 'a game still holding the old name gets the new one');
        await rudeAgain.close();
        const rudeChoice = await connect('rude chooses');
        assert.equal((await rudeChoice.register(PB, 'Calm Commander')).profile.profile.mpDisplayName, 'Calm Commander', 'a name they pick themselves is theirs');

        // ---- the leader, members, disbanding
        founder.messages.length = 0;
        assert.equal((await boss.admin({ t: 'admin_set_leader', clanId: 'C1', playerId: PD })).t, 'admin_done');
        assert.equal((await boss.admin({ t: 'admin_set_leader', clanId: 'C1', playerId: PD })).t, 'admin_error', 'already the leader');
        await clanInfo(founder, m => m.clan && m.clan.leaderId === PD);
        assert.equal((await boss.admin({ t: 'admin_kick', clanId: 'C1', playerId: PE })).t, 'admin_error', 'a player who is not a member');
        founder.messages.length = 0;
        assert.equal((await boss.admin({ t: 'admin_kick', clanId: 'C1', playerId: PC })).t, 'admin_done');
        const kicked = await clanInfo(founder, m => 'notice' in m);
        assert.ok(!kicked.mine && /admin removed you from Renamed Squad/.test(kicked.notice), 'the removed member is told, and is out of the clan');
        assert.deepEqual((await boss.admin({ t: 'admin_clan', clanId: 'C1' })).clan.memberList.map(m => m.playerId), [PD]);
        other.messages.length = 0;
        const gone = await boss.admin({ t: 'admin_disband', clanId: 'C2' });
        assert.ok(gone.t === 'admin_done' && gone.disbanded);
        const disbanded = await clanInfo(other, m => 'notice' in m);
        assert.ok(!disbanded.mine && /admin disbanded Another Clan/.test(disbanded.notice), 'its members are told');
        assert.deepEqual((await boss.admin({ t: 'admin_clans', query: '' })).clans.map(c => c.id), ['C1'], 'the disbanded clan is gone');
        assert.equal((await boss.admin({ t: 'admin_clan', clanId: 'C2' })).t, 'admin_error');
        other.messages.length = 0; other.send({ t: 'clan_create', name: 'Another Clan', emblem: 'p:star', visibility: 'public' });
        assert.equal((await other.wait(['clan_info', 'clan_error'])).t, 'clan_info', 'its name is free again');

        // ---- the log, and a restart
        const log = (await boss.admin({ t: 'admin_log' })).entries;
        assert.deepEqual(log.map(e => e.action).reverse(), ['renamed clan', 'renamed player', 'changed clan leader', 'removed from clan', 'disbanded clan'], 'every change is logged, newest first');
        assert.ok(log.every(e => e.by === PA && e.byName === 'Head Admin'));
        assert.match(relayLog, /\[admin\] Head Admin \(WOD-ADMN-0001\) renamed player WOD-BBBB-0002: Rude Name → Polite Name/, 'and in the relay\'s own log');
        for(const s of sockets) try { s.socket.close(); } catch(_) {}
        sockets.length = 0;
        await stopRelay(); await startRelay();
        const boss2 = await connect('admin after restart');
        assert.equal((await boss2.register(PA, 'Head Admin')).admin, true, 'still the admin after a restart');
        const saved = (await boss2.admin({ t: 'admin_clans', query: '' })).clans;
        assert.deepEqual(saved.filter(c => c.id !== 'C1').map(c => [c.name, c.leaderId]), [['Another Clan', PE]], 'the disbanded clan stayed gone (the one there is new)');
        assert.deepEqual(saved.filter(c => c.id === 'C1').map(c => [c.name, c.leaderId, c.members]), [['Renamed Squad', PD, 1]], 'the renamed clan, its leader and its members were saved');
        const rude3 = await connect('rude after restart');
        assert.equal((await rude3.register(PB, 'Rude Name')).profile.profile.mpDisplayName, 'Calm Commander', 'the old name still cannot come back after a restart');
        console.log('verify-admin-tools: OK');
    } finally {
        for(const s of sockets) try { s.socket.close(); } catch(_) {}
        await stopRelay();
    }
})().catch(e => { console.error(e); console.error(relayLog.slice(-1500)); process.exitCode = 1; });
