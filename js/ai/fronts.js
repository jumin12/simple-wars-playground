// AI: fronts for the land task forces. Fronts per enemy, groups and their support, pursuit, offensives and their
// operations, envelopments and wings, ambushes, and frontage (how a line of troops faces an enemy line).
'use strict';

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
                if(u&&!u._combatEngaged&&!wodAiFrontCritical(gameData._aiDefenseByOwner?.[owner]?.jobs.find(j=>j.id===gameData._aiDefenseByOwner[owner].unitJob[u.uid]),u)&&wodAiQuietFrontSafe(owner,u,threats)){
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
            const u=ready.find(u=>u.uid===uid);if(u&&!u._combatEngaged&&!wodAiFrontCritical(gameData._aiDefenseByOwner?.[owner]?.jobs.find(j=>j.id===gameData._aiDefenseByOwner[owner].unitJob[u.uid]),u)&&wodAiQuietFrontSafe(owner,u)){release(job,u);reserve--;}
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

// Firing space belongs to the battle, including neighboring squads' future
// destinations. Search across the visible line instead of queueing everyone
// behind the nearest enemy when its small firing arc is already occupied.
function wodAiContactFiringHex(unit,enemies,previous,advancing=false) {
    if(!enemies.length)return null;
    const hr=gameData.hexRadius||20,reach=wodAiOperationReach(unit),range=(unit.range||50)*.88;
    const contacts=enemies.slice().sort((a,b)=>Math.hypot(a.x-unit.x,a.y-unit.y)-Math.hypot(b.x-unit.x,b.y-unit.y)).slice(0,8);
    const center=contacts[0],reserved=wodAiDeploymentReservations(unit,center,hr*20,true);
    const supplied=h=>wodIsFriendlyOwner(h.owner,unit.owner)&&wodCurrentSupplyComponent(h,unit.owner).city;
    const legal=(h,e)=>h&&!reserved.has(getHexKey(h))&&!isWaterHex(h)&&canUnitEnterHex(unit,h)&&reach.has(getHexKey(h))&&
        (supplied(h)||getNeighborHexes(h).some(n=>supplied(n)&&wodCanStepBetweenHexes(unit,n,h,true))||
            advancing&&Math.hypot(h.x-unit.x,h.y-unit.y)<hr*6)&&
        Math.hypot(h.x-e.x,h.y-e.y)<=range&&Math.hypot(h.x-e.x,h.y-e.y)>hr*.7&&
        !isWorldPositionBlockedByUnits(unit,h.x,h.y);
    if(previous){const h=gameData.hexes[previous.key],enemy=contacts.find(e=>e.uid===previous.enemy);if(enemy&&legal(h,enemy))return{hex:h,enemy};}
    const choices=new Map();
    for(const enemy of contacts){
        const at=getNearestHexToPoint(enemy.x,enemy.y);if(!at)continue;
        for(const p of getHexesInRadius(at.q,at.r,Math.ceil(range/hr)+1)){
            const h=gameData.hexes[p.q+','+p.r];if(!legal(h,enemy))continue;
            const crossfire=contacts.reduce((n,e)=>n+Math.max(0,1-Math.hypot(h.x-e.x,h.y-e.y)/((e.range||50)+hr))*(e.hp/e.maxHp),0);
            const score=Math.hypot(h.x-unit.x,h.y-unit.y)+Math.abs(Math.hypot(h.x-enemy.x,h.y-enemy.y)-range*.85)*1.5+
                getTerrainDefenseModifier(unit,h)*hr*3+crossfire*hr*.65;
            const key=getHexKey(h);if(!choices.has(key)||score<choices.get(key).score)choices.set(key,{hex:h,enemy,score});
        }
    }
    return [...choices.values()].sort((a,b)=>a.score-b.score).slice(0,8).find(p=>wodAiCanReach(unit,p.hex))||null;
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
    const supportIds=job._peerSupport?.until>now?job._peerSupport.members:[],jointIds=op?.joint?.until>now?wodAiActiveFrontOperations(unit.owner).filter(o=>o.joint===op.joint&&op.joint.squads.includes(o.id)).flatMap(o=>o.members):[],groupIds=new Set([...job.members,...supportIds,...jointIds]);
    const army=gameData.entities.filter(u=>groupIds.has(u.uid)&&u.owner===unit.owner&&u.hp>u.maxHp*.5&&!u.retreating&&!u.moraleBroken&&
        !u._medicalRecovering&&!u.boardTransportUid&&isLandArmyUnit(u)&&!wodAiFrontCritical(gameData._aiDefenseByOwner?.[unit.owner]?.jobs.find(j=>j.id===gameData._aiDefenseByOwner[unit.owner].unitJob[u.uid]),u));
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
    let enemy=contacts.find(e=>previous?.until>now&&previous.enemy===e.uid)||contacts[0];if(!enemy)return false;
    const foes=known.filter(e=>Math.hypot(e.x-enemy.x,e.y-enemy.y)<hr*7);
    const support=army.filter(u=>Math.hypot(u.x-enemy.x,u.y-enemy.y)<hr*12&&wodAiArrivalSeconds(u,enemy,u.range||50,20)<=20&&
        !wodAiCorridorWithdrawal(u)&&wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),unit.owner).city);
    if(support.length<2||!support.includes(unit)||wodAiForecast(unit.owner,support,foes).ratio<Math.min(1.15,wodAiAttackThreshold(unit.owner,true)))return false;
    if(fighting.some(u=>u.combatTargetUid===enemy.uid||enemy.combatTargetUid===u.uid))job._combatSupportBattle={hexes:gameData.hexes,enemy:enemy.uid,at:now};
    const slots=job._combatSupportSlots||=( {} ),old=slots[unit.uid];
    const point=wodAiContactFiringHex(unit,foes,!unit._trafficYield&&old?.until>now?old:null);
    if(!point)return false;const target=point.hex;enemy=point.enemy;
    if(!issue){const end=unit.orderTarget||unit.target?.finalTarget||unit.target;return !unit.target||unit.holding||!end||Math.hypot(end.x-target.x,end.y-target.y)>hr*1.2||now-(unit._aiCombatSupportAt??-Infinity)>=2000;}
    if(!wodAiMoveUnitTowardHex(unit,target,false,.08))return false;
    slots[unit.uid]={key:getHexKey(target),enemy:enemy.uid,until:now+5000};unit._aiCombatSupportAt=now;
    wodAiRememberDeployment(unit,target,'combat',5000);
    wodAiStampOrder(unit,false,target,2200);unit.aiOrderPhase=op?.phase||job.phase;unit.aiOrderResponseId=job.response?job.id:null;unit.aiFrontBound=job.bound;
    wodAiRecord(unit.owner,'group-combat-support',{unit:unit.uid,job:job.id,enemy:enemy.uid,target:getHexKey(target)});return true;
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
    const foes=wodAiThreats(unit.owner).filter(e=>!wodIsNavalUnit(e)&&e.type!=='convoy'&&
        Math.hypot(e.x-unit.x,e.y-unit.y)<(e.range||50)+hr*7);
    // Cohesion protects a vanguard approaching a battle. Applying it on an
    // empty front parked entire depleted squads at their own feet forever.
    if(!foes.length)return false;
    const near=ready.filter(u=>Math.hypot(u.x-unit.x,u.y-unit.y)<hr*6);
    if(near.length>=3||near.length===2&&foes.length<=1&&wodAiForecast(unit.owner,near,foes).ratio>=1.2)return false;
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
            choices.sort(wodByScore(score));const h=choices.slice(0,8).find(h=>wodAiCanReach(u,h));if(!h)continue;
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
    choices.sort(wodByScore(score));const target=choices[0]||goal;used[unit.uid]=getHexKey(target);return target;
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
    sites.sort(wodByScore(score));
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

