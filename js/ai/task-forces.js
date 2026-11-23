// AI: the land task forces. Each pulse they plan for the land units the field command does not hold (an army
// with no land road to the enemy, troops the navy put ashore that are not a landing party, reinforcements a
// mission script is marching somewhere): jobs, sectors, objectives, assaults, scouts and the general.
'use strict';

function wodAiAssaultMembers(owner,job,plan) {
    if(!plan)return [];
    const goal=job.objectiveCity||job.objectiveHex||job.attackHex,hr=gameData.hexRadius||20;
    const compatible=new Set(plan.jobs.filter(j=>{
        if(j===job)return true;
        if(!['main','armor','raid'].includes(j.kind))return false;
        if(job.frontOwner&&j.frontOwner&&job.frontOwner!==j.frontOwner)return false;
        if(job.objectiveCity)return j.objectiveCity?.id===job.objectiveCity.id;
        const other=j.objectiveHex||j.attackHex;
        return !j.objectiveCity&&goal&&other&&Math.hypot(goal.x-other.x,goal.y-other.y)<hr*5;
    }).map(j=>j.id));
    return gameData.entities.filter(u=>u.owner===owner&&u.hp>u.maxHp*.34&&!u.retreating&&!u.moraleBroken&&!u.boardTransportUid&&!u._navalLanded&&
        !u._medicalRecovering&&compatible.has(plan.unitJob[u.uid])&&!gameData._aiDefenseByOwner?.[owner]?.unitJob[u.uid]);
}

function wodAiAssaultBalance(owner,members,goal) {
    const hr=gameData.hexRadius||20,profile=wodAiCommander(owner),risk=wodAiObjectiveRisk(owner,goal);
    members=members.filter(u=>u.hp>u.maxHp*.34&&!u.boardTransportUid&&!u.retreating&&!u.moraleBroken&&!u._medicalRecovering);
    const threats=wodAiThreats(owner).filter(u=>Math.hypot(u.x-goal.x,u.y-goal.y)<hr*8+(u.uncertainty||0)*.35||members.some(m=>Math.hypot(m.x-u.x,m.y-u.y)<hr*7));
    const enemy=threats.reduce((n,u)=>n+wodAiUnitCombatPower(u),0),own=members.reduce((n,u)=>n+wodAiUnitCombatPower(u),0);
    const forecast=wodAiForecast(owner,members,threats);
    let contactSafe=true,contactRatio=Infinity;const checked=new Set();
    for(const e of threats){
        if(checked.has(e.uid)||e._intelMemory||!members.some(m=>Math.hypot(m.x-e.x,m.y-e.y)<hr*6))continue;
        const nearby=members.filter(m=>Math.hypot(m.x-e.x,m.y-e.y)<hr*9&&
            wodAiArrivalSeconds(m,e,m.range||50,6)<=6),cluster=threats.filter(t=>Math.hypot(t.x-e.x,t.y-e.y)<hr*7);
        cluster.forEach(t=>checked.add(t.uid));const local=wodAiForecast(owner,nearby,cluster);contactRatio=Math.min(contactRatio,local.ratio);
        if(local.ratio<Math.max(.78,risk.launch-.1))contactSafe=false;
    }
    const supplied=members.filter(u=>!u.outOfSupplySeconds||u.outOfSupplySeconds<4||u.type==='marine').length;
    const supplySafe=!members.length||supplied>=Math.ceil(members.length*.6);
    const sufficientNumbers=(members.length>=3||members.length>0&&members.every(u=>u.type==='marine'||wodIsNavalUnit(u)||u._navalLanded))&&
        (!threats.length||members.length>=Math.min(3,Math.max(2,Math.ceil(threats.length*.65))));
    const required=risk.launch,maintain=risk.continue;
    const strategicReady=supplySafe&&sufficientNumbers&&own>=.4&&forecast.ratio>=required;
    return {own,enemy,ratio:required,strategicReady,strategicMaintain:own>=.4&&supplySafe&&forecast.ratio>=maintain,ready:strategicReady&&contactSafe,
        maintain:own>=.4&&supplySafe&&contactSafe&&forecast.ratio>=maintain,contactSafe,
        contactRatio:Number.isFinite(contactRatio)?contactRatio:null,forecast,threats:threats.length};
}

function wodAiTerritoryObjective(owner,members,sectors,taken={}) {
    if(!members.length)return null;
    const front=wodAiFrontOwner(members[0]);if(front)sectors=sectors.filter(s=>s.attackHex?.owner===front);
    const cutoff=wodAiCutObjective(owner,members);if(cutoff?.holdHex)return cutoff;
    const lead=members.find(u=>!wodCanClimb(u))||members[0],reach=wodAiOperationReach(lead),hr=gameData.hexRadius||20;
    const explored=wodFogActive()?wodFogFactionIntel(owner).explored:null;
    const bearing=wodAiDiscoveryBearing(owner);
    const advance=h=>((h.x-bearing.x)*bearing.dx+(h.y-bearing.y)*bearing.dy)/hr;
    const choices=sectors.filter(t=>t.holdHex&&t.attackHex&&reach.has(getHexKey(t.attackHex))&&wodIsHostileOwner(t.attackHex.owner,owner)&&(!explored||explored.has(getHexKey(t.attackHex))));
    choices.sort((a,b)=>wodAiAttackSectorScore(owner,a,members)-wodAiAttackSectorScore(owner,b,members)+
        (taken[getHexKey(a.attackHex)]||0)*5-(taken[getHexKey(b.attackHex)]||0)*5-
        (advance(a.attackHex)-advance(b.attackHex))*.65+
        (wodAiDist2(lead.x,lead.y,a.attackHex.x,a.attackHex.y)-wodAiDist2(lead.x,lead.y,b.attackHex.x,b.attackHex.y))/(hr*hr*250));
    const sector=choices[0];if(!sector)return null;
    return {objectiveHex:sector.attackHex,attackHex:sector.attackHex,holdHex:sector.holdHex,phase:'assemble',phaseAt:wodAiOperationTime(),operationAt:wodAiOperationTime()};
}

function findAiFrontlineAssignment(unit) {
    let best = null;
    let bestScore = Infinity;
    let focus = gameData.aiFrontFocus && gameData.aiFrontFocus[unit.owner];
    let playerPower = wodAiFoePower(unit.owner);
    let myPower = gameData._aiStratPowByOwner && gameData._aiStratPowByOwner[unit.owner];
    if(myPower === undefined) myPower = getOwnerTroopManpower(unit.owner);
    let aggression = myPower / Math.max(1, playerPower);
    let frontHexes = wodCachedFrontlineHexes(unit.owner);
    for(let i = 0, LH = frontHexes.length; i < LH; i++) {
        let hex = frontHexes[i];
        if(!canUnitEnterHex(unit, hex)) continue;
        let attackHex = null;
        let enemyPressure = 0;
        let bestAttackScore = -Infinity;
        for(let nHex of getNeighborHexes(hex)) {
            if(!canUnitEnterHex(unit, nHex) || wodIsFriendlyOwner(nHex.owner, unit.owner)) continue;
            let friendlyAround = getNeighborHexes(nHex).filter(aHex => wodIsFriendlyOwner(aHex.owner, unit.owner)).length;
            let hostileAround = getNeighborHexes(nHex).filter(aHex => isClaimableLand(aHex) && wodIsHostileOwner(aHex.owner, unit.owner)).length;
            let cityBonus = wodAiKnownCities(unit.owner).some(city => wodIsHostileOwner(city.owner, unit.owner) && city.q === nHex.q && city.r === nHex.r)
                ? (wodAiIsFoe(unit.owner, nHex.owner) ? 140 : 70) : 0;
            let playerBonus = wodAiIsFoe(unit.owner, nHex.owner) ? 95 : 24;
            // Prefer pushing into the weakest enemy: compare our fielded manpower vs theirs.
            if(wodIsHostileOwner(nHex.owner, unit.owner)) {
                let foePow = wodFogActive()?wodAiKnownEnemyPower(unit.owner,nHex.owner):nHex.owner === 1
                    ? (gameData._aiStratPowPlayer || 0)
                    : ((gameData._aiStratPowByOwner && gameData._aiStratPowByOwner[nHex.owner]) || 0);
                let myPow2 = (gameData._aiStratPowByOwner && gameData._aiStratPowByOwner[unit.owner]) || 1;
                let edge = myPow2 / Math.max(1, foePow);
                if(edge > 1.05) playerBonus += Math.min(70, (edge - 1) * 60);
            } else if(nHex.owner === 0) {
                playerBonus += 30; // free land: expand into neutral ground eagerly
            }
            // Avoid attacking into terrain that gives our unit type a defense penalty.
            let terrainPenalty = 0;
            if(unit.type === 'heavy') {
                if(nHex.type === 'forest' || nHex.type === 'hill' || nHex.type === 'mountain' || nHex.type === 'swamp') terrainPenalty = 20;
            }
            let localEnemyTroops = countNearbyUnits(unit.owner, nHex.x, nHex.y, 115, true);
            let attackScore = playerBonus + cityBonus + friendlyAround * 24 - hostileAround * 5 - terrainPenalty
                + Math.max(0, 12 - localEnemyTroops) * 7;
            if(attackScore > bestAttackScore) {
                bestAttackScore = attackScore;
                attackHex = nHex;
            }
            enemyPressure += wodAiIsFoe(unit.owner, nHex.owner) ? 4 : 1;
        }
        if(!attackHex) continue;

        let dx = hex.x - unit.x;
        let dy = hex.y - unit.y;
        let support = countNearbyUnits(unit.owner, hex.x, hex.y, 170);
        let enemies = countNearbyUnits(unit.owner, hex.x, hex.y, 190, true);
        let friendlyAroundTarget = getNeighborHexes(attackHex).filter(nHex => wodIsFriendlyOwner(nHex.owner, unit.owner)).length;
        let enemyAroundTarget = getNeighborHexes(attackHex).filter(nHex => isClaimableLand(nHex) && wodIsHostileOwner(nHex.owner, unit.owner)).length;
        let encirclePressure = friendlyAroundTarget * 18000 + Math.max(0, 4 - enemyAroundTarget) * 9000;
        // Bonus for holding from defensible terrain (forest, hill, urban for infantry).
        let holdBonus = 0;
        if(unit.type !== 'heavy') {
            if(hex.type === 'forest' || hex.type === 'hill') holdBonus = -20000;
            else if(hex.type === 'urban') holdBonus = -15000;
        } else {
            if(hex.type === 'urban') holdBonus = -10000;
        }
        let cityDefenseBonus = 0;
        for(let c of wodAiKnownCities(unit.owner)) {
            if(c.owner !== unit.owner) continue;
            let ch = wodHexAt(c.q,c.r);
            if(!ch) continue;
            if(!getNeighborHexes(hex).some(n => n.q === ch.q && n.r === ch.r)) continue;
            if(getNeighborHexes(ch).some(n => wodIsHostileOwner(n.owner, unit.owner)))
                cityDefenseBonus -= 420000;
        }
        let playerNearHold = countPlayerThreatNear(hex.x, hex.y, 205, unit.owner);
        let playerTile = getNeighborHexes(attackHex).some(n => n && wodAiIsFoe(unit.owner, n.owner)) ? 1 : 0;
        let guardPull = -(playerNearHold * 12000 + playerTile * 15000);
        let mireHold = hexMountainProximityScore(hex) * 2400;
        let score = dx * dx + dy * dy - enemyPressure * 25000 * Math.min(1.15, Math.max(0.55, aggression))
            - support * 12000 + enemies * 8000 - encirclePressure + holdBonus + cityDefenseBonus + mireHold + guardPull;
        if(aggression < 0.9) score += 22000;
        if(focus) {
            let fdx = hex.x - focus.x;
            let fdy = hex.y - focus.y;
            score += (fdx * fdx + fdy * fdy) * 0.55;
        }
        if(score < bestScore) {
            bestScore = score;
            best = {holdHex: hex, attackHex, support, enemies};
        }
    }
    return best;
}

function wodAiIssueSectorOrder(unit, assignment, hpRatio) {
    if(!unit || !assignment) return false;
    let dx = assignment.attackHex.x - assignment.holdHex.x;
    let dy = assignment.attackHex.y - assignment.holdHex.y;
    let len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    let slot = wodAiUnitSlotOffset(unit, assignment.holdHex, 0.82);
    let spread = slot.ox;
    let fight = wodAiSectorFightStats(unit.owner, assignment.holdHex);
    let support = assignment.support != null ? assignment.support : fight.support;
    let enemies = assignment.enemies != null ? assignment.enemies : fight.enemies;
    let localRatio = (support + 1) / (enemies + 1);
    let campAggro = !!(gameData._campaignRun || gameData._campaignAiAggressive);
    const allies=wodAiKnownEntities(unit.owner).filter(u=>u.owner===unit.owner&&u.hp>0&&u.type!=='convoy'&&Math.hypot(u.x-assignment.holdHex.x,u.y-assignment.holdHex.y)<(gameData.hexRadius||20)*8);
    const balance=wodAiAssaultBalance(unit.owner,allies,assignment.attackHex);
    let wantHold=!balance.ready;
    if(wantHold) {
        let moved = wodAiMoveUnitToward(unit,
            assignment.holdHex.x - (dx / len) * gameData.hexRadius * 0.75 + spread,
            assignment.holdHex.y - (dy / len) * gameData.hexRadius * 0.75 + slot.oy * 0.45,
            true);
        // Only stamp when the move actually assigned a target — stamping a failed
        // move left holding=true with no target and no way to accumulate stuck
        // timers, so wodAiShouldKeepCurrentOrder parked the unit permanently.
        if(moved) wodAiStampOrder(unit, true, assignment.holdHex);
        else unit.holding = false;
        return moved;
    }
    let depth = campAggro
        ? ((fight.canOverwhelm || localRatio >= 1.0) ? 2.7 : 1.9)
        : ((fight.canOverwhelm || localRatio >= 1.08) ? 2.45 : 1.6);
    let moved = wodAiMoveUnitToward(unit,
        assignment.holdHex.x + (dx / len) * gameData.hexRadius * depth + spread * 0.35,
        assignment.holdHex.y + (dy / len) * gameData.hexRadius * depth + slot.oy * 0.35,
        false);
    unit.holding = false;
    // The escalation clock only resets when the push ACTUALLY starts — a failed
    // push pathfind used to restart the 14s hold timer, cycling hold→fail→hold.
    if(moved) {
        unit.aiHoldStartAt = 0;
        wodAiStampOrder(unit, false, assignment.holdHex);
    }
    return moved;
}

