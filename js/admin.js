// Admin tools: the multiplayer hub's Admin tab, shown only to a player the relay names an admin (registered.admin, from
// WOD_ADMIN_PLAYER_IDS on the relay; server/admin.js checks every request again). Find any player or clan, rename a player
// or a clan, remove a clan member, make a member the clan's leader, or disband a clan. Changes apply at once and are logged.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

const WodAdmin = { view: 'clans', query: { players: '', clans: '' }, players: null, clans: null, clan: null, log: null, status: '', statusKind: '', renaming: null };
function wodAdminEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function wodAdminIs() { return typeof WodMultiplayer !== 'undefined' && !!WodMultiplayer.api && !!WodMultiplayer.api.admin && !!WodMultiplayer.api.registered; }
function wodAdminSend(msg) {
    if(!wodAdminIs()) return false;
    WodMultiplayer.adminSend(msg);
    return true;
}
function wodAdminDate(at) { return at ? new Date(at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'; }
function wodAdminTime(at) { return at ? new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; }
// The tab exists only while the relay says this player is an admin.
function wodAdminSyncTab() {
    const tab = document.getElementById('mpTabAdmin'), on = wodAdminIs();
    if(tab) tab.hidden = !on;
    const pane = document.getElementById('mpPaneAdmin');
    if(!on && pane) { pane.innerHTML = ''; if(pane.classList.contains('active') && typeof wodMpSwitchHubTab === 'function') wodMpSwitchHubTab('browse'); }
}
function wodAdminOnHubTab(tabId) {
    if(tabId !== 'admin') return;
    wodAdminRender();
    wodAdminRefresh();
}
function wodAdminRefresh() {
    const A = WodAdmin;
    if(A.view === 'players') wodAdminSend({ t: 'admin_players', query: A.query.players });
    else if(A.view === 'clans') {
        wodAdminSend({ t: 'admin_clans', query: A.query.clans });
        if(A.clan) wodAdminSend({ t: 'admin_clan', clanId: A.clan.id });
    } else wodAdminSend({ t: 'admin_log' });
}
function wodAdminSetStatus(msg, kind) { WodAdmin.status = msg || ''; WodAdmin.statusKind = kind || ''; }
function wodAdminOnMessage(m) {
    const A = WodAdmin;
    switch(m.t) {
        case 'admin_players': A.players = m.players || []; break;
        case 'admin_clans': A.clans = m.clans || []; break;
        case 'admin_clan': A.clan = m.clan || null; break;
        case 'admin_log': A.log = m.entries || []; break;
        case 'admin_done':
            wodAdminSetStatus(m.msg, 'ok');
            A.renaming = null;
            if(m.disbanded && A.clan && A.clan.id === m.clanId) A.clan = null;
            wodAdminRefresh();
            break;
        case 'admin_error':
            wodAdminSetStatus(m.msg, 'error');
            if(/no longer exists/i.test(m.msg || '')) A.clan = null;
            break;
        default: return;
    }
    wodAdminRender();
}
addEventListener('wod-mp-Admin', ev => wodAdminOnMessage(ev.detail || {}));
addEventListener('wod-mp-Registered', () => wodAdminSyncTab());
addEventListener('wod-mp-RegisterFailed', () => wodAdminSyncTab());
addEventListener('wod-mp-Close', () => wodAdminSyncTab());

// ---------------------------------------------------------------- rendering
function wodAdminRenameForm(kind, id, current) {
    const r = WodAdmin.renaming, value = r && r.kind === kind && r.id === id ? r.value : current;
    return '<form class="adm-rename" data-adm-rename-form="' + kind + '" data-adm-id="' + wodAdminEsc(id) + '">' +
        '<input type="text" class="adm-input" maxlength="24" value="' + wodAdminEsc(value) + '" aria-label="New name" autocomplete="off">' +
        '<button type="submit" class="wod-editor-btn">Save</button><button type="button" class="wod-editor-btn" data-adm-cancel>Cancel</button></form>';
}
function wodAdminRenaming(kind, id) { const r = WodAdmin.renaming; return !!r && r.kind === kind && r.id === id; }
function wodAdminFlagHtml(flagged) { return flagged ? '<span class="adm-tag adm-tag--warn" title="Someone else had this name first: others see &quot;thanks for noticing&quot; until it is renamed">shows as “thanks for noticing”</span>' : ''; }
function wodAdminPlayersHtml() {
    const list = WodAdmin.players;
    if(!list) return '<p class="adm-empty">Loading…</p>';
    if(!list.length) return '<p class="adm-empty">No player matches.</p>';
    return '<ul class="adm-list">' + list.map(p => '<li class="adm-row">' +
        '<div class="adm-row-main"><span class="adm-name">' + wodAdminEsc(p.name || '(no name)') + '</span>' +
        (p.online ? '<span class="adm-tag adm-tag--on">online</span>' : '') + (p.admin ? '<span class="adm-tag">admin</span>' : '') +
        (p.steam ? '<span class="adm-tag">Steam</span>' : '') + wodAdminFlagHtml(p.flagged) +
        '<button type="button" class="adm-id" data-adm-copy="' + wodAdminEsc(p.playerId) + '" title="Copy the player ID">' + wodAdminEsc(p.playerId) + '</button></div>' +
        '<div class="adm-row-meta">' + (p.gamesPlayed | 0) + ' games · ' + (p.wins | 0) + ' wins · ' +
        (p.clan ? 'clan <button type="button" class="adm-link" data-adm-open-clan="' + wodAdminEsc(p.clan.id) + '">' + wodAdminEsc(p.clan.name) + '</button>' : 'no clan') +
        ' · profile ' + wodAdminDate(p.createdAt) + ' · last active ' + wodAdminDate(p.updatedAt) + '</div>' +
        (wodAdminRenaming('player', p.playerId) ? wodAdminRenameForm('player', p.playerId, p.name) :
            '<div class="adm-row-actions"><button type="button" class="wod-editor-btn" data-adm-rename="player" data-adm-id="' + wodAdminEsc(p.playerId) + '" data-adm-name="' + wodAdminEsc(p.name) + '">Rename</button></div>') +
        '</li>').join('') + '</ul>';
}
function wodAdminClanDetailHtml(c) {
    return '<section class="adm-clan" aria-label="Clan ' + wodAdminEsc(c.name) + '">' +
        '<div class="adm-clan-head"><div><span class="adm-name adm-name--lg">' + wodAdminEsc(c.name) + '</span>' + wodAdminFlagHtml(c.nameFlagged) +
        '<button type="button" class="adm-id" data-adm-copy="' + wodAdminEsc(c.id) + '" title="Copy the clan ID">' + wodAdminEsc(c.id) + '</button></div>' +
        '<button type="button" class="wod-editor-btn" data-adm-close-clan>Close</button></div>' +
        '<div class="adm-row-meta">' + c.members + ' members · ' + wodAdminEsc(c.visibility) + ' · ' + (c.wins | 0) + ' war wins · founded ' + wodAdminDate(c.createdAt) + ' · code ' + wodAdminEsc(c.code) + '</div>' +
        (c.description ? '<p class="adm-desc">' + wodAdminEsc(c.description) + '</p>' : '') +
        (wodAdminRenaming('clan', c.id) ? wodAdminRenameForm('clan', c.id, c.name) :
            '<div class="adm-row-actions"><button type="button" class="wod-editor-btn" data-adm-rename="clan" data-adm-id="' + wodAdminEsc(c.id) + '" data-adm-name="' + wodAdminEsc(c.name) + '">Rename clan</button>' +
            '<button type="button" class="wod-editor-btn clan-danger" data-adm-disband="' + wodAdminEsc(c.id) + '">Disband clan</button></div>') +
        '<h4 class="adm-sub-h">Members</h4><ul class="adm-list">' + (c.memberList || []).map(m => '<li class="adm-row adm-row--member">' +
            '<div class="adm-row-main"><span class="adm-name">' + wodAdminEsc(m.name) + '</span>' + (m.leader ? '<span class="adm-tag adm-tag--gold">leader</span>' : '') +
            (m.online ? '<span class="adm-tag adm-tag--on">online</span>' : '') + '<button type="button" class="adm-id" data-adm-copy="' + wodAdminEsc(m.playerId) + '">' + wodAdminEsc(m.playerId) + '</button></div>' +
            '<div class="adm-row-meta">joined ' + wodAdminDate(m.joinedAt) + ' · last seen ' + wodAdminDate(m.lastSeenAt) + '</div>' +
            '<div class="adm-row-actions">' + (m.leader ? '' : '<button type="button" class="wod-editor-btn" data-adm-leader="' + wodAdminEsc(m.playerId) + '" data-adm-name="' + wodAdminEsc(m.name) + '">Make leader</button>') +
            '<button type="button" class="wod-editor-btn clan-danger" data-adm-kick="' + wodAdminEsc(m.playerId) + '" data-adm-name="' + wodAdminEsc(m.name) + '">Remove</button></div></li>').join('') + '</ul></section>';
}
function wodAdminClansHtml() {
    const A = WodAdmin, list = A.clans;
    let html = A.clan ? wodAdminClanDetailHtml(A.clan) : '';
    if(!list) return html + '<p class="adm-empty">Loading…</p>';
    if(!list.length) return html + '<p class="adm-empty">No clan matches.</p>';
    return html + '<ul class="adm-list">' + list.map(c => '<li class="adm-row' + (A.clan && A.clan.id === c.id ? ' adm-row--open' : '') + '">' +
        '<div class="adm-row-main"><button type="button" class="adm-link adm-name" data-adm-open-clan="' + wodAdminEsc(c.id) + '">' + wodAdminEsc(c.name) + '</button>' +
        wodAdminFlagHtml(c.nameFlagged) + '<span class="adm-id-plain">' + wodAdminEsc(c.id) + '</span></div>' +
        '<div class="adm-row-meta">led by ' + wodAdminEsc(c.leaderName) + ' (' + wodAdminEsc(c.leaderId) + ') · ' + c.members + ' members · ' + wodAdminEsc(c.visibility) + ' · founded ' + wodAdminDate(c.createdAt) + '</div></li>').join('') + '</ul>';
}
function wodAdminLogHtml() {
    const log = WodAdmin.log;
    if(!log) return '<p class="adm-empty">Loading…</p>';
    if(!log.length) return '<p class="adm-empty">No admin changes since the relay last started. (The relay\'s own log on the hosting service keeps all of them.)</p>';
    return '<ul class="adm-list adm-log">' + log.map(e => '<li class="adm-row"><div class="adm-row-meta"><strong>' + wodAdminEsc(wodAdminTime(e.at)) + '</strong> · ' + wodAdminEsc(e.byName) +
        ' ' + wodAdminEsc(e.action) + ' <span class="adm-id-plain">' + wodAdminEsc(e.target) + '</span>' + (e.detail ? ': ' + wodAdminEsc(e.detail) : '') + '</div></li>').join('') + '</ul>';
}
function wodAdminRender() {
    const pane = document.getElementById('mpPaneAdmin');
    if(!pane) return;
    if(!wodAdminIs()) { pane.innerHTML = ''; return; }
    const A = WodAdmin, views = [['clans', 'Clans'], ['players', 'Players'], ['log', 'Log']];
    let html = '<div class="adm"><header class="adm-head"><h3 class="adm-title">Admin</h3><p class="adm-lead">Only admins see this tab. Changes apply at once, players and clan members are told, and every change is logged.</p></header>' +
        '<div class="adm-views" role="tablist" aria-label="Admin sections">' + views.map(([id, label]) => '<button type="button" class="adm-view' + (A.view === id ? ' active' : '') + '" role="tab" aria-selected="' + (A.view === id) + '" data-adm-view="' + id + '">' + label + '</button>').join('') + '</div>';
    if(A.status) html += '<p class="adm-status adm-status--' + A.statusKind + '" role="status">' + wodAdminEsc(A.status) + '</p>';
    if(A.view !== 'log') html += '<form class="adm-search" data-adm-search><input type="search" class="adm-input" maxlength="40" value="' + wodAdminEsc(A.query[A.view]) + '" placeholder="' +
        (A.view === 'players' ? 'Name or player ID (empty: everyone)' : 'Clan name or ID (empty: every clan)') + '" aria-label="Search"><button type="submit" class="wod-editor-btn">Search</button></form>';
    html += A.view === 'players' ? wodAdminPlayersHtml() : A.view === 'clans' ? wodAdminClansHtml() : wodAdminLogHtml();
    pane.innerHTML = html + '</div>';
    const rename = pane.querySelector('[data-adm-rename-form] input');
    if(rename) { rename.oninput = () => { if(WodAdmin.renaming) WodAdmin.renaming.value = rename.value; }; if(document.activeElement === document.body) rename.focus(); }
    pane.onclick = wodAdminOnClick;
    pane.onsubmit = wodAdminOnSubmit;
}

// ---------------------------------------------------------------- actions
async function wodAdminConfirm(title, body, label) {
    if(typeof wodShowConfirmDialog === 'function') return wodShowConfirmDialog({ title, body, confirmLabel: label, danger: true });
    return confirm(title + '\n\n' + body);
}
async function wodAdminOnClick(ev) {
    const el = ev.target.closest('button');
    if(!el) return;
    const A = WodAdmin, d = el.dataset;
    if(d.admView) { A.view = d.admView; A.renaming = null; wodAdminSetStatus(''); wodAdminRender(); wodAdminRefresh(); return; }
    if(d.admCopy) { try { await navigator.clipboard.writeText(d.admCopy); wodAdminSetStatus('Copied ' + d.admCopy + '.', 'ok'); } catch(_) { wodAdminSetStatus(d.admCopy, 'ok'); } wodAdminRender(); return; }
    if(d.admRename) { A.renaming = { kind: d.admRename, id: d.admId, value: d.admName || '' }; wodAdminRender(); const input = document.querySelector('#mpPaneAdmin [data-adm-rename-form] input'); if(input) { input.focus(); input.select(); } return; }
    if('admCancel' in d) { A.renaming = null; wodAdminRender(); return; }
    if(d.admOpenClan) { A.view = 'clans'; A.renaming = null; A.clan = { id: d.admOpenClan, name: '…', members: 0, memberList: [] }; wodAdminSetStatus(''); wodAdminRender(); wodAdminSend({ t: 'admin_clan', clanId: d.admOpenClan }); if(!A.clans) wodAdminSend({ t: 'admin_clans', query: A.query.clans }); return; }
    if('admCloseClan' in d) { A.clan = null; A.renaming = null; wodAdminRender(); return; }
    const clan = A.clan;
    if(d.admLeader && clan) {
        if(await wodAdminConfirm('Make ' + d.admName + ' the leader of ' + clan.name + '?', 'The present leader stays in the clan as a member. The clan is told in its chat.', 'Make leader'))
            wodAdminSend({ t: 'admin_set_leader', clanId: clan.id, playerId: d.admLeader });
        return;
    }
    if(d.admKick && clan) {
        const last = clan.members <= 1;
        if(await wodAdminConfirm('Remove ' + d.admName + ' from ' + clan.name + '?', last ? 'They are its only member, so the clan and its records will be gone.' : 'They leave the clan; to come back they have to join or apply again.' + (clan.leaderId === d.admKick ? ' The highest-ranked member becomes the leader.' : ''), 'Remove'))
            wodAdminSend({ t: 'admin_kick', clanId: clan.id, playerId: d.admKick });
        return;
    }
    if(d.admDisband) {
        const name = clan ? clan.name : d.admDisband;
        if(await wodAdminConfirm('Disband ' + name + '?', 'Every member leaves, and the clan, its chat and its war records are deleted for good. This cannot be undone.', 'Disband'))
            wodAdminSend({ t: 'admin_disband', clanId: d.admDisband });
    }
}
function wodAdminOnSubmit(ev) {
    ev.preventDefault();
    const form = ev.target, A = WodAdmin, input = form.querySelector('input');
    if(form.hasAttribute('data-adm-search')) {
        A.query[A.view] = input ? input.value.trim() : '';
        if(A.view === 'players') A.players = null; else A.clans = null;
        wodAdminSetStatus('');
        wodAdminRender();
        wodAdminRefresh();
        return;
    }
    const kind = form.getAttribute('data-adm-rename-form'), id = form.getAttribute('data-adm-id'), name = input ? input.value.trim() : '';
    if(!kind || !name) return;
    wodAdminSend(kind === 'player' ? { t: 'admin_rename_player', playerId: id, name } : { t: 'admin_rename_clan', clanId: id, name });
}
