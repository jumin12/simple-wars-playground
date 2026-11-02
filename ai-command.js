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
    const navalPriority=demand.expedition?.preferred[0]==='ship'&&readyGround>=Math.max(4,cities.length*2)&&usable('ship');
    let reservation=plan.reservation;
    if(reservation&&(!usable(reservation.type)||essential||now-reservation.since>180))reservation=null;
    if(navalPriority)reservation={type:'ship',since:plan.reservation?.type==='ship'?plan.reservation.since:now};
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
    if(plan.hospitalRequest&&!navalPriority&&readyGround>=Math.max(4,cities.length*2)&&!demand.missing.length)reservation=null;
    plan.reservation=reservation;
    plan.savingFor=plan.hospitalRequest&&!reservation?'hospital':reservation&&!canAffordUnit(owner,reservation.type)?reservation.type:null;
    return reservation;
}

function wodAiCanSpendOutsideReserve(owner,type,plan) {
    const cost=getUnitCost(type);
    if(plan.hospitalRequest&&!plan.reservation&&wodPlayerTreasury(owner)-cost.money<WOD_PRICE_HOSPITAL+WOD_PRICE_LIGHT)return false;
    const reserve=plan.reservation;if(!reserve||reserve.type===type)return true;
    const protectedCost=getUnitCost(reserve.type);
    return wodPlayerTreasury(owner)-cost.money>=protectedCost.money&&wodPlayerMpPool(owner)-cost.manpower>=protectedCost.manpower;
}

// Contact ETA searches legal terrain, including real bridge links, with current
// movement penalties. A distant or blocked helper never inflates fighting strength.
function wodAiArrivalSeconds(unit, point, contactRange=0, horizon=120) {
    if(!unit||!point)return Infinity;
    const distance=Math.hypot(unit.x-point.x,unit.y-point.y);
    if(distance<=contactRange)return 0;
    const speed=WOD_UNIT_BASE_SPEED*WOD_MOVE_SPEED_FACTOR*(unit.type==='mountaineer'?1.05:1);
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
    const clusters=[];for(const t of ranked.filter(s=>s.defensePriority>2))if(!clusters.some(p=>Math.hypot(p.x-t.holdHex.x,p.y-t.holdHex.y)<hr*10))clusters.push(t.holdHex);
    const contested=clusters.length;
    const attackFloor=strategy.intent==='defend'?2:Math.max(2,Math.ceil(spare*(strategy.intent==='recover'?.35:.45)));
    const line=Math.min(Math.max(0,spare-attackFloor),Math.max(ranked.length?1:0,Math.round(spare*strategy.defenseShare),Math.min(frontage,contested*2+Math.ceil(frontage*(strategy.intent==='defend'?.35:.15)))));
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
        if(troops<1||area<section.length*2)continue;
        const center=tiles[section[Math.floor(section.length/2)]];
        const closing=visible.filter(e=>Math.hypot(e.x-center.x,e.y-center.y)<hr*12);
        const closureSeconds=Math.min(...closing.map(e=>Math.max(0,Math.hypot(e.x-center.x,e.y-center.y)-(e.range||50))/Math.max(1,(e.speed||15)*WOD_MOVE_SPEED_FACTOR)))+section.length*1.5;
        const withdrawSeconds=wodAiCorridorEvacSeconds(owner,riskTileKeys,index,supplyDepth,neckDepth);
        sections.push({i:section[Math.floor(section.length/2)],troops,area,keys:section,riskTileKeys,predictive:true,closureSeconds,withdrawSeconds});
    }
    return sections.concat(wodAiWideCorridors(owner,tiles,index,edges,roots,supplied,weights,visible,supplyDepth));
}