function wodAiFrontCritical(response,unit=null) {
    if(!response)return false;
    const owner=unit?.owner||response.owner||response.holdHex?.owner,hr=gameData.hexRadius||20;
    const gates=(response.screenPoints||[response.holdHex]).filter(Boolean);
    const distance=unit&&gates.length?Math.min(...gates.map(p=>Math.hypot(p.x-unit.x,p.y-unit.y))):0;
    const assigned=unit&&gameData._aiDefenseByOwner?.[owner]?.unitJob?.[unit.uid]===response.id;
    if(unit&&(assigned||unit._aiDefenseLease?.id===response.id&&unit._aiDefenseLease.until>wodAiOperationTime())){
        const live=response.kind==='relief'||wodAiThreats(owner,false).some(e=>gates.some(g=>Math.hypot(e.x-g.x,e.y-g.y)<(e.range||50)+hr*8));
        if(live&&distance<hr*30)return true;
    }
    if(response.kind==='counter'||response.kind==='relief'){
        if(!unit||!gates.length)return true;
        if(response.kind==='relief'&&(response.trapped?.includes(unit.uid)||response.pocketKeys?.has(getHexKey(getNearestHexToPoint(unit.x,unit.y)))))return true;
        return distance<hr*(response.kind==='counter'?26:16)&&wodAiResponseCanArrive(unit,response,distance);
    }
    if(response.kind==='corridor'){
        const warning=gameData._aiDefenseByOwner?.[owner]?.corridors?.find(c=>c.id===response.id||c.responseId===response.id);
        if(warning)wodAiCorridorHoldRatio(owner,warning);
        const cut=warning||response;if(!wodAiCorridorUrgent(cut))return false;
        if(!unit)return true;
        if(cut.riskUnits?.has(unit.uid))return true;
        // A dangerous gate is a local defensive job, not authority to recall
        // an unrelated offensive from the other side of the country.
        if(distance>=hr*12)return false;
        const foes=wodAiCorridorCaptureThreats(owner,cut);if(!foes.length)return false;
        const deadline=Math.min(25,Math.max(8,(cut.closureSeconds||15)+5));
        return gates.some(g=>wodAiArrivalSeconds(unit,g,unit.range||50,deadline)<=deadline);
    }
    // Territorial coverage still receives a screen; only nearby town danger
    // can commandeer an already committed assault force.
    if(response.kind==='territory'&&response.coverageRequired){
        const owner=response.owner||response.holdHex?.owner,point=response.contactPoint||response.holdHex;
        return point&&(!unit||distance<hr*12)&&gameData.cities.some(c=>c.owner===owner&&Math.hypot(c.x-point.x,c.y-point.y)<hr*6);
    }
    return false;
}

function wodAiActiveFrontOperations(owner) {
    const now=wodAiOperationTime();
    return [...new Set(Object.entries(gameData._aiFrontOffensives||{}).filter(([key])=>key===String(owner)||key.startsWith(owner+':')).map(([,op])=>op))]
        .filter(op=>op?.hexes===gameData.hexes&&op.until>now);
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
            !wodAiFrontCritical(gameData._aiDefenseByOwner?.[owner]?.jobs.find(j=>j.id===gameData._aiDefenseByOwner[owner].unitJob[u.uid]),u))&&
        wodAiArrivalSeconds(u,point,u.range||50,8)<=8):[];
    const forecast=wodAiForecast(owner,foes.length?[...fighting,...allies]:roster,foes),launched=!!host.launchedAt||ops.some(o=>o.phase==='advance');
    const staging=new Map(ops.flatMap(o=>o.members.map(id=>[id,o.anchor||anchor])));
    const assembled=roster.filter(u=>{const at=staging.get(u.uid)||anchor;return Math.hypot(u.x-at.x,u.y-at.y)<hr*9||u._combatEngaged||wodAiArrivalSeconds(u,at,hr*5,10)<=10;});
    const quorum=Math.max(2,Math.ceil(roster.length*.65));
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
    // A depleted squad need not wait for a third regiment to occupy weak
    // ground. Both survivors must stay together and supplied; a defended
    // battle still needs the normal contact quorum or a funded assault.
    const pair=roster.length===2&&foes.length<=1&&lead&&
        roster.every(u=>Math.hypot(u.x-lead.x,u.y-lead.y)<hr*5&&u.hp>u.maxHp*.62&&
            wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city)&&
        Math.hypot(lead.x-aim.x,lead.y-aim.y)<hr*16&&forecast.ratio>=Math.max(1.2,required);
    const committed=budget?.active&&cohort.length>=3&&fighting.length>=contactQuorum&&forecast.ratio>=policy.continue&&projected.ratio>=policy.continue;
    const enough=finishing||pair||roster.length>=3&&(!foes.length||fighting.length>=contactQuorum&&fighting.length+allies.length>=3&&forecast.ratio>=required||approach||maneuver||frontageWing||frontagePin||committed);
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
    const decision={at:now,phase,reason:supplyRecovery?'corridor-cohort-withdrawal':phase==='recover'?'outmatched-contact':finishing?'finish-costly-objective':pair?'clear-weak-objective':roster.length<3?'awaiting-return-or-recruits':!enough?'awaiting-combat-strength':phase==='gather'?'rendezvous':committed?'committed-objective':frontagePin?'supported-front-line':approach?'supported-approach':maneuver?'supported-flank':'authorized',ratio:forecast.ratio,frontagePin,approach,casualtyCommitment:!!budget?.active,projectedRatio:projected.ratio,ids:roster.map(u=>u.uid),arrivals:arrivals.filter(a=>a.eta<=24).map(a=>({uid:a.u.uid,seconds:Math.round(a.eta*10)/10})),enemy:foes.length,point};
    const changed=host.commandDecision?.phase!==phase;host.commandDecision=decision;if(phase==='advance')host.launchedAt??=now;
    for(const squad of ops){
        if(squad.phase==='consolidate'||squad.ambush)continue;
        squad.phase=phase;if(phase==='advance')squad.launchedAt??=now;
        squad.until=Math.max(squad.until,now+45000);
    }
    if(changed)wodAiRecord(owner,'command-decision',{job:host.id,phase,reason:decision.reason,troops:roster.length,arrivals:fighting.length,enemy:foes.length,ratio:Number.isFinite(forecast.ratio)?Math.round(forecast.ratio*100)/100:null});
    return decision;
}

