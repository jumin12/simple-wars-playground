'use strict';

// Strategic helpers share the simulation clock. Rendering/pathfinding budgets
// still use wall time, but device speed never changes a commander's decisions.
function wodAiThreats(owner, memories = true) {
    const visible = wodAiKnownEntities(owner).filter(u => u.hp > 0 && u.type !== 'convoy' &&
        !u.boardTransportUid && wodIsHostileOwner(u.owner, owner));
    if (!memories || !wodFogActive()) return visible.map(u=>({...u,_observerOwner:owner}));
    const intel = wodFogFactionIntel(owner), seen = new Set(visible.map(u => u.uid));
    const now = wodAiOperationTime(), result = visible.map(u=>({...u,_observerOwner:owner}));
    for (const [uid, record] of intel.units || []) {
        if (seen.has(uid)) continue;
        const age = Math.max(0, (now - record.seenAt) / 1000);
        if (age > 45) continue;
        const confidence = Math.exp(-age / 18) * (record.vacated ? .65 : 1);
        if (confidence < .12) continue;
        result.push({...record, _intelMemory: true, _intelConfidence: confidence,
            uncertainty: Math.min((gameData.hexRadius || 20) * 12, age * (record.speed || 15))});
    }
    return result;
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
    if (!attacker || attacker.hp <= 0 || attacker.moraleBroken || attacker.retreating) return 0;
    const from = terrain || wodCombatTerrainHex(attacker), to = wodCombatTerrainHex(defender);
    const attack = Math.sqrt(getTerrainAttackModifier(attacker, from) * getTerrainAttackModifier(attacker, to));
    const morale = .18 + .82 * Math.max(0, Math.min(1, (attacker.morale ?? 100) / 100));
    return (attacker.damage || 0) * .95 * attack * getTerrainDefenseModifier(defender, to) * morale *
        wodVeteranStatMult(attacker) * wodAiKnownCommand(attacker, observer) /
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
    const intent = danger > .7 ? 'defend' : recovering > ground.length*.35 || lossPressure>Math.max(250,ground.length*18) ? 'recover' :
        advantage < .8 && threats.length ? 'maneuver' : profile.id === 'maneuver' ? 'maneuver' : 'attack';
    const defenseShare = Math.min(.58, Math.max(.22, profile.defense + (intent==='defend'?.12:0) +
        (intent==='recover'?.08:0) - (advantage>1.7?.04:0)));
    const reserveShare = ground.length >= 10 ? (profile.id==='defensive' || pressure.length ? .16 : .1) : 0;
    const plan = {owner, at:now, hexes:gameData.hexes, profile:profile.id, intent, advantage, danger,
        ownPower, enemyPower, defenseShare, reserveShare, recovering, pressure:pressure.length, health,
        recentLoss,lossPressure, failures:Object.fromEntries(Object.entries(previous?.failures||{}).filter(([,f])=>now-f.at<180000).slice(-128)), primaryId:previous?.primaryId || null,
        lastHospitalCheck:previous?.lastHospitalCheck,
        requests:previous?.requests || {}, income:getOwnerIncome(owner)};
    gameData.aiBattlePlans[owner] = plan;
    return plan;
}

function wodAiCanReach(unit, target) {
    if (!unit || !target) return false;
    const key = `${target.q},${target.r}`;
    if (wodIsNavalUnit(unit)) return !!wodAiOperationReach(unit,true).has(key);
    return !!wodAiOperationReach(unit).has(key);
}

function wodAiTravelCost(unit, target) {
    if (!wodAiCanReach(unit,target)) return Infinity;
    const start = getNearestHexToPoint(unit.x,unit.y), end = gameData.hexes[`${target.q},${target.r}`] || target;
    const distance = Math.hypot(unit.x-end.x,unit.y-end.y), hr=gameData.hexRadius||20;
    let obstacle=0;
    const steps=Math.min(40,Math.max(1,Math.ceil(distance/hr)));
    for(let i=1;i<steps;i++) {
        const h=getNearestHexToPoint(unit.x+(end.x-unit.x)*i/steps,unit.y+(end.y-unit.y)*i/steps);
        if(h && (isWaterHex(h)&&!isBridgeHex(h)||!canUnitEnterHex(unit,h)))obstacle+=hr*3;
    }
    return (distance+obstacle)/Math.max(1,unit.speed||15)+(start?.owner===unit.owner?0:2);
}

