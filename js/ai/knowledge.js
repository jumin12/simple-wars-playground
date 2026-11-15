// AI: what a faction knows and expects. Enemies seen and remembered (fog), threat lists, combat forecasts
// (terrain, morale, forts, commanders), arrival times, land reach and routes, supply reach. Shared by every planner.
'use strict';

function wodInvalidateAiFrontlineHexCache() {
    gameData._aiFrontlineHexCache = null;
}

function wodCachedFrontlineHexes(owner) {
    let serial = gameData.aiStrategySerial || 0;
    let cache = gameData._aiFrontlineHexCache;
    if(!cache || cache.serial !== serial) {
        cache = { serial: serial, byOwner: {} };
        gameData._aiFrontlineHexCache = cache;
    }
    let ow = owner | 0;
    let hit = cache.byOwner[ow];
    if(hit) return hit;
    hit = getOwnerFrontlineHexes(owner);
    cache.byOwner[ow] = hit;
    return hit;
}

// Fairness: every hostile faction is the same kind of enemy, human or computer. The old planners preferred to
// attack player 1 (in a free-for-all every computer came for the human; in multiplayer, for the host).
// WOD_OPS.T.humanBias=1 brings that preference back, for the test rig only.
function wodAiIsFoe(observer, owner) {
    return wodOpsTune(observer).humanBias ? owner === 1 : wodIsHostileOwner(owner, observer);
}

// Fielded manpower of the strongest hostile faction, as far as this faction can see it.
function wodAiFoePower(observer) {
    if(wodOpsTune(observer).humanBias) {
        const p = wodFogActive() ? wodAiKnownEnemyPower(observer, 1) : gameData._aiStratPowPlayer;
        return p === undefined ? getOwnerTroopManpower(1) : p;
    }
    // once per strategy pulse and faction (asked for every unit the sector planner places)
    const serial = gameData.aiStrategySerial || 0;
    let cache = gameData._aiFoePowerCache;
    if(!cache || cache.serial !== serial || cache.hexes !== gameData.hexes) cache = gameData._aiFoePowerCache = {serial, hexes: gameData.hexes, by: {}};
    if(cache.by[observer] != null) return cache.by[observer];
    const by = {};
    for(const u of wodAiKnownEntities(observer)) {
        if(u.hp <= 0 || u.type === 'convoy' || !wodIsHostileOwner(u.owner, observer)) continue;
        by[u.owner] = (by[u.owner] || 0) + (u.manpower !== undefined ? u.manpower : Math.round((u.hp / u.maxHp) * 1000));
    }
    let best = 0;for(const k in by) if(by[k] > best) best = by[k];
    return cache.by[observer] = best;
}

/** Count hostile combat units this faction can see within radius (world px). */
function countPlayerThreatNear(wx, wy, radius, observer=2) {
    let r2 = radius * radius;
    let n = 0;
    let grid = gameData.unitSpatialGrid;
    if(grid && grid.cells) {
        forEachNearbyUnit(grid, wx, wy, radius, (u) => {
            if(!wodAiIsFoe(observer, u.owner) || u.hp <= 0 || u.type === 'convoy' || !wodOwnerCanSee(observer,u)) return;
            let dx = u.x - wx, dy = u.y - wy;
            if(dx * dx + dy * dy <= r2) n++;
        });
        return n;
    }
    for(let u of wodAiKnownEntities(observer)) {
        if(!wodAiIsFoe(observer, u.owner) || u.hp <= 0 || u.type === 'convoy' || !wodOwnerCanSee(observer,u)) continue;
        let dx = u.x - wx, dy = u.y - wy;
        if(dx * dx + dy * dy <= r2) n++;
    }
    return n;
}

function wodAiPressureBucket(n) {
    if(n <= 0) return 0;
    if(n === 1) return 1;
    if(n <= 3) return 2;
    if(n <= 7) return 3;
    return 4;
}

