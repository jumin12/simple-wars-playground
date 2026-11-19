// AI: the economy. The opening build order (farms and factories, with the field command's early regiments),
// recruitment against demand and upkeep, the healing allowance for the wounded, and building forts and bridges.
'use strict';

// Land troops. In a land war the field command buys these (wodOpsWarEconomy); this file buys them otherwise.
const WOD_AI_LAND_RECRUITS=['light','motorized','mountaineer','heavy'];

function wodAiRecruitPriorities(owner,cities,army,pending,context) {
    const profile=wodAiCommander(owner),strategy=wodAiBattlePlan(owner,army),count=t=>army.filter(u=>u.type===t).length+pending.filter(j=>j.mode===t).length;
    const hr=gameData.hexRadius||20,known=wodAiThreats(owner).filter(u=>u.hp>0&&u.type!=='convoy'&&wodIsHostileOwner(u.owner,owner));
    const enemyGround=wodAiRecruitThreats(owner,known,army),guards=cities.length;
    // Buy for the ground the fighting is on (the fronts), not for the look of our own land; with too little
    // front to judge by, our own land stands in.
    let rough=null,open=null;
    if(wodOpsTune(owner).frontTerrain!==0){const m=wodAiFrontTerrain(owner);if(m.n>=8){rough=m.rough;open=m.open;}}
    if(rough==null){
        const explored=wodFogActive()?wodFogFactionIntel(owner).explored:null;
        const terrain=[];const stride=Math.max(1,Math.ceil(gameData.hexList.length/1200));
        for(let i=0;i<gameData.hexList.length;i+=stride){const h=gameData.hexList[i];if(!isWaterHex(h)&&(!explored||explored.has(getHexKey(h)))&&(h.owner===owner||isFrontlineHex(h,owner)))terrain.push(h);}
        rough=terrain.filter(h=>h.type==='hill'||h.type==='mountain').length/Math.max(1,terrain.length);
        open=terrain.filter(h=>h.type==='grass'||h.type==='sand').length/Math.max(1,terrain.length);
    }
    const ground=army.filter(isLandArmyUnit).length+pending.filter(j=>isLandArmyUnit({type:j.mode})).length;
    const taskPlan=gameData.aiTaskForces?.[owner];
    const missing=cities.filter(c=>!army.some(u=>u.type==='light'&&!u.boardTransportUid&&wodAiCanReach(u,c)&&(
        Math.hypot(u.x-c.x,u.y-c.y)<hr*5||taskPlan?.jobs.some(j=>j.city?.id===c.id&&taskPlan.unitJob[u.uid]===j.id)&&wodTransportLandingRegion(u,u)?.has(`${c.q},${c.r}`)))&&
        !pending.some(j=>j.mode==='light'&&j.cq===c.q&&j.cr===c.r));
    const requested=Object.values(strategy.requests).filter(r=>wodAiOperationTime()-r.at<30000);
    const pressureByGoal=new Map();for(const r of requested)pressureByGoal.set(r.goal,Math.max(pressureByGoal.get(r.goal)||0,r.power||0));
    const pressureNeed=[...pressureByGoal.values()].reduce((n,p)=>n+Math.ceil(p),0);
    const defenseNeed=taskPlan?.defenseDemand||wodAiDefenseDemand(owner,army,buildAiFrontlineSectors(owner,18),strategy);
    const desiredGround=Math.max(ground+2,guards*4+4,defenseNeed.armyFloor,Math.ceil(enemyGround.reduce((n,u)=>n+wodAiUnitCombatPower(u),0)*1.3)+guards*2,pressureNeed>0?ground+Math.min(12,pressureNeed):0);
    const hasFactory=cities.some(c=>c.hasFactory),hasHarbor=cities.some(c=>c.hasHarbor&&wodAiHarborUseful(c,owner));
    const infantryMin=guards+Math.max(3,Math.ceil(desiredGround*.42));
    const lineGround=army.filter(u=>isLandArmyUnit(u)&&u.type!=='marine'&&!u.boardTransportUid&&!u._medicalRecovering&&!u.retreating&&u.hp>u.maxHp*.55);
    const lineMinimum=guards+(defenseNeed.frontage>0?Math.max(3,Math.ceil(lineGround.length*.45)):0);
    const lineDeficit=Math.max(0,lineMinimum-lineGround.filter(u=>u.type==='light').length-pending.filter(j=>j.mode==='light').length);
    const desired={light:infantryMin,mountaineer:rough>=.12?Math.max(1,Math.ceil(desiredGround*profile.mountain*Math.min(1,rough*2))):0,
        motorized:hasFactory&&open>.18?Math.max(1,Math.ceil(desiredGround*profile.motor)):0,
        heavy:hasFactory&&open>.2?Math.min(Math.max(8,Math.ceil(desiredGround*.16)),Math.max(1,Math.ceil(desiredGround*profile.armor),Math.ceil(enemyGround.filter(u=>u.type==='heavy').length*.7))):0,
        marine:0,ship:0,transport:0,supply:0};
    const expedition=wodAiExpeditionDemand(owner,cities,army,pending);
    Object.assign(desired,expedition.desired);
    // In a war that can only be won across water the army beyond the town guards is marines (wodAiMarineArmy):
    // infantry would need a ferry seat and a supply ship to reach the fighting, marines swim.
    const marineArmy=!!expedition.goal&&wodAiMarineArmy(owner,cities);
    // (and armour, ferried across, wodAiNavalWave: one tank for about three marines)
    if(marineArmy){desired.light=Math.min(desired.light,guards*2);desired.marine=Math.max(desired.marine,Math.ceil(desiredGround*.5));
        if(hasFactory&&wodOpsTune(owner).armourLift!==0)desired.heavy=Math.max(desired.heavy,Math.ceil(desired.marine/3));}
    const reinforcements=wodAiForceRequests(owner,cities,army,pending);
    for(const request of reinforcements)desired[request.type]=Math.max(desired[request.type]||0,count(request.type)+request.n);
    const rescue=army.some(u=>u._navalEvacuating),waiting=expedition.firstWaveSlots;
    const landed=expedition.protectedSupply,demand=!!expedition.goal;
    const enemyShips=known.filter(u=>u.type==='ship').length;
    const atRisk=known.some(u=>cities.some(c=>Math.hypot(u.x-c.x,u.y-c.y)<hr*10));
    const priority={light:missing.length?120:atRisk&&count('light')<guards*2?95:strategy.intent==='defend'?65:35,mountaineer:rough>.35?65:43,motorized:profile.id==='maneuver'?65:52,heavy:enemyGround.some(u=>u.type==='heavy')?67:49,marine:48,transport:rescue?125:waiting?90:70,supply:landed?115:count('transport')?100:50,ship:enemyShips?110:60};
    const choices=Object.keys(desired).filter(t=>desired[t]>count(t)&&(!['ship','transport','supply'].includes(t)||hasHarbor));
    choices.sort((a,b)=>{const rank=t=>expedition.preferred.includes(t)?expedition.preferred.indexOf(t):reinforcements.some(r=>r.type===t)?20:99;return rank(a)-rank(b)||(priority[b]+(desired[b]-count(b))/Math.max(1,desired[b])*15)-(priority[a]+(desired[a]-count(a))/Math.max(1,desired[a])*15);});
    // Opening infantry and town guards remain affordable before specialist investment.
    if(missing.length||lineDeficit>0||ground<Math.max(4,guards*2)&&!(rescue&&hasHarbor))return {types:['light'],desired,missing,atRisk,profile,lineMinimum,lineDeficit,desiredGround};
    // Composition targets select the next useful recruit; they never stop
    // a solvent army from recruiting. Keep an affordable basic fallback.
    // (at sea the basic recruit is the marine)
    if(marineArmy&&!choices.includes('marine'))choices.push('marine');
    if(!choices.includes('light'))choices.push('light');
    const specialistCore=profile.id!=='highland'||rough<.25||count('mountaineer')>=guards*2&&ground>=Math.max(12,guards*4);
    return {types:choices,desired,missing,atRisk,profile,desiredGround,lineMinimum,lineDeficit,expedition,reinforcements,needsFactory:!hasFactory&&open>.18&&ground>=Math.max(4,guards*2)&&specialistCore};
}

/** True when a new fort here would sit inside another friendly fort's combat aura (bonuses do not stack). */
function wodFortInsideFriendlyAura(hex, owner) {
    if(!hex || !owner) return false;
    let list = gameData.forts;
    if(!list || !list.length) return false;
    let r2 = wodFortPlacementRingRadiusSq();
    for(let ft of list) {
        if(!ft || ft.owner !== owner) continue;
        let dx = hex.x - ft.x,
            dy = hex.y - ft.y;
        if(dx * dx + dy * dy <= r2) return true;
    }
    return false;
}

