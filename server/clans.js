'use strict';
// Clans: a name, an emblem (a preset or a country flag), members with a leader, a chat room, and two sets of stats:
// clan-war stats (only the clan's wars: wins in each tier, defeats, kills and losses) and normal-play stats (its
// members' multiplayer totals, as the player leaderboard counts them).
// Joining: a public clan is joined straight from the list. A private clan is listed and searchable too, but players
// apply, and its leader approves. Members invite friends; an invited friend who accepts (or anyone using the leader's
// invite code) is queued as an invited applicant. The queue holds at most 3 applicants from search and 2 invited ones.
// A leader gone for 60 days hands the clan to its highest-ranked member.
// With a database (DATABASE_URL, as the live relay keeps profiles) each clan is a row of game_clans, since a hosted
// relay's own disk is wiped when it restarts; without one they are kept in clans.json in the data directory.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { NAME_TAKEN_PLACEHOLDER, stripInvisible, nameMatchKey, isPlaceholderName } = require('./names');

// Emblem ids the client can draw (js/clans.js has the drawings; scripts/verify-mp-clans.js checks the lists match).
const PRESET_EMBLEMS = ['swords', 'shield', 'star', 'crown', 'eagle', 'wolf', 'tower', 'anchor', 'bolt', 'flame', 'tank', 'skull', 'lion', 'axe', 'sun', 'trident'];
const FLAG_EMBLEMS = ['us', 'gb', 'ca', 'au', 'fr', 'de', 'it', 'es', 'pt', 'nl', 'be', 'ie', 'ch', 'at', 'pl', 'ua', 'ru', 'se', 'no', 'dk', 'fi', 'is', 'gr', 'tr', 'jp', 'kr', 'cn', 'in', 'br', 'ar', 'mx', 'co', 'cl', 'za', 'ng', 'eg', 'il', 'ro', 'hu', 'cz', 'nz', 'vn', 'id', 'ph', 'th', 'bd', 'pe', 'ee', 'lt', 'lv',
    'eng', 'sct', 'bg', 'lu', 'rs', 'hr', 'si', 'sk', 'al', 'ge', 'am', 'az', 'md', 'mt', 'mc', 'eu',
    've', 'ec', 'bo', 'py', 'uy', 'cu', 'jm', 'cr', 'pa', 'gt', 'do', 'pr',
    'pk', 'my', 'sg', 'tw', 'kz', 'sa', 'ae', 'qa', 'kw', 'jo', 'lb', 'ir', 'la', 'mm',
    'gh', 'ke', 'et', 'ma', 'dz', 'tn', 'sn', 'cm', 'ci', 'ml', 'td', 'bw', 'so', 'tz', 'fj',
    'ad', 'by', 'ba', 'cy', 'li', 'me', 'mk', 'sm', 'va', 'xk', 'ag', 'bs', 'bb', 'bz', 'dm', 'sv',
    'gd', 'gy', 'ht', 'hn', 'ni', 'kn', 'lc', 'vc', 'sr', 'tt', 'af', 'bh', 'bt', 'bn', 'kh', 'iq',
    'kg', 'mv', 'mn', 'np', 'kp', 'om', 'ps', 'lk', 'sy', 'tj', 'tl', 'tm', 'uz', 'ye', 'ao', 'bj',
    'bf', 'bi', 'cv', 'cf', 'km', 'cd', 'cg', 'dj', 'gq', 'er', 'sz', 'ga', 'gm', 'gn', 'gw', 'ls',
    'lr', 'ly', 'mg', 'mw', 'mr', 'mu', 'mz', 'na', 'ne', 'rw', 'st', 'sc', 'sl', 'ss', 'sd', 'tg',
    'ug', 'zm', 'zw', 'ki', 'mh', 'fm', 'nr', 'pw', 'pg', 'ws', 'sb', 'to', 'tv', 'vu'];
const EMBLEM_IDS = new Set([...PRESET_EMBLEMS.map(id => 'p:' + id), ...FLAG_EMBLEMS.map(id => 'f:' + id)]);
const TIERS = ['1v1', '2v2'];
const MAX_MEMBERS = 30;
const HISTORY_LEN = 20;
const CHAT_LEN = 80;          // messages a clan keeps
const CHAT_MAX_CHARS = 200;
const CHAT_MIN_GAP_MS = 600;  // per player: at most one message this often, and CHAT_BURST in ten seconds
const CHAT_BURST = 8;
const APPLY_FROM_SEARCH = 3;  // applicants who found the clan themselves
const APPLY_INVITED = 2;      // applicants invited by a member or holding the invite code
const MAX_PENDING_INVITES = 10;
const APPLICATION_DAYS = 14, INVITE_DAYS = 7;
const LEADER_INACTIVE_DAYS = 60;
const DAY = 86400000;
const SEEN_SAVE_MS = 6 * 3600000; // a member's "last seen" is saved at most this often