// Whole-map cross-sections complement the short, winding choke search above.
// A broad salient can have no articulation point and be far wider than six
// cells. Its hostile-facing ends, rather than its empty center, need cover.
function wodAiWideCorridors(owner,tiles,index,edges,roots,supplied,weights,enemies,supplyDepth) {
    const hr=gameData.hexRadius||20,candidates=[],result=[];
    // Supplied insertion order is BFS order. Accumulate each column's actual
    // city routes in reverse, so empty frontier crossings cannot consume the
    // flood budget ahead of a distant push that really needs protection.
    const load=weights.slice(),ordered=[...supplied];
    for(let n=ordered.length-1;n>=0;n--){const i=ordered[n],parent=edges[i].find(j=>(supplyDepth.get(j)??Infinity)<supplyDepth.get(i));if(parent!==undefined)load[parent]+=load[i];}
    const explored=wodFogActive()?wodFogFactionIntel(owner).explored:null;
    const hostile=(h,d)=>{const n=gameData.hexes[(h.q+d.q)+','+(h.r+d.r)];return n&&!isWaterHex(n)&&wodIsHostileOwner(n.owner,owner)&&(!explored||explored.has(getHexKey(n)));};
    for(const axis of ['q','r']){
        const other=axis==='q'?'r':'q',rows=new Map();
        for(const i of supplied){const h=tiles[i];if(!rows.has(h[axis]))rows.set(h[axis],[]);rows.get(h[axis]).push(i);}
        for(const row of rows.values()){
            row.sort((a,b)=>tiles[a][other]-tiles[b][other]);let run=[];
            const consider=()=>{
                if(run.length<=6)return;
                const a=tiles[run[0]],b=tiles[run[run.length-1]],d=axis==='q'?{q:0,r:1}:{q:1,r:0};
                if(!hostile(a,{q:-d.q,r:-d.r})||!hostile(b,d)||run.some(i=>roots.includes(i)))return;
                const traffic=run.reduce((n,i)=>n+load[i],0);if(traffic<1)return;
                const pressure=enemies.filter(e=>Math.min(Math.hypot(e.x-a.x,e.y-a.y),Math.hypot(e.x-b.x,e.y-b.y))<hr*10&&wodAiCanReach(e,a));
                if(!pressure.length)return;
                const distance=Math.min(...pressure.map(e=>Math.min(Math.hypot(e.x-a.x,e.y-a.y),Math.hypot(e.x-b.x,e.y-b.y))));
                candidates.push({keys:run.slice(),gates:[a,b],pressure,score:(distance+run.length*hr*.08)/(1+Math.sqrt(traffic)*.1)});
            };
            for(const i of row){if(run.length&&!edges[run[run.length-1]].includes(i)){consider();run=[];}run.push(i);}consider();
        }
    }
    candidates.sort((a,b)=>a.score-b.score);
    const tested=[],blockedTags=new Uint16Array(tiles.length),safeTags=new Uint16Array(tiles.length),queue=new Int32Array(tiles.length);let floods=0;
    for(const candidate of candidates){
        // Spread the bounded graph floods between different flanking axes.
        if(tested.some(p=>candidate.gates.every(g=>p.some(h=>Math.hypot(h.x-g.x,h.y-g.y)<hr*3))))continue;
        tested.push(candidate.gates);if(floods++>=10)break;
        const stamp=floods;let head=0,tail=0;
        for(const i of candidate.keys)blockedTags[i]=stamp;
        for(const i of roots){safeTags[i]=stamp;queue[tail++]=i;}
        while(head<tail)for(const j of edges[queue[head++]])if(blockedTags[j]!==stamp&&safeTags[j]!==stamp){safeTags[j]=stamp;queue[tail++]=j;}
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
        result.push({i:center,troops,area,keys:candidate.keys,riskTileKeys,predictive:true,wide:true,closureSeconds,withdrawSeconds});
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
        if(now>=op.recoverUntil&&(balance.strategicReady??balance.ready))wodAiSetOperationStage(owner,op,'assemble','recovered');
    }else if(op.stage==='assemble'){
        const gathered=members.filter(u=>Math.hypot(u.x-(job.holdHex||u).x,u.y-(job.holdHex||u).y)<hr*7||Math.hypot(u.x-goal.x,u.y-goal.y)<hr*7);
        const required=Math.max(balance.threats?2:1,Math.ceil(op.roster*(now-op.stageAt>18000?.6:.8)));
        const line=plan.jobs.filter(j=>j.kind==='hold').reduce((n,j)=>n+j.members.length,0),reserve=plan.jobs.filter(j=>j.kind==='reserve').reduce((n,j)=>n+j.members.length,0);
        const defenseReady=!plan.defenseDemand||line>=plan.defenseDemand.line&&reserve>=plan.defenseDemand.reserve;
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
    if(!['defend','recover'].includes(strategy.intent)&&line>desiredLine){
        const threats=wodAiThreats(owner);
        for(const job of plan.jobs.filter(j=>j.kind==='hold').sort((a,b)=>b.members.length-a.members.length)){
            for(const uid of job.members.slice()){
                if(line<=desiredLine)break;
                const u=ready.find(u=>u.uid===uid);
                if(u&&!u._combatEngaged&&!threats.some(e=>Math.hypot(e.x-u.x,e.y-u.y)<hr*8)){
                    release(job,u);line--;
                }
            }
        }
    }
    const mobilize=(amount,kind)=>{
        let need=amount-freeInf().length;
        const donors=infantry.filter(u=>{
            const job=plan.jobs.find(j=>j.id===plan.unitJob[u.uid]);
            return ['main','raid','armor','support'].includes(job?.kind)&&(!u._combatEngaged||strategy.intent==='defend')&&
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
        const u=freeInf().filter(u=>wodAiCanReach(u,sector.holdHex)).sort((a,b)=>wodAiTravelCost(a,sector.holdHex)-wodAiTravelCost(b,sector.holdHex))[0];
        if(!u)break;take(job,u);line++;
    }
    const reserveTarget=demand.reserve;
    let reserve=plan.jobs.filter(j=>j.kind==='reserve').reduce((n,j)=>n+j.members.length,0);
    if(strategy.intent==='attack'&&reserve>reserveTarget)for(const job of plan.jobs.filter(j=>j.kind==='reserve')){
        for(const uid of job.members.slice()){
            if(reserve<=reserveTarget)break;
            const u=ready.find(u=>u.uid===uid);if(u&&!u._combatEngaged){release(job,u);reserve--;}
        }
    }
    if(reserve<reserveTarget&&sectors.length)mobilize(reserveTarget-reserve,'reserve');
    while(reserve<reserveTarget&&freeInf().length&&sectors.length){
        const job=plan.jobs.find(j=>j.kind==='reserve'&&j.members.length<3)||make('reserve',sectors[reserve%sectors.length]);
        const u=freeInf().find(u=>wodAiCanReach(u,job.holdHex));if(!u)break;take(job,u);reserve++;
    }
    wodAiRecord(owner,'defense-allocation',{line,reserve,requiredLine:desiredLine,requiredReserve:reserveTarget,intent:strategy.intent});
    // Move existing guards to new pressure instead of meeting the head count
    // with guards left on a quiet, obsolete part of the front.
    const holds=plan.jobs.filter(j=>j.kind==='hold'&&j.members.length);
    const reserved=new Set();
    for(const sector of sectors.filter(s=>s.defensePriority>3)){
        const covering=holds.filter(j=>Math.hypot(j.holdHex.x-sector.holdHex.x,j.holdHex.y-sector.holdHex.y)<hr*5).reduce((n,j)=>n+j.members.length,0);
        if(covering>=sector.required)continue;
        const job=holds.filter(j=>!reserved.has(j)&&!threatsNear(j.holdHex)).sort((a,b)=>Math.hypot(a.holdHex.x-sector.holdHex.x,a.holdHex.y-sector.holdHex.y)-Math.hypot(b.holdHex.x-sector.holdHex.x,b.holdHex.y-sector.holdHex.y))[0];
        if(job&&job.members.some(id=>{const u=ready.find(u=>u.uid===id);return u&&wodAiCanReach(u,sector.holdHex);})){job.holdHex=sector.holdHex;job.attackHex=sector.attackHex;reserved.add(job);for(const id of job.members){const u=ready.find(u=>u.uid===id);if(u){u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}}}
    }
    function threatsNear(h){return wodAiThreats(owner,false).some(e=>Math.hypot(e.x-h.x,e.y-h.y)<hr*8);}
    if(wodFogActive()&&ready.length>=9&&!wodAiKnownCities(owner).some(c=>wodIsHostileOwner(c.owner,owner))){
        let scouts=plan.jobs.filter(j=>j.kind==='scout').reduce((n,j)=>n+j.members.length,0);
        const recon=infantry.filter(u=>!u._combatEngaged&&(!plan.unitJob[u.uid]||['main','armor','raid'].includes(assignedKind(u))));
        for(const u of recon){
            if(scouts>=2)break;
            const job=make('scout',sectors[scouts%Math.max(1,sectors.length)]);take(job,u);scouts++;
        }
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
    wodAiCoordinateCampaign(owner,plan,ready);
    wodAiConcentrateAssaults(owner,plan,ready);
    wodAiRefreshFrontSupport(owner,plan,ready);
    plan.readyN=ready.length;
}

function wodAiFrontSupportFor(unit,job) {
    const support=gameData._aiFrontSupport?.get(unit);
    return support&&job&&!job.response&&support.job===job.id&&support.hexes===gameData.hexes&&support.until>wodAiOperationTime()?support:null;
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
    return {id,kind:'territory',role:'fix',holdHex,contacts,contactPoint:{x:cluster.x,y:cluster.y},
        anchorAt:stable?(old.anchorAt??previous.at):now,responseState:old?.responseState,_formationSlots:old?._formationSlots,
        enemies:cluster.count,score:100+cluster.count*12};
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
            const j=base(u);if(assigned.has(u)||front.gap<=0||committed>=Math.max(2,Math.ceil(ready.length*.25)))continue;
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

// Keep nearby healthy attackers in one viable operation instead of competing
// two-unit groups. Guard, naval and distant-front assignments remain separate.
function wodAiConcentrateAssaults(owner,plan,ready) {
    const hr=gameData.hexRadius||20;
    const jobs=plan.jobs.filter(j=>['main','armor','raid'].includes(j.kind)&&j.members.length);
    const center=j=>{const us=ready.filter(u=>j.members.includes(u.uid));return{x:us.reduce((n,u)=>n+u.x,0)/Math.max(1,us.length),y:us.reduce((n,u)=>n+u.y,0)/Math.max(1,us.length)};};
    jobs.sort((a,b)=>Number(b.operationState?.stage==='attack')-Number(a.operationState?.stage==='attack')||Number(b.kind==='armor')-Number(a.kind==='armor')||b.members.length-a.members.length);
    for(let i=0;i<jobs.length;i++){
        const a=jobs[i];if(!a.members.length)continue;
        for(const b of jobs.slice(i+1)){
            if(b.operationState?.stage==='attack'&&b.operationState!==a.operationState)continue;
            const regroup=a.waitingForStrength&&b.waitingForStrength;
            if(!b.members.length||a.members.length+b.members.length>14||!regroup&&Math.min(a.members.length,b.members.length)>4)continue;
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
        const contact=Math.min(...foes.map(e=>Math.max(0,Math.hypot(e.x-t.city.x,e.y-t.city.y)-(e.range||50))/Math.max(1,e.speed*WOD_MOVE_SPEED_FACTOR)));
        t.deadline=Math.max(14,contact+20);t.arrivals={};
        const nearest=candidates.slice().sort((a,b)=>Math.hypot(a.x-t.holdHex.x,a.y-t.holdHex.y)-Math.hypot(b.x-t.holdHex.x,b.y-t.holdHex.y)).slice(0,18);
        for(const u of nearest)t.arrivals[u.uid]=wodAiArrivalSeconds(u,t.holdHex,hr*3,Math.max(45,t.deadline));
        const timely=nearest.filter(u=>t.arrivals[u.uid]<=t.deadline),power=timely.reduce((n,u)=>n+wodAiUnitCombatPower(u),0);
        t.feasible=power>=t.neededPower*.9;t.reliefPower=power;
        t.theaterScore=(towns.length===1?400:0)+(t.feasible?240:0)+Math.min(120,t.enemies*15)+200/(1+contact/10)+Number(!!t.city.hasFactory)*35;
    }
    const counters=selected.filter(t=>t.kind==='counter').sort((a,b)=>b.theaterScore-a.theaterScore);
    const prior=plan?.defenseTheater,keep=counters.find(t=>t.id===prior?.id&&t.feasible);
    const primary=keep&&now-prior.at<12000&&keep.theaterScore+90>=counters[0]?.theaterScore?keep:counters[0];
    if(!primary)return null;
    if(plan){if(prior?.id!==primary.id)wodAiRecord(owner,'defense-theater',{job:primary.id,feasible:primary.feasible,seconds:Math.round(primary.deadline),power:primary.reliefPower});plan.defenseTheater={id:primary.id,at:prior?.id===primary.id?prior.at:now};}
    primary.primaryTheater=true;
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
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    if(plan._campaignCheckedAt!=null&&now-plan._campaignCheckedAt<5000)return;
    plan._campaignCheckedAt=now;
    const jobs=plan.jobs.filter(j=>['main','armor','raid'].includes(j.kind)&&j.members.length&&!j.cutoff&&!j.operation);
    const ids=new Set(jobs.flatMap(j=>j.members)),pool=ready.filter(u=>ids.has(u.uid)&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&
        !gameData._aiDefenseByOwner?.[owner]?.unitJob[u.uid]);
    if(!pool.length)return;
    const choices=[];
    for(const city of wodAiKnownCities(owner).filter(c=>wodIsHostileOwner(c.owner,owner))){
        const force=pool.filter(u=>wodAiCanReach(u,city)).sort((a,b)=>Math.hypot(a.x-city.x,a.y-city.y)-Math.hypot(b.x-city.x,b.y-city.y)).slice(0,14);
        if(!force.length)continue;
        // A second front cannot count as immediate support for this theater.
        const lead=force[0],near=force.filter(u=>Math.hypot(u.x-lead.x,u.y-lead.y)<hr*20);
        choices.push({city,ready:wodAiAssaultBalance(owner,near,city).strategicReady,cost:wodAiObjectiveCost(owner,near,city)});
    }
    choices.sort((a,b)=>Number(b.ready)-Number(a.ready)||a.cost-b.cost);
    let best=choices[0];if(!best)return;
    const prior=plan.campaignAim,current=choices.find(c=>c.city.id===prior?.cityId);
    if(current&&now-prior.at<45000&&current.ready===best.ready&&current.cost<=best.cost+10)best=current;
    const aim=plan.campaignAim={cityId:best.city.id,at:prior?.cityId===best.city.id?prior.at:now,reason:best.ready?'reachable-weak-production':'concentrate-for-production',ready:best.ready};
    const strategy=wodAiBattlePlan(owner);strategy.primaryId=aim.cityId;
    for(const job of jobs){
        if(job.objectiveCity?.id===aim.cityId||['attack','consolidate','secure-approach','protect-flanks'].includes(job.operationState?.stage))continue;
        const members=pool.filter(u=>job.members.includes(u.uid));
        if(!members.length||!members.every(u=>wodAiCanReach(u,best.city)))continue;
        const goal=job.objectiveCity||job.objectiveHex;
        if(goal&&wodAiAssaultBalance(owner,members,goal).ready&&job.objectiveCity&&!job.waitingForStrength)continue;
        job.objectiveCity=best.city;job.objectiveHex=null;job.attackHex=gameData.hexes[best.city.q+','+best.city.r];job.recon=false;
        job.phase='assemble';job.phaseAt=now;job.operationState=null;job.waitingForStrength=true;job._formationSlots={};
        for(const u of members){u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}
    }
    wodAiRecord(owner,'campaign-objective',{city:aim.cityId,reason:aim.reason,groups:jobs.length});
}

// A border fight already covered by a superior assault force does not need
// a second commander recalling those same regiments into a holding response.
function wodAiBorderBattleCovered(owner,cluster,plan) {
    if(!plan)return false;
    const hr=gameData.hexRadius||20,foes=wodAiThreats(owner,false).filter(e=>cluster.contacts.includes(e.uid));
    if(foes.some(e=>wodIsFriendlyOwner(getNearestHexToPoint(e.x,e.y)?.owner,owner))||
        gameData.cities.some(c=>c.owner===owner&&Math.hypot(c.x-cluster.x,c.y-cluster.y)<hr*10))return false;
    const fighters=gameData.entities.filter(u=>u.owner===owner&&u.hp>u.maxHp*.5&&!u.retreating&&!u.moraleBroken&&!u._medicalRecovering&&!u.boardTransportUid&&
        ['main','armor','raid'].includes(plan.jobs.find(j=>j.id===plan.unitJob[u.uid])?.kind)&&Math.hypot(u.x-cluster.x,u.y-cluster.y)<hr*9&&
        wodAiArrivalSeconds(u,cluster,u.range||50,12)<=12);
    return fighters.length>=2&&wodAiForecast(owner,fighters,foes).ratio>=wodAiCommander(owner).ratio;
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

function wodAiIssueFrontAdvance(unit,job) {
    const owner=unit.owner,hr=gameData.hexRadius||20,now=wodAiOperationTime(),plan=gameData.aiTaskForces?.[owner];
    if(!plan||!job.attackHex||Math.hypot(unit.x-job.holdHex.x,unit.y-job.holdHex.y)>hr*7)return false;
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
    if(!wodIsHostileOwner(job.attackHex.owner,owner)){
        const front=getHexesInRadius(here.q,here.r,5).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&
            !isWaterHex(h)&&wodIsFriendlyOwner(h.owner,owner)&&canUnitEnterHex(unit,h)&&wodCurrentSupplyComponent(h,owner).city&&
            getNeighborHexes(h).some(n=>!isWaterHex(n)&&wodIsHostileOwner(n.owner,owner)));
        front.sort((a,b)=>Math.hypot(a.x-job.attackHex.x,a.y-job.attackHex.y)-Math.hypot(b.x-job.attackHex.x,b.y-job.attackHex.y)-(forward(a)-forward(b))*.25);
        if(front[0]){job.holdHex=front[0];job.attackHex=getNeighborHexes(front[0]).filter(h=>!isWaterHex(h)&&wodIsHostileOwner(h.owner,owner)).sort((a,b)=>forward(b)-forward(a))[0];}
    }
    let push=plan.frontAdvances?.find(p=>Math.hypot(p.anchor.x-job.holdHex.x,p.anchor.y-job.holdHex.y)<hr*5&&p.until>now&&
        p.members.includes(unit.uid)&&wodIsHostileOwner(p.objectiveHex.owner,owner));
    if(!push){
        if(job._frontProbeAt!=null&&now-job._frontProbeAt<2500)return false;
        job._frontProbeAt=now;
        const members=gameData.entities.filter(u=>u.owner===owner&&isLandArmyUnit(u)&&u.hp>u.maxHp*.65&&!u.retreating&&!u.moraleBroken&&!u._medicalRecovering&&!u.boardTransportUid&&
            !gameData._aiDefenseByOwner?.[owner]?.unitJob[u.uid]&&Math.hypot(u.x-job.holdHex.x,u.y-job.holdHex.y)<hr*7&&
            ['hold','main','armor','raid'].includes(plan.jobs.find(j=>j.id===plan.unitJob[u.uid])?.kind)&&!wodAiCorridorWithdrawal(u));
        const unopposed=wodAiFrontProbeSafe(owner,job.attackHex);
        if(!members.includes(unit)||members.length<(unopposed?1:2))return false;
        const reach=wodAiOperationReach(unit),explored=wodFogActive()?wodFogFactionIntel(owner).explored:null,sites=getHexesInRadius(job.holdHex.q,job.holdHex.r,3).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&
            !isWaterHex(h)&&wodIsHostileOwner(h.owner,owner)&&hasOwnerNeighbor(h,owner)&&reach.has(getHexKey(h))&&canUnitEnterHex(unit,h)&&(!explored||explored.has(getHexKey(h))));
        sites.sort((a,b)=>Math.hypot(a.x-job.attackHex.x,a.y-job.attackHex.y)-Math.hypot(b.x-job.attackHex.x,b.y-job.attackHex.y)-(forward(a)-forward(b))*.6);
        const goal=sites.slice(0,8).find(h=>members.length===1&&wodAiFrontProbeSafe(owner,h)||wodAiAssaultBalance(owner,members,h).ready);
        if(!goal)return false;
        push={anchor:job.holdHex,objectiveHex:goal,members:members.map(u=>u.uid),until:now+18000};
        plan.frontAdvances=(plan.frontAdvances||[]).filter(p=>p.until>now&&wodIsHostileOwner(p.objectiveHex.owner,owner)).slice(-15);plan.frontAdvances.push(push);
        wodAiRecord(owner,'front-advance',{job:job.id,target:getHexKey(goal),troops:members.length});
    }
    const members=gameData.entities.filter(u=>push.members.includes(u.uid)&&u.hp>u.maxHp*.5&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&!u.boardTransportUid&&
        !gameData._aiDefenseByOwner?.[owner]?.unitJob[u.uid]&&!wodAiCorridorWithdrawal(u));
    const unopposed=wodAiFrontProbeSafe(owner,push.objectiveHex);
    if(members.length<(unopposed?1:2)||!members.includes(unit)||!(unopposed&&members.length===1)&&!wodAiAssaultBalance(owner,members,push.objectiveHex).ready)return false;
    const destination=wodAiSectorAdvanceHex(unit,push,members);
    const route=members.length===1&&destination?wodAiLandRoute(unit,destination):null;
    const target=route?.[Math.min(1,route.length-1)]||(members.length>1&&destination?wodAiAdvanceHex(unit,destination,members):null);
    if(!target)return false;
    if(members.length===1&&!wodAiFrontProbeSafe(owner,target))return false;
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
    unit._medicalRecovering=true;unit._medicalEvacuating=true;unit._navalEvacuating=true;unit._needsTransport=true;
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
        if(t.cargo===patient||t.pickupUid===patient.uid){t._aiFleetId=null;t.ferryGoal={...patient._medicalEvacHome};continue;}
        t._aiMedicalFor=null;
    }
    const patients=gameData.entities.filter(u=>u.owner===owner&&u.hp>0&&u._medicalEvacuating&&!u.boardTransportUid)
        .sort((a,b)=>Number(!!b.isGeneral)-Number(!!a.isGeneral)||a.hp/a.maxHp-b.hp/b.maxHp);
    for(const u of patients){
        const home=gameData.cities.find(c=>c.id===u._medicalEvacHome?.id&&c.owner===owner);
        if(!home){u._medicalEvacuating=false;u._navalEvacuating=false;u._medicalEvacHome=null;wodAiRequestMedicalFerry(u);continue;}
        const here=getNearestHexToPoint(u.x,u.y),homeRegion=wodTransportLandingRegion({type:'light',owner},home);
        if(homeRegion?.has(getHexKey(here))){u._medicalEvacuating=false;u._navalEvacuating=false;u._navalLanded=false;u._needsTransport=false;u._medicalGoal=null;u._navalAssaultGoal=null;continue;}
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
            if(!water||!getNeighborHexes(gameData.hexes[getHexKey(getNearestHexToPoint(u._medicalEvacHome.x,u._medicalEvacHome.y))]).some(h=>sea.has(getHexKey(h))))continue;
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

function wodAiManageRecovery(owner) {
    const army=gameData.entities.filter(u=>u.owner===owner&&u.hp>0&&u.type!=='convoy'&&!u.boardTransportUid);
    const radius=wodFortCombatAuraRadiusPx(),hr=gameData.hexRadius||20,threats=wodAiThreats(owner,false);
    const sites=[...(gameData.hospitals||[]).filter(h=>wodEffectiveHospitalOwner(h)===owner),...gameData.cities.filter(c=>c.owner===owner&&!isCitySiegeBlockedForProduction(c))];
    wodAiYieldRecoverySlots(owner,army,sites);
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
        if(wodGetUnitEncirclementState(u,getNearestHexToPoint(u.x,u.y))||!wodIsNavalUnit(u)&&wodAiCorridorWithdrawal(u)){
            // Medical orders yield before a threatened supply route closes,
            // not only after the patient is already trapped.
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
        if(!destination){wodAiRequestMedicalFerry(u);continue;}
        occupied.add(getHexKey(destination));u._medicalRecovering=true;u.holding=false;
        u._medicalWaiting=waiting;
        if(canHealUnit(u)){
            if(u.target&&u._medicalGoal)wodClearTransportMove(u);
            u.retreating=false;continue;
        }
        const same=u._medicalGoal===getHexKey(destination)&&u.target&&(u.stuckTimer||0)<1;
        if(!same&&assignUnitMoveAlongWaypoints(u,[destination],{transportInternal:true})){
            u.retreating=true;u._medicalGoal=getHexKey(destination);u.aiOrderUntil=0;
        }
    }
    wodAiHospitalRequest(owner,army,sites);
    const economy=gameData._aiEconomyPlans?.[owner],request=economy?.hospitalRequest;
    if(request&&wodPlayerTreasury(owner)>=WOD_PRICE_HOSPITAL+WOD_PRICE_LIGHT&&
        army.filter(u=>isLandArmyUnit(u)&&!u._medicalRecovering&&u.hp>u.maxHp*.6).length>=Math.max(4,gameData.cities.filter(c=>c.owner===owner).length*2)){
        const h=gameData.hexes[request.key],policy=wodAiHospitalPolicy(owner,army);
        if(policy.hospitals.length+policy.pending.length<policy.max&&wodAiHospitalSiteSafe(owner,h,policy,sites)&&!wodHospitalPlacementError(h,owner)&&placeHospitalAtHex(h,owner)){economy.hospitalRequest=null;wodAiRecord(owner,'medical-investment',{site:request.key});}
        else economy.hospitalRequest=null;
    }

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
    const passengers=army.filter(u=>u.type==='transport'&&u.cargo).map(t=>t.cargo);
    const ready=[...army,...passengers].filter(u=>isLandArmyUnit(u)&&u.hp>u.maxHp*.6&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&!u._navalEvacuating);
    const guards=new Set();for(const c of cities){const g=ready.filter(u=>u.type==='light'&&!guards.has(u)&&wodAiCanReach(u,c))
        .sort((a,b)=>Math.hypot(a.x-c.x,a.y-c.y)-Math.hypot(b.x-c.x,b.y-c.y))[0];if(g)guards.add(g);}
    const deployable=ready.filter(u=>!guards.has(u)&&!['defend','hold'].includes(u.aiTfKind));
    const defenders=goal?known.filter(e=>!wodIsNavalUnit(e)&&region?.has(getHexKey(getNearestHexToPoint(e.x,e.y)))&&Math.hypot(e.x-goal.x,e.y-goal.y)<hr*13):[];
    const enemyPower=defenders.reduce((n,u)=>n+wodAiUnitCombatPower(u),0),waveSize=Math.min(18,Math.max(3,Math.ceil(enemyPower*1.15)));
    const marineCount=army.filter(u=>u.type==='marine').length+pending.filter(j=>j.mode==='marine').length;
    const wave=[...new Set([...passengers,...deployable])].sort((a,b)=>wodAiUnitCombatPower(b)-wodAiUnitCombatPower(a)).slice(0,waveSize);
    const ordinary=wave.filter(u=>u.type!=='marine'&&!region?.has(getHexKey(getNearestHexToPoint(u.x,u.y))));
    const evac=army.filter(u=>u._medicalEvacuating||u._navalEvacuating);
    const coveredRegions=new Map();
    for(const u of army.filter(u=>isLandArmyUnit(u)&&u.type!=='marine'&&u._navalLanded&&!wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city)){
        const r=wodTransportLandingRegion({type:'light',owner},u);if(r){if(!coveredRegions.has(r))coveredRegions.set(r,[]);coveredRegions.get(r).push(u);}
    }
    let protectedSupply=0;
    for(const units of coveredRegions.values()){
        const clusters=[];for(const u of units)if(!clusters.some(p=>Math.hypot(p.x-u.x,p.y-u.y)<wodFortCombatAuraRadiusPx()*1.5))clusters.push(u);
        protectedSupply+=clusters.length;
    }
    const seas=wodAiSeaThreats(owner).filter(u=>!goal||Math.hypot(u.x-goal.x,u.y-goal.y)<hr*30);
    const seaPower=seas.reduce((n,u)=>n+wodAiUnitCombatPower(u),0),shipPower=wodAiUnitCombatPower({type:'ship',owner,hp:300,damage:14,attackCooldown:2.4,morale:100,x:goal?.x||0,y:goal?.y||0},{type:'water'});
    const coastThreats=defenders.filter(e=>getHexesInRadius(getNearestHexToPoint(e.x,e.y).q,getNearestHexToPoint(e.x,e.y).r,5)
        .some(p=>{const h=gameData.hexes[p.q+','+p.r];return wodIsOpenWaterHex(h)&&Math.hypot(h.x-e.x,h.y-e.y)<80+hr;}));
    const canBombard=coastThreats.length>0,ourPower=wave.reduce((n,u)=>n+wodAiUnitCombatPower(u),0);
    const shipCount=army.filter(u=>u.type==='ship').length+pending.filter(j=>j.mode==='ship').length;
    const combatGap=Math.max(0,enemyPower*profile.ratio-ourPower-(canBombard?shipCount*shipPower*.8:0));
    const coast=cities.some(c=>cityHasWaterNeighbor(c)&&wodAiHarborUseful(c,owner));
    const exploring=!goal&&coast&&wodFogActive()&&gameData.hexList.some(h=>wodIsOpenWaterHex(h)&&!wodFogFactionIntel(owner).explored.has(getHexKey(h)));
    const raidGoal=!goal&&coast&&ready.length>=Math.max(8,cities.length*4)&&
        coastalObjectives.find(t=>ownRegions.some(r=>r.has(getHexKey(getNearestHexToPoint(t.x,t.y))))&&
            (t.shore||cityHasWaterNeighbor(t)));
    const plannedMarines=goal?Math.min(12,Math.max(2,Math.ceil(waveSize*.65))):raidGoal?profile.id==='amphibious'?3:2:exploring?2:0;
    // Existing marines can cross under their own orders. Lift is for the actual
    // ordinary first wave, plus a live rescue request if no free seat can serve it.
    const firstWaveSlots=goal?Math.min(10,Math.max(ordinary.length?1:0,Math.min(ordinary.length,defenders.length?Math.ceil(waveSize*.4):1))):0;
    const transportCount=army.filter(u=>u.type==='transport').length+pending.filter(j=>j.mode==='transport').length;
    const freeFerries=army.filter(u=>u.type==='transport'&&!u.cargo&&!u.pickupUid&&!u._medicalRecovering&&u.hp>u.maxHp*.35).length;
    const medSeats=evac.length?Math.min(2,Math.max(1,Math.ceil(evac.length/3))):0;
    let transport=goal?firstWaveSlots:0;
    if(evac.length)transport=Math.max(transport,medSeats,freeFerries?transport:army.filter(t=>t.type==='transport').length+Number(!army.some(t=>t.type==='transport'&&(t._aiMedicalFor||t.cargo?._navalEvacuating))));
    const newSupply=goal&&ordinary.length&&!ownRegions.some(r=>r===region)&&!coveredRegions.has(region)?1:0;
    const supply=Math.min(12,protectedSupply+newSupply);
    const escort=Math.ceil(seaPower*1.25/Math.max(.5,shipPower));
    const bombard=canBombard?Math.min(6,Math.max(1,Math.ceil(Math.max(0,enemyPower*profile.ratio-ourPower)/Math.max(1,shipPower)))):0;
    const ship=Math.min(14,Math.max(escort,bombard,goal||exploring?1:0));
    const desired={transport,supply,ship,marine:plannedMarines};
    const essentialLift=firstWaveSlots>0&&transportCount===0,essentialSupply=newSupply>0&&army.filter(u=>u.type==='supply').length+pending.filter(j=>j.mode==='supply').length<protectedSupply+1;
    const shortages=[];
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
    const result={stamp,goal,region,wave:wave.map(u=>u.uid),desired,preferred:[...new Set(shortages)],combatGap,enemyPower,ourPower,
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

function wodAiNavalRecon(owner,transports) {
    if(!wodFogActive())return null;
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,intel=wodFogFactionIntel(owner);
    let cache=gameData._aiNavalRecon;
    if(cache?.hexes!==gameData.hexes)cache=gameData._aiNavalRecon={hexes:gameData.hexes,owners:{}};
    const state=cache.owners[owner]||=( {history:[],blocked:{}} );
    const ships=gameData.entities.filter(u=>u.owner===owner&&u.hp>u.maxHp*.7&&!u._medicalRecovering&&!u._aiMedicalFor&&!u.retreating&&!u.moraleBroken&&!u._trafficYield&&!(u._aiSupplyEscortUntil>now));
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
        if(friends.length<2)continue;
        const foothold=friends.some(u=>{const p=getNearestHexToPoint(u.x,u.y);return p?.owner===owner&&(wodCurrentSupplyComponent(p,owner).city||supplyShips.some(s=>Math.hypot(s.x-p.x,s.y-p.y)<wodFortCombatAuraRadiusPx()*.85));});
        const foes=known.filter(e=>region.has(getHexKey(getNearestHexToPoint(e.x,e.y)))&&friends.some(u=>Math.hypot(e.x-u.x,e.y-u.y)<hr*12));
        const seaFoes=known.filter(e=>e.type==='ship'&&Math.hypot(e.x-h.x,e.y-h.y)<hr*18);
        const escorts=gameData.entities.filter(u=>u.owner===owner&&u.type==='ship'&&u.hp>u.maxHp*.65&&!u.retreating);
        if(foothold&&(!seaFoes.length||wodAiForecast(owner,escorts,seaFoes).ratio>=1.35)&&wodAiForecast(owner,[...friends,unit],foes).ratio>=1.3)return true;
    }
    return false;
}

// An amphibious raid chooses an actual safe sea lane, rather than comparing
// every marine with the entire hostile fleet. No hidden positions are read.
function wodAiMarineWaterPath(owner,start,end) {
    if(!start||!end)return [];
    const threats=wodAiSeaThreats(owner),hr=gameData.hexRadius||20,probe={type:'ship',owner};
    if(!threats.length)return wodWaterBfsPath(probe,start,end,9000);
    const safe=h=>wodIsOpenWaterHex(h)&&!threats.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<(e.range||80)+hr*2.5+(e._intelMemory?hr:0));
    if(!safe(start)||!safe(end))return [];
    const heap=[],cost=new Map([[getHexKey(start),0]]),parent=new Map(),closed=new Set(),deadline=performance.now()+6;
    const push=(h,g)=>{const item={h,g,f:g+Math.hypot(h.q-end.q,h.r-end.r)};let i=heap.length;heap.push(item);while(i){const p=(i-1)>>1;if(heap[p].f<=item.f)break;heap[i]=heap[p];i=p;}heap[i]=item;};
    const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1].f<heap[j].f)j++;if(heap[j].f>=last.f)break;heap[i]=heap[j];i=j;}heap[i]=last;}return first;};
    push(start,0);let nodes=0;
    while(heap.length&&nodes++<3000){
        if((nodes&127)===0&&performance.now()>deadline)return [];
        const {h,g}=pop(),key=getHexKey(h);if(closed.has(key))continue;closed.add(key);
        if(wodHexKeysEqual(h,end)){const route=[h];let cur=h;while(parent.has(getHexKey(cur))){cur=parent.get(getHexKey(cur));route.push(cur);}return route.reverse();}
        for(const d of hexDirections){const n=gameData.hexes[(h.q+d.q)+','+(h.r+d.r)],k=n&&getHexKey(n);if(!n||closed.has(k)||!safe(n)||!wodCanStepBetweenHexes(probe,h,n,false))continue;
            const next=g+Math.hypot(d.q,d.r);if(next>=(cost.get(k)??Infinity))continue;cost.set(k,next);parent.set(k,h);push(n,next);}
    }
    return [];
}

// Marine flanks can return to the same continent or land on another island.
// Keep explicit sea legs so a land route cannot steal the landing.
function wodAiPlanMarineRaids(owner,marines) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    let cache=gameData._aiMarineRaids;
    if(cache?.hexes!==gameData.hexes)cache=gameData._aiMarineRaids={hexes:gameData.hexes,owners:{},checked:{},blocked:{}};
    let raid=cache.owners[owner];
    const eligible=u=>u.hp>u.maxHp*.6&&(!u.retreating||raid&&u._aiMarineRaidRetreat===raid.id)&&!u.moraleBroken&&!u._medicalRecovering&&!u.boardTransportUid;
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
        const done=!force.length||now-raid.at>240000||raid.phase==='exploit'&&
            (raid.town?getCityUrbanTerrainHexes(raid.town).every(h=>wodIsFriendlyOwner(h.owner,owner)):now-raid.landedAt>30000);
        if(done){for(const u of marines.filter(u=>raid.ids.includes(u.uid))){u._aiMarineRaid=null;u._navalAssaultUntil=0;}delete cache.owners[owner];cache.checked[owner]=now;return;}
        for(const u of force){u._aiMarineRaid=raid.id;u._navalAssaultUntil=now+8000;}
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
            const minimum=pending||foes.length||now-raid.at<30000?2:1;
            const seaClear=!wodAiSeaThreats(owner).some(e=>raid.water.some((h,i)=>i>0&&distPointToSegmentSquared(e.x,e.y,raid.water[i-1].x,raid.water[i-1].y,h.x,h.y)<Math.pow((e.range||80)+hr*2,2)));
            if(gathered.length>=minimum&&seaClear&&wodAiForecast(owner,gathered,foes).ratio>=wodAiCommander(owner).ratio){raid.phase='crossing';raid.launchedAt=now;}
            else for(const u of force)if(!u.target||u._aiMarineRaidOrder!==raid.id+'-gather'){
                gameData._aiMoveQueue?.delete(u);
                if(assignUnitMoveAlongWaypoints(u,[rally],{transportInternal:true}))u._aiMarineRaidOrder=raid.id+'-gather';
            }
        }
        if(raid.phase==='crossing')for(const u of force){
            const here=getNearestHexToPoint(u.x,u.y);
            if(!isWaterHex(here)&&Math.hypot(u.x-raid.beach.x,u.y-raid.beach.y)<hr*3){u._navalLanded=true;u._aiFleetId=raid.id;continue;}
            if(u._trafficYield)continue;
            if(!u.target||u._aiMarineRaidOrder!==raid.id){
                const start=isWaterHex(here)?here:raid.water[0],probe={type:'ship',owner};
                const path=wodAiMarineWaterPath(owner,start,raid.water.at(-1));
                if(path.length){assignUnitMoveAlongWaypoints(u,[...path,raid.beach],{transportInternal:true});u._aiMarineRaidOrder=raid.id;}
            }
        }
        if(raid.phase==='crossing'&&force.filter(u=>u._navalLanded).length>=Math.ceil(force.length*.7)){
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
    const here=!isWaterHex(current)?current:coast.filter(h=>wodIsFriendlyOwner(h.owner,owner)&&wodCurrentSupplyComponent(h,owner).city&&Math.hypot(h.x-lead.x,h.y-lead.y)<hr*14)
        .sort((a,b)=>Math.hypot(a.x-lead.x,a.y-lead.y)-Math.hypot(b.x-lead.x,b.y-lead.y))[0];
    if(!here)return;
    const land=wodTransportLandingRegion({type:'light',owner},here),known=wodAiThreats(owner),towns=wodAiKnownCities(owner);
    if(!land)return;
    for(const town of towns.filter(c=>c.owner===owner)){
        const pressure=known.filter(e=>Math.hypot(e.x-town.x,e.y-town.y)<(e.range||50)+hr*3);if(!pressure.length)continue;
        const guards=gameData.entities.filter(u=>u.owner===owner&&isLandArmyUnit(u)&&u.hp>u.maxHp*.5&&!u._medicalRecovering&&!u.retreating&&wodAiArrivalSeconds(u,town,hr*3,12)<=12);
        if(wodAiForecast(owner,guards,pressure).ratio<1.1)return;
    }
    const source=coast.filter(h=>land.has(getHexKey(h))&&wodIsFriendlyOwner(h.owner,owner)&&wodCurrentSupplyComponent(h,owner).city&&
        Math.hypot(h.x-lead.x,h.y-lead.y)<hr*14).sort((a,b)=>Math.hypot(a.x-lead.x,a.y-lead.y)-Math.hypot(b.x-lead.x,b.y-lead.y))[0];
    if(!source)return;
    const entry=getNeighborHexes(source).find(wodIsOpenWaterHex),probe={type:'ship',owner},sea=entry&&wodNavalWaterRegionKeys(probe,entry);
    if(!sea||sea.size<80)return;
    if(!getHexesInRadius(entry.q,entry.r,3).some(p=>{const h=gameData.hexes[p.q+','+p.r];return h&&wodIsOpenWaterHex(h)&&getNeighborHexes(h).filter(wodIsOpenWaterHex).length>=7;}))return;
    const party=free.filter(u=>{const h=getNearestHexToPoint(u.x,u.y);return (land.has(getHexKey(h))||isWaterHex(h)&&sea.has(getHexKey(h)))&&Math.hypot(u.x-lead.x,u.y-lead.y)<hr*12;}).slice(0,4);
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
        const water=wodAiMarineWaterPath(owner,entry,exit);if(water.length<2){blocked[getHexKey(beach)]=now+20000;continue;}
        const seaThreats=wodAiSeaThreats(owner).filter(e=>water.some((h,i)=>i>0&&
            distPointToSegmentSquared(e.x,e.y,water[i-1].x,water[i-1].y,h.x,h.y)<Math.pow((e.range||80)+hr*2,2)));
        if(seaThreats.length)continue; // Clear sea lanes before committing unsupported marines.
        const town=towns.filter(c=>wodIsHostileOwner(c.owner,owner)&&Math.hypot(c.x-beach.x,c.y-beach.y)<hr*9).sort((a,b)=>Math.hypot(a.x-beach.x,a.y-beach.y)-Math.hypot(b.x-beach.x,b.y-beach.y))[0];
        const afloat=party.filter(u=>isWaterHex(getNearestHexToPoint(u.x,u.y)));
        const center=afloat.length>=Math.ceil(party.length*.7)&&getNearestHexToPoint(afloat.reduce((n,u)=>n+u.x,0)/afloat.length,afloat.reduce((n,u)=>n+u.y,0)/afloat.length);
        const rally=center&&sea.has(getHexKey(center))&&!wodAiSeaThreats(owner).some(e=>Math.hypot(e.x-center.x,e.y-center.y)<(e.range||80)+hr*2.5)?center:source;
        raid=cache.owners[owner]={id:owner+'-marine-raid-'+now,at:now,phase:'gather',source,rally,beach,water,town,ids:party.map(u=>u.uid)};
        for(const u of party){u._aiMarineRaid=raid.id;u._navalAssaultUntil=now+8000;u._aiMarineRaidOrder=null;gameData._aiMoveQueue?.delete(u);if(assignUnitMoveAlongWaypoints(u,[rally],{transportInternal:true}))u._aiMarineRaidOrder=raid.id+'-gather';}
        wodAiRecord(owner,'marine-raid-prepare',{job:raid.id,troops:party.length,beach:getHexKey(beach)});return;
    }
}

