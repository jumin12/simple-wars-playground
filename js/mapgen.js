// Procedural map generation: terrain, rivers, borders, towns and start balancing.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

function wodGetActiveFactionSlotsForMap() {
    if(!gameData.mp || !gameData.mp.enabled) return null;
    if(gameData.mp.factionSlots && gameData.mp.factionSlots.length)
        return gameData.mp.factionSlots.slice().sort((a, b) => a - b);
    let maxH = gameData.mp.maxLobbySlots || WOD_MP_MAX_PLAYERS;
    let st = gameData.mp.seatTypes;
    let hs = gameData.mp.humanSlots || [];
    if(!st || !st.length) {
        let pc = 1 + Math.max(0, gameData.aiCount | 0);
        let out = [];
        for(let i = 1; i <= pc && i <= maxH; i++) out.push(i);
        return out;
    }
    let out = [];
    for(let s = 1; s <= maxH; s++) {
        let t = st[s - 1] || 'human';
        if(t === 'closed') continue;
        if(t === 'bot') {
            out.push(s);
            continue;
        }
        if(t === 'human') out.push(s);
    }
    return out.length ? out.sort((a, b) => a - b) : null;
}
function wodGetMapPlayerCount() {
    if(gameData.mp && gameData.mp.enabled) {
        let act = wodGetActiveFactionSlotsForMap();
        if(act && act.length) return Math.min(act.length, factionColors.length - 1);
        if(gameData.mp.factionSlots && gameData.mp.factionSlots.length)
            return Math.min(gameData.mp.factionSlots.length, factionColors.length - 1);
        if(gameData.mp.humanSlots && gameData.mp.humanSlots.length) {
            return Math.min(gameData.mp.humanSlots.length + Math.max(0, gameData.aiCount | 0), factionColors.length - 1);
        }
    }
    return Math.min((gameData.aiCount || 1) + 1, factionColors.length - 1);
}
function wodGetDesiredFactionCountForMapGen() {
    if(gameData.mp && gameData.mp.enabled) {
        let lay = wodGetLobbyLayoutFactionSlots();
        if(lay && lay.length) return Math.min(lay.length, factionColors.length - 1);
    }
    return wodGetMapPlayerCount();
}
let _wodSavedMathRandom = null;
function wodMulberry32(a) {
    return function() {
        let t = (a += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function wodPushSeededRandom(seed) {
    if(_wodSavedMathRandom) wodPopRandom();
    _wodSavedMathRandom = Math.random;
    let s = (seed >>> 0) || 1;
    let gen = wodMulberry32(s);
    Math.random = function() { return gen(); };
}
function wodPopRandom() {
    if(_wodSavedMathRandom) Math.random = _wodSavedMathRandom;
    _wodSavedMathRandom = null;
}
function wodComputeMapFingerprint(mapRadius, mapShape, aiCount) {
    return JSON.stringify({
        r: mapRadius != null ? mapRadius : gameData.mapRadius,
        shape: mapShape != null ? mapShape : gameData.mapShape,
        ai: aiCount != null ? aiCount : gameData.aiCount
    });
}
/** Fixed grid + hex scale per setup size so Small / Medium / Large stay predictable. */
function wodMapSizePreset(sizeVal) {
    let v = parseInt(sizeVal, 10);
    if(v === 40) {
        return { mapRadius: 40, hexRadius: 18, rowsMul: 0.8, landFracMin: 0.34, landFracMax: 0.5 };
    }
    if(v === 80) {
        return { mapRadius: 80, hexRadius: 22, rowsMul: 0.8, landFracMin: 0.3, landFracMax: 0.44 };
    }
    return { mapRadius: 60, hexRadius: 20, rowsMul: 0.8, landFracMin: 0.32, landFracMax: 0.46 };
}
function wodApplyMapSizePreset(sizeVal) {
    let p = wodMapSizePreset(sizeVal);
    gameData.mapRadius = p.mapRadius;
    gameData.hexRadius = p.hexRadius;
    gameData._mapSizePreset = p;
    // Loaded custom/mission maps carry their own authored grid spacing — never let
    // a size preset skew pixel→hex lookups on them (see WOD.loadMapData).
    if(gameData.loadedCustomMap && gameData._loadedMapHexRadius)
        gameData.hexRadius = gameData._loadedMapHexRadius;
    return p;
}
function wodPlayableLandFraction() {
    let land = 0,
        n = 0;
    for(let h of gameData.hexList) {
        if(!h) continue;
        n++;
        if(!isWaterHex(h)) land++;
    }
    return n ? land / n : 0;
}
function wodMapLandFractionAcceptable(mapShape) {
    let p = gameData._mapSizePreset || wodMapSizePreset(gameData.mapRadius);
    let frac = wodPlayableLandFraction();
    let minF = p.landFracMin,
        maxF = p.landFracMax;
    if(wodMapShapeUsesRectanglePipeline(mapShape)) {
        minF += 0.1;
        // Rectangle presets intentionally fill most of the grid inside
        // their water rim (about 72–87%). The old island-sized ceiling
        // rejected virtually every healthy rectangle/mountain map.
        maxF = Math.max(maxF + 0.14, 0.88);
    } else if(mapShape === 'archipelago') {
        // Scattered islands naturally occupy less of the enclosing sea
        // grid. Town capacity and connected-region checks below enforce
        // playability; an island-density floor discarded healthy chains.
        minF = 0.11;
        maxF = Math.min(0.36, maxF - 0.08);
    } else if(mapShape === 'ring') {
        minF = Math.max(0.18, minF - 0.08);
        maxF = Math.min(0.42, maxF - 0.04);
    } else if(mapShape === 'continents') {
        // Two landmasses and a real sea between them cover less of the
        // grid than one island; the continent pass enforces their sizes.
        minF = 0.22;
        maxF = 0.52;
    }
    // Slightly wider band so setup doesn't burn many full terrain regenerations.
    minF = Math.max(0.08, minF - 0.03);
    maxF = Math.min(wodMapShapeUsesRectanglePipeline(mapShape)?0.94:0.72, maxF + 0.04);
    return frac >= minF && frac <= maxF;
}
const WOD_PROC_GEN_MAP_SHAPES = ['island', 'rectangle', 'ring', 'archipelago', 'forest', 'mountain', 'desert', 'continents'];
function wodIsProcGenMapShape(shape) {
    return !!shape && WOD_PROC_GEN_MAP_SHAPES.indexOf(shape) >= 0;
}
/** Terrain heightmap branch that matches classic rectangle (grid, ridge macro, lake blobs). */
function wodMapShapeUsesRectanglePipeline(shape) {
    return shape === 'rectangle' || shape === 'forest' || shape === 'mountain' || shape === 'desert';
}
/** Radial island-style mask (dist from map center, optional ring / punch-out). */
function wodMapShapeUsesRadialIslandMask(shape) {
    return shape === 'island' || shape === 'ring' || shape === 'archipelago' || shape === 'continents';
}
function wodMapShapeIsRadialForTownPolicy(shape) {
    return shape === 'island' || shape === 'ring' || shape === 'archipelago';
}
function wodMapShapeLabelForMeta(shape) {
    let s = {
        island: 'Island',
        rectangle: 'Rectangle',
        ring: 'Ring (inland lake)',
        archipelago: 'Archipelago',
        forest: 'Forest',
        mountain: 'Mountain',
        desert: 'Desert',
        continents: 'Continents',
        custom: 'Custom'
    };
    return s[shape] || (shape ? shape.charAt(0).toUpperCase() + shape.slice(1) : '');
}
/** Shared biome/threshold roll used by island-shaped proc maps so ring & archipelago match island variety. */
function wodRollIslandStyleBiomeFields(islandMode) {
    let atollExtra = islandMode === 'atoll';
    let archipelagoExtra = islandMode === 'archipelago';
    let accentRoll = Math.random();
    let biomeAccent =
        accentRoll < 0.26
            ? 'marsh'
            : accentRoll < 0.52
              ? 'flat_low_mtns'
              : accentRoll < 0.7
                ? 'forest'
                : accentRoll < 0.82
                  ? 'dry'
                  : accentRoll < 0.93
                    ? 'rugged'
                    : 'balanced';

    if(atollExtra || archipelagoExtra) {
        biomeAccent = Math.random() < 0.55 ? 'marsh' : biomeAccent === 'rugged' ? 'balanced' : biomeAccent;
    }

    let waterElevThresh = 0.395 + Math.random() * 0.062;
    let sandThresh = 0.29 + Math.random() * 0.09;
    let grassThresh = 0.5 + Math.random() * 0.14;
    let forestThresh = 0.7 + Math.random() * 0.14;
    let mountElevThresh = 0.798 + Math.random() * 0.1;
    let moistShift = (Math.random() - 0.5) * 0.16;
    let forestMoistBoost = (Math.random() - 0.5) * 0.11;
    let mountainThin = 0.12 + Math.random() * 0.42;
    let minMountainHexReserve = 2 + (Math.random() < 0.5 ? 0 : 1);
    let maxMountainLandFrac = 0.055 + Math.random() * 0.095;
    if(islandMode === 'broken') waterElevThresh += 0.018 + Math.random() * 0.018;

    if(biomeAccent === 'marsh') {
        moistShift += 0.085 + Math.random() * 0.12;
        grassThresh -= 0.04 + Math.random() * 0.05;
        forestThresh -= 0.06 + Math.random() * 0.07;
        sandThresh -= 0.02 + Math.random() * 0.03;
        waterElevThresh -= 0.012 + Math.random() * 0.014;
        mountElevThresh += 0.055 + Math.random() * 0.07;
        mountainThin = Math.min(0.58, mountainThin + 0.1 + Math.random() * 0.12);
        maxMountainLandFrac = Math.min(0.11, maxMountainLandFrac * 0.72);
    } else if(biomeAccent === 'flat_low_mtns') {
        mountElevThresh += 0.09 + Math.random() * 0.08;
        mountainThin = Math.min(0.62, mountainThin + 0.14 + Math.random() * 0.16);
        maxMountainLandFrac = Math.min(0.085, maxMountainLandFrac * 0.62);
        moistShift += 0.02 * Math.random();
    } else if(biomeAccent === 'forest') {
        forestMoistBoost += 0.08 + Math.random() * 0.1;
        forestThresh -= 0.04 + Math.random() * 0.05;
        grassThresh -= 0.02 + Math.random() * 0.03;
        mountElevThresh += 0.03 + Math.random() * 0.05;
    } else if(biomeAccent === 'dry') {
        sandThresh += 0.02 + Math.random() * 0.04;
        moistShift -= 0.08 + Math.random() * 0.08;
        waterElevThresh += 0.015 + Math.random() * 0.02;
        mountElevThresh += 0.02 + Math.random() * 0.04;
    } else if(biomeAccent === 'rugged') {
        mountElevThresh -= 0.025 + Math.random() * 0.04;
        moistShift += 0.03 * Math.random();
        maxMountainLandFrac = Math.min(0.16, maxMountainLandFrac + 0.035);
        minMountainHexReserve += 2;
    }

    let mPick = Math.random();
    let mountainStyle =
        biomeAccent === 'flat_low_mtns'
            ? 'low'
            : mPick < 0.34
              ? 'default'
              : mPick < 0.58
                ? 'scattered'
                : mPick < 0.76
                  ? 'low'
                  : mPick < 0.9
                    ? 'mixed'
                    : 'ring';
    if(biomeAccent === 'marsh' && mountainStyle === 'ring') mountainStyle = 'scattered';

    let mountainPeakJitter = 0.05 + Math.random() * 0.14;
    let mountainRingR = 0.34 + Math.random() * 0.24;

    return {
        waterElevThresh,
        sandThresh,
        grassThresh,
        forestThresh,
        mountElevThresh,
        moistShift,
        forestMoistBoost,
        mountainThin,
        mountainStyle,
        mountainPeakJitter,
        mountainRingR,
        minMountainHexReserve,
        maxMountainLandFrac,
        biomeAccent
    };
}
/** Post-gen cap: peels weaker peaks first so swamp / hill coast variety stays readable */
function wodClampIslandMountainLandFraction(gp, seedOffset) {
    if(!wodMapShapeUsesRadialIslandMask(gameData.mapShape) || !gp || gp.maxMountainLandFrac == null || !(gp.maxMountainLandFrac > 0)) return;
    let land = [];
    for(let h of gameData.hexList) {
        if(h && !isWaterHex(h)) land.push(h);
    }
    if(land.length < 40) return;
    let mounts = land.filter(h => h.type === 'mountain');
    let hardCap = Math.max(7, Math.floor(land.length * gp.maxMountainLandFrac));
    if(mounts.length <= hardCap) return;
    mounts.sort((a, b) => {
        let ar = fbm(a.x * 0.019 + seedOffset + 5011, a.y * 0.019 + seedOffset + 5011, 3);
        let br = fbm(b.x * 0.019 + seedOffset + 5011, b.y * 0.019 + seedOffset + 5011, 3);
        if(ar !== br) return ar - br;
        return a.q === b.q ? a.r - b.r : a.q - b.q;
    });
    let trim = mounts.length - hardCap;
    let mars = gp.biomeAccent === 'marsh' || gp.biomeAccent === 'flat_low_mtns';
    for(let z = 0; z < trim; z++) {
        let h = mounts[z],
            wt = fbm(h.x * 0.011 + seedOffset + 9333, h.y * 0.011 + seedOffset + 9333, 4);
        if(mars && wt > 0.38 && wt < 0.72 && Math.random() < (gp.biomeAccent === 'marsh' ? 0.42 : 0.22)) h.type = 'grass';
        else if(mars && wt > 0.62) h.type = 'swamp';
        else if(wt > 0.53) h.type = 'forest';
        else if(wt > 0.28) h.type = 'hill';
        else h.type = 'grass';
        h.baseColor = getTerrainColor(h.type);
        h.renderColor = h.baseColor;
    }
}
function wodSetGeneratedTerrainType(hex, type) {
    if(!hex || hex.type === type) return;
    hex.type = type;
    hex.baseColor = getTerrainColor(type);
    hex.renderColor = hex.baseColor;
}
/** Merge orphan land/water cells into neighboring regions (fixes one-off hex speckles). */
async function wodCoalesceTerrainSpeckles(passesOpt) {
    let passes = passesOpt == null ? 3 : passesOpt;
    let fast = !!gameData._wodFastMapGen;
    for(let pass = 0; pass < passes; pass++) {
        let changes = [];
        for(let h of gameData.hexList) {
            if(!h || h.type === 'urban') continue;
            if(isWaterHex(h)) {
                // Isolated 1-2 cell "ponds" wedged between land cells read as
                // rendering glitches. Fill them with the dominant surrounding
                // land biome (mountains don't count as land but don't protect
                // the pond either).
                let landN = 0, waterAdj = 0;
                let landCounts = {};
                for(let nb of getNeighborHexes(h)) {
                    if(!nb) continue;
                    if(isWaterHex(nb)) { waterAdj++; continue; }
                    if(nb.type === 'mountain' || nb.type === 'urban') continue;
                    landN++;
                    landCounts[nb.type] = (landCounts[nb.type] || 0) + 1;
                }
                if(landN >= 6 || (waterAdj <= 1 && landN >= 4)) {
                    let fillT = 'grass', fillC = 0;
                    for(let t in landCounts) {
                        if(landCounts[t] > fillC) { fillC = landCounts[t]; fillT = t; }
                    }
                    if(fillT === 'sand' && landCounts.grass) fillT = 'grass';
                    changes.push({ h, type: fillT });
                }
                continue;
            }
            if(h.type === 'mountain') continue;
            let counts = {}, same = 0, landTotal = 0;
            for(let nb of getNeighborHexes(h)) {
                if(!nb || isWaterHex(nb) || nb.type === 'urban' || nb.type === 'mountain') continue;
                landTotal++;
                counts[nb.type] = (counts[nb.type] || 0) + 1;
                if(nb.type === h.type) same++;
            }
            if(landTotal < 2) continue;
            let best = h.type, bestC = 0;
            for(let t in counts) {
                if(counts[t] > bestC) {
                    bestC = counts[t];
                    best = t;
                }
            }
            let need = pass === 0 ? 4 : 3;
            if(same <= 1 && bestC >= 3) changes.push({ h, type: best });
            // Single-cell biome with NO same-type neighbor at all (coastal
            // speckles with few land neighbors slipped the bestC>=3 rule).
            else if(same === 0 && bestC >= 2) changes.push({ h, type: best });
            else if(best !== h.type && bestC >= need && bestC >= landTotal - 2) changes.push({ h, type: best });
        }
        for(let ch of changes) wodSetGeneratedTerrainType(ch.h, ch.type);
        if(!fast && pass + 1 < passes) await wodMapGenYieldSlice();
        else if(fast && pass + 1 < passes && wodMapGenCooperativeMode()) await wodMapGenYieldSlice();
    }
}
async function wodForceIslandEdgeWaterBuffer(cols, rows, bufferTiles, seedOffset) {
    if(!wodMapShapeUsesRadialIslandMask(gameData.mapShape)) return;
    let cx = 0, cy = 0, n = 0;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for(let h of gameData.hexList) {
        cx += h.x;
        cy += h.y;
        n++;
        if(h.x < minX) minX = h.x;
        if(h.x > maxX) maxX = h.x;
        if(h.y < minY) minY = h.y;
        if(h.y > maxY) maxY = h.y;
    }
    if(!n) return;
    cx /= n;
    cy /= n;
    let maxR = 0;
    for(let h of gameData.hexList) {
        let d = Math.hypot(h.x - cx, h.y - cy);
        if(d > maxR) maxR = d;
    }
    let hr = gameData.hexRadius || 20;
    let pad = Math.max(1, bufferTiles || 5);
    let inner = maxR - hr * pad * 2.6;
    let fadeW = hr * (pad + 7.5);
    // Rectangular edge buffer: the radial ring alone let land touch the middle of
    // each map edge (the ring radius is the CORNER distance, so edge midpoints sit
    // far inside it). Islands must never contact the map boundary on any side.
    let sp = hr * 1.35;
    let hardEdge = sp * pad;
    // The buffer boundary needs REAL amplitude and two noise octaves — a ±0.8-tile
    // wobble drew visibly straight coasts along all four map sides ("square islands").
    let wobAmp = sp * 6.5;
    let sandEdge = hardEdge + wobAmp + sp * 3.2;
    let hi = 0;
    for(let h of gameData.hexList) {
        let ed = Math.min(h.x - minX, maxX - h.x, h.y - minY, maxY - h.y);
        if(ed <= sandEdge) {
            let so = (seedOffset || 0);
            let wob = fbm(h.x * 0.006 + so + 5150, h.y * 0.006 + so + 5150, 3) - 0.5;
            let wob2 = fbm(h.x * 0.021 + so + 7212, h.y * 0.021 + so + 7212, 2) - 0.5;
            let waterLine = hardEdge + wobAmp * (0.5 + wob * 1.35 + wob2 * 0.55);
            if(ed <= Math.max(sp * 1.5, waterLine)) {
                wodSetGeneratedTerrainType(h, 'water');
            } else if(ed <= waterLine + sp * 1.6 && !isWaterHex(h) && h.type !== 'mountain' && h.type !== 'urban') {
                wodSetGeneratedTerrainType(h, 'sand');
            }
            if((++hi & wodMapGenLoopYieldMask(1023)) === 0) await wodMapGenYieldSlice();
            continue;
        }
        let d = Math.hypot(h.x - cx, h.y - cy);
        if(d >= inner) {
            let t = (d - inner) / Math.max(fadeW, 1);
            if(t > 0.58) wodSetGeneratedTerrainType(h, 'water');
            else if(t > 0.34 && !isWaterHex(h) && h.type !== 'mountain' && h.type !== 'urban') wodSetGeneratedTerrainType(h, 'sand');
        }
        if((++hi & wodMapGenLoopYieldMask(1023)) === 0) await wodMapGenYieldSlice();
    }
}
/** Dry cells joined by shared edges, largest landmass first. Mountains are political land too. */
function wodPoliticalLandmasses() {
    const seen = new Set(), out = [];
    for(const start of gameData.hexList) {
        if(!start || isWaterHex(start) || seen.has(start)) continue;
        const list = [start];
        seen.add(start);
        for(let i = 0; i < list.length; i++) for(const d of cardinalHexDirections) {
            const n = wodHexAt(list[i].q + d.q, list[i].r + d.r);
            if(n && !isWaterHex(n) && !seen.has(n)) { seen.add(n); list.push(n); }
        }
        out.push(list);
    }
    return out.sort((a, b) => b.length - a.length);
}
/** "Continents": distance in cells (along x) of a cell from the centre line of the channel.
 *  Mirrors the channel term of the terrain mask in generateMap / map-gen-worker.js. */
function wodContinentsChannelOffsetCells(h, cols, rows, seedOffset) {
    const gp = gameData._genProfile || {}, sp = gameData.hexRadius * 1.35;
    const ny = h.y / (rows * sp * 0.95), xs = h.x / (cols * sp * 0.95) - (gp.contShear || 0) * ny;
    const mid = (gp.contChanX || 0) + (fbm(ny * 1.9 + seedOffset + 611, seedOffset * 0.37 + 11, 3) - 0.5) * 2 * (gp.contChanWave || 0);
    return (xs - mid) * cols * 0.95;
}
/** Keep the channel between the two continents open sea whatever the height noise did there:
 *  crossing it must take ships, never a land bridge. */
function wodCarveContinentsChannel(cols, rows, seedOffset) {
    if(gameData.mapShape !== 'continents') return;
    const half = Math.max(3, cols * 0.055);
    for(const h of gameData.hexList)
        if(h && !isWaterHex(h) && Math.abs(wodContinentsChannelOffsetCells(h, cols, rows, seedOffset)) <= half)
            wodSetGeneratedTerrainType(h, 'water');
}
/** A continents map is exactly two landmasses: sink every islet beside them.
 *  False when the second landmass is not a real continent. */
function wodKeepTwoContinents() {
    const masses = wodPoliticalLandmasses();
    if(masses.length < 2) return false;
    for(let i = 2; i < masses.length; i++) for(const h of masses[i]) wodSetGeneratedTerrainType(h, 'water');
    return masses[1].length >= masses[0].length * 0.22;
}
/** Trim the two coasts until each continent holds exactly (its players) x (the same land per
 *  player): players on different continents share no border, so the usual frontier balancing
 *  cannot even them out. Only the most exposed ocean-shore cells go, one at a time, and never
 *  a cell whose loss would split land or leave a diagonal-only join, so the coast ends up a
 *  little smoother, not ragged. False = too lopsided to trim (the caller makes new terrain). */
function wodBalanceContinentsLand(factionCount, cols, rows) {
    const masses = wodPoliticalLandmasses();
    if(masses.length !== 2) return false;
    const f = Math.max(2, factionCount | 0), nBig = Math.ceil(f / 2), nSmall = f - nBig;
    const per = Math.min(Math.floor(masses[0].length / nBig), Math.floor(masses[1].length / nSmall));
    const cut = [masses[0].length - per * nBig, masses[1].length - per * nSmall];
    if(per < 60 || cut[0] > masses[0].length * 0.1 || cut[1] > masses[1].length * 0.1) return false;
    const ocean = wodBuildOceanConnectedWaterKeys(cols, rows);
    const seed = ((gameData._mapGenSeed >>> 0) || 1) | 1;
    const dry = (q, r) => { const n = wodHexAt(q, r); return !!n && !isWaterHex(n); };
    const RING = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
    const onOcean = h => cardinalHexDirections.some(d => {
        const n = wodHexAt(h.q + d.q, h.r + d.r);
        return n && isWaterHex(n) && ocean.has(getHexKey(n));
    });
    // Number of water neighbours when the cell may go, else -1.
    function exposure(h) {
        const ring = RING.map(([dq, dr]) => dry(h.q + dq, h.r + dr));
        let water = 0, runs = 0;
        for(let i = 0; i < 8; i++) {
            if(!ring[i]) water++;
            else if(!ring[(i + 7) & 7]) runs++;
        }
        if(water === 0 || water === 8 || runs > 1) return -1;
        for(let i = 1; i < 8; i += 2) if(!ring[i] && ring[i - 1] && ring[(i + 1) & 7]) return -1;
        return water;
    }
    for(let m = 0; m < 2; m++) {
        const coast = new Set(masses[m].filter(onOcean));
        for(let left = cut[m]; left > 0; left--) {
            let best = null, bestScore = -1;
            for(const h of coast) {
                const e = exposure(h);
                if(e < 0) continue;
                const score = e + ((Math.imul(h.q * 374761393 + h.r * 668265263, seed) >>> 0) / 4294967296) * 0.9;
                if(score > bestScore) { bestScore = score; best = h; }
            }
            if(!best) return false;
            wodSetGeneratedTerrainType(best, 'water');
            ocean.add(getHexKey(best));
            coast.delete(best);
            for(const d of cardinalHexDirections) {
                const n = wodHexAt(best.q + d.q, best.r + d.r);
                if(n && !isWaterHex(n)) coast.add(n);
            }
        }
    }
    return true;
}
async function wodNormalizeRectangleWaterFeatures(seedOffset) {
    if(!wodMapShapeUsesRectanglePipeline(gameData.mapShape)) return;
    let water = gameData.hexList.filter(h => isWaterHex(h));
    if(!water.length) return;
    let seen = new Set();
    let comps = [];
    let floodTick = 0;
    for(let start of water) {
        let sk = getHexKey(start);
        if(seen.has(sk)) continue;
        let queue = [start];
        let qi = 0;
        let comp = [];
        seen.add(sk);
        let minQ = start.q, maxQ = start.q, minR = start.r, maxR = start.r;
        while(qi < queue.length) {
            let cur = queue[qi++];
            comp.push(cur);
            minQ = Math.min(minQ, cur.q); maxQ = Math.max(maxQ, cur.q);
            minR = Math.min(minR, cur.r); maxR = Math.max(maxR, cur.r);
            for(let nb of getNeighborHexes(cur)) {
                if(!nb || !isWaterHex(nb)) continue;
                let nk = getHexKey(nb);
                if(seen.has(nk)) continue;
                seen.add(nk);
                queue.push(nb);
            }
            if((++floodTick & wodMapGenLoopYieldMask(4095)) === 0) await wodMapGenYieldSlice();
        }
        let span = Math.max(maxQ - minQ, maxR - minR);
        comps.push({ cells: comp, size: comp.length, span });
    }

    let totalWater = water.length;
    for(let c of comps) {
        if(c.size >= 4) continue;
        let ci = 0;
        for(let h of c.cells) {
            let wet = fbm(h.x * 0.012 + seedOffset + 7210, h.y * 0.012 + seedOffset + 7210, 3);
            wodSetGeneratedTerrainType(h, wet > 0.62 ? 'swamp' : 'grass');
            totalWater--;
            if((++ci & wodMapGenLoopYieldMask(255)) === 0) await wodMapGenYieldSlice();
        }
        c.removed = true;
    }

    let maxWater = Math.max(26, Math.floor(gameData.hexList.length * 0.055));
    let keepers = comps.filter(c => !c.removed).sort((a, b) => (a.size + a.span * 2.2) - (b.size + b.span * 2.2));
    for(let c of keepers) {
        if(totalWater <= maxWater) break;
        if(c.size > maxWater * 0.72 && c.span > Math.sqrt(c.size) * 2.2) continue;
        let ci = 0;
        for(let h of c.cells) {
            let wet = fbm(h.x * 0.012 + seedOffset + 7330, h.y * 0.012 + seedOffset + 7330, 3);
            wodSetGeneratedTerrainType(h, wet > 0.58 ? 'swamp' : 'grass');
            if((++ci & wodMapGenLoopYieldMask(255)) === 0) await wodMapGenYieldSlice();
        }
        totalWater -= c.size;
    }
}
/** One-hex ocean frame so rectangle-style maps always have water seeds for rivers + BFS. */
async function wodPaintRectangleMapPerimeterWater(cols, rows) {
    if(!wodMapShapeUsesRectanglePipeline(gameData.mapShape)) return;
    let rowCount = Math.floor(rows) | 0;
    let colM = Math.max(1, cols | 0);
    let rowM = Math.max(1, rowCount);
    let hi = 0;
    // Wavy waterline: a hard |q| >= colM cutoff drew ruler-straight coasts along all
    // four map edges. Vary the waterline depth with noise along each edge instead.
    let seed = ((gameData._mapGenSeed >>> 0) || 1) * 0.013;
    let sp = gameData.hexRadius * 1.35;
    for(let h of gameData.hexList) {
        if(!h) continue;
        let waveQ = 1.5 + fbm(h.y / (sp * 5.2) + seed, seed * 1.7, 3) * 5.5;
        let waveR = 1.5 + fbm(h.x / (sp * 5.2) + seed + 41.7, seed * 2.3, 3) * 5.5;
        if(colM - Math.abs(h.q) <= waveQ || rowM - Math.abs(h.r) <= waveR) {
            wodSetGeneratedTerrainType(h, 'water');
        }
        if((++hi & wodMapGenLoopYieldMask(255)) === 0) await wodMapGenYieldSlice();
    }
}
async function wodApplyRectangleBiomeDominance(seedOffset) {
    if(!wodMapShapeUsesRectanglePipeline(gameData.mapShape)) return;
    let preset = (gameData._genProfile || {}).rectBiomePreset;
    if(!preset) return;
    let hi = 0;
    for(let h of gameData.hexList) {
        if(!h || isWaterHex(h) || h.type === 'urban') continue;
        let u = fbm(h.x * 0.008 + seedOffset + 9900, h.y * 0.008 + seedOffset + 9900, 4);
        let v = fbm(h.x * 0.0062 + seedOffset + 10440, h.y * 0.0062 + seedOffset + 10440, 4);
        let t = Math.max(0, Math.min(1, u + (v - 0.5) * 0.12));
        let region = fbm(h.x * 0.0025 + seedOffset + 7710, h.y * 0.0025 + seedOffset + 7710, 3);
        if(region < 0.5) {
            if((++hi & wodMapGenLoopYieldMask(255)) === 0) await wodMapGenYieldSlice();
            continue;
        }
        let edge = 0.065;
        let w = Math.max(0, Math.min(1, (region - (0.5 - edge)) / (2 * edge)));
        let soften = fbm(h.x * 0.017 + seedOffset + 3310, h.y * 0.017 + seedOffset + 3310, 2);
        if(w < 0.995 && soften > 0.38 + w * 0.52) {
            if((++hi & wodMapGenLoopYieldMask(255)) === 0) await wodMapGenYieldSlice();
            continue;
        }
        if(preset === 'forest') {
            if(t < 0.055) wodSetGeneratedTerrainType(h, 'grass');
            else if(t < 0.095) wodSetGeneratedTerrainType(h, 'sand');
            else if(t < 0.125) wodSetGeneratedTerrainType(h, 'hill');
            else if(t < 0.155) wodSetGeneratedTerrainType(h, 'swamp');
            else wodSetGeneratedTerrainType(h, 'forest');
        } else if(preset === 'desert') {
            if(t < 0.06) wodSetGeneratedTerrainType(h, 'grass');
            else if(t < 0.1) wodSetGeneratedTerrainType(h, 'hill');
            else if(t < 0.132) wodSetGeneratedTerrainType(h, 'forest');
            else wodSetGeneratedTerrainType(h, 'sand');
        } else if(preset === 'mountain') {
            if(t < 0.21) wodSetGeneratedTerrainType(h, 'grass');
            else if(t < 0.34) wodSetGeneratedTerrainType(h, 'forest');
            else if(t < 0.52) wodSetGeneratedTerrainType(h, 'hill');
            else wodSetGeneratedTerrainType(h, 'mountain');
        }
        if((++hi & wodMapGenLoopYieldMask(255)) === 0) await wodMapGenYieldSlice();
    }
}
function wodBuildOceanConnectedWaterKeys(colM, rowM) {
    let margin = Math.max(1, Math.min(3, Math.floor(Math.min(colM, rowM) / 24)));
    let ocean = new Set();
    let q = [];
    for(let h of gameData.hexList) {
        if(!h || !isWaterHex(h)) continue;
        let ed = Math.min(colM - Math.abs(h.q), rowM - Math.abs(h.r));
        if(ed > margin) continue;
        let k = getHexKey(h);
        ocean.add(k);
        q.push(h);
    }
    if(q.length === 0) {
        for(let h of gameData.hexList) {
            if(h && isWaterHex(h)) {
                ocean.add(getHexKey(h));
                q.push(h);
                break;
            }
        }
    }
    let qi = 0;
    while(qi < q.length) {
        let cur = q[qi++];
        for(let nb of getNeighborHexes(cur)) {
            if(!nb || !isWaterHex(nb)) continue;
            let nk = getHexKey(nb);
            if(ocean.has(nk)) continue;
            ocean.add(nk);
            q.push(nb);
        }
    }
    return ocean;
}
/** BFS land distances starting only from ocean (exterior) water — isolates inland lakes on island maps. */
function wodLandDistanceToOceanMap(oceanKeys) {
    let dist = new Map();
    if(!oceanKeys || oceanKeys.size === 0) return wodLandDistanceToWaterMap();
    let q = [];
    for(let h of gameData.hexList) {
        if(!h || !isWaterHex(h)) continue;
        if(!oceanKeys.has(getHexKey(h))) continue;
        let k = getHexKey(h);
        dist.set(k, 0);
        q.push(h);
    }
    if(q.length === 0) return wodLandDistanceToWaterMap();
    let qi = 0;
    while(qi < q.length) {
        let cur = q[qi++];
        let d = dist.get(getHexKey(cur)) | 0;
        for(let nb of getNeighborHexes(cur)) {
            if(!nb || isWaterHex(nb)) continue;
            let nk = getHexKey(nb);
            if(dist.has(nk)) continue;
            dist.set(nk, d + 1);
            q.push(nb);
        }
    }
    return dist;
}
async function wodPaintCoastalSandAllLand() {
    let distMap = wodLandDistanceToWaterMap();
    let hi = 0;
    for(let h of gameData.hexList) {
        if(!h || isWaterHex(h) || h.type === 'urban') continue;
        let d = distMap.get(getHexKey(h));
        if(d == null || d > 1) continue;
        let waterN = 0,
            landN = 0;
        for(let nb of getNeighborHexes(h)) {
            if(!nb) continue;
            if(isWaterHex(nb)) waterN++;
            else if(nb.type !== 'mountain' && nb.type !== 'urban') landN++;
        }
        if(waterN < 1) continue;
        if(waterN < 2 && landN >= 5) continue;
        if(h.type === 'swamp' && waterN >= 2) continue;
        if(h.type === 'forest' && landN >= 4) continue;
        if(h.type === 'mountain') {
            wodSetGeneratedTerrainType(h, waterN >= 3 ? 'sand' : 'hill');
            if((++hi & wodMapGenLoopYieldMask(511)) === 0) await wodMapGenYieldSlice();
            continue;
        }
        if(h.type !== 'sand') wodSetGeneratedTerrainType(h, 'sand');
        if((++hi & wodMapGenLoopYieldMask(511)) === 0) await wodMapGenYieldSlice();
    }
}
/** Multi-source BFS: shortest steps from each land hex to nearest water (8-neighbor grid). */
function wodLandDistanceToWaterMap() {
    let dist = new Map();
    let q = [];
    for(let h of gameData.hexList) {
        if(!h || !isWaterHex(h)) continue;
        let k = getHexKey(h);
        if(dist.has(k)) continue;
        dist.set(k, 0);
        q.push(h);
    }
    let qi = 0;
    while(qi < q.length) {
        let cur = q[qi++];
        let d = dist.get(getHexKey(cur)) | 0;
        for(let nb of getNeighborHexes(cur)) {
            if(!nb || isWaterHex(nb)) continue;
            let nk = getHexKey(nb);
            if(dist.has(nk)) continue;
            dist.set(nk, d + 1);
            q.push(nb);
        }
    }
    return dist;
}
function wodCountPassableLandComponents() {
    let landKey = (h) => `${h.q},${h.r}`;
    let isPassable = (h) => h && !isWaterHex(h) && h.type !== 'mountain';
    let visited = new Set();
    let comps = 0;
    for(let hex of gameData.hexList) {
        if(!isPassable(hex) || visited.has(landKey(hex))) continue;
        comps++;
        let queue = [hex];
        let qj = 0;
        visited.add(landKey(hex));
        while(qj < queue.length) {
            let cur = queue[qj++];
            for(let dir of hexDirections) {
                let nKey = `${cur.q + dir.q},${cur.r + dir.r}`;
                let nHex = gameData.hexes[nKey];
                if(!isPassable(nHex) || visited.has(nKey)) continue;
                visited.add(nKey);
                queue.push(nHex);
            }
        }
    }
    return comps;
}
/** Meandering rivers — walk down a distance field toward water; skip paths that split passable land. */
async function wodCarveProceduralRivers(seedOffset, mapShape, cols, rows) {
    if(!gameData.hexList || gameData.hexList.length === 0) return;
    let rowCount = Math.floor(rows) | 0;
    let colM = Math.max(1, cols | 0);
    let rowM = Math.max(1, rowCount);
    let landOk = (h) => h && !isWaterHex(h) && h.type !== 'mountain' && h.type !== 'urban';
    let edgeDistH = (h) => Math.min(colM - Math.abs(h.q), rowM - Math.abs(h.r));
    let rivShape = wodMapShapeUsesRadialIslandMask(mapShape);
    let minSteps = rivShape ? 5 : 4;
    let maxSteps = rivShape ? 46 : 54;
    let riverTargets = rivShape ? 1 + ((Math.random() > 0.52) ? 1 : 0) : 2 + ((Math.random() > 0.38) ? 1 : 0);
    let oceanKeys = rivShape ? wodBuildOceanConnectedWaterKeys(colM, rowM) : null;
    let carved = 0;
    // (river cells are marked, _river, so the start balancer can tell a river from a sea, a strait or a lake)
    for(const h of gameData.hexList) if(h._river) delete h._river;
    let attempt = 0;
    while(carved < riverTargets && attempt < riverTargets + 5) {
        attempt++;
        let distMap = rivShape ? wodLandDistanceToOceanMap(oceanKeys) : wodLandDistanceToWaterMap();
        let candidates = [];
        for(let h of gameData.hexList) {
            if(!landOk(h)) continue;
            let d0 = distMap.get(getHexKey(h));
            if(d0 == null || d0 < minSteps || d0 > maxSteps) continue;
            if(rivShape && edgeDistH(h) < 8) continue;
            if(wodMapShapeUsesRectanglePipeline(mapShape)) {
                let bf = Math.max(Math.abs(h.q) / colM, Math.abs(h.r) / rowM);
                if(bf > 0.93) continue;
            }
            let jitter = fbm(h.x * 0.0027 + seedOffset + 3103, h.y * 0.0027 + seedOffset + 3103, 3);
            candidates.push({ h, d0, jitter });
        }
        candidates.sort((a, b) => b.d0 - a.d0 || a.jitter - b.jitter);
        let start = null;
        if(candidates.length) {
            let off = (attempt - 1) % candidates.length;
            for(let ri = 0; ri < candidates.length; ri++) {
                let c = candidates[(off + ri) % candidates.length];
                if(landOk(c.h)) {
                    start = c.h;
                    break;
                }
            }
        }
        if(!start) break;
        let path = [];
        let cur = start;
        let seenLocal = new Set();
        let guard = 0;
        while(guard++ < 520 && landOk(cur)) {
            let ck = getHexKey(cur);
            if(seenLocal.has(ck)) break;
            seenLocal.add(ck);
            path.push(cur);
            if(getNeighborHexes(cur).some(nb => nb && isWaterHex(nb))) break;
            let curD = distMap.get(ck);
            if(curD == null || curD <= 1) break;
            let landNbs = getNeighborHexes(cur).filter(nb => landOk(nb));
            if(!landNbs.length) break;
            let scored = landNbs.map(nb => {
                let nd = distMap.get(getHexKey(nb));
                return { nb, nd: nd == null ? 999999 : nd };
            });
            scored.sort((a, b) => a.nd - b.nd);
            let pickPool = scored.filter(s => s.nd < curD);
            if(!pickPool.length) {
                let bestNd = scored[0].nd;
                pickPool = scored.filter(s => s.nd === bestNd);
            }
            if(Math.random() < 0.2 && scored.length > pickPool.length) {
                let alt = scored.filter(s => s.nd <= curD && s.nd <= scored[0].nd + 1);
                if(alt.length) pickPool = alt;
            }
            cur = pickPool[Math.floor(Math.random() * pickPool.length)].nb;
        }
        if(path.length < 7 || path.length > 220) {
            await wodMapGenYieldSlice();
            continue;
        }
        let mouth = path[path.length - 1];
        if(!getNeighborHexes(mouth).some(nb => nb && isWaterHex(nb) && (!rivShape || !oceanKeys || oceanKeys.has(getHexKey(nb))))) {
            await wodMapGenYieldSlice();
            continue;
        }
        let riverFillKeys = new Set();
        for(let pi = 1; pi < path.length; pi++) {
            let hx = path[pi];
            if(!hx || isWaterHex(hx)) continue;
            riverFillKeys.add(getHexKey(hx));
            for(let nb of getNeighborHexes(hx)) {
                if(nb && landOk(nb) && !isWaterHex(nb)) riverFillKeys.add(getHexKey(nb));
            }
        }
        let before = wodCountPassableLandComponents();
        let backup = [];
        for(let rk of riverFillKeys) {
            let hx = gameData.hexes[rk];
            if(!hx || isWaterHex(hx)) continue;
            backup.push({ hex: hx, type: hx.type, baseColor: hx.baseColor, renderColor: hx.renderColor });
            wodSetGeneratedTerrainType(hx, 'water');
            hx._river = true;
        }
        let after = wodCountPassableLandComponents();
        if(after > before) {
            for(let bk of backup) {
                bk.hex.type = bk.type;
                bk.hex.baseColor = bk.baseColor;
                bk.hex.renderColor = bk.renderColor;
                delete bk.hex._river;
            }
        } else {
            carved++;
        }
        await wodMapGenYieldSlice();
    }
}
function wodBridgeDefaultDims() {
    let sp = (gameData.hexRadius || 20) * 1.35;
    return { w: sp * 4.8, h: sp * 1.22 };
}
function wodPointInBridgeRect(px, py, br, padScale) {
    if(!br || br.x == null || br.y == null) return false;
    let pad = (padScale == null || padScale <= 0) ? 1 : padScale;
    let ang = -(br.angle || 0);
    let cos = Math.cos(ang),
        sin = Math.sin(ang);
    let dx = px - br.x,
        dy = py - br.y;
    let lx = dx * cos - dy * sin;
    let ly = dx * sin + dy * cos;
    return Math.abs(lx) <= (br.w || 0) * 0.5 * pad && Math.abs(ly) <= (br.h || 0) * 0.5 * pad;
}
function wodDistToBridgeRect(px, py, br) {
    if(!br || br.x == null) return Infinity;
    let ang = -(br.angle || 0);
    let cos = Math.cos(ang),
        sin = Math.sin(ang);
    let dx = px - br.x,
        dy = py - br.y;
    let lx = dx * cos - dy * sin;
    let ly = dx * sin + dy * cos;
    let hw = (br.w || 0) * 0.5,
        hh = (br.h || 0) * 0.5;
    let ox = Math.max(0, Math.abs(lx) - hw);
    let oy = Math.max(0, Math.abs(ly) - hh);
    return Math.sqrt(ox * ox + oy * oy);
}
function wodBridgeCollectHexKeysNearPoint(wx, wy, keys, reach) {
    let reach2 = reach * reach;
    let coord = pixelToHex(wx, wy);
    for(let dq = -1; dq <= 1; dq++) {
        for(let dr = -1; dr <= 1; dr++) {
            let h = wodHexAt(coord.q + dq,coord.r + dr);
            if(!h || !isWaterHex(h)) continue;
            let dx = h.x - wx,
                dy = h.y - wy;
            if(dx * dx + dy * dy <= reach2) keys.add(getHexKey(h));
        }
    }
}
/** Water tiles under the bridge deck — shore land stays normal land for pathfinding links. */
function wodBridgeFootprintHexKeys(br) {
    if(!br || br.x == null) return [];
    let hr = gameData.hexRadius || 20;
    let reach = hr * 1.05;
    let keys = new Set();
    let ang = br.angle || 0;
    let cos = Math.cos(ang),
        sin = Math.sin(ang);
    let hw = (br.w || 0) * 0.5,
        hh = (br.h || 0) * 0.5;
    let step = Math.max(hr * 0.28, 4);
    let samples = Math.max(8, Math.ceil((br.w || 0) / step) + 1);
    for(let si = 0; si < samples; si++) {
        let t = samples <= 1 ? 0 : (-hw + (2 * hw * si) / (samples - 1));
        for(let li = -2; li <= 2; li++) {
            let ly = li * hh * 0.35;
            wodBridgeCollectHexKeysNearPoint(
                br.x + t * cos - ly * sin,
                br.y + t * sin + ly * cos,
                keys,
                reach
            );
        }
    }
    let corners = [
        { lx: -hw, ly: -hh },
        { lx: hw, ly: -hh },
        { lx: hw, ly: hh },
        { lx: -hw, ly: hh }
    ];
    let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
    for(let ci = 0; ci < corners.length; ci++) {
        let c = corners[ci];
        let wx = br.x + c.lx * cos - c.ly * sin;
        let wy = br.y + c.lx * sin + c.ly * cos;
        minX = Math.min(minX, wx);
        maxX = Math.max(maxX, wx);
        minY = Math.min(minY, wy);
        maxY = Math.max(maxY, wy);
    }
    let pad = hr * 0.85;
    let deckReach = hr * 1.58;
    for(let hi = 0, hl = gameData.hexList.length; hi < hl; hi++) {
        let h = gameData.hexList[hi];
        if(!h || h.type === 'mountain' || !isWaterHex(h)) continue;
        if(h.x < minX - pad || h.x > maxX + pad || h.y < minY - pad || h.y > maxY + pad) continue;
        if(wodPointInBridgeRect(h.x, h.y, br, 1.38)) keys.add(getHexKey(h));
        else {
            let dist = wodDistToBridgeRect(h.x, h.y, br);
            if(dist <= deckReach) keys.add(getHexKey(h));
        }
    }
    return [...keys];
}
/** Every water tile under the bridge rect — deck counts as land for routing. */
function wodBridgeFillDeckHexKeys(br) {
    if(!br || br.x == null) return [];
    let keys = new Set(wodBridgeFootprintHexKeys(br));
    for(let hi = 0, hl = gameData.hexList.length; hi < hl; hi++) {
        let h = gameData.hexList[hi];
        if(!h || h.type === 'mountain' || !isWaterHex(h)) continue;
        if(wodPointInBridgeRect(h.x, h.y, br, 1.48)) keys.add(getHexKey(h));
    }
    return [...keys];
}
/** Land hexes on one bank of the bridge, near that end cap. */
function wodBridgeBankLandHexes(br, endSign) {
    if(!br) return [];
    wodSyncBridgeWorldCoords(br);
    let cap = wodBridgeCapPoint(br, endSign);
    let hr = gameData.hexRadius || 20;
    let reach2 = (hr * 4.2) * (hr * 4.2);
    let ang = br.angle || 0;
    let cos = Math.cos(ang),
        sin = Math.sin(ang);
    let out = [];
    for(let hi = 0, hl = gameData.hexList.length; hi < hl; hi++) {
        let h = gameData.hexList[hi];
        if(!h || isWaterHex(h) || h.type === 'mountain' || isBridgeHex(h)) continue;
        let lx = (h.x - br.x) * cos + (h.y - br.y) * sin;
        let sign = lx < 0 ? -1 : 1;
        if(sign !== endSign) continue;
        let dx = h.x - cap.x,
            dy = h.y - cap.y;
        if(dx * dx + dy * dy <= reach2&&wodBridgeApproachClear(br,h)) out.push(h);
    }
    return out;
}
/** Land hexes on one perpendicular side of the bridge (across the deck width). */
function wodBridgePerpBankLandHexes(br, endSign) {
    if(!br) return [];
    wodSyncBridgeWorldCoords(br);
    let hr = gameData.hexRadius || 20;
    let reach2 = (hr * 4.2) * (hr * 4.2);
    let ang = br.angle || 0;
    let cos = Math.cos(ang),
        sin = Math.sin(ang);
    let out = [];
    for(let hi = 0, hl = gameData.hexList.length; hi < hl; hi++) {
        let h = gameData.hexList[hi];
        if(!h || isWaterHex(h) || h.type === 'mountain' || isBridgeHex(h)) continue;
        let ly = -(h.x - br.x) * sin + (h.y - br.y) * cos;
        let sign = ly < 0 ? -1 : 1;
        if(sign !== endSign) continue;
        if(wodDistToBridgeRect(h.x, h.y, br) > hr * 3.8) continue;
        out.push(h);
    }
    return out;
}
function wodBridgeDeckHexNearCap(br, deck, endSign) {
    if(!deck || !deck.length) return null;
    let cap = wodBridgeCapPoint(br, endSign);
    let best = null,
        bestD = Infinity;
    for(let i = 0; i < deck.length; i++) {
        let h = deck[i];
        let dx = h.x - cap.x,
            dy = h.y - cap.y;
        let d = dx * dx + dy * dy;
        if(d < bestD) {
            bestD = d;
            best = h;
        }
    }
    return best;
}
function wodNormalizeBridgeRecord(b) {
    if(!b) return null;
    let o = Object.assign({}, b);
    if(o.x == null && o.q != null) {
        let h = wodHexAt(o.q,o.r);
        if(h) {
            o.x = h.x;
            o.y = h.y;
        }
    }
    if(o.x == null || o.y == null) return null;
    o.owner = o.owner || 0;
    o.angle = o.angle || 0;
    let dims = wodBridgeDefaultDims();
    if(!o.w || o.w < 12) o.w = dims.w;
    if(!o.h || o.h < 6) o.h = dims.h;
    return o;
}
const wodBridgeGeometryCache=new WeakMap();
function wodSyncBridgeWorldCoords(br) {
    if(!br)return;
    const normalized=wodNormalizeBridgeRecord(br);if(!normalized)return;
    // Keep the live bridge identity. Normalizing into a local copy used to
    // discard every computed deck key and all diagonal shore/portal links.
    Object.assign(br,normalized);
    const stamp=[br.x,br.y,br.w,br.h,br.angle||0,gameData._landGeometryRevision||0,gameData._wodPfVer||0].join('|'),old=wodBridgeGeometryCache.get(br);
    if(old?.hexes===gameData.hexes&&old.stamp===stamp){br.hexKeys=old.keys;return;}
    br.hexKeys=wodBridgeFillDeckHexKeys(br);
    if(br.hexKeys.length){const anchor=gameData.hexes[br.hexKeys[0]];if(anchor){br.q=anchor.q;br.r=anchor.r;}}
    wodBridgeGeometryCache.set(br,{hexes:gameData.hexes,stamp,keys:br.hexKeys});
}
function wodRebuildBridgeHexIndex() {
    gameData._bridgeByHexKey = {};
    let list = gameData.bridges || [];
    for(let bi = 0; bi < list.length; bi++) {
        let br = wodNormalizeBridgeRecord(list[bi]);
        if(!br) continue;
        if(!br.id) {
            wodBridgePlacementSeq++;
            br.id = 'bridge_' + wodBridgePlacementSeq;
        } else {
            let n = parseInt(String(br.id).replace(/\D/g, ''), 10);
            if(n > wodBridgePlacementSeq) wodBridgePlacementSeq = n;
        }
        wodSyncBridgeWorldCoords(br);
        list[bi] = br;
        wodBridgeRegisterDeckHexes(br);
    }
    wodRebuildBridgeLandLinks();
    gameData._bridgeIndexSig = (list.length + ':' + list.map(b => b && b.id).join(','));
    gameData._wodPfVer = (gameData._wodPfVer | 0) + 1;
    if(gameData._wodPfCache) gameData._wodPfCache.clear();
}
function wodBridgeRegisterDeckHexes(br) {
    if(!br || !br.hexKeys) return;
    for(let ki = 0; ki < br.hexKeys.length; ki++)
        gameData._bridgeByHexKey[br.hexKeys[ki]] = br;
}
const WOD_BRIDGE_INDEX_VERSION = 11;
function wodEnsureBridgePathIndex() {
    if(!gameData.bridges || !gameData.bridges.length) {
        if(gameData._bridgeIndexSig==='0:'&&gameData._bridgeIndexVer===WOD_BRIDGE_INDEX_VERSION&&gameData._bridgeByHexKey&&gameData._bridgeLandEntry&&gameData._bridgeExitLand)return;
        // Removing the last crossing changes connectivity too. Clear
        // cached paths AND city-supply components just as on addition.
        wodRebuildBridgeHexIndex();
        gameData._bridgeIndexVer = WOD_BRIDGE_INDEX_VERSION;
        return;
    }
    let sig = gameData.bridges.length + ':' + gameData.bridges.map(b => b && b.id).join(',');
    if(!gameData._bridgeByHexKey || !gameData._bridgeLandEntry || gameData._bridgeIndexSig !== sig ||
        gameData._bridgeIndexVer !== WOD_BRIDGE_INDEX_VERSION)
        wodRebuildBridgeHexIndex();
    gameData._bridgeIndexVer = WOD_BRIDGE_INDEX_VERSION;
}
function wodBridgeCapPoint(br, endSign) {
    wodSyncBridgeWorldCoords(br);
    let hw = br.w * 0.5;
    let ang = br.angle || 0;
    let cos = Math.cos(ang),
        sin = Math.sin(ang);
    let inset = Math.min(hw * 0.38, (gameData.hexRadius || 20) * 1.05);
    let dist = Math.max(inset, hw - inset);
    return {
        x: br.x + endSign * dist * cos,
        y: br.y + endSign * dist * sin
    };
}
/** Which side of the bridge axis a hex lies on (-1 = neg cap side, +1 = pos cap side). */
function wodBridgeHexBankSign(br, hex) {
    if(!br || !hex) return 0;
    wodSyncBridgeWorldCoords(br);
    let ang = br.angle || 0;
    let cos = Math.cos(ang),
        sin = Math.sin(ang);
    let lx = (hex.x - br.x) * cos + (hex.y - br.y) * sin;
    return lx < 0 ? -1 : 1;
}
/** Perpendicular side of the bridge (river-bank axis for short crossings). */
function wodBridgeHexPerpSign(br, hex) {
    if(!br || !hex) return 0;
    wodSyncBridgeWorldCoords(br);
    let ang = br.angle || 0;
    let cos = Math.cos(ang),
        sin = Math.sin(ang);
    let ly = -(hex.x - br.x) * sin + (hex.y - br.y) * cos;
    return ly < 0 ? -1 : 1;
}
function wodBridgeMarchCrossesDeck(br, startHex, targetHex) {
    if(!br || !startHex || !targetHex) return false;
    let signS = wodBridgeHexBankSign(br, startHex);
    let signT = wodBridgeHexBankSign(br, targetHex);
    if(signS && signT && signS !== signT) return true;
    let perpS = wodBridgeHexPerpSign(br, startHex);
    let perpT = wodBridgeHexPerpSign(br, targetHex);
    if(perpS && perpT && perpS !== perpT) return true;
    let hr = gameData.hexRadius || 20;
    let mx = (startHex.x + targetHex.x) * 0.5,
        my = (startHex.y + targetHex.y) * 0.5;
    if(wodDistToBridgeRect(mx, my, br) <= hr * 4.2 &&
        wodDistToBridgeRect(startHex.x, startHex.y, br) <= hr * 7 &&
        wodDistToBridgeRect(targetHex.x, targetHex.y, br) <= hr * 7)
        return true;
    return false;
}
function wodLinkBridgeLandHex(lk, bk) {
    const land=gameData.hexes[lk],bridge=gameData._bridgeByHexKey?.[bk];
    if(!land||!bridge||!wodBridgeApproachClear(bridge,land))return;
    if(!gameData._bridgeLandEntry[lk]) gameData._bridgeLandEntry[lk] = new Set();
    gameData._bridgeLandEntry[lk].add(bk);
    if(!gameData._bridgeExitLand[bk]) gameData._bridgeExitLand[bk] = new Set();
    gameData._bridgeExitLand[bk].add(lk);
}
function wodBridgeApproachClear(br,land) {
    const angle=br.angle||0,side=(land.x-br.x)*Math.cos(angle)+(land.y-br.y)*Math.sin(angle)<0?-1:1,cap=wodBridgeCapPoint(br,side);
    const distance=Math.hypot(land.x-cap.x,land.y-cap.y),hr=gameData.hexRadius||20;
    if(distance>hr*2.4)return false;
    const steps=Math.max(1,Math.ceil(distance/(hr*.25)));
    for(let i=0;i<=steps;i++){
        const x=land.x+(cap.x-land.x)*i/steps,y=land.y+(cap.y-land.y)*i/steps;
        if(wodPointInBridgeRect(x,y,br,1.05))continue;
        const h=getNearestHexToPoint(x,y);if(!h||isWaterHex(h)||h.type==='mountain')return false;
    }return true;
}
/** Link shore hex to deck tiles on the matching bridge end — never cross-link far-side deck hexes. */
function wodLinkLandHexToBridgeKeysOnSide(br, landHex, bridgeKeys, sideSign) {
    if(!landHex || !bridgeKeys || !bridgeKeys.length) return;
    let hr = gameData.hexRadius || 20;
    let ang = br.angle || 0;
    let cos = Math.cos(ang),
        sin = Math.sin(ang);
    let lk = getHexKey(landHex);
    let linked = false;
    for(let ki = 0; ki < bridgeKeys.length; ki++) {
        let bh = gameData.hexes[bridgeKeys[ki]];
        if(!bh || !isBridgeHex(bh)) continue;
        let blx = (bh.x - br.x) * cos + (bh.y - br.y) * sin;
        if(sideSign < 0 ? blx > hr * 0.4 : blx < -hr * 0.4) continue;
        wodLinkBridgeLandHex(lk, bridgeKeys[ki]);
        linked = true;
    }
    if(!linked) {
        let best = null,
            bestD = Infinity;
        for(let ki = 0; ki < bridgeKeys.length; ki++) {
            let bh = gameData.hexes[bridgeKeys[ki]];
            if(!bh) continue;
            let blx = (bh.x - br.x) * cos + (bh.y - br.y) * sin;
            if(sideSign < 0 ? blx > hr * 0.75 : blx < -hr * 0.75) continue;
            let dx = landHex.x - bh.x,
                dy = landHex.y - bh.y;
            let d = dx * dx + dy * dy;
            if(d < bestD) {
                bestD = d;
                best = bridgeKeys[ki];
            }
        }
        if(best) wodLinkBridgeLandHex(lk, best);
    }
}
function wodRebuildBridgeLandLinks() {
    gameData._bridgeLandEntry = {};
    gameData._bridgeExitLand = {};
    let list = gameData.bridges || [];
    if(!list.length || !gameData.hexList) return;
    let hr = gameData.hexRadius || 20;
    let reach = hr * 3.35;
    let reach2 = reach * reach;
    for(let bi = 0; bi < list.length; bi++) {
        let br = list[bi];
        if(!br) continue;
        if(!br.hexKeys || !br.hexKeys.length) wodSyncBridgeWorldCoords(br);
        let bridgeKeys = br.hexKeys;
        if(!bridgeKeys || !bridgeKeys.length) continue;
        let caps = [wodBridgeCapPoint(br, -1), wodBridgeCapPoint(br, 1)];
        for(let ki = 0; ki < bridgeKeys.length; ki++) {
            let bh = gameData.hexes[bridgeKeys[ki]];
            if(!bh) continue;
            for(let dq = -5; dq <= 5; dq++) {
                for(let dr = -5; dr <= 5; dr++) {
                    if(Math.abs(dq) + Math.abs(dr) > 5) continue;
                    let h = wodHexAt(bh.q + dq,bh.r + dr);
                    if(!h || isWaterHex(h) || h.type === 'mountain' || isBridgeHex(h)) continue;
                    wodLinkBridgeLandHex(getHexKey(h), bridgeKeys[ki]);
                }
            }
        }
        for(let hi = 0, hl = gameData.hexList.length; hi < hl; hi++) {
            let h = gameData.hexList[hi];
            if(!h || isWaterHex(h) || h.type === 'mountain') continue;
            let near = wodDistToBridgeRect(h.x, h.y, br) <= hr * 3.65;
            if(!near) {
                for(let ci = 0; ci < caps.length; ci++) {
                    let cap = caps[ci];
                    let dx = h.x - cap.x,
                        dy = h.y - cap.y;
                    if(dx * dx + dy * dy <= reach2) {
                        near = true;
                        break;
                    }
                }
            }
            if(!near) continue;
            wodLinkLandHexToBridgeKeysOnSide(br, h, bridgeKeys, wodBridgeHexBankSign(br, h));
        }
        let deck = wodGetOrderedBridgeDeck(br);
        for(let endSign of [-1, 1]) {
            let deckEnd = wodBridgeDeckHexNearCap(br, deck, endSign);
            if(!deckEnd) continue;
            let endKey = getHexKey(deckEnd);
            let bankLand = wodBridgeBankLandHexes(br, endSign);
            for(let si = 0; si < bankLand.length; si++) {
                let sh = bankLand[si];
                wodLinkBridgeLandHex(getHexKey(sh), endKey);
                wodLinkLandHexToBridgeKeysOnSide(br, sh, bridgeKeys, endSign);
            }
            let perpLand = wodBridgePerpBankLandHexes(br, endSign);
            for(let pi = 0; pi < perpLand.length; pi++)
                wodLinkBridgeLandHex(getHexKey(perpLand[pi]), endKey);
        }
        wodLinkShoreHexesNearBridge(br, deck);
    }
}
/** Link every shore hex near the bridge to that end's deck cap — robust portal graph. */
function wodLinkShoreHexesNearBridge(br, deck) {
    if(!br || !deck || !deck.length || !gameData.hexList) return;
    let hr = gameData.hexRadius || 20;
    let negEnd = wodBridgeDeckHexNearCap(br, deck, -1);
    let posEnd = wodBridgeDeckHexNearCap(br, deck, 1);
    let reach2 = (hr * 7) * (hr * 7);
    for(let hi = 0, hl = gameData.hexList.length; hi < hl; hi++) {
        let h = gameData.hexList[hi];
        if(!h || isWaterHex(h) || h.type === 'mountain') continue;
        if(wodDistToBridgeRect(h.x, h.y, br) > hr * 6 && (h.x - br.x) ** 2 + (h.y - br.y) ** 2 > reach2) continue;
        let side = wodBridgeHexBankSign(br, h);
        let deckEnd = side < 0 ? negEnd : posEnd;
        if(deckEnd) wodLinkBridgeLandHex(getHexKey(h), getHexKey(deckEnd));
    }
}
function wodBridgeDeckPointForHex(h, br, prevH, nextH) {
    if(!h || !br) return h ? { x: h.x, y: h.y } : null;
    wodSyncBridgeWorldCoords(br);
    let ang = br.angle || 0;
    let cos = Math.cos(ang),
        sin = Math.sin(ang);
    let dx = h.x - br.x,
        dy = h.y - br.y;
    let lx = dx * cos + dy * sin;
    let ly = -dx * sin + dy * cos;
    if(nextH) {
        let ndx = nextH.x - h.x,
            ndy = nextH.y - h.y;
        let along = ndx * cos + ndy * sin;
        lx += Math.sign(along) * Math.min(Math.abs(along) * 0.22, br.w * 0.12);
    } else if(prevH) {
        let pdx = h.x - prevH.x,
            pdy = h.y - prevH.y;
        let along = pdx * cos + pdy * sin;
        lx += Math.sign(along) * Math.min(Math.abs(along) * 0.18, br.w * 0.1);
    }
    lx = Math.max(-br.w * 0.46, Math.min(br.w * 0.46, lx));
    ly = Math.max(-br.h * 0.46, Math.min(br.h * 0.46, ly));
    return {
        x: br.x + lx * cos - ly * sin,
        y: br.y + lx * sin + ly * cos
    };
}
function wodBridgeCapSignForApproach(br, fromX, fromY) {
    wodSyncBridgeWorldCoords(br);
    let ang = br.angle || 0;
    let cos = Math.cos(ang),
        sin = Math.sin(ang);
    let lx = (fromX - br.x) * cos + (fromY - br.y) * sin;
    return lx < 0 ? -1 : 1;
}
function wodPushWaypointDedup(out, pt) {
    if(!pt) return;
    if(out.length) {
        let last = out[out.length - 1];
        let dx = pt.x - last.x,
            dy = pt.y - last.y;
        let hr = gameData.hexRadius || 20;
        if(dx * dx + dy * dy < hr * hr * 0.09) return;
    }
    out.push(pt);
}
/** Dense deck corridor along the bridge axis — avoids jumping between gapped bridge hex centers.
 * Sweep direction follows travel (prev→next). Always sweeping min→max caused triangular
 * loops when marching the opposite way across the deck. */
function wodBridgeDeckCorridorWaypoints(br, prevHex, deckRun, nextHex) {
    if(!br || !deckRun || !deckRun.length) return [];
    wodSyncBridgeWorldCoords(br);
    let hr = gameData.hexRadius || 20;
    let ang = br.angle || 0;
    let cos = Math.cos(ang),
        sin = Math.sin(ang);
    let out = [];
    let entrySign = 0,
        exitSign = 0;
    if(prevHex && !isBridgeHex(prevHex)) {
        entrySign = wodBridgeHexBankSign(br, prevHex) || wodBridgeCapSignForApproach(br, prevHex.x, prevHex.y);
        if(entrySign) out.push(wodBridgeCapPoint(br, entrySign));
    }
    let minLx = Infinity,
        maxLx = -Infinity;
    for(let ri = 0; ri < deckRun.length; ri++) {
        let h = deckRun[ri];
        let lx = (h.x - br.x) * cos + (h.y - br.y) * sin;
        minLx = Math.min(minLx, lx);
        maxLx = Math.max(maxLx, lx);
    }
    let pad = hr * 0.42;
    let hwCap = br.w * 0.46;
    minLx = Math.max(-hwCap, minLx - pad);
    maxLx = Math.min(hwCap, maxLx + pad);
    let span = maxLx - minLx;
    if(span < hr * 0.4) {
        let mid = (minLx + maxLx) * 0.5;
        minLx = Math.max(-hwCap, mid - hr * 0.55);
        maxLx = Math.min(hwCap, mid + hr * 0.55);
        span = maxLx - minLx;
    }
    // Travel along the axis in the direction of the march, not always min→max.
    let startLx = minLx,
        endLx = maxLx;
    if(entrySign < 0) { startLx = minLx; endLx = maxLx; }
    else if(entrySign > 0) { startLx = maxLx; endLx = minLx; }
    else if(prevHex && nextHex) {
        let plx = (prevHex.x - br.x) * cos + (prevHex.y - br.y) * sin;
        let nlx = (nextHex.x - br.x) * cos + (nextHex.y - br.y) * sin;
        if(nlx < plx) { startLx = maxLx; endLx = minLx; }
    } else if(prevHex) {
        let plx = (prevHex.x - br.x) * cos + (prevHex.y - br.y) * sin;
        if(plx > (minLx + maxLx) * 0.5) { startLx = maxLx; endLx = minLx; }
    }
    let travel = endLx - startLx;
    let steps = Math.max(4, Math.ceil(Math.abs(travel) / (hr * 0.72)));
    for(let si = 0; si <= steps; si++) {
        let lx = startLx + (travel * si) / steps;
        out.push({ x: br.x + lx * cos, y: br.y + lx * sin });
    }
    if(nextHex && !isBridgeHex(nextHex)) {
        exitSign = wodBridgeHexBankSign(br, nextHex) || wodBridgeCapSignForApproach(br, nextHex.x, nextHex.y);
        if(exitSign) out.push(wodBridgeCapPoint(br, exitSign));
    }
    return out;
}
/** Drop near-duplicates, collinear midpoints, and sharp reverse kinks from arrow polylines.
 * Display-only — never run this on unit.path movement corridors (it collapses bridge decks). */
function wodCleanOrderArrowPolyline(pts) {
    if(!pts || pts.length < 2) return pts || [];
    let hr = gameData.hexRadius || 20;
    let min2 = Math.pow(hr * 0.32, 2);
    let out = [{ x: pts[0].x, y: pts[0].y }];
    for(let i = 1; i < pts.length; i++) {
        let p = pts[i];
        if(!p || p.x == null) continue;
        let q = out[out.length - 1];
        let dx = p.x - q.x,
            dy = p.y - q.y;
        if(dx * dx + dy * dy < min2) continue;
        if(out.length >= 2) {
            let a = out[out.length - 2];
            let abx = q.x - a.x,
                aby = q.y - a.y;
            let bpx = p.x - q.x,
                bpy = p.y - q.y;
            let ab2 = abx * abx + aby * aby;
            let bp2 = bpx * bpx + bpy * bpy;
            if(ab2 > 1 && bp2 > 1) {
                let inv = 1 / Math.sqrt(ab2 * bp2);
                let dot = (abx * bpx + aby * bpy) * inv;
                if(dot < -0.45) {
                    // Sharp reverse (triangle/Z kink) — drop the middle point.
                    out.pop();
                    q = out[out.length - 1];
                    dx = p.x - q.x;
                    dy = p.y - q.y;
                    if(dx * dx + dy * dy < min2) continue;
                } else if(dot > 0.994) {
                    out[out.length - 1] = { x: p.x, y: p.y };
                    continue;
                }
            }
        }
        out.push({ x: p.x, y: p.y });
    }
    return out.length >= 2 ? out : pts.slice(0, 2);
}
function wodHexPathToWorldWaypoints(unit, hexPath, exactEnd) {
    if(!hexPath || hexPath.length <= 1) return [];
    let out = [];
    let useBridges = wodUnitUsesLandBridges(unit);
    let waterOnly = unit && (wodIsNavalUnit(unit) || (unit.type === 'convoy' && unit.convoySeaRoute));
    // Paths that START on a bridge used to skip the first deck hex (loop begins at i=1),
    // collapsing shore→far-shore corridors into a single land point / water chord.
    let i0 = 1;
    if(useBridges && isBridgeHex(hexPath[0])) {
        let br0 = bridgeAtHex(hexPath[0]);
        let run0 = [hexPath[0]];
        let j0 = 1;
        while(j0 < hexPath.length && isBridgeHex(hexPath[j0]) && bridgeAtHex(hexPath[j0]) === br0) {
            run0.push(hexPath[j0]);
            j0++;
        }
        let next0 = j0 < hexPath.length ? hexPath[j0] : null;
        let corridor0 = wodBridgeDeckCorridorWaypoints(br0, null, run0, next0);
        for(let ci = 0; ci < corridor0.length; ci++) wodPushWaypointDedup(out, corridor0[ci]);
        if(!corridor0.length) wodPushWaypointDedup(out, { x: hexPath[0].x, y: hexPath[0].y });
        i0 = j0;
    }
    for(let i = i0; i < hexPath.length; i++) {
        let h = hexPath[i];
        if(useBridges && isBridgeHex(h)) {
            let br = bridgeAtHex(h);
            let prev = hexPath[i - 1];
            if(prev && isBridgeHex(prev) && bridgeAtHex(prev) === br) continue;
            let run = [h];
            let j = i + 1;
            while(j < hexPath.length && isBridgeHex(hexPath[j]) && bridgeAtHex(hexPath[j]) === br) {
                run.push(hexPath[j]);
                j++;
            }
            let next = j < hexPath.length ? hexPath[j] : null;
            let corridor = wodBridgeDeckCorridorWaypoints(br, prev, run, next);
            for(let ci = 0; ci < corridor.length; ci++) wodPushWaypointDedup(out, corridor[ci]);
            // Bridge corridor can be empty (degenerate deck) — keep a hex center so callers
            // never shift() an empty path and crash on pathPrepared.
            if(!corridor.length) wodPushWaypointDedup(out, { x: h.x, y: h.y });
            i = j - 1;
            continue;
        }
        wodPushWaypointDedup(out, { x: h.x, y: h.y });
    }
    if(!out.length) {
        let endHex = hexPath[hexPath.length - 1];
        if(exactEnd && !(waterOnly && !wodSamplePosOnWalkableTerrain(unit, exactEnd.x, exactEnd.y)))
            out.push({ x: exactEnd.x, y: exactEnd.y });
        else if(endHex) out.push({ x: endHex.x, y: endHex.y });
    } else if(exactEnd) {
        // Ships/sea convoys: never replace the last water waypoint with a land click,
        // and never snap a far water goal across a land chord (truncated PF used to).
        if(waterOnly) {
            if(wodSamplePosOnWalkableTerrain(unit, exactEnd.x, exactEnd.y)) {
                let lastPt = out[out.length - 1];
                if(lastPt && wodOpenWaterChordClear(unit, lastPt.x, lastPt.y, exactEnd.x, exactEnd.y))
                    out[out.length - 1] = { x: exactEnd.x, y: exactEnd.y };
            }
        } else {
            // Truncate to the closest point along the path, then set exactEnd.
            // Replacing only the LAST point left full bridge-deck sweeps that then
            // doubled back to a pre-bridge joinPt (units reverse mid-crossing).
            let bestI = out.length - 1,
                bestD = Infinity;
            for(let i = 0; i < out.length; i++) {
                let dx = out[i].x - exactEnd.x,
                    dy = out[i].y - exactEnd.y;
                let d = dx * dx + dy * dy;
                if(d < bestD) {
                    bestD = d;
                    bestI = i;
                }
            }
            out.length = bestI + 1;
            out[out.length - 1] = { x: exactEnd.x, y: exactEnd.y };
        }
    }
    // A* starts at a tile center. A follower pushed toward its edge must first
    // recenter if its actual position cannot see the first turn around the wall.
    // (In the corner of a diagonal pass the nearest cell by rounding is a peak; the
    // unit then belongs to the pass cell the corner tolerance assigns it to.)
    const start=hexPath[0];
    if(out.length&&unit&&start&&!isBridgeHex(start)&&
        getHexKey(wodDiagonalLandLinkAtPoint(unit,unit.x,unit.y)||getNearestHexToPoint(unit.x,unit.y))===getHexKey(start)&&
        !wodSegmentClearsTerrainForUnit(unit,unit.x,unit.y,out[0].x,out[0].y,true)&&
        wodSegmentClearsTerrainForUnit(unit,unit.x,unit.y,start.x,start.y))
        out.unshift({x:start.x,y:start.y});
    // Keep bridge deck/portal geometry intact. Ordinary routes can follow
    // straight visible chords instead of every A* stair step and reverse kink.
    return unit?._wodRiskRetreat||hexPath.some(isBridgeHex)||isLandArmyUnit(unit)&&hexPath.some(isWaterHex)?out:wodPullMarchPathTaut(unit,out);
}
function wodStraightMarchSegmentClear(unit,a,b) {
    if(!wodSegmentClearsTerrainForUnit(unit,a.x,a.y,b.x,b.y,true))return false;
    const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/((gameData.hexRadius||20)*.3)));
    let previous=getNearestHexToPoint(a.x,a.y);
    for(let i=1;i<=steps;i++) {
        const h=getNearestHexToPoint(a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps);
        if(!h||isBridgeHex(h))return false;
        if(previous&&h!==previous&&!wodCanStepBetweenHexes(unit,previous,h,wodUnitPrefersLandOnlyPath(unit)))return false;
        previous=h;
    }
    return true;
}
function wodPullMarchPathTaut(unit,points) {
    if(!unit||!points.length)return points;
    const result=[];let anchor={x:unit.x,y:unit.y},i=0;
    const weighted=wodMpIsHumanOwner(unit.owner)&&['motorized','mountaineer'].includes(unit.type),prefix=[];
    if(weighted){let prev=anchor,total=0;for(const p of points){total+=wodLandChordTravelCost(unit,prev,p);prefix.push(total);prev=p;}}
    const useful=(a,b,j)=>!weighted||wodLandChordTravelCost(unit,a,b)<=(prefix[j]-(i?prefix[i-1]:0))*1.01;
    if(wodStraightMarchSegmentClear(unit,anchor,points[points.length-1])&&useful(anchor,points[points.length-1],points.length-1))return [points[points.length-1]];
    while(i<points.length) {
        let next=i;
        for(let j=Math.min(points.length-1,i+48);j>i;j--) {
            if(wodStraightMarchSegmentClear(unit,anchor,points[j])&&useful(anchor,points[j],j)){next=j;break;}
        }
        result.push(points[next]);anchor=points[next];i=next+1;
    }
    return result;
}
/** Drop reverse kinks from a world polyline (approach→deck stitch / join overshoot). */
function wodStripReversePathKinks(pts, unit) {
    if(!pts || pts.length < 3) return pts || [];
    let hr = gameData.hexRadius || 20;
    let min2 = Math.pow(hr * 0.28, 2);
    let out = [{ x: pts[0].x, y: pts[0].y }];
    for(let i = 1; i < pts.length; i++) {
        let p = pts[i];
        if(!p) continue;
        let q = out[out.length - 1];
        let dx = p.x - q.x,
            dy = p.y - q.y;
        if(dx * dx + dy * dy < min2 && (!unit||wodSegmentClearsTerrainForUnit(unit,q.x,q.y,p.x,p.y))) continue;
        if(out.length >= 2) {
            let a = out[out.length - 2];
            let abx = q.x - a.x,
                aby = q.y - a.y;
            let bpx = p.x - q.x,
                bpy = p.y - q.y;
            let ab2 = abx * abx + aby * aby;
            let bp2 = bpx * bpx + bpy * bpy;
            if(ab2 > 1 && bp2 > 1) {
                let dot = (abx * bpx + aby * bpy) / Math.sqrt(ab2 * bp2);
                if(dot < -0.2 && (!unit||wodSegmentClearsTerrainForUnit(unit,a.x,a.y,p.x,p.y))) {
                    out.pop();
                    q = out[out.length - 1];
                    dx = p.x - q.x;
                    dy = p.y - q.y;
                    if(dx * dx + dy * dy < min2 && (!unit||wodSegmentClearsTerrainForUnit(unit,q.x,q.y,p.x,p.y))) continue;
                }
            }
        }
        out.push({ x: p.x, y: p.y });
    }
    return out.length >= 2 ? out : pts.slice(0, 2);
}
/** Shift the next path waypoint onto unit.target; returns false if the path is empty. */
function wodTakeNextPathTarget(unit) {
    if(!unit || !unit.path || !unit.path.length) {
        if(unit) unit.target = null;
        return false;
    }
    let next = unit.path.shift();
    while(next == null && unit.path.length) next = unit.path.shift();
    if(!next) {
        unit.target = null;
        return false;
    }
    unit.target = next;
    unit.target.pathPrepared = true;
    return true;
}
// Water cells outside the deck index are tested against every bridge's rectangle. The answer is remembered per
// cell while the bridge list and its index stay the same (supply floods ask it for every water cell they touch).
const wodBridgeRectMemo={index:null,list:null,length:-1,hits:new WeakMap()};
function bridgeAtHex(hex) {
    if(!hex) return null;
    if(!gameData.bridges || !gameData.bridges.length) return null;
    if(gameData._bridgeByHexKey) {
        let br = gameData._bridgeByHexKey[getHexKey(hex)];
        if(br) return br;
    }
    if(!isWaterHex(hex) || !gameData.bridges || !gameData.bridges.length) return null;
    const memo=wodBridgeRectMemo,list=gameData.bridges;
    if(memo.index!==gameData._bridgeByHexKey||memo.list!==list||memo.length!==list.length){memo.index=gameData._bridgeByHexKey;memo.list=list;memo.length=list.length;memo.hits=new WeakMap();}
    const known=memo.hits.get(hex);if(known!==undefined&&(known===null||list.includes(known)))return known;
    let hit=null;
    for(let bi = 0, bl = list.length; bi < bl; bi++) {
        let br = list[bi];
        if(!br) continue;
        if(br.x == null) wodSyncBridgeWorldCoords(br);
        if(wodPointInBridgeRect(hex.x, hex.y, br, 1.48)) { hit = br; break; }
    }
    memo.hits.set(hex,hit);
    return hit;
}
function isBridgeHex(hex) {
    return !!bridgeAtHex(hex);
}
function wodBridgeWaterHexNearPoint(br, x, y) {
    if(!br) return null;
    if(br.x == null) wodSyncBridgeWorldCoords(br);
    let best = null,
        bestD = Infinity;
    let keys = br.hexKeys;
    if(keys && keys.length) {
        for(let ki = 0; ki < keys.length; ki++) {
            let h = gameData.hexes[keys[ki]];
            if(!h || !isWaterHex(h)) continue;
            let dx = x - h.x,
                dy = y - h.y;
            let d = dx * dx + dy * dy;
            if(d < bestD) {
                bestD = d;
                best = h;
            }
        }
    }
    // Registered deck keys found a hex — skip the full-map fallback scan.
    if(best) return best;
    for(let hi = 0, hl = gameData.hexList.length; hi < hl; hi++) {
        let h = gameData.hexList[hi];
        if(!h || !isWaterHex(h)) continue;
        if(!wodPointInBridgeRect(h.x, h.y, br, 1.48)) continue;
        let dx = x - h.x,
            dy = y - h.y;
        let d = dx * dx + dy * dy;
        if(d < bestD) {
            bestD = d;
            best = h;
        }
    }
    return best;
}
function wodUnitUsesLandBridges(unit) {
    return !!unit && !wodIsNavalUnit(unit) && !(unit.type === 'convoy' && unit.convoySeaRoute);
}
function wodPointOnBridgeForUnit(unit, px, py, padScale) {
    if(!wodUnitUsesLandBridges(unit) || !gameData.bridges || !gameData.bridges.length) return false;
    let pad = padScale == null ? 1 : padScale;
    for(let bi = 0, bl = gameData.bridges.length; bi < bl; bi++) {
        if(wodPointInBridgeRect(px, py, gameData.bridges[bi], pad)) return true;
    }
    return false;
}
function wodNearestBridgeHexForUnit(unit, x, y) {
    if(!wodUnitUsesLandBridges(unit) || !gameData.bridges || !gameData.bridges.length) return null;
    let best = null,
        bestD = Infinity;
    for(let bi = 0, bl = gameData.bridges.length; bi < bl; bi++) {
        let br = gameData.bridges[bi];
        if(!br || !wodPointInBridgeRect(x, y, br)) continue;
        let keys = br.hexKeys;
        if(!keys || !keys.length) {
            wodSyncBridgeWorldCoords(br);
            keys = br.hexKeys;
        }
        if(!keys) continue;
        for(let ki = 0; ki < keys.length; ki++) {
            let h = gameData.hexes[keys[ki]];
            if(!h || !isBridgeHex(h)) continue;
            let dx = h.x - x,
                dy = h.y - y;
            let d = dx * dx + dy * dy;
            if(d < bestD) {
                bestD = d;
                best = h;
            }
        }
    }
    return best;
}
/** Coarse rejection: is the point within any bridge's bounding circle (with margin)? */
function wodPointNearAnyBridge(x, y) {
    let list = gameData.bridges;
    if(!list || !list.length) return false;
    for(let bi = 0, bl = list.length; bi < bl; bi++) {
        let br = list[bi];
        if(!br) continue;
        if(br.x == null) wodSyncBridgeWorldCoords(br);
        let rr = br._nearR2;
        if(rr == null) {
            let half = Math.max(br.w || 0, br.h || 0) * 0.5;
            let near = half * 1.6 + (gameData.hexRadius || 20) * 4;
            rr = br._nearR2 = near * near;
        }
        let dx = x - br.x, dy = y - br.y;
        if(dx * dx + dy * dy <= rr) return true;
    }
    return false;
}
/** Bridge deck tiles stay water terrain; resolve them as land march targets, not ocean orders. */
function wodBridgeHexAtPoint(unit, x, y) {
    if(!wodUnitUsesLandBridges(unit)) return null;
    // No bridges on the map (or point nowhere near one) → skip the radius scans entirely.
    if(!gameData.bridges || !gameData.bridges.length) return null;
    if(!wodPointNearAnyBridge(x, y)) return null;
    // A bridge cap may overlap a bank. Dry ground remains dry ground;
    // neither its occupied cell nor a nearby click belongs to the deck.
    const ground = getNearestHexToPoint(x, y);
    if(ground && !isWaterHex(ground)) return null;
    if(gameData.bridges && gameData.bridges.length) {
        for(let bi = 0, bl = gameData.bridges.length; bi < bl; bi++) {
            let br = gameData.bridges[bi];
            if(!br) continue;
            if(br.x == null) wodSyncBridgeWorldCoords(br);
            if(!wodPointInBridgeRect(x, y, br, 1.05)) continue;
            let h = wodBridgeWaterHexNearPoint(br, x, y);
            if(h) return h;
        }
    }
    return null;
}
function wodPointOnBridgeDeck(unit, x, y) {
    return !!wodBridgeHexAtPoint(unit, x, y);
}
function wodBridgeLinkedHexes(hex) {
    let br = bridgeAtHex(hex);
    if(!br) return [];
    if(!br.hexKeys || !br.hexKeys.length) wodSyncBridgeWorldCoords(br);
    let keys = br.hexKeys;
    if(!keys || !keys.length) return [hex];
    let out = [];
    for(let ki = 0; ki < keys.length; ki++) {
        let h = gameData.hexes[keys[ki]];
        if(h) out.push(h);
    }
    return out.length ? out : [hex];
}
function wodGetOrderedBridgeDeck(br) {
    if(!br) return [];
    wodSyncBridgeWorldCoords(br);
    let keys = br.hexKeys;
    if(!keys || !keys.length) return [];
    let ang = br.angle || 0;
    let cos = Math.cos(ang),
        sin = Math.sin(ang);
    let arr = [];
    for(let ki = 0; ki < keys.length; ki++) {
        let h = gameData.hexes[keys[ki]];
        if(h) arr.push(h);
    }
    arr.sort((a, b) => {
        let ax = (a.x - br.x) * cos + (a.y - br.y) * sin;
        let bx = (b.x - br.x) * cos + (b.y - br.y) * sin;
        return ax - bx;
    });
    return arr;
}
function wodSliceBridgeDeckBetween(deck, nearA, nearB) {
    if(!deck || !deck.length) return [];
    if(!nearA || !nearB) return deck.slice();
    let ak = getHexKey(nearA),
        bk = getHexKey(nearB);
    if(ak === bk) return [nearA];
    let ia = -1,
        ib = -1;
    for(let i = 0; i < deck.length; i++) {
        let k = getHexKey(deck[i]);
        if(k === ak) ia = i;
        if(k === bk) ib = i;
    }
    if(ia < 0) {
        let best = Infinity;
        for(let i = 0; i < deck.length; i++) {
            let dx = deck[i].x - nearA.x,
                dy = deck[i].y - nearA.y;
            let d = dx * dx + dy * dy;
            if(d < best) {
                best = d;
                ia = i;
            }
        }
    }
    if(ib < 0) {
        let best = Infinity;
        for(let i = 0; i < deck.length; i++) {
            let dx = deck[i].x - nearB.x,
                dy = deck[i].y - nearB.y;
            let d = dx * dx + dy * dy;
            if(d < best) {
                best = d;
                ib = i;
            }
        }
    }
    if(ia < 0 || ib < 0) return deck.slice();
    if(ia <= ib) return deck.slice(ia, ib + 1);
    return deck.slice(ib, ia + 1).reverse();
}
function wodNearestHexOnBridgeDeck(deck, refHex) {
    if(!deck || !deck.length || !refHex) return deck[0] || null;
    let best = deck[0],
        bestD = Infinity;
    for(let i = 0; i < deck.length; i++) {
        let dx = deck[i].x - refHex.x,
            dy = deck[i].y - refHex.y;
        let d = dx * dx + dy * dy;
        if(d < bestD) {
            bestD = d;
            best = deck[i];
        }
    }
    return best;
}
function wodBridgeEndTouchesLand(br, endSign, owner) {
    if(!br || br.w == null) return false;
    let hw = br.w * 0.5;
    let ang = br.angle || 0;
    let cos = Math.cos(ang),
        sin = Math.sin(ang);
    let inset = Math.min(hw * 0.38, (gameData.hexRadius || 20) * 1.05);
    let ex = br.x + endSign * Math.max(inset, hw - inset) * cos;
    let ey = br.y + endSign * Math.max(inset, hw - inset) * sin;
    let reach = (gameData.hexRadius || 20) * 1.48;
    let reach2 = reach * reach;
    for(let hi = 0, hl = gameData.hexList.length; hi < hl; hi++) {
        let h = gameData.hexList[hi];
        if(!h || isWaterHex(h) || h.type === 'mountain' || h.type === 'urban') continue;
        if(owner>0&&h.owner!==owner)continue;
        let dx = h.x - ex,
            dy = h.y - ey;
        if(dx * dx + dy * dy <= reach2) return true;
    }
    return false;
}
function wodBridgeBothEndsTouchLand(br) {
    return wodBridgeEndTouchesLand(br, -1) && wodBridgeEndTouchesLand(br, 1);
}
function wodBridgeOverlapSamplePoints(br, padScale) {
    padScale = padScale == null ? 1 : padScale;
    let pts = [{ x: br.x, y: br.y }];
    let ang = br.angle || 0;
    let cos = Math.cos(ang),
        sin = Math.sin(ang);
    let hw = (br.w || 0) * 0.5 * padScale,
        hh = (br.h || 0) * 0.5 * padScale;
    let corners = [
        [-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh],
        [0, -hh], [0, hh], [-hw, 0], [hw, 0]
    ];
    for(let ci = 0; ci < corners.length; ci++) {
        let lx = corners[ci][0],
            ly = corners[ci][1];
        pts.push({ x: br.x + lx * cos - ly * sin, y: br.y + lx * sin + ly * cos });
    }
    return pts;
}
function wodBridgeRectsOverlap(a, b, padScale) {
    if(!a || !b) return false;
    padScale = padScale == null ? 1.04 : padScale;
    if(wodPointInBridgeRect(a.x, a.y, b, padScale)) return true;
    if(wodPointInBridgeRect(b.x, b.y, a, padScale)) return true;
    let ptsA = wodBridgeOverlapSamplePoints(a, padScale);
    for(let pi = 0; pi < ptsA.length; pi++) {
        if(wodPointInBridgeRect(ptsA[pi].x, ptsA[pi].y, b, padScale)) return true;
    }
    let ptsB = wodBridgeOverlapSamplePoints(b, padScale);
    for(let pi = 0; pi < ptsB.length; pi++) {
        if(wodPointInBridgeRect(ptsB[pi].x, ptsB[pi].y, a, padScale)) return true;
    }
    let hr = gameData.hexRadius || 20;
    let dx = a.x - b.x,
        dy = a.y - b.y;
    return dx * dx + dy * dy < Math.pow(hr * 2.75, 2);
}
// Two decks may share an end, a bank cell both rest on: bridges end to end across an island, or fanning out from one
// landing at 35 degrees or more. Round that cell they may meet as far as two decks parting at that angle must; anywhere
// else they may not: not crossing over the water, not touching side by side, and not
// fanning out so narrowly that they lie on top of each other. Any deck within about three cells of another, or touching
// a cell another had claimed, used to count as in the way, so no two bridges could share a landing.
const WOD_BRIDGE_FAN_MIN_ANGLE = 35 * Math.PI / 180;
function wodBridgeEnds(br) {
    const c = Math.cos(br.angle || 0), s = Math.sin(br.angle || 0), hw = (br.w || 0) / 2;
    return [-1, 1].map(k => {
        const x = br.x + k * c * hw, y = br.y + k * s * hw, cell = getNearestHexToPoint(x, y);
        return { x, y, cell, dx: -k * c, dy: -k * s };     // (dx, dy): from this end into the deck
    });
}
/** True when two decks meet anywhere but round a bank cell they share. keysA/keysB: the cells each claims (optional). */
function wodBridgeDecksConflict(a, b, keysA, keysB) {
    if(!a || !b || a.x == null || b.x == null) return false;
    const sp = (gameData.hexRadius || 20) * 1.35;
    if(Math.hypot(a.x - b.x, a.y - b.y) > ((a.w || 0) + (b.w || 0) + (a.h || 0) + (b.h || 0)) / 2 + sp * 2) return false;
    const shared = [];
    for(const ea of wodBridgeEnds(a)) for(const eb of wodBridgeEnds(b)) {
        if(!ea.cell || ea.cell !== eb.cell) continue;
        const angle = Math.acos(Math.max(-1, Math.min(1, ea.dx * eb.dx + ea.dy * eb.dy)));
        if(angle < WOD_BRIDGE_FAN_MIN_ANGLE) return true;
        // two decks of these widths parting at this angle overlap this far from the shared cell
        shared.push({ x: ea.cell.x, y: ea.cell.y, r: ((a.h || 0) + (b.h || 0)) * 0.55 / Math.sin(Math.min(angle, Math.PI / 2)) + sp * 0.6 });
    }
    const away = (x, y) => !shared.some(j => Math.hypot(x - j.x, y - j.y) <= j.r);
    // Decks that share no landing keep a quarter of a deck's width clear of each other (two parallel bridges two rows
    // apart may stand, one row apart they would touch). They may share the water each claims beside it for routing: a
    // second crossing at the narrows to the same island lies that close to the first, and was refused as "in the way".
    for(const [p, q] of [[a, b], [b, a]]) {
        const c = Math.cos(p.angle || 0), s = Math.sin(p.angle || 0), hw = (p.w || 0) / 2, hh = (p.h || 0) / 2;
        const steps = Math.max(4, Math.ceil((p.w || 0) / (sp * 0.25)));
        const across = shared.length ? [-hh, 0, hh] : [-hh * 1.25, -hh, 0, hh, hh * 1.25];
        for(let i = 0; i <= steps; i++) {
            const t = -hw + (2 * hw * i) / steps;
            for(const l of across) {
                const x = p.x + t * c - l * s, y = p.y + t * s + l * c;
                if(wodPointInBridgeRect(x, y, q, 1.04) && away(x, y)) return true;
            }
        }
    }
    return false;
}
function wodBridgeOverlapsExisting(br) {
    let probe = wodNormalizeBridgeRecord(Object.assign({}, br));
    if(!probe) return false;
    wodEnsureBridgePathIndex();
    const keys = wodBridgeFootprintHexKeys(probe);
    for(const other of (gameData.bridges || []))
        if(other && wodBridgeDecksConflict(probe, other, keys, other.hexKeys)) return true;
    return false;
}
function wodUnitOnBridgeDeck(unit) {
    // Registered deck cells include a routing margin around the physical
    // deck. That margin must not shelter troops swimming beside a bridge.
    return !!unit&&wodPointOnBridgeForUnit(unit,unit.x,unit.y,1.05);
}
/** Water cells under a deck's centre line. Prices a deck that arrives without a cell count
 * (jobs from older saves, scripted placements); dragged spans carry their own count. */
function wodBridgeRecordCells(br) {
    if(!br || br.x == null || !br.w) return WOD_BRIDGE_MAX_CELLS;
    const sp = (gameData.hexRadius || 20) * 1.35, c = Math.cos(br.angle || 0), s = Math.sin(br.angle || 0);
    const steps = Math.max(2, Math.ceil(br.w / (sp * 0.2))), seen = new Set();
    for(let i = 0; i <= steps; i++) {
        const t = -br.w / 2 + br.w * i / steps, h = getNearestHexToPoint(br.x + t * c, br.y + t * s);
        if(h && isWaterHex(h)) seen.add(getHexKey(h));
    }
    return Math.max(1, Math.min(WOD_BRIDGE_MAX_CELLS, seen.size));
}
/** Grid cells on the straight line between two cells, ends included. The ends are put in a
 * fixed order first, so a drag gives the same cells in either direction and the host of a
 * network game lays out exactly the span its client previewed. */
function wodBridgeLineCells(aq, ar, bq, br) {
    if(bq < aq || (bq === aq && br < ar)) { let t = aq; aq = bq; bq = t; t = ar; ar = br; br = t; }
    const dq = Math.abs(bq - aq), dr = Math.abs(br - ar), sq = aq < bq ? 1 : -1, sr = ar < br ? 1 : -1, out = [];
    let err = dq - dr, q = aq, r = ar;
    for(let guard = dq + dr + 2; guard-- > 0;) {
        out.push({ q, r });
        if(q === bq && r === br) break;
        const e2 = 2 * err;
        if(e2 > -dr) { err -= dr; q += sq; }
        if(e2 < dq) { err += dq; r += sr; }
    }
    return out;
}
/** Lays a bridge out between two cells without judging the site: which water cells it
 * crosses, what it costs, and the deck that results. A drag may begin and end anywhere on
 * the two banks; the span runs between the bank cells next to the water.
 * Returns { cells, banks, count, cost, record, error }. */
function wodBridgeSpanLayout(aq, ar, bq, br) {
    const plan = { cells: [], banks: [], count: 0, cost: 0, record: null, error: null };
    const fail = msg => { plan.error = msg; return plan; };
    if(![aq, ar, bq, br].every(Number.isFinite)) return fail('Drag from one bank to the other.');
    aq = Math.round(aq); ar = Math.round(ar); bq = Math.round(bq); br = Math.round(br);
    const start = wodHexAt(aq, ar), end = wodHexAt(bq, br);
    if(!start || !end) return fail('The bridge must stay on the map.');
    if(start === end) return fail(isWaterHex(start) ? 'Start the bridge on land, then drag across the water.' : 'Drag across the water to the other bank.');
    const tooLong = 'Too long: a bridge spans at most ' + WOD_BRIDGE_MAX_CELLS + ' cells of water.';
    if(Math.max(Math.abs(bq - aq), Math.abs(br - ar)) > 40) return fail(tooLong);
    let line = wodBridgeLineCells(aq, ar, bq, br).map(c => wodHexAt(c.q, c.r));
    if(line.some(h => !h)) return fail('The bridge must stay on the map.');
    let first = line.findIndex(h => isWaterHex(h)), last = line.length - 1;
    while(last >= 0 && !isWaterHex(line[last])) last--;
    if(first < 0) return fail('Bridges must cross water.');
    plan.cells = line.slice(first, last + 1).filter(h => isWaterHex(h));
    plan.count = plan.cells.length;
    plan.cost = plan.count * WOD_PRICE_BRIDGE_PER_CELL;
    if(isWaterHex(start)) return fail('Start the bridge on land.');
    if(isWaterHex(end)) return fail('End the bridge on land.');
    // Lay the line again between the two bank cells: those two cells alone now define
    // the span, which is what a network client sends to the host.
    const a0 = line[first - 1], b0 = line[last + 1];
    line = wodBridgeLineCells(a0.q, a0.r, b0.q, b0.r).map(c => wodHexAt(c.q, c.r));
    if(line.some(h => !h)) return fail('The bridge must stay on the map.');
    const a = line[0], b = line[line.length - 1], water = line.slice(1, -1);
    plan.banks = [a, b];
    plan.cells = water.filter(h => isWaterHex(h));
    plan.count = water.length;
    plan.cost = plan.count * WOD_PRICE_BRIDGE_PER_CELL;
    if(!water.length || water.some(h => !isWaterHex(h))) return fail('Land is in the way: a bridge crosses one stretch of water.');
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    // The deck runs from the centre of one bank cell to the centre of the other.
    plan.record = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle: Math.atan2(b.y - a.y, b.x - a.x), w: len, h: wodBridgeDefaultDims().h,
        cells: plan.count, aq: a.q, ar: a.r, bq: b.q, br: b.r };
    // The span is limited by the water it crosses, the same in every direction: the line between the banks puts one
    // cell on each step, so four cells of water is four steps whether straight or slanted. A cap on the deck's length as
    // well (5.4 cells) refused a 45-degree crossing of a river three cells wide, which a straight one of four passed.
    if(plan.count > WOD_BRIDGE_MAX_CELLS) return fail(tooLong);
    if(a.type === 'mountain' || b.type === 'mountain') return fail('Bridge ends must rest on open land, not on mountains.');
    return plan;
}
/** True when a bridge still under construction would collide with this deck. */
function wodBridgePendingJobConflict(br) {
    const jobs = (gameData.constructionJobs || []).filter(j => j.mode === 'bridge');
    if(!jobs.length) return false;
    // (the same rule as for built bridges: ends may be shared, decks and the water beside them may not)
    const mine = wodBridgeFootprintHexKeys(br);
    for(const j of jobs) if(wodBridgeDecksConflict(br, j, mine, null)) return true;
    return false;
}
/** The one set of rules for a dragged bridge, used by the player's preview and release,
 * by the AI and by the host of a network game. opts.skipCost leaves the treasury out. */