/** Hostile troops on or marching toward this owner's line. Cached per strategy pulse. */
function wodAiReadContact(owner) {
    let serial = gameData.aiStrategySerial || 0;
    if(!gameData._aiContactByOwner) gameData._aiContactByOwner = {};
    let hit = gameData._aiContactByOwner[owner];
    if(hit && hit.serial === serial) return hit;
    let hr = gameData.hexRadius || 20;
    let near2 = hr * 6.5 * hr * 6.5;
    let fronts = wodCachedFrontlineHexes(owner);
    let sample = fronts;
    if(fronts.length > 36) {
        sample = [];
        let step = fronts.length / 36;
        for(let si = 0; si < 36; si++) sample.push(fronts[Math.floor(si * step)]);
    }
    let focus = gameData.aiFrontFocus && gameData.aiFrontFocus[owner];
    let onFront = 0, approaching = 0, ownCut = 0;
    let sx = 0, sy = 0, sn = 0;
    let engaged = [];
    let ents = wodAiKnownEntities(owner);
    for(let i = 0; i < ents.length; i++) {
        let u = ents[i];
        if(!u || u.hp <= 0 || u.type === 'convoy' || wodIsNavalUnit(u)) continue;
        if(u.owner === owner) {
            if(ownCut < 12) {
                let uh = getNearestHexToPoint(u.x, u.y);
                if(uh && wodHexKeyIsEncircled(getHexKey(uh))) ownCut++;
            }
            continue;
        }
        if(wodIsFriendlyOwner(u.owner, owner)) continue;
        let h = getNearestHexToPoint(u.x, u.y);
        if(!h) continue;
        let inside = h.owner === owner;
        let on = inside && isFrontlineHex(h, owner);
        let near = inside || on;
        if(!near) {
            let nbrs = getNeighborHexes(h);
            for(let ni = 0; ni < nbrs.length; ni++) {
                if(nbrs[ni] && nbrs[ni].owner === owner) { near = true; break; }
            }
        }
        if(!near && sample.length) {
            for(let si = 0; si < sample.length; si++) {
                let dx = u.x - sample[si].x, dy = u.y - sample[si].y;
                if(dx * dx + dy * dy <= near2) { near = true; break; }
            }
        }
        if(!near) continue;
        if(on || inside) onFront++;
        else approaching++;
        sx += u.x;
        sy += u.y;
        sn++;
        if(engaged.length < 24) engaged.push(u);
        else if(focus) {
            let d = wodAiDist2(u.x, u.y, focus.x, focus.y);
            let worst = 0, worstD = -1;
            for(let k = 0; k < engaged.length; k++) {
                let ek = wodAiDist2(engaged[k].x, engaged[k].y, focus.x, focus.y);
                if(ek > worstD) { worstD = ek; worst = k; }
            }
            if(d < worstD) engaged[worst] = u;
        }
    }
    let qx = sn ? Math.round((sx / sn) / (hr * 6)) : 0;
    let qy = sn ? Math.round((sy / sn) / (hr * 6)) : 0;
    let rec = {
        serial: serial,
        onFront: onFront,
        approaching: approaching,
        n: sn,
        ownCut: ownCut,
        cx: sn ? sx / sn : 0,
        cy: sn ? sy / sn : 0,
        engaged: wodFogActive()?engaged.map(u=>({...u})):engaged,
        scanned: false,
        pocket: null,
        relief: null,
        sig: wodAiPressureBucket(onFront) + '/' + wodAiPressureBucket(approaching) + '/' + (ownCut > 0 ? 1 : 0) + '/' + qx + ',' + qy
    };
    gameData._aiContactByOwner[owner] = rec;
    return rec;
}

function estimatePlayerPressureOnFront(owner) {
    let c = wodAiReadContact(owner);
    return c.onFront + c.approaching;
}

function wodAiSectorFightStats(owner, holdHex) {
    let support = countNearbyUnits(owner, holdHex.x, holdHex.y, 190);
    let enemies = countNearbyUnits(owner, holdHex.x, holdHex.y, 210, true);
    let localRatio = (support + 1) / (enemies + 1);
    let playerPower = wodAiFoePower(owner);
    let myPower = gameData._aiStratPowByOwner && gameData._aiStratPowByOwner[owner];
    if(myPower === undefined) myPower = getOwnerTroopManpower(owner);
    let canOverwhelm = myPower / Math.max(1, playerPower) >= 0.9;
    let localOverrun = localRatio >= 1.05 && support >= 2;
    let neededSupport = canOverwhelm
        ? Math.max(1, Math.ceil(enemies * 0.55))
        : Math.max(1, Math.ceil(enemies * 0.72));
    let shouldPush = localOverrun || support >= neededSupport
        || (canOverwhelm && localRatio >= 0.9) || enemies <= 2;
    return { support, enemies, localRatio, canOverwhelm, localOverrun, neededSupport, shouldPush };
}

/** Combat weight for task-force budgeting. */
function wodAiUnitCombatPower(unit,terrain) {
    if(!unit||unit.hp<=0||unit.moraleBroken||unit.retreating)return 0;
    const h=terrain||wodCombatTerrainHex(unit),morale=.18+.82*Math.max(0,Math.min(1,(unit.morale??100)/100));
    const dps=(unit.damage||0)/Math.max(.05,unit.attackCooldown||2)*morale*wodVeteranStatMult(unit);
    const cover=getTerrainAttackModifier(unit,h)/Math.max(.3,getTerrainDefenseModifier(unit,h));
    const command=unit._intelMemory?(unit.command||1):wodAiKnownCommand(unit,unit._observerOwner??unit.owner);
    return Math.sqrt(Math.max(0,unit.hp)*dps*cover/400)*command*(unit._intelConfidence??1);
}

function wodAiDist2(ax, ay, bx, by) {
    let dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
}

