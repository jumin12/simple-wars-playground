// AI: giving orders to units. AI moves go through wodAiMoveUnitToward: during a simulation frame they are queued
// and wodDrainAiMoveQueue applies a few per frame within the pathfinding budget. Units leased by the field command
// ignore orders from the other planners. Also: kept move intents, formation and firing slots, fire control.
'use strict';

function wodAiUnitSlotOffset(unit, hex, jitterScale) {
    let js = jitterScale == null ? 0.22 : jitterScale;
    let j = gameData.hexRadius * js;
    let h = 0;
    let s = (unit && unit.uid ? unit.uid : 'u') + ':' + (hex ? hex.q + ',' + hex.r : '0,0');
    for(let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    let a = ((h & 0xffff) / 0xffff) * Math.PI * 2;
    let rmag = (((h >> 16) & 0x7fff) / 0x7fff - 0.5) * j;
    return { ox: Math.cos(a) * rmag, oy: Math.sin(a) * rmag };
}

function wodAiStampOrder(unit, holding, holdHex, ttlMs) {
    if(!unit) return;
    unit.holding = !!holding;
    let now = wodAiOperationTime();
    let ttl = ttlMs;
    if(ttl == null) {
        // Sticky task-force orders: hold lines linger; assaults keep marching longer
        // so the strategy layer does not thrash every pulse.
        if(unit.aiTfRole === 'reserve') ttl = 14000;
        else if(unit.aiTfKind === 'main' || unit.aiTfKind === 'encircle' || unit.aiTfKind === 'strike' || unit.aiTfKind === 'raid') ttl = 11000;
        else if(unit.aiTfRole === 'fix' || holding) ttl = 14000;
        else ttl = holding ? 12000 : 14000;
    }
    unit.aiOrderIssuedAt = now;
    unit.aiOrderUntil = now + ttl;
    unit.aiOrderKind = unit.aiTfKind || '';
    const response=wodAiGetUnitTaskJob(unit);
    unit.aiOrderResponseId=response?.response?response.id:null;
    unit.aiFormationSerial = gameData.aiStrategySerial || 0;
    if(holdHex) unit.aiSectorKey = getHexKey(holdHex);
}

/** Keep current AI orders until they arrive, settle on a hold line, or get stuck. */
function wodAiShouldKeepCurrentOrder(unit) {
    const escape=unit?._aiSupplyExit;
    if(escape?.until>wodAiOperationTime()&&unit._wodOrderedRetreat&&unit.target&&
        (unit.stuckTimer||0)<2&&(unit.blockedTimer||0)<2)return true;
    if(unit&&!wodMpIsHumanOwner(unit.owner)&&(unit.outOfSupplySeconds||0)>=1&&wodAiSupplyExit(unit,wodAiGetUnitTaskJob(unit)))return true;
    if(unit?._aiPursuitOrderAt!=null&&wodAiOperationTime()-unit._aiPursuitOrderAt>=1500)return false;
    if(unit&&wodAiTacticalFallback(unit,wodAiGetUnitTaskJob(unit),false))return false;
    if(unit?._trafficYield){
        const clock=gameData._aiEconomyClock||0,yielding=unit._trafficYield;
        yielding.supportCheckAfter??=clock+3;
        const job=wodAiGetUnitTaskJob(unit);
        // A staging wing must resume its assigned flank after a short
        // sidestep, rather than waiting out an idle blocker's long lease.
        if(job?.frontOperation?.ambush&&clock>=yielding.supportCheckAfter&&
            (!unit.target||clock-(yielding.lastProgressAt??clock)>2)){
            unit._trafficYield=null;unit._aiMoveIntent=null;unit.aiOrderUntil=0;
            gameData._aiMoveQueue?.delete(unit);return false;
        }
        if(clock>=yielding.supportCheckAfter&&wodAiIssueGroupCombatSupport(unit,job,false)){
            // Give traffic time to clear, then find a fresh firing lane.
            // A parked fighter must not reserve this soldier for 25 seconds.
            unit._trafficYield=null;unit._aiMoveIntent=null;unit.aiOrderUntil=0;
            if(job._combatSupportSlots)delete job._combatSupportSlots[unit.uid];
            gameData._aiMoveQueue?.delete(unit);return false;
        }
        return true;
    }
    if(unit?.isGeneral&&wodAiOperationTime()-(unit._aiGeneralAt||0)>3500)return false;
    if(!unit || unit.retreating || unit.moraleBroken) return false;
    // A new job (flank, relief, counterattack) outranks the march already underway.
    if(unit.aiOrderKind && unit.aiTfKind && unit.aiOrderKind !== unit.aiTfKind) return false;
    const job=wodAiGetUnitTaskJob(unit),phase=job?.operation?.phase||job?.phase;
    if(wodAiIssueGroupCombatSupport(unit,job,false))return false;
    if(unit._aiCombatSupportAt!=null&&wodAiOperationTime()-unit._aiCombatSupportAt>=2000)return false;
    if(job?.frontOperation){
        if(unit.aiOrderResponseId!==job.id||unit.aiOrderPhase!==job.frontOperation.phase||unit.aiFrontBound!==job.bound)return false;
        if((job.frontOperation.ambush||job.role==='bait-relief')&&wodAiOperationTime()-(unit.aiOrderIssuedAt||0)>=750)return false;
        const end=unit.orderTarget||unit.target?.finalTarget||unit.target;
        return !!(unit.target&&end&&Math.hypot(unit.x-end.x,unit.y-end.y)>(gameData.hexRadius||20)*1.2&&
            (unit.stuckTimer||0)<3&&(unit.blockedTimer||0)<3&&wodAiOperationTime()-(unit.aiOrderIssuedAt||0)<14000);
    }
    const quiet=unit._aiQuietAdvance;
    if(quiet?.hexes===gameData.hexes&&quiet.job===job?.id){
        const at=wodUnitSupplyHex(unit,getNearestHexToPoint(unit.x,unit.y));
        if(wodAiOperationTime()-quiet.at>=12000||!at||!wodCurrentSupplyComponent(at,unit.owner).city||
            !wodAiQuietFrontSafe(unit.owner,unit)||!wodAiQuietFrontSafe(unit.owner,gameData.hexes[quiet.goal]||unit))return false;
    }
    const support=wodAiFrontSupportFor(unit,job);
    if(support&&(!unit.orderTarget||Math.hypot(unit.orderTarget.x-support.h.x,unit.orderTarget.y-support.h.y)>(gameData.hexRadius||20)*2))return false;
    if(job?.stage&&unit.aiOperationStage!==job.stage)return false;
    if(job?.operationState?.march&&!unit.isGeneral&&!job.operationState.screenIds?.includes(unit.uid)&&unit.aiAssaultBound!==job.operationState.march.id&&job.stage==='attack')return false;
    if(job?.phase==='assault'&&(job.objectiveCity||job.objectiveHex)){
        const members=wodAiAssaultMembers(unit.owner,job,gameData.aiTaskForces?.[unit.owner]);
        const balance=wodAiAssaultBalance(unit.owner,members,job.objectiveCity||job.objectiveHex);
        if(!balance.maintain)return false;
    }
    if(unit.aiCaptureHexKey&&wodIsFriendlyOwner(gameData.hexes[unit.aiCaptureHexKey]?.owner,unit.owner))return false;
    if((unit.aiOrderResponseId||null)!==(job?.response?job.id:null))return false;
    if(phase && unit.aiOrderPhase!==phase)return false;
    if(!unit.target && !unit.orderTarget) return false;
    let hr = gameData.hexRadius || 20;
    let ft = unit.orderTarget
        || (unit.target && unit.target.finalTarget ? unit.target.finalTarget : unit.target);
    if(!ft || ft.x == null) return false;
    let dx = ft.x - unit.x;
    let dy = ft.y - unit.y;
    let distSq = dx * dx + dy * dy;
    let holdDoneR2 = Math.pow(hr * 2.4, 2);
    let marchFarR2 = Math.pow(hr * 6, 2);
    let arriveR2 = Math.pow(hr * 2.8, 2);
    if(unit.holding) {
        // No target means nothing will ever move this unit or grow its stuck
        // timers (they only tick while moving) — release it for retasking.
        if(!unit.target) return false;
        if(distSq > holdDoneR2) {
            if((unit.stuckTimer || 0) < 0.38 && (unit.blockedTimer || 0) < 0.28) return true;
            return false;
        }
        // Fixing / reserve task forces are meant to stay on the line — do not
        // dissolve just because a couple of friends showed up nearby.
        if(unit.aiTfRole === 'fix' || unit.aiTfRole === 'reserve'
            || unit.aiTfKind === 'hold' || unit.aiTfKind === 'defend') {
            if(!unit.aiOrderUntil || wodAiOperationTime() >= unit.aiOrderUntil) return false;
            return true;
        }
        // Assault holds: reassess once enough friendlies are here.
        let support = countNearbyUnits(unit.owner, unit.x, unit.y, 195);
        let enemies = countNearbyUnits(unit.owner, unit.x, unit.y, 215, true);
        let localRatio = (support + 1) / (enemies + 1);
        if(support >= 2 && localRatio >= 1.1) return false;
        if(enemies <= 0 && support >= 2) return false;
        if(!unit.aiOrderUntil || wodAiOperationTime() >= unit.aiOrderUntil - 2200) return false;
        return true;
    }
    if(!unit.target) return false;
    // Stuck/blocked release runs BEFORE any keep-marching early-returns — rear
    // units of a massed column sit >6 tiles out, permanently friend-blocked, and
    // the old order (far-keep first) renewed their jammed orders forever. BUT a
    // freshly issued order gets a short grace period: releasing on the first
    // stutter made the strategy layer rebuild the corridor every pulse, and the
    // unit oscillated around its start instead of marching.
    let nowKo = wodAiOperationTime();
    let orderAge = unit.aiOrderIssuedAt != null ? (nowKo - unit.aiOrderIssuedAt) : Infinity;
    if(orderAge > 3200) {
        let chSt = getNearestHexToPoint(unit.x, unit.y);
        let nearMtn = chSt && !wodIsNavalUnit(unit)
            && getNeighborHexes(chSt).some(n => n && n.type === 'mountain');
        let stuckLim = nearMtn ? 0.22 : 0.42;
        let blkLim = nearMtn ? 0.18 : 0.32;
        if((unit.stuckTimer || 0) >= stuckLim || (unit.blockedTimer || 0) >= blkLim) return false;
        if((unit._wodAiFriendBlockT || 0) > 2.2) return false;
    }
    if(unit.aiOrderUntil && nowKo < unit.aiOrderUntil) {
        if(distSq > arriveR2) return true;
    }
    // Reached the attack waypoint — allow a fresh sector assignment as the front shifts.
    if(distSq <= arriveR2) return false;
    if(distSq > marchFarR2) return true;
    return distSq > arriveR2 * 1.8;
}

/** AI move orders: snap to walkable land/bridge and run full pathfinding (never raw water pixels). */
function wodAiMoveUnitToward(unit, x, y, holdingOpt,fromQueue=false) {
    if(!unit || unit.hp <= 0) return false;
    if(unit._medicalRecovering)return false;
    if(unit._opsUntil>wodAiOperationTime()&&!gameData._opsIssuing&&!fromQueue)return false;
    if(wodAiKeepMoveIntent(unit,x,y,holdingOpt))return true;
    if(gameData._wodPfFrameActive&&!fromQueue&&!wodMpIsHumanOwner(unit.owner)) {
        const queue=gameData._aiMoveQueue||(gameData._aiMoveQueue=new Map());
        const job=wodAiGetUnitTaskJob(unit),now=wodAiOperationTime();
        const priority=unit.retreating||unit._aiRegroupUntil>now?4:job?.response?3:['hold','reserve','defend'].includes(job?.kind)?2:1;
        const marineGround=unit.type==='marine'&&unit._navalLanded&&unit._aiMarineGroundUntil>now?
            {goal:unit._navalAssaultGoal,epoch:unit._wodPlayerOrderEpoch||0}:null;
        queue.set(unit,{unit,owner:unit.owner,x,y,holding:holdingOpt,hexes:gameData.hexes,priority,at:now,marineGround,ops:!!gameData._opsIssuing});
        return true;
    }
    if(wodIsNavalUnit(unit)) {
        // Always pathfind on open water — never straight-line across land.
        let reach = findReachableOrderHex(unit, x, y);
        if(!reach || !reach.hex || !wodIsOpenWaterHex(reach.hex)) return false;
        let ok = assignUnitMoveAlongWaypoints(unit, [{ x: reach.exactX, y: reach.exactY }]);
        unit.holding = ok ? !!holdingOpt : false;
        if(ok)wodAiRememberMoveIntent(unit,reach.exactX,reach.exactY,holdingOpt);
        return ok;
    }
    const sh=getNearestHexToPoint(unit.x,unit.y),gh=getNearestHexToPoint(x,y);
    if(unit.type!=='marine'&&sh&&!isWaterHex(sh)&&gh&&!isWaterHex(gh)&&wodMarchBlockedWithoutBridge(unit,sh,gh)) {
        unit._needsTransport=true;
        const ferry=gameData.entities.find(t=>t.owner===unit.owner&&t.type==='transport'&&t.hp>0&&!t._medicalRecovering&&!t.cargo&&!t.pickupUid);
        const naval=gameData.aiNavalPlans?.[unit.owner],friendly=ferry&&wodAiSafeFriendlyTransfer(unit,ferry,{x,y});
        if(ferry&&(naval?.canEmbark||friendly)&&wodOrderBoardTransport(unit,ferry)){ferry._aiFleetId=friendly?null:naval.id;ferry.ferryGoal={x,y};ferry._aiFerryMission=true;return true;}
        return false;
    }
    // A dry route exists, so an earlier "needs a ferry" verdict is stale. It used to stick for the
    // rest of the match and left healthy troops waiting for boats on a connected landmass.
    if(unit._needsTransport&&unit.type!=='marine'&&sh&&!isWaterHex(sh)&&gh&&!isWaterHex(gh)&&!unit._navalEvacuating&&!unit._navalAssaultGoal&&!unit.boardTransportUid&&!unit._medicalEvacuating)unit._needsTransport=false;
    let tx = x, ty = y;
    // Sector jitter / formation slots near rivers must not become intoWater orders
    // when a bridge can carry the march — snap land armies onto land or deck.
    if(isLandArmyUnit(unit) || wodUnitPrefersLandOnlyPath(unit)) {
        let nh = getNearestHexToPoint(x, y);
        if(nh && (wodIsOpenWaterHex(nh) || isBridgeHex(nh))) {
            let snap = wodSnapLandArmyOrderPoint(unit, x, y);
            if(snap) {
                tx = snap.x;
                ty = snap.y;
            }
        }
    }
    let reach = findReachableOrderHex(unit, tx, ty);
    if(reach && reach.intoWater && wodUnitPrefersLandOnlyPath(unit) &&
        !wodOrderIntoWater(unit, reach.hex)) {
        let snap = wodSnapLandArmyOrderPoint(unit, tx, ty);
        if(snap && !(snap.hex && wodIsOpenWaterHex(snap.hex)))
            reach = { hex: snap.hex || reach.hex, exactX: snap.x, exactY: snap.y, intoWater: false };
        else {
            let resolved = wodResolveLandMarchHex(unit, tx, ty);
            if(resolved && !resolved.intoWater)
                reach = { hex: resolved.hex, exactX: resolved.exactX, exactY: resolved.exactY, intoWater: false };
        }
    }
    if(!reach && wodUnitPrefersLandOnlyPath(unit)) {
        let resolved = wodResolveLandMarchHex(unit, tx, ty);
        if(resolved && !resolved.intoWater)
            reach = { hex: resolved.hex, exactX: resolved.exactX, exactY: resolved.exactY, intoWater: false };
    }
    if(!reach) return false;
    if(holdingOpt&&unit.holding&&!unit.target&&!unit._trafficYield&&Math.hypot(unit.x-reach.exactX,unit.y-reach.exactY)<(gameData.hexRadius||20)*.7&&
        sh&&wodIsFriendlyOwner(sh.owner,unit.owner)&&!isWaterHex(sh)){
        // Reissuing an already reached defensive slot caused small
        // sidesteps and collision yielding even on a quiet line.
        wodAiRememberMoveIntent(unit,reach.exactX,reach.exactY,holdingOpt);
        return true;
    }
    const needsDryRoute=isLandArmyUnit(unit)&&unit.type!=='marine'&&!isWaterHex(sh)&&!isWaterHex(reach.hex)&&wodAiNeedsLandDetour(unit,reach.hex);
    const route=needsDryRoute&&wodAiLandRoute(unit,reach.hex,false);
    // A proven shared land corridor must survive the order builder's
    // frame budget. Otherwise its fallback can endlessly hop toward the
    // opposite bank instead of taking the known detour.
    if(needsDryRoute&&!route)return false;
    const points=[{x:reach.exactX,y:reach.exactY}];
    let ok = assignUnitMoveAlongWaypoints(unit, points,route?.length>1?{preparedPath:route}:undefined);
    // Flag holding only on a successful move — a failed assign with holding=true
    // left an orderless unit that the keep-order logic could park forever.
    unit.holding = ok ? !!holdingOpt : false;
    if(ok)wodAiRememberMoveIntent(unit,reach.exactX,reach.exactY,holdingOpt);
    return ok;
}

function wodAiMoveUnitTowardHex(unit, hex, holdingOpt, jitterScale) {
    if(!hex) return false;
    let slot = wodAiUnitSlotOffset(unit, hex, jitterScale);
    return wodAiMoveUnitToward(unit, hex.x + slot.ox, hex.y + slot.oy, holdingOpt);
}

// Routes from the planners yield to units held by the field command.
function wodAiAssignWaypoints(unit, ...rest) {
    if(unit&&unit._opsUntil>wodAiOperationTime()&&!gameData._opsIssuing)return false;
    return assignUnitMoveAlongWaypoints(unit, ...rest);
}

// Coordinate fire without changing a march, flank, retreat or ferry order.
// Claims cover one strategy pulse and spread excess damage onto other targets.
function wodAiSelectCombatTarget(unit,control) {
    if(!unit||unit.owner<=0||unit.hp<=0||wodMpIsHumanOwner(unit.owner))return false;
    const clear=()=>{if(unit._aiFireTarget&&unit.preferredTargetUid===unit._aiFireTarget){unit.preferredTargetUid=null;unit._combatProxTick=-1;}unit._aiFireTarget=null;};
    if(unit.moraleBroken||unit.retreating||unit.boardTransportUid||!(unit.damage>0)){clear();return false;}
    const state=control[unit.owner]||=( {known:wodAiKnownEntities(unit.owner).filter(e=>e.hp>0&&e.type!=='convoy'&&wodIsHostileOwner(e.owner,unit.owner)),damage:new Map(),assignments:new Map()} );
    const prior=state.assignments.get(unit.uid);
    if(prior)state.damage.set(prior.uid,Math.max(0,(state.damage.get(prior.uid)||0)-prior.dps));
    state.assignments.delete(unit.uid);
    const range=(unit.range||0)*wodGeneralStatMultiplier(unit);
    let best=null,bestScore=-Infinity,bestDps=0;
    const targets=state.known.filter(e=>e.hp>0&&!e.boardTransportUid&&wodIsHostileOwner(e.owner,unit.owner)&&wodOwnerCanSee(unit.owner,e)&&Math.hypot(unit.x-e.x,unit.y-e.y)<=range)
        .map(enemy=>({enemy,dps:wodAiDpsAgainst(unit,enemy,unit.owner)})).filter(t=>t.dps>0);
    const uncovered=targets.some(({enemy})=>(state.damage.get(enemy.uid)||0)*2<enemy.hp);
    for(const {enemy,dps} of targets){
        const threat=(enemy.damage||0)/Math.max(.1,(enemy.attackCooldown||2)*WOD_ATTACK_INTERVAL_MULT);
        const value=1+threat+(enemy.isGeneral?threat*.8:0)+(enemy.type==='supply'?8:enemy.type==='transport'&&enemy.cargo?5:0);
        const committed=(state.damage.get(enemy.uid)||0)*2;
        if(uncovered&&committed>=enemy.hp)continue;
        const saturation=committed>=enemy.hp? .04:1;
        const continuity=unit._aiFireTarget===enemy.uid?1.12:1;
        const score=value*dps/Math.max(2,enemy.hp+committed)*saturation*continuity;
        if(score>bestScore){best=enemy;bestScore=score;bestDps=dps;}
    }
    if(!best){clear();return false;}
    state.damage.set(best.uid,(state.damage.get(best.uid)||0)+bestDps);state.assignments.set(unit.uid,{uid:best.uid,dps:bestDps});
    const changed=unit._aiFireTarget!==best.uid;
    unit._aiFireTarget=unit.preferredTargetUid=best.uid;unit._combatProxTick=-1;
    if(changed)wodAiRecord(unit.owner,'fire-control',{unit:unit.uid,enemy:best.uid});
    return true;
}

function wodAiMoveIntentKey(unit) {
    const job=wodAiGetUnitTaskJob(unit);
    const op=job?.frontOperation||job?.operationState,goal=op?.strategicGoal||op?.advanceGoal||op?.goal||job?.objectiveCity||job?.objectiveHex;
    return [unit._aiMission?.id||unit.aiTfJobId||unit.aiTfKind||'direct',op?.ambush?.stage||'',goal?.id||goal&&getHexKey(goal)||'',unit._aiWithdrawal?.cutId||''].join(':');
}

function wodAiKeepMoveIntent(unit,x,y,holding) {
    if(wodMpIsHumanOwner(unit.owner)||unit.retreating||unit._aiWithdrawal||gameData._aiSupplyWithdrawals?.has(unit)||unit._aiRegroupUntil>wodAiOperationTime()||unit._trafficYield)return false;
    const defense=gameData._aiDefenseByOwner?.[unit.owner],response=defense?.jobs.find(j=>j.id===defense.unitJob[unit.uid]);if(wodAiFrontCritical(response,unit))return false;
    const old=unit._aiMoveIntent,hr=gameData.hexRadius||20;if(!old||old.hexes!==gameData.hexes||old.key!==wodAiMoveIntentKey(unit)||old.holding!==!!holding)return false;
    const change=Math.hypot(x-old.x,y-old.y),now=wodAiOperationTime();
    const destination=unit.orderTarget||unit.target?.finalTarget||unit.target;
    if(!holding&&unit.target&&destination&&now-(old.at||0)<15000&&(unit.stuckTimer||0)<1&&(unit.blockedTimer||0)<1){
        const ax=destination.x-unit.x,ay=destination.y-unit.y,bx=x-unit.x,by=y-unit.y,al=Math.hypot(ax,ay),bl=Math.hypot(bx,by);
        const h=getNearestHexToPoint(destination.x,destination.y),currentJob=wodAiGetUnitTaskJob(unit);
        const operation=currentJob?.frontOperation,objective=operation?.strategicGoal||operation?.advanceGoal;
        if(operation?.phase==='advance'&&!currentJob.route&&!operation.ambush&&!(currentJob._peerSupport?.until>now)&&objective&&
            al>hr*2&&bl>hr*2&&ax*bx+ay*by<0&&change<hr*20&&
            Math.hypot(destination.x-objective.x,destination.y-objective.y)<Math.hypot(unit.x-objective.x,unit.y-objective.y)-hr&&
            Math.hypot(x-objective.x,y-objective.y)>Math.hypot(unit.x-objective.x,unit.y-objective.y)+hr&&
            h&&canUnitEnterHex(unit,h)&&!isWaterHex(h)&&wodAiQuietFrontSafe(unit.owner,{x,y})&&wodCurrentSupplyComponent(getNearestHexToPoint(unit.x,unit.y),unit.owner).city)return true;
        if(al>hr*2&&bl>hr*2&&change<hr*6&&ax*bx+ay*by>al*bl*.6&&!currentJob?.route&&!currentJob?.frontOperation?.ambush&&
            h&&canUnitEnterHex(unit,h)&&(wodIsHostileOwner(h.owner,unit.owner)||Math.hypot(unit.x-old.x,unit.y-old.y)>hr*3))return true;
    }
    const enemy=unit._combatEnemy,job=wodAiGetUnitTaskJob(unit),here=getNearestHexToPoint(unit.x,unit.y),next=getNearestHexToPoint(x,y);
    if(!holding&&!job?.route&&!job?.frontOperation?.ambush&&job?.role!=='bait-relief'&&job?.kind!=='relief'&&unit.combatTargetUid===enemy?.uid&&enemy?.hp>0&&!enemy.retreating&&!enemy.moraleBroken&&
        enemy.hp>enemy.maxHp*.5&&!(unit._aiPursuitOrderAt!=null&&wodAiOperationTime()-unit._aiPursuitOrderAt<3000)&&
        Math.hypot(enemy.x-unit.x,enemy.y-unit.y)<(unit.range||50)*.98&&Math.hypot(x-unit.x,y-unit.y)<hr*2.5&&
        !(next?.cityId&&wodIsHostileOwner(next.owner,unit.owner))&&here&&next&&
        (wodIsNavalUnit(unit)||unit.type==='marine'||!isWaterHex(here)&&wodCurrentSupplyComponent(here,unit.owner).city)&&
        getTerrainDefenseModifier(unit,next)>=getTerrainDefenseModifier(unit,here)*.9){
        const coverage=point=>gameData.entities.filter(u=>u!==unit&&u.owner===unit.owner&&u.hp>0&&Math.hypot(u.x-point.x,u.y-point.y)<=wodFortCombatAuraRadiusPx()).length;
        if(!unit.isGeneral||coverage({x,y})<coverage(unit)+2)return true;
    }
    if(holding&&change<hr*2){
        if(here&&wodIsFriendlyOwner(here.owner,unit.owner)&&!isWaterHex(here)&&wodCurrentSupplyComponent(here,unit.owner).city&&
            Math.hypot(unit.x-old.x,unit.y-old.y)<hr*2.5&&(!unit.target||(unit.stuckTimer||0)<1&&(unit.blockedTimer||0)<1))return true;
    }
    return !!(unit.target&&change<hr*.5&&(unit.stuckTimer||0)<1&&(unit.blockedTimer||0)<1&&
        Math.hypot((unit.orderTarget||unit.target).x-old.x,(unit.orderTarget||unit.target).y-old.y)<hr*2);
}

function wodAiRememberMoveIntent(unit,x,y,holding) {
    unit._aiMoveIntent={hexes:gameData.hexes,key:wodAiMoveIntentKey(unit),x,y,holding:!!holding,at:wodAiOperationTime()};
}

function wodAiFormationSlot(unit,job,anchor,goal,members) {
    // Town responses and prepared traps retain their compact protected layouts.
    if(job.city||job.fort||job.response&&!job.frontOperation||job.role?.startsWith('ambush-'))return wodAiCompactFormationSlot(unit,job,anchor,goal,members);
    const hr=gameData.hexRadius||20;
    const dx=goal.x-anchor.x,dy=goal.y-anchor.y,len=Math.hypot(dx,dy)||1;
    const ids=members.map(u=>u.uid);
    const columns=Math.max(1,job.role?.startsWith('ambush-')?Math.min(5,ids.length):Math.min(14,ids.length)),spacing=Math.max(hr*2,...members.map(u=>(u.radius||hr)*2+6));
    const offset=wodAiFormationOffset(unit,members,anchor,dx/len,dy/len,columns,spacing,'stage');
    const lane=offset.lane,row=offset.row;
    const desired={x:anchor.x-dy/len*lane-dx/len*row,y:anchor.y+dx/len*lane-dy/len*row};
    const used=job._formationSlots||=( {} ),reach=wodAiOperationReach(unit),threats=wodAiThreats(unit.owner,false);
    const reserved=wodAiDeploymentReservations(unit,anchor,hr*20),layout=getHexKey(anchor)+':'+columns+':'+Math.round(dx/len*4)+','+Math.round(dy/len*4);
    const saved=gameData.hexes[used[unit.uid]],slotState=job._formationSlotState||=( {} ),prior=slotState[unit.uid],now=wodAiOperationTime();
    if(saved&&prior?.layout===layout&&!reserved.has(getHexKey(saved))&&wodIsFriendlyOwner(saved.owner,unit.owner)&&!isWaterHex(saved)&&canUnitEnterHex(unit,saved)&&reach.has(getHexKey(saved))&&
        wodCurrentSupplyComponent(saved,unit.owner).city&&!Object.entries(used).some(([id,k])=>id!==unit.uid&&ids.includes(id)&&k===getHexKey(saved))&&
        (Math.hypot(unit.x-saved.x,unit.y-saved.y)<hr*.8||!isWorldPositionBlockedByUnits(unit,saved.x,saved.y)||now-prior.at<8000)){wodAiRememberDeployment(unit,saved,'formation');return saved;}
    const radius=Math.min(10,Math.max(4,Math.ceil(columns*spacing/(hr*5))+2));
    const sites=getHexesInRadius(anchor.q,anchor.r,radius).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&!reserved.has(getHexKey(h))&&
        !isWaterHex(h)&&wodIsFriendlyOwner(h.owner,unit.owner)&&canUnitEnterHex(unit,h)&&reach.has(getHexKey(h))&&
        wodCurrentSupplyComponent(h,unit.owner).city&&!isWorldPositionBlockedByUnits(unit,h.x,h.y));
    const score=h=>Math.hypot(h.x-desired.x,h.y-desired.y)+
        Object.entries(used).filter(([id,k])=>id!==unit.uid&&ids.includes(id)&&k===getHexKey(h)).length*hr*100+
        threats.reduce((n,e)=>n+Math.max(0,(e.range||50)+hr-Math.hypot(e.x-h.x,e.y-h.y))*5,0);
    const old=sites.find(h=>getHexKey(h)===used[unit.uid]);
    if(old&&prior?.layout===layout&&Math.hypot(old.x-desired.x,old.y-desired.y)<hr*2.5&&
        !Object.entries(used).some(([id,k])=>id!==unit.uid&&ids.includes(id)&&k===getHexKey(old))&&
        !threats.some(e=>Math.hypot(e.x-old.x,e.y-old.y)<(e.range||50)+hr)){wodAiRememberDeployment(unit,old,'formation');return old;}
    sites.sort(wodByScore(score));const target=sites[0]||getNearestHexToPoint(unit.x,unit.y);used[unit.uid]=getHexKey(target);slotState[unit.uid]={layout,anchor:getHexKey(anchor),at:now};wodAiRememberDeployment(unit,target,'formation');return target;
}

