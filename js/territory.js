// Territory claims and hex ownership changes.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

function wodNoteUnitOccupancyHex(unit, hex) {
    if(!unit || unit.type === 'convoy' || unit.hp <= 0) return;
    let map = gameData._hexCombatOcc;
    if(!map) return;
    let newK = hex ? getHexKey(hex) : '';
    let oldK = unit._occHexKey || '';
    if(oldK === newK) return;
    if(oldK) {
        let rec = map.get(oldK);
        if(rec) {
            for(let i = rec.length - 1; i >= 0; i--) {
                if(rec[i] === unit.owner) {
                    rec.splice(i, 1);
                    break;
                }
            }
            if(!rec.length) map.delete(oldK);
        }
    }
    if(newK) {
        let rec = map.get(newK);
        if(!rec) {
            rec = [];
            map.set(newK, rec);
        }
        rec.push(unit.owner);
    }
    unit._occHexKey = newK;
}
function wodHexOccupiedByEnemyCombat(hex, friendlyOwner) {
    if(!hex) return false;
    let map = gameData._hexCombatOcc;
    if(map && map.size) {
        let rec = map.get(getHexKey(hex));
        if(!rec || !rec.length) return false;
        for(let i = 0, n = rec.length; i < n; i++) {
            if(wodIsHostileOwner(rec[i], friendlyOwner)) return true;
        }
        return false;
    }
    if(!gameData.unitSpatialGrid || !gameData.unitSpatialGrid.cells) return false;
    let occ = false;
    let pad = (gameData.hexRadius || 20) * 1.55;
    forEachNearbyUnit(gameData.unitSpatialGrid, hex.x, hex.y, pad, (u) => {
        if(u.hp <= 0 || u.type === 'convoy' || !wodIsHostileOwner(u.owner, friendlyOwner)) return;
        let uh = getNearestHexToPoint(u.x, u.y);
        if(uh && uh.q === hex.q && uh.r === hex.r) {
            occ = true;
            return true;
        }
    });
    return occ;
}
function wodHexNearActiveEnemyCombat(hex, friendlyOwner) {
    if(!hex) return false;
    if(wodHexOccupiedByEnemyCombat(hex, friendlyOwner)) return true;
    for(let nb of getNeighborHexes(hex)) {
        if(nb && wodHexOccupiedByEnemyCombat(nb, friendlyOwner)) return true;
    }
    return false;
}
function wodQueueTerritoryClaim(hex, owner, priority, standing) {
    if(!hex || owner <= 0) return;
    if(!gameData._wodClaimBatch) gameData._wodClaimBatch = new Map();
    let k = getHexKey(hex);
    let cur = gameData._wodClaimBatch.get(k);
    if(!cur) {
        gameData._wodClaimBatch.set(k, { hex, owner, priority, contested: false, standing: !!standing });
        return;
    }
    if(priority > cur.priority) {
        gameData._wodClaimBatch.set(k, { hex, owner, priority, contested: false, standing: !!standing });
        return;
    }
    if(priority < cur.priority) return;
    if(owner !== cur.owner) cur.contested = true;
}
function wodQueueTerritoryRemnantCheck(hex) {
    if(!hex)return;
    const keys=gameData._territoryCleanupKeys||(gameData._territoryCleanupKeys=new Set());
    keys.add(getHexKey(hex));
    for(const d of hexDirections)keys.add(`${hex.q+d.q},${hex.r+d.r}`);
}
// Remove empty, unsupported tips at checkerboard ownership corners.
// Never open a supply corridor by filling an enemy flank, cut a real
// corridor, or transfer a cell occupied by a unit/town/structure.
function wodCleanupTerritoryCorner(hex,protectedKeys) {
    const keepsLinks=(h,owner)=>{
        const neighbors=hexDirections.map(dir=>wodHexAt(h.q+dir.q,h.r+dir.r)).filter(n=>n&&!isWaterHex(n)&&wodIsFriendlyOwner(n.owner,owner));
        if(neighbors.length<2)return true;
        const seen=new Set([getHexKey(neighbors[0])]),queue=[neighbors[0]];
        for(let i=0;i<queue.length;i++)for(const dir of hexDirections){
            const n=wodHexAt(queue[i].q+dir.q,queue[i].r+dir.r),k=n&&getHexKey(n);
            if(!n||n===h||isWaterHex(n)||!wodIsFriendlyOwner(n.owner,owner)||seen.has(k)||Math.abs(n.q-h.q)>3||Math.abs(n.r-h.r)>3)continue;
            seen.add(k);queue.push(n);
        }
        return neighbors.every(n=>seen.has(getHexKey(n)));
    };
    for(const dq of [-1,0])for(const dr of [-1,0]) {
        const q=hex.q+dq,r=hex.r+dr,cells=[[q,r],[q+1,r],[q,r+1],[q+1,r+1]].map(([x,y])=>wodHexAt(x,y));
        const [a,b,c,d]=cells;
        if(cells.some(h=>!h||isWaterHex(h)||h.owner<=0)||a.owner!==d.owner||b.owner!==c.owner||!wodIsHostileOwner(a.owner,b.owner))continue;
        const choices=[];
        for(const h of cells) {
            if(protectedKeys.has(getHexKey(h)))continue;
            const other=h.owner===a.owner?b.owner:a.owner;
            let own=0,enemy=0;
            for(const dir of cardinalHexDirections){const n=wodHexAt(h.q+dir.q,h.r+dir.r);if(!n||isWaterHex(n))continue;if(n.owner===h.owner)own++;if(n.owner===other)enemy++;}
            const rank=o=>(Math.imul(h.q+503,73856093)^Math.imul(h.r+509,19349663)^Math.imul(o,83492791))>>>0;
            if(enemy>=2&&enemy>=own&&(enemy>own||rank(other)<rank(h.owner))&&keepsLinks(h,h.owner)&&keepsLinks(h,other))choices.push({h,other,gain:enemy-own});
        }
        choices.sort((a,b)=>b.gain-a.gain||a.h.q-b.h.q||a.h.r-b.h.r);
        if(choices.length)setHexOwner(choices[0].h,choices[0].other);
    }
}
/** Absorb empty inland crumbs and small coastal cutoffs. The sea neither
 * connects a land pocket to its old owner nor supplies it with a town. */
