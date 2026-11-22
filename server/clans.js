'use strict';
// Clans: a name, an emblem (a preset or a country flag), public (listed, anyone may join) or private (joined with the
// clan's invite code), members with a leader, and clan-war records. Kept in clans.json beside the leaderboard; a
// player's clan is found from the member lists, so it follows the player's profile from session to session.
// With a database (DATABASE_URL, as the live relay keeps profiles) each clan is a row of game_clans, since a hosted
// relay's own disk is wiped when it restarts; without one they are kept in clans.json in the data directory.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Emblem ids the client can draw (js/clans.js has the drawings; scripts/verify-mp-clans.js checks the lists match).
const PRESET_EMBLEMS = ['swords', 'shield', 'star', 'crown', 'eagle', 'wolf', 'tower', 'anchor', 'bolt', 'flame', 'tank', 'skull', 'lion', 'axe', 'sun', 'trident'];
const FLAG_EMBLEMS = ['us', 'gb', 'ca', 'au', 'fr', 'de', 'it', 'es', 'pt', 'nl', 'be', 'ie', 'ch', 'at', 'pl', 'ua', 'ru', 'se', 'no', 'dk', 'fi', 'is', 'gr', 'tr', 'jp', 'kr', 'cn', 'in', 'br', 'ar', 'mx', 'co', 'cl', 'za', 'ng', 'eg', 'il', 'ro', 'hu', 'cz', 'nz', 'vn', 'id', 'ph', 'th', 'bd', 'pe', 'ee', 'lt', 'lv'];
const EMBLEM_IDS = new Set([...PRESET_EMBLEMS.map(id => 'p:' + id), ...FLAG_EMBLEMS.map(id => 'f:' + id)]);
const TIERS = ['1v1', '2v2'];
const MAX_MEMBERS = 30;
const HISTORY_LEN = 20;
const CHAT_LEN = 80;          // messages a clan keeps
const CHAT_MAX_CHARS = 200;
const CHAT_MIN_GAP_MS = 600;  // per player: at most one message this often, and CHAT_BURST in ten seconds
const CHAT_BURST = 8;
const START_RATING = 1000;