function cleanName(raw) {
    return stripInvisible(raw || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
}
// (two clan names are one name when they read the same: case, spacing, punctuation, accents and look-alike letters
// aside; server/names.js)
function nameKey(name) { return nameMatchKey(cleanName(name)); }
// Which of two clans is older (founded first): it keeps a name both hold.
function olderClan(a, b) { return (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id)); }
// Names settled by hand, before age: when clans share one of these names, the clan with this player (as its leader,
// else as a member) keeps it, whichever was founded first; the others show as "thanks for noticing" until renamed.
// (the live relay had two "the dev clan"s; the developer's, with jumin121, keeps it)
const NAME_KEEPERS = [{ clan: 'the dev clan', player: 'jumin121' }];
const DESCRIPTION_MAX = 200;
function cleanDescription(raw) { return String(raw || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, DESCRIPTION_MAX); }
const LIST_PAGE_SIZE = 8;
// How the clan browser can order clans (rows are { c: clan, online: members online now }).
const LIST_SORTS = {
    members: (a, b) => b.c.members.length - a.c.members.length,
    wins: (a, b) => b.c.stats.wins - a.c.stats.wins,
    online: (a, b) => b.online - a.online,
    newest: (a, b) => (b.c.createdAt || 0) - (a.c.createdAt || 0),
    name: (a, b) => a.c.name.localeCompare(b.c.name),
};
function newCode() { return 'CLAN-' + crypto.randomBytes(4).toString('hex').toUpperCase(); }
function emptyTier() { return { played: 0, wins: 0, defeats: 0 }; }
function emptyStats() { return { played: 0, wins: 0, defeats: 0, kills: 0, losses: 0, byTier: { '1v1': emptyTier(), '2v2': emptyTier() } }; }

