// AI: the navy. Naval missions (invasions, raids, escorts, reconnaissance), ferries for troops that need a boat,
// marine raids and beachheads, evacuations by sea, ships hunting ships and coasts.
'use strict';

function findNearestFriendlyWaterHex(owner, x, y) {
    let best = null;
    let bestD = Infinity;
    for(let hex of gameData.hexList) {
        if(!isWaterHex(hex)) continue;
        if(hex.owner !== 0 && hex.owner !== owner) continue;
        let dx = hex.x - x, dy = hex.y - y;
        let d = dx * dx + dy * dy;
        if(d < bestD) {
            bestD = d;
            best = hex;
        }
    }
    return best;
}

function findBestAiShipPrey(unit) {
    let best = null;
    let bestD = Infinity;
    for(let u of wodAiKnownEntities(unit.owner)) {
        if(u.hp <= 0 || !wodIsHostileOwner(u.owner,unit.owner) || u.type === 'convoy') continue;
        let uh = getNearestHexToPoint(u.x, u.y);
        if(!uh) continue;
        if(!isWaterHex(uh) && !getNeighborHexes(uh).some(n => isWaterHex(n))) continue;
        let dx = u.x - unit.x, dy = u.y - unit.y;
        let d = dx * dx + dy * dy;
        if(d < bestD) {
            bestD = d;
            best = u;
        }
    }
    return best;
}

function findAiCoastalObjective(owner, fromX, fromY) {
    let best = null;
    let bestD = Infinity;
    for(let c of wodAiKnownCities(owner)) {
        if(c.owner === owner) continue;
        let ch = wodHexAt(c.q,c.r);
        if(!ch || !getNeighborHexes(ch).some(h => isWaterHex(h))) continue;
        let dx = c.x - fromX, dy = c.y - fromY;
        let d = dx * dx + dy * dy;
        if(c.owner === 1) d *= 0.72;
        if(d < bestD) {
            bestD = d;
            best = c;
        }
    }
    return best;
}

function wodAiCoastalOperation(owner,marines,ships,sectors) {
    if(!marines.length)return null;
    const hr=gameData.hexRadius||20, marineReach=wodAiOperationReach(marines[0]);
    const shipReach=ships.length?wodAiOperationReach(ships[0],true):null;
    const sea=gameData.hexList.filter(h=>isWaterHex(h)&&marineReach.has(getHexKey(h))&&(!shipReach||shipReach.has(getHexKey(h))));
    const towns=wodAiKnownCities(owner).filter(c=>wodIsHostileOwner(c.owner,owner)&&marineReach.has(`${c.q},${c.r}`));
    let best=null,score=Infinity;
    for(const town of towns) {
        const beaches=sea.filter(h=>wodAiDist2(h.x,h.y,town.x,town.y)<Math.pow(hr*8,2)&&
            getNeighborHexes(h).some(n=>n&&!isWaterHex(n)&&n.type!=='mountain'));
        const frontDistance=sectors.length?Math.min(...sectors.map(t=>Math.sqrt(wodAiDist2(t.attackHex.x,t.attackHex.y,town.x,town.y)))):0;
        for(const beach of beaches) {
            const lead=ships[0]||marines[0];
            const value=countNearbyUnits(owner,town.x,town.y,hr*8,true)*8+
                wodAiDist2(lead.x,lead.y,beach.x,beach.y)/(hr*hr*600)-Math.min(12,frontDistance/(hr*5))-(gameData.aiNavalPlans?.[owner]?.goal.id===town.id?12:0);
            if(value<score){score=value;best={town,beach};}
        }
    }
    if(!best)return null;
    const lead=ships[0]||marines[0];
    const rally=sea.filter(h=>h.owner===owner&&getNeighborHexes(h).some(n=>n&&!isWaterHex(n)&&n.owner===owner))
        .sort((a,b)=>wodAiDist2(a.x,a.y,marines[0].x,marines[0].y)+wodAiDist2(a.x,a.y,lead.x,lead.y)-
            wodAiDist2(b.x,b.y,marines[0].x,marines[0].y)-wodAiDist2(b.x,b.y,lead.x,lead.y))[0]||best.beach;
    return {objectiveCity:best.town,beachHex:best.beach,rallyHex:rally,phase:'assemble',phaseAt:wodAiOperationTime()};
}