function wodAiFortHasNearbyDefenders(hex, ownerId) {
    if(!hex || !ownerId) return false;
    let hr = gameData.hexRadius || 20;
    let tilePx = hr * 1.35;
    let guardR2 = Math.pow(tilePx * 4, 2);
    return nearestFriendlyLandArmyDistSq(hex.x, hex.y, ownerId) <= guardR2;
}

function wodAiCityNeedsFortGuard(city, ownerId) {
    if(!city || city.owner !== ownerId) return false;
    let cityHex = wodHexAt(city.q,city.r);
    if(!cityHex) return false;
    if(getNeighborHexes(cityHex).some(n => n && wodIsHostileOwner(n.owner, ownerId))) return true;
    for(let pt of getHexesInRadius(city.q, city.r, 2)) {
        let h = wodHexAt(pt.q,pt.r);
        if(h && isFrontlineHex(h, ownerId)) return true;
    }
    return false;
}

function wodAiFortAlreadyGuardsCity(city, ownerId) {
    let list = gameData.forts;
    if(!list || !list.length || !city) return false;
    let r2 = wodFortPlacementRingRadiusSq();
    for(let ft of list) {
        if(!ft || ft.owner !== ownerId) continue;
        let dx = city.x - ft.x,
            dy = city.y - ft.y;
        if(dx * dx + dy * dy <= r2) return true;
    }
    return false;
}

function wodAiIsMountainPassHex(hex, ownerId) {
    if(!hex || hex.owner !== ownerId || isWaterHex(hex) || hex.type === 'mountain') return false;
    let neighbors = getNeighborHexes(hex);
    let mountainAdj = neighbors.filter(n => n && n.type === 'mountain').length;
    if(mountainAdj === 0) return false;
    let enemyAdj = neighbors.some(n => isClaimableLand(n) && wodIsHostileOwner(n.owner, ownerId));
    if(!enemyAdj) return false;
    let blocked = neighbors.filter(n => !n || isWaterHex(n) || n.type === 'mountain' || n.type === 'urban').length;
    if(mountainAdj >= 2) return true;
    if(mountainAdj >= 1 && blocked >= 3) return true;
    if(mountainAdj >= 1 && (hex.type === 'hill' || hex.type === 'forest') && isFrontlineHex(hex, ownerId)) return true;
    return false;
}

function wodAiCollectFortCandidateHexes(ownerId) {
    let seen = new Set();
    let out = [];
    function addHex(h) {
        if(!h) return;
        let k = getHexKey(h);
        if(seen.has(k)) return;
        seen.add(k);
        out.push(h);
    }
    for(let h of wodCachedFrontlineHexes(ownerId)) {
        addHex(h);
        for(const p of getHexesInRadius(h.q,h.r,4))addHex(wodHexAt(p.q,p.r));
    }
    for(let city of wodAiKnownCities(ownerId)) {
        if(city.owner !== ownerId || !wodAiCityNeedsFortGuard(city, ownerId)) continue;
        for(let pt of getHexesInRadius(city.q, city.r, 3)) {
            addHex(wodHexAt(pt.q,pt.r));
        }
    }
    for(let hex of gameData.hexList) {
        if(hex.owner !== ownerId || hex.type === 'mountain') continue;
        if(getNeighborHexes(hex).some(n => n && n.type === 'mountain')) addHex(hex);
    }
    return out;
}

function wodAiScoreFortHex(hex, ownerId) {
    if(!hexEligibleForFortPlacementForOwner(hex, ownerId)) return -1e9;
    let spacingSq = Math.pow((gameData.hexRadius || 20) * WOD_FORT_DEFENSE_TILES * 2.05, 2);
    let sites = [...wodAiKnownForts(ownerId), ...(gameData.constructionJobs || []).filter(j=>j.mode==='fort')];
    if(sites.some(f=>f.owner===ownerId && wodAiDist2(hex.x,hex.y,f.x,f.y)<spacingSq)) return -1e9;
    if(!wodAiFortHasNearbyDefenders(hex,ownerId)||wodHexKeyIsEncircled(getHexKey(hex)))return -1e9;
    for(const p of getHexesInRadius(hex.q,hex.r,2)) {
        const h=wodHexAt(p.q,p.r);
        if(h&&isClaimableLand(h)&&wodIsHostileOwner(h.owner,ownerId))return -1e9;
    }
    if(nearestForeignCombatUnitDistSq(hex.x,hex.y,ownerId)<Math.pow((gameData.hexRadius||20)*7,2))return -1e9;
    let score = 0;
    let hr = gameData.hexRadius || 20;
    let tilePx = hr * 1.35;
    let fortR2 = wodFortPlacementRingRadiusSq();

    const frontDist=nearestHexDistanceSq(hex.x,hex.y,wodCachedFrontlineHexes(ownerId));
    if(frontDist<=Math.pow(tilePx*6,2))score+=90;
    else if(frontDist<=Math.pow(tilePx*10,2))score+=45;

    let enemyDistSq = nearestForeignCombatUnitDistSq(hex.x, hex.y, ownerId);
    if(enemyDistSq < Math.pow(tilePx * 5.5, 2)) score += 72;
    else if(enemyDistSq < Math.pow(tilePx * 11, 2)) score += 34;

    if(wodAiIsMountainPassHex(hex, ownerId)) score += 96;

    for(let city of wodAiKnownCities(ownerId)) {
        if(city.owner !== ownerId || !wodAiCityNeedsFortGuard(city, ownerId)) continue;
        let dq = hex.q - city.q,
            dr = hex.r - city.r;
        let hexDistSq = dq * dq + dr * dr;
        if(hexDistSq > 9) continue;
        let guardBonus = hexDistSq <= 1 ? 105 : (hexDistSq <= 4 ? 78 : 48);
        if(wodAiFortAlreadyGuardsCity(city, ownerId)) guardBonus *= 0.35;
        score += guardBonus;
        if(getNeighborHexes(hex).some(n => n && n.q === city.q && n.r === city.r)) score += 22;
    }

    if(hex.type === 'hill') score += 14;
    else if(hex.type === 'forest') score += 6;

    let friendlyForts = wodAiKnownForts(ownerId).filter(f => f && f.owner === ownerId);
    if(friendlyForts.length) {
        let nearestFortSq = Infinity;
        for(let ft of friendlyForts) {
            let dx = hex.x - ft.x,
                dy = hex.y - ft.y;
            let d2 = dx * dx + dy * dy;
            if(d2 < nearestFortSq) nearestFortSq = d2;
        }
        if(nearestFortSq < fortR2 * 0.55) score -= 200;
        else if(nearestFortSq < fortR2 * 1.15) score -= 45;
    }

    if(!isFrontlineHex(hex, ownerId) && score < 55) {
        let frontDist = nearestHexDistanceSq(hex.x, hex.y, wodCachedFrontlineHexes(ownerId));
        if(frontDist > Math.pow(tilePx * 14, 2)) score -= 40;
    }

    return score;
}

function wodAiTryFortForOwner(ownerId, ownerMoneyKey) {
    if(!gameData.hexList || !gameData.hexList.length) return false;
    if((gameData.aiMoneyByOwner[ownerMoneyKey] || 0) < WOD_PRICE_FORT) return false;
    let fieldArmy = gameData.entities.filter(u=>u.owner===ownerId && u.hp>0 && u.type!=='convoy').length;
    if(fieldArmy < 10) return false;
    let existing = (gameData.forts || []).filter(f => f && f.owner === ownerId).length + (gameData.constructionJobs || []).filter(j=>j.owner===ownerId && j.mode==='fort').length;
    let cityCount = gameData.cities.filter(c => c.owner === ownerId).length;
    let fortCap = Math.max(1, Math.min(cityCount, Math.ceil(fieldArmy/12)));
    if(existing >= fortCap) return false;

    let candidates = wodAiCollectFortCandidateHexes(ownerId);
    if(!candidates.length) return false;

    // Scoring is expensive per hex (unit/frontline distance scans) and the candidate set
    // can be thousands of tiles — unbounded this ran ~240ms and was the periodic combat
    // hitch. Sample a bounded, spread subset. (A fixed number, not a wall-clock deadline: the site chosen
    // must not depend on how fast the computer is.)
    if(candidates.length > 60) {
        let sampled = [];
        let stride = candidates.length / 60;
        for(let ci = 0; ci < 60; ci++) sampled.push(candidates[Math.floor(ci * stride)]);
        candidates = sampled;
    }
    let bestHex = null,
        bestScore = 0;
    const MIN_SCORE = 52;
    for(let hex of candidates) {
        let s = wodAiScoreFortHex(hex, ownerId);
        if(s > bestScore) {
            bestScore = s;
            bestHex = hex;
        }
    }
    if(!bestHex || bestScore < MIN_SCORE) return false;
    if(isFrontlineHex(bestHex, ownerId) && !wodAiFortHasNearbyDefenders(bestHex, ownerId)) return false;
    if(!attemptFortPlacementForOwner(bestHex, ownerId, true)) return false;
    wodAiEnsureFortGuard(ownerId, bestHex);
    return true;
}