function wodCleanupTinyTerritoryPockets(maxChecks=96) {
    if(gameData.mp?.enabled&&!gameData.mp.isHost)return;
    const keys=gameData._territoryCleanupKeys;if(!keys?.size)return;
    // Cells that are never cleaned up (towns, units, works). Built only once a candidate needs it; it does
    // not depend on ownership, so building it later in the same call gives the same set.
    let protectedKeys=null;
    const protect=()=>{
        if(protectedKeys)return protectedKeys;
        protectedKeys=new Set();
        for(const c of gameData.cities) {
            protectedKeys.add(`${c.q},${c.r}`);
            for(const h of getCityUrbanTerrainHexes(c))protectedKeys.add(getHexKey(h));
        }
        for(const u of gameData.entities)if(u.hp>0&&u.type!=='convoy')protectedKeys.add(getHexKey(getNearestHexToPoint(u.x,u.y)));
        for(const list of [gameData.forts,gameData.hospitals,gameData.bridges,gameData.constructionJobs])for(const site of list||[]) {
            protectedKeys.add(`${site.q},${site.r}`);
            for(const key of site.hexKeys||[])protectedKeys.add(key);
        }
        return protectedKeys;
    };
    const checked=new Set(), islandCheck={}, start=performance.now();let count=0;
    while(keys.size&&count++<maxChecks) {
        if(performance.now()-start>2)break;
        const key=keys.values().next().value;keys.delete(key);
        if(checked.has(key))continue;
        const first=gameData.hexes[key];if(!first||first.owner<=0)continue;
        // Water is a political extension of its banks, never a land supply route.
        if(isWaterHex(first))continue;
        wodCleanupTerritoryCorner(first,protect());
        const owner=first.owner,component=[first],seen=new Set([key]);
        let captor=0,valid=true,coastal=false;
        for(let i=0;i<component.length&&valid;i++) {
            const h=component[i],k=getHexKey(h);checked.add(k);
            if(protect().has(k)){valid=false;break;}
            for(const d of cardinalHexDirections) {
                const n=wodHexAt(h.q+d.q,h.r+d.r);
                if(!n||isWaterHex(n)){coastal=true;continue;}
                if(n.owner<=0){valid=false;break;}
                if(n.owner===owner) {
                    if(!seen.has(getHexKey(n))){seen.add(getHexKey(n));component.push(n);if(component.length>32){valid=false;break;}}
                } else {
                    if(!wodIsHostileOwner(n.owner,owner)||captor&&captor!==n.owner){valid=false;break;}
                    captor=n.owner;
                }
            }
        }
        if(!valid||!captor||component.length>2&&!coastal)continue;
        if(coastal)continue;
        if(wodCurrentSupplyComponent(first,owner).city)continue;
        for(const h of component)setHexOwner(h,captor);
    }
}
// Water carries no political ownership, including inland lakes. This bounded
// migration pass also clears water claims received from older saved maps.
function wodUpdateWaterPolitics() {
    if(gameData.mp?.enabled&&!gameData.mp.isHost)return;
    let w=gameData._waterPoliticsWork;
    if(!w){if(!gameData._waterPoliticsDirty)return;gameData._waterPoliticsDirty=false;w=gameData._waterPoliticsWork={list:gameData.hexList,scan:0};}
    if(w.list!==gameData.hexList){gameData._waterPoliticsWork=null;return;}
    const end=Math.min(w.list.length,w.scan+1200);
    for(;w.scan<end;w.scan++){const h=w.list[w.scan];if(isWaterHex(h)&&h.owner)setHexOwner(h,0);}
    if(w.scan>=w.list.length)gameData._waterPoliticsWork=null;
}
function wodApplyTerritoryClaimBatch() {
    let batch = gameData._wodClaimBatch;
    if(!batch || batch.size === 0) {
        gameData._wodClaimBatch = null;
        return;
    }
    let changed = false;
    for(let rec of batch.values()) {
        if(!rec || rec.contested || rec.owner <= 0) continue;
        if(rec.hex.owner === rec.owner) continue;
        // Recheck after all movement: a defender may have entered the
        // adjacent cell since this claim was queued earlier in the tick.
        // The tile a unit stands on is its own whatever stands beside it;
        // only an enemy on that very tile contests it.
        if(rec.standing ? wodHexOccupiedByEnemyCombat(rec.hex, rec.owner) : wodHexNearActiveEnemyCombat(rec.hex, rec.owner)) continue;
        setHexOwner(rec.hex, rec.owner);
        changed = true;
    }
    gameData._wodClaimBatch = null;
    if(changed) {
        wodSyncFortCapturesAfterTerritory();
        // Fill any remaining unowned land; water stays neutral.
        if(((gameData._wodSimTick | 0) % 8) === 0) wodFillUnownedPoliticalHexes(2);
    }
}
function wodTerritoryClaimAttach(unit, hex, standingHex) {
    if(hasOwnerNeighbor(hex, unit.owner)) return true;
    if(standingHex && standingHex.owner === unit.owner) return true;
    if(standingHex && getNeighborHexes(hex).some(n => n && n.q === standingHex.q && n.r === standingHex.r)) {
        let batch = gameData._wodClaimBatch;
        if(batch) {
            let standRec = batch.get(getHexKey(standingHex));
            if(standRec && standRec.owner === unit.owner && !standRec.contested) return true;
        }
    }
    let batch = gameData._wodClaimBatch;
    if(batch) {
        for(let nb of getNeighborHexes(hex)) {
            let rec = batch.get(getHexKey(nb));
            if(rec && rec.owner === unit.owner && !rec.contested) return true;
        }
    }
    let standingKey = standingHex ? getHexKey(standingHex) : '';
    if(standingKey && wodHexKeyIsEncircled(standingKey) && wodHexKeyIsEncircled(getHexKey(hex))) return true;
    return false;
}
function wodHexOwnedByForSpearhead(hex, owner) {
    if(!hex || owner <= 0) return false;
    if(hex.owner === owner) return true;
    let batch = gameData._wodClaimBatch;
    if(!batch) return false;
    let rec = batch.get(getHexKey(hex));
    return !!(rec && rec.owner === owner && !rec.contested && rec.priority >= 3);
}
function wodSpearheadCanClaimEnemyHex(unit, hex, standingHex) {
    if(!hex || !standingHex || hex.owner === unit.owner || hex.owner === 0) return false;
    // Wedge capture only while pushing through hostile land — not from own frontline tiles.
    if(standingHex.owner === unit.owner) return false;
    if(getNeighborHexes(hex).some(n => n && n.q === standingHex.q && n.r === standingHex.r))
        return wodHexOwnedByForSpearhead(standingHex, unit.owner);
    let batch = gameData._wodClaimBatch;
    if(!batch) return false;
    for(let nb of getNeighborHexes(hex)) {
        if(nb.q === standingHex.q && nb.r === standingHex.r) continue;
        let rec = batch.get(getHexKey(nb));
        if(rec && rec.owner === unit.owner && !rec.contested && rec.priority >= 3) return true;
    }
    return false;
}
function wodCanClaimTerritoryHex(unit, hex, standingHex) {
    if(!hex || !unit || isWaterHex(hex) || !canUnitEnterHex(unit, hex)) return false;
    if(hex.owner === unit.owner) return false;
    if(wodAreAllies(hex.owner, unit.owner)) return false;
    let onTile = standingHex && hex.q === standingHex.q && hex.r === standingHex.r;
    if(onTile) return true;
    if(hex.owner === 0) return wodTerritoryClaimAttach(unit, hex, standingHex);
    if(wodIsHostileOwner(hex.owner, unit.owner)) return wodSpearheadCanClaimEnemyHex(unit, hex, standingHex);
    return false;
}
function wodTerritoryClaimPriority(unit, hex, standingHex) {
    if(!hex || !standingHex) return 1;
    if(hex.q === standingHex.q && hex.r === standingHex.r) return 3;
    if(wodIsHostileOwner(hex.owner, unit.owner) && wodSpearheadCanClaimEnemyHex(unit, hex, standingHex)) return 3;
    return 1;
}
/** A unit is never in enemy territory: the land tile it stands on becomes its side's,
 *  even with an enemy on the next tile. Only an enemy on the same tile contests it. */
