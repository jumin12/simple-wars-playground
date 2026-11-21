// Balanced procedural maps: every player starts on the same ground.
// Part of the game script; loaded by index.html in a fixed order (see the list there).
//
// A balanced map is symmetric under turning it about its centre by one player's share (half a turn for
// two players, a third for three, a quarter for four; two-against-two continents are two copies of one
// continent that is itself symmetric). The terrain worker (map-gen-worker.js) builds the fields that
// way; this file keeps the map symmetric through the page's own terrain passes and builds borders,
// towns and starting armies for one player that the others receive turned onto their side.
//
// Bookkeeping: every cell has a representative cell (rep) and the group element (repK) that carries
// the representative onto it. A symmetric map is one where each cell equals its representative seen
// through repK: the same terrain, and the owner moved by that element's player permutation.
// "Copy" enforces that from the representatives; "closure" takes the changes a pass made anywhere and
// applies each one to all of its images, so repairs (mountain passes, coast fixes) happen for everybody.

/** Symmetry for a new map of this shape and player count, or null for a free-form map. */
function wodMapSymSpecFor(mapShape, factionCount) {
    if(gameData._wodDisableSymMapGen || gameData._wodSymFallback) return null;
    const n = factionCount | 0;
    if(n < 2 || n > 4 || !wodIsProcGenMapShape(mapShape)) return null;
    const rnd = Math.random;
    if(mapShape === 'continents') {
        // two players: one continent each, turned half round; four: two continents of two
        if(n === 2) return { type: 'rot', n: 2, phase: 0 };
        if(n === 4) return { type: 'cont4', phase: -Math.PI / 2 };
        // three players: one continent each, a third of a turn apart
        return { type: 'rot', n: 3, phase: rnd() * Math.PI * 2 / 3 };
    }
    if(n === 2) return { type: 'rot', n: 2, phase: (rnd() - 0.5) * 1.2 };
    if(n === 3) return { type: 'rot', n: 3, phase: rnd() * Math.PI * 2 / 3 };
    return { type: 'rot', n: 4, phase: rnd() * Math.PI / 2 };
}
/** The land share band generateMap accepts for this shape (wodMapLandFractionAcceptable). */
function wodMapLandFractionBand(mapShape) {
    let p = gameData._mapSizePreset || wodMapSizePreset(gameData.mapRadius);
    let minF = p.landFracMin, maxF = p.landFracMax;
    if(wodMapShapeUsesRectanglePipeline(mapShape)) { minF += 0.1; maxF = Math.max(maxF + 0.14, 0.88); }
    else if(mapShape === 'archipelago') { minF = 0.11; maxF = Math.min(0.36, maxF - 0.08); }
    else if(mapShape === 'ring') { minF = Math.max(0.18, minF - 0.08); maxF = Math.min(0.42, maxF - 0.04); }
    else if(mapShape === 'continents') { minF = 0.22; maxF = 0.52; }
    minF = Math.max(0.08, minF - 0.03);
    maxF = Math.min(wodMapShapeUsesRectanglePipeline(mapShape) ? 0.94 : 0.72, maxF + 0.04);
    return [minF, maxF];
}
/** Build the symmetry tables for the map just made from the worker's cells. */
function wodSymInit(spec, cols, rows) {
    gameData._mapSym = null;
    if(!spec || typeof WodTerrainGen === 'undefined' || !WodTerrainGen.buildSymGroup) return null;
    const G = WodTerrainGen.buildSymGroup(spec, cols, rows);
    const cells = new Array(G.N);
    for(const h of gameData.hexList) {
        if(h.q < -cols || h.q > cols || h.r < -rows || h.r > rows) continue;
        cells[(h.r + rows) * G.W + (h.q + cols)] = h;
    }
    for(let i = 0; i < G.N; i++) if(!cells[i]) return null;
    // fibre of a representative: the cells that copy it, with the element that carries it there
    const fibre = new Map();
    for(let i = 0; i < G.N; i++) {
        const r = G.rep[i];
        if(G.outside[i] || r === i) continue;
        if(!fibre.has(r)) fibre.set(r, []);
        fibre.get(r).push(i);
    }
    const S = {
        spec, G, cols, rows, cells, fibre, sp: gameData.hexRadius * 1.35, hexes: gameData.hexes,
        players: G.players, exact: G.exact, ownerOfIdx: null, idxOfOwner: null, cityImage: new Map()
    };
    gameData._mapSym = S;
    return S;
}
function wodSymActive() {
    const S = gameData._mapSym;
    return S && S.hexes === gameData.hexes ? S : null;
}
/** Index of a cell in the symmetry tables (rows of the grid, top to bottom). */
function wodSymIndexOf(S, h) {
    if(!h || h.q < -S.cols || h.q > S.cols || h.r < -S.rows || h.r > S.rows) return -1;
    return (h.r + S.rows) * S.G.W + (h.q + S.cols);
}
/** The group element that takes player index a to player index b. */
function wodSymElementBetween(S, a, b) {
    for(let k = 0; k < S.G.order; k++) if(S.G.perm[k][a] === b) return k;
    return 0;
}
/** Owner seen through element k (owner 0, water and unknown owners stay as they are). */
function wodSymMoveOwner(S, owner, k) {
    if(!(owner > 0) || !S.ownerOfIdx || !k) return owner;
    const i = S.idxOfOwner.get(owner);
    if(i == null) return owner;
    return S.ownerOfIdx[S.G.perm[k][i]];
}
/** The cell that cell index i is carried onto by element k (exact groups: exact; three players: nearest). */
function wodSymImageIndex(S, i, k) {
    if(!k) return i;
    return S.G.img[k][i];
}
/** Symmetric noise for the page's own terrain passes: fbm(x*s+o, y*s+o) on free maps, the same field
 *  seen from the nearest player's side (and faded between sides) on balanced ones. */
function wodGenFbm(x, y, s, o, oct) {
    const T = typeof WodTerrainGen !== 'undefined' ? WodTerrainGen : null;
    const f = T ? T.fbm : fbm;
    const S = wodSymActive();
    if(!S || !T) return f(x * s + o, y * s + o, oct);
    return T.symField(S.G, S.sp, (px, py) => f(px * s + o, py * s + o, oct), x, y, T.FBM_MEAN[oct] || 0.5);
}
function wodSymCellState(h) {
    return { type: h.type, river: !!h._river, owner: h.owner, cityId: h.cityId, urbanVariant: h.urbanVariant };
}
function wodSymApplyState(S, h, st, k, withOwner) {
    // (three players: copies are nearest cells, so a town's own cells are never overwritten by terrain)
    if(!S.exact && (h.type === 'urban') !== (st.type === 'urban')) {
        if(withOwner && h.type !== 'urban') h.owner = isWaterHex(h) ? 0 : wodSymMoveOwner(S, st.owner, k);
        return;
    }
    if(h.type !== st.type) wodSetGeneratedTerrainType(h, st.type);
    if(st.type === 'urban') {
        h.baseColor = getUrbanTerrainColor(wodGetGamePeriod());
        h.renderColor = h.baseColor;
    }
    if(st.river) h._river = true; else if(h._river) delete h._river;
    if(st.cityId) {
        const m = S.cityImage.get(st.cityId);
        h.cityId = m ? m[k] : st.cityId;
        if(h.urbanVariant == null) h.urbanVariant = st.urbanVariant;
    } else if(h.cityId && st.type !== 'urban') delete h.cityId;
    if(withOwner) h.owner = isWaterHex(h) ? 0 : wodSymMoveOwner(S, st.owner, k);
}
/** Make every cell equal its representative (terrain, and owners when asked). */
function wodSymCopy(withOwner) {
    const S = wodSymActive();
    if(!S) return;
    const G = S.G;
    for(let i = 0; i < G.N; i++) {
        const h = S.cells[i];
        if(G.outside[i]) {
            if(!isWaterHex(h)) wodSetGeneratedTerrainType(h, 'water');
            if(withOwner) h.owner = 0;
            continue;
        }
        const r = G.rep[i];
        if(r === i) continue;
        wodSymApplyState(S, h, wodSymCellState(S.cells[r]), G.repK[i], withOwner);
    }
    if(withOwner) wodMarkTerrainPoliticalDirty();
}
function wodSymSnapshot(S) {
    const snap = new Array(S.G.N);
    for(let i = 0; i < S.G.N; i++) snap[i] = wodSymCellState(S.cells[i]);
    return snap;
}
function wodSymStateDiffers(a, b, withOwner) {
    return a.type !== b.type || a.river !== b.river || a.cityId !== b.cityId || (withOwner && a.owner !== b.owner);
}
/** Run a pass and hand every change it made to all images of the changed cell. Changes at
 *  representatives win over changes elsewhere in the same orbit. */
