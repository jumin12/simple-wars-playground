/**
 * Simple Wars — multiplayer relay
 * Host-authoritative: host runs full sim; server forwards snapshots & player commands.
 * Lobby browser: list open games, optional password, online count.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto=require('crypto');
const { WebSocketServer } = require('ws');
const profiles = require('./profiles');
const commerceHttp = require('./commerce-http').createCommerceHttp();
const profileHttp = require('./profile-http').createProfileHttp(profiles);
const { createClans } = require('./clans');

const PORT = parseInt(process.env.PORT || '8080', 10);
const MAX_PLAYERS = 4;
// Only a host inside a room sends big messages (the match start payload and snapshots). Everyone else is
// limited to small control messages, checked before the message is parsed.
const MAX_INIT_BYTES = 48 * 1024 * 1024;
const MAX_CONTROL_BYTES = 2 * 1024 * 1024;
// Per-connection rate limit (token bucket). A host sends about ten snapshots a second plus commands.
const RATE_BURST = 240;
const RATE_PER_SECOND = 120;
const MAX_QUEUED_MESSAGES = 64;
const ABUSE_DROPS_BEFORE_CLOSE = 2000;
// Results reported by the host wait this long for the other players' clients to confirm or dispute them.
const RESULT_CONFIRM_MS = 15000;
const DATA_DIR=process.env.WOD_DATA_DIR||__dirname;fs.mkdirSync(DATA_DIR,{recursive:true});
// ---- Game version check
// The game's build is the date of its newest changelog entry (js/changelog.js, shipped in the same repository as this
// relay), and its version number counts the entries the way the game does (js/main.js). A client says which build it is
// (the 'hello' message, sent as soon as it connects); one older than the current build may not host or join a match or
// queue for a clan war until it updates, and is told how far behind it is. Clients from before this check send no
// build at all and count as out of date. WOD_MIN_CLIENT_BUILD (an ISO date) sets the oldest build allowed instead of the
// newest (for a grace period while a store update rolls out); WOD_VERSION_GATE=0 turns the check off.
function wodReadGameBuild(){
  // (deployed, the relay has only its own folder: game-build.json there is written from the changelog by
  // scripts/stamp-assets.js. The changelog itself is read only where the whole game sits beside the relay.)
  try{
    const b=JSON.parse(fs.readFileSync(path.join(__dirname,'game-build.json'),'utf8')),t=Date.parse(b&&b.build);
    if(Number.isFinite(t))return{build:new Date(t).toISOString(),version:String(b.version||'')};
  }catch(_){}
  for(const file of [path.join(__dirname,'..','js','changelog.js')]){
    try{
      // (the changelog is data only: one array literal)
      const list=require('vm').runInNewContext(fs.readFileSync(file,'utf8')+'\n;WOD_CHANGELOG',{},{timeout:1000});
      const times=(Array.isArray(list)?list:[]).map(e=>Date.parse(e&&e.at)).filter(Number.isFinite);
      if(!times.length)continue;
      const n=times.length+9;
      return{build:new Date(Math.max(...times)).toISOString(),version:Math.floor(n/10)+'.'+n%10};
    }catch(_){}
  }
  return{build:'',version:''};
}
const GAME_BUILD=wodReadGameBuild();
const MIN_CLIENT_BUILD=(()=>{const v=process.env.WOD_MIN_CLIENT_BUILD;const t=v?Date.parse(v):NaN;return Number.isFinite(t)?new Date(t).toISOString():GAME_BUILD.build||'';})();
const VERSION_GATE=process.env.WOD_VERSION_GATE!=='0'&&!!MIN_CLIENT_BUILD;
function clientOutdated(client){const t=Date.parse(client.build||'');return VERSION_GATE&&!(Number.isFinite(t)&&t>=Date.parse(MIN_CLIENT_BUILD));}
function returningToMatch(client,msg){const room=rooms.get(String(msg.id||'').trim());return !!(room&&room.matchStarted&&client.playerId&&room.seatByPlayerId&&room.seatByPlayerId[client.playerId]);}
function outdatedMessage(client){
  return 'Your game is out of date'+(client.version?' (version '+client.version+')':'')+'. Update Simple Wars'+(GAME_BUILD.version?' to version '+GAME_BUILD.version:'')+' to play multiplayer.';
}
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');
const FRIEND_REMOVALS_FILE = path.join(DATA_DIR, 'friend-removals.json');
const FRIEND_REQUESTS_FILE = path.join(DATA_DIR, 'friend-requests-pending.json');
const LEADERBOARD_SAVE_DEBOUNCE_MS = 2000;
const FRIEND_REMOVALS_SAVE_DEBOUNCE_MS = 2000;

const rooms = new Map();
/** @type {Map<string, object>} */
const onlineByPlayerId = new Map();
/** @type {Map<string, object>} */
const leaderboard = new Map();
/** @type {Map<string, object[]>} */
const pendingFriendRemovals = new Map();
const pendingFriendRequests = new Map();
let friendRequestsSaveTimer = null;
const FRIEND_REQUESTS_SAVE_DEBOUNCE_MS = 2000;
let leaderboardSaveTimer = null;
let friendRemovalsSaveTimer = null;
const friendRequestCooldown = new Map();
const lobbyInviteCooldown = new Map();
const recentLobbyInvites = new Map();
const FRIEND_REQUEST_COOLDOWN_MS = 30000;
const LOBBY_INVITE_COOLDOWN_MS = 45000;
const LOBBY_INVITE_DEDUPE_MS = 60000;
/** Grace before a dropped connection is treated as a full disconnect (AI takeover). */
const MP_DISCONNECT_GRACE_MS = parseInt(process.env.WOD_MP_GRACE_MS || '22500', 10);
/** Close idle sockets that stop responding to pings (proxies often drop ~60s idle WS). */
const MP_STALE_CONNECTION_MS = 90000;
// A player whose socket still holds this much unsent data is skipped for snapshots until it drains (the snap relay).
const MP_SNAP_BACKLOG_BYTES = 1536 * 1024;
// Clans live in clans.json; a player's clan is found by player id, so it follows the profile between sessions.
const clans = createClans({
  dataDir: DATA_DIR,
  pool: process.env.DATABASE_URL ? new (require('pg').Pool)({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000, statement_timeout: 30000 }) : null,
  profiles,
  nameOf: (pid) => String((profiles.getProfile(pid) && profiles.getProfile(pid).profile.mpDisplayName) || 'Player'),
  isOnline: (pid) => onlineByPlayerId.has(pid),
});
// ---- Clan wars ----
// 1v1: members queue alone and are only ever paired with a player of another clan, never a clanmate.
// 2v2: played as a party, as in Clash Royale: a member invites an online clanmate; once both are in the party either
// may start the search, and two parties of different clans are matched. A player in a party cannot queue 1v1.
// A match makes a private war lobby: the first player hosts it (its game builds the map and starts the war once
// everyone is seated), the others are sent its code and seat. Results, with each side's kills and losses, count for the
// clans; a side whose players all leave the war loses it.
const CW_SETUP_MS = parseInt(process.env.WOD_CW_SETUP_MS || '90000', 10);
const CW_PARTY_INVITE_MS = 60000;
const cwQueues = { '1v1': [], '2v2': [] };   // 1v1: {client, playerId, clanId, since}; 2v2: {party, clanId, since}
const cwWars = new Map();
const cwParties = new Map();                 // party id -> {id, clanId, leader, members: [playerId, playerId]}
const cwPartyInvites = new Map();            // invited playerId -> {from, clanId, at}
const cwName = (pid) => String((profiles.getProfile(pid) && profiles.getProfile(pid).profile.mpDisplayName) || 'Player');
function cwSend(client, msg) { try { if (client && client.ws.readyState === 1) client.ws.send(JSON.stringify(msg)); } catch (_) {} }
function cwOnline(pid) { const c = onlineByPlayerId.get(pid); return c && c.ws.readyState === 1 ? c : null; }
function cwPartyOf(client) { return client && client.cwPartyId ? cwParties.get(client.cwPartyId) || null : null; }
function cwLive(e) {
  if (e.party) return cwParties.get(e.party.id) === e.party && e.party.members.length === 2 && e.party.members.every(cwOnline);
  return e.client.ws.readyState === 1 && onlineByPlayerId.get(e.playerId) === e.client;
}
function cwCounts() {
  const out = {};
  for (const tier of clans.TIERS) {
    const q = cwQueues[tier].filter(cwLive);
    out[tier] = { players: q.reduce((n, e) => n + (e.party ? e.party.members.length : 1), 0), clans: new Set(q.map((e) => e.clanId)).size, parties: tier === '2v2' ? q.length : 0 };
  }
  out.warsInProgress = [...cwWars.values()].filter((w) => w.room && w.room.matchStarted).length;
  return out;
}
function cwQueuedTier(client) {
  for (const tier of clans.TIERS) if (cwQueues[tier].some((e) => e.client === client || (e.party && e.party.members.includes(client.playerId)))) return tier;
  return null;
}
function cwInviteOpen(i) { return i && Date.now() - i.at < CW_PARTY_INVITE_MS; }
function cwQueueEntry(client) {
  for (const tier of clans.TIERS) { const e = cwQueues[tier].find((x) => x.client === client || (x.party && x.party.members.includes(client.playerId))); if (e) return e; }
  return null;
}
function cwStatusFor(client) {
  const war = client.cwWarId ? cwWars.get(client.cwWarId) : null, party = cwPartyOf(client), inv = cwPartyInvites.get(client.playerId);
  return {
    t: 'cw_status', counts: cwCounts(), queued: cwQueuedTier(client), war: war ? cwPublic(war) : null,
    queuedFor: (() => { const e = cwQueueEntry(client); return e ? Date.now() - e.since : 0; })(),
    queuedBy: (() => { const e = cwQueueEntry(client); return e && e.party ? cwName(e.startedBy) : ''; })(),
    party: party ? { id: party.id, leader: party.leader, members: party.members.map((pid) => ({ playerId: pid, name: cwName(pid), online: !!cwOnline(pid) })) } : null,
    partyInvite: cwInviteOpen(inv) ? { from: inv.from, name: cwName(inv.from) } : null,
    partyInvitesSent: [...cwPartyInvites].filter(([, i]) => i.from === client.playerId && cwInviteOpen(i)).map(([to]) => ({ playerId: to, name: cwName(to) })),
  };
}
function cwBroadcastStatus() {
  wss.clients.forEach((ws) => { const c = ws._wodClient; if (c && c.cwWatch && ws.readyState === 1) cwSend(c, cwStatusFor(c)); });
}
function cwStatusTo(...pids) { for (const pid of pids) { const c = cwOnline(pid); if (c) cwSend(c, cwStatusFor(c)); } }
function cwRemove(client) {
  let changed = false;
  for (const tier of clans.TIERS) {
    const before = cwQueues[tier].length;
    cwQueues[tier] = cwQueues[tier].filter((e) => e.client !== client && !(e.party && e.party.members.includes(client.playerId)) && cwLive(e));
    if (cwQueues[tier].length !== before) changed = true;
  }
  return changed;
}
function cwDissolveParty(party, reason) {
  if (!party || cwParties.get(party.id) !== party) return;
  cwParties.delete(party.id);
  for (const tier of clans.TIERS) cwQueues[tier] = cwQueues[tier].filter((e) => e.party !== party);
  for (const pid of party.members) {
    const c = cwOnline(pid);
    if (!c) continue;
    if (c.cwPartyId === party.id) c.cwPartyId = null;
    if (reason) cwSend(c, { t: 'cw_party_ended', msg: reason });
  }
  cwStatusTo(...party.members);
  cwBroadcastStatus();
}
function cwLeaveParty(client, reason) { const party = cwPartyOf(client); if (party) cwDissolveParty(party, reason); }
function cwPartyInvite(client, targetId) {
  const clan = clans.clanOf(client.playerId), target = cwOnline(targetId), mine = cwPartyOf(client);
  if (!clan) return 'Join a clan to form a 2v2 party.';
  if (!targetId || targetId === client.playerId) return 'Pick a clanmate to invite.';
  if (!clans.clanOf(targetId) || clans.clanOf(targetId).id !== clan.id) return 'Only members of your clan can join your 2v2 party.';
  if (!target) return cwName(targetId) + ' is not online.';
  if (mine && mine.members.length >= 2) return 'Your party is already full.';
  if (cwPartyOf(target)) return cwName(targetId) + ' is already in a party.';
  if (target.room || target.cwWarId || cwQueuedTier(target)) return cwName(targetId) + ' is busy in a game or a queue.';
  if (client.room || client.cwWarId || (cwQueuedTier(client) === '1v1')) return 'Leave your game or queue first.';
  cwPartyInvites.set(targetId, { from: client.playerId, clanId: clan.id, at: Date.now() });
  cwSend(target, { t: 'cw_party_invite', from: client.playerId, name: cwName(client.playerId), clan: clans.summary(clan) });
  cwStatusTo(client.playerId, targetId);
  return '';
}
function cwPartyAnswer(client, fromId, accept) {
  const inv = cwPartyInvites.get(client.playerId);
  if (!inv || inv.from !== fromId || !cwInviteOpen(inv)) { cwPartyInvites.delete(client.playerId); cwStatusTo(client.playerId); return 'That party invitation has expired.'; }
  cwPartyInvites.delete(client.playerId);
  const host = cwOnline(fromId);
  if (!accept) { if (host) cwSend(host, { t: 'cw_party_ended', msg: cwName(client.playerId) + ' declined your party invitation.' }); cwStatusTo(fromId, client.playerId); return ''; }
  const clan = clans.clanOf(client.playerId);
  if (!host || !clan || clan.id !== inv.clanId || (clans.clanOf(fromId) || {}).id !== clan.id) { cwStatusTo(client.playerId); return 'That party is no longer open.'; }
  if (cwPartyOf(host) || cwPartyOf(client)) { cwStatusTo(client.playerId); return 'One of you is already in a party.'; }
  cwRemove(host); cwRemove(client);
  const party = { id: 'P' + crypto.randomBytes(5).toString('hex'), clanId: clan.id, leader: fromId, members: [fromId, client.playerId] };
  cwParties.set(party.id, party);
  host.cwPartyId = party.id; client.cwPartyId = party.id;
  // (other invitations this pair sent are void: the party is full)
  for (const [to, i] of [...cwPartyInvites]) if (i.from === fromId || i.from === client.playerId) cwPartyInvites.delete(to);
  cwStatusTo(fromId, client.playerId);
  cwBroadcastStatus();
  return '';
}
function cwSeatTypes(war) { return war.tier === '1v1' ? ['human', 'human', 'closed', 'closed'] : ['human', 'human', 'human', 'human']; }
function cwPublic(war) {
  return {
    id: war.id, tier: war.tier,
    sides: war.sides.map((s) => ({ clan: clans.summary(clans.get(s.clanId)) || s.clan, slots: s.slots.slice(), players: s.players.map((p) => ({ playerId: p.playerId, name: p.name, slot: p.slot })) })),
    alliances: war.tier === '2v2' ? [[1, 2], [3, 4]] : [],
  };
}
function cwTryMatch(tier) {
  const q = (cwQueues[tier] = cwQueues[tier].filter(cwLive));
  let pair = null;
  outer: for (let i = 0; i < q.length; i++) for (let j = i + 1; j < q.length; j++) if (q[i].clanId !== q[j].clanId) { pair = [q[i], q[j]]; break outer; }
  if (!pair) return false;
  cwQueues[tier] = q.filter((e) => !pair.includes(e));
  const team = (e) => e.party ? e.party.members.map((pid) => ({ playerId: pid, client: cwOnline(pid), clanId: e.clanId })) : [e];
  cwStartWar(tier, pair.map(team));
  return true;
}
function cwStartWar(tier, teams) {
  const seats = tier === '1v1' ? [[1], [2]] : [[1, 2], [3, 4]];
  const war = { id: 'W' + crypto.randomBytes(6).toString('hex'), tier, secret: crypto.randomBytes(9).toString('base64url'), room: null, createdAt: Date.now(), recorded: false, cancelled: false, timer: null };
  war.sides = teams.map((team, i) => ({
    clanId: team[0].clanId, clan: clans.summary(clans.get(team[0].clanId)), slots: seats[i].slice(),
    players: team.map((e, k) => ({ playerId: e.playerId, name: (e.client && e.client.displayName) || cwName(e.playerId), slot: seats[i][k] })),
  }));
  war.players = war.sides.flatMap((s) => s.players);
  war.hostPlayerId = war.players[0].playerId;
  cwWars.set(war.id, war);
  const pub = cwPublic(war);
  for (const p of war.players) {
    const c = onlineByPlayerId.get(p.playerId);
    if (!c) continue;
    c.cwWarId = war.id;
    cwSend(c, p.playerId === war.hostPlayerId ? { t: 'cw_match', war: pub, role: 'host', slot: p.slot, secret: war.secret } : { t: 'cw_match', war: pub, role: 'guest', slot: p.slot });
  }
  war.timer = setTimeout(() => cwCancel(war, 'Not everyone reached the war lobby in time, so the war was called off. You can queue again.'), CW_SETUP_MS);
  cwBroadcastStatus();
}
function cwCancel(war, reason) {
  if (!war || war.cancelled || war.recorded || (war.room && war.room.matchStarted)) return;
  war.cancelled = true;
  clearTimeout(war.timer);
  cwWars.delete(war.id);
  for (const p of war.players) {
    const c = onlineByPlayerId.get(p.playerId);
    if (!c) continue;
    if (c.cwWarId === war.id) c.cwWarId = null;
    cwSend(c, { t: 'cw_cancelled', warId: war.id, msg: reason });
  }
  const room = war.room;
  if (room) {
    room.clanWar = null;
    for (const c of [...room.clients]) { leaveRoom(c); cwSend(c, { t: 'left' }); }
  }
  cwBroadcastStatus();
}
// A side's kills (enemy troops killed) and losses (own troops lost) in the war, counted as for players, from the
// host's per-seat match totals that ride in its snapshots.
function cwSideTotals(war, side) {
  const byOwner = (war.room && war.room.lastSnap && war.room.lastSnap.payload && war.room.lastSnap.payload.lifetimeStatsByOwner) || {};
  let kills = 0, losses = 0;
  for (const slot of side.slots) {
    const r = byOwner[slot] || byOwner[String(slot)] || {};
    kills += (r.enemyTroopKills | 0) + (r.enemyMarineKills | 0) + (r.enemyTankKills | 0) + (r.enemyShipKills | 0);
    losses += (r.ownTroopLosses | 0) + (r.ownMarineLosses | 0) + (r.ownTankLosses | 0) + (r.ownShipLosses | 0);
  }
  return { kills, losses };
}
function cwFinish(war, outcomes) {
  if (!war || war.recorded) return;
  war.recorded = true;
  clearTimeout(war.timer);
  const totals = war.sides.map((side) => cwSideTotals(war, side));
  const recorded = clans.recordWar({ warId: war.id, tier: war.tier, sides: war.sides.map((side, i) => ({ clanId: side.clanId, outcome: outcomes[i], players: side.players.map((p) => p.playerId), ...totals[i] })) });
  const msg = { t: 'cw_result', warId: war.id, tier: war.tier, sides: war.sides.map((side, i) => ({ clan: clans.summary(clans.get(side.clanId)) || side.clan, outcome: outcomes[i], players: side.players.map((p) => p.name), ...totals[i] })) };
  for (const p of war.players) {
    const c = onlineByPlayerId.get(p.playerId);
    if (!c) continue;
    if (c.cwWarId === war.id) c.cwWarId = null;
    cwSend(c, msg);
  }
  if (recorded) for (const side of war.sides) notifyClanMembers(clans.get(side.clanId));
  cwWars.delete(war.id);
  cwBroadcastStatus();
}
// The host's reported result: a side won if any of its seats won (allies share a win).
function cwRecordFromOutcomes(room, outcomes) {
  const war = room && room.clanWar;
  if (!war || war.recorded) return;
  const of = (side) => side.slots.some((s) => outcomes[String(s)] === 'won') ? 'won'
    : side.slots.every((s) => outcomes[String(s)] === 'lost' || (room.forfeitedSlots && room.forfeitedSlots.has(s))) ? 'lost' : null;
  let [a, b] = war.sides.map(of);
  if (a === 'won' && b !== 'won') b = 'lost';
  else if (b === 'won' && a !== 'won') a = 'lost';
  if (!a || !b || a === b) return;
  cwFinish(war, [a, b]);
}
// A side with nobody left (each seat surrendered, quit, beaten and watching, or gone past the reconnect grace) has
// given up the war: its seats surrender, so the other side's game ends in its victory, and the war is recorded now.
function cwCheckSideGone(room) {
  const war = room && room.clanWar;
  if (!war || war.recorded || !room.matchStarted) return;
  const present = new Set(room.clients.filter((c) => !c.spectating && c.ws.readyState === 1).map((c) => c.slot));
  const gone = (side) => side.slots.every((s) => (room.forfeitedSlots && room.forfeitedSlots.has(s)) || (!present.has(s) && !(room.pendingReconnect && room.pendingReconnect.has(s))));
  const [ga, gb] = war.sides.map(gone);
  if (ga === gb) return;
  const loser = ga ? war.sides[0] : war.sides[1];
  room.forfeitedSlots ||= new Set();
  room.surrenderedSlots ||= new Set();
  for (const s of loser.slots) {
    if (room.surrenderedSlots.has(s)) continue;
    room.forfeitedSlots.add(s);
    room.surrenderedSlots.add(s);
    for (const payload of [room.matchInitPayload, room.lastSnap && room.lastSnap.payload]) {
      if (!payload) continue;
      payload.forfeitedSlots = [...room.forfeitedSlots];
      payload.surrenderedSlots = [...room.surrenderedSlots];
      payload.eliminatedSlots = [...new Set([...(payload.eliminatedSlots || []), s])];
    }
    broadcastAll(room, { t: 'player_forfeited', slot: s, count: room.clients.length, surrender: true, clanWar: true });
  }
  cwFinish(war, ga ? ['lost', 'won'] : ['won', 'lost']);
}
function clanInfoFor(client, clan, extra) {
  return { t: 'clan_info', clan: clans.detail(clan, client.playerId), mine: clans.summary(clans.clanOf(client.playerId)), pending: clans.pendingFor(client.playerId), ...(extra || {}) };
}
function clanTell(pid, clanForView, notice) { const c = cwOnline(pid); if (c) cwSend(c, clanInfoFor(c, clanForView === undefined ? clans.clanOf(pid) : clanForView, notice ? { notice } : null)); }
function notifyClanMembers(clan, exceptClient) {
  if (!clan) return;
  for (const m of clan.members) {
    const c = onlineByPlayerId.get(m.playerId);
    if (c && c !== exceptClient) cwSend(c, clanInfoFor(c, clan));
  }
}
setInterval(() => { try { if (clans.checkInactiveLeaders()) for (const ws of wss.clients) { const c = ws._wodClient; if (c && c.playerId && clans.clanOf(c.playerId)) cwSend(c, clanInfoFor(c, clans.clanOf(c.playerId))); } } catch (e) { console.warn('[clans] leader check failed', e.message); } }, 6 * 3600000).unref();

