// Pathfinding, steering, traffic and terrain-safe movement.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

function wodBuildHexIndex(H) {
    let q0 = Infinity, q1 = -Infinity, r0 = Infinity, r1 = -Infinity, n = 0;
    for(const k in H) { const h = H[k]; if(!h) continue; n++; if(h.q < q0) q0 = h.q; if(h.q > q1) q1 = h.q; if(h.r < r0) r0 = h.r; if(h.r > r1) r1 = h.r; }
    if(!n || !Number.isFinite(q0 + q1 + r0 + r1) || (q1 - q0 + 1) * (r1 - r0 + 1) > 4e6) return {src: H, q0: 1, q1: 0, r0: 1, r1: 0, w: 0, a: [], miss: 0};
    const w = q1 - q0 + 1, a = new Array(w * (r1 - r0 + 1)).fill(null);
    for(const k in H) { const h = H[k]; if(h && Number.isInteger(h.q) && Number.isInteger(h.r) && k === h.q + ',' + h.r) a[(h.r - r0) * w + (h.q - q0)] = h; }
    return {src: H, q0, q1, r0, r1, w, a, miss: 0};
}
function wodHexAt(q, r) {
    const H = gameData.hexes;
    let I = _wodHexIdx;
    if(!I || I.src !== H) I = _wodHexIdx = wodBuildHexIndex(H);
    const inside = q >= I.q0 && q <= I.q1 && r >= I.r0 && r <= I.r1;
    if(inside) { const h = I.a[(r - I.r0) * I.w + (q - I.q0)]; if(h) return h; }
    const h = H[`${q},${r}`];
    if(h) {
        if(inside && Number.isInteger(+q) && Number.isInteger(+r)) I.a[(r - I.r0) * I.w + (q - I.q0)] = h;
        else if(++I.miss > 48) _wodHexIdx = null;
    }
    return h;
}
function getNearestHexToPoint(x, y) {
    const spacing = gameData.hexRadius * 1.35;
    return wodHexAt(Math.round(x / spacing), Math.round(y / spacing));
}
function canUseHexForMovement(unit, hex) {
    return wodPathTileWalkable(unit, hex, wodOrderIntoWater(unit, hex));
}
/** Resolve land-army move orders: honor water clicks; otherwise snap to shore/bridge. */
function wodResolveLandMarchHex(unit, x, y, startHexOpt) {
    if(!wodUnitPrefersLandOnlyPath(unit)) return null;
    const clicked=getNearestHexToPoint(x,y);
    if(clicked&&!isWaterHex(clicked)&&wodHexWalkableForLandPath(unit,clicked,false))
        return {hex:clicked,exactX:x,exactY:y,intoWater:false};
    if(gameData.bridges && gameData.bridges.length) {
        wodEnsureBridgePathIndex();
        for(let bi = 0, bl = gameData.bridges.length; bi < bl; bi++) {
            let br = gameData.bridges[bi];
            if(!br) continue;
            if(br.x == null) wodSyncBridgeWorldCoords(br);
            if(!wodPointInBridgeRect(x, y, br, 1.05)) continue;
            let bh = wodBridgeHexAtPoint(unit, x, y);
            if(bh) return { hex: bh, exactX: x, exactY: y, intoWater: false };
        }
    }
    let coord = pixelToHex(x, y);
    let direct = wodHexAt(coord.q,coord.r);
    if(direct && isBridgeHex(direct)&&wodPointOnBridgeForUnit(unit,x,y,1.05))
        return { hex: direct, exactX: x, exactY: y, intoWater: false };
    if(direct && wodHexWalkableForLandPath(unit, direct, false) && !isBridgeHex(direct) && !isWaterHex(direct))
        return { hex: direct, exactX: x, exactY: y, intoWater: false };
    // Pure land near a bridge stays on land — radius bridge scans must not steal
    // formation slots / short land marches onto the deck.
    let nearestLand = getNearestHexToPoint(x, y);
    if(nearestLand && !isWaterHex(nearestLand) && !isBridgeHex(nearestLand) &&
        (nearestLand.type !== 'mountain'||wodCanClimb(unit)) && wodHexWalkableForLandPath(unit, nearestLand, false))
        return { hex: nearestLand, exactX: x, exactY: y, intoWater: false };
    // (only a player means a point in the water as a swim: an AI march to a point just off the shore, or beside a
    // bridge deck, is to the dry ground or deck nearest it; taken as a swim it waded out along the coast)
    const aiLand=!wodMpIsHumanOwner(unit.owner)&&isLandArmyUnit(unit);
    // A point in the water beside a bridge deck (not on it) means the bank there, not a swim (the player wants the unit
    // near the bridge): taken as a swim, the water cells along a deck count as bridge cells, so the unit walked out onto
    // the bridge, along the deck and stepped off its side. A point in open water away from bridges is still a swim.
    if(!aiLand&&direct&&isWaterHex(direct)&&!wodPointOnBridgeForUnit(unit,x,y,1.05)){
        const bank=wodBankBesideBridgeClick(unit,x,y,startHexOpt);
        if(bank)return {hex:bank,exactX:bank.x,exactY:bank.y,intoWater:false};
    }
    if(!aiLand&&direct&&isWaterHex(direct)&&!wodPointOnBridgeForUnit(unit,x,y,1.05))return {hex:direct,exactX:x,exactY:y,intoWater:true};
    let bridgeHex = wodBridgeHexAtPoint(unit, x, y);
    if(bridgeHex && (wodPointOnBridgeForUnit(unit, x, y, 1.05) ||
        (nearestLand && (wodIsOpenWaterHex(nearestLand) || isBridgeHex(nearestLand)))))
        return { hex: bridgeHex, exactX: x, exactY: y, intoWater: false };
    if(!aiLand && direct && isWaterHex(direct) && !isBridgeHex(direct) && direct.type !== 'mountain') {
        let bestW = null,
            bestWd = Infinity;
        for(let pt of getHexesInRadius(coord.q, coord.r, 10)) {
            let wh = wodHexAt(pt.q,pt.r);
            if(!wh || !isWaterHex(wh) || isBridgeHex(wh) || wh.type === 'mountain') continue;
            let dx = x - wh.x,
                dy = y - wh.y;
            let d = dx * dx + dy * dy;
            if(d < bestWd) {
                bestWd = d;
                bestW = wh;
            }
        }
        let waterHex = bestW || direct;
        return { hex: waterHex, exactX: x, exactY: y, intoWater: true };
    }
    if(direct && wodHexWalkableForLandPath(unit, direct, false))
        return { hex: direct, exactX: x, exactY: y, intoWater: false };
    let startHex = startHexOpt || getNearestWalkableHexForUnit(unit, unit.x, unit.y);
    let best = null,
        bestScore = Infinity;
    for(let pt of getHexesInRadius(coord.q, coord.r, 24)) {
        let hex = wodHexAt(pt.q,pt.r);
        if(!wodHexWalkableForLandPath(unit, hex, false)) continue;
        let dx = x - hex.x,
            dy = y - hex.y;
        let score = dx * dx + dy * dy;
        if(startHex) {
            let sx = hex.x - startHex.x,
                sy = hex.y - startHex.y;
            score += (sx * sx + sy * sy) * 0.18;
        }
        // Prefer pure land over nearby bridge tiles for land clicks.
        if(isBridgeHex(hex)) score *= 1.35;
        else score += hexMountainProximityScore(hex,unit) * 420;
        if(score < bestScore) {
            bestScore = score;
            best = hex;
        }
    }
    return best ? { hex: best, exactX: best.x, exactY: best.y, intoWater: false } : null;
}
// The narrow margin beside a deck that a land unit walking the bridge may be squeezed into and still be on the bridge:
// within 1.7 deck half-widths of its centre line (movement, steering and sidesteps keep troops there, and no water
// attrition reaches them there: wodUnitClingsToBridge).
const WOD_BRIDGE_MARGIN_PAD = 1.7;
function wodPointBesideBridge(unit, x, y) {
    return wodPointOnBridgeForUnit(unit, x, y, WOD_BRIDGE_MARGIN_PAD);
}
// How far a point lies outside a bridge's deck rectangle (0 on it), in pixels.
function wodPointDistanceToBridgeDeck(x, y, br) {
    if(!br) return Infinity;
    if(br.x == null) wodSyncBridgeWorldCoords(br);
    const c = Math.cos(br.angle || 0), s = Math.sin(br.angle || 0), dx = x - br.x, dy = y - br.y;
    const lx = Math.abs(dx * c + dy * s) - (br.w || 0) / 2, ly = Math.abs(-dx * s + dy * c) - (br.h || 0) / 2;
    return Math.hypot(Math.max(0, lx), Math.max(0, ly));
}
/** For a player's order to a point in the water within a cell and a half of a bridge deck and two cells of a bank: the dry
 *  cell nearest the point,
 *  on the unit's own bank (reached without a bridge) unless the other bank is clearly nearer (wodResolveLandMarchHex sends
 *  the unit there). Null away from bridges. */
function wodBankBesideBridgeClick(unit, x, y, startHexOpt) {
    if(!gameData.bridges || !gameData.bridges.length) return null;
    const C = (gameData.hexRadius || 20) * 1.35;
    if(!gameData.bridges.some(br => br && wodPointDistanceToBridgeDeck(x, y, br) <= C * 1.6)) return null;
    const centre = getNearestHexToPoint(x, y);
    if(!centre) return null;
    const land = [];
    for(const p of getHexesInRadius(centre.q, centre.r, 5)) {
        const h = wodHexAt(p.q, p.r);
        if(!h || isWaterHex(h) || isBridgeHex(h) || !wodHexWalkableForLandPath(unit, h, false)) continue;
        if(h.type === 'mountain' && !wodCanClimb(unit)) continue;
        land.push({ h, d: Math.hypot(h.x - x, h.y - y) });
    }
    if(!land.length) return null;
    land.sort((a, b) => a.d - b.d);
    // (only near a bank: a point out in the middle of a wide river is a swim, as anywhere else)
    if(land[0].d > C * 2.2) return null;
    // the unit's own bank: the dry ground it can walk to without a bridge (a bounded flood, stopped once every
    // candidate is placed)
    const start = startHexOpt || getNearestWalkableHexForUnit(unit, unit.x, unit.y);
    let own = null;
    if(start && !isWaterHex(start) && !isBridgeHex(start)) {
        const want = new Set(land.map(e => getHexKey(e.h))), seen = new Set([getHexKey(start)]), queue = [start];
        let found = want.has(getHexKey(start)) ? 1 : 0;
        const reached = new Set(found ? [getHexKey(start)] : []);
        for(let i = 0; i < queue.length && i < 12000 && found < want.size; i++) {
            const a = queue[i];
            for(const d of hexDirections) {
                const n = wodHexAt(a.q + d.q, a.r + d.r), k = n && getHexKey(n);
                if(!n || seen.has(k) || isWaterHex(n) || isBridgeHex(n) || !wodCanStepBetweenHexes(unit, a, n, false)) continue;
                seen.add(k); queue.push(n);
                if(want.has(k)) { reached.add(k); found++; }
            }
        }
        own = land.find(e => reached.has(getHexKey(e.h))) || null;
    }
    return own && own.d <= land[0].d + C * 1.2 ? own.h : land[0].h;
}
function wodHexStepDistance(fromHex, toHex) {
    if(!fromHex || !toHex) return 1;
    let dq = Math.abs(toHex.q - fromHex.q);
    let dr = Math.abs(toHex.r - fromHex.r);
    return (dq && dr) ? 1.41421356237 : 1;
}
function wodDiagonalCornerBlocksLandStep(unit, hex, forbidWater) {
    if(!hex) return true;
    if(hex.type === 'mountain' && !wodCanClimb(unit)) return true;
    if(isBridgeHex(hex)) return false;
    if(isWaterHex(hex)) return !!forbidWater;
    if(!wodPathTileWalkable(unit, hex, false)) return true;
    return false;
}
function wodBridgePortalLinked(fromHex, toHex) {
    if(!fromHex || !toHex) return false;
    let fk = getHexKey(fromHex), tk = getHexKey(toHex);
    if(isBridgeHex(toHex) && gameData._bridgeLandEntry) {
        let entries = gameData._bridgeLandEntry[fk];
        if(entries) {
            if(entries instanceof Set && entries.has(tk)) return true;
            if(Array.isArray(entries) && entries.indexOf(tk) >= 0) return true;
        }
    }
    if(isBridgeHex(fromHex) && gameData._bridgeExitLand) {
        let exits = gameData._bridgeExitLand[fk];
        if(exits) {
            if(exits instanceof Set && exits.has(tk)) return true;
            if(Array.isArray(exits) && exits.indexOf(tk) >= 0) return true;
        }
    }
    return false;
}
function wodStartCanReachBridgeDeck(startHex, deckEntry, enterRef) {
    if(!startHex) return false;
    if(isBridgeHex(startHex)) return true;
    if(deckEntry && wodBridgePortalLinked(startHex, deckEntry)) return true;
    if(enterRef && wodBridgePortalLinked(startHex, enterRef)) return true;
    return false;
}
/** Sample a pixel chord; true only if every sample sits on open water (ships). */
function wodOpenWaterChordClear(unit, x0, y0, x1, y1) {
    let dx = x1 - x0, dy = y1 - y0;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if(dist < 1) {
        let h0 = getNearestHexToPoint(x0, y0);
        return !!(h0 && wodIsOpenWaterHex(h0));
    }
    let hr = gameData.hexRadius || 20;
    let steps = Math.max(2, Math.ceil(dist / Math.max(4, hr * 0.45)));
    for(let i = 0; i <= steps; i++) {
        let t = i / steps;
        let hx = getNearestHexToPoint(x0 + dx * t, y0 + dy * t);
        if(!hx || !wodIsOpenWaterHex(hx)) return false;
    }
    return true;
}
function wodCanStepBetweenHexes(unit, fromHex, toHex, forbidWater) {
    if(!fromHex || !toHex) return false;
    if(unit && (wodIsNavalUnit(unit) || (unit.type === 'convoy' && unit.convoySeaRoute))) {
        return wodIsOpenWaterHex(fromHex) && wodIsOpenWaterHex(toHex);
    }
    if(wodBridgePortalLinked(fromHex, toHex)) return true;
    if(isBridgeHex(fromHex) && isBridgeHex(toHex)) {
        let bf = bridgeAtHex(fromHex),
            bt = bridgeAtHex(toHex);
        if(bf && bt && bf.id === bt.id) return true;
    }
    if(!isBridgeHex(fromHex) && isBridgeHex(toHex)) {
        let dq = Math.abs(toHex.q - fromHex.q),
            dr = Math.abs(toHex.r - fromHex.r);
        if(dq <= 1 && dr <= 1 && (dq + dr) > 0 && wodPathTileWalkable(unit, toHex, false)) return true;
    }
    // Land armies only enter water on an explicit intoWater / amphibious order — not
    // merely because forbidWater is false (that used to open a +62 soft-water graph).
    let allowWater = !forbidWater && (
        wodOrderIntoWater(unit, toHex) ||
        unit.type === 'marine' ||
        (unit.type === 'convoy' && unit.convoySeaRoute)
    );
    if(!wodPathTileWalkable(unit, toHex, allowWater || wodOrderIntoWater(unit, toHex))) return false;
    if(forbidWater && wodUnitUsesLandBridges(unit) && unit.type !== 'marine' &&
        isWaterHex(toHex) && !isBridgeHex(toHex) && !wodOrderIntoWater(unit, toHex)) return false;
    let dq = toHex.q - fromHex.q;
    let dr = toHex.r - fromHex.r;
    if(dq !== 0 && dr !== 0) {
        let bridgeStep = isBridgeHex(fromHex) || isBridgeHex(toHex);
        if(!bridgeStep) {
            let sideA = wodHexAt(fromHex.q + dq,fromHex.r);
            let sideB = wodHexAt(fromHex.q,fromHex.r + dr);
            const blockedA=wodDiagonalCornerBlocksLandStep(unit,sideA,forbidWater),blockedB=wodDiagonalCornerBlocksLandStep(unit,sideB,forbidWater);
            const dryPinch=Math.abs(dq)===1&&Math.abs(dr)===1&&!isWaterHex(fromHex)&&!isWaterHex(toHex)&&blockedA&&blockedB;
            // When a side lane exists, use it instead of shaving a
            // mountain corner. Only a diagonal-only link needs the neck.
            if(!dryPinch&&(blockedA||blockedB))return false;
        }
    }
    return true;
}
// A narrow dry diagonal is a traversable connection, including the
// exact corner where rounding can otherwise choose the adjacent water.
// This tolerance is local to the corner; full water/peak cells stay blocked.
function wodDiagonalLandLinkAtPoint(unit,px,py) {
    if(!unit||!Number.isFinite(px)||!Number.isFinite(py)||wodIsNavalUnit(unit)||unit.type==='convoy'&&unit.convoySeaRoute)return null;
    const sp=(gameData.hexRadius||20)*1.35,cx=(Math.round(px/sp-.5)+.5)*sp,cy=(Math.round(py/sp-.5)+.5)*sp;
    if(Math.abs(px-cx)>sp*.13||Math.abs(py-cy)>sp*.13)return null;
    const q=Math.floor(cx/sp),r=Math.floor(cy/sp),cells=[[q,r],[q+1,r],[q,r+1],[q+1,r+1]].map(([x,y])=>gameData.hexes[x+','+y]);
    const dry=h=>h&&!isWaterHex(h)&&wodPathTileWalkable(unit,h,false);
    for(const [a,b,c,d,sign]of [[0,3,1,2,1],[1,2,0,3,-1]]){
        if(!dry(cells[a])||!dry(cells[b])||dry(cells[c])||dry(cells[d])||Math.abs(px-cx-sign*(py-cy))>sp*.13)continue;
        const pair=[cells[a],cells[b]];
        pair.sort((a,b)=>Math.hypot(a.x-px,a.y-py)-Math.hypot(b.x-px,b.y-py));return pair[0];
    }
    return null;
}
/** Bridge deck portals: land shore ↔ bridge tiles without requiring a diagonal water corner-cut. */
function wodForEachBridgePathPortal(unit, hex, fn) {
    if(!hex || !wodUnitUsesLandBridges(unit) || unit.type === 'marine' || !fn) return;
    let hk = getHexKey(hex);
    let seen = new Set();
    function emit(nHex) {
        if(!nHex) return;
        let nk = getHexKey(nHex);
        if(seen.has(nk)) return;
        seen.add(nk);
        fn(nHex);
    }
    if(!isBridgeHex(hex) && gameData._bridgeLandEntry) {
        let entries = gameData._bridgeLandEntry[hk];
        if(entries) {
            if(entries instanceof Set) {
                entries.forEach((bk) => emit(gameData.hexes[bk]));
            } else {
                for(let ei = 0; ei < entries.length; ei++) emit(gameData.hexes[entries[ei]]);
            }
        }
    }
    if(isBridgeHex(hex)) {
        let linkNbs = wodBridgeLinkedHexes(hex);
        for(let li = 0; li < linkNbs.length; li++) emit(linkNbs[li]);
        if(gameData._bridgeExitLand) {
            let exits = gameData._bridgeExitLand[hk];
            if(exits) {
                if(exits instanceof Set) {
                    exits.forEach((lk) => emit(gameData.hexes[lk]));
                } else {
                    for(let ei = 0; ei < exits.length; ei++) emit(gameData.hexes[exits[ei]]);
                }
            }
        }
    }
}
function wodUnitPrefersLandOnlyPath(unit) {
    return !wodIsNavalUnit(unit) && (unit.type !== 'marine'||unit._wodKeepLandFormation) &&
        !(unit.type === 'convoy' && unit.convoySeaRoute);
}
function getNearestWalkableHexForUnit(unit, x, y, ringMax = 4) {
    let ring = ringMax;
    if(unit && unit.type === 'convoy' && unit.convoySeaRoute) ring = Math.max(ring, 12);
    else if(unit && unit.type === 'convoy') ring = Math.max(ring, 14);
    else if(unit && wodIsNavalUnit(unit)) ring = Math.max(ring, 10);
    // Only treat as on-deck when the point is actually on the bridge rect —
    // wodBridgeHexAtPoint's radius scan used to snap nearby shore units onto the
    // deck, so AI corridor builds started mid-bridge and skipped the approach.
    if(wodPointOnBridgeForUnit(unit, x, y, 1.05)) {
        let onBridge = wodBridgeHexAtPoint(unit, x, y);
        if(onBridge) return onBridge;
    }
    // Land armies already on open water must keep that hex as the path start —
    // otherwise water→land orders snap to a distant shore and amphib routing never runs.
    let allowWater = wodOrderIntoWater(unit, null) || wodUnitStandingOnOpenWater(unit);
    let primary = getNearestHexToPoint(x, y);
    if(primary && wodPathTileWalkable(unit, primary, allowWater)) return primary;
    let center = pixelToHex(x, y);
    let best = null;
    let bestD = Infinity;
    for(let dq = -ring; dq <= ring; dq++) {
        for(let dr = -ring; dr <= ring; dr++) {
            let h = wodHexAt(center.q + dq,center.r + dr);
            if(!wodPathTileWalkable(unit, h, allowWater)) continue;
            // Prefer pure land over nearby bridge tiles when standing on land.
            if(primary && !isWaterHex(primary) && !isBridgeHex(primary) && isBridgeHex(h))
                continue;
            let dx = h.x - x;
            let dy = h.y - y;
            let d = dx * dx + dy * dy;
            if(d < bestD) {
                bestD = d;
                best = h;
            }
        }
    }
    return best;
}
function wodSpawnJitterRange() {
    let hr = gameData.hexRadius || 20;
    return Math.min(10, Math.max(3, hr * 0.4));
}
/** Keeps unit pixel coords on a hex the unit may occupy (mountains / blocked tiles after jitter or combat shove). */
function ensureUnitPixelOnWalkableHex(unit, ringMax) {
    if(wodDiagonalLandLinkAtPoint(unit,unit.x,unit.y))return;
    if(!unit || unit.hp <= 0) return;
    if(wodIsNavalUnit(unit) || (unit.type === 'convoy' && unit.convoySeaRoute)) {
        let sh = getNearestHexToPoint(unit.x, unit.y);
        if(sh && wodIsOpenWaterHex(sh)) return;
        let safeSea = getNearestWalkableHexForUnit(unit, unit.x, unit.y, ringMax != null ? Math.max(ringMax, 14) : 14);
        if(!safeSea){let best=Infinity;for(const h of gameData.hexList){if(!wodIsOpenWaterHex(h))continue;const d=(h.x-unit.x)**2+(h.y-unit.y)**2;if(d<best&&worldPositionClearOfUnits(h.x,h.y,(unit.radius||12)*2+3,unit)){best=d;safeSea=h;}}}
        if(safeSea && wodIsOpenWaterHex(safeSea)) {
            unit.x=safeSea.x;unit.y=safeSea.y;unit._drawX=unit.x;unit._drawY=unit.y;
            if(unit.target)unit.target.pathPrepared=false;
            invalidateUnitOrderArrowCache(unit);
        }
        return;
    }
    if(wodIsPlayerMarchOrder(unit)) return;
    // A stranded regiment must actually march ashore, never teleport out
    // of the water and skip its supply attrition during idle correction.
    if(wodUnitStandingOnOpenWater(unit))return;
    if(wodBridgeHexAtPoint(unit, unit.x, unit.y) || wodPointOnBridgeForUnit(unit, unit.x, unit.y, 1.2)) return;
    if(wodUnitRouteUsesBridge(unit)) return;
    let ring = ringMax != null ? ringMax : 12;
    let h = getNearestHexToPoint(unit.x, unit.y);
    if(h && wodUnitPrefersLandOnlyPath(unit) && isWaterHex(h) && !isBridgeHex(h) && !wodOrderIntoWater(unit, h)) {
        let shore = wodResolveLandMarchHex(unit, unit.x, unit.y);
        if(shore && !shore.intoWater) {
            unit.x = shore.exactX;
            unit.y = shore.exactY;
            return;
        }
    }
    if(h && canUnitEnterHex(unit, h)) return;
    let safe = getNearestWalkableHexForUnit(unit, unit.x, unit.y, ring);
    if(!safe) return;
    let j = wodSpawnJitterRange();
    unit.x = safe.x + (Math.random() * j * 2 - j);
    unit.y = safe.y + (Math.random() * j * 2 - j);
    h = getNearestHexToPoint(unit.x, unit.y);
    if(h && !canUnitEnterHex(unit, h)) {
        unit.x = safe.x;
        unit.y = safe.y;
    }
}
/** Pixel chord samples can land on the wrong hex between land/water/mountain corners; accept nearby tiles. */
function wodSamplePosOnWalkableTerrain(unit, px, py) {
    // A point already assigned to a legal dry cell needs neither a
    // diagonal-link search nor a bridge geometry scan. Water and seam
    // points retain the complete native checks below.
    let h = getNearestHexToPoint(px, py);
    if(h&&!isWaterHex(h)&&wodPathTileWalkable(unit,h,false))return true;
    if(wodDiagonalLandLinkAtPoint(unit,px,py))return true;
    // A unit on dry ground or on a bridge may step over water only onto a deck or the narrow margin beside it
    // (wodPointBesideBridge, where it is still on the bridge: wodUnitClingsToBridge). The water cells a deck touches are
    // bridge cells for routing, and any point in them used to pass here: crowded on a bridge or stalled in a fight at its
    // end, troops were steered and pushed out round the deck into the river and drowned there. (One already in the water
    // may still move about in it to get out; a swim order or a ferry leave is not affected.)
    if(h&&isWaterHex(h)&&wodUnitUsesLandBridges(unit)&&gameData.bridges?.length&&!wodOrderIntoWater(unit,h)&&!wodUnitAfloatForLeave(unit)){
        const here=getNearestHexToPoint(unit.x,unit.y);
        if((!here||!isWaterHex(here)||wodPointBesideBridge(unit,unit.x,unit.y))&&!wodPointBesideBridge(unit,px,py))return false;
    }
    if(wodBridgeHexAtPoint(unit, px, py)) return true;
    if(wodPointOnBridgeForUnit(unit, px, py, 1.18)) return true;
    if(h&&isWaterHex(h)&&(isLandArmyUnit(unit)||unit._wodKeepLandFormation)&&!wodOrderIntoWater(unit,h)&&!isWaterHex(getNearestHexToPoint(unit.x,unit.y)))return false;
    if(h&&isWaterHex(h)&&isLandArmyUnit(unit)&&!wodUnitAfloatForLeave(unit)&&(unit._wodBoardingNoWater||!wodMpIsHumanOwner(unit.owner)&&!unit._wodAiRescueWater))return false;
    if(h && wodUnitUsesLandBridges(unit) && isBridgeHex(h)) return true;
    if(h && wodPathTileWalkable(unit, h, wodOrderIntoWater(unit, h))) return true;
    if(!h) return false;
    if(wodIsNavalUnit(unit)||unit.type==='convoy'&&unit.convoySeaRoute)return false;
    let hr = gameData.hexRadius || 20;
    // Water-only movers (ships, sea convoys) get a much tighter neighbor tolerance:
    // the generous radius let their chords slide ACROSS narrow land isthmuses because a
    // water cell existed on the far side ("boats sailing through land").
    let waterOnly = wodIsNavalUnit(unit) || (unit.type === 'convoy' && unit.convoySeaRoute);
    let allowWater = wodOrderIntoWater(unit, h);
    if(h.type === 'mountain' && !waterOnly && !wodCanClimb(unit)) {
        // Cell-ownership test instead of a fixed radius: a point counts as walkable
        // only if it is STRICTLY closer to a walkable neighbor's center than to the
        // mountain's own center. Interior mountain points always fail, so one-tile
        // walls stay solid; only the exact boundary seam between two walkable cells
        // flanking a pass remains traversable.
        let dmx = h.x - px, dmy = h.y - py;
        let dm2 = dmx * dmx + dmy * dmy;
        for(let d of hexDirections) {
            let n = wodHexAt(h.q + d.q,h.r + d.r);
            if(!n || n.type === 'mountain' || !wodPathTileWalkable(unit, n, allowWater)) continue;
            let dx = n.x - px, dy = n.y - py;
            if(dx * dx + dy * dy < dm2) return true;
        }
        return false;
    }
    let thresh = hr * (waterOnly ? 0.6 : 1.14);
    let thresh2 = thresh * thresh;
    for(let d of hexDirections) {
        let n = wodHexAt(h.q + d.q,h.r + d.r);
        if(!n || !wodPathTileWalkable(unit, n, allowWater)) continue;
        let dx = n.x - px, dy = n.y - py;
        if(dx * dx + dy * dy <= thresh2) return true;
    }
    return false;
}
/** True when the straight segment a→b stays on terrain the unit can occupy.
 * Used to guard exact-end snapping: replacing a hex-center waypoint with the raw
 * click point must not create a chord that cuts a mountain corner in a thin pass. */
function wodSegmentClearsTerrainForUnit(unit, ax, ay, bx, by, noPassThreading) {
    let dx = bx - ax, dy = by - ay;
    let len = Math.sqrt(dx * dx + dy * dy);
    if(len < 0.5) return wodSamplePosOnWalkableTerrain(unit, bx, by);
    let hr = gameData.hexRadius || 20;
    const shoreExit=unit._wodShoreExitRouting&&wodUnitStandingOnOpenWater(unit);
    let shoreDrySeen=false;
    const legalSample=(x,y)=>{
        if(!wodSamplePosOnWalkableTerrain(unit,x,y))return false;
        if(shoreExit){
            const h=getNearestHexToPoint(x,y),wet=isWaterHex(h)&&!wodPointOnBridgeDeck(unit,x,y);
            if(wet&&shoreDrySeen)return false;
            if(!wet)shoreDrySeen=true;
        }
        return true;
    };
    // Check every lattice interval, including tiny corner slivers that a
    // fixed-distance sampler can miss when smoothing a narrow bend.
    const spacing=hr*1.35,cuts=[0,1];
    for(const [a,b] of [[ax,bx],[ay,by]]) {
        const delta=b-a;if(Math.abs(delta)<1e-9)continue;
        const lo=Math.min(a,b),hi=Math.max(a,b);
        for(let k=Math.floor(lo/spacing-.5)+1;k*spacing+spacing*.5<hi;k++) {
            const t=(k*spacing+spacing*.5-a)/delta;if(t>0&&t<1)cuts.push(t);
        }
    }
    cuts.sort((a,b)=>a-b);
    for(let i=1;i<cuts.length;i++) {
        const t=(cuts[i-1]+cuts[i])*.5,mx=ax+dx*t,my=ay+dy*t;
        if(!legalSample(mx,my))return false;
        // Within one cell the middle of the chord speaks for all of it, except over a
        // peak or water beside a diagonal pass: there the middle may be legal only
        // because it lies in the small corner tolerance of the pass, and a chord can
        // enter that tolerance and leave it again while still over the peak. The step
        // clamp stops a unit at that sliver, so a chord judged clear here sent units
        // into the corner of a pass and left them there for good. Both ends of the
        // stretch over the blocked cell must lie inside the tolerance as well, and
        // with a margin: each end where the chord enters or leaves the cell is tested
        // a little further from the corner than it is. This check must be the stricter
        // of the two, because the first chord that passes while a unit backs away from
        // the wall is always one that just grazes the edge of the tolerance.
        if(cuts[i]>cuts[i-1]) {
            const h=getNearestHexToPoint(mx,my);
            if(h&&(h.type==='mountain'||isWaterHex(h))&&wodDiagonalLandLinkAtPoint(unit,mx,my)) {
                // A shortcut planned from a distance must not thread a diagonal pass
                // off its centre line at all: the marcher is nudged aside on the way
                // (comrades, steering) and then misses the corner. Such callers keep
                // the two cells of the pass as waypoints and cross centre to centre.
                if(noPassThreading)return false;
                const cx=(Math.round(mx/spacing-.5)+.5)*spacing,cy=(Math.round(my/spacing-.5)+.5)*spacing,span=cuts[i]-cuts[i-1];
                for(const [te,crossing] of [[cuts[i-1]+span*.02,cuts[i-1]>0],[cuts[i]-span*.02,cuts[i]<1]]) {
                    const ex=ax+dx*te,ey=ay+dy*te,grow=crossing?1.12:1;
                    if(!legalSample(cx+(ex-cx)*grow,cy+(ey-cy)*grow))return false;
                }
            }
        }
    }
    shoreDrySeen=false;
    let n = Math.max(3, Math.min(2048, Math.ceil(len / (hr * 0.4))));
    for(let s = 1; s <= n; s++) {
        let t = s / n;
        if(!legalSample(ax + dx * t, ay + dy * t)) return false;
    }
    return true;
}
/** When a move chord clips a mountain corner, try small steering angles before blocking. */
function wodTrySidestepClamp(unit, ox, oy, nx, ny) {
    let dx = nx - ox, dy = ny - oy;
    let len = Math.sqrt(dx * dx + dy * dy);
    if(len < 0.45) return null;
    dx /= len;
    dy /= len;
    let subdiv = 36;
    let turns = [0.32, -0.32, 0.55, -0.55, 0.78, -0.78, 1.05, -1.05];
    for(let ang of turns) {
        let c = Math.cos(ang), s = Math.sin(ang);
        let ndx = dx * c - dy * s;
        let ndy = dx * s + dy * c;
        let snx = ox + ndx * len;
        let sny = oy + ndy * len;
        let cl = wodClampStepToWalkableTerrain(unit, ox, oy, snx, sny, subdiv);
        if(cl && (Math.abs(cl.x - ox) > 0.04 || Math.abs(cl.y - oy) > 0.04)) return cl;
    }
    return null;
}
/** Furthest point from (ox,oy) toward (nx,ny) that stays on terrain the unit may occupy (no corner-cutting through mountains). */
function wodUnitPointOnBridgeRoute(unit, x, y, pad) {
    if(x == null || y == null) return false;
    return !!wodBridgeHexAtPoint(unit, x, y) || wodPointOnBridgeForUnit(unit, x, y, pad == null ? 1.12 : pad);
}
function wodUnitRouteUsesBridge(unit) {
    if(!wodUnitUsesLandBridges(unit)) return false;
    if(unit._wodRouteUsesBridge) return true;
    if(wodUnitPointOnBridgeRoute(unit, unit.x, unit.y, 1.06)) return true;
    if(unit.target && wodUnitPointOnBridgeRoute(unit, unit.target.x, unit.target.y, 1.14)) return true;
    if(unit.orderTarget && wodUnitPointOnBridgeRoute(unit, unit.orderTarget.x, unit.orderTarget.y, 1.1)) return true;
    if(unit.path) {
        for(let pi = 0; pi < unit.path.length; pi++) {
            let p = unit.path[pi];
            if(p && wodUnitPointOnBridgeRoute(unit, p.x, p.y, 1.14)) return true;
        }
    }
    return false;
}
function wodUnitBridgeTransitAllowed(unit, ox, oy, nx, ny) {
    if(!wodUnitUsesLandBridges(unit) || !wodUnitRouteUsesBridge(unit)) return false;
    let oxB = wodUnitPointOnBridgeRoute(unit, ox, oy, 1.2);
    let nxB = wodUnitPointOnBridgeRoute(unit, nx, ny, 1.2);
    let tgt = unit.target;
    let tgtB = tgt && wodUnitPointOnBridgeRoute(unit, tgt.x, tgt.y, 1.16);
    let tgtL = tgt && !wodUnitPointOnBridgeRoute(unit, tgt.x, tgt.y, 1.04);
    if(oxB && nxB) return true;
    if(!oxB && (nxB || tgtB)) {
        if(!tgt) return nxB;
        let tdx = tgt.x - ox, tdy = tgt.y - oy;
        let ndx = nx - ox, ndy = ny - oy;
        return tdx * ndx + tdy * ndy > 0;
    }
    if(oxB && (tgtL || wodUnitHasLandWaypointAhead(unit))) {
        if(tgt && tgtL) {
            let tdx = tgt.x - ox, tdy = tgt.y - oy;
            let ndx = nx - ox, ndy = ny - oy;
            return tdx * ndx + tdy * ndy > 0;
        }
        return true;
    }
    return false;
}
function wodUnitMarchOnBridgeDeck(unit) {
    if(!wodUnitUsesLandBridges(unit)) return false;
    if(wodUnitRouteUsesBridge(unit)) return true;
    if(wodBridgeHexAtPoint(unit, unit.x, unit.y)) return true;
    if(unit.orderTarget && wodUnitPointOnBridgeRoute(unit, unit.orderTarget.x, unit.orderTarget.y, 1.1)) return true;
    if(unit.target && wodUnitPointOnBridgeRoute(unit, unit.target.x, unit.target.y, 1.1)) return true;
    if(unit.path && unit.path.length) {
        for(let pi = 0; pi < unit.path.length; pi++) {
            let p = unit.path[pi];
            if(p && wodUnitPointOnBridgeRoute(unit, p.x, p.y, 1.1)) return true;
        }
    }
    return false;
}
function wodUnitHasLandWaypointAhead(unit) {
    if(!unit) return false;
    if(unit.path) {
        for(let pi = 0; pi < unit.path.length; pi++) {
            let p = unit.path[pi];
            if(!p) continue;
            if(!wodUnitPointOnBridgeRoute(unit, p.x, p.y, 1.04)) return true;
        }
    }
    if(unit.orderTarget && !wodUnitPointOnBridgeRoute(unit, unit.orderTarget.x, unit.orderTarget.y, 1.04))
        return true;
    if(unit.target && !wodUnitPointOnBridgeRoute(unit, unit.target.x, unit.target.y, 1.04))
        return true;
    return false;
}
function wodUnitMarchingOffBridgeDeck(unit, ox, oy, nx, ny) {
    if(!wodUnitUsesLandBridges(unit)) return false;
    if(!wodUnitPointOnBridgeRoute(unit, ox, oy, 1.12) && !wodBridgeHexAtPoint(unit, ox, oy)) return false;
    let landAhead = wodUnitHasLandWaypointAhead(unit);
    if(wodUnitPointOnBridgeRoute(unit, nx, ny, 1.14)) {
        if(!landAhead) return false;
        if(unit.target && !wodUnitPointOnBridgeRoute(unit, unit.target.x, unit.target.y, 1.06)) {
            let tdx = unit.target.x - ox, tdy = unit.target.y - oy;
            let ndx = nx - ox, ndy = ny - oy;
            if(tdx * ndx + tdy * ndy > 0) return true;
        }
        return false;
    }
    let h = getNearestHexToPoint(nx, ny);
    if(h && wodHexWalkableForLandPath(unit, h, false) && !isBridgeHex(h)) return true;
    if(landAhead && unit.target && !wodBridgeHexAtPoint(unit, unit.target.x, unit.target.y) &&
        !wodUnitPointOnBridgeRoute(unit, unit.target.x, unit.target.y, 1.08)) {
        let th = getNearestHexToPoint(unit.target.x, unit.target.y);
        if(th && wodHexWalkableForLandPath(unit, th, false) && !isBridgeHex(th)) return true;
    }
    return false;
}
function wodUnitMarchingToBridgeTarget(unit, ox, oy, nx, ny) {
    if(!wodUnitUsesLandBridges(unit) || !unit || !unit.target) return false;
    let targetOnBridge = wodUnitPointOnBridgeRoute(unit, unit.target.x, unit.target.y, 1.16);
    if(!targetOnBridge && !wodUnitRouteUsesBridge(unit)) return false;
    if(wodUnitPointOnBridgeRoute(unit, nx, ny, 1.24) || wodBridgeHexAtPoint(unit, nx, ny)) return true;
    if(wodUnitPointOnBridgeRoute(unit, ox, oy, 1.18)) return true;
    if(targetOnBridge) {
        let tdx = unit.target.x - ox, tdy = unit.target.y - oy;
        let ndx = nx - ox, ndy = ny - oy;
        if(tdx * ndx + tdy * ndy > 0) return true;
    }
    let hr = gameData.hexRadius || 20;
    let tdx = unit.target.x - ox, tdy = unit.target.y - oy;
    let ndx = nx - ox, ndy = ny - oy;
    if(tdx * tdx + tdy * tdy < (hr * 5.5) * (hr * 5.5) &&
        ndx * ndx + ndy * ndy > 0.01)
        return true;
    return false;
}
function wodLandChordBetweenWalkableLand(unit, ox, oy, nx, ny) {
    if(!wodUnitPrefersLandOnlyPath(unit) || wodOrderIntoWater(unit, null)) return false;
    let h0 = getNearestHexToPoint(ox, oy);
    let h1 = getNearestHexToPoint(nx, ny);
    if(!h0 || !h1) return false;
    if(isWaterHex(h0) || isWaterHex(h1)) return false;
    if(isBridgeHex(h0) || isBridgeHex(h1)) return false;
    return wodHexWalkableForLandPath(unit, h0, false) && wodHexWalkableForLandPath(unit, h1, false);
}
// Open-country shortcut. A cell is "deep" when it and its eight neighbours are ordinary
// dry ground with no mountain, water or bridge. A land unit stepping between deep cells
// cannot touch any terrain edge, so the sampled clamp below would accept the full step.
function wodHexIsDeepLand(h) {
    const rev = (gameData._landGeometryRevision | 0) * 4096 + (gameData.landGeometryRevision | 0) * 64 + (gameData._wodPfVer | 0) + (gameData.bridges ? gameData.bridges.length : 0) * 16777216 + ((gameData._wodDeepEpoch | 0) + ((gameData._wodSimTick | 0) / 600 | 0)) * 4294967296;
    if(h._deepRev === rev) return h._deep;
    let deep = !isWaterHex(h) && h.type !== 'mountain' && isClaimableLand(h) && !isBridgeHex(h);
    if(deep) {
        for(let dq = -1; dq <= 1 && deep; dq++) for(let dr = -1; dr <= 1; dr++) {
            if(!dq && !dr) continue;
            const n = wodHexAt(h.q + dq, h.r + dr);
            if(!n || isWaterHex(n) || n.type === 'mountain' || !isClaimableLand(n) || isBridgeHex(n)) { deep = false; break; }
        }
    }
    h._deepRev = rev; h._deep = deep;
    return deep;
}
function wodClampStepToWalkableTerrain(unit, ox, oy, nx, ny, subdiv) {
    if(isLandArmyUnit(unit)) {
        const dx = nx - ox, dy = ny - oy, lim = (gameData.hexRadius || 20) * 1.3;
        if(dx * dx + dy * dy < lim * lim) {
            const a = getNearestHexToPoint(ox, oy), b = a && getNearestHexToPoint(nx, ny);
            if(b && wodHexIsDeepLand(a) && (a === b || wodHexIsDeepLand(b))) return { x: nx, y: ny };
        }
    }
    if(wodUnitUsesLandBridges(unit) &&
        wodPointOnBridgeForUnit(unit, ox, oy, 1.22) &&
        wodPointOnBridgeForUnit(unit, nx, ny, 1.22))
        return { x: nx, y: ny };
    if(wodUnitBridgeTransitAllowed(unit, ox, oy, nx, ny))
        return { x: nx, y: ny };
    if(wodUnitMarchingOffBridgeDeck(unit, ox, oy, nx, ny)) {
        let nOff = Math.max(6, Math.min(40, subdiv | 0));
        let lastOff = 0;
        let exitToLand = wodUnitHasLandWaypointAhead(unit);
        for(let s = 1; s <= nOff; s++) {
            let t = s / nOff;
            let px = ox + (nx - ox) * t;
            let py = oy + (ny - oy) * t;
            if(wodSamplePosOnWalkableTerrain(unit, px, py) || wodBridgeHexAtPoint(unit, px, py) ||
                wodPointOnBridgeForUnit(unit, px, py, 1.2))
                lastOff = s;
            else if(exitToLand && unit.target) {
                let tdx = unit.target.x - ox, tdy = unit.target.y - oy;
                let pdx = px - ox, pdy = py - oy;
                if(tdx * pdx + tdy * pdy > 0) lastOff = s;
                else break;
            } else
                break;
        }
        if(lastOff > 0) {
            let t = lastOff / nOff;
            return { x: ox + (nx - ox) * t, y: oy + (ny - oy) * t };
        }
        return { x: nx, y: ny };
    }
    if(wodUnitMarchingToBridgeTarget(unit, ox, oy, nx, ny)) {
        let nBridge = Math.max(6, Math.min(40, subdiv | 0));
        let lastBridge = 0;
        let targetOnBridge = unit.target && wodUnitPointOnBridgeRoute(unit, unit.target.x, unit.target.y, 1.16);
        for(let s = 1; s <= nBridge; s++) {
            let t = s / nBridge;
            let px = ox + (nx - ox) * t;
            let py = oy + (ny - oy) * t;
            if(wodSamplePosOnWalkableTerrain(unit, px, py) ||
                wodPointOnBridgeForUnit(unit, px, py, 1.28) ||
                wodBridgeHexAtPoint(unit, px, py))
                lastBridge = s;
            else if(targetOnBridge) {
                let tdx = unit.target.x - ox, tdy = unit.target.y - oy;
                let pdx = px - ox, pdy = py - oy;
                if(tdx * pdx + tdy * pdy > 0) lastBridge = s;
                else break;
            } else
                break;
        }
        if(lastBridge > 0) {
            let t = lastBridge / nBridge;
            return { x: ox + (nx - ox) * t, y: oy + (ny - oy) * t };
        }
        return { x: nx, y: ny };
    }
    if(wodUnitMarchOnBridgeDeck(unit) &&
        wodUnitHasLandWaypointAhead(unit) &&
        (wodPointOnBridgeForUnit(unit, ox, oy, 1.38) || wodPointOnBridgeForUnit(unit, nx, ny, 1.38) ||
            wodBridgeHexAtPoint(unit, nx, ny))) {
        if(wodUnitMarchingOffBridgeDeck(unit, ox, oy, nx, ny)) {
            let nOff = Math.max(6, Math.min(40, subdiv | 0));
            let lastOff = 0;
            for(let s = 1; s <= nOff; s++) {
                let t = s / nOff;
                let px = ox + (nx - ox) * t;
                let py = oy + (ny - oy) * t;
                if(wodSamplePosOnWalkableTerrain(unit, px, py) || wodBridgeHexAtPoint(unit, px, py) ||
                    wodPointOnBridgeForUnit(unit, px, py, 1.24))
                    lastOff = s;
                else
                    break;
            }
            if(lastOff > 0) {
                let t = lastOff / nOff;
                return { x: ox + (nx - ox) * t, y: oy + (ny - oy) * t };
            }
        }
        return { x: nx, y: ny };
    }
    if(wodUnitMarchOnBridgeDeck(unit) &&
        (wodPointOnBridgeForUnit(unit, ox, oy, 1.38) || wodPointOnBridgeForUnit(unit, nx, ny, 1.38) ||
            wodBridgeHexAtPoint(unit, nx, ny)))
        return { x: nx, y: ny };
    let landChord = wodLandChordBetweenWalkableLand(unit, ox, oy, nx, ny);
    let nearBridge = wodUnitUsesLandBridges(unit) &&
        (wodPointOnBridgeForUnit(unit, ox, oy, 1.22) || wodPointOnBridgeForUnit(unit, nx, ny, 1.22));
    let n = Math.max(6, Math.min(40, subdiv | 0));
    let lastGood = 0;
    for(let s = 1; s <= n; s++) {
        let t = s / n;
        let px = ox + (nx - ox) * t;
        let py = oy + (ny - oy) * t;
        if(wodSamplePosOnWalkableTerrain(unit, px, py)) {
            lastGood = s;
            continue;
        }
        if(landChord) {
            let sh = getNearestHexToPoint(px, py);
            if(sh && isWaterHex(sh) && !isBridgeHex(sh)) {
                lastGood = s;
                continue;
            }
        }
        if(nearBridge && wodPointOnBridgeForUnit(unit, px, py, 1.24)) {
            lastGood = s;
            continue;
        }
        if(wodUnitBridgeTransitAllowed(unit, ox, oy, px, py)) {
            lastGood = s;
            continue;
        }
        break;
    }
    if(lastGood === 0) return null;
    let t = lastGood / n;
    return {x: ox + (nx - ox) * t, y: oy + (ny - oy) * t};
}
/** Identify narrow corridors so columns can advance past shared corner waypoints. */
function wodUnitNearNarrowLandLane(unit) {
    if(!unit||['ship','convoy'].includes(unit.type)||unit._wodOrderIntoWater)return false;
    const h=getNearestHexToPoint(unit.x,unit.y);if(!h)return false;
    const key=getHexKey(h),version=gameData._wodPfVer||0;
    if(unit._wodLaneMap===gameData.hexes&&unit._wodLaneKey===key&&unit._wodLaneVersion===version)return unit._wodLaneNarrow;
    const pass=p=>{
        if(!p||isWaterHex(p)||p.type==='mountain')return false;
        let open=0,closed=0;
        for(const d of cardinalHexDirections){const n=wodHexAt(p.q+d.q,p.r+d.r);if(n&&n.type!=='mountain'&&(!isWaterHex(n)||isBridgeHex(n)))open++;else closed++;}
        return open>=1&&closed>=2;
    };
    const narrow=pass(h)||cardinalHexDirections.some(d=>pass(wodHexAt(h.q+d.q,h.r+d.r)));
    unit._wodLaneMap=gameData.hexes;unit._wodLaneKey=key;unit._wodLaneVersion=version;unit._wodLaneNarrow=narrow;
    return narrow;
}
/** Whether two units' bodies can touch. A ship and a unit on dry land (or on a bridge deck) never do: the ship is out on
 *  the water, so it neither holds troops back from the beach nor pushes them inland, and troops at the shore never hold
 *  a ship off. Troops in the water (wading, swimming, marines afloat) still meet ships. (ax, ay): where a is, or would be. */
function wodBodiesMeet(a,b,ax,ay) {
    const na=wodIsNavalUnit(a),nb=wodIsNavalUnit(b);
    if(na===nb)return true;
    const land=na?b:a,x=land===a&&ax!=null?ax:land.x,y=land===a&&ay!=null?ay:land.y,h=getNearestHexToPoint(x,y);
    return !!h&&isWaterHex(h)&&!isBridgeHex(h)&&!wodPointOnBridgeForUnit(land,x,y,1.05);
}
function isWorldPositionBlockedByUnits(mover,wx,wy,gapExtra=2) {
    let blocked=false;
    forEachNearbyUnit(gameData.unitSpatialGrid,wx,wy,(mover.radius||10)+65,u=>{
        if(u===mover||u.hp<=0||u.type==='convoy'||!wodBodiesMeet(mover,u,wx,wy))return;
        const min=(mover.radius||10)+(u.radius||10)+Math.max(1,gapExtra);
        const d2=(u.x-wx)**2+(u.y-wy)**2,old2=(u.x-mover.x)**2+(u.y-mover.y)**2;
        if(old2<min*min&&d2>old2+.0001)return;
        if(d2>=min*min)return;
        // (one queueing behind it gives way, down to a part overlap that the bodies' separation eases apart)
        if(d2>=(min*.6)**2&&wodQueuedBehind(mover,u))return;
        blocked=true;
    });return blocked;
}
// In a one-cell pass a comrade marching to the very spot this unit stands on (the corner of the pass it has just
// reached) is queueing behind it. He does not keep it from moving on (isWorldPositionBlockedByUnits,
// wodSteerAroundFriendlyUnits), while he stays blocked by it, so the one ahead goes first. Without this the head of a
// column could not turn a corner of the pass: the unit behind pressed into the inside of the turn, and each waited on
// the other until a sidestep timed out (verify-terrain-ui, the bend). (Not on open ground, a coast or a wider pass:
// there a group settling into its places keeps its spacing, verify-coastal-group-movement.)
function wodQueuedBehind(mover,u) {
    if(!mover.target||!u.target||wodIsNavalUnit(mover)||!wodIsFriendlyOwner(u.owner,mover.owner))return false;
    const sp=(gameData.hexRadius||20)*1.35;
    if(Math.hypot(u.target.x-mover.x,u.target.y-mover.y)>=sp*.75||Math.hypot(mover.target.x-u.x,mover.target.y-u.y)<sp*.75)return false;
    return wodInOneCellPass(mover,getNearestHexToPoint(mover.x,mover.y));
}
// A cell of a pass one cell wide: land hemmed in by terrain, with at most four of its eight neighbours passable (a
// corner or a stretch of the pass; a coast or a wider pass has more). Not a bridge deck.
function wodInOneCellPass(unit,h) {
    if(!h||isBridgeHex(h)||wodUnitOnBridgeDeck(unit)||wodHexIsDeepLand(h))return false;
    let open=0;for(const n of getNeighborHexes(h))if(n&&wodPathTileWalkable(unit,n,false))open++;
    return open<=4;
}
/** A retreat that cannot get past comrades standing in its way (a line holding the front, a
 *  crowd round a town): step-by-step steering only swings from one side of them to the other,
 *  and next to an enemy it does not steer at all. Plan a short way round them: corner points
 *  just outside the reach of everybody near, joined wherever the straight leg between two is
 *  clear of terrain and of everybody's body, and the shortest chain of legs from the unit to a
 *  point some four cells on towards its goal, through a gap a comrade has opened by stepping
 *  aside or round the end of the line. The unit walks it, then carries on to where the retreat
 *  was going. Returns true when it set such a route.
 *  (Until 2026-11-13 this tried fixed points two, three and four and a half cells to the side
 *  and took the first that a coarse check passed, often the farthest: the unit then walked
 *  four cells along the line before turning, or into a comrade, and the route was replanned
 *  back into the line half a second later.) */
function wodRetreatGoRound(unit) {
    const goal=unit.orderTarget||unit.target?.finalTarget||unit.target;if(!goal)return false;
    const sp=(gameData.hexRadius||20)*1.35,r0=unit.radius||12;
    // The way ahead is where the route runs over the next three cells (the goal itself may lie
    // round a lake or behind a ridge), or straight at the goal when the unit is on a local
    // detour (which may point anywhere, even into the comrade in front).
    let ax=unit.x,ay=unit.y,left=sp*3;
    if(!unit.target.detour&&unit.path?.length)for(const p of [unit.target,...unit.path]){
        if(!p)continue;const l=Math.hypot(p.x-ax,p.y-ay);
        if(l>=left){ax+=(p.x-ax)*left/l;ay+=(p.y-ay)*left/l;left=0;break;}
        left-=l;ax=p.x;ay=p.y;
    }
    let dx=ax-unit.x,dy=ay-unit.y,d=Math.hypot(dx,dy);
    if(left>0||d<sp){dx=goal.x-unit.x;dy=goal.y-unit.y;d=Math.hypot(dx,dy);}
    if(d<sp)return false;
    const ux=dx/d,uy=dy/d;
    // Everybody near, in the unit's own frame: f ahead of it, l to its left, r the distance
    // their centres must keep from its centre.
    const near=[];
    const body=(u,x,y)=>{const ox=x-unit.x,oy=y-unit.y;near.push({x,y,f:ox*ux+oy*uy,l:oy*ux-ox*uy,r:(u.radius||12)+r0+3,friend:wodIsFriendlyOwner(u.owner,unit.owner)});};
    forEachNearbyUnit(gameData.unitSpatialGrid,unit.x,unit.y,sp*6,u=>{
        if(u===unit||u.hp<=0||u.type==='convoy'||u.boardTransportUid||!wodBodiesMeet(unit,u))return;
        body(u,u.x,u.y);
        // A comrade stepping aside (very likely for this unit) will stand where he is going.
        const y=u._trafficYield,to=y&&(y.returning?y.points?.[0]:y);
        if(to&&to.x!=null&&Math.hypot(to.x-unit.x,to.y-unit.y)<sp*6)body(u,to.x,to.y);
    });
    // (only for comrades straight in front)
    if(!near.some(b=>b.friend&&b.f>0&&b.f<sp*2.5&&Math.abs(b.l)<b.r))return false;
    const clear=(x1,y1,x2,y2,first)=>{
        for(const b of near){
            // (a body the unit stands against does not count while the leg leads away from it)
            if(first&&(b.x-x1)*(x2-x1)+(b.y-y1)*(y2-y1)<=0)continue;
            if(distPointToSegmentSquared(b.x,b.y,x1,y1,x2,y2)<(b.r-1)**2)return false;
        }
        return wodSamplePosOnWalkableTerrain(unit,x2,y2)&&wodSegmentClearsTerrainForUnit(unit,x1,y1,x2,y2);
    };
    // Where the way round ends: about four cells on (the goal itself when that is nearer).
    const gd=Math.hypot(goal.x-unit.x,goal.y-unit.y);let end=null;
    for(const k of [4.5,3.5,5.5]){
        const p=gd<=sp*k?{x:goal.x,y:goal.y}:{x:unit.x+ux*sp*k,y:unit.y+uy*sp*k};
        if(wodSamplePosOnWalkableTerrain(unit,p.x,p.y)&&!near.some(b=>Math.hypot(b.x-p.x,b.y-p.y)<b.r+2)){end=p;break;}
    }
    if(!end)return false;
    // Corner points round the twelve nearest bodies that are not well behind the unit.
    const pts=[{x:unit.x,y:unit.y}];
    const around=near.filter(b=>b.f>-sp*1.5&&b.f<sp*5.5&&Math.abs(b.l)<sp*4).sort((p,q)=>p.f*p.f+p.l*p.l-q.f*q.f-q.l*q.l).slice(0,12);
    for(const b of around)for(let k=0;k<8;k++){
        const x=b.x+Math.cos(k*Math.PI/4)*(b.r+5),y=b.y+Math.sin(k*Math.PI/4)*(b.r+5);
        if(!near.some(o=>Math.hypot(o.x-x,o.y-y)<o.r+1)&&wodSamplePosOnWalkableTerrain(unit,x,y))pts.push({x,y});
    }
    pts.push(end);
    // The shortest chain of clear legs (Dijkstra; a leg is checked only when it would shorten a way).
    const n=pts.length,dist=new Array(n).fill(Infinity),prev=new Array(n).fill(-1),done=new Array(n).fill(false);dist[0]=0;
    for(;;){
        let i=-1;for(let k=0;k<n;k++)if(!done[k]&&dist[k]<Infinity&&(i<0||dist[k]<dist[i]))i=k;
        if(i<0||i===n-1)break;done[i]=true;
        for(let j=1;j<n;j++){
            if(done[j])continue;const w=dist[i]+Math.hypot(pts[j].x-pts[i].x,pts[j].y-pts[i].y);
            if(w<dist[j]&&clear(pts[i].x,pts[i].y,pts[j].x,pts[j].y,i===0)){dist[j]=w;prev[j]=i;}
        }
    }
    if(dist[n-1]===Infinity)return false;
    const route=[];for(let k=n-1;k>0;k=prev[k])route.unshift(pts[k]);
    unit._wodGoRoundSide=Math.sign((route[0].y-unit.y)*ux-(route[0].x-unit.x)*uy)||1;unit._wodGoRoundBlockT=0;unit._wodGoRoundProgress=null;
    const legs=route.map((p,k)=>k<route.length-1?{x:p.x,y:p.y,pathPrepared:true,goRound:true}:
        {x:p.x,y:p.y,pathPrepared:true,detour:true,goRound:true,finalTarget:{x:goal.x,y:goal.y}});
    unit.target=legs[0];unit.path=legs.slice(1);
    invalidateUnitOrderArrowCache(unit);
    return true;
}
/** Give up a way round that somebody has stepped into, and plan the retreat afresh. */
function wodEndRetreatGoRound(unit) {
    const end=[unit.target,...(unit.path||[])].find(p=>p?.goRound&&p.finalTarget);
    const goal=unit.orderTarget||end?.finalTarget;
    unit._wodGoRoundBlockT=0;unit._wodGoRoundProgress=null;unit.path=null;unit.target=goal?{x:goal.x,y:goal.y,pathPrepared:false}:null;
    unit._wodRetreatReplanAt=0;replanUnitOrder(unit);
}
/** On the way round: the corner point counts as reached a little short of it, and a way round
 *  that has brought the unit no nearer its next point for two seconds (by less than half of
 *  what it walks in that time, at the slowest a fighting retreat goes) is given up: a comrade
 *  has stepped in beside the point, and body separation holds the unit off it without it ever
 *  counting as blocked. Returns false when the way round has ended this frame. */
function wodRetreatGoRoundHeadway(unit) {
    const now=gameData._aiEconomyClock||0,sp=(gameData.hexRadius||20)*1.35;
    let d=Math.hypot(unit.target.x-unit.x,unit.target.y-unit.y);
    if(!unit.target.detour&&unit.path?.[0]?.goRound&&d<(unit.radius||12)*.75){
        wodTakeNextPathTarget(unit);d=Math.hypot(unit.target.x-unit.x,unit.target.y-unit.y);
    }
    // Once a second: if the comrades have moved off the straight way to the end of the way round
    // (one has walked away, or stepped aside after all), the corners in between are skipped.
    const last=unit.path?.length?unit.path[unit.path.length-1]:null;
    if(last&&now>=(unit._wodGoRoundLookAt||0)){
        unit._wodGoRoundLookAt=now+1;
        let open=wodSegmentClearsTerrainForUnit(unit,unit.x,unit.y,last.x,last.y);
        if(open)forEachNearbyUnit(gameData.unitSpatialGrid,unit.x,unit.y,sp*6,u=>{
            if(!open||u===unit||u.hp<=0||u.type==='convoy'||u.boardTransportUid||!wodBodiesMeet(unit,u))return;
            if((u.x-unit.x)*(last.x-unit.x)+(u.y-unit.y)*(last.y-unit.y)<=0)return;
            if(distPointToSegmentSquared(u.x,u.y,unit.x,unit.y,last.x,last.y)<((u.radius||12)+(unit.radius||12)+2)**2)open=false;
        });
        if(open){unit.target=last;unit.path=[];d=Math.hypot(last.x-unit.x,last.y-unit.y);}
    }
    const p=unit._wodGoRoundProgress,need=Math.min(sp*.25,(unit.speed||15)*WOD_MOVE_SPEED_FACTOR*getUnitSpeedMultiplier(unit)*.75*2*.4);
    if(!p||p.target!==unit.target||d<p.d-need){unit._wodGoRoundProgress={target:unit.target,d,at:now};return true;}
    if(now-p.at<=2)return true;
    wodEndRetreatGoRound(unit);
    return !!unit.target;
}
function wodSteerAroundFriendlyUnits(unit,nx,ny,dt=1/60) {
    const sx=nx-unit.x,sy=ny-unit.y,step=Math.hypot(sx,sy);if(step<.00001)return null;
    const speed=step/Math.max(.001,dt),friends=[],blockers=[],queued=new Set();let hostile=false;
    // An unarmed boat (a transport or supply ship) has no fight to stay in: it steers round an enemy vessel as it does
    // round a comrade. Two enemy landing craft that met bow to bow used to stop there for good, each waiting on the other.
    const unarmedBoat=wodIsNavalUnit(unit)&&!(unit.damage>0);
    forEachNearbyUnit(gameData.unitSpatialGrid,unit.x,unit.y,(unit.radius||12)+100,u=>{
        if(u===unit||u.hp<=0||u.type==='convoy'||!wodBodiesMeet(unit,u,nx,ny))return;
        blockers.push(u);if(u.boardTransportUid)return;
        // (a comrade queueing behind it in a pass gives way: no risk to steer round, and only a deep overlap blocks)
        if(wodQueuedBehind(unit,u)){queued.add(u);return;}
        if(!wodIsFriendlyOwner(u.owner,unit.owner)&&!(unarmedBoat&&wodIsNavalUnit(u))){if(Math.hypot(u.x-nx,u.y-ny)<(unit.radius||12)+(u.radius||12)+6)hostile=true;return;}
        const goal=u._trafficYield?.route?.target||u.target,dx=goal?goal.x-u.x:0,dy=goal?goal.y-u.y:0,len=Math.hypot(dx,dy)||1;
        const recent=goal&&u._wodVelocityAt!=null&&(gameData._aiEconomyClock||0)-u._wodVelocityAt<.3;
        // Recent measured motion already supplies both components.
        // Avoid repeating terrain, bridge and general-aura lookups
        // for every neighboring soldier when that estimate is unused.
        const velocity=goal&&!recent?(u.speed||15)*WOD_MOVE_SPEED_FACTOR*getUnitSpeedMultiplier(u):0;
        const vx=recent?u._wodVelocityX:dx/len*velocity,vy=recent?u._wodVelocityY:dy/len*velocity;
        const reach=(unit.radius||12)+(u.radius||12)+3+(speed+Math.hypot(vx,vy))*3;
        if((u.x-unit.x)**2+(u.y-unit.y)**2<=reach*reach)friends.push({u,vx,vy});
    });
    // Next to an enemy a unit does not steer round its comrades, so as not to slip out of the fight,
    // unless it is falling back: an enemy at its heels is no reason to press into the comrades in
    // front of it. (The candidate steps still keep clear of the enemy's body.)
    if(hostile&&!(unit._wodRiskRetreat||unit.retreating||unit.moraleBroken)||!friends.length)return null;
    // All steering candidates are one step from this same origin.
    // Reuse one conservative broad phase, then apply the original
    // exact overlap/escaping-overlap predicate to each candidate.
    const blockedAt=(x,y)=>step>35?isWorldPositionBlockedByUnits(unit,x,y):blockers.some(u=>{
        const min=((unit.radius||10)+(u.radius||10)+2)*(queued.has(u)?.6:1),min2=min*min;
        const old2=(u.x-unit.x)**2+(u.y-unit.y)**2,d2=(u.x-x)**2+(u.y-y)**2;
        return !(old2<min2&&d2>old2+.0001)&&d2<min2;
    });
    const horizon=3,now=gameData._aiEconomyClock||0;
    const risk=(vx,vy)=>friends.reduce((sum,f)=>{
        const dx=unit.x-f.u.x,dy=unit.y-f.u.y,rx=vx-f.vx,ry=vy-f.vy,den=rx*rx+ry*ry;
        const t=den>.001?Math.max(0,Math.min(horizon,-(dx*rx+dy*ry)/den)):0;
        const gap=Math.hypot(dx+rx*t,dy+ry*t),clear=(unit.radius||12)+(f.u.radius||12)+3;
        return sum+Math.max(0,clear-gap)**2*4;
    },0);
    if(risk(sx/dt,sy/dt)<.1&&!blockedAt(nx,ny))return null;
    let best=null,score=Infinity;
    const destination=unit.orderTarget&&getNearestHexToPoint(unit.orderTarget.x,unit.orderTarget.y);
    for(const angle of [0,.35,-.35,.7,-.7,1.1,-1.1,1.5,-1.5,2,-2,Math.PI,null]){
        const c=angle===null?0:Math.cos(angle),s=angle===null?0:Math.sin(angle),dx=sx*c-sy*s,dy=sx*s+sy*c,x=unit.x+dx,y=unit.y+dy;
        const side=angle==null?0:Math.sign(angle),turn=angle===null?65:(1-c)*25+Math.abs(angle)*2+(side<0?1:0);
        const preference=unit._wodAvoidUntil>now&&side&&side!==unit._wodAvoidSide?9:0;
        if(angle&&destination&&wodIsFriendlyOwner(destination.owner,unit.owner)&&!wodPassiveDisplacementAllowed(unit,x,y))continue;
        if(turn+preference>=score||!wodSegmentClearsTerrainForUnit(unit,unit.x,unit.y,x,y)||blockedAt(x,y))continue;
        // Avoidance looks ahead, rather than colliding first and forcing
        // body separation to push a standing friendly out of the way.
        if(angle!==null&&!wodSegmentClearsTerrainForUnit(unit,unit.x,unit.y,unit.x+dx/step*Math.min(32,speed*horizon),unit.y+dy/step*Math.min(32,speed*horizon)))continue;
        const cost=risk(dx/dt,dy/dt)+turn+preference;
        if(cost<score){score=cost;best={x,y,side};}
    }
    if(best?.side){unit._wodAvoidSide=best.side;unit._wodAvoidUntil=now+1;}
    return best;
}
const WOD_TRAFFIC_ORDER_FIELDS = ['target','path','orderTarget','fullMarchWaypoints','marchWpCursor','holding',
    '_wodRiskRetreat','_wodRetreatThreatSignature','_wodRetreatScanAt','_wodRetreatRouteBlocked',
    '_wodOrderIntoWater','_wodShoreExitRouting','_wodKeepLandFormation','_wodRouteUsesBridge','_routeArrowBuildGen','_routeArrowSig','_routeArrowThrottleUntil',
    '_routeArrowFrozenPts','_routeArrowMarchSig','_routeArrowProgressIdx','_routeArrowFrozenReady'];
function wodCaptureTrafficOrder(unit) {
    return Object.fromEntries(WOD_TRAFFIC_ORDER_FIELDS.map(k=>[k,unit[k]]));
}
function wodPlanTrafficDetour(unit,points,record) {
    if(record.idle&&points.some(p=>!wodPassiveDisplacementAllowed(unit,p.x,p.y)))return false;
    // Ships expose their active avoidance destination to fleet logistics.
    // Ground troops and marines keep stable command intent, just like
    // human units: a passing sidestep is never a new attack/landing goal.
    if(!wodMpIsHumanOwner(unit.owner)&&wodIsNavalUnit(unit)){
        const ok=assignUnitMoveAlongWaypoints(unit,points,{retainRetreat:true,transportInternal:true});
        if(ok)unit._trafficYield=record;
        return ok;
    }
    const command=wodCaptureTrafficOrder(unit);
    let ok=false;
    try {
        ok=assignUnitMoveAlongWaypoints(unit,points,{retainRetreat:true,transportInternal:true,keepLandFormation:!!command._wodKeepLandFormation});
        if(ok&&record.idle){
            let a={x:unit.x,y:unit.y};
            for(const b of [unit.target,...(unit.path||[])].filter(Boolean)){
                const samples=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/((gameData.hexRadius||20)*.4)));
                for(let i=1;i<=samples;i++)if(!wodPassiveDisplacementAllowed(unit,a.x+(b.x-a.x)*i/samples,a.y+(b.y-a.y)*i/samples)){ok=false;break;}
                if(!ok)break;a=b;
            }
        }
        if(ok)record.route=wodCaptureTrafficOrder(unit);
    } finally {Object.assign(unit,command);}
    if(ok)unit._trafficYield=record;
    return ok;
}
function wodIdleTrafficReturnPath(unit,point) {
    if(wodIsNavalUnit(unit)||unit.type==='convoy')return null;
    const start=getNearestHexToPoint(unit.x,unit.y),goal=getNearestHexToPoint(point.x,point.y);
    if(!start||!goal)return null;
    const hr=gameData.hexRadius||20,queue=[{...start,x:unit.x,y:unit.y,_trafficOrigin:true}],parents=new Map(),seen=new Set(['origin']);
    const nodeKey=h=>h._trafficOrigin?'origin':getHexKey(h);
    const blockers=gameData.entities.filter(u=>u!==unit&&u.hp>0&&u.type!=='convoy'&&!u.boardTransportUid&&Math.hypot(u.x-unit.x,u.y-unit.y)<hr*14);
    const clear=(a,b)=>{
        if(!wodSegmentClearsTerrainForUnit(unit,a.x,a.y,b.x,b.y))return false;
        if(blockers.some(u=>{
            const radius=(unit.radius||12)+(u.radius||12)+2,old=(a.x-u.x)**2+(a.y-u.y)**2;
            const d=distPointToSegmentSquared(u.x,u.y,a.x,a.y,b.x,b.y);
            return d<radius*radius-.01&&d<old-.01;
        }))return false;
        const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/(hr*.4)));
        for(let i=1;i<=steps;i++)if(!wodPassiveDisplacementAllowed(unit,a.x+(b.x-a.x)*i/steps,a.y+(b.y-a.y)*i/steps))return false;
        return true;
    };
    for(let i=0;i<queue.length&&i<400;i++){
        const at=queue[i];
        if(!at._trafficOrigin&&getHexKey(at)===getHexKey(goal)){
            const route=[at];let current=at;
            while(parents.has(nodeKey(current))){current=parents.get(nodeKey(current));route.push(current);}
            return route.reverse().slice(1).map(h=>({x:h.x,y:h.y}));
        }
        const neighbors=getNeighborHexes(at).slice();wodForEachBridgePathPortal(unit,at,n=>neighbors.push(n));
        if(at._trafficOrigin)neighbors.unshift(start);
        for(const h of neighbors){
            const key=getHexKey(h);if(seen.has(key)||Math.abs(h.q-start.q)>9||Math.abs(h.r-start.r)>9||
                !(at._trafficOrigin&&key===getHexKey(start))&&!wodCanStepBetweenHexes(unit,at,h,true))continue;
            const next=key===getHexKey(goal)?{...h,x:point.x,y:point.y}:h;
            if(!clear(at,next))continue;seen.add(key);parents.set(key,at);queue.push(next);
        }
    }
    return null;
}
function wodReturnIdleTraffic(unit,record) {
    const point=record.points?.[0],clock=gameData._aiEconomyClock||0;
    // (within eight pixels of the spot it stood on is back: wanting that very pixel, with comrades round it, it tried again
    // every second for good, nudged a little each time, and jiggled on the spot; a formation's place is kept to nine,
    // verify-coastal-group-movement)
    if(!point||Math.hypot(unit.x-point.x,unit.y-point.y)<8){unit._trafficYield=null;return;}
    unit._trafficYield=record;record.returning=true;
    if((record.returnRetryAt||0)>clock)return;
    record.returnRetryAt=clock+1;
    // An idle blocker must retain its return intent if the temporary
    // route times out or pathfinding is busy. It is not a new order.
    record.route={target:null};
    if(isWorldPositionBlockedByUnits(unit,point.x,point.y))return;
    record.until=clock+12;record.lastProgressAt=clock;
    record.returnRetries=(record.returnRetries||0)+1;
    const route=record.returnRetries>=3?wodIdleTrafficReturnPath(unit,point):null;
    wodPlanTrafficDetour(unit,route?.length?route:[point],record);
    unit._trafficYield=record;
}
// Taking up the march again after a sidestep is not a new order (transportInternal): it keeps an attack order on an
// enemy, a transport the unit is walking to board, its recovery and the player's order count. Land units resumed as if
// newly ordered, so a unit told to attack an enemy that stepped aside for a comrade walked on to where the enemy had
// been and stopped chasing, and one on its way to a boat forgot it.
function wodResumeTrafficYield(unit) {
    const y=unit._trafficYield;if(!y)return;
    // A passenger may have landed after this sidestep was planned.
    // Recheck coverage before continuing to yield away from the shore.
    const avoidanceGoal=y.route?(y.route.orderTarget||y.route.target):(unit.orderTarget||unit.target);
    if(unit.type==='supply'&&avoidanceGoal&&!wodSupplyParkingSafe(unit,avoidanceGoal)){
        unit._trafficYield=null;
        if(!wodMpIsHumanOwner(unit.owner))wodClearTransportMove(unit);
        else if(unit.orderTarget)replanUnitOrder(unit);
        return;
    }
    if(y.owner!==unit.owner){unit._trafficYield=null;return;}
    if(y.route?y.route.target:unit.target){
        const clock=gameData._aiEconomyClock||0;
        if(y.lastProgressAt==null||Math.hypot(unit.x-(y.lastX??unit.x),unit.y-(y.lastY??unit.y))>(gameData.hexRadius||20)*.35){
            y.lastProgressAt=clock;y.lastX=unit.x;y.lastY=unit.y;
        }
        // Two mutually yielding ships can stop a few pixels short of their
        // sidesteps. Expired avoidance must not suppress fleet orders forever.
        // A land unit that cannot get to its sidestep (in a pass the comrade it yields to
        // may stand across the only way there) gives up after three seconds without headway
        // instead of holding the pass shut for the full term; the other is then asked.
        // (Only where terrain hems it in; in open country nothing changes.)
        const at=getNearestHexToPoint(unit.x,unit.y),cannot=!y.returning&&!wodIsNavalUnit(unit)&&clock-y.lastProgressAt>3&&!!at&&!wodHexIsDeepLand(at);
        if((clock>y.until||cannot)&&clock-y.lastProgressAt>3&&!unit._combatEngaged){
            if(cannot)unit._trafficYieldGaveUpUntil=clock+12;
            if(y.idle&&y.route){wodReturnIdleTraffic(unit,y);return;}
            unit._trafficYield=null;
            if(y.route){if(unit.orderTarget)replanUnitOrder(unit);}
            else if(!y.idle&&y.points?.length)
                assignUnitMoveAlongWaypoints(unit,y.points,{retainRetreat:true,transportInternal:true});
            else wodClearTransportMove(unit);
        }
        return;
    }
    if(y.returning){
        if(y.idle&&y.route)wodReturnIdleTraffic(unit,y);
        else unit._trafficYield=null;
        return;
    }
    const leader=gameData.entities.find(u=>u.uid===y.leader&&u.hp>0);
    const passed=!leader||!leader.target&&!leader._trafficYield||(leader.x-y.x)*y.ax+(leader.y-y.y)*y.ay>0||Math.hypot(leader.x-unit.x,leader.y-unit.y)>(gameData.hexRadius||20)*5;
    if(!passed&&(gameData._aiEconomyClock||0)<y.until)return;
    unit._trafficYield=null;
    if(y.idle&&unit._navalLanded)return;
    if(unit.type==='supply'&&y.points[0]&&!wodSupplyParkingSafe(unit,y.points[0]))return;
    if(y.idle&&y.points[0]&&isWorldPositionBlockedByUnits(unit,y.points[0].x,y.points[0].y)){
        // A passing column may still be crossing the saved position.
        // Keep the return order until the moving obstruction has cleared.
        if(gameData.entities.some(other=>other!==unit&&other.hp>0&&other.target&&Math.hypot(other.x-y.points[0].x,other.y-y.points[0].y)<(other.radius||12)+(unit.radius||12)+4))unit._trafficYield=y;
        return;
    }
    if(y.owner===unit.owner&&y.points.length){
        if(y.idle&&y.route)wodReturnIdleTraffic(unit,y);
        // Fleet detours replace fullMarchWaypoints with the sidestep.
        // The saved points, not that temporary route, are the march.
        else if(!y.route)
            assignUnitMoveAlongWaypoints(unit,y.points,{retainRetreat:true,transportInternal:true});
        else if(unit.fullMarchWaypoints?.length)assignUnitMoveAlongWaypoints(unit,unit.fullMarchWaypoints,{fromLegAdvance:true,retainRetreat:true,transportInternal:true});
        else assignUnitMoveAlongWaypoints(unit,y.points,{retainRetreat:true,transportInternal:true});
    }
}
function wodSupplyParkingSafe(ship,point) {
    if(ship.type!=='supply')return true;
    const radius=wodSupplyShipRadiusPx();
    return gameData.entities.every(u=>u.owner!==ship.owner||!u._navalLanded||u.hp<=0||u.type==='marine'||
        Math.hypot(u.x-ship.x,u.y-ship.y)>=radius||Math.hypot(u.x-point.x,u.y-point.y)<radius*.94);
}
function wodYieldFriendlyTraffic(mover) {
    if(gameData._wodPfFrameActive&&gameData._trafficPlanFrameDone||!wodCanSpendPf())return false;
    if((mover._trafficRetryAt||0)>(gameData._aiEconomyClock||0))return false;
    mover._trafficRetryAt=(gameData._aiEconomyClock||0)+.6;gameData._trafficPlanFrameDone=true;
    const target=mover.target;if(!target)return false;
    let dx=target.x-mover.x,dy=target.y-mover.y,len=Math.hypot(dx,dy)||1;dx/=len;dy/=len;
    // Hemmed in by terrain (in a pass, on a shore path) the mover cannot walk round a comrade
    // who stands on its road, and he need not be within arm's reach to close it: an armoured
    // unit one cell beyond the mouth of a pass covers the mouth with its body. So there the
    // next two and a half cells of the road count as well.
    const here=getNearestHexToPoint(mover.x,mover.y),hemmed=here&&!wodIsNavalUnit(mover)&&!wodHexIsDeepLand(here);
    const ahead=Math.min(1,(gameData.hexRadius||20)*1.35*2.5/len),ax=mover.x+(target.x-mover.x)*ahead,ay=mover.y+(target.y-mover.y)*ahead;
    const nearby=gameData.entities.filter(u=>u!==mover&&u.hp>0&&u.type!=='convoy'&&wodIsFriendlyOwner(u.owner,mover.owner)&&!u.boardTransportUid&&!u.pickupUid&&
        (Math.hypot(u.x-mover.x,u.y-mover.y)<(u.radius||12)+(mover.radius||12)+12||
        hemmed&&!u.target&&distPointToSegmentSquared(u.x,u.y,mover.x,mover.y,ax,ay)<((u.radius||12)+(mover.radius||12)+2)**2));
    const blocker=nearby.find(u=>!u.target&&!u._trafficYield)||nearby.find(u=>u.target&&!u._trafficYield&&
        (u.target.x-u.x)*dx+(u.target.y-u.y)*dy<Math.hypot(u.target.x-u.x,u.target.y-u.y)*.65);
    if(!blocker)return false;
    const supplying=u=>u.type==='supply'&&!wodSupplyParkingSafe(u,{x:u.x+10000,y:u.y});
    const first=mover.retreating&&!blocker.retreating?blocker:blocker.retreating&&!mover.retreating?mover:blocker._combatEngaged&&!mover._combatEngaged?mover:supplying(blocker)&&!supplying(mover)?mover:supplying(mover)&&!supplying(blocker)?blocker:blocker.target&&(String(ensureUnitId(mover))>String(ensureUnitId(blocker)))?mover:blocker,second=first===mover?blocker:mover;
    // Two marchers meeting head-on: nothing but their serial numbers picked the one to step
    // aside, and he may be the one with no room for it (inside a pass, his comrade's body
    // across the only way out), or may just have tried and given up. Then the other does.
    // (Only where terrain hems one of them in; in open country nothing changes.)
    const pent=u=>{const h=getNearestHexToPoint(u.x,u.y);return !!h&&!wodHexIsDeepLand(h);};
    const equals=blocker.target&&!mover.retreating&&!blocker.retreating&&!mover._combatEngaged&&!blocker._combatEngaged&&!wodIsNavalUnit(mover)&&!wodIsNavalUnit(blocker)&&(hemmed||pent(blocker));
    const gaveUp=u=>(u._trafficYieldGaveUpUntil||0)>(gameData._aiEconomyClock||0);
    return (equals?(gaveUp(first)&&!gaveUp(second)?[second,first]:[first,second]):[first]).some(loser=>wodStepAsideForTraffic(mover,blocker,loser,loser===mover?-dx:dx,loser===mover?-dy:dy));
}
function wodStepAsideForTraffic(mover,blocker,loser,dx,dy) {
    const leader=loser===mover?blocker:mover;
    if(loser._trafficYield||loser._combatEngaged&&!loser.retreating)return false;
    const center=getNearestHexToPoint(loser.x,loser.y),spacing=(gameData.hexRadius||20)*1.35;if(!center)return false;
    const reserved=gameData.entities.filter(u=>u!==loser&&u.hp>0&&wodIsFriendlyOwner(u.owner,loser.owner)).map(u=>({u,
        point:u._trafficYield?.idle?u._trafficYield.points?.[0]:u.fullMarchWaypoints?.at(-1)||u.orderTarget})).filter(s=>s.point);
    const sites=[];
    // Stepping aside onto the leader's own road is no help. Beyond the mouth of a pass the
    // cell "ahead and to one side" is often the leader's next waypoint, and a comrade who
    // parked there closed the pass until his yield ran out. (In open country, where every
    // neighbouring cell is plain ground, the leader walks round him and nothing changes.)
    const road=[leader,leader.target,...(leader.path||[]).slice(0,3)].filter(Boolean),roadClear=((loser.radius||12)+(leader.radius||12)+3)**2;
    const onRoad=h=>{if(wodIsNavalUnit(loser)||wodHexIsDeepLand(h))return false;for(let i=1;i<road.length;i++)if(distPointToSegmentSquared(h.x,h.y,road[i-1].x,road[i-1].y,road[i].x,road[i].y)<roadClear)return true;return false;};
    // Marines already swimming can pass in open water. A landed marine
    // or an ordinary land formation still yields on dry ground only.
    const waterYield=wodIsNavalUnit(loser)||loser.type==='marine'&&!loser._wodKeepLandFormation&&isWaterHex(center)&&!wodUnitOnBridgeDeck(loser);
    // (a water cell of a bridge is a place to stand aside only where its middle is on the deck or the margin beside it:
    // the cells round a deck are bridge cells for routing, and a comrade stepping aside into one stood in the river)
    const deckCell=h=>isBridgeHex(h)&&(!isWaterHex(h)||wodPointBesideBridge(loser,h.x,h.y));
    for(const pt of getHexesInRadius(center.q,center.r,6)) {
        const h=wodHexAt(pt.q,pt.r);if(!h||!wodPathTileWalkable(loser,h,false)||!waterYield&&isWaterHex(h)&&!deckCell(h)||isWorldPositionBlockedByUnits(loser,h.x,h.y))continue;
        if(!loser.target&&!wodPassiveDisplacementAllowed(loser,h.x,h.y))continue;
        if(reserved.some(s=>Math.hypot(h.x-s.point.x,h.y-s.point.y)<(loser.radius||12)+(s.u.radius||12)+4))continue;
        if(loser.type==='supply'&&(!wodSupplyParkingSafe(loser,h)||!wodOpenWaterChordClear(loser,loser.x,loser.y,h.x,h.y)))continue;
        if(loser._navalLanded&&loser.type!=='marine'&&!wodCurrentSupplyComponent(h,loser.owner).city&&
            !gameData.entities.some(s=>s.owner===loser.owner&&s.type==='supply'&&s.hp>0&&Math.hypot(s.x-h.x,s.y-h.y)<wodSupplyShipRadiusPx()*.9))continue;
        const x=h.x-loser.x,y=h.y-loser.y,along=x*dx+y*dy,lateral=Math.abs(x*dy-y*dx);
        if(along<spacing*.7||lateral<spacing*.8||onRoad(h))continue;
        const open=getNeighborHexes(h).filter(n=>wodPathTileWalkable(loser,n,false)&&(!isWaterHex(n)||waterYield||deckCell(n))).length;
        if(open<5)continue;
        sites.push({h,score:Math.hypot(x,y)+lateral*.35});
    }
    sites.sort((a,b)=>a.score-b.score);
    const pass=!wodIsNavalUnit(loser)&&wodInOneCellPass(loser,center);
    for(const {h} of sites.slice(0,4)) {
        const points=wodUnitRemainingMarchPoints(loser).map(p=>({x:p.x,y:p.y})),idle=!points.length;
        if(idle)points.push({x:loser.x,y:loser.y});
        const record={points,idle,internal:wodIsNavalUnit(loser)||loser.type==='marine',owner:loser.owner,leader:ensureUnitId(leader),x:h.x,y:h.y,ax:dx,ay:dy,until:(gameData._aiEconomyClock||0)+25};
        if(!wodPlanTrafficDetour(loser,[{x:h.x,y:h.y}],record))continue;
        // In a one-cell pass the way to open ground runs back along the column: the comrades behind stand on it, so the
        // unit could not get there, gave up after three seconds and was sent again (verify-terrain-ui, the bend). Such
        // a place is no use; the next is tried, or nobody steps aside and the column waits its turn. (Not on a bridge,
        // where a short deck clears by backing off it, nor in a wider pass, where the place is beside the road.)
        if(pass&&record.route&&wodTrafficDetourRunsIntoComrades(loser,record.route)){loser._trafficYield=null;continue;}
        return true;
    }
    return false;
}
// Whether the first six cells of a planned way to step aside lead into another unit's body (closer to it than the
// unit stands now).
function wodTrafficDetourRunsIntoComrades(unit,route) {
    const pts=[route.target,...(route.path||[])].filter(Boolean);if(!pts.length)return false;
    const hr=gameData.hexRadius||20,limit=hr*1.35*6,r0=unit.radius||12;
    const others=gameData.entities.filter(u=>u!==unit&&u.hp>0&&u.type!=='convoy'&&!u.boardTransportUid&&
        Math.hypot(u.x-unit.x,u.y-unit.y)<limit+hr*2&&wodBodiesMeet(unit,u));
    let a={x:unit.x,y:unit.y},walked=0;
    for(const b of pts){
        const len=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(1,Math.ceil(len/(hr*.4)));
        for(let i=1;i<=steps;i++){
            const x=a.x+(b.x-a.x)*i/steps,y=a.y+(b.y-a.y)*i/steps;
            if(others.some(u=>{const min=(r0+(u.radius||12))*.9,d=(u.x-x)**2+(u.y-y)**2;return d<min*min&&d<(u.x-unit.x)**2+(u.y-unit.y)**2;}))return true;
        }
        walked+=len;if(walked>limit)break;a=b;
    }
    return false;
}
function worldPositionClearOfUnits(x, y, minSep, ignoreUnit) {
    let m2 = minSep * minSep;
    for(let u of gameData.entities) {
        if(u === ignoreUnit || u.hp <= 0 || u.type === 'convoy') continue;
        let dx = u.x - x;
        let dy = u.y - y;
        if(dx * dx + dy * dy < m2) return false;
    }
    return true;
}
function hexMountainProximityScore(hex,unit) {
    if(wodCanClimb(unit))return 0;
    if(!hex) return 0;
    if(hex.type === 'mountain') return 5000;
    let s = 0;
    for(let n of getNeighborHexes(hex)) {
        if(n && n.type === 'mountain') s += 10;
        if(!n) continue;
        for(let n2 of getNeighborHexes(n)) {
            if(n2 && n2.type === 'mountain') { s += 2.2; break; }
        }
    }
    return s;
}
function findLocalDetourHex(unit, targetX, targetY) {
    let currentHex = getNearestHexToPoint(unit.x, unit.y);
    if(!currentHex) return null;
    let best = null;
    let bestScore = Infinity;
    let forbidWater = wodUnitPrefersLandOnlyPath(unit);
    let allowWater = wodOrderIntoWater(unit, null);
    function consider(nHex, portal) {
        if(!nHex) return;
        if(portal) {
            if(!wodPathTileWalkable(unit, nHex, allowWater)) return;
            if(!allowWater && isWaterHex(nHex) && !isBridgeHex(nHex)) return;
        } else if(!wodCanStepBetweenHexes(unit, currentHex, nHex, forbidWater)) return;
        let dx = targetX - nHex.x;
        let dy = targetY - nHex.y;
        let frontPenalty = isFrontlineHex(nHex, unit.owner) ? 0 : 2500;
        let mtn = (!wodIsNavalUnit(unit) && !(unit.type === 'convoy' && unit.convoySeaRoute)) ? hexMountainProximityScore(nHex,unit) * 28 : 0;
        let score = dx * dx + dy * dy + frontPenalty + mtn + Math.random() * 280;
        if(score < bestScore) {
            bestScore = score;
            best = nHex;
        }
    }
    for(let dir of hexDirections) {
        let nHex = wodHexAt(currentHex.q + dir.q,currentHex.r + dir.r);
        consider(nHex, false);
    }
    wodForEachBridgePathPortal(unit, currentHex, (nHex) => consider(nHex, true));
    if(best || wodIsNavalUnit(unit) || (unit.type === 'convoy' && unit.convoySeaRoute)) return best;
    // Wider escape search when hugging mountain seams (pathfinding + pixel coords disagree).
    let queue = [{hex: currentHex, d: 0}];
    let seen = new Set([getHexKey(currentHex)]);
    while(queue.length > 0) {
        let {hex, d} = queue.shift();
        if(d >= 7) continue;
        for(let dir of hexDirections) {
            let nHex = wodHexAt(hex.q + dir.q,hex.r + dir.r);
            if(!nHex || seen.has(getHexKey(nHex))) continue;
            if(!wodCanStepBetweenHexes(unit, hex, nHex, forbidWater)) continue;
            seen.add(getHexKey(nHex));
            let dx = targetX - nHex.x;
            let dy = targetY - nHex.y;
            let mtn = hexMountainProximityScore(nHex,unit) * 48;
            let score = dx * dx + dy * dy + d * 8500 + mtn + Math.random() * 220;
            if(score < bestScore) {
                bestScore = score;
                best = nHex;
            }
            if(d < 6) queue.push({hex: nHex, d: d + 1});
        }
    }
    return best;
}
function findReachableOrderHex(unit, x, y) {
    if(wodUnitPrefersLandOnlyPath(unit)) {
        let land = wodResolveLandMarchHex(unit, x, y);
        if(land) return land;
    }
    if(unit && (wodIsNavalUnit(unit) || (unit.type === 'convoy' && unit.convoySeaRoute))) {
        let sea = wodResolveShipMarchHex(unit, x, y);
        if(sea) return sea;
        return null;
    }
    let bh = wodBridgeHexAtPoint(unit, x, y);
    if(bh) return { hex: bh, exactX: x, exactY: y, intoWater: false };
    let targetCoord = pixelToHex(x, y);
    let targetHex = wodHexAt(targetCoord.q,targetCoord.r);
    if(canUseHexForMovement(unit, targetHex)) return {hex: targetHex, exactX: x, exactY: y};

    let best = null;
    let bestScore = Infinity;
    for(let pt of getHexesInRadius(targetCoord.q, targetCoord.r, 18)) {
        let hex = wodHexAt(pt.q,pt.r);
        if(!canUseHexForMovement(unit, hex)) continue;
        let dx = x - hex.x;
        let dy = y - hex.y;
        let score = dx * dx + dy * dy;
        if(!wodIsNavalUnit(unit) && !(unit.type === 'convoy' && unit.convoySeaRoute)) score += hexMountainProximityScore(hex) * 520;
        if(score < bestScore) {
            bestScore = score;
            best = hex;
        }
    }
    best = best || findBestReachableHexToward(unit, x, y);
    return best ? {hex: best, exactX: best.x, exactY: best.y} : null;
}
/** Accept ship/sea-convoy orders only when the click is already on open water.
 * Land clicks return null so the ship stays put (including in mixed land+ship groups). */
function wodResolveShipMarchHex(unit, x, y) {
    if(!unit || (!wodIsNavalUnit(unit) && !(unit.type === 'convoy' && unit.convoySeaRoute))) return null;
    let coord = pixelToHex(x, y);
    let direct = wodHexAt(coord.q,coord.r);
    if(direct && wodIsOpenWaterHex(direct) && canUseHexForMovement(unit, direct)) {
        if(wodSamplePosOnWalkableTerrain(unit, x, y))
            return { hex: direct, exactX: x, exactY: y };
        return { hex: direct, exactX: direct.x, exactY: direct.y };
    }
    // Only a tiny shoreline fudge — never pull a land click across the map onto water.
    let hr = gameData.hexRadius || 20;
    let maxD2 = hr * hr * 1.15;
    let best = null,
        bestScore = Infinity;
    for(let pt of getHexesInRadius(coord.q, coord.r, 1)) {
        let hex = wodHexAt(pt.q,pt.r);
        if(!hex || !wodIsOpenWaterHex(hex) || !canUseHexForMovement(unit, hex)) continue;
        let dx = x - hex.x,
            dy = y - hex.y;
        let score = dx * dx + dy * dy;
        if(score <= maxD2 && score < bestScore) {
            bestScore = score;
            best = hex;
        }
    }
    return best ? { hex: best, exactX: best.x, exactY: best.y } : null;
}
function findBestReachableHexToward(unit, x, y) {
    let current = getNearestWalkableHexForUnit(unit, unit.x, unit.y);
    let targetCoord = pixelToHex(x, y);
    let best = null;
    let bestScore = Infinity;
    let maxR = Math.min(44, 14 + Math.floor((gameData.hexList && gameData.hexList.length ? gameData.hexList.length : 4000) / 520));
    for(let pt of getHexesInRadius(targetCoord.q, targetCoord.r, maxR)) {
        let hex = wodHexAt(pt.q,pt.r);
        if(!canUseHexForMovement(unit, hex)) continue;
        let targetDx = x - hex.x;
        let targetDy = y - hex.y;
        let selfDx = current ? current.x - hex.x : 0;
        let selfDy = current ? current.y - hex.y : 0;
        let frontBonus = isFrontlineHex(hex, unit.owner) ? -25000 : 0;
        let mire = (!wodIsNavalUnit(unit) && !(unit.type === 'convoy' && unit.convoySeaRoute)) ? hexMountainProximityScore(hex) * 340 : 0;
        let score = targetDx * targetDx + targetDy * targetDy + (selfDx * selfDx + selfDy * selfDy) * 0.08 + frontBonus + mire;
        if(score < bestScore) {
            bestScore = score;
            best = hex;
        }
    }
    if(best || wodUnitPrefersLandOnlyPath(unit)) return best;
    for(let hex of gameData.hexList) {
        if(!canUseHexForMovement(unit, hex)) continue;
        let targetDx = x - hex.x;
        let targetDy = y - hex.y;
        let selfDx = current ? current.x - hex.x : 0;
        let selfDy = current ? current.y - hex.y : 0;
        let frontBonus = isFrontlineHex(hex, unit.owner) ? -25000 : 0;
        let mire = (!wodIsNavalUnit(unit) && !(unit.type === 'convoy' && unit.convoySeaRoute)) ? hexMountainProximityScore(hex) * 340 : 0;
        let score = targetDx * targetDx + targetDy * targetDy + (selfDx * selfDx + selfDy * selfDy) * 0.08 + frontBonus + mire;
        if(score < bestScore) {
            bestScore = score;
            best = hex;
        }
    }
    return best;
}
function findSpawnHex(type, city, owner) {
    let fakeUnit = {type, owner};
    let maxR = wodIsNavalType(type) ? 9 : 11;
    let best = null;
    let bestScore = Infinity;
    for(let pt of getHexesInRadius(city.q, city.r, maxR)) {
        let hex = wodHexAt(pt.q,pt.r);
        if(!canUnitEnterHex(fakeUnit, hex)) continue;
        if(!wodIsNavalType(type) && hex.type === 'mountain' && type!=='mountaineer') continue;
        if(!wodIsNavalType(type) && isWaterHex(hex)) continue;
        if(wodIsNavalType(type) && !isWaterHex(hex)) continue;
        let dx = city.x - hex.x;
        let dy = city.y - hex.y;
        let terrainPenalty = hex.type === 'urban' ? -100 : 0;
        const spawnRadius=type==='motorized'?14:type==='ship'?20:(type==='heavy'||type==='transport'||type==='supply'?16:12);
        if(!gameData.entities.every(u=>u.hp<=0||u.type==='convoy'||Math.hypot(u.x-hex.x,u.y-hex.y)>=spawnRadius+(u.radius||12)+3))continue;
        let crowdPenalty=0;
        let score = dx * dx + dy * dy + terrainPenalty + crowdPenalty;
        if(!wodIsNavalType(type)) score += hexMountainProximityScore(hex,fakeUnit) * 55;
        if(score < bestScore) {
            bestScore = score;
            best = hex;
        }
    }
    return best;
}
function buildConvoyFrontlineAvoidanceCost(unit) {
    let sea = unit.convoySeaRoute;
    let owner = unit.owner;
    let extra = {};
    function addHex(h, amt) {
        if(!h || amt <= 0) return;
        if(sea && !isWaterHex(h)) return;
        if(!sea && (isWaterHex(h) || h.type === 'mountain')) return;
        if(!canUnitEnterHex(unit, h)) return;
        let k = `${h.q},${h.r}`;
        extra[k] = (extra[k] || 0) + amt;
    }
    for(let e of gameData.entities) {
        if(e.hp <= 0 || e.type === 'convoy') continue;
        if(e.owner === 0 || e.owner === owner) continue;
        if(sea) {
            if(e.type !== 'ship') continue;
        } else if(e.type === 'ship') continue;

        let center = getNearestHexToPoint(e.x, e.y);
        if(!center) continue;
        if(!sea && isWaterHex(center)) continue;
        if(sea && !isWaterHex(center)) continue;

        let stack = [{h: center, d: 0}];
        let seen = new Set();
        while(stack.length) {
            let {h, d} = stack.pop();
            let hk = `${h.q},${h.r}`;
            if(seen.has(hk)) continue;
            seen.add(hk);
            if(d > 4) continue;
            let ringCost = [6.2, 5.1, 3.6, 2.2, 1.1][d] || 0;
            if(ringCost > 0) addHex(h, ringCost);
            if(d >= 4) continue;
            for(let nn of getNeighborHexes(h)) {
                if(nn) stack.push({h: nn, d: d + 1});
            }
        }
    }

    for(let h of gameData.hexList) {
        if(!canUnitEnterHex(unit, h)) continue;
        let k = `${h.q},${h.r}`;
        if(!sea) {
            if(isFrontlineHex(h, owner)) extra[k] = (extra[k] || 0) + 12;
            for(let nn of getNeighborHexes(h)) {
                if(nn && isClaimableLand(nn) && nn.owner > 0 && nn.owner !== owner) {
                    extra[k] = (extra[k] || 0) + 7;
                    break;
                }
            }
        } else {
            for(let nn of getNeighborHexes(h)) {
                if(nn && isWaterHex(nn) && nn.owner > 0 && nn.owner !== owner) {
                    extra[k] = (extra[k] || 0) + 7.5;
                    break;
                }
            }
            if(isFrontlineHex(h, owner)) extra[k] = (extra[k] || 0) + 9;
        }
    }
    return extra;
}
function wodIsOpenWaterHex(hex) {
    return !!(hex && isWaterHex(hex) && !isBridgeHex(hex));
}
function wodMergeHexPaths(a, b) {
    if(!a || !a.length) return b || [];
    if(!b || !b.length) return a;
    if(getHexKey(a[a.length - 1]) === getHexKey(b[0])) return smoothGridPath(a.concat(b.slice(1)));
    return smoothGridPath(a.concat(b));
}
/** Fast 8-way greedy steps on open water only — separate from land A*. */
function findGreedyAmphibiousWaterStep(unit, targetHex, opt) {
    opt = opt || {};
    let cur = opt.fromHex;
    if(!cur || !wodIsOpenWaterHex(cur) || !targetHex) return null;
    let best = null,
        bestScore = Infinity;
    let tb = ((targetHex.q * 2654435761) ^ (targetHex.r * 1597334677) ^ (cur.q * 2246822519)) >>> 0;
    for(let di = 0; di < hexDirections.length; di++) {
        let d = hexDirections[di];
        let nHex = wodHexAt(cur.q + d.q,cur.r + d.r);
        if(!wodIsOpenWaterHex(nHex)) continue;
        let dx = targetHex.x - nHex.x,
            dy = targetHex.y - nHex.y;
        let score = dx * dx + dy * dy;
        let tie = (((nHex.q * 374761393) ^ (nHex.r * 668265263) ^ tb) >>> 0) * 2.287e-9;
        if(score + tie < bestScore) {
            bestScore = score + tie;
            best = nHex;
        }
    }
    return best;
}
function buildGreedyAmphibiousWaterChain(unit, startHex, targetHex, maxSteps) {
    if(!startHex || !targetHex || !wodIsOpenWaterHex(startHex)) return [];
    let chain = [startHex];
    let cur = startHex;
    let tk = getHexKey(targetHex);
    for(let s = 0; s < maxSteps; s++) {
        if(getHexKey(cur) === tk) break;
        let next = findGreedyAmphibiousWaterStep(unit, targetHex, { fromHex: cur });
        if(!next || getHexKey(next) === getHexKey(cur)) break;
        if(chain.length > 1 && getHexKey(next) === getHexKey(chain[chain.length - 2])) break;
        chain.push(next);
        cur = next;
    }
    return chain;
}
/** Bounded BFS over open-water tiles — rescues amphibious legs when the greedy
 * chain stalls on concave coastlines (the main reason cross-water orders failed). */
function wodNavalWaterRegionKeys(unit,start) {
    if(!wodIsOpenWaterHex(start))return null;
    const revision=(gameData._landGeometryRevision||0)+'|'+(gameData._wodPfVer||0);
    let cache=gameData._navalWaterRegions;
    if(!cache||cache.hexes!==gameData.hexes||cache.revision!==revision)cache=gameData._navalWaterRegions={hexes:gameData.hexes,revision,byKey:new Map()};
    const root=getHexKey(start);if(cache.byKey.has(root))return cache.byKey.get(root);
    const keys=new Set([root]),queue=[start];
    for(let i=0;i<queue.length;i++)for(const d of hexDirections){const h=queue[i],n=wodHexAt(h.q+d.q,h.r+d.r);if(!wodIsOpenWaterHex(n)||keys.has(getHexKey(n))||!wodCanStepBetweenHexes(unit,h,n,false))continue;keys.add(getHexKey(n));queue.push(n);}
    for(const key of keys)cache.byKey.set(key,keys);return keys;
}
function wodWaterBfsPath(unit, fromHex, toHex, maxNodes) {
    if(!fromHex||!toHex||!wodIsOpenWaterHex(fromHex)||!wodIsOpenWaterHex(toHex))return [];
    if(wodHexKeysEqual(fromHex,toHex))return [fromHex];
    const limit=maxNodes==null?9000:maxNodes;if(limit<1)return [];
    if(wodOpenWaterChordClear(unit,fromHex.x,fromHex.y,toHex.x,toHex.y))return [fromHex,toHex];
    // A* explores the useful sea corridor instead of flooding a whole ocean
    // before reaching a distant island. Keep the existing bounded budget.
    const startTime=performance.now(),ceiling=unit?._wodPfDeepUntil>0?150:unit?._wodPfRelaxUntil>startTime?22:(gameState==='PLAYING'&&!gameData.menuAttractMode?7:26);
    const heap=[],cost=new Map([[getHexKey(fromHex),0]]),parent=new Map(),closed=new Set();
    const heuristic=h=>{const x=Math.abs(h.q-toHex.q),y=Math.abs(h.r-toHex.r);return Math.max(x,y)+(Math.SQRT2-1)*Math.min(x,y);};
    const push=(h,g)=>{const rec={h,g,f:g+heuristic(h)};let i=heap.length;heap.push(rec);while(i){const j=(i-1)>>1;if(heap[j].f<=rec.f)break;heap[i]=heap[j];i=j;}heap[i]=rec;};
    const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1].f<heap[j].f)j++;if(heap[j].f>=last.f)break;heap[i]=heap[j];i=j;}heap[i]=last;}return first;};
    push(fromHex,0);let nodes=0;
    while(heap.length){
        if(++nodes>limit||((nodes&255)===0&&performance.now()-startTime>ceiling))return [];
        const rec=pop(),h=rec.h,key=getHexKey(h);if(closed.has(key))continue;closed.add(key);
        if(wodHexKeysEqual(h,toHex)){const route=[h];let cur=h;while(parent.has(getHexKey(cur))){cur=parent.get(getHexKey(cur));route.push(cur);}return smoothGridPath(route.reverse());}
        for(const d of hexDirections){const n=wodHexAt(h.q+d.q,h.r+d.r);if(!wodIsOpenWaterHex(n)||closed.has(getHexKey(n))||!wodCanStepBetweenHexes(unit,h,n,false))continue;
            const g=rec.g+Math.hypot(d.q,d.r);if(g>=(cost.get(getHexKey(n))??Infinity))continue;cost.set(getHexKey(n),g);parent.set(getHexKey(n),h);push(n,g);}
    }return [];
}
function wodAmphibiousWaterLeg(unit, fromW, toW, maxSteps) {
    if(!fromW || !toW) return [];
    if(wodHexKeysEqual(fromW, toW)) return [fromW];
    let chain = buildGreedyAmphibiousWaterChain(unit, fromW, toW, maxSteps);
    if(chain.length > 1 && wodHexKeysEqual(chain[chain.length - 1], toW)) return chain;
    let bfs = wodWaterBfsPath(unit, fromW, toW, 12000);
    if(bfs.length > 1) return bfs;
    return chain;
}
function wodNearestOpenWaterHex(unit, fromHex, towardHex, maxRing) {
    if(!fromHex || !towardHex) return null;
    let best = null,
        bestScore = Infinity;
    let queue = [{ hex: fromHex, d: 0 }];
    let seen = new Set([getHexKey(fromHex)]);
    let qi = 0;
    while(qi < queue.length) {
        let { hex, d } = queue[qi++];
        if(d > maxRing) continue;
        if(wodIsOpenWaterHex(hex)) {
            let dx = towardHex.x - hex.x,
                dy = towardHex.y - hex.y;
            let score = dx * dx + dy * dy + d * 1200;
            if(score < bestScore) {
                bestScore = score;
                best = hex;
            }
        }
        if(d >= maxRing) continue;
        for(let di = 0; di < hexDirections.length; di++) {
            let ddir = hexDirections[di];
            let n = wodHexAt(hex.q + ddir.q,hex.r + ddir.r);
            if(!n) continue;
            let nk = getHexKey(n);
            if(seen.has(nk)) continue;
            if(n.type === 'mountain') continue;
            if(!wodIsOpenWaterHex(n) && !wodHexWalkableForLandPath(unit, n, false) && !isBridgeHex(n)) continue;
            seen.add(nk);
            queue.push({ hex: n, d: d + 1 });
        }
    }
    return best;
}
/** Land tile beside open water for stepping between a land approach and a water goal.
 * Searches around the LAND side of the leg — searching around the water bias meant
 * that for islands further apart than the ring the start island's shore was never
 * found, and cross-water orders to land objectives silently failed. */
function wodFindAmphibiousShoreCrossing(unit, landBiasHex, waterBiasHex, maxRing) {
    if(!unit || !landBiasHex || !waterBiasHex) return null;
    maxRing = maxRing == null ? 18 : maxRing;
    let best = null,
        bestScore = Infinity;
    // The shore must lie on the land it is the shore of. The nearest beach to the other side could belong to another
    // landmass (the one the march starts from, curving round a bay); the land leg from it to the goal never existed, the
    // whole route failed, and a player's troops ordered to that island never set off.
    const landmass = wodTransportLandingRegion(unit, landBiasHex);
    let pts = getHexesInRadius(landBiasHex.q, landBiasHex.r, maxRing);
    for(let pi = 0; pi < pts.length; pi++) {
        let land = wodHexAt(pts[pi].q,pts[pi].r);
        if(!land || isWaterHex(land) || isBridgeHex(land) || land.type === 'mountain') continue;
        if(landmass && !landmass.has(getHexKey(land))) continue;
        if(!wodHexWalkableForLandPath(unit, land, false)) continue;
        let waterHex = null,
            waterScore = Infinity;
        for(let di = 0; di < hexDirections.length; di++) {
            let d = hexDirections[di];
            let w = wodHexAt(land.q + d.q,land.r + d.r);
            if(!wodIsOpenWaterHex(w)) continue;
            let dx = waterBiasHex.x - w.x,
                dy = waterBiasHex.y - w.y;
            let s = dx * dx + dy * dy;
            if(s < waterScore) {
                waterScore = s;
                waterHex = w;
            }
        }
        if(!waterHex) continue;
        let dxL = land.x - landBiasHex.x,
            dyL = land.y - landBiasHex.y;
        let dxW = waterHex.x - waterBiasHex.x,
            dyW = waterHex.y - waterBiasHex.y;
        let score = dxL * dxL + dyL * dyL + (dxW * dxW + dyW * dyW) * 0.42;
        if(score < bestScore) {
            bestScore = score;
            best = { landHex: land, waterHex: waterHex };
        }
    }
    return best;
}
/** Land-only approach leg for amphibious routing — never re-enters full army/water compose. */
function wodFindLandApproachPath(unit, fromHex, toLandHex) {
    if(!fromHex || !toLandHex) return [];
    if(wodHexKeysEqual(fromHex, toLandHex)) return [fromHex];
    let path = findPathAroundTerrain(unit, toLandHex, fromHex, true, 'land');
    if(path.length > 1 && wodPathReachesTarget(path, toLandHex)) return path;
    let portal = smoothGridPath(wodLandBfsPath(unit, fromHex, toLandHex, 9000, true));
    if(portal.length > 1 && wodPathReachesTarget(portal, toLandHex)) return portal;
    return path.length > 1 ? path : [];
}
function wodHexPathLength(path) {
    return path && path.length > 1 ? path.length : 0;
}
function wodPathWorldLength(path) {
    if(!path || path.length < 2) return 0;
    let d = 0;
    for(let i = 1; i < path.length; i++) {
        let dx = path[i].x - path[i - 1].x;
        let dy = path[i].y - path[i - 1].y;
        d += Math.sqrt(dx * dx + dy * dy);
    }
    return d;
}
function wodHexKeysEqual(a, b) {
    return !!(a && b && getHexKey(a) === getHexKey(b));
}
function wodPathCrossesBridge(path) {
    if(!path) return false;
    for(let i = 0; i < path.length; i++) {
        if(isBridgeHex(path[i])) return true;
    }
    return false;
}
function wodPathReachesTarget(path, targetHex) {
    if(!path || !path.length || !targetHex) return false;
    let last = path[path.length - 1];
    if(wodHexKeysEqual(last, targetHex)) return true;
    // wodHexStepDistance only classifies a step as straight/diagonal — it is NOT a
    // distance. Using it here accepted any path ending in the target's row/column
    // as "arrived", so units marched half-way and stopped. Require true adjacency.
    let dq = Math.abs(last.q - targetHex.q);
    let dr = Math.abs(last.r - targetHex.r);
    return dq <= 1 && dr <= 1;
}
function wodResolveBridgePathLeg(unit, fromHex, toHex, maxNodes) {
    if(!fromHex || !toHex) return [];
    if(wodHexKeysEqual(fromHex, toHex)) return [fromHex];
    let p = wodLandBfsPath(unit, fromHex, toHex, maxNodes == null ? 12000 : maxNodes);
    if(p.length > 1) return p;
    let g = buildGreedyLandHexChain(unit, fromHex, toHex, 520);
    return g.length > 1 ? g : [];
}
function wodExitLandCandidates(br, deck, deckExit, targetHex) {
    let out = [];
    let seen = new Set();
    function add(h) {
        if(!h || isWaterHex(h) || isBridgeHex(h) || h.type === 'mountain') return;
        let k = getHexKey(h);
        if(seen.has(k)) return;
        seen.add(k);
        out.push(h);
    }
    if(targetHex && !isBridgeHex(targetHex) && !isWaterHex(targetHex)) add(targetHex);
    if(br && targetHex) {
        let signT = wodBridgeHexBankSign(br, targetHex);
        let banks = wodBridgeBankLandHexes(br, signT);
        for(let i = 0; i < banks.length; i++) add(banks[i]);
        let opp = signT < 0 ? 1 : -1;
        banks = wodBridgeBankLandHexes(br, opp);
        for(let i = 0; i < banks.length; i++) add(banks[i]);
    }
    if(deckExit && gameData._bridgeExitLand) {
        let exits = gameData._bridgeExitLand[getHexKey(deckExit)];
        if(exits) {
            if(exits instanceof Set) exits.forEach((lk) => add(gameData.hexes[lk]));
            else for(let ei = 0; ei < exits.length; ei++) add(gameData.hexes[exits[ei]]);
        }
    }
    if(deck && deck.length) {
        for(let di = 0; di < deck.length; di++) {
            let dh = deck[di];
            if(!dh || !gameData._bridgeExitLand) continue;
            let exits = gameData._bridgeExitLand[getHexKey(dh)];
            if(!exits) continue;
            if(exits instanceof Set) exits.forEach((lk) => add(gameData.hexes[lk]));
            else for(let ei = 0; ei < exits.length; ei++) add(gameData.hexes[exits[ei]]);
        }
    }
    return out;
}
function wodResolveBridgeExitLeg(unit, br, deck, deckExit, targetHex, preferredExit) {
    if(!targetHex) return [];
    let starts = [];
    if(preferredExit && !isBridgeHex(preferredExit) && !isWaterHex(preferredExit)) starts.push(preferredExit);
    starts.push(...wodExitLandCandidates(br, deck, deckExit, targetHex));
    let best = [],
        bestLen = Infinity;
    for(let si = 0; si < starts.length; si++) {
        let leg = wodResolveBridgePathLeg(unit, starts[si], targetHex, 26000);
        if(leg.length <= 1 || !wodPathReachesTarget(leg, targetHex)) continue;
        let wlen = wodPathWorldLength(leg);
        if(wlen < bestLen) {
            bestLen = wlen;
            best = leg;
        }
    }
    if(best.length > 1) return best;
    if(deckExit) {
        let portalLeg = wodLandBfsPath(unit, deckExit, targetHex, 14000);
        if(portalLeg.length > 1 && wodPathReachesTarget(portalLeg, targetHex)) return portalLeg;
    }
    return [];
}
/** Fast land-only BFS for bridge approach legs; set usePortals false to test land connectivity without bridges.
 *  Optional outMeta: { incomplete } — true when the search timed out / hit the node cap
 *  without finishing (callers must NOT treat that as "land is disconnected"). */
// A step along a bridge link (wodRebuildBridgeLandLinks joins a deck cell to land cells up to five cells off, so that a
// slanted deck always meets its banks): its real length in cells, and how much of it lies over open water beside the
// bridge. Kept per map revision.
const wodBridgeLinkStepCache = new Map();
let wodBridgeLinkStepCacheVer = -1;
function wodBridgeLinkStep(a, b) {
    const ver = gameData._wodPfVer | 0;
    if(ver !== wodBridgeLinkStepCacheVer || wodBridgeLinkStepCache.size > 40000) { wodBridgeLinkStepCache.clear(); wodBridgeLinkStepCacheVer = ver; }
    const key = getHexKey(a) + '>' + getHexKey(b);
    let v = wodBridgeLinkStepCache.get(key);
    if(v) return v;
    const sp = (gameData.hexRadius || 20) * 1.35, len = Math.hypot(b.x - a.x, b.y - a.y) / sp, n = Math.max(1, Math.ceil(len / .3)), probe = { type: 'light' };
    let wet = 0, off = 0;
    for(let i = 1; i < n; i++) {
        const x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n, h = getNearestHexToPoint(x, y);
        const deck = !!h && isBridgeHex(h) || wodPointOnBridgeForUnit(probe, x, y, 1.05);
        if(!deck) { off++; if(h && isWaterHex(h)) wet++; }
    }
    v = { len, wet: wet * len / n, off: off * len / n };
    wodBridgeLinkStepCache.set(key, v);
    return v;
}
// The extra price of a bridge-link step that crosses open water: a link meant to join a deck to its bank also joined it
// to any land within five cells, so a route could jump from one bridge's end over the water to another bridge's end.
const WOD_BRIDGE_LINK_WET_COST = 10;
/** Shortest dry way between two cells, by distance walked (diagonal steps are longer, and a bridge link costs its real
 *  length plus WOD_BRIDGE_LINK_WET_COST per cell of open water under it). Until 2026-11-22 this counted steps: a link to a
 *  deck five cells off counted as one step, so with two bridges near each other the route went over to the other
 *  bridge's end and back ("why does my unit go to the other bridge"). */
function wodLandBfsPath(unit, fromHex, toHex, maxNodes, usePortals, outMeta) {
    if(outMeta) outMeta.incomplete = false;
    if(!fromHex || !toHex) return [];
    if(wodHexKeysEqual(fromHex, toHex)) return [fromHex];
    if(usePortals === undefined) usePortals = true;
    let limit = maxNodes == null ? 9000 : maxNodes;
    // Wall-clock cap: a node-count limit alone let this BFS run 300ms+ mid-frame on big
    // maps once the AI got busy. Treat timeout like node exhaustion (callers fall back).
    let bfsT0 = performance.now();
    let bfsRelaxed = unit && unit._wodPfRelaxUntil && performance.now() < unit._wodPfRelaxUntil;
    let bfsCeil = unit && unit._wodPfDeepUntil > 0 ? 150 : bfsRelaxed ? 22 : (gameState === 'PLAYING' && !gameData.menuAttractMode ? 7 : 26);
    let sk = getHexKey(fromHex);
    let parent = Object.create(null);
    let depth = Object.create(null);
    let cost = Object.create(null);
    parent[sk] = null;
    depth[sk] = 0;
    cost[sk] = 0;
    let closed = new Set();
    // binary heap of [cost, hex]
    const heap = [[0, fromHex]];
    const push = (g, h) => { const e = [g, h]; let i = heap.length; heap.push(e); while(i) { const p = (i - 1) >> 1; if(heap[p][0] <= g) break; heap[i] = heap[p]; i = p; } heap[i] = e; };
    const pop = () => { const top = heap[0], last = heap.pop(); if(heap.length) { let i = 0; for(;;) { let c = i * 2 + 1; if(c >= heap.length) break; if(c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++; if(heap[c][0] >= last[0]) break; heap[i] = heap[c]; i = c; } heap[i] = last; } return top; };
    let nodes = 0;
    function rebuildPath(endKey) {
        let path = [];
        let cur = endKey;
        while(cur != null) {
            path.unshift(gameData.hexes[cur]);
            cur = parent[cur];
        }
        return path;
    }
    while(heap.length && nodes < limit) {
        const [g, hex] = pop();
        let hk = getHexKey(hex);
        if(closed.has(hk) || g > cost[hk]) continue;
        closed.add(hk);
        nodes++;
        if((nodes & 255) === 0 && performance.now() - bfsT0 > bfsCeil) {
            if(outMeta) outMeta.incomplete = true;
            return [];
        }
        if(wodHexKeysEqual(hex, toHex)) return rebuildPath(hk);
        if(depth[hk] >= 420) continue;
        function tryStep(nHex, portal) {
            if(!nHex) return;
            let nk = getHexKey(nHex);
            if(closed.has(nk)) return;
            if(!wodPathTileWalkable(unit, nHex, false)) return;
            let step;
            if(portal) {
                if(isWaterHex(nHex) && !isBridgeHex(nHex)) return;
                const link = wodBridgeLinkStep(hex, nHex);
                step = link.len + link.wet * WOD_BRIDGE_LINK_WET_COST;
            } else {
                if(!wodCanStepBetweenHexes(unit, hex, nHex, true)) return;
                step = wodHexStepDistance(hex, nHex);
            }
            const ng = g + step;
            if(cost[nk] !== undefined && ng >= cost[nk]) return;
            cost[nk] = ng;
            parent[nk] = hk;
            depth[nk] = depth[hk] + 1;
            push(ng, nHex);
        }
        for(let di = 0; di < hexDirections.length; di++) {
            let d = hexDirections[di];
            tryStep(wodHexAt(hex.q + d.q,hex.r + d.r), false);
        }
        if(usePortals)
            wodForEachBridgePathPortal(unit, hex, (nHex) => tryStep(nHex, true));
    }
    // Node cap hit with unexplored frontier ⇒ incomplete; empty queue ⇒ true miss.
    if(outMeta && heap.length) outMeta.incomplete = true;
    else if(outMeta && nodes >= limit) outMeta.incomplete = true;
    return [];
}
function wodMarchBlockedWithoutBridge(unit, startHex, targetHex) {
    if(!startHex || !targetHex) return true;
    // Same tile (or already there) is reachable without a bridge.
    if(wodHexKeysEqual(startHex, targetHex)) return false;
    if(isLandArmyUnit(unit)&&!isWaterHex(startHex)&&!isWaterHex(targetHex)) {
        // Share an incremental dry-land connectivity proof. Restarting
        // a timed-out flood on every AI retry could leave a regiment
        // unable to prove either a detour or a necessary crossing.
        const version=gameData._wodPfVer||0;
        const connectivityKey=wodCanClimb(unit)?'_wodClimbingConnectivity':'_wodDryLandConnectivity';
        let cache=gameData[connectivityKey];
        if(!cache||cache.hexes!==gameData.hexes||cache.version!==version)
            cache=gameData[connectivityKey]={hexes:gameData.hexes,version,labels:new Map(),complete:new Set(),next:1,work:null};
        const sk=getHexKey(startHex),tk=getHexKey(targetHex);
        const known=()=>{
            const a=cache.labels.get(sk),b=cache.labels.get(tk);
            if(a&&b)return a!==b;
            if(a&&cache.complete.has(a)||b&&cache.complete.has(b))return true;
            return null;
        };
        let result=known();if(result!==null)return result;
        if(!cache.work) {
            const id=cache.next++;cache.labels.set(sk,id);
            cache.work={id,queue:[startHex],head:0};
        }
        const work=cache.work,deadline=performance.now()+4;let visited=0;
        while(work.head<work.queue.length&&visited++<2048) {
            if((visited&127)===0&&performance.now()>deadline)break;
            const h=work.queue[work.head++];
            // Every legal diagonal has dry side cells, so cardinal
            // connectivity proves the same land reach without corner cuts.
            for(const d of cardinalHexDirections) {
                const key=`${h.q+d.q},${h.r+d.r}`,n=gameData.hexes[key];
                if(!n||cache.labels.has(key)||n.type==='mountain'&&!wodCanClimb(unit)||isWaterHex(n)&&!isBridgeHex(n))continue;
                cache.labels.set(key,work.id);work.queue.push(n);
            }
        }
        if(work.head===work.queue.length){cache.complete.add(work.id);cache.work=null;}
        return known()===true;
    }
    let meta = {};
    let path = wodLandBfsPath(unit, startHex, targetHex, 8000, false, meta);
    if(path.length > 1) return false;
    // Budget timeout used to look like "no land route" and shove armies into the ocean.
    if(meta.incomplete) return false;
    return true;
}
function wodPickBridgeDeckEnds(deck, startHex, targetHex, br) {
    if(!deck || !deck.length || !startHex || !targetHex) return null;
    if(deck.length === 1) return { enter: deck[0], exit: deck[0], iA: 0, iB: 0 };
    function nearestHex(list, ref) {
        let best = null,
            bestD = Infinity;
        for(let hi = 0; hi < list.length; hi++) {
            let h = list[hi];
            let dx = h.x - ref.x,
                dy = h.y - ref.y;
            let d = dx * dx + dy * dy;
            if(d < bestD) {
                bestD = d;
                best = h;
            }
        }
        return best;
    }
    let capA = deck[0],
        capB = deck[deck.length - 1];
    let dA0 = (capA.x - startHex.x) ** 2 + (capA.y - startHex.y) ** 2;
    let dB0 = (capB.x - startHex.x) ** 2 + (capB.y - startHex.y) ** 2;
    let enter = dA0 <= dB0 ? capA : capB;
    let exit = dA0 <= dB0 ? capB : capA;
    if(br) {
        let signS = wodBridgeHexBankSign(br, startHex);
        let signT = wodBridgeHexBankSign(br, targetHex);
        let perpS = wodBridgeHexPerpSign(br, startHex);
        let perpT = wodBridgeHexPerpSign(br, targetHex);
        let crossDeck = (signS && signT && signS !== signT) || (perpS && perpT && perpS !== perpT);
        if(crossDeck) {
            let enterLand = nearestHex(wodBridgeBankLandHexes(br, signS), startHex) ||
                nearestHex(wodBridgePerpBankLandHexes(br, perpS), startHex);
            let exitLand = nearestHex(wodBridgeBankLandHexes(br, signT), targetHex) ||
                nearestHex(wodBridgePerpBankLandHexes(br, perpT), targetHex);
            if(enterLand && exitLand) {
                enter = enterLand;
                exit = exitLand;
            } else {
                let negEnd = wodBridgeDeckHexNearCap(br, deck, -1);
                let posEnd = wodBridgeDeckHexNearCap(br, deck, 1);
                if(negEnd && posEnd) {
                    if(signS !== signT) {
                        enter = signS < 0 ? negEnd : posEnd;
                        exit = signT < 0 ? negEnd : posEnd;
                    } else {
                        enter = perpS < 0 ? negEnd : posEnd;
                        exit = perpT < 0 ? negEnd : posEnd;
                    }
                }
            }
        }
    }
    let iA = 0,
        iB = deck.length - 1;
    for(let i = 0; i < deck.length; i++) {
        if(wodHexKeysEqual(deck[i], enter)) iA = i;
        if(wodHexKeysEqual(deck[i], exit)) iB = i;
    }
    if(wodHexKeysEqual(enter, exit)) {
        exit = deck[dA0 <= dB0 ? deck.length - 1 : 0];
        iB = dA0 <= dB0 ? deck.length - 1 : 0;
    }
    return { enter, exit, iA, iB };
}
function wodComposeBridgeCrossingPath(unit, startHex, targetHex, deck, enterRef, exitRef, brOpt) {
    if(!deck || !deck.length || !enterRef || !exitRef || !startHex || !targetHex) return null;
    let br = brOpt || (isBridgeHex(deck[0]) ? bridgeAtHex(deck[0]) : null);
    let deckEntry = isBridgeHex(enterRef) ? enterRef : wodNearestHexOnBridgeDeck(deck, enterRef);
    let deckExit = isBridgeHex(exitRef) ? exitRef : wodNearestHexOnBridgeDeck(deck, exitRef);
    let legA = wodResolveBridgePathLeg(unit, startHex, enterRef, 22000);
    if(legA.length <= 1 && !wodHexKeysEqual(startHex, enterRef) && !isBridgeHex(startHex)) {
        let deckTry = isBridgeHex(enterRef) ? enterRef : deckEntry;
        if(deckTry && !wodHexKeysEqual(startHex, deckTry)) {
            let viaDeck = wodResolveBridgePathLeg(unit, startHex, deckTry, 26000);
            if(viaDeck.length > 1) legA = viaDeck;
        }
    }
    if(legA.length <= 1 && !wodHexKeysEqual(startHex, enterRef) && !isBridgeHex(startHex) &&
        !wodStartCanReachBridgeDeck(startHex, deckEntry, enterRef))
        return null;
    if(legA.length <= 1 && (wodHexKeysEqual(startHex, enterRef) || isBridgeHex(startHex) ||
        wodStartCanReachBridgeDeck(startHex, deckEntry, enterRef)))
        legA = [startHex];
    if(legA.length === 1 && deckEntry && !isBridgeHex(legA[0]) &&
        !wodHexKeysEqual(legA[0], deckEntry) &&
        wodBridgePortalLinked(legA[0], deckEntry))
        legA.push(deckEntry);

    let deckSlice = wodSliceBridgeDeckBetween(deck, deckEntry, deckExit);
    if(!deckSlice.length) return null;

    let legB = [];
    if(wodHexKeysEqual(targetHex, exitRef) && !isBridgeHex(exitRef))
        legB = [targetHex];
    else
        legB = wodResolveBridgeExitLeg(unit, br, deck, deckExit, targetHex, isBridgeHex(exitRef) ? null : exitRef);
    if(legB.length <= 1 && !isBridgeHex(exitRef))
        legB = wodResolveBridgePathLeg(unit, exitRef, targetHex, 26000);
    if(legB.length <= 1 && wodHexKeysEqual(targetHex, exitRef)) legB = [targetHex];

    let merged = legA.slice();
    if(merged.length && deckSlice.length && !isBridgeHex(merged[merged.length - 1])) {
        let lastA = merged[merged.length - 1];
        let firstD = deckSlice[0];
        if(!wodHexKeysEqual(lastA, firstD) && !wodBridgePortalLinked(lastA, firstD) &&
            !wodCanStepBetweenHexes(unit, lastA, firstD, true) && deckEntry &&
            !wodHexKeysEqual(lastA, deckEntry) &&
            (wodBridgePortalLinked(lastA, deckEntry) || wodCanStepBetweenHexes(unit, lastA, deckEntry, true)))
            merged.push(deckEntry);
    }
    if(merged.length && wodHexKeysEqual(merged[merged.length - 1], deckSlice[0])) merged.pop();
    merged.push(...deckSlice);
    if(legB.length) {
        if(merged.length && isBridgeHex(merged[merged.length - 1]) && !isBridgeHex(legB[0]) &&
            !wodBridgePortalLinked(merged[merged.length - 1], legB[0]) &&
            !wodCanStepBetweenHexes(unit, merged[merged.length - 1], legB[0], true) && deckExit &&
            !wodHexKeysEqual(deckExit, legB[0]) &&
            (wodBridgePortalLinked(merged[merged.length - 1], deckExit) ||
                wodCanStepBetweenHexes(unit, merged[merged.length - 1], deckExit, true)) &&
            wodBridgePortalLinked(deckExit, legB[0]))
            merged.push(deckExit);
        if(merged.length && wodHexKeysEqual(merged[merged.length - 1], legB[0])) legB = legB.slice(1);
        merged.push(...legB);
    }
    merged = smoothGridPath(merged);
    if(merged.length <= 1 || !wodPathCrossesBridge(merged) || !wodPathReachesTarget(merged, targetHex)) return null;
    return merged;
}
function wodForceBridgeCrossingPath(unit, startHex, targetHex, br, deck) {
    let endsPick = wodPickBridgeDeckEnds(deck, startHex, targetHex, br);
    if(!endsPick) return null;
    let merged = wodComposeBridgeCrossingPath(unit, startHex, targetHex, deck, endsPick.enter, endsPick.exit, br);
    if(merged && merged.length > 1) return merged;

    let deckEntry = wodNearestHexOnBridgeDeck(deck, endsPick.enter);
    let deckExit = wodNearestHexOnBridgeDeck(deck, endsPick.exit);
    let deckSlice = wodSliceBridgeDeckBetween(deck, deckEntry, deckExit);
    if(!deckSlice.length) return null;

    let legA = wodResolveBridgePathLeg(unit, startHex, endsPick.enter, 26000);
    if(legA.length <= 1 && !wodHexKeysEqual(startHex, endsPick.enter) && !isBridgeHex(startHex) &&
        !wodStartCanReachBridgeDeck(startHex, deckEntry, endsPick.enter))
        return null;
    if(legA.length <= 1) legA = [startHex];
    if(legA.length === 1 && deckEntry && !isBridgeHex(legA[0]) &&
        !wodHexKeysEqual(legA[0], deckEntry) &&
        wodBridgePortalLinked(legA[0], deckEntry))
        legA.push(deckEntry);

    let legB = wodResolveBridgeExitLeg(unit, br, deck, deckExit, targetHex, isBridgeHex(endsPick.exit) ? null : endsPick.exit);
    if(legB.length <= 1)
        legB = wodResolveBridgePathLeg(unit, endsPick.exit, targetHex, 26000);
    if(legB.length <= 1 && wodHexKeysEqual(targetHex, endsPick.exit)) legB = [targetHex];
    if(legB.length <= 1 && !wodHexKeysEqual(targetHex, deckExit)) return null;

    merged = legA.slice();
    if(merged.length && deckSlice.length && !isBridgeHex(merged[merged.length - 1])) {
        let lastA = merged[merged.length - 1];
        let firstD = deckSlice[0];
        if(!wodHexKeysEqual(lastA, firstD) && !wodBridgePortalLinked(lastA, firstD) &&
            !wodCanStepBetweenHexes(unit, lastA, firstD, true) && deckEntry &&
            !wodHexKeysEqual(lastA, deckEntry) &&
            (wodBridgePortalLinked(lastA, deckEntry) || wodCanStepBetweenHexes(unit, lastA, deckEntry, true)))
            merged.push(deckEntry);
    }
    if(merged.length && wodHexKeysEqual(merged[merged.length - 1], deckSlice[0])) merged.pop();
    merged.push(...deckSlice);
    if(legB.length) {
        if(merged.length && wodHexKeysEqual(merged[merged.length - 1], legB[0])) legB = legB.slice(1);
        merged.push(...legB);
    }
    merged = smoothGridPath(merged);
    if(merged.length <= 1 || !wodPathCrossesBridge(merged) || !wodPathReachesTarget(merged, targetHex)) return null;
    return merged;
}
function wodBridgePathBeatsLandPath(bridgePath, landPath, blocked) {
    if(!bridgePath || wodHexPathLength(bridgePath) <= 1) return false;
    if(!landPath || wodHexPathLength(landPath) <= 1) return true;
    // A blocked straight line is not proof that a bridge is necessary:
    // a short dry route can go around the obstruction on the same bank.
    return wodPathWorldLength(bridgePath) < wodPathWorldLength(landPath) * 0.95;
}
function wodNearestHexInList(list, refHex) {
    if(!list || !list.length || !refHex) return null;
    let best = null,
        bestD = Infinity;
    for(let i = 0; i < list.length; i++) {
        let h = list[i];
        let dx = h.x - refHex.x,
            dy = h.y - refHex.y;
        let d = dx * dx + dy * dy;
        if(d < bestD) {
            bestD = d;
            best = h;
        }
    }
    return best;
}
function wodTryOpposingBankBridgePath(unit, startHex, targetHex, br, deck) {
    if(!wodBridgeMarchCrossesDeck(br, startHex, targetHex)) return null;
    let signS = wodBridgeHexBankSign(br, startHex);
    let signT = wodBridgeHexBankSign(br, targetHex);
    let enter = wodNearestHexInList(wodBridgeBankLandHexes(br, signS), startHex) ||
        wodBridgeDeckHexNearCap(br, deck, signS);
    let exit = wodNearestHexInList(wodBridgeBankLandHexes(br, signT), targetHex) ||
        wodBridgeDeckHexNearCap(br, deck, signT);
    if(!enter || !exit) {
        let perpS = wodBridgeHexPerpSign(br, startHex);
        let perpT = wodBridgeHexPerpSign(br, targetHex);
        enter = enter || wodNearestHexInList(wodBridgePerpBankLandHexes(br, perpS), startHex) ||
            wodNearestHexOnBridgeDeck(deck, startHex);
        exit = exit || wodNearestHexInList(wodBridgePerpBankLandHexes(br, perpT), targetHex) ||
            wodNearestHexOnBridgeDeck(deck, targetHex);
    }
    if(!enter || !exit) return null;
    return wodComposeBridgeCrossingPath(unit, startHex, targetHex, deck, enter, exit, br);
}
/** Reliable land → full deck → land path using portal BFS legs. */
function wodBuildDeckCrossingPath(unit, startHex, targetHex, br, deck) {
    if(!br || !deck || !deck.length || !startHex || !targetHex) return [];
    wodSyncBridgeWorldCoords(br);
    let bfsCap = 12000;
    if(isBridgeHex(targetHex) || wodPointInBridgeRect(targetHex.x, targetHex.y, br, 1.42)) {
        let goal = isBridgeHex(targetHex) ? targetHex : wodNearestHexOnBridgeDeck(deck, targetHex);
        if(goal) {
            let onto = wodLandBfsPath(unit, startHex, goal, bfsCap, true);
            if(onto.length > 1 && wodPathReachesTarget(onto, targetHex)) return smoothGridPath(onto);
        }
    }
    let signS = wodBridgeHexBankSign(br, startHex);
    let signT = wodBridgeHexBankSign(br, targetHex);
    let entry = wodBridgeDeckHexNearCap(br, deck, signS || -1);
    let exit = wodBridgeDeckHexNearCap(br, deck, signT || 1);
    if(signS && signT && signS === signT) {
        entry = wodNearestHexOnBridgeDeck(deck, startHex);
        exit = wodNearestHexOnBridgeDeck(deck, targetHex);
    }
    if(!entry || !exit) return [];
    let legA = wodLandBfsPath(unit, startHex, entry, bfsCap, true);
    if(legA.length <= 1 && !wodHexKeysEqual(startHex, entry)) {
        if(isBridgeHex(startHex) || wodBridgePortalLinked(startHex, entry)) legA = [startHex];
        else return [];
    }
    let legB = wodLandBfsPath(unit, exit, targetHex, bfsCap, true);
    if(legB.length <= 1 && !wodHexKeysEqual(exit, targetHex)) {
        legB = wodLandBfsPath(unit, exit, targetHex, bfsCap, false);
    }
    if(legB.length <= 1 && !wodHexKeysEqual(targetHex, exit) && !wodPathReachesTarget([exit], targetHex)) return [];
    let deckSlice = wodSliceBridgeDeckBetween(deck, entry, exit);
    if(!deckSlice.length) deckSlice = deck.slice();
    let merged = wodMergeHexPaths(legA, deckSlice);
    if(legB.length) merged = wodMergeHexPaths(merged, legB);
    merged = smoothGridPath(merged);
    if(merged.length <= 1 || !wodPathCrossesBridge(merged) || !wodPathReachesTarget(merged, targetHex)) return [];
    return merged;
}
/** Compose start → shore/deck → bridge deck → shore/deck → goal for each constructed bridge. */
function wodFindBestBridgePath(unit, startHex, targetHex) {
    if(!startHex || !targetHex || !gameData.bridges || !gameData.bridges.length) return [];
    wodEnsureBridgePathIndex();
    // Deadline: each `consider` composes multiple land A*/BFS legs. With several AI-built
    // bridges on the map this stacked into multi-hundred-ms (worst 1.8s) frame stalls.
    let bridgeT0 = performance.now();
    // Bridge compose stacks several land A*/BFS legs. Humans get 22ms; AI used to
    // get only 8ms and timed out into shore greedy/water hops. Give AI enough time
    // to finish a deck crossing without matching the full human order budget.
    let human = wodMpIsHumanOwner(unit.owner);
    const BRIDGE_SEARCH_MS = human ? 22 : 16;
    let best = [],
        bestLen = Infinity;
    function overDeadline() {
        return performance.now() - bridgeT0 > BRIDGE_SEARCH_MS;
    }
    function consider(merged) {
        if(!merged || merged.length <= 1) return;
        if(!wodPathCrossesBridge(merged)) return;
        if(!wodPathReachesTarget(merged, targetHex)) return;
        let wlen = wodPathWorldLength(merged);
        if(wlen < bestLen) {
            bestLen = wlen;
            best = merged;
        }
    }
    for(let bi = 0; bi < gameData.bridges.length; bi++) {
        if(best.length > 1 && overDeadline()) break;
        if(overDeadline()) break;
        let br = gameData.bridges[bi];
        if(!br) continue;
        if(!wodBridgeRelevantToMarch(br, startHex, targetHex)) continue;
        let deck = wodGetOrderedBridgeDeck(br);
        if(!deck.length) continue;

        consider(wodBuildDeckCrossingPath(unit, startHex, targetHex, br, deck));
        if(overDeadline()) continue;
        consider(wodTryOpposingBankBridgePath(unit, startHex, targetHex, br, deck));
        if(overDeadline()) continue;
        consider(wodForceBridgeCrossingPath(unit, startHex, targetHex, br, deck));
        if(overDeadline()) continue;

        let endsPick = wodPickBridgeDeckEnds(deck, startHex, targetHex, br);
        if(endsPick)
            consider(wodComposeBridgeCrossingPath(unit, startHex, targetHex, deck, endsPick.enter, endsPick.exit, br));

        let negShores = wodBridgeBankLandHexes(br, -1);
        let posShores = wodBridgeBankLandHexes(br, 1);
        if(negShores.length || posShores.length) {
            function nearestShore(list, refHex) {
                let best = null,
                    bestD = Infinity;
                for(let si = 0; si < list.length; si++) {
                    let sh = list[si];
                    let dx = refHex.x - sh.x,
                        dy = refHex.y - sh.y;
                    let d = dx * dx + dy * dy;
                    if(d < bestD) {
                        bestD = d;
                        best = sh;
                    }
                }
                return best;
            }
            let entryNeg = nearestShore(negShores, startHex);
            let entryPos = nearestShore(posShores, startHex);
            let entry = null;
            if(entryNeg && entryPos) {
                let dN = (startHex.x - entryNeg.x) ** 2 + (startHex.y - entryNeg.y) ** 2;
                let dP = (startHex.x - entryPos.x) ** 2 + (startHex.y - entryPos.y) ** 2;
                entry = dN <= dP ? entryNeg : entryPos;
            } else entry = entryNeg || entryPos;
            let entrySign = entry ? wodBridgeHexBankSign(br, entry) : 0;
            let exitBank = entrySign < 0 ? posShores : negShores;
            let exit = nearestShore(exitBank, targetHex);
            if(entry && exit)
                consider(wodComposeBridgeCrossingPath(unit, startHex, targetHex, deck, entry, exit, br));
        }
    }
    return best;
}
/** Last-resort bridge routing when composed paths fail but portals exist. */
function wodTryPortalBridgeMarchPath(unit, startHex, targetHex) {
    if(!unit || !startHex || !targetHex || !wodUnitUsesLandBridges(unit)) return [];
    // Same hex / same-shore land marches must NOT detour onto a nearby bridge and back —
    // that broke land formations drawn beside rivers.
    if(wodHexKeysEqual(startHex, targetHex)) return [];
    let landBlocked = wodMarchBlockedWithoutBridge(unit, startHex, targetHex);
    if(!landBlocked) return [];
    wodEnsureBridgePathIndex();
    let bridgePath = wodFindBestBridgePath(unit, startHex, targetHex);
    if(bridgePath.length > 1 && wodPathReachesTarget(bridgePath, targetHex) &&
        wodPathCrossesBridge(bridgePath))
        return bridgePath;
    let portalPath = smoothGridPath(wodLandBfsPath(unit, startHex, targetHex, 14000, true));
    if(portalPath.length > 1 && wodPathReachesTarget(portalPath, targetHex) && wodPathCrossesBridge(portalPath))
        return portalPath;
    return [];
}
function wodEstimateAmphibiousShortcutSteps(unit, startHex, targetHex, looseEstimate) {
    if(!startHex || !targetHex) return Infinity;
    let sp = (gameData.hexRadius || 20) * 1.35;
    // Greedy chains stall on concave coastlines. When the caller has NO land route
    // (looseEstimate), fall back to a straight-line estimate — the real path build
    // validates reachability with a BFS afterwards. When a land route exists, stay
    // strict: only a clean greedy chain justifies trading it for a water shortcut.
    function waterSteps(a, b, cap) {
        let chain = buildGreedyAmphibiousWaterChain(unit, a, b, cap);
        if(chain.length > 1 && wodHexKeysEqual(chain[chain.length - 1], b)) return chain.length;
        if(!looseEstimate) return Infinity;
        let dx = b.x - a.x, dy = b.y - a.y;
        return Math.max(2, Math.ceil(Math.sqrt(dx * dx + dy * dy) / sp));
    }
    if(wodIsOpenWaterHex(startHex) && wodIsOpenWaterHex(targetHex))
        return waterSteps(startHex, targetHex, 64);
    let shoreA = wodNearestOpenWaterHex(unit, startHex, targetHex, 7);
    let shoreB = wodNearestOpenWaterHex(unit, targetHex, startHex, 7);
    if(!shoreA || !shoreB) return Infinity;
    let landA = getHexKey(shoreA) === getHexKey(startHex) ? 0 : 2;
    let landB = getHexKey(shoreB) === getHexKey(targetHex) ? 0 : 2;
    let water = waterSteps(shoreA, shoreB, 56);
    return landA + water + landB;
}
function wodShouldUseWaterMarch(unit, startHex, targetHex, landPath, bridgePath) {
    if(!wodMpIsHumanOwner(unit.owner)&&!isWaterHex(startHex)&&unit.type!=='marine'&&!wodIsNavalUnit(unit))return false;
    if(!wodUnitPrefersLandOnlyPath(unit)) return false;
    // Already afloat → land: always use amphibious compose.
    if(wodIsOpenWaterHex(startHex) && targetHex && !wodIsOpenWaterHex(targetHex)) return true;
    if(unit._wodArrowPathBuild && !wodOrderIntoWater(unit, targetHex) && !wodIsOpenWaterHex(startHex)) return false;
    if(wodOrderIntoWater(unit, targetHex)) return true;
    if(wodHexPathLength(bridgePath) > 1) return false;
    let bestLand = wodPathWorldLength(landPath)/Math.max(1,gameData.hexRadius*1.35);
    if(bestLand <= 1) {
        // Only embark when land is proven disconnected (complete BFS miss) — never on
        // a timed-out land search that merely looks empty.
        if(!wodMarchBlockedWithoutBridge(unit, startHex, targetHex)) return false;
        let est = wodEstimateAmphibiousShortcutSteps(unit, startHex, targetHex, true);
        return isFinite(est) && est >= 2;
    }
    let est = wodEstimateAmphibiousShortcutSteps(unit, startHex, targetHex);
    if(!isFinite(est) || est < 2) return false;
    // Unprotected crossings must save a very large detour. Use real
    // distance, not the number of waypoints left after path smoothing.
    return bestLand>=24 && est<=bestLand*(wodMpIsHumanOwner(unit.owner)?0.25:0.20);
}
function wodBridgeUsefulForMarch(unit, startHex, targetHex) {
    if(!startHex || !targetHex || !gameData.bridges || !gameData.bridges.length) return false;
    let hr = gameData.hexRadius || 20;
    let reach = (hr * 14) * (hr * 14);
    for(let bi = 0; bi < gameData.bridges.length; bi++) {
        let br = gameData.bridges[bi];
        if(!br) continue;
        wodSyncBridgeWorldCoords(br);
        let nearA = wodDistToBridgeRect(startHex.x, startHex.y, br) <= hr * 5.5;
        let nearB = wodDistToBridgeRect(targetHex.x, targetHex.y, br) <= hr * 5.5;
        if(!nearA && !nearB) {
            let dx = startHex.x - br.x,
                dy = startHex.y - br.y;
            let d1 = dx * dx + dy * dy;
            dx = targetHex.x - br.x;
            dy = targetHex.y - br.y;
            let d2 = dx * dx + dy * dy;
            if(d1 > reach && d2 > reach) continue;
        }
        let deck = wodGetOrderedBridgeDeck(br);
        if(deck.length) return true;
    }
    return false;
}
function wodBridgeRelevantToMarch(br, startHex, targetHex) {
    if(!br || !startHex || !targetHex) return false;
    wodSyncBridgeWorldCoords(br);
    let hr = gameData.hexRadius || 20;
    let pad = hr * 7.5;
    if(wodDistToBridgeRect(startHex.x, startHex.y, br) <= pad) return true;
    if(wodDistToBridgeRect(targetHex.x, targetHex.y, br) <= pad) return true;
    let midX = (startHex.x + targetHex.x) * 0.5;
    let midY = (startHex.y + targetHex.y) * 0.5;
    return wodDistToBridgeRect(midX, midY, br) <= pad * 1.35;
}
function wodTryAmphibiousMarchFallback(unit, startHex, targetHex) {
    if(!wodMpIsHumanOwner(unit.owner)&&!isWaterHex(startHex)&&unit.type!=='marine'&&!wodIsNavalUnit(unit))return [];
    if(!wodUnitPrefersLandOnlyPath(unit) || !startHex || !targetHex) return [];
    if(unit._wodArrowPathBuild && !wodOrderIntoWater(unit, targetHex) && !wodIsOpenWaterHex(startHex)) return [];
    if(!wodOrderIntoWater(unit, targetHex) && !wodIsOpenWaterHex(startHex) &&
        !wodMarchBlockedWithoutBridge(unit, startHex, targetHex)) return [];
    let waterPath = findAmphibiousMarchPath(unit, startHex, targetHex);
    return wodHexPathLength(waterPath) > 1 ? waterPath : [];
}
function wodPathCrossesOpenWater(path) {
    if(!path || !path.length) return false;
    for(let i = 0; i < path.length; i++) {
        let h = path[i];
        if(h && wodIsOpenWaterHex(h)) return true;
    }
    return false;
}
function wodPickLandArmyMarchPath(unit, startHex, targetHex, allowOverBudget) {
    if(!startHex || !targetHex) return [];
    if(wodHexKeysEqual(startHex, targetHex)) return [startHex];
    if(wodOrderIntoWater(unit, targetHex) && wodIsOpenWaterHex(targetHex))
        return findAmphibiousMarchPath(unit, startHex, targetHex);
    // Water→land: unit is already afloat; compose amphibious path to shore.
    if(wodIsOpenWaterHex(startHex) && !wodIsOpenWaterHex(targetHex))
        return findAmphibiousMarchPath(unit, startHex, targetHex);
    wodEnsureBridgePathIndex();

    let marchT0 = performance.now();
    let landPath = findPathAroundTerrain(unit, targetHex, startHex, true, 'land', allowOverBudget);
    let landOk = wodHexPathLength(landPath) > 1 && wodPathReachesTarget(landPath, targetHex);
    let landUsesBridge = landOk && wodPathCrossesBridge(landPath);
    if(landUsesBridge) return landPath;

    // A good-enough land path found and time budget spent: return it rather than
    // stacking bridge/amphibious refinement searches in the same frame (the
    // composition reached 35ms per call and stuttered marching columns).
    if(landOk && (performance.now() - marchT0 > 5 || (!allowOverBudget && !wodCanSpendPf()))) return landPath;

    // Human orders: a truncated A* can miss narrow passes through long mountain
    // walls even though the map is land-connected. A capped BFS is cheap (~7ms)
    // and complete — rescue the order before falling into bridge/amphibious code.
    if(!landOk && allowOverBudget && wodUnitPrefersLandOnlyPath(unit)) {
        let rescue = smoothGridPath(wodLandBfsPath(unit, startHex, targetHex, 26000, false));
        if(rescue.length > 1 && wodPathReachesTarget(rescue, targetHex)) return rescue;
    }

    // A confirmed land path already proves land connectivity — skip the redundant
    // full-map BFS (it burned ~5ms per march re-path for nothing).
    let blocked = landOk ? false : wodMarchBlockedWithoutBridge(unit, startHex, targetHex);
    if(!blocked && landOk && !wodShouldUseWaterMarch(unit, startHex, targetHex, landPath, [])) return landPath;

    let bridgeNeeded = blocked || wodBridgeUsefulForMarch(unit, startHex, targetHex);
    let bridgePath = bridgeNeeded ? wodFindBestBridgePath(unit, startHex, targetHex) : [];
    let bridgeOk = wodHexPathLength(bridgePath) > 1 && wodPathReachesTarget(bridgePath, targetHex);

    if(bridgeOk) {
        if(!landOk) return bridgePath;
        if(wodBridgePathBeatsLandPath(bridgePath, landPath, blocked)) return bridgePath;
    }

    if(blocked && gameData.bridges && gameData.bridges.length) {
        if(landOk && landUsesBridge) return landPath;
        // Deadline guard: callers fall back to greedy steps on [], and a later
        // re-path retries with fresh budget — better than a 30ms+ frame stall.
        if(performance.now() - marchT0 > 9) return [];
        let portalPath = smoothGridPath(wodLandBfsPath(unit, startHex, targetHex, 14000, true));
        if(portalPath.length > 1 && wodPathReachesTarget(portalPath, targetHex) && wodPathCrossesBridge(portalPath))
            return portalPath;
        let ampBlocked = wodTryAmphibiousMarchFallback(unit, startHex, targetHex);
        if(ampBlocked.length) return ampBlocked;
        return [];
    }

    if(landOk && !wodShouldUseWaterMarch(unit, startHex, targetHex, landPath, bridgePath)) {
        return landPath;
    }
    if(bridgeOk && !landOk) return bridgePath;
    if(wodShouldUseWaterMarch(unit, startHex, targetHex, landPath, bridgePath) && !wodBridgeUsefulForMarch(unit, startHex, targetHex)) {
        let waterPath = findAmphibiousMarchPath(unit, startHex, targetHex);
        if(wodHexPathLength(waterPath)>1&&wodPathReachesTarget(waterPath,targetHex)) {
            const landDistance=wodPathWorldLength(landPath),waterDistance=wodPathWorldLength(waterPath);
            let exposed=0;
            for(let i=1;i<waterPath.length;i++)if(wodIsOpenWaterHex(waterPath[i])||wodIsOpenWaterHex(waterPath[i-1]))
                exposed+=Math.hypot(waterPath[i].x-waterPath[i-1].x,waterPath[i].y-waterPath[i-1].y);
            if(!landOk || waterDistance<=landDistance*0.30 && waterDistance+exposed*7<=landDistance*0.5)return waterPath;
        }
    }
    let ampFallback = wodTryAmphibiousMarchFallback(unit, startHex, targetHex);
    if(ampFallback.length) return ampFallback;
    return landOk ? landPath : [];
}
/** Lightweight water march for explicit ocean orders — never runs full-map land A*. */
function findAmphibiousMarchPath(unit, startHex, targetHex) {
    if(!startHex || !targetHex) return [];
    if(getHexKey(startHex) === getHexKey(targetHex)) return [startHex];
    let cacheKey = (gameData._wodPfVer|0)+'|'+getHexKey(startHex) + '>' + getHexKey(targetHex);
    if(unit._wodAmpPathKey === cacheKey && unit._wodAmpPath && unit._wodAmpPath.length)
        return unit._wodAmpPath.slice();
    // Failure cooldown: without it every blocked-unit replan re-ran the full
    // shore-crossing + BFS compose (~30-50ms worst) several times a second.
    if(unit._wodAmpFailKey === cacheKey && performance.now() < (unit._wodAmpFailUntil || 0) && !(unit._wodPfDeepUntil > 0))
        return [];
    // Deadline across the whole compose: shore searches + land legs + water BFS can
    // stack to 40ms+ in one frame; aborting behaves like a failed pathfind (callers
    // fall back to greedy hops and the fail cooldown stops immediate retries).
    let ampT0 = performance.now();
    let ampRelaxed = unit._wodPfRelaxUntil && performance.now() < unit._wodPfRelaxUntil;
    let ampCeil = unit._wodPfDeepUntil > 0 ? 200 : ampRelaxed ? 26 : (gameState === 'PLAYING' && !gameData.menuAttractMode ? 9 : 30);
    function ampOverBudget() {
        return performance.now() - ampT0 > ampCeil;
    }
    let out = [];
    let startW = wodIsOpenWaterHex(startHex);
    let tgtW = wodIsOpenWaterHex(targetHex);
    // Find the complete shore exit, rather than guessing a nearby shore.
    // The guessed land leg could belong to an intervening island, so its
    // swimmer reached that island and then circled at the next shoreline.
    if(startW&&!tgtW&&isLandArmyUnit(unit)&&wodUnitStandingOnOpenWater(unit)) {
        out=wodFindExplicitWaterRoute(unit,startHex,targetHex,true);
    } else if(startW && tgtW) {
        let chain = wodAmphibiousWaterLeg(unit, startHex, targetHex, 72);
        out = chain.length > 1 ? smoothGridPath(chain) : chain;
    } else if(!startW && tgtW) {
        let crossing = wodFindAmphibiousShoreCrossing(unit, startHex, targetHex, 20);
        if(crossing && !ampOverBudget()) {
            let landLeg = wodFindLandApproachPath(unit, startHex, crossing.landHex);
            let waterLeg = wodAmphibiousWaterLeg(unit, crossing.waterHex, targetHex, 72);
            if(wodHexKeysEqual(crossing.waterHex, targetHex)) waterLeg = [crossing.waterHex];
            out = wodMergeHexPaths(landLeg, waterLeg);
        }
    } else if(startW && !tgtW) {
        let crossing = wodFindAmphibiousShoreCrossing(unit, targetHex, startHex, 20);
        if(crossing && !ampOverBudget()) {
            let waterLeg = wodAmphibiousWaterLeg(unit, startHex, crossing.waterHex, 72);
            let landLeg = wodFindLandApproachPath(unit, crossing.landHex, targetHex);
            out = wodMergeHexPaths(waterLeg, landLeg);
        }
    } else {
        // land -> water -> land: pick the crossing pair, then validate every leg —
        // a partial (stalled) water leg used to send whole columns into the open
        // ocean to drown without ever reaching the far shore.
        let crossA = wodFindAmphibiousShoreCrossing(unit, startHex, targetHex, 24);
        let crossB = crossA && !ampOverBudget()
            ? wodFindAmphibiousShoreCrossing(unit, targetHex, startHex, 24) : null;
        if(crossA && crossB && !ampOverBudget()) {
            let landA = wodFindLandApproachPath(unit, startHex, crossA.landHex);
            let waterLeg = ampOverBudget() ? []
                : wodAmphibiousWaterLeg(unit, crossA.waterHex, crossB.waterHex, 96);
            // Same water hex on both shores (single-point crossing between adjacent
            // bays) is a legal zero-travel water leg.
            let waterOk = wodHexKeysEqual(crossA.waterHex, crossB.waterHex) ||
                (wodHexPathLength(waterLeg) > 1 && wodPathReachesTarget(waterLeg, crossB.waterHex));
            if(waterOk && !ampOverBudget()) {
                let landB = wodFindLandApproachPath(unit, crossB.landHex, targetHex);
                out = wodMergeHexPaths(wodMergeHexPaths(landA, waterLeg), landB);
            }
        }
    }
    if(out.length > 1 && !tgtW && !wodPathReachesTarget(out, targetHex)) {
        // Never hand back a truncated amphibious route to a land objective — callers
        // treat any path as marchable and units end up stranded mid-ocean.
        out = [];
    }
    unit._wodAmpPathKey = cacheKey;
    unit._wodAmpPath = out.length ? out.slice() : [];
    if(!out.length) {
        unit._wodAmpFailKey = cacheKey;
        unit._wodAmpFailUntil = performance.now() + 1600;
    } else {
        unit._wodAmpFailKey = null;
    }
    return out;
}
function wodFindExplicitWaterRoute(unit,start,goal,shoreExit=false) {
    const heap=[],cost=new Map(),prev=new Map(),closed=new Set(),key=getHexKey;
    const push=(h,g)=>{const rec={h,g,f:g+Math.hypot(h.q-goal.q,h.r-goal.r)};let i=heap.length;heap.push(rec);while(i){const p=(i-1)>>1;if(heap[p].f<=rec.f)break;heap[i]=heap[p];i=p;}heap[i]=rec;};
    const pop=()=>{const out=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return out;};
    cost.set(key(start),0);push(start,0);
    while(heap.length) {
        const rec=pop(),h=rec.h,k=key(h);if(closed.has(k))continue;closed.add(k);
        if(h===goal){const path=[h];let cur=h;while(prev.has(key(cur))){cur=prev.get(key(cur));path.push(cur);}return path.reverse();}
        for(const d of hexDirections) {
            const n=wodHexAt(h.q+d.q,h.r+d.r);if(!n||n.type==='mountain'&&!wodCanClimb(unit)||closed.has(key(n))||!wodCanStepBetweenHexes(unit,h,n,false))continue;
            // Rescue takes one continuous water leg followed by land.
            // Boarding/AI safety correctly forbids another water entry
            // after landing; don't plan a route that requires one.
            if(shoreExit&&!isWaterHex(h)&&isWaterHex(n)&&!isBridgeHex(n))continue;
            if(shoreExit&&isWaterHex(h)&&isWaterHex(n)&&d.q&&d.r&&
                (!isWaterHex(wodHexAt(h.q+d.q,h.r))||!isWaterHex(wodHexAt(h.q,h.r+d.r))))continue;
            const wet=isWaterHex(n)&&!isBridgeHex(n),terrain=n.type==='swamp'?1.7:n.type==='forest'||n.type==='hill'?1.3:1;
            const g=rec.g+Math.hypot(d.q,d.r)*(wet?18:terrain);
            if(g>=(cost.get(key(n))??Infinity))continue;cost.set(key(n),g);prev.set(key(n),h);push(n,g);
        }
    }return [];
}
function findPathAroundTerrain(unit, targetHex, startHexOpt, skipBridgeCompose, pathMode, allowOverBudget) {
    let startHex = startHexOpt || getNearestWalkableHexForUnit(unit, unit.x, unit.y);
    if(!startHex || !targetHex) return [];
    if(isLandArmyUnit(unit)&&wodMpIsHumanOwner(unit.owner)&&isWaterHex(targetHex)&&wodOrderIntoWater(unit,targetHex))return wodFindExplicitWaterRoute(unit,startHex,targetHex);
    pathMode = pathMode || 'auto';
    if(pathMode === 'auto') {
        if(wodOrderIntoWater(unit, targetHex)) pathMode = 'water';
        else if(wodUnitPrefersLandOnlyPath(unit)) pathMode = 'army';
        else pathMode = 'full';
    }
    if(wodUnitPrefersLandOnlyPath(unit) && gameData.bridges && gameData.bridges.length)
        wodEnsureBridgePathIndex();
    let pathAllowWater = pathMode === 'water' || wodOrderIntoWater(unit, targetHex) ||
        wodOrderIntoWater(unit, startHex) || !!unit._wodOrderIntoWater ||
        wodIsOpenWaterHex(startHex);
    // Only remap onto the deck when the hex/point is actually on the bridge —
    // wodBridgeHexAtPoint's radius scan used to yank nearby shore hexes onto the
    // deck, turning shore→shore marches into deck→deck stubs that never exit.
    if(!isBridgeHex(startHex) && wodPointOnBridgeForUnit(unit, startHex.x, startHex.y, 1.05)) {
        let bh = wodBridgeHexAtPoint(unit, startHex.x, startHex.y);
        if(bh) startHex = bh;
    }
    if(!isBridgeHex(targetHex) && wodPointOnBridgeForUnit(unit, targetHex.x, targetHex.y, 1.05)) {
        let bh = wodBridgeHexAtPoint(unit, targetHex.x, targetHex.y);
        if(bh) targetHex = bh;
    }
    if(!wodPathTileWalkable(unit, startHex, pathAllowWater) || !wodPathTileWalkable(unit, targetHex, pathAllowWater)) return [];
    if(wodHexKeysEqual(startHex, targetHex)) return [startHex];
    let pfKey = null;
    if(!skipBridgeCompose) {
        pfKey = (gameData._wodPfVer | 0) + '|' + getHexKey(startHex) + '>' + getHexKey(targetHex) + '|' +
            pathMode + '|' + (unit.type || '') + '|' + (wodOrderIntoWater(unit, targetHex) ? 1 : 0);
        if(gameData._wodPfCache) {
            let hit = gameData._wodPfCache.get(pfKey);
            if(hit) return hit.slice();
        }
    }
    if(!allowOverBudget && !wodCanSpendPf()) return [];
    // Human orders get relaxed wall-clock ceilings in the amphibious compose too —
    // island-to-island orders across big oceans exceeded the 7-9ms sim budgets and
    // silently failed, leaving units to march the straight line instead.
    if(allowOverBudget) unit._wodPfRelaxUntil = performance.now() + 60;
    let pfT0 = performance.now();
    try {
    if(pathMode === 'water') return findAmphibiousMarchPath(unit, startHex, targetHex);
    function wodStorePfPath(path) {
        if(pfKey && path && path.length > 1) {
            if(!gameData._wodPfCache) gameData._wodPfCache = new Map();
            if(gameData._wodPfCache.size > 900) gameData._wodPfCache.clear();
            gameData._wodPfCache.set(pfKey, path.slice());
        }
        return path;
    }

    if((unit.type === 'marine' || wodIsNavalUnit(unit) ||
        (unit.type === 'convoy' && unit.convoySeaRoute)) &&
        isWaterHex(startHex) && isWaterHex(targetHex)) {
        let seaOnly = wodIsNavalUnit(unit) || (unit.type === 'convoy' && unit.convoySeaRoute);
        let g = buildGreedyWaterHexChain(unit, startHex, targetHex, seaOnly ? 220 : 120);
        // Only accept a complete greedy chain — a partial hop used to become the
        // whole path, then the far goal snapped across land and ships got stuck.
        if(!seaOnly && g.length > 1 && wodPathReachesTarget(g, targetHex))
            return wodStorePfPath(smoothGridPath(g));
        if(seaOnly && wodIsOpenWaterHex(startHex) && wodIsOpenWaterHex(targetHex)) {
            let wbfs = wodWaterBfsPath(unit, startHex, targetHex, allowOverBudget ? 32000 : 16000);
            if(wbfs.length > 1 && wodPathReachesTarget(wbfs, targetHex))
                return wodStorePfPath(wbfs);
        }
        if(g.length > 1 && wodPathReachesTarget(g,targetHex))return wodStorePfPath(smoothGridPath(g));
    }

    function runPathAst(forbidWater) {
        let useOpenWater = !forbidWater && !wodUnitPrefersLandOnlyPath(unit);
        let convoyHexExtraCost = (unit.type === 'convoy') ? buildConvoyFrontlineAvoidanceCost(unit) : null;
        let pathSeaConvoy = unit.type === 'convoy' && unit.convoySeaRoute;
        let pathMarine = unit.type === 'marine';
        // (WOD_OPS.T.deckPrice=0 turns it off) For the computer's troops a bridge link that boards a deck from land costs its
        // length (below): deck steps cost a fortieth of a step, so a link from land several cells off onto the corner of
        // another bridge's deck was a nearly free jump, and their routes went over to that bridge's end. (Pricing the deck
        // itself by its length lost head to head, 44-52 towns, and a charge for getting on or off a deck sent a march on a
        // deck off its side through the water.)
        const deckPrice = !wodIsNavalUnit(unit) && !(wodMpIsHumanOwner(unit.owner) && isLandArmyUnit(unit)) && typeof wodOpsTune === 'function' && wodOpsTune(unit.owner).deckPrice !== 0;

        function key(hex) { return `${hex.q},${hex.r}`; }
        let mtnProxHeuristicCache = new Map();
        let landMountRingExtraCache = new Map();
        function heuristic(a, b) {
            if(wodMpIsHumanOwner(unit.owner)&&isLandArmyUnit(unit))return Math.hypot(a.x-b.x,a.y-b.y)/((gameData.hexRadius||20)*1.35)/(unit.type==='mountaineer'?1.05:1);
            let dx = a.q - b.q;
            let dy = a.r - b.r;
            let h0 = Math.sqrt(dx * dx + dy * dy);
            if(wodIsNavalUnit(unit) || pathSeaConvoy) return h0;
            let ak = key(a);
            let mp = mtnProxHeuristicCache.get(ak);
            if(mp === undefined) {
                mp = hexMountainProximityScore(a,unit);
                mtnProxHeuristicCache.set(ak, mp);
            }
            return h0 + mp * 0.012;
        }
        function movementCost(a, b) {
            let stepDist = wodHexStepDistance(a, b);
            if(wodMpIsHumanOwner(unit.owner)&&isLandArmyUnit(unit)){
                // Price the actual distance and terrain speed, including
                // bridge portals. Mountain proximity and cheap deck edges
                // used to attract long detours unrelated to travel time.
                const distance=Math.hypot(a.x-b.x,a.y-b.y)/((gameData.hexRadius||20)*1.35);
                const cost=distance*(1/wodLandRouteSpeed(unit,a)+1/wodLandRouteSpeed(unit,b))*.5;
                return cost+(isWaterHex(b)&&!isBridgeHex(b)?(unit.type==='marine'?2.65:62):0);
            }
            if(isBridgeHex(a) && isBridgeHex(b)) return stepDist * 0.015;
            if(isBridgeHex(b) || isBridgeHex(a)) return stepDist * 0.025;
            let terrain = 0;
            if(b.type === 'forest') terrain = 0.5;
            else if(b.type === 'swamp') terrain = 1.2;
            else if(b.type === 'hill') terrain = 0.6;
            else if(b.type === 'sand') terrain = 0.15;
            else if(b.type === 'urban') terrain = -0.2; // Roads/urban are easy
            else if(b.type === 'grass') terrain = 0;
            else if(b.type === 'mountain') terrain += wodCanClimb(unit)?1.4:140;
            let seaConvoy = unit.type === 'convoy' && unit.convoySeaRoute;
            if(wodIsNavalUnit(unit) || seaConvoy) {
                // Ships / sea convoys never path onto land — hard reject.
                if(!wodIsOpenWaterHex(b)) return Infinity;
                if(isWaterHex(b)) terrain -= 0.35;
            }
            if(!wodIsNavalUnit(unit) && !pathSeaConvoy && isWaterHex(b) && !isBridgeHex(b)) terrain += pathMarine ? 2.65 : 62;
            // Route land units away from mountain edges and one-tile mountain moats.
            if(!wodIsNavalUnit(unit) && !seaConvoy && !wodCanClimb(unit) && b.type !== 'mountain') {
                let bk = key(b);
                let ringExtra = landMountRingExtraCache.get(bk);
                if(ringExtra === undefined) {
                    let touchM = false, nearM = false, ring2Mt = 0;
                    for(let di = 0; di < hexDirections.length; di++) {
                        let d1 = hexDirections[di];
                        let nn = wodHexAt(b.q + d1.q,b.r + d1.r);
                        if(!nn) continue;
                        if(nn.type === 'mountain') touchM = true;
                        else {
                            for(let dj = 0; dj < hexDirections.length; dj++) {
                                let d2 = hexDirections[dj];
                                let nn2 = wodHexAt(nn.q + d2.q,nn.r + d2.r);
                                if(nn2 && nn2.type === 'mountain') {
                                    nearM = true;
                                    ring2Mt++;
                                }
                            }
                        }
                    }
                    ringExtra = touchM ? 1.4 : ((nearM ? 0.8 : 0) + Math.min(1.2, ring2Mt * 0.16));
                    landMountRingExtraCache.set(bk, ringExtra);
                }
                terrain += ringExtra;
            }
            if(!wodIsNavalUnit(unit) && !seaConvoy) {
                if(b.owner === 0) terrain += 0.05;
                else if(b.owner !== unit.owner) terrain += 0.15;
            }
            if(convoyHexExtraCost) {
                let ck = key(b);
                if(convoyHexExtraCost[ck]) terrain += convoyHexExtraCost[ck];
            }
            return stepDist + terrain;
        }
        function heapScore(entry) {
            return entry.score;
        }
        function heapPush(heap, hex, fScoreLoc) {
            // Immutable priorities: decreasing a shared fScore silently
            // broke the heap order for all older copies of the same tile.
            const entry={hex,score:fScoreLoc[key(hex)]??Infinity};
            heap.push(entry);
            let i = heap.length - 1;
            while(i > 0) {
                let p = (i - 1) >> 1;
                if(heapScore(heap[p]) <= heapScore(entry)) break;
                heap[i] = heap[p];
                i = p;
            }
            heap[i] = entry;
        }
        function heapPop(heap, fScoreLoc) {
            let top = heap[0];
            let last = heap.pop();
            if(heap.length > 0) {
                let i = 0;
                while(true) {
                    let l = i * 2 + 1;
                    let r = l + 1;
                    if(l >= heap.length) break;
                    let child = (r < heap.length && heapScore(heap[r], fScoreLoc) < heapScore(heap[l], fScoreLoc)) ? r : l;
                    if(heapScore(last, fScoreLoc) <= heapScore(heap[child], fScoreLoc)) break;
                    heap[i] = heap[child];
                    i = child;
                }
                heap[i] = last;
            }
            return top.hex;
        }
        function rebuildPath(endHex, cameFromLoc) {
            let path = [endHex];
            let currentKey = key(endHex);
            while(cameFromLoc[currentKey]) {
                let prev = cameFromLoc[currentKey];
                path.push(prev);
                currentKey = key(prev);
            }
            path.reverse();
            return smoothGridPath(path);
        }

        function relaxPathNeighbor(nHex, current, currentKey, bridgeLink) {
            if(!nHex) return;
            let nKey = key(nHex);
            if(visited.has(nKey)) return;
            // Naval units: only open-water steps — never land, bridges, or decks.
            if(wodIsNavalUnit(unit) || pathSeaConvoy) {
                if(!wodIsOpenWaterHex(nHex) || !wodIsOpenWaterHex(current)) return;
            }
            if(bridgeLink) {
                if(wodIsNavalUnit(unit) || pathSeaConvoy) return;
                if(!wodPathTileWalkable(unit, nHex, false)) return;
                if(forbidWater && wodUnitUsesLandBridges(unit) && unit.type !== 'marine' &&
                    isWaterHex(nHex) && !isBridgeHex(nHex)) return;
            } else if(!wodCanStepBetweenHexes(unit, current, nHex, forbidWater)) {
                return;
            }
            let tentativeG = (gScore[currentKey] ?? Infinity) + movementCost(current, nHex);
            // A bridge link can join a deck to land up to five cells away. One that runs over open water off the bridge
            // (to another bridge's end, across a bay) is charged for that water: it used to be the cheapest way on, so
            // routes went over to the other bridge and back. (A link along its own deck stays as it was: the march
            // walks it down the deck.)
            if(bridgeLink) {
                const link = wodBridgeLinkStep(current, nHex);
                tentativeG += link.wet * WOD_BRIDGE_LINK_WET_COST;
                // (and, for the computer's troops, a link that boards a deck from land costs its length: from land a few cells
                // off, onto the corner of a deck, was a nearly free jump. A link off a deck is how a march walks down its own
                // deck to the bank, and stays cheap.)
                if(deckPrice && !isBridgeHex(current) && isBridgeHex(nHex)) tentativeG += Math.max(0, link.len - wodHexStepDistance(current, nHex));
            }
            if(tentativeG >= (gScore[nKey] ?? Infinity)) return;
            cameFrom[nKey] = current;
            gScore[nKey] = tentativeG;
            fScore[nKey] = tentativeG + heuristic(nHex, targetHex);
            heapPush(open, nHex, fScore);
        }

        let open = [];
        let cameFrom = {};
        let gScore = {};
        let fScore = {};
        let visited = new Set();
        let sk = key(startHex);
        gScore[sk] = 0;
        fScore[sk] = heuristic(startHex, targetHex);
        heapPush(open, startHex, fScore);
        let mapCells = Math.max(400, gameData.hexList.length || 0);
        let maxVisits = wodIsNavalUnit(unit) ? 20000 : ((unit.type === 'convoy' && unit.convoySeaRoute) ? 17000 : (unit.type === 'convoy' ? 15000 : 12000));
        if(unit.type === 'convoy') maxVisits = Math.floor(maxVisits * 1.35);
        if(forbidWater && (isLandArmyUnit(unit) || unit.type === 'convoy')) {
            maxVisits = Math.floor(5200 + mapCells * 0.22);
            maxVisits = Math.min(14000, Math.max(7000, maxVisits));
        } else {
            let heavy = (gameData.hexList.length > 9000 ? 5800 / gameData.hexList.length : 1) * (gameData.entities.length > 380 ? 320 / gameData.entities.length : 1);
            maxVisits = Math.max(900, Math.floor(maxVisits * heavy));
            if(isLandArmyUnit(unit) && !forbidWater)
                maxVisits = Math.max(maxVisits, Math.min(34000, 11000 + Math.floor(mapCells * 1.85)));
            if(unit.type === 'marine' && !forbidWater) maxVisits = Math.min(maxVisits, 3800);
        }

        // Wall-clock ceiling: a single uncapped A* could run 30ms+ mid-frame, which showed
        // up as a visible micro-freeze whenever marching columns re-pathed. Exhausting the
        // ceiling behaves exactly like exhausting maxVisits (callers fall back to greedy steps).
        let astT0 = performance.now();
        // 14ms for human orders: 10ms truncated long map-crossing searches, which fell
        // back to straight-line march targets ("paths break and go straight"). The
        // relax window covers nested calls (e.g. via wodPickLandArmyMarchPath) that
        // don't carry the allowOverBudget flag themselves.
        let astRelaxed = unit._wodPfRelaxUntil && performance.now() < unit._wodPfRelaxUntil;
        // Slightly higher ceilings so long marches on large maps keep real corridors
        // instead of truncating into straight-line / greedy hops mid-route.
        let astCeilMs = unit._wodPfDeepUntil > 0 ? 150 : (allowOverBudget || astRelaxed) ? 16 : (gameState === 'PLAYING' && !gameData.menuAttractMode ? 8 : 24);
        let visitTick = 0;
        while(open.length > 0 && maxVisits-- > 0) {
            if((++visitTick & 255) === 0 && performance.now() - astT0 > astCeilMs) break;
            let current = heapPop(open, fScore);
            let currentKey = key(current);
            if(visited.has(currentKey)) continue;
            if(wodHexKeysEqual(current, targetHex)) {
                let tk = key(targetHex);
                return {path: rebuildPath(current, cameFrom), cost: gScore[tk] ?? Infinity};
            }
            visited.add(currentKey);

            for(let di = 0; di < hexDirections.length; di++) {
                let dir = hexDirections[di];
                let nHex = wodHexAt(current.q + dir.q,current.r + dir.r);
                relaxPathNeighbor(nHex, current, currentKey);
            }
            wodForEachBridgePathPortal(unit, current, (nHex) => {
                relaxPathNeighbor(nHex, current, currentKey, true);
            });
        }
        return {path: [], cost: Infinity};
    }

    if(pathMode === 'land') return wodStorePfPath(runPathAst(true).path);
    if(pathMode === 'army') return wodStorePfPath(wodPickLandArmyMarchPath(unit, startHex, targetHex, allowOverBudget));
    if(wodUnitPrefersLandOnlyPath(unit)) return wodStorePfPath(wodPickLandArmyMarchPath(unit, startHex, targetHex, allowOverBudget));
    let fullPath = runPathAst(false).path;
    if(fullPath.length > 1 && wodPathReachesTarget(fullPath, targetHex))
        return wodStorePfPath(fullPath);
    // Ship / sea-convoy A* often times out on long bluewater legs — finish with BFS.
    if((wodIsNavalUnit(unit) || (unit.type === 'convoy' && unit.convoySeaRoute)) &&
        wodIsOpenWaterHex(startHex) && wodIsOpenWaterHex(targetHex)) {
        let wbfs = wodWaterBfsPath(unit, startHex, targetHex, allowOverBudget ? 36000 : 18000);
        if(wbfs.length > 1 && wodPathReachesTarget(wbfs, targetHex))
            return wodStorePfPath(wbfs);
        // Progress hop only (incomplete) — never a destination snap across land.
        let gHop = buildGreedyWaterHexChain(unit, startHex, targetHex, 48);
        if(gHop.length > 1) return wodStorePfPath(smoothGridPath(gHop));
    }
    return wodStorePfPath(fullPath);
    } finally {
        wodPfChargeMs(performance.now() - pfT0);
    }
}
function findGreedyWaterStep(unit, targetHex, opt) {
    opt = opt || {};
    let cur = opt.fromHex || getNearestWalkableHexForUnit(unit, unit.x, unit.y);
    if(!cur || !isWaterHex(cur) || !targetHex) return null;
    let waterOnly = unit && (wodIsNavalUnit(unit) || (unit.type === 'convoy' && unit.convoySeaRoute));
    if(waterOnly && !wodIsOpenWaterHex(cur)) return null;
    if(wodHexKeysEqual(cur,targetHex))return cur;
    let best = null;
    let bestScore = Infinity;
    // Ships need 8-way hops around concave coasts; cardinal-only stalls against peninsulas.
    let dirs = waterOnly ? hexDirections : cardinalHexDirections;
    for(let di = 0; di < dirs.length; di++) {
        let dir = dirs[di];
        let nHex = wodHexAt(cur.q + dir.q,cur.r + dir.r);
        if(!isWaterHex(nHex) || !canUseHexForMovement(unit, nHex)) continue;
        if(waterOnly && !wodIsOpenWaterHex(nHex)) continue;
        let dx = targetHex.x - nHex.x;
        let dy = targetHex.y - nHex.y;
        let d = dx * dx + dy * dy;
        let jitter = opt.deterministic ? ((((nHex.q * 73856093) ^ (nHex.r * 19349663)) & 2047) * 0.02) : Math.random() * 80;
        let score = d + jitter;
        if(score < bestScore) {
            bestScore = score;
            best = nHex;
        }
    }
    return best;
}
function buildGreedyWaterHexChain(unit, startHex, targetHex, maxSteps) {
    if(!startHex || !targetHex || !isWaterHex(startHex)) return [];
    let chain = [startHex];
    let cur = startHex;
    let tk = getHexKey(targetHex);
    for(let s = 0; s < maxSteps; s++) {
        if(getHexKey(cur) === tk) break;
        let next = findGreedyWaterStep(unit, targetHex, { fromHex: cur, deterministic: true });
        if(!next || getHexKey(next) === getHexKey(cur)) break;
        if(chain.length > 1 && getHexKey(next) === getHexKey(chain[chain.length - 2])) break;
        chain.push(next);
        cur = next;
    }
    return chain;
}
function findGreedyLandStepFromHex(unit, curHex, targetHex) {
    if(!curHex || !targetHex) return null;
    let seaConvoy = unit.type === 'convoy' && unit.convoySeaRoute;
    if(seaConvoy || wodIsNavalUnit(unit)) return null;
    let best = null;
    let bestScore = Infinity;
    let tb = ((targetHex.q * 2654435761) ^ (targetHex.r * 1597334677) ^ (curHex.q * 2246822519)) >>> 0;
    let forbidWater = wodUnitPrefersLandOnlyPath(unit);
    function consider(nHex, portal) {
        if(!nHex) return;
        let allowWater = wodOrderIntoWater(unit, null) || wodOrderIntoWater(unit, nHex) || wodOrderIntoWater(unit, targetHex);
        if(portal) {
            if(!wodPathTileWalkable(unit, nHex, allowWater)) return;
            if(!allowWater && isWaterHex(nHex) && !isBridgeHex(nHex)) return;
        } else if(!wodCanStepBetweenHexes(unit, curHex, nHex, forbidWater)) return;
        let dx = targetHex.x - nHex.x;
        let dy = targetHex.y - nHex.y;
        let d = dx * dx + dy * dy;
        let tie = (((nHex.q * 374761393) ^ (nHex.r * 668265263) ^ tb) >>> 0) * 2.287e-9;
        let score = d + hexMountainProximityScore(nHex,unit) * 18 + tie;
        if(score < bestScore) {
            bestScore = score;
            best = nHex;
        }
    }
    for(let dir of hexDirections) {
        let nHex = wodHexAt(curHex.q + dir.q,curHex.r + dir.r);
        consider(nHex, false);
    }
    wodForEachBridgePathPortal(unit, curHex, (nHex) => consider(nHex, true));
    return best;
}
function findGreedyLandStep(unit, targetHex) {
    let cur = getNearestWalkableHexForUnit(unit, unit.x, unit.y);
    return findGreedyLandStepFromHex(unit, cur, targetHex);
}
function buildGreedyLandHexChain(unit, startHex, targetHex, maxSteps) {
    if(!startHex || !targetHex) return [startHex];
    let chain = [startHex];
    let cur = startHex;
    let tk = getHexKey(targetHex);
    for(let s = 0; s < maxSteps; s++) {
        if(getHexKey(cur) === tk) break;
        let next = findGreedyLandStepFromHex(unit, cur, targetHex);
        if(!next || getHexKey(next) === getHexKey(cur)) break;
        if(chain.length > 1 && getHexKey(next) === getHexKey(chain[chain.length - 2])) break;
        chain.push(next);
        cur = next;
    }
    return chain;
}
function smoothGridPath(path) {
    if(path.length <= 2) return path;
    for(let i = 0; i < path.length; i++) {
        if(isBridgeHex(path[i])) return path.slice();
    }
    let smoothed = [path[0]];
    let lastDir = null;
    for(let i = 1; i < path.length; i++) {
        let prev = path[i - 1];
        let current = path[i];
        let dir = {q: Math.sign(current.q - prev.q), r: Math.sign(current.r - prev.r)};
        const shoreTransition=isWaterHex(prev)!==isWaterHex(current);
        if(shoreTransition || lastDir && (dir.q !== lastDir.q || dir.r !== lastDir.r)) {
            if(smoothed[smoothed.length-1]!==prev)smoothed.push(prev);
        }
        // Keep shore entry/exit and a water sample even on a perfectly
        // straight crossing, so approval and exposure checks see it.
        if(shoreTransition&&smoothed[smoothed.length-1]!==current)smoothed.push(current);
        lastDir = dir;
    }
    if(smoothed[smoothed.length-1]!==path[path.length-1])smoothed.push(path[path.length-1]);
    return smoothed;
}
function buildConcatenatedHexPath(unit, worldWaypoints, startPt, allowOverBudget, opts) {
    if(!worldWaypoints || worldWaypoints.length === 0) return [];
    let sx = startPt ? startPt.x : unit.x;
    let sy = startPt ? startPt.y : unit.y;
    let prevHex = getNearestWalkableHexForUnit(unit, sx, sy);
    let full = [];
    let savedWater = unit._wodOrderIntoWater;
    let savedOrder = unit.orderTarget;
    let savedAmpKey = unit._wodAmpPathKey;
    let savedAmpPath = unit._wodAmpPath;
    let savedArrowBuild = unit._wodArrowPathBuild;
    unit.orderTarget = null;
    unit._wodAmpPathKey = null;
    unit._wodAmpPath = null;
    // Real move orders (forOrder) must be allowed to compose amphibious water legs;
    // the arrow-build flag exists only to keep pure arrow-preview rebuilds cheap.
    // Marking ORDER corridors as arrow builds made land units refuse to cross water
    // toward land objectives entirely (the "can't cross water" bug).
    unit._wodArrowPathBuild = !(opts && opts.forOrder);
    try {
        for(let wp of worldWaypoints) {
            let reach = findReachableOrderHex(unit, wp.x, wp.y);
            // Drawn formation / stroke waypoints that still land in open water should
            // route via bridge/shore for land armies — never force amphibious mid-stroke.
            if(reach && reach.intoWater && (opts && opts.forOrder) &&
                wodUnitPrefersLandOnlyPath(unit) && !wodOrderIntoWater(unit, reach.hex)) {
                let snap = wodSnapLandArmyOrderPoint(unit, wp.x, wp.y, { allowDistantBridge: true });
                if(snap && snap.hex) reach = { hex: snap.hex, exactX: snap.x, exactY: snap.y, intoWater: false };
                else if(snap) {
                    let h = getNearestWalkableHexForUnit(unit, snap.x, snap.y);
                    if(h) reach = { hex: h, exactX: snap.x, exactY: snap.y, intoWater: false };
                }
            }
            if(!reach) continue;
            unit._wodOrderIntoWater = !!reach.intoWater;
            let seg = findPathAroundTerrain(unit, reach.hex, prevHex, false, 'auto', allowOverBudget);
            if(seg.length === 0) continue;
            if(full.length > 0 && getHexKey(seg[0]) === getHexKey(full[full.length - 1]))
                seg = seg.slice(1);
            full.push(...seg);
            prevHex = reach.hex;
        }
    } finally {
        unit._wodOrderIntoWater = savedWater;
        unit.orderTarget = savedOrder;
        unit._wodAmpPathKey = savedAmpKey;
        unit._wodAmpPath = savedAmpPath;
        unit._wodArrowPathBuild = savedArrowBuild;
    }
    return smoothGridPath(full);
}
let wodOrderArrowBuildQueue = [];
let wodOrderArrowBuildPumpScheduled = false;
let wodPlayerOrderQueue = [];
let wodPlayerOrderPumpScheduled = false;
function wodQueuePlayerMoveOrder(unit, worldPoints, opt) {
    if(!unit || !worldPoints || !worldPoints.length) return;
    if(!opt?.attackPursuit){unit._wodAttackOrder=null;unit._wodAttackApproaching=false;}
    const epoch=unit._wodPlayerOrderEpoch=(unit._wodPlayerOrderEpoch||0)+1;
    unit._trafficYield=null;unit.target=null;unit.path=null;
    unit._wodKeepLandFormation=!!opt?.keepLandFormation;unit._wodOrderIntoWater=false;
    unit.fullMarchWaypoints=worldPoints.map(p=>({x:p.x,y:p.y}));unit.marchWpCursor=0;
    unit.orderTarget={...unit.fullMarchWaypoints.at(-1)};invalidateUnitOrderArrowCache(unit);
    wodPlayerOrderQueue.push({
        unit,
        epoch,
        worldPoints: worldPoints.map(w => ({ x: w.x, y: w.y })),
        opt: opt || null
    });
    if(wodPlayerOrderQueue.length > 480) wodPlayerOrderQueue.splice(0, wodPlayerOrderQueue.length - 480);
    wodSchedulePlayerOrderPump();
}
function wodSchedulePlayerOrderPump() {
    if(wodPlayerOrderPumpScheduled) return;
    wodPlayerOrderPumpScheduled = true;
    requestAnimationFrame(wodPumpPlayerOrderQueue);
}
function wodPumpPlayerOrderQueue() {
    wodPlayerOrderPumpScheduled = false;
    if(!wodPlayerOrderQueue.length) return;
    wodPfSpentMs = 0;
    let qLen = wodPlayerOrderQueue.length;
    wodPfBudgetMs = Math.max(wodPfBudgetMs || 0, Math.min(56, 14 + qLen * 0.45));
    let t0 = performance.now();
    let budgetMs = wodUsesVisualViewportLayout() ? 4.5 : 7;
    if(qLen > 12) budgetMs = wodUsesVisualViewportLayout() ? 6.5 : 10;
    let batch = wodUsesVisualViewportLayout() ? 2 : 5;
    if(qLen > 20) batch = wodUsesVisualViewportLayout() ? 3 : 6;
    let n = 0;
    while(wodPlayerOrderQueue.length && n < batch && performance.now() - t0 < budgetMs) {
        let job = wodPlayerOrderQueue.shift();
        if(job.unit && job.unit.hp > 0&&job.epoch===job.unit._wodPlayerOrderEpoch) {
            job.tries = (job.tries || 0) + 1;
            let assigned = false;
            if(job.opt && job.opt.groupBridgeCorridor && job.opt.groupBridgeCorridor.length >= 2) {
                let last = job.worldPoints[job.worldPoints.length - 1];
                let exact = job.opt.groupBridgeExact || last;
                assigned = wodAssignGroupBridgeCorridor(
                    job.unit,
                    job.opt.groupBridgeCorridor,
                    { x: exact.x, y: exact.y },
                    false,
                    job.worldPoints,
                    { routeUsesBridge: true }
                );
            }
            if(!assigned)
                assigned = assignUnitMoveAlongWaypoints(job.unit, job.worldPoints, {...job.opt,_queuedPlayerOrder:true});
            if(assigned)
                job.tries = 0;
            else if(job.tries < 10)
                wodPlayerOrderQueue.push(job);
            else {
                // Final fallback after repeated pathfind failures: try a portal bridge
                // path first, then a greedy land chain — never a straight water hop.
                let u = job.unit;
                let tgt = job.worldPoints[job.worldPoints.length - 1];
                let sHex = getNearestWalkableHexForUnit(u, u.x, u.y);
                let tReach = findReachableOrderHex(u, tgt.x, tgt.y);
                let tHex = tReach ? tReach.hex : getNearestHexToPoint(tgt.x, tgt.y);
                if(sHex && tHex && wodUnitPrefersLandOnlyPath(u) && !wodOrderIntoWater(u, tHex)) {
                    let bridgeAlt = wodTryPortalBridgeMarchPath(u, sHex, tHex);
                    if(wodHexPathLength(bridgeAlt) > 1) {
                        u.orderTarget = { x: tgt.x, y: tgt.y };
                        if(wodPathCrossesBridge(bridgeAlt)) u._wodRouteUsesBridge = true;
                        u.path = wodHexPathToWorldWaypoints(u, bridgeAlt, { x: tgt.x, y: tgt.y });
                        if(wodTakeNextPathTarget(u)) {
                            invalidateUnitOrderArrowCache(u);
                            n++;
                            continue;
                        }
                    }
                }
                if(sHex && tHex) {
                    let chain = buildGreedyLandHexChain(u, sHex, tHex, 140);
                    if(chain.length > 1) {
                        u.orderTarget = { x: tgt.x, y: tgt.y };
                        u.path = chain.slice(1).map(h => ({ x: h.x, y: h.y, pathPrepared: true }));
                        if(wodTakeNextPathTarget(u)) invalidateUnitOrderArrowCache(u);
                    }
                }
            }
        }
        n++;
    }
    if(wodPlayerOrderQueue.length) wodSchedulePlayerOrderPump();
}
/** Per-point lateral-offset scales for cloning a lead corridor across a bridge.
 * Formation offsets beside the deck send units into open water; collapse to the
 * lead lane on approach + deck, then ease back out after the exit. */
function wodLeadCorridorBridgeFunnelScales(leadCorridor) {
    if(!leadCorridor || leadCorridor.length < 2) return null;
    let n = leadCorridor.length;
    let onB = new Array(n).fill(false);
    let probe = { type: 'light', owner: 1 };
    let any = false;
    for(let k = 0; k < n; k++) {
        let p = leadCorridor[k];
        if(!p) continue;
        // Only true deck occupancy — wodBridgeHexAtPoint's radius scan falsely marks
        // land beside bridges and collapses land formations onto the deck.
        if(wodPointOnBridgeForUnit(probe, p.x, p.y, 1.05)) {
            onB[k] = true;
            any = true;
            continue;
        }
        let h = getNearestHexToPoint(p.x, p.y);
        if(h && isBridgeHex(h)) {
            onB[k] = true;
            any = true;
        }
    }
    if(!any) return null;
    let first = -1,
        last = -1;
    for(let k = 0; k < n; k++) {
        if(!onB[k]) continue;
        if(first < 0) first = k;
        last = k;
    }
    if(first < 0) return null;
    let scales = new Array(n).fill(1);
    let approach = Math.min(6, Math.max(2, Math.floor(n * 0.18)));
    let exit = Math.min(3, Math.max(1, Math.floor(n * 0.08)));
    for(let k = 0; k < n; k++) {
        if(k >= first && k <= last) scales[k] = 0;
        else if(k < first && k >= first - approach) scales[k] = (first - k) / approach;
        else if(k > last && k <= last + exit) scales[k] = (k - last) / exit;
    }
    return scales;
}
/** Find the corridor index where the group should join the lead's bridge lane
 * (start of approach funnel / first deck point). */
function wodLeadCorridorBridgeJoinIndex(leadCorridor, funnel) {
    if(!leadCorridor || leadCorridor.length < 2) return -1;
    if(funnel) {
        for(let k = 0; k < funnel.length; k++) {
            if(funnel[k] < 1) return Math.max(0, k);
        }
    }
    let probe = { type: 'light', owner: 1 };
    for(let k = 0; k < leadCorridor.length; k++) {
        let p = leadCorridor[k];
        if(!p) continue;
        if(wodPointOnBridgeForUnit(probe, p.x, p.y, 1.05))
            return Math.max(0, k);
        let h = getNearestHexToPoint(p.x, p.y);
        if(h && isBridgeHex(h)) return Math.max(0, k);
    }
    return -1;
}
/** True when any consecutive corridor chord cuts terrain the unit cannot cross. */
function wodCorridorHasBlockedChord(unit, corridor) {
    if(!unit || !corridor || corridor.length < 2) return false;
    for(let i = 1; i < corridor.length; i++) {
        let a = corridor[i - 1],
            b = corridor[i];
        if(!a || !b) continue;
        if(!wodSegmentClearsTerrainForUnit(unit, a.x, a.y, b.x, b.y)) return true;
    }
    return false;
}
/**
 * Bridge-aware group assignment: pathfind each follower to the lead's bridge join
 * point, then follow the lead's deck/exit lane (no lateral river offsets). Offset
 * clones alone send flank units straight through open water to the first deck waypoint.
 */
function wodAssignGroupBridgeCorridor(unit, leadCorridor, exactLast, intoWater, marchPts, opt) {
    if(!unit || !leadCorridor || leadCorridor.length < 2) return false;
    if(!isLandArmyUnit(unit) && !wodUnitPrefersLandOnlyPath(unit)) return false;
    let funnel = wodLeadCorridorBridgeFunnelScales(leadCorridor);
    let joinIdx = wodLeadCorridorBridgeJoinIndex(leadCorridor, funnel);
    if(joinIdx < 0) joinIdx = 0;
    // Prefer joining slightly before the deck so the approach hex path can use portals.
    let approachIdx = Math.max(0, joinIdx - 1);
    let joinPt = leadCorridor[approachIdx] || leadCorridor[joinIdx];
    if(!joinPt) return false;

    // Far-shore destination must stay on land past the exit — never a mid-deck
    // formation offset (that made flank units stop halfway across).
    let farPt = exactLast ? { x: exactLast.x, y: exactLast.y } : null;
    let farOnDeck = !!(farPt && (
        wodPointOnBridgeForUnit(unit, farPt.x, farPt.y, 1.2) ||
        wodBridgeHexAtPoint(unit, farPt.x, farPt.y) ||
        (getNearestHexToPoint(farPt.x, farPt.y) && isBridgeHex(getNearestHexToPoint(farPt.x, farPt.y)))
    ));
    if(!farPt || farOnDeck) {
        // Prefer the last lead-corridor point that is clearly off the deck.
        for(let k = leadCorridor.length - 1; k >= 0; k--) {
            let p = leadCorridor[k];
            if(!p) continue;
            let onD = wodPointOnBridgeForUnit(unit, p.x, p.y, 1.15) ||
                (getNearestHexToPoint(p.x, p.y) && isBridgeHex(getNearestHexToPoint(p.x, p.y)));
            if(!onD) {
                farPt = { x: p.x, y: p.y };
                farOnDeck = false;
                break;
            }
        }
        if(!farPt || farOnDeck) {
            let last = leadCorridor[leadCorridor.length - 1];
            farPt = last ? { x: last.x, y: last.y } : farPt;
        }
    }

    let onDeckNow = !!wodUnitOnBridgeDeck(unit) ||
        wodPointOnBridgeForUnit(unit, unit.x, unit.y, 1.15);

    let startHex = getNearestWalkableHexForUnit(unit, unit.x, unit.y);
    // Prefer a land join hex — pathfinding onto the deck then truncating to joinPt
    // used to emit a full deck sweep that reversed back to the shore join.
    let joinHex = getNearestHexToPoint(joinPt.x, joinPt.y);
    if(joinHex && (isBridgeHex(joinHex) || wodIsOpenWaterHex(joinHex))) {
        let landJoin = null,
            landD = Infinity;
        let jc = pixelToHex(joinPt.x, joinPt.y);
        for(let pt of getHexesInRadius(jc.q, jc.r, 4)) {
            let h = wodHexAt(pt.q,pt.r);
            if(!h || h.type === 'mountain' || isWaterHex(h) || isBridgeHex(h)) continue;
            if(!wodHexWalkableForLandPath(unit, h, false)) continue;
            let dx = h.x - joinPt.x,
                dy = h.y - joinPt.y;
            let d = dx * dx + dy * dy;
            if(d < landD) {
                landD = d;
                landJoin = h;
            }
        }
        if(landJoin) joinHex = landJoin;
    }
    if(!joinHex) joinHex = getNearestWalkableHexForUnit(unit, joinPt.x, joinPt.y);
    if(!startHex || !joinHex) return false;

    // March direction along the lead corridor (for forward-only joins).
    let marchDx = (farPt ? farPt.x : leadCorridor[leadCorridor.length - 1].x) - leadCorridor[0].x;
    let marchDy = (farPt ? farPt.y : leadCorridor[leadCorridor.length - 1].y) - leadCorridor[0].y;
    let marchLen = Math.sqrt(marchDx * marchDx + marchDy * marchDy) || 1;
    marchDx /= marchLen;
    marchDy /= marchLen;

    let approachHex = [];
    let nearJoin = false;
    if(onDeckNow) {
        // Already on the deck — ride the remaining lead lane FORWARD only.
        nearJoin = true;
        let bestK = approachIdx;
        let bestAlong = -Infinity;
        let ux = unit.x,
            uy = unit.y;
        for(let k = approachIdx; k < leadCorridor.length; k++) {
            let p = leadCorridor[k];
            if(!p) continue;
            let along = (p.x - ux) * marchDx + (p.y - uy) * marchDy;
            // Prefer the first point still ahead (or barely behind) on the lane.
            if(along >= -((gameData.hexRadius || 20) * 0.35)) {
                bestK = k;
                break;
            }
            if(along > bestAlong) {
                bestAlong = along;
                bestK = k;
            }
        }
        approachIdx = bestK;
        joinPt = leadCorridor[approachIdx] || joinPt;
    } else {
        approachHex = findPathAroundTerrain(unit, joinHex, startHex, false, 'auto', true);
        if(approachHex.length <= 1 && !wodOrderIntoWater(unit, joinHex)) {
            let alt = wodTryPortalBridgeMarchPath(unit, startHex, joinHex);
            if(wodHexPathLength(alt) > 1) approachHex = alt;
        }
        // Strip trailing bridge/open-water hexes from the approach so world conversion
        // does not emit a full deck corridor that then reverses to joinPt.
        while(approachHex.length > 1) {
            let lastH = approachHex[approachHex.length - 1];
            if(lastH && (isBridgeHex(lastH) || wodIsOpenWaterHex(lastH)))
                approachHex.pop();
            else break;
        }
        if(approachHex.length <= 1) {
            let dx = joinPt.x - unit.x,
                dy = joinPt.y - unit.y;
            let hr = gameData.hexRadius || 20;
            let ahead = dx * marchDx + dy * marchDy;
            if(dx * dx + dy * dy <= Math.pow(hr * 1.35 * 2.2, 2) &&
                ahead >= -hr * 0.5 &&
                wodSegmentClearsTerrainForUnit(unit, unit.x, unit.y, joinPt.x, joinPt.y))
                nearJoin = true;
            else return false;
        }
    }

    let corridor = [{ x: unit.x, y: unit.y }];
    if(!nearJoin && !onDeckNow) {
        let approachWorld = wodHexPathToWorldWaypoints(unit, approachHex, joinPt);
        for(let wi = 0; wi < approachWorld.length; wi++)
            corridor.push({ x: approachWorld[wi].x, y: approachWorld[wi].y });
    } else if(!onDeckNow) {
        // Only push joinPt when it is still ahead — otherwise start the lead lane.
        let jdx = joinPt.x - unit.x,
            jdy = joinPt.y - unit.y;
        if(jdx * marchDx + jdy * marchDy >= -((gameData.hexRadius || 20) * 0.4))
            corridor.push({ x: joinPt.x, y: joinPt.y });
    }
    // Ride the lead lane from the join through deck + exit (offsets collapsed).
    let laneStart = approachIdx + (onDeckNow ? 0 : 1);
    // If we already passed joinPt, start at the first forward lead index.
    if(!onDeckNow && corridor.length >= 1) {
        let lastC = corridor[corridor.length - 1];
        for(let k = laneStart; k < leadCorridor.length; k++) {
            let p = leadCorridor[k];
            if(!p) continue;
            let along = (p.x - lastC.x) * marchDx + (p.y - lastC.y) * marchDy;
            if(along >= -1) {
                laneStart = k;
                break;
            }
        }
    }
    for(let k = laneStart; k < leadCorridor.length; k++) {
        let p = leadCorridor[k];
        if(!p) continue;
        corridor.push({ x: p.x, y: p.y });
    }
    // Finish on the far-shore point — replace overshooting tail instead of appending a Z.
    if(farPt) {
        let last = corridor[corridor.length - 1];
        if(last) {
            let overshoot = (last.x - farPt.x) * marchDx + (last.y - farPt.y) * marchDy;
            if(overshoot > (gameData.hexRadius || 20) * 0.5) {
                while(corridor.length > 2) {
                    let tip = corridor[corridor.length - 1];
                    let tipOver = (tip.x - farPt.x) * marchDx + (tip.y - farPt.y) * marchDy;
                    if(tipOver <= (gameData.hexRadius || 20) * 0.35) break;
                    corridor.pop();
                }
            }
        }
        last = corridor[corridor.length - 1];
        if(!last || Math.abs(last.x - farPt.x) > 1 || Math.abs(last.y - farPt.y) > 1)
            corridor.push({ x: farPt.x, y: farPt.y });
    }
    corridor = wodStripReversePathKinks(dedupeNearOrderPathPoints(corridor), unit);
    if(corridor.length < 2) return false;
    if(wodCorridorHasBlockedChord(unit, corridor)) return false;
    // Only snap exact-end when the destination is off the deck — otherwise
    // formation offsets truncate the corridor mid-bridge.
    if(farPt && !farOnDeck)
        wodApplyCorridorExactEnd(corridor, farPt, unit);

    invalidateUnitOrderArrowCache(unit);
    unit.blockedTimer = 0;
    unit.stuckTimer = 0;
    unit._wodFriendBlockT = 0;
    unit._wodLegRepathQueued = false;
    unit._wodGreedyStepsLeft = 0;
    unit._wodPathGiveUpUntil = 0;
    unit._wodReplanLandUntil = 0;
    unit._wodOrderIntoWater = !!intoWater;
    unit._wodRouteUsesBridge = true;
    unit._wodAmpPathKey = null;
    unit._wodAmpPath = null;
    unit.orderTarget = { x: farPt.x, y: farPt.y, intoWater: !!intoWater };
    unit.fullMarchWaypoints = marchPts.map(p => ({ x: p.x, y: p.y }));
    unit.marchWpCursor = 0;
    unit.path = corridor.slice(1).map(p => ({ x: p.x, y: p.y, pathPrepared: true }));
    if(!wodTakeNextPathTarget(unit)) return false;
    if(unit.owner === 1) {
        unit.combatEngaged = false;
        unit.combatLockTimer = 0;
    }
    unit._routeArrowMarchSig = marchPts.map(w => Math.round(w.x / 8) + ',' + Math.round(w.y / 8)).join(';');
    unit._routeArrowFrozenPts = marchPts.length>1 ? dedupeNearOrderPathPoints(corridor) : wodCleanOrderArrowPolyline(wodStripReversePathKinks(dedupeNearOrderPathPoints(corridor)));
    unit._routeArrowFrozenReady = true;
    unit._routeArrowProgressIdx = 0;
    return true;
}
/** Apply move orders immediately for a few units, queue the rest to avoid input hitch. */
function wodApplyPlayerMoveOrders(units,pathForUnit) {
    if(!units?.length)return;
    const selected=new Set(units),reserved=new Map();let acknowledged=false,syncDone=0;
    wodPlayerOrderQueue=wodPlayerOrderQueue.filter(j=>!selected.has(j.unit));
    wodPfSpentMs=0;wodPfBudgetMs=Math.max(wodPfBudgetMs||0,15);
    for(let i=0;i<units.length;i++){
        const unit=units[i],requested=pathForUnit(unit,i);if(!requested?.length)continue;
        const points=requested.map(p=>({...p}));
        // Reserve each leg independently: snapping many coastal or mountain
        // slots onto one tile must never give a whole army the same endpoint.
        for(let leg=0;leg<points.length;leg++){
            const used=reserved.get(leg)||[];reserved.set(leg,used);
            points[leg]=wodReserveGroupPoint(unit,points[leg],used,selected);
            if(!points[leg])break;used.push({unit,point:points[leg]});
        }
        if(points.some(p=>!p))continue;
        if(!acknowledged){acknowledged=true;wodPlayUnitMoveSound(units);}
        const start=getNearestHexToPoint(unit.x,unit.y),region=units.length>1&&!wodIsNavalUnit(unit)&&start&&!isWaterHex(start)&&wodTransportLandingRegion(unit,start);
        const keepLandFormation=!!region&&points.every(p=>region.has(getHexKey(getNearestHexToPoint(p.x,p.y))));
        const opt={keepLandFormation};
        if(syncDone<3&&assignUnitMoveAlongWaypoints(unit,points,opt))syncDone++;
        else wodQueuePlayerMoveOrder(unit,points,opt);
    }
}
function wodWorldPointsFromHexMarchPath(unit, hexPath, startPt) {
    if(!hexPath || hexPath.length <= 1) {
        return startPt ? [{x: startPt.x, y: startPt.y}] : [];
    }
    let endHex = hexPath[hexPath.length - 1];
    let endPt = {x: endHex.x, y: endHex.y};
    let corridor = wodHexPathToWorldWaypoints(unit, hexPath, endPt);
    let pts = [{x: startPt ? startPt.x : hexPath[0].x, y: startPt ? startPt.y : hexPath[0].y}];
    for(let wi = 0; wi < corridor.length; wi++) pts.push(corridor[wi]);
    // Dedup only — do not kink-clean; that collapses bridge deck corridors used for movement.
    return dedupeNearOrderPathPoints(pts);
}
function wodEnqueueOrderArrowPathBuild(unit, marchPts) {
    if(!unit || !marchPts || marchPts.length === 0) return;
    let orderSig = (unit.fullMarchWaypoints && unit.fullMarchWaypoints.length)
        ? unit.fullMarchWaypoints.map(w => Math.round(w.x / 8) + ',' + Math.round(w.y / 8)).join(';')
        : marchPts.map(w => Math.round(w.x / 8) + ',' + Math.round(w.y / 8)).join(';');
    unit._routeArrowMarchSig = orderSig;
    unit._routeArrowBuildGen = (unit._routeArrowBuildGen || 0) + 1;
    unit._routeArrowProgressIdx = 0;
    unit._routeArrowFrozenReady = false;
    let gen = unit._routeArrowBuildGen;
    let uid = unit.uid;
    let startPt = {x: unit.x, y: unit.y};
    let ptsCopy = marchPts.map(w => ({x: w.x, y: w.y}));
    let fallback = [{x: startPt.x, y: startPt.y}];
    for(let wi = 0; wi < ptsCopy.length; wi++) fallback.push(ptsCopy[wi]);
    unit._routeArrowFrozenPts = dedupeNearOrderPathPoints(fallback);
    wodOrderArrowBuildQueue = wodOrderArrowBuildQueue.filter(j => j.uid !== uid);
    wodOrderArrowBuildQueue.push({uid, gen, startPt, ptsCopy, sig: orderSig});
    if(wodOrderArrowBuildQueue.length > 160)
        wodOrderArrowBuildQueue.splice(0, wodOrderArrowBuildQueue.length - 160);
    wodPumpOrderArrowBuildQueue();
}
function wodProcessOrderArrowBuildJob(job) {
    let unit = null;
    for(let u of gameData.entities) {
        if(u.uid === job.uid && u.hp > 0) { unit = u; break; }
    }
    if(!unit || unit._routeArrowBuildGen !== job.gen || unit._routeArrowMarchSig !== job.sig) return false;
    try {
        let seg = buildConcatenatedHexPath(unit, job.ptsCopy, job.startPt, true);
        if(!seg.length) {
            job.retries = (job.retries || 0) + 1;
            if(job.retries < 5) wodOrderArrowBuildQueue.push(job);
            return false;
        }
        let out = wodWorldPointsFromHexMarchPath(unit, seg, job.startPt);
        if(job.ptsCopy.length>1){
            out=[{...job.startPt}];let anchor={...job.startPt};
            for(const goal of job.ptsCopy){const probe={...unit,x:anchor.x,y:anchor.y};const leg=buildConcatenatedHexPath(probe,[goal],anchor,true);const points=wodWorldPointsFromHexMarchPath(probe,leg,anchor);out.push(...(points.length>1?points.slice(1):[goal]));anchor={...goal};}
        }
        if(out.length >= 2 && unit._routeArrowBuildGen === job.gen && unit._routeArrowMarchSig === job.sig) {
            let oldPts = unit._routeArrowFrozenPts;
            let oldIdx = unit._routeArrowProgressIdx || 0;
            unit._routeArrowFrozenPts = job.ptsCopy.length>1?dedupeNearOrderPathPoints(out):wodCleanOrderArrowPolyline(wodStripReversePathKinks(dedupeNearOrderPathPoints(out)));
            unit._routeArrowFrozenReady = true;
            if(oldPts && oldPts.length > 1) {
                let ratio = oldIdx / (oldPts.length - 1);
                unit._routeArrowProgressIdx = Math.min(out.length - 1, Math.max(0, Math.round(ratio * (out.length - 1))));
            }
            return true;
        }
    } catch(_) {}
    return false;
}
function wodPumpOrderArrowBuildQueue() {
    if(wodOrderArrowBuildPumpScheduled) return;
    wodOrderArrowBuildPumpScheduled = true;
    requestAnimationFrame(() => {
        wodOrderArrowBuildPumpScheduled = false;
        if(!wodOrderArrowBuildQueue.length) return;
        wodPfSpentMs = 0;
        wodPfBudgetMs = Math.max(wodPfBudgetMs || 0, wodFogActive() ? 22 : 16);
        let t0 = performance.now();
        let budgetMs = wodUsesVisualViewportLayout() ? 3.5 : (wodFogActive() ? 12 : 8);
        while(wodOrderArrowBuildQueue.length && performance.now() - t0 < budgetMs)
            wodProcessOrderArrowBuildJob(wodOrderArrowBuildQueue.shift());
        if(wodOrderArrowBuildQueue.length) wodPumpOrderArrowBuildQueue();
    });
}
function wodSeedOrderArrowCurrentLeg(unit, hexPath) {
    if(!unit || !hexPath || hexPath.length <= 1 || !unit._routeArrowMarchSig) return;
    let legPts = wodWorldPointsFromHexMarchPath(unit, hexPath, {x: unit.x, y: unit.y});
    if(legPts.length < 2) return;
    // Only seed the current pathfound leg. Appending remaining click waypoints as
    // straight chords cut across water/bridges and drew triangular loops.
    unit._routeArrowFrozenPts = wodCleanOrderArrowPolyline(dedupeNearOrderPathPoints(legPts));
}
/** Snap a corridor's final point to the exact click target, dropping trailing points
 * that would double back at the tip (the source of Z-shaped / sideways arrowheads
 * and the arrival-time re-path jog). */
function wodApplyCorridorExactEnd(corridor, exactEnd, unit) {
    if(!corridor || corridor.length < 2 || !exactEnd || exactEnd.x == null) return;
    let hr = gameData.hexRadius || 20;
    let near2 = Math.pow(hr * 1.35 * 1.3, 2);
    let popped = 0;
    while(corridor.length > 2) {
        let a = corridor[corridor.length - 2];
        let b = corridor[corridor.length - 1];
        let bex = exactEnd.x - b.x, bey = exactEnd.y - b.y;
        if(bex * bex + bey * bey > near2) break;
        let abx = b.x - a.x, aby = b.y - a.y;
        let aex = exactEnd.x - a.x, aey = exactEnd.y - a.y;
        let len2 = abx * abx + aby * aby;
        // The click lies before b along the last segment — keeping b would overshoot
        // and double back. Drop it.
        if(len2 <= 1 || abx * aex + aby * aey < len2) { corridor.pop(); popped++; }
        else break;
    }
    // Clicks hugging a mountain wall / thin pass: replacing the last hex-center
    // waypoint with the raw click may cut a mountain corner. Only snap when the
    // final chord stays on walkable terrain — otherwise APPEND the click after the
    // safe hex center (or drop it entirely if even that leg clips terrain).
    let prev = corridor[corridor.length - 2];
    if(!unit || wodSegmentClearsTerrainForUnit(unit, prev.x, prev.y, exactEnd.x, exactEnd.y, true)) {
        corridor[corridor.length - 1] = { x: exactEnd.x, y: exactEnd.y };
        return;
    }
    let last = corridor[corridor.length - 1];
    if(wodSegmentClearsTerrainForUnit(unit, last.x, last.y, exactEnd.x, exactEnd.y))
        corridor.push({ x: exactEnd.x, y: exactEnd.y });
}
/** True when this unit should get the dense land corridor (exact-end + kink strip).
 * Players always; AI land armies when bridges exist so river crossings compose. */
function wodUnitGetsLandCorridorPath(unit) {
    if(!unit) return false;
    if(wodMpIsHumanOwner(unit.owner)) return true;
    if(wodIsNavalUnit(unit) || (unit.type === 'convoy' && unit.convoySeaRoute)) return false;
    return !!(wodUnitPrefersLandOnlyPath(unit) && gameData.bridges && gameData.bridges.length);
}
/** Build one terrain-aware corridor for a land march and queue it in unit.path. */
function wodLandRouteSpeed(unit,hex) {
    if(isBridgeHex(hex))return 1;
    return unit.type==='motorized'?({forest:.72,hill:.68,swamp:.42,urban:.8}[hex?.type]||1):unit.type==='mountaineer'?({hill:1.05,mountain:.65}[hex?.type]||1):1;
}
function wodLandChordTravelCost(unit,a,b) {
    const distance=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(1,Math.ceil(distance/((gameData.hexRadius||20)*.3)));
    let cost=0;
    for(let i=0;i<steps;i++){
        const t=(i+.5)/steps,h=getNearestHexToPoint(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);
        cost+=distance/steps/wodLandRouteSpeed(unit,h);
    }return cost;
}
function wodUniformDryChord(unit,a,b) {
    if(!isLandArmyUnit(unit)||['motorized','mountaineer'].includes(unit.type)||!wodStraightMarchSegmentClear(unit,a,b))return false;
    const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/((gameData.hexRadius||20)*.5)));
    for(let i=0;i<=n;i++){
        const x=a.x+(b.x-a.x)*i/n,y=a.y+(b.y-a.y)*i/n,h=getNearestHexToPoint(x,y);
        if(!h||isWaterHex(h)||isBridgeHex(h))return false;
    }return true;
}
function wodTryAssignPlayerCorridorPath(unit, marchPts, exactLast, fromAdvance) {
    // Multi-stop orders advance one leg at a time. Tautening a combined
    // route can shortcut deliberate waypoint corners in open terrain.
    if(marchPts?.length>1)return false;
    if(!unit || !marchPts || !marchPts.length || !wodUnitGetsLandCorridorPath(unit)) return false;
    wodPfSpentMs = 0;
    let human = wodMpIsHumanOwner(unit.owner);
    wodPfBudgetMs = Math.max(wodPfBudgetMs || 0, fromAdvance ? (human ? 18 : 14) : (human ? 28 : 20));
    let startPt = { x: unit.x, y: unit.y };
    let endPt = exactLast ? { x: exactLast.x, y: exactLast.y } : marchPts[marchPts.length - 1];
    const direct=wodUniformDryChord(unit,startPt,endPt);
    let fullHex = direct?[]:buildConcatenatedHexPath(unit, marchPts, startPt, true, { forOrder: true });
    if(unit._wodKeepLandFormation&&wodPathCrossesOpenWater(fullHex))return false;
    if(!direct&&fullHex.length <= 1) return false;
    let corridor = direct?[startPt,endPt]:wodWorldPointsFromHexMarchPath(unit, fullHex, endPt);
    corridor[0] = { x: unit.x, y: unit.y };
    if(corridor.length < 2) return false;
    wodApplyCorridorExactEnd(corridor, endPt, unit);
    corridor = marchPts.length>1 ? dedupeNearOrderPathPoints(corridor) : wodStripReversePathKinks(corridor, unit);
    // Amphibious corridors need the into-water flag so movement clamps, stuck logic
    // and terrain-safety checks treat the water legs as legal.
    if(wodPathCrossesOpenWater(fullHex)) unit._wodOrderIntoWater = true;
    if(wodPathCrossesBridge(fullHex)) unit._wodRouteUsesBridge = true;
    unit.path = corridor.slice(1).map(p => ({ x: p.x, y: p.y, pathPrepared: true }));
    if(!wodTakeNextPathTarget(unit)) return false;
    // Keep sparse click waypoints for leg logic; dense corridor lives in unit.path only.
    // Putting every hex step into fullMarchWaypoints made the arrow builder re-pathfind
    // between each step and draw huge looping lines on the map.
    if(!fromAdvance) {
        unit.fullMarchWaypoints = marchPts.map(p => ({ x: p.x, y: p.y }));
        unit.marchWpCursor = 0;
    }
    let arrowSig = marchPts.map(w => Math.round(w.x / 8) + ',' + Math.round(w.y / 8)).join(';');
    unit._routeArrowMarchSig = arrowSig;
    unit._routeArrowFrozenPts = marchPts.length>1 ? dedupeNearOrderPathPoints(corridor) : wodCleanOrderArrowPolyline(wodStripReversePathKinks(dedupeNearOrderPathPoints(corridor)));
    unit._routeArrowFrozenReady = true;
    unit._routeArrowProgressIdx = 0;
    return true;
}
function wodPlayerMarchArrowPoints(unit) {
    if(!unit || !wodMpIsHumanOwner(unit.owner)) return null;
    const waypoints=unit.fullMarchWaypoints||[],cursor=unit.marchWpCursor||0;
    if(waypoints.length>1) {
        if(unit._routeArrowFrozenReady&&unit._routeArrowMarchSig===wodMarchArrowSignature(unit)) {
            const route=wodSliceFrozenOrderArrowPath(unit,unit._routeArrowFrozenPts);
            if(route?.length>1)return route;
        }
        // Live movement may contain only the active leg. Always include the
        // remaining queued destinations, without removing deliberate turns.
        return wodWaypointOrderArrowPoints(unit);
    }
    return wodLiveMarchPathPoints(unit);
}
function assignUnitMoveAlongWaypoints(unit, worldPoints, opt) {
    if(unit?.moraleBroken&&!opt?.retainMoraleBroken&&!opt?.fromLegAdvance&&!opt?.transportInternal)return false;
    if(unit&&worldPoints?.length===1&&!opt?.fromLegAdvance&&(opt?.forceRetreat||unit.retreating&&opt?.retainRetreat)) {
        const goal=getNearestHexToPoint(worldPoints[0].x,worldPoints[0].y),path=wodFindSafeRetreatPath(unit,goal);
        if(path&&!path.length)return false;
        if(path)opt={...opt,preparedPath:path,riskRetreat:true};
        else if(!wodIsNavalUnit(unit)&&unit.type!=='convoy')opt={...opt,riskRetreat:true};
    }
    if(unit&&!opt?.attackPursuit&&!opt?.fromLegAdvance&&!opt?.transportInternal&&!unit._trafficMoving){unit._wodAttackOrder=null;unit._wodAttackApproaching=false;}
    if(unit&&!opt?._queuedPlayerOrder&&!opt?.fromLegAdvance&&!opt?.transportInternal)unit._wodPlayerOrderEpoch=(unit._wodPlayerOrderEpoch||0)+1;
    if(unit&&!unit._trafficMoving)unit._trafficYield=null;
    if(unit&&(wodIsNavalUnit(unit)||unit.type==='convoy'&&unit.convoySeaRoute))ensureUnitPixelOnWalkableHex(unit,18);
    if(!opt?.fromLegAdvance&&!opt?.transportInternal) {
        if(unit.boardTransportUid){const t=gameData.entities.find(t=>t.uid===unit.boardTransportUid);if(t)t.pickupUid=null;unit.boardTransportUid=null;unit._wodBoardingNoWater=false;}
        if(unit.type==='transport'){if(unit.pickupUid){const u=gameData.entities.find(u=>u.uid===unit.pickupUid);if(u){u.boardTransportUid=null;u._wodBoardingNoWater=false;}}unit.pickupUid=null;unit.unloadHexKey=null;unit.unloadGoal=null;unit.ferryGoal=null;}
    }
    if(!worldPoints || worldPoints.length === 0) return false;
    let fromAdvance = !!(opt && opt.fromLegAdvance);
    if(!fromAdvance)unit._wodRiskRetreat=!!opt?.riskRetreat;
    if(!fromAdvance){
        unit._wodRetreatRouteBlocked=false;
        unit._wodRetreatThreatSignature=unit._wodRiskRetreat?wodRetreatThreatSignature(unit,worldPoints[0]):null;
        unit._wodRetreatScanAt=(gameData._aiEconomyClock||0)+.5;
    }
    if(!fromAdvance&&!unit._trafficMoving)unit._wodKeepLandFormation=!!opt?.keepLandFormation;
    // (afloat, not merely on a water cell: a bridge deck is one, and every AI order given on a bridge granted leave to swim)
    if(!fromAdvance&&!wodMpIsHumanOwner(unit.owner)&&isLandArmyUnit(unit))unit._wodAiRescueWater=wodUnitAfloatForLeave(unit);
    if(!fromAdvance) invalidateUnitOrderArrowCache(unit);
    unit.blockedTimer = 0;
    unit.stuckTimer = 0;
    unit._wodLegRepathQueued = false;
    if(!fromAdvance) unit._wodGreedyStepsLeft = 0;
    unit._wodPathGiveUpUntil = 0;
    unit._wodReplanLandUntil = 0;
    if(!fromAdvance) {
        if(!(opt&&(opt.retainRetreat||opt.retainMoraleBroken))){
            unit._wodRecoveryRetreat=false;
            if(wodMpIsHumanOwner(unit.owner)&&!opt?.transportInternal){
                unit._medicalRecovering=false;unit._medicalWaiting=false;unit._medicalGoal=null;unit._aiRecoveryGroup=null;
            }
        }
        if(opt && opt.forceRetreat) {
            unit.retreating = true;
            unit._wodOrderedRetreat = true;
        } else if(!(opt && (opt.retainRetreat || opt.retainMoraleBroken))) {
            // A fresh human move cancels an ordered retreat; AI/morale retreats keep their flag.
            if(unit._wodOrderedRetreat) {
                unit.retreating = false;
                unit._wodOrderedRetreat = false;
            }
        }
    }

    if(!fromAdvance) {
        unit._wodOrderIntoWater = false;
        unit._wodShoreExitRouting = false;
        unit._wodRouteUsesBridge = false;
        unit._wodAmpPathKey = null;
        unit._wodAmpPath = null;
    }
    let marchPts;
    let cursor;
    if(fromAdvance) {
        marchPts = unit.fullMarchWaypoints;
        cursor = unit.marchWpCursor || 0;
    } else {
        marchPts = worldPoints.map(w => ({x: w.x, y: w.y}));
        cursor = 0;
    }
    if(!marchPts || marchPts.length === 0) return false;
    if(cursor >= marchPts.length) {
        unit.fullMarchWaypoints = null;
        unit.marchWpCursor = 0;
        return true;
    }

    let nextWp = marchPts[cursor];
    let lastWp = marchPts[marchPts.length - 1];
    let reachNext = findReachableOrderHex(unit, nextWp.x, nextWp.y);
    if(!reachNext) return false;

    let reachLast = findReachableOrderHex(unit, lastWp.x, lastWp.y);
    let exactLast = reachLast ? {x: reachLast.exactX, y: reachLast.exactY} : {x: lastWp.x, y: lastWp.y};
    // Land army already afloat ordering onto land: keep embark flags so pathfinding
    // and drowning clamps treat the march as amphibious (water→land).
    let standingWater = wodUnitAfloatForLeave(unit);
    let destIntoWater = !!(reachLast && reachLast.intoWater);
    let embarkFromWater = standingWater && !destIntoWater;
    unit.orderTarget = reachLast
        ? { x: exactLast.x, y: exactLast.y, intoWater: destIntoWater || embarkFromWater }
        : { x: exactLast.x, y: exactLast.y, intoWater: embarkFromWater };
    wodSetMarchOrderFlags(unit, { intoWater: destIntoWater || embarkFromWater });

    if(!fromAdvance) {
        unit.fullMarchWaypoints = marchPts;
        unit.marchWpCursor = 0;
        if(marchPts.length>1||!wodMpIsHumanOwner(unit.owner))
            wodEnqueueOrderArrowPathBuild(unit, marchPts);
        if(unit.owner === 1) {
            unit.combatEngaged = false;
            unit.combatLockTimer = 0;
        }
    }

    // (not to another landmass: the corridor composes its crossing from the shore nearest the unit; see crossing below.
    // A unit already in the water keeps its shore-exit routing, one swim and then land, as does one about to board.)
    const crossLand=!opt?.preparedPath&&wodMpIsHumanOwner(unit.owner)&&isLandArmyUnit(unit)&&!standingWater&&!unit._wodBoardingNoWater&&!!reachNext.hex&&!isWaterHex(reachNext.hex)&&
        !wodTransportLandingRegion(unit,getNearestWalkableHexForUnit(unit,unit.x,unit.y)||reachNext.hex)?.has(getHexKey(reachNext.hex));
    if(wodUnitGetsLandCorridorPath(unit)&&!destIntoWater&&!standingWater&&!opt?.preparedPath&&!crossLand) {
        let corridorPts = fromAdvance ? marchPts.slice(cursor) : marchPts;
        if(wodTryAssignPlayerCorridorPath(unit, corridorPts, exactLast, fromAdvance))
            return true;
        // Corridor build failed (A* budget exhausted / blocked terrain). Fall through
        // to the generic leg assignment below — its greedy/amphibious fallbacks keep
        // the unit moving legally instead of leaving it frozen with a stale arrow.
    }

    let startHex = getNearestWalkableHexForUnit(unit, unit.x, unit.y);
    let allowOver = wodMpIsHumanOwner(unit.owner) ||
        wodIsNavalUnit(unit) ||
        (unit.type === 'convoy' && unit.convoySeaRoute) ||
        !!(wodUnitPrefersLandOnlyPath(unit) && gameData.bridges && gameData.bridges.length);
    // A player's land troops sent to another landmass: the crossing with the least swimming, walking as far as the land
    // goes (wodFindExplicitWaterRoute prices a cell of water at eighteen of land). The shore crossing nearest where they
    // stood had them swim along the coast for many cells, and lose most of their strength, to a gap they could have
    // walked to. (Water steps are allowed only while the route is searched; the march sets its own flags from it.)
    let crossing=null;
    if(crossLand&&startHex){
        const saved=unit._wodOrderIntoWater;unit._wodOrderIntoWater=true;
        try{crossing=wodFindExplicitWaterRoute(unit,startHex,reachNext.hex);}finally{unit._wodOrderIntoWater=saved;}
        if(!(crossing?.length>1))crossing=null;
    }
    let path = opt?.preparedPath || crossing || findPathAroundTerrain(unit, reachNext.hex, startHex, false, 'auto', allowOver);
    // (a player's land troops sent to another landmass: the crossing, whatever the land check says)
    const otherLand=path.length<=1&&wodMpIsHumanOwner(unit.owner)&&isLandArmyUnit(unit)&&reachNext.hex&&startHex&&!isWaterHex(reachNext.hex)&&
        !wodTransportLandingRegion(unit,startHex)?.has(getHexKey(reachNext.hex));
    if(path.length <= 1 && wodUnitPrefersLandOnlyPath(unit) && reachNext.hex && startHex &&
        (otherLand || wodOrderIntoWater(unit, reachNext.hex) || wodIsOpenWaterHex(startHex) ||
            wodMarchBlockedWithoutBridge(unit, startHex, reachNext.hex))) {
        let ampPath = findAmphibiousMarchPath(unit, startHex, reachNext.hex);
        // A long crossing can outrun the bounded search (more so on a busy machine); the order then fell back to greedy
        // land steps that re-queued it, and the unit hopped to and fro along the shore for good. One search with a far
        // larger budget (wodPfDeep), at most every three seconds for a unit.
        if(wodHexPathLength(ampPath)<=1&&otherLand){const now=performance.now();
            if(!(unit._wodPfDeepAt>now-3000)){unit._wodPfDeepAt=now;unit._wodPfDeepUntil=1;
                try{ampPath=findAmphibiousMarchPath(unit,startHex,reachNext.hex);}finally{unit._wodPfDeepUntil=0;}}}
        if(wodHexPathLength(ampPath) > 1) path = ampPath;
    }
    // First-order bridge rescue (parity with replanUnitOrder): try portal/composed
    // bridge paths before greedy hops that walk into open water at the shore.
    if(path.length <= 1 && wodUnitPrefersLandOnlyPath(unit) && reachNext.hex && startHex &&
        !wodOrderIntoWater(unit, reachNext.hex) &&
        !wodHexKeysEqual(startHex, reachNext.hex) &&
        wodMarchBlockedWithoutBridge(unit, startHex, reachNext.hex)) {
        let bridgeAlt = wodTryPortalBridgeMarchPath(unit, startHex, reachNext.hex);
        if(wodHexPathLength(bridgeAlt) > 1) path = bridgeAlt;
    }
    // Same-hex / already-on-tile land orders (formation slots beside a bridge): march
    // straight to the exact pixel — never invent a bridge detour.
    if(path.length <= 1 && (wodUnitPrefersLandOnlyPath(unit) || unit.type==='marine'&&!isWaterHex(reachNext.hex)) && reachNext && startHex &&
        wodHexKeysEqual(startHex, reachNext.hex) && !wodOrderIntoWater(unit, reachNext.hex)) {
        unit._wodRouteUsesBridge = false;
        unit.path = null;
        unit.target = { x: reachNext.exactX, y: reachNext.exactY, pathPrepared: true };
        if(!fromAdvance) {
            unit._routeArrowFrozenPts = wodCleanOrderArrowPolyline([
                { x: unit.x, y: unit.y },
                { x: reachNext.exactX, y: reachNext.exactY }
            ]);
            unit._routeArrowFrozenReady = true;
        }
        return true;
    }
    // A one-cell water route is already reachable. Greedy fallback here
    // sails to a neighbor even when the ship is at its pickup point,
    // stranding the passenger on the beach until the ferry watchdog runs.
    if(path.length <= 1 && startHex && reachNext.hex && wodHexKeysEqual(startHex,reachNext.hex) &&
        (wodIsNavalUnit(unit)||unit.type==='marine'||unit.type==='convoy'&&unit.convoySeaRoute) &&
        wodIsOpenWaterHex(startHex) && wodOpenWaterChordClear(unit,unit.x,unit.y,reachNext.exactX,reachNext.exactY)) {
        unit.path=null;
        unit.target={x:reachNext.exactX,y:reachNext.exactY,pathPrepared:true};
        return true;
    }
    if(path.length <= 1 && unit.type === 'marine' && reachNext.hex && startHex && isWaterHex(startHex) && isWaterHex(reachNext.hex)) {
        let hop = findGreedyWaterStep(unit, reachNext.hex, { fromHex: startHex });
        if(hop) {
            unit.path = null;
            unit.target = {x: hop.x, y: hop.y, pathPrepared: true, marineGreedy: true};
            return true;
        }
    }
    if(path.length <= 1 && wodIsNavalUnit(unit) && reachNext.hex) {
        let hop = findGreedyWaterStep(unit, reachNext.hex);
        if(hop) {
            unit.path = null;
            unit.target = {x: hop.x, y: hop.y, pathPrepared: true, shipGreedy: true};
            return true;
        }
    }
    if(path.length <= 1 && unit.type === 'convoy' && unit.convoySeaRoute && reachNext.hex) {
        let hop = findGreedyWaterStep(unit, reachNext.hex);
        if(hop) {
            unit.path = null;
            unit.target = {x: hop.x, y: hop.y, pathPrepared: true, shipGreedy: true};
            return true;
        }
    }
    if(path.length <= 1 && unit.type === 'convoy' && !unit.convoySeaRoute && reachNext.hex) {
        let hop = findGreedyLandStep(unit, reachNext.hex);
        if(hop) {
            unit.path = null;
            unit.target = {x: hop.x, y: hop.y, pathPrepared: true, convoyGreedy: true};
            return true;
        }
    }
    if(path.length <= 1 && wodUnitPrefersLandOnlyPath(unit) && reachNext.hex) {
        if(startHex && wodIsOpenWaterHex(startHex)) {
            let hop = findGreedyAmphibiousWaterStep(unit, reachNext.hex, { fromHex: startHex });
            if(hop) {
                unit.path = null;
                unit.target = {x: hop.x, y: hop.y, pathPrepared: true, ampGreedy: true};
                unit._wodOrderIntoWater = true;
                return true;
            }
        }
        // Prefer a single portal bridge hop toward the far shore over a land-greedy
        // step that may aim into open water beside the deck.
        if(!wodOrderIntoWater(unit, reachNext.hex) && startHex &&
            !wodHexKeysEqual(startHex, reachNext.hex) &&
            wodMarchBlockedWithoutBridge(unit, startHex, reachNext.hex)) {
            let bridgeAlt = wodTryPortalBridgeMarchPath(unit, startHex, reachNext.hex);
            if(wodHexPathLength(bridgeAlt) > 1) {
                if(wodPathCrossesBridge(bridgeAlt)) unit._wodRouteUsesBridge = true;
                let exactNext = {x: reachNext.exactX, y: reachNext.exactY};
                unit.path = wodHexPathToWorldWaypoints(unit, bridgeAlt, exactNext);
                if(!wodTakeNextPathTarget(unit)) {
                    unit.path = null;
                    unit.target = {x: reachNext.exactX, y: reachNext.exactY, pathPrepared: true};
                }
                if(!fromAdvance) wodSeedOrderArrowCurrentLeg(unit, bridgeAlt);
                return true;
            }
        }
        let hop = findGreedyLandStep(unit, reachNext.hex);
        if(hop) {
            unit.path = null;
            unit.target = {x: hop.x, y: hop.y, pathPrepared: true, landGreedy: true};
            return true;
        }
    }
    if(path.length > 1) {
        if(wodPathCrossesOpenWater(path)) unit._wodOrderIntoWater = true;
        if(wodPathCrossesBridge(path)) unit._wodRouteUsesBridge = true;
        let exactNext = {x: reachNext.exactX, y: reachNext.exactY};
        unit.path = wodHexPathToWorldWaypoints(unit, path, exactNext);
        if(!wodTakeNextPathTarget(unit)) {
            // Ships: never fall through to a straight-line water goal across land.
            if(wodIsNavalUnit(unit) || (unit.type === 'convoy' && unit.convoySeaRoute)) {
                let hop = findGreedyWaterStep(unit, reachNext.hex, { fromHex: startHex });
                if(hop) {
                    unit.path = null;
                    unit.target = { x: hop.x, y: hop.y, pathPrepared: true, shipGreedy: true };
                    return true;
                }
                return false;
            }
            unit.path = null;
            unit.target = {x: reachNext.exactX, y: reachNext.exactY, pathPrepared: true};
        }
        if(!fromAdvance) wodSeedOrderArrowCurrentLeg(unit, path);
        return true;
    }
    if(wodIsNavalUnit(unit) || (unit.type === 'convoy' && unit.convoySeaRoute)) {
        unit._wodPfRelaxUntil = performance.now() + 160;
        let hop = findGreedyWaterStep(unit, reachNext.hex, { fromHex: startHex });
        if(hop) {
            unit.path = null;
            unit.target = { x: hop.x, y: hop.y, pathPrepared: true, shipGreedy: true };
            return true;
        }
        return false;
    }
    if(wodMpIsHumanOwner(unit.owner)) return false;
    unit.path = null;
    unit.target = {x: reachNext.exactX, y: reachNext.exactY, pathPrepared: true};
    return true;
}
function simplifyPathStrokeForOrders(pts) {
    if(!pts || pts.length <= 2) return pts || [];
    let out = [pts[0]];
    let last = pts[0];
    let minStep = gameData.hexRadius * 1.35 * 0.62;
    let min2 = minStep * minStep;
    for(let i = 1; i < pts.length; i++) {
        let p = pts[i];
        let dx = p.x - last.x;
        let dy = p.y - last.y;
        if(dx * dx + dy * dy >= min2) {
            out.push(p);
            last = p;
        }
    }
    let end = pts[pts.length - 1];
    if(out[out.length - 1] !== end) out.push(end);
    return out;
}
function issueStrokeMoveOrder(worldPtsRaw) {
    if(wodCampaignDeployActive()) {
        wodCampaignDeployUnitsAlongStroke(worldPtsRaw);
        return;
    }
    if(gameData.mp && gameData.mp.enabled && !wodMpMatchCanPlay()) return;
    let units = getMovableSelectedUnits();
    if(units.length === 0 || !worldPtsRaw || worldPtsRaw.length < 2) return;
    let strokePts = simplifyPathStrokeForOrders(worldPtsRaw);
    if(strokePts.length < 2) return;
    if(gameData.mp && gameData.mp.enabled && !gameData.mp.isHost) {
        if(wodMpSendCmd({
            kind: 'strokeMove',
            uids: units.map(u => u.uid),
            pts: strokePts.map(p => ({ x: p.x, y: p.y }))
        })) return;
    }
    gameData.playerShiftWaypoints = [];
    let cx = 0;
    let cy = 0;
    for(let u of units) {
        cx += u.x;
        cy += u.y;
    }
    cx /= units.length;
    cy /= units.length;
    let trimR2 = Math.pow(Math.max(20, gameData.hexRadius * 1.45), 2);
    wodApplyPlayerMoveOrders(units, (unit) => {
        // Ocean units stay put when the stroke ends on land (mixed land+ship groups).
        if(wodIsNavalUnit(unit) || (unit.type === 'convoy' && unit.convoySeaRoute)) {
            let end = strokePts[strokePts.length - 1];
            let sea = wodResolveShipMarchHex(unit, end.x, end.y);
            if(!sea) return null;
            let ox = unit.x - cx,
                oy = unit.y - cy;
            let pathPts = [];
            for(let i = 0; i < strokePts.length - 1; i++) {
                let sx = strokePts[i].x + ox,
                    sy = strokePts[i].y + oy;
                if(wodResolveShipMarchHex(unit, sx, sy))
                    pathPts.push({ x: sx, y: sy });
            }
            pathPts.push({ x: sea.exactX, y: sea.exactY });
            return pathPts.length ? pathPts : null;
        }
        let pathPts;
        if(isLandArmyUnit(unit) || wodUnitPrefersLandOnlyPath(unit)) {
            // Collapse formation offset across bridges and snap water samples to deck/shore
            // so drawn strokes funnel across the river instead of swimming in parallel.
            pathPts = wodOffsetStrokePathForLandUnit(unit, strokePts, cx, cy);
        } else {
            let ox = unit.x - cx;
            let oy = unit.y - cy;
            pathPts = [];
            for(let i = 0; i < strokePts.length - 1; i++)
                pathPts.push({x: strokePts[i].x + ox, y: strokePts[i].y + oy});
            let end = strokePts[strokePts.length - 1];
            pathPts.push({x: end.x + ox, y: end.y + oy});
        }
        if(!pathPts || !pathPts.length) return null;
        while(pathPts.length > 1) {
            let p = pathPts[0];
            let dx = p.x - unit.x;
            let dy = p.y - unit.y;
            if(dx * dx + dy * dy < trimR2) pathPts.shift();
            else break;
        }
        return pathPts;
    });
}
function triggerMoraleRout(unit) {
    if(unit.type === 'convoy' || unit.moraleBroken) return;
    unit.moraleBroken = true;
    unit.combatLockTimer = 0;
    unit.fullMarchWaypoints = null;
    unit.marchWpCursor = 0;
    unit.target = null;
    unit.path = null;
    unit.orderTarget = null;
    unit.combatEngaged = false;
    unit.retreating = true;
    unit._wodOrderedRetreat = true;unit._trafficYield=null;unit._moraleSafeSince=null;unit._moraleRetreatAt=-Infinity;unit._moraleRetreatGoal=null;unit._moraleThreatAt=-Infinity;
    wodUpdateUnitMorale(unit,0);
}
function wodMoraleHealingGoal(unit) {
    const sites=[...gameData.cities.filter(c=>wodIsFriendlyOwner(c.owner,unit.owner)&&!isCitySiegeBlockedForProduction(c)),
        ...(gameData.hospitals||[]).filter(h=>wodIsFriendlyOwner(wodEffectiveHospitalOwner(h),unit.owner))];
    const candidates=[],seen=new Set(),naval=wodIsNavalUnit(unit),hr=gameData.hexRadius||20;
    for(const site of sites){
        const town=gameData.cities.includes(site);
        let cells=town?getCityUrbanTerrainHexes(site):getHexesInRadius(site.q,site.r,Math.ceil(wodFortCombatAuraRadiusPx()/(hr*1.35))).map(p=>gameData.hexes[p.q+','+p.r]);
        if(naval&&town)cells=cells.flatMap(h=>getHexesInHexRadius(h.q,h.r,WOD_SHIP_CITY_REPAIR_TILES).slice().map(p=>gameData.hexes[p.q+','+p.r]));
        for(const h of cells){
            if(!h||seen.has(getHexKey(h))||!canUnitEnterHex(unit,h)||naval&&!wodIsOpenWaterHex(h))continue;
            if(!wodUnitHealingSite({...unit,x:h.x,y:h.y},h))continue;
            seen.add(getHexKey(h));candidates.push(h);
        }
    }
    candidates.sort((a,b)=>Math.hypot(a.x-unit.x,a.y-unit.y)-Math.hypot(b.x-unit.x,b.y-unit.y));
    return candidates.slice(0,12).find(h=>wodAiCanReach(unit,h))||null;
}
// The way out of a pocket for a routed unit: the nearest friendly ground that is still supplied, over land it
// can walk. Returns a cell a few steps along that way (or the ground itself), or null when there is none.
function wodRoutedSupplyEscapePoint(unit) {
    const start=getNearestHexToPoint(unit.x,unit.y);
    if(!start||wodIsNavalUnit(unit)||isWaterHex(start)&&!isBridgeHex(start))return null;
    const prev=new Map([[start,null]]),queue=[start];let end=null;
    for(let i=0;i<queue.length&&i<6000;i++){ // (a 2500-cell search reached only about 24 cells out: deeper pockets never found home)
        const h=queue[i];
        if(h!==start&&!isWaterHex(h)&&wodIsFriendlyOwner(h.owner,unit.owner)&&wodCurrentSupplyComponent(h,unit.owner).city){end=h;break;}
        for(const n of getNeighborHexes(h).concat(wodBridgeLinkedHexes(h)||[])){
            if(!n||prev.has(n)||isWaterHex(n)&&!isBridgeHex(n)||!canUnitEnterHex(unit,n)||!wodCanStepBetweenHexes(unit,h,n,true))continue;
            prev.set(n,h);queue.push(n);
        }
    }
    if(!end)return null;
    const path=[];for(let h=end;h;h=prev.get(h))path.push(h);path.reverse();
    return path[Math.min(path.length-1,5)];
}
// A land unit left standing in open water with no order (pushed off the shore in a fight, or a march that ended there)
// wades back to the nearest dry ground after a moment and a half; it used to stay put until it drowned. One the player
// sent into the water on purpose stays where he put it; fighting and boarding units are left to their own logic. A routed
// unit goes too once it stands idle: one that broke while swimming across lost its order a cell or two from the far shore
// and sat in the water, its retreat finding no way, until it drowned.
function wodWadeAshoreIfIdle(unit,dt){
    if(!isLandArmyUnit(unit)||unit.hp<=0||unit.target||unit.orderTarget||unit.boardTransportUid||unit._combatEngaged||unit._wodChoseWater||!wodUnitStandingOnOpenWater(unit)){unit._wodWetIdle=0;return;}
    unit._wodWetIdle=(unit._wodWetIdle||0)+dt;if(unit._wodWetIdle<1.5)return;unit._wodWetIdle=0;
    const shore=wodNearestDryCell(unit);if(shore)assignUnitMoveAlongWaypoints(unit,[{x:shore.x,y:shore.y}],{retainRetreat:true,retainMoraleBroken:!!unit.moraleBroken});
}
/** The nearest cell of dry ground (or a bridge) a land unit in the water can wade to, within ten cells. */
function wodNearestDryCell(unit){
    const start=getNearestHexToPoint(unit.x,unit.y);if(!start)return null;
    const seen=new Set([start]),queue=[{h:start,d:0}];let best=null,bd=Infinity;
    for(let i=0;i<queue.length;i++){const {h,d}=queue[i];
        for(const nb of getNeighborHexes(h)){if(!nb||seen.has(nb))continue;seen.add(nb);
            if(!isWaterHex(nb)||isBridgeHex(nb)){if(canUnitEnterHex(unit,nb)){const dd=Math.hypot(nb.x-unit.x,nb.y-unit.y);if(dd<bd){bd=dd;best=nb;}}}
            else if(d<10&&!best)queue.push({h:nb,d:d+1});}}
    return best;
}
function wodUpdateUnitMorale(unit,dt) {
    if(!unit||unit.hp<=0||unit.type==='convoy'||unit.boardTransportUid)return;
    const now=gameData._aiEconomyClock||0,hr=gameData.hexRadius||20;
    // Cut off from supply (the encircled sign over the unit): troops in a pocket do not get their nerve back.
    const cut=(unit.encircledFlash||0)>0||(unit.outOfSupplySeconds||0)>0;
    unit.maxMorale=WOD_MORALE_MAX*wodGeneralStatMultiplier(unit);
    unit.morale=Math.min(unit.maxMorale,unit.morale??WOD_MORALE_MAX);
    const underFire=now-(unit._moraleLastHitAt??-Infinity)<2;
    if(!unit.moraleBroken&&unit.morale>=unit.maxMorale&&!unit._combatEngaged&&!underFire)return;
    if(!unit.moraleBroken&&(unit._combatEngaged||underFire))unit.morale=Math.max(0,unit.morale-.5*dt);
    if(!unit.moraleBroken&&unit.morale<=WOD_MORALE_ROUT_AT){triggerMoraleRout(unit);return;}
    let chased=false;
    if(unit.moraleBroken){
        if(now-(unit._moraleThreatAt??-Infinity)>=.25||now<unit._moraleThreatAt){
            const test=e=>{if(e!==unit&&e.hp>0&&e.damage>0&&wodIsHostileOwner(e.owner,unit.owner)&&wodOwnerCanSee(unit.owner,e)&&
                Math.hypot(e.x-unit.x,e.y-unit.y)<Math.max(e.range||50,unit.range||50)+hr*3)chased=true;};
            if(gameData.unitSpatialGrid)forEachNearbyUnit(gameData.unitSpatialGrid,unit.x,unit.y,hr*9,test);else gameData.entities.forEach(test);
            unit._moraleThreatAt=now;unit._moraleChased=chased;
        }else chased=!!unit._moraleChased;
        if(chased||underFire)unit._moraleSafeSince=null;else unit._moraleSafeSince??=now;
        // A routed unit keeps losing heart while it is shot at, caught in a fight or chased (twice the rate of a unit
        // still standing), and slowly while it is cut off in a pocket: its bar used to stop at the red where it broke.
        if(unit._combatEngaged||underFire||chased)unit.morale=Math.max(0,unit.morale-dt);
        else if(cut)unit.morale=Math.max(0,unit.morale-.3*dt);
    }
    if(!unit._combatEngaged&&!underFire&&!cut){
        const care=wodUnitHealingSite(unit),rate=care&&canHealUnit(unit)?11:3;
        unit.morale=Math.min(unit.maxMorale,unit.morale+rate*wodGeneralStatMultiplier(unit)*dt);
    }
    if(!unit.moraleBroken)return;
    if(!cut&&unit.morale>=WOD_MORALE_RALLY_AT&&unit._moraleSafeSince!=null&&now-unit._moraleSafeSince>=3){
        unit.moraleBroken=false;unit._moraleRetreatGoal=null;
        const care=wodUnitMissingStrength(unit)&&!wodUnitHealingSite(unit)&&wodMoraleHealingGoal(unit);
        if(care){if(assignUnitMoveAlongWaypoints(unit,[care],{forceRetreat:true}))unit._wodRecoveryRetreat=true;}
        else{unit.target=null;unit.path=null;unit.orderTarget=null;unit.fullMarchWaypoints=null;wodClearRetreatFlags(unit);}
        return;
    }
    if(now-(unit._moraleRetreatAt??-Infinity)<2)return;
    unit._moraleRetreatAt=now;
    // A routed unit in a pocket does not stand and wait to starve: it runs for the nearest supplied ground of its
    // side, a few cells at a time, until it is out (then it can rally and heal as usual).
    if(cut){
        const previous=unit._moraleRetreatGoal,arrived=previous&&Math.hypot(unit.x-previous.x,unit.y-previous.y)<hr*.7;
        if(previous?.escape&&!arrived&&(unit.target||unit.orderTarget)&&(unit.stuckTimer||0)<1.5&&(unit.blockedTimer||0)<1.5)return;
        const way=wodRoutedSupplyEscapePoint(unit);
        if(way&&assignUnitMoveAlongWaypoints(unit,[way],{retainMoraleBroken:true,retainRetreat:true,forceRetreat:true})){
            unit._moraleRetreatGoal={x:way.x,y:way.y,escape:true};return;
        }
    }
    if(!chased&&wodUnitHealingSite(unit)&&canHealUnit(unit)){
        unit.target=null;unit.path=null;unit.orderTarget=null;return;
    }
    // Finish the same short retreat as the manual button. A pursuer
    // authorizes the next bound after arrival, never a new goal mid-leg...
    const previous=unit._moraleRetreatGoal,arrived=previous&&Math.hypot(unit.x-previous.x,unit.y-previous.y)<hr*.7;
    // ...unless the leg is getting nowhere: a unit chased or under fire that has not moved half a cell in four seconds
    // (held by bodies, or stepping to and fro) takes a new one.
    if(!unit._routCheck||Math.hypot(unit.x-unit._routCheck.x,unit.y-unit._routCheck.y)>hr*.5||now<unit._routCheck.at)unit._routCheck={x:unit.x,y:unit.y,at:now};
    const stalled=(chased||underFire)&&now-unit._routCheck.at>=4;
    if(previous&&!arrived&&(unit.target||unit.orderTarget)&&!stalled)return;
    if(previous&&!chased&&!underFire)return;
    if(!previous||chased||underFire){
        // (with enemies on more than one side the careful retreat finds nowhere: wodRoutFallbackGoal)
        const goal=findOrderedRetreatPoint(unit,2)||wodRoutFallbackGoal(unit);
        if(goal&&assignUnitMoveAlongWaypoints(unit,[goal],{retainMoraleBroken:true,retainRetreat:true,forceRetreat:true})){unit._moraleRetreatGoal={x:goal.x,y:goal.y};unit._routCheck={x:unit.x,y:unit.y,at:now};}
    }
}
function preparePathTarget(unit) {
    if(!unit.target || unit.target.pathPrepared || unit.target.detour) return;
    if(wodIsPlayerMarchOrder(unit) && unit.path && unit.path.length > 0) return;
    if(unit._wodPathGiveUpUntil && performance.now() < unit._wodPathGiveUpUntil) {
        unit.target.pathPrepared = true;
        return;
    }
    // After a failed full pathfind, keep hopping greedily for a few tiles instead of
    // re-running a full A* on EVERY hex step — 19 units doing per-hex A* fallbacks
    // produced 80-100ms frames (the worst of the marching stutter).
    if(!wodMpIsHumanOwner(unit.owner) && (unit._wodGreedyStepsLeft || 0) > 0 && unit.orderTarget) {
        unit._wodGreedyStepsLeft--;
        let gtHex = getNearestHexToPoint(unit.orderTarget.x, unit.orderTarget.y);
        if(gtHex) {
            let hop = (unit.type === 'convoy' && unit.convoySeaRoute) || wodIsNavalUnit(unit)
                ? findGreedyWaterStep(unit, gtHex)
                : findGreedyLandStep(unit, gtHex);
            if(hop) {
                unit.target = {x: hop.x, y: hop.y, pathPrepared: true, landGreedy: true};
                return;
            }
        }
        unit._wodGreedyStepsLeft = 0;
    }
    let desired = unit.orderTarget ? {x: unit.orderTarget.x, y: unit.orderTarget.y} : {x: unit.target.x, y: unit.target.y};
    if(unit.orderTarget && unit.orderTarget.isCity) desired.isCity = true;
    let startHex = getNearestWalkableHexForUnit(unit, unit.x, unit.y);
    let targetHex = getNearestHexToPoint(desired.x, desired.y);
    if(unit.type === 'convoy' && unit.convoySeaRoute && desired.isCity) {
        let destCity = findCityNearPointForOwner(desired.x, desired.y, unit.owner);
        let wh = resolveTradeConvoyPathHex(unit, destCity);
        if(wh) targetHex = wh;
    }
    if(wodUnitPrefersLandOnlyPath(unit)) {
        let resolved = wodResolveLandMarchHex(unit, desired.x, desired.y, startHex);
        if(resolved) {
            targetHex = resolved.hex;
            desired = { x: resolved.exactX, y: resolved.exactY, ...(desired.isCity ? { isCity: true } : {}) };
            unit.orderTarget = {
                x: resolved.exactX,
                y: resolved.exactY,
                intoWater: !!resolved.intoWater,
                ...(unit.orderTarget && unit.orderTarget.isCity ? { isCity: true } : {})
            };
            wodSetMarchOrderFlags(unit, resolved);
        } else {
            unit.target = null;
            unit.path = null;
            unit.orderTarget = null;
            unit._wodPathGiveUpUntil = performance.now() + 1200;
            invalidateUnitOrderArrowCache(unit);
            return;
        }
    } else if(!canUseHexForMovement(unit, targetHex)) {
        let reachable = findReachableOrderHex(unit, desired.x, desired.y);
        targetHex = reachable ? reachable.hex : null;
        desired = reachable ? {x: reachable.exactX, y: reachable.exactY, ...(desired.isCity ? {isCity: true} : {})} : desired;
        unit.orderTarget = reachable ? {x: reachable.exactX, y: reachable.exactY, ...(unit.orderTarget && unit.orderTarget.isCity ? {isCity: true} : {})} : unit.orderTarget;
    }
    let path = findPathAroundTerrain(unit, targetHex, startHex, false, 'auto',
        wodMpIsHumanOwner(unit.owner) ||
        !!(wodUnitPrefersLandOnlyPath(unit) && gameData.bridges && gameData.bridges.length));
    // AI (and any land army): rescue bridge crossings when land A* timed out —
    // without this, preparePathTarget falls into greedy shore hops / water.
    if(path.length <= 1 && wodUnitPrefersLandOnlyPath(unit) && targetHex && startHex &&
        !wodOrderIntoWater(unit, targetHex)) {
        let bridgeAlt = wodTryPortalBridgeMarchPath(unit, startHex, targetHex);
        if(wodHexPathLength(bridgeAlt) > 1) path = bridgeAlt;
    }
    if(path.length > 1) {
        unit._wodPathGiveUpUntil = 0;
        if(wodPathCrossesBridge(path)) unit._wodRouteUsesBridge = true;
        if(wodPathCrossesOpenWater(path))unit._wodOrderIntoWater=true;
        let endNode = {x: desired.x, y: desired.y};
        if(desired.isCity) endNode.isCity = true;
        unit.path = wodHexPathToWorldWaypoints(unit, path, endNode);
        if(!wodTakeNextPathTarget(unit)) {
            unit.path = null;
            unit.target = {
                x: desired.x,
                y: desired.y,
                pathPrepared: true,
                ...(desired.isCity ? { isCity: true } : {})
            };
        }
    } else if(targetHex) {
        if(wodMpIsHumanOwner(unit.owner) && unit.orderTarget) {
            wodQueuePlayerMoveOrder(unit, [{ x: unit.orderTarget.x, y: unit.orderTarget.y }]);
            // While the full pathfind retries in the queue, hop greedily around
            // terrain instead of marching a straight line into mountains.
            let waitHop = wodUnitPrefersLandOnlyPath(unit) || unit.type === 'marine'
                ? findGreedyLandStep(unit, targetHex) : null;
            if(waitHop) unit.target = { x: waitHop.x, y: waitHop.y, pathPrepared: true, landGreedy: true };
            else if(unit.target) unit.target.pathPrepared = true;
            else unit.target = { x: unit.orderTarget.x, y: unit.orderTarget.y, pathPrepared: true };
            invalidateUnitOrderArrowCache(unit);
            return;
        }
        let spacing = gameData.hexRadius * 1.35;
        let minChainDist2 = spacing * spacing * 2.8;
        let dxFar = startHex.x - targetHex.x, dyFar = startHex.y - targetHex.y;
        if(unit.type === 'marine' &&
            dxFar * dxFar + dyFar * dyFar > minChainDist2) {
            let maxSteps = 48;
            let chain = buildGreedyLandHexChain(unit, startHex, targetHex, maxSteps);
            if(chain.length > 1) {
                unit.path = chain.slice(1).map(h => ({x: h.x, y: h.y}));
                let endNode = {x: desired.x, y: desired.y};
                if(desired.isCity) endNode.isCity = true;
                unit.path[unit.path.length - 1] = endNode;
                if(!wodTakeNextPathTarget(unit)) {
                    unit.path = null;
                    unit.target = { x: desired.x, y: desired.y, pathPrepared: true, ...(desired.isCity ? { isCity: true } : {}) };
                }
                invalidateUnitOrderArrowCache(unit);
                return;
            }
        }
        if(path.length <= 1 && unit.type === 'marine' && targetHex && startHex && isWaterHex(startHex) && isWaterHex(targetHex)) {
            let hop = findGreedyWaterStep(unit, targetHex, { fromHex: startHex });
            if(hop) {
                unit.path = null;
                unit.target = {x: hop.x, y: hop.y, pathPrepared: true, marineGreedy: true};
                invalidateUnitOrderArrowCache(unit);
                return;
            }
        }
        if(path.length <= 1 && wodIsNavalUnit(unit) && targetHex) {
            let hop = findGreedyWaterStep(unit, targetHex);
            if(hop) {
                unit.path = null;
                unit.target = {x: hop.x, y: hop.y, pathPrepared: true, shipGreedy: true};
                invalidateUnitOrderArrowCache(unit);
                return;
            }
        }
        let greedy = null;
        if(unit.type === 'convoy' && unit.convoySeaRoute) greedy = findGreedyWaterStep(unit, targetHex);
        else if(unit.type === 'convoy' || wodUnitPrefersLandOnlyPath(unit))
            greedy = findGreedyLandStep(unit, targetHex);
        if(greedy) {
            unit.target = {x: greedy.x, y: greedy.y, pathPrepared: true, landGreedy: true};
            unit._wodGreedyStepsLeft = 5;
        } else if(wodUnitPrefersLandOnlyPath(unit)) {
            unit.path = null;
            unit.target = {
                x: desired.x,
                y: desired.y,
                pathPrepared: true,
                ...(desired.isCity ? { isCity: true } : {})
            };
            unit._wodPathGiveUpUntil = performance.now() + 900;
        } else if(unit.type === 'marine') {
            unit.path = null;
            let reach = findReachableOrderHex(unit, desired.x, desired.y);
            if(reach) {
                unit.orderTarget = { x: reach.exactX, y: reach.exactY, ...(desired.isCity ? { isCity: true } : {}) };
                unit.target = { x: reach.exactX, y: reach.exactY, ...(desired.isCity ? { isCity: true } : {}) };
            } else {
                unit.target = { x: desired.x, y: desired.y, ...(desired.isCity ? { isCity: true } : {}) };
            }
        } else if(wodIsNavalUnit(unit) || (unit.type === 'convoy' && unit.convoySeaRoute)) {
            unit.path = null;
            let reach = wodResolveShipMarchHex(unit, desired.x, desired.y);
            if(reach) {
                unit.orderTarget = { x: reach.exactX, y: reach.exactY };
                unit.target = { x: reach.exactX, y: reach.exactY, pathPrepared: true };
            } else {
                unit.target = null;
                unit.orderTarget = null;
            }
        } else {
            let t = {x: desired.x, y: desired.y, pathPrepared: true};
            if(desired.isCity) t.isCity = true;
            unit.target = t;
        }
    } else {
        unit.target = null;
    }
    invalidateUnitOrderArrowCache(unit);
}
function wodHexCellDist(a, b) {
    if(!a || !b) return 0;
    // 8-neighbor axial grid: Chebyshev distance in q/r.
    return Math.max(Math.abs((a.q | 0) - (b.q | 0)), Math.abs((a.r | 0) - (b.r | 0)));
}
function wodNearestHostileLandHex(fromHex, owner, maxR) {
    if(!fromHex) return null;
    maxR = maxR == null ? 28 : maxR;
    let best = null;
    let bestD = Infinity;
    let list = gameData.hexList || [];
    for(let i = 0, n = list.length; i < n; i++) {
        let hex = list[i];
        if(!hex || !isClaimableLand(hex)) continue;
        if(!wodIsHostileOwner(hex.owner, owner)) continue;
        let d = wodHexCellDist(fromHex, hex);
        if(d > maxR || d >= bestD) continue;
        bestD = d;
        best = hex;
    }
    return best;
}
/** Transports and supply ships carry no guns and do not fight: one within reach of an enemy warship's guns runs for safer
 *  water (findNavalRetreatPoint, away from the nearest threats, two to five cells at a time, looked at again each second
 *  while the danger lasts). The computer's vessels run whatever their orders, unless a transport is putting troops ashore
 *  within two cells of its landing; a player's vessel with an order keeps to it. Enemy troops on shore with the vessel in
 *  range send it off only when it has no order. They used to sail up to warships and trade shots with them. */
function wodVesselEvade(unit) {
    if(!unit||(unit.type!=='transport'&&unit.type!=='supply')||unit.hp<=0||unit.boardTransportUid||!gameData.unitSpatialGrid)return;
    const now=gameData._aiEconomyClock||0;
    if(now>=(unit._evadeAt??-Infinity)&&now-(unit._evadeAt??-Infinity)<1)return;
    unit._evadeAt=now;
    const cell=(gameData.hexRadius||20)*1.35,ordered=!!(unit.target||unit.orderTarget),human=wodMpIsHumanOwner(unit.owner);
    let ship=false,shore=false;
    forEachNearbyUnit(gameData.unitSpatialGrid,unit.x,unit.y,cell*10,e=>{
        if(e===unit||e.hp<=0||!(e.damage>0)||e.boardTransportUid||!wodIsHostileOwner(e.owner,unit.owner)||!wodOwnerCanSee(unit.owner,e))return;
        if(Math.hypot(e.x-unit.x,e.y-unit.y)>(e.range||50)*wodGeneralStatMultiplier(e)+cell*1.5)return;
        if(e.type==='ship')ship=true;else shore=true;
    });
    const landing=!!unit.cargo&&!!unit.orderTarget&&Math.hypot(unit.orderTarget.x-unit.x,unit.orderTarget.y-unit.y)<cell*2;
    const flee=ship?(human?!ordered:!landing):shore&&!ordered;
    if(!flee)return;
    // (a leg already running away is kept for three seconds: setting a new one every second restarted the move)
    const leg=unit._evadeLeg;if(leg&&unit.orderTarget&&Math.hypot(unit.orderTarget.x-leg.x,unit.orderTarget.y-leg.y)<1&&now-leg.at<3&&now>=leg.at)return;
    const pt=findNavalRetreatPoint(unit,2);
    if(pt&&assignUnitMoveAlongWaypoints(unit,[pt],{forceRetreat:true})){unit.holding=false;unit._evadeLeg={x:unit.orderTarget?.x??pt.x,y:unit.orderTarget?.y??pt.y,at:now};}
}
function findNavalRetreatPoint(unit,minCells=2) {
    ensureUnitPixelOnWalkableHex(unit,18);
    const start=getNearestHexToPoint(unit.x,unit.y);if(!start||!wodIsOpenWaterHex(start))return null;
    const threats=gameData.entities.filter(u=>u!==unit&&u.hp>0&&wodIsHostileOwner(u.owner,unit.owner)&&wodOwnerCanSee(unit.owner,u)).sort((a,b)=>wodAiDist2(a.x,a.y,unit.x,unit.y)-wodAiDist2(b.x,b.y,unit.x,unit.y));
    let ax=0,ay=0;
    if(threats[0]){ax=unit.x-threats[0].x;ay=unit.y-threats[0].y;}
    else {const port=gameData.cities.filter(c=>wodIsFriendlyOwner(c.owner,unit.owner)&&cityHasWaterNeighbor(c)).sort((a,b)=>wodAiDist2(a.x,a.y,unit.x,unit.y)-wodAiDist2(b.x,b.y,unit.x,unit.y))[0];if(port){ax=port.x-unit.x;ay=port.y-unit.y;}}
    const len=Math.hypot(ax,ay)||1;ax/=len;ay/=len;
    const queue=[{h:start,steps:0}],seen=new Set([getHexKey(start)]);let best=null,bestScore=-Infinity;
    for(let i=0;i<queue.length&&i<240;i++) {
        const {h,steps}=queue[i];
        if(steps>=minCells&&steps<=5&&!isWorldPositionBlockedByUnits(unit,h.x,h.y)) {
            const along=(h.x-unit.x)*ax+(h.y-unit.y)*ay,enemy=threats.slice(0,6).reduce((n,e)=>n+Math.max(0,(e.range||100)+80-Math.hypot(h.x-e.x,h.y-e.y))**2,0);
            const score=along*12-enemy*8-steps*50;if(score>bestScore){bestScore=score;best=h;}
        }
        if(steps>=5)continue;
        for(const d of hexDirections){const h2=wodHexAt(h.q+d.q,h.r+d.r);if(!h2||seen.has(getHexKey(h2))||!wodIsOpenWaterHex(h2)||!wodCanStepBetweenHexes(unit,h,h2,true))continue;seen.add(getHexKey(h2));queue.push({h:h2,steps:steps+1});}
    }
    return best?{x:best.x,y:best.y}:null;
}
// (leg: the how-manyth pullback of one retreat order; see wodContinueRetreatUnderPursuit)
function wodRetreatUnit(unit, leg) {
    if(!unit||unit.hp<=0||unit.id||unit.type==='convoy'||unit.moraleBroken)return false;
    const pt=findOrderedRetreatPoint(unit,2);if(!pt)return false;
    const ok=assignUnitMoveAlongWaypoints(unit,[pt],{forceRetreat:true});if(ok){unit.retreating=true;unit._wodOrderedRetreat=true;unit.holding=false;unit._wodRetreatLeg=leg||1;}return ok;
}
/** A retreat the player ordered is a short pullback (findOrderedRetreatPoint: a few cells off the front). Where the enemy
 *  followed, the unit stopped there with him on its heels and was shot at where it stood: now, arriving with a visible
 *  enemy within two and a half cells of its reach that is after it or coming at it, it pulls back again, up to three
 *  legs in all. */
const WOD_RETREAT_MAX_LEGS = 3;
function wodContinueRetreatUnderPursuit(unit) {
    if(!unit||!unit._wodOrderedRetreat||unit.moraleBroken||!wodMpIsHumanOwner(unit.owner)||wodIsNavalUnit(unit))return false;
    const leg=unit._wodRetreatLeg||1;if(leg>=WOD_RETREAT_MAX_LEGS)return false;
    const hr=gameData.hexRadius||20,now=gameData._aiEconomyClock||0;
    // pursued: a visible enemy within two and a half cells of reach that is after this unit, or coming at it (an enemy
    // standing its ground nearby, a guard at a pass, does not keep the retreat going)
    const closing=e=>e._wodAttackOrder?.uid===unit.uid||e.preferredTargetUid===unit.uid||
        e._wodVelocityAt!=null&&now-e._wodVelocityAt<.5&&Math.hypot(e._wodVelocityX||0,e._wodVelocityY||0)>1&&
        ((e._wodVelocityX||0)*(unit.x-e.x)+(e._wodVelocityY||0)*(unit.y-e.y))>0;
    const pursued=gameData.entities.some(e=>e!==unit&&e.hp>0&&e.damage>0&&!e.boardTransportUid&&!wodIsNavalUnit(e)&&wodIsHostileOwner(e.owner,unit.owner)&&
        wodOwnerCanSee(unit.owner,e)&&Math.hypot(e.x-unit.x,e.y-unit.y)<Math.max(e.range||50,unit.range||50)+hr*1.35*2.5&&closing(e));
    return pursued&&wodRetreatUnit(unit,leg+1);
}
/** A bounded native-grid A*: trade travel time against visible enemy fire,
 * while treating bodies and bridge portals as physical obstacles. */
function wodRetreatShortcutSafe(unit,p) {
    const dx=p.x-unit.x,dy=p.y-unit.y,len2=dx*dx+dy*dy,hr=gameData.hexRadius||20;
    for(const e of gameData.entities){
        if(e===unit||e.hp<=0||!(e.damage>0)||e.boardTransportUid||!wodIsHostileOwner(e.owner,unit.owner)||!wodOwnerCanSee(unit.owner,e))continue;
        const from=Math.hypot(e.x-unit.x,e.y-unit.y),to=Math.hypot(e.x-p.x,e.y-p.y);
        if(from>Math.sqrt(len2)+(e.range||80)+hr*2)continue;
        const t=Math.max(0,Math.min(1,((e.x-unit.x)*dx+(e.y-unit.y)*dy)/(len2||1))),near=Math.hypot(unit.x+dx*t-e.x,unit.y+dy*t-e.y);
        if(near<Math.min(from,(unit.radius||12)+(e.radius||12)+2)-.5||near<Math.min(from,to)-hr*.2)return false;
    }
    return true;
}
function wodRetreatThreatSignature(unit,goal=unit.orderTarget) {
    if(!goal)return '';
    const hr=gameData.hexRadius||20,reach=Math.hypot(goal.x-unit.x,goal.y-unit.y)+hr*10,keys=[];
    for(const e of gameData.entities)if(e!==unit&&e.hp>0&&e.damage>0&&!e.boardTransportUid&&
        wodIsHostileOwner(e.owner,unit.owner)&&Math.hypot(e.x-unit.x,e.y-unit.y)<reach&&wodOwnerCanSee(unit.owner,e))
        keys.push((e.uid||e.owner+':'+e.type)+':'+Math.round(e.x/(hr*.5))+','+Math.round(e.y/(hr*.5)));
    return keys.sort().join('|');
}
function wodFindSafeRetreatPath(unit,goal) {
    if(!goal||!unit||wodIsNavalUnit(unit)||unit.type==='convoy')return null;
    const hr=gameData.hexRadius||20,sp=hr*1.35,start=getNearestWalkableHexForUnit(unit,unit.x,unit.y);
    if(!start)return [];
    const enemies=gameData.entities.filter(e=>e!==unit&&e.hp>0&&e.damage>0&&!e.boardTransportUid&&wodIsHostileOwner(e.owner,unit.owner)&&wodOwnerCanSee(unit.owner,e)&&
        Math.hypot(e.x-unit.x,e.y-unit.y)<Math.hypot(goal.x-unit.x,goal.y-unit.y)+hr*10)
        .map(e=>({x:e.x,y:e.y,range:(e.range||50)*wodGeneralStatMultiplier(e),body:(e.radius||12)+(unit.radius||12)+2,power:Math.max(.25,(e.damage||1)/(e.attackCooldown||2)/4)}));
    if(!enemies.length)return null;
    const waterStart=wodUnitStandingOnOpenWater(unit)||unit.type==='marine'&&isWaterHex(start),allowWater=waterStart||unit.type==='marine';
    const points=new Map(),risk=new Map(),key=getHexKey;
    const point=h=>{let p=points.get(key(h));if(!p){p=h===start?{x:unit.x,y:unit.y}:isBridgeHex(h)?wodBridgeDeckPointForHex(h,bridgeAtHex(h),null,null):h;points.set(key(h),p);}return p;};
    const danger=p=>enemies.reduce((sum,e)=>sum+e.power*Math.max(0,(e.range+hr*2-Math.hypot(p.x-e.x,p.y-e.y))/(hr*2))**2,0);
    const riskAt=h=>{const k=key(h);if(!risk.has(k))risk.set(k,danger(point(h)));return risk.get(k);};
    const edge=(a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);let exposure=0;
        for(const e of enemies){const t=Math.max(0,Math.min(1,((e.x-a.x)*dx+(e.y-a.y)*dy)/(len*len||1))),d=Math.hypot(a.x+dx*t-e.x,a.y+dy*t-e.y);
            if(d<Math.min(e.body,Math.hypot(unit.x-e.x,unit.y-e.y))-.5)return null;
            exposure+=e.power*Math.max(0,(e.range+hr*2-d)/(hr*2))**2;
        }return{len,exposure};};
    const heap=[],cost=new Map([[key(start),0]]),parents=new Map(),closed=new Set();
    const push=(h,g)=>{const v={h,g,f:g+Math.hypot(h.x-goal.x,h.y-goal.y)/sp};let i=heap.length;heap.push(v);while(i){const p=(i-1)>>1;if(heap[p].f<=v.f)break;heap[i]=heap[p];i=p;}heap[i]=v;};
    const pop=()=>{const out=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=last.f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return out;};
    push(start,0);
    const minQ=Math.min(start.q,goal.q)-6,maxQ=Math.max(start.q,goal.q)+6,minR=Math.min(start.r,goal.r)-6,maxR=Math.max(start.r,goal.r)+6;
    while(heap.length&&closed.size<3000){
        const {h,g}=pop(),k=key(h);if(closed.has(k))continue;closed.add(k);
        if(k===key(goal)){const path=[h];let cur=h;while(parents.has(key(cur))){cur=parents.get(key(cur));path.push(cur);}return path.reverse();}
        const neighbors=getNeighborHexes(h).slice();wodForEachBridgePathPortal(unit,h,n=>neighbors.push(n));
        for(const n of neighbors){const nk=key(n);if(closed.has(nk)||n.q<minQ||n.q>maxQ||n.r<minR||n.r>maxR||!wodPathTileWalkable(unit,n,allowWater)||!wodCanStepBetweenHexes(unit,h,n,!allowWater))continue;
            if(waterStart&&!isWaterHex(h)&&isWaterHex(n)&&!isBridgeHex(n)&&unit.type!=='marine')continue;
            const leg=edge(point(h),point(n));if(!leg)continue;
            const terrain=n.type==='swamp'?1.7:n.type==='forest'||n.type==='hill'?1.3:1;
            const cover=Math.max(.25,getTerrainDefenseModifier(unit,n));
            const next=g+leg.len/sp*(terrain+12*Math.max((riskAt(h)+riskAt(n))*.5,leg.exposure)*cover);
            if(next>=(cost.get(nk)??Infinity))continue;cost.set(nk,next);parents.set(nk,h);push(n,next);
        }
    }
    return [];
}
function wodFindEmergencyRetreatPoint(unit,minCells=2) {
    const start=getNearestHexToPoint(unit.x,unit.y);if(!start)return null;
    const waterStart=isWaterHex(start)&&!wodUnitOnBridgeDeck(unit),hr=gameData.hexRadius||20;
    const foreignStart=!isWaterHex(start)&&!wodIsFriendlyOwner(start.owner,unit.owner);
    const threats=gameData.entities.filter(e=>e!==unit&&e.hp>0&&e.damage>0&&!e.boardTransportUid&&wodIsHostileOwner(e.owner,unit.owner)&&wodOwnerCanSee(unit.owner,e)&&Math.hypot(e.x-unit.x,e.y-unit.y)<hr*14);
    const reservations=gameData.entities.filter(e=>e!==unit&&e.hp>0&&wodIsFriendlyOwner(e.owner,unit.owner)&&e.retreating&&e.orderTarget);
    const clearance=h=>threats.reduce((d,e)=>Math.min(d,Math.hypot(h.x-e.x,h.y-e.y)),Infinity),initial=clearance(unit);
    const point=h=>h===start?unit:isBridgeHex(h)?wodBridgeDeckPointForHex(h,bridgeAtHex(h),null,null):h;
    const safeLeg=(a,b)=>!threats.some(e=>{
        const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((e.x-a.x)*dx+(e.y-a.y)*dy)/(dx*dx+dy*dy||1)));
        const danger=(e.range||50)*wodGeneralStatMultiplier(e)+hr*2;
        return Math.hypot(a.x+dx*t-e.x,a.y+dy*t-e.y)<Math.min(Math.hypot(unit.x-e.x,unit.y-e.y),danger)-hr*.25;
    });
    const queue=[{h:start,steps:0}],seen=new Set([getHexKey(start)]),limit=waterStart?14:4;
    let pick=null,best=-Infinity;
    for(let i=0;i<queue.length&&i<1800;i++) {
        const {h,steps}=queue[i];
        const spot=point(h);
        const reserved=reservations.some(e=>
            Math.hypot(e.orderTarget.x-spot.x,e.orderTarget.y-spot.y)<(e.radius||12)+(unit.radius||12)+2);
        if(steps>0&&(!isWaterHex(h)&&wodIsFriendlyOwner(h.owner,unit.owner)||isBridgeHex(h))&&!reserved&&!isWorldPositionBlockedByUnits(unit,spot.x,spot.y)) {
            const gain=clearance(spot)-initial,travel=Math.hypot(spot.x-unit.x,spot.y-unit.y);
            if(travel>=hr*.65&&(!threats.length||gain>hr*.3)) {
                const score=(threats.length?Math.min(gain,hr*4)*40:0)-steps*400-(steps<minCells?5000:0)-
                    (wodPointOnBridgeForUnit(unit,spot.x,spot.y,1.05)?6000:0);
                if(score>best){best=score;pick=spot;}
            }
        }
        if(steps>=limit)continue;
        const neighbors=getNeighborHexes(h).concat(wodBridgeLinkedHexes(h)||[]);
        for(const n of neighbors) {
            if(!n||seen.has(getHexKey(n))||!canUnitEnterHex(unit,n))continue;
            // Every leg must escape actual visible troops. A political
            // frontier behind the unit must not send it into the enemy
            // standing at the other bridge exit.
            if(threats.some(e=>Math.hypot(n.x-e.x,n.y-e.y)<Math.min(Math.hypot(unit.x-e.x,unit.y-e.y),(e.range||50)*wodGeneralStatMultiplier(e)+hr*2)-hr*.35))continue;
            if(!safeLeg(spot,point(n)))continue;
            const wet=isWaterHex(n)&&!isBridgeHex(n);
            if(wet?!waterStart||!isWaterHex(h):!isBridgeHex(n)&&!wodIsFriendlyOwner(n.owner,unit.owner)&&
                (!foreignStart||wodIsFriendlyOwner(h.owner,unit.owner)))continue;
            if(!wodCanStepBetweenHexes(unit,h,n,!waterStart))continue;
            seen.add(getHexKey(n));queue.push({h:n,steps:steps+1});
        }
    }
    return pick?{x:pick.x,y:pick.y}:null;
}
/** Where a routed unit runs when the careful retreat finds nowhere (wodFindEmergencyRetreatPoint wants a cell that takes
 *  it farther from every enemy, and with enemies on more than one side there is none): the friendly cell within four
 *  steps farthest from the enemy, if that gains at least a third of a cell; else its nearest town or hospital it can
 *  reach; else any friendly cell within four steps away from the enemy's middle. Without it the unit stood where it
 *  broke, flashing, until it was shot to pieces. */
function wodRoutFallbackGoal(unit) {
    const start=getNearestHexToPoint(unit.x,unit.y);if(!start||wodIsNavalUnit(unit))return null;
    const hr=gameData.hexRadius||20;
    const threats=gameData.entities.filter(e=>e!==unit&&e.hp>0&&e.damage>0&&!e.boardTransportUid&&wodIsHostileOwner(e.owner,unit.owner)&&wodOwnerCanSee(unit.owner,e)&&Math.hypot(e.x-unit.x,e.y-unit.y)<hr*14);
    const clearance=p=>threats.reduce((d,e)=>Math.min(d,Math.hypot(p.x-e.x,p.y-e.y)),Infinity),initial=clearance(unit);
    let cx=0,cy=0;for(const e of threats){cx+=e.x;cy+=e.y;}if(threats.length){cx/=threats.length;cy/=threats.length;}
    const queue=[{h:start,steps:0}],seen=new Set([getHexKey(start)]),cells=[];
    for(let i=0;i<queue.length&&i<600;i++){const {h,steps}=queue[i];
        if(steps>0&&!isWaterHex(h)&&wodIsFriendlyOwner(h.owner,unit.owner)&&!isWorldPositionBlockedByUnits(unit,h.x,h.y))cells.push(h);
        if(steps>=4)continue;
        for(const n of getNeighborHexes(h).concat(wodBridgeLinkedHexes(h)||[])){
            if(!n||seen.has(getHexKey(n))||!canUnitEnterHex(unit,n)||isWaterHex(n)&&!isBridgeHex(n)||!wodCanStepBetweenHexes(unit,h,n,true))continue;
            seen.add(getHexKey(n));queue.push({h:n,steps:steps+1});
        }
    }
    let best=null,bc=-Infinity;for(const h of cells){const c=clearance(h);if(c>bc){bc=c;best=h;}}
    if(best&&bc>=initial+hr*.3&&Math.hypot(best.x-unit.x,best.y-unit.y)>=hr*.65)return {x:best.x,y:best.y};
    const home=wodMoraleHealingGoal(unit);
    if(home&&Math.hypot(home.x-unit.x,home.y-unit.y)>=hr*1.5)return {x:home.x,y:home.y};
    if(threats.length){
        let pick=null,bs=-Infinity;
        for(const h of cells){const s=(h.x-unit.x)*(unit.x-cx)+(h.y-unit.y)*(unit.y-cy);if(s>bs){bs=s;pick=h;}}
        if(pick&&bs>0)return {x:pick.x,y:pick.y};
    }
    return null;
}
function findOrderedRetreatPoint(unit, minCells) {
    if(wodIsNavalUnit(unit))return findNavalRetreatPoint(unit,minCells);
    // Slight pullback only — a few cells off the front, not a deep rear march.
    minCells = Math.max(1, Math.min(3, minCells | 0));
    let maxCells = Math.max(minCells, 4);
    let maxDepthGain = 2;
    let start = getNearestHexToPoint(unit.x, unit.y);
    if(!start) return null;
    let owner = unit.owner;
    const threatened=gameData.entities.some(e=>e!==unit&&e.hp>0&&e.damage>0&&!e.boardTransportUid&&
        wodIsHostileOwner(e.owner,owner)&&wodOwnerCanSee(owner,e)&&Math.hypot(e.x-unit.x,e.y-unit.y)<(gameData.hexRadius||20)*10);
    if(threatened||wodUnitOnBridgeDeck(unit)){
        const escape=wodFindEmergencyRetreatPoint(unit,minCells);
        if(escape)return escape;
        if(threatened)return null;
    }
    if(wodUnitStandingOnOpenWater(unit)||start.owner!==owner&&!wodUnitOnBridgeDeck(unit))
        return wodFindEmergencyRetreatPoint(unit,minCells);
    // If standing on non-owned ground, snap retreat search to nearest owned land first.
    if(start.owner !== owner || !canUnitEnterHex(unit, start)) {
        let nearestOwn = findNearestOwnedHex(owner, unit.x, unit.y, true);
        if(!nearestOwn) return null;
        start = nearestOwn;
    }
    let hostile = wodNearestHostileLandHex(start, owner, 48);
    let startDepth = hostile ? wodHexCellDist(start, hostile) : 0;

    // Away vector: from nearest enemy land (preferred), else enemy units, else owned centroid.
    let awayX = 0, awayY = 0;
    if(hostile) {
        awayX = start.x - hostile.x;
        awayY = start.y - hostile.y;
    } else {
        let enemyPullX = 0, enemyPullY = 0, enemyN = 0;
        let pullR = (gameData.hexRadius || 20) * 14;
        if(gameData.unitSpatialGrid) {
            forEachNearbyUnit(gameData.unitSpatialGrid, unit.x, unit.y, pullR, (other) => {
                if(!other || other === unit || !wodIsHostileOwner(other.owner, owner) || other.type === 'convoy' || other.hp <= 0 || !wodOwnerCanSee(unit.owner,other)) return;
                enemyPullX += other.x;
                enemyPullY += other.y;
                enemyN++;
            });
        }
        if(enemyN > 0) {
            awayX = unit.x - enemyPullX / enemyN;
            awayY = unit.y - enemyPullY / enemyN;
        }
    }
    let awayLen = Math.hypot(awayX, awayY);
    if(awayLen < 0.001) {
        let ox = 0, oy = 0, on = 0;
        for(let hex of gameData.hexList || []) {
            if(!hex || hex.owner !== owner || !isClaimableLand(hex)) continue;
            ox += hex.x; oy += hex.y; on++;
        }
        if(on > 0) {
            awayX = ox / on - unit.x;
            awayY = oy / on - unit.y;
            awayLen = Math.hypot(awayX, awayY);
        }
    }
    if(awayLen < 0.001) return wodFindEmergencyRetreatPoint(unit,minCells);
    awayX /= awayLen;
    awayY /= awayLen;

    // BFS only through owned enterable land so retreat never enters enemy / neutral ground.
    let best = null;
    let bestScore = -Infinity;
    let soft = null;
    let softScore = -Infinity;
    let seen = new Set();
    let queue = [{ hex: start, steps: 0 }];
    seen.add(`${start.q},${start.r}`);
    let maxSteps = maxCells + 2;
    let hr = gameData.hexRadius || 20;
    let minAlong = hr * 0.55;
    while(queue.length) {
        let cur = queue.shift();
        let hex = cur.hex;
        let steps = cur.steps;
        if(steps >= minCells && steps <= maxCells) {
            let depth = hostile ? wodHexCellDist(hex, hostile) : (startDepth + steps);
            let depthGain = depth - startDepth;
            // Slightly deeper into friendly land — never closer to enemy, never a long rear dash.
            let deeperOk = hostile ? (depthGain >= 1 && depthGain <= maxDepthGain) : true;
            if(deeperOk) {
                let dx = hex.x - unit.x;
                let dy = hex.y - unit.y;
                let along = dx * awayX + dy * awayY;
                // Must move away from the enemy front — never toward it.
                if(along >= minAlong) {
                    let front = isFrontlineHex(hex, owner);
                    let enemyNearby = countNearbyUnits(owner, hex.x, hex.y, 140, true);
                    // Prefer the nearest valid pullback (short steps, small depth gain).
                    let score = along * 40
                        - steps * 120000
                        - Math.abs(depthGain - 1) * 80000
                        - enemyNearby * 100000
                        - (front ? 200000 : 0);
                    if(unit.type !== 'heavy') {
                        if(hex.type === 'forest' || hex.type === 'hill') score += 12000;
                        else if(hex.type === 'urban') score += 8000;
                    } else if(hex.type === 'urban') score += 5000;
                    if(!front && enemyNearby === 0 && score > bestScore) {
                        bestScore = score;
                        best = hex;
                    }
                    if(!front && score > softScore) {
                        softScore = score;
                        soft = hex;
                    }
                }
            }
        }
        if(steps >= maxSteps) continue;
        for(let di = 0; di < hexDirections.length; di++) {
            let dir = hexDirections[di];
            let nHex = wodHexAt(hex.q + dir.q,hex.r + dir.r);
            // Owned land only — never step onto enemy or neutral tiles.
            if(!nHex || nHex.owner !== owner || !canUnitEnterHex(unit, nHex) || !wodCanStepBetweenHexes(unit,hex,nHex,true)) continue;
            let key = `${nHex.q},${nHex.r}`;
            if(seen.has(key)) continue;
            seen.add(key);
            queue.push({ hex: nHex, steps: steps + 1 });
        }
    }
    let pick = best || soft;
    if(!pick) return wodFindEmergencyRetreatPoint(unit,minCells);
    // Final safety: never accept a destination closer to enemy land than the start.
    if(hostile) {
        let d = wodHexCellDist(pick, hostile);
        if(d <= startDepth || d > startDepth + maxDepthGain) return null;
    }
    let pdx = pick.x - unit.x, pdy = pick.y - unit.y;
    if(pdx * awayX + pdy * awayY < minAlong * 0.45) return null;
    if(wodHexCellDist(start, pick) > maxCells) return null;
    return { x: pick.x, y: pick.y };
}
function wodIssueRetreatOrder() {
    if(gameState !== 'PLAYING') return 0;
    let lo = typeof wodLocalPlayerOwner === 'function' ? wodLocalPlayerOwner() : 1;
    let sel = (gameData && gameData.selection) ? gameData.selection : [];
    let n = 0;
    for(let i = 0; i < sel.length; i++) {
        let unit = sel[i];
        if(!unit || unit.id || unit.type === 'convoy' || unit.hp <= 0) continue;
        if(unit.owner !== lo) continue;
        if(unit.moraleBroken) continue;
        if(gameData.mp?.enabled&&!gameData.mp.isHost) {if(wodMpSendCmd({kind:'retreat',uids:[ensureUnitId(unit)]}))n++;}
        else if(wodRetreatUnit(unit))n++;
    }
    if(n > 0) {
        if(typeof setMobileOrderMode === 'function') setMobileOrderMode(null);
        if(typeof wodOpenInfoOverviewPage === 'function') wodOpenInfoOverviewPage();
        _infoCardUiThrottle.s = null;
        if(typeof syncInfoCardPanel === 'function') syncInfoCardPanel();
    }
    return n;
}
/** Stop (the unit card's Stop button, or H): the unit drops its march, waypoints and attack order and holds where it
 *  stands, still firing at enemies in reach. A routed unit keeps running until it rallies. */
function wodStopUnit(unit) {
    if(!unit || unit.hp <= 0 || unit.moraleBroken || unit.type === 'convoy' || unit.id) return false;
    wodPlayerOrderQueue = wodPlayerOrderQueue.filter(j => j.unit !== unit);
    wodClearUnitOrdersInstant(unit);
    unit._wodAttackOrder = null; unit._wodAttackApproaching = false; unit.preferredTargetUid = null;
    unit._wodOrderedRetreat = false; unit._wodRiskRetreat = false;
    unit._routeArrowFrozenPts = null; unit._routeArrowFrozenReady = false;
    unit.holding = true;
    return true;
}
function wodIssueStopOrder() {
    if(gameState !== 'PLAYING') return 0;
    const lo = wodLocalPlayerOwner(), units = (gameData.selection || []).filter(u => u && !u.id && u.owner === lo && u.hp > 0 && u.type !== 'convoy' && !u.moraleBroken);
    if(!units.length) return 0;
    let n = 0;
    if(gameData.mp?.enabled && !gameData.mp.isHost) { if(wodMpSendCmd({ kind: 'stop', uids: units.map(u => ensureUnitId(u)) })) n = units.length; }
    else for(const u of units) if(wodStopUnit(u)) n++;
    if(n > 0) {
        gameData.playerShiftWaypoints = [];
        if(typeof setMobileOrderMode === 'function') setMobileOrderMode(null);
        _infoCardUiThrottle.s = null;
        if(typeof syncInfoCardPanel === 'function') syncInfoCardPanel();
    }
    return n;
}
/** Last resort for a march that terrain has held on one spot for seconds, after route
 *  repair, replanning and detours have all failed to free it: put the unit back in the
 *  middle of the nearest cell it may stand on and plan again from there. Called only on
 *  ticks in which terrain (not traffic) stopped the step; returns true when it acted. */
function wodTerrainWedgeWatch(unit,dt) {
    if(wodIsNavalUnit(unit)||unit.type==='convoy'||unit._wodOrderIntoWater||unit._wodRouteUsesBridge)return false;
    const hr=gameData.hexRadius||20,now=gameData._aiEconomyClock||0;
    // The count restarts when the unit has got half a cell radius away, or was free of
    // the terrain for a while in between.
    if(unit._wodWedgeT==null||now-unit._wodWedgeAt>1.5||Math.hypot(unit.x-unit._wodWedgeX,unit.y-unit._wodWedgeY)>hr*.5){
        unit._wodWedgeX=unit.x;unit._wodWedgeY=unit.y;unit._wodWedgeT=0;unit._wodWedgeAt=now;return false;
    }
    unit._wodWedgeAt=now;
    if((unit._wodWedgeT+=dt)<2.5)return false;
    unit._wodWedgeT=null;
    const home=getNearestWalkableHexForUnit(unit,unit.x,unit.y,3);
    if(!home||isWaterHex(home)||isBridgeHex(home))return false;
    // The cell itself, or failing that a free neighbouring one it could step to.
    let spot=null;
    for(const h of [home,...getNeighborHexes(home).filter(n=>!isWaterHex(n)&&!isBridgeHex(n)&&wodCanStepBetweenHexes(unit,home,n,true))
        .sort((a,b)=>Math.hypot(a.x-unit.x,a.y-unit.y)-Math.hypot(b.x-unit.x,b.y-unit.y))])
        if(!isWorldPositionBlockedByUnits(unit,h.x,h.y)){spot=h;break;}
    if(spot){unit.x=spot.x;unit.y=spot.y;}
    unit.blockedTimer=0;unit.stuckTimer=0;unit._wodTerrainStallT=0;unit._wodTerrainRepairCooldown=0;
    if(!replanUnitOrder(unit)){
        if(unit.fullMarchWaypoints?.length)assignUnitMoveAlongWaypoints(unit,unit.fullMarchWaypoints,{fromLegAdvance:true,retainRetreat:true});
        else{
            const goal=unit.orderTarget||unit.target?.finalTarget||unit.target;
            unit.path=null;if(goal)unit.target={x:goal.x,y:goal.y,pathPrepared:false};
        }
    }
    invalidateUnitOrderArrowCache(unit);
    return true;
}
/** Rejoin a legal tile-center route after separation nudges a marcher against a wall. */
function wodRepairTerrainMarch(unit) {
    if(!unit.target||wodIsNavalUnit(unit)||unit.type==='convoy'||unit._wodOrderIntoWater||
        unit._wodRouteUsesBridge||(unit._wodTerrainRepairCooldown||0)>0||!wodCanSpendPf())return false;
    let start=getNearestHexToPoint(unit.x,unit.y);const goal=getNearestHexToPoint(unit.target.x,unit.target.y);
    // In the corner of a diagonal pass the nearest cell by rounding is one of the two
    // peaks (or the water) beside it. The unit is standing in the pass, so the route
    // starts from its pass cell.
    if(start&&(start.type==='mountain'&&!wodCanClimb(unit)||isWaterHex(start)))start=wodDiagonalLandLinkAtPoint(unit,unit.x,unit.y)||start;
    if(!start||!goal||isWaterHex(start)||isWaterHex(goal)||start.type==='mountain'||goal.type==='mountain')return false;
    unit._wodTerrainRepairCooldown=.65;
    const path=findPathAroundTerrain(unit,goal,start,true,'land',false);
    if(path.length<2)return false;
    const points=[{x:unit.x,y:unit.y},...path.map(h=>({x:h.x,y:h.y,pathPrepared:true}))];
    if(wodCorridorHasBlockedChord(unit,points))return false;
    const tail=unit.path||[];
    unit.path=points.slice(1).concat(tail);
    if(!wodTakeNextPathTarget(unit))return false;
    unit._wodTerrainStallT=0;unit.blockedTimer=0;unit.stuckTimer=0;
    invalidateUnitOrderArrowCache(unit);return true;
}
// A comrade with no orders of his own standing in this unit's road (within two and a half cells straight ahead, toward
// its next point) while the unit still has more than three and a half cells to go.
function wodParkedComradeAhead(unit) {
    const sp=(gameData.hexRadius||20)*1.35,goal=unit.orderTarget,t=unit.target;if(!goal||!t)return false;
    if(Math.hypot(goal.x-unit.x,goal.y-unit.y)<=sp*3.5)return false;
    const dx=t.x-unit.x,dy=t.y-unit.y,len=Math.hypot(dx,dy);if(len<1)return false;const ux=dx/len,uy=dy/len;let found=false;
    forEachNearbyUnit(gameData.unitSpatialGrid,unit.x,unit.y,sp*3,v=>{
        if(found||v===unit||v.hp<=0||v.type==='convoy'||v.target||v._trafficYield||v.boardTransportUid||!wodIsFriendlyOwner(v.owner,unit.owner)||!wodBodiesMeet(unit,v))return;
        const ox=v.x-unit.x,oy=v.y-unit.y,f=ox*ux+oy*uy,l=Math.abs(oy*ux-ox*uy);
        if(f>0&&f<sp*2.5&&l<(v.radius||12)+(unit.radius||12)+3)found=true;
    });
    return found;
}
function moveUnitTowardTarget(unit,dt) {
    const beforeX=unit.x,beforeY=unit.y;
    try {
    wodResumeTrafficYield(unit);
    if(unit.target&&!unit._trafficYield){
        const key=unit.target.x.toFixed(1)+','+unit.target.y.toFixed(1),distance=Math.hypot(unit.x-unit.target.x,unit.y-unit.target.y),now=gameData._aiEconomyClock||0;
        let progress=unit._wodTrafficProgress;
        if(!progress||progress.key!==key||distance<progress.distance-2)unit._wodTrafficProgress={key,distance,at:now};
        else if(now-progress.at>2){
            // A unit can orbit a parked formation without ever setting
            // the zero-motion blocked timer. Yield only after that local
            // avoidance has failed to make forward progress.
            if(wodYieldFriendlyTraffic(unit))unit._wodTrafficProgress=null;
            // A player's march held up by a comrade parked in its road who has nowhere to step to (on a shore, or in a
            // town by the sea, the free cells all lie behind him) waited there for good, jostling on the spot: after
            // three seconds without headway it walks round him, as a retreat does (wodRetreatGoRound). Not within three
            // and a half cells of where it is going: there a group is settling into its places, and waits for them.
            else if(now-progress.at>3&&!unit.target.goRound&&wodIsPlayerMarchOrder(unit)&&!unit._wodRiskRetreat&&!unit.retreating&&
                !unit.moraleBroken&&!((unit._wodGoRoundAt||0)>now-3)&&wodParkedComradeAhead(unit)&&wodRetreatGoRound(unit)){unit._wodGoRoundAt=now;unit._wodTrafficProgress=null;}
        }
    }
    const yieldOrder=unit._trafficYield;
    if(!yieldOrder||!yieldOrder.route)return wodMoveUnitAlongRoute(unit,dt);
    if(!yieldOrder.route?.target)return;
    // The private avoidance route may change; the issued destination, all
    // waypoint legs and their arrow remain the issued command throughout.
    const command=wodCaptureTrafficOrder(unit);
    Object.assign(unit,yieldOrder.route);unit._trafficMoving=true;
    try {wodMoveUnitAlongRoute(unit,dt);}
    finally {yieldOrder.route=wodCaptureTrafficOrder(unit);Object.assign(unit,command);unit._trafficMoving=false;}
    } finally {
        const vx=(unit.x-beforeX)/Math.max(.001,dt),vy=(unit.y-beforeY)/Math.max(.001,dt),length=Math.hypot(vx,vy),cap=(unit.speed||15)*WOD_MOVE_SPEED_FACTOR*2;
        unit._wodVelocityX=vx*Math.min(1,cap/Math.max(.001,length));unit._wodVelocityY=vy*Math.min(1,cap/Math.max(.001,length));unit._wodVelocityAt=gameData._aiEconomyClock||0;
    }
}
function wodAiRoutePointWet(unit,p) {
    const h=p&&getNearestHexToPoint(p.x,p.y);
    return !!h&&isWaterHex(h)&&!isBridgeHex(h)&&!wodPointOnBridgeForUnit(unit,p.x,p.y,1.05)&&!wodDiagonalLandLinkAtPoint(unit,p.x,p.y);
}
// An AI soldier is let into the water only to get out of it (wodSetMarchOrderFlags): the leave ends at the shore. The
// route it was given while afloat was searched with water allowed the whole way, and took it on across the next bay or
// strait to where it was going (through the water rather than round by land, or to another landmass with no boat). On
// dry ground what is left of the route is planned again over land; where no land way leads there it halts on the shore,
// and its general finds it a boat or another task.
function wodAiEndSwimLeave(unit) {
    const clear=()=>{unit._wodAiRescueWater=false;unit._wodOrderIntoWater=false;unit._wodShoreExitRouting=false;if(unit.orderTarget)unit.orderTarget.intoWater=false;};
    clear();
    const wet=()=>[unit.target,...(unit.path||[])].some(p=>wodAiRoutePointWet(unit,p));
    if(!unit.target||!wet())return;
    // (stepping aside for a comrade: that short way round ends here, and the unit's own order is planned again when it
    // takes it up; the order's leave goes with this one, wodCaptureTrafficOrder having kept it apart)
    if(unit._trafficMoving){unit.target=null;unit.path=null;return;}
    if(replanUnitOrder(unit)&&unit.target&&!wet()){clear();return;}
    clear();unit.target=null;unit.path=null;unit.orderTarget=null;unit.fullMarchWaypoints=null;unit.marchWpCursor=0;
}
// The last stretch of a march to a spot a comrade already stands on (or is making for the very same point), within a
// cell or so of it. Only one can stand there: the other kept steering past him on one side, then the other, and went
// back and forth around the spot for good (computer units sent to hold a town to one point, two groups sent to one
// place). Not a retreat, nor a unit afloat, boarding, on a bridge deck or in a narrow lane, where stopping short blocks
// the way.
function wodDestinationTakenNearby(unit) {
    const t=unit.target;
    if(!t||t.goRound||t.detour||unit.path?.length||wodIsNavalUnit(unit)||unit.type==='convoy'||unit.boardTransportUid)return false;
    if(unit.retreating||unit._wodRiskRetreat||unit.moraleBroken||unit._wodOrderIntoWater||unit._wodAiRescueWater)return false;
    if(unit.fullMarchWaypoints?.length&&(unit.marchWpCursor||0)<unit.fullMarchWaypoints.length-1)return false;
    const goal=unit.orderTarget||t.finalTarget||t,sp=(gameData.hexRadius||20)*1.35,d=Math.hypot(t.x-unit.x,t.y-unit.y);
    if(Math.hypot(goal.x-t.x,goal.y-t.y)>2||d>sp*1.2||d<1)return false;
    let taken=false;
    forEachNearbyUnit(gameData.unitSpatialGrid,t.x,t.y,sp,f=>{
        if(taken||f===unit||f.hp<=0||f.type==='convoy'||!wodIsFriendlyOwner(f.owner,unit.owner)||!wodBodiesMeet(unit,f))return;
        // (on the spot itself, not a neighbour in a formation pressed a little into this unit's place: that one moves off
        // as the formation settles, verify-coastal-group-movement)
        if(Math.hypot(f.x-t.x,f.y-t.y)>=Math.max(unit.radius||12,f.radius||12)*.75)return;
        // (one walking on past the spot is not standing on it)
        if(f.target&&Math.hypot(f.target.x-t.x,f.target.y-t.y)>(f.radius||12))return;
        taken=true;
    });
    if(!taken)return false;
    if(unit._wodRouteUsesBridge&&(wodUnitOnBridgeDeck(unit)||wodPointOnBridgeForUnit(unit,unit.x,unit.y,1.15)))return false;
    return !wodUnitNearNarrowLandLane(unit);
}
function wodMoveUnitAlongRoute(unit, dt) {
    if(wodIsNavalUnit(unit)||unit.type==='convoy'&&unit.convoySeaRoute)ensureUnitPixelOnWalkableHex(unit,18);
    if(!unit.target) return;
    if(unit._wodRiskRetreat&&unit.retreating&&unit.orderTarget){
        const now=gameData._aiEconomyClock||0;
        // (not while it walks round comrades: the way round was clear when it was chosen, and
        // it is planned afresh at the end of it)
        if(now>=(unit._wodRetreatScanAt||0)&&!unit.target.goRound){
            unit._wodRetreatScanAt=now+.5;
            const signature=wodRetreatThreatSignature(unit);
            if(unit._wodRetreatRouteBlocked||signature!==unit._wodRetreatThreatSignature){
                if(!replanUnitOrder(unit)){unit._wodRetreatRouteBlocked=true;return;}
            }
        }
        if(unit._wodRetreatRouteBlocked)return;
    }
    // Older saves and rebuilt routes derive this from the actual order.
    // Path/arrow previews must never change the active movement flags.
    if(isLandArmyUnit(unit)&&!unit.boardTransportUid&&!wodMpIsHumanOwner(unit.owner)&&
        (unit._wodAiRescueWater||unit._wodOrderIntoWater||unit.orderTarget?.intoWater)&&!wodUnitAfloatForLeave(unit)){
        wodAiEndSwimLeave(unit);
        if(!unit.target)return;
    }
    if(isLandArmyUnit(unit)&&wodUnitStandingOnOpenWater(unit)&&unit.orderTarget) {
        const goal=getNearestHexToPoint(unit.orderTarget.x,unit.orderTarget.y);
        unit._wodShoreExitRouting=!!(goal&&!isWaterHex(goal));
    }
    unit._wodTerrainRepairCooldown=Math.max(0,(unit._wodTerrainRepairCooldown||0)-dt);
    preparePathTarget(unit);
    if(!unit.target) return;
    // Local avoidance points are temporary. Requiring their exact occupied
    // center trapped two friendly AI marchers facing the same detour node.
    if(unit.target.detour&&unit.target.finalTarget&&Math.hypot(unit.x-unit.target.x,unit.y-unit.target.y)<(unit.radius||12)+4) {
        const final=unit.target.finalTarget;if(unit.target.goRound)unit._wodRetreatReplanAt=0;
        // (a player's march that walked round a parked comrade takes up its own route again, waypoints and all:
        // replanUnitOrder leaves player orders alone, and the bare goal would skip the waypoints still ahead)
        if(unit.target.goRound&&wodIsPlayerMarchOrder(unit)&&!unit._wodRiskRetreat&&!unit.retreating&&unit.fullMarchWaypoints?.length&&
            assignUnitMoveAlongWaypoints(unit,unit.fullMarchWaypoints,{fromLegAdvance:true})){if(!unit.target)return;}
        else{unit.target={x:final.x,y:final.y,pathPrepared:false};
        replanUnitOrder(unit);if(!unit.target)return;}
    }
    if(unit.target.goRound&&!wodRetreatGoRoundHeadway(unit))return;
    // The spot it is walking to is taken (wodDestinationTakenNearby): after half a second it waits where it is, beside
    // it, keeping its order: it goes on if the spot comes free (a neighbour in a settling formation pressed onto it moves
    // off), and walks back if a crowd pushing past shoves it away. Taken for eight seconds, the order is done with.
    if(wodDestinationTakenNearby(unit)){
        unit._wodSpotTakenT=(unit._wodSpotTakenT||0)+dt;
        if(unit._wodSpotTakenT>8){
            unit._wodSpotTakenT=0;
            unit.target=null;unit.path=null;unit.orderTarget=null;unit.fullMarchWaypoints=null;unit.marchWpCursor=0;unit._wodRouteUsesBridge=false;
            invalidateUnitOrderArrowCache(unit);
            return;
        }
        if(unit._wodSpotTakenT>.5)return;
    }else unit._wodSpotTakenT=0;
    // A column need not occupy the exact same corner point to advance. Keep
    // the turn only while it is needed to clear terrain, so friends cannot
    // deadlock on opposite sides of a one-cell entrance waypoint.
    {
        let turns=0;
        // (The corner of a way round comrades is kept: cutting it leads into the end of their line.)
        while(unit.target&&!unit.target.goRound&&unit.path?.length&&turns++<4) {
            const next=unit.path[0],near=Math.hypot(unit.target.x-unit.x,unit.target.y-unit.y)<Math.max((gameData.hexRadius||20)*1.35*1.2,(unit.radius||12)*2+4);
            // (or already past it: comrades pressing through a pass can shove a unit cells beyond its corner, and it
            // walked back for it against the column, which then stood nose to nose with it; verify-terrain-ui, the bend)
            const past=Math.hypot(next.x-unit.x,next.y-unit.y)<Math.hypot(next.x-unit.target.x,next.y-unit.target.y);
            if(!near&&!past||!wodSegmentClearsTerrainForUnit(unit,unit.x,unit.y,next.x,next.y))break;
            if(unit._wodRiskRetreat&&!wodRetreatShortcutSafe(unit,next))break;
            if(!wodTakeNextPathTarget(unit))break;
        }
    }
    let playerMarch = wodIsPlayerMarchOrder(unit)&&!unit._wodRiskRetreat;
    let combatSlow = getCombatMovementSlowdownFactor(unit, gameData.unitSpatialGrid);
    let fortZoneSlow = wodFortEnemyMovementSlowdownMultiplier(unit);
    let stepSpeed = unit.speed * getUnitSpeedMultiplier(unit) * WOD_MOVE_SPEED_FACTOR * combatSlow * fortZoneSlow;
    let stepLeft = stepSpeed * dt;
    // Cap waypoint snaps per tick so catch-up / large dt never teleports through a
    // whole corridor in one frame (draw smoothing alone can't hide that).
    let maxWpSnaps = playerMarch ? 2 : (gameData.entities.length > 220 ? 4 : 6);
    if(dt > 0.04) maxWpSnaps = Math.max(maxWpSnaps, Math.ceil(maxWpSnaps * (dt / 0.036)));
    let guard = 0;
    while(unit.target && stepLeft > 0.0001 && guard++ < maxWpSnaps) {
        let dx = unit.target.x - unit.x;
        let dy = unit.target.y - unit.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if(dist < 0.001) {
            if(!wodAdvanceUnitPathTarget(unit)) return;
            if(unit.target && !unit.target.pathPrepared && !unit.target.detour) preparePathTarget(unit);
            continue;
        }
        if(stepLeft >= dist) {
            if(!wodSegmentClearsTerrainForUnit(unit,unit.x,unit.y,unit.target.x,unit.target.y)||unit.type!=='convoy'&&isWorldPositionBlockedByUnits(unit,unit.target.x,unit.target.y))break;
            let snapPrevX = unit.x;
            let snapPrevY = unit.y;
            unit.x = unit.target.x;
            unit.y = unit.target.y;
            wodClaimTerritoryAlongMove(unit, snapPrevX, snapPrevY, unit.x, unit.y);
            stepLeft -= dist;
            if(!wodAdvanceUnitPathTarget(unit)) return;
            if(unit.target && !unit.target.pathPrepared && !unit.target.detour) preparePathTarget(unit);
            continue;
        }
        break;
    }
    if(!unit.target || stepLeft <= 0.0001) return;

    let dx = unit.target.x - unit.x;
    let dy = unit.target.y - unit.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if(dist < 0.001) return;

    let prevX = unit.x;
    let prevY = unit.y;
    let nx = unit.x + (dx / dist) * Math.min(stepLeft,dist);
    let ny = unit.y + (dy / dist) * Math.min(stepLeft,dist);
    let clampSteps = gameData.entities.length > 220 ? 14 : (gameData.entities.length > 140 ? 20 : 28);
    let terrainClamp = wodClampStepToWalkableTerrain(unit, unit.x, unit.y, nx, ny, clampSteps);
    if(!terrainClamp)
        terrainClamp = wodTrySidestepClamp(unit, unit.x, unit.y, nx, ny);
    if(!terrainClamp) {
        if(wodTerrainWedgeWatch(unit,dt))return;
        if(!unit._wodRiskRetreat&&wodRepairTerrainMarch(unit))return;
        // Wedged on a mountain hex (edge-riding let the unit slip on): every
        // outgoing chord fails the walkability clamp, so repaths assign fresh
        // corridors the unit can never start. Slide it back onto walkable
        // ground first — then the normal march resumes. (This used to be done
        // for player marches only; an AI unit lost its order instead.)
        {
            let wedgeHex = getNearestHexToPoint(unit.x, unit.y);
            if(wedgeHex && wedgeHex.type === 'mountain' && !wodIsNavalUnit(unit) && unit.type !== 'convoy') {
                let esc = getNearestWalkableHexForUnit(unit, unit.x, unit.y);
                if(esc && esc !== wedgeHex) {
                    let ex = esc.x - unit.x, ey = esc.y - unit.y;
                    let el = Math.sqrt(ex * ex + ey * ey) || 1;
                    let slide = Math.min(stepSpeed * dt, el);
                    unit.x += (ex / el) * slide;
                    unit.y += (ey / el) * slide;
                    unit.blockedTimer = 0;
                    return;
                }
            }
        }
        if(unit._wodRiskRetreat){
            unit.blockedTimer=(unit.blockedTimer||0)+dt;
            if(unit.blockedTimer>.25)replanUnitOrder(unit);
            return;
        }
        if(playerMarch) {
            unit.blockedTimer = (unit.blockedTimer || 0) + dt;
            if(unit.blockedTimer > 0.22 && unit.orderTarget) {
                let nowMs = performance.now();
                if(!unit._wodBlockedRepathUntil || nowMs >= unit._wodBlockedRepathUntil) {
                    let dest = [{ x: unit.orderTarget.x, y: unit.orderTarget.y }];
                    if(wodTryAssignPlayerCorridorPath(unit, dest, unit.orderTarget, false)) {
                        unit.blockedTimer = 0;
                        unit.stuckTimer = 0;
                        unit._wodBlockedRepathUntil = 0;
                        return;
                    }
                    // Don't spam a failing full A* every frame — cool down and
                    // slide around the obstacle in the meantime.
                    unit._wodBlockedRepathUntil = nowMs + 420;
                }
                if(wodUnitPrefersLandOnlyPath(unit) || unit.type === 'marine') {
                    // On a bridge crossing, prefer advancing the existing deck path
                    // over a greedy land hop that can walk off the deck sideways.
                    if(unit._wodRouteUsesBridge && (wodUnitOnBridgeDeck(unit) ||
                        wodPointOnBridgeForUnit(unit, unit.x, unit.y, 1.15))) {
                        if(unit.path && unit.path.length > 0 && wodTakeNextPathTarget(unit)) {
                            unit.blockedTimer = 0;
                            return;
                        }
                        if(unit.orderTarget) {
                            unit.target = {
                                x: unit.orderTarget.x,
                                y: unit.orderTarget.y,
                                pathPrepared: false
                            };
                            unit.blockedTimer = 0;
                            return;
                        }
                    }
                    let goalHex = getNearestHexToPoint(unit.orderTarget.x, unit.orderTarget.y);
                    let hop = goalHex ? findGreedyLandStep(unit, goalHex) : null;
                    if(hop) {
                        unit.target = { x: hop.x, y: hop.y, pathPrepared: true, landGreedy: true };
                        unit.blockedTimer = 0;
                        return;
                    }
                    let detour = findLocalDetourHex(unit, unit.target.x, unit.target.y);
                    if(detour) {
                        unit.target = { x: detour.x, y: detour.y, detour: true, finalTarget: { x: unit.orderTarget.x, y: unit.orderTarget.y } };
                        unit.blockedTimer = 0;
                        return;
                    }
                }
            }
            return;
        }
        unit.blockedTimer = (unit.blockedTimer || 0) + dt;
        // On a bridge crossing, prefer advancing the existing deck path over a
        // sideways detour that walks AI units off the deck into open water.
        if(unit._wodRouteUsesBridge && (wodUnitOnBridgeDeck(unit) ||
            wodPointOnBridgeForUnit(unit, unit.x, unit.y, 1.15))) {
            if(unit.path && unit.path.length > 0 && wodTakeNextPathTarget(unit)) {
                unit.blockedTimer = 0;
                return;
            }
            if(unit.orderTarget) {
                unit.target = {
                    x: unit.orderTarget.x,
                    y: unit.orderTarget.y,
                    pathPrepared: false
                };
                unit.blockedTimer = 0;
                return;
            }
        }
        let replanT = unit.type === 'convoy' ? 0.12 : (wodIsNavalUnit(unit) ? 0.18 : 0.25);
        let curHx = getNearestHexToPoint(unit.x, unit.y);
        if(curHx && !wodIsNavalUnit(unit) && !(unit.type === 'convoy' && unit.convoySeaRoute) &&
            getNeighborHexes(curHx).some(n => n && n.type === 'mountain')) replanT *= 1.25;
        if(unit.blockedTimer > replanT && replanUnitOrder(unit)) {
            unit.blockedTimer = 0;
            return;
        }
        if(unit.type === 'convoy' || wodIsNavalUnit(unit)) return;
        let detour = findLocalDetourHex(unit, unit.target.x, unit.target.y);
        if(detour) {
            let finalTarget = unit.orderTarget || unit.target.finalTarget || {x: unit.target.x, y: unit.target.y};
            unit.fullMarchWaypoints = null;
            unit.marchWpCursor = 0;
            unit.target = {x: detour.x, y: detour.y, detour: true, finalTarget};
        } else if(unit.orderTarget && replanUnitOrder(unit)) {
            unit.blockedTimer = 0;
        } else {
            unit.fullMarchWaypoints = null;
            unit.marchWpCursor = 0;
            unit.target = null;
        }
        return;
    }
    const actualStep=Math.hypot(terrainClamp.x-unit.x,terrainClamp.y-unit.y);
    if(actualStep<stepLeft*.2) {
        if(actualStep<Math.min(stepLeft,dist)*.2&&wodTerrainWedgeWatch(unit,dt))return;
        unit._wodTerrainStallT=(unit._wodTerrainStallT||0)+dt;
        if(unit._wodTerrainStallT>.25){
            if(unit._wodRiskRetreat){replanUnitOrder(unit);return;}
            if(wodRepairTerrainMarch(unit))return;
        }
    } else unit._wodTerrainStallT=0;
    nx = terrainClamp.x;
    ny = terrainClamp.y;
    const avoidance=unit.type!=='convoy'&&wodSteerAroundFriendlyUnits(unit,nx,ny,dt);
    if(avoidance){nx=avoidance.x;ny=avoidance.y;}
    // A retreat that has made no headway for a while while steering round comrades is going
    // back and forth in front of them, or pressing into them: walk round the lot.
    if(unit.type!=='convoy'&&(unit._wodRiskRetreat||unit.retreating||unit.moraleBroken)){
        const goalR=unit.orderTarget||unit.target.finalTarget||unit.target,dR=Math.hypot(goalR.x-unit.x,goalR.y-unit.y);
        // (Only the way round itself is excused for leading sideways. Other detours are not: the
        // local detour of a blocked march picks the free neighbouring cell nearest the goal, which
        // in front of a line is a comrade's cell, and it is picked again and again.)
        if(unit.target.goRound||unit._wodFleeD==null||dR<unit._wodFleeD-1.5){unit._wodFleeD=dR;unit._wodFleeT=0;}
        else{
            // (every frame without headway counts: between two sidesteps the unit takes a free step
            // forward and is steered back again)
            unit._wodFleeT=(unit._wodFleeT||0)+dt;
            // (two and a half seconds: comrades who are free to step aside have begun to by then, and the
            // safest-route replanning has had its chance. While some are still stepping aside for this
            // unit it waits for them, up to eight seconds: the gap they open is shorter than the way
            // round the end of a line.)
            const id=unit.uid,sp=(gameData.hexRadius||20)*1.35;
            const making=unit._wodFleeT>2.5&&unit._wodFleeT<8&&gameData.entities.some(u=>u.hp>0&&u._trafficYield?.leader===id&&!u._trafficYield.returning&&u._trafficYield.route?.target&&Math.abs(u.x-unit.x)<sp*4&&Math.abs(u.y-unit.y)<sp*4);
            if(unit._wodFleeT>2.5&&!making&&!((unit._wodGoRoundAt||0)>(gameData._aiEconomyClock||0)-3)){unit._wodFleeT=0;unit._wodFleeD=null;if(wodRetreatGoRound(unit)){unit._wodGoRoundAt=gameData._aiEconomyClock||0;return;}}
        }
    }else if(unit._wodFleeD!=null){unit._wodFleeD=null;unit._wodFleeT=0;}
    if(unit.type!=='convoy'&&(isWorldPositionBlockedByUnits(unit,nx,ny)||avoidance&&Math.hypot(nx-unit.x,ny-unit.y)<.001)) {
        unit._trafficBlockT=(unit._trafficBlockT||0)+dt;
        // Asking the comrade in the way to step aside is tried first. One who is holding his
        // ground does not, and a retreat cannot wait for him: after a second and a half it
        // stops asking and goes round.
        if(unit._trafficBlockT>.4&&!(unit._trafficBlockT>1.5&&(unit._wodRiskRetreat||unit.retreating||unit.moraleBroken))&&wodYieldFriendlyTraffic(unit))return;

    }else{unit._trafficBlockT=0;unit._wodRetreatJamT=0;}
    // Steering can answer "stand still" when every way round a comrade looks taken. A marching
    // unit waits for the road to clear; a retreating one that has waited most of a second is
    // treated as blocked, so that it replans and detours instead of standing behind him.
    const retreatStalled=unit.type!=='convoy'&&avoidance&&Math.hypot(nx-unit.x,ny-unit.y)<.001&&
        (unit._trafficBlockT||0)>.8&&(unit._wodRiskRetreat||unit.retreating||unit.moraleBroken);
    if(unit.type !== 'convoy' && (retreatStalled || isWorldPositionBlockedByUnits(unit, nx, ny))) {
        if(!retreatStalled&&!((unit._trafficBlockT||0)>1.5&&(unit._wodRiskRetreat||unit.retreating||unit.moraleBroken))&&wodYieldFriendlyTraffic(unit))return;
        const fleeing=unit._wodRiskRetreat||unit.retreating||unit.moraleBroken;
        if(unit.target.goRound){
            // Somebody has stepped into the way round since it was chosen: wait a moment for him,
            // then give it up and plan afresh (no headway sends the unit round again).
            unit._wodGoRoundBlockT=(unit._wodGoRoundBlockT||0)+dt;
            if(unit._wodGoRoundBlockT>1)wodEndRetreatGoRound(unit);
            return;
        }
        if(unit._wodRiskRetreat){
            // The safest route is asked for again (the request is rate-limited). A retreat that
            // still makes no headway is sent round by the no-headway check above.
            unit.blockedTimer=(unit.blockedTimer||0)+dt;
            if(unit.blockedTimer>.35)replanUnitOrder(unit);
            return;
        }
        if(playerMarch&&!fleeing) {
            // Blocked by a friendly. If the column has already massed around the
            // destination, arrive in place — 19 units can never all stand on the
            // click point, and waiting forever read as "stuck". Otherwise wait
            // politely (historical behavior; the jam clears as the front moves).
            if(!unit._wodOrderIntoWater && unit.orderTarget) {
                unit._wodFriendBlockT = (unit._wodFriendBlockT || 0) + dt;
                if(unit._wodFriendBlockT > 1.35) {
                    unit._wodFriendBlockT = 0;
                    // Never "arrive in place" while still on a bridge deck — rear units
                    // in a column would freeze mid-crossing when blocked by friendlies.
                    let onDeck = unit._wodRouteUsesBridge && (
                        wodUnitOnBridgeDeck(unit) ||
                        wodPointOnBridgeForUnit(unit, unit.x, unit.y, 1.15)
                    );
                    let landAhead = wodUnitHasLandWaypointAhead(unit);
                    if(!onDeck && !landAhead && !wodUnitNearNarrowLandLane(unit)) {
                        let hrA = gameData.hexRadius || 20;
                        let adx = unit.orderTarget.x - unit.x, ady = unit.orderTarget.y - unit.y;
                        let arriveR = Math.max(2,(unit.radius||12)*.25);
                        if(adx * adx + ady * ady < arriveR * arriveR) {
                            unit.target = null;
                            unit.path = null;
                            unit.orderTarget = null;
                            unit.fullMarchWaypoints = null;
                            unit.marchWpCursor = 0;
                            unit._wodRouteUsesBridge = false;
                            invalidateUnitOrderArrowCache(unit);
                        }
                    }
                }
            }
            return;
        }
        unit.blockedTimer = (unit.blockedTimer || 0) + dt;
        // AI column arrival: rear units of a massed AI group can never reach the
        // exact rally point (friends occupy it). Track the friend-block time and
        // arrive in place near the goal — the missing counterpart of the player
        // fix, and the main reason AI groups looked frozen.
        if(unit.owner > 1 && !wodMpIsHumanOwner(unit.owner)) {
            unit._wodAiFriendBlockT = (unit._wodAiFriendBlockT || 0) + dt;
            let ftA = unit.orderTarget || (unit.target && unit.target.finalTarget) || unit.target;
            if(unit._wodAiFriendBlockT > 1.2 && ftA) {
                // Never arrive mid-deck — same guard as player friend-block.
                let onDeck = unit._wodRouteUsesBridge && (
                    wodUnitOnBridgeDeck(unit) ||
                    wodPointOnBridgeForUnit(unit, unit.x, unit.y, 1.15)
                );
                if(!onDeck && !wodUnitNearNarrowLandLane(unit)) {
                    let hrA = gameData.hexRadius || 20;
                    let adx = ftA.x - unit.x, ady = ftA.y - unit.y;
                    let arriveR = unit.aiCaptureHexKey||wodAiGetUnitTaskJob(unit)?.city ? hrA*.6 : Math.max(hrA*1.5,(unit.radius||12)*2+4);
                    if(adx * adx + ady * ady < arriveR * arriveR&&gameData.entities.some(other=>other!==unit&&other.hp>0&&
                        !other.target&&!other._trafficYield&&wodIsFriendlyOwner(other.owner,unit.owner)&&Math.hypot(other.x-ftA.x,other.y-ftA.y)<(other.radius||12)+4)) {
                        wodUnitArrivedAtTarget(unit);
                        return;
                    }
                }
            }
        }
        let blk = wodMpIsHumanOwner(unit.owner) ? 0.55 : 0.35;
        let curHx = getNearestHexToPoint(unit.x, unit.y);
        if(curHx && getNeighborHexes(curHx).some(n => n && n.type === 'mountain')) blk *= 1.15;
        if(unit.blockedTimer > blk && replanUnitOrder(unit)) {
            unit.blockedTimer = 0;
            return;
        }
        let detour = findLocalDetourHex(unit, unit.target.x, unit.target.y);
        // (The neighbouring cell nearest the goal is, in front of a line, the cell of the comrade the
        // unit is stuck behind. A retreating unit is not sent into him: it keeps steering for its goal,
        // which finds a gap when one opens, and is sent round the line when none does.)
        if(detour&&fleeing&&isWorldPositionBlockedByUnits(unit,detour.x,detour.y))detour=null;
        if(detour) {
            let finalTarget = unit.orderTarget || unit.target.finalTarget || {x: unit.target.x, y: unit.target.y};
            unit.fullMarchWaypoints = null;
            unit.marchWpCursor = 0;
            unit.target = {x: detour.x, y: detour.y, detour: true, finalTarget};
        }
        return;
    }

    unit.x = nx;
    unit.y = ny;
    wodClaimTerritoryAlongMove(unit, prevX, prevY, unit.x, unit.y);
    unit.blockedTimer = 0;
    // Decay the blocked-column clock as traffic starts flowing again.
    if(unit._wodAiFriendBlockT) unit._wodAiFriendBlockT = Math.max(0, unit._wodAiFriendBlockT - dt * 1.5);
    if(playerMarch) {
        unit.stuckTimer = 0;
        return;
    }
    let movedSq = (unit.x - prevX) * (unit.x - prevX) + (unit.y - prevY) * (unit.y - prevY);
    if(movedSq < 0.04 && dist > Math.max(10, unit.radius || 10)) {
        unit.stuckTimer = (unit.stuckTimer || 0) + dt;
        let stuckLimit = wodMpIsHumanOwner(unit.owner) ? 1.15 : 0.52;
        let ch = getNearestHexToPoint(unit.x, unit.y);
        if(ch && !wodIsNavalUnit(unit) && !(unit.type === 'convoy' && unit.convoySeaRoute) &&
            getNeighborHexes(ch).some(n => n && n.type === 'mountain')) stuckLimit = wodMpIsHumanOwner(unit.owner) ? 0.9 : 0.38;
        if(unit.stuckTimer > stuckLimit) {
            unit.stuckTimer = 0;
            replanUnitOrder(unit);
        }
    } else {
        unit.stuckTimer = 0;
    }
}
// Who stands on each land cell, for territory claims and supply. Ships are left out: they hold no land, so a warship off
// the coast neither stops our troops taking the shore beside it nor cuts their supply along it.
function wodRebuildHexCombatOccupancy() {
    let map = gameData._hexCombatOcc;
    if(!map) map = gameData._hexCombatOcc = new Map();
    else map.clear();
    let ents = gameData.entities;
    for(let i = 0, n = ents.length; i < n; i++) {
        let u = ents[i];
        if(!u || u.hp <= 0 || u.type === 'convoy' || wodIsNavalUnit(u)) {
            if(u) u._occHexKey = '';
            continue;
        }
        let h = getNearestHexToPoint(u.x, u.y);
        if(!h) {
            u._occHexKey = '';
            continue;
        }
        let k = getHexKey(h);
        let rec = map.get(k);
        if(!rec) {
            rec = [];
            map.set(k, rec);
        }
        rec.push(u.owner);
        u._occHexKey = k;
    }
}
