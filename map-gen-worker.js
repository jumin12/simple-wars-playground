/* eslint-disable no-restricted-globals */
/** Procedural terrain heightmap / biome grid for Simple Wars map generation (worker thread or page).
 *
 *  Two generators share one noise and one set of terrain rules:
 *   - generateTerrainCells without `sym`: the free-form maps (one player, or layouts that cannot be
 *     made symmetric, such as continents split 2+1).
 *   - with `sym`: balanced maps. Every field (height, moisture, ridges, coast wobble) is built so that
 *     turning the map about its centre by one player's share (180 degrees for two players, 120 for three,
 *     90 for four) gives the same map. Each field is the original field seen from the nearest player's
 *     side; between two players' sides the two views fade into each other with their spread kept, so the
 *     seam reads as ordinary terrain rather than a ruler line. Two and four players are exact on the
 *     square grid (cells are copied from one representative per orbit); three players are as close as
 *     a square grid allows and the page evens out the rest.
 */
(function () {
    // ---------------------------------------------------------------- noise
    // Integer lattice hash (much cheaper than the sin() hash it replaces, and free of its banding).
    function hash2(ix, iy) {
        let h = (Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1)) | 0;
        h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
        h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
        h ^= h >>> 15;
        return (h >>> 0) * 2.3283064365386963e-10;
    }
    function noise(x, y) {
        const fx = Math.floor(x), fy = Math.floor(y);
        let tx = x - fx, ty = y - fy;
        tx = tx * tx * (3 - 2 * tx);
        ty = ty * ty * (3 - 2 * ty);
        const a = hash2(fx, fy), b = hash2(fx + 1, fy), c = hash2(fx, fy + 1), d = hash2(fx + 1, fy + 1);
        return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
    function fbm(x, y, octaves) {
        let v = 0, a = 0.5;
        for (let i = 0; i < octaves; i++) {
            v += a * noise(x, y);
            x *= 2;
            y *= 2;
            a *= 0.5;
        }
        return v;
    }
    // Mean of fbm with n octaves (each octave of value noise averages one half).
    const FBM_MEAN = [0, 0.25, 0.375, 0.4375, 0.46875, 0.484375, 0.4921875, 0.49609375];
    function mulberry32(a) {
        return function () {
            a |= 0;
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function usesRadial(mapShape) {
        return mapShape === 'island' || mapShape === 'ring' || mapShape === 'archipelago' || mapShape === 'continents';
    }
    function usesRect(mapShape) {
        return mapShape === 'rectangle' || mapShape === 'forest' || mapShape === 'mountain' || mapShape === 'desert';
    }

    const NEIGHBOR_DR = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, -1],
        [1, -1],
        [-1, 1]
    ];

    // -------------------------------------------------------- symmetry groups
    // Cells are listed row by row: index = (r + rows) * (2 * cols + 1) + (q + cols).
    // spec: {type:'rot', n:2|3|4, phase} rotation about the centre cell (n players), or
    //       {type:'cont4', phase} two continents of two players each: the right continent is the left
    //       one mirrored, and each is mirrored top to bottom about the line half a cell above row 0
    //       (so no cell lies on that axis). Mirrors are the only distance-keeping maps that turn one
    //       player of a two-against-two continents map onto each of the others.
    // Returns, per cell, the representative it copies from (rep), the group element that carries the
    // representative onto it (repK), the image of every cell under every element (img; -1 off the grid)
    // and how each element moves the players (perm[k][player index]).
    function buildSymGroup(spec, cols, rows) {
        const W = 2 * cols + 1, H = 2 * rows + 1, N = W * H;
        const at = (q, r) => (q < -cols || q > cols || r < -rows || r > rows) ? -1 : (r + rows) * W + (q + cols);
        const type = spec.type, phase = spec.phase || 0;
        let order, players, exact, perm, mapCell;
        if (type === 'cont4') {
            order = 4; players = 4; exact = true;
            // elements: 0 id, 1 top-bottom mirror, 2 left-right mirror, 3 both (half a turn)
            perm = [[0, 1, 2, 3], [1, 0, 3, 2], [2, 3, 0, 1], [3, 2, 1, 0]];
            mapCell = (k, q, r) => k === 0 ? at(q, r) : k === 1 ? at(q, -1 - r) : k === 2 ? at(-q, r) : at(-q, -1 - r);
        } else {
            const n = spec.n | 0;
            order = n; players = n; exact = n === 2 || n === 4;
            perm = [];
            for (let k = 0; k < n; k++) { const p = []; for (let i = 0; i < n; i++) p.push((i + k) % n); perm.push(p); }
            if (n === 2) mapCell = (k, q, r) => k === 0 ? at(q, r) : at(-q, -r);
            else if (n === 4) mapCell = (k, q, r) => k === 0 ? at(q, r) : k === 1 ? at(-r, q) : k === 2 ? at(-q, -r) : at(r, -q);
            else {
                const A = (Math.PI * 2) / n;
                mapCell = (k, q, r) => {
                    if (k === 0) return at(q, r);
                    const c = Math.cos(k * A), si = Math.sin(k * A);
                    return at(Math.round(q * c - r * si), Math.round(q * si + r * c));
                };
            }
        }
        const img = [];
        for (let k = 0; k < order; k++) {
            const m = new Int32Array(N);
            for (let r = -rows; r <= rows; r++) for (let q = -cols; q <= cols; q++) m[at(q, r)] = mapCell(k, q, r);
            img.push(m);
        }
        const rep = new Int32Array(N), repK = new Int8Array(N), outside = new Uint8Array(N);
        if (exact) {
            for (let i = 0; i < N; i++) {
                let best = i, bk = 0, broken = false;
                for (let k = 1; k < order; k++) {
                    const j = img[k][i];
                    if (j < 0) { broken = true; break; }
                }
                if (broken) { rep[i] = i; repK[i] = 0; outside[i] = 1; continue; }
                // representative = lowest index in the orbit; repK = element taking it onto i
                for (let k = 1; k < order; k++) { const j = img[k][i]; if (j < best) best = j; }
                rep[i] = best;
                if (best === i) { repK[i] = 0; continue; }
                for (let k = 1; k < order; k++) if (img[k][best] === i) { bk = k; break; }
                repK[i] = bk;
            }
        } else {
            // n = 3: the canonical wedge is the third of the map centred on `phase`; every other cell
            // copies the canonical cell nearest to the point it turns back onto.
            const n = order, A = (Math.PI * 2) / n;
            const wedgeOf = (q, r) => {
                if (q === 0 && r === 0) return 0;
                let t = (Math.atan2(r, q) - phase) / A;
                return ((Math.round(t) % n) + n) % n;
            };
            const wedge = new Int8Array(N);
            for (let r = -rows; r <= rows; r++) for (let q = -cols; q <= cols; q++) wedge[at(q, r)] = wedgeOf(q, r);
            for (let r = -rows; r <= rows; r++) for (let q = -cols; q <= cols; q++) {
                const i = at(q, r), k = wedge[i];
                if (k === 0) { rep[i] = i; repK[i] = 0; continue; }
                const c = Math.cos(-k * A), si = Math.sin(-k * A);
                const px = q * c - r * si, py = q * si + r * c;
                let best = -1, bd = Infinity;
                const fx = Math.floor(px), fy = Math.floor(py);
                for (let dq = -1; dq <= 2; dq++) for (let dr = -1; dr <= 2; dr++) {
                    const j = at(fx + dq, fy + dr);
                    if (j < 0 || wedge[j] !== 0) continue;
                    const d = (fx + dq - px) ** 2 + (fy + dr - py) ** 2;
                    if (d < bd) { bd = d; best = j; }
                }
                if (best < 0 || bd > 2.5) { rep[i] = i; repK[i] = 0; outside[i] = 1; continue; }
                rep[i] = best; repK[i] = k;
            }
        }
        // Inverse of each element (rotations: n-k; Klein group: itself).
        const inv = [];
        for (let k = 0; k < order; k++) inv.push(type === 'cont4' ? k : (order - k) % order);
        return { spec, type, order, players, exact, cols, rows, W, H, N, img, rep, repK, outside, perm, inv, phase, at };
    }

    // Blend weights for a world point: which views of the map (group elements) the point is seen
    // through, and how much of each. Writes up to two (x, y, weight) triples into `out`; returns count.
    function smooth01(t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }
    function symViews(G, sp, x, y, out) {
        if (G.type === 'cont4') {
            // mirrors fold without a seam: the point seen from the top-left quarter
            const y0 = -0.5 * sp;
            out[0] = x > 0 ? -x : x; out[1] = y > y0 ? 2 * y0 - y : y; out[2] = 1;
            return 1;
        }
        const n = G.order, A = (Math.PI * 2) / n, half = A / 2, bw = Math.min(half * 0.42, 0.5);
        const th = Math.atan2(y, x) - G.phase;
        const rel = th / A, k0 = Math.round(rel), phi = (rel - k0) * A;
        let s = 0, k1 = k0;
        if (phi > half - bw) { k1 = k0 + 1; s = smooth01((phi - (half - bw)) / (2 * bw)); }
        else if (phi < -(half - bw)) { k1 = k0 - 1; s = smooth01((-phi - (half - bw)) / (2 * bw)); }
        // view k: the point turned back by k shares
        let c = Math.cos(-k0 * A), si = Math.sin(-k0 * A);
        out[0] = x * c - y * si; out[1] = x * si + y * c; out[2] = 1 - s;
        if (s <= 0) return 1;
        c = Math.cos(-k1 * A); si = Math.sin(-k1 * A);
        out[3] = x * c - y * si; out[4] = x * si + y * c; out[5] = s;
        return 2;
    }
    const _views = new Float64Array(6);
    /** A symmetric version of fn (a scalar field with mean `mean`): blended over the views of the map,
     *  with its spread kept (so a fade between two views is as varied as either view). */
    function symField(G, sp, fn, x, y, mean) {
        const m = symViews(G, sp, x, y, _views);
        if (m === 1) return fn(_views[0], _views[1]);
        const w0 = _views[2], w1 = _views[5];
        const a = fn(_views[0], _views[1]) - mean, b = fn(_views[3], _views[4]) - mean;
        return mean + (w0 * a + w1 * b) / Math.sqrt(w0 * w0 + w1 * w1);
    }

    /** Remove single-cell biome speckles and inland water dots (runs off-thread). */
    function smoothTerrainHexList(hexList) {
        let key = (q, r) => q + ',' + r;
        let map = new Map();
        for (let i = 0; i < hexList.length; i++) {
            let h = hexList[i];
            map.set(key(h.q, h.r), h);
        }
        for (let pass = 0; pass < 3; pass++) {
            let changes = [];
            for (let i = 0; i < hexList.length; i++) {
                let h = hexList[i];
                if (h.type === 'water') {
                    // Isolated 1-2 cell "ponds" between land cells read as glitches —
                    // fill with the dominant surrounding land biome.
                    let landN = 0,
                        waterAdj = 0;
                    let landCounts = {};
                    for (let d = 0; d < NEIGHBOR_DR.length; d++) {
                        let nb = map.get(key(h.q + NEIGHBOR_DR[d][0], h.r + NEIGHBOR_DR[d][1]));
                        if (!nb) continue;
                        if (nb.type === 'water') {
                            waterAdj++;
                            continue;
                        }
                        if (nb.type === 'mountain' || nb.type === 'urban') continue;
                        landN++;
                        landCounts[nb.type] = (landCounts[nb.type] || 0) + 1;
                    }
                    if (landN >= 6 || (waterAdj <= 1 && landN >= 4)) {
                        let fillT = 'grass',
                            fillC = 0;
                        for (let t in landCounts) {
                            if (landCounts[t] > fillC) {
                                fillC = landCounts[t];
                                fillT = t;
                            }
                        }
                        if (fillT === 'sand' && landCounts.grass) fillT = 'grass';
                        changes.push([h, fillT]);
                    }
                    continue;
                }
                if (h.type === 'mountain') continue;
                let counts = {};
                let same = 0;
                let landTotal = 0;
                for (let d = 0; d < NEIGHBOR_DR.length; d++) {
                    let nb = map.get(key(h.q + NEIGHBOR_DR[d][0], h.r + NEIGHBOR_DR[d][1]));
                    if (!nb || nb.type === 'water' || nb.type === 'mountain') continue;
                    landTotal++;
                    counts[nb.type] = (counts[nb.type] || 0) + 1;
                    if (nb.type === h.type) same++;
                }
                if (landTotal < 2) continue;
                let best = h.type;
                let bestC = 0;
                for (let t in counts) {
                    if (counts[t] > bestC) {
                        bestC = counts[t];
                        best = t;
                    }
                }
                let need = pass === 0 ? 4 : 3;
                if (same <= 1 && bestC >= 3) changes.push([h, best]);
                // Single-cell biome with NO same-type neighbor at all.
                else if (same === 0 && bestC >= 2) changes.push([h, best]);
                else if (best !== h.type && bestC >= need && bestC >= landTotal - 2) changes.push([h, best]);
            }
            for (let c = 0; c < changes.length; c++) changes[c][0].type = changes[c][1];
        }
    }

    // ------------------------------------------------------------ the fields
    // Raw fields of one point, in a fixed order. Radial (island-type) maps use R_*, rectangle maps X_*.
    const R_CONT = 0, R_DETAIL = 1, R_MOIST = 2, R_PK = 3, R_PK2 = 4, R_PASS = 5, R_MASK = 6, R_RDIST = 7, R_COUNT = 8;
    const R_MEAN = [FBM_MEAN[6], FBM_MEAN[4], FBM_MEAN[4], FBM_MEAN[5], FBM_MEAN[4], FBM_MEAN[3], null, null];
    const X_MACRO = 0, X_DETAIL = 1, X_MOIST = 2, X_MESO = 3, X_HIMICRO = 4, X_HIMESO = 5, X_RIDGE = 6, X_RIVC = 7, X_RJIT = 8,
        X_LAKE = 9, X_PASS = 10, X_VALLEY = 11, X_BIOJ = 12, X_PATCH = 13, X_WAVE = 14, X_COUNT = 15;
    const X_MEAN = [FBM_MEAN[6], FBM_MEAN[4], FBM_MEAN[4], FBM_MEAN[5], FBM_MEAN[3], FBM_MEAN[2], FBM_MEAN[5], 2 / Math.PI, FBM_MEAN[3],
        FBM_MEAN[4], FBM_MEAN[4], 0, FBM_MEAN[4], FBM_MEAN[5], FBM_MEAN[3]];

    function makeContext(d) {
        const gp = d.genProfile || {};
        const ctx = {
            d, gp, mapR: d.mapR, mapShape: d.mapShape, so: d.seedOffset, cols: d.cols, rows: d.rows, sp: d.spacing,
            radial: usesRadial(d.mapShape), rect: usesRect(d.mapShape), scale: 0.004, sym: null, G: null, islands: null
        };
        if (d.sym) {
            ctx.sym = d.sym;
            ctx.G = buildSymGroup(d.sym, d.cols, d.rows);
        }
        // Island mask normalisation: an ellipse over the whole grid (free maps, two players), a circle
        // that fits the grid's height when three or four players need the same reach in every direction.
        const round = ctx.sym && ctx.sym.type === 'rot' && ctx.sym.n >= 3;
        ctx.normXDen = (round ? d.rows - 6 : d.mapR) * d.spacing * 0.95;
        ctx.normYDen = (round ? d.rows - 6 : d.rows) * d.spacing * 0.95;
        ctx.round = round;
        if (d.mapShape === 'archipelago' && ctx.sym) ctx.islands = archipelagoLayout(d, ctx);
        else if (d.mapShape === 'archipelago' && (d.genProfile || {}).archPlayers) ctx.islands = archipelagoLayoutFree(d);
        return ctx;
    }

    /** 0 at the centre, 1 on the edge of the playable region (rectangle maps). */
    function regionNorm(ctx, q, r, x, y) {
        const sym = ctx.sym;
        if (sym && sym.type === 'rot' && sym.n === 4) return Math.max(Math.abs(q), Math.abs(r)) / Math.max(1, ctx.rows);
        if (sym && sym.type === 'rot' && sym.n === 3) {
            // regular hexagon, flat top and bottom, its flat sides on the grid's top and bottom rows
            const a = Math.max(1, ctx.rows), c30 = 0.8660254037844386;
            return Math.max(Math.abs(r), Math.abs(q * c30 + r * 0.5), Math.abs(q * c30 - r * 0.5)) / a;
        }
        return Math.max(Math.abs(q) / Math.max(ctx.mapR, 1), Math.abs(r) / Math.max(ctx.rows, 1));
    }

    function radialMask(ctx, x, y, out) {
        const gp = ctx.gp, so = ctx.so, scale = ctx.scale, d = ctx.d, sp = ctx.sp, rows = ctx.rows;
        const symN = ctx.sym ? (ctx.sym.type === 'cont4' ? 4 : ctx.sym.n) : 0;
        let normX = x / ctx.normXDen;
        let normY = y / ctx.normYDen;
        let sx = normX * (gp.stretchX != null ? gp.stretchX : 1);
        let sy = normY * (gp.stretchY != null ? gp.stretchY : 1);
        let dist = Math.sqrt(sx * sx + sy * sy);
        let islandRadialDist = dist;
        let angle = Math.atan2(y, x);
        let radialWarp =
            (fbm(Math.cos(angle) * 2.4 + so, Math.sin(angle) * 2.4 + so, 4) - 0.5) * (gp.coastNoiseAmp != null ? gp.coastNoiseAmp : 0.45);
        let mask = 1.12 - dist + radialWarp;
        const mapShape = ctx.mapShape;
        if (mapShape === 'ring') {
            let ri0 = gp.ringInnerFrac != null ? gp.ringInnerFrac : 0.24;
            let ro0 = gp.ringOuterFrac != null ? gp.ringOuterFrac : 0.93;
            let coastW = fbm(x * scale * 1.75 + so + 3120, y * scale * 1.75 + so + 3120, 4);
            let coastW2 = fbm(x * scale * 3.1 + so + 5140, y * scale * 3.1 + so + 5140, 3);
            let coastW3 = fbm(Math.cos(angle) * 2.1 + so, Math.sin(angle) * 2.1 + so + 880, 4);
            let ri = ri0 + (coastW - 0.5) * 0.095 + (coastW2 - 0.5) * 0.052 + (coastW3 - 0.5) * 0.04;
            let ro = ro0 + (coastW * 0.65 + coastW2 * 0.35 - 0.5) * 0.11 + Math.cos(angle * (symN || 2.15) + so * 0.019) * 0.035;
            ri = Math.max(0.07, Math.min(0.44, ri));
            ro = Math.max(ri + 0.11, Math.min(0.98, ro));
            let bandWobble = Math.cos(angle * (symN || 2.05) + so * 0.017) * 0.045 + (coastW2 - 0.5) * 0.038;
            if (dist < ri) mask = 0.05;
            else if (dist > ro) mask = 0.06;
            else mask = 1.04 + radialWarp * 0.92 + bandWobble - ((dist - ri) / Math.max(0.08, ro - ri)) * (0.26 + (coastW - 0.5) * 0.04);
        } else if (mapShape === 'continents') {
            if (ctx.sym && ctx.sym.type === 'rot' && ctx.sym.n === 3) {
                // three continents, one per player, a third of a turn apart, open sea between them
                const A = (Math.PI * 2) / 3, ph = ctx.sym.phase || 0;
                const Lr = gp.contLobeR || 0.5, rx = gp.contLobeRx || 0.46, ry = gp.contLobeRy || 0.44;
                let best = -9, bestD = 9;
                for (let k = 0; k < 3; k++) {
                    const t = ph + k * A, c = Math.cos(t), s = Math.sin(t);
                    const dx = normX - c * Lr, dy = normY - s * Lr;
                    const u = dx * c + dy * s, w = -dx * s + dy * c;
                    const ld = Math.sqrt((u / rx) ** 2 + (w / ry) ** 2), la = Math.atan2(w, u);
                    const lw = (fbm(Math.cos(la) * 2.4 + so + 37, Math.sin(la) * 2.4 + so + 37, 4) - 0.5) * (gp.coastNoiseAmp != null ? gp.coastNoiseAmp : 0.45);
                    const lm = 1.12 - ld * 0.63 + lw * 0.8;
                    if (lm > best) { best = lm; bestD = ld * 0.63; }
                }
                // the channels run out from the centre between the continents
                let chan = 9;
                for (let k = 0; k < 3; k++) {
                    const t = ph + A / 2 + k * A, c = Math.cos(t), s = Math.sin(t);
                    if (normX * c + normY * s < -0.05) continue;
                    chan = Math.min(chan, Math.abs(normX * s - normY * c));
                }
                mask = best - Math.max(0, (gp.contChanHalf || 0.1) * 0.85 - chan) * 6;
                islandRadialDist = bestD;
            } else if (ctx.sym && ctx.sym.type === 'cont4') {
                // one continent per half, centred on its half and on the mirror line; the channel down the middle stays sea
                const cx = (x > 0 ? 1 : -1) * (ctx.cols + 1) * sp / 2, y0 = -0.5 * sp;
                const lx = (x - cx) / ((gp.contLobeRx || 0.42) * ctx.mapR * sp * 0.95), ly = (y - y0) / ((gp.contLobeRy || 0.86) * rows * sp * 0.95);
                const ld = Math.sqrt(lx * lx + ly * ly), la = Math.atan2(ly, lx);
                const lw = (fbm(Math.cos(la) * 2.4 + so + 37, Math.sin(la) * 2.4 + so + 37, 4) - 0.5) * (gp.coastNoiseAmp != null ? gp.coastNoiseAmp : 0.45);
                const chanHalf = (gp.contChanHalf || 0.1) * 0.85;
                mask = 1.12 - ld * 0.63 + lw * 0.8 - Math.max(0, chanHalf - Math.abs(normX)) * 6;
                islandRadialDist = ld * 0.63;
            } else {
                // Two island masks side by side (one per lobe) and a channel between them that always stays sea.
                let xs = normX - (gp.contShear || 0) * normY;
                let lobes = gp.contLobes || [];
                let best = -9,
                    bestD = 9;
                for (let li = 0; li < lobes.length; li++) {
                    let lb = lobes[li];
                    let lx = (xs - lb.x) / lb.rx,
                        ly = (normY - lb.y) / lb.ry;
                    let ld = Math.sqrt(lx * lx + ly * ly);
                    let la = Math.atan2(ly, lx);
                    let lw = (fbm(Math.cos(la) * 2.4 + so + 37 * (li + 1), Math.sin(la) * 2.4 + so + 37 * (li + 1), 4) - 0.5) * (gp.coastNoiseAmp != null ? gp.coastNoiseAmp : 0.45);
                    let lm = 1.12 - ld * 0.63 + lw * 0.8;
                    if (lm > best) {
                        best = lm;
                        bestD = ld * 0.63;
                    }
                }
                let wave = fbm(normY * 1.9 + so + 611, so * 0.37 + 11, 3) - 0.5;
                // (balanced maps: an odd wave, so the channel turned half round is the same channel)
                if (ctx.sym) wave = (wave - (fbm(-normY * 1.9 + so + 611, so * 0.37 + 11, 3) - 0.5)) * 0.5;
                let chanMid = (gp.contChanX || 0) + wave * 2 * (gp.contChanWave || 0);
                mask = best - Math.max(0, (gp.contChanHalf || 0.1) * 0.85 - Math.abs(xs - chanMid)) * 6;
                islandRadialDist = bestD;
            }
        } else if (mapShape === 'archipelago') {
            if (ctx.islands) {
                // A group of separate islands: the height of a point is how far inside the nearest
                // island's rim it lies, in cells, roughened along the coast.
                const isl = ctx.islands;
                // the coast is warped (bays, capes) before the distance to each island is taken
                const wq = (fbm(x * scale * 2.3 + so + 911, y * scale * 2.3 + so + 911, 3) - FBM_MEAN[3]) * 13;
                const wr = (fbm(x * scale * 2.3 + so + 1733, y * scale * 2.3 + so + 1733, 3) - FBM_MEAN[3]) * 13;
                const qx = x / sp + wq, qy = y / sp + wr;
                let best = -1e9;
                for (let i = 0; i < isl.length; i++) {
                    const it = isl[i], dx = qx - it.q, dy = qy - it.r;
                    const u = dx * it.ca + dy * it.sa, w = -dx * it.sa + dy * it.ca;
                    const v = it.rad - Math.sqrt((u / it.asp) ** 2 + (w * it.asp) ** 2) * it.k;
                    if (v > best) best = v;
                }
                mask = best;
                islandRadialDist = dist;
            } else {
                let punch = gp.archipelagoCenterClearFrac != null ? gp.archipelagoCenterClearFrac : 0.55;
                mask -= Math.max(0, punch - dist) * 1.62;
                let cells = fbm(x * scale * 1.35 + so + 444, y * scale * 1.35 + so + 444, 4);
                mask -= Math.max(0, cells - 0.32) * 0.72;
                let ch = fbm(x * scale * 2 + so + 2444, y * scale * 2 + so + 2444, 4);
                mask -= Math.max(0, ch - 0.38) * 0.52;
            }
        } else {
            const nLobe = symN >= 2 ? symN : 0;
            if (gp.islandMode === 'elongated') mask += Math.cos(angle * (nLobe === 2 ? 2 : 2.05) + so * 0.02) * 0.07;
            if (gp.islandMode === 'archipelago') {
                let cells = fbm(x * scale * 1.35 + so + 444, y * scale * 1.35 + so + 444, 4);
                mask -= Math.max(0, cells - 0.36) * 0.62;
            }
            if (gp.islandMode === 'broken') {
                let cuts = fbm(x * scale * 1.85 + so + 1444, y * scale * 1.85 + so + 1444, 5);
                mask -= Math.max(0, cuts - 0.31) * 0.78;
                mask += (fbm(x * scale * 0.72 + so + 1888, y * scale * 0.72 + so + 1888, 3) - 0.5) * 0.12;
            }
            if (gp.islandMode === 'crescent') mask -= Math.max(0, 0.38 - Math.abs(dist - 0.56)) * 0.72;
            if (gp.islandMode === 'atoll') {
                let ring = gp.atollRing != null ? gp.atollRing : 0.48;
                let band = Math.abs(dist - ring);
                mask -= Math.max(0, 0.22 - band) * 1.05;
                mask += (fbm(x * scale * 1.1 + so + 2100, y * scale * 1.1 + so + 2100, 3) - 0.5) * 0.08;
            }
            if (gp.islandMode === 'chain' || gp.islandMode === 'double') {
                const dbl = gp.islandMode === 'double';
                let ax = gp.chainAX != null ? gp.chainAX : -0.46, ay = gp.chainAY != null ? gp.chainAY : 0.28;
                let bx = gp.chainBX != null ? gp.chainBX : 0.52, by = gp.chainBY != null ? gp.chainBY : -0.12;
                if (dbl) { ax *= 0.58; ay *= 0.42; bx *= 0.58; by *= 0.42; }
                let lobeD = Infinity;
                if (nLobe) {
                    // balanced maps: the lobe and its turned copies, one per player
                    const A = (Math.PI * 2) / nLobe;
                    for (let k = 0; k < nLobe; k++) {
                        const c = Math.cos(k * A), s = Math.sin(k * A);
                        const lx = ax * c - ay * s, ly = ax * s + ay * c;
                        lobeD = Math.min(lobeD, Math.sqrt((normX - lx) ** 2 + (normY - ly) ** 2));
                    }
                } else if (dbl) {
                    lobeD = Math.min(Math.sqrt((normX - ax) ** 2 + (normY - ay) ** 2), Math.sqrt((normX - bx) ** 2 + (normY - by) ** 2));
                } else {
                    lobeD = Math.min(Math.sqrt((normX - ax) ** 2 + (normY + ay) ** 2) / 0.9 * 0.9, Math.sqrt((normX + bx) ** 2 + (normY - by) ** 2) * 0.88 / 0.9);
                }
                if (dbl) {
                    let neck = nLobe ? 1 : Math.abs(normY - (ay + by) * 0.5) + Math.abs(normX - (ax + bx) * 0.5) * 0.25;
                    mask = 1.08 - Math.min(lobeD * 0.92, dist * 1.08) + radialWarp * 0.86 - Math.max(0, 0.18 - neck) * 0.18;
                } else {
                    dist = Math.min(dist, lobeD * 0.9);
                    mask = 1.1 - dist + radialWarp * 0.92;
                }
            }
            if (gp.islandMode === 'hook') {
                let hookBite = Math.max(0, 0.42 - Math.abs(dist - 0.58));
                let openSide = Math.sin(angle * (nLobe || 1) + so * 0.017);
                mask -= hookBite * Math.max(0, openSide) * 0.78;
                mask += Math.cos(angle * (nLobe || 1) - so * 0.011) * 0.055;
            }
            if (gp.islandMode === 'wide') mask += 0.055 - Math.abs(sy) * 0.11;
        }
        if (mapShape !== 'archipelago' || !ctx.islands) {
            let ellFrac = Math.sqrt(normX * normX + normY * normY);
            mask -= Math.pow(Math.max(0, ellFrac - 0.9), 1.55) * 0.58;
        }
        out[R_MASK] = mask;
        out[R_RDIST] = islandRadialDist;
    }

    function rawRadial(ctx, x, y, out) {
        const so = ctx.so, scale = ctx.scale;
        let warpX = fbm(x * scale + so, y * scale + so, 3) * 260;
        let warpY = fbm(x * scale + so + 100, y * scale + so + 100, 3) * 260;
        out[R_CONT] = fbm((x + warpX) * scale + so, (y + warpY) * scale + so, 6);
        out[R_DETAIL] = fbm(x * scale * 3 + so + 2000, y * scale * 3 + so + 2000, 4);
        out[R_MOIST] = fbm((x + warpX) * scale + so + 5000, (y + warpY) * scale + so + 5000, 4);
        out[R_PK] = fbm(x * scale * 2.55 + so + 7711, y * scale * 2.55 + so + 7711, 5);
        out[R_PK2] = fbm(x * scale * 5.1 + so + 3322, y * scale * 5.1 + so + 3322, 4);
        out[R_PASS] = fbm(x * scale * 5 + so + 3000, y * scale * 5 + so + 3000, 3);
        radialMask(ctx, x, y, out);
    }

    function rawRect(ctx, x, y, out) {
        const so = ctx.so, scale = ctx.scale;
        let warpX = fbm(x * scale + so, y * scale + so, 3) * 260;
        let warpY = fbm(x * scale + so + 100, y * scale + so + 100, 3) * 260;
        let wx = x + warpX, wy = y + warpY, u = wx * scale, v = wy * scale;
        out[X_MACRO] = fbm(wx * scale + so, wy * scale + so, 6);
        out[X_DETAIL] = fbm(x * scale * 3 + so + 2000, y * scale * 3 + so + 2000, 4);
        out[X_MOIST] = fbm(wx * scale + so + 5000, wy * scale + so + 5000, 4);
        let meso = fbm(wx * scale * 1.42 + so + 6110, wy * scale * 1.42 + so + 6110, 5);
        out[X_MESO] = meso;
        out[X_HIMICRO] = fbm(wx * scale * 5.9 + so + 7211, wy * scale * 5.9 + so + 7211, 3);
        out[X_HIMESO] = fbm(wx * scale * 8.4 + so + 1122, wy * scale * 8.4 + so + 1122, 2);
        out[X_RIDGE] = fbm(wx * scale * 2.45 + so + 6500, wy * scale * 2.45 + so + 6500, 5);
        out[X_RIVC] = Math.abs(Math.sin(u * 1.12 + v * 0.88 + so * 0.019));
        out[X_RJIT] = fbm(wx * scale * 6.15 + so + 3301, wy * scale * 6.15 + so + 3301, 3);
        out[X_LAKE] = fbm(wx * scale * 1.72 + so + 7010, wy * scale * 1.72 + so + 7010, 4);
        out[X_PASS] = fbm(x * scale * 5 + so + 3000, y * scale * 5 + so + 3000, 4);
        out[X_VALLEY] = Math.sin(u * -1.95 + v * 1.42 + meso * 0.5 + so * 0.45);
        out[X_BIOJ] = fbm(wx * scale * 4.35 + so + 9120, wy * scale * 4.35 + so + 9120, 4);
        out[X_PATCH] = fbm(wx * scale * 2.12 + so + 8140, wy * scale * 2.12 + so + 8140, 5);
        out[X_WAVE] = fbm(x / (ctx.sp * 5.2) + so * 0.37 + 41.7, y / (ctx.sp * 5.2) + so * 0.21 + 9.3, 3);
    }

    const _rawA = new Float64Array(16), _rawB = new Float64Array(16);
    /** Fields of one point: plain on free maps, blended over the map's views on balanced ones. */
    function fieldsAt(ctx, x, y, out) {
        const raw = ctx.radial ? rawRadial : rawRect, count = ctx.radial ? R_COUNT : X_COUNT, means = ctx.radial ? R_MEAN : X_MEAN;
        if (!ctx.G) { raw(ctx, x, y, out); return; }
        const m = symViews(ctx.G, ctx.sp, x, y, _views);
        if (m === 1) { raw(ctx, _views[0], _views[1], out); return; }
        const w0 = _views[2], w1 = _views[5], bx = _views[3], by = _views[4];
        raw(ctx, _views[0], _views[1], _rawA);
        raw(ctx, bx, by, _rawB);
        const norm = 1 / Math.sqrt(w0 * w0 + w1 * w1);
        for (let i = 0; i < count; i++) {
            const mu = means[i];
            if (mu == null) out[i] = w0 * _rawA[i] + w1 * _rawB[i];
            else out[i] = mu + (w0 * (_rawA[i] - mu) + w1 * (_rawB[i] - mu)) * norm;
        }
    }

    function radialElev(F) {
        return F[R_CONT] * 0.88 + F[R_DETAIL] * 0.12 + (F[R_MASK] - 0.55);
    }
    function archipelagoElev(ctx, F) {
        // mask is in cells inside the island rim: about a cell and a half of beach, hills only
        // in the hearts of the larger islands
        const wT = ctx.gp.waterElevThresh != null ? ctx.gp.waterElevThresh : 0.43;
        const coast = (F[R_CONT] - FBM_MEAN[6]) * 6 + (F[R_DETAIL] - FBM_MEAN[4]) * 5;
        return wT + (F[R_MASK] + coast) * 0.05;
    }

    function classifyRadial(ctx, F, elev, seaShift) {
        const gp = ctx.gp;
        // (seaShift: the sea level moved to keep the land share in band; heights of the land stay)
        const wT = (gp.waterElevThresh != null ? gp.waterElevThresh : 0.43) + (seaShift || 0);
        if (elev < wT) return 'water';
        if (elev < wT + 0.05) return 'sand';
        let mo = F[R_MOIST] + (gp.moistShift != null ? gp.moistShift : 0);
        let fb = gp.forestMoistBoost != null ? gp.forestMoistBoost : 0;
        let mTh0 = gp.mountElevThresh != null ? gp.mountElevThresh : 0.86;
        let pk = F[R_PK], pk2 = F[R_PK2];
        let j = (gp.mountainPeakJitter != null ? gp.mountainPeakJitter : 0.09) * (pk - 0.5) * 2.2;
        let st = gp.mountainStyle || 'default';
        if (st === 'scattered') j += (pk2 - 0.5) * 0.13;
        else if (st === 'ring') {
            let rr = gp.mountainRingR != null ? gp.mountainRingR : 0.48;
            j += Math.abs(F[R_RDIST] - rr) < 0.14 ? -0.1 : 0.038;
        } else if (st === 'low') j += 0.095;
        else if (st === 'mixed') j += (pk * pk2 - 0.28) * 0.11;
        mTh0 += j;
        if (elev > mTh0) return F[R_PASS] > 0.6 ? 'hill' : 'mountain';
        if (elev > mTh0 - 0.08 && mo < 0.5) return 'hill';
        let sT = gp.sandThresh != null ? gp.sandThresh : 0.35;
        let gT = gp.grassThresh != null ? gp.grassThresh : 0.6;
        let fT = gp.forestThresh != null ? gp.forestThresh : 0.8;
        if (mo < sT + fb * 0.02) return 'sand';
        if (mo < gT + fb) return 'grass';
        if (mo < fT + fb * 0.5) return 'forest';
        return 'swamp';
    }

    function classifyRect(ctx, F, q, r, x, y) {
        const gp = ctx.gp;
        let macro = F[X_MACRO], meso = F[X_MESO], detail = F[X_DETAIL], moist = F[X_MOIST];
        let heightCore = macro * 0.45 + meso * 0.42 + detail * 0.13;
        let valleySoft = macro * meso + (1 - macro) * 0.06;
        let heightLand = Math.max(0.02, Math.min(0.93, heightCore - valleySoft * 0.17));
        let hiMicro = (F[X_HIMICRO] - 0.5) * 0.028;
        let hiMeso = (F[X_HIMESO] - 0.5) * 0.018;
        heightLand = Math.max(0.02, Math.min(0.93, heightLand + hiMicro + hiMeso));
        let edgePad = regionNorm(ctx, q, r, x, y);
        if (ctx.sym) {
            // the region's own rim of sea (the page paints the same on free maps)
            // (a square or a hexagon needs a rougher rim than the full rectangle to read as a coast)
            const wave = ctx.sym.type === 'rot' && ctx.sym.n >= 3 ? 4.2 + (F[X_WAVE] - FBM_MEAN[3]) * 24 : 1.5 + F[X_WAVE] * 5.5;
            if ((1 - edgePad) * Math.max(1, ctx.rows) <= wave) return 'water';
        }
        let interior = Math.max(0.08, 1 - edgePad * 0.72);
        let ridge = F[X_RIDGE];
        let riverCorridor = F[X_RIVC] * (0.32 + interior * 0.28);
        ridge = ridge - riverCorridor * 0.24;
        ridge += (F[X_RJIT] - 0.5) * 0.038;
        let coastalEdge = edgePad > 0.88;
        let lakeNoise = F[X_LAKE];
        let lakeBlob = !coastalEdge && macro < 0.21 && ridge < 0.3 && moist > 0.56 && moist < 0.84 && heightCore < 0.29 && lakeNoise > 0.61;
        let ridgeNeed = 0.5 + (1 - interior) * 0.07;
        let landNeed = 0.51 + (1 - interior) * 0.05;
        if (gp.rectBiomePreset === 'mountain') {
            ridgeNeed -= 0.065;
            landNeed -= 0.055;
        }
        let isMountain = ridge > ridgeNeed && heightLand > landNeed && !lakeBlob;
        if (lakeBlob) return 'water';
        if (isMountain) {
            let passNoise = F[X_PASS];
            let valleyWave = F[X_VALLEY];
            let valleyBreak = heightLand < 0.64 && Math.abs(valleyWave) < 0.24;
            if (valleyBreak && passNoise > 0.34) return 'hill';
            if (ridge < 0.62 && passNoise > 0.38) return 'hill';
            return heightLand > 0.72 ? 'hill' : 'mountain';
        }
        if (heightLand > 0.49 && ridge > 0.58) return 'hill';
        if (heightLand < 0.34 && ridge < 0.48 && macro < 0.46) return 'swamp';
        let bioJ = (F[X_BIOJ] - 0.5) * 0.045;
        let patch = F[X_PATCH];
        let bio = moist * 0.72 + (heightLand - 0.38) * 0.28 + (interior - 0.5) * 0.08 + patch * 0.04 + bioJ;
        let acc = gp.biomeAccent;
        if (acc === 'marsh') bio += 0.072 + edgePad * 0.038;
        else if (acc === 'dry') bio -= 0.078;
        else if (acc === 'rugged') bio += (heightLand - 0.43) * 0.065;
        else if (acc === 'flat_low_mtns') bio -= 0.035;
        if (bio < 0.255) return 'sand';
        if (bio < 0.495) return 'grass';
        if (bio < 0.735) return 'forest';
        return 'swamp';
    }

    // ---------------------------------------------------------- archipelago
    /** Islands of a balanced archipelago, in cells: for each player a home island (the first town),
     *  satellites close by (room for more towns), a pair of contested islands on each side towards
     *  the neighbours, a few islets, and sometimes a shared island in the middle. One player's set is
     *  laid out in its own wedge and turned onto the others, so every player gets the same islands.
     *  The same seed gives the same layout in the page (for the town planner) and in the worker. */
    function archipelagoLayout(d, ctxOpt) {
        const gp = d.genProfile || {}, sym = d.sym;
        if (!sym || sym.type !== 'rot') return null;
        const n = sym.n | 0, A = (Math.PI * 2) / n, base = sym.phase || 0;
        const cols = d.cols, rows = d.rows;
        const rnd = mulberry32(((gp.archSeed >>> 0) || 1) ^ 0x51ed270b);
        const scale = Math.max(0.62, rows / 48);
        const towns = Math.max(1, Math.min(4, gp.archTowns | 0 || 2));
        // region: ellipse (two players) or circle (three, four), with room for the edge sea
        const ax = (n === 2 ? cols : rows) - 8, ay = rows - 8;
        const GAP = 3.2; // open water kept between any two coasts (cells)
        const MARGIN = 2.2; // coast roughness allowance per island (cells)
        const rot = (q, r, k) => {
            const c = Math.cos(k * A), s = Math.sin(k * A);
            return [q * c - r * s, q * s + r * c];
        };
        // half-width of an (elliptical) island towards a direction
        const extent = (it, ux, uy) => {
            const c = Math.cos(it.ang), s = Math.sin(it.ang);
            const along = ux * c + uy * s, across = -ux * s + uy * c;
            return Math.sqrt((it.rad * it.asp * along) ** 2 + ((it.rad / it.asp) * across) ** 2);
        };
        const copyOf = (it, k) => {
            if (!k) return it;
            const [q, r] = rot(it.q, it.r, k);
            return { q, r, rad: it.rad, asp: it.asp, ang: it.ang + k * A };
        };
        // (the coast warp moves a big island's rim further than an islet's)
        const margin = it => Math.min(MARGIN, 1.1 + it.rad * 0.13);
        const apart = (a, b) => {
            const dx = b.q - a.q, dy = b.r - a.r, dd = Math.hypot(dx, dy);
            if (dd < 1e-6) return false;
            return dd >= extent(a, dx / dd, dy / dd) + extent(b, -dx / dd, -dy / dd) + GAP + margin(a) + margin(b);
        };
        const placed = []; // islands of wedge 0 (and the centre island)
        // clear of every island so far (all copies) and of its own copies
        const free = it => {
            for (const p of placed) for (let k = 0; k < n; k++) {
                if (p.centre && k > 0) break;
                if (!apart(it, copyOf(p, k))) return false;
            }
            for (let k = 1; k < n; k++) if (!apart(it, copyOf(it, k))) return false;
            return true;
        };
        // inside the region (with its edge sea) and inside the player's wedge, clear of the seams
        const fits = (it, wedge) => {
            const rho = Math.hypot(it.q, it.r);
            if (rho < 1e-6) return true;
            const ux = it.q / rho, uy = it.r / rho;
            const out = extent(it, ux, uy) + margin(it);
            const ex = ax - out, ey = ay - out;
            if (!(ex > 0 && ey > 0 && (it.q / ex) ** 2 + (it.r / ey) ** 2 <= 1)) return false;
            // (islands with towns stay inside their player's wedge; the others need only keep clear of the rest)
            if (!wedge) return true;
            let alpha = Math.atan2(it.r, it.q) - base;
            alpha = Math.atan2(Math.sin(alpha), Math.cos(alpha));
            const side = extent(it, -uy, ux) + margin(it) + GAP / 2;
            return rho > side && Math.abs(alpha) + Math.asin(Math.min(1, side / rho)) <= A / 2;
        };
        const polar = (rho, alpha) => [Math.cos(base + alpha) * rho, Math.sin(base + alpha) * rho];
        const reachAt = alpha => {
            const t = base + alpha, c = Math.cos(t), s = Math.sin(t);
            return 1 / Math.sqrt((c / ax) ** 2 + (s / ay) ** 2);
        };
        const tryAdd = (it, kind, extra) => {
            if (!fits(it, kind === 'home' || kind === 'satellite') || !free(it)) return null;
            Object.assign(it, { k: 1, kind }, extra || {});
            placed.push(it);
            return it;
        };
        // 1. an island towards the middle for each player (the nearest land to the enemy; no towns)
        const wantInner = rnd() < 0.6;
        const inner = [];
        if (wantInner) for (let tries = 0; tries < 50; tries++) {
            const rad = (4.4 + rnd() * 1.8) * Math.max(0.8, scale) * (n === 4 ? 0.9 : 1), asp = 1 + rnd() * 0.5;
            const alpha = (rnd() - 0.5) * A * 0.2;
            const rho = Math.min(ax, ay) * (0.16 + rnd() * 0.22);
            const [q, r] = polar(rho, alpha);
            const it = { q, r, rad, asp, ang: rnd() * Math.PI };
            if (!fits(it, false) || !free(it)) continue;
            Object.assign(it, { k: 1, kind: 'inner', towns: 0 });
            placed.push(it); inner.push(it);
            break;
        }
        // 2. home island: big enough for one or two towns, well out towards the player's edge.
        // (two towns fit along a long island: 8 cells apart, each with its footprint and a cell of shore)
        const twoTowns = it => it.rad >= 5.8 && it.rad * it.asp >= 8.3;
        let home = null;
        for (let tries = 0; tries < 160 && !home; tries++) {
            const shrink = 1 - Math.min(tries, 100) * 0.005;
            const rad = Math.max(5.6, (towns >= 2 ? 9.4 : 8.2) * scale * (n === 4 ? 0.8 : n === 3 ? 0.92 : 1) * shrink);
            const asp = towns >= 2 ? 1.18 + rnd() * 0.3 : 1.05 + rnd() * 0.3;
            const alpha = (rnd() - 0.5) * A * 0.14;
            const rho = reachAt(alpha) * (0.44 + rnd() * 0.32);
            const [q, r] = polar(rho, alpha);
            // its long way across the player's direction with room for that (two players), else outwards
            const ang = base + alpha + (n === 2 ? Math.PI / 2 : 0) + (rnd() - 0.5) * 0.8;
            const it = { q, r, rad, asp, ang };
            home = tryAdd(it, 'home', { towns: towns >= 2 && twoTowns(it) ? 2 : 1 });
            // (an inner island that leaves no room for the home islands goes)
            if (!home && tries === 80 && inner.length) { placed.splice(placed.indexOf(inner[0]), 1); inner.length = 0; }
        }
        // (no room for a home island: the page asks for new terrain)
        if (!home) return null;
        // 3. satellites with towns (one per town beyond the home island's)
        let sats = 0;
        const wantSat = Math.max(0, towns - home.towns);
        for (let tries = 0; tries < 480 && sats < wantSat; tries++) {
            const rad = Math.max(5.2, (5.7 + rnd() * 1.3) * scale * (n === 4 ? 0.92 : 1)), asp = 1 + rnd() * 0.3;
            const dir = rnd() * Math.PI * 2, ang = rnd() * Math.PI;
            const probe = { q: 0, r: 0, rad, asp, ang };
            const ux = Math.cos(dir), uy = Math.sin(dir);
            const dist = extent(home, ux, uy) + extent(probe, -ux, -uy) + GAP + margin(home) + margin(probe) + rnd() * 5 * scale;
            probe.q = home.q + ux * dist; probe.r = home.r + uy * dist;
            if (tryAdd(probe, 'satellite', { towns: 1 })) sats++;
        }
        // 4. contested islands towards each neighbour (each side of a seam belongs to the player on it)
        for (const side of [1, -1]) {
            for (let tries = 0; tries < 90; tries++) {
                const rad = (4.2 + rnd() * 1.8) * Math.max(0.8, scale) * (n === 4 ? 0.88 : 1), asp = 1 + rnd() * 0.6;
                const rho = reachAt(side * A * 0.42) * (0.3 + rnd() * 0.55);
                const alpha = side * (A / 2) * (0.5 + rnd() * 0.6);
                const [q, r] = polar(rho, alpha);
                if (tryAdd({ q, r, rad, asp, ang: rnd() * Math.PI }, 'contested', { towns: 0 })) break;
            }
        }
        // 5. outer islands anywhere in the wedge (scenery and room to expand)
        let outer = 0;
        const wantOuter = 2 + Math.floor(rnd() * 3);
        for (let tries = 0; tries < 260 && outer < wantOuter; tries++) {
            const rad = (3.2 + rnd() * 2.6) * Math.max(0.8, scale) * (n === 4 ? 0.88 : 1), asp = 1 + rnd() * 0.8;
            const alpha = (rnd() - 0.5) * A;
            const rho = reachAt(alpha) * (0.2 + rnd() * 0.8);
            const [q, r] = polar(rho, alpha);
            if (tryAdd({ q, r, rad, asp, ang: rnd() * Math.PI }, 'outer', { towns: 0 })) outer++;
        }
        // 6. islets for the look of an island group
        let islets = 0;
        const wantIslets = 4 + Math.floor(rnd() * 4);
        for (let tries = 0; tries < 200 && islets < wantIslets; tries++) {
            const rad = 1.6 + rnd() * 1.4, asp = 1 + rnd() * 0.5;
            const alpha = (rnd() - 0.5) * A;
            const rho = reachAt(alpha) * (0.12 + rnd() * 0.86);
            const [q, r] = polar(rho, alpha);
            if (tryAdd({ q, r, rad, asp, ang: rnd() * Math.PI }, 'islet', { towns: 0 })) islets++;
        }
        // every player's copy (positions and orientations turned)
        const all = [];
        for (const it of placed) {
            if (it.centre) { all.push(Object.assign({}, it, { player: -1 })); continue; }
            for (let k = 0; k < n; k++) {
                const [q, r] = rot(it.q, it.r, k);
                all.push(Object.assign({}, it, { q, r, ang: it.ang + k * A, player: k }));
            }
        }
        for (const it of all) { it.ca = Math.cos(it.ang); it.sa = Math.sin(it.ang); }
        return all;
    }

    /** Islands of an archipelago without balance (Balance off): the same kinds of island as the
     *  balanced layout, each player's home island and satellites wherever they fall (spread apart, never
     *  copies of each other), and the rest of the group scattered over the whole sea. */
    function archipelagoLayoutFree(d) {
        const gp = d.genProfile || {};
        const n = Math.max(1, Math.min(4, gp.archPlayers | 0 || 2));
        const cols = d.cols, rows = d.rows;
        const rnd = mulberry32(((gp.archSeed >>> 0) || 1) ^ 0x2f6b9d13);
        const scale = Math.max(0.62, rows / 48);
        const towns = Math.max(1, Math.min(4, gp.archTowns | 0 || 2));
        const ax = cols - 8, ay = rows - 8, GAP = 3.2, MARGIN = 2.2;
        const extent = (it, ux, uy) => {
            const c = Math.cos(it.ang), s = Math.sin(it.ang);
            const along = ux * c + uy * s, across = -ux * s + uy * c;
            return Math.sqrt((it.rad * it.asp * along) ** 2 + ((it.rad / it.asp) * across) ** 2);
        };
        const margin = it => Math.min(MARGIN, 1.1 + it.rad * 0.13);
        const placed = [];
        const free = it => placed.every(p => {
            const dx = p.q - it.q, dy = p.r - it.r, dd = Math.hypot(dx, dy);
            if (dd < 1e-6) return false;
            return dd >= extent(it, dx / dd, dy / dd) + extent(p, -dx / dd, -dy / dd) + GAP + margin(it) + margin(p);
        });
        const fits = it => {
            const rho = Math.hypot(it.q, it.r);
            const out = rho < 1e-6 ? it.rad * it.asp + margin(it) : extent(it, it.q / rho, it.r / rho) + margin(it);
            const ex = ax - out, ey = ay - out;
            return ex > 0 && ey > 0 && (it.q / ex) ** 2 + (it.r / ey) ** 2 <= 1;
        };
        const randomPoint = () => {
            const t = rnd() * Math.PI * 2, u = Math.sqrt(rnd());
            return [Math.cos(t) * ax * u, Math.sin(t) * ay * u];
        };
        const twoTowns = it => it.rad >= 5.8 && it.rad * it.asp >= 8.3;
        // 1. home islands, spread out: of a few random spots each time, the one furthest from the others.
        // Every player's home island has the same size and shape (only its place and heading differ), so
        // the shares of land start out level.
        const homeAsp = towns >= 2 ? 1.18 + rnd() * 0.3 : 1.05 + rnd() * 0.3;
        let homeRad = Math.max(5.6, (towns >= 2 ? 9.4 : 8.2) * scale * (n >= 4 ? 0.85 : 1));
        const homes = [];
        for (let p = 0; p < n; p++) {
            let best = null, bestD = -1;
            for (let tries = 0; tries < 220; tries++) {
                // (no room: every home island shrinks alike)
                if (tries === 160) { homeRad = Math.max(5.6, homeRad * 0.9); for (const h of homes) h.rad = homeRad; }
                const [q, r] = randomPoint();
                const it = { q, r, rad: homeRad, asp: homeAsp, ang: rnd() * Math.PI };
                if (!fits(it) || !free(it)) continue;
                const dHome = homes.length ? Math.min(...homes.map(h => Math.hypot(h.q - q, h.r - r))) : rnd();
                if (dHome > bestD) { bestD = dHome; best = it; }
                if (tries >= 14 && best) break;
            }
            if (!best) return null;
            Object.assign(best, { k: 1, kind: 'home', player: p, towns: towns >= 2 && twoTowns(best) ? 2 : 1 });
            placed.push(best); homes.push(best);
        }
        // (all homes alike, so all hold the same number of towns)
        for (const h of homes) h.towns = towns >= 2 && twoTowns(h) ? 2 : 1;
        // 2. satellites for the towns the home islands cannot hold (the same sizes for everybody)
        const satSizes = [];
        for (let i = 0; i < 3; i++) satSizes.push({ rad: Math.max(5.2, (5.7 + rnd() * 1.3) * scale), asp: 1 + rnd() * 0.3 });
        for (const home of homes) {
            let sats = 0;
            for (let tries = 0; tries < 400 && sats < towns - home.towns; tries++) {
                const rad = satSizes[sats].rad, asp = satSizes[sats].asp;
                const it = { q: 0, r: 0, rad, asp, ang: rnd() * Math.PI };
                const dir = rnd() * Math.PI * 2, ux = Math.cos(dir), uy = Math.sin(dir);
                const dist = extent(home, ux, uy) + extent(it, -ux, -uy) + GAP + margin(home) + margin(it) + rnd() * 5 * scale;
                it.q = home.q + ux * dist; it.r = home.r + uy * dist;
                if (!fits(it) || !free(it)) continue;
                Object.assign(it, { k: 1, kind: 'satellite', player: home.player, towns: 1 });
                placed.push(it); sats++;
            }
        }
        // 3. the rest of the group: larger islands, then islets, anywhere
        const wantOuter = Math.round(n * (2.2 + rnd() * 1.6)), wantIslets = Math.round(n * (3 + rnd() * 2));
        for (let i = 0, tries = 0; i < wantOuter && tries < 600; tries++) {
            const [q, r] = randomPoint();
            const it = { q, r, rad: (3.4 + rnd() * 3) * Math.max(0.8, scale), asp: 1 + rnd() * 0.8, ang: rnd() * Math.PI };
            if (!fits(it) || !free(it)) continue;
            Object.assign(it, { k: 1, kind: 'outer', player: -1, towns: 0 });
            placed.push(it); i++;
        }
        for (let i = 0, tries = 0; i < wantIslets && tries < 600; tries++) {
            const [q, r] = randomPoint();
            const it = { q, r, rad: 1.6 + rnd() * 1.4, asp: 1 + rnd() * 0.5, ang: rnd() * Math.PI };
            if (!fits(it) || !free(it)) continue;
            Object.assign(it, { k: 1, kind: 'islet', player: -1, towns: 0 });
            placed.push(it); i++;
        }
        for (const it of placed) { it.ca = Math.cos(it.ang); it.sa = Math.sin(it.ang); }
        return placed;
    }

    // ------------------------------------------------------- the generators
    function generateFreeTerrainCells(d) {
        const ctx = makeContext(Object.assign({}, d, { sym: null }));
        const rows = d.rows, cols = d.cols, spacing = d.spacing;
        let hexList = [];
        let rMin = d.rowMin != null ? d.rowMin : -rows;
        let rMax = d.rowMax != null ? d.rowMax : rows;
        const F = new Float64Array(16);
        const whole = d.rowMin == null && d.rowMax == null;
        const archi = ctx.mapShape === 'archipelago' && !!ctx.islands;
        // (a whole map with a land band: heights first, then the sea level that keeps the land share in band)
        const calibrate = ctx.radial && whole && d.landBand && d.landBand.length === 2;
        const kept = calibrate ? [] : null;
        for (let r = rMin; r <= rMax; r++) {
            for (let q = -cols; q <= cols; q++) {
                let x = q * spacing, y = r * spacing, type = 'water';
                fieldsAt(ctx, x, y, F);
                if (ctx.rect) type = classifyRect(ctx, F, q, r, x, y);
                else if (calibrate) kept.push([F.slice(0, R_COUNT), archi ? archipelagoElev(ctx, F) : radialElev(F)]);
                else type = classifyRadial(ctx, F, archi ? archipelagoElev(ctx, F) : radialElev(F));
                hexList.push({ q, r, x, y, type });
            }
        }
        if (calibrate) {
            const wT = ctx.gp.waterElevThresh != null ? ctx.gp.waterElevThresh : 0.43, band = d.landBand;
            const lo = band[0] + (band[1] - band[0]) * 0.22, hi = band[1] - (band[1] - band[0]) * 0.22;
            const sorted = kept.map(k => k[1]).sort((a, b) => b - a);
            let land = 0;
            for (const e of sorted) if (e >= wT) land++;
            const frac = land / sorted.length, target = frac < lo ? lo : frac > hi ? hi : frac;
            let sea = 0;
            if (target !== frac) {
                const e = sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(target * sorted.length) - 1))];
                sea = Math.max(-0.3, Math.min(0.3, e - wT));
            }
            for (let i = 0; i < hexList.length; i++) hexList[i].type = classifyRadial(ctx, kept[i][0], kept[i][1], sea);
        }
        if (whole) smoothTerrainHexList(hexList);
        return hexList;
    }

    function generateSymTerrainCells(d) {
        const ctx = makeContext(d);
        const G = ctx.G, rows = d.rows, cols = d.cols, sp = d.spacing, N = G.N;
        const hexList = new Array(N);
        const isRep = i => G.rep[i] === i && !G.outside[i];
        const F = new Float64Array(16);
        // Fields at the representatives only; everything else is a copy.
        const elev = ctx.radial ? new Float64Array(N) : null;
        const fields = ctx.radial ? new Float64Array(N * R_COUNT) : null;
        const archi = ctx.mapShape === 'archipelago' && !!ctx.islands;
        for (let r = -rows; r <= rows; r++) {
            for (let q = -cols; q <= cols; q++) {
                const i = (r + rows) * G.W + (q + cols), x = q * sp, y = r * sp;
                const h = { q, r, x, y, type: 'water' };
                hexList[i] = h;
                if (!isRep(i)) continue;
                fieldsAt(ctx, x, y, F);
                if (ctx.rect) h.type = classifyRect(ctx, F, q, r, x, y);
                else {
                    elev[i] = archi ? archipelagoElev(ctx, F) : radialElev(F);
                    for (let k = 0; k < R_COUNT; k++) fields[i * R_COUNT + k] = F[k];
                }
            }
        }
        if (ctx.radial) {
            // Keep the land share inside the accepted band (the page rejects maps outside it): the
            // sea level is moved, never the shape of the land.
            let shift = 0;
            const band = d.landBand;
            const wT = ctx.gp.waterElevThresh != null ? ctx.gp.waterElevThresh : 0.43;
            if (band && band.length === 2) {
                const lo = band[0] + (band[1] - band[0]) * 0.22, hi = band[1] - (band[1] - band[0]) * 0.22;
                const vals = [];
                let total = 0;
                const weight = new Float64Array(N);
                for (let i = 0; i < N; i++) { const rp = G.rep[i]; if (!G.outside[i]) weight[rp] += 1; }
                for (let i = 0; i < N; i++) if (isRep(i)) { vals.push([elev[i], weight[i]]); }
                total = N;
                vals.sort((a, b) => b[0] - a[0]);
                let land = 0;
                for (const [e, w] of vals) if (e >= wT) land += w;
                const frac = land / total;
                const target = frac < lo ? lo : frac > hi ? hi : frac;
                if (target !== frac) {
                    let acc = 0;
                    for (const [e, w] of vals) {
                        acc += w;
                        if (acc / total >= target) { shift = wT - e; break; }
                    }
                    shift = Math.max(-0.3, Math.min(0.3, shift));
                }
            }
            for (let i = 0; i < N; i++) {
                if (!isRep(i)) continue;
                for (let k = 0; k < R_COUNT; k++) F[k] = fields[i * R_COUNT + k];
                hexList[i].type = classifyRadial(ctx, F, elev[i], -shift);
            }
        }
        const copy = () => {
            for (let i = 0; i < N; i++) {
                if (G.outside[i]) { hexList[i].type = 'water'; continue; }
                const rp = G.rep[i];
                if (rp !== i) hexList[i].type = hexList[rp].type;
            }
        };
        copy();
        smoothTerrainHexList(hexList);
        copy();
        return hexList;
    }

    function generateTerrainCells(d) {
        if (d && d.sym) return generateSymTerrainCells(d);
        return generateFreeTerrainCells(d);
    }

    // Loaded as a worker it answers messages; loaded by the page (index.html) it offers the same functions as
    // WodTerrainGen, so the main thread never needs a copy of this code. A stand-in worker that runs this file
    // with its own `self` (the headless map test) counts as a worker.
    const runsAsWorker = typeof window === 'undefined' || (typeof self !== 'undefined' && self !== window)
        || (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope);
    if (!runsAsWorker) {
        globalThis.WodTerrainGen = Object.freeze({
            generateTerrainCells, smoothTerrainHexList, buildSymGroup, symField, symViews, archipelagoLayout, archipelagoLayoutFree, fbm, FBM_MEAN
        });
        return;
    }
    self.onmessage = function (ev) {
        let d = ev.data;
        if (!d) return;
        if (d.cmd === 'smooth') {
            try {
                let list = Array.isArray(d.hexList) ? d.hexList : [];
                smoothTerrainHexList(list);
                self.postMessage({ ok: true, hexList: list, jobId: d.jobId });
            } catch (err) {
                self.postMessage({ ok: false, err: String(err && err.message ? err.message : err), jobId: d.jobId });
            }
            return;
        }
        if (d.cmd !== 'terrain') return;
        try {
            let hexList = generateTerrainCells(d);
            self.postMessage({ ok: true, hexList, jobId: d.jobId });
        } catch (err) {
            self.postMessage({ ok: false, err: String(err && err.message ? err.message : err), jobId: d.jobId });
        }
    };
})();