/** One uninterrupted water crossing, allowing the land banks at both ends. */
function wodAiWaterSeparatesShores(a, b) {
    if(!a || !b) return false;
    const samples=12;let water=0,leftWater=false;
    for(let si=1;si<samples;si++) {
        let t = si / samples;
        let px = a.x + (b.x - a.x) * t;
        let py = a.y + (b.y - a.y) * t;
        let h = getNearestHexToPoint(px, py);
        if(!h||isBridgeHex(h)||h.type==='mountain'||h.type==='urban')return false;
        if(isWaterHex(h)) {
            if(leftWater)return false;
            water++;
        } else if(water)leftWater=true;
    }
    return water>=2;
}

function wodAiBridgeAlreadyServesShores(a, b) {
    let hr = gameData.hexRadius || 20;
    let midX = (a.x + b.x) * 0.5,
        midY = (a.y + b.y) * 0.5;
    for(let bi = 0, bl = (gameData.bridges || []).length; bi < bl; bi++) {
        let br = gameData.bridges[bi];
        if(!br) continue;
        if(wodDistToBridgeRect(a.x, a.y, br) <= hr * 4.2 &&
            wodDistToBridgeRect(b.x, b.y, br) <= hr * 4.2) return true;
        if(wodDistToBridgeRect(midX, midY, br) <= hr * 3.6) return true;
    }
    return false;
}

function wodAiCollectBridgeCandidateSites(ownerId) {
    let hr = gameData.hexRadius || 20;
    let spacing = hr * 1.35;
    let minDist2 = Math.pow(spacing * 1.8, 2);
    let maxDist2 = Math.pow(spacing * 5.4, 2);
    let ownCoast = [];
    let farCoast = [];
    let ownSeen = new Set();
    let farSeen = new Set();
    function addOwnCoast(h) {
        if(!h || h.owner !== ownerId || isWaterHex(h) || h.type === 'mountain' || h.type === 'urban') return;
        if(!getNeighborHexes(h).some(n => n && isWaterHex(n) && !isBridgeHex(n))) return;
        let k = getHexKey(h);
        if(ownSeen.has(k)) return;
        ownSeen.add(k);
        ownCoast.push(h);
    }
    function addFarCoast(h) {
        if(!h || isWaterHex(h) || h.type === 'mountain' || h.type === 'urban') return;
        if(wodFogActive()&&!wodFogFactionIntel(ownerId).explored.has(getHexKey(h)))return;
        // Far shore: enemy land, neutral land, or own land across a river.
        if(h.owner === ownerId) return;
        if(!getNeighborHexes(h).some(n => n && isWaterHex(n) && !isBridgeHex(n))) return;
        let k = getHexKey(h);
        if(farSeen.has(k)) return;
        farSeen.add(k);
        farCoast.push(h);
    }
    // Walk a short water corridor from a water cell beside our shore to the opposite shore (rivers can be 2–4 tiles wide).
    const walked=new Set();
    function walkAcross(n) {
        if(!n || !isWaterHex(n) || isBridgeHex(n) || walked.has(getHexKey(n))) return;
        let waterQ = [n];
        let waterSeen = new Set([getHexKey(n)]);
        for(let wi = 0; wi < waterQ.length && wi < 18; wi++) {
            let wh = waterQ[wi];
            walked.add(getHexKey(wh));
            for(let nn of getNeighborHexes(wh)) {
                if(!nn) continue;
                if(isWaterHex(nn) && !isBridgeHex(nn)) {
                    let wk = getHexKey(nn);
                    if(waterSeen.has(wk)) continue;
                    waterSeen.add(wk);
                    if(waterQ.length < 18) waterQ.push(nn);
                } else {
                    addFarCoast(nn);
                    addOwnCoast(nn);
                }
            }
        }
    }
    for(let h of wodCachedFrontlineHexes(ownerId)) {
        addOwnCoast(h);
        for(let n of getNeighborHexes(h)) {
            addOwnCoast(n);
            walkAcross(n);
        }
    }
    for(let city of wodAiKnownCities(ownerId)) {
        if(city.owner !== ownerId) continue;
        for(let pt of getHexesInRadius(city.q, city.r, 4))
            addOwnCoast(wodHexAt(pt.q,pt.r));
    }
    // Armies can wait at internal rivers far from a town or political
    // frontier. Include those shores and prioritize useful nearby sites.
    const waiting=wodAiKnownEntities(ownerId).filter(u=>u.owner===ownerId&&u.hp>0&&isLandArmyUnit(u))
        .sort((a,b)=>Number(!!b.target)-Number(!!a.target)).slice(0,32);
    for(const unit of waiting) {
        const h=getNearestHexToPoint(unit.x,unit.y);
        if(h)for(const pt of getHexesInRadius(h.q,h.r,5))
            addOwnCoast(wodHexAt(pt.q,pt.r));
    }
    const proximity=new Map();
    const distance=h=>{if(!proximity.has(h))proximity.set(h,nearestFriendlyLandArmyDistSq(h.x,h.y,ownerId));return proximity.get(h);};
    ownCoast.sort((a,b)=>distance(a)-distance(b));
    // (WOD_OPS.T.landBridges=0 turns it off) ...and across the water from the shores nearest our army: where a river is the
    // whole border between us and the enemy there is no frontline cell to walk across from, and the far bank of the river
    // the army stands at was never looked at.
    if(wodOpsTune(ownerId).landBridges!==0)for(const h of ownCoast.slice(0,24))for(const n of getNeighborHexes(h))walkAcross(n);
    // Also keep own-to-own river links (internal channels).
    let ownLinkCoast = ownCoast.slice();
    if(ownCoast.length > 48) ownCoast.length = 48;
    if(farCoast.length > 64) farCoast.length = 64;
    if(ownLinkCoast.length > 40) ownLinkCoast.length = 40;

    let out = [];
    let pairSeen = new Set();
    function pushPair(a, b, kind) {
        let dx = b.x - a.x,
            dy = b.y - a.y;
        let dist2 = dx * dx + dy * dy;
        if(dist2 < minDist2 || dist2 > maxDist2) return;
        let ka = getHexKey(a),
            kb = getHexKey(b);
        let pk = ka < kb ? ka + '|' + kb : kb + '|' + ka;
        if(pairSeen.has(pk)) return;
        pairSeen.add(pk);
        if(!wodAiWaterSeparatesShores(a, b)) return;
        if(wodAiBridgeAlreadyServesShores(a, b)) return;
        let dist = Math.sqrt(dist2);
        // Ask for the span this crossing needs, as a player's drag between the same two
        // shores would: the deck covers the water between the banks and is paid per cell.
        const span = wodBridgeSpanLayout(a.q, a.r, b.q, b.r);
        if(span.error) return;
        out.push({
            x: span.record.x,
            y: span.record.y,
            angle: span.record.angle,
            w: span.record.w,
            h: span.record.h,
            aq: span.record.aq, ar: span.record.ar, bq: span.record.bq, br: span.record.br,
            cells: span.count,
            cost: span.cost,
            shoreA: a,
            shoreB: b,
            span: dist,
            kind: kind || 'link'
        });
    }
    // A fight on another island: from our shore on an island with one of our towns to that island's coast across the water
    // (within five cells), so the reinforcements and the supply walk over. Anywhere along that coast (the town's own
    // island may lie well away from the fight); the nearest to the fight first, eighty at most (scored in wodAiScoreBridgeSite).
    if(wodOpsTune(ownerId).fightBridges!==0){
        const unit={type:'light',owner:ownerId},towns=new Set();
        for(const c of gameData.cities)if(c.owner===ownerId){const r=wodTransportLandingRegion(unit,c);if(r)towns.add(r);}
        const wet=h=>getNeighborHexes(h).some(n=>n&&isWaterHex(n)&&!isBridgeHex(n)),dry=h=>h&&!isWaterHex(h)&&h.type!=='mountain'&&h.type!=='urban';
        for(const fight of wodAiFightIslands(ownerId)){
            if(fight.n<2||towns.has(fight.region)&&towns.size<2)continue;
            const pairs=[];
            for(const n of gameData.hexList){if(n.owner!==ownerId||!dry(n)||fight.region.has(getHexKey(n))||!wet(n))continue;
                const r=wodTransportLandingRegion(unit,n);if(!r||!towns.has(r))continue;
                for(const pt of getHexesInRadius(n.q,n.r,5)){const f=wodHexAt(pt.q,pt.r);if(!dry(f)||!fight.region.has(getHexKey(f))||!wet(f))continue;
                    pairs.push({n,f,d:Math.hypot(f.x-fight.x,f.y-fight.y)});}}
            pairs.sort((a,b)=>a.d-b.d);
            for(const {n,f} of pairs.slice(0,80)){const before=out.length;pushPair(n,f,'reinforce');if(out.length>before)out[out.length-1].fight={x:fight.x,y:fight.y};}
        }
    }
    // Offensive / river-crossing: own shore → enemy/neutral shore.
    for(let i = 0; i < ownCoast.length; i++) {
        for(let j = 0; j < farCoast.length; j++)
            pushPair(ownCoast[i], farCoast[j], farCoast[j].owner > 0 ? 'assault' : 'expand');
    }
    // Internal own-to-own river links.
    for(let i = 0; i < ownLinkCoast.length; i++) {
        for(let j = i + 1; j < ownLinkCoast.length; j++)
            pushPair(ownLinkCoast[i], ownLinkCoast[j], 'link');
    }
    return out;
}