function wodPickAiSectorForUnit(unit, sectors) {
    if(!sectors || !sectors.length) return null;
    let best = null;
    let bestScore = Infinity;
    for(let i = 0; i < sectors.length; i++) {
        let s = sectors[i];
        if(!canUnitEnterHex(unit, s.holdHex)) continue;
        let support = countNearbyUnits(unit.owner, s.holdHex.x, s.holdHex.y, 190);
        let enemies = countNearbyUnits(unit.owner, s.holdHex.x, s.holdHex.y, 210, true);
        let deficit = Math.max(0, (enemies + 1) * 1.25 - (support + 1));
        let cityObj = 0;
        if(wodAiKnownCities(unit.owner).some(c => wodAiIsFoe(unit.owner, c.owner) && c.q === s.attackHex.q && c.r === s.attackHex.r))
            cityObj = -520000;
        else if(wodAiKnownCities(unit.owner).some(c => wodIsHostileOwner(c.owner, unit.owner) && c.q === s.attackHex.q && c.r === s.attackHex.r))
            cityObj = -180000;
        let dx = s.holdHex.x - unit.x;
        let dy = s.holdHex.y - unit.y;
        let score = dx * dx + dy * dy + deficit * 92000 + i * 1800 - cityObj;
        if(score < bestScore) {
            bestScore = score;
            best = { holdHex: s.holdHex, attackHex: s.attackHex, support, enemies };
        }
    }
    return best;
}

function buildAiFrontlineSectors(owner, want) {
    let fake = {type: 'light', owner};
    let candidates = [];
    let frontHexes = wodCachedFrontlineHexes(owner);
    const ownArmy=gameData.entities.filter(u=>u.hp>0&&u.owner===owner&&isLandArmyUnit(u)&&!u.boardTransportUid);
    const proximity=h=>ownArmy.length?Math.min(25,Math.sqrt(Math.min(...ownArmy.map(u=>wodAiDist2(u.x,u.y,h.x,h.y))))/(gameData.hexRadius||20)*.45):0;
    for(let fi = 0, fl = frontHexes.length; fi < fl; fi++) {
        let hex = frontHexes[fi];
        if(!canUnitEnterHex(fake, hex)) continue;
        let attackHex = null;
        let bestWeak = Infinity;
        for(let nHex of getNeighborHexes(hex)) {
            if(!canUnitEnterHex(fake, nHex) || wodIsFriendlyOwner(nHex.owner, owner)) continue;
            let enemyWeight = countNearbyUnits(owner, nHex.x, nHex.y, 125, true);
            let isCityTile = wodAiKnownCities(owner).some(city => wodIsHostileOwner(city.owner, owner) && city.q === nHex.q && city.r === nHex.r);
            let isPlayerCity = wodAiKnownCities(owner).some(city => wodAiIsFoe(owner, city.owner) && city.q === nHex.q && city.r === nHex.r);
            let weak = enemyWeight * 3 - (isCityTile ? 1.5 : 0) - (isPlayerCity ? 2 : 0);
            if(weak < bestWeak) {
                bestWeak = weak;
                attackHex = nHex;
            }
        }
        if(!attackHex) continue;

        let cityDefenseBias = 0;
        for(let c of wodAiKnownCities(owner)) {
            if(c.owner !== owner) continue;
            let ch = wodHexAt(c.q,c.r);
            if(!ch) continue;
            if(!getNeighborHexes(ch).some(n => wodIsHostileOwner(n.owner, owner))) continue;
            let ddx = hex.x - c.x, ddy = hex.y - c.y;
            if(ddx * ddx + ddy * ddy < Math.pow(gameData.hexRadius * 12, 2)) cityDefenseBias -= 25;
        }
        let playerThreat = countPlayerThreatNear(hex.x, hex.y, 200, owner);
        let touchesPlayerLand = getNeighborHexes(hex).some(n => n && wodAiIsFoe(owner, n.owner));
        let guardBias = -playerThreat * 2.4 - (touchesPlayerLand ? 8 : 0);
        candidates.push({holdHex: hex, attackHex, attackScore: bestWeak, score: cityDefenseBias + guardBias - Math.max(0,bestWeak)*.3+proximity(hex)});
    }
    candidates.sort((a,b)=>a.score-b.score);
    let weakCandidates=candidates.slice().sort((a,b)=>a.attackScore-b.attackScore||a.score-b.score);
    let mixed=[];
    for(let i=0;i<candidates.length;i++){mixed.push(candidates[i]);mixed.push(weakCandidates[i]);}
    let out = [];
    let pressure = estimatePlayerPressureOnFront(owner);
    let sectorSpacing = pressure > 6 ? 3.45 : (pressure > 2 ? 4.25 : 5.1);
    let minDistSq = Math.pow(gameData.hexRadius * sectorSpacing, 2);
    for(let c of mixed) {
        if(out.some(o => {
            let dx = o.holdHex.x - c.holdHex.x;
            let dy = o.holdHex.y - c.holdHex.y;
            return dx * dx + dy * dy < minDistSq;
        })) continue;
        out.push(c);
        if(out.length >= want) break;
    }
    return out.sort((a,b)=>a.score-b.score);
}

function wodAiJobStillValid(job, owner) {
    if(!job) return false;
    if(job.kind === 'defend' && (job.city || job.fort)) {
        let t = job.city || job.fort;
        if(!t || t.owner !== owner) return false;
        return true; // Standing garrisons remain assigned during quiet periods.
    }
    if(job.kind === 'encircle' || (job.kind === 'raid' && job.strikeHex) || (job.kind === 'strike' && job.strikeHex)) {
        let h = job.strikeHex || job.attackHex || job.holdHex;
        if(!h) return false;
        if(h.owner !== owner) return true;
        return countNearbyUnits(owner, h.x, h.y, 240, true) > 0;
    }
    if(['scout','marine','naval'].includes(job.kind))return true;
    if(job.kind === 'main' && job.attackHex && job.attackHex.owner !== owner) return true;
    if(!job.holdHex) return false;
    let h = wodHexAt(job.holdHex.q,job.holdHex.r) || job.holdHex;
    if(job.kind === 'reserve') return !!(h && (h.owner === owner || h.owner === 0));
    if(!h || h.owner !== owner) return false;
    // Front jobs die when the hold tile is no longer contested / near enemies.
    if(job.kind === 'hold' || job.kind === 'main' || job.kind === 'raid') {
        let enemies = countNearbyUnits(owner, h.x, h.y, 280, true);
        let frontish = isFrontlineHex(h, owner) || enemies > 0;
        return frontish;
    }
    return true;
}

function wodAiAttackSectorScore(owner,sector,members=[]) {
    const h=sector.attackHex;if(!h)return Infinity;
    const hr=gameData.hexRadius||20;
    const known=wodAiThreats(owner).filter(u=>u.hp>0&&!u.boardTransportUid&&u.type!=='convoy'&&wodIsHostileOwner(u.owner,owner));
    const defenders=known.filter(u=>Math.hypot(u.x-h.x,u.y-h.y)<hr*7).reduce((n,u)=>n+wodAiUnitCombatPower(u),0);
    const deeper=known.filter(u=>Math.hypot(u.x-h.x,u.y-h.y)<hr*11).reduce((n,u)=>n+wodAiUnitCombatPower(u),0);
    const fortRisk=wodAiKnownForts(owner).some(f=>wodIsHostileOwner(f.owner,owner)&&Math.hypot(f.x-h.x,f.y-h.y)<hr*7);
    const town=wodAiKnownCities(owner).some(c=>wodIsHostileOwner(c.owner,owner)&&Math.hypot(c.x-h.x,c.y-h.y)<hr*5);
    const suitability=members.length?members.reduce((n,u)=>n+wodAiUnitCombatPower(u,h)/Math.max(.1,wodAiUnitCombatPower(u,{type:'grass'})),0)/members.length:1;
    return defenders*4+deeper*1.25+(fortRisk?8:0)-(town?2:0)-Math.min(3,suitability)*2+
        wodAiObjectivePreference(owner,h)*3;
}

function wodAiAssaultObjective(owner,members,sectors,taken={}) {
    if(!members.length)return null;
    const structure=wodAiStructureObjective(owner,members);
    if(structure)return {objectiveStructure:structure,objectiveHex:structure.hex,attackHex:structure.hex,
        holdHex:getNearestHexToPoint(members[0].x,members[0].y),phase:'assemble',phaseAt:wodAiOperationTime(),operationAt:wodAiOperationTime()};
    const lead=members.find(u=>u.type==='heavy')||members.find(u=>!wodCanClimb(u))||members[0], reach=wodAiOperationReach(lead);
    const hr=gameData.hexRadius||20;
    const front=wodAiFrontOwner(lead),towns=wodAiKnownCities(owner).filter(c=>wodIsHostileOwner(c.owner,owner)&&(!front||c.owner===front)&&reach.has(`${c.q},${c.r}`));
    const score=c=>wodAiObjectiveCost(owner,members,c)+(taken[c.id]||0)*(wodAiCommander(owner).id==='maneuver'?5:1);
    const costs=new Map(towns.map(c=>[c,{ready:wodAiAssaultBalance(owner,members,c).ready,cost:score(c)}]));
    towns.sort((a,b)=>Number(!costs.get(a).ready)-Number(!costs.get(b).ready)||costs.get(a).cost-costs.get(b).cost);
    const town=towns[0];if(!town)return wodAiTerritoryObjective(owner,members,sectors,taken);
    const strategy=wodAiBattlePlan(owner);if(!strategy.primaryId||!towns.some(c=>c.id===strategy.primaryId))strategy.primaryId=town.id;
    const approaches=sectors.filter(t=>t.holdHex&&reach.has(getHexKey(t.holdHex)));
    approaches.sort((a,b)=>wodAiDist2(a.holdHex.x,a.holdHex.y,town.x,town.y)-wodAiDist2(b.holdHex.x,b.holdHex.y,town.x,town.y));
    let rally=approaches[0]?.holdHex||getNearestHexToPoint(lead.x,lead.y);
    // Coarse sectors can be many tiles off-axis. Assemble at the actual friendly
    // edge on the approach to the target, rather than making a huge lateral march.
    const steps=Math.min(100,Math.max(1,Math.ceil(Math.hypot(town.x-lead.x,town.y-lead.y)/hr)));
    for(let i=0;i<=steps;i++){
        const h=getNearestHexToPoint(lead.x+(town.x-lead.x)*i/steps,lead.y+(town.y-lead.y)*i/steps);
        if(!h||h.owner!==owner||isWaterHex(h)||!canUnitEnterHex(lead,h)||!reach.has(getHexKey(h)))break;
        rally=h;
    }
    return {objectiveCity:town,attackHex:wodHexAt(town.q,town.r),holdHex:rally,
        phase:'assemble',phaseAt:wodAiOperationTime(),operationAt:wodAiOperationTime()};
}