function wodAiOperationReach(unit, waterOnly=false) {
    if(!waterOnly&&isLandArmyUnit(unit))return wodTransportLandingRegion(unit,unit)||new Set();
    if(waterOnly||wodIsNavalUnit(unit))return wodNavalWaterRegionKeys(unit,getNearestHexToPoint(unit.x,unit.y))||new Set();
    const start=getNearestHexToPoint(unit.x,unit.y), keys=new Set(), queue=[];
    const valid=h=>h && (h.type!=='mountain'||wodCanClimb(unit)) && (waterOnly?isWaterHex(h):unit.type==='marine'||!isWaterHex(h)||isBridgeHex(h));
    if(!valid(start))return keys;
    let marineComponents;
    if(unit.type==='marine'&&!waterOnly){
        const revision=(gameData._landGeometryRevision||0)+'|'+(gameData.landGeometryRevision||0)+'|'+(gameData._wodPfVer||0);
        let cache=gameData._aiMarineReachComponents;
        if(!cache||cache.hexes!==gameData.hexes||cache.revision!==revision)cache=gameData._aiMarineReachComponents={hexes:gameData.hexes,revision,components:new Map()};
        marineComponents=cache.components;
        const known=marineComponents.get(getHexKey(start));if(known)return known;
    }
    keys.add(getHexKey(start));queue.push(start);
    for(let i=0;i<queue.length;i++)for(const nb of getNeighborHexes(queue[i])) {
        if(valid(nb)&&!keys.has(getHexKey(nb))){keys.add(getHexKey(nb));queue.push(nb);}
    }
    if(marineComponents)for(const key of keys)marineComponents.set(key,keys);
    return keys;
}

function wodAiKnownEntities(owner) {
    return wodFogActive()?gameData.entities.filter(u=>wodOwnerCanSee(owner,u)):gameData.entities;
}

function wodAiKnownCities(owner) {
    if(!wodFogActive())return gameData.cities;
    const rec=wodFogFactionIntel(owner);
    const friendly=gameData.cities.filter(c=>wodIsFriendlyOwner(c.owner,owner)),ownedIds=new Set(friendly.map(c=>c.id));
    return [...friendly,...[...rec.cities.values()].filter(c=>!ownedIds.has(c.id)&&!wodIsFriendlyOwner(c.owner,owner))];
}

function wodAiKnownForts(owner) {
    if(!wodFogActive())return gameData.forts||[];
    const rec=wodFogFactionIntel(owner);
    return [...(gameData.forts||[]).filter(f=>wodIsFriendlyOwner(f.owner,owner)),
        ...[...rec.forts.values()].filter(f=>!wodIsFriendlyOwner(f.owner,owner))];
}

function wodAiKnownEnemyPower(owner,foe=1) {
    return wodAiKnownEntities(owner).filter(u=>u.hp>0&&u.owner===foe).reduce((n,u)=>n+(u.manpower||0),0);
}

function wodAiSeaRegionFrom(owner,from,toward=from) {
    if(!from)return null;
    const at=getNearestHexToPoint(from.x,from.y),ship={type:'ship',owner,x:from.x,y:from.y};
    // Town centers and waiting passengers can be several land cells inland.
    // A virtual ship cannot search across those cells to find its coast.
    const approach={...ship,type:from.type==='marine'?'marine':wodCanClimb(from)?'mountaineer':'light'};
    const water=at&&wodIsOpenWaterHex(at)?at:wodNearestOpenWaterHex(approach,at,toward,8);
    return water?wodNavalWaterRegionKeys(ship,water):null;
}

function wodAiCityOnSea(city,sea) {
    if(!sea)return false;
    return getCityUrbanTerrainHexes(city).some(h=>getHexesInRadius(h.q,h.r,2).some(p=>sea.has(p.q+','+p.r)));
}

const wodAiLandingSeaCache={seas:null}; // WeakMap by sea region, made on first use

function wodAiLandingOnSea(owner,goal,sea) {
    if(!sea||!goal)return false;
    const region=wodTransportLandingRegion({type:'light',owner},getNearestHexToPoint(goal.x,goal.y));if(!region)return false;
    const seas=wodAiLandingSeaCache.seas||(wodAiLandingSeaCache.seas=new WeakMap());
    let cached=seas.get(sea);if(!cached){cached=new WeakMap();seas.set(sea,cached);}
    if(cached.has(region))return cached.get(region);
    for(const key of region){const h=gameData.hexes[key];if(h&&getNeighborHexes(h).some(n=>sea.has(getHexKey(n)))){cached.set(region,true);return true;}}
    cached.set(region,false);return false;
}

