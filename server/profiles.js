/**
 * Server-authoritative player profiles — cloud saves, shop, achievements, MP anticheat.
 */
const fs = require('fs');
const path = require('path');

const PROFILES_FILE = path.join(__dirname, 'player-profiles.json');
const SAVE_DEBOUNCE_MS = 1500;
const DEFAULT_GOLD = 0;
const SHOP_SKIN_COST = 100;
const SHOP_ANCIENT_CIV_GAUL_COST = 100;
const SHOP_ANCIENT_CIV_PACK_COST = 200;
const SHOP_VISUAL_COST = 100;
const SHOP_MAP_DEFAULT_PRICE = 150;

const ANCIENT_CIV_PACKS = {
  civRome: { cost: SHOP_ANCIENT_CIV_PACK_COST, variants: ['civRome', 'civRome2'] },
  civCarthage: { cost: SHOP_ANCIENT_CIV_PACK_COST, variants: ['civCarthage', 'civCarthage2'] },
  civEgypt: { cost: SHOP_ANCIENT_CIV_PACK_COST, variants: ['civEgypt', 'civEgypt2'] },
  civMacedon: { cost: SHOP_ANCIENT_CIV_PACK_COST, variants: ['civMacedon', 'civMacedon2'] },
  civSparta: { cost: SHOP_ANCIENT_CIV_PACK_COST, variants: ['civSparta', 'civSparta2'] },
  civGaul: { cost: SHOP_ANCIENT_CIV_GAUL_COST, variants: ['civGaul'] },
};
const ANCIENT_CIV_PACK_IDS = Object.keys(ANCIENT_CIV_PACKS);
const ANCIENT_CIV_VARIANT_IDS = ANCIENT_CIV_PACK_IDS.flatMap((id) => ANCIENT_CIV_PACKS[id].variants);

const PURCHASABLE_SKINS = new Set([
  'napoleonic', 'medieval', 'ancient',
  'civRome', 'civCarthage', 'civGaul', 'civEgypt', 'civMacedon', 'civSparta',
  'usa', 'uk', 'germany', 'france', 'japan', 'ussr', 'italy', 'china',
  'ruseUsa', 'ruseUk', 'ruseFrance', 'ruseGermany', 'ruseUssr', 'ruseJapan', 'ruseItaly', 'ruseChina',
]);

const SHOP_VISUAL_IDS = new Set([
  'viz_frontline_dotted', 'viz_frontline_double', 'viz_arrow_dotted', 'viz_arrow_line',
  'viz_color_gold', 'viz_color_white', 'viz_color_red', 'viz_color_blue',
]);

const LIFETIME_KEYS = [
  'enemyTroopKills', 'ownTroopLosses', 'enemyMarineKills', 'ownMarineLosses',
  'enemyTankKills', 'ownTankLosses', 'enemyShipKills', 'ownShipLosses',
  'peakFieldManpower', 'battlesWon', 'campaignLosses', 'citiesCaptured', 'convoysCaptured',
  'factoriesBuilt', 'harborsBuilt', 'fortsBuilt', 'peakMoneyHeld',
  'unitsBuiltLight', 'unitsBuiltHeavy', 'unitsBuiltShip', 'unitsBuiltMarine', 'gamesStarted',
  'missionsCompleted', 'campaignsWon', 'campaignBattlesWon',
];

const LIFETIME_MAX_JUMP = {
  enemyTroopKills: 800, enemyMarineKills: 400, enemyTankKills: 200, enemyShipKills: 80,
  ownTroopLosses: 800, ownMarineLosses: 400, ownTankLosses: 200, ownShipLosses: 80,
  battlesWon: 5, campaignLosses: 5, citiesCaptured: 40, convoysCaptured: 40,
  factoriesBuilt: 20, harborsBuilt: 20, fortsBuilt: 20,
  peakFieldManpower: 100000, peakMoneyHeld: 500000,
  unitsBuiltLight: 200, unitsBuiltHeavy: 80, unitsBuiltShip: 40, unitsBuiltMarine: 80,
  gamesStarted: 5,
  missionsCompleted: 10, campaignsWon: 3, campaignBattlesWon: 30,
};