/** A crossing must connect landmasses or remove a substantial dry-land detour. */
// The answer depends only on terrain and bridges (never on who owns the ground), so it is remembered per pair of
// shores until either changes: the search re-ranks the same sites every few seconds on a river map.
const wodAiBridgeBenefitMemo={hexes:null,revision:'',values:new Map()};
function wodAiBridgeTravelBenefit(site,owner) {
    const a=site?.shoreA,b=site?.shoreB;if(!a||!b||a.owner!==owner)return null;
    const memo=wodAiBridgeBenefitMemo,revision=(gameData.landGeometryRevision||0)+'|'+(gameData._wodPfVer||0)+'|'+(gameData.bridges?.length||0);
    if(memo.hexes!==gameData.hexes||memo.revision!==revision){memo.hexes=gameData.hexes;memo.revision=revision;memo.values=new Map();}
    const key=getHexKey(a)+'>'+getHexKey(b);
    if(memo.values.has(key))return memo.values.get(key);
    const result=wodAiBridgeTravelBenefitSearch(a,b,owner);
    if(memo.values.size>=4096)memo.values.clear();
    memo.values.set(key,result);return result;
}
function wodAiBridgeTravelBenefitSearch(a,b,owner) {
    if(!wodAiWaterSeparatesShores(a,b))return null;
    const unit={type:'light',owner},sp=(gameData.hexRadius||20)*1.35;
    const region=wodTransportLandingRegion(unit,a);if(!region)return null;
    const span=Math.hypot(a.x-b.x,a.y-b.y)/sp;
    if(!region.has(getHexKey(b)))return {island:true,saved:Infinity};
    // Bounded Dijkstra proves whether simply walking along this coast is cheaper.
    // If no route fits the maximum useful detour, the crossing has a real purpose.
    // (A binary heap ordered by cost, then by when the entry was added: the same order in which the earlier
    // scan-and-splice list handed them out, so the same cells are visited within the same budget.)
    const limit=Math.max(span*2.6,span+8),dist=new Map([[getHexKey(a),0]]),heap=[];let seq=0;
    const before=(x,y)=>x.cost<y.cost||x.cost===y.cost&&x.seq<y.seq;
    const push=row=>{heap.push(row);let i=heap.length-1;while(i){const p=(i-1)>>1;if(!before(row,heap[p]))break;heap[i]=heap[p];i=p;}heap[i]=row;};
    const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){let i=0;for(;;){let c=i*2+1;if(c>=heap.length)break;if(c+1<heap.length&&before(heap[c+1],heap[c]))c++;if(!before(heap[c],last))break;heap[i]=heap[c];i=c;}heap[i]=last;}return top;};
    push({h:a,cost:0,seq:seq++});
    let visited=0;
    while(heap.length&&visited++<1800){
        const row=pop(),h=row.h;if(row.cost!==dist.get(getHexKey(h)))continue;
        if(h===b)return null; // The existing coast/bridge route is already convenient.
        for(const n of [...getNeighborHexes(h),...wodBridgeLinkedHexes(h)]){
            if(!region.has(getHexKey(n))||!wodCanStepBetweenHexes(unit,h,n,true))continue;
            const cost=row.cost+Math.hypot(n.x-h.x,n.y-h.y)/sp,key=getHexKey(n);
            if(cost>limit||cost>=(dist.get(key)??Infinity))continue;
            dist.set(key,cost);push({h:n,cost,seq:seq++});
        }
    }
    // A budget stop is uncertainty, never permission to waste resources.
    return heap.length?null:{island:false,saved:limit-span};
}

// (WOD_OPS.T.fightBridges=0 turns it off) The islands where this faction's land troops are fighting: in combat, or within six
// cells of enemy land troops (two or more of them make a fight worth a bridge). One row per island, the biggest fights first (three at most), with the fight's middle and
// whether a town of ours stands on that island. Remembered for four seconds of AI time.
function wodAiFightIslands(owner){
    const memo=gameData._aiFightIslands||(gameData._aiFightIslands={}),now=wodAiOperationTime(),m=memo[owner];
    if(m&&m.hexes===gameData.hexes&&now-m.at>=0&&now-m.at<4000)return m.list;
    const unit={type:'light',owner},C=(gameData.hexRadius||20)*Math.sqrt(3),known=wodAiKnownEntities(owner);
    const troops=u=>u&&u.hp>0&&!u.boardTransportUid&&(isLandArmyUnit(u)||u.type==='marine');
    const foes=known.filter(u=>troops(u)&&wodIsHostileOwner(u.owner,owner)),rows=new Map();
    for(const u of known){if(u.owner!==owner||!troops(u))continue;
        if(!u._combatEngaged&&!foes.some(f=>Math.hypot(f.x-u.x,f.y-u.y)<C*6))continue;
        const region=wodTransportLandingRegion(unit,u);if(!region)continue;
        const row=rows.get(region)||{region,x:0,y:0,n:0};row.x+=u.x;row.y+=u.y;row.n++;rows.set(region,row);}
    const list=[...rows.values()].sort((a,b)=>b.n-a.n).slice(0,3).map(r=>({region:r.region,x:r.x/r.n,y:r.y/r.n,n:r.n,
        ownTown:gameData.cities.some(c=>c.owner===owner&&r.region.has(getHexKey(getNearestHexToPoint(c.x,c.y)||{q:c.q,r:c.r})))}));
    memo[owner]={hexes:gameData.hexes,at:now,list};return list;
}
// The enemy towns this faction is going for: its navy's landing goal, its field command's objective, and otherwise the
// two known enemy towns nearest its own.
function wodAiAssaultTargets(owner){
    const hostile=c=>c&&c.owner>0&&c.owner!==owner&&wodIsHostileOwner(c.owner,owner),out=[];
    const goal=gameData.aiNavalPlans?.[owner]?.goal,aim=gameData._aiOps?.by?.[owner]?.post?.aim;
    for(const id of [goal?.id,aim]){const c=id&&gameData.cities.find(c=>c.id===id);if(hostile(c)&&!out.includes(c))out.push(c);}
    if(!out.length){const mine=gameData.cities.filter(c=>c.owner===owner);
        const near=c=>Math.min(...mine.map(m=>Math.hypot(m.x-c.x,m.y-c.y)),Infinity);
        out.push(...wodAiKnownCities(owner).filter(hostile).sort((a,b)=>near(a)-near(b)).slice(0,2));}
    return out;
}
function wodAiBridgeLeadsToTarget(near,far,owner){
    const targets=wodAiAssaultTargets(owner);if(!targets.length||!far)return false;
    const region=wodTransportLandingRegion({type:'light',owner},far),cell=(gameData.hexRadius||20)*1.35;
    for(const c of targets){
        const h=getNearestHexToPoint(c.x,c.y);if(region&&h&&region.has(getHexKey(h)))return true;
        const dFar=Math.hypot(far.x-c.x,far.y-c.y),dNear=near?Math.hypot(near.x-c.x,near.y-c.y):Infinity;
        if(dFar<cell*12&&dFar<dNear-cell*4)return true;
    }
    return false;
}
function wodAiScoreBridgeSite(site, ownerId, rankOnly=false) {
    if(!site) return -1e9;
    if(!rankOnly&&!wodAiBridgeTravelBenefit(site,ownerId))return -1e9;
    let br = { x: site.x, y: site.y, angle: site.angle, w: site.w, h: site.h };
    if(!rankOnly&&wodBridgePlacementError(br, ownerId, false, site.cost)) return -1e9;
    let hr = gameData.hexRadius || 20;
    let tilePx = hr * 1.35;
    let score = 36;
    // (a 'reinforce' site runs from an island with one of our towns to a fight on another: its far end is the fight's coast,
    // wherever the front line has put the border, and the army it serves stands over there)
    const reinforce=site.kind==='reinforce';
    let far = reinforce ? site.shoreB : site.shoreB && site.shoreB.owner !== ownerId ? site.shoreB : site.shoreA;
    let near = far === site.shoreB ? site.shoreA : site.shoreB;
    const nearby=nearestFriendlyLandArmyDistSq(reinforce?far.x:near.x,reinforce?far.y:near.y,ownerId);
    if(!reinforce&&nearby>Math.pow(tilePx*12,2))return -1e9;
    const usefulFar=wodAiKnownCities(ownerId).some(c=>Math.hypot(c.x-far.x,c.y-far.y)<tilePx*18)||
        (gameData.aiFrontFocus?.[ownerId]&&Math.hypot(gameData.aiFrontFocus[ownerId].x-far.x,gameData.aiFrontFocus[ownerId].y-far.y)<tilePx*18)||
        wodAiKnownEntities(ownerId).some(u=>u.hp>0&&u.owner===ownerId&&u.target&&Math.hypot((u.orderTarget||u.target).x-far.x,(u.orderTarget||u.target).y-far.y)<tilePx*10);
    if(!usefulFar&&!reinforce)return -1e9;
    // (WOD_OPS.T.bridgePurpose=0 turns it off) A bridge goes only where the army means to attack: the land across it holds a
    // town it is going for (wodAiAssaultTargets), or it is a stepping stone at least four cells nearer one, within twelve.
    // A nearby town of our own, or any unit's order, used to be reason enough, and bridges went up to empty islands.
    if(!reinforce&&wodOpsTune(ownerId).bridgePurpose!==0&&!wodAiBridgeLeadsToTarget(near,far,ownerId))return -1e9;
    // (the nearer the fight the better: within twelve cells of it a further 40)
    if(reinforce) score += 120 + (site.fight&&Math.hypot(far.x-site.fight.x,far.y-site.fight.y)<tilePx*12*1.28?40:0);
    else if(site.kind === 'assault') score += 88;
    else if(site.kind === 'expand') score += 48;
    else score += 28;
    if(isFrontlineHex(near, ownerId)) score += 64;
    if(far && far.owner > 0 && far.owner !== ownerId) score += 52;
    // Units waiting on the near shore make the bridge useful now.
    let armyNear = nearby;
    if(armyNear <= Math.pow(tilePx * 7, 2)) score += 70;
    else if(armyNear <= Math.pow(tilePx * 12, 2)) score += 28;
    else if(!reinforce) score -= 70;
    // Prefer sites that open a path toward the current front focus.
    let focus = gameData.aiFrontFocus && gameData.aiFrontFocus[ownerId];
    if(focus && far) {
        let before = (near.x - focus.x) * (near.x - focus.x) + (near.y - focus.y) * (near.y - focus.y);
        let after = (far.x - focus.x) * (far.x - focus.x) + (far.y - focus.y) * (far.y - focus.y);
        if(after + Math.pow(tilePx * 2, 2) < before) score += 46;
    }
    let nearestBridgeSq = Infinity;
    for(let bi = 0, bl = (gameData.bridges || []).length; bi < bl; bi++) {
        let other = gameData.bridges[bi];
        if(!other) continue;
        let dx = other.x - site.x,
            dy = other.y - site.y;
        nearestBridgeSq = Math.min(nearestBridgeSq, dx * dx + dy * dy);
    }
    // Hard anti-spam: refuse sites too close to an existing bridge.
    // (a reinforce site already passed the travel check: no walk over an existing bridge comes near it)
    if(nearestBridgeSq < Math.pow(tilePx * 14, 2)) score -= reinforce ? 40 : 260;
    else if(nearestBridgeSq < Math.pow(tilePx * 22, 2)) score -= 70;
    score -= site.span * 0.02;
    return score;
}

