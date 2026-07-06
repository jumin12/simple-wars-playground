/**
 * Generates the 10 hand-crafted campaign missions into missions/*.json.
 * Each mission is a full map export (format "simple-wars-mission") with an
 * authored layout, starting armies, economy, and scripted events.
 *
 * Run: node scripts/generate-missions.js   (then commit missions/)
 */
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'missions');
const SPACING = 27; // hexRadius 20 * 1.35
const ROWS_MUL = 0.8;

/* ---------------- seeded rng ---------------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- map builder ---------------- */
class MapBuilder {
  constructor(size, seed) {
    this.size = size;
    this.cols = size;
    this.rows = Math.floor(size * ROWS_MUL);
    this.rng = mulberry32(seed);
    this.hexes = new Map();
    this.cities = [];
    this.entities = [];
    this.forts = [];
    this.bridges = [];
    this.citySeq = 0;
    this.unitSeq = 0;
    this.fortSeq = 0;
    this.bridgeSeq = 0;
    for (let r = -this.rows; r <= this.rows; r++) {
      for (let q = -this.cols; q <= this.cols; q++) {
        this.hexes.set(q + ',' + r, { q, r, x: q * SPACING, y: r * SPACING, type: 'water', owner: 0 });
      }
    }
  }
  key(q, r) { return q + ',' + r; }
  at(q, r) { return this.hexes.get(this.key(q, r)); }
  set(q, r, type) { const h = this.at(q, r); if (h) h.type = type; }
  each(fn) { for (const h of this.hexes.values()) fn(h); }
  isLand(h) { return h && h.type !== 'water'; }

  /** Noisy-edged filled circle of terrain (q/r units). */
  blob(cq, cr, radius, type, opt) {
    opt = opt || {};
    const noise = opt.noise != null ? opt.noise : 0.25;
    const only = opt.onlyType || null;
    for (let dq = -Math.ceil(radius * (1 + noise)); dq <= Math.ceil(radius * (1 + noise)); dq++) {
      for (let dr = -Math.ceil(radius * (1 + noise)); dr <= Math.ceil(radius * (1 + noise)); dr++) {
        const d = Math.sqrt(dq * dq + dr * dr);
        const edge = radius * (1 - noise / 2 + this.rng() * noise);
        if (d > edge) continue;
        const h = this.at(cq + dq, cr + dr);
        if (!h) continue;
        if (only && h.type !== only) continue;
        h.type = type;
      }
    }
  }

