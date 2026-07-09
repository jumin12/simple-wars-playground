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
 * Layout (west → east beaches, north = Channel, south = inland France):
 *   Utah · Pointe du Hoc · Omaha · Gold · Juno · Sword
 * Player = Allied Expeditionary Force (UK staging + invasion fleet).
 * Enemy = German 7th Army coastal defense.
 */
function buildNormandyDDay() {
  const b = new MapBuilder(70, 19440606);
  // Northern Channel open; Normandy landmass fills the southern/central map.
  b.generateBase('island', 1944, {
    islandMode: 'wide',
    centerQ: 6,
    centerR: 18,
    stretchX: 1.55,
    stretchY: 0.72,
    coastNoiseAmp: 0.38,
    waterElevThresh: 0.46,
    sandThresh: 0.34,
    grassThresh: 0.56,
    forestThresh: 0.76,
    mountElevThresh: 0.91,
    moistShift: 0.02,
    forestMoistBoost: 0.04,
    mountainStyle: 'low',
    mountainPeakJitter: 0.06,
    biomeAccent: 'balanced',
  });

  // Force the English Channel across the northern third.
  b.each((h) => {
    if (h.r < -8) h.type = 'water';
  });
  // Soften the Channel–shore transition into a long sandy beach belt.
  b.rect(-48, -6, 52, 2, 'sand', { noise: 1.5 });
  b.each((h) => {
    if (h.r >= -8 && h.r <= 1 && h.type === 'water') {
      // Keep a few tidal inlets but mostly beach.
      if (b.rng() > 0.12) h.type = 'sand';
    }
  });
  // Bocage / Norman countryside inland.
  b.rect(-40, 8, 48, 42, 'grass', { noise: 2 });
  for (let i = 0; i < 18; i++) {
    const fq = Math.round(-36 + b.rng() * 80);
    const fr = Math.round(10 + b.rng() * 28);
    b.blob(fq, fr, 2 + b.rng() * 3, 'forest', { noise: 0.4 });
  }
  // Cotentin peninsula (Utah / Cherbourg) — western hook north into the Channel.
  b.blob(-38, -2, 9, 'grass', { noise: 0.35 });
  b.blob(-40, -10, 6, 'grass', { noise: 0.3 });
  b.ensureLand(-40, -8, 4);
  b.ensureLand(-36, 2, 3);
  // Pointe du Hoc cliffs (rocky spur between Utah and Omaha).
  b.blob(-18, -4, 3, 'hill', { noise: 0.2 });
  b.blob(-18, -2, 2, 'mountain', { noise: 0.15 });
  // Caen plain / Orne approaches (Sword sector inland).
  b.ensureLand(28, 14, 5);
  b.ensureLand(34, 22, 4);
  // Carentan marsh / Vire estuary between Utah and Omaha.
  b.blob(-26, 6, 4, 'swamp', { noise: 0.35 });
  b.blob(-24, 10, 3, 'swamp', { noise: 0.3 });
  // Keep Channel ship lanes open north of the beaches.
  b.ensureWater(0, -28, 14);
  b.ensureWater(-20, -24, 8);
  b.ensureWater(20, -24, 8);
  b.roughenCoasts(1, 0.22);
  b.coastSand(0.92);

  // —— Allied staging (southern England) ——
  b.blob(-8, -40, 7, 'grass', { noise: 0.25 });
  b.blob(10, -42, 6, 'grass', { noise: 0.25 });
  b.ensureLand(-8, -40, 4);
  b.ensureLand(10, -42, 3);
  b.ensureWater(-8, -32, 3);
  b.ensureWater(10, -34, 3);

  // Cities — historical names
  b.city(-8, -40, 1, 'Portsmouth', { factory: true, harbor: true, incomeBonus: 40 });
  b.city(10, -42, 1, 'Southampton', { factory: true, harbor: true });
  // Beach / Cotentin
  b.city(-40, -6, 2, 'Cherbourg', { factory: true, harbor: true });
  b.city(-28, 8, 2, 'Carentan', { factory: false });
  b.city(-10, 6, 2, 'Saint-Lô', { factory: true });
  b.city(4, 4, 2, 'Bayeux', { factory: false });
  b.city(22, 10, 2, 'Caen', { factory: true });
  b.city(36, 18, 2, 'Falaise', { factory: true });

  b.claimNations([
    { q: -8, r: -40, owner: 1, reach: 12 },
    { q: 10, r: -42, owner: 1, reach: 10 },
    { q: 0, r: 18, owner: 2, reach: 72 },
  ]);

  // Atlantic Wall — coastal strongpoints (west → east)
  // Utah sector
  b.fort(-36, -2, 2);
  b.fort(-32, 0, 2);
  // Pointe du Hoc
  b.fort(-18, -3, 2);
  // Omaha
  b.fort(-8, -1, 2);
  b.fort(-4, 0, 2);
  b.fort(0, -1, 2);
  // Gold
  b.fort(8, 0, 2);
  b.fort(12, 1, 2);
  // Juno
  b.fort(18, 0, 2);
  b.fort(22, 1, 2);
  // Sword
  b.fort(28, 0, 2);
  b.fort(32, 1, 2);

  // —— Allied OOB (simplified historical landing forces) ——
  // US VII Corps — Utah Beach (4th Infantry)
  for (let i = 0; i < 5; i++) {
    b.unit('marine', 1, -34 + (i % 3), -14 + Math.floor(i / 3) * 2, i === 0 ? '4th Inf. Div. (Utah)' : null);
  }
  b.unit('marine', 1, -38, -12, '82nd Airborne');
  b.unit('marine', 1, -36, -10, '101st Airborne');
  // US V Corps — Omaha Beach (1st & 29th Infantry)
  for (let i = 0; i < 6; i++) {
    b.unit('marine', 1, -6 + (i % 3), -14 + Math.floor(i / 3) * 2, i === 0 ? '1st Inf. Div. (Omaha)' : null);
  }
  b.unit('marine', 1, -2, -12, '29th Inf. Div.');
  b.unit('heavy', 1, -4, -16, '741st Tank Bn.');
  // British XXX Corps — Gold Beach (50th Northumbrian)
  for (let i = 0; i < 4; i++) {
    b.unit('marine', 1, 8 + (i % 2), -14 + Math.floor(i / 2) * 2, i === 0 ? '50th Inf. Div. (Gold)' : null);
  }
  b.unit('heavy', 1, 10, -16, '8th Armoured Bde.');
  // Canadian 3rd Infantry — Juno Beach
  for (let i = 0; i < 4; i++) {
    b.unit('marine', 1, 18 + (i % 2), -14 + Math.floor(i / 2) * 2, i === 0 ? '3rd Cdn Inf. Div. (Juno)' : null);
  }
  // British I Corps — Sword Beach (3rd Infantry)
  for (let i = 0; i < 4; i++) {
    b.unit('marine', 1, 28 + (i % 2), -14 + Math.floor(i / 2) * 2, i === 0 ? '3rd Inf. Div. (Sword)' : null);
  }
  b.unit('marine', 1, 30, -10, '6th Airborne');

  // Naval Task Forces (Force U / O / G / J / S)
  b.unit('ship', 1, -30, -22, 'Force U (Utah)');
  b.unit('ship', 1, -6, -24, 'Force O (Omaha)');
  b.unit('ship', 1, 8, -22, 'Force G (Gold)');
  b.unit('ship', 1, 18, -22, 'Force J (Juno)');
  b.unit('ship', 1, 28, -22, 'Force S (Sword)');
  b.unit('ship', 1, 0, -30, 'HMS Belfast');
  b.unit('ship', 1, -12, -28, 'USS Texas');

  // Staging reserves in England
  for (let i = 0; i < 4; i++) b.unit('light', 1, -10 + i, -38);
  b.unit('heavy', 1, -6, -38, 'Guards Armoured');
  b.unit('heavy', 1, 8, -40, '2nd Armored Div.');

  // —— German OOB (7th Army / LXXXIV Corps coastal defense) ——
  // 709th Static Division — Cotentin / Utah
  for (let i = 0; i < 4; i++) b.unit('light', 2, -38 + i, 0, i === 0 ? '709th Inf. Div.' : null);
  b.unit('light', 2, -34, 4);
  // 352nd Infantry — Omaha (elite coastal)
  for (let i = 0; i < 5; i++) b.unit('light', 2, -8 + i, 2, i === 0 ? '352nd Inf. Div.' : null);
  b.unit('heavy', 2, -4, 6, '352nd Assault Guns');
  // 716th Static — Gold / Juno / Sword
  for (let i = 0; i < 4; i++) b.unit('light', 2, 10 + i * 4, 3, i === 0 ? '716th Inf. Div.' : null);
  // 21st Panzer — Caen reserve
  b.unit('heavy', 2, 20, 12, '21st Panzer Div.');
  b.unit('heavy', 2, 24, 14, '22nd Panzer Regt.');
  b.unit('light', 2, 22, 8, '192nd Panzergrenadier');
  // Cherbourg fortress garrison
  b.unit('light', 2, -40, -4, 'Cherbourg Garrison');
  b.unit('light', 2, -38, -8);
  // Kriegsmarine coastal patrol
  b.unit('ship', 2, -20, -16, 'Schnellboot Flotilla');
  b.unit('ship', 2, 14, -14, 'Coastal Patrol');

  // Inland garrisons
  for (let i = 0; i < 3; i++) b.unit('light', 2, -12 + i * 2, 8);
  b.unit('light', 2, 34, 18);
  b.unit('heavy', 2, 32, 20, 'Panzer Lehr Cadre');

  return {
    file: 'normandy-dday.json',
    entry: {
      id: 'normandy-dday',
      name: 'D-Day: Normandy',
      description: '6 June 1944 — storm Utah, Omaha, Gold, Juno and Sword. Break the Atlantic Wall and seize Cherbourg and Caen. (One-shot store mission)',
      price: 200,
      file: 'normandy-dday.json',
      aiCount: 1,
      packType: 'oneshot',
    },
    data: b.export({
      money: 28000,
      manpower: 20000,
      aiMoney: { 1: 0, 2: 22000 },
      aiManpower: { 1: 0, 2: 16000 },
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
              body: '0600, 6 June 1944. Five assault beaches stretch from the Cotentin to the Orne: Utah, Omaha, Gold, Juno, and Sword. The Atlantic Wall is manned by the 709th, 352nd and 716th. Clear the Channel, put the assault divisions ashore, and drive inland before 21st Panzer can counterattack from Caen.',
              style: 'briefing',
              kicker: 'Store Mission · One-shot',
            }
          ),
          ev(
            'dday_tide',
            'Rising tide',
            { type: 'timer', seconds: 90 },
            {
              title: 'H-Hour',
              body: 'First waves are hitting the shingle. Naval gunfire from Force O and Force U is walking inland — push the beach exits before the tide strands the landing craft.',
              style: 'alert',
            },
            [],
            [{ owner: 1, scope: 'all', x: 0, y: 80 }]
          ),
          ev(
            'dday_omaha',
            'Omaha under fire',
            { type: 'timer', seconds: 180 },
            {
              title: 'Bloody Omaha',
              body: 'The 352nd Infantry has the bluffs zeroed. V Corps is pinned on the beach — commit reserves from Portsmouth and silence the strongpoints west of Bayeux.',
              style: 'alert',
            },
            [{ owner: 2, type: 'light', count: 4, anchor: 'faction_city', cityOwner: 2 }]
          ),
          ev(
            'dday_airborne',
            'Airborne link-up',
            { type: 'timer', seconds: 300 },
            {
              title: 'Airborne bridgehead',
              body: '82nd and 101st report the Merderet crossings held. A follow-on wave is landing behind Utah — link up and swing on Cherbourg.',
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
              body: '21st Panzer Division is rolling north from Caen toward the Juno–Sword gap. Dig in on the beachhead or cut them off before they reach the sea.',
              style: 'alert',
            },
            [
              { owner: 2, type: 'heavy', count: 3, anchor: 'faction_city', cityOwner: 2 },
              { owner: 2, type: 'light', count: 4, anchor: 'faction_city', cityOwner: 2 },
            ],
            [{ owner: 2, scope: 'reinforcements', x: 200, y: -200 }]
          ),
          ev(
            'dday_mulberry',
            'Mulberry harbours',
            { type: 'troops_killed', count: 2000 },
            {
              title: 'Artificial harbours',
              body: 'Mulberry A and B are going in off Omaha and Gold. Fresh armour and infantry are crossing the Channel — exploit before OKW can feed Panzer Lehr into the line.',
              style: 'victory',
            },
            [
              { owner: 1, type: 'heavy', count: 2, anchor: 'player_city' },
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
              body: 'VII Corps has room to turn north. Cherbourg’s deep-water port is the prize — take it and the lodgement can be supplied for the breakout.',
              style: 'briefing',
            },
            [{ owner: 1, type: 'marine', count: 3, anchor: 'player_city' }],
            [{ owner: 1, scope: 'reinforcements', x: -900, y: -100 }]
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
