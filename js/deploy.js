// Spawning and starting deployment of armies.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

function getHexKey(hex) {
    if(!hex) return '';
    return hex._k || (hex._k = hex.q + ',' + hex.r);
}
function wodHexKeyIsEncircled(key) {
    if(!key) return false;
    const hex=gameData.hexes[key];
    if(!hex||hex.owner<=0||isWaterHex(hex))return false;
    // Closing a corridor must be visible before the incremental pocket
    // scan finishes, just as reopening one clears stale flags at once.
    // Coastal territory still requires ordinary capture, never surrender.
    const supply=wodCurrentSupplyComponent(hex,hex.owner);
    return !supply.city&&!supply.water;
}
function wodHexKeyEncirclementRelief(key) {
    if(!key) return false;
    let w = gameData._encircWork;
    if(w && w.encircledReliefHexes && w.encircledReliefHexes.has(key)) return true;
    return !!(gameData.encircledReliefHexes && gameData.encircledReliefHexes.has(key));
}
function wodGetHexEncirclementState(hex) {
    if(!hex) return null;
    let k = getHexKey(hex);
    if(!wodHexKeyIsEncircled(k)) return null;
    return { relief: wodHexKeyEncirclementRelief(k) };
}
function ensureUnitId(unit) {
    unit.speed = wodUnitBaseSpeed(unit);
    if(!unit.uid) {
        gameData.nextUnitId = (gameData.nextUnitId || 1) + 1;
        unit.uid = 'unit_' + gameData.nextUnitId;
    }
    if(unit.type !== 'convoy') {
        if(unit.morale == null) unit.morale = WOD_MORALE_MAX;
        if(unit.maxMorale == null) unit.maxMorale = WOD_MORALE_MAX;
        if(unit.moraleBroken == null) unit.moraleBroken = false;
        if(unit.xp == null) unit.xp = 0;
        if(unit.kills == null) unit.kills = 0;
        if(unit.losses == null) unit.losses = 0;
        if(unit.tankKills == null) unit.tankKills = 0;
        if(unit.tankLosses == null) unit.tankLosses = 0;
    }
    return unit.uid;
}
function wodIsUnitVeteran(unit) {
    return !!(unit && unit.type !== 'convoy' && (unit.veteran || (unit.xp || 0) >= WOD_VETERAN_XP_THRESHOLD));
}
function wodVeteranStatMult(unit) {
    return wodIsUnitVeteran(unit) ? WOD_VETERAN_STAT_MULT : 1;
}
function wodGrantUnitCombatXp(attacker, casualtiesDealt, dmgAmt) {
    if(!attacker || attacker.type === 'convoy' || dmgAmt <= 0) return;
    if(attacker.xp == null) attacker.xp = 0;
    if(attacker.kills == null) attacker.kills = 0;
    let xpGain = (dmgAmt / Math.max(1, attacker.maxHp)) * 14;
    if(casualtiesDealt > 0) {
        attacker.kills += casualtiesDealt;
        xpGain += casualtiesDealt * 0.02;
    }
    attacker.xp += xpGain * 0.5;
    if(!attacker.veteran && attacker.xp >= WOD_VETERAN_XP_THRESHOLD) attacker.veteran = true;
}
function wodGetOwnerSpawnAnchorHexes(owner) {
    let probe = { type: 'light', owner };
    let fronts = wodCachedFrontlineHexes(owner).filter(h => h.type !== 'mountain' && canUnitEnterHex(probe, h));
    if(fronts.length > 0) return fronts;
    if(gameData.mapShape !== 'archipelago') return fronts;
    let enemy = [];
    for(let h of gameData.hexList) {
        if(!h || !h.owner || h.owner === owner) continue;
        if(!isClaimableLand(h) || isWaterHex(h)) continue;
        enemy.push(h);
    }
    if(!enemy.length) return fronts;
    let mine = [];
    for(let h of gameData.hexList) {
        if(!h || h.owner !== owner) continue;
        if(!isClaimableLand(h) || isWaterHex(h) || h.type === 'mountain') continue;
        if(!canUnitEnterHex(probe, h)) continue;
        mine.push(h);
    }
    if(!mine.length) return fronts;
    let hr = Math.max(gameData.hexRadius || 10, 8);
    let band = Math.pow(hr * (14 + Math.min(28, (gameData.mapRadius || 40) * 0.22)), 2);
    let scored = [];
    for(let h of mine) {
        let d = Infinity;
        for(let e of enemy) {
            let dx = h.x - e.x,
                dy = h.y - e.y;
            d = Math.min(d, dx * dx + dy * dy);
        }
        scored.push({ h, d });
    }
    scored.sort((a, b) => a.d - b.d);
    let bestD = scored[0].d;
    let cap = bestD + band;
    let out = [];
    for(let s of scored) {
        if(s.d <= cap) out.push(s.h);
    }
    if(out.length < 8) out = scored.slice(0, Math.min(32, scored.length)).map(s => s.h);
    return out;
}
function getOwnerFrontlineHexes(owner) {
    // (plain loops: this runs over every cell of the map for each faction every strategy pulse)
    const out = [], list = gameData.hexList;
    for(let i = 0, n = list.length; i < n; i++) {
        const hex = list[i];
        if(hex.owner !== owner || !isClaimableLand(hex) || hex.type === 'mountain') continue;
        const nb = getNeighborHexes(hex);
        for(let j = 0; j < nb.length; j++) { const nHex = nb[j]; if(isClaimableLand(nHex) && (nHex.owner === 0 || wodIsHostileOwner(nHex.owner, owner))) { out.push(hex); break; } }
    }
    return out;
}
function nearestHexDistanceSq(x, y, hexes) {
    let best = Infinity;
    for(let hex of hexes) {
        let dx = hex.x - x;
        let dy = hex.y - y;
        let d = dx * dx + dy * dy;
        if(d < best) best = d;
    }
    return best;
}
function nearestForeignCombatUnitDistSq(x, y, owner) {
    let best = Infinity;
    let grid = gameData.unitSpatialGrid;
    let probeR = (gameData.hexRadius || 20) * 32;
    if(grid && grid.cells) {
        forEachNearbyUnit(grid, x, y, probeR, (u) => {
            if(u.hp <= 0 || u.type === 'convoy' || !wodIsHostileOwner(u.owner, owner) || !wodOwnerCanSee(owner,u)) return;
            let dx = u.x - x;
            let dy = u.y - y;
            let d = dx * dx + dy * dy;
            if(d < best) best = d;
        });
        if(best !== Infinity) return best;
    }
    for(let u of gameData.entities) {
        if(u.hp <= 0 || u.type === 'convoy' || !wodIsHostileOwner(u.owner, owner) || !wodOwnerCanSee(owner,u)) continue;
        let dx = u.x - x;
        let dy = u.y - y;
        let d = dx * dx + dy * dy;
        if(d < best) best = d;
    }
    return best;
}
function nearestFriendlyLandArmyDistSq(x, y, owner) {
    let best = Infinity;
    for(let u of gameData.entities) {
        if(u.hp <= 0 || u.owner !== owner) continue;
        if(!isLandArmyUnit(u)) continue;
        let dx = u.x - x,
            dy = u.y - y;
        let d = dx * dx + dy * dy;
        if(d < best) best = d;
    }
    return best;
}
function isArmyStartSpawnHex(unit, hex) {
    if(!hex || !unit) return false;
    if(hex.owner !== unit.owner) return false;
    if(isWaterHex(hex) || hex.type === 'mountain') return false;
    return isClaimableLand(hex);
}
/** Multi-source BFS from all enemy land, cached per owner. Replaces an O(n) full-map
 *  scan per query (which made unit start-placement O(n^2) and froze match start). */