  /** Axis-aligned rect of terrain with noisy edge. */
  rect(q0, r0, q1, r1, type, opt) {
    opt = opt || {};
    const noise = opt.noise != null ? opt.noise : 0;
    const only = opt.onlyType || null;
    for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) {
      const jl = noise ? Math.round((this.rng() - 0.5) * 2 * noise) : 0;
      const jr = noise ? Math.round((this.rng() - 0.5) * 2 * noise) : 0;
      for (let q = Math.min(q0, q1) + jl; q <= Math.max(q0, q1) + jr; q++) {
        const h = this.at(q, r);
        if (!h) continue;
        if (only && h.type !== only) continue;
        h.type = type;
      }
    }
  }

  /** Thick line of terrain from (q0,r0) to (q1,r1). Drifts like a natural range/river:
   *  a bounded random walk perpendicular to the line (not per-step jitter, which still
   *  reads as a straight band), plus width variation along the run. */
  ridge(q0, r0, q1, r1, width, type, opt) {
    opt = opt || {};
    const steps = Math.max(Math.abs(q1 - q0), Math.abs(r1 - r0)) * 2 + 1;
    const amp = opt.wobble != null ? opt.wobble * 2.2 : 4.5;
    // Perpendicular unit direction for the drift.
    const len = Math.hypot(q1 - q0, r1 - r0) || 1;
    const pq = -(r1 - r0) / len, pr = (q1 - q0) / len;
    const centerline = [];
    let drift = 0, vel = 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      vel += (this.rng() - 0.5) * 1.3;
      vel *= 0.72;
      drift += vel;
      if (drift > amp) drift = amp;
      if (drift < -amp) drift = -amp;
      // Gentle extra sine sway so long ridges bend at a large scale too.
      const sway = Math.sin(t * Math.PI * (1.5 + (this.seedSway || 0))) * amp * 0.7;
      const off = drift + sway;
      const q = Math.round(q0 + (q1 - q0) * t + pq * off);
      const r = Math.round(r0 + (r1 - r0) * t + pr * off);
      centerline.push({ q, r });
      const w = Math.max(1, Math.round(width * (0.65 + this.rng() * 0.8)));
      for (let dq = -w; dq <= w; dq++) {
        for (let dr = -w; dr <= w; dr++) {
          if (dq * dq + dr * dr > w * w + 0.5) continue;
          const h = this.at(q + dq, r + dr);
          if (!h) continue;
          if (opt.onlyType && h.type !== opt.onlyType) continue;
          if (opt.skipUrban && h.type === 'urban') continue;
          h.type = type;
        }
      }
    }
    return centerline;
  }

  /** Point on a ridge/river centerline closest to (q,r) — anchors gates/bridges/forts
   *  to where the feature ACTUALLY drifted, not where it was nominally aimed. */
  static nearestOn(centerline, q, r) {
    let best = centerline[0], bestD = Infinity;
    for (const p of centerline) {
      const d = (p.q - q) * (p.q - q) + (p.r - r) * (p.r - r);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  /** Scatter patches of a terrain over existing land of another type. */
  scatter(type, count, radius, opt) {
    opt = opt || {};
    const land = [...this.hexes.values()].filter((h) =>
      h.type === (opt.over || 'grass') &&
      (!opt.where || opt.where(h)));
    for (let i = 0; i < count && land.length; i++) {
      const c = land[Math.floor(this.rng() * land.length)];
      this.blob(c.q, c.r, radius * (0.6 + this.rng() * 0.8), type, { noise: 0.5, onlyType: opt.over || 'grass' });
    }
  }

  /** Cellular roughening of every land/water boundary — kills straight coastlines
   *  (rect fills and map-edge cuts) and makes shores read like the procedural maps. */
  roughenCoasts(iterations, prob) {
    prob = prob == null ? 0.3 : prob;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    for (let it = 0; it < (iterations || 2); it++) {
      const flips = [];
      this.each((h) => {
        if (h.type === 'urban' || h.type === 'mountain') return;
        let waterN = 0, landN = 0, urbanAdj = false;
        for (const [dq, dr] of dirs) {
          const n = this.at(h.q + dq, h.r + dr);
          if (!n) continue;
          if (n.type === 'water') waterN++;
          else landN++;
          if (n.type === 'urban') urbanAdj = true;
        }
        if (urbanAdj) return;
        if (h.type !== 'water' && waterN >= 2 && this.rng() < prob) flips.push({ h, to: 'water' });
        else if (h.type === 'water' && landN >= 3 && this.rng() < prob * 0.8) flips.push({ h, to: 'grass' });
      });
      for (const f of flips) f.h.type = f.to;
    }
  }

  /** Turn land bordering water into sand beaches. */
  coastSand(prob) {
    prob = prob == null ? 0.9 : prob;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    const toSand = [];
    this.each((h) => {
      if (h.type !== 'grass' && h.type !== 'forest') return;
      for (const [dq, dr] of dirs) {
        const n = this.at(h.q + dq, h.r + dr);
        if (n && n.type === 'water') { if (this.rng() < prob) toSand.push(h); return; }
      }
    });
    for (const h of toSand) h.type = 'sand';
  }

  /** Stamp a city with a small urban block. Returns the city record. */
  city(q, r, owner, name, opt) {
    opt = opt || {};
    this.citySeq++;
    const id = 'city_' + this.citySeq;
    const center = this.at(q, r);
    if (!center) throw new Error('city off map: ' + name);
    const stamp = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [-2, 0], [0, 2], [0, -2]];
    let placed = 0;
    for (const [dq, dr] of stamp) {
      if (placed >= (opt.blocks || 9)) break;
      const h = this.at(q + dq, r + dr);
      if (!h) continue;
      h.type = 'urban';
      h.cityId = id;
      h.urbanVariant = Math.floor(this.rng() * 5);
      h.owner = owner;
      placed++;
    }
    const city = {
      id, name,
      x: center.x, y: center.y, q, r,
      owner,
      hasFactory: !!opt.factory,
      hasHarbor: !!opt.harbor,
      hp: 1000, maxHp: 1000,
      urbanStyle: Math.floor(this.rng() * 4),
      incomeBonus: opt.incomeBonus || 0,
      manpowerBonus: opt.manpowerBonus || 0,
    };
    this.cities.push(city);
    return city;
  }

  /** Nearest hex around (q,r) satisfying pred, spiral search. */
  nearestWhere(q, r, maxR, pred) {
    for (let rad = 0; rad <= maxR; rad++) {
      for (let dq = -rad; dq <= rad; dq++) {
        for (let dr = -rad; dr <= rad; dr++) {
          if (Math.max(Math.abs(dq), Math.abs(dr)) !== rad) continue;
          const h = this.at(q + dq, r + dr);
          if (h && pred(h)) return h;
        }
      }
    }
    return null;
  }

  /** Author a starting unit (schema mirrors createUnitAt). Snaps to valid terrain. */
  unit(type, owner, q, r, name) {
    const ok = type === 'ship'
      ? (h) => h.type === 'water'
      : (h) => h.type !== 'water' && h.type !== 'mountain' && h.type !== 'urban' && (h.owner === 0 || h.owner === owner);
    const snap = this.nearestWhere(q, r, 10, ok);
    if (!snap) throw new Error('no valid spawn near ' + q + ',' + r + ' for ' + type);
    q = snap.q; r = snap.r;
    this.unitSeq++;
    const base = {
      type, owner,
      name: name || (type === 'heavy' ? 'Armor Bn.' : type === 'ship' ? 'Flotilla' : type === 'marine' ? 'Marine Coy.' : 'Infantry Coy.'),
      x: q * SPACING + (this.rng() - 0.5) * 10,
      y: r * SPACING + (this.rng() - 0.5) * 10,
      target: null, hp: 100, maxHp: 100,
      manpower: 1000, maxManpower: 1000, tanks: 0, maxTanks: 0,
      selected: false, shake: 0, activeCombatVisual: 0,
      morale: 100, maxMorale: 100, moraleBroken: false,
      xp: 0, kills: 0, losses: 0, tankKills: 0, tankLosses: 0, veteran: false,
      uid: 'mu_' + this.unitSeq,
      speed: 15, damage: 8, range: 50, attackCooldown: 2.0, radius: 12,
    };
    if (type === 'heavy') Object.assign(base, { hp: 300, maxHp: 300, speed: 10, damage: 18, range: 60, attackCooldown: 2.8, radius: 16, tanks: 500, maxTanks: 500 });
    if (type === 'ship') Object.assign(base, { hp: 200, maxHp: 200, speed: 25, damage: 14, range: 80, attackCooldown: 2.4, radius: 20, manpower: 5000, maxManpower: 5000 });
    this.entities.push(base);
    return base;
  }

  fort(q, r, owner) {
    const h = this.at(q, r);
    if (!h) return;
    this.fortSeq++;
    this.forts.push({ id: 'mfort_' + this.fortSeq, owner, q, r, x: h.x, y: h.y });
  }

  bridge(q, r, angleRad, owner) {
    this.bridgeSeq++;
    this.bridges.push({
      id: 'mbridge_' + this.bridgeSeq,
      owner: owner || 0,
      x: q * SPACING, y: r * SPACING,
      w: SPACING * 4.8, h: SPACING * 1.22,
      angle: angleRad || 0,
    });
  }

  /** Assign ownership (land AND water, like procedural start splits) by nearest seed within
   *  reach — with low-frequency wobble + per-cell jitter so no frontline is ever a straight
   *  line, then majority-smoothing passes to keep the border organic instead of speckled. */
  claimNations(seeds, maxDist) {
    // Per-seed phase offsets give each nation's border its own waviness.
    const phases = seeds.map(() => this.rng() * Math.PI * 2);
    this.each((h) => {
      if (h.type === 'urban') return; // set by city stamps
      let best = null, bestD = Infinity;
      for (let i = 0; i < seeds.length; i++) {
        const s = seeds[i];
        let d = Math.sqrt((h.q - s.q) * (h.q - s.q) + (h.r - s.r) * (h.r - s.r));
        d += Math.sin(h.q * 0.23 + phases[i]) * 2.2 + Math.cos(h.r * 0.31 + phases[i] * 1.7) * 2.2;
        d += (this.rng() - 0.5) * 3.4;
        if (d < bestD) { bestD = d; best = s; }
      }
      if (best && bestD <= (best.reach != null ? best.reach : maxDist)) h.owner = best.owner;
      else h.owner = 0;
    });
    // Majority smoothing (keeps waviness, removes one-cell speckle).
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    for (let pass = 0; pass < 2; pass++) {
      const changes = [];
      this.each((h) => {
        if (h.type === 'urban') return;
        const counts = {};
        for (const [dq, dr] of dirs) {
          const n = this.at(h.q + dq, h.r + dr);
          if (n && n.owner > 0) counts[n.owner] = (counts[n.owner] || 0) + 1;
        }
        let bestOwner = h.owner, bestCount = counts[h.owner] || 0;
        for (const [ow, c] of Object.entries(counts)) {
          if (c > bestCount) { bestOwner = parseInt(ow, 10); bestCount = c; }
        }
        if (bestOwner !== h.owner && bestCount >= 6) changes.push({ h, owner: bestOwner });
      });
      for (const c of changes) c.h.owner = c.owner;
    }
  }

  /** Nearest same-owner roads (cosmetic + trade routes). */
  buildRoads() {
    const roads = [];
    for (const c1 of this.cities) {
      let nearest = null, best = Infinity;
      for (const c2 of this.cities) {
        if (c1 === c2) continue;
        if (c2.owner !== c1.owner) continue;
        const d = (c1.x - c2.x) ** 2 + (c1.y - c2.y) ** 2;
        if (d < best) { best = d; nearest = c2; }
      }
      if (!nearest) {
        for (const c2 of this.cities) {
          if (c1 === c2) continue;
          const d = (c1.x - c2.x) ** 2 + (c1.y - c2.y) ** 2;
          if (d < best) { best = d; nearest = c2; }
        }
      }
      if (nearest) roads.push({ from: c1, to: nearest });
    }
    return roads;
  }

  /** Ensure every non-water hex the map generated is passable-connected enough: carve hill passes
   *  through mountain walls at the given gate points. */
  gate(q, r, w) {
    for (let dq = -w; dq <= w; dq++) {
      for (let dr = -w; dr <= w; dr++) {
        const h = this.at(q + dq, r + dr);
        if (h && h.type === 'mountain') h.type = 'hill';
      }
    }
  }

  export(opt) {
    const hexList = [];
    for (const h of this.hexes.values()) {
      const rec = { q: h.q, r: h.r, x: h.x, y: h.y, type: h.type, owner: h.owner };
      if (h.cityId) { rec.cityId = h.cityId; rec.urbanVariant = h.urbanVariant || 0; }
      hexList.push(rec);
    }
    return {
      mapSize: this.size,
      mapShape: 'island',
      hexList,
      cities: this.cities,
      roads: this.buildRoads(),
      entities: this.entities,
      forts: this.forts,
      bridges: this.bridges,
      savedStartEconomy: true,
      money: opt.money != null ? opt.money : 10000,
      manpower: opt.manpower != null ? opt.manpower : 5000,
      aiMoneyByOwner: opt.aiMoney || {},
      aiManpowerByOwner: opt.aiManpower || {},
      mission: opt.mission,
      format: 'simple-wars-mission',
      version: 1,
    };
  }
}