// Contact ETA searches legal terrain, including real bridge links, with current
// movement penalties. A distant or blocked helper never inflates fighting strength.
function wodAiArrivalSeconds(unit, point, contactRange=0, horizon=120) {
    if(!unit||!point)return Infinity;
    const distance=Math.hypot(unit.x-point.x,unit.y-point.y);
    if(distance<=contactRange)return 0;
    const speed=wodUnitBaseSpeed(unit)*WOD_MOVE_SPEED_FACTOR*wodGeneralSpeedMultiplier(unit)*(unit.type==='mountaineer'?1.05:1);
    if((distance-contactRange)/speed>horizon)return Infinity;
    const start=getNearestHexToPoint(unit.x,unit.y),goal=getNearestHexToPoint(point.x,point.y);
    if(!start||!goal)return Infinity;
    const stamp=Math.floor(wodAiOperationTime()/1800),topology=gameData._supplyTopologyVersion||0;
    let cache=gameData._aiArrivalCache;
    if(cache?.hexes!==gameData.hexes||cache.stamp!==stamp||cache.topology!==topology)
        cache=gameData._aiArrivalCache={hexes:gameData.hexes,stamp,topology,values:new Map()};
    const key=[unit.uid,unit.owner,unit.type,getHexKey(start),getHexKey(goal),Math.round(point.x),Math.round(point.y),Math.round(unit.x),Math.round(unit.y),Math.round(contactRange),horizon,Math.round(speed*10),Math.round(getUnitSpeedMultiplier(unit)*100)].join(':');
    if(cache.values.has(key))return cache.values.get(key);
    const heap=[],cost=new Map([[getHexKey(start),0]]),movementByHex=new Map(),movingUnit={...unit};
    const push=n=>{heap.push(n);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].f<=n.f)break;heap[i]=heap[p];i=p;}heap[i]=n;};
    const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1].f<heap[j].f)j++;if(heap[j].f>=last.f)break;heap[i]=heap[j];i=j;}heap[i]=last;}return first;};
    const heuristic=h=>Math.max(0,Math.hypot(h.x-point.x,h.y-point.y)-contactRange)/speed;
    push({h:start,g:0,f:heuristic(start)});let result=Infinity,examined=0;
    while(heap.length&&examined++<900){
        const {h,g,f}=pop();if(g!==cost.get(getHexKey(h)))continue;
        if(f>=result)break;
        if(Math.hypot(h.x-point.x,h.y-point.y)<=contactRange){result=Math.min(result,g);continue;}
        const neighbors=getNeighborHexes(h).slice();
        // Non-adjacent bank/deck links are the same links used by movement/supply.
        if(gameData.bridges?.length)wodForEachBridgePathPortal(unit,h,n=>{if(!neighbors.includes(n))neighbors.push(n);});
        for(const n of neighbors){
            if(!canUnitEnterHex(unit,n)||unit.type!=='marine'&&!wodIsNavalUnit(unit)&&isWaterHex(n)&&!isBridgeHex(n)||!wodCanStepBetweenHexes(unit,h,n,unit.type!=='marine'))continue;
            let movement=movementByHex.get(n);
            if(movement==null){
                const water=isWaterHex(n)&&!isBridgeHex(n);
                movingUnit.x=n.x;movingUnit.y=n.y;movingUnit.inWater=water;movingUnit.amphibInWater=unit.type==='marine'&&water;
                movement=Math.max(.1,(unit.speed||15)*getUnitSpeedMultiplier(movingUnit,n)*WOD_MOVE_SPEED_FACTOR);movementByHex.set(n,movement);
            }
            const fromX=h===start?unit.x:h.x,fromY=h===start?unit.y:h.y,vx=n.x-fromX,vy=n.y-fromY;
            const ox=fromX-point.x,oy=fromY-point.y,a=vx*vx+vy*vy,b=2*(ox*vx+oy*vy),c=ox*ox+oy*oy-contactRange*contactRange;
            const disc=b*b-4*a*c;
            // Continuous movement can enter firing range partway through a cell.
            if(a>0&&disc>=0){const fraction=(-b-Math.sqrt(disc))/(2*a);if(fraction>=0&&fraction<=1){const eta=g+Math.sqrt(a)*fraction/movement;if(eta<=horizon)result=Math.min(result,eta);}}
            const next=g+Math.sqrt(a)/movement,k=getHexKey(n);
            if(next>horizon||next>=(cost.get(k)??Infinity))continue;
            cost.set(k,next);push({h:n,g:next,f:next+heuristic(n)});
        }
    }
    if(cache.values.size<768)cache.values.set(key,result);return result;
}

// Strategic helpers share the simulation clock. Rendering/pathfinding budgets
// still use wall time, but device speed never changes a commander's decisions.
function wodAiThreats(owner, memories = true) {
    const tick=gameData._wodSimTick||0,now=wodAiOperationTime();let cache=gameData._aiThreatSnapshot;
    if(!cache||cache.hexes!==gameData.hexes||cache.tick!==tick||cache.now!==now||cache.n!==gameData.entities.length||cache.context!==gameData._aiCombatContexts)
        cache=gameData._aiThreatSnapshot={hexes:gameData.hexes,tick,now,n:gameData.entities.length,context:gameData._aiCombatContexts,values:new Map()};
    const key=owner+':'+Number(memories);if(!cache.values.has(key))cache.values.set(key,wodAiComputeThreats(owner,memories));
    return cache.values.get(key).slice();
}

function wodAiComputeThreats(owner, memories = true) {
    const visible = wodAiKnownEntities(owner).filter(u => u.hp > 0 && u.type !== 'convoy' &&
        !u.boardTransportUid && wodIsHostileOwner(u.owner, owner));
    if (!memories || !wodFogActive()) return visible.map(u=>wodAiThreatView(u,owner));
    const intel = wodFogFactionIntel(owner), seen = new Set(visible.map(u => u.uid));
    const now = wodAiOperationTime(), result = visible.map(u=>wodAiThreatView(u,owner));
    // how long a sighting is remembered depends on the difficulty (45 s on normal)
    const memory = wodAiDifficulty(owner).memory || 45;
    for (const [uid, record] of intel.units || []) {
        if (seen.has(uid)) continue;
        const age = Math.max(0, (now - record.seenAt) / 1000);
        if (age > memory) continue;
        const confidence = Math.exp(-age / (18 * memory / 45)) * (record.vacated ? .65 : 1);
        if (confidence < .12) continue;
        const hr=gameData.hexRadius||20,seconds=Math.min(age,6),vx=record.observedVx||0,vy=record.observedVy||0;
        const scale=Math.min(1,hr*5/Math.max(1,Math.hypot(vx,vy)*seconds)),prediction=getNearestHexToPoint(record.x+vx*seconds*scale,record.y+vy*seconds*scale);
        const plausible=prediction&&canUnitEnterHex(record,prediction)&&(record.type==='marine'||wodIsNavalUnit(record)||!isWaterHex(prediction));
        result.push({...record,x:plausible?prediction.x:record.x,y:plausible?prediction.y:record.y,
            memoryOrigin:{x:record.x,y:record.y},_intelMemory: true, _intelConfidence: confidence,
            uncertainty: Math.min(hr * 12, age * (record.speed || 15))});
    }
    return result;
}

