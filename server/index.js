/**
 * Simple Wars — multiplayer relay
 * Host-authoritative: host runs full sim; server forwards snapshots & player commands.
 * Lobby browser: list open games, optional password, online count.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const profiles = require('./profiles');

const PORT = parseInt(process.env.PORT || '8080', 10);
const MAX_PLAYERS = 4;
const MAX_INIT_BYTES = 48 * 1024 * 1024;
const LEADERBOARD_FILE = path.join(__dirname, 'leaderboard.json');
const FRIEND_REMOVALS_FILE = path.join(__dirname, 'friend-removals.json');
const FRIEND_REQUESTS_FILE = path.join(__dirname, 'friend-requests-pending.json');
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
const MP_DISCONNECT_GRACE_MS = 22500;
/** Close idle sockets that stop responding to pings (proxies often drop ~60s idle WS). */
const MP_STALE_CONNECTION_MS = 90000;

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
      stats: profNewer ? fromProf.stats : existing.stats,
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
  const newHost = room.clients.find((c) => c.ws.readyState === 1) || room.clients[0];
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
        snap: room.lastSnap || null,
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
    markSlotDisconnectedInMatch(room, leftSlot);
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

function forfeitClientFromMatch(client) {
  const room = client.room;
  if (!room || !room.matchStarted) {
    leaveRoom(client);
    return;
  }
  disconnectClientFromMatch(client, true);
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
    lastPingAt: Date.now(),
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
      ws.send(JSON.stringify({ t: 'registered', playerId: result.playerId, profile: result.profile || null }));
      flushFriendRemovalsForClient(client);
      flushFriendRequestsForClient(client);
      return;
    }

    if (t === 'get_profile') {
      const playerId = sanitizePlayerId(msg.playerId || (client.playerId || ''));
      if (!playerId) {
        ws.send(JSON.stringify({ t: 'profile_failed', msg: 'Invalid player ID' }));
        return;
      }
      ws.send(JSON.stringify({ t: 'profile', profile: profiles.exportProfile(playerId) }));
      return;
    }

    if (t === 'sync_progress') {
      const playerId = sanitizePlayerId(msg.playerId || client.playerId);
      if (!playerId || (client.playerId && client.playerId !== playerId)) {
        ws.send(JSON.stringify({ t: 'profile_failed', msg: 'Register before syncing progress' }));
        return;
      }
      const result = profiles.syncProgress(playerId, msg.progress || msg);
      if (!result.ok) {
        ws.send(JSON.stringify({ t: 'profile_failed', msg: result.msg || 'Sync rejected' }));
        return;
      }
      if (client.playerId === playerId) {
        profiles.attachClientProfile(client, client.displayName);
        updateLeaderboardEntry(client, client.combinedStats);
      }
      ws.send(JSON.stringify({ t: 'profile', profile: result.profile }));
      return;
    }

    if (t === 'shop_purchase') {
      const playerId = sanitizePlayerId(msg.playerId || client.playerId);
      if (!playerId || (client.playerId && client.playerId !== playerId)) {
        ws.send(JSON.stringify({ t: 'shop_failed', msg: 'Register before purchasing' }));
        return;
      }
      const result = profiles.shopPurchase(playerId, msg);
      if (!result.ok) {
        ws.send(JSON.stringify({ t: 'shop_failed', msg: result.msg || 'Purchase failed' }));
        return;
      }
      if (client.playerId === playerId) profiles.attachClientProfile(client, client.displayName);
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
      const result = profiles.recordMpMatchEnd(client.playerId, client.room, {
        outcomes,
        participants,
      });
      if (!result.ok) {
        ws.send(JSON.stringify({ t: 'error', msg: result.msg || 'Could not record match' }));
        return;
      }
      for (const pid of result.updatedPlayerIds || []) {
        const peer = onlineByPlayerId.get(pid);
        if (peer) {
          profiles.attachClientProfile(peer, peer.displayName);
          // Refresh the leaderboard with the server-authoritative post-match stats —
          // previously match results only landed in profiles, so the rankings never moved.
          updateLeaderboardEntry(peer, peer.combinedStats);
          try {
            peer.ws.send(JSON.stringify({ t: 'profile', profile: profiles.exportProfile(pid) }));
          } catch (_) {}
        } else {
          // Player already disconnected — still update their leaderboard row from the profile.
          const prof = profiles.getProfile(pid);
          if (prof) {
            updateLeaderboardEntry(
              { playerId: pid, displayName: prof.profile.mpDisplayName || 'Player', unitSkin: prof.profile.unitSkin || 'nato' },
              profiles.computeCombinedStats(prof),
            );
          }
        }
      }
      ws.send(JSON.stringify({ t: 'mp_match_end_ack', updatedPlayerIds: result.updatedPlayerIds || [] }));
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
      if (!room) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Lobby not found' }));
        return;
      }
      const pw = String(msg.password || '');
      if (room.password && pw !== room.password) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Wrong password' }));
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
        if (!rejoinSlot || (!inGrace && !inDisc)) {
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
      if (!firstFreeHumanSlot(room)) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Lobby full' }));
        return;
      }
      const reqSeat = parseInt(msg.seat, 10) || 0;
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
      };
      broadcastAll(client.room, { t: 'room_meta', meta: metaWire(client.room) });
      broadcastLobbyList();
      return;
    }

    if (t === 'leave') {
      if (client.room && client.room.matchStarted) forfeitClientFromMatch(client);
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
      client.room.matchStarted = true;
      client.room.lobbyPreview = null;
      client.room._matchEndRecorded = false;
      client.room.pendingReconnect = new Map();
      const payload = msg.payload;
      client.room.matchInitPayload = payload;
      client.room.lastSnap = null;
      client.room.hostPlayerId = sanitizePlayerId(client.playerId);
      captureMatchSeatPlayers(client.room);
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
      client.room.lastSnap = { payload: msg.payload, seq: msg.seq };
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
profiles.loadProfilesFromDisk();
hydrateLeaderboardFromProfiles();
scheduleLeaderboardSave();

server.listen(PORT, () => {
  console.log(`simple-wars-mp listening on ${PORT} (max ${MAX_PLAYERS} players / room)`);
});