function ev(id, name, trigger, popup, reinforcements, pathOrders) {
  return { id, name, once: true, trigger, popup: popup || {}, reinforcements: reinforcements || [], pathOrders: pathOrders || [] };
}

const MISSIONS = [];

/* =========================================================================
 * 01 — FIRST LANDING (easy beach invasion)
 * Player holds a small offshore islet; the enemy island lies east with a
 * long open beach. Land, secure the beach, take both towns.
 * ========================================================================= */
MISSIONS.push(function m01() {
  const b = new MapBuilder(40, 101);
  // Enemy island (east/center)
  b.blob(10, 0, 22, 'grass', { noise: 0.22 });
  b.blob(18, -10, 9, 'forest', { onlyType: 'grass' });
  b.blob(22, 12, 7, 'forest', { onlyType: 'grass' });
  b.blob(26, 0, 5, 'hill', { onlyType: 'grass' });
  b.blob(14, 8, 4, 'swamp', { onlyType: 'grass' });
  // Player staging islet (west)
  b.blob(-28, 2, 6, 'grass', { noise: 0.3 });
  b.roughenCoasts(2);
  b.coastSand(0.95);
  const pBase = b.city(-28, 2, 1, 'Port Vigil', { factory: true, harbor: true });
  const eTown = b.city(8, -6, 2, 'Seabreak', { factory: false, harbor: true });
  const eCap = b.city(20, 4, 2, 'Highmoor', { factory: true, harbor: false });
  b.claimNations([{ q: -28, r: 2, owner: 1, reach: 9 }, { q: 14, r: 0, owner: 2, reach: 40 }]);
  // Player invasion force on/near the islet shore
  for (let i = 0; i < 6; i++) b.unit('marine', 1, -24 + (i % 3), 0 + Math.floor(i / 3) * 2, i === 0 ? '1st Marine Coy.' : null);
  b.unit('heavy', 1, -27, 4, 'Landing Armor');
  b.unit('ship', 1, -19, 2, 'Gunboat Aegis');
  b.unit('ship', 1, -19, 5, 'Gunboat Trident');
  // Enemy garrison
  b.unit('light', 2, 6, -5); b.unit('light', 2, 9, -4); b.unit('light', 2, 19, 3); b.unit('light', 2, 21, 6);
  return {
    file: 'mission_01_first_landing.json',
    entry: { name: '1 · First Landing', description: 'Beach invasion — land on the island and take both towns. (Easy)', aiCount: 1 },
    data: b.export({
      money: 12000, manpower: 6000,
      aiMoney: { 1: 0, 2: 3500 }, aiManpower: { 1: 0, 2: 4000 },
      mission: {
        version: 1, title: 'First Landing', victoryMode: 'domination',
        events: [
          ev('m1_brief', 'Briefing', { type: 'timer', seconds: 1 },
            { title: 'Operation First Landing', body: 'Commander — ferry your marines across the strait and seize the beach. Capture Seabreak and Highmoor to take the island. Your gunboats can soften anything near the shore.', style: 'briefing', kicker: 'Mission 1' }),
          ev('m1_reserves', 'Enemy reserves', { type: 'timer', seconds: 200 },
            { title: 'Enemy reserves inbound', body: 'Island command has called up its reserve battalion. Push hard before they dig in.', style: 'alert' },
            [{ owner: 2, type: 'light', count: 5, anchor: 'faction_city', cityOwner: 2 }]),
          ev('m1_2ndwave', 'Second wave', { type: 'troops_killed', count: 400 },
            { title: 'Second wave ashore', body: 'High command is impressed — a second wave of marines is landing at your staging islet.', style: 'victory' },
            [{ owner: 1, type: 'marine', count: 4, anchor: 'player_city' }]),
        ],
      },
    }),
  };
});

/* =========================================================================
 * 02 — BROTHERS AT WAR (civil war across a river)
 * One nation torn in two. A river splits the continent; two bridges link
 * the loyalist south to the rebel north.
 * ========================================================================= */
MISSIONS.push(function m02() {
  const b = new MapBuilder(40, 202);
  b.rect(-34, -28, 34, 28, 'grass', { noise: 2 });
  // The river (west-east, wavy) — 3 hexes wide
  const river = b.ridge(-40, -2, 40, 2, 1, 'water', { wobble: 2, skipUrban: true });
  // Terrain texture
  b.scatter('forest', 10, 4);
  b.scatter('hill', 6, 3);
  b.scatter('swamp', 4, 2);
  b.blob(-30, -20, 4, 'mountain', { onlyType: 'grass' });
  b.blob(31, 22, 4, 'mountain', { onlyType: 'grass' });
  b.roughenCoasts(2);
  b.coastSand(0.55);
  // South = player (loyalists), North = rebels
  const pCap = b.city(-12, 14, 1, 'Kingsport', { factory: true });
  const pTown = b.city(16, 18, 1, 'Southmarch', { factory: false });
  const eCap = b.city(-10, -14, 2, 'Redhall', { factory: true });
  const eTown = b.city(18, -16, 2, 'Northgate', { factory: false });
  b.claimNations([{ q: 0, r: 16, owner: 1, reach: 60 }, { q: 0, r: -16, owner: 2, reach: 60 }]);
  // Two bridges anchored to wherever the river actually drifted
  const bw = MapBuilder.nearestOn(river, -14, 0);
  const be = MapBuilder.nearestOn(river, 14, 0);
  b.bridge(bw.q, bw.r, Math.PI / 2, 0);
  b.bridge(be.q, be.r, Math.PI / 2, 0);
  // Armies mirror each other
  for (let i = 0; i < 5; i++) b.unit('light', 1, -14 + i * 6, 8);
  b.unit('heavy', 1, -12, 11, 'Loyal Guard Armor');
  for (let i = 0; i < 5; i++) b.unit('light', 2, -14 + i * 6, -8);
  b.unit('heavy', 2, -10, -11, 'Rebel Armor');
  return {
    file: 'mission_02_brothers_at_war.json',
    entry: { name: '2 · Brothers at War', description: 'Civil war — cross the river and crush the rebellion.', aiCount: 1 },
    data: b.export({
      money: 10000, manpower: 5000,
      aiMoney: { 1: 0, 2: 6000 }, aiManpower: { 1: 0, 2: 5000 },
      mission: {
        version: 1, title: 'Brothers at War', victoryMode: 'domination',
        events: [
          ev('m2_brief', 'Briefing', { type: 'timer', seconds: 1 },
            { title: 'Brothers at War', body: 'The northern provinces are in open revolt. Only two bridges span the Greywater — hold them, cross in force, and take Redhall and Northgate.', style: 'briefing', kicker: 'Mission 2' }),
          ev('m2_defect', 'Defectors', { type: 'troops_killed', count: 500 },
            { title: 'Defectors join the crown', body: 'Rebel morale is cracking — a defecting battalion marches under your banner.', style: 'victory' },
            [{ owner: 1, type: 'light', count: 3, anchor: 'player_city' }]),
          ev('m2_conscript', 'Rebel conscription', { type: 'timer', seconds: 300 },
            { title: 'Rebel conscription', body: 'The rebels are pressing farmhands into service. Expect fresh regiments in the north.', style: 'alert' },
            [{ owner: 2, type: 'light', count: 6, anchor: 'faction_city', cityOwner: 2 }]),
        ],
      },
    }),
  };
});

