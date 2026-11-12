'use strict';
// Field command for AI land armies.
//
// One commander per AI faction decides, every strategy pulse, what each land unit is for. It replaces the
// stack of cautious planners in ai-command.js for everything that walks; those planners keep the opening
// build order, the navy, ferries, the wounded and troops that are cut off.
//
// What the commander knows about this game:
//   - A firefight is slow and a hurt unit can walk away and be refilled, so battles decide little by
//     themselves. What they cost is manpower: every point of damage has to be bought back.
//   - A town falls when no defender is left standing in its streets, and a town is half an economy.
//   - Troops in a town take half damage, so storming one at even odds is the worst trade there is.
//   - The side fighting nearer its own towns and hospitals gets its wounded back first.
//   - A unit whose land link to a friendly town is cut dies in under a minute.
//
// So, every pulse:
//   1. Each town keeps a guard in its streets (a living defender blocks capture). Enemies at its walls
//      bring defenders in proportion, from wherever they are: that is not a question of odds.
//   2. Everything the enemy shows becomes a job with a price in fighting strength:
//        strike  an enemy group in the field or in our land, cheaper to accept near our own towns;
//        take    a town, stormed with everything: when the enemy's field army is beaten or shut up inside
//                it, or when we outweigh the town and that army together;
//        raid    a town held by little more than its guard, when a small party can be there well before
//                any relief: it goes round the enemy, and if it cannot beat the garrison it blockades
//                (one hostile unit within reach of a town's streets stops its recruiting and healing);
//        cut     a column that has pushed into our land and hangs on the strip it painted behind it.
//   3. The best battle that can be paid for is the main effort and takes everyone in reach; while there is
//      one, a raid gets only a small share of the army. A job that cannot be paid for is not started.
//   4. What is left waits in cover at a forward post with its own field hospital, or stands in the streets
//      of a town under pressure; a share of it walks into undefended enemy land (income, sight, and bait).
//   5. Troops on a job gather where most of them already are, march as one body (nobody waits for recruits
//      a map away), form up short of the objective and fight from cover; the wounded and the running are
//      pursued, and the moment a town's streets are empty the nearest troops walk in. An attack is called
//      off before contact if the enemy proves stronger. In contact a battle near home is fought out; under
//      the enemy's towns, or against a town at even odds, it is broken off. Failures are remembered: the
//      commander then asks for better odds, and costly failures count double.
//
// Each commander draws a doctrine at the start of a match (how big an edge it wants, how much it raids and
// hunts, how patient it is, which flank it likes), so two matches do not play alike.
//
// Safety: commanded units carry a six-second lease (_opsUntil) renewed every pulse. If this code throws, the
// lease lapses and the original planners take every unit back. WOD_OPS.enabled=false switches it off.
const WOD_OPS={enabled:true,owners:null,error:null};
const WOD_OPS_DOCTRINES=[
    {name:'blitz',ratio:1.14,sweep:.2,raid:1.3,hunt:.9,patience:70},
    {name:'methodical',ratio:1.28,sweep:.22,raid:.9,hunt:1.15,patience:140},
    {name:'raider',ratio:1.2,sweep:.34,raid:1.8,hunt:.9,patience:100},
    {name:'hunter',ratio:1.2,sweep:.14,raid:1,hunt:1.6,patience:110}
];
// Authored missions (timed defences, evacuations, landings) were balanced against the original planners and
// keep them; skirmish, multiplayer and campaign battles use the field command. WOD_OPS.missions=true lifts that.
function wodOpsActive(owner){return WOD_OPS.enabled&&(!WOD_OPS.owners||WOD_OPS.owners.has(owner))&&!wodMpIsHumanOwner(owner)&&!wodCampaignDeployActive()&&(!gameData.mission||WOD_OPS.missions);}
function wodOpsDps(u){return (u.damage||0)/(u.attackCooldown||2);}
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
function wodOpsCutPlan(group,sources,foes,hr){
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
        const ring=rings[d];if(!ring||!ring.length||ring.length>7)continue;
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
    return {doctrine,born:now,lastPush:now,ts:{},strikes:[],garrison:{},sweep:{},failed:{},cuts:[],counts:{launch:0,raid:0,recall:0,cut:0,pocket:0,taken:0}};
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
    if(!S.econReady)return;
    const isUnit=m=>['light','motorized','mountaineer','marine','heavy','ship','transport','supply'].includes(m);
    const pending=(gameData.constructionJobs||[]).filter(j=>j.owner===owner);
    const spare=()=>getOwnerIncome(owner)-getOwnerExpenses(owner)-pending.reduce((n,j)=>n+(isUnit(j.mode)?getUnitUpkeep({type:j.mode}):0),0);
    const cash=()=>gameData.aiMoneyByOwner[owner]||0,mp=()=>gameData.aiManpowerByOwner[owner]||0;
    const free=myTowns.filter(c=>!wodCityProductionJob(c)&&!isCitySiegeBlockedForProduction(c)&&!isCityEncircledForProduction(c));
    let wounded=0;for(const u of units)if(u.hp>0&&u.hp<u.maxHp*.9&&!wodIsNavalUnit(u))wounded+=(1-u.hp/u.maxHp)*(u.maxManpower||1000);
    const heavy=getUnitCost('heavy'),light=getUnitCost('light');
    // armour: only with money that would otherwise lie idle
    const works=myTowns.filter(c=>c.hasFactory&&!isCitySiegeBlockedForProduction(c)&&!isCityEncircledForProduction(c));
    if(works.length&&cash()>=heavy.money&&spare()>=getUnitUpkeep({type:'heavy'})+3){
        if(mp()<heavy.manpower){S.saveMp=true;return;}
        const site=works.find(c=>!wodCityProductionJob(c)&&cityEligibleForBuildPlacementForOwner(c,'heavy',owner));
        if(site&&wodApplyBuildAtCityForOwner(site,'heavy',owner)){wodAiRecord(owner,'recruit',{city:site.id,type:'heavy',reason:'war-economy'});return;}
        if(!site)return; // factory busy: keep the money for it
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
    const root=gameData._aiOps&&gameData._aiOps.hexes===gameData.hexes?gameData._aiOps:(gameData._aiOps={hexes:gameData.hexes,by:{}});
    const S=root.by[owner]||(root.by[owner]=wodOpsNewState(owner,now));
    if(S.disabledUntil>now)return;
    const D=S.doctrine;
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
    const elig=[];
    for(const u of units){
        if(!(u.hp>0)||!isLandArmyUnit(u)||u.boardTransportUid||u._medicalRecovering||u._medicalEvacuating||u.moraleBroken||u._navalEvacuating||u._navalLanded||u._navalAssaultUntil>now){u._opsUntil=0;continue;}
        // cut off: the supply-escape logic of the original planners acts at once
        if((u.outOfSupplySeconds||0)>2||(u.supplyPendingSeconds||0)>1.2){u._opsUntil=0;continue;}
        if(!wodOpsLandHex(u.x,u.y))continue;
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
    if(!fighters.length){S.saveMp=false;return;}
    S.landWarAt=now;
    const canReach=(u,p)=>{const h=p.q!=null&&p.r!=null&&!p.uid?p:wodOpsLandHex(p.x,p.y);return !!h&&reachOf(u).has(h.q+','+h.r);};
    const seen=wodAiKnownEntities(owner).filter(u=>u.hp>0&&wodIsHostileOwner(u.owner,owner)&&u.type!=='convoy'&&!u.boardTransportUid);
    const foes=seen.filter(u=>!wodIsNavalUnit(u)&&wodOpsLandHex(u.x,u.y));
    const ghosts=wodFogActive()?wodAiThreats(owner,true).filter(u=>u._intelMemory&&!wodIsNavalUnit(u)):[];
    const enemyTowns=wodAiKnownCities(owner).filter(c=>c.owner!==owner&&c.owner>0&&wodIsHostileOwner(c.owner,owner));
    const claim=(u,role)=>{u._opsUntil=now+6000;u._opsRole=role;u._opsSweep=false;if(u._needsTransport)u._needsTransport=false;};
    const pool=new Set(fighters);
    const byUid=new Map(elig.map(u=>[u.uid,u]));
    const taken=[]; // firing positions handed out this pulse
    // Best covered firing position against a target: inside range, on our side of it, not on top of a comrade.
    const firePos=(u,foe,k)=>{
        // armour stands off at the limit of its longer gun, where infantry cannot answer
        const range=(u.range||50),reach=range*(range>(foe.range||50)+4?.93:.82),d=dist(u,foe)||1,base=Math.atan2(u.y-foe.y,u.x-foe.x);
        let best=null,bs=Infinity;
        const tryAt=(p,extra)=>{
            const h=wodOpsLandHex(p.x,p.y);if(!h||!canUnitEnterHex(u,h))return;
            let s=getTerrainDefenseModifier(u,h)+extra+dist(p,u)/(hr*40);
            if(taken.some(t=>Math.abs(t.x-p.x)<hr*.9&&Math.abs(t.y-p.y)<hr*.9))s+=.35;
            if(s<bs){bs=s;best=p;}
        };
        if(d<=range*.93)tryAt({x:u.x,y:u.y},-.12); // staying put is worth a little: moving under fire is slow
        const turn=((k||0)%2?1:-1);
        for(const off of [0,.4,-.4,.8,-.8,1.2,-1.2,1.7,-1.7,2.3,-2.3,3])tryAt({x:foe.x+Math.cos(base+off*turn)*reach,y:foe.y+Math.sin(base+off*turn)*reach},Math.abs(off)*.1);
        if(bs>1.2)for(const off of [.2,-.2,.6,-.6,1,-1,1.5,-1.5])tryAt({x:foe.x+Math.cos(base+off*turn)*reach*.62,y:foe.y+Math.sin(base+off*turn)*reach*.62},.08+Math.abs(off)*.1);
        if(!best)best={x:foe.x+(u.x-foe.x)*reach/d,y:foe.y+(u.y-foe.y)*reach/d};
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
        if(!outranges&&(!dugIn||foe.retreating||foe.hp<(foe.maxHp||100)*.45&&dist(foe,u)>(u.range||50)*.9)){chase(u,foe);return true;}
        const p=firePos(u,foe,k);
        if(dist(p,u)<hr*.6)wodOpsHalt(u);else wodOpsMove(u,p.x,p.y,false);
        return true;
    };
    const fallBack=(u,to)=>{
        const t=to||homeTown(u);
        if(dist(u,t)<C*2.2){wodOpsHalt(u);return;}
        wodOpsMove(u,t.x,t.y,false);
        // only the badly hurt take the engine's retreat state (it also books them into hospital)
        if(u.hp<u.maxHp*.6&&u._combatEngaged)u.retreating=true;
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
        return wodOpsStrength(here,false)*(1-cover)+wodOpsStrength(here,true)*cover+(siege?1:.9)*wodOpsStrength(mid,false)+(siege?.85:.5)*wodOpsStrength(far,false)+(siege?.35:.1)*wodOpsStrength(rest,false);
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
        const want=Math.max(1,Math.min(Math.max(d<1.5?1:d<5?2:3,Math.ceil(atWalls*.75)),fighters.length-myTowns.length+1));
        // a town under real attack is relieved from anywhere: a town is worth more than any field battle
        while(list.length<want){const g=takeNearest(c,list.length&&d<1.5?C*16:Infinity,!list.length);if(!g)break;list.push(g);}
        while(list.length>want)pool.add(list.pop()); // the first guard stays, the rest return to the field
        S.garrison[c.id]=list.map(u=>u.uid);
    }
    if(general)pool.add(general);

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
        if(!op.closedAt&&cells.some(h=>foes.some(e=>Math.abs(e.x-h.x)<span&&Math.abs(e.y-h.y)<span))&&age>6000)return false; // ring is now defended
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
    const edge=Math.max(1.02,D.ratio+Math.min(.36,S.recalls.length*.09)-Math.max(0,idle-D.patience)/60*.06);
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
        const intruding=g.home<C*11||g.inMine>=.5;
        // a column that has pushed into our land hangs on the strip it painted behind it: cut that first
        if(g.inMine>=.3&&!g.units.some(e=>cutHandled.has(e.uid))&&S.cuts.length<Math.max(1,Math.ceil(fighters.length/4))){
            const plan=wodOpsCutPlan(g.units,sourcesFor(g.units[0].owner),foes,hr);
            if(plan.state==='cut'&&plan.d<=8){
                const cells=plan.cells.filter(h=>!friendlyCell(h));
                const want=cells.length>4&&pool.size>3?2:1,cutters=[];
                for(let k=0;k<want&&cells.length;k++){
                    let best=null,bd=C*10; // a ring too far away is closed long after the enemy has moved on
                    for(const u of pool){if(u.isGeneral||cells.some(h=>!canUnitEnterHex(u,h)))continue;const d=Math.min(...cells.map(h=>dist(h,u)));if(d<bd){bd=d;best=u;}}
                    if(!best)break;
                    pool.delete(best);cutters.push(best);
                }
                if(cutters.length){
                    const op={id:'cut-'+g.units[0].uid+'-'+Math.round(now),at:now,enemies:g.units.map(e=>e.uid),cells:cells.map(getHexKey),cutters:cutters.map(u=>u.uid),routes:{}};
                    cutters.forEach((u,k)=>{
                        claim(u,'cut');
                        const left=cells.slice(),order=[];let at={x:u.x,y:u.y};
                        if(k===1){let f=left[0];for(const h of left)if(dist(h,u)>dist(f,u))f=h;at=f;}
                        while(left.length){let bi=0;for(let i=1;i<left.length;i++)if(dist(left[i],at)<dist(left[bi],at))bi=i;at=left.splice(bi,1)[0];order.push(at);}
                        op.routes[u.uid]=order.map(getHexKey);wodOpsRoute(u,order,op.id+':'+order.length);
                    });
                    S.cuts.push(op);S.counts.cut++;
                    wodAiRecord(owner,'ops-cut',{enemy:g.units[0].uid,group:g.units.length,ring:cells.length,depth:plan.d,cutters:cutters.length});
                    for(const e of g.units)cutHandled.add(e.uid);
                }
            }
        }
        let alone=true;for(const o of groups)if(o!==g&&dist(o.c,g.c)<C*9){alone=false;break;}
        if(alone&&enemyTowns.some(t=>dist(t,g.c)<C*9))alone=false;
        const home=homeTown(g.c),helpers=g.home<C*8?(guards.get(home)||[]):[];
        const pocketed=g.units.some(e=>(e.outOfSupplySeconds||0)>3);
        // Where the fight is matters as much as its size: the side whose wounded have the shorter walk to a
        // town or hospital gets them back into the line several times while the other side's are still walking.
        const dMine=Math.min(g.home,...myHospitals.map(h=>dist(h,g.c)));
        const dTheirs=enemyTowns.length?Math.min(...enemyTowns.map(t=>dist(t,g.c))):dMine;
        const logistics=Math.max(.82,Math.min(1.2,.8+.4*dMine/Math.max(1,dMine+dTheirs)));
        let need=oppAt(g.pos,g.units,0)*Math.max(1.02,edge-.06)*logistics-wodOpsStrength(helpers,true)*.8;
        if(pocketed)need*=.6; // they are starving: time is on our side
        need=Math.max(.6,need);
        const value=(intruding?(26+12*g.raw)*(g.home<C*8?2:1):8*g.raw*(alone?1.5:1))*D.hunt/(1+failed(key)*.5);
        jobs.push({key,kind:'strike',g,pos:g.pos,enemies:g.units,need,value,maxD:C*(intruding?34:26)});
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
        const sk='take:'+c.id,so=S.ts[sk],stormNeed=(oppAt(c,def,1,true)+.35)*edge;
        const going=!!so&&(so.phase==='advance'||so.phase==='fight')&&now-so.seen<8000;
        const together=(wodOpsStrength(here,true)+wodOpsStrength(foes.filter(e=>!def.includes(e)&&!enemyGuard.has(e)),false)+.35)*edge*1.1;
        if(going||atLarge<=fieldStrength*.3||fieldStrength>=together)
            jobs.push({key:sk,kind:'take',city:c,pos:c,enemies:def,need:stormNeed,value:worth(sk)*(fieldStrength>=together?1.5:1),maxD:Infinity,sDef});
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
        return {members,got,enough:got>=j.need*(j.active?.7:1)};
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
        const own=wodOpsStrength(front,true)+(j.kind==='strike'&&j.g.home<C*8?wodOpsStrength(guards.get(homeTown(j.g.c))||[],true)*.8:0);
        const opp=Math.max(.05,wodOpsStrength(E.concat(near(ghosts,P,C*7)),true));
        st.ratio=own/opp;st.at={x:mc.x,y:mc.y};
        const hotOf=u=>near(foes,u,C*4.2);
        const recall=why=>{
            // break off to a point a short march back toward home and gather there; not all the way to town
            const home=homeTown(mc),d=dist(home,mc)||1,k=Math.min(1,C*9/d);
            st.back={x:mc.x+(home.x-mc.x)*k,y:mc.y+(home.y-mc.y)*k};
            st.phase='fallback';st.until=now+15000;S.counts.recall++;noteFail(j.key);
            if(j.raid)st.raidCool=now+60000*Math.min(5,failed(j.key)+1);else{S.recalls.push(now);if(st.lost>=3)S.recalls.push(now);}
            st.lost=0;
            wodAiRecord(owner,'ops-recall',{target:j.city?.id||j.key,ratio:Math.round(st.ratio*100)/100,why});
            M.forEach(u=>{claim(u,'recall');fallBack(u,st.back);});
        };
        if(st.phase==='gather'){
            // Assemble where most of the force already is: the member with the shortest total walk for everyone
            // else, a little toward the objective. The point is kept until the force has gathered there.
            let rally=st.rally&&!anyNear(foes,st.rally,C*6)?st.rally:null;
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
            let go=M.length<=1||gathered>=j.need||gathered>=all*.7||waited>45000&&gathered>=all*.5||contact&&st.ratio>=1;
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
                st.phase='advance';st.since=now;
                if(!st.launched){st.launched=true;S.counts[j.raid?'raid':'launch']++;wodAiRecord(owner,'ops-'+role,{target:j.city?.id||j.key,strength:r1(all),need:r1(j.need)});}
            }else{
                M.forEach((u,i)=>{claim(u,role);const hot=hotOf(u);
                    if(hot.length){if(wodOpsStrength(hot,true)>wodOpsStrength(near(M,u,C*4.5),true)*1.25)fallBack(u,rally);else engage(u,hot,i);return;}
                    const s=wodOpsSlot(i,hr*1.1);wodOpsMove(u,rally.x+s.x,rally.y+s.y,true);});
                continue;
            }
        }
        if(st.phase==='fallback'){
            if(now>=st.until){st.phase='gather';st.since=now;st.rally=null;st.launched=false;st.coolUntil=now+20000;}
            M.forEach((u,i)=>{claim(u,'recall');const s=wodOpsSlot(i,hr*1.1);fallBack(u,{x:st.back.x+s.x,y:st.back.y+s.y});});
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
            if(!contact&&st.ratio<.85){recall('outnumbered');continue;}
            // Form up before going in: the head of the column stops short of the objective until most of the
            // force has closed up behind it. Arriving a few at a time is how a stronger army loses.
            const ringD=C*(j.kind==='take'?9.5:8),aimAt=j.kind==='take'?P:(()=>{let b=P,bd=Infinity;for(const e of j.enemies){const d=dist(e,mc);if(d<bd){bd=d;b=e;}}return b;})();
            const head=M.filter(u=>dist(u,aimAt)<ringD+C*5),all=wodOpsStrength(M,false);
            const headS=wodOpsStrength(head,false);
            const formed=headS>=Math.min(all*.8,j.need*1.2)||st.formAt&&now-st.formAt>25000&&headS>=Math.min(all*.6,j.need);
            const atRing=M.some(u=>dist(u,aimAt)<ringD+C*.5);
            if(atRing&&!st.formAt)st.formAt=now;
            const touching=M.filter(u=>anyNear(E,u,C*3.2));
            if(wodOpsStrength(touching,false)>=all*.4||atRing&&formed||j.raid&&contact){st.phase='fight';st.since=now;}
            else if(atRing||touching.length){
                // the head of the column waits (or gives ground) while the rest closes up
                M.forEach((u,i)=>{claim(u,role);
                    const hot=hotOf(u);
                    if(hot.length){if(wodOpsStrength(hot,true)>wodOpsStrength(near(M,u,C*4.5),true)*1.1)fallBack(u,mc);else engage(u,hot,i);return;}
                    if(dist(u,aimAt)<ringD+C*1.5){wodOpsHalt(u);return;}
                    const s=wodOpsSlot(i,hr*.9);wodOpsMove(u,aimAt.x+s.x,aimAt.y+s.y,false);});
                continue;
            }
            else{
                let goal=P;
                if(st.via){if(dist(mc,st.via)<C*4)st.via=null;else goal=st.via;}
                // The column is the body that will do the fighting: its head waits for its tail, but nobody
                // waits for recruits still leaving a town half a map away.
                const order=M.slice().sort((a,b)=>dist(a,goal)-dist(b,goal));let tail=0,acc=[];
                for(const u of order){acc.push(u);tail=dist(u,goal);if(wodOpsStrength(acc,false)>=Math.min(all*.9,j.need*1.15))break;}
                M.forEach((u,i)=>{claim(u,role);
                    if(!j.raid&&M.length>2&&dist(u,goal)<tail-C*6){wodOpsHalt(u);return;} // wait for the column
                    const s=wodOpsSlot(i,hr*.9);wodOpsMove(u,goal.x+s.x,goal.y+s.y,false);});
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
        const floor=j.kind==='take'&&dist(mc,P)<C*12?1:.5+.35*away; // met in the open on the way there, it is a field battle
        // The moment nobody is left in the streets the town can be taken by walking through it: the troops
        // nearest it do that at once while the rest keep the enemy off them.
        const walkers=new Set();
        if(j.kind==='take'&&!anyNear(E,P,C*4.2)){
            const byD=M.filter(u=>!u.isGeneral&&dist(u,P)<C*10).sort((a,b)=>dist(a,P)-dist(b,P));
            for(const u of byD.slice(0,Math.max(2,Math.ceil(M.length/3))))walkers.add(u);
        }
        if(!contact&&st.ratio<Math.max(.8,floor)||contact&&st.ratio<floor&&now-st.since>(j.kind==='take'?16000:8000)){recall(contact?'beaten':'outnumbered');continue;}
        M.forEach((u,i)=>{
            claim(u,role);
            if(u.isGeneral&&u.hp<u.maxHp*.55){fallBack(u);return;}
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
            if(j.kind==='take'){
                // nothing left to shoot at: walk the streets until the town changes hands
                if(dist(u,P)<C*6.5){u._opsSweep=true;if(!u.target&&!u.orderTarget){const s=wodOpsSlot(i,hr*.8);wodOpsMove(u,P.x+s.x,P.y+s.y,false);}}
                else{const s=wodOpsSlot(i,hr*.8);wodOpsMove(u,P.x+s.x,P.y+s.y,false);}
            }else{const s=wodOpsSlot(i,hr*.9);wodOpsMove(u,P.x+s.x,P.y+s.y,false);}
        });
    }
    if(pushing)S.lastPush=now;
    for(const k of Object.keys(S.ts))if(now-S.ts[k].seen>60000&&!(S.ts[k].coolUntil>now)&&!(S.ts[k].raidCool>now))delete S.ts[k];
    for(const c of myTowns)if(S.owned&&!S.owned.has(c.id)){S.counts.taken++;S.lastPush=now;wodAiRecord(owner,'ops-captured',{city:c.id});}
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
        list.forEach(g=>{
            claim(g,'guard');
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
    let post=S.post&&now-S.post.at<60000&&S.post.aim===(aim?.id||'')&&S.post.base===base.id&&!anyNear(foes,S.post,C*6)?S.post:null;
    if(!post&&rest.length){
        // As far toward the enemy as our own ground goes (never more than most of the way), short of anything
        // that could shoot at it, and on the best cover there. Waiting at the front, not at home, is what
        // lets the reserve strike at once when a chance appears.
        post={x:base.x,y:base.y,at:now,aim:aim?.id||'',base:base.id};
        if(aim){
            const dx=aim.x-base.x,dy=aim.y-base.y,d=Math.hypot(dx,dy)||1;let ax=base.x,ay=base.y;
            for(let s=C*2;s<d*.62;s+=C){
                const p={x:base.x+dx*s/d,y:base.y+dy*s/d},h=wodOpsLandHex(p.x,p.y);
                if(!h)continue;
                if(!friendlyCell(h)||!canReach(rest[0],h)||anyNear(foes,p,C*9)||dist(p,aim)<C*11)break;
                ax=p.x;ay=p.y;
            }
            let bs=Infinity;
            for(let dq=-2;dq<=2;dq++)for(let dr=-2;dr<=2;dr++){
                const h=wodOpsLandHex(ax+dq*C,ay+dr*C);
                if(!h||!friendlyCell(h)||!canUnitEnterHex(rest[0],h)||!canReach(rest[0],h)||anyNear(foes,h,C*7))continue;
                const s=getTerrainDefenseModifier(rest[0],h)+(Math.abs(dq)+Math.abs(dr))*.04;if(s<bs){bs=s;post.x=h.x;post.y=h.y;}
            }
        }
        S.post=post;
    }
    // A field hospital at the forward post. Without one, every wounded attacker walks all the way home while
    // the defenders are refilled next door, and an offensive melts away in a minute however strong it began.
    S.wantHospital=false;
    if(post&&S.econReady&&fighters.length>=8&&dist(post,base)>C*10&&!anyNear(foes,post,C*10)){
        const have=(gameData.hospitals||[]).filter(h=>wodEffectiveHospitalOwner(h)===owner).concat((gameData.constructionJobs||[]).filter(j=>j.owner===owner&&j.mode==='hospital'));
        if(!have.some(h=>dist(h,post)<C*9)&&have.length<Math.min(3,Math.max(1,Math.floor(fighters.length/8)))){
            S.wantHospital=true;
            if(wodPlayerTreasury(owner)>=WOD_PRICE_HOSPITAL){
                const d=dist(base,post)||1,bx=post.x+(base.x-post.x)/d*C*2.5,by=post.y+(base.y-post.y)/d*C*2.5;let site=null,bs=Infinity;
                for(let dq=-2;dq<=2;dq++)for(let dr=-2;dr<=2;dr++){
                    const h=wodOpsLandHex(bx+dq*C,by+dr*C);
                    if(!h||!friendlyCell(h)||wodHospitalPlacementError(h,owner)||anyNear(foes,h,C*9)||!wodCurrentSupplyComponent(h,owner).city)continue;
                    const sc=Math.abs(dq)+Math.abs(dr);if(sc<bs){bs=sc;site=h;}
                }
                if(site&&placeHospitalAtHex(site,owner)){S.wantHospital=false;wodAiRecord(owner,'ops-hospital',{site:getHexKey(site)});}
            }
        }
    }
    // sweeping stops only while a town is in more danger than its guards can answer
    const quiet=!myTowns.some(c=>danger.get(c)>.5&&danger.get(c)>wodOpsStrength(guards.get(c)||[],true));
    const scouts=rest.filter(u=>!u.isGeneral);
    let sweepN=quiet&&fighters.length>=5?Math.min(scouts.length,Math.max(1,Math.round(scouts.length*D.sweep))):0;
    if(quiet&&!enemyTowns.length)sweepN=Math.min(scouts.length,Math.max(sweepN,Math.ceil(scouts.length*.6))); // nothing known to attack: spread out and look
    // keep the same sweepers from pulse to pulse
    scouts.sort((a,b)=>Number(!!S.sweep[b.uid])-Number(!!S.sweep[a.uid])||dHome(b)-dHome(a));
    const sweepers=scouts.slice(0,sweepN);
    const explored=wodFogActive()?wodFogFactionIntel(owner).explored:null;
    const sweepGoals=[];
    for(const u of sweepers){
        pool.delete(u);claim(u,'sweep');
        const hot=near(foes,u,C*7.5);
        if(hot.length){
            // bait: what chases a sweeper is led back onto the reserve (a lone unit does not wait to be caught)
            if(wodOpsStrength(hot,true)>wodOpsStrength(near(fighters,u,C*4.5),true)*.9){S.sweep[u.uid]=null;fallBack(u,post&&dist(u,post)<dHome(u)*1.5?post:null);continue;}
            engage(u,hot,0);continue;
        }
        let g=S.sweep[u.uid],gh=g&&gameData.hexes[g.key];
        if(!gh||now-g.at>70000||friendlyCell(gh)&&dist(u,gh)<C*1.5||dist(u,gh)<hr||anyNear(foes,gh,C*7.5))gh=null;
        if(!gh){
            let best=null,bs=0;
            const a0=(bias(u.uid)+now/1e5)*6.283;
            for(let k=0;k<12;k++)for(const r of [5,8,12]){
                const a=a0+k*.5236,p={x:u.x+Math.cos(a)*C*r,y:u.y+Math.sin(a)*C*r},h=wodOpsLandHex(p.x,p.y);
                if(!h||friendlyCell(h)||h.type==='mountain'||!canUnitEnterHex(u,h)||!canReach(u,h))continue;
                if(anyNear(foes,h,C*9)||anyNear(enemyTowns,h,C*9)||sweepGoals.some(t=>dist(t,h)<C*6))continue;
                let gain=0;
                for(let s=1;s<=r;s++){const c=wodOpsLandHex(u.x+(p.x-u.x)*s/r,u.y+(p.y-u.y)*s/r);if(!c){gain-=1.5;continue;}if(!friendlyCell(c))gain+=explored&&!explored.has(getHexKey(c))?1.6:1;}
                const score=gain/(r+2)+bias(h.q+':'+h.r)*.08;
                if(score>bs){bs=score;best=h;}
            }
            if(best){gh=best;S.sweep[u.uid]={key:getHexKey(best),at:now};}
        }
        if(gh){sweepGoals.push(gh);wodOpsMove(u,gh.x,gh.y,false);}
        else{S.sweep[u.uid]=null;pool.add(u);}
    }
    const reserve=[...pool];
    reserve.forEach((u,i)=>{
        claim(u,'reserve');
        const hot=near(foes,u,C*4.2);
        if(hot.length){
            if(wodOpsStrength(hot,true)>wodOpsStrength(near(elig,u,C*4.5),true)*1.2)fallBack(u);else engage(u,hot,i);
            return;
        }
        // an army in a battle is not left to fight alone: unassigned troops close up behind it
        let b=null,bd=C*28;for(const j of battles){if(j.raid)continue;const at=S.ts[j.key].at,d=dist(u,at);if(d<bd&&canReach(u,at)){bd=d;b=at;}}
        if(b){const s=wodOpsSlot(i+1,hr*1.3);u._opsRole='support';wodOpsMove(u,b.x+s.x,b.y+s.y,false);return;}
        if(!post||!canReach(u,post)){wodOpsHalt(u);return;}
        const s=wodOpsSlot(i,hr*1.15);wodOpsMove(u,post.x+s.x,post.y+s.y,true);
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
