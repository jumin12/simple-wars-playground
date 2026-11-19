// Unit stats, generals, terrain effects on units.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

function findFrontlineCentroid(owner) {
    let x = 0, y = 0, count = 0;
    for(let hex of gameData.hexList) {
        if(!isFrontlineHex(hex, owner)) continue;
        x += hex.x;
        y += hex.y;
        count++;
    }
    return count ? {x: x / count, y: y / count} : null;
}
function wodSpendOwnerManpowerPool(owner, amount) {
    if(!amount || amount <= 0) return 0;
    let pool = wodPlayerMpPool(owner);
    let spend = Math.min(amount, pool);
    if(spend <= 0) return 0;
    if(owner === 1) gameData.manpower = Math.max(0, pool - spend);
    else {
        if(!gameData.aiManpowerByOwner) gameData.aiManpowerByOwner = {};
        gameData.aiManpowerByOwner[owner] = Math.max(0, pool - spend);
    }
    return spend;
}
const WOD_SHIP_CITY_REPAIR_TILES=2;
function wodUnitMissingStrength(u) {
    return !!(u&&((u.maxHp||100)-u.hp>.05||(u.maxManpower||1000)-(u.manpower??u.maxManpower??1000)>.5));
}
function wodUnitHealingIcon(u) { return !!(u?.healingFlash>0&&wodUnitMissingStrength(u)); }
/** The town's streets as a set. Streets found by the fallbacks of getCityUrbanTerrainHexes
 *  (urban tiles round a town on a hand-made map, or its centre tile) carry no cityId. */