// A unit also holds long path, traffic, rendering and command histories. Those
// fields are not intelligence and copying hundreds of them for every observer
// on every physics tick dominated late-game AI allocations. Freeze observable
// combat state while inheriting unchanged unit definitions/campaign modifiers.
function wodAiThreatView(u,owner) {
    return Object.assign(Object.create(u),{
        uid:u.uid,type:u.type,owner:u.owner,x:u.x,y:u.y,hp:u.hp,maxHp:u.maxHp,
        manpower:u.manpower,maxManpower:u.maxManpower,morale:u.morale,maxMorale:u.maxMorale,
        damage:u.damage,speed:u.speed,range:u.range,isGeneral:u.isGeneral,veteran:u.veteran,xp:u.xp,
        retreating:u.retreating,moraleBroken:u.moraleBroken,boardTransportUid:u.boardTransportUid,
        _medicalRecovering:u._medicalRecovering,_combatEngaged:u._combatEngaged,combatTargetUid:u.combatTargetUid,
        inWater:u.inWater,amphibInWater:u.amphibInWater,_observerOwner:owner
    });
}

function wodAiKnownCommand(unit, observer = unit.owner) {
    if (unit._intelMemory) return unit.command || 1;
    if (wodIsFriendlyOwner(unit.owner, observer)) return wodGeneralStatMultiplier(unit);
    const radius = wodFortCombatAuraRadiusPx();
    return wodAiCombatContext(observer).generals.some(g => g.hp > 0 && g.isGeneral &&
        wodIsFriendlyOwner(g.owner, unit.owner) && Math.hypot(g.x-unit.x, g.y-unit.y) <= radius) ? 1.05 : 1;
}

function wodAiKnownCover(unit, observer) {
    const radius = wodFortCombatAuraRadiusPx();
    return wodAiCombatContext(observer).forts.some(f => wodIsFriendlyOwner(f.owner, unit.owner) &&
        Math.hypot(f.x-unit.x, f.y-unit.y) <= radius) ? .8 : 1;
}

function wodAiCombatContext(owner) {
    gameData._aiCombatContexts ||= {};
    const tick=Math.floor(wodAiOperationTime()/500),old=gameData._aiCombatContexts[owner];
    if(old?.tick===tick&&old.hexes===gameData.hexes&&old.entities===gameData.entities)return old;
    return gameData._aiCombatContexts[owner]={tick,hexes:gameData.hexes,entities:gameData.entities,
        generals:wodAiKnownEntities(owner).filter(u=>u.isGeneral),forts:wodAiKnownForts(owner),forecasts:new Map()};
}

function wodAiDpsAgainst(attacker, defender, observer, terrain) {
    if (!attacker || attacker.hp <= 0) return 0;
    const from = terrain || wodCombatTerrainHex(attacker), to = wodCombatTerrainHex(defender);
    const attack = Math.sqrt(getTerrainAttackModifier(attacker, from) * getTerrainAttackModifier(attacker, to));
    const morale = .18 + .82 * Math.max(0, Math.min(1, (attacker.morale ?? 100) / 100));
    return (attacker.damage || 0) * .95 * attack * getTerrainDefenseModifier(defender, to) * morale *
        // Command improves both each hit and firing rate; defender command improves toughness.
        wodVeteranStatMult(attacker) * Math.pow(wodAiKnownCommand(attacker, observer),2) /
        (Math.max(.05, (attacker.attackCooldown || 2) * WOD_ATTACK_INTERVAL_MULT) * wodAiKnownCommand(defender, observer)) *
        wodAiKnownCover(defender, observer);
}