function wodAiChooseNavalMission(owner, transports, candidates, targets, supplyShips) {
    gameData.aiNavalPlans ||= {};
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,old=gameData.aiNavalPlans[owner];
    const fleet=transports.filter(t=>t.owner===owner&&t.hp>0&&!t._medicalRecovering&&!t._aiMedicalFor&&!t.cargo?._navalEvacuating&&!t.retreating&&!t.moraleBroken&&!(t._aiScoutUntil>now));
    const marineForce=candidates.filter(u=>u.type==='marine'&&!u._medicalRecovering&&!u._navalEvacuating);
    if(!fleet.length&&!marineForce.length){
        if(old?.phase==='handoff'&&!gameData.entities.some(u=>u.owner===owner&&u.type==='transport'&&u.cargo)){
            wodAiRecord(owner,'naval-complete',{job:old.id,goal:old.goal?.id});delete gameData.aiNavalPlans[owner];
        }
        return null;
    }
    const ships=gameData.entities.filter(u=>u.owner===owner&&u.type==='ship'&&u.hp>u.maxHp*.45&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&!(u._aiScoutUntil>now));
    const cargo=fleet.filter(t=>t.cargo).map(t=>t.cargo);
    let landed=gameData.entities.filter(u=>u.owner===owner&&u._navalLanded&&u.hp>0);
    const known=wodAiThreats(owner),naval=wodAiSeaThreats(owner);
    const from=fleet[0]||marineForce[0],home=gameData.cities.filter(c=>c.owner===owner&&cityHasWaterNeighbor(c)).sort((a,b)=>
        wodAiDist2(a.x,a.y,from.x,from.y)-wodAiDist2(b.x,b.y,from.x,from.y))[0];
    let goal=old?.goal;
    const oldRegion=goal&&wodTransportLandingRegion({type:'light',owner},getNearestHexToPoint(goal.x,goal.y));
    const actualGoal=goal&&getNearestHexToPoint(goal.x,goal.y);
    const remainingTown=oldRegion&&wodAiKnownCities(owner).find(c=>oldRegion.has(`${c.q},${c.r}`)&&getCityUrbanTerrainHexes(c).some(h=>!wodIsFriendlyOwner(h.owner,owner)));
    const captured=goal&&(goal.shore||String(goal.id).startsWith('shore-'))?actualGoal&&wodIsFriendlyOwner(actualGoal.owner,owner)&&!remainingTown:
        goal&&gameData.cities.some(c=>c.id===goal.id&&wodIsFriendlyOwner(c.owner,owner)&&getCityUrbanTerrainHexes(c).every(h=>wodIsFriendlyOwner(h.owner,owner)));
    if(old&&captured&&cargo.length&&now-(old.handoffAt??now)<25000){
        old.handoffAt??=now;
        old.phase='handoff';old.reason='finish-disembarking';old.canEmbark=false;old.canSail=true;old.checkedAt=now;
        for(const t of fleet.filter(t=>t.cargo)){t._aiFleetId=old.id;t.ferryGoal={x:goal.x,y:goal.y};if(!t.unloadHexKey||!t.target)wodOrderUnloadTransport(t,t.ferryGoal);}
        return old;
    }
    if(old&&captured&&(!cargo.length||now-old.handoffAt>=25000)){
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
    const landing=foothold?getNearestHexToPoint(foothold.x,foothold.y):continuing&&old.landing&&region?.has(getHexKey(old.landing))?old.landing:wodAiInvasionBeach(owner,goal,from);
    const pickups=fleet.map(t=>gameData.entities.find(u=>u.uid===t.pickupUid)).filter(Boolean);
    const pool=[...cargo,...pickups,...landed,...candidates.filter(u=>!u._navalEvacuating&&(!u.isGeneral||wodAiGeneralCanTransfer(u,[goal],supplyShips)))].filter((u,i,a)=>a.indexOf(u)===i)
        .sort((a,b)=>wodAiUnitCombatPower(b)-wodAiUnitCombatPower(a));
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
    const loadedBalance=wodAiForecast(owner,[...new Set(loadedUnits),...fireSupport],beachEnemies);
    const profile=wodAiCommander(owner),groundReady=invaders.length>0&&wodAiForecast(owner,[...invaders,...fireSupport],beachEnemies).ratio>=profile.ratio;
    const independentMarines=!loaded.length&&!landed.length?marineForce:[];
    const marineClusters=independentMarines.map(lead=>independentMarines.filter(m=>Math.hypot(m.x-lead.x,m.y-lead.y)<hr*6)).sort((a,b)=>b.length-a.length);
    const marineCore=marineClusters[0]||[];
    const crossingForce=[...new Set([...loadedUnits,...marineCore])];
    const marineWave=[...new Set([...waveMarines,...marineCore,...landed.filter(u=>u.type==='marine'&&Math.hypot(u.x-landing.x,u.y-landing.y)<hr*7)])];
    const marineOnlyReady=marineWave.length>=(groundEnemies.length?2:1)&&
        wodAiForecast(owner,[...marineWave,...fireSupport],groundEnemies).ratio>=profile.ratio;
    const waveReady=crossingForce.length>0&&wodAiForecast(owner,[...crossingForce,...fireSupport],beachEnemies).ratio>=Math.max(1.05,profile.ratio-.1);
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
    const mission={id:continuing?old.id:owner+'-naval-'+now,owner,hexes:gameData.hexes,at:continuing?old.at:now,
        checkedAt:now,goal,landing,home,phase,reason,requiredSupply,requiredEscorts,
        rendezvous:{x:(loaded[0]||fleet.find(t=>t.pickupUid)||from).x,y:(loaded[0]||fleet.find(t=>t.pickupUid)||from).y},
        requiredTransports:Math.min(10,invaders.filter(u=>u.type!=='marine'&&!landed.includes(u)).length),
        troops:invaders.map(u=>u.uid),transports:fleet.map(t=>t.uid),escorts:ships.map(u=>u.uid),
        support:missionSupply.map(u=>u.uid),forceRatio:balance.ratio,waveTroops:crossingForce.map(u=>u.uid),waveRatio:loadedBalance.ratio,seaRatio:seaBalance.ratio,
        canEmbark:sufficientSupply&&sufficientSea&&groundReady,canStage:true,
        canMarinesSail:sufficientSea&&marineOnlyReady,
        canSail:sufficientSupply&&sufficientSea&&waveReady&&assembled};
    const progress=landed.length+gameData.cities.filter(c=>c.owner===owner&&region?.has(`${c.q},${c.r}`)).length*10+
        (region?[...region].filter(k=>wodIsFriendlyOwner(gameData.hexes[k]?.owner,owner)).length*.01:0);
    mission.progress=progress;mission.progressAt=continuing&&old.progress===progress?old.progressAt||old.at:now;
    gameData.aiNavalPlans[owner]=mission;
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
    const hr=gameData.hexRadius||20,withdrawals=gameData._aiSupplyWithdrawals||=(new WeakMap());
    let pending=withdrawals.get(unit);
    const current=defense.supplyDistance?.get(getHexKey(getNearestHexToPoint(unit.x,unit.y)));
    if(pending&&(pending.hexes!==gameData.hexes||current<=pending.safeDepth)){withdrawals.delete(unit);pending=null;}
    for(const cut of defense.corridors||[]){
        if(!cut.riskUnits?.has(unit.uid))continue;
        const gates=cut.screenPoints||[cut.holdHex],known=wodAiThreats(unit.owner);
        const threats=known.filter(e=>gates.some(p=>Math.hypot(e.x-p.x,e.y-p.y)<hr*8));
        const stamp=Math.floor(wodAiOperationTime()/900);
        if(cut._holdStamp!==stamp){
            cut._holdStamp=stamp;
            const horizon=cut.predictive?Math.min(18,Math.max(3,cut.closureSeconds||12)):10;
            const ratios=gates.flatMap(gate=>{
                const foes=threats.filter(e=>Math.hypot(e.x-gate.x,e.y-gate.y)<hr*8);
                if(!foes.length)return [];
                const help=gameData.entities.filter(u=>u.owner===unit.owner&&!u.boardTransportUid&&!wodIsNavalUnit(u)&&u.type!=='convoy'&&
                    u.hp>u.maxHp*.55&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&Math.hypot(u.x-gate.x,u.y-gate.y)<hr*12&&
                    // A reserve beyond the opposite wing cannot cover both ends.
                    gates.every(p=>p===gate||Math.hypot(u.x-gate.x,u.y-gate.y)<=Math.hypot(u.x-p.x,u.y-p.y)||Math.hypot(p.x-gate.x,p.y-gate.y)<(u.range||50)*1.5)&&
                    (defense.unitJob?.[u.uid]===cut.id||Math.hypot(u.x-gate.x,u.y-gate.y)<(u.range||50)*.9&&
                        foes.some(e=>Math.hypot(u.x-e.x,u.y-e.y)<(u.range||50)))&&wodAiArrivalSeconds(u,gate,u.range||50,horizon)<=horizon);
                return [help.length?wodAiForecast(unit.owner,help,foes).ratio:0];
            });
            cut._holdRatio=ratios.length?Math.min(...ratios):Infinity;
        }
        // A fast hypothetical closure is not a forced retreat when a real,
        // timely force can hold the neck. The defense response screens it while
        // the main attack continues; distant reserves never count as protection.
        const urgent=!cut.predictive||!Number.isFinite(cut.closureSeconds)||cut.closureSeconds<cut.withdrawSeconds*1.4+8;
        if(threats.length&&urgent&&cut._holdRatio<(cut.predictive?1.35:1.05)){
            const safeDepth=Math.max(0,Math.min(...(cut.cutHexes||[cut.holdHex]).map(h=>defense.supplyDistance?.get(getHexKey(h))??0))-2);
            withdrawals.set(unit,{hexes:gameData.hexes,cut,safeDepth});return cut;
        }
        if(pending?.cut.id===cut.id){withdrawals.delete(unit);pending=null;}
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
    const lead=members.find(u=>!wodCanClimb(u))||members[0];if(!lead||members.length<2)return null;
    const hr=gameData.hexRadius||20,now=wodAiOperationTime(),context=wodAiCombatContext(owner);
    const enemies=wodAiThreats(owner,false).filter(u=>!wodIsNavalUnit(u)&&u.type!=='marine');
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
        const hex=gameData.hexes[s.q+','+s.r];if(!hex||!wodIsHostileOwner(hex.owner,owner))continue;
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
function wodAiFrontCritical(response) {
    return response&&['counter','corridor','relief'].includes(response.kind);
}

function wodAiFrontOffensiveJob(unit,plan,response) {
    const op=gameData._aiFrontOffensives?.[unit.owner],now=wodAiOperationTime();
    if(!op||op.hexes!==gameData.hexes||op.until<=now||!op.members.includes(unit.uid)||wodAiFrontCritical(response))return null;
    const base=plan.jobs.find(j=>j.id===plan.unitJob[unit.uid]);
    if(base?.city||base?.fort||unit._medicalRecovering||unit.retreating||unit.moraleBroken||unit._navalAssaultUntil>now)return null;
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
    const ready=army.filter(u=>u.hp>u.maxHp*.55&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city);
    if(ready.length<2)return false;
    const lead=ready.slice().sort((a,b)=>ready.filter(u=>Math.hypot(u.x-b.x,u.y-b.y)<hr*7).length-ready.filter(u=>Math.hypot(u.x-a.x,u.y-a.y)<hr*7).length)[0];
    const core=ready.filter(u=>Math.hypot(u.x-lead.x,u.y-lead.y)<hr*7);
    if(core.length<Math.max(2,Math.ceil(ready.length*.6)))return false;
    const reach=wodAiOperationReach(lead),known=wodAiThreats(owner),old=op.advanceGoal||op.goal;
    const safe=h=>h&&reach.has(getHexKey(h))&&wodAiForecast(owner,core,known.filter(e=>Math.hypot(e.x-h.x,e.y-h.y)<hr*7)).ratio>=1.02;
    let structure=wodAiStructureObjective(owner,core),goal=structure?.hex;
    if(!goal&&op.resumeGoal&&wodIsHostileOwner(op.resumeGoal.owner,owner)&&safe(op.resumeGoal))goal=op.resumeGoal;
    if(!goal){
        const towns=wodAiKnownCities(owner).filter(c=>wodIsHostileOwner(c.owner,owner)&&safe(c)).sort((a,b)=>Math.hypot(a.x-lead.x,a.y-lead.y)-Math.hypot(b.x-lead.x,b.y-lead.y));
        goal=towns[0];
    }
    if(!goal){
        const explored=wodFogActive()?wodFogFactionIntel(owner).explored:null;
        const fronts=buildAiFrontlineSectors(owner,24).filter(s=>s.attackHex&&wodIsHostileOwner(s.attackHex.owner,owner)&&(!explored||explored.has(getHexKey(s.attackHex)))&&
            Math.hypot(s.holdHex.x-lead.x,s.holdHex.y-lead.y)<hr*18&&wodCurrentSupplyComponent(s.holdHex,owner).city&&safe(s.attackHex));
        fronts.sort((a,b)=>Math.hypot(a.attackHex.x-lead.x,a.attackHex.y-lead.y)-Math.hypot(b.attackHex.x-lead.x,b.attackHex.y-lead.y));goal=fronts[0]?.attackHex;
    }
    if(!goal)return false;
    op.anchor=getNearestHexToPoint(lead.x,lead.y);op.goal=goal;op.advanceGoal=goal;op.advanceStructure=structure;op.resumeGoal=null;
    op.hostile=goal.owner;op.phase='advance';op.stage='attack';op.until=now+120000;op.progress={key:goal.id||getHexKey(goal),distance:Math.hypot(lead.x-goal.x,lead.y-goal.y),at:now};op.march=null;op.nextCheckAt=null;
    op.jobs=[{id:op.id+'-follow-'+(op.followSerial=(op.followSerial||0)+1),kind:'main',role:'breakthrough',response:true,members:army.map(u=>u.uid),frontOperation:op,holdHex:op.anchor,bound:op.followSerial}];
    for(const u of army){u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}
    wodAiRecord(owner,'front-operation-followthrough',{id:op.id,target:goal.id||getHexKey(goal),kind:structure?.kind||goal.id&&'town'||'land',from:old.id||getHexKey(old)});
    return true;
}

// Use cardinal legs so the advancing wings actually paint a connected supply
// corridor. Never shortcut a planned wing through the army it is going around.
function wodAiFrontLegs(lead,points,owner,foes) {
    const explored=wodFogActive()?wodFogFactionIntel(owner).explored:null,hr=gameData.hexRadius||20;
    const route=[getHexKey(getNearestHexToPoint(points[0].x,points[0].y))],reach=wodAiOperationReach(lead);let from=points[0];
    const legal=h=>h&&!isWaterHex(h)&&canUnitEnterHex(lead,h)&&reach.has(getHexKey(h))&&(!explored||explored.has(getHexKey(h)))&&
        !foes.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<(e.range||50)+hr*.7&&!wodIsFriendlyOwner(h.owner,owner));
    for(const to of points.slice(1)){
        const n=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/hr));
        for(let i=1;i<=n;i++){
            const h=getNearestHexToPoint(from.x+(to.x-from.x)*i/n,from.y+(to.y-from.y)*i/n);
            if(!legal(h))return null;
            const prev=gameData.hexes[route.at(-1)];
            if(prev.q!==h.q&&prev.r!==h.r){
                const corner=[gameData.hexes[h.q+','+prev.r],gameData.hexes[prev.q+','+h.r]].find(legal);
                if(!corner)return null;route.push(getHexKey(corner));
            }
            if(route.at(-1)!==getHexKey(h))route.push(getHexKey(h));
        }
        from=to;
    }
    return route;
}