function wodCityStreetSet(city) {
    const list=getCityUrbanTerrainHexes(city);
    if(city._urbanHexSetFor!==list){city._urbanHexSetFor=list;city._urbanHexSet=new Set(list);}
    return city._urbanHexSet;
}
function wodUnitHealingSite(unit,hex=getNearestHexToPoint(unit.x,unit.y)) {
    hex=wodDiagonalLandLinkAtPoint(unit,unit.x,unit.y)||hex;
    if(!hex||unit.type==='convoy'||isWaterHex(hex)&&!isBridgeHex(hex)&&!wodUnitOnBridgeDeck(unit)&&!wodIsNavalUnit(unit))return null;
    const hospital=(gameData.hospitals||[]).find(h=>wodIsFriendlyOwner(wodEffectiveHospitalOwner(h),unit.owner)&&Math.hypot(h.x-unit.x,h.y-unit.y)<=wodFortCombatAuraRadiusPx());
    if(hospital)return {kind:'hospital',site:hospital};
    const city=gameData.cities.find(c=>wodIsFriendlyOwner(c.owner,unit.owner)&&
        (hex.type==='urban'&&hex.cityId===c.id||!isWaterHex(hex)&&wodCityStreetSet(c).has(hex)||wodIsNavalUnit(unit)&&getCityUrbanTerrainHexes(c).some(h=>wodIsFriendlyOwner(h.owner,unit.owner)&&wodHexCellDist(hex,h)<=WOD_SHIP_CITY_REPAIR_TILES)));
    return city?{kind:'city',site:city}:null;
}
function wodEffectiveHospitalOwner(h) {
    const tile=wodHexAt(h.q,h.r);
    return tile&&tile.owner===h.owner?h.owner:0;
}
function wodGeneralForUnit(unit) {
    if(!unit||unit.hp<=0||unit.type==='convoy')return null;
    let cache=gameData._generalAuraCache;
    if(!cache||cache.tick!==gameData._wodSimTick||cache.entities!==gameData.entities)
        cache=gameData._generalAuraCache={tick:gameData._wodSimTick,entities:gameData.entities,units:gameData.entities.flatMap(source=>source.isGeneral?[{unit:source,source}]:source.cargo?.isGeneral?[{unit:source.cargo,source}]:[])};
    const radius=wodFortCombatAuraRadiusPx();
    return cache.units.find(g=>g.source.hp>0&&g.unit.hp>0&&wodIsFriendlyOwner(g.unit.owner,unit.owner)&&Math.hypot(g.source.x-unit.x,g.source.y-unit.y)<=radius)?.unit||null;
}
function wodGeneralStatMultiplier(unit) {return wodGeneralForUnit(unit)?1.05:1;}
function wodGeneralSpeedMultiplier(unit) {return wodGeneralForUnit(unit)?1.10:1;}
function wodCombatTerrainHex(unit) {
    const hex=wodDiagonalLandLinkAtPoint(unit,unit.x,unit.y)||getNearestHexToPoint(unit.x,unit.y);
    return hex&&wodUnitOnBridgeDeck(unit)?{...hex,type:'grass'}:hex;
}
function wodCombatModifiers(attacker,defender) {
    const from=wodCombatTerrainHex(attacker),to=wodCombatTerrainHex(defender);
    const ownAttack=getTerrainAttackModifier(attacker,from),targetAttack=getTerrainAttackModifier(attacker,to);
    const attack=Math.sqrt(ownAttack*targetAttack),cover=getTerrainDefenseModifier(defender,to);
    const command=wodGeneralStatMultiplier(attacker)/wodGeneralStatMultiplier(defender);
    return {from,to,ownAttack,targetAttack,attack,cover,command,terrain:attack*cover,total:attack*cover*command*wodFortDefenseDamageMultiplier(defender)};
}
function wodCombatOpponent(unit) {
    const enemy=unit._combatEnemy||gameData.entities.find(e=>e.uid&&e.uid===unit.combatTargetUid)||gameData.entities.find(e=>e.hp>0&&e.combatTargetUid===unit.uid);
    if(!enemy||enemy.hp<=0||!wodIsHostileOwner(enemy.owner,unit.owner)||enemy.boardTransportUid)return null;
    return Math.hypot(enemy.x-unit.x,enemy.y-unit.y)<=Math.max(enemy.range||0,unit.range||0)*1.05+1?enemy:null;
}
function wodEnsureStartingGenerals(ownerIds) {
    gameData._generalAuraCache=null;
    if(gameData._generalMap!==gameData.hexes){gameData._generalMap=gameData.hexes;gameData._generalIssuedOwners=new Set();}
    for(const owner of ownerIds||[]) {
        const army=gameData.entities.flatMap(u=>u.cargo?[u,u.cargo]:[u]);
        for(const u of army)if(u.owner===owner&&u.isGeneral&&u.type!=='heavy')u.isGeneral=false;
        const commanders=army.filter(u=>u.owner===owner&&u.isGeneral),present=commanders[0];
        for(const duplicate of commanders.slice(1))duplicate.isGeneral=false;
        if(present){gameData._generalIssuedOwners.add(owner);continue;}
        if(gameData._generalIssuedOwners.has(owner))continue;
        const city=gameData.cities.find(c=>c.owner===owner);
        let unit=army.find(u=>u.owner===owner&&u.hp>0&&u.type==='heavy');
        if(!unit){const tile=gameData.hexList.filter(h=>h.owner===owner&&!isWaterHex(h)&&h.type!=='mountain').sort((a,b)=>city?Math.hypot(a.x-city.x,a.y-city.y)-Math.hypot(b.x-city.x,b.y-city.y):0)[0];if(tile)unit=createUnitAt('heavy',tile.x,tile.y,owner,{startSpawn:true});}
        if(!unit){
            let carrier=gameData.entities.find(u=>u.owner===owner&&u.hp>0&&u.type==='transport'&&!u.cargo&&!u.pickupUid);
            if(!carrier){const fleet=gameData.entities.find(u=>u.owner===owner&&u.hp>0&&wodIsNavalUnit(u)),at=fleet&&getNearestHexToPoint(fleet.x,fleet.y);
                const site=at&&getHexesInRadius(at.q,at.r,5).map(p=>wodHexAt(p.q,p.r)).filter(wodIsOpenWaterHex).sort((a,b)=>wodAiDist2(a.x,a.y,at.x,at.y)-wodAiDist2(b.x,b.y,at.x,at.y)).find(h=>wodNavalDestinationClear({type:'transport',owner,radius:16},h));
                if(site)carrier=createUnitAt('transport',site.x,site.y,owner,{startSpawn:true});
            }
            if(carrier){unit=createUnitAt('heavy',carrier.x,carrier.y,owner,{startSpawn:true});carrier.cargo=unit;carrier._aiFerryMission=!wodMpIsHumanOwner(owner);gameData.entities=gameData.entities.filter(u=>u!==unit);}
        }
        if(!unit)continue;
        unit.isGeneral=true;gameData._generalIssuedOwners.add(owner);gameData._generalAuraCache=null;
    }
}
function wodUnitHealingCombatBlocked(unit,care) {
    // Check both weapon ranges, including incoming fire on retreating
    // troops and unarmed support boats. Do not rely on fading FX or on
    // which faction happened to update first in this simulation tick.
    let cache=gameData._healingCombatRange;
    if(!cache||cache.tick!==gameData._wodSimTick||cache.entities!==gameData.entities||cache.count!==gameData.entities.length)
        cache=gameData._healingCombatRange={tick:gameData._wodSimTick,entities:gameData.entities,count:gameData.entities.length,
            range:gameData.entities.reduce((n,u)=>u.hp>0&&u.damage>0?Math.max(n,(u.range||0)*1.05):n,0)};
    let blocked=false;
    const test=other=>{
        if(blocked||other===unit||other.hp<=0||other.boardTransportUid||other.type==='convoy'||!wodIsHostileOwner(other.owner,unit.owner))return;
        if(care?.kind==='city'&&!wodIsNavalUnit(unit)&&wodIsNavalUnit(other)&&!wodShipEngagesTown(other,care.site))return;
        const own=unit.damage>0?(unit.range||0)*wodGeneralStatMultiplier(unit):0;
        const incoming=other.damage>0?(other.range||0)*wodGeneralStatMultiplier(other):0;
        if(Math.hypot(other.x-unit.x,other.y-unit.y)<=Math.max(own,incoming))blocked=true;
    };
    if(gameData.unitSpatialGrid)forEachNearbyUnit(gameData.unitSpatialGrid,unit.x,unit.y,Math.max(cache.range,(unit.range||0)*1.05),test);
    else gameData.entities.forEach(test);
    return blocked;
}
function canHealUnit(unit) {
    if(!unit || unit.hp <= 0 || unit.type === 'convoy') return false;
    let mpCap = unit.maxManpower || (wodIsNavalUnit(unit) ? WOD_MANPOWER_SHIP : WOD_MANPOWER_INFANTRY);
    if(unit.manpower == null) unit.manpower = Math.round((unit.hp / unit.maxHp) * mpCap);
    if(unit.hp >= unit.maxHp-.00001 && unit.manpower >= mpCap-.001 && (unit.morale??WOD_MORALE_MAX)>=(unit.maxMorale||WOD_MORALE_MAX)) return false;
    let hex = wodDiagonalLandLinkAtPoint(unit,unit.x,unit.y)||getNearestHexToPoint(unit.x, unit.y);
    if(!hex)return false;
    const afloat=isWaterHex(hex)&&!isBridgeHex(hex)&&!wodUnitOnBridgeDeck(unit);
    if(afloat&&!wodIsNavalUnit(unit))return false;
    if(!afloat&&!isBridgeHex(hex)&&!wodUnitOnBridgeDeck(unit)&&!wodIsFriendlyOwner(hex.owner,unit.owner))return false;
    if(wodGetUnitEncirclementState(unit, hex)) return false;
    const care=wodUnitHealingSite(unit,hex);
    if(!care) return false;
    // Hospital patients stop recovering while exchanging fire; safe
    // patients elsewhere in the same radius can continue treatment.
    if(wodUnitHealingCombatBlocked(unit,care))return false;
    if(care.kind==='hospital')return true;
    return !isCitySiegeBlockedForProduction(care.site)&&!gameData.entities.some(other=>other.hp>0&&other.type!=='convoy'&&wodIsHostileOwner(other.owner,unit.owner)&&
        Math.hypot(other.x-unit.x,other.y-unit.y)<115&&(!wodIsNavalUnit(other)||wodShipEngagesTown(other,care.site)));
}
function updateUnitHealing(unit, dt) {
    if(canHealUnit(unit)) {
        let mpCap = unit.maxManpower || (wodIsNavalUnit(unit) ? WOD_MANPOWER_SHIP : WOD_MANPOWER_INFANTRY);
        if(unit.manpower == null) unit.manpower = Math.round((unit.hp / unit.maxHp) * mpCap);
        let restored=false;
        let hpMissing = unit.maxHp - unit.hp;
        let mpMissing = mpCap - unit.manpower;
        if(hpMissing > 0.001 || mpMissing > 0) {
            let healFrac = Math.min(0.03 * dt, 1);
            let soldiersWant = Math.min(mpMissing, healFrac * mpCap);
            soldiersWant=wodAiReplacementAllowance(unit,soldiersWant,dt);
            let soldiersAdded = wodSpendOwnerManpowerPool(unit.owner, soldiersWant);
            if(soldiersAdded > 0) {
                restored=true;wodBattleMetric(unit.owner,'personnelRestored',soldiersAdded);
                let fracAdded = soldiersAdded / mpCap;
                unit.manpower = Math.min(mpCap, unit.manpower + soldiersAdded);
                unit.hp = Math.min(unit.maxHp, unit.hp + fracAdded * unit.maxHp);
                if(unit.type === 'heavy') {
                    let tankCap = unit.maxTanks || WOD_ARMOR_DIV_TANKS;
                    unit.tanks = Math.min(tankCap, Math.round((unit.hp / unit.maxHp) * tankCap));
                }
            }
        }
        unit.healingFlash = restored&&wodUnitMissingStrength(unit) ? 0.25 : 0;
    } else { unit.healingFlash=0; }
}
function wodUnitInUnsuppliedWater(unit,hex) {
    return !!(unit&&hex&&!wodIsNavalUnit(unit)&&!(unit.type==='convoy'&&unit.convoySeaRoute)&&unit.type!=='marine'&&isWaterHex(hex)&&
        !wodUnitOnBridgeDeck(unit)&&!wodDiagonalLandLinkAtPoint(unit,unit.x,unit.y));
}
const WOD_SUPPLY_GRACE_SECONDS=10;
const WOD_SUPPLY_CONFIRM_SECONDS=2;
// Count uninterrupted simulation time, not wall-clock time (pause is free).
function wodAdvanceWaterExposure(unit, dt, hex) {
    if(!wodUnitInUnsuppliedWater(unit,hex)) { unit.waterExposureSeconds=0; return 0; }
    const before=Math.max(0,Number(unit.waterExposureSeconds)||0);
    const after=before+Math.max(0,dt);
    unit.waterExposureSeconds=after;
    return Math.max(0,after-WOD_SUPPLY_GRACE_SECONDS)-Math.max(0,before-WOD_SUPPLY_GRACE_SECONDS);
}
function wodAdvanceSupplyExposure(unit,dt,state) {
    if(!state){unit.supplyPendingSeconds=0;unit.outOfSupplySeconds=0;return 0;}
    // Older saves/network snapshots with an active countdown have already
    // confirmed isolation; do not restart their confirmation delay.
    const pending=unit.outOfSupplySeconds>0?WOD_SUPPLY_CONFIRM_SECONDS:Math.max(0,unit.supplyPendingSeconds||0);
    const elapsed=Math.max(0,dt||0);
    unit.supplyPendingSeconds=Math.min(WOD_SUPPLY_CONFIRM_SECONDS,pending+elapsed);
    const confirmedDt=Math.max(0,pending+elapsed-WOD_SUPPLY_CONFIRM_SECONDS);
    const before=Math.max(0,Number(unit.outOfSupplySeconds)||0);
    const after=before+confirmedDt;unit.outOfSupplySeconds=after;
    return Math.max(0,after-WOD_SUPPLY_GRACE_SECONDS)-Math.max(0,before-WOD_SUPPLY_GRACE_SECONDS);
}
function wodUnitSupplyWarningState(unit,hex) {
    return (unit.outOfSupplySeconds>0||unit.supplyPendingSeconds>=WOD_SUPPLY_CONFIRM_SECONDS)?wodGetUnitEncirclementState(unit,hex):null;
}
function wodSupplyAttritionStats(unit,state) {
    const remaining=Math.max(0,WOD_SUPPLY_GRACE_SECONDS-(unit.outOfSupplySeconds||0));
    return remaining>0 ? `Attrition in ${remaining.toFixed(1)}s · No healing` : `−${state?.relief?'1.75':'3.5'}% max HP/s · No healing`;
}
function wodWaterAttritionStats(unit) {return wodSupplyAttritionStats(unit,{water:true});}
function applyTerrainUnitEffects(unit, dt) {
    let hex = wodDiagonalLandLinkAtPoint(unit,unit.x,unit.y)||getNearestHexToPoint(unit.x, unit.y);
    let onBridge = wodUnitOnBridgeDeck(unit);
    let sea = !!(hex && isWaterHex(hex) && !isBridgeHex(hex) && !onBridge && !wodIsNavalUnit(unit)&&!(unit.type==='convoy'&&unit.convoySeaRoute));
    unit.amphibInWater = !!(unit.type === 'marine' && sea);
    if(sea)unit.healingFlash=0;
    unit.inWater = !!(sea && unit.type !== 'marine');
    if(sea) {
        // Damage is applied once by the shared supply-attrition pass.
        // Orders, coastal ownership and nearby forts do not supply water.
        unit.waterFlash = 0.35;
    } else if(unit.waterFlash) {
        unit.waterFlash = Math.max(0, unit.waterFlash - dt);
    }
}
function getTerrainAttackModifier(unit, hex) {
    if(!hex || !unit) return 1;
    if(WOD_SPECIALIST_UNITS[unit.type]){const tile=isBridgeHex(hex)?{...hex,type:'grass'}:hex;return unit.type==='motorized'?({forest:.8,hill:.8,swamp:.55,urban:.9,mountain:.4,water:.4}[tile.type]||1):({forest:.99,hill:1.7,swamp:.765,urban:.855,mountain:2,water:.495}[tile.type]||.9);}
    if(isBridgeHex(hex)) return 1;
    if(wodIsNavalUnit(unit)) return 1;
    if(unit.type === 'marine') {
        if(isWaterHex(hex)) return 1;
        if(hex.type === 'sand') return 1;
        return 0.6;
    }
    // Infantry handle rough terrain better than armor.
    if(unit.type === 'heavy') {
        if(hex.type === 'forest') return 0.55;
        if(hex.type === 'hill') return 0.65;
        if(hex.type === 'swamp') return 0.45;
        if(hex.type === 'urban') return 0.7;
        if(hex.type === 'mountain') return 0.5;
        if(isWaterHex(hex)) return 0.4;
        return 1;
    }
    // Infantry
    if(hex.type === 'forest') return 1.1;
    if(hex.type === 'hill') return 1.05;
    if(hex.type === 'swamp') return 0.85;
    if(hex.type === 'urban') return 0.95;
    if(hex.type === 'mountain') return 0.8;
    if(isWaterHex(hex)) return 0.55;
    return 1;
}
function getTerrainDefenseModifier(unit, hex) {
    if(!hex || !unit) return 1;
    if(WOD_SPECIALIST_UNITS[unit.type]){const tile=isBridgeHex(hex)?{...hex,type:'grass'}:hex;return unit.type==='motorized'?({forest:.85,hill:.9,swamp:1.2,urban:.7,mountain:1.3,water:1.6}[tile.type]||.95):({forest:.66,hill:.45,swamp:.935,urban:.55,mountain:.35,water:1.54}[tile.type]||1.1);}
    if(isBridgeHex(hex)) return 1;
    if(wodIsNavalUnit(unit)) return 1;
    if(unit.type === 'marine') {
        if(isWaterHex(hex)) return 0.92;
        if(hex.type === 'sand') return 0.75;
        if(hex.type === 'forest') return 0.92;
        if(hex.type === 'hill') return 0.94;
        if(hex.type === 'swamp') return 0.9;
        if(hex.type === 'urban') return 0.82;
        if(hex.type === 'mountain') return 0.88;
        return 1;
    }
    // Infantry get strong defensive cover in forest/hills/urban; armor gets less.
    if(unit.type === 'heavy') {
        if(hex.type === 'forest') return 1.2;   // armor exposed in forest
        if(hex.type === 'hill') return 1.15;    // armor exposed on slopes
        if(hex.type === 'swamp') return 1.25;
        if(hex.type === 'urban') return 0.8;
        if(hex.type === 'mountain') return 1.3;
        if(isWaterHex(hex)) return 1.6;
        return 1;
    }
    // Infantry
    if(hex.type === 'forest') return 0.6;
    if(hex.type === 'hill') return 0.7;
    if(hex.type === 'swamp') return 0.85;
    if(hex.type === 'urban') return 0.5;
    if(hex.type === 'mountain') return 0.55;
    if(isWaterHex(hex)) return 1.4;
    return 1;
}
// The guide's terrain table: one column per terrain, as the unit stands on it.
const WOD_HELP_TERRAIN_COMBAT_COLS = [
    { hexType: 'grass', label: 'Grass' },
    { hexType: 'sand', label: 'Sand' },
    { hexType: 'forest', label: 'Forest' },
    { hexType: 'hill', label: 'Hill' },
    { hexType: 'swamp', label: 'Swamp' },
    { hexType: 'urban', label: 'Town' },
    { hexType: 'mountain', label: 'Mountain' },
    { hexType: 'water', label: 'Water' },
];
const WOD_HELP_TERRAIN_COMBAT_ROWS = [
    { unitType: 'light', label: 'Infantry' },
    {unitType:'motorized',label:'Motorized infantry'},{unitType:'mountaineer',label:'Mountaineers'},
    { unitType: 'heavy', label: 'Armor' },
    { unitType: 'marine', label: 'Marines' },
    { unitType: 'ship', label: 'Warships' },
    { unitType: 'transport', label: 'Transports' },
    { unitType: 'supply', label: 'Supply ships' },
];
/** Atk / Dmg taken for a unit standing on the column's terrain, or null where it cannot go. */
function wodHelpTerrainCombatRefCell(unitType, col) {
    const water = col.hexType === 'water', naval = wodIsNavalType(unitType);
    if(naval ? !water : col.hexType === 'mountain' && unitType !== 'mountaineer') return null;
    let hex = { type: col.hexType };
    let unit = {
        type: unitType,
        owner: 1,
        hp: 10,
        maxHp: 10,
        morale: WOD_MORALE_MAX,
        inWater: water && !naval && unitType !== 'marine',
        amphibInWater: water && unitType === 'marine'
    };

    let atk = Math.round(getTerrainAttackModifier(unit, hex) * 100);
    let defPct = Math.round(getTerrainDefenseModifier(unit, hex) * 100);
    return { atk: atk, defPct: defPct };
}
function wodChartCombatStatMarkup(atkPct, defPct) {
    let a = (atkPct | 0),
        d = (defPct | 0);
    return '<span class="wod-help-terrain-matrix-atk">Atk ' + a + '%</span><br/><span class="wod-help-terrain-matrix-def">Dmg taken ' + d + '%</span>';
}
function fillTerrainCombatHelpTables() {
    function eh(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
    let thead = '<tr><th scope="col">Unit</th>' + WOD_HELP_TERRAIN_COMBAT_COLS.map(c =>
        '<th scope="col">' + eh(c.label) + '</th>'
    ).join('') + '</tr>';

    let bodyRows = WOD_HELP_TERRAIN_COMBAT_ROWS.map(row => {
        let cells = WOD_HELP_TERRAIN_COMBAT_COLS.map(col => {
            let ref = wodHelpTerrainCombatRefCell(row.unitType, col);
            if(!ref) return '<td class="wod-matrix-cell-empty">—</td>';
            return '<td class="wod-matrix-cell-stats">' + wodChartCombatStatMarkup(ref.atk, ref.defPct) + '</td>';
        }).join('');
        return '<tr><th scope="row">' + eh(WOD_SPECIALIST_UNITS[row.unitType]?wodSpecialistLabel(row.unitType):row.label) + '</th>' + cells + '</tr>';
    }).join('');

    let tbl = `<div class="wod-help-terrain-combat-wrap" role="region" aria-label="Terrain combat percentages">
<table class="wod-help-terrain-combat-table">
<thead>${thead}</thead>
<tbody>${bodyRows}</tbody>
</table></div>`;

    for(let mount of document.querySelectorAll('.wod-help-terrain-combat-mount:not(#infoTerrainEffectsMount)')) mount.innerHTML = tbl;
}
const WOD_HELP_EFFECT_ENTRIES = [
    { id: 'fighting', title: 'Fighting', overhead: 'combat', drawType: 'light', note: 'A burst icon while the unit is trading fire.', effect: { label: 'Fighting', stats: 'Trading fire · Moves at a third of its speed', detail: 'In combat with an enemy unit.' } },
    { id: 'fort', title: 'Fortified', overhead: 'fort', drawType: 'heavy', note: 'A shield icon inside one of your forts’ rings.', effect: { label: 'Fortified', render: 'fortDmg', fortDmgPct: 80, block: true, detail: 'Takes about 80% of normal damage.' } },
    { id: 'encircled', title: 'Out of supply', overhead: 'encircled', drawType: 'light', note: 'A yellow countdown, then a red exclamation mark, when the unit is cut off from supply.', effect: { label: 'Encircled', stats: '−3.5% max HP/s · No healing', block: true, warn: true, detail: 'No path of friendly land to a town.' } },
    { id: 'deepwater', title: 'In water', overhead: 'water', drawType: 'light', note: 'A blue ~ when a land unit stands in water without supply.', effect: { label: 'Deep water', stats: '−3.5% max HP/s · No healing', block: true, warn: true, detail: 'Land units in water lose strength once the 10-second countdown ends. Ships and marines are not affected.' } },
    { id: 'unpaid', title: 'Unpaid upkeep', overhead: 'unpaid', drawType: 'light', note: 'An orange dollar sign while you cannot pay upkeep.', effect: { label: '$ Unpaid', stats: '−2.5% max HP/s', block: true, warn: true, detail: 'Your money has run out and upkeep is higher than income.' } },
    { id: 'healing', title: 'Healing', overhead: 'heal', drawType: 'light', note: 'A green plus while the unit heals at a town or hospital.', effect: { label: '+ Healing', stats: '+3% max HP/s', detail: 'Needs supply and manpower. Town healing stops while the town is attacked; hospital healing stops while this unit is fighting.' } },
    { id: 'forest', title: 'Forest cover', overhead: null, drawType: 'light', note: 'Terrain effects appear on the unit card only, with no icon above the unit.', effect: { label: 'Forest', render: 'terrainCombat', atkPct: 110, defPct: 60, block: true, terrain: true, detail: 'Example: infantry in forest deal more damage and take much less.' } },
    { id: 'amphib', title: 'Amphibious march', overhead: null, drawType: 'marine', note: 'Marines in water: on the unit card only, with no attrition.', effect: { label: '∿ Amphib', stats: 'March ×90%', detail: 'Marines moving through water.' } },
    { id: 'march', title: 'Slow march', overhead: null, drawType: 'heavy', note: 'Low morale, rough ground or an enemy fort is slowing the unit.', effect: { label: 'March', stats: '×70%', detail: 'Low morale, rough ground or an enemy fort is slowing the unit.' } },
    { id: 'routed', title: 'Routed', overhead: null, drawType: 'light', note: 'White flashes while the unit falls back on its own. Pursuers keep it running.', effect: { label: 'Routed', stats: 'No orders · Still fires back · Rallies at 50 morale after 3 s clear', block: true, warn: true, detail: 'Morale recovers out of combat, even away from a town.' } },
    { id: 'shaken', title: 'Shaken', overhead: null, drawType: 'light', note: 'Morale below full lowers the damage the unit deals.', effect: { label: 'Shaken', stats: 'Lower morale · Less damage', detail: 'Morale below full reduces combat power.' } }
];
function wodHelpEquippedSkin() {
    let s = 'nato';
    if(typeof gameData !== 'undefined' && gameData && gameData.unitSkin) s = gameData.unitSkin;
    else if(typeof wodProgress !== 'undefined' && wodProgress && wodProgress.profile && wodProgress.profile.unitSkin) s = wodProgress.profile.unitSkin;
    if(!s || s === 'default') return 'nato';
    return s;
}
function drawHelpUnitMarker(ctx, unit, ur, col) {
    if(unit.type === 'convoy') {
        drawClassicUnitShape(ctx, unit.type, ur, col, unit);
        return;
    }
    unit.skinOverride = wodHelpEquippedSkin();
    if(!drawUnitSkin(ctx, unit, ur, col)) drawClassicUnitShape(ctx, unit.type, ur, col, unit);
    delete unit.skinOverride;
}
function drawHelpFxOverheadIcon(ctx, kind, cx, cy) {
    let glyphR = 4.41;
    if(kind === 'combat') drawCombatBurstIcon(ctx, cx, cy, 5.21);
    else if(kind === 'fort') drawWodFortShieldBadge(ctx, cx, cy, glyphR);
    else if(kind === 'encircled') drawWodOverheadTextBadge(ctx, cx, cy, '!', '#e74c3c');
    else if(kind === 'unpaid') drawWodOverheadTextBadge(ctx, cx, cy, '$', '#f39c12');
    else if(kind === 'heal') drawWodOverheadTextBadge(ctx, cx, cy, '+', '#2ecc71');
    else if(kind === 'water') drawWodOverheadTextBadge(ctx, cx, cy, '~', '#3498db');
}
function fillHelpEffectsGuide() {
    if(typeof wodFmtInfoEffectMarkup !== 'function') return;
    let html = WOD_HELP_EFFECT_ENTRIES.map(function(e) {
        return '<article class="help-effect-card" data-help-fx="' + e.id + '">'
            + '<div class="help-effect-card-visual"><canvas data-help-fx-canvas="' + e.id + '" width="88" height="56" aria-hidden="true"></canvas></div>'
            + '<div class="help-effect-card-body"><h5>' + wodEscapeEffectInner(e.title) + '</h5>'
            + '<div class="effect-list">' + wodFmtInfoEffectMarkup(e.effect) + '</div>'
            + '<p class="help-effect-card-note">' + wodEscapeEffectInner(e.note) + '</p></div></article>';
    }).join('');
    document.querySelectorAll('.wod-help-effects-mount').forEach(function(el) { el.innerHTML = html; });
}
function renderHelpEffectCards() {
    let col = factionColors[1] || '#2ecc71';
    for(let e of WOD_HELP_EFFECT_ENTRIES) {
        for(let canvas of document.querySelectorAll('canvas[data-help-fx-canvas="' + e.id + '"]')) {
            if(!canvas.getContext) continue;
            let ctx = canvas.getContext('2d');
            ctx.fillStyle = '#0f1823';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2 + 6);
            let eu = Object.assign({ type: e.drawType, owner: 1, hp: 100, maxHp: 100, manpower: 1000, tanks: 0 }, e.drawExtra || {});
            let ur = e.drawType === 'convoy' ? 11 : 13;
            drawHelpUnitMarker(ctx, eu, ur, col);
            if(e.overhead) {
                ctx.direction = 'ltr';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.imageSmoothingEnabled = true;
                drawHelpFxOverheadIcon(ctx, e.overhead, 0, -ur - 8);
            }
            ctx.restore();
        }
    }
}
function getUnitSpeedMultiplier(unit,terrainOverride) {
    let onBridge = wodUnitOnBridgeDeck(unit);
    let waterSlow = onBridge||wodIsNavalUnit(unit) ? 1 : ((terrainOverride?isWaterHex(terrainOverride):unit.inWater||unit.amphibInWater) ? .90 : 1);
    let water = waterSlow;
    if(unit.type === 'convoy') return water;
    let m = unit.morale != null ? unit.morale : WOD_MORALE_MAX;
    let mn = Math.max(0, Math.min(WOD_MORALE_MAX, m)) / WOD_MORALE_MAX;
    let moraleSlow = 0.58 + 0.42 * mn;
    if(unit.moraleBroken) moraleSlow *= 1.18;
    const terrain=terrainOverride||wodDiagonalLandLinkAtPoint(unit,unit.x,unit.y)||getNearestHexToPoint(unit.x,unit.y);
    const specialist=unit.type==='motorized'?({forest:.72,hill:.68,swamp:.42,urban:.8}[terrain?.type]||1):unit.type==='mountaineer'?({hill:1.05,mountain:.65}[terrain?.type]||1):1;
    return water * moraleSlow * (onBridge?1:specialist) * wodGeneralSpeedMultiplier(unit);
}
/** Tile type only — combat modifiers are listed separately ("Combat in this terrain"). */
function getTerrainTileEffect(hex) {
    if(!hex) return null;
    if(isBridgeHex(hex)) {
        return {
            label: 'Bridge',
            detail: 'River crossing — moves like open ground.',
            terrain: true
        };
    }
    let nm = terrainLabel(hex.type);
    return {
        label: nm,
        detail: 'Terrain under this convoy.',
        terrain: true
    };
}
/** Live combat tilt on this hex — pill uses chart-style Atk/Dmg rows (tooltip = prose). */
function getTerrainCombatEffect(unit, hex) {
    if(!hex || !unit || unit.type === 'convoy') return null;
    if(wodUnitOnBridgeDeck(unit))hex={...hex,type:'grass'};
    let atk = getTerrainAttackModifier(unit, hex);
    let def = getTerrainDefenseModifier(unit, hex);
    let atkPct = Math.round(atk * 100);
    let defPct = Math.round(def * 100);
    let atkLine = atk >= 1.02 ? `Outgoing attack damage from this tile is about ${atkPct}% of baseline (terrain helps your attacks).`
        : (atk <= 0.98 ? `Outgoing attack damage from this tile is about ${atkPct}% of baseline (terrain hurts your attacks).`
            : `Outgoing attack damage is about ${atkPct}% of baseline (no strong terrain tilt).`);
    let defLine = def <= 0.98 ? `Damage taken from hostile hits resolves at about ${defPct}% of each hit — lower is stronger cover.`
        : (def >= 1.02 ? `Damage taken resolves at about ${defPct}% of each hit — higher means you are more exposed.`
            : `Damage taken resolves at about ${defPct}% of baseline here.`);
    return {
        label: terrainLabel(hex.type),
        detail: 'Own-tile reference. ' + atkLine + ' ' + defLine + ' Actual combat also includes effectiveness on the opposing tile; see Enemy terrain effects while engaged.',
        render: 'terrainCombat',
        atkPct: atkPct,
        defPct: defPct,
        block: true,
        terrain: true
    };
}
/** Friendly fort aura: multiplier on incoming combat damage (< 1 means you take less). */
function getFortDefenseEffect(unit) {
    if(!unit || unit.hp <= 0 || unit.type === 'convoy') return null;
    let m = wodFortDefenseDamageMultiplier(unit);
    if(m >= 0.995) return null;
    let pct = Math.round(m * 100);
    let bonusPct = Math.max(1, Math.round((1 / m - 1) * 100));
    return {
        label: 'Fortified',
        detail: 'A friendly fort combat aura covers this stack. Incoming damage resolves at about ' + pct + '% of normal (~' + bonusPct + '% tougher). Hostile fort auras slow enemy march; yours does not slow you.',
        render: 'fortDmg',
        fortDmgPct: pct,
        block: true
    };
}
function getUnitEffects(unit) {
    let effects = [];
    const opponent=wodCombatOpponent(unit);
    if(opponent){const outgoing=wodCombatModifiers(unit,opponent),incoming=wodCombatModifiers(opponent,unit),pct=n=>Math.round(n*100)+'%';
        effects.push({label:'Enemy terrain effects',stats:'Outgoing '+pct(outgoing.terrain)+' · Incoming '+pct(incoming.terrain),detail:'Fighting '+wodProductionLabel(opponent.type)+' on '+terrainLabel(incoming.from?.type||'grass')+'. This unit combines attack effectiveness on '+terrainLabel(outgoing.from?.type||'grass')+' ('+pct(outgoing.ownAttack)+') and enemy terrain ('+pct(outgoing.targetAttack)+') using the geometric mean, then their cover ('+pct(outgoing.cover)+'). Incoming fire likewise combines both positions, then this unit’s cover. Values here exclude morale, veteran, fort and general bonuses.',block:true});
        const extra=[],fort=wodFortDefenseDamageMultiplier(opponent),command=wodGeneralStatMultiplier(opponent),veteran=wodVeteranStatMult(opponent);
        if(fort<1)extra.push('Outgoing hits ×'+pct(fort)+' (enemy fort)');
        if(command>1)extra.push('Enemy general: +5% attack/toughness');
        if(veteran>1)extra.push('Enemy veteran: +10% attack');
        if(extra.length)effects.push({label:'Enemy combat effects',stats:extra.join(' · '),detail:'These opposing bonuses apply in addition to the terrain exchange. The selected unit’s own command, fort, morale and veteran effects remain listed separately.',block:true});
    }
    if(unit.isGeneral)effects.push({label:'General',stats:'Unique starting armor · Cannot be replaced',detail:'One general begins each battle for every nation. It fights as ordinary armor and cannot be trained or replaced after it is lost. Its purple command radius matches a fort.',block:true});
    if(unit.cargo?.isGeneral)effects.push({label:'General aboard',stats:'Unique commander · Unload to fight as armor',detail:'The general still commands within the purple radius while aboard this transport. It cannot fire or heal as a passenger; sinking the transport loses the general permanently.',block:true});
    if(wodGeneralForUnit(unit))effects.push({label:'General command',stats:'+5% combat stats and morale · +10% speed',detail:'A friendly general covers this unit. Command does not stack; incoming combat damage is divided by 1.05, and attack, firing rate and weapon range are multiplied by 1.05; command multiplies movement speed by 1.10 and morale capacity and recovery by 1.05. Supply, attrition and healing requirements remain unchanged.',block:true});
    const healingSite=wodUnitHealingSite(unit);
    if(healingSite)effects.push({label:healingSite.kind==='hospital'?'Hospital care':'Town recovery',stats:'Up to +3% strength/s · Uses manpower',detail:'Requires supply and replacement manpower. Town healing stops while the town is attacked. Hospital treatment pauses while this unit is firing or under enemy fire; other safe patients can still recover. Ships repair within two tiles of a friendly-held town cell or within a hospital radius; other units cannot heal in open water.',block:true});
    else if(unit.type!=='convoy'&&(wodUnitMissingStrength(unit)))effects.push({label:'Medical support needed',stats:'Recover at a town or hospital',detail:'Open countryside and forts alone do not heal units. Return to supplied friendly town cells or a hospital’s pink radius. Ships need a friendly-held town cell within two tiles or a hospital radius; ordinary land units and marines must leave open water.',block:true});
    let hex = getNearestHexToPoint(unit.x, unit.y);
    if(hex && unit.type !== 'convoy') {
        let terrCombat = getTerrainCombatEffect(unit, hex);
        if(terrCombat) effects.push(terrCombat);
        let fortFx = getFortDefenseEffect(unit);
        if(fortFx) effects.push(fortFx);
        if(wodSupplyShipForUnit(unit))effects.push({label:'Naval supply',stats:'In supply · Nearby supply ship',detail:'A friendly supply ship provides supply within twice the radius of a fort (about six cells). Ordinary infantry and armor swimming without a transport remain out of supply. This aura does not grant healing in water.',block:true});
        const supplyState=wodUnitSupplyWarningState(unit,hex);
        if(supplyState) {
            let relief = supplyState.relief;
            let ratePct = relief ? '1.75' : '3.5';
            effects.push({
                label: supplyState.water?'Water: out of supply':'Encircled',
                detail: supplyState.water
                    ? 'Infantry, armor and other unprotected units in water have no supply and cannot heal; after ten uninterrupted seconds out of supply they lose 3.5% max HP per second. Reach dry land or a completed bridge. Only ships and marines are exempt.'
                    : relief
                    ? 'After ten uninterrupted seconds out of supply, a nearby friendly fort halves attrition. Reconnect to a friendly city or supply ship to reset the timer.'
                    : 'After ten uninterrupted seconds out of supply, this unit loses 3.5% max HP per second. Reconnect to a friendly city or supply ship to reset the countdown; healing is blocked while cut off.',
                stats: wodSupplyAttritionStats(unit,supplyState),
                block: true,
                warn: !relief
            });
        }
        let spd = getUnitSpeedMultiplier(unit);
        let fortMarch = wodFortEnemyMovementSlowdownMultiplier(unit);
        spd *= fortMarch;
        let spdPct = Math.round(spd * 100);
        let spdKind = spd > 1.04 ? 'buff' : (spd < 0.96 ? 'debuff' : 'neutral');
        if(spdKind !== 'neutral') {
            let marchDetail = spdKind === 'buff'
                ? 'Morale and tile effects are helping movement.'
                : (fortMarch < 0.995
                    ? 'An enemy fort aura is slowing march speed by 20%.'
                    : 'Morale penalty or rough ground is slowing orders.');
            effects.push({
                label: 'March',
                stats: `×${spdPct}%`,
                detail: marchDetail
            });
        }
        if(fortMarch < 0.995) {
            effects.push({
                label: 'Enemy fort zone',
                stats: 'March ×80%',
                detail: 'Hostile fort combat aura — allied forts never apply this penalty.',
                warn: true
            });
        }
    } else if(hex && unit.type === 'convoy') {
        let tileC = getTerrainTileEffect(hex);
        if(tileC) effects.push(tileC);
    }
    if(wodUnitHealingIcon(unit)) effects.push({
        label: '+ Healing',
        stats: '+3% max HP/s',
        detail: 'Recovering at a supplied town or hospital, using replacement manpower'
    });
    if(unit.amphibInWater) effects.push({
        label: '∿ Amphib',
        stats: 'March ×90%',
        detail: 'Marines: no water attrition; cannot heal while afloat'
    });
    else if(hex && unit.type === 'convoy' && !wodUnitOnBridgeDeck(unit) && (unit.inWater || (unit.waterFlash && unit.waterFlash > 0))) {
        effects.push({
            label: 'Deep water hazard',
            detail: 'Unprotected units in water are out of supply, cannot heal and move slowly; after ten uninterrupted seconds out of supply they lose 3.5% max HP per second.',
            stats: wodWaterAttritionStats(unit),
            block: true,
            warn: true
        });
    }
    if(unit.unpaidFlash && unit.unpaidFlash > 0) effects.push({
        label: '$ Unpaid',
        stats: '−2.5% max HP/s',
        detail: 'No money for upkeep'
    });
    if(unit.retreating) effects.push({
        label: 'Retreating',
        stats: unit._wodOrderedRetreat ? 'Returns fire while falling back · Combat march ×75%' : 'Falling back to safety',
        detail: unit._wodOrderedRetreat
            ? 'Ordered retreat — does not shoot back; combat slowdown is only 75% instead of a full crawl.'
            : 'Falling back to safety'
    });
    if(unit.holding) effects.push({label: 'Holding', detail: 'Waiting for support'});
    if(unit.type !== 'convoy' && unit.damage > 0 && (unit.activeCombatVisual || 0) > 0.04)
        effects.push({
            label: 'Fighting',
            stats: 'Active combat stance · Applies terrain/armor morale effects above while firing',
            detail: 'Engaged — firing while advancing or retreating'
        });
    if(unit.type !== 'convoy') {
        let mp = Math.round(unit.morale != null ? unit.morale : WOD_MORALE_MAX);
        if(wodIsUnitVeteran(unit))
            effects.push({
                label: 'Veteran',
                stats: '+10% combat stats',
                detail: 'Seasoned unit — gains +10% damage from experience; movement speed is unchanged'
            });
        if(unit.moraleBroken)
            effects.push({
                label: 'Routed',
                stats: 'Cannot attack until rallied · Recover while healing off contact',
                detail: 'Fleeing — cannot fight until morale recovers while healing in safety'
            });
        else if(mp < 40)
            effects.push({
                label: 'Broken spirits',
                stats: '~Severely reduced outbound damage via morale linkage',
                detail: 'Morale very low — attacks are weak'
            });
        else if(mp < 68)
            effects.push({
                label: 'Shaken',
                stats: '~Below-peak morale throttles effective attack output',
                detail: 'Below peak morale — reduced combat power'
            });
    }
    return effects;
}
function wodRegionHasOwnerCity(regionKeys, owner) {
    for(let ci = 0, cl = gameData.cities.length; ci < cl; ci++) {
        let city = gameData.cities[ci];
        if(!wodIsFriendlyOwner(city.owner,owner)) continue;
        for(let uh of wodCitySupplySourceHexes(city)) {
            if(regionKeys.has(getHexKey(uh))) return true;
        }
    }
    return false;
}
/** Revalidate stale pocket flags against current cities and connected land ownership.
 * Cache the whole component so a large trapped army shares one search per topology change. */
