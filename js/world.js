// Hex grid queries, spatial lookups, town capture and urban terrain.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

function isClaimableLand(hex) {
    return hex && !isWaterHex(hex);
}
function getNeighborHexes(hex) {
    if(!hex) return [];
    if(hex._nbrs) return hex._nbrs;
    let neighbors = [];
    for (let dir of hexDirections) {
        let nHex = wodHexAt(hex.q + dir.q,hex.r + dir.r);
        if (nHex) neighbors.push(nHex);
    }
    hex._nbrs = neighbors;
    return neighbors;
}
function canUnitEnterHex(unit, hex) {
    if (!hex) return false;
    if (unit.type === 'marine') {
        if (hex.type === 'mountain' && !wodCanClimb(unit)) return false;
        return isWaterHex(hex) || isClaimableLand(hex);
    }
    if (wodIsNavalUnit(unit)) return wodIsOpenWaterHex(hex);
    if (unit.type === 'convoy') {
        if (unit.convoySeaRoute) {
            if (!wodIsOpenWaterHex(hex)) return false;
            return true;
        }
        if (isBridgeHex(hex)) return true;
        if (!isClaimableLand(hex) || hex.type === 'mountain') return false;
        return hex.owner === 0 || wodIsFriendlyOwner(hex.owner, unit.owner);
    }
    // Light / heavy: mountains blocked; may enter open water when explicitly ordered.
    if (hex.type === 'mountain' && !wodCanClimb(unit)) return false;
    if (isBridgeHex(hex)) return true;
    if (isWaterHex(hex)) return true;
    return isClaimableLand(hex);
}
/** Tiles land armies may use in A* — land + bridge; open water only when allowOpenWater. */
function wodHexWalkableForLandPath(unit, hex, allowOpenWater) {
    if(!hex || !unit) return false;
    if(wodIsNavalUnit(unit)) return wodIsOpenWaterHex(hex);
    if(unit.type === 'marine'&&!unit._wodKeepLandFormation) {
        if(hex.type === 'mountain' && !wodCanClimb(unit)) return false;
        return isWaterHex(hex) || isClaimableLand(hex);
    }
    if(unit.type === 'convoy' && unit.convoySeaRoute) return wodIsOpenWaterHex(hex);
    if(unit.type === 'convoy') {
        if(isBridgeHex(hex)) return true;
        if(!isClaimableLand(hex) || hex.type === 'mountain') return false;
        return hex.owner === 0 || wodIsFriendlyOwner(hex.owner, unit.owner);
    }
    if(hex.type === 'mountain' && !wodCanClimb(unit)) return false;
    if(isBridgeHex(hex)) return true;
    if(isWaterHex(hex)) {
        if(unit._wodBoardingNoWater&&!wodUnitStandingOnOpenWater(unit))return false;
        const standing=getNearestHexToPoint(unit.x,unit.y);
        if(!wodMpIsHumanOwner(unit.owner)&&standing&&!isWaterHex(standing))return false;
        return !!allowOpenWater;
    }
    return isClaimableLand(hex);
}
function wodPathTileWalkable(unit, hex, allowOpenWater) {
    if(wodUnitPrefersLandOnlyPath(unit)) return wodHexWalkableForLandPath(unit, hex, allowOpenWater);
    return canUnitEnterHex(unit, hex);
}
function wodOrderIntoWater(unit, targetHex) {
    if(!wodUnitPrefersLandOnlyPath(unit)) return false;
    // A stranded swimmer must be able to finish the water part of its
    // escape, including after a path rebuild or a cancelled boarding.
    // This permission ends physically at the shore; it grants no new
    // swimming shortcut to troops already on dry land.
    if(wodUnitAfloatForLeave(unit))return true;
    const goal=unit.orderTarget&&getNearestHexToPoint(unit.orderTarget.x,unit.orderTarget.y);
    // Registered bridge cells include a routing margin. A deliberate
    // click beside the physical deck is still a water order.
    if((unit._wodOrderIntoWater||unit.orderTarget?.intoWater)&&isWaterHex(goal)&&
        !wodPointOnBridgeForUnit(unit,unit.orderTarget.x,unit.orderTarget.y,1.05))return true;
    if(unit.orderTarget && unit.orderTarget.x != null && unit.orderTarget.y != null &&
        wodBridgeHexAtPoint(unit, unit.orderTarget.x, unit.orderTarget.y))
        return false;
    if(targetHex && isBridgeHex(targetHex)) return false;
    if(unit._wodOrderIntoWater || (unit.orderTarget && unit.orderTarget.intoWater)) return true;
    // Testing a water candidate is not permission to enter it. Only the
    // actual issued destination/approved crossing grants that permission.
    return !!(goal&&wodIsOpenWaterHex(goal)&&targetHex&&wodHexKeysEqual(goal,targetHex));
}
/** True when a land army is physically standing on open water (embarked / stranded). */
function wodUnitStandingOnOpenWater(unit) {
    if(!unit || !wodUnitPrefersLandOnlyPath(unit)) return false;
    const h = getNearestHexToPoint(unit.x, unit.y);
    if(!h || !isWaterHex(h) || wodUnitOnBridgeDeck(unit))return false;
    if(wodDiagonalLandLinkAtPoint(unit,unit.x,unit.y))return false;
    return true;
}
// Afloat as far as leave to swim goes. An AI soldier in a bridge's cell beside its deck, or brushing the deck's edge,
// is in the margin walked as part of the crossing and gets out the way it came, over the deck or onto the bank; given
// leave to swim there, its way out went on through the water round the bridge landing.
// The same goes for the player's troops unless the player sent them into the water: one pushed off a crowded deck by
// its comrades stood in the margin beside it, took that as leave to swim, and walked on to its next waypoint straight
// across the river beside the bridge. (A unit on a bank or a bridge may not step into the water beside a bridge beyond
// the margin of the deck at all: wodSamplePosOnWalkableTerrain.)
function wodUnitAfloatForLeave(unit) {
    if(!wodUnitStandingOnOpenWater(unit))return false;
    if(!isLandArmyUnit(unit))return true;
    if(wodMpIsHumanOwner(unit.owner)&&(unit._wodChoseWater||unit.orderTarget?.intoWater))return true;
    const h=getNearestHexToPoint(unit.x,unit.y);
    return !(h&&isBridgeHex(h))&&!wodPointOnBridgeForUnit(unit,unit.x,unit.y,1.18);
}
function wodSetMarchOrderFlags(unit, resolved) {
    const afloat=wodUnitAfloatForLeave(unit);
    unit._wodOrderIntoWater = !!(resolved && resolved.intoWater) || afloat;
    const goal=unit.orderTarget&&getNearestHexToPoint(unit.orderTarget.x,unit.orderTarget.y);
    unit._wodShoreExitRouting=!!(afloat&&isLandArmyUnit(unit)&&goal&&!isWaterHex(goal));
    // (a player who sends land troops into the water means them to stay there: wodWadeAshoreIfIdle leaves them be)
    unit._wodChoseWater=!!(resolved&&resolved.intoWater&&goal&&isWaterHex(goal)&&!isBridgeHex(goal)&&wodMpIsHumanOwner(unit.owner));
    if(afloat&&isLandArmyUnit(unit))unit._wodAiRescueWater=true;
}
function isLandArmyUnit(unit) {
    return !!unit && ['light','heavy','motorized','mountaineer'].includes(unit.type);
}
/** Snap a drawn-stroke / formation waypoint for land armies onto land or a bridge deck.
 * Open-water stroke points must NOT become intoWater amphibious orders.
 * Pure land near a bridge stays on land — only water/deck samples snap to deck. */
function wodSnapLandArmyOrderPoint(unit, x, y, opt) {
    if(!unit || x == null || y == null) return null;
    if(wodIsNavalUnit(unit) || (unit.type === 'convoy' && unit.convoySeaRoute)) return null;
    opt = opt || {};
    let probe = unit;
    let coord = pixelToHex(x, y);
    let direct = wodHexAt(coord.q,coord.r);
    let nearest = getNearestHexToPoint(x, y);
    let nearestPureLand = !!(nearest && !isWaterHex(nearest) && !isBridgeHex(nearest) && (nearest.type !== 'mountain'||wodCanClimb(unit)));
    let bh = wodBridgeHexAtPoint(probe, x, y);
    if(bh) {
        let br = bridgeAtHex(bh);
        let onDeck = !!(br && wodPointInBridgeRect(x, y, br, 1.05)) ||
            wodPointOnBridgeForUnit(probe, x, y, 1.05);
        // Pure land near a bridge stays on land — radius scans must not
        // yank shore formation strokes onto the deck.
        if(nearestPureLand && !onDeck) {
            // fall through to land resolve below
        } else if(onDeck && !wodIsOpenWaterHex(nearest)) {
            return { x: x, y: y, hex: bh, intoWater: false };
        } else {
            if(br) {
                let deckPt = wodBridgeDeckPointForHex(bh, br, null, null);
                return { x: deckPt.x, y: deckPt.y, hex: bh, intoWater: false };
            }
            return { x: bh.x, y: bh.y, hex: bh, intoWater: false };
        }
    }
    // Prefer nearest-hex ownership: shoreline land pixels must not count as water
    // just because pixelToHex rounded into the river.
    let overWater = !!(nearest && wodIsOpenWaterHex(nearest)) ||
        !!(direct && wodIsOpenWaterHex(direct) && !(nearest && !isWaterHex(nearest) && !isBridgeHex(nearest)));
    if(nearestPureLand)
        overWater = false;
    // Distant-bridge pull is only for water/deck samples — never for pure land,
    // even on a confirmed crossing stroke (approach/exit stay on shore).
    if(gameData.bridges && gameData.bridges.length && overWater) {
        wodEnsureBridgePathIndex();
        let bestBr = null,
            bestBrD = Infinity;
        let hr = gameData.hexRadius || 20;
        let maxD2 = Math.pow(hr * 1.35 * 8, 2);
        for(let bi = 0, bl = gameData.bridges.length; bi < bl; bi++) {
            let br = gameData.bridges[bi];
            if(!br) continue;
            if(br.x == null) wodSyncBridgeWorldCoords(br);
            let dx = x - br.x,
                dy = y - br.y;
            let d = dx * dx + dy * dy;
            let allow = d <= maxD2 || (overWater && wodPointInBridgeRect(x, y, br, 1.35));
            if(allow && d < bestBrD) {
                bestBrD = d;
                bestBr = br;
            }
        }
        if(bestBr) {
            let deckH = wodBridgeWaterHexNearPoint(bestBr, x, y) ||
                (bestBr.hexKeys && bestBr.hexKeys.length ? gameData.hexes[bestBr.hexKeys[Math.floor(bestBr.hexKeys.length / 2)]] : null);
            if(deckH && isBridgeHex(deckH)) {
                let deckPt = wodBridgeDeckPointForHex(deckH, bestBr, null, null);
                return { x: deckPt.x, y: deckPt.y, hex: deckH, intoWater: false };
            }
            return { x: bestBr.x, y: bestBr.y, hex: null, intoWater: false };
        }
    }
    let land = wodResolveLandMarchHex(unit, x, y);
    if(land && !land.intoWater)
        return { x: land.exactX, y: land.exactY, hex: land.hex, intoWater: false };
    let best = null,
        bestScore = Infinity;
    for(let pt of getHexesInRadius(coord.q, coord.r, 16)) {
        let hex = wodHexAt(pt.q,pt.r);
        if(!hex || hex.type === 'mountain') continue;
        if(isWaterHex(hex) && !isBridgeHex(hex)) continue;
        if(!wodHexWalkableForLandPath(unit, hex, false) && !isBridgeHex(hex)) continue;
        let dx = x - hex.x,
            dy = y - hex.y;
        let score = dx * dx + dy * dy;
        // Prefer pure land over nearby bridge tiles for land formation snaps.
        if(isBridgeHex(hex)) score *= 1.35;
        if(score < bestScore) {
            bestScore = score;
            best = hex;
        }
    }
    return best ? { x: best.x, y: best.y, hex: best, intoWater: false } : null;
}
/** True when a stroke polyline actually crosses a river (open water or bridge deck)
 * between land shores — not merely running parallel near a river. */
function wodStrokeCrossesOpenWater(strokePts) {
    if(!strokePts || strokePts.length < 2) return false;
    function pureLand(h) {
        return !!(h && !isWaterHex(h) && !isBridgeHex(h) && h.type !== 'mountain');
    }
    function riverish(h) {
        return !!(h && (wodIsOpenWaterHex(h) || isBridgeHex(h)));
    }
    // Require land → river/bridge → land along the stroke.
    let sawLand = false,
        sawRiverAfterLand = false;
    for(let i = 0; i < strokePts.length; i++) {
        let h = getNearestHexToPoint(strokePts[i].x, strokePts[i].y);
        if(pureLand(h)) {
            if(sawRiverAfterLand) return true;
            sawLand = true;
        } else if(riverish(h) && sawLand) {
            sawRiverAfterLand = true;
        }
    }
    if(sawRiverAfterLand) {
        let end = getNearestHexToPoint(strokePts[strokePts.length - 1].x, strokePts[strokePts.length - 1].y);
        if(pureLand(end)) return true;
    }
    // Chord samples: both ends pure land, mid chord river/bridge (true crossing).
    for(let i = 1; i < strokePts.length; i++) {
        let a = strokePts[i - 1],
            b = strokePts[i];
        let ha = getNearestHexToPoint(a.x, a.y),
            hb = getNearestHexToPoint(b.x, b.y);
        if(!pureLand(ha) || !pureLand(hb)) continue;
        let dx = b.x - a.x,
            dy = b.y - a.y;
        let len = Math.sqrt(dx * dx + dy * dy);
        if(len < (gameData.hexRadius || 20) * 1.2) continue;
        let n = Math.max(3, Math.min(14, Math.ceil(len / ((gameData.hexRadius || 20) * 0.65))));
        let riverHits = 0;
        for(let s = 1; s < n; s++) {
            let t = s / n;
            let h = getNearestHexToPoint(a.x + dx * t, a.y + dy * t);
            if(riverish(h)) riverHits++;
        }
        if(riverHits >= 2) return true;
    }
    return false;
}
/** Offset a drawn stroke for one land unit, collapsing lateral offset across bridges
 * and snapping any water samples onto deck/shore so the group funnels across. */