/** @type {Map<string, object>} */
const profiles = new Map();
let saveTimer = null;

function clampInt(v, min, max) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function sanitizePlayerId(id) {
  const s = String(id || '').trim().slice(0, 32);
  if (!/^WOD-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(s)) return '';
  return s;
}

function sanitizeSkin(raw) {
  const s = String(raw || 'nato').trim().slice(0, 32);
  return s || 'nato';
}

function defaultLifetime() {
  const o = {};
  for (const k of LIFETIME_KEYS) o[k] = 0;
  return o;
}

function defaultProfile(playerId) {
  return {
    playerId,
    version: 1,
    updatedAt: Date.now(),
    profile: {
      gold: DEFAULT_GOLD,
      unitSkin: 'nato',
      aiUnitSkin: 'nato',
      ownedUnitSkins: { nato: true },
      ownedShopVisuals: {},
      equippedShopMapId: null,
      gamePeriod: 'modern',
      mpDisplayName: '',
      friends: [],
      friendRequestsOut: [],
      friendRequestsIn: [],
    },
    achievements: {
      goldenChipMaster: false,
      periodNapoleonic: false,
      periodAncient: false,
      periodMedieval: false,
    },
    lifetime: defaultLifetime(),
    lifetimeByPeriod: {},
    multiplayer: { gamesPlayed: 0, wins: 0, losses: 0 },
  };
}

function sanitizeLifetime(obj) {
  const out = defaultLifetime();
  if (!obj || typeof obj !== 'object') return out;
  for (const k of LIFETIME_KEYS) out[k] = clampInt(obj[k], 0, 999999999);
  return out;
}

function sanitizeOwnedMap(obj) {
  const out = { nato: true };
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    const key = String(k).slice(0, 48);
    if (key && v) out[key] = true;
  }
  out.nato = true;
  return out;
}

function sanitizeFriendsList(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const f of arr) {
    if (!f || typeof f !== 'object') continue;
    const playerId = sanitizePlayerId(f.playerId);
    if (!playerId) continue;
    out.push({
      playerId,
      displayName: String(f.displayName || '').trim().slice(0, 24),
      unitSkin: sanitizeSkin(f.unitSkin),
    });
  }
  return out.slice(0, 200);
}

function sanitizeFriendRequests(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const r of arr) {
    if (!r || typeof r !== 'object') continue;
    const playerId = sanitizePlayerId(r.playerId || r.fromPlayerId);
    if (!playerId) continue;
    out.push({
      playerId,
      fromName: String(r.fromName || r.displayName || '').trim().slice(0, 24),
      unitSkin: sanitizeSkin(r.unitSkin),
    });
  }
  return out.slice(0, 100);
}

function mergeFriendRequestsArrays(a, b) {
  const merged = sanitizeFriendRequests(a);
  const seen = new Set(merged.map((r) => r.playerId));
  for (const r of sanitizeFriendRequests(b)) {
    if (!seen.has(r.playerId)) {
      merged.push(r);
      seen.add(r.playerId);
    }
  }
  return merged.slice(0, 100);
}

function recordFriendRequest(fromId, fromName, fromSkin, toId) {
  const from = sanitizePlayerId(fromId);
  const to = sanitizePlayerId(toId);
  if (!from || !to || from === to) return false;
  const fp = getProfile(from);
  const tp = getProfile(to);
  if ((tp.profile.friends || []).some((f) => f && f.playerId === from)) return false;
  const outEntry = { playerId: to, fromName: String(fromName || '').trim().slice(0, 24), unitSkin: sanitizeSkin(fromSkin) };
  const inEntry = { playerId: from, fromName: String(fromName || '').trim().slice(0, 24), unitSkin: sanitizeSkin(fromSkin) };
  fp.profile.friendRequestsOut = mergeFriendRequestsArrays(fp.profile.friendRequestsOut, [outEntry]);
  tp.profile.friendRequestsIn = mergeFriendRequestsArrays(tp.profile.friendRequestsIn, [inEntry]);
  fp.updatedAt = Date.now();
  tp.updatedAt = Date.now();
  scheduleSave();
  return true;
}