const wodSupplyNeighborCache=new WeakMap();
function wodBridgeSupplyTouchesLand(br,land) {
    if(!br||!land||isWaterHex(land))return false;
    const c=Math.cos(br.angle||0),s=Math.sin(br.angle||0),dx=land.x-br.x,dy=land.y-br.y;
    const lx=Math.max(-br.w/2,Math.min(br.w/2,dx*c+dy*s)),ly=Math.max(-br.h/2,Math.min(br.h/2,-dx*s+dy*c));
    const x=br.x+lx*c-ly*s,y=br.y+lx*s+ly*c,steps=Math.max(1,Math.ceil(Math.hypot(x-land.x,y-land.y)/((gameData.hexRadius||20)*.15)));
    for(let i=0;i<=steps;i++) {
        const px=land.x+(x-land.x)*i/steps,py=land.y+(y-land.y)*i/steps;
        if(wodPointInBridgeRect(px,py,br,1.01))continue;
        const h=getNearestHexToPoint(px,py);if(!h||isWaterHex(h))return false;
    }
    return true;
}
function wodSupplyNeighbors(hex,fn) {
    const revision=gameData._wodPfVer||0;
    let cached=wodSupplyNeighborCache.get(hex);
    if(cached?.hexes===gameData.hexes&&cached.revision===revision){for(const h of cached.links)fn(h);return;}
    const links=[];
    const seen=new Set(),emit=n=>{if(!n||seen.has(getHexKey(n)))return;seen.add(getHexKey(n));fn(n);};
    // Supply follows the same eight-way dry connections as movement.
    // Water cannot relay supply; bridge banks use physical portals below.
    for(const d of hexDirections){
        const n=wodHexAt(hex.q+d.q,hex.r+d.r);
        if(d.q&&d.r&&(isWaterHex(hex)||n&&isWaterHex(n)))continue;
        if(n){
            const a=isWaterHex(hex)&&gameData._bridgeByHexKey?.[getHexKey(hex)],b=isWaterHex(n)&&gameData._bridgeByHexKey?.[getHexKey(n)];
            if(a&&!isWaterHex(n)&&!wodBridgeSupplyTouchesLand(a,n)||b&&!isWaterHex(hex)&&!wodBridgeSupplyTouchesLand(b,hex))continue;
            if(a&&b&&a!==b&&!wodBridgeRectsOverlap(a,b,1.01))continue;
        }
        if(n){links.push(n);seen.add(getHexKey(n));fn(n);}
    }
    wodForEachBridgePathPortal({type:'light'},hex,n=>{
        const a=isBridgeHex(hex),b=isBridgeHex(n);
        if(a!==b){const deck=a?hex:n,land=a?n:hex,br=gameData._bridgeByHexKey?.[getHexKey(deck)];
            if(!wodBridgeSupplyTouchesLand(br,land))return;}
        if(n&&!seen.has(getHexKey(n))){links.push(n);emit(n);}
    });
    wodSupplyNeighborCache.set(hex,{hexes:gameData.hexes,revision,links});
}
function wodSupplyPassable(hex,owner) {
    return !!(hex&&(isBridgeHex(hex)||!isWaterHex(hex)&&isClaimableLand(hex)&&wodIsFriendlyOwner(hex.owner,owner)));
}
function wodCitySupplySourceHexes(city) {
    if(!city||city.owner<=0)return [];
    // The town remains a supply source throughout its held urban area
    // until ownership changes. Losing its center during a siege must
    // not disconnect the rest of an otherwise friendly town.
    const cells=getCityUrbanTerrainHexes(city),keys=new Set(cells.map(getHexKey)),center=wodHexAt(city.q,city.r);
    if(!center||!keys.has(getHexKey(center)))return [];
    // A remote urban fragment carrying an old city ID is not another
    // supply source. Use only the physical urban footprint connected
    // to the town center, regardless of who contests individual cells.
    const queue=[center],seen=new Set([getHexKey(center)]);
    for(let i=0;i<queue.length;i++)for(const d of hexDirections){
        const h=wodHexAt(queue[i].q+d.q,queue[i].r+d.r),k=h&&getHexKey(h);
        if(!h||!keys.has(k)||seen.has(k))continue;seen.add(k);queue.push(h);
    }
    return queue.filter(h=>!isWaterHex(h)&&wodIsFriendlyOwner(h.owner,city.owner));
}
// The cached neighbour list of a cell for supply (the same links, in the same order, wodSupplyNeighbors visits).
function wodSupplyLinks(hex) {
    const cached=wodSupplyNeighborCache.get(hex);
    if(cached?.hexes===gameData.hexes&&cached.revision===(gameData._wodPfVer||0))return cached.links;
    wodSupplyNeighbors(hex,()=>{});
    return wodSupplyNeighborCache.get(hex).links;
}
// Cells that changed hands since the supply cache was last brought up to date (see setHexOwner): only the factions
// on either side of a change, and their allies, can find their supply network different.
function wodNoteSupplyOwnerChange(hex,from,to) {
    const d=gameData._supplyDirty;if(!d)return;
    // a town's own cells are supply sources: changing them rebuilds everything
    if(hex.cityId||hex.type==='urban'){d.all=true;return;}
    d.owners.add(from);d.owners.add(to);
}
let wodSupplyFloodStamp=0;
function wodCurrentSupplyComponent(hex,owner=hex?.owner) {
    if(!hex||owner<=0||isWaterHex(hex)&&!isBridgeHex(hex))return {city:false,water:false};
    wodEnsureBridgePathIndex();
    const version=gameData._supplyTopologyVersion||0,pfVersion=gameData._wodPfVer||0;
    let allySig=0;for(const pair of gameData.alliances||[])for(const owner of pair)allySig=(Math.imul(allySig,31)+owner)|0;
    let cache=gameData._citySupplyCache;
    const citiesChanged=!cache||cache.cities.length!==gameData.cities.length||gameData.cities.some((c,i)=>{const old=cache.cities[i];return old.city!==c||old.owner!==c.owner||old.q!==c.q||old.r!==c.r;});
    let rebuild=!cache||cache.hexes!==gameData.hexes||cache.pfVersion!==pfVersion||citiesChanged||cache.allySig!==allySig;
    if(!rebuild&&cache.version!==version){
        // Only ordinary cells changed hands since the cache was made: forget the networks of the factions on either
        // side of those changes (and of their allies) and keep everyone else's.
        const d=gameData._supplyDirty;
        if(d&&!d.all&&d.from===cache.version&&version>cache.version){
            for(const o of [...cache.owners.keys()])for(const x of d.owners)if(x>0&&(o===x||wodIsFriendlyOwner(o,x))){cache.owners.delete(o);cache.sourcesBy?.delete(o);break;}
            cache.version=version;gameData._supplyDirty={from:version,owners:new Set(),all:false};
        }else rebuild=true;
    }
    if(rebuild) {
        const sources=new Map();
        for(const c of gameData.cities) {
            if(c.owner<=0)continue;
            for(const h of wodCitySupplySourceHexes(c)) {
                if(!h||isWaterHex(h)||!wodIsFriendlyOwner(h.owner,c.owner))continue;
                const key=getHexKey(h),list=sources.get(key)||[];list.push(c.owner);sources.set(key,list);
            }
        }
        cache=gameData._citySupplyCache={hexes:gameData.hexes,version,pfVersion,cities:gameData.cities.map(city=>({city,owner:city.owner,q:city.q,r:city.r})),allySig,sources,owners:new Map(),sourcesBy:new Map()};
        gameData._supplyDirty={from:version,owners:new Set(),all:false};
    }
    if(!wodSupplyPassable(hex,owner)) {
        const result={city:false,water:false};
        wodSupplyNeighbors(hex,n=>{
            if(isWaterHex(n)&&!isBridgeHex(n)){result.water=true;return;}
        });return result;
    }
    if(!cache.owners.has(owner))cache.owners.set(owner,new Map());
    const known=cache.owners.get(owner),start=getHexKey(hex);if(known.has(start))return known.get(start);
    // The cells that supply this faction: town cells whose town is on its side.
    let mine=cache.sourcesBy.get(owner);
    if(!mine){mine=new Set();for(const [key,list] of cache.sources)if(list.some(o=>wodIsFriendlyOwner(o,owner)))mine.add(key);cache.sourcesBy.set(owner,mine);}
    // Flood the faction's connected ground (the same cells and links as wodSupplyPassable/wodSupplyNeighbors),
    // marking visited cells on the cells themselves rather than in a set of text keys.
    const stamp=wodSupplyFloodStamp=(wodSupplyFloodStamp+1)|0||1,friendly=new Map();
    const friend=o=>{let v=friendly.get(o);if(v===undefined){v=wodIsFriendlyOwner(o,owner);friendly.set(o,v);}return v;};
    const queue=[hex],result={city:false,water:false};hex._supplyStamp=stamp;
    for(let i=0;i<queue.length;i++) {
        const h=queue[i];
        if(!result.city&&mine.has(getHexKey(h)))result.city=true;
        const links=wodSupplyLinks(h);
        for(let j=0;j<links.length;j++){
            const n=links[j],water=isWaterHex(n);
            if(water&&!isBridgeHex(n)){result.water=true;continue;}
            if(n._supplyStamp===stamp)continue;
            if(!(isBridgeHex(n)||!water&&isClaimableLand(n)&&friend(n.owner)))continue;
            n._supplyStamp=stamp;queue.push(n);
        }
    }
    for(const h of queue)known.set(getHexKey(h),result);return result;
}
function wodUnitInsideRegion(unit, regionKeys) {
    if(!unit || unit.hp <= 0 || unit.type === 'convoy' || unit.owner <= 0) return false;
    let uh = getNearestHexToPoint(unit.x, unit.y);
    return !!(uh && regionKeys.has(getHexKey(uh)));
}
function wodDominantEncircler(borderCounts) {
    let best = 0, bestC = 0;
    for(let ok in borderCounts) {
        let c = borderCounts[ok];
        if(c > bestC) { bestC = c; best = parseInt(ok, 10); }
    }
    return best;
}
function updateEncirclements(dt) {
    if(gameData._encircWork) {
        if(wodDeferHeavySimDuringMarch() && (gameData._wodSimTick & 1)) return;
        wodEncirclementProcessChunk();
        return;
    }
    // Moving armies must not starve the supply scan indefinitely.
    gameData.encirclementTimer = (gameData.encirclementTimer || 0) + dt;
    let interval = 0.55 + Math.min(1.0, (gameData.hexList.length || 0) / 50000);
    if(wodUsesVisualViewportLayout()) interval = Math.max(interval * 1.35, 1.8);
    if(gameData.encirclementTimer < interval) return;
    gameData.encirclementTimer = 0;
    gameData._encircWork = {
        visited: new Set(),
        encircledHexes: new Set(),
        encircledReliefHexes: new Set(),
        marineWaterSupplyHexes: new Set(),
        idx: 0
    };
    wodEncirclementProcessChunk();
}
function wodFullyEnclosedLandCaptor(region,owner,keys=new Set(region.map(getHexKey))) {
    const counts={};
    if(region.some(h=>hexDirections.some(d=>isWaterHex(wodHexAt(h.q+d.q,h.r+d.r)))))return 0;
    for(const h of region)for(const d of cardinalHexDirections){
        const n=wodHexAt(h.q+d.q,h.r+d.r);
        if(!n||isWaterHex(n))return 0;
        if(keys.has(getHexKey(n)))continue;
        if(!wodIsHostileOwner(n.owner,owner))return 0;
        counts[n.owner]=(counts[n.owner]||0)+1;
    }
    const capturer=wodDominantEncircler(counts);
    return capturer&&region.every(h=>wodIsHostileOwner(h.owner,capturer))?capturer:0;
}
function wodCaptureEmptyInlandPocket(region,owner,keys) {
    if(gameData.entities.some(u=>u.hp>0&&wodUnitInsideRegion(u,keys)))return false;
    const capturer=wodFullyEnclosedLandCaptor(region,owner,keys);if(!capturer)return false;
    const saved=batchHexOwner,dirty=batchHexOwnerDirty;batchHexOwner=true;batchHexOwnerDirty=false;
    for(const h of region)setHexOwner(h,capturer);
    batchHexOwner=saved;if(batchHexOwnerDirty)wodMarkTerrainPoliticalDirty();batchHexOwnerDirty=dirty;
    return true;
}
function wodEncirclementApplyPocket(region, owner, w) {
    if(!region || !region.length || !w) return;
    // Current connectivity wins over an incremental scan's old flags,
    // including diagonal reconnections and supply through bridges.
    if(wodCurrentSupplyComponent(region[0],owner).city)return;
    let regionKeys = new Set();
    for(let ri = 0, rl = region.length; ri < rl; ri++) regionKeys.add(getHexKey(region[ri]));
    // An empty inland enclave surrenders as a whole, including its peaks
    // and town cells. A coast, neutral opening or map edge is not a ring.
    if(wodCaptureEmptyInlandPocket(region,owner,regionKeys))return;
    let hasOwnerCity = wodRegionHasOwnerCity(regionKeys, owner);
    // A land connection to a town is genuine supply for every unit type.
    if(hasOwnerCity) return;
    let waterAccess = region.some(h => wodTouchesOpenSea(h)); // (across a corner too: see wodTouchesOpenSea)
    if(waterAccess) {
        if(!w.marineWaterSupplyHexes) w.marineWaterSupplyHexes = new Set();
        for(let h of region) w.marineWaterSupplyHexes.add(getHexKey(h));
    }
    // A coast is an open boundary, not a hostile ring. Even an empty
    // island with a town must be captured normally from the beachhead.
    if(waterAccess)return;
    if(region.some(h=>wodCurrentSupplyComponent(h,owner).city))return;
    // Not a ring while a way out to supplied ground passes no enemy troops (wodFrontlineSupplyTouch, the test a unit's
    // own supply uses): the patch a unit claims under its feet as it pushes into enemy land showed as a pocket.
    if(wodFrontlineSupplyTouch(region[0],owner))return;
    let hasOwnerFort = false;
    let fortList = gameData.forts;
    if(fortList && fortList.length) {
        for(let fi = 0, fl = fortList.length; fi < fl; fi++) {
            let ft = fortList[fi];
            if(!ft || wodEffectiveFortOwner(ft) !== owner) continue;
            if(regionKeys.has(`${ft.q},${ft.r}`)) {
                hasOwnerFort = true;
                break;
            }
        }
    }
    let supplyRelief = hasOwnerCity || hasOwnerFort;
    let hasOwnerCombatUnit = false;
    for(let ei = 0, el = gameData.entities.length; ei < el; ei++) {
        let u = gameData.entities[ei];
        if(u.owner !== owner) continue;
        if(wodUnitInsideRegion(u, regionKeys)) {
            hasOwnerCombatUnit = true;
            break;
        }
    }
    for(let ri = 0, rl = region.length; ri < rl; ri++) {
        let hk = getHexKey(region[ri]);
        w.encircledHexes.add(hk);
        if(supplyRelief) w.encircledReliefHexes.add(hk);
    }
    if(!hasOwnerCity && !hasOwnerCombatUnit&&!gameData.entities.some(u=>u.hp>0&&wodUnitInsideRegion(u,regionKeys))) {
        let capturer = wodFullyEnclosedLandCaptor(region, owner);
        if(capturer > 0) {
            let savedBatch = batchHexOwner;
            let savedDirty = batchHexOwnerDirty;
            batchHexOwner = true;
            batchHexOwnerDirty = false;
            for(let ri = 0, rl = region.length; ri < rl; ri++) setHexOwner(region[ri], capturer);
            batchHexOwner = savedBatch;
            if(batchHexOwnerDirty) wodMarkTerrainPoliticalDirty();
            batchHexOwnerDirty = savedDirty;
        }
    }
}
function wodEncirclementProcessChunk() {
    let w = gameData._encircWork;
    if(!w) return;
    let list = gameData.hexList;
    let t0 = performance.now();
    // Keep each tick small so encirclement never monopolizes a frame (90ms here caused multi-second "random" freezes).
    let budgetMs = wodUsesVisualViewportLayout() ? 1.25 : 3.5;
    function overBudget() {
        return performance.now() - t0 >= budgetMs;
    }

    if(w.pendingPocket) {
        wodEncirclementApplyPocket(w.pendingPocket.region, w.pendingPocket.owner, w);
        w.pendingPocket = null;
        if(overBudget()) return;
    }

    while(w.idx < list.length && !overBudget()) {
        let owner, queue, region;

        if(w.partialFill) {
            owner = w.partialFill.owner;
            queue = w.partialFill.queue;
            region = w.partialFill.region;
            w.partialFill = null;
        } else {
            let start = list[w.idx++];
            if(!isClaimableLand(start) || start.owner === 0 || w.visited.has(getHexKey(start))) continue;
            owner = start.owner;
            queue = [start];
            region = [];
            w.visited.add(getHexKey(start));
        }

        while(queue.length > 0) {
            if(overBudget()) {
                w.partialFill = { owner, queue, region };
                return;
            }
            let hex = queue.pop();
            region.push(hex);

            wodSupplyNeighbors(hex,nHex=>{
                if(!nHex||isWaterHex(nHex)||!isClaimableLand(nHex)||nHex.owner===0)return;
                if(wodIsFriendlyOwner(nHex.owner, owner)) {
                    let nKey = getHexKey(nHex);
                    if(!w.visited.has(nKey)) {
                        w.visited.add(nKey);
                        queue.push(nHex);
                    }
                }
            });
        }

        if(overBudget()) {
            w.pendingPocket = { region, owner };
            return;
        }
        wodEncirclementApplyPocket(region, owner, w);
    }
    if(w.idx < list.length || w.partialFill || w.pendingPocket) return;
    gameData.encircledHexes = w.encircledHexes;
    gameData.encircledReliefHexes = w.encircledReliefHexes;
    gameData.marineWaterSupplyHexes = w.marineWaterSupplyHexes || new Set();
    gameData._encircWork = null;
}
function wodMarineHasWaterSupply(unit, hex) {
    if(!unit || unit.type !== 'marine' || !hex || !wodIsFriendlyOwner(hex.owner, unit.owner)) return false;
    return isWaterHex(hex)||wodCurrentSupplyComponent(hex).water;
}
function wodUnitSupplyHex(unit,hex) {
    const corner=wodDiagonalLandLinkAtPoint(unit,unit.x,unit.y);if(corner)return corner;
    if(!hex||isWaterHex(hex)||wodIsFriendlyOwner(hex.owner,unit.owner))return hex;
    // Resolve the small corner wedges exactly as the rounded political
    // fill does. Connectivity itself is shared with the land graph.
    const sp=(gameData.hexRadius||20)*1.35,radius=sp*.44;
    for(const sx of [-1,1])for(const sy of [-1,1]){
        const dx=(hex.x+sx*sp/2-unit.x)*sx/radius,dy=(hex.y+sy*sp/2-unit.y)*sy/radius;
        if(dx<0||dy<0||Math.sqrt(dx)+Math.sqrt(dy)>1)continue;
        const a=wodHexAt(hex.q+sx,hex.r),b=wodHexAt(hex.q,hex.r+sy),c=wodHexAt(hex.q+sx,hex.r+sy);
        if(!a||!b||!c||!wodIsFriendlyOwner(a.owner,unit.owner)||a.owner!==b.owner||c.owner!==a.owner&&c.owner!==hex.owner||isWaterHex(a)||isWaterHex(b)||isWaterHex(c))continue;
        if(c.owner===hex.owner){const q=Math.min(hex.q,c.q),r=Math.min(hex.r,c.r),cells=[[q,r],[q+1,r],[q,r+1],[q+1,r+1]].map(([x,y])=>wodHexAt(x,y));if(hex.owner!==wodCornerPinchedOwner(cells,gameData.hexes))continue;}
        return a;
    }
    return hex;
}
function wodHexOccupiedByFriendlyCombat(hex, owner) {
    if(!hex) return false;
    const map = gameData._hexCombatOcc;
    if(map && map.size) {
        const rec = map.get(getHexKey(hex));
        return !!rec && rec.some(o => wodIsFriendlyOwner(o, owner));
    }
    if(!gameData.unitSpatialGrid || !gameData.unitSpatialGrid.cells) return false;
    let occ = false;
    forEachNearbyUnit(gameData.unitSpatialGrid, hex.x, hex.y, (gameData.hexRadius || 20) * 1.55, u => {
        if(u.hp <= 0 || u.type === 'convoy' || wodIsNavalUnit(u) || !wodIsFriendlyOwner(u.owner, owner)) return;
        const uh = getNearestHexToPoint(u.x, u.y);
        if(uh && uh.q === hex.q && uh.r === hex.r) { occ = true; return true; }
    });
    return occ;
}
/** A cell the enemy holds against this faction's supply: an enemy unit stands on it, or beside it with none of ours on or
 *  beside it to contest it (a column of ours walking between two enemy units keeps its road open). */
