'use strict';

// Bounded, local diagnostics. No hidden unit positions, account data or network writes.
function wodAiRecord(owner, event, detail = {}) {
    let log=gameData._aiDecisionLog;
    if(log?.hexes!==gameData.hexes)log=gameData._aiDecisionLog={hexes:gameData.hexes,owners:{}};
    const state=log.owners[owner]||=( {events:[],counts:{},last:{}} ),now=wodAiOperationTime();
    const key=event+':'+(detail.job||detail.unit||detail.city||'');
    const signature=JSON.stringify(detail),old=state.last[key];
    if(old?.signature===signature&&now-old.at<10000)return;
    state.last[key]={signature,at:now};state.counts[event]=(state.counts[event]||0)+1;
    state.events.push({at:now/1000,event,...detail});if(state.events.length>160)state.events.shift();
    if(Object.keys(state.last).length>256)state.last=Object.fromEntries(Object.entries(state.last).slice(-128));
}

function wodAiDiagnostics(owner) {
    const plan=gameData.aiTaskForces?.[owner],economy=gameData._aiEconomyPlans?.[owner];
    const log=gameData._aiDecisionLog?.hexes===gameData.hexes?gameData._aiDecisionLog.owners[owner]:null;
    return {owner,intent:gameData.aiBattlePlans?.[owner]?.intent,
        economy:economy&&{desired:economy.desired,savingFor:economy.savingFor,reservation:economy.reservation&&{type:economy.reservation.type,since:economy.reservation.since},idleReason:economy.idleReason},
        defense:plan?.defenseDemand,operations:plan?.jobs.filter(j=>j.stage).map(j=>({id:j.id,stage:j.stage,reason:j.stageReason,members:j.members.length,goal:j.objectiveCity?.id||j.objectiveHex&&getHexKey(j.objectiveHex)})),
        counts:{...log?.counts},events:log?.events.slice()||[]};
}

function wodAiCityCanTrain(city,type,owner) {
    if(['heavy','motorized'].includes(type))return !!city.hasFactory;
    if(wodIsNavalType(type))return !!city.hasHarbor&&wodAiHarborUseful(city,owner);
    return type!=='marine'||cityHasWaterNeighbor(city);
}

// Savings belong to the faction, not to the next town visited in the purchase
// loop. A plain infantry town cannot spend a factory's reserved manpower.
function wodAiProcurementReserve(owner,cities,army,pending,demand,plan,spareUpkeep) {
    const now=gameData._aiEconomyClock||0,count=t=>army.filter(u=>u.type===t).length+pending.filter(j=>j.mode===t).length;
    const ground=army.filter(isLandArmyUnit).length+pending.filter(j=>isLandArmyUnit({type:j.mode})).length;
    const floor=gameData.aiTaskForces?.[owner]?.defenseDemand?.armyFloor||cities.length*4+4;
    const enemyArmor=wodAiThreats(owner).filter(u=>u.type==='heavy').length;
    const usable=t=>{
        // The general already fills the opening armor role. Build a viable line
        // before saving for duplicate armor or a large specialist quota.
        if(ground<floor&&((t==='heavy'&&count(t)>0&&enemyArmor<=count(t)+1)||(['motorized','mountaineer'].includes(t)&&count(t)>0)))return false;
        return demand.desired[t]>count(t)&&cities.some(c=>wodAiCityCanTrain(c,t,owner)&&findSpawnHex(t,c,owner))&&getUnitUpkeep({type:t})<=spareUpkeep;
    };
    const readyGround=army.filter(u=>isLandArmyUnit(u)&&u.hp>u.maxHp*.55&&!u._medicalRecovering&&!u.retreating).length;
    const essential=demand.missing.length>0||army.filter(isLandArmyUnit).length<Math.max(4,cities.length*2)||demand.atRisk&&readyGround<Math.max(6,cities.length*3+2);
    let reservation=plan.reservation;
    if(reservation&&(!usable(reservation.type)||essential||now-reservation.since>180))reservation=null;
    if(!reservation&&!essential){
        const choices=demand.types.filter(t=>t!=='light'&&usable(t));
        const urgentSupply=army.some(u=>u._navalLanded&&u.type!=='marine'&&!wodIsNavalUnit(u)&&!wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city);
        const critical=t=>t==='supply'&&urgentSupply?0:1;
        // Fill an absent class before accumulating more of one already fielded.
        choices.sort((a,b)=>critical(a)-critical(b)||Number(count(a)>0)-Number(count(b)>0)||Number(canAffordUnit(owner,b))-Number(canAffordUnit(owner,a))||demand.types.indexOf(a)-demand.types.indexOf(b));
        const type=choices[0];
        if(type)reservation={type,since:now};
    }
    plan.reservation=reservation;
    plan.savingFor=reservation&&!canAffordUnit(owner,reservation.type)?reservation.type:null;
    return reservation;
}

function wodAiCanSpendOutsideReserve(owner,type,plan) {
    const reserve=plan.reservation;if(!reserve||reserve.type===type)return true;
    const cost=getUnitCost(type),protectedCost=getUnitCost(reserve.type);
    return wodPlayerTreasury(owner)-cost.money>=protectedCost.money&&wodPlayerMpPool(owner)-cost.manpower>=protectedCost.manpower;
}