function wodAiIssueCoastalOperation(unit,job) {
    const op=job.operation,hr=gameData.hexRadius||20,now=wodAiOperationTime(),plan=gameData.aiTaskForces[unit.owner];
    op.objectiveCity=wodAiKnownCities(unit.owner).find(c=>c.id===op.objectiveCity.id)||op.objectiveCity;
    if(!wodIsHostileOwner(op.objectiveCity.owner,unit.owner)&&getCityUrbanTerrainHexes(op.objectiveCity).every(h=>wodIsFriendlyOwner(h.owner,unit.owner))){op.phase='complete';plan.expireAt=0;plan.simBuiltAt=now-240001;unit.aiOrderUntil=0;unit._navalAssaultUntil=0;delete job.operation;return false;}
    const members=wodAiKnownEntities(unit.owner).filter(u=>u.hp>0&&!u.retreating&&op.jobIds.includes(plan.unitJob[u.uid]));
    if(op.phase==='assemble') {
        const near=members.filter(u=>wodAiDist2(u.x,u.y,op.rallyHex.x,op.rallyHex.y)<Math.pow(hr*7,2));
        const ready=near.length>=Math.ceil(members.length*.6)&&near.some(u=>u.type==='marine')&&(!members.some(u=>u.type==='ship')||near.some(u=>u.type==='ship'));
        const strength=wodAiAssaultBalance(unit.owner,near,op.beachHex);
        if(ready&&strength.ready){op.phase='crossing';op.phaseAt=now;}op.waitingForStrength=!strength.ready;
    }
    if(op.phase==='crossing'&&!wodAiAssaultBalance(unit.owner,members,op.beachHex).ready){op.phase='assemble';op.phaseAt=now;}
    if(op.phase==='crossing'&&members.some(u=>u.type==='marine'&&wodAiDist2(u.x,u.y,op.beachHex.x,op.beachHex.y)<Math.pow(hr*4,2))) {op.phase='landing';op.phaseAt=now;}
    let target=op.phase==='assemble'?op.rallyHex:op.beachHex;
    if(op.phase==='landing'&&unit.type==='marine') {
        target=wodAiTownAssaultHex(unit,op.objectiveCity,members.filter(u=>u.type==='marine'));
        unit.aiCaptureHexKey=target&&getHexKey(target);
    } else unit.aiCaptureHexKey=null;
    if(wodIsNavalUnit(unit)&&op.phase!=='assemble') {
        const threats=wodAiKnownEntities(unit.owner).filter(u=>u.hp>0&&wodIsHostileOwner(u.owner,unit.owner)&&wodAiDist2(u.x,u.y,op.beachHex.x,op.beachHex.y)<Math.pow(hr*10,2));
        const water=getHexesInRadius(op.beachHex.q,op.beachHex.r,3).map(p=>wodHexAt(p.q,p.r)).filter(h=>h&&isWaterHex(h));
        const prey=threats.sort((a,b)=>(a.type==='ship'?0:1)-(b.type==='ship'?0:1))[0];
        if(prey)target=water.sort((a,b)=>wodAiDist2(a.x,a.y,prey.x,prey.y)-wodAiDist2(b.x,b.y,prey.x,prey.y))[0]||target;
    }
    const moved=wodAiMoveUnitTowardHex(unit,target,op.phase==='assemble',.65);
    if(moved){wodAiStampOrder(unit,op.phase==='assemble',target,op.phase==='assemble'?3500:18000);unit.aiOrderPhase=op.phase;}
    return moved;
}

function wodAiNavalAssaultTargets(owner) {
    const towns=wodAiKnownCities(owner).filter(c=>wodIsHostileOwner(c.owner,owner));
    const explored=wodFogActive()?wodFogFactionIntel(owner).explored:null,sectors=new Map();
    const revision=(gameData.landGeometryRevision||0)+'|'+(gameData._wodPfVer||0);
    let coast=gameData._navalCoastCells;
    if(!coast||coast.hexes!==gameData.hexes||coast.revision!==revision) {
        const cells=gameData.hexList.filter(h=>!isWaterHex(h)&&h.type!=='mountain'&&getNeighborHexes(h).some(wodIsOpenWaterHex));
        coast=gameData._navalCoastCells={hexes:gameData.hexes,revision,cells};
    }
    // Ownership and fog knowledge stay live; only the physical coast is cached.
    for(const h of coast.cells){
        if(!wodIsHostileOwner(h.owner,owner)||explored&&!explored.has(getHexKey(h)))continue;
        const key=h.owner+':'+Math.floor(h.q/12)+','+Math.floor(h.r/12);
        if(!sectors.has(key))sectors.set(key,{id:'shore-'+getHexKey(h),x:h.x,y:h.y,owner:h.owner,shore:true});
    }
    return [...towns,...sectors.values()];
}

function wodAiPlanBeachhead(owner,supplyShips) {
    wodAiDirectBeachhead(owner,supplyShips);
}

function wodAiHarborUseful(city,owner) {
    const fog=wodFogActive(),stamp=owner+'/'+(gameData._supplyTopologyVersion||0)+'/'+fog+'/'+Math.floor((gameData._aiEconomyClock||0)/6);
    let cache=gameData._harborUtilityCache;if(!cache||cache.hexes!==gameData.hexes)cache=gameData._harborUtilityCache={hexes:gameData.hexes,cities:new WeakMap()};
    const old=cache.cities.get(city);if(old&&old.stamp===stamp)return old.value;
    const intel=fog?wodFogFactionIntel(owner):null,seen=new Set(),probe={type:'ship',owner,radius:20};let useful=false;
    for(const p of getHexesInRadius(city.q,city.r,3)){
        const h=wodHexAt(p.q,p.r);if(!wodIsOpenWaterHex(h))continue;
        const region=wodNavalWaterRegionKeys(probe,h);if(!region||seen.has(region))continue;seen.add(region);
        if(wodAiKnownEntities(owner).some(u=>wodIsHostileOwner(u.owner,owner)&&wodIsNavalUnit(u)&&region.has(getHexKey(getNearestHexToPoint(u.x,u.y))))){useful=true;break;}
        if(region.size<24)continue;
        if(wodAiKnownCities(owner).some(c=>wodIsHostileOwner(c.owner,owner)&&getHexesInRadius(c.q,c.r,3).some(p=>region.has(p.q+','+p.r)))){useful=true;break;}
        for(const key of region){
            if(fog&&!intel.explored.has(key)){useful=true;break;}
            if(getNeighborHexes(gameData.hexes[key]).some(n=>!isWaterHex(n)&&wodIsHostileOwner(n.owner,owner)&&(!fog||intel.visible.has(getHexKey(n))))){useful=true;break;}
        }
        if(useful)break;
    }
    cache.cities.set(city,{stamp,value:useful});return useful;
}

