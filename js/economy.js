// Costs, casualties, income and upkeep.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

function getOwnerExpenses(owner) {
    let total = 0;
    for(let unit of gameData.entities) {
        if(unit.owner === owner && unit.hp > 0) total += getUnitUpkeep(unit);
    }
    return total;
}
function wodBuildTradeRouteLines(owner) {
    let lines = [];
    let cityByKey = {};
    for(let c of gameData.cities) {
        if(c.owner === owner) cityByKey[convoyCityKey(c)] = c;
    }
    for(let e of gameData.entities) {
        if(e.type !== 'convoy' || e.hp <= 0 || e.owner !== owner) continue;
        let fromCity = cityByKey[e.convoyFromKey];
        let fromName = (fromCity && fromCity.name) ? fromCity.name : 'Town';
        let destName = 'destination';
        if(e.convoyToKey||e.orderTarget && e.orderTarget.isCity) {
            let dest = cityByKey[e.convoyToKey]||(e.orderTarget&&findCityNearPointForOwner(e.orderTarget.x, e.orderTarget.y, owner));
            if(dest) destName = dest.name || 'Town';
        }
        let val = e.tradeValue || 150;
        let kind = e.convoySeaRoute ? 'Sea trade' : 'Land trade';
        lines.push({
            label: kind + ': ' + fromName + ' \u2192 ' + destName,
            value: '$' + formatFullCount(val),
            detail: 'One-time payout when this convoy docks. New convoys spawn about every 22s between linked cities.'
        });
    }
    let owned = gameData.cities.filter(c => c.owner === owner);
    if(owned.length >= 2 && lines.length === 0) {
        lines.push({
            label: 'Trade network',
            value: owned.length + ' cities',
            detail: 'Land convoys auto-spawn between your cities (~every 22s). Sea convoys need harbors.'
        });
    }
    return lines;
}
const WOD_RECRUIT_MANPOWER_MULT = 2;
function getUnitCost(type) {
    if(WOD_SPECIALIST_UNITS[type])return {money:WOD_SPECIALIST_UNITS[type].money,manpower:WOD_SPECIALIST_UNITS[type].manpowerCost};
    if(type === 'supply')return {money:WOD_PRICE_SUPPLY,manpower:1000};
    if(type === 'transport')return {money:WOD_PRICE_TRANSPORT,manpower:1000};
    if(type === 'heavy') return {money: WOD_PRICE_HEAVY, manpower: WOD_MANPOWER_ARMOR_DIV * WOD_RECRUIT_MANPOWER_MULT};
    if(type === 'ship') return {money: WOD_PRICE_SHIP, manpower: WOD_MANPOWER_SHIP * WOD_RECRUIT_MANPOWER_MULT};
    if(type === 'marine') return {money: WOD_PRICE_MARINE, manpower: WOD_MANPOWER_INFANTRY * WOD_RECRUIT_MANPOWER_MULT};
    return {money: WOD_PRICE_LIGHT, manpower: WOD_MANPOWER_INFANTRY * WOD_RECRUIT_MANPOWER_MULT};
}
function formatPeople(value) {
    value = Math.max(0, Math.round(value || 0));
    if(value >= 1000) {
        let thousands = value / 1000;
        return (Math.abs(thousands - Math.round(thousands)) < 0.05 ? Math.round(thousands).toString() : thousands.toFixed(1)) + 'k';
    }
    return value.toString();
}
function formatFullCount(value) {
    let n = Math.max(0, Math.round(Number(value) || 0));
    return n.toLocaleString('en-US');
}
function formatTanks(value) {
    return Math.max(0, Math.round(value || 0)).toString();
}
function getOwnerCasualties(owner) {
    if(gameData.casualtiesByOwner && gameData.casualtiesByOwner[owner]) return gameData.casualtiesByOwner[owner];
    if(owner === 1) return gameData.casualties || 0;
    return 0;
}
function getOwnerTroopKills(owner) {
    if(gameData.killsByOwner && gameData.killsByOwner[owner]) return gameData.killsByOwner[owner];
    if(owner === 1) return gameData.playerKills || 0;
    return 0;
}
function getOwnerTankKills(owner) {
    if(gameData.tankKillsByOwner && gameData.tankKillsByOwner[owner]) return gameData.tankKillsByOwner[owner];
    if(owner === 1) return gameData.playerTankKills || 0;
    return 0;
}
function getOwnerShipKills(owner) {
    if(gameData.shipKillsByOwner && gameData.shipKillsByOwner[owner]) return gameData.shipKillsByOwner[owner];
    if(owner === 1) return gameData.playerShipKills || 0;
    return 0;
}
function getOwnerTankCasualties(owner) {
    let v = (gameData.tankCasualtiesByOwner && gameData.tankCasualtiesByOwner[owner]) || 0;
    if(v) return v;
    if(owner === 1) return gameData.tankCasualties || 0;
    return 0;
}
function getOwnerCasualtyReplacementCost(owner) {
    return gameData.casualtyReplacementCostByOwner && gameData.casualtyReplacementCostByOwner[owner] || 0;
}
function addCasualtyReplacementCost(owner, dollars) {
    dollars = Math.max(0, dollars || 0);
    if(dollars <= 0) return;
    if(!gameData.casualtyReplacementCostByOwner) gameData.casualtyReplacementCostByOwner = {};
    gameData.casualtyReplacementCostByOwner[owner] = (gameData.casualtyReplacementCostByOwner[owner] || 0) + dollars;
}
function replacementMoneyFromLosses(unit, manpowerCasualties, tankLosses) {
    let mp = Math.max(0, manpowerCasualties || 0);
    let tk = Math.max(0, tankLosses || 0);
    let mi = Math.max(1, WOD_MANPOWER_INFANTRY),
        mh = Math.max(1, WOD_MANPOWER_ARMOR_DIV),
        ms = Math.max(1, WOD_MANPOWER_SHIP),
        at = Math.max(1, WOD_ARMOR_DIV_TANKS);
    if(unit.type === 'heavy') return mp * (WOD_PRICE_HEAVY / mh) + tk * (WOD_PRICE_HEAVY / at);
    if(unit.type==='supply')return mp*(WOD_PRICE_SUPPLY/Math.max(1,unit.maxManpower||500));
    if(unit.type === 'transport') return mp * (WOD_PRICE_TRANSPORT / Math.max(1,unit.maxManpower||500));
    if(wodIsNavalUnit(unit)) return mp * (WOD_PRICE_SHIP / ms);
    if(unit.type === 'convoy') return 0;
    if(WOD_SPECIALIST_UNITS[unit.type])return mp*WOD_SPECIALIST_UNITS[unit.type].money/Math.max(1,unit.maxManpower||1000);
    if(unit.type === 'marine') return mp * (WOD_PRICE_MARINE / mi);
    return mp * (WOD_PRICE_LIGHT / mi);
}
function addCasualties(owner, amount, sourceOwner = 0, unitType = 'light') {
    amount = Math.max(0, amount || 0);
    if(amount <= 0) return;
    if(!gameData.casualtiesByOwner) gameData.casualtiesByOwner = {};
    gameData.casualtiesByOwner[owner] = (gameData.casualtiesByOwner[owner] || 0) + amount;
    if(sourceOwner > 0 && owner > 0 && owner !== sourceOwner) {
        if(!gameData.killsByOwner) gameData.killsByOwner = {};
        gameData.killsByOwner[sourceOwner] = (gameData.killsByOwner[sourceOwner] || 0) + amount;
    }
    if(owner === 1) gameData.casualties = (gameData.casualties || 0) + amount;
    if(sourceOwner === 1 && owner !== 1) gameData.playerKills = (gameData.playerKills || 0) + amount;
    const killField=unitType==='marine'?'enemyMarineKills':'enemyTroopKills';
    const lossField=unitType==='marine'?'ownMarineLosses':'ownTroopLosses';
    wodRecordOwnerLifetime(owner,lossField,amount);
    if(sourceOwner>0&&sourceOwner!==owner)wodRecordOwnerLifetime(sourceOwner,killField,amount);
    if(WOD_SPECIALIST_UNITS[unitType]){
        const cls=unitType==='motorized'?'Motorized':'Mountaineer';
        wodRecordOwnerLifetime(owner,'own'+cls+'Losses',amount);
        if(sourceOwner>0&&sourceOwner!==owner)wodRecordOwnerLifetime(sourceOwner,'enemy'+cls+'Kills',amount);
    }
}
function addTankCasualties(owner, amount, sourceOwner = 0) {
    amount = Math.max(0, amount || 0);
    if(amount <= 0) return;
    if(!gameData.tankCasualtiesByOwner) gameData.tankCasualtiesByOwner = {};
    gameData.tankCasualtiesByOwner[owner] = (gameData.tankCasualtiesByOwner[owner] || 0) + amount;
    if(sourceOwner > 0 && owner > 0 && owner !== sourceOwner) {
        if(!gameData.tankKillsByOwner) gameData.tankKillsByOwner = {};
        gameData.tankKillsByOwner[sourceOwner] = (gameData.tankKillsByOwner[sourceOwner] || 0) + amount;
    }
    if(owner === 1) gameData.tankCasualties = (gameData.tankCasualties || 0) + amount;
    if(sourceOwner === 1 && owner !== 1) gameData.playerTankKills = (gameData.playerTankKills || 0) + amount;
    wodRecordOwnerLifetime(owner,'ownTankLosses',amount);
    if(sourceOwner>0&&sourceOwner!==owner)wodRecordOwnerLifetime(sourceOwner,'enemyTankKills',amount);
}
function getOwnerShipCasualties(owner) {
    let v = (gameData.shipCasualtiesByOwner && gameData.shipCasualtiesByOwner[owner]) || 0;
    if(v) return v;
    if(owner === 1) return gameData.shipCasualties || 0;
    return 0;
}
function addShipCasualties(owner, amount, sourceOwner = 0) {
    amount = Math.max(0, amount || 0);
    if(amount <= 0) return;
    if(!gameData.shipCasualtiesByOwner) gameData.shipCasualtiesByOwner = {};
    gameData.shipCasualtiesByOwner[owner] = (gameData.shipCasualtiesByOwner[owner] || 0) + amount;
    if(sourceOwner > 0 && owner > 0 && owner !== sourceOwner) {
        if(!gameData.shipKillsByOwner) gameData.shipKillsByOwner = {};
        gameData.shipKillsByOwner[sourceOwner] = (gameData.shipKillsByOwner[sourceOwner] || 0) + amount;
    }
    if(owner === 1) gameData.shipCasualties = (gameData.shipCasualties || 0) + amount;
    if(sourceOwner === 1 && owner !== 1) gameData.playerShipKills = (gameData.playerShipKills || 0) + amount;
    wodRecordOwnerLifetime(owner,'ownShipLosses',amount);
    if(sourceOwner>0&&sourceOwner!==owner)wodRecordOwnerLifetime(sourceOwner,'enemyShipKills',amount);
}
function applyDamage(unit, amount, source, cause='other') {
    if(!unit || unit.hp <= 0 || amount <= 0) return 0;
    if(unit.type !== 'convoy' && unit.manpower === undefined) unit.manpower = Math.round((unit.hp / unit.maxHp) * 1000);
    if(source>0)unit.lastAttackerOwner=source;
    let prevHpAlive = unit.hp > 0;
    let prevHp = unit.hp;
    let prevManpower = unit.manpower || 0;
    let prevTanks = unit.tanks || 0;
    unit.hp = Math.max(0, unit.hp - amount);
    const hpDamage=prevHp-unit.hp;
    const attrition=source<=0&&['supply','water','unpaid'].includes(cause);
    wodBattleMetric(unit.owner,source>0?'combatDamageTaken':attrition?'attritionDamage':'otherDamageTaken',hpDamage);
    if(attrition){unit.attritionHpLost=(unit.attritionHpLost||0)+hpDamage;wodBattleMetric(unit.owner,cause+'AttritionDamage',hpDamage);}
    if(source>0)wodBattleMetric(source,'damageDealt',hpDamage);
    let hpLossRatio = Math.max(0, (prevHp - unit.hp) / unit.maxHp);
    let casualties = unit.type === 'convoy' ? 0 : Math.min(prevManpower, hpLossRatio * (unit.maxManpower || 1000));
    if(unit.hp <= 0 && unit.type !== 'convoy') casualties = prevManpower;
    unit.manpower = Math.max(0, prevManpower - casualties);
    addCasualties(unit.owner, casualties, source, unit.type);
    if(attrition&&casualties>0){unit.attritionLosses=(unit.attritionLosses||0)+casualties;wodBattleMetric(unit.owner,'attritionPersonnelLost',casualties);}
    if(unit.type==='motorized'){
        const gear=wodMotorizedEquipment(unit),lost=hpLossRatio*gear.capacity;
        if(lost>0){
            wodRecordOwnerLifetime(unit.owner,'own'+gear.kind+'Losses',lost);
            if(source>0&&source!==unit.owner)wodRecordOwnerLifetime(source,'enemy'+gear.kind+'Kills',lost);
            if(attrition)wodBattleMetric(unit.owner,'attrition'+gear.label+'Lost',lost);
        }
    }
    if(attrition&&WOD_SPECIALIST_UNITS[unit.type])wodBattleMetric(unit.owner,unit.type==='motorized'?'attritionMotorizedPersonnelLost':'attritionMountaineerPersonnelLost',casualties);
    if(unit.type !== 'convoy') {
        unit._moraleLastHitAt=gameData._aiEconomyClock||0;
        unit.morale = Math.max(0, (unit.morale != null ? unit.morale : WOD_MORALE_MAX) - (amount / unit.maxHp) * 60);
        unit.losses = (unit.losses || 0) + casualties;
    }
    let tankLosses = 0;
    if(unit.type === 'heavy') {
        tankLosses = Math.min(prevTanks, hpLossRatio * 500);
        if(unit.hp <= 0) tankLosses = prevTanks;
        unit.tanks = Math.max(0, prevTanks - tankLosses);
        if(tankLosses > 0) unit.tankLosses = (unit.tankLosses || 0) + tankLosses;
        addTankCasualties(unit.owner, tankLosses, source);
        if(attrition&&tankLosses>0){unit.attritionTankLosses=(unit.attritionTankLosses||0)+tankLosses;wodBattleMetric(unit.owner,'attritionArmorLost',tankLosses);}
    }
    if(wodIsNavalUnit(unit) && prevHpAlive && unit.hp <= 0) {
        addShipCasualties(unit.owner, 1, source);
        if(attrition)wodBattleMetric(unit.owner,'attritionVesselsLost');
    }
    // Resolve passengers before the dead carrier can be removed by the
    // combat loop; waiting until the next transport tick lost casualties.
    if(unit.type==='transport'&&prevHpAlive&&unit.hp<=0){
        const passenger=unit.cargo;unit.cargo=null;
        if(passenger){passenger.x=unit.x;passenger.y=unit.y;applyDamage(passenger,passenger.hp,source,cause);}
        if(unit.pickupUid){const waiting=gameData.entities.find(u=>u.uid===unit.pickupUid);if(waiting){waiting.boardTransportUid=null;waiting._wodBoardingNoWater=false;waiting._needsTransport=true;wodClearTransportMove(waiting);}unit.pickupUid=null;unit.pickupLandKey=null;}
    }
    if(prevHpAlive && unit.hp <= 0 && unit.type !== 'convoy') {
        wodBattleMetric(unit.owner,'unitsLost');if(attrition)wodBattleMetric(unit.owner,'attritionUnitsLost');if(source>0)wodBattleMetric(source,'unitsDestroyed');
        wodRenumberOwnerUnits(unit.owner);
        let killer = (source && typeof source === 'object' && source.owner != null)
            ? source.owner
            : (typeof source === 'number' ? source : 0);
        if(killer === 1 && unit.owner !== 1)
            gameData.playerUnitsKilled = (gameData.playerUnitsKilled || 0) + 1;
    }
    let repCost = replacementMoneyFromLosses(unit, casualties, tankLosses);
    if(repCost > 0) addCasualtyReplacementCost(unit.owner, repCost);
    return casualties;
}
function canAffordUnit(owner, type) {
    let cost = getUnitCost(type);
    if(owner === 1) return gameData.money >= cost.money && (gameData.manpower || 0) >= cost.manpower;
    return (gameData.aiMoneyByOwner[owner] || 0) >= cost.money && (gameData.aiManpowerByOwner[owner] || 0) >= cost.manpower;
}
function spendForUnit(owner, type) {
    let cost = getUnitCost(type);
    if(!canAffordUnit(owner,type))return false;
    wodBattleMetric(owner,'moneySpent',cost.money);wodBattleMetric(owner,'manpowerCommitted',cost.manpower);
    if(owner === 1) {
        if(!canAffordUnit(owner, type)) return false;
        gameData.money = Math.max(0, gameData.money - cost.money);
        gameData.manpower = Math.max(0, (gameData.manpower || 0) - cost.manpower);
        return true;
    }
    if(!canAffordUnit(owner, type)) return false;
    gameData.aiMoneyByOwner[owner] = Math.max(0, (gameData.aiMoneyByOwner[owner] || 0) - cost.money);
    gameData.aiManpowerByOwner[owner] = Math.max(0, (gameData.aiManpowerByOwner[owner] || 0) - cost.manpower);
    return true;
}
// Flat numeric index over gameData.hexes. Cell lookups are the hottest call in the
// simulation; building a "q,r" string for each one dominated movement and AI time.
// Hits come from the array; anything else falls back to the keyed object, so maps
// that are still being filled or edited always resolve exactly as before.
let _wodHexIdx = null;