/* =========================================================================
 * 03 — THE MOUNTAIN PASSES (country vs country over a mountain wall)
 * ========================================================================= */
MISSIONS.push(function m03() {
  const b = new MapBuilder(40, 303);
  b.rect(-36, -28, 36, 28, 'grass', { noise: 2 });
  // Central mountain wall (north-south)
  const wall = b.ridge(0, -30, 0, 30, 2, 'mountain', { wobble: 2, skipUrban: true });
  // Two passes carved where the wall actually runs
  const passN = MapBuilder.nearestOn(wall, 0, -12);
  const passS = MapBuilder.nearestOn(wall, 0, 14);
  b.gate(passN.q, passN.r, 2);
  b.gate(passS.q, passS.r, 2);
  b.scatter('forest', 9, 4);
  b.scatter('hill', 8, 3, { where: (h) => Math.abs(h.q) < 12 });
  b.roughenCoasts(2);
  b.coastSand(0.5);
  const pCap = b.city(-20, 0, 1, 'Westhaven', { factory: true });
  const pTown = b.city(-26, -16, 1, 'Millbrook');
  const eCap = b.city(20, 2, 2, 'Ostmark', { factory: true });
  const eTown = b.city(26, -14, 2, 'Eisenfeld', { factory: true });
  b.claimNations([{ q: -20, r: 0, owner: 1, reach: 60 }, { q: 20, r: 0, owner: 2, reach: 60 }]);
  // Enemy forts guarding the passes (their side of each carved gate)
  b.fort(passN.q + 3, passN.r, 2);
  b.fort(passS.q + 3, passS.r, 2);
  for (let i = 0; i < 6; i++) b.unit('light', 1, -16 - (i % 3) * 3, -6 + Math.floor(i / 3) * 8);
  b.unit('heavy', 1, -19, 3, '1st Armor Bn.');
  for (let i = 0; i < 7; i++) b.unit('light', 2, 15 + (i % 3) * 3, -8 + Math.floor(i / 3) * 7);
  b.unit('heavy', 2, 18, 4, 'Ostmark Panzer');
  return {
    file: 'mission_03_mountain_passes.json',
    entry: { name: '3 · The Mountain Passes', description: 'Nation vs nation — force the two fortified passes.', aiCount: 1 },
    data: b.export({
      money: 10000, manpower: 5000,
      aiMoney: { 1: 0, 2: 8000 }, aiManpower: { 1: 0, 2: 6000 },
      mission: {
        version: 1, title: 'The Mountain Passes', victoryMode: 'domination',
        events: [
          ev('m3_brief', 'Briefing', { type: 'timer', seconds: 1 },
            { title: 'The Mountain Passes', body: 'Only two passes cross the Iron Spine, and Ostmark has fortified both. Mass your army, pick a pass, and break through before their economy out-builds yours.', style: 'briefing', kicker: 'Mission 3' }),
          ev('m3_wave1', 'Enemy offensive', { type: 'timer', seconds: 240 },
            { title: 'Ostmark marches', body: 'Enemy columns are moving toward the northern pass.', style: 'alert' },
            [{ owner: 2, type: 'light', count: 5, anchor: 'faction_city', cityOwner: 2 }]),
          ev('m3_wave2', 'Enemy armor', { type: 'timer', seconds: 480 },
            { title: 'Panzer reserve committed', body: 'Ostmark has committed its armored reserve.', style: 'alert' },
            [{ owner: 2, type: 'heavy', count: 2, anchor: 'faction_city', cityOwner: 2 }]),
        ],
      },
    }),
  };
});

/* =========================================================================
 * 04 — ISLE CAMPAIGN (island hopping)
 * ========================================================================= */
MISSIONS.push(function m04() {
  const b = new MapBuilder(40, 404);
  // Player home island SW
  b.blob(-22, 16, 9, 'grass', { noise: 0.3 });
  // Three enemy islands
  b.blob(-6, -14, 8, 'grass', { noise: 0.3 });
  b.blob(20, -8, 8, 'grass', { noise: 0.3 });
  b.blob(16, 18, 7, 'grass', { noise: 0.3 });
  b.blob(-6, -14, 3, 'forest', { onlyType: 'grass' });
  b.blob(20, -8, 3, 'hill', { onlyType: 'grass' });
  b.blob(16, 18, 3, 'forest', { onlyType: 'grass' });
  b.roughenCoasts(2);
  b.coastSand(0.95);
  b.city(-22, 16, 1, 'Anchorhold', { factory: true, harbor: true });
  b.city(-6, -14, 2, 'Coralwatch', { harbor: true });
  b.city(20, -8, 2, 'Palmreach', { harbor: true, factory: true });
  b.city(16, 18, 2, 'Lagoona', { harbor: true });
  b.claimNations([
    { q: -22, r: 16, owner: 1, reach: 12 },
    { q: -6, r: -14, owner: 2, reach: 11 },
    { q: 20, r: -8, owner: 2, reach: 11 },
    { q: 16, r: 18, owner: 2, reach: 10 },
  ]);
  for (let i = 0; i < 6; i++) b.unit('marine', 1, -24 + (i % 3) * 2, 14 + Math.floor(i / 3) * 2);
  b.unit('ship', 1, -14, 12, 'Corvette Kestrel');
  b.unit('ship', 1, -13, 16, 'Corvette Petrel');
  b.unit('light', 2, -6, -12); b.unit('light', 2, 19, -6); b.unit('light', 2, 16, 16);
  b.unit('ship', 2, 4, -2, 'Raider Shark');
  return {
    file: 'mission_04_isle_campaign.json',
    entry: { name: '4 · Isle Campaign', description: 'Island hopping — take three enemy isles with marines and gunboats.', aiCount: 1 },
    data: b.export({
      money: 11000, manpower: 6000,
      aiMoney: { 1: 0, 2: 9000 }, aiManpower: { 1: 0, 2: 6000 },
      mission: {
        version: 1, title: 'Isle Campaign', victoryMode: 'domination',
        events: [
          ev('m4_brief', 'Briefing', { type: 'timer', seconds: 1 },
            { title: 'Isle Campaign', body: 'Three enemy-held isles ring your anchorage. Marines can swim between shores, and your harbor can build more ships. Hop isle to isle — and watch for their raider.', style: 'briefing', kicker: 'Mission 4' }),
          ev('m4_navy', 'Enemy flotilla', { type: 'timer', seconds: 280 },
            { title: 'Enemy flotilla sighted', body: 'An enemy flotilla has slipped anchor to contest the sea lanes.', style: 'alert' },
            [{ owner: 2, type: 'ship', count: 2, anchor: 'faction_city', cityOwner: 2 }]),
          ev('m4_marines', 'Marine reserve', { type: 'troops_killed', count: 600 },
            { title: 'Marine reserve arrives', body: 'Fresh marine companies have arrived at Anchorhold.', style: 'victory' },
            [{ owner: 1, type: 'marine', count: 4, anchor: 'player_city' }]),
        ],
      },
    }),
  };
});

/* =========================================================================
 * 05 — TWO-FRONT GAMBIT (one nation squeezed between two)
 * ========================================================================= */