function applyFriendRequestReply(fromId, toId, accept, toName, toSkin) {
  const from = sanitizePlayerId(fromId);
  const to = sanitizePlayerId(toId);
  if (!from || !to) return false;
  const fp = getProfile(from);
  const tp = getProfile(to);
  fp.profile.friendRequestsOut = (fp.profile.friendRequestsOut || []).filter((r) => r && r.playerId !== to);
  tp.profile.friendRequestsIn = (tp.profile.friendRequestsIn || []).filter((r) => r && r.playerId !== from);
  if (accept) {
    const a = { playerId: to, displayName: String(toName || '').trim().slice(0, 24), unitSkin: sanitizeSkin(toSkin) };
    const b = { playerId: from, displayName: String(fp.profile.mpDisplayName || '').trim().slice(0, 24) || 'Player', unitSkin: sanitizeSkin(fp.profile.unitSkin) };
    if (!(fp.profile.friends || []).some((f) => f && f.playerId === to)) {
      fp.profile.friends = sanitizeFriendsList([...(fp.profile.friends || []), a]);
    }
    if (!(tp.profile.friends || []).some((f) => f && f.playerId === from)) {
      tp.profile.friends = sanitizeFriendsList([...(tp.profile.friends || []), b]);
    }
  }
  fp.updatedAt = Date.now();
  tp.updatedAt = Date.now();
  scheduleSave();
  return true;
}

function recomputeAchievements(profile) {
  const A = profile.achievements;
  const L = profile.lifetime || defaultLifetime();
  const owned = profile.profile.ownedUnitSkins || {};
  if (owned.goldenChip) A.goldenChipMaster = true;
  if (owned.napoleonic) A.periodNapoleonic = true;
  if (owned.medieval) A.periodMedieval = true;
  if (owned.ancient) A.periodAncient = true;
  const met =
    (L.battlesWon || 0) >= 1 &&
    (L.citiesCaptured || 0) >= 15 &&
    (L.enemyTankKills || 0) >= 200 &&
    (L.enemyShipKills || 0) >= 40 &&
    (L.convoysCaptured || 0) >= 30 &&
    (L.factoriesBuilt || 0) >= 12 &&
    (L.harborsBuilt || 0) >= 12 &&
    (L.peakMoneyHeld || 0) >= 20000 &&
    (L.peakFieldManpower || 0) >= 50000 &&
    (L.battlesWon || 0) >= 5 &&
    (L.missionsCompleted || 0) >= 10 &&
    (L.campaignsWon || 0) >= 1 &&
    (L.campaignBattlesWon || 0) >= 10 &&
    !!(A.periodNapoleonic || owned.napoleonic) &&
    !!(A.periodAncient || owned.ancient) &&
    !!(A.periodMedieval || owned.medieval);
  if (met) {
    A.goldenChipMaster = true;
    profile.profile.ownedUnitSkins.goldenChip = true;
  }
}

function mergeLifetimeMonotonic(serverL, clientL) {
  const out = Object.assign({}, serverL);
  for (const k of LIFETIME_KEYS) {
    const sv = out[k] || 0;
    const cv = clampInt(clientL && clientL[k], 0, 999999999);
    if (cv <= sv) {
      out[k] = sv;
      continue;
    }
    const maxJump = LIFETIME_MAX_JUMP[k] || 120;
    out[k] = Math.min(cv, sv + maxJump);
  }
  return out;
}

function mergeLifetimeByPeriod(serverMap, clientMap) {
  const out = Object.assign({}, serverMap || {});
  if (!clientMap || typeof clientMap !== 'object') return out;
  for (const [pid, block] of Object.entries(clientMap)) {
    const key = String(pid).slice(0, 24);
    if (!key) continue;
    out[key] = mergeLifetimeMonotonic(sanitizeLifetime(out[key]), sanitizeLifetime(block));
  }
  return out;
}