function wodAiFrontEnvelopment(owner,army,foes,anchor) {
    if(army.length<8||foes.length<2||wodAiForecast(owner,army,foes).ratio<1.3)return null;
    const hr=gameData.hexRadius||20,cx=foes.reduce((n,e)=>n+e.x,0)/foes.length,cy=foes.reduce((n,e)=>n+e.y,0)/foes.length;
    const dx=cx-anchor.x,dy=cy-anchor.y,len=Math.hypot(dx,dy)||1,ax=dx/len,ay=dy/len;
    let width=hr*4,depth=hr*3;
    for(const e of foes){width=Math.max(width,Math.abs((e.x-cx)*-ay+(e.y-cy)*ax)+(e.range||50)+hr*2);depth=Math.max(depth,(e.x-cx)*ax+(e.y-cy)*ay+(e.range||50)+hr*3);}
    if(width>hr*13||depth>hr*12)return null;
    const rear={x:cx+ax*depth,y:cy+ay*depth},routes=[];
    for(const side of [-1,1]){
        const outer={x:anchor.x-ay*width*side,y:anchor.y+ax*width*side};
        const shoulder={x:rear.x-ay*width*side,y:rear.y+ax*width*side};
        const route=wodAiFrontLegs(army.find(u=>!wodCanClimb(u))||army[0],[anchor,outer,shoulder,rear],owner,foes);
        if(!route)return null;routes.push(route);
    }
    return {routes,rear:getNearestHexToPoint(rear.x,rear.y)};
}

