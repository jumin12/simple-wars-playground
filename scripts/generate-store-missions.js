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

  // —— Thin southern England (NOT a massive northern continent) ——
  b.each((h) => {
    if (h.r < -28) h.type = 'water';
  });
  b.rect(-42, -26, 42, -18, 'grass', { noise: 1.4 });
  b.each((h) => {
    if (h.r >= -26 && h.r <= -18 && h.type === 'water') h.type = 'grass';
  });
  b.each((h) => {
    if (h.type === 'urban') return;
    if (h.r >= -28 && h.r < -26) {
      const wob = Math.sin(h.q * 0.1) * 1.5;
      if (h.r < -26.5 + wob) h.type = 'water';
      else if (h.type === 'water') h.type = 'grass';
    }
    if (h.r >= -20 && h.r <= -18) {
      const wob = Math.sin(h.q * 0.12) * 1.2 + (b.rng() - 0.5);
      if (h.r > -19.0 + wob) h.type = 'sand';
    }
  });
  for (let i = 0; i < 6; i++) {
    b.blob(Math.round(-30 + b.rng() * 60), Math.round(-25 + b.rng() * 5), 1.8 + b.rng() * 2, 'forest', {
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

  // Vire & Orne (inland only).
  b.ridge(-24, 8, -10, 5, 1, 'water', { wobble: 2.0, skipUrban: true });
  b.ridge(24, 14, 32, 3, 1, 'water', { wobble: 1.6, skipUrban: true });

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
  // Thin England only: r in [-26, -18] land; north of that stays water.
  b.each((h) => {
    if (h.type === 'urban') return;
    if (h.r < -28) {
      h.type = 'water';
      return;
    }
    if (h.r >= -26 && h.r <= -18) {
      if (h.type === 'water') h.type = 'grass';
      return;
    }
    const cotentin = h.q >= -50 && h.q <= -26 && h.r >= -10 && h.r <= 2;
    if (h.r >= -17 && h.r <= -1) {
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
  // Re-assert thin England strip; keep far north water.
  b.each((h) => {
    if (h.type === 'urban') return;
    if (h.r < -28) h.type = 'water';
    else if (h.r >= -26 && h.r <= -18 && h.type === 'water') h.type = 'grass';
  });
  b.each((h) => {
    if (h.r < -22 || h.r > -18 || h.type === 'urban') return;
    const wob = Math.sin(h.q * 0.12) * 1.2;
    if (h.r > -19.0 + wob) h.type = 'sand';
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

  // Flood accidental mid-Channel land (not Cotentin).
  b.each((h) => {
    if (h.type === 'urban' || h.type === 'water') return;
    if (h.r >= -16 && h.r <= -2) {
      const cotentin = h.q >= -50 && h.q <= -26 && h.r >= -10;
      if (!cotentin) h.type = 'water';
    }
  });
  // Final England size lock: only the thin strip.
  b.each((h) => {
    if (h.type === 'urban') return;
    if (h.r < -28) h.type = 'water';
    if (h.r >= -26 && h.r <= -18 && h.type === 'water') h.type = 'grass';
  });

  // Cities — England on the thin strip; Brittany towns on the west.
  b.city(-10, -22, 1, 'Portsmouth', { factory: true, harbor: true, incomeBonus: 50 });
  b.city(8, -23, 1, 'Southampton', { factory: true, harbor: true, incomeBonus: 30 });
  b.city(-26, -21, 1, 'Plymouth', { factory: false, harbor: true });
  b.city(24, -22, 1, 'Dover', { factory: false, harbor: true });

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
  dropZone(34, 5, 3);
  b.unit('marine', 1, -36, 5, '82nd Airborne Div.');
  b.unit('marine', 1, -38, 6, '505th PIR');
  b.unit('marine', 1, -30, 6, '101st Airborne Div.');
  b.unit('marine', 1, -28, 8, '506th PIR');
  b.unit('marine', 1, 34, 5, '6th Airborne Div.');
  b.unit('marine', 1, 36, 6, '9th Para Bn. (Merville)');

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
              title: 'Only panzers in sector',
              body: '21st Panzer is counter-attacking from Caen toward the Juno–Sword gap. German armour is moving — meet them as you choose.',
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
  if (!data.cities || data.cities.length < 4) throw new Error(m.file + ': too few cities');
}

function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const missions = [buildNormandyDDay()];
  const manifest = { maps: [], missions: [] };
  // Preserve any legacy skirmish maps key for older clients.
  const existingPath = path.join(OUT_DIR, 'manifest.json');
  if (fs.existsSync(existingPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
      if (Array.isArray(prev.maps)) manifest.maps = prev.maps.filter((m) => m && m.id && m.id !== 'normandy-dday');
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