function wodAiRebalanceGroups(owner, plan, ready) {
    const now=wodAiOperationTime(), strategy=wodAiBattlePlan(owner,ready), hr=gameData.hexRadius||20;
    if (plan.rebalancedAt != null && now-plan.rebalancedAt < 5000 && ready.length===plan.readyN) return;
    plan.rebalancedAt=now;
    const ids=new Set(ready.map(u=>u.uid));
    for(const job of plan.jobs)job.members=job.members.filter(id=>ids.has(id)&&plan.unitJob[id]===job.id);
    for(const id of Object.keys(plan.unitJob))if(!ids.has(id))delete plan.unitJob[id];
    wodAiMaintainTownGarrisons(owner,plan,ready);
    const topology=gameData._supplyTopologyVersion||0;
    if(plan.frontAt==null||now-plan.frontAt>=10000||plan.frontTopology!==topology&&now-plan.frontAt>=5000){
        const fronts=buildAiFrontlineSectors(owner,Math.min(24,Math.max(6,Math.ceil(ready.length/2))));
        const threats=wodAiThreats(owner,false);
        for(const job of plan.jobs.filter(j=>['hold','reserve','support'].includes(j.kind)&&j.holdHex)){
            if(threats.some(e=>Math.hypot(e.x-job.holdHex.x,e.y-job.holdHex.y)<hr*7))continue;
            const sector=fronts.slice().sort((a,b)=>wodAiDist2(a.holdHex.x,a.holdHex.y,job.holdHex.x,job.holdHex.y)-wodAiDist2(b.holdHex.x,b.holdHex.y,job.holdHex.x,job.holdHex.y))[0];
            if(sector&&Math.hypot(sector.holdHex.x-job.holdHex.x,sector.holdHex.y-job.holdHex.y)>hr*3){
                job.holdHex=sector.holdHex;job.attackHex=sector.attackHex;
                for(const uid of job.members){const u=ready.find(u=>u.uid===uid);if(u){u.aiOrderUntil=0;u.aiOrderResponseId='front-shift';}}
            }
        }
        plan.sectors=fronts;plan.frontAt=now;plan.frontTopology=topology;
    }
    const sectors=plan.sectors||[], infantry=ready.filter(u=>['light','mountaineer'].includes(u.type)&&!u.isGeneral);
    const assignedKind=u=>plan.jobs.find(j=>j.id===plan.unitJob[u.uid])?.kind;
    const take=(job,u)=>{
        const old=plan.jobs.find(j=>j.id===plan.unitJob[u.uid]);if(old)old.members=old.members.filter(id=>id!==u.uid);
        plan.unitJob[u.uid]=job.id;job.members.push(u.uid);job.quota=Math.max(job.quota||0,job.members.length);
        u.aiTfJobId=job.id;u.aiTfKind=job.kind;u.aiTfRole=job.role;u.aiOrderUntil=0;
    };
    const make=(kind,sector)=>{
        const job={id:owner+'-'+kind+'-reinforce-'+(plan.nextJobId=(plan.nextJobId||0)+1),kind,role:kind,
            quota:0,members:[],holdHex:sector?.holdHex,attackHex:sector?.attackHex};plan.jobs.push(job);return job;
    };
    // Expand the defensive screen with new recruits, keeping healthy attacks intact.
    const freeInf=()=>infantry.filter(u=>!plan.unitJob[u.uid]);
    const desiredLine=Math.max(sectors.length?1:0,Math.round(Math.max(0,infantry.length-gameData.cities.filter(c=>c.owner===owner).length)*strategy.defenseShare));
    let line=plan.jobs.filter(j=>j.kind==='hold').reduce((n,j)=>n+j.members.length,0);
    const release=(job,u)=>{job.members=job.members.filter(id=>id!==u.uid);delete plan.unitJob[u.uid];u.aiOrderUntil=0;};
    if(strategy.intent!=='defend'&&line>desiredLine+2){
        const threats=wodAiThreats(owner);
        for(const job of plan.jobs.filter(j=>j.kind==='hold').sort((a,b)=>b.members.length-a.members.length)){
            for(const uid of job.members.slice()){
                if(line<=desiredLine+1||job.members.length<=1)break;
                const u=ready.find(u=>u.uid===uid);
                if(u&&!u._combatEngaged&&!threats.some(e=>Math.hypot(e.x-u.x,e.y-u.y)<hr*8)){
                    release(job,u);line--;
                }
            }
        }
    }
    while(line<desiredLine&&freeInf().length&&sectors.length){
        const sector=sectors[Math.floor(line/3)%sectors.length];
        const job=plan.jobs.find(j=>j.kind==='hold'&&j.holdHex===sector.holdHex&&j.members.length<3)||make('hold',sector);
        const u=freeInf().filter(u=>wodAiCanReach(u,sector.holdHex)).sort((a,b)=>wodAiTravelCost(a,sector.holdHex)-wodAiTravelCost(b,sector.holdHex))[0];
        if(!u)break;take(job,u);line++;
    }
    const reserveTarget=Math.floor(ready.filter(isLandArmyUnit).length*strategy.reserveShare);
    let reserve=plan.jobs.filter(j=>j.kind==='reserve').reduce((n,j)=>n+j.members.length,0);
    if(strategy.intent==='attack'&&reserve>reserveTarget+1)for(const job of plan.jobs.filter(j=>j.kind==='reserve')){
        for(const uid of job.members.slice()){
            if(reserve<=reserveTarget+1)break;
            const u=ready.find(u=>u.uid===uid);if(u&&!u._combatEngaged){release(job,u);reserve--;}
        }
    }
    while(reserve<reserveTarget&&freeInf().length&&sectors.length){
        const job=plan.jobs.find(j=>j.kind==='reserve'&&j.members.length<3)||make('reserve',sectors[reserve%sectors.length]);
        const u=freeInf().find(u=>wodAiCanReach(u,job.holdHex));if(!u)break;take(job,u);reserve++;
    }
    for(const u of ready.filter(u=>!plan.unitJob[u.uid])) {
        const kinds=u.type==='ship'?['naval']:u.type==='marine'?['marine']:['armor','main'];
        const choices=plan.jobs.filter(j=>kinds.includes(j.kind)&&j.members.length<(j.waitingForStrength?8:j.kind==='naval'||j.kind==='marine'?3:5)&&
            (!j.holdHex||wodAiCanReach(u,j.holdHex)));
        choices.sort((a,b)=>Number(!a.waitingForStrength)-Number(!b.waitingForStrength)||
            (a.members.length-b.members.length)||wodAiTravelCost(u,a.holdHex||u)-wodAiTravelCost(u,b.holdHex||u));
        let job=choices[0];
        if(!job){
            const kind=u.type==='ship'?'naval':u.type==='marine'?'marine':['heavy','motorized'].includes(u.type)?'armor':'main';
            const sector=sectors.slice().filter(s=>wodAiCanReach(u,s.holdHex)).sort((a,b)=>wodAiAttackSectorScore(owner,a,[u])-wodAiAttackSectorScore(owner,b,[u]))[0];
            if(!sector&&!['ship','marine'].includes(u.type))continue;
            job=make(kind,sector);
            if(['armor','main'].includes(kind))Object.assign(job,wodAiAssaultObjective(owner,[u],sectors)||{});
        }
        take(job,u);
    }
    plan.readyN=ready.length;
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
    const cx=partners.length?partners.reduce((n,u)=>n+u.x,0)/partners.length:unit.x;
    const cy=partners.length?partners.reduce((n,u)=>n+u.y,0)/partners.length:unit.y;
    const start=getNearestHexToPoint(unit.x,unit.y),center=getNearestHexToPoint(cx,cy),reach=wodAiOperationReach(unit);
    if(!start||!center)return false;
    const points=new Map();for(const at of [start,center])for(const p of getHexesInRadius(at.q,at.r,3)){
        const h=gameData.hexes[`${p.q},${p.r}`];if(h&&reach.has(getHexKey(h))&&!isWaterHex(h)&&canUnitEnterHex(unit,h))points.set(getHexKey(h),h);
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
    if(moved){wodAiStampOrder(unit,holding,best,3500);unit.aiOrderPhase=job.phase;}
    return true;
}

function wodAiManageRecovery(owner) {
    const army=gameData.entities.filter(u=>u.owner===owner&&u.hp>0&&u.type!=='convoy'&&!u.boardTransportUid);
    const radius=wodFortCombatAuraRadiusPx(),hr=gameData.hexRadius||20,threats=wodAiThreats(owner,false);
    const sites=[...(gameData.hospitals||[]).filter(h=>wodEffectiveHospitalOwner(h)===owner),...gameData.cities.filter(c=>c.owner===owner)];
    const occupied=new Set();
    for(const u of army){
        const hp=u.hp/u.maxHp,manpower=(u.manpower??u.maxManpower)/(u.maxManpower||1000),morale=(u.morale??100)/(u.maxMorale||100);
        if(hp>=.94&&manpower>=.94&&morale>=.9&&!u.moraleBroken){
            if(u._medicalRecovering){u.retreating=false;u._medicalRecovering=false;u._medicalGoal=null;u.aiOrderUntil=0;}
            continue;
        }
        const trigger=u.isGeneral?.72:u.veteran?.6:.55;
        if(hp>=trigger&&manpower>=trigger&&morale>=.35&&!u._medicalRecovering&&!u.moraleBroken)continue;
        if(u.pickupUid||u.cargo||u._navalEvacuating)continue;
        if(wodGetUnitEncirclementState(u,getNearestHexToPoint(u.x,u.y)))continue;
        let destination=null,bestCost=Infinity;
        const reach=wodIsNavalUnit(u)?wodAiOperationReach(u,true):wodAiOperationReach(u);
        for(const site of sites){
            if(wodIsNavalUnit(u)&&gameData.cities.includes(site)&&!site.hasHarbor)continue;
            const cells=gameData.cities.includes(site)?getCityUrbanTerrainHexes(site):getHexesInRadius(site.q,site.r,Math.max(1,Math.floor(radius/(hr*1.35)*.75))).map(p=>gameData.hexes[`${p.q},${p.r}`]);
            let choices=cells;
            if(wodIsNavalUnit(u))choices=cells.flatMap(h=>getNeighborHexes(h));
            for(const h of choices){
                if(!h||!reach.has(getHexKey(h))||occupied.has(getHexKey(h)))continue;
                if(wodIsNavalUnit(u)?!wodIsOpenWaterHex(h):isWaterHex(h)||h.owner!==owner)continue;
                if(!gameData.cities.includes(site)&&Math.hypot(h.x-site.x,h.y-site.y)>radius*.85)continue;
                if(threats.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<Math.max(115,(e.range||50)+hr*2)))continue;
                if(isWorldPositionBlockedByUnits(u,h.x,h.y))continue;
                const cost=Math.hypot(u.x-h.x,u.y-h.y)+(gameData.cities.includes(site)?0:-hr);
                if(cost<bestCost){bestCost=cost;destination=h;}
            }
        }
        // Small towns may have one urban cell. Patients wait at separate safe
        // approach positions, then take the next free recovery slot.
        let waiting=false;
        if(!destination)for(const site of sites){
            for(const p of getHexesInRadius(site.q,site.r,3)){
                const h=gameData.hexes[`${p.q},${p.r}`];
                if(!h||!reach.has(getHexKey(h))||occupied.has(getHexKey(h))||
                    (wodIsNavalUnit(u)?!wodIsOpenWaterHex(h):isWaterHex(h)||h.owner!==owner))continue;
                if(threats.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<Math.max(115,(e.range||50)+hr*2))||
                    isWorldPositionBlockedByUnits(u,h.x,h.y))continue;
                const cost=Math.hypot(u.x-h.x,u.y-h.y)+Math.hypot(h.x-site.x,h.y-site.y)*.3;
                if(cost<bestCost){bestCost=cost;destination=h;waiting=true;}
            }
        }
        if(!destination)continue;
        occupied.add(getHexKey(destination));u._medicalRecovering=true;u.holding=false;
        u._medicalWaiting=waiting;
        if(wodUnitHealingSite(u)&&!threats.some(e=>Math.hypot(e.x-u.x,e.y-u.y)<115)){
            if(u.target&&u._medicalGoal)wodClearTransportMove(u);
            u.retreating=false;continue;
        }
        const same=u._medicalGoal===getHexKey(destination)&&u.target&&(u.stuckTimer||0)<1;
        if(!same&&assignUnitMoveAlongWaypoints(u,[destination],{transportInternal:true})){
            u.retreating=true;u._medicalGoal=getHexKey(destination);u.aiOrderUntil=0;
        }
    }
    const wounded=army.filter(u=>!wodIsNavalUnit(u)&&u.hp<u.maxHp*.82&&!u._navalEvacuating);
    const missing=wounded.reduce((n,u)=>n+(u.maxHp-u.hp)/100*(u.isGeneral?1.5:1),0);
    if(army.length<6||wounded.length<2||missing<1.1||wodPlayerTreasury(owner)<WOD_PRICE_HOSPITAL+WOD_PRICE_LIGHT*2||
        (gameData.constructionJobs||[]).some(j=>j.owner===owner&&j.mode==='hospital'))return;
    const strategy=wodAiBattlePlan(owner);
    if(strategy.lastHospitalCheck!=null&&wodAiOperationTime()-strategy.lastHospitalCheck<12000)return;
    strategy.lastHospitalCheck=wodAiOperationTime();
    if((gameData.hospitals||[]).filter(h=>wodEffectiveHospitalOwner(h)===owner).length>=Math.max(1,Math.ceil(army.length/18)))return;
    const candidates=new Map();
    for(const u of wounded){const at=getNearestHexToPoint(u.x,u.y);if(!at)continue;
        for(const p of getHexesInRadius(at.q,at.r,5)){const h=gameData.hexes[`${p.q},${p.r}`];
            if(!h||isFrontlineHex(h,owner)||wodHospitalPlacementError(h,owner)||sites.some(s=>Math.hypot(s.x-h.x,s.y-h.y)<radius*1.2)||
                threats.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<Math.max(150,(e.range||50)+hr*3)))continue;
            const supplied=wodCurrentSupplyComponent(h,owner).city||gameData.entities.some(s=>s.owner===owner&&s.type==='supply'&&s.hp>0&&Math.hypot(s.x-h.x,s.y-h.y)<radius*.85);
            if(supplied)candidates.set(getHexKey(h),h);
        }
    }
    const value=h=>wounded.reduce((n,u)=>n+Math.max(0,1-Math.hypot(u.x-h.x,u.y-h.y)/(radius*1.5))*(u.isGeneral?3:1),0);
    const site=[...candidates.values()].sort((a,b)=>value(b)-value(a))[0];
    if(site&&value(site)>=1.2)placeHospitalAtHex(site,owner);
}

