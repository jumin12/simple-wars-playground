'use strict';
// The multiplayer game browser (Browse games), against the real relay. Bare relay sockets stand in for other players:
// Ana and Ben start a match (two AI seats), Cleo hosts an open lobby and Dev a lobby with a password. A real game
// page watches the list:
//   - lobbies first, then the match being played in its own section, with who is playing and how long it has run
//   - the filter shows all games by default, with counts; Open hides the password lobby; Password shows only it
//   - a filter with nothing to show says so and offers Show all games
// Usage: node scripts/verify-mp-game-browser.js
const H = require('./lib/harness');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert/strict'), crypto = require('crypto'), { fork } = require('child_process');
const { WebSocket } = require('../server/node_modules/ws');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'output/mp-game-browser');
fs.mkdirSync(OUT, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(OUT, 'relay-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let relay, relayPort, relayLog = '';
const harness = path.join(OUT, 'relay.cjs');
// (Windows can hold a just-written file for a moment: the relay's local profile file is renamed with a few retries)
fs.writeFileSync(harness, `const fs=require('fs'),rename=fs.renameSync;fs.renameSync=(a,b)=>{for(let i=0;;i++){try{return rename(a,b);}catch(e){if(i>=20||!/EPERM|EBUSY|EACCES/.test(e.code))throw e;const t=Date.now()+25;while(Date.now()<t);}}};require(${JSON.stringify(path.join(ROOT, 'server/index.js'))});`);
async function startRelay() {
    const probe = http.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); relayPort = probe.address().port; await new Promise(r => probe.close(r));
    relay = fork(harness, [], { cwd: ROOT, env: { ...process.env, PORT: String(relayPort), DATABASE_URL: '', STEAM_PURCHASES_ENABLED: '0', WOD_DATA_DIR: dataDir, WOD_MIN_CLIENT_BUILD: '', WOD_VERSION_GATE: '' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    relay.stdout.on('data', b => relayLog += b); relay.stderr.on('data', b => relayLog += b);
    for(let i = 0; i < 100; i++) { try { const r = await fetch('http://127.0.0.1:' + relayPort + '/health'); if(r.ok) return; } catch(_) {} await sleep(50); }
    throw Error('Relay failed: ' + relayLog);
}
// A bare relay socket (no game page), registered under a name.
const sockets = [];
async function peer(name) {
    const socket = new WebSocket('ws://127.0.0.1:' + relayPort), messages = [];
    socket.on('message', raw => messages.push(JSON.parse(raw)));
    const wait = async (type, pred = () => true) => { for(let i = 0; i < 400; i++) { const at = messages.findIndex(m => m.t === type && pred(m)); if(at >= 0) return messages.splice(at, 1)[0]; await sleep(25); } throw Error(name + ': missing ' + type + ': ' + JSON.stringify(messages).slice(0, 600)); };
    await wait('welcome');
    const send = m => socket.send(JSON.stringify(m));
    send(H.relayHello());
    send({ t: 'register_player', playerId: 'WOD-' + crypto.randomBytes(2).toString('hex').toUpperCase() + '-TEST', deviceSecret: crypto.randomBytes(32).toString('hex'), displayName: name });
    const p = { name, socket, send, wait, messages, id: (await wait('registered')).playerId };
    p.profile = () => send({ t: 'lobby_profile', playerId: p.id, displayName: name });
    sockets.push(p);
    return p;
}

const server = H.createStaticServer();
(async () => {
    await startRelay();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const browser = await H.launchBrowser();
    const errors = [];
    try {
        // Ana and Ben start a match with two computer seats
        const ana = await peer('Ana'), ben = await peer('Ben');
        ana.send({ t: 'create_lobby', name: 'Running match', meta: { seatTypes: ['human', 'human', 'bot', 'bot'], aiCount: 2 } });
        const room = (await ana.wait('joined')).code;
        ana.profile();
        ben.send({ t: 'join_lobby', id: room, playerId: ben.id });
        await ben.wait('joined');
        ben.profile();
        await sleep(300);
        ana.send({ t: 'start', payload: { probe: true } });
        await ana.wait('match_start');
        // Cleo hosts an open lobby, Dev one with a password
        const cleo = await peer('Cleo'), dev = await peer('Dev');
        cleo.send({ t: 'create_lobby', name: 'Open lobby', meta: { seatTypes: ['human', 'human', 'bot', 'closed'] } });
        await cleo.wait('joined');
        dev.send({ t: 'create_lobby', name: 'Locked lobby', password: 'secret', meta: { seatTypes: ['human', 'human', 'closed', 'closed'] } });
        await dev.wait('joined');

        const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
        await context.addInitScript(ws => { window.WOD_MP_WS_URL = ws; }, 'ws://127.0.0.1:' + relayPort);
        const page = await context.newPage();
        page.on('pageerror', e => errors.push(e.stack));
        await page.goto('http://127.0.0.1:' + server.address().port + '/');
        await page.waitForFunction(() => typeof WodMultiplayer === 'object' && WodMultiplayer.api.socketOpen && !window._wodBootBusy && gameState === 'MENU', null, { timeout: 120000 });
        await page.evaluate(() => { wodDismissChangelogPopup(); showPanel('multiplayer'); });
        await page.waitForFunction(() => document.querySelectorAll('#mpLobbyList .mp-lobby-row').length === 3, null, { timeout: 30000 });
        const view = () => page.evaluate(() => ({
            filter: document.querySelector('#mpPaneBrowse [data-lobby-filter].active')?.dataset.lobbyFilter,
            counts: Object.fromEntries([...document.querySelectorAll('#mpPaneBrowse [data-lobby-filter]')].map(b => [b.dataset.lobbyFilter, b.querySelector('.mp-lobby-filter-n').textContent])),
            sections: [...document.querySelectorAll('#mpLobbyList .mp-lobby-section')].map(s => s.textContent.replace(/\s+/g, ' ').trim()),
            rows: [...document.querySelectorAll('#mpLobbyList .mp-lobby-row')].map(r => r.querySelector('.mp-lobby-name').textContent.replace('🔒', '').trim()),
            text: document.getElementById('mpLobbyList').innerText
        }));
        const all = await view();
        assert.equal(all.filter, 'all', 'all games are shown by default');
        assert.deepEqual(all.counts, { all: '3', open: '2', locked: '1' }, 'the filter counts the games');
        assert.deepEqual(all.sections, ['Lobbies 2', 'Ongoing matches 1'], 'lobbies, then ongoing matches: ' + JSON.stringify(all.sections));
        assert.equal(all.rows[2], 'Running match', 'the match being played is listed after the lobbies');
        assert.match(all.text, /Match in progress · just started/i, 'it says the match is under way and for how long');
        assert.match(all.text, /Players: Ana, Ben$/m, 'and who is playing');
        assert.match(all.text, /2 online/);
        const listed = await page.evaluate(() => WodMultiplayer.api.lobbies.find(l => l.inProgress));
        assert.ok(Number.isFinite(listed.startedAgoSec) && listed.startedAgoSec >= 0 && listed.startedAgoSec < 60, 'the relay says how long ago the match began: ' + listed.startedAgoSec);
        await page.screenshot({ path: path.join(OUT, 'all.png') });

        await page.locator('#mpPaneBrowse [data-lobby-filter="open"]').click();
        const open = await view();
        assert.equal(open.filter, 'open');
        assert.deepEqual(open.rows, ['Open lobby', 'Running match'], 'Open hides the game with a password');
        await page.screenshot({ path: path.join(OUT, 'open.png') });

        await page.locator('#mpPaneBrowse [data-lobby-filter="locked"]').click();
        const locked = await view();
        assert.deepEqual(locked.rows, ['Locked lobby'], 'Password shows only games with a password');
        assert.deepEqual(locked.sections, ['Lobbies 1'], 'no ongoing section when no match fits the filter');

        // the filter stays as picked when the list updates; with nothing to show it says so
        dev.send({ t: 'leave' });
        await page.waitForFunction(() => /No games with a password/.test(document.getElementById('mpLobbyList').innerText), null, { timeout: 15000 });
        assert.equal((await view()).filter, 'locked', 'the filter is kept when the list updates');
        await page.screenshot({ path: path.join(OUT, 'locked-empty.png') });
        await page.locator('#mpLobbyList .mp-lobby-show-all').click();
        const back = await view();
        assert.equal(back.filter, 'all', 'Show all games goes back to all games');
        assert.deepEqual(back.rows, ['Open lobby', 'Running match']);

        // phone width: the filter and the sections fit
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(300);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert.ok(overflow <= 0, 'no sideways scroll at phone width: ' + overflow);
        await page.screenshot({ path: path.join(OUT, 'phone.png') });

        assert.deepEqual(errors, [], 'no page errors');
        console.log(JSON.stringify({ all, open: open.rows, locked: locked.rows }));
        console.log('verify-mp-game-browser: OK');
    } finally {
        for(const s of sockets) try { s.socket.close(); } catch(_) {}
        await browser.close(); server.close(); if(relay) relay.kill();
    }
})().catch(e => { console.error(e); console.error(relayLog.slice(-800)); process.exitCode = 1; });
