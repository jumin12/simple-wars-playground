/* eslint-disable no-restricted-globals */
/** Off-thread procedural terrain heightmap / biome grid for Simple Wars map generation. */
(function () {
    function mix(a, b, t) {
        return a * (1 - t) + b * t;
    }
    function hash(n) {
        let s = Math.sin(n) * 43758.5453123;
        return s - Math.floor(s);
    }
    function noise(x, y) {
        let p = [Math.floor(x), Math.floor(y)];
        let f = [x - p[0], y - p[1]];
        f[0] = f[0] * f[0] * (3.0 - 2.0 * f[0]);
        f[1] = f[1] * f[1] * (3.0 - 2.0 * f[1]);
        let n = p[0] + p[1] * 57.0;
        return mix(mix(hash(n + 0.0), hash(n + 1.0), f[0]), mix(hash(n + 57.0), hash(n + 58.0), f[0]), f[1]);
    }
    function fbm(x, y, octaves) {
        let v = 0,
            a = 0.5;
        for (let i = 0; i < octaves; i++) {
            v += a * noise(x, y);
            x *= 2;
            y *= 2;
            a *= 0.5;
        }
        return v;
    }

    function usesRadial(mapShape) {
        return mapShape === 'island' || mapShape === 'ring' || mapShape === 'archipelago';
    }
    function usesRect(mapShape) {
        return mapShape === 'rectangle' || mapShape === 'forest' || mapShape === 'mountain' || mapShape === 'desert';
    }

    function generateTerrainCells(d) {
        let mapR = d.mapR;
        let hr = d.hr;
        let mapShape = d.mapShape;
        let gp = d.genProfile || {};
        let seedOffset = d.seedOffset;
        let cols = d.cols;
        let rows = d.rows;
        let spacing = d.spacing;
        let radial = usesRadial(mapShape);
        let rect = usesRect(mapShape);
        let hexList = [];
        let scale = 0.004;
        let rMin = d.rowStart != null ? d.rowStart : -rows;
        let rMax = d.rowEnd != null ? d.rowEnd : rows;

        for (let r = rMin; r <= rMax; r++) {
            for (let q = -cols; q <= cols; q++) {
                let x = q * spacing;
                let y = r * spacing;
                let islandRadialDist = 0;
                let warpX = fbm(x * scale + seedOffset, y * scale + seedOffset, 3) * 260;
                let warpY = fbm(x * scale + seedOffset + 100, y * scale + seedOffset + 100, 3) * 260;
                let mask = 1.0;

                if (radial) {
                    let normX = x / (mapR * spacing * 0.95);
                    let normY = y / (rows * spacing * 0.95);
                    let sx = normX * (gp.stretchX != null ? gp.stretchX : 1);
                    let sy = normY * (gp.stretchY != null ? gp.stretchY : 1);
                    let dist = Math.sqrt(sx * sx + sy * sy);
                    islandRadialDist = dist;
                    let angle = Math.atan2(y, x);
                    let radialWarp =
                        (fbm(Math.cos(angle) * 2.4 + seedOffset, Math.sin(angle) * 2.4 + seedOffset, 4) - 0.5) *
                        (gp.coastNoiseAmp != null ? gp.coastNoiseAmp : 0.45);
                    mask = 1.12 - dist + radialWarp;
                    if (mapShape === 'ring') {
                        let ri0 = gp.ringInnerFrac != null ? gp.ringInnerFrac : 0.24;
                        let ro0 = gp.ringOuterFrac != null ? gp.ringOuterFrac : 0.93;
                        let coastW = fbm(x * scale * 1.75 + seedOffset + 3120, y * scale * 1.75 + seedOffset + 3120, 4);
                        let coastW2 = fbm(x * scale * 3.1 + seedOffset + 5140, y * scale * 3.1 + seedOffset + 5140, 3);
                        let coastW3 = fbm(Math.cos(angle) * 2.1 + seedOffset, Math.sin(angle) * 2.1 + seedOffset + 880, 4);
                        let ri = ri0 + (coastW - 0.5) * 0.095 + (coastW2 - 0.5) * 0.052 + (coastW3 - 0.5) * 0.04;
                        let ro = ro0 + (coastW * 0.65 + coastW2 * 0.35 - 0.5) * 0.11 + Math.cos(angle * 2.15 + seedOffset * 0.019) * 0.035;
                        ri = Math.max(0.07, Math.min(0.44, ri));
                        ro = Math.max(ri + 0.11, Math.min(0.98, ro));
                        let bandWobble = Math.cos(angle * 2.05 + seedOffset * 0.017) * 0.045 + (coastW2 - 0.5) * 0.038;
                        if (dist < ri) mask = 0.05;
                        else if (dist > ro) mask = 0.06;
                        else
                            mask =
                                1.04 +
                                radialWarp * 0.92 +
                                bandWobble -
                                ((dist - ri) / Math.max(0.08, ro - ri)) * (0.26 + (coastW - 0.5) * 0.04);
                    } else if (mapShape === 'archipelago') {
                        let punch = gp.archipelagoCenterClearFrac != null ? gp.archipelagoCenterClearFrac : 0.55;
                        mask -= Math.max(0, punch - dist) * 1.62;
                        let cells = fbm(x * scale * 1.35 + seedOffset + 444, y * scale * 1.35 + seedOffset + 444, 4);
                        mask -= Math.max(0, cells - 0.32) * 0.72;
                        let ch = fbm(x * scale * 2 + seedOffset + 2444, y * scale * 2 + seedOffset + 2444, 4);
                        mask -= Math.max(0, ch - 0.38) * 0.52;
                    } else {
                        if (gp.islandMode === 'elongated') mask += Math.cos(angle * 2.05 + seedOffset * 0.02) * 0.07;
                        if (gp.islandMode === 'archipelago') {
                            let cells = fbm(x * scale * 1.35 + seedOffset + 444, y * scale * 1.35 + seedOffset + 444, 4);
                            mask -= Math.max(0, cells - 0.36) * 0.62;
                        }
                        if (gp.islandMode === 'broken') {
                            let cuts = fbm(x * scale * 1.85 + seedOffset + 1444, y * scale * 1.85 + seedOffset + 1444, 5);
                            mask -= Math.max(0, cuts - 0.31) * 0.78;
                            mask += (fbm(x * scale * 0.72 + seedOffset + 1888, y * scale * 0.72 + seedOffset + 1888, 3) - 0.5) * 0.12;
                        }
                        if (gp.islandMode === 'crescent') mask -= Math.max(0, 0.38 - Math.abs(dist - 0.56)) * 0.72;
                        if (gp.islandMode === 'atoll') {
                            let ring = gp.atollRing != null ? gp.atollRing : 0.48;
                            let band = Math.abs(dist - ring);
                            mask -= Math.max(0, 0.22 - band) * 1.05;
                            mask += (fbm(x * scale * 1.1 + seedOffset + 2100, y * scale * 1.1 + seedOffset + 2100, 3) - 0.5) * 0.08;
                        }
                        if (gp.islandMode === 'chain') {
                            let ax = gp.chainAX != null ? gp.chainAX : -0.46;
                            let ay = gp.chainAY != null ? gp.chainAY : 0.28;
                            let bx = gp.chainBX != null ? gp.chainBX : 0.52;
                            let by = gp.chainBY != null ? gp.chainBY : -0.12;
                            let d2 = Math.sqrt((normX - ax) * (normX - ax) + (normY + ay) * (normY + ay));
                            let d3 = Math.sqrt((normX + bx) * (normX + bx) + (normY - by) * (normY - by));
                            dist = Math.min(dist, d2 * 0.9, d3 * 0.88);
                            mask = 1.1 - dist + radialWarp * 0.92;
                        }
                        if (gp.islandMode === 'double') {
                            let ax = gp.chainAX != null ? gp.chainAX * 0.58 : -0.32;
                            let ay = gp.chainAY != null ? gp.chainAY * 0.42 : 0.12;
                            let bx = gp.chainBX != null ? gp.chainBX * 0.58 : 0.34;
                            let by = gp.chainBY != null ? gp.chainBY * 0.42 : -0.1;
                            let d2 = Math.sqrt((normX - ax) * (normX - ax) + (normY - ay) * (normY - ay));
                            let d3 = Math.sqrt((normX - bx) * (normX - bx) + (normY - by) * (normY - by));
                            let neck = Math.abs(normY - (ay + by) * 0.5) + Math.abs(normX - (ax + bx) * 0.5) * 0.25;
                            mask =
                                1.08 -
                                Math.min(d2 * 0.92, d3 * 0.92, dist * 1.08) +
                                radialWarp * 0.86 -
                                Math.max(0, 0.18 - neck) * 0.18;
                        }
                        if (gp.islandMode === 'hook') {
                            let hookBite = Math.max(0, 0.42 - Math.abs(dist - 0.58));
                            let openSide = Math.sin(angle + seedOffset * 0.017);
                            mask -= hookBite * Math.max(0, openSide) * 0.78;
                            mask += Math.cos(angle - seedOffset * 0.011) * 0.055;
                        }
                        if (gp.islandMode === 'wide') mask += 0.055 - Math.abs(sy) * 0.11;
                    }
                    let boxFrac = Math.max(Math.abs(q) / Math.max(cols, 1), Math.abs(r) / Math.max(rows, 1));
                    mask -= Math.pow(Math.max(0, boxFrac - 0.74), 1.45) * 0.92;
                }

                let continent = fbm((x + warpX) * scale + seedOffset, (y + warpY) * scale + seedOffset, 6);
                let detail = fbm(x * scale * 3 + seedOffset + 2000, y * scale * 3 + seedOffset + 2000, 4);
                let elev = continent * 0.8 + detail * 0.2 + (mask - 0.55);
                let moist = fbm((x + warpX) * scale + seedOffset + 5000, (y + warpY) * scale + seedOffset + 5000, 4);
                let mo = moist + (gp.moistShift != null ? gp.moistShift : 0);
                let fb = gp.forestMoistBoost != null ? gp.forestMoistBoost : 0;
                let type = 'water';

                if (rect) {
                    let wx = x + warpX;
                    let wy = y + warpY;
                    let u = wx * scale;
                    let v = wy * scale;
                    let macro = continent;
                    let meso = fbm(wx * scale * 1.42 + seedOffset + 6110, wy * scale * 1.42 + seedOffset + 6110, 5);
                    let heightCore = macro * 0.41 + meso * 0.38 + detail * 0.21;
                    let valleySoft = macro * meso + (1 - macro) * 0.06;
                    let heightLand = Math.max(0.02, Math.min(0.93, heightCore - valleySoft * 0.17));
                    let hiMicro =
                        (fbm(wx * scale * 5.9 + seedOffset + 7211, wy * scale * 5.9 + seedOffset + 7211, 3) - 0.5) * 0.048;
                    let hiMeso =
                        (fbm(wx * scale * 8.4 + seedOffset + 1122, wy * scale * 8.4 + seedOffset + 1122, 2) - 0.5) * 0.032;
                    heightLand = Math.max(0.02, Math.min(0.93, heightLand + hiMicro + hiMeso));
                    let edgePad = Math.max(Math.abs(q) / Math.max(mapR, 1), Math.abs(r) / Math.max(rows, 1));
                    let interior = Math.max(0.08, 1 - edgePad * 0.72);
                    let ridge = fbm(wx * scale * 2.45 + seedOffset + 6500, wy * scale * 2.45 + seedOffset + 6500, 5);
                    let riverCorridor = Math.abs(Math.sin(u * 1.12 + v * 0.88 + seedOffset * 0.019)) * (0.32 + interior * 0.28);
                    ridge = ridge - riverCorridor * 0.24;
                    ridge += (fbm(wx * scale * 6.15 + seedOffset + 3301, wy * scale * 6.15 + seedOffset + 3301, 3) - 0.5) * 0.038;
                    let coastalEdge = edgePad > 0.88;
                    let lakeNoise = fbm(wx * scale * 1.72 + seedOffset + 7010, wy * scale * 1.72 + seedOffset + 7010, 4);
                    let lakeBlob =
                        !coastalEdge &&
                        macro < 0.21 &&
                        ridge < 0.3 &&
                        moist > 0.56 &&
                        moist < 0.84 &&
                        heightCore < 0.29 &&
                        lakeNoise > 0.61;
                    let ridgeNeed = 0.5 + (1 - interior) * 0.07;
                    let landNeed = 0.51 + (1 - interior) * 0.05;
                    if (gp.rectBiomePreset === 'mountain') {
                        ridgeNeed -= 0.065;
                        landNeed -= 0.055;
                    }
                    let isMountain = ridge > ridgeNeed && heightLand > landNeed && !lakeBlob;
                    if (lakeBlob) type = 'water';
                    else if (isMountain) {
                        let passNoise = fbm(x * scale * 5 + seedOffset + 3000, y * scale * 5 + seedOffset + 3000, 4);
                        let valleyWave = Math.sin(u * -1.95 + v * 1.42 + meso * 0.5 + seedOffset * 0.45);
                        let valleyBreak = heightLand < 0.64 && Math.abs(valleyWave) < 0.24;
                        if (valleyBreak && passNoise > 0.34) type = 'hill';
                        else if (ridge < 0.62 && passNoise > 0.38) type = 'hill';
                        else type = heightLand > 0.72 ? 'hill' : 'mountain';
                    } else if (heightLand > 0.49 && ridge > 0.58) type = 'hill';
                    else if (heightLand < 0.34 && ridge < 0.48 && macro < 0.46) type = 'swamp';
                    else {
                        let bioJ =
                            (fbm(wx * scale * 4.35 + seedOffset + 9120, wy * scale * 4.35 + seedOffset + 9120, 4) - 0.5) *
                            0.095;
                        let patch = fbm(wx * scale * 2.12 + seedOffset + 8140, wy * scale * 2.12 + seedOffset + 8140, 5);
                        let bio =
                            moist * 0.67 + (heightLand - 0.38) * 0.33 + (interior - 0.5) * 0.095 + patch * 0.07 + bioJ;
                        let acc = gp.biomeAccent;
                        if (acc === 'marsh') bio += 0.072 + edgePad * 0.038;
                        else if (acc === 'dry') bio -= 0.078;
                        else if (acc === 'rugged') bio += (heightLand - 0.43) * 0.065;
                        else if (acc === 'flat_low_mtns') bio -= 0.035;
                        if (bio < 0.255) type = 'sand';
                        else if (bio < 0.495) type = 'grass';
                        else if (bio < 0.735) type = 'forest';
                        else type = 'swamp';
                    }
                } else if (elev < (gp.waterElevThresh != null ? gp.waterElevThresh : 0.43)) type = 'water';
                else if (elev < (gp.waterElevThresh != null ? gp.waterElevThresh : 0.43) + 0.05) type = 'sand';
                else {
                    let mTh0 = gp.mountElevThresh != null ? gp.mountElevThresh : 0.86;
                    if (radial) {
                        let pk = fbm(x * scale * 2.55 + seedOffset + 7711, y * scale * 2.55 + seedOffset + 7711, 5);
                        let pk2 = fbm(x * scale * 5.1 + seedOffset + 3322, y * scale * 5.1 + seedOffset + 3322, 4);
                        let j = (gp.mountainPeakJitter != null ? gp.mountainPeakJitter : 0.09) * (pk - 0.5) * 2.2;
                        let st = gp.mountainStyle || 'default';
                        if (st === 'scattered') j += (pk2 - 0.5) * 0.13;
                        else if (st === 'ring') {
                            let rr = gp.mountainRingR != null ? gp.mountainRingR : 0.48;
                            j += Math.abs(islandRadialDist - rr) < 0.14 ? -0.1 : 0.038;
                        } else if (st === 'low') j += 0.095;
                        else if (st === 'mixed') j += (pk * pk2 - 0.28) * 0.11;
                        mTh0 += j;
                    }
                    if (elev > mTh0) {
                        let passNoise = fbm(x * scale * 5 + seedOffset + 3000, y * scale * 5 + seedOffset + 3000, 3);
                        if (passNoise > 0.6) type = 'hill';
                        else type = 'mountain';
                    } else if (elev > mTh0 - 0.08 && mo < 0.5) type = 'hill';
                    else {
                        let st = gp.sandThresh != null ? gp.sandThresh : 0.35;
                        let gt = gp.grassThresh != null ? gp.grassThresh : 0.6;
                        let ft = gp.forestThresh != null ? gp.forestThresh : 0.8;
                        if (mo < st + fb * 0.02) type = 'sand';
                        else if (mo < gt + fb) type = 'grass';
                        else if (mo < ft + fb * 0.5) type = 'forest';
                        else type = 'swamp';
                    }
                }

                hexList.push({ q, r, x, y, type });
            }
        }
        return hexList;
    }

    self.onmessage = function (ev) {
        let d = ev.data;
        if (!d || d.cmd !== 'terrain') return;
        try {
            let hexList = generateTerrainCells(d);
            self.postMessage({ ok: true, hexList, jobId: d.jobId });
        } catch (err) {
            self.postMessage({ ok: false, err: String(err && err.message ? err.message : err), jobId: d.jobId });
        }
    };
})();