function wodAiChooseNavalMission(owner, transports, candidates, targets, supplyShips) {
    gameData.aiNavalPlans ||= {};
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,old=gameData.aiNavalPlans[owner];
    const fleet=transports.filter(t=>t.owner===owner&&t.hp>0&&!t._medicalRecovering&&!t.retreating&&!t.moraleBroken);
    if(!fleet.length)return null;
    const ships=gameData.entities.filter(u=>u.owner===owner&&u.type==='ship'&&u.hp>u.maxHp*.45&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken);
    const cargo=fleet.filter(t=>t.cargo).map(t=>t.cargo),landed=gameData.entities.filter(u=>u.owner===owner&&u._navalLanded&&u.hp>0);
    const known=wodAiThreats(owner),naval=known.filter(u=>u.type==='ship');
    const from=fleet[0],home=gameData.cities.filter(c=>c.owner===owner&&cityHasWaterNeighbor(c)).sort((a,b)=>
        wodAiDist2(a.x,a.y,from.x,from.y)-wodAiDist2(b.x,b.y,from.x,from.y))[0];
    let goal=old?.goal;
    const stillHostile=goal&&targets.some(t=>t.id===goal.id&&wodIsHostileOwner(t.owner,owner));
    const stalled=old&&old.phase==='prepare'&&old.reason!=='embark'&&now-old.at>45000;
    if(stalled)wodAiBattlePlan(owner).failures[old.goal.id]={at:now,count:1};
    const continuing=old&&old.hexes===gameData.hexes&&!stalled&&(now-old.at<180000||cargo.length||landed.length)&&(stillHostile||cargo.length||landed.length);
    if(!continuing){
        const available=targets.filter(t=>candidates.some(u=>!wodAiOperationReach(u).has(getHexKey(getNearestHexToPoint(t.x,t.y)))));
        const score=t=>{
            const danger=known.filter(e=>Math.hypot(e.x-t.x,e.y-t.y)<hr*10).reduce((n,e)=>n+wodAiUnitCombatPower(e),0);
            const failure=wodAiBattlePlan(owner).failures[t.id];
            return wodAiDist2(from.x,from.y,t.x,t.y)/(hr*hr*120)+danger*6+(t.shore?8:0)+(failure&&now-failure.at<90000?30:0);
        };
        available.sort((a,b)=>score(a)-score(b));goal=available[0];if(!goal)return null;
    }
    const goalHex=getNearestHexToPoint(goal.x,goal.y),region=wodTransportLandingRegion({type:'light',owner},goalHex);
    const pool=[...cargo,...landed,...candidates.filter(u=>!u._navalEvacuating&&!u.isGeneral)].filter((u,i,a)=>a.indexOf(u)===i)
        .sort((a,b)=>wodAiUnitCombatPower(b)-wodAiUnitCombatPower(a));
    const invaders=pool.filter(u=>u.hp>u.maxHp*.5&&!u.moraleBroken&&!u.retreating).slice(0,Math.max(2,Math.min(8,fleet.length*2)));
    const groundEnemies=known.filter(e=>!wodIsNavalUnit(e)&&Math.hypot(e.x-goal.x,e.y-goal.y)<hr*10+(e.uncertainty||0)*.3);
    const seaEnemies=naval.filter(e=>Math.hypot(e.x-goal.x,e.y-goal.y)<hr*16||Math.hypot(e.x-from.x,e.y-from.y)<hr*16);
    const ordinary=invaders.some(u=>u.type!=='marine');
    const friendlyCity=region&&gameData.cities.some(c=>c.owner===owner&&region.has(`${c.q},${c.r}`));
    const requiredSupply=ordinary&&!friendlyCity?1:0;
    const requiredEscorts=seaEnemies.length?Math.min(10,Math.max(1,Math.ceil(seaEnemies.reduce((n,u)=>n+(u._intelConfidence??1),0)*1.2))):0;
    const balance=wodAiForecast(owner,invaders,groundEnemies),seaBalance=wodAiForecast(owner,ships,seaEnemies);
    const sufficientSupply=supplyShips.length>=requiredSupply;
    const sufficientSea=!seaEnemies.length||ships.length>0&&seaBalance.ratio>=1.1;
    const loaded=fleet.filter(t=>t.cargo),loadedUnits=[...loaded.map(t=>t.cargo),...landed.filter(u=>region?.has(getHexKey(getNearestHexToPoint(u.x,u.y))))];
    const loadedBalance=wodAiForecast(owner,loadedUnits,groundEnemies);
    const profile=wodAiCommander(owner),groundReady=invaders.length>0&&balance.ratio>=profile.ratio;
    const waveReady=loadedUnits.length>0&&loadedBalance.ratio>=Math.max(1.05,profile.ratio-.1);
    const startX=fleet.reduce((n,t)=>n+t.x,0)/fleet.length,startY=fleet.reduce((n,t)=>n+t.y,0)/fleet.length;
    const hadCrossing=continuing&&['crossing','landing','secure'].includes(old.phase);
    const assembled=hadCrossing||(!requiredSupply||supplyShips.some(s=>Math.hypot(s.x-startX,s.y-startY)<hr*10))&&
        (!requiredEscorts||ships.filter(s=>Math.hypot(s.x-startX,s.y-startY)<hr*12).length>=Math.min(requiredEscorts,ships.length));
    const reason=!sufficientSupply?'supply':!sufficientSea?'escort':!groundReady?'troops':!assembled?'gathering':!waveReady?'embark':null;
    let phase=hadCrossing?old.phase:'prepare';
    if(!reason)phase=landed.length?'secure':'crossing';
    if(hadCrossing&&(!sufficientSea||!sufficientSupply)&&!landed.length)phase='regroup';
    const mission={id:continuing?old.id:owner+'-naval-'+now,owner,hexes:gameData.hexes,at:continuing?old.at:now,
        checkedAt:now,goal,home,phase,reason,requiredSupply,requiredEscorts,
        requiredTransports:groundEnemies.length?Math.min(6,Math.max(2,Math.ceil(groundEnemies.length/2))):1,
        troops:invaders.map(u=>u.uid),transports:fleet.map(t=>t.uid),escorts:ships.map(u=>u.uid),
        support:supplyShips.map(u=>u.uid),forceRatio:balance.ratio,seaRatio:seaBalance.ratio,
        canEmbark:sufficientSupply&&sufficientSea&&groundReady,canSail:sufficientSupply&&sufficientSea&&waveReady&&assembled};
    gameData.aiNavalPlans[owner]=mission;
    for(const t of fleet)if(t._aiFerryMission&&(t.cargo||t.pickupUid)&&!t.cargo?._navalEvacuating){
        t._aiFleetId=mission.id;
        if(!t.unloadHexKey)t.ferryGoal={x:goal.x,y:goal.y};
    }
    for(const ship of [...ships,...supplyShips]){
        ship._aiFleetId=mission.id;
        if(reason==='gathering'||reason==='embark'||reason==='troops'){
            const water=wodNavalWaterRegionKeys(ship,getNearestHexToPoint(ship.x,ship.y));
            const site=water&&[...water].map(k=>gameData.hexes[k]).filter(h=>h&&Math.hypot(h.x-startX,h.y-startY)<hr*5&&
                wodNavalDestinationClear(ship,h)).sort((a,b)=>wodAiDist2(a.x,a.y,ship.x,ship.y)-wodAiDist2(b.x,b.y,ship.x,ship.y))[0];
            if(site&&!ship.target&&Math.hypot(ship.x-site.x,ship.y-site.y)>hr*2)assignUnitMoveAlongWaypoints(ship,[site],{transportInternal:true});
        }
    }
    if(phase==='regroup')for(const transport of loaded){
        if(transport._trafficYield)continue;
        const point=findNavalRetreatPoint(transport,3);
        if(point){wodClearTransportMove(transport);transport.unloadHexKey=null;assignUnitMoveAlongWaypoints(transport,[point],{transportInternal:true});}
    }
    return mission;
}

function wodAiFerryCanSail(transport) {
    if(!transport._aiFleetId)return true;
    const mission=gameData.aiNavalPlans?.[transport.owner];
    return !!(mission&&mission.id===transport._aiFleetId&&mission.canSail&&mission.phase!=='regroup');
}

function wodAiSafeFriendlyTransfer(unit, transport, goal) {
    const h=getNearestHexToPoint(goal.x,goal.y),region=h&&wodTransportLandingRegion(unit,h);
    if(!region||!gameData.cities.some(c=>c.owner===unit.owner&&region.has(`${c.q},${c.r}`)))return false;
    const hr=gameData.hexRadius||20;
    return !wodAiThreats(unit.owner).some(e=>e.type==='ship'&&
        (Math.hypot(e.x-transport.x,e.y-transport.y)<hr*14||Math.hypot(e.x-goal.x,e.y-goal.y)<hr*14));
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
        const rough=getHexesInRadius(city.q,city.r,4).map(p=>gameData.hexes[`${p.q},${p.r}`]).filter(h=>h&&['hill','mountain'].includes(h.type)).length;
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
