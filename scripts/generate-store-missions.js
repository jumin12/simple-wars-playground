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
 * Continents (not an island): southern England fills the north edge of the map;
 * Normandy / France fills the south; the English Channel is a continuous sea belt
 * between them. Cotentin juts north into the Channel; beaches west→east:
 *   Utah · Pointe du Hoc · Omaha · Gold · Juno · Sword
 *
 * Assault waves start in the Channel just off their beaches (landing craft).
 * German 7th Army has no navy — Atlantic Wall + inland panzer reserve only.
 */
function buildNormandyDDay() {
  const b = new MapBuilder(72, 19440606);
  const SP = 27;

  /** Place a land unit on Channel water (landing craft / LCT approach). */
  function assaultAfloat(type, owner, q, r, name) {
    const snap = b.nearestWhere(q, r, 14, (h) => h.type === 'water');
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

  // Full continental rectangle, then carve Channel + Atlantic.
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

  // English Channel belt between England (north) and France (south).
  b.each((h) => {
    if (h.r >= -28 && h.r <= -2) h.type = 'water';
  });
  b.ensureWater(0, -16, 22);
  b.ensureWater(-30, -14, 12);
  b.ensureWater(30, -14, 12);

  // Southern England — full northern continent to the map edge.
  b.rect(-55, -55, 55, -28, 'grass', { noise: 1.8 });
  b.each((h) => {
    if (h.r <= -28 && h.type === 'water') h.type = 'grass';
  });
  for (let i = 0; i < 10; i++) {
    b.blob(Math.round(-40 + b.rng() * 80), Math.round(-48 + b.rng() * 14), 2 + b.rng() * 3, 'forest', {
      noise: 0.4,
    });
  }

  // France / Normandy — southern continent to the map edge.
  b.rect(-50, 2, 55, 55, 'grass', { noise: 2.0 });
  b.each((h) => {
    if (h.r >= 2 && h.type === 'water') h.type = 'grass';
  });

  // Cotentin peninsula north into the Channel.
  b.blob(-40, -10, 12, 'grass', { noise: 0.3 });
  b.blob(-42, -18, 8, 'grass', { noise: 0.28 });
  b.blob(-36, -2, 8, 'grass', { noise: 0.28 });
  b.ensureLand(-42, -18, 5);
  b.ensureLand(-40, -10, 4);
  b.ensureLand(-36, -2, 4);
  b.ensureLand(-32, 4, 3);
  // Atlantic west of Cotentin.
  b.each((h) => {
    if (h.q < -50 && h.type !== 'urban') h.type = 'water';
  });
  b.ensureWater(-54, -12, 7);
  b.ensureWater(-52, -2, 6);

  // Baie du Grand Vey.
  b.blob(-22, 0, 5, 'water', { noise: 0.35 });
  b.blob(-20, 5, 4, 'water', { noise: 0.3 });
  b.ensureWater(-24, -1, 3);
  b.ensureWater(-18, 3, 3);

  // Keep open Channel (except Cotentin land).
  b.ensureWater(0, -12, 16);
  b.ensureWater(20, -10, 8);
  b.ensureWater(-10, -10, 6);

  // Beaches.
  b.rect(-36, -2, -28, 2, 'sand', { noise: 1.1 });
  b.blob(-18, -1, 3, 'hill', { noise: 0.18 });
  b.blob(-18, 1, 2, 'mountain', { noise: 0.12 });
  b.rect(-20, -2, -16, 2, 'sand', { noise: 0.8 });
  b.rect(-12, -2, 0, 2, 'sand', { noise: 1.0 });
  b.blob(-8, 3, 2.4, 'hill', { noise: 0.2 });
  b.blob(-4, 3, 2.2, 'hill', { noise: 0.2 });
  b.rect(2, -2, 12, 2, 'sand', { noise: 1.0 });
  b.rect(14, -2, 22, 2, 'sand', { noise: 1.0 });
  b.rect(24, -2, 34, 2, 'sand', { noise: 1.0 });

  // Carentan marshes.
  b.blob(-24, 8, 5, 'swamp', { noise: 0.4 });
  b.blob(-22, 12, 4, 'swamp', { noise: 0.35 });
  b.blob(-28, 10, 3, 'swamp', { noise: 0.3 });

  // Vire & Orne.
  b.ridge(-24, 8, -10, 4, 1, 'water', { wobble: 2.2, skipUrban: true });
  b.ridge(24, 14, 32, 0, 1, 'water', { wobble: 1.8, skipUrban: true });
  b.ridge(28, 12, 34, 0, 0, 'water', { wobble: 1.2, skipUrban: true });

  // Bocage west / thinner east.
  for (let i = 0; i < 16; i++) {
    b.blob(
      Math.round(-42 + b.rng() * 24),
      Math.round(-6 + b.rng() * 28),
      1.6 + b.rng() * 2.4,
      'forest',
      { noise: 0.45 }
    );
  }
  for (let i = 0; i < 8; i++) {
    b.blob(
      Math.round(-12 + b.rng() * 16),
      Math.round(10 + b.rng() * 20),
      1.8 + b.rng() * 2.0,
      'forest',
      { noise: 0.4 }
    );
  }
  for (let i = 0; i < 4; i++) {
    b.blob(
      Math.round(12 + b.rng() * 26),
      Math.round(10 + b.rng() * 20),
      1.2 + b.rng() * 1.5,
      'forest',
      { noise: 0.35 }
    );
  }

  b.landCorridor(-40, -16, -34, 2, 1);
  b.landCorridor(-34, 2, -24, 10, 1);
  b.landCorridor(-24, 10, -10, 18, 1);
  b.landCorridor(-8, 4, 6, 8, 1);
  b.landCorridor(6, 8, 24, 14, 1);
  b.landCorridor(24, 14, 30, 26, 1);
  b.landCorridor(-32, 0, -30, 4, 1);
  b.landCorridor(-6, 1, -4, 6, 1);
  b.landCorridor(8, 1, 6, 8, 1);
  b.landCorridor(18, 1, 20, 8, 1);
  b.landCorridor(30, 1, 26, 12, 1);

  b.roughenCoasts(2, 0.2);
  b.coastSand(0.85);

  // Re-assert Channel after roughen: water between England and France except Cotentin.
  b.each((h) => {
    if (h.type === 'urban') return;
    const cotentinLand = h.q >= -48 && h.q <= -28 && h.r >= -20 && h.r <= 2 && h.type !== 'water';
    if (h.r >= -24 && h.r <= -3) {
      if (cotentinLand) return;
      if (h.type === 'sand' && h.r >= -3) return;
      h.type = 'water';
    }
  });
  b.blob(-40, -12, 9, 'grass', { noise: 0.25 });
  b.blob(-42, -18, 6, 'grass', { noise: 0.22 });
  b.ensureLand(-42, -18, 4);
  b.ensureLand(-40, -10, 3);
  b.each((h) => {
    if (h.q < -50 && h.type !== 'urban') h.type = 'water';
  });
  // Beaches again after Channel wipe.
  b.rect(-36, -2, -28, 2, 'sand', { noise: 0.9 });
  b.rect(-20, -2, -16, 2, 'sand', { noise: 0.7 });
  b.rect(-12, -2, 0, 2, 'sand', { noise: 0.9 });
  b.rect(2, -2, 12, 2, 'sand', { noise: 0.9 });
  b.rect(14, -2, 22, 2, 'sand', { noise: 0.9 });
  b.rect(24, -2, 34, 2, 'sand', { noise: 0.9 });
  b.blob(-18, 0, 2.5, 'hill', { noise: 0.15 });
  b.coastSand(0.45);

  // England must stay land to the north edge.
  b.each((h) => {
    if (h.r <= -28 && h.type === 'water') h.type = 'grass';
  });
  // France must stay land to the south edge.
  b.each((h) => {
    if (h.r >= 4 && h.type === 'water' && h.q > -48) {
      // keep rivers/marshes; only fill accidental Channel bleed
      if (h.r < 6 && Math.abs(h.q) < 40) return;
    }
    if (h.r >= 8 && h.type === 'water' && !(h.q > -28 && h.q < -16) && !(h.q > 20 && h.q < 36)) {
      // leave authored rivers; fill random ponds far inland
      if (b.rng() < 0.15) h.type = 'grass';
    }
  });

  // Cities.
  b.city(-12, -40, 1, 'Portsmouth', { factory: true, harbor: true, incomeBonus: 50 });
  b.city(8, -42, 1, 'Southampton', { factory: true, harbor: true, incomeBonus: 30 });
  b.city(-30, -38, 1, 'Plymouth', { factory: false, harbor: true });
  b.city(28, -40, 1, 'Dover', { factory: false, harbor: true });

  b.city(-42, -16, 2, 'Cherbourg', { factory: true, harbor: true, incomeBonus: 40 });
  b.city(-38, -6, 2, 'Valognes', { factory: false });
  b.city(-32, 2, 2, 'Sainte-Mère-Église', { factory: false });
  b.city(-24, 10, 2, 'Carentan', { factory: false });
  b.city(-6, 4, 2, 'Isigny-sur-Mer', { factory: false });
  b.city(-10, 18, 2, 'Saint-Lô', { factory: true });
  b.city(6, 8, 2, 'Bayeux', { factory: false });
  b.city(24, 14, 2, 'Caen', { factory: true, incomeBonus: 30 });
  b.city(32, 2, 2, 'Ouistreham', { factory: false, harbor: true });
  b.city(30, 26, 2, 'Falaise', { factory: true });

  // Ownership: England Allied, France German, Channel open, beaches contested.
  b.each((h) => {
    if (h.type === 'urban') return;
    if (h.r <= -28) {
      h.owner = h.type === 'water' ? 0 : 1;
      return;
    }
    if (h.type === 'water') {
      h.owner = 0;
      return;
    }
    if (h.type === 'sand' && h.r >= -3 && h.r <= 3) {
      h.owner = 0;
      return;
    }
    h.owner = 2;
  });
  for (const c of b.cities) {
    for (const h of b.hexes.values()) {
      if (h.cityId === c.id) h.owner = c.owner;
    }
  }

  // Atlantic Wall.
  b.fort(-34, -1, 2);
  b.fort(-30, 0, 2);
  b.fort(-32, 1, 2);
  b.fort(-18, 0, 2);
  b.fort(-10, 0, 2);
  b.fort(-6, 1, 2);
  b.fort(-2, 1, 2);
  b.fort(0, 2, 2);
  b.fort(4, 0, 2);
  b.fort(8, 1, 2);
  b.fort(12, 1, 2);
  b.fort(16, 0, 2);
  b.fort(20, 1, 2);
  b.fort(26, 0, 2);
  b.fort(30, 1, 2);
  b.fort(34, 2, 2);
  b.fort(-44, -14, 2);
  b.fort(-40, -18, 2);

  // Allied assault waves IN THE CHANNEL just off each beach.
  for (let i = 0; i < 5; i++) {
    assaultAfloat('marine', 1, -34 + (i % 3), -6 - Math.floor(i / 3), i === 0 ? '4th Inf. Div. (Utah)' : null);
  }
  assaultAfloat('heavy', 1, -32, -7, '70th Tank Bn. (DD)');
  for (let i = 0; i < 4; i++) {
    assaultAfloat('marine', 1, -4 + (i % 2), -6 - Math.floor(i / 2), i === 0 ? '1st Inf. Div. (Omaha)' : null);
  }
  for (let i = 0; i < 4; i++) {
    assaultAfloat('marine', 1, -10 + (i % 2), -6 - Math.floor(i / 2), i === 0 ? '29th Inf. Div. (Omaha)' : null);
  }
  assaultAfloat('heavy', 1, -8, -7, '741st Tank Bn. (DD)');
  assaultAfloat('heavy', 1, -4, -7, '743rd Tank Bn.');
  assaultAfloat('marine', 1, -18, -5, '2nd Ranger Bn. (Pointe du Hoc)');
  for (let i = 0; i < 4; i++) {
    assaultAfloat('marine', 1, 6 + (i % 2), -6 - Math.floor(i / 2), i === 0 ? '50th Inf. Div. (Gold)' : null);
  }
  assaultAfloat('heavy', 1, 8, -7, '8th Armoured Bde.');
  assaultAfloat('marine', 1, 10, -5, '47 Royal Marine Commando');
  for (let i = 0; i < 4; i++) {
    assaultAfloat('marine', 1, 16 + (i % 2), -6 - Math.floor(i / 2), i === 0 ? '3rd Cdn Inf. Div. (Juno)' : null);
  }
  assaultAfloat('heavy', 1, 18, -7, '2nd Cdn Armoured Bde.');
  for (let i = 0; i < 4; i++) {
    assaultAfloat('marine', 1, 28 + (i % 2), -6 - Math.floor(i / 2), i === 0 ? '3rd Inf. Div. (Sword)' : null);
  }
  assaultAfloat('heavy', 1, 30, -7, '27th Armoured Bde.');

  // Airborne already inland (night drop).
  b.ensureLand(-36, 0, 2);
  b.ensureLand(-30, 3, 2);
  b.ensureLand(34, 0, 2);
  b.unit('marine', 1, -36, 0, '82nd Airborne Div.');
  b.unit('marine', 1, -38, 1, '505th PIR');
  b.unit('marine', 1, -30, 3, '101st Airborne Div.');
  b.unit('marine', 1, -28, 5, '506th PIR');
  b.unit('marine', 1, 34, 0, '6th Airborne Div.');
  b.unit('marine', 1, 36, 1, '9th Para Bn. (Merville)');

  // Allied navy only.
  b.unit('ship', 1, -32, -10, 'Force U (Utah)');
  b.unit('ship', 1, -8, -11, 'Force O (Omaha)');
  b.unit('ship', 1, 8, -10, 'Force G (Gold)');
  b.unit('ship', 1, 18, -10, 'Force J (Juno)');
  b.unit('ship', 1, 28, -10, 'Force S (Sword)');
  b.unit('ship', 1, -12, -14, 'USS Texas');
  b.unit('ship', 1, -6, -15, 'USS Arkansas');
  b.unit('ship', 1, 4, -14, 'HMS Belfast');
  b.unit('ship', 1, 14, -14, 'HMCS Algonquin');
  b.unit('ship', 1, 24, -14, 'HMS Warspite');
  b.unit('ship', 1, -26, -13, 'USS Nevada');

  // Follow-on in England.
  for (let i = 0; i < 3; i++) b.unit('light', 1, -14 + i, -38, i === 0 ? '1st Corps Reserve' : null);
  b.unit('heavy', 1, -8, -38, 'Guards Armoured Div.');
  b.unit('heavy', 1, 4, -40, '7th Armoured Div. (Desert Rats)');
  b.unit('heavy', 1, -28, -36, '2nd Armored Div. (US)');
  b.unit('light', 1, 2, -40, '51st Highland Div.');

  // German land OOB only — no Kriegsmarine.
  b.ensureLand(-40, -12, 3);
  b.ensureLand(-38, -8, 2);
  b.ensureLand(-44, -12, 2);
  for (let i = 0; i < 4; i++) b.unit('light', 2, -34 + i, 2, i === 0 ? '709th Inf. Div.' : null);
  b.unit('light', 2, -30, 4, '919th Grenadier Regt.');
  b.unit('light', 2, -36, -4, '91st Luftlande Div.');
  b.unit('light', 2, -34, 6, '6th Parachute Regt.');
  b.unit('light', 2, -44, -12, '243rd Inf. Div.');
  b.unit('light', 2, -40, -12, 'Cherbourg Fortress');
  b.unit('light', 2, -38, -14, 'Harbour Defence Bn.');
  for (let i = 0; i < 5; i++) b.unit('light', 2, -10 + i, 4, i === 0 ? '352nd Inf. Div.' : null);
  b.unit('heavy', 2, -6, 6, '352nd Assault Gun Bn.');
  b.unit('light', 2, -8, 8, '916th Grenadier Regt.');
  for (let i = 0; i < 3; i++) b.unit('light', 2, 8 + i * 4, 4, i === 0 ? '716th Inf. Div.' : null);
  b.unit('light', 2, 18, 5, '736th Grenadier Regt.');
  b.unit('light', 2, 28, 4, '441st Ost Bn.');
  b.unit('heavy', 2, 26, 18, '21st Panzer Div.');
  b.unit('heavy', 2, 22, 20, '22nd Panzer Regt.');
  b.unit('light', 2, 24, 12, '192nd Panzergrenadier');
  b.unit('light', 2, 28, 10, '125th Panzergrenadier');
  b.unit('light', 2, -12, 16, 'LXXXIV Corps HQ');
  b.unit('light', 2, 8, 10, 'Bayeux Garrison');
  b.unit('light', 2, 32, 24, 'Falaise Depot');

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
              body: '0530, 6 June 1944. Your assault divisions are in the transport area just off the Norman coast. England holds the north shore of the Channel; France the south. H-Hour: Utah 0630, British/Canadian beaches 0725. Airborne dropped overnight — link up after you are ashore. The Kriegsmarine will not contest the crossing; the Wall and 21st Panzer will.',
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
              body: 'Warspite, Texas, Belfast and the bombardment groups open on the Atlantic Wall. Landing craft are forming up — drive for the beach exits the moment the ramps drop.',
              style: 'alert',
            },
            [],
            [{ owner: 1, scope: 'all', x: 0, y: 120 }]
          ),
          ev(
            'dday_hhour',
            'H-Hour',
            { type: 'timer', seconds: 90 },
            {
              title: 'H-Hour',
              body: '0630 Utah / 0725 Gold–Juno–Sword. First waves hit the shingle. Get off the beaches — every minute under the bluff guns costs a company.',
              style: 'alert',
            }
          ),
          ev(
            'dday_omaha',
            'Omaha crisis',
            { type: 'timer', seconds: 180 },
            {
              title: 'Bloody Omaha',
              body: 'V Corps is pinned on Dog and Easy Red. The 352nd Infantry — not the static troops intelligence expected — owns the draws. Blow the wire, take Vierville and St-Laurent, or the lodgement dies in the surf.',
              style: 'alert',
            },
            [{ owner: 2, type: 'light', count: 5, anchor: 'faction_city', cityOwner: 2 }]
          ),
          ev(
            'dday_airborne',
            'Airborne confirmed',
            { type: 'timer', seconds: 300 },
            {
              title: 'Airborne bridgeheads',
              body: 'Sainte-Mère-Église is in American hands. 101st is fighting the causeways to Carentan; 6th Airborne still holds the Orne bridges and the Merville battery. Push inland and join them.',
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
              body: '21st Panzer Division — the only German armour released on D-Day morning — is counter-attacking from Caen toward the Juno–Sword gap and the sea at Lion-sur-Mer. Hold the beachhead.',
              style: 'alert',
            },
            [
              { owner: 2, type: 'heavy', count: 3, anchor: 'faction_city', cityOwner: 2 },
              { owner: 2, type: 'light', count: 5, anchor: 'faction_city', cityOwner: 2 },
            ],
            [{ owner: 2, scope: 'reinforcements', x: 450, y: -300 }]
          ),
          ev(
            'dday_mulberry',
            'Mulberry',
            { type: 'troops_killed', count: 2200 },
            {
              title: 'Mulberry harbours',
              body: 'Phoenix caissons are going in off Omaha (Mulberry A) and Arromanches (Mulberry B). Follow-on divisions can unload — bring 7th Armoured and US 2nd Armored across before 12th SS and Panzer Lehr arrive from the east.',
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
              body: 'Bradley orders VII Corps north. Seal the Cotentin at its base, then take Valognes and Cherbourg before the fortress garrison wrecks the only deep-water port the Allies will have until Antwerp.',
              style: 'briefing',
            },
            [{ owner: 1, type: 'marine', count: 4, anchor: 'player_city' }],
            [{ owner: 1, scope: 'reinforcements', x: -1000, y: -150 }]
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