function sanitizePlayerId(id) {
  const s = String(id || '').trim().toUpperCase().slice(0, 32);
  if (!/^WOD-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(s)) return '';
  return s;
}

function sanitizeDisplayName(raw) {
  return String(raw || '').trim().slice(0, 24) || 'Player';
}

function displayNameKey(raw) {
  return sanitizeDisplayName(raw).toLowerCase();
}

function findPlayerIdByDisplayName(displayName, excludePlayerId) {
  const key = displayNameKey(displayName);
  if (!key) return '';
  for (const [pid, row] of leaderboard) {
    if (excludePlayerId && pid === excludePlayerId) continue;
    if (displayNameKey(row.displayName) === key) return pid;
  }
  for (const [pid, peer] of onlineByPlayerId) {
    if (excludePlayerId && pid === excludePlayerId) continue;
    if (displayNameKey(peer.displayName) === key) return pid;
  }
  for (const pid of profiles.getAllPlayerIds()) {
    if (excludePlayerId && pid === excludePlayerId) continue;
    const prof = profiles.getProfile(pid);
    if (!prof) continue;
    if (displayNameKey(prof.profile.mpDisplayName) === key) return pid;
  }
  return '';
}

function validateDisplayNameForPlayer(displayName, playerId) {
  const raw = String(displayName || '').trim();
  if (!raw) {
    return { ok: false, reason: 'display_name_required', msg: 'Enter a display name.' };
  }
  const name = sanitizeDisplayName(raw);
  const owner = findPlayerIdByDisplayName(name, playerId);
  if (owner) {
    return { ok: false, reason: 'display_name_taken', msg: 'That display name is already taken.' };
  }
  return { ok: true, name };
}

function sanitizeUnitSkin(raw) {
  const s = String(raw || 'nato').trim().slice(0, 32);
  return s || 'nato';
}

function sanitizeCombinedStats(obj) {
  if (!obj || typeof obj !== 'object') {
    return { wins: 0, losses: 0, kills: 0, defeats: 0, gamesPlayed: 0 };
  }
  const c = (v) => Math.max(0, Math.min(9999999, parseInt(v, 10) || 0));
  return {
    wins: c(obj.wins),
    losses: c(obj.losses),
    kills: c(obj.kills),
    defeats: c(obj.defeats),
    gamesPlayed: c(obj.gamesPlayed),
  };
}

function loadLeaderboardFromDisk() {
  try {
    if (!fs.existsSync(LEADERBOARD_FILE)) return;
    const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return;
    for (const [id, row] of Object.entries(data)) {
      const playerId = sanitizePlayerId(id);
      if (!playerId || !row || typeof row !== 'object') continue;
      leaderboard.set(playerId, {
        playerId,
        displayName: sanitizeDisplayName(row.displayName),
        unitSkin: sanitizeUnitSkin(row.unitSkin),
        stats: sanitizeCombinedStats(row.stats),
        updatedAt: Math.max(0, parseInt(row.updatedAt, 10) || 0),
      });
    }
  } catch (err) {
    console.warn('[leaderboard] load failed:', err.message);
  }
}

function scheduleLeaderboardSave() {
  if (leaderboardSaveTimer) return;
  leaderboardSaveTimer = setTimeout(() => {
    leaderboardSaveTimer = null;
    try {
      const data = Object.fromEntries(leaderboard);
      fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.warn('[leaderboard] save failed:', err.message);
    }
  }, LEADERBOARD_SAVE_DEBOUNCE_MS);
}