async function wodSymClosure(pass, withOwner) {
    const S = wodSymActive();
    if(!S) return pass();
    const G = S.G, before = wodSymSnapshot(S);
    const out = await pass();
    const done = new Uint8Array(G.N);
    const broadcast = (r, st) => {
        done[r] = 1;
        wodSymApplyState(S, S.cells[r], st, 0, withOwner);
        const fib = S.fibre.get(r);
        if(fib) for(const j of fib) wodSymApplyState(S, S.cells[j], st, G.repK[j], withOwner);
    };
    for(let i = 0; i < G.N; i++) {
        if(G.outside[i] || G.rep[i] !== i) continue;
        const now = wodSymCellState(S.cells[i]);
        if(wodSymStateDiffers(now, before[i], withOwner)) broadcast(i, now);
    }
    for(let i = 0; i < G.N; i++) {
        if(G.outside[i]) continue;
        const r = G.rep[i];
        if(r === i || done[r]) continue;
        const now = wodSymCellState(S.cells[i]);
        if(!wodSymStateDiffers(now, before[i], withOwner)) continue;
        // seen back from the representative's side
        const back = Object.assign({}, now);
        if(withOwner) back.owner = wodSymMoveOwner(S, now.owner, G.inv[G.repK[i]]);
        if(back.cityId) {
            for(const [id, m] of S.cityImage) if(m[G.repK[i]] === back.cityId) { back.cityId = id; break; }
        }
        broadcast(r, back);
    }
    // a representative's own later change of the same orbit already won; copy keeps the rest consistent
    wodSymCopy(withOwner);
    return out;
}
/** Run a terrain pass, then copy from the representatives (passes whose small differences between
 *  players come only from tie-breaks and random picks). */
async function wodSymAfterCopy(pass) {
    const out = await pass();
    if(wodSymActive()) wodSymCopy(false);
    return out;
}
/** Diagonal-only joins resolved for every player alike (wodResolveGeneratedTerrainCorners, repeated
 *  through closure until a round makes no change). */
async function wodSymResolveTerrainCorners() {
    if(!wodSymActive()) return wodResolveGeneratedTerrainCorners();
    let total = 0;
    for(let round = 0; round < 8; round++) {
        const res = await wodSymClosure(() => wodResolveGeneratedTerrainCorners(), false);
        if(!res.ok) return res;
        total += res.changed;
        if(!res.changed) return { ok: true, changed: total };
    }
    return { ok: false, changed: total };
}

// ------------------------------------------------------------------ borders, towns and armies

/** Cell indices of the seed of every player, from player 0's seed. */
function wodSymSeedsFrom(S, seed0, okCell) {
    const G = S.G, out = [];
    for(let p = 0; p < S.players; p++) {
        const k = wodSymElementBetween(S, 0, p);
        let i = wodSymImageIndex(S, seed0, k);
        if(i < 0 || !okCell(S.cells[i])) {
            if(G.exact) return null;
            // three players: the nearest usable cell to the turned point
            const h0 = S.cells[seed0], A = (Math.PI * 2) / S.players * k;
            const tq = h0.q * Math.cos(A) - h0.r * Math.sin(A), tr = h0.q * Math.sin(A) + h0.r * Math.cos(A);
            let best = -1, bd = Infinity;
            for(let dq = -3; dq <= 3; dq++) for(let dr = -3; dr <= 3; dr++) {
                const h = wodHexAt(Math.round(tq) + dq, Math.round(tr) + dr);
                if(!h || !okCell(h)) continue;
                const d = (h.q - tq) ** 2 + (h.r - tr) ** 2;
                if(d < bd) { bd = d; best = wodSymIndexOf(S, h); }
            }
            if(best < 0) return null;
            i = best;
        }
        out.push(i);
    }
    return out;
}
/** Player 0's seed: on the main landmass, along player 0's direction from the centre. */
function wodSymPickSeed(S, mapShape, mainSet, okCell, attempt) {
    const gp = gameData._genProfile || {}, sp = S.sp;
    if(mapShape === 'archipelago') {
        const isl = gameData._wodArchIslands || [];
        const home = isl.find(it => it.kind === 'home' && it.player === 0);
        if(!home) return -1;
        let best = -1, bd = Infinity;
        for(const h of gameData.hexList) {
            if(!okCell(h)) continue;
            const d = (h.q - home.q) ** 2 + (h.r - home.r) ** 2;
            if(d < bd) { bd = d; best = wodSymIndexOf(S, h); }
        }
        return best;
    }
    let cx = 0, cy = 0, dirX, dirY;
    if(S.spec.type === 'cont4') {
        // left continent, its upper half (the continent is centred half a cell above row 0)
        cx = -((S.cols + 1) / 2) * sp; cy = -0.5 * sp;
        dirX = Math.cos(S.spec.phase); dirY = Math.sin(S.spec.phase);
    } else if(mapShape === 'continents') {
        dirX = Math.cos(S.spec.phase); dirY = Math.sin(S.spec.phase);
    } else {
        // later attempts lean the start a little to either side of the player's direction
        const lean = attempt ? ((attempt & 1) ? 1 : -1) * Math.min(0.3, 0.12 * Math.ceil(attempt / 2)) * (Math.PI * 2 / S.players) : 0;
        dirX = Math.cos(S.spec.phase + lean); dirY = Math.sin(S.spec.phase + lean);
    }
    // walk out from the centre; take the cell part way through the land on that ray
    const hits = [];
    for(let t = 0; t < (S.cols + S.rows) * 1.2; t += 0.5) {
        const h = getNearestHexToPoint(cx + dirX * t * sp, cy + dirY * t * sp);
        if(!h) break;
        if(okCell(h) && (mapShape === 'continents' || mainSet.has(h))) hits.push({ h, t });
    }
    if(!hits.length) return -1;
    const ring = mapShape === 'ring';
    const frac = ring ? 0.5 : mapShape === 'continents' ? 0.5 : 0.56 + ((attempt | 0) % 3) * 0.06;
    const t0 = hits[0].t, t1 = hits[hits.length - 1].t, want = t0 + (t1 - t0) * frac;
    let best = hits[0], bd = Infinity;
    for(const it of hits) { const d = Math.abs(it.t - want); if(d < bd) { bd = d; best = it; } }
    return wodSymIndexOf(S, best.h);
}
/** One owner per landmass region, joined by shared edges: stray bits join the neighbour they touch most. */
function wodSymJoinStrayOwnerBits(owners, landmasses, seedCells) {
    const valid = new Set(owners), seedOf = new Map();
    for(const h of seedCells) seedOf.set(h, h.owner);
    let changed = 0;
    for(let round = 0; round < 6; round++) {
        let moved = 0;
        for(const cells of landmasses) {
            const seen = new Set();
            const regions = new Map();
            for(const start of cells) {
                if(seen.has(start) || !valid.has(start.owner)) continue;
                const o = start.owner, list = [start];
                seen.add(start);
                let hasSeed = false;
                for(let i = 0; i < list.length; i++) {
                    if(seedOf.has(list[i])) hasSeed = true;
                    for(const d of cardinalHexDirections) {
                        const n = wodHexAt(list[i].q + d.q, list[i].r + d.r);
                        if(n && !isWaterHex(n) && n.owner === o && !seen.has(n)) { seen.add(n); list.push(n); }
                    }
                }
                if(!regions.has(o)) regions.set(o, []);
                regions.get(o).push({ list, hasSeed });
            }
            for(const [o, list] of regions) {
                if(list.length < 2) continue;
                list.sort((a, b) => (b.hasSeed - a.hasSeed) || (b.list.length - a.list.length));
                for(const reg of list.slice(1)) {
                    const votes = new Map();
                    for(const h of reg.list) for(const d of cardinalHexDirections) {
                        const n = wodHexAt(h.q + d.q, h.r + d.r);
                        if(n && !isWaterHex(n) && valid.has(n.owner) && n.owner !== o) votes.set(n.owner, (votes.get(n.owner) || 0) + 1);
                    }
                    let to = 0, tv = -1;
                    for(const [w, v] of votes) if(v > tv || (v === tv && w < to)) { tv = v; to = w; }
                    if(!to) continue;
                    for(const h of reg.list) h.owner = to;
                    moved += reg.list.length;
                }
            }
        }
        changed += moved;
        if(!moved) break;
    }
    return changed;
}
/** Split the land between the players: each landmass that holds starts is split by walking distance
 *  from them, with a slow wave so the frontiers are not ruler lines; other landmasses go whole to the
 *  nearest start, or (shared islands in the middle) are split by plain distance. */