function wodAiForecast(owner, members, enemies) {
    const ours = members.filter(u => u.hp > u.maxHp * .34 && !u.retreating && !u.moraleBroken && !u._medicalRecovering);
    const foes = enemies.filter(u => u.hp > 0 && !u.moraleBroken);
    if (!foes.length) return {ratio: Infinity, lossFraction: 0, ownDps: 0, enemyDps: 0};
    const context=wodAiCombatContext(owner),keyOf=u=>[u.uid,Math.round(u.x/20),Math.round(u.y/20),Math.ceil(u.hp/5),Math.round((u.morale??100)/5),!!u.veteran,u._intelConfidence?.toFixed(1)].join(':');
    const key=ours.map(keyOf).join('|')+'>'+foes.map(keyOf).join('|');
    if(context.forecasts.has(key))return context.forecasts.get(key);
    const ownHp = ours.reduce((n,u) => n + u.hp, 0);
    const enemyHp = foes.reduce((n,u) => n + u.hp * (u._intelConfidence ?? 1), 0);
    // Representative opponents keep the estimate bounded even on crowded fronts.
    const representatives = list => list.slice().sort((a,b) => (b.damage || 0)-(a.damage || 0)).slice(0, 12);
    const sampleFoes = representatives(foes), sampleOwn = representatives(ours);
    const averageDps = (u, targets) => targets.length ? targets.reduce((n,e) => n + wodAiDpsAgainst(u,e,owner),0) / targets.length : 0;
    const ownDps = ours.reduce((n,u) => n + averageDps(u,sampleFoes),0);
    const enemyDps = foes.reduce((n,u) => n + averageDps(u,sampleOwn) * (u._intelConfidence ?? 1),0);
    const ratio = Math.sqrt(ownHp * ownDps / Math.max(.01, enemyHp * enemyDps));
    const result={ratio, ownDps, enemyDps, lossFraction: Math.min(1, enemyDps * 5 / Math.max(1,ownHp))};
    if(context.forecasts.size<256)context.forecasts.set(key,result);return result;
}

function wodAiAttackThreshold(owner,continuing=false) {
    const required=.92+(wodAiCommander(owner).ratio-1)*.45+(wodAiDifficulty(owner).edge||0);
    return continuing?Math.max(.78,required-.16):required;
}

// Risk changes orders, never combat stats. A known town or a supply cut is
// worth a harder fight than an arbitrary patch of ground.
function wodAiObjectiveRisk(owner,goal,job={}) {
    const h=goal&&getNearestHexToPoint(goal.x,goal.y),known=wodAiKnownCities(owner);
    const city=goal&&known.find(c=>c.id===goal.id||h&&c.q===h.q&&c.r===h.r);
    const town=city&&wodIsHostileOwner(city.owner,owner),lastTown=town&&known.filter(c=>c.owner===city.owner).length===1;
    const cut=!!(job.cutoff||job.cutHexes?.length||job.assaultKind==='supply-cut'||
        ['encircle','envelopment'].includes(job.mode)||job.mode==='flank'&&job.jobs?.some(j=>j.route));
    const value=cut?1.8:town?(lastTown?2:1.4):job.objectiveStructure?1.2:.4;
    return {kind:cut?'supply-cut':town?'town':job.objectiveStructure?'structure':'territory',
        launch:Math.max(.84,wodAiAttackThreshold(owner)-value*.07),
        continue:Math.max(.72,wodAiAttackThreshold(owner,true)-value*.035),
        lossBudget:(town||cut)? .60:.42};
}

function wodAiCanReach(unit, target) {
    if (!unit || !target) return false;
    const key = `${target.q},${target.r}`;
    if (wodIsNavalUnit(unit)) return !!wodAiOperationReach(unit,true).has(key);
    return !!wodAiOperationReach(unit).has(key);
}

function wodAiTravelCost(unit, target) {
    if (!wodAiCanReach(unit,target)) return Infinity;
    const start = getNearestHexToPoint(unit.x,unit.y), end = wodHexAt(target.q,target.r) || target;
    // Sorting a roster asks for the same route estimate many times. Reuse it
    // only while the unit, target and terrain are exactly unchanged.
    let cache=unit._aiTravelCosts;
    const version=gameData._wodPfVer||0,geometry=gameData._landGeometryRevision||0;
    if(!cache||cache.hexes!==gameData.hexes||cache.version!==version||cache.geometry!==geometry||cache.type!==unit.type||cache.owner!==unit.owner||cache.x!==unit.x||cache.y!==unit.y||cache.speed!==unit.speed||cache.startOwner!==start?.owner)
        cache=unit._aiTravelCosts={hexes:gameData.hexes,version,geometry,type:unit.type,owner:unit.owner,x:unit.x,y:unit.y,speed:unit.speed,startOwner:start?.owner,values:new Map()};
    const key=end.x+','+end.y;if(cache.values.has(key))return cache.values.get(key);
    const distance = Math.hypot(unit.x-end.x,unit.y-end.y), hr=gameData.hexRadius||20;
    let obstacle=0;
    const steps=Math.min(40,Math.max(1,Math.ceil(distance/hr)));
    for(let i=1;i<steps;i++) {
        const h=getNearestHexToPoint(unit.x+(end.x-unit.x)*i/steps,unit.y+(end.y-unit.y)*i/steps);
        if(h && (isWaterHex(h)&&!isBridgeHex(h)||!canUnitEnterHex(unit,h)))obstacle+=hr*3;
    }
    const result=(distance+obstacle)/Math.max(1,unit.speed||15)+(start?.owner===unit.owner?0:2);
    if(cache.values.size>=128)cache.values.clear();cache.values.set(key,result);return result;
}

