'use strict';
// The multiplayer version check, the update notices and the clan browser, against the real relay in real game pages.
//  1. relay: the welcome names the newest build (the date of the newest changelog entry) and its version number. A bare
//     socket that never says which build it is (a game from before the check), or names an older one, may not host,
//     join or queue for a clan war; one on the current build may. A player coming back to a match already running gets
//     back in either way.
//  2. current: an up-to-date game is not out of date, shows no banner and no notice, and hosts a lobby.
//  3. outdated: a game served a changelog without its newest entry (one version behind). On the main menu it warns
//     once, only after the changelog closes, and not again on the menu; the multiplayer screen shows a banner; hosting
//     and joining are refused (by the game and, past it, by the relay) and open the multiplayer notice each time; it
//     can still browse clans; back on the menu from a match it warns again only when the warning has not been seen for
//     this version. A second out-of-date game warned in multiplayer first gets no menu warning, even after a reload.
//  4. browser: the clan browser tab lists every clan, ordered by members, members online, newest or name, filtered to
//     public or private ones, searched by name and paged; View opens a clan; a player without a clan joins from a row,
//     and from then on the browser shows their clan and offers no joins.
// Usage: node scripts/verify-mp-update-gate.js [--only relay,current,outdated,browser]
const H = require('./lib/harness');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert/strict'), crypto = require('crypto'), { fork } = require('child_process');
const { WebSocket } = require('../server/node_modules/ws');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'output/mp-update-gate');
fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7) || (process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : '');
const want = phase => !ONLY || ONLY.split(',').includes(phase);
const dataDir = fs.mkdtempSync(path.join(OUT, 'relay-')), errors = [], results = {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
let relay, relayPort, relayLog = '';
const harness = path.join(OUT, 'relay.cjs');
// (Windows can hold a just-written file for a moment, so the relay's local profile file is renamed with a few retries
// here; a failure is logged. The deployed relay keeps profiles in its database.)
fs.writeFileSync(harness, `const fs=require('fs'),rename=fs.renameSync;fs.renameSync=(a,b)=>{for(let i=0;;i++){try{return rename(a,b);}catch(e){if(i>=20||!/EPERM|EBUSY|EACCES/.test(e.code))throw e;console.error('rename retry '+e.code);const t=Date.now()+25;while(Date.now()<t);}}};require(${JSON.stringify(path.join(ROOT, 'server/index.js'))});`);
async function startRelay() {
    const probe = http.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); relayPort = probe.address().port; await new Promise(r => probe.close(r));
    relay = fork(harness, [], { cwd: ROOT, env: { ...process.env, PORT: String(relayPort), DATABASE_URL: '', STEAM_PURCHASES_ENABLED: '0', WOD_MIN_MATCH_SECONDS: '0', WOD_DATA_DIR: dataDir, WOD_MP_GRACE_MS: '3000', WOD_MIN_CLIENT_BUILD: '', WOD_VERSION_GATE: '' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    relay.stdout.on('data', b => relayLog += b); relay.stderr.on('data', b => relayLog += b);
    for(let i = 0; i < 100; i++) { try { const r = await fetch('http://127.0.0.1:' + relayPort + '/health'); if(r.ok) return; } catch(_) {} await sleep(50); }
    throw Error('Relay failed: ' + relayLog);
}
// The newest build and its version number, as the game counts them (js/main.js: the oldest entry is 1.0).
const CHANGELOG = require('vm').runInNewContext(fs.readFileSync(path.join(ROOT, 'js/changelog.js'), 'utf8') + '\n;WOD_CHANGELOG', {});
const versionOf = count => Math.floor((count + 9) / 10) + '.' + (count + 9) % 10;
const LATEST = { build: H.relayHello().build, version: versionOf(CHANGELOG.length) }, BEHIND = versionOf(CHANGELOG.length - 1);

// A bare relay socket (no game page). hello: the message saying which build it is, or none.
const sockets = [];
async function peer(name, { hello = H.relayHello(), secret = crypto.randomBytes(32).toString('hex'), id } = {}) {
    const socket = new WebSocket('ws://127.0.0.1:' + relayPort), messages = [];
    socket.on('message', raw => messages.push(JSON.parse(raw)));
    const wait = async (type, pred = () => true) => { for(let i = 0; i < 400; i++) { const at = messages.findIndex(m => m.t === type && pred(m)); if(at >= 0) return messages.splice(at, 1)[0]; await sleep(25); } throw Error(name + ': missing ' + type + ': ' + JSON.stringify(messages).slice(0, 600)); };
    const welcome = await wait('welcome');
    const send = m => socket.send(JSON.stringify(m));
    if(hello) send(hello);
    send({ t: 'register_player', playerId: id || 'WOD-' + crypto.randomBytes(2).toString('hex').toUpperCase() + '-TEST', deviceSecret: secret, displayName: name });
    const p = { name, socket, send, wait, messages, welcome, secret, id: (await wait('registered')).playerId };
    sockets.push(p);
    return p;
}

const okServer = H.createStaticServer();
// (one version behind: the newest changelog entry taken out, as on a game that has not updated yet)
const oldServer = H.createStaticServer({ rewrite: p => p === '/js/changelog.js' ? fs.readFileSync(path.join(ROOT, 'js/changelog.js'), 'utf8') + '\n;WOD_CHANGELOG.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)); WOD_CHANGELOG.shift();' : undefined });

(async () => {
    await startRelay();
    await new Promise(r => okServer.listen(0, '127.0.0.1', r));
    await new Promise(r => oldServer.listen(0, '127.0.0.1', r));
    const okUrl = 'http://127.0.0.1:' + okServer.address().port, oldUrl = 'http://127.0.0.1:' + oldServer.address().port;
    const browser = await H.launchBrowser();
    async function game(name, url) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await context.addInitScript(ws => { window.WOD_MP_WS_URL = ws; }, 'ws://127.0.0.1:' + relayPort);
        const page = await context.newPage();
        page.on('pageerror', e => errors.push(name + ': ' + e.stack));
        page.on('console', m => { if(m.type() === 'error' && !/net::ERR|Failed to load resource/.test(m.text())) errors.push(name + ' console: ' + m.text()); });
        const g = { name, context, page };
        g.boot = async () => {
            await page.goto(url + '/');
            await page.waitForFunction(() => typeof WodMultiplayer === 'object' && WodMultiplayer.api.registered && WodMultiplayer.api.latestBuild && !window._wodBootBusy && gameState === 'MENU', null, { timeout: 120000 });
        };
        // the confirm dialog's title while it is open, else ''
        g.dialog = () => page.evaluate(() => { const d = document.getElementById('wodConfirmDlg'); return d && !d.classList.contains('hidden') ? document.getElementById('wodConfirmDlgTitle').textContent : ''; });
        g.waitDialog = title => page.waitForFunction(t => { const d = document.getElementById('wodConfirmDlg'); return d && !d.classList.contains('hidden') && document.getElementById('wodConfirmDlgTitle').textContent === t; }, title, { timeout: 15000 });
        g.later = async () => { await page.click('#wodConfirmDlgCancel'); await page.waitForFunction(() => document.getElementById('wodConfirmDlg').classList.contains('hidden')); };
        g.noDialogFor = async ms => { await sleep(ms); assert.equal(await g.dialog(), '', name + ': no notice expected'); };
        g.host = () => page.evaluate(() => WodMultiplayer.createLobby({ name: 'Gate test', meta: { seatTypes: ['human', 'human', 'closed', 'closed'] } }).then(() => 'ok', e => e.code || e.message));
        g.openMp = () => page.evaluate(() => { showPanel('multiplayer'); wodMpWireLobbyUi(); });
        await g.boot();
        return g;
    }
    try {
        if(want('relay')) {
            const old = await peer('No hello', { hello: null }), stale = await peer('Old build', { hello: { t: 'hello', build: '2020-01-01T00:00:00Z', version: '1.0' } }), cur = await peer('Current build');
            assert.equal(cur.welcome.latestBuild, LATEST.build, 'the relay knows the newest build');
            assert.equal(cur.welcome.latestVersion, LATEST.version);
            assert.equal(cur.welcome.minBuild, LATEST.build, 'by default only the newest build may play');
            for(const p of [old, stale]) {
                p.send({ t: 'create_lobby', name: 'x', meta: { seatTypes: ['human', 'human', 'closed', 'closed'] } });
                const refused = await p.wait('error');
                assert.equal(refused.reason, 'outdated', p.name + ' may not host');
                assert.match(refused.msg, new RegExp('out of date.*version ' + LATEST.version.replace('.', '\\.')), p.name);
                p.send({ t: 'cw_queue', tier: '1v1' });
                assert.equal((await p.wait('cw_error')).reason, 'outdated', p.name + ' may not queue for a clan war');
            }
            cur.send({ t: 'create_lobby', name: 'Current', meta: { seatTypes: ['human', 'human', 'closed', 'closed'] } });
            const code = (await cur.wait('joined')).code;
            old.send({ t: 'join_lobby', id: code, playerId: old.id });
            assert.equal((await old.wait('error')).reason, 'outdated', 'an old game may not join');
            const mate = await peer('Mate');
            mate.send({ t: 'join_lobby', id: code, playerId: mate.id }); await mate.wait('joined');
            cur.send({ t: 'start', payload: { entities: [1, 2].map(owner => ({ id: owner, owner })), cities: [1, 2].map(owner => ({ id: owner, owner })), hexList: [1, 2].map(owner => ({ q: owner, r: 0, owner })), factionSlots: [1, 2], humanSlots: [1, 2] } });
            await mate.wait('match_start');
            mate.socket.close(); await cur.wait('player_link_lost');
            // (coming back on a socket that never says its build: it was let in when the match started)
            const back = await peer('Mate again', { hello: null, secret: mate.secret, id: mate.id });
            back.send({ t: 'join_lobby', id: code, playerId: mate.id, rejoin: true });
            await back.wait('rejoin_match');
            cur.send({ t: 'leave' }); back.send({ t: 'leave' });
            results.relay = { latest: LATEST, refused: ['no hello', 'old build'], rejoin: true };
        }
        if(want('current')) {
            const g = await game('current', okUrl);
            const state = await g.page.evaluate(() => ({ outdated: WodMultiplayer.api.outdated, build: wodClientBuild(), version: wodClientVersion(), latest: WodMultiplayer.api.latestVersion }));
            assert.deepEqual(state, { outdated: false, build: LATEST.build, version: LATEST.version, latest: LATEST.version });
            await g.page.evaluate(() => wodDismissChangelogPopup());
            await g.noDialogFor(1200);
            await g.openMp();
            assert.equal(await g.page.evaluate(() => { const b = document.getElementById('wodMpUpdateBanner'); return !!b && !b.hidden; }), false, 'no banner when up to date');
            assert.equal(await g.host(), 'ok', 'an up-to-date game hosts');
            await g.page.evaluate(() => WodMultiplayer.leaveLobby());
            await g.context.close();
            results.current = state;
        }
        if(want('outdated')) {
            const a = await game('outdated A', oldUrl);
            assert.deepEqual(await a.page.evaluate(() => ({ outdated: WodMultiplayer.api.outdated, version: wodClientVersion() })), { outdated: true, version: BEHIND });
            // the start-up changelog first: no notice on top of it
            assert.equal(await a.page.evaluate(() => !document.getElementById('wodChangelogPopup').classList.contains('hidden')), true, 'the changelog opens at start-up');
            await a.noDialogFor(1000);
            await a.page.evaluate(() => wodDismissChangelogPopup());
            await a.waitDialog('A new version of Simple Wars is out');
            const body = await a.page.textContent('#wodConfirmDlgBody'), ok = await a.page.textContent('#wodConfirmDlgOk');
            assert.match(body, new RegExp('version ' + BEHIND.replace('.', '\\.') + '.*latest is ' + LATEST.version.replace('.', '\\.')));
            assert.match(body, /Reload the page/);
            assert.equal(ok, 'Reload now');
            await a.page.screenshot({ path: path.join(OUT, 'menu-notice.png') });
            await a.later();
            assert.equal(await a.page.evaluate(() => localStorage.getItem('wodUpdateNoticeForV1')), LATEST.build, 'seen for this version');
            await a.page.evaluate(() => wodMaybeWarnOutdatedOnMenu());
            await a.noDialogFor(600);
            // the multiplayer screen: a banner; hosting and joining refused, each with the multiplayer notice
            await a.openMp();
            const banner = await a.page.evaluate(() => { const b = document.getElementById('wodMpUpdateBanner'); return b && !b.hidden ? b.textContent : ''; });
            assert.match(banner, /Update needed/);
            await a.page.screenshot({ path: path.join(OUT, 'mp-banner.png') });
            assert.equal(await a.host(), 'outdated', 'the game refuses to host');
            await a.waitDialog('Update to play multiplayer');
            await a.later();
            // past the game's own check, the relay refuses too (and the game shows the notice again)
            const relayRefusal = await a.page.evaluate(() => { WodMultiplayer.api.outdated = false; return WodMultiplayer.joinLobby('NOPE01', '').then(() => 'ok', e => e.code || e.message); });
            assert.equal(relayRefusal, 'outdated', 'the relay refuses to let it join');
            assert.equal(await a.page.evaluate(() => WodMultiplayer.api.outdated), true);
            await a.waitDialog('Update to play multiplayer');
            await a.later();
            // looking around is fine: the clan browser loads
            await a.page.evaluate(() => wodMpSwitchHubTab('clans'));
            await a.page.waitForFunction(() => WodClans.browse.loaded, null, { timeout: 15000 });
            // back on the menu from a match: the notice again, only as it has not been seen for this version
            await a.page.evaluate(() => { localStorage.removeItem('wodUpdateNoticeForV1'); hidePanels(); });
            await H.startSkirmish(a.page);
            await a.page.evaluate(() => wodMaybeWarnOutdatedOnMenu());
            await a.noDialogFor(800);
            await a.page.evaluate(() => returnToMenu());
            await a.waitDialog('A new version of Simple Wars is out');
            await a.later();
            await a.context.close();
            // warned in multiplayer first: no menu warning afterwards, nor after a reload
            const b = await game('outdated B', oldUrl);
            assert.equal(await b.host(), 'outdated');
            await b.waitDialog('Update to play multiplayer');
            await b.later();
            await b.page.evaluate(() => wodDismissChangelogPopup());
            await b.noDialogFor(1500);
            await b.boot();
            await b.page.evaluate(() => wodDismissChangelogPopup());
            await b.noDialogFor(1500);
            await b.context.close();
            results.outdated = { version: BEHIND, latest: LATEST.version, menuOnce: true, mpThenMenu: 'no second notice' };
        }
        if(want('browser')) {
            // 14 clans, made one after another: odd numbers public, even private; 05 and 07 have three members (one
            // of 05's offline), 09 two
            const founders = [];
            for(let i = 1; i <= 14; i++) {
                const p = await peer('Founder ' + i);
                p.send({ t: 'clan_create', name: 'Browser Clan ' + String(i).padStart(2, '0'), emblem: 'f:fr', visibility: i % 2 ? 'public' : 'private', description: 'Clan number ' + i });
                await p.wait('clan_info');
                founders.push(p);
                await sleep(8);
            }
            const ids = {};
            founders[0].send({ t: 'clan_list', browse: true, sort: 'name', pageSize: 20 });
            for(const c of (await founders[0].wait('clan_list', m => m.browse)).clans) ids[c.name.slice(-2)] = c.id;
            const extra = [];
            for(const [clan, n] of [['05', 2], ['07', 2], ['09', 1]]) for(let k = 0; k < n; k++) {
                const p = await peer('Member ' + clan + k);
                p.send({ t: 'clan_join', clanId: ids[clan] }); await p.wait('clan_info', m => m.done === 'clan_join');
                extra.push({ clan, p });
            }
            extra.find(x => x.clan === '05').p.socket.close();
            await sleep(300);
            const g = await game('browser', okUrl);
            await g.page.evaluate(() => wodDismissChangelogPopup());
            await g.openMp();
            await g.page.click('#mpTabClanBrowse');
            const rows = () => g.page.evaluate(() => [...document.querySelectorAll('#clanBrowseResults .clan-browse-row')].map(r => ({
                name: r.querySelector('strong').textContent.replace(/\s*🔒/, '').trim(), meta: [...r.querySelectorAll('.clan-browse-meta')].map(m => m.textContent).join(' | '),
                locked: !!r.querySelector('.clan-lock'), join: !!r.querySelector('.clan-join-btn, .clan-apply-btn'), yours: !!r.querySelector('.clan-browse-yours') })));
            const settle = async pred => { await g.page.waitForFunction(() => WodClans.browse.loaded, null, { timeout: 15000 }); for(let i = 0; i < 80; i++) { const r = await rows(); if(pred(r)) return r; await sleep(50); } throw Error('Browser rows: ' + JSON.stringify(await rows())); };
            let r = await settle(r => r.length === 12);
            assert.equal(r[0].name, 'Browser Clan 05', 'most members first (05 and 07 tie at three; 05 by name)');
            assert.equal(r[1].name, 'Browser Clan 07');
            assert.match(r[0].meta, /3 members · 2 online · 0 war wins \| Led by Founder 5 · founded today · public/);
            assert(r.every(x => x.join), 'a player without a clan can join or apply from every row');
            assert.match(await g.page.textContent('#clanBrowseResults .clan-results-head'), /^14 clans/);
            assert.equal(await g.page.textContent('#clanBrowseResults .clan-page-label'), 'Page 1 / 2');
            await g.page.screenshot({ path: path.join(OUT, 'clan-browser.png') });
            await g.page.click('#clanBrowseResults .clan-browse-next');
            r = await settle(r => r.length === 2);
            await g.page.selectOption('#clanBrowseSort', 'online');
            r = await settle(r => r.length === 12 && r[0].name === 'Browser Clan 07');
            assert.match(r[0].meta, /3 online/);
            await g.page.selectOption('#clanBrowseSort', 'newest');
            r = await settle(r => r[0] && r[0].name === 'Browser Clan 14');
            assert.equal(r[1].name, 'Browser Clan 13');
            await g.page.selectOption('#clanBrowseSort', 'name');
            r = await settle(r => r[0] && r[0].name === 'Browser Clan 01');
            await g.page.click('[data-browse-filter="private"]');
            r = await settle(r => r.length === 7 && r.every(x => x.locked));
            assert.match(await g.page.textContent('#clanBrowseResults .clan-results-head'), /^7 private clans \(of 14 clans\)/);
            await g.page.click('[data-browse-filter="all"]');
            await g.page.fill('#clanBrowseSearch', 'clan 1');
            r = await settle(r => r.length === 5);
            assert.deepEqual(r.map(x => x.name), ['10', '11', '12', '13', '14'].map(n => 'Browser Clan ' + n));
            // View opens the clan's page
            await g.page.click('#clanBrowseResults .clan-browse-row:first-child .clan-view');
            await g.page.waitForFunction(() => { const d = document.getElementById('clanViewDlg'); return d && !d.hidden && /Browser Clan 10/.test(d.textContent); }, null, { timeout: 15000 });
            await g.page.click('#clanViewClose');
            // joining from a row: from then on the browser shows the player's clan and offers no joins
            await g.page.fill('#clanBrowseSearch', 'clan 03');
            r = await settle(r => r.length === 1);
            await g.page.click('#clanBrowseResults .clan-join-btn');
            await g.page.waitForFunction(() => WodClans.mine && WodClans.mine.name === 'Browser Clan 03', null, { timeout: 15000 });
            r = await settle(r => r.length === 1 && r[0].yours);
            await g.page.fill('#clanBrowseSearch', '');
            r = await settle(r => r.length === 12 && !r.some(x => x.join) && r.some(x => x.yours));
            assert.match(await g.page.textContent('#clanBrowseLead'), /You are in.*Browser Clan 03.*leave yours first/);
            await g.page.screenshot({ path: path.join(OUT, 'clan-browser-member.png') });
            await g.context.close();
            results.browser = { clans: 14, sorts: ['members', 'online', 'newest', 'name'], filter: 'private 7', search: 5, joined: 'Browser Clan 03' };
        }
        assert.deepEqual(errors, [], 'no page errors');
        fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
        console.log(JSON.stringify(results, null, 2));
        console.log('verify-mp-update-gate: OK');
    } catch(e) {
        console.error(e && e.stack || e);
        if(errors.length) console.error('Page errors:\n' + errors.join('\n'));
        console.error('Relay log (tail):\n' + relayLog.slice(-3000));
        process.exitCode = 1;
    } finally {
        for(const p of sockets) try { p.socket.close(); } catch(_) {}
        await browser.close().catch(() => {});
        okServer.close(); oldServer.close();
        if(relay) relay.kill('SIGTERM');
        setTimeout(() => process.exit(process.exitCode || 0), 300).unref();
    }
})();
