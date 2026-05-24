/**
 * Simple Wars — multiplayer relay
 * Host-authoritative: host runs full sim; server forwards snapshots & player commands.
 * Lobby browser: list open games, optional password, online count.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.PORT || '8080', 10);
const MAX_PLAYERS = 4;
const MAX_INIT_BYTES = 48 * 1024 * 1024;
const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard.json');
const FRIEND_REMOVALS_FILE = path.join(__dirname, 'friend-removals.json');
const PROGRESS_FILE = path.join(__dirname, 'player-progress.json');
const LEADERBOARD_SAVE_DEBOUNCE_MS = 2000;
const FRIEND_REMOVALS_SAVE_DEBOUNCE_MS = 2000;
const PROGRESS_SAVE_DEBOUNCE_MS = 2000;
const MAX_PROGRESS_BYTES = 512 * 1024;

const rooms = new Map();
/** @type {Map<string, object>} */
const onlineByPlayerId = new Map();
/** @type {Map<string, object>} */
const leaderboard = new Map();
/** @type {Map<string, object[]>} */
const pendingFriendRemovals = new Map();
/** @type {Map<string, object>} */
const playerProgress = new Map();
let leaderboardSaveTimer = null;
let friendRemovalsSaveTimer = null;
let progressSaveTimer = null;
const friendRequestCooldown = new Map();
const lobbyInviteCooldown = new Map();
const recentLobbyInvites = new Map();
const FRIEND_REQUEST_COOLDOWN_MS = 30000;
const LOBBY_INVITE_COOLDOWN_MS = 45000;
const LOBBY_INVITE_DEDUPE_MS = 60000;

function sanitizePlayerId(id) {
  const s = String(id || '').trim().slice(0, 32);
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
  const key = ['wins', 'kills', 'losses', 'defeats', 'gamesPlayed'].includes(sortKey)
    ? sortKey
    : 'wins';
  let rows = [...leaderboard.values()].filter((r) => r && r.playerId);
  if (Array.isArray(filterIds) && filterIds.length) {
    const set = new Set(filterIds);
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
      online: onlineByPlayerId.has(r.playerId),
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

const ACHIEVEMENT_KEYS = [
  'goldenChipMaster',
  'periodNapoleonic',
  'periodAncient',
  'periodMedieval',
  'campaignComplete',
  'campaignLevel1',
  'campaignLevel2',
  'campaignLevel3',
  'campaignLevel4',
  'campaignLevel5',
  'campaignLevel6',
  'campaignLevel7',
  'campaignLevel8',
  'campaignLevel9',
  'campaignLevel10',
];

const LIFETIME_KEYS = [
  'enemyTroopKills',
  'ownTroopLosses',
  'enemyMarineKills',
  'ownMarineLosses',
  'enemyTankKills',
  'ownTankLosses',
  'enemyShipKills',
  'ownShipLosses',
  'peakFieldManpower',
  'battlesWon',
  'campaignLosses',
  'citiesCaptured',
  'convoysCaptured',
  'factoriesBuilt',
  'harborsBuilt',
  'fortsBuilt',
  'peakMoneyHeld',
  'unitsBuiltLight',
  'unitsBuiltHeavy',
  'unitsBuiltShip',
  'unitsBuiltMarine',
  'gamesStarted',
];

function clampProgressInt(v, max = 999999999) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, n));
}

function sanitizeOwnedMap(obj, maxKeys = 64) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  let n = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (n >= maxKeys) break;
    const key = String(k || '').trim().slice(0, 32);
    if (!key) continue;
    out[key] = !!v;
    n++;
  }
  return out;
}

function sanitizeFriendRow(row) {
  if (!row || typeof row !== 'object') return null;
  const playerId = sanitizePlayerId(row.playerId);
  if (!playerId) return null;
  return {
    playerId,
    displayName: sanitizeDisplayName(row.displayName),
    unitSkin: sanitizeUnitSkin(row.unitSkin),
    addedAt: Math.max(0, parseInt(row.addedAt, 10) || 0),
  };
}

