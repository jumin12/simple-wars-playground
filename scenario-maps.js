/**
 * Historical scenario maps for the shop — D-Day, Berlin 1945, Gettysburg 1863.
 * Builds exportMapData-compatible payloads with terrain, cities, units, and economy.
 */
(function(global) {
    'use strict';

    const FACTION_COLORS = ['#95a5a6', '#2e86de', '#576574'];

    function uid(prefix) {
        return prefix + '_' + Math.random().toString(36).slice(2, 10);
    }

    function createGrid(mapRadius, hexRadius) {
        let spacing = hexRadius * 1.35;
        let rows = Math.floor(mapRadius * 0.8);
        let hexList = [];
        let hexes = {};
        for(let r = -rows; r <= rows; r++) {
            for(let q = -mapRadius; q <= mapRadius; q++) {
                let x = q * spacing;
                let y = r * spacing;
                let hex = { q, r, x, y, type: 'water', owner: 0 };
                hexes[q + ',' + r] = hex;
                hexList.push(hex);
            }
        }
        return { hexList, hexes, spacing, mapRadius, hexRadius };
    }

    function setHexTerrain(hexes, q, r, type) {
        let h = hexes[q + ',' + r];
        if(h) h.type = type;
    }

    function stampUrbanAround(hexes, q, r, radius) {
        for(let dq = -radius; dq <= radius; dq++) {
            for(let dr = -radius; dr <= radius; dr++) {
                if(Math.abs(dq) + Math.abs(dr) > radius + 1) continue;
                let h = hexes[(q + dq) + ',' + (r + dr)];
                if(h && h.type !== 'water' && h.type !== 'mountain') h.type = 'urban';
            }
        }
        setHexTerrain(hexes, q, r, 'urban');
    }

    function claimRegion(hexes, owner, testFn) {
        for(let k in hexes) {
            let h = hexes[k];
            if(testFn(h.q, h.r, h)) h.owner = owner;
        }
    }

    function makeCity(id, name, q, r, hexes, owner, opts) {
        opts = opts || {};
        let h = hexes[q + ',' + r];
        if(!h) return null;
        if(opts.urban !== false) stampUrbanAround(hexes, q, r, opts.urbanRadius == null ? +2 : opts.urbanRadius);
        return {
            id, name, q, r, x: h.x, y: h.y, owner,
            hasFactory: !!opts.factory,
            hasHarbor: !!opts.harbor,
            hp: 1000, maxHp: 1000,
            urbanStyle: opts.style || 0,
            incomeBonus: opts.income || 0,
            manpowerBonus: opts.mp || 0
        };
    }

    function unitStats(type) {
        if(type === 'heavy') return { hp: 300, maxHp: 300, speed: 10, damage: 18, range: 60, attackCooldown: 2.8, radius: 16, manpower: 1000, maxManpower: 1000, tanks: 500, maxTanks: 500 };
        if(type === 'marine') return { hp: 100, maxHp: 100, speed: 15, damage: 8, range: 50, attackCooldown: 2.0, radius: 12, manpower: 1000, maxManpower: 1000, tanks: 0, maxTanks: 0 };
        if(type === 'ship') return { hp: 200, maxHp: 200, speed: 25, damage: 14, range: 80, attackCooldown: 2.4, radius: 20, manpower: 5000, maxManpower: 5000, tanks: 0, maxTanks: 0 };
        return { hp: 100, maxHp: 100, speed: 15, damage: 8, range: 50, attackCooldown: 2.0, radius: 12, manpower: 1000, maxManpower: 1000, tanks: 0, maxTanks: 0 };
    }

    function makeUnit(type, q, r, hexes, owner, name) {
        let h = hexes[q + ',' + r];
        if(!h || h.type === 'water' || h.type === 'mountain') {
            for(let d of [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]) {
                h = hexes[(q + d[0]) + ',' + (r + d[1])];
                if(h && h.type !== 'water' && h.type !== 'mountain') break;
            }
        }
        if(!h) return null;
        let s = unitStats(type);
        return Object.assign({
            type, owner, name,
            x: h.x, y: h.y,
            target: null, selected: false, shake: 0, activeCombatVisual: 0,
            morale: 100, maxMorale: 100, moraleBroken: false,
            xp: 0, kills: 0, losses: 0, tankKills: 0, tankLosses: 0, veteran: false,
            uid: uid('scn')
        }, s);
    }

    function makeFort(id, q, r, hexes, owner) {
        let h = hexes[q + ',' + r];
        if(!h) return null;
        return { id, owner, q, r, x: h.x, y: h.y };
    }

    function finalizeMap(grid, cities, entities, forts, economy, scenarioMeta, colors) {
        let roads = [];
        for(let i = 0; i < cities.length; i++) {
            let c1 = cities[i];
            let best = null, bestD = Infinity;
            for(let j = 0; j < cities.length; j++) {
                if(i === j || cities[j].owner !== c1.owner) continue;
                let c2 = cities[j];
                let dx = c1.x - c2.x, dy = c1.y - c2.y;
                let d = dx * dx + dy * dy;
                if(d < bestD) { bestD = d; best = c2; }
            }
            if(best) roads.push({ from: { id: c1.id, q: c1.q, r: c1.r }, to: { id: best.id, q: best.q, r: best.r } });
        }
        return {
            mapSize: grid.mapRadius,
            mapRadius: grid.mapRadius,
            hexRadius: grid.hexRadius,
            mapShape: 'custom',
            hexList: grid.hexList,
            cities, roads, entities,
            forts: forts || [],
            bridges: [],
            factionColors: (colors || FACTION_COLORS).slice(),
            savedStartEconomy: true,
            money: economy.money,
            manpower: economy.manpower,
            aiMoneyByOwner: economy.aiMoneyByOwner,
            aiManpowerByOwner: economy.aiManpowerByOwner,
            scenarioId: scenarioMeta.id,
            scenarioMeta
        };
    }

    /** Normandy coast — Allies (1) vs Germany (2), 6 June 1944 */
    function buildDday() {
        let mapRadius = 58, hexRadius = 20;
        let grid = createGrid(mapRadius, hexRadius);
        let { hexes, hexList } = grid;

        for(let h of hexList) {
            let q = h.q, r = h.r;
            if(r <= -20) { h.type = 'water'; continue; }
            if(r <= -15) { h.type = 'sand'; continue; }
            if(q <= -30 && r >= -14 && r <= 6) {
                h.type = r <= -12 ? 'sand' : (Math.abs(q + 24) % 3 === 0 ? 'forest' : 'grass');
                continue;
            }
            if(Math.abs(q + 12) <= 2 && r >= -8 && r <= 2) { h.type = 'swamp'; continue; }
            if(Math.abs(q - 4) <= 1 && r >= -6 && r <= 4) { h.type = 'swamp'; continue; }
            if(q >= 18 && r >= 8) { h.type = 'water'; continue; }
            if(Math.abs(q) <= 6 && r >= 0 && r <= 5) { h.type = 'hill'; continue; }
            if(Math.abs(q + 8) <= 5 && r >= 2 && r <= 10) {
                h.type = Math.abs(q + 8) + Math.abs(r - 6) <= 4 ? 'forest' : 'grass';
                continue;
            }
            h.type = (Math.abs(q * 17 + r * 13) % 5 === 0) ? 'forest' : 'grass';
        }

        let cities = [];
        cities.push(makeCity('c_utah', 'Sainte-Marie-du-Mont', -26, -13, hexes, 1, { harbor: true, income: 2 }));
        cities.push(makeCity('c_omaha', 'Vierville-sur-Mer', -12, -14, hexes, 1, { harbor: true, income: 2 }));
        cities.push(makeCity('c_gold', 'Arromanches', -3, -14, hexes, 1, { harbor: true, factory: true, income: 3 }));
        cities.push(makeCity('c_juno', 'Courseulles', 4, -14, hexes, 1, { harbor: true, income: 2 }));
        cities.push(makeCity('c_sword', 'Ouistreham', 11, -14, hexes, 1, { harbor: true, income: 2 }));
        cities.push(makeCity('c_carentan', 'Carentan', -18, -6, hexes, 1, { factory: true, income: 2 }));
        cities.push(makeCity('c_bayeux', 'Bayeux', -6, -8, hexes, 1, { income: 2, mp: 1 }));
        cities.push(makeCity('c_caen', 'Caen', 2, 2, hexes, 2, { factory: true, income: 4, mp: 2, urbanRadius: 3 }));
        cities.push(makeCity('c_stlo', 'Saint-Lô', -14, 4, hexes, 2, { factory: true, income: 3, mp: 1 }));
        cities.push(makeCity('c_cherbourg', 'Cherbourg', -32, -4, hexes, 2, { harbor: true, factory: true, income: 3 }));
        cities.push(makeCity('c_falaise', 'Falaise', -4, 8, hexes, 2, { income: 2 }));
        cities.push(makeCity('c_rouen', 'Rouen', 14, -2, hexes, 2, { factory: true, income: 3, mp: 2, urbanRadius: 3 }));
        cities = cities.filter(Boolean);

        claimRegion(hexes, 1, (q, r) => r <= -12 || (r <= 2 && q <= 8));
        claimRegion(hexes, 2, (q, r, h) => h.type !== 'water' && h.type !== 'sand' && !(r <= -12 || (r <= 2 && q <= 8)));

        let entities = [];
        let allies = [
            ['heavy', -12, -14, '1st Infantry Division (Omaha)'],
            ['light', -10, -13, '29th Infantry Division'],
            ['light', -26, -13, '4th Infantry Division (Utah)'],
            ['marine', -20, -12, '82nd Airborne Division'],
            ['marine', -16, -11, '101st Airborne Division'],
            ['light', -3, -14, '50th (Northumbrian) Division'],
            ['light', 4, -14, '3rd Canadian Division'],
            ['light', 11, -14, '3rd British Infantry Division'],
            ['heavy', -6, -10, '2nd Armored Division'],
            ['light', -18, -6, '101st at Carentan']
        ];
        let axis = [
            ['light', -11, -13, '352nd Infantry Division'],
            ['light', -27, -12, '709th Static Division'],
            ['heavy', 4, 1, '21st Panzer Division'],
            ['heavy', 0, 3, '12th SS Panzer Division Hitlerjugend'],
            ['light', -14, 3, 'Panzer Lehr Division'],
            ['light', 14, -1, '716th Static Division'],
            ['heavy', -4, 7, '116th Panzer Division']
        ];
        for(let u of allies) { let e = makeUnit(u[0], u[1], u[2], hexes, 1, u[3]); if(e) entities.push(e); }
        for(let u of axis) { let e = makeUnit(u[0], u[1], u[2], hexes, 2, u[3]); if(e) entities.push(e); }

        let forts = [
            makeFort('f_omaha', -12, -15, hexes, 2),
            makeFort('f_utah', -26, -14, hexes, 2),
            makeFort('f_gold', -3, -15, hexes, 2),
            makeFort('f_caen', 2, 1, hexes, 2)
        ].filter(Boolean);

        return finalizeMap(grid, cities, entities, forts, {
            money: 18500,
            manpower: 9200,
            aiMoneyByOwner: { 2: 9500 },
            aiManpowerByOwner: { 2: 6800 }
        }, {
            id: 'scenario_dday',
            name: 'D-Day: Normandy 1944',
            period: 'modern',
            aiCount: 1,
            playerLabel: 'Allied Forces',
            enemyLabel: 'Wehrmacht',
            blurb: '6 June 1944 — storm the Atlantic Wall and break out from the beachhead.'
        }, ['#95a5a6', '#2e86de', '#4a5568']);
    }

    /** Battle of Berlin — Soviet (1) vs Germany (2), April 1945 */
    function buildBerlin() {
        let mapRadius = 52, hexRadius = 20;
        let grid = createGrid(mapRadius, hexRadius);
        let { hexes, hexList } = grid;

        for(let h of hexList) {
            let q = h.q, r = h.r;
            let dist = Math.sqrt(q * q + r * r);
            if(dist > 46) { h.type = 'water'; continue; }
            if(Math.abs(q) <= 5 && Math.abs(r) <= 2) { h.type = 'urban'; continue; }
            if(Math.abs(q - r * 0.3) <= 1.2 && r >= -8 && r <= 6) { h.type = 'water'; continue; }
            if(Math.abs(q) <= 9 && Math.abs(r) <= 7 && dist <= 14) {
                h.type = (Math.abs(q + r) % 4 === 0) ? 'urban' : 'grass';
                continue;
            }
            if(Math.abs(q - 14) <= 3 && Math.abs(r - 2) <= 4) { h.type = 'forest'; continue; }
            if(Math.abs(q + 12) <= 2 && Math.abs(r + 4) <= 3) { h.type = 'hill'; continue; }
            h.type = (Math.abs(q * 11 + r * 7) % 6 === 0) ? 'forest' : 'grass';
        }

        stampUrbanAround(hexes, 0, 0, 4);
        stampUrbanAround(hexes, -4, -2, 2);
        stampUrbanAround(hexes, 4, 2, 2);
        stampUrbanAround(hexes, -3, 4, 2);

        let cities = [];
        cities.push(makeCity('c_mitte', 'Berlin Mitte', 0, 0, hexes, 2, { factory: true, income: 5, mp: 3, urbanRadius: 3, urban: false }));
        cities.push(makeCity('c_tiergarten', 'Tiergarten', -4, -2, hexes, 2, { income: 2, urban: false }));
        cities.push(makeCity('c_kreuz', 'Kreuzberg', 4, 2, hexes, 2, { factory: true, income: 3, urban: false }));
        cities.push(makeCity('c_charlot', 'Charlottenburg', -6, -4, hexes, 2, { income: 2, urban: false }));
        cities.push(makeCity('c_spandau', 'Spandau', -8, 2, hexes, 2, { income: 2, urban: false }));
        cities.push(makeCity('c_potsdam', 'Potsdam', -12, 6, hexes, 2, { factory: true, income: 2, urban: false }));
        cities.push(makeCity('c_frankfurt', 'Frankfurt (Oder) Bridgehead', 22, 0, hexes, 1, { factory: true, income: 3, mp: 2 }));
        cities.push(makeCity('c_kuestrin', 'Küstrin', 18, -6, hexes, 1, { income: 2, mp: 1 }));
        cities.push(makeCity('c_oranien', 'Oranienburg', 6, -10, hexes, 1, { income: 2 }));
        cities.push(makeCity('c_stettin', 'Stettin Approach', 28, -8, hexes, 1, { harbor: true, income: 2 }));
        cities = cities.filter(Boolean);

        claimRegion(hexes, 1, (q, r, h) => h.type !== 'water' && q >= 6);
        claimRegion(hexes, 2, (q, r, h) => h.type !== 'water' && q < 6 && Math.abs(q) <= 14 && Math.abs(r) <= 12);

        let entities = [];
        let soviets = [
            ['heavy', 22, 0, '8th Guards Army'],
            ['heavy', 18, -4, '1st Guards Tank Army'],
            ['heavy', 14, 2, '5th Shock Army'],
            ['light', 10, -2, '3rd Shock Army'],
            ['heavy', 20, -8, '2nd Guards Tank Army'],
            ['light', 16, 4, '47th Army'],
            ['heavy', 24, -6, '1st Ukrainian Front'],
            ['light', 8, -8, 'Berlin Offensive Group']
        ];
        let germans = [
            ['light', 0, 0, 'Berlin Garrison'],
            ['heavy', 2, 1, 'Müncheberg Panzer Division'],
            ['light', -2, -1, '9th Parachute Division'],
            ['light', 4, -2, '11th SS Nordland'],
            ['heavy', -4, 2, '18th Panzergrenadier Division'],
            ['light', -6, 0, 'Volkssturm Battalion']
        ];
        for(let u of soviets) { let e = makeUnit(u[0], u[1], u[2], hexes, 1, u[3]); if(e) entities.push(e); }
        for(let u of germans) { let e = makeUnit(u[0], u[1], u[2], hexes, 2, u[3]); if(e) entities.push(e); }

        let forts = [
            makeFort('f_zoo', -2, -3, hexes, 2),
            makeFort('f_reichstag', 0, -1, hexes, 2),
            makeFort('f_alex', 2, 0, hexes, 2)
        ].filter(Boolean);

        return finalizeMap(grid, cities, entities, forts, {
            money: 16000,
            manpower: 10500,
            aiMoneyByOwner: { 2: 3800 },
            aiManpowerByOwner: { 2: 2800 }
        }, {
            id: 'scenario_berlin',
            name: 'Berlin 1945',
            period: 'modern',
            aiCount: 1,
            playerLabel: 'Red Army',
            enemyLabel: 'Third Reich',
            blurb: 'April 1945 — encircle and seize the Nazi capital in the final battle of the European war.'
        }, ['#95a5a6', '#c0392b', '#2c3e50']);
    }

    /** Battle of Gettysburg — Union (1) vs Confederacy (2), July 1863 */
    function buildGettysburg() {
        let mapRadius = 44, hexRadius = 18;
        let grid = createGrid(mapRadius, hexRadius);
        let { hexes, hexList } = grid;

        for(let h of hexList) {
            let q = h.q, r = h.r;
            let dist = Math.sqrt(q * q + r * r);
            if(dist > 38) { h.type = 'water'; continue; }
            if(Math.abs(q) <= 2 && Math.abs(r) <= 1) { h.type = 'urban'; continue; }
            if(Math.abs(q + 5) <= 2 && Math.abs(r + 1) <= 2) { h.type = 'hill'; continue; }
            if(Math.abs(q - 4) <= 2 && Math.abs(r - 5) <= 2) { h.type = 'hill'; continue; }
            if(Math.abs(q - 2) <= 1 && Math.abs(r - 6) <= 2) { h.type = 'hill'; continue; }
            if(Math.abs(q + 2) <= 2 && Math.abs(r + 4) <= 2) { h.type = 'hill'; continue; }
            if(Math.abs(q + 8) <= 3 && Math.abs(r - 1) <= 3) { h.type = 'forest'; continue; }
            if(Math.abs(q - 8) <= 2 && Math.abs(r + 2) <= 3) { h.type = 'forest'; continue; }
            h.type = (Math.abs(q * 13 + r * 9) % 5 === 0) ? 'forest' : 'grass';
        }

        stampUrbanAround(hexes, 0, 0, 2);

        let cities = [];
        cities.push(makeCity('c_gettysburg', 'Gettysburg', 0, 0, hexes, 0, { income: 2, urban: false }));
        cities.push(makeCity('c_harrisburg', 'Harrisburg', 0, -14, hexes, 1, { factory: true, income: 4, mp: 2, urbanRadius: 2 }));
        cities.push(makeCity('c_carlisle', 'Carlisle', 10, -12, hexes, 1, { income: 2 }));
        cities.push(makeCity('c_emmitsburg', 'Emmitsburg', -10, -8, hexes, 1, { income: 2 }));
        cities.push(makeCity('c_chambers', 'Chambersburg', -16, -4, hexes, 2, { factory: true, income: 3, mp: 1, urbanRadius: 2 }));
        cities.push(makeCity('c_cashtown', 'Cashtown', -8, 6, hexes, 2, { income: 2 }));
        cities.push(makeCity('c_york', 'York', 14, 2, hexes, 2, { factory: true, income: 3, mp: 2, urbanRadius: 2 }));
        cities = cities.filter(Boolean);
        cities[0].owner = 0;

        claimRegion(hexes, 1, (q, r) => q >= -4 && r <= 2);
        claimRegion(hexes, 2, (q, r, h) => h.type !== 'water' && !(q >= -4 && r <= 2) && q <= 12);

        let entities = [];
        let union = [
            ['light', 2, -4, 'I Corps — Reynolds'],
            ['light', 4, -6, 'XI Corps — Howard'],
            ['heavy', 0, -2, 'II Corps — Hancock'],
            ['light', 6, -2, 'III Corps — Sickles'],
            ['light', 8, 0, 'XII Corps — Slocum'],
            ['heavy', 2, 2, 'Cavalry Corps — Buford'],
            ['light', -2, -3, 'Cemetery Hill Brigade'],
            ['light', 3, -8, 'VI Corps — Sedgwick (march)']
        ];
        let confed = [
            ['light', -6, 2, 'I Corps — Hill'],
            ['light', -8, 0, 'III Corps — A.P. Hill'],
            ['heavy', -4, 6, 'II Corps — Longstreet'],
            ['light', -10, 4, 'I Corps — Rodes'],
            ['heavy', -2, 5, 'III Corps — Pickett'],
            ['light', 6, 4, 'Stuart\'s Cavalry'],
            ['light', -5, -2, 'Early\'s Division']
        ];
        for(let u of union) { let e = makeUnit(u[0], u[1], u[2], hexes, 1, u[3]); if(e) entities.push(e); }
        for(let u of confed) { let e = makeUnit(u[0], u[1], u[2], hexes, 2, u[3]); if(e) entities.push(e); }

        return finalizeMap(grid, cities, entities, [], {
            money: 11000,
            manpower: 7500,
            aiMoneyByOwner: { 2: 10000 },
            aiManpowerByOwner: { 2: 7000 }
        }, {
            id: 'scenario_gettysburg',
            name: 'Gettysburg 1863',
            period: 'napoleonic',
            aiCount: 1,
            playerLabel: 'Union Army',
            enemyLabel: 'Army of Northern Virginia',
            blurb: '1–3 July 1863 — hold Cemetery Hill and Little Round Top in the turning point of the Civil War.'
        }, ['#95a5a6', '#2563eb', '#991b1b']);
    }

    const CATALOG = [
        { id: 'scenario_dday', cost: 200, build: buildDday },
        { id: 'scenario_berlin', cost: 200, build: buildBerlin },
        { id: 'scenario_gettysburg', cost: 200, build: buildGettysburg }
    ];

    global.WOD_SCENARIOS = {
        CATALOG,
        buildDday,
        buildBerlin,
        buildGettysburg,
        buildById(id) {
            let e = CATALOG.find(c => c.id === id);
            return e ? e.build() : null;
        },
        getCatalogEntry(id) {
            return CATALOG.find(c => c.id === id) || null;
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