function wodAiScoutFleet(owner,transports) {
    // Sea control is useful with or without fog. Ships patrol known enemy
    // coasts/convoys, while transports remain available for actual ferries.
    const warships=gameData.entities.filter(u=>u.owner===owner&&u.type==='ship'&&u.hp>u.maxHp*.45&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&!u._trafficYield&&!(u._aiScoutUntil>wodAiOperationTime()));
    const known=wodAiKnownEntities(owner).filter(u=>u.hp>0&&wodIsHostileOwner(u.owner,owner)&&(u.type!=='convoy'||u.convoySeaRoute));
    const coasts=wodAiKnownCities(owner).filter(c=>wodIsHostileOwner(c.owner,owner)&&cityHasWaterNeighbor(c));
    for(const ship of warships){
        if(ship._combatEngaged)continue;
        const region=wodNavalWaterRegionKeys(ship,getNearestHexToPoint(ship.x,ship.y));if(!region)continue;
        const goals=[...known.filter(u=>{const h=getNearestHexToPoint(u.x,u.y);return wodIsNavalUnit(u)||h&&getNeighborHexes(h).some(wodIsOpenWaterHex);}),...coasts]
            .sort((a,b)=>wodAiDist2(ship.x,ship.y,a.x,a.y)-wodAiDist2(ship.x,ship.y,b.x,b.y));
        for(const goal of goals.slice(0,4)){
            const range=goal.type==='convoy'?0:(ship.range||80)*.85;
            const center=getNearestHexToPoint(goal.x,goal.y);if(!center)continue;
            const sites=getHexesInRadius(center.q,center.r,5).map(p=>wodHexAt(p.q,p.r)).filter(h=>h&&region.has(getHexKey(h))&&wodNavalDestinationClear(ship,h))
                .sort((a,b)=>Math.abs(Math.hypot(a.x-goal.x,a.y-goal.y)-range)*4+Math.hypot(a.x-ship.x,a.y-ship.y)*.1-Math.abs(Math.hypot(b.x-goal.x,b.y-goal.y)-range)*4-Math.hypot(b.x-ship.x,b.y-ship.y)*.1);
            const site=sites[0];if(!site)continue;
            if(Math.hypot(site.x-ship.x,site.y-ship.y)<(gameData.hexRadius||20)*1.2)break;
            if(ship.target&&Math.hypot((ship.orderTarget||ship.target).x-site.x,(ship.orderTarget||ship.target).y-site.y)<(gameData.hexRadius||20)*2)break;
            if(assignUnitMoveAlongWaypoints(ship,[site],{transportInternal:true})){ship._navalRole='Coastal patrol';break;}
        }
    }
    wodAiNavalRecon(owner,transports);
}

function wodAiRescueIslandTroops(owner,supplyShips) {
    const towns=gameData.cities.filter(c=>c.owner===owner),support=new Map(),clock=wodAiOperationTime();
    const seaRegions=supplyShips.map(s=>wodNavalWaterRegionKeys(s,getNearestHexToPoint(s.x,s.y))).filter(Boolean);
    for(const u of gameData.entities){
        if(u.owner!==owner||u.hp<=0||!isLandArmyUnit(u)||u.boardTransportUid||u.moraleBroken||u._medicalEvacuating)continue;
        const here=getNearestHexToPoint(u.x,u.y);if(!here||isWaterHex(here)||!wodGetUnitEncirclementState(u,here))continue;
        const region=wodTransportLandingRegion(u,here);if(!region||towns.some(c=>region.has(`${c.q},${c.r}`)))continue;
        u.holding=false;
        if(!support.has(region))support.set(region,[...region].some(k=>getNeighborHexes(gameData.hexes[k]).some(h=>wodIsOpenWaterHex(h)&&seaRegions.some(sea=>sea.has(getHexKey(h))))));
        u._trafficYield=null;u._navalAssaultUntil=clock+8000;u.retreating=false;
        if(support.get(region)&&wodAiTimelyIslandSupport(u,supplyShips)){u._navalLanded=true;u._navalEvacuating=false;continue;}
        // No support vessel can reach this island. Request a ferry home
        // and meet it on a dry coast instead of renewing a fatal Hold.
        const home=towns.slice().sort((a,b)=>wodAiDist2(a.x,a.y,u.x,u.y)-wodAiDist2(b.x,b.y,u.x,u.y))[0];
        if(!home)continue;
        u._navalLanded=false;u._navalEvacuating=true;u._needsTransport=true;u._navalAssaultGoal={x:home.x,y:home.y};
        const ferries=gameData.entities.filter(t=>t.owner===owner&&t.type==='transport'&&t.hp>0&&!t._medicalRecovering&&!t.cargo&&!t.pickupUid&&!t.retreating&&!t.moraleBroken)
            .sort((a,b)=>wodAiDist2(a.x,a.y,u.x,u.y)-wodAiDist2(b.x,b.y,u.x,u.y));
        for(const ferry of ferries){
            ferry._trafficYield=null;
            if(wodOrderBoardTransport(u,ferry)){ferry._aiFleetId=null;ferry._aiFerryMission=true;ferry.ferryGoal={x:home.x,y:home.y};break;}
        }
        if(u.boardTransportUid)continue;
        if(u.target)continue;
        const shore=[...region].map(k=>gameData.hexes[k]).filter(h=>h&&!isWaterHex(h)&&getNeighborHexes(h).some(wodIsOpenWaterHex))
            .sort((a,b)=>wodAiDist2(a.x,a.y,home.x,home.y)+wodAiDist2(a.x,a.y,u.x,u.y)*.3-wodAiDist2(b.x,b.y,home.x,home.y)-wodAiDist2(b.x,b.y,u.x,u.y)*.3)[0];
        if(shore)assignUnitMoveAlongWaypoints(u,[shore]);
    }
}