// Reservations belong to the battlefield, not just to one squad's job. Two
// groups approaching the same contact must not reserve the same firing cell.
function wodAiDeploymentReservations(unit,point,radius,combat=false) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,used=new Set();
    // A firing line needs every legal lane. Reserve the exact future firing
    // cell; native occupancy checks enforce physical clearance on arrival.
    // Reserving its neighboring cells as well can block the entire thin arc.
    const reserve=(h,peer)=>{used.add(getHexKey(h));if(combat)return;const clearance=(unit.radius||12)+(peer.radius||12)+6;for(const n of getNeighborHexes(h))if(Math.hypot(n.x-h.x,n.y-h.y)<clearance)used.add(getHexKey(n));};
    for(const peer of gameData.entities){
        if(peer===unit||peer.owner!==unit.owner||peer.hp<=0||peer.boardTransportUid||wodIsNavalUnit(peer))continue;
        const slot=peer._aiDeploymentSlot,end=peer.orderTarget||peer.target?.finalTarget||peer.target;
        if(slot?.hexes===gameData.hexes&&slot.until>now){
            const h=gameData.hexes[slot.key];
            if(h&&Math.hypot(h.x-point.x,h.y-point.y)<radius&&
                (now-slot.at<750||Math.hypot(peer.x-h.x,peer.y-h.y)<hr*1.2||end&&Math.hypot(end.x-h.x,end.y-h.y)<hr*1.5))reserve(h,peer);
        }
        if(peer.target&&end&&Math.hypot(end.x-point.x,end.y-point.y)<radius){const h=getNearestHexToPoint(end.x,end.y);if(h)reserve(h,peer);}
    }
    return used;
}