// Small squads can share a battle without becoming one giant
// roster. Assign whole squads to the fixing force, flank and opposite screen.
function wodAiCoordinateJointAssaults(owner,plan) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    if(plan.jointCheckAt!=null&&now-plan.jointCheckAt<2500)return;plan.jointCheckAt=now;
    const availableCache=new Map(),available=o=>{if(!availableCache.has(o))availableCache.set(o,wodAiSquadAvailable(owner,o));return availableCache.get(o);};
    const ops=wodAiActiveFrontOperations(owner),known=wodAiThreats(owner,false).filter(isLandArmyUnit);
    for(const op of ops)if(op.joint){
        const joint=op.joint,contacts=known.some(e=>e.owner===op.hostile&&Math.hypot(e.x-joint.contact.x,e.y-joint.contact.y)<hr*10);
        if(contacts)joint.clearedAt=null;else joint.clearedAt??=now;
        const participants=ops.filter(o=>o.joint===joint),troops=participants.flatMap(o=>available(o));
        const distance=troops.length?troops.reduce((n,u)=>n+Math.hypot(u.x-joint.contact.x,u.y-joint.contact.y),0)/troops.length:Infinity;
        if(!joint.progress||distance<joint.progress.distance-hr||troops.some(u=>u._combatEngaged))joint.progress={at:now,distance};
        if(contacts&&joint.progress&&now-joint.progress.at<15000)joint.until=Math.max(joint.until,now+30000);
        if(joint.until<=now||joint.squads.filter(id=>ops.some(o=>o.id===id&&o.joint===joint)).length<2||joint.clearedAt!=null&&now-joint.clearedAt>=8000){
            op.joint=null;op.commandDecision=null;
            const army=available(op);if(army.length>=3)wodAiContinueFrontOffensive(owner,op,army);
            wodAiRecord(owner,'joint-assault-ended',{job:op.id,reason:contacts?'reassess':'contact-cleared'});
        }
    }
    const free=ops.filter(o=>!o.joint&&!o.ambush&&!o.supporting&&!(o.pressureUntil>now)&&!(o.frontageTask?.until>now)&&available(o).length>=3);
    for(const lead of free){
        if(lead.joint)continue;
        const army=available(lead),center=army[0];
        // Keep reserves available to an assault as it takes losses. Previously
        // a second weak coalition could lock up the very reinforcements the
        // first coalition needed after its wounded troops rotated out.
        const coalitions=[...new Set(ops.map(o=>o.joint).filter(j=>j?.until>now))];
        const reinforce=coalitions.map(joint=>({joint,peers:ops.filter(o=>o.joint===joint)})).filter(({joint,peers})=>
            peers.length<6&&peers[0]?.hostile===lead.hostile&&Math.hypot(center.x-joint.contact.x,center.y-joint.contact.y)<hr*24&&(!lead.frontOwner||peers.every(o=>!o.frontOwner||o.frontOwner===lead.frontOwner))&&
            army.filter(u=>wodAiArrivalSeconds(u,joint.contact,u.range||50,24)<=24).length>=3).map(x=>({
                ...x,force:x.peers.flatMap(o=>available(o)),foes:known.filter(e=>e.owner===lead.hostile&&Math.hypot(e.x-x.joint.contact.x,e.y-x.joint.contact.y)<hr*10)
            })).filter(x=>x.foes.length&&x.force.length+army.length<=36&&
                wodAiForecast(owner,x.force,x.foes).ratio<Math.max(1.2,wodAiAttackThreshold(owner)+.15))
            .sort((a,b)=>Math.hypot(center.x-a.joint.contact.x,center.y-a.joint.contact.y)-Math.hypot(center.x-b.joint.contact.x,center.y-b.joint.contact.y))[0];
        if(reinforce){
            const joint=reinforce.joint;joint.squads.push(lead.id);joint.commandDecision=null;joint.until=Math.max(joint.until,now+45000);
            lead.joint=joint;lead.supporting=null;lead.commandDecision=null;lead.goal=joint.contact;lead.advanceGoal=null;lead.anchor=joint.anchor;lead.march=null;lead.mode='breakthrough';lead.until=Math.max(lead.until,joint.until);
            lead.jobs=[{id:lead.id+'-reinforce-'+Math.floor(now),kind:'main',role:'breakthrough',response:true,members:lead.members.slice(),frontOperation:lead,holdHex:joint.anchor,bound:0}];
            for(const u of army){u.aiOrderUntil=0;u.aiFrontBound=null;gameData._aiMoveQueue?.delete(u);}
            wodAiRecord(owner,'joint-assault-reinforced',{job:joint.id,squad:lead.id,troops:army.length});continue;
        }
        const foes=known.filter(e=>e.owner===lead.hostile&&army.some(u=>Math.hypot(u.x-e.x,u.y-e.y)<hr*14));
        if(!foes.length)continue;
        // A lone weak contact is the lead squad's job. Other squads keep
        // capturing land instead of turning every skirmish into one mass.
        if(foes.length===1&&wodAiForecast(owner,army,foes).ratio>=wodAiAttackThreshold(owner))continue;
        const contact=getNearestHexToPoint(foes.reduce((n,e)=>n+e.x,0)/foes.length,foes.reduce((n,e)=>n+e.y,0)/foes.length);
        const rally=wodAiCohortAnchor(owner,army,contact)||lead.anchor;
        const partners=free.filter(o=>o!==lead&&!o.joint&&o.hostile===lead.hostile&&(!o.frontOwner||o.frontOwner===lead.frontOwner)&&
            available(o).filter(u=>wodAiArrivalSeconds(u,contact,u.range||50,40)<=40||wodAiArrivalSeconds(u,rally,hr*3,60)<=60).length>=3)
            .sort((a,b)=>Math.hypot(a.anchor.x-center.x,a.anchor.y-center.y)-Math.hypot(b.anchor.x-center.x,b.anchor.y-center.y));
        if(!partners.length)continue;
        // Recruit only the strength this contact needs. The old three-squad
        // cap left adjacent weak coalitions separately waiting against the
        // same defense even when enough troops were already present.
        const squads=[lead],selected=army.slice();
        for(const partner of partners){
            squads.push(partner);selected.push(...available(partner));
            if(squads.length>=6||selected.length>=36||wodAiForecast(owner,selected,foes).ratio>=Math.max(1.2,wodAiAttackThreshold(owner)+.15))break;
        }
        const combined=selected;
        if(wodAiForecast(owner,combined,foes).ratio<wodAiAttackThreshold(owner))continue;
        const separated=combined.some(u=>Math.hypot(u.x-center.x,u.y-center.y)>hr*7);
        const anchor=separated?rally:getNearestHexToPoint(center.x,center.y);let envelope=wodAiFrontEnvelopment(owner,combined,foes,anchor);
        const joint={id:'assault-'+lead.id+'-'+Math.floor(now),squads:squads.map(o=>o.id),anchor,contact,at:now,until:now+120000};
        const ordered=squads.slice().sort((a,b)=>Number(available(b).some(u=>u.isGeneral))-Number(available(a).some(u=>u.isGeneral))||Math.hypot(a.anchor.x-contact.x,a.anchor.y-contact.y)-Math.hypot(b.anchor.x-contact.x,b.anchor.y-contact.y));
        let pins=0;const fixing=[];
        while(pins<ordered.length&&wodAiForecast(owner,fixing,foes).ratio<.95){fixing.push(...available(ordered[pins++]));}
        // Do not sacrifice half of a marginal six-versus-five force while its
        // other half takes a long flank. Larger armies retain multiple squads
        // in the fixing line before sending the remaining squads around it.
        if(pins>=ordered.length)envelope=null;
        let wing=0;
        for(const [i,op]of ordered.entries()){
            const troops=available(op),cx=troops.reduce((n,u)=>n+u.x,0)/troops.length,cy=troops.reduce((n,u)=>n+u.y,0)/troops.length;
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
            for(const u of available(op)){u.aiOrderUntil=0;u.aiFrontBound=null;gameData._aiMoveQueue?.delete(u);}
        }
        wodAiCommandDecision(owner,lead);
        wodAiRecord(owner,'joint-assault',{job:joint.id,squads:joint.squads,troops:combined.length,flanks:wing,target:getHexKey(contact)});
    }
}