// Contact ETA searches legal terrain, including real bridge links, with current
// movement penalties. A distant or blocked helper never inflates fighting strength.
function wodAiArrivalSeconds(unit, point, contactRange=0, horizon=120) {
    if(!unit||!point)return Infinity;
    const distance=Math.hypot(unit.x-point.x,unit.y-point.y);
    if(distance<=contactRange)return 0;
    const speed=Math.max(.1,(unit.speed||15)*WOD_MOVE_SPEED_FACTOR*wodVeteranStatMult(unit)*1.05*(unit.type==='mountaineer'?1.05:1));
    if((distance-contactRange)/speed>horizon)return Infinity;
    const start=getNearestHexToPoint(unit.x,unit.y),goal=getNearestHexToPoint(point.x,point.y);
    if(!start||!goal)return Infinity;
    const stamp=Math.floor(wodAiOperationTime()/1800),topology=gameData._supplyTopologyVersion||0;
    let cache=gameData._aiArrivalCache;
    if(cache?.hexes!==gameData.hexes||cache.stamp!==stamp||cache.topology!==topology)
        cache=gameData._aiArrivalCache={hexes:gameData.hexes,stamp,topology,values:new Map()};
    const key=[unit.uid,unit.owner,unit.type,getHexKey(start),getHexKey(goal),Math.round(point.x),Math.round(point.y),Math.round(unit.x),Math.round(unit.y),Math.round(contactRange),horizon,Math.round(speed*10),Math.round(getUnitSpeedMultiplier(unit)*100)].join(':');
    if(cache.values.has(key))return cache.values.get(key);
    const heap=[],cost=new Map([[getHexKey(start),0]]);
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
            const water=isWaterHex(n)&&!isBridgeHex(n);
            const movingUnit={...unit,x:n.x,y:n.y,inWater:water,amphibInWater:unit.type==='marine'&&water};
            const movement=Math.max(.1,(unit.speed||15)*getUnitSpeedMultiplier(movingUnit,n)*WOD_MOVE_SPEED_FACTOR);
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

function wodAiDefenseDemand(owner, ready, sectors, strategy=wodAiBattlePlan(owner,ready),garrisons) {
    const infantry=ready.filter(u=>['light','mountaineer'].includes(u.type)&&!u.isGeneral),towns=gameData.cities.filter(c=>c.owner===owner);
    const hr=gameData.hexRadius||20,threats=wodAiThreats(owner),front=wodCachedFrontlineHexes(owner);
    const ranked=sectors.map(s=>{
        const enemies=threats.filter(e=>Math.hypot(e.x-s.holdHex.x,e.y-s.holdHex.y)<hr*11);
        const power=enemies.reduce((n,e)=>n+wodAiUnitCombatPower(e),0);
        const nearTown=towns.some(c=>Math.hypot(c.x-s.holdHex.x,c.y-s.holdHex.y)<hr*10);
        return {...s,defensePriority:1+power*2+(nearTown?1:0),required:Math.min(4,Math.max(1,Math.ceil(power*.7)))};
    }).sort((a,b)=>b.defensePriority-a.defensePriority);
    const guards=garrisons??towns.length;
    const spare=Math.max(0,infantry.length-guards),frontage=Math.min(18,Math.ceil(front.length/12));
    const contested=ranked.filter(s=>s.defensePriority>2).length;
    const line=Math.min(Math.max(0,spare-2),Math.max(ranked.length?1:0,Math.round(spare*strategy.defenseShare),Math.min(frontage,contested+Math.ceil(frontage*.35))));
    const reserve=Math.min(Math.max(0,spare-line-2),Math.max(ready.length>=7?1:0,Math.floor(ready.filter(isLandArmyUnit).length*strategy.reserveShare)));
    return {line,reserve,frontage,contested,ranked,armyFloor:Math.min(140,guards+frontage+Math.max(4,towns.length*2)+Math.ceil(frontage*.2))};
}

// Search short cross-sections between opposite hostile flanks. Removing a tested
// section must actually disconnect troops from every town; coastlines alone
// cannot manufacture a pocket. Work is capped independently of total map area.
function wodAiPredictCorridors(owner, tiles, index, edges, roots, supplied, weights, enemies, supplyDepth) {
    const hr=gameData.hexRadius||20,visible=wodAiThreats(owner,false).filter(e=>!wodIsNavalUnit(e)),sections=[],tested=new Set();
    if(!roots.length||!visible.length)return sections;
    const explored=wodFogActive()?wodFogFactionIntel(owner).explored:null;
    const outward=i=>cardinalHexDirections.map(d=>gameData.hexes[(tiles[i].q+d.q)+','+(tiles[i].r+d.r)])
        .filter(h=>h&&!isWaterHex(h)&&wodIsHostileOwner(h.owner,owner)&&(!explored||explored.has(getHexKey(h))));
    const boundary=[];
    for(const h of wodCachedFrontlineHexes(owner)){
        const i=index.get(getHexKey(h));if(i===undefined||!supplied.has(i)||!visible.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<hr*12))continue;
        const outside=outward(i);if(outside.length)boundary.push({i,outside,d:Math.min(...visible.map(e=>Math.hypot(e.x-tiles[i].x,e.y-tiles[i].y)))});
    }
    boundary.sort((a,b)=>a.d-b.d);let floods=0;
    for(const seed of boundary.slice(0,20)){
        if(floods>=8)break;
        const start=tiles[seed.i],normal={x:seed.outside[0].x-start.x,y:seed.outside[0].y-start.y};
        const queue=[{i:seed.i,path:[seed.i]}],seen=new Set([seed.i]);let section=null;
        for(let q=0;q<queue.length&&q<160;q++){
            const {i,path}=queue[q],h=tiles[i];
            if(path.length>=3&&outward(i).some(n=>(n.x-h.x)*normal.x+(n.y-h.y)*normal.y<-.2*hr*hr)){section=path;break;}
            if(path.length>=6)continue;
            for(const j of edges[i])if(!seen.has(j)&&supplied.has(j)&&Math.hypot(tiles[j].x-start.x,tiles[j].y-start.y)<hr*7.5){seen.add(j);queue.push({i:j,path:path.concat(j)});}
        }
        if(!section)continue;
        const signature=section.slice().sort((a,b)=>a-b).join(',');if(tested.has(signature))continue;tested.add(signature);floods++;
        const blocked=new Set(section),reached=new Set(roots.filter(i=>!blocked.has(i))),flood=[...reached];
        for(let q=0;q<flood.length;q++)for(const j of edges[flood[q]])if(!blocked.has(j)&&!reached.has(j)){reached.add(j);flood.push(j);}
        let troops=0,area=0,depth=0;const riskTileKeys=[];
        const neckDepth=Math.min(...section.map(i=>supplyDepth.get(i)??0));
        for(const i of supplied)if(!blocked.has(i)&&!reached.has(i)){troops+=weights[i];area++;depth+=weights[i]*Math.max(0,(supplyDepth.get(i)||0)-neckDepth);if(weights[i])riskTileKeys.push(getHexKey(tiles[i]));}
        if(troops<2||area<section.length*2)continue;
        const center=tiles[section[Math.floor(section.length/2)]];
        const closing=visible.filter(e=>Math.hypot(e.x-center.x,e.y-center.y)<hr*12);
        const closureSeconds=Math.min(...closing.map(e=>Math.max(0,Math.hypot(e.x-center.x,e.y-center.y)-(e.range||50))/Math.max(1,(e.speed||15)*WOD_MOVE_SPEED_FACTOR)))+section.length*1.5;
        const withdrawSeconds=depth/Math.max(1,troops)*hr*1.35/(12*WOD_MOVE_SPEED_FACTOR);
        sections.push({i:section[Math.floor(section.length/2)],troops,area,keys:section,riskTileKeys,predictive:true,closureSeconds,withdrawSeconds});
    }
    return sections;
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
    op.checkedAt=now;op.signature=signature;op.roster=Math.max(op.roster,members.length);
    const completed=job.objectiveCity?getCityUrbanTerrainHexes(job.objectiveCity).every(h=>wodIsFriendlyOwner(h.owner,owner)):wodIsFriendlyOwner(goal.owner,owner);
    if(completed){
        if(op.stage!=='consolidate')wodAiSetOperationStage(owner,op,'consolidate','secure-captured-ground');
        else if(now-op.stageAt>=6000){wodAiSetOperationStage(owner,op,'complete','garrison-handoff');plan.expireAt=0;plan.simBuiltAt=now-240001;}
    }else if(['attack','secure-approach','protect-flanks'].includes(op.stage)&&(!balance.maintain||members.some(u=>wodAiCorridorWithdrawal(u)))){
        wodAiSetOperationStage(owner,op,'recover','strength-or-supply-risk');op.recoverUntil=now+10000;
        const strategy=wodAiBattlePlan(owner),prior=strategy.failures[key]||{};strategy.failures[key]={at:now,count:(prior.count||0)+1};
    }else if(op.stage==='recover'){
        if(now>=op.recoverUntil&&balance.ready)wodAiSetOperationStage(owner,op,'assemble','recovered');
    }else if(op.stage==='assemble'){
        const gathered=members.filter(u=>Math.hypot(u.x-(job.holdHex||u).x,u.y-(job.holdHex||u).y)<hr*5||Math.hypot(u.x-goal.x,u.y-goal.y)<hr*7);
        const required=Math.max(balance.threats?2:1,Math.ceil(op.roster*.8));
        const line=plan.jobs.filter(j=>j.kind==='hold').reduce((n,j)=>n+j.members.length,0),reserve=plan.jobs.filter(j=>j.kind==='reserve').reduce((n,j)=>n+j.members.length,0);
        const defenseReady=!plan.defenseDemand||line>=plan.defenseDemand.line&&reserve>=plan.defenseDemand.reserve;
        if(gathered.length>=required&&defenseReady&&wodAiAssaultBalance(owner,gathered,goal).ready){
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
        if(members.filter(u=>Math.hypot(u.x-op.approach.x,u.y-op.approach.y)<hr*4).length>=Math.ceil(members.length*.8)){
            op.screenIds=members.filter(u=>['light','mountaineer'].includes(u.type)&&!u.isGeneral).slice(-Math.min(members.length>=8?2:members.length>=5?1:0)).map(u=>u.uid);
            if(members.length<5)op.screenIds=[];
            wodAiSetOperationStage(owner,op,'protect-flanks','approach-secured');
        }
    }else if(op.stage==='protect-flanks'&&now-op.stageAt>=2000){
        if(balance.ready)wodAiSetOperationStage(owner,op,'attack','flanks-screened');
        else{wodAiSetOperationStage(owner,op,'recover','flank-opposition');op.recoverUntil=now+10000;}
    }
    const linked=plan.jobs.filter(j=>j===job||job.objectiveCity&&j.objectiveCity?.id===goal.id||!job.objectiveCity&&j.objectiveHex&&getHexKey(j.objectiveHex)===key);
    for(const j of linked){j.stage=op.stage;j.stageReason=op.reason;j.operationState=op;j.phase=['assemble','recover'].includes(op.stage)?'assemble':'assault';j.waitingForStrength=['assemble','recover'].includes(op.stage);}
    // Remove retired history without discarding an active operation.
    if(Object.keys(operations).length>32)for(const k of Object.keys(operations))if(k!==key&&['complete','consolidate'].includes(operations[k].stage))delete operations[k];
    return op;
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
    if (plan.rebalancedAt != null && now-plan.rebalancedAt < 2500 && ready.length===plan.readyN&&plan.lastIntent===strategy.intent) return;
    plan.rebalancedAt=now;
    plan.lastIntent=strategy.intent;
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
    const demand=wodAiDefenseDemand(owner,ready,plan.sectors||[],strategy,plan.jobs.filter(j=>j.kind==='defend').reduce((n,j)=>n+j.members.length,0));
    plan.defenseDemand={line:demand.line,reserve:demand.reserve,frontage:demand.frontage,contested:demand.contested,armyFloor:demand.armyFloor};
    const sectors=demand.ranked, infantry=ready.filter(u=>['light','mountaineer'].includes(u.type)&&!u.isGeneral);
    const assignedKind=u=>plan.jobs.find(j=>j.id===plan.unitJob[u.uid])?.kind;
    const take=(job,u)=>{
        const old=plan.jobs.find(j=>j.id===plan.unitJob[u.uid]);if(old){old.members=old.members.filter(id=>id!==u.uid);if(['main','armor','raid'].includes(old.kind)){old.phase='assemble';old.stage='assemble';old.waitingForStrength=true;}}
        plan.unitJob[u.uid]=job.id;job.members.push(u.uid);job.quota=Math.max(job.quota||0,job.members.length);
        u.aiTfJobId=job.id;u.aiTfKind=job.kind;u.aiTfRole=job.role;u.aiOrderUntil=0;
        gameData._aiMoveQueue?.delete(u);
    };
    const make=(kind,sector)=>{
        const job={id:owner+'-'+kind+'-reinforce-'+(plan.nextJobId=(plan.nextJobId||0)+1),kind,role:kind,
            quota:0,members:[],holdHex:sector?.holdHex,attackHex:sector?.attackHex};plan.jobs.push(job);return job;
    };
    // Defense is a real allocation requirement, not only a home for spare recruits.
    const freeInf=()=>infantry.filter(u=>!plan.unitJob[u.uid]);
    const desiredLine=demand.line;
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
    const mobilize=(amount,kind)=>{
        let need=amount-freeInf().length;
        const donors=infantry.filter(u=>['main','raid','armor','support'].includes(assignedKind(u))&&(!u._combatEngaged||strategy.intent==='defend'));
        donors.sort((a,b)=>Number(!!a._combatEngaged)-Number(!!b._combatEngaged)||Math.min(...sectors.map(s=>wodAiDist2(a.x,a.y,s.holdHex.x,s.holdHex.y)))-Math.min(...sectors.map(s=>wodAiDist2(b.x,b.y,s.holdHex.x,s.holdHex.y))));
        for(const u of donors){if(need--<=0)break;const job=plan.jobs.find(j=>j.id===plan.unitJob[u.uid]);release(job,u);job.phase='assemble';job.stage='assemble';job.waitingForStrength=true;gameData._aiMoveQueue?.delete(u);wodAiRecord(owner,'defense-reassign',{unit:u.uid,job:job.id,to:kind,intent:strategy.intent});}
    };
    if(line<desiredLine&&sectors.length)mobilize(desiredLine-line,'hold');
    while(line<desiredLine&&freeInf().length&&sectors.length){
        const coverage=s=>plan.jobs.filter(j=>j.kind==='hold'&&j.holdHex===s.holdHex).reduce((n,j)=>n+j.members.length,0);
        const sector=sectors.slice().sort((a,b)=>(coverage(a)/a.required-coverage(b)/b.required)||b.defensePriority-a.defensePriority)[0];
        const job=plan.jobs.find(j=>j.kind==='hold'&&j.holdHex===sector.holdHex&&j.members.length<3)||make('hold',sector);
        const u=freeInf().filter(u=>wodAiCanReach(u,sector.holdHex)).sort((a,b)=>wodAiTravelCost(a,sector.holdHex)-wodAiTravelCost(b,sector.holdHex))[0];
        if(!u)break;take(job,u);line++;
    }
    const reserveTarget=demand.reserve;
    let reserve=plan.jobs.filter(j=>j.kind==='reserve').reduce((n,j)=>n+j.members.length,0);
    if(strategy.intent==='attack'&&reserve>reserveTarget+1)for(const job of plan.jobs.filter(j=>j.kind==='reserve')){
        for(const uid of job.members.slice()){
            if(reserve<=reserveTarget+1)break;
            const u=ready.find(u=>u.uid===uid);if(u&&!u._combatEngaged){release(job,u);reserve--;}
        }
    }
    if(reserve<reserveTarget&&sectors.length)mobilize(reserveTarget-reserve,'reserve');
    while(reserve<reserveTarget&&freeInf().length&&sectors.length){
        const job=plan.jobs.find(j=>j.kind==='reserve'&&j.members.length<3)||make('reserve',sectors[reserve%sectors.length]);
        const u=freeInf().find(u=>wodAiCanReach(u,job.holdHex));if(!u)break;take(job,u);reserve++;
    }
    wodAiRecord(owner,'defense-allocation',{line,reserve,requiredLine:desiredLine,requiredReserve:reserveTarget,intent:strategy.intent});
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
    if(moved){wodAiStampOrder(unit,holding,best,3500);unit.aiOrderPhase=job.phase;unit.aiOperationStage=job.stage;}
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
        if(wodGetUnitEncirclementState(u,getNearestHexToPoint(u.x,u.y))){
            // An unreachable hospital order must not veto an urgent breakout.
            if(u._medicalRecovering){u._medicalRecovering=false;u.retreating=false;u._medicalGoal=null;u.aiOrderUntil=0;}
            continue;
        }
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

function wodAiNavalRecon(owner,transports) {
    if(!wodFogActive())return null;
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,intel=wodFogFactionIntel(owner);
    let cache=gameData._aiNavalRecon;
    if(cache?.hexes!==gameData.hexes)cache=gameData._aiNavalRecon={hexes:gameData.hexes,owners:{}};
    const state=cache.owners[owner]||=( {history:[],blocked:{}} );
    const ships=gameData.entities.filter(u=>u.owner===owner&&u.hp>u.maxHp*.7&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&!u._trafficYield);
    const knownTargets=wodAiNavalAssaultTargets(owner);
    const required=gameData.aiNavalPlans?.[owner]?.requiredEscorts||0;
    const warships=ships.filter(u=>u.type==='ship'),ferries=ships.filter(u=>u.type==='transport'&&!u.cargo&&!u.pickupUid);
    const ferryCount=gameData.entities.filter(u=>u.owner===owner&&u.type==='transport'&&u.hp>0).length;
    const pool=[...(warships.length>required?warships:[]),...(!knownTargets.length||ferryCount>1?ferries:[]),
        ...ships.filter(u=>u.type==='marine'&&!u._navalLanded&&!u._combatEngaged&&!u.boardTransportUid)];
    const scout=pool.find(u=>u.uid===state.uid&&u.type===pool[0]?.type)||pool[0];
    if(!scout){const old=gameData.entities.find(u=>u.uid===state.uid);if(old)old._aiScoutUntil=0;return null;}
    if(state.uid!==scout.uid){const old=gameData.entities.find(u=>u.uid===state.uid);if(old){old._aiScoutUntil=0;old._navalScoutGoal=null;}state.uid=scout.uid;state.goal=null;}
    const current=getNearestHexToPoint(scout.x,scout.y);if(!current)return null;
    const moved=!state.position||Math.hypot(scout.x-state.position.x,scout.y-state.position.y)>hr*.4;
    if(moved){state.position={x:scout.x,y:scout.y};state.progressAt=now;}
    if(state.goal&&scout.target&&!intel.visible.has(getHexKey(state.goal))&&now-(state.progressAt||0)<14000){scout._aiScoutUntil=now+12000;return scout;}
    if(state.goal){
        if(now-(state.progressAt||0)>=14000)state.blocked[getHexKey(state.goal)]=now+45000;
        state.history.push(getHexKey(state.goal));state.history=state.history.slice(-16);state.goal=null;
    }
    if(state.checkedAt!=null&&now-state.checkedAt<2500)return scout;
    state.checkedAt=now;
    const region=scout.type==='marine'?wodAiOperationReach(scout):wodNavalWaterRegionKeys(scout,current);
    if(!region)return null;
    const choices=[],scoutThreats=wodAiThreats(owner,false);
    for(const key of region){
        const h=gameData.hexes[key];if(!h||!wodIsOpenWaterHex(h)||intel.explored.has(key)||state.blocked[key]>now)continue;
        if(!getNeighborHexes(h).some(n=>intel.explored.has(getHexKey(n))))continue;
        const coast=getNeighborHexes(h).some(n=>!isWaterHex(n));
        const danger=scoutThreats.reduce((n,e)=>n+Math.max(0,hr*7-Math.hypot(e.x-h.x,e.y-h.y)),0);
        choices.push({h,score:Math.hypot(scout.x-h.x,scout.y-h.y)+danger*5+(state.history.includes(key)?hr*40:0)-(coast?hr*3:0)});
    }
    choices.sort((a,b)=>a.score-b.score);
    for(const {h}of choices.slice(0,12)){
        if(assignUnitMoveAlongWaypoints(scout,[{x:h.x,y:h.y,intoWater:true}],{transportInternal:true})){
            state.goal=h;state.progressAt=now;state.position={x:scout.x,y:scout.y};scout._aiScoutUntil=now+12000;scout._navalScoutGoal={x:h.x,y:h.y};
            wodAiRecord(owner,'naval-scout',{unit:scout.uid,goal:getHexKey(h)});return scout;
        }
        state.blocked[getHexKey(h)]=now+45000;
    }
    scout._aiScoutUntil=0;scout._navalScoutGoal=null;return null;
}

function wodAiGeneralCanTransfer(unit,targets,supplyShips) {
    if(!unit.isGeneral)return true;
    if(unit.hp<unit.maxHp*.85||unit._medicalRecovering||unit._navalEvacuating)return !!unit._navalEvacuating;
    const owner=unit.owner,hr=gameData.hexRadius||20,known=wodAiThreats(owner,false);
    const here=getNearestHexToPoint(unit.x,unit.y),home=gameData.cities.filter(c=>c.owner===owner&&wodAiCanReach(unit,c));
    if(known.some(e=>home.some(c=>Math.hypot(e.x-c.x,e.y-c.y)<hr*12)))return false;
    for(const target of targets){
        const h=getNearestHexToPoint(target.x,target.y),region=wodTransportLandingRegion(unit,h);if(!region||region.has(getHexKey(here)))continue;
        const friends=gameData.entities.filter(u=>u.owner===owner&&u!==unit&&isLandArmyUnit(u)&&u.hp>u.maxHp*.6&&!u.retreating&&!u.boardTransportUid&&region.has(getHexKey(getNearestHexToPoint(u.x,u.y))));
        if(friends.length<2)continue;
        const foothold=friends.some(u=>{const p=getNearestHexToPoint(u.x,u.y);return p?.owner===owner&&(wodCurrentSupplyComponent(p,owner).city||supplyShips.some(s=>Math.hypot(s.x-p.x,s.y-p.y)<wodFortCombatAuraRadiusPx()*.85));});
        const foes=known.filter(e=>region.has(getHexKey(getNearestHexToPoint(e.x,e.y)))&&friends.some(u=>Math.hypot(e.x-u.x,e.y-u.y)<hr*12));
        const seaFoes=known.filter(e=>e.type==='ship'&&Math.hypot(e.x-h.x,e.y-h.y)<hr*18);
        const escorts=gameData.entities.filter(u=>u.owner===owner&&u.type==='ship'&&u.hp>u.maxHp*.65&&!u.retreating);
        if(foothold&&(!seaFoes.length||wodAiForecast(owner,escorts,seaFoes).ratio>=1.35)&&wodAiForecast(owner,[...friends,unit],foes).ratio>=1.3)return true;
    }
    return false;
}

function wodAiChooseNavalMission(owner, transports, candidates, targets, supplyShips) {
    gameData.aiNavalPlans ||= {};
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,old=gameData.aiNavalPlans[owner];
    const fleet=transports.filter(t=>t.owner===owner&&t.hp>0&&!t._medicalRecovering&&!t.retreating&&!t.moraleBroken&&!(t._aiScoutUntil>now));
    if(!fleet.length){
        if(old?.phase==='handoff'&&!gameData.entities.some(u=>u.owner===owner&&u.type==='transport'&&u.cargo)){
            wodAiRecord(owner,'naval-complete',{job:old.id,goal:old.goal?.id});delete gameData.aiNavalPlans[owner];
        }
        return null;
    }
    const ships=gameData.entities.filter(u=>u.owner===owner&&u.type==='ship'&&u.hp>u.maxHp*.45&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&!(u._aiScoutUntil>now));
    const cargo=fleet.filter(t=>t.cargo).map(t=>t.cargo);
    let landed=gameData.entities.filter(u=>u.owner===owner&&u._navalLanded&&u.hp>0);
    const known=wodAiThreats(owner),naval=known.filter(u=>u.type==='ship');
    const from=fleet[0],home=gameData.cities.filter(c=>c.owner===owner&&cityHasWaterNeighbor(c)).sort((a,b)=>
        wodAiDist2(a.x,a.y,from.x,from.y)-wodAiDist2(b.x,b.y,from.x,from.y))[0];
    let goal=old?.goal;
    const oldRegion=goal&&wodTransportLandingRegion({type:'light',owner},getNearestHexToPoint(goal.x,goal.y));
    const actualGoal=goal&&getNearestHexToPoint(goal.x,goal.y);
    const remainingTown=oldRegion&&wodAiKnownCities(owner).find(c=>oldRegion.has(`${c.q},${c.r}`)&&getCityUrbanTerrainHexes(c).some(h=>!wodIsFriendlyOwner(h.owner,owner)));
    const captured=goal&&(goal.shore||String(goal.id).startsWith('shore-'))?actualGoal&&wodIsFriendlyOwner(actualGoal.owner,owner)&&!remainingTown:
        goal&&gameData.cities.some(c=>c.id===goal.id&&wodIsFriendlyOwner(c.owner,owner)&&getCityUrbanTerrainHexes(c).every(h=>wodIsFriendlyOwner(h.owner,owner)));
    if(old&&captured&&cargo.length){
        old.phase='handoff';old.reason='finish-disembarking';old.canEmbark=false;old.canSail=true;old.checkedAt=now;
        for(const t of fleet.filter(t=>t.cargo)){t._aiFleetId=old.id;t.ferryGoal={x:goal.x,y:goal.y};if(!t.unloadHexKey)wodOrderUnloadTransport(t,t.ferryGoal);}
        return old;
    }
    if(old&&captured&&!cargo.length){
        old.phase='complete';old.canSail=false;old.canEmbark=false;
        wodAiRecord(owner,'naval-complete',{job:old.id,goal:goal.id});
        for(const u of gameData.entities.filter(u=>u.owner===owner)){
            if(u._aiFleetId===old.id){u._aiFleetId=null;u._navalEscortUntil=0;}
            if(u._navalLanded&&oldRegion?.has(getHexKey(getNearestHexToPoint(u.x,u.y)))&&wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city){u._navalLanded=false;u._navalAssaultUntil=0;u._navalAssaultGoal=null;u._needsTransport=false;}
        }
        goal=null;
    }
    if(goal&&remainingTown&&goal.shore)goal=remainingTown;
    const unfinishedTown=goal&&!goal.shore&&gameData.cities.some(c=>c.id===goal.id&&getCityUrbanTerrainHexes(c).some(h=>!wodIsFriendlyOwner(h.owner,owner)));
    const stillHostile=goal&&(unfinishedTown||actualGoal&&wodIsHostileOwner(actualGoal.owner,owner)&&targets.some(t=>t.id===goal.id));
    const stalled=old&&old.phase==='prepare'&&old.reason!=='embark'&&now-old.at>45000;
    if(stalled)wodAiBattlePlan(owner).failures[old.goal.id]={at:now,count:1};
    const regionLanded=landed.filter(u=>oldRegion?.has(getHexKey(getNearestHexToPoint(u.x,u.y))));
    const discoveredTown=goal?.shore&&wodAiKnownCities(owner).some(c=>wodIsHostileOwner(c.owner,owner)&&!oldRegion?.has(`${c.q},${c.r}`));
    const continuing=old&&goal&&!discoveredTown&&old.phase!=='complete'&&old.hexes===gameData.hexes&&!stalled&&stillHostile&&
        (now-old.at<180000||cargo.length||regionLanded.length)&&!(old.phase==='secure'&&now-(old.progressAt||old.at)>90000);
    if(!continuing){
        const ownCities=gameData.cities.filter(c=>c.owner===owner),hostileCities=wodAiKnownCities(owner).filter(c=>wodIsHostileOwner(c.owner,owner));
        const available=targets.filter(t=>{
            const h=getNearestHexToPoint(t.x,t.y);if(!h||t.shore&&!wodIsHostileOwner(h.owner,owner))return false;
            const r=t.shore&&wodTransportLandingRegion({type:'light',owner},h);
            if(r&&ownCities.some(c=>r.has(`${c.q},${c.r}`))&&!hostileCities.some(c=>r.has(`${c.q},${c.r}`)))return false;
            return [...cargo,...candidates].some(u=>!wodAiOperationReach(u).has(getHexKey(h)));
        });
        const score=t=>{
            const danger=known.filter(e=>Math.hypot(e.x-t.x,e.y-t.y)<hr*10).reduce((n,e)=>n+wodAiUnitCombatPower(e),0);
            const failure=wodAiBattlePlan(owner).failures[t.id];
            return wodAiDist2(from.x,from.y,t.x,t.y)/(hr*hr*120)+danger*6+(t.shore?35:0)+(failure&&now-failure.at<90000?30:0);
        };
        const towns=available.filter(t=>!t.shore),objectives=towns.length?towns:available;
        objectives.sort((a,b)=>score(a)-score(b));goal=objectives[0];if(!goal){delete gameData.aiNavalPlans[owner];return null;}
    }
    const goalHex=getNearestHexToPoint(goal.x,goal.y),region=wodTransportLandingRegion({type:'light',owner},goalHex);
    landed=gameData.entities.filter(u=>u.owner===owner&&isLandArmyUnit(u)&&u.hp>0&&!u.boardTransportUid&&!u._medicalRecovering&&region?.has(getHexKey(getNearestHexToPoint(u.x,u.y))));
    const pool=[...cargo,...landed,...candidates.filter(u=>!u._navalEvacuating&&(!u.isGeneral||wodAiGeneralCanTransfer(u,[goal],supplyShips)))].filter((u,i,a)=>a.indexOf(u)===i)
        .sort((a,b)=>wodAiUnitCombatPower(b)-wodAiUnitCombatPower(a));
    const invaders=pool.filter(u=>u.hp>u.maxHp*.5&&!u.moraleBroken&&!u.retreating).slice(0,Math.max(2,Math.min(8,fleet.length*2)));
    const groundEnemies=known.filter(e=>!wodIsNavalUnit(e)&&Math.hypot(e.x-goal.x,e.y-goal.y)<hr*10+(e.uncertainty||0)*.3);
    const seaEnemies=naval.filter(e=>Math.hypot(e.x-goal.x,e.y-goal.y)<hr*16||Math.hypot(e.x-from.x,e.y-from.y)<hr*16);
    const ordinary=invaders.some(u=>u.type!=='marine');
    const friendlyCity=region&&gameData.cities.some(c=>c.owner===owner&&region.has(`${c.q},${c.r}`));
    const requiredSupply=ordinary&&!friendlyCity?1:0;
    const requiredEscorts=seaEnemies.length?Math.min(10,Math.max(1,Math.ceil(seaEnemies.reduce((n,u)=>n+(u._intelConfidence??1),0)*1.2))):0;
    const fireSupport=ships.filter(s=>Math.hypot(s.x-goal.x,s.y-goal.y)<(s.range||80)+hr*4);
    const balance=wodAiForecast(owner,[...invaders,...fireSupport],groundEnemies),seaBalance=wodAiForecast(owner,ships,seaEnemies);
    const missionSupply=supplyShips.filter(s=>!gameData.entities.some(u=>u.owner===owner&&u.hp>0&&u._navalLanded&&u.type!=='marine'&&!wodIsNavalUnit(u)&&
        !region?.has(getHexKey(getNearestHexToPoint(u.x,u.y)))&&!wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city&&
        Math.hypot(s.x-u.x,s.y-u.y)<wodFortCombatAuraRadiusPx()&&!supplyShips.some(other=>other!==s&&Math.hypot(other.x-u.x,other.y-u.y)<wodFortCombatAuraRadiusPx()*.9)));
    const sufficientSupply=missionSupply.length>=requiredSupply;
    const sufficientSea=!seaEnemies.length||ships.length>0&&seaBalance.ratio>=1.1;
    const loaded=fleet.filter(t=>t.cargo),loadedUnits=[...loaded.map(t=>t.cargo),...landed.filter(u=>region?.has(getHexKey(getNearestHexToPoint(u.x,u.y))))];
    const loadedBalance=wodAiForecast(owner,[...loadedUnits,...fireSupport],groundEnemies);
    const profile=wodAiCommander(owner),groundReady=invaders.length>0&&balance.ratio>=profile.ratio;
    const waveReady=loadedUnits.length>0&&loadedBalance.ratio>=Math.max(1.05,profile.ratio-.1);
    const launchFleet=loaded.length?loaded:fleet;
    const startX=launchFleet.reduce((n,t)=>n+t.x,0)/launchFleet.length,startY=launchFleet.reduce((n,t)=>n+t.y,0)/launchFleet.length;
    const hadCrossing=continuing&&['crossing','landing','secure'].includes(old.phase);
    // Ferries may embark from different friendly islands. A rendezvous at their
    // arithmetic midpoint can be on inaccessible land, with every loaded ferry
    // waiting forever. Support joins an actual embarkation lane or the beach.
    const joinsWave=(s,r)=>launchFleet.some(t=>Math.hypot(s.x-t.x,s.y-t.y)<r)||Math.hypot(s.x-goal.x,s.y-goal.y)<r;
    const assembled=hadCrossing||(!requiredSupply||missionSupply.some(s=>joinsWave(s,hr*10)))&&
        (!requiredEscorts||ships.filter(s=>joinsWave(s,hr*12)).length>=Math.min(requiredEscorts,ships.length));
    const reason=!sufficientSupply?'supply':!sufficientSea?'escort':!groundReady?'troops':!assembled?'gathering':!waveReady?'embark':null;
    let phase=hadCrossing?old.phase:'prepare';
    if(!reason)phase=landed.length?'secure':'crossing';
    if(hadCrossing&&(!sufficientSea||!sufficientSupply)&&!landed.length)phase='regroup';
    const mission={id:continuing?old.id:owner+'-naval-'+now,owner,hexes:gameData.hexes,at:continuing?old.at:now,
        checkedAt:now,goal,home,phase,reason,requiredSupply,requiredEscorts,
        requiredTransports:groundEnemies.length?Math.min(6,Math.max(2,Math.ceil(groundEnemies.length/2))):1,
        troops:invaders.map(u=>u.uid),transports:fleet.map(t=>t.uid),escorts:ships.map(u=>u.uid),
        support:missionSupply.map(u=>u.uid),forceRatio:balance.ratio,seaRatio:seaBalance.ratio,
        canEmbark:sufficientSupply&&sufficientSea&&groundReady,canSail:sufficientSupply&&sufficientSea&&waveReady&&assembled};
    const progress=landed.length+gameData.cities.filter(c=>c.owner===owner&&region?.has(`${c.q},${c.r}`)).length*10+
        (region?[...region].filter(k=>wodIsFriendlyOwner(gameData.hexes[k]?.owner,owner)).length*.01:0);
    mission.progress=progress;mission.progressAt=continuing&&old.progress===progress?old.progressAt||old.at:now;
    gameData.aiNavalPlans[owner]=mission;
    for(const t of fleet)if(t._aiFerryMission&&(t.cargo||t.pickupUid)&&!t.cargo?._navalEvacuating){
        const newDestination=t._aiFleetId!==mission.id||t.ferryGoal&&Math.hypot(t.ferryGoal.x-goal.x,t.ferryGoal.y-goal.y)>hr*8;
        t._aiFleetId=mission.id;
        if(newDestination){t.unloadHexKey=null;t.unloadGoal=null;wodClearTransportMove(t);}
        if(newDestination||!t.unloadHexKey)t.ferryGoal={x:goal.x,y:goal.y};
        if(t.cargo&&newDestination&&mission.canSail)wodOrderUnloadTransport(t,t.ferryGoal);
    }
    for(const ship of [...ships,...missionSupply]){
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

function wodAiCorridorWithdrawal(unit) {
    const defense=gameData._aiDefenseByOwner?.[unit.owner];
    if(!defense||defense.hexes!==gameData.hexes)return null;
    const hr=gameData.hexRadius||20;
    for(const cut of defense.corridors||[]){
        if(!cut.riskUnits?.has(unit.uid))continue;
        const threats=wodAiThreats(unit.owner).filter(e=>Math.hypot(e.x-cut.holdHex.x,e.y-cut.holdHex.y)<hr*8);
        const help=gameData.entities.filter(u=>u.owner===unit.owner&&!u.boardTransportUid&&!wodIsNavalUnit(u)&&u.type!=='convoy'&&Math.hypot(u.x-cut.holdHex.x,u.y-cut.holdHex.y)<hr*6);
        if(threats.length&&(wodAiForecast(unit.owner,help,threats).ratio<1.05||cut.predictive&&cut.closureSeconds<cut.withdrawSeconds*1.25+4))return cut;
    }
    return null;
}

function wodAiSupplyRetreatHop(unit,defense) {
    let at=getNearestHexToPoint(unit.x,unit.y),best=null;
    const distance=h=>defense?.supplyDistance?.get(getHexKey(h))??Infinity,hr=gameData.hexRadius||20;
    if(!at||!Number.isFinite(distance(at)))return null;
    for(let step=0;step<6;step++){
        const choices=[];wodSupplyNeighbors(at,h=>{if(distance(h)<distance(at)&&canUnitEnterHex(unit,h)&&wodCanStepBetweenHexes(unit,at,h,true))choices.push(h);});
        choices.sort((a,b)=>distance(a)-distance(b));const next=choices[0];if(!next)break;
        // A shortest dry route may cut across the hostile corner of a salient.
        // Advance only as far as the direct chord stays on supplied terrain.
        let safe=true;const n=Math.max(1,Math.ceil(Math.hypot(next.x-unit.x,next.y-unit.y)/(hr*.45)));
        for(let i=1;i<=n;i++){const h=getNearestHexToPoint(unit.x+(next.x-unit.x)*i/n,unit.y+(next.y-unit.y)*i/n);if(!h||!wodSupplyPassable(h,unit.owner)||!canUnitEnterHex(unit,h)){safe=false;break;}}
        if(!safe)break;best=next;at=next;
    }
    return best;
}

function wodAiTownDefenseThreats(owner,army) {
    const hr=gameData.hexRadius||20,foes=wodAiThreats(owner,false).filter(e=>isLandArmyUnit(e));
    let cache=gameData._aiTownApproaches;
    if(cache?.hexes!==gameData.hexes)cache=gameData._aiTownApproaches={hexes:gameData.hexes,owners:{}};
    const previous=cache.owners[owner]||{},now=wodAiOperationTime();
    const result=gameData.cities.filter(c=>c.owner===owner).flatMap(city=>{
        const enemies=foes.filter(e=>{
            const distance=Math.hypot(e.x-city.x,e.y-city.y),old=previous[e.uid];
            const approaching=old&&now>old.at&&Math.hypot(old.x-city.x,old.y-city.y)-distance>hr*.25;
            return distance<hr*14&&(distance<hr*9||approaching)&&wodAiCanReach(e,city);
        });
        if(!enemies.length)return [];
        const power=enemies.reduce((n,e)=>n+wodAiUnitCombatPower(e),0);
        const plan=gameData.aiTaskForces?.[owner],guards=new Set(plan?.jobs.filter(j=>j.kind==='defend'&&j.city?.id===city.id).flatMap(j=>j.members)||[]);
        if(!guards.size){const guard=army.filter(u=>u.type==='light'&&Math.hypot(u.x-city.x,u.y-city.y)<hr*3).sort((a,b)=>Math.hypot(a.x-city.x,a.y-city.y)-Math.hypot(b.x-city.x,b.y-city.y))[0];if(guard)guards.add(guard.uid);}
        const garrisonPower=army.filter(u=>guards.has(u.uid)&&u.hp>0&&!u._medicalRecovering&&!u.retreating&&Math.hypot(u.x-city.x,u.y-city.y)<hr*4)
            .reduce((n,u)=>n+wodAiUnitCombatPower(u),0);
        const reinforcementPower=Math.max(0,power*1.2-garrisonPower);
        if(reinforcementPower<.3)return [];
        return [{id:'town-relief-'+city.id,kind:'counter',role:'counter',city,holdHex:getNearestHexToPoint(city.x,city.y),
            enemies:enemies.length,enemyIds:enemies.map(e=>e.uid),score:850+power*25,neededPower:reinforcementPower}];
    });
    cache.owners[owner]=Object.fromEntries(foes.map(e=>[e.uid,{x:e.x,y:e.y,at:now}]));
    return result;
}

// One response line and commitment for the group. Local evasive orders cannot
// keep peeling away the troops needed to clear a town's production approaches.
function wodAiIssueTownDefense(unit,job) {
    if(job.kind!=='counter')return false;
    const hr=gameData.hexRadius||20,now=wodAiOperationTime(),owner=unit.owner;
    let cache=gameData._aiDefensiveManeuvers;
    if(cache?.hexes!==gameData.hexes)cache=gameData._aiDefensiveManeuvers={hexes:gameData.hexes,byId:{}};
    let state=cache.byId[job.id];
    if(!state||now-state.at>=1800){
        const army=gameData.entities.filter(u=>u.owner===owner&&u.hp>u.maxHp*.34&&!u.boardTransportUid&&!u._medicalRecovering&&!u.moraleBroken&&!wodIsNavalUnit(u)&&u.type!=='convoy');
        const members=army.filter(u=>job.members.includes(u.uid)||u.type==='light'&&Math.hypot(u.x-job.city.x,u.y-job.city.y)<hr*4);
        const foes=wodAiThreats(owner,false).filter(e=>job.enemyIds.includes(e.uid));
        if(!members.length||!foes.length)return false;
        const cx=members.reduce((n,u)=>n+u.x,0)/members.length,cy=members.reduce((n,u)=>n+u.y,0)/members.length;
        const ex=foes.reduce((n,u)=>n+u.x,0)/foes.length,ey=foes.reduce((n,u)=>n+u.y,0)/foes.length;
        const lead=members.find(u=>!wodCanClimb(u))||members[0],reach=wodAiOperationReach(lead);
        let anchor=state?.anchor;
        if(!anchor||anchor.owner!==owner||now-(state.anchorAt||0)>10000||foes.some(e=>Math.hypot(e.x-anchor.x,e.y-anchor.y)<hr*2)){
            const points=getHexesInRadius(job.city.q,job.city.r,6).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&h.owner===owner&&!isWaterHex(h)&&reach.has(getHexKey(h))&&canUnitEnterHex(lead,h)&&wodCurrentSupplyComponent(h,owner).city);
            const score=h=>Math.hypot(h.x-cx,h.y-cy)*.3+Math.hypot(h.x-job.city.x,h.y-job.city.y)*1.2+
                foes.reduce((n,e)=>n+Math.max(0,(e.range||50)+hr*2-Math.hypot(e.x-h.x,e.y-h.y))*3,0)-
                (1-getTerrainDefenseModifier(lead,h))*hr*4;
            points.sort((a,b)=>score(a)-score(b));anchor=points[0]||job.holdHex;
        }
        const balance=wodAiForecast(owner,members,foes),gathered=members.filter(u=>Math.hypot(u.x-anchor.x,u.y-anchor.y)<hr*6);
        const localBalance=wodAiForecast(owner,gathered,foes.filter(e=>Math.hypot(e.x-anchor.x,e.y-anchor.y)<hr*10));
        const close=foes.some(e=>Math.hypot(e.x-job.city.x,e.y-job.city.y)<hr*9);
        const attack=close&&(state?.attack?balance.ratio>=.88&&localBalance.ratio>=.8:
            balance.ratio>=1.08&&localBalance.ratio>=1&&gathered.length>=Math.ceil(members.length*.7));
        state=cache.byId[job.id]={at:now,anchor,anchorAt:anchor===state?.anchor?state.anchorAt:now,members:members.map(u=>u.uid),foes,ex,ey,attack,ratio:balance.ratio};
        wodAiRecord(owner,'town-response',{job:job.id,phase:attack?'counterattack':'gather',troops:members.length,ratio:Math.round(balance.ratio*100)/100});
    }
    const rank=Math.max(0,state.members.slice().sort().indexOf(unit.uid));
    let target=state.anchor;
    if(state.attack){
        const foe=state.foes.slice().sort((a,b)=>Math.hypot(unit.x-a.x,unit.y-a.y)-Math.hypot(unit.x-b.x,unit.y-b.y))[0];
        if(foe){const dx=state.anchor.x-foe.x,dy=state.anchor.y-foe.y,base=Math.atan2(dy,dx),angle=base+(rank%5-2)*.5,range=(unit.range||50)*.8;
            const stand=getNearestHexToPoint(foe.x+Math.cos(angle)*range,foe.y+Math.sin(angle)*range);
            const points=getHexesInRadius(stand.q,stand.r,2).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&!isWaterHex(h)&&canUnitEnterHex(unit,h)&&wodAiCanReach(unit,h));
            const used=state.targets||=( {} );
            const score=h=>Math.hypot(h.x-stand.x,h.y-stand.y)+Math.abs(Math.hypot(h.x-foe.x,h.y-foe.y)-(unit.range||50)*.75)*2+
                Object.entries(used).filter(([id,p])=>id!==unit.uid&&Math.hypot(p.x-h.x,p.y-h.y)<(unit.radius||12)*2+8).length*hr*30;
            points.sort((a,b)=>score(a)-score(b));target=points[0]||stand;used[unit.uid]={x:target.x,y:target.y};
        }
    }else{
        const dx=state.ex-state.anchor.x,dy=state.ey-state.anchor.y,len=Math.hypot(dx,dy)||1,lane=(rank%5-2)*hr*1.7;
        const slot=getNearestHexToPoint(state.anchor.x-dy/len*lane-dx/len*Math.floor(rank/5)*hr*2,state.anchor.y+dx/len*lane-dy/len*Math.floor(rank/5)*hr*2);
        if(slot?.owner===owner&&!isWaterHex(slot)&&canUnitEnterHex(unit,slot)&&wodAiCanReach(unit,slot))target=slot;
    }
    if(!target||!canUnitEnterHex(unit,target)||isWaterHex(target)||!wodAiCanReach(unit,target))target=state.anchor;
    if(unit.target&&unit._aiTownResponse?.id===job.id&&unit._aiTownResponse.phase===state.attack&&now-unit._aiTownResponse.at<5000&&
        Math.hypot(unit.x-unit._aiTownResponse.x,unit.y-unit._aiTownResponse.y)>hr*.35)return true;
    const moved=wodAiMoveUnitTowardHex(unit,target,!state.attack,.1);
    if(moved){unit._aiTownResponse={id:job.id,at:now,x:unit.x,y:unit.y,phase:state.attack};unit._aiRegroupUntil=0;wodAiStampOrder(unit,!state.attack,target,2500);}
    return true;
}

function wodAiReliefStandHex(unit,job,trapped) {
    const anchor=trapped?job.innerHex:job.holdHex,hr=gameData.hexRadius||20;
    if(!anchor)return null;
    const ids=(trapped?job.trapped:job.members.filter(id=>!job.trapped?.includes(id))).slice().sort();
    const rank=Math.max(0,ids.indexOf(unit.uid)),lane=rank%5-2;
    const dx=job.holdHex.x-job.innerHex.x,dy=job.holdHex.y-job.innerHex.y,len=Math.hypot(dx,dy)||1;
    const x=anchor.x-dy/len*lane*hr*1.35,y=anchor.y+dx/len*lane*hr*1.35;
    const reach=wodAiOperationReach(unit);
    const points=getHexesInRadius(anchor.q,anchor.r,3).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&reach.has(getHexKey(h))&&canUnitEnterHex(unit,h)&&(!isWaterHex(h)||isBridgeHex(h)));
    const used=job._reliefTargets||=( {} );
    points.sort((a,b)=>{
        const score=h=>wodAiDist2(h.x,h.y,x,y)+Math.abs((h.x-anchor.x)*dx+(h.y-anchor.y)*dy)/len*hr*4+
            Object.entries(used).filter(([id,key])=>id!==unit.uid&&key===getHexKey(h)).length*hr*hr*10;
        return score(a)-score(b);
    });
    const target=points[0]||anchor;used[unit.uid]=getHexKey(target);return target;
}

function wodAiCorridorStandHex(unit,job) {
    const cut=job.cutHexes,hr=gameData.hexRadius||20;
    if(!cut?.length)return wodAiDefendStandHex(unit.owner,job.holdHex,unit);
    const ids=job.members.slice().sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),rank=Math.max(0,ids.indexOf(unit.uid));
    const endpoint=cut[rank%2?cut.length-1:0],center=job.holdHex;
    const axis={x:cut[cut.length-1].x-cut[0].x,y:cut[cut.length-1].y-cut[0].y},length=Math.hypot(axis.x,axis.y)||1;
    const used=job._corridorTargets||=( {} ),points=[],reach=wodAiOperationReach(unit);
    for(const p of getHexesInRadius(endpoint.q,endpoint.r,4)){
        const h=gameData.hexes[p.q+','+p.r];if(!h||!reach.has(getHexKey(h))||!wodSupplyPassable(h,unit.owner)||!canUnitEnterHex(unit,h)||isWaterHex(h)&&!isBridgeHex(h))continue;
        // Guard the hostile-facing ends, leaving the middle of a wider passage
        // clear for retreating columns instead of stacking at its center.
        const inward=((h.x-endpoint.x)*axis.x+(h.y-endpoint.y)*axis.y)/length*(rank%2?-1:1);
        if(cut.length>=3&&inward>hr*.8)continue;
        const separation=Object.entries(used).filter(([id,point])=>id!==unit.uid&&Math.hypot(point.x-h.x,point.y-h.y)<(unit.radius||12)*2+7).length;
        const score=wodAiDist2(h.x,h.y,endpoint.x,endpoint.y)+separation*hr*hr*80+
            Math.hypot(h.x-unit.x,h.y-unit.y)*hr*.12-(1-getTerrainDefenseModifier(unit,h))*hr*hr*8;
        points.push({h,score});
    }
    points.sort((a,b)=>a.score-b.score);const target=points[0]?.h||center;
    used[unit.uid]={x:target.x,y:target.y};return target;
}