function wodAiPlanFrontOffensive(owner,plan,ready) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    gameData._aiFrontOffensives||={};gameData._aiFrontOffensiveChecks||={};
    const previous=gameData._aiFrontOffensives[owner],check=gameData._aiFrontOffensiveChecks[owner];
    if(check?.hexes===gameData.hexes&&now-check.at<2500)return previous;
    gameData._aiFrontOffensiveChecks[owner]={hexes:gameData.hexes,at:now};
    const defense=gameData._aiDefenseByOwner?.[owner],base=u=>plan.jobs.find(j=>j.id===plan.unitJob[u.uid]);
    const response=u=>defense?.jobs.find(j=>j.id===defense.unitJob[u.uid]);
    const eligible=(u,continuing=false)=>isLandArmyUnit(u)&&u.type!=='marine'&&!u._navalLanded&&!u.boardTransportUid&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&u.hp>u.maxHp*(continuing?.45:.62)&&
        !base(u)?.city&&!base(u)?.fort&&!['scout','support'].includes(base(u)?.kind)&&!wodAiFrontCritical(response(u))&&
        !(u._navalAssaultUntil>now)&&!wodAiCorridorWithdrawal(u)&&wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city;
    const pool=ready.filter(u=>eligible(u)),known=wodAiThreats(owner).filter(e=>!wodIsNavalUnit(e)&&e.type!=='convoy');
    if(previous?.hexes===gameData.hexes&&previous.until>now){
        const army=ready.filter(u=>previous.members.includes(u.uid)&&eligible(u,true)),foes=known.filter(e=>Math.hypot(e.x-previous.goal.x,e.y-previous.goal.y)<hr*9||army.some(u=>Math.hypot(e.x-u.x,e.y-u.y)<hr*6));
        if(previous.phase==='consolidate'){
            if(now-(previous.consolidateAt??=now)>=3000)wodAiContinueFrontOffensive(owner,previous,army);
            return previous;
        }
        const ratio=wodAiForecast(owner,army,foes).ratio;
        const lost=army.length<Math.max(previous.phase==='gather'?3:2,Math.ceil(previous.initialN*.45)),unsafe=ratio<.82;
        if(!unsafe)previous.unsafeSince=null;else previous.unsafeSince??=now;
        if(!lost&&!(unsafe&&now-previous.unsafeSince>5000)){
            const goal=previous.advanceGoal||previous.goal,closest=army.length?Math.min(...army.map(u=>Math.hypot(u.x-goal.x,u.y-goal.y))):Infinity,key=goal.id||getHexKey(goal);
            const progress=previous.progress;
            if(!progress||progress.key!==key||closest<progress.distance-hr*.75){previous.progress={key,distance:closest,at:now};previous.until=Math.max(previous.until,now+45000);}
            // Feed this operation from the rear without moving its original
            // rendezvous or recalling the vanguard to collect new recruits.
            if(previous.members.length<14)for(const u of pool){
                if(previous.members.includes(u.uid)||base(u)?.kind==='reserve'||Math.hypot(u.x-previous.anchor.x,u.y-previous.anchor.y)>hr*30)continue;
                const other=known.some(e=>e.owner!==previous.hostile&&Math.hypot(e.x-u.x,e.y-u.y)<hr*9);
                if(other||!wodAiCanReach(u,previous.goal))continue;
                previous.members.push(u.uid);const j=previous.jobs.slice().sort((a,b)=>a.members.length-b.members.length)[0];j.members.push(u.uid);u.aiOrderUntil=0;
                if(previous.members.length>=14)break;
            }
            return previous;
        }
        previous.until=now;wodAiRecord(owner,'front-operation-end',{reason:lost?'losses-or-emergency':'sustained-disadvantage',id:previous.id});
        return null;
    }
    if(pool.length<3)return null;
    // Retain one actual reserve. A town garrison is never in this pool.
    const reserve=pool.find(u=>base(u)?.kind==='reserve');if(reserve)pool.splice(pool.indexOf(reserve),1);
    if(pool.length<3)return null;
    const explored=wodFogActive()?wodFogFactionIntel(owner).explored:null,choices=[];
    for(const sector of plan.sectors||[]){
        const h=sector.attackHex,a=sector.holdHex;
        if(!h||!a||isWaterHex(h)||!wodIsHostileOwner(h.owner,owner)||explored&&!explored.has(getHexKey(h))||!wodCurrentSupplyComponent(a,owner).city)continue;
        const army=pool.filter(u=>Math.hypot(u.x-a.x,u.y-a.y)<hr*32&&wodAiCanReach(u,h)&&
            !known.some(e=>e.owner!==h.owner&&Math.hypot(e.x-u.x,e.y-u.y)<hr*8)).sort((u,v)=>Math.hypot(u.x-a.x,u.y-a.y)-Math.hypot(v.x-a.x,v.y-a.y)).slice(0,14);
        if(army.length<3)continue;
        const foes=known.filter(e=>Math.hypot(e.x-h.x,e.y-h.y)<hr*8),ratio=wodAiForecast(owner,army,foes).ratio;
        if(ratio<.98)continue;
        const near=army.filter(u=>Math.hypot(u.x-a.x,u.y-a.y)<hr*10).length;
        const score=near*3+Math.min(4,ratio)*4-army.reduce((n,u)=>n+Math.hypot(u.x-a.x,u.y-a.y)/hr,0)/army.length*.4-foes.length*.6;
        choices.push({sector,army,foes,ratio,score});
    }
    // Prefer a real double envelopment when a gathered army can spare two
    // viable wings. Selecting only the emptiest cell always walked around the
    // contact without ever planning to close behind it.
    for(const c of choices.slice().sort((a,b)=>b.army.length-a.army.length).slice(0,6)){
        if(c.army.length<8)continue;
        const center=c.foes.find(e=>!e._intelMemory&&e.owner===c.sector.attackHex.owner);if(!center)continue;
        const foes=known.filter(e=>!e._intelMemory&&e.owner===center.owner&&Math.hypot(e.x-center.x,e.y-center.y)<hr*8);
        const front=choices.filter(p=>p.sector.attackHex.owner===center.owner).sort((a,b)=>Math.hypot(a.sector.holdHex.x-center.x,a.sector.holdHex.y-center.y)-Math.hypot(b.sector.holdHex.x-center.x,b.sector.holdHex.y-center.y))[0];
        const envelope=wodAiFrontEnvelopment(owner,c.army,foes,front.sector.holdHex);
        if(envelope){c.sector=front.sector;c.foes=foes;c.envelope=envelope;c.score+=24;break;}
    }
    choices.sort((a,b)=>b.score-a.score);const choice=choices[0];if(!choice)return null;
    const {sector,army}=choice,anchor=sector.holdHex;
    const foes=choice.foes.filter(e=>!e._intelMemory&&e.owner===sector.attackHex.owner);
    const envelope=choice.envelope||wodAiFrontEnvelopment(owner,army,foes,anchor);
    const id='front-'+owner+'-'+Math.floor(now),op={id,hexes:gameData.hexes,at:now,until:now+180000,anchor,goal:sector.attackHex,hostile:sector.attackHex.owner,members:army.map(u=>u.uid),initialN:army.length,phase:'gather',mode:envelope?'envelopment':'breakthrough',probe:!envelope&&choice.foes.length>0&&choice.ratio<1.12,jobs:[],bound:0};
    const add=(role,members,route)=>op.jobs.push({id:id+'-'+role,kind:role==='pin'?'hold':'main',role,response:true,members:members.map(u=>u.uid),frontOperation:op,holdHex:anchor,route,cursor:0,bound:0});
    if(envelope){
        const pin=army.slice().sort((a,b)=>Number(!!b.isGeneral)-Number(!!a.isGeneral)||Number(b.type==='heavy')-Number(a.type==='heavy')||Number(!!b._combatEngaged)-Number(!!a._combatEngaged)).slice(0,Math.max(2,Math.floor(army.length*.3)));
        for(const u of army)if(pin.length<Math.max(2,Math.floor(army.length*.3))&&!pin.includes(u))pin.push(u);
        const dx=op.goal.x-anchor.x,dy=op.goal.y-anchor.y;
        const wings=army.filter(u=>!pin.includes(u)).sort((a,b)=>(a.y-anchor.y)*dx-(a.x-anchor.x)*dy-((b.y-anchor.y)*dx-(b.x-anchor.x)*dy)),half=Math.ceil(wings.length/2);
        add('pin',pin);add('left',wings.slice(0,half),envelope.routes[0]);add('right',wings.slice(half),envelope.routes[1]);op.rear=envelope.rear;
    }else add('breakthrough',army);
    gameData._aiFrontOffensives[owner]=op;
    for(const u of army){u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}
    wodAiRecord(owner,'front-operation-start',{id,mode:op.mode,troops:army.length,enemy:foes.length,ratio:Math.round(choice.ratio*100)/100,target:getHexKey(op.goal)});
    return op;
}