function wodSymPartition(S, owners, seeds, landmasses) {
    const G = S.G, sp = S.sp, n = S.players;
    const seedHex = seeds.map(i => S.cells[i]);
    const massOf = new Map();
    landmasses.forEach((cells, m) => { for(const h of cells) massOf.set(h, m); });
    const mapSeed = (gameData._mapGenSeed >>> 0) || 1;
    const ph = ((Math.imul(mapSeed, 0x9e3779b1) >>> 0) / 4294967296) * Math.PI * 2;
    // wave seen from player p's side: the wave at the cell turned back onto player 0's side
    const back = [];
    for(let p = 0; p < n; p++) back.push(G.inv[wodSymElementBetween(S, 0, p)]);
    const wave = (h, p) => {
        let x = h.x, y = h.y;
        const k = back[p];
        if(k) {
            const j = wodSymImageIndex(S, wodSymIndexOf(S, h), k);
            if(j >= 0) { x = S.cells[j].x; y = S.cells[j].y; }
        }
        return Math.sin(x / (sp * 10.5) + ph) * Math.cos(y / (sp * 8.5) + ph * 1.7) * 1.7 +
            Math.sin((x + y) / (sp * 6.5) + ph * 2.3) * 0.6;
    };
    const ownerOf = p => S.ownerOfIdx[p];
    landmasses.forEach((cells, m) => {
        const here = [];
        for(let p = 0; p < n; p++) if(massOf.get(seedHex[p]) === m) here.push(p);
        if(here.length === 1) { for(const h of cells) h.owner = ownerOf(here[0]); return; }
        if(here.length > 1) {
            const grid = wodBuildLandPathGrid(cells);
            const dist = here.map(p => wodLandPathField(grid, grid.idx(seedHex[p].q, seedHex[p].r)));
            for(let i = 0; i < grid.n; i++) {
                let best = 0, bv = Infinity;
                for(let a = 0; a < here.length; a++) {
                    const v = dist[a][i] + wave(cells[i], here[a]);
                    if(v < bv) { bv = v; best = a; }
                }
                cells[i].owner = ownerOf(here[best]);
            }
            return;
        }
        // No start on it: whole to the nearest start (a townless island is never split). One as near
        // to two starts as to each other (in the middle of the map) cannot go to either fairly: it sinks.
        let cx = 0, cy = 0;
        for(const h of cells) { cx += h.x; cy += h.y; }
        cx /= cells.length; cy /= cells.length;
        const ds = seedHex.map(s => Math.hypot(s.x - cx, s.y - cy));
        const order = ds.map((d, p) => p).sort((a, b) => ds[a] - ds[b]);
        if(n > 1 && ds[order[1]] - ds[order[0]] < sp * 0.75) {
            for(const h of cells) { wodSetGeneratedTerrainType(h, 'water'); delete h._river; h.owner = 0; }
            return;
        }
        for(const h of cells) h.owner = ownerOf(order[0]);
    });
}
/** Steps inward from the owner's frontier with another player (cells away from any foreign border). */
function wodSymInteriorDepth(owner) {
    const depth = new Map(), queue = [];
    for(const h of gameData.hexList) {
        if(h.owner !== owner || isWaterHex(h)) continue;
        if(getNeighborHexes(h).some(n => n && !isWaterHex(n) && n.owner > 0 && n.owner !== owner)) { depth.set(h, 0); queue.push(h); }
    }
    for(let i = 0; i < queue.length; i++) for(const n of getNeighborHexes(queue[i])) {
        if(!n || n.owner !== owner || isWaterHex(n) || depth.has(n)) continue;
        depth.set(n, depth.get(queue[i]) + 1);
        queue.push(n);
    }
    return h => depth.has(h) ? depth.get(h) : 99;
}
/** Plan player 0's towns; every other player's towns are their images. Returns [{cell, port}] or null. */
function wodSymPlanTowns(S, mapShape, want, sep, landmasses, mainSet, seedCell) {
    const G = S.G, owner0 = S.ownerOfIdx[0], n = S.players;
    const depthOf = wodSymInteriorDepth(owner0), water = wodWaterDistanceField();
    const massOf = new Map();
    landmasses.forEach((cells, m) => { for(const h of cells) massOf.set(h, m); });
    // landmasses player 0 holds whole, or shares with every player (the turned copies of a town on a
    // shared landmass are on it too, so everybody there has a town there)
    const wholeMass = new Set();
    landmasses.forEach((cells, m) => { if(cells.every(h => h.owner === owner0)) wholeMass.add(m); });
    const isContShape = mapShape === 'continents';
    const mainMass = isContShape && seedCell ? massOf.get(seedCell) : mainSet && mainSet.size ? massOf.get(mainSet.values().next().value) : -1;
    const oceanKeys = wodBuildOceanConnectedWaterKeys(S.cols, S.rows);
    const archi = mapShape === 'archipelago', radial = wodMapShapeIsRadialForTownPolicy(mapShape);
    const isCont = mapShape === 'continents';
    const minSea = archi ? 2 : radial ? 4 : 3, minDepth = archi ? 1 : 3;
    const imagesOf = i => {
        const out = [];
        for(let p = 1; p < n; p++) {
            const j = wodSymImageIndex(S, i, wodSymElementBetween(S, 0, p));
            if(j >= 0) out.push(S.cells[j]);
        }
        return out;
    };
    const cheb = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r));
    const slack = G.exact ? 0 : 2;
    const footprintOk = h => wodProceduralUrbanFootprintKeys(h.q, h.r, owner0) !== null;
    const legal = (h, level) => {
        if(!h || h.owner !== owner0 || isWaterHex(h) || h.type === 'mountain' || h.type === 'urban') return false;
        const m = massOf.get(h);
        if(archi) { if(!wholeMass.has(m)) return false; }
        else if(level === 0 && !isCont && m !== mainMass) return false;
        else if(!wholeMass.has(m) && m !== mainMass) return false;
        if(depthOf(h) < minDepth) return false;
        if((water.get(h) ?? 99) < minSea) return false;
        return true;
    };
    const portLegal = h => {
        if(!h || h.owner !== owner0 || isWaterHex(h) || h.type === 'mountain' || h.type === 'urban') return false;
        if(depthOf(h) < 3) return false;
        const nb = getNeighborHexes(h);
        if(nb.length < 8 || nb.some(x => isWaterHex(x) || x.type === 'mountain' || x.owner !== owner0)) return false;
        if((water.get(h) ?? 99) !== 2) return false;
        // open sea two cells off (a harbour needs the sea, not a river or a lake)
        for(let dq = -2; dq <= 2; dq++) for(let dr = -2; dr <= 2; dr++) {
            if(dq * dq + dr * dr < 4) continue;
            const w = wodHexAt(h.q + dq, h.r + dr);
            if(w && isWaterHex(w) && oceanKeys.has(getHexKey(w))) return true;
        }
        return false;
    };
    // the sites the towns aim for
    let sites;
    if(archi) {
        const isl = (gameData._wodArchIslands || []).filter(it => it.player === 0 && it.towns > 0)
            .sort((a, b) => (a.kind === 'home' ? 0 : 1) - (b.kind === 'home' ? 0 : 1));
        sites = [];
        for(const it of isl) {
            if(it.towns >= 2) {
                // two towns on the home island: either side of its middle, along its long way
                const off = Math.max(4.2, it.rad * it.asp * 0.5), ang = it.ang;
                sites.push({ q: it.q + Math.cos(ang) * off, r: it.r + Math.sin(ang) * off });
                sites.push({ q: it.q - Math.cos(ang) * off, r: it.r - Math.sin(ang) * off });
            } else sites.push({ q: it.q, r: it.r });
        }
        // more towns than islands planned: spread the rest over the player's land
        if(sites.length < want) {
            for(const s of wodTownSpreadSites(owner0, want)) sites.push({ q: s.x / S.sp, r: s.y / S.sp });
        }
        sites = sites.slice(0, want).map(s => ({ x: s.q * S.sp, y: s.r * S.sp }));
    } else sites = wodTownSpreadSites(owner0, want);
    if(sites.length < want) return null;
    // a port: continents (the only way to the enemy), islands and rings (the coast is half the game)
    const portLevel = (isCont || mapShape === 'island' || mapShape === 'ring') ? want - 1 : -1;
    const placed = [], blocked = [];
    const cand = [];
    for(const h of gameData.hexList) if(h.owner === owner0 && !isWaterHex(h) && h.type !== 'mountain') cand.push(h);
    let farSea = null;
    if(isCont) {
        // ports face the other continent
        const mine = new Set(gameData.hexList.filter(h => h.owner === owner0 && !isWaterHex(h)).map(h => massOf.get(h)));
        const steps = new Map(), queue = [];
        for(const h of gameData.hexList) {
            if(!isWaterHex(h)) continue;
            if(getNeighborHexes(h).some(x => !isWaterHex(x) && !mine.has(massOf.get(x)))) { steps.set(h, 0); queue.push(h); }
        }
        for(let i = 0; i < queue.length; i++) for(const x of getNeighborHexes(queue[i]))
            if(isWaterHex(x) && !steps.has(x)) { steps.set(x, steps.get(queue[i]) + 1); queue.push(x); }
        farSea = h => {
            let best = Infinity;
            for(let dq = -2; dq <= 2; dq++) for(let dr = -2; dr <= 2; dr++) {
                const w = wodHexAt(h.q + dq, h.r + dr);
                if(w && steps.has(w)) best = Math.min(best, steps.get(w));
            }
            return best;
        };
    }
    for(let lv = 0; lv < want; lv++) {
        const site = sites[lv];
        const isPort = lv === portLevel;
        let pool = cand.filter(h => isPort ? portLegal(h) : legal(h, lv));
        if(isPort && farSea) {
            let nearest = Infinity;
            const sea = new Map();
            for(const h of pool) { const v = farSea(h); sea.set(h, v); nearest = Math.min(nearest, v); }
            pool = pool.filter(h => sea.get(h) <= nearest + Math.max(4, nearest * 0.5));
        }
        if(!pool.length && isPort) pool = cand.filter(h => legal(h, lv));
        pool.sort((a, b) => ((a.x - site.x) ** 2 + (a.y - site.y) ** 2) - ((b.x - site.x) ** 2 + (b.y - site.y) ** 2) || a.q - b.q || a.r - b.r);
        let pick = null;
        for(const h of pool) {
            if(!footprintOk(h) && !isPort) continue;
            const imgs = imagesOf(wodSymIndexOf(S, h));
            if(imgs.length !== n - 1) continue;
            // apart from every town so far and its copies, and from its own copies
            if(blocked.some(b => cheb(b, h) < sep + slack)) continue;
            if(imgs.some(x => cheb(x, h) < sep + slack)) continue;
            pick = h;
            break;
        }
        if(!pick) return null;
        placed.push({ cell: pick, port: isPort });
        blocked.push(pick, ...imagesOf(wodSymIndexOf(S, pick)));
    }
    return placed;
}
/** Stamp player 0's towns and their copies for every other player. */
function wodSymStampTowns(S, plan) {
    const G = S.G, n = S.players;
    gameData.cities = [];
    S.cityImage = new Map();
    let ix = 0;
    const urbanColor = getUrbanTerrainColor(wodGetGamePeriod());
    const make = (h, owner) => ({
        id: 'city_' + (++ix), name: generateCityName(), x: h.x, y: h.y, q: h.q, r: h.r, owner,
        hasFactory: false, hasHarbor: false, hasFarm: false, hp: 1000, maxHp: 1000,
        urbanStyle: null, incomeBonus: 0, manpowerBonus: 0
    });
    const oceanKeys = wodBuildOceanConnectedWaterKeys(S.cols, S.rows);
    for(const site of plan) {
        const h0 = site.cell, owner0 = S.ownerOfIdx[0];
        const town0 = make(h0, owner0);
        stampOwnedRandomUrbanTerrainAroundCity(h0, town0, owner0);
        if(site.port) {
            // a quay on the open sea, so the port can always build a harbour
            let gap = null, gapD = Infinity;
            for(let dq = -2; dq <= 2; dq++) for(let dr = -2; dr <= 2; dr++) {
                const w = wodHexAt(h0.q + dq, h0.r + dr), d = dq * dq + dr * dr;
                if(w && d >= 4 && d < gapD && isWaterHex(w) && oceanKeys.has(getHexKey(w))) { gapD = d; gap = { dq, dr }; }
            }
            if(gap) {
                const quay = wodHexAt(h0.q + Math.round(gap.dq / 2), h0.r + Math.round(gap.dr / 2));
                if(quay && !isWaterHex(quay) && quay.type !== 'mountain' && quay.owner === owner0) {
                    quay.type = 'urban'; quay.cityId = town0.id;
                    if(quay.urbanVariant == null) quay.urbanVariant = 0;
                    quay.baseColor = urbanColor; quay.renderColor = urbanColor;
                }
            }
        }
        const footprint = gameData.hexList.filter(h => h.cityId === town0.id);
        gameData.cities.push(town0);
        const ids = new Array(G.order).fill(null);
        ids[0] = town0.id;
        for(let p = 1; p < n; p++) {
            const k = wodSymElementBetween(S, 0, p), owner = S.ownerOfIdx[p];
            const ci = wodSymImageIndex(S, wodSymIndexOf(S, h0), k);
            if(ci < 0) return false;
            const hc = S.cells[ci];
            const town = make(hc, owner);
            // (town style and building variants only change the look: each copy gets its own)
            town.urbanStyle = Math.floor(Math.random() * 4);
            ids[k] = town.id;
            for(const f of footprint) {
                const fi = wodSymImageIndex(S, wodSymIndexOf(S, f), k);
                if(fi < 0) continue;
                const t = S.cells[fi];
                if(isWaterHex(t) || t.type === 'mountain' || t.cityId || t.owner !== owner) continue;
                t.type = 'urban'; t.cityId = town.id; t.urbanVariant = Math.floor(Math.random() * 5);
                t.baseColor = urbanColor; t.renderColor = urbanColor;
            }
            // the centre is always a town cell
            if(!hc.cityId && !isWaterHex(hc) && hc.owner === owner) {
                hc.type = 'urban'; hc.cityId = town.id; hc.urbanVariant = h0.urbanVariant || 0;
                hc.baseColor = urbanColor; hc.renderColor = urbanColor;
            }
            gameData.cities.push(town);
        }
        S.cityImage.set(town0.id, ids);
        // images of the copies (needed when a pass changes a copy's town cell)
        for(let k = 1; k < G.order; k++) {
            if(!ids[k]) continue;
            const m = new Array(G.order);
            for(let j = 0; j < G.order; j++) {
                // element j applied to the copy made by k is the copy made by (j * k)
                const p0 = G.perm[k][0], pj = G.perm[j][p0];
                const kk = wodSymElementBetween(S, 0, pj);
                m[j] = ids[kk];
            }
            S.cityImage.set(ids[k], m);
        }
    }
    for(const c of gameData.cities) delete c._urbanHexCache;
    return true;
}
/**
 * Balanced counterpart of wodProceduralVoronoiBordersThenCitiesSameCount: same contract (terrain is
 * final; on success towns and borders are set and gameData._wodProcgenBorderFirstApplied is true).
 */