function wodAiRememberDeployment(unit,hex,kind,ms=8000) {
    const at=wodAiOperationTime();unit._aiDeploymentSlot={hexes:gameData.hexes,key:getHexKey(hex),kind,at,until:at+ms};
}

// Assign whole rows together. Ranking an entire army laterally and then taking
// rank % width sends its far-right rear row back through the far-left front row.
function wodAiFormationOffset(unit,members,anchor,ax,ay,width,spacing,kind) {
    let cache=gameData._aiFormationLayouts;
    if(cache?.hexes!==gameData.hexes)cache=gameData._aiFormationLayouts={hexes:gameData.hexes,layouts:new Map()};
    const now=wodAiOperationTime(),ids=members.map(u=>u.uid).sort(),key=[unit.owner,kind,getHexKey(anchor),Math.round(ax*8),Math.round(ay*8),width,spacing,ids.join(',')].join(':');
    let layout=cache.layouts.get(key);
    if(!layout||now-layout.at>30000){
        const points=[];
        for(let start=0;start<members.length;start+=width){
            const n=Math.min(width,members.length-start),row=Math.floor(start/width)*spacing;
            for(let col=0;col<n;col++){const lane=(col-(n-1)/2)*spacing;points.push({lane,row,x:anchor.x-ay*lane-ax*row,y:anchor.y+ax*lane-ay*row});}
        }
        const pairs=[];for(const u of members)for(let i=0;i<points.length;i++)pairs.push({u,i,cost:(u.x-points[i].x)**2+(u.y-points[i].y)**2});
        pairs.sort((a,b)=>a.cost-b.cost||a.u.uid.localeCompare(b.u.uid)||a.i-b.i);
        const taken=new Set(),slots=new Map();
        for(const p of pairs)if(!taken.has(p.i)&&!slots.has(p.u.uid)){taken.add(p.i);slots.set(p.u.uid,points[p.i]);}
        layout={at:now,slots};cache.layouts.set(key,layout);
        while(cache.layouts.size>24)cache.layouts.delete(cache.layouts.keys().next().value);
    }
    return layout.slots.get(unit.uid)||{lane:0,row:0};
}