function loadFriendRemovalsFromDisk() {
  try {
    if (!fs.existsSync(FRIEND_REMOVALS_FILE)) return;
    const raw = fs.readFileSync(FRIEND_REMOVALS_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return;
    for (const [id, rows] of Object.entries(data)) {
      const targetId = sanitizePlayerId(id);
      if (!targetId || !Array.isArray(rows)) continue;
      const list = [];
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const fromPlayerId = sanitizePlayerId(row.fromPlayerId);
        if (!fromPlayerId) continue;
        list.push({
          fromPlayerId,
          fromName: sanitizeDisplayName(row.fromName),
          at: Math.max(0, parseInt(row.at, 10) || 0),
        });
      }
      if (list.length) pendingFriendRemovals.set(targetId, list);
    }
  } catch (err) {
    console.warn('[friend-removals] load failed:', err.message);
  }
}

function scheduleFriendRemovalsSave() {
  if (friendRemovalsSaveTimer) return;
  friendRemovalsSaveTimer = setTimeout(() => {
    friendRemovalsSaveTimer = null;
    try {
      const data = Object.fromEntries(pendingFriendRemovals);
      fs.writeFileSync(FRIEND_REMOVALS_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.warn('[friend-removals] save failed:', err.message);
    }
  }, FRIEND_REMOVALS_SAVE_DEBOUNCE_MS);
}

function queueFriendRemoval(targetId, entry) {
  if (!targetId || !entry || !entry.fromPlayerId) return;
  const list = pendingFriendRemovals.get(targetId) || [];
  if (!list.some((row) => row.fromPlayerId === entry.fromPlayerId)) {
    list.push({
      fromPlayerId: entry.fromPlayerId,
      fromName: sanitizeDisplayName(entry.fromName),
      at: entry.at || Date.now(),
    });
    pendingFriendRemovals.set(targetId, list);
    scheduleFriendRemovalsSave();
  }
}

function sendFriendRemovedNotice(client, entry) {
  if (!client || !client.ws || client.ws.readyState !== 1 || !entry) return false;
  try {
    client.ws.send(
      JSON.stringify({
        t: 'friend_removed',
        fromPlayerId: entry.fromPlayerId,
        fromName: entry.fromName || 'Player',
      }),
    );
    return true;
  } catch (_) {
    return false;
  }
}

function flushFriendRemovalsForClient(client) {
  const targetId = client && client.playerId;
  if (!targetId) return;
  const list = pendingFriendRemovals.get(targetId);
  if (!list || !list.length) return;
  for (const entry of list) sendFriendRemovedNotice(client, entry);
  pendingFriendRemovals.delete(targetId);
  scheduleFriendRemovalsSave();
}

function loadFriendRequestsFromDisk() {
  try {
    if (!fs.existsSync(FRIEND_REQUESTS_FILE)) return;
    const raw = fs.readFileSync(FRIEND_REQUESTS_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return;
    for (const [id, rows] of Object.entries(data)) {
      const targetId = sanitizePlayerId(id);
      if (!targetId || !Array.isArray(rows)) continue;
      const list = [];
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const fromPlayerId = sanitizePlayerId(row.fromPlayerId);
        if (!fromPlayerId) continue;
        list.push({
          fromPlayerId,
          fromName: sanitizeDisplayName(row.fromName),
          unitSkin: sanitizeUnitSkin(row.unitSkin),
          at: Math.max(0, parseInt(row.at, 10) || 0),
        });
      }
      if (list.length) pendingFriendRequests.set(targetId, list);
    }
  } catch (err) {
    console.warn('[friend-requests] load failed:', err.message);
  }
}

function scheduleFriendRequestsSave() {
  if (friendRequestsSaveTimer) return;
  friendRequestsSaveTimer = setTimeout(() => {
    friendRequestsSaveTimer = null;
    try {
      const data = Object.fromEntries(pendingFriendRequests);
      fs.writeFileSync(FRIEND_REQUESTS_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.warn('[friend-requests] save failed:', err.message);
    }
  }, FRIEND_REQUESTS_SAVE_DEBOUNCE_MS);
}

function queueFriendRequest(targetId, entry) {
  if (!targetId || !entry || !entry.fromPlayerId) return;
  const list = pendingFriendRequests.get(targetId) || [];
  if (!list.some((row) => row.fromPlayerId === entry.fromPlayerId)) {
    list.push({
      fromPlayerId: entry.fromPlayerId,
      fromName: sanitizeDisplayName(entry.fromName),
      unitSkin: sanitizeUnitSkin(entry.unitSkin),
      at: entry.at || Date.now(),
    });
    pendingFriendRequests.set(targetId, list);
    scheduleFriendRequestsSave();
  }
}

function sendFriendRequestNotice(client, entry) {
  if (!client || !client.ws || client.ws.readyState !== 1 || !entry) return false;
  try {
    client.ws.send(
      JSON.stringify({
        t: 'friend_request',
        fromPlayerId: entry.fromPlayerId,
        fromName: entry.fromName || 'Player',
        unitSkin: entry.unitSkin || 'nato',
      }),
    );
    return true;
  } catch (_) {
    return false;
  }
}

function flushFriendRequestsForClient(client) {
  const targetId = client && client.playerId;
  if (!targetId) return;
  const list = pendingFriendRequests.get(targetId);
  if (!list || !list.length) return;
  for (const entry of list) sendFriendRequestNotice(client, entry);
  pendingFriendRequests.delete(targetId);
  scheduleFriendRequestsSave();
}

function leaderboardRowFromProfile(playerId) {
  const pid = sanitizePlayerId(playerId);
  if (!pid) return null;
  const prof = profiles.getProfile(pid);
  if (!prof) return null;
  const name = String(prof.profile.mpDisplayName || '').trim();
  if (!name) return null;
  return {
    playerId: pid,
    displayName: sanitizeDisplayName(name),
    unitSkin: profiles.validateEquippedSkin(prof, prof.profile.unitSkin),
    stats: sanitizeCombinedStats(profiles.computeCombinedStats(prof)),
    updatedAt: Math.max(0, parseInt(prof.updatedAt, 10) || 0),
  };
}

function hydrateLeaderboardFromProfiles() {
  for (const playerId of profiles.getAllPlayerIds()) {
    const fromProf = leaderboardRowFromProfile(playerId);
    if (!fromProf) continue;
    const existing = leaderboard.get(playerId);
    if (!existing) {
      leaderboard.set(playerId, fromProf);
      continue;
    }
    const profNewer = (fromProf.updatedAt || 0) >= (existing.updatedAt || 0);
    leaderboard.set(playerId, {
      playerId,
      displayName: fromProf.displayName || existing.displayName,
      unitSkin: fromProf.unitSkin || existing.unitSkin,
      stats: fromProf.stats,
      updatedAt: Math.max(fromProf.updatedAt || 0, existing.updatedAt || 0),
    });
  }
}

function updateLeaderboardEntry(client, combinedStats) {
  if (!client || !client.playerId) return;
  leaderboard.set(client.playerId, {
    playerId: client.playerId,
    displayName: client.displayName || 'Player',
    unitSkin: client.unitSkin || 'nato',
    stats: sanitizeCombinedStats(combinedStats),
    updatedAt: Date.now(),
  });
  scheduleLeaderboardSave();
}

function cooldownBlocked(map, key, ms) {
  const last = map.get(key) || 0;
  return Date.now() - last < ms;
}

function markCooldown(map, key) {
  map.set(key, Date.now());
}

function buildLeaderboardRows(sortKey, filterIds) {
  hydrateLeaderboardFromProfiles();
  const key = ['wins', 'kills', 'losses', 'defeats', 'gamesPlayed'].includes(sortKey)
    ? sortKey
    : 'wins';
  let rows = [...leaderboard.values()].filter((r) => r && r.playerId);
  if (Array.isArray(filterIds) && filterIds.length) {
    const set = new Set(filterIds);
    const have = new Set(rows.map((r) => r.playerId));
    for (const fid of filterIds) {
      const pid = sanitizePlayerId(fid);
      if (!pid || !set.has(pid) || have.has(pid)) continue;
      const row = leaderboardRowFromProfile(pid);
      if (row) {
        rows.push(row);
        have.add(pid);
      }
    }
    rows = rows.filter((r) => set.has(r.playerId));
  }
  return rows
    .sort((a, b) => {
      const av = (a.stats && a.stats[key]) || 0;
      const bv = (b.stats && b.stats[key]) || 0;
      if (bv !== av) return bv - av;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    })
            .map((r) => ({
      playerId: r.playerId,
      displayName: r.displayName,
      unitSkin: r.unitSkin,
      stats: r.stats,
      updatedAt: r.updatedAt,
      online: !!(r.playerId && onlineByPlayerId.has(sanitizePlayerId(r.playerId))),
      clan: clans.summary(clans.clanOf(r.playerId)),
    }));
}

function sanitizeMpStats(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const g = parseInt(obj.gamesPlayed, 10);
  const w = parseInt(obj.wins, 10);
  const l = parseInt(obj.losses, 10);
  return {
    gamesPlayed: Number.isFinite(g) ? Math.max(0, Math.min(99999, g)) : 0,
    wins: Number.isFinite(w) ? Math.max(0, Math.min(99999, w)) : 0,
    losses: Number.isFinite(l) ? Math.max(0, Math.min(99999, l)) : 0,
  };
}

function registerClientPlayer(client, payload) {
  if (!client || !payload || typeof payload !== 'object') {
    return { ok: false, reason: 'invalid', msg: 'Invalid registration.' };
  }
  const playerId = sanitizePlayerId(payload.playerId);
  if (!playerId) return { ok: false, reason: 'invalid_player_id', msg: 'Invalid player ID.' };
  const nameCheck = validateDisplayNameForPlayer(payload.displayName, playerId);
  if (!nameCheck.ok) return nameCheck;
  if (client.playerId && client.playerId !== playerId) onlineByPlayerId.delete(client.playerId);
  if(client.identityKey&&[...wss.clients].some(w=>w!==client.ws&&w.readyState===1&&w._wodClient?.playerId===playerId&&w._wodClient.room))return {ok:false,reason:'profile_in_use',msg:'Your profile is already in a game. Leave that game before joining another.'};
  client.playerId = playerId;
  client.displayName = nameCheck.name;
  const profile = profiles.getProfile(playerId);
  client.unitSkin = profiles.validateEquippedSkin(profile, payload.unitSkin);
  profile.profile.unitSkin = client.unitSkin;
  profile.profile.mpDisplayName = nameCheck.name;
  profiles.attachClientProfile(client, nameCheck.name);
  onlineByPlayerId.set(playerId, client);
  updateLeaderboardEntry(client, client.combinedStats);
  return { ok: true, playerId, profile: profiles.exportProfile(playerId) };
}

function unregisterClientPlayer(client) {
  if (!client || !client.playerId) return;
  const cur = onlineByPlayerId.get(client.playerId);
  if (cur === client) onlineByPlayerId.delete(client.playerId);
  client.playerId = '';
}

function lobbyCap() {
  return MAX_PLAYERS;
}

function normalizeSeatTypes(meta) {
  if (!meta || typeof meta !== 'object') return;
  meta.maxHumans = MAX_PLAYERS;
  let st = Array.isArray(meta.seatTypes) ? meta.seatTypes.slice(0, MAX_PLAYERS) : [];
  while (st.length < MAX_PLAYERS) st.push(st.length === 0 ? 'human' : 'closed');
  for (let i = 0; i < st.length; i++) {
    const v = st[i];
    if (v === 'bot' || v === 'closed') st[i] = v;
    else st[i] = 'human';
  }
  meta.seatTypes = st;
  let bots = 0;
  for (let i = 0; i < st.length; i++) {
    if (st[i] === 'bot') bots++;
  }
  meta.aiCount = bots;
}

const DEFAULT_SLOT_COLORS = ['#2ecc71', '#e74c3c', '#9b59b6', '#e67e22', '#3498db', '#f1c40f'];

function slotEffectiveColor(room, slot) {
  const pc = (room.meta && room.meta.playerColors) || {};
  const explicit = pc[String(slot)];
  if (explicit && /^#[0-9A-Fa-f]{6}$/.test(String(explicit))) return String(explicit).toLowerCase();
  if (slot >= 1 && slot <= DEFAULT_SLOT_COLORS.length) return DEFAULT_SLOT_COLORS[slot - 1].toLowerCase();
  return '';
}

function lobbyActiveSeats(room) {
  normalizeSeatTypes(room.meta);
  const cap = lobbyCap();
  const st = room.meta.seatTypes || [];
  const out = [];
  for (let s = 1; s <= cap; s++) {
    if ((st[s - 1] || 'human') !== 'closed') out.push(s);
  }
  return out;
}

/** First slot 1..cap that is `human` in seatTypes and not taken by a connected client. */
function firstFreeHumanSlot(room) {
  normalizeSeatTypes(room.meta);
  const cap = lobbyCap();
  const taken = new Set();
  for (const c of room.clients) taken.add(c.slot);
  const st = room.meta.seatTypes;
  for (let s = 1; s <= cap; s++) {
    if ((st[s - 1] || 'human') !== 'human') continue;
    if (!taken.has(s)) return s;
  }
  return 0;
}

// A player joining a lobby with no open seat takes one the host left closed, or failing that the last AI seat: a lobby is
// full only when four players are in it (it used to refuse them while an AI held a seat). The host's screen redraws its
// seats from the room's settings, and its map preview follows.
function openSeatForJoiner(room) {
  normalizeSeatTypes(room.meta);
  if (firstFreeHumanSlot(room)) return true;
  const st = room.meta.seatTypes, cap = lobbyCap(), taken = new Set(room.clients.map((c) => c.slot));
  let seat = 0;
  for (let s = 1; s <= cap && !seat; s++) if (st[s - 1] === 'closed' && !taken.has(s)) seat = s;
  for (let s = cap; s >= 1 && !seat; s--) if (st[s - 1] === 'bot' && !taken.has(s)) seat = s;
  if (!seat) return false;
  st[seat - 1] = 'human';
  normalizeSeatTypes(room.meta);
  return true;
}

function pickJoinSlot(room, requestedSeat) {
  normalizeSeatTypes(room.meta);
  const cap = lobbyCap();
  const taken = new Set();
  for (const c of room.clients) taken.add(c.slot);
  const st = room.meta.seatTypes || [];
  const req = parseInt(requestedSeat, 10) || 0;
  if (req >= 1 && req <= cap && (st[req - 1] || 'human') === 'human' && !taken.has(req)) return req;
  return firstFreeHumanSlot(room);
}

function captureMatchSeatPlayers(room) {
  const map = {};
  for (const c of room.clients) {
    const pid = sanitizePlayerId(c.playerId);
    if (pid && c.slot > 0) map[pid] = c.slot;
  }
  room.seatByPlayerId = map;
  room.disconnectedSlots = room.disconnectedSlots || new Set();
}

function cancelMatchReconnectGrace(room, slot) {
  if (!room || !room.pendingReconnect || !slot) return;
  const pending = room.pendingReconnect.get(slot);
  if (!pending) return;
  if (pending.timer) clearTimeout(pending.timer);
  room.pendingReconnect.delete(slot);
}

function buildOutcomesFromLastSnap(room) {
  const snap = room.lastSnap && room.lastSnap.payload;
  const hs =
    (room.matchInitPayload && room.matchInitPayload.humanSlots) ||
    [...new Set(Object.values(room.seatByPlayerId || {}))];
  const outcomes = {};
  if (!hs.length) return outcomes;
  let best = null;
  let bestN = -1;
  if (snap && Array.isArray(snap.cities)) {
    for (const s of hs) {
      let n = 0;
      for (const c of snap.cities) if ((c.owner | 0) === s) n++;
      if (n > bestN) {
        bestN = n;
        best = s;
      } else if (n === bestN) best = null;
    }
  }
  for (const s of hs) {
    outcomes[String(s)] = best && s === best ? 'won' : 'lost';
  }
  return outcomes;
}

function isHumanSeat(meta, slot) {
  const st = (meta && meta.seatTypes) || [];
  const s = slot | 0;
  if (s < 1 || s > st.length) return false;
  return (st[s - 1] || 'human') === 'human';
}

/** True when another human player (any seat) remains besides leftSlot. */
function otherHumanPlayersRemain(room, leftSlot) {
  if (!room) return false;
  const map = room.seatByPlayerId || {};
  const meta = room.meta || {};
  for (const [pid, slot] of Object.entries(map)) {
    const s = slot | 0;
    if (!s || s === (leftSlot | 0)) continue;
    if (!sanitizePlayerId(pid)) continue;
    if (isHumanSeat(meta, s)) return true;
  }
  return false;
}

function cancelAllMatchReconnectGrace(room) {
  if (!room || !room.pendingReconnect) return;
  for (const [, pending] of room.pendingReconnect) {
    if (pending && pending.timer) clearTimeout(pending.timer);
  }
  room.pendingReconnect.clear();
}

function endMatchAsLastHuman(room) {
  if (!room || !room.matchStarted) return;
  cancelAllMatchReconnectGrace(room);
  finalizeAbandonedMatch(room);
  rooms.delete(room.id);
  broadcastLobbyList();
}

function buildMatchEndParticipants(room, outcomes) {
  const map = room.seatByPlayerId || {};
  const seen = new Set();
  const out = [];
  const add = (slot, playerId) => {
    const s = slot | 0;
    const pid = sanitizePlayerId(playerId);
    if (!s || !pid || seen.has(pid)) return;
    const oc = outcomes[String(s)] || outcomes[s];
    if (oc !== 'won' && oc !== 'lost') return;
    seen.add(pid);
    out.push({ slot: s, playerId: pid });
  };
  for (const [pid, slot] of Object.entries(map)) add(slot, pid);
  return out;
}

function mergeMatchEndParticipants(room, clientParticipants, outcomes) {
  const merged = [];
  const seen = new Set();
  const add = (slot, playerId) => {
    const s = slot | 0;
    const pid = sanitizePlayerId(playerId);
    if (!s || !pid || seen.has(pid)) return;
    const oc = outcomes[String(s)] || outcomes[s];
    if (oc !== 'won' && oc !== 'lost') return;
    seen.add(pid);
    merged.push({ slot: s, playerId: pid });
  };
  if (Array.isArray(clientParticipants)) {
    for (const part of clientParticipants) {
      if (!part || typeof part !== 'object') continue;
      add(part.slot, part.playerId);
    }
  }
  const map = (room && room.seatByPlayerId) || {};
  for (const [pid, slot] of Object.entries(map)) add(slot, pid);
  return merged;
}

function finalizeAbandonedMatch(room) {
  if (!room || !room.matchStarted || room._matchEndRecorded) return;
  const hostPid =
    sanitizePlayerId(room.hostPlayerId) ||
    sanitizePlayerId(room.host && room.host.playerId) ||
    sanitizePlayerId(Object.keys(room.seatByPlayerId || {})[0]);
  const outcomes = buildOutcomesFromLastSnap(room);
  const participants = buildMatchEndParticipants(room, outcomes);
  if (!participants.length) return;
  const result = profiles.recordMpMatchEnd(hostPid, room, { outcomes, participants });
  if (result.ok) room._matchEndRecorded = true;
}

// ---- Host-reported results ----
// The host runs the simulation, so the relay cannot replay a match. What it can do is give every other
// player's client the chance to object: each guest reports the result its snapshot showed and whether its
// own copy of the battle agrees. A report is recorded once every connected guest agrees, or after
// RESULT_CONFIRM_MS without objection (older clients never answer). One objection drops that report.
function resolvedOutcomeKey(outcomes) {
  return Object.keys(outcomes || {})
    .filter((slot) => outcomes[slot] === 'won' || outcomes[slot] === 'lost')
    .sort()
    .map((slot) => slot + ':' + outcomes[slot])
    .join(',');
}

function queueHostResult(hostClient, outcomes, participants, alreadyWatching) {
  const room = hostClient.room;
  const waiting = new Set();
  for (const peer of room.clients) {
    if (peer === hostClient || !peer.playerId || peer.ws.readyState !== 1) continue;
    if (!isHumanSeat(room.meta, peer.slot)) continue;
    // A guest who lost earlier and is watching does not answer (its client skips match-end handling).
    if (alreadyWatching && alreadyWatching.has(peer.slot)) continue;
    waiting.add(peer.slot);
  }
  const pending = { hostClient, outcomes, participants, key: resolvedOutcomeKey(outcomes), waiting, disputed: false, timer: null };
  room.pendingResults ||= [];
  room.pendingResults.push(pending);
  if (!waiting.size) {
    void commitHostResult(room, pending);
    return;
  }
  pending.timer = setTimeout(() => { void commitHostResult(room, pending); }, RESULT_CONFIRM_MS);
}

function confirmHostResult(guest, outcomes, agree) {
  const room = guest.room;
  const list = room.pendingResults || [];
  const key = resolvedOutcomeKey(outcomes);
  // The report this guest is answering: same resolved outcomes, else the newest one it was waiting on.
  const pending = list.find((p) => p.key === key && p.waiting.has(guest.slot))
    || [...list].reverse().find((p) => p.waiting.has(guest.slot));
  if (!pending) return;
  pending.waiting.delete(guest.slot);
  if (!agree || pending.key !== key) {
    pending.disputed = true;
    clearTimeout(pending.timer);
    room.pendingResults = list.filter((p) => p !== pending);
    const notice = JSON.stringify({ t: 'mp_result_disputed', msg: 'A player\'s game disagreed with the reported result, so it was not recorded.' });
    for (const peer of room.clients) { try { if (peer.ws.readyState === 1) peer.ws.send(notice); } catch (_) {} }
    console.warn('[mp] result disputed in room', room.id || '?', 'host report', pending.key, 'guest slot', guest.slot, 'saw', key, 'agree', agree);
    return;
  }
  if (!pending.waiting.size) {
    clearTimeout(pending.timer);
    void commitHostResult(room, pending);
  }
}

async function commitHostResult(room, pending) {
  if (pending.done || pending.disputed) return;
  pending.done = true;
  room.pendingResults = (room.pendingResults || []).filter((p) => p !== pending);
  const host = pending.hostClient;
  const result = profiles.recordMpMatchEnd(host.playerId, room, { outcomes: pending.outcomes, participants: pending.participants });
  if (!result.ok) {
    try { host.ws.send(JSON.stringify({ t: 'error', msg: result.msg || 'Could not record match' })); } catch (_) {}
    return;
  }
  await profiles.flush();
  for (const pid of result.updatedPlayerIds || []) {
    const peer = onlineByPlayerId.get(pid);
    if (peer) {
      profiles.attachClientProfile(peer, peer.displayName);
      updateLeaderboardEntry(peer, peer.combinedStats);
      try { peer.ws.send(JSON.stringify({ t: 'profile', profile: profiles.exportProfile(pid) })); } catch (_) {}
    } else {
      // Player already disconnected: still update their leaderboard row from the profile.
      const prof = profiles.getProfile(pid);
      if (prof) {
        updateLeaderboardEntry(
          { playerId: pid, displayName: prof.profile.mpDisplayName || 'Player', unitSkin: prof.profile.unitSkin || 'nato' },
          profiles.computeCombinedStats(prof),
        );
      }
    }
  }
  cwRecordFromOutcomes(room, pending.outcomes);
  try { host.ws.send(JSON.stringify({ t: 'mp_match_end_ack', updatedPlayerIds: result.updatedPlayerIds || [] })); } catch (_) {}
}

function countMatchHumanPlayers(room) {
  if (!room || !room.matchStarted) return 0;
  const map = room.seatByPlayerId || {};
  let n = 0;
  for (const [pid, slot] of Object.entries(map)) {
    if (!sanitizePlayerId(pid)) continue;
    if (isHumanSeat(room.meta, slot | 0)) n++;
  }
  return n;
}

function roomConnectedSlots(room) {
  if (!room) return [];
  return room.clients
    .map((c) => c.slot | 0)
    .filter((s) => s > 0)
    .sort((a, b) => a - b);
}

function patchRoomSnapConnectedSlots(room) {
  if (!room || !room.lastSnap || !room.lastSnap.payload) return;
  room.lastSnap.payload.connectedSlots = roomConnectedSlots(room);
}

function cleanupEmptyMultiplayerRooms() {
  for (const room of rooms.values()) {
    const pending = room.pendingReconnect ? room.pendingReconnect.size : 0;
    if (room.clients.length > 0 || pending > 0) continue;
    if (room.matchStarted) finalizeAbandonedMatch(room);
    rooms.delete(room.id);
  }
}

function maybeEndMatchWhenEmpty(room) {
  if (!room) return;
  const pending = room.pendingReconnect ? room.pendingReconnect.size : 0;
  if (room.clients.length > 0 || pending > 0) {
    if (room.matchStarted) broadcastLobbyList();
    return;
  }
  if (room.matchStarted) finalizeAbandonedMatch(room);
  rooms.delete(room.id);
  broadcastLobbyList();
}

function migrateMatchHostIfNeeded(room) {
  if (!room || !room.matchStarted || room.clients.length === 0) return null;
  const newHost = room.clients.find((c) => c.ws.readyState === 1&&!c.spectating) || room.clients.find(c=>c.ws.readyState===1) || room.clients[0];
  if (!newHost) return null;
  room.host = newHost;
  room.hostPlayerId = sanitizePlayerId(newHost.playerId);
  for (const c of room.clients) {
    c.isHost = c === newHost;
    try {
      c.ws.send(JSON.stringify({ t: 'slot_sync', slot: c.slot, isHost: c.isHost }));
    } catch (_) {}
  }
  broadcastAll(room, { t: 'host_migrated', slot: newHost.slot });
  try {
    newHost.ws.send(
      JSON.stringify({
        t: 'host_takeover',
        payload: room.matchInitPayload || null,
        snap: room.lastSnap || null,forfeitedSlots:[...(room.forfeitedSlots||[])],
      }),
    );
  } catch (_) {}
  return newHost;
}

function markSlotDisconnectedInMatch(room, leftSlot) {
  if (!room || !leftSlot) return;
  cancelMatchReconnectGrace(room, leftSlot);
  if (!room.disconnectedSlots) room.disconnectedSlots = new Set();
  room.disconnectedSlots.add(leftSlot);
  broadcastAll(room, {
    t: 'player_disconnected',
    slot: leftSlot,
    count: room.clients.length,
    canRejoin: true,
  });
  cwCheckSideGone(room);
  maybeEndMatchWhenEmpty(room);
  broadcastLobbyList();
}

function disconnectClientFromMatch(client, immediate) {
  const room = client.room;
  if (!room || !room.matchStarted) {
    leaveRoom(client);
    return;
  }
  const leftSlot = client.slot;
  const wasHost = room.host === client;
  const idx = room.clients.indexOf(client);
  if (idx >= 0) room.clients.splice(idx, 1);
  if (wasHost && room.clients.length > 0) migrateMatchHostIfNeeded(room);
  if (room.clients.length === 0) {
    maybeEndMatchWhenEmpty(room);
    client.room = null;
    client.slot = 0;
    client.isHost = false;
    return;
  }

  if (immediate) {
    if(room.forfeitedSlots?.has(leftSlot))broadcastAll(room,{t:'player_forfeited',slot:leftSlot,count:room.clients.length,surrender:!!room.surrenderedSlots?.has(leftSlot)});else markSlotDisconnectedInMatch(room, leftSlot);
    if (room.clients.length === 0) maybeEndMatchWhenEmpty(room);
    client.room = null;
    client.slot = 0;
    client.isHost = false;
    return;
  }

  if (leftSlot > 0) {
    if (!room.pendingReconnect) room.pendingReconnect = new Map();
    cancelMatchReconnectGrace(room, leftSlot);
    const timer = setTimeout(() => {
      markSlotDisconnectedInMatch(room, leftSlot);
      if (room.clients.length === 0) maybeEndMatchWhenEmpty(room);
    }, MP_DISCONNECT_GRACE_MS);
    room.pendingReconnect.set(leftSlot, { timer, playerId: sanitizePlayerId(client.playerId) });
    try {
      broadcastAll(room, {
        t: 'player_link_lost',
        slot: leftSlot,
        graceMs: MP_DISCONNECT_GRACE_MS,
        count: room.clients.length,
      });
    } catch (_) {}
  }

  client.room = null;
  client.slot = 0;
  client.isHost = false;
  broadcastLobbyList();
}

async function forfeitClientFromMatch(client, spectate=false, surrender=false) {
  const room=client.room;if(!room?.matchStarted){leaveRoom(client);return;}
  const slot=client.slot;room.forfeitedSlots||=new Set();room.forfeitedSlots.add(slot);if(surrender){room.surrenderedSlots||=new Set();room.surrenderedSlots.add(slot);}
  const outcomes=Object.fromEntries(Object.values(room.seatByPlayerId||{}).map(s=>[s,s===slot?'lost':'ongoing']));
  const result=profiles.recordMpMatchEnd(client.playerId,room,{outcomes,participants:[{slot,playerId:client.playerId}]});
  await profiles.flush();
  if(result.ok){profiles.attachClientProfile(client,client.displayName);updateLeaderboardEntry(client,client.combinedStats);if(client.ws.readyState===1)client.ws.send(JSON.stringify({t:'profile',profile:profiles.exportProfile(client.playerId)}));}
  // A player who surrenders concedes: his faction leaves the map and counts as beaten. One who leaves any other way (quits
  // the match, closes the game) loses the match too, but his faction stays: its towns, ground and troops pass to the
  // computer, which the others must still beat (the game hands such seats to the AI, wodMpHandSlotToAi). They used to vanish.
  const patch=payload=>{if(!payload)return;payload.forfeitedSlots=[...room.forfeitedSlots];payload.surrenderedSlots=[...(room.surrenderedSlots||[])];if(!surrender)return;payload.eliminatedSlots=[...new Set([...(payload.eliminatedSlots||[]),slot])];if(payload.entities)payload.entities=payload.entities.filter(u=>u.owner!==slot);if(payload.cities)for(const c of payload.cities)if(c.owner===slot)c.owner=0;if(payload.hexOwners)payload.hexOwners=payload.hexOwners.map(o=>o===slot?0:o);if(payload.hexList)for(const h of payload.hexList)if(h.owner===slot)h.owner=0;};
  patch(room.matchInitPayload);patch(room.lastSnap?.payload);
  setImmediate(()=>cwCheckSideGone(room));
  if(spectate){client.spectating=true;room.observerSlots||=new Set();room.observerSlots.add(slot);cancelMatchReconnectGrace(room,slot);broadcastAll(room,{t:'player_forfeited',slot,count:room.clients.length,surrender:!!room.surrenderedSlots?.has(slot)});return;}
  disconnectClientFromMatch(client,true);
}

function scheduleMatchSocketClose(client) {
  if (!client.room || !client.room.matchStarted) {
    leaveRoom(client);
    return;
  }
  disconnectClientFromMatch(client, false);
}

function assertMetaCompatibleWithRoom(room, metaTrial) {
  normalizeSeatTypes(metaTrial);
  const cap = lobbyCap();
  let humanSeats = 0;
  for (let i = 0; i < cap; i++) {
    if ((metaTrial.seatTypes[i] || 'human') === 'human') humanSeats++;
  }
  if (humanSeats < 1) return 'At least one seat must be Human for real players';
  for (const c of room.clients) {
    if (c.slot > cap) return `Seat ${c.slot} is out of range`;
    const st = metaTrial.seatTypes[c.slot - 1] || 'human';
    if (st !== 'human') return `Seat ${c.slot} has a player — set it to Human first`;
  }
  return null;
}

function metaWire(room) {
  normalizeSeatTypes(room.meta);
  return {
    ...room.meta,
    occupiedSlots: room.clients.map((c) => c.slot).sort((a, b) => a - b),
  };
}

function genLobbyId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function broadcast(room, msg, exceptWs) {
  const raw = JSON.stringify(msg);
  for (const c of room.clients) {
    if (c.ws !== exceptWs && c.ws.readyState === 1) c.ws.send(raw);
  }
}

function broadcastAll(room, msg) {
  const raw = JSON.stringify(msg);
  for (const c of room.clients) {
    if (c.ws.readyState === 1) c.ws.send(raw);
  }
}

function countOnline() {
  let n = 0;
  wss.clients.forEach((ws) => {
    if (ws.readyState === 1) n++;
  });
  return n;
}

function getLobbyListPublic() {
  const out = [];
  for (const room of rooms.values()) {
    if (room.clanWar && !room.matchStarted) continue;
    normalizeSeatTypes(room.meta);
    const cap = lobbyCap();
    const inProgress = !!room.matchStarted;
    const connected = room.clients.length;
    const disc = room.disconnectedSlots ? room.disconnectedSlots.size : 0;
    let listRank = 0;
    if (inProgress) listRank = connected > 0 ? 1 : 2;
    const seatMap = room.seatByPlayerId || {};
    out.push({
      id: room.id,
      name: room.name,
      players: connected,
      max: cap,
      locked: !!room.password,
      inProgress,
      matchInProgress: inProgress,
      disconnectedCount: disc,
      listRank,
      rejoinPlayerIds: Object.keys(seatMap).filter((id) => sanitizePlayerId(id)),
      meta: inProgress
        ? { ...room.meta, matchInProgress: true, occupiedSlots: room.clients.map((c) => c.slot).sort((a, b) => a - b) }
        : metaWire(room),
    });
  }
  out.sort((a, b) => {
    if (a.listRank !== b.listRank) return a.listRank - b.listRank;
    if (!a.inProgress && !b.inProgress) return (b.players | 0) - (a.players | 0);
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
  return out;
}

function broadcastLobbyList() {
  const payload = JSON.stringify({
    t: 'lobby_list',
    lobbies: getLobbyListPublic(),
    online: countOnline(),
  });
  wss.clients.forEach((ws) => {
    if (ws.readyState === 1) ws.send(payload);
  });
}

function addClientToRoom(client, room, requestedSeat) {
  client.room = room;
  normalizeSeatTypes(room.meta);
  const isFirst = room.clients.length === 0;
  const slot = pickJoinSlot(room, requestedSeat);
  client.slot = slot > 0 ? slot : 1;
  room.clients.push(client);
  if (isFirst) {
    client.isHost = true;
    room.host = client;
  } else {
    client.isHost = false;
  }
  if (!room.meta.playerColors || typeof room.meta.playerColors !== 'object')
    room.meta.playerColors = {};
  const sk = String(client.slot);
  if (!room.meta.playerColors[sk]) {
    room.meta.playerColors[sk] = DEFAULT_SLOT_COLORS[(client.slot - 1) % DEFAULT_SLOT_COLORS.length];
  }
}

function leaveRoom(client) {
  const room = client.room;
  if (!room) return;
  if (room.clanWar && !room.matchStarted && !room.clanWar.cancelled) {
    const war = room.clanWar;
    setImmediate(() => cwCancel(war, (client.displayName || 'A player') + ' left the war lobby, so the war was called off. You can queue again.'));
  }
  const leftSlot = client.slot;
  const idx = room.clients.indexOf(client);
  if (idx >= 0) room.clients.splice(idx, 1);
  const wasHost = room.host === client;
  if (wasHost) room.host = room.clients[0] || null;

  for (const c of room.clients) {
    c.isHost = room.host === c;
  }

  if (wasHost && room.host) {
    try {
      if (room.host.ws.readyState === 1)
        room.host.ws.send(
          JSON.stringify({ t: 'host_migrated', slot: room.host.slot, isHost: true }),
        );
    } catch (_) {}
  }
  broadcastAll(room, { t: 'peer_left', slot: leftSlot, count: room.clients.length });
  if (room.meta.playerPublic && typeof room.meta.playerPublic === 'object')
    delete room.meta.playerPublic[String(leftSlot)];
  if (room.clients.length > 0) broadcastAll(room, { t: 'room_meta', meta: metaWire(room) });
  if (room.clients.length === 0) rooms.delete(room.id);
  client.room = null;
  client.slot = 0;
  client.isHost = false;
  broadcastLobbyList();
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/profile/')) { void profileHttp.handle(req, res); return; }
  if (req.url.startsWith('/api/steam/')) { void commerceHttp.handle(req, res); return; }
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('simple-wars-mp ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

// Match snapshots are repetitive JSON sent ten times a second to every player; compressing them
// cuts relay bandwidth by roughly 85-90%. Browsers and Electron negotiate this automatically.
// Small control messages stay uncompressed, and no per-connection compression state is retained.
const wss = new WebSocketServer({
  server,
  maxPayload: MAX_INIT_BYTES,
  perMessageDeflate: {
    zlibDeflateOptions: { level: 3, memLevel: 7 },
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    concurrencyLimit: 8,
    threshold: 1024,
  },
});

wss.on('connection', (ws) => {
  const client = {
    ws,
    room: null,
    slot: 0,
    isHost: false,
    playerId: '',
    displayName: '',
    unitSkin: 'nato',
    mpStats: null,
    lastPingAt: Date.now(),
  };
  ws._wodClient = client;

  try {
    ws.send(
      JSON.stringify({
        t: 'welcome',
        online: countOnline(),
        lobbies: getLobbyListPublic(),
        latestBuild: GAME_BUILD.build,
        latestVersion: GAME_BUILD.version,
        minBuild: VERSION_GATE ? MIN_CLIENT_BUILD : '',
      }),
    );
  } catch (_) {}
  broadcastLobbyList();

  let messageQueue=Promise.resolve();
  let queued=0;
  const bucket={tokens:RATE_BURST,at:Date.now(),drops:0,dropsSince:Date.now()};
  function admitMessage(raw){
    const size=Buffer.isBuffer(raw)?raw.length:Array.isArray(raw)?raw.reduce((n,b)=>n+b.length,0):(raw&&raw.byteLength)||0;
    const limit=client.isHost&&client.room?MAX_INIT_BYTES:MAX_CONTROL_BYTES;
    if(size>limit)return false;
    const now=Date.now();
    bucket.tokens=Math.min(RATE_BURST,bucket.tokens+(now-bucket.at)/1000*RATE_PER_SECOND);bucket.at=now;
    if(bucket.tokens<1||queued>=MAX_QUEUED_MESSAGES)return false;
    bucket.tokens-=1;
    return true;
  }
  ws.on('message',raw=>{
    if(!admitMessage(raw)){
      const now=Date.now();
      if(now-bucket.dropsSince>60000){bucket.drops=0;bucket.dropsSince=now;}
      if(++bucket.drops>ABUSE_DROPS_BEFORE_CLOSE)try{ws.close(1008,'Too many messages');}catch(_){}
      return;
    }
    queued++;
    messageQueue=messageQueue.then(()=>handleMessage(raw)).catch(()=>{if(ws.readyState===1)ws.send(JSON.stringify({t:'error',msg:'Profile service temporarily unavailable. Please reconnect; saved progress is preserved.'}));}).finally(()=>{queued--;});
  });
  async function handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    const t = msg && msg.t;

    if (t === 'hello') {
      client.build = String(msg.build || '').slice(0, 40);
      client.version = String(msg.version || '').slice(0, 12);
      return;
    }
    // (an out-of-date game may keep its profile, friends and clan, but not play: see clientOutdated)
    // (a player coming back to a match already running was let in when it started, so may finish it)
    if ((t === 'create_lobby' || t === 'join_lobby') && clientOutdated(client) && !(t === 'join_lobby' && returningToMatch(client, msg))) {
      ws.send(JSON.stringify({ t: 'error', reason: 'outdated', latestVersion: GAME_BUILD.version, msg: outdatedMessage(client) }));
      return;
    }
    if (t === 'cw_queue' && clientOutdated(client)) {
      cwSend(client, { t: 'cw_error', reason: 'outdated', latestVersion: GAME_BUILD.version, msg: outdatedMessage(client) });
      return;
    }

    if (t === 'register_player') {
      if(client.identityKey&&!msg.profileToken&&client.identityKey!=='browser:'+crypto.createHash('sha256').update(String(msg.deviceSecret||'')).digest('hex')){ws.send(JSON.stringify({t:'register_failed',reason:'identity_locked',msg:'This connection already belongs to a player profile.'}));return;}
      const identity=msg.profileToken?await profiles.steamIdentityToken(msg.profileToken):await profiles.bindBrowser(msg.deviceSecret,msg.playerId);
      if(!identity){ws.send(JSON.stringify({t:'register_failed',reason:'identity_required',msg:'Reconnect using the current game version to restore your player profile.'}));return;}
      if(client.identityKey&&client.identityKey!==identity.identityKey){ws.send(JSON.stringify({t:'register_failed',reason:'identity_locked',msg:'This connection already belongs to a player profile.'}));return;}
      client.identityKey=identity.identityKey;
      const steamId=profiles.steamIdForPlayer(identity.playerId);
      if(steamId){try{const result=await commerceHttp.profileWallet(steamId,profiles.exportProfile(identity.playerId));profiles.applySteamWallet(identity.playerId,result?.wallet);}catch(_){ws.send(JSON.stringify({t:'register_failed',reason:'temporarily_unavailable',msg:'Your saved Steam wallet is temporarily unavailable. Please reconnect shortly.'}));return;}}
      const savedName=profiles.getProfile(identity.playerId)?.profile.mpDisplayName;
      const result = registerClientPlayer(client, {...msg,playerId:identity.playerId,displayName:msg.autoName&&savedName?savedName:msg.displayName});
      if (!result.ok) {
        ws.send(JSON.stringify({ t: 'register_failed', reason: result.reason, msg: result.msg }));
        return;
      }
      await profiles.flush();
      ws.send(JSON.stringify({ t: 'registered', playerId: result.playerId, profile: result.profile || null, clan: clans.summary(clans.clanOf(result.playerId)) }));
      clans.touch(result.playerId);
      flushFriendRemovalsForClient(client);
      flushFriendRequestsForClient(client);
      return;
    }

    if (t === 'get_profile') {
      const playerId = sanitizePlayerId(msg.playerId || (client.playerId || ''));
      if (!client.playerId || playerId!==client.playerId) {
        ws.send(JSON.stringify({ t: 'profile_failed', msg: 'Register your profile before requesting saved progress.' }));
        return;
      }
      ws.send(JSON.stringify({ t: 'profile', profile: profiles.exportProfile(playerId) }));
      return;
    }

    if (t === 'sync_progress') {
      const playerId = sanitizePlayerId(msg.playerId || client.playerId);
      if (!client.playerId || playerId!==client.playerId) {
        ws.send(JSON.stringify({ t: 'profile_failed', msg: 'Register before syncing progress' }));
        return;
      }
      const result = profiles.syncProgress(playerId, msg.progress || msg);
      const steamId=profiles.steamIdForPlayer(playerId);
      if(steamId){const wallet=await commerceHttp.profileWallet(steamId,msg.progress||msg);profiles.applySteamWallet(playerId,wallet?.wallet);result.profile=profiles.exportProfile(playerId);}
      if (!result.ok) {
        ws.send(JSON.stringify({ t: 'profile_failed', msg: result.msg || 'Sync rejected' }));
        return;
      }
      if (client.playerId === playerId) {
        profiles.attachClientProfile(client, client.displayName);
        updateLeaderboardEntry(client, client.combinedStats);
      }
      await profiles.flush();
      ws.send(JSON.stringify({ t: 'profile', profile: result.profile }));
      return;
    }

    if (t === 'shop_purchase') {
      const playerId = sanitizePlayerId(msg.playerId || client.playerId);
      if (!client.playerId || playerId!==client.playerId) {
        ws.send(JSON.stringify({ t: 'shop_failed', msg: 'Register before purchasing' }));
        return;
      }
      const steamId=profiles.steamIdForPlayer(playerId);
      let result;
      if(steamId){
        try{const paid=await commerceHttp.profileWallet(steamId,null,msg);if(!paid)throw Error('Steam wallet is unavailable.');profiles.applySteamWallet(playerId,paid.wallet);result={ok:true,profile:profiles.exportProfile(playerId),alreadyOwned:paid.alreadyOwned};}
        catch(error){ws.send(JSON.stringify({t:'shop_failed',msg:error.message||'Your Steam wallet could not be updated.'}));return;}
      }else result=profiles.shopPurchase(playerId,msg);
      if (!result.ok) {
        ws.send(JSON.stringify({ t: 'shop_failed', msg: result.msg || 'Purchase failed' }));
        return;
      }
      if (client.playerId === playerId) profiles.attachClientProfile(client, client.displayName);
      await profiles.flush();
      ws.send(JSON.stringify({ t: 'shop_purchase_ok', profile: result.profile, alreadyOwned: !!result.alreadyOwned }));
      return;
    }

    if (t === 'mp_match_end') {
      if (!client.room || !client.isHost) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Only the host can report match results' }));
        return;
      }
      const outcomes = msg.outcomes && typeof msg.outcomes === 'object' ? msg.outcomes : {};
      const participants = mergeMatchEndParticipants(client.room, msg.participants, outcomes);
      client.room.observerSlots||=new Set();
      const alreadyWatching=new Set([...client.room.clients].filter(peer=>peer.spectating).map(peer=>peer.slot));
      for(const peer of client.room.clients)if(outcomes[String(peer.slot)]==='lost'){peer.spectating=true;client.room.observerSlots.add(peer.slot);}
      // The host's report is only recorded once the other players' clients have had a chance to dispute it.
      queueHostResult(client, outcomes, participants, alreadyWatching);
      return;
    }

    if (t === 'mp_result') {
      // A guest's view of a result the host announced: what the host's snapshot said, and whether that
      // agrees with the guest's own copy of the battle.
      if (!client.room || client.isHost || !client.room.matchStarted) return;
      if (msg.matchId && client.room.matchId && msg.matchId !== client.room.matchId) return;
      const outcomes = msg.outcomes && typeof msg.outcomes === 'object' ? msg.outcomes : {};
      confirmHostResult(client, outcomes, msg.agree !== false);
      return;
    }

    if (t === 'leaderboard') {
      const sort = String(msg.sort || 'wins');
      const friendIds = Array.isArray(msg.friendIds)
        ? msg.friendIds.map((id) => sanitizePlayerId(id)).filter(Boolean)
        : null;
      ws.send(
        JSON.stringify({
          t: 'leaderboard',
          sort,
          scope: friendIds && friendIds.length ? 'friends' : 'global',
          rows: buildLeaderboardRows(sort, friendIds),
        }),
      );
      return;
    }

    if (t === 'friend_remove') {
      const targetId = sanitizePlayerId(msg.targetPlayerId);
      const fromId = client.playerId;
      if (!fromId || !targetId) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Invalid friend remove request' }));
        return;
      }
      const entry = {
        fromPlayerId: fromId,
        fromName: client.displayName || 'Player',
        at: Date.now(),
      };
      const target = onlineByPlayerId.get(targetId);
      const delivered = target ? sendFriendRemovedNotice(target, entry) : false;
      if (!delivered) queueFriendRemoval(targetId, entry);
      ws.send(JSON.stringify({ t: 'friend_remove_ack', targetPlayerId: targetId }));
      return;
    }

    if (t === 'friend_request') {
      const targetId = sanitizePlayerId(msg.targetPlayerId);
      const fromId = client.playerId;
      if (!fromId) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Register your profile before sending friend requests' }));
        return;
      }
      if (!targetId || targetId === fromId) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Invalid friend ID' }));
        return;
      }
      const reqKey = `${fromId}:${targetId}`;
      if (cooldownBlocked(friendRequestCooldown, reqKey, FRIEND_REQUEST_COOLDOWN_MS)) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Wait before sending another friend request to this player' }));
        return;
      }
      const fromName = client.displayName || 'Player';
      const unitSkin = client.unitSkin || 'nato';
      if (!profiles.recordFriendRequest(fromId, fromName, unitSkin, targetId)) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Could not send friend request (already friends or pending).' }));
        return;
      }
      markCooldown(friendRequestCooldown, reqKey);
      const entry = {
        fromPlayerId: fromId,
        fromName,
        unitSkin,
        at: Date.now(),
      };
      const target = onlineByPlayerId.get(targetId);
      const delivered = target ? sendFriendRequestNotice(target, entry) : false;
      if (!delivered) queueFriendRequest(targetId, entry);
      ws.send(JSON.stringify({ t: 'friend_request_sent', targetPlayerId: targetId, persisted: true }));
      return;
    }

    if (t === 'friend_request_reply') {
      const fromId = sanitizePlayerId(msg.fromPlayerId);
      const toId = client.playerId;
      if (!fromId || !toId) return;
      const accept = !!msg.accept;
      profiles.applyFriendRequestReply(fromId, toId, accept, client.displayName, client.unitSkin);
      const requester = onlineByPlayerId.get(fromId);
      if (requester && requester.ws.readyState === 1) {
        try {
          requester.ws.send(
            JSON.stringify({
              t: 'friend_request_reply',
              fromPlayerId: toId,
              fromName: client.displayName || 'Player',
              unitSkin: client.unitSkin || 'nato',
              accept,
            }),
          );
        } catch (_) {}
        if (accept) {
          try {
            requester.ws.send(JSON.stringify({ t: 'profile', profile: profiles.exportProfile(fromId) }));
          } catch (_) {}
        }
      }
      try {
        ws.send(JSON.stringify({ t: 'profile', profile: profiles.exportProfile(toId) }));
      } catch (_) {}
      return;
    }

    if (t === 'friend_presence') {
      const ids = Array.isArray(msg.friendIds) ? msg.friendIds.slice(0, 100) : [];
      const online = [];
      for (const rawId of ids) {
        const pid = sanitizePlayerId(rawId);
        if (!pid) continue;
        const peer = onlineByPlayerId.get(pid);
        if (!peer || peer.ws.readyState !== 1) continue;
        online.push({
          playerId: pid,
          displayName: peer.displayName || '',
          unitSkin: peer.unitSkin || 'nato',
          inLobby: !!(peer.room && !peer.room.matchStarted),
          lobbyId: peer.room ? peer.room.id : null,
        });
      }
      ws.send(JSON.stringify({ t: 'friend_presence', online }));
      return;
    }

    if (t === 'friend_invite') {
      const targetId = sanitizePlayerId(msg.targetPlayerId);
      if (!targetId) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Invalid friend ID' }));
        return;
      }
      if (!client.playerId) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Register your profile before inviting friends' }));
        return;
      }
      if (!client.room || client.room.matchStarted) {
        ws.send(JSON.stringify({ t: 'error', msg: 'You must be in a lobby to invite friends' }));
        return;
      }
      if (!client.isHost) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Only the host can invite friends to seats' }));
        return;
      }
      const target = onlineByPlayerId.get(targetId);
      if (!target || target.ws.readyState !== 1) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Friend is offline — they must have the game open' }));
        return;
      }
      if (target.room && !target.room.matchStarted && target.room.id === client.room.id) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Friend is already in this lobby' }));
        return;
      }
      const inviteKey = `${client.playerId}:${targetId}`;
      if (cooldownBlocked(lobbyInviteCooldown, inviteKey, LOBBY_INVITE_COOLDOWN_MS)) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Wait before inviting this friend again' }));
        return;
      }
      const dedupeKey = `${targetId}:${client.room.id}`;
      if (cooldownBlocked(recentLobbyInvites, dedupeKey, LOBBY_INVITE_DEDUPE_MS)) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Invite already sent recently' }));
        return;
      }
      const seat = parseInt(msg.seat, 10) || 0;
      markCooldown(lobbyInviteCooldown, inviteKey);
      markCooldown(recentLobbyInvites, dedupeKey);
      try {
        target.ws.send(
          JSON.stringify({
            t: 'friend_invite',
            fromPlayerId: client.playerId || '',
            fromName: client.displayName || `Player ${client.slot}`,
            lobbyId: client.room.id,
            lobbyName: client.room.name,
            locked: !!client.room.password,
            seat,
          }),
        );
      } catch (_) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Could not deliver invite' }));
        return;
      }
      ws.send(JSON.stringify({ t: 'friend_invite_sent', targetPlayerId: targetId }));
      return;
    }

    if (/^(clan|cw)_/.test(String(t || ''))) {
      const pid = client.playerId;
      if (!pid) { cwSend(client, { t: 'clan_error', msg: 'Connect your multiplayer profile first.' }); return; }
      const refuse = (m) => cwSend(client, { t: 'clan_error', msg: m });
      if (t === 'clan_mine') { cwSend(client, clanInfoFor(client, clans.clanOf(pid))); return; }
      if (t === 'clan_get') { cwSend(client, clanInfoFor(client, clans.get(String(msg.clanId || '')), { view: true })); return; }
      if (t === 'clan_list') { cwSend(client, { t: 'clan_list', browse: !!msg.browse, query: String(msg.query || '').slice(0, 40), ...clans.list(msg.query, pid, { page: msg.page, filter: msg.filter, sort: msg.sort, pageSize: msg.pageSize }), emblems: [...clans.EMBLEM_IDS] }); return; }
      if (t === 'clan_leaderboard') { cwSend(client, { t: 'clan_leaderboard', ...clans.leaderboard(String(msg.kind || 'war'), String(msg.sort || 'wins')) }); return; }
      if (t === 'clan_chat') {
        const r = clans.post(pid, msg.text);
        if (!r.ok) { cwSend(client, { t: 'clan_error', msg: r.msg, chat: true }); return; }
        for (const m of r.clan.members) cwSend(onlineByPlayerId.get(m.playerId), { t: 'clan_chat', clanId: r.clan.id, message: r.message });
        return;
      }
      // membership: found, join or apply (from the list or with the invite code), leave, change, remove a member
      if (['clan_create', 'clan_join', 'clan_leave', 'clan_update', 'clan_kick'].includes(t)) {
        const before = clans.clanOf(pid);
        if (t !== 'clan_update' && t !== 'clan_kick' && (cwQueuedTier(client) || client.cwWarId)) { refuse('Leave the clan war queue (or finish your war) first.'); return; }
        const r = t === 'clan_create' ? clans.create(pid, msg)
          : t === 'clan_join' ? clans.join(pid, msg)
          : t === 'clan_leave' ? clans.leave(pid)
          : t === 'clan_update' ? clans.update(pid, msg)
          : clans.kick(pid, sanitizePlayerId(msg.playerId));
        if (!r.ok) { refuse(r.msg); return; }
        if (t === 'clan_leave') cwLeaveParty(client, 'Your 2v2 party ended: you left the clan.');
        if (t === 'clan_kick') {
          const kicked = cwOnline(sanitizePlayerId(msg.playerId));
          if (kicked) { cwRemove(kicked); cwLeaveParty(kicked, 'Your 2v2 party ended.'); cwSend(kicked, clanInfoFor(kicked, null, { notice: 'You were removed from ' + r.clan.name + '.' })); }
        }
        const done = r.applied ? 'clan_apply' : t;
        cwSend(client, clanInfoFor(client, t === 'clan_leave' ? null : r.applied ? null : r.clan, { done }));
        if (r.applied) clanTell(r.clan.leaderId, r.clan, cwName(pid) + ' applied to join ' + r.clan.name + '.');
        else notifyClanMembers(t === 'clan_leave' ? before : r.clan, client);
        if (client.room && client.room.meta && client.room.meta.playerPublic && client.room.meta.playerPublic[String(client.slot)]) {
          client.room.meta.playerPublic[String(client.slot)].clan = clans.summary(clans.clanOf(pid));
          broadcastAll(client.room, { t: 'room_meta', meta: metaWire(client.room) });
        }
        cwBroadcastStatus();
        return;
      }
      if (t === 'clan_app_cancel') {
        const r = clans.cancelApplication(pid, msg.clanId);
        if (!r.ok) { refuse(r.msg); return; }
        cwSend(client, clanInfoFor(client, null, { done: t }));
        clanTell(r.clan.leaderId, r.clan);
        return;
      }
      if (t === 'clan_app_answer') {
        const applicant = sanitizePlayerId(msg.playerId);
        const r = clans.answerApplication(pid, applicant, !!msg.approve);
        if (!r.ok) { refuse(r.msg); cwSend(client, clanInfoFor(client, clans.clanOf(pid))); return; }
        cwSend(client, clanInfoFor(client, r.clan, { done: msg.approve ? 'clan_approve' : 'clan_decline' }));
        if (r.approved) { notifyClanMembers(r.clan, client); clanTell(applicant, r.clan, 'Your application was approved: welcome to ' + r.clan.name + '!'); }
        else clanTell(applicant, null, r.clan.name + ' declined your application.');
        return;
      }
      if (t === 'clan_invite') {
        const friend = sanitizePlayerId(msg.playerId);
        const r = clans.inviteFriend(pid, friend, (id) => profiles.getAllPlayerIds().includes(id));
        if (!r.ok) { refuse(r.msg); return; }
        cwSend(client, clanInfoFor(client, r.clan, { done: t }));
        clanTell(friend, null, cwName(pid) + ' invited you to join ' + r.clan.name + '. Open the Clan tab to answer.');
        return;
      }
      if (t === 'clan_invite_answer') {
        if (msg.accept && (cwQueuedTier(client) || client.cwWarId)) { refuse('Leave the clan war queue (or finish your war) first.'); return; }
        const r = clans.answerInvite(pid, msg.clanId, !!msg.accept);
        if (!r.ok) { refuse(r.msg); cwSend(client, clanInfoFor(client, clans.clanOf(pid))); return; }
        cwSend(client, clanInfoFor(client, r.joined ? r.clan : clans.clanOf(pid), { done: r.joined ? 'clan_join' : r.applied ? 'clan_apply' : 'clan_invite_declined' }));
        if (r.joined) notifyClanMembers(r.clan, client);
        else if (r.applied) clanTell(r.clan.leaderId, r.clan, cwName(pid) + ' accepted an invitation and is waiting for your approval.');
        else notifyClanMembers(r.clan);
        return;
      }
      // clan wars: status, 2v2 parties, queues
      if (t === 'cw_status') { client.cwWatch = msg.watch !== false; cwSend(client, cwStatusFor(client)); return; }
      if (t === 'cw_party_invite') { const why = cwPartyInvite(client, sanitizePlayerId(msg.playerId)); if (why) cwSend(client, { t: 'cw_error', msg: why }); return; }
      if (t === 'cw_party_answer') { const why = cwPartyAnswer(client, sanitizePlayerId(msg.from), !!msg.accept); if (why) cwSend(client, { t: 'cw_error', msg: why }); return; }
      if (t === 'cw_party_leave') { cwLeaveParty(client, cwName(pid) + ' left the party.'); return; }
      if (t === 'cw_queue') {
        const tier = String(msg.tier || '');
        const clan = clans.clanOf(pid), party = cwPartyOf(client);
        const why = !clans.TIERS.includes(tier) ? 'Pick 1v1 or 2v2.' : !clan ? 'Join or found a clan to fight clan wars.' : client.room ? 'Leave your lobby before queueing for a clan war.' : client.cwWarId ? 'You are already in a clan war.'
          : tier === '1v1' && party ? 'You are in a 2v2 party: leave it to fight 1v1.'
          : tier === '2v2' && (!party || party.members.length !== 2) ? 'Invite a clanmate to a party first: 2v2 is fought as a party of two.'
          : tier === '2v2' && !party.members.every(cwOnline) ? 'Your teammate is not online.'
          : tier === '2v2' && party.members.some((m) => { const c = cwOnline(m); return c && (c.room || c.cwWarId); }) ? 'Your teammate is busy in a game.' : '';
        if (why) { cwSend(client, { t: 'cw_error', msg: why }); return; }
        if (tier === '2v2') {
          for (const m of party.members) { const c = cwOnline(m); if (c) { cwRemove(c); c.cwWatch = true; } }
          cwQueues['2v2'].push({ party, clanId: party.clanId, since: Date.now(), startedBy: pid });
        } else {
          cwRemove(client);
          cwQueues['1v1'].push({ client, playerId: pid, clanId: clan.id, since: Date.now() });
        }
        client.cwWatch = true;
        while (cwTryMatch(tier));
        cwBroadcastStatus();
        if (party) cwStatusTo(...party.members);
        return;
      }
      if (t === 'cw_leave_queue') { cwRemove(client); const party = cwPartyOf(client); cwBroadcastStatus(); if (party) cwStatusTo(...party.members); return; }
      if (t === 'cw_decline') {
        const war = client.cwWarId && client.cwWarId === String(msg.warId || '') ? cwWars.get(client.cwWarId) : null;
        if (war) cwCancel(war, (client.displayName || 'A player') + ' is in another game, so the war was called off. You can queue again.');
        return;
      }
      return;
    }

    if (t === 'list_lobbies') {
      ws.send(
        JSON.stringify({
          t: 'lobby_list',
          lobbies: getLobbyListPublic(),
          online: countOnline(),
        }),
      );
      return;
    }

    if (t === 'create_lobby') {
      if (!client.displayName || !client.playerId) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Set a unique display name in your profile before hosting.' }));
        return;
      }
      leaveRoom(client);
      let id = genLobbyId();
      while (rooms.has(id)) id = genLobbyId();
      const name = String((msg.name || 'Game').trim()).slice(0, 40) || 'Game';
      const password = msg.password ? String(msg.password).slice(0, 80) : null;
      const room = {
        id,
        name,
        password: password || null,
        meta: {
          mapSize: 60,
          mapShape: 'island',
          aiCount: 1,
          victoryMode: 'domination',
          money: 1000,
          maxHumans: MAX_PLAYERS,
          playerColors: {},
          playerPublic: {},
          mapSizeLabel: 'Medium',
          mapShapeLabel: 'Island',
          victoryLabel: 'Domination',
          ...(typeof msg.meta === 'object' && msg.meta ? msg.meta : {}),
        },
        clients: [],
        host: null,
        matchStarted: false,
        lobbyPreview: null,
      };
      rooms.set(id, room);
      const cwWar = msg.cwWarId ? cwWars.get(String(msg.cwWarId)) : null;
      if (msg.cwWarId && (!cwWar || cwWar.room || cwWar.cancelled || cwWar.hostPlayerId !== client.playerId)) {
        rooms.delete(id);
        ws.send(JSON.stringify({ t: 'error', msg: 'That clan war is no longer waiting for its lobby.' }));
        return;
      }
      if (!cwWar) cwRemove(client);
      addClientToRoom(client, room);
      if (cwWar) {
        room.clanWar = cwWar;
        cwWar.room = room;
        room.password = cwWar.secret;
        room.meta.seatTypes = cwSeatTypes(cwWar);
        room.meta.aiCount = 0;
        room.meta.cw = cwPublic(cwWar);
        room.name = 'Clan war · ' + cwWar.sides.map((s) => s.clan ? s.clan.name : 'Clan').join(' vs ');
        for (const p of cwWar.players) {
          if (p.playerId === client.playerId) continue;
          cwSend(onlineByPlayerId.get(p.playerId), { t: 'cw_join', warId: cwWar.id, code: room.id, password: cwWar.secret, seat: p.slot });
        }
      }
      ws.send(
        JSON.stringify({
          t: 'joined',
          code: room.id,
          slot: client.slot,
          isHost: true,
          max: MAX_PLAYERS,
          lobbyName: room.name,
          players: room.clients.length,
          meta: metaWire(room),
        }),
      );
      broadcastAll(room, { t: 'peer_joined', slot: client.slot, count: room.clients.length });
      broadcastAll(room, { t: 'room_meta', meta: metaWire(room) });
      broadcastLobbyList();
      return;
    }

    if (t === 'join_lobby') {
      const id = String(msg.id || '').trim();
      const room = rooms.get(id);
      if (!room) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Lobby not found' }));
        return;
      }
      if(!client.playerId||sanitizePlayerId(msg.playerId||client.playerId)!==client.playerId){ws.send(JSON.stringify({t:'error',msg:'Register your own profile before joining.'}));return;}
      if(room.clients.some(c=>c!==client&&c.playerId===client.playerId)){ws.send(JSON.stringify({t:'error',msg:'Your profile is already in this game.'}));return;}
      const pw = String(msg.password || '');
      const knownSlot=room.seatByPlayerId?.[client.playerId];
      const knownSeat=room.matchStarted&&client.playerId===sanitizePlayerId(msg.playerId||client.playerId)&&knownSlot&&(!room.forfeitedSlots?.has(knownSlot)||room.observerSlots?.has(knownSlot));
      if (room.password && pw !== room.password&&!knownSeat) {
        ws.send(JSON.stringify({t:'error',reason:pw?'wrong_password':'password_required',msg:pw?'Wrong password':'Password required'}));
        return;
      }
      const joinPlayerId = sanitizePlayerId(msg.playerId || client.playerId);

      if (room.matchStarted) {
        if (!joinPlayerId || !room.seatByPlayerId) {
          ws.send(JSON.stringify({ t: 'error', msg: 'Match in progress — rejoin with the same player account.' }));
          return;
        }
        const rejoinSlot = room.seatByPlayerId[joinPlayerId];
        const inGrace = !!(room.pendingReconnect && room.pendingReconnect.has(rejoinSlot));
        const inDisc = !!(room.disconnectedSlots && room.disconnectedSlots.has(rejoinSlot));
        if (!rejoinSlot || (room.forfeitedSlots?.has(rejoinSlot)&&!room.observerSlots?.has(rejoinSlot)) || (!inGrace && !inDisc)) {
          ws.send(
            JSON.stringify({
              t: 'error',
              msg: 'Match in progress — only disconnected players from this match can rejoin.',
            }),
          );
          return;
        }
        leaveRoom(client);
        cancelMatchReconnectGrace(room, rejoinSlot);
        if (room.disconnectedSlots) room.disconnectedSlots.delete(rejoinSlot);
        client.room = room;
        client.slot = rejoinSlot;
        client.spectating=!!room.observerSlots?.has(rejoinSlot);
        room.clients.push(client);
        patchRoomSnapConnectedSlots(room);
        const hostLive = room.clients.some((c) => c.isHost && c.ws.readyState === 1);
        if (!hostLive) {
          room.host = client;
          client.isHost = true;
          for (const c of room.clients) c.isHost = c === client;
          try {
            client.ws.send(JSON.stringify({ t: 'host_migrated', slot: client.slot, isHost: true }));
          } catch (_) {}
        } else {
          client.isHost = room.host === client;
        }
        ws.send(
          JSON.stringify({
            t: 'rejoin_match',
            code: room.id,
            slot: client.slot,
            isHost: client.isHost,
            spectating: client.spectating,
            payload: room.matchInitPayload || null,
            snap: room.lastSnap || null,
            lobbyName: room.name,
          }),
        );
        broadcastAll(room, {
          t: 'player_reconnected',
          slot: rejoinSlot,
          count: room.clients.length,
        });
        return;
      }

      // Fresh (non-rejoin) joins require a registered, unique display name — enforced
      // server-side so no client build can slip in as an anonymous duplicate "Player N".
      if (!client.displayName || !client.playerId) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Set a unique display name in your profile before joining.' }));
        return;
      }
      normalizeSeatTypes(room.meta);
      if (!openSeatForJoiner(room)) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Lobby full' }));
        return;
      }
      let reqSeat = parseInt(msg.seat, 10) || 0;
      if (room.clanWar) {
        const seat = room.clanWar.players.find((p) => p.playerId === client.playerId);
        if (!seat) { ws.send(JSON.stringify({ t: 'error', msg: 'This lobby is a clan war between two clans.' })); return; }
        reqSeat = seat.slot;
      } else cwRemove(client);
      leaveRoom(client);
      addClientToRoom(client, room, reqSeat);
      ws.send(
        JSON.stringify({
          t: 'joined',
          code: room.id,
          slot: client.slot,
          isHost: client.isHost,
          max: MAX_PLAYERS,
          lobbyName: room.name,
          players: room.clients.length,
          meta: metaWire(room),
        }),
      );
      if (room.lobbyPreview && room.lobbyPreview.payload) {
        try {
          ws.send(
            JSON.stringify({
              t: 'lobby_preview',
              fp: room.lobbyPreview.fp || '',
              payload: room.lobbyPreview.payload,
            }),
          );
        } catch (_) {}
      }
      broadcastAll(room, { t: 'peer_joined', slot: client.slot, count: room.clients.length });
      broadcastAll(room, { t: 'room_meta', meta: metaWire(room) });
      broadcastLobbyList();
      return;
    }

    if (t === 'lobby_meta') {
      if (!client.room || !client.isHost || client.room.matchStarted) return;
      const m = msg.meta && typeof msg.meta === 'object' ? { ...msg.meta } : null;
      if (m) {
        delete m.occupiedSlots;
        const prevPc = (client.room.meta && client.room.meta.playerColors) || {};
        const prevPub = (client.room.meta && client.room.meta.playerPublic) || {};
        const trial = { ...client.room.meta, ...m };
        normalizeSeatTypes(trial);
        const bad = assertMetaCompatibleWithRoom(client.room, trial);
        if (bad) {
          try {
            ws.send(JSON.stringify({ t: 'error', msg: bad }));
          } catch (_) {}
          return;
        }
        client.room.meta = trial;
        if (client.room.clanWar) {
          client.room.meta.seatTypes = cwSeatTypes(client.room.clanWar);
          client.room.meta.aiCount = 0;
          client.room.meta.cw = cwPublic(client.room.clanWar);
        }
        if (!client.room.meta.playerColors || typeof client.room.meta.playerColors !== 'object')
          client.room.meta.playerColors = {};
        Object.assign(client.room.meta.playerColors, prevPc);
        if (!client.room.meta.playerPublic || typeof client.room.meta.playerPublic !== 'object')
          client.room.meta.playerPublic = {};
        Object.assign(client.room.meta.playerPublic, prevPub);
        normalizeSeatTypes(client.room.meta);
      }
      broadcastAll(client.room, { t: 'room_meta', meta: metaWire(client.room) });
      broadcastLobbyList();
      return;
    }

    if (t === 'lobby_preview') {
      if (!client.room || !client.isHost || client.room.matchStarted) return;
      const payload = msg.payload;
      if (!payload || typeof payload !== 'object' || !Array.isArray(payload.hexList) || !payload.hexList.length)
        return;
      const fp = String(msg.fp || '');
      client.room.lobbyPreview = { fp, payload };
      broadcastAll(client.room, { t: 'lobby_preview', fp, payload });
      return;
    }

    if (t === 'kick_player') {
      if (!client.room || !client.isHost || client.room.matchStarted) return;
      const target = parseInt(msg.slot, 10) || 0;
      if (target <= 0 || target === client.slot) return;
      const victim = client.room.clients.find((c) => c.slot === target);
      if (!victim) return;
      if (client.room.matchStarted) {
        const pid = sanitizePlayerId(victim.playerId);
        if (pid && client.room.seatByPlayerId) delete client.room.seatByPlayerId[pid];
        if (client.room.disconnectedSlots) client.room.disconnectedSlots.delete(target);
      }
      try {
        if (victim.ws.readyState === 1)
          victim.ws.send(JSON.stringify({ t: 'kicked', msg: msg.reason || 'Removed by host' }));
      } catch (_) {}
      try {
        victim.ws.close();
      } catch (_) {}
      return;
    }

    if (t === 'lobby_color') {
      if (!client.room || client.room.matchStarted) return;
      const slot = parseInt(msg.slot, 10) || 0;
      const cap = lobbyCap();
      if (slot < 1 || slot > cap) return;
      if (!client.isHost && slot !== client.slot) return;
      const hex = String(msg.color || '').trim();
      if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
      if (!client.room.meta.playerColors || typeof client.room.meta.playerColors !== 'object')
        client.room.meta.playerColors = {};
      const taken = lobbyActiveSeats(client.room).some((other) => {
        if (other === slot) return false;
        return slotEffectiveColor(client.room, other) === hex.toLowerCase();
      });
      if (taken) {
        try {
          ws.send(JSON.stringify({ t: 'error', msg: 'Color already taken' }));
        } catch (_) {}
        return;
      }
      client.room.meta.playerColors[String(slot)] = hex;
      broadcastAll(client.room, { t: 'room_meta', meta: metaWire(client.room) });
      broadcastLobbyList();
      return;
    }

    if (t === 'lobby_profile') {
      if (!client.room || client.room.matchStarted) return;
      const rawName = msg.displayName != null ? String(msg.displayName) : '';
      const playerId = sanitizePlayerId(msg.playerId != null ? msg.playerId : client.playerId);
      if(!client.identityKey||playerId!==client.playerId){ws.send(JSON.stringify({t:'profile_failed',msg:'Lobby updates must use your registered profile.'}));return;}
      let displayName = client.displayName || `Player ${client.slot}`;
      if (rawName.trim()) {
        const nameCheck = playerId
          ? validateDisplayNameForPlayer(rawName, playerId)
          : validateDisplayNameForPlayer(rawName, '');
        if (!nameCheck.ok) {
          ws.send(JSON.stringify({ t: 'profile_failed', reason: nameCheck.reason, msg: nameCheck.msg }));
          return;
        }
        displayName = nameCheck.name;
      }
      client.displayName = displayName;
      if (playerId) {
        const result = registerClientPlayer(client, {
          playerId,
          displayName,
          unitSkin: msg.unitSkin != null ? msg.unitSkin : client.unitSkin,
        });
        if (!result.ok) {
          ws.send(JSON.stringify({ t: 'profile_failed', reason: result.reason, msg: result.msg }));
          return;
        }
      } else updateLeaderboardEntry(client, client.combinedStats);
      const mpStats = client.mpStats || sanitizeMpStats(msg.mpStats);
      const combinedStats = client.combinedStats || sanitizeCombinedStats(msg.combinedStats);
      const unitSkin = client.unitSkin || sanitizeUnitSkin(msg.unitSkin);
      if (!client.room.meta.playerPublic || typeof client.room.meta.playerPublic !== 'object')
        client.room.meta.playerPublic = {};
      client.room.meta.playerPublic[String(client.slot)] = {
        displayName,
        mpStats,
        unitSkin,
        playerId: playerId || client.playerId || '',
        combinedStats,
        clan: clans.summary(clans.clanOf(client.playerId)),
      };
      broadcastAll(client.room, { t: 'room_meta', meta: metaWire(client.room) });
      broadcastLobbyList();
      return;
    }

    if(t==='forfeit'){if(client.room?.matchStarted)await forfeitClientFromMatch(client,!!msg.spectate,!!msg.surrender);else leaveRoom(client);if(!msg.spectate)ws.send(JSON.stringify({t:'left'}));return;}
    if (t === 'leave') {
      if (client.room && client.room.matchStarted) await forfeitClientFromMatch(client);
      else leaveRoom(client);
      try {
        ws.send(JSON.stringify({ t: 'left' }));
      } catch (_) {}
      return;
    }

    if (t === 'ping') {
      client.lastPingAt = Date.now();
      try {
        ws.send(JSON.stringify({ t: 'pong', ts: msg.ts || 0 }));
      } catch (_) {}
      return;
    }

    if (!client.room) return;

    if (t === 'start' && client.isHost) {
      for(const peer of client.room.clients)peer.spectating=false;
      client.room.matchStarted = true;
      client.room.lobbyPreview = null;
      client.room._matchEndRecorded = false;
      client.room.pendingReconnect = new Map();
      client.room.matchId=require('crypto').randomUUID();client.room.forfeitedSlots=new Set();client.room.surrenderedSlots=new Set();client.room.observerSlots=new Set();
      const payload = {...msg.payload,serverMatchId:client.room.matchId};
      client.room.matchInitPayload = payload;
      client.room.lastSnap = null;
      client.room.hostPlayerId = sanitizePlayerId(client.playerId);
      captureMatchSeatPlayers(client.room);
      if (client.room.clanWar) { clearTimeout(client.room.clanWar.timer); setImmediate(cwBroadcastStatus); }
      broadcastAll(client.room, { t: 'match_start', payload, fromSlot: client.slot });
      broadcastLobbyList();
      return;
    }
    if (t === 'ready' && client.room && client.room.matchStarted) {
      if (client.room.host && client.room.host.ws.readyState === 1) {
        client.room.host.ws.send(JSON.stringify({ t: 'player_ready', slot: client.slot }));
      }
      return;
    }
    if (t === 'match_go' && client.isHost && client.room && client.room.matchStarted) {
      broadcastAll(client.room, { t: 'match_go' });
      return;
    }
    if (t === 'snap' && client.isHost) {
      // Live clients retain fields omitted by the host's lightweight snapshots.
      // Rejoins and host transfers need the same complete state from the relay.
      const cached = msg.payload && typeof msg.payload === 'object' && !Array.isArray(msg.payload)
        ? { ...msg.payload } : msg.payload;
      const previous = client.room.lastSnap?.payload;
      if (cached && previous) {
        for (const field of ['hexOwners', 'battleLedger', 'lifetimeStatsByOwner']) {
          if (cached[field] === undefined && previous[field] !== undefined) cached[field] = previous[field];
        }
      }
      // Snapshots are numbered here, not by whichever player hosts: a new host started again from one, and every
      // other player's game dropped its snapshots as older than the last one seen and stood still.
      const room = client.room, seq = room.snapSeq = (room.snapSeq | 0) + 1;
      room.lastSnap = { payload: cached, seq };
      // A player on a slow connection is not sent snapshots faster than the line drains: each one would queue behind
      // the last, the game falling further and further behind (and the map, sent at the start, behind them all). One
      // whose socket still holds more than MP_SNAP_BACKLOG_BYTES is skipped; when it has drained it is sent the full
      // latest state (cached, with the territory and ledgers a lightweight snapshot leaves out).
      // (Never skipped: a snapshot that ends the match, or ends it for some players. The host may send nothing after
      // it, so a player who missed it was never told the match was over and his game ran on.)
      const endsMatch = !!(cached && cached.matchEnd);
      let raw = null, full = null;
      for (const c of room.clients) {
        if (c.ws === ws || c.ws.readyState !== 1) continue;
        if (!endsMatch && (c.ws.bufferedAmount | 0) > MP_SNAP_BACKLOG_BYTES) { c.snapBehind = true; continue; }
        if (c.snapBehind) { c.snapBehind = false; c.ws.send(full || (full = JSON.stringify({ t: 'snap', payload: cached, seq }))); continue; }
        c.ws.send(raw || (raw = JSON.stringify({ t: 'snap', payload: msg.payload, seq })));
      }
      return;
    }
    if (t === 'cmd' && !client.isHost) {
      if(client.spectating||client.room.forfeitedSlots?.has(client.slot))return;
      if (msg.fromSlot !== client.slot) return;
      if (client.room.host && client.room.host.ws.readyState === 1) {
        client.room.host.ws.send(JSON.stringify({ t: 'cmd', fromSlot: client.slot, cmd: msg.cmd }));
      }
      return;
    }
    if (t === 'cmd' && client.isHost) {
      if(client.spectating||client.room.forfeitedSlots?.has(client.slot))return;
      broadcast(client.room, { t: 'cmd', fromSlot: client.slot, cmd: msg.cmd }, ws);
      return;
    }
  }

  ws.on('close', () => {
    if (client.playerId) { cwPartyInvites.delete(client.playerId); for (const [to, i] of [...cwPartyInvites]) if (i.from === client.playerId) cwPartyInvites.delete(to); }
    cwLeaveParty(client, (client.displayName || 'Your teammate') + ' disconnected, so the party ended.');
    if (cwRemove(client)) cwBroadcastStatus();
    if (client.cwWarId && cwWars.has(client.cwWarId) && !(client.room && client.room.matchStarted)) cwCancel(cwWars.get(client.cwWarId), (client.displayName || 'A player') + ' disconnected, so the war was called off. You can queue again.');
    if (client.room && client.room.matchStarted) scheduleMatchSocketClose(client);
    else leaveRoom(client);
    unregisterClientPlayer(client);
    broadcastLobbyList();
  });
});

setInterval(() => {
  const now = Date.now();
  wss.clients.forEach((ws) => {
    const client = ws._wodClient;
    if (!client || ws.readyState !== 1) return;
    const last = client.lastPingAt || 0;
    if (last && now - last > MP_STALE_CONNECTION_MS) {
      try {
        ws.close();
      } catch (_) {}
    }
  });
  cleanupEmptyMultiplayerRooms();
  broadcastLobbyList();
}, 15000);

loadLeaderboardFromDisk();
loadFriendRemovalsFromDisk();
loadFriendRequestsFromDisk();
profiles.initialize().then(()=>clans.init()).then(()=>{
  hydrateLeaderboardFromProfiles();scheduleLeaderboardSave();
  server.listen(PORT,()=>console.log(`simple-wars-mp listening on ${PORT} (max ${MAX_PLAYERS} players / room)`));
}).catch(()=>{console.error('[profiles] durable storage unavailable; refusing to start with empty profiles');process.exitCode=1;});
let closing=false;async function shutdown(){if(closing)return;closing=true;try{await clans.flush();}catch(_){}server.close();for(const ws of wss.clients)ws.close();try{await profiles.close();await commerceHttp.close();}finally{process.exit(0);}}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