MISSIONS.push(function m05() {
  const b = new MapBuilder(60, 505);
  b.rect(-54, -40, 54, 40, 'grass', { noise: 3 });
  b.scatter('forest', 16, 5);
  b.scatter('hill', 10, 4);
  b.scatter('swamp', 6, 3);
  // Partial mountain spurs marking the old borders
  const spurW = b.ridge(-22, -44, -20, -6, 2, 'mountain', { wobble: 2, skipUrban: true });
  const spurE = b.ridge(22, 8, 20, 44, 2, 'mountain', { wobble: 2, skipUrban: true });
  const gw = MapBuilder.nearestOn(spurW, -21, -10);
  const ge = MapBuilder.nearestOn(spurE, 21, 12);
  b.gate(gw.q, gw.r, 2);
  b.gate(ge.q, ge.r, 2);
  b.roughenCoasts(2);
  b.coastSand(0.5);
  // Player center
  b.city(0, -6, 1, 'Midgard', { factory: true });
  b.city(-4, 18, 1, 'Southden');
  // West enemy (owner 2)
  b.city(-38, -10, 2, 'Vestmark', { factory: true });
  b.city(-40, 16, 2, 'Greyford');
  // East enemy (owner 3)
  b.city(38, -12, 3, 'Ostravia', { factory: true });
  b.city(40, 14, 3, 'Kalstadt');
  b.claimNations([
    { q: 0, r: 4, owner: 1, reach: 22 },
    { q: -40, r: 2, owner: 2, reach: 26 },
    { q: 40, r: 0, owner: 3, reach: 26 },
  ]);
  for (let i = 0; i < 8; i++) b.unit('light', 1, -8 + (i % 4) * 5, 0 + Math.floor(i / 4) * 9);
  b.unit('heavy', 1, 0, 8, 'Home Guard Armor');
  for (let i = 0; i < 5; i++) b.unit('light', 2, -34 + (i % 3) * 3, -6 + Math.floor(i / 3) * 8);
  for (let i = 0; i < 5; i++) b.unit('light', 3, 34 - (i % 3) * 3, -8 + Math.floor(i / 3) * 8);
  return {
    file: 'mission_05_two_front_gambit.json',
    entry: { name: '5 · Two-Front Gambit', description: 'Two hostile nations, one on each border. Survive, then conquer both.', aiCount: 2 },
    data: b.export({
      money: 12000, manpower: 7000,
      aiMoney: { 1: 0, 2: 8000, 3: 8000 }, aiManpower: { 1: 0, 2: 6000, 3: 6000 },
      mission: {
        version: 1, title: 'Two-Front Gambit', victoryMode: 'domination',
        events: [
          ev('m5_brief', 'Briefing', { type: 'timer', seconds: 1 },
            { title: 'Two-Front Gambit', body: 'Vestmark and Ostravia have both declared war. You cannot win two attritional fronts at once — cripple one neighbor fast, then swing your army to the other border.', style: 'briefing', kicker: 'Mission 5' }),
          ev('m5_west', 'Western push', { type: 'timer', seconds: 300 },
            { title: 'Vestmark mobilizes', body: 'Fresh Vestmark regiments are heading for your western towns.', style: 'alert' },
            [{ owner: 2, type: 'light', count: 5, anchor: 'faction_city', cityOwner: 2 }]),
          ev('m5_east', 'Eastern push', { type: 'timer', seconds: 380 },
            { title: 'Ostravia mobilizes', body: 'Ostravia has answered with a mobilization of its own.', style: 'alert' },
            [{ owner: 3, type: 'light', count: 5, anchor: 'faction_city', cityOwner: 3 }]),
          ev('m5_reserve', 'National reserve', { type: 'time_survived', seconds: 480 },
            { title: 'The nation stands', body: 'You have held both fronts. The national reserve is released to your command.', style: 'victory' },
            [{ owner: 1, type: 'light', count: 4, anchor: 'player_city' }, { owner: 1, type: 'heavy', count: 1, anchor: 'player_city' }]),
        ],
      },
    }),
  };
});

/* =========================================================================
 * 06 — THE GREYWATER CROSSING (fortified river assault)
 * ========================================================================= */
MISSIONS.push(function m06() {
  const b = new MapBuilder(60, 606);
  b.rect(-54, -42, 54, 42, 'grass', { noise: 3 });
  // Great river north-south, 4 wide
  const river = b.ridge(2, -46, -2, 46, 2, 'water', { wobble: 2, skipUrban: true });
  b.scatter('forest', 14, 5);
  b.scatter('hill', 8, 4, { where: (h) => h.q > 8 });
  b.scatter('swamp', 5, 3, { where: (h) => Math.abs(h.q) < 10 });
  b.roughenCoasts(2);
  b.coastSand(0.4);
  b.city(-30, -14, 1, 'Weststrand', { factory: true });
  b.city(-34, 16, 1, 'Lowfield');
  b.city(26, -16, 2, 'Hochburg', { factory: true });
  b.city(32, 14, 2, 'Eastwall', { factory: true });
  b.claimNations([{ q: -30, r: 0, owner: 1, reach: 60 }, { q: 30, r: 0, owner: 2, reach: 60 }]);
  // Three bridges on the river's real course; enemy forts overlooking each east bank
  const bN = MapBuilder.nearestOn(river, 0, -20);
  const bC = MapBuilder.nearestOn(river, 0, 2);
  const bS = MapBuilder.nearestOn(river, 0, 24);
  b.bridge(bN.q, bN.r, 0, 0);
  b.bridge(bC.q, bC.r, 0, 0);
  b.bridge(bS.q, bS.r, 0, 0);
  b.fort(bN.q + 6, bN.r, 2);
  b.fort(bC.q + 6, bC.r, 2);
  b.fort(bS.q + 6, bS.r, 2);
  for (let i = 0; i < 8; i++) b.unit('light', 1, -22 + (i % 4) * 4, -10 + Math.floor(i / 4) * 16);
  b.unit('heavy', 1, -24, 0, '2nd Armor Bn.');
  b.unit('heavy', 1, -20, 4, '5th Armor Bn.');
  for (let i = 0; i < 6; i++) b.unit('light', 2, 8, -22 + i * 9);
  b.unit('heavy', 2, 12, 0, 'Festung Panzer');
  return {
    file: 'mission_06_greywater_crossing.json',
    entry: { name: '6 · The Greywater Crossing', description: 'Force a fortified river line over three defended bridges.', aiCount: 1 },
    data: b.export({
      money: 11000, manpower: 6000,
      aiMoney: { 1: 0, 2: 12000 }, aiManpower: { 1: 0, 2: 8000 },
      mission: {
        version: 1, title: 'The Greywater Crossing', victoryMode: 'domination',
        events: [
          ev('m6_brief', 'Briefing', { type: 'timer', seconds: 1 },
            { title: 'The Greywater Crossing', body: 'Three bridges cross the Greywater, each covered by a fort on the far bank. Feint at one, strike another — and never feed men piecemeal into a fortified crossing.', style: 'briefing', kicker: 'Mission 6' }),
          ev('m6_armor', 'Armored counterattack', { type: 'timer', seconds: 280 },
            { title: 'Enemy armor moving', body: 'Enemy armor has been spotted moving toward the bridges.', style: 'alert' },
            [{ owner: 2, type: 'heavy', count: 2, anchor: 'faction_city', cityOwner: 2 }]),
          ev('m6_supp', 'Fire support', { type: 'troops_killed', count: 900 },
            { title: 'Breakthrough brigade', body: 'The breakthrough brigade is released to exploit your bridgehead.', style: 'victory' },
            [{ owner: 1, type: 'heavy', count: 2, anchor: 'player_city' }, { owner: 1, type: 'light', count: 2, anchor: 'player_city' }]),
          ev('m6_late', 'Enemy levy', { type: 'timer', seconds: 560 },
            { title: 'East bank levy', body: 'Hochburg has raised a citizen levy.', style: 'alert' },
            [{ owner: 2, type: 'light', count: 6, anchor: 'faction_city', cityOwner: 2 }]),
        ],
      },
    }),
  };
});

/* =========================================================================
 * 07 — WINTER CITADEL (mountain fortress assault)
 * ========================================================================= */