function wodAiEnsureTaskForcePlan(owner, units) {
    if(!gameData.aiTaskForces)gameData.aiTaskForces={};
    // Land units the field command holds are its own: plans made for them here would only be thrown away
    // (their moves are refused while the lease runs). WOD_OPS.T.planLeased=1 plans for them anyway.
    const leasedOut=!wodOpsTune(owner).planLeased,leaseNow=wodAiOperationTime();
    const ready=units.filter(u=>u&&!(leasedOut&&u._opsUntil>leaseNow)&&u.hp>u.maxHp*.34&&!u._medicalRecovering&&!u.moraleBroken&&!u.retreating&&!u.boardTransportUid&&!(u._navalAssaultUntil>wodAiOperationTime())&&!(u._navalEscortUntil>wodAiOperationTime())&&u.type!=='convoy'&&!['transport','supply'].includes(u.type));
    ready.forEach(ensureUnitId);
    const fortSites=(gameData.constructionJobs||[]).filter(j=>j.owner===owner&&j.mode==='fort').map(j=>({...j,id:'fort-site-'+j.q+','+j.r}));
    const assets=[...wodAiKnownCities(owner),...wodAiKnownForts(owner),...fortSites].filter(c=>c.owner===owner);
    const assetSignature=wodAiCommander(owner).id+'|'+assets.map(c=>c.id).sort().join('|')+'|intel:'+wodAiKnownCities(owner).filter(c=>wodIsHostileOwner(c.owner,owner)).map(c=>c.id).sort().join(','), now=wodAiOperationTime(), prev=gameData.aiTaskForces[owner];
    if(prev){
        const known=new Map(wodAiKnownCities(owner).map(c=>[c.id,c]));
        for(const job of prev.jobs){if(job.objectiveCity&&known.has(job.objectiveCity.id))job.objectiveCity=known.get(job.objectiveCity.id);if(job.operation?.objectiveCity&&known.has(job.operation.objectiveCity.id))job.operation.objectiveCity=known.get(job.operation.objectiveCity.id);}
    }
    // Reinforcements join the existing push. A roster change must not recall
    // healthy attackers or replace their target with a rear-area guard order.
    const activeMission=prev&&prev.jobs.some(j=>{
        const target=j.objectiveCity||j.operation?.objectiveCity||j.objectiveHex;
        const commitment=j.objectiveCity||j.operation?.objectiveCity?240000:60000;
        return target&&now-(prev.simBuiltAt||0)<commitment&&wodIsHostileOwner(target.owner,owner)&&
            ready.filter(u=>prev.unitJob[u.uid]===j.id).length>=Math.max(1,Math.ceil(j.quota*.5));
    });
    const assetIds=assets.map(c=>c.id),frontMission=prev&&wodAiActiveFrontOperations(owner).some(op=>
        op.members.filter(id=>ready.some(u=>u.uid===id&&!prev.jobs.find(j=>j.id===prev.unitJob[id])?.city&&!prev.jobs.find(j=>j.id===prev.unitJob[id])?.fort)).length>=3);
    const gainedAssets=prev?.assetIds&&prev.assetIds.every(id=>assetIds.includes(id))&&prev.assetSignature.startsWith(wodAiCommander(owner).id+'|');
    if(prev&&(prev.assetSignature===assetSignature||gainedAssets)&&(now<prev.expireAt||activeMission||frontMission)) {
        // Capturing a town adds one garrison; it does not dissolve the
        // surviving assault and send it back through new rally orders.
        prev.assetSignature=assetSignature;prev.assetIds=assetIds;
        wodAiRebalanceGroups(owner,prev,ready);
        prev.readyN=ready.length;wodAiReadDefense(owner,units);wodAiPlanFrontOffensive(owner,prev,ready);return prev;
    }
    const sectors=buildAiFrontlineSectors(owner,Math.min(24,Math.max(6,Math.ceil(ready.length/2))));
    const attackSectors=sectors.slice().sort((a,b)=>wodAiAttackSectorScore(owner,a)-wodAiAttackSectorScore(owner,b));
    const jobs=[],unitJob={},taken={},continuedLandOperations={};let index=0;
    const add=(kind,members,sector,asset)=>{
        if(!members.length)return null;
        const job={id:owner+'-'+kind+'-'+index++,kind,role:kind,quota:members.length,members:members.map(u=>u.uid),
            holdHex:sector?.holdHex,attackHex:sector?.attackHex,
            city:asset&&wodAiKnownCities(owner).includes(asset)?asset:null,fort:asset&&!wodAiKnownCities(owner).includes(asset)?asset:null};
        jobs.push(job);
        for(const u of members){unitJob[u.uid]=job.id;u.aiTfJobId=job.id;u.aiTfKind=kind;u.aiTfRole=kind;u.aiFortGuard=null;u.aiCityStriker=false;}
        if(['main','armor','raid'].includes(kind)) {
            const old=prev?.jobs.filter(j=>j.kind===kind&&(j.objectiveCity||j.objectiveHex)&&wodIsHostileOwner((j.objectiveCity||j.objectiveHex).owner,owner))
                .sort((a,b)=>members.filter(u=>prev.unitJob[u.uid]===b.id).length-members.filter(u=>prev.unitJob[u.uid]===a.id).length)[0];
            const continuing=old&&members.filter(u=>prev.unitJob[u.uid]===old.id).length>=Math.ceil(members.length*.5);
            const assaultN=jobs.filter(j=>['main','armor','raid'].includes(j.kind)).length;
            const cityN=jobs.filter(j=>j.objectiveCity).length,profile=wodAiCommander(owner);
            const landPreference=Math.min(.9,profile.land+(strategy.intent==='maneuver'?.18:0));
            const canSplit=cityN>=Math.max(2,Math.ceil(assaultN*(1-landPreference)));
            const landGoal=(kind==='raid'||kind==='main'&&!jobs.some(j=>j.objectiveHex)&&cityN>=2||canSplit&&wodAiObjectivePreference(owner,sector?.attackHex||getNearestHexToPoint(members[0].x,members[0].y))<landPreference)?wodAiTerritoryObjective(owner,members,attackSectors,taken):null;
            const objective=continuing?{objectiveCity:old.objectiveCity,objectiveHex:old.objectiveHex,attackHex:old.attackHex,holdHex:old.holdHex,phase:old.phase,phaseAt:old.phaseAt,operationAt:old.operationAt,cutoff:old.cutoff,cutHexes:old.cutHexes,recon:old.recon}:landGoal||wodAiAssaultObjective(owner,members,attackSectors,taken);
            if(objective){Object.assign(job,objective);const key=objective.objectiveCity?.id||getHexKey(objective.objectiveHex);taken[key]=(taken[key]||0)+1;}
            if(continuing){
                const key=old.objectiveCity?.id||getHexKey(old.objectiveHex),op=prev.landOperations?.[key];
                if(op&&op.stage!=='complete'){continuedLandOperations[key]=op;job.operationState=op;job.stage=op.stage;}
                job._formationSlots=old._formationSlots;job._rallyLead=old._rallyLead;
            }
        }
        return job;
    };
    const profile=wodAiCommander(owner),strategy=wodAiBattlePlan(owner,ready),infantry=ready.filter(u=>!['heavy','motorized','marine','ship'].includes(u.type));
    const attacking=u=>['main','armor','raid','marine'].includes(prev?.jobs.find(j=>j.id===prev.unitJob[u.uid])?.kind);
    const towns=assets.filter(a=>wodAiKnownCities(owner).includes(a));
    const guardAssets=[...towns,...assets.filter(a=>!wodAiKnownCities(owner).includes(a))];
    for(const asset of guardAssets) {
        if(!infantry.length)break;
        // A town's last infantry is never budgeted away into an attack group.
        infantry.sort((a,b)=>(!wodAiCanReach(a,asset)?1e12:0)-(!wodAiCanReach(b,asset)?1e12:0)+(a.type!=='light'?1e10:0)-(b.type!=='light'?1e10:0)+(attacking(a)?1e9:0)+wodAiDist2(a.x,a.y,asset.x,asset.y)-(attacking(b)?1e9:0)-wodAiDist2(b.x,b.y,asset.x,asset.y));
        if(wodAiCanReach(infantry[0],asset))add('defend',infantry.splice(0,1),null,asset);
    }
    for(const scout of infantry.splice(0,wodAiDesiredGroundScouts(owner,ready)))add('scout',[scout],sectors[0]);
    const defenseDemand=wodAiDefenseDemand(owner,ready,sectors,strategy,jobs.filter(j=>j.kind==='defend').reduce((n,j)=>n+j.members.length,0));
    const lineN=Math.min(infantry.length,defenseDemand.line);
    for(let i=0;i<lineN;i++)add('hold',infantry.splice(0,1),defenseDemand.ranked[i%Math.max(1,sectors.length)]);
    const reserveN=Math.min(Math.max(0,infantry.length-2),defenseDemand.reserve);
    if(reserveN&&sectors.length)add('reserve',infantry.splice(-reserveN),sectors[0]);
    if(profile.id==='highland'){const climbers=infantry.filter(wodCanClimb);if(climbers.length>=2){for(const u of climbers.slice(0,3))infantry.splice(infantry.indexOf(u),1);add('main',climbers.slice(0,3),attackSectors[0]);}}
    const armor=ready.filter(u=>['heavy','motorized'].includes(u.type));
    while(armor.length) {
        const tank=armor.shift(),partners=infantry.length<2?armor.splice(0,2):[];
        infantry.sort((a,b)=>wodAiDist2(a.x,a.y,tank.x,tank.y)-wodAiDist2(b.x,b.y,tank.x,tank.y));
        add('armor',[tank,...partners,...infantry.splice(0,Math.min(2,infantry.length))],attackSectors[jobs.length%Math.max(1,attackSectors.length)]);
    }
    const flank=infantry.length>=6?infantry.splice(-Math.max(2,Math.floor(infantry.length*profile.flank))):[];
    const escorts=infantry.length>=8?infantry.splice(-2):[];
    for(let i=0;i<infantry.length;i+=4)add('main',infantry.slice(i,i+4),attackSectors[Math.floor(i/4)%Math.max(1,attackSectors.length)]);
    for(let i=0;i<flank.length;i+=5) {
        const job=add('raid',flank.slice(i,i+5),attackSectors[(1+Math.floor(i/5))%Math.max(1,attackSectors.length)]);
        if(job.objectiveHex||job.objectiveCity)job.strikeHex=job.attackHex;
    }
    if(escorts.length){const job=add('support',escorts,sectors[0]);job.escortJobId=jobs.find(j=>j.kind==='armor'||j.kind==='main')?.id;}
    const marines=ready.filter(u=>u.type==='marine'),ships=ready.filter(u=>u.type==='ship');
    const operations=[];
    for(let i=0;i<marines.length;i+=3) {
        const squad=marines.slice(i,i+3),escort=ships.splice(0,Math.min(2,ships.length));
        const previousOp=prev?.operations?.find(op=>wodIsHostileOwner(op.objectiveCity.owner,owner)&&squad.some(u=>op.jobIds.includes(prev.unitJob[u.uid])));
        const operation=previousOp?{...previousOp}:wodAiCoastalOperation(owner,squad,escort,sectors);
        const marine=add('marine',squad,attackSectors[0]),naval=add('naval',escort,attackSectors[0]);
        if(operation){operation.jobIds=[marine.id,...(naval?[naval.id]:[])];marine.operation=operation;if(naval)naval.operation=operation;operations.push(operation);}
    }
    for(let i=0;i<ships.length;i+=3)add('naval',ships.slice(i,i+3),attackSectors[0]);
    const plan={owner,assetSignature,assetIds,jobs,unitJob,sectors,operations,landOperations:continuedLandOperations,defenseDemand:{line:lineN,reserve:reserveN,frontage:defenseDemand.frontage,armyFloor:defenseDemand.armyFloor},readyN:ready.length,builtAt:now,simBuiltAt:wodAiOperationTime(),expireAt:now+30000};
    gameData.aiTaskForces[owner]=plan;wodAiOrganizeFronts(owner,plan,ready);wodAiCoordinateCampaign(owner,plan,ready);wodAiConcentrateAssaults(owner,plan,ready);wodAiReadDefense(owner,units);wodAiPlanFrontOffensive(owner,plan,ready);return plan;
}

function wodAiTownAssaultHex(unit,city,members) {
    if(!city)return null;
    const urban=getCityUrbanTerrainHexes(city),remaining=urban.filter(h=>wodIsHostileOwner(h.owner,unit.owner)||h.owner===0);
    if(!remaining.length)return wodHexAt(city.q,city.r);
    const counts=new Map();
    const ordered=members.slice().sort((a,b)=>String(a.uid).localeCompare(String(b.uid)));
    for(const member of ordered) {
        const target=remaining.slice().sort((a,b)=>
            (counts.get(getHexKey(a))||0)-(counts.get(getHexKey(b))||0)||
            wodAiDist2(member.x,member.y,a.x,a.y)-wodAiDist2(member.x,member.y,b.x,b.y))[0];
        counts.set(getHexKey(target),(counts.get(getHexKey(target))||0)+1);
        if(member===unit)return target;
    }
    return remaining[0];
}

/** Short forward bounds choose cover for this class without abandoning its objective. */
function wodAiAdvanceHex(unit,goal,members) {
    const start=getNearestHexToPoint(unit.x,unit.y),hr=gameData.hexRadius||20;
    if(!start||wodIsNavalUnit(unit)||Math.hypot(unit.x-goal.x,unit.y-goal.y)<hr*4)return goal;
    const threats=wodAiKnownEntities(unit.owner).filter(e=>e.hp>0&&!e.boardTransportUid&&e.type!=='convoy'&&wodIsHostileOwner(e.owner,unit.owner)&&Math.hypot(e.x-unit.x,e.y-unit.y)<hr*11);
    if(!threats.length)return wodAiRouteAdvance(unit,goal);
    const assignment=wodAiGetUnitTaskJob(unit),compactResponse=assignment?.response&&!assignment.frontOperation;
    const neighbors=compactResponse?members:gameData.entities.filter(m=>m!==unit&&m.owner===unit.owner&&m.hp>0&&!m.boardTransportUid&&!wodIsNavalUnit(m)&&Math.hypot(m.x-unit.x,m.y-unit.y)<hr*14);
    const distance=h=>Math.hypot(h.x-goal.x,h.y-goal.y),before=distance(start),queue=[start],seen=new Set([getHexKey(start)]);
    let best=null,bestScore=-Infinity;
    for(let i=0;i<queue.length;i++){
        const h=queue[i];
        for(const n of getNeighborHexes(h)){
            if(seen.has(getHexKey(n))||Math.max(Math.abs(n.q-start.q),Math.abs(n.r-start.r))>3||isWaterHex(n)||!wodCanStepBetweenHexes(unit,h,n,true))continue;
            seen.add(getHexKey(n));queue.push(n);
        }
        const progress=(before-distance(h))/hr;if(progress<.6)continue;
        const terrain=wodAiUnitCombatPower(unit,h)/Math.max(.1,wodAiUnitCombatPower(unit,{type:'grass'}));
        const exposed=threats.filter(e=>Math.hypot(e.x-h.x,e.y-h.y)<(e.range||50)+hr).reduce((n,e)=>n+wodAiUnitCombatPower(e),0);
        const crowd=neighbors.filter(m=>Math.hypot((m.orderTarget||m).x-h.x,(m.orderTarget||m).y-h.y)<hr*1.4).length;
        const side=Math.abs((goal.x-start.x)*(h.y-start.y)-(goal.y-start.y)*(h.x-start.x))/Math.max(hr,Math.hypot(goal.x-start.x,goal.y-start.y))/hr;
        const score=progress*2.2+Math.min(3,terrain)*4-exposed*1.2-crowd*(compactResponse?.8:2)-side*.7;
        if(score>bestScore){best=h;bestScore=score;}
    }
    return best||wodAiRouteAdvance(unit,goal);
}