function wodBridgeSpanPlan(aq, ar, bq, br, owner, opts) {
    opts = opts || {};
    const plan = wodBridgeSpanLayout(aq, ar, bq, br);
    if(plan.error) return plan;
    let err = wodBridgePlacementError(plan.record, owner > 0 ? owner : null, true);
    if(err === 'Both bridge ends must touch land.' && plan.banks.some(h => h.type === 'urban'))
        err = 'Bridge ends must rest on open land, not on town streets.';
    if(!err && !opts.editor && wodBridgePendingJobConflict(plan.record)) err = 'A bridge is already under construction at this crossing.';
    if(!err && owner > 0 && !opts.skipCost && wodPlayerTreasury(owner) < plan.cost)
        err = 'Not enough money: this bridge costs $' + plan.cost.toLocaleString('en-US') + ' (you have $' + Math.floor(wodPlayerTreasury(owner)).toLocaleString('en-US') + ').';
    plan.error = err || null;
    return plan;
}
function wodBridgePlacementError(br, owner, skipCost=false, cost=null) {
    if(!br) return 'Invalid bridge.';
    let probe = wodNormalizeBridgeRecord(Object.assign({}, br));
    if(!probe) return 'Invalid bridge.';
    let keys = wodBridgeFootprintHexKeys(probe);
    if(!keys.length) return 'Bridge must cover map tiles.';
    let water = 0,
        blocked = 0;
    for(let ki = 0; ki < keys.length; ki++) {
        let h = gameData.hexes[keys[ki]];
        if(!h) continue;
        if(isWaterHex(h)) water++;
        if(h.type === 'mountain' || h.type === 'urban') blocked++;
    }
    // (the site's own ground first: another bridge nearby used to be named even when a town or mountain was in the way)
    if(water < 1) return 'Bridges must cross water.';
    if(!wodBridgeBothEndsTouchLand(probe)) return 'Both bridge ends must touch land.';
    if(owner>0&&!wodBridgeEndTouchesLand(probe,-1,owner)&&!wodBridgeEndTouchesLand(probe,1,owner))return 'At least one bridge bank must be in your territory.';
    if(blocked > 0) return 'Cannot build on mountains or city tiles.';
    if(wodBridgeOverlapsExisting(probe)) return 'Another bridge is in the way.';
    // Priced by the water crossed; a caller that already counted the cells passes the price.
    if(owner && !skipCost && wodPlayerTreasury(owner) < (cost != null ? cost : wodBridgeRecordCells(probe) * WOD_PRICE_BRIDGE_PER_CELL)) return 'Not enough money for a bridge.';
    return null;
}
async function wodNaturalizeBiomeBlends(seedOffset, mapShape) {
    let blendPasses = gameData._wodFastMapGen ? 1 : 2;
    for(let pass = 0; pass < blendPasses; pass++) {
        let changes = [];
        let hi = 0;
        for(let h of gameData.hexList) {
            if(!h || isWaterHex(h) || h.type === 'mountain' || h.type === 'urban') continue;
            let counts = {};
            let waterAdj = 0;
            for(let nb of getNeighborHexes(h)) {
                if(!nb) continue;
                if(isWaterHex(nb)) {
                    waterAdj++;
                    continue;
                }
                if(nb.type === 'mountain' || nb.type === 'urban') continue;
                counts[nb.type] = (counts[nb.type] || 0) + 1;
            }
            let bestType = h.type, bestCount = 0;
            for(let type in counts) {
                if(counts[type] > bestCount) {
                    bestType = type;
                    bestCount = counts[type];
                }
            }
            if(waterAdj >= 4 && h.type !== 'sand' && h.type !== 'swamp') {
                changes.push({ h, type: 'sand' });
            } else if(bestType !== h.type && bestCount >= (pass === 0 ? 4 : 3)) {
                changes.push({ h, type: bestType });
            }
            if((++hi & wodMapGenLoopYieldMask(1023)) === 0) await wodMapGenYieldSlice();
        }
        for(let ch of changes) wodSetGeneratedTerrainType(ch.h, ch.type);
    }

    let hi2 = 0;
    for(let h of gameData.hexList) {
        if(!h || isWaterHex(h) || h.type === 'mountain' || h.type === 'urban') continue;
        let wet = fbm(h.x * 0.0048 + seedOffset + 4700, h.y * 0.0048 + seedOffset + 4700, 4);
        let coast = getNeighborHexes(h).some(nb => nb && isWaterHex(nb));
        if(coast) continue;
        let nForest = 0, nGrass = 0, nSand = 0;
        for(let nb of getNeighborHexes(h)) {
            if(!nb || isWaterHex(nb) || nb.type === 'mountain') continue;
            if(nb.type === 'forest') nForest++;
            else if(nb.type === 'grass') nGrass++;
            else if(nb.type === 'sand') nSand++;
        }
        if(wet > 0.72 && h.type === 'grass' && nForest >= 3) wodSetGeneratedTerrainType(h, 'forest');
        else if(wet < 0.28 && h.type === 'grass' && nSand >= 3) wodSetGeneratedTerrainType(h, 'sand');
        else if(wet > 0.58 && wet < 0.7 && h.type === 'sand' && nGrass >= 4 && !wodMapShapeUsesRadialIslandMask(mapShape))
            wodSetGeneratedTerrainType(h, 'grass');
        if((++hi2 & wodMapGenLoopYieldMask(1023)) === 0) await wodMapGenYieldSlice();
    }
}
/** Fill unowned dry cells from neighboring land; water always stays neutral. */
function wodFillUnownedPoliticalHexes(passes) {
    let maxPass = Math.max(1, passes || 4);
    let changed = false;
    for(let pass = 0; pass < maxPass; pass++) {
        let updates = [];
        for(let h of gameData.hexList) {
            if(!h)continue;
            if(isWaterHex(h)){if(h.owner){h.owner=0;changed=true;}continue;}
            if(h.owner>0)continue;
            let votes = {};
            // Prefer real shared land edges over diagonal contacts.
            for(let dir of cardinalHexDirections) {
                let nb = wodHexAt(h.q + dir.q,h.r + dir.r);
                if(nb && !isWaterHex(nb) && nb.owner > 0) votes[nb.owner] = (votes[nb.owner] || 0) + 2;
            }
            for(let nb of getNeighborHexes(h)) {
                if(nb && !isWaterHex(nb) && nb.owner > 0) votes[nb.owner] = (votes[nb.owner] || 0) + 1;
            }
            let bo = 0, bv = 0;
            for(let ok in votes) {
                if(votes[ok] > bv) {
                    bv = votes[ok];
                    bo = parseInt(ok, 10);
                }
            }
            if(bo > 0) updates.push({ h, bo });
        }
        if(!updates.length) break;
        for(let u of updates) {
            if(u.h.owner !== u.bo) {
                u.h.owner = u.bo;
                changed = true;
            }
        }
        if(changed) gameData._landIncomeCacheDirty = true;
    }
    if(changed){gameData._supplyTopologyVersion=(gameData._supplyTopologyVersion||0)+1;if(gameData._supplyDirty)gameData._supplyDirty.all=true;}
    return changed;
}
/**
 * Finalize mountain ownership from dry land and clear all sea/lake claims.
 * Water is neutral in campaign, skirmish, editor and multiplayer.
 * Call once after politics settle — never inside the equalize loop (that made 3+ gen crawl).
 */
