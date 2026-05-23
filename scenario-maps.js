/**
 * Shop scenario maps — hand-authored geographic battle maps (not procedurally generated).
 */
(function(global) {
    'use strict';

    const WOD_SCENARIO_COST = 250;
    const SCENARIO_BUILD_VER = 5;

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

    function pointInPoly(lon, lat, poly) {
        let inside = false;
        for(let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            let xi = poly[i][0], yi = poly[i][1];
            let xj = poly[j][0], yj = poly[j][1];
            if(((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi))
                inside = !inside;
        }
        return inside;
    }

    function distToSegment(lon, lat, lon1, lat1, lon2, lat2) {
        let dx = lon2 - lon1, dy = lat2 - lat1;
        let len2 = dx * dx + dy * dy;
        if(len2 < 1e-12) return Math.hypot(lon - lon1, lat - lat1);
        let t = Math.max(0, Math.min(1, ((lon - lon1) * dx + (lat - lat1) * dy) / len2));
        let px = lon1 + t * dx, py = lat1 + t * dy;
        return Math.hypot(lon - px, lat - py);
    }

    function nearRiver(lon, lat, segments, width) {
        width = width || 0.018;
        for(let i = 0; i < segments.length; i++) {
            let s = segments[i];
            if(distToSegment(lon, lat, s[0], s[1], s[2], s[3]) < width) return true;
        }
        return false;
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
        u.uid = extra.uid || ('scn_' + owner + '_' + type + '_' + Math.random().toString(36).slice(2, 9));
        return u;
    }

    function ScenarioBuilder(cfg) {
        this.id = cfg.id || '';
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

    ScenarioBuilder.prototype.inBbox = function(lon, lat, pad) {
        pad = pad || 0;
        let b = this.bbox;
        return lon >= b.minLon - pad && lon <= b.maxLon + pad && lat >= b.minLat - pad && lat <= b.maxLat + pad;
    };

    ScenarioBuilder.prototype.geoToGrid = function(lon, lat) {
        let b = this.bbox;
        let tq = ((lon - b.minLon) / (b.maxLon - b.minLon)) * (this.cols * 2) - this.cols;
        let tr = ((lat - b.minLat) / (b.maxLat - b.minLat)) * (this.rows * 2) - this.rows;
        return { q: Math.round(tq), r: Math.round(tr) };
    };

    ScenarioBuilder.prototype.hexAt = function(q, r) {
        return this.hexes[q + ',' + r] || null;
    };

    ScenarioBuilder.prototype.nearestHex = function(lon, lat) {
        let g = this.geoToGrid(lon, lat);
        let hex = this.hexAt(g.q, g.r);
        if(hex && hex.type !== 'water') return hex;
        for(let ring = 1; ring <= 10; ring++) {
            for(let dq = -ring; dq <= ring; dq++) {
                for(let dr = -ring; dr <= ring; dr++) {
                    let h = this.hexAt(g.q + dq, g.r + dr);
                    if(h && h.type !== 'water') return h;
                }
            }
        }
        return hex;
    };

    function nearPolyEdge(lon, lat, poly, maxDist) {
        maxDist = maxDist || 0.028;
        for(let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            if(distToSegment(lon, lat, poly[j][0], poly[j][1], poly[i][0], poly[i][1]) < maxDist) return true;
        }
        return false;
    }

    /** Only place land hexes plus a narrow coastal water band — no full rectangular grid. */
    ScenarioBuilder.prototype.buildGeoMap = function(regionFn, terrainFn, ownerFn) {
        let b = this.bbox;
        let pendingLand = [];
        for(let r = -this.rows; r <= this.rows; r++) {
            for(let q = -this.cols; q <= this.cols; q++) {
                let lon = b.minLon + ((q + this.cols) / (this.cols * 2)) * (b.maxLon - b.minLon);
                let lat = b.minLat + ((r + this.rows) / (this.rows * 2)) * (b.maxLat - b.minLat);
                let region = regionFn(lon, lat, q, r, this);
                if(region !== 'land') continue;
                let type = terrainFn(lon, lat, q, r, this);
                if(!type || type === 'void' || type === 'water') type = 'grass';
                pendingLand.push({ q, r, lon, lat, type });
            }
        }
        let placeHex = (q, r, lon, lat, type, owner) => {
            let key = q + ',' + r;
            if(this.hexes[key]) return;
            let x = q * this.spacing, y = r * this.spacing;
            let hex = {
                q, r, x, y, type, owner: owner || 0,
                baseColor: terrainColor(type),
                renderColor: terrainColor(type)
            };
            this.hexes[key] = hex;
            this.hexList.push(hex);
        };
        for(let i = 0; i < pendingLand.length; i++) {
            let p = pendingLand[i];
            let owner = ownerFn ? ownerFn(p.lon, p.lat, p.q, p.r, p.type, this) : 0;
            placeHex(p.q, p.r, p.lon, p.lat, p.type, owner);
        }
        let landKeys = new Set(pendingLand.map(p => p.q + ',' + p.r));
        let coastBand = [];
        for(let i = 0; i < pendingLand.length; i++) {
            let p = pendingLand[i];
            for(let dq = -3; dq <= 3; dq++) {
                for(let dr = -3; dr <= 3; dr++) {
                    if(!dq && !dr) continue;
                    let nq = p.q + dq, nr = p.r + dr, nk = nq + ',' + nr;
                    if(landKeys.has(nk)) continue;
                    let lon = b.minLon + ((nq + this.cols) / (this.cols * 2)) * (b.maxLon - b.minLon);
                    let lat = b.minLat + ((nr + this.rows) / (this.rows * 2)) * (b.maxLat - b.minLat);
                    coastBand.push({ q: nq, r: nr, lon, lat });
                }
            }
        }
        for(let i = 0; i < coastBand.length; i++) {
            let c = coastBand[i];
            let key = c.q + ',' + c.r;
            if(this.hexes[key]) continue;
            let region = regionFn(c.lon, c.lat, c.q, c.r, this);
            if(region === 'void') continue;
            if(region === 'land') continue;
            placeHex(c.q, c.r, c.lon, c.lat, 'water', 0);
        }
    };

    ScenarioBuilder.prototype.addCity = function(name, lon, lat, owner, opts) {
        opts = opts || {};
        let hex = this.nearestHex(lon, lat);
        if(!hex || hex.type === 'water') return null;
        let id = 'city_' + this.id + '_' + this.cities.length;
        let city = {
            id, name, x: hex.x, y: hex.y, q: hex.q, r: hex.r,
            owner: owner || 1,
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
                if(!h || h.type === 'water') continue;
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
            if(hex.type !== 'urban') hex.owner = s.owner;
        }
    };

    ScenarioBuilder.prototype.claimCityZones = function() {
        for(let city of this.cities) {
            if(!city || city.owner <= 0) continue;
            let R = 4;
            for(let dq = -R; dq <= R; dq++) {
                for(let dr = -R; dr <= R; dr++) {
                    if(dq * dq + dr * dr > (R + 1) * (R + 1)) continue;
                    let h = this.hexAt(city.q + dq, city.r + dr);
                    if(!h || h.type === 'water') continue;
                    if(h.owner > 0 && h.owner !== city.owner) continue;
                    h.owner = city.owner;
                }
            }
        }
    };

    ScenarioBuilder.prototype.floodTerritory = function() {
        for(let pass = 0; pass < 10; pass++) {
            for(let hi = 0; hi < this.hexList.length; hi++) {
                let h = this.hexList[hi];
                if(h.type === 'water' || h.owner > 0) continue;
                let votes = {};
                let dirs = [
                    {q:1,r:0},{q:-1,r:0},{q:0,r:1},{q:0,r:-1},
                    {q:1,r:1},{q:-1,r:-1},{q:1,r:-1},{q:-1,r:1}
                ];
                for(let di = 0; di < dirs.length; di++) {
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

    ScenarioBuilder.prototype.export = function() {
        this.buildRoads();
        let eco = this.economy;
        return {
            scenarioId: this.id,
            mapSize: this.mapRadius,
            mapRadius: this.mapRadius,
            mapShape: 'custom',
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

    /* ── Normandy landmass (simplified Cotentin + Calvados coast) ── */
    const NORMANDY_LAND = [
        [-1.78, 49.70], [-1.72, 49.55], [-1.58, 49.48], [-1.48, 49.40],
        [-1.42, 49.08], [-1.22, 48.93], [-0.78, 48.91], [-0.38, 48.93],
        [-0.10, 49.06], [-0.05, 49.22], [-0.08, 49.32], [-0.18, 49.35],
        [-0.45, 49.31], [-0.75, 49.32], [-1.05, 49.33], [-1.30, 49.36],
        [-1.48, 49.42], [-1.58, 49.52], [-1.72, 49.62], [-1.78, 49.70]
    ];

    const NORMANDY_RIVERS = [
        [-1.12, 49.05, -1.05, 49.28],
        [-0.45, 49.02, -0.38, 49.22],
        [-1.35, 49.08, -1.28, 49.30]
    ];

    function buildDdayMap() {
        let b = new ScenarioBuilder({
            id: 'dday',
            mapRadius: 80, hr: 22,
            bbox: { minLon: -1.82, maxLon: 0.05, minLat: 48.88, maxLat: 49.78 },
            factionColors: ['#000', '#3498db', '#636e72', '#9b59b6', '#e67e22', '#f1c40f', '#1abc9c'],
            economy: {
                playerMoney: 18500, playerManpower: 12500,
                aiMoneyByOwner: { 2: 14200 }, aiManpowerByOwner: { 2: 9200 }
            }
        });

        b.buildGeoMap(
            function(lon, lat) {
                if(!b.inBbox(lon, lat, 0.04)) return 'void';
                if(pointInPoly(lon, lat, NORMANDY_LAND)) return 'land';
                if(nearPolyEdge(lon, lat, NORMANDY_LAND, 0.032)) return 'water';
                return 'void';
            },
            function(lon, lat, q, r) {
                if(lat > 49.30 && lat < 49.44 && lon > -1.10 && lon < 0.0) return 'sand';
                if(nearRiver(lon, lat, NORMANDY_RIVERS, 0.022)) return 'water';
                if(lon > -1.15 && lon < -0.45 && lat > 49.02 && lat < 49.36 && hash2(q, r, 3) > 0.35) return 'forest';
                if(lon > -1.05 && lon < 0.0 && lat > 48.98 && lat < 49.32) {
                    if(hash2(q, r, 11) > 0.40) return 'forest';
                    if(hash2(q, r, 19) > 0.76) return 'hill';
                }
                if(lon > -0.55 && lon < -0.15 && lat > 49.08 && lat < 49.22 && hash2(q, r, 37) > 0.82) return 'hill';
                return 'grass';
            },
            function(lon, lat, q, r, type) {
                if(type === 'water') return 0;
                return lon < -0.42 ? 1 : 2;
            }
        );

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
            { name: 'British 3rd Infantry', type: 'heavy', owner: 1, lon: -0.24, lat: 49.31 },
            { name: 'Canadian 3rd Infantry', type: 'light', owner: 1, lon: -0.36, lat: 49.32 },
            { name: '352nd Infantry Division', type: 'heavy', owner: 2, lon: -0.82, lat: 49.38 },
            { name: '716th Static Infantry', type: 'light', owner: 2, lon: -0.55, lat: 49.34 },
            { name: '21st Panzer Division', type: 'heavy', owner: 2, lon: -0.32, lat: 49.22 },
            { name: '12th SS Panzer Division', type: 'heavy', owner: 2, lon: -0.28, lat: 49.15 },
            { name: 'Panzer Lehr Division', type: 'heavy', owner: 2, lon: -0.15, lat: 49.02 }
        ]);

        b.claimCityZones();
        b.floodTerritory();
        return b.export();
    }

    /* ── Berlin & approaches ── */
    const BERLIN_LAND = [
        [13.02, 52.38], [13.05, 52.56], [13.22, 52.60], [13.48, 52.58],
        [13.72, 52.52], [13.78, 52.40], [13.68, 52.32], [13.42, 52.30],
        [13.12, 52.32], [13.02, 52.38]
    ];

    const BERLIN_RIVERS = [
        [13.20, 52.52, 13.55, 52.52],
        [13.38, 52.40, 13.38, 52.54],
        [13.44, 52.48, 13.58, 52.50]
    ];

    function buildBerlinMap() {
        let b = new ScenarioBuilder({
            id: 'berlin',
            mapRadius: 80, hr: 22,
            bbox: { minLon: 12.98, maxLon: 13.82, minLat: 52.28, maxLat: 52.62 },
            factionColors: ['#000', '#c0392b', '#566573', '#9b59b6', '#e67e22', '#f1c40f', '#1abc9c'],
            economy: {
                playerMoney: 22000, playerManpower: 15000,
                aiMoneyByOwner: { 2: 7500 }, aiManpowerByOwner: { 2: 4800 }
            }
        });

        b.buildGeoMap(
            function(lon, lat) {
                if(!b.inBbox(lon, lat, 0.02)) return 'void';
                if(pointInPoly(lon, lat, BERLIN_LAND)) return 'land';
                if(nearPolyEdge(lon, lat, BERLIN_LAND, 0.022)) return 'water';
                return 'void';
            },
            function(lon, lat, q, r) {
                if(nearRiver(lon, lat, BERLIN_RIVERS, 0.012)) return 'water';
                if(lon < 13.14 && lat > 52.46 && lat < 52.58) return 'water';
                if(lon > 13.18 && lon < 13.72 && lat > 52.34 && lat < 52.58 && hash2(q, r, 5) > 0.86) return 'forest';
                if(hash2(q, r, 13) > 0.92) return 'hill';
                return 'grass';
            },
            function(lon, lat) {
                if(lon > 13.44) return 1;
                return 2;
            }
        );

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
            { name: '9th Parachute Division', type: 'marine', owner: 2, lon: 13.39, lat: 52.51 },
            { name: 'SS Nordland Division', type: 'heavy', owner: 2, lon: 13.36, lat: 52.52 },
            { name: 'Citizen Militia — Mitte', type: 'light', owner: 2, lon: 13.40, lat: 52.52 },
            { name: 'Citizen Militia — Spandau', type: 'light', owner: 2, lon: 13.22, lat: 52.53 },
            { name: '11th SS Panzergrenadier', type: 'heavy', owner: 2, lon: 13.32, lat: 52.49 },
            { name: 'Müncheberg Panzer Division', type: 'heavy', owner: 2, lon: 13.42, lat: 52.48 }
        ]);

        b.claimCityZones();
        b.floodTerritory();
        return b.export();
    }

    /* ── Gettysburg campaign region (PA / MD / northern VA) ── */
    const ACW_LAND = [
        [-78.30, 39.05], [-78.28, 39.45], [-78.05, 39.85], [-77.55, 40.15],
        [-76.85, 40.28], [-76.20, 40.05], [-76.05, 39.55], [-76.15, 39.05],
        [-76.55, 38.55], [-77.15, 38.35], [-77.65, 38.45], [-78.05, 38.75],
        [-78.30, 39.05]
    ];

    const ACW_RIVERS = [
        [-77.05, 38.85, -77.05, 39.55],
        [-76.85, 39.45, -76.85, 39.78],
        [-77.45, 38.30, -77.45, 38.55]
    ];

    function buildAcwMap() {
        let b = new ScenarioBuilder({
            id: 'acw',
            mapRadius: 80, hr: 22,
            bbox: { minLon: -78.32, maxLon: -76.08, minLat: 38.22, maxLat: 40.32 },
            factionColors: ['#000', '#2c3e7a', '#8b1a1a', '#9b59b6', '#e67e22', '#f1c40f', '#1abc9c'],
            economy: {
                playerMoney: 16500, playerManpower: 11500,
                aiMoneyByOwner: { 2: 12800 }, aiManpowerByOwner: { 2: 10200 }
            }
        });

        b.buildGeoMap(
            function(lon, lat) {
                if(!b.inBbox(lon, lat, 0.03)) return 'void';
                if(pointInPoly(lon, lat, ACW_LAND)) return 'land';
                if(nearPolyEdge(lon, lat, ACW_LAND, 0.030)) return 'water';
                return 'void';
            },
            function(lon, lat, q, r) {
                if(nearRiver(lon, lat, ACW_RIVERS, 0.022)) return 'water';
                if(lon < -77.55 && hash2(q, r, 17) > 0.52) return 'forest';
                if(lon > -76.55 && lat > 39.85 && hash2(q, r, 23) > 0.62) return 'forest';
                if(Math.abs(lon + 77.23) < 0.05 && Math.abs(lat - 39.83) < 0.06 && hash2(q, r, 47) > 0.50) return 'hill';
                if(lon < -77.65 && lat > 39.55 && lat < 40.05 && hash2(q, r, 31) > 0.80) return 'hill';
                if(hash2(q, r, 31) > 0.90) return 'hill';
                return 'grass';
            },
            function(lon, lat) {
                if(lat > 39.72 || (lat > 39.55 && lon > -77.0)) return 1;
                return 2;
            }
        );

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
            { name: 'Army of Northern Virginia', type: 'heavy', owner: 2, lon: -77.35, lat: 39.78 },
            { name: 'I Corps — Longstreet', type: 'heavy', owner: 2, lon: -77.38, lat: 39.76 },
            { name: 'II Corps — Ewell', type: 'light', owner: 2, lon: -77.32, lat: 39.80 },
            { name: 'III Corps — A.P. Hill', type: 'light', owner: 2, lon: -77.40, lat: 39.79 },
            { name: 'Cavalry — J.E.B. Stuart', type: 'marine', owner: 2, lon: -77.05, lat: 39.70 },
            { name: 'Pickett\'s Division', type: 'heavy', owner: 2, lon: -77.42, lat: 39.77 }
        ]);

        b.claimCityZones();
        b.floodTerritory();
        return b.export();
    }

    const SCENARIOS = [
        {
            id: 'dday',
            shopId: 'map_scenario_dday',
            name: 'Operation Overlord',
            subtitle: 'Normandy — 6 June 1944',
            period: 'modern',
            aiCount: 1,
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
        BUILD_VER: SCENARIO_BUILD_VER,
        getScenario,
        getScenarioByShopId,
        getMapData,
        list: function() { return SCENARIOS.slice(); }
    };
})(typeof window !== 'undefined' ? window : globalThis);