function wodAiIssueCoordinatedAssault(unit,job) {
    const hr=gameData.hexRadius||20,now=wodAiOperationTime(),plan=gameData.aiTaskForces[unit.owner];
    const members=wodAiAssaultMembers(unit.owner,job,plan);
    wodAiExploitTown(unit.owner,job,members,plan);
    let goal=job.objectiveCity||job.objectiveHex;
    const unfinishedTown=job.objectiveCity&&getCityUrbanTerrainHexes(job.objectiveCity).some(h=>!wodIsFriendlyOwner(h.owner,unit.owner));
    if(!goal||!wodIsHostileOwner(goal.owner,unit.owner)&&!unfinishedTown&&(!job.operationState||job.operationState.stage==='complete')) {
        if(job.objectiveHex)plan.sectors=buildAiFrontlineSectors(unit.owner,Math.min(24,Math.max(6,Math.ceil(plan.readyN/2))));
        const next=wodAiAssaultObjective(unit.owner,members,plan.sectors);
        if(!next){plan.expireAt=0;return false;}
        const rolling=job.operationState?.reason==='sector-advance'&&!next.objectiveCity&&!next.cutoff&&Math.hypot(next.objectiveHex.x-goal.x,next.objectiveHex.y-goal.y)<hr*9;
        job.objectiveCity=null;job.objectiveHex=null;job.cutoff=false;job.cutHexes=null;Object.assign(job,next);goal=job.objectiveCity||job.objectiveHex;if(rolling)job.phase='assault';
    }
    wodAiRefreshRally(unit.owner,job,members,goal);
    const balance=wodAiAssaultBalance(unit.owner,members,goal);job.forceBalance=balance;
    const op=wodAiUpdateOperation(unit.owner,job,members,goal,plan,balance);
    const strategy=wodAiBattlePlan(unit.owner),request=strategy.requests[job.id]||{};
    strategy.requests[job.id]={...request,at:now,power:Math.max(0,balance.enemy*balance.ratio-balance.own,job.waitingForStrength?Math.ceil(op.roster*.8)-members.length:0),goal:goal.id||getHexKey(goal)};
    job.neededPower=strategy.requests[job.id].power;
    if(job.waitingForStrength){
        job.stalledAt??=now;
        if(!balance.ready&&now-job.stalledAt>18000&&now-(job.reconsiderAt||0)>18000){
            job.reconsiderAt=now;
            const sectors=buildAiFrontlineSectors(unit.owner,18),alternative=wodAiTerritoryObjective(unit.owner,members,sectors);
            if(alternative&&wodAiAssaultBalance(unit.owner,members,alternative.objectiveHex).ready){
                job.objectiveCity=null;Object.assign(job,alternative);job.stalledAt=null;goal=job.objectiveHex;
            }
        }
    }else job.stalledAt=null;
    if(op.stage==='attack'&&!op.screenIds?.includes(unit.uid)&&wodAiHoldUnsupportedVanguard(unit,job,members,goal))return true;
    const destination=job.objectiveCity?wodAiTownAssaultHex(unit,job.objectiveCity,members):wodAiSectorAdvanceHex(unit,job,members);
    let target=['assemble','recover'].includes(op.stage)?wodAiFormationSlot(unit,job,job.holdHex||getNearestHexToPoint(unit.x,unit.y),goal,members):['secure-approach','protect-flanks'].includes(op.stage)?wodAiFormationSlot(unit,job,op.approach,goal,members):destination&&(wodAiAssaultMarchHex(unit,op,goal,members)||wodAiAdvanceHex(unit,destination,members));
    if(op.stage==='consolidate')target=wodAiDefendStandHex(unit.owner,getNearestHexToPoint(unit.x,unit.y),unit);
    if(op.stage==='attack'&&op.screenIds?.includes(unit.uid))target=wodAiOperationScreenHex(unit,op,goal,members);
    if(op.stage==='attack'&&unit.isGeneral)return wodAiIssueGeneralOrder(unit,job);
    if(op.stage==='attack'&&members.length>=3&&!op.screenIds?.includes(unit.uid)){
        const distances=members.map(u=>Math.hypot(u.x-goal.x,u.y-goal.y)).sort((a,b)=>a-b),median=distances[Math.floor(distances.length/2)];
        const near=wodAiThreats(unit.owner,false).some(e=>Math.hypot(e.x-unit.x,e.y-unit.y)<(e.range||50)+hr*2);
        const localCore=members.filter(m=>Math.hypot(m.x-unit.x,m.y-unit.y)<hr*7);
        if(!near&&!wodAiAssaultBalance(unit.owner,localCore,goal).ready&&Math.hypot(unit.x-goal.x,unit.y-goal.y)<median-hr*4){const here=getNearestHexToPoint(unit.x,unit.y);if(here?.owner===unit.owner)target=here;}
    }
    unit.aiCaptureHexKey=op.stage==='attack'&&!op.screenIds?.includes(unit.uid)?destination&&getHexKey(destination):null;
    if(!target)return false;
    const holding=op.stage!=='attack'||op.screenIds?.includes(unit.uid);
    const moved=wodAiMoveUnitTowardHex(unit,target,holding,holding?.45:unit.type==='heavy'?.35:.65);
    if(moved){unit.aiHoldStartAt=0;wodAiStampOrder(unit,holding,target,holding?2500:7000);unit.aiOrderPhase=job.phase;unit.aiOperationStage=op.stage;unit.aiAssaultBound=op.march?.id;}
    return true; // Waiting/repathing cannot fall through to an individual suicide attack.
}

function wodAiGetUnitTaskJob(unit) {
    if(!unit || !gameData.aiTaskForces) return null;
    let plan = gameData.aiTaskForces[unit.owner];
    if(!plan || !plan.jobs) return null;
    ensureUnitId(unit);
    return wodAiResolveMission(unit,plan);
}

/** Issue a move consistent with the unit's task-force role. */
function wodAiIssueScoutOrder(unit,job) {
    if(!wodFogActive())return false;
    const intel=wodFogFactionIntel(unit.owner),sp=gameData.hexRadius*1.35;
    const enemies=wodAiKnownEntities(unit.owner).filter(u=>u.hp>0&&wodIsHostileOwner(u.owner,unit.owner));
    const contacts=wodAiThreats(unit.owner).filter(e=>e._intelMemory);
    const clock=wodAiOperationTime(),hr=gameData.hexRadius||20;
    if(!job.scoutProgress||Math.hypot(unit.x-job.scoutProgress.x,unit.y-job.scoutProgress.y)>hr*.5)
        job.scoutProgress={x:unit.x,y:unit.y,at:clock};
    if(job.scoutHex&&!intel.explored.has(getHexKey(job.scoutHex))&&unit.target&&clock-job.scoutProgress.at<14000)return true;
    if(job.scoutHex&&clock-job.scoutProgress.at>=14000){
        (job.scoutBlocked||=( {} ))[getHexKey(job.scoutHex)]=clock+45000;
        job.scoutHex=null;job.scoutProgress={x:unit.x,y:unit.y,at:clock};
    }
    const water=wodIsNavalUnit(unit),choices=[],bearing=wodAiDiscoveryBearing(unit.owner),reach=wodAiOperationReach(unit,water);
    for(const h of gameData.hexList) {
        if(!reach.has(getHexKey(h))||job.scoutBlocked?.[getHexKey(h)]>clock)continue;
        if(intel.visible.has(getHexKey(h))||h.type==='mountain'&&!wodCanClimb(unit)||water&&!isWaterHex(h)||!water&&unit.type!=='marine'&&isWaterHex(h))continue;
        if(isLandArmyUnit(unit)&&!wodIsFriendlyOwner(h.owner,unit.owner)&&!hasOwnerNeighbor(h,unit.owner))continue;
        // Scout the edge of existing knowledge, rather than selecting a hidden asset.
        if(!cardinalHexDirections.some(d=>intel.explored.has(`${h.q+d.q},${h.r+d.r}`)))continue;
        const danger=enemies.reduce((n,e)=>n+(Math.hypot(e.x-h.x,e.y-h.y)<sp*6?1:0),0);
        const information=contacts.reduce((n,e)=>n+Math.max(0,1-Math.hypot(e.x-h.x,e.y-h.y)/(sp*10))*(e._intelConfidence||0),0);
        const other=(gameData.aiTaskForces?.[unit.owner]?.jobs||[]).filter(j=>j!==job&&j.scoutHex&&Math.hypot(j.scoutHex.x-h.x,j.scoutHex.y-h.y)<sp*6).length;
        const fresh=intel.explored.has(getHexKey(h))?sp*sp*150:0;
        const forward=(h.x-bearing.x)*bearing.dx+(h.y-bearing.y)*bearing.dy;
        const gain=getNeighborHexes(h).filter(n=>!intel.explored.has(getHexKey(n))).length;
        choices.push({h,score:(h.x-unit.x)**2+(h.y-unit.y)**2+danger*sp*sp*500+other*sp*sp*200+fresh-information*sp*sp*180-forward*sp*4-gain*sp*sp*8});
    }
    choices.sort((a,b)=>a.score-b.score);
    const finalists=choices.slice(0,40);
    for(const candidate of finalists){
        const h=candidate.h;
        const gain=getHexesInRadius(h.q,h.r,4).reduce((n,p)=>n+Number(!!gameData.hexes[p.q+','+p.r]&&!intel.explored.has(p.q+','+p.r)),0);
        candidate.score-=gain*sp*sp*4;
    }
    finalists.sort((a,b)=>a.score-b.score);
    for(const {h} of finalists.slice(0,20))if(wodAiMoveUnitTowardHex(unit,h,false,.15)) {
        job.scoutHex=h;unit.aiTfKind='scout';unit.aiTfRole='scout';wodAiStampOrder(unit,false,h,2200);return true;
    }
    return false;
}

function wodAiIssueTaskForceOrder(unit, job, hpRatio) {
    if(!unit || !job) return false;
    if(unit._medicalRecovering){wodAiCommitMission(unit,null,'recovery');return true;}
    unit._aiCombatSupportAt=null;
    if(unit._aiCareYieldUntil>wodAiOperationTime()||unit._medicalEvacuating||unit._aiScoutUntil>wodAiOperationTime())return true;
    wodAiCommitMission(unit,job);
    unit.aiTfJobId = job.id;
    unit.aiTfKind = job.kind;
    unit.aiTfRole = job.role;
    unit.aiCaptureHexKey = null;
    let hr = gameData.hexRadius || 20;
    if(job.kind==='scout'&&!wodAiCorridorWithdrawal(unit))return wodAiIssueScoutOrder(unit,job);
    if(job.frontOperation)return wodAiIssueFrontOffensive(unit,job);
    if(job.kind==='counter'&&wodAiIssueTownDefense(unit,job))return true;
    if(wodAiTacticalFallback(unit,job))return true;
    if(wodAiIssueGroupCombatSupport(unit,job))return true;
    if(wodAiIssuePursuit(unit,job))return true;
    if(unit.isGeneral&&job.response&&job.kind!=='relief')return wodAiIssueGeneralOrder(unit,job);
    if(job.response)return wodAiIssueDefenseResponse(unit,job);
    const frontSupport=wodAiFrontSupportFor(unit,job);
    if(frontSupport){
        if(wodAiMoveUnitTowardHex(unit,frontSupport.h,false,.12))wodAiStampOrder(unit,false,frontSupport.h,3500);
        return true;
    }
    if(wodAiIssueQuietFrontAdvance(unit,job))return true;
    if(unit.isGeneral&&!(job.objectiveCity||job.objectiveHex))return wodAiIssueGeneralOrder(unit,job);
    if(job.operation)return wodAiIssueCoastalOperation(unit,job);
    if(wodFogActive()&&['marine','naval'].includes(job.kind)&&!job.operation&&!wodAiKnownCities(unit.owner).some(c=>wodIsHostileOwner(c.owner,unit.owner)))return wodAiIssueScoutOrder(unit,job);
    if((job.objectiveCity||job.objectiveHex) && ['main','armor','raid'].includes(job.kind))return wodAiIssueCoordinatedAssault(unit,job);

    const attackGoal=job.strikeHex||job.attackHex;
    if(['main','armor','raid','encircle','strike'].includes(job.kind)&&attackGoal){
        const plan=gameData.aiTaskForces?.[unit.owner],members=wodAiAssaultMembers(unit.owner,job,plan);
        const force=wodAiAssaultBalance(unit.owner,members,attackGoal);
        if(!force.ready){
            job.waitingForStrength=true;
            const hold=wodAiDefendStandHex(unit.owner,job.holdHex||getNearestHexToPoint(unit.x,unit.y),unit);
            if(hold)wodAiMoveUnitTowardHex(unit,hold,true,.45);
            return true;
        }
        job.waitingForStrength=false;
    }
    if(job.kind === 'support') {
        let plan = gameData.aiTaskForces?.[unit.owner];
        let leaders = wodAiKnownEntities(unit.owner).filter(u=>u.owner===unit.owner && u.hp>0 && plan?.unitJob[u.uid]===job.escortJobId);
        let anchor = job.holdHex;
        if(leaders.length) {
            let x=leaders.reduce((n,u)=>n+u.x,0)/leaders.length, y=leaders.reduce((n,u)=>n+u.y,0)/leaders.length;
            let aim=plan.jobs.find(j=>j.id===job.escortJobId)?.attackHex || job.attackHex;
            let dx=(aim?.x ?? x+1)-x, dy=(aim?.y ?? y)-y, len=Math.max(1,Math.hypot(dx,dy));
            let side=(String(unit.uid).charCodeAt(String(unit.uid).length-1)%2)*2-1;
            anchor=getNearestHexToPoint(x-dx/len*hr*3-dy/len*hr*2*side,y-dy/len*hr*3+dx/len*hr*2*side);
            // Screens stay on secured ground and protect the supply corridor behind the spearhead.
            if(!anchor || !wodIsFriendlyOwner(anchor.owner,unit.owner) || isWaterHex(anchor)) {
                anchor=job.holdHex;
                for(let p of getHexesInRadius(getNearestHexToPoint(x,y)?.q||0,getNearestHexToPoint(x,y)?.r||0,4)) {
                    let h=wodHexAt(p.q,p.r);
                    if(h && h.owner===unit.owner && isClaimableLand(h) && (!anchor || wodAiDist2(h.x,h.y,x,y)<wodAiDist2(anchor.x,anchor.y,x,y))) anchor=h;
                }
            }
        }
        if(!anchor) return false;
        let moved=wodAiMoveUnitTowardHex(unit,anchor,true,0.6);
        if(moved) wodAiStampOrder(unit,true,anchor);
        return moved;
    }
    if(['armor', 'marine', 'naval'].includes(job.kind)) {
        let target = null;
        if(job.objective && wodAiOperationTime() - (job.objectiveAt || 0) < 3000) {
            target = job.objective;
        } else if(job.kind === 'armor') {
            // Spearheads hunt hostile combat units instead of being absorbed into the line.
            let enemies = wodAiKnownEntities(unit.owner).filter(u => u.hp > 0 && u.type !== 'convoy' && u.type !== 'ship' && wodIsHostileOwner(u.owner, unit.owner));
            enemies.sort((a,b) => (wodAiDist2(unit.x,unit.y,a.x,a.y)*(0.5+a.hp/a.maxHp)) - (wodAiDist2(unit.x,unit.y,b.x,b.y)*(0.5+b.hp/b.maxHp)));
            target = enemies[0] || job.attackHex;
        } else if(job.kind === 'marine') {
            let towns = wodAiKnownCities(unit.owner).filter(c => wodIsHostileOwner(c.owner, unit.owner) && cityHasWaterNeighbor(c));
            towns.sort((a,b) => wodAiDist2(unit.x,unit.y,a.x,a.y)-wodAiDist2(unit.x,unit.y,b.x,b.y));
            target = towns[Math.abs(job.id.charCodeAt(job.id.length-1)) % Math.max(1,towns.length)] || job.attackHex;
        } else {
            let ships = wodAiKnownEntities(unit.owner).filter(u => u.type === 'ship' && u.hp > 0 && wodIsHostileOwner(u.owner,unit.owner));
            ships.sort((a,b) => wodAiDist2(unit.x,unit.y,a.x,a.y)-wodAiDist2(unit.x,unit.y,b.x,b.y));
            target = ships[0];
            if(!target) {
                let waters = [];
                for(let c of wodAiKnownCities(unit.owner)) {
                    if(!wodIsHostileOwner(c.owner, unit.owner)) continue;
                    for(let pt of getHexesInRadius(c.q,c.r,6)) {
                        let h = wodHexAt(pt.q,pt.r);
                        if(h && isWaterHex(h)) waters.push(h);
                    }
                }
                if(!waters.length) {
                    // Bound quiet-sea patrol search; never sort the whole ocean per ship.
                    let stride = Math.max(1, Math.floor(gameData.hexList.length/180));
                    const seenCoast = wodFogActive() ? wodFogFactionIntel(unit.owner).explored : null;
                    for(let i=0; i<gameData.hexList.length; i+=stride) {
                        let h = gameData.hexList[i];
                        if(isWaterHex(h) && getNeighborHexes(h).some(n=>!isWaterHex(n)&&(!seenCoast||seenCoast.has(getHexKey(n)))&&wodIsHostileOwner(n.owner,unit.owner))) waters.push(h);
                    }
                }
                waters.sort((a,b) => wodAiDist2(unit.x,unit.y,a.x,a.y)-wodAiDist2(unit.x,unit.y,b.x,b.y));
                target = waters[(parseInt(job.id.split('-').pop(),10) * 7) % Math.max(1,Math.min(60,waters.length))];
            }
        }
        if(!target) return false;
        // Cache a shared objective per group; orders still use terrain-aware paths and slot offsets.
        if(!job.objective || wodAiOperationTime() - (job.objectiveAt || 0) > 3000) {
            job.objective = {x:target.x, y:target.y}; job.objectiveAt = wodAiOperationTime();
        }
        let hex = getNearestHexToPoint(job.objective.x, job.objective.y);
        if(!hex || (job.kind === 'naval' && !isWaterHex(hex))) return false;
        let moved = wodAiMoveUnitTowardHex(unit, hex, false, 0.65);
        if(moved) wodAiStampOrder(unit, false, hex);
        return moved;
    }

    if(job.kind === 'defend' && (job.city || job.fort)) {
        let t = job.city || job.fort;
        let stand = job.city ? wodHexAt(t.q,t.r) : wodAiDefendStandHex(unit.owner,t,unit);
        stand = stand || wodHexAt(t.q,t.r);
        if(!stand) stand = { x: t.x, y: t.y, q: t.q, r: t.r };
        if(job.fort) unit.aiFortGuard = job.fort.id;
        let near = wodAiDist2(unit.x, unit.y, stand.x, stand.y) < Math.pow(hr * 2.4, 2);
        let moved = wodAiMoveUnitTowardHex(unit, stand, near, job.city ? 0 : near ? 0.28 : 0.45);
        if(moved) wodAiStampOrder(unit, near, stand);
        return moved;
    }

    if((job.kind === 'encircle' || job.kind === 'raid') && job.strikeHex) {
        let moved = wodAiMoveUnitTowardHex(unit, job.strikeHex, false, 0.4);
        if(moved) {
            unit.aiHoldStartAt = 0;
            wodAiStampOrder(unit, false, job.strikeHex);
        }
        return moved;
    }

    if(job.kind === 'strike' && job.strikeHex) {
        unit.aiCityStriker = true;
        let moved = wodAiMoveUnitTowardHex(unit, job.strikeHex, false, 0.5);
        if(moved) wodAiStampOrder(unit, false, job.strikeHex);
        return moved;
    }

    if(job.kind === 'reserve' && job.holdHex) {
        let dx = job.attackHex.x - job.holdHex.x;
        let dy = job.attackHex.y - job.holdHex.y;
        let len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        let slot = wodAiUnitSlotOffset(unit, job.holdHex, 1.1);
        let rx = job.holdHex.x - (dx / len) * hr * 3.4 + slot.ox;
        let ry = job.holdHex.y - (dy / len) * hr * 3.4 + slot.oy;
        let moved = wodAiMoveUnitToward(unit, rx, ry, true);
        if(moved) wodAiStampOrder(unit, true, job.holdHex);
        return moved;
    }

    if(!job.holdHex || !job.attackHex) return false;
    let assignment = {
        holdHex: job.holdHex,
        attackHex: job.attackHex,
        support: countNearbyUnits(unit.owner, job.holdHex.x, job.holdHex.y, 190),
        enemies: countNearbyUnits(unit.owner, job.holdHex.x, job.holdHex.y, 210, true)
    };

    if(job.kind === 'hold') {
        if(wodAiIssueFrontAdvance(unit,job))return true;
        {
            const cover=wodAiDefendStandHex(unit.owner,job.holdHex,unit)||job.holdHex;
            const covered=wodAiMoveUnitTowardHex(unit,cover,true,.12);
            if(covered)wodAiStampOrder(unit,true,cover);
            return covered;
        }
    }

    if(job.kind === 'raid') {
        let dx = assignment.attackHex.x - assignment.holdHex.x;
        let dy = assignment.attackHex.y - assignment.holdHex.y;
        let len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        let slot = wodAiUnitSlotOffset(unit, assignment.holdHex, 1.05);
        let depth = 2.5;
        let moved = wodAiMoveUnitToward(unit,
            assignment.holdHex.x + (dx / len) * hr * depth + slot.ox * 0.4,
            assignment.holdHex.y + (dy / len) * hr * depth + slot.oy * 0.4,
            false);
        if(moved) {
            unit.aiHoldStartAt = 0;
            wodAiStampOrder(unit, false, assignment.holdHex);
        }
        return moved;
    }

    if(job.kind === 'main' && job.attackHex) {
        let fight = wodAiSectorFightStats(unit.owner, job.holdHex || job.attackHex);
        let badlyOut = fight.localRatio < 0.85 && fight.enemies > fight.support && hpRatio < 0.9;
        if(!badlyOut) {
            let moved = wodAiMoveUnitTowardHex(unit, job.attackHex, false, 1.15);
            if(moved) {
                unit.aiHoldStartAt = 0;
                wodAiStampOrder(unit, false, job.attackHex);
            }
            return moved;
        }
    }

    let prevHold = unit.aiHoldStartAt;
    if(job.kind === 'main' && unit.aiHoldStartAt && wodAiOperationTime() - unit.aiHoldStartAt > 4000)
        unit.aiHoldStartAt = wodAiOperationTime() - 15000;
    let ok = wodAiIssueSectorOrder(unit, assignment, hpRatio);
    if(!ok && prevHold) unit.aiHoldStartAt = prevHold;
    return ok;
}