async function wodSymBordersThenCities(cols, rows, mapShape, attempt) {
    const S = wodSymActive();
    gameData._wodProcgenBorderFirstApplied = false;
    if(!S) return false;
    if(!(gameData.mp && gameData.mp.enabled)) wodSyncAiCountForMapGen();
    const owners = [...wodOwnersListActiveForProcgen()].sort((a, b) => a - b);
    const fail = reason => { gameData._startingBorderQuality = { ok: false, reason }; return false; };
    if(owners.length !== S.players) return fail('sym-players');
    const n = S.players, G = S.G;
    // seats onto sides: turned by the map seed and the attempt, so no seat has a fixed side
    const rnd = wodMulberry32((((gameData._mapGenSeed >>> 0) || 1) ^ Math.imul((attempt | 0) + 1, 0x85ebca6b)) >>> 0);
    const turn = Math.floor(rnd() * n);
    S.ownerOfIdx = owners.map((_, i) => owners[(i + turn) % n]);
    S.idxOfOwner = new Map(S.ownerOfIdx.map((o, i) => [o, i]));
    gameData.cities = [];
    for(const h of gameData.hexList) {
        h.owner = 0;
        if(h.type === 'urban') wodSetGeneratedTerrainType(h, 'grass');
        delete h.cityId;
        delete h.urbanVariant;
    }
    S.cityImage = new Map();
    const landmasses = wodPoliticalLandmasses();
    // the main landmass: the largest passable one (where the shared war is fought)
    const graph = wodStartingLandGraph(), seen = new Set();
    let main = [];
    for(const node of graph.nodes.values()) {
        if(seen.has(node)) continue;
        const comp = [node]; seen.add(node);
        for(let i = 0; i < comp.length; i++) for(const nb of comp[i].neighbors) if(!seen.has(nb)) { seen.add(nb); comp.push(nb); }
        if(comp.length > main.length) main = comp;
    }
    const mainSet = new Set(main.map(nd => nd.hex));
    const okCell = h => h && !isWaterHex(h) && h.type !== 'mountain';
    const seed0 = wodSymPickSeed(S, mapShape, mainSet, okCell, attempt | 0);
    if(seed0 < 0) return fail('sym-seed');
    const seeds = wodSymSeedsFrom(S, seed0, okCell);
    if(!seeds || new Set(seeds).size !== n) return fail('sym-seed');
    // 1. land
    wodSymPartition(S, owners, seeds, landmasses);
    wodSymCopy(true);
    wodSymJoinStrayOwnerBits(owners, landmasses, seeds.map(i => S.cells[i]));
    wodSymCopy(true);
    wodBluntBorderTips(owners, 2, landmasses);
    wodSymCopy(true);
    wodSymJoinStrayOwnerBits(owners, landmasses, seeds.map(i => S.cells[i]));
    wodSymCopy(true);
    const referenceFrontier = wodStartingFrontierLength();
    // 2. towns
    const want = Math.max(1, wodCitiesPerPlayerSetting() - (gameData._wodCityCountRelax | 0));
    let plan = null;
    for(let sep = 10; sep >= 8 && !plan; sep -= 2) plan = wodSymPlanTowns(S, mapShape, want, sep, landmasses, mainSet, S.cells[seeds[0]]);
    if(!plan) return fail('town-placement');
    if(!wodSymStampTowns(S, plan)) return fail('town-placement');
    wodSyncUrbanFootprintOwners();
    wodSymCopy(true);
    // 3. every owned cell reachable from the owner's towns, for every player alike
    await wodSymClosure(() => wodCarveStartingFactionPasses(owners), false);
    await wodSymClosure(async () => { wodRepairStartingLandSupply(owners); }, true);
    wodAssignAllWaterFromNearestLand(true);
    wodSymCopy(true);
    if(G.exact) for(let i = 0; i < G.N; i++) {
        if(G.outside[i] || G.rep[i] !== i || S.fibre.has(i)) continue;
        const h = S.cells[i];
        if(!isWaterHex(h) && !h.cityId && h.owner > 0 && h.owner !== owners[0] &&
            cardinalHexDirections.some(d => { const nb = wodHexAt(h.q + d.q, h.r + d.r); return nb && nb.owner === owners[0]; })) h.owner = owners[0];
    }
    // Three players: the turned copies are only as close as the grid allows (a few cells). Even the
    // land out at the coast first: the frontier balancer would hand whole townless islands about.
    // (Two and four players: only the centre cell, which every turn leaves in place, can be over.)
    {
        const balanced = () => {
            const target = wodBuildLandBalanceTargets(owners), counts = wodCountBalancedLandByOwner(owners);
            return owners.every(o => counts[o] === target[o]);
        };
        if(!G.exact && !balanced()) wodSymEvenCoastLand(owners);
        if(!balanced()) await wodExactEqualizePoliticalLandCounts(owners, gameData.cities, Math.min(360, gameData.hexList.length));
    }
    wodNormalizeStartingCityEconomy(owners);
    wodMarkTerrainPoliticalDirty();
    wodMarkTerrainFullDirty();
    gameData._wodPfVer = (gameData._wodPfVer || 0) + 1;
    gameData._startingBorderQuality = wodValidateStartingBorders(owners, referenceFrontier);
    if(!gameData._startingBorderQuality.ok) return false;
    gameData._wodIslandsUnfair = false; gameData._wodTownsFarApart = false;
    gameData._wodSymFairCheck = true;
    let fair;
    try { fair = wodVerifyFairFactionStart(owners); } finally { gameData._wodSymFairCheck = false; }
    if(!fair) {
        gameData._startingBorderQuality = { ...gameData._startingBorderQuality, ok: false,
            reason: gameData._wodIslandsUnfair ? 'island-balance' : gameData._wodTownsFarApart ? 'town-distance' : 'unbalanced-start' };
        return false;
    }
    gameData._startingBorderQuality.symmetric = S.spec.type + ':' + n;
    gameData._wodProcgenBorderFirstApplied = true;
    return true;
}
/** Even out land counts by the coast alone (three-player maps, whose copies differ by a few cells):
 *  a player above its share loses its most exposed coast cells, one below gains sea cells in the
 *  notches of its own coast. Never a cell that would split land, join land only at a corner, touch
 *  another player's land, or lie in a town. */
