// Unit orders, preferred targets and arrival handling.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

function replanUnitOrder(unit) {
    if(unit._wodRiskRetreat&&unit.retreating&&unit.orderTarget) {
        const now=gameData._aiEconomyClock||0;if((unit._wodRetreatReplanAt||0)>now)return false;
        unit._wodRetreatReplanAt=now+.5;
        return assignUnitMoveAlongWaypoints(unit,[{x:unit.orderTarget.x,y:unit.orderTarget.y}],{forceRetreat:true,retainMoraleBroken:true,transportInternal:true});
    }
    if(wodIsPlayerMarchOrder(unit)) return false;
    if(unit._wodPathGiveUpUntil && performance.now() < unit._wodPathGiveUpUntil) return false;
    let shThrottle = getNearestWalkableHexForUnit(unit, unit.x, unit.y);
    if(shThrottle && isWaterHex(shThrottle) && (unit.type === 'marine' || wodIsNavalUnit(unit))) {
        let nowPf = performance.now();
        if(unit._wodReplanPfUntil && nowPf < unit._wodReplanPfUntil) return false;
        unit._wodReplanPfUntil = nowPf + 120;
    }
    let nowLand = performance.now();
    if(wodUnitPrefersLandOnlyPath(unit) && unit._wodReplanLandUntil && nowLand < unit._wodReplanLandUntil)
        return false;
    if(wodOrderIntoWater(unit, null)) {
        let ampHex = getNearestWalkableHexForUnit(unit, unit.x, unit.y);
        if(ampHex && wodIsOpenWaterHex(ampHex)) {
            if(unit._wodReplanAmpUntil && nowLand < unit._wodReplanAmpUntil) return false;
            unit._wodReplanAmpUntil = nowLand + 200;
        }
    }
    if(unit.fullMarchWaypoints && unit.fullMarchWaypoints.length > 0) {
        return assignUnitMoveAlongWaypoints(unit, unit.fullMarchWaypoints, {fromLegAdvance: true});
    }
    let finalTarget = unit.orderTarget || (unit.target && unit.target.finalTarget) || unit.target;
    if(!finalTarget) return false;
    let convoyCity = unit.type === 'convoy' && finalTarget.isCity;
    let startHex = getNearestWalkableHexForUnit(unit, unit.x, unit.y);
    let targetHex = getNearestHexToPoint(finalTarget.x, finalTarget.y);
    if(unit.type === 'convoy' && unit.convoySeaRoute && convoyCity) {
        let destCity = findCityNearPointForOwner(finalTarget.x, finalTarget.y, unit.owner);
        let wh = resolveTradeConvoyPathHex(unit, destCity);
        if(wh) targetHex = wh;
    }
    if(wodUnitPrefersLandOnlyPath(unit)) {
        let resolved = wodResolveLandMarchHex(unit, finalTarget.x, finalTarget.y, startHex);
        if(!resolved) return false;
        targetHex = resolved.hex;
        finalTarget = {
            x: resolved.exactX,
            y: resolved.exactY,
            intoWater: !!resolved.intoWater,
            ...(convoyCity ? { isCity: true } : {})
        };
        unit.orderTarget = finalTarget;
        wodSetMarchOrderFlags(unit, resolved);
    } else if(!canUseHexForMovement(unit, targetHex)) {
        let reachable = findReachableOrderHex(unit, finalTarget.x, finalTarget.y);
        if(!reachable) return false;
        targetHex = reachable.hex;
        finalTarget = {x: reachable.exactX, y: reachable.exactY};
        if(convoyCity) finalTarget.isCity = true;
        unit.orderTarget = finalTarget;
    }
    let path = findPathAroundTerrain(unit, targetHex, startHex, false, 'auto',
        wodMpIsHumanOwner(unit.owner) ||
        wodIsNavalUnit(unit) ||
        (unit.type === 'convoy' && unit.convoySeaRoute) ||
        !!(wodUnitPrefersLandOnlyPath(unit) && gameData.bridges && gameData.bridges.length));
    if(path.length <= 1 && wodUnitPrefersLandOnlyPath(unit) && targetHex && startHex &&
        (wodOrderIntoWater(unit, targetHex) || wodIsOpenWaterHex(startHex) ||
            wodMarchBlockedWithoutBridge(unit, startHex, targetHex))) {
        let ampPath = findAmphibiousMarchPath(unit, startHex, targetHex);
        if(wodHexPathLength(ampPath) > 1) path = ampPath;
    }
    if(path.length <= 1 && wodIsNavalUnit(unit) && targetHex) {
        let hop = findGreedyWaterStep(unit, targetHex, { fromHex: startHex });
        if(hop) {
            unit.path = null;
            unit.target = {x: hop.x, y: hop.y, pathPrepared: true, shipGreedy: true};
            return true;
        }
    }
    if(path.length <= 1 && unit.type === 'convoy' && unit.convoySeaRoute && targetHex) {
        let hop = findGreedyWaterStep(unit, targetHex);
        if(hop) {
            unit.path = null;
            unit.target = {x: hop.x, y: hop.y, pathPrepared: true, shipGreedy: true};
            return true;
        }
    }
    if(path.length <= 1 && unit.type === 'convoy' && !unit.convoySeaRoute && targetHex) {
        let hop = findGreedyLandStep(unit, targetHex);
        if(hop) {
            unit.path = null;
            unit.target = {x: hop.x, y: hop.y, pathPrepared: true, convoyGreedy: true};
            return true;
        }
    }
    if(path.length <= 1 && wodUnitPrefersLandOnlyPath(unit) && targetHex) {
        if(startHex && wodIsOpenWaterHex(startHex)) {
            let hop = findGreedyAmphibiousWaterStep(unit, targetHex, { fromHex: startHex });
            if(hop) {
                unit.path = null;
                unit.target = {x: hop.x, y: hop.y, pathPrepared: true, ampGreedy: true};
                unit._wodOrderIntoWater = true;
                unit._wodReplanAmpUntil = 0;
                return true;
            }
        } else if(!wodOrderIntoWater(unit, targetHex)) {
            let alt = wodTryPortalBridgeMarchPath(unit, startHex, targetHex);
            if(alt.length > 1) {
                let endPt = { x: finalTarget.x, y: finalTarget.y };
                if(convoyCity) endPt.isCity = true;
                if(wodPathCrossesBridge(alt)) unit._wodRouteUsesBridge = true;
                unit.path = wodHexPathToWorldWaypoints(unit, alt, endPt);
                if(!wodTakeNextPathTarget(unit)) {
                    unit.path = null;
                    unit.target = {
                        x: endPt.x,
                        y: endPt.y,
                        pathPrepared: true,
                        ...(convoyCity ? { isCity: true } : {})
                    };
                }
                unit._wodReplanLandUntil = 0;
                return true;
            }
        }
        let hop = findGreedyLandStep(unit, targetHex);
        if(hop) {
            unit.path = null;
            unit.target = {x: hop.x, y: hop.y, pathPrepared: true, landGreedy: true};
            return true;
        }
        if(!wodMpIsHumanOwner(unit.owner)) {
            let detour = findLocalDetourHex(unit, finalTarget.x, finalTarget.y);
            if(detour && (!startHex || detour.q !== startHex.q || detour.r !== startHex.r)) {
                unit.path = null;
                unit.target = {x: detour.x, y: detour.y, detour: true, finalTarget, pathPrepared: true};
                return true;
            }
        }
    }
    if(path.length > 1) {
        if(wodPathCrossesOpenWater(path)) unit._wodOrderIntoWater = true;
        if(wodPathCrossesBridge(path)) unit._wodRouteUsesBridge = true;
        let endPt = {x: finalTarget.x, y: finalTarget.y};
        if(convoyCity) endPt.isCity = true;
        unit.path = wodHexPathToWorldWaypoints(unit, path, endPt);
        if(!wodTakeNextPathTarget(unit)) {
            unit.path = null;
            unit.target = {
                x: endPt.x,
                y: endPt.y,
                pathPrepared: true,
                ...(convoyCity ? { isCity: true } : {})
            };
        }
        unit._wodReplanLandUntil = 0;
        unit._wodReplanAmpUntil = 0;
        return true;
    }
    if(wodUnitPrefersLandOnlyPath(unit) && path.length <= 1) {
        unit._wodReplanLandUntil = performance.now() + 650;
        unit._wodPathGiveUpUntil = performance.now() + 900;
    }
    if(targetHex && wodUnitPrefersLandOnlyPath(unit)) {
        unit.path = null;
        let t = {x: targetHex.x, y: targetHex.y, pathPrepared: true};
        if(convoyCity) t.isCity = true;
        unit.target = t;
        return true;
    }
    if(targetHex && (wodIsNavalUnit(unit) || (unit.type === 'convoy' && unit.convoySeaRoute))) {
        // Never aim straight at a distant water hex — chords cross land and clamp forever.
        if(!wodIsOpenWaterHex(targetHex)) return false;
        unit._wodPfRelaxUntil = performance.now() + 180;
        let hop = findGreedyWaterStep(unit, targetHex, { fromHex: startHex });
        if(hop) {
            unit.path = null;
            unit.target = { x: hop.x, y: hop.y, pathPrepared: true, shipGreedy: true };
            return true;
        }
        unit._wodPathGiveUpUntil = performance.now() + 500;
        return false;
    }
    if(targetHex) {
        unit.path = null;
        let t = {x: finalTarget.x, y: finalTarget.y, pathPrepared: true};
        if(convoyCity) t.isCity = true;
        unit.target = t;
        return true;
    }
    return false;
}
function initConvoyRoute(convoy, destCity, validatedPath) {
    if(!destCity||destCity.owner!==convoy.owner||convoy.convoySeaRoute&&!destCity.hasHarbor)return false;
    let destHex = validatedPath?.length>1?validatedPath[validatedPath.length-1]:resolveTradeConvoyPathHex(convoy, destCity);
    let startHex = getNearestWalkableHexForUnit(convoy, convoy.x, convoy.y);
    if(!startHex || !destHex)return false;
    let path = validatedPath || findPathAroundTerrain(convoy, destHex, startHex);
    if(path.length <= 1 && !convoy.convoySeaRoute) {
        let alt = wodTryPortalBridgeMarchPath(convoy, startHex, destHex);
        if(alt.length > 1) path = alt;
    }
    if(!path.length||!wodPathReachesTarget(path,destHex)||!convoy.convoySeaRoute&&wodPathCrossesOpenWater(path))return false;
    convoy.convoyToKey=convoyCityKey(destCity);convoy.convoyDock={x:destHex.x,y:destHex.y};
    convoy.orderTarget={...convoy.convoyDock,isCity:true};convoy._convoyRetryAt=0;
    convoy.path=wodHexPathToWorldWaypoints(convoy,path,convoy.convoyDock);
    if(!convoy.path.length)convoy.path=[{...convoy.convoyDock}];
    convoy.path[convoy.path.length-1].isCity=true;
    wodTakeNextPathTarget(convoy);return true;
}
function wodQueueTradeConvoySpawn(owner,sea) {
    const cities=gameData.cities.filter(c=>c.owner===owner&&(!sea||c.hasHarbor));if(cities.length<2)return;
    const work=gameData._tradeSpawnWork||(gameData._tradeSpawnWork=new Map()),key=owner+':'+Number(sea);if(work.has(key))return;
    const sources=cities.filter(c=>!cityCurrentlyHasOutboundConvoy(c,sea));if(!sources.length)return;
    const limit=owner===1?(sea?14:12):(sea?8:7),pairs=[],seen=new Set();
    for(let i=0;i<limit*4&&pairs.length<limit;i++) {
        const from=sources[Math.floor(Math.random()*sources.length)],to=cities[Math.floor(Math.random()*cities.length)];if(from===to)continue;
        const pair=convoyCityKey(from)+'>'+convoyCityKey(to);if(seen.has(pair))continue;seen.add(pair);pairs.push({from,to});
    }
    if(pairs.length)work.set(key,{owner,sea,hexes:gameData.hexes,pairs,index:0});
}
function trySpawnLandTradeConvoysForOwner(owner) {wodQueueTradeConvoySpawn(owner,false);}
function trySpawnSeaTradeConvoysForOwner(owner) {wodQueueTradeConvoySpawn(owner,true);}
function trySpawnTradeConvoysForOwner(owner) {trySpawnLandTradeConvoysForOwner(owner);trySpawnSeaTradeConvoysForOwner(owner);}
function wodStepTradeConvoySpawns() {
    const work=gameData._tradeSpawnWork;
    if(!work?.size||gameData._wodTradeSpawnFrameDone||!wodCanSpendPf())return;
    gameData._wodTradeSpawnFrameDone=true;
    const key=work.keys().next().value,job=work.get(key);work.delete(key);
    if(job.hexes!==gameData.hexes)return;
    const {owner,sea}=job,{from,to}=job.pairs[job.index++];
    const valid=from.owner===owner&&to.owner===owner&&(!sea||from.hasHarbor&&to.hasHarbor)&&!cityCurrentlyHasOutboundConvoy(from,sea);
    if(valid) {
        const docks=sea?wodTradeSeaDockPair(from,to,owner):null;
        const origin=sea?docks?.from:from,destination=sea?docks?.to:wodHexAt(to.q,to.r);
        if(origin&&destination) {
            const probe={type:'convoy',owner,convoySeaRoute:sea,x:origin.x,y:origin.y},start=getNearestWalkableHexForUnit(probe,origin.x,origin.y);
            const path=start?findPathAroundTerrain(probe,destination,start):[];
            if(path.length>1&&wodPathReachesTarget(path,destination)&&(sea||!wodPathCrossesOpenWater(path))) {
                const convoy={type:'convoy',owner,convoySeaRoute:sea,name:generateUnitName('convoy',sea,owner),x:origin.x,y:origin.y,target:null,path:null,orderTarget:null,
                    hp:50,maxHp:50,speed:WOD_UNIT_BASE_SPEED,damage:0,range:0,attackCooldown:10,selected:false,shake:0,radius:6,tradeValue:300,convoyFromKey:convoyCityKey(from)};
                gameData.entities.push(convoy);initConvoyRoute(convoy,to,path);return;
            }
        }
    }
    if(job.index<job.pairs.length)work.set(key,job);
}
function wodStopAttackMarch(unit) {
    unit._wodPlayerOrderEpoch=(unit._wodPlayerOrderEpoch||0)+1;
    unit.target=null;unit.path=null;unit.orderTarget=null;unit.fullMarchWaypoints=null;unit.marchWpCursor=0;
    unit._trafficYield=null;unit.holding=false;invalidateUnitOrderArrowCache(unit);
}
// Pursue visible contacts with bounded replanning. Hidden contacts keep
// their last seen position, and a new move/retreat cancels pursuit.
function wodUpdateUnitAttackOrder(unit,force=false) {
    const order=unit._wodAttackOrder,now=gameData._aiEconomyClock||0;
    if(!order||gameData.mp?.enabled&&!gameData.mp.isHost)return;
    if(unit.moraleBroken||unit.retreating||unit.boardTransportUid){unit._wodAttackOrder=null;unit._wodAttackApproaching=false;return;}
    if(!force&&now<(order.nextCheck||0))return;order.nextCheck=now+.5;
    const enemy=gameData.entities.find(e=>e.uid===order.uid&&e.hp>0&&!e.boardTransportUid&&wodIsHostileOwner(e.owner,unit.owner));
    if(!enemy){wodStopAttackMarch(unit);unit.preferredTargetUid=null;unit._wodAttackOrder=null;unit._wodAttackApproaching=false;return;}
    const visible=wodOwnerCanSee(unit.owner,enemy),hr=gameData.hexRadius||20,range=(unit.range||50)*wodGeneralStatMultiplier(unit);
    if(visible)order.lastSeen={x:enemy.x,y:enemy.y};
    const point=order.lastSeen;if(!point)return;
    const distance=Math.hypot(point.x-unit.x,point.y-unit.y);
    unit._wodAttackApproaching=!visible||distance>range*.96;
    if(visible&&distance<=range*.96||!visible&&distance<hr*1.4){
        if(unit.target||unit.orderTarget)wodStopAttackMarch(unit);
        unit._wodAttackApproaching=false;return;
    }
    // Keep a useful route until the target moves a meaningful amount.
    if(unit.target&&order.aim&&Math.hypot(point.x-order.aim.x,point.y-order.aim.y)<hr*.8&&(unit.stuckTimer||0)<1&&(unit.blockedTimer||0)<1)return;
    if(!wodCanSpendPf()){order.nextCheck=now+.1;return;}
    const at=getNearestHexToPoint(point.x,point.y),reach=wodAiOperationReach(unit),naval=wodIsNavalUnit(unit);
    if(!at)return;
    const used=new Set(gameData.entities.filter(u=>u!==unit&&u._wodAttackOrder?.uid===order.uid&&u.orderTarget).map(u=>getHexKey(getNearestHexToPoint(u.orderTarget.x,u.orderTarget.y))));
    const desired=visible?range*.78:hr*.6;
    const sites=getHexesInRadius(at.q,at.r,Math.ceil(range/hr)+2).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&canUnitEnterHex(unit,h)&&reach.has(getHexKey(h))&&
        (!naval||wodIsOpenWaterHex(h))&&(naval||unit.type==='marine'||!isWaterHex(h))&&!used.has(getHexKey(h))).map(h=>{
        // A legal shore-edge firing position can reach a ship even
        // when the land cell's center sits just outside weapon range.
        const dx=point.x-h.x,dy=point.y-h.y,d=Math.hypot(dx,dy)||1,step=visible?Math.min(hr*.4,Math.max(0,d-range*.86)):0;
        return {q:h.q,r:h.r,x:h.x+dx/d*step,y:h.y+dy/d*step};
    }).filter(p=>Math.hypot(p.x-point.x,p.y-point.y)<(visible?range*.94:hr*1.5)&&!isWorldPositionBlockedByUnits(unit,p.x,p.y));
    const score=h=>Math.hypot(h.x-unit.x,h.y-unit.y)+Math.abs(Math.hypot(h.x-point.x,h.y-point.y)-desired)*1.8;
    sites.sort(wodByScore(score));
    const target=sites[0];if(!target)return;
    if(assignUnitMoveAlongWaypoints(unit,[target],{attackPursuit:true})){order.aim={...point};unit.holding=false;}
}
function wodSetPreferredTarget(owner,uids,targetUid,opt={}) {
    const target=targetUid&&gameData.entities.find(e=>e.uid===targetUid&&e.hp>0&&e.type!=='convoy'&&!e.boardTransportUid&&wodIsHostileOwner(e.owner,owner)&&wodOwnerCanSee(owner,e));
    if(targetUid&&!target)return 0;
    const ids=new Set(Array.isArray(uids)?uids.slice(0,500):[]);let count=0;
    for(const u of gameData.entities)if(ids.has(u.uid)&&u.owner===owner&&u.hp>0&&!u.id&&u.type!=='convoy'&&!u.boardTransportUid){
        if(target&&(u.moraleBroken||!(u.damage>0)))continue;
        if(u._wodAttackOrder)wodStopAttackMarch(u);
        u._wodAttackOrder=null;u._wodAttackApproaching=false;
        u.preferredTargetUid=target?.uid||null;u._combatProxTick=-1;count++;
        if(target&&opt.pursue!==false){
            wodStopAttackMarch(u);u.retreating=false;u._wodOrderedRetreat=false;
            u._wodAttackOrder={uid:target.uid,lastSeen:{x:target.x,y:target.y},nextCheck:0};
            wodUpdateUnitAttackOrder(u,true);
        }
    }
    return count;
}
function wodIssuePreferredTarget(target) {
    const owner=wodLocalPlayerOwner(),units=target?getMovableSelectedUnits():gameData.selection.filter(u=>u.owner===owner&&u.hp>0&&!u.id&&u.type!=='convoy');if(!units.length||gameData._spectator)return false;
    if(target&&(!wodIsHostileOwner(target.owner,owner)||!wodOwnerCanSee(owner,target)))return false;
    const cmd={kind:'focusTarget',uids:units.map(u=>ensureUnitId(u)),targetUid:target?ensureUnitId(target):null};
    if(gameData.mp?.enabled&&!gameData.mp.isHost){if(!wodMpMatchCanPlay())return false;wodMpSendCmd(cmd);}
    else if(!wodSetPreferredTarget(owner,cmd.uids,cmd.targetUid))return false;
    showNotification(target?'Attack target ordered':'Attack target cleared','info');syncInfoCardPanel();return true;
}
/** While exchanging fire at weapon range, move at one-third speed (orders are no longer halted). */
function wodRefreshUnitCombatProximity(unit, grid) {
    unit._combatEnemy = null;
    unit._combatEngaged = false;
    unit._combatProxTick = gameData._wodSimTick | 0;
    if(!unit || unit.type === 'convoy' || !grid) return;
    let range = (unit.range || 0)*wodGeneralStatMultiplier(unit);
    if(range <= 0) return;
    let minDist2 = range * range;
    let fighting = (unit.damage || 0) > 0;
    let enemy = null;
    let engaged = false;
    forEachNearbyUnit(grid, unit.x, unit.y, range, (other) => {
        if(other === unit || !wodIsHostileOwner(other.owner, unit.owner) || other.type === 'convoy' || other.hp <= 0 || other.boardTransportUid || !wodOwnerCanSee(unit.owner,other)) return;
        let dx = unit.x - other.x;
        let dy = unit.y - other.y;
        let dist2 = dx * dx + dy * dy;
        if(dist2 > minDist2 && !engaged) return;
        if(dist2 <= minDist2) {
            minDist2 = dist2;
            enemy = other;
        }
        if(!engaged && (fighting || (other.damage || 0) > 0) && dist2 <= range * range) engaged = true;
    });
    const preferred=unit.preferredTargetUid&&gameData.entities.find(e=>e.uid===unit.preferredTargetUid);
    if(unit.preferredTargetUid&&(!preferred||preferred.hp<=0||!wodIsHostileOwner(preferred.owner,unit.owner)))unit.preferredTargetUid=null;
    if(preferred&&preferred.hp>0&&!preferred.boardTransportUid&&wodIsHostileOwner(preferred.owner,unit.owner)&&wodOwnerCanSee(unit.owner,preferred)&&Math.hypot(preferred.x-unit.x,preferred.y-unit.y)<=range)enemy=preferred;
    unit._combatEnemy = enemy;
    unit._combatEngaged = engaged;
}
function getCombatMovementSlowdownFactor(unit, grid) {
    if(!unit || unit.type === 'convoy' || unit.moraleBroken) return 1;
    let engaged;
    if((unit._combatProxTick | 0) === (gameData._wodSimTick | 0))
        engaged = !!unit._combatEngaged;
    else if(!grid) return 1;
    else {
        wodRefreshUnitCombatProximity(unit, grid);
        engaged = !!unit._combatEngaged;
    }
    if(!engaged) return 1;
    // Ordered / morale retreats keep 75% march speed instead of the full combat crawl.
    if(unit.retreating) return 0.75;
    if(unit._wodAttackApproaching) return 0.75;
    return 1 / 3;
}
function wodUnitArrivedAtTarget(unit) {
    if(unit.type === 'convoy' && (unit.convoyToKey||unit.target?.isCity||unit.orderTarget?.isCity)) {
        const city=gameData.cities.find(c=>convoyCityKey(c)===unit.convoyToKey)||(!unit.convoyToKey&&unit.orderTarget&&findCityNearPointForOwner(unit.orderTarget.x,unit.orderTarget.y,unit.owner));
        if(!city||city.owner!==unit.owner||unit.convoySeaRoute&&!city.hasHarbor){rerouteConvoyAfterOwnerChange(unit);return;}
        let value = unit.tradeValue || 150;
        if(!unit._convoyDelivered){
            if(unit.owner === 1) gameData.money += value;
            else gameData.aiMoneyByOwner[unit.owner] = (gameData.aiMoneyByOwner[unit.owner] || 0) + value;
            unit._convoyDelivered=true;
        }
        unit.hp = 0;
    }
    unit.target = null;
    unit.path = null;
    unit.orderTarget = null;
    unit.fullMarchWaypoints = null;
    unit.marchWpCursor = 0;
    unit.blockedTimer = 0;
    unit.stuckTimer = 0;
    // A finished order is a finished order: leaving holding=true made the AI
    // renew stale hold states on arrived units instead of retasking them.
    unit.holding = false;
    unit._wodAiFriendBlockT = 0;
    if(typeof wodClearRetreatOnArrival === 'function') wodClearRetreatOnArrival(unit);
}
function wodAdvanceUnitPathTarget(unit) {
    if(unit.path && unit.path.length > 0) {
        if(wodTakeNextPathTarget(unit)) return true;
    }
    if(unit.fullMarchWaypoints && unit.marchWpCursor < unit.fullMarchWaypoints.length - 1) {
        unit.marchWpCursor++;
        if(assignUnitMoveAlongWaypoints(unit, unit.fullMarchWaypoints, {fromLegAdvance: true}))
            return !!unit.target;
        unit.marchWpCursor = Math.max(0, unit.marchWpCursor - 1);
        return false;
    }
    if(unit.target && unit.target.finalTarget) {
        unit.target = unit.target.finalTarget;
        return true;
    }
    if(unit.orderTarget) {
        let hr = gameData.hexRadius || 20;
        let ogx = unit.orderTarget.x - unit.x,
            ogy = unit.orderTarget.y - unit.y;
        let d2 = ogx * ogx + ogy * ogy;
        // Still on the bridge with a far-shore order — keep marching; never arrive mid-deck.
        let onDeck = unit._wodRouteUsesBridge && (
            wodUnitOnBridgeDeck(unit) ||
            wodPointOnBridgeForUnit(unit, unit.x, unit.y, 1.15)
        );
        if(onDeck && d2 > hr * hr * 0.25) {
            unit.path = null;
            unit.target = { x: unit.orderTarget.x, y: unit.orderTarget.y, pathPrepared: false };
            return true;
        }
        if(d2 > (wodMpIsHumanOwner(unit.owner)?1:hr * hr * 2.25)) {
            unit.path = null;
            unit.target = { x: unit.orderTarget.x, y: unit.orderTarget.y, pathPrepared: false };
            return true;
        }
    }
    wodUnitArrivedAtTarget(unit);
    return false;
}
function wodClearRetreatFlags(unit) {
    unit.retreating=false;unit._wodOrderedRetreat=false;unit._wodRiskRetreat=false;
    unit._wodRecoveryRetreat=false;unit._wodRecoveredRetreatWatch=null;
    unit._wodFleeD=null;unit._wodFleeT=0;unit._wodRetreatJamT=0;
}
/** Disbands a unit (the skull on the unit card, js/ui.js; a guest's 'disband' command on the host): it leaves the field at
 *  the next step, its men sent home, so no casualties are booked and nobody is credited with a kill. A transport with a
 *  regiment aboard, a convoy or a town cannot be disbanded. */