function wodAiSharedFallbackHex(unit,job,local,cut,defense) {
    const hr=gameData.hexRadius||20,now=wodAiOperationTime(),owner=unit.owner;
    const towns=gameData.cities.filter(c=>c.owner===owner&&wodAiCanReach(unit,c));
    towns.sort((a,b)=>Math.hypot(a.x-unit.x,a.y-unit.y)-Math.hypot(b.x-unit.x,b.y-unit.y));
    const city=towns[0];if(!city)return null;
    let cache=gameData._aiFallbackLines;
    if(cache?.hexes!==gameData.hexes)cache=gameData._aiFallbackLines={hexes:gameData.hexes,lines:{}};
    const key=owner+':'+(cut?.id||job?.id||city.id),old=cache.lines[key];
    let anchor=old?.anchor;
    if(!anchor||anchor.owner!==owner||now-old.at>12000||local.enemies.some(e=>Math.hypot(e.x-anchor.x,e.y-anchor.y)<hr*3)){
        const dx=city.x-unit.x,dy=city.y-unit.y,len=Math.hypot(dx,dy)||1,span=Math.min(len,hr*8);
        const center=getNearestHexToPoint(unit.x+dx/len*span,unit.y+dy/len*span),reach=wodAiOperationReach(unit);
        const points=getHexesInRadius(center.q,center.r,4).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&h.owner===owner&&!isWaterHex(h)&&canUnitEnterHex(unit,h)&&reach.has(getHexKey(h))&&wodCurrentSupplyComponent(h,owner).city);
        const score=h=>Math.hypot(h.x-center.x,h.y-center.y)+local.enemies.reduce((n,e)=>n+Math.max(0,hr*6-Math.hypot(e.x-h.x,e.y-h.y))*4,0)+(getTerrainDefenseModifier(unit,h)-1)*hr*3;
        points.sort((a,b)=>score(a)-score(b));anchor=points[0];
        if(!anchor)return null;cache.lines[key]={at:now,anchor};
        if(Object.keys(cache.lines).length>96)cache.lines=Object.fromEntries(Object.entries(cache.lines).sort((a,b)=>b[1].at-a[1].at).slice(0,64));
    }
    // While a corridor is still open, follow the supply graph to its safe side.
    // Keep the agreed fallback line once the column has cleared that passage.
    if(cut&&Math.hypot(unit.x-anchor.x,unit.y-anchor.y)>hr*5){const hop=wodAiSupplyRetreatHop(unit,defense);if(hop)return hop;}
    const ids=(cut?.riskUnits?[...cut.riskUnits]:job?.members||local.allies.map(u=>u.uid)).slice().sort(),rank=Math.max(0,ids.indexOf(unit.uid));
    const dx=city.x-anchor.x,dy=city.y-anchor.y,len=Math.hypot(dx,dy)||1,lane=(rank%5-2)*hr*1.7;
    const slot=getNearestHexToPoint(anchor.x-dy/len*lane+dx/len*Math.floor(rank/5)*hr*2,anchor.y+dx/len*lane+dy/len*Math.floor(rank/5)*hr*2);
    return slot?.owner===owner&&!isWaterHex(slot)&&canUnitEnterHex(unit,slot)&&wodCurrentSupplyComponent(slot,owner).city&&!isWorldPositionBlockedByUnits(unit,slot.x,slot.y)&&wodAiCanReach(unit,slot)?slot:anchor;
}