function wodAiPlanFerryAssaults(owner,transports,operationSea=null) {
    const clock=wodAiOperationTime();
    if(!operationSea){
        wodAiMaintainMissions(owner,transports);
        wodAiPlanMedicalFerries(owner,transports);
        wodAiNavalRecon(owner,transports);
        const support=gameData.entities.filter(u=>u.owner===owner&&u.type==='supply'&&u.hp>0&&!u.retreating&&!u._medicalRecovering);
        wodAiPlanMarineRaids(owner,gameData.entities.filter(u=>u.owner===owner&&u.type==='marine'));
        wodAiRescueIslandTroops(owner,support);wodAiRetireBeachheads(owner);wodAiPlanEvacuationFerries(owner,transports);wodAiPlanBeachhead(owner,support);
        const missions=wodAiNavalMissionStore(owner),seas=new Set();
        for(const u of gameData.entities.filter(u=>u.owner===owner&&u.hp>0&&(u.type==='transport'||u.type==='marine'||u.type==='supply'))){const sea=wodAiSeaRegionFrom(owner,u);if(sea?.size)seas.add(sea);}
        gameData.aiNavalPlans||={};
        for(const sea of seas){
            gameData.aiNavalPlans[owner]=missions.get(sea)||null;
            wodAiPlanFerryAssaults(owner,transports,sea);
            const mission=gameData.aiNavalPlans[owner];if(mission)missions.set(sea,mission);else missions.delete(sea);
        }
        for(const sea of missions.keys())if(!seas.has(sea))missions.delete(sea);
        gameData.aiNavalPlans[owner]=[...missions.values()].sort((a,b)=>Number(b.canSail)-Number(a.canSail)||a.at-b.at)[0]||null;
        return;
    }
    const onSea=u=>operationSea.has(getHexKey(getNearestHexToPoint(u.x,u.y)));
    transports=transports.filter(t=>onSea(t));
    transports=transports.filter(t=>!t._aiMedicalFor&&!t._aiEvacFor&&!(t._aiScoutUntil>clock));
    const targets=wodAiNavalAssaultTargets(owner).filter(t=>wodAiLandingOnSea(owner,t,operationSea));
    const supplyShips=gameData.entities.filter(u=>u.owner===owner&&u.type==='supply'&&onSea(u)&&u.hp>0&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&!(u._aiMedicalSupplyUntil>clock));
    const land=gameData.entities.filter(u=>u.owner===owner&&(u.hp>u.maxHp*.5||u.hp>0&&u._navalEvacuating)&&(isLandArmyUnit(u)||u.type==='marine')&&(!u._medicalRecovering||u._navalEvacuating)&&!u.retreating&&!u.moraleBroken&&!u.boardTransportUid);
    // Keep one infantry home at every town, even when the invasion is attractive.
    const guards=new Set();for(const city of gameData.cities.filter(c=>c.owner===owner)){
        const region=wodTransportLandingRegion({type:'light',owner},city);
        const guard=land.filter(u=>u.type==='light'&&!guards.has(u)&&!u._navalEvacuating&&region?.has(getHexKey(getNearestHexToPoint(u.x,u.y)))).sort((a,b)=>wodAiDist2(a.x,a.y,city.x,city.y)-wodAiDist2(b.x,b.y,city.x,city.y))[0];if(guard)guards.add(guard);
    }
    for(const u of land)u._navalGarrison=guards.has(u);
    const regions=new Map();
    const regionFor=c=>{const h=getNearestHexToPoint(c.x,c.y),key=getHexKey(h);if(regions.has(key))return regions.get(key);const region=wodTransportLandingRegion({type:'light',owner},c);if(region)for(const k of region)regions.set(k,region);return region;};
    const candidates=land.filter(u=>!u._navalEvacuating&&(onSea(u)||wodAiLandingOnSea(owner,u,operationSea))&&!u._aiMarineRaid&&!(u._aiMarineGroundUntil>clock)&&!u._medicalEvacuating&&wodAiGeneralCanTransfer(u,targets,supplyShips)&&!(u._aiScoutUntil>clock)&&!guards.has(u)&&!['defend','hold'].includes(u.aiTfKind)&&(u.type==='marine'||!(u._navalAssaultUntil>wodAiOperationTime())));
    const mission=wodAiChooseNavalMission(owner,transports,candidates,targets,supplyShips);
    // Water-separated targets create explicit ferry requests, even if a
    // normal land route never produced a movement target in the first place.
    for(const u of candidates){
        if(u._navalEvacuating)continue;
        if(u.type!=='marine'&&(!mission||!mission.troops.includes(u.uid))){
            u._needsTransport=false;u._navalAssaultGoal=null;continue;
        }
        const from=getNearestHexToPoint(u.x,u.y);if(!from||isWaterHex(from)&&u.type!=='marine')continue;
        let target=mission?.goal||targets.slice().sort((a,b)=>wodAiDist2(u.x,u.y,a.x,a.y)*(a.shore?1:.25)-wodAiDist2(u.x,u.y,b.x,b.y)*(b.shore?1:.25)).find(c=>{const region=regionFor(c);return region&&!region.has(getHexKey(from));});
        if(target?.shore){const region=regionFor(target),town=targets.filter(c=>!c.shore&&region.has(getHexKey(getNearestHexToPoint(c.x,c.y)))).sort((a,b)=>wodAiDist2(target.x,target.y,a.x,a.y)-wodAiDist2(target.x,target.y,b.x,b.y))[0];if(town)target=town;}
        if(target){
            // Reinforcement ferries use the existing beachhead instead of
            // scattering fresh passengers along an unsupported distant coast.
            const region=regionFor(target),beachhead=land.filter(e=>e._navalLanded&&region?.has(getHexKey(getNearestHexToPoint(e.x,e.y))))
                .sort((a,b)=>wodAiDist2(a.x,a.y,target.x,target.y)-wodAiDist2(b.x,b.y,target.x,target.y))[0];
            const destination=mission?.landing||beachhead||target;
            if(u.type==='marine'){
                u._needsTransport=false;
                // A proposed target is not a live movement assignment.
                // Do not suppress ordinary orders while no fleet can launch.
                if(!mission){u._navalAssaultUntil=0;continue;}
                u._navalAssaultUntil=clock+8000;
                if(region?.has(getHexKey(from))){u._navalLanded=true;continue;}
                if((mission?.canSail||mission?.canMarinesSail)&&(!u.target||!u.orderTarget||Math.hypot(u.orderTarget.x-destination.x,u.orderTarget.y-destination.y)>gameData.hexRadius*3))
                    assignUnitMoveAlongWaypoints(u,[{x:destination.x,y:destination.y,intoWater:true}],{transportInternal:true});
                continue;
            }
            u._needsTransport=true;u._navalAssaultGoal={x:destination.x,y:destination.y};
        }
        else if(u._navalAssaultGoal){u._needsTransport=false;u._navalAssaultGoal=null;}
    }
    for(const t of transports.filter(t=>t.owner===owner&&t.hp>0&&t.cargo&&t._aiFerryMission&&!t._aiFerryReturning&&!t.retreating&&!t._trafficYield)){
        const region=wodTransportLandingRegion(t.cargo,t.unloadGoal||t.ferryGoal),aim=mission?.landing||t.unloadGoal||t.ferryGoal||t;
        const anchor=land.filter(u=>u._navalLanded&&region?.has(getHexKey(getNearestHexToPoint(u.x,u.y))))
            .sort((a,b)=>wodAiDist2(a.x,a.y,aim.x,aim.y)-wodAiDist2(b.x,b.y,aim.x,aim.y))[0];
        const beach=gameData.hexes[t.unloadHexKey];
        const uncovered=beach&&t.cargo.type!=='marine'&&!wodCurrentSupplyComponent(beach,owner).city&&!supplyShips.some(s=>Math.hypot(s.x-beach.x,s.y-beach.y)<wodFortCombatAuraRadiusPx()*.93);
        if(wodAiFerryCanSail(t)&&anchor&&(!beach||uncovered||Math.hypot(beach.x-anchor.x,beach.y-anchor.y)>wodFortCombatAuraRadiusPx()*.75))wodOrderUnloadTransport(t,anchor);
    }
    for(const t of transports.filter(t=>t.owner===owner&&t.hp>0&&!t._medicalRecovering&&!t.retreating&&!t.moraleBroken&&!t.cargo&&!t.pickupUid)){
        const available=candidates.filter(u=>u._needsTransport&&!u.boardTransportUid&&(!u.isGeneral||u._navalEvacuating||mission&&wodAiGeneralCanTransfer(u,[mission.goal],supplyShips))).sort((a,b)=>Number(!!b._navalEvacuating)-Number(!!a._navalEvacuating)||Number(b.type==='heavy')-Number(a.type==='heavy')||wodAiDist2(a.x,a.y,t.x,t.y)-wodAiDist2(b.x,b.y,t.x,t.y));
        for(const u of available){if(!u._navalEvacuating&&mission&&!mission.canEmbark)break;const goal=u._navalAssaultGoal||u.orderTarget;if(wodOrderBoardTransport(u,t)){t._aiFleetId=u._navalEvacuating?null:mission?.id;t.ferryGoal=goal?{x:goal.x,y:goal.y}:null;t._aiFerryMission=true;break;}}
    }
    const combatShips=gameData.entities.filter(u=>u.owner===owner&&u.type==='ship'&&onSea(u)&&u.hp>u.maxHp*.45&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken);
    const supplyEscorts=wodAiEscortSupply(owner,supplyShips,combatShips,mission);
    for(const ship of supplyShips){
        if(ship._trafficYield)continue;
        const landing=transports.filter(t=>t.owner===owner&&t.hp>0&&!t._aiMedicalFor&&(t.cargo||t.ferryGoal||t.unloadGoal)).sort((a,b)=>wodAiDist2(a.x,a.y,ship.x,ship.y)-wodAiDist2(b.x,b.y,ship.x,ship.y))[0];
        const landed=gameData.entities.filter(u=>u.owner===owner&&u.hp>0&&!wodIsNavalUnit(u)&&!u.boardTransportUid&&(u._navalLanded||u._navalAssaultGoal||u.type==='marine'));
        // A captured town supplies the current foothold, but it does not
        // supply the next hostile cells. Follow the landed wave's next
        // bound instead of anchoring support at its original beach.
        const protectedTroops=landed.filter(u=>u._navalLanded&&u.type!=='marine'&&(!wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city||u._navalAdvanceGoal)&&
            !supplyShips.some(other=>other!==ship&&wodAiDist2(other.x,other.y,u.x,u.y)<wodAiDist2(ship.x,ship.y,u.x,u.y)));
        const needs=protectedTroops.filter(u=>{const h=getNearestHexToPoint(u.x,u.y);if(!h||isWaterHex(h))return false;const state=wodCurrentSupplyComponent(h,owner);return !state.city&&!wodSupplyShipForUnit(u);});
        needs.sort((a,b)=>(b.outOfSupplySeconds||0)-(a.outOfSupplySeconds||0)||wodAiDist2(a.x,a.y,ship.x,ship.y)-wodAiDist2(b.x,b.y,ship.x,ship.y));
        const beachhead=needs[0]||landed.sort((a,b)=>wodAiDist2(a.x,a.y,ship.x,ship.y)-wodAiDist2(b.x,b.y,ship.x,ship.y))[0];
        const advancing=protectedTroops.find(u=>u._navalAdvanceGoal);
        const waveGoal=mission?.support.includes(ship.uid)?(mission.phase==='prepare'?mission.rendezvous:mission.landing):null;
        const goal=needs[0]||advancing?._navalAdvanceGoal||protectedTroops[0]||waveGoal||
            (landing?(landing.cargo?(gameData.hexes[landing.unloadHexKey]||landing):landing):beachhead);if(!goal)continue;
        const radius=wodFortCombatAuraRadiusPx(),threats=wodAiKnownEntities(owner).filter(e=>e.hp>0&&wodIsHostileOwner(e.owner,owner));
        const landingLanes=transports.filter(t=>t.owner===owner&&t.cargo&&t.unloadHexKey).map(t=>({land:gameData.hexes[t.unloadHexKey],water:t._trafficYield?.points?.at(-1)||t.orderTarget,radius:(ship.radius||16)+(t.cargo.radius||12)+8,waterRadius:(ship.radius||16)+(t.radius||16)+8}));
        const clearsLanding=h=>landingLanes.every(l=>(!l.land||Math.hypot(h.x-l.land.x,h.y-l.land.y)>l.radius)&&(!l.water||Math.hypot(h.x-l.water.x,h.y-l.water.y)>l.waterRadius));
        const seaRegion=wodNavalWaterRegionKeys(ship,getNearestHexToPoint(ship.x,ship.y));
        const sites=gameData.hexList.filter(h=>wodIsOpenWaterHex(h)&&(!seaRegion||seaRegion.has(getHexKey(h)))&&
            (Math.hypot(h.x-goal.x,h.y-goal.y)<radius*.9||protectedTroops.length&&Math.hypot(h.x-ship.x,h.y-ship.y)<(gameData.hexRadius||20)*4)&&
            clearsLanding(h));
        const current=getNearestHexToPoint(ship.x,ship.y);if(protectedTroops.length&&wodIsOpenWaterHex(current)&&!sites.includes(current))sites.push(current);
        const dependent=protectedTroops.filter(u=>!wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city);
        const coverAll=h=>dependent.every(u=>Math.hypot(h.x-u.x,h.y-u.y)<radius*.99);
        const supplyReach=wodAiSupplyReach(ship,dependent);
        const reachableSites=sites.filter(h=>supplyReach.has(getHexKey(h))),screened=reachableSites.filter(h=>wodAiSupplySiteSafe(ship,h));
        const safeSites=screened.filter(coverAll),choices=safeSites.length?safeSites:screened;
        if(dependent.length&&!safeSites.length)for(const u of dependent)u._aiSupplyHoldUntil=clock+8000;
        choices.sort((a,b)=>{const score=h=>wodAiDist2(h.x,h.y,goal.x,goal.y)*2+wodAiDist2(h.x,h.y,ship.x,ship.y)*.15+dependent.reduce((n,u)=>n+Math.max(0,Math.hypot(h.x-u.x,h.y-u.y)-radius*.88)**2*32,0)+threats.reduce((n,e)=>n+Math.max(0,140-Math.hypot(h.x-e.x,h.y-e.y))**2*3,0);return score(a)-score(b);});
        const site=choices.find(h=>wodNavalDestinationClear(ship,h));
        if(!site&&protectedTroops.length&&wodAiSupplyExposure(ship,ship).length){
            for(const u of protectedTroops){u._navalEvacuating=true;u._needsTransport=true;u._aiSupplyHoldUntil=clock+8000;}
            const at=getNearestHexToPoint(ship.x,ship.y),escape=getHexesInRadius(at.q,at.r,8).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&seaRegion?.has(getHexKey(h))&&
                wodNavalDestinationClear(ship,h)&&!wodAiSupplyExposure(ship,h).length).sort((a,b)=>Math.hypot(a.x-ship.x,a.y-ship.y)-Math.hypot(b.x-ship.x,b.y-ship.y))[0];
            if(escape&&!(ship._aiSupplyEscapeUntil>clock)){
                ship._aiSupplyEscapeUntil=clock+8000;assignUnitMoveAlongWaypoints(ship,[escape],{transportInternal:true});
                wodAiRecord(owner,'supply-emergency-withdrawal',{unit:ship.uid,troops:protectedTroops.length});
            }
        }
        if(site&&Math.hypot(ship.x-site.x,ship.y-site.y)>gameData.hexRadius*.8&&
            (!ship.target||!ship.orderTarget||!clearsLanding(ship.orderTarget)||Math.hypot(ship.orderTarget.x-site.x,ship.orderTarget.y-site.y)>gameData.hexRadius*1.5))
            assignUnitMoveAlongWaypoints(ship,[{x:site.x,y:site.y}],{transportInternal:true});
    }
    const currentRegion=mission?.goal&&regionFor(mission.goal);
    const operation=land.find(u=>u._navalLanded&&(!currentRegion||currentRegion.has(getHexKey(getNearestHexToPoint(u.x,u.y)))))||transports.find(t=>t.owner===owner&&t.cargo)||transports.find(t=>t.owner===owner&&t.pickupUid)||mission?.goal;
    if(operation){
        for(const ship of gameData.entities.filter(u=>u.owner===owner&&u.type==='ship'&&onSea(u)&&u.hp>u.maxHp*.4&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&!(u._aiScoutUntil>clock))){
            ship._navalScoutGoal=null;ship._navalEscortUntil=wodAiOperationTime()+8000;
            if(ship._trafficYield||supplyEscorts.has(ship.uid))continue;
            const enemy=wodAiKnownEntities(owner).filter(e=>e.hp>0&&wodIsHostileOwner(e.owner,owner)&&wodAiDist2(e.x,e.y,operation.x,operation.y)<(gameData.hexRadius*12)**2)
                .sort((a,b)=>wodAiDist2(a.x,a.y,ship.x,ship.y)-wodAiDist2(b.x,b.y,ship.x,ship.y))[0];
            const goal=enemy||mission?.goal||operation,site=wodAiNavalFirePosition(ship,goal);
            if(site&&wodIsOpenWaterHex(site)&&Math.hypot(ship.x-site.x,ship.y-site.y)>gameData.hexRadius*2&&
                (!ship.target||!ship.orderTarget||Math.hypot(ship.orderTarget.x-site.x,ship.orderTarget.y-site.y)>gameData.hexRadius*2))
                assignUnitMoveAlongWaypoints(ship,[{x:site.x,y:site.y}],{transportInternal:true});
        }
    }else wodAiScoutFleet(owner,transports);
    wodAiNavalRecon(owner,transports);
}