function sanitizeFriendRequestRow(row) {
  if (!row || typeof row !== 'object') return null;
  const playerId = sanitizePlayerId(row.playerId);
  if (!playerId) return null;
  return {
    playerId,
    sentAt: Math.max(0, parseInt(row.sentAt, 10) || 0),
  };
}

function sanitizeAchievements(obj) {
  const out = {};
  for (const k of ACHIEVEMENT_KEYS) out[k] = !!(obj && obj[k]);
  return out;
}

function sanitizeLifetime(obj) {
  const out = {};
  for (const k of LIFETIME_KEYS) out[k] = clampProgressInt(obj && obj[k]);
  return out;
}

function sanitizeCampaign(obj) {
  const base = { unlockedMax: 1, completed: {} };
  if (!obj || typeof obj !== 'object') return base;
  let unlockedMax = clampProgressInt(obj.unlockedMax, 11);
  if (unlockedMax < 1) unlockedMax = 1;
  const completed = {};
  if (obj.completed && typeof obj.completed === 'object') {
    for (const [k, v] of Object.entries(obj.completed)) {
      if (!/^level\d+$/.test(String(k))) continue;
      if (v) completed[k] = true;
    }
  }
  return { unlockedMax, completed };
}

function sanitizeProfile(obj, playerId) {
  const friends = [];
  if (obj && Array.isArray(obj.friends)) {
    for (const row of obj.friends.slice(0, 200)) {
      const fr = sanitizeFriendRow(row);
      if (fr) friends.push(fr);
    }
  }
  const friendRequestsOut = [];
  const friendRequestsIn = [];
  if (obj && Array.isArray(obj.friendRequestsOut)) {
    for (const row of obj.friendRequestsOut.slice(0, 100)) {
      const fr = sanitizeFriendRequestRow(row);
      if (fr) friendRequestsOut.push(fr);
    }
  }
  if (obj && Array.isArray(obj.friendRequestsIn)) {
    for (const row of obj.friendRequestsIn.slice(0, 100)) {
      const fr = sanitizeFriendRequestRow(row);
      if (fr) friendRequestsIn.push(fr);
    }
  }
  const equippedShopMapId = obj && obj.equippedShopMapId != null ? String(obj.equippedShopMapId).slice(0, 64) : null;
  return {
    gold: clampProgressInt(obj && obj.gold, 999999999),
    unitSkin: sanitizeUnitSkin(obj && obj.unitSkin),
    aiUnitSkin: sanitizeUnitSkin(obj && obj.aiUnitSkin),
    ownedUnitSkins: Object.assign({ nato: true }, sanitizeOwnedMap(obj && obj.ownedUnitSkins)),
    ownedShopVisuals: sanitizeOwnedMap(obj && obj.ownedShopVisuals),
    gamePeriod: 'modern',
    mpDisplayName: sanitizeDisplayName(obj && obj.mpDisplayName),
    playerId: playerId || sanitizePlayerId(obj && obj.playerId),
    friends,
    friendRequestsOut,
    friendRequestsIn,
    equippedShopMapId: equippedShopMapId || null,
  };
}

function sanitizeLifetimeByPeriod(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  let n = 0;
  for (const [pid, bucket] of Object.entries(obj)) {
    if (n >= 8) break;
    const key = String(pid || '').trim().slice(0, 24);
    if (!key || !bucket || typeof bucket !== 'object') continue;
    out[key] = sanitizeLifetime(bucket);
    n++;
  }
  return out;
}

function sanitizeProgressObject(raw, playerId) {
  if (!raw || typeof raw !== 'object') raw = {};
  return {
    achievements: sanitizeAchievements(raw.achievements),
    campaign: sanitizeCampaign(raw.campaign),
    lifetime: sanitizeLifetime(raw.lifetime),
    lifetimeByPeriod: sanitizeLifetimeByPeriod(raw.lifetimeByPeriod),
    profile: sanitizeProfile(raw.profile, playerId),
    multiplayer: sanitizeMpStats(raw.multiplayer) || { gamesPlayed: 0, wins: 0, losses: 0 },
  };
}