MISSIONS.push(function m07() {
  const b = new MapBuilder(60, 707);
  b.rect(-54, -42, 54, 42, 'grass', { noise: 3 });
  b.scatter('forest', 12, 5);
  b.scatter('hill', 12, 4);
  b.roughenCoasts(2);
  b.coastSand(0.4);
  // Fortress mountain ring around the enemy capital (east)
  const cq = 28, cr = 0, R = 13;
  for (let a = 0; a < 360; a += 3) {
    const q = Math.round(cq + Math.cos((a * Math.PI) / 180) * R);
    const r = Math.round(cr + Math.sin((a * Math.PI) / 180) * R * 0.8);
    b.blob(q, r, 2, 'mountain', { noise: 0.3, onlyType: 'grass' });
  }
  // Three gates into the ring
  b.gate(cq - R, cr, 2);
  b.gate(cq + 2, cr - Math.round(R * 0.8), 2);
  b.gate(cq + 3, cr + Math.round(R * 0.8), 2);
  b.city(cq, cr, 2, 'Citadel Karsk', { factory: true, incomeBonus: 4 });
  b.city(6, -20, 2, 'Outpost Verd', { factory: false });
  b.city(-34, -6, 1, 'Fieldcamp Alpha', { factory: true });
  b.city(-28, 18, 1, 'Colddale');
  b.claimNations([{ q: -30, r: 4, owner: 1, reach: 30 }, { q: 24, r: 0, owner: 2, reach: 42 }]);
  // Forts inside each gate
  b.fort(cq - R + 4, cr, 2);
  b.fort(cq + 2, cr - Math.round(R * 0.8) + 4, 2);
  b.fort(cq + 3, cr + Math.round(R * 0.8) - 4, 2);
  for (let i = 0; i < 9; i++) b.unit('light', 1, -30 + (i % 3) * 4, -4 + Math.floor(i / 3) * 7);
  b.unit('heavy', 1, -26, 2, 'Siege Armor A');
  b.unit('heavy', 1, -24, 8, 'Siege Armor B');
  for (let i = 0; i < 5; i++) b.unit('light', 2, cq - 4 + (i % 3) * 3, cr - 3 + Math.floor(i / 3) * 4);
  b.unit('heavy', 2, cq + 2, cr, 'Citadel Guard');
  b.unit('light', 2, 6, -18); b.unit('light', 2, 8, -21);
  return {
    file: 'mission_07_winter_citadel.json',
    entry: { name: '7 · Winter Citadel', description: 'Break into a fortified mountain ring held by a rich garrison.', aiCount: 1 },
    data: b.export({
      money: 12000, manpower: 7000,
      aiMoney: { 1: 0, 2: 15000 }, aiManpower: { 1: 0, 2: 10000 },
      mission: {
        version: 1, title: 'Winter Citadel', victoryMode: 'domination',
        events: [
          ev('m7_brief', 'Briefing', { type: 'timer', seconds: 1 },
            { title: 'Winter Citadel', body: 'Citadel Karsk sits inside a ring of peaks with three narrow gates, each covered by a fort. Take Outpost Verd first to starve their income, then storm a gate with everything at once.', style: 'briefing', kicker: 'Mission 7' }),
          ev('m7_sortie', 'Garrison sortie', { type: 'timer', seconds: 320 },
            { title: 'Sortie from the gates', body: 'The garrison is sallying out of the citadel!', style: 'alert' },
            [{ owner: 2, type: 'light', count: 6, anchor: 'faction_city', cityOwner: 2 }],
            [{ owner: 2, scope: 'reinforcements', x: -34 * SPACING, y: -6 * SPACING }]),
          ev('m7_vets', 'Veteran relief', { type: 'troops_killed', count: 1100 },
            { title: 'Veterans arrive', body: 'A veteran assault group has reached your field camp.', style: 'victory' },
            [{ owner: 1, type: 'heavy', count: 2, anchor: 'player_city' }, { owner: 1, type: 'light', count: 4, anchor: 'player_city' }]),
          ev('m7_late', 'Winter levy', { type: 'timer', seconds: 620 },
            { title: 'Citadel conscription', body: 'Karsk has armed its citizenry.', style: 'alert' },
            [{ owner: 2, type: 'light', count: 6, anchor: 'faction_city', cityOwner: 2 }]),
        ],
      },
    }),
  };
});

/* =========================================================================
 * 08 — THE SHATTERED REALM (four-way civil war / warlords)
 * ========================================================================= */
MISSIONS.push(function m08() {
  const b = new MapBuilder(60, 808);
  b.blob(0, 0, 46, 'grass', { noise: 0.18 });
  b.scatter('forest', 16, 5);
  b.scatter('hill', 10, 4);
  b.scatter('swamp', 7, 3);
  // Crossed mountain spurs carving the realm into quadrants (with gaps)
  const spurA = b.ridge(-36, -30, 34, 28, 2, 'mountain', { wobble: 2, skipUrban: true });
  const spurB = b.ridge(-34, 30, 36, -28, 2, 'mountain', { wobble: 2, skipUrban: true });
  b.gate(0, 0, 4);
  for (const [line, q, r] of [[spurA, -18, -15], [spurA, 18, 15], [spurB, -17, 15], [spurB, 17, -14]]) {
    const g = MapBuilder.nearestOn(line, q, r);
    b.gate(g.q, g.r, 2);
  }
  b.roughenCoasts(2);
  b.coastSand(0.8);
  // Player NW (smallest), warlords NE / SW / SE
  b.city(-26, -16, 1, 'Havenreach', { factory: true });
  b.city(24, -18, 2, 'Wolfkeep', { factory: true });
  b.city(34, -8, 2, 'Fangmoor');
  b.city(-28, 16, 3, 'Ironhollow', { factory: true });
  b.city(-36, 8, 3, 'Bleakden');
  b.city(26, 18, 4, 'Vulture Rock', { factory: true });
  b.city(36, 10, 4, 'Carrion Hill');
  b.claimNations([
    { q: -26, r: -16, owner: 1, reach: 18 },
    { q: 28, r: -14, owner: 2, reach: 22 },
    { q: -30, r: 12, owner: 3, reach: 22 },
    { q: 30, r: 14, owner: 4, reach: 22 },
  ]);
  for (let i = 0; i < 7; i++) b.unit('light', 1, -28 + (i % 4) * 3, -18 + Math.floor(i / 4) * 4);
  b.unit('heavy', 1, -24, -13, 'Haven Guard');
  for (let i = 0; i < 5; i++) b.unit('light', 2, 24 + (i % 3) * 3, -16 + Math.floor(i / 3) * 3);
  for (let i = 0; i < 5; i++) b.unit('light', 3, -30 + (i % 3) * 3, 14 + Math.floor(i / 3) * 3);
  for (let i = 0; i < 5; i++) b.unit('light', 4, 26 + (i % 3) * 3, 16 + Math.floor(i / 3) * 3);
  return {
    file: 'mission_08_shattered_realm.json',
    entry: { name: '8 · The Shattered Realm', description: 'Four-way war of warlords. You start smallest — unify the realm.', aiCount: 3 },
    data: b.export({
      money: 10000, manpower: 6000,
      aiMoney: { 1: 0, 2: 11000, 3: 11000, 4: 11000 }, aiManpower: { 1: 0, 2: 8000, 3: 8000, 4: 8000 },
      mission: {
        version: 1, title: 'The Shattered Realm', victoryMode: 'domination',
        events: [
          ev('m8_brief', 'Briefing', { type: 'timer', seconds: 1 },
            { title: 'The Shattered Realm', body: 'The old kingdom is split between you and three warlords, each richer than you. Let them bleed each other in the middle — expand where they are weakest and unify the realm.', style: 'briefing', kicker: 'Mission 8' }),
          ev('m8_war', 'Warlords mobilize', { type: 'timer', seconds: 360 },
            { title: 'The warlords mobilize', body: 'All three warlords are raising fresh warbands.', style: 'alert' },
            [
              { owner: 2, type: 'light', count: 4, anchor: 'faction_city', cityOwner: 2 },
              { owner: 3, type: 'light', count: 4, anchor: 'faction_city', cityOwner: 3 },
              { owner: 4, type: 'light', count: 4, anchor: 'faction_city', cityOwner: 4 },
            ]),
          ev('m8_rally', 'Militia rally', { type: 'time_survived', seconds: 540 },
            { title: 'The people rally', body: 'Your just rule draws volunteers from across the realm.', style: 'victory' },
            [{ owner: 1, type: 'light', count: 5, anchor: 'player_city' }]),
        ],
      },
    }),
  };
});