function wodAssignAllWaterFromNearestLand(preserveLandOwners = false) {
    if(!gameData || !gameData.hexList?.length)return false;
    let changed=false;const queue=[],seen=new Set();
    for(const h of gameData.hexList) {
        if(isWaterHex(h)){if(h.owner){h.owner=0;changed=true;}continue;}
        if(h.owner>0&&h.type!=='mountain'){queue.push(h);seen.add(getHexKey(h));}
    }
    for(let i=0;i<queue.length;i++)for(const d of cardinalHexDirections) {
        const n=wodHexAt(queue[i].q+d.q,queue[i].r+d.r);
        if(!n||n.type!=='mountain'||seen.has(getHexKey(n)))continue;
        seen.add(getHexKey(n));
        if((!preserveLandOwners||n.owner<=0)&&n.owner!==queue[i].owner){n.owner=queue[i].owner;changed=true;}
        queue.push(n);
    }
    if(wodFillUnownedPoliticalHexes(4))changed=true;
    return changed;
}
/** Light water/mountain neighbor vote used during mapgen equalize (fast). */
async function wodAssignWaterAndNonclaimablePoliticalVotes() {
    let hi = 0;
    for(let h of gameData.hexList) {
        if(!h) continue;
        if(isWaterHex(h)){setHexOwner(h,0);continue;}
        if(!isWaterHex(h) && h.type !== 'mountain') continue;
        let votes = {};
        for(let dir of cardinalHexDirections) {
            let nb = wodHexAt(h.q + dir.q,h.r + dir.r);
            if(!nb || isWaterHex(nb) || nb.owner <= 0) continue;
            // Prefer abutting land owners when assigning unowned peaks.
            votes[nb.owner] = (votes[nb.owner] || 0) + (!isWaterHex(nb) ? 3 : 1);
        }
        for(let nb of getNeighborHexes(h)) {
            if(nb && !isWaterHex(nb) && nb.owner > 0) votes[nb.owner] = (votes[nb.owner] || 0) + 1;
        }
        let bo = 0, bv = 0;
        for(let ok in votes) {
            if(votes[ok] > bv) {
                bv = votes[ok];
                bo = parseInt(ok, 10);
            }
        }
        if(bo > 0) setHexOwner(h, bo);
        if((++hi & wodMapGenLoopYieldMask(127)) === 0) await wodMapGenYieldSlice();
    }
    wodFillUnownedPoliticalHexes(3);
    wodMarkTerrainPoliticalDirty();
}
function wodBuildPoliticalSeedsByOwner(ownerIds) {
    let seedsByO = {};
    if(!ownerIds || ownerIds.length === 0) return seedsByO;
    for(let o of ownerIds) {
        let cap = gameData.cities.find(c => c && c.owner === o && c.hasFactory);
        if(!cap) cap = gameData.cities.find(c => c && c.owner === o);
        if(cap) seedsByO[o] = cap;
    }
    return seedsByO;
}
// A shared gentle coordinate warp keeps borders organic without multiplying
// faction scores by terrain/noise, which created disconnected contour rings.
function wodStartingPoliticalPoint(h) {
    const seed=(gameData._mapGenSeed>>>0)||1, sp=gameData.hexRadius*1.35;
    if(h._politicalWarp?.seed===seed&&h._politicalWarp.sx===h.x&&h._politicalWarp.sy===h.y&&h._politicalWarp.sp===sp)return h._politicalWarp;
    const phase=wodDeterministicCitySplitPhase01(seed)*Math.PI*2;
    return h._politicalWarp={seed,sx:h.x,sy:h.y,sp,x:h.x+sp*.8*Math.sin(h.y/(sp*12)+phase),
        y:h.y+sp*.8*Math.sin(h.x/(sp*13)-phase)};
}
async function wodAssignClaimableLandWeightedVoronoiFromSeeds(ownerIds, seedsByOwner, biasByOwner, opts) {
    if(!ownerIds || ownerIds.length === 0) return;
    let landOnly = !!(opts && opts.landOnly);
    let valid = new Set(ownerIds);
    let bias = biasByOwner || {};
    let hi = 0;
    let ownerIdxByO = {};
    let oi = 0;
    for(let o of ownerIds) ownerIdxByO[o] = oi++;
    // Precompute seed noise phase indices once.
    let seedArr = [];
    for(let o of ownerIds) {
        let s = seedsByOwner[o];
        if(s && valid.has(o)) seedArr.push({ o, s:wodStartingPoliticalPoint(s), b: bias[o] || 0 });
    }
    let savedBatch = batchHexOwner;
    batchHexOwner = true;
    batchHexOwnerDirty = false;
    try {
        for(let h of gameData.hexList) {
            if(landOnly && isWaterHex(h)) continue;
            let bestO = 0, bestScore = Infinity;
            const point=wodStartingPoliticalPoint(h);
            for(let si = 0, sn = seedArr.length; si < sn; si++) {
                let ent = seedArr[si];
                let dx = point.x - ent.s.x, dy = point.y - ent.s.y;
                let score = dx*dx+dy*dy-ent.b;
                if(score < bestScore) {
                    bestScore = score;
                    bestO = ent.o;
                }
            }
            if(h.owner !== (bestO || 0)) h.owner = bestO || 0;
            if((++hi & wodMapGenLoopYieldMask(511)) === 0) await wodMapGenYieldSlice();
        }
    } finally {
        batchHexOwner = savedBatch;
        batchHexOwnerDirty = false;
    }
}
/** One seed per faction (capital with factory when available) keeps continents simply connected like classic wedge maps. */
async function wodAssignPoliticalVoronoiFromCities(ownerIds) {
    if(!ownerIds || ownerIds.length === 0) return;
    let sorted = [...ownerIds].sort((a, b) => a - b);
    let seedsByO = wodBuildPoliticalSeedsByOwner(sorted);
    if(sorted.some(o => !seedsByO[o])) return;
    let zeroBias = {};
    for(let o of sorted) zeroBias[o] = 0;
    await wodAssignClaimableLandWeightedVoronoiFromSeeds(sorted, seedsByO, zeroBias);
    await wodAssignWaterAndNonclaimablePoliticalVotes();
    wodAssignAllWaterFromNearestLand();
}
/** All dry tiles (urban/infantry tiles incl. peaks) counted so macro territory area matches between factions ~War of Dots. */
function wodHexCountsTowardLandPoliticsBalance(h) {
    return !!(h && isClaimableLand(h) && !isWaterHex(h));
}
/** Iteratively adjust biased Voronoi so dry land totals (mountains counted) split evenly when possible (±1 if indivisible). */
async function wodEqualizePoliticsBiasedVoronoi(ownerIds, capitalCities, iterations) {
    if(!ownerIds||ownerIds.length<2)return;
    const owners=[...ownerIds].sort((a,b)=>a-b), seeds=owners.map(o=>capitalCities.find(c=>c.owner===o));
    if(seeds.some(c=>!c))return;
    const land=gameData.hexList.filter(wodHexCountsTowardLandPoliticsBalance), n=land.length;
    if(!n)return;
    const target=wodBuildLandBalanceTargets(owners), bias=owners.map(()=>0);
    const sites=seeds.map(wodStartingPoliticalPoint);
    const scores=sites.map(site=>Float64Array.from(land,h=>{
        const p=wodStartingPoliticalPoint(h);return (p.x-site.x)**2+(p.y-site.y)**2;
    }));
    const margins=new Float64Array(n);
    // Solve area quotas in the distance field, rather than carving hundreds
    // of arbitrary tiles out of the final frontier to repair a poor split.
    for(let pass=0;pass<(owners.length===2?1:28);pass++) {
        for(let o=0;o<(owners.length===2?1:owners.length);o++) {
            for(let i=0;i<n;i++) {
                let other=Infinity;
                for(let j=0;j<owners.length;j++)if(j!==o)other=Math.min(other,scores[j][i]-bias[j]);
                margins[i]=scores[o][i]-other;
            }
            margins.sort();const k=target[owners[o]];
            bias[o]=k===0?margins[0]-1:k>=n?margins[n-1]+1:(margins[k-1]+margins[k])/2;
            await wodMapGenYieldSlice();
        }
        const counts=owners.map(()=>0);
        for(let i=0;i<n;i++) {
            let best=0;for(let o=1;o<owners.length;o++)if(scores[o][i]-bias[o]<scores[best][i]-bias[best])best=o;
            land[i].owner=owners[best];counts[best]++;
        }
        if(counts.every((c,i)=>Math.abs(c-target[owners[i]])<=1))break;
    }
    wodAssignAllWaterFromNearestLand();
}
function wodBuildLandBalanceTargets(ownerIds) {
    let sorted = [...ownerIds].sort((a, b) => a - b);
    let total = 0;
    for(let h of gameData.hexList) {
        if(wodHexCountsTowardLandPoliticsBalance(h)) total++;
    }
    let base = Math.floor(total / Math.max(1, sorted.length));
    let rem = total % Math.max(1, sorted.length);
    let target = {};
    for(let i = 0; i < sorted.length; i++) target[sorted[i]] = base + (i < rem ? 1 : 0);
    return target;
}
function wodCountBalancedLandByOwner(ownerIds) {
    let valid = new Set(ownerIds);
    let counts = {};
    for(let o of ownerIds) counts[o] = 0;
    for(let h of gameData.hexList) {
        if(!wodHexCountsTowardLandPoliticsBalance(h)) continue;
        if(valid.has(h.owner)) counts[h.owner]++;
    }
    return counts;
}
function wodProtectedLandBalanceKeys(protectedCities) {
    let keys = new Set();
    if(!protectedCities) return keys;
    for(let city of protectedCities) {
        if(!city) continue;
        keys.add(`${city.q},${city.r}`);
        for(let uh of getCityUrbanTerrainHexes(city)) keys.add(`${uh.q},${uh.r}`);
    }
    return keys;
}
// Starting supply uses real, cardinal, walkable land routes. Sea ownership and
// diagonal corners must never make an isolated island a valid army spawn.
// includeMountains is only for political continuity, never unit supply.
function wodStartingLandGraph(includeMountains=false) {
    const nodes = new Map(), roots = new Map(), inhabited = new Set();
    for(const hex of gameData.hexList) {
        if(!isWaterHex(hex) && (includeMountains||hex.type !== 'mountain'))
            nodes.set(getHexKey(hex), {hex, neighbors: []});
    }
    for(const node of nodes.values()) {
        for(const d of cardinalHexDirections) {
            const nb = nodes.get(`${node.hex.q+d.q},${node.hex.r+d.r}`);
            if(nb) node.neighbors.push(nb);
        }
    }
    for(const city of gameData.cities) {
        const node = nodes.get(`${city.q},${city.r}`);
        if(!node || node.hex.owner !== city.owner || city.owner <= 0) continue;
        if(!roots.has(city.owner)) roots.set(city.owner, []);
        roots.get(city.owner).push(node);
    }
    const townKeys = new Set(gameData.cities.filter(c=>c.owner>0).map(c=>`${c.q},${c.r}`));
    const seen = new Set();
    for(const node of nodes.values()) {
        if(seen.has(node)) continue;
        const component = [node]; seen.add(node);
        let hasTown = false;
        for(let i=0; i<component.length; i++) {
            const n = component[i];
            if(townKeys.has(getHexKey(n.hex))) hasTown = true;
            for(const nb of n.neighbors) if(!seen.has(nb)) { seen.add(nb); component.push(nb); }
        }
        if(hasTown) for(const n of component) inhabited.add(n);
    }
    return {nodes, roots, inhabited};
}
function wodStartingTownSupply(graph = wodStartingLandGraph()) {
    const supplied = new Map();
    for(const [owner, roots] of graph.roots) {
        const keys = new Set(), queue = roots.slice();
        for(const n of queue) keys.add(getHexKey(n.hex));
        for(let i=0; i<queue.length; i++) for(const nb of queue[i].neighbors) {
            const key = getHexKey(nb.hex);
            if(nb.hex.owner===owner && !keys.has(key)) { keys.add(key); queue.push(nb); }
        }
        supplied.set(owner, keys);
    }
    return supplied;
}
/** Open minimum-cost mountain passes inside an existing political region.
 * Supply repair should not redraw a compact border around every ridge. */