function cleanName(raw) {
    return String(raw || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
}
function nameKey(name) { return cleanName(name).toLowerCase(); }
function newCode() { return 'CLAN-' + crypto.randomBytes(4).toString('hex').toUpperCase(); }
function emptyTier() { return { played: 0, wins: 0, losses: 0 }; }
function emptyStats() { return { rating: START_RATING, played: 0, wins: 0, losses: 0, byTier: { '1v1': emptyTier(), '2v2': emptyTier() }, streak: 0, bestStreak: 0 }; }

function createClans({ dataDir, profiles, nameOf, isOnline, pool }) {
    const file = path.join(dataDir, 'clans.json');
    const clans = new Map();        // id -> clan
    const byPlayer = new Map();     // playerId -> clan id
    let saveTimer = null;

    function index() {
        byPlayer.clear();
        for(const clan of clans.values()) for(const m of clan.members) byPlayer.set(m.playerId, clan.id);
    }
    function adopt(c) {
        if(!c || !c.id || !Array.isArray(c.members) || !c.members.length) return;
        c.stats = Object.assign(emptyStats(), c.stats || {});
        c.stats.byTier = Object.assign({ '1v1': emptyTier(), '2v2': emptyTier() }, c.stats.byTier || {});
        c.history = Array.isArray(c.history) ? c.history.slice(0, HISTORY_LEN) : [];
        c.chat = Array.isArray(c.chat) ? c.chat.slice(-CHAT_LEN) : [];
        clans.set(c.id, c);
    }
    function load() {
        try { for(const c of JSON.parse(fs.readFileSync(file, 'utf8')).clans || []) adopt(c); } catch(_) {}
        index();
    }
    // The database's rows win over an old local file (whose clans are copied in once).
    async function init() {
        if(!pool) return;
        await pool.query('CREATE TABLE IF NOT EXISTS game_clans (clan_id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
        const stored = await pool.query('SELECT data FROM game_clans');
        const fromFile = new Set(clans.keys());
        for(const row of stored.rows) { fromFile.delete(row.data && row.data.id); adopt(row.data); }
        index();
        for(const id of fromFile) dirty.add(id);
        await persist();
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
    function changed(...list) { for(const c of list) if(c) dirty.add(c.id); scheduleSave(); }
    function removed(id) { dirty.delete(id); gone.add(id); scheduleSave(); }
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

    const clanOf = playerId => { const id = byPlayer.get(playerId); return id ? clans.get(id) || null : null; };
    const isLeader = (clan, playerId) => !!clan && clan.leaderId === playerId;
    function summary(clan) {
        if(!clan) return null;
        return { id: clan.id, name: clan.name, emblem: clan.emblem, visibility: clan.visibility, members: clan.members.length, rating: Math.round(clan.stats.rating) };
    }
    // Member totals from their multiplayer profiles: wins, games and kills across all their matches.
    function memberTotals(clan) {
        const out = { wins: 0, gamesPlayed: 0, kills: 0 };
        for(const m of clan.members) {
            const p = profiles.getProfile(m.playerId);
            if(!p) continue;
            const s = profiles.computeCombinedStats(p) || {};
            out.wins += s.wins | 0; out.gamesPlayed += s.gamesPlayed | 0; out.kills += s.kills | 0;
        }
        return out;
    }
    function detail(clan, viewerId) {
        if(!clan) return null;
        const member = clan.members.some(m => m.playerId === viewerId);
        const showMembers = member || clan.visibility === 'public';
        return {
            ...summary(clan),
            leaderId: clan.leaderId,
            leaderName: nameOf(clan.leaderId),
            createdAt: clan.createdAt,
            code: isLeader(clan, viewerId) ? clan.code : undefined,
            chat: member ? (clan.chat || []).slice(-CHAT_LEN) : undefined,
            youAreMember: member,
            youAreLeader: isLeader(clan, viewerId),
            stats: clan.stats,
            totals: memberTotals(clan),
            history: clan.history.slice(0, HISTORY_LEN),
            memberList: showMembers ? clan.members.map(m => {
                const p = profiles.getProfile(m.playerId), s = p ? profiles.computeCombinedStats(p) || {} : {};
                return { playerId: m.playerId, name: nameOf(m.playerId), role: m.playerId === clan.leaderId ? 'leader' : 'member', joinedAt: m.joinedAt, online: isOnline(m.playerId), wins: s.wins | 0, gamesPlayed: s.gamesPlayed | 0, warWins: m.warWins | 0, warsPlayed: m.warsPlayed | 0 };
            }).sort((a, b) => (b.role === 'leader') - (a.role === 'leader') || b.warWins - a.warWins || b.wins - a.wins) : null,
        };
    }
    function validate(fields, selfId) {
        const name = cleanName(fields.name);
        if(name.length < 3) return { ok: false, msg: 'Clan names need at least 3 characters.' };
        if(!/[a-z0-9]/i.test(name)) return { ok: false, msg: 'Clan names need a letter or a number.' };
        const key = nameKey(name);
        for(const c of clans.values()) if(c.id !== selfId && nameKey(c.name) === key) return { ok: false, msg: 'That clan name is taken.' };
        const emblem = String(fields.emblem || '');
        if(!EMBLEM_IDS.has(emblem)) return { ok: false, msg: 'Pick an emblem for the clan.' };
        const visibility = fields.visibility === 'private' ? 'private' : 'public';
        return { ok: true, name, emblem, visibility };
    }

    function create(playerId, fields) {
        if(!playerId) return { ok: false, msg: 'Register your profile first.' };
        if(clanOf(playerId)) return { ok: false, msg: 'Leave your clan before founding a new one.' };
        const v = validate(fields || {});
        if(!v.ok) return v;
        let id; do { id = 'C' + crypto.randomBytes(5).toString('hex').toUpperCase(); } while(clans.has(id));
        const clan = { id, name: v.name, emblem: v.emblem, visibility: v.visibility, code: newCode(), leaderId: playerId, createdAt: Date.now(), members: [{ playerId, joinedAt: Date.now() }], stats: emptyStats(), history: [] };
        clans.set(id, clan); byPlayer.set(playerId, id);
        say(clan, nameOf(playerId) + ' founded ' + clan.name + '.');
        changed(clan);
        return { ok: true, clan };
    }
    function join(playerId, { clanId, code }) {
        if(!playerId) return { ok: false, msg: 'Register your profile first.' };
        if(clanOf(playerId)) return { ok: false, msg: 'Leave your clan before joining another.' };
        let clan = null;
        const wanted = String(code || '').trim().toUpperCase();
        if(wanted) { clan = [...clans.values()].find(c => c.code === wanted) || null; if(!clan) return { ok: false, msg: 'No clan has that invite code.' }; }
        else {
            clan = clans.get(String(clanId || '')) || null;
            if(!clan) return { ok: false, msg: 'That clan no longer exists.' };
            if(clan.visibility !== 'public') return { ok: false, msg: 'That clan is private: ask its leader for an invite code.' };
        }
        if(clan.members.length >= MAX_MEMBERS) return { ok: false, msg: 'That clan is full (' + MAX_MEMBERS + ' members).' };
        clan.members.push({ playerId, joinedAt: Date.now() }); byPlayer.set(playerId, clan.id);
        say(clan, nameOf(playerId) + ' joined the clan.');
        changed(clan);
        return { ok: true, clan };
    }
    function leave(playerId) {
        const clan = clanOf(playerId);
        if(!clan) return { ok: false, msg: 'You are not in a clan.' };
        clan.members = clan.members.filter(m => m.playerId !== playerId); byPlayer.delete(playerId);
        let disbanded = false;
        if(!clan.members.length) { clans.delete(clan.id); disbanded = true; }
        else if(clan.leaderId === playerId) {
            clan.leaderId = clan.members.slice().sort((a, b) => a.joinedAt - b.joinedAt)[0].playerId;
            say(clan, nameOf(playerId) + ' left the clan. ' + nameOf(clan.leaderId) + ' now leads it.');
        } else say(clan, nameOf(playerId) + ' left the clan.');
        if(disbanded) removed(clan.id); else changed(clan);
        return { ok: true, clan, disbanded };
    }
    function update(playerId, fields) {
        const clan = clanOf(playerId);
        if(!clan) return { ok: false, msg: 'You are not in a clan.' };
        if(!isLeader(clan, playerId)) return { ok: false, msg: 'Only the clan leader can change the clan.' };
        const v = validate({ name: fields.name ?? clan.name, emblem: fields.emblem ?? clan.emblem, visibility: fields.visibility ?? clan.visibility }, clan.id);
        if(!v.ok) return v;
        Object.assign(clan, { name: v.name, emblem: v.emblem, visibility: v.visibility });
        if(fields.newCode) clan.code = newCode();
        changed(clan);
        return { ok: true, clan };
    }
    function kick(playerId, targetId) {
        const clan = clanOf(playerId);
        if(!clan || !isLeader(clan, playerId)) return { ok: false, msg: 'Only the clan leader can remove members.' };
        if(targetId === playerId || !clan.members.some(m => m.playerId === targetId)) return { ok: false, msg: 'That player is not a member.' };
        clan.members = clan.members.filter(m => m.playerId !== targetId); byPlayer.delete(targetId);
        say(clan, nameOf(targetId) + ' was removed from the clan.');
        changed(clan);
        return { ok: true, clan };
    }
    // ---- clan chat: members only; the clan keeps its last CHAT_LEN messages, with short notes of joins, leaves and wars
    const chatSent = new Map();   // playerId -> recent send times
    function say(clan, text) {
        clan.chat ||= [];
        clan.chat.push({ id: crypto.randomBytes(5).toString('hex'), at: Date.now(), system: true, text: String(text).slice(0, CHAT_MAX_CHARS * 2) });
        if(clan.chat.length > CHAT_LEN) clan.chat.splice(0, clan.chat.length - CHAT_LEN);
        return clan.chat[clan.chat.length - 1];
    }
    function post(playerId, raw) {
        const clan = clanOf(playerId);
        if(!clan) return { ok: false, msg: 'Join a clan to use clan chat.' };
        const text = String(raw || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_CHARS);
        if(!text) return { ok: false, msg: 'Type a message first.' };
        const now = Date.now(), sent = (chatSent.get(playerId) || []).filter(t => now - t < 10000);
        if((sent.length && now - sent[sent.length - 1] < CHAT_MIN_GAP_MS) || sent.length >= CHAT_BURST) return { ok: false, msg: 'Slow down a little: wait a moment before your next message.' };
        sent.push(now); chatSent.set(playerId, sent);
        clan.chat ||= [];
        const message = { id: crypto.randomBytes(5).toString('hex'), at: now, playerId, name: nameOf(playerId), text };
        clan.chat.push(message);
        if(clan.chat.length > CHAT_LEN) clan.chat.splice(0, clan.chat.length - CHAT_LEN);
        changed(clan);
        return { ok: true, clan, message };
    }
    function listPublic(query) {
        const q = String(query || '').trim().toLowerCase();
        return [...clans.values()].filter(c => c.visibility === 'public' && (!q || c.name.toLowerCase().includes(q)))
            .sort((a, b) => b.members.length - a.members.length || b.stats.rating - a.stats.rating).slice(0, 60).map(summary);
    }
    function leaderboard(sort) {
        const key = ['rating', 'wins', 'played', 'members', 'memberWins'].includes(sort) ? sort : 'rating';
        const rows = [...clans.values()].map(c => ({ ...summary(c), wins: c.stats.wins, losses: c.stats.losses, played: c.stats.played, byTier: c.stats.byTier, memberWins: memberTotals(c).wins, leaderName: nameOf(c.leaderId) }));
        const val = r => key === 'members' ? r.members : r[key] || 0;
        return rows.sort((a, b) => val(b) - val(a) || b.rating - a.rating || a.name.localeCompare(b.name)).slice(0, 100);
    }
    // A finished war: sides [{clanId, outcome: 'won'|'lost', players: [playerId]}]. Recorded once per war id.
    function recordWar({ warId, tier, sides }) {
        if(!TIERS.includes(tier) || !Array.isArray(sides) || sides.length !== 2) return false;
        const [a, b] = sides.map(s => ({ ...s, clan: clans.get(s.clanId) }));
        if(a.outcome === b.outcome) return false;
        const done = c => c && (c.recordedWars ||= []).includes(warId);
        if(done(a.clan) || done(b.clan)) return false;
        const ra = a.clan ? a.clan.stats.rating : START_RATING, rb = b.clan ? b.clan.stats.rating : START_RATING;
        const expectA = 1 / (1 + Math.pow(10, (rb - ra) / 400)), scoreA = a.outcome === 'won' ? 1 : 0, k = 32;
        const delta = { a: k * (scoreA - expectA), b: k * ((1 - scoreA) - (1 - expectA)) };
        for(const [side, other, d] of [[a, b, delta.a], [b, a, delta.b]]) {
            const clan = side.clan;
            if(!clan) continue;
            const won = side.outcome === 'won', st = clan.stats, tierSt = st.byTier[tier] ||= emptyTier();
            st.played++; tierSt.played++;
            if(won) { st.wins++; tierSt.wins++; st.streak = Math.max(0, st.streak) + 1; st.bestStreak = Math.max(st.bestStreak, st.streak); }
            else { st.losses++; tierSt.losses++; st.streak = Math.min(0, st.streak) - 1; }
            st.rating = Math.max(100, st.rating + d);
            for(const m of clan.members) if((side.players || []).includes(m.playerId)) { m.warsPlayed = (m.warsPlayed | 0) + 1; if(won) m.warWins = (m.warWins | 0) + 1; }
            clan.history.unshift({ at: Date.now(), tier, outcome: won ? 'won' : 'lost', ratingChange: Math.round(d), opponent: other.clan ? { id: other.clan.id, name: other.clan.name, emblem: other.clan.emblem } : { name: 'A disbanded clan', emblem: 'p:shield' }, players: (side.players || []).map(nameOf) });
            clan.history = clan.history.slice(0, HISTORY_LEN);
            clan.recordedWars.push(warId); clan.recordedWars = clan.recordedWars.slice(-64);
            say(clan, (won ? 'Won' : 'Lost') + ' a ' + tier + ' war against ' + (other.clan ? other.clan.name : 'a disbanded clan') + ' (' + (side.players || []).map(nameOf).join(' & ') + ').');
        }
        changed(a.clan, b.clan);
        return true;
    }

    load();
    return { init, post, EMBLEM_IDS, PRESET_EMBLEMS, FLAG_EMBLEMS, TIERS, MAX_MEMBERS, clanOf, summary, detail, create, join, leave, update, kick, listPublic, leaderboard, recordWar, flush, get: id => clans.get(id) || null };
}

module.exports = { createClans, PRESET_EMBLEMS, FLAG_EMBLEMS, TIERS };