// Reuse a bounded reverse route field for an entire operation. Straight-line
// rallies chose the wrong side of winding rivers; this follows legal land/bridge links.
function wodAiLandRoute(unit,goal,strategic=true) {
    const start=getNearestHexToPoint(unit.x,unit.y),end=getNearestHexToPoint(goal.x,goal.y);
    if(!start||!end||isWaterHex(start)&&!isBridgeHex(start)||isWaterHex(end)&&!isBridgeHex(end))return null;
    const now=wodAiOperationTime(),version=gameData._wodPfVer||0;
    let cache=gameData._aiLandRoutes;
    if(cache?.hexes!==gameData.hexes||cache.version!==version)cache=gameData._aiLandRoutes={hexes:gameData.hexes,version,fields:new Map(),marches:new Map()};
    const fields=strategic?cache.fields:cache.marches,limit=strategic?16:48;
    const key=Number(wodCanClimb(unit))+':'+getHexKey(end),sk=getHexKey(start);
    let field=fields.get(key);
    if(!field){
        field={queue:[end],head:0,next:new Map([[getHexKey(end),null]]),updatedAt:-Infinity};fields.set(key,field);
        if(fields.size>limit)fields.delete(fields.keys().next().value);
    }
    if(!field.next.has(sk)&&now-field.updatedAt>=450){
        field.updatedAt=now;const deadline=performance.now()+2.5;let visited=0;
        while(field.head<field.queue.length&&visited++<900){
            if((visited&63)===0&&performance.now()>deadline)break;
            const h=field.queue[field.head++],neighbors=getNeighborHexes(h).slice();
            if(gameData.bridges?.length)wodForEachBridgePathPortal(unit,h,n=>{if(!neighbors.includes(n))neighbors.push(n);});
            for(const n of neighbors){
                const k=getHexKey(n);if(field.next.has(k)||isWaterHex(n)&&!isBridgeHex(n)||!canUnitEnterHex(unit,n)||!wodCanStepBetweenHexes(unit,n,h,true))continue;
                field.next.set(k,h);field.queue.push(n);
            }
            if(field.next.has(sk))break;
        }
    }
    if(!field.next.has(sk))return null;
    const result=[start];let current=start;
    for(let i=0;i<512&&!wodHexKeysEqual(current,end);i++){
        current=field.next.get(getHexKey(current));if(!current)return null;result.push(current);
    }
    return result;
}

function wodAiNeedsLandDetour(unit,goal) {
    const hr=gameData.hexRadius||20,steps=Math.min(180,Math.max(1,Math.ceil(Math.hypot(goal.x-unit.x,goal.y-unit.y)/(hr*.55))));
    let previous=getNearestHexToPoint(unit.x,unit.y);
    for(let i=1;i<=steps;i++){
        const h=getNearestHexToPoint(unit.x+(goal.x-unit.x)*i/steps,unit.y+(goal.y-unit.y)*i/steps);
        if(!h||isWaterHex(h)&&!isBridgeHex(h)||!canUnitEnterHex(unit,h)||previous&&!wodHexKeysEqual(previous,h)&&!wodCanStepBetweenHexes(unit,previous,h,true))return true;
        previous=h;
    }
    return false;
}

function wodAiRouteAdvance(unit,goal) {
    const route=wodAiLandRoute(unit,goal);
    if(!route||route.length<7)return goal;
    // A shared corridor avoids cross-river objectives while leaving room for
    // ordinary collision avoidance and per-class terrain choices in movement.
    return route[Math.min(route.length-1,8)];
}

function wodAiObjectiveCost(owner, members, city) {
    const strategy=wodAiBattlePlan(owner),profile=wodAiCommander(owner),lead=members.find(u=>u.type==='heavy')||members[0];
    const hr=gameData.hexRadius||20,now=wodAiOperationTime(),threats=wodAiThreats(owner);
    const enemy=threats.filter(e=>Math.hypot(e.x-city.x,e.y-city.y)<hr*9).reduce((n,e)=>n+wodAiUnitCombatPower(e),0);
    const travel=wodAiTravelCost(lead,city),failure=strategy.failures[city.id];
    let value=enemy*(profile.id==='maneuver'?10:6)+Math.min(100,travel)*.1-(city.hasFactory?3:0)-(city.hasHarbor?1:0);
    if(strategy.primaryId===city.id&&profile.id!=='maneuver')value-=8;
    if(failure&&now-failure.at<90000)value+=12+Math.min(20,failure.count*5);
    if(profile.id==='highland'){
        const rough=getHexesInRadius(city.q,city.r,4).map(p=>wodHexAt(p.q,p.r)).filter(h=>h&&['hill','mountain'].includes(h.type)).length;
        value-=Math.min(6,rough*.2)*Number(members.some(wodCanClimb));
    }
    if(strategy.intent==='defend'){
        const own=gameData.cities.filter(c=>c.owner===owner);value+=Math.min(...own.map(c=>Math.hypot(c.x-city.x,c.y-city.y)/hr),100)*.2;
    }
    return value;
}

function wodAiSupplyReach(ship, troops) {
    const start=getNearestHexToPoint(ship.x,ship.y),radius=wodFortCombatAuraRadiusPx();
    if(!start)return new Set();
    const protectedNow=troops.filter(u=>Math.hypot(u.x-ship.x,u.y-ship.y)<radius*.99);
    if(!protectedNow.length)return wodNavalWaterRegionKeys(ship,start)||new Set();
    const keys=new Set([getHexKey(start)]),queue=[{h:start,depth:0}];
    for(let i=0;i<queue.length&&i<320;i++){
        const {h,depth}=queue[i];if(depth>=10)continue;
        for(const n of getNeighborHexes(h)){
            const key=getHexKey(n);
            if(keys.has(key)||!wodIsOpenWaterHex(n)||!wodCanStepBetweenHexes(ship,h,n,true)||
                !protectedNow.every(u=>Math.hypot(u.x-n.x,u.y-n.y)<radius*.99))continue;
            keys.add(key);queue.push({h:n,depth:depth+1});
        }
    }
    return keys;
}