async function wodCarveStartingFactionPasses(ownerIds) {
    const graph=wodStartingLandGraph();let work=0,changed=false;
    for(const owner of ownerIds) {
        const roots=gameData.cities.filter(c=>c.owner===owner).map(c=>wodHexAt(c.q,c.r)).filter(h=>h&&h.owner===owner);
        const distance=new Map(),previous=new Map(),deque=new Map();let head=0,tail=0;
        for(const h of roots){const k=getHexKey(h);distance.set(k,0);deque.set(tail++,h);}
        while(head<tail) {
            const h=deque.get(head);deque.delete(head++);const hk=getHexKey(h),cost=distance.get(hk);
            for(const d of cardinalHexDirections) {
                const n=wodHexAt(h.q+d.q,h.r+d.r);
                if(!n||n.owner!==owner||isWaterHex(n))continue;
                const nk=getHexKey(n),step=n.type==='mountain'?1:0,next=cost+step;
                if(next>=(distance.get(nk)??Infinity))continue;
                distance.set(nk,next);previous.set(nk,hk);
                if(step)deque.set(tail++,n);else deque.set(--head,n);
            }
            if((++work&2047)===0)await wodMapGenYieldSlice();
        }
        const connected=new Set(roots.map(getHexKey));
        for(const node of graph.nodes.values()) {
            const h=node.hex,k=getHexKey(h);
            if(h.owner!==owner||!distance.has(k))continue;
            let cursor=k;
            while(cursor&&!connected.has(cursor)) {
                connected.add(cursor);const tile=gameData.hexes[cursor];
                if(tile.type==='mountain') {
                    tile.type='hill';tile.baseColor=getTerrainColor('hill');tile.renderColor=tile.baseColor;changed=true;
                }
                cursor=previous.get(cursor);
            }
        }
    }
    if(changed){gameData._wodPfVer=(gameData._wodPfVer||0)+1;wodMarkTerrainFullDirty();}
}
/** Repair artificial enclaves on inhabited islands after the LAST Voronoi pass.
 * Empty offshore holdings keep their area/ownership; deployment excludes them. */
function wodRepairStartingLandSupply(ownerIds,includeMountains=false) {
    const graph = wodStartingLandGraph(includeMountains), supplied = wodStartingTownSupply(graph);
    const valid = new Set(ownerIds), reached = new Set(), queue = [];
    for(const [owner, keys] of supplied) if(valid.has(owner)) for(const key of keys) {
        const n = graph.nodes.get(key); reached.add(n); queue.push(n);
    }
    for(let i=0; i<queue.length; i++) for(const nb of queue[i].neighbors) {
        if(reached.has(nb) || !graph.inhabited.has(nb)) continue;
        nb.hex.owner = queue[i].hex.owner;
        reached.add(nb); queue.push(nb);
    }
    wodMarkTerrainPoliticalDirty();
}
/** Keep townless offshore islands intact instead of using their coast cells
 * as loose change for mainland area quotas. The shared mainland absorbs
 * the exact balance; generation retries if that cannot be done cleanly. */
function wodConsolidateStartingOffshoreIslands(ownerIds) {
    const graph=wodStartingLandGraph(true),seen=new Set(),locked=new Set(),valid=new Set(ownerIds);
    for(const start of graph.nodes.values()) {
        if(seen.has(start))continue;
        const component=[start];seen.add(start);const votes=new Map();let inhabited=false;
        for(let i=0;i<component.length;i++) {
            const n=component[i];inhabited ||= graph.inhabited.has(n);
            if(valid.has(n.hex.owner))votes.set(n.hex.owner,(votes.get(n.hex.owner)||0)+1);
            for(const nb of n.neighbors)if(!seen.has(nb)){seen.add(nb);component.push(nb);}
        }
        if(inhabited)continue;
        const owner=[...votes].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0]?.[0];
        if(!owner)continue;
        for(const n of component){n.hex.owner=owner;if(component.length>1)locked.add(getHexKey(n.hex));}
    }
    return locked;
}
// Articulation points in the owned graph, joining town roots through a
// virtual root. Removing a non-town cell is safe exactly when its
// neighbors remain connected, or every separated side retains a town.
function wodStartingRemovalCuts(graph,owner) {
    const nodes=[...graph.nodes.values()].filter(n=>n.hex.owner===owner),roots=new Set((graph.roots.get(owner)||[]).filter(n=>n.hex.owner===owner));
    const root={},links=new Map(nodes.map(n=>[n,[...n.neighbors.filter(p=>p.hex.owner===owner),...(roots.has(n)?[root]:[])]]));links.set(root,[...roots]);
    const discovery=new Map(),low=new Map(),cuts=new Set();let serial=0;
    for(const start of [root,...nodes]){
        if(discovery.has(start))continue;
        discovery.set(start,++serial);low.set(start,serial);
        const stack=[{node:start,parent:null,index:0,children:0}];
        while(stack.length){
            const f=stack[stack.length-1],neighbors=links.get(f.node);
            if(f.index<neighbors.length){
                const n=neighbors[f.index++];if(n===f.parent)continue;
                if(discovery.has(n)){low.set(f.node,Math.min(low.get(f.node),discovery.get(n)));continue;}
                f.children++;discovery.set(n,++serial);low.set(n,serial);stack.push({node:n,parent:f.node,index:0,children:0});
            }else{
                stack.pop();const p=stack[stack.length-1];
                if(!p){if(f.children>1)cuts.add(f.node);continue;}
                low.set(p.node,Math.min(low.get(p.node),low.get(f.node)));
                if(p.parent!==null&&low.get(f.node)>=discovery.get(p.node))cuts.add(p.node);
            }
        }
    }
    return cuts;
}
/** Final area balancing may move a frontier, but cannot cut a land supply link. */
async function wodExactEqualizePoliticalLandCounts(ownerIds, protectedCities, maxMovesOpt) {
    if(!ownerIds || ownerIds.length < 2) return;
    // Clear unsupported political remnants, including isolated mountain cells,
    // before balancing. Empty physical islands retain their claims.
    wodRepairStartingLandSupply(ownerIds,true);
    const offshoreIslandKeys=wodConsolidateStartingOffshoreIslands(ownerIds);
    const sorted = [...ownerIds].sort((a,b)=>a-b), valid = new Set(sorted);
    const target = wodBuildLandBalanceTargets(sorted), counts = wodCountBalancedLandByOwner(sorted);
    const protectedKeys = wodProtectedLandBalanceKeys([...(protectedCities || []), ...gameData.cities]);
    for(const key of offshoreIslandKeys)protectedKeys.add(key);
    const graph = wodStartingLandGraph(),politicalGraph=wodStartingLandGraph(true);
    const removalCaches=new Map(),ownerVersions=new Map();
    function safeToRemove(hex) {
        for(const g of [politicalGraph,graph]){
            const node=g.nodes.get(getHexKey(hex));if(!node||!g.inhabited.has(node))continue;
            let byOwner=removalCaches.get(g);if(!byOwner){byOwner=new Map();removalCaches.set(g,byOwner);}
            let entry=byOwner.get(hex.owner);const version=ownerVersions.get(hex.owner)||0;
            if(!entry||entry.version!==version){entry={version,cuts:wodStartingRemovalCuts(g,hex.owner)};byOwner.set(hex.owner,entry);}
            if(entry.cuts.has(node))return false;
        }
        return true;
    }
    const neighborsFor = hex => {
        const node = graph.nodes.get(getHexKey(hex));
        return (node||politicalGraph.nodes.get(getHexKey(hex)))?.neighbors.map(n=>n.hex)||[];
    };
    const frontier = new Set();
    function refreshFrontier(hex) {
        if(!hex || !wodHexCountsTowardLandPoliticsBalance(hex) || !valid.has(hex.owner) || protectedKeys.has(getHexKey(hex))) return;
        if(neighborsFor(hex).some(nb=>valid.has(nb.owner) && nb.owner!==hex.owner)) frontier.add(hex);
        else frontier.delete(hex);
    }
    for(const hex of gameData.hexList) refreshFrontier(hex);
    const offshore = gameData.hexList.filter(hex=> {
        if(isWaterHex(hex) || !valid.has(hex.owner) || protectedKeys.has(getHexKey(hex))) return false;
        const node=politicalGraph.nodes.get(getHexKey(hex));
        // Peaks on inhabited continents are not offshore holdings. Only
        // actual townless shores may be reassigned without a land border.
        return node&&!politicalGraph.inhabited.has(node)&&cardinalHexDirections.some(d=>isWaterHex(wodHexAt(hex.q+d.q,hex.r+d.r)));
    });
    const excess = sorted.reduce((n,o)=>n+Math.max(0,counts[o]-target[o]),0);
    // Scan the frontier, not the full map, per move. Routing through several
    // factions may need more than one transfer for each excess tile.
    const moveCap = Math.min(Math.max(maxMovesOpt ?? 700, excess*(sorted.length-1)*2), gameData.hexList.length*2);
    gameData._startingLandBalance = {moves:0, counts, target, reason:'cap'};
    for(let move=0; move<moveCap; move++) {
        if(sorted.every(o=>counts[o]===target[o])) { gameData._startingLandBalance.reason='balanced'; break; }
        if((move & 15)===0) await wodMapGenYieldSlice();
        const borders = new Map(sorted.map(o=>[o,new Map()]));
        for(const hex of frontier) {
            const node = graph.nodes.get(getHexKey(hex));
            // A recipient must connect by dry, cardinal ground, never across sea.
            const neighbors = neighborsFor(hex);
            const votes = new Map();
            for(const nb of neighbors) if(valid.has(nb.owner)) votes.set(nb.owner,(votes.get(nb.owner)||0)+1);
            for(const [receiver,n] of votes) {
                if(receiver===hex.owner) continue;
                const score = n*120 - (votes.get(hex.owner)||0)*18 + (node ? 0 : 8);
                const edge = borders.get(hex.owner);
                if(!edge.has(receiver)) edge.set(receiver,[]);
                edge.get(receiver).push({hex,donor:hex.owner,receiver,score});
            }
        }
        // Offshore claims can connect the balancing route between otherwise
        // separate islands: A gives supplied frontier to B, B gives an empty
        // offshore holding to C. Never create a troop spawn on that holding.
        const offshoreEdges=new Map();
        for(const hex of offshore) for(const receiver of sorted) {
            if(receiver===hex.owner) continue;
            const roots=graph.roots.get(receiver)||[];
            const distance=Math.min(...roots.map(n=>(n.hex.x-hex.x)**2+(n.hex.y-hex.y)**2));
            const score=-10000000-distance;
            const key=`${hex.owner}:${receiver}`, old=offshoreEdges.get(key);
            if(!old || score>old.score) offshoreEdges.set(key,{hex,donor:hex.owner,receiver,score});
        }
        for(const candidate of offshoreEdges.values()) {
            const edge=borders.get(candidate.donor);
            if(!edge.has(candidate.receiver)) edge.set(candidate.receiver,[]);
            edge.get(candidate.receiver).push(candidate);
        }
        // Route excess through neighboring factions when an under-sized faction
        // has no direct border with the donor (important for 3+ player maps).
        const adjacency = new Map([...borders].map(([o,edges])=>[o,[...edges.keys()]]));
        let chosen = null;
        // If a route's frontier is entirely protected or is a narrow supply
        // corridor, try another route instead of abandoning the whole split.
        for(let attempt=0; attempt<sorted.length*sorted.length && !chosen; attempt++) {
            const routes = [];
            for(const donor of sorted) if(counts[donor]>target[donor]) {
                const queue = [{owner:donor,path:[]}], seen = new Set([donor]);
                for(let i=0; i<queue.length; i++) {
                    const item = queue[i];
                    if(counts[item.owner]<target[item.owner]) { routes.push(item.path); break; }
                    for(const receiver of borders.get(item.owner).keys()) if(!seen.has(receiver)) {
                        seen.add(receiver); queue.push({owner:receiver,path:[...item.path,[item.owner,receiver]]});
                    }
                }
            }
            routes.sort((a,b)=>a.length-b.length);
            if(!routes.length) break;
            for(const route of routes) {
                const [donor,receiver] = route[0];
                const candidates = borders.get(donor).get(receiver).sort((a,b)=>b.score-a.score);
                chosen = candidates.find(c=>safeToRemove(c.hex));
                if(chosen) break;
                borders.get(donor).delete(receiver);
            }
        }
        if(!chosen) {
            // A thin ring/peninsula may need its whole townless tip to move
            // together: transferring just its neck would strand the tip.
            for(const hex of frontier) {
                const donor=hex.owner, allowance=counts[donor]-target[donor];
                if(allowance<=0) continue;
                for(const receiver of new Set(neighborsFor(hex).map(h=>h.owner))) {
                    if(!valid.has(receiver) || receiver===donor || counts[receiver]>target[receiver]) continue;
                    const route=[receiver], visited=new Set([donor,receiver]);
                    let need=0;
                    for(let i=0; i<route.length && !need; i++) {
                        need=Math.max(0,target[route[i]]-counts[route[i]]);
                        for(const next of adjacency.get(route[i])) if(!visited.has(next)) { visited.add(next);route.push(next); }
                    }
                    if(!need) continue;
                    const node=graph.nodes.get(getHexKey(hex));
                    if(!node) continue;
                    const reached=new Set([node]), queue=(graph.roots.get(donor)||[]).slice();
                    for(const root of queue) reached.add(root);
                    for(let i=0; i<queue.length; i++) for(const nb of queue[i].neighbors)
                        if(nb.hex.owner===donor && !reached.has(nb)) { reached.add(nb);queue.push(nb); }
                    const parcel=[node], included=new Set(parcel);
                    for(let i=0; i<parcel.length; i++) for(const nb of parcel[i].neighbors)
                        if(nb.hex.owner===donor && !reached.has(nb) && !included.has(nb)) { included.add(nb);parcel.push(nb); }
                    if(parcel.length>Math.max(allowance,need)+8 || parcel.some(n=>protectedKeys.has(getHexKey(n.hex)))) continue;
                    if(!chosen || parcel.length<chosen.parcel.length)
                        chosen={hex,donor,receiver,parcel:parcel.map(n=>n.hex)};
                }
            }
        }
        if(!chosen) { gameData._startingLandBalance.reason='blocked'; break; }
        const parcel=chosen.parcel || [chosen.hex];
        for(const hex of parcel) hex.owner=chosen.receiver;
        counts[chosen.donor]-=parcel.length; counts[chosen.receiver]+=parcel.length;
        for(const owner of [chosen.donor,chosen.receiver])ownerVersions.set(owner,(ownerVersions.get(owner)||0)+1);
        gameData._startingLandBalance.moves+=parcel.length;
        for(const hex of parcel) {
            refreshFrontier(hex);
            for(const nb of getNeighborHexes(hex)) refreshFrontier(nb);
        }
    }
    wodMarkTerrainPoliticalDirty();
}
async function wodBalanceStartingIslandTowns(ownerIds) {
    const target=wodBuildLandBalanceTargets(ownerIds), counts=wodCountBalancedLandByOwner(ownerIds);
    if(ownerIds.every(o=>counts[o]===target[o])) return;
    // A faction confined to a small island cannot receive supplied territory
    // from a larger one. Give every faction a town on the main walkable island
    // before trying the split again; keep the existing equal town counts.
    const graph=wodStartingLandGraph(), seen=new Set();let largest=[];
    for(const node of graph.nodes.values()) {
        if(seen.has(node)) continue;
        const component=[node];seen.add(node);
        for(let i=0;i<component.length;i++) for(const nb of component[i].neighbors)
            if(!seen.has(nb)){seen.add(nb);component.push(nb);}
        if(component.length>largest.length)largest=component;
    }
    const towns=ownerIds.map(o=>gameData.cities.find(c=>c.owner===o));
    if(towns.some(c=>!c) || largest.length<towns.length*9) return;
    const moving=new Set(towns), sites=[];
    for(const town of towns) {
        let best=null,score=-Infinity;
        for(const node of largest) {
            const h=node.hex;
            if(sites.some(p=>(p.q-h.q)**2+(p.r-h.r)**2<25)) continue;
            if(gameData.cities.some(c=>!moving.has(c)&&(c.q-h.q)**2+(c.r-h.r)**2<25)) continue;
            let room=0;
            for(let dq=-1;dq<=1;dq++)for(let dr=-1;dr<=1;dr++) if(graph.nodes.has(`${h.q+dq},${h.r+dr}`))room++;
            const spread=sites.length?Math.min(...sites.map(p=>(p.q-h.q)**2+(p.r-h.r)**2)):-((town.q-h.q)**2+(town.r-h.r)**2);
            const value=room*100000+spread;
            if(value>score){score=value;best=h;}
        }
        if(!best)return;
        sites.push(best);
    }
    const ids=new Set(towns.map(c=>c.id));
    for(const h of gameData.hexList) if(ids.has(h.cityId)) {
        h.type='grass';delete h.cityId;
        h.baseColor=getTerrainColor(h.type);h.renderColor=h.baseColor;
    }
    towns.forEach((town,i)=>{
        Object.assign(town,{q:sites[i].q,r:sites[i].r,x:sites[i].x,y:sites[i].y});
        delete town._urbanHexCache;
    });
    await wodAssignPoliticalVoronoiFromCities(ownerIds);
    for(let i=0;i<towns.length;i++) {
        const town=towns[i];
        // A compact protected town footprint guarantees a safe rear spawn.
        for(let dq=-1;dq<=1;dq++)for(let dr=-1;dr<=1;dr++) {
            const h=wodHexAt(town.q+dq,town.r+dr);
            if(!h || isWaterHex(h) || h.type==='mountain')continue;
            h.type='urban';h.cityId=town.id;h.owner=town.owner;
            h.baseColor=getUrbanTerrainColor(wodGetGamePeriod());h.renderColor=h.baseColor;
        }
    }
    for(const city of gameData.cities)delete city._urbanHexCache;
    wodSyncUrbanFootprintOwners();
    wodRepairStartingLandSupply(ownerIds);
    await wodExactEqualizePoliticalLandCounts(ownerIds,gameData.cities);
}
function wodDeterministicCitySplitPhase01(seedMixed) {
    let s = seedMixed >>> 0;
    s = Math.imul(s ^ (s >>> 17), 0xed558ccd);
    return (s >>> 0) / 4294967296;
}
function wodSyncUrbanFootprintOwners() {
    for(let city of gameData.cities) {
        if(!city || city.owner <= 0) continue;
        let urbanList = getCityUrbanTerrainHexes(city);
        for(let uh of urbanList) {
            let hx = wodHexAt(uh.q,uh.r);
            if(hx && !isWaterHex(hx)) setHexOwner(hx, city.owner);
        }
        let ctr = wodHexAt(city.q,city.r);
        if(ctr && !isWaterHex(ctr)) setHexOwner(ctr, city.owner);
    }
}
/** Match each town's political owner to the faction that owns its center land (Voronoi / territory). */
function wodSyncCityOwnersFromCenterHex() {
    for(let city of gameData.cities) {
        if(!city) continue;
        let ch0 = wodHexAt(city.q,city.r);
        if(ch0 && isClaimableLand(ch0) && ch0.owner > 0) city.owner = ch0.owner;
    }
}
/** Reclaim capital urban tiles for each slot's declared owner (after border smoothing). */
function wodPaintCapitalUrbanToDeclaredOwner(startCities) {
    if(!startCities) return;
    for(let cap of startCities) {
        if(!cap || cap.owner <= 0) continue;
        let o = cap.owner;
        let urbanList = getCityUrbanTerrainHexes(cap);
        for(let uh of urbanList) {
            let hx = wodHexAt(uh.q,uh.r);
            if(hx && !isWaterHex(hx)) setHexOwner(hx, o);
        }
        let ctr = wodHexAt(cap.q,cap.r);
        if(ctr && !isWaterHex(ctr)) setHexOwner(ctr, o);
    }
}
/** Capitals stay on their owners; other towns follow map ownership so no settlement sits in a foreign polity. */
function wodFinalizeStartingCitiesVsTerritory(startCities) {
    wodPaintCapitalUrbanToDeclaredOwner(startCities);
    let capSet = new Set(startCities);
    for(let city of gameData.cities) {
        if(!city || capSet.has(city)) continue;
        let ch0 = wodHexAt(city.q,city.r);
        if(ch0 && isClaimableLand(ch0) && ch0.owner > 0) city.owner = ch0.owner;
    }
    wodSyncUrbanFootprintOwners();
}
function wodPreliminaryCityOwnersFromAngleSplit(ownersList, landHexes) {
    if(!ownersList || ownersList.length === 0 || !gameData.cities || gameData.cities.length === 0) return;
    let cx = 0, cy = 0;
    for(let h of landHexes) {
        cx += h.x;
        cy += h.y;
    }
    cx /= landHexes.length;
    cy /= landHexes.length;
    let angleOffset = (gameData._wodCitySplitAnglePhase != null && typeof gameData._wodCitySplitAnglePhase === 'number' && !Number.isNaN(gameData._wodCitySplitAnglePhase))
        ? gameData._wodCitySplitAnglePhase
        : Math.random() * Math.PI * 2;
    function splitScore(pt) {
        let twoPi = Math.PI * 2;
        let v = Math.atan2(pt.y - cy, pt.x - cx) - angleOffset + twoPi * 4;
        v = ((v % twoPi) + twoPi) % twoPi;
        return v;
    }
    let sorted = [...gameData.cities].sort((a, b) => splitScore(a) - splitScore(b));
    if(sorted.length === 0) return;
    let splitThresholds = [];
    let po = ownersList.length;
    for(let oi = 1; oi < po; oi++) {
        let idx = Math.min(sorted.length - 1, Math.floor((oi / po) * sorted.length));
        splitThresholds.push(splitScore(sorted[idx]));
    }
    function ownerForCity(c) {
        let sc = splitScore(c);
        for(let i = 0; i < splitThresholds.length; i++) {
            if(sc <= splitThresholds[i]) return ownersList[i];
        }
        return ownersList[po - 1];
    }
    for(let c of gameData.cities) c.owner = ownerForCity(c);
}
/** Every active faction ends with the same city count (±1 when totals do not divide evenly). */
function wodBalanceCityCountsAmongOwners(ownerIds, fixedCapitalCities) {
    if(!ownerIds || ownerIds.length < 2 || !gameData.cities || !gameData.cities.length) return;
    let fixedCap = fixedCapitalCities || null;
    function isFixed(c) {
        return fixedCap && fixedCap.has(c);
    }
    let n = gameData.cities.length;
    let f = ownerIds.length;
    let base = Math.floor(n / f);
    let rem = n % f;
    let sortedSlots = [...ownerIds].sort((a, b) => a - b);
    let target = {};
    for(let i = 0; i < f; i++) target[sortedSlots[i]] = base + (i < rem ? 1 : 0);

    function countFor(o) {
        let c = 0;
        for(let city of gameData.cities) if(city.owner === o) c++;
        return c;
    }
    function allMatch() {
        for(let o of ownerIds) {
            if(countFor(o) !== target[o]) return false;
        }
        return true;
    }
    if(allMatch()) return;

    function findBorderDonor(rich, poor) {
        for(let c of gameData.cities) {
            if(c.owner !== rich || isFixed(c)) continue;
            let ch = wodHexAt(c.q,c.r);
            if(!ch) continue;
            for(let nh of getNeighborHexes(ch)) {
                if(nh && nh.owner === poor) return c;
            }
        }
        return null;
    }

    function pickRandomDonor(rich) {
        let flex = [];
        for(let c of gameData.cities) {
            if(c.owner !== rich || isFixed(c)) continue;
            flex.push(c);
        }
        if(flex.length === 0) return null;
        flex.sort(() => Math.random() - 0.5);
        return flex[0];
    }

    function firstDonorSkippingFixed(rich) {
        for(let c of gameData.cities) {
            if(c.owner !== rich || isFixed(c)) continue;
            return c;
        }
        return null;
    }

    for(let pass = 0; pass < 780; pass++) {
        if(allMatch()) return;
        let rich = null,
            poor = null;
        let bestOver = -1,
            bestUnder = Infinity;
        for(let o of ownerIds) {
            let c = countFor(o);
            let t = target[o];
            if(c > t && c - t > bestOver) {
                bestOver = c - t;
                rich = o;
            }
            if(c < t && t - c < bestUnder) {
                bestUnder = t - c;
                poor = o;
            }
        }
        if(rich == null || poor == null || rich === poor) return;

        let donor = findBorderDonor(rich, poor);
        if(!donor) donor = pickRandomDonor(rich);
        /* Last resort — avoid freezing imbalanced counts when geography blocks border swaps */
        if(!donor) donor = firstDonorSkippingFixed(rich);
        if(!donor) {
            if(pass > 620) return;
            continue;
        }
        donor.owner = poor;
    }
}
function wodVerifyCityPlacementSymmetry(ownerIds) {
    let sorted = [...ownerIds].sort((a, b) => a - b);
    let land = gameData.hexList.filter(h => !isWaterHex(h) && h.type !== 'mountain');
    let lcm = wodLandCentroidMaxRadius(land);
    let radii = [];
    for(let o of sorted) {
        let sx = 0, sy = 0, n = 0;
        for(let c of gameData.cities) {
            if(!c || c.owner !== o) continue;
            sx += c.x;
            sy += c.y;
            n++;
        }
        if(n === 0) return false;
        let dx = sx / n - lcm.cx, dy = sy / n - lcm.cy;
        radii.push(Math.sqrt(dx * dx + dy * dy));
    }
    if(radii.length < 2) return true;
    let spread = Math.max(...radii) - Math.min(...radii);
    let tolFrac = sorted.length >= 3 ? 0.22 : 0.14;
    return spread <= Math.max(lcm.maxR * tolFrac, (gameData.hexRadius || 20) * (sorted.length >= 3 ? 11 : 8));
}
/** Reject procgen layouts where land or city totals are not within ±1 of perfect split. */
/** Archipelago starts are fair island by island: on an island that holds towns of more than one player every one of them
 *  has as many towns there as the others, and every player has the same number of towns on islands shared with an enemy.
 *  (Splitting the map by straight lines across the sea gave half of all archipelago maps a lone town on an island beside
 *  two of an enemy's, or one player a quiet islet while another had none.) */