function wodClaimStandingTile(unit, hex) {
    if(!unit || !hex || unit.type === 'convoy' || unit.hp <= 0 || hex.owner === unit.owner) return;
    // The unit is standing there, so "can it enter" is not asked: troops pressed against a
    // mountain's edge would otherwise show on an enemy tile they can never take.
    if(isWaterHex(hex) || wodIsNavalUnit(unit) || wodAreAllies(hex.owner, unit.owner)) return;
    if(!wodHexOccupiedByEnemyCombat(hex, unit.owner))
        wodQueueTerritoryClaim(hex, unit.owner, 4, true);
}
function claimTerritoryAroundUnit(unit, atX, atY, hexOverride) {
    if(unit.type === 'convoy') return;
    let px = atX != null ? atX : unit.x;
    let py = atY != null ? atY : unit.y;
    let standingHex = hexOverride
        ? wodHexAt(hexOverride.q,hexOverride.r)
        : getNearestHexToPoint(px, py);
    if(!standingHex) return;
    let uHex = {q: standingHex.q, r: standingHex.r};
    const claimRadius = unit.type === 'heavy' ? 2 : 1;
    let claimH = getHexesInHexRadius(uHex.q, uHex.r, claimRadius);

    wodClaimStandingTile(unit, standingHex);

    let maxPasses = claimRadius + 1;
    for(let pass = 0; pass < maxPasses; pass++) {
        for(let ci = 0; ci < claimH.length; ci++) {
            let ch = claimH[ci];
            let h = wodHexAt(ch.q,ch.r);
            if(!h || (h.q === standingHex.q && h.r === standingHex.r)) continue;
            if(!wodCanClaimTerritoryHex(unit, h, standingHex)) continue;
            let onTile = h.q === standingHex.q && h.r === standingHex.r;
            if(!onTile && wodHexNearActiveEnemyCombat(h, unit.owner)) continue;
            if(wodHexOccupiedByEnemyCombat(h, unit.owner)) continue;
            wodQueueTerritoryClaim(h, unit.owner, wodTerritoryClaimPriority(unit, h, standingHex));
        }
    }
}
function wodClaimTerritoryAlongMove(unit, x0, y0, x1, y1) {
    if(unit.type === 'convoy') return;
    let h1 = getNearestHexToPoint(x1, y1);
    if(!h1) return;
    let key = h1.q + ',' + h1.r;
    if(unit._lastClaimHexKey === key) return;
    let h0 = getNearestHexToPoint(x0, y0);
    if(h0 && h0.q === h1.q && h0.r === h1.r) return;
    unit._lastClaimHexKey = key;
    wodNoteUnitOccupancyHex(unit, h1);
    claimTerritoryAroundUnit(unit, x1, y1, h1);
}
let batchHexOwner = false;
let batchHexOwnerDirty = false;
function setHexOwner(hex, owner) {
    if(isWaterHex(hex))owner=0;
    if (hex.owner === owner) return;
    let prev = hex.owner;
    if(!isWaterHex(hex)&&gameData._matchReadyForEndChecks){wodBattleMetric(owner,'landGained');wodBattleMetric(prev,'landLost');}
    if(!isWaterHex(hex) && gameData._landIncomeCache && !gameData._landIncomeCacheDirty &&
        wodHexCountsTowardLandPoliticsBalance(hex)) {
        if(prev > 0) gameData._landIncomeCache[prev] = (gameData._landIncomeCache[prev] || 0) - 1;
        if(owner > 0) gameData._landIncomeCache[owner] = (gameData._landIncomeCache[owner] || 0) + 1;
    } else if(!isWaterHex(hex)) {
        gameData._landIncomeCacheDirty = true;
    }
    hex.owner = owner;
    gameData._structureCaptureDirty=true;
    if(!isWaterHex(hex)&&gameState==='PLAYING'&&(gameData._matchReadyForEndChecks||gameData._campaignRun?.battleLive)&&
        (!gameData.mp?.enabled||gameData.mp.isHost))wodQueueTerritoryRemnantCheck(hex);
    if(!isWaterHex(hex)) {
        gameData._supplyTopologyVersion=(gameData._supplyTopologyVersion||0)+1;
        if(cardinalHexDirections.some(d=>isWaterHex(wodHexAt(hex.q+d.q,hex.r+d.r))))gameData._waterPoliticsDirty=true;
    }
    hex.renderColor = hex.baseColor;
    if (batchHexOwner) batchHexOwnerDirty = true;
    else wodMarkTerrainPoliticalDirty();
}
function getHexesInRadius(cq, cr, R) {
    let res = [];
    for(let dq = -R; dq <= R; dq++) {
        for(let dr = -R; dr <= R; dr++) {
            if(dq * dq + dr * dr <= R * R) res.push({q: cq + dq, r: cr + dr});
        }
    }
    return res;
}
/** Hex-ring tiles in all 8 neighbor directions (correct axial topology, not square dq/dr).
 *  Result is a scratch buffer valid until the next call — copy if you need to retain it. */
