/**
 * Generates purchasable store missions into custom-maps/*.json.
 * Uses the same MapBuilder / procedural terrain as generate-missions.js.
 *
 * Run: node scripts/generate-store-missions.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'custom-maps');
const SRC = path.join(__dirname, 'generate-missions.js');

/** Load MapBuilder + ev from generate-missions.js without running main(). */
function loadToolkit() {
  let src = fs.readFileSync(SRC, 'utf8');
  src = src.replace(/\nmain\(\);\s*$/, '\n');
  src += '\nglobalThis.__WOD_MapBuilder = MapBuilder;\nglobalThis.__WOD_ev = ev;\n';
  const sandbox = {
    require,
    module: { exports: {} },
    exports: {},
    console,
    __dirname,
    __filename: SRC,
    process,
    Buffer,
    setTimeout,
    clearTimeout,
    globalThis: {},
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(src, sandbox, { filename: 'generate-missions.js' });
  return {
    MapBuilder: sandbox.__WOD_MapBuilder || sandbox.globalThis.__WOD_MapBuilder,
    ev: sandbox.__WOD_ev || sandbox.globalThis.__WOD_ev,
  };
}

const { MapBuilder, ev } = loadToolkit();
if (!MapBuilder || !ev) throw new Error('Could not load MapBuilder/ev from generate-missions.js');

/**
 * Operation Overlord — Normandy, 6 June 1944.
 *
 * Thin southern England across the Channel from Normandy/Brittany France;
 * Cotentin juts north into the Channel; beaches west→east:
 *   Utah · Pointe du Hoc · Omaha · Gold · Juno · Sword
 *
 * Assault waves start in the Channel just off their beaches (landing craft).
 * German 7th Army has no navy — Atlantic Wall + inland panzer reserve only.
 */
function buildNormandyDDay() {
  const b = new MapBuilder(72, 19440606);
  const SP = 27;

  /** Place a land unit on Channel water (landing craft / LCT approach).
   *  Just off the beaches (r in [-6,-2]) — never on sand/land. */
  function assaultAfloat(type, owner, q, r, name) {
    const snap = b.nearestWhere(
      q,
      r,
      12,
      (h) => h.type === 'water' && h.r <= -2 && h.r >= -7 && h.q > -30 && h.q < 48
    );
    if (!snap) throw new Error('no Channel water near ' + q + ',' + r + ' for ' + (name || type));
    q = snap.q;
    r = snap.r;
    b.unitSeq++;
    const base = {
      type,
      owner,
      name:
        name ||
        (type === 'heavy' ? 'Armor Bn.' : type === 'marine' ? 'Marine Coy.' : 'Infantry Coy.'),
      x: q * SP + (b.rng() - 0.5) * 10,
      y: r * SP + (b.rng() - 0.5) * 10,
      target: null,
      hp: 100,
      maxHp: 100,
      manpower: 1000,
      maxManpower: 1000,
      tanks: 0,
      maxTanks: 0,
      selected: false,
      shake: 0,
      activeCombatVisual: 0,
      morale: 100,
      maxMorale: 100,
      moraleBroken: false,
      xp: 0,
      kills: 0,
      losses: 0,
      tankKills: 0,
      tankLosses: 0,
      veteran: false,
      uid: 'mu_' + b.unitSeq,
      speed: 15,
      damage: 8,
      range: 50,
      attackCooldown: 2.0,
      radius: 12,
    };
    if (type === 'heavy') {
      Object.assign(base, {
        hp: 300,
        maxHp: 300,
        speed: 10,
        damage: 18,
        range: 60,
        attackCooldown: 2.8,
        radius: 16,
        tanks: 500,
        maxTanks: 500,
      });
    }
    b.entities.push(base);
    return base;
  }

  // Full continental rectangle, then carve a hard Channel (England never touches France).
  b.generateBase('rectangle', 1944, {
    waterElevThresh: 0.22,
    sandThresh: 0.3,
    grassThresh: 0.52,
    forestThresh: 0.72,
    mountElevThresh: 0.94,
    moistShift: 0.01,
    forestMoistBoost: 0.04,
    mountainStyle: 'low',
    mountainPeakJitter: 0.04,
    biomeAccent: 'balanced',
  });

  // Layout (axial r increases south):
  //   Open sea north of England
  //   Thin southern England .... r -26 .. -18
  //   Channel .................. r -17 .. -1  (Cotentin west only)
  //   Cotentin tip ............. ~ r=-10
  //   Beaches .................. r 0..2
  //   France / Brittany ........ r >= 1 (extends west)
  b.each((h) => {
    if (h.r >= -17 && h.r <= -1) h.type = 'water';
  });

  // —— Thin southern England (Channel coast strip, organic — not a flat slab) ——
  b.each((h) => {
    if (h.r < -30) h.type = 'water';
  });
  // Core Hampshire / Dorset / Sussex belt.
  b.blob(-8, -22, 16, 'grass', { noise: 0.32 });
  b.blob(10, -23, 14, 'grass', { noise: 0.3 });
  b.blob(-26, -21, 11, 'grass', { noise: 0.28 });
  b.blob(26, -22, 10, 'grass', { noise: 0.28 });
  b.blob(0, -24, 12, 'grass', { noise: 0.26 });
  b.rect(-36, -25, 36, -19, 'grass', { noise: 2.2 });
  // Soft north edge into open sea (not a ruler cut).
  b.each((h) => {
    if (h.type === 'urban') return;
    if (h.r < -28) {
      h.type = 'water';
      return;
    }
    if (h.r >= -28 && h.r <= -25) {
      const wob =
        Math.sin(h.q * 0.09) * 2.2 +
        Math.sin(h.q * 0.21 + 1.3) * 1.1 +
        (b.rng() - 0.5) * 1.4;
      if (h.r < -26.2 + wob) h.type = 'water';
      else if (h.type === 'water') h.type = 'grass';
    }
  });
  // Solent / Isle of Wight bite south of Portsmouth–Southampton.
  b.blob(0, -17, 4.5, 'water', { noise: 0.35 });
  b.blob(-2, -16, 3.2, 'water', { noise: 0.3 });
  b.blob(4, -16, 2.8, 'water', { noise: 0.28 });
  // Isle of Wight remnant south of the Solent.
  b.blob(2, -15, 2.4, 'grass', { noise: 0.2 });
  b.ensureLand(2, -15, 1);
  // South coast sand / chalk cliffs feel.
  b.each((h) => {
    if (h.type === 'urban' || h.type === 'water') return;
    if (h.r < -22 || h.r > -17) return;
    const wob = Math.sin(h.q * 0.11) * 1.4 + Math.sin(h.q * 0.27) * 0.8;
    if (h.r > -19.4 + wob) {
      h.type = b.rng() < 0.22 ? 'hill' : 'sand';
    }
  });
  // Downs / New Forest / Weald patches.
  b.blob(-14, -23, 3.5, 'forest', { noise: 0.3 });
  b.blob(-4, -24, 3.2, 'forest', { noise: 0.28 });
  b.blob(12, -24, 2.8, 'forest', { noise: 0.28 });
  b.blob(-22, -22, 2.4, 'hill', { noise: 0.2 });
  b.blob(18, -23, 2.2, 'hill', { noise: 0.18 });
  for (let i = 0; i < 5; i++) {
    b.blob(Math.round(-28 + b.rng() * 56), Math.round(-25 + b.rng() * 5), 1.5 + b.rng() * 1.8, 'forest', {
      noise: 0.3,
    });
  }
  b.ensureLand(-10, -22, 3);
  b.ensureLand(8, -23, 3);
  b.ensureLand(-26, -21, 2);
  b.ensureLand(24, -22, 2);

  // —— France / Normandy + Brittany (west) ——
  b.rect(-58, 1, 52, 55, 'grass', { noise: 1.8 });
  b.each((h) => {
    if (h.r >= 1 && h.type === 'water') h.type = 'grass';
  });
  // Brittany / western France mass (left side of map).
  b.blob(-52, 12, 14, 'grass', { noise: 0.28 });
  b.blob(-56, 22, 12, 'grass', { noise: 0.26 });
  b.blob(-48, 28, 10, 'grass', { noise: 0.24 });
  b.blob(-54, 6, 8, 'grass', { noise: 0.22 });
  b.ensureLand(-52, 14, 5);
  b.ensureLand(-56, 24, 4);
  b.ensureLand(-48, 8, 3);

  // Cotentin peninsula — west Normandy jutting north into the Channel.
  b.blob(-40, -4, 10, 'grass', { noise: 0.24 });
  b.blob(-42, -8, 6, 'grass', { noise: 0.2 });
  b.blob(-36, 1, 7, 'grass', { noise: 0.22 });
  b.blob(-34, 6, 5, 'grass', { noise: 0.18 });
  b.ensureLand(-42, -8, 3);
  b.ensureLand(-40, -4, 3);
  b.ensureLand(-36, 1, 3);
  b.ensureLand(-32, 5, 3);
  // Cap Cotentin tip ONLY — never touch England.
  b.each((h) => {
    if (h.type === 'urban') return;
    if (h.q >= -50 && h.q <= -26 && h.r < -10) h.type = 'water';
  });

  // Soft Atlantic fringe far west only (keep Brittany land).
  b.each((h) => {
    if (h.type === 'urban') return;
    if (h.q < -64) h.type = 'water';
    if (h.q < -58 && h.r >= -6 && h.r <= 40) {
      const bite = -61 + Math.sin(h.r * 0.15) * 2;
      if (h.q < bite) h.type = 'water';
    }
  });
  b.ensureWater(-66, 8, 4);
  b.ensureWater(-64, 20, 3);

  // Baie du Grand Vey (water gap Cotentin ↔ Bessin / Omaha).
  b.blob(-22, 1, 4.5, 'water', { noise: 0.3 });
  b.blob(-20, 5, 3.5, 'water', { noise: 0.28 });
  b.ensureWater(-24, 0, 2);
  b.ensureWater(-18, 3, 2);

  // Open Channel east of Cotentin (invasion approaches to Omaha–Sword).
  b.ensureWater(0, -8, 12);
  b.ensureWater(18, -8, 8);
  b.ensureWater(-8, -8, 6);
  b.ensureWater(-28, -14, 4); // water north of Cotentin tip toward England

  // Invasion beaches on French Channel shore (r ~ 0..2).
  b.rect(-36, 0, -28, 2, 'sand', { noise: 0.9 }); // Utah
  b.blob(-18, 1, 2.6, 'hill', { noise: 0.16 }); // Pointe du Hoc
  b.blob(-18, 2, 1.8, 'mountain', { noise: 0.1 });
  b.rect(-20, 0, -16, 2, 'sand', { noise: 0.7 });
  b.rect(-12, 0, 0, 2, 'sand', { noise: 0.9 }); // Omaha
  b.blob(-8, 3, 2.2, 'hill', { noise: 0.18 });
  b.blob(-4, 3, 2.0, 'hill', { noise: 0.18 });
  b.rect(2, 0, 12, 2, 'sand', { noise: 0.9 }); // Gold
  b.rect(14, 0, 22, 2, 'sand', { noise: 0.9 }); // Juno
  b.rect(24, 0, 34, 2, 'sand', { noise: 0.9 }); // Sword

  // Carentan marshes.
  b.blob(-24, 8, 4.5, 'swamp', { noise: 0.35 });
  b.blob(-22, 12, 3.5, 'swamp', { noise: 0.3 });
  b.blob(-28, 10, 2.8, 'swamp', { noise: 0.28 });

  // Rivers (historical courses, inland only — re-stamped again after Channel seal).
  // Vire: Saint-Lô → Isigny / Baie du Grand Vey.
  b.ridge(-10, 18, -18, 4, 1, 'water', { wobble: 1.8, skipUrban: true });
  // Douve: Carentan marshes toward Utah / Cotentin base.
  b.ridge(-24, 10, -30, 3, 0, 'water', { wobble: 1.4, skipUrban: true });
  // Orne: Falaise → Caen → Ouistreham (Channel mouth).
  b.ridge(30, 26, 24, 14, 1, 'water', { wobble: 1.5, skipUrban: true });
  b.ridge(24, 14, 32, 2, 1, 'water', { wobble: 1.3, skipUrban: true });
  // Seulles (light): between Bayeux and Caen toward Gold/Juno.
  b.ridge(8, 10, 10, 2, 0, 'water', { wobble: 1.2, skipUrban: true });

  // Bocage.
  for (let i = 0; i < 14; i++) {
    b.blob(
      Math.round(-42 + b.rng() * 22),
      Math.round(2 + b.rng() * 24),
      1.5 + b.rng() * 2.2,
      'forest',
      { noise: 0.4 }
    );
  }
  for (let i = 0; i < 7; i++) {
    b.blob(
      Math.round(-12 + b.rng() * 16),
      Math.round(8 + b.rng() * 18),
      1.6 + b.rng() * 1.8,
      'forest',
      { noise: 0.35 }
    );
  }
  for (let i = 0; i < 4; i++) {
    b.blob(
      Math.round(12 + b.rng() * 24),
      Math.round(8 + b.rng() * 18),
      1.1 + b.rng() * 1.4,
      'forest',
      { noise: 0.3 }
    );
  }

  // Inland corridors (never across Channel).
  b.landCorridor(-52, 14, -40, -4, 1);
  b.landCorridor(-40, -4, -34, 2, 1);
  b.landCorridor(-34, 2, -24, 10, 1);
  b.landCorridor(-24, 10, -10, 18, 1);
  b.landCorridor(-8, 4, 6, 8, 1);
  b.landCorridor(6, 8, 24, 14, 1);
  b.landCorridor(24, 14, 30, 26, 1);

  // Brittany woods.
  for (let i = 0; i < 8; i++) {
    b.blob(
      Math.round(-58 + b.rng() * 14),
      Math.round(8 + b.rng() * 28),
      1.8 + b.rng() * 2.4,
      'forest',
      { noise: 0.35 }
    );
  }

  b.roughenCoasts(1, 0.12);
  b.coastSand(0.5);

  // ===== FINAL Channel seal =====
  // England: keep organic strip; do NOT flood-fill every water cell (preserve Solent).
  // Mid-Channel: water except Cotentin body.
  b.each((h) => {
    if (h.type === 'urban') return;
    if (h.r < -28) {
      h.type = 'water';
      return;
    }
    const cotentin = h.q >= -50 && h.q <= -26 && h.r >= -10 && h.r <= 2;
    if (h.r >= -17 && h.r <= -1) {
      // Keep Isle of Wight / Solent pockets around q~0..6, r~-17..-15
      const solent = h.q >= -4 && h.q <= 8 && h.r >= -17 && h.r <= -14;
      if (solent) return;
      if (cotentin && h.type !== 'water') return;
      h.type = 'water';
    }
  });
  // Re-stamp Cotentin + Brittany after seal.
  b.blob(-40, -4, 8, 'grass', { noise: 0.16 });
  b.blob(-42, -7, 5, 'grass', { noise: 0.14 });
  b.blob(-52, 14, 10, 'grass', { noise: 0.2 });
  b.ensureLand(-42, -7, 3);
  b.ensureLand(-40, -4, 3);
  b.ensureLand(-52, 14, 4);
  // Cap Cotentin tip — Cotentin q-range ONLY.
  b.each((h) => {
    if (h.type === 'urban') return;
    if (h.q >= -50 && h.q <= -26 && h.r < -10) h.type = 'water';
    if (h.q < -64) h.type = 'water';
  });
  // Re-assert England land core (not Solent water).
  b.blob(-8, -22, 12, 'grass', { noise: 0.18 });
  b.blob(10, -23, 10, 'grass', { noise: 0.16 });
  b.blob(-26, -21, 8, 'grass', { noise: 0.16 });
  b.blob(26, -22, 7, 'grass', { noise: 0.16 });
  b.ensureLand(-10, -22, 2);
  b.ensureLand(8, -23, 2);
  b.ensureLand(-26, -21, 2);
  b.ensureLand(24, -22, 2);
  // Solent + Isle of Wight again after England re-stamp.
  b.blob(0, -17, 4.2, 'water', { noise: 0.28 });
  b.blob(-2, -16, 3.0, 'water', { noise: 0.24 });
  b.blob(2, -15, 2.2, 'grass', { noise: 0.16 });
  b.ensureLand(2, -15, 1);
  // South coast sand.
  b.each((h) => {
    if (h.type === 'urban' || h.type === 'water') return;
    if (h.r < -22 || h.r > -17) return;
    const wob = Math.sin(h.q * 0.11) * 1.3;
    if (h.r > -19.2 + wob) h.type = 'sand';
  });
  // Far north stays sea.
  b.each((h) => {
    if (h.type === 'urban') return;
    if (h.r < -28) h.type = 'water';
  });

  // Beaches on French shore only.
  b.rect(-36, 0, -28, 2, 'sand', { noise: 0.7 });
  b.rect(-20, 0, -16, 2, 'sand', { noise: 0.55 });
  b.rect(-12, 0, 0, 2, 'sand', { noise: 0.7 });
  b.rect(2, 0, 12, 2, 'sand', { noise: 0.7 });
  b.rect(14, 0, 22, 2, 'sand', { noise: 0.7 });
  b.rect(24, 0, 34, 2, 'sand', { noise: 0.7 });
  b.blob(-18, 1, 2.2, 'hill', { noise: 0.12 });
  b.coastSand(0.28);

  // Flood accidental mid-Channel land (not Cotentin, not Solent/Wight).
  b.each((h) => {
    if (h.type === 'urban' || h.type === 'water') return;
    if (h.r >= -16 && h.r <= -2) {
      const cotentin = h.q >= -50 && h.q <= -26 && h.r >= -10;
      const wight = h.q >= -2 && h.q <= 6 && h.r >= -16 && h.r <= -14;
      if (!cotentin && !wight) h.type = 'water';
    }
  });

  // Re-stamp rivers AFTER seal/beaches so Channel wipe cannot erase them.
  b.ridge(-10, 18, -18, 4, 1, 'water', { wobble: 1.6, skipUrban: true }); // Vire
  b.ridge(-24, 10, -30, 3, 0, 'water', { wobble: 1.2, skipUrban: true }); // Douve
  b.ridge(30, 26, 24, 14, 1, 'water', { wobble: 1.3, skipUrban: true }); // Orne upper
  b.ridge(24, 14, 32, 2, 1, 'water', { wobble: 1.1, skipUrban: true }); // Orne to Ouistreham
  b.ridge(8, 10, 10, 2, 0, 'water', { wobble: 1.0, skipUrban: true }); // Seulles
  // Keep Carentan marsh wet.
  b.blob(-24, 8, 3.5, 'swamp', { noise: 0.25 });
  b.blob(-22, 12, 2.8, 'swamp', { noise: 0.22 });

  // Cities — England on the thin strip; Brittany towns on the west.
  b.city(-10, -22, 1, 'Portsmouth', { factory: true, harbor: true, incomeBonus: 50 });
  b.city(8, -23, 1, 'Southampton', { factory: true, harbor: true, incomeBonus: 30 });
  b.city(-26, -21, 1, 'Plymouth', { factory: false, harbor: true });
  // Sussex/Channel port opposite the eastern beaches — Dover is far off this sheet in Kent.
  b.city(24, -22, 1, 'Newhaven', { factory: false, harbor: true });

  b.city(-42, -7, 2, 'Cherbourg', { factory: true, harbor: true, incomeBonus: 40 });
  b.city(-38, -2, 2, 'Valognes', { factory: false });
  b.city(-32, 3, 2, 'Sainte-Mère-Église', { factory: false });
  b.city(-24, 10, 2, 'Carentan', { factory: false });
  b.city(-6, 5, 2, 'Isigny-sur-Mer', { factory: false });
  b.city(-10, 18, 2, 'Saint-Lô', { factory: true });
  b.city(6, 8, 2, 'Bayeux', { factory: false });
  b.city(24, 14, 2, 'Caen', { factory: true, incomeBonus: 30 });
  b.city(32, 3, 2, 'Ouistreham', { factory: false, harbor: true });
  b.city(30, 26, 2, 'Falaise', { factory: true });
  b.city(-54, 16, 2, 'Saint-Malo', { factory: false, harbor: true });
  b.city(-50, 28, 2, 'Rennes', { factory: true });
  b.ensureLand(8, 4, 2);
  b.ensureLand(18, 3, 2);
  b.ensureLand(2, 3, 2);
  b.ensureLand(-10, 3, 2);
  b.city(8, 4, 2, 'Arromanches', { factory: false, harbor: true });
  b.city(18, 3, 2, 'Courseulles-sur-Mer', { factory: false, harbor: true });
  b.city(2, 3, 2, 'Longues-sur-Mer', { factory: false });
  b.city(-10, 3, 2, 'Vierville-sur-Mer', { factory: false });

  // Ownership.
  b.each((h) => {
    if (h.type === 'urban') return;
    if (h.r >= -26 && h.r <= -18) {
      h.owner = h.type === 'water' ? 0 : 1;
      return;
    }
    if (h.type === 'water') {
      h.owner = 0;
      return;
    }
    if (h.type === 'sand' && h.r >= -1 && h.r <= 3) {
      h.owner = 2;
      return;
    }
    h.owner = 2;
  });
  for (const c of b.cities) {
    for (const h of b.hexes.values()) {
      if (h.cityId === c.id) h.owner = c.owner;
    }
  }

  // Atlantic Wall strongpoints.
  const wallForts = [
    [-34, 1], [-30, 1], [-32, 2],
    [-18, 1],
    [-10, 1], [-6, 2], [-2, 2], [0, 2],
    [4, 1], [8, 2], [12, 2],
    [16, 1], [20, 2],
    [26, 1], [30, 2], [34, 2],
    [-44, -5], [-40, -9],
    [-36, -2],
  ];
  for (const [fq, fr] of wallForts) b.fort(fq, fr, 2);

  // German infantry MAN the beach forts.
  function manFort(q, r, name) {
    b.ensureLand(q, r + 1, 1);
    const snap = b.nearestWhere(
      q,
      r,
      4,
      (h) =>
        h.type !== 'water' &&
        h.type !== 'mountain' &&
        h.type !== 'urban' &&
        (h.owner === 0 || h.owner === 2)
    );
    if (snap) b.unit('light', 2, snap.q, snap.r, name || null);
    else b.unit('light', 2, q, r + 1, name || null);
  }
  manFort(-34, 1, '709th Inf. Div.');
  manFort(-30, 1, '919th Grenadier Regt.');
  manFort(-32, 2);
  manFort(-18, 1, 'Pointe du Hoc Battery');
  manFort(-10, 1, '352nd Inf. Div.');
  manFort(-6, 2, '916th Grenadier Regt.');
  manFort(-2, 2);
  manFort(0, 2);
  manFort(4, 1, '716th Inf. Div.');
  manFort(8, 2);
  manFort(12, 2);
  manFort(16, 1, '736th Grenadier Regt.');
  manFort(20, 2);
  manFort(26, 1, '441st Ost Bn.');
  manFort(30, 2);
  manFort(34, 2);
  manFort(8, 2, '726th Grenadier Regt.');
  manFort(2, 3, 'Longues-sur-Mer Battery');

  // Allied assault — shifted RIGHT into open Channel water (east of Cotentin), never on land.
  for (let i = 0; i < 5; i++) {
    assaultAfloat('marine', 1, -26 + (i % 3), -4 - Math.floor(i / 3), i === 0 ? '4th Inf. Div. (Utah)' : null);
  }
  assaultAfloat('heavy', 1, -24, -5, '70th Tank Bn. (DD)');
  for (let i = 0; i < 4; i++) {
    assaultAfloat('marine', 1, -2 + (i % 2), -4 - Math.floor(i / 2), i === 0 ? '1st Inf. Div. (Omaha)' : null);
  }
  for (let i = 0; i < 4; i++) {
    assaultAfloat('marine', 1, -8 + (i % 2), -4 - Math.floor(i / 2), i === 0 ? '29th Inf. Div. (Omaha)' : null);
  }
  assaultAfloat('heavy', 1, -6, -5, '741st Tank Bn. (DD)');
  assaultAfloat('heavy', 1, -2, -5, '743rd Tank Bn.');
  assaultAfloat('marine', 1, -16, -3, '2nd Ranger Bn. (Pointe du Hoc)');
  for (let i = 0; i < 4; i++) {
    assaultAfloat('marine', 1, 8 + (i % 2), -4 - Math.floor(i / 2), i === 0 ? '50th Inf. Div. (Gold)' : null);
  }
  assaultAfloat('heavy', 1, 10, -5, '8th Armoured Bde.');
  assaultAfloat('marine', 1, 12, -3, '47 Royal Marine Commando');
  for (let i = 0; i < 4; i++) {
    assaultAfloat('marine', 1, 18 + (i % 2), -4 - Math.floor(i / 2), i === 0 ? '3rd Cdn Inf. Div. (Juno)' : null);
  }
  assaultAfloat('heavy', 1, 20, -5, '2nd Cdn Armoured Bde.');
  for (let i = 0; i < 4; i++) {
    assaultAfloat('marine', 1, 30 + (i % 2), -4 - Math.floor(i / 2), i === 0 ? '3rd Inf. Div. (Sword)' : null);
  }
  assaultAfloat('heavy', 1, 32, -5, '27th Armoured Bde.');
  assaultAfloat('marine', 1, -22, -6, '90th Inf. Div. (Utah follow-on)');
  assaultAfloat('marine', 1, -14, -3, '5th Ranger Bn.');
  assaultAfloat('heavy', 1, 6, -4, '79th Armoured Div. (Funnies)');
  assaultAfloat('marine', 1, 28, -3, '1st Special Service Bde.');
  assaultAfloat('marine', 1, 34, -3, 'No. 4 Commando');
  assaultAfloat('marine', 1, 16, -3, '48 Royal Marine Commando');
  assaultAfloat('marine', 1, 32, -3, '41 RM Commando');
  assaultAfloat('marine', 1, 14, -3, '46 RM Commando');

  // Airborne inland only (not on beaches). Clear ownership so Allied drops can place.
  function dropZone(q, r, rad) {
    b.ensureLand(q, r, rad);
    for (let dq = -rad; dq <= rad; dq++) {
      for (let dr = -rad; dr <= rad; dr++) {
        const h = b.at(q + dq, r + dr);
        if (!h || h.type === 'water' || h.type === 'urban' || h.type === 'mountain') continue;
        h.owner = 0;
      }
    }
  }
  dropZone(-36, 5, 3);
  dropZone(-30, 6, 3);
  dropZone(-40, 4, 2);
  dropZone(-26, 8, 2);
  dropZone(34, 5, 3);
  dropZone(38, 4, 2);
  dropZone(32, 7, 2);
  b.unit('marine', 1, -36, 5, '82nd Airborne Div.');
  b.unit('marine', 1, -38, 6, '505th PIR');
  b.unit('marine', 1, -40, 4, '507th PIR');
  b.unit('marine', 1, -30, 6, '101st Airborne Div.');
  b.unit('marine', 1, -28, 8, '506th PIR');
  b.unit('marine', 1, -32, 8, '502nd PIR');
  b.unit('marine', 1, -26, 8, '501st PIR');
  b.unit('marine', 1, -34, 7, '508th PIR');
  b.unit('marine', 1, 34, 5, '6th Airborne Div.');
  b.unit('marine', 1, 36, 6, '9th Para Bn. (Merville)');
  b.unit('marine', 1, 32, 7, '7th Para Bn. (Pegasus)');
  b.unit('marine', 1, 36, 8, '6th Airlanding Bde.');
  b.unit('marine', 1, 38, 4, '1st Cdn Para Bn.');

  // Allied navy — behind assault, also shifted right of Cotentin.
  b.unit('ship', 1, -24, -8, 'Force U (Utah)');
  b.unit('ship', 1, -6, -9, 'Force O (Omaha)');
  b.unit('ship', 1, 10, -8, 'Force G (Gold)');
  b.unit('ship', 1, 20, -8, 'Force J (Juno)');
  b.unit('ship', 1, 30, -8, 'Force S (Sword)');
  b.unit('ship', 1, -10, -12, 'USS Texas');
  b.unit('ship', 1, -4, -13, 'USS Arkansas');
  b.unit('ship', 1, 6, -12, 'HMS Belfast');
  b.unit('ship', 1, 16, -12, 'HMCS Algonquin');
  b.unit('ship', 1, 26, -12, 'HMS Warspite');
  b.unit('ship', 1, -20, -11, 'USS Nevada');
  b.unit('ship', 1, -28, -10, 'USS Quincy');
  b.unit('ship', 1, -8, -14, 'USS Augusta');
  b.unit('ship', 1, -2, -11, 'Montcalm');
  b.unit('ship', 1, 8, -10, 'HMS Ajax');
  b.unit('ship', 1, 22, -10, 'HMS Mauritius');
  b.unit('ship', 1, 34, -10, 'HMS Ramillies');
  b.unit('ship', 1, 36, -12, 'HMS Roberts');
  b.unit('ship', 1, 28, -14, 'HMS Rodney');
  b.unit('ship', 1, -22, -10, 'Georges Leygues');

  // Follow-on in thin England.
  function englandPad(q, r) {
    b.ensureLand(q, r, 2);
    for (let dq = -2; dq <= 2; dq++) {
      for (let dr = -2; dr <= 2; dr++) {
        const h = b.at(q + dq, r + dr);
        if (!h || h.type === 'urban' || h.type === 'water' || h.type === 'mountain') continue;
        h.owner = 1;
        if (h.type === 'sand') h.type = 'grass';
      }
    }
  }
  englandPad(-16, -22);
  englandPad(-2, -22);
  englandPad(10, -22);
  englandPad(-22, -20);
  for (let i = 0; i < 3; i++) b.unit('light', 1, -16 + i, -22, i === 0 ? '1st Corps Reserve' : null);
  b.unit('heavy', 1, -2, -22, 'Guards Armoured Div.');
  b.unit('heavy', 1, 10, -22, '7th Armoured Div. (Desert Rats)');
  b.unit('heavy', 1, -22, -20, '2nd Armored Div. (US)');
  b.unit('light', 1, 4, -22, '51st Highland Div.');
  englandPad(-12, -21);
  englandPad(16, -22);
  b.unit('light', 1, -12, -21, 'VII Corps Reserve');
  b.unit('light', 1, 16, -22, '15th (Scottish) Inf. Div.');
  b.unit('heavy', 1, 18, -21, '11th Armoured Div.');
  englandPad(-8, -21);
  b.unit('light', 1, -8, -21, '2nd Inf. Div. (US)');

  // German inland reserves (Wall already manned above).
  b.ensureLand(-40, -4, 2);
  b.ensureLand(-36, 0, 2);
  b.unit('light', 2, -36, 0, '91st Luftlande Div.');
  b.unit('light', 2, -34, 6, '6th Parachute Regt.');
  b.unit('light', 2, -44, -4, '243rd Inf. Div.');
  b.unit('light', 2, -40, -4, 'Cherbourg Fortress');
  b.unit('light', 2, -38, -6, 'Harbour Defence Bn.');
  b.unit('heavy', 2, -6, 7, '352nd Assault Gun Bn.');
  b.unit('heavy', 2, 26, 18, '21st Panzer Div.');
  b.unit('heavy', 2, 22, 20, '22nd Panzer Regt.');
  b.unit('light', 2, 24, 12, '192nd Panzergrenadier');
  b.unit('light', 2, 28, 10, '125th Panzergrenadier');
  b.unit('light', 2, -12, 16, 'LXXXIV Corps HQ');
  b.unit('light', 2, 8, 10, 'Bayeux Garrison');
  b.unit('light', 2, 32, 24, 'Falaise Depot');
  b.unit('light', 2, -52, 18, 'Saint-Malo Garrison');
  b.ensureLand(-8, 8, 1);
  b.ensureLand(40, 6, 2);
  b.ensureLand(16, 12, 1);
  b.ensureLand(-20, 4, 1);
  b.unit('light', 2, -8, 8, '915th Grenadier Regt.');
  b.unit('light', 2, 40, 6, '711th Inf. Div.');
  b.unit('light', 2, 16, 12, 'Schnelle Brigade 30');
  b.unit('light', 2, -20, 4, 'Maisy Battery');
  b.unit('light', 2, 36, 8, '736th Ost Bn.');
  b.fort(40, 5, 2);
  b.ensureLand(-36, -2, 1);
  b.ensureLand(-38, -2, 1);
  b.ensureLand(28, 22, 1);
  b.unit('light', 2, -36, -2, 'Crisbecq Battery');
  b.unit('light', 2, -38, -2, '729th Grenadier Regt.');
  b.unit('heavy', 2, 28, 22, '12th SS Panzer (HJ)');

  return {
    file: 'normandy-dday.json',
    entry: {
      id: 'normandy-dday',
      name: 'D-Day: Normandy',
      description:
        '6 June 1944 — cross the Channel from England, storm Utah–Sword, and break into Normandy. No German navy; the Atlantic Wall and 21st Panzer stand in your way. (One-shot)',
      price: 200,
      file: 'normandy-dday.json',
      aiCount: 1,
      packType: 'oneshot',
    },
    data: b.export({
      money: 30000,
      manpower: 22000,
      aiMoney: { 1: 0, 2: 24000 },
      aiManpower: { 1: 0, 2: 18000 },
      mission: {
        version: 1,
        title: 'Operation Overlord',
        victoryMode: 'domination',
        events: [
          ev(
            'dday_brief',
            'Briefing',
            { type: 'timer', seconds: 1 },
            {
              title: 'Operation Neptune',
              body: '0530, 6 June 1944. Your assault divisions wait just off the Norman beaches — a thin strip of southern England to the north, Normandy and Brittany to the south, open Channel between. H-Hour: Utah 0630, British/Canadian beaches 0725. Issue your own orders when ready.',
              style: 'briefing',
              kicker: 'Store Mission · One-shot',
            }
          ),
          ev(
            'dday_bombardment',
            'Naval bombardment',
            { type: 'timer', seconds: 45 },
            {
              title: 'Shore bombardment',
              body: 'Warspite, Texas, Belfast and the bombardment groups open on the Atlantic Wall. Landing craft are forming up — you choose when and where to send them in.',
              style: 'alert',
            }
          ),
          ev(
            'dday_hhour',
            'H-Hour',
            { type: 'timer', seconds: 90 },
            {
              title: 'H-Hour',
              body: '0630 Utah / 0725 Gold–Juno–Sword. The beaches are still held by German infantry in the strongpoints. Get your waves ashore and off the sand under your own command.',
              style: 'alert',
            }
          ),
          ev(
            'dday_omaha',
            'Omaha crisis',
            { type: 'timer', seconds: 180 },
            {
              title: 'Bloody Omaha',
              body: 'Reports from V Corps: Dog and Easy Red are under the 352nd’s guns. The draws at Vierville and St-Laurent are the only way off — reinforce or redirect as you see fit.',
              style: 'alert',
            },
            [{ owner: 2, type: 'light', count: 4, anchor: 'faction_city', cityOwner: 2 }]
          ),
          ev(
            'dday_airborne',
            'Airborne confirmed',
            { type: 'timer', seconds: 300 },
            {
              title: 'Airborne bridgeheads',
              body: 'Sainte-Mère-Église is reported held. 101st is on the Carentan causeways; 6th Airborne still has the Orne bridges. Link up when your beachheads allow.',
              style: 'victory',
            },
            [
              { owner: 1, type: 'marine', count: 3, anchor: 'player_city' },
              { owner: 1, type: 'ship', count: 1, anchor: 'player_city' },
            ]
          ),
          ev(
            'dday_panzer',
            '21st Panzer',
            { type: 'timer', seconds: 420 },
            {
              title: '21st Panzer — 12th SS on the road',
              body: '21st Panzer is counter-attacking from Caen toward the Juno–Sword gap. Hitlerjugend (12th SS) is leaving Evrecy for the same sector. Meet them as you choose.',
              style: 'alert',
            },
            [
              { owner: 2, type: 'heavy', count: 3, anchor: 'faction_city', cityOwner: 2 },
              { owner: 2, type: 'light', count: 4, anchor: 'faction_city', cityOwner: 2 },
            ],
            [{ owner: 2, scope: 'reinforcements', x: 450, y: -300 }]
          ),
          ev(
            'dday_mulberry',
            'Mulberry',
            { type: 'troops_killed', count: 2200 },
            {
              title: 'Mulberry harbours',
              body: 'Mulberry A and B are going in. Fresh divisions can unload in England’s ports — commit them when you are ready.',
              style: 'victory',
            },
            [
              { owner: 1, type: 'heavy', count: 3, anchor: 'player_city' },
              { owner: 1, type: 'marine', count: 4, anchor: 'player_city' },
              { owner: 1, type: 'light', count: 3, anchor: 'player_city' },
            ]
          ),
          ev(
            'dday_cherbourg',
            'Cherbourg',
            { type: 'time_survived', seconds: 600 },
            {
              title: 'Objective: Cherbourg',
              body: 'Bradley wants VII Corps turned north. Cherbourg’s port is the prize — take Valognes and the fortress on your timetable.',
              style: 'briefing',
            },
            [{ owner: 1, type: 'marine', count: 4, anchor: 'player_city' }]
          ),
        ],
      },
    }),
  };
}


function landUnit(b, type, owner, q, r, name) {
  b.ensureLand(q, r, 1);
  const h = b.at(q, r);
  if (h && h.type !== 'urban' && h.type !== 'water' && h.type !== 'mountain') h.owner = owner;
  return b.unit(type, owner, q, r, name);
}

function fortLine(b, q0, r0, q1, r1, n, owner) {
  for (let i = 0; i < n; i++) {
    const t = n <= 1 ? 0.5 : i / (n - 1);
    const q = Math.round(q0 + (q1 - q0) * t);
    const r = Math.round(r0 + (r1 - r0) * t);
    b.fort(q, r, owner);
  }
}

/**
 * Operation Citadel — Kursk salient, 5 July 1943.
 *
 * North: Model's 9th Army (Orel)  — AI owner 2
 * Center/west: Soviet Central + Voronezh Fronts holding the bulge — player 1
 * South: Hoth's 4th Panzer Army + Kempf (Belgorod / Kharkov) — AI owner 3
 *
 * Axial layout (r increases south, q increases east), ~36°E rail as the spine:
 *   Orel → Ponyri → Fatezh → Kursk → Oboyan → Belgorod → Kharkov
 * Salient nose west at Rylsk / Lgov; Prokhorovka east of the Belgorod–Oboyan road.
 */
function buildKurskCitadel() {
  const b = new MapBuilder(76, 19430705);

  b.generateBase('rectangle', 1943, {
    waterElevThresh: 0.06,
    sandThresh: 0.18,
    grassThresh: 0.58,
    forestThresh: 0.84,
    mountElevThresh: 0.97,
    moistShift: -0.05,
    forestMoistBoost: 0.02,
    mountainStyle: 'low',
    mountainPeakJitter: 0.03,
    biomeAccent: 'balanced',
  });
  b.each((h) => {
    if (h.type === 'water' || h.type === 'sand') h.type = 'grass';
  });

  // Open steppe on the southern face; mixed woodland on the Orel–Ponyri north.
  for (let i = 0; i < 16; i++) {
    b.blob(Math.round(-20 + b.rng() * 40), Math.round(-40 + b.rng() * 18), 2.2 + b.rng() * 2.8, 'forest', {
      noise: 0.35,
    });
  }
  for (let i = 0; i < 7; i++) {
    b.blob(Math.round(-28 + b.rng() * 24), Math.round(-8 + b.rng() * 20), 1.6 + b.rng() * 2.0, 'forest', {
      noise: 0.3,
    });
  }
  // Olkhovatka / Ponyri heights — Model's northern killing ground.
  b.blob(2, -16, 5.5, 'hill', { noise: 0.22 });
  b.blob(6, -20, 4.2, 'hill', { noise: 0.2 });
  b.blob(-2, -18, 3.4, 'hill', { noise: 0.18 });
  // Southern rolling steppe stays mostly grass; a few balkas as swamp.
  b.blob(12, 22, 2.4, 'swamp', { noise: 0.28 });
  b.blob(20, 24, 2.0, 'swamp', { noise: 0.24 });
  b.blob(8, 18, 1.8, 'swamp', { noise: 0.22 });

  // Rivers (historical courses).
  b.ridge(10, -40, 8, -8, 1, 'water', { wobble: 1.6, skipUrban: true }); // Oka / Orel drainage
  b.ridge(-22, 2, 10, 2, 1, 'water', { wobble: 1.8, skipUrban: true }); // Seym through Kursk, west
  b.ridge(10, 2, 26, 4, 0, 'water', { wobble: 1.2, skipUrban: true });
  b.ridge(8, 18, 20, 22, 1, 'water', { wobble: 1.4, skipUrban: true }); // Psel (Oboyan–Prokhorovka)
  b.ridge(10, 34, 6, 46, 1, 'water', { wobble: 1.5, skipUrban: true }); // Northern Donets (Belgorod–Kharkov)
  b.ridge(-8, 28, 8, 32, 0, 'water', { wobble: 1.2, skipUrban: true }); // Vorskla approach

  b.landCorridor(6, -36, 6, -18, 2);
  b.landCorridor(6, -18, 8, 0, 2);
  b.landCorridor(8, 0, 8, 18, 2);
  b.landCorridor(8, 18, 10, 34, 2);
  b.landCorridor(10, 34, 8, 44, 2);
  b.landCorridor(8, 0, -18, 2, 1);
  b.landCorridor(10, 34, 20, 22, 1);

  const seat = (q, r, rad) => {
    b.ensureLand(q, r, rad || 3);
  };
  seat(6, -36, 4);
  seat(6, -20, 3);
  seat(4, -10, 2);
  seat(8, 0, 4);
  seat(8, 16, 3);
  seat(20, 22, 3);
  seat(10, 34, 3);
  seat(8, 44, 4);
  seat(-12, 2, 3);
  seat(-22, 4, 3);
  seat(-16, 16, 3);
  seat(28, 8, 3);
  seat(4, -24, 2);
  seat(8, 30, 2);
  seat(-38, -8, 3);

  b.city(6, -36, 2, 'Orel', { factory: true, incomeBonus: 40 });
  b.city(6, -20, 1, 'Ponyri', { factory: false });
  b.city(4, -24, 1, 'Olkhovatka', { factory: false });
  b.city(4, -10, 1, 'Fatezh', { factory: false });
  b.city(8, 0, 1, 'Kursk', { factory: true, incomeBonus: 50 });
  b.city(8, 16, 1, 'Oboyan', { factory: false });
  b.city(20, 22, 1, 'Prokhorovka', { factory: false });
  b.city(8, 30, 3, 'Tomarovka', { factory: false });
  b.city(10, 34, 3, 'Belgorod', { factory: true, incomeBonus: 20 });
  b.city(8, 44, 3, 'Kharkov', { factory: true, incomeBonus: 40 });
  b.city(-12, 2, 1, 'Lgov', { factory: false });
  b.city(-22, 4, 1, 'Rylsk', { factory: false });
  b.city(-16, 16, 1, 'Sumy', { factory: false });
  b.city(28, 8, 1, 'Stary Oskol', { factory: true });
  b.city(-38, -8, 2, 'Sevsk', { factory: false });

  // Westward Soviet salient: 9th Army on the Orel shoulder, 2nd Army on the
  // Sevsk–Rylsk west face, 4th Panzer / Kempf on the Belgorod–Kharkov south.
  function northFront(q) {
    if (q <= 6) return -6 - 0.435 * (q + 40);
    return -26 + 0.09 * (q - 6);
  }
  function southFront(q) {
    if (q <= 8) return 14 + 0.437 * (q + 24);
    return 28 + 0.2 * (q - 8);
  }
  function westFace(r) {
    return -36 + 0.33 * (r + 8);
  }
  b.each((h) => {
    if (h.type === 'urban') return;
    if (h.type === 'water') {
      h.owner = 0;
      return;
    }
    const wob = Math.sin(h.q * 0.11) * 1.3 + Math.cos(h.r * 0.13) * 1.1;
    if (h.r <= northFront(h.q) + wob) h.owner = 2;
    else if (h.r >= southFront(h.q) + wob * 0.6) h.owner = 3;
    else if (h.q <= westFace(h.r) + wob * 0.4) h.owner = 2;
    else h.owner = 1;
  });
  for (const c of b.cities) {
    for (const h of b.hexes.values()) {
      if (h.cityId === c.id) h.owner = c.owner;
    }
  }

  // Three Soviet defensive belts — north face (13th Army) and south face (6th/7th Guards).
  fortLine(b, -6, -24, 16, -24, 7, 1);
  fortLine(b, -8, -20, 14, -18, 6, 1);
  fortLine(b, -4, -14, 12, -12, 5, 1);
  fortLine(b, -4, 24, 22, 26, 7, 1);
  fortLine(b, -2, 20, 20, 22, 6, 1);
  fortLine(b, 0, 16, 16, 18, 5, 1);
  fortLine(b, -18, -10, -14, 12, 6, 1);

  // —— Central Front (Rokossovsky) on the northern face ——
  landUnit(b, 'light', 1, 6, -22, '13th Army (Pukhov)');
  landUnit(b, 'light', 1, 2, -22, '17th Guards Rifle Corps');
  landUnit(b, 'light', 1, 10, -22, '29th Rifle Corps');
  landUnit(b, 'light', 1, 8, -18, '81st Rifle Div.');
  landUnit(b, 'light', 1, 4, -18, '15th Rifle Div.');
  landUnit(b, 'light', 1, 0, -16, '70th Army');
  landUnit(b, 'light', 1, -4, -14, '65th Army');
  landUnit(b, 'light', 1, 14, -16, '48th Army');
  landUnit(b, 'light', 1, -10, -8, '60th Army');
  landUnit(b, 'heavy', 1, 8, -12, '2nd Tank Army');
  landUnit(b, 'heavy', 1, 4, -12, '16th Tank Corps');
  landUnit(b, 'heavy', 1, 10, -12, '3rd Tank Corps');
  landUnit(b, 'light', 1, 10, -8, 'Central Front HQ');

  // —— Voronezh Front (Vatutin) on the southern face ——
  landUnit(b, 'light', 1, 8, 20, '6th Guards Army');
  landUnit(b, 'light', 1, 4, 22, '22nd Guards Rifle Corps');
  landUnit(b, 'light', 1, 12, 22, '23rd Guards Rifle Corps');
  landUnit(b, 'light', 1, 18, 26, '7th Guards Army');
  landUnit(b, 'light', 1, 22, 28, '24th Guards Rifle Corps');
  landUnit(b, 'light', 1, 14, 18, '69th Army');
  landUnit(b, 'light', 1, -4, 14, '40th Army');
  landUnit(b, 'light', 1, -10, 14, '38th Army');
  landUnit(b, 'heavy', 1, 6, 12, '1st Tank Army (Katukov)');
  landUnit(b, 'heavy', 1, 10, 12, '6th Tank Corps');
  landUnit(b, 'heavy', 1, 2, 12, '31st Tank Corps');
  landUnit(b, 'heavy', 1, 8, 10, '3rd Mechanized Corps');
  landUnit(b, 'light', 1, 8, 4, 'Voronezh Front HQ');

  // Steppe Front (Konev) — strategic reserve east of Kursk; 5th GTA arrives at Prokhorovka by event.
  landUnit(b, 'light', 1, 24, 6, '5th Guards Army');
  landUnit(b, 'light', 1, 28, 10, '33rd Guards Rifle Corps');
  landUnit(b, 'light', 1, 26, 2, '27th Army');
  landUnit(b, 'light', 1, 30, 4, '53rd Army');
  landUnit(b, 'light', 1, 32, 6, '47th Army');
  landUnit(b, 'heavy', 1, 26, 8, '5th Guards Tank Army');
  landUnit(b, 'light', 1, 8, 2, 'Kursk Garrison');
  landUnit(b, 'light', 1, -20, 6, 'Rylsk Garrison');
  landUnit(b, 'light', 1, -14, 16, 'Sumy Garrison');

  // —— 9th Army (Model) from Orel ——
  landUnit(b, 'heavy', 2, 4, -32, '2nd Panzer Div.');
  landUnit(b, 'heavy', 2, 8, -32, '9th Panzer Div.');
  landUnit(b, 'heavy', 2, 2, -30, '18th Panzer Div.');
  landUnit(b, 'heavy', 2, 10, -30, '20th Panzer Div.');
  landUnit(b, 'heavy', 2, 6, -34, '12th Panzer Div.');
  landUnit(b, 'heavy', 2, 8, -36, '4th Panzer Div.');
  landUnit(b, 'heavy', 2, 0, -28, 'sPzAbt 505 (Tigers)');
  landUnit(b, 'heavy', 2, 12, -28, 'sPzJgAbt 653 (Ferdinand)');
  landUnit(b, 'heavy', 2, 14, -28, 'sPzJgAbt 654 (Ferdinand)');
  landUnit(b, 'light', 2, 6, -28, '10th Panzergrenadier');
  landUnit(b, 'light', 2, 0, -32, '78th Sturm Div.');
  landUnit(b, 'light', 2, 12, -32, '86th Inf. Div.');
  landUnit(b, 'light', 2, -2, -30, '292nd Inf. Div.');
  landUnit(b, 'light', 2, 14, -30, '6th Inf. Div.');
  landUnit(b, 'light', 2, 8, -38, '216th Inf. Div.');
  landUnit(b, 'light', 2, 2, -38, '383rd Inf. Div.');
  landUnit(b, 'light', 2, -6, -28, '7th Inf. Div.');
  landUnit(b, 'light', 2, -4, -32, '31st Inf. Div.');
  landUnit(b, 'light', 2, -8, -30, '102nd Inf. Div.');
  landUnit(b, 'light', 2, 6, -40, '9th Army HQ (Model)');
  landUnit(b, 'light', 2, -34, -4, '82nd Inf. Div. (2nd Army)');
  landUnit(b, 'light', 2, -32, 4, '88th Inf. Div. (2nd Army)');
  landUnit(b, 'light', 2, -30, 12, '68th Inf. Div. (2nd Army)');

  // —— 4th Panzer Army (Hoth) + Army Detachment Kempf from Belgorod ——
  landUnit(b, 'heavy', 3, 6, 32, 'Großdeutschland');
  landUnit(b, 'heavy', 3, 4, 34, '3rd Panzer Div.');
  landUnit(b, 'heavy', 3, 8, 34, '11th Panzer Div.');
  landUnit(b, 'heavy', 3, 14, 32, 'LSSAH');
  landUnit(b, 'heavy', 3, 16, 34, 'Das Reich');
  landUnit(b, 'heavy', 3, 18, 32, 'Totenkopf');
  landUnit(b, 'heavy', 3, 22, 36, '6th Panzer Div.');
  landUnit(b, 'heavy', 3, 24, 34, '7th Panzer Div.');
  landUnit(b, 'heavy', 3, 20, 38, '19th Panzer Div.');
  landUnit(b, 'heavy', 3, 12, 36, 'sPzAbt 503 (Tigers)');
  landUnit(b, 'light', 3, 2, 36, '167th Inf. Div.');
  landUnit(b, 'light', 3, 0, 32, '332nd Inf. Div.');
  landUnit(b, 'light', 3, -4, 34, '57th Inf. Div.');
  landUnit(b, 'light', 3, -2, 36, '255th Inf. Div.');
  landUnit(b, 'light', 3, 26, 36, '168th Inf. Div.');
  landUnit(b, 'light', 3, 28, 34, '106th Inf. Div.');
  landUnit(b, 'light', 3, 30, 36, '320th Inf. Div.');
  landUnit(b, 'light', 3, 10, 38, '4th Panzer Army HQ (Hoth)');
  landUnit(b, 'light', 3, 8, 46, 'Kharkov Garrison');
  landUnit(b, 'light', 3, 12, 42, 'Army Det. Kempf');

  return {
    file: 'kursk-citadel.json',
    entry: {
      id: 'kursk-citadel',
      name: 'Kursk: Operation Citadel',
      description:
        '5 July 1943 — hold the Kursk bulge. Model’s 9th Army comes down the Orel–Ponyri rail; Hoth’s 4th Panzer and Kempf come up from Belgorod toward Oboyan and Prokhorovka. (One-shot)',
      price: 200,
      file: 'kursk-citadel.json',
      aiCount: 2,
      packType: 'oneshot',
    },
    data: b.export({
      money: 28000,
      manpower: 26000,
      aiMoney: { 1: 0, 2: 22000, 3: 26000 },
      aiManpower: { 1: 0, 2: 16000, 3: 18000 },
      alliances: [[2, 3]],
      mission: {
        version: 1,
        title: 'Operation Citadel',
        victoryMode: 'domination',
        events: [
          ev(
            'kursk_brief',
            'Briefing',
            { type: 'timer', seconds: 1 },
            {
              title: 'Zitadelle',
              body: '05:00, 5 July 1943. You hold the Kursk salient — Central Front to the north, Voronezh Front to the south, Steppe Front in reserve east of the city. Model is coming from Orel; Hoth and Kempf from Belgorod. Those two German armies are allied and will not fight each other. The belts at Ponyri and Oboyan must hold.',
              style: 'briefing',
              kicker: 'Store Mission · One-shot',
            }
          ),
          ev(
            'kursk_barrage',
            'Opening barrage',
            { type: 'timer', seconds: 40 },
            {
              title: 'Artillery preparation',
              body: 'German guns open on both faces. On the north, Ferdinands of sPzJgAbt 653 are already grinding toward Ponyri. On the south, II SS Panzer Corps is forming for the Oboyan road.',
              style: 'alert',
            }
          ),
          ev(
            'kursk_ponyri',
            'Ponyri',
            { type: 'timer', seconds: 180 },
            {
              title: 'Ponyri — the northern hinge',
              body: '13th Army reports XLI and XLVII Panzer Corps in the second belt. Commit 2nd Tank Army if the Olkhovatka heights start to go.',
              style: 'alert',
            },
            [{ owner: 2, type: 'heavy', count: 2, anchor: 'faction_city', cityOwner: 2 }],
            [{ owner: 2, scope: 'reinforcements', x: 160, y: -480 }]
          ),
          ev(
            'kursk_psel',
            'Psel crossings',
            { type: 'timer', seconds: 320 },
            {
              title: 'II SS on the Psel',
              body: 'Hausser’s corps has punched 6th Guards Army and is reaching for the Psel crossings above Prokhorovka. Katukov’s 1st Tank Army is your first counter-weight.',
              style: 'alert',
            },
            [
              { owner: 3, type: 'heavy', count: 3, anchor: 'faction_city', cityOwner: 3 },
              { owner: 3, type: 'light', count: 3, anchor: 'faction_city', cityOwner: 3 },
            ],
            [{ owner: 3, scope: 'reinforcements', x: 280, y: 520 }]
          ),
          ev(
            'kursk_prokhorovka',
            'Prokhorovka',
            { type: 'timer', seconds: 480 },
            {
              title: '5th Guards Tank Army',
              body: 'Rotmistrov’s 5th Guards Tank Army is releasing from the Steppe Front toward Prokhorovka. Meet II SS on the rolling ground east of the Psel — this is the counter-blow Vatutin asked for.',
              style: 'victory',
            },
            [
              { owner: 1, type: 'heavy', count: 4, anchor: 'faction_city', cityOwner: 1 },
              { owner: 1, type: 'light', count: 3, anchor: 'faction_city', cityOwner: 1 },
            ]
          ),
          ev(
            'kursk_kutuzov',
            'Kutuzov',
            { type: 'troops_killed', count: 2500 },
            {
              title: 'Operation Kutuzov',
              body: 'The northern face is bleeding. Stavka has opened Kutuzov against Orel — if you can take the city, Model’s pincer dies on the rail.',
              style: 'briefing',
            },
            [{ owner: 1, type: 'heavy', count: 2, anchor: 'player_city' }]
          ),
          ev(
            'kursk_rumyantsev',
            'Rumyantsev',
            { type: 'time_survived', seconds: 700 },
            {
              title: 'Hold, then strike south',
              body: 'Citadel has shot its bolt. The prize is now Belgorod and Kharkov. Keep Prokhorovka and the Oboyan road, then drive Army Group South back down the Donets.',
              style: 'briefing',
            },
            [{ owner: 1, type: 'light', count: 4, anchor: 'player_city' }]
          ),
        ],
      },
    }),
  };
}

/**
 * Battle of Midway — 4–7 June 1942.
 *
 * Open Pacific sheet. Midway Atoll (Sand + Eastern Islands) east of center;
 * Kure Atoll to the west. US carriers at Point Luck (northeast). Kidō Butai
 * northwest on bearing ~320°. Invasion / Kondō west; Yamamoto’s Main Body
 * farther west — historically too late if you win the carrier fight.
 */
function buildMidway() {
  const b = new MapBuilder(70, 19420604);

  b.each((h) => {
    h.type = 'water';
    h.owner = 0;
  });

  function paintReef(cq, cr, rx, ry) {
    for (let dq = -Math.ceil(rx + 2); dq <= Math.ceil(rx + 2); dq++) {
      for (let dr = -Math.ceil(ry + 2); dr <= Math.ceil(ry + 2); dr++) {
        const h = b.at(cq + dq, cr + dr);
        if (!h) continue;
        const a = (dq * dq) / (rx * rx) + (dr * dr) / (ry * ry);
        if (a >= 0.88 && a <= 1.08) h.type = 'sand';
      }
    }
  }

  // Midway: thin reef + two solid islands on the south rim (not doughnut land).
  // Sand Island (larger, west) and Eastern Island (smaller, ESE). Ocean distances
  // are compressed; relative bearings match 4 June: US NE, Kido Butai closer NW.
  paintReef(18, 4, 5.4, 3.8);
  b.blob(15, 5, 2.3, 'grass', { noise: 0.16 });
  b.blob(14, 4, 1.7, 'sand', { noise: 0.14 });
  b.blob(21, 6, 1.5, 'grass', { noise: 0.14 });
  b.blob(22, 5, 1.2, 'sand', { noise: 0.12 });
  b.blob(18, 3, 1.8, 'water', { noise: 0.12 });
  // Kure Atoll ~WNW — empty reef, no extra land stamps.
  paintReef(-14, 0, 2.8, 2.0);
  b.blob(-14, 1, 0.8, 'sand', { noise: 0.08 });

  b.city(15, 5, 1, 'Sand Island', { factory: false, harbor: true, incomeBonus: 20 });
  b.city(21, 6, 1, 'Eastern Island', { factory: true, harbor: false, incomeBonus: 10 });

  b.each((h) => {
    if (h.type === 'urban') return;
    if (h.type === 'water') {
      h.owner = 0;
      return;
    }
    const dMid = (h.q - 18) * (h.q - 18) + (h.r - 5) * (h.r - 5);
    h.owner = dMid < 80 ? 1 : 0;
  });
  for (const c of b.cities) {
    for (const h of b.hexes.values()) {
      if (h.cityId === c.id) h.owner = c.owner;
    }
  }

  b.fort(14, 4, 1);
  b.fort(16, 6, 1);
  b.fort(21, 5, 1);

  // Midway garrison — snap onto existing island hexes only (no ensureLand specks).
  b.unit('light', 1, 14, 5, '6th Marine Defense Bn.');
  b.unit('marine', 1, 16, 4, 'VMF-221');
  b.unit('marine', 1, 20, 6, 'VMSB-241');
  b.unit('light', 1, 22, 5, '7th AAF (B-17s)');

  // TF 16 (Spruance) — Point Luck, farther northeast.
  b.unit('ship', 1, 44, -22, 'USS Enterprise');
  b.unit('ship', 1, 46, -24, 'USS Hornet');
  b.unit('ship', 1, 42, -20, 'USS Northampton');
  b.unit('ship', 1, 42, -24, 'USS Vincennes');
  b.unit('ship', 1, 48, -22, 'USS Minneapolis');
  b.unit('ship', 1, 48, -20, 'USS New Orleans');
  b.unit('ship', 1, 46, -20, 'USS Pensacola');
  b.unit('ship', 1, 44, -20, 'USS Atlanta');
  b.unit('ship', 1, 40, -22, 'USS Phelps');
  b.unit('ship', 1, 50, -24, 'USS Balch');
  b.unit('ship', 1, 50, -20, 'USS Maury');

  // TF 17 (Fletcher) — closer than TF 16, still NE of the atoll.
  b.unit('ship', 1, 36, -16, 'USS Yorktown');
  b.unit('ship', 1, 34, -14, 'USS Astoria');
  b.unit('ship', 1, 38, -14, 'USS Portland');
  b.unit('ship', 1, 34, -18, 'USS Hammann');
  b.unit('ship', 1, 38, -16, 'USS Morris');
  b.unit('ship', 1, 32, -16, 'USS Hughes');

  // Patrol line / PT boats off the reef; Nautilus on the approach.
  b.unit('ship', 1, 18, -2, 'MTB Flotilla 1');
  b.unit('ship', 1, 12, 10, 'USS Nautilus');

  // Kidō Butai (Nagumo) — northwest, bearing ~320° from Midway.
  b.unit('ship', 2, -6, -16, 'Akagi');
  b.unit('ship', 2, -2, -18, 'Kaga');
  b.unit('ship', 2, -10, -14, 'Sōryū');
  b.unit('ship', 2, -8, -20, 'Hiryū');
  b.unit('ship', 2, -4, -12, 'Tone');
  b.unit('ship', 2, 0, -14, 'Chikuma');
  b.unit('ship', 2, -8, -12, 'Nagara');
  b.unit('ship', 2, -12, -18, 'Haruna');
  b.unit('ship', 2, 2, -18, 'Kirishima');
  b.unit('ship', 2, -4, -16, 'Arashi');
  b.unit('ship', 2, -6, -22, 'Nowaki');
  b.unit('ship', 2, -2, -22, 'Makigumo');
  b.unit('ship', 2, -10, -22, 'Kazagumo');
  b.unit('ship', 2, -14, -16, 'DesRon 10');

  // Close Support Force (Kurita) — west-southwest with the transports.
  b.unit('ship', 2, -40, 10, 'Mikuma');
  b.unit('ship', 2, -38, 12, 'Mogami');
  b.unit('ship', 2, -42, 8, 'Suzuya');
  b.unit('ship', 2, -36, 8, 'Kumano');
  b.unit('ship', 2, -44, 12, 'Occupation Force');
  b.unit('ship', 2, -42, 14, '2nd Combined SNLF');

  // Midway Invasion / Kondō 2nd Fleet — west-northwest.
  b.unit('ship', 2, -30, -4, 'Atago');
  b.unit('ship', 2, -28, -2, 'Chōkai');
  b.unit('ship', 2, -32, -6, 'Myōkō');
  b.unit('ship', 2, -26, -6, 'Haguro');
  b.unit('ship', 2, -34, -2, 'Kongō');
  b.unit('ship', 2, -26, 0, 'Hiei');
  b.unit('ship', 2, -30, 0, 'Zuihō');

  // Main Body (Yamamoto) — far west; historically out of the 4 June fight.
  b.unit('ship', 2, -56, -8, 'Yamato');
  b.unit('ship', 2, -52, -6, 'Nagato');
  b.unit('ship', 2, -54, -10, 'Mutsu');
  b.unit('ship', 2, -50, -4, 'Hōshō');
  b.unit('ship', 2, 16, 16, 'I-168');

  return {
    file: 'midway-1942.json',
    entry: {
      id: 'midway-1942',
      name: 'Midway',
      description:
        '4 June 1942 — three American carriers at Point Luck, northeast of the atoll. Nagumo’s Kidō Butai is coming down from the northwest. Sink the Japanese carriers. (One-shot)',
      price: 200,
      file: 'midway-1942.json',
      aiCount: 1,
      packType: 'oneshot',
    },
    data: b.export({
      money: 18000,
      manpower: 12000,
      aiMoney: { 1: 0, 2: 16000 },
      aiManpower: { 1: 0, 2: 8000 },
      mission: {
        version: 1,
        title: 'Operation MI',
        victoryMode: 'annihilation',
        events: [
          ev(
            'midway_brief',
            'Briefing',
            { type: 'timer', seconds: 1 },
            {
              title: 'Point Luck',
              body: '04 June 1942. Fletcher in Yorktown and Spruance in Enterprise/Hornet wait northeast of Midway. PBY reports: many planes heading Midway from 320°, 150 miles. The atoll’s MAG-22 and 6th Marines are already at general quarters.',
              style: 'briefing',
              kicker: 'Store Mission · One-shot',
            }
          ),
          ev(
            'midway_strike',
            'Midway under attack',
            { type: 'timer', seconds: 50 },
            {
              title: 'First Midway strike',
              body: 'Nagumo’s first wave is on the atoll. VMF-221 is up. The Japanese carriers will have to re-arm for a second land strike — or for your ships, if they find you.',
              style: 'alert',
            }
          ),
          ev(
            'midway_rearm',
            'Nagumo re-arms',
            { type: 'timer', seconds: 140 },
            {
              title: 'Spotting the decks',
              body: 'Tone’s scout has you. Nagumo is caught between a second Midway strike and a re-arm for ships. This is the window — get your SBDs into the air.',
              style: 'alert',
            }
          ),
          ev(
            'midway_dive',
            'McClusky inbound',
            { type: 'timer', seconds: 240 },
            {
              title: 'Dive bombers inbound',
              body: 'Enterprise and Yorktown dive bombers are reported over the Kidō Butai. Akagi, Kaga and Sōryū are the prize. Hiryū, if she lives, will hit back at Yorktown.',
              style: 'victory',
            }
          ),
          ev(
            'midway_hiryu',
            'Hiryū counterstroke',
            { type: 'timer', seconds: 360 },
            {
              title: 'Hiryū still fights',
              body: 'If Hiryū is still afloat she will throw everything at Yorktown. Screen the carrier. Kondō’s cruisers and the transport group are still to the west.',
              style: 'alert',
            }
          ),
          ev(
            'midway_pursuit',
            'Westward pursuit',
            { type: 'troops_killed', count: 800 },
            {
              title: 'Mikuma and Mogami',
              body: 'The surviving Japanese surface force is retiring west. Mikuma and Mogami collided in the night. Spruance can chase — Yamamoto’s Main Body is still out there in the west.',
              style: 'briefing',
            },
            [{ owner: 1, type: 'ship', count: 1, anchor: 'player_city' }]
          ),
        ],
      },
    }),
  };
}

function validateMission(m) {
  const data = m.data;
  if (!data.mission || !Array.isArray(data.mission.events) || !data.mission.events.length) {
    throw new Error(m.file + ': missing mission events');
  }
  const byKey = new Map();
  for (const h of data.hexList) byKey.set(h.q + ',' + h.r, h);
  for (const u of data.entities) {
    const q = Math.round(u.x / 27);
    const r = Math.round(u.y / 27);
    // Soft check — unit() already snapped; just ensure entities exist.
    if (!u.type || !u.owner) throw new Error(m.file + ': bad unit');
  }
  if (!data.cities || data.cities.length < 2) throw new Error(m.file + ': too few cities');
}

function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const missions = [buildNormandyDDay(), buildKurskCitadel(), buildMidway()];
  const keep = new Set(missions.map((m) => m.entry.id));
  const manifest = { maps: [], missions: [] };
  // Preserve any legacy skirmish maps key for older clients.
  const existingPath = path.join(OUT_DIR, 'manifest.json');
  if (fs.existsSync(existingPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
      if (Array.isArray(prev.maps))
        manifest.maps = prev.maps.filter((m) => m && m.id && !keep.has(m.id));
    } catch (_) { /* ignore */ }
  }

  for (const m of missions) {
    validateMission(m);
    fs.writeFileSync(path.join(OUT_DIR, m.file), JSON.stringify(m.data));
    manifest.missions.push(m.entry);
    // Also list under maps for backward-compatible shop loaders that only read maps[].
    manifest.maps.push({
      id: m.entry.id,
      name: m.entry.name,
      description: m.entry.description,
      price: m.entry.price,
      file: m.entry.file,
      aiCount: m.entry.aiCount,
      packType: m.entry.packType || 'oneshot',
      kind: 'mission',
    });
    console.log(
      'wrote',
      m.file,
      Math.round(fs.statSync(path.join(OUT_DIR, m.file)).size / 1024) + 'KB',
      'cities:',
      m.data.cities.length,
      'units:',
      m.data.entities.length,
      'events:',
      m.data.mission.events.length
    );
  }
  fs.writeFileSync(existingPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log('manifest written with', manifest.missions.length, 'store mission(s)');
}

main();