// A river along the border between some players and not others is unfair: those two each have a moat on one side, the
// rest meet their neighbours over open ground. Each river cell (marked _river when carved) with land of two or more
// players within two cells is a border river cell; the pairs of players who are neighbours (by land or across a river)
// are found, and unless every such pair meets across a river, the border river cells are filled with grass and given
// to the nearest player. Rivers inside one player's land stay. Land counts are evened out again afterwards.
// Returns the number of cells filled.
function wodBalanceStartingRivers(owners) {
    if(!owners || owners.length < 2) return 0;
    const set = new Set(owners), land = h => h && !isWaterHex(h) && set.has(h.owner);
    const key = (a, b) => a < b ? a + '-' + b : b + '-' + a;
    const neighbours = new Set(), riverPairs = new Set(), border = [];
    for(const h of gameData.hexList) {
        if(land(h)) { for(const n of getNeighborHexes(h)) if(land(n) && n.owner !== h.owner) neighbours.add(key(h.owner, n.owner)); continue; }
        if(!h || !h._river || !isWaterHex(h) || isBridgeHex(h)) continue;
        const near = new Set();
        for(const p of getHexesInRadius(h.q, h.r, 2)) { const n = wodHexAt(p.q, p.r); if(land(n)) near.add(n.owner); }
        if(near.size < 2) continue;
        const list = [...near];
        for(let i = 0; i < list.length; i++) for(let j = i + 1; j < list.length; j++) { riverPairs.add(key(list[i], list[j])); neighbours.add(key(list[i], list[j])); }
        border.push(h);
    }
    if(!border.length || [...neighbours].every(k => riverPairs.has(k))) return 0;
    for(const h of border) {
        let best = null, bd = Infinity;
        for(const p of getHexesInRadius(h.q, h.r, 3)) { const n = wodHexAt(p.q, p.r); if(!land(n)) continue; const d = Math.hypot(n.x - h.x, n.y - h.y); if(d < bd) { bd = d; best = n; } }
        wodSetGeneratedTerrainType(h, 'grass');
        delete h._river;
        if(best) setHexOwner(h, best.owner);
    }
    gameData._wodPfVer = (gameData._wodPfVer || 0) + 1;
    gameData.landGeometryRevision = (gameData.landGeometryRevision || 0) + 1;
    return border.length;
}
// Every player gets the same ground: for forest, hills, swamp and sand in turn, a player with more cells of it than the
// average share turns the ones at the edge of its patches into grass, and a player with fewer turns grass beside its patches
// (or anywhere, with none) into it, until each is within two cells of the average. Towns, mountains, water and bridges
// are left alone; mountains are evened out too (see below), only where no way between two cells is shut, so supply,
// routes and land counts stay as they are. Returns the number of cells changed.
function wodBalanceStartingTerrain(owners) {
    if(!owners || owners.length < 2) return 0;
    const set = new Set(owners);
    const open = h => h && !isWaterHex(h) && !isBridgeHex(h) && h.type !== 'mountain' && h.type !== 'urban' && !h.cityId && set.has(h.owner);
    const cellsOf = {};
    for(const o of owners) cellsOf[o] = [];
    for(const h of gameData.hexList) if(open(h)) cellsOf[h.owner].push(h);
    let changed = 0;
    const like = (h, type) => getNeighborHexes(h).filter(n => n && n.type === type).length;
    // Mountains first: they count as land but cannot be used, so a player with more of them has less ground to move and
    // fight on. One above the average share turns the mountain cells at the edge of its ranges into hills; one below grows
    // its ranges at their edges, only where no way is shut (blockable). The hills join its open ground below.
    {
        const dry = o => gameData.hexList.filter(h => h && !isWaterHex(h) && !isBridgeHex(h) && h.type !== 'urban' && !h.cityId && h.owner === o);
        const lists = {}; for(const o of owners) lists[o] = dry(o);
        const mShare = owners.reduce((s, o) => s + lists[o].filter(h => h.type === 'mountain').length, 0) / Math.max(1, owners.reduce((s, o) => s + lists[o].length, 0));
        // A cell can become a mountain without shutting any way only when the ground round it that can be walked is one
        // unbroken arc of its eight neighbours (or all of them): then those neighbours still reach each other round it.
        const RING = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
        const walk = h => !!h && !isWaterHex(h) && h.type !== 'mountain';
        const blockable = h => {
            const r = RING.map(([dq, dr]) => walk(wodHexAt(h.q + dq, h.r + dr)));
            let flips = 0; for(let i = 0; i < 8; i++) if(r[i] !== r[(i + 1) % 8]) flips++;
            return flips <= 2 && r.some(Boolean);
        };
        const nearTown = h => gameData.cities.some(c => Math.max(Math.abs(c.q - h.q), Math.abs(c.r - h.r)) <= 2);
        for(const o of owners) {
            const peaks = lists[o].filter(h => h.type === 'mountain'), target = Math.round(mShare * lists[o].length);
            let n = peaks.length;
            if(n > target + 2) {
                peaks.sort((a, b) => like(a, 'mountain') - like(b, 'mountain') || a.q - b.q || a.r - b.r);
                for(const h of peaks) { if(n <= target) break; wodSetGeneratedTerrainType(h, 'hill'); cellsOf[o].push(h); n--; changed++; }
            } else if(n < target - 2) {
                // below the average: ranges grow at their edges (cells beside a mountain first), never across a way
                const pool = cellsOf[o].filter(h => (h.type === 'hill' || h.type === 'grass' || h.type === 'forest') && !nearTown(h))
                    .sort((a, b) => like(b, 'mountain') - like(a, 'mountain') || a.q - b.q || a.r - b.r);
                for(const h of pool) {
                    if(n >= target) break;
                    if(!blockable(h)) continue;
                    wodSetGeneratedTerrainType(h, 'mountain');
                    cellsOf[o].splice(cellsOf[o].indexOf(h), 1);
                    n++; changed++;
                }
            }
        }
    }
    // (shares of each player's own ground, not counts: land is evened out only afterwards)
    const total = owners.reduce((s, o) => s + cellsOf[o].length, 0);
    // (up to three passes: a player short of forest may have no grass to turn until its surplus swamp or sand has been
    // turned into grass later in the same pass)
    for(let pass = 0, before = -1; pass < 3 && changed !== before; pass++) { before = changed;
    for(const type of ['forest', 'hill', 'swamp', 'sand']) {
        const count = o => cellsOf[o].filter(h => h.type === type).length;
        const share = owners.reduce((s, o) => s + count(o), 0) / Math.max(1, total);
        for(const o of owners) {
            const target = Math.round(share * cellsOf[o].length);
            let n = count(o);
            if(n > target + 2) {
                // patch edges first (fewest neighbours of the same ground), in a fixed order
                const pool = cellsOf[o].filter(h => h.type === type).sort((a, b) => like(a, type) - like(b, type) || a.q - b.q || a.r - b.r);
                for(const h of pool) { if(n <= target) break; wodSetGeneratedTerrainType(h, 'grass'); n--; changed++; }
            } else if(n < target - 2) {
                const pool = cellsOf[o].filter(h => h.type === 'grass').sort((a, b) => like(b, type) - like(a, type) || a.q - b.q || a.r - b.r);
                for(const h of pool) { if(n >= target) break; wodSetGeneratedTerrainType(h, type); n++; changed++; }
            }
        }
    }
    }
    return changed;
}
// No river between some players only (what wodBalanceStartingRivers leaves): either no river cell has two players' land
// within two cells, or every pair of neighbouring players meets across one.
function wodStartingRiversFair(owners) {
    const set = new Set(owners), land = h => h && !isWaterHex(h) && set.has(h.owner), key = (a, b) => a < b ? a + '-' + b : b + '-' + a;
    const neighbours = new Set(), riverPairs = new Set();
    let border = 0;
    for(const h of gameData.hexList) {
        if(land(h)) { for(const n of getNeighborHexes(h)) if(land(n) && n.owner !== h.owner) neighbours.add(key(h.owner, n.owner)); continue; }
        if(!h || !h._river || !isWaterHex(h) || isBridgeHex(h)) continue;
        const near = new Set();
        for(const p of getHexesInRadius(h.q, h.r, 2)) { const n = wodHexAt(p.q, p.r); if(land(n)) near.add(n.owner); }
        if(near.size < 2) continue;
        border++;
        const l = [...near];
        for(let i = 0; i < l.length; i++) for(let j = i + 1; j < l.length; j++) { riverPairs.add(key(l[i], l[j])); neighbours.add(key(l[i], l[j])); }
    }
    return !border || [...neighbours].every(k => riverPairs.has(k));
}
// The nearest enemy town is about as far for every player: no more than a third further for one than for another.
function wodStartingTownDistancesFair(owners) {
    if(!owners || owners.length < 2) return true;
    const near = owners.map(o => {
        let best = Infinity;
        for(const c of gameData.cities) if(c.owner === o) for(const e of gameData.cities) if(e.owner > 0 && e.owner !== o) best = Math.min(best, Math.hypot(c.x - e.x, c.y - e.y));
        return best;
    });
    if(near.some(d => !Number.isFinite(d) || d <= 0)) return true;
    return Math.max(...near) <= Math.min(...near) * 1.35;
}
function wodArchipelagoIslandsFair(owners) {
    // islands as infantry sees them, searched afresh (terrain is still changing while a map is made)
    const islandOf = new Map(), walk = h => !!h && (isBridgeHex(h) || !isWaterHex(h) && h.type !== 'mountain');
    let next = 0;
    const label = start => {
        if(islandOf.has(start)) return islandOf.get(start);
        const id = ++next, queue = [start]; islandOf.set(start, id);
        for(let i = 0; i < queue.length; i++) for(const nb of getNeighborHexes(queue[i])) if(walk(nb) && !islandOf.has(nb)) { islandOf.set(nb, id); queue.push(nb); }
        return id;
    };
    const islands = new Map();
    for(const c of gameData.cities) {
        if(!c || !owners.includes(c.owner)) continue;
        const h = wodHexAt(c.q, c.r) || getNearestHexToPoint(c.x, c.y);
        const key = h ? label(h) : ('city:' + c.id);
        if(!islands.has(key)) islands.set(key, {});
        const row = islands.get(key); row[c.owner] = (row[c.owner] || 0) + 1;
    }
    const exposure = {};for(const o of owners) exposure[o] = 0;
    for(const row of islands.values()) {
        const present = Object.keys(row);
        if(present.length < 2) continue;
        const n = Object.values(row);
        if(Math.max(...n) !== Math.min(...n)) return false;
        for(const o of present) exposure[o] += row[o];
    }
    const e = owners.map(o => exposure[o]);
    return Math.max(...e) === Math.min(...e);
}
function wodVerifyFairFactionStart(ownerIds) {
    if(!ownerIds || ownerIds.length < 2) return true;
    let sorted = [...ownerIds].sort((a, b) => a - b);
    let n = gameData.cities.length;
    let f = sorted.length;
    // One town each is a legal start now (cities per player can be set to 1).
    if(n < f) return false;
    let base = Math.floor(n / f);
    let rem = n % f;
    let cityTgt = {};
    for(let i = 0; i < f; i++) cityTgt[sorted[i]] = base + (i < rem ? 1 : 0);
    let cityCounts = {};
    for(let o of sorted) cityCounts[o] = 0;
    for(let c of gameData.cities) {
        if(c && cityCounts[c.owner] !== undefined) cityCounts[c.owner]++;
    }
    for(let o of sorted) {
        if(cityCounts[o] !== cityTgt[o]) return false;
    }
    // Reject constrained splits that cannot balance without severing supply.
    // The frontier-only balancer keeps retries on the same terrain inexpensive.
    let target = wodBuildLandBalanceTargets(sorted);
    let counts = wodCountBalancedLandByOwner(sorted);
    for(let o of sorted) {
        if((counts[o] || 0) !== target[o]) return false;
    }
    if(sorted.length === 2 && !wodVerifyCityPlacementSymmetry(sorted)) return false;
    if(gameData.mapShape === 'archipelago' && !wodArchipelagoIslandsFair(sorted)) { gameData._wodIslandsUnfair = true; return false; }
    if(!wodStartingTownDistancesFair(sorted)) { gameData._wodTownsFarApart = true; return false; }
    if(!wodStartingRiversFair(sorted)) return false;
    const supplied=wodStartingTownSupply();
    for(const owner of sorted) {
        const pool=gameData.hexList.filter(h=>h.owner===owner&&supplied.get(owner)?.has(getHexKey(h)));
        if(pool.length<12||!pool.some(h=>!isFrontlineHex(h,owner)))return false;
    }
    return true;
}
/** Count only shared dry-land edges: coast complexity is not political complexity. */
function wodStartingFrontierLength() {
    let edges=0;
    for(const h of gameData.hexList) {
        if(isWaterHex(h))continue;
        for(const [dq,dr] of [[1,0],[0,1]]) {
            const nb=wodHexAt(h.q+dq,h.r+dr);
            if(nb&&!isWaterHex(nb)&&nb.owner!==h.owner)edges++;
        }
    }
    return edges;
}
/** Acceptance gate, not a repair pass. Never publish a badly distorted split.
 * Real offshore islands are independent; mountains count as political land. */
function wodValidateStartingBorders(ownerIds, referenceFrontier=null) {
    const towns=gameData.cities||[];
    for(let i=0;i<towns.length;i++)for(let j=i+1;j<towns.length;j++)
        if(Math.max(Math.abs(towns[i].q-towns[j].q),Math.abs(towns[i].r-towns[j].r))<8)
            return {ok:false,reason:'town-spacing'};
    const urbanTown=new Map();
    for(const town of towns)for(const h of getCityUrbanTerrainHexes(town)) {
        const key=getHexKey(h);
        if(urbanTown.has(key)&&urbanTown.get(key)!==town)return {ok:false,reason:'town-spacing'};
        urbanTown.set(key,town);
    }
    for(const [key,town] of urbanTown) {
        const h=gameData.hexes[key];
        for(const d of hexDirections) {
            const other=urbanTown.get(`${h.q+d.q},${h.r+d.r}`);
            if(other&&other!==town)return {ok:false,reason:'town-spacing'};
        }
    }
    const graph=wodStartingLandGraph(true), seen=new Set(), valid=new Set(ownerIds);
    const report={ok:true,reason:'clean',frontier:wodStartingFrontierLength(),referenceFrontier,
        land:graph.nodes.size,largestThinRun:0};
    const reject=reason=>({...report,ok:false,reason});
    for(const start of graph.nodes.values()) {
        if(seen.has(start))continue;
        const component=[start];seen.add(start);
        for(let i=0;i<component.length;i++)for(const nb of component[i].neighbors)
            if(!seen.has(nb)){seen.add(nb);component.push(nb);}
        const regions=new Set(),visited=new Set();
        for(const node of component) {
            if(!valid.has(node.hex.owner))return reject('unclaimed-land');
            if(visited.has(node))continue;
            const owner=node.hex.owner;
            if(regions.has(owner))return reject('disconnected-claim');
            regions.add(owner);
            const region=[node];visited.add(node);let shore=false;
            for(let i=0;i<region.length;i++) {
                const n=region[i];shore ||= n.neighbors.length<4;
                for(const nb of n.neighbors)if(nb.hex.owner===owner&&!visited.has(nb)) {
                    visited.add(nb);region.push(nb);
                }
            }
            if(!shore&&region.length<component.length)return reject('enclosed-claim');
            if(region.length<component.length) {
                if(component.length<96)return reject('split-small-island');
                if(region.length<Math.max(16,component.length*.08))return reject('coastal-sliver');
            }
        }
    }
    // A one-cell-wide political thread between hostile banks is not a
    // mountain pass or coastline. Reject sustained threads and their tips.
    const thin=new Set();
    for(const node of graph.nodes.values()) {
        if(node.neighbors.length!==4)continue;
        const same=node.neighbors.filter(n=>n.hex.owner===node.hex.owner);
        if(same.length<=1 || same.length===2&&
            same[0].hex.q+same[1].hex.q===node.hex.q*2&&
            same[0].hex.r+same[1].hex.r===node.hex.r*2)thin.add(node);
    }
    const thinSeen=new Set();
    for(const node of thin) {
        if(thinSeen.has(node))continue;
        const run=[node];thinSeen.add(node);
        for(let i=0;i<run.length;i++)for(const nb of run[i].neighbors)
            if(nb.hex.owner===node.hex.owner&&thin.has(nb)&&!thinSeen.has(nb)) {
                thinSeen.add(nb);run.push(nb);
            }
        report.largestThinRun=Math.max(report.largestThinRun,run.length);
    }
    if(report.largestThinRun>=4)return reject('border-tendril');
    // Audit the actual visible graph, including inland water. Dry-land
    // connectivity alone misses coastal hooks, loops and lake pockets.
    const spacing=gameData.hexRadius*1.35;
    const chains=wodCollectDiplomacyBorderChains(gameData.hexList,gameData.hexes,0,0,spacing);
    report.maxBorderDetour=1;report.closedBorders=0;
    for(const chain of chains) {
        if(chain.closed){report.closedBorders++;return reject('closed-frontier');}
        let length=0;const points=chain.pts;
        for(let i=1;i<points.length;i++)length+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
        const first=points[0],last=points[points.length-1];
        const chord=Math.hypot(last.x-first.x,last.y-first.y);
        const detour=length/Math.max(spacing,chord);
        report.maxBorderDetour=Math.max(report.maxBorderDetour,detour);
        if(length>=spacing*8&&detour>1.8)return reject('folded-frontier');
        // A long internal hook can hide in an otherwise straight chain.
        // Every local span must also make useful progress across the map.
        for(let start=0;start+8<points.length;start+=2)for(const span of [8,16,32]) {
            const end=start+span;if(end>=points.length)continue;
            const direct=Math.hypot(points[end].x-points[start].x,points[end].y-points[start].y);
            if(direct<spacing*span*.48)return reject('frontier-hairpin');
        }
    }
    if(referenceFrontier!==null&&report.frontier>referenceFrontier*1.35+8)
        return reject('distorted-frontier');
    if(report.frontier>Math.sqrt(report.land*ownerIds.length)*2.25+8)
        return reject('winding-frontier');
    const walkGraph=wodStartingLandGraph(),supplied=wodStartingTownSupply(walkGraph);
    for(const node of walkGraph.inhabited)
        if(!supplied.get(node.hex.owner)?.has(getHexKey(node.hex)))return reject('unsupplied-land');
    return report;
}
/** New-match rule for every town, including neutral and authored-map towns. */
function wodNormalizeStartingCityEconomy() {
    for(const city of gameData.cities || []) {
        if(!city)continue;
        city.hasFactory = false;
        city.hasHarbor = false;
        city.hasFarm = false;
        city.incomeBonus = 0;
        city.manpowerBonus = 0;
    }
    gameData._landIncomeCacheDirty = true;
}
function wodReconcileCityTerrainToSettlementOwners(ownerIds) {
    if(!ownerIds || !ownerIds.length || !gameData.cities || !gameData.cities.length) return;
    let valid = new Set(ownerIds);
    for(let city of gameData.cities) {
        if(!city || city.owner <= 0 || !valid.has(city.owner)) continue;
        let ch = wodHexAt(city.q,city.r);
        if(ch && isClaimableLand(ch)) setHexOwner(ch, city.owner);
    }
    wodSyncUrbanFootprintOwners();
}
/** Remove faction land that cannot reach any of that faction's cities using only that faction's own tiles (prevents weird encircled enclaves). */
async function wodRemoveUnconnectedFactionHexPockets(ownerIds) {
    if(!ownerIds || ownerIds.length === 0) return;
    let walkTick = 0;
    for(let owner of ownerIds) {
        let seeds = [];
        for(let city of gameData.cities) {
            if(city.owner !== owner) continue;
            let urbanList = getCityUrbanTerrainHexes(city);
            for(let uh of urbanList) {
                let hx = wodHexAt(uh.q,uh.r);
                if(hx && !isWaterHex(hx) && hx.type !== 'mountain' && hx.owner === owner) seeds.push(hx);
            }
            let ctr = wodHexAt(city.q,city.r);
            if(ctr && !isWaterHex(ctr) && ctr.type !== 'mountain' && ctr.owner === owner) seeds.push(ctr);
        }
        if(seeds.length === 0) continue;
        let seen = new Set();
        let q = [];
        let qi = 0;
        for(let h of seeds) {
            let k = `${h.q},${h.r}`;
            if(seen.has(k)) continue;
            seen.add(k);
            q.push(h);
        }
        while(qi < q.length) {
            let cur = q[qi++];
            for(let nb of getNeighborHexes(cur)) {
                if(!nb || isWaterHex(nb) || nb.type === 'mountain') continue;
                if(nb.owner !== owner) continue;
                let k = `${nb.q},${nb.r}`;
                if(seen.has(k)) continue;
                seen.add(k);
                q.push(nb);
            }
            if((++walkTick & wodMapGenLoopYieldMask(8191)) === 0) await wodMapGenYieldSlice();
        }
        let hi = 0;
        for(let hex of gameData.hexList) {
            if(hex.owner !== owner || isWaterHex(hex) || hex.type === 'mountain') continue;
            let k = `${hex.q},${hex.r}`;
            if(seen.has(k)) continue;
            let votes = {};
            for(let nb of getNeighborHexes(hex)) {
                if(!nb || nb.owner <= 0 || nb.owner === owner) continue;
                votes[nb.owner] = (votes[nb.owner] || 0) + 1;
            }
            let bo = 0, bv = -1;
            for(let ok in votes) {
                if(votes[ok] > bv) { bv = votes[ok]; bo = parseInt(ok, 10); }
            }
            if(bo > 0) setHexOwner(hex, bo);
            else setHexOwner(hex, 0);
            if((++hi & wodMapGenLoopYieldMask(255)) === 0) await wodMapGenYieldSlice();
        }
    }
}
function wodHudMoney() {
    let o = wodLocalPlayerOwner();
    if(!gameData.mp || !gameData.mp.enabled) return gameData.money || 0;
    if(o === 1) return gameData.money || 0;
    return (gameData.aiMoneyByOwner && gameData.aiMoneyByOwner[o]) || 0;
}
/** Bounding-radius^2 of owned claimable tiles from their centroid (rectangle city interior filter). */
function wodFactionTerritoryCentroidMaxSq(owner) {
    let sx = 0,
        sy = 0,
        n = 0;
    let tiles = [];
    for(let h of gameData.hexList) {
        if(!isClaimableLand(h) || isWaterHex(h) || h.type === 'mountain') continue;
        if(h.owner !== owner) continue;
        tiles.push(h);
        sx += h.x;
        sy += h.y;
        n++;
    }
    if(!n) return null;
    let cx = sx / n,
        cy = sy / n,
        maxSq = 0;
    for(let h of tiles) {
        let dx = h.x - cx,
            dy = h.y - cy;
        maxSq = Math.max(maxSq, dx * dx + dy * dy);
    }
    return { cx, cy, maxSq, n };
}
/** Target ring for Voronoi seed hex picking (terrain only). */
function wodTerrainSeedsForVoronoiOwners(ownersList, landCandidates, lcm, phase, mapShape) {
    let sorted = [...ownersList].sort((a, b) => a - b);
    let seeds = {};
    let taken = new Set();
    let f = sorted.length;
    let frac = lcm.maxR * (wodMapShapeIsRadialForTownPolicy(mapShape) ? 0.38 : 0.42);
    let twoPi = Math.PI * 2;
    for(let i = 0; i < f; i++) {
        let ow = sorted[i];
        let ang = phase + ((i + 0.5) / f) * twoPi;
        let tx = lcm.cx + Math.cos(ang) * frac;
        let ty = lcm.cy + Math.sin(ang) * frac;
        let best = null;
        let bestD = Infinity;
        for(let h of landCandidates) {
            if(!isClaimableLand(h) || isWaterHex(h) || h.type === 'mountain') continue;
            let k = `${h.q},${h.r}`;
            if(taken.has(k)) continue;
            let dx = h.x - tx,
                dy = h.y - ty;
            let ds = dx * dx + dy * dy;
            if(ds < bestD) {
                bestD = ds;
                best = h;
            }
        }
        if(best) {
            taken.add(`${best.q},${best.r}`);
            seeds[ow] = best;
        } else {
            for(let h of landCandidates) {
                if(!isClaimableLand(h) || isWaterHex(h) || h.type === 'mountain') continue;
                let k = `${h.q},${h.r}`;
                if(taken.has(k)) continue;
                taken.add(k);
                seeds[ow] = h;
                break;
            }
        }
    }
    return seeds;
}
/** Max stamp footprint matches stampUrbanTerrainAroundCity fringe: dq²+dr² ≤ (R+1)², R=2 → ≤9; archipelago uses ≤6 for narrow islets. */
function wodProceduralUrbanFootprintKeys(q, r, owner) {
    // 3+ factions have thinner wedges — require a smaller owned footprint or city planning fails and regenerates terrain.
    let multi = ((gameData.aiCount | 0) + 1) >= 3;
    let r2Max = gameData.mapShape === 'archipelago' ? 6 : (multi ? 5 : 9);
    let keys = [];
    for(let dq = -3; dq <= 3; dq++) {
        for(let dr = -3; dr <= 3; dr++) {
            if(dq * dq + dr * dr > r2Max) continue;
            let qq = q + dq,
                rr = r + dr;
            let hk = `${qq},${rr}`;
            let hx = gameData.hexes[hk];
            if(!hx || isWaterHex(hx) || hx.type === 'mountain') return null;
            if(hx.owner !== owner) return null;
            keys.push(hk);
        }
    }
    return keys;
}
/** Steps from each faction’s political frontline inward ( deeper = safer core for towns ). */
function wodBuildInteriorDepthFromFrontlineMap(ownersSorted) {
    let depth = new Map();
    if(!ownersSorted || ownersSorted.length === 0) return depth;
    for(let ow of ownersSorted) {
        let q = [];
        let seen = new Set();
        for(let h of gameData.hexList) {
            if(!h || h.owner !== ow || !isClaimableLand(h) || isWaterHex(h)) continue;
            if(!isFrontlineHex(h, ow)) continue;
            let k = getHexKey(h);
            if(seen.has(k)) continue;
            seen.add(k);
            depth.set(k, 0);
            q.push(h);
        }
        if(q.length === 0) {
            for(let h of gameData.hexList) {
                if(!h || h.owner !== ow || !isClaimableLand(h) || isWaterHex(h)) continue;
                let k = getHexKey(h);
                if(!depth.has(k)) depth.set(k, 96);
            }
            continue;
        }
        let qi = 0;
        while(qi < q.length) {
            let cur = q[qi++];
            let d = depth.get(getHexKey(cur)) | 0;
            for(let nb of getNeighborHexes(cur)) {
                if(!nb || nb.owner !== ow || !isClaimableLand(nb) || isWaterHex(nb)) continue;
                let nk = getHexKey(nb);
                if(seen.has(nk)) continue;
                seen.add(nk);
                depth.set(nk, d + 1);
                q.push(nb);
            }
        }
    }
    return depth;
}
function wodTerritoryCandidatesForFaction(owner, mapShape, lcm, cols, rows, factionGeom) {
    let innerRSq = Infinity;
    if(wodMapShapeIsRadialForTownPolicy(mapShape)) {
        let arch = mapShape === 'archipelago';
        let innerFrac = arch ? 0.93 : 0.78;
        let innerRad = Math.max(lcm.maxR * innerFrac, (gameData.hexRadius || 10) * Math.max(gameData.mapRadius || 40, 8) * (arch ? 0.1 : 0.14));
        innerRSq = innerRad * innerRad;
    }
    let facRect = wodMapShapeUsesRectanglePipeline(mapShape) && factionGeom && factionGeom[owner],
        rectInnerFrac = 0.86,
        rectInnerSq = Infinity;
    if(facRect && facRect.maxSq > 0 && facRect.n >= 10)
        rectInnerSq = facRect.maxSq * rectInnerFrac * rectInnerFrac;
    const waterDistance=wodWaterDistanceField();
    let out = [];
    for(let h of gameData.hexList) {
        if(!isClaimableLand(h) || isWaterHex(h) || h.type === 'mountain') continue;
        if(h.owner !== owner) continue;
        if(wodMapShapeIsRadialForTownPolicy(mapShape)) {
            let dxC = h.x - lcm.cx,
                dyC = h.y - lcm.cy;
            if(dxC * dxC + dyC * dyC > innerRSq) continue;
        }
        if(wodMapShapeUsesRectanglePipeline(mapShape)) {
            let rowCount = Math.floor(rows) || 1;
            let bf = Math.max(Math.abs(h.q) / Math.max(cols, 1), Math.abs(h.r) / Math.max(rowCount, 1));
            if(bf > 0.90) continue;
            if(rectInnerSq < Infinity && facRect) {
                let dxF = h.x - facRect.cx,
                    dyF = h.y - facRect.cy;
                if(dxF * dxF + dyF * dyF > rectInnerSq) continue;
            }
        }
        let minSea = mapShape === 'archipelago' ? 2 : wodMapShapeIsRadialForTownPolicy(mapShape) ? 4 : 3;
        if((waterDistance.get(h)??Infinity) < minSea) continue;
        out.push(h);
    }
    if(wodMapShapeUsesRectanglePipeline(mapShape) && out.length === 0 && rectInnerSq < Infinity) {
        for(let h of gameData.hexList) {
            if(!isClaimableLand(h) || isWaterHex(h) || h.type === 'mountain') continue;
            if(h.owner !== owner) continue;
            let rowCount = Math.floor(rows) || 1;
            let bf = Math.max(Math.abs(h.q) / Math.max(cols, 1), Math.abs(h.r) / Math.max(rowCount, 1));
            if(bf > 0.90) continue;
            if((waterDistance.get(h)??Infinity) < 2) continue;
            out.push(h);
        }
    }
    return out;
}
function wodBestCoastalTerrainHexAmongOwned(owner, centroid) {
    if(!centroid) return null;
    let best = null,
        bestD = Infinity;
    let probe = { type: 'light', owner };
    for(let h of gameData.hexList) {
        if(!h || h.owner !== owner) continue;
        if(!isClaimableLand(h) || isWaterHex(h) || !canUnitEnterHex(probe, h)) continue;
        let sea = false;
        for(let n of getNeighborHexes(h))
            if(n && isWaterHex(n)) sea = true;
        if(!sea) continue;
        let dx = h.x - centroid.x,
            dy = h.y - centroid.y;
        let d = dx * dx + dy * dy;
        if(d < bestD) {
            bestD = d;
            best = h;
        }
    }
    return best;
}
/** Towns per player asked for in setup (1-4, default 2). Loaded/custom maps keep their own towns. */
function wodCitiesPerPlayerSetting() {
    // A campaign battle is not a setup-screen match: it keeps the standard two towns
    // whatever the solo setup panel was last left on.
    if(gameData._campaignRun) return 2;
    let el = document.getElementById('setupCitiesPerPlayer');
    let v = parseInt(el && el.value, 10);
    if(!(v >= 1 && v <= 4)) v = parseInt(gameData.citiesPerPlayer, 10);
    return v >= 1 && v <= 4 ? v : 2;
}
/** Step graph of one landmass for wodLandPathField: the 8 neighbours plus the 8 knight moves,
 *  so rings of equal distance are close to round instead of diamonds or octagons. A step is
 *  only legal when the cells it squeezes between are land too, so no path cuts a water corner. */