/* =========================================================================
 * 09 — IRONSHORE (hard beach invasion vs fortified coast)
 * ========================================================================= */
MISSIONS.push(function m09() {
  const b = new MapBuilder(60, 909);
  // Enemy continent east
  b.rect(2, -42, 54, 42, 'grass', { noise: 2 });
  b.scatter('forest', 12, 5, { where: (h) => h.q > 14 });
  b.scatter('hill', 8, 4, { where: (h) => h.q > 20 });
  const coastRange = b.ridge(34, -46, 34, 46, 1, 'mountain', { wobble: 3, skipUrban: true });
  const g1 = MapBuilder.nearestOn(coastRange, 34, -8);
  const g2 = MapBuilder.nearestOn(coastRange, 34, 20);
  b.gate(g1.q, g1.r, 2); b.gate(g2.q, g2.r, 2);
  // Player staging islands west
  b.blob(-34, -14, 7, 'grass', { noise: 0.3 });
  b.blob(-36, 16, 7, 'grass', { noise: 0.3 });
  b.roughenCoasts(2);
  b.coastSand(0.95);
  b.city(-34, -14, 1, 'Staging North', { factory: true, harbor: true });
  b.city(-36, 16, 1, 'Staging South', { harbor: true });
  b.city(12, -18, 2, 'Ironshore', { factory: true, harbor: true });
  b.city(14, 20, 2, 'Steelport', { factory: true, harbor: true });
  b.city(44, 2, 2, 'Innerland', { factory: true });
  b.claimNations([
    { q: -34, r: -14, owner: 1, reach: 10 },
    { q: -36, r: 16, owner: 1, reach: 10 },
    { q: 24, r: 0, owner: 2, reach: 64 },
  ]);
  // Coastal fort line
  b.fort(6, -24, 2); b.fort(5, -8, 2); b.fort(5, 6, 2); b.fort(6, 22, 2); b.fort(7, 34, 2);
  // Invasion force
  for (let i = 0; i < 8; i++) b.unit('marine', 1, -32 + (i % 4) * 2, -16 + Math.floor(i / 4) * 3, i === 0 ? 'Spearhead Marines' : null);
  for (let i = 0; i < 6; i++) b.unit('marine', 1, -34 + (i % 3) * 2, 14 + Math.floor(i / 3) * 3);
  b.unit('ship', 1, -26, -10, 'Destroyer Vanguard');
  b.unit('ship', 1, -27, 0, 'Destroyer Halberd');
  b.unit('ship', 1, -28, 12, 'Destroyer Corsair');
  // Beach defenders
  for (let i = 0; i < 8; i++) b.unit('light', 2, 8 + (i % 2) * 2, -26 + i * 7);
  b.unit('heavy', 2, 12, -14, 'Coastal Armor A');
  b.unit('heavy', 2, 13, 16, 'Coastal Armor B');
  b.unit('ship', 2, -8, 2, 'Patrol Gunship');
  return {
    file: 'mission_09_ironshore.json',
    entry: { name: '9 · Ironshore', description: 'D-Day. Storm a fortified coast under fire and crack the mainland. (Hard)', aiCount: 1 },
    data: b.export({
      money: 14000, manpower: 9000,
      aiMoney: { 1: 0, 2: 18000 }, aiManpower: { 1: 0, 2: 12000 },
      mission: {
        version: 1, title: 'Ironshore', victoryMode: 'domination',
        events: [
          ev('m9_brief', 'Briefing', { type: 'timer', seconds: 1 },
            { title: 'Operation Ironshore', body: 'The entire coast is fortified and their fleet patrols the strait. Sweep the sea first, pick the weakest stretch of beach, and land both waves together — half-measures die in the surf.', style: 'briefing', kicker: 'Mission 9' }),
          ev('m9_counter1', 'First counterattack', { type: 'timer', seconds: 180 },
            { title: 'Counterattack', body: 'Enemy infantry is converging on the landing beaches.', style: 'alert' },
            [{ owner: 2, type: 'light', count: 6, anchor: 'faction_city', cityOwner: 2 }]),
          ev('m9_armor', 'Armored counterattack', { type: 'timer', seconds: 420 },
            { title: 'Panzers at the beach', body: 'An armored reserve is rolling toward the coast.', style: 'alert' },
            [{ owner: 2, type: 'heavy', count: 3, anchor: 'faction_city', cityOwner: 2 }]),
          ev('m9_wave2', 'Second wave', { type: 'troops_killed', count: 1500 },
            { title: 'Second wave ashore', body: 'Follow-on forces are landing at your staging islands.', style: 'victory' },
            [{ owner: 1, type: 'marine', count: 5, anchor: 'player_city' }, { owner: 1, type: 'ship', count: 1, anchor: 'player_city' }]),
        ],
      },
    }),
  };
});

/* =========================================================================
 * 10 — WORLD AT WAR (finale: three empires vs you)
 * ========================================================================= */
