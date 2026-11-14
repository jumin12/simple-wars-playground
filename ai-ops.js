'use strict';
// Field command for AI land armies.
//
// One commander per AI faction decides, every strategy pulse, what each land unit is for. It replaces the
// stack of cautious planners in ai-command.js for everything that walks; those planners keep the opening
// build order, the navy, ferries, the wounded and troops that are cut off.
//
// What the commander knows about this game:
//   - A firefight is slow and a hurt unit can walk away and be refilled, so battles decide little by
//     themselves. What they cost is manpower: every point of damage has to be bought back, and a regiment
//     that is killed costs twice what healing it would have.
//   - A town falls when no defender is left standing in its streets, and a town is half an economy.
//   - Troops in a town take half damage, but a town with an enemy inside gun range neither heals nor recruits.
//   - The side fighting nearer its own towns and hospitals gets its wounded back first.
//   - A unit whose land link to a friendly town is cut dies in under a minute. Troops at the front on ground
//     they have not taken yet stay supplied while supplied ground of their own lies within two cells.
//   - Fire wears morale down, and troops with no morale left shoot at a fifth of their strength, then run.
//   - Armour and motor troops outrange infantry.
//   - Land is income, and it is the road everything else travels on.
//
// So, every pulse:
//   1. A town keeps a man in its streets only while somebody could walk into them before help would arrive
//      (always under fog, or against an enemy with marines or landing craft). Enemies at its walls bring
//      defenders in proportion, from wherever they are. Everyone else belongs to the field army.
//   2. Everything the enemy shows becomes a job with a price in fighting strength:
//        strike  an enemy group in the field or in our land, cheaper to accept near our own towns;
//        take    a town, stormed with everything. The garrison and what stands beside it are counted in
//                full; what would have to march there counts for a share that is learnt during the match:
//                an enemy who lets a town fall is rushed again, one who beats an assault off is respected;
//        raid    a town held by little more than its guard, when a small party can be there well before
//                any relief: it goes round the enemy, and if it cannot beat the garrison it blockades;
//        cut     any enemy group in the open whose ground narrows behind it, in our land, his or nobody's:
//                up to four cutters walk the narrowest ring between it and its towns, each his own stretch,
//                and hold it once it is closed. At even odds a closed ring is worth more than a won fight.
//        finish  a town that is there for the taking: a town with nobody in its streets is walked, street by
//                street, by the nearest troops at once; a town held by a few men where we already hold streets
//                or stand at its edge gets a party sized to beat exactly those men, which stays until the
//                town has changed hands; and such a town is cheaper for the main effort to accept.
//        landing  troops the navy has put ashore (marines included) are a landing party: they go for the nearest
//                enemy town they can walk to, go in at anything short of hopeless odds, keep their wounded in
//                the line, walk every street, and then take the land round the town.
//   3. The best battle that can be paid for is the main effort and takes everyone in reach; while there is
//      one, a raid gets only a small share of the army. A commander who has waited accepts thinner odds.
//   4. Troops on a job gather where the army already waits, march as one body (nobody walks on alone into
//      an enemy position the column has not reached, and when part of the force meets the enemy the rest
//      goes to that fight), form up short of the objective and fight from the limit of their range on ground
//      that is theirs, claimable or within two cells of their own, in the best cover there. A force that
//      clearly outweighs its enemy sends wings round both sides to his rear: they shoot what the frontal
//      fight drives back, stand between his wounded and their hospital, and the ground they walk over closes
//      behind him. Tired troops rotate: a unit whose morale has worn down steps back out of reach, recovers
//      and comes forward again. While a fight is being won and help is close the wounded stay in the line; a
//      fight that is being lost is broken off, sooner under the enemy's towns than at home.
//   5. With no battle it can pay for the army does not go home and does not stand still. A core closes up to
//      the enemy, just out of his reach, at a post chosen for its cover, with a field hospital behind it; from
//      there armour shoots at whatever it outranges (he must come out or bleed), and an army without armour
//      sends one sound unit forward as bait and falls on whatever follows it back. Most of the rest takes
//      ground, two together: the road between home and the front first, then the enemy's undefended land.
//   6. Troops whose road home is cut turn round at once, before the twelve seconds of grace run out, and walk
//      back toward the nearest supplied ground. Two or more cut off together take their whole force with them.
//
//   7. With no battle running, the best town on the list is accepted a little under its price, and the share
//      of the army sent to take ground is half, not most: troops belong at the front. A unit that ends up
//      where the enemy near it clearly outweighs the friends near it steps back to the body.
//   8. A fort goes up where the army waits in front of the enemy and on the threatened side of a town with an
//      enemy army before it (troops in its ring take a fifth less damage, attackers move slowly through it),
//      and a hospital behind any battle fought far from another place to heal.
//   9. Forts and hospitals near the front are defended (section 1a). The enemy destroys one by taking its
//      tile, which he cannot do while somebody stands on it or beside it. A work he could reach before our
//      nearest man gets a man on it in good time; once he is at it, the nearest troops in proportion to
//      what has come stand on it and beside it, and the strike on that enemy group counts them in and goes
//      in without forming up first. They give it up only at three to one against everything of ours there.
//
// Each commander draws a doctrine at the start of a match (how big an edge it wants, how much it raids and
// hunts, how patient it is, which flank it likes), so two matches do not play alike. All but the methodical
// one raise a regiment in every town before the opening buildings and turn idle manpower into regiments
// while those buildings go up.
//
// Safety: commanded units carry a six-second lease (_opsUntil) renewed every pulse. If this code throws, the
// lease lapses and the original planners take every unit back. WOD_OPS.enabled=false switches it off.
// While the lease covers every land unit those planners would plan for and the faction has nothing at sea,
// they are not run at all (wodOpsCommandsAll): their orders would only be thrown away.
// WOD_OPS.T holds switches used by the test rig (headless/README.md) to play variants against each other.
// Three ideas are kept behind switches because they lost when measured over 24-match sets: coverStand (waiting
// troops spread over the best cover cells and only return fire), pullback (a beaten force goes all the way
// back to its own ground) and wide (a wider marching column).
const WOD_OPS={enabled:true,owners:null,error:null,T:{}};
const WOD_OPS_DOCTRINES=[
    {name:'blitz',ratio:1.02,sweep:.4,raid:1.3,hunt:.9,patience:50},
    {name:'methodical',ratio:1.16,sweep:.4,raid:.9,hunt:1.15,patience:110},
    {name:'raider',ratio:1.08,sweep:.55,raid:1.8,hunt:.9,patience:80},
    {name:'hunter',ratio:1.08,sweep:.3,raid:1,hunt:1.6,patience:90}
];
// Authored missions use the field command like every other battle; reinforcements a mission script sends
// marching somewhere finish that march first. WOD_OPS.missions=false gives missions back to the original planners.
function wodOpsActive(owner){return WOD_OPS.enabled&&(!WOD_OPS.owners||WOD_OPS.owners.has(owner))&&!wodMpIsHumanOwner(owner)&&!wodCampaignDeployActive()&&(!gameData.mission||WOD_OPS.missions!==false);}
// Worn-down morale cuts a unit's fire to a fraction, so a tired army is weaker than its health shows.
function wodOpsDps(u){return (u.damage||0)/(u.attackCooldown||2)*(WOD_OPS.T.noMorale?1:.18+.82*Math.min(1,(u.morale??100)/100));}
// Fighting strength in "fresh infantry regiments": a square-law estimate, so numbers and health both count.
// With cover, health is weighed by the ground each unit stands on.
function wodOpsStrength(list,cover){
    let hp=0,dps=0;
    for(const u of list){
        const w=u._intelConfidence??1;let h=Math.max(0,u.hp)*w;
        if(cover){const hex=getNearestHexToPoint(u.x,u.y);if(hex)h/=Math.max(.4,getTerrainDefenseModifier(u,hex));}
        hp+=h;dps+=wodOpsDps(u)*w;
    }
    return Math.sqrt(hp*dps)/20;
}
function wodOpsLandHex(x,y){const h=getNearestHexToPoint(x,y);return h&&(!isWaterHex(h)||isBridgeHex(h))?h:null;}
function wodOpsCentroid(list){let x=0,y=0;for(const u of list){x+=u.x;y+=u.y;}const n=Math.max(1,list.length);return {x:x/n,y:y/n};}
function wodOpsSlot(i,r){if(!i)return {x:0,y:0};const a=i*2.39996,d=r*Math.sqrt(i);return {x:Math.cos(a)*d,y:Math.sin(a)*d};}
function wodOpsMove(u,x,y,hold){
    const hr=gameData.hexRadius||20;
    u._opsRoute=null;
    if(u._wodAttackOrder){u._wodAttackOrder=null;u._wodAttackApproaching=false;u.target=null;u.path=null;u.orderTarget=null;}
    if(u.retreating&&!u.moraleBroken){u.retreating=false;u._wodOrderedRetreat=false;}
    const g=u.orderTarget||(u.target&&!u.target.isCity?(u.target.finalTarget||u.target):null);
    if(g&&Math.hypot(g.x-x,g.y-y)<hr*1.15){u.holding=!!hold;return;}
    if(!g&&Math.hypot(u.x-x,u.y-y)<hr*.9){u.holding=!!hold;return;}
    u._aiMoveIntent=null;
    gameData._opsIssuing=true;
    try{wodAiMoveUnitToward(u,x,y,!!hold);}finally{gameData._opsIssuing=false;}
}
function wodOpsHalt(u){
    const hr=gameData.hexRadius||20;
    if(u._wodAttackOrder){u._wodAttackOrder=null;u._wodAttackApproaching=false;u.target=null;u.path=null;u.orderTarget=null;}
    if(u.retreating&&!u.moraleBroken){u.retreating=false;u._wodOrderedRetreat=false;}
    const g=u.orderTarget||u.target;
    if(g&&Math.hypot(g.x-u.x,g.y-u.y)>hr*1.5)wodOpsMove(u,u.x,u.y,true);else u.holding=true;
}
// March through a list of points in order (a supply cut, a flanking route). Re-issued only when the id changes.
function wodOpsRoute(u,points,id){
    if(u._opsRoute===id&&(u.target||u.orderTarget))return;
    u._aiMoveIntent=null;u.retreating=false;u.holding=false;u._wodAttackOrder=null;gameData._aiMoveQueue?.delete(u);
    assignUnitMoveAlongWaypoints(u,points.map(h=>({x:h.x,y:h.y})));
    u._opsRoute=id;
}
// Where can this enemy group's supply be severed? Flood its friendly ground outward from the group; every
// ring of the flood separates the group from whatever lies beyond, so the narrowest ring short of the first
// enemy town is the place to cut.
function wodOpsCutPlan(group,sources,foes,hr,maxRing=7){
    const fo=group[0].owner,dist=new Map(),q=[];
    const seed=c=>{if(c&&!dist.has(c)&&wodSupplyPassable(c,fo)){dist.set(c,0);q.push(c);}};
    for(const e of group){const h=getNearestHexToPoint(e.x,e.y);if(!h)continue;seed(h);for(const n of getNeighborHexes(h))seed(n);}
    if(!q.length)return {state:'pocket',cells:[]};
    let town=Infinity,capped=false;const rings=[];
    for(let i=0;i<q.length;i++){
        const h=q[i],d=dist.get(h);
        if(sources.has(getHexKey(h))&&d<town)town=d;
        (rings[d]||(rings[d]=[])).push(h);
        if(d>=12||q.length>800){capped=true;continue;}
        wodSupplyNeighbors(h,n=>{if(n&&!dist.has(n)&&wodSupplyPassable(n,fo)){dist.set(n,d+1);q.push(n);}});
    }
    if(town===Infinity&&!capped)return {state:'pocket',cells:q};
    const last=Math.min(town===Infinity?11:town-1,11),span=hr*1.35*1.6;let best=null;
    for(let d=2;d<=last;d++){
        const ring=rings[d];if(!ring||!ring.length||ring.length>maxRing)continue;
        if(ring.some(h=>foes.some(e=>Math.abs(e.x-h.x)<span&&Math.abs(e.y-h.y)<span)))continue; // cells beside a defender cannot be claimed
        const score=ring.length+(d-2)*.8;if(!best||score<best.score)best={score,cells:ring,d};
    }
    return best?{state:'cut',cells:best.cells,d:best.d}:{state:'open',cells:[]};
}
function wodOpsNewState(owner,now){
    const base=WOD_OPS_DOCTRINES[Math.floor(Math.random()*WOD_OPS_DOCTRINES.length)],j=()=>.9+Math.random()*.2;
    const doctrine={name:base.name,ratio:base.ratio*(.96+Math.random()*.08),sweep:base.sweep*j(),raid:base.raid*j(),hunt:base.hunt*j(),
        patience:base.patience*j(),side:Math.random()<.5?1:-1,seed:Math.floor(Math.random()*1e9)};
    wodAiRecord(owner,'ops-doctrine',{doctrine:doctrine.name});
    return {doctrine,reliefK:{blitz:.5,raider:.6,hunter:.7,methodical:.85}[base.name]||.7,born:now,lastPush:now,ts:{},strikes:[],garrison:{},sweep:{},failed:{},cuts:[],counts:{launch:0,raid:0,recall:0,cut:0,pocket:0,taken:0,flank:0,bait:0,ambush:0}};
}
// War economy. Manpower, not money, limits an army here: every point of damage costs manpower to heal, and a
// new regiment costs twice the manpower of refilling a broken one. The original buyer does the opposite of
// what that calls for: it rations healing to protect manpower it is saving for purchases, and stops recruiting
// for minutes while it saves $8,000 for armour. Under field command:
//   - the wounded are refilled first, without rationing (wodOpsHealAllowance);
//   - spare manpower becomes infantry at once (the most strength for the money);
//   - only when money piles up unspent, because manpower has run short, is it turned into armour, the one
//     unit that gives more than twice the strength for the same manpower and heals three times cheaper.
function wodOpsHealAllowance(unit,wanted){
    if(!wodOpsActive(unit.owner))return null;
    const S=gameData._aiOps?.hexes===gameData.hexes?gameData._aiOps.by[unit.owner]:null;
    const now=wodAiOperationTime();
    // only while this faction has a land war on: at sea the original buyer must be able to save manpower for ships
    if(!S||S.disabledUntil>now||!(now-S.landWarAt<8000))return null;
    return S.saveMp?wanted*.35:wanted; // while manpower is being put aside for armour the wounded heal slowly
}
function wodOpsWarEconomy(owner,S,units,myTowns,now){
    if(now<(S.buyAt||0))return;
    S.buyAt=now+2500;S.saveMp=false;
    const plan=gameData._aiEconomyPlans?.[owner],opening=plan?.openingEconomy;
    const built=!!opening?.cities&&(opening.cities.every(c=>c.factory==='ready'&&c.farm==='ready')||!myTowns.some(c=>(opening.towns||[]).includes(c.id)));
    S.econReady=built||now>=300000;

    const isUnit=m=>['light','motorized','mountaineer','marine','heavy','ship','transport','supply'].includes(m);
    const pending=(gameData.constructionJobs||[]).filter(j=>j.owner===owner);
    const spare=()=>getOwnerIncome(owner)-getOwnerExpenses(owner)-pending.reduce((n,j)=>n+(isUnit(j.mode)?getUnitUpkeep({type:j.mode}):0),0);
    const cash=()=>gameData.aiMoneyByOwner[owner]||0,mp=()=>gameData.aiManpowerByOwner[owner]||0;
    const free=myTowns.filter(c=>!wodCityProductionJob(c)&&!isCitySiegeBlockedForProduction(c)&&!isCityEncircledForProduction(c));
    let wounded=0;for(const u of units)if(u.hp>0&&u.hp<u.maxHp*.9&&!wodIsNavalUnit(u))wounded+=(1-u.hp/u.maxHp)*(u.maxManpower||1000);
    const heavy=getUnitCost('heavy'),light=getUnitCost('light');
    if(!S.econReady){
        // The opening buildings take minutes and the towns stand idle between them while manpower piles up.
        // All but the methodical commander turn that surplus into regiments at once.
        if(!WOD_OPS.T.noEarly&&S.doctrine.name!=='methodical'&&mp()>=light.manpower*2.5&&cash()>=light.money&&spare()>=getUnitUpkeep({type:'light'})+1.5){
            const c=free.find(c=>cityEligibleForBuildPlacementForOwner(c,'light',owner));
            if(c&&wodApplyBuildAtCityForOwner(c,'light',owner))wodAiRecord(owner,'recruit',{city:c.id,type:'light',reason:'idle-manpower'});
        }
        return;
    }
    // armour: only with money that would otherwise lie idle
    const works=myTowns.filter(c=>c.hasFactory&&!isCitySiegeBlockedForProduction(c)&&!isCityEncircledForProduction(c));
    if(works.length&&cash()>=heavy.money&&spare()>=getUnitUpkeep({type:'heavy'})+3){
        if(mp()<heavy.manpower){S.saveMp=true;return;}
        const site=works.find(c=>!wodCityProductionJob(c)&&cityEligibleForBuildPlacementForOwner(c,'heavy',owner));
        if(site&&wodApplyBuildAtCityForOwner(site,'heavy',owner)){wodAiRecord(owner,'recruit',{city:site.id,type:'heavy',reason:'war-economy'});return;}
        if(!site)return; // factory busy: keep the money for it
    }
    // Manpower is what is short, so money piles up: put it by for armour (about one in four) rather than
    // leave it idle. The same manpower gives far more strength as a tank, and its gun outranges infantry.
    const army=units.filter(u=>u.hp>0&&isLandArmyUnit(u)),armour=army.filter(u=>u.type==='heavy'&&!u.isGeneral).length+pending.filter(j=>j.mode==='heavy').length;
    if(!WOD_OPS.T.noArmour&&S.calm&&works.length&&cash()>=heavy.money*.5&&armour<Math.max(1,Math.floor(army.length/4))&&spare()>=getUnitUpkeep({type:'heavy'})+3){
        if(mp()<heavy.manpower)S.saveMp=true;
        return;
    }
    const floorCash=S.wantHospital?WOD_PRICE_HOSPITAL:0; // money being put aside for a field hospital is not spent on recruits
    for(const c of free){
        if(spare()<getUnitUpkeep({type:'light'})+1.5||cash()-light.money<floorCash)break;
        // the wounded already draw on the pool every moment they stand in a town or hospital; a small float is enough
        if(cash()<light.money||mp()<light.manpower+Math.min(600,wounded))break;
        if(!cityEligibleForBuildPlacementForOwner(c,'light',owner))continue;
        if(wodApplyBuildAtCityForOwner(c,'light',owner)){pending.push({mode:'light'});wodAiRecord(owner,'recruit',{city:c.id,type:'light',reason:'war-economy'});}
    }
}