function computeCombinedStats(profile) {
  const mp = profile.multiplayer || {};
  const L = profile.lifetime || defaultLifetime();
  const kills =
    (L.enemyTroopKills || 0) +
    (L.enemyMarineKills || 0) +
    (L.enemyTankKills || 0) +
    (L.enemyShipKills || 0);
  const unitLosses =
    (L.ownTroopLosses || 0) +
    (L.ownMarineLosses || 0) +
    (L.ownTankLosses || 0) +
    (L.ownShipLosses || 0);
  return {
    // wins/defeats = matches won/lost (MP + solo); kills/losses = troops killed/lost.
    wins: (mp.wins || 0) + (L.battlesWon || 0),
    defeats: (mp.losses || 0) + (L.campaignLosses || 0),
    kills,
    losses: unitLosses,
    gamesPlayed: (mp.gamesPlayed || 0) + (L.gamesStarted || 0),
  };
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.writeFileSync(PROFILES_FILE, JSON.stringify(Object.fromEntries(profiles), null, 2), 'utf8');
    } catch (err) {
      console.warn('[profiles] save failed:', err.message);
    }
  }, SAVE_DEBOUNCE_MS);
}

function loadProfilesFromDisk() {
  try {
    if (!fs.existsSync(PROFILES_FILE)) return;
    const data = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
    if (!data || typeof data !== 'object') return;
    for (const [id, row] of Object.entries(data)) {
      const playerId = sanitizePlayerId(id);
      if (!playerId || !row) continue;
      profiles.set(playerId, hydrateProfile(playerId, row));
    }
  } catch (err) {
    console.warn('[profiles] load failed:', err.message);
  }
}

function hydrateProfile(playerId, row) {
  const base = defaultProfile(playerId);
  if (!row || typeof row !== 'object') return base;
  const p = row.profile && typeof row.profile === 'object' ? row.profile : {};
  base.profile.gold = clampInt(p.gold, 0, 999999999);
  base.profile.unitSkin = sanitizeSkin(p.unitSkin);
  base.profile.aiUnitSkin = sanitizeSkin(p.aiUnitSkin);
  base.profile.ownedUnitSkins = sanitizeOwnedMap(p.ownedUnitSkins);
  base.profile.ownedShopVisuals = sanitizeOwnedMap(p.ownedShopVisuals);
  delete base.profile.ownedUnitSkins.nato;
  base.profile.ownedUnitSkins.nato = true;
  base.profile.equippedShopMapId = p.equippedShopMapId ? String(p.equippedShopMapId).slice(0, 64) : null;
  base.profile.mpDisplayName = String(p.mpDisplayName || '').trim().slice(0, 24);
  base.profile.friends = sanitizeFriendsList(p.friends);
  base.profile.friendRequestsOut = sanitizeFriendRequests(p.friendRequestsOut);
  base.profile.friendRequestsIn = sanitizeFriendRequests(p.friendRequestsIn);
  base.achievements = Object.assign(base.achievements, row.achievements || {});
  base.lifetime = sanitizeLifetime(row.lifetime);
  base.lifetimeByPeriod = mergeLifetimeByPeriod({}, row.lifetimeByPeriod || {});
  base.multiplayer = {
    gamesPlayed: clampInt(row.multiplayer && row.multiplayer.gamesPlayed, 0, 999999),
    wins: clampInt(row.multiplayer && row.multiplayer.wins, 0, 999999),
    losses: clampInt(row.multiplayer && row.multiplayer.losses, 0, 999999),
  };
  base.updatedAt = Math.max(0, parseInt(row.updatedAt, 10) || 0);
  recomputeAchievements(base);
  return base;
}

function getProfile(playerId) {
  const id = sanitizePlayerId(playerId);
  if (!id) return null;
  if (!profiles.has(id)) profiles.set(id, defaultProfile(id));
  return profiles.get(id);
}