// AI ferries, every two seconds (called at the end of wodUpdateTransports): each faction plans its crossings and
// assaults, land units whose march needs a boat are marked, and idle transports get cargo or a landing goal.
function wodAiStepFerries(transports,dt) {
    gameData._transportAiTimer=(gameData._transportAiTimer||0)+dt;
    if(gameData._transportAiTimer<2)return;gameData._transportAiTimer=0;
    const navalOwners=new Set(gameData.entities.filter(u=>u.owner>0&&!wodMpIsHumanOwner(u.owner)&&!wodAiIsSuspended(u.owner)&&(wodIsNavalUnit(u)||isLandArmyUnit(u)||u.type==='marine')).map(u=>u.owner));
    const failed=new Set();
    for(const owner of navalOwners)try{wodAiPlanFerryAssaults(owner,transports);}catch(e){failed.add(owner);wodAiReportError(owner,'ferries',e);}
    for(const u of gameData.entities) {
        if(wodMpIsHumanOwner(u.owner)||!isLandArmyUnit(u)||u.boardTransportUid||!u.orderTarget)continue;
        if(failed.has(u.owner)||wodAiIsSuspended(u.owner))continue;
        try{
        const from=getNearestHexToPoint(u.x,u.y),goal=getNearestHexToPoint(u.orderTarget.x,u.orderTarget.y);
        if(from&&goal&&!isWaterHex(from)&&!isWaterHex(goal)&&wodMarchBlockedWithoutBridge(u,from,goal))u._needsTransport=true;
        }catch(e){failed.add(u.owner);wodAiReportError(u.owner,'ferries',e);}
    }
    for(const t of transports) {
        if(t.hp<=0||wodMpIsHumanOwner(t.owner)||t._medicalRecovering||t._aiMedicalFor||t.retreating||t.moraleBroken||t._aiScoutUntil>wodAiOperationTime())continue;
        if(failed.has(t.owner)||wodAiIsSuspended(t.owner))continue;
        try{
        if(t.cargo&&!t.unloadHexKey&&wodAiFerryCanSail(t)) {
            const goal=t.ferryGoal||t.cargo._navalAssaultGoal||wodAiNavalAssaultTargets(t.owner).sort((a,b)=>wodAiDist2(t.x,t.y,a.x,a.y)-wodAiDist2(t.x,t.y,b.x,b.y))[0];
            if(goal)wodOrderUnloadTransport(t,goal);
        } else if(!t.cargo&&!t.pickupUid) {
            const candidates=gameData.entities.filter(u=>u.owner===t.owner&&u.hp>0&&isLandArmyUnit(u)&&!u._medicalEvacuating&&(!u._medicalRecovering||u._navalEvacuating)&&(u._needsTransport||isWaterHex(getNearestHexToPoint(u.x,u.y)))&&!u.boardTransportUid&&!u._navalGarrison&&(!(u._navalAssaultUntil>wodAiOperationTime())||u._navalEvacuating)&&(!['defend','hold'].includes(u.aiTfKind)||u._navalEvacuating));
            candidates.sort((a,b)=>Number(!!b._needsTransport)-Number(!!a._needsTransport)||wodAiDist2(a.x,a.y,t.x,t.y)-wodAiDist2(b.x,b.y,t.x,t.y));
            if(candidates[0]){const u=candidates[0],mission=gameData.aiNavalPlans?.[t.owner],goal=u._navalAssaultGoal||u.orderTarget;if(!u._navalEvacuating&&mission&&!mission.canEmbark)continue;if(u.isGeneral&&!u._navalEvacuating&&!wodAiGeneralCanTransfer(u,[mission?.goal||goal].filter(Boolean),gameData.entities.filter(s=>s.owner===u.owner&&s.type==='supply'&&s.hp>0&&!s.retreating)))continue;if(wodOrderBoardTransport(u,t)){t._aiFleetId=u._navalEvacuating?null:mission?.id;if(goal)t.ferryGoal={x:goal.x,y:goal.y};t._aiFerryMission=true;}}
        }
        }catch(e){failed.add(t.owner);wodAiReportError(t.owner,'ferries',e);}
    }
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
    const fullFleet=localNaval.filter(u=>u.type==='ship').map(u=>Object.assign(Object.create(u),{hp:u.maxHp||300,manpower:u.maxManpower||5000,morale:u.maxMorale||100,_medicalRecovering:false,retreating:false,moraleBroken:false}));
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
        if(wodAiAssignWaypoints(scout,points,{transportInternal:true})){
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
                if(path.length){u._aiMarineRaidRetreat=raid.id;if(wodAiAssignWaypoints(u,[...(skip?path.slice(1):path),raid.source],{transportInternal:true,forceRetreat:true}))u._aiMarineRaidOrder=raid.id+'-withdraw';}
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
                if(wodAiAssignWaypoints(u,[rally],{transportInternal:true}))u._aiMarineRaidOrder=raid.id+'-gather';
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
                if(path?.length){wodAiAssignWaypoints(u,[...path,beach],{transportInternal:true});u._aiMarineRaidOrder=raid.id;}
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
        for(const u of party){u._aiMarineRaid=raid.id;u._aiRaidProgress={id:raid.id,x:u.x,y:u.y,at:now};u._navalAssaultUntil=now+8000;u._aiMarineRaidOrder=null;gameData._aiMoveQueue?.delete(u);if(wodAiAssignWaypoints(u,[rally],{transportInternal:true}))u._aiMarineRaidOrder=raid.id+'-gather';}
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
    const marineForce=candidates.filter(u=>u.type==='marine'&&!u._aiMarineRaid&&!u._medicalRecovering&&!u._navalEvacuating&&!(u._aiMarineGroundUntil>now));
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
            if(site&&!ship.target&&Math.hypot(ship.x-site.x,ship.y-site.y)>hr*2)wodAiAssignWaypoints(ship,[site],{transportInternal:true});
        }
    }
    if(phase==='regroup')for(const transport of loaded){
        if(transport._trafficYield)continue;
        const point=findNavalRetreatPoint(transport,3);
        if(point){wodClearTransportMove(transport);transport.unloadHexKey=null;wodAiAssignWaypoints(transport,[point],{transportInternal:true});}
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
            wodAiAssignWaypoints(u,[{x:site.x,y:site.y,intoWater:isWaterHex(site)}],{transportInternal:true});
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
        const cityBounds=new Map();
        const connectedBound=h=>{
            const key=getHexKey(h);if(cityBounds.has(key))return cityBounds.get(key);
            let connected=false;
            if(h&&!isWaterHex(h))wodSupplyNeighbors(h,n=>{
                if(!connected&&wodSupplyPassable(n,owner)&&wodCurrentSupplyComponent(n,owner).city)connected=true;
            });
            cityBounds.set(key,connected);return connected;
        };
        const covered=(u,h)=>u.type==='marine'||wodCurrentSupplyComponent(h,owner).city||
            // Once a landed force holds a town, painting its adjacent bound
            // extends that real land corridor. A ship's aura must not become
            // an artificial leash on a city-supplied inland campaign.
            wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),owner).city&&connectedBound(h)||supplyShips.some(s=>
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
                if(same||wodAiAssignWaypoints(u,[{x:target.x,y:target.y}]))u._aiBeachheadOrder={key,attack,at:now,objective:objective?.id};
            }else if(!covered(u,here)){
                const safe=[...region].map(k=>gameData.hexes[k]).filter(h=>h&&!isWaterHex(h)&&legal(h)).sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y))[0];
                if(safe)wodAiAssignWaypoints(u,[safe]);
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
                wodAiAssignWaypoints(escort,[site],{transportInternal:true});
            power+=wodAiUnitCombatPower(escort);wodAiRecord(owner,'supply-escort',{unit:escort.uid,supply:supply.uid,foe:foe.uid});
            if(power>=need||assigned.size>=3)break;
        }
    }
    return assigned;
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
                if(wodAiAssignWaypoints(u,[...path,beach],{transportInternal:true})){
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
                if(wodAiAssignWaypoints(u,[source,...path,beach],{transportInternal:true})){
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
        if(live&&mission.phase==='prepare'&&['supply','gathering','escort'].includes(mission.reason)&&now-watch.at<180000){
            const supportIds=new Set([...(mission.requiredSupply?mission.support||[]:[]),...(mission.requiredEscorts?mission.escorts||[]:[])]);
            const joining=army.some(peer=>peer!==t&&supportIds.has(peer.uid)&&peer.hp>peer.maxHp*.4&&!peer.retreating&&!peer._medicalRecovering&&
                peer.target&&now-(peer._aiWork?.progressAt??0)<16000&&
                wodAiArrivalSeconds(peer,t,hr*5,90)<=90);
            if(joining){wodAiObserveWork(t,'transporting','assembling-support');continue;}
        }
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