function createClans({ dataDir, profiles, nameOf, isOnline, pool, now = Date.now }) {
    const file = path.join(dataDir, 'clans.json');
    const clans = new Map();        // id -> clan
    const byPlayer = new Map();     // playerId -> clan id
    let saveTimer = null;

    function index() {
        namesDirty = true;
        byPlayer.clear();
        for(const clan of clans.values()) for(const m of clan.members) byPlayer.set(m.playerId, clan.id);
    }
    function adopt(c) {
        if(!c || !c.id || !Array.isArray(c.members) || !c.members.length) return;
        const old = c.stats || {};
        // (clans saved before the stats were split: their war losses are defeats; there were no kill counts)
        if(old.rating != null) c.stats = { played: old.played | 0, wins: old.wins | 0, defeats: old.losses | 0, kills: 0, losses: 0, byTier: Object.fromEntries(TIERS.map(t => [t, { played: (old.byTier?.[t]?.played) | 0, wins: (old.byTier?.[t]?.wins) | 0, defeats: (old.byTier?.[t]?.losses) | 0 }])) };
        c.stats = Object.assign(emptyStats(), c.stats || {});
        c.stats.byTier = Object.assign({ '1v1': emptyTier(), '2v2': emptyTier() }, c.stats.byTier || {});
        c.history = Array.isArray(c.history) ? c.history.slice(0, HISTORY_LEN) : [];
        c.chat = Array.isArray(c.chat) ? c.chat.slice(-CHAT_LEN) : [];
        c.applications = Array.isArray(c.applications) ? c.applications : [];
        c.invites = Array.isArray(c.invites) ? c.invites : [];
        for(const m of c.members) m.lastSeenAt ||= m.joinedAt || c.createdAt || now();
        clans.set(c.id, c);
        namesDirty = true;
    }
    function load() {
        try { for(const c of JSON.parse(fs.readFileSync(file, 'utf8')).clans || []) adopt(c); } catch(_) {}
        index();
    }
    // The database's rows win over an old local file (whose clans are copied in once).
    async function init() {
        if(pool) {
            await pool.query('CREATE TABLE IF NOT EXISTS game_clans (clan_id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
            const stored = await pool.query('SELECT data FROM game_clans');
            const fromFile = new Set(clans.keys());
            for(const row of stored.rows) { fromFile.delete(row.data && row.data.id); adopt(row.data); }
            index();
            for(const id of fromFile) dirty.add(id);
            await persist();
        }
        checkInactiveLeaders();
    }
    const dirty = new Set(), gone = new Set();
    let work = Promise.resolve();
    function persist() {
        const ids = [...dirty], removedIds = [...gone];
        dirty.clear(); gone.clear();
        if(!ids.length && !removedIds.length) return work;
        work = work.catch(() => {}).then(async () => {
            for(const id of ids) { const c = clans.get(id); if(c) await pool.query('INSERT INTO game_clans(clan_id, data) VALUES($1, $2) ON CONFLICT(clan_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()', [id, JSON.stringify(c)]); }
            for(const id of removedIds) await pool.query('DELETE FROM game_clans WHERE clan_id = $1', [id]);
        }).catch(e => {
            console.warn('[clans] database save failed, retrying:', e.message);
            for(const id of ids) dirty.add(id);
            for(const id of removedIds) gone.add(id);
            setTimeout(persist, 5000);
        });
        return work;
    }
    function changed(...list) { namesDirty = true; for(const c of list) if(c) dirty.add(c.id); scheduleSave(); }
    function removed(id) { namesDirty = true; dirty.delete(id); gone.add(id); scheduleSave(); }
    function save() {
        clearTimeout(saveTimer); saveTimer = null;
        const tmp = file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify({ clans: [...clans.values()] }));
        fs.renameSync(tmp, file);
    }
    // (written at once: clan changes are rare, and a relay stopped without warning must not lose one)
    function scheduleSave() {
        if(pool) { void persist(); return; }
        try { save(); } catch(e) { console.warn('[clans] save failed', e.message); }
    }
    function flush() { return pool ? persist() : Promise.resolve(saveTimer && save()); }

    // Each name's holder: the oldest clan with it. A younger clan with the same name is shown as the placeholder
    // ("thanks for noticing") until its leader renames it, and cannot change anything else before that.
    // (a NAME_KEEPERS clan first, its leader's before a member's; then the older clan)
    const keepers = new Map(NAME_KEEPERS.map(k => [nameKey(k.clan), nameMatchKey(k.player)]));
    function keeperRank(clan) {
        const who = keepers.get(nameKey(clan.name));
        if(!who) return 0;
        const is = pid => nameMatchKey(String(nameOf(pid) || '')) === who;
        return is(clan.leaderId) ? 2 : clan.members.some(m => is(m.playerId)) ? 1 : 0;
    }
    function holdsBefore(a, b) { return keeperRank(b) - keeperRank(a) || olderClan(a, b); }
    // (recounted when a clan changes, and every half minute: a keeper's display name can change without one)
    let namesDirty = true, namesAt = 0, nameHolder = new Map();
    function holders() {
        if(!namesDirty && now() - namesAt < 30000) return nameHolder;
        nameHolder = new Map();
        for(const c of clans.values()) { const k = nameKey(c.name), h = nameHolder.get(k); if(!h || holdsBefore(c, h) < 0) nameHolder.set(k, c); }
        namesDirty = false; namesAt = now();
        return nameHolder;
    }
    function nameFlagged(clan) { return !!clan && (isPlaceholderName(clan.name) || holders().get(nameKey(clan.name)) !== clan); }
    function shownName(clan) { return !clan ? '' : nameFlagged(clan) ? NAME_TAKEN_PLACEHOLDER : clan.name; }
    const clanOf = playerId => { const id = byPlayer.get(playerId); return id ? clans.get(id) || null : null; };
    const isLeader = (clan, playerId) => !!clan && clan.leaderId === playerId;
    const memberOf = (clan, playerId) => clan && clan.members.find(m => m.playerId === playerId) || null;
    function playerStats(playerId) {
        const p = profiles.getProfile(playerId);
        const s = p ? profiles.computeCombinedStats(p) || {} : {};
        return { wins: s.wins | 0, kills: s.kills | 0, losses: s.losses | 0, defeats: s.defeats | 0, gamesPlayed: s.gamesPlayed | 0 };
    }
    function summary(clan) {
        if(!clan) return null;
        return { id: clan.id, name: shownName(clan), nameFlagged: nameFlagged(clan), emblem: clan.emblem, visibility: clan.visibility, members: clan.members.length, wins: clan.stats.wins, description: clan.description || '' };
    }
    // Normal play: the members' multiplayer totals, counted as on the player leaderboard.
    function memberTotals(clan) {
        const out = { wins: 0, kills: 0, losses: 0, defeats: 0, gamesPlayed: 0 };
        for(const m of clan.members) { const s = playerStats(m.playerId); for(const k of Object.keys(out)) out[k] += s[k]; }
        return out;
    }
    // A clan's members in rank order: clan-war wins, then multiplayer wins, then who joined first.
    function rankedMembers(clan) {
        return clan.members.map(m => ({ m, wins: playerStats(m.playerId).wins })).sort((a, b) => (b.m.warWins | 0) - (a.m.warWins | 0) || b.wins - a.wins || a.m.joinedAt - b.m.joinedAt).map(x => x.m);
    }
    function prune(clan) {
        const t = now(), before = clan.applications.length + clan.invites.length;
        clan.applications = clan.applications.filter(a => t - a.at < APPLICATION_DAYS * DAY && !clanOf(a.playerId));
        clan.invites = clan.invites.filter(i => t - i.at < INVITE_DAYS * DAY && !clanOf(i.playerId));
        return clan.applications.length + clan.invites.length !== before;
    }
    function detail(clan, viewerId) {
        if(!clan) return null;
        if(checkInactiveLeaders(clan)) changed(clan);
        if(prune(clan)) changed(clan);
        const member = !!memberOf(clan, viewerId), lead = isLeader(clan, viewerId);
        const showMembers = member || clan.visibility === 'public';
        const ranked = rankedMembers(clan);
        return {
            ...summary(clan),
            leaderId: clan.leaderId,
            leaderName: nameOf(clan.leaderId),
            createdAt: clan.createdAt,
            code: lead ? clan.code : undefined,
            chat: member ? clan.chat.slice(-CHAT_LEN) : undefined,
            youAreMember: member,
            youAreLeader: lead,
            youApplied: clan.applications.some(a => a.playerId === viewerId),
            stats: clan.stats,
            totals: memberTotals(clan),
            history: clan.history.slice(0, HISTORY_LEN),
            queue: { fromSearch: clan.applications.filter(a => a.kind === 'random').length, invited: clan.applications.filter(a => a.kind === 'invite').length, maxFromSearch: APPLY_FROM_SEARCH, maxInvited: APPLY_INVITED },
            applications: lead ? clan.applications.map(a => ({ ...a, name: nameOf(a.playerId), invitedByName: a.invitedBy && a.invitedBy !== 'code' ? nameOf(a.invitedBy) : '', stats: playerStats(a.playerId) })) : undefined,
            invited: member ? clan.invites.map(i => ({ playerId: i.playerId, name: nameOf(i.playerId), byName: nameOf(i.by), at: i.at })) : undefined,
            memberList: showMembers ? ranked.map((m, i) => {
                const s = playerStats(m.playerId);
                return { playerId: m.playerId, name: nameOf(m.playerId), rank: i + 1, role: m.playerId === clan.leaderId ? 'leader' : 'member', joinedAt: m.joinedAt, lastSeenAt: lead ? m.lastSeenAt : undefined, online: isOnline(m.playerId), wins: s.wins, kills: s.kills, losses: s.losses, defeats: s.defeats, warWins: m.warWins | 0, warsPlayed: m.warsPlayed | 0 };
            }) : null,
        };
    }
    function validate(fields, selfId) {
        const name = cleanName(fields.name);
        if(name.length < 3) return { ok: false, msg: 'Clan names need at least 3 characters.' };
        if(!/[a-z0-9]/i.test(name)) return { ok: false, msg: 'Clan names need a letter or a number.' };
        if(isPlaceholderName(name)) return { ok: false, msg: 'Pick a new name for the clan.' };
        // A new name must be free. A clan keeping its own name loses it only to a clan that holds it first (older, or
        // its NAME_KEEPERS clan).
        const key = nameKey(name), self = selfId ? clans.get(selfId) : null, keeping = !!self && nameKey(self.name) === key;
        for(const c of clans.values()) {
            if(c.id === selfId || nameKey(c.name) !== key) continue;
            if(!keeping || holdsBefore(c, self) < 0) return { ok: false, msg: keeping ? 'Another clan had this name first. Pick a new name for your clan.' : 'That clan name is taken.' };
        }
        const emblem = String(fields.emblem || '');
        if(!EMBLEM_IDS.has(emblem)) return { ok: false, msg: 'Pick an emblem for the clan.' };
        const visibility = fields.visibility === 'private' ? 'private' : 'public';
        return { ok: true, name, emblem, visibility, description: cleanDescription(fields.description) };
    }
    // Joining a clan drops the player's applications and invitations everywhere else.
    function addMember(clan, playerId, note) {
        clan.members.push({ playerId, joinedAt: now(), lastSeenAt: now(), warWins: 0, warsPlayed: 0 });
        byPlayer.set(playerId, clan.id);
        for(const other of clans.values()) {
            const before = other.applications.length + other.invites.length;
            other.applications = other.applications.filter(a => a.playerId !== playerId);
            other.invites = other.invites.filter(i => i.playerId !== playerId);
            if(other !== clan && other.applications.length + other.invites.length !== before) changed(other);
        }
        say(clan, note || nameOf(playerId) + ' joined the clan.');
        changed(clan);
    }

    function create(playerId, fields) {
        if(!playerId) return { ok: false, msg: 'Register your profile first.' };
        if(clanOf(playerId)) return { ok: false, msg: 'Leave your clan before founding a new one.' };
        const v = validate(fields || {});
        if(!v.ok) return v;
        let id; do { id = 'C' + crypto.randomBytes(5).toString('hex').toUpperCase(); } while(clans.has(id));
        const clan = { id, name: v.name, emblem: v.emblem, visibility: v.visibility, description: v.description, code: newCode(), leaderId: playerId, createdAt: now(), members: [], stats: emptyStats(), history: [], chat: [], applications: [], invites: [] };
        clans.set(id, clan);
        namesDirty = true;
        addMember(clan, playerId, nameOf(playerId) + ' founded ' + clan.name + '.');
        return { ok: true, clan };
    }
    function canTakeMember(clan) { return clan.members.length < MAX_MEMBERS ? null : 'That clan is full (' + MAX_MEMBERS + ' members).'; }
    function queueApplication(clan, playerId, kind, invitedBy) {
        prune(clan);
        if(clan.applications.some(a => a.playerId === playerId)) return { ok: false, msg: 'You have already applied to ' + shownName(clan) + '; its leader will decide.' };
        const used = clan.applications.filter(a => a.kind === kind).length, max = kind === 'invite' ? APPLY_INVITED : APPLY_FROM_SEARCH;
        if(used >= max) return { ok: false, msg: shownName(clan) + '\'s application queue is full (' + (kind === 'invite' ? APPLY_INVITED + ' invited players' : APPLY_FROM_SEARCH + ' applications from search') + ' at a time). Try again once its leader has answered them.' };
        clan.applications.push({ playerId, kind, invitedBy: invitedBy || '', at: now() });
        changed(clan);
        return { ok: true, clan, applied: true };
    }
    // From the list: a public clan is joined at once; a private one takes an application.
    function apply(playerId, clanId) {
        if(!playerId) return { ok: false, msg: 'Register your profile first.' };
        if(clanOf(playerId)) return { ok: false, msg: 'Leave your clan before joining another.' };
        const clan = clans.get(String(clanId || ''));
        if(!clan) return { ok: false, msg: 'That clan no longer exists.' };
        const full = canTakeMember(clan);
        if(full) return { ok: false, msg: full };
        if(clan.visibility === 'public') { addMember(clan, playerId); return { ok: true, clan, joined: true }; }
        return queueApplication(clan, playerId, 'random');
    }
    // The leader's invite code: joins a public clan, queues an invited application to a private one.
    function useCode(playerId, code) {
        if(!playerId) return { ok: false, msg: 'Register your profile first.' };
        if(clanOf(playerId)) return { ok: false, msg: 'Leave your clan before joining another.' };
        const clan = [...clans.values()].find(c => c.code === String(code || '').trim().toUpperCase());
        if(!clan) return { ok: false, msg: 'No clan has that invite code.' };
        const full = canTakeMember(clan);
        if(full) return { ok: false, msg: full };
        if(clan.visibility === 'public') { addMember(clan, playerId); return { ok: true, clan, joined: true }; }
        return queueApplication(clan, playerId, 'invite', 'code');
    }
    function join(playerId, { clanId, code }) { return code ? useCode(playerId, code) : apply(playerId, clanId); }
    function cancelApplication(playerId, clanId) {
        const clan = clans.get(String(clanId || ''));
        if(!clan || !clan.applications.some(a => a.playerId === playerId)) return { ok: false, msg: 'There is no application to withdraw.' };
        clan.applications = clan.applications.filter(a => a.playerId !== playerId); changed(clan);
        return { ok: true, clan };
    }
    function answerApplication(leaderId, applicantId, approve) {
        const clan = clanOf(leaderId);
        if(!clan || !isLeader(clan, leaderId)) return { ok: false, msg: 'Only the clan leader answers applications.' };
        const app = clan.applications.find(a => a.playerId === applicantId);
        if(!app) return { ok: false, msg: 'That application is no longer waiting.' };
        clan.applications = clan.applications.filter(a => a !== app);
        if(!approve) { changed(clan); return { ok: true, clan, applicantId, approved: false }; }
        if(clanOf(applicantId)) { changed(clan); return { ok: false, msg: nameOf(applicantId) + ' has joined another clan since applying.' }; }
        const full = canTakeMember(clan);
        if(full) { clan.applications.unshift(app); return { ok: false, msg: 'Your clan is full.' }; }
        addMember(clan, applicantId, nameOf(applicantId) + ' joined the clan (' + (app.kind === 'invite' ? (app.invitedBy === 'code' ? 'invite code' : 'invited by ' + nameOf(app.invitedBy)) : 'applied') + ').');
        return { ok: true, clan, applicantId, approved: true };
    }
    // Any member may invite a player (a friend) who is not in a clan; the friend accepts or declines.
    function inviteFriend(memberId, friendId, knownPlayer) {
        const clan = clanOf(memberId);
        if(!clan) return { ok: false, msg: 'Join a clan before inviting friends to it.' };
        if(!friendId || !knownPlayer(friendId)) return { ok: false, msg: 'That player could not be found.' };
        if(friendId === memberId) return { ok: false, msg: 'You are already in the clan.' };
        if(clanOf(friendId)) return { ok: false, msg: nameOf(friendId) + ' is already in a clan.' };
        prune(clan);
        if(clan.invites.some(i => i.playerId === friendId) || clan.applications.some(a => a.playerId === friendId)) return { ok: false, msg: nameOf(friendId) + ' already has an invitation or application here.' };
        if(clan.invites.length >= MAX_PENDING_INVITES) return { ok: false, msg: 'Your clan has ' + MAX_PENDING_INVITES + ' invitations waiting for an answer already.' };
        clan.invites.push({ playerId: friendId, by: memberId, at: now() });
        changed(clan);
        return { ok: true, clan, friendId };
    }
    function answerInvite(playerId, clanId, accept) {
        const clan = clans.get(String(clanId || ''));
        const inv = clan && clan.invites.find(i => i.playerId === playerId);
        if(!inv) return { ok: false, msg: 'That invitation is no longer open.' };
        clan.invites = clan.invites.filter(i => i !== inv);
        if(!accept) { changed(clan); return { ok: true, clan, declined: true }; }
        if(clanOf(playerId)) { changed(clan); return { ok: false, msg: 'Leave your clan before joining another.' }; }
        const full = canTakeMember(clan);
        if(full) { changed(clan); return { ok: false, msg: full }; }
        if(clan.visibility === 'public') { addMember(clan, playerId, nameOf(playerId) + ' joined the clan (invited by ' + nameOf(inv.by) + ').'); return { ok: true, clan, joined: true }; }
        const r = queueApplication(clan, playerId, 'invite', inv.by);
        if(!r.ok) { clan.invites.push(inv); changed(clan); }
        return r;
    }
    // A player's open applications and invitations, for the Clan tab.
    function pendingFor(playerId) {
        const applications = [], invitations = [];
        for(const clan of clans.values()) {
            const a = clan.applications.find(x => x.playerId === playerId);
            if(a) applications.push({ clan: summary(clan), kind: a.kind, at: a.at });
            const i = clan.invites.find(x => x.playerId === playerId);
            if(i && now() - i.at < INVITE_DAYS * DAY) invitations.push({ clan: summary(clan), byName: nameOf(i.by), at: i.at });
        }
        return { applications, invitations };
    }
    function leave(playerId) {
        const clan = clanOf(playerId);
        if(!clan) return { ok: false, msg: 'You are not in a clan.' };
        clan.members = clan.members.filter(m => m.playerId !== playerId); byPlayer.delete(playerId);
        let disbanded = false;
        if(!clan.members.length) { clans.delete(clan.id); disbanded = true; }
        else if(clan.leaderId === playerId) {
            clan.leaderId = rankedMembers(clan)[0].playerId;
            say(clan, nameOf(playerId) + ' left the clan. ' + nameOf(clan.leaderId) + ' now leads it.');
        } else say(clan, nameOf(playerId) + ' left the clan.');
        if(disbanded) removed(clan.id); else changed(clan);
        return { ok: true, clan, disbanded };
    }
    function update(playerId, fields) {
        const clan = clanOf(playerId);
        if(!clan) return { ok: false, msg: 'You are not in a clan.' };
        if(!isLeader(clan, playerId)) return { ok: false, msg: 'Only the clan leader can change the clan.' };
        const v = validate({ name: fields.name ?? clan.name, emblem: fields.emblem ?? clan.emblem, visibility: fields.visibility ?? clan.visibility, description: fields.description ?? clan.description }, clan.id);
        if(!v.ok) return v;
        Object.assign(clan, { name: v.name, emblem: v.emblem, visibility: v.visibility, description: v.description });
        if(fields.newCode) clan.code = newCode();
        changed(clan);
        return { ok: true, clan };
    }
    function kick(playerId, targetId) {
        const clan = clanOf(playerId);
        if(!clan || !isLeader(clan, playerId)) return { ok: false, msg: 'Only the clan leader can remove members.' };
        if(targetId === playerId || !memberOf(clan, targetId)) return { ok: false, msg: 'That player is not a member.' };
        clan.members = clan.members.filter(m => m.playerId !== targetId); byPlayer.delete(targetId);
        say(clan, nameOf(targetId) + ' was removed from the clan.');
        changed(clan);
        return { ok: true, clan };
    }
    // A member seen (connected) again; saved now and then, since only the leader's absence matters.
    function touch(playerId) {
        const clan = clanOf(playerId), m = memberOf(clan, playerId);
        if(!m) return;
        const t = now(), saveIt = t - (m.lastSeenAt || 0) > SEEN_SAVE_MS;
        m.lastSeenAt = t;
        if(saveIt) changed(clan);
    }
    // A leader not seen for LEADER_INACTIVE_DAYS hands the clan to its highest-ranked member (one still active, if any).
    function checkInactiveLeaders(only) {
        let any = false;
        for(const clan of only ? [only] : clans.values()) {
            const leader = memberOf(clan, clan.leaderId);
            if(!leader || clan.members.length < 2 || now() - (leader.lastSeenAt || 0) < LEADER_INACTIVE_DAYS * DAY) continue;
            const others = rankedMembers(clan).filter(m => m !== leader);
            const next = others.find(m => now() - (m.lastSeenAt || 0) < LEADER_INACTIVE_DAYS * DAY) || others[0];
            clan.leaderId = next.playerId;
            say(clan, nameOf(leader.playerId) + ' has not been seen for ' + LEADER_INACTIVE_DAYS + ' days, so ' + nameOf(next.playerId) + ', the highest-ranked member, now leads the clan.');
            if(!only) changed(clan);
            any = true;
        }
        return any;
    }
    // Clans by name (part of it) and visibility, a page at a time. The search for a clan to join puts the best name match
    // first; the clan browser sorts by opts.sort (LIST_SORTS) instead, and asks for longer pages (opts.pageSize, 4 to 20).
    function list(query, viewerId, opts) {
        opts = opts || {};
        const q = String(query || '').trim().toLowerCase(), filter = ['public', 'private'].includes(opts.filter) ? opts.filter : 'all';
        const sort = typeof opts.sort === 'string' && Object.hasOwn(LIST_SORTS, opts.sort) ? opts.sort : '';
        const size = Math.min(20, Math.max(4, (opts.pageSize | 0) || LIST_PAGE_SIZE));
        const rank = c => !q || sort ? 0 : shownName(c).toLowerCase() === q ? 0 : shownName(c).toLowerCase().startsWith(q) ? 1 : 2;
        const found = [...clans.values()].filter(c => (!q || shownName(c).toLowerCase().includes(q)) && (filter === 'all' || c.visibility === filter))
            .map(c => ({ c, online: c.members.reduce((n, m) => n + (isOnline(m.playerId) ? 1 : 0), 0) }))
            .sort((a, b) => rank(a.c) - rank(b.c) || LIST_SORTS[sort || 'members'](a, b) || b.c.members.length - a.c.members.length || b.c.stats.wins - a.c.stats.wins || a.c.name.localeCompare(b.c.name));
        const pages = Math.max(1, Math.ceil(found.length / size)), page = Math.min(pages - 1, Math.max(0, opts.page | 0));
        return {
            total: found.length, page, pages, pageSize: size, filter, sort: sort || 'members', allClans: clans.size,
            clans: found.slice(page * size, (page + 1) * size).map(({ c, online }) => ({ ...summary(c), online, leaderName: nameOf(c.leaderId), createdAt: c.createdAt || 0, mine: !!memberOf(c, viewerId),
                applied: !!viewerId && c.applications.some(a => a.playerId === viewerId), queueFull: c.visibility === 'private' && c.applications.filter(a => a.kind === 'random').length >= APPLY_FROM_SEARCH })),
        };
    }
    // Two leaderboards: clan wars ('war') and the members' normal multiplayer play ('normal').
    const WAR_SORTS = { wins: s => s.wins, wins1v1: s => s.byTier['1v1'].wins, wins2v2: s => s.byTier['2v2'].wins, defeats: s => s.defeats, kills: s => s.kills, losses: s => s.losses };
    const NORMAL_SORTS = ['wins', 'kills', 'losses', 'defeats'];
    function leaderboard(kind, sort) {
        if(kind === 'normal') {
            const key = NORMAL_SORTS.includes(sort) ? sort : 'wins';
            const rows = [...clans.values()].map(c => ({ ...summary(c), totals: memberTotals(c), leaderName: nameOf(c.leaderId) }));
            return { kind: 'normal', sort: key, rows: rows.sort((a, b) => b.totals[key] - a.totals[key] || b.totals.wins - a.totals.wins || a.name.localeCompare(b.name)).slice(0, 100) };
        }
        const key = WAR_SORTS[sort] ? sort : 'wins';
        const rows = [...clans.values()].map(c => ({ ...summary(c), stats: c.stats, leaderName: nameOf(c.leaderId) }));
        return { kind: 'war', sort: key, rows: rows.sort((a, b) => WAR_SORTS[key](b.stats) - WAR_SORTS[key](a.stats) || b.stats.wins - a.stats.wins || a.stats.defeats - b.stats.defeats || a.name.localeCompare(b.name)).slice(0, 100) };
    }
    // A finished war: sides [{clanId, outcome: 'won'|'lost', players: [playerId], kills, losses}]. Recorded once per war.
    function recordWar({ warId, tier, sides }) {
        if(!TIERS.includes(tier) || !Array.isArray(sides) || sides.length !== 2) return false;
        const [a, b] = sides.map(s => ({ ...s, clan: clans.get(s.clanId) }));
        if(a.outcome === b.outcome) return false;
        const done = c => c && (c.recordedWars ||= []).includes(warId);
        if(done(a.clan) || done(b.clan)) return false;
        for(const [side, other] of [[a, b], [b, a]]) {
            const clan = side.clan;
            if(!clan) continue;
            const won = side.outcome === 'won', st = clan.stats, tierSt = st.byTier[tier] ||= emptyTier();
            const kills = Math.max(0, side.kills | 0), losses = Math.max(0, side.losses | 0);
            st.played++; tierSt.played++;
            if(won) { st.wins++; tierSt.wins++; } else { st.defeats++; tierSt.defeats++; }
            st.kills += kills; st.losses += losses;
            for(const m of clan.members) if((side.players || []).includes(m.playerId)) { m.warsPlayed = (m.warsPlayed | 0) + 1; if(won) m.warWins = (m.warWins | 0) + 1; }
            clan.history.unshift({ at: now(), tier, outcome: won ? 'won' : 'lost', kills, losses, opponent: other.clan ? { id: other.clan.id, name: shownName(other.clan), emblem: other.clan.emblem } : { name: 'A disbanded clan', emblem: 'p:shield' }, players: (side.players || []).map(nameOf) });
            clan.history = clan.history.slice(0, HISTORY_LEN);
            (clan.recordedWars ||= []).push(warId); clan.recordedWars = clan.recordedWars.slice(-64);
            say(clan, (won ? 'Won' : 'Lost') + ' a ' + tier + ' war against ' + (other.clan ? shownName(other.clan) : 'a disbanded clan') + ' (' + (side.players || []).map(nameOf).join(' & ') + ').');
        }
        changed(a.clan, b.clan);
        return true;
    }
    // ---- clan chat: members only; the clan keeps its last CHAT_LEN messages, with short notes of joins, leaves and wars
    const chatSent = new Map();   // playerId -> recent send times
    function say(clan, text) {
        clan.chat ||= [];
        clan.chat.push({ id: crypto.randomBytes(5).toString('hex'), at: now(), system: true, text: String(text).slice(0, CHAT_MAX_CHARS * 2) });
        if(clan.chat.length > CHAT_LEN) clan.chat.splice(0, clan.chat.length - CHAT_LEN);
        return clan.chat[clan.chat.length - 1];
    }
    function post(playerId, raw) {
        const clan = clanOf(playerId);
        if(!clan) return { ok: false, msg: 'Join a clan to use clan chat.' };
        const text = String(raw || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_CHARS);
        if(!text) return { ok: false, msg: 'Type a message first.' };
        const t = now(), sent = (chatSent.get(playerId) || []).filter(x => t - x < 10000);
        if((sent.length && t - sent[sent.length - 1] < CHAT_MIN_GAP_MS) || sent.length >= CHAT_BURST) return { ok: false, msg: 'Slow down a little: wait a moment before your next message.' };
        sent.push(t); chatSent.set(playerId, sent);
        const message = { id: crypto.randomBytes(5).toString('hex'), at: t, playerId, name: nameOf(playerId), text };
        clan.chat.push(message);
        if(clan.chat.length > CHAT_LEN) clan.chat.splice(0, clan.chat.length - CHAT_LEN);
        touch(playerId);
        changed(clan);
        return { ok: true, clan, message };
    }

    load();
    return {
        init, post, EMBLEM_IDS, PRESET_EMBLEMS, FLAG_EMBLEMS, TIERS, MAX_MEMBERS, clanOf, summary, detail, create, join, apply, useCode, cancelApplication, answerApplication,
        inviteFriend, answerInvite, pendingFor, leave, update, kick, touch, checkInactiveLeaders, rankedMembers, list, leaderboard, recordWar, flush, get: id => clans.get(id) || null,
        shownName, nameFlagged,
    };
}

module.exports = { createClans, PRESET_EMBLEMS, FLAG_EMBLEMS, TIERS };