// Reassess the fight around the regiment, rather than crediting a distant army.
function wodAiLocalSituation(unit) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,key=Math.floor(now/900)+':'+Math.round(unit.x/hr)+','+Math.round(unit.y/hr);
    gameData._aiLocalSituation ||= new WeakMap();const old=gameData._aiLocalSituation.get(unit);if(old?.key===key&&old.hexes===gameData.hexes)return old;
    const threats=wodAiThreats(unit.owner).filter(e=>!wodIsNavalUnit(e)&&Math.hypot(e.x-unit.x,e.y-unit.y)<hr*9);
    const immediate=threats.filter(e=>!e._intelMemory&&(wodAiArrivalSeconds(e,unit,e.range||50,8)<=8||wodAiArrivalSeconds(unit,e,unit.range||50,8)<=8));
    const enemies=threats.filter(e=>e._intelMemory||immediate.includes(e));
    const contacts=immediate.map(e=>{
        const dx=e.x-unit.x,dy=e.y-unit.y,distance=Math.hypot(dx,dy)||1,stand=Math.min(distance,e.range||50);
        return {x:unit.x+dx/distance*stand,y:unit.y+dy/distance*stand};
    });
    const allies=gameData.entities.filter(u=>u.owner===unit.owner&&u.hp>u.maxHp*.4&&!u.boardTransportUid&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&
        !wodIsNavalUnit(u)&&u.type!=='convoy'&&Math.hypot(u.x-unit.x,u.y-unit.y)<hr*6&&
        (u===unit||!immediate.length||contacts.some(p=>wodAiArrivalSeconds(u,p,u.range||50,8)<=8)));
    const forecast=wodAiForecast(unit.owner,allies,enemies);
    const retreat=immediate.length>0&&forecast.ratio<.92;
    const result={key,hexes:gameData.hexes,enemies,allies,forecast,retreat};gameData._aiLocalSituation.set(unit,result);return result;
}

// Only discovered towns are eligible. Winning a frontier fight should open a
// town assault rather than renew an endless sequence of one-cell operations.
function wodAiDiscoveryBearing(owner) {
    const now=wodAiOperationTime();let cache=gameData._aiDiscoveryBearings;
    if(cache?.hexes!==gameData.hexes)cache=gameData._aiDiscoveryBearings={hexes:gameData.hexes,owners:{}};
    const old=cache.owners[owner];if(old&&now-old.at<4000)return old;
    const cities=gameData.cities.filter(c=>c.owner===owner);
    const x=cities.reduce((n,c)=>n+c.x,0)/Math.max(1,cities.length),y=cities.reduce((n,c)=>n+c.y,0)/Math.max(1,cities.length);
    const explored=wodFogActive()?wodFogFactionIntel(owner).explored:null;
    const frontier=wodCachedFrontlineHexes(owner).flatMap(h=>getNeighborHexes(h)).filter(h=>
        !isWaterHex(h)&&wodIsHostileOwner(h.owner,owner)&&(!explored||explored.has(getHexKey(h))));
    const dx=frontier.reduce((n,h)=>n+h.x-x,0)/Math.max(1,frontier.length),dy=frontier.reduce((n,h)=>n+h.y-y,0)/Math.max(1,frontier.length),len=Math.hypot(dx,dy)||1;
    return cache.owners[owner]={at:now,x,y,dx:dx/len,dy:dy/len};
}

function wodAiKnownStructures(owner) {
    const hospitals=wodFogActive()?[...(wodFogFactionIntel(owner).hospitals?.values()||[])]:gameData.hospitals||[];
    return [...wodAiKnownForts(owner).map(s=>({...s,kind:'fort'})),...hospitals.map(s=>({...s,kind:'hospital'}))]
        .filter(s=>wodIsHostileOwner(s.owner,owner));
}

function wodAiSupplyExposure(ship,point) {
    const hr=gameData.hexRadius||20;
    return wodAiThreats(ship.owner,false).filter(e=>e.type!=='convoy'&&
        Math.hypot(e.x-point.x,e.y-point.y)<(e.range||50)+hr*2.5);
}

function wodAiSupplySiteSafe(ship,site) {
    const foes=wodAiSupplyExposure(ship,site);if(!foes.length)return true;
    const hr=gameData.hexRadius||20;
    const screen=gameData.entities.filter(u=>u.owner===ship.owner&&u.hp>u.maxHp*.45&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&
        (u.type==='ship'||isLandArmyUnit(u)&&!isWaterHex(getNearestHexToPoint(u.x,u.y)))&&
        foes.some(e=>Math.hypot(u.x-e.x,u.y-e.y)<(u.range||50)+hr*1.5)&&Math.hypot(u.x-site.x,u.y-site.y)<hr*10);
    return screen.length>0&&wodAiForecast(ship.owner,screen,foes).ratio>=1.15;
}