let _wodHexRingSeen = new Set();
let _wodHexRingRes = [];
let _wodHexRingFrontier = [];
let _wodHexRingNext = [];
function getHexesInHexRadius(cq, cr, R) {
    if(R <= 0) {
        _wodHexRingRes.length = 0;
        _wodHexRingRes.push({q: cq, r: cr});
        return _wodHexRingRes;
    }
    _wodHexRingSeen.clear();
    _wodHexRingRes.length = 0;
    _wodHexRingFrontier.length = 0;
    _wodHexRingSeen.add(`${cq},${cr}`);
    _wodHexRingRes.push({q: cq, r: cr});
    _wodHexRingFrontier.push({q: cq, r: cr});
    for(let ring = 0; ring < R; ring++) {
        _wodHexRingNext.length = 0;
        for(let hi = 0; hi < _wodHexRingFrontier.length; hi++) {
            let h = _wodHexRingFrontier[hi];
            for(let di = 0; di < hexDirections.length; di++) {
                let dir = hexDirections[di];
                let nq = h.q + dir.q;
                let nr = h.r + dir.r;
                let k = `${nq},${nr}`;
                if(_wodHexRingSeen.has(k)) continue;
                _wodHexRingSeen.add(k);
                let pt = {q: nq, r: nr};
                _wodHexRingRes.push(pt);
                _wodHexRingNext.push(pt);
            }
        }
        let swap = _wodHexRingFrontier;
        _wodHexRingFrontier = _wodHexRingNext;
        _wodHexRingNext = swap;
    }
    return _wodHexRingRes;
}
function pixelToHex(x, y) {
    let spacing = gameData.hexRadius * 1.35;
    return {q: Math.round(x / spacing), r: Math.round(y / spacing)};
}
const WOD_SAVED_MAPS_V2_KEY = 'wodSavedMapsV2';
const WOD_SAVED_MAPS_LEGACY_EDITOR = 'wodEditorMaps';
const WOD_IDB_NAME = 'wodPlayground';
const WOD_IDB_VERSION = 1;
const WOD_IDB_STORE = 'kv';
const WOD_IDB_SAVED_MAPS_KEY = 'savedMapsV2';
const WOD_MAP_LIB_PAGE_SIZE = 3;
let _wodMapLib = { context: 'setup', selectedId: null, list: [], listPage: 0, wired: false, pagerWired: false, returnTo: null };