// Leave enough strength at the battle and give unused rear cohorts a different
// stretch of front. A dangerous contact still receives real reinforcements;
// abundant troops do not all inherit the same small firing arc indefinitely.
function wodAiDisperseSurplus(owner,plan) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    if(plan.pressureCheckAt!=null&&now-plan.pressureCheckAt<2500)return;plan.pressureCheckAt=now;
    const ops=wodAiActiveFrontOperations(owner),armies=new Map(ops.map(o=>[o,wodAiSquadAvailable(owner,o)]));
    const army=o=>armies.get(o)||[],known=wodAiThreats(owner,false).filter(e=>isLandArmyUnit(e)&&!e._intelMemory);
    const candidates=ops.filter(o=>army(o).length>=3&&!o.ambush&&!(o.pressureUntil>now)&&!(o.frontageTask?.until>now)&&
        !o.jobs.some(j=>j.route&&!j.closed)&&!army(o).some(u=>u._combatEngaged));
    candidates.sort((a,b)=>Math.min(...army(b).map(u=>Math.hypot(u.x-(b.advanceGoal||b.goal).x,u.y-(b.advanceGoal||b.goal).y)))-
        Math.min(...army(a).map(u=>Math.hypot(u.x-(a.advanceGoal||a.goal).x,u.y-(a.advanceGoal||a.goal).y))));
    let assigned=0;
    for(const op of candidates){
        if(assigned>=2)break;
        const force=army(op),goal=op.joint?.contact||op.goal;
        const near=known.filter(e=>e.owner===op.hostile&&force.some(u=>Math.hypot(e.x-u.x,e.y-u.y)<hr*16));
        const contact=near.length?getNearestHexToPoint(near.reduce((n,e)=>n+e.x,0)/near.length,near.reduce((n,e)=>n+e.y,0)/near.length):goal;
        if(!contact)continue;
        const peers=ops.filter(o=>o!==op&&o.hostile===op.hostile&&!(o.pressureUntil>now)&&!o.ambush&&army(o).some(u=>
            Math.hypot(u.x-contact.x,u.y-contact.y)<hr*14)&&
            (Math.hypot((o.joint?.contact||o.goal).x-contact.x,(o.joint?.contact||o.goal).y-contact.y)<hr*10||army(o).some(u=>u._combatEngaged)));
        const cover=peers.flatMap(army).filter(u=>wodAiArrivalSeconds(u,contact,u.range||50,16)<=16);
        // An open-field fixing line only needs to hold. A town assault keeps
        // an actual attacking surplus before it sends any cohort elsewhere.
        const town=[op.strategicGoal,op.resumeGoal,op.advanceGoal,op.goal].find(h=>h?.id&&wodIsHostileOwner(h.owner,owner)&&gameData.cities.some(c=>c.id===h.id));
        const margin=town?Math.max(1.25,wodAiAttackThreshold(owner)+.25):Math.max(.95,Math.min(1.1,wodAiAttackThreshold(owner,true)));
        if(cover.length<3||near.length&&wodAiForecast(owner,cover,near).ratio<margin)continue;
        const cx=force.reduce((n,u)=>n+u.x,0)/force.length,cy=force.reduce((n,u)=>n+u.y,0)/force.length;
        const lead=force.slice().sort((a,b)=>Math.hypot(a.x-cx,a.y-cy)-Math.hypot(b.x-cx,b.y-cy))[0];
        const dx=contact.x-cx,dy=contact.y-cy,len=Math.hypot(dx,dy)||1,explored=wodFogActive()?wodFogFactionIntel(owner).explored:null;
        const choices=(plan.sectors||[]).filter(s=>s.holdHex&&s.attackHex&&s.attackHex.owner===op.hostile&&
            Math.hypot(s.holdHex.x-cx,s.holdHex.y-cy)<hr*28&&Math.hypot(s.attackHex.x-contact.x,s.attackHex.y-contact.y)>hr*6&&
            Math.abs((s.attackHex.x-contact.x)*-dy/len+(s.attackHex.y-contact.y)*dx/len)>hr*5&&
            !isWaterHex(s.attackHex)&&(!explored||explored.has(getHexKey(s.attackHex)))&&wodCurrentSupplyComponent(s.holdHex,owner).city&&
            !ops.some(o=>o!==op&&o.pressureUntil>now&&Math.hypot((o.advanceGoal||o.goal).x-s.attackHex.x,(o.advanceGoal||o.goal).y-s.attackHex.y)<hr*6))
            .map(s=>({s,score:Math.hypot(s.holdHex.x-cx,s.holdHex.y-cy)+wodAiFrontTargetPenalty(owner,op,s.attackHex)}))
            .sort((a,b)=>a.score-b.score);
        const choice=choices.slice(0,8).find(({s})=>force.every(u=>canUnitEnterHex(u,s.attackHex)&&wodAiCanReach(u,s.attackHex))&&
            wodAiForecast(owner,force,known.filter(e=>Math.hypot(e.x-s.attackHex.x,e.y-s.attackHex.y)<hr*7)).ratio>=wodAiAttackThreshold(owner));
        if(!choice)continue;
        const {s}=choice,origin=getNearestHexToPoint(lead.x,lead.y),serial=op.pressureSerial=(op.pressureSerial||0)+1;
        if(op.joint){op.joint.squads=op.joint.squads.filter(id=>id!==op.id);op.joint.commandDecision=null;}
        op.pressureOriginGoal=op.strategicGoal||op.advanceGoal||op.goal;
        // An outer bound is a flank of the town assault, not permission to
        // forget that town and paint quiet ground for the rest of the match.
        op.joint=null;op.supporting=null;op.frontageTask=null;op.resumeGoal=town||null;
        op.strategicGoal=null;op.strategicWatch=null;op.goal=op.advanceGoal=s.attackHex;op.anchor=origin;
        const arrival=wodAiArrivalSeconds(lead,s.attackHex,hr*3,120);
        op.phase='advance';op.stage='attack';op.mode='breakthrough';op.launchedAt=now;
        op.pressureUntil=now+Math.min(120000,Math.max(30000,(Number.isFinite(arrival)?arrival:60)*1400+10000));
        op.until=Math.max(op.until,now+90000);op.march=null;op.effect=null;op.commandDecision=null;
        const gx=s.attackHex.x-origin.x,gy=s.attackHex.y-origin.y,gl=Math.hypot(gx,gy)||1;op.advanceBearing={x:gx/gl,y:gy/gl};
        op.jobs=[{id:op.id+'-pressure-'+serial,kind:'main',role:'breakthrough',response:true,members:op.members.slice(),frontOperation:op,holdHex:origin,bound:serial}];
        for(const u of force){u.aiOrderUntil=0;u.aiFrontBound=null;u._aiMoveIntent=null;gameData._aiMoveQueue?.delete(u);}
        assigned++;wodAiRecord(owner,'front-pressure-deployment',{job:op.id,troops:force.length,cover:cover.length,target:getHexKey(s.attackHex)});
    }
}