function assignAiFormationOrders(owner, units, serial) {
    // The field command holds every land unit this pass would plan for: nothing to do.
    if(wodOpsCommandsAll(typeof owner==='number'?owner:parseInt(owner,10),units))return true;
    const setupAt=performance.now();
    const leasedOut=!wodOpsTune(owner).planLeased,leaseNow=wodAiOperationTime();
    let readyUnits = units
        .filter(unit => unit.type !== 'convoy' && unit.hp > unit.maxHp * 0.42 && !unit.moraleBroken && !unit.retreating && !(leasedOut && unit._opsUntil > leaseNow))
        .sort((a, b) => {
            ensureUnitId(a);
            ensureUnitId(b);
            let ia = a.target ? 1 : 0, ib = b.target ? 1 : 0;
            if(ia !== ib) return ia - ib;
            return (a.uid || '').localeCompare(b.uid || '');
        });
    if(readyUnits.length === 0) return true;

    let oid = typeof owner === 'number' ? owner : parseInt(owner, 10);
    let chunkKey = oid + ':' + serial;
    let ch = gameData._aiFormChunk;
    if(!ch || ch.key !== chunkKey) {
        let plan = wodAiEnsureTaskForcePlan(oid, units);
        if(!plan || !plan.jobs || !plan.jobs.length) return true;
        ch = gameData._aiFormChunk = {
            key: chunkKey,
            readyUnits,
            plan,
            oid,
            serial,
            idx: 0
        };
    }

    let t0 = performance.now();
    let budgetMs = wodUsesVisualViewportLayout() ? 1.45 : 3.1;
    if(t0-setupAt>=budgetMs)return false;
    let idleN = 0;
    for(let iu = ch.idx; iu < ch.readyUnits.length; iu++) if(!ch.readyUnits[iu].target) idleN++;
    let maxUnits = (wodUsesVisualViewportLayout() ? 4 : 7) + Math.min(8, idleN >> 2);
    wodPfSpentMs = 0;
    if(gameData.bridges && gameData.bridges.length)
        wodPfBudgetMs = Math.max(wodPfBudgetMs || 0, 18);
    let assigned = 0;
    while(ch.idx < ch.readyUnits.length && assigned < maxUnits) {
        if(performance.now() - t0 >= budgetMs) break;
        let unit = ch.readyUnits[ch.idx++];
        if(['transport','supply'].includes(unit?.type)||unit?.boardTransportUid||unit?._navalAssaultUntil>wodAiOperationTime()||unit?._navalEscortUntil>wodAiOperationTime())continue;
        if(wodAiShouldKeepCurrentOrder(unit)) continue;
        let job = wodAiGetUnitTaskJob(unit);
        if(!job && ch.plan && ch.plan.jobs.length) {
            // Safety: assign to underfilled main/hold.
            job = ch.plan.jobs.find(j => j.kind === 'main') || ch.plan.jobs[0];
            if(job) {
                ensureUnitId(unit);
                ch.plan.unitJob[unit.uid] = job.id;
                unit.aiTfJobId = job.id;
                unit.aiTfKind = job.kind;
                unit.aiTfRole = job.role;
            }
        }
        if(!job) continue;
        wodAiIssueTaskForceOrder(unit, job, unit.hp / unit.maxHp);
        assigned++;
    }
    if(ch.idx >= ch.readyUnits.length) {
        gameData._aiFormChunk = null;
        return true;
    }
    return false;
}

function wodAiSetOperationStage(owner,op,stage,reason) {
    if(op.stage===stage&&op.reason===reason)return;
    op.stage=stage;op.reason=reason;op.stageAt=wodAiOperationTime();
    wodAiRecord(owner,'operation-stage',{job:op.id,stage,reason});
}

function wodAiUpdateOperation(owner,job,members,goal,plan,balance) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,key=goal.id||getHexKey(goal);
    const operations=plan.landOperations||=( {} );
    let op=operations[key];
    if(!op||op.stage==='complete')op=operations[key]={id:key,stage:job.phase==='assault'?'attack':'assemble',stageAt:now,rally:job.holdHex,roster:members.length};
    const signature=members.map(u=>u.uid+':'+Math.ceil(u.hp/10)+':'+Math.round(u.x/hr)+','+Math.round(u.y/hr)).join('|')+':'+balance.maintain;
    if(op.checkedAt!=null&&now-op.checkedAt<900&&op.signature===signature)return op;
    op.checkedAt=now;op.signature=signature;op.roster=members.length;
    const completed=job.cutHexes?.length?job.cutHexes.every(k=>wodIsFriendlyOwner(gameData.hexes[k]?.owner,owner)):job.objectiveCity?getCityUrbanTerrainHexes(job.objectiveCity).every(h=>wodIsFriendlyOwner(h.owner,owner)):wodIsFriendlyOwner(goal.owner,owner);
    if(completed){
        if(!job.objectiveCity&&!job.cutoff){wodAiSetOperationStage(owner,op,'complete','sector-advance');}
        else if(op.stage!=='consolidate')wodAiSetOperationStage(owner,op,'consolidate','secure-captured-ground');
        else if(now-op.stageAt>=6000){wodAiSetOperationStage(owner,op,'complete','garrison-handoff');plan.expireAt=0;plan.simBuiltAt=now-240001;}
    }else if(['attack','secure-approach','protect-flanks'].includes(op.stage)&&wodAiOperationMustRecover(op,members,balance,now)){
        wodAiSetOperationStage(owner,op,'recover','strength-or-supply-risk');op.recoverUntil=now+10000;
        const strategy=wodAiBattlePlan(owner),prior=strategy.failures[key]||{};strategy.failures[key]={at:now,count:(prior.count||0)+1};
    }else if(op.stage==='recover'){
        if(now>=op.recoverUntil&&(balance.strategicReady??balance.ready)){op.approach=wodAiCohortAnchor(owner,members,goal)||op.rally||job.holdHex;wodAiSetOperationStage(owner,op,'secure-approach','recovered-in-place');}
    }else if(op.stage==='assemble'){
        const gathered=members.filter(u=>Math.hypot(u.x-(job.holdHex||u).x,u.y-(job.holdHex||u).y)<hr*7||Math.hypot(u.x-goal.x,u.y-goal.y)<hr*7);
        const required=Math.max(balance.threats?2:1,Math.ceil(op.roster*(now-op.stageAt>18000?.6:.8)));
        const line=plan.jobs.filter(j=>j.kind==='hold').reduce((n,j)=>n+j.members.length,0),reserve=plan.jobs.filter(j=>j.kind==='reserve').reduce((n,j)=>n+j.members.length,0);
        const towns=gameData.cities.filter(c=>c.owner===owner),known=wodAiThreats(owner,false);
        const guarded=towns.every(c=>gameData.entities.some(u=>u.owner===owner&&u.type==='light'&&u.hp>0&&!u.boardTransportUid&&Math.hypot(u.x-c.x,u.y-c.y)<hr*5));
        const emergency=known.some(e=>towns.some(c=>Math.hypot(e.x-c.x,e.y-c.y)<(e.range||50)+hr*3));
        const defenseReady=!plan.defenseDemand||line>=plan.defenseDemand.line&&reserve>=plan.defenseDemand.reserve||guarded&&!emergency&&now-op.stageAt>=8000;
        if(gathered.length>=required&&defenseReady&&wodAiAssaultBalance(owner,gathered,goal).strategicReady){
            op.rally=job.holdHex||getNearestHexToPoint(gathered[0].x,gathered[0].y);
            op.approach=op.rally;
            const lead=gathered[0],reach=wodAiOperationReach(lead),dx=goal.x-op.rally.x,dy=goal.y-op.rally.y,len=Math.hypot(dx,dy)||1;
            for(let step=1;step<=4;step++){
                const h=getNearestHexToPoint(op.rally.x+dx/len*hr*step,op.rally.y+dy/len*hr*step);
                if(!h||isWaterHex(h)||!wodIsFriendlyOwner(h.owner,owner)||!reach.has(getHexKey(h))||!wodCurrentSupplyComponent(h,owner).city)break;
                op.approach=h;
            }
            wodAiSetOperationStage(owner,op,'secure-approach','assembled-with-defense-reserve');
        }
    }else if(op.stage==='secure-approach'){
        const approachForce=members.filter(u=>Math.hypot(u.x-op.approach.x,u.y-op.approach.y)<hr*7);
        if(approachForce.length>=Math.ceil(members.length*(now-op.stageAt>18000?.6:.8))&&wodAiAssaultBalance(owner,approachForce,goal).strategicReady){
            op.screenIds=members.filter(u=>['light','mountaineer'].includes(u.type)&&!u.isGeneral).slice(-Math.min(members.length>=8?2:members.length>=5?1:0)).map(u=>u.uid);
            if(members.length<5)op.screenIds=[];
            wodAiSetOperationStage(owner,op,'protect-flanks','approach-secured');
        }
    }else if(op.stage==='protect-flanks'&&now-op.stageAt>=2000){
        if(balance.strategicReady){op.commitUntil=now+20000;wodAiSetOperationStage(owner,op,'attack','flanks-screened');}
        // Keep deploying together when a forward regiment lacks immediate
        // support. A strategically viable army need not restart its assembly.
    }
    op.assaultKind=job.cutoff||job.cutHexes?.length?'supply-cut':null;
    if(op.stage==='attack')wodAiUpdateAssaultBudget(owner,op,members,goal,wodAiThreats(owner).filter(e=>Math.hypot(e.x-goal.x,e.y-goal.y)<hr*8),true);
    else if(op.assaultBudget)op.assaultBudget.active=false;
    const linked=plan.jobs.filter(j=>j===job||job.objectiveCity&&j.objectiveCity?.id===goal.id||!job.objectiveCity&&j.objectiveHex&&getHexKey(j.objectiveHex)===key);
    for(const j of linked){j.stage=op.stage;j.stageReason=op.reason;j.operationState=op;j.phase=['assemble','recover'].includes(op.stage)?'assemble':'assault';j.waitingForStrength=['assemble','recover'].includes(op.stage);}
    // Remove retired history without discarding an active operation.
    if(Object.keys(operations).length>32)for(const k of Object.keys(operations))if(k!==key&&['complete','consolidate'].includes(operations[k].stage))delete operations[k];
    return op;
}