function exportProfile(playerId) {
  const p = getProfile(playerId);
  if (!p) return null;
  return JSON.parse(JSON.stringify(p));
}

function ancientCivPackVariants(packId) {
  return ANCIENT_CIV_PACKS[packId] ? ANCIENT_CIV_PACKS[packId].variants.slice() : [];
}

function ancientCivPackCost(packId) {
  return ANCIENT_CIV_PACKS[packId] ? ANCIENT_CIV_PACKS[packId].cost : SHOP_SKIN_COST;
}

function grantAncientCivPack(ownedUnitSkins, packId) {
  if (!ownedUnitSkins || !packId || !ANCIENT_CIV_PACKS[packId]) return;
  ownedUnitSkins[packId] = true;
  for (const variantId of ancientCivPackVariants(packId)) ownedUnitSkins[variantId] = true;
}

function ancientCivPackOwned(profile, packId) {
  const owned = profile.profile.ownedUnitSkins || {};
  if (owned[packId]) return true;
  const variants = ancientCivPackVariants(packId);
  return variants.length > 0 && variants.every((id) => !!owned[id]);
}

function ancientCivVariantOwned(profile, variantId) {
  const owned = profile.profile.ownedUnitSkins || {};
  if (owned[variantId]) return true;
  for (const [packId, pack] of Object.entries(ANCIENT_CIV_PACKS)) {
    if (pack.variants.includes(variantId)) return ancientCivPackOwned(profile, packId);
  }
  return false;
}

function skinIsOwned(profile, skinId) {
  const id = sanitizeSkin(skinId);
  if (id === 'nato') return true;
  if (id === 'goldenChip') return !!(profile.achievements && profile.achievements.goldenChipMaster);
  if (ANCIENT_CIV_VARIANT_IDS.includes(id)) return ancientCivVariantOwned(profile, id);
  if (ANCIENT_CIV_PACKS[id]) return ancientCivPackOwned(profile, id);
  return !!(profile.profile.ownedUnitSkins && profile.profile.ownedUnitSkins[id]);
}

function validateEquippedSkin(profile, skinId) {
  const id = sanitizeSkin(skinId);
  return skinIsOwned(profile, id) ? id : 'nato';
}

function syncProgress(playerId, payload) {
  const id = sanitizePlayerId(playerId);
  if (!id || !payload || typeof payload !== 'object') {
    return { ok: false, msg: 'Invalid sync payload' };
  }
  const profile = getProfile(id);
  const cur = profile.profile;

  if (payload.lifetime && typeof payload.lifetime === 'object') {
    profile.lifetime = mergeLifetimeMonotonic(profile.lifetime, payload.lifetime);
  }
  if (payload.lifetimeByPeriod && typeof payload.lifetimeByPeriod === 'object') {
    profile.lifetimeByPeriod = mergeLifetimeByPeriod(profile.lifetimeByPeriod, payload.lifetimeByPeriod);
  }

  if (payload.profile && typeof payload.profile === 'object') {
    const cp = payload.profile;
    if (cp.unitSkin != null) cur.unitSkin = validateEquippedSkin(profile, cp.unitSkin);
    if (cp.aiUnitSkin != null) cur.aiUnitSkin = validateEquippedSkin(profile, cp.aiUnitSkin);
    if (cp.equippedShopMapId != null) {
      const mapId = String(cp.equippedShopMapId || '').slice(0, 64);
      const shopKey = mapId ? `shop_map_${mapId}` : '';
      if (!mapId || (cur.ownedShopVisuals && cur.ownedShopVisuals[shopKey])) {
        cur.equippedShopMapId = mapId || null;
      }
    }
    if (Array.isArray(cp.friends)) cur.friends = sanitizeFriendsList(cp.friends);
    if (Array.isArray(cp.friendRequestsOut)) {
      cur.friendRequestsOut = mergeFriendRequestsArrays(cur.friendRequestsOut, cp.friendRequestsOut);
    }
    if (Array.isArray(cp.friendRequestsIn)) {
      cur.friendRequestsIn = mergeFriendRequestsArrays(cur.friendRequestsIn, cp.friendRequestsIn);
    }
  }

  recomputeAchievements(profile);
  profile.updatedAt = Date.now();
  scheduleSave();
  return { ok: true, profile: exportProfile(id) };
}