function wodAiCompactFormationSlot(unit,job,anchor,goal,members) {
    const hr=gameData.hexRadius||20,ids=members.map(u=>u.uid).sort(),rank=Math.max(0,ids.indexOf(unit.uid));
    const dx=goal.x-anchor.x,dy=goal.y-anchor.y,len=Math.hypot(dx,dy)||1;
    const columns=job.role?.startsWith('ambush-')?Math.min(5,ids.length):5;
    const lane=(rank%5-(columns-1)/2)*hr*1.5,row=Math.floor(rank/5)*hr*1.6;
    const desired={x:anchor.x-dy/len*lane-dx/len*row,y:anchor.y+dx/len*lane-dy/len*row};
    const used=job._formationSlots||=( {} ),reach=wodAiOperationReach(unit),threats=wodAiThreats(unit.owner,false);
    const saved=gameData.hexes[used[unit.uid]],slotState=job._formationSlotState||=( {} ),prior=slotState[unit.uid],now=wodAiOperationTime();
    if(saved&&prior?.anchor===getHexKey(anchor)&&wodIsFriendlyOwner(saved.owner,unit.owner)&&!isWaterHex(saved)&&canUnitEnterHex(unit,saved)&&reach.has(getHexKey(saved))&&
        wodCurrentSupplyComponent(saved,unit.owner).city&&!Object.entries(used).some(([id,k])=>id!==unit.uid&&ids.includes(id)&&k===getHexKey(saved))&&
        (Math.hypot(unit.x-saved.x,unit.y-saved.y)<hr*.8||!isWorldPositionBlockedByUnits(unit,saved.x,saved.y)||now-prior.at<8000))return saved;
    const sites=getHexesInRadius(anchor.q,anchor.r,4).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&
        !isWaterHex(h)&&wodIsFriendlyOwner(h.owner,unit.owner)&&canUnitEnterHex(unit,h)&&reach.has(getHexKey(h))&&
        wodCurrentSupplyComponent(h,unit.owner).city&&!isWorldPositionBlockedByUnits(unit,h.x,h.y));
    const score=h=>Math.hypot(h.x-desired.x,h.y-desired.y)+
        Object.entries(used).filter(([id,k])=>id!==unit.uid&&ids.includes(id)&&k===getHexKey(h)).length*hr*100+
        threats.reduce((n,e)=>n+Math.max(0,(e.range||50)+hr-Math.hypot(e.x-h.x,e.y-h.y))*5,0);
    const old=sites.find(h=>getHexKey(h)===used[unit.uid]);
    if(old&&Math.hypot(old.x-desired.x,old.y-desired.y)<hr*2.5&&
        !Object.entries(used).some(([id,k])=>id!==unit.uid&&ids.includes(id)&&k===getHexKey(old))&&
        !threats.some(e=>Math.hypot(e.x-old.x,e.y-old.y)<(e.range||50)+hr))return old;
    sites.sort(wodByScore(score));const target=sites[0]||anchor;used[unit.uid]=getHexKey(target);slotState[unit.uid]={anchor:getHexKey(anchor),at:now};return target;
}