// A separated vanguard handles its own tactical fallback. Only sustained army
// weakness or a corridor threatening a substantial part of the force recalls it all.
function wodAiOperationMustRecover(op,members,balance,now) {
    const cut=members.filter(u=>wodAiCorridorWithdrawal(u)).length;
    const unsafe=!(balance.strategicMaintain??balance.maintain)||cut>=Math.max(2,Math.ceil(members.length*.4));
    if(!unsafe){op.riskSince=null;return false;}
    op.riskSince??=now;
    return cut>=Math.max(2,Math.ceil(members.length*.4))||balance.forecast?.ratio<.7||now-op.riskSince>=4500;
}

function wodAiOperationScreenHex(unit,op,goal,members) {
    const hr=gameData.hexRadius||20,anchor=op.approach||op.rally||getNearestHexToPoint(unit.x,unit.y);
    const advancing=members.filter(u=>!op.screenIds?.includes(u.uid));
    const cx=advancing.reduce((n,u)=>n+u.x,0)/Math.max(1,advancing.length),cy=advancing.reduce((n,u)=>n+u.y,0)/Math.max(1,advancing.length);
    const dx=goal.x-anchor.x,dy=goal.y-anchor.y,len=Math.hypot(dx,dy)||1,side=(op.screenIds?.indexOf(unit.uid)||0)%2?-1:1;
    const x=cx-dx/len*hr*3-dy/len*hr*2*side,y=cy-dy/len*hr*3+dx/len*hr*2*side;
    const center=getNearestHexToPoint(x,y),reach=wodAiOperationReach(unit);
    if(!center)return anchor;
    const points=getHexesInRadius(center.q,center.r,3).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&!isWaterHex(h)&&wodIsFriendlyOwner(h.owner,unit.owner)&&reach.has(getHexKey(h))&&canUnitEnterHex(unit,h)&&wodCurrentSupplyComponent(h,unit.owner).city);
    points.sort((a,b)=>wodAiDist2(a.x,a.y,x,y)-wodAiDist2(b.x,b.y,x,y));return points[0]||anchor;
}

function wodAiUpdateAssaultBudget(owner,host,members,goal,foes=[],start=false) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,h=goal&&getNearestHexToPoint(goal.x,goal.y);
    if(!h||!members.length)return null;
    const key=goal.id||getHexKey(h),policy=wodAiObjectiveRisk(owner,goal,host);
    let b=host.assaultBudget;
    const currentHp=members.reduce((n,u)=>n+u.hp,0),maximum=members.reduce((n,u)=>n+u.maxHp,0);
    const renewed=b&&now-b.at>45000&&currentHp>b.initialHp*1.25;
    if(start&&(!b||b.hexes!==gameData.hexes||b.key!==key||renewed)&&members.length>=3&&currentHp>=maximum*.58){
        b=host.assaultBudget={hexes:gameData.hexes,key,at:now,progressAt:now,until:now+22000,policy,
            initialHp:currentHp,roster:new Map(members.map(u=>[u.uid,{hp:u.hp,min:u.hp}])),enemies:new Map(),land:new Set(),distance:Infinity,loss:0,active:true};
        wodAiRecord(owner,'assault-committed',{job:host.id,kind:policy.kind,troops:members.length,budget:policy.lossBudget});
    }
    if(!b||b.hexes!==gameData.hexes||b.key!==key)return null;
    const alive=new Map(gameData.entities.filter(u=>u.owner===owner&&u.hp>0).map(u=>[u.uid,u]));
    for(const [id,entry]of b.roster)entry.min=Math.min(entry.min,alive.get(id)?.hp||0);
    b.loss=[...b.roster.values()].reduce((n,e)=>n+e.hp-e.min,0)/Math.max(1,b.initialHp);
    const distances=members.map(u=>Math.hypot(u.x-goal.x,u.y-goal.y)).sort((a,b)=>a-b).slice(0,Math.min(3,members.length));
    const distance=distances.reduce((n,d)=>n+d,0)/distances.length;
    let progress=distance<b.distance-hr*.6;
    if(progress)b.distance=distance;
    for(const p of getHexesInRadius(h.q,h.r,3)){
        const cell=gameData.hexes[p.q+','+p.r],k=cell&&getHexKey(cell);
        if(cell&&!isWaterHex(cell)&&wodIsFriendlyOwner(cell.owner,owner)&&!b.land.has(k)){if(b.land.size)progress=true;b.land.add(k);}
    }
    for(const e of foes.filter(e=>!e._intelMemory)){
        const old=b.enemies.get(e.uid);
        if(old!=null&&e.hp<old-Math.max(2,e.maxHp*.04)){progress=true;b.enemies.set(e.uid,e.hp);}
        else if(old==null)b.enemies.set(e.uid,e.hp);
    }
    if(progress)b.progressAt=now;
    b.until=Math.min(b.at+150000,b.progressAt+22000);
    b.active=now<b.until&&b.loss<b.policy.lossBudget;
    return b;
}

function wodAiUnitAssaultBudget(unit,job=wodAiGetUnitTaskJob(unit)) {
    const op=job?.frontOperation||job?.operationState||(unit._navalLanded?unit._aiBeachheadPlan:null),host=op?.joint?.until>wodAiOperationTime()?op.joint:op,b=host?.assaultBudget;
    if(!b?.active||b.hexes!==gameData.hexes||b.until<=wodAiOperationTime()||!b.roster.has(unit.uid)||
        !['advance','attack'].includes(op.phase||op.stage)||unit.retreating||unit.moraleBroken||unit._medicalRecovering)return null;
    return b;
}

function wodAiCanFinishAssault(owner,op,army) {
    const now=wodAiOperationTime(),host=op.joint?.until>now?op.joint:op,b=host.assaultBudget,goal=op.strategicGoal||op.goal,hr=gameData.hexRadius||20;
    if(army.length!==2||!goal||!b?.active||b.until<=now||!['town','supply-cut'].includes(b.policy.kind)||
        army.some(u=>!b.roster.has(u.uid)||u.hp<u.maxHp*.35||u.retreating||u.moraleBroken||u._medicalRecovering||
            Math.hypot(u.x-goal.x,u.y-goal.y)>hr*8||!wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city))return false;
    const foes=wodAiThreats(owner).filter(e=>!wodIsNavalUnit(e)&&Math.hypot(e.x-goal.x,e.y-goal.y)<hr*8);
    return foes.length<=2&&wodAiForecast(owner,army,foes).ratio>=.9;
}

function wodAiBattlePlan(owner, army, force = false) {
    gameData.aiBattlePlans ||= {};
    const now = wodAiOperationTime(), stored = gameData.aiBattlePlans[owner];
    const previous=stored?.hexes===gameData.hexes?stored:null;
    if (!force && previous?.hexes === gameData.hexes && now >= previous.at && now-previous.at < 5000) return previous;
    const troops = gameData.entities.filter(u=>u.owner===owner).flatMap(u=>u.cargo?[u,u.cargo]:[u]).filter(u => u.hp > 0 && u.type !== 'convoy');
    const cities = wodAiKnownCities(owner).filter(c => c.owner === owner), profile = wodAiCommander(owner);
    const threats = wodAiThreats(owner), hr = gameData.hexRadius || 20;
    const ground = troops.filter(u => isLandArmyUnit(u) && !u.boardTransportUid);
    const pressure = threats.filter(e => cities.some(c => Math.hypot(c.x-e.x,c.y-e.y) < hr*12));
    const ownPower = ground.reduce((n,u) => n+wodAiUnitCombatPower(u),0);
    const enemyPower = threats.filter(u => !wodIsNavalUnit(u)).reduce((n,u) => n+wodAiUnitCombatPower(u),0);
    const oldHealth = previous?.health || {}, health = Object.fromEntries(troops.map(u => [u.uid,u.hp]));
    const alive=new Set(gameData.entities.flatMap(u=>u.cargo?[u.uid,u.cargo.uid]:[u.uid]));
    const recentLoss = troops.reduce((n,u) => n+Math.max(0,(oldHealth[u.uid] || u.hp)-u.hp),0)+
        Object.entries(oldHealth).reduce((n,[uid,hp])=>n+(alive.has(uid)?0:hp),0);
    const lossPressure=recentLoss+(previous?.lossPressure||0)*Math.exp(-Math.max(0,now-(previous?.at||now))/45000);
    const recovering = ground.filter(u => u._medicalRecovering || u.hp/u.maxHp < .6).length;
    const advantage = ownPower / Math.max(2,enemyPower);
    const danger = pressure.reduce((n,u) => n+wodAiUnitCombatPower(u),0) / Math.max(2,ownPower);
    const maximumHealth=ground.reduce((n,u)=>n+u.maxHp,0),ready=ground.filter(u=>!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&u.hp>=u.maxHp*.55).length;
    const exhausted=recovering>ground.length*.55||lossPressure>Math.max(450,maximumHealth*.38)&&ready<ground.length*.65;
    const intent = danger > .7 ? 'defend' : exhausted ? 'recover' :
        advantage < .8 && threats.length ? 'maneuver' : profile.id === 'maneuver' ? 'maneuver' : 'attack';
    const defenseShare = Math.min(.54, Math.max(.16, profile.defense-.08 + (intent==='defend'?.16:0) +
        (intent==='recover'?.08:0) - (advantage>1.7?.04:0)));
    const reserveShare = ground.length >= 10 ? (profile.id==='defensive' || pressure.length ? .10 : .05) : 0;
    const plan = {owner, at:now, hexes:gameData.hexes, profile:profile.id, intent, advantage, danger,
        ownPower, enemyPower, defenseShare, reserveShare, recovering, pressure:pressure.length, health,
        recentLoss,lossPressure, failures:Object.fromEntries(Object.entries(previous?.failures||{}).filter(([,f])=>now-f.at<180000).slice(-128)), primaryId:previous?.primaryId || null,
        lastHospitalCheck:previous?.lastHospitalCheck,
        requests:previous?.requests || {}, income:getOwnerIncome(owner)};
    gameData.aiBattlePlans[owner] = plan;
    return plan;
}

function wodAiDesiredGroundScouts(owner,ready) {
    if(!wodFogActive())return 0;
    const troops=ready.filter(u=>isLandArmyUnit(u)&&u.type!=='marine'&&!u.boardTransportUid&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&u.hp>u.maxHp*.62).length;
    // Small armies discover the next bound together. Once a town is known,
    // spare infantry should reinforce that advance instead of patrolling home.
    if(wodAiKnownCities(owner).some(c=>wodIsHostileOwner(c.owner,owner)))return troops>=24?1:0;
    return troops>=18?2:troops>=8?1:0;
}

// Every tactical consumer resolves the same mission. Emergency loans suspend
// the offensive without changing a regiment's permanent group or home front.
function wodAiResolveMission(unit,plan) {
    const base=plan.jobs.find(j=>j.id===(plan.unitJob[unit.uid]||unit.aiTfJobId));
    const defense=gameData._aiDefenseByOwner?.[unit.owner],response=defense?.jobs.find(j=>j.id===defense.unitJob[unit.uid]);
    const offensive=wodAiFrontOffensiveJob(unit,plan,response);
    let job=base?.city||base?.fort?base:offensive||response||base;
    const now=wodAiOperationTime(),previous=unit._aiMission;
    if(previous&&previous.until>now&&!base?.city&&!base?.fort&&!(response&&['hold','reserve','support'].includes(base?.kind))&&!unit._medicalRecovering&&!unit.retreating&&!unit.moraleBroken&&!(unit._navalAssaultUntil>now)&&!wodAiFrontCritical(response,unit)&&job?.id!==previous.id){
        const committed=[...plan.jobs,...wodAiActiveFrontOperations(unit.owner).flatMap(op=>op.jobs||[])].find(j=>j.id===previous.id&&j.members?.includes(unit.uid));
        if(committed?.frontOperation&&committed.frontOperation.until>now&&
            (committed.frontOperation===job?.frontOperation||!job?.frontOperation))job=committed;
    }
    return job||null;
}

