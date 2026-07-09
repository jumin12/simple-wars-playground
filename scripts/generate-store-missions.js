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
 * Map axes (game coords): north = English Channel (−r), south = inland France (+r),
 * west = Cotentin / Cherbourg (−q), east = Orne / Sword / Caen (+q).
 *
 * Beach belt west→east along the Channel shore:
 *   Utah (E Cotentin) · Pointe du Hoc · Omaha · Gold · Juno · Sword
 *
 * Player = SHAEF / Allied Expeditionary Force (UK staging + invasion fleet).
 * Enemy  = German 7th Army (LXXXIV Corps + Cherbourg fortress + 21st Panzer).
 */
function buildNormandyDDay() {
  const b = new MapBuilder(72, 19440606);

  // Wide Norman landmass, Channel-open north, Cotentin bias west.
  b.generateBase('island', 1944, {
    islandMode: 'wide',
    centerQ: 2,
    centerR: 16,
    stretchX: 1.72,
    stretchY: 0.68,
    coastNoiseAmp: 0.34,
    waterElevThresh: 0.47,
    sandThresh: 0.33,
    grassThresh: 0.55,
    forestThresh: 0.74,
    mountElevThresh: 0.93,
    moistShift: 0.015,
    forestMoistBoost: 0.05,
    mountainStyle: 'low',
    mountainPeakJitter: 0.05,
    biomeAccent: 'balanced',
  });

  // —— English Channel (entire northern third) ——
  b.each((h) => {
    if (h.r < -10) h.type = 'water';
  });
  b.ensureWater(0, -30, 18);
  b.ensureWater(-24, -26, 10);
  b.ensureWater(24, -26, 10);
  b.ensureWater(-8, -38, 8);
  b.ensureWater(8, -40, 7);

  // —— Cotentin peninsula (Cherbourg tip north into the Channel) ——
  // Real Cotentin juts north; Utah sits on its *east* shore facing the Baie du Grand Vey.
  b.blob(-40, -14, 11, 'grass', { noise: 0.32 });
  b.blob(-42, -22, 7, 'grass', { noise: 0.28 });
  b.blob(-36, -4, 8, 'grass', { noise: 0.3 });
  b.blob(-34, 4, 6, 'grass', { noise: 0.28 });
  b.ensureLand(-42, -20, 5);
  b.ensureLand(-40, -12, 4);
  b.ensureLand(-36, -2, 4);
  b.ensureLand(-32, 4, 3);
  // West Cotentin Atlantic face stays watery (no landing beaches there on D-Day).
  b.ensureWater(-52, -16, 6);
  b.ensureWater(-50, -6, 5);

  // Baie du Grand Vey / Carentan estuary — water gap between Cotentin and Bessin.
  b.blob(-22, 2, 5, 'water', { noise: 0.35 });
  b.blob(-20, 6, 4, 'water', { noise: 0.3 });
  b.ensureWater(-24, 0, 3);
  b.ensureWater(-18, 4, 3);

  // Main Norman mainland (Bessin → Calvados → Caen plain).
  b.rect(-16, 0, 48, 44, 'grass', { noise: 2.2 });
  b.ensureLand(-8, 8, 6);
  b.ensureLand(8, 10, 6);
  b.ensureLand(24, 14, 7);
  b.ensureLand(32, 22, 5);

  // Long invasion beach belt (sand) — Utah on Cotentin east shore, then Omaha→Sword.
  // Utah (east Cotentin)
  b.rect(-36, -6, -28, 0, 'sand', { noise: 1.2 });
  // Pointe du Hoc cliffs (rocky headland between Utah and Omaha)
  b.blob(-18, -3, 3.2, 'hill', { noise: 0.18 });
  b.blob(-18, -1, 2.2, 'mountain', { noise: 0.12 });
  b.rect(-20, -4, -16, 0, 'sand', { noise: 0.8 });
  // Omaha (Vierville → Colleville bluffs)
  b.rect(-12, -4, 0, 1, 'sand', { noise: 1.1 });
  b.blob(-8, 1, 2.5, 'hill', { noise: 0.2 }); // coastal bluffs
  b.blob(-4, 2, 2.2, 'hill', { noise: 0.2 });
  // Gold (Asnelles → Ver-sur-Mer)
  b.rect(2, -3, 12, 1, 'sand', { noise: 1.0 });
  // Juno (Courseulles → Saint-Aubin)
  b.rect(14, -3, 22, 1, 'sand', { noise: 1.0 });
  // Sword (Lion-sur-Mer → Ouistreham)
  b.rect(24, -3, 34, 1, 'sand', { noise: 1.0 });

  // Fill residual Channel-edge water along the beach latitudes with sand (tidal flats).
  b.each((h) => {
    if (h.r < -5 || h.r > 2) return;
    if (h.type !== 'water') return;
    // Keep the Grand Vey / estuary open.
    if (h.q > -26 && h.q < -16) return;
    if (b.rng() > 0.18) h.type = 'sand';
  });

  // Carentan marsh / Prairies Marécageuses (flooded for defense, 1944).
  b.blob(-24, 8, 5, 'swamp', { noise: 0.4 });
  b.blob(-22, 12, 4, 'swamp', { noise: 0.35 });
  b.blob(-28, 10, 3, 'swamp', { noise: 0.3 });

  // River Vire (Carentan → Isigny corridor) and River Orne (Caen → Ouistreham).
  b.ridge(-24, 8, -10, 4, 1, 'water', { wobble: 2.2, skipUrban: true });
  b.ridge(24, 14, 32, 0, 1, 'water', { wobble: 1.8, skipUrban: true });
  // Canal de Caen à la Mer (east bank of Orne — 6th Airborne DZ).
  b.ridge(28, 12, 34, 0, 0, 'water', { wobble: 1.2, skipUrban: true });

  // Bocage hedgerow country: Cotentin + Saint-Lô hinterland (dense forest patches).
  for (let i = 0; i < 14; i++) {
    b.blob(
      Math.round(-40 + b.rng() * 22),
      Math.round(-8 + b.rng() * 28),
      1.6 + b.rng() * 2.4,
      'forest',
      { noise: 0.45 }
    );
  }
  for (let i = 0; i < 10; i++) {
    b.blob(
      Math.round(-14 + b.rng() * 18),
      Math.round(10 + b.rng() * 20),
      1.8 + b.rng() * 2.2,
      'forest',
      { noise: 0.4 }
    );
  }
  // Caen plain stays more open (fewer forests east of Bayeux).
  for (let i = 0; i < 5; i++) {
    b.blob(
      Math.round(10 + b.rng() * 28),
      Math.round(8 + b.rng() * 22),
      1.2 + b.rng() * 1.6,
      'forest',
      { noise: 0.35 }
    );
  }

  // Land corridors so authored cities stay connected over bocage/marsh.
  b.landCorridor(-40, -18, -34, 2, 1);
  b.landCorridor(-34, 2, -24, 10, 1);
  b.landCorridor(-24, 10, -10, 18, 1);
  b.landCorridor(-8, 4, 6, 8, 1);
  b.landCorridor(6, 8, 24, 14, 1);
  b.landCorridor(24, 14, 30, 26, 1);
  b.landCorridor(-6, 4, -10, 18, 1);
  // Beach exits inland
  b.landCorridor(-32, -2, -30, 4, 1);
  b.landCorridor(-6, 0, -4, 6, 1);
  b.landCorridor(8, 0, 6, 8, 1);
  b.landCorridor(18, 0, 20, 8, 1);
  b.landCorridor(30, 0, 26, 12, 1);

  b.roughenCoasts(1, 0.2);
  b.coastSand(0.9);

  // —— Southern England staging (Portsmouth / Southampton / Plymouth) ——
  b.blob(-10, -46, 7, 'grass', { noise: 0.22 });
  b.blob(6, -48, 6, 'grass', { noise: 0.22 });
  b.blob(-28, -44, 5, 'grass', { noise: 0.25 }); // Plymouth / Force U embarkation
  b.ensureLand(-10, -46, 4);
  b.ensureLand(6, -48, 3);
  b.ensureLand(-28, -44, 3);
  b.ensureWater(-10, -38, 3);
  b.ensureWater(6, -40, 3);
  b.ensureWater(-28, -36, 3);

  // —— Cities (historical relative placement) ——
  // England
  b.city(-10, -46, 1, 'Portsmouth', { factory: true, harbor: true, incomeBonus: 50 });
  b.city(6, -48, 1, 'Southampton', { factory: true, harbor: true, incomeBonus: 30 });
  b.city(-28, -44, 1, 'Plymouth', { factory: false, harbor: true });
  // Cotentin
  b.city(-42, -20, 2, 'Cherbourg', { factory: true, harbor: true, incomeBonus: 40 });
  b.city(-38, -8, 2, 'Valognes', { factory: false });
  b.city(-32, 2, 2, 'Sainte-Mère-Église', { factory: false });
  b.city(-24, 10, 2, 'Carentan', { factory: false });
  // Bessin / Calvados
  b.city(-6, 4, 2, 'Isigny-sur-Mer', { factory: false });
  b.city(-10, 18, 2, 'Saint-Lô', { factory: true });
  b.city(6, 8, 2, 'Bayeux', { factory: false });
  b.city(24, 14, 2, 'Caen', { factory: true, incomeBonus: 30 });
  b.city(32, 2, 2, 'Ouistreham', { factory: false, harbor: true });
  b.city(30, 26, 2, 'Falaise', { factory: true });

  // Guarantee walkable beach exits before placing assault waves.
  b.ensureLand(-34, -3, 3);
  b.ensureLand(-8, -2, 3);
  b.ensureLand(8, -1, 3);
  b.ensureLand(18, -1, 3);
  b.ensureLand(30, -1, 3);
  b.ensureLand(-18, -1, 2);
  b.ensureLand(-36, 0, 2);
  b.ensureLand(34, 0, 2);
  // Re-paint sand on those exits so they still read as beaches.
  for (const [q, r] of [[-34, -3], [-32, -2], [-8, -2], [-4, -1], [8, -1], [18, -1], [30, -1]]) {
    const h = b.at(q, r);
    if (h && h.type !== 'urban' && h.type !== 'water') h.type = 'sand';
  }

  b.claimNations([
    { q: -10, r: -46, owner: 1, reach: 11 },
    { q: 6, r: -48, owner: 1, reach: 10 },
    { q: -28, r: -44, owner: 1, reach: 9 },
    { q: 4, r: 16, owner: 2, reach: 78 },
  ]);

  // England seeds can bleed onto the Cotentin — force all French land/water south of the
  // Channel staging gap back to German control, then leave the beach sand contested.
  b.each((h) => {
    if (h.type === 'urban') return;
    // Keep English staging islands Allied.
    if (h.r <= -36) {
      if (h.type !== 'water') h.owner = 1;
      return;
    }
    // Channel water stays neutral / open.
    if (h.type === 'water' && h.r < -6) {
      h.owner = 0;
      return;
    }
    // Invasion beaches: contested (assault waves can stand here).
    if (h.type === 'sand' && h.r >= -5 && h.r <= 2) {
      h.owner = 0;
      return;
    }
    // Rest of Normandy = German 7th Army.
    if (h.r > -36) h.owner = 2;
  });

  // —— Atlantic Wall strongpoints (named sectors) ——
  // Utah / Crisbecq–Azeville area
  b.fort(-34, -4, 2);
  b.fort(-30, -2, 2);
  b.fort(-32, 0, 2);
  // Pointe du Hoc (Ranger objective)
  b.fort(-18, -2, 2);
  // Omaha: WN62 / WN72 style bluff positions (Vierville, St-Laurent, Colleville)
  b.fort(-10, -1, 2);
  b.fort(-6, 0, 2);
  b.fort(-2, 0, 2);
  b.fort(0, 1, 2);
  // Gold: Longues-sur-Mer battery area + Asnelles
  b.fort(4, -1, 2);
  b.fort(8, 0, 2);
  b.fort(12, 0, 2);
  // Juno: Courseulles / Bernières
  b.fort(16, -1, 2);
  b.fort(20, 0, 2);
  // Sword: Lion / Ouistreham / Riva-Bella
  b.fort(26, -1, 2);
  b.fort(30, 0, 2);
  b.fort(34, 1, 2);
  // Cherbourg fortress ring
  b.fort(-44, -18, 2);
  b.fort(-40, -22, 2);

  // —— Allied OOB (assault forces on/near the beaches + fleet offshore) ——
  // Marines must stand on land/sand (not open Channel). Ships stay in water north of the belt.
  // US VII Corps — Utah Beach: 4th Infantry Division (east Cotentin sand)
  for (let i = 0; i < 5; i++) {
    b.unit('marine', 1, -34 + (i % 3), -4 + Math.floor(i / 3) * 2, i === 0 ? '4th Inf. Div. (Utah)' : null);
  }
  b.unit('heavy', 1, -32, -2, '70th Tank Bn. (DD)');
  // 82nd Airborne — west of Merderet / Sainte-Mère-Église
  b.unit('marine', 1, -36, -2, '82nd Airborne Div.');
  b.unit('marine', 1, -38, 0, '505th PIR');
  // 101st Airborne — east toward Carentan exits
  b.unit('marine', 1, -30, 2, '101st Airborne Div.');
  b.unit('marine', 1, -28, 4, '506th PIR');

  // US V Corps — Omaha: 1st ID east, 29th ID west on the bluff beaches
  for (let i = 0; i < 4; i++) {
    b.unit('marine', 1, -4 + (i % 2), -3 + Math.floor(i / 2) * 2, i === 0 ? '1st Inf. Div. (Omaha)' : null);
  }
  for (let i = 0; i < 4; i++) {
    b.unit('marine', 1, -10 + (i % 2), -3 + Math.floor(i / 2) * 2, i === 0 ? '29th Inf. Div. (Omaha)' : null);
  }
  b.unit('heavy', 1, -8, -1, '741st Tank Bn. (DD)');
  b.unit('heavy', 1, -4, -1, '743rd Tank Bn.');
  b.unit('marine', 1, -18, -2, '2nd Ranger Bn. (Pointe du Hoc)');

  // British XXX Corps — Gold: 50th (Northumbrian) + 8th Armoured
  for (let i = 0; i < 4; i++) {
    b.unit('marine', 1, 6 + (i % 2), -2 + Math.floor(i / 2) * 2, i === 0 ? '50th Inf. Div. (Gold)' : null);
  }
  b.unit('heavy', 1, 8, 0, '8th Armoured Bde.');
  b.unit('marine', 1, 10, 1, '47 Royal Marine Commando');

  // Canadian 3rd Infantry — Juno + 2nd Canadian Armoured
  for (let i = 0; i < 4; i++) {
    b.unit('marine', 1, 16 + (i % 2), -2 + Math.floor(i / 2) * 2, i === 0 ? '3rd Cdn Inf. Div. (Juno)' : null);
  }
  b.unit('heavy', 1, 18, 0, '2nd Cdn Armoured Bde.');

  // British I Corps — Sword: 3rd Infantry + 27th Armoured; 6th Airborne east of Orne
  for (let i = 0; i < 4; i++) {
    b.unit('marine', 1, 28 + (i % 2), -2 + Math.floor(i / 2) * 2, i === 0 ? '3rd Inf. Div. (Sword)' : null);
  }
  b.unit('heavy', 1, 30, 0, '27th Armoured Bde.');
  b.unit('marine', 1, 34, -2, '6th Airborne Div.');
  b.unit('marine', 1, 36, 0, '9th Para Bn. (Merville)');

  // Naval Task Forces + bombardment ships (Channel)
  b.unit('ship', 1, -32, -18, 'Force U (Utah)');
  b.unit('ship', 1, -8, -20, 'Force O (Omaha)');
  b.unit('ship', 1, 8, -18, 'Force G (Gold)');
  b.unit('ship', 1, 18, -18, 'Force J (Juno)');
  b.unit('ship', 1, 28, -18, 'Force S (Sword)');
  b.unit('ship', 1, -12, -24, 'USS Texas');
  b.unit('ship', 1, -6, -26, 'USS Arkansas');
  b.unit('ship', 1, 4, -24, 'HMS Belfast');
  b.unit('ship', 1, 14, -24, 'HMCS Algonquin');
  b.unit('ship', 1, 24, -24, 'HMS Warspite');
  b.unit('ship', 1, -26, -22, 'USS Nevada');

  // Follow-on / floating reserve in England
  for (let i = 0; i < 3; i++) b.unit('light', 1, -12 + i, -44, i === 0 ? '1st Corps Reserve' : null);
  b.unit('heavy', 1, -8, -44, 'Guards Armoured Div.');
  b.unit('heavy', 1, 4, -46, '7th Armoured Div. (Desert Rats)');
  b.unit('heavy', 1, -26, -42, '2nd Armored Div. (US)');
  b.unit('light', 1, 2, -46, '51st Highland Div.');

  // —— German OOB (7th Army, 6 June morning) ——
  // Keep defenders off urban stamps (unit() refuses urban tiles).
  b.ensureLand(-40, -16, 3);
  b.ensureLand(-38, -10, 2);
  b.ensureLand(-44, -14, 2);
  // 709th Static — east Cotentin / Utah beaches (just inland of sand)
  for (let i = 0; i < 4; i++) b.unit('light', 2, -34 + i, 1, i === 0 ? '709th Inf. Div.' : null);
  b.unit('light', 2, -30, 3, '919th Grenadier Regt.');
  // 91st Luftlande — Cotentin inland (Carentan–Valognes)
  b.unit('light', 2, -36, -4, '91st Luftlande Div.');
  b.unit('light', 2, -34, 5, '6th Parachute Regt.');
  // 243rd Static — west Cotentin
  b.unit('light', 2, -44, -14, '243rd Inf. Div.');
  // Cherbourg Festung (around the city, not on urban hexes)
  b.unit('light', 2, -40, -16, 'Cherbourg Fortress');
  b.unit('light', 2, -38, -18, 'Harbour Defence Bn.');
  // 352nd Infantry — Omaha (recently moved to coast)
  for (let i = 0; i < 5; i++) b.unit('light', 2, -10 + i, 3, i === 0 ? '352nd Inf. Div.' : null);
  b.unit('heavy', 2, -6, 5, '352nd Assault Gun Bn.');
  b.unit('light', 2, -8, 7, '916th Grenadier Regt.');
  // 716th Static — Gold / Juno / Sword
  for (let i = 0; i < 3; i++) b.unit('light', 2, 8 + i * 4, 3, i === 0 ? '716th Inf. Div.' : null);
  b.unit('light', 2, 18, 4, '736th Grenadier Regt.');
  b.unit('light', 2, 28, 3, '441st Ost Bn.');
  // 21st Panzer — south/east of Caen (only panzer division in sector on D-Day morning)
  b.unit('heavy', 2, 26, 18, '21st Panzer Div.');
  b.unit('heavy', 2, 22, 20, '22nd Panzer Regt.');
  b.unit('light', 2, 24, 12, '192nd Panzergrenadier');
  b.unit('light', 2, 28, 10, '125th Panzergrenadier');
  // Inland HQ / static garrisons (offset from city stamps)
  b.unit('light', 2, -12, 16, 'LXXXIV Corps HQ');
  b.unit('light', 2, 8, 10, 'Bayeux Garrison');
  b.unit('light', 2, 32, 24, 'Falaise Depot');
  // Kriegsmarine
  b.unit('ship', 2, -20, -14, '5th S-Boat Flotilla');
  b.unit('ship', 2, 12, -12, 'Channel Patrol');
  b.unit('ship', 2, -40, -28, 'Cherbourg Destroyer');

  return {
    file: 'normandy-dday.json',
    entry: {
      id: 'normandy-dday',
      name: 'D-Day: Normandy',
      description:
        '6 June 1944 — Utah, Omaha, Gold, Juno and Sword. Break the Atlantic Wall, link the airborne, and seize Cherbourg and Caen. (One-shot store mission)',
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
              title: 'Operation Overlord',
              body: '0600, 6 June 1944. Five assault beaches run from the Cotentin to the Orne: Utah (4th Inf.), Omaha (1st & 29th), Gold (50th), Juno (3rd Canadian), Sword (3rd British). 82nd/101st hold the Merderet–Carentan exits; 6th Airborne holds the Orne bridges. The 709th, 352nd and 716th man the Wall — 21st Panzer waits near Caen.',
              style: 'briefing',
              kicker: 'Store Mission · One-shot',
            }
          ),
          ev(
            'dday_tide',
            'H-Hour',
            { type: 'timer', seconds: 90 },
            {
              title: 'H-Hour',
              body: 'First waves hit the shingle. Force U and Force O open fire — push the beach exits at Utah and Omaha before the rising tide pins the landing craft.',
              style: 'alert',
            },
            [],
            [{ owner: 1, scope: 'all', x: 0, y: 100 }]
          ),
          ev(
            'dday_omaha',
            'Bloody Omaha',
            { type: 'timer', seconds: 180 },
            {
              title: 'Bloody Omaha',
              body: 'WN strongpoints of the 352nd have Dog and Easy Red zeroed. V Corps is pinned under the bluffs — silence Vierville and St-Laurent or the lodgement dies on the sand.',
              style: 'alert',
            },
            [{ owner: 2, type: 'light', count: 5, anchor: 'faction_city', cityOwner: 2 }]
          ),
          ev(
            'dday_airborne',
            'Airborne link-up',
            { type: 'timer', seconds: 300 },
            {
              title: 'Airborne bridgehead',
              body: 'Sainte-Mère-Église is reported held. 101st is fighting toward Carentan; 6th Airborne still holds the Orne and Merville. Follow-on waves are clearing Utah exits — link up and seal the Cotentin.',
              style: 'victory',
            },
            [
              { owner: 1, type: 'marine', count: 4, anchor: 'player_city' },
              { owner: 1, type: 'ship', count: 1, anchor: 'player_city' },
            ]
          ),
          ev(
            'dday_panzer',
            '21st Panzer counterattack',
            { type: 'timer', seconds: 420 },
            {
              title: 'Panzers from Caen',
              body: '21st Panzer Division is driving north from Caen into the Juno–Sword gap toward Lion-sur-Mer. Hold the beachhead or cut them off before they reach the sea.',
              style: 'alert',
            },
            [
              { owner: 2, type: 'heavy', count: 3, anchor: 'faction_city', cityOwner: 2 },
              { owner: 2, type: 'light', count: 5, anchor: 'faction_city', cityOwner: 2 },
            ],
            [{ owner: 2, scope: 'reinforcements', x: 400, y: -280 }]
          ),
          ev(
            'dday_mulberry',
            'Mulberry harbours',
            { type: 'troops_killed', count: 2200 },
            {
              title: 'Artificial harbours',
              body: 'Mulberry A (Omaha) and Mulberry B (Gold / Arromanches) are going in. Fresh armour — including 7th Armoured and US 2nd Armored — is crossing. Exploit before Panzer Lehr and 12th SS can close.',
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
            'Drive on Cherbourg',
            { type: 'time_survived', seconds: 600 },
            {
              title: 'Cotentin sealed',
              body: 'VII Corps can turn north up the peninsula. Cherbourg’s deep-water port is the prize — take Valognes and the fortress before the garrison demolishes the docks.',
              style: 'briefing',
            },
            [{ owner: 1, type: 'marine', count: 4, anchor: 'player_city' }],
            [{ owner: 1, scope: 'reinforcements', x: -1000, y: -200 }]
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