function loadProgressFromDisk() {
  try {
    if (!fs.existsSync(PROGRESS_FILE)) return;
    const raw = fs.readFileSync(PROGRESS_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return;
    for (const [id, row] of Object.entries(data)) {
      const playerId = sanitizePlayerId(id);
      if (!playerId || !row || typeof row !== 'object') continue;
      playerProgress.set(playerId, {
        playerId,
        progress: sanitizeProgressObject(row.progress, playerId),
        updatedAt: Math.max(0, parseInt(row.updatedAt, 10) || 0),
      });
    }
  } catch (err) {
    console.warn('[progress] load failed:', err.message);
  }
}

function scheduleProgressSave() {
  if (progressSaveTimer) return;
  progressSaveTimer = setTimeout(() => {
    progressSaveTimer = null;
    try {
      const data = {};
      for (const [id, row] of playerProgress) {
        data[id] = { progress: row.progress, updatedAt: row.updatedAt || 0 };
      }
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.warn('[progress] save failed:', err.message);
    }
  }, PROGRESS_SAVE_DEBOUNCE_MS);
}

function getStoredProgress(playerId) {
  return playerProgress.get(playerId) || null;
}

function saveStoredProgress(playerId, progressObj) {
  const sanitized = sanitizeProgressObject(progressObj, playerId);
  sanitized.profile.playerId = playerId;
  const row = {
    playerId,
    progress: sanitized,
    updatedAt: Date.now(),
  };
  playerProgress.set(playerId, row);
  scheduleProgressSave();
  return row;
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
  client.playerId = playerId;
  client.displayName = nameCheck.name;
  client.unitSkin = sanitizeUnitSkin(payload.unitSkin);
  client.mpStats = sanitizeMpStats(payload.mpStats);
  client.combinedStats = sanitizeCombinedStats(payload.combinedStats);
  onlineByPlayerId.set(playerId, client);
  updateLeaderboardEntry(client, client.combinedStats);
  return { ok: true, playerId };
}

function unregisterClientPlayer(client) {
  if (!client || !client.playerId) return;
  const cur = onlineByPlayerId.get(client.playerId);
  if (cur === client) onlineByPlayerId.delete(client.playerId);
  client.playerId = '';
}

function lobbyCap(room) {
  let mh = room.meta && room.meta.maxHumans != null ? parseInt(room.meta.maxHumans, 10) : MAX_PLAYERS;
  if (!Number.isFinite(mh)) mh = MAX_PLAYERS;
  return Math.min(MAX_PLAYERS, Math.max(2, mh));
}

function normalizeSeatTypes(meta) {
  if (!meta || typeof meta !== 'object') return;
  const cap = Math.min(MAX_PLAYERS, Math.max(2, parseInt(meta.maxHumans, 10) || MAX_PLAYERS));
  meta.maxHumans = cap;
  let st = Array.isArray(meta.seatTypes) ? meta.seatTypes.slice(0, cap) : [];
  while (st.length < cap) st.push('human');
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
  const cap = lobbyCap(room);
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
  const cap = lobbyCap(room);
  const taken = new Set();
  for (const c of room.clients) taken.add(c.slot);
  const st = room.meta.seatTypes;
  for (let s = 1; s <= cap; s++) {
    if ((st[s - 1] || 'human') !== 'human') continue;
    if (!taken.has(s)) return s;
  }
  return 0;
}

function assertMetaCompatibleWithRoom(room, metaTrial) {
  const cap = Math.min(MAX_PLAYERS, Math.max(2, parseInt(metaTrial.maxHumans, 10) || MAX_PLAYERS));
  let humanSeats = 0;
  for (let i = 0; i < cap; i++) {
    if ((metaTrial.seatTypes[i] || 'human') === 'human') humanSeats++;
  }
  if (humanSeats < 1) return 'At least one seat must be Human for real players';
  for (const c of room.clients) {
    if (c.slot > cap) return `Seat ${c.slot} is in use — raise max seats or remove players first`;
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
    if (room.matchStarted) continue;
    normalizeSeatTypes(room.meta);
    const cap = lobbyCap(room);
    out.push({
      id: room.id,
      name: room.name,
      players: room.clients.length,
      max: cap,
      locked: !!room.password,
      meta: metaWire(room),
    });
  }
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

function addClientToRoom(client, room) {
  client.room = room;
  normalizeSeatTypes(room.meta);
  const isFirst = room.clients.length === 0;
  const slot = firstFreeHumanSlot(room);
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
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('simple-wars-mp ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, maxPayload: MAX_INIT_BYTES });

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
  };
  ws._wodClient = client;

  try {
    ws.send(
      JSON.stringify({
        t: 'welcome',
        online: countOnline(),
        lobbies: getLobbyListPublic(),
      }),
    );
  } catch (_) {}
  broadcastLobbyList();

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    const t = msg && msg.t;

    if (t === 'register_player') {
      const result = registerClientPlayer(client, msg);
      if (!result.ok) {
        ws.send(JSON.stringify({ t: 'register_failed', reason: result.reason, msg: result.msg }));
        return;
      }
      ws.send(JSON.stringify({ t: 'registered', playerId: result.playerId }));
      flushFriendRemovalsForClient(client);
      return;
    }

    if (t === 'progress_load') {
      const playerId = sanitizePlayerId(msg.playerId);
      if (!playerId) {
        ws.send(JSON.stringify({ t: 'progress_failed', reason: 'invalid_player_id', msg: 'Invalid player ID.' }));
        return;
      }
      const row = getStoredProgress(playerId);
      ws.send(
        JSON.stringify({
          t: 'progress',
          playerId,
          found: !!row,
          progress: row ? row.progress : null,
          updatedAt: row ? row.updatedAt : 0,
        }),
      );
      return;
    }

    if (t === 'progress_save') {
      const playerId = sanitizePlayerId(msg.playerId);
      if (!playerId) {
        ws.send(JSON.stringify({ t: 'progress_save_failed', reason: 'invalid_player_id', msg: 'Invalid player ID.' }));
        return;
      }
      if (client.playerId && client.playerId !== playerId) {
        ws.send(JSON.stringify({ t: 'progress_save_failed', reason: 'player_mismatch', msg: 'Player ID mismatch.' }));
        return;
      }
      let rawSize = 0;
      try {
        rawSize = Buffer.byteLength(JSON.stringify(msg.progress || {}), 'utf8');
      } catch (_) {
        rawSize = MAX_PROGRESS_BYTES + 1;
      }
      if (rawSize > MAX_PROGRESS_BYTES) {
        ws.send(JSON.stringify({ t: 'progress_save_failed', reason: 'too_large', msg: 'Progress payload too large.' }));
        return;
      }
      const sanitized = sanitizeProgressObject(msg.progress, playerId);
      if (sanitized.profile.playerId && sanitized.profile.playerId !== playerId) {
        ws.send(JSON.stringify({ t: 'progress_save_failed', reason: 'player_mismatch', msg: 'Progress profile playerId mismatch.' }));
        return;
      }
      sanitized.profile.playerId = playerId;
      const row = saveStoredProgress(playerId, sanitized);
      ws.send(
        JSON.stringify({
          t: 'progress_saved',
          playerId,
          updatedAt: row.updatedAt,
        }),
      );
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
      const target = onlineByPlayerId.get(targetId);
      if (!target || target.ws.readyState !== 1) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Player is offline' }));
        return;
      }
      markCooldown(friendRequestCooldown, reqKey);
      try {
        target.ws.send(
          JSON.stringify({
            t: 'friend_request',
            fromPlayerId: fromId,
            fromName: client.displayName || 'Player',
            unitSkin: client.unitSkin || 'nato',
          }),
        );
      } catch (_) {}
      ws.send(JSON.stringify({ t: 'friend_request_sent', targetPlayerId: targetId }));
      return;
    }

    if (t === 'friend_request_reply') {
      const fromId = sanitizePlayerId(msg.fromPlayerId);
      const toId = client.playerId;
      if (!fromId || !toId) return;
      const requester = onlineByPlayerId.get(fromId);
      if (!requester || requester.ws.readyState !== 1) {
        ws.send(JSON.stringify({ t: 'error', msg: 'That player is no longer online' }));
        return;
      }
      const accept = !!msg.accept;
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
      };
      rooms.set(id, room);
      addClientToRoom(client, room);
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
      if (!room || room.matchStarted) {
        ws.send(
          JSON.stringify({
            t: 'error',
            msg: room ? 'Match already started' : 'Lobby not found',
          }),
        );
        return;
      }
      normalizeSeatTypes(room.meta);
      if (!firstFreeHumanSlot(room)) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Lobby full' }));
        return;
      }
      const pw = String(msg.password || '');
      if (room.password && pw !== room.password) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Wrong password' }));
        return;
      }
      leaveRoom(client);
      addClientToRoom(client, room);
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

    if (t === 'kick_player') {
      if (!client.room || !client.isHost || client.room.matchStarted) return;
      const target = parseInt(msg.slot, 10) || 0;
      if (target <= 0 || target === client.slot) return;
      const victim = client.room.clients.find((c) => c.slot === target);
      if (!victim) return;
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
      const cap = lobbyCap(client.room);
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
      const unitSkin = sanitizeUnitSkin(msg.unitSkin != null ? msg.unitSkin : client.unitSkin);
      const mpStats = sanitizeMpStats(msg.mpStats) || client.mpStats;
      const combinedStats = sanitizeCombinedStats(
        msg.combinedStats != null ? msg.combinedStats : client.combinedStats,
      );
      const playerId = sanitizePlayerId(msg.playerId != null ? msg.playerId : client.playerId);
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
      client.unitSkin = unitSkin;
      client.mpStats = mpStats;
      client.combinedStats = combinedStats;
      if (playerId) {
        const result = registerClientPlayer(client, {
          playerId,
          displayName,
          unitSkin,
          mpStats,
          combinedStats,
        });
        if (!result.ok) {
          ws.send(JSON.stringify({ t: 'profile_failed', reason: result.reason, msg: result.msg }));
          return;
        }
      } else updateLeaderboardEntry(client, combinedStats);
      if (!client.room.meta.playerPublic || typeof client.room.meta.playerPublic !== 'object')
        client.room.meta.playerPublic = {};
      client.room.meta.playerPublic[String(client.slot)] = {
        displayName,
        mpStats,
        unitSkin,
        playerId: playerId || client.playerId || '',
        combinedStats,
      };
      broadcastAll(client.room, { t: 'room_meta', meta: metaWire(client.room) });
      broadcastLobbyList();
      return;
    }

    if (t === 'leave') {
      leaveRoom(client);
      try {
        ws.send(JSON.stringify({ t: 'left' }));
      } catch (_) {}
      return;
    }

    if (!client.room) return;

    if (t === 'start' && client.isHost) {
      client.room.matchStarted = true;
      const payload = msg.payload;
      broadcastAll(client.room, { t: 'match_start', payload, fromSlot: client.slot });
      broadcastLobbyList();
      return;
    }
    if (t === 'snap' && client.isHost) {
      broadcast(client.room, { t: 'snap', payload: msg.payload, seq: msg.seq }, ws);
      return;
    }
    if (t === 'cmd' && !client.isHost) {
      if (msg.fromSlot !== client.slot) return;
      if (client.room.host && client.room.host.ws.readyState === 1) {
        client.room.host.ws.send(JSON.stringify({ t: 'cmd', fromSlot: client.slot, cmd: msg.cmd }));
      }
      return;
    }
    if (t === 'cmd' && client.isHost) {
      broadcast(client.room, { t: 'cmd', fromSlot: client.slot, cmd: msg.cmd }, ws);
      return;
    }
  });

  ws.on('close', () => {
    leaveRoom(client);
    unregisterClientPlayer(client);
    broadcastLobbyList();
  });
});

loadLeaderboardFromDisk();
loadFriendRemovalsFromDisk();
loadProgressFromDisk();

server.listen(PORT, () => {
  console.log(`simple-wars-mp listening on ${PORT} (max ${MAX_PLAYERS} players / room)`);
});