function wodAiTacticalFallback(unit,job,issue=true) {
    if(!unit||wodIsNavalUnit(unit)||unit.type==='convoy'||unit.boardTransportUid||unit._medicalRecovering)return false;
    const local=wodAiLocalSituation(unit),cut=wodAiCorridorWithdrawal(unit),now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    const recovering=(unit._aiRegroupUntil||0)>now&&local.enemies.length&&local.forecast.ratio<1.12;
    if(job?.kind==='relief'){
        if(job._reliefCheckAt==null||now-job._reliefCheckAt>=900){
            job._reliefCheckAt=now;
            const army=gameData.entities.filter(u=>job.members.includes(u.uid)&&u.hp>u.maxHp*.34&&!u.moraleBroken&&!u._medicalRecovering);
            const near=army.filter(u=>wodAiArrivalSeconds(u,job.pocketKeys?.has(getHexKey(getNearestHexToPoint(u.x,u.y)))?job.innerHex:job.holdHex,hr*2.5,18)<=18);
            const enemies=wodAiThreats(unit.owner).filter(e=>Math.hypot(e.x-job.holdHex.x,e.y-job.holdHex.y)<hr*8);
            job.breakoutBalance=wodAiForecast(unit.owner,near,enemies);
            const urgent=army.some(u=>(u.outOfSupplySeconds||0)>=4);
            job.breakoutReady=near.length>=Math.ceil(army.length*.6)&&job.breakoutBalance.ratio>=(urgent?.88:1.05);
            if(job.breakoutReady)for(const u of army)u._aiReliefCommitUntil=now+4000;
            if(job.breakoutReady)wodAiRecord(unit.owner,'breakout-commit',{job:job.id,troops:near.length,ratio:Math.round(job.breakoutBalance.ratio*100)/100});
        }
        // Both sides of a winnable breach commit together. Per-unit fallback
        // must not peel off the leading troops as their support approaches.
        if(job.breakoutReady||unit._aiReliefCommitUntil>now&&job.breakoutBalance?.ratio>=.85){unit._aiRegroupUntil=0;return false;}
    }
    // A healthy rear guard may briefly delay a moderately stronger force while
    // the exposed army exits. Do not flee the choke before that army can move.
    if(job?.kind==='corridor'&&job.delayUnits?.has(unit.uid)&&job.riskUnits?.size&&unit.hp>unit.maxHp*(unit.isGeneral?.75:.55)){
        if(job._screenCheckAt==null||now-job._screenCheckAt>=900){
            job._screenCheckAt=now;
            const helpers=gameData.entities.filter(u=>job.members.includes(u.uid)&&!u._medicalRecovering&&wodAiArrivalSeconds(u,job.holdHex,hr*3,12)<=12);
            const foes=wodAiThreats(unit.owner).filter(e=>Math.hypot(e.x-job.holdHex.x,e.y-job.holdHex.y)<hr*8);
            job.screenBalance=wodAiForecast(unit.owner,helpers,foes);
        }
        if(!local.enemies.length)return false;
        if(unit._aiDelayCorridor?.id!==job.id)unit._aiDelayCorridor={id:job.id,at:now};
        if(now-unit._aiDelayCorridor.at<18000&&Math.max(local.forecast.ratio,job.screenBalance?.ratio||0)>=.65){wodAiRecord(unit.owner,'delay-cover',{unit:unit.uid,job:job.id,reason:'cover-withdrawal'});return false;}
    }
    if(!local.retreat&&!cut&&!recovering){unit._aiRegroupUntil=0;unit._aiWithdrawal=null;return false;}
    if(!issue)return true;
    if(unit.target&&unit._aiWithdrawal&&now-unit._aiWithdrawal.at<7000&&
        (Math.hypot(unit.x-unit._aiWithdrawal.x,unit.y-unit._aiWithdrawal.y)>hr*.3||now-unit._aiWithdrawal.at<3000))return true;
    const start=getNearestHexToPoint(unit.x,unit.y),reach=wodAiOperationReach(unit),defense=gameData._aiDefenseByOwner?.[unit.owner];
    const rootDistance=h=>defense?.supplyDistance?.get(getHexKey(h))??Infinity;
    const currentRoot=rootDistance(start),candidates=[];
    for(const p of getHexesInRadius(start.q,start.r,10)){
        const h=gameData.hexes[p.q+','+p.r];if(!h||isWaterHex(h)&&unit.type!=='marine'||!isWaterHex(h)&&!wodIsFriendlyOwner(h.owner,unit.owner)||!reach.has(getHexKey(h))||!canUnitEnterHex(unit,h)||isWorldPositionBlockedByUnits(unit,h.x,h.y))continue;
        const marineSupply=unit.type==='marine'&&(isWaterHex(h)||getNeighborHexes(h).some(isWaterHex));
        if(!wodCurrentSupplyComponent(h,unit.owner).city&&!marineSupply&&!job?.pocketKeys?.has(getHexKey(h)))continue;
        const d=Math.hypot(h.x-unit.x,h.y-unit.y);if(d<hr*1.5||d>hr*10)continue;
        const danger=local.enemies.reduce((n,e)=>n+Math.max(0,(e.range||50)+hr*4-Math.hypot(e.x-h.x,e.y-h.y))**2*(e._intelConfidence??1),0);
        const support=local.allies.reduce((n,u)=>n+(Math.hypot(u.x-h.x,u.y-h.y)<hr*4?1:0),0);
        const progress=Number.isFinite(currentRoot)?Math.max(-12,Math.min(12,currentRoot-rootDistance(h))):0;
        const cover=1/getTerrainDefenseModifier(unit,h);
        const score=-danger/(hr*hr)*3+support*2+cover*3+progress*(cut?5:.35)-d/hr*.45;
        candidates.push({h,score});
    }
    candidates.sort((a,b)=>b.score-a.score);const safe=wodAiSharedFallbackHex(unit,job,local,cut,defense)||cut&&wodAiSupplyRetreatHop(unit,defense)||candidates[0]?.h;
    if(!safe)return false;
    unit._aiRegroupUntil=now+8000;unit._aiFallbackAt=now;unit.aiCaptureHexKey=null;
    const moved=wodAiMoveUnitTowardHex(unit,safe,true,.08);
    if(moved){unit._aiWithdrawal={at:now,x:unit.x,y:unit.y};wodAiStampOrder(unit,true,safe,7000);unit.aiOrderPhase='regroup';wodAiRecord(unit.owner,'withdraw',{unit:unit.uid,reason:cut?'supply-corridor':'local-disadvantage',ratio:Math.round(local.forecast.ratio*100)/100});}
    return true;
}