function wodAiFrontTargetPenalty(owner,op,point) {
    const hr=gameData.hexRadius||20;
    return wodAiActiveFrontOperations(owner).filter(o=>o!==op&&!o.supporting&&(!op?.joint||o.joint!==op.joint)).reduce((sum,o)=>{
        const goal=point.id?(o.strategicGoal||o.advanceGoal||o.goal):(o.advanceGoal||o.goal);if(!goal)return sum;
        if(point.id&&goal.id===point.id){
            const assigned=wodAiActiveFrontOperations(owner).filter(p=>(p.strategicGoal||p.advanceGoal||p.goal)?.id===point.id),foes=wodAiThreats(owner).filter(e=>Math.hypot(e.x-point.x,e.y-point.y)<hr*14&&wodAiArrivalSeconds(e,point,e.range||50,24)<=24);
            const army=[...new Map(assigned.flatMap(p=>wodAiSquadAvailable(owner,p)).map(u=>[u.uid,u])).values()];
            // Reserve enough independent cohorts to defeat the real defense,
            // then send surplus to other sectors. Two weak squads must not
            // reserve a town against every useful arriving reinforcement.
            if(assigned.length<6&&army.length<36&&foes.length&&wodAiForecast(owner,army,foes).ratio<Math.max(1.2,wodAiAttackThreshold(owner)+.15))return sum+hr;
            return sum+hr*18;
        }
        return sum+Math.max(0,hr*7-Math.hypot(point.x-goal.x,point.y-goal.y))*1.7;
    },0);
}

// One neighboring force may help a live battle. Its roster and original
// objective remain intact; the rest of the front keeps advancing separately.
function wodAiCoordinateFrontSupport(owner,plan,ready) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,byId=new Map(ready.map(u=>[u.uid,u]));
    const ops=wodAiActiveFrontOperations(owner).filter(o=>!o.joint&&!(o.pressureUntil>now)&&!(o.frontageTask?.until>now)&&o.members.some(id=>byId.has(id))),armies=new Map();
    for(const o of ops)armies.set(o,o.members.map(id=>byId.get(id)).filter(u=>u&&u.hp>u.maxHp*.6&&!u.retreating&&!u.moraleBroken&&!u._medicalRecovering&&
        !wodAiFrontCritical(gameData._aiDefenseByOwner?.[owner]?.jobs.find(j=>j.id===gameData._aiDefenseByOwner[owner].unitJob[u.uid]),u)));
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
    if(!op||op.hexes!==gameData.hexes||op.until<=now||!op.members.includes(unit.uid)||wodAiFrontCritical(response,unit))return null;
    const base=plan.jobs.find(j=>j.id===plan.unitJob[unit.uid]);
    if(base?.city||base?.fort||response&&['hold','reserve','support'].includes(base?.kind)||unit._medicalRecovering||unit.retreating||unit.moraleBroken||unit._navalAssaultUntil>now)return null;
    return op.jobs.find(j=>j.members.includes(unit.uid))||null;
}