function wodSymEvenCoastLand(owners, maxMoves) {
    const RING = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
    const dry = (q, r) => { const n = wodHexAt(q, r); return !!n && !isWaterHex(n); };
    // a cell whose dry neighbours form one unbroken run (and no corner-only join) can change freely
    const simple = (h, asLand) => {
        const ring = RING.map(([dq, dr]) => dry(h.q + dq, h.r + dr));
        let runs = 0, any = false;
        for(let i = 0; i < 8; i++) { if(ring[i]) any = true; if(ring[i] && !ring[(i + 7) & 7]) runs++; }
        if(!any || runs > 1) return false;
        for(let i = 1; i < 8; i += 2) if(ring[i] && !ring[i - 1] && !ring[(i + 1) & 7]) return false;
        if(!asLand) for(let i = 1; i < 8; i += 2) if(!ring[i] && ring[i - 1] && ring[(i + 1) & 7]) return false;
        return true;
    };
    const foreignNear = (h, o) => {
        for(let dq = -2; dq <= 2; dq++) for(let dr = -2; dr <= 2; dr++) {
            const n = wodHexAt(h.q + dq, h.r + dr);
            if(n && !isWaterHex(n) && n.owner > 0 && n.owner !== o) return true;
        }
        return false;
    };
    const nearTown = h => gameData.cities.some(c => Math.max(Math.abs(c.q - h.q), Math.abs(c.r - h.r)) <= 3);
    for(let guard = 0; guard < (maxMoves || 400); guard++) {
        const target = wodBuildLandBalanceTargets(owners), counts = wodCountBalancedLandByOwner(owners);
        const over = owners.find(o => counts[o] > target[o]), under = owners.find(o => counts[o] < target[o]);
        if(!over && !under) return true;
        let done = false;
        if(over) {
            let best = null, bs = -1;
            for(const h of gameData.hexList) {
                if(h.owner !== over || isWaterHex(h) || h.cityId || h.type === 'mountain' || nearTown(h)) continue;
                const wet = getNeighborHexes(h).filter(n => isWaterHex(n)).length;
                if(!wet || !simple(h, false)) continue;
                if(wet > bs) { bs = wet; best = h; }
            }
            if(best) { wodSetGeneratedTerrainType(best, 'water'); best.owner = 0; done = true; }
        }
        if(!done && under) {
            let best = null, bs = -1;
            for(const h of gameData.hexList) {
                if(!isWaterHex(h) || h._river || isBridgeHex(h)) continue;
                const own = cardinalHexDirections.filter(d => { const n = wodHexAt(h.q + d.q, h.r + d.r); return n && !isWaterHex(n) && n.owner === under; }).length;
                if(own < 2 || foreignNear(h, under) || nearTown(h) || !simple(h, true)) continue;
                if(own > bs) { bs = own; best = h; }
            }
            if(best) { wodSetGeneratedTerrainType(best, 'sand'); best.owner = under; done = true; }
        }
        if(!done) return false;
    }
    return false;
}
/** Starting armies: one player's deployment, turned onto every other player's side. */
function wodSymMirrorStartingArmy(ownerIds) {
    const S = wodSymActive();
    if(!S || !S.ownerOfIdx || !ownerIds || ownerIds.length !== S.players) return false;
    if(!ownerIds.every(o => S.idxOfOwner.has(o))) return false;
    // the model is an AI player when there is one (AI towns start with an infantry in them)
    let ref = S.ownerOfIdx.find(o => o > 1 && !(typeof wodMpIsHumanOwner === 'function' && wodMpIsHumanOwner(o))) || S.ownerOfIdx[0];
    const iRef = S.idxOfOwner.get(ref);
    const armyOf = o => gameData.entities.filter(u => u && u.owner === o && u.hp > 0 && u.type !== 'convoy' && !wodIsNavalUnit(u));
    const model = armyOf(ref);
    const supplied = wodStartingTownSupply();
    for(const o of ownerIds) {
        if(o === ref) continue;
        const k = wodSymElementBetween(S, iRef, S.idxOfOwner.get(o));
        const units = armyOf(o);
        const byType = new Map();
        for(const u of units) { if(!byType.has(u.type)) byType.set(u.type, []); byType.get(u.type).push(u); }
        const used = new Set();
        for(const m of model) {
            const list = byType.get(m.type);
            if(!list || !list.length) continue;
            const u = list.shift();
            const mh = getNearestHexToPoint(m.x, m.y);
            if(!mh || wodSymIndexOf(S, mh) < 0) continue;
            let t = null;
            const ti = wodSymImageIndex(S, wodSymIndexOf(S, mh), k);
            if(ti >= 0) t = S.cells[ti];
            const pool = supplied.get(o);
            const ok = h => h && h.owner === o && !isWaterHex(h) && h.type !== 'mountain' && (!pool || pool.has(getHexKey(h))) && !used.has(h);
            if(!ok(t)) {
                // three players: nearest usable cell to the turned spot
                let best = null, bd = Infinity;
                const tx = t ? t.x : u.x, ty = t ? t.y : u.y;
                for(const p of getHexesInRadius(Math.round(tx / S.sp), Math.round(ty / S.sp), 3)) {
                    const h = wodHexAt(p.q, p.r);
                    if(!ok(h)) continue;
                    const dd = (h.x - tx) ** 2 + (h.y - ty) ** 2;
                    if(dd < bd) { bd = dd; best = h; }
                }
                t = best;
            }
            if(!t) continue;
            used.add(t);
            u.x = t.x; u.y = t.y; u._drawX = t.x; u._drawY = t.y;
            u.target = null; u.path = null; u.orderTarget = null;
            u._startDeployment = m._startDeployment;
            u.isGeneral = !!m.isGeneral;
        }
    }
    gameData._generalAuraCache = null;
    return true;
}