function wodDrainAiMoveQueue() {
    const queue=gameData._aiMoveQueue;if(!queue?.size||gameData._wodAiRouteFrameDone)return;
    gameData._wodAiRouteFrameDone=true;
    // Coalesce orders per unit and apply one complete route per frame. Units
    // retain their current route while waiting instead of stopping or losing it.
    const ordered=[...queue.entries()].sort((a,b)=>(b[1].priority||0)-(a[1].priority||0)||(a[1].at||0)-(b[1].at||0));
    // Up to three routes a frame (one for an easy computer, five for a hard one, per faction).
    let applied=0,cap=0;const perOwner={},limit=o=>wodAiDifficulty(o).movesPerFrame||3;
    for(const [,order] of ordered)cap=Math.max(cap,limit(order.owner));
    for(const [unit,order] of ordered) {
        if((perOwner[order.owner]||0)>=limit(order.owner))continue;
        queue.delete(unit);
        const now=wodAiOperationTime(),ground=order.marineGround;
        // The beachhead planner renews naval ownership after the marine
        // watchdog queues a land route. That must not discard its own
        // route. A new raid, evacuation or applied route still wins.
        const marineGround=ground&&unit._navalLanded&&unit._aiMarineGroundUntil>now&&
            unit._navalAssaultGoal===ground.goal&&!unit._aiMarineRaid&&!unit._navalEvacuating&&!unit._aiMarineTransit&&
            (!unit.target||(unit._wodPlayerOrderEpoch||0)===ground.epoch);
        if(order.hexes!==gameData.hexes||unit.owner!==order.owner||unit.hp<=0||wodMpIsHumanOwner(unit.owner)||
            !gameData.entities.includes(unit)||unit.boardTransportUid||unit._trafficYield||unit._navalAssaultUntil>now&&!marineGround||unit._navalEscortUntil>now)continue;
        // A move another planner queued before the field command took the unit over is stale.
        if(unit._opsUntil>now&&!order.ops&&wodOpsTune(unit.owner).queueLease!==0)continue;
        // One route per frame made a commander with thirty units take a second and a half to
        // move them all. Apply up to three while this frame's pathfinding budget lasts.
        wodAiMoveUnitToward(unit,order.x,order.y,order.holding,true);
        perOwner[order.owner]=(perOwner[order.owner]||0)+1;
        if(++applied>=cap||!wodCanSpendPf())break;
    }
}