// Convert a viable approach into occupation of the actual urban cells. A
// nearby skirmish must not keep an entire winning army outside its objective.
function wodAiObjectiveAssault(owner,op,army) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,goal=op.strategicGoal||op.advanceGoal||op.goal;
    if(!goal?.id||op.phase!=='advance'||op.ambush||op.jobs.some(j=>j.route&&!j.closed))return null;
    const town=gameData.cities.find(c=>c.id===goal.id);
    if(!town||!getCityUrbanTerrainHexes(town).some(h=>wodIsHostileOwner(h.owner,owner)))return null;
    if(op.breachCheckAt!=null&&now-op.breachCheckAt<1000)return op.breach?.until>now?op.breach:null;
    op.breachCheckAt=now;op.breach=null;
    const peers=wodAiActiveFrontOperations(owner).filter(o=>o===op||o.joint&&o.joint===op.joint||(o.strategicGoal||o.advanceGoal||o.goal)?.id===town.id);
    const force=[...new Map(peers.flatMap(o=>wodAiSquadAvailable(owner,o)).map(u=>[u.uid,u])).values()]
        .filter(u=>!u.retreating&&!u.moraleBroken&&!u._medicalRecovering&&u.hp>u.maxHp*.4&&
            Math.hypot(u.x-town.x,u.y-town.y)<hr*12&&wodAiArrivalSeconds(u,town,hr*3,18)<=18&&
            wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city&&!wodAiCorridorWithdrawal(u));
    const near=force.filter(u=>Math.hypot(u.x-town.x,u.y-town.y)<hr*8);
    if(near.length<3)return null;
    const foes=wodAiThreats(owner).filter(e=>!wodIsNavalUnit(e)&&Math.hypot(e.x-town.x,e.y-town.y)<hr*8),policy=wodAiObjectiveRisk(owner,town,op);
    const ratio=wodAiForecast(owner,force,foes).ratio;
    if(ratio<Math.max(.9,policy.continue))return null;
    op.objectiveDriveUntil=now+10000;
    op.breach={town,force,until:now+1500};
    wodAiRecord(owner,'objective-breach',{job:op.id,city:town.id,troops:force.length,ratio:Number.isFinite(ratio)?Math.round(ratio*100)/100:null});
    return op.breach;
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
    if(ready.length<2)return false;
    const lead=ready.slice().sort((a,b)=>ready.filter(u=>Math.hypot(u.x-b.x,u.y-b.y)<hr*7).length-ready.filter(u=>Math.hypot(u.x-a.x,u.y-a.y)<hr*7).length)[0];
    const core=ready.filter(u=>Math.hypot(u.x-lead.x,u.y-lead.y)<hr*7);
    if(core.length<Math.max(Math.min(3,ready.length),Math.ceil(ready.length*.6)))return false;
    const reach=wodAiOperationReach(lead),known=wodAiThreats(owner),old=op.advanceGoal||op.goal;
    const safe=h=>{
        if(!h||!canUnitEnterHex(lead,h)||op.frontOwner&&h.owner!==op.frontOwner||!reach.has(getHexKey(h)))return false;
        const foes=known.filter(e=>Math.hypot(e.x-h.x,e.y-h.y)<hr*7);
        return (core.length>=3||foes.length<=1)&&wodAiForecast(owner,core,foes).ratio>=Math.max(core.length===2?1.2:0,wodAiAttackThreshold(owner));
    };
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
                .sort(wodByScore(score))[0];
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
function wodAiFrontDetour(lead,start,end,legal,scope='') {
    let work=gameData._aiFlankSearchWork;
    if(work?.tick!==gameData._wodSimTick||work?.hexes!==gameData.hexes)work=gameData._aiFlankSearchWork={tick:gameData._wodSimTick,hexes:gameData.hexes,spent:0,deferred:0};
    if(!start||!end||!legal(end))return null;
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    let cache=gameData._aiFlankPaths;
    if(cache?.hexes!==gameData.hexes)cache=gameData._aiFlankPaths={hexes:gameData.hexes,queries:new Map()};
    const key=scope&&[scope,lead.owner,lead.type,getHexKey(start),getHexKey(end)].join('|');
    let state=key&&cache.queries.get(key);
    if(state&&now-state.at>5000){cache.queries.delete(key);state=null;}
    if(state?.done){
        if(state.path?.every((h,i)=>!i||legal(h)&&wodCanStepBetweenHexes(lead,state.path[i-1],h,true)))return state.path;
        cache.queries.delete(key);state=null;
    }
    state||={at:now,heap:[],best:new Map([[getHexKey(start),0]]),prev:new Map(),nodes:0};
    const {heap,best,prev}=state;
    const push=n=>{heap.push(n);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].f<=n.f)break;heap[i]=heap[p];i=p;}heap[i]=n;};
    const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1].f<heap[j].f)j++;if(heap[j].f>=last.f)break;heap[i]=heap[j];i=j;}heap[i]=last;}return first;};
    if(!state.nodes&&!heap.length)push({h:start,g:0,f:Math.hypot(start.x-end.x,start.y-end.y)});
    if(key&&!cache.queries.has(key)){if(cache.queries.size>=96)cache.queries.delete(cache.queries.keys().next().value);cache.queries.set(key,state);}
    const begun=performance.now(),deadline=begun+Math.max(0,4-work.spent);
    // Charge search work, not unrelated planner time between calls. A budget
    // yield preserves this query rather than declaring a usable flank blocked.
    try{while(heap.length&&state.nodes<1600){
        if((state.nodes&31)===0&&performance.now()>=deadline){work.deferred++;return null;}
        state.nodes++;
        const {h,g}=pop(),key=getHexKey(h);if(g!==best.get(key))continue;
        if(wodHexKeysEqual(h,end)){
            const result=[h];for(let k=key;prev.has(k);){k=prev.get(k);result.push(gameData.hexes[k]);}result.reverse();
            if(!result.every((p,i)=>!i||legal(p)&&wodCanStepBetweenHexes(lead,result[i-1],p,true))){if(scope)cache.queries.delete([scope,lead.owner,lead.type,getHexKey(start),getHexKey(end)].join('|'));work.deferred++;return null;}
            state.done=true;state.path=result;return result;
        }
        const neighbors=cardinalHexDirections.map(d=>gameData.hexes[(h.q+d.q)+','+(h.r+d.r)]).filter(Boolean);
        if(gameData.bridges?.length)wodForEachBridgePathPortal(lead,h,n=>{if(!neighbors.includes(n))neighbors.push(n);});
        for(const n of neighbors){
            if(!legal(n)||!wodCanStepBetweenHexes(lead,h,n,true))continue;
            const cost=g+Math.hypot(n.x-h.x,n.y-h.y)*(1+Math.max(0,getTerrainDefenseModifier(lead,n)-.9)*.15),nk=getHexKey(n);
            if(cost>=(best.get(nk)??Infinity)||cost>hr*110)continue;
            best.set(nk,cost);prev.set(nk,key);push({h:n,g:cost,f:cost+Math.hypot(n.x-end.x,n.y-end.y)});
        }
    }
    if(key)cache.queries.delete(key);return null;
    }finally{work.spent+=performance.now()-begun;}
}

function wodAiFrontLegs(lead,points,owner,foes) {
    const explored=wodFogActive()?wodFogFactionIntel(owner).explored:null,hr=gameData.hexRadius||20;
    const route=[getHexKey(getNearestHexToPoint(points[0].x,points[0].y))],reach=wodAiOperationReach(lead);let from=points[0];
    const scope='front:'+owner+':'+foes.map(e=>e.uid+':'+getHexKey(getNearestHexToPoint(e.x,e.y))+':'+(e.range||50)).sort().join(';');
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
            const detour=wodAiFrontDetour(lead,gameData.hexes[route.at(-1)],getNearestHexToPoint(to.x,to.y),legal,scope);
            if(!detour)return null;for(const h of detour.slice(1))route.push(getHexKey(h));
        }
        from=to;
    }
    return route;
}