function wodAiIssueFrontOffensive(unit,job) {
    const op=job.frontOperation,now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    const army=gameData.entities.filter(u=>op.members.includes(u.uid)&&u.hp>u.maxHp*.4&&!u.retreating&&!u._medicalRecovering&&!u.moraleBroken&&!wodAiFrontCritical(gameData._aiDefenseByOwner?.[unit.owner]?.jobs.find(j=>j.id===gameData._aiDefenseByOwner[unit.owner].unitJob[u.uid])));
    if(!army.length)return false;
    if(op.phase==='consolidate'){
        if(now-(op.consolidateAt??now)>=3000&&wodAiContinueFrontOffensive(unit.owner,op,army))return wodAiIssueFrontOffensive(unit,wodAiFrontOffensiveJob(unit,gameData.aiTaskForces[unit.owner])||op.jobs[0]);
        const here=getNearestHexToPoint(unit.x,unit.y);
        if(here&&wodIsFriendlyOwner(here.owner,unit.owner)){wodAiStampOrder(unit,true,here,3000);unit.aiOrderPhase=op.phase;unit.aiFrontBound=job.bound;return true;}
    }
    if(op.phase==='gather'){
        const gathered=army.filter(u=>Math.hypot(u.x-op.anchor.x,u.y-op.anchor.y)<hr*8);
        const foes=wodAiThreats(unit.owner).filter(e=>Math.hypot(e.x-op.goal.x,e.y-op.goal.y)<hr*7);
        if(gathered.length>=Math.max(3,Math.ceil(Math.min(op.initialN,army.length)*.65))&&wodAiForecast(unit.owner,gathered,foes).ratio>=.98){
            op.phase='advance';op.launchedAt=now;wodAiRecord(unit.owner,'front-operation-launch',{id:op.id,troops:gathered.length,mode:op.mode});
        }
    }
    if(wodAiTacticalFallback(unit,job))return true;
    let target,holding=false;const members=army.filter(u=>job.members.includes(u.uid));
    if(op.phase==='gather'){
        target=wodAiFormationSlot(unit,job,op.anchor,op.goal,army);holding=true;
    }else if(job.route){
        // Each wing advances together through a fixed chain. Behind-the-line
        // recruits catch up; they never move its current bound backwards.
        while(job.cursor<job.route.length-1){
            const h=gameData.hexes[job.route[job.cursor]],near=members.filter(u=>Math.hypot(u.x-h.x,u.y-h.y)<hr*2.2);
            const trailing=near.length>=Math.min(2,members.length)&&wodIsFriendlyOwner(h.owner,unit.owner)&&now-(job.boundAt??op.launchedAt??now)>12000;
            if(near.length<Math.max(1,Math.ceil(members.length*.6))&&!trailing)break;job.cursor++;job.bound++;job.boundAt=now;
            op.until=Math.min(op.at+360000,Math.max(op.until,now+45000));
        }
        const h=gameData.hexes[job.route[job.cursor]];
        // Preserve the supply trail; no water or hostile-corner route shortcut.
        if(job.slotBound!==job.bound){job.slotBound=job.bound;job.slots={};}
        const foes=wodAiThreats(unit.owner,false),used=new Set(Object.entries(job.slots).filter(([id])=>id!==unit.uid).map(([,k])=>k));
        const sites=getHexesInRadius(h.q,h.r,2).map(p=>gameData.hexes[p.q+','+p.r]).filter(p=>p&&!used.has(getHexKey(p))&&!isWaterHex(p)&&canUnitEnterHex(unit,p)&&
            !foes.some(e=>Math.hypot(e.x-p.x,e.y-p.y)<(e.range||50)+hr*.5)&&!isWorldPositionBlockedByUnits(unit,p.x,p.y));
        sites.sort((a,b)=>Math.hypot(a.x-h.x,a.y-h.y)-Math.hypot(b.x-h.x,b.y-h.y));
        target=gameData.hexes[job.slots[unit.uid]]||sites[0]||h;job.slots[unit.uid]=getHexKey(target);
        if(job.cursor===job.route.length-1&&members.filter(u=>Math.hypot(u.x-h.x,u.y-h.y)<hr*3).length>=Math.min(2,members.length)&&job.route.every(k=>wodIsFriendlyOwner(gameData.hexes[k]?.owner,unit.owner)))job.closed=true;
        if(op.jobs.filter(j=>j.route).every(j=>j.closed))wodAiFinishFrontOffensive(unit.owner,op,'wings-joined');
    }else if(job.role==='pin'){
        const enemies=wodAiThreats(unit.owner,false).filter(e=>e.owner===op.hostile&&Math.hypot(e.x-op.goal.x,e.y-op.goal.y)<hr*10);
        const close=enemies.slice().sort((a,b)=>Math.hypot(a.x-unit.x,a.y-unit.y)-Math.hypot(b.x-unit.x,b.y-unit.y))[0];
        const safe=!enemies.length||wodAiForecast(unit.owner,members,enemies).ratio>=1;
        target=close&&safe?wodAiAdvanceHex(unit,getNearestHexToPoint(close.x,close.y),members):wodAiFormationSlot(unit,job,op.anchor,op.goal,members);holding=!safe;
    }else{
        if((!op.advanceStructure||!wodIsHostileOwner(op.advanceStructure.hex.owner,unit.owner))&&(op.structureCheckAt==null||now-op.structureCheckAt>=3000)){
            op.structureCheckAt=now;const structure=wodAiStructureObjective(unit.owner,members,op.advanceGoal||op.goal);
            if(structure){
                op.resumeGoal=op.advanceGoal;op.advanceGoal=structure.hex;op.advanceStructure=structure;op.march=null;
                for(const u of army)u.aiFrontBound=null;
                wodAiRecord(unit.owner,'structure-opportunity',{job:op.id,kind:structure.kind,target:getHexKey(structure.hex)});
            }
        }
        if(!op.advanceGoal){
            const town=wodAiKnownCities(unit.owner).filter(c=>c.owner===op.hostile&&wodAiCanReach(unit,c)).sort((a,b)=>Math.hypot(a.x-op.goal.x,a.y-op.goal.y)-Math.hypot(b.x-op.goal.x,b.y-op.goal.y))[0];
            const dx=op.goal.x-op.anchor.x,dy=op.goal.y-op.anchor.y,len=Math.hypot(dx,dy)||1;
            op.advanceGoal=(!op.probe&&town)||getNearestHexToPoint(op.goal.x+dx/len*hr*(op.probe?3:9),op.goal.y+dy/len*hr*(op.probe?3:9))||op.goal;
        }
        if(op.advanceGoal.id&&op.advanceGoal.owner===unit.owner)target=wodAiTownAssaultHex(unit,op.advanceGoal,members);
        else {
            op.stage='attack';
            target=wodAiAssaultMarchHex(unit,op,op.advanceGoal,members)||wodAiAdvanceHex(unit,op.advanceGoal,members);
            job.bound=op.march?.id||0;
        }
        const captured=op.advanceGoal.id?getCityUrbanTerrainHexes(op.advanceGoal).every(h=>wodIsFriendlyOwner(h.owner,unit.owner)):wodIsFriendlyOwner(op.advanceGoal.owner,unit.owner);
        const arrived=members.filter(u=>Math.hypot(u.x-op.advanceGoal.x,u.y-op.advanceGoal.y)<hr*4).length>=Math.max(2,Math.ceil(members.length*.6));
        if(captured&&arrived){
            if(wodAiContinueFrontOffensive(unit.owner,op,army))return wodAiIssueFrontOffensive(unit,op.jobs[0]);
            wodAiFinishFrontOffensive(unit.owner,op,'objective-secured');
        }
    }
    if(!target)return false;
    const moved=wodAiMoveUnitTowardHex(unit,target,holding,.12);
    if(moved){wodAiStampOrder(unit,holding,target,5500);unit.aiOrderPhase=op.phase;unit.aiOrderResponseId=job.id;unit.aiFrontBound=job.bound;}
    return moved;
}