// A visible enemy supply neck is a better objective than another frontal charge.
function wodAiCutObjective(owner,members) {
    const lead=members.find(u=>!wodCanClimb(u))||members[0];if(!lead||members.length<2)return null;
    const hr=gameData.hexRadius||20,now=wodAiOperationTime(),context=wodAiCombatContext(owner);
    const enemies=wodAiThreats(owner,false).filter(u=>!wodIsNavalUnit(u)&&u.type!=='marine');
    if(enemies.length<2)return null;
    const centers=enemies.slice().sort((a,b)=>wodAiDist2(a.x,a.y,lead.x,lead.y)-wodAiDist2(b.x,b.y,lead.x,lead.y));
    const center=centers[0],cluster=enemies.filter(e=>Math.hypot(e.x-center.x,e.y-center.y)<hr*9);
    if(cluster.length<2)return null;
    const hostile=center.owner,towns=wodAiKnownCities(owner).filter(c=>c.owner===hostile),reach=wodAiOperationReach(lead);
    if(!towns.length)return null;
    const explored=wodFogActive()?wodFogFactionIntel(owner).explored:null;
    const pass=h=>h&&!isWaterHex(h)&&wodIsFriendlyOwner(h.owner,hostile)&&(!explored||explored.has(getHexKey(h)));
    const roots=towns.map(c=>gameData.hexes[c.q+','+c.r]).filter(pass);
    if(!roots.length)return null;
    const baseKey='cut-base:'+hostile;
    if(!context[baseKey]){
        const seen=new Set(roots.map(getHexKey)),queue=roots.slice();
        for(let i=0;i<queue.length;i++)for(const d of cardinalHexDirections){const h=gameData.hexes[(queue[i].q+d.q)+','+(queue[i].r+d.r)],k=h&&getHexKey(h);if(!pass(h)||seen.has(k))continue;seen.add(k);queue.push(h);}
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
    let best=null;
    for(const {h} of candidates.slice(0,10)){
        const key=owner+':cut:'+getHexKey(h)+':'+connectedCluster.map(u=>u.uid).join(',');let isolated=context[key];
        if(isolated==null){
            const removed=new Set([getHexKey(h)]),seen=new Set(),queue=roots.filter(r=>!removed.has(getHexKey(r)));
            queue.forEach(r=>seen.add(getHexKey(r)));
            for(let i=0;i<queue.length;i++)for(const d of cardinalHexDirections){const n=gameData.hexes[(queue[i].q+d.q)+','+(queue[i].r+d.r)],k=n&&getHexKey(n);if(!pass(n)||seen.has(k)||removed.has(k))continue;seen.add(k);queue.push(n);}
            isolated=connectedCluster.filter(e=>!seen.has(getHexKey(getNearestHexToPoint(e.x,e.y)))).length;context[key]=isolated;
        }
        if(isolated<2||!wodAiAssaultBalance(owner,members,h).ready)continue;
        const value=isolated*20-Math.hypot(h.x-lead.x,h.y-lead.y)/hr;
        if(!best||value>best.value)best={h,value,isolated};
    }
    if(!best)return null;
    const home=getNearestHexToPoint(lead.x,lead.y);
    return {objectiveHex:best.h,attackHex:best.h,holdHex:wodIsFriendlyOwner(home.owner,owner)?home:undefined,
        phase:'assemble',phaseAt:now,operationAt:now,cutoff:true,cutoffTroops:best.isolated};
}
function wodAiRefreshRally(owner,job,members,goal){
 const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
 if(!members.length||job._rallyAt!=null&&now-job._rallyAt<4000)return;
 job._rallyAt=now;
 const plan=gameData.aiTaskForces?.[owner],own=members.filter(u=>plan?.unitJob[u.uid]===job.id);
 const force=own.length?own:members,cx=force.reduce((n,u)=>n+u.x,0)/force.length,cy=force.reduce((n,u)=>n+u.y,0)/force.length;
 const center=getNearestHexToPoint(cx,cy),lead=force[0],reach=wodAiOperationReach(lead),threats=wodAiThreats(owner,false);
 if(!center)return;
 const current=job.holdHex||center,oldDistance=Math.hypot(current.x-goal.x,current.y-goal.y);
 let best=null,score=Infinity;
 for(const p of getHexesInRadius(center.q,center.r,6)){
  const h=gameData.hexes[p.q+','+p.r];if(!h||isWaterHex(h)||!wodIsFriendlyOwner(h.owner,owner)||!reach.has(getHexKey(h))||!canUnitEnterHex(lead,h)||!wodCurrentSupplyComponent(h,owner).city)continue;
  if(threats.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<(e.range||50)+hr*2))continue;
  const d=Math.hypot(h.x-goal.x,h.y-goal.y);if(d>oldDistance-hr*2)continue;
  const value=Math.hypot(h.x-cx,h.y-cy)*1.5+d*.6;if(value<score){score=value;best=h;}
 }
 if(best)job.holdHex=best;
}