function wodBuildLandPathGrid(cells) {
    let q0 = Infinity, q1 = -Infinity, r0 = Infinity, r1 = -Infinity;
    for(const h of cells) {
        if(h.q < q0) q0 = h.q;
        if(h.q > q1) q1 = h.q;
        if(h.r < r0) r0 = h.r;
        if(h.r > r1) r1 = h.r;
    }
    const w = q1 - q0 + 1, at = new Int32Array(Math.max(1, w * (r1 - r0 + 1))).fill(-1);
    cells.forEach((h, i) => { at[(h.r - r0) * w + (h.q - q0)] = i; });
    const idx = (q, r) => q < q0 || q > q1 || r < r0 || r > r1 ? -1 : at[(r - r0) * w + (q - q0)];
    const n = cells.length, start = new Int32Array(n + 1), to = [], cost = [];
    const S2 = Math.SQRT2, S5 = Math.sqrt(5);
    for(let i = 0; i < n; i++) {
        const h = cells[i];
        start[i] = to.length;
        const E = idx(h.q + 1, h.r), W = idx(h.q - 1, h.r), S = idx(h.q, h.r + 1), N = idx(h.q, h.r - 1);
        for(const j of [E, W, S, N]) if(j >= 0) { to.push(j); cost.push(1); }
        const step = (dq, dr, a, b, c) => {
            const j = idx(h.q + dq, h.r + dr);
            if(j < 0 || a < 0 || b < 0) return -1;
            to.push(j); cost.push(c);
            return j;
        };
        const NE = step(1, -1, N, E, S2), SE = step(1, 1, S, E, S2), SW = step(-1, 1, S, W, S2), NW = step(-1, -1, N, W, S2);
        step(2, -1, E, NE, S5); step(2, 1, E, SE, S5); step(-2, -1, W, NW, S5); step(-2, 1, W, SW, S5);
        step(1, -2, N, NE, S5); step(-1, -2, N, NW, S5); step(1, 2, S, SE, S5); step(-1, 2, S, SW, S5);
    }
    start[n] = to.length;
    return { cells, n, idx, start, to: Int32Array.from(to), cost: Float64Array.from(cost) };
}
/** Cheapest land-path distance (in cells) from one cell to every cell of its landmass. Water
 *  never counts, so a region grown on this distance cannot jump a river, a lake or a bay. */
function wodLandPathField(grid, source) {
    const { n, start, to, cost } = grid, dist = new Float64Array(n).fill(Infinity), done = new Uint8Array(n);
    const hk = [], hv = [];
    const push = (k, v) => {
        let i = hk.length;
        hk.push(k); hv.push(v);
        while(i > 0) {
            const p = (i - 1) >> 1;
            if(hk[p] <= k) break;
            hk[i] = hk[p]; hv[i] = hv[p]; i = p;
        }
        hk[i] = k; hv[i] = v;
    };
    const pop = () => {
        const top = hv[0], lk = hk.pop(), lv = hv.pop(), m = hk.length;
        if(m) {
            let i = 0;
            for(;;) {
                let c = 2 * i + 1;
                if(c >= m) break;
                if(c + 1 < m && hk[c + 1] < hk[c]) c++;
                if(hk[c] >= lk) break;
                hk[i] = hk[c]; hv[i] = hv[c]; i = c;
            }
            hk[i] = lk; hv[i] = lv;
        }
        return top;
    };
    dist[source] = 0;
    push(0, source);
    while(hk.length) {
        const d = hk[0], i = pop();
        if(done[i]) continue;
        done[i] = 1;
        for(let e = start[i]; e < start[i + 1]; e++) {
            const j = to[e], nd = d + cost[e];
            if(nd < dist[j]) { dist[j] = nd; push(nd, j); }
        }
    }
    return dist;
}
/** Give every owner exactly its target number of cells: owner o holds the cells where
 *  scores[o] - bias[o] is lowest; each bias is solved in turn against the others. */
function wodSolveLandQuotas(scores, targets) {
    const f = scores.length, n = scores[0].length, bias = new Float64Array(f), owner = new Int8Array(n);
    if(f < 2) return owner;
    const margins = new Float64Array(n);
    for(let pass = 0; pass < (f === 2 ? 1 : 36); pass++) {
        for(let o = 0; o < (f === 2 ? 1 : f); o++) {
            for(let i = 0; i < n; i++) {
                let other = Infinity;
                for(let j = 0; j < f; j++) if(j !== o) { const v = scores[j][i] - bias[j]; if(v < other) other = v; }
                margins[i] = scores[o][i] - other;
            }
            margins.sort();
            const k = targets[o];
            bias[o] = k <= 0 ? margins[0] - 1 : k >= n ? margins[n - 1] + 1 : (margins[k - 1] + margins[k]) / 2;
        }
        const counts = new Array(f).fill(0);
        for(let i = 0; i < n; i++) {
            let best = 0;
            for(let o = 1; o < f; o++) if(scores[o][i] - bias[o] < scores[best][i] - bias[best]) best = o;
            owner[i] = best;
            counts[best]++;
        }
        if(counts.every((c, o) => Math.abs(c - targets[o]) <= 1)) break;
    }
    return owner;
}
/** Split one landmass between its owners into compact regions of the wanted sizes.
 *  Each owner holds the cells that are nearest to its seed by land path (less a per-owner
 *  handicap solved so the sizes come out right). Regions built this way stay in one piece and
 *  wrap round lakes, rivers and bays; the straight-line split they replace left pieces cut
 *  off behind water, and repairing those is what bent the borders. Seeds then move to the
 *  middle of their region and the split is solved again, which evens the handicaps out and
 *  straightens the frontiers. Returns the final seed cell of each owner. */
function wodPartitionLandmass(cells, owners, seedHexes, targets) {
    const f = owners.length;
    if(f === 1) {
        for(const h of cells) h.owner = owners[0];
        return [seedHexes[0]];
    }
    const grid = wodBuildLandPathGrid(cells), n = grid.n;
    const mapSeed = (gameData._mapGenSeed >>> 0) || 1, sp = gameData.hexRadius * 1.35;
    const first = seedHexes.map(h => grid.idx(h.q, h.r));
    if(first.some(s => s < 0) || new Set(first).size !== f) return null;
    // Is every owner's share one piece (joined by shared edges)?
    const onePiece = owner => {
        const seen = new Uint8Array(n), met = new Uint8Array(f);
        for(let s = 0; s < n; s++) {
            if(seen[s]) continue;
            if(met[owner[s]]) return false;
            met[owner[s]] = 1;
            const stack = [s];
            seen[s] = 1;
            while(stack.length) {
                const i = stack.pop(), h = cells[i];
                for(const d of cardinalHexDirections) {
                    const j = grid.idx(h.q + d.q, h.r + d.r);
                    if(j >= 0 && !seen[j] && owner[j] === owner[i]) { seen[j] = 1; stack.push(j); }
                }
            }
        }
        return true;
    };
    let seeds = first, owner = null;
    // Squared distances give straight frontiers on open ground (a power diagram) and are
    // tried first. Plain distances bend the frontier towards the weaker side, but can be
    // shown to keep every share in one piece, so they are the fallback.
    for(const squared of [true, false]) {
        seeds = first;
        for(let round = 0; round < 5; round++) {
            const scores = seeds.map((s, o) => {
                const d = wodLandPathField(grid, s);
                // A slow per-owner wave keeps frontiers on open ground from being ruler
                // lines, and a hair of per-cell noise splits exact ties without visible effect.
                const ph = ((Math.imul(mapSeed ^ Math.imul(owners[o] + 1, 0x9e3779b1), 0x85ebca6b) >>> 0) / 4294967296) * Math.PI * 2;
                for(let i = 0; i < n; i++) {
                    const h = cells[i];
                    const v = Math.max(0, d[i] + Math.sin(h.x / (sp * 9) + ph) * Math.cos(h.y / (sp * 8) + ph * 1.7) * 1.1);
                    d[i] = (squared ? v * v : v) +
                        ((Math.imul(h.q * 374761393 + h.r * 668265263, (mapSeed + o) | 1) >>> 0) / 4294967296) * 0.02;
                }
                return d;
            });
            owner = wodSolveLandQuotas(scores, targets);
            if(round === 4) break;
            const sx = new Float64Array(f), sy = new Float64Array(f), cnt = new Float64Array(f);
            for(let i = 0; i < n; i++) { const o = owner[i]; sx[o] += cells[i].x; sy[o] += cells[i].y; cnt[o]++; }
            const next = seeds.slice(), bestD = new Float64Array(f).fill(Infinity);
            for(let i = 0; i < n; i++) {
                const o = owner[i], dx = cells[i].x - sx[o] / cnt[o], dy = cells[i].y - sy[o] / cnt[o], d2 = dx * dx + dy * dy;
                if(d2 < bestD[o]) { bestD[o] = d2; next[o] = i; }
            }
            if(next.every((s, o) => s === seeds[o])) break;
            seeds = next;
        }
        if(onePiece(owner)) break;
    }
    for(let i = 0; i < n; i++) cells[i].owner = owners[owner[i]];
    return seeds.map(i => cells[i]);
}
/** Blunt the thin tips and teeth of a fresh split: a land cell goes to the owner that holds
 *  a clear majority of the land in the 5x5 block round it. Run before towns are placed; the
 *  exact balancing pass afterwards restores the equal land counts along the frontier. */
function wodBluntBorderTips(ownerIds, passes, landmasses) {
    const valid = new Set(ownerIds), massOf = new Map();
    // Votes stay within one landmass: an islet beside the coast is never split.
    landmasses.forEach((cells, m) => { for(const h of cells) massOf.set(h, m); });
    for(let pass = 0; pass < passes; pass++) {
        const flips = [];
        for(const h of gameData.hexList) {
            if(isWaterHex(h) || !valid.has(h.owner)) continue;
            // Only cells that touch another owner can be on a tip.
            if(!getNeighborHexes(h).some(n => !isWaterHex(n) && n.owner !== h.owner && valid.has(n.owner))) continue;
            const count = {}, mass = massOf.get(h);
            let total = 0;
            for(let dq = -2; dq <= 2; dq++) for(let dr = -2; dr <= 2; dr++) {
                const n = wodHexAt(h.q + dq, h.r + dr);
                if(!n || isWaterHex(n) || !valid.has(n.owner) || massOf.get(n) !== mass) continue;
                count[n.owner] = (count[n.owner] || 0) + 1;
                total++;
            }
            let best = h.owner;
            for(const o in count) if(count[o] > count[best]) best = Number(o);
            if(best !== h.owner && count[best] >= total * 0.6) flips.push([h, best]);
        }
        if(!flips.length) break;
        for(const [h, o] of flips) h.owner = o;
    }
}
/** Starting seeds for a landmass shared by k players: spaced along its long axis, so the
 *  frontiers take the short way across. (One player: the middle.) */
function wodLandmassSeeds(cells, k, turn) {
    let cx = 0, cy = 0;
    for(const h of cells) { cx += h.x; cy += h.y; }
    cx /= cells.length; cy /= cells.length;
    let sxx = 0, syy = 0, sxy = 0;
    for(const h of cells) { const dx = h.x - cx, dy = h.y - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy) + turn, reach = Math.sqrt((sxx + syy) / cells.length) * (k > 2 ? 1.2 : 0.8);
    const out = [];
    for(let i = 0; i < k; i++) {
        const t = k === 1 ? 0 : (i / (k - 1)) * 2 - 1;
        const tx = cx + Math.cos(ang) * reach * t, ty = cy + Math.sin(ang) * reach * t;
        let best = null, bestD = Infinity;
        for(const h of cells) {
            if(h.type === 'mountain' || out.indexOf(h) >= 0) continue;
            const d = (h.x - tx) ** 2 + (h.y - ty) ** 2;
            if(d < bestD) { bestD = d; best = h; }
        }
        if(best) out.push(best);
    }
    return out;
}
/** Spread k town sites evenly over an owner's land: split the land into k compact parts
 *  (k-means) and take the middle of each. Most central first, which becomes the first town. */
function wodTownSpreadSites(owner, k) {
    const cells = gameData.hexList.filter(h => h.owner === owner && !isWaterHex(h) && h.type !== 'mountain');
    if(!cells.length) return [];
    let cx = 0, cy = 0;
    for(const h of cells) { cx += h.x; cy += h.y; }
    cx /= cells.length; cy /= cells.length;
    const centers = [{ x: cx, y: cy }];
    const near = h => { let m = Infinity; for(const c of centers) { const d = (h.x - c.x) ** 2 + (h.y - c.y) ** 2; if(d < m) m = d; } return m; };
    while(centers.length < k) {
        let far = cells[0], farD = -1;
        for(const h of cells) { const d = near(h); if(d > farD) { farD = d; far = h; } }
        centers.push({ x: far.x, y: far.y });
    }
    for(let it = 0; it < 10 && k > 1; it++) {
        const sum = centers.map(() => [0, 0, 0]);
        for(const h of cells) {
            let b = 0, bd = Infinity;
            for(let c = 0; c < k; c++) { const d = (h.x - centers[c].x) ** 2 + (h.y - centers[c].y) ** 2; if(d < bd) { bd = d; b = c; } }
            sum[b][0] += h.x; sum[b][1] += h.y; sum[b][2]++;
        }
        for(let c = 0; c < k; c++) if(sum[c][2]) centers[c] = { x: sum[c][0] / sum[c][2], y: sum[c][1] / sum[c][2] };
    }
    return centers.sort((a, b) => ((a.x - cx) ** 2 + (a.y - cy) ** 2) - ((b.x - cx) ** 2 + (b.y - cy) ** 2));
}
/**
 * Terrain + accessibility must already be finalized. Clears neutral cities then:
 * political Voronoi from terrain seeds → equalize borders → equal city count inside each territory, non-touching urban footprints.
 * Sets gameData._wodProcgenBorderFirstApplied on success only. Does not call assignStartingCities.
 */