function wodSupplyCellHeldByEnemy(hex, owner) {
    if(wodHexOccupiedByEnemyCombat(hex, owner)) return true;
    let enemy = false, friend = wodHexOccupiedByFriendlyCombat(hex, owner);
    for(const nb of getNeighborHexes(hex)) {
        if(!nb) continue;
        if(!enemy && wodHexOccupiedByEnemyCombat(nb, owner)) enemy = true;
        if(!friend && wodHexOccupiedByFriendlyCombat(nb, owner)) friend = true;
        if(enemy && friend) break;
    }
    return enemy && !friend;
}
/** Whether a unit on a cell it has not captured (or on a patch of its side's ground cut off from its towns) is still in
 *  touch with its supplied lines: supplied friendly land it can reach overland, however far it has pushed in, without
 *  passing ground the enemy's troops hold (wodSupplyCellHeldByEnemy) or a mountain. A cordon of enemy units cuts it off
 *  however thin; bare ground the enemy has painted does not. Searched up to 24 cells out (a deeper raid has outrun its
 *  supply). Only two cells used to be searched, so troops pushed three cells into enemy land, standing on the one cell
 *  they claim underfoot, counted as encircled. The answer is kept a quarter second of game time per cell and faction. */
function wodFrontlineSupplyTouch(hex,owner) {
    if(!hex||owner<=0)return false;
    const now=gameData._aiEconomyClock||0;let memo=gameData._frontSupplyMemo;
    if(!memo||memo.hexes!==gameData.hexes||now<memo.at||now-memo.at>=.25)memo=gameData._frontSupplyMemo={hexes:gameData.hexes,at:now,map:new Map()};
    const key=owner+'|'+getHexKey(hex);if(memo.map.has(key))return memo.map.get(key);
    let found=false;const seen=new Set([getHexKey(hex)]),queue=[hex],depth=new Map([[hex,0]]);
    for(let i=0;i<queue.length&&!found;i++){const h=queue[i],d=depth.get(h);
        wodSupplyNeighbors(h,n=>{
            if(found||!n||isWaterHex(n)&&!isBridgeHex(n))return;
            const k=getHexKey(n);if(seen.has(k))return;seen.add(k);
            if(wodSupplyPassable(n,owner)&&wodCurrentSupplyComponent(n,owner).city){found=true;return;}
            if(d<24&&n.type!=='mountain'&&!wodSupplyCellHeldByEnemy(n,owner)){depth.set(n,d+1);queue.push(n);}
        });
    }
    memo.map.set(key,found);return found;
}
// A cell touching open water, straight or across a corner. The supply links into water are straight only, so a beach
// that met the sea at a corner counted as dry ground and the marines on it as cut off.
function wodTouchesOpenSea(hex) {
    return !!hex&&getNeighborHexes(hex).some(n=>n&&isWaterHex(n)&&!isBridgeHex(n));
}
function wodGetUnitEncirclementState(unit, hex) {
    if(!unit||!hex||wodIsNavalUnit(unit)||unit.type==='convoy'&&(!isWaterHex(hex)||unit.convoySeaRoute))return null;
    hex=wodDiagonalLandLinkAtPoint(unit,unit.x,unit.y)||hex;
    if(!wodUnitInUnsuppliedWater(unit,hex)&&wodSupplyShipForUnit(unit))return null;
    if(isWaterHex(hex)) {
        if(!wodUnitOnBridgeDeck(unit))return wodUnitInUnsuppliedWater(unit,hex)?{relief:false,water:true}:null;
        const deck=wodNearestBridgeHexForUnit(unit,unit.x,unit.y);
        if(deck)hex=deck;
        // The bridge is only a neutral land corridor. Its builder/owner
        // does not supply it: the deck must reach an actual friendly city.
    }
    hex=wodUnitSupplyHex(unit,hex);
    if(!wodIsFriendlyOwner(hex.owner,unit.owner)) {
        const supply=wodCurrentSupplyComponent(hex,unit.owner);
        if(supply.city||unit.type==='marine'&&(supply.water||wodTouchesOpenSea(hex)))return null;
        // A unit at the front stands on ground it has not taken yet: an enemy on the
        // next tile blocks the claim. It is still in touch with its own lines, not cut
        // off, so supplied friendly land within two tiles supplies it.
        if(wodFrontlineSupplyTouch(hex,unit.owner))return null;
        const relief=(gameData.forts||[]).some(f=>wodIsFriendlyOwner(f.owner,unit.owner)&&
            Math.hypot(f.x-unit.x,f.y-unit.y)<(gameData.hexRadius||20)*3);
        return {relief};
    }
    // Territory on a townless island is captured locally, but ordinary
    // troops there still need a land-connected city for actual supply.
    const supply=wodCurrentSupplyComponent(hex,unit.owner);
    if(supply.city||unit.type==='marine'&&(supply.water||wodTouchesOpenSea(hex)))return null;
    // The tile under a front-line unit is its own even when the tiles round it are not yet:
    // it is in touch with its lines while supplied friendly land lies within two tiles.
    if(wodFrontlineSupplyTouch(hex,unit.owner))return null;
    const relief=wodHexKeyEncirclementRelief(getHexKey(hex))||(gameData.forts||[]).some(f=>
        wodIsFriendlyOwner(f.owner,unit.owner)&&Math.hypot(f.x-unit.x,f.y-unit.y)<(gameData.hexRadius||20)*3);
    return {relief};
}
