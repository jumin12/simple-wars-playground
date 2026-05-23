/**
 * Shop scenario maps — historically themed battles built on a geo-projected grid.
 * Loaded before map-editor.js; builds map bundles at runtime when selected.
 */
(function(global) {
    'use strict';

    const WOD_SCENARIO_COST = 250;
    const SCENARIO_BUILD_VER = 3;

    const TERRAIN_COLORS = {
        water: '#2980b9', grass: '#2ecc71', sand: '#f39c12', forest: '#27ae60',
        hill: '#a1887f', mountain: '#95a5a6', urban: '#bdc3c7', swamp: '#16a085'
    };

    function terrainColor(type) {
        if(typeof global.getTerrainColor === 'function') return global.getTerrainColor(type);
        return TERRAIN_COLORS[type] || '#2ecc71';
    }

    function urbanColor() {
        if(typeof global.getUrbanTerrainColor === 'function' && typeof global.wodGetRenderPeriod === 'function')
            return global.getUrbanTerrainColor(global.wodGetRenderPeriod());
        return '#bdc3c7';
    }

    function hash2(q, r, salt) {
        let n = (q * 374761393) ^ (r * 668265263) ^ ((salt || 0) * 982451653);
        n = (n ^ (n >>> 13)) >>> 0;
        return (n % 1000) / 1000;
    }

    function dist2(x1, y1, x2, y2) {
        let dx = x1 - x2, dy = y1 - y2;
        return dx * dx + dy * dy;
    }

    function mkUnit(type, x, y, owner, name, extra) {
        extra = extra || {};
        let u = {
            type, owner, name: name || '',
            x, y, target: null, selected: false,
            hp: 100, maxHp: 100, manpower: 1000, maxManpower: 1000,
            tanks: 0, maxTanks: 0, shake: 0, activeCombatVisual: 0,
            morale: 100, maxMorale: 100, moraleBroken: false,
            xp: 0, kills: 0, losses: 0, tankKills: 0, tankLosses: 0, veteran: false
        };
        if(type === 'light' || type === 'marine') {
            u.speed = 15; u.damage = 8; u.range = 50; u.attackCooldown = 2.0; u.radius = 12;
        } else if(type === 'heavy') {
            u.hp = 300; u.maxHp = 300; u.speed = 10; u.damage = 18; u.range = 60; u.attackCooldown = 2.8; u.radius = 16;
            u.manpower = 1000; u.maxManpower = 1000; u.tanks = 500; u.maxTanks = 500;
        } else if(type === 'ship') {
            u.hp = 200; u.maxHp = 200; u.speed = 25; u.damage = 14; u.range = 80; u.attackCooldown = 2.4; u.radius = 20;
            u.manpower = 5000; u.maxManpower = 5000;
        }
        if(extra.hp != null) u.hp = u.maxHp = extra.hp;
        if(extra.tanks != null) { u.tanks = extra.tanks; u.maxTanks = extra.tanks; }
        if(extra.manpower != null) { u.manpower = extra.manpower; u.maxManpower = extra.manpower; }
        if(extra.uid) u.uid = extra.uid;
        else u.uid = 'scn_' + owner + '_' + type + '_' + Math.random().toString(36).slice(2, 9);
        return u;
    }

    function ScenarioBuilder(cfg) {
        this.mapRadius = cfg.mapRadius || 80;
        this.hr = cfg.hr || 22;
        this.bbox = cfg.bbox;
        this.cols = this.mapRadius;
        this.rows = Math.floor(this.mapRadius * 0.8);
        this.spacing = this.hr * 1.35;
        this.hexList = [];
        this.hexes = {};
        this.cities = [];
        this.entities = [];
        this.forts = [];
        this.bridges = [];
        this.roads = [];
        this.factionColors = (cfg.factionColors || ['#000', '#3498db', '#7f8c8d', '#9b59b6', '#e67e22', '#f1c40f', '#1abc9c']).slice();
        this.economy = cfg.economy || {};
    }

    ScenarioBuilder.prototype.geoToGrid = function(lon, lat) {
        let b = this.bbox;
        let tq = ((lon - b.minLon) / (b.maxLon - b.minLon)) * (this.cols * 2) - this.cols;
        let tr = ((lat - b.minLat) / (b.maxLat - b.minLat)) * (this.rows * 2) - this.rows;
        return { q: Math.round(tq), r: Math.round(tr) };
    };

    ScenarioBuilder.prototype.gridToWorld = function(q, r) {
        return { x: q * this.spacing, y: r * this.spacing };
    };

    ScenarioBuilder.prototype.hexAt = function(q, r) {
        return this.hexes[q + ',' + r] || null;
    };

    ScenarioBuilder.prototype.nearestHex = function(lon, lat) {
        let g = this.geoToGrid(lon, lat);
        return this.hexAt(g.q, g.r);
    };

    ScenarioBuilder.prototype.buildCells = function(terrainFn, ownerFn) {
        for(let r = -this.rows; r <= this.rows; r++) {
            for(let q = -this.cols; q <= this.cols; q++) {
                let x = q * this.spacing;
                let y = r * this.spacing;
                let lon = this.bbox.minLon + ((q + this.cols) / (this.cols * 2)) * (this.bbox.maxLon - this.bbox.minLon);
                let lat = this.bbox.minLat + ((r + this.rows) / (this.rows * 2)) * (this.bbox.maxLat - this.bbox.minLat);
                let type = terrainFn(lon, lat, q, r, this);
                let owner = type === 'water' ? 0 : (ownerFn ? ownerFn(lon, lat, q, r, type, this) : 0);
                let hex = {
                    q, r, x, y, type, owner,
                    baseColor: terrainColor(type),
                    renderColor: terrainColor(type)
                };
                this.hexes[q + ',' + r] = hex;
                this.hexList.push(hex);
            }
        }
    };

    ScenarioBuilder.prototype.addCity = function(name, lon, lat, owner, opts) {
        opts = opts || {};
        let g = this.geoToGrid(lon, lat);
        let hex = this.hexAt(g.q, g.r);
        if(!hex || hex.type === 'water' || hex.type === 'mountain') {
            hex = null;
            for(let ring = 1; ring <= 8 && !hex; ring++) {
                for(let dq = -ring; dq <= ring; dq++) {
                    for(let dr = -ring; dr <= ring; dr++) {
                        let h = this.hexAt(g.q + dq, g.r + dr);
                        if(h && h.type !== 'water' && h.type !== 'mountain') { hex = h; break; }
                    }
                    if(hex) break;
                }
            }
        }
        if(!hex) return null;
        let id = 'city_' + this.cities.length;
        let city = {
            id, name, x: hex.x, y: hex.y, q: hex.q, r: hex.r,
            owner: owner || 0,
            hasFactory: !!opts.factory,
            hasHarbor: !!opts.harbor,
            hp: 1000, maxHp: 1000,
            urbanStyle: opts.style != null ? opts.style : (this.cities.length % 4),
            incomeBonus: opts.incomeBonus || 0,
            manpowerBonus: opts.manpowerBonus || 0
        };
        this.cities.push(city);
        this.paintUrbanFootprint(hex, id, opts.radius || 2);
        hex.owner = owner;
        hex.type = 'urban';
        hex.cityId = id;
        hex.baseColor = urbanColor();
        hex.renderColor = hex.baseColor;
        if(opts.fort) {
            this.forts.push({ id: 'fort_' + id, owner, q: hex.q, r: hex.r, x: hex.x, y: hex.y });
        }
        return city;
    };

    ScenarioBuilder.prototype.paintUrbanFootprint = function(centerHex, cityId, R) {
        R = R || 2;
        for(let dq = -R; dq <= R; dq++) {
            for(let dr = -R; dr <= R; dr++) {
                if(dq * dq + dr * dr > (R + 0.5) * (R + 0.5)) continue;
                let h = this.hexAt(centerHex.q + dq, centerHex.r + dr);
                if(!h || h.type === 'water' || h.type === 'mountain') continue;
                h.type = 'urban';
                h.cityId = cityId;
                h.urbanVariant = Math.abs((h.q * 17 + h.r * 31) % 5);
                h.baseColor = urbanColor();
                h.renderColor = h.baseColor;
            }
        }
    };

    ScenarioBuilder.prototype.addUnits = function(specs) {
        for(let i = 0; i < specs.length; i++) {
            let s = specs[i];
            let hex = this.nearestHex(s.lon, s.lat);
            if(!hex || hex.type === 'water') continue;
            let j = this.spacing * 0.15;
            let x = hex.x + (hash2(hex.q, hex.r, i) - 0.5) * j * 2;
            let y = hex.y + (hash2(hex.r, hex.q, i + 7) - 0.5) * j * 2;
            this.entities.push(mkUnit(s.type || 'light', x, y, s.owner, s.name, s));
            hex.owner = s.owner;
        }
    };

    ScenarioBuilder.prototype.floodTerritory = function() {
        for(let pass = 0; pass < 8; pass++) {
            for(let hi = 0; hi < this.hexList.length; hi++) {
                let h = this.hexList[hi];
                if(h.type === 'water' || h.type === 'mountain' || h.owner > 0) continue;
                let votes = {};
                for(let di = 0; di < 8; di++) {
                    let dirs = [
                        {q:1,r:0},{q:-1,r:0},{q:0,r:1},{q:0,r:-1},
                        {q:1,r:1},{q:-1,r:-1},{q:1,r:-1},{q:-1,r:1}
                    ];
                    let d = dirs[di];
                    let n = this.hexAt(h.q + d.q, h.r + d.r);
                    if(n && n.owner > 0) votes[n.owner] = (votes[n.owner] || 0) + 1;
                }
                let best = 0, bestV = 0;
                for(let o in votes) {
                    if(votes[o] > bestV) { bestV = votes[o]; best = parseInt(o, 10); }
                }
                if(best > 0) h.owner = best;
            }
        }
    };

    ScenarioBuilder.prototype.buildRoads = function() {
        this.roads = [];
        for(let i = 0; i < this.cities.length; i++) {
            let c1 = this.cities[i];
            let nearest = null, minD = Infinity;
            for(let j = 0; j < this.cities.length; j++) {
                if(i === j) continue;
                let c2 = this.cities[j];
                let d = dist2(c1.x, c1.y, c2.x, c2.y);
                if(d < minD) { minD = d; nearest = c2; }
            }
            if(nearest) this.roads.push({ from: c1, to: nearest });
        }
    };

    ScenarioBuilder.prototype.export = function(mapShape) {
        this.buildRoads();
        let eco = this.economy;
        return {
            mapSize: this.mapRadius,
            mapRadius: this.mapRadius,
            mapShape: mapShape || 'custom',
            hexList: this.hexList,
            cities: this.cities,
            roads: this.roads,
            entities: this.entities,
            forts: this.forts,
            bridges: this.bridges,
            factionColors: this.factionColors,
            savedStartEconomy: true,
            money: eco.playerMoney != null ? eco.playerMoney : 16000,
            manpower: eco.playerManpower != null ? eco.playerManpower : 10000,
            aiMoneyByOwner: Object.assign({ 1: 0 }, eco.aiMoneyByOwner || {}),
            aiManpowerByOwner: Object.assign({ 1: 0 }, eco.aiManpowerByOwner || {})
        };
    };

    /* ── Operation Overlord — Normandy ── */
    function buildDdayMap() {
        let b = new ScenarioBuilder({
            mapRadius: 80, hr: 22,
            bbox: { minLon: -1.85, maxLon: 0.12, minLat: 48.92, maxLat: 49.82 },
            factionColors: ['#000', '#3498db', '#636e72', '#9b59b6', '#e67e22', '#f1c40f', '#1abc9c'],
            economy: {
                playerMoney: 18500, playerManpower: 12500,
                aiMoneyByOwner: { 2: 14200 }, aiManpowerByOwner: { 2: 9200 }
            }
        });

        b.buildCells(function(lon, lat, q, r) {
            if(lat > 49.58 && !(lon < -1.48 && lat < 49.72)) return 'water';
            if(lat > 49.48 && lon < -0.15 && !(lon < -1.48 && lat > 49.52)) return 'water';
            if(lon < -1.62 && lat > 49.52 && lat < 49.72) return 'water';
            if(lon < -1.68 && lat > 49.38 && lat < 49.52) return 'water';
            if(lon > -0.08 && lat > 49.55) return 'water';
            if(lon > -0.02 && lat > 49.42) return 'water';
            if(lat > 49.30 && lat < 49.44 && lon > -1.15 && lon < 0.02) return 'sand';
            if(Math.abs(lon + 0.36) < 0.04 && lat > 49.06 && lat < 49.30) return 'water';
            if(Math.abs(lon + 0.72) < 0.028 && lat > 49.04 && lat < 49.24) return 'water';
            if(Math.abs(lon + 1.05) < 0.03 && lat > 49.02 && lat < 49.18) return 'water';
            if(lon > -1.15 && lon < -0.45 && lat > 49.02 && lat < 49.36 && hash2(q, r, 3) > 0.38) return 'forest';
            if(lon > -0.05 && lon < 0.08 && lat > 49.12 && lat < 49.32 && hash2(q, r, 3) > 0.55) return 'forest';
            if(lon > -1.05 && lon < 0.0 && lat > 48.98 && lat < 49.32) {
                if(hash2(q, r, 11) > 0.42) return 'forest';
                if(hash2(q, r, 19) > 0.78) return 'hill';
            }
            if(lon < -1.42 && lat < 49.65 && lat > 49.18) {
                if(hash2(q, r, 7) > 0.72) return 'hill';
            }
            if(lon > -0.55 && lon < -0.15 && lat > 49.08 && lat < 49.22 && hash2(q, r, 37) > 0.84) return 'hill';
            return 'grass';
        }, function(lon, lat, q, r, type) {
            if(type === 'water') return 0;
            if(lon < -0.42) return 1;
            return 2;
        });

        b.addCity('Cherbourg', -1.63, 49.63, 1, { factory: true, harbor: true, radius: 2 });
        b.addCity('Carentan', -1.24, 49.31, 1, { factory: true, radius: 2 });
        b.addCity('Saint-Lô', -1.09, 49.11, 2, { factory: true, radius: 2 });
        b.addCity('Caen', -0.37, 49.18, 2, { factory: true, radius: 3, fort: true });
        b.addCity('Bayeux', -0.70, 49.28, 1, { radius: 2 });
        b.addCity('Utah Beach', -1.42, 49.42, 1, { harbor: true, radius: 1, style: 1 });
        b.addCity('Omaha Beach', -0.88, 49.36, 1, { radius: 1, style: 2 });
        b.addCity('Gold Beach', -0.52, 49.34, 1, { radius: 1, style: 3 });
        b.addCity('Juno Beach', -0.38, 49.33, 1, { radius: 1 });
        b.addCity('Sword Beach', -0.22, 49.32, 1, { radius: 1 });
        b.addCity('Coutances', -1.38, 49.05, 2, { radius: 2 });
        b.addCity('Falaise', -0.18, 48.98, 2, { factory: true, radius: 2 });

        b.addUnits([
            { name: '1st Infantry Division', type: 'heavy', owner: 1, lon: -0.86, lat: 49.35 },
            { name: '29th Infantry Division', type: 'light', owner: 1, lon: -0.90, lat: 49.37 },
            { name: '4th Infantry Division', type: 'light', owner: 1, lon: -1.40, lat: 49.41 },
            { name: '101st Airborne Division', type: 'marine', owner: 1, lon: -1.22, lat: 49.33 },
            { name: '82nd Airborne Division', type: 'marine', owner: 1, lon: -1.28, lat: 49.28 },
            { name: '2nd Ranger Battalion', type: 'light', owner: 1, lon: -0.84, lat: 49.39 },
            { name: 'British 3rd Infantry', type: 'heavy', owner: 1, lon: -0.24, lat: 49.31 },
            { name: 'Canadian 3rd Infantry', type: 'light', owner: 1, lon: -0.36, lat: 49.32 },
            { name: '352nd Infantry Division', type: 'heavy', owner: 2, lon: -0.82, lat: 49.38 },
            { name: '716th Static Infantry', type: 'light', owner: 2, lon: -0.55, lat: 49.34 },
            { name: '21st Panzer Division', type: 'heavy', owner: 2, lon: -0.32, lat: 49.22 },
            { name: '12th SS Panzer Division', type: 'heavy', owner: 2, lon: -0.28, lat: 49.15 },
            { name: 'Panzer Lehr Division', type: 'heavy', owner: 2, lon: -0.15, lat: 49.02 },
            { name: '711th Infantry Division', type: 'light', owner: 2, lon: -1.35, lat: 49.08 }
        ]);

        b.floodTerritory();
        return b.export('custom');
    }

    /* ── Battle of Berlin ── */
    function buildBerlinMap() {
        let b = new ScenarioBuilder({
            mapRadius: 80, hr: 22,
            bbox: { minLon: 13.05, maxLon: 13.82, minLat: 52.28, maxLat: 52.62 },
            factionColors: ['#000', '#c0392b', '#566573', '#9b59b6', '#e67e22', '#f1c40f', '#1abc9c'],
            economy: {
                playerMoney: 22000, playerManpower: 15000,
                aiMoneyByOwner: { 2: 7500 }, aiManpowerByOwner: { 2: 4800 }
            }
        });

        b.buildCells(function(lon, lat, q, r) {
            if(lon > 13.72 && lat < 52.42 && hash2(q, r, 2) > 0.35) return 'water';
            if(lon < 13.12 && lat > 52.46 && lat < 52.58) return 'water';
            if(Math.abs(lat - 52.46) < 0.018 && lon > 13.25 && lon < 13.65) return 'water';
            if(Math.abs(lon - 13.38) < 0.014 && lat > 52.40 && lat < 52.52) return 'water';
            if(Math.abs(lon - 13.45) < 0.01 && lat > 52.48 && lat < 52.54) return 'water';
            if(lon > 13.48 && lon < 13.58 && lat > 52.48 && lat < 52.54) return 'water';
            if(lon > 13.56 && lat > 52.50 && lat < 52.56) return 'water';
            if(lon > 13.18 && lon < 13.72 && lat > 52.34 && lat < 52.58) {
                if(hash2(q, r, 5) > 0.88) return 'forest';
                return 'grass';
            }
            if(hash2(q, r, 13) > 0.93) return 'hill';
            return 'grass';
        }, function(lon, lat, q, r, type) {
            if(type === 'water') return 0;
            if(lon > 13.44) return 1;
            return 2;
        });

        b.addCity('Reichstag — Berlin', 13.377, 52.518, 2, { factory: true, radius: 3, fort: true });
        b.addCity('Alexanderplatz', 13.413, 52.521, 2, { factory: true, radius: 2 });
        b.addCity('Tiergarten', 13.366, 52.514, 2, { radius: 2 });
        b.addCity('Spandau Citadel', 13.200, 52.535, 2, { fort: true, radius: 2 });
        b.addCity('Köpenick', 13.582, 52.445, 1, { factory: true, radius: 2 });
        b.addCity('Tempelhof', 13.385, 52.475, 2, { radius: 2, factory: true });
        b.addCity('Potsdam', 13.064, 52.391, 1, { factory: true, radius: 2 });
        b.addCity('Frankfurt (Oder) Bridgehead', 13.760, 52.430, 1, { radius: 2 });
        b.addCity('Charlottenburg', 13.304, 52.505, 2, { radius: 2 });
        b.addCity('Treptow', 13.492, 52.488, 1, { radius: 2 });

        b.addUnits([
            { name: '1st Belorussian Front', type: 'heavy', owner: 1, lon: 13.58, lat: 52.46 },
            { name: '8th Guards Army', type: 'heavy', owner: 1, lon: 13.52, lat: 52.48 },
            { name: '1st Guards Tank Army', type: 'heavy', owner: 1, lon: 13.48, lat: 52.50 },
            { name: '5th Shock Army', type: 'light', owner: 1, lon: 13.62, lat: 52.44 },
            { name: '2nd Guards Tank Army', type: 'heavy', owner: 1, lon: 13.44, lat: 52.52 },
            { name: '3rd Shock Army', type: 'light', owner: 1, lon: 13.68, lat: 52.42 },
            { name: '9th Parachute Division', type: 'marine', owner: 2, lon: 13.39, lat: 52.51 },
            { name: 'SS Nordland Division', type: 'heavy', owner: 2, lon: 13.36, lat: 52.52 },
            { name: 'Citizen Militia — Mitte', type: 'light', owner: 2, lon: 13.40, lat: 52.52 },
            { name: 'Citizen Militia — Spandau', type: 'light', owner: 2, lon: 13.22, lat: 52.53 },
            { name: 'Hitler Youth Battalion', type: 'light', owner: 2, lon: 13.35, lat: 52.50 },
            { name: '11th SS Panzergrenadier', type: 'heavy', owner: 2, lon: 13.32, lat: 52.49 },
            { name: 'Müncheberg Panzer Division', type: 'heavy', owner: 2, lon: 13.42, lat: 52.48 }
        ]);

        b.floodTerritory();
        return b.export('custom');
    }

    /* ── American Civil War — Gettysburg Campaign ── */
    function buildAcwMap() {
        let b = new ScenarioBuilder({
            mapRadius: 80, hr: 22,
            bbox: { minLon: -78.35, maxLon: -76.05, minLat: 38.15, maxLat: 40.35 },
            factionColors: ['#000', '#2c3e7a', '#8b1a1a', '#9b59b6', '#e67e22', '#f1c40f', '#1abc9c'],
            economy: {
                playerMoney: 16500, playerManpower: 11500,
                aiMoneyByOwner: { 2: 12800 }, aiManpowerByOwner: { 2: 10200 }
            }
        });

        b.buildCells(function(lon, lat, q, r) {
            if(lat < 38.55 && lon > -77.05 && lon < -76.35) return 'water';
            if(lat < 39.05 && lon > -76.95 && lon < -76.15) return 'water';
            if(Math.abs(lon + 76.35) < 0.05 && lat > 38.85 && lat < 39.35) return 'water';
            if(Math.abs(lon + 77.05) < 0.045 && lat > 39.20 && lat < 39.58) return 'water';
            if(Math.abs(lon + 76.85) < 0.035 && lat > 39.42 && lat < 39.78) return 'water';
            if(Math.abs(lon + 77.45) < 0.025 && lat > 38.28 && lat < 38.42) return 'water';
            if(lon < -77.55 && hash2(q, r, 17) > 0.55) return 'forest';
            if(lon > -76.55 && lat > 39.85 && hash2(q, r, 23) > 0.65) return 'forest';
            if(lon > -77.8 && lat < 39.35 && hash2(q, r, 29) > 0.58) return 'forest';
            if(Math.abs(lon + 77.23) < 0.04 && Math.abs(lat - 39.83) < 0.05 && hash2(q, r, 47) > 0.55) return 'hill';
            if(lon < -77.65 && lat > 39.55 && lat < 40.05 && hash2(q, r, 31) > 0.82) return 'hill';
            if(hash2(q, r, 31) > 0.90) return 'hill';
            if(lat > 39.95 && hash2(q, r, 41) > 0.82) return 'hill';
            return 'grass';
        }, function(lon, lat, q, r, type) {
            if(type === 'water') return 0;
            if(lat > 39.72 || (lat > 39.55 && lon > -77.0)) return 1;
            return 2;
        });

        b.addCity('Gettysburg', -77.231, 39.831, 1, { factory: true, radius: 2, fort: true });
        b.addCity('Washington', -77.036, 38.907, 1, { factory: true, harbor: true, radius: 3 });
        b.addCity('Baltimore', -76.612, 39.290, 1, { factory: true, harbor: true, radius: 3 });
        b.addCity('Harrisburg', -76.886, 40.261, 1, { factory: true, radius: 2 });
        b.addCity('Frederick', -77.410, 39.414, 2, { factory: true, radius: 2 });
        b.addCity('Chambersburg', -77.661, 39.938, 2, { radius: 2 });
        b.addCity('York', -76.728, 39.963, 2, { factory: true, radius: 2 });
        b.addCity('Hanover', -76.982, 39.797, 1, { radius: 2 });
        b.addCity('Carlisle', -77.189, 40.201, 1, { radius: 2 });
        b.addCity('Winchester', -78.163, 39.186, 2, { radius: 2 });
        b.addCity('Fredericksburg', -77.460, 38.303, 2, { factory: true, radius: 2 });

        b.addUnits([
            { name: 'Army of the Potomac', type: 'heavy', owner: 1, lon: -77.20, lat: 39.84 },
            { name: 'I Corps — Reynolds', type: 'light', owner: 1, lon: -77.24, lat: 39.83 },
            { name: 'XI Corps — Howard', type: 'light', owner: 1, lon: -77.22, lat: 39.85 },
            { name: 'Cavalry Corps — Buford', type: 'marine', owner: 1, lon: -77.26, lat: 39.82 },
            { name: 'VI Corps — Sedgwick', type: 'light', owner: 1, lon: -77.18, lat: 39.86 },
            { name: 'XII Corps — Slocum', type: 'light', owner: 1, lon: -77.25, lat: 39.87 },
            { name: 'Army of Northern Virginia', type: 'heavy', owner: 2, lon: -77.35, lat: 39.78 },
            { name: 'I Corps — Longstreet', type: 'heavy', owner: 2, lon: -77.38, lat: 39.76 },
            { name: 'II Corps — Ewell', type: 'light', owner: 2, lon: -77.32, lat: 39.80 },
            { name: 'III Corps — A.P. Hill', type: 'light', owner: 2, lon: -77.40, lat: 39.79 },
            { name: 'Cavalry — J.E.B. Stuart', type: 'marine', owner: 2, lon: -77.05, lat: 39.70 },
            { name: 'Pickett\'s Division', type: 'heavy', owner: 2, lon: -77.42, lat: 39.77 },
            { name: 'Rhodes\' Division', type: 'light', owner: 2, lon: -77.30, lat: 39.78 }
        ]);

        b.floodTerritory();
        return b.export('custom');
    }

    const SCENARIOS = [
        {
            id: 'dday',
            shopId: 'map_scenario_dday',
            name: 'Operation Overlord',
            subtitle: 'Normandy — 6 June 1944',
            period: 'modern',
            aiCount: 1,
            playerOwner: 1,
            playerLabel: 'Allied Forces',
            enemyLabel: 'German 7th Army',
            description: 'Storm the Atlantic Wall. Allied beachheads against fortified German defenses in the Cotentin and Caen sector.',
            build: buildDdayMap
        },
        {
            id: 'berlin',
            shopId: 'map_scenario_berlin',
            name: 'Fall of Berlin',
            subtitle: 'Berlin — April 1945',
            period: 'modern',
            aiCount: 1,
            playerOwner: 1,
            playerLabel: 'Red Army',
            enemyLabel: 'Berlin Garrison',
            description: 'The final assault on the Reich capital. Soviet forces close on the Reichstag against a desperate last stand.',
            build: buildBerlinMap
        },
        {
            id: 'acw',
            shopId: 'map_scenario_acw',
            name: 'Gettysburg Campaign',
            subtitle: 'Pennsylvania — July 1863',
            period: 'napoleonic',
            aiCount: 1,
            playerOwner: 1,
            playerLabel: 'Union Army',
            enemyLabel: 'Confederate Army',
            description: 'The armies collide in Pennsylvania. Union forces defend Washington and Baltimore against Lee\'s invasion.',
            build: buildAcwMap
        }
    ];

    const _cache = {};

    function getScenario(id) {
        return SCENARIOS.find(s => s.id === id) || null;
    }

    function getScenarioByShopId(shopId) {
        return SCENARIOS.find(s => s.shopId === shopId) || null;
    }

    function getMapData(id) {
        let cacheKey = id + '@v' + SCENARIO_BUILD_VER;
        if(_cache[cacheKey]) return _cache[cacheKey];
        let sc = getScenario(id);
        if(!sc || typeof sc.build !== 'function') return null;
        _cache[cacheKey] = sc.build();
        return _cache[cacheKey];
    }

    global.WodScenarios = {
        SCENARIOS,
        COST: WOD_SCENARIO_COST,
        getScenario,
        getScenarioByShopId,
        getMapData,
        list: function() { return SCENARIOS.slice(); }
    };
})(typeof window !== 'undefined' ? window : globalThis);