// Tight cap — bridges are situational, not a spam build. (In a war across water the bridges are the crossing itself: up
// to one per town, 2-4.)
function wodAiBridgeCapReached(ownerId, islandWar) {
    const aiCities = gameData.cities.filter(c => c && c.owner === ownerId).length;
    const aiBridges = (gameData.bridges || []).filter(b => b && b.owner === ownerId).length;
    return aiBridges >= (islandWar ? Math.max(2, Math.min(4, aiCities)) : Math.max(1, Math.min(3, Math.floor(aiCities * 0.35) + 1)));
}
// (WOD_OPS.T.landBridges=0 turns it off) A bridge the army has good use for, on any map and in any mode: a site that passes
// every test a bridge must (wodAiScoreBridgeSite: it saves a long walk round the water or reaches other land, it leads
// toward a town the army is going for, our troops stand near it, no other deck is in the way). Looked for every fifteen
// seconds of AI time; returns {site, cost, since} or null. On land maps such a site was there in a fifth to two fifths of
// the AI's turns, yet it built next to none: the field command spent every dollar on troops, and the economy only looked
// with four regiments' price to spare and nothing put by for anything else (3-player self-play, two maps of each shape:
// no bridge in six matches on rectangle, ring and forest maps). Now the field command keeps the price while the front is
// quiet (wodOpsWarEconomy) and the economy builds it first (wodAiEconomyStep).
function wodAiPrudentBridge(owner) {
    if(wodOpsTune(owner).landBridges===0||!wodOpsActive(owner))return null;
    const now=wodAiOperationTime(),memo=gameData._aiPrudentBridge?.hexes===gameData.hexes?gameData._aiPrudentBridge:(gameData._aiPrudentBridge={hexes:gameData.hexes});
    const m=memo[owner];if(m&&now-m.at>=0&&now-m.at<15000)return m.found;
    let found=null;
    if(!(gameData.constructionJobs||[]).some(j=>j.owner===owner&&j.mode==='bridge')&&!wodAiBridgeCapReached(owner,false)){
        const ranked=wodAiCollectBridgeCandidateSites(owner).map(site=>({site,score:wodAiScoreBridgeSite(site,owner,true)})).filter(v=>v.score>=96).sort((a,b)=>b.score-a.score).slice(0,6);
        const same=(x,y)=>!!x&&!!y&&x.aq===y.aq&&x.ar===y.ar&&x.bq===y.bq&&x.br===y.br;
        for(const {site} of ranked)if(wodAiScoreBridgeSite(site,owner,false)>=96){found={site,cost:site.cost,since:same(m?.found?.site,site)?m.found.since:now};break;}
        // A site stays the one for its minute while it can still be built: whether our troops stand near enough to it
        // changes from one look to the next as they move, and the money put by for it went back to recruits each time.
        const prev=m?.found;
        if(!found&&prev&&now-prev.since<60000&&!wodBridgePlacementError({x:prev.site.x,y:prev.site.y,angle:prev.site.angle,w:prev.site.w,h:prev.site.h},owner,true))found=prev;
    }
    memo[owner]={at:now,found};return found;
}
function wodAiTryBridgeForOwner(ownerId, ownerMoneyKey, islandWar=false, prudent=false) {
    if(!gameData.hexList || !gameData.hexList.length) return false;
    // Keep a cash cushion so bridges don't starve unit production. A bridge costs
    // $1,000 per water cell, so this gate is the cheapest span; each site is then
    // checked against its own price below.
    // (in a war across water a smaller cushion; for a bridge the army has good use for (wodAiPrudentBridge), one regiment's)
    const cushion = WOD_PRICE_LIGHT*(prudent?1:islandWar?2:4);
    if(wodPlayerTreasury(ownerId) < WOD_PRICE_BRIDGE_PER_CELL + cushion) return false;
    if((gameData.constructionJobs||[]).some(j=>j.owner===ownerId&&j.mode==='bridge'))return false;
    if(wodAiBridgeCapReached(ownerId, islandWar)) return false;
    let now = wodAiOperationTime();
    if(!gameData._aiBridgeCooldown) gameData._aiBridgeCooldown = {};
    if(gameData._aiBridgeSearches?.has(ownerId))return false;
    // First useful crossing can start immediately; later attempts are spaced.
    if(gameData._aiBridgeCooldown[ownerId]&&now-gameData._aiBridgeCooldown[ownerId]<(islandWar||prudent?30000:65000))return false;
    // Cheap gate before the site search (still rare, but more often when useful; every time in a war across water, or
    // when a site the army has good use for is known).
    if(!islandWar && !prudent && Math.random() > 0.55) return false;
    let sites = wodAiCollectBridgeCandidateSites(ownerId);
    if(!sites.length) return false;
    // Cheap strategic ranking first. Footprint checks used to run twice for
    // every candidate in one economy pulse, freezing a frame for 80ms+.
    const cash=wodPlayerTreasury(ownerId);
    const ranked=sites.filter(site=>cash>=site.cost+cushion).map(site=>({site,score:wodAiScoreBridgeSite(site,ownerId,true)})).filter(v=>v.score>=96).sort((a,b)=>b.score-a.score);
    if(!ranked.length){gameData._aiBridgeCooldown[ownerId]=now-60000;return false;}
    const searches=gameData._aiBridgeSearches||(gameData._aiBridgeSearches=new Map());
    searches.set(ownerId,{owner:ownerId,hexes:gameData.hexes,revision:gameData._wodPfVer||0,ranked,index:0,cushion});
    return false;
}