function shopPurchase(playerId, req) {
  const id = sanitizePlayerId(playerId);
  if (!id || !req || typeof req !== 'object') return { ok: false, msg: 'Invalid purchase' };
  const profile = getProfile(id);
  const kind = String(req.kind || '').trim();
  const itemId = String(req.itemId || '').trim().slice(0, 64);
  if (!kind || !itemId) return { ok: false, msg: 'Invalid purchase item' };

  const cur = profile.profile;
  if (kind === 'skin') {
    if (itemId === 'nato') return { ok: false, msg: 'Already free' };
    if (itemId === 'goldenChip') return { ok: false, msg: 'Achievement unlock only' };
    if (!PURCHASABLE_SKINS.has(itemId)) return { ok: false, msg: 'Unknown skin' };
    if (ANCIENT_CIV_PACKS[itemId]) {
      if (ancientCivPackOwned(profile, itemId)) return { ok: true, profile: exportProfile(id), alreadyOwned: true };
      const cost = ancientCivPackCost(itemId);
      if ((cur.gold || 0) < cost) return { ok: false, msg: 'Not enough gold' };
      cur.gold -= cost;
      grantAncientCivPack(cur.ownedUnitSkins, itemId);
    } else {
      if (cur.ownedUnitSkins[itemId]) return { ok: true, profile: exportProfile(id), alreadyOwned: true };
      if ((cur.gold || 0) < SHOP_SKIN_COST) return { ok: false, msg: 'Not enough gold' };
      cur.gold -= SHOP_SKIN_COST;
      cur.ownedUnitSkins[itemId] = true;
      if (itemId === 'napoleonic') profile.achievements.periodNapoleonic = true;
      if (itemId === 'medieval') profile.achievements.periodMedieval = true;
      if (itemId === 'ancient') profile.achievements.periodAncient = true;
    }
  } else if (kind === 'visual') {
    if (!SHOP_VISUAL_IDS.has(itemId)) return { ok: false, msg: 'Unknown shop item' };
    if (cur.ownedShopVisuals[itemId]) return { ok: true, profile: exportProfile(id), alreadyOwned: true };
    if ((cur.gold || 0) < SHOP_VISUAL_COST) return { ok: false, msg: 'Not enough gold' };
    cur.gold -= SHOP_VISUAL_COST;
    cur.ownedShopVisuals[itemId] = true;
  } else if (kind === 'map') {
    const shopId = itemId.startsWith('shop_map_') ? itemId : `shop_map_${itemId}`;
    const mapKey = shopId.replace(/^shop_map_/, '');
    if (cur.ownedShopVisuals[shopId]) return { ok: true, profile: exportProfile(id), alreadyOwned: true };
    const price = clampInt(req.price, 0, 999999) || SHOP_MAP_DEFAULT_PRICE;
    if ((cur.gold || 0) < price) return { ok: false, msg: 'Not enough gold' };
    cur.gold -= price;
    cur.ownedShopVisuals[shopId] = true;
    if (!mapKey) return { ok: false, msg: 'Invalid map' };
  } else if (kind === 'skin_bulk') {
    const section = String(req.section || '').trim();
    const sections = {
      standard: ['napoleonic', 'medieval', 'ancient'],
      ancientCiv: ANCIENT_CIV_PACK_IDS.slice(),
      countryballs: ['usa', 'uk', 'germany', 'france', 'japan', 'ussr', 'italy', 'china'],
      ruse: ['ruseUsa', 'ruseUk', 'ruseFrance', 'ruseGermany', 'ruseUssr', 'ruseJapan', 'ruseItaly', 'ruseChina'],
    };
    const ids = sections[section];
    if (!ids) return { ok: false, msg: 'Unknown section' };
    const toBuy = ids.filter((sid) => PURCHASABLE_SKINS.has(sid) && (
      ANCIENT_CIV_PACKS[sid] ? !ancientCivPackOwned(profile, sid) : !cur.ownedUnitSkins[sid]
    ));
    if (!toBuy.length) return { ok: true, profile: exportProfile(id), alreadyOwned: true };
    const cost = toBuy.reduce((sum, sid) => sum + (ANCIENT_CIV_PACKS[sid] ? ancientCivPackCost(sid) : SHOP_SKIN_COST), 0);
    if ((cur.gold || 0) < cost) return { ok: false, msg: 'Not enough gold' };
    cur.gold -= cost;
    for (const sid of toBuy) {
      if (ANCIENT_CIV_PACKS[sid]) grantAncientCivPack(cur.ownedUnitSkins, sid);
      else {
        cur.ownedUnitSkins[sid] = true;
        if (sid === 'napoleonic') profile.achievements.periodNapoleonic = true;
        if (sid === 'medieval') profile.achievements.periodMedieval = true;
        if (sid === 'ancient') profile.achievements.periodAncient = true;
      }
    }
  } else {
    return { ok: false, msg: 'Unknown purchase kind' };
  }

  recomputeAchievements(profile);
  profile.updatedAt = Date.now();
  scheduleSave();
  return { ok: true, profile: exportProfile(id) };
}