MISSIONS.push(function m10() {
  const b = new MapBuilder(60, 1010);
  b.rect(-54, -42, 54, 42, 'grass', { noise: 3 });
  b.scatter('forest', 18, 5);
  b.scatter('hill', 12, 4);
  b.scatter('swamp', 8, 3);
  // A great lake in the center and two mountain chains
  b.blob(2, 2, 8, 'water', { noise: 0.35 });
  const chainW = b.ridge(-16, -46, -14, -4, 2, 'mountain', { wobble: 2, skipUrban: true });
  const chainE = b.ridge(16, 6, 18, 46, 2, 'mountain', { wobble: 2, skipUrban: true });
  const gwW = MapBuilder.nearestOn(chainW, -15, -22);
  const gwE = MapBuilder.nearestOn(chainE, 17, 26);
  b.gate(gwW.q, gwW.r, 2); b.gate(gwE.q, gwE.r, 2);
  b.roughenCoasts(2);
  b.coastSand(0.5);
  // Player small western republic
  b.city(-40, -2, 1, 'Libertas', { factory: true });
  b.city(-44, 18, 1, 'Freehold');
  // Northern empire (2)
  b.city(6, -30, 2, 'Nordheim', { factory: true });
  b.city(30, -32, 2, 'Frosthold', { factory: true });
  // Eastern empire (3)
  b.city(40, -4, 3, 'Aurelium', { factory: true });
  b.city(44, 16, 3, 'Goldgate', { factory: true });
  // Southern empire (4)
  b.city(0, 32, 4, 'Sunspire', { factory: true });
  b.city(-24, 34, 4, 'Duskfall');
  b.claimNations([
    { q: -42, r: 6, owner: 1, reach: 18 },
    { q: 18, r: -30, owner: 2, reach: 30 },
    { q: 42, r: 6, owner: 3, reach: 26 },
    { q: -10, r: 32, owner: 4, reach: 26 },
  ]);
  for (let i = 0; i < 8; i++) b.unit('light', 1, -42 + (i % 4) * 3, 0 + Math.floor(i / 4) * 5);
  b.unit('heavy', 1, -38, 4, 'Republic Armor');
  b.unit('heavy', 1, -40, 12, 'Republic Guard');
  for (let i = 0; i < 6; i++) b.unit('light', 2, 8 + (i % 3) * 6, -28 + Math.floor(i / 3) * 4);
  b.unit('heavy', 2, 18, -28, 'Nordheim Panzer');
  for (let i = 0; i < 6; i++) b.unit('light', 3, 38 + (i % 3) * 3, -2 + Math.floor(i / 3) * 6);
  b.unit('heavy', 3, 40, 8, 'Aurelian Armor');
  for (let i = 0; i < 6; i++) b.unit('light', 4, -6 + (i % 3) * 6, 30 + Math.floor(i / 3) * 3);
  b.unit('heavy', 4, -12, 32, 'Sunspire Armor');
  return {
    file: 'mission_10_world_at_war.json',
    entry: { name: '10 · World at War', description: 'Finale — three empires against your small republic. (Very hard)', aiCount: 3 },
    data: b.export({
      money: 13000, manpower: 8000,
      aiMoney: { 1: 0, 2: 15000, 3: 18000, 4: 20000 }, aiManpower: { 1: 0, 2: 10000, 3: 12000, 4: 12000 },
      mission: {
        version: 1, title: 'World at War', victoryMode: 'domination',
        events: [
          ev('m10_brief', 'Briefing', { type: 'timer', seconds: 1 },
            { title: 'World at War', body: 'Three empires have carved up the world and yours is next. They will also fight each other — trade land for time, strike where their fronts are thin, and take every city on the map.', style: 'briefing', kicker: 'Final Mission' }),
          ev('m10_north', 'Northern offensive', { type: 'timer', seconds: 260 },
            { title: 'Nordheim marches south', body: 'Nordheim has launched an offensive toward your republic.', style: 'alert' },
            [{ owner: 2, type: 'light', count: 5, anchor: 'faction_city', cityOwner: 2 }],
            [{ owner: 2, scope: 'reinforcements', x: -40 * SPACING, y: -2 * SPACING }]),
          ev('m10_total', 'Total mobilization', { type: 'timer', seconds: 520 },
            { title: 'Total mobilization', body: 'All three empires are conscripting at full tilt.', style: 'alert' },
            [
              { owner: 2, type: 'light', count: 4, anchor: 'faction_city', cityOwner: 2 },
              { owner: 3, type: 'light', count: 4, anchor: 'faction_city', cityOwner: 3 },
              { owner: 4, type: 'light', count: 4, anchor: 'faction_city', cityOwner: 4 },
              { owner: 3, type: 'heavy', count: 1, anchor: 'faction_city', cityOwner: 3 },
            ]),
          ev('m10_allies', 'Allied volunteers', { type: 'troops_killed', count: 2200 },
            { title: 'Volunteers of the free world', body: 'Your defiance has inspired volunteers from every occupied land.', style: 'victory' },
            [{ owner: 1, type: 'light', count: 5, anchor: 'player_city' }, { owner: 1, type: 'heavy', count: 2, anchor: 'player_city' }]),
        ],
      },
    }),
  };
});

/** Land connectivity check (bridges count as crossings): every enemy capital must be
 *  reachable from the player capital for land-route missions. */
function checkLandConnectivity(data, file) {
  const byKey = new Map(data.hexList.map((h) => [h.q + ',' + h.r, h]));
  const bridgeCells = new Set();
  for (const br of data.bridges || []) {
    const bq = Math.round(br.x / SPACING), brr = Math.round(br.y / SPACING);
    const reach = Math.ceil((br.w / SPACING) * 0.75);
    for (let dq = -reach; dq <= reach; dq++) {
      for (let dr = -reach; dr <= reach; dr++) bridgeCells.add((bq + dq) + ',' + (brr + dr));
    }
  }
  const passable = (h, k) => h && h.type !== 'mountain' && (h.type !== 'water' || bridgeCells.has(k));
  const start = data.cities.find((c) => c.owner === 1);
  const seen = new Set([start.q + ',' + start.r]);
  const queue = [start];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    for (const [dq, dr] of dirs) {
      const k = (cur.q + dq) + ',' + (cur.r + dr);
      if (seen.has(k)) continue;
      const h = byKey.get(k);
      if (!passable(h, k)) continue;
      seen.add(k);
      queue.push(h);
    }
  }
  const unreachable = data.cities.filter((c) => c.owner > 1 && !seen.has(c.q + ',' + c.r));
  return unreachable.map((c) => c.name);
}

/* ---------------- write files + manifest ---------------- */
function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = [];
  for (const build of MISSIONS) {
    const m = build();
    // sanity: player owns >= 1 city; every AI owner referenced owns >= 1 city
    const owners = new Set(m.data.cities.map((c) => c.owner));
    if (!owners.has(1)) throw new Error(m.file + ': player owns no city');
    for (const u of m.data.entities) {
      if (u.owner > 1 && !owners.has(u.owner)) throw new Error(m.file + ': unit owner ' + u.owner + ' has no city');
    }
    // sanity: land under every city center
    for (const c of m.data.cities) {
      const hex = m.data.hexList.find((h) => h.q === c.q && h.r === c.r);
      if (!hex || hex.type === 'water') throw new Error(m.file + ': city ' + c.name + ' not on land');
    }
    // sanity: ships on water, land units on land (and standing on friendly/neutral ground)
    const byKey = new Map(m.data.hexList.map((h) => [Math.round(h.x / SPACING) + ',' + Math.round(h.y / SPACING), h]));
    for (const u of m.data.entities) {
      const h = byKey.get(Math.round(u.x / SPACING) + ',' + Math.round(u.y / SPACING));
      if (!h) throw new Error(m.file + ': unit ' + u.uid + ' off map');
      if (u.type === 'ship' && h.type !== 'water') throw new Error(m.file + ': ship ' + u.uid + ' on ' + h.type + ' at ' + h.q + ',' + h.r);
      if (u.type !== 'ship' && (h.type === 'water' || h.type === 'mountain')) throw new Error(m.file + ': ' + u.type + ' ' + u.uid + ' on ' + h.type + ' at ' + h.q + ',' + h.r);
      if (u.type !== 'ship' && h.owner !== 0 && h.owner !== u.owner) throw new Error(m.file + ': ' + u.type + ' ' + u.uid + ' standing on owner-' + h.owner + ' land (unit owner ' + u.owner + ') at ' + h.q + ',' + h.r);
    }
    // Connectivity: every enemy capital reachable over land/bridges — except the naval
    // missions where marines/ships are the intended route.
    const navalMissions = ['mission_01_first_landing.json', 'mission_04_isle_campaign.json', 'mission_09_ironshore.json'];
    if (!navalMissions.includes(m.file)) {
      const cut = checkLandConnectivity(m.data, m.file);
      if (cut.length) throw new Error(m.file + ': cities unreachable by land: ' + cut.join(', '));
    }
    fs.writeFileSync(path.join(OUT_DIR, m.file), JSON.stringify(m.data));
    manifest.push({
      id: m.file.replace(/\.json$/, ''),
      name: m.entry.name,
      description: m.entry.description,
      file: m.file,
      aiCount: m.entry.aiCount,
    });
    console.log('wrote', m.file, Math.round(fs.statSync(path.join(OUT_DIR, m.file)).size / 1024) + 'KB',
      'cities:', m.data.cities.length, 'units:', m.data.entities.length);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify({ missions: manifest }, null, 2) + '\n');
  console.log('manifest written with', manifest.length, 'missions');
}

main();