function wodOffsetStrokePathForLandUnit(unit, strokePts, cx, cy) {
    if(!unit || !strokePts || strokePts.length < 1) return null;
    let ox = unit.x - cx,
        oy = unit.y - cy;
    let crossesWater = wodStrokeCrossesOpenWater(strokePts);
    let base = [];
    for(let i = 0; i < strokePts.length; i++) {
        let p = strokePts[i];
        // Only pull land points onto a bridge when the stroke actually crosses water.
        let snap = wodSnapLandArmyOrderPoint(unit, p.x, p.y, { allowDistantBridge: crossesWater });
        if(snap) base.push({ x: snap.x, y: snap.y });
        else base.push({ x: p.x, y: p.y });
    }
    if(base.length < 1) return null;
    let funnel = crossesWater ? wodLeadCorridorBridgeFunnelScales(base) : null;
    if(crossesWater && !funnel) {
        funnel = new Array(base.length).fill(1);
        let mid0 = Math.max(0, Math.floor(base.length * 0.25));
        let mid1 = Math.min(base.length - 1, Math.ceil(base.length * 0.75));
        for(let k = mid0; k <= mid1; k++) funnel[k] = 0;
        for(let k = Math.max(0, mid0 - 3); k < mid0; k++)
            funnel[k] = (mid0 - k) / 3;
        for(let k = mid1 + 1; k <= Math.min(base.length - 1, mid1 + 2); k++)
            funnel[k] = (k - mid1) / 2;
    }
    let pathPts = [];
    for(let i = 0; i < base.length; i++) {
        let s = funnel ? (funnel[i] == null ? 1 : funnel[i]) : 1;
        let px = base[i].x + ox * s;
        let py = base[i].y + oy * s;
        // On funnelled deck segments stay on the snapped base; don't re-snap land flanks.
        if(funnel && funnel[i] === 0) {
            pathPts.push({ x: base[i].x, y: base[i].y });
            continue;
        }
        let again = wodSnapLandArmyOrderPoint(unit, px, py, { allowDistantBridge: false });
        pathPts.push(again ? { x: again.x, y: again.y } : { x: px, y: py });
    }
    return pathPts;
}
function hasOwnerNeighbor(hex, owner) {
    return getNeighborHexes(hex).some(nHex => nHex.owner === owner);
}
/** True if any defender combat unit stands on this town's urban footprint. */
function wodCityUrbanHasDefenderCombat(city, defenderOwner) {
    if(!city || defenderOwner == null) return false;
    let tiles = getCityUrbanTerrainHexes(city);
    if(!tiles.length) {
        let ch = wodHexAt(city.q,city.r);
        if(ch) tiles = [ch];
    }
    let tileKeys = new Set(tiles.map(uh => getHexKey(uh)));
    for(let u of gameData.entities) {
        if(u.hp <= 0 || u.type === 'convoy' || u.owner !== defenderOwner) continue;
        let uh = getNearestHexToPoint(u.x, u.y);
        if(uh && tileKeys.has(getHexKey(uh))) return true;
    }
    return false;
}
function wodExecuteCityCapture(city, newOwner) {
    if(!city || newOwner <= 0 || city.owner === newOwner) return;
    if(wodAreAllies(newOwner, city.owner)) return;
    let prevCityOwner = city.owner;
    city.owner = newOwner;
    let destroyed = [];
    // Chance each standing building is ruined during the sack.
    if(city.hasFactory && Math.random() < 0.55) {
        city.hasFactory = false;
        destroyed.push('factory');
    }
    if(city.hasHarbor && Math.random() < 0.5) {
        city.hasHarbor = false;
        destroyed.push('harbor');
    }
    if(city.hasFarm && Math.random() < 0.45) {
        city.hasFarm = false;
        destroyed.push('farm');
    }
    let cityHex = wodHexAt(city.q,city.r);
    if(cityHex) setHexOwner(cityHex, newOwner);
    handleWodTownCaptureAndElimination(prevCityOwner, newOwner);
    for(let uh of getCityUrbanTerrainHexes(city)) {
        let hx = gameData.hexes[getHexKey(uh)];
        if(hx && !isWaterHex(hx)) setHexOwner(hx, newOwner);
    }
    let area = getHexesInRadius(city.q, city.r, 2);
    for(let ah of area) {
        let hex = wodHexAt(ah.q,ah.r);
        if(isClaimableLand(hex) && (hex.owner === newOwner || hasOwnerNeighbor(hex, newOwner)))
            setHexOwner(hex, newOwner);
    }
    // Forts in the town footprint may be razed when the city falls.
    destroyed = destroyed.concat(wodMaybeDestroyFortsAroundCity(city, prevCityOwner, newOwner));
    if(destroyed.length && typeof showNotification === 'function') {
        let label = city.name || 'Town';
        let uniq = [];
        for(let d of destroyed) if(uniq.indexOf(d) < 0) uniq.push(d);
        showNotification(label + ': ' + uniq.join(', ') + ' destroyed!');
    }
    wodMarkTerrainPoliticalDirty();
    wodFillUnownedPoliticalHexes(3);
}
function wodMaybeDestroyFortsAroundCity(city, prevOwner, newOwner) {
    // The territory pass handles both field structures consistently.
    wodSyncFortCapturesAfterTerritory();
    return [];
}
function wodEmitStructureDestruction(structure,kind,eventId,life=1.5) {
    if(!structure||!wodOwnerCanSee(wodLocalPlayerOwner(),structure))return;
    const id=eventId||kind+'-'+structure.q+','+structure.r+'-'+(gameData._wodSimTick||0);
    if(gameData._structureFxMap!==gameData.hexes){gameData._structureFxMap=gameData.hexes;gameData._structureFxSeen=new Set();}
    if(gameData._structureFxSeen.has(id))return;
    gameData._structureFxSeen.add(id);
    if(gameData._structureFxSeen.size>128)gameData._structureFxSeen.delete(gameData._structureFxSeen.values().next().value);
    const fx=wodCombatFxTake();Object.assign(fx,{kind:'structure',structureKind:kind,structure:{...structure},eventId:id,x:structure.x,y:structure.y,life,maxLife:1.5});
    if((gameData._combatFx||[]).length>=WOD_COMBAT_FX_CAP){const i=gameData._combatFx.findIndex(f=>f.kind==='tracer');if(i>=0)gameData._combatFxPool.push(gameData._combatFx.splice(i,1)[0]);}
    if(!wodCombatFxPush(fx))gameData._combatFxPool.push(fx);
    window.wodBattleAudio?.destroyStructure?.(structure);
}
/** Capturing a field structure destroys it; neither side inherits its aura. */
function wodSyncFortCapturesAfterTerritory() {
    for(const [field,kind] of [['forts','fort'],['hospitals','hospital']]){
        const list=gameData[field]||[];
        for(let i=list.length-1;i>=0;i--){
            const building=list[i],h=gameData.hexes[building.q+','+building.r];
            if(!h||!wodIsHostileOwner(h.owner,building.owner))continue;
            list.splice(i,1);wodEmitStructureDestruction(building,kind);
        }
    }
    gameData._structureCaptureDirty=false;
}
function wodDrawStructureDestruction(ctx,f) {
    const t=1-f.life/f.maxLife,s=f.structure,fade=Math.max(0,1-t*2.1);
    ctx.save();ctx.globalAlpha=fade;
    if(f.structureKind==='hospital')wodDrawHospital(ctx,s);
    else drawFortSticker(ctx,s,factionColors[s.owner],false,null,wodGetRenderPeriod());
    ctx.globalAlpha=1;ctx.translate(f.x,f.y);
    // Short hot flash over the actual building, followed by debris and dust.
    if(t<.3){const r=8+70*t,g=ctx.createRadialGradient(0,-5,1,0,-5,r);g.addColorStop(0,'#fff7d5');g.addColorStop(.3,'#ffd071');g.addColorStop(.65,'#e97532aa');g.addColorStop(1,'#c74a1800');ctx.fillStyle=g;ctx.globalAlpha=1-t/.3;ctx.beginPath();ctx.arc(0,-5,r,0,Math.PI*2);ctx.fill();}
    for(let i=0;i<12;i++){const a=i*2.39996,r=(12+(i%4)*6)*Math.sqrt(t),x=Math.cos(a)*r,y=Math.sin(a)*r-t*17;
        ctx.globalAlpha=Math.max(0,(1-t)*.56);ctx.fillStyle=i%3?'#5e5d54':'#b1a389';ctx.beginPath();ctx.arc(x,y,4+t*(7+i%4),0,Math.PI*2);ctx.fill();
        if(t<.65){ctx.globalAlpha=(1-t/.65)*.85;ctx.fillStyle=i%2?'#ebaf57':'#726451';ctx.save();ctx.translate(Math.cos(a)*r*1.5,Math.sin(a)*r*1.5+t*t*22);ctx.rotate(a+t*3);ctx.fillRect(-2,-2,4,3);ctx.restore();}
    }ctx.restore();
}
function wodEvaluateAllCityCaptures() {
    for(let city of gameData.cities) {
        // (a town that is nobody's, left by a faction that conceded or a map's empty towns, is taken like any other, by
        // holding all its streets: it used to stay nobody's for good)
        if(!city) continue;
        let urban = getCityUrbanTerrainHexes(city);
        if(urban.length === 0) {
            let ch = wodHexAt(city.q,city.r);
            if(!ch || ch.owner <= 0 || ch.owner === city.owner) continue;
            if(wodCityUrbanHasDefenderCombat(city, city.owner)) continue;
            wodExecuteCityCapture(city, ch.owner);
            continue;
        }
        let capturer = null;
        for(let uh of urban) {
            let hx = gameData.hexes[getHexKey(uh)];
            if(!hx || hx.owner <= 0) { capturer = null; break; }
            if(capturer == null) capturer = hx.owner;
            else if(capturer !== hx.owner) { capturer = null; break; }
        }
        if(capturer == null || capturer <= 0 || capturer === city.owner) continue;
        if(wodAreAllies(capturer, city.owner)) continue;
        if(wodCityUrbanHasDefenderCombat(city, city.owner)) continue;
        wodExecuteCityCapture(city, capturer);
    }
}
/** Capture flips only when every urban tile for this town is owned by the attacker. */
function attackerControlsAllCityUrbanTerrain(city, attackerOwner) {
    if(!city || attackerOwner == null) return false;
    let urban = getCityUrbanTerrainHexes(city);
    if(urban.length === 0) {
        let ch = wodHexAt(city.q,city.r);
        return !!(ch && !isWaterHex(ch) && ch.owner === attackerOwner);
    }
    for(let uh of urban) {
        let hx = gameData.hexes[getHexKey(uh)];
        if(!hx || hx.owner !== attackerOwner) return false;
    }
    return true;
}
function isFrontlineHex(hex, owner) {
    if(!hex || hex.owner !== owner) return hex && false;
    const nb = getNeighborHexes(hex);
    for(let j = 0; j < nb.length; j++) { const nHex = nb[j]; if(isClaimableLand(nHex) && (nHex.owner === 0 || wodIsHostileOwner(nHex.owner, owner))) return true; }
    return false;
}
function getSpatialCellKey(x, y, cellSize) {
    let cx = (Math.floor(x / cellSize) + 32768) | 0;
    let cy = (Math.floor(y / cellSize) + 32768) | 0;
    return cx * 65536 + cy;
}
function buildUnitSpatialGrid(cellSize = 96) {
    let grid = gameData._unitGridScratch;
    if(!grid || grid.cellSize !== cellSize) {
        grid = {cellSize, cells: new Map(), _pool: []};
        gameData._unitGridScratch = grid;
    } else {
        let pool = grid._pool;
        for(let bucket of grid.cells.values()) {
            bucket.length = 0;
            pool.push(bucket);
        }
        grid.cells.clear();
    }
    let pool = grid._pool;
    for(let i = 0; i < gameData.entities.length; i++) {
        let unit = gameData.entities[i];
        if(unit.hp <= 0) continue;
        unit._gridIndex = i;
        let key = getSpatialCellKey(unit.x, unit.y, cellSize);
        let bucket = grid.cells.get(key);
        if(!bucket) {
            bucket = pool.length ? pool.pop() : [];
            grid.cells.set(key, bucket);
        }
        bucket.push(unit);
    }
    return grid;
}
function forEachNearbyUnit(grid, x, y, radius, visitor) {
    if(!grid || !grid.cells) {
        for(let unit of gameData.entities) {
            if(visitor(unit)) return;
        }
        return;
    }
    let cellSize = grid.cellSize;
    let minCx = Math.floor((x - radius) / cellSize);
    let maxCx = Math.floor((x + radius) / cellSize);
    let minCy = Math.floor((y - radius) / cellSize);
    let maxCy = Math.floor((y + radius) / cellSize);
    for(let cy = minCy; cy <= maxCy; cy++) {
        for(let cx = minCx; cx <= maxCx; cx++) {
            let bucket = grid.cells.get((cx + 32768) * 65536 + (cy + 32768));
            if(!bucket) continue;
            for(let bi = 0, bl = bucket.length; bi < bl; bi++) {
                if(visitor(bucket[bi])) return;
            }
        }
    }
}
function wodCombatFxClear() {
    let fx = gameData._combatFx;
    if(fx && fx.length) {
        if(!gameData._combatFxPool) gameData._combatFxPool = [];
        for(let i = 0; i < fx.length; i++) gameData._combatFxPool.push(fx[i]);
        fx.length = 0;
    } else {
        gameData._combatFx = [];
    }
    if(gameData._combatBumps) gameData._combatBumps.clear();
}
function wodCombatFxTake() {
    if(!gameData._combatFxPool) gameData._combatFxPool = [];
    return gameData._combatFxPool.pop() || {};
}
function wodCombatFxPush(obj) {
    if(!gameData._combatFx) gameData._combatFx = [];
    if(gameData._combatFx.length >= WOD_COMBAT_FX_CAP) return false;
    gameData._combatFx.push(obj);
    return true;
}
function wodBakeFxSprite(w, h, drawFn) {
    let c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    let cctx = c.getContext('2d');
    cctx.save();
    cctx.translate(w * 0.5, h * 0.5);
    drawFn(cctx);
    cctx.restore();
    return c;
}
function wodBuildFxPrecache() {
    if(wodFxCache && wodFxCache.ready) return wodFxCache;
    let cache = {
        ready: false,
        spawnOver: [],
        combat: {
            muzzle: [],
            muzzleHeavy: [],
            smoke: [],
            impact: [],
            impactHeavy: [],
            tracer: [],
            tracerHeavy: []
        }
    };
    let bake = document.createElement('canvas');
    let bctx = bake.getContext('2d');
    let sz = WOD_SPAWN_FX_CANVAS_SIZE;
    bake.width = sz;
    bake.height = sz;
    for(let fi = 0; fi < WOD_SPAWN_FX_FRAME_COUNT; fi++) {
        bctx.clearRect(0, 0, sz, sz);
        bctx.save();
        bctx.translate(sz * 0.5, sz * 0.5);
        let rem = WOD_UNIT_SPAWN_FX_DUR * (1 - fi / Math.max(1, WOD_SPAWN_FX_FRAME_COUNT - 1));
        let fakeUnit = { spawnFx: rem, uid: '2048' };
        drawWodUnitSpawnFx(bctx, fakeUnit, WOD_SPAWN_FX_REF_R, false, 'back');
        drawWodUnitSpawnFx(bctx, fakeUnit, WOD_SPAWN_FX_REF_R, false, 'front');
        bctx.restore();
        let frame = document.createElement('canvas');
        frame.width = sz;
        frame.height = sz;
        frame.getContext('2d').drawImage(bake, 0, 0);
        cache.spawnOver.push(frame);
    }
    let n = WOD_COMBAT_SPRITE_CACHE_COUNT;
    for(let i = 0; i < n; i++) {
        let t = i / Math.max(1, n - 1);
        let fade = 1 - t * 0.92;
        cache.combat.muzzle.push(wodBakeFxSprite(40, 40, (c) => {
            let r = (6.8 * (0.42 + t * 1.25)) * 0.5;
            let a = fade * 0.88;
            c.globalCompositeOperation = 'lighter';
            c.fillStyle = 'rgba(255, 248, 220, ' + a + ')';
            c.beginPath();
            c.arc(0, 0, r, 0, Math.PI * 2);
            c.fill();
            c.globalAlpha = a * 0.5;
            c.fillStyle = '#2ecc71';
            c.beginPath();
            c.arc(0, 0, r * 0.52, 0, Math.PI * 2);
            c.fill();
            c.globalCompositeOperation = 'source-over';
            c.globalAlpha = 1;
        }));
        cache.combat.muzzleHeavy.push(wodBakeFxSprite(56, 56, (c) => {
            let r = (11 * (0.42 + t * 1.25)) * 0.5;
            let a = fade * 0.9;
            c.globalCompositeOperation = 'lighter';
            c.fillStyle = 'rgba(255, 248, 220, ' + a + ')';
            c.beginPath();
            c.arc(0, 0, r, 0, Math.PI * 2);
            c.fill();
            c.globalAlpha = a * 0.35;
            c.fillStyle = 'rgba(255, 200, 80, ' + (a * 0.35) + ')';
            c.beginPath();
            c.arc(0, 0, r * 1.35, 0, Math.PI * 2);
            c.fill();
            c.globalCompositeOperation = 'source-over';
            c.globalAlpha = 1;
        }));
        cache.combat.smoke.push(wodBakeFxSprite(36, 36, (c) => {
            let r = (5.6 * (0.4 + t * 1.35)) * 0.5;
            let a = fade * 0.38;
            c.fillStyle = 'rgba(90, 96, 104, ' + a + ')';
            c.beginPath();
            c.arc(0, 0, r, 0, Math.PI * 2);
            c.fill();
        }));
        cache.combat.impact.push(wodBakeFxSprite(44, 44, (c) => {
            let szI = 5.8 * (0.55 + t * 1.05) * 0.5;
            let a = fade * 0.95;
            c.globalAlpha = a;
            c.globalCompositeOperation = 'lighter';
            c.fillStyle = 'rgba(255, 236, 180, ' + (a * 0.75) + ')';
            c.beginPath();
            c.arc(0, 0, szI * 0.42, 0, Math.PI * 2);
            c.fill();
            c.globalCompositeOperation = 'source-over';
            c.strokeStyle = '#2ecc71';
            c.lineWidth = 1.6;
            for(let si = 0; si < 5; si++) {
                let ang = si * (Math.PI * 2 / 5) + t * 0.8;
                let len = szI * (0.75 + (1 - t) * 0.55);
                c.beginPath();
                c.moveTo(0, 0);
                c.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
                c.stroke();
            }
        }));
        cache.combat.impactHeavy.push(wodBakeFxSprite(56, 56, (c) => {
            let szI = 9.5 * (0.55 + t * 1.05) * 0.5;
            let a = fade * 0.95;
            c.globalAlpha = a;
            c.globalCompositeOperation = 'lighter';
            c.fillStyle = 'rgba(255, 236, 180, ' + (a * 0.75) + ')';
            c.beginPath();
            c.arc(0, 0, szI * 0.42, 0, Math.PI * 2);
            c.fill();
            c.globalCompositeOperation = 'source-over';
            c.strokeStyle = '#e74c3c';
            c.lineWidth = 2;
            for(let si = 0; si < 7; si++) {
                let ang = si * (Math.PI * 2 / 7) + t * 0.8;
                let len = szI * (0.75 + (1 - t) * 0.55);
                c.beginPath();
                c.moveTo(0, 0);
                c.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
                c.stroke();
            }
        }));
        let tracerLen = Math.round(24 + t * 88);
        let tracerW = 2 + t * 2.8;
        cache.combat.tracer.push(wodBakeFxSprite(tracerLen + 8, Math.ceil(tracerW * 4), (c) => {
            let half = tracerLen * 0.5;
            let a = fade;
            c.lineCap = 'round';
            c.globalCompositeOperation = 'lighter';
            c.globalAlpha = a * 0.5;
            c.strokeStyle = '#2ecc71';
            c.lineWidth = tracerW * 1.65;
            c.beginPath();
            c.moveTo(-half, 0);
            c.lineTo(half, 0);
            c.stroke();
            c.strokeStyle = '#fff8e8';
            c.globalAlpha = a * 0.94;
            c.lineWidth = tracerW;
            c.beginPath();
            c.moveTo(-half, 0);
            c.lineTo(half, 0);
            c.stroke();
            c.globalCompositeOperation = 'source-over';
            c.fillStyle = '#fffef5';
            c.globalAlpha = Math.min(1, a * 1.1);
            c.beginPath();
            c.arc(half, 0, tracerW * 0.65, 0, Math.PI * 2);
            c.fill();
        }));
        cache.combat.tracerHeavy.push(wodBakeFxSprite(tracerLen + 10, Math.ceil(tracerW * 5), (c) => {
            let half = tracerLen * 0.5;
            let a = fade;
            c.lineCap = 'round';
            c.globalCompositeOperation = 'lighter';
            c.globalAlpha = a * 0.32;
            c.strokeStyle = '#e74c3c';
            c.lineWidth = tracerW * 2.1;
            c.beginPath();
            c.moveTo(-half, 0);
            c.lineTo(half, 0);
            c.stroke();
            c.globalAlpha = a * 0.55;
            c.strokeStyle = '#e74c3c';
            c.lineWidth = tracerW * 1.65;
            c.beginPath();
            c.moveTo(-half, 0);
            c.lineTo(half, 0);
            c.stroke();
            c.strokeStyle = '#fff4d6';
            c.globalAlpha = a * 0.94;
            c.lineWidth = tracerW;
            c.beginPath();
            c.moveTo(-half, 0);
            c.lineTo(half, 0);
            c.stroke();
            c.globalCompositeOperation = 'source-over';
        }));
    }
    // a soft puff of powder smoke (Napoleonic volleys and broadsides: wodDrawVolleyFx)
    cache.combat.puff = wodBakeFxSprite(64, 64, (c) => {
        let g = c.createRadialGradient(0, 0, 2, 0, 0, 31);
        g.addColorStop(0, 'rgba(247, 245, 239, 1)');
        g.addColorStop(0.45, 'rgba(233, 230, 222, 0.78)');
        g.addColorStop(1, 'rgba(222, 218, 210, 0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(0, 0, 31, 0, Math.PI * 2);
        c.fill();
    });
    cache.ready = true;
    wodFxCache = cache;
    return cache;
}
function wodEnsureFxPrecache() {
    if(wodFxCache && wodFxCache.ready) return Promise.resolve(wodFxCache);
    if(wodFxCache && wodFxCache._promise) return wodFxCache._promise;
    wodFxCache = wodFxCache || {};
    wodFxCache._promise = new Promise((resolve) => {
        requestAnimationFrame(() => {
            try { resolve(wodBuildFxPrecache()); }
            catch(e) { console.warn('FX precache failed', e); resolve(wodFxCache); }
        });
    });
    return wodFxCache._promise;
}
function wodSpawnFxFrameIndex(unit) {
    let p = 1 - (unit.spawnFx || 0) / WOD_UNIT_SPAWN_FX_DUR;
    return Math.min(WOD_SPAWN_FX_FRAME_COUNT - 1, Math.max(0, (p * WOD_SPAWN_FX_FRAME_COUNT) | 0));
}
function wodDrawSpawnFxCached(ctx, unit, ur) {
    let rem = unit.spawnFx;
    if(!rem || rem <= 0) return;
    let cache = wodFxCache;
    if(cache && cache.ready && cache.spawnOver.length) {
        let fi = wodSpawnFxFrameIndex(unit);
        let frame = cache.spawnOver[fi];
        let drawR = ur * (WOD_SPAWN_FX_CANVAS_SIZE / (WOD_SPAWN_FX_REF_R * 2.15));
        ctx.drawImage(frame, -drawR, -drawR, drawR * 2, drawR * 2);
        return;
    }
    drawWodUnitSpawnFx(ctx, unit, ur, false, 'back');
    drawWodUnitSpawnFx(ctx, unit, ur, false, 'front');
}
function wodCombatMuzzlePoint(unit, targetX, targetY) {
    let dx = targetX - unit.x, dy = targetY - unit.y;
    let dist = Math.sqrt(dx * dx + dy * dy) || 1;
    let muzzleR = (unit.radius || 10) * 0.52;
    return { x: unit.x + (dx / dist) * muzzleR, y: unit.y + (dy / dist) * muzzleR };
}
function wodRefreshCombatCamBounds() {
    let viewW = canvas.clientWidth || UI.wrapper.clientWidth || wodCanvasAllocSize.w || 1;
    let viewH = canvas.clientHeight || UI.wrapper.clientHeight || wodCanvasAllocSize.h || 1;
    let camZ = gameData.camera.zoom > 0 && isFinite(gameData.camera.zoom) ? gameData.camera.zoom : 1;
    let camL = gameData.camera.x / camZ;
    let camT = gameData.camera.y / camZ;
    let pad = Math.max(72, 120 / camZ);
    gameData._combatFxPeriod = wodGetRenderPeriod();
    gameData._combatCamBounds = {
        l: camL - pad,
        r: camL + viewW / camZ + pad,
        t: camT - pad,
        b: camT + viewH / camZ + pad
    };
}
function wodCombatShotInView(mx, my) {
    let b = gameData._combatCamBounds;
    if(!b) return true;
    return mx >= b.l && mx <= b.r && my >= b.t && my <= b.b;
}
function wodCombatShotPhase(unit) {
    if(unit._combatShotPhase != null) return unit._combatShotPhase;
    let salt = 0;
    let uid = unit.uid || String(unit.owner || 0);
    for(let i = 0; i < uid.length; i++) salt = (salt * 33 + uid.charCodeAt(i)) | 0;
    unit._combatShotPhase = ((salt >>> 0) % 1000) / 1000;
    return unit._combatShotPhase;
}
function wodCombatShotVisualInterval(unit) {
    if(!unit) return 0.24;
    const eraInterval = WOD_ERA_FX_INTERVAL[wodCombatFxStyle(unit)];
    if(eraInterval) return eraInterval;
    if(unit.type === 'heavy') return 0.52;
    if(wodIsNavalUnit(unit)) return 0.38;
    if(unit.type === 'marine') return 0.30;
    return 0.22;
}
/** Seconds before a unit's first shot of a fight (its shot timer starts here and fires at the shot interval). */
function wodCombatShotFirstTimer(unit, interval) {
    const phase = wodCombatShotPhase(unit);
    // (a fight opens with its first clash, arrows or volley within about a second, each unit of a line at its own moment)
    return interval <= 0.6 ? phase * interval * 1.35 : Math.max(0, interval - 0.15 - phase * 0.9);
}
function wodEmitCombatShot(attacker, target) {
    if(!attacker || !target) return;
    if(gameData._combatFx && gameData._combatFx.length >= WOD_COMBAT_FX_CAP && !wodCombatFxMakeRoom()) return;
    if(!wodFogCanSeeUnit(attacker) && !wodFogCanSeeUnit(target)) return;
    let tx = target.x, ty = target.y;
    let mx = (attacker.x + tx) * 0.5, my = (attacker.y + ty) * 0.5;
    if(!wodCombatShotInView(mx, my)) return;
    const style = wodCombatFxStyle(attacker);
    if(style !== 'tracer') { wodEmitEraCombatFx(attacker, target, style); return; }
    let m = wodCombatMuzzlePoint(attacker, tx, ty);
    let dx = tx - m.x, dy = ty - m.y;
    let dist = Math.sqrt(dx * dx + dy * dy) || 1;
    let hitR = (target.radius || 10) * 0.42;
    let hx = tx - (dx / dist) * hitR;
    let hy = ty - (dy / dist) * hitR;
    let col = factionColors[attacker.owner] || '#f1c40f';
    let heavy = attacker.type === 'heavy';
    let ship = attacker.type === 'ship';
    let marine = attacker.type === 'marine';
    let tracerLife = heavy ? 0.36 : (ship ? 0.30 : (marine ? 0.24 : 0.20));
    let width = heavy ? 4.0 : (ship ? 3.0 : (marine ? 2.4 : 2.0));
    let tr = wodCombatFxTake();
    tr.kind = 'tracer';
    tr.x0 = m.x; tr.y0 = m.y; tr.x1 = hx; tr.y1 = hy;
    tr.life = tracerLife; tr.maxLife = tracerLife;
    tr.color = col; tr.width = width; tr.heavy = heavy;
    if(!wodCombatFxPush(tr)) gameData._combatFxPool.push(tr);
}

// ---- How each era fights on screen
// Modern armies fire tracers (above). Older armies fight the way their era did. It all comes from the same shot calls
// (the host's combat step, and a multiplayer guest's wodGuestCombatFx), so every player sees the same kind of fight:
//   melee     ancient and medieval foot: the unit lunges at its enemy and the two clash, with sparks and dust; two that
//             fight each other meet in the middle (wodCombatBumpOffset moves the drawn unit)
//   charge    horse, chariots and knights, and the Napoleonic horse regiments and dragoons: a harder, deeper lunge
//   arrows    medieval rangers and the warships of both eras loose arcing arrows; javelins: ancient skirmishers
//   volley    Napoleonic foot fires a volley every few seconds: flashes along the line, then a bank of smoke that drifts
//             off and thins; skirmish: chasseurs fire loose single shots; broadside: ships of the line
// Effects only: what a unit hits and when is the same in every era.
const WOD_ERA_FX_INTERVAL = { melee: 1.1, charge: 1.6, arrows: 1.5, javelins: 1.8, volley: 3.2, skirmish: 0.9, broadside: 4.2 };
function wodCombatFxStyle(unit, period) {
    period = period || gameData._combatFxPeriod || wodGetRenderPeriod();
    if(!unit || period === 'modern' || WOD_PERIOD_IDS.indexOf(period) < 0) return 'tracer';
    const t = unit.type;
    if(wodIsNavalUnit(unit)) return period === 'napoleonic' ? 'broadside' : 'arrows';
    if(t === 'heavy' || t === 'motorized') return 'charge';
    if(period === 'napoleonic') return t === 'mountaineer' ? 'skirmish' : 'volley';
    if(t === 'mountaineer') return period === 'ancient' ? 'javelins' : 'arrows';
    return 'melee';
}
function wodFxRand(seed, i) {
    const s = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    return s - Math.floor(s);
}
// (when the effect budget is full, the oldest smoke or landed arrows still thinning out make way for a new shot)
function wodCombatFxMakeRoom() {
    const fx = gameData._combatFx;
    let best = -1, left = Infinity;
    for(let i = 0; i < fx.length; i++) {
        const f = fx[i];
        if((f.kind === 'volley' || f.kind === 'arrows') && f.life < f.maxLife * 0.45 && f.life < left) { best = i; left = f.life; }
    }
    if(best < 0) return false;
    if(!gameData._combatFxPool) gameData._combatFxPool = [];
    gameData._combatFxPool.push(fx.splice(best, 1)[0]);
    return true;
}
function wodEmitEraCombatFx(attacker, target, style) {
    const period = gameData._combatFxPeriod || wodGetRenderPeriod();
    // (seeds from a counter, not Math.random: the scatter of arrows and smoke takes nothing from any random sequence)
    const seed = gameData._combatFxSeq = ((gameData._combatFxSeq | 0) + 1) & 0xffff;
    if(style === 'melee' || style === 'charge') wodEmitMeleeClash(attacker, target, style === 'charge', period, seed);
    else if(style === 'arrows' || style === 'javelins') wodEmitArrows(attacker, target, style === 'javelins', seed);
    else wodEmitVolley(attacker, target, style, seed);
}

// Melee: the lunge, as a share of the distance to the enemy over the bump's life: a short draw back, a rush in, the
// knock of the clash, and back into place.
const WOD_MELEE_HIT = 0.36;
const WOD_CLASH_COLORS = {
    ancient: { spark: '#ffd88a', dust: 'rgb(186, 164, 122)' },
    medieval: { spark: '#eef3ff', dust: 'rgb(160, 146, 118)' },
    napoleonic: { spark: '#fff2c4', dust: 'rgb(168, 150, 116)' }
};
const WOD_MELEE_KNOCK_SECONDS = 0.13;
function wodMeleeLunge(p) {
    if(p < 0.14) return -0.1 * Math.sin(p / 0.14 * Math.PI * 0.5);
    if(p < WOD_MELEE_HIT) { const q = (p - 0.14) / (WOD_MELEE_HIT - 0.14); return -0.1 + 1.1 * q * q; }
    if(p < 0.48) return 1 - 0.08 * Math.sin((p - WOD_MELEE_HIT) / (0.48 - WOD_MELEE_HIT) * Math.PI);
    const q = (p - 0.48) / 0.52;
    return 1 - q * q * (3 - 2 * q);
}
/** How far a unit fighting hand to hand is drawn from where it stands (null when it is not lunging). */
function wodCombatBumpOffset(unit) {
    const m = gameData._combatBumps;
    const f = m && m.size && unit.uid != null ? m.get(unit.uid) : null;
    if(!f || f.kind !== 'bump' || f.uid !== unit.uid || !(f.life > 0)) return null;
    // (a unit struck by one it is not fighting back is knocked back a little just as the blow lands, at the end of its
    // short bump)
    const k = (f.knock ? Math.sin(Math.min(1, Math.max(0, 1 - f.life / WOD_MELEE_KNOCK_SECONDS)) * Math.PI) : wodMeleeLunge(1 - f.life / f.maxLife)) * f.dist;
    return { x: f.dx * k, y: f.dy * k };
}
function wodEmitMeleeClash(a, b, charge, period, seed) {
    if(a.uid == null) return;
    const bumps = gameData._combatBumps || (gameData._combatBumps = new Map());
    if(bumps.has(a.uid)) return;
    const ax = a._drawX != null ? a._drawX : a.x, ay = a._drawY != null ? a._drawY : a.y;
    const bx = b._drawX != null ? b._drawX : b.x, by = b._drawY != null ? b._drawY : b.y;
    let dx = bx - ax, dy = by - ay;
    const d = Math.hypot(dx, dy);
    if(d < 0.5) return;
    dx /= d; dy /= d;
    const ra = a.radius || 10, rb = b.radius || 10;
    // (to where the two drawn units touch, a little over a unit's radius from its middle, and a little into the enemy,
    // so they visibly strike; a charge strikes deeper)
    const reach = Math.min(56, Math.max(ra * 0.6, d - (ra + rb) * (charge ? 1 : 1.1)));
    const bStyle = b.uid != null && b.hp > 0 && !bumps.has(b.uid) ? wodCombatFxStyle(b, period) : null;
    const room = (gameData._combatFx || []).length + 2 <= WOD_COMBAT_FX_CAP;
    const meet = room && b.combatTargetUid === a.uid && (bStyle === 'melee' || bStyle === 'charge');
    const life = charge ? 0.8 : 0.62, dist = meet ? reach * 0.5 : reach;
    const col = WOD_CLASH_COLORS[period] || WOD_CLASH_COLORS.medieval;
    const f = wodCombatFxTake();
    f.kind = 'bump'; f.uid = a.uid; f.dx = dx; f.dy = dy; f.dist = dist; f.life = life; f.maxLife = life;
    f.charge = charge; f.clash = true; f.knock = false; f.seed = seed; f.spark = col.spark; f.dust = col.dust;
    f.cx = ax + dx * (ra * 1.1 + dist); f.cy = ay + dy * (ra * 1.1 + dist); f.x = f.cx; f.y = f.cy;
    if(!wodCombatFxPush(f)) { gameData._combatFxPool.push(f); return; }
    bumps.set(a.uid, f);
    if(!bStyle || !room) return;
    // the enemy: if it fights this unit hand to hand too, it lunges back at the same moment and they meet in the middle;
    // otherwise it is knocked back a little as the blow lands
    const g = wodCombatFxTake();
    g.kind = 'bump'; g.uid = b.uid; g.life = life; g.maxLife = life; g.clash = false; g.seed = seed; g.spark = col.spark; g.dust = col.dust;
    g.cx = f.cx; g.cy = f.cy; g.x = f.cx; g.y = f.cy;
    if(meet) { g.dx = -dx; g.dy = -dy; g.dist = dist; g.charge = bStyle === 'charge'; g.knock = false; }
    else {
        g.dx = dx; g.dy = dy; g.dist = Math.min(6, rb * 0.4) * (charge ? 1.4 : 1); g.charge = false; g.knock = true;
        g.life = g.maxLife = life * WOD_MELEE_HIT + WOD_MELEE_KNOCK_SECONDS;
    }
    if(wodCombatFxPush(g)) bumps.set(b.uid, g);
    else { gameData._combatFxPool.push(g); if(meet) f.dist = reach; }
}
function wodDrawMeleeClash(ctx, f, gfxLite) {
    if(!f.clash) return false;
    const h = (1 - f.life / f.maxLife - WOD_MELEE_HIT) / (1 - WOD_MELEE_HIT);
    if(h < 0) return false;
    const x = f.cx, y = f.cy, big = f.charge ? 1.45 : 1;
    ctx.save();
    // dust kicked up where they meet
    const puffs = gfxLite ? 3 : (f.charge ? 7 : 5);
    ctx.fillStyle = f.dust;
    for(let i = 0; i < puffs; i++) {
        const a = wodFxRand(f.seed, i) * Math.PI * 2, sp = (6 + wodFxRand(f.seed, i + 9) * 9) * big;
        const r = (3 + h * 8 * big) * (0.7 + wodFxRand(f.seed, i + 17) * 0.6);
        ctx.globalAlpha = 0.4 * (1 - h) * (1 - h);
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * sp * h, y + Math.sin(a) * sp * h * 0.6 - h * 4, r, 0, Math.PI * 2);
        ctx.fill();
    }
    // the knock of weapons and shields: a bright flash and sparks thrown out to the sides
    if(h < 0.45) {
        const k = h / 0.45;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.spark;
        ctx.beginPath();
        ctx.arc(x, y, (2.6 + k * 2.5) * big, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = f.spark;
        ctx.lineWidth = 1.3;
        ctx.lineCap = 'round';
        const n = gfxLite ? 4 : 7, along = Math.atan2(f.dy, f.dx);
        for(let i = 0; i < n; i++) {
            const ang = along + (i % 2 ? 1 : -1) * Math.PI * 0.5 + (wodFxRand(f.seed, i + 30) - 0.5) * 1.6;
            const r0 = 2 + k * 7 * big, r1 = r0 + (4 + wodFxRand(f.seed, i + 40) * 4) * (1 - k * 0.6);
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0);
            ctx.lineTo(x + Math.cos(ang) * r1, y + Math.sin(ang) * r1);
            ctx.stroke();
        }
    }
    ctx.restore();
    return true;
}