// Looking up a role is read-only: movement, forecasts and telemetry all query
// it. Only the controller actually dispatching an order may change its lease.
function wodAiCommitMission(unit,job,kind) {
    const now=wodAiOperationTime();
    kind=kind||(unit._medicalRecovering?'recovery':unit._navalAssaultUntil>now?'naval':job?.frontOperation?'offensive':job?.response?'defense':job?.kind);
    const id=kind==='recovery'?'recovery':kind==='naval'?(unit._aiFleetId||unit._aiMarineRaid||job?.id||'naval'):job?.id;
    if(!id)return;
    if(unit._aiMission?.id!==id||unit._aiMission?.kind!==kind){
        const base=gameData.aiTaskForces?.[unit.owner]?.unitJob[unit.uid];
        unit._aiMission={id,kind,at:now,until:now+(job?.frontOperation?20000:kind==='defense'?6000:10000),front:wodAiFrontOwner(unit),base};
        // Medical/naval controllers already own their path. Recording that
        // ownership must not discard the route they just queued.
        if(!['recovery','naval'].includes(kind)){unit.aiOrderUntil=0;unit.aiOrderResponseId='mission-change';gameData._aiMoveQueue?.delete(unit);}
        wodAiRecord(unit.owner,'mission-assigned',{unit:unit.uid,mission:id,kind,base});
    }
}

function wodAiIssueGeneralOrder(unit, job) {
    if (unit._medicalRecovering || unit.retreating) return true;
    const now=wodAiOperationTime(), hr=gameData.hexRadius||20, radius=wodFortCombatAuraRadiusPx();
    const plan=gameData.aiTaskForces?.[unit.owner];
    const fighters=gameData.entities.filter(u=>u!==unit&&u.owner===unit.owner&&u.hp>u.maxHp*.4&&
        !u.retreating&&!u.moraleBroken&&!u.boardTransportUid&&!u._medicalRecovering&&!wodIsNavalUnit(u)&&u.type!=='convoy');
    let partners=fighters.filter(u=>plan?.unitJob[u.uid]===job.id);
    if(!partners.length)partners=fighters.filter(u=>!['defend','scout'].includes(u.aiTfKind))
        .sort((a,b)=>wodAiDist2(a.x,a.y,unit.x,unit.y)-wodAiDist2(b.x,b.y,unit.x,unit.y)).slice(0,5);
    const local=partners.filter(u=>Math.hypot(u.x-unit.x,u.y-unit.y)<hr*18);
    if(local.length)partners=local;
    const group=[unit,...partners], goal=job.objectiveCity||job.objectiveHex||job.attackHex||job.holdHex||unit;
    const threats=wodAiThreats(unit.owner,false).filter(e=>Math.hypot(e.x-unit.x,e.y-unit.y)<hr*12);
    const balance=wodAiAssaultBalance(unit.owner,group,goal);
    const closePartners=fighters.filter(u=>Math.hypot(u.x-unit.x,u.y-unit.y)<hr*7);
    const rear=gameData.cities.filter(c=>c.owner===unit.owner&&wodAiCanReach(unit,c)).sort((a,b)=>Math.hypot(a.x-unit.x,a.y-unit.y)-Math.hypot(b.x-unit.x,b.y-unit.y))[0];
    if(rear&&Math.hypot(rear.x-unit.x,rear.y-unit.y)>hr*9&&threats.length>=3&&
        wodAiForecast(unit.owner,[unit,...closePartners],threats).ratio<1.3&&closePartners.length<3&&
        wodCurrentSupplyComponent(getNearestHexToPoint(unit.x,unit.y),unit.owner).city){
        const hop=wodAiSupplyRetreatHop(unit,gameData._aiDefenseByOwner?.[unit.owner]);
        if(hop&&wodAiMoveUnitTowardHex(unit,hop,true,.05)){wodAiStampOrder(unit,true,hop,4500);unit._aiRegroupUntil=now+5000;wodAiRecord(unit.owner,'general-screen',{unit:unit.uid,reason:'exposed-without-infantry'});return true;}
    }

    const cx=partners.length?partners.reduce((n,u)=>n+u.x,0)/partners.length:unit.x;
    const cy=partners.length?partners.reduce((n,u)=>n+u.y,0)/partners.length:unit.y;
    const start=getNearestHexToPoint(unit.x,unit.y),center=getNearestHexToPoint(cx,cy),reach=wodAiOperationReach(unit);
    if(!start||!center)return false;
    const points=new Map();for(const at of [start,center])for(const p of getHexesInRadius(at.q,at.r,3)){
        const h=wodHexAt(p.q,p.r);if(h&&reach.has(getHexKey(h))&&!isWaterHex(h)&&canUnitEnterHex(unit,h))points.set(getHexKey(h),h);
    }
    let best=null,bestScore=-Infinity;
    for(const h of points.values()){
        if(h.owner!==unit.owner&&!balance.ready)continue;
        if(isWorldPositionBlockedByUnits(unit,h.x,h.y))continue;
        const allies=partners.reduce((n,u)=>n+(Math.hypot(h.x-u.x,h.y-u.y)<=radius*.92?wodAiUnitCombatPower(u):0),0);
        const incoming=threats.reduce((n,e)=>n+(Math.hypot(e.x-h.x,e.y-h.y)<(e.range||50)+hr?wodAiDpsAgainst(e,unit,unit.owner):0),0);
        const canFire=threats.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<unit.range*1.04);
        const terrain=wodAiUnitCombatPower(unit,h)/Math.max(.1,wodAiUnitCombatPower(unit,{type:'grass'}));
        const progress=(Math.hypot(unit.x-goal.x,unit.y-goal.y)-Math.hypot(h.x-goal.x,h.y-goal.y))/hr;
        const score=allies*10+terrain*3+(balance.ready&&canFire?18:0)+(balance.ready?progress:0)*1.5-
            Math.hypot(h.x-cx,h.y-cy)/hr*1.4-Math.hypot(h.x-unit.x,h.y-unit.y)/hr*.35-
            incoming*(balance.ready?1.8:6)*(unit.hp<unit.maxHp*.75?2:1);
        if(score>bestScore){best=h;bestScore=score;}
    }
    if(!best)return false;
    unit._aiGeneralAt=now;unit._aiGeneralSupport=partners.map(u=>u.uid);
    const holding=!balance.ready||Math.hypot(best.x-unit.x,best.y-unit.y)<hr;
    const moved=wodAiMoveUnitTowardHex(unit,best,holding,.05);
    if(moved){wodAiStampOrder(unit,holding,best,3500);unit.aiOrderPhase=job.phase;unit.aiOperationStage=job.stage;}
    return true;
}

// A visible enemy supply neck is a better objective than another frontal charge.
function wodAiCutObjective(owner,members) {
    const frontOwner=wodAiFrontOwner(members[0]);
    const lead=members.find(u=>!wodCanClimb(u))||members[0];if(!lead||members.length<2)return null;
    const hr=gameData.hexRadius||20,now=wodAiOperationTime(),context=wodAiCombatContext(owner);
    const enemies=wodAiThreats(owner,false).filter(u=>!wodIsNavalUnit(u)&&u.type!=='marine'&&(!frontOwner||u.owner===frontOwner));
    if(enemies.length<2)return null;
    const centers=enemies.slice().sort((a,b)=>wodAiDist2(a.x,a.y,lead.x,lead.y)-wodAiDist2(b.x,b.y,lead.x,lead.y));
    const center=centers[0],cluster=enemies.filter(e=>e.owner===center.owner&&Math.hypot(e.x-center.x,e.y-center.y)<hr*9);
    if(cluster.length<2)return null;
    const hostile=center.owner,towns=wodAiKnownCities(owner).filter(c=>c.owner===hostile),reach=wodAiOperationReach(lead);
    if(!towns.length)return null;
    const explored=wodFogActive()?wodFogFactionIntel(owner).explored:null;
    const pass=h=>wodSupplyPassable(h,hostile)&&(!explored||explored.has(getHexKey(h)));
    const roots=towns.flatMap(wodCitySupplySourceHexes).filter(pass);
    if(!roots.length)return null;
    const baseKey='cut-base:'+hostile;
    if(!context[baseKey]){
        const seen=new Set(roots.map(getHexKey)),queue=roots.slice();
        for(let i=0;i<queue.length;i++)wodSupplyNeighbors(queue[i],h=>{const k=getHexKey(h);if(!pass(h)||seen.has(k))return;seen.add(k);queue.push(h);});
        context[baseKey]=seen;
    }
    const connectedCluster=cluster.filter(e=>context[baseKey].has(getHexKey(getNearestHexToPoint(e.x,e.y))));
    if(connectedCluster.length<2)return null;
    const nearest=towns.slice().sort((a,b)=>wodAiDist2(a.x,a.y,center.x,center.y)-wodAiDist2(b.x,b.y,center.x,center.y))[0];
    const candidates=[];
    for(const h of gameData.hexList){
        if(!pass(h)||h.cityId||!reach.has(getHexKey(h))||!canUnitEnterHex(lead,h))continue;
        if(Math.hypot(h.x-center.x,h.y-center.y)>hr*16||Math.hypot(h.x-lead.x,h.y-lead.y)>hr*26)continue;
        // Behind the observed force, toward its city; do not route into its guns.
        const vx=nearest.x-center.x,vy=nearest.y-center.y,len=Math.hypot(vx,vy)||1;
        const behind=((h.x-center.x)*vx+(h.y-center.y)*vy)/len;
        if(behind<hr*2||behind>hr*14)continue;
        const width=cardinalHexDirections.filter(d=>pass(gameData.hexes[(h.q+d.q)+','+(h.r+d.r)])).length;
        if(width>3)continue;
        candidates.push({h,score:width*hr+Math.hypot(h.x-lead.x,h.y-lead.y)+Math.abs(behind-hr*5)});
    }
    candidates.sort((a,b)=>a.score-b.score);
    const sections=[],seenSections=new Set();
    const addSection=hs=>{const sig=hs.map(getHexKey).sort().join('|');if(!seenSections.has(sig)){seenSections.add(sig);sections.push(hs);}};
    for(const {h} of candidates.slice(0,14)){
        addSection([h]);
        for(const [dq,dr] of [[1,0],[0,1],[1,1],[1,-1]]){
            const line=[h];let valid=true;
            for(const sign of [-1,1]){
                let p=h,closed=false;
                for(let n=0;n<6;n++){
                    const next=gameData.hexes[(p.q+dq*sign)+','+(p.r+dr*sign)];
                    // A known coast closes a dry supply neck just as a
                    // friendly bank does. Unexplored ground is not a wall.
                    if(!pass(next)){closed=!next||(!explored||explored.has(getHexKey(next)))&&
                        (wodIsFriendlyOwner(next.owner,owner)||isWaterHex(next)&&!isBridgeHex(next));break;}
                    if(next.cityId||!canUnitEnterHex(lead,next)||!reach.has(getHexKey(next))){valid=false;break;}
                    if(sign<0)line.unshift(next);else line.push(next);p=next;
                }
                if(!closed)valid=false;
            }
            if(valid&&line.length>=2&&line.length<=6)addSection(line);
        }
    }
    let best=null;
    for(const cut of sections.slice(0,24)){
        // (too few troops for this cut: skip it before flooding the enemy's whole network without it)
        if(members.length<Math.min(6,cut.length+1))continue;
        const h=cut[Math.floor(cut.length/2)],key=owner+':cut:'+cut.map(getHexKey).join('|')+':'+connectedCluster.map(u=>u.uid).join(',');let isolated=context[key];
        if(isolated==null){
            const removed=new Set(cut.map(getHexKey)),seen=new Set(),queue=roots.filter(r=>!removed.has(getHexKey(r)));
            queue.forEach(r=>seen.add(getHexKey(r)));
            for(let i=0;i<queue.length;i++)wodSupplyNeighbors(queue[i],n=>{const k=getHexKey(n);if(!pass(n)||seen.has(k)||removed.has(k))return;seen.add(k);queue.push(n);});
            isolated=connectedCluster.filter(e=>!seen.has(getHexKey(getNearestHexToPoint(e.x,e.y)))).length;context[key]=isolated;
        }
        if(isolated<2||members.length<Math.min(6,cut.length+1)||!wodAiAssaultBalance(owner,members,h).ready)continue;
        const value=isolated*20-Math.hypot(h.x-lead.x,h.y-lead.y)/hr-cut.length*1.5;
        if(!best||value>best.value)best={h,cut,value,isolated};
    }
    if(!best)return null;
    const home=getNearestHexToPoint(lead.x,lead.y);
    return {objectiveHex:best.h,attackHex:best.h,holdHex:wodIsFriendlyOwner(home.owner,owner)?home:undefined,
        phase:'assemble',phaseAt:now,operationAt:now,cutoff:true,cutHexes:best.cut.map(getHexKey),cutoffTroops:best.isolated};
}

function wodAiReconObjective(owner,members) {
    if(!wodFogActive()||!members.length)return null;
    const lead=members.find(u=>!wodCanClimb(u))||members[0],reach=wodAiOperationReach(lead),intel=wodFogFactionIntel(owner),hr=gameData.hexRadius||20;
    if(wodAiKnownCities(owner).some(c=>wodIsHostileOwner(c.owner,owner)&&reach.has(c.q+','+c.r)))return null;
    const bearing=wodAiDiscoveryBearing(owner),front=wodCachedFrontlineHexes(owner),stride=Math.max(1,Math.ceil(front.length/80));
    const enemies=wodAiThreats(owner),choices=[],seen=new Set();
    for(let i=0;i<front.length;i+=stride){
        const edge=front[i];
        for(const p of getHexesInRadius(edge.q,edge.r,3)){
            const h=gameData.hexes[p.q+','+p.r],key=h&&getHexKey(h);
            if(!h||seen.has(key)||isWaterHex(h)||!canUnitEnterHex(lead,h)||!reach.has(key)||intel.visible.has(key))continue;
            seen.add(key);
            // Explore beyond a known hostile front, without inspecting hidden
            // city locations or hidden owners to choose the destination.
            if(!getHexesInRadius(h.q,h.r,2).some(p=>{const n=gameData.hexes[p.q+','+p.r];return n&&intel.explored.has(getHexKey(n))&&wodIsHostileOwner(n.owner,owner);}))continue;
            const gain=getNeighborHexes(h).filter(t=>!isWaterHex(t)&&!intel.explored.has(getHexKey(t))).length;
            if(gain<2)continue;
            const risk=enemies.filter(e=>Math.hypot(e.x-h.x,e.y-h.y)<hr*8).reduce((n,e)=>n+wodAiUnitCombatPower(e),0);
            const advance=((h.x-bearing.x)*bearing.dx+(h.y-bearing.y)*bearing.dy)/hr;
            choices.push({h,edge,score:Math.hypot(h.x-lead.x,h.y-lead.y)/hr*.25+risk*5-gain-advance*.25});
        }
    }
    choices.sort((a,b)=>a.score-b.score);
    const finalists=choices.slice(0,48);
    for(const candidate of finalists)candidate.score-=getHexesInRadius(candidate.h.q,candidate.h.r,4).reduce((n,p)=>{
        const t=gameData.hexes[p.q+','+p.r];return n+Number(!!t&&!isWaterHex(t)&&!intel.explored.has(getHexKey(t)));
    },0)*.22;
    finalists.sort((a,b)=>a.score-b.score);const best=finalists[0];
    return best&&{objectiveHex:best.h,attackHex:best.h,holdHex:best.edge,phase:'assemble',phaseAt:wodAiOperationTime(),operationAt:wodAiOperationTime(),recon:true};
}

