'use strict';
// Admin tools on the relay, for the players named in WOD_ADMIN_PLAYER_IDS (player IDs, WOD-XXXX-XXXX, separated by
// commas, set on the hosting service; a player's ID is shown on their multiplayer profile). An admin can find any player
// or clan, rename a player or a clan, remove a clan member, make another member the leader, and disband a clan.
// Only an admin is told they are one (registered.admin), so only they see the Admin tab (js/admin.js); every admin_
// message is checked here again, so a game that sends one without being an admin is refused. Each change is logged
// (the hosting service's log, and the last hundred in the Admin tab).
const { nameMatchKey } = require('./names');

function parseAdminIds(raw, sanitizePlayerId) {
    return new Set(String(raw || '').split(/[\s,;]+/).map(sanitizePlayerId).filter(Boolean));
}

function createAdmin(ctx) {
    const { adminIds, profiles, clans, sanitizePlayerId, knownPlayerNames, validateDisplayNameForPlayer, displayNameKey,
        playerNameFlagged, isOnline, onPlayerRenamed, onClanChanged, onClanDisbanded, onMemberRemoved, log = console.log, now = Date.now } = ctx;
    const history = [];
    const isAdmin = pid => !!pid && adminIds.has(pid);
    const nameOf = pid => String(profiles.getProfile(pid)?.profile.mpDisplayName || knownPlayerNames().get(pid) || pid);
    function record(by, action, target, detail) {
        const entry = { at: now(), by, byName: nameOf(by), action, target, detail: detail || '' };
        history.unshift(entry);
        if(history.length > 100) history.pop();
        log('[admin] ' + entry.byName + ' (' + by + ') ' + action + ' ' + target + (detail ? ': ' + detail : ''));
    }
    function playerRow(pid, names) {
        const p = profiles.getProfile(pid), name = String(p?.profile.mpDisplayName || names.get(pid) || '');
        const stats = p ? profiles.computeCombinedStats(p) || {} : {}, clan = clans.clanOf(pid);
        return { playerId: pid, name, flagged: !!name && playerNameFlagged(pid, name), online: isOnline(pid), admin: adminIds.has(pid),
            gamesPlayed: stats.gamesPlayed | 0, wins: stats.wins | 0, createdAt: p?.createdAt || 0, updatedAt: p?.updatedAt || 0,
            steam: !!profiles.steamIdForPlayer(pid), clan: clan ? { id: clan.id, name: clan.name } : null };
    }
    // Players whose name (read the way names are matched) contains the query, or with that player ID; most recently
    // active first.
    function findPlayers(query) {
        const names = knownPlayerNames(), id = sanitizePlayerId(query), q = nameMatchKey(String(query || ''));
        const pids = new Set();
        if(id) { if(profiles.getProfile(id) || names.has(id)) pids.add(id); }
        else for(const [pid, n] of names) if(!q || nameMatchKey(String(n || '')).includes(q)) pids.add(pid);
        return [...pids].map(pid => playerRow(pid, names)).sort((a, b) => b.online - a.online || b.updatedAt - a.updatedAt).slice(0, 60);
    }
    function renamePlayer(by, pid, rawName) {
        const p = pid && profiles.getProfile(pid);
        if(!p) return { ok: false, msg: 'No player has that ID.' };
        const v = validateDisplayNameForPlayer(rawName, pid);
        if(!v.ok) return v;
        const old = String(p.profile.mpDisplayName || '');
        if(old === v.name) return { ok: false, msg: 'That is already their name.' };
        p.profile.mpDisplayName = v.name;
        // (their game still holds the old name and sends it when it connects: it gets this one instead)
        if(old && displayNameKey(old) !== displayNameKey(v.name)) p.profile.adminRenamedFrom = displayNameKey(old);
        p.updatedAt = now();
        onPlayerRenamed(pid, v.name);
        record(by, 'renamed player', pid, (old || '(no name)') + ' → ' + v.name);
        return { ok: true };
    }
    const reply = (msg, extra) => ({ t: 'admin_done', msg, ...(extra || {}) });
    // One admin_ message from a player: the reply to send them (never null for an admin).
    function handle(client, msg) {
        const by = client && client.playerId;
        if(!isAdmin(by)) return { t: 'admin_error', msg: 'Not available.' };
        const t = msg.t, clanId = String(msg.clanId || '').slice(0, 40), pid = sanitizePlayerId(msg.playerId);
        if(t === 'admin_players') return { t: 'admin_players', query: String(msg.query || '').slice(0, 40), players: findPlayers(msg.query) };
        if(t === 'admin_clans') return { t: 'admin_clans', query: String(msg.query || '').slice(0, 40), clans: clans.adminList(msg.query) };
        if(t === 'admin_clan') {
            const clan = clans.adminDetail(clanId);
            return clan ? { t: 'admin_clan', clan } : { t: 'admin_error', msg: 'That clan no longer exists.' };
        }
        if(t === 'admin_log') return { t: 'admin_log', entries: history.slice(0, 100) };
        if(t === 'admin_rename_player') {
            const r = renamePlayer(by, pid, msg.name);
            return r.ok ? reply('Renamed the player.', { playerId: pid }) : { t: 'admin_error', msg: r.msg };
        }
        if(t === 'admin_rename_clan') {
            const r = clans.adminRename(clanId, msg.name);
            if(!r.ok) return { t: 'admin_error', msg: r.msg };
            record(by, 'renamed clan', clanId, r.old + ' → ' + r.clan.name);
            onClanChanged(r.clan);
            return reply('Renamed the clan.', { clanId });
        }
        if(t === 'admin_kick') {
            const name = nameOf(pid), r = clans.adminKick(clanId, pid);
            if(!r.ok) return { t: 'admin_error', msg: r.msg };
            record(by, 'removed from clan', clanId, name + ' (' + pid + ') from ' + r.clan.name + (r.disbanded ? ', the last member: the clan is gone' : ''));
            onMemberRemoved(pid, r.clan);
            if(!r.disbanded) onClanChanged(r.clan);
            return reply(r.disbanded ? 'Removed the last member: the clan is gone.' : 'Removed the member.', { clanId, disbanded: !!r.disbanded });
        }
        if(t === 'admin_set_leader') {
            const r = clans.adminSetLeader(clanId, pid);
            if(!r.ok) return { t: 'admin_error', msg: r.msg };
            record(by, 'changed clan leader', clanId, r.clan.name + ': ' + nameOf(pid) + ' (' + pid + ')');
            onClanChanged(r.clan);
            return reply('Changed the leader.', { clanId });
        }
        if(t === 'admin_disband') {
            const r = clans.adminDisband(clanId);
            if(!r.ok) return { t: 'admin_error', msg: r.msg };
            record(by, 'disbanded clan', clanId, r.clan.name + ' (' + r.memberIds.length + ' members)');
            onClanDisbanded(r.clan, r.memberIds);
            return reply('Disbanded the clan.', { clanId, disbanded: true });
        }
        return { t: 'admin_error', msg: 'Unknown admin action.' };
    }
    return { isAdmin, handle, history };
}

module.exports = { createAdmin, parseAdminIds };