function wodOpsState(owner,now){
    const root=gameData._aiOps&&gameData._aiOps.hexes===gameData.hexes?gameData._aiOps:(gameData._aiOps={hexes:gameData.hexes,by:{}});
    return root.by[owner]||(root.by[owner]=wodOpsNewState(owner,now));
}
// The opening. A regiment from every town before the first brick is laid: the starting manpower would
// otherwise lie idle while the factories go up, and two more regiments in the first minutes are what an
// early attack is made of. The methodical commander builds first. Called by the original opening planner.
function wodOpsOpening(owner,cities){
    if(!wodOpsActive(owner)||WOD_OPS.T.noRush)return false;
    const now=wodAiOperationTime(),S=wodOpsState(owner,now);
    if(S.opened||S.doctrine.name==='methodical')return false;
    S.opened=true;
    if(now-S.born>20000)return false;
    const cost=getUnitCost('light');
    for(const c of cities){
        if(wodCityProductionJob(c)||isCitySiegeBlockedForProduction(c))continue;
        if((gameData.aiManpowerByOwner[owner]||0)<cost.manpower||(gameData.aiMoneyByOwner[owner]||0)<cost.money+WOD_PRICE_FACTORY)break;
        if(cityEligibleForBuildPlacementForOwner(c,'light',owner)&&wodApplyBuildAtCityForOwner(c,'light',owner))wodAiRecord(owner,'recruit',{city:c.id,type:'light',reason:'opening'});
    }
    return false;
}
// True when the original land planners would only produce orders that the leases throw away: every land
// unit they would plan for is under field command and the faction has nothing at sea. Skipping them then
// saves about a quarter of the simulation's time in a land war.
function wodOpsCommandsAll(owner,units){
    if(WOD_OPS.T.noSkip||!wodOpsActive(owner))return false;
    const S=gameData._aiOps?.hexes===gameData.hexes?gameData._aiOps.by[owner]:null,now=wodAiOperationTime();
    if(!S||S.disabledUntil>now||!(now-S.landWarAt<4000))return false;
    for(const u of units){
        if(!(u.hp>0)||u.type==='convoy')continue;
        if(wodIsNavalUnit(u)||u.boardTransportUid||u.cargo||u._needsTransport||u._navalLanded||u._navalEvacuating||u._medicalEvacuating)return false;
        if(u.moraleBroken||u.retreating||u._medicalRecovering||u.hp<=u.maxHp*.42)continue; // not planned for by them either
        if(!(u._opsUntil>now))return false;
    }
    return true;
}
function wodOpsCommand(owner,units){
    if(!wodOpsActive(owner))return;
    try{wodOpsRun(owner,units);}
    catch(e){
        if(!WOD_OPS.error){WOD_OPS.error=String(e&&e.stack||e);try{console.warn('AI field command paused for 30s:',e);}catch(_){}}
        const S=gameData._aiOps?.by?.[owner];if(S)S.disabledUntil=wodAiOperationTime()+30000;
        for(const u of units)u._opsUntil=0;
    }finally{gameData._opsIssuing=false;}
}
function wodOpsRun(owner,units){
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,C=hr*1.35;
    const S=wodOpsState(owner,now);
    if(S.disabledUntil>now)return;
    const D=S.doctrine,TU=WOD_OPS.T||{};
    const myTowns=gameData.cities.filter(c=>c.owner===owner);
    if(!myTowns.length){S.saveMp=false;return;}
    const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
    const near=(list,p,r)=>list.filter(u=>Math.abs(u.x-p.x)<r&&Math.abs(u.y-p.y)<r&&Math.hypot(u.x-p.x,u.y-p.y)<r);
    const anyNear=(list,p,r)=>list.some(u=>Math.abs(u.x-p.x)<r&&Math.abs(u.y-p.y)<r&&Math.hypot(u.x-p.x,u.y-p.y)<r);
    const friendlyCell=h=>!!h&&wodIsFriendlyOwner(h.owner,owner);
    const homeTown=p=>{let b=myTowns[0],bd=Infinity;for(const c of myTowns){const d=dist(c,p);if(d<bd){bd=d;b=c;}}return b;};
    const dHome=p=>dist(homeTown(p),p);
    const r1=x=>Math.round(x*10)/10;

    // ---------- who is under command this pulse
    const elig=[],landing=[];
    for(const u of units){
        // (marines are not "land army" to the engine: ashore after a landing they are)
        if(!(u.hp>0)||!isLandArmyUnit(u)&&!(u.type==='marine'&&u._navalLanded)||u.boardTransportUid||u._medicalRecovering||u._medicalEvacuating||u.moraleBroken||u._navalEvacuating){u._opsUntil=0;continue;}
        if(u._navalLanded||u._navalAssaultUntil>now){
            // Put ashore by the navy. Once it stands on dry land it is a landing party (1d); marines draw supply
            // from the water, other troops only count while they are supplied.
            const h=getNearestHexToPoint(u.x,u.y);
            if(!TU.noLanding&&u._navalLanded&&h&&!isWaterHex(h)&&(u.type==='marine'||!((u.outOfSupplySeconds||0)>0)))landing.push(u);else u._opsUntil=0;
            continue;
        }
        // cut off: the supply-escape logic of the original planners acts at once
        // cut off: without the breakout below, the supply-escape logic of the original planners acts
        if(TU.noBreakout&&((u.outOfSupplySeconds||0)>2||(u.supplyPendingSeconds||0)>1.2)){u._opsUntil=0;continue;}
        if(!wodOpsLandHex(u.x,u.y))continue;
        // reinforcements a mission script has sent marching somewhere finish that march first
        if(u._missionMarch){const m=u._missionMarch;if(now<m.until&&Math.hypot(m.x-u.x,m.y-u.y)>C*4&&!u._combatEngaged&&(u.target||u.orderTarget)){u._opsUntil=0;continue;}u._missionMarch=null;}
        elig.push(u);
    }
    const reachCache=new Map();
    const reachOf=u=>{let r=reachCache.get(u);if(!r){r=wodAiOperationReach(u);reachCache.set(u,r);}return r;};
    // The field command fights land wars. Troops with no enemy ground they can walk to (an island of our own,
    // a sea between the armies) stay with the original planners, who know ferries, landings and coast defence.
    const foreign=S.foreign||(S.foreign=new Map());
    const landWar=u=>{
        const r=reachOf(u);let f=foreign.get(r);
        if(!f||now-f.at>12000){
            let v=false;for(const k of r){const h=gameData.hexes[k];if(h&&h.owner>0&&!isWaterHex(h)&&wodIsHostileOwner(h.owner,owner)){v=true;break;}}
            f={at:now,v};foreign.set(r,f);if(foreign.size>12)foreign.delete(foreign.keys().next().value);
        }
        return f.v;
    };
    for(let i=elig.length-1;i>=0;i--)if(!landWar(elig[i])){elig[i]._opsUntil=0;elig.splice(i,1);}
    // The general fights with the main body, but is never a guard, a raider or a scout.
    const general=elig.find(u=>u.isGeneral),fighters=elig.filter(u=>!u.isGeneral);
    if(!fighters.length&&!landing.length){S.saveMp=false;return;}
    S.landWarAt=now;
    const canReach=(u,p)=>{const h=p.q!=null&&p.r!=null&&!p.uid?p:wodOpsLandHex(p.x,p.y);return !!h&&reachOf(u).has(h.q+','+h.r);};
    const seen=wodAiKnownEntities(owner).filter(u=>u.hp>0&&wodIsHostileOwner(u.owner,owner)&&u.type!=='convoy'&&!u.boardTransportUid);
    const foes=seen.filter(u=>!wodIsNavalUnit(u)&&wodOpsLandHex(u.x,u.y));
    const ghosts=wodFogActive()?wodAiThreats(owner,true).filter(u=>u._intelMemory&&!wodIsNavalUnit(u)):[];
    const enemyTowns=wodAiKnownCities(owner).filter(c=>c.owner!==owner&&c.owner>0&&wodIsHostileOwner(c.owner,owner));
    const claim=(u,role)=>{u._opsUntil=now+6000;u._opsRole=role;u._opsSweep=false;if(u._needsTransport)u._needsTransport=false;if(u._opsFast){u._opsFast=false;if(!u._wodAttackOrder)u._wodAttackApproaching=false;}};
    // Disengaging troops keep three quarters of their pace under fire, as a player's ordered retreat does. (The
    // engine's own retreat state is not used for it: the medical planner would take the unit over.)
    const hurry=u=>{if(u._combatEngaged&&!u._wodAttackOrder){u._wodAttackApproaching=true;u._opsFast=true;}};
    const pool=new Set(fighters);
    const byUid=new Map(elig.map(u=>[u.uid,u]));
    const taken=[]; // firing positions handed out this pulse
    // Ground a unit can stand on and stay supplied: a cell that is ours, or one it will make ours by standing
    // there. A cell with an enemy on it or beside it cannot be claimed, and a unit on a cell that is not ours
    // counts as cut off: after twelve seconds it starves faster than two regiments could shoot it. So troops
    // fight from two cells off, at the limit of their range, and step off bad ground before the clock runs out.
    const noClaim=new Set();
    if(!TU.noSupplyPos)for(const e of foes){const h=getNearestHexToPoint(e.x,e.y);if(!h)continue;for(let dq=-1;dq<=1;dq++)for(let dr=-1;dr<=1;dr++)noClaim.add((h.q+dq)+','+(h.r+dr));}
    const soundMemo=new Map();
    const sound=h=>{
        if(friendlyCell(h)||!noClaim.has(h.q+','+h.r))return true;
        // a cell that cannot be claimed is still supplied when our own ground lies within two cells of it
        let v=soundMemo.get(h);if(v!==undefined)return v;v=false;
        for(let dq=-2;dq<=2&&!v;dq++)for(let dr=-2;dr<=2;dr++){const n=wodHexAt(h.q+dq,h.r+dr);if(n&&friendlyCell(n)&&!isWaterHex(n)){v=true;break;}}
        soundMemo.set(h,v);return v;
    };
    const starving=u=>!TU.noSupplyPos&&((u.supplyPendingSeconds||0)>0||(u.outOfSupplySeconds||0)>0);
    // Best covered firing position against a target: inside range, on sound ground, not on top of a comrade.
    const firePos=(u,foe,k)=>{
        // armour stands off at the limit of its longer gun, where infantry cannot answer
        const range=(u.range||50),reach=range*(range>(foe.range||50)+4?.93:TU.noSupplyPos?.82:TU.reach??.9),d=dist(u,foe)||1,base=Math.atan2(u.y-foe.y,u.x-foe.x);
        let best=null,bs=Infinity,bestSound=false;
        const tryAt=(p,extra)=>{
            const h=wodOpsLandHex(p.x,p.y);if(!h||!canUnitEnterHex(u,h))return;
            const ok=sound(h);
            let s=getTerrainDefenseModifier(u,h)/(TU.noAtkPos?1:Math.sqrt(Math.max(.2,getTerrainAttackModifier(u,h))))+extra+dist(p,u)/(hr*40)+(ok?0:TU.unsound??.35);
            if(taken.some(t=>Math.abs(t.x-p.x)<hr*.9&&Math.abs(t.y-p.y)<hr*.9))s+=.35;
            if(s<bs){bs=s;best=p;bestSound=ok;}
        };
        const here=wodOpsLandHex(u.x,u.y);
        if(d<=range*.93&&!(starving(u)&&here&&!friendlyCell(here)))tryAt({x:u.x,y:u.y},-.12); // staying put is worth a little: moving under fire is slow
        const turn=((k||0)%2?1:-1);
        for(const off of [0,.4,-.4,.8,-.8,1.2,-1.2,1.7,-1.7,2.3,-2.3,3])tryAt({x:foe.x+Math.cos(base+off*turn)*reach,y:foe.y+Math.sin(base+off*turn)*reach},Math.abs(off)*.1);
        if(bs>1.2)for(const off of [.2,-.2,.6,-.6,1,-1,1.5,-1.5])tryAt({x:foe.x+Math.cos(base+off*turn)*reach*.62,y:foe.y+Math.sin(base+off*turn)*reach*.62},.08+Math.abs(off)*.1);
        if(!best)best={x:foe.x+(u.x-foe.x)*reach/d,y:foe.y+(u.y-foe.y)*reach/d};
        best.sound=bestSound;
        taken.push(best);return best;
    };
    // Attack one enemy unit the way a player's attack order does: close to firing range, follow it if it
    // moves, and keep most of the marching pace while under fire.
    const chase=(u,foe)=>{
        if(u._wodAttackOrder?.uid===foe.uid)return;
        u._opsRoute=null;u._aiMoveIntent=null;gameData._aiMoveQueue?.delete(u);
        if(u.retreating&&!u.moraleBroken){u.retreating=false;u._wodOrderedRetreat=false;}
        wodSetPreferredTarget(owner,[u.uid],foe.uid,{pursue:true});
    };
    // dug-in defenders are shot at from the best cover in range; anything moving, wounded or running is chased
    const engage=(u,enemies,k,dugIn)=>{
        let foe=null,bs=Infinity;
        for(const e of enemies){const s=dist(e,u)/C+(e.hp/(e.maxHp||100))*1.5;if(s<bs){bs=s;foe=e;}}
        if(!foe)return false;
        const outranges=(u.range||50)>(foe.range||50)+4;
        if(TU.noSupplyPos){
            if(!outranges&&(!dugIn||foe.retreating||foe.hp<(foe.maxHp||100)*.45&&dist(foe,u)>(u.range||50)*.9)){chase(u,foe);return true;}
            const p=firePos(u,foe,k);
            if(dist(p,u)<hr*.6)wodOpsHalt(u);else wodOpsMove(u,p.x,p.y,false);
            return true;
        }
        // An attack order is for what runs or is still far off; whoever stands is shot at from chosen ground.
        if(!outranges&&(foe.retreating||foe.moraleBroken||!dugIn&&dist(foe,u)>(u.range||50)*1.7)){chase(u,foe);return true;}
        const p=firePos(u,foe,k);
        // Nowhere to shoot from that is ours: it shoots from where it can for as long as the grace lasts, then
        // steps back onto the nearest supplied cell (which starts the clock afresh) and comes forward again.
        if((u.outOfSupplySeconds||0)>(TU.outMax??6)){
            const c=wodOpsLandHex(u.x,u.y);let hop=null,bd=Infinity;
            if(c)for(const q of getHexesInRadius(c.q,c.r,3)){const h=wodHexAt(q.q,q.r);if(!h||!friendlyCell(h)||isWaterHex(h)&&!isBridgeHex(h)||!canUnitEnterHex(u,h))continue;const dd=dist(h,u);if(dd<bd&&wodCurrentSupplyComponent(h,owner).city){bd=dd;hop=h;}}
            u._opsRole='resupply';
            if(hop){wodOpsMove(u,hop.x,hop.y,false);hurry(u);}else breakOut(u);
            return true;
        }
        if(dist(p,u)<hr*.25||dist(p,u)<hr*.6&&dist(u,foe)<=(u.range||50)*.97)wodOpsHalt(u);else{wodOpsMove(u,p.x,p.y,false);hurry(u);}
        return true;
    };
    // Troops that wait, wait on the best ground near the place, each on a cell of its own, chosen by what
    // the ground does for its own kind (infantry in woods and on hills, armour in the open). A fight that
    // comes to them finds them in cover.
    const standCells=new Map(),standTaken=new Set();
    const standAt=(u,p)=>{
        if(!TU.coverStand)return p;
        const key=Math.round(p.x)+','+Math.round(p.y);let cells=standCells.get(key);
        if(!cells){const c=getNearestHexToPoint(p.x,p.y);cells=c?getHexesInRadius(c.q,c.r,3).map(q=>wodHexAt(q.q,q.r)).filter(h=>h&&(!isWaterHex(h)||isBridgeHex(h))&&h.type!=='mountain'&&!anyNear(foes,h,C*4.5)):[];standCells.set(key,cells);}
        let best=null,bs=Infinity;
        for(const h of cells){
            if(standTaken.has(h)||!canUnitEnterHex(u,h))continue;
            const d=dist(h,u),sc=getTerrainDefenseModifier(u,h)+dist(h,p)/(C*14)+d/(C*50)-(d<hr?.2:0);
            if(sc<bs){bs=sc;best=h;}
        }
        if(!best)return p;
        standTaken.add(best);return best;
    };
    // Attacked where they stand, they shoot from that cover and let him come; only an enemy who shoots from
    // beyond their reach has to be closed with.
    const defend=(u,hot,k)=>{
        if(!TU.coverStand)return engage(u,hot,k);
        let foe=null,bd=Infinity;for(const e of hot){const d=dist(e,u);if(d<bd){bd=d;foe=e;}}
        if(!foe)return false;
        if(bd>(u.range||50)*.98&&(foe.range||50)>(u.range||50)+4&&bd<=(foe.range||50)*1.1){chase(u,foe);return true;}
        if(foe.retreating||foe.hp<(foe.maxHp||100)*.4){chase(u,foe);return true;}
        wodOpsHalt(u);return true;
    };
    const fallBack=(u,to)=>{
        const t=to||homeTown(u);
        if(dist(u,t)<C*2.2){wodOpsHalt(u);return;}
        let goal=t;
        if(!TU.noSupplyPos){
            // With an enemy on top of it a unit first steps straight away from him: bodies block, and the direct
            // way back may lead past him. It keeps three quarters of its pace while it disengages.
            let foe=null,bd=hr*2.6;for(const e of foes){const d=dist(e,u);if(d<bd){bd=d;foe=e;}}
            if(foe){
                const ax=u.x-foe.x,ay=u.y-foe.y,al=Math.hypot(ax,ay)||1,hx=t.x-u.x,hy=t.y-u.y,hl=Math.hypot(hx,hy)||1;
                const vx=ax/al*1.3+hx/hl,vy=ay/al*1.3+hy/hl,vl=Math.hypot(vx,vy)||1,p={x:u.x+vx/vl*C*3,y:u.y+vy/vl*C*3},h=wodOpsLandHex(p.x,p.y);
                if(h&&canUnitEnterHex(u,h))goal=p;
            }
        }
        wodOpsMove(u,goal.x,goal.y,false);
        if(!TU.noSupplyPos)hurry(u);
        // Only the badly hurt take the engine's retreat state (it also books them into hospital), and never a
        // unit that is cut off: the medical planner has no hospital to send it to and would leave it standing.
        if(u.hp<u.maxHp*.6&&u._combatEngaged&&!starving(u))u.retreating=true;
    };
    // Each enemy town's own guard stays with it; everything else can march.
    const enemyGuard=new Set();
    for(const t of enemyTowns){let g=null,bd=C*3;for(const e of foes){const d=dist(e,t);if(d<bd){bd=d;g=e;}}if(g)enemyGuard.add(g);}
    // What a fight at P would really be against: the enemies there (cover: 0 none, 1 full, .5 when we can
    // shoot from cover of our own), most of what stands within a short march, and some of what could still
    // arrive while the fight lasts. Fights last minutes and everything walks at the same pace.
    const oppAt=(P,base,cover,siege)=>{
        const inBase=new Set(base),mid=[],far=[],rest=[];
        for(const e of foes){
            if(inBase.has(e))continue;const d=dist(e,P);
            if(enemyGuard.has(e)&&d>C*8)continue;
            if(d<C*13)mid.push(e);else if(d<C*30)far.push(e);else rest.push(e);
        }
        const here=base.concat(near(ghosts,P,C*8));
        // What is there and what stands beside it is fought at once; what has to march arrives while that
        // fight is still going, but in the open and one column at a time, so it counts for less. How much
        // less is learnt from this enemy: every assault he beats off raises it, every town taken lowers it.
        const first=wodOpsStrength(here,false)*(1-cover)+wodOpsStrength(here,true)*cover+(siege?1:.9)*wodOpsStrength(mid,false);
        const later=(siege?.8:.5)*wodOpsStrength(far,false)+(siege?.4:.1)*wodOpsStrength(rest,false);
        return TU.hyp?Math.hypot(first,later):first+later*(siege?TU.K??S.reliefK??.8:.6);
    };

    // ---------- enemy groups
    const groups=[];{
        const left=new Set(foes);
        for(const f of foes){
            if(!left.has(f))continue;const g=[f];left.delete(f);
            for(let i=0;i<g.length;i++)for(const o of [...left])if(Math.abs(o.x-g[i].x)<C*5.5&&dist(o,g[i])<C*5.5){g.push(o);left.delete(o);}
            const c=wodOpsCentroid(g);let town=null,td=C*6.5;
            for(const t of enemyTowns){const d=dist(t,c);if(d<td){td=d;town=t;}}
            const inMine=g.filter(e=>friendlyCell(getNearestHexToPoint(e.x,e.y))).length/g.length;
            // aim at a member, never at a centroid that may lie in a lake
            let pos=g[0],pd=Infinity;for(const e of g){const d=dist(e,c);if(d<pd){pd=d;pos=e;}}
            groups.push({units:g,c,pos:{x:pos.x,y:pos.y},raw:wodOpsStrength(g,false),s:wodOpsStrength(g,true),town,home:dHome(c),inMine});
        }
    }

    // ---------- 1. town guards: the minimum that keeps each town from being walked into
    const danger=new Map(myTowns.map(c=>[c,wodOpsStrength(near(foes,c,C*11),false)]));
    const frontDist=c=>enemyTowns.length?Math.min(...enemyTowns.map(t=>dist(t,c))):0;
    const towns=myTowns.slice().sort((a,b)=>danger.get(b)-danger.get(a)||frontDist(a)-frontDist(b));
    const guards=new Map();
    // A town needs a man in its streets only while somebody could walk into them before help would arrive.
    // Everyone else belongs in the field.
    const rovers=foes.filter(e=>!enemyGuard.has(e)).concat(ghosts),boats=seen.filter(u=>wodIsNavalUnit(u)&&(u.type==='transport'||u.cargo));
    const fogOn=wodFogActive();
    // An enemy with marines or landing craft can put troops ashore beside any town, and under fog anyone can
    // walk up unseen: then every town keeps its man.
    const amphibious=seen.some(u=>u.type==='marine'||u.type==='transport');
    const exposed=c=>{
        if(fogOn||amphibious||TU.lean===0)return true;
        let t=Infinity;for(const e of rovers){const d=dist(e,c);if(d<t)t=d;}
        for(const e of boats){const d=dist(e,c)-C*6;if(d<t)t=d;}
        if((S.garrison[c.id]||[]).length)return t<C*34; // once posted he stays until the threat has gone
        if(t<C*15)return true;
        let m=Infinity;for(const u of fighters){const d=dist(u,c);if(d<m)m=d;}
        return t<m+C*10;
    };
    const takeNearest=(p,maxD,pref)=>{
        let g=null,best=maxD;
        for(const u of pool){if(!canReach(u,p))continue;const d=dist(u,p)*(pref&&u.type!=='light'?1.5:1);if(d<best){best=d;g=u;}}
        if(g)pool.delete(g);return g;
    };
    for(const c of towns){
        const list=[];guards.set(c,list);
        for(const id of S.garrison[c.id]||[]){const u=byUid.get(id);if(u&&pool.has(u)&&dist(u,c)<C*12){pool.delete(u);list.push(u);}}
        const d=danger.get(c);
        // Enemies hovering in the neighbourhood are the field army's business. Enemies at the walls are not a
        // question of odds: the town gets defenders in proportion, from wherever they are, because streets
        // double a defender's worth and a lost town is half an economy.
        const atWalls=wodOpsStrength(near(foes,c,C*7),false);
        const want=Math.min(Math.max(exposed(c)?(d<1.5?1:d<5?2:3):0,Math.ceil(atWalls*.75)),Math.max(1,fighters.length-myTowns.length+1));
        // a town under real attack is relieved from anywhere: a town is worth more than any field battle
        while(list.length<want){const g=takeNearest(c,list.length&&d<1.5?C*16:Infinity,!list.length);if(!g)break;list.push(g);}
        while(list.length>want)pool.add(list.pop()); // the first guard stays, the rest return to the field
        S.garrison[c.id]=list.map(u=>u.uid);
    }
    // ---------- 1a. forts and hospitals near the front. A fort or hospital whose tile the enemy takes is
    // destroyed, and he cannot take a tile while somebody stands on it or beside it. So a work the enemy could
    // reach before our nearest man gets a man on it in good time, and once the enemy is at it the nearest
    // troops in proportion to what has come stand on it and beside it, toward him, inside its ring. They hold
    // unless everything of ours there is outweighed three to one. The relief (a strike on that enemy group,
    // section 3) counts them in and does not wait to form up.
    const works=[];
    for(const x of gameData.forts||[])if((typeof wodEffectiveFortOwner==='function'?wodEffectiveFortOwner(x):x.owner)===owner)works.push({k:'f'+x.q+','+x.r,x:x.x,y:x.y,fort:true});
    for(const x of gameData.hospitals||[])if(wodEffectiveHospitalOwner(x)===owner)works.push({k:'h'+x.q+','+x.r,x:x.x,y:x.y});
    if(!TU.noWorks&&works.length&&foes.length){
        const WG=S.worksGuard||(S.worksGuard={});let budget=Math.max(2,Math.floor(pool.size*(TU.worksShare??.45)));
        const ranked=works.map(w=>{let d=Infinity;for(const e of foes){const dd=dist(e,w);if(dd<d)d=dd;}return {w,d};}).sort((a,b)=>a.d-b.d);
        for(const {w,d} of ranked){
            if(d>C*20||budget<=0||myTowns.some(c=>dist(c,w)<C*4)){delete WG[w.k];continue;} // out of his reach, or inside a town's own defence
            const prev=(WG[w.k]||[]).map(id=>byUid.get(id)).filter(u=>u&&pool.has(u)&&dist(u,w)<C*16);
            let gd=Infinity;for(const u of pool){if(u.isGeneral)continue;const dd=dist(u,w);if(dd<gd)gd=dd;}
            const attacked=d<=C*7;
            // the race for the tile: he must not get within two tiles of it before our man is there
            if(!attacked&&!(d<=gd+C*(TU.worksLead??3.5))){delete WG[w.k];continue;}
            const close=near(foes,w,C*7),threat=wodOpsStrength(close,false);
            const want=Math.min(budget,attacked?Math.max(1,Math.ceil(threat*(TU.worksK??.9))):1),list=[];
            for(const u of prev)if(list.length<want){pool.delete(u);list.push(u);}
            while(list.length<want){let g=null,bd=C*(list.length?14:24);for(const u of pool){if(u.isGeneral||!canReach(u,w))continue;const dd=dist(u,w);if(dd<bd){bd=dd;g=u;}}if(!g)break;pool.delete(g);list.push(g);}
            if(!list.length&&attacked&&!TU.noBorrow)for(const [c,gl] of guards){if(gl.length<2||dist(c,w)>C*12)continue;let g=null,bd=C*6;for(const u of gl.slice(1)){const dd=dist(u,w);if(dd<bd){bd=dd;g=u;}}if(g){gl.splice(gl.indexOf(g),1);list.push(g);break;}}
            WG[w.k]=list.map(u=>u.uid);budget-=list.length;w.guards=list;
            if(!list.length)continue;
            // somebody of ours already on the tile (a wounded man the medics have taken over, say) holds it
            const sitter=gameData.entities.some(u=>u.owner===owner&&u.hp>0&&!list.includes(u)&&Math.hypot(u.x-w.x,u.y-w.y)<hr*.8);
            const there=near(fighters,w,C*6),own=wodOpsStrength(there.concat(list.filter(u=>!there.includes(u))),true)*(w.fort?1.25:1);
            const hopeless=wodOpsStrength(close,true)>own*3;
            let lead=null,ld=Infinity;for(const e of foes){const dd=dist(e,w);if(dd<ld){ld=dd;lead=e;}}
            // the man nearest the work takes the tile
            list.sort((p,q)=>dist(p,w)-dist(q,w));
            list.forEach((u,i)=>{
                claim(u,'works');if(!TU.noWorksStand)u._opsStand=now+5000;
                const hot=near(foes,u,C*4.5),k=sitter?i+1:i;
                if(hot.length&&hopeless){fallBack(u);return;}
                let px=w.x,py=w.y;
                if(k>0&&lead){const an=Math.atan2(lead.y-w.y,lead.x-w.x)+(k%2?1:-1)*.8*Math.floor(k/2);px=w.x+Math.cos(an)*C*1.15;py=w.y+Math.sin(an)*C*1.15;const h=wodOpsLandHex(px,py);if(!h||!canUnitEnterHex(u,h)){px=w.x;py=w.y;}}
                const at=Math.hypot(u.x-px,u.y-py)<hr*.8,firing=hot.some(e=>dist(e,u)<=(u.range||50)*.98);
                if(at||firing&&k>0&&dist(u,w)<C*3)wodOpsHalt(u);else{wodOpsMove(u,px,py,true);if(dist(u,w)>C*3)hurry(u);}
            });
            if(!(WG['t'+w.k]>now-60000)){WG['t'+w.k]=now;S.counts.works=(S.counts.works||0)+1;wodAiRecord(owner,'ops-works',{site:w.k,guards:list.length,threat:r1(threat)});}
        }
    }
    if(general)pool.add(general);

    // ---------- 1b. breakout. A unit whose road home has just been cut has twelve seconds before it starts to
    // starve, and it starves fastest standing where it is. It turns round at once and walks back toward the
    // nearest ground that is still supplied: the cells it crosses become ours again and reopen the road.
    // Troops with it go too (below), so the road they reopen is a wide one.
    // (A unit that is only standing on a cell it cannot claim is dealt with where it fights: see engage.)
    const pocketed=TU.noBreakout?[]:elig.filter(u=>((u.outOfSupplySeconds||0)>0||(u.supplyPendingSeconds||0)>.4)&&(TU.noSupplyPos||friendlyCell(wodOpsLandHex(u.x,u.y))||(u.outOfSupplySeconds||0)>8));
    const linkPoint=p=>{
        const home=homeTown(p),dx=home.x-p.x,dy=home.y-p.y,d=Math.hypot(dx,dy)||1;
        for(let k=C;k<d;k+=C){const h=wodOpsLandHex(p.x+dx*k/d,p.y+dy*k/d);if(h&&friendlyCell(h)&&wodCurrentSupplyComponent(h,owner).city){const m=Math.min(d,k+C*3);return {x:p.x+dx*m/d,y:p.y+dy*m/d};}}
        return home;
    };
    const breakOut=u=>{
        const to=linkPoint(u);
        claim(u,'breakout');
        if(dist(u,to)<C*1.5){wodOpsHalt(u);return;}
        fallBack(u,to);
    };
    for(const u of pocketed){
        if(!pool.has(u))continue; // town guards stay: a town supplies its own streets
        if(dHome(u)<C*5)continue;
        pool.delete(u);breakOut(u);
        if(!u._opsCutAt||now-u._opsCutAt>30000){u._opsCutAt=now;S.counts.breakout=(S.counts.breakout||0)+1;wodAiRecord(owner,'ops-breakout',{unit:u.uid});}
    }

    // ---------- 1d. landing parties. Troops put ashore are there to take a town. They go for the nearest enemy
    // town they can walk to, go in at anything short of hopeless odds and do not come off it for losses: a
    // landing that sails home has cost its ships for nothing. Every street is walked, and when the town has
    // fallen they take the land round it until the island is theirs.
    if(landing.length){
        const parties=new Map(),LS=S.landings||(S.landings={});
        for(const u of landing){
            let town=null,bd=C*45;for(const c of enemyTowns){const d=dist(u,c);if(d<bd&&canReach(u,c)){bd=d;town=c;}}
            const k=town?town.id:'land';if(!parties.has(k))parties.set(k,{town,list:[]});parties.get(k).list.push(u);
        }
        const grab=(u,claimed)=>{ // the nearest ground that is not ours yet
            const c=wodOpsLandHex(u.x,u.y);let t=null,bd=Infinity;
            if(c)for(const q of getHexesInRadius(c.q,c.r,8)){const h=wodHexAt(q.q,q.r);if(!h||isWaterHex(h)||friendlyCell(h)||h.type==='mountain'||claimed.has(h)||!canUnitEnterHex(u,h)||anyNear(foes,h,C*4))continue;const d=dist(h,u);if(d<bd){bd=d;t=h;}}
            if(!t)return false;claimed.add(t);wodOpsMove(u,t.x,t.y,false);return true;
        };
        for(const [k,g] of parties){
            const P=g.list,c=g.town,claimed=new Set();
            if(!c){
                P.forEach((u,i)=>{
                    const hot=near(foes,u,C*4.2);claim(u,'landing');
                    if(hot.length){if(wodOpsStrength(hot,true)>wodOpsStrength(near(P,u,C*5),true)*1.5)fallBack(u,wodOpsCentroid(P));else engage(u,hot,i,false);return;}
                    if(!grab(u,claimed))u._opsUntil=0; // nothing left to take here: the navy's planners decide where next
                });
                continue;
            }
            const streets=getCityUrbanTerrainHexes(c).filter(h=>h&&!isWaterHex(h)),todo=streets.filter(h=>!friendlyCell(h));
            const around=foes.filter(e=>dist(e,c)<C*7||anyNear(P,e,C*5)),held=new Set(foes.filter(e=>streets.some(h=>Math.abs(e.x-h.x)<C*1.5&&Math.abs(e.y-h.y)<C*1.5)));
            const ratio=wodOpsStrength(P,true)/Math.max(.05,wodOpsStrength(around,true));
            const st=LS[k]||(LS[k]={at:now});
            if(!st.in&&ratio>=(TU.landIn??.6)){st.in=now;S.counts.landing=(S.counts.landing||0)+1;wodAiRecord(owner,'ops-landing',{city:c.id,troops:P.length,ratio:r1(ratio)});}
            else if(st.in&&ratio<(TU.landOut??.4))st.in=0;
            P.forEach((u,i)=>{
                claim(u,'landing');
                const local=near(around,u,C*6);
                if(!st.in){ // hopeless for now: keep out of his reach and wait for the next wave
                    const e=local.find(e=>dist(e,u)<C*3.6);
                    if(e){const d=dist(e,u)||1;fallBack(u,{x:u.x+(u.x-e.x)/d*C*5,y:u.y+(u.y-e.y)/d*C*5});}else wodOpsHalt(u);
                    return;
                }
                u._opsStand=now+5000; // the wounded stay in the line
                let t=null,bd=C*4;for(const h of todo){if(claimed.has(h)||!canUnitEnterHex(u,h)||anyNear(around,h,C*2.2))continue;const d=dist(h,u);if(d<bd){bd=d;t=h;}}
                if(t&&!anyNear(around,u,C*2.4)){claimed.add(t);wodOpsMove(u,t.x,t.y,false);return;}
                if(local.length){let foe=null,fd=Infinity;for(const e of local){const d=dist(e,u);if(d<fd){fd=d;foe=e;}}engage(u,local,i,held.has(foe));return;}
                if(todo.length){let h=null,hd=Infinity;for(const x of todo){if(claimed.has(x))continue;const d=dist(x,u);if(d<hd){hd=d;h=x;}}h=h||todo[0];claimed.add(h);wodOpsMove(u,h.x,h.y,false);return;}
                if(!grab(u,claimed))wodOpsHalt(u);
            });
        }
    }

    // ---------- 1c. towns that are there for the taking. A town with nobody in its streets falls to whoever
    // walks every one of them, and a town we already hold part of is half won. The nearest troops finish it
    // now, whatever else is going on, each heading for the nearest street that is not ours yet.
    const finishing=new Set(),fronting=new Set();
    if(!TU.noFinish)for(const c of enemyTowns){
        const streets=getCityUrbanTerrainHexes(c).filter(h=>h&&!isWaterHex(h)),todo=streets.filter(h=>!friendlyCell(h));
        if(!todo.length)continue;
        const partial=todo.length<streets.length;
        if(partial)finishing.add(c);
        const holders=foes.filter(e=>streets.some(h=>Math.abs(e.x-h.x)<C*1.5&&Math.abs(e.y-h.y)<C*1.5));
        const touching=partial||todo.some(h=>getNeighborHexes(h).some(n=>n&&friendlyCell(n)));
        if(touching)fronting.add(c);
        if(holders.length){
            // Held by a few men, and we are already in its streets or at its edge: a party strong enough to
            // beat exactly those men goes in and stays until the town has changed hands. The main battle,
            // wherever it is, goes on without them. A real garrison is the main battle's business.
            if(!touching)continue;
            const field=[...pool].filter(u=>!u.isGeneral&&canReach(u,c)),want=wodOpsStrength(foes.filter(e=>dist(e,c)<C*6),true)*1.3+.5;
            if(want>wodOpsStrength(field,false)*.6)continue;
            field.sort((a,b)=>dist(a,c)-dist(b,c));
            const party=[];for(const u of field){if(wodOpsStrength(party,true)>=want||party.length>=8)break;if(dist(u,c)>C*30)break;party.push(u);}
            if(wodOpsStrength(party,true)<want*.8)continue;
            const around=foes.filter(e=>dist(e,c)<C*7),mine=new Set(),held=new Set(holders);
            party.forEach((u,i)=>{
                pool.delete(u);claim(u,'storm');
                const local=near(around,u,C*6);
                if(local.length&&wodOpsStrength(near(around,u,C*4.5),true)>wodOpsStrength(near(party,u,C*5),true)*1.5){fallBack(u);return;}
                // free streets out of the defenders' reach are walked at once; the rest fall when he does
                let t=null,bd=C*4;for(const h of todo){if(mine.has(h)||!canUnitEnterHex(u,h)||anyNear(around,h,C*2.2))continue;const d=dist(h,u);if(d<bd){bd=d;t=h;}}
                if(t&&!anyNear(around,u,C*2.4)){mine.add(t);wodOpsMove(u,t.x,t.y,false);return;}
                if(local.length){let foe=null,fd=Infinity;for(const e of local){const d=dist(e,u);if(d<fd){fd=d;foe=e;}}engage(u,local,i,held.has(foe));return;}
                const s2=wodOpsSlot(i,hr*.8);wodOpsMove(u,c.x+s2.x,c.y+s2.y,false);
            });
            const seenS=S.occupyAt||(S.occupyAt={});
            if(!(seenS['s'+c.id]>now-60000)){seenS['s'+c.id]=now;S.counts.storm=(S.counts.storm||0)+1;wodAiRecord(owner,'ops-finish',{city:c.id,defenders:holders.length,troops:party.length,streets:todo.length});}
            continue;
        }
        const cands=[...pool].filter(u=>!u.isGeneral&&canReach(u,c)).map(u=>({u,d:dist(u,c)})).filter(o=>touching||o.d<C*16).sort((a,b)=>a.d-b.d);
        if(!cands.length)continue;
        const threat=wodOpsStrength(near(foes,c,C*8),true),party=[];
        for(const o of cands){if(party.length>=(todo.length>6?3:2)&&wodOpsStrength(party,true)>=threat*1.1||party.length>=5)break;party.push(o.u);}
        if(!partial&&wodOpsStrength(party,true)<threat*.8)continue; // somebody stronger stands right beside it: that is a battle too
        const mine=new Set();
        party.forEach((u,i)=>{
            pool.delete(u);claim(u,'occupy');
            const hot=near(foes,u,C*3.4);
            if(hot.length){if(wodOpsStrength(hot,true)>wodOpsStrength(near(party,u,C*5),true)*1.3)fallBack(u);else engage(u,hot,i,false);return;}
            let t=null,bd=Infinity;for(const h of todo){if(mine.has(h)||!canUnitEnterHex(u,h))continue;const d=dist(h,u);if(d<bd){bd=d;t=h;}}
            if(!t)t=todo[0];mine.add(t);
            wodOpsMove(u,t.x,t.y,false);
        });
        const seenAt=S.occupyAt||(S.occupyAt={});
        if(!(seenAt[c.id]>now-60000)){seenAt[c.id]=now;S.counts.occupy=(S.counts.occupy||0)+1;wodAiRecord(owner,'ops-occupy',{city:c.id,streets:todo.length,troops:party.length});}
    }

    // ---------- 2. supply cuts already under way are carried through: the same ring, the same troops
    const foeByUid=new Map(foes.map(e=>[e.uid,e])),cutHandled=new Set(),span=C*1.6;
    S.cuts=S.cuts.filter(op=>{
        const enemies=op.enemies.map(id=>foeByUid.get(id)).filter(Boolean);
        const cutters=op.cutters.map(id=>byUid.get(id)).filter(u=>u&&pool.has(u));
        const cells=op.cells.map(k=>gameData.hexes[k]).filter(h=>h&&!friendlyCell(h));
        const age=now-op.at;
        // the proof of a closed pocket is the enemy's own supply state, not our estimate of the ring
        const starving=enemies.filter(e=>(e.outOfSupplySeconds||0)>0||(e.supplyPendingSeconds||0)>.5);
        if(starving.length){op.starvedAt=now;if(!op.closedAt){op.closedAt=now;S.counts.pocket++;wodAiRecord(owner,'ops-pocket',{enemy:op.enemies[0],group:enemies.length,seconds:Math.round(age/1000)});}}
        if(op.closedAt&&now-(op.starvedAt||op.closedAt)>9000){op.closedAt=0;op.at=now-30000;} // they reopened it: finish the ring again or give up soon
        if(!enemies.length||!cutters.length||!op.closedAt&&age>60000||op.closedAt&&now-op.closedAt>120000)return false;
        if(!op.closedAt&&cells.some(h=>foes.some(e=>Math.abs(e.x-h.x)<span&&Math.abs(e.y-h.y)<span))&&age>6000){S.cutFail=now;return false;} // ring is now defended
        for(const e of enemies)cutHandled.add(e.uid);
        cutters.forEach(u=>{
            pool.delete(u);claim(u,op.closedAt?'seal':'cut');
            if(op.closedAt){
                // hold the part of the ring the pocket is trying to break through: troops beside a cell stop it being reclaimed
                const e=starving[0]||enemies[0];let post=null,bd=Infinity;
                for(const k of op.cells){const h=gameData.hexes[k];if(!h||!friendlyCell(h))continue;const d=dist(h,e);if(d<bd){bd=d;post=h;}}
                if(post&&dist(post,u)>hr*1.6)wodOpsMove(u,post.x,post.y,true);else wodOpsHalt(u);
                return;
            }
            const order=(op.routes[u.uid]||[]).map(k=>gameData.hexes[k]).filter(h=>h&&!friendlyCell(h));
            if(order.length)wodOpsRoute(u,order,op.id+':'+order.length);else wodOpsHalt(u);
        });
        return true;
    });

    // ---------- 3. jobs: what the enemy offers and what each would cost
    const free0=[...pool];
    const fieldStrength=wodOpsStrength(free0,false);
    const idle=(now-S.lastPush)/1000;
    // a commander who has waited long enough accepts a thinner edge
    // ... and one whose attacks keep failing asks for a thicker one: the enemy is stronger than he looked
    S.recalls=(S.recalls||[]).filter(t=>now-t<300000);
    const dom=wodOpsStrength(fighters,false)/Math.max(.5,wodOpsStrength(foes.concat(ghosts),false));
    const edge=Math.max(TU.edgeMin??.85,D.ratio+Math.min(.3,S.recalls.length*.07)-Math.max(0,idle-D.patience)/60*(TU.decay??.08)-(TU.noDom?0:dom>=1.5?.12:dom>=1.25?.06:0));
    const bias=id=>{let h=D.seed;for(const ch of String(id))h=(Math.imul(h,31)+ch.charCodeAt(0))|0;return ((h>>>0)%1000)/1000;};
    const failed=key=>{const f=S.failed[key];return f&&now-f.at<240000?f.n:0;};
    const sourcesBy={};
    const sourcesFor=fo=>sourcesBy[fo]||(sourcesBy[fo]=new Set(gameData.cities.filter(c=>c.owner>0&&wodIsFriendlyOwner(c.owner,fo)).flatMap(c=>wodCitySupplySourceHexes(c).map(getHexKey))));
    const myHospitals=(gameData.hospitals||[]).filter(h=>h.owner===owner);
    const jobs=[];
    // match groups to last pulse's strike jobs so their state carries over
    const oldStrikes=S.strikes;S.strikes=[];
    for(const g of groups){
        if(g.town)continue;
        const ids=new Set(g.units.map(e=>e.uid));let key=null,ov=0;
        for(const o of oldStrikes){let n=0;for(const id of o.ids)if(ids.has(id))n++;if(n>ov){ov=n;key=o.key;}}
        if(!key||S.strikes.some(s=>s.key===key))key='strike:'+g.units[0].uid;
        S.strikes.push({key,ids});
        const atWorks=!TU.noWorks&&works.some(w=>dist(w,g.c)<C*8);
        const intruding=g.home<C*11||g.inMine>=.5||atWorks;
        // a column that has pushed into our land hangs on the strip it painted behind it: cut that first
        // The same is done to any group in the open whose ground narrows behind it, in his land or nobody's: at
        // even odds a closed ring is worth more than a won firefight. Wider rings take more cutters.
        const anywhere=!TU.noEnvelop&&g.inMine<.3&&!enemyTowns.some(t=>dist(t,g.c)<C*7);
        const scan=S.cutScan||(S.cutScan={}),seenScan=scan[key];
        if((g.inMine>=.3||anywhere&&!(seenScan>now-4000)&&!(S.cutFail>now-20000))&&!g.units.some(e=>cutHandled.has(e.uid))&&S.cuts.length<Math.max(1,Math.ceil(fighters.length/4))){
            scan[key]=now;
            const maxCut=TU.noEnvelop?2:Math.min(4,Math.max(1,Math.floor(pool.size/3)));
            const plan=wodOpsCutPlan(g.units,sourcesFor(g.units[0].owner),foes,hr,TU.noEnvelop?7:2+5*maxCut);
            if(plan.state==='cut'&&plan.d<=8){
                const cells=plan.cells.filter(h=>!friendlyCell(h));
                const want=TU.noEnvelop?(cells.length>4&&pool.size>3?2:1):Math.min(maxCut,Math.max(1,Math.ceil(cells.length/5))),cutters=[];
                for(let k=0;k<want&&cells.length;k++){
                    let best=null,bd=C*(anywhere?13:10); // a ring too far away is closed long after the enemy has moved on
                    for(const u of pool){if(u.isGeneral||cells.some(h=>!canUnitEnterHex(u,h)))continue;const d=Math.min(...cells.map(h=>dist(h,u)));if(d<bd){bd=d;best=u;}}
                    if(!best)break;
                    pool.delete(best);cutters.push(best);
                }
                if(cutters.length){
                    const op={id:'cut-'+g.units[0].uid+'-'+Math.round(now),at:now,enemies:g.units.map(e=>e.uid),cells:cells.map(getHexKey),cutters:cutters.map(u=>u.uid),routes:{}};
                    // the ring is laid out as one chain and shared out in stretches, each cutter walking his own from its nearer end
                    const chain=[];{const left=cells.slice();let at={x:cutters[0].x,y:cutters[0].y};while(left.length){let bi=0;for(let i=1;i<left.length;i++)if(dist(left[i],at)<dist(left[bi],at))bi=i;at=left.splice(bi,1)[0];chain.push(at);}}
                    const per=Math.ceil(chain.length/cutters.length),freeCut=new Set(cutters);
                    for(let k=0;k<cutters.length;k++){
                        const part=chain.slice(k*per,(k+1)*per);if(!part.length)break;
                        let u=null,bd=Infinity,rev=false;
                        for(const c of freeCut){const d0=dist(c,part[0]),d1=dist(c,part[part.length-1]),d=Math.min(d0,d1);if(d<bd){bd=d;u=c;rev=d1<d0;}}
                        freeCut.delete(u);claim(u,'cut');
                        const order=rev?part.slice().reverse():part;
                        op.routes[u.uid]=order.map(getHexKey);wodOpsRoute(u,order,op.id+':'+order.length);
                    }
                    for(const u of freeCut){claim(u,'cut');op.routes[u.uid]=chain.map(getHexKey);wodOpsRoute(u,chain,op.id+':'+chain.length);}
                    S.cuts.push(op);S.counts.cut++;
                    wodAiRecord(owner,'ops-cut',{enemy:g.units[0].uid,group:g.units.length,ring:cells.length,depth:plan.d,cutters:cutters.length});
                    for(const e of g.units)cutHandled.add(e.uid);
                }
            }
        }
        let alone=true;for(const o of groups)if(o!==g&&dist(o.c,g.c)<C*9){alone=false;break;}
        if(alone&&enemyTowns.some(t=>dist(t,g.c)<C*9))alone=false;
        const wk=atWorks&&!TU.noRescue?works.find(w=>w.guards&&w.guards.length&&g.units.some(e=>dist(e,w)<C*6)):null; // a guarded work of ours under attack
        const home=homeTown(g.c),helpers=g.home<C*8?(guards.get(home)||[]):wk?wk.guards:[];
        const pocketed=g.units.some(e=>(e.outOfSupplySeconds||0)>3);
        // Where the fight is matters as much as its size: the side whose wounded have the shorter walk to a
        // town or hospital gets them back into the line several times while the other side's are still walking.
        const dMine=Math.min(g.home,...myHospitals.map(h=>dist(h,g.c)));
        const dTheirs=enemyTowns.length?Math.min(...enemyTowns.map(t=>dist(t,g.c))):dMine;
        const logistics=Math.max(.82,Math.min(1.2,.8+.4*dMine/Math.max(1,dMine+dTheirs)));
        let need=oppAt(g.pos,g.units,TU.scover??.7)*Math.max(.95,edge-.04)*logistics-wodOpsStrength(helpers,true)*.8;
        if(pocketed)need*=.6; // they are starving: time is on our side
        need=Math.max(.6,need);
        const value=(intruding?(26+12*g.raw)*(g.home<C*8?2:atWorks?1.5:1):8*g.raw*(alone?1.5:1))*D.hunt/(1+failed(key)*.5);
        jobs.push({key,kind:'strike',g,pos:g.pos,enemies:g.units,need,value,wk,maxD:C*(intruding?34:26)});
    }
    const atLarge=groups.filter(g=>!g.town).reduce((n,g)=>n+g.raw,0);
    for(const c of enemyTowns){
        if(!fighters.some(u=>canReach(u,c)))continue;
        const def=near(foes,c,C*7.5),here=def.concat(near(ghosts,c,C*7.5));
        const sDef=wodOpsStrength(here,true);
        const last=enemyTowns.filter(t=>t.owner===c.owner).length===1;
        const worth=k=>(38+(last?22:0)+bias(c.id)*14)/(1+failed(k)*.6);
        // Storm it with everything. With an enemy army still in the open that is only sound when we outweigh
        // the town and the army together by a margin; otherwise the army is dealt with first.
        // Storm it with everything. The garrison is beaten first, then whatever marches to its help.
        // A town under our guns cannot heal its defenders; with a hospital or a town of our own close behind the
        // assault, ours go back into the line again and again. That is worth a good part of his walls.
        const healNear=!TU.noHosp&&(myHospitals.some(h=>dist(h,c)<C*14)||myTowns.some(t=>dist(t,c)<C*12));
        const sk='take:'+c.id,stormNeed=(oppAt(c,def,1,true)+.3)*edge*(healNear?.85:1)*(fogOn?1.2:1)*(finishing.has(c)?.8:fronting.has(c)?.9:1); // under fog there is more than can be seen
        jobs.push({key:sk,kind:'take',city:c,pos:c,enemies:def,need:stormNeed,value:worth(sk)*(atLarge<=fieldStrength*.3?1.5:1)*(finishing.has(c)?1.6:1),maxD:Infinity,sDef});
        // Raid: the town is held by little more than its guard and whatever could come to its help is a
        // long march away. A small party is enough, and it must be quick.
        // It does not have to storm the place: one hostile unit within reach of a town's streets stops all
        // recruiting and healing there, so a party that cannot beat the garrison still shuts the town down.
        const inTown=near(foes,c,C*5),others=foes.filter(e=>!inTown.includes(e)&&!enemyGuard.has(e));
        // The party runs as soon as a relief force comes near, so only what stands close to the town now counts.
        const close=others.filter(e=>dist(e,c)<C*9.5);
        const raidNeed=Math.max(1.8,wodOpsStrength(inTown.concat(near(ghosts,c,C*5)),false)*1.1+.9*wodOpsStrength(close,false)+.5);
        const rk='raid:'+c.id,ro=S.ts[rk];
        // And it is a race: it only pays if the party can be at the town well before the nearest relief.
        let relief=Infinity;for(const e of others){const d=dist(e,c);if(d<relief)relief=d;}
        let march=Infinity;for(const u of free0){if(u.isGeneral)continue;const d=dist(u,c);if(d<march)march=d;}
        const raceWon=relief>=march*.75+C*5||!!ro&&(ro.phase==='advance'||ro.phase==='fight')&&now-ro.seen<8000;
        if(raceWon&&raidNeed<=5&&!(ro&&ro.raidCool>now))jobs.push({key:rk,kind:'take',raid:true,city:c,pos:c,enemies:def,need:raidNeed,value:worth(rk)*D.raid*1.3,maxD:Infinity,sDef});
    }
    const pc=free0.length?wodOpsCentroid(free0):myTowns[0];
    for(const j of jobs){
        const st=S.ts[j.key];
        j.active=!!st&&(st.phase==='advance'||st.phase==='fight')&&now-st.seen<8000;
        j.cool=!!st&&st.coolUntil>now;
        j.priority=j.value*(j.active?1.6:1)/(j.need+dist(pc,j.pos)/(C*12));
    }
    jobs.sort((a,b)=>b.priority-a.priority);
    // An army with no battle on is an army running about. The best town on the list is then accepted a
    // little under its price: troops assaulting are worth more than troops waiting for perfect odds.
    if(!TU.noPush&&!jobs.some(j=>j.active&&!j.raid)){const j=jobs.find(j=>j.kind==='take'&&!j.raid&&!j.cool);if(j)j.push=true;}
    // who would go on this job, from the troops still unassigned
    const pick=j=>{
        const st=S.ts[j.key],was=new Set(st?.members||[]),cands=[];
        for(const u of pool){
            const d=dist(u,j.pos);if(d>j.maxD&&!was.has(u.uid))continue;
            if(u.isGeneral&&(j.raid||j.need<2.5))continue; // the general does not go on raids
            if(j.raid&&!was.has(u.uid)&&anyNear(foes,u,C*5))continue; // nor does anyone already in a fight
            if(!canReach(u,j.pos))continue;
            cands.push({u,d:d*(was.has(u.uid)?.55:1)});
        }
        cands.sort((a,b)=>a.d-b.d);
        // a raid takes what it needs; a battle takes everyone in reach, because numbers end a fight sooner and cheaper
        const want=j.raid?j.need+.9:j.need<2.5?Math.max(j.need*1.6,j.need+1):Infinity,members=[];let got=0;
        for(const cnd of cands){if(got>=want)break;members.push(cnd.u);got=wodOpsStrength(members,false);}
        return {members,got,enough:got>=j.need*(j.active?.7:j.push?TU.push??.88:1)};
    };
    const runs=[];let blocked=null,raidOut=0;
    const commit=(j,a)=>{for(const u of a.members)pool.delete(u);j.members=a.members;j.got=a.got;runs.push(j);};
    // The main effort is the best battle that can be paid for. While there is one the army stays together:
    // raiding parties get a small share of it (enough to shut down another town), not half.
    let main=null;
    for(const j of jobs){if(j.cool||j.raid||j.need<2.5)continue;if(pick(j).enough){main=j;break;}}
    const raidCap=main?Math.max(0,Math.min(fieldStrength*.22,fieldStrength-main.need*1.1)):Math.max(3.2,fieldStrength*.3);
    for(const j of jobs){
        if(j.cool||!j.raid)continue;
        if(main&&main.city===j.city)continue; // that town is being stormed
        const a=pick(j);if(!a.enough)continue;
        if((raidOut>0||raidOut+a.got>raidCap)&&!j.active)continue; // one raid at a time
        raidOut+=a.got;commit(j,a);
    }
    for(const j of jobs){
        if(j.cool||j.raid)continue;
        const a=pick(j);
        if(!a.enough){if(!blocked&&j.kind==='take')blocked=j;continue;}
        commit(j,a);
    }


    // ---------- 4. carry the jobs out
    const noteFail=key=>{const f=S.failed[key]||(S.failed[key]={n:0,at:0});f.n=now-f.at<240000?f.n+1:1;f.at=now;};
    // a way from a to b that keeps clear of every enemy who is not part of the objective
    const clearLeg=(a,b,ignore)=>{
        const n=Math.max(1,Math.ceil(dist(a,b)/(C*2)));
        for(let i=1;i<=n;i++){
            const p={x:a.x+(b.x-a.x)*i/n,y:a.y+(b.y-a.y)*i/n};
            // a lake on the straight line does not matter (the march goes round it); an enemy near it does
            for(const e of foes)if(!ignore.has(e)&&Math.abs(e.x-p.x)<C*6.5&&dist(e,p)<C*6.5)return false;
        }
        return true;
    };
    // Wings: when a force clearly outweighs what it is fighting, part of it goes round both sides to the
    // enemy's rear. There it shoots what the frontal fight drives back and stands between his wounded and
    // their hospital, and the ground it walks over closes behind him: troops with no land link to a town
    // starve in under a minute.
    const wrap=a=>{a%=6.283185;return a<0?a+6.283185:a;};
    const planWings=(j,M,E,P)=>{
        const core=j.kind==='take'?near(E,P,C*5.5):j.enemies.filter(e=>e.hp>0);
        if(!core.length)return null;
        const ec=j.kind==='take'?P:wodOpsCentroid(core);
        let er=C*1.5;for(const e of core)er=Math.max(er,dist(e,ec));er=Math.min(er,C*6);
        const fo=core[0].owner,mc=wodOpsCentroid(M),app=Math.atan2(mc.y-ec.y,mc.x-ec.x);
        let rear=null,bd=Infinity;
        for(const t of enemyTowns){if(t===j.city||!wodIsFriendlyOwner(t.owner,fo))continue;const d=dist(t,ec);if(d<bd){bd=d;rear=t;}}
        const back=rear&&bd>er+C*4?Math.atan2(rear.y-ec.y,rear.x-ec.x):app+Math.PI;
        const R=er+C*3.4,list={};
        // only troops already up with the fight: a recruit still on the road is not a wing
        const cands=M.filter(u=>!u.isGeneral&&u.hp>=u.maxHp*.7&&!anyNear(core,u,C*2.6)&&dist(u,ec)<R+C*8);
        const per=Math.max(1,Math.floor(near(M,ec,R+C*8).length*.2));
        for(const side of (M.length>=8?[D.side,-D.side]:[D.side])){
            const end=wrap(back-side*.5); // the two wings stop either side of his line of retreat
            const scored=cands.filter(u=>!list[u.uid]).map(u=>({u,sweep:wrap((end-Math.atan2(u.y-ec.y,u.x-ec.x))*side)})).filter(c=>c.sweep<3.9).sort((a,b)=>a.sweep-b.sweep);
            for(const c of scored.slice(0,per)){
                const u=c.u,a0=Math.atan2(u.y-ec.y,u.x-ec.x),n=Math.max(1,Math.ceil(c.sweep/.55)),pts=[];
                for(let i=1;i<=n;i++){
                    const a=a0+side*c.sweep*i/n;let h=null;
                    for(const rr of [R,R+C*2,R+C*4]){const q=wodOpsLandHex(ec.x+Math.cos(a)*rr,ec.y+Math.sin(a)*rr);if(q&&canUnitEnterHex(u,q)&&canReach(u,q)&&!anyNear(foes,q,C*2.4)){h=q;break;}}
                    if(h)pts.push(getHexKey(h));else if(i===n)pts.length=0; // no standing room at the far end: no wing
                }
                if(pts.length)list[u.uid]={side,pts,i:0};
            }
        }
        return Object.keys(list).length?{at:now,list}:null;
    };

    // A unit on the road with enemies ahead that outweigh what is up with it does not walk on alone: it goes
    // back to the body. One at a time is how a stronger column loses to a weaker post.
    const alone=(u,M)=>{if(TU.noSupplyPos)return false;const hot=near(foes,u,C*5.5);return hot.length>0&&wodOpsStrength(hot,true)>wodOpsStrength(near(M,u,C*5),true)*1.15;};
    let pushing=false;
    for(const j of runs){
        const M=j.members,P=j.pos;
        let st=S.ts[j.key];
        if(!st||now-st.seen>8000||!!st.raid!==!!j.raid)st=S.ts[j.key]={phase:'gather',since:now,born:now,raid:!!j.raid,raidCool:st?.raidCool||0};
        if(st.size>M.length+1&&st.phase==='fight')st.lost=(st.lost||0)+st.size-M.length; // rough: wounded leave too, but a shrinking force is a costly fight
        st.size=M.length;st.seen=now;st.members=M.map(u=>u.uid);
        const role=j.raid?'raid':j.kind==='take'?'assault':'strike';
        const mc=wodOpsCentroid(M);
        // everything this force is about to be shot at by: at the objective and around the troops themselves
        const E=foes.filter(e=>dist(e,P)<C*8.5||j.enemies.includes(e)||anyNear(M,e,C*7));
        const dug=j.kind==='take'?new Set(near(E,P,C*5)):null;
        const contact=M.some(u=>anyNear(E,u,C*3.2));
        // the fight as it stands: everyone in it or a few seconds from it
        const front=contact?M.filter(u=>anyNear(E,u,C*13)||dist(u,P)<C*13||dist(u,mc)<C*10):M;
        const own=wodOpsStrength(front,true)+(j.kind==='strike'&&j.g.home<C*8?wodOpsStrength(guards.get(homeTown(j.g.c))||[],true)*.8:j.wk?wodOpsStrength(j.wk.guards,true)*.8:0);
        const opp=Math.max(.05,wodOpsStrength(E.concat(near(ghosts,P,C*7)),true));
        st.ratio=own/opp;st.at={x:mc.x,y:mc.y};
        const hotOf=u=>near(foes,u,C*4.2);
        const recall=why=>{
            if(why==='cut off'){const to=linkPoint(mc);st.back={x:to.x,y:to.y};st.cut=true;st.phase='fallback';st.until=now+20000;st.wings=null;S.counts.recall++;wodAiRecord(owner,'ops-recall',{target:j.city?.id||j.key,ratio:r1(st.ratio),why});M.forEach(u=>{claim(u,'recall');fallBack(u,st.back);hurry(u);});return;}
            // break off to a point a short march back toward home and gather there; not all the way to town
            const home=homeTown(mc),d=dist(home,mc)||1,k=Math.min(1,C*9/d);
            st.back={x:mc.x+(home.x-mc.x)*k,y:mc.y+(home.y-mc.y)*k};
            // Switch (off: it tested worse): a beaten force deep in enemy land goes all the way back to supplied
            // ground and the army keeps to its own ground for a minute.
            if(TU.pullback&&!j.raid&&why==='beaten'&&!friendlyCell(wodOpsLandHex(st.back.x,st.back.y))){const to=linkPoint(mc);st.back={x:to.x,y:to.y};S.timid=now+60000;S.post=null;}
            st.phase='fallback';st.until=now+9000;st.wings=null;S.counts.recall++;noteFail(j.key);
            if(j.raid)st.raidCool=now+60000*Math.min(5,failed(j.key)+1);else{S.recalls.push(now);if(st.lost>=3)S.recalls.push(now);if(j.kind==='take')S.reliefK=Math.min(1.4,(S.reliefK??.8)+(TU.learn??.35));}
            st.lost=0;
            wodAiRecord(owner,'ops-recall',{target:j.city?.id||j.key,ratio:Math.round(st.ratio*100)/100,why});
            M.forEach(u=>{claim(u,'recall');fallBack(u,st.back);});
        };
        // two or more of this force's troops (or of those beside it) are cut off: the whole force goes back with
        // them and reopens the road, unless the town in front of it is all but taken (a taken town feeds it)
        if(st.phase!=='fallback'&&dHome(mc)>C*9&&pocketed.filter(u=>dist(u,mc)<C*10).length>=2&&
            !(j.kind==='take'&&st.phase==='fight'&&wodOpsStrength(near(E,P,C*5.5),true)<wodOpsStrength(M,true)*.3)){recall('cut off');continue;}
        if(st.phase==='gather'){
            // Assemble where most of the force already is: the member with the shortest total walk for everyone
            // else, a little toward the objective. The point is kept until the force has gathered there.
            let rally=st.rally&&!anyNear(foes,st.rally,C*6)?st.rally:null;
            if(!TU.noRallyPost&&!rally&&S.post&&now-S.post.at<60000&&!anyNear(foes,S.post,C*6)&&wodOpsStrength(near(M,S.post,C*8),false)>=wodOpsStrength(M,false)*.5)rally=st.rally={x:S.post.x,y:S.post.y};
            if(!rally){
                let b=null,bs=Infinity;
                for(const u of M){
                    const h=wodOpsLandHex(u.x,u.y);if(!friendlyCell(h)||anyNear(foes,u,C*7))continue;
                    let sum=dist(u,P)*.5;for(const o of M)sum+=dist(o,u);
                    if(sum<bs){bs=sum;b=u;}
                }
                const t=b||homeTown(mc);rally=st.rally={x:t.x,y:t.y};
            }
            const gathered=wodOpsStrength(near(M,rally,C*6),false),all=wodOpsStrength(M,false);
            const waited=now-st.since;
            let go=M.length<=1||contact&&st.ratio>=1||!!j.wk&&st.ratio>=.8||(!TU.strict?gathered>=j.need||gathered>=all*.6||waited>25000&&gathered>=all*.4:gathered>=j.need*.95||gathered>=all*.9&&gathered>=j.need*.85);
            if(go&&j.raid){
                // go round the enemy, not through him
                const ignore=new Set(j.enemies),from={x:rally.x,y:rally.y};st.via=null;
                if(!clearLeg(from,P,ignore)){
                    go=false;
                    const dx=P.x-from.x,dy=P.y-from.y,d=Math.hypot(dx,dy)||1;
                    search:for(const side of [D.side,-D.side])for(const off of [9,14,20]){
                        const v={x:from.x+dx*.5-dy/d*C*off*side,y:from.y+dy*.5+dx/d*C*off*side},h=wodOpsLandHex(v.x,v.y);
                        if(!h||!canReach(M[0],h)||!clearLeg(from,v,ignore)||!clearLeg(v,P,ignore))continue;
                        st.via={x:h.x,y:h.y};go=true;break search;
                    }
                    if(!go&&waited>25000){st.phase='gather';st.since=now;st.coolUntil=now+30000;wodAiRecord(owner,'ops-noroute',{target:j.city.id});} // no way round for now
                }
            }
            if(!go&&j.raid&&waited>40000){st.since=now;st.coolUntil=now+90000;} // could not get away: the troops are needed elsewhere
            if(go){
                st.phase='advance';st.since=now;st.formAt=0;
                if(!st.launched){st.launched=true;S.counts[j.raid?'raid':'launch']++;wodAiRecord(owner,'ops-'+role,{target:j.city?.id||j.key,strength:r1(all),need:r1(j.need)});}
            }else{
                M.forEach((u,i)=>{claim(u,'muster');const hot=hotOf(u);
                    if(hot.length){if(wodOpsStrength(hot,true)>wodOpsStrength(near(M,u,C*4.5),true)*1.25)fallBack(u,rally);else defend(u,hot,i);return;}
                    const h=standAt(u,rally);wodOpsMove(u,h.x,h.y,true);});
                continue;
            }
        }
        if(st.phase==='fallback'){
            if(now>=st.until){st.phase='gather';st.since=now;st.rally=null;st.launched=false;st.coolUntil=now+8000;st.cut=false;}
            M.forEach((u,i)=>{claim(u,'recall');const s=wodOpsSlot(i,hr*1.1);fallBack(u,{x:st.back.x+s.x,y:st.back.y+s.y});if(st.cut)hurry(u);});
            continue;
        }
        pushing=true;
        if(j.raid){
            // a raid lives on not being caught: anything but the town's own defenders coming close ends it
            const hunters=now-st.since>7000||st.phase==='fight'?foes.filter(e=>!j.enemies.includes(e)&&anyNear(M,e,C*6)):[];
            if(wodOpsStrength(hunters,false)>wodOpsStrength(M,false)*.9){recall('intercepted');continue;}
        }
        if(st.phase==='advance'){
            // still free to choose: do not walk into a fight that has turned against us
            if(!contact&&st.ratio<(TU.pre??.8)){recall('outnumbered');continue;}
            // Form up before going in: the head of the column stops short of the objective until most of the
            // force has closed up behind it. Arriving a few at a time is how a stronger army loses.
            const ringD=C*(j.kind==='take'?9.5:8),aimAt=j.kind==='take'?P:(()=>{let b=P,bd=Infinity;for(const e of j.enemies){const d=dist(e,mc);if(d<bd){bd=d;b=e;}}return b;})();
            const head=M.filter(u=>dist(u,aimAt)<ringD+C*5),all=wodOpsStrength(M,false);
            const headS=wodOpsStrength(head,false);
            const formed=!TU.strict?headS>=Math.min(all*.7,j.need)||st.formAt&&now-st.formAt>12000&&headS>=Math.min(all*.5,j.need*.8):headS>=j.need*.95||headS>=all*.9&&headS>=j.need*.8;
            const atRing=M.some(u=>dist(u,aimAt)<ringD+C*.5);
            if(atRing&&!st.formAt)st.formAt=now;
            // waited at his doorstep long enough for the rest: go back and gather properly
            if(!!TU.strict&&st.formAt&&now-st.formAt>30000&&!formed&&!contact){st.phase='gather';st.since=now;st.rally=null;st.formAt=0;st.launched=false;M.forEach(u=>{claim(u,'muster');fallBack(u,homeTown(mc));});continue;}
            const touching=M.filter(u=>anyNear(E,u,C*3.2));
            if(wodOpsStrength(touching,false)>=all*.4||atRing&&formed||j.raid&&contact){st.phase='fight';st.since=now;st.own0=Math.max(own,.1);st.opp0=opp;}
            else if(atRing||touching.length){
                // the head of the column waits (or gives ground) while the rest closes up
                M.forEach((u,i)=>{claim(u,'form');
                    const hot=hotOf(u);
                    if(hot.length){if(wodOpsStrength(hot,true)>wodOpsStrength(near(M,u,C*4.5),true)*1.1)fallBack(u,mc);else engage(u,hot,i);return;}
                    // the head has met the enemy short of the ring: the rest closes up on it, not on the objective
                    const to=touching.length&&!TU.noGuns?wodOpsCentroid(touching):aimAt;
                    if(to===aimAt&&dist(u,aimAt)<ringD+C*1.5||to!==aimAt&&dist(u,to)<C*3){wodOpsHalt(u);return;}
                    const s=wodOpsSlot(i,hr*.9);wodOpsMove(u,to.x+s.x,to.y+s.y,false);});
                continue;
            }
            else{
                let goal=P;
                if(st.via){if(dist(mc,st.via)<C*4)st.via=null;else goal=st.via;}
                // The column is the body that will do the fighting: its head waits for its tail, but nobody
                // waits for recruits still leaving a town half a map away.
                const order=M.slice().sort((a,b)=>dist(a,goal)-dist(b,goal));let tail=0,acc=[];
                for(const u of order){acc.push(u);tail=dist(u,goal);if(wodOpsStrength(acc,false)>=Math.min(all*.9,j.need*1.15))break;}
                M.forEach((u,i)=>{claim(u,'march');
                    if(!j.raid&&alone(u,M)){fallBack(u,mc);return;}
                    if(!j.raid&&M.length>2&&dist(u,goal)<tail-C*6){wodOpsHalt(u);return;} // wait for the column
                    const s=wodOpsSlot(i,hr*(TU.wide&&!j.raid?1.5:.9));wodOpsMove(u,goal.x+s.x,goal.y+s.y,false);});
                continue;
            }
        }
        // fight: out of contact it can still be called off cheaply. In contact a field battle is fought out
        // unless it is hopeless, but an assault on a town that is not clearly winning is broken off.
        if(j.raid){
            const inTown=near(E,P,C*5.5);
            const storm=!inTown.length||wodOpsStrength(M,true)>=wodOpsStrength(inTown,true)*1.35;
            if(!storm){
                // Blockade: stand where the town counts as besieged but its defenders cannot reach us, on the
                // best cover going (an empty street of the town itself if there is one). Driven off, come back.
                const pressed=near(E,mc,C*4);
                if(wodOpsStrength(pressed,true)>wodOpsStrength(M,true)*1.05&&M.some(u=>u._combatEngaged)){recall('driven off');continue;}
                if(!st.blockade){st.blockade=now;wodAiRecord(owner,'ops-blockade',{target:j.city.id,strength:r1(wodOpsStrength(M,false))});}
                const urban=getCityUrbanTerrainHexes(j.city).filter(h=>!isWaterHex(h)),cells=[],usedCells=new Set();
                for(const p of getHexesInRadius(j.city.q,j.city.r,7)){const h=wodHexAt(p.q,p.r);if(h&&(!isWaterHex(h)||isBridgeHex(h))&&h.type!=='mountain')cells.push(h);}
                M.forEach(u=>{
                    claim(u,'blockade');
                    const reach=((u.range||50)+hr*.5)*.9;let best=null,bs=Infinity;
                    for(const h of cells){
                        if(usedCells.has(h)||!canUnitEnterHex(u,h))continue;
                        let dU=Infinity;for(const s of urban){const d=dist(s,h);if(d<dU)dU=d;}
                        if(dU>reach)continue;
                        if(E.some(e=>dist(e,h)<(e.range||50)+hr*1.2))continue;
                        const s=getTerrainDefenseModifier(u,h)+dist(h,u)/(C*14);
                        if(s<bs){bs=s;best=h;}
                    }
                    if(best){usedCells.add(best);if(dist(u,best)>hr*.7)wodOpsMove(u,best.x,best.y,true);else wodOpsHalt(u);}
                    else{const d=dist(u,P)||1,k=C*6.5/d;wodOpsMove(u,P.x+(u.x-P.x)*k,P.y+(u.y-P.y)*k,true);} // no safe spot: stand off and wait
                });
                continue;
            }
        }
        // How long to stay in a losing fight depends on where it is: at home the wounded are back in a moment
        // and it is fought to the end; under the enemy's towns his are, and it is broken off early.
        const hMine=Math.min(dHome(mc),...myHospitals.map(h=>dist(h,mc))),hTheirs=enemyTowns.length?Math.min(...enemyTowns.map(t=>dist(t,mc))):hMine;
        const away=Math.max(0,Math.min(1,(hMine/Math.max(1,hMine+hTheirs)-.3)/.4));
        // A fight that is being won is fought on whatever the odds say: what counts is who is melting faster.
        const winning=st.own0?(own/st.own0)/Math.max(.05,opp/st.opp0)>1.05:false;
        const floor=j.kind==='take'&&dist(mc,P)<C*12?(winning?TU.floorWin??.6:TU.floorTake??1):winning?.45:.45+.3*away; // met in the open on the way there, it is a field battle
        // The moment nobody is left in the streets the town can be taken by walking through it: the troops
        // nearest it do that at once while the rest keep the enemy off them.
        const walkers=new Set();
        if(j.kind==='take'&&!anyNear(E,P,C*4.2)){
            const byD=M.filter(u=>!u.isGeneral&&dist(u,P)<C*10).sort((a,b)=>dist(a,P)-dist(b,P));
            for(const u of byD.slice(0,Math.max(2,Math.ceil(M.length/3))))walkers.add(u);
        }
        if(!contact&&st.ratio<Math.max(.7,floor)||contact&&st.ratio<floor&&now-st.since>(j.kind==='take'?TU.grace??12000:10000)){recall(contact?'beaten':'outnumbered');continue;}
        if(TU.wings!==0&&!j.raid&&!st.wings&&M.length>=5&&st.ratio>=1.15&&now-(st.wingAt||0)>30000){
            st.wingAt=now;st.wings=planWings(j,M,E,P);
            if(st.wings){S.counts.flank++;wodAiRecord(owner,'ops-flank',{target:j.city?.id||j.key,wings:Object.keys(st.wings.list).length});}
        }
        const starving=E.filter(e=>(e.outOfSupplySeconds||0)>0||(e.supplyPendingSeconds||0)>.5);
        if(starving.length&&!(st.pocketAt>now-60000)){st.pocketAt=now;S.counts.pocket++;wodAiRecord(owner,'ops-pocket',{enemy:starving[0].uid,group:starving.length,by:'wings'});}
        // while a fight is being won the wounded stay in the line: finishing it is worth more than their health
        const stand=TU.stand!==0&&(winning||st.ratio>=1.25||starving.length>0)&&(TU.standFar||hMine<C*14);
        const inFight=TU.noGuns?[]:M.filter(u=>anyNear(E,u,C*3.2)),guns=inFight.length&&dist(wodOpsCentroid(inFight),P)>C*6?wodOpsCentroid(inFight):null;
        M.forEach((u,i)=>{
            claim(u,role);
            if(u.isGeneral&&u.hp<u.maxHp*.55){fallBack(u);return;}
            if(!j.raid&&dist(u,mc)>C*8&&alone(u,M)){fallBack(u,mc);return;} // still on the road to the fight
            // Bad ground: a unit that has ended up where the enemy near it clearly outweighs the friends near
            // it steps back to the body instead of being shot to pieces on its own.
            if(!TU.noLocal&&!j.raid&&!stand&&M.length>=4&&dist(u,mc)>C*3){const hot=near(foes,u,C*4.5);if(hot.length>=2&&wodOpsStrength(hot,true)>wodOpsStrength(near(M,u,C*5),true)*1.7){u._opsRole='regroup';fallBack(u,mc);return;}}
            // Rotation. Fire wears morale down: at forty a unit shoots at half strength and is a step from
            // running, and troops that run die. It steps back out of reach, recovers in a quarter of a minute
            // and comes forward again, while fresher troops hold the line.
            if(!TU.noRest&&!u.isGeneral){
                const m=(u.morale??100)/(u.maxMorale||100);
                if(u._opsRest&&(m>=.72||now-u._opsRest>30000))u._opsRest=0;
                else if(!u._opsRest&&m<(TU.restAt??.42)&&anyNear(E,u,C*3.2)&&M.length>=4)u._opsRest=now;
                if(u._opsRest){
                    const home=homeTown(u),dh=dist(home,u)||1,near1=near(E,u,C*4.6);
                    u._opsRole='rest';
                    if(near1.length){const k=Math.min(1,C*5/dh);fallBack(u,{x:u.x+(home.x-u.x)*k,y:u.y+(home.y-u.y)*k});}
                    else wodOpsHalt(u);
                    return;
                }
            }
            if(stand)u._opsStand=now+5000;
            const w=st.wings?.list[u.uid];
            if(w&&!walkers.has(u)){
                u._opsRole='flank';
                if(!w.done){
                    const pts=w.pts.map(k=>gameData.hexes[k]).filter(Boolean),end=pts[pts.length-1],hotW=near(E,u,C*2.7);
                    if(!end||dist(u,end)<C*1.8)w.done=now;
                    else if(hotW.length){engage(u,hotW,i,false);return;} // caught on the way round: fight where it stands
                    else{while(w.i<pts.length-1&&dist(u,pts[w.i])<C*1.7)w.i++;wodOpsRoute(u,pts.slice(w.i),j.key+':w'+w.i);return;}
                }
            }
            if(walkers.has(u)&&!anyNear(E,u,C*2.4)){
                u._opsSweep=true;
                if(dist(u,P)>C*5||!u.target&&!u.orderTarget){const s=wodOpsSlot(i,hr*.8);wodOpsMove(u,P.x+s.x,P.y+s.y,false);}
                return;
            }
            const local=near(E,u,C*11);
            if(local.length){
                let foe=null,bs=Infinity;for(const e of local){const s=dist(e,u);if(s<bs){bs=s;foe=e;}}
                engage(u,local,i,!!dug&&dug.has(foe));return;
            }
            // Part of the force is fighting somewhere short of the objective: everyone else goes there, not on
            // toward the objective by a road of his own.
            if(guns&&dist(u,guns)>C*4){const s=wodOpsSlot(i,hr*.9);wodOpsMove(u,guns.x+s.x,guns.y+s.y,false);return;}
            if(j.kind==='take'){
                // nothing left to shoot at: walk the streets until the town changes hands
                if(dist(u,P)<C*6.5){u._opsSweep=true;if(!u.target&&!u.orderTarget){const s=wodOpsSlot(i,hr*.8);wodOpsMove(u,P.x+s.x,P.y+s.y,false);}}
                else{const s=wodOpsSlot(i,hr*.8);wodOpsMove(u,P.x+s.x,P.y+s.y,false);}
            }else{const s=wodOpsSlot(i,hr*.9);wodOpsMove(u,P.x+s.x,P.y+s.y,false);}
        });
    }
    if(pushing)S.lastPush=now;
    for(const k of Object.keys(S.ts))if(now-S.ts[k].seen>60000&&!(S.ts[k].coolUntil>now)&&!(S.ts[k].raidCool>now))delete S.ts[k];
    for(const c of myTowns)if(S.owned&&!S.owned.has(c.id)){S.counts.taken++;S.lastPush=now;S.reliefK=Math.max(.45,(S.reliefK??.8)-.15);wodAiRecord(owner,'ops-captured',{city:c.id});}
    S.owned=new Set(myTowns.map(c=>c.id));

    // ---------- 5. a town with enemies at its gates and no battle to join: the troops nearby stand in its streets
    const battles=runs.filter(j=>S.ts[j.key].phase==='advance'||S.ts[j.key].phase==='fight');
    for(const u of [...pool]){
        if(u.isGeneral)continue;
        let c=null,bd=C*16;for(const t of myTowns){if(danger.get(t)<1.2)continue;const d=dist(u,t);if(d<bd&&canReach(u,t)){bd=d;c=t;}}
        if(!c||battles.some(j=>dist(S.ts[j.key].at,u)<C*20))continue;
        pool.delete(u);guards.get(c).push(u);
    }
    for(const [c,list] of guards){
        if(!list.length)continue;
        const streets=getCityUrbanTerrainHexes(c).filter(h=>canUnitEnterHex(list[0],h)&&!isWaterHex(h));
        const centre=wodHexAt(c.q,c.r);if(centre&&!streets.includes(centre))streets.unshift(centre);
        const raiders=near(foes,c,C*7);
        const used=new Set();
        let onWork=null,workAt=null;
        if(!TU.noWorks&&raiders.length&&list.length>1){let bd=Infinity;for(const w of works){if(dist(w,c)>=C*4)continue;const dd=Math.min(...raiders.map(e=>dist(e,w)));if(dd<bd){bd=dd;workAt=w;}}
            if(workAt){let gd=Infinity;for(const g of list){const dd=dist(g,workAt);if(dd<gd){gd=dd;onWork=g;}}}}
        list.forEach(g=>{
            claim(g,'guard');
            if(g===onWork){g._opsStand=now+5000;if(dist(g,workAt)>hr*.8)wodOpsMove(g,workAt.x,workAt.y,true);else wodOpsHalt(g);return;}
            let post=null,bs=Infinity;
            for(const h of streets){
                if(used.has(h))continue;
                // stand in the streets nearest the attackers; with no attackers, in the centre
                let s=raiders.length?Math.min(...raiders.map(e=>dist(e,h))):dist(h,c);
                if(raiders.length&&s<(g.range||50)*.6)s+=C*2; // not nose to nose
                s+=dist(h,g)*.15;
                if(s<bs){bs=s;post=h;}
            }
            post=post||centre||c;used.add(post);
            if(dist(g,post)>hr*.8)wodOpsMove(g,post.x,post.y,true);else wodOpsHalt(g);
        });
    }

    // ---------- 6. the reserve waits in cover at the front; a share of it walks into empty enemy land
    const rest=[...pool];
    const aim=blocked?blocked.pos:(enemyTowns.slice().sort((a,b)=>dist(a,pc)-dist(b,pc))[0]||null);
    const base=aim?myTowns.slice().sort((a,b)=>dist(a,aim)-dist(b,aim))[0]:towns[0];
    if(S.post&&pocketed.filter(u=>dist(u,S.post)<C*10).length>=2){S.post=null;S.timid=now+45000;}
    let post=S.post&&now-S.post.at<60000&&S.post.aim===(aim?.id||'')&&S.post.base===base.id&&!anyNear(foes,S.post,C*6)?S.post:null;
    const bold=TU.press!==0&&!!aim&&!(S.timid>now)&&fieldStrength>=wodOpsStrength(near(foes,aim,C*14),false)*.7;
    if(!post&&rest.length){
        // The post: on the way from our nearest town to the objective, short of anything that could shoot at
        // it, and on the best cover there. Waiting at the front, not at home, is what lets the army strike at
        // once when a chance appears, and what makes the enemy come out to it.
        post={x:base.x,y:base.y,at:now,aim:aim?.id||'',base:base.id};
        if(aim){
            const dx=aim.x-base.x,dy=aim.y-base.y,d=Math.hypot(dx,dy)||1;let ax=base.x,ay=base.y;
            // An army that could not face what stands there keeps to its own ground; any other closes up to
            // the enemy, just out of his reach, where every chance he offers can be taken at once.
            for(let s=C*2;s<d*(bold?1:.62);s+=C){
                const p={x:base.x+dx*s/d,y:base.y+dy*s/d},h=wodOpsLandHex(p.x,p.y);
                if(!h)continue;
                if((!bold||TU.shallow)&&!friendlyCell(h)||!canReach(rest[0],h)||anyNear(foes,p,C*(bold?8:9))||dist(p,aim)<C*(bold?8.5:11))break;
                ax=p.x;ay=p.y;
            }
            let bs=Infinity;
            for(let dq=-2;dq<=2;dq++)for(let dr=-2;dr<=2;dr++){
                const h=wodOpsLandHex(ax+dq*C,ay+dr*C);
                if(!h||(!bold||TU.shallow)&&!friendlyCell(h)||!canUnitEnterHex(rest[0],h)||!canReach(rest[0],h)||anyNear(foes,h,C*7))continue;
                const s=getTerrainDefenseModifier(rest[0],h)+(Math.abs(dq)+Math.abs(dr))*.04;if(s<bs){bs=s;post.x=h.x;post.y=h.y;}
            }
        }
        S.post=post;
    }
    // A field hospital at the forward post. Without one, every wounded attacker walks all the way home while
    // the defenders are refilled next door, and an offensive melts away in a minute however strong it began.
    S.wantHospital=false;
    if(post&&S.econReady&&fighters.length>=6&&dist(post,base)>C*10&&!anyNear(foes,post,C*7)){
        const have=(gameData.hospitals||[]).filter(h=>wodEffectiveHospitalOwner(h)===owner).concat((gameData.constructionJobs||[]).filter(j=>j.owner===owner&&j.mode==='hospital'));
        if(!have.some(h=>dist(h,post)<C*9)&&have.length<Math.min(3,Math.max(1,Math.floor(fighters.length/8)))){
            S.wantHospital=true;
            if(wodPlayerTreasury(owner)>=WOD_PRICE_HOSPITAL){
                const d=dist(base,post)||1,bx=post.x+(base.x-post.x)/d*C*2.5,by=post.y+(base.y-post.y)/d*C*2.5;let site=null,bs=Infinity;
                for(let dq=-2;dq<=2;dq++)for(let dr=-2;dr<=2;dr++){
                    const h=wodOpsLandHex(bx+dq*C,by+dr*C);
                    if(!h||!friendlyCell(h)||wodHospitalPlacementError(h,owner)||anyNear(foes,h,C*7)||!wodCurrentSupplyComponent(h,owner).city)continue;
                    const sc=Math.abs(dq)+Math.abs(dr);if(sc<bs){bs=sc;site=h;}
                }
                if(site&&placeHospitalAtHex(site,owner)){S.wantHospital=false;wodAiRecord(owner,'ops-hospital',{site:getHexKey(site)});}
            }
        }
    }
    // A hospital behind a battle that is being fought far from any other place to heal.
    if(!TU.noForts&&S.econReady&&!S.wantHospital&&now>=(S.hospAt||0)&&wodPlayerTreasury(owner)>=WOD_PRICE_HOSPITAL+1000){
        S.hospAt=now+12000;
        const j=battles.find(j=>!j.raid&&j.members.length>=5),at=j&&S.ts[j.key].at;
        if(at){
            const have=(gameData.hospitals||[]).filter(h=>wodEffectiveHospitalOwner(h)===owner).concat((gameData.constructionJobs||[]).filter(x=>x.owner===owner&&x.mode==='hospital'));
            if(!have.some(h=>dist(h,at)<C*13)&&!myTowns.some(c=>dist(c,at)<C*11)&&have.length<Math.min(4,1+Math.floor(fighters.length/7))){
                const home=homeTown(at),d=dist(home,at)||1;let site=null,bs=Infinity;
                for(let k=5;k<=9&&!site;k+=2){
                    const bx=at.x+(home.x-at.x)/d*C*k,by=at.y+(home.y-at.y)/d*C*k;
                    for(let dq=-2;dq<=2;dq++)for(let dr=-2;dr<=2;dr++){
                        const h=wodOpsLandHex(bx+dq*C,by+dr*C);
                        if(!h||!friendlyCell(h)||wodHospitalPlacementError(h,owner)||anyNear(foes,h,C*6)||!wodCurrentSupplyComponent(h,owner).city)continue;
                        const sc=Math.abs(dq)+Math.abs(dr);if(sc<bs){bs=sc;site=h;}
                    }
                }
                if(site&&placeHospitalAtHex(site,owner)){S.counts.hospital=(S.counts.hospital||0)+1;wodAiRecord(owner,'ops-hospital',{site:getHexKey(site),reason:'siege'});}
            }
        }
    }
    // Forts. Troops inside a fort's ring take a fifth less damage and an attacker moves slowly through it. One
    // goes up where the army waits in front of the enemy (that is where it will be attacked), and one on the
    // threatened side of any town of ours that has an enemy army in front of it.
    if(!TU.noForts&&S.econReady&&now>=(S.fortAt||0)&&wodPlayerTreasury(owner)>=WOD_PRICE_FORT+(S.wantHospital?WOD_PRICE_HOSPITAL:0)+1000){
        S.fortAt=now+15000;
        const forts=(gameData.forts||[]).filter(x=>x.owner===owner).concat((gameData.constructionJobs||[]).filter(x=>x.owner===owner&&x.mode==='fort'));
        if(forts.length<myTowns.length+1){
            const sites=[];
            for(const c of myTowns)if(danger.get(c)>=2){const e=near(foes,c,C*11)[0];if(e){const d=dist(e,c)||1;sites.push({x:c.x+(e.x-c.x)/d*C*2.5,y:c.y+(e.y-c.y)/d*C*2.5});}}
            if(post&&bold&&now-post.at>30000&&near(rest,post,C*5).length>=3)sites.push(post);
            for(const p of sites){
                if(forts.some(x=>dist(x,p)<C*6))continue;
                let site=null,bs=Infinity;
                for(let dq=-2;dq<=2;dq++)for(let dr=-2;dr<=2;dr++){
                    const h=wodOpsLandHex(p.x+dq*C,p.y+dr*C);
                    if(!h||h.owner!==owner||wodFortPlacementError(h,owner)||anyNear(foes,h,C*4)||!wodCurrentSupplyComponent(h,owner).city)continue;
                    const sc=Math.abs(dq)+Math.abs(dr);if(sc<bs){bs=sc;site=h;}
                }
                if(site&&placeFortAtHex(site,owner,{suppressNotes:true})){S.counts.fort=(S.counts.fort||0)+1;wodAiRecord(owner,'ops-fort',{site:getHexKey(site)});break;}
            }
        }
    }
    // sweeping stops only while a town is in more danger than its guards can answer
    const quiet=!myTowns.some(c=>danger.get(c)>.5&&danger.get(c)>wodOpsStrength(guards.get(c)||[],true));
    S.calm=quiet&&fighters.length>=8&&fieldStrength>=wodOpsStrength(foes,false)*.8;
    const scouts=rest.filter(u=>!u.isGeneral);
    // With no battle running the army improves its position instead of standing: most of it takes ground
    // (income, supply for the next advance, and the enemy has to come out to stop it), a core holds the post.
    const stalled=!TU.noGrab&&!battles.some(j=>!j.raid);
    let sweepN=quiet&&fighters.length>=4?Math.min(scouts.length,Math.max(1,Math.round(scouts.length*Math.max(D.sweep,stalled?TU.grab??.5:0)*(TU.sweepK??1)))):0;
    if(stalled&&scouts.length>=5)sweepN=Math.min(sweepN,scouts.length-3);
    if(quiet&&!enemyTowns.length)sweepN=Math.min(scouts.length,Math.max(sweepN,Math.ceil(scouts.length*.6))); // nothing known to attack: spread out and look
    // keep the same sweepers from pulse to pulse
    scouts.sort((a,b)=>Number(!!S.sweep[b.uid])-Number(!!S.sweep[a.uid])||dHome(b)-dHome(a));
    const sweepers=scouts.slice(0,sweepN);
    const explored=wodFogActive()?wodFogFactionIntel(owner).explored:null;
    const sweepGoals=[];
    const front=aim||post||pc,segD=h=>{const vx=front.x-base.x,vy=front.y-base.y,L=vx*vx+vy*vy||1,t=Math.max(0,Math.min(1,((h.x-base.x)*vx+(h.y-base.y)*vy)/L));return Math.hypot(h.x-base.x-vx*t,h.y-base.y-vy*t);};
    let lead=null,leadGoal=null,sweepI=0;
    for(const u of sweepers){
        pool.delete(u);claim(u,'sweep');
        const second=!TU.noGrab&&sweepN>=4&&(sweepI++%2===1);
        const hot=near(foes,u,C*(TU.sweepR??5.5));
        if(hot.length){
            // bait: what chases a sweeper is led back onto the reserve (a lone unit does not wait to be caught)
            if(wodOpsStrength(hot,true)>wodOpsStrength(near(fighters,u,C*4.5),true)*.9){S.sweep[u.uid]=null;fallBack(u,post&&dist(u,post)<dHome(u)*1.5?post:null);continue;}
            engage(u,hot,0);continue;
        }
        // they go two together once there are enough of them: a wider strip, and no easy prey for a hunter
        if(second&&lead&&leadGoal&&dist(u,lead)<C*14){S.sweep[u.uid]=null;wodOpsMove(u,leadGoal.x+C*1.2,leadGoal.y+C*.7,false);continue;}
        let g=S.sweep[u.uid],gh=g&&gameData.hexes[g.key];
        if(!gh||now-g.at>70000||friendlyCell(gh)&&dist(u,gh)<C*1.5||dist(u,gh)<hr||anyNear(foes,gh,C*(TU.sweepR??5.5)))gh=null;
        if(!gh){
            let best=null,bs=0;
            const a0=(bias(u.uid)+now/1e5)*6.283;
            for(let k=0;k<12;k++)for(const r of [5,8,12]){
                const a=a0+k*.5236,p={x:u.x+Math.cos(a)*C*r,y:u.y+Math.sin(a)*C*r},h=wodOpsLandHex(p.x,p.y);
                if(!h||friendlyCell(h)||h.type==='mountain'||!canUnitEnterHex(u,h)||!canReach(u,h))continue;
                if(anyNear(foes,h,C*((TU.sweepR??5.5)+1))||anyNear(enemyTowns,h,C*((TU.sweepR??5.5)+1))||sweepGoals.some(t=>dist(t,h)<C*5))continue;
                let gain=0;
                for(let s=1;s<=r;s++){const c=wodOpsLandHex(u.x+(p.x-u.x)*s/r,u.y+(p.y-u.y)*s/r);if(!c){gain-=1.5;continue;}if(!friendlyCell(c))gain+=explored&&!explored.has(getHexKey(c))?1.6:c.owner>0&&!TU.noGrab?1.3:1;}
                const score=gain/(r+2)+bias(h.q+':'+h.r)*.08+(!TU.noRoad&&gain>0&&segD(h)<C*5?.3:0);
                if(score>bs){bs=score;best=h;}
            }
            if(best){gh=best;S.sweep[u.uid]={key:getHexKey(best),at:now};}
        }
        if(gh){sweepGoals.push(gh);wodOpsMove(u,gh.x,gh.y,false);lead=u;leadGoal=gh;}
        else{S.sweep[u.uid]=null;pool.add(u);lead=null;leadGoal=null;}
    }
    // ---------- bait: one sound unit (armour for choice: its gun outranges infantry, so he must come out or
    // be shot for nothing) goes up to the enemy and fires. When he comes out after it, it runs back onto the
    // troops waiting in cover at the post.
    let lured=[];
    if(post&&bold&&!TU.noAmbush)lured=foes.filter(e=>dist(e,post)<C*8&&!anyNear(enemyTowns,e,C*4.5));
    if(lured.length&&(S.lure||S.harassAt>now-20000)&&!(S.ambushAt>now-40000)){S.ambushAt=now;if(S.lure)S.lure.sprung=true;S.counts.ambush++;wodAiRecord(owner,'ops-ambush',{enemy:lured[0].uid,group:lured.length});}
    if(S.lure&&(now>S.lure.until||!post)){
        S.baitCool=now+(S.lure.sprung?25000:Math.min(240000,60000*(S.baitRefused=(S.baitRefused||0)+1)));if(S.lure.sprung)S.baitRefused=0;
        S.lure=null;
    }
    if(S.bait){
        const B=S.bait,b=byUid.get(B.uid);
        let foe=foeByUid.get(B.target);
        if(b&&!foe){let bd=C*9;for(const e of foes){const d=dist(e,b);if(d<bd){bd=d;foe=e;}}if(foe)B.target=foe.uid;}
        if(!b||!pool.has(b)||!post||!bold||now>B.until||B.phase==='out'&&!foe||B.phase==='back'&&dist(b,post)<C*2.5){
            if(B.phase==='out')S.baitCool=now+30000;
            S.bait=null;
        }else{
            pool.delete(b);claim(b,'bait');
            if(B.phase==='out'){
                const outranges=(b.range||50)>(foe.range||50)+4;
                if(dist(b,foe)<=(b.range||50)&&!B.fireAt)B.fireAt=now;
                const turn=b.hp<b.maxHp*.72||B.fireAt&&now-B.fireAt>(outranges?45000:12000)||outranges&&foes.some(e=>dist(e,b)<(e.range||50)+hr);
                if(turn){B.phase='back';B.until=now+30000;S.lure={until:now+25000,sprung:false};}
                else engage(b,[foe],0,true);
            }
            if(B.phase==='back'){
                wodOpsMove(b,post.x,post.y,false);
                hurry(b); // keeps most of its pace under fire
            }
        }
    }else if(TU.bait!==0&&!S.lure&&post&&bold&&aim&&now>=(S.baitCool||0)&&!pushing){
        const waiting=near([...pool],post,C*5).filter(u=>!u.isGeneral);
        if(wodOpsStrength(waiting,true)>=2.6&&!waiting.some(u=>(u.range||50)>54)){
            let foe=null,bd=C*14;for(const e of foes){const d=dist(e,post);if(d<bd){bd=d;foe=e;}}
            let b=null,bs=-Infinity;
            if(foe)for(const u of waiting){if(u.hp<u.maxHp*.85)continue;const sc=((u.range||50)>(foe.range||50)+4?2:0)+u.hp/u.maxHp+(u.speed||15)/30;if(sc>bs){bs=sc;b=u;}}
            if(b){S.bait={uid:b.uid,target:foe.uid,phase:'out',at:now,until:now+70000};S.counts.bait++;wodAiRecord(owner,'ops-bait',{unit:b.uid,enemy:foe.uid});}
        }
    }
    const reserve=[...pool];
    const waitingS=post?wodOpsStrength(near(reserve,post,C*6),true):0;
    reserve.forEach((u,i)=>{
        claim(u,'reserve');
        const hot=near(foes,u,C*4.2);
        if(hot.length){
            if(wodOpsStrength(hot,true)>wodOpsStrength(near(elig,u,C*4.5),true)*1.2)fallBack(u);else defend(u,hot,i);
            return;
        }
        // the trap: whatever has followed the bait out of its town is set upon by everyone at the post
        if(lured.length&&post&&dist(u,post)<C*10&&wodOpsStrength(lured,false)<=wodOpsStrength(near(reserve,post,C*10),false)*1.15){u._opsRole='ambush';engage(u,lured,i,false);return;}
        // Armour and motor troops outrange infantry. From the limit of their guns they shoot at a town or a
        // line that cannot answer, and a town under fire neither recruits nor heals: he comes out or he bleeds.
        if(TU.harass!==0&&bold&&post&&!u.isGeneral&&(u.range||50)>54&&u.hp>=u.maxHp*.7&&dist(u,post)<C*14&&waitingS>=2.6){
            let tgt=null,bd=C*13;for(const e of foes){if((u.range||50)<=(e.range||50)+4)continue;const d=dist(e,post);if(d<bd){bd=d;tgt=e;}}
            if(tgt&&!foes.some(e=>(e.range||50)+4>=(u.range||50)&&dist(e,tgt)<C*3.5)){u._opsRole='harass';S.harassAt=now;engage(u,[tgt],i,true);return;}
        }
        // an army in a battle is not left to fight alone: unassigned troops close up behind it
        let b=null,bd=C*28;for(const j of battles){if(j.raid)continue;const at=S.ts[j.key].at,d=dist(u,at);if(d<bd&&canReach(u,at)){bd=d;b=at;}}
        if(b){const s=wodOpsSlot(i+1,hr*1.3);u._opsRole='support';wodOpsMove(u,b.x+s.x,b.y+s.y,false);return;}
        if(!post||!canReach(u,post)){wodOpsHalt(u);return;}
        const h=standAt(u,post);wodOpsMove(u,h.x,h.y,true);
    });

    // with no enemy ground in walking reach the war is at sea, and the original buyer knows ships and ferries
    wodOpsWarEconomy(owner,S,units,myTowns,now);

    // ---------- watchdog: a commanded unit that has an order and is not moving gets it cleared and reissued
    for(const u of elig){
        if(!(u._opsUntil>now))continue;
        const w=u._opsWatch;
        if(!w||dist(w,u)>hr*1.6||u._combatEngaged||!u.target){u._opsWatch={x:u.x,y:u.y,at:now};continue;}
        if(now-w.at>9000){
            const g=u.orderTarget||u.target.finalTarget||u.target;
            if(g&&dist(g,u)>hr*4){u.target=null;u.path=null;u.orderTarget=null;u.fullMarchWaypoints=null;u.marchWpCursor=0;u.holding=false;u.stuckTimer=0;u.blockedTimer=0;u._opsRoute=null;u._wodAttackOrder=null;
                u._wodAiFriendBlockT=Math.max(u._wodAiFriendBlockT||0,6);snapUnitApartFromNeighbors(u);}
            u._opsWatch={x:u.x,y:u.y,at:now};
        }
    }
    const roles={};for(const u of elig)if(u._opsUntil>now)roles[u._opsRole]=(roles[u._opsRole]||0)+1;
    S.status={doctrine:D.name,edge:Math.round(edge*100)/100,field:r1(fieldStrength),foes:r1(wodOpsStrength(foes,false)),
        jobs:runs.map(j=>(j.raid?'r':j.kind[0])+':'+(j.city?.id||j.key.slice(7))+' '+S.ts[j.key].phase+' '+j.members.length+'u need'+r1(j.need)+' r'+r1(S.ts[j.key].ratio||0)),
        blocked:blocked?(blocked.city.id+' need'+r1(blocked.need)):null,roles,counts:S.counts};
}
