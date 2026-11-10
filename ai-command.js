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
        assignments:gameData.entities.filter(u=>u.owner===owner&&u.hp>0).map(u=>({unit:u.uid,mission:u._aiMission?.id,duty:u._aiWork?.duty,blockedBy:u._aiWork?.blockedBy,idleSeconds:Math.max(0,(wodAiOperationTime()-(u._aiWork?.progressAt??wodAiOperationTime()))/1000),ferry:u.boardTransportUid||u._aiEvacFerry,cargo:u.cargo?.uid})),
        economy:economy&&{desired:economy.desired,savingFor:economy.savingFor,reservation:economy.reservation&&{type:economy.reservation.type,since:economy.reservation.since},opening:economy.openingEconomy,investment:economy.economyReservation,idleReason:economy.idleReason,shortage:economy.shortage},
        defense:plan?.defenseDemand,operations:plan?.jobs.filter(j=>j.stage).map(j=>({id:j.id,stage:j.stage,reason:j.stageReason,members:j.members.length,goal:j.objectiveCity?.id||j.objectiveHex&&getHexKey(j.objectiveHex)})),
        counts:{...log?.counts},events:log?.events.slice()||[]};
}

// Observe physical work independently of command leases. Retrying an order or
// changing its name cannot make a stationary unit look productive.
function wodAiObserveWork(unit,duty,blockedBy=null) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    let w=unit._aiWork;
    if(w?.hexes!==gameData.hexes)w=unit._aiWork={hexes:gameData.hexes,x:unit.x,y:unit.y,hp:unit.hp,progressAt:now};
    if(unit._combatEngaged||unit.hp>w.hp+.1||Math.hypot(unit.x-w.x,unit.y-w.y)>hr*.7){w.x=unit.x;w.y=unit.y;w.progressAt=now;}
    w.hp=unit.hp;w.duty=duty;w.blockedBy=blockedBy;
    return w;
}

function wodAiNavalMissionStore(owner) {
    gameData.aiNavalPlans||={};
    let state=gameData._aiSeaMissions;
    if(state?.hexes!==gameData.hexes||state.plans!==gameData.aiNavalPlans)state=gameData._aiSeaMissions={hexes:gameData.hexes,plans:gameData.aiNavalPlans,owners:{}};
    return state.owners[owner]||=(new Map());
}
function wodAiMissionForVessel(unit) {
    const primary=gameData.aiNavalPlans?.[unit.owner];
    if(primary?.id===unit._aiFleetId)return primary;
    return [...wodAiNavalMissionStore(unit.owner).values()].find(m=>m.id===unit._aiFleetId)||null;
}

function wodAiCityCanTrain(city,type,owner) {
    if(['heavy','motorized'].includes(type))return !!city.hasFactory;
    if(wodIsNavalType(type))return !!city.hasHarbor&&wodAiHarborUseful(city,owner);
    return type!=='marine'||cityHasWaterNeighbor(city);
}

function wodAiProductionAvailable(city,type,owner) {
    return city.owner===owner&&!wodCityProductionJob(city)&&!isCitySiegeBlockedForProduction(city)&&
        wodAiCityCanTrain(city,type,owner)&&!!findSpawnHex(type,city,owner);
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

const wodAiLandingSeaCache=new WeakMap();
function wodAiLandingOnSea(owner,goal,sea) {
    if(!sea||!goal)return false;
    const region=wodTransportLandingRegion({type:'light',owner},getNearestHexToPoint(goal.x,goal.y));if(!region)return false;
    let cached=wodAiLandingSeaCache.get(sea);if(!cached){cached=new WeakMap();wodAiLandingSeaCache.set(sea,cached);}
    if(cached.has(region))return cached.get(region);
    for(const key of region){const h=gameData.hexes[key];if(h&&getNeighborHexes(h).some(n=>sea.has(getHexKey(n)))){cached.set(region,true);return true;}}
    cached.set(region,false);return false;
}

function wodAiRecruitTownFits(city,type,demand) {
    return !(wodIsNavalType(type)||type==='marine')||!demand.expedition?.sea||wodAiCityOnSea(city,demand.expedition.sea);
}

// Reinforce the fronts this army can influence. Counting every opposing tank
// on the map makes multi-front countries spend their infantry budget on armor.
function wodAiRecruitThreats(owner,known,army) {
    const context=wodAiCombatContext(owner);if(context.recruitThreats)return context.recruitThreats;
    const hr=gameData.hexRadius||20,anchors=[...gameData.cities.filter(c=>c.owner===owner),
        ...army.filter(u=>isLandArmyUnit(u)&&!u.boardTransportUid),
        ...wodAiActiveFrontOperations(owner).map(o=>o.strategicGoal||o.advanceGoal||o.goal).filter(Boolean)];
    return context.recruitThreats=known.filter(e=>!wodIsNavalUnit(e)&&anchors.some(a=>Math.hypot(e.x-a.x,e.y-a.y)<hr*24+(e.uncertainty||0)*.25));
}

function wodAiForceRequests(owner,cities,army,pending) {
    const now=wodAiOperationTime(),plan=gameData.aiTaskForces?.[owner];if(!plan)return [];
    const old=plan.recruitRequests;
    if(old&&now-old.at<3000&&old.n===army.length&&old.pending===pending.length)return old.requests;
    const known=wodAiThreats(owner),used=new Set(),missions=[];
    for(const op of wodAiActiveFrontOperations(owner)){
        const members=army.filter(u=>op.members.includes(u.uid));members.forEach(u=>used.add(u.uid));
        const base=plan.jobs.find(j=>members.some(u=>plan.unitJob[u.uid]===j.id));
        missions.push({id:op.id,squad:op.id,group:base?.id,goal:op.strategicGoal&&wodIsHostileOwner(op.strategicGoal.owner,owner)?op.strategicGoal:op.advanceGoal||op.goal,members,front:op.frontOwner||op.hostile,capacity:op.capacity||6});
    }
    for(const j of plan.jobs.filter(j=>['main','armor','raid'].includes(j.kind)&&j.members.length)){
        const members=army.filter(u=>j.members.includes(u.uid)&&!used.has(u.uid));if(!members.length)continue;
        missions.push({id:j.id,group:j.id,goal:j.objectiveCity||j.objectiveHex||j.attackHex,members,front:j.frontOwner});
    }
    const requests=[];
    for(const m of missions.slice(0,20)){
        if(!m.goal||!wodIsHostileOwner(m.goal.owner,owner))continue;
        const ready=m.members.filter(u=>u.hp>u.maxHp*.6&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken);
        const foes=known.filter(e=>Math.hypot(e.x-m.goal.x,e.y-m.goal.y)<(gameData.hexRadius||20)*9);
        const needPower=foes.reduce((n,e)=>n+wodAiUnitCombatPower(e),0)*wodAiAttackThreshold(owner),power=ready.reduce((n,u)=>n+wodAiUnitCombatPower(u),0);
        const queued=pending.filter(j=>j._aiReinforceFor===m.id).length;
        const capacity=m.capacity||6;
        const need=Math.min(capacity-ready.length,Math.max(3-ready.length,Math.ceil(needPower-power),capacity-m.members.length))-queued;if(need<=0)continue;
        const h=getNearestHexToPoint(m.goal.x,m.goal.y),rough=['hill','mountain'].includes(h?.type);
        const preferred=rough?['mountaineer','light']:foes.some(e=>e.type==='heavy')?['heavy','motorized','light']:ready.length>=3&&!ready.some(u=>u.type==='motorized')?['motorized','light']:['light'];
        let type,source;
        for(const t of preferred){
            const sources=cities.filter(c=>!isCitySiegeBlockedForProduction(c)&&wodAiCityCanTrain(c,t,owner)&&
                wodAiCanReach({type:t,owner,x:c.x,y:c.y},m.goal));
            sources.sort((a,b)=>Number(!!wodCityProductionJob(a))-Number(!!wodCityProductionJob(b))||Math.hypot(a.x-m.goal.x,a.y-m.goal.y)-Math.hypot(b.x-m.goal.x,b.y-m.goal.y));
            if(sources[0]){type=t;source=sources[0];break;}
        }
        if(source)requests.push({...m,members:undefined,type,n:need,source:source.id,priority:(ready.length<3?40:0)+(m.goal.id?12:0)+needPower-power});
    }
    requests.sort((a,b)=>b.priority-a.priority);
    plan.recruitRequests={at:now,n:army.length,pending:pending.length,requests:requests.slice(0,6)};return plan.recruitRequests.requests;
}

// Equip every starting town before routine expansion consumes its budget.
// Capturing another town does not restart the entire opening build order.
// These are real paid 60-second jobs, never free starting buildings.
function wodAiEstablishEconomy(owner,cities,army,demand,plan) {
    const now=gameData._aiEconomyClock||0,hr=gameData.hexRadius||20;
    if(plan._openingEconomyHexes!==gameData.hexes){
        plan._openingEconomyHexes=gameData.hexes;
        plan.openingEconomy={towns:cities.map(c=>c.id),since:now};
    }
    const opening=plan.openingEconomy,towns=cities.filter(c=>opening.towns.includes(c.id));
    const status=(city,type)=>city[type==='factory'?'hasFactory':'hasFarm']?'ready':
        (gameData.constructionJobs||[]).some(j=>j.owner===owner&&j.mode===type&&city.q===j.cq&&city.r===j.cr)?'building':'missing';
    const describe=blockedBy=>Object.assign(opening,{cities:towns.map(c=>({city:c.id,factory:status(c,'factory'),farm:status(c,'farm')})),blockedBy});
    const incomplete=()=>towns.some(c=>status(c,'factory')!=='ready'||status(c,'farm')!=='ready');
    const previous=plan.economyReservation;
    plan.economyReservation=null;
    if(!incomplete()){describe(null);return{incomplete:false};}
    const ready=army.filter(u=>isLandArmyUnit(u)&&!u.boardTransportUid&&!u.retreating&&!u.moraleBroken&&!u._medicalRecovering&&u.hp>u.maxHp*.55);
    const threats=wodAiThreats(owner,false).filter(u=>u.damage>0);
    const threatened=c=>threats.some(e=>Math.hypot(e.x-c.x,e.y-c.y)<(e.range||50)+hr*5);
    const rescue=army.some(u=>u._medicalEvacuating||u._navalEvacuating||u._navalLanded&&u.type!=='marine'&&!wodIsNavalUnit(u)&&
        !wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city&&!wodSupplyShipForUnit(u));
    const emergency=ready.length<Math.max(3,cities.length*2)||rescue||
        cities.some(c=>isCitySiegeBlockedForProduction(c)||threatened(c)&&ready.filter(u=>Math.hypot(u.x-c.x,u.y-c.y)<hr*8).length<3);
    if(emergency){describe(rescue?'naval-rescue':'urgent-defense');return{incomplete:true,emergency:true};}
    const safe=towns.filter(c=>!demand.missing.some(m=>m.id===c.id)&&!isCitySiegeBlockedForProduction(c)&&!threatened(c));
    if(!safe.length){describe('no-safe-guarded-town');return{incomplete:true};}
    // All available starting towns begin their factories on the first pulse.
    // Farms follow as slots free up, with their cash protected in the meantime.
    for(let n=0;n<towns.length*2;n++){
        const choices=safe.flatMap(city=>['factory','farm'].filter(type=>status(city,type)==='missing').map(type=>({city,type})));
        choices.sort((a,b)=>Number(!!wodCityProductionJob(a.city))-Number(!!wodCityProductionJob(b.city))||
            Number(a.type==='farm')-Number(b.type==='farm')||
            Math.min(...threats.map(e=>Math.hypot(b.city.x-e.x,b.city.y-e.y)),1e6)-Math.min(...threats.map(e=>Math.hypot(a.city.x-e.x,a.city.y-e.y)),1e6));
        const next=choices[0];if(!next)break;
        const {city:site,type}=next,price=type==='factory'?WOD_PRICE_FACTORY:WOD_PRICE_FARM;
        const amount=price+WOD_PRICE_LIGHT;
        plan.economyReservation={type,city:site.id,money:amount,since:previous?.type===type&&previous.city===site.id?previous.since:now};
        if(wodCityProductionJob(site)){describe('towns-busy');return{incomplete:true};}
        if(wodPlayerTreasury(owner)<amount){describe('saving-'+type);return{incomplete:true};}
        if(!cityEligibleForBuildPlacementForOwner(site,type,owner)||!wodApplyBuildAtCityForOwner(site,type,owner)){plan.economyReservation=null;describe('placement-unavailable');return{incomplete:true};}
        plan.lastBuilding=now;plan.economyReservation=null;
        wodAiRecord(owner,'investment',{city:site.id,type,reason:'opening-economy'});
    }
    describe(null);return{incomplete:incomplete()};
}

// Savings belong to the faction, not to the next town visited in the purchase
// loop. A plain infantry town cannot spend a factory's reserved manpower.
function wodAiProcurementReserve(owner,cities,army,pending,demand,plan,spareUpkeep) {
    if(plan.economyReservation){
        if(plan.reservation)wodAiRecord(owner,'procurement-release',{type:plan.reservation.type,reason:'fund-opening-economy'});
        plan.reservation=null;plan.savingFor=plan.economyReservation.type;return null;
    }
    const now=gameData._aiEconomyClock||0,count=t=>army.filter(u=>u.type===t).length+pending.filter(j=>j.mode===t).length;
    const ground=army.filter(isLandArmyUnit).length+pending.filter(j=>isLandArmyUnit({type:j.mode})).length;
    const floor=gameData.aiTaskForces?.[owner]?.defenseDemand?.armyFloor||cities.length*4+4;
    const enemyArmor=wodAiRecruitThreats(owner,wodAiThreats(owner),army).filter(u=>u.type==='heavy').length;
    plan.reserveFailures||={};
    const usable=t=>{
        // The general already fills the opening armor role. Build a viable line
        // before saving for duplicate armor or a large specialist quota.
        if(ground<floor&&((t==='heavy'&&count(t)>0&&enemyArmor<=count(t)+1)||(['motorized','mountaineer'].includes(t)&&count(t)>0)))return false;
        return !(plan.reserveFailures[t]>now)&&demand.desired[t]>count(t)&&cities.some(c=>c.owner===owner&&!isCitySiegeBlockedForProduction(c)&&wodAiCityCanTrain(c,t,owner)&&wodAiRecruitTownFits(c,t,demand))&&getUnitUpkeep({type:t})<=spareUpkeep;
    };
    const readyGround=army.filter(u=>isLandArmyUnit(u)&&u.hp>u.maxHp*.55&&!u._medicalRecovering&&!u.retreating).length;
    const essential=demand.missing.length>0||demand.lineDeficit>0||readyGround<Math.max(4,cities.length*2)||demand.atRisk&&readyGround<Math.max(6,cities.length*3);
    const expedition=demand.expedition;
    const escortNeeded=expedition&&demand.desired.ship>count('ship')&&(expedition.goal||expedition.exploring||army.some(u=>['transport','supply'].includes(u.type)))&&count('ship')===0;
    const missionType=expedition?.blocker?.type;
    const homeThreat=!!missionType&&wodAiThreats(owner,false).some(e=>!wodIsNavalUnit(e)&&cities.some(c=>Math.hypot(e.x-c.x,e.y-c.y)<(gameData.hexRadius||20)*10&&wodAiArrivalSeconds(e,c,e.range||50,30)<=30));
    const urgentHome=demand.missing.length>0||readyGround<Math.max(4,cities.length*2)||homeThreat&&demand.lineDeficit>0;
    const missionPriority=!urgentHome&&missionType&&usable(missionType);
    const navalPriority=!essential&&(expedition?.preferred[0]==='ship'||escortNeeded)&&readyGround>=Math.max(4,cities.length*2)&&usable('ship');
    let reservation=plan.reservation;
    if(reservation){
        const cost=getUnitCost(reservation.type),deficit=Math.max(0,cost.money-wodPlayerTreasury(owner))/Math.max(1,cost.money)+Math.max(0,cost.manpower-wodPlayerMpPool(owner))/Math.max(1,cost.manpower);
        if(reservation.bestDeficit==null||deficit<reservation.bestDeficit-.01){reservation.bestDeficit=deficit;reservation.progressAt=now;}
        // A ship needs 10k manpower. With ongoing replacements its real funding
        // time can exceed the original 180s estimate. Expire a stalled budget,
        // not a budget which is demonstrably approaching the purchase cost.
        const idle=now-(reservation.progressAt??reservation.since);
        if(!canAffordUnit(owner,reservation.type)&&(idle>120||now>(reservation.deadline??reservation.since+120)&&idle>30)){plan.reserveFailures[reservation.type]=now+45;wodAiRecord(owner,'procurement-release',{type:reservation.type,reason:'saving-stalled'});reservation=null;}
    }
    if(reservation&&(!usable(reservation.type)||essential&&!missionPriority)){wodAiRecord(owner,'procurement-release',{type:reservation.type,reason:'production-unavailable-or-emergency'});reservation=null;}
    if(missionPriority&&reservation?.type!==missionType){
        wodAiRecord(owner,'procurement-retarget',{from:reservation?.type||null,type:missionType,job:expedition.blocker.job,reason:expedition.blocker.reason});
        reservation={type:missionType,since:now};
    }
    if(navalPriority&&!missionPriority&&!(plan.reserveFailures.ship>now)&&reservation?.type!=='ship')reservation={type:'ship',since:now};
    if(!reservation&&!essential){
        const choices=demand.types.filter(t=>t!=='light'&&usable(t));
        const urgentSupply=army.some(u=>u._navalLanded&&u.type!=='marine'&&!wodIsNavalUnit(u)&&!wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city);
        const critical=t=>t==='supply'&&urgentSupply?0:1;
        // Fill an absent class before accumulating more of one already fielded.
        const missionRank=t=>demand.expedition?.preferred.includes(t)?demand.expedition.preferred.indexOf(t):99;
        choices.sort((a,b)=>critical(a)-critical(b)||missionRank(a)-missionRank(b)||Number(count(a)>0)-Number(count(b)>0)||Number(canAffordUnit(owner,b))-Number(canAffordUnit(owner,a))||demand.types.indexOf(a)-demand.types.indexOf(b));
        const type=choices[0];
        if(type)reservation={type,since:now};
    }
    if(reservation&&reservation.deadline==null){
        const cost=getUnitCost(reservation.type),cashRate=Math.max(1,getOwnerIncome(owner)-getOwnerExpenses(owner)),mpRate=Math.max(1,getOwnerManpowerIncome(owner)*.55);
        const eta=Math.max(Math.max(0,cost.money-wodPlayerTreasury(owner))/cashRate,Math.max(0,cost.manpower-wodPlayerMpPool(owner))/mpRate);
        reservation.deadline=now+Math.min(['ship','transport','supply'].includes(reservation.type)?180:90,Math.max(35,eta*1.25+15));reservation.progressAt=now;
        reservation.bestDeficit=Math.max(0,cost.money-wodPlayerTreasury(owner))/Math.max(1,cost.money)+Math.max(0,cost.manpower-wodPlayerMpPool(owner))/Math.max(1,cost.manpower);
    }
    plan.reservation=reservation;
    plan.savingFor=plan.hospitalRequest&&!reservation?'hospital':reservation&&!canAffordUnit(owner,reservation.type)?reservation.type:null;
    return reservation;
}

function wodAiCanSpendOutsideReserve(owner,type,plan) {
    const cost=getUnitCost(type);
    if(plan.economyReservation&&wodPlayerTreasury(owner)-cost.money<plan.economyReservation.money)return false;
    if(plan.hospitalRequest&&!plan.reservation&&wodPlayerTreasury(owner)-cost.money<WOD_PRICE_HOSPITAL+WOD_PRICE_LIGHT)return false;
    const reserve=plan.reservation;if(!reserve||reserve.type===type)return true;
    const protectedCost=getUnitCost(reserve.type);
    return wodPlayerTreasury(owner)-cost.money>=protectedCost.money&&wodPlayerMpPool(owner)-cost.manpower>=protectedCost.manpower;
}

// Replacements and new formations share the same real manpower pool. Saving
// must survive passive hospital recovery, while some treatment always continues.
function wodAiReplacementAllowance(unit,wanted,dt) {
    if(!(wanted>0)||wodMpIsHumanOwner(unit.owner))return wanted;
    const owner=unit.owner,plan=gameData._aiEconomyPlans?.[owner];if(!plan)return wanted;
    const tick=gameData._wodSimTick;
    let budget=plan.replacementBudget;
    if(!budget||budget.tick!==tick||budget.hexes!==gameData.hexes){
        const army=gameData.entities.filter(u=>u.owner===owner&&u.hp>0&&u.type!=='convoy'),pending=gameData.constructionJobs||[];
        const canTrain=gameData.cities.some(c=>c.owner===owner&&!isCitySiegeBlockedForProduction(c));
        const needLine=canTrain&&(plan.desired?.light||0)>army.filter(u=>u.type==='light').length+pending.filter(j=>j.owner===owner&&j.mode==='light').length;
        const saving=['light','heavy','motorized','mountaineer','marine','ship','transport','supply'].includes(plan.savingFor)?plan.savingFor:null;
        const requested=gameData.aiTaskForces?.[owner]?.recruitRequests?.requests?.some(r=>r.n>0);
        const protectedMp=canTrain?(plan.reservation?getUnitCost(plan.reservation.type).manpower:saving?getUnitCost(saving).manpower:needLine||requested?getUnitCost('light').manpower:0):0;
        const patients=army.filter(u=>wodUnitMissingStrength(u)&&wodUnitHealingSite(u)&&!u._combatEngaged).sort((a,b)=>Number(!!b.isGeneral)-Number(!!a.isGeneral)||b.hp/b.maxHp-a.hp/a.maxHp).slice(0,2);
        const ready=army.filter(u=>isLandArmyUnit(u)&&!u._medicalRecovering&&!u.retreating&&u.hp>u.maxHp*.6).length;
        const share=ready<4?.35:needLine||requested||saving||plan.reservation?.type==='ship'?.25:.65;
        const ration=getOwnerManpowerIncome(owner)*share*dt/Math.max(1,patients.length);
        budget=plan.replacementBudget={tick,hexes:gameData.hexes,protectedMp,rations:new Map(patients.map(u=>[u.uid,ration]))};
    }
    if(!budget.protectedMp)return wanted;
    const outside=Math.max(0,wodPlayerMpPool(owner)-budget.protectedMp),ration=budget.rations.get(unit.uid)||0;
    const amount=Math.min(wanted,outside+ration);budget.rations.set(unit.uid,Math.max(0,ration-Math.max(0,amount-outside)));return amount;
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
    const clusters=[];for(const t of ranked.filter(s=>s.defensePriority>2))if(!clusters.some(p=>Math.hypot(p.x-t.holdHex.x,p.y-t.holdHex.y)<hr*10))clusters.push(t.holdHex);
    const contested=clusters.length;
    const urgent=strategy.intent==='defend',attackFloor=Math.max(2,Math.ceil(spare*(urgent?.35:contested?.5:.65)));
    const share=contested?Math.min(urgent?.55:.38,strategy.defenseShare):Math.min(.14,strategy.defenseShare);
    const line=Math.min(Math.max(0,spare-attackFloor),Math.max(contested?1:0,Math.round(spare*share),Math.min(frontage,contested*2)));
    const reserve=Math.min(Math.max(0,spare-line-attackFloor),Math.floor(ready.filter(isLandArmyUnit).length*strategy.reserveShare));
    return {line,reserve,frontage,contested,ranked,armyFloor:Math.min(140,guards+frontage+Math.max(4,towns.length*2)+Math.ceil(frontage*.2))};
}

// Distant predictions need a screen, not an army-wide recall. Actual town
// attacks, pockets and imminent major cuts retain their emergency budgets.
function wodAiDefenseResponseBudget(owner,available,threats,pockets) {
    if(!threats.length)return 0;
    const townEmergency=threats.some(t=>t.kind==='counter');
    const majorCut=threats.some(t=>t.kind==='corridor'&&wodAiCorridorUrgent(t)&&(t.riskUnits?.size??t.atRisk)>=Math.max(3,available.length*.3));
    const share=(townEmergency||majorCut) ? .85 : pockets.length ? .55 : Math.min(.44,Math.max(.3,wodAiCommander(owner).defense+.06));
    return Math.min(available.length,Math.max(1,Math.ceil(available.length*share)));
}

// A coast or map edge can close the other side of an enemy's pincer. Bridges
// remain real supply corridors, and unknown hostile land is not revealed.
function wodAiCorridorEdge(owner,h,d,explored) {
    const n=gameData.hexes[(h.q+d.q)+','+(h.r+d.r)];
    if(!n||isWaterHex(n)&&!isBridgeHex(n))return -1;
    return wodIsHostileOwner(n.owner,owner)&&(!explored||explored.has(getHexKey(n)))?1:0;
}

// Removing a tested section must actually disconnect troops from every town;
// a coast alone cannot manufacture a pocket. Work remains bounded and yielding.
function wodAiPredictCorridors(owner, tiles, index, edges, roots, supplied, weights, enemies, supplyDepth) {
    const scan=wodAiPredictCorridorSteps(owner,tiles,index,edges,roots,supplied,weights,enemies,supplyDepth);let step;do{step=scan.next();}while(!step.done);return step.value;
}
function* wodAiPredictCorridorSteps(owner, tiles, index, edges, roots, supplied, weights, enemies, supplyDepth) {
    const hr=gameData.hexRadius||20,visible=wodAiThreats(owner,false).filter(e=>!wodIsNavalUnit(e)),sections=[],tested=new Set();
    if(!roots.length||!visible.length)return sections;
    const explored=wodFogActive()?wodFogFactionIntel(owner).explored:null;
    const outward=i=>cardinalHexDirections.map(d=>gameData.hexes[(tiles[i].q+d.q)+','+(tiles[i].r+d.r)])
        .filter(h=>h&&!isWaterHex(h)&&wodIsHostileOwner(h.owner,owner)&&(!explored||explored.has(getHexKey(h))));
    const boundary=[];
    let checked=0;
    for(const h of wodCachedFrontlineHexes(owner)){
        if((++checked&31)===0)yield;
        const i=index.get(getHexKey(h));if(i===undefined||!supplied.has(i)||!visible.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<hr*12))continue;
        const outside=outward(i);if(outside.length)boundary.push({i,outside,d:Math.min(...visible.map(e=>Math.hypot(e.x-tiles[i].x,e.y-tiles[i].y)))});
    }
    boundary.sort((a,b)=>a.d-b.d);let floods=0;
    for(const seed of boundary.slice(0,20)){
        yield;
        if(floods>=8)break;
        const start=tiles[seed.i],normal={x:seed.outside[0].x-start.x,y:seed.outside[0].y-start.y};
        const queue=[{i:seed.i,path:[seed.i]}],seen=new Set([seed.i]);let section=null;
        for(let q=0;q<queue.length&&q<160;q++){
            const {i,path}=queue[q],h=tiles[i];
            if(path.length>=3&&cardinalHexDirections.some(d=>wodAiCorridorEdge(owner,h,d,explored)!==0&&
                (d.q*normal.x+d.r*normal.y)<0)){section=path;break;}
            if(path.length>=6)continue;
            for(const j of edges[i])if(!seen.has(j)&&supplied.has(j)&&Math.hypot(tiles[j].x-start.x,tiles[j].y-start.y)<hr*7.5){seen.add(j);queue.push({i:j,path:path.concat(j)});}
        }
        if(!section)continue;
        const signature=section.slice().sort((a,b)=>a-b).join(',');if(tested.has(signature))continue;tested.add(signature);floods++;
        const blocked=new Set(section),reached=new Set(roots.filter(i=>!blocked.has(i))),flood=[...reached];
        for(let q=0;q<flood.length;q++){for(const j of edges[flood[q]])if(!blocked.has(j)&&!reached.has(j)){reached.add(j);flood.push(j);}if((q&255)===255)yield;}
        let troops=0,area=0,depth=0;const riskTileKeys=[];
        const neckDepth=Math.min(...section.map(i=>supplyDepth.get(i)??0));
        for(const i of supplied)if(!blocked.has(i)&&!reached.has(i)){troops+=weights[i];area++;depth+=weights[i]*Math.max(0,(supplyDepth.get(i)||0)-neckDepth);if(weights[i])riskTileKeys.push(getHexKey(tiles[i]));}
        if(troops<1||area<section.length*2)continue;
        const center=tiles[section[Math.floor(section.length/2)]];
        const closing=visible.filter(e=>Math.hypot(e.x-center.x,e.y-center.y)<hr*12);
        const closureSeconds=Math.min(...closing.map(e=>Math.max(0,Math.hypot(e.x-center.x,e.y-center.y)-(e.range||50))/Math.max(1,(e.speed||15)*WOD_MOVE_SPEED_FACTOR)))+section.length*1.5;
        const withdrawSeconds=wodAiCorridorEvacSeconds(owner,riskTileKeys,index,supplyDepth,neckDepth);
        const screenIndices=[section[0],section[section.length-1]].filter(i=>outward(i).length);
        sections.push({i:section[Math.floor(section.length/2)],troops,area,keys:section,screenIndices,riskTileKeys,predictive:true,closureSeconds,withdrawSeconds});
    }
    return sections.concat(yield* wodAiWideCorridorSteps(owner,tiles,index,edges,roots,supplied,weights,visible,supplyDepth));
}

// Whole-map cross-sections complement the short, winding choke search above.
// A broad salient can have no articulation point and be far wider than six
// cells. Its hostile-facing ends, rather than its empty center, need cover.
function wodAiWideCorridors(owner,tiles,index,edges,roots,supplied,weights,enemies,supplyDepth) {
    const scan=wodAiWideCorridorSteps(owner,tiles,index,edges,roots,supplied,weights,enemies,supplyDepth);let step;do{step=scan.next();}while(!step.done);return step.value;
}
function* wodAiWideCorridorSteps(owner,tiles,index,edges,roots,supplied,weights,enemies,supplyDepth) {
    const hr=gameData.hexRadius||20,candidates=[],result=[];
    // Supplied insertion order is BFS order. Accumulate each column's actual
    // city routes in reverse, so empty frontier crossings cannot consume the
    // flood budget ahead of a distant push that really needs protection.
    const load=weights.slice(),ordered=[...supplied];
    for(let n=ordered.length-1;n>=0;n--){const i=ordered[n],parent=edges[i].find(j=>(supplyDepth.get(j)??Infinity)<supplyDepth.get(i));if(parent!==undefined)load[parent]+=load[i];if((n&255)===255)yield;}
    const explored=wodFogActive()?wodFogFactionIntel(owner).explored:null;
    for(const axis of ['q','r']){
        const other=axis==='q'?'r':'q',rows=new Map();
        let examined=0;
        for(const i of supplied){const h=tiles[i];if(!rows.has(h[axis]))rows.set(h[axis],[]);rows.get(h[axis]).push(i);if((++examined&255)===0)yield;}
        for(const row of rows.values()){
            yield;
            row.sort((a,b)=>tiles[a][other]-tiles[b][other]);let run=[];
            const consider=()=>{
                if(run.length<=6)return;
                const a=tiles[run[0]],b=tiles[run[run.length-1]],d=axis==='q'?{q:0,r:1}:{q:1,r:0};
                const sides=[wodAiCorridorEdge(owner,a,{q:-d.q,r:-d.r},explored),wodAiCorridorEdge(owner,b,d,explored)];
                if(sides.includes(0)||!sides.includes(1)||run.some(i=>roots.includes(i)))return;
                const gates=[a,b].filter((h,i)=>sides[i]===1);
                const traffic=run.reduce((n,i)=>n+load[i],0);if(traffic<1)return;
                const pressure=enemies.filter(e=>gates.some(g=>Math.hypot(e.x-g.x,e.y-g.y)<hr*10&&wodAiCanReach(e,g)));
                if(!pressure.length)return;
                const distance=Math.min(...pressure.flatMap(e=>gates.map(g=>Math.hypot(e.x-g.x,e.y-g.y))));
                candidates.push({keys:run.slice(),gates,pressure,score:(distance+run.length*hr*.08)/(1+Math.sqrt(traffic)*.1)});
            };
            for(const i of row){if(run.length&&!edges[run[run.length-1]].includes(i)){consider();run=[];}run.push(i);}consider();
        }
    }
    candidates.sort((a,b)=>a.score-b.score);
    const tested=[],blockedTags=new Uint16Array(tiles.length),safeTags=new Uint16Array(tiles.length),queue=new Int32Array(tiles.length);let floods=0;
    for(const candidate of candidates){
        yield;
        // Spread the bounded graph floods between different flanking axes.
        if(tested.some(p=>candidate.gates.every(g=>p.some(h=>Math.hypot(h.x-g.x,h.y-g.y)<hr*3))))continue;
        tested.push(candidate.gates);if(floods++>=10)break;
        const stamp=floods;let head=0,tail=0;
        for(const i of candidate.keys)blockedTags[i]=stamp;
        for(const i of roots){safeTags[i]=stamp;queue[tail++]=i;}
        while(head<tail){for(const j of edges[queue[head++]])if(blockedTags[j]!==stamp&&safeTags[j]!==stamp){safeTags[j]=stamp;queue[tail++]=j;}if((head&255)===0)yield;}
        let troops=0,area=0,depth=0;const riskTileKeys=[];
        const neckDepth=Math.min(...candidate.keys.map(i=>supplyDepth.get(i)??0));
        for(const i of supplied)if(blockedTags[i]!==stamp&&safeTags[i]!==stamp){
            troops+=weights[i];area++;
            if(weights[i]){riskTileKeys.push(getHexKey(tiles[i]));depth=Math.max(depth,(supplyDepth.get(i)||0)-neckDepth);}
        }
        if(troops<1||area<candidate.keys.length*2)continue;
        const speed=e=>Math.max(1,(e.speed||15)*WOD_MOVE_SPEED_FACTOR*.8);
        const closureSeconds=Math.max(...candidate.keys.map(i=>Math.min(...candidate.pressure.map(e=>
            Math.max(0,Math.hypot(e.x-tiles[i].x,e.y-tiles[i].y)-hr*(e.type==='heavy'?2:1))/speed(e)))))+2;
        const withdrawSeconds=wodAiCorridorEvacSeconds(owner,riskTileKeys,index,supplyDepth,neckDepth);
        const center=candidate.keys[Math.floor(candidate.keys.length/2)];
        result.push({i:center,troops,area,keys:candidate.keys,screenIndices:candidate.gates.map(g=>index.get(getHexKey(g))),riskTileKeys,predictive:true,wide:true,closureSeconds,withdrawSeconds});
    }
    return result;
}

function wodAiCorridorEvacSeconds(owner,riskTileKeys,index,supplyDepth,neckDepth) {
    const risk=new Set(riskTileKeys),hr=gameData.hexRadius||20;let longest=0;
    for(const u of gameData.entities){
        if(u.owner!==owner||u.hp<=0||u.boardTransportUid||u.type==='marine'||!isLandArmyUnit(u))continue;
        const h=getNearestHexToPoint(u.x,u.y),key=h&&getHexKey(h);if(!risk.has(key))continue;
        const distance=Math.max(0,(supplyDepth.get(index.get(key))||0)-neckDepth)*hr*1.35;
        const speed=Math.max(.5,(u.speed||12)*WOD_MOVE_SPEED_FACTOR*getUnitSpeedMultiplier(u,h)*.75);
        longest=Math.max(longest,distance/speed);
    }
    return longest;
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
    if (!memories || !wodFogActive()) return visible.map(u=>({...u,_observerOwner:owner}));
    const intel = wodFogFactionIntel(owner), seen = new Set(visible.map(u => u.uid));
    const now = wodAiOperationTime(), result = visible.map(u=>({...u,_observerOwner:owner}));
    for (const [uid, record] of intel.units || []) {
        if (seen.has(uid)) continue;
        const age = Math.max(0, (now - record.seenAt) / 1000);
        if (age > 45) continue;
        const confidence = Math.exp(-age / 18) * (record.vacated ? .65 : 1);
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
    const required=.92+(wodAiCommander(owner).ratio-1)*.45;
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

function wodAiCanReach(unit, target) {
    if (!unit || !target) return false;
    const key = `${target.q},${target.r}`;
    if (wodIsNavalUnit(unit)) return !!wodAiOperationReach(unit,true).has(key);
    return !!wodAiOperationReach(unit).has(key);
}

function wodAiTravelCost(unit, target) {
    if (!wodAiCanReach(unit,target)) return Infinity;
    const start = getNearestHexToPoint(unit.x,unit.y), end = gameData.hexes[`${target.q},${target.r}`] || target;
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

function wodAiFrontOwner(unit) {
    return unit?._aiFrontAssignment?.hexes===gameData.hexes?unit._aiFrontAssignment.enemy:0;
}

// A regiment belongs to an enemy front, rather than to whichever global
// objective happened to win the last planner pulse. Emergency relief is separate.
function wodAiOrganizeFronts(owner,plan,ready) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,fronts=new Map();
    const add=(enemy,h)=>{if(!h||!wodIsHostileOwner(enemy,owner))return;const f=fronts.get(enemy)||{enemy,points:[],sectors:[]};f.points.push(h);fronts.set(enemy,f);return f;};
    for(const s of plan.sectors||[]){const f=add(s.attackHex?.owner,s.holdHex);if(f)f.sectors.push(s);}
    for(const e of wodAiThreats(owner,false))if(!wodIsNavalUnit(e))add(e.owner,e);
    for(const c of wodAiKnownCities(owner))if(!fronts.has(c.owner))add(c.owner,c);
    const ground=ready.filter(u=>isLandArmyUnit(u)&&u.type!=='marine');
    for(const u of ground){
        const reach=wodAiOperationReach(u),choices=[...fronts.values()].map(f=>({f,p:f.points.filter(p=>reach.has(getHexKey(getNearestHexToPoint(p.x,p.y)))).sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y))[0]})).filter(c=>c.p);
        choices.sort((a,b)=>Math.hypot(a.p.x-u.x,a.p.y-u.y)-Math.hypot(b.p.x-u.x,b.p.y-u.y));
        const best=choices[0],old=u._aiFrontAssignment,current=choices.find(c=>c.f.enemy===wodAiFrontOwner(u));
        if(!best){u._aiFrontAssignment=null;continue;}
        const busy=u._combatEngaged||u.target&&(u.stuckTimer||0)<3;
        const keep=current&&(now-old.at<45000||busy||Math.hypot(current.p.x-u.x,current.p.y-u.y)<=Math.hypot(best.p.x-u.x,best.p.y-u.y)+hr*6);
        if(!keep){u._aiFrontAssignment={hexes:gameData.hexes,enemy:best.f.enemy,at:now};wodAiRecord(owner,'front-assignment',{unit:u.uid,enemy:best.f.enemy});}
    }
    plan.fronts=[...fronts.values()].filter(f=>ground.some(u=>wodAiFrontOwner(u)===f.enemy));
    for(const job of plan.jobs.slice()){
        if(job.city||job.fort||!['main','armor','raid','hold','reserve'].includes(job.kind))continue;
        const groups=new Map();
        for(const u of ground.filter(u=>job.members.includes(u.uid))){const enemy=wodAiFrontOwner(u);if(!groups.has(enemy))groups.set(enemy,[]);groups.get(enemy).push(u);}
        const parts=[...groups].sort((a,b)=>b[1].length-a[1].length);
        for(let i=0;i<parts.length;i++){
            const [enemy,members]=parts[i],front=fronts.get(enemy);if(!front)continue;
            const j=i?{...job,id:job.id+'-front-'+enemy+'-'+(plan.nextJobId=(plan.nextJobId||0)+1),operationState:null,_formationSlots:{},_rallyLead:null}:job;
            if(i)plan.jobs.push(j);j.members=members.map(u=>u.uid);j.quota=members.length;j.frontOwner=enemy;
            for(const u of members){plan.unitJob[u.uid]=j.id;u.aiTfJobId=j.id;}
            const lead=members[0],sectors=front.sectors.slice().sort((a,b)=>Math.hypot(a.holdHex.x-lead.x,a.holdHex.y-lead.y)-Math.hypot(b.holdHex.x-lead.x,b.holdHex.y-lead.y));
            const goal=j.objectiveCity||j.objectiveHex||j.attackHex;
            if(goal&&wodIsHostileOwner(goal.owner,owner)&&goal.owner===enemy&&!i)continue;
            if(['hold','reserve'].includes(j.kind)){
                const s=sectors[0];if(s){if(j.holdHex===s.holdHex&&j.attackHex===s.attackHex&&!i)continue;j.holdHex=s.holdHex;j.attackHex=s.attackHex;}
            }else{
                const cities=wodAiKnownCities(owner).filter(c=>c.owner===enemy&&wodAiCanReach(lead,c));
                cities.sort((a,b)=>wodAiObjectiveCost(owner,members,a)-wodAiObjectiveCost(owner,members,b));
                const city=cities[0],s=sectors[0];
                if(!city&&!s)continue;
                Object.assign(j,{objectiveCity:city||null,objectiveHex:city?null:s.attackHex,attackHex:city?getNearestHexToPoint(city.x,city.y):s.attackHex,holdHex:s?.holdHex||getNearestHexToPoint(lead.x,lead.y),phase:'assemble',phaseAt:now,operationState:null,objectiveStructure:null,cutoff:false,cutHexes:null,_formationSlots:{}});
            }
            for(const u of members){u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}
        }
    }
}

function wodAiDesiredGroundScouts(owner,ready) {
    if(!wodFogActive())return 0;
    const troops=ready.filter(u=>isLandArmyUnit(u)&&u.type!=='marine'&&!u.boardTransportUid&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&u.hp>u.maxHp*.62).length;
    // Small armies discover the next bound together. Once a town is known,
    // spare infantry should reinforce that advance instead of patrolling home.
    if(wodAiKnownCities(owner).some(c=>wodIsHostileOwner(c.owner,owner)))return troops>=24?1:0;
    return troops>=18?2:troops>=8?1:0;
}

function wodAiRebalanceGroups(owner, plan, ready) {
    const now=wodAiOperationTime(), strategy=wodAiBattlePlan(owner,ready), hr=gameData.hexRadius||20;
    if (plan.rebalancedAt != null && now-plan.rebalancedAt < 2500 && ready.length===plan.readyN&&plan.lastIntent===strategy.intent) return;
    plan.rebalancedAt=now;
    plan.lastIntent=strategy.intent;
    wodAiAdoptSquadRecruits(owner,plan,ready);
    const ids=new Set(ready.map(u=>u.uid));
    for(const job of plan.jobs)job.members=job.members.filter(id=>ids.has(id)&&plan.unitJob[id]===job.id);
    for(const id of Object.keys(plan.unitJob))if(!ids.has(id))delete plan.unitJob[id];
    // A regrouped island force can outlive the sector which originally gave
    // it a holding point. Repair its anchor before any defense consumer uses it.
    const validPoint=h=>h&&Number.isFinite(h.x)&&Number.isFinite(h.y);
    plan.sectors=(plan.sectors||[]).filter(s=>validPoint(s.holdHex));
    for(const job of plan.jobs.filter(j=>['hold','reserve','support'].includes(j.kind)&&j.members.length&&!validPoint(j.holdHex))){
        const members=ready.filter(u=>job.members.includes(u.uid)),lead=members[0];
        const sector=lead&&plan.sectors.filter(s=>!job.frontOwner||s.attackHex?.owner===job.frontOwner).sort((a,b)=>Math.hypot(a.holdHex.x-lead.x,a.holdHex.y-lead.y)-Math.hypot(b.holdHex.x-lead.x,b.holdHex.y-lead.y))[0];
        const here=lead&&getNearestHexToPoint(lead.x,lead.y);
        const home=gameData.cities.find(c=>c.owner===owner&&(!lead||wodAiCanReach(lead,c)));
        const anchor=sector?.holdHex||(here&&!isWaterHex(here)&&wodIsFriendlyOwner(here.owner,owner)?here:home&&gameData.hexes[home.q+','+home.r]);
        if(validPoint(anchor)){job.holdHex=anchor;job.attackHex=sector?.attackHex||job.attackHex;wodAiRecord(owner,'group-anchor-repaired',{job:job.id});}
        else{for(const u of members){delete plan.unitJob[u.uid];u.aiTfJobId=null;u.aiOrderUntil=0;}job.members=[];}
    }
    wodAiMaintainTownGarrisons(owner,plan,ready);
    const topology=gameData._supplyTopologyVersion||0;
    if(plan.frontAt==null||now-plan.frontAt>=10000||plan.frontTopology!==topology&&now-plan.frontAt>=5000){
        const fronts=buildAiFrontlineSectors(owner,Math.min(24,Math.max(6,Math.ceil(ready.length/2))));
        const threats=wodAiThreats(owner,false);
        for(const job of plan.jobs.filter(j=>['hold','reserve','support'].includes(j.kind)&&j.holdHex)){
            if(threats.some(e=>Math.hypot(e.x-job.holdHex.x,e.y-job.holdHex.y)<hr*7))continue;
            const members=ready.filter(u=>job.members.includes(u.uid));
            const anchor=members.length?{x:members.reduce((n,u)=>n+u.x,0)/members.length,y:members.reduce((n,u)=>n+u.y,0)/members.length}:job.holdHex;
            const bearing=job._frontBearing;
            const sector=fronts.filter(s=>(!job.frontOwner||s.attackHex?.owner===job.frontOwner)&&(!bearing||!wodIsFriendlyOwner(job.holdHex.owner,owner)||
                (s.holdHex.x-job.holdHex.x)*bearing.x+(s.holdHex.y-job.holdHex.y)*bearing.y>=-hr))
                .sort((a,b)=>wodAiDist2(a.holdHex.x,a.holdHex.y,anchor.x,anchor.y)-wodAiDist2(b.holdHex.x,b.holdHex.y,anchor.x,anchor.y))[0];
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
    for(const u of ready.filter(u=>!plan.unitJob[u.uid]&&u._aiRequestedGroup)){
        const requested=plan.jobs.find(j=>j.id===u._aiRequestedGroup&&['main','armor','raid'].includes(j.kind));
        if(requested&&(!requested.holdHex||wodAiCanReach(u,requested.holdHex)))take(requested,u);
        u._aiRequestedGroup=null;
    }
    const freeInf=()=>infantry.filter(u=>!plan.unitJob[u.uid]);
    const desiredLine=demand.line;
    let line=plan.jobs.filter(j=>j.kind==='hold').reduce((n,j)=>n+j.members.length,0);
    const release=(job,u)=>{job.members=job.members.filter(id=>id!==u.uid);delete plan.unitJob[u.uid];u.aiOrderUntil=0;};
    const desiredScouts=wodAiDesiredGroundScouts(owner,ready);
    let scouts=0;
    for(const job of plan.jobs.filter(j=>j.kind==='scout'))for(const uid of job.members.slice()){
        const u=ready.find(u=>u.uid===uid);if(!u)continue;
        if(scouts++<desiredScouts)continue;
        release(job,u);u._aiScoutUntil=0;gameData._aiMoveQueue?.delete(u);
        wodAiRecord(owner,'scout-reassign',{unit:u.uid,reason:'reinforce-front'});
    }
    if(line>desiredLine){
        const threats=wodAiThreats(owner);
        for(const job of plan.jobs.filter(j=>j.kind==='hold').sort((a,b)=>b.members.length-a.members.length)){
            for(const uid of job.members.slice()){
                if(line<=desiredLine)break;
                const u=ready.find(u=>u.uid===uid);
                if(u&&!u._combatEngaged&&!wodAiFrontCritical(gameData._aiDefenseByOwner?.[owner]?.jobs.find(j=>j.id===gameData._aiDefenseByOwner[owner].unitJob[u.uid]))&&wodAiQuietFrontSafe(owner,u,threats)){
                    release(job,u);line--;
                }
            }
        }
    }
    const mobilize=(amount,kind)=>{
        let need=amount-freeInf().length;
        const committed=new Set(wodAiActiveFrontOperations(owner).filter(op=>['gather','advance'].includes(op.phase)).flatMap(op=>op.members));
        const donors=infantry.filter(u=>{
            const job=plan.jobs.find(j=>j.id===plan.unitJob[u.uid]);
            return !committed.has(u.uid)&&['main','raid','armor','support'].includes(job?.kind)&&(!u._combatEngaged||strategy.intent==='defend')&&
                (strategy.intent==='defend'||job.operationState?.stage!=='attack'||!(job.operationState.commitUntil>now));
        });
        donors.sort((a,b)=>Number(!!a._combatEngaged)-Number(!!b._combatEngaged)||Math.min(...sectors.map(s=>wodAiDist2(a.x,a.y,s.holdHex.x,s.holdHex.y)))-Math.min(...sectors.map(s=>wodAiDist2(b.x,b.y,s.holdHex.x,s.holdHex.y))));
        for(const u of donors){if(need--<=0)break;const job=plan.jobs.find(j=>j.id===plan.unitJob[u.uid]);release(job,u);job.phase='assemble';job.stage='assemble';job.waitingForStrength=true;gameData._aiMoveQueue?.delete(u);wodAiRecord(owner,'defense-reassign',{unit:u.uid,job:job.id,to:kind,intent:strategy.intent});}
    };
    if(line<desiredLine&&sectors.length)mobilize(desiredLine-line,'hold');
    while(line<desiredLine&&freeInf().length&&sectors.length){
        const coverage=s=>plan.jobs.filter(j=>j.kind==='hold'&&j.holdHex===s.holdHex).reduce((n,j)=>n+j.members.length,0);
        const sector=sectors.slice().sort((a,b)=>(coverage(a)/a.required-coverage(b)/b.required)||b.defensePriority-a.defensePriority)[0];
        const job=plan.jobs.find(j=>j.kind==='hold'&&j.holdHex===sector.holdHex&&j.members.length<3)||make('hold',sector);
        const u=freeInf().filter(u=>(!wodAiFrontOwner(u)||wodAiFrontOwner(u)===sector.attackHex?.owner)&&wodAiCanReach(u,sector.holdHex)).sort((a,b)=>wodAiTravelCost(a,sector.holdHex)-wodAiTravelCost(b,sector.holdHex))[0];
        if(!u)break;take(job,u);line++;
    }
    const reserveTarget=demand.reserve;
    let reserve=plan.jobs.filter(j=>j.kind==='reserve').reduce((n,j)=>n+j.members.length,0);
    if(reserve>reserveTarget)for(const job of plan.jobs.filter(j=>j.kind==='reserve')){
        for(const uid of job.members.slice()){
            if(reserve<=reserveTarget)break;
            const u=ready.find(u=>u.uid===uid);if(u&&!u._combatEngaged&&!wodAiFrontCritical(gameData._aiDefenseByOwner?.[owner]?.jobs.find(j=>j.id===gameData._aiDefenseByOwner[owner].unitJob[u.uid]))&&wodAiQuietFrontSafe(owner,u)){release(job,u);reserve--;}
        }
    }
    if(reserve<reserveTarget&&sectors.length)mobilize(reserveTarget-reserve,'reserve');
    while(reserve<reserveTarget&&freeInf().length&&sectors.length){
        const job=plan.jobs.find(j=>j.kind==='reserve'&&j.members.length<3)||make('reserve',sectors[reserve%sectors.length]);
        const u=freeInf().find(u=>(!wodAiFrontOwner(u)||!job.frontOwner||wodAiFrontOwner(u)===job.frontOwner)&&wodAiCanReach(u,job.holdHex));if(!u)break;take(job,u);reserve++;
    }
    wodAiRecord(owner,'defense-allocation',{line,reserve,requiredLine:desiredLine,requiredReserve:reserveTarget,intent:strategy.intent});
    // Move existing guards to new pressure instead of meeting the head count
    // with guards left on a quiet, obsolete part of the front.
    const holds=plan.jobs.filter(j=>j.kind==='hold'&&j.members.length&&validPoint(j.holdHex));
    const reserved=new Set();
    for(const sector of sectors.filter(s=>s.defensePriority>3)){
        const covering=holds.filter(j=>Math.hypot(j.holdHex.x-sector.holdHex.x,j.holdHex.y-sector.holdHex.y)<hr*5).reduce((n,j)=>n+j.members.length,0);
        if(covering>=sector.required)continue;
        const job=holds.filter(j=>!reserved.has(j)&&(!j.frontOwner||j.frontOwner===sector.attackHex?.owner)&&!threatsNear(j.holdHex)).sort((a,b)=>Math.hypot(a.holdHex.x-sector.holdHex.x,a.holdHex.y-sector.holdHex.y)-Math.hypot(b.holdHex.x-sector.holdHex.x,b.holdHex.y-sector.holdHex.y))[0];
        if(job&&job.members.some(id=>{const u=ready.find(u=>u.uid===id);return u&&wodAiCanReach(u,sector.holdHex);})){job.holdHex=sector.holdHex;job.attackHex=sector.attackHex;reserved.add(job);for(const id of job.members){const u=ready.find(u=>u.uid===id);if(u){u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}}}
    }
    function threatsNear(h){return wodAiThreats(owner,false).some(e=>Math.hypot(e.x-h.x,e.y-h.y)<hr*8);}
    if(desiredScouts){
        let scouts=plan.jobs.filter(j=>j.kind==='scout').reduce((n,j)=>n+j.members.length,0);
        const recon=infantry.filter(u=>!u._combatEngaged&&(!plan.unitJob[u.uid]||['main','armor','raid'].includes(assignedKind(u))));
        for(const u of recon){
            if(scouts>=desiredScouts)break;
            const job=make('scout',sectors[scouts%Math.max(1,sectors.length)]);take(job,u);scouts++;
        }
    }
    for(const u of ready.filter(u=>!plan.unitJob[u.uid])) {
        const kinds=u.type==='ship'?['naval']:u.type==='marine'?['marine']:['armor','main'];
        const choices=plan.jobs.filter(j=>kinds.includes(j.kind)&&(!wodAiFrontOwner(u)||!j.frontOwner||wodAiFrontOwner(u)===j.frontOwner)&&j.members.length<(j.waitingForStrength?6:j.kind==='naval'||j.kind==='marine'?3:5)&&
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
    wodAiOrganizeFronts(owner,plan,ready);
    wodAiCoordinateCampaign(owner,plan,ready);
    wodAiConcentrateAssaults(owner,plan,ready);
    wodAiRefreshFrontSupport(owner,plan,ready);
    plan.readyN=ready.length;
}

function wodAiFrontSupportFor(unit,job) {
    const support=gameData._aiFrontSupport?.get(unit);
    return support&&job&&!job.response&&support.job===job.id&&support.hexes===gameData.hexes&&support.until>wodAiOperationTime()?support:null;
}

// Do not leave a regiment fighting alone while its own formation follows an
// obsolete rally. Deliberate wings, guards and withdrawals retain their jobs.
function wodAiIssueGroupCombatSupport(unit,job,issue=true) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,op=job?.frontOperation;
    if(!unit||!job||job.city||job.fort||job.route||job.operation||op?.ambush||job.role==='bait-relief'||
        op?.phase==='consolidate'||job.response&&!op||!['main','armor','raid','hold','reserve','encircle','strike'].includes(job.kind)||
        job.operationState?.screenIds?.includes(unit.uid)||unit.hp<unit.maxHp*.6||unit._combatEngaged||unit.retreating||unit.moraleBroken||
        unit._medicalRecovering||unit._medicalEvacuating||unit._aiCareYieldUntil>now||unit._aiScoutUntil>now||unit._aiRegroupUntil>now||
        unit._navalAssaultUntil>now||unit._navalLanded||unit.boardTransportUid||!isLandArmyUnit(unit)||wodAiCorridorWithdrawal(unit))return false;
    const here=getNearestHexToPoint(unit.x,unit.y);
    if(!here||isWaterHex(here)||!wodCurrentSupplyComponent(here,unit.owner).city)return false;
    const supportIds=job._peerSupport?.until>now?job._peerSupport.members:[],jointIds=op?.joint?.until>now?wodAiActiveFrontOperations(unit.owner).filter(o=>op.joint.squads.includes(o.id)).flatMap(o=>o.members):[],groupIds=new Set([...job.members,...supportIds,...jointIds]);
    const army=gameData.entities.filter(u=>groupIds.has(u.uid)&&u.owner===unit.owner&&u.hp>u.maxHp*.5&&!u.retreating&&!u.moraleBroken&&
        !u._medicalRecovering&&!u.boardTransportUid&&isLandArmyUnit(u)&&!wodAiFrontCritical(gameData._aiDefenseByOwner?.[unit.owner]?.jobs.find(j=>j.id===gameData._aiDefenseByOwner[unit.owner].unitJob[u.uid])));
    const recent=job._combatSupportBattle;
    if(!army.some(u=>u!==unit&&u._combatEngaged)&&!(recent?.hexes===gameData.hexes&&now-recent.at<8000))return false;
    const known=wodAiThreats(unit.owner,false).filter(e=>!wodIsNavalUnit(e)&&e.type!=='convoy'&&
        (!op?.hostile||e.owner===op.hostile)&&(!job.frontOwner||e.owner===job.frontOwner));
    const fighting=army.filter(u=>u!==unit&&u._combatEngaged&&known.some(e=>u.combatTargetUid===e.uid||e.combatTargetUid===u.uid));
    const contacts=known.filter(e=>(fighting.some(u=>(u.combatTargetUid===e.uid||e.combatTargetUid===u.uid)&&
        Math.hypot(u.x-unit.x,u.y-unit.y)<hr*10)||recent?.hexes===gameData.hexes&&recent.enemy===e.uid&&now-recent.at<8000)&&
        wodAiArrivalSeconds(unit,e,unit.range||50,20)<=20);
    contacts.sort((a,b)=>Math.hypot(a.x-unit.x,a.y-unit.y)-Math.hypot(b.x-unit.x,b.y-unit.y));
    const previous=job._combatSupportSlots?.[unit.uid];
    const enemy=contacts.find(e=>previous?.until>now&&previous.enemy===e.uid)||contacts[0];if(!enemy)return false;
    const foes=known.filter(e=>Math.hypot(e.x-enemy.x,e.y-enemy.y)<hr*7);
    const support=army.filter(u=>Math.hypot(u.x-enemy.x,u.y-enemy.y)<hr*12&&wodAiArrivalSeconds(u,enemy,u.range||50,20)<=20&&
        !wodAiCorridorWithdrawal(u)&&wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),unit.owner).city);
    if(support.length<2||!support.includes(unit)||wodAiForecast(unit.owner,support,foes).ratio<Math.min(1.15,wodAiAttackThreshold(unit.owner,true)))return false;
    if(fighting.some(u=>u.combatTargetUid===enemy.uid||enemy.combatTargetUid===u.uid))job._combatSupportBattle={hexes:gameData.hexes,enemy:enemy.uid,at:now};
    const reach=wodAiOperationReach(unit),at=getNearestHexToPoint(enemy.x,enemy.y),range=(unit.range||50)*.88;
    const slots=job._combatSupportSlots||=( {} ),old=slots[unit.uid];
    const slotJobs=[...(op?.jobs||[job]),...(job._peerSupport?.until>now?job._peerSupport.jobs||[]:[])];
    const used=wodAiDeploymentReservations(unit,enemy,hr*8,true);
    for(const [,s]of slotJobs.flatMap(j=>Object.entries(j._combatSupportSlots||{})).filter(([id,s])=>id!==unit.uid&&s.until>now))used.add(s.key);
    const supplied=h=>wodIsFriendlyOwner(h.owner,unit.owner)&&wodCurrentSupplyComponent(h,unit.owner).city;
    const legal=h=>h&&!isWaterHex(h)&&canUnitEnterHex(unit,h)&&reach.has(getHexKey(h))&&
        (supplied(h)||getNeighborHexes(h).some(n=>supplied(n)&&wodCanStepBetweenHexes(unit,n,h,true)))&&
        Math.hypot(h.x-enemy.x,h.y-enemy.y)<=range&&Math.hypot(h.x-enemy.x,h.y-enemy.y)>hr*.7;
    let target=!unit._trafficYield&&old?.enemy===enemy.uid&&old.until>now&&!used.has(old.key)&&legal(gameData.hexes[old.key])?gameData.hexes[old.key]:null;
    if(!target){
        const sites=getHexesInRadius(at.q,at.r,Math.ceil(range/hr)+1).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>legal(h)&&!used.has(getHexKey(h))&&!isWorldPositionBlockedByUnits(unit,h.x,h.y));
        const score=h=>Math.hypot(h.x-unit.x,h.y-unit.y)+Math.abs(Math.hypot(h.x-enemy.x,h.y-enemy.y)-range*.85)*1.5+getTerrainDefenseModifier(unit,h)*hr;
        sites.sort((a,b)=>score(a)-score(b));target=sites.slice(0,8).find(h=>wodAiCanReach(unit,h));
    }
    if(!target)return false;
    if(!issue){const end=unit.orderTarget||unit.target?.finalTarget||unit.target;return !unit.target||unit.holding||!end||Math.hypot(end.x-target.x,end.y-target.y)>hr*1.2||now-(unit._aiCombatSupportAt??-Infinity)>=2000;}
    if(!wodAiMoveUnitTowardHex(unit,target,false,.08))return false;
    slots[unit.uid]={key:getHexKey(target),enemy:enemy.uid,until:now+5000};unit._aiCombatSupportAt=now;
    wodAiRememberDeployment(unit,target,'combat',5000);
    wodAiStampOrder(unit,false,target,2200);unit.aiOrderPhase=op?.phase||job.phase;unit.aiOrderResponseId=job.response?job.id:null;unit.aiFrontBound=job.bound;
    wodAiRecord(unit.owner,'group-combat-support',{unit:unit.uid,job:job.id,enemy:enemy.uid,target:getHexKey(target)});return true;
}

// An observed invading group remains one task as its contact point moves.
// Changing a tile ID every scan used to cancel whole marches every 2.5 seconds.
function wodAiTerritoryThreat(owner,cluster,previous,used) {
    const hr=gameData.hexRadius||20,now=wodAiOperationTime(),contacts=cluster.contacts||[];
    const candidates=(previous?.hexes===gameData.hexes?previous.jobs:[]).filter(j=>j.kind==='territory'&&!used.has(j.id)&&
        Math.hypot(j.holdHex.x-cluster.x,j.holdHex.y-cluster.y)<hr*(j.contacts?.some(id=>contacts.includes(id))?14:4));
    candidates.sort((a,b)=>Number(!a.contacts?.some(id=>contacts.includes(id)))-Number(!b.contacts?.some(id=>contacts.includes(id)))||
        Math.hypot(a.holdHex.x-cluster.x,a.holdHex.y-cluster.y)-Math.hypot(b.holdHex.x-cluster.x,b.holdHex.y-cluster.y));
    const old=candidates[0];
    const fresh=cluster.near.slice().sort((a,b)=>wodAiDist2(a.x,a.y,cluster.x,cluster.y)-wodAiDist2(b.x,b.y,cluster.x,cluster.y))[0];
    const stable=old?.holdHex&&wodIsFriendlyOwner(old.holdHex.owner,owner)&&wodCurrentSupplyComponent(old.holdHex,owner).city&&
        Math.hypot(old.holdHex.x-cluster.x,old.holdHex.y-cluster.y)<hr*6&&now-(old.anchorAt??previous.at)<12000;
    const holdHex=stable?old.holdHex:fresh;if(!holdHex)return null;
    let id=old?.id||'territory-'+getHexKey(holdHex);if(used.has(id))id+=':'+String(contacts[0]||used.size);used.add(id);
    return {id,kind:'territory',role:'fix',coverageRequired:true,holdHex,contacts,contactPoint:{x:cluster.x,y:cluster.y},
        anchorAt:stable?(old.anchorAt??previous.at):now,responseState:old?.responseState,_formationSlots:old?._formationSlots,_pursuit:old?._pursuit,
        enemies:cluster.count,score:100+cluster.count*12};
}

// A wide cut's representative cell may be far from the entrance we actually
// defend. Compare every entrance, so nested warnings do not reserve two armies
// for the same gate, and distant wings of a real pincer remain separate.
function wodAiSelectDefenseThreats(threats) {
    const hr=gameData.hexRadius||20,selected=[];
    const entrances=t=>t.screenPoints?.length?t.screenPoints:[t.holdHex];
    const covered=(a,b)=>a.every(p=>b.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<hr*5));
    for(const t of threats){
        if(t.kind==='counter'||t.kind==='relief'){selected.push(t);continue;}
        // One town battle must not also requisition several separate corridor
        // screens against the very same attackers. Keep the cut warning for
        // escape safety, but let the nearby town response provide its screen.
        const townCover=t.kind==='corridor'&&selected.find(s=>s.kind==='counter'&&s.city&&wodIsFriendlyOwner(s.city.owner,t.holdHex?.owner)&&
            entrances(t).every(p=>Math.hypot(p.x-s.city.x,p.y-s.city.y)<hr*7)&&
            wodAiThreats(s.city.owner).filter(e=>entrances(t).some(p=>Math.hypot(e.x-p.x,e.y-p.y)<hr*8)).every(e=>s.enemyIds?.includes(e.uid)));
        if(townCover){t._screenResponse=townCover;continue;}
        const duplicate=t.kind==='corridor'&&selected.find(s=>{
            if(s.kind!=='corridor'||!t.riskUnits?.size||!s.riskUnits?.size)return false;
            const a=entrances(t),b=entrances(s);
            return [...t.riskUnits].every(id=>s.riskUnits.has(id))&&covered(a,b)&&covered(b,a);
        });
        if(duplicate)t._screenResponse=duplicate;else selected.push(t);
    }
    return selected;
}

// Reserve a nearby screen for each reachable threat before a large battle can
// spend the entire defense budget. Later reinforcement still favors urgency.
function wodAiDefenseFrontAvailable(unit,threat,plan) {
    const base=plan?.jobs.find(j=>j.id===plan.unitJob[unit.uid]);
    // An offensive owns its roster until an actual emergency requires a loan.
    // Ordinary border screens are filled from guards, reserves and recruits.
    if(!wodAiFrontCritical(threat)&&!['hold','reserve','support'].includes(base?.kind)&&wodAiActiveFrontOperations(unit.owner).some(op=>op.members.includes(unit.uid)))return false;
    // Real town relief and breakout orders retain emergency authority. Routine
    // screens use their own front, rather than recalling a different invasion.
    if(threat.kind==='counter'||threat.kind==='relief')return true;
    const front=wodAiFrontOwner(unit)||base?.frontOwner;
    if(!front)return true;
    const hr=gameData.hexRadius||20,gates=threat.screenPoints||[threat.holdHex];
    const distance=Math.min(...gates.map(p=>Math.hypot(unit.x-p.x,unit.y-p.y)));
    if(distance<hr*7)return true;
    if(!threat._borrowFronts){
        const contacts=wodAiThreats(unit.owner).filter(e=>threat.contacts?.includes(e.uid)||gates.some(p=>Math.hypot(e.x-p.x,e.y-p.y)<hr*8));
        threat._borrowFronts=new Set(threat.frontOwner?[threat.frontOwner]:contacts.map(e=>e.owner));
    }
    if(threat._borrowFronts.has(front))return true;
    // A fast, substantial cut can justify crossing theaters when this unit can
    // actually arrive before closure; an ordinary prediction cannot.
    return threat.kind==='corridor'&&threat.atRisk>=4&&threat.closureSeconds<30&&
        gates.some(p=>wodAiArrivalSeconds(unit,p,hr*3,Math.max(5,threat.closureSeconds+3))<=Math.max(5,threat.closureSeconds+3));
}

function* wodAiReserveDefenseScreens(owner,threats,available,plan,budget,previous) {
    const hr=gameData.hexRadius||20,byUnit=new Map(),counts=new Map();
    const base=u=>plan?.jobs.find(j=>j.id===plan.unitJob[u.uid]);
    const pool=available.filter(u=>u.type!=='marine'&&!u.boardTransportUid&&!base(u)?.city&&!base(u)?.fort);
    const quota=Math.min(3,Math.max(1,Math.floor(budget/Math.max(1,threats.length))));
    const reserve=t=>{
        if(byUnit.size>=budget)return null;
        const gates=t.screenPoints||[t.holdHex],critical=['counter','corridor','relief'].includes(t.kind);
        const distance=u=>Math.min(...gates.map(p=>Math.hypot(p.x-u.x,p.y-u.y)));
        const candidates=pool.filter(u=>!byUnit.has(u.uid)&&wodAiDefenseFrontAvailable(u,t,plan)&&!t.pocketKeys?.has(getHexKey(getNearestHexToPoint(u.x,u.y)))&&
            (critical||base(u)?.kind!=='scout')&&distance(u)<hr*(critical?60:24)&&wodAiResponseCanArrive(u,t,distance(u)));
        const routine=t.kind==='territory'||t.kind==='corridor'&&t.predictive&&t.closureSeconds>60;
        const score=u=>distance(u)**2/Math.max(.5,wodAiUnitCombatPower(u))+(routine&&['main','armor','raid'].includes(base(u)?.kind)?hr*hr*80:0)+(previous?.unitJob[u.uid]===t.id?-hr*hr*20:0)+
            (t.kind==='corridor'&&t.riskUnits?.has(u.uid)?hr*hr*60:0);
        candidates.sort((a,b)=>score(a)-score(b));
        const deadline=t.kind==='corridor'?Math.min(75,Math.max(8,t.closureSeconds||35)):null;
        const u=candidates.slice(0,8).find(u=>gates.some(g=>wodAiCanReach(u,g)&&
            (deadline==null||wodAiArrivalSeconds(u,g,hr*3,deadline)<=deadline)));
        if(u){byUnit.set(u.uid,t.id);counts.set(t.id,(counts.get(t.id)||0)+1);}
        return u;
    };
    // An actual town assault needs viable relief before routine approach
    // screens reserve the remainder. Multiple towns share this priority.
    const counters=threats.filter(t=>t.kind==='counter'),cap=Math.min(8,Math.max(2,Math.floor(budget/Math.max(1,counters.length))));
    for(const t of counters){let power=0;for(let i=0;i<cap&&power<(t.neededPower||1)*.95;i++){
        yield;const u=reserve(t);if(!u)break;power+=wodAiUnitCombatPower(u);
    }}
    for(let round=0;round<quota;round++)for(const t of threats){
        yield;
        if((counts.get(t.id)||0)>round)continue;
        reserve(t);
    }
    return {byUnit,counts};
}

// Chase a beaten, visible opponent as a supported group, never as an individual
// order that abandons a guard post, an encirclement wing or a threatened corridor.
function wodAiIssuePursuit(unit,job,members) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,owner=unit.owner;
    unit._aiPursuitOrderAt=null;
    if(job.city||job.fort||job.operation||job.route||['counter','corridor','relief','reserve','scout','support','naval','marine','defend'].includes(job.kind)||
        job.frontOperation&&job.frontOperation.phase!=='advance'||unit._medicalRecovering||unit.retreating||unit.moraleBroken||unit._navalLanded||!isLandArmyUnit(unit))return false;
    if(job._pursuitCheckedAt==null||now-job._pursuitCheckedAt>=900){
        job._pursuitCheckedAt=now;
        members||=gameData.entities.filter(u=>job.members.includes(u.uid));
        const ready=members.filter(u=>u.owner===owner&&isLandArmyUnit(u)&&u.hp>u.maxHp*.55&&!u.retreating&&!u.moraleBroken&&!u._medicalRecovering&&!u.boardTransportUid);
        const seed=ready.slice().sort((a,b)=>ready.filter(u=>Math.hypot(u.x-b.x,u.y-b.y)<hr*6).length-ready.filter(u=>Math.hypot(u.x-a.x,u.y-a.y)<hr*6).length)[0];
        const core=seed?ready.filter(u=>Math.hypot(u.x-seed.x,u.y-seed.y)<hr*6):[],old=job._pursuit;
        const contacts=new Set(core.filter(u=>now-(u._aiLastCombatAt??-Infinity)<20000).map(u=>u._aiLastCombatUid));
        const visible=wodAiThreats(owner,false),foes=visible.filter(e=>(contacts.has(e.uid)||old?.uid===e.uid&&now-old.seenAt<3000)&&
            (e.retreating||e.moraleBroken||e.hp<e.maxHp*.85)&&!wodIsNavalUnit(e)&&e.type!=='convoy');
        foes.sort((a,b)=>Number(old?.uid===b.uid)-Number(old?.uid===a.uid)||a.hp/a.maxHp-b.hp/b.maxHp);
        job._pursuit=null;
        if(core.length>=3&&!core.some(u=>wodAiCorridorWithdrawal(u))&&core.every(u=>wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city))for(const foe of foes){
            const goal=getNearestHexToPoint(foe.x,foe.y),origin=old?.uid===foe.uid?old.origin:{x:seed.x,y:seed.y};
            if(!goal||isWaterHex(goal)||Math.hypot(goal.x-origin.x,goal.y-origin.y)>hr*14||!wodAiCanReach(seed,goal))continue;
            const opposition=visible.filter(e=>Math.hypot(e.x-goal.x,e.y-goal.y)<hr*7),balance=wodAiForecast(owner,core,opposition);
            if(balance.ratio<1.12)continue;
            const route=wodAiLandRoute(seed,goal);if(!route?.length||route.slice(0,6).some(h=>isWaterHex(h)&&!isBridgeHex(h)))continue;
            job._pursuit={uid:foe.uid,seenAt:now,origin,core:core.map(u=>u.uid),bound:route[Math.min(3,route.length-1)],goal};break;
        }
    }
    const pursuit=job._pursuit;if(!pursuit?.core.includes(unit.uid)||wodAiTacticalFallback(unit,job,false))return false;
    const core=gameData.entities.filter(u=>pursuit.core.includes(u.uid)&&u.hp>0),target=wodAiAdvanceHex(unit,pursuit.bound,core);
    if(!target)return false;
    const moved=wodAiMoveUnitTowardHex(unit,target,false,.08);
    if(moved){unit._aiPursuitOrderAt=now;wodAiStampOrder(unit,false,target,1500);unit.aiOrderResponseId=job.response?job.id:null;
        unit.aiOrderPhase=job.frontOperation?.phase||job.phase;unit.aiFrontBound=job.bound;
        wodAiRecord(owner,'pursuit',{job:job.id,enemy:pursuit.uid,troops:core.length,target:getHexKey(pursuit.goal)});}
    return moved;
}

// Wait for the rest of an assault instead of sending its foremost survivor
// farther into hostile land. Rear units keep marching to catch the vanguard.
function wodAiHoldUnsupportedVanguard(unit,job,members,goal) {
    if(!goal||!isLandArmyUnit(unit)||job.route)return false;
    const hr=gameData.hexRadius||20,ready=members.filter(u=>u.hp>u.maxHp*.4&&!u.retreating&&!u.moraleBroken&&!u._medicalRecovering&&!u.boardTransportUid);
    if(ready.filter(u=>Math.hypot(u.x-unit.x,u.y-unit.y)<hr*6).length>=3)return false;
    const distances=ready.map(u=>Math.hypot(u.x-goal.x,u.y-goal.y)).sort((a,b)=>a-b);
    if(ready.length>=3&&Math.hypot(unit.x-goal.x,unit.y-goal.y)>=distances[Math.floor(distances.length/2)]-hr*2)return false;
    const here=wodUnitSupplyHex(unit,getNearestHexToPoint(unit.x,unit.y));
    if(!here)return false;
    let target=here&&wodIsFriendlyOwner(here.owner,unit.owner)&&wodCurrentSupplyComponent(here,unit.owner).city?here:null;
    if(!target){const sites=getHexesInRadius(here.q,here.r,3).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&!isWaterHex(h)&&wodIsFriendlyOwner(h.owner,unit.owner)&&canUnitEnterHex(unit,h)&&wodCurrentSupplyComponent(h,unit.owner).city);
        sites.sort((a,b)=>Math.hypot(a.x-unit.x,a.y-unit.y)-Math.hypot(b.x-unit.x,b.y-unit.y));target=sites.find(h=>wodAiCanReach(unit,h));}
    if(!target)return false;
    wodAiMoveUnitTowardHex(unit,target,true,.08);wodAiStampOrder(unit,true,target,1800);
    wodAiRecord(unit.owner,'cohesion-hold',{unit:unit.uid,job:job.id,near:ready.filter(u=>Math.hypot(u.x-unit.x,u.y-unit.y)<hr*6).length});return true;
}

// A moving threat can shift the tested supply cross-section by one tile. It
// is still the same defense. Preserve its roster preference and wing choices
// instead of sending the same guards back and forth between fresh tile IDs.
function wodAiStabilizeCorridorJobs(selected,previous) {
    if(previous?.hexes!==gameData.hexes)return;
    const hr=gameData.hexRadius||20,used=new Set();
    for(const threat of selected.filter(t=>t.kind==='corridor')){
        const candidates=previous.jobs.filter(j=>j.kind==='corridor'&&!used.has(j.id)).map(job=>{
            const distance=Math.hypot(job.holdHex.x-threat.holdHex.x,job.holdHex.y-threat.holdHex.y);
            const overlap=[...(threat.riskUnits||[])].filter(id=>job.riskUnits?.has(id)).length;
            const share=overlap/Math.max(1,Math.min(threat.riskUnits?.size||0,job.riskUnits?.size||0));
            return{job,distance,share};
        }).filter(c=>c.distance<hr*5&&(c.share>=.5||c.job.id===threat.id)).sort((a,b)=>b.share-a.share||a.distance-b.distance);
        const old=candidates[0]?.job;
        if(!old){if(used.has(threat.id))threat.id+='-shift-'+getHexKey(threat.holdHex);used.add(threat.id);continue;}
        used.add(old.id);
        threat.id=old.id;threat._gateAssignments=old._gateAssignments&&{...old._gateAssignments};
        const gates=threat.screenPoints||[threat.holdHex],prior=old.screenPoints||[old.holdHex];
        if(gates.length!==prior.length)threat._gateAssignments=null;
        if(gates.length===2&&prior.length===2&&threat._gateAssignments&&
            Math.hypot(gates[1].x-prior[0].x,gates[1].y-prior[0].y)<Math.hypot(gates[0].x-prior[0].x,gates[0].y-prior[0].y))
            for(const id of Object.keys(threat._gateAssignments))threat._gateAssignments[id]=1-threat._gateAssignments[id];
        threat._corridorTargets=old._corridorTargets;
    }
}

function wodAiIssueTerritoryResponse(unit,job) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    const members=gameData.entities.filter(u=>job.members.includes(u.uid)&&u.hp>u.maxHp*.4&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken);
    const foes=wodAiThreats(unit.owner,false).filter(e=>job.contacts?.includes(e.uid)||Math.hypot(e.x-job.holdHex.x,e.y-job.holdHex.y)<hr*7);
    if(!foes.length)return false;
    let goal=getNearestHexToPoint(job.contactPoint?.x??foes[0].x,job.contactPoint?.y??foes[0].y);
    if(!goal)return false;
    if(isWaterHex(goal))goal=job.holdHex;
    if(job.responseCheckedAt==null||now-job.responseCheckedAt>=900){
        // Troops from adjacent formations and real coastal fire support still
        // fight this battle. Counting only the response roster made a superior
        // front wait while the same nearby friendly tanks were ignored.
        const gathered=gameData.entities.filter(u=>u.owner===unit.owner&&u.hp>u.maxHp*.4&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&!u.boardTransportUid&&
            u.damage>0&&Math.hypot(u.x-goal.x,u.y-goal.y)<hr*9&&wodAiArrivalSeconds(u,goal,u.range||50,12)<=12);
        job.responseCheckedAt=now;job.responseGathered=gathered.length;job.responseBalance=wodAiForecast(unit.owner,gathered,foes);
    }
    const balance=job.responseBalance,gatheredN=job.responseGathered;
    let state=job.responseState;
    const ready=gatheredN>=Math.min(members.length,foes.length>1?2:1)&&balance.ratio>=wodAiCommander(unit.owner).ratio;
    const attack=ready||!!(state?.attack&&now-state.at<8000&&balance.ratio>=1);
    if(!state||state.attack!==attack)state=job.responseState={attack,at:now};
    const here=getNearestHexToPoint(unit.x,unit.y),firing=foes.some(e=>Math.hypot(e.x-unit.x,e.y-unit.y)<(unit.range||50)*1.05);
    const target=attack?wodAiAdvanceHex(unit,goal,members):firing&&here&&wodIsFriendlyOwner(here.owner,unit.owner)?here:wodAiFormationSlot(unit,job,job.holdHex,goal,members);
    if(!target)return false;
    const moved=wodAiMoveUnitTowardHex(unit,target,!attack,.1);
    if(moved){wodAiStampOrder(unit,!attack,target,attack?6500:4000);wodAiRecord(unit.owner,'territory-response',{job:job.id,attack,troops:gatheredN,ratio:Math.round(balance.ratio*100)/100});}
    return true;
}

// Mobile reserves and spare quiet-line troops reinforce real nearby battles.
// Keep town/fort garrisons and urgent corridor responses in their assigned roles.
function wodAiRefreshFrontSupport(owner,plan,ready) {
    const hr=gameData.hexRadius||20,now=wodAiOperationTime(),assigned=gameData._aiFrontSupport||=(new WeakMap());
    for(const u of ready){
        const old=assigned.get(u),job=plan.jobs.find(j=>j.id===plan.unitJob[u.uid]),at=getNearestHexToPoint(u.x,u.y);
        const safe=old?.h&&wodIsFriendlyOwner(old.h.owner,owner)&&wodCurrentSupplyComponent(old.h,owner).city;
        const travelling=safe&&old.until>now&&Math.hypot(u.x-old.h.x,u.y-old.h.y)>hr*1.8&&
            !u.retreating&&!u._medicalRecovering&&!u.moraleBroken&&(u.stuckTimer||0)<4;
        const settling=safe&&old.until>now&&Math.hypot(u.x-old.h.x,u.y-old.h.y)<=hr*1.8&&now-(old.arrivedAt??=now)<8000;
        if(safe&&old?.hexes===gameData.hexes&&old.job===job?.id&&!u.retreating&&!u._medicalRecovering&&!u.moraleBroken&&!gameData._aiDefenseByOwner?.[owner]?.unitJob[u.uid]&&at&&wodIsFriendlyOwner(at.owner,owner)&&wodCurrentSupplyComponent(at,owner).city&&
            (travelling||settling||u._combatEngaged||now-(old.contactAt??-Infinity)<8000)){
            if(u._combatEngaged){old.contactAt=now;old.h=at;old.until=now+8000;}
        }else assigned.delete(u);
    }
    const foes=wodAiThreats(owner,false).filter(e=>isLandArmyUnit(e)),fronts=[];
    for(const e of foes){
        if(fronts.some(f=>Math.hypot(f.enemy.x-e.x,f.enemy.y-e.y)<hr*6))continue;
        const allies=ready.filter(u=>isLandArmyUnit(u)&&Math.hypot(u.x-e.x,u.y-e.y)<Math.max(u.range||50,e.range||50)+hr*2);
        if(!allies.length)continue;
        const enemies=foes.filter(v=>Math.hypot(v.x-e.x,v.y-e.y)<hr*5);
        const fighting=allies.filter(u=>Math.hypot(u.x-e.x,u.y-e.y)<(u.range||50)+hr*.6);
        const gap=enemies.reduce((n,u)=>n+wodAiUnitCombatPower(u),0)*1.35+1-fighting.reduce((n,u)=>n+wodAiUnitCombatPower(u),0);
        if(gap>0)fronts.push({enemy:e,allies,gap});
    }
    fronts.sort((a,b)=>b.gap-a.gap);
    const base=u=>plan.jobs.find(j=>j.id===plan.unitJob[u.uid]);
    const reserves=ready.filter(u=>base(u)?.kind==='reserve'),used=new Set(),loans={};
    const defense=gameData._aiDefenseByOwner?.[owner];
    const donors=ready.filter(u=>{
        const j=base(u);if(!j||j.city||j.fort||u.isGeneral||u._medicalRecovering||u.retreating||u.moraleBroken||!isLandArmyUnit(u)||defense?.unitJob[u.uid])return false;
        return j.kind==='reserve'||j.kind==='hold'&&j.members.length>1&&!foes.some(e=>Math.hypot(e.x-u.x,e.y-u.y)<hr*8);
    });
    let committed=0,reserveN=0;
    for(const u of ready)if(assigned.has(u)){const j=base(u);used.add(getHexKey(assigned.get(u).h));committed++;loans[j.id]=(loans[j.id]||0)+1;if(j.kind==='reserve')reserveN++;}
    for(const front of fronts){
        donors.sort((a,b)=>Math.hypot(a.x-front.enemy.x,a.y-front.enemy.y)-Math.hypot(b.x-front.enemy.x,b.y-front.enemy.y));
        for(const u of donors){
            const j=base(u);if(wodAiFrontOwner(u)&&wodAiFrontOwner(u)!==front.enemy.owner)continue;if(assigned.has(u)||front.gap<=0||committed>=Math.max(2,Math.ceil(ready.length*.25)))continue;
            if(j.kind==='reserve'&&reserveN>=Math.max(1,reserves.length-1)||j.kind==='hold'&&(loans[j.id]||0)>=j.members.length-1)continue;
            const lead=front.allies.slice().sort((a,b)=>Math.hypot(u.x-a.x,u.y-a.y)-Math.hypot(u.x-b.x,u.y-b.y))[0],at=getNearestHexToPoint(lead.x,lead.y);
            const choices=getHexesInRadius(at.q,at.r,4).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&!used.has(getHexKey(h))&&!isWaterHex(h)&&wodIsFriendlyOwner(h.owner,owner)&&canUnitEnterHex(u,h)&&wodCurrentSupplyComponent(h,owner).city&&!isWorldPositionBlockedByUnits(u,h.x,h.y));
            const score=h=>Math.abs(Math.hypot(h.x-front.enemy.x,h.y-front.enemy.y)-(u.range||50)*.85)*3+Math.hypot(u.x-h.x,u.y-h.y)*.15+getTerrainDefenseModifier(u,h)*hr;
            choices.sort((a,b)=>score(a)-score(b));const h=choices.slice(0,8).find(h=>wodAiCanReach(u,h));if(!h)continue;
            const travel=Math.hypot(u.x-h.x,u.y-h.y)/Math.max(1,u.speed*WOD_MOVE_SPEED_FACTOR);
            assigned.set(u,{job:j.id,hexes:gameData.hexes,h,until:now+Math.min(90000,Math.max(18000,travel*1500+8000))});used.add(getHexKey(h));front.gap-=wodAiUnitCombatPower(u);committed++;loans[j.id]=(loans[j.id]||0)+1;if(j.kind==='reserve')reserveN++;
            u.aiOrderUntil=0;u.aiOrderResponseId='front-support';gameData._aiMoveQueue?.delete(u);
            wodAiRecord(owner,'front-reinforcement',{unit:u.uid,job:j.id,target:getHexKey(h)});
        }
    }
}

// Combine understrength neighbors without repeatedly folding a whole front
// into its largest group. Committed operations retain their own regiments.
function wodAiConcentrateAssaults(owner,plan,ready) {
    const hr=gameData.hexRadius||20;
    const jobs=plan.jobs.filter(j=>['main','armor','raid'].includes(j.kind)&&j.members.length);
    const groupCap=6;
    const operationByUnit=new Map(wodAiActiveFrontOperations(owner).flatMap(o=>o.members.map(id=>[id,o])));
    const center=j=>{const us=ready.filter(u=>j.members.includes(u.uid));return{x:us.reduce((n,u)=>n+u.x,0)/Math.max(1,us.length),y:us.reduce((n,u)=>n+u.y,0)/Math.max(1,us.length)};};
    jobs.sort((a,b)=>Number(b.operationState?.stage==='attack')-Number(a.operationState?.stage==='attack')||Number(b.kind==='armor')-Number(a.kind==='armor')||b.members.length-a.members.length);
    for(let i=0;i<jobs.length;i++){
        const a=jobs[i];if(!a.members.length)continue;
        for(const b of jobs.slice(i+1)){
            if(a.frontOwner&&b.frontOwner&&a.frontOwner!==b.frontOwner)continue;
            if(b.operationState?.stage==='attack'&&b.operationState!==a.operationState)continue;
            const regroup=a.waitingForStrength&&b.waitingForStrength;
            if(!b.members.length||a.members.length+b.members.length>groupCap||Math.min(a.members.length,b.members.length)>=3)continue;
            const ao=a.members.map(id=>operationByUnit.get(id)).find(Boolean),bo=b.members.map(id=>operationByUnit.get(id)).find(Boolean);
            if(ao&&bo&&ao!==bo)continue;
            const ga=a.objectiveCity||a.objectiveHex,gb=b.objectiveCity||b.objectiveHex,ca=center(a),cb=center(b);
            if(!ga||!gb||!regroup&&Math.hypot(ga.x-gb.x,ga.y-gb.y)>hr*12||Math.hypot(ca.x-cb.x,ca.y-cb.y)>hr*14)continue;
            const donors=ready.filter(u=>b.members.includes(u.uid));
            if(!donors.every(u=>wodAiCanReach(u,a.holdHex||ga)&&Math.hypot(u.x-ca.x,u.y-ca.y)/Math.max(1,u.speed*WOD_MOVE_SPEED_FACTOR)<65))continue;
            for(const u of donors){plan.unitJob[u.uid]=a.id;a.members.push(u.uid);u.aiTfJobId=a.id;u.aiTfKind=a.kind;u.aiTfRole=a.role;u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}
            b.members=[];delete wodAiBattlePlan(owner).requests[b.id];a.quota=a.members.length;
            if(a.operationState)a.operationState.checkedAt=null;
            wodAiRecord(owner,'assault-concentration',{job:a.id,retired:b.id,troops:a.members.length});
        }
    }
    plan.jobs=plan.jobs.filter(j=>j.members.length||!['main','armor','raid'].includes(j.kind));
}

function wodAiDefenseTheater(owner,selected,army,plan) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,towns=gameData.cities.filter(c=>c.owner===owner);
    const base=u=>plan?.jobs.find(j=>j.id===plan.unitJob[u.uid]);
    const candidates=army.filter(u=>!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&!wodIsNavalUnit(u)&&!base(u)?.city&&!base(u)?.fort);
    for(const t of selected.filter(t=>t.kind==='counter')){
        const foes=wodAiThreats(owner,false).filter(e=>t.enemyIds.includes(e.uid));
        const contact=foes.length?Math.min(...foes.map(e=>Math.max(0,Math.hypot(e.x-t.city.x,e.y-t.city.y)-(e.range||50))/Math.max(1,e.speed*WOD_MOVE_SPEED_FACTOR))):0;
        t.deadline=Math.max(14,contact+20);t.arrivals={};
        const nearest=candidates.slice().sort((a,b)=>Number(!!wodAiFrontOwner(a)&&wodAiFrontOwner(a)!==t.frontOwner)-Number(!!wodAiFrontOwner(b)&&wodAiFrontOwner(b)!==t.frontOwner)||Math.hypot(a.x-t.holdHex.x,a.y-t.holdHex.y)-Math.hypot(b.x-t.holdHex.x,b.y-t.holdHex.y)).slice(0,24);
        for(const u of nearest)t.arrivals[u.uid]=wodAiArrivalSeconds(u,t.holdHex,hr*3,Math.max(45,t.deadline));
        const timely=nearest.filter(u=>t.arrivals[u.uid]<=t.deadline),power=timely.reduce((n,u)=>n+wodAiUnitCombatPower(u),0);
        t.feasible=power>=t.neededPower*.9;t.reliefPower=power;t.timelyIds=timely.map(u=>u.uid);
        t.theaterScore=(towns.length===1?400:0)+(t.feasible?240:0)+Math.min(120,t.enemies*15)+200/(1+contact/10)+Number(!!t.city.hasFactory)*35;
    }
    const counters=selected.filter(t=>t.kind==='counter').sort((a,b)=>b.theaterScore-a.theaterScore);
    const prior=plan?.defenseTheater,keep=counters.find(t=>t.id===prior?.id&&t.feasible);
    const primary=keep&&now-prior.at<12000&&keep.theaterScore+90>=counters[0]?.theaterScore?keep:counters[0];
    if(!primary)return null;
    if(plan){if(prior?.id!==primary.id)wodAiRecord(owner,'defense-theater',{job:primary.id,feasible:primary.feasible,seconds:Math.round(primary.deadline),power:primary.reliefPower});plan.defenseTheater={id:primary.id,at:prior?.id===primary.id?prior.at:now};}
    primary.primaryTheater=true;
    const theaters=[primary];
    for(const t of counters)if(t!==primary&&t.feasible&&!theaters.some(p=>Math.hypot(p.city.x-t.city.x,p.city.y-t.city.y)<hr*12||(!t.frontOwner||t.frontOwner===p.frontOwner)&&(t.timelyIds||[]).filter(id=>p.timelyIds?.includes(id)).length>Math.min(t.timelyIds?.length||0,p.timelyIds?.length||0)*.4)){t.primaryTheater=true;theaters.push(t);}
    selected.sort((a,b)=>Number(!!b.primaryTheater)-Number(!!a.primaryTheater)||b.score-a.score);
    return primary;
}

function wodAiSectorAdvanceHex(unit,job,members) {
    const goal=job.objectiveHex;if(!goal)return null;
    const hr=gameData.hexRadius||20;
    if(job.cutHexes?.length){
        const ordered=job.cutHexes.map(k=>gameData.hexes[k]).filter(Boolean),rank=members.slice().sort((a,b)=>a.uid.localeCompare(b.uid)).findIndex(u=>u===unit);
        // Opposing wings close the same corridor from its two ends.
        const wing=rank%2?ordered.slice().reverse():ordered;
        return wing.find(h=>wodIsHostileOwner(h.owner,unit.owner)&&canUnitEnterHex(unit,h)&&wodAiCanReach(unit,h))||goal;
    }
    const choices=getHexesInRadius(goal.q,goal.r,3).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&!isWaterHex(h)&&!h.cityId&&wodIsHostileOwner(h.owner,unit.owner)&&canUnitEnterHex(unit,h)&&hasOwnerNeighbor(h,unit.owner)&&wodAiCanReach(unit,h));
    const used=job._sectorTargets||=( {} );
    const score=h=>Math.hypot(h.x-goal.x,h.y-goal.y)*.7+Math.hypot(h.x-unit.x,h.y-unit.y)*.3+Object.entries(used).filter(([id,key])=>id!==unit.uid&&key===getHexKey(h)).length*hr*8;
    choices.sort((a,b)=>score(a)-score(b));const target=choices[0]||goal;used[unit.uid]=getHexKey(target);return target;
}

// Pick one attainable theater for nearby stalled attack groups. Independent
// town selections used to split a viable army into several losing attacks.
function wodAiCoordinateCampaign(owner,plan,ready) {
    const fronts=[...new Set(plan.jobs.filter(j=>['main','armor','raid'].includes(j.kind)&&j.members.length).map(j=>j.frontOwner||0))];
    for(const front of fronts)wodAiCoordinateFrontCampaign(owner,plan,ready,front);
}
function wodAiCoordinateFrontCampaign(owner,plan,ready,frontOwner) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    plan._campaignFrontChecks||={};if(plan._campaignFrontChecks[frontOwner]!=null&&now-plan._campaignFrontChecks[frontOwner]<5000)return;
    plan._campaignFrontChecks[frontOwner]=now;
    const jobs=plan.jobs.filter(j=>['main','armor','raid'].includes(j.kind)&&j.members.length&&!j.cutoff&&!j.operation&&(j.frontOwner||0)===frontOwner);
    const ids=new Set(jobs.flatMap(j=>j.members)),pool=ready.filter(u=>ids.has(u.uid)&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&
        !gameData._aiDefenseByOwner?.[owner]?.unitJob[u.uid]);
    if(!pool.length)return;
    const choices=[];
    for(const city of wodAiKnownCities(owner).filter(c=>wodIsHostileOwner(c.owner,owner)&&(!frontOwner||c.owner===frontOwner))){
        const force=pool.filter(u=>wodAiCanReach(u,city)).sort((a,b)=>Math.hypot(a.x-city.x,a.y-city.y)-Math.hypot(b.x-city.x,b.y-city.y)).slice(0,14);
        if(!force.length)continue;
        // A second front cannot count as immediate support for this theater.
        const lead=force[0],near=force.filter(u=>Math.hypot(u.x-lead.x,u.y-lead.y)<hr*20);
        choices.push({city,ready:wodAiAssaultBalance(owner,near,city).strategicReady,cost:wodAiObjectiveCost(owner,near,city)});
    }
    choices.sort((a,b)=>Number(b.ready)-Number(a.ready)||a.cost-b.cost);
    let best=choices[0];if(!best)return;
    const prior=plan.campaignAims?.[frontOwner]||(!frontOwner&&plan.campaignAim),current=choices.find(c=>c.city.id===prior?.cityId);
    if(current&&now-prior.at<45000&&current.ready===best.ready&&current.cost<=best.cost+10)best=current;
    const aim={cityId:best.city.id,at:prior?.cityId===best.city.id?prior.at:now,reason:best.ready?'reachable-weak-production':'concentrate-for-production',ready:best.ready};
    plan.campaignAims||={};plan.campaignAims[frontOwner]=aim;plan.campaignAim=aim;
    const strategy=wodAiBattlePlan(owner);if((plan.fronts?.length||0)<2)strategy.primaryId=aim.cityId;
    for(const job of jobs){
        const members=pool.filter(u=>job.members.includes(u.uid));
        if(!members.length||!members.every(u=>wodAiCanReach(u,best.city)))continue;
        const goal=job.objectiveCity||job.objectiveHex;
        // A viable force keeps its own sector or secondary objective. Only
        // fragments need a common rally before they can form a useful group.
        const distance=goal?Math.min(...members.map(u=>Math.hypot(u.x-goal.x,u.y-goal.y))):Infinity,key=goal&&(goal.id||getHexKey(goal)),watch=job._campaignProgress;
        if(!watch||watch.key!==key||distance<watch.distance-hr||members.some(u=>u._combatEngaged))job._campaignProgress={key,distance,at:now};
        const currentWatch=job._campaignProgress;
        const stalled=currentWatch&&currentWatch.key===key&&now-currentWatch.at>35000&&now-(job._campaignRetaskAt??-Infinity)>45000;
        if(job.objectiveCity?.id===aim.cityId&&!stalled||!stalled&&['attack','consolidate','secure-approach','protect-flanks'].includes(job.operationState?.stage))continue;
        if(members.length>=3&&goal&&wodIsHostileOwner(goal.owner,owner)&&!stalled)continue;
        if(stalled&&best.ready)wodAiRecord(owner,'campaign-retask',{job:job.id,from:key,to:best.city.id});
        if(!stalled&&goal&&wodAiAssaultBalance(owner,members,goal).ready&&job.objectiveCity&&!job.waitingForStrength)continue;
        job.objectiveCity=best.city;job.objectiveHex=null;job.attackHex=gameData.hexes[best.city.q+','+best.city.r];job.recon=false;
        job.phase=best.ready?'assault':'assemble';job.phaseAt=now;job.operationState=null;job.waitingForStrength=!best.ready;job._formationSlots={};
        job._campaignRetaskAt=now;job._campaignProgress={key:best.city.id,distance:Math.min(...members.map(u=>Math.hypot(u.x-best.city.x,u.y-best.city.y))),at:now};
        for(const u of members){u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}
    }
    wodAiRecord(owner,'campaign-objective',{city:aim.cityId,reason:aim.reason,groups:jobs.length});
}

// A border fight already covered by a superior assault force does not need
// a second commander recalling those same regiments into a holding response.
function wodAiBorderBattleCovered(owner,cluster,plan) {
    if(!plan)return false;
    const hr=gameData.hexRadius||20,foes=wodAiThreats(owner,false).filter(e=>cluster.contacts.includes(e.uid));
    if(gameData.cities.some(c=>c.owner===owner&&Math.hypot(c.x-cluster.x,c.y-cluster.y)<hr*10))return false;
    if(wodAiActiveFrontOperations(owner).some(op=>{
        const trap=op.ambush;if(!trap||!cluster.contacts.some(id=>trap.contacts.includes(id)))return false;
        const force=gameData.entities.filter(u=>op.members.includes(u.uid)&&u.hp>u.maxHp*.65&&!u.retreating&&!u._medicalRecovering&&!u.moraleBroken&&
            Math.hypot(u.x-trap.center.x,u.y-trap.center.y)<hr*11);
        return force.length>=6&&Math.hypot(cluster.x-trap.center.x,cluster.y-trap.center.y)<hr*10&&
            wodAiForecast(owner,force,wodAiThreats(owner,false).filter(e=>cluster.contacts.includes(e.uid))).ratio>=1.2;
    }))return true;
    const fighters=gameData.entities.filter(u=>u.owner===owner&&u.hp>u.maxHp*.5&&!u.retreating&&!u.moraleBroken&&!u._medicalRecovering&&!u.boardTransportUid&&
        ['main','armor','raid'].includes(plan.jobs.find(j=>j.id===plan.unitJob[u.uid])?.kind)&&Math.hypot(u.x-cluster.x,u.y-cluster.y)<hr*9&&
        wodAiArrivalSeconds(u,cluster,u.range||50,12)<=12);
    const inside=foes.some(e=>wodIsFriendlyOwner(getNearestHexToPoint(e.x,e.y)?.owner,owner));
    const engaged=foes.some(e=>fighters.some(u=>u.combatTargetUid===e.uid||e.combatTargetUid===u.uid||Math.hypot(e.x-u.x,e.y-u.y)<(u.range||50)+hr*.5));
    const committed=wodAiActiveFrontOperations(owner).some(op=>op.phase==='advance'&&op.hostile===foes[0]?.owner&&
        fighters.filter(u=>op.members.includes(u.uid)&&u.target&&Math.hypot((u.orderTarget||u.target).x-cluster.x,(u.orderTarget||u.target).y-cluster.y)<hr*7).length>=3);
    return fighters.length>=3&&(!inside||engaged||committed)&&wodAiForecast(owner,fighters,foes).ratio>=wodAiAttackThreshold(owner);
}

// Every tactical consumer resolves the same mission. Emergency loans suspend
// the offensive without changing a regiment's permanent group or home front.
function wodAiResolveMission(unit,plan) {
    const base=plan.jobs.find(j=>j.id===(plan.unitJob[unit.uid]||unit.aiTfJobId));
    const defense=gameData._aiDefenseByOwner?.[unit.owner],response=defense?.jobs.find(j=>j.id===defense.unitJob[unit.uid]);
    const offensive=wodAiFrontOffensiveJob(unit,plan,response);
    let job=base?.city||base?.fort?base:offensive||response||base;
    const now=wodAiOperationTime(),previous=unit._aiMission;
    if(previous&&previous.until>now&&!base?.city&&!base?.fort&&!(response&&['hold','reserve','support'].includes(base?.kind))&&!unit._medicalRecovering&&!unit.retreating&&!unit.moraleBroken&&!(unit._navalAssaultUntil>now)&&!wodAiFrontCritical(response)&&job?.id!==previous.id){
        const committed=[...plan.jobs,...wodAiActiveFrontOperations(unit.owner).flatMap(op=>op.jobs||[])].find(j=>j.id===previous.id&&j.members?.includes(unit.uid));
        if(committed?.frontOperation&&committed.frontOperation.until>now&&
            (committed.frontOperation===job?.frontOperation||!job?.frontOperation))job=committed;
    }
    const kind=unit._medicalRecovering?'recovery':unit._navalAssaultUntil>wodAiOperationTime()?'naval':job?.frontOperation?'offensive':job?.response?'defense':job?.kind;
    const id=kind==='recovery'?'recovery':job?.id;
    if(unit._aiMission?.id!==id||unit._aiMission?.kind!==kind){
        unit._aiMission={id,kind,at:now,until:now+(job?.frontOperation?20000:kind==='defense'?6000:10000),front:wodAiFrontOwner(unit),base:base?.id};
        unit.aiOrderUntil=0;unit.aiOrderResponseId='mission-change';gameData._aiMoveQueue?.delete(unit);
        wodAiRecord(unit.owner,'mission-assigned',{unit:unit.uid,mission:id,kind,base:base?.id});
    }
    return job||null;
}

function wodAiMoveIntentKey(unit) {
    const job=wodAiGetUnitTaskJob(unit);
    const op=job?.frontOperation||job?.operationState,goal=op?.strategicGoal||op?.advanceGoal||op?.goal||job?.objectiveCity||job?.objectiveHex;
    return [unit._aiMission?.id||unit.aiTfJobId||unit.aiTfKind||'direct',op?.ambush?.stage||'',goal?.id||goal&&getHexKey(goal)||'',unit._aiWithdrawal?.cutId||''].join(':');
}

function wodAiKeepMoveIntent(unit,x,y,holding) {
    if(wodMpIsHumanOwner(unit.owner)||unit.retreating||unit._aiWithdrawal||gameData._aiSupplyWithdrawals?.has(unit)||unit._aiRegroupUntil>wodAiOperationTime()||unit._trafficYield)return false;
    const defense=gameData._aiDefenseByOwner?.[unit.owner],response=defense?.jobs.find(j=>j.id===defense.unitJob[unit.uid]);if(wodAiFrontCritical(response))return false;
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

// A screen can advance the front in short supported bounds. Keeping every
// hold group stationary even on an empty border stranded most small armies.
// Town/fort guards, reserves and emergency response troops remain reserved.
function wodAiFrontProbeSafe(owner,goal) {
    const hr=gameData.hexRadius||20;
    return !wodAiThreats(owner).some(e=>Math.hypot(e.x-goal.x,e.y-goal.y)<hr*12&&
        (e._intelMemory?Math.hypot(e.x-goal.x,e.y-goal.y)<(e.range||50)+hr*3+(e.uncertainty||0)*.15:
            wodAiArrivalSeconds(e,goal,e.range||50,8)<=8));
}

function wodAiQuietFrontSafe(owner,point,contacts=wodAiThreats(owner)) {
    const hr=gameData.hexRadius||20;
    return !contacts.some(e=>e.damage>0&&Math.hypot(e.x-point.x,e.y-point.y)<(e.range||50)+hr*1.25+(e.uncertainty||0)*.35);
}

// An empty frontier needs a short territorial bound, not a full assault army.
// Search through supplied friendly ground and finish at its adjacent enemy
// cell. Never plan a solitary march through several hostile cells or water.
function wodAiIssueQuietFrontAdvance(unit,job) {
    const owner=unit.owner,plan=gameData.aiTaskForces?.[owner],now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    const old=unit._aiQuietAdvance,continuing=old?.hexes===gameData.hexes&&old.job===job.id&&now-old.at<12000;
    if(!plan||job.city||job.fort||job.response||job.operation||unit.isGeneral||!isLandArmyUnit(unit)||unit.type==='marine'||
        !['hold','reserve','main','armor','raid'].includes(job.kind)||unit.hp<unit.maxHp*.7||unit.retreating||unit.moraleBroken||unit._medicalRecovering||unit.boardTransportUid||
        unit._navalAssaultUntil>now||gameData._aiDefenseByOwner?.[owner]?.unitJob[unit.uid]||wodAiCorridorWithdrawal(unit))return false;
    if(unit._aiFallbackAt!=null&&now-unit._aiFallbackAt<20000)return false;
    if(!['hold','reserve'].includes(job.kind)&&job.phase==='assault')return false;
    if(!continuing&&job.kind!=='hold'&&job.holdHex&&Math.hypot(unit.x-job.holdHex.x,unit.y-job.holdHex.y)>hr*8)return false;
    const here=getNearestHexToPoint(unit.x,unit.y);
    const contacts=wodAiThreats(owner).filter(e=>Math.hypot(e.x-unit.x,e.y-unit.y)<hr*16+(e.uncertainty||0)*.35);
    if(!here||!wodIsFriendlyOwner(here.owner,owner)||!wodCurrentSupplyComponent(here,owner).city||!wodAiQuietFrontSafe(owner,unit,contacts))return false;
    const goal=old?.hexes===gameData.hexes&&old.job===job.id&&gameData.hexes[old.goal];
    if(goal&&wodIsHostileOwner(goal.owner,owner)&&now-old.at<12000&&wodAiQuietFrontSafe(owner,goal,contacts)&&unit.target&&(unit.stuckTimer||0)<1&&(unit.blockedTimer||0)<1)return true;
    // A real assembly march or another useful move keeps authority. Reached
    // holds and a completed territorial bound can immediately find the next.
    const end=unit.orderTarget||unit.target?.finalTarget||unit.target;
    const following=goal&&end&&Math.hypot(end.x-goal.x,end.y-goal.y)<hr*1.5;
    if(unit.target&&!following&&end&&Math.hypot(end.x-unit.x,end.y-unit.y)>hr*2.5)return false;
    if(unit._aiQuietCheckAt!=null&&now-unit._aiQuietCheckAt<900)return false;unit._aiQuietCheckAt=now;
    const intel=wodFogActive()?wodFogFactionIntel(owner):null,front=wodAiFrontOwner(unit),seen=new Set([getHexKey(here)]),queue=[{h:here,depth:0}],sites=[];
    for(let i=0;i<queue.length;i++){
        const {h,depth}=queue[i];if(depth>=6)continue;
        for(const n of getNeighborHexes(h)){
            const key=getHexKey(n);if(seen.has(key)||isWaterHex(n)||!canUnitEnterHex(unit,n)||!wodCanStepBetweenHexes(unit,h,n,true))continue;
            seen.add(key);
            if(wodIsFriendlyOwner(n.owner,owner)){queue.push({h:n,depth:depth+1});continue;}
            if(!wodIsHostileOwner(n.owner,owner)||front&&n.owner!==front||intel&&!intel.visible.has(key)||!wodAiQuietFrontSafe(owner,n,contacts))continue;
            const support=getNeighborHexes(n).filter(p=>!isWaterHex(p)&&wodIsFriendlyOwner(p.owner,owner));
            if(!support.some(p=>wodCurrentSupplyComponent(p,owner).city))continue;
            sites.push({h:n,depth:depth+1,support:support.length});
        }
    }
    if(!sites.length)return false;
    const reservations=plan.quietFrontReservations||=(new Map());
    for(const [key,r]of reservations)if(r.until<=now||!wodIsHostileOwner(gameData.hexes[key]?.owner,owner))reservations.delete(key);
    const objective=job.objectiveCity||job.objectiveHex||job.attackHex;
    const town=wodAiKnownCities(owner).filter(c=>wodIsHostileOwner(c.owner,owner)&&(!front||c.owner===front)).sort((a,b)=>Math.hypot(a.x-here.x,a.y-here.y)-Math.hypot(b.x-here.x,b.y-here.y))[0];
    const aim=objective&&wodIsHostileOwner(objective.owner,owner)?objective:town||sites[0].h,bearing=unit._aiQuietBearing;
    const dx=aim.x-here.x,dy=aim.y-here.y,length=Math.hypot(dx,dy)||1;
    const direction=bearing?.job===job.id?bearing:unit._aiQuietBearing={job:job.id,x:dx/length,y:dy/length};
    const score=p=>p.depth*hr*1.5-((p.h.x-here.x)*direction.x+(p.h.y-here.y)*direction.y)*1.2;
    sites.sort((a,b)=>score(a)-score(b));
    const target=sites.find(p=>!reservations.has(getHexKey(p.h))||reservations.get(getHexKey(p.h)).unit===unit.uid)?.h;
    if(!target)return false;
    if(!wodAiMoveUnitTowardHex(unit,target,false,.05))return false;
    unit._aiQuietAdvance={hexes:gameData.hexes,job:job.id,goal:getHexKey(target),at:now};unit.aiCaptureHexKey=getHexKey(target);
    reservations.set(getHexKey(target),{unit:unit.uid,until:now+12000});
    if(job.kind==='hold'&&job.members.length===1){job.holdHex=here;job.attackHex=target;}
    wodAiStampOrder(unit,false,target,3000);wodAiRecord(owner,'empty-front-advance',{unit:unit.uid,job:job.id,target:getHexKey(target)});
    return true;
}

function wodAiIssueFrontAdvance(unit,job) {
    const owner=unit.owner,hr=gameData.hexRadius||20,now=wodAiOperationTime(),plan=gameData.aiTaskForces?.[owner];
    if(!plan||!job.attackHex||!job.holdHex)return false;
    const here=getNearestHexToPoint(unit.x,unit.y);
    if(!here||!wodCurrentSupplyComponent(here,owner).city)return false;
    if(!job._frontBearing||job._frontAimId&&!wodAiKnownCities(owner).some(c=>c.id===job._frontAimId&&wodIsHostileOwner(c.owner,owner))){
        const town=wodAiKnownCities(owner).filter(c=>wodIsHostileOwner(c.owner,owner)).sort((a,b)=>Math.hypot(a.x-here.x,a.y-here.y)-Math.hypot(b.x-here.x,b.y-here.y))[0];
        const primary=wodAiKnownCities(owner).find(c=>c.id===plan.campaignAim?.cityId&&wodIsHostileOwner(c.owner,owner)&&(!town||Math.hypot(c.x-here.x,c.y-here.y)<Math.hypot(town.x-here.x,town.y-here.y)+hr*12));
        const aim=primary||town||job.attackHex,dx=aim.x-job.holdHex.x,dy=aim.y-job.holdHex.y,len=Math.hypot(dx,dy)||1;
        job._frontAimId=aim.id||null;
        job._frontBearing={x:dx/len,y:dy/len};
    }
    const forward=h=>(h.x-here.x)*job._frontBearing.x+(h.y-here.y)*job._frontBearing.y;
    // Capturing the ordered cell can finish before the marker reaches its
    // center. Move the guard line onto that gain instead of ordering it back
    // to yesterday's rally point on the next command pass.
    const gained=!wodIsHostileOwner(job.attackHex.owner,owner);
    if(gained){
        const front=getHexesInRadius(here.q,here.r,5).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&
            !isWaterHex(h)&&wodIsFriendlyOwner(h.owner,owner)&&canUnitEnterHex(unit,h)&&wodCurrentSupplyComponent(h,owner).city&&
            getNeighborHexes(h).some(n=>!isWaterHex(n)&&wodIsHostileOwner(n.owner,owner)));
        front.sort((a,b)=>Math.hypot(a.x-job.attackHex.x,a.y-job.attackHex.y)-Math.hypot(b.x-job.attackHex.x,b.y-job.attackHex.y)-(forward(a)-forward(b))*.25);
        if(front[0]){job.holdHex=front[0];job.attackHex=getNeighborHexes(front[0]).filter(h=>!isWaterHex(h)&&wodIsHostileOwner(h.owner,owner)).sort((a,b)=>forward(b)-forward(a))[0];}
    }
    if(!job.attackHex||Math.hypot(unit.x-job.holdHex.x,unit.y-job.holdHex.y)>hr*7)return false;
    let push=plan.frontAdvances?.find(p=>Math.hypot(p.anchor.x-job.holdHex.x,p.anchor.y-job.holdHex.y)<hr*5&&p.until>now&&
        p.members.includes(unit.uid)&&wodIsHostileOwner(p.objectiveHex.owner,owner));
    if(!push){
        if(job._frontProbeAt!=null&&now-job._frontProbeAt<2500){
            // A probe's paint can finish before the next planning pulse. Keep
            // that gain rather than issuing an interim march to the old line.
            if(gained&&unit.target)return true;
            return false;
        }
        job._frontProbeAt=now;
        const members=gameData.entities.filter(u=>u.owner===owner&&isLandArmyUnit(u)&&u.hp>u.maxHp*.65&&!u.retreating&&!u.moraleBroken&&!u._medicalRecovering&&!u.boardTransportUid&&
            !gameData._aiDefenseByOwner?.[owner]?.unitJob[u.uid]&&Math.hypot(u.x-job.holdHex.x,u.y-job.holdHex.y)<hr*7&&
            ['hold','main','armor','raid'].includes(plan.jobs.find(j=>j.id===plan.unitJob[u.uid])?.kind)&&!wodAiCorridorWithdrawal(u));
        if(!members.includes(unit)||members.length<3)return false;
        const reach=wodAiOperationReach(unit),explored=wodFogActive()?wodFogFactionIntel(owner).explored:null,sites=getHexesInRadius(job.holdHex.q,job.holdHex.r,3).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&
            !isWaterHex(h)&&wodIsHostileOwner(h.owner,owner)&&hasOwnerNeighbor(h,owner)&&reach.has(getHexKey(h))&&canUnitEnterHex(unit,h)&&(!explored||explored.has(getHexKey(h))));
        sites.sort((a,b)=>Math.hypot(a.x-job.attackHex.x,a.y-job.attackHex.y)-Math.hypot(b.x-job.attackHex.x,b.y-job.attackHex.y)-(forward(a)-forward(b))*.6);
        const goal=sites.slice(0,8).find(h=>wodAiAssaultBalance(owner,members,h).ready);
        if(!goal)return false;
        push={anchor:job.holdHex,objectiveHex:goal,members:members.map(u=>u.uid),until:now+18000};
        plan.frontAdvances=(plan.frontAdvances||[]).filter(p=>p.until>now&&wodIsHostileOwner(p.objectiveHex.owner,owner)).slice(-15);plan.frontAdvances.push(push);
        wodAiRecord(owner,'front-advance',{job:job.id,target:getHexKey(goal),troops:members.length});
    }
    const members=gameData.entities.filter(u=>push.members.includes(u.uid)&&u.hp>u.maxHp*.5&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&!u.boardTransportUid&&
        !gameData._aiDefenseByOwner?.[owner]?.unitJob[u.uid]&&!wodAiCorridorWithdrawal(u));
    if(members.length<3||!members.includes(unit)||!wodAiAssaultBalance(owner,members,push.objectiveHex).ready)return false;
    const destination=wodAiSectorAdvanceHex(unit,push,members);
    if(wodAiHoldUnsupportedVanguard(unit,job,members,push.objectiveHex))return true;
    const target=destination?wodAiAdvanceHex(unit,destination,members):null;
    if(!target)return false;
    unit.aiCaptureHexKey=getHexKey(destination);
    if(wodAiMoveUnitTowardHex(unit,target,false,.12))wodAiStampOrder(unit,false,target,4000);
    return true;
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

function wodAiRecoveryHarbor(unit) {
    const here=getNearestHexToPoint(unit.x,unit.y),region=here&&wodTransportLandingRegion({type:'light',owner:unit.owner},here);
    if(!region)return null;
    const hr=gameData.hexRadius||20,threats=wodAiThreats(unit.owner,false),choices=[];
    for(const city of gameData.cities.filter(c=>c.owner===unit.owner)){
        const home=wodTransportLandingRegion({type:'light',owner:unit.owner},city);if(!home||home===region)continue;
        // The port is a real dry landing with a city-connected route, not a supply source invented at sea.
        const shore=[...home].map(k=>gameData.hexes[k]).filter(h=>h&&h.owner===unit.owner&&wodCurrentSupplyComponent(h,unit.owner).city&&
            getNeighborHexes(h).some(wodIsOpenWaterHex)&&!threats.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<(e.range||50)+hr*3))
            .sort((a,b)=>Math.hypot(a.x-city.x,a.y-city.y)*2+Math.hypot(a.x-unit.x,a.y-unit.y)-Math.hypot(b.x-city.x,b.y-city.y)*2-Math.hypot(b.x-unit.x,b.y-unit.y));
        if(shore[0])choices.push({city,shore:shore[0],cost:Math.hypot(shore[0].x-unit.x,shore[0].y-unit.y)+Math.hypot(shore[0].x-city.x,shore[0].y-city.y)});
    }
    choices.sort((a,b)=>a.cost-b.cost);return choices[0]||null;
}

function wodAiRequestMedicalFerry(unit) {
    if(wodIsNavalUnit(unit))return false;
    const port=wodAiRecoveryHarbor(unit);if(!port)return false;
    unit._medicalRecovering=true;unit._medicalEvacuating=true;unit._navalEvacuating=true;unit._needsTransport=unit.type!=='marine';
    unit._navalAssaultUntil=0;unit.aiOrderUntil=0;unit._aiWithdrawal=null;unit.retreating=false;unit.holding=false;
    unit._medicalEvacHome={id:port.city.id,x:port.shore.x,y:port.shore.y};unit._navalAssaultGoal={x:port.shore.x,y:port.shore.y};
    wodAiRecord(unit.owner,'medical-evacuation',{unit:unit.uid,home:port.city.id});return true;
}

function wodAiPlanMedicalFerries(owner,transports) {
    const hr=gameData.hexRadius||20,now=wodAiOperationTime(),threats=wodAiThreats(owner,false);
    const supplyRadius=wodFortCombatAuraRadiusPx();
    for(const s of gameData.entities.filter(s=>s.owner===owner&&s.type==='supply'&&s._aiMedicalSupplyFor)){
        const patient=gameData.entities.find(u=>u.uid===s._aiMedicalSupplyFor&&u.hp>0&&u._medicalEvacuating);
        if(patient&&!wodCurrentSupplyComponent(getNearestHexToPoint(patient.x,patient.y),owner).city)s._aiMedicalSupplyUntil=now+3000;
        else{s._aiMedicalSupplyFor=null;s._aiMedicalSupplyUntil=0;}
    }
    for(const t of transports.filter(t=>t.owner===owner&&t._aiMedicalFor)){
        const patient=gameData.entities.find(u=>u.uid===t._aiMedicalFor)||t.cargo;
        if(!patient||patient.hp<=0||!patient._medicalEvacuating){t._aiMedicalFor=null;continue;}
        if(t.cargo===patient||t.pickupUid===patient.uid){
            const sea=wodAiSeaRegionFrom(owner,t),old=gameData.cities.find(c=>c.id===patient._medicalEvacHome?.id&&c.owner===owner);
            const home=old||gameData.cities.filter(c=>c.owner===owner&&wodAiLandingOnSea(owner,c,sea)&&!threats.some(e=>Math.hypot(e.x-c.x,e.y-c.y)<(e.range||50)+(gameData.hexRadius||20)*3))
                .sort((a,b)=>Math.hypot(a.x-t.x,a.y-t.y)-Math.hypot(b.x-t.x,b.y-t.y))[0];
            if(!home){
                t._aiMedicalFor=null;t._aiFleetId=null;t._aiFerryReturning=false;t.ferryGoal=null;t.unloadHexKey=null;t.unloadGoal=null;
                patient._medicalEvacuating=false;patient._medicalRecovering=false;patient._navalEvacuating=false;patient._medicalEvacHome=null;
                if(t.cargo)wodClearTransportMove(t);continue;
            }
            if(!old){patient._medicalEvacHome={id:home.id,x:home.x,y:home.y};t.unloadHexKey=null;t.unloadGoal=null;wodClearTransportMove(t);wodAiRecord(owner,'medical-ferry-rerouted',{unit:t.uid,cargo:patient.uid,home:home.id});}
            t._aiFleetId=null;t.ferryGoal={...patient._medicalEvacHome};continue;
        }
        t._aiMedicalFor=null;
    }
    const patients=gameData.entities.filter(u=>u.owner===owner&&u.hp>0&&u._medicalEvacuating&&!u.boardTransportUid)
        .sort((a,b)=>Number(!!b.isGeneral)-Number(!!a.isGeneral)||a.hp/a.maxHp-b.hp/b.maxHp);
    for(const u of patients){
        const home=gameData.cities.find(c=>c.id===u._medicalEvacHome?.id&&c.owner===owner);
        if(!home){u._medicalEvacuating=false;u._navalEvacuating=false;u._medicalEvacHome=null;wodAiRequestMedicalFerry(u);continue;}
        const here=getNearestHexToPoint(u.x,u.y),homeRegion=wodTransportLandingRegion({type:'light',owner},home);
        if(homeRegion?.has(getHexKey(here))){u._medicalEvacuating=false;u._navalEvacuating=false;u._navalLanded=false;u._needsTransport=false;u._medicalGoal=null;u._navalAssaultGoal=null;continue;}
        if(u.type==='marine'){
            // Marines can return through the water themselves. A wounded raid
            // must not purchase a landing craft merely to get home for treatment.
            u._needsTransport=false;
            const goal=u._medicalEvacHome,key=getHexKey(getNearestHexToPoint(goal.x,goal.y));
            if(!u._trafficYield&&(!u.target||u._medicalGoal!==key||(u.stuckTimer||0)>2)){
                if(assignUnitMoveAlongWaypoints(u,[{x:goal.x,y:goal.y,intoWater:true}],{transportInternal:true}))u._medicalGoal=key;
            }
            continue;
        }
        const region=wodTransportLandingRegion({type:'light',owner},here);if(!region)continue;
        const radius=wodFortCombatAuraRadiusPx(),support=gameData.entities.filter(s=>s.owner===owner&&s.type==='supply'&&s.hp>0&&!s.retreating);
        const shores=[...region].map(k=>gameData.hexes[k]).filter(h=>h&&h.type!=='mountain'&&getNeighborHexes(h).some(wodIsOpenWaterHex)&&
            (u.type==='marine'||wodCurrentSupplyComponent(h,owner).city||support.some(s=>Math.hypot(s.x-h.x,s.y-h.y)<radius*.96)));
        const risk=h=>threats.reduce((n,e)=>n+Math.max(0,(e.range||50)+hr*3-Math.hypot(e.x-h.x,e.y-h.y))**2,0);
        shores.sort((a,b)=>risk(a)*8+Math.hypot(a.x-u.x,a.y-u.y)*hr-Math.hypot(b.x-u.x,b.y-u.y)*hr-risk(b)*8);
        const pickup=shores[0];if(!pickup)continue;
        if(u.type!=='marine'&&!wodCurrentSupplyComponent(here,owner).city){
            const s=support.find(s=>Math.hypot(s.x-u.x,s.y-u.y)<supplyRadius*.9&&Math.hypot(s.x-pickup.x,s.y-pickup.y)<supplyRadius*.9);
            if(s){if(s._aiMedicalSupplyFor!==u.uid)wodClearTransportMove(s);s._aiMedicalSupplyFor=u.uid;s._aiMedicalSupplyUntil=now+3000;}
        }
        const available=transports.filter(t=>t.owner===owner&&t.hp>t.maxHp*.35&&!t.cargo&&!t.pickupUid&&!t.retreating&&!t.moraleBroken&&!t._aiMedicalFor)
            .sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y));
        let assigned=false;
        for(const t of available){
            const sea=wodNavalWaterRegionKeys(t,getNearestHexToPoint(t.x,t.y));
            const water=getNeighborHexes(pickup).filter(h=>wodIsOpenWaterHex(h)&&sea?.has(getHexKey(h)))
                .sort((a,b)=>Math.hypot(a.x-t.x,a.y-t.y)-Math.hypot(b.x-t.x,b.y-t.y))[0];
            if(!water||!wodAiLandingOnSea(owner,u._medicalEvacHome,sea))continue;
            t._aiScoutUntil=0;t._navalScoutGoal=null;t._trafficYield=null;u._trafficYield=null;
            if(!wodOrderBoardTransport(u,t))continue;
            // Reserve both ends of the same safe pickup. Ordinary fleet planning cannot steal this ferry.
            t._aiMedicalFor=u.uid;t._aiFleetId=null;t._aiFerryMission=true;t.ferryGoal={...u._medicalEvacHome};t.pickupLandKey=getHexKey(pickup);
            assignUnitMoveAlongWaypoints(u,[pickup],{transportInternal:true});
            assignUnitMoveAlongWaypoints(t,[water],{transportInternal:true});assigned=true;break;
        }
        if(!assigned&&(!u.target||u._medicalPickupKey!==getHexKey(pickup))){
            u._medicalPickupKey=getHexKey(pickup);assignUnitMoveAlongWaypoints(u,[pickup],{transportInternal:true});
        }
        u._medicalEvacCheckedAt=now;
    }
}

// A quiet coast is not a hostile front. Measure shared land approaches even
// when no enemy unit is visible, so fog cannot make an exposed hospital safe.
function wodAiHospitalPolicy(owner,army) {
    const hr=gameData.hexRadius||20,radius=wodFortCombatAuraRadiusPx(),ground=army.filter(u=>isLandArmyUnit(u)&&!u.boardTransportUid&&!u._navalEvacuating&&!isWaterHex(getNearestHexToPoint(u.x,u.y)));
    const hospitals=(gameData.hospitals||[]).filter(h=>wodEffectiveHospitalOwner(h)===owner),pending=gameData.constructionJobs.filter(j=>j.owner===owner&&j.mode==='hospital');
    const max=Math.max(1,Math.floor(ground.length/20)),setback=Math.max(4,Math.ceil(radius/(hr*1.35)));
    const fronts=gameData.hexList.filter(h=>h.owner===owner&&!isWaterHex(h)&&getNeighborHexes(h).some(n=>isClaimableLand(n)&&wodIsHostileOwner(n.owner,owner))),depth=new Map(fronts.map(h=>[getHexKey(h),0])),queue=fronts.slice();
    for(let i=0;i<queue.length;i++){
        const h=queue[i],d=depth.get(getHexKey(h));if(d>=setback)continue;
        wodSupplyNeighbors(h,n=>{const k=getHexKey(n);if(n.owner!==owner||isWaterHex(n)||depth.has(k))return;depth.set(k,d+1);queue.push(n);});
    }
    return {ground,hospitals,pending,max,setback,depth,spacing:radius*2.2,threats:wodAiThreats(owner,false)};
}

function wodAiHospitalSiteSafe(owner,h,policy,sites) {
    if(!h||wodHospitalPlacementError(h,owner,{prepaid:true})||(gameData.constructionJobs||[]).some(j=>j.q===h.q&&j.r===h.r))return false;
    if((policy.depth.get(getHexKey(h))??Infinity)<policy.setback)return false;
    if([...policy.hospitals,...policy.pending].some(s=>Math.hypot(s.x-h.x,s.y-h.y)<policy.spacing))return false;
    const radius=wodFortCombatAuraRadiusPx(),hr=gameData.hexRadius||20;
    return !sites.some(s=>Math.hypot(s.x-h.x,s.y-h.y)<radius*1.35)&&
        !policy.threats.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<Math.max(radius*1.5,(e.range||50)+hr*5))&&!!wodCurrentSupplyComponent(h,owner).city;
}

function wodAiHospitalRequest(owner,army,sites) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,radius=wodFortCombatAuraRadiusPx();
    const plans=gameData._aiEconomyPlans||=( {} ),plan=plans[owner]||=( {lastBuilding:-90,lastFort:-90} );
    if(plan.hospitalCheckAt!=null&&now-plan.hospitalCheckAt<8000)return;plan.hospitalCheckAt=now;
    if(gameData.constructionJobs.some(j=>j.owner===owner&&j.mode==='hospital')){plan.hospitalRequest=null;return;}
    const policy=wodAiHospitalPolicy(owner,army),wounded=policy.ground.filter(u=>u.hp<u.maxHp*.82||(u.manpower??u.maxManpower)<u.maxManpower*.82);
    const missing=u=>Math.max(1-u.hp/u.maxHp,1-(u.manpower??u.maxManpower)/Math.max(1,u.maxManpower));
    const distant=wounded.filter(u=>!sites.some(s=>Math.hypot(u.x-s.x,u.y-s.y)<radius*1.8));
    if(distant.length<Math.max(2,policy.hospitals.length*2+2)||distant.reduce((n,u)=>n+missing(u),0)<1.1||policy.ground.length<6||policy.hospitals.length+policy.pending.length>=policy.max){plan.hospitalRequest=null;return;}
    const threats=wodAiThreats(owner,false),points=new Map();
    for(const u of distant)for(const p of getHexesInRadius(getNearestHexToPoint(u.x,u.y).q,getNearestHexToPoint(u.x,u.y).r,6)){
        const h=gameData.hexes[p.q+','+p.r];if(wodAiHospitalSiteSafe(owner,h,policy,sites))points.set(getHexKey(h),h);
    }
    const value=h=>distant.reduce((n,u)=>n+Math.max(0,1-Math.hypot(u.x-h.x,u.y-h.y)/(radius*2))*(u.isGeneral?3:1),0)+
        army.filter(u=>!u._medicalRecovering&&Math.hypot(u.x-h.x,u.y-h.y)<radius*2).length*.12;
    const site=[...points.values()].sort((a,b)=>value(b)-value(a))[0];
    plan.hospitalRequest=site&&value(site)>=1.1?{key:getHexKey(site),at:now,cost:WOD_PRICE_HOSPITAL,value:value(site)}:null;
}

function wodAiYieldRecoverySlots(owner,army,sites) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,threats=wodAiThreats(owner,false);
    const patients=army.filter(u=>isLandArmyUnit(u)&&wodUnitMissingStrength(u)&&(u._medicalRecovering||u.hp/u.maxHp<(u.isGeneral?.72:.55)))
        .sort((a,b)=>Number(!!b.isGeneral)-Number(!!a.isGeneral)||a.hp/a.maxHp-b.hp/b.maxHp);
    for(const guard of army.filter(u=>u._aiCareYieldFor)){
        const patient=patients.find(u=>u.uid===guard._aiCareYieldFor);
        if(patient&&patient._medicalRecovering)guard._aiCareYieldUntil=now+6000;
        else{guard._aiCareYieldFor=null;guard._aiCareYieldUntil=0;}
    }
    for(const patient of patients){
        if(wodUnitHealingSite(patient))continue;
        for(const site of sites){
            if(!gameData.cities.includes(site)||Math.hypot(site.x-patient.x,site.y-patient.y)>hr*7||!wodAiCanReach(patient,site))continue;
            const cells=getCityUrbanTerrainHexes(site).filter(h=>h.owner===owner),slot=cells.find(h=>!threats.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<(e.range||50)+hr*3));
            if(!slot)continue;
            const blockers=army.filter(u=>u!==patient&&u.hp>=u.maxHp*.94&&!u._medicalRecovering&&!u._combatEngaged&&!wodIsNavalUnit(u)&&Math.hypot(u.x-slot.x,u.y-slot.y)<(u.radius||12)+(patient.radius||12)+5);
            for(const guard of blockers){
                const points=getHexesInRadius(site.q,site.r,3).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&h.owner===owner&&!isWaterHex(h)&&canUnitEnterHex(guard,h)&&
                    !cells.includes(h)&&Math.hypot(h.x-slot.x,h.y-slot.y)>(guard.radius||12)+(patient.radius||12)+7&&!isWorldPositionBlockedByUnits(guard,h.x,h.y)&&
                    !threats.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<(e.range||50)+hr*2));
                points.sort((a,b)=>Math.hypot(a.x-site.x,a.y-site.y)-Math.hypot(b.x-site.x,b.y-site.y));
                if(points[0]&&assignUnitMoveAlongWaypoints(guard,[points[0]],{transportInternal:true})){
                    guard._aiCareYieldFor=patient.uid;guard._aiCareYieldUntil=now+6000;
                    wodAiRecord(owner,'recovery-slot',{unit:guard.uid,patient:patient.uid,city:site.id});
                }
            }
        }
    }
}

// A town is both an objective and a supply source. Local disadvantage alone
// must not send its viable defenders to a rear hospital and concede the town.
// Critical patients and actual morale/manual retreats retain their escape.
function wodAiTownHoldContext(unit,job) {
    if(!unit||wodIsNavalUnit(unit)||unit.type==='convoy'||unit.boardTransportUid||unit.moraleBroken||unit._wodOrderedRetreat||
        unit.hp/unit.maxHp<(unit.isGeneral?.34:.28)||(unit.manpower??unit.maxManpower)/(unit.maxManpower||1000)<.28||
        (unit.morale??100)/(unit.maxMorale||100)<.28)return null;
    const hr=gameData.hexRadius||20,here=getNearestHexToPoint(unit.x,unit.y);
    const threats=wodAiThreats(unit.owner,false);
    if(!threats.length)return null;
    for(const city of gameData.cities){
        if(city.owner!==unit.owner||Math.hypot(unit.x-city.x,unit.y-city.y)>hr*8||job?.city&&job.city!==city)continue;
        const urban=getCityUrbanTerrainHexes(city).filter(h=>h.owner===unit.owner);
        const near=urban.some(h=>Math.hypot(h.x-unit.x,h.y-unit.y)<=hr*2.5);
        if(!near||!here||isWaterHex(here))continue;
        if(threats.some(e=>(!wodIsNavalUnit(e)||Math.hypot(e.x-unit.x,e.y-unit.y)<=(e.range||50)+(unit.range||50))&&
            urban.some(h=>Math.hypot(e.x-h.x,e.y-h.y)<=(e.range||50)+hr*3)))return{city,urban};
    }
    return null;
}
function wodAiCancelTownWithdrawal(unit) {
    const withdrawing=unit._medicalRecovering||unit._aiWithdrawal||unit._aiSupplyExit;
    if(withdrawing){wodClearTransportMove(unit);gameData._aiMoveQueue?.delete(unit);}
    unit._medicalRecovering=false;unit._medicalWaiting=false;unit._medicalGoal=null;unit._aiRecoveryGroup=null;
    unit._aiWithdrawal=null;unit._aiSupplyExit=null;unit._aiRegroupUntil=0;
    if(withdrawing){unit.retreating=false;unit.aiOrderUntil=0;}
}
function wodAiManageRecovery(owner) {
    const now=wodAiOperationTime();
    const army=gameData.entities.filter(u=>u.owner===owner&&u.hp>0&&u.type!=='convoy'&&!u.boardTransportUid);
    const radius=wodFortCombatAuraRadiusPx(),hr=gameData.hexRadius||20,threats=wodAiThreats(owner,false);
    const sites=[...(gameData.hospitals||[]).filter(h=>wodEffectiveHospitalOwner(h)===owner),...gameData.cities.filter(c=>c.owner===owner&&!isCitySiegeBlockedForProduction(c))];
    wodAiYieldRecoverySlots(owner,army,sites);
    const occupied=new Set();
    const task=gameData.aiTaskForces?.[owner],rotating=new Map();
    for(const u of army.filter(u=>u._medicalRecovering)){
        const id=u._aiRecoveryGroup||task?.unitJob[u.uid];if(id)rotating.set(id,(rotating.get(id)||0)+1);
    }
    for(const u of army){
        const hp=u.hp/u.maxHp,manpower=(u.manpower??u.maxManpower)/(u.maxManpower||1000),morale=(u.morale??100)/(u.maxMorale||100);
        const groupId=u._aiRecoveryGroup||task?.unitJob[u.uid],job=task?.jobs.find(j=>j.id===groupId);
        if(wodAiTownHoldContext(u,job)){wodAiCancelTownWithdrawal(u);continue;}
        const group=job?army.filter(a=>job.members.includes(a.uid)||a._aiRecoveryGroup===groupId):[];
        const ready=group.filter(a=>!a._medicalRecovering&&!a.retreating&&a.hp>a.maxHp*.6).length;
        const needsRotation=job&&!job.city&&!job.fort&&group.length>=3&&ready<Math.max(3,Math.ceil(group.length*.6));
        const release=u.isGeneral?.94:needsRotation?.85:.92;
        if(hp>=release&&manpower>=release&&morale>=(needsRotation?.8:.9)&&!u.moraleBroken){
            if(u._medicalRecovering){u.retreating=false;u._medicalRecovering=false;u._medicalGoal=null;u._aiRecoveryGroup=null;u.aiOrderUntil=0;wodAiRecord(owner,'recovery-return',{unit:u.uid,group:groupId,strength:Math.round(hp*100)});}
            continue;
        }
        const baitActive=u._aiAmbushBaitUntil>now&&wodAiActiveFrontOperations(owner).some(o=>o.ambush?.bait===u.uid);
        const assault=wodAiUnitAssaultBudget(u);
        const trigger=assault?(u.isGeneral?.52:.35):u.isGeneral?.72:baitActive?.45:u.veteran?.6:.55;
        if(hp>=trigger&&manpower>=trigger&&morale>=.35&&!u._medicalRecovering&&!u.moraleBroken&&!u.retreating&&!u._wodOrderedRetreat)continue;
        // Moderate wounds rotate through treatment; critical patients always
        // withdraw. Keep enough comrades together until their replacement returns.
        if(!u._medicalRecovering&&group.length>=4&&hp>=(u.isGeneral?.52:.45)&&manpower>=(u.isGeneral?.52:.45)&&morale>=.35&&!u.retreating&&!u.moraleBroken&&
            (rotating.get(groupId)||0)>=Math.max(1,Math.floor(group.length*.25))&&ready>=3&&
            (!wodAiLocalSituation(u).enemies.length||wodAiLocalSituation(u).forecast.ratio>=wodAiAttackThreshold(owner,true)))continue;
        if(u.pickupUid||u.cargo||u._navalEvacuating)continue;
        if(wodGetUnitEncirclementState(u,getNearestHexToPoint(u.x,u.y))||!wodIsNavalUnit(u)&&wodAiCorridorWithdrawal(u)&&!canHealUnit(u)){
            // Medical orders yield before a threatened supply route closes,
            // not only after the patient is already trapped.
            if(u._medicalRecovering){u._medicalRecovering=false;u.retreating=false;u._medicalGoal=null;u.aiOrderUntil=0;}
            // Critically wounded troops are excluded from ordinary assault
            // rosters. Yielding medical control without issuing an escape
            // therefore leaves nobody responsible for moving the patient.
            if(!wodIsNavalUnit(u)&&wodAiTacticalFallback(u,job)){
                u._medicalWaiting=true;wodAiObserveWork(u,'recovery-exit','supply-corridor');
            }
            continue;
        }
        let destination=null,bestCost=Infinity;
        const reach=wodIsNavalUnit(u)?wodAiOperationReach(u,true):wodAiOperationReach(u);
        for(const site of sites){
            const cells=gameData.cities.includes(site)?getCityUrbanTerrainHexes(site):getHexesInRadius(site.q,site.r,Math.max(1,Math.floor(radius/(hr*1.35)*.75))).map(p=>gameData.hexes[`${p.q},${p.r}`]);
            let choices=cells;
            if(wodIsNavalUnit(u))choices=[...new Map(cells.flatMap(h=>getHexesInHexRadius(h.q,h.r,WOD_SHIP_CITY_REPAIR_TILES).slice().map(p=>gameData.hexes[p.q+','+p.r])).filter(Boolean).map(h=>[getHexKey(h),h])).values()];
            for(const h of choices){
                if(!h||!reach.has(getHexKey(h))||occupied.has(getHexKey(h)))continue;
                if(wodIsNavalUnit(u)?!wodIsOpenWaterHex(h):isWaterHex(h)||h.owner!==owner)continue;
                if(wodIsNavalUnit(u)&&!wodUnitHealingSite({...u,x:h.x,y:h.y},h))continue;
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
        if(!destination){
            if(wodAiRequestMedicalFerry(u))continue;
            // A destroyed/contested hospital must not leave a permanent medical
            // lease on a regiment. Retry treatment next pass; allow local defense
            // and safe withdrawal while there is no reachable treatment slot.
            if(u._medicalGoal){wodClearTransportMove(u);u._medicalGoal=null;}
            u._medicalRecovering=false;u._medicalWaiting=false;u.retreating=false;u._wodOrderedRetreat=false;u.aiOrderUntil=0;
            continue;
        }
        occupied.add(getHexKey(destination));
        if(!u._medicalRecovering&&groupId){u._aiRecoveryGroup=groupId;rotating.set(groupId,(rotating.get(groupId)||0)+1);}
        u._medicalRecovering=true;u.holding=false;
        u._medicalWaiting=waiting;
        if(canHealUnit(u)){
            if(u.target&&u._medicalGoal)wodClearTransportMove(u);
            u.retreating=false;continue;
        }
        const same=u._medicalGoal===getHexKey(destination)&&u.target&&(u.stuckTimer||0)<1;
        // A reachable treatment site does not authorize a swimming shortcut.
        // Reuse the native dry/bridge route, including its incremental warmup.
        const dry=!wodIsNavalUnit(u)&&u.type!=='marine';
        const route=dry?wodAiLandRoute(u,destination):null;
        if(!same&&dry&&!route){wodAiObserveWork(u,'recovery','land-route-pending');continue;}
        if(!same&&assignUnitMoveAlongWaypoints(u,[destination],{transportInternal:true,...(dry?{preparedPath:route}:{})})){
            u.retreating=true;u._medicalGoal=getHexKey(destination);u.aiOrderUntil=0;
        }
    }
    wodAiHospitalRequest(owner,army,sites);
    const economy=gameData._aiEconomyPlans?.[owner],request=economy?.hospitalRequest;
    if(request&&wodPlayerTreasury(owner)>=WOD_PRICE_HOSPITAL+WOD_PRICE_LIGHT&&
        army.filter(u=>isLandArmyUnit(u)&&!u._medicalRecovering&&u.hp>u.maxHp*.6).length>=Math.max(4,gameData.cities.filter(c=>c.owner===owner).length*2)){
        if(economy.economyReservation&&wodPlayerTreasury(owner)-WOD_PRICE_HOSPITAL<economy.economyReservation.money)return;
        if(economy.reservation&&wodPlayerTreasury(owner)-WOD_PRICE_HOSPITAL<getUnitCost(economy.reservation.type).money)return;
        const h=gameData.hexes[request.key],policy=wodAiHospitalPolicy(owner,army);
        if(policy.hospitals.length+policy.pending.length<policy.max&&wodAiHospitalSiteSafe(owner,h,policy,sites)&&!wodHospitalPlacementError(h,owner)&&placeHospitalAtHex(h,owner)){economy.hospitalRequest=null;wodAiRecord(owner,'medical-investment',{site:request.key});}
        else economy.hospitalRequest=null;
    }

}

// Choose the troops before buying their logistics. Spare home infantry are not
// automatically passengers in a marine raid. Keep an embarked/landed wave intact.
function wodAiNavalWave(owner,goal,candidates,committed=[],pending=[]) {
    if(!goal)return [];
    const region=wodTransportLandingRegion({type:'light',owner},goal),hr=gameData.hexRadius||20,old=gameData.aiNavalPlans?.[owner];
    const fixed=new Set(committed);
    for(const u of candidates)if(u._navalLanded&&region?.has(getHexKey(getNearestHexToPoint(u.x,u.y)))||
        old?.goal?.id===goal.id&&(['crossing','landing','secure'].includes(old.phase)||old.phase==='prepare'&&old.requiredTransports>0&&wodAiOperationTime()-old.at<45000)&&old.troops?.includes(u.uid))fixed.add(u);
    const ready=candidates.filter(u=>u.hp>u.maxHp*.6&&!u.retreating&&!u.moraleBroken&&!u._medicalRecovering&&!u._navalEvacuating&&!u._combatEngaged&&
        (!(u._navalLanded||u._aiMarineRaid)||region?.has(getHexKey(getNearestHexToPoint(u.x,u.y)))));
    const marines=ready.filter(u=>u.type==='marine');
    const enemies=wodAiThreats(owner).filter(e=>!wodIsNavalUnit(e)&&region?.has(getHexKey(getNearestHexToPoint(e.x,e.y)))&&Math.hypot(e.x-goal.x,e.y-goal.y)<hr*13);
    const required=enemies.reduce((n,u)=>n+wodAiUnitCombatPower(u),0)*wodAiCommander(owner).ratio;
    const marinePower=marines.reduce((n,u)=>n+wodAiUnitCombatPower(u),0);
    const ordinary=ready.filter(u=>u.type!=='marine'&&!u.isGeneral&&!region?.has(getHexKey(getNearestHexToPoint(u.x,u.y))))
        .sort((a,b)=>wodAiUnitCombatPower(b)-wodAiUnitCombatPower(a));
    const marinePending=pending.some(j=>j.mode==='marine');
    let intents=gameData._aiNavalIntents;
    if(intents?.hexes!==gameData.hexes)intents=gameData._aiNavalIntents={hexes:gameData.hexes,owners:{}};
    const now=wodAiOperationTime(),intent=intents.owners[owner];
    const funding=pending.some(j=>['harbor','transport','supply'].includes(j.mode));
    if(intent?.goal===goal.id&&funding)intent.until=now+180000;
    const reserved=intent?.goal===goal.id&&intent.until>now?ordinary.filter(u=>intent.troops.includes(u.uid)):[];
    for(const u of reserved)fixed.add(u);
    const hasLift=gameData.entities.some(t=>t.owner===owner&&t.type==='transport'&&t.hp>t.maxHp*.35&&!t._medicalRecovering);
    const needsLift=ordinary.length>0&&(ordinary.length>=2||hasLift)&&(required>marinePower||!marines.length&&!marinePending);
    const slots=needsLift?Math.min(10,Math.max(2,Math.ceil(Math.max(0,required-marinePower)))):0;
    const passengers=reserved.length?reserved:ordinary.slice(0,slots);
    if(passengers.length&&!reserved.length)intents.owners[owner]={goal:goal.id,troops:passengers.map(u=>u.uid),until:now+180000};
    const support=passengers.length>=2?ready.filter(u=>u.isGeneral&&wodAiGeneralCanTransfer(u,[goal],gameData.entities.filter(s=>s.owner===owner&&s.type==='supply'&&s.hp>0))):[];
    return [...new Set([...fixed,...marines,...passengers,...support])].slice(0,18);
}

// One expedition budget is shared by buying, ferry assignment and beachhead
// command. Seats are sized for the selected wave, never for every waiting unit.
function wodAiExpeditionDemand(owner,cities,army,pending=[]) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    let cache=gameData._aiExpeditionBudget;if(cache?.hexes!==gameData.hexes)cache=gameData._aiExpeditionBudget={hexes:gameData.hexes,owners:{}};
    const stamp=Math.floor(now/1500)+':'+army.length+':'+pending.length+':'+cities.map(c=>c.id+Number(c.hasHarbor)+Number(c.hasFactory)).join(',');
    const prior=cache.owners[owner];if(prior?.stamp===stamp)return prior;
    const profile=wodAiCommander(owner),known=wodAiThreats(owner),ownRegions=cities.map(c=>wodTransportLandingRegion({type:'light',owner},c)).filter(Boolean);
    const coastalObjectives=wodAiNavalAssaultTargets(owner);
    const targets=coastalObjectives.filter(t=>{
        const h=getNearestHexToPoint(t.x,t.y);return h&&!ownRegions.some(r=>r.has(getHexKey(h)));
    });
    const old=gameData.aiNavalPlans?.[owner],oldGoal=old?.goal&&targets.find(t=>t.id===old.goal.id);
    targets.sort((a,b)=>Number(!!a.shore)-Number(!!b.shore)||
        Math.min(...cities.map(c=>Math.hypot(c.x-a.x,c.y-a.y)))-Math.min(...cities.map(c=>Math.hypot(c.x-b.x,c.y-b.y))));
    const goal=oldGoal||targets[0],region=goal&&wodTransportLandingRegion({type:'light',owner},goal);
    const source=cities.slice().sort((a,b)=>Number(cityHasWaterNeighbor(b)&&wodAiHarborUseful(b,owner))-Number(cityHasWaterNeighbor(a)&&wodAiHarborUseful(a,owner))||
        Number(!!b.hasHarbor)-Number(!!a.hasHarbor)||(goal?Math.hypot(a.x-goal.x,a.y-goal.y)-Math.hypot(b.x-goal.x,b.y-goal.y):0))[0];
    const embarkation=old?.rendezvous||army.find(u=>u.type==='transport'&&(u.cargo||u.pickupUid))||
        (source&&cityHasWaterNeighbor(source)?source:null)||army.find(u=>u.type==='transport')||army.find(u=>u.type==='marine')||source;
    const sea=wodAiSeaRegionFrom(owner,embarkation,goal||source),sourceRegion=source&&wodTransportLandingRegion({type:'light',owner},source);
    const localNaval=army.filter(u=>!wodIsNavalUnit(u)||sea?.has(getHexKey(getNearestHexToPoint(u.x,u.y))));
    const localPending=pending.filter(j=>!wodIsNavalType(j.mode)||cities.some(c=>c.q===j.cq&&c.r===j.cr&&wodAiCityOnSea(c,sea)));
    const localMarine=u=>sourceRegion?.has(getHexKey(getNearestHexToPoint(u.x,u.y)))||region?.has(getHexKey(getNearestHexToPoint(u.x,u.y)))||sea?.has(getHexKey(getNearestHexToPoint(u.x,u.y)));
    const passengers=army.filter(u=>u.type==='transport'&&u.cargo).map(t=>t.cargo);
    const ready=[...army,...passengers].filter(u=>(isLandArmyUnit(u)||u.type==='marine')&&u.hp>u.maxHp*.6&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&!u._navalEvacuating);
    const guards=new Set();for(const c of cities){const g=ready.filter(u=>u.type==='light'&&!guards.has(u)&&wodAiCanReach(u,c))
        .sort((a,b)=>Math.hypot(a.x-c.x,a.y-c.y)-Math.hypot(b.x-c.x,b.y-c.y))[0];if(g)guards.add(g);}
    const deployable=ready.filter(u=>!guards.has(u)&&!['defend','hold'].includes(u.aiTfKind)&&
        (u._navalLanded&&region?.has(getHexKey(getNearestHexToPoint(u.x,u.y)))||(u.type==='marine'?localMarine(u):sourceRegion?.has(getHexKey(getNearestHexToPoint(u.x,u.y))))));
    const defenders=goal?known.filter(e=>!wodIsNavalUnit(e)&&region?.has(getHexKey(getNearestHexToPoint(e.x,e.y)))&&Math.hypot(e.x-goal.x,e.y-goal.y)<hr*13):[];
    const enemyPower=defenders.reduce((n,u)=>n+wodAiUnitCombatPower(u),0),waveSize=Math.min(18,Math.max(3,Math.ceil(enemyPower*1.15)));
    const marineCount=army.filter(u=>u.type==='marine'&&localMarine(u)).length+pending.filter(j=>j.mode==='marine'&&cities.some(c=>c.q===j.cq&&c.r===j.cr&&wodAiCityOnSea(c,sea))).length;
    const pickups=localNaval.filter(t=>t.type==='transport'&&t.pickupUid).map(t=>army.find(u=>u.uid===t.pickupUid)).filter(Boolean);
    const wave=wodAiNavalWave(owner,goal,deployable,[...localNaval.filter(t=>t.cargo).map(t=>t.cargo),...pickups],localPending);
    const ordinary=wave.filter(u=>u.type!=='marine'&&!region?.has(getHexKey(getNearestHexToPoint(u.x,u.y))));
    const evac=army.filter(u=>u.type!=='marine'&&(u._medicalEvacuating||u._navalEvacuating)&&(!sea||wodAiSeaRegionFrom(owner,u,source||u)===sea));
    const coveredRegions=new Map();
    for(const u of army.filter(u=>isLandArmyUnit(u)&&u.type!=='marine'&&u._navalLanded&&!wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city)){
        const r=wodTransportLandingRegion({type:'light',owner},u);if(r){if(!coveredRegions.has(r))coveredRegions.set(r,[]);coveredRegions.get(r).push(u);}
    }
    let protectedSupply=0;
    for(const units of coveredRegions.values()){
        if(sea&&wodAiSeaRegionFrom(owner,units[0],goal||units[0])!==sea)continue;
        const clusters=[];for(const u of units)if(!clusters.some(p=>Math.hypot(p.x-u.x,p.y-u.y)<wodFortCombatAuraRadiusPx()*1.5))clusters.push(u);
        protectedSupply+=clusters.length;
    }
    const seas=wodAiSeaThreats(owner).filter(u=>sea?.has(getHexKey(getNearestHexToPoint(u.x,u.y)))&&(!goal||Math.hypot(u.x-goal.x,u.y-goal.y)<hr*30));
    const seaPower=seas.reduce((n,u)=>n+wodAiUnitCombatPower(u),0),shipPower=wodAiUnitCombatPower({type:'ship',owner,hp:300,damage:14,attackCooldown:2.4,morale:100,x:goal?.x||0,y:goal?.y||0},{type:'water'});
    const coastThreats=defenders.filter(e=>getHexesInRadius(getNearestHexToPoint(e.x,e.y).q,getNearestHexToPoint(e.x,e.y).r,5)
        .some(p=>{const h=gameData.hexes[p.q+','+p.r];return wodIsOpenWaterHex(h)&&Math.hypot(h.x-e.x,h.y-e.y)<80+hr;}));
    const canBombard=coastThreats.length>0,ourPower=wave.reduce((n,u)=>n+wodAiUnitCombatPower(u),0);
    const shipCount=localNaval.filter(u=>u.type==='ship').length+localPending.filter(j=>j.mode==='ship').length;
    const combatGap=Math.max(0,enemyPower*profile.ratio-ourPower-(canBombard?shipCount*shipPower*.8:0));
    const coast=cities.some(c=>cityHasWaterNeighbor(c)&&wodAiHarborUseful(c,owner));
    const exploring=!goal&&coast&&wodFogActive()&&gameData.hexList.some(h=>wodIsOpenWaterHex(h)&&!wodFogFactionIntel(owner).explored.has(getHexKey(h)));
    const raidGoal=!goal&&coast&&ready.length>=Math.max(8,cities.length*4)&&
        coastalObjectives.find(t=>ownRegions.some(r=>r.has(getHexKey(getNearestHexToPoint(t.x,t.y))))&&
            (t.shore||cityHasWaterNeighbor(t)));
    const plannedMarines=goal?Math.min(12,Math.max(2,Math.ceil(waveSize*.65))):raidGoal?profile.id==='amphibious'?3:2:exploring?2:0;
    // Existing marines can cross under their own orders. Lift is for the actual
    // ordinary first wave, plus a live rescue request if no free seat can serve it.
    const firstWaveSlots=goal?Math.min(10,ordinary.length):0;
    const transportCount=localNaval.filter(u=>u.type==='transport').length+localPending.filter(j=>j.mode==='transport').length;
    const freeFerries=localNaval.filter(u=>u.type==='transport'&&!u.cargo&&!u.pickupUid&&!u._medicalRecovering&&u.hp>u.maxHp*.35).length;
    const medSeats=evac.length?Math.min(2,Math.max(1,Math.ceil(evac.length/3))):0;
    let transport=goal?firstWaveSlots:0;
    if(evac.length)transport=Math.max(transport,medSeats,freeFerries?transport:localNaval.filter(t=>t.type==='transport').length+Number(!localNaval.some(t=>t.type==='transport'&&(t._aiMedicalFor||t.cargo?._navalEvacuating))));
    const newSupply=goal&&ordinary.length&&!ownRegions.some(r=>r===region)&&!coveredRegions.has(region)?1:0;
    const supply=Math.min(12,protectedSupply+newSupply);
    const fullFleet=localNaval.filter(u=>u.type==='ship').map(u=>({...u,hp:u.maxHp||300,manpower:u.maxManpower||5000,morale:u.maxMorale||100,_medicalRecovering:false,retreating:false,moraleBroken:false}));
    const activeFleet=localNaval.filter(u=>u.type==='ship'&&u.hp>u.maxHp*.45&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken);
    const repairingSoon=localNaval.some(u=>u.type==='ship'&&!activeFleet.includes(u)&&u.hp>0&&
        (u.hp>=u.maxHp*.92&&(u.manpower??u.maxManpower)>=(u.maxManpower||1000)*.92&&!u.moraleBroken||canHealUnit(u)));
    const blockaded=old?.reason==='escort'&&old.sea===sea&&seas.length&&
        (wodAiForecast(owner,fullFleet,seas).ratio<1.1||!repairingSoon&&wodAiForecast(owner,activeFleet,seas).ratio<1.1);
    let escortState=gameData._aiEscortDemand;
    if(escortState?.hexes!==gameData.hexes||escortState.plans!==gameData.aiNavalPlans)escortState=gameData._aiEscortDemand={hexes:gameData.hexes,plans:gameData.aiNavalPlans,owners:{}};
    const escortBudgets=escortState.owners[owner]||=(new Map());let escortRequest=escortBudgets.get(sea);
    if(!seas.length||old?.canSail||escortRequest?.goal!==goal?.id){escortBudgets.delete(sea);escortRequest=null;}
    if(blockaded){
        const funding=Math.max(0,getUnitCost('ship').money-wodPlayerTreasury(owner))/Math.max(1,getOwnerIncome(owner)-getOwnerExpenses(owner));
        escortRequest={goal:goal?.id,ships:Math.max(escortRequest?.ships||0,shipCount+Number(!localPending.some(j=>j.mode==='ship'))),until:now+Math.min(600000,Math.max(90000,funding*1000+30000))};
        escortBudgets.set(sea,escortRequest);
    }
    const committedEscort=escortRequest?.until>now?escortRequest.ships:0;
    const escort=Math.max(Math.ceil(seaPower*1.25/Math.max(.5,shipPower)),committedEscort);
    const bombard=canBombard?Math.min(6,Math.max(1,Math.ceil(Math.max(0,enemyPower*profile.ratio-ourPower)/Math.max(1,shipPower)))):0;
    const ship=Math.min(14,Math.max(escort,bombard,goal||exploring?1:0));
    const desired={transport,supply,ship,marine:plannedMarines};
    const essentialLift=firstWaveSlots>0&&transportCount===0,essentialSupply=newSupply>0&&localNaval.filter(u=>u.type==='supply').length+localPending.filter(j=>j.mode==='supply').length<protectedSupply+1;
    const shortages=[];
    if(committedEscort>shipCount)shortages.push('ship');
    if(evac.length&&!freeFerries&&transportCount<transport)shortages.push('transport');
    // Fund combat escorts and the fighting wave together; extra bombardment
    // ships must not consume every recruit budget while the wave lacks troops.
    if(seaPower>0&&shipCount<Math.min(escort,Math.max(1,Math.ceil(marineCount/3))))shortages.push('ship');
    if(essentialLift)shortages.push('transport');
    if(essentialSupply)shortages.push('supply');
    if(goal&&combatGap>.5){
        if(marineCount<plannedMarines)shortages.push('marine');
        if(shipCount<escort||canBombard&&shipCount<ship&&marineCount>=plannedMarines)shortages.push('ship');
        if(cities.some(c=>c.hasFactory))shortages.push('heavy','motorized');
        shortages.push('light');
        // Do not add more seats while a viable first-wave ferry already exists
        // and the force is waiting for fighting power rather than capacity.
        if(!essentialLift&&!evac.length)desired.transport=Math.min(transportCount,Math.max(1,firstWaveSlots));
    }else{
        if(marineCount<plannedMarines)shortages.push('marine');
        if(transportCount<transport)shortages.push('transport');
        if(shipCount<ship)shortages.push('ship');
    }
    const localDesired={...desired};
    for(const type of ['ship','transport','supply'])desired[type]+=army.filter(u=>u.type===type).length+pending.filter(j=>j.mode===type).length-localNaval.filter(u=>u.type===type).length-localPending.filter(j=>j.mode===type).length;
    desired.marine+=army.filter(u=>u.type==='marine').length+pending.filter(j=>j.mode==='marine').length-marineCount;
    const blocker=old&&old.goal?.id===goal?.id&&(committedEscort>shipCount?{type:'ship',reason:'escort',job:old.id}:
        old.reason==='supply'&&essentialSupply?{type:'supply',reason:'supply',job:old.id}:
        old.reason==='embark'&&transportCount<transport?{type:'transport',reason:'lift',job:old.id}:null);
    const result={stamp,goal,region,sea,sourceCity:source?.id,localDesired,wave:wave.map(u=>u.uid),desired,blocker,preferred:[...new Set(shortages)],combatGap,enemyPower,ourPower,
        firstWaveSlots,medicalSeats:medSeats,protectedSupply,canBombard,exploring,marineRaidGoal:raidGoal?.id||null,needFactory:!!goal&&!canBombard&&combatGap>2&&!cities.some(c=>c.hasFactory),
        firstLanding:prior?.goal?.id===goal?.id?prior?.firstLanding:null};
    cache.owners[owner]=result;return result;
}

function wodAiInvasionBeach(owner,goal,lead) {
    const h=getNearestHexToPoint(goal.x,goal.y),region=wodTransportLandingRegion({type:'light',owner},h);if(!region)return goal;
    const hr=gameData.hexRadius||20,known=wodAiThreats(owner),coast=[...region].map(k=>gameData.hexes[k]).filter(p=>p&&p.type!=='mountain'&&getNeighborHexes(p).some(wodIsOpenWaterHex));
    const score=p=>Math.hypot(p.x-goal.x,p.y-goal.y)*.6+Math.hypot(p.x-lead.x,p.y-lead.y)*.16+
        known.filter(e=>!wodIsNavalUnit(e)).reduce((n,e)=>n+Math.max(0,hr*7-Math.hypot(e.x-p.x,e.y-p.y))*wodAiUnitCombatPower(e)*2,0);
    coast.sort((a,b)=>score(a)-score(b));return coast[0]||goal;
}

function wodAiNavalFirePosition(ship,goal) {
    const hr=gameData.hexRadius||20,center=getNearestHexToPoint(goal.x,goal.y),sea=wodNavalWaterRegionKeys(ship,getNearestHexToPoint(ship.x,ship.y));
    if(!center||!sea)return null;
    const threats=wodAiThreats(ship.owner,false).filter(e=>Math.hypot(e.x-goal.x,e.y-goal.y)<hr*12),range=(ship.range||80)*.9;
    const points=getHexesInRadius(center.q,center.r,9).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&sea.has(getHexKey(h))&&wodIsOpenWaterHex(h)&&wodNavalDestinationClear(ship,h));
    const score=h=>{
        const targets=threats.filter(e=>Math.hypot(e.x-h.x,e.y-h.y)<range);
        const nearest=threats.length?Math.min(...threats.map(e=>Math.hypot(e.x-h.x,e.y-h.y))):Math.hypot(h.x-goal.x,h.y-goal.y);
        const incoming=threats.reduce((n,e)=>n+Math.max(0,(e.range||50)+hr*.35-Math.hypot(e.x-h.x,e.y-h.y))*wodAiUnitCombatPower(e),0);
        return Math.abs(nearest-range)*1.5+incoming*8+Math.hypot(h.x-ship.x,h.y-ship.y)*.06+
            Math.hypot(h.x-goal.x,h.y-goal.y)*.12-targets.reduce((n,e)=>n+wodAiUnitCombatPower(e),0)*hr*.4;
    };
    points.sort((a,b)=>score(a)-score(b));return points[0]||null;
}

function wodAiRetireBeachheads(owner) {
    const now=wodAiOperationTime();let cache=gameData._aiRetiredIslands;
    if(cache?.hexes!==gameData.hexes)cache=gameData._aiRetiredIslands={hexes:gameData.hexes,owners:{}};
    if(now-(cache.owners[owner]||-10000)<6000)return;cache.owners[owner]=now;
    const homes=gameData.cities.filter(c=>c.owner===owner),known=wodAiKnownCities(owner),regions=new Map();
    for(const u of gameData.entities.filter(u=>u.owner===owner&&u.hp>0&&u._navalLanded&&isLandArmyUnit(u)&&u.type!=='marine'&&!u._medicalEvacuating)){
        const region=wodTransportLandingRegion({type:'light',owner},u);if(!region)continue;
        if(!regions.has(region))regions.set(region,known.some(c=>region.has(c.q+','+c.r))||wodAiThreats(owner,false).some(e=>region.has(getHexKey(getNearestHexToPoint(e.x,e.y))))||!known.some(c=>wodIsHostileOwner(c.owner,owner)));
        if(regions.get(region))continue;
        const home=homes.slice().sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y))[0];if(!home)continue;
        u._navalEvacuating=true;u._needsTransport=true;u._navalAssaultUntil=0;u._navalAssaultGoal={x:home.x,y:home.y};
        wodAiRecord(owner,'beachhead-redeploy',{unit:u.uid,home:home.id});
    }
}

// A redeployment decision owns a specific hull until pickup and unloading.
// Healthy evacuees use the same native boarding paths as medical passengers.
function wodAiPlanEvacuationFerries(owner,transports) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,homes=gameData.cities.filter(c=>c.owner===owner);
    for(const t of transports.filter(t=>t.owner===owner&&t._aiEvacFor)){
        const u=t.cargo||gameData.entities.find(u=>u.uid===t._aiEvacFor);
        const old=homes.find(c=>c.id===t._aiEvacHomeId),sea=wodAiSeaRegionFrom(owner,t);
        const home=old||homes.filter(c=>wodAiLandingOnSea(owner,c,sea)).sort((a,b)=>Math.hypot(a.x-t.x,a.y-t.y)-Math.hypot(b.x-t.x,b.y-t.y))[0];
        if(u&&home&&!old){t._aiEvacHomeId=home.id;t.ferryGoal={x:home.x,y:home.y};t.unloadGoal=null;t.unloadHexKey=null;if(t.cargo)wodClearTransportMove(t);}
        if(!u||!u._navalEvacuating||!home){
            if(u&&!home){u._navalEvacuating=false;u._needsTransport=false;}
            t._aiEvacFor=null;
            if(t.cargo&&!home){t._aiFerryReturning=false;t._aiFleetId=null;t.ferryGoal=null;t.unloadGoal=null;t.unloadHexKey=null;wodClearTransportMove(t);}
        }
    }
    const waiting=gameData.entities.filter(u=>u.owner===owner&&u.hp>0&&u._navalEvacuating&&!u._medicalEvacuating&&!wodIsNavalUnit(u))
        .sort((a,b)=>Number(!!b.isGeneral)-Number(!!a.isGeneral)||(b.outOfSupplySeconds||0)-(a.outOfSupplySeconds||0));
    for(const u of waiting){
        if(!homes.length){u._navalEvacuating=false;u._needsTransport=false;u.boardTransportUid=null;continue;}
        const current=wodTransportLandingRegion(u,u),home=homes.filter(c=>current?.has(getHexKey(c)))[0];
        if(home){u._navalEvacuating=false;u._navalLanded=false;u._needsTransport=false;u._navalAssaultUntil=0;continue;}
        const assigned=transports.find(t=>t.owner===owner&&t.pickupUid===u.uid&&u.boardTransportUid===t.uid);
        if(assigned){
            assigned._aiEvacFor=u.uid;u._navalAssaultUntil=now+8000;
            const work=wodAiObserveWork(assigned,'evacuation-pickup');
            if(now-work.progressAt<30000)continue;
            assigned.pickupUid=null;assigned.pickupLandKey=null;assigned._aiEvacFor=null;u.boardTransportUid=null;wodClearTransportMove(assigned);wodClearTransportMove(u);
        }
        if(u._aiEvacCheckedAt!=null&&now-u._aiEvacCheckedAt<6000)continue;u._aiEvacCheckedAt=now;
        const available=transports.filter(t=>t.owner===owner&&t.hp>t.maxHp*.35&&!t.cargo&&!t.pickupUid&&!t.retreating&&!t.moraleBroken&&!t._medicalRecovering&&!t._aiMedicalFor&&!t._aiEvacFor)
            .sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y));
        let boarded=false;
        for(const t of available){
            const sea=wodAiSeaRegionFrom(owner,t),home=homes.filter(c=>wodAiLandingOnSea(owner,c,sea)).sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y))[0];
            if(!home||!wodOrderBoardTransport(u,t))continue;
            t._aiEvacFor=u.uid;t._aiEvacHomeId=home.id;t._aiFleetId=null;t._aiScoutUntil=0;t._aiFerryMission=true;t._aiFerryReturning=true;t.ferryGoal={x:home.x,y:home.y};
            u._needsTransport=true;u._navalAssaultUntil=now+8000;u._aiEvacFerry=t.uid;boarded=true;
            wodAiRecord(owner,'evacuation-assigned',{unit:u.uid,ferry:t.uid,home:home.id});break;
        }
        if(!boarded){wodAiObserveWork(u,'evacuation','no-reachable-free-ferry');wodAiRecord(owner,'evacuation-blocked',{unit:u.uid,reason:'no-reachable-free-ferry'});}
    }
}

function wodAiNavalRecon(owner,transports) {
    if(!wodFogActive())return null;
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,intel=wodFogFactionIntel(owner);
    let cache=gameData._aiNavalRecon;
    if(cache?.hexes!==gameData.hexes)cache=gameData._aiNavalRecon={hexes:gameData.hexes,owners:{}};
    const state=cache.owners[owner]||=( {history:[],blocked:{}} );
    const ships=gameData.entities.filter(u=>u.owner===owner&&u.hp>u.maxHp*.7&&!u._medicalRecovering&&!u._aiMedicalFor&&!u._aiEvacFor&&!u.retreating&&!u.moraleBroken&&!u._trafficYield&&!(u._aiSupplyEscortUntil>now));
    const knownTargets=wodAiNavalAssaultTargets(owner);
    const required=gameData.aiNavalPlans?.[owner]?.requiredEscorts||0;
    const mission=gameData.aiNavalPlans?.[owner];
    const invasionKnown=knownTargets.some(t=>!t.shore)&&!(mission?.phase==='prepare'&&mission.reason==='escort'&&!mission.canMarinesSail);
    const warships=ships.filter(u=>u.type==='ship'),ferries=ships.filter(u=>u.type==='transport'&&!u.cargo&&!u.pickupUid);
    const ferryCount=gameData.entities.filter(u=>u.owner===owner&&u.type==='transport'&&u.hp>0).length;
    const pool=[...(warships.length>required+(invasionKnown?2:0)?warships:[]),...(!knownTargets.length||!invasionKnown&&ferryCount>1?ferries:[]),
        ...ships.filter(u=>!invasionKnown&&u.type==='marine'&&!u._aiMarineRaid&&!u._navalLanded&&!u._combatEngaged&&!u.boardTransportUid)];
    const scout=pool.find(u=>u.uid===state.uid&&u.type===pool[0]?.type)||pool[0];
    if(!scout){const old=gameData.entities.find(u=>u.uid===state.uid);if(old)old._aiScoutUntil=0;return null;}
    if(state.uid!==scout.uid){const old=gameData.entities.find(u=>u.uid===state.uid);if(old){old._aiScoutUntil=0;old._navalScoutGoal=null;}state.uid=scout.uid;state.goal=null;}
    const current=getNearestHexToPoint(scout.x,scout.y);if(!current)return null;
    if(!state.bearing){
        const homes=gameData.cities.filter(c=>c.owner===owner),x=homes.reduce((n,c)=>n+c.x,0)/Math.max(1,homes.length),y=homes.reduce((n,c)=>n+c.y,0)/Math.max(1,homes.length);
        let dx=current.x-x,dy=current.y-y;if(Math.hypot(dx,dy)<hr){dx=-x||1;dy=-y;}
        const length=Math.hypot(dx,dy)||1;state.bearing={x:dx/length,y:dy/length};
    }
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
        const forward=(h.x-current.x)*state.bearing.x+(h.y-current.y)*state.bearing.y;
        choices.push({h,forward,score:Math.hypot(scout.x-h.x,scout.y-h.y)*.35+danger*5+(state.history.includes(key)?hr*40:0)-(coast?hr*3:0)-forward*.7});
    }
    if(choices.length&&choices.every(c=>c.forward<hr)&&state.turnAt!=null&&now-state.turnAt>20000){state.bearing={x:-state.bearing.y,y:state.bearing.x};state.turnAt=now;}
    state.turnAt??=now;
    choices.sort((a,b)=>a.score-b.score);
    const scoutDeadline=performance.now()+6;
    for(const {h}of choices.slice(0,12)){
        if(scout.type==='marine'&&performance.now()>scoutDeadline)break;
        let points=[{x:h.x,y:h.y,intoWater:true}];
        if(scout.type==='marine'){
            const start=isWaterHex(current)?current:wodNearestOpenWaterHex(scout,current,h,4);
            const path=start&&wodAiMarineWaterPath(owner,start,h);if(!path?.length)continue;
            points=path;
        }
        if(assignUnitMoveAlongWaypoints(scout,points,{transportInternal:true})){
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
        // The first wave may bring its commander too, provided a real land
        // cohort, town guard and supply hull are already available.
        const companions=gameData.entities.filter(u=>u!==unit&&u.owner===owner&&isLandArmyUnit(u)&&u.type!=='marine'&&!u.isGeneral&&u.hp>u.maxHp*.75&&!u.retreating&&!u._medicalRecovering&&!u.boardTransportUid&&!u._navalGarrison&&
            !gameData.aiTaskForces?.[owner]?.jobs.some(j=>(j.city||j.fort)&&j.members.includes(u.uid))&&Math.hypot(u.x-unit.x,u.y-unit.y)<hr*12&&wodAiCanReach(unit,getNearestHexToPoint(u.x,u.y)));
        const guarded=home.every(c=>gameData.entities.some(u=>u!==unit&&u.owner===owner&&u.type==='light'&&u.hp>u.maxHp*.6&&Math.hypot(u.x-c.x,u.y-c.y)<hr*4));
        const suppliedWave=companions.length>=2&&guarded&&supplyShips.some(s=>s.hp>s.maxHp*.65&&!s.retreating&&wodAiLandingOnSea(owner,target,wodAiSeaRegionFrom(owner,s)));
        if(friends.length<2&&!suppliedWave)continue;
        const foothold=friends.some(u=>{const p=getNearestHexToPoint(u.x,u.y);return p?.owner===owner&&(wodCurrentSupplyComponent(p,owner).city||supplyShips.some(s=>Math.hypot(s.x-p.x,s.y-p.y)<wodFortCombatAuraRadiusPx()*.85));});
        const foes=known.filter(e=>region.has(getHexKey(getNearestHexToPoint(e.x,e.y)))&&friends.some(u=>Math.hypot(e.x-u.x,e.y-u.y)<hr*12));
        const seaFoes=known.filter(e=>e.type==='ship'&&Math.hypot(e.x-h.x,e.y-h.y)<hr*18);
        const escorts=gameData.entities.filter(u=>u.owner===owner&&u.type==='ship'&&u.hp>u.maxHp*.65&&!u.retreating);
        const opposition=suppliedWave?known.filter(e=>!wodIsNavalUnit(e)&&region.has(getHexKey(getNearestHexToPoint(e.x,e.y)))&&Math.hypot(e.x-target.x,e.y-target.y)<hr*16):foes;
        if((foothold||suppliedWave)&&(!seaFoes.length||wodAiForecast(owner,escorts,seaFoes).ratio>=1.35)&&wodAiForecast(owner,[...friends,...(suppliedWave?companions:[]),unit],opposition).ratio>=1.3)return true;
    }
    return false;
}

// An amphibious raid chooses an actual safe sea lane, rather than comparing
// every marine with the entire hostile fleet. No hidden positions are read.
function wodAiMarineWaterPath(owner,start,end) {
    if(!start||!end)return [];
    const threats=wodAiSeaThreats(owner),hr=gameData.hexRadius||20,probe={type:'ship',owner};
    const safe=h=>wodIsOpenWaterHex(h)&&!threats.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<(e.range||80)+hr*2.5+(e._intelMemory?hr:0));
    if(!safe(start)||!safe(end))return [];
    let cache=gameData._aiMarineWaterSearch;
    const version=gameData._wodPfVer||0,signature=threats.map(e=>e.uid+':'+Math.round(e.x/hr)+','+Math.round(e.y/hr)+':'+Number(!!e._intelMemory)).sort().join('|');
    if(cache?.hexes!==gameData.hexes||cache.version!==version)cache=gameData._aiMarineWaterSearch={hexes:gameData.hexes,version,searches:new Map()};
    const id=owner+':'+getHexKey(start)+'>'+getHexKey(end)+':'+signature;
    let search=cache.searches.get(id);
    if(!search){
        search={heap:[],cost:new Map([[getHexKey(start),0]]),parent:new Map(),closed:new Set(),nodes:0};cache.searches.set(id,search);
        if(cache.searches.size>12)cache.searches.delete(cache.searches.keys().next().value);
    }
    if(search.result)return search.result;
    const {heap,cost,parent,closed}=search,deadline=performance.now()+3;
    const push=(h,g)=>{const item={h,g,f:g+Math.hypot(h.q-end.q,h.r-end.r)};let i=heap.length;heap.push(item);while(i){const p=(i-1)>>1;if(heap[p].f<=item.f)break;heap[i]=heap[p];i=p;}heap[i]=item;};
    const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1].f<heap[j].f)j++;if(heap[j].f>=last.f)break;heap[i]=heap[j];i=j;}heap[i]=last;}return first;};
    if(!heap.length&&!search.nodes)push(start,0);let nodes=0;
    while(heap.length&&nodes++<900&&search.nodes<16000){
        if((nodes&63)===0&&performance.now()>deadline)break;
        const {h,g}=pop(),key=getHexKey(h);if(closed.has(key))continue;closed.add(key);
        search.nodes++;
        if(wodHexKeysEqual(h,end)){const route=[h];let cur=h;while(parent.has(getHexKey(cur))){cur=parent.get(getHexKey(cur));route.push(cur);}return search.result=route.reverse();}
        for(const d of hexDirections){const n=gameData.hexes[(h.q+d.q)+','+(h.r+d.r)],k=n&&getHexKey(n);if(!n||closed.has(k)||!safe(n)||!wodCanStepBetweenHexes(probe,h,n,false))continue;
            const next=g+Math.hypot(d.q,d.r);if(next>=(cost.get(k)??Infinity))continue;cost.set(k,next);parent.set(k,h);push(n,next);}
    }
    if(heap.length&&search.nodes<16000){const pending=[];pending.pending=true;return pending;}
    return search.result=[];
}

// Marine flanks can return to the same continent or land on another island.
// Keep explicit sea legs so a land route cannot steal the landing.
function wodAiPlanMarineRaids(owner,marines) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    let cache=gameData._aiMarineRaids;
    if(cache?.hexes!==gameData.hexes)cache=gameData._aiMarineRaids={hexes:gameData.hexes,owners:{},checked:{},blocked:{}};
    let raid=cache.owners[owner];
    for(const u of marines)if(u._aiMarineRaid&&(!raid||!raid.ids.includes(u.uid))){
        u._aiMarineRaid=null;u._aiMarineRaidOrder=null;u._navalAssaultUntil=0;u.aiOrderUntil=0;
    }
    const eligible=u=>u.hp>u.maxHp*.6&&(!u.retreating||raid&&u._aiMarineRaidRetreat===raid.id)&&!u.moraleBroken&&!u._medicalRecovering&&!u.boardTransportUid&&!(u._aiMarineGroundUntil>now);
    if(raid){
        if(['gather','crossing'].includes(raid.phase)&&raid.ids.length<6){
            const region=wodTransportLandingRegion({type:'light',owner},raid.source),active=gameData.aiNavalPlans?.[owner];
            for(const u of marines.filter(u=>eligible(u)&&!u._combatEngaged&&!raid.ids.includes(u.uid)&&!u._navalLanded&&!(u._aiScoutUntil>now)&&Math.hypot(u.x-raid.source.x,u.y-raid.source.y)<hr*14&&
                !(active&&u._aiFleetId===active.id&&active.phase!=='complete'&&!(active.reason==='escort'&&['prepare','regroup'].includes(active.phase)))&&region?.has(getHexKey(getNearestHexToPoint(u.x,u.y))))){
                raid.ids.push(u.uid);u._aiMarineRaidOrder=null;gameData._aiMoveQueue?.delete(u);if(raid.ids.length>=6)break;
            }
        }
        const force=marines.filter(u=>raid.ids.includes(u.uid)&&eligible(u));
        for(const u of marines.filter(u=>raid.ids.includes(u.uid)&&!eligible(u))){u._aiMarineRaid=null;u._navalAssaultUntil=0;}
        // Progress belongs to one raid. A veteran joining a new operation must
        // not inherit the stalled clock of its previous crossing.
        for(const u of force)if(u._aiRaidProgress?.id!==raid.id)u._aiRaidProgress={id:raid.id,x:u.x,y:u.y,at:now};
        const travel=raid.water.reduce((n,h,i)=>i?n+Math.hypot(h.x-raid.water[i-1].x,h.y-raid.water[i-1].y):n,0);
        const speed=Math.max(1,...force.map(u=>wodUnitBaseSpeed(u)*WOD_MOVE_SPEED_FACTOR*.7));
        const routeBudget=Math.min(1200000,Math.max(300000,travel/speed*2000+120000));
        const progress=force.some(u=>u._combatEngaged||now-(u._aiRaidProgress?.at??raid.at)<45000);
        const stalled=force.length&&force.every(u=>!u._combatEngaged&&now-(u._aiRaidProgress?.at??raid.at)>90000);
        const expired=stalled||now-raid.at>routeBudget&&!progress||now-raid.at>routeBudget*3;
        const done=!force.length||expired||raid.phase==='exploit'&&force.every(u=>!u._navalLanded);
        if(done){for(const u of marines.filter(u=>raid.ids.includes(u.uid))){u._aiMarineRaid=null;u._navalAssaultUntil=0;}if(expired)wodAiRecord(owner,'marine-raid-expired',{job:raid.id,phase:raid.phase});delete cache.owners[owner];cache.checked[owner]=now;return;}
        for(const u of force){
            u._aiMarineRaid=raid.id;u._navalAssaultUntil=now+8000;
            const p=u._aiRaidProgress;
            if(!p||p.id!==raid.id||u._combatEngaged||Math.hypot(u.x-p.x,u.y-p.y)>hr*.4)u._aiRaidProgress={id:raid.id,x:u.x,y:u.y,at:now};
            else if(!u._trafficYield&&now-p.at>12000){
                // Lost marching legs and stale path targets must be retried even
                // when a raid still owns the regiment's command lease.
                if(p.retryAt==null||now-p.retryAt>12000){u._aiMarineRaidOrder=null;if(raid.landingKeys)delete raid.landingKeys[u.uid];p.retryAt=now;}
            }
        }
        const navalDanger=wodAiSeaThreats(owner).filter(e=>force.some(u=>isWaterHex(getNearestHexToPoint(u.x,u.y))&&Math.hypot(e.x-u.x,e.y-u.y)<(e.range||80)+hr*2));
        const exposed=force.filter(u=>navalDanger.some(e=>Math.hypot(e.x-u.x,e.y-u.y)<(e.range||80)+hr*6));
        if(raid.phase==='crossing'&&navalDanger.length&&wodAiForecast(owner,exposed,navalDanger).ratio<1){
            raid.phase='withdraw';wodAiRecord(owner,'marine-raid-withdraw',{job:raid.id,reason:'intercepting-fleet'});
            for(const u of force){u._aiMarineRaidOrder=null;u._navalLanded=false;}
        }
        if(raid.phase==='withdraw'){
            for(const u of force){
                if(Math.hypot(u.x-raid.source.x,u.y-raid.source.y)<hr*3&&!isWaterHex(getNearestHexToPoint(u.x,u.y))){u._aiMarineRaid=null;u._navalAssaultUntil=0;continue;}
                if(u._trafficYield||u._aiMarineRaidOrder===raid.id+'-withdraw'&&u.target)continue;
                const here=getNearestHexToPoint(u.x,u.y),start=isWaterHex(here)?here:raid.water.at(-1);
                const path=wodWaterBfsPath({type:'ship',owner},start,raid.water[0],9000);
                const next=path[1]||raid.source,skip=isWaterHex(here)&&wodSegmentClearsTerrainForUnit(u,u.x,u.y,next.x,next.y);
                if(path.length){u._aiMarineRaidRetreat=raid.id;if(assignUnitMoveAlongWaypoints(u,[...(skip?path.slice(1):path),raid.source],{transportInternal:true,forceRetreat:true}))u._aiMarineRaidOrder=raid.id+'-withdraw';}
            }
            if(force.every(u=>!u._aiMarineRaid)){delete cache.owners[owner];cache.checked[owner]=now;}
            return;
        }
        if(raid.phase==='gather'){
            const rally=raid.rally||raid.source,gathered=force.filter(u=>Math.hypot(u.x-rally.x,u.y-rally.y)<hr*6);
            const foes=wodAiThreats(owner).filter(e=>!wodIsNavalUnit(e)&&Math.hypot(e.x-raid.beach.x,e.y-raid.beach.y)<hr*8);
            const pending=gameData.constructionJobs.some(j=>j.owner===owner&&j.mode==='marine');
            const minimum=raid.minimum||((raid.town||pending||foes.length)?2:1);
            const seaClear=!wodAiSeaThreats(owner).some(e=>raid.water.some((h,i)=>i>0&&distPointToSegmentSquared(e.x,e.y,raid.water[i-1].x,raid.water[i-1].y,h.x,h.y)<Math.pow((e.range||80)+hr*2,2)));
            if(gathered.length>=minimum&&seaClear&&wodAiForecast(owner,gathered,foes).ratio>=wodAiCommander(owner).ratio){raid.phase='crossing';raid.launchedAt=now;}
            else for(const u of force)if(!u.target||u._aiMarineRaidOrder!==raid.id+'-gather'){
                gameData._aiMoveQueue?.delete(u);
                if(assignUnitMoveAlongWaypoints(u,[rally],{transportInternal:true}))u._aiMarineRaidOrder=raid.id+'-gather';
            }
        }
        // The landing quorum releases the lead wave to exploit; it must not
        // stop giving crossing orders to the remaining marines behind it.
        if(['crossing','exploit'].includes(raid.phase))for(const u of force.filter(u=>!u._navalLanded)){
            const here=getNearestHexToPoint(u.x,u.y);
            raid.landingKeys||={};
            let beach=gameData.hexes[raid.landingKeys[u.uid]];
            if(!beach){
                const others=Object.entries(raid.landingKeys).filter(([id])=>id!==u.uid).map(([,k])=>gameData.hexes[k]).filter(Boolean),region=wodTransportLandingRegion({type:'light',owner},raid.beach);
                const sites=getHexesInRadius(raid.beach.q,raid.beach.r,5).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&region?.has(getHexKey(h))&&!isWaterHex(h)&&canUnitEnterHex(u,h)&&
                    getNeighborHexes(h).some(wodIsOpenWaterHex)&&others.every(p=>Math.hypot(p.x-h.x,p.y-h.y)>(u.radius||12)*2+6)&&!isWorldPositionBlockedByUnits(u,h.x,h.y));
                sites.sort((a,b)=>Math.hypot(a.x-raid.beach.x,a.y-raid.beach.y)+Math.hypot(a.x-u.x,a.y-u.y)*.1-Math.hypot(b.x-raid.beach.x,b.y-raid.beach.y)-Math.hypot(b.x-u.x,b.y-u.y)*.1);
                beach=sites[0]||raid.beach;raid.landingKeys[u.uid]=getHexKey(beach);
            }
            if(!isWaterHex(here)&&Math.hypot(u.x-beach.x,u.y-beach.y)<hr*3){u._navalLanded=true;u._aiFleetId=raid.id;u._navalAssaultGoal=raid.town||raid.beach;continue;}
            if(u._trafficYield)continue;
            if(!u.target||u._aiMarineRaidOrder!==raid.id){
                const start=isWaterHex(here)?here:raid.water[0],probe={type:'ship',owner};
                const sea=wodNavalWaterRegionKeys(probe,raid.water.at(-1)),exit=getNeighborHexes(beach).filter(h=>sea?.has(getHexKey(h))).sort((a,b)=>Math.hypot(a.x-start.x,a.y-start.y)-Math.hypot(b.x-start.x,b.y-start.y))[0];
                const path=exit&&wodAiMarineWaterPath(owner,start,exit);
                if(path?.length){assignUnitMoveAlongWaypoints(u,[...path,beach],{transportInternal:true});u._aiMarineRaidOrder=raid.id;}
            }
        }
        if(raid.phase==='crossing'&&force.filter(u=>u._navalLanded).length>=Math.ceil(force.length*.6)){
            raid.phase='exploit';raid.landedAt=now;wodAiRecord(owner,'marine-raid-landed',{job:raid.id,troops:force.length,beach:getHexKey(raid.beach)});
        }
        return;
    }
    if(cache.checked[owner]!=null&&now-cache.checked[owner]<6000)return;
    cache.checked[owner]=now;
    const active=gameData.aiNavalPlans?.[owner];
    const free=marines.filter(u=>eligible(u)&&!u._combatEngaged&&!u._navalLanded&&!(u._aiScoutUntil>now)&&
        !(active&&u._aiFleetId===active.id&&active.phase!=='complete'&&!(active.reason==='escort'&&['prepare','regroup'].includes(active.phase))));
    if(!free.length)return;
    const coast=gameData._navalCoastCells?.hexes===gameData.hexes?gameData._navalCoastCells.cells:[];
    const lead=free.find(u=>!isWaterHex(getNearestHexToPoint(u.x,u.y)))||free[0];
    const current=getNearestHexToPoint(lead.x,lead.y);
    const staged=h=>wodIsFriendlyOwner(h.owner,owner)&&(wodCurrentSupplyComponent(h,owner).city||wodMarineHasWaterSupply(lead,h));
    const here=!isWaterHex(current)?current:coast.filter(h=>staged(h)&&Math.hypot(h.x-lead.x,h.y-lead.y)<hr*14)
        .sort((a,b)=>Math.hypot(a.x-lead.x,a.y-lead.y)-Math.hypot(b.x-lead.x,b.y-lead.y))[0];
    if(!here)return;
    const land=wodTransportLandingRegion({type:'light',owner},here),known=wodAiThreats(owner),towns=wodAiKnownCities(owner);
    if(!land)return;
    for(const town of towns.filter(c=>c.owner===owner)){
        const pressure=known.filter(e=>Math.hypot(e.x-town.x,e.y-town.y)<(e.range||50)+hr*3);if(!pressure.length)continue;
        const guards=gameData.entities.filter(u=>u.owner===owner&&isLandArmyUnit(u)&&u.hp>u.maxHp*.5&&!u._medicalRecovering&&!u.retreating&&wodAiArrivalSeconds(u,town,hr*3,12)<=12);
        if(wodAiForecast(owner,guards,pressure).ratio<1.1)return;
    }
    const source=coast.filter(h=>land.has(getHexKey(h))&&staged(h)&&
        Math.hypot(h.x-lead.x,h.y-lead.y)<hr*14).sort((a,b)=>Math.hypot(a.x-lead.x,a.y-lead.y)-Math.hypot(b.x-lead.x,b.y-lead.y))[0];
    if(!source)return;
    const entry=getNeighborHexes(source).find(wodIsOpenWaterHex),probe={type:'ship',owner},sea=entry&&wodNavalWaterRegionKeys(probe,entry);
    if(!sea||sea.size<80)return;
    if(!getHexesInRadius(entry.q,entry.r,3).some(p=>{const h=gameData.hexes[p.q+','+p.r];return h&&wodIsOpenWaterHex(h)&&getNeighborHexes(h).filter(wodIsOpenWaterHex).length>=7;}))return;
    const party=free.filter(u=>{const h=getNearestHexToPoint(u.x,u.y);return (land.has(getHexKey(h))||isWaterHex(h)&&sea.has(getHexKey(h)))&&Math.hypot(u.x-lead.x,u.y-lead.y)<hr*24;}).slice(0,6);
    if(!party.length)return;
    const explored=wodFogActive()?wodFogFactionIntel(owner).explored:null,front=wodCachedFrontlineHexes(owner);
    cache.blocked||={};const blocked=cache.blocked[owner]||={};
    const choices=coast.filter(h=>wodIsHostileOwner(h.owner,owner)&&!(blocked[getHexKey(h)]>now)&&(!explored||explored.has(getHexKey(h)))&&
        Math.hypot(h.x-source.x,h.y-source.y)>hr*10&&getNeighborHexes(h).some(n=>sea.has(getHexKey(n))));
    const score=h=>{
        const town=towns.filter(c=>wodIsHostileOwner(c.owner,owner)).reduce((d,c)=>Math.min(d,Math.hypot(c.x-h.x,c.y-h.y)),hr*20);
        const depth=front.reduce((d,f)=>Math.min(d,Math.hypot(f.x-h.x,f.y-h.y)),hr*16);
        return Math.hypot(h.x-source.x,h.y-source.y)*.35+town*.7-Math.min(hr*12,depth)*.65;
    };
    choices.sort((a,b)=>score(a)-score(b));
    const deadline=performance.now()+7;
    const spread=[];for(const h of choices)if(!spread.some(p=>Math.hypot(p.x-h.x,p.y-h.y)<hr*6)){spread.push(h);if(spread.length>=6)break;}
    for(const beach of spread){
        if(performance.now()>deadline)break;
        const foes=known.filter(e=>!wodIsNavalUnit(e)&&Math.hypot(e.x-beach.x,e.y-beach.y)<hr*8);
        if(wodAiForecast(owner,party,foes).ratio<wodAiCommander(owner).ratio)continue;
        const exit=getNeighborHexes(beach).filter(h=>sea.has(getHexKey(h))).sort((a,b)=>Math.hypot(a.x-entry.x,a.y-entry.y)-Math.hypot(b.x-entry.x,b.y-entry.y))[0];
        const water=wodAiMarineWaterPath(owner,entry,exit);if(water.length<2){if(!water.pending)blocked[getHexKey(beach)]=now+20000;continue;}
        const seaThreats=wodAiSeaThreats(owner).filter(e=>water.some((h,i)=>i>0&&
            distPointToSegmentSquared(e.x,e.y,water[i-1].x,water[i-1].y,h.x,h.y)<Math.pow((e.range||80)+hr*2,2)));
        if(seaThreats.length)continue; // Clear sea lanes before committing unsupported marines.
        const town=towns.filter(c=>wodIsHostileOwner(c.owner,owner)&&Math.hypot(c.x-beach.x,c.y-beach.y)<hr*9).sort((a,b)=>Math.hypot(a.x-beach.x,a.y-beach.y)-Math.hypot(b.x-beach.x,b.y-beach.y))[0];
        const minimum=town?Math.min(6,Math.max(2,Math.ceil(foes.reduce((n,e)=>n+wodAiUnitCombatPower(e),0)*wodAiCommander(owner).ratio)+1)):2;
        if(party.length<minimum)continue;
        const afloat=party.filter(u=>isWaterHex(getNearestHexToPoint(u.x,u.y)));
        const center=afloat.length>=Math.ceil(party.length*.7)&&getNearestHexToPoint(afloat.reduce((n,u)=>n+u.x,0)/afloat.length,afloat.reduce((n,u)=>n+u.y,0)/afloat.length);
        const rally=center&&sea.has(getHexKey(center))&&!wodAiSeaThreats(owner).some(e=>Math.hypot(e.x-center.x,e.y-center.y)<(e.range||80)+hr*2.5)?center:source;
        raid=cache.owners[owner]={id:owner+'-marine-raid-'+now,at:now,phase:'gather',source,rally,beach,water,town,minimum,ids:party.map(u=>u.uid)};
        for(const u of party){u._aiMarineRaid=raid.id;u._aiRaidProgress={id:raid.id,x:u.x,y:u.y,at:now};u._navalAssaultUntil=now+8000;u._aiMarineRaidOrder=null;gameData._aiMoveQueue?.delete(u);if(assignUnitMoveAlongWaypoints(u,[rally],{transportInternal:true}))u._aiMarineRaidOrder=raid.id+'-gather';}
        wodAiRecord(owner,'marine-raid-prepare',{job:raid.id,troops:party.length,beach:getHexKey(beach)});return;
    }
}

function wodAiNavalMovementProgress(owner,mission) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,previous=mission.assemblyProgress;
    const ids=new Set([...(mission.troops||[]),...(mission.transports||[]),...(mission.support||[]),...(mission.escorts||[])]),distances={};let moved=false;
    for(const u of gameData.entities.filter(u=>u.owner===owner&&u.hp>0&&ids.has(u.uid)&&!u.boardTransportUid)){
        const target=u._navalLanded?mission.goal:(u.type==='transport'&&u.cargo||mission.phase!=='prepare'?mission.landing:mission.rendezvous);
        if(!target)continue;const key=Math.round(target.x/hr)+','+Math.round(target.y/hr),distance=Math.hypot(u.x-target.x,u.y-target.y),old=previous?.distances?.[u.uid];
        if(old?.key===key&&distance<old.distance-hr*.5)moved=true;
        distances[u.uid]=old?.key===key&&distance>=old.distance-hr*.5?old:{key,distance};
    }
    return{at:moved?now:previous?.at??mission.at,distances};
}

function wodAiChooseNavalMission(owner, transports, candidates, targets, supplyShips) {
    gameData.aiNavalPlans ||= {};
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,old=gameData.aiNavalPlans[owner];
    let fleet=transports.filter(t=>t.owner===owner&&t.hp>0&&!t._medicalRecovering&&!t._aiMedicalFor&&!t._aiEvacFor&&!t.cargo?._navalEvacuating&&!t.retreating&&!t.moraleBroken&&!t._aiFerryReturning&&!(t._aiScoutUntil>now));
    const marineForce=candidates.filter(u=>u.type==='marine'&&!u._medicalRecovering&&!u._navalEvacuating&&!(u._aiMarineGroundUntil>now));
    if(!fleet.length&&!marineForce.length){
        if(old?.phase==='handoff'&&!gameData.entities.some(u=>u.owner===owner&&u.type==='transport'&&u.cargo)){
            wodAiRecord(owner,'naval-complete',{job:old.id,goal:old.goal?.id});delete gameData.aiNavalPlans[owner];
        }
        return null;
    }
    const embark=fleet.find(t=>t.cargo)||fleet[0]||marineForce[0],sea=wodAiSeaRegionFrom(owner,embark,old?.goal||targets[0]||embark);
    const onSea=u=>!!sea?.has(getHexKey(getNearestHexToPoint(u.x,u.y)));
    fleet=fleet.filter(onSea);
    supplyShips=supplyShips.filter(onSea);
    if(!fleet.length&&!marineForce.length)return null;
    const ships=gameData.entities.filter(u=>u.owner===owner&&u.type==='ship'&&onSea(u)&&u.hp>u.maxHp*.45&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&!(u._aiScoutUntil>now));
    const cargo=fleet.filter(t=>t.cargo).map(t=>t.cargo);
    let landed=gameData.entities.filter(u=>u.owner===owner&&u._navalLanded&&u.hp>0);
    const known=wodAiThreats(owner),naval=wodAiSeaThreats(owner).filter(onSea);
    const from=fleet[0]||marineForce[0],home=gameData.cities.filter(c=>c.owner===owner&&cityHasWaterNeighbor(c)).sort((a,b)=>
        wodAiDist2(a.x,a.y,from.x,from.y)-wodAiDist2(b.x,b.y,from.x,from.y))[0];
    let goal=old?.goal;if(goal&&!wodAiLandingOnSea(owner,goal,sea))goal=null;
    const oldRegion=goal&&wodTransportLandingRegion({type:'light',owner},getNearestHexToPoint(goal.x,goal.y));
    const actualGoal=goal&&getNearestHexToPoint(goal.x,goal.y);
    const unexplored=oldRegion&&wodFogActive()&&[...oldRegion].some(k=>!wodFogFactionIntel(owner).explored.has(k));
    const remainingTown=oldRegion&&wodAiKnownCities(owner).find(c=>oldRegion.has(`${c.q},${c.r}`)&&getCityUrbanTerrainHexes(c).some(h=>!wodIsFriendlyOwner(h.owner,owner)));
    let captured=goal&&(goal.shore||String(goal.id).startsWith('shore-'))?actualGoal&&wodIsFriendlyOwner(actualGoal.owner,owner)&&!remainingTown&&!unexplored:
        goal&&gameData.cities.some(c=>c.id===goal.id&&wodIsFriendlyOwner(c.owner,owner)&&getCityUrbanTerrainHexes(c).every(h=>wodIsFriendlyOwner(h.owner,owner)));
    if(old&&captured&&remainingTown){
        // A town is one objective of the landing, not permission to abandon
        // the rest of that island. Keep the wave and its support together.
        goal=remainingTown;captured=false;old.progressAt=now;
        wodAiRecord(owner,'naval-followthrough',{job:old.id,goal:goal.id});
    }
    if(old&&captured&&cargo.length){
        old.handoffAt??=now;
        old.phase='handoff';old.reason='finish-disembarking';old.canEmbark=false;old.canSail=true;old.checkedAt=now;
        for(const t of fleet.filter(t=>t.cargo)){t._aiFleetId=old.id;t.ferryGoal={x:goal.x,y:goal.y};if(!t.unloadHexKey||!t.target)wodOrderUnloadTransport(t,t.ferryGoal);}
        return old;
    }
    if(old&&captured&&!cargo.length){
        old.phase='complete';old.canSail=false;old.canEmbark=false;
        wodAiRecord(owner,'naval-complete',{job:old.id,goal:goal.id});
        for(const u of gameData.entities.filter(u=>u.owner===owner)){
            if(u._aiFleetId===old.id){u._aiFleetId=null;u._navalEscortUntil=0;}
            if(u._navalLanded&&oldRegion?.has(getHexKey(getNearestHexToPoint(u.x,u.y)))&&wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city){u._navalLanded=false;u._navalAssaultUntil=0;u._navalAssaultGoal=null;u._needsTransport=false;}
        }
        // A blocked last passenger can reinforce the next target. Never hold
        // every other ferry/marine on an already secured beach indefinitely.
        for(const t of fleet.filter(t=>t.cargo)){t.unloadHexKey=null;t.unloadGoal=null;t.ferryGoal=null;wodClearTransportMove(t);}
        goal=null;
    }
    if(goal&&remainingTown&&goal.shore)goal=remainingTown;
    const unfinishedTown=goal&&!goal.shore&&gameData.cities.some(c=>c.id===goal.id&&getCityUrbanTerrainHexes(c).some(h=>!wodIsFriendlyOwner(h.owner,owner)));
    // The target shortlist is sampled and can omit an existing shore. Its
    // physical ownership and sea connection determine whether it is still live.
    const stillHostile=goal&&(unfinishedTown||actualGoal&&wodIsHostileOwner(actualGoal.owner,owner)||unexplored&&landed.some(u=>oldRegion.has(getHexKey(getNearestHexToPoint(u.x,u.y)))));
    const movement=old&&wodAiNavalMovementProgress(owner,old),budget=gameData._aiEconomyPlans?.[owner]?.reservation;
    const funding=old&&now-old.at<600000&&((gameData.constructionJobs||[]).some(j=>j.owner===owner&&['harbor','transport','supply','ship','marine'].includes(j.mode))||
        budget&&['transport','supply','ship','marine'].includes(budget.type)&&now-(budget.progressAt??budget.since)*1000<30000);
    const lastProgress=Math.max(old?.progressAt??old?.at??now,movement?.at??0);
    const stalled=old&&old.phase==='prepare'&&old.reason!=='embark'&&now-lastProgress>45000&&!funding;
    if(stalled)wodAiBattlePlan(owner).failures[old.goal.id]={at:now,count:1};
    const regionLanded=landed.filter(u=>oldRegion?.has(getHexKey(getNearestHexToPoint(u.x,u.y))));
    // An already known town on a different island is not a new discovery.
    // Finish this landing before selecting the next destination.
    const continuing=old&&goal&&old.phase!=='complete'&&old.hexes===gameData.hexes&&!stalled&&stillHostile&&
        (now-old.at<180000||cargo.length||regionLanded.length||funding||now-lastProgress<45000)&&!(old.phase==='secure'&&now-lastProgress>90000);
    if(!continuing){
        const ownCities=gameData.cities.filter(c=>c.owner===owner),hostileCities=wodAiKnownCities(owner).filter(c=>wodIsHostileOwner(c.owner,owner));
        const available=targets.filter(t=>{
            if(!wodAiLandingOnSea(owner,t,sea))return false;
            const h=getNearestHexToPoint(t.x,t.y);if(!h||t.shore&&!wodIsHostileOwner(h.owner,owner))return false;
            const r=t.shore&&wodTransportLandingRegion({type:'light',owner},h);
            if(r&&ownCities.some(c=>r.has(`${c.q},${c.r}`))&&!hostileCities.some(c=>r.has(`${c.q},${c.r}`)))return false;
            return [...cargo,...candidates].some(u=>!wodTransportLandingRegion({type:'light',owner},u)?.has(getHexKey(h)));
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
    landed=gameData.entities.filter(u=>u.owner===owner&&(isLandArmyUnit(u)||u.type==='marine')&&u.hp>0&&!u.boardTransportUid&&!u._medicalRecovering&&region?.has(getHexKey(getNearestHexToPoint(u.x,u.y))));
    const foothold=landed.filter(u=>u.type==='marine'||wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city||supplyShips.some(s=>Math.hypot(s.x-u.x,s.y-u.y)<wodFortCombatAuraRadiusPx()*.85)).sort((a,b)=>Math.hypot(a.x-goal.x,a.y-goal.y)-Math.hypot(b.x-goal.x,b.y-goal.y))[0];
    const established=continuing&&old.landing&&region?.has(getHexKey(old.landing))&&getNeighborHexes(old.landing).some(wodIsOpenWaterHex)?old.landing:null;
    const landing=established||wodAiInvasionBeach(owner,goal,foothold||from);if(!landing)return null;
    const pickups=fleet.map(t=>gameData.entities.find(u=>u.uid===t.pickupUid)).filter(Boolean);
    const pool=wodAiNavalWave(owner,goal,candidates.filter(u=>!u._navalEvacuating&&(!u.isGeneral||wodAiGeneralCanTransfer(u,[goal],supplyShips))),
        [...cargo,...pickups,...landed],gameData.constructionJobs.filter(j=>j.owner===owner));
    const invaders=pool.filter(u=>u.hp>u.maxHp*.5&&!u.moraleBroken&&!u.retreating).slice(0,18);
    const groundEnemies=known.filter(e=>!wodIsNavalUnit(e)&&Math.hypot(e.x-goal.x,e.y-goal.y)<hr*10+(e.uncertainty||0)*.3);
    const seaEnemies=naval.filter(e=>Math.hypot(e.x-goal.x,e.y-goal.y)<hr*16||Math.hypot(e.x-from.x,e.y-from.y)<hr*16);
    const ordinary=invaders.some(u=>u.type!=='marine');
    const friendlyCity=region&&gameData.cities.some(c=>c.owner===owner&&region.has(`${c.q},${c.r}`));
    const requiredSupply=ordinary&&!friendlyCity?1:0;
    const requiredEscorts=seaEnemies.length?Math.min(10,Math.max(1,Math.ceil(seaEnemies.reduce((n,u)=>n+(u._intelConfidence??1),0)*1.2))):0;
    const fireSupport=ships.filter(s=>Math.hypot(s.x-goal.x,s.y-goal.y)<(s.range||80)+hr*4);
    const balance=wodAiForecast(owner,[...invaders,...fireSupport],groundEnemies),seaBalance=wodAiForecast(owner,ships,seaEnemies);
    const beachEnemies=groundEnemies.filter(e=>Math.hypot(e.x-landing.x,e.y-landing.y)<hr*7);
    const responseEnemies=groundEnemies.filter(e=>beachEnemies.includes(e)||wodAiArrivalSeconds(e,landing,e.range||50,35)<=35);
    const missionSupply=supplyShips.filter(s=>!gameData.entities.some(u=>u.owner===owner&&u.hp>0&&u._navalLanded&&u.type!=='marine'&&!wodIsNavalUnit(u)&&
        !region?.has(getHexKey(getNearestHexToPoint(u.x,u.y)))&&!wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city&&
        Math.hypot(s.x-u.x,s.y-u.y)<wodFortCombatAuraRadiusPx()&&!supplyShips.some(other=>other!==s&&Math.hypot(other.x-u.x,other.y-u.y)<wodFortCombatAuraRadiusPx()*.9)));
    const sufficientSupply=missionSupply.length>=requiredSupply;
    const sufficientSea=!seaEnemies.length||ships.length>0&&seaBalance.ratio>=1.1;
    const loaded=fleet.filter(t=>t.cargo);
    // Mission reserves are not a sailing wave. Count marines only when they
    // have actually joined a loaded ferry or reached the landing approaches.
    const waveMarines=marineForce.filter(u=>Math.hypot(u.x-landing.x,u.y-landing.y)<hr*6||
        loaded.some(t=>Math.hypot(u.x-t.x,u.y-t.y)<hr*6));
    const loadedUnits=[...loaded.map(t=>t.cargo),...landed.filter(u=>Math.hypot(u.x-landing.x,u.y-landing.y)<hr*7),...waveMarines];
    const profile=wodAiCommander(owner),groundReady=invaders.length>0&&wodAiForecast(owner,[...invaders,...fireSupport],responseEnemies).ratio>=profile.ratio;
    const independentMarines=!loaded.length&&!landed.length?marineForce:[];
    const marineClusters=independentMarines.map(lead=>independentMarines.filter(m=>Math.hypot(m.x-lead.x,m.y-lead.y)<hr*6)).sort((a,b)=>b.length-a.length);
    const marineCore=marineClusters[0]||[];
    const crossingForce=[...new Set([...loadedUnits,...marineCore])];
    const marineWave=[...new Set([...waveMarines,...marineCore,...landed.filter(u=>u.type==='marine'&&Math.hypot(u.x-landing.x,u.y-landing.y)<hr*7)])];
    const marineOnlyReady=marineWave.length>=2&&
        wodAiForecast(owner,[...marineWave,...fireSupport],groundEnemies).ratio>=profile.ratio;
    const sailingBalance=wodAiForecast(owner,[...crossingForce,...fireSupport],responseEnemies);
    const firstWaveMinimum=Math.max(2,Math.min(invaders.length,goal.shore?2:3));
    const reinforcement=landed.length>0&&!responseEnemies.length&&wodIsFriendlyOwner(landing.owner,owner)&&
        (wodCurrentSupplyComponent(landing,owner).city||missionSupply.some(s=>Math.hypot(s.x-landing.x,s.y-landing.y)<wodFortCombatAuraRadiusPx()*.9));
    const formedWave=reinforcement||crossingForce.length>=firstWaveMinimum||crossingForce.length>=2&&sailingBalance.ratio>=profile.ratio+.4;
    const waveReady=crossingForce.length>0&&formedWave&&sailingBalance.ratio>=Math.max(1.05,profile.ratio-.1);
    const launchFleet=loaded.length?loaded:fleet;
    const startX=launchFleet.length?launchFleet.reduce((n,t)=>n+t.x,0)/launchFleet.length:from.x,startY=launchFleet.length?launchFleet.reduce((n,t)=>n+t.y,0)/launchFleet.length:from.y;
    const hadCrossing=continuing&&['crossing','landing','secure'].includes(old.phase);
    // Ferries may embark from different friendly islands. A rendezvous at their
    // arithmetic midpoint can be on inaccessible land, with every loaded ferry
    // waiting forever. Support joins an actual embarkation lane or the beach.
    const joinsWave=(s,r)=>launchFleet.some(t=>Math.hypot(s.x-t.x,s.y-t.y)<r)||Math.hypot(s.x-landing.x,s.y-landing.y)<r;
    const assembled=hadCrossing||!!foothold&&(!requiredSupply||missionSupply.some(s=>Math.hypot(s.x-foothold.x,s.y-foothold.y)<wodFortCombatAuraRadiusPx()))||(!requiredSupply||missionSupply.some(s=>joinsWave(s,hr*10)))&&
        (!requiredEscorts||ships.filter(s=>joinsWave(s,hr*12)).length>=Math.min(requiredEscorts,ships.length));
    const reason=!sufficientSupply?'supply':!sufficientSea?'escort':!groundReady?'troops':!assembled?'gathering':!waveReady?'embark':null;
    let phase=hadCrossing?old.phase:'prepare';
    if(!reason)phase=landed.length?'secure':'crossing';
    if(hadCrossing&&(!sufficientSea||!sufficientSupply&&!landed.length))phase='regroup';
    const mission={id:continuing?old.id:owner+'-naval-'+getHexKey(landing)+'-'+now,owner,hexes:gameData.hexes,sea,at:continuing?old.at:now,
        checkedAt:now,goal,landing,home,phase,reason,requiredSupply,requiredEscorts,
        rendezvous:{x:(loaded[0]||fleet.find(t=>t.pickupUid)||from).x,y:(loaded[0]||fleet.find(t=>t.pickupUid)||from).y},
        requiredTransports:Math.min(10,invaders.filter(u=>u.type!=='marine'&&!landed.includes(u)).length),
        troops:invaders.map(u=>u.uid),transports:fleet.map(t=>t.uid),escorts:ships.map(u=>u.uid),firstWaveMinimum,responseEnemies:responseEnemies.length,
        support:missionSupply.map(u=>u.uid),forceRatio:balance.ratio,waveTroops:crossingForce.map(u=>u.uid),waveRatio:sailingBalance.ratio,seaRatio:seaBalance.ratio,
        canEmbark:sufficientSupply&&sufficientSea&&groundReady,canStage:true,
        canMarinesSail:sufficientSea&&marineOnlyReady,
        canSail:sufficientSupply&&sufficientSea&&waveReady&&assembled};
    const progress=landed.length+gameData.cities.filter(c=>c.owner===owner&&region?.has(`${c.q},${c.r}`)).length*10+
        (region?[...region].filter(k=>wodIsFriendlyOwner(gameData.hexes[k]?.owner,owner)).length*.01:0);
    mission.assemblyProgress=continuing?movement:wodAiNavalMovementProgress(owner,mission);
    mission.progress=progress;mission.progressAt=continuing&&old.progress===progress&&!funding?Math.max(old.progressAt??old.at,movement?.at??0):now;
    gameData.aiNavalPlans[owner]=mission;
    if(!continuing||old.phase!==phase||old.reason!==reason)wodAiRecord(owner,'naval-phase',{job:mission.id,phase,reason:reason||'ready',goal:goal.id,troops:invaders.length,loaded:loaded.length,wave:crossingForce.length,support:mission.support.length,escorts:mission.escorts.length});
    wodAiStageNavalMarines(owner,mission,marineForce,fleet,landed);
    for(const t of fleet)if(t._aiFerryMission&&(t.cargo||t.pickupUid)&&!t.cargo?._navalEvacuating){
        const newDestination=!t.ferryGoal||Math.hypot(t.ferryGoal.x-landing.x,t.ferryGoal.y-landing.y)>hr*3||t.unloadHexKey&&!region?.has(t.unloadHexKey);
        t._aiFleetId=mission.id;
        if(newDestination&&t.cargo){t.unloadHexKey=null;t.unloadGoal=null;wodClearTransportMove(t);}
        if(newDestination||!t.unloadHexKey)t.ferryGoal={x:landing.x,y:landing.y};
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

function wodAiStageNavalMarines(owner,mission,marines,fleet,landed) {
    if(!mission||!marines.length)return;
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,anchor=mission.rendezvous,used=new Set();
    const region=wodTransportLandingRegion({type:'light',owner},mission.landing);
    for(const u of marines){
        if(landed.includes(u)||region?.has(getHexKey(getNearestHexToPoint(u.x,u.y)))||u._trafficYield)continue;
        // Joining the fleet is permitted before the launch gate. Crossing to
        // enemy shores still requires the physically assembled sailing force.
        const reach=wodAiOperationReach(u),sites=getHexesInRadius(getNearestHexToPoint(anchor.x,anchor.y).q,getNearestHexToPoint(anchor.x,anchor.y).r,5)
            .map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&reach.has(getHexKey(h))&&!used.has(getHexKey(h))&&
                (wodIsFriendlyOwner(h.owner,owner)&&!isWaterHex(h)||isWaterHex(h)&&
                    (mission.requiredEscorts===0||mission.seaRatio>=1.1||getNeighborHexes(h).some(n=>!isWaterHex(n)&&wodIsFriendlyOwner(n.owner,owner))))&&
                !isWorldPositionBlockedByUnits(u,h.x,h.y));
        sites.sort((a,b)=>Math.hypot(a.x-anchor.x,a.y-anchor.y)+Math.hypot(a.x-u.x,a.y-u.y)*.08-Math.hypot(b.x-anchor.x,b.y-anchor.y)-Math.hypot(b.x-u.x,b.y-u.y)*.08);
        const site=sites[0];if(!site)continue;used.add(getHexKey(site));
        if(mission.canSail||mission.canMarinesSail)continue;
        u._navalAssaultUntil=now+8000;u._aiFleetId=mission.id;
        if(Math.hypot(u.x-site.x,u.y-site.y)>hr*1.5&&(!u.target||!u.orderTarget||Math.hypot(u.orderTarget.x-site.x,u.orderTarget.y-site.y)>hr*3))
            assignUnitMoveAlongWaypoints(u,[{x:site.x,y:site.y,intoWater:isWaterHex(site)}],{transportInternal:true});
    }
}

function wodAiFerryCanSail(transport) {
    if(transport._aiFerryReturning||!transport._aiFleetId)return true;
    const mission=wodAiMissionForVessel(transport);
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

function wodAiCorridorHoldRatio(owner,cut,defense=gameData._aiDefenseByOwner?.[owner]) {
    const hr=gameData.hexRadius||20,gates=cut.screenPoints||[cut.holdHex],known=wodAiThreats(owner);
    const threats=known.filter(e=>gates.some(p=>Math.hypot(e.x-p.x,e.y-p.y)<hr*8));
    const stamp=Math.floor(wodAiOperationTime()/900);
    if(cut._holdStamp!==stamp){
        cut._holdStamp=stamp;
        const horizon=cut.predictive?Math.min(18,Math.max(3,cut.closureSeconds||12)):10;
        const ratios=gates.flatMap(gate=>{
            const foes=threats.filter(e=>Math.hypot(e.x-gate.x,e.y-gate.y)<hr*8);
            if(!foes.length)return [];
            const help=gameData.entities.filter(u=>u.owner===owner&&!u.boardTransportUid&&!wodIsNavalUnit(u)&&u.type!=='convoy'&&
                u.hp>u.maxHp*.55&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&Math.hypot(u.x-gate.x,u.y-gate.y)<hr*12&&
                // A reserve beyond the opposite wing cannot cover both ends.
                gates.every(p=>p===gate||Math.hypot(u.x-gate.x,u.y-gate.y)<=Math.hypot(u.x-p.x,u.y-p.y)||Math.hypot(p.x-gate.x,p.y-gate.y)<(u.range||50)*1.5)&&
                // Nearby ready troops can hold a neck before the enemy
                // enters firing range. Requiring an existing corridor job
                // or an active shot recalled already protected offensives.
                (defense?.unitJob?.[u.uid]===(cut.responseId||cut.id)||Math.hypot(u.x-gate.x,u.y-gate.y)<(u.range||50)+hr*2)&&
                wodAiArrivalSeconds(u,gate,u.range||50,horizon)<=horizon);
            return [help.length?wodAiForecast(owner,help,foes).ratio:0];
        });
        cut._holdRatio=ratios.length?Math.min(...ratios):Infinity;
    }
    return cut._holdRatio;
}

function wodAiCorridorWithdrawal(unit) {
    const defense=gameData._aiDefenseByOwner?.[unit.owner];
    if(!defense||defense.hexes!==gameData.hexes)return null;
    const hr=gameData.hexRadius||20,withdrawals=gameData._aiSupplyWithdrawals||=(new WeakMap());
    let pending=withdrawals.get(unit);
    const current=defense.supplyDistance?.get(getHexKey(getNearestHexToPoint(unit.x,unit.y)));
    if(pending&&(pending.hexes!==gameData.hexes||current<=pending.safeDepth)){withdrawals.delete(unit);pending=null;}
    for(const cut of defense.corridors||[]){
        if(!cut.riskUnits?.has(unit.uid))continue;
        const gates=cut.screenPoints||[cut.holdHex],known=wodAiThreats(unit.owner);
        const threats=known.filter(e=>gates.some(p=>Math.hypot(e.x-p.x,e.y-p.y)<hr*8));
        wodAiCorridorHoldRatio(unit.owner,cut,defense);
        // A fast hypothetical closure is not a forced retreat when a real,
        // timely force can hold the neck. The defense response screens it while
        // the main attack continues; distant reserves never count as protection.
        const urgent=wodAiCorridorUrgent(cut);
        if(threats.length&&urgent&&cut._holdRatio<(cut.predictive?1.15:1.05)){
            const safeDepth=Math.max(0,Math.min(...(cut.cutHexes||[cut.holdHex]).map(h=>defense.supplyDistance?.get(getHexKey(h))??0))-2);
            withdrawals.set(unit,{hexes:gameData.hexes,cut,safeDepth});return cut;
        }
        // A shrinking endangered roster can lower the next warning's urgency
        // before the last regiment is physically through the neck. Finish its
        // established evacuation unless the threat leaves or real cover arrives.
        if(pending?.cut.id===cut.id&&(!threats.length||cut._holdRatio>=(cut.predictive?1.15:1.05))){withdrawals.delete(unit);pending=null;}
    }
    // The last tank must finish leaving even after the infantry have cleared
    // the cut and the two-unit strategic warning has disappeared.
    if(pending&&(pending.cut.screenPoints||[pending.cut.holdHex]).some(p=>wodAiThreats(unit.owner).some(e=>Math.hypot(e.x-p.x,e.y-p.y)<hr*10)))return pending.cut;
    withdrawals.delete(unit);
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
    const hr=gameData.hexRadius||20,foes=wodAiThreats(owner,false).filter(e=>isLandArmyUnit(e)||e.type==='marine');
    let cache=gameData._aiTownApproaches;
    if(cache?.hexes!==gameData.hexes)cache=gameData._aiTownApproaches={hexes:gameData.hexes,owners:{}};
    const previous=cache.owners[owner]||{},now=wodAiOperationTime(),towns=gameData.cities.filter(c=>c.owner===owner),assignments=new Map();
    // One observed regiment threatens one town approach at a time. Counting a
    // force between two towns twice split relief into two losing responses.
    for(const enemy of foes){
        const choices=towns.filter(c=>Math.hypot(enemy.x-c.x,enemy.y-c.y)<hr*14&&wodAiCanReach(enemy,c))
            .sort((a,b)=>Math.hypot(enemy.x-a.x,enemy.y-a.y)-Math.hypot(enemy.x-b.x,enemy.y-b.y));
        let city=choices[0],old=choices.find(c=>c.id===previous[enemy.uid]?.town);
        if(old&&city&&Math.hypot(enemy.x-old.x,enemy.y-old.y)<Math.hypot(enemy.x-city.x,enemy.y-city.y)+hr*2)city=old;
        if(city)assignments.set(enemy.uid,city.id);
    }
    const result=towns.flatMap(city=>{
        const enemies=foes.filter(e=>{
            if(assignments.get(e.uid)!==city.id)return false;
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
            frontOwner:enemies.slice().sort((a,b)=>enemies.filter(e=>e.owner===b.owner).length-enemies.filter(e=>e.owner===a.owner).length)[0]?.owner,enemies:enemies.length,enemyIds:enemies.map(e=>e.uid),score:850+power*25,neededPower:reinforcementPower,contactAt:now}];
    });
    // A short break in the approach detector is not a new strategic order.
    // Finish gathering the same relief force while the observed enemy remains
    // near town; release immediately after destruction or a real withdrawal.
    for(const job of gameData._aiDefenseByOwner?.[owner]?.jobs||[]){
        const recapture=job.city&&wodIsHostileOwner(job.city.owner,owner)&&wodAiKnownCities(owner).some(c=>c.id===job.city.id&&c.owner===job.city.owner);
        if(job.kind!=='counter'||job.city?.owner!==owner&&!recapture||result.some(t=>t.id===job.id)||now-(job.contactAt??-Infinity)>(recapture?30000:10000))continue;
        const contacts=foes.filter(e=>job.enemyIds.includes(e.uid)&&(recapture||assignments.get(e.uid)===job.city.id)&&Math.hypot(e.x-job.city.x,e.y-job.city.y)<hr*14);
        if(contacts.length||recapture)result.push({...job,recapture,frontOwner:recapture?job.city.owner:job.frontOwner,primaryTheater:false,enemyIds:contacts.map(e=>e.uid),enemies:contacts.length});
    }
    cache.owners[owner]=Object.fromEntries(foes.map(e=>[e.uid,{x:e.x,y:e.y,at:now,town:assignments.get(e.uid)}]));
    return result;
}

function wodAiResponseCanArrive(unit,threat,distance) {
    const hr=gameData.hexRadius||20;
    if(threat.kind==='relief')return true;
    const eta=Math.max(0,distance-hr*3)/Math.max(1,(unit.speed||WOD_UNIT_BASE_SPEED)*WOD_MOVE_SPEED_FACTOR);
    if(threat.kind==='counter'){
        const actual=threat.arrivals?.[unit.uid]??eta;
        return actual<=Math.max(45,(threat.deadline||25)+(threat.primaryTheater?15:0));
    }
    if(threat.kind==='corridor')return eta<=Math.min(75,Math.max(20,threat.closureSeconds||35)+10);
    return eta<=45;
}

// One response line and commitment for the group. Local evasive orders cannot
// keep peeling away the troops needed to clear a town's production approaches.
function wodAiIssueTownDefense(unit,job) {
    if(job.kind!=='counter')return false;
    const hr=gameData.hexRadius||20,now=wodAiOperationTime(),owner=unit.owner;
    if(job.recapture&&wodIsHostileOwner(job.city?.owner,owner)){
        const members=gameData.entities.filter(u=>job.members.includes(u.uid)&&u.hp>u.maxHp*.4&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken),foes=wodAiThreats(owner,false).filter(e=>Math.hypot(e.x-job.city.x,e.y-job.city.y)<hr*6);
        if(wodAiForecast(owner,members,foes).ratio>=1.02){const target=wodAiTownAssaultHex(unit,job.city,members);if(target&&wodAiMoveUnitTowardHex(unit,target,false,.1))wodAiStampOrder(unit,false,target,4000);return true;}
    }
    let cache=gameData._aiDefensiveManeuvers;
    if(cache?.hexes!==gameData.hexes)cache=gameData._aiDefensiveManeuvers={hexes:gameData.hexes,byId:{}};
    let state=cache.byId[job.id];
    if(!state||now-state.at>=1800){
        const army=gameData.entities.filter(u=>u.owner===owner&&u.hp>u.maxHp*.34&&!u.boardTransportUid&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&!wodIsNavalUnit(u)&&u.type!=='convoy');
        const members=army.filter(u=>job.members.includes(u.uid)||u.type==='light'&&Math.hypot(u.x-job.city.x,u.y-job.city.y)<hr*4);
        const foes=wodAiThreats(owner,false).filter(e=>job.enemyIds.includes(e.uid));
        if(!members.length||!foes.length)return false;
        const cx=members.reduce((n,u)=>n+u.x,0)/members.length,cy=members.reduce((n,u)=>n+u.y,0)/members.length;
        const ex=foes.reduce((n,u)=>n+u.x,0)/foes.length,ey=foes.reduce((n,u)=>n+u.y,0)/foes.length;
        const lead=members.find(u=>!wodCanClimb(u))||members[0],reach=wodAiOperationReach(lead);
        let anchor=state?.anchor;
        if(!anchor||anchor.owner!==owner||now-(state.anchorAt||0)>10000||foes.some(e=>Math.hypot(e.x-anchor.x,e.y-anchor.y)<hr*2)){
            const points=getHexesInRadius(job.city.q,job.city.r,6).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&h.owner===owner&&!isWaterHex(h)&&reach.has(getHexKey(h))&&canUnitEnterHex(lead,h)&&wodCurrentSupplyComponent(h,owner).city);
            const dx=ex-job.city.x,dy=ey-job.city.y,len=Math.hypot(dx,dy)||1,depth=Math.min(hr*3,len*.4);
            const intercept={x:job.city.x+dx/len*depth,y:job.city.y+dy/len*depth};
            const cityCells=getCityUrbanTerrainHexes(job.city),underAttack=foes.some(e=>cityCells.some(h=>Math.hypot(e.x-h.x,e.y-h.y)<=(e.range||50)+hr*2));
            const score=h=>Math.hypot(h.x-cx,h.y-cy)*.2+Math.hypot(h.x-intercept.x,h.y-intercept.y)*1.2+
                foes.reduce((n,e)=>n+Math.max(0,(e.range||50)+hr*2-Math.hypot(e.x-h.x,e.y-h.y))*3,0)-
                (underAttack&&cityCells.includes(h)?hr*14:0)-
                (1-getTerrainDefenseModifier(lead,h))*hr*4;
            points.sort((a,b)=>score(a)-score(b));anchor=points[0]||job.holdHex;
        }
        const balance=wodAiForecast(owner,members,foes),gathered=members.filter(u=>Math.hypot(u.x-anchor.x,u.y-anchor.y)<hr*6);
        const localBalance=wodAiForecast(owner,gathered,foes.filter(e=>Math.hypot(e.x-anchor.x,e.y-anchor.y)<hr*10));
        const close=foes.some(e=>Math.hypot(e.x-job.city.x,e.y-job.city.y)<hr*9);
        // Nearby defenders can clear a weak assault while reinforcements are
        // still marching. Distant roster members neither authorize an attack
        // nor increase the quorum required by the troops already in position.
        const attack=close&&(state?.attack?localBalance.ratio>=.88:
            localBalance.ratio>=1.08&&gathered.length>=Math.min(2,members.length));
        const fx=ex-anchor.x,fy=ey-anchor.y;
        const ordered=members.slice().sort((a,b)=>(a.x-anchor.x)*-fy+(a.y-anchor.y)*fx-((b.x-anchor.x)*-fy+(b.y-anchor.y)*fx));
        state=cache.byId[job.id]={at:now,anchor,anchorAt:anchor===state?.anchor?state.anchorAt:now,members:ordered.map(u=>u.uid),foes,ex,ey,attack,ratio:balance.ratio,localRatio:localBalance.ratio,gathered:gathered.length};
        wodAiRecord(owner,'town-response',{job:job.id,phase:attack?'counterattack':'gather',troops:members.length,ratio:Math.round(balance.ratio*100)/100});
    }
    const rank=Math.max(0,state.members.indexOf(unit.uid)),n=Math.max(1,state.members.length),columns=Math.min(5,n),laneIndex=Math.min(columns-1,Math.floor(rank*columns/n));
    const column=(5-columns)/2+laneIndex,row=rank-Math.ceil(laneIndex*n/columns);
    let target=state.anchor;
    if(state.attack){
        const foe=state.foes.slice().sort((a,b)=>Math.hypot(unit.x-a.x,unit.y-a.y)-Math.hypot(unit.x-b.x,unit.y-b.y))[0];
        if(foe){const dx=state.anchor.x-foe.x,dy=state.anchor.y-foe.y,base=Math.atan2(dy,dx),angle=base-(column-2)*.5,range=(unit.range||50)*.8;
            const stand=getNearestHexToPoint(foe.x+Math.cos(angle)*range,foe.y+Math.sin(angle)*range);
            const points=getHexesInRadius(stand.q,stand.r,2).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&!isWaterHex(h)&&canUnitEnterHex(unit,h)&&wodAiCanReach(unit,h));
            const used=state.targets||=( {} );
            const firing=points.some(h=>Math.hypot(h.x-foe.x,h.y-foe.y)<=(unit.range||50)*wodGeneralStatMultiplier(unit)*.98);
            const score=h=>(firing&&Math.hypot(h.x-foe.x,h.y-foe.y)>(unit.range||50)*wodGeneralStatMultiplier(unit)*.98?hr*100:0)+Math.hypot(h.x-stand.x,h.y-stand.y)+Math.abs(Math.hypot(h.x-foe.x,h.y-foe.y)-(unit.range||50)*.75)*2+
                getTerrainDefenseModifier(unit,h)*hr*5+
                Object.entries(used).filter(([id,p])=>id!==unit.uid&&Math.hypot(p.x-h.x,p.y-h.y)<(unit.radius||12)*2+8).length*hr*30;
            points.sort((a,b)=>score(a)-score(b));target=points[0]||stand;used[unit.uid]={x:target.x,y:target.y};
        }
    }else{
        const dx=state.ex-state.anchor.x,dy=state.ey-state.anchor.y,len=Math.hypot(dx,dy)||1,lane=(column-2)*hr*1.7;
        const slot=getNearestHexToPoint(state.anchor.x-dy/len*lane-dx/len*row*hr*2,state.anchor.y+dx/len*lane-dy/len*row*hr*2);
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
    const gates=job.screenPoints||[cut[0],cut[cut.length-1]];
    if(!job._gateAssignments){
        const members=gameData.entities.filter(u=>job.members.includes(u.uid)),foes=wodAiThreats(unit.owner);
        const needed=gates.map(g=>Math.max(1,foes.filter(e=>Math.hypot(e.x-g.x,e.y-g.y)<hr*8).reduce((n,e)=>n+wodAiUnitCombatPower(e),0)*1.2));
        const pairs=members.flatMap(u=>gates.map((g,i)=>({u,i,d:Math.hypot(u.x-g.x,u.y-g.y)}))).sort((a,b)=>a.d-b.d);
        const assigned=job._gateAssignments={};
        for(const {u,i} of pairs)if(assigned[u.uid]===undefined&&needed[i]>0){assigned[u.uid]=i;needed[i]-=wodAiUnitCombatPower(u);}
        for(const u of members)if(assigned[u.uid]===undefined)assigned[u.uid]=gates.map((g,i)=>({i,d:Math.hypot(g.x-u.x,g.y-u.y)})).sort((a,b)=>a.d-b.d)[0].i;
    }
    const gateIndex=job._gateAssignments[unit.uid]??rank%gates.length;
    const endpoint=gates[gateIndex],center=job.holdHex;
    const axis={x:cut[cut.length-1].x-cut[0].x,y:cut[cut.length-1].y-cut[0].y},length=Math.hypot(axis.x,axis.y)||1;
    const used=job._corridorTargets||=( {} ),points=[],reach=wodAiOperationReach(unit);
    for(const p of getHexesInRadius(endpoint.q,endpoint.r,4)){
        const h=gameData.hexes[p.q+','+p.r];if(!h||!reach.has(getHexKey(h))||!wodSupplyPassable(h,unit.owner)||!canUnitEnterHex(unit,h)||isWaterHex(h)&&!isBridgeHex(h))continue;
        // Guard the hostile-facing ends, leaving the middle of a wider passage
        // clear for retreating columns instead of stacking at its center.
        const inward=((h.x-endpoint.x)*axis.x+(h.y-endpoint.y)*axis.y)/length*(gateIndex?-1:1);
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
    if(cut){const hop=wodAiSupplyRetreatHop(unit,defense);if(hop)return hop;}
    const ids=(cut?.riskUnits?[...cut.riskUnits]:job?.members||local.allies.map(u=>u.uid)).slice().sort(),rank=Math.max(0,ids.indexOf(unit.uid));
    const dx=city.x-anchor.x,dy=city.y-anchor.y,len=Math.hypot(dx,dy)||1,lane=(rank%5-2)*hr*1.7;
    const slot=getNearestHexToPoint(anchor.x-dy/len*lane+dx/len*Math.floor(rank/5)*hr*2,anchor.y+dx/len*lane+dy/len*Math.floor(rank/5)*hr*2);
    return slot?.owner===owner&&!isWaterHex(slot)&&canUnitEnterHex(unit,slot)&&wodCurrentSupplyComponent(slot,owner).city&&!isWorldPositionBlockedByUnits(unit,slot.x,slot.y)&&wodAiCanReach(unit,slot)?slot:anchor;
}

function wodAiReliefReady(unit,job) {
    if(job?.kind!=='relief'||!job.holdHex||!job.innerHex||!job.members)return false;
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    if(job._reliefCheckAt==null||now-job._reliefCheckAt>=900){
        job._reliefCheckAt=now;
        const army=gameData.entities.filter(u=>job.members.includes(u.uid)&&u.hp>u.maxHp*.34&&!u.moraleBroken&&!u._medicalRecovering);
        const near=army.filter(u=>wodAiArrivalSeconds(u,job.pocketKeys?.has(getHexKey(getNearestHexToPoint(u.x,u.y)))?job.innerHex:job.holdHex,hr*2.5,18)<=18);
        const enemies=wodAiThreats(unit.owner).filter(e=>Math.hypot(e.x-job.holdHex.x,e.y-job.holdHex.y)<hr*8);
        job.breakoutBalance=wodAiForecast(unit.owner,near,enemies);
        const urgent=army.some(u=>(u.outOfSupplySeconds||0)>=4),old=job.breakoutProgress;
        if(!old||army.filter(u=>old.positions[u.uid]).length<Math.max(1,Math.ceil(army.length*.5))||army.filter(u=>old.positions[u.uid]&&Math.hypot(u.x-old.positions[u.uid].x,u.y-old.positions[u.uid].y)>hr*.35).length>=Math.max(1,Math.ceil(army.length*.5)))
            job.breakoutProgress={at:now,positions:Object.fromEntries(army.map(u=>[u.uid,{x:u.x,y:u.y}]))};
        else old.positions=Object.fromEntries(army.map(u=>[u.uid,old.positions[u.uid]||{x:u.x,y:u.y}]));
        const stalled=urgent&&now-job.breakoutProgress.at>8000;
        job.breakoutReady=army.length>0&&!stalled&&near.length>=Math.max(1,Math.ceil(army.length*.6))&&job.breakoutBalance.ratio>=(urgent?.88:1.05);
        if(job.breakoutReady){for(const u of army)u._aiReliefCommitUntil=now+4000;wodAiRecord(unit.owner,'breakout-commit',{job:job.id,troops:near.length,ratio:Math.round(job.breakoutBalance.ratio*100)/100});}
        else if(stalled){for(const u of army)u._aiReliefCommitUntil=0;wodAiRecord(unit.owner,'breakout-stalled',{job:job.id,troops:army.length});}
    }
    return !!job.breakoutReady;
}

function wodAiTacticalFallback(unit,job,issue=true) {
    if(!unit||wodIsNavalUnit(unit)||unit.type==='convoy'||unit.boardTransportUid||unit._medicalRecovering)return false;
    if(wodAiTownHoldContext(unit,job)){if(issue)wodAiCancelTownWithdrawal(unit);return false;}
    if(issue&&wodAiSupplyExit(unit,job))return true;
    const local=wodAiLocalSituation(unit),cut=wodAiCorridorWithdrawal(unit),now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    const recovering=(unit._aiRegroupUntil||0)>now&&local.enemies.length&&local.forecast.ratio<1.12;
    const operation=job?.frontOperation||job?.operationState;
    const pressure=wodAiUnitAssaultBudget(unit,job),combatFloor=pressure?(unit.isGeneral?.52:.35):.55;
    if(job?.frontOperation&&!cut&&!unit._aiWithdrawal&&unit.hp>unit.maxHp*combatFloor){
        const decision=wodAiCommandDecision(unit.owner,job.frontOperation);
        if(decision.phase==='advance'&&decision.ids.includes(unit.uid)&&
            (local.forecast.ratio>=(pressure?.55:.65)||gameData.entities.some(u=>u!==unit&&decision.ids.includes(u.uid)&&wodAiArrivalSeconds(u,unit,hr*3,8)<=8))){unit._aiRegroupUntil=0;return false;}
    }
    if(!job?.frontOperation&&!cut&&!unit._aiWithdrawal&&unit.hp>unit.maxHp*combatFloor&&operation&&
        (operation.phase==='advance'&&operation.mode==='breakthrough'||operation.stage==='attack')&&!job.route){
        if(operation.commitCheckAt==null||now-operation.commitCheckAt>=900){
            operation.commitCheckAt=now;
            const ids=job.frontOperation?.members||job.members,goal=operation.advanceGoal||operation.goal||job.objectiveCity||job.objectiveHex||job.attackHex;
            const roster=gameData.entities.filter(u=>ids?.includes(u.uid)&&u.hp>u.maxHp*combatFloor&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&!u.boardTransportUid);
            const lead=roster.slice().sort((a,b)=>roster.filter(u=>Math.hypot(u.x-b.x,u.y-b.y)<hr*6).length-roster.filter(u=>Math.hypot(u.x-a.x,u.y-a.y)<hr*6).length)[0];
            const foes=lead?wodAiThreats(unit.owner).filter(e=>Math.hypot(e.x-lead.x,e.y-lead.y)<hr*10):[];
            const core=lead?roster.filter(u=>Math.hypot(u.x-lead.x,u.y-lead.y)<hr*9&&wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),unit.owner).city&&
                (!foes.length||foes.some(e=>wodAiArrivalSeconds(u,e,u.range||50,12)<=12))):[];
            operation.commitCore=core.map(u=>u.uid);operation.commitRatio=wodAiForecast(unit.owner,core,foes).ratio;
        }
        // Keep a viable advancing cohort together. A genuinely isolated leader
        // still waits at the vanguard cohesion gate; severe local danger and
        // corridor warnings always retain their withdrawal authority.
        if(operation.commitCore?.length>=3&&operation.commitCore.includes(unit.uid)&&
            operation.commitRatio>=(pressure?.policy.continue??wodAiAttackThreshold(unit.owner,true))&&local.forecast.ratio>=(pressure?.55:.65)){unit._aiRegroupUntil=0;return false;}
    }
    if(job?.kind==='relief'){
        wodAiReliefReady(unit,job);
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
    // Finish a purposeful withdrawal to safe ground. The old eight-second
    // timer could expire halfway there as contact left sight, causing the same
    // regiment to turn back into the enemy and flee again. Real supply cuts
    // and a newly superior local force can still interrupt the withdrawal.
    const withdrawal=unit._aiWithdrawal,goal=withdrawal?.goal&&gameData.hexes[withdrawal.goal];
    const route=unit._trafficYield?.points?.at(-1)||unit.orderTarget||unit.target?.finalTarget||unit.target;
    const queued=gameData._aiMoveQueue?.get(unit),sameGoal=p=>goal&&p&&Math.hypot(p.x-goal.x,p.y-goal.y)<hr*1.5;
    const followingWithdrawal=sameGoal(route)||sameGoal(queued);
    const finishWithdrawal=!cut&&unit._aiRegroupUntil>now&&goal&&
        wodIsFriendlyOwner(goal.owner,unit.owner)&&wodCurrentSupplyComponent(goal,unit.owner).city&&
        Math.hypot(goal.x-unit.x,goal.y-unit.y)>hr*1.5&&(!local.enemies.length||local.forecast.ratio<1.35);
    if(finishWithdrawal&&followingWithdrawal)return true;
    if(!local.retreat&&!cut&&!recovering&&!finishWithdrawal){unit._aiRegroupUntil=0;unit._aiWithdrawal=null;return false;}
    if(!issue)return true;
    if(unit.target&&unit._aiWithdrawal&&(!goal||followingWithdrawal)&&(!cut||unit._aiWithdrawal.cutId===cut.id)&&now-unit._aiWithdrawal.at<7000&&
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
    candidates.sort((a,b)=>b.score-a.score);const safe=finishWithdrawal?goal:wodAiSharedFallbackHex(unit,job,local,cut,defense)||cut&&wodAiSupplyRetreatHop(unit,defense)||candidates[0]?.h;
    if(!safe)return false;
    const travel=Math.hypot(safe.x-unit.x,safe.y-unit.y)/Math.max(1,unit.speed*WOD_MOVE_SPEED_FACTOR);
    unit._aiRegroupUntil=now+Math.min(30000,Math.max(8000,travel*1300));unit._aiFallbackAt=now;unit.aiCaptureHexKey=null;
    const moved=wodAiMoveUnitTowardHex(unit,safe,true,.08);
    if(moved){unit._aiWithdrawal={at:now,x:unit.x,y:unit.y,goal:getHexKey(safe),cutId:cut?.id||null};wodAiStampOrder(unit,true,safe,Math.max(7000,unit._aiRegroupUntil-now));unit.aiOrderPhase='regroup';wodAiRecord(unit.owner,'withdraw',{unit:unit.uid,reason:cut?'supply-corridor':'local-disadvantage',ratio:Math.round(local.forecast.ratio*100)/100});}
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
                    if(!pass(next)){closed=!!next&&wodIsFriendlyOwner(next.owner,owner);break;}
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

function wodAiKnownStructures(owner) {
    const hospitals=wodFogActive()?[...(wodFogFactionIntel(owner).hospitals?.values()||[])]:gameData.hospitals||[];
    return [...wodAiKnownForts(owner).map(s=>({...s,kind:'fort'})),...hospitals.map(s=>({...s,kind:'hospital'}))]
        .filter(s=>wodIsHostileOwner(s.owner,owner));
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

// Give each regiment a reachable slot, including during approach. Sending the
// whole operation to one exact anchor can prevent its own assembly quorum.
// A front is a shared operation, not independent small jobs each counting the
// entire opposing army. Base allocations remain available for real emergencies;
// routine contact responses cannot recall a committed offensive every pulse.
function wodAiCorridorUrgent(cut) {
    if(!cut)return false;
    if(!cut.predictive)return true;
    const risk=cut.atRisk??cut.riskUnits?.size??cut.troops??0;
    return risk>=1&&(risk>=2||cut.closureSeconds<=12)&&Number.isFinite(cut.closureSeconds)&&cut.closureSeconds<=Math.max(12,(cut.withdrawSeconds||20)*1.1+5)&&
        (risk>=4||cut.closureSeconds<=35)&&!(cut._holdRatio>=1.15);
}
function wodAiFrontCritical(response) {
    if(!response)return false;
    if(response.kind==='counter'||response.kind==='relief')return true;
    if(response.kind==='corridor'){
        const owner=response.owner||response.holdHex?.owner;
        const warning=gameData._aiDefenseByOwner?.[owner]?.corridors?.find(c=>c.id===response.id||c.responseId===response.id);
        if(warning)wodAiCorridorHoldRatio(owner,warning);
        return wodAiCorridorUrgent(warning||response);
    }
    // Territorial coverage still receives a screen; only nearby town danger
    // can commandeer an already committed assault force.
    if(response.kind==='territory'&&response.coverageRequired){
        const owner=response.owner||response.holdHex?.owner,point=response.contactPoint||response.holdHex;
        return point&&gameData.cities.some(c=>c.owner===owner&&Math.hypot(c.x-point.x,c.y-point.y)<(gameData.hexRadius||20)*6);
    }
    return false;
}

function wodAiActiveFrontOperations(owner) {
    const now=wodAiOperationTime();
    return [...new Set(Object.entries(gameData._aiFrontOffensives||{}).filter(([key])=>key===String(owner)||key.startsWith(owner+':')).map(([,op])=>op))]
        .filter(op=>op?.hexes===gameData.hexes&&op.until>now);
}

// Membership survives a medical rotation or a loan to a different front.
// Casualties and permanent town/fort garrison transfers free a squad slot.
function wodAiSquadRoster(owner,op) {
    const alive=new Map(gameData.entities.flatMap(u=>u.cargo?[u,u.cargo]:[u]).filter(u=>u.owner===owner&&u.hp>0).map(u=>[u.uid,u]));
    const guards=new Set((gameData.aiTaskForces?.[owner]?.jobs||[]).filter(j=>j.city||j.fort).flatMap(j=>j.members));
    op.members=op.members.filter(id=>alive.has(id)&&!guards.has(id));
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

// One cached verdict authorizes the entire operation. Strength includes only
// available squad members who can reach the actual contact in time. Guards,
// patients, emergency loans and troops across an impassable river never count.
function wodAiCommandDecision(owner,op) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,joint=op.joint;
    const host=joint&&joint.until>now?joint:op;
    if(host.commandDecision&&now-host.commandDecision.at<1000)return host.commandDecision;
    const ops=host===op?[op]:wodAiActiveFrontOperations(owner).filter(o=>o.joint===host&&host.squads.includes(o.id));
    const roster=[...new Map(ops.flatMap(o=>wodAiSquadAvailable(owner,o)).map(u=>[u.uid,u])).values()];
    const lead=roster.slice().sort((a,b)=>roster.filter(u=>Math.hypot(u.x-b.x,u.y-b.y)<hr*7).length-roster.filter(u=>Math.hypot(u.x-a.x,u.y-a.y)<hr*7).length)[0];
    const aim=host.contact||op.advanceGoal||op.goal,anchor=host.anchor||op.anchor;
    const known=wodAiThreats(owner).filter(e=>!wodIsNavalUnit(e)&&e.type!=='convoy'&&(!op.frontOwner||e.owner===op.frontOwner));
    // Troops on an unreachable opposite bank must not freeze this land front.
    // Contacts able to fire across the gap still count as immediate opposition.
    const close=lead?known.filter(e=>Math.hypot(e.x-lead.x,e.y-lead.y)<hr*12&&
        (Math.hypot(e.x-lead.x,e.y-lead.y)<Math.max(e.range||50,lead.range||50)+hr||wodAiCanReach(lead,getNearestHexToPoint(e.x,e.y))))
        .sort((a,b)=>Math.hypot(a.x-lead.x,a.y-lead.y)-Math.hypot(b.x-lead.x,b.y-lead.y)):[];
    const point=close[0]||aim;
    const arrivals=roster.map(u=>({u,eta:wodAiArrivalSeconds(u,point,u.range||50,24)}));
    const fighting=arrivals.filter(a=>a.eta<=24).map(a=>a.u);
    const foes=close.filter(e=>e._intelMemory?Math.hypot(e.x-point.x,e.y-point.y)<hr*6:wodAiArrivalSeconds(e,point,e.range||50,18)<=18);
    const ids=new Set(roster.map(u=>u.uid));
    const allies=foes.length?gameData.entities.filter(u=>u.owner===owner&&!ids.has(u.uid)&&isLandArmyUnit(u)&&u.hp>u.maxHp*.45&&!u.boardTransportUid&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&
        (u._combatEngaged&&foes.some(e=>u.combatTargetUid===e.uid||e.combatTargetUid===u.uid)||
            u.target&&u.orderTarget&&Math.hypot(u.orderTarget.x-point.x,u.orderTarget.y-point.y)<hr*5&&
            Math.hypot(u.orderTarget.x-point.x,u.orderTarget.y-point.y)<Math.hypot(u.x-point.x,u.y-point.y)-hr&&
            !wodAiFrontCritical(gameData._aiDefenseByOwner?.[owner]?.jobs.find(j=>j.id===gameData._aiDefenseByOwner[owner].unitJob[u.uid])))&&
        wodAiArrivalSeconds(u,point,u.range||50,8)<=8):[];
    const forecast=wodAiForecast(owner,foes.length?[...fighting,...allies]:roster,foes),launched=!!host.launchedAt||ops.some(o=>o.phase==='advance');
    const staging=new Map(ops.flatMap(o=>o.members.map(id=>[id,o.anchor||anchor])));
    const assembled=roster.filter(u=>{const at=staging.get(u.uid)||anchor;return Math.hypot(u.x-at.x,u.y-at.y)<hr*9||u._combatEngaged||wodAiArrivalSeconds(u,at,hr*5,10)<=10;});
    const quorum=Math.max(3,Math.ceil(roster.length*.65));
    const imminent=foes.some(e=>roster.some(u=>Math.hypot(e.x-u.x,e.y-u.y)<(e.range||50)+hr*3&&wodAiArrivalSeconds(e,u,e.range||50,6)<=6));
    // The contact ETA authorizes fighting, not the preceding approach. A
    // coherent, supplied superior cohort can close the distance in bounds;
    // isolated leaders and distant reinforcements cannot authorize a charge.
    const cohort=foes.length&&lead?roster.filter(u=>Math.hypot(u.x-lead.x,u.y-lead.y)<hr*7&&
        wodAiCanReach(u,getNearestHexToPoint(point.x,point.y))&&wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city):[];
    const objective=op.strategicGoal||op.goal||aim,policy=wodAiObjectiveRisk(owner,objective,op);
    let budget=wodAiUpdateAssaultBudget(owner,host,roster,objective,foes);
    const projected=wodAiForecast(owner,cohort,foes),required=launched?policy.continue:policy.launch;
    const leadSupport=imminent&&lead?cohort.filter(u=>wodAiArrivalSeconds(u,lead,hr*3,8)<=8).length:0;
    const approach=foes.length>0&&cohort.length>=3&&projected.ratio>=required&&(!imminent||leadSupport>=3&&projected.ratio>=required+.1);
    const flanking=ops.some(o=>o.jobs.some(j=>j.route&&!j.closed&&now-(j.boundAt??o.launchedAt??o.at)<30000));
    const maneuver=foes.length>0&&flanking&&fighting.length>=3&&forecast.ratio>=.95&&wodAiForecast(owner,roster,foes).ratio>=required;
    const contactQuorum=foes.length<=2?2:3;
    const frontageWing=wodAiFrontageWingReady(owner,op,roster,known);
    const frontagePin=wodAiFrontagePinReady(owner,op,roster,known);
    const finishing=wodAiCanFinishAssault(owner,op,roster);
    const committed=budget?.active&&cohort.length>=3&&fighting.length>=contactQuorum&&forecast.ratio>=policy.continue&&projected.ratio>=policy.continue;
    const enough=finishing||roster.length>=3&&(!foes.length||fighting.length>=contactQuorum&&fighting.length+allies.length>=3&&forecast.ratio>=required||approach||maneuver||frontageWing||frontagePin||committed);
    const hostilePressure=!frontageWing&&!frontagePin&&imminent&&forecast.ratio<(budget?.active?Math.max(.62,policy.continue-.12):.72);
    if(enough)host.commandWeakSince=null;else host.commandWeakSince??=now;
    let phase=enough&&(launched||assembled.length>=quorum)?'advance':'gather';
    if(phase==='gather'&&lead&&(launched||now-op.at>12000)){
        const rally=wodAiCohortAnchor(owner,roster,aim);
        if(rally)for(const squad of ops)if(!squad.ambush&&Math.hypot(rally.x-squad.anchor.x,rally.y-squad.anchor.y)>hr*5){squad.anchor=rally;for(const j of squad.jobs||[])if(!j.route)j.holdHex=rally;}
    }
    if(host.commandDecision?.phase==='advance'&&roster.length>=3&&!hostilePressure&&
        forecast.ratio>=.85&&(!foes.length||projected.ratio>=.95||maneuver)&&now-host.commandWeakSince<12000)phase='advance';
    if(hostilePressure&&now-host.commandWeakSince>=5000)phase='recover';
    if(host.commandDecision?.phase==='recover'&&!enough&&imminent)phase='recover';
    const fullRoster=[...new Map(ops.flatMap(o=>wodAiSquadRoster(owner,o)).map(u=>[u.uid,u])).values()];
    const withdrawing=fullRoster.filter(u=>wodAiCorridorWithdrawal(u));
    const supplyRecovery=withdrawing.length>=Math.max(2,Math.ceil(fullRoster.length*.3))||withdrawing.some(u=>u.isGeneral);
    if(supplyRecovery)phase='recover';
    if(phase==='advance'&&!hostilePressure&&!supplyRecovery)budget=wodAiUpdateAssaultBudget(owner,host,roster,objective,foes,true);
    if(phase!=='advance'&&budget)budget.active=false;
    const decision={at:now,phase,reason:supplyRecovery?'corridor-cohort-withdrawal':phase==='recover'?'outmatched-contact':finishing?'finish-costly-objective':roster.length<3?'awaiting-return-or-recruits':!enough?'awaiting-combat-strength':phase==='gather'?'rendezvous':committed?'committed-objective':frontagePin?'supported-front-line':approach?'supported-approach':maneuver?'supported-flank':'authorized',ratio:forecast.ratio,frontagePin,approach,casualtyCommitment:!!budget?.active,projectedRatio:projected.ratio,ids:roster.map(u=>u.uid),arrivals:arrivals.filter(a=>a.eta<=24).map(a=>({uid:a.u.uid,seconds:Math.round(a.eta*10)/10})),enemy:foes.length,point};
    const changed=host.commandDecision?.phase!==phase;host.commandDecision=decision;if(phase==='advance')host.launchedAt??=now;
    for(const squad of ops){
        if(squad.phase==='consolidate'||squad.ambush)continue;
        squad.phase=phase;if(phase==='advance')squad.launchedAt??=now;
        squad.until=Math.max(squad.until,now+45000);
    }
    if(changed)wodAiRecord(owner,'command-decision',{job:host.id,phase,reason:decision.reason,troops:roster.length,arrivals:fighting.length,enemy:foes.length,ratio:Number.isFinite(forecast.ratio)?Math.round(forecast.ratio*100)/100:null});
    return decision;
}

// Two or three small squads can share a battle without becoming one giant
// roster. Assign whole squads to the fixing force, flank and opposite screen.
function wodAiCoordinateJointAssaults(owner,plan) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    if(plan.jointCheckAt!=null&&now-plan.jointCheckAt<2500)return;plan.jointCheckAt=now;
    const ops=wodAiActiveFrontOperations(owner),known=wodAiThreats(owner,false).filter(isLandArmyUnit);
    for(const op of ops)if(op.joint){
        const joint=op.joint,contacts=known.some(e=>e.owner===op.hostile&&Math.hypot(e.x-joint.contact.x,e.y-joint.contact.y)<hr*10);
        if(contacts)joint.clearedAt=null;else joint.clearedAt??=now;
        const participants=ops.filter(o=>o.joint===joint),troops=participants.flatMap(o=>wodAiSquadAvailable(owner,o));
        const distance=troops.length?troops.reduce((n,u)=>n+Math.hypot(u.x-joint.contact.x,u.y-joint.contact.y),0)/troops.length:Infinity;
        if(!joint.progress||distance<joint.progress.distance-hr||troops.some(u=>u._combatEngaged))joint.progress={at:now,distance};
        if(contacts&&joint.progress&&now-joint.progress.at<15000)joint.until=Math.max(joint.until,now+30000);
        if(joint.until<=now||joint.squads.filter(id=>ops.some(o=>o.id===id&&o.joint===joint)).length<2||joint.clearedAt!=null&&now-joint.clearedAt>=8000){
            op.joint=null;op.commandDecision=null;
            const army=wodAiSquadAvailable(owner,op);if(army.length>=3)wodAiContinueFrontOffensive(owner,op,army);
            wodAiRecord(owner,'joint-assault-ended',{job:op.id,reason:contacts?'reassess':'contact-cleared'});
        }
    }
    const free=ops.filter(o=>!o.joint&&!o.ambush&&!o.supporting&&!(o.frontageTask?.until>now)&&wodAiSquadAvailable(owner,o).length>=3);
    for(const lead of free){
        if(lead.joint)continue;
        const army=wodAiSquadAvailable(owner,lead),center=army[0];
        const foes=known.filter(e=>e.owner===lead.hostile&&army.some(u=>Math.hypot(u.x-e.x,u.y-e.y)<hr*14));
        if(!foes.length)continue;
        // A lone weak contact is the lead squad's job. Other squads keep
        // capturing land instead of turning every skirmish into one mass.
        if(foes.length===1&&wodAiForecast(owner,army,foes).ratio>=wodAiAttackThreshold(owner))continue;
        const contact=getNearestHexToPoint(foes.reduce((n,e)=>n+e.x,0)/foes.length,foes.reduce((n,e)=>n+e.y,0)/foes.length);
        const rally=wodAiCohortAnchor(owner,army,contact)||lead.anchor;
        const partners=free.filter(o=>o!==lead&&!o.joint&&o.hostile===lead.hostile&&(!o.frontOwner||o.frontOwner===lead.frontOwner)&&
            wodAiSquadAvailable(owner,o).filter(u=>wodAiArrivalSeconds(u,contact,u.range||50,40)<=40||wodAiArrivalSeconds(u,rally,hr*3,60)<=60).length>=3)
            .sort((a,b)=>Math.hypot(a.anchor.x-center.x,a.anchor.y-center.y)-Math.hypot(b.anchor.x-center.x,b.anchor.y-center.y));
        if(!partners.length)continue;
        // Use one helper for ordinary contacts; add a second only when the
        // enemy frontage or strength warrants a larger two-wing operation.
        const squads=[lead],selected=army.slice();
        for(const partner of partners){
            squads.push(partner);selected.push(...wodAiSquadAvailable(owner,partner));
            if(squads.length>=3||foes.length<6&&wodAiForecast(owner,selected,foes).ratio>=wodAiAttackThreshold(owner))break;
        }
        const combined=selected;
        const separated=combined.some(u=>Math.hypot(u.x-center.x,u.y-center.y)>hr*7);
        const anchor=separated?rally:getNearestHexToPoint(center.x,center.y);let envelope=wodAiFrontEnvelopment(owner,combined,foes,anchor);
        const joint={id:'assault-'+lead.id+'-'+Math.floor(now),squads:squads.map(o=>o.id),anchor,contact,at:now,until:now+120000};
        const ordered=squads.slice().sort((a,b)=>Number(wodAiSquadAvailable(owner,b).some(u=>u.isGeneral))-Number(wodAiSquadAvailable(owner,a).some(u=>u.isGeneral))||Math.hypot(a.anchor.x-contact.x,a.anchor.y-contact.y)-Math.hypot(b.anchor.x-contact.x,b.anchor.y-contact.y));
        let pins=0;const fixing=[];
        while(pins<ordered.length&&wodAiForecast(owner,fixing,foes).ratio<.95){fixing.push(...wodAiSquadAvailable(owner,ordered[pins++]));}
        // Do not sacrifice half of a marginal six-versus-five force while its
        // other half takes a long flank. Larger armies retain multiple squads
        // in the fixing line before sending the remaining squads around it.
        if(pins>=ordered.length)envelope=null;
        let wing=0;
        for(const [i,op]of ordered.entries()){
            const troops=wodAiSquadAvailable(owner,op),cx=troops.reduce((n,u)=>n+u.x,0)/troops.length,cy=troops.reduce((n,u)=>n+u.y,0)/troops.length;
            const front=troops.slice().sort((a,b)=>Math.hypot(a.x-cx,a.y-cy)-Math.hypot(b.x-cx,b.y-cy))[0],ownAnchor=separated?anchor:getNearestHexToPoint(front.x,front.y);
            let route=i>=pins?envelope?.routes.filter(Boolean)[wing++]:null;
            if(route){
                const entries=route.slice(0,Math.max(1,Math.min(30,Math.ceil(route.length*.5)))).map((key,index)=>({h:gameData.hexes[key],index})).filter(p=>p.h&&wodIsFriendlyOwner(p.h.owner,owner));
                entries.sort((a,b)=>Math.hypot(a.h.x-ownAnchor.x,a.h.y-ownAnchor.y)-Math.hypot(b.h.x-ownAnchor.x,b.h.y-ownAnchor.y));
                const entry=entries[0],prefix=entry&&wodAiFrontLegs(front,[ownAnchor,entry.h],owner,foes);
                route=prefix?[...prefix,...route.slice(entry.index+1)]:null;
            }
            op.joint=joint;op.commandDecision=null;op.supporting=null;op.goal=contact;op.advanceGoal=null;op.anchor=ownAnchor;op.march=null;
            const role=route?(wing===1?'left':'right'):envelope&&i<pins?'pin':'breakthrough';
            op.jobs=[{id:op.id+'-joint-'+Math.floor(now),kind:role==='pin'?'hold':'main',role,response:true,members:op.members.slice(),frontOperation:op,holdHex:ownAnchor,route,cursor:0,bound:0}];
            op.mode=route||role==='pin'?'flank':'breakthrough';op.until=Math.max(op.until,joint.until);
            for(const u of wodAiSquadAvailable(owner,op)){u.aiOrderUntil=0;u.aiFrontBound=null;gameData._aiMoveQueue?.delete(u);}
        }
        wodAiCommandDecision(owner,lead);
        wodAiRecord(owner,'joint-assault',{job:joint.id,squads:joint.squads,troops:combined.length,flanks:wing,target:getHexKey(contact)});
    }
}

function wodAiFrontTargetPenalty(owner,op,point) {
    const hr=gameData.hexRadius||20;
    return wodAiActiveFrontOperations(owner).filter(o=>o!==op&&!o.supporting&&(!op?.joint||o.joint!==op.joint)).reduce((sum,o)=>{
        const goal=o.advanceGoal||o.goal;if(!goal)return sum;
        if(point.id&&goal.id===point.id){
            const assigned=wodAiActiveFrontOperations(owner).filter(p=>(p.advanceGoal||p.goal)?.id===point.id),foes=wodAiThreats(owner).filter(e=>Math.hypot(e.x-point.x,e.y-point.y)<hr*10);
            const army=[...new Map(assigned.flatMap(p=>wodAiSquadAvailable(owner,p)).map(u=>[u.uid,u])).values()];
            // A second squad is useful support for a defended objective. The
            // target reservation prevents redundant masses, not reinforcement.
            if(assigned.length<2&&foes.length&&wodAiForecast(owner,army,foes).ratio<wodAiAttackThreshold(owner)+.3)return sum+hr;
            return sum+hr*18;
        }
        return sum+Math.max(0,hr*7-Math.hypot(point.x-goal.x,point.y-goal.y))*1.7;
    },0);
}

// One neighboring force may help a live battle. Its roster and original
// objective remain intact; the rest of the front keeps advancing separately.
function wodAiCoordinateFrontSupport(owner,plan,ready) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,byId=new Map(ready.map(u=>[u.uid,u]));
    const ops=wodAiActiveFrontOperations(owner).filter(o=>!o.joint&&!(o.frontageTask?.until>now)&&o.members.some(id=>byId.has(id))),armies=new Map();
    for(const o of ops)armies.set(o,o.members.map(id=>byId.get(id)).filter(u=>u&&u.hp>u.maxHp*.6&&!u.retreating&&!u.moraleBroken&&!u._medicalRecovering&&
        !wodAiFrontCritical(gameData._aiDefenseByOwner?.[owner]?.jobs.find(j=>j.id===gameData._aiDefenseByOwner[owner].unitJob[u.uid]))));
    const army=o=>armies.get(o)||[];
    const known=wodAiThreats(owner,false).filter(e=>isLandArmyUnit(e)),used=new Set();
    const contact=o=>army(o).some(u=>u._combatEngaged&&known.some(e=>u.combatTargetUid===e.uid||e.combatTargetUid===u.uid));
    const stamp=(op,lead)=>{const members=army(lead).map(u=>u.uid),changed=op.supporting!==lead.id;
        op.supporting=lead.id;op.supportUntil=now+8000;used.add(op);used.add(lead);
        const foe=known.find(e=>army(lead).some(u=>u.combatTargetUid===e.uid||e.combatTargetUid===u.uid));
        for(const j of op.jobs)j._peerSupport={lead:lead.id,members,jobs:lead.jobs,target:foe?getHexKey(getNearestHexToPoint(foe.x,foe.y)):j._peerSupport?.target,until:op.supportUntil};
        if(changed){for(const u of army(op)){u.aiOrderUntil=0;u.aiFrontBound=null;gameData._aiMoveQueue?.delete(u);}wodAiRecord(owner,'operation-support',{job:op.id,lead:lead.id,troops:army(op).length});}
    };
    for(const op of ops.filter(o=>o.supporting)){
        const lead=ops.find(o=>o.id===op.supporting);
        if(lead&&(contact(lead)||contact(op))&&army(op).length>=3){stamp(op,lead);continue;}
        if(lead&&op.supportUntil>now){used.add(op);used.add(lead);continue;}
        op.supporting=null;for(const j of op.jobs)j._peerSupport=null;
        for(const u of army(op)){u.aiOrderUntil=0;u.aiFrontBound=null;gameData._aiMoveQueue?.delete(u);}
        wodAiRecord(owner,'operation-support-ended',{job:op.id});
    }
    for(const lead of ops.filter(o=>!used.has(o)&&!o.ambush&&contact(o))){
        const fighters=army(lead),foes=known.filter(e=>fighters.some(u=>Math.hypot(e.x-u.x,e.y-u.y)<hr*6));if(!foes.length)continue;
        const center=fighters[0],candidates=ops.filter(o=>o!==lead&&!used.has(o)&&!o.ambush&&o.phase!=='consolidate'&&o.hostile===lead.hostile&&
            !o.jobs.some(j=>j.route)&&!contact(o)&&army(o).length>=3&&army(o).some(u=>Math.hypot(u.x-center.x,u.y-center.y)<hr*10&&wodAiArrivalSeconds(u,foes[0],u.range||50,20)<=20));
        candidates.sort((a,b)=>Math.min(...army(a).map(u=>Math.hypot(u.x-center.x,u.y-center.y)))-Math.min(...army(b).map(u=>Math.hypot(u.x-center.x,u.y-center.y))));
        const helper=candidates.find(o=>wodAiForecast(owner,[...fighters,...army(o)],foes).ratio>=wodAiAttackThreshold(owner));
        if(helper)stamp(helper,lead);
    }
}

function wodAiEngagedContacts(owner,known) {
    const own=gameData.entities.filter(u=>u.owner===owner&&u.hp>0&&!wodIsNavalUnit(u)&&u.type!=='convoy'),ids=new Set(own.map(u=>u.uid));
    const targeted=new Set(own.map(u=>u.combatTargetUid||u._combatEngaged&&u._combatEnemy?.uid).filter(Boolean));
    return known.filter(e=>!e._intelMemory&&(targeted.has(e.uid)||ids.has(e.combatTargetUid)||e._combatEngaged&&ids.has(e._combatEnemy?.uid)));
}

function wodAiNearbyBattleSupport(owner,army,ready,foes) {
    if(!foes.length)return army;
    const hr=gameData.hexRadius||20,ids=new Set(army.map(u=>u.uid));
    const plan=gameData.aiTaskForces?.[owner],eligible=plan?wodAiFrontEligibility(owner,plan):()=>true;
    const helpers=ready.filter(u=>!ids.has(u.uid)&&eligible(u,true)&&u.hp>u.maxHp*.55&&!u.retreating&&!u.moraleBroken&&!u._medicalRecovering&&!u.boardTransportUid&&isLandArmyUnit(u)&&
        army.some(a=>Math.hypot(a.x-u.x,a.y-u.y)<hr*12)&&foes.some(e=>wodAiArrivalSeconds(u,e,u.range||50,12)<=12)&&
        (u._combatEngaged&&foes.some(e=>e.combatTargetUid===u.uid||u.combatTargetUid===e.uid)||
            u.target&&u.orderTarget&&foes.some(e=>Math.hypot(u.orderTarget.x-e.x,u.orderTarget.y-e.y)<hr*5&&Math.hypot(u.orderTarget.x-e.x,u.orderTarget.y-e.y)<Math.hypot(u.x-e.x,u.y-e.y)-hr))&&
        wodAiCanReach(u,getNearestHexToPoint(army[0].x,army[0].y))&&wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city).slice(0,18);
    return [...army,...helpers];
}

function wodAiFrontOffensiveJob(unit,plan,response) {
    const now=wodAiOperationTime(),op=Object.entries(gameData._aiFrontOffensives||{}).filter(([k])=>k===String(unit.owner)||k.startsWith(unit.owner+':')).map(([,o])=>o).find(o=>o?.hexes===gameData.hexes&&o.until>now&&o.members.includes(unit.uid)&&(!o.frontOwner||!wodAiFrontOwner(unit)||o.frontOwner===wodAiFrontOwner(unit)));
    if(!op||op.hexes!==gameData.hexes||op.until<=now||!op.members.includes(unit.uid)||wodAiFrontCritical(response))return null;
    const base=plan.jobs.find(j=>j.id===plan.unitJob[unit.uid]);
    if(base?.city||base?.fort||response&&['hold','reserve','support'].includes(base?.kind)||unit._medicalRecovering||unit.retreating||unit.moraleBroken||unit._navalAssaultUntil>now)return null;
    return op.jobs.find(j=>j.members.includes(unit.uid))||null;
}

function wodAiFinishFrontOffensive(owner,op,reason) {
    if(op.phase==='consolidate')return;
    const now=wodAiOperationTime(),plan=gameData.aiTaskForces?.[owner];op.phase='consolidate';op.consolidateAt=now;op.until=now+6000;
    if(plan){
        const fronts=buildAiFrontlineSectors(owner,24);plan.sectors=fronts;plan.frontAt=now;plan.frontTopology=gameData._supplyTopologyVersion||0;
        for(const j of plan.jobs.filter(j=>['hold','reserve'].includes(j.kind)&&j.members.some(id=>op.members.includes(id)))){
            const army=gameData.entities.filter(u=>j.members.includes(u.uid)&&u.hp>0);if(!army.length)continue;
            const x=army.reduce((n,u)=>n+u.x,0)/army.length,y=army.reduce((n,u)=>n+u.y,0)/army.length;
            const front=fronts.slice().sort((a,b)=>Math.hypot(a.holdHex.x-x,a.holdHex.y-y)-Math.hypot(b.holdHex.x-x,b.holdHex.y-y))[0];
            if(front){j.holdHex=front.holdHex;j.attackHex=front.attackHex;}
        }
    }
    wodAiRecord(owner,'front-operation-close',{id:op.id,reason});
}

function wodAiContinueFrontOffensive(owner,op,army) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    if(op.nextCheckAt!=null&&now-op.nextCheckAt<2500)return false;op.nextCheckAt=now;
    const plan=gameData.aiTaskForces?.[owner],eligible=plan?wodAiFrontEligibility(owner,plan):()=>true;
    const roster=army.filter(u=>op.members.includes(u.uid)&&eligible(u,true));
    const ready=roster.filter(u=>u.hp>u.maxHp*.55&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city);
    if(ready.length<3)return false;
    const lead=ready.slice().sort((a,b)=>ready.filter(u=>Math.hypot(u.x-b.x,u.y-b.y)<hr*7).length-ready.filter(u=>Math.hypot(u.x-a.x,u.y-a.y)<hr*7).length)[0];
    const core=ready.filter(u=>Math.hypot(u.x-lead.x,u.y-lead.y)<hr*7);
    if(core.length<Math.max(3,Math.ceil(ready.length*.6)))return false;
    const reach=wodAiOperationReach(lead),known=wodAiThreats(owner),old=op.advanceGoal||op.goal;
    const safe=h=>h&&canUnitEnterHex(lead,h)&&(!op.frontOwner||h.owner===op.frontOwner)&&reach.has(getHexKey(h))&&wodAiForecast(owner,core,known.filter(e=>Math.hypot(e.x-h.x,e.y-h.y)<hr*7)).ratio>=wodAiAttackThreshold(owner);
    const dx=old.x-op.anchor.x,dy=old.y-op.anchor.y,len=Math.hypot(dx,dy)||1,bearing=op.advanceBearing||{x:dx/len,y:dy/len};
    const forward={x:lead.x+bearing.x*hr*12,y:lead.y+bearing.y*hr*12};
    let structure=wodAiStructureObjective(owner,core,forward);if(structure&&(!safe(structure.hex)||wodAiFrontTargetPenalty(owner,op,structure.hex)>=hr*5))structure=null;let goal=structure?.hex;
    if(!goal&&op.resumeGoal&&wodIsHostileOwner(op.resumeGoal.owner,owner)&&safe(op.resumeGoal))goal=op.resumeGoal;
    if(!goal){
        const towns=wodAiKnownCities(owner).filter(c=>wodIsHostileOwner(c.owner,owner)&&getCityUrbanTerrainHexes(c).some(h=>wodIsHostileOwner(h.owner,owner))&&safe(c)&&wodAiFrontTargetPenalty(owner,op,c)<hr*5).sort((a,b)=>Math.hypot(a.x-lead.x,a.y-lead.y)+wodAiFrontTargetPenalty(owner,op,a)-Math.hypot(b.x-lead.x,b.y-lead.y)-wodAiFrontTargetPenalty(owner,op,b));
        goal=towns[0];
    }
    if(!goal){
        const explored=wodFogActive()?wodFogFactionIntel(owner).explored:null;
        const nearby=getHexesInRadius(getNearestHexToPoint(lead.x,lead.y).q,getNearestHexToPoint(lead.x,lead.y).r,9)
            .map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&(!explored||explored.has(getHexKey(h)))&&!isWaterHex(h)&&wodIsHostileOwner(h.owner,owner))
            .map(h=>({attackHex:h,holdHex:getNeighborHexes(h).find(n=>!isWaterHex(n)&&wodIsFriendlyOwner(n.owner,owner)&&wodCurrentSupplyComponent(n,owner).city)})).filter(s=>s.holdHex);
        const fronts=[...nearby,...buildAiFrontlineSectors(owner,24)].filter(s=>s.attackHex&&wodIsHostileOwner(s.attackHex.owner,owner)&&(!explored||explored.has(getHexKey(s.attackHex)))&&
            Math.hypot(s.holdHex.x-lead.x,s.holdHex.y-lead.y)<hr*18&&wodCurrentSupplyComponent(s.holdHex,owner).city&&safe(s.attackHex));
        const score=h=>Math.hypot(h.x-lead.x,h.y-lead.y)-((h.x-lead.x)*bearing.x+(h.y-lead.y)*bearing.y)*.85+wodAiFrontTargetPenalty(owner,op,h);
        fronts.sort((a,b)=>score(a.attackHex)-score(b.attackHex));goal=fronts[0]?.attackHex;
        // Keep a direction through several quiet cells, rather than circling
        // the nearest freshly painted edge one tiny objective at a time.
        let at=goal;const visited=new Set(at?[getHexKey(at)]:[]);
        for(let i=0;at&&i<5;i++){
            const next=getNeighborHexes(at).filter(h=>(!explored||explored.has(getHexKey(h)))&&!visited.has(getHexKey(h))&&!isWaterHex(h)&&
                wodIsHostileOwner(h.owner,owner)&&wodCanStepBetweenHexes(lead,at,h,true)&&safe(h)&&
                (h.x-at.x)*bearing.x+(h.y-at.y)*bearing.y>hr*.2)
                .sort((a,b)=>score(a)-score(b))[0];
            if(!next)break;visited.add(getHexKey(next));at=goal=next;
        }
    }
    if(!goal)return false;
    if(goal.id||structure){op.strategicGoal=goal;op.strategicWatch=null;}
    op.anchor=getNearestHexToPoint(lead.x,lead.y);op.goal=goal;op.advanceGoal=goal;op.advanceStructure=structure;op.resumeGoal=null;
    op.hostile=goal.owner;op.phase='advance';op.mode='breakthrough';op.stage='attack';op.initialN=roster.length;op.until=now+120000;op.progress={key:goal.id||getHexKey(goal),distance:Math.hypot(lead.x-goal.x,lead.y-goal.y),at:now};op.march=null;op.nextCheckAt=null;
    op.effect=null;op.effectCheckAt=null;op.commitCheckAt=null;op.commitCore=null;op.commandDecision=null;
    const gx=goal.x-op.anchor.x,gy=goal.y-op.anchor.y,gl=Math.hypot(gx,gy)||1;
    op.advanceBearing=goal.id||gx*bearing.x+gy*bearing.y<hr?{x:gx/gl,y:gy/gl}:bearing;
    const ordered=wodAiSquadRoster(owner,op).sort((a,b)=>(a.y-op.anchor.y)*gx-(a.x-op.anchor.x)*gy-((b.y-op.anchor.y)*gx-(b.x-op.anchor.x)*gy));
    const groups=Math.max(1,Math.ceil(ordered.length/8)),size=Math.ceil(ordered.length/groups);op.followSerial=(op.followSerial||0)+1;op.jobs=[];
    for(let i=0;i<ordered.length;i+=size)op.jobs.push({id:op.id+'-follow-'+op.followSerial+'-'+i,kind:'main',role:'breakthrough',response:true,members:ordered.slice(i,i+size).map(u=>u.uid),frontOperation:op,holdHex:op.anchor,bound:op.followSerial});
    for(const u of roster){u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}
    wodAiRecord(owner,'front-operation-followthrough',{id:op.id,target:goal.id||getHexKey(goal),kind:structure?.kind||goal.id&&'town'||'land',from:old.id||getHexKey(old)});
    return true;
}

function wodAiExploitClearedFront(owner,op,army) {
    if(op.phase!=='advance'||!['envelopment','flank'].includes(op.mode))return false;
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    if(op.ambushSprungAt!=null&&now-op.ambushSprungAt<20000)return false;
    if(op.victoryCheckAt!=null&&now-op.victoryCheckAt<1500)return false;op.victoryCheckAt=now;
    if(!wodIsFriendlyOwner(op.goal.owner,owner))return false;
    const plan=gameData.aiTaskForces?.[owner];if(!plan)return false;
    const eligible=wodAiFrontEligibility(owner,plan),force=army.filter(u=>eligible(u,true)&&u.hp>u.maxHp*.55);
    if(force.length<3)return false;
    const foes=wodAiThreats(owner).filter(e=>!wodIsNavalUnit(e)&&e.type!=='convoy'&&e.owner===op.hostile&&
        (Math.hypot(e.x-op.goal.x,e.y-op.goal.y)<hr*10||force.some(u=>Math.hypot(e.x-u.x,e.y-u.y)<hr*7)));
    // A live, substantial defense keeps its encirclement. Once that contact
    // is gone or overwhelmed, stop tracing obsolete wings around empty land.
    const core=force.filter(u=>Math.hypot(u.x-op.goal.x,u.y-op.goal.y)<hr*9);
    if(foes.some(e=>!e._intelMemory&&!e.retreating&&!e.moraleBroken&&e.hp>e.maxHp*.35))return false;
    if(core.length<3||foes.length&&wodAiForecast(owner,core,foes).ratio<wodAiAttackThreshold(owner,true))return false;
    const previous=op.mode;
    if(!wodAiContinueFrontOffensive(owner,op,force))return false;
    wodAiRecord(owner,'front-victory-exploit',{id:op.id,from:previous,troops:force.length,opposition:foes.length});return true;
}

// Use cardinal legs so the advancing wings actually paint a connected supply
// corridor. Never shortcut a planned wing through the army it is going around.
function wodAiFrontDetour(lead,start,end,legal) {
    let work=gameData._aiFlankSearchWork;
    if(work?.tick!==gameData._wodSimTick||work?.hexes!==gameData.hexes)work=gameData._aiFlankSearchWork={tick:gameData._wodSimTick,hexes:gameData.hexes,deadline:performance.now()+4};
    if(performance.now()>=work.deadline||!legal(end))return null;
    const heap=[],best=new Map([[getHexKey(start),0]]),prev=new Map(),hr=gameData.hexRadius||20;
    const push=n=>{heap.push(n);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].f<=n.f)break;heap[i]=heap[p];i=p;}heap[i]=n;};
    const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1].f<heap[j].f)j++;if(heap[j].f>=last.f)break;heap[i]=heap[j];i=j;}heap[i]=last;}return first;};
    push({h:start,g:0,f:Math.hypot(start.x-end.x,start.y-end.y)});let nodes=0;
    while(heap.length&&nodes++<1600){
        if((nodes&63)===0&&performance.now()>=work.deadline)return null;
        const {h,g}=pop(),key=getHexKey(h);if(g!==best.get(key))continue;
        if(wodHexKeysEqual(h,end)){const result=[h];for(let k=key;prev.has(k);){k=prev.get(k);result.push(gameData.hexes[k]);}return result.reverse();}
        const neighbors=cardinalHexDirections.map(d=>gameData.hexes[(h.q+d.q)+','+(h.r+d.r)]).filter(Boolean);
        if(gameData.bridges?.length)wodForEachBridgePathPortal(lead,h,n=>{if(!neighbors.includes(n))neighbors.push(n);});
        for(const n of neighbors){
            if(!legal(n)||!wodCanStepBetweenHexes(lead,h,n,true))continue;
            const cost=g+Math.hypot(n.x-h.x,n.y-h.y)*(1+Math.max(0,getTerrainDefenseModifier(lead,n)-.9)*.15),nk=getHexKey(n);
            if(cost>=(best.get(nk)??Infinity)||cost>hr*110)continue;
            best.set(nk,cost);prev.set(nk,key);push({h:n,g:cost,f:cost+Math.hypot(n.x-end.x,n.y-end.y)});
        }
    }
    return null;
}

function wodAiFrontLegs(lead,points,owner,foes) {
    const explored=wodFogActive()?wodFogFactionIntel(owner).explored:null,hr=gameData.hexRadius||20;
    const route=[getHexKey(getNearestHexToPoint(points[0].x,points[0].y))],reach=wodAiOperationReach(lead);let from=points[0];
    const legal=h=>h&&(!isWaterHex(h)||isBridgeHex(h))&&canUnitEnterHex(lead,h)&&reach.has(getHexKey(h))&&(!explored||explored.has(getHexKey(h)))&&
        !foes.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<(e.range||50)+hr*.7&&!wodIsFriendlyOwner(h.owner,owner));
    for(const to of points.slice(1)){
        const legStart=route.length;let blocked=false;
        const n=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/hr));
        for(let i=1;i<=n;i++){
            const h=getNearestHexToPoint(from.x+(to.x-from.x)*i/n,from.y+(to.y-from.y)*i/n);
            if(!legal(h)){blocked=true;break;}
            const prev=gameData.hexes[route.at(-1)];
            if(prev.q!==h.q&&prev.r!==h.r){
                const corner=[gameData.hexes[h.q+','+prev.r],gameData.hexes[prev.q+','+h.r]].find(legal);
                if(!corner){blocked=true;break;}route.push(getHexKey(corner));
            }
            if(route.at(-1)!==getHexKey(h))route.push(getHexKey(h));
        }
        if(blocked){
            route.length=legStart;
            const detour=wodAiFrontDetour(lead,gameData.hexes[route.at(-1)],getNearestHexToPoint(to.x,to.y),legal);
            if(!detour)return null;for(const h of detour.slice(1))route.push(getHexKey(h));
        }
        from=to;
    }
    return route;
}

function wodAiFrontEnvelopment(owner,army,foes,anchor,support=army) {
    const ratio=wodAiForecast(owner,support,foes).ratio;
    if(army.length<(foes.length===1?4:6)||!foes.length||ratio<1.08)return null;
    const hr=gameData.hexRadius||20,cx=foes.reduce((n,e)=>n+e.x,0)/foes.length,cy=foes.reduce((n,e)=>n+e.y,0)/foes.length;
    const dx=cx-anchor.x,dy=cy-anchor.y,len=Math.hypot(dx,dy)||1,ax=dx/len,ay=dy/len;
    let width=hr*4,depth=hr*3;
    for(const e of foes){width=Math.max(width,Math.abs((e.x-cx)*-ay+(e.y-cy)*ax)+(e.range||50)+hr*2);depth=Math.max(depth,(e.x-cx)*ax+(e.y-cy)*ay+(e.range||50)+hr*3);}
    if(width>hr*26||depth>hr*20)return null;
    let cut=null;
    if(army.length>=6&&foes.length>=2){
        const context=wodAiCombatContext(owner),key='offensive-cut:'+army.map(u=>u.uid).sort().join(',');
        if(!(key in context))context[key]=wodAiCutObjective(owner,army);
        const candidate=context[key];if(candidate&&Math.hypot(candidate.objectiveHex.x-cx,candidate.objectiveHex.y-cy)<hr*18)cut=candidate;
    }
    const rear=cut?.objectiveHex||{x:cx+ax*depth,y:cy+ay*depth},routes=[];
    for(const side of [-1,1]){
        const outer={x:anchor.x-ay*width*side,y:anchor.y+ax*width*side};
        const shoulder={x:rear.x-ay*width*side,y:rear.y+ax*width*side};
        const cells=cut?.cutHexes.map(k=>gameData.hexes[k]),half=cells&&Math.floor(cells.length/2);
        const closing=cells?(side<0?cells.slice(0,half+1):cells.slice(half).reverse()):[shoulder,rear];
        const route=wodAiFrontLegs(army.find(u=>!wodCanClimb(u))||army[0],[anchor,outer,...closing],owner,foes);
        routes.push(route);
    }
    // A coast, river or mountain can close one wing without closing the other.
    // Keep a stronger fixing force for this maneuver; only split both wings
    // when there are enough troops and a real overall advantage.
    if(!routes.some(Boolean))return null;
    if(army.length<8||ratio<1.2){
        const preferred=routes.map((r,i)=>({i,cost:r?r.reduce((n,k,j)=>j?n+Math.hypot(gameData.hexes[k].x-gameData.hexes[r[j-1]].x,gameData.hexes[k].y-gameData.hexes[r[j-1]].y):n,0):Infinity})).sort((a,b)=>a.cost-b.cost)[0].i;
        routes[1-preferred]=null;
    }
    return {routes,rear:getNearestHexToPoint(rear.x,rear.y),cut:cut?.cutHexes,isolates:cut?.cutoffTroops};
}

function wodAiAssignFrontWings(op,army,envelope,anchor) {
    const wingsN=envelope.routes.filter(Boolean).length;
    op.anchor=anchor;op.mode=wingsN===2?'envelopment':'flank';op.rear=envelope.rear;op.jobs=[];
    const add=(role,members,route)=>op.jobs.push({id:op.id+'-'+role,kind:role==='pin'?'hold':'main',role,response:true,members:members.map(u=>u.uid),frontOperation:op,holdHex:anchor,route,cursor:0,bound:0});
    const pin=army.slice().sort((a,b)=>Number(!!b.isGeneral)-Number(!!a.isGeneral)||Number(b.type==='heavy')-Number(a.type==='heavy')||Number(!!b._combatEngaged)-Number(!!a._combatEngaged)).slice(0,Math.min(army.length-2,Math.max(2,Math.ceil(army.length*(wingsN===1?.55:.3)))));
    const dx=op.goal.x-anchor.x,dy=op.goal.y-anchor.y;
    const wings=army.filter(u=>!pin.includes(u)).sort((a,b)=>(a.y-anchor.y)*dx-(a.x-anchor.x)*dy-((b.y-anchor.y)*dx-(b.x-anchor.x)*dy)),half=Math.ceil(wings.length/2);
    add('pin',pin);
    if(wingsN===2){add('left',wings.slice(0,half),envelope.routes[0]);add('right',wings.slice(half),envelope.routes[1]);}
    else add(envelope.routes[0]?'left':'right',wings,envelope.routes[0]||envelope.routes[1]);
}

function wodAiAvailableFrontWings(owner,op,envelope,goal) {
    if(!envelope)return null;
    const hr=gameData.hexRadius||20,others=wodAiActiveFrontOperations(owner).filter(o=>o!==op&&o.phase!=='consolidate'&&Math.hypot(o.goal.x-goal.x,o.goal.y-goal.y)<hr*10);
    const occupied=others.flatMap(o=>o.jobs.filter(j=>j.route&&!j.closed).map(j=>new Set(j.route.slice(Math.ceil(j.route.length*.15),Math.floor(j.route.length*.8)))));
    const routes=envelope.routes.map(route=>{if(!route)return null;const middle=route.slice(Math.ceil(route.length*.15),Math.floor(route.length*.8));return occupied.some(keys=>middle.filter(k=>keys.has(k)).length>Math.max(2,middle.length*.35))?null:route;});
    return routes.some(Boolean)?{...envelope,routes}:null;
}

// The lure is based on observed movement, never an opponent's hidden orders.
// It is a short-lived operation using ordinary sight, damage and supply rules.
function wodAiObservedApproach(owner,contacts,point) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    let cache=gameData._aiApproachSightings;if(cache?.hexes!==gameData.hexes)cache=gameData._aiApproachSightings={hexes:gameData.hexes,owners:{},updated:{}};
    const records=cache.owners[owner]||=(new Map());
    if(point)return contacts.filter(e=>!e._intelMemory).reduce((n,e)=>{const old=records.get(e.uid);return n+Number(!!old&&now-old.at<4000&&old.moved>hr*.2&&
        (point.x-e.x)*old.vx+(point.y-e.y)*old.vy>Math.hypot(point.x-e.x,point.y-e.y)*.55);},0);
    for(const e of contacts.filter(e=>!e._intelMemory)){
        let old=records.get(e.uid);
        if(!old){old={x:e.x,y:e.y,at:now,vx:0,vy:0,moved:0};records.set(e.uid,old);}
        else if(now-old.at>=900){const dx=e.x-old.x,dy=e.y-old.y,moved=Math.hypot(dx,dy);Object.assign(old,{x:e.x,y:e.y,at:now,vx:dx/(moved||1),vy:dy/(moved||1),moved});}
    }
    for(const [id,r]of records)if(now-r.at>15000)records.delete(id);
    cache.updated[owner]=now;
    return 0;
}

function wodAiAmbushLayout(owner,army,foes,bait) {
    const hr=gameData.hexRadius||20;
    const start=getNearestHexToPoint(bait.x,bait.y),cx=foes.reduce((n,e)=>n+e.x,0)/foes.length,cy=foes.reduce((n,e)=>n+e.y,0)/foes.length;
    if(!start)return false;
    const dx=cx-start.x,dy=cy-start.y,len=Math.hypot(dx,dy)||1,ax=dx/len,ay=dy/len;
    const legal=h=>h&&!isWaterHex(h)&&wodIsFriendlyOwner(h.owner,owner)&&wodCurrentSupplyComponent(h,owner).city&&
        army.every(u=>canUnitEnterHex(u,h))&&!foes.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<(e.range||50)*1.1);
    const desired={x:start.x-ax*hr*3,y:start.y-ay*hr*3};
    const sites=getHexesInRadius(start.q,start.r,5).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>legal(h)&&
        (start.x-h.x)*ax+(start.y-h.y)*ay>hr*2&&gameData.cities.filter(c=>c.owner===owner).every(c=>Math.hypot(c.x-h.x,c.y-h.y)>hr*11));
    sites.sort((a,b)=>Math.hypot(a.x-desired.x,a.y-desired.y)-Math.hypot(b.x-desired.x,b.y-desired.y));
    const center=sites[0];if(!center)return false;
    const wings=[];
    for(const side of [-1,1]){
        const aim={x:center.x+ax*hr*1.5-ay*hr*5*side,y:center.y+ay*hr*1.5+ax*hr*5*side};
        const at=getNearestHexToPoint(aim.x,aim.y);if(!at)return false;
        const points=getHexesInRadius(at.q,at.r,2).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>legal(h)&&
            ((h.x-center.x)*-ay+(h.y-center.y)*ax)*side>hr*3.5&&Math.hypot(h.x-aim.x,h.y-aim.y)<hr*2.5);
        const power=h=>army.filter(u=>u!==bait&&!u.isGeneral).reduce((n,u)=>n+wodAiUnitCombatPower(u,h),0);
        points.sort((a,b)=>Math.hypot(a.x-aim.x,a.y-aim.y)-Math.hypot(b.x-aim.x,b.y-aim.y)-(power(a)-power(b))*hr*2);
        if(!points[0])return false;wings.push(points[0]);
    }
    const flankers=army.filter(u=>u!==bait&&!u.isGeneral),wingN=Math.min(4,Math.max(2,Math.floor((army.length-2)/3))),groups=[[bait]];
    for(const wing of wings){
        flankers.sort((a,b)=>Math.hypot(a.x-wing.x,a.y-wing.y)-Math.hypot(b.x-wing.x,b.y-wing.y));
        const group=flankers.splice(0,Math.min(wingN,flankers.length-(groups.length===1?2:0)));if(group.length<2)return false;groups.push(group);
    }
    const pin=army.filter(u=>!groups.some(group=>group.includes(u))).sort((a,b)=>Math.hypot(a.x-center.x,a.y-center.y)-Math.hypot(b.x-center.x,b.y-center.y));
    if(!pin.length)return false;
    const rear=getNearestHexToPoint(center.x-ax*hr*3,center.y-ay*hr*3);if(!legal(rear))return false;
    groups.push(pin);const anchors=[start,...wings,center];
    if(groups.some((group,i)=>Math.hypot(group[0].x-anchors[i].x,group[0].y-anchors[i].y)/Math.max(1,group[0].speed*WOD_MOVE_SPEED_FACTOR)>24))return false;
    // Stage entirely through friendly land. A blocked wing is a rejected trap,
    // rather than a unit ordered through an unseen enemy or a river.
    for(let i=0;i<groups.length;i++){
        const lead=groups[i][0],route=wodAiFrontDetour(lead,getNearestHexToPoint(lead.x,lead.y),anchors[i],h=>h&&!isWaterHex(h)&&wodIsFriendlyOwner(h.owner,owner)&&canUnitEnterHex(lead,h));
        if(!route||route.slice(1).reduce((n,h,i)=>n+Math.hypot(h.x-route[i].x,h.y-route[i].y),0)/Math.max(1,lead.speed*WOD_MOVE_SPEED_FACTOR)>24)return false;
    }
    return {start,center,rear,wings,ax,ay,groups,anchors};
}

function wodAiTryAmbush(owner,op,army,known) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    if(op.ambush||op.ambushTried||op.frontageTask?.until>now||army.length<6||op.jobs.some(j=>j.route&&j.cursor>2))return false;
    const foes=known.filter(e=>!e._intelMemory&&!e.retreating&&!e.moraleBroken&&e.owner===op.hostile&&isLandArmyUnit(e)&&
        Math.hypot(e.x-op.anchor.x,e.y-op.anchor.y)<hr*12);
    if(foes.length<2||foes.length>army.length*.8)return false;
    wodAiObservedApproach(owner,foes,null);
    const incoming=wodAiObservedApproach(owner,foes,op.anchor);
    if(incoming<Math.min(2,foes.length)){
        // A pinned opponent will rarely follow bait. Exploit its existing
        // commitment with legal wings instead of waiting for a scripted lure.
        const fixed=foes.filter(e=>e._combatEngaged&&army.some(u=>u.combatTargetUid===e.uid||e.combatTargetUid===u.uid));
        if(fixed.length<2||op.contactEnvelopeAt!=null&&now-op.contactEnvelopeAt<60000||army.some(u=>wodAiCorridorWithdrawal(u))||wodAiForecast(owner,army,foes).ratio<wodAiAttackThreshold(owner)+.15)return false;
        const anchor=wodAiCohortAnchor(owner,army,op.goal),envelope=anchor&&wodAiAvailableFrontWings(owner,op,wodAiFrontEnvelopment(owner,army,foes,anchor),op.goal);
        if(!envelope)return false;
        op.contactEnvelopeAt=now;op.goal=getNearestHexToPoint(foes.reduce((n,u)=>n+u.x,0)/foes.length,foes.reduce((n,u)=>n+u.y,0)/foes.length);op.anchor=anchor;op.phase='advance';op.launchedAt=now;op.mode='envelopment';op.march=null;op.advanceGoal=null;op.commandDecision=null;op.effect=null;op.until=Math.max(op.until,now+120000);
        wodAiAssignFrontWings(op,army,envelope,anchor);for(const u of army){u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}
        wodAiRecord(owner,'contact-envelopment',{job:op.id,troops:army.length,enemy:foes.length,wings:envelope.routes.filter(Boolean).length});return true;
    }
    const style={balanced:.45,deliberate:.6,defensive:.8,maneuver:.7,amphibious:.35,highland:.65}[wodAiCommander(owner).id]||.45;
    if((gameData._aiAmbushCooldown?.hexes===gameData.hexes&&gameData._aiAmbushCooldown.owners[owner]>now)||
        wodAiActiveFrontOperations(owner).some(o=>o!==op&&o.ambush)||wodAiForecast(owner,army,foes).ratio<1.55-style*.4)return false;
    const baits=army.filter(u=>!u.isGeneral&&['light','motorized','mountaineer'].includes(u.type)&&u.hp>u.maxHp*.85)
        .sort((a,b)=>Math.min(...foes.map(e=>Math.hypot(e.x-a.x,e.y-a.y)))-Math.min(...foes.map(e=>Math.hypot(e.x-b.x,e.y-b.y))));
    if(!baits.length)return false;
    let layout,bait;
    for(const candidate of baits.slice(0,4)){layout=wodAiAmbushLayout(owner,army,foes,candidate);if(layout){bait=candidate;break;}}
    if(!layout)return false;
    const {start,center,rear,wings,ax,ay,groups,anchors}=layout;
    bait._aiAmbushBaitUntil=now+90000;op.ambushTried=true;op.phase='advance';op.mode='ambush';op.march=null;op.advanceGoal=null;op.until=Math.max(op.until,now+90000);
    op.ambush={stage:'prepare',at:now,stageAt:now,center,start,rear,wings,ax,ay,bait:bait.uid,contacts:foes.map(e=>e.uid),initial:foes.map(e=>({uid:e.uid,x:e.x,y:e.y})),width:hr*5};
    op.jobs=groups.map((group,i)=>({id:op.id+'-ambush-'+i,kind:'main',role:['bait','ambush-left','ambush-right','ambush-pin'][i],response:true,
        members:group.map(u=>u.uid),frontOperation:op,holdHex:anchors[i],bound:0}));
    if(gameData._aiAmbushCooldown?.hexes!==gameData.hexes)gameData._aiAmbushCooldown={hexes:gameData.hexes,owners:{}};
    gameData._aiAmbushCooldown.owners[owner]=now+150000;
    for(const u of army){u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}
    wodAiRecord(owner,'ambush-prepare',{job:op.id,bait:bait.uid,troops:army.length,enemy:foes.length,center:getHexKey(center)});return true;
}

function wodAiAmbushThreats(owner,op,army) {
    const trap=op.ambush,center=trap?.center||op.goal,hr=gameData.hexRadius||20;
    const tracked=new Set(trap?.contacts||[]),anchors=[center,...trap?.wings||[],trap?.rear].filter(Boolean);
    return wodAiThreats(owner,false).filter(e=>e.owner===op.hostile&&!wodIsNavalUnit(e)&&Math.hypot(e.x-center.x,e.y-center.y)<hr*16&&
        (tracked.has(e.uid)||army.some(u=>u.combatTargetUid===e.uid||e.combatTargetUid===u.uid)||
            anchors.some(h=>wodAiArrivalSeconds(e,h,e.range||50,14)<=14)));
}

function wodAiCancelAmbush(owner,op,army,reason) {
    const now=wodAiOperationTime();const baitId=op.ambush?.bait;for(const u of gameData.entities)if(u.uid===baitId)u._aiAmbushBaitUntil=0;
    const foes=wodAiAmbushThreats(owner,op,army);
    // A stationary opponent need not follow the lure. Keep the prepared wings
    // and turn the advantage into a real, legal flank instead of merging the
    // entire formation into another frontal counterattack.
    if(['opponent-did-not-follow','no-safe-closing-route'].includes(reason)&&!army.some(u=>wodAiCorridorWithdrawal(u))){
        const anchor=wodAiCohortAnchor(owner,army,op.goal);
        const envelope=anchor&&wodAiAvailableFrontWings(owner,op,wodAiFrontEnvelopment(owner,army,foes,anchor),op.goal);
        if(envelope){
            delete op.ambush;op.goal=getNearestHexToPoint(foes.reduce((n,u)=>n+u.x,0)/foes.length,foes.reduce((n,u)=>n+u.y,0)/foes.length);
            op.phase='advance';op.launchedAt=now;op.at=now;op.until=now+180000;op.advanceGoal=null;op.march=null;op.commandDecision=null;op.effect=null;
            wodAiAssignFrontWings(op,army,envelope,anchor);
            for(const u of army){u.aiOrderUntil=0;u._aiMoveIntent=null;gameData._aiMoveQueue?.delete(u);}
            wodAiRecord(owner,'ambush-adapted',{job:op.id,reason,wings:envelope.routes.filter(Boolean).length,troops:army.length});return;
        }
    }
    if(!army.some(u=>wodAiCorridorWithdrawal(u))&&wodAiAmbushCounterattack(owner,op,army,foes))return;
    delete op.ambush;op.mode='breakthrough';op.phase='advance';op.effect=null;op.effectCheckAt=null;op.advanceGoal=null;op.march=null;
    op.anchor=getNearestHexToPoint(army[0]?.x??op.anchor.x,army[0]?.y??op.anchor.y);
    op.jobs=[{id:op.id+'-after-ambush',kind:'main',role:'breakthrough',response:true,members:army.map(u=>u.uid),frontOperation:op,holdHex:op.anchor,bound:0}];
    for(const u of army){u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}
    wodAiRecord(owner,'ambush-abort',{job:op.id,reason,elapsed:Math.round((now-op.at)/1000)});
}

function wodAiSpringAmbush(owner,op,army,foes) {
    const trap=op.ambush,hr=gameData.hexRadius||20,now=wodAiOperationTime();
    const intel=wodFogActive()?wodFogFactionIntel(owner):null,explored=h=>!intel||intel.explored.has(getHexKey(h));
    const range=Math.max(...foes.map(e=>e.range||50))+hr*.8;
    const tail=Math.max(...foes.map(e=>(e.x-trap.center.x)*trap.ax+(e.y-trap.center.y)*trap.ay));
    const context=wodAiCombatContext(owner),cutKey='ambush-cut:'+op.id;
    if(!(cutKey in context))context[cutKey]=wodAiCutObjective(owner,army);
    const candidate=context[cutKey],cut=candidate&&Math.hypot(candidate.objectiveHex.x-trap.center.x,candidate.objectiveHex.y-trap.center.y)<hr*16?candidate:null;
    const aim=cut?.objectiveHex||getNearestHexToPoint(trap.center.x+trap.ax*(tail+range),trap.center.y+trap.ay*(tail+range));
    const points=(cut?[aim]:getHexesInRadius(aim.q,aim.r,2).map(p=>gameData.hexes[p.q+','+p.r])).filter(h=>h&&!isWaterHex(h)&&explored(h)&&army.some(u=>canUnitEnterHex(u,h))&&
        (cut||Math.abs((h.x-trap.center.x)*-trap.ay+(h.y-trap.center.y)*trap.ax)<hr*2)&&foes.every(e=>Math.hypot(e.x-h.x,e.y-h.y)>(e.range||50)+hr*.6));
    points.sort((a,b)=>Math.hypot(a.x-aim.x,a.y-aim.y)-Math.hypot(b.x-aim.x,b.y-aim.y));
    const rear=points[0],routes=[];if(!rear)return false;
    for(const [i,wing]of op.jobs.filter(j=>j.role.startsWith('ambush-')&&j.role!=='ambush-pin').entries()){
        const members=army.filter(u=>wing.members.includes(u.uid)),lead=members[0];if(members.length<2)return false;
        const side=i?1:-1,outer=getNearestHexToPoint(rear.x-trap.ay*trap.width*side,rear.y+trap.ax*trap.width*side);
        const shoulders=getHexesInRadius(outer.q,outer.r,2).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&!isWaterHex(h)&&explored(h)&&members.every(u=>canUnitEnterHex(u,h))&&
            ((h.x-trap.center.x)*-trap.ay+(h.y-trap.center.y)*trap.ax)*side>hr*3&&foes.every(e=>Math.hypot(e.x-h.x,e.y-h.y)>(e.range||50)+hr*.6));
        shoulders.sort((a,b)=>Math.hypot(a.x-outer.x,a.y-outer.y)-Math.hypot(b.x-outer.x,b.y-outer.y));
        const closing=cut?cut.cutHexes.map(k=>gameData.hexes[k]):[rear];
        if(i)closing.reverse();
        const route=members.every(u=>closing.every(h=>canUnitEnterHex(u,h)))&&shoulders.slice(0,3).map(shoulder=>wodAiFrontLegs(lead,[getNearestHexToPoint(lead.x,lead.y),shoulder,...closing],owner,foes)).find(Boolean);
        if(!route){if(cut)continue;return false;}
        routes.push({wing,route});
    }
    // One viable wing can close a graph-verified choke whose other side is
    // already blocked. Ordinary open-ground traps still require both wings.
    if(!routes.length||!cut&&routes.length!==2)return false;
    const pin=op.jobs.filter(j=>!routes.some(r=>r.wing===j)).flatMap(j=>j.members).filter(id=>id!==trap.bait);
    op.goal=getNearestHexToPoint(foes.reduce((n,e)=>n+e.x,0)/foes.length,foes.reduce((n,e)=>n+e.y,0)/foes.length);
    const baitUnit=army.find(u=>u.uid===trap.bait);if(baitUnit)baitUnit._aiAmbushBaitUntil=0;
    op.anchor=trap.center;op.rear=rear;op.mode='envelopment';op.phase='advance';op.launchedAt=now;op.at=now;op.until=Math.max(op.until,now+120000);op.ambushSprungAt=now;op.effect=null;op.effectCheckAt=null;delete op.ambush;
    op.ambushBait={uid:trap.bait,rear:trap.rear,ax:trap.ax,ay:trap.ay,until:now+20000};
    op.jobs=[{id:op.id+'-trap-pin',kind:'hold',role:'pin',response:true,members:pin,frontOperation:op,holdHex:op.anchor,bound:0},
        {id:op.id+'-bait-relief',kind:'main',role:'bait-relief',response:true,members:[trap.bait],frontOperation:op,holdHex:trap.rear,bound:0},
        ...routes.map(({wing,route},i)=>({id:op.id+'-trap-wing-'+i,kind:'main',role:i?'right':'left',response:true,members:wing.members.filter(id=>army.some(u=>u.uid===id)),frontOperation:op,holdHex:gameData.hexes[route[0]],route,cursor:0,bound:0}))];
    for(const u of army){u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}
    wodAiRecord(owner,'ambush-sprung',{job:op.id,enemy:foes.length,troops:army.length,rear:getHexKey(rear),wings:routes.length,cut:cut?.cutHexes});return true;
}

function wodAiRelieveAmbushBait(unit,job) {
    const op=job.frontOperation,relief=op.ambushBait,now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    if(!relief||unit.uid!==relief.uid)return false;
    const foes=wodAiThreats(unit.owner,false).filter(e=>!wodIsNavalUnit(e)&&Math.hypot(e.x-unit.x,e.y-unit.y)<(e.range||50)*2);
    if(!foes.length&&now>=relief.until){job.role='pin';job.kind='hold';unit.aiOrderUntil=0;return false;}
    if(wodAiCorridorWithdrawal(unit))return wodAiTacticalFallback(unit,job);
    const here=getNearestHexToPoint(unit.x,unit.y),ahead=(unit.x-relief.rear.x)*relief.ax+(unit.y-relief.rear.y)*relief.ay;
    let target=foes.length?getNearestHexToPoint(unit.x-relief.ax*hr*2,unit.y-relief.ay*hr*2):ahead>hr?relief.rear:here;
    if(!target||isWaterHex(target)||!wodIsFriendlyOwner(target.owner,unit.owner)||!wodCurrentSupplyComponent(target,unit.owner).city)target=here;
    const moved=wodAiMoveUnitTowardHex(unit,target,!foes.length,.05);
    if(moved){wodAiStampOrder(unit,!foes.length,target,900);unit.aiOrderPhase=op.phase;unit.aiOrderResponseId=job.id;unit.aiFrontBound=job.bound;}
    return true;
}

function wodAiStepAmbush(owner,op,army) {
    const trap=op.ambush,now=wodAiOperationTime(),hr=gameData.hexRadius||20;if(!trap||trap.checkedAt!=null&&now-trap.checkedAt<750)return;
    trap.checkedAt=now;
    const bait=army.find(u=>u.uid===trap.bait),foes=wodAiAmbushThreats(owner,op,army);
    // The baited center is expected to change hands. Only the retreat and wing
    // anchors must stay supplied; losing the killing ground is the trigger.
    const anchors=[...trap.wings,trap.rear];
    if(!bait||bait.hp<bait.maxHp*.45||army.length<5||anchors.some(h=>!wodIsFriendlyOwner(h.owner,owner)||!wodCurrentSupplyComponent(h,owner).city)||
        army.filter(u=>wodAiCorridorWithdrawal(u)).length>=Math.max(2,Math.ceil(army.length*.4))||wodAiForecast(owner,army,foes).ratio<.9){wodAiCancelAmbush(owner,op,army,'unsafe-or-relief-needed');return;}
    if(!foes.length||!foes.some(e=>trap.contacts.includes(e.uid))){trap.lostAt??=now;if(now-trap.lostAt>=4000)wodAiCancelAmbush(owner,op,army,'contact-lost');return;}trap.lostAt=null;
    if(foes.filter(e=>trap.contacts.includes(e.uid)).every(e=>e.retreating||e.moraleBroken)){wodAiCancelAmbush(owner,op,army,'opponent-withdrew');return;}
    const wings=op.jobs.filter(j=>j.role==='ambush-left'||j.role==='ambush-right');
    const staged=wings.every(j=>{const members=army.filter(u=>j.members.includes(u.uid));return members.length>=2&&members.filter(u=>Math.hypot(u.x-j.holdHex.x,u.y-j.holdHex.y)<hr*3||wodAiArrivalSeconds(u,j.holdHex,hr*3,6)<=6).length>=Math.ceil(members.length*.65);});
    const stageDistance=wings.reduce((n,j)=>n+army.filter(u=>j.members.includes(u.uid)).reduce((d,u)=>d+Math.hypot(u.x-j.holdHex.x,u.y-j.holdHex.y),0),0);
    if(!trap.stagingProgress||stageDistance<trap.stagingProgress.distance-hr*.5)trap.stagingProgress={distance:stageDistance,at:now};
    if(wings.some(j=>{const members=army.filter(u=>j.members.includes(u.uid));return members.length<2||members.some(u=>u.hp<u.maxHp*.6&&wodAiLocalSituation(u).retreat);})){wodAiCancelAmbush(owner,op,army,'flank-intercepted');return;}
    if(trap.stage==='prepare'&&staged){trap.stage='lure';trap.stageAt=now;for(const j of op.jobs)j.bound++;for(const u of army){u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}wodAiRecord(owner,'ambush-lure',{job:op.id,bait:trap.bait});}
    const tracked=foes.filter(e=>trap.contacts.includes(e.uid)&&!e.retreating&&!e.moraleBroken);
    const caught=tracked.filter(e=>(e.x-trap.center.x)*trap.ax+(e.y-trap.center.y)*trap.ay<hr*2.5&&
        Math.abs((e.x-trap.center.x)*-trap.ay+(e.y-trap.center.y)*trap.ax)<trap.width*.8);
    const fixed=tracked.filter(e=>e._combatEngaged&&army.some(u=>u.combatTargetUid===e.uid||e.combatTargetUid===u.uid));
    let committed=caught.length>=Math.max(1,Math.ceil(tracked.length*.5))||now-trap.stageAt>=3000&&fixed.length>=Math.max(2,Math.ceil(tracked.length*.5));
    if(!committed&&staged&&fixed.length>=2&&['lure','close'].includes(trap.stage)){
        const context=wodAiCombatContext(owner),key='ambush-cut:'+op.id;
        if(!(key in context))context[key]=wodAiCutObjective(owner,army);
        // Closing a verified supply neck around a pinned part of a larger
        // force is useful even when its other contacts refuse to follow bait.
        committed=(context[key]?.cutoffTroops||0)>=2;
    }
    if(['lure','close'].includes(trap.stage)&&staged&&committed){
        if(wodAiSpringAmbush(owner,op,army,foes.filter(e=>Math.hypot(e.x-trap.center.x,e.y-trap.center.y)<hr*8)))return;
        trap.closingAt??=now;
        if(wodFogActive()&&!trap.scoutedAt){
            let advanced=0;
            for(const wing of wings){const at=wing.holdHex,points=getHexesInRadius(at.q,at.r,2).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&!isWaterHex(h)&&wodIsFriendlyOwner(h.owner,owner)&&wodCurrentSupplyComponent(h,owner).city&&
                (h.x-at.x)*trap.ax+(h.y-at.y)*trap.ay>hr*.8&&foes.every(e=>Math.hypot(e.x-h.x,e.y-h.y)>(e.range||50)+hr));
                points.sort((a,b)=>((b.x-at.x)*trap.ax+(b.y-at.y)*trap.ay)-((a.x-at.x)*trap.ax+(a.y-at.y)*trap.ay));
                const next=points.find(h=>army.filter(u=>wing.members.includes(u.uid)).every(u=>canUnitEnterHex(u,h)&&wodAiCanReach(u,h)));
                if(next){wing.holdHex=next;wing.bound++;wing._formationSlots={};advanced++;}
            }
            if(advanced){trap.scoutedAt=now;trap.stage='close';for(const u of army){u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}return;}
        }
        if(trap.scoutedAt&&now-trap.scoutedAt<10000)return;
        if(now-trap.closingAt<5000)return;
        if(wodAiAmbushCounterattack(owner,op,army,foes))return;wodAiCancelAmbush(owner,op,army,'no-safe-closing-route');return;
    }
    const distance=tracked.reduce((n,e)=>n+Math.hypot(e.x-trap.center.x,e.y-trap.center.y),0)/Math.max(1,tracked.length);
    if(!trap.approach||distance<trap.approach.distance-hr*.35)trap.approach={at:now,distance};
    const arrival=Math.min(...tracked.map(e=>wodAiArrivalSeconds(e,trap.center,0,30)));
    const lureBudget=Math.max(12000,Math.min(30000,(Number.isFinite(arrival)?arrival*1000:18000)+6000));
    const stageExpired=trap.stage==='prepare'?now-trap.stageAt>30000&&now-trap.stagingProgress.at>6000:
        now-trap.stageAt>lureBudget&&now-trap.approach.at>10000||now-trap.stageAt>45000;
    if(stageExpired||now-trap.at>90000)wodAiCancelAmbush(owner,op,army,'opponent-did-not-follow');
}

function wodAiIssueAmbush(unit,job,army) {
    const op=job.frontOperation;wodAiStepAmbush(unit.owner,op,army);
    if(!op.ambush){const next=op.jobs.find(j=>j.members.includes(unit.uid));return next?wodAiIssueFrontOffensive(unit,next):false;}
    const trap=op.ambush,hr=gameData.hexRadius||20,now=wodAiOperationTime();let target,holding=true;
    if(job.role==='bait'){
        const foes=wodAiThreats(unit.owner,false).filter(e=>e.owner===op.hostile&&Math.hypot(e.x-unit.x,e.y-unit.y)<hr*12);
        const near=foes.length?Math.min(...foes.map(e=>Math.hypot(e.x-unit.x,e.y-unit.y))):Infinity;
        const followed=foes.some(e=>{const old=trap.initial.find(p=>p.uid===e.uid);return old&&((old.x-e.x)*trap.ax+(old.y-e.y)*trap.ay)>hr*.6;});
        if((trap.stage!=='prepare'&&followed||trap.stage==='prepare')&&near<(unit.range||50)*1.6){
            const projection=(unit.x-trap.rear.x)*trap.ax+(unit.y-trap.rear.y)*trap.ay;
            target=getNearestHexToPoint(unit.x-trap.ax*Math.min(hr*2,Math.max(0,projection)),unit.y-trap.ay*Math.min(hr*2,Math.max(0,projection)));holding=false;
        }else target=trap.stage!=='prepare'?getNearestHexToPoint(unit.x,unit.y):trap.start;
        if(!target||!wodIsFriendlyOwner(target.owner,unit.owner)||!wodCurrentSupplyComponent(target,unit.owner).city)target=trap.rear;
    }else{
        const members=army.filter(u=>job.members.includes(u.uid));target=wodAiFormationSlot(unit,job,job.holdHex,trap.start,members);
    }
    if(!target)return false;
    const moved=wodAiMoveUnitTowardHex(unit,target,holding,.05);
    if(moved){wodAiStampOrder(unit,holding,target,job.role==='bait'?900:3500);unit.aiOrderPhase=op.phase;unit.aiOrderResponseId=job.id;unit.aiFrontBound=job.bound;}
    return moved;
}

function wodAiReconsiderFrontManeuver(owner,op,army,known,ready=army) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    if(op.frontageTask?.until>now&&op.frontageTask.role!=='flank')return;
    if(op.phase!=='advance'||army.length<4||now-(op.maneuverAt??-Infinity)<5000)return;
    op.maneuverAt=now;
    if(op.mode!=='breakthrough'){
        const visible=known.filter(e=>!e._intelMemory&&e.owner===op.hostile);
        for(const wing of op.jobs.filter(j=>j.route&&!j.closed)){
            const troops=army.filter(u=>wing.members.includes(u.uid)),remaining=wing.route.slice(wing.cursor+1,wing.cursor+7).map(k=>gameData.hexes[k]);
            const danger=visible.filter(e=>remaining.some(h=>Math.hypot(e.x-h.x,e.y-h.y)<(e.range||50)+hr*.7));
            if(!troops.length||!danger.length||wodAiForecast(owner,troops,danger).ratio>=wodAiAttackThreshold(owner))continue;
            const lead=troops[0],route=wodAiFrontLegs(lead,[getNearestHexToPoint(lead.x,lead.y),gameData.hexes[wing.route.at(-1)]],owner,visible);
            if(route){wing.route=route;wing.cursor=0;wing.bound++;wing.boundAt=now;wing.slots={};wing.slotBound=null;for(const u of troops)u.aiOrderUntil=0;wodAiRecord(owner,'front-wing-reroute',{job:wing.id,reason:'observed-interception'});}
        }
        return;
    }
    const visible=known.filter(e=>!e._intelMemory&&e.owner===op.hostile&&army.some(u=>Math.hypot(u.x-e.x,u.y-e.y)<hr*12));
    const engaged=wodAiEngagedContacts(owner,visible),seed=engaged[0]||visible[0];if(!seed)return;
    const contacts=visible.filter(e=>Math.hypot(e.x-seed.x,e.y-seed.y)<hr*8);
    if(op.followSerial&&contacts.length<3&&wodAiForecast(owner,army,contacts).ratio>=3)return;
    const cx=army.reduce((n,u)=>n+u.x,0)/army.length,cy=army.reduce((n,u)=>n+u.y,0)/army.length;
    const lead=army.filter(u=>{const h=getNearestHexToPoint(u.x,u.y);return h&&!wodIsNavalUnit(u)&&wodIsFriendlyOwner(h.owner,owner)&&wodCurrentSupplyComponent(h,owner).city;})
        .sort((a,b)=>Math.hypot(a.x-cx,a.y-cy)-Math.hypot(b.x-cx,b.y-cy))[0];
    if(!lead)return;
    const anchor=getNearestHexToPoint(lead.x,lead.y),envelope=wodAiAvailableFrontWings(owner,op,wodAiFrontEnvelopment(owner,army,contacts,anchor,wodAiNearbyBattleSupport(owner,army,ready,contacts)),getNearestHexToPoint(seed.x,seed.y));
    if(!envelope)return;
    const x=contacts.reduce((n,e)=>n+e.x,0)/contacts.length,y=contacts.reduce((n,e)=>n+e.y,0)/contacts.length;
    op.goal=getNearestHexToPoint(x,y);wodAiAssignFrontWings(op,army,envelope,anchor);op.launchedAt=now;op.until=Math.max(op.until,now+180000);op.march=null;
    for(const u of army){u.aiOrderUntil=0;u.aiOrderResponseId=null;gameData._aiMoveQueue?.delete(u);}
    wodAiRecord(owner,'front-operation-maneuver',{id:op.id,mode:op.mode,troops:army.length,enemy:contacts.length});
}

function wodAiFrontEligibility(owner,plan) {
    const now=wodAiOperationTime(),defense=gameData._aiDefenseByOwner?.[owner];
    return (u,continuing=false)=>{
        const base=plan.jobs.find(j=>j.id===plan.unitJob[u.uid]),response=defense?.jobs.find(j=>j.id===defense.unitJob[u.uid]);
        const pressure=continuing&&wodAiUnitAssaultBudget(u,wodAiFrontOffensiveJob(u,plan,response));
        return isLandArmyUnit(u)&&u.type!=='marine'&&!u._navalLanded&&!u.boardTransportUid&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&u.hp>u.maxHp*(pressure?(u.isGeneral?.52:.35):continuing?.45:.62)&&
            !base?.city&&!base?.fort&&!['scout','support'].includes(base?.kind)&&!wodAiFrontCritical(response)&&!(response&&['hold','reserve'].includes(base?.kind))&&
            !(u._navalAssaultUntil>now)&&!wodAiCorridorWithdrawal(u)&&wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city;
    };
}

function wodAiFrontProgress(owner,op,army,known) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,goal=op.advanceGoal||op.goal;
    if(op.frontageTask?.role==='pin'&&op.frontageTask.until>now)return false;
    if(op.effectCheckAt!=null&&now-op.effectCheckAt<2500)return false;op.effectCheckAt=now;
    if(army.length<3)return false;
    // Tactical painting is useful, but cannot indefinitely hide a stalled
    // town assault. Track real approach, urban cells and casualties separately.
    const strategic=op.strategicGoal;
    if(strategic&&wodIsHostileOwner(strategic.owner,owner)){
        const distance=army.map(u=>Math.hypot(u.x-strategic.x,u.y-strategic.y)).sort((a,b)=>a-b)[Math.floor(army.length/2)];
        const urban=strategic.id?getCityUrbanTerrainHexes(strategic).filter(h=>wodIsFriendlyOwner(h.owner,owner)).length:0;
        const kills=army.reduce((n,u)=>n+(u.kills||0),0),watch=op.strategicWatch;
        if(!watch||watch.key!==(strategic.id||getHexKey(strategic))||distance<watch.distance-hr*2||urban>watch.urban)
            op.strategicWatch={key:strategic.id||getHexKey(strategic),at:now,distance,urban,kills};
        else if(now-watch.at>60000&&op.phase==='advance'&&!op.joint){
            op.anchor=getNearestHexToPoint(army[0].x,army[0].y);op.goal=strategic;op.advanceGoal=strategic;op.march=null;
            op.jobs=[{id:op.id+'-objective-'+Math.floor(now),kind:'main',role:'breakthrough',response:true,members:op.members.slice(),frontOperation:op,holdHex:op.anchor,bound:0}];
            for(const u of army){u.aiOrderUntil=0;u.aiFrontBound=null;gameData._aiMoveQueue?.delete(u);}
            watch.at=now;op.effect=null;op.commandDecision=null;op.objectiveDriveUntil=now+30000;
            wodAiRecord(owner,'strategic-progress-replan',{job:op.id,target:watch.key,reason:'capture-objective'});
            return false;
        }
        // The 30s tile watchdog must not cancel a 60s town campaign first.
        // Contact strength and real corridor emergencies still decide whether
        // this force advances or regroups around that objective.
        if(strategic.id&&op.phase==='advance'&&now-op.strategicWatch.at<=60000)return false;
    }
    const keys=op.observedGround||=(new Map());let gains=0;
    for(const u of army)for(const p of getHexesInRadius(getNearestHexToPoint(u.x,u.y).q,getNearestHexToPoint(u.x,u.y).r,3)){
        const h=gameData.hexes[p.q+','+p.r],key=h&&getHexKey(h);if(!h||isWaterHex(h))continue;
        if(keys.has(key)&&!wodIsFriendlyOwner(keys.get(key),owner)&&wodIsFriendlyOwner(h.owner,owner))gains++;
        if(keys.has(key)||keys.size<768)keys.set(key,h.owner);
    }
    const distance=army.map(u=>Math.hypot(u.x-goal.x,u.y-goal.y)).sort((a,b)=>a-b).slice(0,Math.max(1,Math.ceil(army.length*.6))).reduce((a,b)=>a+b,0)/Math.ceil(army.length*.6);
    const kills=army.reduce((n,u)=>n+(u.kills||0),0),bound=op.jobs.reduce((n,j)=>n+(j.cursor||0),0),old=op.effect;
    if(!old||old.goal!==(goal.id||getHexKey(goal))||gains||kills>old.kills+.1||bound>old.bound||distance<old.distance-hr*1.5){
        op.effect={goal:goal.id||getHexKey(goal),at:now,distance,kills,bound};return false;
    }
    const emergency=army.some(u=>wodAiFrontCritical(gameData._aiDefenseByOwner?.[owner]?.jobs.find(j=>j.id===gameData._aiDefenseByOwner[owner].unitJob[u.uid])));
    if(emergency){old.at=now;return false;}
    if(now-old.at<(op.phase==='gather'?35000:30000))return false;
    const strategy=wodAiBattlePlan(owner),key=goal.id||getHexKey(goal),prior=strategy.failures[key];
    strategy.failures[key]={at:now,count:(prior?.count||0)+1};
    const seed=army.filter(u=>wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city)
        .sort((a,b)=>army.filter(u=>Math.hypot(u.x-b.x,u.y-b.y)<hr*7).length-army.filter(u=>Math.hypot(u.x-a.x,u.y-a.y)<hr*7).length)[0];
    if(!seed){op.until=now;return true;}
    const choices=buildAiFrontlineSectors(owner,24).filter(s=>s.attackHex&&(!op.frontOwner||s.attackHex.owner===op.frontOwner)&&
        Math.hypot(s.holdHex.x-seed.x,s.holdHex.y-seed.y)<hr*22&&wodAiCanReach(seed,s.attackHex)&&
        !(strategy.failures[getHexKey(s.attackHex)]?.at>now-90000)&&wodCurrentSupplyComponent(s.holdHex,owner).city&&
        wodAiForecast(owner,army,known.filter(e=>Math.hypot(e.x-s.attackHex.x,e.y-s.attackHex.y)<hr*8)).ratio>=wodAiAttackThreshold(owner));
    choices.sort((a,b)=>Math.hypot(a.holdHex.x-seed.x,a.holdHex.y-seed.y)-Math.hypot(b.holdHex.x-seed.x,b.holdHex.y-seed.y));
    op.stallReplans=(op.stallReplans||0)+1;
    if(choices[0]){
        op.anchor=getNearestHexToPoint(seed.x,seed.y);op.goal=choices[0].attackHex;op.advanceGoal=op.goal;op.hostile=op.goal.owner;
        op.phase='gather';op.mode='breakthrough';op.march=null;op.effect=null;op.initialN=army.length;op.until=now+120000;
        op.jobs=[{id:op.id+'-replan-'+op.stallReplans,kind:'main',role:'breakthrough',response:true,members:army.map(u=>u.uid),frontOperation:op,holdHex:op.anchor,bound:0}];
    }else{
        op.until=now;
        for(const j of gameData.aiTaskForces?.[owner]?.jobs||[])if(j.members.some(id=>op.members.includes(id))&&['main','armor','raid'].includes(j.kind)){
            j.waitingForStrength=true;j.phase='assemble';j.operationState=null;j.stalledAt=now;
        }
    }
    for(const u of army){u.aiOrderUntil=0;u.aiOrderResponseId='progress-replan';gameData._aiMoveQueue?.delete(u);}
    wodAiRecord(owner,'front-progress-replan',{job:op.id,from:key,target:choices[0]&&getHexKey(choices[0].attackHex),reason:choices[0]?'new-approach':'reinforce-or-defend'});
    return !choices[0];
}

// A command lease is not useful work. Recover healthy field formations which
// reached a hold or lost their next order, without recalling marching troops,
// medical patients, town guards, active fixing forces or a prepared ambush.
function wodAiMaintainGroundWork(owner,plan,ready) {
    if(wodMpIsHumanOwner(owner))return;
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    if(plan.workCheckedAt!=null&&now-plan.workCheckedAt<4000)return;plan.workCheckedAt=now;
    const defense=gameData._aiDefenseByOwner?.[owner],ops=wodAiActiveFrontOperations(owner),handled=new Set();
    const field=ready.filter(u=>isLandArmyUnit(u)&&u.type!=='marine'&&!u.boardTransportUid&&u.hp>u.maxHp*.65&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&!(u._navalAssaultUntil>now));
    for(const u of field){
        const base=plan.jobs.find(j=>j.id===plan.unitJob[u.uid]),response=defense?.jobs.find(j=>j.id===defense.unitJob[u.uid]);
        const op=ops.find(o=>o.members.includes(u.uid)),at=getNearestHexToPoint(u.x,u.y),watch=u._aiFieldWork;
        const end=u.orderTarget||u.target?.finalTarget||u.target;
        const task=op?.frontageTask,fixing=task?.role==='pin'&&task.until>now&&ops.some(peer=>peer.frontageTask?.campaign===task.campaign&&peer.frontageTask?.role==='flank'&&
            peer.jobs.some(j=>j.route&&!j.closed)&&field.some(m=>peer.members.includes(m.uid)&&(m._combatEngaged||m.target&&m._aiFieldWork&&now-m._aiFieldWork.at<20000)));
        const assetDuty=base?.city&&wodIsFriendlyOwner(base.city.owner,owner)||base?.fort&&wodIsFriendlyOwner(base.fort.owner,owner);
        const protectedDuty=assetDuty||base?.kind==='support'&&!!end||wodAiFrontCritical(response)&&!!end||u._combatEngaged||
            op?.ambush||op?.phase==='gather'&&now-op.at<45000||fixing;
        const progressing=watch&&Math.hypot(u.x-watch.x,u.y-watch.y)>hr*.6;
        if(!watch||protectedDuty||progressing||!at||!wodCurrentSupplyComponent(at,owner).city){u._aiFieldWork={x:u.x,y:u.y,at:now};continue;}
        if(now-watch.at<30000)continue;
        // Give a lost/stale path one retry before changing its mission. This
        // never resets the progress clock just because a command was issued.
        if(end&&Math.hypot(end.x-u.x,end.y-u.y)>hr*2&&now-watch.at<45000){
            if(!watch.retried){watch.retried=true;u.aiOrderUntil=0;u._aiMoveIntent=null;gameData._aiMoveQueue?.delete(u);}continue;
        }
        if(now-watch.at<45000||handled.has(op||base))continue;
        if(base?.kind==='scout'){
            // A scout with no reachable information frontier rejoins combat.
            // The normal allocator can still keep another useful scout.
            base.kind='main';base.role='main';base.scoutHex=null;u._aiScoutUntil=0;
        }
        const core=(op?field.filter(m=>op.members.includes(m.uid)):field.filter(m=>plan.unitJob[m.uid]===base?.id))
            .filter(m=>!wodAiFrontCritical(defense?.jobs.find(j=>j.id===defense.unitJob[m.uid]))&&Math.hypot(m.x-u.x,m.y-u.y)<hr*12);
        if(core.some(m=>m._combatEngaged)||core.filter(m=>m.target&&m._aiFieldWork&&now-m._aiFieldWork.at<12000).length>=Math.max(2,Math.ceil(core.length*.65)))continue;
        handled.add(op||base);
        if(op&&core.length>=3){
            op.nextCheckAt=null;
            if(wodAiContinueFrontOffensive(owner,op,core)){
                op.joint=null;op.supporting=null;op.frontageTask=null;op.objectiveDriveUntil=now+15000;
                for(const m of core){m._aiFieldWork={x:m.x,y:m.y,at:now};m._trafficYield=null;m._aiMoveIntent=null;m.aiOrderUntil=0;}
                wodAiRecord(owner,'field-mission-recovered',{job:op.id,troops:core.length,reason:'idle-cohort',target:(op.advanceGoal||op.goal).id||getHexKey(op.advanceGoal||op.goal)});continue;
            }
            // Release a dead commitment so other slots can use its survivors.
            // Actual guards and patients never enter this recovery path.
            op.until=now;op.joint=null;op.supporting=null;op.frontageTask=null;
        }
        if(base&&!base.city&&!base.fort){base.operationState=null;base.phase='assemble';base.stage='assemble';base.stalledAt=now;}
        for(const m of core){m._aiFieldWork={x:m.x,y:m.y,at:now};m._trafficYield=null;m._aiMission=null;m._aiMoveIntent=null;m.aiOrderUntil=0;gameData._aiMoveQueue?.delete(m);}
        wodAiRecord(owner,'field-mission-released',{job:op?.id||base?.id,troops:core.length,reason:'no-useful-order'});
    }
}

// Combine only depleted cohorts. Healthy full squads retain their independent
// fronts; unavailable patients retain medical orders outside the new roster.
function wodAiRegroupDepleted(owner,plan,ready,frontOwner=0) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    const ops=wodAiActiveFrontOperations(owner).filter(o=>(o.frontOwner||0)===frontOwner&&!o.joint&&!o.ambush&&!o.supporting);
    for(const op of ops){
        const army=wodAiSquadAvailable(owner,op);
        if(army.length>=3||!army.length){op.depletedAt=null;continue;}
        op.depletedAt??=now;if(now-op.depletedAt<8000)continue;
        const other=ops.filter(o=>o!==op&&o.until>now&&o.hostile===op.hostile).map(o=>({o,army:wodAiSquadAvailable(owner,o)}))
            .filter(p=>p.army.length>0&&p.army.length+army.length<=8&&army.every(u=>wodAiCanReach(u,p.o.anchor)&&Math.hypot(u.x-p.o.anchor.x,u.y-p.o.anchor.y)<hr*24))
            .sort((a,b)=>Math.hypot(a.o.anchor.x-op.anchor.x,a.o.anchor.y-op.anchor.y)-Math.hypot(b.o.anchor.x-op.anchor.x,b.o.anchor.y-op.anchor.y))[0];
        if(!other||other.army.length+army.length<3)continue;
        const target=other.o,job=target.jobs.find(j=>!j.route)||target.jobs[0];if(!job)continue;
        target.members=other.army.map(u=>u.uid);for(const j of target.jobs)j.members=j.members.filter(id=>target.members.includes(id));
        for(const u of army){target.members.push(u.uid);job.members.push(u.uid);u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}
        target.capacity=Math.max(target.capacity||3,target.members.length);target.depletedAt=null;target.commandDecision=null;target.phase='gather';
        op.until=now;for(const [key,value]of Object.entries(gameData._aiFrontOffensives||{}))if(value===op){delete gameData._aiFrontOffensives[key];delete gameData._aiFrontOffensiveChecks?.[key];}
        wodAiRecord(owner,'depleted-cohorts-combined',{job:target.id,from:op.id,troops:target.members.length});
    }
    // Three healthy regiments are not necessarily a viable assault. Two
    // neighboring weak squads can otherwise reserve each other's replacements
    // forever while both wait for the strength already present beside them.
    const waiting=ops.filter(o=>o.until>now&&o.phase==='gather'&&o.commandWeakSince!=null&&now-o.commandWeakSince>=12000&&
        !o.jobs.some(j=>j.route)&&!o.frontageTask&&!o.joint&&!o.supporting&&!o.ambush);
    for(const target of waiting){
        const army=wodAiSquadAvailable(owner,target);if(army.length<3||army.some(u=>u._combatEngaged))continue;
        const goal=target.advanceGoal||target.goal,foes=wodAiThreats(owner,false).filter(e=>e.owner===target.hostile&&Math.hypot(e.x-goal.x,e.y-goal.y)<hr*10);
        if(!foes.length||wodAiForecast(owner,army,foes).ratio>=wodAiAttackThreshold(owner))continue;
        const donor=waiting.filter(o=>o!==target&&o.until>now&&o.hostile===target.hostile).map(o=>({o,army:wodAiSquadAvailable(owner,o)}))
            .filter(p=>p.army.length>=3&&army.length+p.army.length<=8&&!p.army.some(u=>u._combatEngaged)&&
                p.army.every(u=>wodAiCanReach(u,goal)&&wodAiArrivalSeconds(u,target.anchor,hr*4,60)<=60)&&
                wodAiForecast(owner,[...army,...p.army],foes).ratio>=wodAiAttackThreshold(owner))
            .sort((a,b)=>Math.hypot(a.o.anchor.x-target.anchor.x,a.o.anchor.y-target.anchor.y)-Math.hypot(b.o.anchor.x-target.anchor.x,b.o.anchor.y-target.anchor.y))[0];
        if(!donor)continue;
        const members=[...army,...donor.army],job=target.jobs[0];if(!job)continue;
        target.members=members.map(u=>u.uid);job.members=target.members.slice();for(const j of target.jobs.slice(1))j.members=[];
        target.capacity=members.length;target.commandDecision=null;target.commandWeakSince=null;target.effect=null;target.until=Math.max(target.until,now+90000);
        donor.o.until=now;donor.o.members=[];for(const j of donor.o.jobs)j.members=[];
        for(const u of members){u.aiOrderUntil=0;u._aiMoveIntent=null;gameData._aiMoveQueue?.delete(u);}
        wodAiRecord(owner,'stalled-cohorts-combined',{job:target.id,from:donor.o.id,troops:members.length,enemy:foes.length});
    }
}

function wodAiPlanFrontOffensive(owner,plan,ready,frontOwner=0) {
    if(!frontOwner)wodAiMaintainGroundWork(owner,plan,ready);
    if(!frontOwner&&(plan.fronts?.length||0)>1){
        const ops=plan.fronts.map(f=>wodAiPlanFrontOffensive(owner,plan,ready.filter(u=>wodAiFrontOwner(u)===f.enemy),f.enemy)).filter(Boolean);
        gameData._aiFrontOffensives[owner]=ops[0]||null;return ops[0]||null;
    }
    const base=u=>plan.jobs.find(j=>j.id===plan.unitJob[u.uid]);
    // Each enemy front gets bounded forces with disjoint rosters. Preserve
    // existing commitments when strength changes rather than recalling troops.
    if(frontOwner)for(const [key,op]of Object.entries(gameData._aiFrontOffensives||{}))if((key===String(owner)||key.startsWith(owner+':'))&&op?.hexes===gameData.hexes&&!op.frontOwner&&op.hostile===frontOwner){op.frontOwner=frontOwner;gameData._aiFrontOffensives[owner+':'+frontOwner+(op.slot?':group-'+op.slot:'')]=op;if(key!==String(owner))delete gameData._aiFrontOffensives[key];}
    // Release broken formations before any other slot reserves their troops.
    // Otherwise two-regiment remnants can mutually lock out reinforcements
    // while the three-regiment advance rule correctly keeps them stationary.
    const eligible=wodAiFrontEligibility(owner,plan),byId=new Map(ready.map(u=>[u.uid,u]));
    wodAiRegroupDepleted(owner,plan,ready,frontOwner);
    for(const op of wodAiActiveFrontOperations(owner).filter(o=>(o.frontOwner||0)===frontOwner)){
        if(op.rosterCheckAt!=null&&wodAiOperationTime()-op.rosterCheckAt<2500)continue;
        op.rosterCheckAt=wodAiOperationTime();
        const roster=wodAiSquadRoster(owner,op);
        if(roster.length>=3||wodAiCanFinishAssault(owner,op,roster)){op.until=Math.max(op.until,wodAiOperationTime()+45000);continue;}
        op.until=wodAiOperationTime();
        for(const [key,value]of Object.entries(gameData._aiFrontOffensives))if(value===op){delete gameData._aiFrontOffensives[key];delete gameData._aiFrontOffensiveChecks?.[key];}
        for(const id of op.members){const u=byId.get(id);if(u){u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}}
        wodAiRecord(owner,'front-operation-regroup',{id:op.id,troops:op.members.length});
    }
    const combat=ready.filter(u=>isLandArmyUnit(u)&&u.type!=='marine'&&!u._navalLanded&&!u.boardTransportUid&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&u.hp>u.maxHp*.62&&!base(u)?.city&&!base(u)?.fort&&!['scout','support','reserve'].includes(base(u)?.kind));
    const count=Math.min(16,Math.max(1,Math.ceil(combat.length/8))),capacity=Math.min(8,Math.max(3,Math.ceil(combat.length/count)));
    const old=wodAiActiveFrontOperations(owner).filter(o=>(o.frontOwner||0)===frontOwner),slots=[...new Set([...Array(count).keys(),...old.map(o=>o.slot||0)])].sort((a,b)=>a-b),ops=[];
    for(const slot of slots){
        const reserved=new Set(wodAiActiveFrontOperations(owner).filter(o=>(o.frontOwner||0)!==frontOwner||(o.slot||0)!==slot).flatMap(o=>o.members));
        // A pincer needs two complete wings as well as a pin and bait. Keep a
        // viable lead cohort before forming its smaller supporting force.
        const slotCapacity=slot===0&&combat.length>=8&&combat.length<=12?(combat.length===8?8:6):capacity;
        const op=wodAiPlanFrontOperation(owner,plan,ready.filter(u=>!reserved.has(u.uid)),frontOwner,slot,slotCapacity,ready);if(op)ops.push(op);
    }
    // A final one- or two-regiment remainder cannot form its own assault.
    // Attach it to a nearby viable cohort instead of leaving it on a solo job.
    const committed=new Set(wodAiActiveFrontOperations(owner).flatMap(o=>o.members));
    for(const u of ready.filter(u=>!committed.has(u.uid)&&eligible(u)&&['main','armor','raid'].includes(base(u)?.kind))){
        const candidates=ops.filter(o=>!o.ambush&&o.members.length<8&&o.members.length<(o.capacity||6)+2&&
            Math.hypot(u.x-o.anchor.x,u.y-o.anchor.y)<(gameData.hexRadius||20)*24&&wodAiCanReach(u,o.goal));
        candidates.sort((a,b)=>Math.hypot(u.x-a.anchor.x,u.y-a.anchor.y)-Math.hypot(u.x-b.anchor.x,u.y-b.anchor.y));
        const op=candidates[0],job=op?.jobs.filter(j=>!j.route).sort((a,b)=>a.members.length-b.members.length)[0];if(!job)continue;
        op.members.push(u.uid);job.members.push(u.uid);op.capacity=Math.max(op.capacity||6,op.members.length);op.commandDecision=null;
        committed.add(u.uid);u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);
        wodAiRecord(owner,'front-cohort-reinforced',{job:op.id,unit:u.uid,troops:op.members.length});
    }
    wodAiCoordinateFrontage(owner,plan,ready);
    wodAiCoordinateJointAssaults(owner,plan);
    wodAiCoordinateFrontSupport(owner,plan,ready);
    return ops[0]||null;
}

function wodAiPlanFrontOperation(owner,plan,ready,frontOwner=0,slot=0,capacity=8,context=ready) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    gameData._aiFrontOffensives||={};gameData._aiFrontOffensiveChecks||={};
    const baseKey=frontOwner?owner+':'+frontOwner:owner,key=slot?baseKey+':group-'+slot:baseKey,previous=gameData._aiFrontOffensives[key],check=gameData._aiFrontOffensiveChecks[key];
    if(check?.hexes===gameData.hexes&&now-check.at<2500)return previous;
    gameData._aiFrontOffensiveChecks[key]={hexes:gameData.hexes,at:now};
    const base=u=>plan.jobs.find(j=>j.id===plan.unitJob[u.uid]),eligible=wodAiFrontEligibility(owner,plan);
    const pool=ready.filter(u=>eligible(u)),known=wodAiThreats(owner).filter(e=>!wodIsNavalUnit(e)&&e.type!=='convoy');
    wodAiObservedApproach(owner,known,null);
    if(previous?.hexes===gameData.hexes&&previous.until>now){
        const army=ready.filter(u=>previous.members.includes(u.uid)&&eligible(u,true)),foes=known.filter(e=>Math.hypot(e.x-previous.goal.x,e.y-previous.goal.y)<hr*9||army.some(u=>Math.hypot(e.x-u.x,e.y-u.y)<hr*6));
        const survivors=wodAiSquadRoster(owner,previous);
        if(previous.ambush)wodAiStepAmbush(owner,previous,army);else wodAiTryAmbush(owner,previous,army,known);
        if(previous.ambush)return previous;
        if(!previous.supporting){
            wodAiExploitClearedFront(owner,previous,army);
            if(wodAiFrontProgress(owner,previous,army,known))return null;
        }
        const finishing=wodAiCanFinishAssault(owner,previous,army),lost=survivors.length<3&&!finishing;
        // Loans and medical rotations suspend orders; they do not terminate a
        // squad or release its surviving members to another operation.
        if(!lost&&army.length<3&&!finishing){previous.phase='gather';previous.until=Math.max(previous.until,now+45000);return previous;}
        if(!lost&&previous.phase==='consolidate'){
            if(now-(previous.consolidateAt??=now)>=3000)wodAiContinueFrontOffensive(owner,previous,army);
            return previous;
        }
        const verdict=wodAiCommandDecision(owner,previous);
        if(!lost){
            const goal=previous.advanceGoal||previous.goal,closest=army.length?Math.min(...army.map(u=>Math.hypot(u.x-goal.x,u.y-goal.y))):Infinity,key=goal.id||getHexKey(goal);
            const progress=previous.progress;
            if(!progress||progress.key!==key||closest<progress.distance-hr*.75){previous.progress={key,distance:closest,at:now};previous.until=Math.max(previous.until,now+45000);}
            // Feed this operation from the rear without moving its original
            // rendezvous or recalling the vanguard to collect new recruits.
            if(!(previous.frontageTask?.until>now)&&!previous.supporting&&!previous.joint&&verdict.phase==='advance')wodAiReconsiderFrontManeuver(owner,previous,army,known,context);
            previous.capacity=capacity;
            if(previous.members.length<capacity)for(const u of pool){
                if(previous.members.includes(u.uid)||base(u)?.kind==='reserve'||Math.hypot(u.x-previous.anchor.x,u.y-previous.anchor.y)>hr*30)continue;
                const other=known.some(e=>e.owner!==previous.hostile&&Math.hypot(e.x-u.x,e.y-u.y)<hr*9);
                if(other||!wodAiCanReach(u,previous.goal))continue;
                previous.members.push(u.uid);const j=previous.jobs.slice().sort((a,b)=>a.members.length-b.members.length)[0];j.members.push(u.uid);u.aiOrderUntil=0;
                if(previous.members.length>=capacity)break;
            }
            return previous;
        }
        previous.until=now;wodAiRecord(owner,'front-operation-end',{reason:'casualties',id:previous.id});
        return null;
    }
    if(pool.length<3)return null;
    // Retain a reserve when there is enough strength for a viable attack.
    // Reserving the third available soldier deadlocked an otherwise ready
    // cohort forever. Garrisons and urgent defense loans are already excluded.
    const reserve=pool.find(u=>base(u)?.kind==='reserve');if(reserve&&pool.length>3)pool.splice(pool.indexOf(reserve),1);
    if(pool.length<3)return null;
    const explored=wodFogActive()?wodFogFactionIntel(owner).explored:null,choices=[],sectors=(plan.sectors||[]).slice(),engaged=wodAiEngagedContacts(owner,known);
    // Nearby forces use different approach lanes even when this front has
    // only one strategic town. Terrain and fog still validate every lane.
    // A broad front already provides enough lanes; only supplement sparse
    // sectors so every army does not rescore dozens of redundant approaches.
    for(const s of sectors.length<8?sectors.slice(0,2):[])for(const offset of [-12,-8,-4,4,8,12]){
        if(!s.holdHex||!s.attackHex)continue;const dx=s.attackHex.x-s.holdHex.x,dy=s.attackHex.y-s.holdHex.y,len=Math.hypot(dx,dy)||1;
        sectors.push({holdHex:getNearestHexToPoint(s.holdHex.x-dy/len*hr*offset,s.holdHex.y+dx/len*hr*offset),attackHex:getNearestHexToPoint(s.attackHex.x-dy/len*hr*offset,s.attackHex.y+dx/len*hr*offset),enemyOwner:s.enemyOwner});
    }
    const approaching=known.filter(e=>!e._intelMemory&&!e.retreating&&!e.moraleBroken&&pool.length>=6&&pool.some(u=>Math.hypot(e.x-u.x,e.y-u.y)<hr*12&&wodAiObservedApproach(owner,[e],u)>0)).slice(0,16);
    const otherOps=wodAiActiveFrontOperations(owner).filter(o=>o!==previous&&(o.frontOwner||0)===frontOwner),handled=new Set();
    for(const enemy of [...engaged,...approaching]){
        if(handled.has(enemy.uid)||frontOwner&&enemy.owner!==frontOwner)continue;
        const contacts=known.filter(e=>!e._intelMemory&&e.owner===enemy.owner&&Math.hypot(e.x-enemy.x,e.y-enemy.y)<hr*8);for(const e of contacts)handled.add(e.uid);
        const enemyHex=getNearestHexToPoint(enemy.x,enemy.y),lead=pool.filter(u=>wodAiCanReach(u,enemyHex)).sort((a,b)=>Math.hypot(a.x-enemy.x,a.y-enemy.y)-Math.hypot(b.x-enemy.x,b.y-enemy.y))[0];
        const anchor=lead&&getNearestHexToPoint(lead.x,lead.y);if(!anchor||!wodCurrentSupplyComponent(anchor,owner).city)continue;
        sectors.push({holdHex:anchor,attackHex:getNearestHexToPoint(enemy.x,enemy.y),enemyOwner:enemy.owner,
            engagedIds:engaged.includes(enemy)?contacts.map(e=>e.uid):null,approachIds:approaching.includes(enemy)?contacts.map(e=>e.uid):null});
    }
    for(const sector of sectors){
        const h=sector.attackHex,a=sector.holdHex;
        const hostile=sector.enemyOwner||h?.owner;
        if(!h||!a||isWaterHex(h)||frontOwner&&hostile!==frontOwner||!wodIsHostileOwner(hostile,owner)||explored&&!explored.has(getHexKey(h))||!wodCurrentSupplyComponent(a,owner).city)continue;
        const army=pool.filter(u=>Math.hypot(u.x-a.x,u.y-a.y)<hr*32&&wodAiCanReach(u,h)&&
            !known.some(e=>e.owner!==hostile&&Math.hypot(e.x-u.x,e.y-u.y)<hr*8)).sort((u,v)=>Math.hypot(u.x-a.x,u.y-a.y)-Math.hypot(v.x-a.x,v.y-a.y)).slice(0,capacity);
        if(army.length<3)continue;
        const foes=known.filter(e=>Math.hypot(e.x-h.x,e.y-h.y)<hr*8),support=wodAiNearbyBattleSupport(owner,army,context,foes),ratio=wodAiForecast(owner,support,foes).ratio;
        if(ratio<wodAiObjectiveRisk(owner,h).launch)continue;
        const near=army.filter(u=>Math.hypot(u.x-a.x,u.y-a.y)<hr*10).length;
        const separation=otherOps.reduce((n,o)=>n+Math.max(0,1-Math.hypot(o.anchor.x-a.x,o.anchor.y-a.y)/(hr*8))*30,0)+wodAiFrontTargetPenalty(owner,null,h)/hr*5;
        const remembered=wodAiBattlePlan(owner).failures[getHexKey(h)],failed=remembered?.at>now-90000?remembered:null;
        const score=near*3+Math.min(4,ratio)*4-army.reduce((n,u)=>n+Math.hypot(u.x-a.x,u.y-a.y)/hr,0)/army.length*.4-foes.length*.6-separation+(sector.engagedIds?.length?30:0)+(sector.approachIds?.length?24:0)-(failed?Math.min(60,failed.count*20):0);
        choices.push({sector,army,foes,ratio,score,support});
    }
    // Prefer a real double envelopment when a gathered army can spare two
    // viable wings. Selecting only the emptiest cell always walked around the
    // contact without ever planning to close behind it.
    for(const c of choices.slice().sort((a,b)=>b.army.length-a.army.length).slice(0,6)){
        if(c.army.length<6)continue;
        const center=c.foes.find(e=>!e._intelMemory&&e.owner===(c.sector.enemyOwner||c.sector.attackHex.owner));if(!center)continue;
        const foes=known.filter(e=>!e._intelMemory&&e.owner===center.owner&&Math.hypot(e.x-center.x,e.y-center.y)<hr*8);
        const front=choices.filter(p=>(p.sector.enemyOwner||p.sector.attackHex.owner)===center.owner).sort((a,b)=>Math.hypot(a.sector.holdHex.x-center.x,a.sector.holdHex.y-center.y)-Math.hypot(b.sector.holdHex.x-center.x,b.sector.holdHex.y-center.y))[0];
        const envelope=wodAiFrontEnvelopment(owner,c.army,foes,front.sector.holdHex,c.support);
        if(envelope){c.sector=front.sector;c.foes=foes;c.envelope=envelope;c.score+=18+Math.min(12,foes.length);break;}
    }
    choices.sort((a,b)=>b.score-a.score);const choice=choices[0];if(!choice)return null;
    const {sector,army}=choice,anchor=sector.holdHex;
    const hostile=sector.enemyOwner||sector.attackHex.owner,foes=choice.foes.filter(e=>!e._intelMemory&&e.owner===hostile);
    const envelope=wodAiAvailableFrontWings(owner,null,choice.envelope||wodAiFrontEnvelopment(owner,army,foes,anchor,choice.support),sector.attackHex);
    const wingsN=envelope?.routes.filter(Boolean).length||0;
    const id='front-'+owner+'-'+frontOwner+'-'+slot,op={id,slot,frontOwner,hexes:gameData.hexes,at:now,until:now+180000,anchor,goal:sector.attackHex,hostile,members:army.map(u=>u.uid),initialN:army.length,capacity,phase:'gather',mode:wingsN===2?'envelopment':wingsN===1?'flank':'breakthrough',probe:!envelope&&choice.foes.length>0&&choice.ratio<1.12,jobs:[],bound:0};
    const add=(role,members,route)=>op.jobs.push({id:id+'-'+role,kind:role==='pin'?'hold':'main',role,response:true,members:members.map(u=>u.uid),frontOperation:op,holdHex:anchor,route,cursor:0,bound:0});
    if(wodAiTryAmbush(owner,op,army,known)){
        // Its bait and staging jobs replace the ordinary opening maneuver.
    }else if(envelope){
        wodAiAssignFrontWings(op,army,envelope,anchor);
    }else add('breakthrough',army);
    gameData._aiFrontOffensives[key]=op;
    for(const u of army){u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}
    wodAiRecord(owner,'front-operation-start',{id,mode:op.mode,troops:army.length,enemy:foes.length,ratio:Math.round(choice.ratio*100)/100,target:getHexKey(op.goal)});
    return op;
}

function wodAiIssueFrontOffensive(unit,job) {
    const op=job.frontOperation,now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    const army=wodAiSquadAvailable(unit.owner,op);
    if(!army.length)return false;
    if(op.ambush)return wodAiIssueAmbush(unit,job,army);
    if(job.role==='bait-relief'&&wodAiRelieveAmbushBait(unit,job))return true;
    const decision=wodAiCommandDecision(unit.owner,op);
    if(decision.phase==='recover'){
        if(wodAiTacticalFallback(unit,job))return true;
        // A joint force's old rally can be inside the endangered salient.
        // Members already on its safe side cover the withdrawal from there,
        // rather than marching forward into the pocket to reach that rally.
        const supplyRecovery=decision.reason==='corridor-cohort-withdrawal';
        const safe=supplyRecovery?(wodAiSupplyRetreatHop(unit,gameData._aiDefenseByOwner?.[unit.owner])||getNearestHexToPoint(unit.x,unit.y)):
            wodAiDefendStandHex(unit.owner,op.joint?.anchor||op.anchor,unit);
        if(safe){const moved=wodAiMoveUnitTowardHex(unit,safe,true,.15);if(moved)wodAiStampOrder(unit,true,safe,3500);return true;}
    }
    if(job._peerSupport?.until>now){
        if(wodAiTacticalFallback(unit,job))return true;
        if(wodAiIssueGroupCombatSupport(unit,job))return true;
        // If firing positions are occupied, approach the supported battle
        // instead of switching back to a different strategic destination.
        const contact=gameData.hexes[job._peerSupport.target];
        if(contact&&!isWaterHex(contact)&&!unit._combatEngaged){
            const target=wodAiAdvanceHex(unit,contact,army);
            if(target&&wodAiMoveUnitTowardHex(unit,target,false,.08)){
                wodAiStampOrder(unit,false,target,2200);unit.aiOrderPhase=op.phase;unit.aiOrderResponseId=job.id;return true;
            }
        }
        return true;
    }
    if(wodAiExploitClearedFront(unit.owner,op,army)){
        const next=op.jobs.find(j=>j.members.includes(unit.uid));return next?wodAiIssueFrontOffensive(unit,next):false;
    }
    if(op.phase==='consolidate'){
        if(now-(op.consolidateAt??now)>=3000&&wodAiContinueFrontOffensive(unit.owner,op,army)){
            const next=op.jobs.find(j=>j.members.includes(unit.uid));return next?wodAiIssueFrontOffensive(unit,next):false;
        }
        const here=getNearestHexToPoint(unit.x,unit.y);
        if(here&&wodIsFriendlyOwner(here.owner,unit.owner)){wodAiStampOrder(unit,true,here,3000);unit.aiOrderPhase=op.phase;unit.aiFrontBound=job.bound;return true;}
    }
    const members=army.filter(u=>job.members.includes(u.uid));
    const objectiveDrive=op.objectiveDriveUntil>now&&op.strategicGoal&&wodIsHostileOwner(op.strategicGoal.owner,unit.owner)&&decision.phase==='advance';
    const fixing=job.role==='pin'&&op.phase==='advance'&&(op.joint||op.jobs.some(j=>j.route&&j.cursor>=2))&&unit.hp>unit.maxHp*(unit.isGeneral?.85:.72)&&
        !wodAiCorridorWithdrawal(unit)&&(op.joint?decision.ratio>=wodAiAttackThreshold(unit.owner,true):wodAiLocalSituation(unit).forecast.ratio>=.72);
    if(!fixing&&wodAiTacticalFallback(unit,job))return true;
    if(!objectiveDrive&&wodAiIssueGroupCombatSupport(unit,job))return true;
    if(!objectiveDrive&&op.phase==='advance'&&!job.route&&wodAiIssuePursuit(unit,job,members))return true;
    if(op.phase==='advance'&&job.role==='breakthrough'&&decision.arrivals.filter(a=>a.seconds<=8).length<3&&wodAiHoldUnsupportedVanguard(unit,job,members,op.advanceGoal||op.goal))return true;
    let target,holding=false;
    if(op.phase==='gather'){
        const staging=op.joint?gameData.entities.filter(u=>decision.ids.includes(u.uid)):army;
        target=wodAiFormationSlot(unit,job,op.anchor,op.goal,staging);holding=true;
    }else if(job.route){
        // Each wing advances together through a fixed chain. Behind-the-line
        // recruits catch up; they never move its current bound backwards.
        while(job.cursor<job.route.length-1){
            const h=gameData.hexes[job.route[job.cursor]],near=members.filter(u=>Math.hypot(u.x-h.x,u.y-h.y)<hr*Math.max(2.2,Math.sqrt(members.length)*1.05));
            const trailing=near.length>=Math.min(2,members.length)&&wodIsFriendlyOwner(h.owner,unit.owner)&&now-(job.boundAt??op.launchedAt??now)>12000;
            if(near.length<Math.max(1,Math.ceil(members.length*.6))&&!trailing)break;job.cursor++;job.bound++;job.boundAt=now;
            op.until=Math.min(op.at+360000,Math.max(op.until,now+45000));
        }
        const h=gameData.hexes[job.route[job.cursor]];
        // Preserve the supply trail; no water or hostile-corner route shortcut.
        if(job.slotBound!==job.bound){job.slotBound=job.bound;job.slots={};}
        const foes=wodAiThreats(unit.owner,false),used=new Set(Object.entries(job.slots).filter(([id])=>id!==unit.uid).map(([,k])=>k));
        const sites=getHexesInRadius(h.q,h.r,Math.max(2,Math.ceil(Math.sqrt(members.length)/1.5))).map(p=>gameData.hexes[p.q+','+p.r]).filter(p=>p&&!used.has(getHexKey(p))&&!isWaterHex(p)&&canUnitEnterHex(unit,p)&&
            !foes.some(e=>Math.hypot(e.x-p.x,e.y-p.y)<(e.range||50)+hr*.5)&&!isWorldPositionBlockedByUnits(unit,p.x,p.y));
        sites.sort((a,b)=>Math.hypot(a.x-h.x,a.y-h.y)-Math.hypot(b.x-h.x,b.y-h.y));
        target=gameData.hexes[job.slots[unit.uid]]||sites[0]||h;job.slots[unit.uid]=getHexKey(target);
        if(job.cursor===job.route.length-1&&members.filter(u=>Math.hypot(u.x-h.x,u.y-h.y)<hr*3).length>=Math.min(2,members.length)&&job.route.every(k=>wodIsFriendlyOwner(gameData.hexes[k]?.owner,unit.owner)))job.closed=true;
        if(op.jobs.filter(j=>j.route).every(j=>j.closed)){
            const contact=op.joint?.contact||op.goal;
            const active=foes.filter(e=>e.owner===op.hostile&&!e.retreating&&!e.moraleBroken&&e.hp>e.maxHp*.3&&Math.hypot(e.x-contact.x,e.y-contact.y)<hr*12);
            if(active.length){
                // Reaching the rear is the start of the closing attack, not
                // completion of the supported battle. Keep the pin's helpers.
                op.advanceGoal=contact;op.goal=contact;op.mode='breakthrough';op.march=null;op.commandDecision=null;
                for(const wing of op.jobs.filter(j=>j.route)){wing.route=null;wing.role='breakthrough';wing.closed=false;wing.bound++;wing.holdHex=getNearestHexToPoint(unit.x,unit.y);}
                for(const m of army){m.aiOrderUntil=0;m.aiFrontBound=null;gameData._aiMoveQueue?.delete(m);}
                wodAiRecord(unit.owner,'front-wings-closing',{job:op.id,enemy:active.length,troops:army.length});
            }else wodAiFinishFrontOffensive(unit.owner,op,'wings-joined');
        }
    }else if(job.role==='pin'){
        const enemies=wodAiThreats(unit.owner,false).filter(e=>e.owner===op.hostile&&Math.hypot(e.x-op.goal.x,e.y-op.goal.y)<hr*10);
        const close=enemies.slice().sort((a,b)=>Math.hypot(a.x-unit.x,a.y-unit.y)-Math.hypot(b.x-unit.x,b.y-unit.y))[0];
        const safe=!enemies.length||decision.frontagePin||(op.joint?decision.ratio:wodAiForecast(unit.owner,members,enemies).ratio)>=1;
        if(close&&(safe||fixing)){
            const at=getNearestHexToPoint(close.x,close.y),reach=wodAiOperationReach(unit),used=job._pinPoints||=( {} );
            const sites=getHexesInRadius(at.q,at.r,4).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&!isWaterHex(h)&&canUnitEnterHex(unit,h)&&reach.has(getHexKey(h))&&
                (safe||wodIsFriendlyOwner(h.owner,unit.owner))&&!isWorldPositionBlockedByUnits(unit,h.x,h.y));
            const score=h=>Math.abs(Math.hypot(h.x-close.x,h.y-close.y)-(unit.range||50)*.85)*3+Math.hypot(h.x-unit.x,h.y-unit.y)*.25+
                Object.entries(used).filter(([id,k])=>id!==unit.uid&&k===getHexKey(h)).length*hr*12+getTerrainDefenseModifier(unit,h)*hr;
            sites.sort((a,b)=>score(a)-score(b));target=sites[0];if(target)used[unit.uid]=getHexKey(target);
        }
        target||=wodAiFormationSlot(unit,job,op.anchor,op.goal,members);holding=!safe;
    }else{
        if(!objectiveDrive&&(!op.advanceStructure||!wodIsHostileOwner(op.advanceStructure.hex.owner,unit.owner))&&(op.structureCheckAt==null||now-op.structureCheckAt>=3000)){
            op.structureCheckAt=now;const structure=wodAiStructureObjective(unit.owner,members,op.advanceGoal||op.goal);
            if(structure&&wodAiFrontTargetPenalty(unit.owner,op,structure.hex)<hr*5){
                op.resumeGoal=op.advanceGoal;op.advanceGoal=structure.hex;op.advanceStructure=structure;op.march=null;
                for(const u of army)u.aiFrontBound=null;
                wodAiRecord(unit.owner,'structure-opportunity',{job:op.id,kind:structure.kind,target:getHexKey(structure.hex)});
            }
        }
        if(!op.advanceGoal){
            const town=wodAiKnownCities(unit.owner).filter(c=>c.owner===op.hostile&&wodAiCanReach(unit,c)&&wodAiFrontTargetPenalty(unit.owner,op,c)<hr*5).sort((a,b)=>Math.hypot(a.x-op.goal.x,a.y-op.goal.y)+wodAiFrontTargetPenalty(unit.owner,op,a)-Math.hypot(b.x-op.goal.x,b.y-op.goal.y)-wodAiFrontTargetPenalty(unit.owner,op,b))[0];
            const dx=op.goal.x-op.anchor.x,dy=op.goal.y-op.anchor.y,len=Math.hypot(dx,dy)||1;
            op.advanceGoal=(!op.probe&&town)||getNearestHexToPoint(op.goal.x+dx/len*hr*(op.probe?3:6),op.goal.y+dy/len*hr*(op.probe?3:6))||op.goal;
            if(op.advanceGoal.id){op.strategicGoal=op.advanceGoal;op.strategicWatch=null;}
        }
        if(op.advanceGoal.id&&op.advanceGoal.owner===unit.owner)target=wodAiTownAssaultHex(unit,op.advanceGoal,members);
        else {
            op.stage='attack';
            job.stage='attack';target=wodAiAssaultMarchHex(unit,job,op.advanceGoal,members)||wodAiAdvanceHex(unit,op.advanceGoal,members);
            job.bound=job.march?.id||0;
        }
        const captured=op.advanceGoal.id?getCityUrbanTerrainHexes(op.advanceGoal).every(h=>wodIsFriendlyOwner(h.owner,unit.owner)):wodIsFriendlyOwner(op.advanceGoal.owner,unit.owner);
        const arrived=members.filter(u=>Math.hypot(u.x-op.advanceGoal.x,u.y-op.advanceGoal.y)<hr*4).length>=Math.max(2,Math.ceil(members.length*.6));
        if(captured&&arrived){
            if(wodAiContinueFrontOffensive(unit.owner,op,army))return true;
            wodAiFinishFrontOffensive(unit.owner,op,'objective-secured');
        }
    }
    if(!target)return false;
    const moved=wodAiMoveUnitTowardHex(unit,target,holding,.12);
    if(moved){wodAiStampOrder(unit,holding,target,5500);unit.aiOrderPhase=op.phase;unit.aiOrderResponseId=job.id;unit.aiFrontBound=job.bound;}
    return moved;
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
    sites.sort((a,b)=>score(a)-score(b));const target=sites[0]||getNearestHexToPoint(unit.x,unit.y);used[unit.uid]=getHexKey(target);slotState[unit.uid]={layout,anchor:getHexKey(anchor),at:now};wodAiRememberDeployment(unit,target,'formation');return target;
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

function wodAiDirectBeachhead(owner,supplyShips) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,radius=wodFortCombatAuraRadiusPx();
    const troops=gameData.entities.filter(u=>u.owner===owner&&u.hp>0&&u._navalLanded&&!u._navalEvacuating&&
        !u._medicalRecovering&&!u.boardTransportUid&&!u.retreating&&!u.moraleBroken&&!isWaterHex(getNearestHexToPoint(u.x,u.y)));
    const known=wodAiKnownCities(owner),threats=wodAiThreats(owner),groups=new Map(),intel=wodFogActive()?wodFogFactionIntel(owner):null;
    for(const u of troops){
        const here=getNearestHexToPoint(u.x,u.y),region=[...groups.keys()].find(r=>r.has(getHexKey(here)))||
            wodTransportLandingRegion({type:'light',owner},here)||wodTransportLandingRegion(u,here);
        if(region){if(!groups.has(region))groups.set(region,[]);groups.get(region).push(u);}
    }
    for(const [region,force]of groups){
        const cities=known.filter(c=>region.has(c.q+','+c.r)&&getCityUrbanTerrainHexes(c).some(h=>!wodIsFriendlyOwner(h.owner,owner)));
        const mission=gameData.aiNavalPlans?.[owner];
        const town=cities.find(c=>c.id===mission?.goal?.id)||cities.sort((a,b)=>Math.min(...force.map(u=>Math.hypot(u.x-a.x,u.y-a.y)))-Math.min(...force.map(u=>Math.hypot(u.x-b.x,u.y-b.y))))[0];
        const covered=(u,h)=>u.type==='marine'||wodCurrentSupplyComponent(h,owner).city||supplyShips.some(s=>
            !s.retreating&&s.hp>0&&Math.hypot(s.x-h.x,s.y-h.y)<radius*.87);
        const remaining=[...region].map(k=>gameData.hexes[k]).filter(h=>h&&!isWaterHex(h)&&wodIsHostileOwner(h.owner,owner));
        if(!town&&!remaining.length&&force.every(u=>u.type==='marine'||wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city)){
            for(const u of force){u._navalLanded=false;u._navalAssaultUntil=0;u._navalAdvanceGoal=null;u._navalAssaultGoal=null;u._aiBeachheadPlan=null;u._aiBeachheadOrder=null;u._aiFleetId=null;u.aiOrderUntil=0;}continue;
        }
        let objective=force.map(u=>u._aiBeachheadPlan).find(p=>p?.hexes===gameData.hexes&&p.until>now);
        const unfinished=p=>p?.kind==='scout'?p.goal&&!intel?.visible.has(getHexKey(p.goal)):
            p?.cutHexes?.some(k=>wodIsHostileOwner(gameData.hexes[k]?.owner,owner))||p?.town&&getCityUrbanTerrainHexes(p.town).some(h=>wodIsHostileOwner(h.owner,owner))||p?.goal&&wodIsHostileOwner(p.goal.owner,owner);
        if(!unfinished(objective))objective=null;
        if(!objective){
            const cut=force.length>=2?wodAiCutObjective(owner,force):null;
            const validCut=cut&&region.has(getHexKey(cut.objectiveHex))&&force.some(u=>Math.hypot(u.x-cut.objectiveHex.x,u.y-cut.objectiveHex.y)<hr*16)&&cut.cutHexes.every(k=>force.some(u=>covered(u,gameData.hexes[k])));
            const weak=cities.filter(c=>wodAiAssaultBalance(owner,force,c).strategicReady).sort((a,b)=>Math.min(...force.map(u=>Math.hypot(u.x-a.x,u.y-a.y)))-Math.min(...force.map(u=>Math.hypot(u.x-b.x,u.y-b.y))))[0];
            const nearby=remaining.filter(h=>force.some(u=>Math.hypot(u.x-h.x,u.y-h.y)<hr*16)).sort((a,b)=>Math.min(...force.map(u=>Math.hypot(a.x-u.x,a.y-u.y)))-Math.min(...force.map(u=>Math.hypot(b.x-u.x,b.y-u.y)))).slice(0,64);
            const land=nearby.filter(h=>(!wodFogActive()||wodFogFactionIntel(owner).explored.has(getHexKey(h)))&&force.some(u=>wodAiCanReach(u,h)&&covered(u,h))&&wodAiForecast(owner,force,threats.filter(e=>Math.hypot(e.x-h.x,e.y-h.y)<hr*6)).ratio>=wodAiCommander(owner).ratio)
                .sort((a,b)=>Math.min(...force.map(u=>Math.hypot(a.x-u.x,a.y-u.y)))-Math.min(...force.map(u=>Math.hypot(b.x-u.x,b.y-u.y))))[0];
            const scout=intel&&!weak&&!validCut&&!land?[...region].map(k=>gameData.hexes[k]).filter(h=>h&&!isWaterHex(h)&&!intel.explored.has(getHexKey(h))&&
                getNeighborHexes(h).some(n=>intel.explored.has(getHexKey(n)))&&force.some(u=>covered(u,h)&&canUnitEnterHex(u,h)&&wodAiCanReach(u,h)))
                .sort((a,b)=>Math.min(...force.map(u=>Math.hypot(a.x-u.x,a.y-u.y)))-Math.min(...force.map(u=>Math.hypot(b.x-u.x,b.y-u.y))))[0]:null;
            const goal=weak||validCut&&cut.objectiveHex||land||scout||town;
            if(goal){objective={hexes:gameData.hexes,id:owner+'-beach-'+now,until:now+60000,goal,town:weak||null,cutHexes:!weak&&validCut?cut.cutHexes:null,kind:weak?'town':validCut?'encircle':scout?'scout':'territory'};wodAiRecord(owner,'beachhead-objective',{kind:objective.kind,target:goal.id||getHexKey(goal),troops:force.length});}
        }
        for(const u of force)u._aiBeachheadPlan=objective;
        const goal=objective?.goal||town||remaining[0];
        if(!goal)continue;
        // The best actual cluster leads. Other landed regiments gather with it;
        // waiting passengers and marines on a different island never count.
        const clusterSize=u=>force.filter(m=>Math.hypot(m.x-u.x,m.y-u.y)<hr*7).length;
        const lead=force.slice().sort((a,b)=>clusterSize(b)-clusterSize(a)||Math.hypot(a.x-goal.x,a.y-goal.y)-Math.hypot(b.x-goal.x,b.y-goal.y))[0];
        const local=force.filter(u=>Math.hypot(u.x-lead.x,u.y-lead.y)<hr*7);
        const resistance=threats.filter(e=>!wodIsNavalUnit(e)&&region.has(getHexKey(getNearestHexToPoint(e.x,e.y)))&&
            (Math.hypot(e.x-goal.x,e.y-goal.y)<hr*9||local.some(u=>Math.hypot(e.x-u.x,e.y-u.y)<hr*8)));
        const fire=gameData.entities.filter(s=>s.owner===owner&&s.type==='ship'&&s.hp>s.maxHp*.45&&!s.retreating&&
            resistance.some(e=>Math.hypot(e.x-s.x,e.y-s.y)<(s.range||80)));
        const pressure=objective&&wodAiUpdateAssaultBudget(owner,objective,force,goal,resistance),risk=wodAiObjectiveRisk(owner,goal,objective||{});
        const ready=!local.some(u=>u._aiSupplyHoldUntil>now)&&local.length>=Math.min(force.length,resistance.length?2:1)&&wodAiForecast(owner,[...local,...fire],resistance).ratio>=(pressure?.active?risk.continue:risk.launch);
        if(objective){objective.phase=ready?'advance':'gather';if(ready)wodAiUpdateAssaultBudget(owner,objective,force,goal,resistance,true);}
        const reserved=new Map();
        for(const u of force){
            const order=u._aiBeachheadOrder,h=order&&gameData.hexes[order.key];
            if(order&&order.objective===objective?.id&&u.target&&h&&covered(u,h)&&(!order.attack||wodIsHostileOwner(h.owner,owner))&&
                !reserved.has(order.key)&&now-order.at<16000){reserved.set(order.key,u.uid);}
            else u._aiBeachheadOrder=null;
        }
        const ordered=force.slice().sort((a,b)=>Math.hypot(a.x-goal.x,a.y-goal.y)-Math.hypot(b.x-goal.x,b.y-goal.y));
        for(const u of ordered){
            u._navalAssaultUntil=now+8000;u._needsTransport=false;u._navalAdvanceGoal=null;
            if(u._trafficYield)continue;
            const here=getNearestHexToPoint(u.x,u.y),reach=wodAiOperationReach(u),old=u._aiBeachheadOrder;
            if(old&&reserved.get(old.key)===u.uid&&u.target&&(ready||!old.attack))continue;
            if(old)reserved.delete(old.key);
            const clear=h=>!reserved.has(getHexKey(h))&&!isWorldPositionBlockedByUnits(u,h.x,h.y);
            const legal=h=>canUnitEnterHex(u,h)&&reach.has(getHexKey(h))&&covered(u,h)&&clear(h);
            const urban=objective?.cutHexes?new Set(objective.cutHexes):objective?.town?new Set(getCityUrbanTerrainHexes(objective.town).map(getHexKey)):new Set();
            const targets=objective?.kind==='scout'?[objective.goal].filter(legal):remaining.filter(h=>legal(h)&&(!intel||intel.explored.has(getHexKey(h))));
            targets.sort((a,b)=>Number(!urban.has(getHexKey(a)))-Number(!urban.has(getHexKey(b)))||
                Math.hypot(a.x-goal.x,a.y-goal.y)*.6+Math.hypot(a.x-u.x,a.y-u.y)*.4-Math.hypot(b.x-goal.x,b.y-goal.y)*.6-Math.hypot(b.x-u.x,b.y-u.y)*.4);
            let target=ready&&Math.hypot(u.x-lead.x,u.y-lead.y)<hr*9?targets[0]:null,attack=!!target;
            if(!target){
                u._navalAdvanceGoal={x:goal.x,y:goal.y};
                const choices=getHexesInRadius(getNearestHexToPoint(lead.x,lead.y).q,getNearestHexToPoint(lead.x,lead.y).r,5)
                    .map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&region.has(getHexKey(h))&&!isWaterHex(h)&&wodIsFriendlyOwner(h.owner,owner)&&legal(h));
                const score=h=>Math.hypot(h.x-lead.x,h.y-lead.y)*1.3+Math.hypot(h.x-goal.x,h.y-goal.y)*.6+
                    threats.reduce((n,e)=>n+Math.max(0,(e.range||50)+hr-Math.hypot(e.x-h.x,e.y-h.y))*4,0)+
                    (getNeighborHexes(h).some(wodIsOpenWaterHex)?hr*2:0);
                choices.sort((a,b)=>score(a)-score(b));target=choices[0];
            }
            if(target){
                const key=getHexKey(target);reserved.set(key,u.uid);
                const same=u.target&&u.orderTarget&&Math.hypot(u.orderTarget.x-target.x,u.orderTarget.y-target.y)<hr*.5;
                if(same||assignUnitMoveAlongWaypoints(u,[{x:target.x,y:target.y}]))u._aiBeachheadOrder={key,attack,at:now,objective:objective?.id};
            }else if(!covered(u,here)){
                const safe=[...region].map(k=>gameData.hexes[k]).filter(h=>h&&!isWaterHex(h)&&legal(h)).sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y))[0];
                if(safe)assignUnitMoveAlongWaypoints(u,[safe]);
            }
        }
        wodAiRecord(owner,'beachhead-force',{job:town?.id||getHexKey(getNearestHexToPoint(goal.x,goal.y)),landed:force.length,gathered:local.length,ready});
    }
}

// Keep a conservative last-seen fleet estimate after contact is lost. Its
// position is a snapshot; unseen real movement/health is never consulted.
function wodAiSeaThreats(owner) {
    const now=wodAiOperationTime(),known=wodAiThreats(owner).filter(u=>u.type==='ship');
    if(!wodFogActive())return known;
    let cache=gameData._aiSeaThreatMemory;
    if(cache?.hexes!==gameData.hexes)cache=gameData._aiSeaThreatMemory={hexes:gameData.hexes,owners:{}};
    const records=cache.owners[owner]||=(new Map());
    for(const u of known)if(!u._intelMemory){
        const snapshot={};for(const k of ['uid','type','owner','hp','maxHp','morale','x','y','damage','range','speed','attackCooldown','manpower','maxManpower'])snapshot[k]=u[k];
        records.set(u.uid,{at:now,snapshot});
    }
    const result=known.slice(),ids=new Set(result.map(u=>u.uid));
    for(const [id,r]of records){
        if(now-r.at>120000){records.delete(id);continue;}
        if(!ids.has(id)){
            const age=(now-r.at)/1000,vacated=wodFogFactionIntel(owner).visible.has(getHexKey(getNearestHexToPoint(r.snapshot.x,r.snapshot.y)));
            result.push({...r.snapshot,_intelMemory:true,_intelConfidence:Math.max(.15,.8*Math.exp(-age/(vacated?18:45))),uncertainty:(gameData.hexRadius||20)*Math.min(12,2+age*.15)});
        }
    }
    return result;
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

function wodAiTimelyIslandSupport(unit,supplies) {
    const radius=wodFortCombatAuraRadiusPx(),remaining=Math.max(0,9-(unit.outOfSupplySeconds||0));
    return supplies.some(s=>{
        if(s.hp<=0||s.retreating||s._medicalRecovering||s._aiSupplyEscapeUntil>wodAiOperationTime())return false;
        const distance=Math.hypot(s.x-unit.x,s.y-unit.y);
        if(distance<radius*.9)return wodAiSupplySiteSafe(s,s);
        const speed=Math.max(1,wodUnitBaseSpeed(s)*WOD_MOVE_SPEED_FACTOR);
        if((distance-radius*.8)/speed>remaining)return false;
        return wodAiArrivalSeconds(s,unit,radius*.8,remaining)<=remaining;
    });
}

// Reserve actual escorts for threatened support vessels before assigning
// bombardment. Distant ships cannot authorize an exposed supply position.
function wodAiEscortSupply(owner,supplies,warships,mission) {
    const hr=gameData.hexRadius||20,now=wodAiOperationTime(),assigned=new Set(),allThreats=wodAiThreats(owner,false);
    for(const supply of supplies){
        const troops=gameData.entities.filter(u=>u.owner===owner&&u.hp>0&&u._navalLanded&&u.type!=='marine'&&
            !wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city&&Math.hypot(u.x-supply.x,u.y-supply.y)<wodFortCombatAuraRadiusPx()*1.15);
        const aim=troops.find(u=>u._navalAdvanceGoal)?._navalAdvanceGoal||mission?.landing||supply.orderTarget||supply;
        const threats=allThreats.filter(e=>e.type!=='convoy'&&(Math.hypot(e.x-supply.x,e.y-supply.y)<hr*13||Math.hypot(e.x-aim.x,e.y-aim.y)<hr*11));
        if(!threats.length)continue;
        const foe=threats.slice().sort((a,b)=>Number(b.type==='ship')-Number(a.type==='ship')||Math.hypot(a.x-supply.x,a.y-supply.y)-Math.hypot(b.x-supply.x,b.y-supply.y))[0];
        const candidates=warships.filter(u=>!assigned.has(u.uid)).sort((a,b)=>
            Math.hypot(a.x-supply.x,a.y-supply.y)-(a._aiSupplyEscortFor===supply.uid?hr*3:0)-Math.hypot(b.x-supply.x,b.y-supply.y)+(b._aiSupplyEscortFor===supply.uid?hr*3:0));
        let power=0;const need=threats.reduce((n,e)=>n+wodAiUnitCombatPower(e),0)*1.2;
        for(const escort of candidates){
            const sea=wodNavalWaterRegionKeys(escort,getNearestHexToPoint(escort.x,escort.y));if(!sea)continue;
            const center=getNearestHexToPoint(supply.x,supply.y),range=(escort.range||80)*.8;
            const sites=getHexesInRadius(center.q,center.r,8).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&sea.has(getHexKey(h))&&wodIsOpenWaterHex(h)&&wodNavalDestinationClear(escort,h));
            const score=h=>Math.abs(Math.hypot(h.x-foe.x,h.y-foe.y)-range)*2+Math.hypot(h.x-supply.x,h.y-supply.y)*.3+
                Math.hypot(h.x-escort.x,h.y-escort.y)*.08+Math.max(0,Math.hypot(h.x-aim.x,h.y-aim.y)-Math.hypot(supply.x-aim.x,supply.y-aim.y))*1.5;
            sites.sort((a,b)=>score(a)-score(b));const site=sites[0];if(!site)continue;
            assigned.add(escort.uid);escort._aiSupplyEscortFor=supply.uid;escort._aiSupplyEscortUntil=now+8000;
            escort._navalEscortUntil=now+8000;escort._aiScoutUntil=0;escort._navalScoutGoal=null;
            if(!escort._trafficYield&&Math.hypot(site.x-escort.x,site.y-escort.y)>hr&&
                (!escort.target||Math.hypot((escort.orderTarget||escort.target).x-site.x,(escort.orderTarget||escort.target).y-site.y)>hr*1.5))
                assignUnitMoveAlongWaypoints(escort,[site],{transportInternal:true});
            power+=wodAiUnitCombatPower(escort);wodAiRecord(owner,'supply-escort',{unit:escort.uid,supply:supply.uid,foe:foe.uid});
            if(power>=need||assigned.size>=3)break;
        }
    }
    return assigned;
}

function wodAiRefreshRally(owner,job,members,goal){
 const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
 if(!members.length)return;
 const cx=members.reduce((n,u)=>n+u.x,0)/members.length,cy=members.reduce((n,u)=>n+u.y,0)/members.length;
 const lead=members.find(u=>u.uid===job._rallyLead)||members.filter(u=>!wodCanClimb(u)).sort((a,b)=>Math.hypot(a.x-cx,a.y-cy)-Math.hypot(b.x-cx,b.y-cy))[0]||members[0];
 if(job._rallyAt!=null&&now-job._rallyAt<4000)return;
 job._rallyAt=now;job._rallyLead=lead.uid;
 const route=wodAiLandRoute(lead,goal);
 const force=members,center=getNearestHexToPoint(cx,cy),reach=wodAiOperationReach(lead),threats=wodAiThreats(owner,false);
 if(!center)return;
 const assembling=!job.operationState||['assemble','recover'].includes(job.operationState.stage);
 const goalKey=goal.id||getHexKey(goal),old=job._assemblyRally;
 if(assembling&&old?.goal===goalKey&&wodIsFriendlyOwner(old.hex.owner,owner)&&wodCurrentSupplyComponent(old.hex,owner).city&&
     !threats.some(e=>Math.hypot(e.x-old.hex.x,e.y-old.hex.y)<(e.range||50)+hr)){
  job.holdHex=old.hex;return;
 }
 // Reverse route fields fill over several bounded AI pulses. While they are
 // warming up, assemble at the supplied army center instead of issuing the
 // stale, distant rally order and retaining it until everybody arrives there.
 if(assembling&&!route&&!isWaterHex(center)&&canUnitEnterHex(lead,center)&&
     wodIsFriendlyOwner(center.owner,owner)&&wodCurrentSupplyComponent(center,owner).city&&
     !threats.some(e=>Math.hypot(e.x-center.x,e.y-center.y)<(e.range||50)+hr)){
  job.holdHex=center;job._assemblyRally={goal:goalKey,hex:center};return;
 }
 if(route){
  let rally=null;
  // Assemble near the actual army. The last friendly cell of a long route can
  // be minutes away, forcing scattered regiments to march there separately.
  for(const h of assembling?route.slice(0,5):route){
   if(!wodIsFriendlyOwner(h.owner,owner)||!wodCurrentSupplyComponent(h,owner).city)break;
   if(threats.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<(e.range||50)+hr))break;
   rally=h;
  }
  if(rally){
   const current=job.holdHex,safe=current&&wodIsFriendlyOwner(current.owner,owner)&&wodCurrentSupplyComponent(current,owner).city&&
       !threats.some(e=>Math.hypot(e.x-current.x,e.y-current.y)<(e.range||50)+hr);
   const oldIndex=current?route.indexOf(current):-1;
   const backwards=safe&&(oldIndex>=0&&route.indexOf(rally)<oldIndex||!wodAiNeedsLandDetour(lead,goal)&&Math.hypot(rally.x-goal.x,rally.y-goal.y)>Math.hypot(current.x-goal.x,current.y-goal.y)+hr*2);
   if((assembling||!backwards)&&!['secure-approach','protect-flanks'].includes(job.operationState?.stage))job.holdHex=rally;
   if(assembling)job._assemblyRally={goal:goalKey,hex:job.holdHex};
   return;
  }
 }
 const current=job.holdHex||center,oldDistance=Math.hypot(current.x-goal.x,current.y-goal.y);
 let best=null,score=Infinity;
 for(const p of getHexesInRadius(center.q,center.r,6)){
  const h=gameData.hexes[p.q+','+p.r];if(!h||isWaterHex(h)||!wodIsFriendlyOwner(h.owner,owner)||!reach.has(getHexKey(h))||!canUnitEnterHex(lead,h)||!wodCurrentSupplyComponent(h,owner).city)continue;
  if(threats.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<(e.range||50)+hr*2))continue;
  const d=Math.hypot(h.x-goal.x,h.y-goal.y);if(!assembling&&d>oldDistance-hr*2)continue;
  const value=Math.hypot(h.x-cx,h.y-cy)*1.5+d*.6;if(value<score){score=value;best=h;}
 }
 if(best){job.holdHex=best;if(assembling)job._assemblyRally={goal:goalKey,hex:best};}
}

// Gather around the supplied force already at the front, never an obsolete rear rally.
function wodAiCohortAnchor(owner,members,goal) {
    const hr=gameData.hexRadius||20,ready=members.filter(u=>u.hp>u.maxHp*.4&&!u.retreating&&!u.moraleBroken&&!u._medicalRecovering);
    const points=ready.map(u=>({u,n:ready.reduce((n,v)=>n+Number(Math.hypot(u.x-v.x,u.y-v.y)<hr*7),0)}));
    points.sort((a,b)=>b.n-a.n||(goal?Math.hypot(a.u.x-goal.x,a.u.y-goal.y)-Math.hypot(b.u.x-goal.x,b.u.y-goal.y):0));
    for(const {u}of points){const h=wodUnitSupplyHex(u,getNearestHexToPoint(u.x,u.y));if(h&&!isWaterHex(h)&&wodIsFriendlyOwner(h.owner,owner)&&wodCurrentSupplyComponent(h,owner).city)return h;}
    return null;
}
function wodAiSupplyExit(unit,job) {
    if(wodIsNavalUnit(unit)||unit.boardTransportUid)return false;
    const here=wodUnitSupplyHex(unit,getNearestHexToPoint(unit.x,unit.y)),now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    if(here&&wodCurrentSupplyComponent(here,unit.owner).city){unit._aiSupplyTrail={key:getHexKey(here),at:now};return false;}
    if(!here||!wodGetUnitEncirclementState(unit,here)||(unit.outOfSupplySeconds||0)<1)return false;
    if(job?.kind==='relief'&&(wodAiReliefReady(unit,job)||job.breakoutReady&&unit._aiReliefCommitUntil>now&&job.breakoutBalance?.ratio>=.85))return false;
    if(unit._aiSupplyExit&&now-unit._aiSupplyExit.at<5000&&unit.target)return true;
    const old=unit._aiSupplyTrail&&gameData.hexes[unit._aiSupplyTrail.key],choices=[];
    if(old)choices.push(old);
    for(const p of getHexesInRadius(here.q,here.r,12)){const h=gameData.hexes[p.q+','+p.r];if(h)choices.push(h);}
    const foes=wodAiThreats(unit.owner,false),reach=wodAiOperationReach(unit);
    let safe=choices.filter(h=>!isWaterHex(h)&&wodIsFriendlyOwner(h.owner,unit.owner)&&reach.has(getHexKey(h))&&canUnitEnterHex(unit,h)&&wodCurrentSupplyComponent(h,unit.owner).city);
    // A large encirclement may contain no supplied cell inside the local
    // twelve-cell scan. Own towns remain known and are valid dry escape goals.
    if(!safe.length)safe=gameData.cities.filter(c=>c.owner===unit.owner).map(c=>gameData.hexes[c.q+','+c.r]).filter(h=>h&&!isWaterHex(h)&&canUnitEnterHex(unit,h)&&reach.has(getHexKey(h))&&wodCurrentSupplyComponent(h,unit.owner).city);
    const score=h=>Math.hypot(h.x-unit.x,h.y-unit.y)+foes.reduce((n,e)=>n+Math.max(0,(e.range||50)+hr*2-Math.hypot(e.x-h.x,e.y-h.y))*3,0);
    safe.sort((a,b)=>score(a)-score(b));const goal=safe[0];if(!goal)return false;
    const patient=unit._medicalRecovering;unit._medicalRecovering=false;
    if(wodAiMoveUnitTowardHex(unit,goal,false,.08)){unit._aiSupplyExit={at:now,key:getHexKey(goal)};wodAiStampOrder(unit,false,goal,5000);wodAiRecord(unit.owner,'supply-exit',{unit:unit.uid,target:getHexKey(goal)});return true;}
    unit._medicalRecovering=patient;
    return false;
}
function wodAiAmbushCounterattack(owner,op,army,foes) {
    if(army.length<5||!foes.length||wodAiForecast(owner,army,foes).ratio<wodAiAttackThreshold(owner,true))return false;
    const now=wodAiOperationTime(),goal=getNearestHexToPoint(foes.reduce((n,u)=>n+u.x,0)/foes.length,foes.reduce((n,u)=>n+u.y,0)/foes.length);
    delete op.ambush;op.goal=goal;op.anchor=wodAiCohortAnchor(owner,army,goal)||op.anchor;op.mode='breakthrough';op.phase='advance';op.launchedAt=now;op.commandDecision=null;op.effect=null;op.advanceGoal=null;
    op.jobs=[{id:op.id+'-counterattack',kind:'main',role:'breakthrough',response:true,members:army.map(u=>u.uid),frontOperation:op,holdHex:op.anchor,bound:0}];
    for(const u of army){u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}wodAiRecord(owner,'ambush-counterattack',{job:op.id,troops:army.length,enemy:foes.length});return true;
}

// Physical supply links are independent of political ownership. Share their
// exact native order across factions; each defense scan still filters its own
// friendly territory and computes fresh city reachability and enemy threats.
function* wodAiSupplyGeometrySteps() {
    const version=gameData._wodPfVer||0;let g=gameData._aiSupplyGeometry;
    if(!g||g.hexes!==gameData.hexes||g.version!==version)g=gameData._aiSupplyGeometry={hexes:gameData.hexes,version,cells:gameData.hexList,index:new Map(gameData.hexList.map((h,i)=>[h,i])),neighbors:[],cursor:0};
    while(g.cursor<g.cells.length){
        const end=Math.min(g.cells.length,g.cursor+128);
        while(g.cursor<end){const h=g.cells[g.cursor],links=[];wodSupplyNeighbors(h,n=>{const id=g.index.get(n);if(id!==undefined&&!links.includes(id))links.push(id);});g.neighbors[g.cursor++]=links;}
        yield;
    }
    return g;
}

// Reconcile command ownership against observed progress. A naval lease is not
// evidence that a unit has an order, and issuing retries is not movement.
function wodAiMaintainMissions(owner,transports=[]) {
    if(wodMpIsHumanOwner(owner))return;
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    let state=gameData._aiMissionMaintenance;
    if(state?.hexes!==gameData.hexes)state=gameData._aiMissionMaintenance={hexes:gameData.hexes,checked:{}};
    if(state.checked[owner]!=null&&now-state.checked[owner]<4000)return;state.checked[owner]=now;
    const army=gameData.entities.filter(u=>u.owner===owner&&u.hp>0),known=wodAiThreats(owner),towns=wodAiKnownCities(owner);
    wodAiNavalAssaultTargets(owner); // warm the shared physical coast cache
    for(const u of army){
        const work=wodAiObserveWork(u,u.cargo?'transporting':u._medicalRecovering?'recovery':u.boardTransportUid?'boarding':u._aiMission?.kind||u.aiTfKind||'unassigned');
        if(u._aiScoutUntil>now&&!u.target&&now-work.progressAt>16000)u._aiScoutUntil=0;
        const transit=u._aiMarineTransit;
        if(!transit)continue;
        const at=getNearestHexToPoint(u.x,u.y);
        if(at&&!isWaterHex(at)&&Math.hypot(u.x-transit.goal.x,u.y-transit.goal.y)<hr*3){
            u._aiMarineTransit=null;u._aiScoutUntil=0;u._navalLanded=true;u._navalAssaultGoal=transit.goal;u._aiMarineGroundUntil=now+8000;
            wodAiRecord(owner,'marine-transit-complete',{unit:u.uid,target:getHexKey(at)});
        }else if(now-work.progressAt>30000||now-transit.at>1200000){
            u._aiMarineTransit=null;u._aiScoutUntil=0;u._navalAssaultUntil=0;wodClearTransportMove(u);
            wodAiRecord(owner,'marine-transit-blocked',{unit:u.uid,reason:'no-physical-progress'});
        }else{u._aiScoutUntil=now+8000;u._navalAssaultUntil=now+8000;}
    }
    for(const t of transports.filter(t=>t.owner===owner&&t.hp>0&&t.pickupUid&&!t.cargo)){
        const passenger=army.find(u=>u.uid===t.pickupUid),pickup=gameData.hexes[t.pickupLandKey];
        if(!passenger||passenger.boardTransportUid!==t.uid||!pickup)continue;
        const walking=Math.hypot(passenger.x-pickup.x,passenger.y-pickup.y);
        const docking=Math.hypot(t.x-pickup.x,t.y-pickup.y);
        let watch=t._aiBoardingWatch;
        if(!watch||watch.passenger!==passenger.uid)t._aiBoardingWatch=watch={passenger:passenger.uid,walk:walking,dock:docking,at:now};
        if(walking<watch.walk-hr*.5||docking<watch.dock-hr*.5){watch.walk=Math.min(watch.walk,walking);watch.dock=Math.min(watch.dock,docking);watch.at=now;}
        if(now-watch.at<30000)continue;
        passenger._aiEmbarkAvoid||={};passenger._aiEmbarkAvoid[getHexKey(pickup)]=now+90000;
        passenger._aiEmbarkAvoid=Object.fromEntries(Object.entries(passenger._aiEmbarkAvoid).filter(([,until])=>until>now).slice(-6));
        const fleet=t._aiFleetId,goal=t.ferryGoal;
        passenger.boardTransportUid=null;passenger._wodBoardingNoWater=false;passenger._trafficYield=null;
        t.pickupUid=null;t.pickupLandKey=null;t._trafficYield=null;t._aiBoardingWatch=null;wodClearTransportMove(t);wodClearTransportMove(passenger);
        const repaired=!t.retreating&&!t._medicalRecovering&&wodOrderBoardTransport(passenger,t);
        if(repaired){t._aiFleetId=fleet;t.ferryGoal=goal;}
        else{
            passenger._aiBoardingRetryAfter=now+8000;passenger._needsTransport=false;passenger._navalAssaultUntil=0;
            passenger._medicalEvacuating=false;passenger._navalEvacuating=false;passenger.aiOrderUntil=0;
            t._aiMedicalFor=null;t._aiEvacFor=null;t._aiFleetId=null;t.ferryGoal=null;t._aiFerryMission=false;
        }
        wodAiRecord(owner,'boarding-replanned',{unit:t.uid,passenger:passenger.uid,reason:'no-embarkation-progress',repaired,old:getHexKey(pickup),next:t.pickupLandKey||null});
    }
    for(const u of army.filter(u=>u.type==='marine'&&!u.boardTransportUid&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&!u._trafficYield&&!(u._aiScoutUntil>now))){
        const here=getNearestHexToPoint(u.x,u.y),watch=u._aiIdleMission;
        if(!watch||u._combatEngaged||Math.hypot(u.x-watch.x,u.y-watch.y)>hr*.5){u._aiIdleMission={x:u.x,y:u.y,at:now};continue;}
        if(now-watch.at<12000||!here)continue;
        const raid=gameData._aiMarineRaids?.owners[owner],fleet=wodAiMissionForVessel(u);
        if(raid?.ids.includes(u.uid)&&now-(u._aiRaidProgress?.at??raid.at)<60000)continue;
        if(fleet&&fleet.id===u._aiFleetId&&now-(fleet.progressAt??fleet.at??now)<45000)continue;
        // An endpoint at our feet (or a path stalled for a full minute) is not
        // useful work. Moving units keep their original mission and orders.
        const end=u.orderTarget||u.target?.finalTarget||u.target;
        if(u.target&&end&&Math.hypot(end.x-u.x,end.y-u.y)>hr*2&&now-watch.at<60000)continue;
        u.target=null;u.orderTarget=null;u.path=[];u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);
        if(isWaterHex(here)){
            const sea=wodAiSeaRegionFrom(owner,u),explored=wodFogActive()?wodFogFactionIntel(owner).explored:null;
            const coast=(gameData._navalCoastCells?.hexes===gameData.hexes?gameData._navalCoastCells.cells:[])
                .filter(h=>(!explored||explored.has(getHexKey(h)))&&getNeighborHexes(h).some(n=>sea?.has(getHexKey(n))))
                .filter(h=>wodIsFriendlyOwner(h.owner,owner)||!known.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<(e.range||50)+hr*3))
                .sort((a,b)=>Number(wodIsFriendlyOwner(b.owner,owner))-Number(wodIsFriendlyOwner(a.owner,owner))||Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y));
            for(const beach of coast.slice(0,8)){
                const exit=getNeighborHexes(beach).find(h=>sea?.has(getHexKey(h))),path=exit&&wodAiMarineWaterPath(owner,here,exit);
                if(!path?.length)continue;
                if(assignUnitMoveAlongWaypoints(u,[...path,beach],{transportInternal:true})){
                    u._aiMarineRaid=null;u._aiFleetId=null;u._navalAssaultUntil=now+8000;u._aiMarineGroundUntil=now+20000;
                    wodAiRecord(owner,'mission-recovered',{unit:u.uid,reason:'marine-return-to-shore',target:getHexKey(beach)});break;
                }
            }
            watch.at=now-4000;continue;
        }
        const region=wodTransportLandingRegion({type:'light',owner},here);if(!region)continue;
        const urban=towns.filter(c=>region.has(c.q+','+c.r)&&getCityUrbanTerrainHexes(c).some(h=>wodIsHostileOwner(h.owner,owner)))
            .sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y));
        const front=wodCachedFrontlineHexes(owner).flatMap(h=>getNeighborHexes(h)).filter(h=>region.has(getHexKey(h))&&wodIsHostileOwner(h.owner,owner)&&
            (!wodFogActive()||wodFogFactionIntel(owner).explored.has(getHexKey(h))))
            .sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y));
        const force=army.filter(m=>(isLandArmyUnit(m)||m.type==='marine')&&m.hp>m.maxHp*.6&&!m._medicalRecovering&&!m.retreating&&!m.moraleBroken&&!m.boardTransportUid&&Math.hypot(m.x-u.x,m.y-u.y)<hr*8);
        const objective=[...urban,...front].find(target=>{
            const foes=known.filter(e=>!wodIsNavalUnit(e)&&Math.hypot(e.x-target.x,e.y-target.y)<hr*7||Math.hypot(e.x-u.x,e.y-u.y)<hr*6);
            return (!foes.length||wodAiForecast(owner,force,foes).ratio>=wodAiAttackThreshold(owner,true))&&wodAiCanReach(u,target);
        });
        u._navalAssaultUntil=0;u._aiMarineRaid=null;u._aiMarineRaidOrder=null;u.aiOrderUntil=0;
        if(objective){
            const foes=known.filter(e=>Math.hypot(e.x-objective.x,e.y-objective.y)<hr*7||Math.hypot(e.x-u.x,e.y-u.y)<hr*6);
            if(!foes.length||wodAiForecast(owner,force,foes).ratio>=wodAiAttackThreshold(owner,true)){
                // A marine on a landmass containing our own town is a ground
                // reinforcement, not an isolated beachhead. Otherwise the
                // beachhead controller can replace its march with a rally at
                // its own feet because a distant defended town is too strong.
                u._navalLanded=!gameData.cities.some(c=>c.owner===owner&&region.has(c.q+','+c.r));
                u._aiBeachheadPlan=null;u._aiBeachheadOrder=null;
                u._navalAssaultGoal=objective;u._aiMarineGroundUntil=now+20000;
                const aim=objective.id?getCityUrbanTerrainHexes(objective).find(h=>wodIsHostileOwner(h.owner,owner)):objective;
                const target=aim&&wodAiAdvanceHex(u,aim,force);
                if(target&&wodAiMoveUnitTowardHex(u,target,false,.08)){wodAiStampOrder(u,false,target,4000);wodAiRecord(owner,'mission-recovered',{unit:u.uid,reason:'marine-land-objective',target:objective.id||getHexKey(objective)});}
            }
        }else{
            u._navalLanded=false;u._aiFleetId=null;u._navalAssaultGoal=null;
            // A lone landing cannot defeat a defended town. Join a real
            // friendly cohort instead of repeatedly retrying that same town.
            const peers=army.filter(m=>m!==u&&(isLandArmyUnit(m)||m.type==='marine')&&m.hp>m.maxHp*.6&&!m.boardTransportUid&&!m._medicalRecovering&&!m.retreating&&region.has(getHexKey(getNearestHexToPoint(m.x,m.y))))
                .sort((a,b)=>Number(b.type==='marine')-Number(a.type==='marine')||Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y));
            const peer=peers.find(m=>Math.hypot(m.x-u.x,m.y-u.y)>hr*4&&wodAiCanReach(u,getNearestHexToPoint(m.x,m.y))&&!known.some(e=>Math.hypot(e.x-m.x,e.y-m.y)<hr*4));
            if(peer&&wodAiMoveUnitTowardHex(u,getNearestHexToPoint(peer.x,peer.y),false,.1)){
                u._aiMarineGroundUntil=now+16000;wodAiRecord(owner,'mission-recovered',{unit:u.uid,reason:'marine-regroup',peer:peer.uid});watch.at=now-4000;continue;
            }
            // An explored townless island is not a lifetime parking place.
            // Rejoin another coastal cohort or raid a genuinely undefended
            // beach. A single marine never authorizes a defended town assault.
            const sea=wodAiSeaRegionFrom(owner,u),coasts=gameData._navalCoastCells?.cells||[];
            const homes=gameData.cities.filter(c=>c.owner===owner).map(c=>wodTransportLandingRegion({type:'light',owner},c)).filter(Boolean);
            const homeCoast=h=>wodIsFriendlyOwner(h.owner,owner)&&homes.some(r=>r.has(getHexKey(h)));
            const source=coasts.filter(h=>region.has(getHexKey(h))).sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y))[0];
            const choices=coasts.filter(h=>!region.has(getHexKey(h))&&getNeighborHexes(h).some(n=>sea?.has(getHexKey(n)))&&
                (!wodFogActive()||wodFogFactionIntel(owner).explored.has(getHexKey(h)))&&
                (homeCoast(h)||wodIsHostileOwner(h.owner,owner)&&!known.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<hr*9)||
                    army.some(m=>m!==u&&(isLandArmyUnit(m)||m.type==='marine')&&Math.hypot(m.x-h.x,m.y-h.y)<hr*6)))
                .sort((a,b)=>Number(homeCoast(b))-Number(homeCoast(a))||Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y));
            let crossing=false;
            for(const beach of choices.slice(0,6)){
                const entry=source&&getNeighborHexes(source).find(n=>sea?.has(getHexKey(n))),exit=getNeighborHexes(beach).find(n=>sea?.has(getHexKey(n)));
                const path=entry&&exit&&wodAiMarineWaterPath(owner,entry,exit);if(!path?.length)continue;
                if(assignUnitMoveAlongWaypoints(u,[source,...path,beach],{transportInternal:true})){
                    u._aiMarineTransit={at:now,goal:beach};u._aiScoutUntil=now+8000;u._navalAssaultUntil=now+8000;crossing=true;
                    wodAiRecord(owner,'mission-recovered',{unit:u.uid,reason:'marine-coastal-transfer',target:getHexKey(beach)});break;
                }
            }
            if(crossing){watch.at=now-4000;continue;}
            if(wodFogActive())wodAiIssueScoutOrder(u,{id:'marine-recon-'+u.uid,kind:'scout',members:[u.uid],holdHex:here});
            if(!u.target){
                const coast=(gameData._navalCoastCells?.hexes===gameData.hexes?gameData._navalCoastCells.cells:[])
                    .filter(h=>region.has(getHexKey(h))&&wodIsFriendlyOwner(h.owner,owner));
                coast.sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y));
                if(coast[0]&&Math.hypot(coast[0].x-u.x,coast[0].y-u.y)>hr*2)wodAiMoveUnitTowardHex(u,coast[0],false,.1);
            }
        }
        // Retry decisions after a bounded pause, without pretending we moved.
        watch.at=now-4000;
    }
    for(const t of transports.filter(t=>t.owner===owner&&t.hp>0&&!t._medicalRecovering&&!t._aiMedicalFor&&!t.retreating&&!t.moraleBroken)){
        if(!t.cargo){if(t._aiFerryReturning){t._aiFerryReturning=false;t._aiFleetId=null;t.ferryGoal=null;}t._aiCargoWatch=null;continue;}
        let watch=t._aiCargoWatch;
        if(!watch||watch.cargo!==t.cargo.uid||Math.hypot(t.x-watch.x,t.y-watch.y)>hr*.5)t._aiCargoWatch=watch={cargo:t.cargo.uid,x:t.x,y:t.y,at:now,retryAt:0};
        if(t._trafficYield&&now-(t._aiWork?.progressAt??now)>30000){t._trafficYield=null;wodClearTransportMove(t);}
        if(t._trafficYield||now-watch.at<10000||now-watch.retryAt<6000)continue;watch.retryAt=now;
        const mission=wodAiMissionForVessel(t),live=mission&&mission.hexes===gameData.hexes&&mission.phase!=='complete';
        if(!live&&!t._aiFerryReturning)t._aiFleetId=null;
        const goal=t.ferryGoal||t.cargo._navalAssaultGoal;
        if(goal&&wodAiFerryCanSail(t)&&wodAiFerryLandingSafe(t,goal)){
            if(!t.target||(t.stuckTimer||0)>1){
                if(t.unloadHexKey&&now-watch.at>=30000){t._ferryBlockedShores||={};t._ferryBlockedShores[t.unloadHexKey]=(t._ferryElapsed||0)+30;}
                t.unloadHexKey=null;t.unloadGoal=null;wodClearTransportMove(t);
                if(wodOrderUnloadTransport(t,goal)&&now-watch.at>=30000&&!watch.landingRetryAt)watch.landingRetryAt=now;
            }
            // A successful new route must get a chance to move. Previously a
            // late native replan succeeded and was overwritten with "go home"
            // in this same pulse because the old cargo clock had expired.
            if(t.target&&(now-watch.at<60000||watch.landingRetryAt!=null&&now-watch.landingRetryAt<20000))continue;
        }
        // A distant assigned passenger can legitimately take longer than the
        // cargo watchdog to reach its embarkation coast. Credit only that real
        // boarding work, not arbitrary movement by another ship in the fleet.
        if(live&&mission.reason==='embark'&&!mission.canSail&&now-watch.at<300000){
            const joining=transports.some(peer=>{
                if(peer===t||peer.owner!==owner||peer._aiFleetId!==mission.id||!peer.pickupUid||peer.hp<=0||peer.retreating||peer._medicalRecovering)return false;
                const passenger=army.find(u=>u.uid===peer.pickupUid),pickup=gameData.hexes[peer.pickupLandKey];
                if(!passenger||passenger.boardTransportUid!==peer.uid||!pickup)return false;
                const walking=passenger.target&&now-(passenger._aiWork?.progressAt??0)<16000&&wodAiArrivalSeconds(passenger,pickup,hr,180)<=180;
                const water=gameData.hexes[peer.pickupWaterKey]||getNeighborHexes(pickup).find(wodIsOpenWaterHex);
                const sailing=peer.target&&now-(peer._aiWork?.progressAt??0)<16000&&water&&wodAiArrivalSeconds(peer,water,hr,180)<=180;
                return walking||sailing;
            });
            if(joining){wodAiObserveWork(t,'transporting','assembling-passengers');continue;}
        }
        // A different boat's progress cannot keep this loaded vessel waiting
        // forever. Brief fleet assembly is retained; each hull has its own cap.
        if(now-watch.at<60000&&!(!live&&!goal)||live&&now-watch.at<90000&&now-(mission.progressAt??mission.at??now)<60000)continue;
        const sea=wodAiSeaRegionFrom(owner,t),homes=gameData.cities.filter(c=>c.owner===owner&&wodAiLandingOnSea(owner,c,sea)&&
            !known.some(e=>Math.hypot(e.x-c.x,e.y-c.y)<(e.range||50)+hr*3));
        homes.sort((a,b)=>Math.hypot(a.x-t.x,a.y-t.y)-Math.hypot(b.x-t.x,b.y-t.y));
        if(homes[0]){
            t._aiFleetId=null;t._aiFerryReturning=true;t.ferryGoal={x:homes[0].x,y:homes[0].y};t.unloadHexKey=null;t.unloadGoal=null;wodClearTransportMove(t);
            wodOrderUnloadTransport(t,t.ferryGoal);wodAiRecord(owner,'ferry-recovered',{unit:t.uid,cargo:t.cargo.uid,reason:'stalled-wave-return',city:homes[0].id});
        }else{
            // Captured or besieged home ports cannot leave evacuation cargo
            // permanently exempt from both fleet planning and safe unloading.
            const shores=(gameData._navalCoastCells?.cells||gameData.hexList.filter(h=>!isWaterHex(h)&&getNeighborHexes(h).some(wodIsOpenWaterHex)))
                .filter(h=>getNeighborHexes(h).some(n=>sea?.has(getHexKey(n)))&&wodIsFriendlyOwner(h.owner,owner)&&
                    (wodCurrentSupplyComponent(h,owner).city||gameData.entities.some(s=>s.owner===owner&&s.type==='supply'&&s.hp>0&&!s.retreating&&Math.hypot(s.x-h.x,s.y-h.y)<wodFortCombatAuraRadiusPx()*.85))&&
                    !known.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<(e.range||50)+hr*2))
                .sort((a,b)=>Math.hypot(a.x-t.x,a.y-t.y)-Math.hypot(b.x-t.x,b.y-t.y));
            let landed=false;
            for(const shore of shores.slice(0,12)){
                const evacuating=t.cargo._navalEvacuating;t.cargo._navalEvacuating=false;
                if(wodOrderUnloadTransport(t,shore)){
                    t._aiEvacFor=null;t._aiMedicalFor=null;t._aiFerryReturning=true;t._aiFleetId=null;t.ferryGoal={x:shore.x,y:shore.y};landed=true;
                    wodAiRecord(owner,'ferry-recovered',{unit:t.uid,cargo:t.cargo.uid,reason:'supported-fallback-shore',target:getHexKey(shore)});break;
                }
                t.cargo._navalEvacuating=evacuating;
            }
            if(!landed){wodAiObserveWork(t,'transporting','no-safe-landing');wodAiRecord(owner,'ferry-blocked',{unit:t.uid,cargo:t.cargo.uid,reason:'no-safe-landing'});}
        }
    }
}

function wodAiFerryLandingSafe(transport,goal) {
    const h=getNearestHexToPoint(goal.x,goal.y),owner=transport.owner,hr=gameData.hexRadius||20;
    if(!h||!transport.cargo)return false;
    if(wodFogActive()&&!wodIsFriendlyOwner(h.owner,owner)&&!wodFogFactionIntel(owner).explored.has(getHexKey(h)))return false;
    if(transport.cargo.type!=='marine'&&!wodCurrentSupplyComponent(h,owner).city&&!gameData.entities.some(s=>s.owner===owner&&s.type==='supply'&&s.hp>0&&!s.retreating&&Math.hypot(s.x-goal.x,s.y-goal.y)<wodFortCombatAuraRadiusPx()*.9))return false;
    const foes=wodAiThreats(owner).filter(e=>Math.hypot(e.x-goal.x,e.y-goal.y)<hr*7);
    const force=[transport.cargo,...gameData.entities.filter(u=>u.owner===owner&&u.hp>u.maxHp*.5&&!u.retreating&&!u._medicalRecovering&&u!==transport&&Math.hypot(u.x-goal.x,u.y-goal.y)<hr*6).flatMap(u=>u.cargo?[u.cargo]:[u])];
    return !foes.length||wodAiForecast(owner,force,foes).ratio>=wodAiAttackThreshold(owner,true);
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

// A flanking squad is authorized by a real fixing force, not by imaginary
// reinforcements already counted in some distant operation's roster.
function wodAiFrontageWingReady(owner,op,army,known) {
    const task=op.frontageTask,now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    if(task?.role!=='flank'||task.until<=now||army.length<3)return false;
    const campaign=task.campaign,ops=wodAiActiveFrontOperations(owner),pins=ops.filter(o=>campaign.pins.includes(o.id)).flatMap(o=>wodAiSquadAvailable(owner,o));
    const foes=known.filter(e=>!e._intelMemory&&e.owner===campaign.hostile&&Math.hypot(e.x-campaign.contact.x,e.y-campaign.contact.y)<hr*10);
    if(!foes.length)return false;
    const fixing=pins.filter(u=>wodAiArrivalSeconds(u,campaign.contact,u.range||50,24)<=24);
    if(fixing.length<3||wodAiForecast(owner,fixing,foes).ratio<.9)return false;
    const wing=op.jobs.find(j=>j.route&&!j.closed);if(!wing)return false;
    const next=wing.route.slice(wing.cursor,wing.cursor+4).map(k=>gameData.hexes[k]).filter(Boolean);
    const danger=wodAiThreats(owner,false).filter(e=>!e._intelMemory&&next.some(h=>Math.hypot(e.x-h.x,e.y-h.y)<(e.range||50)+hr*.7));
    return (!danger.length||wodAiForecast(owner,army,danger).ratio>=wodAiAttackThreshold(owner,true))&&
        wodAiForecast(owner,[...fixing,...army],foes).ratio>=wodAiAttackThreshold(owner,true)&&
        army.filter(u=>wodAiCorridorWithdrawal(u)).length<Math.ceil(army.length*.4);
}

function wodAiFrontagePinReady(owner,op,roster,known) {
    const task=op.frontageTask,now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    if(task?.role!=='pin'||task.until<=now||roster.length<3)return false;
    const foes=known.filter(e=>!e._intelMemory&&e.owner===task.campaign.hostile&&Math.hypot(e.x-task.campaign.contact.x,e.y-task.campaign.contact.y)<hr*12);
    if(!foes.length)return false;
    const lead=roster.slice().sort((a,b)=>Math.hypot(a.x-task.campaign.contact.x,a.y-task.campaign.contact.y)-Math.hypot(b.x-task.campaign.contact.x,b.y-task.campaign.contact.y))[0];
    const near=roster.filter(u=>wodAiArrivalSeconds(u,lead,hr*3,20)<=20&&wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city);
    const danger=foes.some(e=>Math.hypot(e.x-lead.x,e.y-lead.y)<(e.range||50)+hr*2);
    return near.length>=Math.max(3,Math.ceil(roster.length*.65))&&(!danger||near.filter(u=>wodAiArrivalSeconds(u,lead,hr*3,8)<=8).length>=3)&&
        wodAiForecast(owner,near,foes).ratio>=wodAiAttackThreshold(owner,true)+.1&&!near.some(u=>wodAiCorridorWithdrawal(u));
}

function wodAiFrontageRoute(owner,army,route,foes) {
    if(!route?.length||!army.length)return null;
    const cx=army.reduce((n,u)=>n+u.x,0)/army.length,cy=army.reduce((n,u)=>n+u.y,0)/army.length;
    const lead=army.slice().sort((a,b)=>Number(wodCanClimb(a))-Number(wodCanClimb(b))||Math.hypot(a.x-cx,a.y-cy)-Math.hypot(b.x-cx,b.y-cy))[0];
    const origin=getNearestHexToPoint(lead.x,lead.y);
    const entries=route.slice(0,Math.max(1,Math.ceil(route.length*.55))).map((key,index)=>({h:gameData.hexes[key],index}))
        .filter(p=>p.h&&wodIsFriendlyOwner(p.h.owner,owner)&&wodCurrentSupplyComponent(p.h,owner).city)
        .sort((a,b)=>Math.hypot(a.h.x-cx,a.h.y-cy)-Math.hypot(b.h.x-cx,b.h.y-cy));
    for(const entry of entries.slice(0,3)){
        const prefix=wodAiFrontLegs(lead,[origin,entry.h],owner,foes);
        if(prefix)return [...prefix,...route.slice(entry.index+1)];
    }
    return null;
}

// Large armies keep their small permanent squads. Allocate enough squads to
// fix the observed enemy, send separate squads around each safe shoulder and
// give further surplus another stretch of front instead of a rear parking row.
function wodAiCoordinateFrontage(owner,plan,ready) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    if(plan.frontageCheckAt!=null&&now-plan.frontageCheckAt<5000)return;plan.frontageCheckAt=now;
    const ops=wodAiActiveFrontOperations(owner),known=wodAiThreats(owner,false).filter(e=>isLandArmyUnit(e)&&!e._intelMemory),armies=new Map(ops.map(o=>[o,wodAiSquadAvailable(owner,o)]));
    const army=op=>armies.get(op)||[];
    // Losing an asset or discovering a new town rebuilds the base plan. The
    // surviving squads still own their campaign, including its release rules.
    plan.frontageCampaigns=[...new Set([...(plan.frontageCampaigns||[]),...ops.map(o=>o.frontageTask?.campaign).filter(Boolean)])];
    for(const campaign of plan.frontageCampaigns){
        const alive=known.some(e=>e.owner===campaign.hostile&&Math.hypot(e.x-campaign.contact.x,e.y-campaign.contact.y)<hr*10);
        if(alive)campaign.clearAt=null;else campaign.clearAt??=now;
        if(campaign.until>now&&!(campaign.clearAt!=null&&now-campaign.clearAt>=8000)&&campaign.pins.some(id=>ops.some(o=>o.id===id&&army(o).length>=3)))continue;
        campaign.until=now;
        for(const op of ops.filter(o=>o.frontageTask?.campaign===campaign)){
            op.frontageTask=null;if(op.joint?.id===campaign.id+'-pin')op.joint=null;op.commandDecision=null;
            for(const u of army(op)){u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}
        }
        wodAiRecord(owner,'frontage-ended',{job:campaign.id,reason:alive?'reassess':'contact-cleared'});
    }
    plan.frontageCampaigns=plan.frontageCampaigns.filter(c=>c.until>now);
    if(plan.frontageCampaigns.length>=3)return;
    const free=ops.filter(o=>!o.ambush&&!(o.frontageTask?.until>now)&&army(o).length>=3&&
        !o.jobs.some(j=>j.route&&!j.closed&&j.cursor>3));
    const handled=new Set();
    for(const seed of known){
        if(handled.has(seed.uid)||plan.frontageCampaigns.length>=3)continue;
        const foes=known.filter(e=>e.owner===seed.owner&&Math.hypot(e.x-seed.x,e.y-seed.y)<hr*18);for(const e of foes)handled.add(e.uid);
        if(foes.length<2)continue;
        const contact=getNearestHexToPoint(foes.reduce((n,e)=>n+e.x,0)/foes.length,foes.reduce((n,e)=>n+e.y,0)/foes.length);
        const locals=free.filter(o=>!(o.frontageTask?.until>now)&&o.hostile===seed.owner&&army(o).filter(u=>Math.hypot(u.x-contact.x,u.y-contact.y)<hr*20).length>=3)
            .sort((a,b)=>Math.min(...army(a).map(u=>Math.hypot(u.x-contact.x,u.y-contact.y)))-Math.min(...army(b).map(u=>Math.hypot(u.x-contact.x,u.y-contact.y)))).slice(0,8);
        const all=locals.flatMap(army);if(locals.length<3||all.length<15||wodAiForecast(owner,all,foes).ratio<1.2)continue;
        const pins=[],fixing=[];
        for(const op of locals){pins.push(op);fixing.push(...army(op));if(fixing.length>=Math.min(foes.length,Math.ceil(all.length*.4))&&wodAiForecast(owner,fixing,foes).ratio>=Math.max(1.1,wodAiAttackThreshold(owner,true)))break;}
        if(pins.length>Math.ceil(locals.length*.6)||locals.length-pins.length<1)continue;
        const center=fixing.slice().sort((a,b)=>Number(!!b._combatEngaged)-Number(!!a._combatEngaged)||Math.hypot(a.x-contact.x,a.y-contact.y)-Math.hypot(b.x-contact.x,b.y-contact.y))[0];
        const anchor=getNearestHexToPoint(center.x,center.y),envelope=wodAiFrontEnvelopment(owner,all,foes,anchor,all);
        const spare=locals.filter(o=>!pins.includes(o)),wings=[];
        for(const [side,route]of (envelope?.routes||[]).entries()){
            if(!route)continue;
            const shoulder=gameData.hexes[route[Math.min(route.length-1,Math.ceil(route.length*.3))]];
            const choices=spare.filter(o=>!wings.some(w=>w.op===o)).sort((a,b)=>Math.min(...army(a).map(u=>Math.hypot(u.x-shoulder.x,u.y-shoulder.y)))-Math.min(...army(b).map(u=>Math.hypot(u.x-shoulder.x,u.y-shoulder.y))));
            if(known.some(e=>e.owner!==seed.owner&&route.some(k=>{const h=gameData.hexes[k];return h&&Math.hypot(e.x-h.x,e.y-h.y)<(e.range||50)+hr*.7;})))continue;
            for(const op of choices){const path=wodAiFrontageRoute(owner,army(op),route,known);if(path){wings.push({op,route:path,side});break;}}
        }
        const expansions=[];
        for(const op of spare.filter(o=>!wings.some(w=>w.op===o))){
            const force=army(op),lead=force[0],sectors=(plan.sectors||[]).filter(s=>s.attackHex?.owner===seed.owner&&s.holdHex&&
                Math.hypot(s.attackHex.x-contact.x,s.attackHex.y-contact.y)>hr*8&&Math.hypot(s.holdHex.x-lead.x,s.holdHex.y-lead.y)<hr*26&&
                wodCurrentSupplyComponent(s.holdHex,owner).city&&wodAiCanReach(lead,s.attackHex)&&
                (!wodFogActive()||wodFogFactionIntel(owner).explored.has(getHexKey(s.attackHex)))&&
                !expansions.some(e=>Math.hypot(e.hex.x-s.attackHex.x,e.hex.y-s.attackHex.y)<hr*6)&&
                wodAiForecast(owner,force,known.filter(e=>Math.hypot(e.x-s.attackHex.x,e.y-s.attackHex.y)<hr*7)).ratio>=wodAiAttackThreshold(owner));
            sectors.sort((a,b)=>Math.hypot(a.holdHex.x-lead.x,a.holdHex.y-lead.y)+wodAiFrontTargetPenalty(owner,op,a.attackHex)-Math.hypot(b.holdHex.x-lead.x,b.holdHex.y-lead.y)-wodAiFrontTargetPenalty(owner,op,b.attackHex));
            if(sectors[0])expansions.push({op,hex:sectors[0].attackHex,anchor:sectors[0].holdHex});
        }
        if(!wings.length&&!expansions.length)continue;
        const campaign={id:'frontage-'+owner+'-'+Math.floor(now)+'-'+seed.uid,contact,hostile:seed.owner,pins:pins.map(o=>o.id),at:now,until:now+180000};
        plan.frontageCampaigns.push(campaign);
        const joint=pins.length>1?{id:campaign.id+'-pin',squads:campaign.pins,anchor,contact,at:now,until:campaign.until}:null;
        const set=(op,role,goal,origin,route,side)=>{
            const oldJoint=op.joint;
            if(oldJoint)for(const peer of ops.filter(o=>o.joint===oldJoint)){peer.joint=null;peer.commandDecision=null;}
            op.frontageTask={campaign,role,side,until:campaign.until};op.supporting=null;op.joint=role==='pin'?joint:null;
            op.resumeGoal=op.strategicGoal||op.advanceGoal;op.goal=goal;op.advanceGoal=role==='expand'?goal:null;op.strategicGoal=null;op.anchor=origin;
            op.mode=route?'flank':'breakthrough';op.phase='advance';op.launchedAt=now;op.commandDecision=null;op.march=null;op.effect=null;op.until=Math.max(op.until,campaign.until);
            op.jobs=[{id:op.id+'-frontage-'+role,kind:role==='pin'?'hold':'main',role:route?(side===0?'left':'right'):role==='pin'?'pin':'breakthrough',response:true,members:op.members.slice(),frontOperation:op,holdHex:origin,route,cursor:0,bound:0}];
            for(const u of army(op)){u.aiOrderUntil=0;u.aiFrontBound=null;gameData._aiMoveQueue?.delete(u);}
        };
        for(const op of pins)set(op,'pin',contact,getNearestHexToPoint(army(op)[0].x,army(op)[0].y));
        for(const w of wings)set(w.op,'flank',contact,getNearestHexToPoint(army(w.op)[0].x,army(w.op)[0].y),w.route,w.side);
        for(const e of expansions)set(e.op,'expand',e.hex,e.anchor);
        wodAiRecord(owner,'frontage-deployment',{job:campaign.id,troops:all.length,enemy:foes.length,pins:pins.length,flanks:wings.length,expanding:expansions.length});
    }
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
    sites.sort((a,b)=>score(a)-score(b));const target=sites[0]||anchor;used[unit.uid]=getHexKey(target);slotState[unit.uid]={anchor:getHexKey(anchor),at:now};return target;
}