function wodAiFrontEnvelopment(owner,army,foes,anchor,support=army) {
    const searchWork=gameData._aiFlankSearchWork,deferred=searchWork?.deferred||0;
    if(!wodAiDifficulty(owner).tricks)return null; // an easy computer attacks head on
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
    if(!routes.some(Boolean))return (gameData._aiFlankSearchWork?.deferred||0)>(gameData._aiFlankSearchWork===searchWork?deferred:0)?{routes:[],pending:true}:null;
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
    if(!wodAiDifficulty(owner).tricks)return false;
    if(op.ambush||op.ambushTried||op.pressureUntil>now||op.frontageTask?.until>now||army.length<6||op.jobs.some(j=>j.route&&j.cursor>2))return false;
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
    // Contacts can leave the closing radius between staging and execution.
    // An empty/off-map closing point is a failed opportunity, never a route.
    if(!trap||!army.length||!foes.length)return false;
    const intel=wodFogActive()?wodFogFactionIntel(owner):null,explored=h=>!intel||intel.explored.has(getHexKey(h));
    const range=Math.max(...foes.map(e=>e.range||50))+hr*.8;
    const tail=Math.max(...foes.map(e=>(e.x-trap.center.x)*trap.ax+(e.y-trap.center.y)*trap.ay));
    const context=wodAiCombatContext(owner),cutKey='ambush-cut:'+op.id;
    if(!(cutKey in context))context[cutKey]=wodAiCutObjective(owner,army);
    const candidate=context[cutKey],cut=candidate&&Math.hypot(candidate.objectiveHex.x-trap.center.x,candidate.objectiveHex.y-trap.center.y)<hr*16?candidate:null;
    const aim=cut?.objectiveHex||getNearestHexToPoint(trap.center.x+trap.ax*(tail+range),trap.center.y+trap.ay*(tail+range));
    if(!aim)return false;
    const points=(cut?[aim]:getHexesInRadius(aim.q,aim.r,2).map(p=>gameData.hexes[p.q+','+p.r])).filter(h=>h&&!isWaterHex(h)&&explored(h)&&army.some(u=>canUnitEnterHex(u,h))&&
        (cut||Math.abs((h.x-trap.center.x)*-trap.ay+(h.y-trap.center.y)*trap.ax)<hr*2)&&foes.every(e=>Math.hypot(e.x-h.x,e.y-h.y)>(e.range||50)+hr*.6));
    points.sort((a,b)=>Math.hypot(a.x-aim.x,a.y-aim.y)-Math.hypot(b.x-aim.x,b.y-aim.y));
    const rear=points[0],routes=[];if(!rear)return false;
    for(const [i,wing]of op.jobs.filter(j=>j.role.startsWith('ambush-')&&j.role!=='ambush-pin').entries()){
        const members=army.filter(u=>wing.members.includes(u.uid)),lead=members[0];if(members.length<2)return false;
        const side=i?1:-1,outer=getNearestHexToPoint(rear.x-trap.ay*trap.width*side,rear.y+trap.ax*trap.width*side);
        if(!outer){if(cut)continue;return false;}
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
    // Bait is an opportunity, not a mandatory script for the opponent. Once
    // our wings are ready, a stationary visible defense gets flanked instead
    // of freezing six or more regiments for the entire lure timeout.
    if(staged&&trap.stage==='lure'&&now-trap.stageAt>=8000&&now-trap.approach.at>=6000&&
        tracked.length>=2&&wodAiForecast(owner,army,tracked).ratio>=wodAiAttackThreshold(owner)+.15){
        wodAiCancelAmbush(owner,op,army,'opponent-did-not-follow');return;
    }
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
    if(op.pressureUntil>wodAiOperationTime())return;
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
            !base?.city&&!base?.fort&&!['scout','support'].includes(base?.kind)&&!wodAiFrontCritical(response,u)&&!(response&&['hold','reserve'].includes(base?.kind))&&
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
    const emergency=army.some(u=>wodAiFrontCritical(gameData._aiDefenseByOwner?.[owner]?.jobs.find(j=>j.id===gameData._aiDefenseByOwner[owner].unitJob[u.uid]),u));
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
        const protectedDuty=assetDuty||base?.kind==='support'&&!!end||wodAiFrontCritical(response,u)&&!!end||u._combatEngaged||
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
            .filter(m=>!wodAiFrontCritical(defense?.jobs.find(j=>j.id===defense.unitJob[m.uid]),m)&&Math.hypot(m.x-u.x,m.y-u.y)<hr*12);
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
    const count=Math.min(24,Math.max(1,Math.ceil(combat.length/6))),capacity=Math.min(6,Math.max(3,Math.ceil(combat.length/count)));
    const old=wodAiActiveFrontOperations(owner).filter(o=>(o.frontOwner||0)===frontOwner),slots=[...new Set([...Array(count).keys(),...old.map(o=>o.slot||0)])].sort((a,b)=>a-b),ops=[];
    for(const slot of slots){
        const reserved=new Set(wodAiActiveFrontOperations(owner).filter(o=>(o.frontOwner||0)!==frontOwner||(o.slot||0)!==slot).flatMap(o=>o.members));
        // A pincer needs two complete wings as well as a pin and bait. Keep a
        // viable lead cohort before forming its smaller supporting force.
        const slotCapacity=slot===0&&combat.length>=7&&combat.length<=12?(combat.length<=8?combat.length:6):capacity;
        const op=wodAiPlanFrontOperation(owner,plan,ready.filter(u=>!reserved.has(u.uid)),frontOwner,slot,slotCapacity,ready);if(op)ops.push(op);
    }
    // A final one- or two-regiment remainder cannot form its own assault.
    // Attach it to a nearby viable cohort instead of leaving it on a solo job.
    const committed=new Set(wodAiActiveFrontOperations(owner).flatMap(o=>o.members));
    for(const u of ready.filter(u=>!committed.has(u.uid)&&eligible(u)&&['main','armor','raid'].includes(base(u)?.kind))){
        const candidates=ops.filter(o=>!o.ambush&&o.members.length<6&&o.members.length<(o.capacity||6)+2&&
            Math.hypot(u.x-o.anchor.x,u.y-o.anchor.y)<(gameData.hexRadius||20)*24&&wodAiCanReach(u,o.goal));
        candidates.sort((a,b)=>Math.hypot(u.x-a.anchor.x,u.y-a.anchor.y)-Math.hypot(u.x-b.anchor.x,u.y-b.anchor.y));
        const op=candidates[0],job=op?.jobs.filter(j=>!j.route).sort((a,b)=>a.members.length-b.members.length)[0];if(!job)continue;
        op.members.push(u.uid);job.members.push(u.uid);op.capacity=Math.max(op.capacity||6,op.members.length);op.commandDecision=null;
        committed.add(u.uid);u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);
        wodAiRecord(owner,'front-cohort-reinforced',{job:op.id,unit:u.uid,troops:op.members.length});
    }
    wodAiCoordinateFrontage(owner,plan,ready);
    wodAiCoordinateJointAssaults(owner,plan);
    wodAiDisperseSurplus(owner,plan);
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
    const breach=wodAiObjectiveAssault(unit.owner,op,army);
    const objectiveDrive=!!breach||op.objectiveDriveUntil>now&&op.strategicGoal&&wodIsHostileOwner(op.strategicGoal.owner,unit.owner)&&decision.phase==='advance';
    const fixing=job.role==='pin'&&op.phase==='advance'&&(op.joint||op.jobs.some(j=>j.route&&j.cursor>=2))&&unit.hp>unit.maxHp*(unit.isGeneral?.85:.72)&&
        !wodAiCorridorWithdrawal(unit)&&(op.joint?decision.ratio>=wodAiAttackThreshold(unit.owner,true):wodAiLocalSituation(unit).forecast.ratio>=.72);
    if(!fixing&&wodAiTacticalFallback(unit,job))return true;
    if(!objectiveDrive&&wodAiIssueGroupCombatSupport(unit,job))return true;
    if(!objectiveDrive&&op.phase==='advance'&&!job.route&&wodAiIssuePursuit(unit,job,members))return true;
    if(op.phase==='advance'&&job.role==='breakthrough'&&decision.arrivals.filter(a=>a.seconds<=8).length<3&&wodAiHoldUnsupportedVanguard(unit,job,members,op.advanceGoal||op.goal))return true;
    let target,holding=false;
    if(breach){
        target=wodAiTownAssaultHex(unit,breach.town,breach.force);
    }else if(op.phase==='gather'){
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
        const safe=!enemies.length||decision.frontagePin||(op.joint?decision.ratio:wodAiForecast(unit.owner,members,enemies).ratio)>=1;
        if(enemies.length&&(safe||fixing)){
            const prior=job._pinFiring?.[unit.uid],point=wodAiContactFiringHex(unit,enemies,prior?.until>now?prior:null,true);
            if(point){target=point.hex;(job._pinFiring||={})[unit.uid]={key:getHexKey(target),enemy:point.enemy.uid,until:now+5000};}
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
    if(moved){if(job.role==='pin')wodAiRememberDeployment(unit,target,'combat',5000);wodAiStampOrder(unit,holding,target,5500);unit.aiOrderPhase=op.phase;unit.aiOrderResponseId=job.id;unit.aiFrontBound=job.bound;}
    return moved;
}

function wodAiAmbushCounterattack(owner,op,army,foes) {
    if(army.length<5||!foes.length||wodAiForecast(owner,army,foes).ratio<wodAiAttackThreshold(owner,true))return false;
    const now=wodAiOperationTime(),goal=getNearestHexToPoint(foes.reduce((n,u)=>n+u.x,0)/foes.length,foes.reduce((n,u)=>n+u.y,0)/foes.length);
    delete op.ambush;op.goal=goal;op.anchor=wodAiCohortAnchor(owner,army,goal)||op.anchor;op.mode='breakthrough';op.phase='advance';op.launchedAt=now;op.commandDecision=null;op.effect=null;op.advanceGoal=null;
    op.jobs=[{id:op.id+'-counterattack',kind:'main',role:'breakthrough',response:true,members:army.map(u=>u.uid),frontOperation:op,holdHex:op.anchor,bound:0}];
    for(const u of army){u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}wodAiRecord(owner,'ambush-counterattack',{job:op.id,troops:army.length,enemy:foes.length});return true;
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
            if(!alive){
                const force=army(op);
                if(force.length>=2&&!wodAiContinueFrontOffensive(owner,op,force)&&op.jobs.some(j=>j.role==='pin')){
                    // Even without a presently reachable next town, a stale
                    // pin must return to the normal objective planner.
                    op.phase='consolidate';op.consolidateAt=now-3000;
                    op.jobs=[{id:op.id+'-released-'+Math.floor(now),kind:'main',role:'breakthrough',response:true,members:op.members.slice(),frontOperation:op,holdHex:op.anchor,bound:0}];
                }
                wodAiRecord(owner,'frontage-followthrough',{job:op.id,troops:force.length,target:(op.advanceGoal||op.goal)?.id||getHexKey(op.advanceGoal||op.goal)});
            }
            for(const u of army(op)){u.aiOrderUntil=0;gameData._aiMoveQueue?.delete(u);}
        }
        wodAiRecord(owner,'frontage-ended',{job:campaign.id,reason:alive?'reassess':'contact-cleared'});
    }
    plan.frontageCampaigns=plan.frontageCampaigns.filter(c=>c.until>now);
    if(plan.frontageCampaigns.length>=3)return;
    const free=ops.filter(o=>!o.ambush&&!(o.pressureUntil>now)&&!(o.frontageTask?.until>now)&&army(o).length>=3&&
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
        if(envelope?.pending){plan.frontageCheckAt=now-4500;continue;}
        const routeWork=gameData._aiFlankSearchWork,routeDeferred=routeWork?.deferred||0;
        const spare=locals.filter(o=>!pins.includes(o)),wings=[];
        for(const [side,route]of (envelope?.routes||[]).entries()){
            if(!route)continue;
            const shoulder=gameData.hexes[route[Math.min(route.length-1,Math.ceil(route.length*.3))]];
            const choices=spare.filter(o=>!wings.some(w=>w.op===o)).sort((a,b)=>Math.min(...army(a).map(u=>Math.hypot(u.x-shoulder.x,u.y-shoulder.y)))-Math.min(...army(b).map(u=>Math.hypot(u.x-shoulder.x,u.y-shoulder.y))));
            if(known.some(e=>e.owner!==seed.owner&&route.some(k=>{const h=gameData.hexes[k];return h&&Math.hypot(e.x-h.x,e.y-h.y)<(e.range||50)+hr*.7;})))continue;
            for(const op of choices){const path=wodAiFrontageRoute(owner,army(op),route,known);if(path){wings.push({op,route:path,side});break;}}
        }
        if(!wings.length&&(gameData._aiFlankSearchWork?.deferred||0)>(gameData._aiFlankSearchWork===routeWork?routeDeferred:0)){plan.frontageCheckAt=now-4500;continue;}
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