async function wodProceduralVoronoiBordersThenCitiesSameCount(cols, rows, mapShape) {
    gameData._wodProcgenBorderFirstApplied = false;
    if(!(gameData.mp && gameData.mp.enabled)) wodSyncAiCountForMapGen();
    let ownersListRaw = wodOwnersListActiveForProcgen();
    let ownersSorted = [...ownersListRaw].sort((a, b) => a - b);
    if(ownersSorted.length === 0) return false;

    let valid = new Set(ownersSorted);
    let landForCities = gameData.hexList.filter(h => !isWaterHex(h) && h.type !== 'mountain');
    let lcm = wodLandCentroidMaxRadius(landForCities);
    const terrainGraph=wodStartingLandGraph(),terrainSeen=new Set();let mainLand=[];
    for(const node of terrainGraph.nodes.values()) {
        if(terrainSeen.has(node))continue;
        const component=[node];terrainSeen.add(node);
        for(let i=0;i<component.length;i++)for(const nb of component[i].neighbors)
            if(!terrainSeen.has(nb)){terrainSeen.add(nb);component.push(nb);}
        if(component.length>mainLand.length)mainLand=component;
    }
    const mainKeys=new Set(mainLand.map(n=>getHexKey(n.hex)));
    const seedLand=mainLand.map(n=>n.hex);
    let phase = typeof gameData._wodCitySplitAnglePhase === 'number' ? gameData._wodCitySplitAnglePhase : 0;
    let f = ownersSorted.length;

    gameData.cities = [];
    for(let h of gameData.hexList) setHexOwner(h, 0);

    let seedHexByOwner = wodTerrainSeedsForVoronoiOwners(ownersSorted, seedLand, wodLandCentroidMaxRadius(seedLand), phase, mapShape);
    const isContinents = mapShape === 'continents';
    // Land-path split (see wodPartitionLandmass): used whenever the players share one main
    // landmass, and per continent on a continents map. Maps that are several real islands
    // (archipelago, broken or chained islands) keep the straight-line split across the sea.
    let pathSplit = false;
    // Groups of owners that share a landmass (continents: one group per continent).
    let landGroups = [ownersSorted.slice()];
    const landmasses = wodPoliticalLandmasses();
    const quota = wodBuildLandBalanceTargets(ownersSorted);
    if(isContinents) {
        // (Named reasons keep these out of the "towns do not fit" count in generateMap.)
        const noSplit = () => { gameData._startingBorderQuality = { ok: false, reason: 'continents-split' }; return false; };
        if(landmasses.length !== 2 || f < 2) return noSplit();
        // The larger continent hosts the larger half. Who goes where changes with the map
        // seed (and with each retry on the same terrain), so seat 1 has no fixed side.
        const order = ownersSorted.slice(), rnd = wodMulberry32((((gameData._mapGenSeed >>> 0) || 1) ^ Math.imul(Math.floor(phase * 1e6) + 1, 0x9e3779b1)) >>> 0);
        for(let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)), t = order[i]; order[i] = order[j]; order[j] = t; }
        const nBig = Math.ceil(f / 2);
        landGroups = [order.slice(0, nBig).sort((a, b) => a - b), order.slice(nBig).sort((a, b) => a - b)];
        seedHexByOwner = {};
        for(let g = 0; g < 2; g++) {
            const cells = landmasses[g], group = landGroups[g];
            if(cells.length !== group.reduce((n, ow) => n + quota[ow], 0)) return noSplit();
            const seeds = wodLandmassSeeds(cells, group.length, (rnd() - 0.5) * 0.7);
            if(seeds.length !== group.length) return noSplit();
            const placed = wodPartitionLandmass(cells, group, seeds, group.map(ow => quota[ow]));
            if(!placed) return noSplit();
            group.forEach((ow, i) => { seedHexByOwner[ow] = placed[i]; });
        }
        pathSplit = true;
    } else if(f >= 2 && landmasses.length) {
        const main = landmasses[0], landTotal = landmasses.reduce((n, l) => n + l.length, 0);
        const mainSet = new Set(main);
        const seeds = ownersSorted.map(ow => seedHexByOwner[ow]);
        const smallestQuota = Math.min(...ownersSorted.map(ow => quota[ow]));
        if(seeds.every(h => h && mainSet.has(h)) && main.length >= landTotal * 0.88 &&
            (landmasses.length < 2 || landmasses[1].length <= smallestQuota * 0.25)) {
            // Islets go whole to the nearest seed; the main landmass absorbs the difference.
            const want = ownersSorted.map(ow => quota[ow]);
            for(let m = 1; m < landmasses.length; m++) {
                const isle = landmasses[m];
                let ix = 0, iy = 0;
                for(const h of isle) { ix += h.x; iy += h.y; }
                ix /= isle.length; iy /= isle.length;
                let best = 0, bestD = Infinity;
                seeds.forEach((s, i) => { const d = (s.x - ix) ** 2 + (s.y - iy) ** 2; if(d < bestD) { bestD = d; best = i; } });
                for(const h of isle) h.owner = ownersSorted[best];
                want[best] -= isle.length;
            }
            const placed = want.every(n => n > 0) ? wodPartitionLandmass(main, ownersSorted, seeds, want) : null;
            if(placed) {
                ownersSorted.forEach((ow, i) => { seedHexByOwner[ow] = placed[i]; });
                pathSplit = true;
            } else for(let h of gameData.hexList) setHexOwner(h, 0);
        }
    }
    let seedsByOwner = {};
    let seedObjs = [];
    for(let ow of ownersSorted) {
        let hx = seedHexByOwner[ow];
        if(!hx) return false;
        let o = {
            owner: ow,
            q: hx.q,
            r: hx.r,
            x: hx.x,
            y: hx.y,
            hasFactory: false,
            id: '_vor_seed_' + ow,
        };
        seedsByOwner[ow] = o;
        seedObjs.push(o);
    }
    let zeroBias = {};
    for(let ow of ownersSorted) zeroBias[ow] = 0;

    if(pathSplit) {
        softenMountainHexBetweenOwners(ownersSorted);
        for(const group of landGroups) await ensureOwnersReachableByLand(group);
        // Round off single-cell teeth and thin tips; the exact pass below restores the equal counts.
        await smoothStartingTerritory(ownersSorted, 5, 2);
        wodBluntBorderTips(ownersSorted, 2, landmasses);
    } else {
        await wodAssignClaimableLandWeightedVoronoiFromSeeds(ownersSorted, seedsByOwner, zeroBias);
        await wodAssignWaterAndNonclaimablePoliticalVotes();
        softenMountainHexBetweenOwners(ownersSorted);
        await ensureOwnersReachableByLand(ownersSorted);
        await smoothStartingTerritory(ownersSorted, 4, 4);
        await wodEqualizePoliticsBiasedVoronoi(ownersSorted, seedObjs, ownersSorted.length >= 3 ? 18 : 28);
    }
    const referenceFrontier=wodStartingFrontierLength();
    // Keep the solved region intact while placing its towns.
    // Finalize mountain ownership and clear water claims after the land split settles.
    wodAssignAllWaterFromNearestLand(true);

    let perTile = {};
    for(let ow of ownersSorted) perTile[ow] = 0;
    for(let h of gameData.hexList) {
        if(!isClaimableLand(h) || isWaterHex(h)) continue;
        if(valid.has(h.owner)) perTile[h.owner]++;
    }
    // Every player gets the number of towns chosen in setup. When a map keeps failing to fit
    // them, generateMap lowers the count one step for everybody (_wodCityCountRelax).
    const wantTowns = Math.max(1, wodCitiesPerPlayerSetting() - (gameData._wodCityCountRelax | 0));

    let anchorChebSep = 6;

    let factionTerritoryGeom = {};
    for(let ow of ownersSorted) factionTerritoryGeom[ow] = wodFactionTerritoryCentroidMaxSq(ow);
    let interiorDepthMap = wodBuildInteriorDepthFromFrontlineMap(ownersSorted);

    function buildCandidateList(owner, level) {
        let cent = wodFactionPoliticalCentroid(owner);
        let pool = wodTerritoryCandidatesForFaction(owner, mapShape, lcm, cols, rows, factionTerritoryGeom);
        // Put a supply root for every faction on the shared mainland before
        // adding secondary settlements, so balancing never needs long colonies.
        // (On a continents map each player's "mainland" is its own continent.)
        if(level===0&&!isContinents)pool=pool.filter(h=>mainKeys.has(getHexKey(h)));
        let minDepth = mapShape === 'archipelago' ? 1 : 3;
        for(let relax = 0; relax < 4; relax++, minDepth--) {
            let filt = pool.filter(h => (interiorDepthMap.get(getHexKey(h)) ?? 999) >= minDepth);
            if(filt.length >= 8 || minDepth <= 0) {
                pool = filt.length ? filt : pool;
                break;
            }
        }
        let ax = cent ? cent.x : lcm.cx,
            ay = cent ? cent.y : lcm.cy;
        if(wodMapShapeUsesRectanglePipeline(mapShape)) {
            let sectors = 10;
            let lvAlt = level & 1;
            pool.sort((a, b) => {
                let da = interiorDepthMap.get(getHexKey(a)) ?? 0;
                let db = interiorDepthMap.get(getHexKey(b)) ?? 0;
                if(da !== db) return db - da;
                let ua = ((Math.atan2(a.y - ay, a.x - ax) + Math.PI) / (Math.PI * 2)) % 1;
                let ub = ((Math.atan2(b.y - ay, b.x - ax) + Math.PI) / (Math.PI * 2)) % 1;
                let sa = Math.min(sectors - 1, Math.floor(ua * sectors));
                let sb = Math.min(sectors - 1, Math.floor(ub * sectors));
                if(sa !== sb) return sa - sb;
                if(ua !== ub && Math.abs(ua - ub) > 1e-10) return ua - ub;
                let d2a = (a.x - ax) * (a.x - ax) + (a.y - ay) * (a.y - ay),
                    d2b = (b.x - ax) * (b.x - ax) + (b.y - ay) * (b.y - ay);
                if(d2a !== d2b) return lvAlt ? d2b - d2a : d2a - d2b;
                if(a.q !== b.q) return a.q - b.q;
                return a.r - b.r;
            });
        } else {
            pool.sort((a, b) => {
                let da = interiorDepthMap.get(getHexKey(a)) ?? 0;
                let db = interiorDepthMap.get(getHexKey(b)) ?? 0;
                if(da !== db) return db - da;
                let ca = Math.atan2(a.y - ay, a.x - ax);
                let cb = Math.atan2(b.y - ay, b.x - ax);
                let caOff = ca + level * (0.18 + owner * 0.011),
                    cbOff = cb + level * (0.18 + owner * 0.011);
                if(caOff !== cbOff) return caOff - cbOff;
                if(a.q !== b.q) return a.q - b.q;
                return a.r - b.r;
            });
        }
        let list = [];
        let seen = new Set();
        if(wodMapShapeIsRadialForTownPolicy(mapShape) && level === 0 && cent) {
            let pch = wodBestCoastalTerrainHexAmongOwned(owner, cent);
            if(pch && mainKeys.has(getHexKey(pch)) && (interiorDepthMap.get(getHexKey(pch)) ?? 0) >= 2) {
                seen.add(`${pch.q},${pch.r}`);
                list.push(pch);
            }
        }
        for(let hx of pool) {
            let k = `${hx.q},${hx.r}`;
            if(seen.has(k)) continue;
            seen.add(k);
            list.push(hx);
        }
        return list;
    }

    let candCache = new Map();
    function cachedCandidates(owner, level) {
        let ck = owner + ':' + level;
        let hit = candCache.get(ck);
        if(hit) return hit;
        let built = buildCandidateList(owner, level);
        candCache.set(ck, built);
        return built;
    }

    const spreadCache = new Map();
    function spreadSites(owner, k) {
        const ck = owner + ':' + k;
        if(!spreadCache.has(ck)) spreadCache.set(ck, wodTownSpreadSites(owner, k));
        return spreadCache.get(ck);
    }
    // Continents: the only way to the enemy is by sea, so one town per player is a port.
    // It stands two or three cells from the open sea, on the stretch of the owner's coast
    // nearest the other continent: the AI's naval planner only uses (and only attacks)
    // towns with water within three cells of the centre, and facing ports give every
    // player the same short crossing.
    let oceanKeys = null;
    const portPools = new Map(), portLevels = new Map();
    function portCandidates(owner) {
        if(portPools.has(owner)) return portPools.get(owner);
        if(!oceanKeys) oceanKeys = wodBuildOceanConnectedWaterKeys(cols, Math.floor(rows) || 1);
        const mine = new Set(landGroups.find(g => g.indexOf(owner) >= 0) || [owner]);
        // Steps across open sea from the other continent's shore.
        const seaSteps = new Map(), queue = [];
        for(const h of gameData.hexList) {
            if(!isWaterHex(h) || !oceanKeys.has(getHexKey(h))) continue;
            if(getNeighborHexes(h).some(n => !isWaterHex(n) && n.owner > 0 && !mine.has(n.owner))) { seaSteps.set(h, 0); queue.push(h); }
        }
        for(let i = 0; i < queue.length; i++) for(const n of getNeighborHexes(queue[i]))
            if(isWaterHex(n) && !seaSteps.has(n)) { seaSteps.set(n, seaSteps.get(queue[i]) + 1); queue.push(n); }
        const found = [];
        let nearest = Infinity;
        for(const h of gameData.hexList) {
            if(h.owner !== owner || isWaterHex(h) || h.type === 'mountain') continue;
            if((interiorDepthMap.get(getHexKey(h)) ?? 999) < 3) continue;
            if(getNeighborHexes(h).length < 8 || getNeighborHexes(h).some(n => isWaterHex(n) || n.type === 'mountain' || n.owner !== owner)) continue;
            let sea = Infinity;
            for(let dq = -2; dq <= 2; dq++) for(let dr = -2; dr <= 2; dr++) {
                if(dq * dq + dr * dr < 4) continue;
                const w = wodHexAt(h.q + dq, h.r + dr);
                if(w && seaSteps.has(w)) sea = Math.min(sea, seaSteps.get(w));
            }
            if(sea === Infinity) continue;
            found.push({ h, sea });
            nearest = Math.min(nearest, sea);
        }
        const pool = found.filter(c => c.sea <= nearest + Math.max(4, nearest * 0.5)).map(c => c.h);
        portPools.set(owner, pool);
        return pool;
    }
    function portLevel(owner, k) {
        const ck = owner + ':' + k;
        if(portLevels.has(ck)) return portLevels.get(ck);
        const sites = spreadSites(owner, k), pool = portCandidates(owner);
        let level = -1, bestD = Infinity;
        sites.forEach((s, i) => {
            for(const h of pool) { const d = (h.x - s.x) ** 2 + (h.y - s.y) ** 2; if(d < bestD) { bestD = d; level = i; } }
        });
        // No legal port: aim the last town at the (empty) port pool so this layout fails
        // and the map is retried, instead of starting a player who can never sail.
        if(level < 0) level = k - 1;
        portLevels.set(ck, level);
        return level;
    }
    function portFootprintKeys(q, r) {
        const keys = [];
        for(let dq = -1; dq <= 1; dq++) for(let dr = -1; dr <= 1; dr++) keys.push(`${q + dq},${r + dr}`);
        return keys;
    }
    /** Give a port an urban cell on the open sea, so it can always build a harbour. */
    function openPortToSea(center, city) {
        let gap = null, gapD = Infinity;
        for(let dq = -2; dq <= 2; dq++) for(let dr = -2; dr <= 2; dr++) {
            const w = wodHexAt(center.q + dq, center.r + dr), d = dq * dq + dr * dr;
            if(w && d >= 4 && d < gapD && isWaterHex(w) && oceanKeys.has(getHexKey(w))) { gapD = d; gap = { dq, dr }; }
        }
        if(!gap) return;
        // The neighbour of the centre that lies towards that water touches it.
        const quay = wodHexAt(center.q + Math.round(gap.dq / 2), center.r + Math.round(gap.dr / 2));
        if(!quay || isWaterHex(quay) || quay.type === 'mountain' || quay.owner !== city.owner) return;
        quay.type = 'urban';
        quay.cityId = city.id;
        if(quay.urbanVariant == null) quay.urbanVariant = 0;
        quay.baseColor = getUrbanTerrainColor(wodGetGamePeriod());
        quay.renderColor = quay.baseColor;
        delete city._urbanHexCache;
    }

    async function tryPlan(kpf) {
        let plan = {};
        let occCells = new Set();
        let anchors = {};
        for(let ow of ownersSorted) {
            plan[String(ow)] = [];
            anchors[String(ow)] = [];
        }
        let tryTick = 0;
        for(let lv = 0; lv < kpf; lv++) {
            let ord = ownersSorted.slice();
            if(lv % 2 === 1) ord.reverse();
            for(let ow of ord) {
                if((++tryTick & wodMapGenLoopYieldMask(31)) === 0) await wodMapGenYieldSlice();
                // Towns aim for the middles of k even parts of the owner's own land, so every
                // player's towns are spread the same way whatever shape its region has.
                const sites = spreadSites(ow, kpf), ideal = sites[lv] || sites[0];
                if(!ideal) return null;
                const isPort = isContinents && portLevel(ow, kpf) === lv;
                // Every legal cell is a candidate (an angle-sorted prefix used to miss the
                // only legal site on fragmented coasts); the nearest one to the ideal wins.
                let tried = isPort ? portCandidates(ow) : cachedCandidates(ow, lv);
                let hTick = 0;
                let bestHex = null;
                let bestD = Infinity;
                for(let hTry of tried) {
                    if((++hTick & wodMapGenLoopYieldMask(127)) === 0) await wodMapGenYieldSlice();
                    let qc = hTry.q,
                        rc = hTry.r;
                    if((hTry.x - ideal.x) ** 2 + (hTry.y - ideal.y) ** 2 >= bestD) continue;
                    let tooNear = false;
                    for(let o2 of ownersSorted) {
                        for(let aq of anchors[String(o2)]) {
                            let ddx = Math.abs(qc - aq.q),
                                ddr = Math.abs(rc - aq.r);
                            if(Math.max(ddx, ddr) < anchorChebSep) {
                                tooNear = true;
                                break;
                            }
                        }
                        if(tooNear) break;
                    }
                    if(tooNear) continue;

                    // 3+ factions: center cell only during planning (full urban stamp still runs later).
                    let uKeys = isPort ? portFootprintKeys(qc, rc) : f >= 3 ? [`${qc},${rc}`] : wodProceduralUrbanFootprintKeys(qc, rc, ow);
                    if(!uKeys) continue;
                    if(f >= 3 && (hTry.owner !== ow || isWaterHex(hTry) || hTry.type === 'mountain')) continue;
                    let clash = false;
                    for(let uk of uKeys)
                        if(occCells.has(uk)) {
                            clash = true;
                            break;
                        }
                    if(clash) continue;

                    let dx = hTry.x - ideal.x,
                        dy = hTry.y - ideal.y;
                    let ds = dx * dx + dy * dy;
                    if(ds < bestD) {
                        bestD = ds;
                        bestHex = hTry;
                    }
                }
                if(!bestHex) return null;
                let uKeysBest = isPort ? portFootprintKeys(bestHex.q, bestHex.r) : f >= 3
                    ? [`${bestHex.q},${bestHex.r}`]
                    : wodProceduralUrbanFootprintKeys(bestHex.q, bestHex.r, ow);
                if(!uKeysBest) return null;
                plan[String(ow)].push({ q: bestHex.q, r: bestHex.r, port: isPort });
                anchors[String(ow)].push({ q: bestHex.q, r: bestHex.r });
                for(let uk of uKeysBest) occCells.add(uk);
            }
        }
        return plan;
    }

    let winnerPlan = null;
    let kpf = 0;
    const sepLo=8;
    // Prefer workable spacing quickly — old 14→sepLo × every k rebuilt candidate sorts and hung 3+ AI.
    for(let sepTry = 10; sepTry >= sepLo && !winnerPlan; sepTry -= 2) {
        await wodMapGenYieldSlice();
        anchorChebSep = sepTry;
        winnerPlan = await tryPlan(wantTowns);
    }
    kpf = wantTowns;

    // Retry the map instead of relaxing spacing to adjacent towns.
    if(!winnerPlan)return false;

    for(let ow of ownersSorted)
        if(!winnerPlan[String(ow)] || winnerPlan[String(ow)].length !== kpf) return false;

    let cityIx = 0;
    for(let ow of ownersSorted) {
        let plist = winnerPlan[String(ow)];
        for(let ti = 0; ti < plist.length; ti++) {
            let site = plist[ti];
            let hx = wodHexAt(site.q,site.r);
            if(!hx) continue;
            cityIx++;
            let cid = 'city_' + cityIx;
            let cy = {
                id: cid,
                name: generateCityName(),
                x: hx.x,
                y: hx.y,
                q: hx.q,
                r: hx.r,
                owner: ow,
                hasFactory: false,
                hasHarbor: false,
                hasFarm: false,
                hp: 1000,
                maxHp: 1000,
                urbanStyle: Math.floor(Math.random() * 4),
                incomeBonus: 0,
                manpowerBonus: 0,
            };
            stampOwnedRandomUrbanTerrainAroundCity(hx, cy, ow);
            if(site.port) openPortToSea(hx, cy);
            gameData.cities.push(cy);
            setHexOwner(hx, ow);
            let near = getHexesInRadius(site.q, site.r, 2);
            for(let pt of near) {
                let gh = wodHexAt(pt.q,pt.r);
                if(gh && gh.owner === ow && isClaimableLand(gh)) setHexOwner(gh, ow);
            }
        }
    }

    wodSyncUrbanFootprintOwners();
    // The land-path split has no pockets to remove (every share is one piece), and this
    // pass would strip the owner from islets and from land behind a player's own ridge,
    // which only the straight-line re-solve below hands back.
    if(!pathSplit) await wodRemoveUnconnectedFactionHexPockets(ownersSorted);
    // Short rebalance after cities — old Math.max(64,f*13) + n*3 exact moves hung 2+ AI setups.
    // (The land-path split is already exact; only the straight-line split is solved again.)
    if(!pathSplit) await wodEqualizePoliticsBiasedVoronoi(ownersSorted, seedObjs, ownersSorted.length >= 3 ? 12 : 18);
    wodSyncUrbanFootprintOwners();
    await wodCarveStartingFactionPasses(ownersSorted);
    // Even starts: no river between some players only (filled along those borders, before the land counts are evened
    // out: filled river cells are new land; and once more after, since evening the land moves borders onto rivers), and
    // the same ground for everyone (last: it changes no owner, while evening the land moves border cells between players).
    wodBalanceStartingRivers(ownersSorted);
    wodRepairStartingLandSupply(ownersSorted);
    const equalizeLand = () => wodExactEqualizePoliticalLandCounts(
        ownersSorted,
        gameData.cities,
        ownersSorted.length >= 3 ? Math.min(360, gameData.hexList.length) : Math.min(600, gameData.hexList.length)
    );
    await equalizeLand();
    if(wodBalanceStartingRivers(ownersSorted)) { wodRepairStartingLandSupply(ownersSorted); await equalizeLand(); }
    wodBalanceStartingTerrain(ownersSorted);
    // Retry a constrained layout instead of moving its capitals into
    // another faction's region and carving long protected corridors.
    wodAssignAllWaterFromNearestLand(true);
    wodNormalizeStartingCityEconomy(ownersSorted);

    gameData._startingBorderQuality=wodValidateStartingBorders(ownersSorted,referenceFrontier);
    if(!gameData._startingBorderQuality.ok)return false;
    gameData._wodIslandsUnfair = false;gameData._wodTownsFarApart = false;
    if(!wodVerifyFairFactionStart(ownersSorted)) {
        gameData._startingBorderQuality={...gameData._startingBorderQuality,ok:false,reason:gameData._wodIslandsUnfair?'island-balance':gameData._wodTownsFarApart?'town-distance':'unbalanced-start'};
        return false;
    }

    gameData._wodProcgenBorderFirstApplied = true;
    return true;
}
async function assignStartingCities() {
    wodSyncViewportAndCanvas();
    gameData._campaignEnded = false;
    wodResetEndCountdowns();
    let preserveLoadedLayout = !!(gameData.loadedCustomMap && (!gameData.mp || !gameData.mp.enabled));
    let useMapFileStartEconomy = !!(preserveLoadedLayout && gameData._mapExportHadStartEconomy);
    // Clear entities for procedural maps; keep authored units on loaded library / editor exports.
    if(!preserveLoadedLayout && !gameData._wodMpLaunchFromCommitted) gameData.entities = [];
    gameData._generalMap = null;
    if(!useMapFileStartEconomy) {
        gameData.money = parseInt(document.getElementById('setupMoney').value) || 10000;
        gameData.aiMoneyByOwner = {};
        gameData.aiManpowerByOwner = {};
        gameData.manpower = 5000;
    } else {
        if(!gameData.aiMoneyByOwner) gameData.aiMoneyByOwner = {};
        if(!gameData.aiManpowerByOwner) gameData.aiManpowerByOwner = {};
    }
    gameData.manpowerIncome = 0;
    gameData.casualties = 0;
    gameData.enemyCasualties = 0;
    gameData.playerKills = 0;
    gameData.playerUnitsKilled = 0;
    gameData.tankCasualties = 0;
    gameData.playerTankKills = 0;
    gameData.shipCasualties = 0;
    gameData.playerShipKills = 0;
    gameData.casualtiesByOwner = {};
    gameData.killsByOwner = {};
    gameData.tankKillsByOwner = {};
    gameData.shipKillsByOwner = {};
    gameData.casualtyReplacementCostByOwner = {};
    gameData.tankCasualtiesByOwner = {};
    gameData.shipCasualtiesByOwner = {};
    gameData._battleLedger=wodNewBattleLedger();gameData._battleLedgerMap=gameData.hexes;
    gameData._factionIntel=null;gameData._fogVisible=null;gameData._fogVisionTimer=1;
    gameData.gameSessionStartedPerfMs = performance.now();
    wodInitMissionRuntime();
    gameData.sessionCitiesCaptured = 0;
    gameData.sessionCitiesCapturedByOwner = {};
    gameData._lifetimeStatsByOwner={};
    gameData._annihilationCheckAcc = 0;
    gameData._sessionIncomeAcc = { player: 0, ai: 0, byOwner: {} };
    gameData._landIncomeCacheDirty = true;
    wodMarkTerrainPoliticalDirty();

    let landHexes = gameData.hexList.filter(h => isClaimableLand(h));
    let basePlayerCount = wodGetMapPlayerCount();
    let activeOwners = (gameData.mp && gameData.mp.enabled) ? wodGetLobbyLayoutFactionSlots() : null;
    let ownersList = [];
    if(activeOwners && activeOwners.length > 0) {
        ownersList = activeOwners;
    } else {
        activeOwners = null;
        for(let o = 1; o <= basePlayerCount; o++) ownersList.push(o);
    }
    if(landHexes.length === 0) return;

    // Terrain → borders → cities pipeline already partitioned and stamped towns — only wire economy/units/camera.
    if(gameData._wodProcgenBorderFirstApplied && gameData.cities && gameData.cities.length >= ownersList.length &&
        ownersList.every(o => gameData.cities.some(c => c && c.owner === o))) {

        gameData.tradeTimer = 0;

        let locO = (!gameData.mp || !gameData.mp.enabled) ? 1 : (gameData.mp.localSlot || 1);
        for(let owner of ownersList) {
            gameData.aiMoneyByOwner[owner] = owner === locO ? 0 : (parseInt(document.getElementById('setupMoney').value) || 10000);
            gameData.aiManpowerByOwner[owner] = owner === locO ? 0 : 5000;
        }

        wodNormalizeStartingCityEconomy(ownersList);
        gameData._landIncomeCacheDirty = true;
        // Keep water claimed for naval play; visible frontlines stop at the open sea.
        wodAssignAllWaterFromNearestLand(true);
        if(!(gameData._mapGenOptions && gameData._mapGenOptions.units === false) && !gameData._wodMpLaunchFromCommitted) {
            gameData.entities = [];
            gameData._generalMap = null;
            spawnInitialFrontlineUnits(ownersList);
        }

        wodMarkTerrainPoliticalDirty();

        let startMe = gameData.cities.find(c => c.owner === locO && c.hasFactory) || gameData.cities.find(c => c.owner === locO);
        if(startMe) {
            let vw = canvas.clientWidth || UI.wrapper.clientWidth || wodCanvasAllocSize.w || 1;
            let vh = canvas.clientHeight || UI.wrapper.clientHeight || wodCanvasAllocSize.h || 1;
            gameData.camera.x = startMe.x * gameData.camera.zoom - vw / 2;
            gameData.camera.y = startMe.y * gameData.camera.zoom - vh / 2;
        }

        gameData._wodProcgenBorderFirstApplied = false;
        return;
    }

    // Loaded custom map: keep borders, town ownership and unit positions; start towns without buildings.
    if(preserveLoadedLayout) {
        wodNormalizeStartingCityEconomy(ownersList);
        wodReduceAuthoredStartingArmy(ownersList);
        gameData.tradeTimer = 0;
        let locO = 1;
        let startMoney = parseInt(document.getElementById('setupMoney').value, 10) || 10000;
        let startMp = 5000;
        if(!useMapFileStartEconomy) {
            gameData.money = startMoney;
            gameData.manpower = startMp;
            for(let owner of ownersList) {
                gameData.aiMoneyByOwner[owner] = owner === locO ? 0 : startMoney;
                gameData.aiManpowerByOwner[owner] = owner === locO ? 0 : startMp;
            }
        } else {
            if(!gameData.aiMoneyByOwner) gameData.aiMoneyByOwner = {};
            if(!gameData.aiManpowerByOwner) gameData.aiManpowerByOwner = {};
            if(typeof gameData.money !== 'number' || isNaN(gameData.money)) gameData.money = startMoney;
            if(typeof gameData.manpower !== 'number' || isNaN(gameData.manpower)) gameData.manpower = startMp;
            for(let owner of ownersList) {
                if(owner === locO) continue;
                if(gameData.aiMoneyByOwner[owner] == null) gameData.aiMoneyByOwner[owner] = startMoney;
                if(gameData.aiManpowerByOwner[owner] == null) gameData.aiManpowerByOwner[owner] = startMp;
            }
            gameData.aiMoneyByOwner[locO] = 0;
            gameData.aiManpowerByOwner[locO] = 0;
        }
        delete gameData._mapExportHadStartEconomy;
        gameData._landIncomeCacheDirty = true;
        // Campaign / loaded maps: paint the whole sea like skirmish Voronoi water wedges.
        wodAssignAllWaterFromNearestLand(true);
        wodMarkTerrainPoliticalDirty();

        let startMe =
            gameData.entities.find(u => u && u.owner === locO && u.hp > 0) ||
            gameData.cities.find(c => c && c.owner === locO && c.hasFactory) ||
            gameData.cities.find(c => c && c.owner === locO);
        if(!startMe) startMe = gameData.cities.find(c => c && c.owner === locO);
        if(!startMe) startMe = gameData.cities[0];
        if(!startMe) startMe = gameData.entities.find(u => u && u.hp > 0);
        if(startMe) {
            let vw = canvas.clientWidth || UI.wrapper.clientWidth || wodCanvasAllocSize.w || 1;
            let vh = canvas.clientHeight || UI.wrapper.clientHeight || wodCanvasAllocSize.h || 1;
            gameData.camera.x = startMe.x * gameData.camera.zoom - vw / 2;
            gameData.camera.y = startMe.y * gameData.camera.zoom - vh / 2;
        }
        return;
    }

    if(gameData._wodMpLaunchFromCommitted) {
        console.warn('assignStartingCities: unexpected full regen during MP committed launch');
        return;
    }

    // Reset owners first
    for(let c of gameData.cities) { c.owner = 0; c.hasFactory = false; c.hasHarbor = false; c.hasFarm = false; }
    for(let h of gameData.hexList) { setHexOwner(h, 0); }

    let cx = 0, cy = 0;
    for(let h of landHexes) { cx += h.x; cy += h.y; }
    cx /= landHexes.length;
    cy /= landHexes.length;

    wodPreliminaryCityOwnersFromAngleSplit(ownersList, landHexes);
    wodBalanceCityCountsAmongOwners(ownersList);

    function computeOwnerCentersFromCities() {
        let out = {};
        for(let owner of ownersList) {
            let sx = 0, sy = 0, cnt = 0;
            for(let c of gameData.cities) {
                if(c.owner !== owner) continue;
                sx += c.x;
                sy += c.y;
                cnt++;
            }
            if(cnt) out[owner] = { x: sx / cnt, y: sy / cnt, count: cnt };
            else out[owner] = { x: cx, y: cy, count: 0 };
        }
        return out;
    }
    let ownerCenters = computeOwnerCentersFromCities();

    gameData.tradeTimer = 0;

    let startCities = [];
    let locO = (!gameData.mp || !gameData.mp.enabled) ? 1 : (gameData.mp.localSlot || 1);
    for(let owner of ownersList) {
        let center = ownerCenters[owner] || { x: cx, y: cy };
        let candidates = gameData.cities.filter(c => c.owner === owner);
        let harborEligible = candidates.filter(c => cityUrbanClusterEligibleForHarbor(c));
        let preferCoastalIsland = wodMapShapeIsRadialForTownPolicy(gameData.mapShape);
        let startCity = null;
        let bestDist = Infinity;

        function pickNearestCityFrom(list) {
            let pick = null;
            let bd = Infinity;
            for(let city of list) {
                let dx = city.x - center.x;
                let dy = city.y - center.y;
                let dist = dx * dx + dy * dy;
                if(dist < bd) {
                    bd = dist;
                    pick = city;
                }
            }
            return pick;
        }

        if(preferCoastalIsland && harborEligible.length > 0)
            startCity = pickNearestCityFrom(harborEligible);

        if(!startCity && preferCoastalIsland) {
            let coastalHex = findBestCoastalLandHexForOwner(owner, center, landHexes);
            if(coastalHex) {
                startCity = {
                    id: 'city_capital_' + owner,
                    name: generateCityName(),
                    x: coastalHex.x, y: coastalHex.y, q: coastalHex.q, r: coastalHex.r,
                    owner, hasFactory: false, hasHarbor: false, hasFarm: false,
                    hp: 1000, maxHp: 1000,
                    urbanStyle: Math.floor(Math.random() * 4),
                    incomeBonus: 0,
                    manpowerBonus: 0
                };
                gameData.cities.push(startCity);
                stampUrbanTerrainAroundCity(coastalHex, startCity, owner);
                let cityHex = wodHexAt(startCity.q,startCity.r);
                if(cityHex) {
                    setHexOwner(cityHex, owner);
                    let cityArea = getHexesInRadius(startCity.q, startCity.r, 2);
                    for(let pt of cityArea) {
                        let gh = wodHexAt(pt.q,pt.r);
                        if(isClaimableLand(gh)) setHexOwner(gh, owner);
                    }
                }
            }
        }

        if(!startCity && candidates.length > 0)
            startCity = pickNearestCityFrom(candidates);

        if(!startCity) {
            let fallbackHex = null;
            let fd = Infinity;
            for(let h of landHexes) {
                if(h.type === 'mountain') continue;
                let dx = h.x - center.x;
                let dy = h.y - center.y;
                let d = dx * dx + dy * dy;
                if(d < fd) {
                    fd = d;
                    fallbackHex = h;
                }
            }
            if(!fallbackHex) fallbackHex = landHexes[0];
            startCity = {
                id: 'city_start_' + owner,
                name: generateCityName(),
                x: fallbackHex.x, y: fallbackHex.y, q: fallbackHex.q, r: fallbackHex.r,
                owner, hasFactory: false, hasHarbor: false, hasFarm: false,
                hp: 1000, maxHp: 1000,
                urbanStyle: Math.floor(Math.random() * 4),
                incomeBonus: 0,
                manpowerBonus: 0
            };
            gameData.cities.push(startCity);
            stampUrbanTerrainAroundCity(fallbackHex, startCity, 'fb_' + owner);
            let ctr = wodHexAt(startCity.q,startCity.r);
            if(ctr && isClaimableLand(ctr)) setHexOwner(ctr, owner);
        }

        startCity.owner = owner;
        startCity.hasFactory = false;
        startCities.push(startCity);
        gameData.aiMoneyByOwner[owner] = owner === locO ? 0 : (parseInt(document.getElementById('setupMoney').value) || 10000);
        gameData.aiManpowerByOwner[owner] = owner === locO ? 0 : 5000;
    }

    wodBalanceCityCountsAmongOwners(ownersList, new Set(startCities));

    await wodAssignPoliticalVoronoiFromCities(ownersList);
    wodSyncCityOwnersFromCenterHex();
    wodSyncUrbanFootprintOwners();
    softenMountainHexBetweenOwners(ownersList);
    await ensureOwnersReachableByLand(ownersList);
    await ensureOwnedTilesReachFactionCities(ownersList);
    wodSyncCityOwnersFromCenterHex();
    await wodRemoveUnconnectedFactionHexPockets(ownersList);
    await wodAssignPoliticalVoronoiFromCities(ownersList);
    wodSyncCityOwnersFromCenterHex();
    wodSyncUrbanFootprintOwners();
    await smoothStartingTerritory(ownersList, 4, 4);
    wodFinalizeStartingCitiesVsTerritory(startCities);
    let capitalsSetForBalance = new Set(startCities);
    wodBalanceCityCountsAmongOwners(ownersList, capitalsSetForBalance);
    wodReconcileCityTerrainToSettlementOwners(ownersList);
    wodPaintCapitalUrbanToDeclaredOwner(startCities);

    await smoothStartingTerritory(ownersList, 5, 2);
    let legacyEqIter = ownersList.length >= 3 ? 16 : 28;
    await wodEqualizePoliticsBiasedVoronoi(ownersList, startCities, legacyEqIter);

    wodSyncUrbanFootprintOwners();
    wodSyncCityOwnersFromCenterHex();
    wodFinalizeStartingCitiesVsTerritory(startCities);
    wodBalanceCityCountsAmongOwners(ownersList, capitalsSetForBalance);
    wodReconcileCityTerrainToSettlementOwners(ownersList);
    wodPaintCapitalUrbanToDeclaredOwner(startCities);

    await smoothStartingTerritory(ownersList, 6, 1);
    wodSyncUrbanFootprintOwners();
    await wodCarveStartingFactionPasses(ownersList);
    wodRepairStartingLandSupply(ownersList);
    await wodExactEqualizePoliticalLandCounts(
        ownersList,
        startCities,
        ownersList.length >= 3 ? Math.min(360, gameData.hexList.length) : Math.min(600, gameData.hexList.length)
    );
    await wodBalanceStartingIslandTowns(ownersList);
    wodAssignAllWaterFromNearestLand(true);
    wodNormalizeStartingCityEconomy(ownersList);
    gameData._landIncomeCacheDirty = true;

    if(!(gameData._mapGenOptions && gameData._mapGenOptions.units === false))
        spawnInitialFrontlineUnits(ownersList);

    wodRenumberAllFactionUnits();

    wodMarkTerrainPoliticalDirty();

    // Center Camera on local player capital
    let startMe = startCities.find(c => c.owner === locO);
    if(startMe) {
        let vw = canvas.clientWidth || UI.wrapper.clientWidth || wodCanvasAllocSize.w || 1;
        let vh = canvas.clientHeight || UI.wrapper.clientHeight || wodCanvasAllocSize.h || 1;
        gameData.camera.x = startMe.x * gameData.camera.zoom - vw / 2;
        gameData.camera.y = startMe.y * gameData.camera.zoom - vh / 2;
    }
}
function limitRectangleMountainDensity(mapShape, seedOffset) {
    if(!wodMapShapeUsesRectanglePipeline(mapShape)) return;
    if(mapShape === 'mountain' || (gameData._genProfile && gameData._genProfile.rectBiomePreset === 'mountain')) return;
    let land = gameData.hexList.filter(h => !isWaterHex(h));
    if(land.length === 0) return;
    let mountains = land.filter(h => h.type === 'mountain');
    let maxMountains = Math.max(14, Math.floor(land.length * 0.12));
    if(mountains.length <= maxMountains) return;

    mountains.sort((a, b) => {
        let ar = fbm(a.x * 0.015 + seedOffset + 8200, a.y * 0.015 + seedOffset + 8200, 3);
        let br = fbm(b.x * 0.015 + seedOffset + 8200, b.y * 0.015 + seedOffset + 8200, 3);
        return ar - br;
    });

    let convertCount = mountains.length - maxMountains;
    for(let i = 0; i < convertCount; i++) {
        let hex = mountains[i];
        let wet = fbm(hex.x * 0.009 + seedOffset + 9100, hex.y * 0.009 + seedOffset + 9100, 3);
        hex.type = wet > 0.62 ? 'forest' : 'hill';
        hex.baseColor = getTerrainColor(hex.type);
        hex.renderColor = hex.baseColor;
    }
}
let _wodMapGenYieldState = null;
function wodMapGenCooperativeMode() {
    return typeof wodUsesVisualViewportLayout === 'function' && wodUsesVisualViewportLayout();
}
function wodMapGenLoopYieldMask(defaultMask) {
    if(!wodMapGenCooperativeMode()) return defaultMask;
    if(defaultMask >= 8191) return 127;
    if(defaultMask >= 4095) return 63;
    if(defaultMask >= 2047) return 31;
    if(defaultMask >= 1023) return 15;
    if(defaultMask >= 511) return 11;
    if(defaultMask >= 255) return 7;
    if(defaultMask >= 127) return 5;
    if(defaultMask >= 31) return 3;
    return 0;
}
function wodMapGenYieldingStart(msBudget) {
    let b = Math.max(5, msBudget || 10);
    _wodMapGenYieldState = { budget: b, due: performance.now() + b, lastYieldAt: performance.now() };
}
function wodMapGenYieldingStop() {
    _wodMapGenYieldState = null;
}
async function wodMapGenYieldSlice() {
    let st = _wodMapGenYieldState;
    if(!st) return;
    let cooperative = wodMapGenCooperativeMode();
    if(gameData._wodFastMapGen && !cooperative) {
        st.fastTick = (st.fastTick || 0) + 1;
        if((st.fastTick & (gameData._wodFastMapGenLobby ? 8191 : 1023)) !== 0) return;
    }
    let now = performance.now();
    if(cooperative && st.lastYieldAt && (now - st.lastYieldAt) >= 24) {
        await wodYieldToMainThread();
        st.lastYieldAt = performance.now();
        st.due = st.lastYieldAt + 5;
        return;
    }
    if(now < st.due) return;
    await wodYieldToMainThread();
    st.lastYieldAt = performance.now();
    st.due = st.lastYieldAt + (cooperative ? 5 : (gameData._wodFastMapGen ? 4 : st.budget));
}
function wodYieldToMainThread() {
    try {
        let sch = globalThis.scheduler;
        if(sch && typeof sch.yield === 'function') return sch.yield();
    } catch(e) {}
    if(wodMapGenCooperativeMode()) {
        return new Promise(function(resolve) {
            setTimeout(resolve, 0);
        });
    }
    return new Promise(function(resolve) {
        if(typeof requestAnimationFrame === 'function') requestAnimationFrame(function() { resolve(); });
        else setTimeout(resolve, 0);
    });
}
function wodShouldShowMapGenOverlay() {
    if(gameData._wodSkipMapGenLoader) return false;
    if(gameData._wodPreviewSpinnerCanvasIds && gameData._wodPreviewSpinnerCanvasIds.size > 0) return false;
    if(gameData._soloPreviewGenerating) return false;
    let setupPanel = document.getElementById('setupPanel');
    if(setupPanel && !setupPanel.classList.contains('hidden')) return false;
    if(gameData.mp && gameData.mp.enabled) return true;
    if(typeof wodUsesVisualViewportLayout === 'function' && wodUsesVisualViewportLayout()) return false;
    return true;
}
async function wodResolveGeneratedTerrainCorners() {
    // A diagonal pair has no traversable shared edge. Resolve it in terrain
    // data before assigning countries/towns, rather than painting a fake neck.
    let changed=0;
    for(let pass=0;pass<32;pass++) {
        let edits=0;
        for(const h of gameData.hexList) {
            const a=wodHexAt(h.q+1,h.r),b=wodHexAt(h.q,h.r+1),c=wodHexAt(h.q+1,h.r+1);
            if(!a||!b||!c)continue;
            if(!isWaterHex(h)&&!isWaterHex(a)&&!isWaterHex(b)&&!isWaterHex(c)&&h.type===c.type&&a.type===b.type&&h.type!==a.type) {
                // Round terrain in the data too: alternating forest /
                // mountain / plain tips otherwise retain square joins.
                const choices=[];
                for(const cell of [h,a,b,c]) {
                    const type=cell.type===h.type?a.type:h.type;
                    if(cell.type==='urban'||type==='urban')continue;
                    let own=0,other=0;
                    for(const dir of cardinalHexDirections){const n=wodHexAt(cell.q+dir.q,cell.r+dir.r);if(n?.type===cell.type)own++;if(n?.type===type)other++;}
                    if(other>own||other===own&&type<cell.type)choices.push({cell,type,gain:other-own});
                }
                choices.sort((a,b)=>b.gain-a.gain||a.cell.q-b.cell.q||a.cell.r-b.cell.r);
                if(choices.length){wodSetGeneratedTerrainType(choices[0].cell,choices[0].type);edits++;changed++;}
                continue;
            }
            if(isWaterHex(h)!==isWaterHex(c)||isWaterHex(a)!==isWaterHex(b)||isWaterHex(h)===isWaterHex(a))continue;
            const cells=[h,a,b,c],dry=cells.filter(x=>!isWaterHex(x)),wet=cells.filter(isWaterHex);
            const count=x=>cardinalHexDirections.reduce((n,d)=>n+!!(wodHexAt(x.q+d.q,x.r+d.r)&&!isWaterHex(wodHexAt(x.q+d.q,x.r+d.r))),0);
            dry.sort((x,y)=>count(x)-count(y)||x.q-y.q||x.r-y.r);
            wet.sort((x,y)=>count(y)-count(x)||x.q-y.q||x.r-y.r);
            // Each edit decreases coastline length, or removes a land tip at
            // equal length. That prevents alternating corner repairs.
            if(count(wet[0])>=3)wodSetGeneratedTerrainType(wet[0],'sand');
            else wodSetGeneratedTerrainType(dry[0],'water');
            edits++;changed++;
        }
        if(!edits)return {ok:true,changed};
        await wodMapGenYieldSlice();
    }
    return {ok:false,changed};
}
async function generateMap() {
    if(gameData._mapGenInProgress) return;
    let ownsInnerRng = !_wodSavedMathRandom;
    let skipMapGenLoader = !!gameData._wodSkipMapGenLoader;
    let showMapGenOverlay = wodShouldShowMapGenOverlay() && !skipMapGenLoader;
    gameData._wodSkipMapGenLoader = false;
    gameData._wodFastMapGenLobby = skipMapGenLoader;
    let mapGenOverlayEl = null;
    if(showMapGenOverlay) {
        mapGenOverlayEl = document.getElementById('wodMapGenOverlay');
        if(mapGenOverlayEl) {
            mapGenOverlayEl.classList.remove('hidden');
            mapGenOverlayEl.setAttribute('aria-busy', 'true');
        }
    }
    try {
    gameData._mapGenInProgress = true;
    wodBeginMapGenAiLock();
    if(!gameData.loadedCustomMap) gameData.alliances = [];
    wodRefreshMapPreviewGeneratingUi();
    gameData._wodFastMapGen = true;
    wodMapGenYieldingStart(wodMapGenCooperativeMode() ? 5 : 4);
    let startMoneyInput = document.getElementById('setupMoney');
    gameData.money = startMoneyInput ? parseInt(startMoneyInput.value) : 10000;
    gameData.income = 10;             gameData.selection = [];
    gameData.buildMode = null;
    syncBuildPlacementMobileUi();
    wodMarkTerrainFullDirty();

    let sizeVal = gameData.mapRadius || 60;
    if(gameData.mp && gameData.mp.enabled) {
        let mpSz = document.getElementById('mpCfgMapSize');
        if(mpSz) sizeVal = mpSz.value;
        else if(window.wodMpRoomMeta && window.wodMpRoomMeta.mapSize != null) sizeVal = window.wodMpRoomMeta.mapSize;
    } else {
        let sizeEl = document.getElementById('setupMapSize');
        if(sizeEl) sizeVal = sizeEl.value;
    }
    wodApplyMapSizePreset(sizeVal);
    let mapR = gameData.mapRadius;
    let hr = gameData.hexRadius;
    let lobbyPreviewGen = !!gameData._wodLobbyPreviewGen;
    let procSucceeded = false;
    let mog = gameData._mapGenOptions;
    let wantCities = !mog || mog.cities !== false;
    let wantTerritory = !mog || mog.territory !== false;
    let wantUnits = !mog || mog.units !== false;
    let shapePre = document.getElementById('setupMapShape');
    let mapShapePre = (mog && wodIsProcGenMapShape(mog.mapShape)) ? mog.mapShape : (shapePre ? shapePre.value : 'island');
    let seedOffset = 0;
    let mapShape = mapShapePre;
    let cols = 0, rows = 0;
    let factionSlots = 1;
    let landForCities = [];
    let landNC = 1;
    // Full matches have no relaxed/legacy acceptance path. Continue with
    // fresh seeded terrain until the same strict checks pass, yielding
    // between attempts so the loading indicator remains responsive.
    const validation=gameData._mapGenValidation={terrainAttempts:0,politicsAttempts:0,rejections:{}};
    const recordRejection=reason=>validation.rejections[reason]=(validation.rejections[reason]||0)+1;
    let procSeedBase=((lobbyPreviewGen?gameData._mapGenSeedBase:0)>>>0)||(gameData._mapGenSeed>>>0)||1;

    outerProcTerrain: for(let procAttempt = 0; ; procAttempt++) {
        validation.terrainAttempts=procAttempt+1;
        if(procAttempt > 0 || wodMapGenCooperativeMode()) await wodYieldToMainThread();
        if(lobbyPreviewGen) {
            if(_wodSavedMathRandom) wodPopRandom();
            gameData._mapGenSeed = (procSeedBase ^ Math.imul(procAttempt, 0x9e3779b9)) >>> 0;
            if(!gameData._mapGenSeed) gameData._mapGenSeed = 0x6a09e667;
            wodPushSeededRandom(gameData._mapGenSeed);
        } else if(ownsInnerRng || procAttempt>0) {
            if(procAttempt > 0) wodPopRandom();
            if(procAttempt === 0) {
                if(gameData._wodReuseMapGenSeed) {
                    gameData._wodReuseMapGenSeed = false;
                } else {
                    let ss = (Math.floor(Math.random() * 4294967296) >>> 0) || 0;
                    if(!ss) ss = 0x6a09e667;
                    gameData._mapGenSeed = ss >>> 0;
                }
            } else {
                gameData._mapGenSeed = (procSeedBase ^ Math.imul(procAttempt,0x9e3779b9)) >>> 0;
            }
            if(procAttempt===0)procSeedBase=gameData._mapGenSeed;
            wodPushSeededRandom(gameData._mapGenSeed);
        }

    gameData.hexes = {}; gameData.hexList = [];
    gameData.cities = []; gameData.roads = []; gameData.entities = []; gameData.forts = []; gameData.bridges = [];
    gameData.hospitals = [];
    gameData._generalMap = null;
    gameData._wodCitySplitAnglePhase = null;

    seedOffset = Math.random() * 10000;

    let shapeInput = document.getElementById('setupMapShape');
    mapShape = (mog && wodIsProcGenMapShape(mog.mapShape)) ? mog.mapShape : (shapeInput ? shapeInput.value : 'island');
    gameData.mapShape = mapShape;
    gameData.loadedCustomMap = false;
    // Continents are sized by how the players split between them (1+1, 2+1, 2+2), so the
    // faction count has to be known before the terrain exists.
    let continentFactions = 2;
    if(mapShape === 'continents') {
        if(!(gameData.mp && gameData.mp.enabled)) wodSyncAiCountForMapGen();
        continentFactions = Math.max(2, wodGetDesiredFactionCountForMapGen());
    }
    gameData._genProfile = wodSampleMapGenProfile(mapShape, continentFactions);

    // Generate dense cell grid on the map. The old variable names remain,
    // but these are square-neighbor dots, not hex tiles.
    cols = mapR;
    rows = Math.floor(mapR * ((gameData._mapSizePreset && gameData._mapSizePreset.rowsMul) || 0.8));
    let spacing = hr * 1.35;
    // Terrain cells come from map-gen-worker.js: in worker threads when the browser has them, otherwise from
    // the same code loaded into the page (WodTerrainGen), so every path builds the same map.
    const terrainJob = { mapR, hr, mapShape, genProfile: gameData._genProfile, seedOffset, cols, rows, spacing };
    let terrainCells = null;
    try { terrainCells = await wodGenerateTerrainCellsInWorker(terrainJob); } catch(_) {}
    if(!terrainCells || !terrainCells.length) terrainCells = WodTerrainGen.generateTerrainCells(terrainJob);
    for(let ci = 0; ci < terrainCells.length; ci++) {
        let cell = terrainCells[ci];
        let hex = { q: cell.q, r: cell.r, x: cell.x, y: cell.y, type: cell.type, owner: 0, baseColor: '', renderColor: '' };
        hex.baseColor = getTerrainColor(hex.type);
        setHexOwner(hex, 0);
        gameData.hexes[`${cell.q},${cell.r}`] = hex;
        gameData.hexList.push(hex);
        if(ci > 0 && (ci & wodMapGenLoopYieldMask(255)) === 0) await wodMapGenYieldSlice();
    }

    await wodForceIslandEdgeWaterBuffer(cols, rows, 5, seedOffset);
    wodCarveContinentsChannel(cols, rows, seedOffset);
    await wodNaturalizeBiomeBlends(seedOffset, mapShape);
    await wodCoalesceTerrainSpeckles(2);
    await wodPaintRectangleMapPerimeterWater(cols, rows);
    await wodNormalizeRectangleWaterFeatures(seedOffset);
    limitRectangleMountainDensity(mapShape, seedOffset);
    await wodApplyRectangleBiomeDominance(seedOffset);
    wodThinMountainsForProfile(gameData._genProfile, seedOffset);
    // Connectivity first (island shape + playable land), then faction borders, then cities inside borders.
    await ensureMountainPasses();
    await softenLandFullyBlockedByMountainRing();
    if(!gameData._wodFastMapGen) await ensureMountainPasses();
    wodClampIslandMountainLandFraction(gameData._genProfile, seedOffset);
    await wodCarveProceduralRivers(seedOffset, mapShape, cols, rows);
    await wodPaintCoastalSandAllLand();
    await wodCoalesceTerrainSpeckles(2);
    await wodEnsureMountainLandOutlets();
    // Re-run last: speckle coalescing / rivers / biome blends can re-add land at the
    // boundary, and island maps must never touch the map edge.
    await wodForceIslandEdgeWaterBuffer(cols, rows, 5, seedOffset);
    if(mapShape === 'continents') {
        wodCarveContinentsChannel(cols, rows, seedOffset);
        if(!wodKeepTwoContinents()) { recordRejection('continents-shape'); if(ownsInnerRng)wodPopRandom(); continue outerProcTerrain; }
    }
    const cornerRepair=await wodResolveGeneratedTerrainCorners();
    if(!cornerRepair.ok) { recordRejection('terrain-corners'); if(ownsInnerRng)wodPopRandom(); continue outerProcTerrain; }
    // Last terrain step: the two continents must hold exactly their players' shares of land.
    if(mapShape === 'continents' && !wodBalanceContinentsLand(continentFactions, cols, rows)) {
        recordRejection('continents-balance'); if(ownsInnerRng)wodPopRandom(); continue outerProcTerrain;
    }
    wodCaptureTerrainPoliticsBase();

    if(!wodMapLandFractionAcceptable(mapShape)) {
        recordRejection('land-fraction');
        if(ownsInnerRng) wodPopRandom();
        continue outerProcTerrain;
    }

    await wodMapGenYieldSlice();

    // Faction count is frozen for this generateMap call so changing AI mid-build cannot hang packing.
    if(!(gameData.mp && gameData.mp.enabled)) wodSyncAiCountForMapGen();
    factionSlots = Math.max(1, wodGetDesiredFactionCountForMapGen());
    landForCities = gameData.hexList.filter(h => !isWaterHex(h) && h.type !== 'mountain');
    landNC = Math.max(1, landForCities.length);

    if(mapShape === 'archipelago') {
        let passLand = 0;
        for(let hx0 of gameData.hexList) if(hx0 && !isWaterHex(hx0)) passLand++;
        let gridN = Math.max(1, gameData.hexList.length);
        let minPass = Math.max(factionSlots * 100, 160, Math.floor(gridN * 0.016));
        if(passLand < minPass) {
            recordRejection('sparse-islands');
            if(ownsInnerRng) wodPopRandom();
            continue outerProcTerrain;
        }
    }

    gameData._wodCitySplitAnglePhase = wodDeterministicCitySplitPhase01(((gameData._mapGenSeed || 1) >>> 0) ^ Math.imul(factionSlots | 0, 738560931)) * Math.PI * 2;

    gameData._wodProcgenBorderFirstApplied = false;
    gameData.citiesPerPlayer = wodCitiesPerPlayerSetting();
    if(wantCities && wantTerritory) {
        // Retry borders/cities on the same terrain before discarding it (3+ AI used to
        // burn minutes regenerating islands when city packing/fair-start failed).
        // Archipelago: towns placed but split unevenly between shared islands (wodArchipelagoIslandsFair) earn up to six
        // more split angles on the same islands. They do not count as failed town placements, so they never cost towns.
        let politicsTries = factionSlots >= 3 ? 3 : 2, islandRetries = mapShape === 'archipelago' ? 6 : 0, distanceRetries = 4;
        let procOk = false;
        for(let pt = 0; pt < politicsTries; pt++) {
            if(pt > 0) {
                if(!wodRestoreTerrainPoliticsBase()) break;
                gameData._wodCitySplitAnglePhase =
                    wodDeterministicCitySplitPhase01(
                        ((gameData._mapGenSeed || 1) >>> 0) ^
                        Math.imul(factionSlots | 0, 738560931) ^
                        Math.imul(pt + 1, 0x85ebca6b) ^
                        Math.imul(procAttempt + 1, 0xc2b2ae35)
                    ) * Math.PI * 2;
            }
            validation.politicsAttempts++;
            gameData._startingBorderQuality=null;
            // A map too small for the towns asked for gets one town fewer for every player
            // after each six failed layouts (two or three fresh terrains). Two towns always
            // fitted with enough fresh terrain before this option existed, so the step from
            // two down to one waits for 24 more failures; one town is the floor.
            {
                const fails = validation.rejections['town-placement'] || 0, asked = wodCitiesPerPlayerSetting();
                let towns = Math.max(Math.min(asked, 2), asked - Math.floor(fails / 6));
                // (archipelago: once two towns each have fitted, only to be split unevenly between islands, two towns
                // fit this size of map; the step down to one waits twice as long, 48 failures)
                const fitted = (validation.rejections['island-balance'] || 0) > 0 ? 48 : 24;
                if(towns === 2 && fails - (asked - 2) * 6 >= fitted) towns = 1;
                gameData._wodCityCountRelax = asked - towns;
            }
            procOk = await wodProceduralVoronoiBordersThenCitiesSameCount(cols, rows, mapShape);
            if(procOk) break;
            const why = gameData._startingBorderQuality?.reason||'town-placement';
            recordRejection(why);
            if(why === 'island-balance' && islandRetries-- > 0) politicsTries++;
            // (towns placed but one player's nearest enemy town much nearer than another's: a few more split angles too)
            if(why === 'town-distance' && distanceRetries-- > 0) politicsTries++;
            await wodMapGenYieldSlice();
        }
        if(procOk) {
            procSucceeded = true;
            validation.acceptedSeed=gameData._mapGenSeed>>>0;
            validation.quality=gameData._startingBorderQuality;
            break outerProcTerrain;
        }
        continue outerProcTerrain;
    } else {
        procSucceeded = false;
        break outerProcTerrain;
    }
    }

    // Neutral-city editor requests do not partition the map. Full
    // matches can only reach this point through validated acceptance.
    if(wantCities && !wantTerritory)
        wodPlaceNeutralEditorCities({ mapR, hr, mapShape, cols, rows, factionSlots, landForCities, landNC });

    wodBuildNearestTownRoads();

    if(wantTerritory && wantCities) {
        if(!procSucceeded || !gameData._startingBorderQuality?.ok)
            throw new Error('Cannot deploy an unvalidated procedural map');
        await assignStartingCities();
    } else if(wantCities && !wantTerritory) {
        for(let hx of gameData.hexList) setHexOwner(hx, 0);
        gameData.entities = [];
        gameData._generalMap = null;
        wodMarkTerrainPoliticalDirty();
    } else {
        gameData.cities = [];
        gameData.roads = [];
        gameData.entities = [];
        gameData._generalMap = null;
        for(let hx of gameData.hexList) setHexOwner(hx, 0);
        wodMarkTerrainPoliticalDirty();
    }
    updateTerrainKey();
    if(ownsInnerRng)
        gameData._lastMapFingerprint = wodComputeMapFingerprint();
    } finally {
        gameData._mapGenInProgress = false;
        wodEndMapGenAiLock();
        wodHideMapGenOverlay();
        wodRefreshMapPreviewGeneratingUi();
        gameData._wodFastMapGen = false;
        gameData._wodFastMapGenLobby = false;
        wodMapGenYieldingStop();
        if(showMapGenOverlay && mapGenOverlayEl) {
            mapGenOverlayEl.classList.add('hidden');
            mapGenOverlayEl.setAttribute('aria-busy', 'false');
        }
        if(ownsInnerRng) wodPopRandom();
        gameData._mapGenOptions = null;
        gameData._wodCityCountRelax = 0;
    }
}