function recordMpMatchEnd(hostPlayerId, room, payload) {
  const hostId = sanitizePlayerId(hostPlayerId);
  if (!hostId || !room || !room.matchStarted) {
    return { ok: false, msg: 'Match not active' };
  }
  if (!payload || typeof payload !== 'object') return { ok: false, msg: 'Invalid match end' };
  const outcomes = payload.outcomes && typeof payload.outcomes === 'object' ? payload.outcomes : {};
  const participants = Array.isArray(payload.participants) ? payload.participants : [];
  const updated = [];

  for (const part of participants) {
    if (!part || typeof part !== 'object') continue;
    const pid = sanitizePlayerId(part.playerId);
    const slot = clampInt(part.slot, 0, 8);
    if (!pid || !slot) continue;
    const oc = outcomes[String(slot)] || outcomes[slot];
    if (oc !== 'won' && oc !== 'lost') continue;
    const profile = getProfile(pid);
    profile.multiplayer.gamesPlayed = (profile.multiplayer.gamesPlayed || 0) + 1;
    if (oc === 'won') profile.multiplayer.wins = (profile.multiplayer.wins || 0) + 1;
    else profile.multiplayer.losses = (profile.multiplayer.losses || 0) + 1;
    profile.updatedAt = Date.now();
    updated.push(pid);
  }

  if (!updated.length) return { ok: false, msg: 'No valid participants' };
  room.matchStarted = false;
  room.lastMatchEndedAt = Date.now();
  scheduleSave();
  return { ok: true, updatedPlayerIds: updated };
}

function attachClientProfile(client, displayName) {
  if (!client || !client.playerId) return;
  const profile = getProfile(client.playerId);
  if (displayName) profile.profile.mpDisplayName = String(displayName).trim().slice(0, 24);
  client.serverProfile = profile;
  client.unitSkin = validateEquippedSkin(profile, client.unitSkin || profile.profile.unitSkin);
  client.mpStats = {
    gamesPlayed: profile.multiplayer.gamesPlayed || 0,
    wins: profile.multiplayer.wins || 0,
    losses: profile.multiplayer.losses || 0,
  };
  client.combinedStats = computeCombinedStats(profile);
}

module.exports = {
  loadProfilesFromDisk,
  getProfile,
  exportProfile,
  syncProgress,
  shopPurchase,
  recordMpMatchEnd,
  recordFriendRequest,
  applyFriendRequestReply,
  attachClientProfile,
  validateEquippedSkin,
  computeCombinedStats,
  skinIsOwned,
  sanitizePlayerId,
};