function wodEnsureEnemyDistanceField(owner) {
    let cache = gameData._enemyDistField;
    if(!cache) cache = gameData._enemyDistField = {};
    let f = cache[owner];
    if(f) return f;
    let steps = {};
    let queue = [];
    for(let h of gameData.hexList) {
        if(!h || !h.owner || h.owner === owner || h.owner === 0) continue;
        if(!isClaimableLand(h) || isWaterHex(h)) continue;
        steps[getHexKey(h)] = 0;
        queue.push(h);
    }
    for(let qi = 0; qi < queue.length; qi++) {
        let cur = queue[qi];
        let s = steps[getHexKey(cur)] + 1;
        for(let dir of hexDirections) {
            let nKey = `${cur.q + dir.q},${cur.r + dir.r}`;
            if(steps[nKey] !== undefined) continue;
            let nHex = gameData.hexes[nKey];
            if(!nHex) continue;
            steps[nKey] = s;
            queue.push(nHex);
        }
    }
    f = { steps, spacing: gameData.hexRadius * 1.35 };
    cache[owner] = f;
    return f;
}
function wodMinDistSqToEnemyTerritory(x, y, owner) {
    let f = wodEnsureEnemyDistanceField(owner);
    let h = getNearestHexToPoint(x, y);
    if(!h) return Infinity;
    let s = f.steps[getHexKey(h)];
    if(s === undefined) return Infinity;
    let d = s * f.spacing;
    return d * d;
}
function getNearestArmyStartSpawnHex(unit, x, y, ringMax) {
    let probe = { type: unit.type, owner: unit.owner };
    let ring = ringMax != null ? ringMax : 12;
    let primary = getNearestHexToPoint(x, y);
    if(primary && isArmyStartSpawnHex(probe, primary)) return primary;
    let center = pixelToHex(x, y);
    let best = null, bestD = Infinity;
    for(let dq = -ring; dq <= ring; dq++) {
        for(let dr = -ring; dr <= ring; dr++) {
            let h = wodHexAt(center.q + dq,center.r + dr);
            if(!isArmyStartSpawnHex(probe, h)) continue;
            let dx = h.x - x, dy = h.y - y;
            let d = dx * dx + dy * dy;
            if(d < bestD) { bestD = d; best = h; }
        }
    }
    return best;
}
function ensureStartUnitOnLandHex(unit, preferHex) {
    if(!unit || wodIsNavalUnit(unit) || unit.type === 'convoy') return;
    let probe = { type: unit.type, owner: unit.owner };
    let h = getNearestHexToPoint(unit.x, unit.y);
    if(h && isArmyStartSpawnHex(probe, h) && !isFrontlineHex(h, unit.owner)) return;
    let safe = preferHex && isArmyStartSpawnHex(probe, preferHex) && !isFrontlineHex(preferHex, unit.owner)
        ? preferHex
        : getNearestArmyStartSpawnHex(unit, unit.x, unit.y, 14);
    if(safe) {
        unit.x = safe.x;
        unit.y = safe.y;
    }
}
async function smoothStartingTerritory(ownerIds, minVotesOpt, passesOpt) {
    if(!ownerIds || ownerIds.length === 0) return;
    let minVotes = minVotesOpt != null ? minVotesOpt : 6;
    let passes = passesOpt != null ? passesOpt : 2;
    let valid = new Set(ownerIds);
    for(let pass = 0; pass < passes; pass++) {
        await wodMapGenYieldSlice();
        let changes = [];
        let hi = 0;
        for(let hex of gameData.hexList) {
            let counts = {};
            for(let nHex of getNeighborHexes(hex)) {
                if(nHex.owner > 0) counts[nHex.owner] = (counts[nHex.owner] || 0) + 1;
            }
            let bestOwner = hex.owner;
            let bestCount = counts[bestOwner] || 0;
            for(let owner of ownerIds) {
                if(!valid.has(owner)) continue;
                if((counts[owner] || 0) > bestCount) {
                    bestOwner = owner;
                    bestCount = counts[owner];
                }
            }
            if(bestOwner !== hex.owner && bestCount >= minVotes) changes.push({hex, owner: bestOwner});
            if((++hi & wodMapGenLoopYieldMask(255)) === 0) await wodMapGenYieldSlice();
        }
        for(let change of changes) setHexOwner(change.hex, change.owner);
    }
}
function wodStartingFrontAnchors(owner, count, land) {
    if(!count) return [];
    let spacing = gameData.hexRadius * 1.35;
    let midpoints = new Map(), corners = new Map(), frontHexes = new Map();
    // Use the same border geometry as the renderer, limited to this owner's
    // walkable land frontage. Sampling by edge length also handles bent fronts.
    for(let h of land) {
        for(let dir of cardinalHexDirections) {
            let n = wodHexAt(h.q + dir.q,h.r + dir.r);
            if(!n || !isClaimableLand(n) || isWaterHex(n) || n.type === 'mountain') continue;
            if(n.owner !== 0 && !wodIsHostileOwner(n.owner, owner)) continue;
            let key = hexPairBorderKey(h, n);
            let x = (h.x + n.x) / 2, y = (h.y + n.y) / 2;
            midpoints.set(key, {x, y}); frontHexes.set(key, h);
            registerBorderCornersForPair(corners, h, n, dir, key, x, y, spacing);
        }
    }
    let chains = walkBorderEdgeChains(linkBorderEdgesAroundCorners(corners), midpoints);
    let ordered = [], seen = new Set();
    for(let chain of chains) {
        for(let key of chain.keys) {
            if(!seen.has(key)) { seen.add(key); ordered.push(frontHexes.get(key)); }
        }
    }
    // Include isolated short border segments, which have no graph neighbor.
    for(let [key, h] of frontHexes) if(!seen.has(key)) ordered.push(h);
    if(!ordered.length) return [];
    return Array.from({length:count}, (_, i) => ordered[Math.min(ordered.length-1,
        Math.floor((i+0.5) * ordered.length / count))]);
}
function wodDeployStartingArmy(ownerIds) {
    wodEnsureStartingGenerals(ownerIds);
    gameData._enemyDistField = null;
    const supplied = wodStartingTownSupply();
    for(let owner of ownerIds) {
        let army = gameData.entities.filter(u => u.owner === owner && u.hp > 0 && u.type !== 'convoy');
        for(let u of army) if(wodIsNavalUnit(u)) u._startDeployment = 'town';
        let land = army.filter(u => !wodIsNavalUnit(u));
        let towns = gameData.cities.filter(c => c.owner === owner);
        let pool = gameData.hexList.filter(h => h.owner === owner && supplied.get(owner)?.has(getHexKey(h)));
        let safe = pool.filter(h => !isFrontlineHex(h, owner));
        let spacing = Math.pow(gameData.hexRadius * 2.1, 2);
        let used = [];
        let frontCount = Math.min(land.filter(u => u.type !== 'heavy').length, Math.round(land.length * 0.2));
        let frontAnchors = wodStartingFrontAnchors(owner, frontCount, pool);
        // Armor goes last so the infantry frontage quota can never include armor.
        land.sort((a, b) => (a.type === 'heavy') - (b.type === 'heavy'));
        for(let i = 0; i < land.length; i++) {
            let u = land[i], front = i < frontCount && u.type !== 'heavy';
            let town = towns[(i - frontCount + towns.length * 100) % Math.max(1, towns.length)];
            let candidates = front ? safe : safe.filter(h => wodMinDistSqToEnemyTerritory(h.x, h.y, owner) >= Math.pow(gameData.hexRadius * 4, 2));
            if(!candidates.length) candidates = safe;
            candidates = candidates.slice().sort((a, b) => {
                const score = h => front ? (frontAnchors[i]
                    ? (h.x-frontAnchors[i].x)**2 + (h.y-frontAnchors[i].y)**2
                    : wodMinDistSqToEnemyTerritory(h.x, h.y, owner))
                    : (town ? (h.x-town.x)**2 + (h.y-town.y)**2 : -wodMinDistSqToEnemyTerritory(h.x, h.y, owner));
                return score(a) - score(b);
            });
            let h = candidates.find(h => used.every(p => (p.x-h.x)**2 + (p.y-h.y)**2 >= spacing));
            if(!h) h = candidates.find(h => used.every(p => (p.x-h.x)**2 + (p.y-h.y)**2 >= spacing * 0.25));
            // Never put armor on a border, even on an unusually narrow authored map.
            if(!h) h = candidates[i % Math.max(1, candidates.length)];
            // Start one ordinary infantry in each AI town before distributing
            // the remaining rear army. Frontage and armor quotas stay intact.
            if(!front && u.type==='light' && i-frontCount<towns.length && owner>1 && !wodMpIsHumanOwner(owner)) {
                const townHex=town&&wodHexAt(town.q,town.r);
                if(townHex&&pool.includes(townHex))h=townHex;
            }
            if(!h) { gameData.entities = gameData.entities.filter(e => e !== u); continue; }
            u.x = h.x; u.y = h.y; u._drawX = h.x; u._drawY = h.y;
            u.target = null; u.path = null; u.orderTarget = null;
            u._startDeployment = front ? 'front' : 'town';
            used.push(h);
        }
    }
}
function wodReduceAuthoredStartingArmy(ownerIds) {
    const historical=!!gameData._selectedMissionEntry?.storeMission;
    for(let owner of ownerIds) {
        let army = gameData.entities.filter(u => u.owner === owner && u.type !== 'convoy');
        if(army.some(u => u._startDeployment)) continue;
        const byType=Object.create(null);
        let keep = new Set(army.filter((u, i) => ((byType[u.type]=(byType[u.type]||0)+1)%2===1)));
        gameData.entities = gameData.entities.filter(u => u.owner !== owner || u.type === 'convoy' || keep.has(u));
        if(historical)for(const u of keep)u._startDeployment='authored';
    }
    // Historical landing waves, bridgeheads and evacuation boats are
    // part of the scenario. Generic border deployment would erase them.
    if(!historical)wodDeployStartingArmy(ownerIds);
    else wodEnsureStartingGenerals(ownerIds);
}
function spawnInitialFrontlineUnits(ownerIds) {
    if(!ownerIds || !ownerIds.length) return;
    gameData.entities = [];
    gameData._generalMap = null;
    let lights = Math.max(1, Math.round(Math.max(12, Math.min(28, Math.floor(gameData.mapRadius / 3.5))) * 0.5));
    for(let owner of ownerIds) {
        let c = gameData.cities.find(c => c.owner === owner);
        if(!c) continue;
        for(let i = 0; i < lights; i++) createUnitAt('light', c.x, c.y, owner, { startSpawn: true });
        createUnitAt('heavy', c.x, c.y, owner, { startSpawn: true });
    }
    wodDeployStartingArmy(ownerIds);
}
function findNearestOwnedHex(owner, x, y, avoidFront = false) {
    let best = null;
    let bestScore = Infinity;
    for(let hex of gameData.hexList) {
        if(hex.owner !== owner || !isClaimableLand(hex) || hex.type === 'mountain') continue;
        let dx = hex.x - x;
        let dy = hex.y - y;
        let score = dx * dx + dy * dy;
        if(avoidFront && isFrontlineHex(hex, owner)) score += 900000;
        if(score < bestScore) {
            bestScore = score;
            best = hex;
        }
    }
    return best;
}
function findRetreatPoint(unit) {
    // Prefer healing-favorable hexes: own territory, no nearby enemies, defensive terrain.
    let bestHex = null;
    let bestScore = Infinity;
    // (the score first: a cell that cannot beat the best so far needs none of the slower tests. They ran for every cell of
    // the map, for every unit falling back, in the AI's strategy pulse)
    for(let hex of gameData.hexList) {
        if(hex.owner !== unit.owner) continue;
        let dx = hex.x - unit.x;
        let dy = hex.y - unit.y;
        let dist = dx * dx + dy * dy;
        let terrainBonus = 0;
        // Defensive terrain helps healing
        if(unit.type !== 'heavy') {
            if(hex.type === 'forest' || hex.type === 'hill') terrainBonus = -50000;
            else if(hex.type === 'urban') terrainBonus = -40000;
        } else if(hex.type === 'urban') terrainBonus = -30000;
        let score = dist + terrainBonus;
        if(!(score < bestScore)) continue;
        if(!canUnitEnterHex(unit, hex)) continue;
        if(isFrontlineHex(hex, unit.owner)) continue;
        let enemyNearby = countNearbyUnits(unit.owner, hex.x, hex.y, 180, true);
        if(enemyNearby > 0) continue;
        if(score < bestScore) {
            bestScore = score;
            bestHex = hex;
        }
    }
    if(bestHex) return {x: bestHex.x, y: bestHex.y};
    let bestCity = null;
    let bestCityScore = Infinity;
    for(let city of gameData.cities) {
        if(city.owner !== unit.owner) continue;
        let dx = city.x - unit.x;
        let dy = city.y - unit.y;
        let cityHex = wodHexAt(city.q,city.r);
        let score = dx * dx + dy * dy;
        if(isFrontlineHex(cityHex, unit.owner)) score += 500000;
        if(score < bestCityScore) {
            bestCityScore = score;
            bestCity = city;
        }
    }
    if(bestCity) return {x: bestCity.x, y: bestCity.y};
    let safeHex = findNearestOwnedHex(unit.owner, unit.x, unit.y, true);
    return safeHex ? {x: safeHex.x, y: safeHex.y} : null;
}