// ------------------------------------------------------------------ random starts (Balance off)
//
// With Balance off the terrain is free-form (map-gen-worker.js without a symmetry) and the players'
// starts, borders and towns are placed at random. "Random" stops short of broken: starts are spread
// over the land, nobody's territory is far smaller or larger than the rest, towns keep their spacing
// and stay off the front line, every owned cell is supplied from its owner's towns, borders pass the
// same quality gate as balanced maps, and on water maps every player has a port.

/** Balance setting (setup panel and lobby): on = balanced, symmetric maps; off = random starts. */
function wodMapBalanceSetting() {
    if(gameData._campaignRun) return true;
    const el = typeof document !== 'undefined' ? document.getElementById('setupMapBalance') : null;
    return el ? !!el.checked : gameData.mapBalance !== false;
}
function wodRandomShuffle(list) {
    for(let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = list[i]; list[i] = list[j]; list[j] = t; }
    return list;
}
/** k cells from pool, random but spread: each time the farthest of a handful of random picks. */
function wodRandomSpreadPick(pool, k, minDist) {
    const out = [];
    for(let i = 0; i < k; i++) {
        let best = null, bd = -1;
        for(let t = 0; t < 16; t++) {
            const h = pool[Math.floor(Math.random() * pool.length)];
            if(!h || out.includes(h)) continue;
            const d = out.length ? Math.min(...out.map(o => Math.hypot(o.q - h.q, o.r - h.r))) : 1e9 * Math.random();
            if(d > bd) { bd = d; best = h; }
        }
        if(!best || (out.length && bd < minDist)) return null;
        out.push(best);
    }
    return out;
}
/** Start cell per owner (Map owner -> hex), or null. */
function wodRandomPickSeeds(owners, mapShape, landmasses, mainSet) {
    const n = owners.length, water = wodWaterDistanceField();
    const inland = (h, d) => h && !isWaterHex(h) && h.type !== 'mountain' && (water.get(h) ?? 99) >= d;
    const order = wodRandomShuffle(owners.slice()), seeds = new Map();
    if(mapShape === 'archipelago') {
        const homes = (gameData._wodArchIslands || []).filter(it => it.kind === 'home').sort((a, b) => a.player - b.player);
        if(homes.length < n) return null;
        for(let p = 0; p < n; p++) {
            let best = null, bd = Infinity;
            for(const h of gameData.hexList) {
                if(!inland(h, 1)) continue;
                const d = (h.q - homes[p].q) ** 2 + (h.r - homes[p].r) ** 2;
                if(d < bd) { bd = d; best = h; }
            }
            if(!best || bd > 25) return null;
            seeds.set(order[p], best);
        }
        return seeds;
    }
    if(mapShape === 'continents') {
        // the larger continent takes the larger group, as on balanced maps
        if(landmasses.length < 2) return null;
        const nBig = Math.ceil(n / 2), groups = [order.slice(0, nBig), order.slice(nBig)];
        for(let g = 0; g < 2; g++) {
            if(!groups[g].length) continue;
            const pool = landmasses[g].filter(h => inland(h, 3));
            const picked = pool.length && wodRandomSpreadPick(pool, groups[g].length, Math.sqrt(landmasses[g].length / groups[g].length) * 0.75);
            if(!picked) return null;
            groups[g].forEach((o, i) => seeds.set(o, picked[i]));
        }
        return seeds;
    }
    const pool = [...mainSet].filter(h => inland(h, 3));
    if(pool.length < n) return null;
    let picked = null;
    for(let shrink = 1; shrink > 0.5 && !picked; shrink -= 0.1)
        picked = wodRandomSpreadPick(pool, n, Math.sqrt(mainSet.size / n) * 0.85 * shrink);
    if(!picked) return null;
    order.forEach((o, i) => seeds.set(o, picked[i]));
    return seeds;
}
/** Land split from random starts with equal shares (Balance off still gives everybody the same land):
 *  a landmass with one start goes to that player; a landmass without one goes whole to a nearby player
 *  (on island groups the one with least land so far, else the nearest); a landmass shared by several
 *  starts is split by walking distance with every player's quota solved to the same total, the starts
 *  then eased to the middles of their regions (wodPartitionLandmass). Updates seeds; false when the
 *  shares cannot be made equal from these starts. */