/** Map editor request for towns without faction borders: neutral towns spread over the land. */
function wodPlaceNeutralEditorCities({ mapR, hr, mapShape, cols, rows, factionSlots, landForCities, landNC }) {
        for(let hx of gameData.hexList) setHexOwner(hx, 0);
        gameData.cities = [];

        let citiesPerPlayer = Math.min(4, Math.max(2, 1 + Math.floor(mapR / 72)));
        let numCities = factionSlots * citiesPerPlayer;
        let spacingDen = Math.max(62, Math.floor(76 - factionSlots * 3.8 - Math.min(18, Math.floor(mapR / 55))));
        let maxFromLand = Math.max(factionSlots * 2, Math.floor(landNC / spacingDen));
        numCities = Math.min(numCities, maxFromLand);
        numCities = Math.max(factionSlots * 2, Math.ceil(numCities / factionSlots) * factionSlots);

        let citySpacing = Math.max(hr * 17, Math.min(hr * 41, mapR * hr * 0.395));
        let lcm = wodLandCentroidMaxRadius(landForCities);
        let cityPickOrder = wodWedgeFocusedCityCandidateOrder(landForCities, factionSlots, lcm, gameData._wodCitySplitAnglePhase, mapShape);
        let cityPickCursor = 0;
        let innerRad = Math.max(lcm.maxR * (wodMapShapeIsRadialForTownPolicy(mapShape) ? 0.78 : 0.84), hr * Math.max(mapR, 8) * 0.14);
        let innerRSq = innerRad * innerRad;
        let minWaterSteps = wodMapShapeIsRadialForTownPolicy(mapShape) ? 4 : 3;
        let maxAttemptsPerCity = Math.min(980, Math.max(160, (cityPickOrder.length || mapR * mapR) * 4));
        const waterDistance=wodWaterDistanceField();
        for(let i=0; i<numCities; i++) {
            let valid = false; let attempts = 0;
            while(!valid && attempts < maxAttemptsPerCity) {
                let h = null;
                if(cityPickOrder.length > 0) {
                    h = cityPickOrder[cityPickCursor % cityPickOrder.length];
                    cityPickCursor++;
                } else {
                    h = gameData.hexList[(Math.floor(Math.random() * gameData.hexList.length)) | 0];
                }
                attempts++;
                if(!h || isWaterHex(h) || h.type === 'mountain') continue;
                let dxC = h.x - lcm.cx, dyC = h.y - lcm.cy;
                if(dxC * dxC + dyC * dyC > innerRSq && attempts < 480) continue;
                if(wodMapShapeUsesRectanglePipeline(mapShape)) {
                    let bf = Math.max(Math.abs(h.q) / Math.max(cols, 1), Math.abs(h.r) / Math.max(rows, 1));
                    if(bf > 0.90 && attempts < 480) continue;
                }
                if((waterDistance.get(h)??Infinity) < minWaterSteps && attempts < 460) continue;
                let tooClose = gameData.cities.some(c => {
                    let dx = c.x - h.x; let dy = c.y - h.y;
                    return Math.sqrt(dx * dx + dy * dy) < citySpacing;
                });
                if(tooClose && attempts <= 450) continue;
                gameData.cities.push({
                    id: 'city_' + i,
                    name: generateCityName(),
                    x: h.x, y: h.y, q: h.q, r: h.r,
                    owner: 0, hasFactory: false, hasHarbor: false, hasFarm: false,
                    hp: 1000, maxHp: 1000,
                    urbanStyle: Math.floor(Math.random() * 4),
                    incomeBonus: 0,
                    manpowerBonus: 0
                });

                let urbanHexes = [];
                let shapeType = Math.floor(Math.random() * 4);
                let R = 2;
                for(let dq = -3; dq <= 3; dq++) {
                    for(let dr = -3; dr <= 3; dr++) {
                        let distSq = dq * dq + dr * dr;
                        let add = false;
                        if(shapeType === 0) {
                            add = distSq <= R * R;
                        } else if(shapeType === 1) {
                            add = Math.abs(dq) <= 1 && Math.abs(dr) <= 1;
                        } else if(shapeType === 2) {
                            add = Math.abs(dq) <= 2 && Math.abs(dr) <= 1;
                        } else if(shapeType === 3) {
                            add = Math.abs(dq) <= 1 && Math.abs(dr) <= 2;
                        }
                        if(add && Math.random() > 0.15) {
                            urbanHexes.push({q: h.q + dq, r: h.r + dr});
                        } else if(!add && distSq <= (R + 1) * (R + 1) && Math.random() > 0.85) {
                            urbanHexes.push({q: h.q + dq, r: h.r + dr});
                        }
                    }
                }
                urbanHexes.push({q: h.q, r: h.r});

                for(let uh of urbanHexes) {
                    let targetH = wodHexAt(uh.q,uh.r);
                    if(targetH && !isWaterHex(targetH)) {
                        targetH.type = 'urban';
                        targetH.cityId = 'city_' + i;
                        targetH.urbanVariant = Math.floor(Math.random() * 5);
                        targetH.baseColor = getUrbanTerrainColor(wodGetGamePeriod());
                        targetH.renderColor = targetH.baseColor;
                    }
                }

                valid = true;
            }
        }
}

/** Each town gets a road to its nearest neighbour. */
function wodBuildNearestTownRoads() {
    gameData.roads = [];
    // Generate Roads (MST style connecting nearest)
    for(let i=0; i<gameData.cities.length; i++){
        let c1 = gameData.cities[i];
        let nearest = null; let minDist = Infinity;
        for(let j=0; j<gameData.cities.length; j++){
            if(i === j) continue;
            let c2 = gameData.cities[j];
            let d = Math.sqrt(Math.pow(c1.x - c2.x, 2) + Math.pow(c1.y - c2.y, 2));
            if(d < minDist) { minDist = d; nearest = c2; }
        }
        if(nearest) gameData.roads.push({from: c1, to: nearest});
    }
}
// Find all groups of contiguous non-mountain land. If there are multiple groups,
// carve mountain passes (convert mountain hexes to hill) to connect them all.
async function ensureMountainPasses() {
    let landKey = (h) => `${h.q},${h.r}`;
    let isPassable = (h) => h && !isWaterHex(h) && h.type !== 'mountain';
    let visited = new Set();
    let components = [];
    let walkTick = 0;

    for(let hex of gameData.hexList) {
        if(!isPassable(hex) || visited.has(landKey(hex))) continue;
        let queue = [hex];
        let qi = 0;
        let comp = [];
        visited.add(landKey(hex));
        while(qi < queue.length) {
            let cur = queue[qi++];
            comp.push(cur);
            for(let dir of hexDirections) {
                let nKey = `${cur.q + dir.q},${cur.r + dir.r}`;
                let nHex = gameData.hexes[nKey];
                if(!isPassable(nHex) || visited.has(nKey)) continue;
                visited.add(nKey);
                queue.push(nHex);
            }
            if((++walkTick & wodMapGenLoopYieldMask(4095)) === 0) await wodMapGenYieldSlice();
        }
        if(comp.length > 0) components.push(comp);
    }

    if(components.length <= 1) return;
    // Sort largest first
    components.sort((a, b) => b.length - a.length);

    // For each smaller component, find the closest pair across the largest accessible mass
    // and carve a pass through any mountains between them.
    let mainComponent = components[0];
    let mainSet = new Set(mainComponent.map(landKey));

    for(let i = 1; i < components.length; i++) {
        let comp = components[i];
        if(comp.length < 2) continue;

        let bestA = null, bestB = null, bestDist = Infinity;
        let pairTick = 0;
        for(let a of comp) {
            for(let b of mainComponent) {
                let dx = a.x - b.x, dy = a.y - b.y;
                let d = dx * dx + dy * dy;
                if(d < bestDist) { bestDist = d; bestA = a; bestB = b; }
                if((++pairTick & wodMapGenLoopYieldMask(2047)) === 0) await wodMapGenYieldSlice();
            }
        }
        if(!bestA || !bestB) continue;

        carveMountainLine(bestA, bestB);
        // Add this component to mainSet
        for(let h of comp) mainSet.add(landKey(h));
        mainComponent = mainComponent.concat(comp);
    }

    // For tiny pockets of land entirely surrounded by mountains, convert them to hills
    // so they connect naturally via the carved line.
    for(let i = 1; i < components.length; i++) {
        let comp = components[i];
        if(comp.length >= 3) continue;
        for(let h of comp) {
            h.type = 'hill';
            h.baseColor = getTerrainColor('hill');
            h.renderColor = h.baseColor;
        }
    }
}
function carveMountainLine(a, b) {
    // Walk grid from a to b, converting mountains to hills with a wide brush so passes are never
    // a single diagonal or one-hex choke (8-neighbor connectivity allows pinches otherwise).
    let steps = Math.max(2, Math.round(Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r)) * 1.5));
    for(let i = 0; i <= steps; i++) {
        let t = i / steps;
        let q = Math.round(a.q + (b.q - a.q) * t);
        let r = Math.round(a.r + (b.r - a.r) * t);
        for(let cell of getHexesInRadius(q, r, 2)) {
            let hx = wodHexAt(cell.q,cell.r);
            if(hx && hx.type === 'mountain') {
                hx.type = 'hill';
                hx.baseColor = getTerrainColor('hill');
                hx.renderColor = hx.baseColor;
            }
        }
    }
}
async function softenLandFullyBlockedByMountainRing() {
    let probeTpl = { type: 'light', owner: 1 };
    for(let sweep = 0; sweep < 220; sweep++) {
        await wodMapGenYieldSlice();
        let hit = false;
        let hi = 0;
        for(let hex of gameData.hexList) {
            if(isWaterHex(hex) || hex.type === 'mountain') continue;
            probeTpl.owner = hex.owner >= 1 ? hex.owner : 1;
            if(!canUnitEnterHex(probeTpl, hex)) continue;
            let neighbors = getNeighborHexes(hex);
            let hasLandNeighbor = false;
            for(let n of neighbors) {
                if(!n || isWaterHex(n)) continue;
                if(n.type === 'mountain') continue;
                if(!canUnitEnterHex(probeTpl, n)) continue;
                hasLandNeighbor = true;
                break;
            }
            if(hasLandNeighbor) continue;
            let mount = neighbors.find(nb => nb && nb.type === 'mountain');
            if(mount) {
                mount.type = 'hill';
                mount.baseColor = getTerrainColor('hill');
                mount.renderColor = mount.baseColor;
                hit = true;
                break;
            }
            if((++hi & wodMapGenLoopYieldMask(511)) === 0) await wodMapGenYieldSlice();
        }
        if(!hit) break;
    }
}
/** Re-run pass carving after late terrain passes so no land pocket is fully ringed by mountains. */
async function wodEnsureMountainLandOutlets() {
    await ensureMountainPasses();
    await softenLandFullyBlockedByMountainRing();
}
/** BFS from each faction's towns so every owned infantry-passable tile can reach at least one friendly city footprint. */
async function ensureOwnedTilesReachFactionCities(ownerIds) {
    if(!ownerIds || ownerIds.length === 0) return;
    let probeTpl = { type: 'light', owner: 1 };
    let bfsTick = 0;
    for(let pass = 0; pass < 48; pass++) {
        await wodMapGenYieldSlice();
        let carved = false;
        owLoop: for(let owner of ownerIds) {
            probeTpl.owner = owner;
            let seeds = [];
            for(let city of gameData.cities) {
                if(city.owner !== owner) continue;
                let urbanList = getCityUrbanTerrainHexes(city);
                for(let uh of urbanList) {
                    let hx = wodHexAt(uh.q,uh.r);
                    if(hx && hx.owner === owner && canUnitEnterHex(probeTpl, hx))
                        seeds.push(hx);
                }
                let ctr = wodHexAt(city.q,city.r);
                if(ctr && ctr.owner === owner && canUnitEnterHex(probeTpl, ctr))
                    seeds.push(ctr);
            }
            if(seeds.length === 0) continue;
            let queue = [...seeds];
            let qi = 0;
            let seen = new Set(seeds.map(getHexKey));
            while(qi < queue.length) {
                let cur = queue[qi++];
                if(cur.owner !== owner || !canUnitEnterHex(probeTpl, cur)) continue;
                for(let nb of getNeighborHexes(cur)) {
                    if(!nb || isWaterHex(nb) || nb.type === 'mountain') continue;
                    if(nb.owner !== owner || !canUnitEnterHex(probeTpl, nb)) continue;
                    let k = getHexKey(nb);
                    if(seen.has(k)) continue;
                    seen.add(k);
                    queue.push(nb);
                }
                if((++bfsTick & wodMapGenLoopYieldMask(8191)) === 0) await wodMapGenYieldSlice();
            }
            let hi = 0;
            for(let hex of gameData.hexList) {
                if((++hi & wodMapGenLoopYieldMask(255)) === 0) await wodMapGenYieldSlice();
                if(hex.owner !== owner || isWaterHex(hex) || hex.type === 'mountain') continue;
                if(!canUnitEnterHex(probeTpl, hex)) continue;
                if(seen.has(getHexKey(hex))) continue;
                let bestS = seeds[0];
                let bestD = Infinity;
                for(let s of seeds) {
                    let dx = hex.x - s.x, dy = hex.y - s.y;
                    let d = dx * dx + dy * dy;
                    if(d < bestD) {
                        bestD = d;
                        bestS = s;
                    }
                }
                carveMountainLine(hex, bestS);
                carved = true;
                break owLoop;
            }
        }
        if(!carved) break;
    }
    wodMarkTerrainFullDirty();
}
function softenMountainHexBetweenOwners(ownerIds) {
    if(!ownerIds || ownerIds.length < 2) return;
    let valid = new Set(ownerIds);
    let maxCarves = 16;
    let n = 0;
    for(let hex of gameData.hexList) {
        if(n >= maxCarves) break;
        if(hex.owner < 1 || !valid.has(hex.owner)) continue;
        for(let dir of cardinalHexDirections) {
            if(n >= maxCarves) break;
            let oth = wodHexAt(hex.q + dir.q,hex.r + dir.r);
            if(!oth || oth.owner === hex.owner || oth.owner === 0) continue;
            if(hex.type === 'mountain' || oth.type === 'mountain') {
                carveMountainLine(hex, oth);
                n++;
            }
        }
    }
}
/** Nearest passable land hexes between two owners — grid buckets, not n². */
function wodClosestOwnedLandPair(o1, o2, passable) {
    let aList = [];
    let bList = [];
    for(let h of gameData.hexList) {
        if(!passable(h)) continue;
        if(h.owner === o1) aList.push(h);
        else if(h.owner === o2) bList.push(h);
    }
    if(!aList.length || !bList.length) return null;
    let probes = aList;
    let cloud = bList;
    if(aList.length > bList.length) {
        probes = bList;
        cloud = aList;
    }
    let cell = Math.max((gameData.hexRadius || 10) * 4, 28);
    let buckets = new Map();
    for(let h of cloud) {
        let bx = (h.x / cell) | 0;
        let by = (h.y / cell) | 0;
        let k = bx + ',' + by;
        let arr = buckets.get(k);
        if(!arr) {
            arr = [];
            buckets.set(k, arr);
        }
        arr.push(h);
    }
    let bestA = null, bestB = null, bestD = Infinity;
    for(let pi = 0; pi < probes.length; pi++) {
        let a = probes[pi];
        let bx = (a.x / cell) | 0;
        let by = (a.y / cell) | 0;
        let radLimit = bestD === Infinity ? 96 : Math.min(96, ((Math.sqrt(bestD) / cell) | 0) + 2);
        for(let dx = -radLimit; dx <= radLimit; dx++) {
            for(let dy = -radLimit; dy <= radLimit; dy++) {
                let arr = buckets.get((bx + dx) + ',' + (by + dy));
                if(!arr) continue;
                for(let bi = 0; bi < arr.length; bi++) {
                    let b = arr[bi];
                    let ddx = a.x - b.x, ddy = a.y - b.y;
                    let d = ddx * ddx + ddy * ddy;
                    if(d < bestD) {
                        bestD = d;
                        bestA = a;
                        bestB = b;
                    }
                }
            }
        }
    }
    if(!bestA || !bestB) return null;
    if(bestA.owner === o1) return { a: bestA, b: bestB };
    return { a: bestB, b: bestA };
}
async function ensureOwnersReachableByLand(ownerIds) {
    if(!ownerIds || ownerIds.length < 2) return;
    let fake = {type: 'light', owner: 1};
    function passable(h) {
        return h && !isWaterHex(h) && canUnitEnterHex(fake, h);
    }
    for(let i = 0; i < ownerIds.length; i++) {
        let o1 = ownerIds[i];
        for(let j = i + 1; j < ownerIds.length; j++) {
            let o2 = ownerIds[j];
            let starts = [];
            let goalKeys = new Set();
            for(let h of gameData.hexList) {
                if(!passable(h)) continue;
                if(h.owner === o1) starts.push(h);
                if(h.owner === o2) goalKeys.add(getHexKey(h));
            }
            if(starts.length === 0 || goalKeys.size === 0) continue;
            let queue = starts.slice();
            let qi = 0;
            let seen = new Set();
            for(let s of starts) seen.add(getHexKey(s));
            let connected = false;
            while(qi < queue.length) {
                let cur = queue[qi++];
                if(goalKeys.has(getHexKey(cur))) {
                    connected = true;
                    break;
                }
                for(let nb of getNeighborHexes(cur)) {
                    if(!passable(nb)) continue;
                    let nk = getHexKey(nb);
                    if(seen.has(nk)) continue;
                    seen.add(nk);
                    queue.push(nb);
                }
            }
            if(connected) continue;
            // Old code scanned every o1×o2 land pair (n²) and hung 3+ AI mapgen.
            let pair = wodClosestOwnedLandPair(o1, o2, passable);
            if(pair) carveMountainLine(pair.a, pair.b);
            await wodMapGenYieldSlice();
        }
    }
    wodMarkTerrainFullDirty();
}