function wodAiFormationSlot(unit,job,anchor,goal,members) {
    const hr=gameData.hexRadius||20,ids=members.map(u=>u.uid).sort(),rank=Math.max(0,ids.indexOf(unit.uid));
    const dx=goal.x-anchor.x,dy=goal.y-anchor.y,len=Math.hypot(dx,dy)||1;
    const lane=(rank%5-2)*hr*1.5,row=Math.floor(rank/5)*hr*1.6;
    const desired={x:anchor.x-dy/len*lane-dx/len*row,y:anchor.y+dx/len*lane-dy/len*row};
    const used=job._formationSlots||=( {} ),reach=wodAiOperationReach(unit),threats=wodAiThreats(unit.owner,false);
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
    sites.sort((a,b)=>score(a)-score(b));const target=sites[0]||anchor;used[unit.uid]=getHexKey(target);return target;
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
        const anchor=route[Math.min(5,route.length-1)],origin=getNearestHexToPoint(lead.x,lead.y);
        const dx=anchor.x-origin.x,dy=anchor.y-origin.y,len=Math.hypot(dx,dy)||1;
        const ordered=force.slice().sort((a,b)=>(a.x-cx)*-dy+(a.y-cy)*dx-((b.x-cx)*-dy+(b.y-cy)*dx)||a.uid.localeCompare(b.uid));
        march=op.march={id:(op.boundSerial=(op.boundSerial||0)+1),at:now,goal:goal.id||getHexKey(goal),anchor,origin,dx:dx/len,dy:dy/len,
            ids:core.map(u=>u.uid),order:ordered.map(u=>u.uid),slots:{}};
    }
    if(!march.order.includes(unit.uid))march.order.push(unit.uid);
    const rank=march.order.indexOf(unit.uid),width=Math.min(5,march.order.length),lane=(rank%width-(width-1)/2)*hr*1.6,row=Math.floor(rank/width)*hr*1.7;
    const x=march.anchor.x-march.dy*lane-march.dx*row,y=march.anchor.y+march.dx*lane-march.dy*row;
    const reach=wodAiOperationReach(unit),legal=h=>h&&!isWaterHex(h)&&canUnitEnterHex(unit,h)&&reach.has(getHexKey(h));
    let target=gameData.hexes[march.slots[unit.uid]];
    if(!legal(target)){
        const used=new Set(Object.entries(march.slots).filter(([id])=>id!==unit.uid).map(([,k])=>k));
        const sites=getHexesInRadius(march.anchor.q,march.anchor.r,4).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>legal(h)&&!used.has(getHexKey(h))&&
            (h.x-march.origin.x)*march.dx+(h.y-march.origin.y)*march.dy>hr*.5);
        sites.sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y));target=sites[0];
        if(target)march.slots[unit.uid]=getHexKey(target);
    }
    // A vanguard that already passed this bound keeps moving forward. It must
    // never reverse to an old formation slot while the rear catches up.
    if(target&&(target.x-unit.x)*march.dx+(target.y-unit.y)*march.dy<-hr*.7)return null;
    return target||null;
}