function wodRandomPartitionEqual(owners, seeds, landmasses) {
    const n = owners.length, target = wodBuildLandBalanceTargets(owners), massOf = new Map();
    landmasses.forEach((cells, m) => { for(const h of cells) massOf.set(h, m); });
    const on = new Map();
    for(const o of owners) { const m = massOf.get(seeds.get(o)); if(!on.has(m)) on.set(m, []); on.get(m).push(o); }
    const have = new Map(owners.map(o => [o, 0]));
    const shared = [...on.values()].some(list => list.length > 1);
    // 1. a landmass with one start
    for(const [m, list] of on) if(list.length === 1) { for(const h of landmasses[m]) h.owner = list[0]; have.set(list[0], have.get(list[0]) + landmasses[m].length); }
    // 2. landmasses without a start, largest first
    const loose = landmasses.map((cells, m) => m).filter(m => !on.has(m)).sort((a, b) => landmasses[b].length - landmasses[a].length);
    for(const m of loose) {
        const cells = landmasses[m];
        let cx = 0, cy = 0;
        for(const h of cells) { cx += h.x; cy += h.y; }
        cx /= cells.length; cy /= cells.length;
        const ds = owners.map(o => Math.hypot(seeds.get(o).x - cx, seeds.get(o).y - cy));
        const near = Math.min(...ds);
        let pick = owners[ds.indexOf(near)];
        // (island groups: among the players about as near, the one with least land so far)
        if(!shared) for(let i = 0; i < n; i++) if(ds[i] <= near * 1.6 + 1e-6 && have.get(owners[i]) < have.get(pick)) pick = owners[i];
        for(const h of cells) h.owner = pick;
        have.set(pick, have.get(pick) + cells.length);
    }
    // 3. shared landmasses: quotas that bring every player to the same total
    for(const [m, list] of on) {
        if(list.length < 2) continue;
        const cells = landmasses[m];
        let want = list.map(o => Math.max(1, target[o] - have.get(o)));
        const sum = want.reduce((a, b) => a + b, 0);
        if(sum !== cells.length) {
            // (land the solver cannot give exactly: scale to the landmass, the rest is evened out after)
            want = want.map(w => Math.max(1, Math.floor(w * cells.length / sum)));
            let rest = cells.length - want.reduce((a, b) => a + b, 0);
            for(let i = 0; rest > 0; i = (i + 1) % want.length, rest--) want[i]++;
        }
        const placed = wodPartitionLandmass(cells, list, list.map(o => seeds.get(o)), want);
        if(!placed) return false;
        list.forEach((o, i) => { seeds.set(o, placed[i]); have.set(o, have.get(o) + want[i]); });
    }
    return true;
}
/** Land split from the starts: a landmass with starts on it by walking distance (with a slow wave per
 *  player so frontiers wander), every other landmass whole to the nearest start. */