function wodStepAiBridgeSearches() {
    if(gameData._wodPfFrameActive&&gameData._wodBridgeSearchFrameDone)return false;
    gameData._wodBridgeSearchFrameDone=true;
    const searches=gameData._aiBridgeSearches;if(!searches?.size)return false;
    const owner=searches.keys().next().value,work=searches.get(owner);
    searches.delete(owner); // Rotate factions so one hard crossing cannot starve others.
    return wodAiFaction(owner,'bridges',wodAiBridgeSearchStep,owner,work,searches)===true;
}

function wodAiBridgeSearchStep(owner,work,searches) {
    const cushion=work.cushion??WOD_PRICE_LIGHT*4;
    if(work.hexes!==gameData.hexes||work.revision!==(gameData._wodPfVer||0)||wodPlayerTreasury(owner)<WOD_PRICE_BRIDGE_PER_CELL+cushion||
        (gameData.constructionJobs||[]).some(j=>j.owner===owner&&j.mode==='bridge'))return false;
    const start=performance.now(),budget=wodUsesVisualViewportLayout()?1.2:2;
    do {
        const site=work.ranked[work.index++]?.site;if(!site)break;
        // Money may have gone to recruits since the ranking; each span keeps the cushion at its own price.
        if(wodPlayerTreasury(owner)<site.cost+cushion)continue;
        if(wodAiBridgeTravelBenefit(site,owner)&&placeBridgeSpan(owner,site.aq,site.ar,site.bq,site.br,{suppressNotes:true})) {
            gameData._aiBridgeCooldown[owner]=wodAiOperationTime();
            const plan=gameData._aiEconomyPlans?.[owner];if(plan)plan.lastBuilding=gameData._aiEconomyClock||0;
            return true;
        }
    }while(work.index<work.ranked.length&&performance.now()-start<budget);
    if(work.index<work.ranked.length)searches.set(owner,work);
    else gameData._aiBridgeCooldown[owner]=wodAiOperationTime()-60000;
    return false;
}

// True when this faction's war has to cross water: troops wait for a boat, or a target for a landing lies on
// a landmass none of its towns stand on.
function wodAiIslandDemand(owner,cities,army) {
    const goals=wodAiNavalAssaultTargets(owner);if(!cities.length||!goals.length)return false;
    const components=cities.map(c=>wodTransportLandingRegion({type:'light',owner},c)).filter(Boolean);
    return army.some(u=>u._needsTransport)||goals.some(t=>{const h=getNearestHexToPoint(t.x,t.y);return h&&!components.some(keys=>keys.has(getHexKey(h)));});
}

// The economy's turn for one faction (update() walks the factions one per frame). True when it is finished.
// Establish the opening economy, then recruit continuously. Pending recruits count against capacity and future upkeep.
function wodRunAiSpawnBurstForOwner(ownerKey, aiCitiesByOwner, aiIncomeByOwner, upkeepByOwner) {
    const owner = Number(ownerKey);
    if(wodAiIsSuspended(owner)) return true;
    try { return wodAiEconomyStep(ownerKey, aiCitiesByOwner, aiIncomeByOwner, upkeepByOwner); }
    catch(e) { wodAiReportError(owner, 'economy', e); return true; }
}