function wodDisbandUnit(unit) {
    if(!unit || unit.hp <= 0 || unit.id || unit.type === 'convoy' || unit.cargo) return false;
    unit._disbanded = true;
    unit.hp = 0;
    unit.target = null; unit.path = null; unit.orderTarget = null; unit.fullMarchWaypoints = null; unit.marchWpCursor = 0;
    gameData._aiMoveQueue?.delete(unit);
    return true;
}
function wodReleaseRecoveredUnit(unit, stopRecoveryOrder=false) {
    wodClearRetreatFlags(unit);
    unit._medicalRecovering=false;unit._medicalWaiting=false;unit._medicalGoal=null;
    unit._aiRecoveryGroup=null;unit.aiOrderUntil=0;
    if(stopRecoveryOrder){
        unit._trafficYield=null;unit.target=null;unit.path=null;unit.orderTarget=null;
        unit.fullMarchWaypoints=null;unit.marchWpCursor=0;unit.holding=false;
        gameData._aiMoveQueue?.delete(unit);invalidateUnitOrderArrowCache(unit);
    }
}
function wodUpdateRecoveredRetreat(unit, dt) {
    if(!unit||unit.hp<=0||unit.type==='convoy'||unit.boardTransportUid||unit._medicalEvacuating||unit._navalEvacuating)return;
    const flagged=unit.retreating||unit._wodOrderedRetreat||unit._wodRiskRetreat||unit._medicalRecovering||unit._medicalGoal||unit._wodRecoveryRetreat;
    if(!flagged||unit.moraleBroken){unit._wodRecoveredRetreatWatch=null;return;}
    const recovered=!wodUnitMissingStrength(unit)&&(unit.morale??0)>=(unit.maxMorale||WOD_MORALE_MAX)-.05;
    const goal=unit.orderTarget||unit.target?.finalTarget||unit.target;
    const futureLeg=unit.fullMarchWaypoints&&unit.marchWpCursor<unit.fullMarchWaypoints.length-1;
    const distance=goal?Math.hypot(goal.x-unit.x,goal.y-unit.y):0;
    if(!futureLeg&&!unit.path?.length&&(!unit.target||distance<=2)){
        wodClearRetreatOnArrival(unit);
        if(recovered)wodReleaseRecoveredUnit(unit,!!unit.target);
        return;
    }
    if(!recovered){unit._wodRecoveredRetreatWatch=null;return;}
    const now=gameData._aiEconomyClock||0,hr=gameData.hexRadius||20;
    let unsafe=unit._combatEngaged||now-(unit._moraleLastHitAt??-Infinity)<2||!!wodGetUnitEncirclementState(unit,getNearestHexToPoint(unit.x,unit.y));
    const threat=e=>{if(!unsafe&&e!==unit&&e.hp>0&&e.damage>0&&wodIsHostileOwner(e.owner,unit.owner)&&wodOwnerCanSee(unit.owner,e)&&Math.hypot(e.x-unit.x,e.y-unit.y)<Math.max(e.range||50,unit.range||50)+hr*4)unsafe=true;};
    if(!unsafe){if(gameData.unitSpatialGrid)forEachNearbyUnit(gameData.unitSpatialGrid,unit.x,unit.y,hr*12,threat);else gameData.entities.forEach(threat);}
    if(unsafe){unit._wodRecoveredRetreatWatch=null;return;}
    const recovery=unit._medicalRecovering||unit._medicalGoal||unit._wodRecoveryRetreat||unit.target?.isCity;
    if(recovery&&wodUnitHealingSite(unit)){wodReleaseRecoveredUnit(unit,true);return;}
    if(!wodMpIsHumanOwner(unit.owner)&&!unit._wodOrderedRetreat&&!unit._wodRiskRetreat){wodReleaseRecoveredUnit(unit,false);return;}
    // A safe, fully recovered unit with an obsolete blocked order must not
    // remain in retreat forever. Keep its movement goal so it can proceed
    // when traffic clears; a retreat making progress retains its state.
    const key=goal?goal.x+','+goal.y:'';let watch=unit._wodRecoveredRetreatWatch;
    if(!watch||watch.key!==key||distance<watch.distance-2)watch=unit._wodRecoveredRetreatWatch={key,distance,seconds:0};
    else watch.seconds+=Math.max(0,dt||0);
    if(watch.seconds>=8)wodReleaseRecoveredUnit(unit,!!recovery);
}
function wodClearRetreatOnArrival(unit) {
    if(!unit || unit.moraleBroken) return;
    if(unit.retreating || unit._wodOrderedRetreat || unit._wodRiskRetreat) {
        if(!wodMpIsHumanOwner(unit.owner)&&(unit.hp<unit.maxHp*.94||(unit.manpower??unit.maxManpower)<unit.maxManpower*.94))unit._medicalRecovering=true;
        wodClearRetreatFlags(unit);
    }
}
function wodClearUnitOrdersInstant(unit) {
    if(!unit) return;
    unit._trafficYield=null;
    unit.target = null;
    unit.path = null;
    unit.orderTarget = null;
    unit.fullMarchWaypoints = null;
    unit.marchWpCursor = 0;
    unit.combatEngaged = false;
    unit.retreating = false;
    unit.combatLockTimer = 0;
}