function wodAiStructureObjective(owner,members,forwardGoal) {
    const hr=gameData.hexRadius||20,force=members.filter(u=>u.hp>u.maxHp*.55&&!u.retreating&&!u.moraleBroken&&!u._medicalRecovering&&!u.boardTransportUid&&!wodIsNavalUnit(u));
    if(!force.length)return null;
    const known=wodAiThreats(owner),choices=[];
    for(const s of wodAiKnownStructures(owner)){
        const hex=gameData.hexes[s.q+','+s.r];if(!hex||!wodIsHostileOwner(hex.owner,owner)||wodAiFrontOwner(force[0])&&hex.owner!==wodAiFrontOwner(force[0]))continue;
        const lead=force.slice().sort((a,b)=>Math.hypot(a.x-s.x,a.y-s.y)-Math.hypot(b.x-s.x,b.y-s.y))[0],distance=Math.hypot(lead.x-s.x,lead.y-s.y);
        if(distance>hr*14||!wodAiCanReach(lead,hex))continue;
        // Do not drag the whole army backwards after an irrelevant old fort.
        if(forwardGoal&&distance>hr*4&&(s.x-lead.x)*(forwardGoal.x-lead.x)+(s.y-lead.y)*(forwardGoal.y-lead.y)<-hr*hr*2)continue;
        const defenders=known.filter(e=>Math.hypot(e.x-s.x,e.y-s.y)<(e.range||50)+hr*4);
        const support=force.filter(u=>Math.hypot(u.x-lead.x,u.y-lead.y)<hr*7);
        if(defenders.length&&wodAiForecast(owner,support,defenders).ratio<1.12)continue;
        choices.push({...s,hex,score:distance/hr+defenders.length*4-(s.kind==='hospital'?3:2)});
    }
    choices.sort((a,b)=>a.score-b.score);return choices[0]||null;
}

function wodAiExploitTown(owner,job,members,plan) {
    const now=wodAiOperationTime();
    if(!members.length||job._townCheckAt!=null&&now-job._townCheckAt<4000)return;
    job._townCheckAt=now;
    if(job.objectiveStructure&&wodIsHostileOwner(job.objectiveHex?.owner,owner))return;
    const structure=wodAiStructureObjective(owner,members,job.objectiveCity||job.objectiveHex);
    if(structure){
        job.objectiveCity=null;job.objectiveHex=structure.hex;job.objectiveStructure=structure;job.attackHex=structure.hex;job.cutoff=false;job.cutHexes=null;job.operationState=null;job.recon=false;job.phase='assault';
        for(const u of members)u.aiOrderUntil=0;
        wodAiRecord(owner,'structure-opportunity',{job:job.id,kind:structure.kind,target:getHexKey(structure.hex)});return;
    }
    if(job.cutoff&&job.cutHexes?.some(k=>wodIsHostileOwner(gameData.hexes[k]?.owner,owner)))return;
    // Revisit real supply-cut opportunities when contact begins, including for
    // town assaults. Previously only newly chosen territory jobs tried this.
    if(members.length>=4&&(job._cutCheckAt==null||now-job._cutCheckAt>=10000)&&
        wodAiThreats(owner,false).some(e=>members.some(u=>Math.hypot(u.x-e.x,u.y-e.y)<(gameData.hexRadius||20)*16))){
        job._cutCheckAt=now;
        const cut=wodAiCutObjective(owner,members);
        if(cut?.holdHex&&wodAiAssaultBalance(owner,members,cut.objectiveHex).strategicReady){
            const previous=job.objectiveCity?.id||job.objectiveHex&&getHexKey(job.objectiveHex);
            job.objectiveCity=null;job.operationState=null;job.recon=false;Object.assign(job,cut);
            for(const u of members){u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}
            wodAiRecord(owner,'encirclement-opportunity',{job:job.id,from:previous,target:getHexKey(cut.objectiveHex),trapped:cut.cutoffTroops,width:cut.cutHexes.length});
            return;
        }
    }
    const next=wodAiAssaultObjective(owner,members,plan.sectors||[]);
    if(!next?.objectiveCity){
        if(!job.objectiveCity&&(!job.recon||!job.objectiveHex||wodFogFactionIntel(owner).visible.has(getHexKey(job.objectiveHex)))){
            const recon=wodAiReconObjective(owner,members);
            if(recon){Object.assign(job,recon);job.operationState=null;for(const u of members)u.aiOrderUntil=0;}
        }
        return;
    }
    if(next.objectiveCity.id===job.objectiveCity?.id)return;
    if(!wodAiAssaultBalance(owner,members,next.objectiveCity).ready)return;
    if(job.objectiveCity&&getCityUrbanTerrainHexes(job.objectiveCity).some(h=>!wodIsFriendlyOwner(h.owner,owner))&&
        wodAiObjectiveCost(owner,members,next.objectiveCity)>wodAiObjectiveCost(owner,members,job.objectiveCity)-10)return;
    const previous=job.objectiveCity?.id||job.objectiveHex&&getHexKey(job.objectiveHex);
    job.objectiveHex=null;job.cutoff=false;job.cutHexes=null;job.recon=false;job.operationState=null;
    Object.assign(job,next);job.stage='assemble';job.waitingForStrength=true;job.stalledAt=null;
    for(const u of members){u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}
    wodAiRecord(owner,'town-opportunity',{job:job.id,from:previous,city:next.objectiveCity.id,troops:members.length});
}

// Membership survives a medical rotation or a loan to a different front.
// Casualties and permanent town/fort garrison transfers free a squad slot.
function wodAiSquadRoster(owner,op) {
    const tick=gameData._wodSimTick||0,now=wodAiOperationTime();let index=gameData._aiLiveRoster;
    if(!index||index.hexes!==gameData.hexes||index.tick!==tick||index.now!==now||index.entities!==gameData.entities||index.n!==gameData.entities.length){
        index=gameData._aiLiveRoster={hexes:gameData.hexes,tick,now,entities:gameData.entities,n:gameData.entities.length,owners:new Map()};
        for(const hull of gameData.entities)for(const u of hull.cargo?[hull,hull.cargo]:[hull]){
            if(!index.owners.has(u.owner))index.owners.set(u.owner,new Map());index.owners.get(u.owner).set(u.uid,u);
        }
    }
    const alive=index.owners.get(owner)||new Map();
    const guards=new Set((gameData.aiTaskForces?.[owner]?.jobs||[]).filter(j=>j.city||j.fort).flatMap(j=>j.members));
    op.members=op.members.filter(id=>alive.get(id)?.hp>0&&!guards.has(id));
    const ids=new Set(op.members);
    for(const job of op.jobs)job.members=job.members.filter(id=>ids.has(id));
    const assigned=new Set(op.jobs.flatMap(j=>j.members));
    for(const id of op.members)if(!assigned.has(id)&&op.jobs[0])op.jobs[0].members.push(id);
    return op.members.map(id=>alive.get(id));
}

function wodAiSquadAvailable(owner,op) {
    const plan=gameData.aiTaskForces?.[owner],eligible=plan?wodAiFrontEligibility(owner,plan):()=>false;
    return wodAiSquadRoster(owner,op).filter(u=>!u.boardTransportUid&&eligible(u,true));
}

// A recruit carries the stable squad address, not the current tactical job.
// Retargeting, regrouping and borrowing troops must not orphan paid recruits.
function wodAiAdoptSquadRecruits(owner,plan,ready) {
    const ops=wodAiActiveFrontOperations(owner);
    for(const u of ready.filter(u=>u._aiRequestedSquad)){
        const base=plan.jobs.find(j=>j.id===plan.unitJob[u.uid]);
        if(base?.city||base?.fort)continue;
        const op=ops.find(o=>o.id===u._aiRequestedSquad&&wodAiSquadAvailable(owner,o).length<(o.capacity||6)&&wodAiCanReach(u,o.anchor||o.goal));
        if(op){
            // A patient keeps its medical job, but cannot occupy an assault
            // replacement slot forever. It can rejoin a force after recovery.
            if(op.members.length>=(op.capacity||6)){
                const available=new Set(wodAiSquadAvailable(owner,op).map(m=>m.uid)),id=op.members.find(id=>!available.has(id));
                op.members=op.members.filter(k=>k!==id);for(const j of op.jobs)j.members=j.members.filter(k=>k!==id);
            }
            for(const other of ops.filter(o=>o!==op)){other.members=other.members.filter(id=>id!==u.uid);for(const j of other.jobs)j.members=j.members.filter(id=>id!==u.uid);}
            if(!op.members.includes(u.uid)){op.members.push(u.uid);op.jobs.slice().sort((a,b)=>a.members.length-b.members.length)[0]?.members.push(u.uid);}
            u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);op.commandDecision=null;
            wodAiRecord(owner,'squad-reinforced',{job:op.id,unit:u.uid});
        }
        u._aiRequestedSquad=null;
    }
}

// Travel as a line with a second rank, rather than independently chasing the
// final town. A bound belongs to the gathered force; distant recruits join it
// without moving everybody's destination or increasing its arrival quorum.
function wodAiAssaultMarchHex(unit,op,goal,members) {
    if(op.stage!=='attack'||op.screenIds?.includes(unit.uid)||unit.isGeneral)return null;
    const hr=gameData.hexRadius||20,now=wodAiOperationTime();
    const force=members.filter(u=>!op.screenIds?.includes(u.uid)&&!u.isGeneral);
    if(force.length<2)return null;
    const threats=wodAiThreats(unit.owner,false);
    if(threats.some(e=>Math.hypot(e.x-unit.x,e.y-unit.y)<(e.range||50)+hr*2))return null;
    let march=op.march;
    const roster=march&&force.filter(u=>march.ids.includes(u.uid));
    const arrived=march&&roster.filter(u=>Math.hypot(u.x-march.anchor.x,u.y-march.anchor.y)<hr*3.5).length;
    if(!march||march.goal!==(goal.id||getHexKey(goal))||!roster.length||
        arrived>=Math.ceil(roster.length*.7)||now-march.at>30000){
        const cluster=u=>force.filter(m=>Math.hypot(m.x-u.x,m.y-u.y)<hr*6);
        const ranked=force.map(u=>({u,near:cluster(u)})).sort((a,b)=>b.near.length-a.near.length||
            Math.hypot(a.u.x-goal.x,a.u.y-goal.y)-Math.hypot(b.u.x-goal.x,b.u.y-goal.y));
        const core=ranked[0].near,cx=core.reduce((n,u)=>n+u.x,0)/core.length,cy=core.reduce((n,u)=>n+u.y,0)/core.length;
        const lead=core.slice().sort((a,b)=>Math.hypot(a.x-cx,a.y-cy)-Math.hypot(b.x-cx,b.y-cy))[0];
        if(Math.hypot(lead.x-goal.x,lead.y-goal.y)<hr*7){op.march=null;return null;}
        const route=wodAiLandRoute(lead,goal);if(!route||route.length<3)return null;
        const uncertain=wodFogActive()&&!wodFogFactionIntel(unit.owner).visible.has(getHexKey(getNearestHexToPoint(goal.x,goal.y)));
        const anchor=route[Math.min(uncertain?3:5,route.length-1)],origin=getNearestHexToPoint(lead.x,lead.y);
        if(uncertain)wodAiRecord(unit.owner,'mission-recon',{job:op.id||'advance',target:getHexKey(anchor),reason:'verify-hidden-approach'});
        const dx=anchor.x-origin.x,dy=anchor.y-origin.y,len=Math.hypot(dx,dy)||1;
        const ordered=force.slice().sort((a,b)=>(a.x-cx)*-dy+(a.y-cy)*dx-((b.x-cx)*-dy+(b.y-cy)*dx)||a.uid.localeCompare(b.uid));
        march=op.march={id:(op.boundSerial=(op.boundSerial||0)+1),at:now,goal:goal.id||getHexKey(goal),anchor,origin,dx:dx/len,dy:dy/len,
            ids:core.map(u=>u.uid),order:ordered.map(u=>u.uid),slots:{}};
    }
    if(!march.order.includes(unit.uid))march.order.push(unit.uid);
    const width=Math.min(14,march.order.length),spacing=Math.max(hr*2,...force.map(u=>(u.radius||hr)*2+6));
    const offset=wodAiFormationOffset(unit,force,march.anchor,march.dx,march.dy,width,spacing,'march-'+march.id),lane=offset.lane,row=offset.row;
    const x=march.anchor.x-march.dy*lane-march.dx*row,y=march.anchor.y+march.dx*lane-march.dy*row;
    const reach=wodAiOperationReach(unit),legal=h=>h&&!isWaterHex(h)&&canUnitEnterHex(unit,h)&&reach.has(getHexKey(h));
    const reserved=wodAiDeploymentReservations(unit,march.anchor,hr*20);
    let target=gameData.hexes[march.slots[unit.uid]];
    if(!legal(target)||reserved.has(getHexKey(target))){
        const used=new Set(Object.entries(march.slots).filter(([id])=>id!==unit.uid).map(([,k])=>k));for(const key of reserved)used.add(key);
        const sites=getHexesInRadius(march.anchor.q,march.anchor.r,Math.min(10,Math.max(4,Math.ceil(width*spacing/(hr*5))+2))).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>legal(h)&&!used.has(getHexKey(h))&&
            (h.x-march.origin.x)*march.dx+(h.y-march.origin.y)*march.dy>hr*.5);
        sites.sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y));target=sites[0];
        if(target)march.slots[unit.uid]=getHexKey(target);
    }
    // A vanguard that already passed this bound keeps moving forward. It must
    // never reverse to an old formation slot while the rear catches up.
    if(target&&(target.x-unit.x)*march.dx+(target.y-unit.y)*march.dy<-hr*.7)return null;
    if(target)wodAiRememberDeployment(unit,target,'march');return target||null;
}