function wodAiEconomyStep(ownerKey, aiCitiesByOwner, aiIncomeByOwner, upkeepByOwner) {
    let owner = Number(ownerKey);
    if(gameData.mp?.enabled && wodMpIsHumanOwner(owner)) return true;
    let cities = (aiCitiesByOwner[ownerKey] || []).filter(c => c.owner === owner);
    if(!cities.length) return true;
    let army = wodAiKnownEntities(owner).filter(u => u.owner === owner && u.hp > 0 && u.type !== 'convoy').flatMap(u=>[u,...(u.cargo?[u.cargo]:[])]);
    let pending = (gameData.constructionJobs || []).filter(j => j.owner === owner);
    let recruits = pending.filter(j => ['light','motorized','mountaineer','marine','heavy','ship','transport','supply'].includes(j.mode));
    let income = aiIncomeByOwner[ownerKey] ?? getOwnerIncome(owner);
    let upkeep = upkeepByOwner[owner] || 0;
    let committedUpkeep = recruits.reduce((n,j) => n + getUnitUpkeep({type:j.mode}), 0);
    let free = cities.filter(c => !wodCityProductionJob(c) && !isCitySiegeBlockedForProduction(c));
    let focus = gameData.aiFrontFocus?.[owner];
    if(focus) free.sort((a,b) => wodAiDist2(a.x,a.y,focus.x,focus.y)-wodAiDist2(b.x,b.y,focus.x,focus.y));
    const townPlan=gameData.aiTaskForces?.[owner];
    const guarded=c=>army.some(u=>u.type==='light'&&!u.boardTransportUid&&wodAiCanReach(u,c)&&
        (townPlan?.jobs.some(j=>j.city?.id===c.id&&townPlan.unitJob[u.uid]===j.id)||wodAiDist2(u.x,u.y,c.x,c.y)<((gameData.hexRadius||20)*5)**2));
    const missingGuards=cities.filter(c=>!guarded(c));
    free.sort((a,b)=>Number(!guarded(b))-Number(!guarded(a)));
    const needGuards=missingGuards.length>recruits.filter(j=>j.mode==='light').length;
    let count = type => army.filter(u => u.type === type).length + recruits.filter(j => j.mode === type).length;
    let cash = () => gameData.aiMoneyByOwner[ownerKey] || 0;
    let manpower = () => gameData.aiManpowerByOwner[ownerKey] || 0;
    let clock = gameData._aiEconomyClock || 0;
    let plans = gameData._aiEconomyPlans || (gameData._aiEconomyPlans = {});
    let plan = plans[owner] || (plans[owner] = {lastBuilding:-90,lastFort:-90});
    let coast = cities.filter(c=>cityHasWaterNeighbor(c)&&wodAiHarborUseful(c,owner));
    let enemyShips = wodAiKnownEntities(owner).some(u => u.type === 'ship' && u.hp > 0 && wodIsHostileOwner(u.owner,owner));
    // (whether any water is still unexplored is a whole-map scan: asked at most every ten seconds)
    const unexploredWater=()=>{if(!(plan.waterScanAt>clock-10)){plan.waterScanAt=clock;const ex=wodFogFactionIntel(owner).explored;plan.unexploredWater=gameData.hexList.some(h=>isWaterHex(h)&&!ex.has(getHexKey(h)));}return plan.unexploredWater;};
    let seaFront = coast.length > 0 && (wodFogActive()&&unexploredWater()||army.some(u=>u._needsTransport)||enemyShips || wodAiKnownCities(owner).some(c => wodIsHostileOwner(c.owner,owner) && cityHasWaterNeighbor(c)));
    const islandDemand=wodAiIslandDemand(owner,cities,army),ground=army.filter(isLandArmyUnit).length;
    plan.islandDemand=islandDemand; // (enemy towns to win across water: wodOpsFrontTowns, js/ai/field-command.js)
    const navalGroundMin=Math.max(4,cities.length*2),navalReady=islandDemand&&!needGuards&&ground>=navalGroundMin;
    seaFront||=islandDemand&&coast.length>0;
    let total = army.length + recruits.length;
    let limit = gameData.menuAttractMode ? 60 : Infinity;
    // Last stand (wodAiLastStand, js/ai/field-command.js): about to be wiped out, the treasury buys troops in every town
    // that can still raise them (armour where there is a factory and the money, else infantry), and nothing is put by
    // for buildings, forts, bridges, a hospital or ships. (The field command's own land buying stands aside meanwhile.)
    if(wodAiLastStand(owner)){
        let bought=0;const gap=wodAiDifficulty(owner).recruitGap||0;
        for(const city of free){
            if(total>=limit||gap&&clock-(plan.recruitAt??-Infinity)<gap/1000)break;
            const type=['heavy','light'].find(t=>(t!=='heavy'||city.hasFactory)&&canAffordUnit(owner,t)&&getUnitUpkeep({type:t})<=income-upkeep-committedUpkeep&&cityEligibleForBuildPlacementForOwner(city,t,owner));
            if(!type||!wodApplyBuildAtCityForOwner(city,type,owner))continue;
            committedUpkeep+=getUnitUpkeep({type});total++;bought++;plan.recruitAt=clock;
            wodAiRecord(owner,'recruit',{city:city.id,type,reason:'last-stand'});
        }
        plan.savingFor=null;plan.reservation=null;plan.shortage=null;plan.idleReason=bought?null:'last-stand';
        return true;
    }
    const strategy=wodAiBattlePlan(owner,army),mpShort=manpower()<getUnitCost('light').manpower*2;
    const landByOps=wodOpsBuysLand(owner);plan.landByOps=landByOps;
    const initialDemand=wodAiRecruitPriorities(owner,cities,army,recruits,{islandDemand});
    plan.desired=initialDemand.desired;plan.commander=initialDemand.profile.id;
    const opening=wodAiEstablishEconomy(owner,cities,army,initialDemand,plan);
    pending=(gameData.constructionJobs||[]).filter(j=>j.owner===owner);
    free=free.filter(c=>!wodCityProductionJob(c));
    wodAiProcurementReserve(owner,cities,army,recruits,initialDemand,plan,income-upkeep-committedUpkeep);
    // A war that has to cross water (troops waiting for a boat, or targets on another landmass): its harbour and
    // then the ferries, supply ships and escorts it lacks are paid for before more infantry. The field command,
    // which buys the land troops, keeps this money too (wodAiCanSpendOutsideReserve). Without it the land buyer
    // spent every dollar on infantry, no harbour was ever built and water maps never ended.
    plan.navalReservation=null;
    if(wodOpsTune(owner).navalFund!==0&&islandDemand&&coast.length&&ground>=navalGroundMin){
        if(!coast.some(c=>c.hasHarbor))plan.navalReservation={type:'harbor',money:WOD_PRICE_HARBOR+WOD_PRICE_LIGHT*2,manpower:0};
        else{
            const d=initialDemand.desired,next=['transport','supply','ship'].find(t=>(d[t]||0)>count(t));
            if(next){const c=getUnitCost(next);plan.navalReservation={type:next,money:c.money,manpower:c.manpower};}
        }
    }
    const unlockFactory=(initialDemand.needsFactory||initialDemand.expedition?.needFactory)&&!pending.some(j=>j.mode==='factory');
    const unlockHarbor=navalReady&&!coast.some(c=>c.hasHarbor);
    // On a contested island every town has the enemy nearby; a harbour is still built in a coastal town that is
    // not under siege (the crossing is how that front is won).
    const harborTowns=unlockHarbor&&wodOpsTune(owner).navalFund!==0?free.filter(c=>coast.includes(c)&&!isCitySiegeBlockedForProduction(c)):[];
    const economyRescue=income-upkeep-committedUpkeep<3||mpShort;
    const farmRescue=manpower()<getUnitCost(plan.reservation?.type||'light').manpower&&cities.some(c=>!c.hasFarm)&&cash()>=WOD_PRICE_FARM+WOD_PRICE_LIGHT*2;
    const reinforcementTowns=new Set((initialDemand.reinforcements||[]).filter(r=>canAffordUnit(owner,r.type)&&getUnitUpkeep({type:r.type})<=income-upkeep-committedUpkeep).map(r=>r.source));
    const safeInvestmentTowns=free.filter(c=>!reinforcementTowns.has(c.id)&&!wodAiThreats(owner,false).some(u=>Math.hypot(u.x-c.x,u.y-c.y)<(gameData.hexRadius||20)*10));
    // Keep a recruitment town free when investing; one-town owners invest after their current recruit arrives.
    const navalReserve=initialDemand.expedition?.preferred[0]==='ship'&&count('ship')<1;
    const harborFirst=harborTowns.length>0;
    let canInvest = (!opening.incomplete||opening.emergency&&unlockHarbor) && (!plan.hospitalRequest||farmRescue||harborFirst) && (!plan.reservation||farmRescue||unlockHarbor||unlockFactory||economyRescue&&cash()>getUnitCost(plan.reservation.type).money+WOD_PRICE_FARM+WOD_PRICE_LIGHT*2) && (safeInvestmentTowns.length>0||harborFirst) && (!navalReserve||farmRescue||harborFirst) && (!needGuards||farmRescue) && (army.length>=10||navalReady||unlockFactory||economyRescue&&army.length>=4) && clock-plan.lastBuilding >= (farmRescue?12:unlockHarbor?15:65) &&
        !pending.some(j => !['light','motorized','mountaineer','marine','heavy','ship','transport','supply'].includes(j.mode)) &&
        free.length >= (farmRescue||unlockHarbor?1:Math.min(2,cities.length)) && cash() >= (unlockHarbor?WOD_PRICE_HARBOR+WOD_PRICE_LIGHT*2:farmRescue?WOD_PRICE_FARM+WOD_PRICE_LIGHT*2:WOD_PRICE_FACTORY+WOD_PRICE_LIGHT*3);
    if(canInvest) {
        let mode = null;
        let mpIncome = cities.reduce((n,c) => n+getCityManpowerIncome(c),0);
        const develop=wodOpsTune(owner).develop!==0,farmless=safeInvestmentTowns.some(c=>!c.hasFarm);
        if(farmRescue)mode='farm';
        else if(unlockHarbor)mode='harbor';
        // (a town gives at most about 27 manpower a second, so the old "under 44 a town" test was always true
        // and a short pool asked for a farm even where every town had one)
        else if(manpower() < getUnitCost('light').manpower*2 && (develop?farmless:mpIncome < cities.length*44)) mode = 'farm';
        else if(seaFront && !coast.some(c => c.hasHarbor)) mode = 'harbor';
        else if(unlockFactory||!cities.some(c => c.hasFactory)&&strategy.profile!=='highland') mode = 'factory';
        else if(income-upkeep < 9 && cities.filter(c=>c.hasFactory).length < Math.ceil(cities.length/2)) mode = 'factory';
        // A captured town is worth as much as a starting one once it is built up: a farm first, then a
        // factory, one building at a time and only in towns out of the enemy's reach.
        else if(develop&&farmless)mode='farm';
        else if(develop&&safeInvestmentTowns.some(c=>!c.hasFactory)&&income-upkeep>=6)mode='factory';
        // (the search runs from the end of the list: safe towns are tried first, then the other coastal ones)
        const towns=mode==='harbor'&&harborFirst?[...harborTowns.filter(c=>!safeInvestmentTowns.includes(c)),...safeInvestmentTowns]:safeInvestmentTowns;
        let site = mode && towns.slice().reverse().find(c => cityEligibleForBuildPlacementForOwner(c,mode,owner)&&(mode!=='harbor'||wodAiHarborUseful(c,owner)));
        if(site && wodApplyBuildAtCityForOwner(site,mode,owner)) {
            wodAiRecord(owner,'investment',{city:site.id,type:mode,reason:unlockFactory&&mode==='factory'?'unlock-combined-arms':'economy-or-access'});
            plan.lastBuilding=clock; free=free.filter(c=>c!==site);
        }
    }
    // Below ten field units every available city trains affordable infantry first.
    let bought = 0;
    if(plan.reservation)free.sort((a,b)=>Number(wodAiCityCanTrain(b,plan.reservation.type,owner))-Number(wodAiCityCanTrain(a,plan.reservation.type,owner)));
    for(let city of free) {
        if(bought >= (wodAiDifficultyId(owner)==='easy'?1:2) || total >= limit) break;
        // (an easy computer raises one unit at a time, with a pause between them)
        if(wodAiDifficulty(owner).recruitGap&&clock-(plan.recruitAt??-Infinity)<wodAiDifficulty(owner).recruitGap/1000) break;
        const procurement=wodAiRecruitPriorities(owner,cities,army,recruits,{islandDemand});
        let types=procurement.types.filter(t=>wodAiCityCanTrain(city,t,owner)&&wodAiRecruitTownFits(city,t,procurement)&&getUnitUpkeep({type:t})<=income-upkeep-committedUpkeep);
        const localRequest=procurement.reinforcements?.find(r=>r.source===city.id&&types.includes(r.type));
        if(localRequest&&!procurement.missing.length)types=[localRequest.type,...types.filter(t=>t!==localRequest.type)];
        const reserved=plan.reservation?.type;
        if(reserved&&types.includes(reserved))types=[reserved,...types.filter(t=>t!==reserved)];
        types=types.filter(t=>wodAiCanSpendOutsideReserve(owner,t,plan));
        // In a land war the field command is the one buyer of land troops (wodOpsWarEconomy); this buyer
        // keeps the ships, ferries and marines.
        const landOnly=landByOps&&types.length>0;
        if(landByOps)types=types.filter(t=>!WOD_AI_LAND_RECRUITS.includes(t));
        // (with only land troops wanted and the field command buying them, nothing is waiting: say so, rather than
        // report upkeep, which made the lab's production-wait figures read as an upkeep limit)
        if(!types.length){plan.savingFor=reserved||(plan.hospitalRequest?'hospital':plan.savingFor);plan.idleReason=plan.savingFor?'saving-'+plan.savingFor:landOnly?'field-command-buys-land':'upkeep-unaffordable';continue;}
        let wanted=types[0];
        plan.desired=procurement.desired;plan.commander=procurement.profile.id;
        if(wanted&&!canAffordUnit(owner,wanted)){
            if(plan.savingFor!==wanted)plan.savingSince=clock;
            plan.savingFor=wanted;
            const urgent=procurement.missing.length||procurement.atRisk||strategy.intent==='defend'||army.length<10||townPlan?.jobs.some(j=>j.waitingForStrength);
            const fallback=types.find(t=>canAffordUnit(owner,t)&&cityEligibleForBuildPlacementForOwner(city,t,owner));
            if(fallback&&(!plan.reservation||wanted!==reserved)&&(urgent||clock-(plan.savingSince??clock)>=20)){
                types=[fallback,...types.filter(t=>t!==fallback)];wanted=fallback;
                wodAiRecord(owner,'recruit-fallback',{city:city.id,type:fallback,preferred:plan.savingFor,reason:urgent?'military-need':'saving-deadline'});
            }else{
                plan.idleReason='saving-'+wanted;
                const cost=getUnitCost(wanted);plan.shortage={type:wanted,money:Math.max(0,cost.money-cash()),manpower:Math.max(0,cost.manpower-manpower())};
                wodAiRecord(owner,'production-idle',{city:city.id,reason:plan.idleReason,blockedBy:plan.shortage.manpower?'manpower':'money',money:Math.floor(cash()),manpower:Math.floor(manpower())});continue;
            }
        }
        plan.shortage=null;if(!plan.reservation&&!plan.hospitalRequest)plan.savingFor=null;
        for(let type of types) {
            let newUpkeep = getUnitUpkeep({type});
            if(income-upkeep-committedUpkeep-newUpkeep < 0) {plan.idleReason='upkeep-unaffordable';continue;}
            if(!cityEligibleForBuildPlacementForOwner(city,type,owner)) continue;
            if(wodApplyBuildAtCityForOwner(city,type,owner)) {
                const request=procurement.reinforcements?.find(r=>r.type===type&&r.source===city.id);
                if(request){const queued=gameData.constructionJobs.at(-1);queued._aiReinforceFor=request.id;queued._aiReinforceGroup=request.group;queued._aiReinforceSquad=request.squad;queued._aiReinforceFront=request.front||request.goal.owner;wodAiRecord(owner,'reinforcement-funded',{job:request.id,city:city.id,type});}
                plan.idleReason=null;plan.savingSince=null;
                wodAiRecord(owner,'recruit',{city:city.id,type,reason:procurement.missing.length?'town-guard':'army-demand'});
                if(plan.reservation?.type===type){wodAiRecord(owner,'procurement-filled',{type,wait:Math.round(clock-plan.reservation.since)});plan.reservation=null;plan.savingFor=null;}
                total++; bought++; committedUpkeep+=newUpkeep;plan.recruitAt=clock;recruits.push(gameData.constructionJobs[gameData.constructionJobs.length-1]);break;
            }
        }
    }
    if(!bought){
        plan.idleReason=free.length?(plan.idleReason||(!initialDemand.types.length?'army-target-met':total>=limit?'upkeep-cap':'resources-or-upkeep')):'towns-busy-or-besieged';
        wodAiRecord(owner,'production-idle',{reason:plan.idleReason,army:total,limit});
    }
    // Fortify a threatened corridor only after funding the army; never stack auras.
    // (a search that found no site waits 20 s before the next whole-map search)
    // (a fortifying commander, the defensive one, builds forts twice as often)
    const fortEvery=90/(wodOpsTune(owner).fortBias??(wodAiCommander(owner).forts||1));
    if(!plan.savingFor && !needGuards && army.length >= 10 && clock-plan.lastFort >= fortEvery && clock-plan.lastBuilding >= 30 &&
        !(plan.fortMissAt>clock-20) &&
        cash() >= WOD_PRICE_FORT+WOD_PRICE_LIGHT*4 && manpower() >= getUnitCost('light').manpower && income-upkeep > 4){
        if(wodAiTryFortForOwner(owner,ownerKey)) { plan.lastFort=clock; plan.lastBuilding=clock; }
        else plan.fortMissAt=clock;
    }
    // (WOD_OPS.T.islandBridges=0 turns it off) With towns to win across water, a bridge to the next island is part of the
    // crossing: it is looked for even while money is put by for ships or marines (on water maps the economy was always
    // saving for something, and in 25-minute archipelago games no bridge was ever built though dozens of sites qualified).
    // (and so does a fight on an island where none of our towns stand, unless fightBridges=0: see wodAiFightIslands)
    const fightAcross=wodOpsTune(owner).fightBridges!==0&&wodAiFightIslands(owner).some(f=>!f.ownTown&&f.n>=2);
    const bridgeWar=(islandDemand||fightAcross)&&wodOpsTune(owner).islandBridges!==0;
    // (a bridge the army has good use for, wodAiPrudentBridge, comes before what the economy is saving for, with eight
    // units in the field rather than ten; and a town without a man in its streets does not hold it back while the field
    // command posts the guards, which it does only where a town could be walked into, or while there is no manpower to
    // raise one: a guard missing on those terms blocked every such bridge)
    const prudent=!bridgeWar?wodAiPrudentBridge(owner):null;
    const guardsWait=needGuards&&!(prudent&&(landByOps||manpower()<getUnitCost('light').manpower));
    if((!plan.savingFor||bridgeWar||prudent) && !guardsWait && (army.length>=10||navalReady||bridgeWar||prudent&&army.length>=8) && clock-plan.lastBuilding>=(bridgeWar||prudent?25:navalReady?40:65) &&
        cash()>=(prudent?prudent.cost+WOD_PRICE_LIGHT:WOD_PRICE_BRIDGE_PER_CELL+WOD_PRICE_LIGHT*4) && income-upkeep>4 &&
        wodAiTryBridgeForOwner(owner,ownerKey,bridgeWar,!!prudent))plan.lastBuilding=clock;
    return true;
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
    // The field command may raise a regiment in each town before the buildings go up.
    wodOpsOpening(owner,cities);
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
        // land troops are the field command's to buy in a land war, so nothing is put by for them here
        if(plan.landByOps&&WOD_AI_LAND_RECRUITS.includes(t))return false;
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
    if(reservation&&!missionPriority&&!navalPriority&&!canAffordUnit(owner,reservation.type)){
        const protectedCost=getUnitCost(reservation.type),net=Math.max(1,getOwnerIncome(owner)-getOwnerExpenses(owner));
        const eta=Math.max(0,protectedCost.money-wodPlayerTreasury(owner))/net;
        const replacement=eta>30&&(demand.reinforcements||[]).find(r=>r.priority>=40&&r.n>0&&r.type!==reservation.type&&
            !wodIsNavalType(r.type)&&r.type!=='marine'&&usable(r.type)&&canAffordUnit(owner,r.type)&&
            getUnitCost(r.type).money<=protectedCost.money*.6&&cities.some(c=>c.id===r.source&&wodAiProductionAvailable(c,r.type,owner)));
        if(replacement){
            wodAiRecord(owner,'procurement-retarget',{from:reservation.type,type:replacement.type,job:replacement.id,reason:'complete-understrength-squad'});
            reservation={type:replacement.type,since:now};
        }
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

// (seaSavings false: the money put by for the crossing, navalReservation, and for a ship, ferry or marine the economy is
// saving for, does not hold this purchase back; the field command's troops in a land war, wodOpsWarEconomy)
function wodAiCanSpendOutsideReserve(owner,type,plan,seaSavings=true) {
    const cost=getUnitCost(type);
    // the money and manpower put by for the harbour and ferries of a war across water (see navalReservation)
    // (while it is the harbour being saved for, nothing else spends that money, marines included; afterwards ships
    // and marines may be bought from it)
    const naval=seaSavings?plan.navalReservation:null;
    if(naval&&type!==naval.type&&(naval.type==='harbor'||!wodIsNavalType(type)&&type!=='marine')&&
        (wodPlayerTreasury(owner)-cost.money<naval.money||naval.manpower&&wodPlayerMpPool(owner)-cost.manpower<naval.manpower))return false;
    if(plan.economyReservation&&wodPlayerTreasury(owner)-cost.money<plan.economyReservation.money)return false;
    if(plan.hospitalRequest&&!plan.reservation&&wodPlayerTreasury(owner)-cost.money<WOD_PRICE_HOSPITAL+WOD_PRICE_LIGHT)return false;
    const reserve=plan.reservation;if(!reserve||reserve.type===type||!seaSavings&&(wodIsNavalType(reserve.type)||reserve.type==='marine'))return true;
    const protectedCost=getUnitCost(reserve.type);
    return wodPlayerTreasury(owner)-cost.money>=protectedCost.money&&wodPlayerMpPool(owner)-cost.manpower>=protectedCost.manpower;
}

// Replacements and new formations share the same real manpower pool. Saving
// must survive passive hospital recovery, while some treatment always continues.
function wodAiReplacementAllowance(unit,wanted,dt) {
    if(!(wanted>0)||wodMpIsHumanOwner(unit.owner))return wanted;
    // While the field command fights a land war the wounded are refilled before anyone is recruited.
    {const allowed=wodOpsHealAllowance(unit,wanted);if(allowed!=null)return allowed;}
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
