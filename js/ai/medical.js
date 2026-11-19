// AI: the wounded. Who goes to recover where (towns, hospitals, harbours), medical ferries, hospital requests,
// and giving way in crowded towns.
'use strict';

function wodAiMedicalLogistics(owner) {wodAiManageRecovery(owner);}

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
    const supplyRadius=wodSupplyShipRadiusPx();
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
                if(wodAiAssignWaypoints(u,[{x:goal.x,y:goal.y,intoWater:true}],{transportInternal:true}))u._medicalGoal=key;
            }
            continue;
        }
        const region=wodTransportLandingRegion({type:'light',owner},here);if(!region)continue;
        const radius=wodSupplyShipRadiusPx(),support=gameData.entities.filter(s=>s.owner===owner&&s.type==='supply'&&s.hp>0&&!s.retreating);
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
            wodAiAssignWaypoints(u,[pickup],{transportInternal:true});
            wodAiAssignWaypoints(t,[water],{transportInternal:true});assigned=true;break;
        }
        if(!assigned&&(!u.target||u._medicalPickupKey!==getHexKey(pickup))){
            u._medicalPickupKey=getHexKey(pickup);wodAiAssignWaypoints(u,[pickup],{transportInternal:true});
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
                if(points[0]&&wodAiAssignWaypoints(guard,[points[0]],{transportInternal:true})){
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
    const now=wodAiOperationTime(),TU=wodOpsTune(owner);
    const army=gameData.entities.filter(u=>u.owner===owner&&u.hp>0&&u.type!=='convoy'&&!u.boardTransportUid);
    const radius=wodFortCombatAuraRadiusPx(),hr=gameData.hexRadius||20,threats=wodAiThreats(owner,false);
    const sites=[...(gameData.hospitals||[]).filter(h=>wodEffectiveHospitalOwner(h)===owner),...gameData.cities.filter(c=>c.owner===owner&&!isCitySiegeBlockedForProduction(c))];
    wodAiYieldRecoverySlots(owner,army,sites);
    const occupied=new Set();
    const task=gameData.aiTaskForces?.[owner],rotating=new Map();
    for(const u of army.filter(u=>u._medicalRecovering)){
        const id=u._aiRecoveryGroup||task?.unitJob[u.uid];if(id)rotating.set(id,(rotating.get(id)||0)+1);
    }
    // In a last stand (wodAiLastStand) the troops that can walk to the last town fight for it, wounded or not: none is
    // booked in for treatment and those being treated are let go (the field command takes them; a town's streets
    // still heal whoever stands in them).
    const stand=wodAiLastStand(owner);
    for(const u of army){
        if(stand&&isLandArmyUnit(u)&&!u._medicalEvacuating&&!u.pickupUid&&!u.cargo&&wodAiCanReach(u,stand.town)){
            if(u._medicalRecovering||u._medicalGoal)wodReleaseRecoveredUnit(u,false);
            continue;
        }
        const hp=u.hp/u.maxHp,manpower=(u.manpower??u.maxManpower)/(u.maxManpower||1000),morale=(u.morale??100)/(u.maxMorale||100);
        const groupId=u._aiRecoveryGroup||task?.unitJob[u.uid],job=task?.jobs.find(j=>j.id===groupId);
        if(wodAiTownHoldContext(u,job)){wodAiCancelTownWithdrawal(u);continue;}
        const group=job?army.filter(a=>job.members.includes(a.uid)||a._aiRecoveryGroup===groupId):[];
        const ready=group.filter(a=>!a._medicalRecovering&&!a.retreating&&a.hp>a.maxHp*.6).length;
        const needsRotation=job&&!job.city&&!job.fort&&group.length>=3&&ready<Math.max(3,Math.ceil(group.length*.6));
        // Back to the line at about four fifths: the last tenth of a refill takes as long as the rest while the
        // fight goes on without the regiment.
        const release=u.isGeneral?.94:TU.healBack!==0?.82:needsRotation?.85:.92;
        if(hp>=release&&manpower>=release&&morale>=(TU.healBack!==0||needsRotation?.8:.9)&&!u.moraleBroken){
            if(u._medicalRecovering||u._medicalGoal){wodReleaseRecoveredUnit(u,true);wodAiRecord(owner,'recovery-return',{unit:u.uid,group:groupId,strength:Math.round(hp*100)});}
            continue;
        }
        const baitActive=u._aiAmbushBaitUntil>now&&wodAiActiveFrontOperations(owner).some(o=>o.ambush?.bait===u.uid);
        const assault=wodAiUnitAssaultBudget(u);
        const trigger=assault||u._opsStand>now?(u.isGeneral?.52:.35):u.isGeneral?.72:baitActive?.45:u.veteran?.6:.55;
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
        let destination=null,bestCost=Infinity;const ranked=[];
        const reach=wodIsNavalUnit(u)?wodAiOperationReach(u,true):wodAiOperationReach(u);
        for(const site of sites){
            const cells=gameData.cities.includes(site)?getCityUrbanTerrainHexes(site):getHexesInRadius(site.q,site.r,Math.max(1,Math.floor(radius/(hr*1.35)*.75))).map(p=>wodHexAt(p.q,p.r));
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
                if(TU.healRoad!==0)ranked.push({h,cost});
            }
        }
        // Small towns may have one urban cell. Patients wait at separate safe
        // approach positions, then take the next free recovery slot.
        let waiting=false;
        if(!destination)for(const site of sites){
            for(const p of getHexesInRadius(site.q,site.r,3)){
                const h=wodHexAt(p.q,p.r);
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
        const C=hr*1.35;
        if(TU.healRoad!==0&&!waiting&&ranked.length>1&&!wodIsNavalUnit(u)&&u.type!=='marine'&&u._medicalGoal!==getHexKey(destination)){
            // The straight line misleads across a river: of the closest few cells, take the shortest real road.
            const roadCost=c=>{const r=wodAiNeedsLandDetour(u,c.h)?wodAiLandRoute(u,c.h):null;return r?c.cost-Math.hypot(u.x-c.h.x,u.y-c.h.y)+r.length*C:c.cost;};
            ranked.sort((a,b)=>a.cost-b.cost);
            let best=null,bc=Infinity;
            for(const c of ranked.slice(0,3)){if(occupied.has(getHexKey(c.h)))continue;const rc=roadCost(c);if(rc<bc){bc=rc;best=c.h;}}
            if(best)destination=best;
        }
        occupied.add(getHexKey(destination));
        if(!u._medicalRecovering&&groupId){u._aiRecoveryGroup=groupId;rotating.set(groupId,(rotating.get(groupId)||0)+1);}
        u._medicalRecovering=true;u.holding=false;wodAiCommitMission(u,null,'recovery');
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
        if(!same&&wodAiAssignWaypoints(u,[destination],{transportInternal:true,...(dry?{preparedPath:route}:{})})){
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