// Arrows and javelins: a few at a time, each on its own arc to somewhere about the enemy, then stuck in the ground for a
// moment.
function wodEmitArrows(a, b, javelin, seed) {
    const m = wodCombatMuzzlePoint(a, b.x, b.y);
    const d = Math.hypot(b.x - m.x, b.y - m.y) || 1;
    const f = wodCombatFxTake();
    f.kind = 'arrows'; f.javelin = javelin; f.seed = seed;
    f.x0 = m.x; f.y0 = m.y; f.x1 = b.x; f.y1 = b.y; f.d = d;
    f.n = javelin ? 2 : (wodIsNavalUnit(a) ? 4 : 3);
    f.flight = (javelin ? 0.5 : 0.42) + d / (javelin ? 260 : 330);
    f.stagger = javelin ? 0.16 : 0.085;
    f.stick = 0.55;
    f.arc = d * (javelin ? 0.2 : 0.3) + 4;
    f.spreadFrom = (a.radius || 10) * 1.3;
    f.spreadTo = (b.radius || 10) * 1.1;
    f.life = f.maxLife = f.flight + f.stagger * (f.n - 1) + f.stick;
    f.x = (m.x + b.x) * 0.5; f.y = (m.y + b.y) * 0.5;
    if(!wodCombatFxPush(f)) gameData._combatFxPool.push(f);
}
function wodDrawArrowShape(ctx, hx, hy, vx, vy, len, javelin, alpha, stuck) {
    const tx = hx - vx * len, ty = hy - vy * len;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = javelin ? '#6b4a2b' : '#4a3320';
    ctx.lineWidth = javelin ? 2.1 : 1.6;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    if(!stuck) {
        ctx.fillStyle = '#d8d2c4';
        ctx.beginPath();
        ctx.moveTo(hx + vx * 3.4, hy + vy * 3.4);
        ctx.lineTo(hx - vy * 1.8, hy + vx * 1.8);
        ctx.lineTo(hx + vy * 1.8, hy - vx * 1.8);
        ctx.closePath();
        ctx.fill();
    }
    if(!javelin) {
        ctx.strokeStyle = '#efe6d2';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(tx + vx * 3, ty + vy * 3);
        ctx.lineTo(tx - vy * 2.3 - vx * 0.4, ty + vx * 2.3 - vy * 0.4);
        ctx.moveTo(tx + vx * 3, ty + vy * 3);
        ctx.lineTo(tx + vy * 2.3 - vx * 0.4, ty - vx * 2.3 - vy * 0.4);
        ctx.stroke();
    }
}
function wodDrawArrowsFx(ctx, f, gfxLite) {
    const age = f.maxLife - f.life, len = f.javelin ? 18 : 12;
    const ux = (f.x1 - f.x0) / f.d, uy = (f.y1 - f.y0) / f.d, px = -uy, py = ux;
    let drew = false;
    ctx.save();
    ctx.lineCap = 'round';
    for(let i = 0; i < f.n; i++) {
        const fa = age - i * f.stagger;
        if(fa < 0) continue;
        const sj = (wodFxRand(f.seed, i) - 0.5) * f.spreadFrom;
        const ej = (wodFxRand(f.seed, i + 7) - 0.5) * f.spreadTo * 2, el = (wodFxRand(f.seed, i + 13) - 0.5) * f.spreadTo * 1.4;
        const sx = f.x0 + px * sj, sy = f.y0 + py * sj;
        const ex = f.x1 + px * ej + ux * el, ey = f.y1 + py * ej + uy * el;
        const t = fa / f.flight;
        if(t <= 1) {
            const x = sx + (ex - sx) * t, y = sy + (ey - sy) * t, lift = f.arc * 4 * t * (1 - t);
            let vx = ex - sx, vy = (ey - sy) - f.arc * 4 * (1 - 2 * t);
            const vl = Math.hypot(vx, vy) || 1;
            vx /= vl; vy /= vl;
            if(!gfxLite) {
                // its shadow on the ground, under it
                ctx.globalAlpha = 0.2;
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(x - ux * len * 0.8, y - uy * len * 0.8);
                ctx.lineTo(x, y);
                ctx.stroke();
            }
            wodDrawArrowShape(ctx, x, y - lift, vx, vy, len, f.javelin, 1, false);
        } else {
            const k = (fa - f.flight) / f.stick;
            if(k >= 1) continue;
            let vx = ex - sx, vy = (ey - sy) + f.arc * 4;
            const vl = Math.hypot(vx, vy) || 1;
            wodDrawArrowShape(ctx, ex, ey, vx / vl, vy / vl, len * 0.72, f.javelin, 1 - k * k, true);
        }
        drew = true;
    }
    ctx.restore();
    return drew;
}