function wodRandomPartition(owners, seeds, landmasses) {
    const sp = gameData.hexRadius * 1.35, massOf = new Map();
    landmasses.forEach((cells, m) => { for(const h of cells) massOf.set(h, m); });
    const phase = new Map(owners.map(o => [o, Math.random() * Math.PI * 2]));
    const wave = (h, o) => { const ph = phase.get(o); return Math.sin(h.x / (sp * 10.5) + ph) * Math.cos(h.y / (sp * 8.5) + ph * 1.7) * 1.7 + Math.sin((h.x + h.y) / (sp * 6.5) + ph * 2.3) * 0.6; };
    landmasses.forEach((cells, m) => {
        const here = owners.filter(o => massOf.get(seeds.get(o)) === m);
        if(here.length === 1) { for(const h of cells) h.owner = here[0]; return; }
        if(here.length > 1) {
            const grid = wodBuildLandPathGrid(cells);
            const dist = here.map(o => wodLandPathField(grid, grid.idx(seeds.get(o).q, seeds.get(o).r)));
            for(let i = 0; i < grid.n; i++) {
                let best = 0, bv = Infinity;
                for(let a = 0; a < here.length; a++) { const v = dist[a][i] + wave(cells[i], here[a]); if(v < bv) { bv = v; best = a; } }
                cells[i].owner = here[best];
            }
            return;
        }
        let cx = 0, cy = 0;
        for(const h of cells) { cx += h.x; cy += h.y; }
        cx /= cells.length; cy /= cells.length;
        let best = owners[0], bd = Infinity;
        for(const o of owners) { const s = seeds.get(o), d = Math.hypot(s.x - cx, s.y - cy); if(d < bd) { bd = d; best = o; } }
        for(const h of cells) h.owner = best;
    });
}
/** Towns at random legal places for every owner, or null. Returns [{cell, owner, port}]. */
function wodRandomPlanTowns(owners, mapShape, want, landmasses, seeds, cols, rows) {
    const water = wodWaterDistanceField(), ocean = wodBuildOceanConnectedWaterKeys(cols, rows), massOf = new Map();
    landmasses.forEach((cells, m) => { for(const h of cells) massOf.set(h, m); });
    const archi = mapShape === 'archipelago', needPort = archi || mapShape === 'continents';
    const info = new Map();
    for(const o of owners) {
        const allowed = new Set([massOf.get(seeds.get(o))]);
        landmasses.forEach((cells, m) => { if(cells.every(h => h.owner === o)) allowed.add(m); });
        info.set(o, { depth: wodSymInteriorDepth(o), allowed, cells: gameData.hexList.filter(h => h.owner === o && !isWaterHex(h) && h.type !== 'mountain') });
    }
    const open = (h, o) => h && h.owner === o && !isWaterHex(h) && h.type !== 'mountain' && h.type !== 'urban';
    const legal = (h, o, level) => {
        const I = info.get(o);
        if(!open(h, o) || !I.allowed.has(massOf.get(h))) return false;
        if(I.depth(h) < (archi ? 1 : level === 0 ? 4 : 2)) return false;
        if((water.get(h) ?? 99) < (archi ? 2 : level === 0 ? 3 : 2)) return false;
        return wodProceduralUrbanFootprintKeys(h.q, h.r, o) !== null;
    };
    const port = (h, o) => {
        const I = info.get(o);
        if(!open(h, o) || !I.allowed.has(massOf.get(h)) || I.depth(h) < 2 || (water.get(h) ?? 99) !== 2) return false;
        if(getNeighborHexes(h).length < 8 || getNeighborHexes(h).some(x => isWaterHex(x) || x.type === 'mountain' || x.owner !== o)) return false;
        for(let dq = -2; dq <= 2; dq++) for(let dr = -2; dr <= 2; dr++) {
            const w = wodHexAt(h.q + dq, h.r + dr);
            if(w && dq * dq + dr * dr >= 4 && isWaterHex(w) && ocean.has(getHexKey(w))) return true;
        }
        return false;
    };
    const cheb = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r));
    const placed = [];
    for(let level = 0; level < want; level++) {
        for(const o of wodRandomShuffle(owners.slice())) {
            const isPort = needPort && level === want - 1;
            let pool = info.get(o).cells.filter(h => isPort ? port(h, o) : legal(h, o, level));
            if(!pool.length && isPort) pool = info.get(o).cells.filter(h => legal(h, o, level));
            wodRandomShuffle(pool);
            const mine = placed.filter(t => t.owner === o).map(t => t.cell);
            let pick = null, best = -Infinity, seen = 0;
            for(const h of pool) {
                if(placed.some(t => cheb(t.cell, h) < 8)) continue;
                // (never within striking range of an enemy town at the start)
                if(placed.some(t => t.owner !== o && Math.hypot(t.cell.q - h.q, t.cell.r - h.r) < 14)) continue;
                // random, but a player's towns do not crowd each other and the first sits back from the front
                const score = (level === 0 ? Math.min(info.get(o).depth(h), 12) : Math.min(24, ...mine.map(m => Math.hypot(m.q - h.q, m.r - h.r)))) + Math.random() * 8;
                if(score > best) { best = score; pick = h; }
                if(++seen >= 40) break;
            }
            if(!pick) return null;
            placed.push({ cell: pick, owner: o, port: isPort && port(pick, o) });
        }
    }
    return placed;
}
/** Borders and towns with Balance off (same contract as wodProceduralVoronoiBordersThenCitiesSameCount). */
async function wodRandomBordersThenCities(cols, rows, mapShape, attempt) {
    gameData._wodProcgenBorderFirstApplied = false;
    if(!(gameData.mp && gameData.mp.enabled)) wodSyncAiCountForMapGen();
    const owners = [...wodOwnersListActiveForProcgen()].sort((a, b) => a - b);
    const fail = reason => { gameData._startingBorderQuality = { ok: false, reason }; return false; };
    if(!owners.length) return fail('random-players');
    gameData.cities = [];
    for(const h of gameData.hexList) {
        h.owner = 0;
        if(h.type === 'urban') wodSetGeneratedTerrainType(h, 'grass');
        delete h.cityId;
        delete h.urbanVariant;
    }
    const landmasses = wodPoliticalLandmasses();
    const graph = wodStartingLandGraph(), seen = new Set();
    let main = [];
    for(const node of graph.nodes.values()) {
        if(seen.has(node)) continue;
        const comp = [node]; seen.add(node);
        for(let i = 0; i < comp.length; i++) for(const nb of comp[i].neighbors) if(!seen.has(nb)) { seen.add(nb); comp.push(nb); }
        if(comp.length > main.length) main = comp;
    }
    const mainSet = new Set(main.map(nd => nd.hex));
    const seeds = wodRandomPickSeeds(owners, mapShape, landmasses, mainSet);
    if(!seeds) return fail('random-seed');
    if(!wodRandomPartitionEqual(owners, seeds, landmasses)) return fail('random-split');
    wodSymJoinStrayOwnerBits(owners, landmasses, [...seeds.values()]);
    wodBluntBorderTips(owners, 2, landmasses);
    wodSymJoinStrayOwnerBits(owners, landmasses, [...seeds.values()]);
    // Equal land for everybody, as on balanced maps (only where it lies differs). Shares that came out a
    // little apart are evened along the frontiers (shared land) or the coast (islands of their own).
    const sharedLand = (() => { const m = new Map(); for(const s of seeds.values()) { const k = landmasses.findIndex(c => c.includes(s)); m.set(k, (m.get(k) || 0) + 1); } return [...m.values()].some(v => v > 1); })();
    const equal = () => { const t = wodBuildLandBalanceTargets(owners), c = wodCountBalancedLandByOwner(owners); return owners.every(o => c[o] === t[o]); };
    // Before the towns (withTowns false) a frontier is only checked to be near even: the frontier balancer works from
    // the towns' supply, and run without towns it first handed nearly all land to one player (then the coast trim
    // ground through its whole budget and the attempt was thrown away, so big maps took tens of seconds). Separate
    // islands are trimmed along the coast either way.
    const evenOut = async withTowns => {
        if(equal()) return true;
        const t = wodBuildLandBalanceTargets(owners), c = wodCountBalancedLandByOwner(owners), avg = owners.reduce((s, o) => s + t[o], 0) / owners.length;
        // (more than a few per cent apart means the draw went wrong: try other starts)
        const apart = owners.reduce((s, o) => s + Math.abs(c[o] - t[o]), 0) / 2;
        if(apart > avg * 0.12) return false;
        if(sharedLand && !withTowns) return true;
        if(sharedLand) await wodExactEqualizePoliticalLandCounts(owners, gameData.cities, Math.min(600, gameData.hexList.length));
        if(!equal()) wodSymEvenCoastLand(owners, Math.min(1200, Math.ceil(apart) * 6 + 40));
        return equal();
    };
    const share = () => equal();
    if(owners.length > 1 && !(await evenOut(false))) return fail('random-uneven');
    const referenceFrontier = wodStartingFrontierLength();
    const want = Math.max(1, wodCitiesPerPlayerSetting() - (gameData._wodCityCountRelax | 0));
    const plan = wodRandomPlanTowns(owners, mapShape, want, landmasses, seeds, cols, rows);
    if(!plan) return fail('town-placement');
    const urbanColor = getUrbanTerrainColor(wodGetGamePeriod()), oceanKeys = wodBuildOceanConnectedWaterKeys(cols, rows);
    let ix = 0;
    for(const site of plan) {
        const h0 = site.cell, o = site.owner;
        const town = { id: 'city_' + (++ix), name: generateCityName(), x: h0.x, y: h0.y, q: h0.q, r: h0.r, owner: o,
            hasFactory: false, hasHarbor: false, hasFarm: false, hp: 1000, maxHp: 1000, urbanStyle: null, incomeBonus: 0, manpowerBonus: 0 };
        stampOwnedRandomUrbanTerrainAroundCity(h0, town, o);
        if(site.port) {
            // a quay on the open sea, so the port can always build a harbour
            let gap = null, gapD = Infinity;
            for(let dq = -2; dq <= 2; dq++) for(let dr = -2; dr <= 2; dr++) {
                const w = wodHexAt(h0.q + dq, h0.r + dr), d = dq * dq + dr * dr;
                if(w && d >= 4 && d < gapD && isWaterHex(w) && oceanKeys.has(getHexKey(w))) { gapD = d; gap = { dq, dr }; }
            }
            const quay = gap && wodHexAt(h0.q + Math.round(gap.dq / 2), h0.r + Math.round(gap.dr / 2));
            if(quay && !isWaterHex(quay) && quay.type !== 'mountain' && quay.owner === o && !quay.cityId) {
                quay.type = 'urban'; quay.cityId = town.id; quay.urbanVariant = Math.floor(Math.random() * 5);
                quay.baseColor = urbanColor; quay.renderColor = urbanColor;
            }
        }
        gameData.cities.push(town);
    }
    for(const c of gameData.cities) delete c._urbanHexCache;
    wodSyncUrbanFootprintOwners();
    await wodCarveStartingFactionPasses(owners);
    wodRepairStartingLandSupply(owners);
    wodAssignAllWaterFromNearestLand(true);
    if(owners.length > 1 && !(await evenOut(true))) return fail('random-uneven');
    wodNormalizeStartingCityEconomy(owners);
    wodMarkTerrainPoliticalDirty();
    wodMarkTerrainFullDirty();
    gameData._wodPfVer = (gameData._wodPfVer || 0) + 1;
    gameData._startingBorderQuality = wodValidateStartingBorders(owners, referenceFrontier);
    if(!gameData._startingBorderQuality.ok) return false;
    // playable for everyone: the same number of towns, a supplied home with a safe rear, a port on water maps
    const supplied = wodStartingTownSupply();
    for(const o of owners) {
        if(gameData.cities.filter(c => c.owner === o).length !== want) return fail('town-placement');
        const pool = gameData.hexList.filter(h => h.owner === o && supplied.get(o)?.has(getHexKey(h)));
        if(pool.length < 12 || !pool.some(h => !isFrontlineHex(h, o))) return fail('random-unsupplied');
        if((mapShape === 'archipelago' || mapShape === 'continents') && !gameData.cities.some(c => c.owner === o && cityUrbanClusterEligibleForHarbor(c)))
            return fail('random-no-port');
    }
    if(owners.length > 1 && !share()) return fail('random-uneven');
    gameData._startingBorderQuality.random = true;
    gameData._wodProcgenBorderFirstApplied = true;
    return true;
}
/** The symmetry a solo preview was made with, kept when the preview becomes the match map. */
function wodSymSnapshotInfo() {
    const S = wodSymActive();
    return S ? { spec: S.spec, ownerOfIdx: S.ownerOfIdx ? S.ownerOfIdx.slice() : null } : null;
}
function wodSymRestoreFromSnapshot(info) {
    gameData._mapSym = null;
    if(!info || !info.spec) return;
    const p = gameData._mapSizePreset || wodMapSizePreset(gameData.mapRadius);
    const S = wodSymInit(info.spec, gameData.mapRadius, Math.floor(gameData.mapRadius * (p.rowsMul || 0.8)));
    if(S && info.ownerOfIdx) {
        S.ownerOfIdx = info.ownerOfIdx.slice();
        S.idxOfOwner = new Map(S.ownerOfIdx.map((o, i) => [o, i]));
    }
}