function wodAiDirectBeachhead(owner,supplyShips) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,radius=wodFortCombatAuraRadiusPx();
    const troops=gameData.entities.filter(u=>u.owner===owner&&u.hp>0&&u._navalLanded&&!u._navalEvacuating&&
        !u._medicalRecovering&&!u.boardTransportUid&&!u.retreating&&!u.moraleBroken&&!isWaterHex(getNearestHexToPoint(u.x,u.y)));
    const known=wodAiKnownCities(owner),threats=wodAiThreats(owner),groups=new Map();
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
        if(!town&&force.every(u=>wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city)){
            for(const u of force){u._navalLanded=false;u._navalAssaultUntil=0;u._navalAdvanceGoal=null;}continue;
        }
        const goal=town||remaining.sort((a,b)=>Math.hypot(a.x-force[0].x,a.y-force[0].y)-Math.hypot(b.x-force[0].x,b.y-force[0].y))[0];
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
        const ready=local.length>=Math.min(force.length,resistance.length?2:1)&&wodAiForecast(owner,[...local,...fire],resistance).ratio>=wodAiCommander(owner).ratio;
        const reserved=new Map();
        for(const u of force){
            const order=u._aiBeachheadOrder,h=order&&gameData.hexes[order.key];
            if(order&&u.target&&h&&covered(u,h)&&(!order.attack||wodIsHostileOwner(h.owner,owner))&&
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
            const urban=town?new Set(getCityUrbanTerrainHexes(town).map(getHexKey)):new Set();
            const targets=remaining.filter(h=>legal(h)&&(!wodFogActive()||wodFogFactionIntel(owner).explored.has(getHexKey(h))));
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
                if(same||assignUnitMoveAlongWaypoints(u,[{x:target.x,y:target.y}]))u._aiBeachheadOrder={key,attack,at:now};
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
        if(!ids.has(id))result.push({...r.snapshot,_intelMemory:true,_intelConfidence:.65,uncertainty:(gameData.hexRadius||20)*4});
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