// Volleys: muzzle flashes along the front of the line, the balls, dust where they strike, and smoke from every musket
// that billows out toward the enemy, drifts with the wind and thins out over a few seconds.
const WOD_VOLLEY_KIND = {
    volley: { n: 6, life: 2.8, ripple: 0.012, ragged: 0.05, front: 0.9, width: 2.3, flash: 0.1, flashR: 4.2, flashLen: 10, travel: 0.14, r0: 5, r1: 15, alpha: 0.8, push: 10, rise: 3.5, puffs: 2, cannon: false },
    skirmish: { n: 1, life: 1.8, ripple: 0, ragged: 0, front: 0.9, width: 0, flash: 0.09, flashR: 3.6, flashLen: 9, travel: 0.14, r0: 4, r1: 11, alpha: 0.72, push: 7, rise: 3.5, puffs: 2, cannon: false },
    broadside: { n: 5, life: 3.4, ripple: 0.09, ragged: 0.04, front: 0.6, width: 1.8, flash: 0.13, flashR: 6, flashLen: 13, travel: 0.42, r0: 6, r1: 20, alpha: 0.8, push: 11, rise: 3, puffs: 2, cannon: true }
};
const WOD_SMOKE_WIND = { x: 2.2, y: -1.2 };
function wodEmitVolley(a, b, style, seed) {
    const cfg = WOD_VOLLEY_KIND[style] || WOD_VOLLEY_KIND.volley;
    let dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    const ra = a.radius || 10;
    const f = wodCombatFxTake();
    f.kind = 'volley'; f.style = style; f.seed = seed;
    f.dx = dx; f.dy = dy; f.px = -dy; f.py = dx; f.d = d;
    f.x0 = a.x + dx * ra * cfg.front; f.y0 = a.y + dy * ra * cfg.front;
    f.x1 = b.x; f.y1 = b.y; f.tr = (b.radius || 10) * 0.8;
    f.n = cfg.n; f.width = ra * cfg.width; f.water = wodIsNavalUnit(b);
    f.life = f.maxLife = cfg.life + (cfg.n - 1) * cfg.ripple + cfg.ragged;
    f.x = (f.x0 + b.x) * 0.5; f.y = (f.y0 + b.y) * 0.5;
    if(!wodCombatFxPush(f)) gameData._combatFxPool.push(f);
}
function wodDrawVolleyFx(ctx, f, gfxLite) {
    const cfg = WOD_VOLLEY_KIND[f.style] || WOD_VOLLEY_KIND.volley, age = f.maxLife - f.life;
    const puff = wodFxCache && wodFxCache.ready && wodFxCache.combat && wodFxCache.combat.puff;
    const puffs = gfxLite ? 1 : cfg.puffs;
    let drew = false;
    ctx.save();
    // the smoke first, under the flashes
    for(let i = 0; i < f.n; i++) {
        const fa = age - i * cfg.ripple - wodFxRand(f.seed, i) * cfg.ragged;
        if(fa < 0 || fa >= cfg.life) continue;
        const off = f.n > 1 ? (i / (f.n - 1) - 0.5) * f.width : 0;
        const lx = f.x0 + f.px * off, ly = f.y0 + f.py * off;
        const s = fa / cfg.life, grow = 1 - Math.exp(-fa * 2.4), out = 1 - Math.exp(-fa * 3);
        for(let j = 0; j < puffs; j++) {
            const rj = wodFxRand(f.seed, i * 5 + j + 50);
            const fwd = cfg.push * out * (1 + j * 0.55), side = (rj - 0.5) * cfg.r1 * 0.7 * grow;
            const cx = lx + f.dx * fwd + f.px * side + WOD_SMOKE_WIND.x * fa;
            const cy = ly + f.dy * fwd + f.py * side + WOD_SMOKE_WIND.y * fa - cfg.rise * fa;
            const r = (cfg.r0 + (cfg.r1 - cfg.r0) * grow) * (0.8 + rj * 0.4) * (j ? 0.85 : 1);
            const alpha = Math.min(1, fa / 0.06) * cfg.alpha * Math.pow(1 - s, 1.3) * (j ? 0.8 : 1);
            if(alpha <= 0.01) continue;
            ctx.globalAlpha = alpha;
            if(puff) ctx.drawImage(puff, cx - r, cy - r, r * 2, r * 2);
            else {
                ctx.fillStyle = '#ebe7de';
                ctx.beginPath();
                ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
                ctx.fill();
            }
            drew = true;
        }
    }
    // flashes, the shot in flight and where it lands
    for(let i = 0; i < f.n; i++) {
        const fa = age - i * cfg.ripple - wodFxRand(f.seed, i) * cfg.ragged;
        if(fa < 0 || fa > cfg.travel + 0.45) continue;
        const off = f.n > 1 ? (i / (f.n - 1) - 0.5) * f.width : 0;
        const lx = f.x0 + f.px * off, ly = f.y0 + f.py * off;
        const hj = (wodFxRand(f.seed, i + 20) - 0.5) * f.tr * 2, hl = (wodFxRand(f.seed, i + 25) - 0.5) * f.tr * 1.4;
        const hx = f.x1 + f.px * hj + f.dx * hl, hy = f.y1 + f.py * hj + f.dy * hl;
        if(fa < cfg.flash) {
            const k = fa / cfg.flash;
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = (1 - k) * 0.9;
            ctx.fillStyle = '#ffb54d';
            ctx.beginPath();
            ctx.arc(lx, ly, cfg.flashR * (1 - k * 0.4), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff3d0';
            ctx.beginPath();
            ctx.moveTo(lx + f.px * cfg.flashR * 0.6, ly + f.py * cfg.flashR * 0.6);
            ctx.lineTo(lx + f.dx * cfg.flashLen * (1 - k * 0.3), ly + f.dy * cfg.flashLen * (1 - k * 0.3));
            ctx.lineTo(lx - f.px * cfg.flashR * 0.6, ly - f.py * cfg.flashR * 0.6);
            ctx.closePath();
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            drew = true;
        }
        if(fa < cfg.travel && !gfxLite) {
            const t = fa / cfg.travel, x = lx + (hx - lx) * t, y = ly + (hy - ly) * t;
            if(cfg.cannon) {
                ctx.globalAlpha = 0.95;
                ctx.fillStyle = '#1e1e1e';
                ctx.beginPath();
                ctx.arc(x, y - f.d * 0.08 * 4 * t * (1 - t), 1.8, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.globalAlpha = 0.55;
                ctx.strokeStyle = '#f2ede0';
                ctx.lineWidth = 0.9;
                ctx.beginPath();
                ctx.moveTo(x - f.dx * 5, y - f.dy * 5);
                ctx.lineTo(x, y);
                ctx.stroke();
            }
            drew = true;
        }
        const ia = fa - cfg.travel;
        if(ia >= 0 && ia < 0.45) {
            const k = ia / 0.45, big = cfg.cannon ? 2.2 : 1;
            ctx.globalAlpha = (cfg.cannon ? 0.6 : 0.42) * (1 - k);
            ctx.fillStyle = f.water ? '#e8f4f8' : (cfg.cannon ? '#5f5446' : '#a8957a');
            if(f.water && cfg.cannon) {
                // a splash: a column of spray that rises and falls back
                for(let s = -1; s <= 1; s++) {
                    ctx.beginPath();
                    ctx.arc(hx + s * 2.4, hy - Math.sin(k * Math.PI) * (5 + (s ? 0 : 4)), 1.8 + k * 1.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else {
                for(let s = 0; s < 3; s++) {
                    const a = wodFxRand(f.seed, i * 3 + s + 70) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.arc(hx + Math.cos(a) * 3 * k * big, hy + Math.sin(a) * 2 * k * big - k * 3, (1.5 + k * 3) * big, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            drew = true;
        }
    }
    ctx.restore();
    return drew;
}
function wodDrawEraCombatFx(ctx, f, gfxLite) {
    if(f.kind === 'bump') return wodDrawMeleeClash(ctx, f, gfxLite);
    if(f.kind === 'arrows') return wodDrawArrowsFx(ctx, f, gfxLite);
    if(f.kind === 'volley') return wodDrawVolleyFx(ctx, f, gfxLite);
    return false;
}
// A multiplayer guest runs no simulation, so the shots the host's fights fire (wodEmitCombatShot, from the combat step)
// were never drawn there: guests saw the armies fight without gunfire, and no effect ever aged. The host's snapshots carry
// each unit's target and how hot its fighting is (combatTargetUid, activeCombatVisual, which fades within a second of the
// last shot); the guest fires the same tracers from them, at each unit's own shot rate, from where the units are drawn.
function wodGuestCombatFx(dt) {
    // (the view rectangle shots are culled to is refreshed by update(), which a guest never runs: without this it kept
    // the camera of the last game this page simulated, and fights outside that old view drew no shots)
    wodRefreshCombatCamBounds();
    wodUpdateCombatFx(dt);
    const ents = gameData.entities;
    if(!(dt > 0) || !ents || !ents.length) return;
    const byUid = new Map();
    for(const e of ents) if(e && e.uid != null && e.hp > 0) byUid.set(e.uid, e);
    const drawn = u => { const p = Object.create(u); p.x = u._drawX != null ? u._drawX : u.x; p.y = u._drawY != null ? u._drawY : u.y; return p; };
    let budget = WOD_COMBAT_SHOTS_PER_FRAME;
    for(const u of ents) {
        if(!u || u.hp <= 0 || u.type === 'convoy' || u.combatTargetUid == null || (u.activeCombatVisual || 0) < .25) { if(u) u._guestShotTimer = null; continue; }
        const t = byUid.get(u.combatTargetUid);
        if(!t || Math.hypot(t.x - u.x, t.y - u.y) > (u.range || 50) * wodGeneralStatMultiplier(u) * 1.5 + (gameData.hexRadius || 20)) continue;
        const interval = wodCombatShotVisualInterval(u);
        if(u._guestShotTimer == null) u._guestShotTimer = wodCombatShotFirstTimer(u, interval);
        u._guestShotTimer += dt;
        if(u._guestShotTimer >= interval && budget > 0) {
            u._guestShotTimer = Math.min(u._guestShotTimer - interval, interval);
            budget--;
            wodEmitCombatShot(drawn(u), drawn(t));
        }
    }
}
function wodDeferHeavySimDuringMarch() {
    // NOTE: this must NOT trip on the AI's own marches. It previously returned true
    // whenever 8+ units were moving in total, which froze the AI's strategy/spawn/
    // encirclement timers the moment the AI launched an attack wave — the AI visibly
    // "did something for a few seconds then stopped forever". All the heavy passes are
    // chunked with per-frame time budgets now, so only defer under an extreme player
    // march load where every spare millisecond matters.
    let pn = gameData._wodPlayerMovingN || 0;
    return pn >= 60;
}
function wodIsPlayerMarchOrder(unit) {
    return !!(unit && unit.target && unit.orderTarget && wodMpIsHumanOwner(unit.owner));
}
function wodUnitSmoothDrawXY(unit, simDt) {
    if(unit._drawX == null || unit._drawY == null) {
        unit._drawX = unit.x;
        unit._drawY = unit.y;
        return { x: unit.x, y: unit.y };
    }
    // A multiplayer guest knows each unit only where the host's last snapshot put it, every 100-180 ms. Easing to each
    // snapshot within a tenth of a second made marching units move and stop several times a second; a guest glides each
    // unit from where it was drawn to the snapshot's position over one snapshot gap instead (snapshot interpolation).
    if(unit._netAt != null && gameData.mp && gameData.mp.enabled && !gameData.mp.isHost) {
        const fx = unit._netFromX, fy = unit._netFromY;
        // (a snapshot a little late: keep gliding along the same line for up to a third of a gap; the next one corrects
        // from wherever the unit is drawn)
        const t = Math.min(1.35, (performance.now() - unit._netAt) / (gameData._mpNetGap || 150));
        unit._drawX = fx + (unit.x - fx) * t;
        unit._drawY = fy + (unit.y - fy) * t;
        return { x: unit._drawX, y: unit._drawY };
    }
    let dx = unit.x - unit._drawX;
    let dy = unit.y - unit._drawY;
    let distSq = dx * dx + dy * dy;
    // Hard snap only on teleports / huge desyncs (orders, deploy, MP snaps).
    if(distSq > 220 * 220) {
        unit._drawX = unit.x;
        unit._drawY = unit.y;
        return { x: unit.x, y: unit.y };
    }
    if(distSq < 0.04) {
        unit._drawX = unit.x;
        unit._drawY = unit.y;
        return { x: unit.x, y: unit.y };
    }
    // Always ease toward auth position — including while marching — so waypoint
    // snaps and multi-step catch-up never look like jerky teleports.
    let dt = simDt > 0 ? simDt : (1 / 60);
    let rate = unit.target ? 28 : 20;
    let k = 1 - Math.exp(-rate * dt);
    unit._drawX += dx * k;
    unit._drawY += dy * k;
    return { x: unit._drawX, y: unit._drawY };
}
function wodUpdateCombatFx(dt) {
    if(gameData._structureCaptureDirty&&(!gameData.mp?.enabled||gameData.mp.isHost))wodSyncFortCapturesAfterTerritory();
    let fx = gameData._combatFx;
    // (the units lunging at an enemy are rebuilt from the effects every step, so a unit never stays drawn mid-lunge)
    const bumps = gameData._combatBumps;
    if(bumps && bumps.size) bumps.clear();
    if(!fx || !fx.length) return;
    if(!gameData._combatFxPool) gameData._combatFxPool = [];
    let w = 0;
    for(let i = 0; i < fx.length; i++) {
        fx[i].life -= dt;
        if(fx[i].life > 0) {
            fx[w++] = fx[i];
            if(fx[i].kind === 'bump') (gameData._combatBumps || (gameData._combatBumps = new Map())).set(fx[i].uid, fx[i]);
        }
        else gameData._combatFxPool.push(fx[i]);
    }
    fx.length = w;
}
function wodDrawCombatFx(ctx, camL, camR, camT, camB, culPad, gfxLite, wodCull) {
    let fx = gameData._combatFx;
    if(!fx || !fx.length) return;
    let pad = culPad + 40;
    let drawCap = gfxLite ? 32 : (fx.length > 44 ? 48 : 62);
    let drawN = 0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for(let i = fx.length - 1; i >= 0; i--) {
        if(drawN >= drawCap) break;
        let f = fx[i];
        if(f.kind==='structure'){if(!wodCull||f.x>=camL-pad&&f.x<=camR+pad&&f.y>=camT-pad&&f.y<=camB+pad)wodDrawStructureDestruction(ctx,f);continue;}
        if(gameData.layers.units===false) continue;
        if(f.kind !== 'tracer') {
            if(wodCull && (f.x < camL - pad || f.x > camR + pad || f.y < camT - pad || f.y > camB + pad)) continue;
            if(wodDrawEraCombatFx(ctx, f, gfxLite)) drawN++;
            continue;
        }
        let mx = (f.x0 + f.x1) * 0.5;
        let my = (f.y0 + f.y1) * 0.5;
        if(wodCull && (mx < camL - pad || mx > camR + pad || my < camT - pad || my > camB + pad)) continue;
        let prog = 1 - f.life / f.maxLife;
        let headT = Math.min(1, prog * 1.12);
        let tailT = Math.max(0, headT - (f.heavy ? 0.42 : 0.34));
        let hx = f.x0 + (f.x1 - f.x0) * headT;
        let hy = f.y0 + (f.y1 - f.y0) * headT;
        let tx = f.x0 + (f.x1 - f.x0) * tailT;
        let ty = f.y0 + (f.y1 - f.y0) * tailT;
        let fade = Math.max(0, 1 - prog * 0.95);
        ctx.globalAlpha = fade * 0.42;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = f.width * (f.heavy ? 2.35 : 1.95);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.globalAlpha = fade * 0.96;
        ctx.strokeStyle = f.heavy ? '#fff4d6' : '#fff9ee';
        ctx.lineWidth = f.width * (f.heavy ? 1.25 : 1.05);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(hx, hy);
        ctx.stroke();
        ctx.globalAlpha = fade * 0.88;
        ctx.fillStyle = '#fffdf5';
        ctx.beginPath();
        ctx.arc(hx, hy, f.width * (f.heavy ? 0.62 : 0.48), 0, Math.PI * 2);
        ctx.fill();
        drawN++;
    }
    ctx.globalAlpha = 1;
}
function buildCitySpatialGrid(cellSize = 260) {
    let grid = gameData._cityGridScratch;
    if(!grid || grid.cellSize !== cellSize) {
        grid = {cellSize, cells: new Map()};
        gameData._cityGridScratch = grid;
    } else {
        grid.cells.clear();
    }
    for(let i = 0; i < gameData.cities.length; i++) {
        let city = gameData.cities[i];
        let key = getSpatialCellKey(city.x, city.y, cellSize);
        let bucket = grid.cells.get(key);
        if(!bucket) {
            bucket = [];
            grid.cells.set(key, bucket);
        }
        bucket.push(city);
    }
    return grid;
}
function countNearbyUnits(owner, x, y, radius, enemyOnly = false) {
    let count = 0;
    let r2 = radius * radius;
    forEachNearbyUnit(gameData.unitSpatialGrid, x, y, radius, (unit) => {
        if(unit.type === 'convoy' || unit.hp <= 0) return;
        let isMatch = enemyOnly ? wodIsHostileOwner(unit.owner, owner) : wodIsFriendlyOwner(unit.owner, owner);
        if(!isMatch || (enemyOnly&&!wodOwnerCanSee(owner,unit))) return;
        let dx = unit.x - x;
        let dy = unit.y - y;
        if(dx * dx + dy * dy <= r2) count++;
    });
    return count;
}
function getUnitUpkeep(unit) {
    if(WOD_SPECIALIST_UNITS[unit.type])return WOD_SPECIALIST_UNITS[unit.type].upkeep;
    if(unit.type === 'convoy') return 0;
    if(unit.type === 'supply')return .65;
    if(unit.type === 'transport')return .6+(unit.cargo?getUnitUpkeep(unit.cargo):0);
    if(unit.type === 'heavy') return 4.0;
    if(wodIsNavalUnit(unit)) return 1.5;
    return 0.45;
}
// Both counters include passengers aboard transports (unit.cargo), counted right after their transport.
function getOwnerTroopManpower(owner) {
    let total = 0;
    const add = unit => {
        if(unit.owner === owner && unit.type !== 'convoy' && unit.hp > 0)
            total += unit.manpower !== undefined ? unit.manpower : Math.round((unit.hp / unit.maxHp) * 1000);
    };
    for(const t of gameData.entities) { add(t); if(t.cargo) add(t.cargo); }
    return total;
}
function getOwnerTanks(owner) {
    let total = 0;
    const add = unit => {
        if(unit.owner === owner && unit.type === 'heavy' && unit.hp > 0)
            total += unit.tanks !== undefined ? unit.tanks : Math.round((unit.hp / unit.maxHp) * 500);
    };
    for(const t of gameData.entities) { add(t); if(t.cargo) add(t.cargo); }
    return total;
}
function getOwnerShipCount(owner) {
    let n = 0;
    for(let unit of gameData.entities) {
        if(unit.owner === owner && wodIsNavalUnit(unit) && unit.hp > 0) n++;
    }
    return n;
}
function countCitiesForOwner(owner) {
    let n = 0;
    for(let c of gameData.cities) {
        if(c.owner === owner) n++;
    }
    return n;
}
function factionControlsAnyCity(owner) {
    return gameData.cities.some(c => c.owner === owner);
}
function anyEnemyOwnedCityRemainsFor(owner) {
    return gameData.cities.some(c => wodIsHostileOwner(c.owner, owner));
}
function countFriendlyCombatExcludingConvoys(owner) {
    let n = 0;
    for(let u of gameData.entities) {
        if(u.hp <= 0 || u.owner !== owner || u.type === 'convoy') continue;
        n++;
    }
    return n;
}
function countEnemyCombatExcludingConvoysFor(owner) {
    let n = 0;
    for(let u of gameData.entities) {
        if(u.hp <= 0 || u.type === 'convoy') continue;
        if(wodIsHostileOwner(u.owner, owner)) n++;
    }
    return n;
}
function playerControlsAnyCity() {
    return factionControlsAnyCity(1);
}
function anyEnemyOwnedCityRemains() {
    return anyEnemyOwnedCityRemainsFor(1);
}
function openCampaignBattleSummary(outcomeKind, headline, reasonLine) {
    wodFinishLifetimeMatch(outcomeKind,gameData._lifetimeEndReason);
    let overlay = document.getElementById('campaignSummaryOverlay');
    let panel = document.getElementById('campaignSummaryPanel');
    let titleEl = document.getElementById('campaignSummaryTitle');
    let subEl = document.getElementById('campaignSummarySub');
    let statsEl = document.getElementById('campaignSummaryStats');
    if(!overlay || !panel || !titleEl || !subEl || !statsEl) return;
    let isMp = !!(gameData.mp && gameData.mp.enabled);
    let soloOppOwners = isMp ? [] : wodCollectSoloOpponentOwners();
    let lo = wodLocalPlayerOwner();
    let summaryTeams = wodBuildAllianceTeams(wodParticipatingOwnersForSummary(isMp, soloOppOwners, lo), lo);
    let hasAlliedTeam = summaryTeams.some(function(t) { return t.allied; });
    let myTeam = summaryTeams.find(function(t) { return t.owners.indexOf(lo) >= 0; }) || { owners: [lo], allied: false };
    let rivalOwners = [];
    for(let ti = 0; ti < summaryTeams.length; ti++) {
        if(summaryTeams[ti].owners.indexOf(lo) < 0) rivalOwners.push.apply(rivalOwners, summaryTeams[ti].owners);
    }
    panel.classList.toggle('campaign-summary--victory', outcomeKind === 'victory');
    panel.classList.toggle('campaign-summary--defeat', outcomeKind === 'defeat');
    panel.classList.toggle('campaign-summary--mp-wide', isMp || soloOppOwners.length >= 2 || hasAlliedTeam);
    titleEl.textContent = outcomeKind === 'victory' ? 'Victory' : 'Defeat';
    subEl.textContent = reasonLine || headline || '';
    const nextBtn=document.getElementById('wodNextPackStage'),entry=gameData._selectedMissionEntry;
    const next=outcomeKind==='victory'&&entry?.packId?wodShopMissionStages().find(s=>s.packId===entry.packId&&s.stageIndex===entry.stageIndex+1&&wodStoreMissionPlayable(s)):null;
    if(nextBtn){nextBtn.classList.toggle('hidden',!next);nextBtn.dataset.missionId=next?.id||'';nextBtn.textContent=next?'Next: '+next.name:'Next campaign stage';}

    let elapsedSec = (performance.now() - (gameData.gameSessionStartedPerfMs || performance.now())) / 1000;
    let campMeta = gameData._lastCampaignBattleMeta || null;
    let campRun = gameData._campaignRun || (campMeta ? { defense: !!campMeta.defense, holdSec: campMeta.holdSec || 0 } : null);
    let modeKey = (campRun && campRun.defense) ? 'defense'
        : (gameData.victoryMode === 'annihilation' ? 'annihilation' : 'domination');
    let victoryLabel = modeKey === 'annihilation' ? 'Annihilation'
        : (modeKey === 'defense' ? 'Defense' : 'Domination');
    let victoryRule = modeKey === 'defense'
        ? ('Survive for ' + wodFormatHoldClock(campRun.holdSec || WOD_ROGUE_BATTLE_HOLD_SEC) + ' while holding a town.')
        : (WOD_VICTORY_MODE_DETAIL_TEXT[modeKey] || '');
    if(gameData.mission?.objective){victoryLabel='Mission objective';victoryRule=gameData.mission.objective.label;}

    let plyCities, enCities, enArmies, plyArmies, plyIncomeAcc, aiIncomeAcc;
    let plyMpLoss, aiMpLoss, plyTkLoss, aiTkLoss, plyShLoss, aiShLoss;
    let endCashVal, endMpVal;
    let rivalIncomeTitle, rivalIncomeSub, shareRivalLabel, lossCardTitle, rivalLossShort, rivalLossLegend;
    let youIncomeSub = 'Gross revenue from your cities this match';
    let snapCityYou = 'Your cities';
    let snapArmyYou = 'Your field armies';
    let mpSelfNameEsc = '';

    if(isMp) {
        mpSelfNameEsc = wodMpEscapeHtml(wodMpDisplayNameForSlot(lo, { gameDataMp: gameData.mp }));
        plyCities = myTeam.allied ? wodCountCitiesForOwners(myTeam.owners) : countCitiesForOwner(lo);
        enCities = wodCountHostileCitiesFor(lo);
        enArmies = countEnemyCombatExcludingConvoysFor(lo);
        plyArmies = myTeam.allied ? wodCountArmiesForOwners(myTeam.owners) : countFriendlyCombatExcludingConvoys(lo);
        let sessionAcc = gameData._sessionIncomeAcc || { player: 0, ai: 0, byOwner: {} };
        let byO = sessionAcc.byOwner || {};
        if(myTeam.allied) {
            plyIncomeAcc = Math.max(0, Math.floor(wodSumByOwnerMapForOwners(myTeam.owners, byO)));
            aiIncomeAcc = Math.max(0, Math.floor(wodSumByOwnerMapForOwners(rivalOwners, byO)));
            plyMpLoss = 0; aiMpLoss = 0; plyTkLoss = 0; aiTkLoss = 0; plyShLoss = 0; aiShLoss = 0;
            for(let i = 0; i < myTeam.owners.length; i++) {
                plyMpLoss += getOwnerCasualties(myTeam.owners[i]);
                plyTkLoss += getOwnerTankCasualties(myTeam.owners[i]);
                plyShLoss += getOwnerShipCasualties(myTeam.owners[i]);
            }
            for(let i = 0; i < rivalOwners.length; i++) {
                aiMpLoss += getOwnerCasualties(rivalOwners[i]);
                aiTkLoss += getOwnerTankCasualties(rivalOwners[i]);
                aiShLoss += getOwnerShipCasualties(rivalOwners[i]);
            }
        } else {
            plyIncomeAcc = Math.max(0, Math.floor(byO[lo] || 0));
            aiIncomeAcc = Math.max(0, Math.floor(wodSumByOwnerMapExcluding(lo, byO)));
            plyMpLoss = getOwnerCasualties(lo);
            aiMpLoss = wodSumByOwnerMapExcluding(lo, gameData.casualtiesByOwner);
            plyTkLoss = getOwnerTankCasualties(lo);
            aiTkLoss = wodSumByOwnerMapExcluding(lo, gameData.tankCasualtiesByOwner);
            plyShLoss = getOwnerShipCasualties(lo);
            aiShLoss = wodSumByOwnerMapExcluding(lo, gameData.shipCasualtiesByOwner);
        }
        endCashVal = Math.floor(wodPlayerTreasury(lo));
        endMpVal = Math.floor(wodPlayerMpPool(lo));
        rivalIncomeTitle = 'All rivals (combined)';
        rivalIncomeSub = 'Sum of every other faction\'s city revenue this match';
        shareRivalLabel = 'Rivals combined';
        lossCardTitle = 'Total losses (' + mpSelfNameEsc + ' vs rivals)';
        rivalLossShort = 'Rivals';
        rivalLossLegend = 'Combined rival losses';
    } else {
        plyCities = myTeam.allied ? wodCountCitiesForOwners(myTeam.owners) : countCitiesForOwner(1);
        enCities = wodCountHostileCitiesFor(1);
        enArmies = countEnemyCombatUnitsExcludingConvoys();
        plyArmies = myTeam.allied ? wodCountArmiesForOwners(myTeam.owners) : countPlayerCombatUnitsExcludingConvoys();
        let sessionAcc = gameData._sessionIncomeAcc || { player: 0, ai: 0, byOwner: {} };
        let byOSoloAcc = sessionAcc.byOwner || {};
        if(myTeam.allied) {
            plyIncomeAcc = Math.max(0, Math.floor(wodSumByOwnerMapForOwners(myTeam.owners, byOSoloAcc)));
            aiIncomeAcc = Math.max(0, Math.floor(wodSumByOwnerMapForOwners(rivalOwners, byOSoloAcc)));
            plyMpLoss = 0; aiMpLoss = 0; plyTkLoss = 0; aiTkLoss = 0; plyShLoss = 0; aiShLoss = 0;
            for(let i = 0; i < myTeam.owners.length; i++) {
                plyMpLoss += getOwnerCasualties(myTeam.owners[i]);
                plyTkLoss += getOwnerTankCasualties(myTeam.owners[i]);
                plyShLoss += getOwnerShipCasualties(myTeam.owners[i]);
            }
            for(let i = 0; i < rivalOwners.length; i++) {
                aiMpLoss += getOwnerCasualties(rivalOwners[i]);
                aiTkLoss += getOwnerTankCasualties(rivalOwners[i]);
                aiShLoss += getOwnerShipCasualties(rivalOwners[i]);
            }
        } else {
            plyIncomeAcc = Math.max(0, Math.floor(sessionAcc.player || 0));
            aiIncomeAcc = Math.max(0, Math.floor(sessionAcc.ai || 0));
            plyMpLoss = getOwnerCasualties(1);
            aiMpLoss = wodSumNumericOwnedByAi(gameData.casualtiesByOwner);
            plyTkLoss = getOwnerTankCasualties(1);
            aiTkLoss = wodSumNumericOwnedByAi(gameData.tankCasualtiesByOwner);
            plyShLoss = getOwnerShipCasualties(1);
            aiShLoss = wodSumNumericOwnedByAi(gameData.shipCasualtiesByOwner);
        }
        endCashVal = Math.floor(gameData.money || 0);
        endMpVal = Math.floor(gameData.manpower || 0);
        rivalIncomeTitle = 'All AI (combined)';
        rivalIncomeSub = 'Sum of all AI factions\' city revenue';
        shareRivalLabel = 'AI combined';
        lossCardTitle = 'Total losses (you vs AI)';
        rivalLossShort = 'AI';
        rivalLossLegend = 'Combined AI losses';
    }
    if(myTeam.allied) {
        youIncomeSub = 'Gross revenue from your team\'s cities this match';
        snapCityYou = 'Team cities';
        snapArmyYou = 'Team field armies';
        rivalIncomeTitle = 'Opposing teams';
        rivalIncomeSub = isMp
            ? 'Sum of every opposing team\'s city revenue this match'
            : 'Sum of every opposing team\'s city revenue';
        shareRivalLabel = 'Opposing teams';
        lossCardTitle = 'Total losses (your team vs opposing teams)';
        rivalLossShort = 'Opposing';
        rivalLossLegend = 'Combined opposing-team losses';
    }

    let barMp = wodDualLossBarWidths(plyMpLoss, aiMpLoss);
    let barTk = wodDualLossBarWidths(plyTkLoss, aiTkLoss);
    let barSh = wodDualLossBarWidths(plyShLoss, aiShLoss);
    let barUsd = wodDualLossBarWidths(plyIncomeAcc, aiIncomeAcc);
    let grossSum = plyIncomeAcc + aiIncomeAcc;
    let pctYouUsd = grossSum > 0 ? Math.round((100 * plyIncomeAcc) / grossSum) : 50;
    let pctAiUsd = grossSum > 0 ? Math.round((100 * aiIncomeAcc) / grossSum) : 50;
    let townsCapSummary = myTeam.allied
        ? wodSumByOwnerMapForOwners(myTeam.owners, gameData.sessionCitiesCapturedByOwner)
        : (isMp
            ? ((gameData.sessionCitiesCapturedByOwner && gameData.sessionCitiesCapturedByOwner[lo]) || 0)
            : (gameData.sessionCitiesCaptured || 0));
    let campUnitsLostThisBattle = 0;
    if(campMeta) {
        campUnitsLostThisBattle = campMeta.unitsLost | 0;
        let killed = campMeta.unitsKilled | 0;
        if(subEl) {
            let bits = [];
            bits.push(killed + ' unit' + (killed === 1 ? '' : 's') + ' killed');
            bits.push(campUnitsLostThisBattle + ' unit' + (campUnitsLostThisBattle === 1 ? '' : 's') + ' lost');
            if(campMeta.unitsKilledTotal != null || campMeta.unitsLostTotal != null) {
                bits.push('campaign ' + (campMeta.unitsKilledTotal | 0) + 'K/' + (campMeta.unitsLostTotal | 0) + 'L');
            }
            subEl.textContent = (subEl.textContent ? subEl.textContent + ' · ' : '') + bits.join(' · ');
        }
    } else if(campRun) {
        let before = campRun.rosterAtStart | 0;
        let aliveNow = 0;
        for(let u of gameData.entities || []) if(u && u.owner === lo && u.hp > 0 && u._campRosterId) aliveNow++;
        if(!before) before = aliveNow;
        campUnitsLostThisBattle = Math.max(0, before - aliveNow);
        let killed = gameData.playerUnitsKilled | 0;
        if(subEl) {
            subEl.textContent = (subEl.textContent ? subEl.textContent + ' · ' : '') +
                killed + ' unit' + (killed === 1 ? '' : 's') + ' killed · ' +
                campUnitsLostThisBattle + ' unit' + (campUnitsLostThisBattle === 1 ? '' : 's') + ' lost';
        }
    }

    let csYouLbl = myTeam.allied ? 'Your team' : (isMp ? mpSelfNameEsc : 'You');

    let teamTableSection = '';
    if(isMp || soloOppOwners.length >= 2 || hasAlliedTeam) {
        let endSpec = gameData._mpLastMatchEnd || {};
        let ocEnd = endSpec.outcomes || {};
        let byOTable = (gameData._sessionIncomeAcc && gameData._sessionIncomeAcc.byOwner) || {};
        teamTableSection = wodRenderEndScreenTeamTable(isMp, summaryTeams, hasAlliedTeam, lo, outcomeKind, ocEnd, byOTable);
    }

    statsEl.innerHTML =
        '<section class="cs-card">' +
            '<p class="cs-card-title">Objective</p>' +
            '<p style="margin:0 0 6px;color:#ecf0f1;font-size:1.05rem;font-weight:800;">' + victoryLabel + '</p>' +
            '<p style="margin:0;color:#bdc3c7;font-size:0.92rem;line-height:1.45;">' + victoryRule + '</p>' +
        '</section>' +
        '<section class="cs-card">' +
            '<p class="cs-card-title">Battle snapshot</p>' +
            '<div class="cs-kv-grid">' +
                '<span>Duration</span><span>' + formatGameDurationForSummary(elapsedSec) + '</span>' +
                '<span>Team land tiles</span><span>' + myTeam.owners.reduce((n,o)=>n+(wodLandTileCounts().counts[o]||0),0).toLocaleString('en-US') + '</span>' +
                '<span>Rival land tiles</span><span>' + rivalOwners.reduce((n,o)=>n+(wodLandTileCounts().counts[o]||0),0).toLocaleString('en-US') + '</span>' +
                '<span>' + snapCityYou + '</span><span>' + plyCities + '</span>' +
                '<span>Enemy cities</span><span>' + enCities + '</span>' +
                '<span>Towns captured</span><span>' + townsCapSummary + '</span>' +
                '<span>' + snapArmyYou + '</span><span>' + plyArmies + '</span>' +
                '<span>Enemy field armies</span><span>' + enArmies + '</span>' +
                '<span>Ending $</span><span>$' + endCashVal.toLocaleString('en-US') + '</span>' +
                '<span>Manpower pool</span><span>' + formatFullCount(endMpVal) + '</span>' +
            '</div>' +
        '</section>' +
        '<section class="cs-card">' +
            '<p class="cs-card-title">Income accrued (city revenue)</p>' +
            '<div class="cs-dual">' +
                '<div class="cs-pillar">' +
                    '<h5>' + csYouLbl + '</h5>' +
                    '<div class="cs-big">$' + plyIncomeAcc.toLocaleString('en-US') + '</div>' +
                    '<div class="cs-sub">' + youIncomeSub + '</div>' +
                '</div>' +
                '<div class="cs-pillar">' +
                    '<h5>' + rivalIncomeTitle + '</h5>' +
                    '<div class="cs-big">$' + aiIncomeAcc.toLocaleString('en-US') + '</div>' +
                    '<div class="cs-sub">' + rivalIncomeSub + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="cs-bar-row" aria-hidden="true">' +
                '<div class="cs-bar-head"><span>Share of total gross income</span><span>' + csYouLbl + ' ' + pctYouUsd + '% · ' + shareRivalLabel + ' ' + pctAiUsd + '%</span></div>' +
                '<div class="cs-bar-track">' +
                    '<div class="cs-bar-a" style="width:' + barUsd.wYou + '"></div>' +
                    '<div class="cs-bar-b" style="width:' + barUsd.wAi + '"></div>' +
                '</div>' +
                '<div class="cs-legend-inline">' +
                    '<span><span class="cs-dot you" role="presentation"></span> ' + csYouLbl + '</span>' +
                    '<span><span class="cs-dot ai" role="presentation"></span> ' + shareRivalLabel + '</span>' +
                '</div>' +
            '</div>' +
        '</section>' +
        '<section class="cs-card">' +
            '<p class="cs-card-title">' + lossCardTitle + '</p>' +
            '<div class="cs-bar-row">' +
                '<div class="cs-bar-head"><span>Soldiers lost (manpower)</span><span>' + csYouLbl + ' ' + formatFullCount(plyMpLoss) + ' · ' + rivalLossShort + ' ' + formatFullCount(aiMpLoss) + '</span></div>' +
                '<div class="cs-bar-track">' +
                    '<div class="cs-bar-a" style="width:' + barMp.wYou + '"></div>' +
                    '<div class="cs-bar-b" style="width:' + barMp.wAi + '"></div>' +
                '</div>' +
            '</div>' +
            '<div class="cs-bar-row">' +
                '<div class="cs-bar-head"><span>' + wodActivePeriodFlavor().summaryHeavyDestroyed + '</span><span>' + csYouLbl + ' ' + formatTanks(plyTkLoss) + ' · ' + rivalLossShort + ' ' + formatTanks(aiTkLoss) + '</span></div>' +
                '<div class="cs-bar-track">' +
                    '<div class="cs-bar-a" style="width:' + barTk.wYou + '"></div>' +
                    '<div class="cs-bar-b" style="width:' + barTk.wAi + '"></div>' +
                '</div>' +
            '</div>' +
            '<div class="cs-bar-row">' +
                '<div class="cs-bar-head"><span>Ships lost</span><span>' + csYouLbl + ' ' + formatTanks(plyShLoss) + ' · ' + rivalLossShort + ' ' + formatTanks(aiShLoss) + '</span></div>' +
                '<div class="cs-bar-track">' +
                    '<div class="cs-bar-a" style="width:' + barSh.wYou + '"></div>' +
                    '<div class="cs-bar-b" style="width:' + barSh.wAi + '"></div>' +
                '</div>' +
                '<div class="cs-legend-inline">' +
                    '<span><span class="cs-dot you" role="presentation"></span> ' + (isMp ? (csYouLbl + ' (losses)') : 'Your losses') + '</span>' +
                    '<span><span class="cs-dot ai" role="presentation"></span> ' + rivalLossLegend + '</span>' +
                '</div>' +
            '</div>' +
        '</section>' +
        teamTableSection;

    statsEl.innerHTML+='<section class="cs-card battle-final-stats"><p class="cs-card-title">Territory & detailed faction totals</p>'+wodRenderFactionStats(true)+'</section>';
    statsEl.insertAdjacentHTML('afterbegin',wodMatchGoldReport());
    overlay.classList.remove('hidden');
    wodSyncSpectatorUi();
    wodPrewarmMenuBattleForSummary();
}
function triggerCampaignVictory(message, countAsBattleWon) {
    if(gameData._campaignEnded) return;
    if(gameData._campaignRun && !gameData._campaignRun.battleLive) return;
    if(gameData._matchReadyForEndChecks === false) return;
    if(wodEscMenuOpen()) toggleEscMenu(false);
    gameData._campaignEnded = true;
    setGameSpeed(0, true);
    wodResetEndCountdowns();
    wodRecordMissionCompleted();
    if(gameData._campaignRun) wodCampaignAfterBattle(true);
    openCampaignBattleSummary('victory', message, message);
    if(countAsBattleWon && wodProgress && gameState === 'PLAYING' && !gameData.menuAttractMode) {
        wodBumpLifetime('battlesWon', 1);
        checkWodAchievements();
        scheduleSaveWodProgress();
    }
    wodFlushLifetimeProgress();
}
function triggerCampaignDefeat(message) {
    if(gameData._spectator)return;
    if(gameData._campaignEnded) return;
    // Ignore false defeats before the match/army is actually live.
    if(gameData._campaignRun && !gameData._campaignRun.battleLive) return;
    if(gameData._matchReadyForEndChecks === false) return;
    if(wodEscMenuOpen()) toggleEscMenu(false);
    wodPrepareSpectatorChoice('defeat');
    gameData._campaignEnded = true;
    setGameSpeed(0, true);
    wodResetEndCountdowns();
    if(gameData._campaignRun) wodCampaignAfterBattle(false);
    openCampaignBattleSummary('defeat', message, message);
    wodFinalizePersonalEnd();
}
function getCityUrbanTerrainHexes(city) {
    if(!city) return [];
    if(city._urbanHexCache?.length&&gameData.hexes[getHexKey(city._urbanHexCache[0])]===city._urbanHexCache[0]) return city._urbanHexCache;
    let list = [];
    if(city.id) {
        for(let h of gameData.hexList) {
            if(!h || isWaterHex(h)) continue;
            if(h.type !== 'urban') continue;
            if(h.cityId === city.id) list.push(h);
        }
    }
    if(list.length === 0) {
        for(let ch of getHexesInRadius(city.q, city.r, 3)) {
            let h = wodHexAt(ch.q,ch.r);
            if(h && !isWaterHex(h) && h.type === 'urban') list.push(h);
        }
    }
    if(list.length === 0) {
        let ctr = wodHexAt(city.q,city.r);
        if(ctr && !isWaterHex(ctr)) list.push(ctr);
    }
    city._urbanHexCache = list;
    return list;
}
/** True when the town hex / urban footprint sits in an encircled pocket. */
function isCityEncircledForProduction(city) {
    if(!city || !city.id) return false;
    let ch = wodHexAt(city.q,city.r);
    if(ch && wodGetHexEncirclementState(ch)) return true;
    let urban = getCityUrbanTerrainHexes(city);
    for(let i = 0, n = urban.length; i < n; i++) {
        if(urban[i] && wodGetHexEncirclementState(urban[i])) return true;
    }
    return false;
}
/** True when urban combat or encirclement blocks recruiting from this town. */
function wodShipEngagesTown(ship,city,urban=getCityUrbanTerrainHexes(city),keys=null) {
    // (a unit's cell is looked up once and compared by key; the cheap tests go first. This ran for every enemy ship
    // against every unit, looking the unit's cell up again for each town cell, several times a frame for every town)
    const inside=u=>{if(!u||!(u.hp>0)||!wodIsHostileOwner(u.owner,ship.owner)||!urban.length)return false;
        const n=getNearestHexToPoint(u.x,u.y);if(!n)return false;const k=getHexKey(n);return keys?keys.has(k):urban.some(h=>h&&getHexKey(h)===k);};
    const target=gameData.entities.find(u=>u.uid===ship.combatTargetUid)||ship._combatEngaged&&ship._combatEnemy;
    if(ship.damage>0&&inside(target)&&Math.hypot(ship.x-target.x,ship.y-target.y)<=(ship.range||0)*wodGeneralStatMultiplier(ship))return true;
    const uid=ship.uid;
    return gameData.entities.some(u=>u.combatTargetUid===uid&&u.damage>0&&inside(u)&&Math.hypot(ship.x-u.x,ship.y-u.y)<=(u.range||0)*wodGeneralStatMultiplier(u));
}
function isCitySiegeBlockedForProduction(city) {
    if(!city || !city.id) return false;
    if(isCityEncircledForProduction(city)) return true;
    const key=`${city.q},${city.r}`;
    if(gameData.cityCombatBlockForProd?.has(key)||gameData._cityCombatStagingKeys?.has(key))return true;
    if(gameData.mp?.enabled&&!gameData.mp.isHost&&gameData._mpSyncCityWarKeys?.has(key))return true;
    const urban=getCityUrbanTerrainHexes(city);
    // Occupation/capture is an attack even when no defender is firing.
    if(urban.some(h=>wodIsHostileOwner(h.owner,city.owner)))return true;
    // An enemy standing on a town cell is taking it (the cell turns his as soon as none of ours stands there).
    const keys=new Set(urban.map(getHexKey));
    if(gameData.entities.some(u=>u.hp>0&&u.type!=='convoy'&&!wodIsNavalUnit(u)&&wodIsHostileOwner(u.owner,city.owner)&&
        Math.abs(u.x-city.x)<(gameData.hexRadius||20)*12&&Math.abs(u.y-city.y)<(gameData.hexRadius||20)*12&&keys.has(getHexKey(getNearestHexToPoint(u.x,u.y)))))return true;
    // Otherwise only a fight with our troops standing in the town stops it: a land fight on a town cell marks the town as
    // it is fought (wodStagingMarkCombatOnCityUrbanTile, above), and a ship counts while it exchanges fire with troops in
    // the town. An enemy merely within firing range of a town cell used to stop it too, with nobody fighting.
    return gameData.entities.some(u=>u.hp>0&&wodIsNavalUnit(u)&&wodIsHostileOwner(u.owner,city.owner)&&wodShipEngagesTown(u,city,urban,keys));
}
function citySiegeShowsCombatIndicator(city) {
    if(!city || !city.id) return false;
    if(isCityEncircledForProduction(city)) return true;
    let k = `${city.q},${city.r}`;
    let staged = !!(gameData._cityCombatStagingKeys && gameData._cityCombatStagingKeys.has(k));
    let blocked = !!(gameData.cityCombatBlockForProd && gameData.cityCombatBlockForProd.has(k));
    let mpWar = !!(gameData.mp && gameData.mp.enabled && !gameData.mp.isHost && gameData._mpSyncCityWarKeys && gameData._mpSyncCityWarKeys.has(k));
    return staged || blocked || mpWar || isCitySiegeBlockedForProduction(city);
}
function wodStagingMarkCombatOnCityUrbanTile(u, v) {
    if(!gameData._cityCombatStagingKeys || !u || !v) return;
    if(u.type === 'convoy' || v.type === 'convoy') return;

    function markEnt(ent) {
        let h = getNearestHexToPoint(ent.x, ent.y);
        if(!h || isWaterHex(h)) return;
        for(let ct of gameData.cities) {
            for(let uh of getCityUrbanTerrainHexes(ct)) {
                if(uh && uh.q === h.q && uh.r === h.r) {
                    gameData._cityCombatStagingKeys.add(`${ct.q},${ct.r}`);
                    return;
                }
            }
        }
    }
    markEnt(u);
    markEnt(v);
}
/** True if this town's drawn urban/cluster hexes can legally host a harbor (sea or coastal beach linkage). */
function cityUrbanClusterEligibleForHarbor(city) {
    for(let h of getCityUrbanTerrainHexes(city)) {
        for(let n of getNeighborHexes(h)) {
            if(!n) continue;
            if(isWaterHex(n)) return true;
            if(n.type === 'sand' && getNeighborHexes(n).some(nn => nn && isWaterHex(nn))) return true;
        }
    }
    return false;
}
function cityHasWaterNeighbor(city) {
    return cityUrbanClusterEligibleForHarbor(city);
}
function convoyCityKey(city) {
    return city && city.id != null ? String(city.id) : `${city.q},${city.r}`;
}
function findCityNearPointForOwner(x, y, owner) {
    let best = null;
    let bestD = Infinity;
    for(let c of gameData.cities) {
        if(c.owner !== owner) continue;
        let dx = c.x - x;
        let dy = c.y - y;
        let d = dx * dx + dy * dy;
        if(d < bestD) {
            bestD = d;
            best = c;
        }
    }
    return best;
}
function resolveTradeConvoyPathHex(convoy, destCity) {
    if(!destCity) return null;
    if(!convoy.convoySeaRoute)
        return wodHexAt(destCity.q,destCity.r) || getNearestHexToPoint(destCity.x, destCity.y);
    const start=getNearestHexToPoint(convoy.x,convoy.y),sea=wodNavalWaterRegionKeys(convoy,start),choices=[];
    if(!sea)return null;
    for(const p of getHexesInRadius(destCity.q,destCity.r,7)){
        const h=wodHexAt(p.q,p.r);if(h&&wodIsOpenWaterHex(h)&&sea.has(getHexKey(h))&&
            getNeighborHexes(h).some(n=>n&&!isWaterHex(n)&&n.owner===destCity.owner))choices.push(h);
    }
    choices.sort((a,b)=>wodAiDist2(a.x,a.y,destCity.x,destCity.y)-wodAiDist2(b.x,b.y,destCity.x,destCity.y)||
        wodAiDist2(a.x,a.y,convoy.x,convoy.y)-wodAiDist2(b.x,b.y,convoy.x,convoy.y));
    return choices[0]||null;
}
function wodTradeSeaDockPair(from,to,owner) {
    const origins=[];
    for(const p of getHexesInRadius(from.q,from.r,7)){
        const h=wodHexAt(p.q,p.r);if(h&&wodIsOpenWaterHex(h)&&getNeighborHexes(h).some(n=>n&&!isWaterHex(n)&&n.owner===owner))origins.push(h);
    }
    origins.sort((a,b)=>wodAiDist2(a.x,a.y,from.x,from.y)-wodAiDist2(b.x,b.y,from.x,from.y));
    const tested=new Set();
    for(const h of origins){
        const probe={type:'convoy',convoySeaRoute:true,owner,x:h.x,y:h.y},region=wodNavalWaterRegionKeys(probe,h);
        if(!region||tested.has(region))continue;tested.add(region);
        const dest=resolveTradeConvoyPathHex(probe,to);if(dest)return{from:h,to:dest};
    }return null;
}
function cityCurrentlyHasOutboundConvoy(city, seaRoute) {
    let k = convoyCityKey(city);
    let wantSea = !!seaRoute;
    return gameData.entities.some(e => e.type === 'convoy' && e.hp > 0 && e.convoyFromKey === k && !!e.convoySeaRoute === wantSea);
}
/** After capture/interception, resume trade toward another friendly city when possible. */
function rerouteConvoyAfterOwnerChange(convoy, avoidCityKeyOpt) {
    const pool=gameData.cities.filter(c=>c.owner===convoy.owner&&(!convoy.convoySeaRoute||c.hasHarbor));
    pool.sort((a,b)=>Number(convoyCityKey(a)===avoidCityKeyOpt)-Number(convoyCityKey(b)===avoidCityKeyOpt)||
        wodAiDist2(a.x,a.y,convoy.x,convoy.y)-wodAiDist2(b.x,b.y,convoy.x,convoy.y));
    for(const city of pool)if(initConvoyRoute(convoy,city))return true;
    convoy.target=convoy.path=convoy.orderTarget=null;convoy.convoyToKey=null;
    convoy._convoyRetryAt=(gameData._aiEconomyClock||0)+3;return false;
}
function stampUrbanTerrainAroundCity(centerHex, city, idxTag) {
    if(!centerHex || !city) return;
    city.q = centerHex.q; city.r = centerHex.r;
    city.x = centerHex.x; city.y = centerHex.y;
    if(!city.id) city.id = 'city_stamped_' + (idxTag != null ? idxTag : `${city.q},${city.r}`);
    city.urbanStyle = city.urbanStyle != null ? city.urbanStyle : Math.floor(Math.random() * 4);
    let shapeType = Math.floor(Math.random() * 4);
    let R = 2;
    let urbanCoords = [];
    for(let dq = -3; dq <= 3; dq++) {
        for(let dr = -3; dr <= 3; dr++) {
            let distSq = dq * dq + dr * dr;
            let add = false;
            if(shapeType === 0) add = distSq <= R * R;
            else if(shapeType === 1) add = Math.abs(dq) <= 1 && Math.abs(dr) <= 1;
            else if(shapeType === 2) add = Math.abs(dq) <= 2 && Math.abs(dr) <= 1;
            else add = Math.abs(dq) <= 1 && Math.abs(dr) <= 2;
            if(add && Math.random() > 0.15) urbanCoords.push({q: centerHex.q + dq, r: centerHex.r + dr});
            else if(!add && distSq <= (R + 1) * (R + 1) && Math.random() > 0.85)
                urbanCoords.push({q: centerHex.q + dq, r: centerHex.r + dr});
        }
    }
    urbanCoords.push({q: centerHex.q, r: centerHex.r});
    for(let uh of urbanCoords) {
        let targetH = wodHexAt(uh.q,uh.r);
        if(targetH && !isWaterHex(targetH)) {
            targetH.type = 'urban';
            targetH.cityId = city.id;
            targetH.urbanVariant = Math.floor(Math.random() * 5);
            targetH.baseColor = getUrbanTerrainColor(wodGetGamePeriod());
            targetH.renderColor = targetH.baseColor;
        }
    }
}
/** Random size/shape urban like stampUrbanTerrainAroundCity, but only paints hexes owned by `owner` (procgen / fair borders). */
function stampOwnedRandomUrbanTerrainAroundCity(centerHex, city, owner) {
    if(!centerHex || !city || !owner) return;
    city.q = centerHex.q;
    city.r = centerHex.r;
    city.x = centerHex.x;
    city.y = centerHex.y;
    const random=wodMulberry32(((gameData._mapGenSeed>>>0)^Math.imul(centerHex.q,374761393)^Math.imul(centerHex.r,668265263)^Math.imul(owner,73856093))>>>0);
    city.urbanStyle = city.urbanStyle != null ? city.urbanStyle : Math.floor(random() * 4);
    let shapeType = Math.floor(random() * 4);
    let R = 2;
    let urbanCoords = [];
    for(let dq = -3; dq <= 3; dq++) {
        for(let dr = -3; dr <= 3; dr++) {
            let distSq = dq * dq + dr * dr;
            let add = false;
            if(shapeType === 0) add = distSq <= R * R;
            else if(shapeType === 1) add = Math.abs(dq) <= 1 && Math.abs(dr) <= 1;
            else if(shapeType === 2) add = Math.abs(dq) <= 2 && Math.abs(dr) <= 1;
            else add = Math.abs(dq) <= 1 && Math.abs(dr) <= 2;
            if(add && random() > 0.15) urbanCoords.push({ q: centerHex.q + dq, r: centerHex.r + dr });
            else if(!add && distSq <= (R + 1) * (R + 1) && random() > 0.85)
                urbanCoords.push({ q: centerHex.q + dq, r: centerHex.r + dr });
        }
    }
    urbanCoords.push({ q: centerHex.q, r: centerHex.r });
    let cid = city.id;
    for(let uh of urbanCoords) {
        let targetH = wodHexAt(uh.q,uh.r);
        if(!targetH || isWaterHex(targetH) || targetH.type === 'mountain') continue;
        if(targetH.owner !== owner) continue;
        targetH.type = 'urban';
        targetH.cityId = cid;
        targetH.urbanVariant = Math.floor(random() * 5);
        targetH.baseColor = getUrbanTerrainColor(wodGetGamePeriod());
        targetH.renderColor = targetH.baseColor;
    }
}
function findBestCoastalLandHexForOwner(owner, centroid, landHexes) {
    let cx = centroid.x;
    let cy = centroid.y;
    let best = null;
    let bestD = Infinity;
    for(let h of landHexes) {
        if(!h) continue;
        if(h.owner > 0 && h.owner !== owner) continue;
        if(!isClaimableLand(h) || h.type === 'mountain') continue;
        let touchesSea = false;
        for(let n of getNeighborHexes(h)) {
            if(!n) continue;
            if(isWaterHex(n)) {
                touchesSea = true;
                break;
            }
        }
        if(!touchesSea) continue;
        let dx = h.x - cx;
        let dy = h.y - cy;
        let d = dx * dx + dy * dy;
        if(d < bestD) {
            bestD = d;
            best = h;
        }
    }
    return best;
}
