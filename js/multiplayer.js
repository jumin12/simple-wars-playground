// Multiplayer lobby, host snapshots and guest commands.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

function wodSpectatorSurvivors(excludeLocal=false) {
    const lo=wodLocalPlayerOwner(),dead=new Set(gameData.mp?.eliminatedSlots||[]);
    if(gameData._spectator||excludeLocal)dead.add(lo);
    return [...new Set(gameData.cities.filter(c=>c.owner>0).map(c=>c.owner))].filter(o=>!dead.has(o)&&
        (gameData.victoryMode!=='annihilation'||countFriendlyCombatExcludingConvoys(o)>0));
}
function wodPrepareSpectatorChoice(outcome) {
    if(outcome!=='defeat'||wodSpectatorSurvivors(true).length<2)return false;
    gameData._spectator={active:false,finished:false,outcome,slot:wodLocalPlayerOwner()};
    return true;
}
function wodSyncSpectatorUi() {
    const state=gameData._spectator;
    document.body.classList.toggle('wod-spectating',!!state&&!state.finished);
    document.getElementById('wodSpectateMatch')?.classList.toggle('hidden',!state||state.finished);
    const bar=document.getElementById('wodSpectatorBar');bar?.classList.toggle('hidden',!state?.active||state.finished);
    const remaining=document.getElementById('wodSpectatorRemaining');if(remaining)remaining.textContent=wodSpectatorSurvivors().length+' factions remain';
}
function wodSaveSpectatorReport() {
    if(!gameData.mp?.enabled||!gameData._spectator||gameData._restoringSpectator)return;
    const report={code:WodMultiplayer.api.code,slot:wodLocalPlayerOwner(),ledger:wodBattleLedger().id,match:gameData._lifetimeMatch,active:gameData._spectator.active,
        title:document.getElementById('campaignSummaryTitle')?.textContent,sub:document.getElementById('campaignSummarySub')?.textContent,stats:document.getElementById('campaignSummaryStats')?.innerHTML};
    window._wodSpectatorReport=report;try{sessionStorage.setItem('wodSpectatorReport',JSON.stringify(report));}catch(_){}
}
function wodReadSpectatorReport() {
    try{const r=window._wodSpectatorReport||JSON.parse(sessionStorage.getItem('wodSpectatorReport')||'null');return r?.code===WodMultiplayer.api.code&&r.slot===wodLocalPlayerOwner()?r:null;}catch(_){return null;}
}
function wodStartSpectating() {
    const state=gameData._spectator;if(!state||state.finished)return;
    state.active=true;hideCampaignSummaryOverlay();gameData._campaignEnded=false;
    gameData._fogCanvasDirty=true;gameData._fogVisionTimer=1;setGameSpeed(1,true);wodSyncSpectatorUi();wodFrameSpectatorBattle();wodSaveSpectatorReport();
}
function wodFrameSpectatorBattle() {
    if(!gameData._spectator?.active)return;
    const owners=new Set(wodSpectatorSurvivors()),points=gameData.entities.filter(u=>u.hp>0&&owners.has(u.owner));
    if(!points.length)points.push(...gameData.cities.filter(c=>owners.has(c.owner)));
    if(!points.length)return;
    const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
    const w=canvas.clientWidth,h=canvas.clientHeight,zoom=Math.min(1.5,Math.max(.15,Math.min((w-60)/(maxX-minX+180),(h-200)/(maxY-minY+180))));
    gameData.camera={zoom,x:(minX+maxX)/2*zoom-w/2,y:(minY+maxY)/2*zoom-h/2};
}
function wodShowSpectatorResult() {
    if(!gameData._spectator)return;
    document.getElementById('campaignSummaryOverlay')?.classList.remove('hidden');wodSyncSpectatorUi();
}
function wodFinishSpectating(winner) {
    const state=gameData._spectator;if(!state||state.finished)return;
    state.finished=true;gameData._campaignEnded=true;setGameSpeed(0,true);
    const name=winner?wodBattleOwnerLabel(winner):'The remaining factions';
    document.getElementById('campaignSummarySub').textContent='Battle finished. '+name+' won. Your result was recorded when you left the battle.';
    wodSyncSpectatorUi();wodShowSpectatorResult();
}
function wodCheckSpectatorEnd() {
    if(!gameData._spectator||gameData._spectator.finished)return;
    const left=wodSpectatorSurvivors();wodSyncSpectatorUi();
    if(!gameData.mp?.enabled&&left.length<=1)wodFinishSpectating(left[0]);
}
function wodMpClampLobbyCap(raw) {
    return Math.max(2, Math.min(WOD_MP_MAX_PLAYERS, parseInt(raw, 10) || WOD_MP_MAX_PLAYERS));
}
function wodPlayerMpPool(owner) {
    if(owner === 1) return gameData.manpower || 0;
    return (gameData.aiManpowerByOwner && gameData.aiManpowerByOwner[owner]) || 0;
}
function wodSetMpMatchUiFlag(on) {
    let root = document.getElementById('inGameUI');
    if(!root) return;
    if(on) {
        root.classList.add('wod-mp-match');
        setGameSpeed(1);
    } else root.classList.remove('wod-mp-match');
}
function wodMpIsHumanOwner(owner) {
    if(!gameData.mp || !gameData.mp.enabled) return owner === 1;
    if(!wodMpSeatTypeIsHuman(owner)) return false;
    if(wodMpIsSlotEliminated(owner)) return false;
    let localSlot = gameData.mp.localSlot | 0;
    if(localSlot > 0 && owner === localSlot && wodMpMatchCanPlay()) return true;
    let conn = gameData.mp.connectedSlots;
    if(conn && conn.length && conn.indexOf(owner) < 0) return false;
    return true;
}
/** Freeze seat→playerId mapping at match start so disconnected players still get match-end stats. */
function wodMpFreezeSeatPlayerMap() {
    if(!gameData.mp || !gameData.mp.enabled) return;
    let seatMap = gameData.mp.seatPlayerIds || {};
    let pub = gameData.mp.playerPublic
        || (window.wodMpRoomMeta && window.wodMpRoomMeta.playerPublic)
        || {};
    for(let slot of gameData.mp.humanSlots || []) {
        let pp = pub[String(slot)] || {};
        let pid = pp.playerId || '';
        if(pid) seatMap[String(slot)] = pid;
    }
    gameData.mp.seatPlayerIds = seatMap;
}
function wodMpFlushStatsToServer() {
    scheduleSaveWodProgress();
    if(typeof wodCloudCanSync === 'function' && wodCloudCanSync()) scheduleCloudSyncProgress();
    wodMpRegisterWithServer();
}
function wodMpCollectLayoutHumanSeats(meta) {
    if(!meta || typeof meta !== 'object') return [1];
    wodMpNormalizeLobbyMeta(meta);
    let st = meta.seatTypes || [];
    let out = [];
    for(let s = 1; s <= WOD_MP_MAX_PLAYERS; s++) {
        if((st[s - 1] || 'human') === 'human') out.push(s);
    }
    return out.length ? out : [1];
}
/** Active lobby factions (human + bot seats, not closed) — drives mapgen player count. */
function wodMpGetLobbyFactionSlotsFromMeta(meta) {
    if(!meta || typeof meta !== 'object') return [1];
    wodMpNormalizeLobbyMeta(meta);
    let st = meta.seatTypes || [];
    let out = [];
    for(let s = 1; s <= WOD_MP_MAX_PLAYERS; s++) {
        if((st[s - 1] || 'human') === 'closed') continue;
        out.push(s);
    }
    return out.length ? out : [1];
}
function wodMpSeatTypeIsHuman(slot) {
    if(!gameData.mp || !gameData.mp.enabled) return slot === 1;
    let st = gameData.mp.seatTypes;
    let maxH = gameData.mp.maxLobbySlots || WOD_MP_MAX_PLAYERS;
    if(!st || slot < 1 || slot > maxH) return false;
    return (st[slot - 1] || 'human') === 'human';
}
function wodMpHostMarkSlotDisconnected(slot) {
    if(!gameData.mp || !gameData.mp.enabled || !gameData.mp.isHost || !slot) return;
    if(!gameData.mp.connectedSlots) gameData.mp.connectedSlots = (gameData.mp.humanSlots || []).slice();
    let i = gameData.mp.connectedSlots.indexOf(slot);
    if(i >= 0) gameData.mp.connectedSlots.splice(i, 1);
    if(!gameData.mp.aiControlledSlots) gameData.mp.aiControlledSlots = [];
    if(gameData.mp.aiControlledSlots.indexOf(slot) < 0) gameData.mp.aiControlledSlots.push(slot);
    showNotification('Seat ' + slot + ' disconnected — AI controls their forces until they return.');
    wodMpHostEmitSnapshot();
}
function wodMpEnsureLocalSlotConnected() {
    if(!gameData.mp || !gameData.mp.enabled) return;
    let slot = gameData.mp.localSlot | 0;
    if(!slot || !wodMpSeatTypeIsHuman(slot)) return;
    if(!gameData.mp.connectedSlots) gameData.mp.connectedSlots = [];
    if(gameData.mp.connectedSlots.indexOf(slot) < 0) gameData.mp.connectedSlots.push(slot);
    if(gameData.mp.aiControlledSlots) {
        let ai = gameData.mp.aiControlledSlots.indexOf(slot);
        if(ai >= 0) gameData.mp.aiControlledSlots.splice(ai, 1);
    }
}
function wodMpHostMarkSlotReconnected(slot) {
    if(!gameData.mp || !gameData.mp.enabled || !gameData.mp.isHost || !slot) return;
    if(!gameData.mp.connectedSlots) gameData.mp.connectedSlots = [];
    if(gameData.mp.connectedSlots.indexOf(slot) < 0) gameData.mp.connectedSlots.push(slot);
    if(gameData.mp.aiControlledSlots) {
        let ai = gameData.mp.aiControlledSlots.indexOf(slot);
        if(ai >= 0) gameData.mp.aiControlledSlots.splice(ai, 1);
    }
    showNotification('Seat ' + slot + ' reconnected and resumed control.');
    wodMpHostEmitSnapshot();
}
function wodMpSaveSession() {
    if(typeof WodMultiplayer === 'undefined' || !WodMultiplayer.api || !WodMultiplayer.api.code) return;
    wodEnsurePlayerId();
    let inMatch = gameState === 'PLAYING' && gameData.mp && gameData.mp.enabled;
    window._wodMpInMatch = !!inMatch;
    window._wodMpSession = {
        code: WodMultiplayer.api.code,
        slot: WodMultiplayer.api.slot | 0,
        isHost: !!WodMultiplayer.api.isHost,
        inMatch: !!inMatch,
        playerId: (wodProgress && wodProgress.profile && wodProgress.profile.playerId) || ''
    };
}
function wodMpClearSession() {
    window._wodMpInMatch = false;
    window._wodMpSession = null;
}
async function wodMpReconnectToMatch(sess, attempt) {
    attempt = attempt | 0;
    if(!sess || !sess.code || !sess.inMatch) return false;
    if(gameState !== 'PLAYING' || !gameData.mp || !gameData.mp.enabled) return false;
    if(typeof WodMultiplayer === 'undefined') return false;
    let delay = Math.min(30000, Math.round(1500 * Math.pow(1.45, attempt)));
    try {
        await wodMpEnsureConnected();
        wodMpRegisterWithServer();
        wodEnsurePlayerId();
        let pid = sess.playerId || (wodProgress && wodProgress.profile && wodProgress.profile.playerId) || '';
        if(WodMultiplayer.rejoinMatch)
            await WodMultiplayer.rejoinMatch(sess.code, pid);
        else
            await wodMpJoinWithPassword(sess.code,false,{playerId:pid,rejoin:true});
        wodMpSaveSession();
        return true;
    } catch(e) {
        if(attempt >= 8) {
            showNotification('Could not reconnect to the match.');
            return false;
        }
        await new Promise(r => setTimeout(r, delay));
        return wodMpReconnectToMatch(sess, attempt + 1);
    }
}
function wodMpLeaveActiveMatch() {
    if(!gameData.mp || !gameData.mp.enabled || gameState !== 'PLAYING') return false;
    if(gameData._lifetimeMatch&&!gameData._lifetimeMatch.mpOutcomeRecorded) {
        gameData._lifetimeMatch.mpOutcomeRecorded=true;wodMpRecordLocalMultiplayerOutcome('lost');
    }
    wodMpFlushStatsToServer();
    if(typeof WodMultiplayer !== 'undefined' && WodMultiplayer.leaveLobby)
        WodMultiplayer.forfeitMatch();
    else if(!gameData.mp.isHost && typeof WodMultiplayer !== 'undefined' && WodMultiplayer.sendCmd)
        WodMultiplayer.sendCmd({ kind: 'forfeit' });
    wodMpClearSession();
    return true;
}
/** All non-closed lobby seats (humans + bots), in order — used for mapgen / starting borders so preview matches launch. */
function wodGetLobbyLayoutFactionSlots() {
    if(!gameData.mp || !gameData.mp.enabled) return null;
    if(gameData._wodMpLaunchFactionSlots && gameData._wodMpLaunchFactionSlots.length)
        return gameData._wodMpLaunchFactionSlots.slice().sort((a, b) => a - b);
    if(gameData.mp.factionSlots && gameData.mp.factionSlots.length)
        return gameData.mp.factionSlots.slice().sort((a, b) => a - b);
    let maxH = gameData.mp.maxLobbySlots || WOD_MP_MAX_PLAYERS;
    let st = gameData.mp.seatTypes || [];
    let out = [];
    for(let s = 1; s <= maxH; s++) {
        if((st[s - 1] || 'human') === 'closed') continue;
        out.push(s);
    }
    return out.length ? out : null;
}
function wodMpLobbyPreviewSeed(meta) {
    if(!meta || typeof meta !== 'object') return 0x9e3779b9;
    let v = meta.lobbyMapSeed;
    let s = (v != null && v !== '') ? (parseInt(v, 10) >>> 0) : 0;
    if(!s) s = (((parseInt(meta.mapSize, 10) || 60) * 1315423911) ^ (String(meta.mapShape || '').length * 2246822519)) >>> 0;
    return s || 0x6a09e667;
}
function wodStripBridgeForNet(b) {
    let br = wodNormalizeBridgeRecord(b);
    if(!br) return null;
    wodSyncBridgeWorldCoords(br);
    return {
        id: br.id,
        owner: br.owner || 0,
        q: br.q,
        r: br.r,
        hexKeys: br.hexKeys ? br.hexKeys.slice() : null,
        x: br.x,
        y: br.y,
        w: br.w,
        h: br.h,
        angle: br.angle || 0,
        // Water cells a dragged span was priced for; absent on fixed-length bridges from older maps.
        cells: br.cells || undefined
    };
}
function wodMpAllFactionSlotsForScoreboard() {
    let set = new Set();
    let act = (gameData.mp && gameData.mp.enabled) ? wodGetActiveFactionSlotsForMap() : null;
    if(act) for(let s of act) set.add(s);
    for(let c of gameData.cities) if(c.owner > 0) set.add(c.owner);
    for(let u of gameData.entities) {
        if(u.owner > 0 && u.hp > 0 && u.type !== 'convoy') set.add(u.owner);
    }
    return [...set].sort((a, b) => a - b);
}
function wodHudManpower() {
    let o = wodLocalPlayerOwner();
    if(!gameData.mp || !gameData.mp.enabled) return gameData.manpower || 0;
    if(o === 1) return gameData.manpower || 0;
    return (gameData.aiManpowerByOwner && gameData.aiManpowerByOwner[o]) || 0;
}
function wodMpEconomyHudForOwner(owner) {
    let incomeTick = getOwnerIncome(owner), manpowerTick = 0;
    for(let ci = 0, cl = gameData.cities.length; ci < cl; ci++) {
        let city = gameData.cities[ci];
        if(city.owner !== owner) continue;
        manpowerTick += getCityManpowerIncome(city);
    }
    let upkeep = 0;
    for(let ei = 0, elen = gameData.entities.length; ei < elen; ei++) {
        let u = gameData.entities[ei];
        if(u.hp <= 0 || u.owner !== owner) continue;
        upkeep += getUnitUpkeep(u);
    }
    return { income: incomeTick, expenses: upkeep, manpowerIncome: manpowerTick };
}
function wodStripHexForNet(h) {
    return {
        q: h.q, r: h.r, x: h.x, y: h.y, type: h.type, owner: h.owner,
        baseColor: h.baseColor, renderColor: h.renderColor,
        urbanVariant: h.urbanVariant, cityId: h.cityId
    };
}
function wodStripEntityForNet(u) {
    let tgt = u.target ? { x: u.target.x, y: u.target.y, isCity: !!u.target.isCity, pathPrepared: !!u.target.pathPrepared } : null;
    let ot = u.orderTarget ? {
        x: u.orderTarget.x,
        y: u.orderTarget.y,
        isCity: !!u.orderTarget.isCity,
        intoWater: !!u.orderTarget.intoWater
    } : null;
    let pth = u.path ? u.path.map(p => ({ x: p.x, y: p.y })) : null;
    let fmw = u.fullMarchWaypoints ? u.fullMarchWaypoints.map(p => ({ x: p.x, y: p.y })) : null;
    return {
        uid: u.uid, type: u.type, owner: u.owner, name: u.name, isGeneral: !!u.isGeneral,
        cargo:u.cargo?wodStripEntityForNet(u.cargo):null,pickupUid:u.pickupUid||null,pickupLandKey:u.pickupLandKey||null,boardTransportUid:u.boardTransportUid||null,unloadHexKey:u.unloadHexKey||null,unloadGoal:u.unloadGoal||null,ferryGoal:u.ferryGoal||null,
        x: u.x, y: u.y, hp: u.hp, maxHp: u.maxHp, speed: u.speed, damage: u.damage,
        range: u.range, attackCooldown: u.attackCooldown, radius: u.radius,
        morale: u.morale, maxMorale: u.maxMorale, moraleBroken: !!u.moraleBroken, retreating: !!u.retreating,
        preferredTargetUid:u.preferredTargetUid||null,
        _wodAttackOrder:u._wodAttackOrder?{uid:u._wodAttackOrder.uid,lastSeen:u._wodAttackOrder.lastSeen}:null,_wodAttackApproaching:!!u._wodAttackApproaching,
        manpower: u.manpower, maxManpower: u.maxManpower, tanks: u.tanks, maxTanks: u.maxTanks,
        xp: u.xp || 0, kills: u.kills || 0, losses: u.losses || 0, veteran: !!u.veteran,
        convoySeaRoute: !!u.convoySeaRoute, tradeValue: u.tradeValue, convoyFromKey:u.convoyFromKey||null,convoyToKey:u.convoyToKey||null,convoyDock:u.convoyDock||null,shake: u.shake || 0,
        combatTargetUid:u.combatTargetUid||null, spawnFx: u.spawnFx || 0, activeCombatVisual: u.activeCombatVisual || 0, encircledFlash: u.encircledFlash || 0,
        healingFlash: u.healingFlash || 0, waterFlash: u.waterFlash || 0, waterExposureSeconds:u.waterExposureSeconds||0,supplyPendingSeconds:u.supplyPendingSeconds||0,outOfSupplySeconds:u.outOfSupplySeconds||0,attritionLosses:u.attritionLosses||0,attritionTankLosses:u.attritionTankLosses||0,attritionHpLost:u.attritionHpLost||0, unpaidFlash: u.unpaidFlash || 0,
        target: tgt, orderTarget: ot, path: pth, fullMarchWaypoints: fmw, marchWpCursor: u.marchWpCursor || 0, _wodKeepLandFormation:!!u._wodKeepLandFormation, _wodShoreExitRouting:!!u._wodShoreExitRouting, _wodRiskRetreat:!!u._wodRiskRetreat
    };
}
function wodEntityFromNet(d) {
    let u = Object.assign({}, d);
    if(d.cargo)u.cargo=wodEntityFromNet(d.cargo);
    if(d.target) u.target = Object.assign({}, d.target);
    if(d.orderTarget) u.orderTarget = Object.assign({}, d.orderTarget);
    if(d.path) u.path = d.path.map(p => Object.assign({}, p));
    if(d.fullMarchWaypoints) u.fullMarchWaypoints = d.fullMarchWaypoints.map(p => Object.assign({}, p));
    if(u.orderTarget && u.orderTarget.intoWater) u._wodOrderIntoWater = true;
    u.selected = false;
    return u;
}
function wodMpNormalizeHexListTerrainColors(list) {
    if(!list) return;
    for(let i = 0; i < list.length; i++) {
        let h = list[i];
        if(!h || !h.type) continue;
        if(isWaterHex(h))h.owner=0;
        if(!h.baseColor) h.baseColor = getTerrainColor(h.type);
        if(!h.renderColor) h.renderColor = h.baseColor;
    }
}
function wodMpClearTerrainCachesForNewMatch() {
    wodMarkTerrainFullDirty();
    wodTerrainBakeNextMs = 0;
    wodTerrainPolWork = null;
    wodTerrainBaseBuilt = false;
    terrainNeedsUpdate = true;
    if(typeof terrainCanvas !== 'undefined' && terrainCanvas) {
        terrainCanvas.width = 1;
        terrainCanvas.height = 1;
    }
    if(typeof terrainBaseCanvas !== 'undefined' && terrainBaseCanvas) {
        terrainBaseCanvas.width = 1;
        terrainBaseCanvas.height = 1;
    }
    gameData._fogCanvasDirty = true;
    gameData._fogExplored = new Set();
    gameData._fogVisible = null;
}
function wodMpEnsureDefaultMatchLayers(reset=false) {
    if(!gameData.layers) gameData.layers = {};
    let defaults = {
        terrain: true, diplomacy: true, territory: false, cities: false,
        cityNames: true, structures: true, units: true
    };
    for(let k of Object.keys(defaults)) {
        if(reset || gameData.layers[k] === undefined) gameData.layers[k] = defaults[k];
    }
    if(gameData.layers.terrain !== false) gameData.terrainViewMode = 'natural';
}
function wodMpEnsureMatchStartingUnits(factionSlots) {
    if(gameData.entities && gameData.entities.length) return;
    let owners = (factionSlots && factionSlots.length)
        ? factionSlots.slice()
        : (gameData.mp && gameData.mp.factionSlots && gameData.mp.factionSlots.length)
            ? gameData.mp.factionSlots.slice()
            : wodGetLobbyLayoutFactionSlots();
    if(!owners || !owners.length) return;
    spawnInitialFrontlineUnits(owners);
    for(let u of gameData.entities) ensureUnitId(u);
}
function wodMpRefreshMatchViewportAndTerrain() {
    wodMpEnsureDefaultMatchLayers();
    wodSyncViewportAndCanvas();
    wodMarkTerrainFullDirty();
    wodTerrainBakeNextMs = 0;
    wodTerrainPolWork = null;
    gameData._fogCanvasDirty = true;
    normalizeTerrainHexes();
    updateTerrainKey({ skipHelp: true });
    if(typeof updateTerrainCache === 'function') updateTerrainCache();
}
function wodMpBuildInitPayload() {
    let maxL = (gameData.mp && gameData.mp.maxLobbySlots) || WOD_MP_MAX_PLAYERS;
    let st = (gameData.mp && gameData.mp.seatTypes) ? gameData.mp.seatTypes.slice(0, maxL) : [];
    let factions = (gameData.mp && gameData.mp.factionSlots && gameData.mp.factionSlots.length)
        ? gameData.mp.factionSlots.slice()
        : wodMpGetLobbyFactionSlotsFromMeta({ maxHumans: maxL, seatTypes: st });
    let hs = (gameData.mp && gameData.mp.humanSlots) ? gameData.mp.humanSlots.slice() : factions.slice();
    let conn = gameData.mp && gameData.mp.connectedSlots ? gameData.mp.connectedSlots.slice() : hs.slice();
    wodMpEnsureMatchStartingUnits(factions);
    return {
        v: 1,
        hexList: (gameData.hexList || []).map(wodStripHexForNet),
        cities: (gameData.cities || []).map(c => ({
            id: c.id, name: c.name, x: c.x, y: c.y, q: c.q, r: c.r, owner: c.owner,
            hasFactory: !!c.hasFactory, hasHarbor: !!c.hasHarbor, hasFarm: !!c.hasFarm, hp: c.hp, maxHp: c.maxHp,
            urbanStyle: c.urbanStyle, incomeBonus: c.incomeBonus, manpowerBonus: c.manpowerBonus
        })),
        entities: (gameData.entities || []).map(wodStripEntityForNet),
        mapRadius: gameData.mapRadius,
        mapShape: gameData.mapShape,
        hexRadius: gameData.hexRadius,
        aiCount: gameData.aiCount, aiCommanderStyle:gameData.aiCommanderStyle||'varied',aiCommanderProfiles:gameData.aiCommanderProfiles||{},
        victoryMode: gameData.victoryMode,
        alliances: wodNormalizeAlliances(gameData.alliances),
        humanSlots: hs,
        factionSlots: factions,
        connectedSlots: conn,
        seatTypes: st,
        maxLobbySlots: maxL,
        expectedReady: conn.slice().sort((a, b) => a - b),
        money: gameData.money,
        manpower: gameData.manpower,
        income: gameData.income,
        expenses: gameData.expenses,
        manpowerIncome: gameData.manpowerIncome,
        aiMoneyByOwner: Object.assign({}, gameData.aiMoneyByOwner),
        aiManpowerByOwner: Object.assign({}, gameData.aiManpowerByOwner),
        factionColors: factionColors.slice(),
        roads: (gameData.roads || []).map(r => ({ fq: r.from.q, fr: r.from.r, tq: r.to.q, tr: r.to.r,...wodRoadRouteFields(r) })),
        hospitals: (gameData.hospitals || []).map(h => ({...h})),
        forts: (gameData.forts || []).map(f => ({ id: f.id, owner: f.owner, q: f.q, r: f.r, x: f.x, y: f.y })),
        bridges: (gameData.bridges || []).map(wodStripBridgeForNet).filter(Boolean),
        mapGenSeed: (gameData._mapGenSeed >>> 0) || 0,
        playerPublic: (window.wodMpRoomMeta && window.wodMpRoomMeta.playerPublic && typeof window.wodMpRoomMeta.playerPublic === 'object')
            ? JSON.parse(JSON.stringify(window.wodMpRoomMeta.playerPublic))
            : {}
    };
}
function wodMpRebuildHexesFromList(list) {
    if(!list || !list.length) {
        gameData.hexes = {};
        gameData.hexList = [];
        return;
    }
    let hexes = {};
    let hexList = new Array(list.length);
    for(let i = 0; i < list.length; i++) {
        let h = list[i];
        hexList[i] = h;
        hexes[h.q + ',' + h.r] = h;
    }
    gameData.hexes = hexes;
    gameData.hexList = hexList;
    wodMpNormalizeHexListTerrainColors(hexList);
}
async function wodMpRebuildHexesFromListAsync(list) {
    if(!list || !list.length) {
        gameData.hexes = {};
        gameData.hexList = [];
        return;
    }
    let hexes = {};
    let hexList = new Array(list.length);
    let chunk = 3000;
    for(let i = 0; i < list.length; i++) {
        let h = list[i];
        hexList[i] = h;
        hexes[h.q + ',' + h.r] = h;
        if(i > 0 && (i % chunk) === 0) await new Promise(r => requestAnimationFrame(r));
    }
    gameData.hexes = hexes;
    gameData.hexList = hexList;
    wodMpNormalizeHexListTerrainColors(hexList);
}
function wodMpIsLobbyPreviewHost() {
    return typeof WodMultiplayer !== 'undefined' && WodMultiplayer.api && WodMultiplayer.api.isHost;
}
function wodMpRenderGuestLobbyPreviewPlaceholder() {
    if(_wodMpGuestLobbyPreviewFp) return;
    let c = document.getElementById('mpLobbyMapPreview');
    if(!c) return;
    let ctx = c.getContext('2d');
    if(!ctx) return;
    let rect = c.getBoundingClientRect();
    c.width = Math.max(80, Math.floor(rect.width) || 360);
    c.height = Math.max(60, Math.floor(rect.height) || 200);
    ctx.fillStyle = '#1a2634';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(236, 240, 241, 0.88)';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Waiting for host map preview…', c.width / 2, c.height / 2 - 6);
    ctx.fillStyle = 'rgba(236, 240, 241, 0.58)';
    ctx.font = '11px sans-serif';
    ctx.fillText('Updates when the host changes map or seats', c.width / 2, c.height / 2 + 14);
    wodDisarmMapPreviewSpinner('mpLobbyMapPreview');
}
function wodMpCanUsePoliticsOnlyForMeta(meta) {
    if(!meta || typeof meta !== 'object') return false;
    let terrainFp = wodMpLobbyTerrainFingerprint(meta);
    if(!_wodMpLobbyPreviewLastTerrainFp || _wodMpLobbyPreviewLastTerrainFp !== terrainFp) return false;
    let cm = _wodMpCommittedLobbyMap;
    return !!(cm && cm.data && cm.data.hexList && cm.data.hexList.length &&
        cm.terrainFp === terrainFp && wodMpLobbyPreviewHasLand(cm.data));
}
/** Load committed lobby terrain into live state so politics-only regen matches solo seat-count changes. */
function wodMpPrepareLobbyTerrainForPoliticsRegen(meta) {
    if(!meta || typeof meta !== 'object') return false;
    if(wodCanRegeneratePoliticsOnly()) {
        wodRestoreTerrainPoliticsBase();
        return true;
    }
    let cm = _wodMpCommittedLobbyMap;
    if(!cm || !cm.data || !cm.data.hexList || !cm.data.hexList.length) return false;
    if(!_wodMpLobbyPreviewLastTerrainFp || _wodMpLobbyPreviewLastTerrainFp !== wodMpLobbyTerrainFingerprint(meta)) return false;
    if(!wodMpLobbyPreviewHasLand(cm.data)) return false;
    wodMpApplyDeepMapSnapshot(cm.data);
    if(cm.data._mpTerrainPoliticsBase && cm.data._mpTerrainPoliticsBaseFp === wodTerrainOnlyFingerprint()) {
        gameData._wodTerrainPoliticsBase = JSON.parse(JSON.stringify(cm.data._mpTerrainPoliticsBase));
        gameData._wodTerrainPoliticsBridges = JSON.parse(JSON.stringify(cm.data._mpTerrainPoliticsBridges || []));
        gameData._wodTerrainPoliticsBaseFp = cm.data._mpTerrainPoliticsBaseFp;
    } else {
        wodCaptureTerrainPoliticsBase();
    }
    wodRestoreTerrainPoliticsBase();
    return wodCanRegeneratePoliticsOnly();
}
function wodMpLobbyPreviewHasLand(snap) {
    let list = (snap && snap.hexList) || gameData.hexList || [];
    for(let i = 0; i < list.length; i++) {
        let h = list[i];
        if(h && !isWaterHex(h)) return true;
    }
    return false;
}
function wodMpLobbyPreviewMapValid(meta, snap) {
    if(!meta || !wodMpLobbyPreviewHasLand(snap)) return false;
    return wodMpLobbyMapMatchesMeta(meta, snap || null);
}
function wodMpTryPaintLobbyPreviewCanvas(meta) {
    return wodMpHostPaintLobbyPreviewFromCommitted(meta);
}
async function wodMpApplyMatchStartPayload(p, opts) {
    opts = opts || {};
    if(!p || !p.hexList || !p.hexList.length) throw new Error('Match start payload has no map');
    gameData._mpLoadingMatch=true;
    try {
    wodMpNormalizeHexListTerrainColors(p.hexList);
    if(opts.asyncHexes) await wodMpRebuildHexesFromListAsync(p.hexList);
    else wodMpRebuildHexesFromList(p.hexList);
    gameData.cities = (p.cities || []).map(c => Object.assign({}, c));
    if(!opts.resumeMatch)wodNormalizeStartingCityEconomy();
    gameData.constructionJobs = [];
    gameData.roads = (p.roads || []).map(ro => {
        let from = gameData.cities.find(c => c.q === ro.fq && c.r === ro.fr);
        let to = gameData.cities.find(c => c.q === ro.tq && c.r === ro.tr);
        return from && to ? { from, to,...wodRoadRouteFields(ro) } : null;
    }).filter(Boolean);
    gameData.hospitals = (p.hospitals || []).map(h => ({...h}));
    gameData.forts = (p.forts || []).map(f => {
        let o = Object.assign({}, f);
        let he = wodHexAt(o.q,o.r);
        if(he) {
            o.x = he.x;
            o.y = he.y;
        }
        return o;
    });
    gameData.bridges = (p.bridges || []).map(b => wodNormalizeBridgeRecord(b)).filter(Boolean);
    for(let br of gameData.bridges) wodSyncBridgeWorldCoords(br);
    wodRebuildBridgeHexIndex();
    gameData.entities = [];
    gameData._generalMap = null;
    for(let ed of (p.entities || [])) {
        let u = wodEntityFromNet(ed);
        gameData.entities.push(u);
        ensureUnitId(u);
    }
    wodMpEnsureMatchStartingUnits(p.factionSlots);
    gameData.mapRadius = p.mapRadius;
    gameData.mapShape = p.mapShape;
    gameData.hexRadius = p.hexRadius;
    gameData.aiCount = p.aiCount;
    gameData.victoryMode = p.victoryMode || 'domination';
    gameData.alliances = wodNormalizeAlliances(p.alliances);
    gameData.money = p.money;
    gameData.manpower = p.manpower;
    gameData.income = p.income;
    gameData.expenses = p.expenses;
    gameData.manpowerIncome = p.manpowerIncome;
    gameData.aiMoneyByOwner = Object.assign({}, p.aiMoneyByOwner);
    gameData.aiManpowerByOwner = Object.assign({}, p.aiManpowerByOwner);
    if(p.factionColors && p.factionColors.length) {
        for(let i = 0; i < Math.min(p.factionColors.length, factionColors.length); i++)
            factionColors[i] = p.factionColors[i];
    }
    gameData.encircledHexes = new Set();
    gameData.encircledReliefHexes = new Set();
    gameData.marineWaterSupplyHexes = new Set();
    gameData._mpSyncCityWarKeys = new Set();
    gameData._wodProcgenBorderFirstApplied = true;
    gameData._wodTerrainPoliticsBase = null;
    gameData._wodTerrainPoliticsBaseFp = '';
    if(p.mapGenSeed != null) gameData._mapGenSeed = p.mapGenSeed >>> 0;
    gameData.menuAttractMode=false;gameData._matchReadyForEndChecks=true;
    for(const slot of p.forfeitedSlots||[])wodMpApplyForfeitSlot(slot,false);
    if(opts.bake !== false) wodMpRefreshMatchViewportAndTerrain();
    } finally {gameData._mpLoadingMatch=false;}
    if(!opts.resumeMatch)wodMpApplyDeferredSnapshot();
}
async function wodMpPrepareHostLaunchPayload(meta) {
    wodMpNormalizeLobbyMeta(meta);
    if(gameData.mp && gameData.mp.isHost) {
        try {
            await wodMpWaitForLobbyPreviewIdle(90000);
        } catch(e) {
            console.warn(e);
        }
        if(!wodMpCommittedIsCurrentForMeta(meta)) {
            wodMpAbortLobbyPreviewJobs();
            let ok = await wodMpHostSyncCommittedPreviewForLaunch(meta);
            if(!ok) throw new Error('Could not build launch map for current lobby seats');
        }
    }
    wodClearLiveMapForNewMatch();
    wodMpSyncLaunchSettingsFromMeta(meta);
    if(meta.fogOfWar != null) gameData.fogOfWar = !!meta.fogOfWar;
    let expected = wodMpGetLobbyFactionSlotsFromMeta(meta);
    gameData._wodMpLaunchFactionSlots = expected.slice();
    let snap = wodMpMatchPayloadSourceSnap(meta);
    if(snap) {
        if(!wodMpInstallMatchMapFromSnapshot(snap, { bakeNow: false }))
            throw new Error('Failed to install committed lobby map');
        wodMpWireLaunchFromCommittedMap(meta, expected);
        wodMpEnsureMatchStartingUnits(expected);
    } else {
        await wodMpFinalizeLaunchMapFromLobby(meta);
    }
    gameData._wodMpLaunchFactionSlots = null;
    if(!gameData.hexList || !gameData.hexList.length)
        throw new Error('Multiplayer map is empty');
    wodMpNormalizeHexListTerrainColors(gameData.hexList);
    wodMpRebuildHexesFromList(gameData.hexList);
    wodNormalizeStartingCityEconomy();
    wodCaptureTerrainPoliticsBase();
    return wodMpBuildInitPayload();
}
function wodMpExpectedReadySlots() {
    if(!gameData.mp || !Array.isArray(gameData.mp.expectedReady)) return [];
    return gameData.mp.expectedReady.slice().sort((a, b) => a - b);
}
function wodMpMatchCanPlay() {
    if(!gameData.mp || !gameData.mp.enabled) return true;
    return !!gameData.mp.allReady;
}
function wodMpInitSyncState(expectedSlots) {
    if(!gameData.mp) return;
    gameData.mp.expectedReady = (expectedSlots || []).slice().sort((a, b) => a - b);
    gameData.mp.readySlots = {};
    gameData.mp.allReady = false;
}
function wodMpRefreshSyncOverlay() {
    let el = document.getElementById('wodMpSyncOverlay');
    if(!el) return;
    if(!gameData.mp || !gameData.mp.enabled || wodMpMatchCanPlay()) {
        el.classList.add('hidden');
        el.setAttribute('aria-busy', 'false');
        return;
    }
    let exp = wodMpExpectedReadySlots();
    let ready = exp.filter(s => gameData.mp.readySlots && gameData.mp.readySlots[s]).length;
    el.classList.remove('hidden');
    el.setAttribute('aria-busy', 'true');
    let msg = el.querySelector('.wod-mp-sync-msg');
    if(msg) msg.textContent = 'Waiting for all players (' + ready + '/' + exp.length + ')…';
}
function wodMpFinalizeMatchStart() {
    if(!gameData.mp || !gameData.mp.enabled) return;
    if(gameData._campaignEnded||gameData._spectator?.finished)return;
    gameData.mp.allReady = true;gameData.menuAttractMode=false;gameData._campaignEnded=false;
    wodBeginLifetimeMatch();
    wodMpFreezeSeatPlayerMap();
    wodMpRefreshSyncOverlay();
    setGameSpeed(1, true);
    wodMpSaveSession();
    showNotification('All players connected — battle begins!');
}
function wodMpTryMarkReady(slot) {
    if(!gameData.mp || !gameData.mp.enabled || !slot) return;
    if(!gameData.mp.readySlots) gameData.mp.readySlots = {};
    gameData.mp.readySlots[slot] = true;
    let exp = wodMpExpectedReadySlots();
    if(exp.length === 0 || exp.every(s => gameData.mp.readySlots[s])) {
        if(gameData.mp.isHost) {
            if(typeof WodMultiplayer !== 'undefined' && WodMultiplayer.hostSendMatchGo)
                WodMultiplayer.hostSendMatchGo();
            wodMpFinalizeMatchStart();
        }
    } else {
        wodMpRefreshSyncOverlay();
    }
}
// Guest commands reach the host as plain JSON, so the host bounds them before acting: at most
// WOD_MP_MAX_CMD_UNITS unit ids (no repeats), at most WOD_MP_MAX_CMD_POINTS points per path, and every
// coordinate a finite number. A command that fails these checks is dropped.
const WOD_MP_MAX_CMD_UNITS = 500;
const WOD_MP_MAX_CMD_POINTS = 400;
function wodMpSanitizeRemoteCmd(cmd) {
    if(!cmd || typeof cmd !== 'object' || typeof cmd.kind !== 'string') return null;
    const out = Object.assign({}, cmd);
    const finite = v => typeof v === 'number' && Number.isFinite(v);
    const point = p => p && finite(p.x) && finite(p.y) ? { x: p.x, y: p.y } : null;
    const points = list => {
        if(!Array.isArray(list)) return null;
        const pts = [];
        for(const p of list.slice(0, WOD_MP_MAX_CMD_POINTS)) {
            const q = point(p);
            if(!q) return null;
            pts.push(q);
        }
        return pts;
    };
    for(const k of ['x', 'y', 'sx', 'sy', 'ex', 'ey'])
        if(k in out && !finite(out[k])) return null;
    if('uids' in out) {
        if(!Array.isArray(out.uids)) return null;
        const seen = new Set();
        out.uids = [];
        for(const id of cmd.uids) {
            if((typeof id !== 'string' && typeof id !== 'number') || seen.has(id)) continue;
            seen.add(id);
            out.uids.push(id);
            if(out.uids.length >= WOD_MP_MAX_CMD_UNITS) break;
        }
        // shiftMarch sends one path per id, in the same order: keep them paired.
        if(Array.isArray(cmd.paths)) {
            const byId = new Map();
            cmd.uids.forEach((id, i) => { if(!byId.has(id)) byId.set(id, cmd.paths[i]); });
            out.paths = [];
            for(const id of out.uids) {
                const pts = byId.get(id) == null ? [] : points(byId.get(id));
                if(!pts) return null;
                out.paths.push(pts);
            }
        }
    } else if('paths' in out) return null;
    for(const k of ['pts', 'wps']) {
        if(!(k in out) || out[k] == null) continue;
        out[k] = points(out[k]);
        if(!out[k]) return null;
    }
    if(out.line) {
        const start = point(out.line.start), end = point(out.line.end);
        out.line = start && end ? { start, end } : null;
    }
    return out;
}
/** The units a guest's command names that belong to that guest, in the order the command lists them. */
function wodMpOwnedUnitsForCmd(d) {
    const ids = d.cmd.uids || [];
    if(!ids.length) return [];
    const wanted = new Set(ids), byId = new Map();
    for(const e of gameData.entities)
        if(e.owner === d.fromSlot && wanted.has(e.uid)) byId.set(e.uid, e);
    const units = [];
    for(const id of ids) { const u = byId.get(id); if(u) units.push(u); }
    return units;
}
function wodMpSendCmd(cmd) {
    if(gameData._spectator)return false;
    if(!gameData.mp || !gameData.mp.enabled || gameData.mp.isHost) return false;
    if(!wodMpMatchCanPlay()) return false;
    if(typeof WodMultiplayer === 'undefined' || !WodMultiplayer.sendCmd) return false;
    WodMultiplayer.sendCmd(cmd);
    if(['move','lineFormation','boxFormation','strokeMove','shiftMarch'].includes(cmd.kind)) {
        const ids=new Set(cmd.uids||[]);
        wodPlayUnitMoveSound(gameData.entities.filter(u=>ids.has(u.uid)));
    }
    return true;
}
function wodMpBuildMatchEndParticipants(spec) {
    let outcomes = (spec && spec.outcomes) || {};
    let out = [];
    let seen = new Set();
    let seatMap = (gameData.mp && gameData.mp.seatPlayerIds) || {};
    let meta = window.wodMpRoomMeta || {};
    let pub = (gameData.mp && gameData.mp.playerPublic) || meta.playerPublic || {};
    let slots = (gameData.mp && gameData.mp.humanSlots) ? gameData.mp.humanSlots.slice() : [];
    for(let k of Object.keys(outcomes)) {
        let slot = parseInt(k, 10);
        if(!slot) continue;
        if(slots.indexOf(slot) < 0) slots.push(slot);
    }
    for(let slot of slots) {
        let oc = outcomes[String(slot)];
        if(oc !== 'won' && oc !== 'lost') continue;
        let pid = seatMap[String(slot)] || (pub[String(slot)] || {}).playerId;
        if(!pid || seen.has(pid)) continue;
        seen.add(pid);
        out.push({ slot: slot, playerId: pid });
    }
    return out;
}
function wodMpReportMatchEndToServer(spec) {
    if(typeof WodMultiplayer === 'undefined' || !WodMultiplayer.reportMpMatchEnd) return;
    if(!WodMultiplayer.api || !WodMultiplayer.api.isHost) return;
    WodMultiplayer.reportMpMatchEnd({
        outcomes: (spec && spec.outcomes) || {},
        participants: wodMpBuildMatchEndParticipants(spec)
    });
}
function wodMpRecordLocalMultiplayerOutcome(oc) {
    if(!wodProgress) return;
    if(!wodCloudCanSync()) {
        if(!wodProgress.multiplayer) wodProgress.multiplayer = { gamesPlayed: 0, wins: 0, losses: 0 };
        let m = wodProgress.multiplayer;
        m.gamesPlayed = (m.gamesPlayed || 0) + 1;
        if(oc === 'won') m.wins = (m.wins || 0) + 1;
        else if(oc === 'lost') m.losses = (m.losses || 0) + 1;
    }
    wodFlushLifetimeProgress();
    wodMpRefreshLocalMpStatsReadout();
    wodMpRegisterWithServer();
    if(typeof WodMultiplayer !== 'undefined' && WodMultiplayer.api && WodMultiplayer.api.code)
        wodMpPushLobbyProfile();
}
// A guest tells the relay which result the host announced and whether its own copy of the battle agrees.
// The relay records a result only if no guest disputes it (see server/index.js, queueHostResult).
function wodMpConfirmHostResult(me) {
    if(!gameData.mp || !gameData.mp.enabled || gameData.mp.isHost) return;
    if(typeof WodMultiplayer === 'undefined' || !WodMultiplayer.sendMpResult) return;
    const key = Object.keys(me.outcomes).sort().map(k => k + ':' + me.outcomes[k]).join(',');
    gameData._mpConfirmedResults ||= new Set();
    if(gameData._mpConfirmedResults.has(key)) return;
    gameData._mpConfirmedResults.add(key);
    const slot = gameData.mp.localSlot;
    const mine = slot == null ? null : me.outcomes[String(slot)];
    // Told we lost while we still hold a town and still have troops, and we did not surrender: dispute.
    const surrendered = gameData._lifetimeEndReason === 'surrender' || (gameData.mp.forfeitedSlots || []).includes(slot);
    const agree = !(mine === 'lost' && !surrendered && factionControlsAnyCity(slot) && countFriendlyCombatExcludingConvoys(slot) > 0);
    WodMultiplayer.sendMpResult({ outcomes: me.outcomes, agree });
}
function wodMpClientApplyMatchEnd(me) {
    if(gameData._spectator){if(me?.final)wodFinishSpectating(me.winnerSlot);return;}
    if(!me || !me.outcomes || gameData._campaignEnded) return;
    if(!gameData.mp || !gameData.mp.enabled) return;
    wodMpConfirmHostResult(me);
    wodMpFlushStatsToServer();
    gameData._mpLastMatchEnd = me;
    let slot = gameData.mp.localSlot;
    if(slot == null) return;
    let oc = me.outcomes[String(slot)];
    if(!oc || oc === 'ongoing') return;
    if(me.final||wodSpectatorSurvivors(true).length<2)wodMpClearSession();
    if(oc==='lost'&&typeof WodMultiplayer!=='undefined')WodMultiplayer.api.spectating=true;
    let mpActive = !!(gameData.mp && gameData.mp.enabled);
    if(oc === 'won') triggerCampaignVictory(me.message || 'Victory', !mpActive && me.countAsBattleWon === true);
    else if(oc === 'lost') triggerCampaignDefeat(me.message || 'Defeat');
    if(!gameData._lifetimeMatch?.mpOutcomeRecorded) {
        if(gameData._lifetimeMatch)gameData._lifetimeMatch.mpOutcomeRecorded=true;
        wodMpRecordLocalMultiplayerOutcome(oc);
    }
}
function wodMpIsSlotEliminated(slot) {
    let es = gameData.mp && gameData.mp.eliminatedSlots;
    return Array.isArray(es) && es.indexOf(slot) >= 0;
}
function wodMpApplyForfeitSlot(slot,emit=true) {
    if(!slot||!gameData.mp)return;wodMpMarkSlotEliminated(slot);
    gameData.entities=gameData.entities.filter(u=>u.owner!==slot);
    gameData.constructionJobs=gameData.constructionJobs.filter(j=>j.owner!==slot);
    for(const c of gameData.cities)if(c.owner===slot)c.owner=0;
    const saved=batchHexOwner;batchHexOwner=true;for(const h of gameData.hexList)if(h.owner===slot)setHexOwner(h,0);batchHexOwner=saved;wodMarkTerrainPoliticalDirty();
    gameData.mp.connectedSlots=(gameData.mp.connectedSlots||[]).filter(s=>s!==slot);gameData.mp.aiControlledSlots=(gameData.mp.aiControlledSlots||[]).filter(s=>s!==slot);
    if(emit&&gameData.mp.isHost&&!gameData._campaignEnded){wodMpCheckEndConditionsHost(.1);wodMpHostEmitSnapshot();}
}
function wodMpMarkSlotEliminated(slot) {
    if(!gameData.mp) return;
    if(!gameData.mp.eliminatedSlots) gameData.mp.eliminatedSlots = [];
    if(gameData.mp.eliminatedSlots.indexOf(slot) < 0) gameData.mp.eliminatedSlots.push(slot);
}
function wodMpHostBroadcastFullEnd(winnerSlot, message) {
    if(!gameData.mp || !gameData.mp.humanSlots) return;
    let act = wodGetActiveFactionSlotsForMap();
    let slots = (act && act.length) ? act.slice() : gameData.mp.humanSlots.slice();
    let seen = new Set();
    let outcomes = {};
    for(let s of slots) {
        if(seen.has(s)) continue;
        seen.add(s);
        outcomes[String(s)] = (s === winnerSlot) ? 'won' : 'lost';
    }
    for(let s of gameData.mp.humanSlots) {
        if(seen.has(s)) continue;
        seen.add(s);
        outcomes[String(s)] = (s === winnerSlot) ? 'won' : 'lost';
    }
    wodMpHostBroadcastMatchEnd({ outcomes: wodMpShareWinWithAllies(outcomes), message, countAsBattleWon: false,final:true,winnerSlot });
}
function wodMpShareWinWithAllies(outcomes, exceptSlots) {
    let out = Object.assign({}, outcomes || {});
    let skip = {};
    for(let i = 0; i < (exceptSlots || []).length; i++) skip[exceptSlots[i] | 0] = 1;
    let winners = [];
    for(let k of Object.keys(out)) {
        if(out[k] === 'won') winners.push(parseInt(k, 10));
    }
    if(!winners.length) return out;
    for(let k of Object.keys(out)) {
        let o = parseInt(k, 10);
        if(out[k] === 'won' || skip[o]) continue;
        for(let wi = 0; wi < winners.length; wi++) {
            if(wodAreAllies(o, winners[wi])) {
                out[k] = 'won';
                break;
            }
        }
    }
    return out;
}
function wodMpMergeOutcomesAllActiveSlots(baseOutcomes) {
    let merged = Object.assign({}, baseOutcomes || {});
    let act = wodGetActiveFactionSlotsForMap();
    let hs = (gameData.mp && gameData.mp.humanSlots) ? gameData.mp.humanSlots : [];
    function ensure(list) {
        if(!list) return;
        for(let s of list) {
            let k = String(s);
            if(merged[k] == null || merged[k] === '') merged[k] = 'ongoing';
        }
    }
    ensure(act);
    ensure(hs);
    return merged;
}
/** Host-only: MP win/elimination (FFA humans + AI). Clients apply results via snapshots / wodMpClientApplyMatchEnd. */
function wodMpCheckEndConditionsHost(dt) {
    if(gameState !== 'PLAYING' || gameData.menuAttractMode || gameData._campaignEnded) return;
    if(!gameData.mp || !gameData.mp.enabled || !gameData.mp.isHost) return;
    let hs = gameData.mp.humanSlots;
    if(!hs || !hs.length) return;
    const contenders=wodGetActiveFactionSlotsForMap()||hs;
    let mode = gameData.victoryMode === 'annihilation' ? 'annihilation' : 'domination';

    if(mode === 'domination') {
        for(let s of contenders) {
            if(wodMpIsSlotEliminated(s)) continue;
            if(!factionControlsAnyCity(s)) continue;
            if(!anyEnemyOwnedCityRemainsFor(s)) {
                wodMpHostBroadcastFullEnd(s, 'Victory — domination: all enemy cities captured.');
                return;
            }
        }
    } else {
        gameData._mpAnnihilationWinAcc = (gameData._mpAnnihilationWinAcc || 0) + (dt || 0);
        if(gameData._mpAnnihilationWinAcc >= 0.14) {
            gameData._mpAnnihilationWinAcc = 0;
            for(let s of contenders) {
                if(wodMpIsSlotEliminated(s)) continue;
                if(!factionControlsAnyCity(s)) continue;
                let myMil = countFriendlyCombatExcludingConvoys(s);
                let enMil = countEnemyCombatExcludingConvoysFor(s);
                if(enMil === 0 && myMil > 0) {
                    wodMpHostBroadcastFullEnd(s, 'Victory — annihilation: all enemy combat forces destroyed.');
                    return;
                }
            }
        }
    }

    let newCityElim = [];
    for(let s of hs) {
        if(wodMpIsSlotEliminated(s)) continue;
        if(!factionControlsAnyCity(s)) newCityElim.push(s);
    }
    if(newCityElim.length) {
        for(let s of newCityElim) wodMpApplyForfeitSlot(s,false);
        let outcomes = {};
        for(let s of hs) outcomes[String(s)] = wodMpIsSlotEliminated(s) ? 'lost' : 'ongoing';
        wodMpHostBroadcastMatchEnd({ outcomes: wodMpMergeOutcomesAllActiveSlots(outcomes), message: 'Defeat — all cities lost.', countAsBattleWon: false });
    }

    if(mode === 'annihilation') {
        let newAnnih = [];
        for(let s of hs) {
            if(wodMpIsSlotEliminated(s)) continue;
            if(!factionControlsAnyCity(s)) continue;
            if(countFriendlyCombatExcludingConvoys(s) === 0 && countEnemyCombatExcludingConvoysFor(s) > 0) newAnnih.push(s);
        }
        if(newAnnih.length) {
            for(let s of newAnnih) wodMpApplyForfeitSlot(s,false);
            let outcomes = {};
            for(let s of hs) outcomes[String(s)] = wodMpIsSlotEliminated(s) ? 'lost' : 'ongoing';
            wodMpHostBroadcastMatchEnd({ outcomes: wodMpMergeOutcomesAllActiveSlots(outcomes), message: 'Defeat — annihilation: all your combat forces were destroyed.', countAsBattleWon: false });
        }
    }
}
function wodMpHostBroadcastMatchEnd(spec) {
    wodMpReportMatchEndToServer(spec);
    gameData._mpMatchEnd = spec;
    wodMpHostEmitSnapshot();
    wodMpClientApplyMatchEnd(spec);
    gameData._mpMatchEnd = null;
}
function wodMpApplyDeferredSnapshot(fallback) {
    const s=gameData._mpDeferredSnap||fallback,end=gameData._mpDeferredEnd;
    gameData._mpDeferredSnap=null;gameData._mpDeferredEnd=null;
    if(s)wodMpApplySnapPayload(s);if(end)wodMpClientApplyMatchEnd(end);
}
function wodMpRetainSnapshotState(payload, previous) {
    if(previous && previous !== payload) {
        for(const field of ['hexOwners', 'battleLedger', 'lifetimeStatsByOwner']) {
            if(payload[field] === undefined && previous[field] !== undefined) payload[field] = previous[field];
        }
    }
    return payload;
}
function wodMpApplySnapPayload(s) {
    if(gameData._mpLoadingMatch){gameData._mpDeferredSnap=wodMpRetainSnapshotState(s,gameData._mpDeferredSnap);if(s.matchEnd?.final)gameData._mpDeferredEnd=s.matchEnd;return;}
    if(Array.isArray(s.eliminatedSlots)&&gameData.mp)gameData.mp.eliminatedSlots=s.eliminatedSlots.slice();
    if(s.battleLedger){gameData._battleLedger=JSON.parse(JSON.stringify(s.battleLedger));gameData._battleLedgerMap=gameData.hexes;}
    gameData._fogVisionTimer=1;
    let lo = wodLocalPlayerOwner();
    if(s.money !== undefined && (!gameData.mp || !gameData.mp.enabled || lo === 1)) gameData.money = s.money;
    if(s.manpower !== undefined && (!gameData.mp || !gameData.mp.enabled || lo === 1)) gameData.manpower = s.manpower;
    if(s.income !== undefined && (!gameData.mp || !gameData.mp.enabled || lo === 1)) gameData.income = s.income;
    if(s.expenses !== undefined && (!gameData.mp || !gameData.mp.enabled || lo === 1)) gameData.expenses = s.expenses;
    if(s.manpowerIncome !== undefined && (!gameData.mp || !gameData.mp.enabled || lo === 1)) gameData.manpowerIncome = s.manpowerIncome;
    if(s.aiCommanderStyle)gameData.aiCommanderStyle=s.aiCommanderStyle;if(s.aiCommanderProfiles)gameData.aiCommanderProfiles=s.aiCommanderProfiles;
    if(s.aiMoneyByOwner) Object.assign(gameData.aiMoneyByOwner, s.aiMoneyByOwner);
    if(s.aiManpowerByOwner) Object.assign(gameData.aiManpowerByOwner, s.aiManpowerByOwner);
    if(Array.isArray(s.marineWaterSupplyKeys)) gameData.marineWaterSupplyHexes = new Set(s.marineWaterSupplyKeys);
    if(Array.isArray(s.constructionJobs)) gameData.constructionJobs = s.constructionJobs.map(j => Object.assign({}, j));
    if(s.cities) {
        for(let u of s.cities) {
            let c = gameData.cities.find(cc => cc.q === u.q && cc.r === u.r);
            if(c) {
                c.owner = u.owner; c.hasFactory = !!u.hasFactory; c.hasHarbor = !!u.hasHarbor; c.hasFarm = !!u.hasFarm;
                if(u.hp != null) c.hp = u.hp;
            }
        }
    }
    if(s.hexOwners && s.hexOwners.length === gameData.hexList.length) {
        for(let i = 0; i < gameData.hexList.length; i++) {
            let h = gameData.hexList[i];
            if(h.owner !== s.hexOwners[i]) setHexOwner(h, s.hexOwners[i]);
        }
    }
    for(const e of s.structureDestructions||[])wodEmitStructureDestruction(e.structure,e.kind,e.eventId,e.life);
    if(Array.isArray(s.hospitals))gameData.hospitals=s.hospitals.map(h=>({...h}));
    if(Array.isArray(s.forts)) {
        gameData.forts = s.forts.map(f => Object.assign({}, f));
        for(let ft of gameData.forts) {
            let hh = wodHexAt(ft.q,ft.r);
            if(hh) {
                ft.x = hh.x;
                ft.y = hh.y;
            }
        }
    }
    if(Array.isArray(s.bridges)) {
        gameData.bridges = s.bridges.map(b => wodNormalizeBridgeRecord(b)).filter(Boolean);
        for(let br of gameData.bridges) wodSyncBridgeWorldCoords(br);
        wodRebuildBridgeHexIndex();
    }
    if(s.entities) {
        let byUid = new Map(gameData.entities.map(e => [e.uid, e]));
        let next = [];
        for(let ed of s.entities) {
            let ex = byUid.get(ed.uid);
            if(ex) {
                let jumpX = ed.x - ex.x, jumpY = ed.y - ex.y;
                ex.x = ed.x; ex.y = ed.y; ex.hp = ed.hp; ex.owner = ed.owner;
                if(ed.maxHp != null) ex.maxHp = ed.maxHp;
                if(ed.manpower != null) ex.manpower = ed.manpower;
                if(ed.maxManpower != null) ex.maxManpower = ed.maxManpower;
                if(ed.tanks != null) ex.tanks = ed.tanks;
                if(ed.maxTanks != null) ex.maxTanks = ed.maxTanks;
                if(ed.xp != null) ex.xp = ed.xp;
                if(ed.kills != null) ex.kills = ed.kills;
                if(ed.losses != null) ex.losses = ed.losses;
                if(ed.veteran != null) ex.veteran = !!ed.veteran;
                if(ed.name) ex.name = ed.name;
                ex.morale = ed.morale; ex.maxMorale=ed.maxMorale??WOD_MORALE_MAX; ex.moraleBroken = ed.moraleBroken; ex.retreating = ed.retreating;
                ex.shake = ed.shake != null ? ed.shake : ex.shake;
                ex.activeCombatVisual = ed.activeCombatVisual != null ? ed.activeCombatVisual : ex.activeCombatVisual;
                ex.combatTargetUid=ed.combatTargetUid||null;
                ex.preferredTargetUid=ed.preferredTargetUid||null;
                ex._wodAttackOrder=ed._wodAttackOrder?{...ed._wodAttackOrder}:null;ex._wodAttackApproaching=!!ed._wodAttackApproaching;
                ex.encircledFlash = ed.encircledFlash != null ? ed.encircledFlash : ex.encircledFlash;
                ex.isGeneral = !!ed.isGeneral;
                ex.healingFlash = ed.healingFlash != null ? ed.healingFlash : ex.healingFlash;
                ex.waterFlash = ed.waterFlash != null ? ed.waterFlash : ex.waterFlash;
                ex.waterExposureSeconds=ed.waterExposureSeconds!=null?ed.waterExposureSeconds:(ex.waterExposureSeconds||0);
                for(const key of ['supplyPendingSeconds','outOfSupplySeconds','attritionLosses','attritionTankLosses','attritionHpLost'])if(Number.isFinite(ed[key]))ex[key]=ed[key];
                ex.unpaidFlash = ed.unpaidFlash != null ? ed.unpaidFlash : ex.unpaidFlash;
                ex.cargo=ed.cargo?wodEntityFromNet(ed.cargo):null;ex.pickupUid=ed.pickupUid||null;ex.pickupLandKey=ed.pickupLandKey||null;ex.boardTransportUid=ed.boardTransportUid||null;ex.unloadHexKey=ed.unloadHexKey||null;ex.unloadGoal=ed.unloadGoal||null;ex.ferryGoal=ed.ferryGoal||null;
                ex.convoyFromKey=ed.convoyFromKey||null;ex.convoyToKey=ed.convoyToKey||null;ex.convoyDock=ed.convoyDock||null;
                if(ed.target) ex.target = Object.assign({}, ed.target);
                else ex.target = null;
                if(ed.orderTarget) ex.orderTarget = Object.assign({}, ed.orderTarget);
                else ex.orderTarget = null;
                if(ed.path) ex.path = ed.path.map(p => Object.assign({}, p));
                else ex.path = null;
                if(ed.fullMarchWaypoints) ex.fullMarchWaypoints = ed.fullMarchWaypoints.map(p => Object.assign({}, p));
                else ex.fullMarchWaypoints = null;
                ex.marchWpCursor = ed.marchWpCursor || 0;
                ex._wodShoreExitRouting=!!ed._wodShoreExitRouting;
                ex._wodRiskRetreat=!!ed._wodRiskRetreat;
                // Large host snaps must not leave smooth-draw coords far from auth
                // position — that made deselected units fail frustum culling and vanish.
                if(jumpX * jumpX + jumpY * jumpY > 64 * 64 || ex._drawX == null) {
                    ex._drawX = ex.x;
                    ex._drawY = ex.y;
                }
                next.push(ex);
            } else {
                let nu = wodEntityFromNet(ed);
                ensureUnitId(nu);
                nu._drawX = nu.x;
                nu._drawY = nu.y;
                next.push(nu);
            }
        }
        gameData.entities = next;
        wodMpRevalidateSelectionAfterSnap();
    }
    if(s.hudByOwner && gameData.mp && gameData.mp.enabled && gameData.mp.localSlot) {
        let hb = s.hudByOwner[gameData.mp.localSlot];
        if(hb) {
            gameData.income = hb.income;
            gameData.expenses = hb.expenses;
            gameData.manpowerIncome = hb.manpowerIncome;
        }
    }
    if(s.casualtiesByOwner && gameData.mp && gameData.mp.enabled) {
        if(!gameData.casualtiesByOwner) gameData.casualtiesByOwner = {};
        Object.assign(gameData.casualtiesByOwner, s.casualtiesByOwner);
    }
    if(s.tankCasualtiesByOwner && gameData.mp && gameData.mp.enabled) {
        if(!gameData.tankCasualtiesByOwner) gameData.tankCasualtiesByOwner = {};
        Object.assign(gameData.tankCasualtiesByOwner, s.tankCasualtiesByOwner);
    }
    if(s.shipCasualtiesByOwner && gameData.mp && gameData.mp.enabled) {
        if(!gameData.shipCasualtiesByOwner) gameData.shipCasualtiesByOwner = {};
        Object.assign(gameData.shipCasualtiesByOwner, s.shipCasualtiesByOwner);
    }
    if(s.killsByOwner && gameData.mp && gameData.mp.enabled) {
        if(!gameData.killsByOwner) gameData.killsByOwner = {};
        Object.assign(gameData.killsByOwner, s.killsByOwner);
    }
    if(s.tankKillsByOwner && gameData.mp && gameData.mp.enabled) {
        if(!gameData.tankKillsByOwner) gameData.tankKillsByOwner = {};
        Object.assign(gameData.tankKillsByOwner, s.tankKillsByOwner);
    }
    if(s.shipKillsByOwner && gameData.mp && gameData.mp.enabled) {
        if(!gameData.shipKillsByOwner) gameData.shipKillsByOwner = {};
        Object.assign(gameData.shipKillsByOwner, s.shipKillsByOwner);
    }
    if(s.sessionIncomeByOwner && gameData.mp && gameData.mp.enabled) {
        if(!gameData._sessionIncomeAcc) gameData._sessionIncomeAcc = { player: 0, ai: 0, byOwner: {} };
        if(!gameData._sessionIncomeAcc.byOwner) gameData._sessionIncomeAcc.byOwner = {};
        Object.assign(gameData._sessionIncomeAcc.byOwner, s.sessionIncomeByOwner);
    }
    if(s.sessionCitiesCapturedByOwner && gameData.mp && gameData.mp.enabled) {
        if(!gameData.sessionCitiesCapturedByOwner) gameData.sessionCitiesCapturedByOwner = {};
        Object.assign(gameData.sessionCitiesCapturedByOwner, s.sessionCitiesCapturedByOwner);
    }
    if(gameData.mp && gameData.mp.enabled && !gameData.mp.isHost) {
        if(s.encircledKeys != null) gameData.encircledHexes = new Set(s.encircledKeys);
        if(s.encircledReliefKeys != null) gameData.encircledReliefHexes = new Set(s.encircledReliefKeys);
        if(s.cityWarKeys != null) gameData._mpSyncCityWarKeys = new Set(s.cityWarKeys);
    }
    if(s.connectedSlots && gameData.mp && gameData.mp.enabled && Array.isArray(s.connectedSlots)) {
        gameData.mp.connectedSlots = s.connectedSlots.slice();
        wodMpEnsureLocalSlotConnected();
    }
    if(s.lifetimeStatsByOwner){gameData._lifetimeStatsByOwner=s.lifetimeStatsByOwner;wodSyncLocalMatchLifetime();}
    wodTrackLifetimeMatchPeaks();
    if(s.matchEnd) wodMpClientApplyMatchEnd(s.matchEnd);
    if(s.allReady && gameData.mp && gameData.mp.enabled && !gameData.mp.allReady)
        wodMpFinalizeMatchStart();
    for(const slot of s.forfeitedSlots||[])wodMpApplyForfeitSlot(slot,false);
    if(gameData.mp?.eliminatedSlots?.includes(gameData.mp.localSlot)&&!gameData._spectator&&!gameData._campaignEnded)
        wodMpClientApplyMatchEnd({outcomes:{[gameData.mp.localSlot]:'lost'},message:'Defeat — your faction has been eliminated.'});
}
let wodMpSnapSeq = 0;
let wodMpLobbyCount = 1;
let _wodMpClientSnapPending = null;
let _wodMpClientSnapRaf = 0;
function wodMpRevalidateSelectionAfterSnap() {
    if(!gameData.selection) gameData.selection = [];
    let live = new Set(gameData.entities || []);
    let kept = [];
    for(let i = 0; i < gameData.selection.length; i++) {
        let s = gameData.selection[i];
        if(!s) continue;
        if(s.hp !== undefined && !s.id) {
            // Unit: must still be in the live entity list with hp.
            if(!live.has(s) || s.hp <= 0) {
                s.selected = false;
                continue;
            }
        }
        s.selected = true;
        kept.push(s);
    }
    gameData.selection = kept;
    // Clear orphan selected flags on entities no longer in the selection list.
    for(let i = 0, n = gameData.entities.length; i < n; i++) {
        let u = gameData.entities[i];
        if(u && u.selected && kept.indexOf(u) < 0) u.selected = false;
    }
}
function wodMpScheduleClientSnapApply(payload) {
    if(!payload) return;
    // Two snapshots can land in one frame and only the newest is applied. Carry over the
    // occasional persistent fields (territory and ledgers) so none is dropped.
    _wodMpClientSnapPending = wodMpRetainSnapshotState(payload, _wodMpClientSnapPending);
    if(_wodMpClientSnapRaf) return;
    _wodMpClientSnapRaf = requestAnimationFrame(() => {
        _wodMpClientSnapRaf = 0;
        let p = _wodMpClientSnapPending;
        _wodMpClientSnapPending = null;
        if(p) wodMpApplySnapPayload(p);
        if(_wodMpClientSnapPending) wodMpScheduleClientSnapApply(_wodMpClientSnapPending);
    });
}
function wodMpHostEmitSnapshot() {
    if(!gameData.mp || !gameData.mp.enabled || !gameData.mp.isHost) return;
    if(typeof WodMultiplayer === 'undefined' || !WodMultiplayer.api.connected) return;
    // Bandwidth: the territory array and the stat ledgers are the bulk of every snapshot but
    // change rarely. Send territory when it actually changed (plus a keyframe every second so
    // late joiners and reconnects converge), and the ledgers twice a second.
    const netNow = performance.now(), net = gameData._mpSnapNet || (gameData._mpSnapNet = {sum: null, ownersAt: -1e9, statsAt: -1e9});
    let owners = null;
    if(gameData.hexList.length <= 14000) {
        let sum = 0; const list = gameData.hexList;
        for(let i = 0; i < list.length; i++) sum = (sum * 31 + (list[i].owner | 0) + 7) | 0;
        if(sum !== net.sum || netNow - net.ownersAt >= 1000 || net.hexes !== gameData.hexes) {
            owners = list.map(h => h.owner); net.sum = sum; net.ownersAt = netNow; net.hexes = gameData.hexes;
        }
    }
    const sendStats = netNow - net.statsAt >= 500 || !!gameData._mpMatchEnd;
    if(sendStats) net.statsAt = netNow;
    let cityWarKeys = [];
    try {
        let m = new Set();
        if(gameData._cityCombatStagingKeys) for(let k of gameData._cityCombatStagingKeys) m.add(k);
        if(gameData.cityCombatBlockForProd) for(let k of gameData.cityCombatBlockForProd) m.add(k);
        cityWarKeys = [...m];
    } catch(err) { cityWarKeys = []; }
    let encircledKeys = gameData.encircledHexes && gameData.encircledHexes.size ? [...gameData.encircledHexes] : [];
    let encircledReliefKeys = gameData.encircledReliefHexes && gameData.encircledReliefHexes.size ? [...gameData.encircledReliefHexes] : [];
    let hudByOwner = null;
    if(gameData.mp.humanSlots && gameData.mp.humanSlots.length) {
        hudByOwner = {};
        for(let slot of gameData.mp.humanSlots) hudByOwner[slot] = wodMpEconomyHudForOwner(slot);
    }
    WodMultiplayer.hostSendSnap(++wodMpSnapSeq, {
        money: gameData.money,
        manpower: gameData.manpower,
        income: gameData.income,
        expenses: gameData.expenses,
        manpowerIncome: gameData.manpowerIncome,
        aiMoneyByOwner: Object.assign({}, gameData.aiMoneyByOwner),
        aiManpowerByOwner: Object.assign({}, gameData.aiManpowerByOwner),
        hudByOwner,
        casualtiesByOwner: Object.assign({}, gameData.casualtiesByOwner || {}),
        tankCasualtiesByOwner: Object.assign({}, gameData.tankCasualtiesByOwner || {}),
        shipCasualtiesByOwner: Object.assign({}, gameData.shipCasualtiesByOwner || {}),
        killsByOwner: Object.assign({}, gameData.killsByOwner || {}),
        tankKillsByOwner: Object.assign({}, gameData.tankKillsByOwner || {}),
        shipKillsByOwner: Object.assign({}, gameData.shipKillsByOwner || {}),
        sessionIncomeByOwner: Object.assign({}, (gameData._sessionIncomeAcc && gameData._sessionIncomeAcc.byOwner) || {}),
        sessionCitiesCapturedByOwner: Object.assign({}, gameData.sessionCitiesCapturedByOwner || {}),
        battleLedger: sendStats ? JSON.parse(JSON.stringify(wodBattleLedger())) : undefined,
        lifetimeStatsByOwner: sendStats ? JSON.parse(JSON.stringify(gameData._lifetimeStatsByOwner||{})) : undefined,
        constructionJobs: gameData.constructionJobs || [],
        entities: gameData.entities.filter(e => e.hp > 0).map(wodStripEntityForNet),
        hexOwners: owners || undefined,
        structureDestructions:(gameData._combatFx||[]).filter(f=>f.kind==='structure').map(f=>({eventId:f.eventId,kind:f.structureKind,structure:f.structure,life:f.life})),
        cities: gameData.cities.map(c => ({ q: c.q, r: c.r, owner: c.owner, hasFactory: !!c.hasFactory, hasHarbor: !!c.hasHarbor, hasFarm: !!c.hasFarm, hp: c.hp })),
        hospitals: (gameData.hospitals || []).map(h => ({...h})),
        forts: (gameData.forts || []).map(f => ({ id: f.id, owner: f.owner, q: f.q, r: f.r, x: f.x, y: f.y })),
        bridges: (gameData.bridges || []).map(wodStripBridgeForNet).filter(Boolean),
        encircledKeys,
        encircledReliefKeys,
        marineWaterSupplyKeys: [...(gameData.marineWaterSupplyHexes || [])],
        cityWarKeys,
        matchEnd: gameData._mpMatchEnd || undefined,
        eliminatedSlots:(gameData.mp?.eliminatedSlots||[]).slice(),
        allReady: !!(gameData.mp && gameData.mp.allReady),
        connectedSlots: (gameData.mp && gameData.mp.connectedSlots)
            ? gameData.mp.connectedSlots.slice()
            : undefined
    });
}
function wodMpDisconnectAndReset() {
    wodMpClearSession();
    if(typeof WodMultiplayer !== 'undefined') WodMultiplayer.disconnect();
    gameData.mp = null;
    wodMpSnapSeq = 0;
    wodMpLobbyCount = 1;
    window.wodMpRoomMeta = {};
    if(typeof wodMpClearLobbyPreviewDedupeState === 'function') wodMpClearLobbyPreviewDedupeState();
}
function wodMpEscapeHtml(s) {
    if(s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}
/** Lobby / match seat label from synced profiles; falls back to local saved name for your slot, else "Seat N". */
function wodMpDisplayNameForSlot(slot, context) {
    context = context || {};
    let s = slot | 0;
    if(s < 1) return 'Seat ?';
    let metaMine = context.meta || (typeof window !== 'undefined' ? window.wodMpRoomMeta : null) || {};
    let gdMp = context.gameDataMp;
    if(gdMp == null && typeof gameData !== 'undefined' && gameData.mp) gdMp = gameData.mp;
    let pub = (gdMp && gdMp.playerPublic) || metaMine.playerPublic || {};
    let pp = pub[String(s)] || {};
    let dn = pp.displayName;
    if(dn && String(dn).trim()) return String(dn).trim();
    let api = typeof WodMultiplayer !== 'undefined' ? WodMultiplayer.api : {};
    if(api && (api.slot | 0) === s && wodProgress && wodProgress.profile && wodProgress.profile.mpDisplayName) {
        let loc = String(wodProgress.profile.mpDisplayName).trim();
        if(loc) return loc;
    }
    return 'Seat ' + s;
}
function wodMpLobbyEffectiveSlotColor(meta, slot) {
    let pc = (meta && meta.playerColors) || {};
    let hex = pc[String(slot)];
    if(hex && /^#[0-9A-Fa-f]{6}$/.test(String(hex))) return String(hex).toLowerCase();
    let defaults = ['#2ecc71', '#e74c3c', '#9b59b6', '#e67e22', '#3498db', '#f1c40f'];
    if(slot >= 1 && slot <= defaults.length) return defaults[slot - 1].toLowerCase();
    return '';
}
function wodMpLobbyIsColorTakenByOthers(meta, slot, hex, maxH) {
    let h = String(hex).toLowerCase();
    let st = (meta && meta.seatTypes) || [];
    for(let s = 1; s <= maxH; s++) {
        if(s === slot) continue;
        if((st[s - 1] || 'human') === 'closed') continue;
        if(wodMpLobbyEffectiveSlotColor(meta, s) === h) return true;
    }
    return false;
}
function wodMpPublicMpStatsPayload() {
    if(!wodProgress || !wodProgress.multiplayer) return { gamesPlayed: 0, wins: 0, losses: 0 };
    let m = wodProgress.multiplayer;
    return { gamesPlayed: m.gamesPlayed | 0, wins: m.wins | 0, losses: m.losses | 0 };
}
function wodMpCombinedStats() {
    const L=wodStatsForMode('multiplayer'),mp=wodMpPublicMpStatsPayload();
    return {wins:Math.max(mp.wins||0,L.matchesWon||0),defeats:Math.max(mp.losses||0,L.matchesLost||0),gamesPlayed:Math.max(mp.gamesPlayed||0,L.matchesCompleted||0),kills:(L.enemyTroopKills||0)+(L.enemyMarineKills||0)+(L.enemyTankKills||0)+(L.enemyShipKills||0),losses:(L.ownTroopLosses||0)+(L.ownMarineLosses||0)+(L.ownTankLosses||0)+(L.ownShipLosses||0)};
}
function wodMpCombinedStatsPayload() {
    return wodMpCombinedStats();
}
function wodMpPushLobbyProfile() {
    if(typeof WodMultiplayer === 'undefined' || !WodMultiplayer.sendLobbyProfile) return;
    if(!WodMultiplayer.api || !WodMultiplayer.api.code) return;
    WodMultiplayer.sendLobbyProfile(wodMpBuildRegisterPayload());
}
function wodMpGeneratePlayerId() {
    let chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let a = '', b = '';
    for(let i = 0; i < 4; i++) {
        a += chars[Math.floor(Math.random() * chars.length)];
        b += chars[Math.floor(Math.random() * chars.length)];
    }
    return 'WOD-' + a + '-' + b;
}
function wodMpNormalizePlayerId(raw) {
    let s = String(raw || '').trim().toUpperCase().slice(0, 32);
    if(!/^WOD-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(s)) return '';
    return s;
}
function wodMpAdoptIdentity(id) {
    id=wodMpNormalizePlayerId(id);if(!id)return;
    const anchor=wodProfileIdentity();anchor.playerId=id;
    if(!window.WodSteamStore?.native()&&!anchor.webSession)anchor.devicePlayerId=id;
    wodProgress.profile.playerId=id;
    wodSaveProfileIdentity();wodRefreshAccountOptions();
}
async function wodMpSteamIdentity() {
    if(!window.WodSteamStore?.native())return null;
    if(_wodSteamProfileProof?.expires>Date.now())return _wodSteamProfileProof;
    if(_wodSteamProfileProofWork)return _wodSteamProfileProofWork;
    _wodSteamProfileProofWork=(async()=>{
        const result=await window.simpleWarsDesktop.store('multiplayer',{progress:wodBuildCloudSyncPayload()});
        if(!result?.ok||!result.profileToken)throw new Error(result?.error||'Steam could not restore your profile. Please reconnect.');
        _wodSteamProfileProof={token:result.profileToken,expires:Date.now()+4*3600000};
        wodSelectSavedProfile(result.playerId,result.profile);return _wodSteamProfileProof;
    })().finally(()=>_wodSteamProfileProofWork=null);
    return _wodSteamProfileProofWork;
}
function wodMpEnsureFriendRequestArrays() {
    wodEnsurePlayerId();
    if(!Array.isArray(wodProgress.profile.friendRequestsOut)) wodProgress.profile.friendRequestsOut = [];
    if(!Array.isArray(wodProgress.profile.friendRequestsIn)) wodProgress.profile.friendRequestsIn = [];
}
function wodMpIsFriend(playerId) {
    return wodMpGetFriendsList().some(f => f && f.playerId === playerId);
}
function wodMpAddFriendLocal(playerId, displayName, unitSkin) {
    if(!playerId || wodMpIsFriend(playerId)) return false;
    wodEnsurePlayerId();
    wodProgress.profile.friends.push({
        playerId,
        displayName: displayName || '',
        unitSkin: unitSkin || 'nato',
        addedAt: Date.now()
    });
    wodProgress.profile.friendRequestsOut = (wodProgress.profile.friendRequestsOut || []).filter(r => r && r.playerId !== playerId);
    wodProgress.profile.friendRequestsIn = (wodProgress.profile.friendRequestsIn || []).filter(r => r && r.playerId !== playerId);
    scheduleSaveWodProgress();
    wodMpRenderFriendsList();
    wodMpQueryFriendPresence();
    return true;
}
function wodMpGetFriendsList() {
    wodEnsurePlayerId();
    return wodProgress.profile.friends.slice();
}
function wodMpFriendPresenceMap() {
    return window._wodMpFriendPresence || {};
}
function wodMpSetFriendPresence(onlineList) {
    let map = {};
    if(Array.isArray(onlineList)) {
        for(let row of onlineList) {
            if(!row || !row.playerId) continue;
            map[row.playerId] = row;
        }
    }
    window._wodMpFriendPresence = map;
}
function wodMpSkinLabelForId(skinId) {
    let meta = shopSkinMetaList().find(r => r.id === skinId);
    return meta ? meta.label : (skinId || 'NATO');
}
function wodMpGetDisplayName() {
    let el = document.getElementById('mpDisplayName');
    let dn = el ? el.value.trim().slice(0, 24) : '';
    if(!dn && wodProgress && wodProgress.profile && wodProgress.profile.mpDisplayName)
        dn = String(wodProgress.profile.mpDisplayName).trim().slice(0, 24);
    return dn;
}
function wodMpSetDisplayNameFieldInvalid(invalid, msg) {
    let el = document.getElementById('mpDisplayName');
    let hint = document.getElementById('mpDisplayNameHint');
    if(el) el.classList.toggle('invalid', !!invalid);
    if(hint) {
        hint.textContent = msg || (invalid
            ? 'That name is taken — choose another.'
            : 'Names must be unique — taken names cannot be used in multiplayer.');
    }
}
function wodMpRevertDisplayNameField() {
    wodMpSyncDisplayNameFieldFromProfile();
    wodMpSetDisplayNameFieldInvalid(false);
}
function wodMpRequireRegisteredDisplayName(actionLabel) {
    let dn = wodMpGetDisplayName();
    if(dn) return true;
    wodMpSetDisplayNameFieldInvalid(true, 'Enter a unique display name before ' + (actionLabel || 'continuing') + '.');
    let el = document.getElementById('mpDisplayName');
    if(el) el.focus();
    showNotification('Set a unique display name in your profile first.');
    return false;
}
function wodMpBuildRegisterPayload() {
    wodEnsurePlayerId();
    let dn = wodMpGetDisplayName();
    let skinId = gameData.unitSkin || (wodProgress.profile && wodProgress.profile.unitSkin) || 'nato';
    if(!wodShopSkinOwned(skinId)) skinId = 'nato';
    return {
        playerId: wodProgress.profile.playerId,
        deviceSecret:window.WodSteamStore?.native()?'':wodProfileIdentity().secret,
        profileToken:_wodSteamProfileProof?.token||wodProfileIdentity().webSession?.token||'',
        displayName: dn,
        unitSkin: skinId,
        mpStats: wodMpPublicMpStatsPayload(),
        combinedStats: wodMpCombinedStatsPayload()
    };
}
async function wodMpRegisterWithServer() {
    if(typeof WodMultiplayer === 'undefined' || !WodMultiplayer.registerPlayer) return;
    if(!WodMultiplayer.api || !WodMultiplayer.api.socketOpen) return;
    try{await wodMpSteamIdentity();}catch(e){showNotification(e.message);return;}
    let dn=wodMpGetDisplayName(),autoName=!dn;
    if(!dn){dn='Commander '+wodEnsurePlayerId().slice(4).replace('-','');wodProgress.profile.mpDisplayName=dn;}
    window._wodMpPendingDisplayName=dn;
    const payload=wodMpBuildRegisterPayload();payload.displayName=dn;payload.autoName=autoName;
    WodMultiplayer.registerPlayer(payload);
}
function wodMpConfirmRegisteredDisplayName(serverName) {
    let pending = serverName||window._wodMpPendingDisplayName;
    if(!pending || !wodProgress || !wodProgress.profile) return;
    wodProgress.profile.mpDisplayName = pending;
    window._wodMpPendingDisplayName = '';
    wodMpClearDisplayNameEditing();
    scheduleSaveWodProgress();
    wodMpSetDisplayNameFieldInvalid(false);
    wodMpSyncDisplayNameFieldFromProfile();
}
function wodMpHandleDisplayNameRejected(detail) {
    window._wodMpPendingDisplayName = '';
    wodMpClearDisplayNameEditing();
    wodMpRevertDisplayNameField();
    let msg = (detail && detail.msg) ? detail.msg : 'That display name is already taken.';
    wodMpSetDisplayNameFieldInvalid(true, msg);
    showNotification(msg);
}
function wodMpRefreshProfileCard() {
    wodRefreshAccountOptions();
    wodEnsurePlayerId();
    let pid = wodProgress.profile.playerId;
    let codeEl = document.getElementById('mpPlayerIdCode');
    if(codeEl) codeEl.textContent = pid || '—';
    let skinId = gameData.unitSkin || wodProgress.profile.unitSkin || 'nato';
    if(!wodShopSkinOwned(skinId)) skinId = 'nato';
    let skinCv = document.getElementById('mpProfileSkinCanvas');
    if(skinCv) renderShopSkinThumbCanvas(skinCv, skinId);
    let skinName = document.getElementById('mpProfileSkinName');
    if(skinName) skinName.textContent = wodMpSkinLabelForId(skinId);
    let cs = wodMpCombinedStats();
    let w = document.getElementById('mpStatWins');
    let k = document.getElementById('mpStatKills');
    let l = document.getElementById('mpStatLosses');
    let d = document.getElementById('mpStatDefeats');
    if(w) w.textContent = formatLifetimeBig(cs.wins);
    if(k) k.textContent = formatLifetimeBig(cs.kills);
    if(l) l.textContent = formatLifetimeBig(cs.losses);
    if(d) d.textContent = formatLifetimeBig(cs.defeats);
    wodMpSyncDisplayNameFieldFromProfile();
}
function wodMpOpenStatsDetailDlg(extraLabel) {
    let dlg = document.getElementById('mpStatsDetailDlg');
    let body = document.getElementById('mpStatsDetailBody');
    let title = document.getElementById('mpStatsDetailTitle');
    if(!dlg || !body) return;
    if(title) title.textContent = extraLabel ? ('Stats — ' + extraLabel) : 'All stats';
    let cs = wodMpCombinedStats();
    let mp = wodMpPublicMpStatsPayload();
    let L=wodStatsForMode('multiplayer');
    let periodHtml = '';
    let byP=wodProgress?.statsByMode?.multiplayer?.byPeriod||{};
    for(let pid of Object.keys(byP)) {
        let b = byP[pid] || {};
        periodHtml +=
            '<div class="mp-stats-detail-block"><h4>' + wodMpEscapeHtml(wodPeriodLabel(pid)) + '</h4>' +
            'Wins ' + formatLifetimeBig(b.matchesWon | 0) + ' · Defeats ' + formatLifetimeBig(b.matchesLost | 0) + '<br>' +
            'Kills ' + formatLifetimeBig((b.enemyTroopKills | 0) + (b.enemyTankKills | 0) + (b.enemyMarineKills | 0) + (b.enemyShipKills | 0)) +
            '</div>';
    }
    body.innerHTML =
        '<div class="mp-stats-detail-block"><h4>Multiplayer record</h4>' +
        'Wins ' + formatLifetimeBig(cs.wins) + ' · Kills ' + formatLifetimeBig(cs.kills) + '<br>' +
        'Losses ' + formatLifetimeBig(cs.losses) + ' · Defeats ' + formatLifetimeBig(cs.defeats) + '<br>' +
        'Matches ' + formatLifetimeBig(cs.gamesPlayed) +
        '</div>' +
        '<div class="mp-stats-detail-block"><h4>Multiplayer service</h4>' +
        'Surrenders ' + formatLifetimeBig(L.matchesSurrendered || 0) + '<br>' +
        'Units recruited ' + formatLifetimeBig((L.unitsBuiltLight | 0)+(L.unitsBuiltHeavy | 0)+(L.unitsBuiltMarine | 0)+(L.unitsBuiltShip | 0)+(L.unitsBuiltMotorized | 0)+(L.unitsBuiltMountaineer | 0)) + '<br>' +
        'See Lifetime stats for the full multiplayer record and a separate single-player record.' +
        '</div>' +
        (periodHtml ? ('<div style="margin-top:10px"><strong>By time period</strong></div><div class="mp-stats-detail-grid">' + periodHtml + '</div>') : '');
    dlg.classList.remove('hidden');
    dlg.setAttribute('aria-hidden', 'false');
}
function wodMpCloseStatsDetailDlg() {
    let dlg = document.getElementById('mpStatsDetailDlg');
    if(dlg) { dlg.classList.add('hidden'); dlg.setAttribute('aria-hidden', 'true'); }
}
function wodMpBuildColorPickerHtml(slot, meta, maxH, currentHex, canEdit) {
    let hex = String(currentHex || '#999999');
    if(!canEdit)
        return '<span class="mp-gl-swatch mp-gl-swatch--lg" style="background:' + wodMpEscapeHtml(hex) + '" title="Faction color"></span>';
    let menu = '';
    for(let i = 0; i < WOD_MP_LOBBY_PALETTE.length; i++) {
        let palHex = WOD_MP_LOBBY_PALETTE[i][0];
        let lab = WOD_MP_LOBBY_PALETTE[i][1];
        let taken = wodMpLobbyIsColorTakenByOthers(meta, slot, palHex, maxH);
        let on = hex.toLowerCase() === palHex.toLowerCase() ? ' active' : '';
        menu += '<button type="button" class="mp-gl-color-btn' + on + '" data-slot="' + slot + '" data-color="' + palHex + '" style="background:' + palHex + '" title="' + wodMpEscapeHtml(lab) + '" aria-label="' + wodMpEscapeHtml(lab) + '"' + (taken ? ' disabled' : '') + '></button>';
    }
    return '<div class="mp-gl-color-wrap" data-slot="' + slot + '">' +
        '<button type="button" class="mp-gl-color-trigger mp-gl-swatch mp-gl-swatch--lg" data-slot="' + slot + '" style="background:' + wodMpEscapeHtml(hex) + '" title="Choose faction color" aria-label="Choose faction color"></button>' +
        '<div class="mp-gl-color-menu">' + menu + '</div></div>';
}
function wodMpCloseLobbyColorMenus(exceptWrap) {
    let slotsEl = document.getElementById('mpGlSlots');
    if(!slotsEl) return;
    slotsEl.querySelectorAll('.mp-gl-color-wrap.open').forEach(wrap => {
        if(exceptWrap && wrap === exceptWrap) return;
        wrap.classList.remove('open');
    });
}
function wodMpWireLobbyColorPickers(slotsEl) {
    if(!slotsEl) return;
    slotsEl.querySelectorAll('.mp-gl-color-trigger').forEach(btn => {
        btn.onclick = (ev) => {
            ev.stopPropagation();
            let wrap = btn.closest('.mp-gl-color-wrap');
            if(!wrap) return;
            let open = wrap.classList.contains('open');
            wodMpCloseLobbyColorMenus();
            if(!open) wrap.classList.add('open');
        };
    });
    slotsEl.querySelectorAll('.mp-gl-color-menu .mp-gl-color-btn').forEach(btn => {
        btn.onclick = (ev) => {
            ev.stopPropagation();
            if(btn.disabled) return;
            let slot = parseInt(btn.getAttribute('data-slot'), 10);
            let col = btn.getAttribute('data-color');
            if(typeof WodMultiplayer !== 'undefined' && WodMultiplayer.sendLobbyColor)
                WodMultiplayer.sendLobbyColor(slot, col);
            wodMpCloseLobbyColorMenus();
        };
    });
    if(!window._wodMpColorMenuDocBound) {
        window._wodMpColorMenuDocBound = true;
        document.addEventListener('click', () => wodMpCloseLobbyColorMenus());
    }
}
function wodMpSortLeaderboardRows(rows, sortKey) {
    let key = sortKey || 'wins';
    return (rows || []).slice().sort((a, b) => {
        let av = ((a.stats || {})[key]) | 0;
        let bv = ((b.stats || {})[key]) | 0;
        if(bv !== av) return bv - av;
        return String(a.displayName || a.playerId || '').localeCompare(String(b.displayName || b.playerId || ''));
    });
}
function wodMpMergeFriendsLeaderboardRows(serverRows) {
    let friends = wodMpGetFriendsList().filter(f => f && f.playerId);
    let friendIds = new Set(friends.map(f => f.playerId));
    let byId = {};
    let cached = window._wodMpLbCacheById || {};
    for(let r of (serverRows || [])) {
        if(r && r.playerId && friendIds.has(r.playerId)) byId[r.playerId] = r;
    }
    let presence = wodMpFriendPresenceMap();
    wodEnsurePlayerId();
    let out = [];
    for(let f of friends) {
        if(byId[f.playerId]) {
            let row = Object.assign({}, byId[f.playerId]);
            // Presence query is authoritative for friends scope when available.
            if(presence[f.playerId] != null) row.online = true;
            else if(row.online == null) row.online = false;
            out.push(row);
            continue;
        }
        let cachedRow = cached[f.playerId];
        if(cachedRow && friendIds.has(cachedRow.playerId)) {
            let row = Object.assign({}, cachedRow);
            row.online = !!presence[f.playerId];
            out.push(row);
            continue;
        }
        let pres = presence[f.playerId];
        let isOnline = !!pres;
        if(f.playerId === wodProgress.profile.playerId) {
            out.push({
                playerId: f.playerId,
                displayName: wodProgress.profile.mpDisplayName || f.displayName || f.playerId,
                unitSkin: gameData.unitSkin || f.unitSkin || 'nato',
                stats: wodMpCombinedStats(),
                online: isOnline || !!(WodMultiplayer.api && WodMultiplayer.api.socketOpen)
            });
        } else {
            out.push({
                playerId: f.playerId,
                displayName: (pres && pres.displayName) || f.displayName || f.playerId,
                unitSkin: (pres && pres.unitSkin) || f.unitSkin || 'nato',
                stats: (cachedRow && cachedRow.stats) || { wins: 0, losses: 0, kills: 0, defeats: 0, gamesPlayed: 0 },
                online: isOnline
            });
        }
    }
    return out;
}
function wodMpRefreshFriendsLeaderboardIfVisible() {
    if((window._wodMpLbScope || 'global') !== 'friends') return;
    wodMpRequestLeaderboard(window._wodMpLbSort || 'wins', 'friends');
}
const WOD_MP_LB_PAGE_SIZE = 5;
function wodMpRenderLeaderboardPage() {
    let rows = window._wodMpLbRows || [];
    let sortKey = window._wodMpLbSort || 'wins';
    let page = window._wodMpLbPage | 0;
    let host = document.getElementById('mpLeaderboardList');
    let pager = document.getElementById('mpLbPager');
    let prev = document.getElementById('mpLbPagePrev');
    let next = document.getElementById('mpLbPageNext');
    let label = document.getElementById('mpLbPageLabel');
    if(!host) return;
    host.innerHTML = '';
    if(!rows.length) {
        let scope = window._wodMpLbScope || 'global';
        host.innerHTML = '<p class="mp-hub-pane-lead">' + (scope === 'friends'
            ? 'No friend stats yet — add friends and play to compare rankings.'
            : 'No rankings yet — players appear here after registering a display name.') + '</p>';
        if(pager) pager.hidden = true;
        return;
    }
    let pageCount = Math.max(1, Math.ceil(rows.length / WOD_MP_LB_PAGE_SIZE));
    if(page >= pageCount) page = pageCount - 1;
    if(page < 0) page = 0;
    window._wodMpLbPage = page;
    let start = page * WOD_MP_LB_PAGE_SIZE;
    let slice = rows.slice(start, start + WOD_MP_LB_PAGE_SIZE);
    let labels = { wins: 'Wins', kills: 'Kills', losses: 'Losses', defeats: 'Defeats', gamesPlayed: 'Matches' };
    let statOrder = [sortKey, 'wins', 'kills', 'losses', 'defeats', 'gamesPlayed'].filter((k, i, a) => a.indexOf(k) === i);
    wodEnsurePlayerId();
    wodMpEnsureFriendRequestArrays();
    let myId = wodProgress.profile.playerId || '';
    slice.forEach((row, i) => {
        let st = (row.stats || {});
        let el = document.createElement('div');
        el.className = 'mp-lb-row';
        let cv = document.createElement('canvas');
        cv.width = 32;
        cv.height = 32;
        renderShopSkinThumbCanvas(cv, row.unitSkin || 'nato');
        let meta = document.createElement('div');
        meta.className = 'mp-lb-meta';
        let statBits = statOrder.map(k => {
            let lab = labels[k] || k;
            let val = formatLifetimeBig(st[k] | 0);
            if(k === sortKey) return '<span class="mp-lb-val-primary">' + wodMpEscapeHtml(lab) + ' ' + val + '</span>';
            return wodMpEscapeHtml(lab) + ' ' + val;
        });
        let isOnline = !!row.online;
        if(row.playerId && row.playerId === myId && typeof WodMultiplayer !== 'undefined' && WodMultiplayer.api && WodMultiplayer.api.socketOpen)
            isOnline = true;
        meta.innerHTML =
            '<div class="mp-lb-name">' + wodMpEscapeHtml(row.displayName || row.playerId || 'Player') + '</div>' +
            '<div class="mp-lb-val">' + statBits.join(' · ') + '</div>' +
            '<div class="mp-lb-status ' + (isOnline ? 'online' : 'offline') + '">' +
            (isOnline ? '● Online' : '○ Offline') + '</div>';
        let rank = document.createElement('span');
        rank.className = 'mp-lb-rank';
        rank.textContent = String(start + i + 1);
        el.append(rank, cv, meta);
        if(row.playerId && row.playerId !== myId) {
            let act = document.createElement('div');
            act.className = 'mp-lb-actions';
            if(wodMpIsFriend(row.playerId)) {
                let tag = document.createElement('span');
                tag.className = 'mp-lb-friend-tag';
                tag.textContent = 'Friend';
                act.appendChild(tag);
            } else if((wodProgress.profile.friendRequestsOut || []).some(r => r && r.playerId === row.playerId)) {
                let tag = document.createElement('span');
                tag.className = 'mp-lb-pending-tag';
                tag.textContent = 'Pending';
                act.appendChild(tag);
            } else {
                let addBtn = document.createElement('button');
                addBtn.type = 'button';
                addBtn.className = 'build-btn mp-lb-add-friend';
                addBtn.textContent = 'Add friend';
                addBtn.onclick = () => wodMpSendFriendRequest(row.playerId);
                act.appendChild(addBtn);
            }
            el.appendChild(act);
        }
        host.appendChild(el);
    });
    if(pager) {
        pager.hidden = pageCount <= 1;
        if(label) label.textContent = 'Page ' + (page + 1) + ' / ' + pageCount;
        if(prev) prev.disabled = page <= 0;
        if(next) next.disabled = page >= pageCount - 1;
    }
}
function wodMpRenderLeaderboard(rows, sortKey, scope) {
    window._wodMpLbSort = sortKey || window._wodMpLbSort || 'wins';
    window._wodMpLbScope = scope || window._wodMpLbScope || 'global';
    if(window._wodMpLbScope !== 'friends')
        wodMpCacheLeaderboardRows(rows, window._wodMpLbSort, window._wodMpLbScope);
    if(window._wodMpLbScope === 'friends') rows = wodMpMergeFriendsLeaderboardRows(rows);
    window._wodMpLbRows = wodMpSortLeaderboardRows(rows, window._wodMpLbSort);
    if(window._wodMpLbPage == null) window._wodMpLbPage = 0;
    wodMpRenderLeaderboardPage();
}
function wodMpRequestLeaderboard(sortKey, scope) {
    if(typeof WodMultiplayer === 'undefined' || !WodMultiplayer.requestLeaderboard) return;
    window._wodMpLbSort = sortKey || window._wodMpLbSort || 'wins';
    window._wodMpLbScope = scope || window._wodMpLbScope || 'global';
    window._wodMpLbPage = 0;
    document.querySelectorAll('#mpLbSort [data-lb-sort]').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-lb-sort') === window._wodMpLbSort);
    });
    document.querySelectorAll('#mpLbScope [data-lb-scope]').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-lb-scope') === window._wodMpLbScope);
    });
    let friendIds = null;
    if(window._wodMpLbScope === 'friends')
        friendIds = wodMpGetFriendsList().map(f => f && f.playerId).filter(Boolean);
    if(WodMultiplayer.api && WodMultiplayer.api.socketOpen)
        WodMultiplayer.requestLeaderboard(window._wodMpLbSort, friendIds);
    else {
        let cached = wodMpLoadCachedLeaderboardRows();
        if(window._wodMpLbScope === 'friends')
            wodMpRenderLeaderboard(cached, window._wodMpLbSort, 'friends');
        else
            wodMpRenderLeaderboard(cached, window._wodMpLbSort, 'global');
    }
}
function wodMpShareProfileLink() {
    wodEnsurePlayerId();
    let id = wodProgress.profile.playerId;
    if(!id) return;
    let url = new URL(location.href);
    url.searchParams.delete('friend');
    url.searchParams.set('invite', id);
    let link = url.toString();
    if(navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(() => showNotification('Profile link copied.')).catch(() => showNotification(link));
    } else showNotification(link);
}
function wodMpApplyInviteQueryFromUrl() {
    try {
        let params = new URLSearchParams(location.search);
        let id = wodMpNormalizePlayerId(params.get('invite') || params.get('friend'));
        if(id) {
            wodMpSwitchHubTab('friends');
            let inp = document.getElementById('mpFriendAddInput');
            if(inp) {
                inp.value = id;
                inp.focus();
            }
        }
        let lobbyId = String(params.get('lobby') || params.get('join') || '').trim();
        if(lobbyId) window._wodMpPendingLobbyFromUrl = lobbyId;
    } catch(_) {}
}
function wodMpApplyFriendQueryFromUrl() {
    wodMpApplyInviteQueryFromUrl();
}
async function wodMpTryJoinLobbyFromUrl() {
    let id = window._wodMpPendingLobbyFromUrl;
    if(!id) return;
    window._wodMpPendingLobbyFromUrl = '';
    if(!wodMpRequireRegisteredDisplayName('joining a lobby')) return;
    await wodMpEnsureConnected();
    if(typeof WodMultiplayer === 'undefined' || !WodMultiplayer.api.socketOpen) return;
    if(WodMultiplayer.api.code) return;
    try {
        wodEnsurePlayerId();
        await wodMpJoinWithPassword(id,false,{playerId:wodProgress.profile.playerId||''});
        wodMpLobbyCount = Math.max(1, WodMultiplayer.api.slot | 0, 1);
        wodMpRefreshMpPanelState();
        wodMpPushLobbyProfile();
        showNotification('Joined lobby from invite link.');
    } catch(e) {
        showNotification(e && e.message ? e.message : 'Could not join lobby from link.');
    }
}
function wodMpHandleFriendRemoved(payload) {
    if(!payload || !payload.fromPlayerId) return;
    wodEnsurePlayerId();
    wodProgress.profile.friends = wodMpGetFriendsList().filter(f => f && f.playerId !== payload.fromPlayerId);
    scheduleSaveWodProgress();
    wodMpRenderFriendsList();
    wodMpRefreshFriendsLeaderboardIfVisible();
    showNotification((payload.fromName || 'A player') + ' removed you as a friend.');
}
function wodMpRefreshLocalMpStatsReadout() {
    wodMpRefreshProfileCard();
}
function wodMpSyncDisplayNameFieldFromProfile() {
    let el = document.getElementById('mpDisplayName');
    if(!el || !wodProgress || !wodProgress.profile) return;
    if(el === document.activeElement || el._wodMpEditing) return;
    let saved = wodProgress.profile.mpDisplayName || '';
    if(el.value !== saved) el.value = saved;
}
function wodMpClearDisplayNameEditing() {
    let el = document.getElementById('mpDisplayName');
    if(el) el._wodMpEditing = false;
}
function wodMpCacheLeaderboardRows(rows, sortKey, scope) {
    let list = Array.isArray(rows) ? rows : [];
    let byId = {};
    for(let r of list) {
        if(r && r.playerId) byId[r.playerId] = Object.assign({}, r);
    }
    window._wodMpLbCacheById = byId;
    try {
        // Never persist online flags — they go stale the moment the cache is written.
        let persistRows = list.map(r => {
            if(!r) return r;
            let copy = Object.assign({}, r);
            delete copy.online;
            return copy;
        });
        localStorage.setItem('wodMpLbCache', JSON.stringify({
            rows: persistRows,
            sort: sortKey || 'wins',
            scope: scope || 'global',
            at: Date.now()
        }));
    } catch(_) {}
}
function wodMpLoadCachedLeaderboardRows() {
    if(window._wodMpLbCacheById && Object.keys(window._wodMpLbCacheById).length)
        return Object.values(window._wodMpLbCacheById).map(r => Object.assign({}, r));
    try {
        let raw = localStorage.getItem('wodMpLbCache');
        if(!raw) return [];
        let data = JSON.parse(raw);
        if(!data || !Array.isArray(data.rows)) return [];
        // Disk cache is offline until a fresh server response arrives.
        let rows = data.rows.map(r => r ? Object.assign({}, r, { online: false }) : r);
        wodMpCacheLeaderboardRows(rows, data.sort, data.scope);
        return rows;
    } catch(_) {
        return [];
    }
}
function wodMpSwitchHubTab(tabId) {
    document.querySelectorAll('.mp-hub-tab[data-mp-tab]').forEach(btn => {
        let on = btn.getAttribute('data-mp-tab') === tabId;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.mp-hub-pane[data-mp-pane]').forEach(pane => {
        let on = pane.getAttribute('data-mp-pane') === tabId;
        pane.classList.toggle('active', on);
        if(on) pane.removeAttribute('hidden');
        else pane.setAttribute('hidden', '');
    });
    let hostForm = document.getElementById('mpHostForm');
    if(hostForm) hostForm.classList.toggle('visible', tabId === 'host');
    if(tabId === 'friends') {
        wodCloudFetchProfile();
        scheduleCloudSyncProgress();
        wodMpRenderFriendsList();
        wodMpQueryFriendPresence();
    }
    if(tabId === 'rankings') {
        wodMpQueryFriendPresence();
        wodMpRequestLeaderboard(window._wodMpLbSort || 'wins', window._wodMpLbScope || 'global');
    }
    if(tabId === 'browse') {
        if(typeof WodMultiplayer !== 'undefined' && WodMultiplayer.api && WodMultiplayer.api.socketOpen)
            WodMultiplayer.requestLobbyList();
        else
            wodMpRenderLobbyList([]);
    }
}
function wodMpSendFriendRequest(rawId) {
    let id = wodMpNormalizePlayerId(rawId);
    if(!id) {
        showNotification('Enter a valid player ID (WOD-XXXX-XXXX).');
        return false;
    }
    wodEnsurePlayerId();
    if(id === wodProgress.profile.playerId) {
        showNotification('That is your own player ID.');
        return false;
    }
    if(wodMpIsFriend(id)) {
        showNotification('Already friends with this player.');
        return false;
    }
    wodMpEnsureFriendRequestArrays();
    if((wodProgress.profile.friendRequestsOut || []).some(r => r && r.playerId === id)) {
        showNotification('Friend request already pending.');
        return false;
    }
    if(typeof WodMultiplayer === 'undefined' || !WodMultiplayer.sendFriendRequest) {
        showNotification('Multiplayer server not available.');
        return false;
    }
    if(!WodMultiplayer.api || !WodMultiplayer.api.socketOpen) {
        showNotification('Connecting… try again in a moment.');
        void wodMpEnsureConnected().then(() => wodMpSendFriendRequest(rawId));
        return false;
    }
    wodMpRegisterWithServer();
    WodMultiplayer.sendFriendRequest(id);
    wodProgress.profile.friendRequestsOut.push({ playerId: id, sentAt: Date.now() });
    scheduleSaveWodProgress();
    wodMpRenderFriendsList();
    showNotification('Friend request sent.');
    return true;
}
function wodMpAddFriendById(rawId) {
    return wodMpSendFriendRequest(rawId);
}
function wodMpRemoveFriend(playerId) {
    wodEnsurePlayerId();
    wodProgress.profile.friends = wodMpGetFriendsList().filter(f => f && f.playerId !== playerId);
    scheduleSaveWodProgress();
    wodMpRenderFriendsList();
    wodMpRefreshFriendsLeaderboardIfVisible();
    if(typeof WodMultiplayer !== 'undefined' && WodMultiplayer.removeFriend)
        WodMultiplayer.removeFriend(playerId);
    showNotification('Friend removed.');
}
function wodMpRenderFriendsList() {
    let host = document.getElementById('mpFriendsList');
    let empty = document.getElementById('mpFriendsEmpty');
    if(!host) return;
    wodMpEnsureFriendRequestArrays();
    let friends = wodMpGetFriendsList();
    let incoming = wodProgress.profile.friendRequestsIn || [];
    let outgoing = wodProgress.profile.friendRequestsOut || [];
    let presence = wodMpFriendPresenceMap();
    let api = typeof WodMultiplayer !== 'undefined' ? WodMultiplayer.api : {};
    let inLobbyHost = !!(api.code && api.isHost);
    host.innerHTML = '';
    if(empty) empty.style.display = (friends.length || incoming.length || outgoing.length) ? 'none' : '';
    for(let req of incoming) {
        if(!req || !req.playerId) continue;
        let row = document.createElement('div');
        row.className = 'mp-friend-row pending-in';
        let cv = document.createElement('canvas');
        cv.width = 36;
        cv.height = 36;
        renderShopSkinThumbCanvas(cv, req.unitSkin || 'nato');
        let meta = document.createElement('div');
        meta.className = 'mp-friend-meta';
        meta.innerHTML =
            '<div class="mp-friend-name">' + wodMpEscapeHtml(req.fromName || req.playerId) + '</div>' +
            '<div class="mp-friend-id">' + wodMpEscapeHtml(req.playerId) + '</div>' +
            '<div class="mp-friend-status online">Incoming friend request</div>';
        let actions = document.createElement('div');
        actions.className = 'mp-friend-actions';
        let acc = document.createElement('button');
        acc.type = 'button';
        acc.className = 'build-btn';
        acc.textContent = 'Accept';
        acc.addEventListener('click', () => wodMpRespondFriendRequest(req.playerId, true));
        let dec = document.createElement('button');
        dec.type = 'button';
        dec.className = 'wod-editor-btn';
        dec.textContent = 'Decline';
        dec.addEventListener('click', () => wodMpRespondFriendRequest(req.playerId, false));
        actions.append(acc, dec);
        row.append(cv, meta, actions);
        host.appendChild(row);
    }
    for(let req of outgoing) {
        if(!req || !req.playerId) continue;
        let row = document.createElement('div');
        row.className = 'mp-friend-row pending-out';
        let meta = document.createElement('div');
        meta.className = 'mp-friend-meta';
        meta.innerHTML =
            '<div class="mp-friend-name">Request pending</div>' +
            '<div class="mp-friend-id">' + wodMpEscapeHtml(req.playerId) + '</div>' +
            '<div class="mp-friend-status offline">Waiting for them to accept</div>';
        let actions = document.createElement('div');
        actions.className = 'mp-friend-actions';
        let cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'wod-editor-btn';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => {
            wodProgress.profile.friendRequestsOut = outgoing.filter(r => r && r.playerId !== req.playerId);
            scheduleSaveWodProgress();
            wodMpRenderFriendsList();
        });
        actions.appendChild(cancel);
        row.append(meta, actions);
        host.appendChild(row);
    }
    for(let f of friends) {
        if(!f || !f.playerId) continue;
        let online = presence[f.playerId];
        let name = (online && online.displayName) || f.displayName || f.playerId;
        if(online && online.displayName) f.displayName = online.displayName;
        let row = document.createElement('div');
        row.className = 'mp-friend-row';
        let cv = document.createElement('canvas');
        cv.width = 36;
        cv.height = 36;
        renderShopSkinThumbCanvas(cv, (online && online.unitSkin) || f.unitSkin || 'nato');
        let meta = document.createElement('div');
        meta.className = 'mp-friend-meta';
        meta.innerHTML =
            '<div class="mp-friend-name">' + wodMpEscapeHtml(name) + '</div>' +
            '<div class="mp-friend-id">' + wodMpEscapeHtml(f.playerId) + '</div>' +
            '<div class="mp-friend-status ' + (online ? 'online' : 'offline') + '">' +
            (online ? ('Online' + (online.inLobby ? ' · in a lobby' : '')) : 'Offline') +
            '</div>';
        let actions = document.createElement('div');
        actions.className = 'mp-friend-actions';
        if(inLobbyHost && online) {
            let inv = document.createElement('button');
            inv.type = 'button';
            inv.className = 'build-btn';
            inv.textContent = 'Invite';
            inv.addEventListener('click', () => wodMpInviteFriendToLobby(f.playerId, 0));
            actions.appendChild(inv);
        }
        let rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'wod-editor-btn';
        rm.textContent = 'Remove';
        rm.addEventListener('click', () => wodMpRemoveFriend(f.playerId));
        actions.appendChild(rm);
        row.append(cv, meta, actions);
        host.appendChild(row);
    }
    if(friends.length) scheduleSaveWodProgress();
}
function wodMpQueryFriendPresence() {
    if(typeof WodMultiplayer === 'undefined' || !WodMultiplayer.queryFriendPresence) return;
    if(!WodMultiplayer.api || !WodMultiplayer.api.socketOpen) return;
    let ids = wodMpGetFriendsList().map(f => f && f.playerId).filter(Boolean);
    if(!ids.length) return;
    WodMultiplayer.queryFriendPresence(ids);
}
function wodMpInviteFriendToLobby(playerId, seat) {
    if(typeof WodMultiplayer === 'undefined' || !WodMultiplayer.sendFriendInvite) return;
    if(!WodMultiplayer.api || !WodMultiplayer.api.code || !WodMultiplayer.api.isHost) {
        showNotification('Only the host can invite friends.');
        return;
    }
    if(!wodMpIsFriend(playerId)) {
        showNotification('You can only invite accepted friends.');
        return;
    }
    let now = Date.now();
    window._wodMpInviteSentAt = window._wodMpInviteSentAt || {};
    if(window._wodMpInviteSentAt[playerId] && now - window._wodMpInviteSentAt[playerId] < 45000) {
        showNotification('Wait before inviting this friend again.');
        return;
    }
    wodMpRegisterWithServer();
    WodMultiplayer.sendFriendInvite(playerId, seat | 0);
    window._wodMpInviteSentAt[playerId] = now;
    showNotification('Sending invite…');
    wodMpCloseSeatInviteDlg();
}
let _wodMpPendingInvite = null;
let _wodMpPendingFriendReq = null;
function wodMpCloseFriendRequestDlg() {
    let dlg = document.getElementById('mpFriendRequestDlg');
    if(dlg) { dlg.classList.add('hidden'); dlg.setAttribute('aria-hidden', 'true'); }
    _wodMpPendingFriendReq = null;
}
function wodMpShowFriendRequestDlg(req) {
    if(!req || !req.fromPlayerId) return;
    wodMpEnsureFriendRequestArrays();
    let exists = (wodProgress.profile.friendRequestsIn || []).some(r => r && r.playerId === req.fromPlayerId);
    if(!exists) {
        wodProgress.profile.friendRequestsIn.push({
            playerId: req.fromPlayerId,
            fromName: req.fromName || req.fromPlayerId,
            unitSkin: req.unitSkin || 'nato',
            receivedAt: Date.now()
        });
        scheduleSaveWodProgress();
    }
    if(_wodMpPendingFriendReq && _wodMpPendingFriendReq.fromPlayerId === req.fromPlayerId) return;
    _wodMpPendingFriendReq = req;
    let dlg = document.getElementById('mpFriendRequestDlg');
    let body = document.getElementById('mpFriendRequestBody');
    if(!dlg || !body) return;
    body.innerHTML =
        '<div class="mp-profile-view">' +
        '<canvas id="mpFrReqSkin" width="48" height="48" aria-hidden="true"></canvas>' +
        '<div class="mp-profile-view-stats">' +
        '<div><strong>' + wodMpEscapeHtml(req.fromName || 'Player') + '</strong> wants to be friends.</div>' +
        '<div style="font-size:12px;opacity:0.82;margin-top:6px">' + wodMpEscapeHtml(req.fromPlayerId) + '</div>' +
        '</div></div>';
    let cv = document.getElementById('mpFrReqSkin');
    if(cv) renderShopSkinThumbCanvas(cv, req.unitSkin || 'nato');
    dlg.classList.remove('hidden');
    dlg.setAttribute('aria-hidden', 'false');
    showNotification('Friend request from ' + (req.fromName || 'player'));
    wodMpRenderFriendsList();
}
function wodMpRespondFriendRequest(fromPlayerId, accept) {
    if(typeof WodMultiplayer !== 'undefined' && WodMultiplayer.replyFriendRequest)
        WodMultiplayer.replyFriendRequest(fromPlayerId, accept);
    wodMpEnsureFriendRequestArrays();
    let req = (wodProgress.profile.friendRequestsIn || []).find(r => r && r.playerId === fromPlayerId);
    wodProgress.profile.friendRequestsIn = (wodProgress.profile.friendRequestsIn || []).filter(r => r && r.playerId !== fromPlayerId);
    if(accept && req) wodMpAddFriendLocal(fromPlayerId, req.fromName, req.unitSkin);
    else scheduleSaveWodProgress();
    wodMpCloseFriendRequestDlg();
    wodMpRenderFriendsList();
    showNotification(accept ? 'Friend added.' : 'Request declined.');
}
function wodMpHandleFriendRequestReply(rep) {
    if(!rep || !rep.fromPlayerId) return;
    wodMpEnsureFriendRequestArrays();
    wodProgress.profile.friendRequestsOut = (wodProgress.profile.friendRequestsOut || []).filter(r => r && r.playerId !== rep.fromPlayerId);
    if(rep.accept) {
        wodMpAddFriendLocal(rep.fromPlayerId, rep.fromName, rep.unitSkin);
        showNotification((rep.fromName || 'Player') + ' accepted your friend request.');
    } else {
        scheduleSaveWodProgress();
        wodMpRenderFriendsList();
        showNotification((rep.fromName || 'Player') + ' declined your friend request.');
    }
}
function wodMpCloseFriendInviteDlg() {
    let dlg = document.getElementById('mpFriendInviteDlg');
    if(dlg) { dlg.classList.add('hidden'); dlg.setAttribute('aria-hidden', 'true'); }
    _wodMpPendingInvite = null;
}
function wodMpShowFriendInviteDlg(inv) {
    if(!inv || !inv.lobbyId) return;
    let now = Date.now();
    let dedupeKey = inv.lobbyId + ':' + (inv.fromPlayerId || inv.fromName || '');
    window._wodMpInviteDedupe = window._wodMpInviteDedupe || {};
    if(_wodMpPendingInvite && _wodMpPendingInvite.lobbyId === inv.lobbyId) return;
    if(window._wodMpInviteDedupe[dedupeKey] && now - window._wodMpInviteDedupe[dedupeKey] < 60000) return;
    window._wodMpInviteDedupe[dedupeKey] = now;
    _wodMpPendingInvite = inv;
    let dlg = document.getElementById('mpFriendInviteDlg');
    let body = document.getElementById('mpFriendInviteBody');
    if(!dlg || !body) return;
    body.textContent = (inv.fromName || 'A friend') + ' invited you to "' + (inv.lobbyName || 'Game') + '".' +
        (inv.locked ? ' This lobby requires a password.' : '');
    if(inv.fromPlayerId) {
        wodMpSwitchHubTab('friends');
        let inp = document.getElementById('mpFriendAddInput');
        if(inp) inp.value = wodMpNormalizePlayerId(inv.fromPlayerId) || inv.fromPlayerId;
    }
    if(inv.lobbyId) window._wodMpPendingLobbyFromUrl = inv.lobbyId;
    dlg.classList.remove('hidden');
    dlg.setAttribute('aria-hidden', 'false');
    showNotification('Lobby invite from ' + (inv.fromName || 'friend'));
}
async function wodMpAcceptPendingInvite() {
    let inv = _wodMpPendingInvite;
    if(!inv || !inv.lobbyId) return;
    if(!wodMpRequireRegisteredDisplayName('joining a lobby')) return;
    wodMpCloseFriendInviteDlg();
    await wodMpEnsureConnected();
    if(typeof WodMultiplayer === 'undefined' || !WodMultiplayer.api.socketOpen) {
        showNotification('Could not connect to multiplayer server.');
        return;
    }
    if(WodMultiplayer.api.code && WodMultiplayer.api.code !== inv.lobbyId) {
        showNotification('Leave your current lobby first.');
        return;
    }
    try {
        wodEnsurePlayerId();
        await wodMpJoinWithPassword(inv.lobbyId,inv.locked,{
            seat: inv.seat | 0,
            playerId: wodProgress.profile.playerId || ''
        });
        wodMpLobbyCount = Math.max(wodMpLobbyCount, WodMultiplayer.api.slot | 0, 1);
        wodMpRefreshMpPanelState();
        wodMpPushLobbyProfile();
        showNotification('Joined lobby.');
    } catch(e) {
        showNotification(e && e.message ? e.message : 'Could not join lobby.');
    }
}
let _wodMpSeatInviteSlot = 0;
function wodMpCloseSeatInviteDlg() {
    let dlg = document.getElementById('mpSeatInviteDlg');
    if(dlg) { dlg.classList.add('hidden'); dlg.setAttribute('aria-hidden', 'true'); }
    _wodMpSeatInviteSlot = 0;
}
function wodMpOpenSeatInviteDlg(slot) {
    if(typeof WodMultiplayer === 'undefined' || !WodMultiplayer.api || !WodMultiplayer.api.isHost) return;
    _wodMpSeatInviteSlot = slot | 0;
    let dlg = document.getElementById('mpSeatInviteDlg');
    let list = document.getElementById('mpSeatInviteList');
    let hint = document.getElementById('mpSeatInviteHint');
    if(!dlg || !list) return;
    if(hint) hint.textContent = 'Pick an online friend to invite to seat ' + slot + '.';
    list.innerHTML = '';
    let presence = wodMpFriendPresenceMap();
    let friends = wodMpGetFriendsList().filter(f => f && f.playerId && presence[f.playerId]);
    if(!friends.length) {
        list.innerHTML = '<p class="mp-hub-pane-lead">No online friends right now. Add friends on the Friends tab and try again.</p>';
    } else {
        for(let f of friends) {
            let online = presence[f.playerId];
            let name = (online && online.displayName) || f.displayName || f.playerId;
            let btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mp-friend-row';
            btn.style.width = '100%';
            btn.style.cursor = 'pointer';
            btn.style.textAlign = 'left';
            let cv = document.createElement('canvas');
            cv.width = 36;
            cv.height = 36;
            renderShopSkinThumbCanvas(cv, (online && online.unitSkin) || 'nato');
            let meta = document.createElement('div');
            meta.className = 'mp-friend-meta';
            meta.innerHTML = '<div class="mp-friend-name">' + wodMpEscapeHtml(name) + '</div><div class="mp-friend-id">' + wodMpEscapeHtml(f.playerId) + '</div>';
            btn.append(cv, meta);
            btn.addEventListener('click', () => wodMpInviteFriendToLobby(f.playerId, _wodMpSeatInviteSlot));
            list.appendChild(btn);
        }
    }
    dlg.classList.remove('hidden');
    dlg.setAttribute('aria-hidden', 'false');
    wodMpQueryFriendPresence();
}
function wodMpOpenPlayerProfileDlg(slot) {
    let dlg = document.getElementById('mpPlayerProfileDlg');
    let title = document.getElementById('mpPlayerProfileTitle');
    let body = document.getElementById('mpPlayerProfileBody');
    if(!dlg || !title || !body) return;
    let meta = window.wodMpRoomMeta || {};
    wodMpNormalizeLobbyMeta(meta);
    let st = meta.seatTypes || [];
    if(slot < 1 || slot > WOD_MP_MAX_PLAYERS) return;
    let seatT = (st[slot - 1] || 'human');
    let pp = (meta.playerPublic && meta.playerPublic[String(slot)]) || {};
    let roleLabel = seatT === 'bot' ? 'AI' : (seatT === 'closed' ? 'Closed seat' : 'Human');
    let name = pp.displayName || (seatT === 'bot' ? ('AI — seat ' + slot) : (seatT === 'closed' ? ('Closed — seat ' + slot) : ('Seat ' + slot)));
    let col = wodMpLobbyEffectiveSlotColor(meta, slot);
    let skinId = pp.unitSkin || 'nato';
    let skinLab = wodMpSkinLabelForId(skinId);
    let cs = pp.combinedStats;
    if(!cs && pp.mpStats) {
        cs = {
            wins: pp.mpStats.wins | 0,
            losses: pp.mpStats.losses | 0,
            kills: 0,
            defeats: 0,
            gamesPlayed: pp.mpStats.gamesPlayed | 0
        };
    }
    let statsHtml = cs && typeof cs === 'object'
        ? '<div style="margin-top:8px"><strong>Wins</strong> ' + formatLifetimeBig(cs.wins | 0) +
        ' · <strong>Kills</strong> ' + formatLifetimeBig(cs.kills | 0) +
        '<br><strong>Losses</strong> ' + formatLifetimeBig(cs.losses | 0) +
        ' · <strong>Defeats</strong> ' + formatLifetimeBig(cs.defeats | 0) + '</div>' +
        '<p style="font-size:12px;opacity:0.78;margin:8px 0 0">Combined stats from their device (not verified).</p>'
        : '<p style="font-size:12px;opacity:0.82;margin:0">No stats shared yet.</p>';
    body.innerHTML =
        '<div class="mp-profile-view">' +
        '<canvas id="mpDlgProfileSkin" width="64" height="64" aria-hidden="true"></canvas>' +
        '<div class="mp-profile-view-stats">' +
        '<div><strong>Seat</strong> ' + slot + ' · ' + wodMpEscapeHtml(roleLabel) + '</div>' +
        (seatT !== 'closed' ? '<div style="margin-top:6px"><strong>Color</strong> <span class="mp-gl-swatch" style="background:' + wodMpEscapeHtml(col) + ';vertical-align:middle;margin-right:6px"></span>' + wodMpEscapeHtml(col || '—') + '</div>' : '') +
        '<div style="margin-top:6px"><strong>Light unit skin</strong> ' + wodMpEscapeHtml(skinLab) + '</div>' +
        (pp.playerId ? '<div style="margin-top:6px;font-size:12px;opacity:0.82"><strong>Player ID</strong> ' + wodMpEscapeHtml(pp.playerId) + '</div>' : '') +
        statsHtml +
        '</div></div>';
    let cv = document.getElementById('mpDlgProfileSkin');
    if(cv && seatT !== 'closed') renderShopSkinThumbCanvas(cv, skinId);
    title.textContent = name;
    dlg.classList.remove('hidden');
    dlg.setAttribute('aria-hidden', 'false');
}
function wodMpClosePlayerProfileDlg() {
    let dlg = document.getElementById('mpPlayerProfileDlg');
    if(!dlg) return;
    dlg.classList.add('hidden');
    dlg.setAttribute('aria-hidden', 'true');
}
function wodMpSyncHostCfgFromSetup() {
    wodMpCopyFieldToField('setupMapSize', 'mpCfgMapSize');
    wodMpCopyFieldToField('setupMapShape', 'mpCfgMapShape');
    wodMpCopyFieldToField('setupCitiesPerPlayer', 'mpCfgCitiesPerPlayer');
    wodMpCopyFieldToField('setupVictoryMode', 'mpCfgVictoryMode');
    wodMpCopyFieldToField('setupFogOfWar', 'mpCfgFogOfWar');
    wodMpCopyFieldToField('setupMoney', 'mpCfgMoney');
    wodMpCopyFieldToField('setupPlayerColor', 'mpCfgPlayerColor');
    wodMpCopyFieldToField('setupGamePeriod', 'mpCfgGamePeriod');
    wodMpSyncMpCfgVictoryDetail();
}
/** Always four seat rows; capacity is Human / AI / Closed per seat, not a separate max-seats cap. */
function wodMpNormalizeLobbyMeta(meta) {
    if(!meta || typeof meta !== 'object') return WOD_MP_MAX_PLAYERS;
    meta.maxHumans = WOD_MP_MAX_PLAYERS;
    let st = Array.isArray(meta.seatTypes) ? meta.seatTypes.slice(0, WOD_MP_MAX_PLAYERS) : [];
    while(st.length < WOD_MP_MAX_PLAYERS) st.push(st.length === 0 ? 'human' : 'closed');
    for(let i = 0; i < st.length; i++) {
        if(st[i] !== 'bot' && st[i] !== 'closed') st[i] = 'human';
    }
    meta.seatTypes = st;
    return WOD_MP_MAX_PLAYERS;
}
/** Active non-closed seats — map layout depends on this, not human vs bot per seat. */
function wodMpLobbyFactionFingerprint(meta) {
    if(!meta || typeof meta !== 'object') return '1';
    try {
        // Towns per player changes borders and towns exactly like a seat change does
        // (terrain stays), so it rides in the same fingerprint. Default 2 adds nothing.
        let cities = wodMpCitiesPerPlayerFromMeta(meta);
        return wodMpGetLobbyFactionSlotsFromMeta(meta).join(',') + (cities !== 2 ? '|c' + cities : '');
    } catch(e) {
        return '1';
    }
}
function wodMpCitiesPerPlayerFromMeta(meta) {
    let v = parseInt(meta && meta.citiesPerPlayer, 10);
    return v >= 1 && v <= 4 ? v : 2;
}
function wodMpSyncSeatsToLobbyPopulation(meta) {
    if(!meta || typeof meta !== 'object') return false;
    wodMpNormalizeLobbyMeta(meta);
    let st = meta.seatTypes || [];
    let occ = Array.isArray(meta.occupiedSlots) ? meta.occupiedSlots.slice().sort((a, b) => a - b) : [];
    let changed = false;
    for(let s of occ) {
        if(s >= 1 && s <= WOD_MP_MAX_PLAYERS && st[s - 1] === 'closed') {
            st[s - 1] = 'human';
            changed = true;
        }
    }
    let need = Math.max(occ.length, 1);
    for(let s = 1; s <= WOD_MP_MAX_PLAYERS && wodMpGetLobbyFactionSlotsFromMeta(meta).length < need; s++) {
        if(st[s - 1] === 'closed') {
            st[s - 1] = 'human';
            changed = true;
        }
    }
    return changed;
}
function wodMpEnsureDefaultSeatTypes(meta) { wodMpNormalizeLobbyMeta(meta); }
function wodMpBuildSeatTypesFromCounts(humanCount, botCount) {
    let humans = Math.max(1, Math.min(WOD_MP_MAX_PLAYERS, humanCount | 0));
    let bots = Math.max(0, Math.min(WOD_MP_MAX_PLAYERS - humans, botCount | 0));
    let st = [];
    for(let i = 0; i < humans; i++) st.push('human');
    for(let i = 0; i < bots; i++) st.push('bot');
    while(st.length < WOD_MP_MAX_PLAYERS) st.push('closed');
    return st;
}
function wodMpReadHostLayoutCounts() {
    let hEl = document.getElementById('mpHostHumanSeats');
    let bEl = document.getElementById('mpHostBotSeats');
    let humans = hEl ? (parseInt(hEl.value, 10) || 2) : 2;
    let bots = bEl ? (parseInt(bEl.value, 10) || 1) : 1;
    if(humans + bots > WOD_MP_MAX_PLAYERS) bots = Math.max(0, WOD_MP_MAX_PLAYERS - humans);
    return { humans, bots };
}
function wodMpReadGlLayoutCounts() {
    let hEl = document.getElementById('mpGlHumanCount');
    let bEl = document.getElementById('mpGlBotCount');
    let humans = hEl ? (parseInt(hEl.value, 10) || 2) : 2;
    let bots = bEl ? (parseInt(bEl.value, 10) || 1) : 1;
    if(humans + bots > WOD_MP_MAX_PLAYERS) bots = Math.max(0, WOD_MP_MAX_PLAYERS - humans);
    return { humans, bots };
}
function wodMpSyncLayoutCountFieldsFromMeta(meta) {
    if(!meta || !meta.seatTypes) return;
    let st = meta.seatTypes;
    let humans = 0, bots = 0;
    for(let i = 0; i < WOD_MP_MAX_PLAYERS; i++) {
        if(st[i] === 'human') humans++;
        else if(st[i] === 'bot') bots++;
    }
    let hHost = document.getElementById('mpHostHumanSeats');
    let bHost = document.getElementById('mpHostBotSeats');
    let hGl = document.getElementById('mpGlHumanCount');
    let bGl = document.getElementById('mpGlBotCount');
    if(hHost) hHost.value = String(Math.max(1, humans));
    if(bHost) bHost.value = String(bots);
    if(hGl) hGl.value = String(Math.max(1, humans));
    if(bGl) bGl.value = String(bots);
}
function wodMpBuildInitialHostMeta() {
    let layout = wodMpReadHostLayoutCounts();
    let st = wodMpBuildSeatTypesFromCounts(layout.humans, layout.bots);
    let lobbyMapSeed = ((Math.random() * 0xfffffffe) | 0) >>> 0;
    if(!lobbyMapSeed) lobbyMapSeed = 0x5bd1e995;
    return {
        seatTypes: st,
        aiCount: layout.bots,
        maxHumans: WOD_MP_MAX_PLAYERS,
        mapSize: 60,
        mapShape: 'island',
        citiesPerPlayer: 2,
        lobbyMapSeed,
        victoryMode: 'domination',
        money: 1000,
        mapSizeLabel: 'Medium',
        mapShapeLabel: 'Island',
        victoryLabel: 'Domination'
    };
}
/** Update human/bot seat layout; politics-only refresh when terrain can stay. */
function wodMpApplyLayoutCounts(humanCount, botCount, opts) {
    opts = opts || {};
    if(!window.wodMpRoomMeta || typeof window.wodMpRoomMeta !== 'object') window.wodMpRoomMeta = {};
    wodMpNormalizeLobbyMeta(window.wodMpRoomMeta);
    let prevFactionFp = wodMpLobbyFactionFingerprint(window.wodMpRoomMeta);
    let prevTerrainFp = wodMpLobbyTerrainFingerprint(window.wodMpRoomMeta);
    window.wodMpRoomMeta.seatTypes = wodMpBuildSeatTypesFromCounts(humanCount, botCount);
    gameData.aiCount = window.wodMpRoomMeta.seatTypes.filter(t => t === 'bot').length;
    wodMpSyncLayoutCountFieldsFromMeta(window.wodMpRoomMeta);
    wodMpPushLobbyMetaFromCurrentUi();
    let nextFactionFp = wodMpLobbyFactionFingerprint(window.wodMpRoomMeta);
    if(opts.forceRegen) {
        window.wodMpRoomMeta.lobbyMapSeed = (Math.imul(Date.now() >>> 0, 2246822519) ^ (window.wodMpRoomMeta.lobbyMapSeed || 0) ^ 0x9e3779b9) >>> 0;
        if(!window.wodMpRoomMeta.lobbyMapSeed) window.wodMpRoomMeta.lobbyMapSeed = 0x6a09e667;
        wodMpRefreshLobbyMapPreviewAfterMetaChange(window.wodMpRoomMeta, { force: true });
        return;
    }
    let terrainUnchanged = prevTerrainFp === wodMpLobbyTerrainFingerprint(window.wodMpRoomMeta);
    let politicsOk = terrainUnchanged && (prevFactionFp === nextFactionFp || wodMpCanUsePoliticsOnlyForMeta(window.wodMpRoomMeta));
    wodMpRefreshLobbyMapPreviewAfterMetaChange(window.wodMpRoomMeta, {
        politicsOnly: politicsOk,
        force: !politicsOk && prevFactionFp !== nextFactionFp
    });
}
function wodMpApplyRoomMeta(meta) {
    window.wodMpRoomMeta = meta && typeof meta === 'object' ? JSON.parse(JSON.stringify(meta)) : {};
    wodMpNormalizeLobbyMeta(window.wodMpRoomMeta);
    if(window.wodMpRoomMeta.playerColors) {
        for(let k of Object.keys(window.wodMpRoomMeta.playerColors)) {
            let i = parseInt(k, 10);
            if(i >= 1 && i < factionColors.length) factionColors[i] = window.wodMpRoomMeta.playerColors[k];
        }
    }
    let setupMs = document.getElementById('setupMapSize');
    if(setupMs && window.wodMpRoomMeta.mapSize != null) setupMs.value = String(window.wodMpRoomMeta.mapSize);
    let setupSh = document.getElementById('setupMapShape');
    if(setupSh && window.wodMpRoomMeta.mapShape) setupSh.value = window.wodMpRoomMeta.mapShape;
    let ms = document.getElementById('mpCfgMapSize');
    if(ms && window.wodMpRoomMeta.mapSize != null) ms.value = String(window.wodMpRoomMeta.mapSize);
    let sh = document.getElementById('mpCfgMapShape');
    if(sh && window.wodMpRoomMeta.mapShape) sh.value = window.wodMpRoomMeta.mapShape;
    for(let id of ['setupCitiesPerPlayer', 'mpCfgCitiesPerPlayer']) {
        let el = document.getElementById(id);
        if(el) el.value = String(wodMpCitiesPerPlayerFromMeta(window.wodMpRoomMeta));
    }
    let vic = document.getElementById('mpCfgVictoryMode');
    if(vic && window.wodMpRoomMeta.victoryMode) vic.value = window.wodMpRoomMeta.victoryMode === 'annihilation' ? 'annihilation' : 'domination';
    let fogMp = document.getElementById('mpCfgFogOfWar');
    let fogSetup = document.getElementById('setupFogOfWar');
    if(window.wodMpRoomMeta.fogOfWar != null) {
        if(fogMp) fogMp.checked = !!window.wodMpRoomMeta.fogOfWar;
        if(fogSetup) fogSetup.checked = !!window.wodMpRoomMeta.fogOfWar;
    }
    let mon = document.getElementById('mpCfgMoney');
    if(mon && window.wodMpRoomMeta.money != null) mon.value = String(window.wodMpRoomMeta.money);
    let per = document.getElementById('mpCfgGamePeriod');
    let setupPer = document.getElementById('setupGamePeriod');
    if(window.wodMpRoomMeta.gamePeriod) {
        if(per) per.value = window.wodMpRoomMeta.gamePeriod;
        if(setupPer) setupPer.value = window.wodMpRoomMeta.gamePeriod;
        wodApplyGamePeriod(window.wodMpRoomMeta.gamePeriod, { saveProfile: false });
    }
    wodMpSyncMpCfgVictoryDetail();
    if(_wodMpCommittedLobbyMap && _wodMpCommittedLobbyMap.data) {
        let terrainFp = wodMpLobbyTerrainFingerprint(window.wodMpRoomMeta);
        if(_wodMpCommittedLobbyMap.terrainFp && _wodMpCommittedLobbyMap.terrainFp !== terrainFp)
            _wodMpCommittedLobbyMap = null;
    }
}
function wodMpEmptyLobbyGenBackup() {
    return {
        hexList: [],
        hexes: {},
        cities: [],
        roads: [],
        entities: [],
        mapRadius: gameData.mapRadius,
        mapShape: gameData.mapShape,
        loadedCustomMap: false,
        money: gameData.money,
        income: gameData.income,
        manpower: gameData.manpower,
        aiCount: gameData.aiCount, aiCommanderStyle:gameData.aiCommanderStyle||'varied',aiCommanderProfiles:gameData.aiCommanderProfiles||{},
        mp: gameData.mp,
        selection: [],
        buildMode: gameData.buildMode
    };
}
function wodMpSnapshotLobbyGenBackup() {
    if(wodLiveMapLooksLikeMenuAttract() || !gameData.hexList || !gameData.hexList.length)
        return wodMpEmptyLobbyGenBackup();
    return {
        hexList: gameData.hexList,
        hexes: gameData.hexes,
        cities: gameData.cities,
        roads: gameData.roads,
        entities: gameData.entities,
        mapRadius: gameData.mapRadius,
        mapShape: gameData.mapShape,
        loadedCustomMap: gameData.loadedCustomMap,
        money: gameData.money,
        income: gameData.income,
        manpower: gameData.manpower,
        aiCount: gameData.aiCount, aiCommanderStyle:gameData.aiCommanderStyle||'varied',aiCommanderProfiles:gameData.aiCommanderProfiles||{},
        mp: gameData.mp,
        selection: gameData.selection ? gameData.selection.slice() : [],
        buildMode: gameData.buildMode
    };
}
function wodMpRestoreLobbyGenBackup(s) {
    if(!s) return;
    gameData.hexList = s.hexList;
    gameData.hexes = s.hexes;
    gameData.cities = s.cities;
    gameData.roads = s.roads;
    gameData.entities = s.entities;
    gameData.mapRadius = s.mapRadius;
    gameData.mapShape = s.mapShape;
    gameData.loadedCustomMap = s.loadedCustomMap;
    gameData.money = s.money;
    gameData.income = s.income;
    gameData.manpower = s.manpower;
    gameData.aiCount = s.aiCount;
    gameData.mp = s.mp;
    gameData.selection = s.selection;
    gameData.buildMode = s.buildMode;
    syncBuildPlacementMobileUi();
    wodMarkTerrainFullDirty();
}
/** Lobby preview uses seeded Math.random; overlapping refreshes corrupted RNG via `wodPushSeededRandom`. Serialize + dedupe. */
let _wodMpLobbyPreviewBusy = false;
let _wodMpLobbyPreviewQueued = false;
let _wodMpLobbyPreviewGenToken = 0;
let _wodMpLobbyPreviewLastFp = '';
let _wodMpLobbyPreviewLastTerrainFp = '';
let _wodMpLobbyPreviewLastFactionFp = '';
let _wodMpGuestLobbyPreviewFp = '';
let _wodMpCommittedLobbyMap = null;
function wodMpDeepSnapshotMapState() {
    return {
        hexList: (gameData.hexList || []).map(h => Object.assign({}, h)),
        hexes: Object.fromEntries(Object.keys(gameData.hexes || {}).map(k => [k, Object.assign({}, gameData.hexes[k])])),
        cities: (gameData.cities || []).map(c => Object.assign({}, c)),
        roads: (gameData.roads || []).map(r => ({
            fq: r.from.q, fr: r.from.r, tq: r.to.q, tr: r.to.r,...wodRoadRouteFields(r)
        })),
        entities: (gameData.entities || []).map(u => Object.assign({}, u)),
        hospitals: (gameData.hospitals || []).map(h => ({...h})),
        forts: (gameData.forts || []).map(f => Object.assign({}, f)),
        bridges: (gameData.bridges || []).map(b => JSON.parse(JSON.stringify(b))),
        mapRadius: gameData.mapRadius,
        mapShape: gameData.mapShape,
        loadedCustomMap: gameData.loadedCustomMap,
        _mapGenSeed: gameData._mapGenSeed,
        hexRadius: gameData.hexRadius,
        aiMoneyByOwner: Object.assign({}, gameData.aiMoneyByOwner),
        aiManpowerByOwner: Object.assign({}, gameData.aiManpowerByOwner),
        _wodProcgenBorderFirstApplied: !!gameData._wodProcgenBorderFirstApplied,
        _mpTerrainPoliticsBase: gameData._wodTerrainPoliticsBase ? JSON.parse(JSON.stringify(gameData._wodTerrainPoliticsBase)) : null,
        _mpTerrainPoliticsBridges: (gameData._wodTerrainPoliticsBridges || []).map(b => JSON.parse(JSON.stringify(b))),
        _mpTerrainPoliticsBaseFp: gameData._wodTerrainPoliticsBaseFp || ''
    };
}
function wodMpApplyDeepMapSnapshot(snap) {
    if(!snap) return false;
    gameData.hexList = (snap.hexList || []).map(h => Object.assign({}, h));
    wodMpNormalizeHexListTerrainColors(gameData.hexList);
    wodMpRebuildHexesFromList(gameData.hexList);
    gameData.cities = (snap.cities || []).map(c => Object.assign({}, c));
    gameData.roads = (snap.roads || []).map(ro => {
        let fq = ro.fq != null ? ro.fq : (ro.from && ro.from.q);
        let fr = ro.fr != null ? ro.fr : (ro.from && ro.from.r);
        let tq = ro.tq != null ? ro.tq : (ro.to && ro.to.q);
        let tr = ro.tr != null ? ro.tr : (ro.to && ro.to.r);
        let from = gameData.cities.find(c => c.q === fq && c.r === fr);
        let to = gameData.cities.find(c => c.q === tq && c.r === tr);
        return from && to ? { from, to,...wodRoadRouteFields(ro) } : null;
    }).filter(Boolean);
    gameData.entities = (snap.entities || []).map(u => Object.assign({}, u));
    gameData.hospitals = (snap.hospitals || []).map(h => ({...h}));
    gameData.forts = (snap.forts || []).map(f => Object.assign({}, f));
    gameData.bridges = (snap.bridges || []).map(b => wodNormalizeBridgeRecord(b)).filter(Boolean);
    for(let br of gameData.bridges) wodSyncBridgeWorldCoords(br);
    wodRebuildBridgeHexIndex();
    gameData.mapRadius = snap.mapRadius;
    gameData.mapShape = snap.mapShape;
    gameData.loadedCustomMap = !!snap.loadedCustomMap;
    if(snap._mapGenSeed != null) gameData._mapGenSeed = snap._mapGenSeed >>> 0;
    if(snap.hexRadius != null) gameData.hexRadius = snap.hexRadius;
    gameData.aiMoneyByOwner = Object.assign({}, snap.aiMoneyByOwner);
    gameData.aiManpowerByOwner = Object.assign({}, snap.aiManpowerByOwner);
    if(snap._wodProcgenBorderFirstApplied) gameData._wodProcgenBorderFirstApplied = true;
    return gameData.hexList.length > 0;
}
/** Apply a map snapshot for an active MP match and invalidate all baked terrain/fog caches. */
function wodMpInstallMatchMapFromSnapshot(snap, opts) {
    opts = opts || {};
    if(!wodMpApplyDeepMapSnapshot(snap)) return false;
    wodMarkTerrainFullDirty();
    wodTerrainBakeNextMs = 0;
    wodTerrainPolWork = null;
    gameData._fogCanvasDirty = true;
    gameData._fogExplored = new Set();
    gameData._fogVisible = null;
    normalizeTerrainHexes();
    updateTerrainKey(opts.terrainKeyOpts || { skipHelp: true });
    if(opts.bakeNow !== false && typeof updateTerrainCache === 'function')
        updateTerrainCache();
    return true;
}
function wodMpMatchPayloadSourceSnap(meta) {
    meta = meta || window.wodMpRoomMeta || {};
    let cm = _wodMpCommittedLobbyMap;
    if(cm && cm.data && wodMpLobbyMapMatchesMeta(meta, cm.data)) return cm.data;
    return null;
}
function wodMpCommittedIsCurrentForMeta(meta) {
    let cm = _wodMpCommittedLobbyMap;
    if(!cm || !cm.data) return false;
    let curFp = wodMpLobbyPreviewFingerprint(meta);
    if(cm.fp && cm.fp !== curFp) return false;
    return wodMpLobbyMapMatchesMeta(meta, cm.data);
}
/** Wire economy/camera/units after applying the lobby preview snapshot — do not rerun full assignStartingCities. */
function wodMpWireLaunchFromCommittedMap(meta, expected) {
    let ownersList = (expected && expected.length) ? expected.slice() : wodMpGetLobbyFactionSlotsFromMeta(meta);
    if(!ownersList.length) throw new Error('No active lobby factions');
    if(!ownersList.every(o => gameData.cities.some(c => c && c.owner === o)))
        throw new Error('Lobby map is missing a capital for each active seat');
    gameData._wodProcgenBorderFirstApplied = true;
    gameData.tradeTimer = 0;
    let locO = (gameData.mp && gameData.mp.enabled) ? (gameData.mp.localSlot || 1) : 1;
    let startMoney = meta && meta.money != null
        ? (parseInt(meta.money, 10) || 10000)
        : (parseInt((document.getElementById('setupMoney') || {}).value, 10) || 10000);
    if(!gameData.aiMoneyByOwner) gameData.aiMoneyByOwner = {};
    if(!gameData.aiManpowerByOwner) gameData.aiManpowerByOwner = {};
    for(let owner of ownersList) {
        if(owner === locO) {
            gameData.money = startMoney;
            gameData.manpower = 5000;
            gameData.aiMoneyByOwner[owner] = 0;
            gameData.aiManpowerByOwner[owner] = 0;
        } else {
            gameData.aiMoneyByOwner[owner] = startMoney;
            gameData.aiManpowerByOwner[owner] = 5000;
        }
    }
    wodNormalizeStartingCityEconomy(ownersList);
    gameData._landIncomeCacheDirty = true;
    if(!gameData.entities.length) spawnInitialFrontlineUnits(ownersList);
    else if(gameData.loadedCustomMap) wodReduceAuthoredStartingArmy(ownersList);
    wodMarkTerrainPoliticalDirty();
    let startMe = gameData.cities.find(c => c.owner === locO && c.hasFactory) || gameData.cities.find(c => c.owner === locO);
    if(startMe) {
        let vw = canvas.clientWidth || UI.wrapper.clientWidth || wodCanvasAllocSize.w || 1;
        let vh = canvas.clientHeight || UI.wrapper.clientHeight || wodCanvasAllocSize.h || 1;
        gameData.camera.x = startMe.x * gameData.camera.zoom - vw / 2;
        gameData.camera.y = startMe.y * gameData.camera.zoom - vh / 2;
    }
    gameData._wodProcgenBorderFirstApplied = true;
}
function wodMpCommitLobbyPreviewMap(meta, fp) {
    if(!meta || !gameData.hexList || !gameData.hexList.length) return;
    if(!gameData._wodTerrainPoliticsBase || gameData._wodTerrainPoliticsBaseFp !== wodTerrainOnlyFingerprint())
        wodCaptureTerrainPoliticsBase();
    _wodMpCommittedLobbyMap = {
        fp: fp || wodMpLobbyPreviewFingerprint(meta),
        terrainFp: wodMpLobbyTerrainFingerprint(meta),
        data: wodMpDeepSnapshotMapState()
    };
}
function wodMpBuildLobbyPreviewNetPayload(fp) {
    let src = (_wodMpCommittedLobbyMap && _wodMpCommittedLobbyMap.data) ? _wodMpCommittedLobbyMap.data : null;
    if(!src || !src.hexList || !src.hexList.length) return null;
    return {
        v: 1,
        fp: fp || '',
        hexList: src.hexList.map(wodStripHexForNet),
        cities: (src.cities || []).map(c => ({
            id: c.id, name: c.name, x: c.x, y: c.y, q: c.q, r: c.r, owner: c.owner,
            hasFactory: !!c.hasFactory, hasHarbor: !!c.hasHarbor, hasFarm: !!c.hasFarm, hp: c.hp, maxHp: c.maxHp
        })),
        entities: (src.entities || []).map(wodStripEntityForNet),
        mapRadius: src.mapRadius,
        mapShape: src.mapShape,
        hexRadius: src.hexRadius,
        factionColors: factionColors.slice()
    };
}
function wodMpHostPushLobbyPreview(fp) {
    if(!wodMpIsLobbyPreviewHost() || gameState === 'PLAYING') return;
    let payload = wodMpBuildLobbyPreviewNetPayload(fp);
    if(!payload) return;
    try {
        if(typeof WodMultiplayer !== 'undefined' && WodMultiplayer.sendLobbyPreview)
            WodMultiplayer.sendLobbyPreview(fp, payload);
    } catch(err) {
        console.warn('Lobby preview sync failed', err);
    }
}
function wodMpApplyLobbyPreviewSnapshot(p) {
    if(!p || !p.hexList || !p.hexList.length) return false;
    wodMpRebuildHexesFromList(p.hexList);
    gameData.cities = (p.cities || []).map(c => Object.assign({}, c));
    gameData.entities = (p.entities || []).map(u => wodEntityFromNet(u));
    gameData.roads = [];
    gameData.forts = [];
    gameData.hospitals = [];
    gameData.bridges = [];
    gameData.mapRadius = p.mapRadius;
    gameData.mapShape = p.mapShape;
    if(p.hexRadius != null) gameData.hexRadius = p.hexRadius;
    if(p.factionColors && p.factionColors.length) {
        for(let i = 0; i < Math.min(p.factionColors.length, factionColors.length); i++)
            factionColors[i] = p.factionColors[i];
    }
    return gameData.hexList.length > 0;
}
function wodMpGuestPreviewMatchesMeta(meta) {
    if(!_wodMpGuestLobbyPreviewFp || !meta) return false;
    return _wodMpGuestLobbyPreviewFp === wodMpLobbyPreviewFingerprint(meta);
}
function wodMpPaintSyncedLobbyPreview(payload) {
    if(!payload || !payload.hexList || !payload.hexList.length) return false;
    if(gameState === 'PLAYING') return false;
    if(wodMpIsLobbyPreviewHost()) return false;
    let fp = payload.fp || '';
    if(fp && fp === _wodMpGuestLobbyPreviewFp) return true;
    let snap = wodMpSnapshotLobbyGenBackup();
    try {
        if(!wodMpApplyLobbyPreviewSnapshot(payload)) return false;
        previewLoadedMap('mpLobbyMapPreview');
        _wodMpGuestLobbyPreviewFp = fp;
        wodDisarmMapPreviewSpinner('mpLobbyMapPreview');
        return true;
    } finally {
        wodMpRestoreLobbyGenBackup(snap);
    }
}
function wodMpCollectOwnersFromSnap(snap) {
    let owners = new Set();
    for(let c of (snap && snap.cities) || gameData.cities || []) {
        if(c && c.owner > 0) owners.add(c.owner);
    }
    if(owners.size === 0) {
        for(let h of (snap && snap.hexList) || gameData.hexList || []) {
            if(h && h.owner > 0) owners.add(h.owner);
        }
    }
    return owners;
}
/** Lobby map must have exactly the active factions in meta — no missing or extra seats. */
function wodMpLobbyMapMatchesMeta(meta, snap) {
    let expectedSlots = wodMpGetLobbyFactionSlotsFromMeta(meta);
    if(!expectedSlots.length) return false;
    let owners = wodMpCollectOwnersFromSnap(snap);
    if(owners.size !== expectedSlots.length) return false;
    for(let s of expectedSlots) {
        if(!owners.has(s)) return false;
    }
    return true;
}
function wodMpTryActivateCommittedLobbyMap(meta) {
    let cm = _wodMpCommittedLobbyMap;
    if(!cm || !cm.data) return false;
    if(!wodMpLobbyMapMatchesMeta(meta, cm.data)) return false;
    if(!wodMpInstallMatchMapFromSnapshot(cm.data, { bakeNow: false })) return false;
    return wodMpLobbyMapMatchesMeta(meta, null);
}
function wodMpWaitForLobbyPreviewIdle(timeoutMs) {
    timeoutMs = timeoutMs || 90000;
    let t0 = performance.now();
    return new Promise((resolve, reject) => {
        (function tick() {
            if(!_wodMpLobbyPreviewBusy && !_wodMpLobbyPreviewQueued) {
                resolve();
                return;
            }
            if(performance.now() - t0 > timeoutMs) {
                reject(new Error('Lobby map preview timed out'));
                return;
            }
            setTimeout(tick, 40);
        })();
    });
}
async function wodMpHostSyncCommittedPreviewForLaunch(meta) {
    if(!meta || typeof meta !== 'object') return false;
    wodMpNormalizeLobbyMeta(meta);
    wodMpSyncLaunchSettingsFromMeta(meta);
    let st = (meta.seatTypes || []).slice(0, WOD_MP_MAX_PLAYERS);
    let factions = wodMpGetLobbyFactionSlotsFromMeta(meta);
    let api = typeof WodMultiplayer !== 'undefined' ? WodMultiplayer.api : null;
    gameData.mp = {
        enabled: true,
        isHost: true,
        localSlot: (api && api.slot) ? api.slot : 1,
        humanSlots: wodMpCollectLayoutHumanSeats(meta),
        factionSlots: factions.slice(),
        seatTypes: st,
        maxLobbySlots: WOD_MP_MAX_PLAYERS,
        eliminatedSlots: []
    };
    gameData.aiCount = st.filter(t => t === 'bot').length;
    gameData.loadedCustomMap = false;
    let previewSeed = wodMpLobbyPreviewSeed(meta);
    gameData._mapGenSeed = previewSeed >>> 0;
    gameData._mapGenSeedBase = previewSeed >>> 0;
    gameData._wodSkipMapGenLoader = true;
    gameData._wodLobbyPreviewGen = true;
    let terrainFp = wodMpLobbyTerrainFingerprint(meta);
    let wantPoliticsOnly = !!(_wodMpCommittedLobbyMap && _wodMpCommittedLobbyMap.data &&
        (_wodMpLobbyPreviewLastTerrainFp === terrainFp || _wodMpCommittedLobbyMap.terrainFp === terrainFp));
    if(wantPoliticsOnly && wodMpPrepareLobbyTerrainForPoliticsRegen(meta)) {
        wodMapGenYieldingStart(4);
        wodPushSeededRandom((previewSeed ^ wodMpPoliticsLayoutSeed(meta)) >>> 0);
        try {
            if(await wodRegeneratePoliticsOnCurrentTerrain() && wodMpLobbyPreviewMapValid(meta, null)) {
                let fp = wodMpLobbyPreviewFingerprint(meta);
                wodMpCommitLobbyPreviewMap(meta, fp);
                _wodMpLobbyPreviewLastFp = fp;
                _wodMpLobbyPreviewLastTerrainFp = terrainFp;
                _wodMpLobbyPreviewLastFactionFp = wodMpLobbyFactionFingerprint(meta);
                wodMpHostPushLobbyPreview(fp);
                return true;
            }
        } finally {
            wodPopRandom();
            wodMapGenYieldingStop();
            gameData._wodSkipMapGenLoader = false;
            gameData._wodLobbyPreviewGen = false;
            gameData._mapGenSeedBase = 0;
        }
    }
    gameData._wodReuseMapGenSeed = true;
    wodMapGenYieldingStart(12);
    wodPushSeededRandom(previewSeed);
    try {
        await generateMap();
    } finally {
        wodPopRandom();
        wodMapGenYieldingStop();
        gameData._wodSkipMapGenLoader = false;
        gameData._wodLobbyPreviewGen = false;
        gameData._mapGenSeedBase = 0;
    }
    if(!wodMpLobbyPreviewMapValid(meta, null)) return false;
    let fp = wodMpLobbyPreviewFingerprint(meta);
    wodMpCommitLobbyPreviewMap(meta, fp);
    _wodMpLobbyPreviewLastFp = fp;
    _wodMpLobbyPreviewLastTerrainFp = wodMpLobbyTerrainFingerprint(meta);
    _wodMpLobbyPreviewLastFactionFp = wodMpLobbyFactionFingerprint(meta);
    wodMpHostPushLobbyPreview(fp);
    return true;
}
function wodMpSyncLaunchSettingsFromMeta(meta) {
    if(!meta || typeof meta !== 'object') return;
    wodMpEnsureDefaultSeatTypes(meta);
    if(meta.mapSize != null) wodApplyMapSizePreset(meta.mapSize);
    if(meta.mapShape) gameData.mapShape = meta.mapShape;
    gameData.citiesPerPlayer = wodMpCitiesPerPlayerFromMeta(meta);
    if(meta.victoryMode) gameData.victoryMode = meta.victoryMode === 'annihilation' ? 'annihilation' : 'domination';
    if(meta.money != null) gameData.money = parseInt(meta.money, 10) || gameData.money;
    if(meta.fogOfWar != null) gameData.fogOfWar = !!meta.fogOfWar;
    if(meta.gamePeriod) {
        gameData._matchPeriod = meta.gamePeriod;
        gameData.gamePeriod = meta.gamePeriod;
        wodApplyPeriodUiLabels();
    }
    wodMpApplyMetaToSetupFields(meta);
}
function wodMpResetTransientMapState() {
    gameData.hexList = [];
    gameData.hexes = {};
    gameData.cities = [];
    gameData.roads = [];
    gameData.entities = [];
    gameData._generalMap = null;
    gameData.forts = [];
    gameData.hospitals = [];
    gameData.bridges = [];
    gameData._wodProcgenBorderFirstApplied = false;
}
async function wodMpFinalizeLaunchMapFromLobby(meta) {
    wodMpNormalizeLobbyMeta(meta);
    let expected = wodMpGetLobbyFactionSlotsFromMeta(meta);
    gameData._wodMpLaunchFactionSlots = expected.slice();
    wodMpSyncLaunchSettingsFromMeta(meta);
    if(gameData.mp && gameData.mp.enabled) {
        gameData.mp.factionSlots = expected.slice();
        let st = meta.seatTypes || gameData.mp.seatTypes || [];
        gameData.mp.seatTypes = st.slice(0, WOD_MP_MAX_PLAYERS);
        gameData.mp.maxLobbySlots = WOD_MP_MAX_PLAYERS;
        gameData.aiCount = st.filter(t => t === 'bot').length;
    }
    if(gameData.mp && gameData.mp.enabled && gameData.mp.isHost) {
        try {
            await wodMpWaitForLobbyPreviewIdle(90000);
        } catch(e) {
            console.warn(e);
        }
        if(!wodMpCommittedIsCurrentForMeta(meta)) {
            let ok = await wodMpHostSyncCommittedPreviewForLaunch(meta);
            if(!ok) throw new Error('Could not build launch map for current lobby seats');
        }
    }
    if(wodMpTryActivateCommittedLobbyMap(meta)) {
        gameData._wodMpLaunchFromCommitted = true;
        try {
            wodMpWireLaunchFromCommittedMap(meta, expected);
        } finally {
            gameData._wodMpLaunchFromCommitted = false;
        }
    } else {
        wodMpResetTransientMapState();
        let mpSeed = wodMpLobbyPreviewSeed(meta);
        gameData._mapGenSeed = mpSeed >>> 0;
        gameData._mapGenSeedBase = mpSeed >>> 0;
        gameData._wodSkipMapGenLoader = true;
        gameData._wodLobbyPreviewGen = true;
        gameData._wodReuseMapGenSeed = true;
        wodMapGenYieldingStart(12);
        wodPushSeededRandom(mpSeed);
        try {
            await generateMap();
        } finally {
            wodPopRandom();
            wodMapGenYieldingStop();
            gameData._wodSkipMapGenLoader = false;
            gameData._wodLobbyPreviewGen = false;
            gameData._mapGenSeedBase = 0;
        }
        wodMarkTerrainFullDirty();
        wodTerrainBakeNextMs = 0;
        normalizeTerrainHexes();
        updateTerrainKey({ skipHelp: true });
    }
    wodMpEnsureMatchStartingUnits(expected);
    let owners = new Set();
    for(let c of gameData.cities || []) {
        if(c && c.owner > 0) owners.add(c.owner);
    }
    if(owners.size === 0) {
        for(let h of gameData.hexList || []) {
            if(h && h.owner > 0) owners.add(h.owner);
        }
    }
    for(let s of expected) {
        if(!owners.has(s))
            throw new Error('Map did not generate all lobby factions (missing seat ' + s + ')');
    }
    gameData._wodMpLaunchFactionSlots = null;
}
function wodMpAbortLobbyPreviewJobs() {
    _wodMpLobbyPreviewBusy = false;
    _wodMpLobbyPreviewQueued = false;
    _wodMpLobbyPreviewGenToken++;
    wodRefreshMapPreviewGeneratingUi();
}
function wodTerrainOnlyFingerprint() {
    return [
        gameData.mapRadius,
        gameData.mapShape || '',
        (gameData._mapGenSeed >>> 0) || 0,
        gameData.loadedCustomMap ? 1 : 0,
        // Continents are sized for their player count: another count needs new terrain.
        gameData.mapShape === 'continents' ? wodGetDesiredFactionCountForMapGen() : ''
    ].join('|');
}
function wodCaptureTerrainPoliticsBase() {
    if(!gameData.hexList || !gameData.hexList.length) return;
    let snap = {};
    for(let h of gameData.hexList) {
        if(!h || h.type === 'urban') continue;
        snap[`${h.q},${h.r}`] = {
            type: h.type,
            baseColor: h.baseColor,
            renderColor: h.renderColor
        };
    }
    gameData._wodTerrainPoliticsBase = snap;
    gameData._wodTerrainPoliticsBridges = (gameData.bridges || []).map(b => JSON.parse(JSON.stringify(b)));
    gameData._wodTerrainPoliticsBaseFp = wodTerrainOnlyFingerprint();
}
function wodCanRegeneratePoliticsOnly() {
    if(gameData.loadedCustomMap) return false;
    if(!gameData._wodTerrainPoliticsBase || !gameData.hexList || !gameData.hexList.length) return false;
    return gameData._wodTerrainPoliticsBaseFp === wodTerrainOnlyFingerprint();
}
function wodRestoreTerrainPoliticsBase() {
    let snap = gameData._wodTerrainPoliticsBase;
    if(!snap || !gameData.hexList) return false;
    for(let h of gameData.hexList) {
        let b = snap[`${h.q},${h.r}`];
        if(b) {
            h.type = b.type;
            h.baseColor = b.baseColor;
            h.renderColor = b.renderColor;
        }
        delete h.cityId;
        delete h.urbanVariant;
        setHexOwner(h, 0);
    }
    gameData.cities = [];
    gameData.roads = [];
    gameData.entities = [];
    gameData._generalMap = null;
    gameData.forts = [];
    gameData.hospitals = [];
    gameData.bridges = (gameData._wodTerrainPoliticsBridges || []).map(b => JSON.parse(JSON.stringify(b)));
    for(let br of gameData.bridges) wodSyncBridgeWorldCoords(br);
    wodRebuildBridgeHexIndex();
    gameData._wodProcgenBorderFirstApplied = false;
    return true;
}
async function wodRegeneratePoliticsOnCurrentTerrain() {
    if(!wodRestoreTerrainPoliticsBase()) return false;
    let mapR = gameData.mapRadius;
    let cols = mapR;
    let rows = Math.floor(mapR * 0.8);
    let mapShape = gameData.mapShape;
    if(!(gameData.mp && gameData.mp.enabled)) wodSyncAiCountForMapGen();
    let factionSlots = Math.max(1, wodGetDesiredFactionCountForMapGen());
    gameData._wodCitySplitAnglePhase = wodDeterministicCitySplitPhase01(((gameData._mapGenSeed || 1) >>> 0) ^ Math.imul(factionSlots | 0, 738560931)) * Math.PI * 2;
    let procOk = await wodProceduralVoronoiBordersThenCitiesSameCount(cols, rows, mapShape);
    if(!procOk) return false;
    gameData._mapGenOptions = { units: true };
    try {
        await assignStartingCities();
    } finally {
        gameData._mapGenOptions = null;
    }
    updateTerrainKey();
    wodMarkTerrainPoliticalDirty();
    wodMarkTerrainFullDirty();
    return true;
}
function wodMpLobbyTerrainFingerprint(meta) {
    if(!meta || typeof meta !== 'object') return '';
    let seed = meta.lobbyMapSeed != null && meta.lobbyMapSeed !== '' ? (parseInt(meta.lobbyMapSeed, 10) >>> 0) : '';
    let parts = [seed, meta.mapSize, meta.mapShape || ''];
    // Continents are sized for their player count: another count needs new terrain.
    if(meta.mapShape === 'continents') parts.push(wodMpGetLobbyFactionSlotsFromMeta(meta).length);
    return parts.join('|');
}
function wodMpLobbyPoliticsFingerprint(meta) {
    return wodMpLobbyFactionFingerprint(meta);
}
function wodMpHostPaintLobbyPreviewFromCommitted(meta) {
    let cm = _wodMpCommittedLobbyMap;
    if(!cm || !cm.data || !wodMpLobbyMapMatchesMeta(meta, cm.data)) return false;
    let snap = wodMpSnapshotLobbyGenBackup();
    try {
        wodMpApplyDeepMapSnapshot(cm.data);
        previewLoadedMap('mpLobbyMapPreview');
        return true;
    } finally {
        wodMpRestoreLobbyGenBackup(snap);
    }
}
function wodMpPoliticsLayoutSeed(meta) {
    let s = wodMpLobbyPoliticsFingerprint(meta);
    let h = 0x811c9dc5;
    for(let i = 0; i < s.length; i++) h = (Math.imul(h ^ s.charCodeAt(i), 0x01000193)) >>> 0;
    return h || 0x9e3779b1;
}
function wodMpLobbyPreviewFingerprint(meta) {
    return wodMpLobbyTerrainFingerprint(meta) + '||' + wodMpLobbyPoliticsFingerprint(meta);
}
function wodMpClearLobbyPreviewDedupeState() {
    wodMpAbortLobbyPreviewJobs();
    _wodMpLobbyPreviewLastFp = '';
    _wodMpLobbyPreviewLastTerrainFp = '';
    _wodMpLobbyPreviewLastFactionFp = '';
    _wodMpGuestLobbyPreviewFp = '';
    _wodMpCommittedLobbyMap = null;
    wodRefreshMapPreviewGeneratingUi();
}
function wodIsMapPreviewGenerating() {
    return !!(gameData._soloPreviewGenerating || _wodMpLobbyPreviewBusy || gameData._mapGenInProgress);
}
function wodSetElementDisabled(el, on) {
    if(!el) return;
    el.disabled = !!on;
    el.toggleAttribute('disabled', !!on);
}
const WOD_SETUP_LOCK_WHILE_GENERATING = [
    'setupMapSize', 'setupMapShape', 'setupCitiesPerPlayer', 'setupAI', 'setupVictoryMode', 'setupFogOfWar', 'setupMoney',
    'setupPlayerColor', 'setupGamePeriod', 'setupBtnGenerateNew', 'setupBtnSaveMap',
    'setupBtnLoadMap', 'setupBtnStartAi', 'setupBtnMpReturn', 'setupBtnBack'
];
function wodCurrentSetupAiCount() {
    let aiEl = document.getElementById('setupAI');
    return Math.max(1, Math.min(WOD_MAX_AI_OPPONENTS, parseInt(aiEl && aiEl.value, 10) || 1));
}
function wodBeginMapGenAiLock() {
    if(gameData.mp && gameData.mp.enabled) return;
    if(gameData._mapGenLockedAiCount == null)
        gameData._mapGenLockedAiCount = wodCurrentSetupAiCount();
    gameData.aiCount = gameData._mapGenLockedAiCount;
}
function wodEndMapGenAiLock() {
    gameData._mapGenLockedAiCount = null;
}
function wodSyncAiCountForMapGen() {
    if(gameData.mp && gameData.mp.enabled) return gameData.aiCount;
    wodBeginMapGenAiLock();
    return gameData.aiCount;
}
function wodApplySetupAiCountFromUi() {
    let n = wodCurrentSetupAiCount();
    if(gameData._mapGenLockedAiCount == null) gameData.aiCount = n;
    if(gameData._soloPreviewSnapshot && gameData._soloPreviewSnapshot.aiCount !== n) {
        gameData._soloPreviewSnapshot = null;
        gameData._soloMapPreviewMatchesStart = false;
    }
    return n;
}
function wodRequestSkirmishPreviewForAiChange() {
    if(wodIsMapPreviewGenerating()) return;
    wodApplySetupAiCountFromUi();
    if(typeof wodSyncSetupOpponentsBrief === 'function') wodSyncSetupOpponentsBrief();
    gameData._wodReuseMapGenSeed = false;
    gameData._lastMapFingerprint = null;
    previewMap({ politicsOnly: true });
}
function wodHideMapGenOverlay() {
    let el = document.getElementById('wodMapGenOverlay');
    if(!el) return;
    el.classList.add('hidden');
    el.setAttribute('aria-busy', 'false');
}
function wodAbandonSoloPreviewForLaunch() {
    gameData._soloPreviewEpoch = (gameData._soloPreviewEpoch || 0) + 1;
    gameData._soloPreviewGenerating = false;
    gameData._mapGenLockedAiCount = null;
    if(typeof wodDisarmMapPreviewSpinner === 'function') wodDisarmMapPreviewSpinner('mapPreview');
    wodHideMapGenOverlay();
    wodRefreshMapPreviewGeneratingUi();
}
async function wodAwaitMapGenIdle() {
    let n = 0;
    while(gameData._mapGenInProgress && n++ < 1200)
        await new Promise(r => setTimeout(r, 50));
}
function wodRefreshMapPreviewGeneratingUi() {
    let setupPanel = document.getElementById('setupPanel');
    let setupOpen = !!(setupPanel && !setupPanel.classList.contains('hidden'));
    let soloOn = !!(setupOpen && (gameData._soloPreviewGenerating || gameData._mapGenInProgress));
    for(let id of WOD_SETUP_LOCK_WHILE_GENERATING)
        wodSetElementDisabled(document.getElementById(id), soloOn);
    let on = !!_wodMpLobbyPreviewBusy;
    for(let id of ['mpBtnGlMap', 'mpBtnGlRules', 'mpBtnGlLaunch',
        'mpCfgMapApply', 'mpCfgMapSaveMap', 'mpCfgMapLoadMap', 'mpCfgMapClose',
        'mpCfgMapSize', 'mpCfgMapShape', 'mpCfgCitiesPerPlayer', 'mpCfgVictoryMode', 'mpCfgFogOfWar', 'mpCfgMoney', 'mpCfgPlayerColor', 'mpCfgGamePeriod',
        'mpCfgRulesApply', 'mpCfgRulesClose']) {
        wodSetElementDisabled(document.getElementById(id), on);
    }
    let slotsEl = document.getElementById('mpGlSlots');
    if(slotsEl) slotsEl.querySelectorAll('select, button').forEach(el => wodSetElementDisabled(el, on));
}
function wodMpRefreshLobbyMapPreviewAfterMetaChange(meta, opts) {
    opts = opts || {};
    meta = meta || window.wodMpRoomMeta;
    if(!meta || !wodMpIsLobbyPreviewHost()) return;
    if(opts.repaintOnly) {
        if(!wodMpTryPaintLobbyPreviewCanvas(meta))
            wodMpRefreshLobbyMapPreview({ politicsOnly: true });
        return;
    }
    if(!opts.force && wodMpTryPaintLobbyPreviewCanvas(meta)) {
        let terrainFp = wodMpLobbyTerrainFingerprint(meta);
        let factionFp = wodMpLobbyFactionFingerprint(meta);
        _wodMpLobbyPreviewLastFp = terrainFp + '||' + factionFp;
        _wodMpLobbyPreviewLastTerrainFp = terrainFp;
        _wodMpLobbyPreviewLastFactionFp = factionFp;
        return;
    }
    wodMpRefreshLobbyMapPreview(opts);
}
function wodMpRefreshLobbyMapPreview(opts) {
    opts = opts || {};
    let meta = window.wodMpRoomMeta;
    if(!meta || typeof meta !== 'object' || gameState === 'PLAYING') return;
    if(!wodMpIsLobbyPreviewHost()) {
        wodMpRenderGuestLobbyPreviewPlaceholder();
        return;
    }
    let terrainFp = wodMpLobbyTerrainFingerprint(meta);
    let factionFp = wodMpLobbyFactionFingerprint(meta);
    let fp = terrainFp + '||' + factionFp;
    if(opts.appearanceOnly) {
        if(wodMpTryPaintLobbyPreviewCanvas(meta)) {
            let terrainFp = wodMpLobbyTerrainFingerprint(meta);
            let factionFp = wodMpLobbyFactionFingerprint(meta);
            _wodMpLobbyPreviewLastFp = terrainFp + '||' + factionFp;
            _wodMpLobbyPreviewLastTerrainFp = terrainFp;
            _wodMpLobbyPreviewLastFactionFp = factionFp;
            wodMpCommitLobbyPreviewMap(meta, terrainFp + '||' + factionFp);
            wodMpHostPushLobbyPreview(terrainFp + '||' + factionFp);
        } else {
            wodMpRefreshLobbyMapPreview({
                politicsOnly: !!(_wodMpLobbyPreviewLastTerrainFp && _wodMpLobbyPreviewLastTerrainFp === wodMpLobbyTerrainFingerprint(meta))
            });
        }
        return;
    }
    if(!opts.force && fp === _wodMpLobbyPreviewLastFp && !_wodMpLobbyPreviewBusy && !_wodMpLobbyPreviewQueued) return;
    if(!opts.force && wodMpHostPaintLobbyPreviewFromCommitted(meta)) {
        _wodMpLobbyPreviewLastFp = fp;
        _wodMpLobbyPreviewLastTerrainFp = terrainFp;
        _wodMpLobbyPreviewLastFactionFp = factionFp;
        return;
    }
    if(_wodMpLobbyPreviewBusy) {
        _wodMpLobbyPreviewQueued = true;
        return;
    }
    let wantPoliticsOnly = !!(opts.politicsOnly || (_wodMpLobbyPreviewLastTerrainFp && terrainFp === _wodMpLobbyPreviewLastTerrainFp));
    let politicsOnly = wantPoliticsOnly && wodMpCanUsePoliticsOnlyForMeta(meta);
    _wodMpLobbyPreviewBusy = true;
    _wodMpLobbyPreviewQueued = false;
    wodRefreshMapPreviewGeneratingUi();
    let shapeEl = document.getElementById('setupMapShape');
    let snap = wodMpSnapshotLobbyGenBackup();
    wodArmMapPreviewSpinner('mpLobbyMapPreview');
    let previewTok = ++_wodMpLobbyPreviewGenToken;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            (async function() {
                try {
                    if(previewTok !== _wodMpLobbyPreviewGenToken || gameState === 'PLAYING') return;
                    wodApplyMapSizePreset(parseInt(meta.mapSize, 10) || 60);
                    if(shapeEl) shapeEl.value = meta.mapShape || 'island';
                    // The generator reads towns per player from the setup control.
                    let citiesEl = document.getElementById('setupCitiesPerPlayer');
                    if(citiesEl) citiesEl.value = String(wodMpCitiesPerPlayerFromMeta(meta));
                    gameData.loadedCustomMap = false;
                    wodMpNormalizeLobbyMeta(meta);
                    let st = meta.seatTypes || [];
                    let hs = [];
                    let factions = [];
                    for(let s = 1; s <= WOD_MP_MAX_PLAYERS; s++) {
                        let t = st[s - 1] || 'human';
                        if(t === 'human') hs.push(s);
                        if(t !== 'closed') factions.push(s);
                    }
                    gameData.mp = {
                        enabled: true,
                        isHost: true,
                        localSlot: (typeof WodMultiplayer !== 'undefined' && WodMultiplayer.api && WodMultiplayer.api.slot) ? WodMultiplayer.api.slot : 1,
                        humanSlots: hs,
                        factionSlots: factions.length ? factions : [1],
                        seatTypes: st,
                        maxLobbySlots: WOD_MP_MAX_PLAYERS,
                        eliminatedSlots: []
                    };
                    gameData.aiCount = st.filter(t => t === 'bot').length;
                    let previewSeed = wodMpLobbyPreviewSeed(meta);
                    gameData._mapGenSeed = previewSeed >>> 0;
                    gameData._mapGenSeedBase = previewSeed >>> 0;
                    gameData._wodLobbyPreviewGen = true;
                    gameData._wodSkipMapGenLoader = true;
                    wodMapGenYieldingStart(politicsOnly ? 4 : 8);
                    let genOk = false;
                    try {
                        if(politicsOnly) {
                            if(!wodMpPrepareLobbyTerrainForPoliticsRegen(meta)) politicsOnly = false;
                        }
                        if(politicsOnly) {
                            wodPushSeededRandom((previewSeed ^ wodMpPoliticsLayoutSeed(meta)) >>> 0);
                            try {
                                genOk = await wodRegeneratePoliticsOnCurrentTerrain();
                                if(!genOk) politicsOnly = false;
                            } finally {
                                wodPopRandom();
                            }
                        }
                        if(!politicsOnly) {
                            gameData._wodReuseMapGenSeed = true;
                            wodPushSeededRandom(previewSeed);
                            try {
                                await generateMap();
                                genOk = wodMpLobbyPreviewMapValid(meta, null);
                            } finally {
                                wodPopRandom();
                            }
                            if(genOk) _wodMpLobbyPreviewLastTerrainFp = terrainFp;
                        } else {
                            genOk = wodMpLobbyPreviewMapValid(meta, null);
                        }
                    } finally {
                        wodMapGenYieldingStop();
                        gameData._wodSkipMapGenLoader = false;
                        gameData._wodLobbyPreviewGen = false;
                        gameData._mapGenSeedBase = 0;
                    }
                    if(previewTok !== _wodMpLobbyPreviewGenToken || gameState === 'PLAYING') return;
                    if(!genOk) throw new Error('Lobby preview map invalid');
                    wodMpCommitLobbyPreviewMap(meta, fp);
                    _wodMpLobbyPreviewLastFp = fp;
                    _wodMpLobbyPreviewLastFactionFp = factionFp;
                    wodMpHostPushLobbyPreview(fp);
                } catch(err) {
                    console.warn('Lobby preview', err);
                    _wodMpCommittedLobbyMap = null;
                } finally {
                    if(previewTok !== _wodMpLobbyPreviewGenToken) return;
                    if(gameState !== 'PLAYING') {
                        wodMpRestoreLobbyGenBackup(snap);
                        let msRestore = document.getElementById('setupMapSize');
                        if(msRestore && meta.mapSize != null) msRestore.value = String(meta.mapSize);
                        if(shapeEl && meta.mapShape) shapeEl.value = meta.mapShape;
                        wodMpTryPaintLobbyPreviewCanvas(meta);
                    }
                    wodDisarmMapPreviewSpinner('mpLobbyMapPreview');
                    _wodMpLobbyPreviewBusy = false;
                    wodRefreshMapPreviewGeneratingUi();
                    if(gameState !== 'PLAYING' && _wodMpLobbyPreviewQueued) {
                        _wodMpLobbyPreviewQueued = false;
                        requestAnimationFrame(() => wodMpRefreshLobbyMapPreview({ force: true }));
                    } else {
                        _wodMpLobbyPreviewQueued = false;
                    }
                }
            })();
        });
    });
}
function wodMpApplyMetaToSetupFields(meta) {
    if(!meta) return;
    let ms = document.getElementById('setupMapSize');
    if(ms && meta.mapSize != null) ms.value = String(meta.mapSize);
    let sh = document.getElementById('setupMapShape');
    if(sh && meta.mapShape) sh.value = meta.mapShape;
    let cpp = document.getElementById('setupCitiesPerPlayer');
    if(cpp) cpp.value = String(wodMpCitiesPerPlayerFromMeta(meta));
    let ai = document.getElementById('setupAI');
    if(ai && meta.aiCount != null) {
        let bc = Math.max(0, Math.min(WOD_MAX_AI_OPPONENTS, parseInt(meta.aiCount, 10) || 0));
        ai.value = String(bc > 0 ? bc : 1);
    }
    let vic = document.getElementById('setupVictoryMode');
    if(vic && meta.victoryMode) vic.value = meta.victoryMode === 'annihilation' ? 'annihilation' : 'domination';
    let mon = document.getElementById('setupMoney');
    if(mon && meta.money != null) mon.value = String(meta.money);
}
function wodMpApplyLaunchColorsFromHumans(meta, humanSlots) {
    let used = new Set();
    let mc = (meta && meta.playerColors) || {};
    for(let s of humanSlots) {
        let hex = mc[String(s)] || factionColors[s];
        if(hex && /^#[0-9A-Fa-f]{6}$/.test(hex)) factionColors[s] = hex;
        used.add(String(factionColors[s]).toLowerCase());
    }
    for(let i = 1; i < factionColors.length; i++) {
        if(humanSlots.indexOf(i) >= 0) continue;
        let cur = factionColors[i] || '';
        if(!cur || used.has(String(cur).toLowerCase())) {
            let found = null;
            for(let k = 0; k < 48; k++) {
                let hue = (i * 111 + k * 53) % 360;
                let hex = hslToHex(hue, 64, 46);
                if(!used.has(hex.toLowerCase())) { found = hex; break; }
            }
            factionColors[i] = found || '#888888';
            used.add(String(factionColors[i]).toLowerCase());
        } else used.add(String(cur).toLowerCase());
    }
}
function wodMpPushLobbyMetaFromCurrentUi() {
    if(typeof WodMultiplayer === 'undefined' || !WodMultiplayer.sendLobbyMeta) return;
    WodMultiplayer.sendLobbyMeta(wodMpBuildLobbyMetaFromSetup());
}
function wodMpValidateLaunchReady(meta) {
    if(!meta || typeof meta !== 'object') return false;
    wodMpNormalizeLobbyMeta(meta);
    let st = meta.seatTypes || [];
    let occ = new Set(Array.isArray(meta.occupiedSlots) ? meta.occupiedSlots : []);
    for(let s = 1; s <= WOD_MP_MAX_PLAYERS; s++) {
        if((st[s - 1] || 'human') === 'human' && !occ.has(s)) {
            showNotification('Fill every open human seat, or change it to AI or Closed.');
            return false;
        }
    }
    let factions = 0;
    for(let s = 1; s <= WOD_MP_MAX_PLAYERS; s++) {
        if((st[s - 1] || 'human') !== 'closed') factions++;
    }
    if(factions < 2) {
        showNotification('Need at least two active seats (human or AI) to launch.');
        return false;
    }
    let humanSeats = 0;
    for(let i = 0; i < WOD_MP_MAX_PLAYERS; i++) {
        if((st[i] || 'human') === 'human') humanSeats++;
    }
    if(humanSeats < 1) {
        showNotification('Keep at least one Human seat in the lobby.');
        return false;
    }
    let humanNeed = 0;
    for(let s = 1; s <= WOD_MP_MAX_PLAYERS; s++) {
        if((st[s - 1] || 'human') === 'human') humanNeed++;
    }
    if(occ.size < humanNeed) {
        showNotification('Every human seat must have a connected player before launch.');
        return false;
    }
    if(typeof WodMultiplayer !== 'undefined' && WodMultiplayer.api && WodMultiplayer.api.isHost) {
        if(wodIsMapPreviewGenerating()) {
            showNotification('Wait for the lobby map preview to finish generating.');
            return false;
        }
        if(!wodMpCommittedIsCurrentForMeta(meta)) {
            showNotification('Lobby map is not ready — wait for preview or regenerate.');
            return false;
        }
    }
    return true;
}
function wodMpRenderGameLobbyScreen() {
    let api = typeof WodMultiplayer !== 'undefined' ? WodMultiplayer.api : {};
    let meta = window.wodMpRoomMeta || {};
    wodMpNormalizeLobbyMeta(meta);
    wodMpSyncLayoutCountFieldsFromMeta(meta);
    let st = meta.seatTypes || [];
    let occ = new Set(Array.isArray(meta.occupiedSlots) ? meta.occupiedSlots : []);
    let activeFactions = 0;
    for(let i = 0; i < WOD_MP_MAX_PLAYERS; i++) {
        if((st[i] || 'human') !== 'closed') activeFactions++;
    }
    let capEl = document.getElementById('mpGlSeatCapLabel');
    if(capEl) capEl.textContent = '(active factions: ' + activeFactions + ')';
    let sub = document.getElementById('mpGlSub');
    if(sub) {
        let code = api.code ? 'Code: ' + api.code : '';
        let myNm = wodMpEscapeHtml(wodMpDisplayNameForSlot(api.slot | 0, { meta }));
        sub.innerHTML = wodMpEscapeHtml(api.lobbyName || 'Lobby') + (code ? ' · ' + wodMpEscapeHtml(code) : '') +
            ' · <strong>' + myNm + '</strong> (seat ' + (api.slot | 0) + ') · Humans connected: <strong>' + (wodMpLobbyCount | 0) + '</strong>';
    }
    let readout = document.getElementById('mpGlSettingsReadout');
    if(readout) {
        let msL = meta.mapSizeLabel;
        if(!msL && meta.mapSize) msL = meta.mapSize === 40 ? 'Small' : (meta.mapSize === 80 ? 'Large' : 'Medium');
        let shL = meta.mapShapeLabel;
        if(!shL && meta.mapShape) shL = wodMapShapeLabelForMeta(meta.mapShape);
        let botN = 0;
        for(let i = 0; i < WOD_MP_MAX_PLAYERS; i++) {
            if(st[i] === 'bot') botN++;
        }
        readout.innerHTML =
            '<strong>Map</strong> ' + wodMpEscapeHtml(msL || '—') + ' · ' + wodMpEscapeHtml(shL || '') +
            '<br><strong>Cities per player</strong> ' + wodMpCitiesPerPlayerFromMeta(meta) +
            '<br><strong>AI seats</strong> ' + botN +
            '<br><strong>Victory</strong> ' + wodMpEscapeHtml(meta.victoryLabel || '') +
            '<br><strong>Fog of war</strong> ' + (meta.fogOfWar ? 'On' : 'Off') +
            '<br><strong>Starting $</strong> $' + (meta.money != null ? (meta.money | 0) : '—') +
            '<br><strong>Time period</strong> ' + wodMpEscapeHtml(meta.gamePeriodLabel || meta.gamePeriod || 'Modern');
    }
    let hostAct = document.getElementById('mpGlHostActions');
    let guestW = document.getElementById('mpGlGuestWait');
    if(api.isHost) {
        if(hostAct) hostAct.classList.add('visible');
        if(guestW) guestW.style.display = 'none';
    } else {
        if(hostAct) hostAct.classList.remove('visible');
        if(guestW) guestW.style.display = '';
    }

    let slotsEl = document.getElementById('mpGlSlots');
    if(slotsEl) {
        let pc = meta.playerColors || {};
        let html = '';
        for(let s = 1; s <= WOD_MP_MAX_PLAYERS; s++) {
            let seatT = (st[s - 1] || 'human');
            let isOcc = occ.has(s);
            let rowClass = 'mp-gl-slot';
            let status = '';
            if(seatT === 'closed') status = '<em>Closed</em> — not playing';
            else if(seatT === 'bot') status = '<strong>AI</strong> occupies this seat';
            else if(isOcc) {
                let nm = wodMpEscapeHtml(wodMpDisplayNameForSlot(s, { meta }));
                status = '<strong>' + nm + '</strong> (human)';
            }
            else if(api.isHost && seatT === 'human') {
                rowClass += ' mp-gl-slot--invite';
                status = '<strong>Open seat</strong> — tap Invite friend';
            }
            else status = 'Open human seat — waiting for join';

            let typeCell = '';
            if(api.isHost) {
                let selH = seatT === 'human' ? ' selected' : '';
                let selB = seatT === 'bot' ? ' selected' : '';
                let selC = seatT === 'closed' ? ' selected' : '';
                typeCell = '<select class="mp-gl-seat-type" data-slot="' + s + '" style="flex:0 0 auto;max-width:120px;font-size:12px">' +
                    '<option value="human"' + selH + '>Human</option>' +
                    '<option value="bot"' + selB + '>AI bot</option>' +
                    '<option value="closed"' + selC + '>Closed</option></select>';
            } else {
                typeCell = '<span style="font-size:12px;opacity:0.85">' + (seatT === 'bot' ? 'AI' : (seatT === 'closed' ? 'Closed' : 'Human')) + '</span>';
            }

            let myHex = pc[String(s)] || factionColors[s] || '#999999';
            let colorCell = '';
            if(seatT === 'closed') {
                colorCell = '<span style="opacity:0.55;font-size:12px">—</span>';
            } else {
                let canPickColor = api.isHost || (isOcc && s === api.slot);
                colorCell = wodMpBuildColorPickerHtml(s, meta, WOD_MP_MAX_PLAYERS, myHex, canPickColor);
            }

            let kickCell = '';
            if(api.isHost && isOcc && seatT === 'human' && s !== api.slot) {
                kickCell = '<button type="button" class="build-btn mp-gl-kick" data-slot="' + s + '" style="font-size:11px;padding:4px 8px">Kick</button>';
            } else if(api.isHost && seatT === 'human' && !isOcc) {
                kickCell = '<button type="button" class="build-btn mp-gl-invite" data-slot="' + s + '" style="font-size:11px;padding:4px 8px">Invite friend</button>';
            } else kickCell = '<span style="width:48px"></span>';

            let profileCell = '';
            if(seatT !== 'closed')
                profileCell = '<button type="button" class="build-btn mp-gl-profile" data-slot="' + s + '" style="font-size:11px;padding:4px 8px">Profile</button>';

            html += '<div class="' + rowClass + '" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06)">' +
                '<span class="mp-gl-slot-num" style="min-width:1.2em">' + s + '</span>' +
                '<div style="flex:1;min-width:140px">' + status + '</div>' +
                typeCell + colorCell + profileCell + kickCell + '</div>';
        }
        slotsEl.innerHTML = html;
        slotsEl.querySelectorAll('.mp-gl-seat-type').forEach(sel => {
            sel.onchange = () => {
                let slot = parseInt(sel.getAttribute('data-slot'), 10);
                let v = sel.value;
                wodMpNormalizeLobbyMeta(window.wodMpRoomMeta);
                let prevFactionFp = wodMpLobbyFactionFingerprint(window.wodMpRoomMeta);
                if(slot >= 1 && slot <= WOD_MP_MAX_PLAYERS) {
                    window.wodMpRoomMeta.seatTypes[slot - 1] = v;
                }
                wodMpPushLobbyMetaFromCurrentUi();
                let nextFactionFp = wodMpLobbyFactionFingerprint(window.wodMpRoomMeta);
                if(prevFactionFp === nextFactionFp) {
                    requestAnimationFrame(() => wodMpRefreshLobbyMapPreviewAfterMetaChange(window.wodMpRoomMeta, { repaintOnly: true }));
                } else {
                    requestAnimationFrame(() => wodMpRefreshLobbyMapPreviewAfterMetaChange(window.wodMpRoomMeta, {
                        politicsOnly: _wodMpLobbyPreviewLastTerrainFp === wodMpLobbyTerrainFingerprint(window.wodMpRoomMeta)
                    }));
                }
            };
        });
        wodMpWireLobbyColorPickers(slotsEl);
        slotsEl.querySelectorAll('.mp-gl-kick').forEach(btn => {
            btn.onclick = () => {
                let slot = parseInt(btn.getAttribute('data-slot'), 10);
                if(typeof WodMultiplayer !== 'undefined' && WodMultiplayer.kickPlayer)
                    WodMultiplayer.kickPlayer(slot);
            };
        });
        slotsEl.querySelectorAll('.mp-gl-profile').forEach(btn => {
            btn.onclick = () => wodMpOpenPlayerProfileDlg(parseInt(btn.getAttribute('data-slot'), 10));
        });
        slotsEl.querySelectorAll('.mp-gl-invite').forEach(btn => {
            btn.onclick = () => wodMpOpenSeatInviteDlg(parseInt(btn.getAttribute('data-slot'), 10));
        });
    }
    if(api.isHost) wodMpQueryFriendPresence();
    else wodMpRenderGuestLobbyPreviewPlaceholder();
    let h2 = document.getElementById('mpGlHeading');
    if(h2) h2.textContent = api.isHost ? 'Game lobby (host)' : 'Game lobby';
    if(api.isHost && gameState !== 'PLAYING' && !_wodMpLobbyPreviewBusy) {
        requestAnimationFrame(() => {
            if(wodMpCommittedIsCurrentForMeta(meta)) {
                wodMpTryPaintLobbyPreviewCanvas(meta);
            } else if(!_wodMpCommittedLobbyMap || !_wodMpCommittedLobbyMap.data) {
                wodMpRefreshLobbyMapPreview({ force: true });
            } else {
                wodMpRefreshLobbyMapPreviewAfterMetaChange(meta, {
                    politicsOnly: _wodMpLobbyPreviewLastTerrainFp === wodMpLobbyTerrainFingerprint(meta)
                });
            }
        });
    }
    wodRefreshMapPreviewGeneratingUi();
}
function wodMpBuildLobbyMetaFromSetup() {
    if(!window.wodMpRoomMeta || typeof window.wodMpRoomMeta !== 'object') window.wodMpRoomMeta = {};
    let mapSizeEl = document.getElementById('mpCfgMapSize');
    let shapeEl = document.getElementById('mpCfgMapShape');
    let vic = document.getElementById('mpCfgVictoryMode');
    let moneyEl = document.getElementById('mpCfgMoney');
    let msLab = mapSizeEl && mapSizeEl.options[mapSizeEl.selectedIndex];
    let shLab = shapeEl && shapeEl.options[shapeEl.selectedIndex];
    let vLab = vic && vic.options[vic.selectedIndex];
    let mapSize = mapSizeEl ? (parseInt(mapSizeEl.value, 10) || 60) : 60;
    let mapShape = shapeEl ? shapeEl.value : 'island';
    let citiesEl = document.getElementById('mpCfgCitiesPerPlayer');
    let citiesPerPlayer = wodMpCitiesPerPlayerFromMeta({ citiesPerPlayer: citiesEl ? citiesEl.value : 2 });
    wodMpNormalizeLobbyMeta(window.wodMpRoomMeta);
    let st = window.wodMpRoomMeta.seatTypes || [];
    if(window.wodMpRoomMeta.lobbyMapSeed == null || window.wodMpRoomMeta.lobbyMapSeed === '')
        window.wodMpRoomMeta.lobbyMapSeed = ((Math.random() * 0xfffffffe) | 0) >>> 0;
    if(!window.wodMpRoomMeta.lobbyMapSeed) window.wodMpRoomMeta.lobbyMapSeed = 0x5bd1e995;
    let botCount = 0;
    for(let i = 0; i < WOD_MP_MAX_PLAYERS; i++) {
        if(st[i] === 'bot') botCount++;
    }
    return {
        mapSize,
        mapShape,
        citiesPerPlayer,
        aiCount: botCount,
        seatTypes: st,
        lobbyMapSeed: window.wodMpRoomMeta.lobbyMapSeed >>> 0,
        victoryMode: vic && vic.value === 'annihilation' ? 'annihilation' : 'domination',
        fogOfWar: !!((document.getElementById('mpCfgFogOfWar') || document.getElementById('setupFogOfWar') || {}).checked),
        money: moneyEl ? (parseInt(moneyEl.value, 10) || 10000) : 10000,
        maxHumans: WOD_MP_MAX_PLAYERS,
        mapSizeLabel: msLab ? msLab.text : '',
        mapShapeLabel: shLab ? shLab.text : '',
        victoryLabel: vLab ? vLab.text : '',
        gamePeriod: (document.getElementById('mpCfgGamePeriod') || {}).value || gameData.gamePeriod || 'modern',
        gamePeriodLabel: wodPeriodLabel((document.getElementById('mpCfgGamePeriod') || {}).value || gameData.gamePeriod || 'modern')
    };
}
function wodMpFinishSetupFromHost() {
    previewMap();
    wodMpSyncHostCfgFromSetup();
    if(typeof WodMultiplayer !== 'undefined' && WodMultiplayer.sendLobbyMeta)
        WodMultiplayer.sendLobbyMeta(wodMpBuildLobbyMetaFromSetup());
    showPanel('multiplayer');
    requestAnimationFrame(() => wodMpRefreshLobbyMapPreview({ force: true }));
}
function wodMpUpdateOnline(n) {
    let el = document.getElementById('mpOnlineCount');
    if(el) el.textContent = (n != null && n >= 0) ? String(n) : '—';
}
function wodMpMergeFriendEntries(localArr, remoteArr) {
    let out = [];
    let seen = new Set();
    for(let arr of [remoteArr, localArr]) {
        if(!Array.isArray(arr)) continue;
        for(let r of arr) {
            if(!r || !r.playerId || seen.has(r.playerId)) continue;
            seen.add(r.playerId);
            out.push(Object.assign({}, r));
        }
    }
    return out;
}
function wodMpRenderLobbyList(lobbies) {
    let el = document.getElementById('mpLobbyList');
    if(!el) return;
    wodEnsurePlayerId();
    let myLobbyId = (typeof WodMultiplayer !== 'undefined' && WodMultiplayer.api.code) ? WodMultiplayer.api.code : '';
    let myPlayerId = (wodProgress && wodProgress.profile && wodProgress.profile.playerId) ? wodProgress.profile.playerId : '';
    if(!lobbies || lobbies.length === 0) {
        el.innerHTML = '<p class="mp-hub-pane-lead" style="margin:12px">No open lobbies. Switch to the Host tab to create one, or check back for ongoing matches to rejoin.</p>';
        return;
    }
    el.innerHTML = lobbies.map(l => {
        let meta = l.meta || {};
        let inProgress = !!(l.inProgress || l.matchInProgress || meta.matchInProgress);
        let detail = [meta.mapSizeLabel, meta.mapShapeLabel, meta.aiCount != null ? (meta.aiCount + ' AI') : '', meta.victoryLabel, meta.fogOfWar ? 'Fog' : '']
            .filter(Boolean).join(' · ');
        if(!detail) detail = inProgress ? 'Match in progress' : 'Host still configuring map';
        let name = wodMpEscapeHtml(l.name || 'Game');
        let selfNm = (wodProgress && wodProgress.profile && wodProgress.profile.mpDisplayName) ? String(wodProgress.profile.mpDisplayName).trim() : '';
        let canRejoin = inProgress && myPlayerId && Array.isArray(l.rejoinPlayerIds) && l.rejoinPlayerIds.indexOf(myPlayerId) >= 0;
        let rowClass = 'mp-lobby-row' + (inProgress ? ' mp-lobby-row--match' : '') + (inProgress && (l.players | 0) === 0 ? ' mp-lobby-row--waiting' : '');
        let status = '';
        if(inProgress) {
            if((l.players | 0) > 0) status = '<div class="mp-lobby-status">Match in progress · ' + (l.players | 0) + ' connected</div>';
            else status = '<div class="mp-lobby-status">Waiting for players to rejoin</div>';
        }
        let joinPart = '';
        if(canRejoin && myLobbyId !== l.id)
            joinPart = '<button type="button" class="build-btn mp-rejoin-btn" data-id="' + wodMpEscapeHtml(l.id) + '" data-locked="' + (l.locked ? '1' : '0') + '">Rejoin</button>';
        else if(myLobbyId === l.id)
            joinPart = '<span style="font-size:12px;opacity:0.85">' + (selfNm ? (wodMpEscapeHtml(selfNm) + ' — you\'re in this lobby') : 'You\'re in this lobby') + '</span>';
        else if(!inProgress)
            joinPart = '<button type="button" class="build-btn mp-join-btn" data-id="' + wodMpEscapeHtml(l.id) + '" data-locked="' + (l.locked ? '1' : '0') + '">Join</button>';
        else
            joinPart = '<span style="font-size:12px;opacity:0.65">In progress</span>';
        return '<div class="' + rowClass + '">' +
            '<div style="min-width:0;flex:1">' +
            '<div style="font-weight:700">' + name + (l.locked ? ' <span title="Password required">🔒</span>' : '') + '</div>' +
            '<div style="font-size:12px;opacity:0.85">' + wodMpEscapeHtml(detail) + '</div>' +
            status +
            '<div style="font-size:12px;opacity:0.75">' + (inProgress
                ? ((l.disconnectedCount | 0) + ' disconnected · ' + (l.players | 0) + ' online')
                : ((l.players | 0) + ' / ' + (l.max || WOD_MP_MAX_PLAYERS) + ' players')) + '</div>' +
            '</div>' + joinPart + '</div>';
    }).join('');
    el.querySelectorAll('.mp-join-btn, .mp-rejoin-btn').forEach(btn => {
        btn.onclick = () => wodMpJoinLobbyFromList(btn.getAttribute('data-id'), btn.getAttribute('data-locked') === '1', {
            rejoin: btn.classList.contains('mp-rejoin-btn')
        });
    });
}
async function wodMpJoinWithPassword(id,locked,opts={}) {
    let password='',ask=!!locked,error='';
    for(let attempt=0;attempt<5;attempt++) {
        if(ask) {
            const value=await wodShowNameInputDialog({title:'Private game',label:'Lobby password',hint:error||'Enter the password set by the host.',confirmLabel:'Join game',inputType:'password',maxLength:80,requireNonEmpty:'Enter the lobby password.'});
            if(value==null)throw Object.assign(new Error('Joining canceled.'),{code:'join_cancelled'});
            password=value;
        }
        try {return await WodMultiplayer.joinLobby(id,password,opts);}
        catch(e){if(!['password_required','wrong_password'].includes(e.code)&&!/wrong password|password required/i.test(e.message||''))throw e;ask=true;error='That password did not match. Try again.';}
    }
    throw new Error('Too many password attempts. Try joining again.');
}
async function wodMpJoinLobbyFromList(id, locked, opts) {
    opts = opts || {};
    let st = document.getElementById('mpStatus');
    if(!wodMpRequireRegisteredDisplayName(opts.rejoin ? 'rejoining a match' : 'joining a lobby')) return;
    await wodMpEnsureConnected();
    if(typeof WodMultiplayer === 'undefined' || !WodMultiplayer.api.socketOpen) {
        if(st) st.textContent = 'Could not reach multiplayer server.';
        return;
    }
    if(WodMultiplayer.api.code && WodMultiplayer.api.code !== id && gameState !== 'PLAYING') {
        showNotification('Leave your current lobby first, then join another.');
        return;
    }
    if(WodMultiplayer.api.code === id && !opts.rejoin) return;
    try {
        if(st) st.textContent = opts.rejoin ? 'Rejoining match…' : 'Joining…';
        wodEnsurePlayerId();
        await wodMpJoinWithPassword(id,locked,{playerId:wodProgress.profile.playerId||''});
        wodMpLobbyCount = Math.max(wodMpLobbyCount, WodMultiplayer.api.slot | 0, 1);
        if(opts.rejoin || (window._wodMpSession && window._wodMpSession.inMatch))
            if(st) st.textContent = 'Rejoining match…';
        else if(st) st.textContent = 'Joined — waiting for host to launch.';
        wodMpRefreshMpPanelState();
        wodMpRenderLobbyList(WodMultiplayer.api.lobbies);
    } catch(e) {
        let m = e && e.message ? String(e.message) : (opts.rejoin ? 'Rejoin failed' : 'Join failed');
        if(st) st.textContent = m;
        showNotification(m);
    }
}
function wodMpRefreshMpPanelState() {
    let api = typeof WodMultiplayer !== 'undefined' ? WodMultiplayer.api : {};
    let inLobby = !!(api.code);
    let browsePh = document.getElementById('mpLobbyBrowsePhase');
    let gameL = document.getElementById('mpGameLobbyScreen');
    let mpHostCreate = document.getElementById('mpBtnHostCreate');
    wodMpUpdateOnline(api.online);
    if(inLobby) {
        if(browsePh) browsePh.classList.add('hidden');
        if(gameL) gameL.classList.remove('hidden');
        if(mpHostCreate) mpHostCreate.disabled = true;
        wodMpRenderGameLobbyScreen();
    } else {
        if(browsePh) browsePh.classList.remove('hidden');
        if(gameL) gameL.classList.add('hidden');
        if(mpHostCreate) mpHostCreate.disabled = !api.socketOpen;
    }
    let btnDisc = document.getElementById('mpBtnDisconnect');
    if(btnDisc) btnDisc.style.display = api.socketOpen ? '' : 'none';
}
function wodMpCopyFieldToField(srcId, dstId) {
    let s = document.getElementById(srcId), d = document.getElementById(dstId);
    if(!s || !d) return;
    if(s.type === 'checkbox' || d.type === 'checkbox') d.checked = !!s.checked;
    else d.value = s.value;
}
function wodMpSyncMpCfgVictoryDetail() {
    let sel = document.getElementById('mpCfgVictoryMode');
    let span = document.getElementById('mpCfgVictoryDetail');
    if(!sel || !span) return;
    let mode = sel.value === 'annihilation' ? 'annihilation' : 'domination';
    span.textContent = WOD_VICTORY_MODE_DETAIL_TEXT[mode] || '';
}
function wodMpOpenHostMapDlg() {
    if(wodIsMapPreviewGenerating()) return;
    let d = document.getElementById('mpHostMapDlg');
    if(d) { d.classList.remove('hidden'); d.setAttribute('aria-hidden', 'false'); }
    wodRefreshMapPreviewGeneratingUi();
}
function wodMpCloseHostMapDlg() {
    let d = document.getElementById('mpHostMapDlg');
    if(d) { d.classList.add('hidden'); d.setAttribute('aria-hidden', 'true'); }
}
function wodMpOpenHostRulesDlg() {
    if(wodIsMapPreviewGenerating()) return;
    wodMpSyncMpCfgVictoryDetail();
    let d = document.getElementById('mpHostRulesDlg');
    if(d) { d.classList.remove('hidden'); d.setAttribute('aria-hidden', 'false'); }
    wodRefreshMapPreviewGeneratingUi();
}
function wodMpCloseHostRulesDlg() {
    let d = document.getElementById('mpHostRulesDlg');
    if(d) { d.classList.add('hidden'); d.setAttribute('aria-hidden', 'true'); }
}
let _wodMpConnecting = null;
function wodMpInitGlobalHandlers() {
    if(window._wodMpGlobalHandlers) return;
    window._wodMpGlobalHandlers = true;
    addEventListener('wod-mp-FriendInvite', (ev) => {
        if(ev.detail) wodMpShowFriendInviteDlg(ev.detail);
    });
    addEventListener('wod-mp-FriendRequest', (ev) => {
        if(ev.detail) wodMpShowFriendRequestDlg(ev.detail);
    });
    addEventListener('wod-mp-FriendRequestReply', (ev) => {
        if(ev.detail) wodMpHandleFriendRequestReply(ev.detail);
    });
    addEventListener('wod-mp-FriendRemoved', (ev) => {
        if(ev.detail) wodMpHandleFriendRemoved(ev.detail);
    });
    addEventListener('wod-mp-FriendInviteSent', () => {
        showNotification('Invite delivered to friend.');
    });
    addEventListener('wod-mp-Leaderboard', (ev) => {
        let d = ev.detail || {};
        let scope = window._wodMpLbScope || d.scope || 'global';
        wodMpRenderLeaderboard(d.rows, d.sort || window._wodMpLbSort || 'wins', scope);
    });
    addEventListener('wod-mp-Registered', (ev) => {
        if(ev.detail?.playerId)wodSelectSavedProfile(ev.detail.playerId);
        if(ev.detail && ev.detail.profile) wodApplyServerProfile(ev.detail.profile, { pushCloud: true });
        wodMpConfirmRegisteredDisplayName(ev.detail?.profile?.profile?.mpDisplayName);
    });
    addEventListener('wod-mp-Profile', (ev) => {
        if(ev.detail && ev.detail.profile) wodApplyServerProfile(ev.detail.profile);
    });
    addEventListener('wod-mp-ShopPurchaseOk', (ev) => {
        if(ev.detail && ev.detail.profile) wodApplyServerProfile(ev.detail.profile, { shopPurchase: true });
    });
    addEventListener('wod-mp-RegisterFailed', (ev) => {
        if(ev.detail?.reason==='identity_required'&&_wodSteamProfileProof){_wodSteamProfileProof=null;void wodMpRegisterWithServer();return;}
        if(ev.detail?.reason==='identity_required'&&wodProfileIdentity().webSession){showNotification('Steam sign-in expired. Sign in again to restore your account.');void wodUseDeviceProfile();return;}
        if(ev.detail) wodMpHandleDisplayNameRejected(ev.detail);
    });
    addEventListener('wod-mp-ProfileFailed', (ev) => {
        if(ev.detail && (ev.detail.reason === 'display_name_taken' || ev.detail.reason === 'display_name_required'))
            wodMpHandleDisplayNameRejected(ev.detail);
        else if(ev.detail && ev.detail.msg) showNotification(ev.detail.msg);
    });
    addEventListener('wod-mp-Close', (ev) => {
        let d = ev && ev.detail;
        let sess = window._wodMpSession;
        if(sess && sess.inMatch && gameState === 'PLAYING' && gameData.mp && gameData.mp.enabled) {
            wodMpFlushStatsToServer();
            showNotification('Connection lost — reconnecting…');
            void wodMpReconnectToMatch(sess, 0);
            return;
        }
        if(d && d.keepSession && sess && sess.code) {
            void wodMpReconnectToMatch(sess, 0);
            return;
        }
        if(gameState === 'PLAYING' && gameData.mp && gameData.mp.enabled) return;
        window.wodMpRoomMeta = {};
        _wodMpGuestLobbyPreviewFp = '';
        if(typeof wodMpClearLobbyPreviewDedupeState === 'function') wodMpClearLobbyPreviewDedupeState();
        wodMpRefreshMpPanelState();
        wodMpRenderLobbyList([]);
        wodMpUpdateOnline(0);
        if(window._wodMpBgReconnectTimer) clearTimeout(window._wodMpBgReconnectTimer);
        window._wodMpBgReconnectTimer = setTimeout(() => {
            void wodMpBackgroundConnect();
        }, 8000);
    });
}
function wodMpBackgroundConnect() {
    if(typeof WodMultiplayer === 'undefined') return Promise.resolve();
    wodMpInitGlobalHandlers();
    wodEnsurePlayerId();
    return wodMpEnsureConnected().then(() => {
        wodMpRegisterWithServer();
        // Push local progress first so a stale/empty cloud profile cannot wipe saves.
        scheduleCloudSyncProgress();
        void wodMpTryJoinLobbyFromUrl();
    }).catch(() => {});
}
function wodMpEnsureConnected() {
    if(typeof WodMultiplayer === 'undefined') return Promise.resolve();
    if(WodMultiplayer.api.socketOpen) {
        return wodMpRegisterWithServer().then(()=>{wodMpQueryFriendPresence();wodMpRefreshMpPanelState();});
    }
    if(_wodMpConnecting) return _wodMpConnecting;
    let st = document.getElementById('mpStatus');
    if(st) st.textContent = 'Connecting to multiplayer server…';
    _wodMpConnecting = WodMultiplayer.connect()
        .then(async () => {
            if(st) st.textContent = 'Connected — browse lobbies or host a match.';
            await wodMpRegisterWithServer();
            scheduleCloudSyncProgress();
            wodMpQueryFriendPresence();
            wodMpRefreshMpPanelState();
            wodMpRenderLobbyList(WodMultiplayer.api.lobbies || []);
            void wodMpTryJoinLobbyFromUrl();
            let rankPane = document.getElementById('mpPaneRankings');
            if(rankPane && rankPane.classList.contains('active'))
                wodMpRequestLeaderboard(window._wodMpLbSort || 'wins', window._wodMpLbScope || 'global');
        })
        .catch((e) => {
            let m = e && e.message ? e.message : String(e);
            if(st) st.textContent = 'Could not connect: ' + m + ' — check that the relay is running.';
        })
        .finally(() => { _wodMpConnecting = null; });
    return _wodMpConnecting;
}
function wodMpWireLobbyUi() {
    wodMpInitGlobalHandlers();
    wodEnsurePlayerId();
    wodMpLoadCachedLeaderboardRows();
    wodMpSyncDisplayNameFieldFromProfile();
    wodMpRefreshLocalMpStatsReadout();
    if(window._wodMpUiWired) {
        wodMpRefreshMpPanelState();
        if(typeof WodMultiplayer !== 'undefined' && WodMultiplayer.api && WodMultiplayer.api.lobbies)
            wodMpRenderLobbyList(WodMultiplayer.api.lobbies);
        wodMpEnsureConnected();
        return;
    }
    window._wodMpUiWired = true;
    wodMpWireProfileControls();
    wodMpWireLobbyControls();
    wodMpWireNetworkEvents();
}

/** Profile card, friends, invites, statistics and leaderboard controls in the Multiplayer panel. */
function wodMpWireProfileControls() {
    let mpDn = document.getElementById('mpDisplayName');
    if(mpDn && !mpDn._wodMpBound) {
        mpDn._wodMpBound = true;
        mpDn.addEventListener('input', () => {
            mpDn._wodMpEditing = true;
            wodMpSetDisplayNameFieldInvalid(false);
        });
        mpDn.addEventListener('focus', () => {
            mpDn._wodMpEditing = true;
        });
        mpDn.addEventListener('blur', () => {
            let newName = mpDn.value.trim().slice(0, 24);
            if(!newName) {
                wodMpClearDisplayNameEditing();
                wodMpRevertDisplayNameField();
                return;
            }
            let saved = (wodProgress && wodProgress.profile && wodProgress.profile.mpDisplayName) || '';
            if(newName === saved) {
                wodMpClearDisplayNameEditing();
                return;
            }
            wodMpSetDisplayNameFieldInvalid(false);
            wodMpRegisterWithServer();
            wodMpPushLobbyProfile();
        });
        mpDn.addEventListener('keydown', (ev) => {
            if(ev.key === 'Enter') mpDn.blur();
        });
    }
    document.querySelectorAll('.mp-hub-tab[data-mp-tab]').forEach(btn => {
        if(btn._wodMpBound) return;
        btn._wodMpBound = true;
        btn.addEventListener('click', () => wodMpSwitchHubTab(btn.getAttribute('data-mp-tab')));
    });
    let mpCopy = document.getElementById('mpBtnCopyId');
    if(mpCopy && !mpCopy._wodMpBound) {
        mpCopy._wodMpBound = true;
        mpCopy.onclick = () => {
            wodEnsurePlayerId();
            let id = wodProgress.profile.playerId || '';
            if(!id) return;
            if(navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(id).then(() => showNotification('Player ID copied.')).catch(() => showNotification(id));
            } else showNotification(id);
        };
    }
    let mpShare = document.getElementById('mpBtnShareProfile');
    if(mpShare && !mpShare._wodMpBound) {
        mpShare._wodMpBound = true;
        mpShare.onclick = () => wodMpShareProfileLink();
    }
    let mpAddFr = document.getElementById('mpBtnAddFriend');
    let mpFrIn = document.getElementById('mpFriendAddInput');
    if(mpAddFr && !mpAddFr._wodMpBound) {
        mpAddFr._wodMpBound = true;
        mpAddFr.onclick = () => {
            if(mpFrIn && wodMpAddFriendById(mpFrIn.value)) mpFrIn.value = '';
        };
    }
    if(mpFrIn && !mpFrIn._wodMpBound) {
        mpFrIn._wodMpBound = true;
        mpFrIn.addEventListener('keydown', (ev) => {
            if(ev.key === 'Enter') {
                ev.preventDefault();
                if(wodMpAddFriendById(mpFrIn.value)) mpFrIn.value = '';
            }
        });
    }
    let mpInvAcc = document.getElementById('mpFriendInviteAccept');
    let mpInvDec = document.getElementById('mpFriendInviteDecline');
    if(mpInvAcc && !mpInvAcc._wodMpBound) {
        mpInvAcc._wodMpBound = true;
        mpInvAcc.onclick = () => { void wodMpAcceptPendingInvite(); };
    }
    if(mpInvDec && !mpInvDec._wodMpBound) {
        mpInvDec._wodMpBound = true;
        mpInvDec.onclick = () => wodMpCloseFriendInviteDlg();
    }
    let mpSeatClose = document.getElementById('mpSeatInviteClose');
    if(mpSeatClose && !mpSeatClose._wodMpBound) {
        mpSeatClose._wodMpBound = true;
        mpSeatClose.onclick = () => wodMpCloseSeatInviteDlg();
    }
    let mpViewStats = document.getElementById('mpBtnViewAllStats');
    if(mpViewStats && !mpViewStats._wodMpBound) {
        mpViewStats._wodMpBound = true;
        mpViewStats.onclick = () => wodMpOpenStatsDetailDlg();
    }
    let mpStatsClose = document.getElementById('mpStatsDetailClose');
    if(mpStatsClose && !mpStatsClose._wodMpBound) {
        mpStatsClose._wodMpBound = true;
        mpStatsClose.onclick = () => wodMpCloseStatsDetailDlg();
    }
    let mpFrAcc = document.getElementById('mpFriendRequestAccept');
    let mpFrDec = document.getElementById('mpFriendRequestDecline');
    if(mpFrAcc && !mpFrAcc._wodMpBound) {
        mpFrAcc._wodMpBound = true;
        mpFrAcc.onclick = () => {
            if(_wodMpPendingFriendReq) wodMpRespondFriendRequest(_wodMpPendingFriendReq.fromPlayerId, true);
            else wodMpCloseFriendRequestDlg();
        };
    }
    if(mpFrDec && !mpFrDec._wodMpBound) {
        mpFrDec._wodMpBound = true;
        mpFrDec.onclick = () => {
            if(_wodMpPendingFriendReq) wodMpRespondFriendRequest(_wodMpPendingFriendReq.fromPlayerId, false);
            else wodMpCloseFriendRequestDlg();
        };
    }
    document.querySelectorAll('#mpLbSort [data-lb-sort]').forEach(btn => {
        if(btn._wodMpBound) return;
        btn._wodMpBound = true;
        btn.addEventListener('click', () => wodMpRequestLeaderboard(btn.getAttribute('data-lb-sort'), window._wodMpLbScope || 'global'));
    });
    document.querySelectorAll('#mpLbScope [data-lb-scope]').forEach(btn => {
        if(btn._wodMpBound) return;
        btn._wodMpBound = true;
        btn.addEventListener('click', () => wodMpRequestLeaderboard(window._wodMpLbSort || 'wins', btn.getAttribute('data-lb-scope')));
    });
    let mpLbPrev = document.getElementById('mpLbPagePrev');
    let mpLbNext = document.getElementById('mpLbPageNext');
    if(mpLbPrev && !mpLbPrev._wodMpBound) {
        mpLbPrev._wodMpBound = true;
        mpLbPrev.onclick = () => {
            window._wodMpLbPage = Math.max(0, (window._wodMpLbPage | 0) - 1);
            wodMpRenderLeaderboardPage();
        };
    }
    if(mpLbNext && !mpLbNext._wodMpBound) {
        mpLbNext._wodMpBound = true;
        mpLbNext.onclick = () => {
            window._wodMpLbPage = (window._wodMpLbPage | 0) + 1;
            wodMpRenderLeaderboardPage();
        };
    }
    let mpProfClose = document.getElementById('mpPlayerProfileClose');
    if(mpProfClose && !mpProfClose._wodMpBound) {
        mpProfClose._wodMpBound = true;
        mpProfClose.onclick = () => wodMpClosePlayerProfileDlg();
    }

}

/** Lobby list, hosting, the host's map and rules dialogs, leaving and launching. */
function wodMpWireLobbyControls() {
    let st = document.getElementById('mpStatus');
    let btnDisc = document.getElementById('mpBtnDisconnect');
    document.getElementById('mpBtnRefresh').onclick = async () => {
        await wodMpEnsureConnected();
        if(typeof WodMultiplayer !== 'undefined' && WodMultiplayer.api.socketOpen)
            WodMultiplayer.requestLobbyList();
    };
    document.getElementById('mpBtnHostCreate').onclick = async () => {
        try {
            if(!wodMpRequireRegisteredDisplayName('hosting')) return;
            await wodMpEnsureConnected();
            if(typeof WodMultiplayer === 'undefined' || !WodMultiplayer.api.socketOpen) {
                if(st) st.textContent = 'Could not reach multiplayer server.';
                return;
            }
            let nameEl = document.getElementById('mpHostName');
            let pwEl = document.getElementById('mpHostPassword');
            let name = (nameEl && nameEl.value.trim()) ? nameEl.value.trim() : 'Game';
            let password = pwEl ? String(pwEl.value) : '';
            if(st) st.textContent = 'Creating lobby…';
            let hostMeta = wodMpBuildInitialHostMeta();
            await WodMultiplayer.createLobby({ name, password, meta: hostMeta });
            wodMpLobbyCount = 1;
            if(typeof wodMpClearLobbyPreviewDedupeState === 'function') wodMpClearLobbyPreviewDedupeState();
            window.wodMpRoomMeta = Object.assign(window.wodMpRoomMeta || {}, hostMeta);
            wodMpEnsureDefaultSeatTypes(window.wodMpRoomMeta);
            wodMpSyncLayoutCountFieldsFromMeta(window.wodMpRoomMeta);
            wodMpSyncHostCfgFromSetup();
            wodMpRefreshMpPanelState();
            if(WodMultiplayer.sendLobbyMeta) {
                let built = wodMpBuildLobbyMetaFromSetup();
                window.wodMpRoomMeta = Object.assign(window.wodMpRoomMeta, built);
                WodMultiplayer.sendLobbyMeta(built);
            }
            wodMpPushLobbyProfile();
            if(st) st.textContent = 'Lobby created — game lobby opened.';
            wodMpRenderLobbyList(WodMultiplayer.api.lobbies);
            if(WodMultiplayer.api && WodMultiplayer.api.isHost) {
                requestAnimationFrame(() => wodMpRefreshLobbyMapPreview({ force: true }));
            }
        } catch(e) {
            if(st) st.textContent = 'Failed: ' + (e && e.message);
        }
    };
    let mpGlMap = document.getElementById('mpBtnGlMap');
    let mpGlRules = document.getElementById('mpBtnGlRules');
    if(mpGlMap) mpGlMap.onclick = () => wodMpOpenHostMapDlg();
    if(mpGlRules) mpGlRules.onclick = () => wodMpOpenHostRulesDlg();
    let mpBtnGlApplyLayout = document.getElementById('mpBtnGlApplyLayout');
    let mpBtnGlRegenMap = document.getElementById('mpBtnGlRegenMap');
    if(mpBtnGlApplyLayout) mpBtnGlApplyLayout.onclick = () => {
        if(wodIsMapPreviewGenerating()) return;
        let layout = wodMpReadGlLayoutCounts();
        wodMpApplyLayoutCounts(layout.humans, layout.bots, {});
        wodMpRenderGameLobbyScreen();
        showNotification('Seat layout updated.');
    };
    if(mpBtnGlRegenMap) mpBtnGlRegenMap.onclick = () => {
        if(wodIsMapPreviewGenerating()) return;
        let layout = wodMpReadGlLayoutCounts();
        wodMpApplyLayoutCounts(layout.humans, layout.bots, { forceRegen: true });
        wodMpRenderGameLobbyScreen();
        showNotification('Map preview regenerated.');
    };
    let mpGlHumanCount = document.getElementById('mpGlHumanCount');
    let mpGlBotCount = document.getElementById('mpGlBotCount');
    if(mpGlHumanCount && !mpGlHumanCount._wodMpBound) {
        mpGlHumanCount._wodMpBound = true;
        mpGlHumanCount.onchange = () => {
            let layout = wodMpReadGlLayoutCounts();
            if(mpGlBotCount && layout.humans + layout.bots > WOD_MP_MAX_PLAYERS)
                mpGlBotCount.value = String(Math.max(0, WOD_MP_MAX_PLAYERS - layout.humans));
        };
    }
    if(mpGlBotCount && !mpGlBotCount._wodMpBound) {
        mpGlBotCount._wodMpBound = true;
        mpGlBotCount.onchange = () => {
            let layout = wodMpReadGlLayoutCounts();
            if(mpGlHumanCount && layout.humans + layout.bots > WOD_MP_MAX_PLAYERS)
                mpGlBotCount.value = String(Math.max(0, WOD_MP_MAX_PLAYERS - layout.humans));
        };
    }
    let mpCfgMapApply = document.getElementById('mpCfgMapApply');
    let mpCfgMapClose = document.getElementById('mpCfgMapClose');
    let mpCfgMapSaveMap = document.getElementById('mpCfgMapSaveMap');
    let mpCfgMapLoadMap = document.getElementById('mpCfgMapLoadMap');
    if(mpCfgMapSaveMap) mpCfgMapSaveMap.onclick = () => {
        if(wodIsMapPreviewGenerating()) return;
        wodPromptSaveMapToLibrary();
    };
    if(mpCfgMapLoadMap) mpCfgMapLoadMap.onclick = () => {
        if(wodIsMapPreviewGenerating()) return;
        wodMpCloseHostMapDlg();
        showPanel('mapLibrary', { libContext: 'setup', fromMpHost: true });
    };
    if(mpCfgMapApply) mpCfgMapApply.onclick = () => {
        if(wodIsMapPreviewGenerating()) return;
        wodMpCopyFieldToField('mpCfgMapSize', 'setupMapSize');
        wodMpCopyFieldToField('mpCfgMapShape', 'setupMapShape');
        wodMpCopyFieldToField('mpCfgCitiesPerPlayer', 'setupCitiesPerPlayer');
        if(!window.wodMpRoomMeta || typeof window.wodMpRoomMeta !== 'object') window.wodMpRoomMeta = {};
        window.wodMpRoomMeta.lobbyMapSeed = (Math.imul(Date.now() >>> 0, 2246822519) ^ (window.wodMpRoomMeta.lobbyMapSeed || 0) ^ 0x9e3779b9) >>> 0;
        if(!window.wodMpRoomMeta.lobbyMapSeed) window.wodMpRoomMeta.lobbyMapSeed = 0x6a09e667;
        previewMap();
        if(typeof WodMultiplayer !== 'undefined' && WodMultiplayer.sendLobbyMeta)
            WodMultiplayer.sendLobbyMeta(wodMpBuildLobbyMetaFromSetup());
        wodMpCloseHostMapDlg();
        showNotification('Map settings updated.');
        wodMpRenderGameLobbyScreen();
        requestAnimationFrame(() => wodMpRefreshLobbyMapPreview({ force: true }));
    };
    if(mpCfgMapClose) mpCfgMapClose.onclick = () => wodMpCloseHostMapDlg();
    let mpCfgRulesApply = document.getElementById('mpCfgRulesApply');
    let mpCfgRulesClose = document.getElementById('mpCfgRulesClose');
    let mpCfgVictoryModeEl = document.getElementById('mpCfgVictoryMode');
    if(mpCfgVictoryModeEl && !mpCfgVictoryModeEl._wodMpBound) {
        mpCfgVictoryModeEl._wodMpBound = true;
        mpCfgVictoryModeEl.addEventListener('change', wodMpSyncMpCfgVictoryDetail);
    }
    if(mpCfgRulesApply) mpCfgRulesApply.onclick = () => {
        if(wodIsMapPreviewGenerating()) return;
        wodMpCopyFieldToField('mpCfgVictoryMode', 'setupVictoryMode');
        wodMpCopyFieldToField('mpCfgFogOfWar', 'setupFogOfWar');
        wodMpCopyFieldToField('mpCfgMoney', 'setupMoney');
        wodMpCopyFieldToField('mpCfgPlayerColor', 'setupPlayerColor');
        wodMpCopyFieldToField('mpCfgGamePeriod', 'setupGamePeriod');
        let mpPer = document.getElementById('mpCfgGamePeriod');
        if(mpPer) wodApplyGamePeriod(mpPer.value, { saveProfile: true });
        syncSetupVictoryDetail();
        if(typeof WodMultiplayer !== 'undefined' && WodMultiplayer.sendLobbyMeta)
            WodMultiplayer.sendLobbyMeta(wodMpBuildLobbyMetaFromSetup());
        wodMpCloseHostRulesDlg();
        showNotification('Match rules updated.');
        wodMpRenderGameLobbyScreen();
    };
    if(mpCfgRulesClose) mpCfgRulesClose.onclick = () => wodMpCloseHostRulesDlg();
    document.getElementById('mpBtnLeaveGameLobby').onclick = () => {
        if(typeof WodMultiplayer !== 'undefined') {
            WodMultiplayer.leaveLobby();
            WodMultiplayer.requestLobbyList();
        }
        window.wodMpRoomMeta = {};
        _wodMpCommittedLobbyMap = null;
        wodMpLobbyCount = 1;
        if(typeof wodMpClearLobbyPreviewDedupeState === 'function') wodMpClearLobbyPreviewDedupeState();
        wodMpRefreshMpPanelState();
        if(st) st.textContent = 'Left lobby.';
        wodMpRenderLobbyList(typeof WodMultiplayer !== 'undefined' ? WodMultiplayer.api.lobbies : []);
    };
    btnDisc.onclick = () => {
        if(typeof WodMultiplayer !== 'undefined') WodMultiplayer.disconnect();
        if(st) st.textContent = 'Disconnected from server.';
        window.wodMpRoomMeta = {};
        wodMpLobbyCount = 1;
        if(typeof wodMpClearLobbyPreviewDedupeState === 'function') wodMpClearLobbyPreviewDedupeState();
        wodMpRefreshMpPanelState();
        wodMpRenderLobbyList([]);
        wodMpUpdateOnline(0);
    };
    let btnGlLaunch = document.getElementById('mpBtnGlLaunch');
    if(btnGlLaunch) btnGlLaunch.onclick = () => {
        if(!WodMultiplayer.api || !WodMultiplayer.api.isHost) return;
        if(WodMultiplayer.sendLobbyMeta) {
            let built = wodMpBuildLobbyMetaFromSetup();
            window.wodMpRoomMeta = Object.assign(window.wodMpRoomMeta || {}, built);
            wodMpEnsureDefaultSeatTypes(window.wodMpRoomMeta);
            WodMultiplayer.sendLobbyMeta(built);
        }
        let meta = window.wodMpRoomMeta;
        if(!wodMpValidateLaunchReady(meta)) return;
        void (async function() {
            wodMpNormalizeLobbyMeta(meta);
            let st = meta.seatTypes || [];
            let occ = (meta.occupiedSlots || []).slice().sort((a, b) => a - b);
            let layoutHumans = wodMpCollectLayoutHumanSeats(meta);
            let layoutFactions = wodMpGetLobbyFactionSlotsFromMeta(meta);
            window.wodMpRoomMeta = meta;
            window.wodMpRoomMeta.maxHumans = WOD_MP_MAX_PLAYERS;
            window.wodMpRoomMeta.seatTypes = st.slice();
            if(WodMultiplayer.sendLobbyMeta) WodMultiplayer.sendLobbyMeta(wodMpBuildLobbyMetaFromSetup());
            wodMpApplyMetaToSetupFields(meta);
            wodMpApplyLaunchColorsFromHumans(meta, layoutFactions);
            gameData.aiCount = st.filter(t => t === 'bot').length;
            gameData.mp = {
                enabled: true, isHost: true, localSlot: WodMultiplayer.api.slot,
                humanSlots: layoutHumans,
                factionSlots: layoutFactions.slice(),
                connectedSlots: occ.slice(),
                seatTypes: st,
                maxLobbySlots: WOD_MP_MAX_PLAYERS,
                lobbyCount: wodMpLobbyCount | 0,
                eliminatedSlots: [],
                allReady: false,
                expectedReady: occ.slice().sort((a, b) => a - b),
                readySlots: {},
                playerPublic: (meta.playerPublic && typeof meta.playerPublic === 'object')
                    ? Object.assign({}, meta.playerPublic)
                    : {}
            };
            wodMpInitSyncState(occ);
            pauseMenuBackgroundBattle();
            wodPrepareForNewMatch({ keepMp: true });
            wodMpEnsureDefaultMatchLayers(true);
            let launchPayload = null;
            try {
                launchPayload = await wodMpPrepareHostLaunchPayload(meta);
            } catch(e) {
                console.error(e);
                gameData._wodMpLaunchFactionSlots = null;
                showNotification('Failed to start multiplayer match — map could not be generated.');
                return;
            } finally {
                gameData._wodMpLaunchFactionSlots = null;
            }
            if(!launchPayload || !launchPayload.hexList || !launchPayload.hexList.length || !launchPayload.cities || !launchPayload.cities.length) {
                showNotification('Map generation failed — wait for the lobby preview, then launch again.');
                return;
            }
            hidePanels();
            gameState = 'PLAYING';
            UI.mainMenu.classList.add('hidden');
            UI.panels.forEach(p => p.classList.add('hidden'));
            UI.escMenu.classList.add('hidden');
            UI.inGameUI.style.display = 'block';
            UI.canvas.style.display = 'block';
            if(window.wodMusic) {
                try { window.wodMusic.bindUi(); window.wodMusic.start(); } catch(e) { console.warn(e); }
            }
            wodSetMpMatchUiFlag(true);
            wodResetMobileHud();
            setGameSpeed(0, true);
            wodMpSnapSeq = 0;
            try {
                await wodMpApplyMatchStartPayload(launchPayload, { asyncHexes: false });
            } catch(err) {
                console.error(err);
                showNotification('Failed to load multiplayer map on host.');
                gameState = 'MENU';
                return;
            }
            gameData.playerShiftWaypoints = [];
            gameData.pathStrokePreview = null;
            syncHudObjectiveDisplay();
            wodBindHudResourceTooltips();
            try {
                WodMultiplayer.hostSendMatchStart(launchPayload);
            } catch(err) {
                console.error(err);
                showNotification('Failed to send map to players (too large?)');
            }
            wodMpSaveSession();
            wodMpTryMarkReady(WodMultiplayer.api.slot | 0);
            wodSyncDesktopLayersPanelExpanded();
            syncInGameLayerToolbar();
            wodApplyPlayViewportLock(true);
            let sc = gameData.cities.find(c => c.owner === gameData.mp.localSlot);
            if(sc) {
                let vw = canvas.clientWidth || UI.wrapper.clientWidth || 1;
                let vh = canvas.clientHeight || UI.wrapper.clientHeight || 1;
                gameData.camera.x = sc.x * gameData.camera.zoom - vw / 2;
                gameData.camera.y = sc.y * gameData.camera.zoom - vh / 2;
            }
            lastTime = performance.now();
            if(animationFrameId) cancelAnimationFrame(animationFrameId);
            gameLoop(lastTime);
            requestAnimationFrame(() => draw());
        })();
    };

}

/** Reactions to relay events: lobby updates, players joining and leaving, match start, snapshots and guest commands. */
/** Relay event wod-mp-RemoteCmd. */
function wodMpHostHandleRemoteCmd(ev) {
    if(!gameData.mp || !gameData.mp.isHost) return;
    if(!wodMpMatchCanPlay()) return;
    let d = ev.detail;
    if(!d || !d.cmd) return;
    d = { fromSlot: d.fromSlot, cmd: wodMpSanitizeRemoteCmd(d.cmd) };
    if(!d.cmd) return;
    if(wodMpIsSlotEliminated(d.fromSlot))return;
    if(d.cmd.kind === 'forfeit') {
        let slot = d.fromSlot | 0;
        if(!slot) return;
        wodMpHostMarkSlotDisconnected(slot);
        return;
    }
    if(d.cmd.kind==='focusTarget'){wodSetPreferredTarget(d.fromSlot,d.cmd.uids,d.cmd.targetUid);return;}
    if(d.cmd.kind==='retreat'){for(const u of wodMpOwnedUnitsForCmd(d))wodRetreatUnit(u);return;}
    if(d.cmd.kind === 'move') {
        let units = wodMpOwnedUnitsForCmd(d);
        if(units.length === 0) return;
        gameData.playerShiftWaypoints = [];
        let worldPos = { x: d.cmd.x, y: d.cmd.y };
        const slots=wodGroupDestinationSlots(units,worldPos);
        wodApplyPlayerMoveOrders(units,u=>slots.has(u)?[slots.get(u)]:null);
    } else if(d.cmd.kind === 'lineFormation') {
        let units = wodMpOwnedUnitsForCmd(d);
        if(units.length === 0) return;
        gameData.playerShiftWaypoints = [];
        let start = { x: d.cmd.sx, y: d.cmd.sy };
        let end = { x: d.cmd.ex, y: d.cmd.ey };
        const slots=wodGroupDestinationSlots(units,{x:(start.x+end.x)/2,y:(start.y+end.y)/2},{start,end});
        wodApplyPlayerMoveOrders(units,u=>slots.has(u)?[slots.get(u)]:null);
    } else if(d.cmd.kind === 'shiftMarch') {
        let units = wodMpOwnedUnitsForCmd(d);
        if(units.length === 0) return;
        gameData.playerShiftWaypoints = [];
        if(d.cmd.paths && d.cmd.paths.length) {
            let byUid = {};
            for(let i = 0; i < (d.cmd.uids || []).length; i++)
                byUid[d.cmd.uids[i]] = d.cmd.paths[i];
            for(let unit of units) {
                let pathPts = byUid[unit.uid];
                if(pathPts && pathPts.length)
                    assignUnitMoveAlongWaypoints(unit, pathPts.map(p => ({ x: p.x, y: p.y })));
            }
        } else {
            let wps = d.cmd.wps;
            if(!wps || !wps.length) return;
            wodApplyShiftWaypointPaths(units, wps, d.cmd.line || null);
        }
    } else if(d.cmd.kind === 'strokeMove') {
        let strokePts = d.cmd.pts;
        if(!strokePts || strokePts.length < 2) return;
        let units = wodMpOwnedUnitsForCmd(d);
        if(units.length === 0) return;
        gameData.playerShiftWaypoints = [];
        let cx = 0;
        let cy = 0;
        for(let u of units) {
            cx += u.x;
            cy += u.y;
        }
        cx /= units.length;
        cy /= units.length;
        let trimR2 = Math.pow(Math.max(20, gameData.hexRadius * 1.45), 2);
        units.forEach(unit => {
            let ox = unit.x - cx;
            let oy = unit.y - cy;
            let pathPts = [];
            for(let i = 0; i < strokePts.length - 1; i++)
                pathPts.push({ x: strokePts[i].x + ox, y: strokePts[i].y + oy });
            let end = strokePts[strokePts.length - 1];
            pathPts.push({ x: end.x + ox, y: end.y + oy });
            while(pathPts.length > 1) {
                let p = pathPts[0];
                let dx = p.x - unit.x;
                let dy = p.y - unit.y;
                if(dx * dx + dy * dy < trimR2) pathPts.shift();
                else break;
            }
            assignUnitMoveAlongWaypoints(unit, pathPts);
        });
    } else if(d.cmd.kind==='boardTransport'||d.cmd.kind==='unloadTransport') {
        const t=gameData.entities.find(u=>u.uid===d.cmd.transportUid&&u.owner===d.fromSlot&&u.type==='transport');if(!t)return;
        if(d.cmd.kind==='boardTransport'){const u=gameData.entities.find(u=>u.uid===d.cmd.uid&&u.owner===d.fromSlot);if(u)wodOrderBoardTransport(u,t);}
        else wodOrderUnloadTransport(t,Number.isFinite(d.cmd.x)&&Number.isFinite(d.cmd.y)?{x:d.cmd.x,y:d.cmd.y}:null);
    } else if(d.cmd.kind === 'build') {
        let mode = d.cmd.mode;
        if(mode === 'hospital') {
            const hex=wodHexAt(d.cmd.hq,d.cmd.hr);
            if(hex&&hex.owner===d.fromSlot)placeHospitalAtHex(hex,d.fromSlot);
            return;
        }
        if(mode === 'fort') {
            let hex = wodHexAt(d.cmd.hq,d.cmd.hr);
            if(!hex || hex.owner !== d.fromSlot) return;
            attemptFortPlacementForOwner(hex, d.fromSlot, true);
            return;
        }
        if(mode === 'bridge') {
            // A client names the two bank cells. The host lays the span out itself, applies
            // every placement rule for that seat and charges for the cells it finds.
            if([d.cmd.aq, d.cmd.ar, d.cmd.bq, d.cmd.br].every(Number.isFinite))
                placeBridgeSpan(d.fromSlot, d.cmd.aq, d.cmd.ar, d.cmd.bq, d.cmd.br, { suppressNotes: true });
            else if([d.cmd.x, d.cmd.y, d.cmd.angle].every(Number.isFinite)) {
                // Older clients send a fixed deck by position; its size is never taken from the client.
                const dims = wodBridgeDefaultDims();
                placeBridgeAt(d.fromSlot, d.cmd.x, d.cmd.y, d.cmd.angle, dims.w, dims.h, { suppressNotes: true });
            }
            return;
        }
        let city = gameData.cities.find(c => c.q === d.cmd.cq && c.r === d.cmd.cr);
        if(!city || city.owner !== d.fromSlot) return;
        if(!cityEligibleForBuildPlacementForOwner(city, mode, d.fromSlot)) return;
        wodApplyBuildAtCityForOwner(city, mode, d.fromSlot);
    }
}

/** Relay event wod-mp-MatchStart. */
function wodMpOnMatchStart(ev) {
    if(typeof WodMultiplayer !== 'undefined' && WodMultiplayer.api.isHost) return;
    if(!ev.detail || !ev.detail.payload) return;
    void (async function() {
        wodMpAbortLobbyPreviewJobs();
        let pl = ev.detail.payload;
        let expectedReady = Array.isArray(pl.expectedReady) ? pl.expectedReady.slice() : (pl.connectedSlots || pl.humanSlots || [1]).slice();
        let conn = Array.isArray(pl.connectedSlots) ? pl.connectedSlots.slice() : expectedReady.slice();
        let maxL = wodMpClampLobbyCap(pl.maxLobbySlots != null ? pl.maxLobbySlots : WOD_MP_MAX_PLAYERS);
        let st = pl.seatTypes || [];
        let factions = (pl.factionSlots && pl.factionSlots.length)
            ? pl.factionSlots.slice()
            : wodMpGetLobbyFactionSlotsFromMeta({ maxHumans: maxL, seatTypes: st });
        gameData.mp = {
            enabled: true, isHost: false, localSlot: WodMultiplayer.api.slot,
            humanSlots: pl.humanSlots || factions.slice(),
            factionSlots: factions,
            connectedSlots: conn,
            seatTypes: st,
            maxLobbySlots: maxL,
            eliminatedSlots: [],
            allReady: false,
            expectedReady: expectedReady.slice().sort((a, b) => a - b),
            readySlots: {},
            playerPublic: (pl.playerPublic && typeof pl.playerPublic === 'object')
                ? Object.assign({}, pl.playerPublic)
                : {}
        };
        wodMpInitSyncState(expectedReady);
        if(pl.aiCount != null) gameData.aiCount = pl.aiCount;
        hidePanels();
        gameState = 'PLAYING';
        pauseMenuBackgroundBattle();
        wodPrepareForNewMatch({ keepMp: true });
        wodClearLiveMapForNewMatch();
        UI.mainMenu.classList.add('hidden');
        UI.panels.forEach(p => p.classList.add('hidden'));
        UI.escMenu.classList.add('hidden');
        UI.inGameUI.style.display = 'block';
        UI.canvas.style.display = 'block';
        if(window.wodMusic) {
            try { window.wodMusic.bindUi(); window.wodMusic.start(); } catch(e) { console.warn(e); }
        }
        wodSetMpMatchUiFlag(true);
        wodResetMobileHud();
        wodMpEnsureDefaultMatchLayers(true);
        gameData.selection = [];
        setGameSpeed(0, true);
        wodMpRefreshSyncOverlay();
        let syncMsg = document.querySelector('#wodMpSyncOverlay .wod-mp-sync-msg');
        if(syncMsg) syncMsg.textContent = 'Loading host map…';
        try {
            await wodMpApplyMatchStartPayload(pl, { asyncHexes: true });
        } catch(err) {
            console.error(err);
            showNotification('Failed to load host map.');
            gameState = 'MENU';
            return;
        }
        if(!gameData.hexList || !gameData.hexList.length) {
            showNotification('Host map data was empty — cannot start.');
            gameState = 'MENU';
            return;
        }
        wodTerrainBakeNextMs = 0;
        lastTime = performance.now();
        if(animationFrameId) cancelAnimationFrame(animationFrameId);
        gameLoop(lastTime);
        requestAnimationFrame(() => draw());
        wodSyncDesktopLayersPanelExpanded();
        syncInGameLayerToolbar();
        wodApplyPlayViewportLock(true);
        let sc = gameData.cities.find(c => c.owner === gameData.mp.localSlot);
        if(sc) {
            let vw = canvas.clientWidth || UI.wrapper.clientWidth || 1;
            let vh = canvas.clientHeight || UI.wrapper.clientHeight || 1;
            gameData.camera.x = sc.x * gameData.camera.zoom - vw / 2;
            gameData.camera.y = sc.y * gameData.camera.zoom - vh / 2;
        }
        if(typeof WodMultiplayer !== 'undefined' && WodMultiplayer.sendMatchReady)
            WodMultiplayer.sendMatchReady();
        wodMpSaveSession();
        showNotification('Multiplayer: received game from host');
    })();
}

/** Relay event wod-mp-RejoinMatch. */
function wodMpOnRejoinMatch(ev) {
    let d = ev && ev.detail;
    if(!d || !d.payload || typeof WodMultiplayer === 'undefined') return;
    void (async function() {
        wodMpAbortLobbyPreviewJobs();
        let pl = d.payload;
        let conn = Array.isArray(pl.connectedSlots) ? pl.connectedSlots.slice() : (pl.humanSlots || [1]).slice();
        let mySlot = WodMultiplayer.api.slot | 0;
        if(mySlot && conn.indexOf(mySlot) < 0) conn.push(mySlot);
        let expectedReady = Array.isArray(pl.expectedReady) ? pl.expectedReady.slice() : conn.slice();
        let maxL = wodMpClampLobbyCap(pl.maxLobbySlots != null ? pl.maxLobbySlots : WOD_MP_MAX_PLAYERS);
        let stRe = pl.seatTypes || [];
        let factionsRe = (pl.factionSlots && pl.factionSlots.length)
            ? pl.factionSlots.slice()
            : wodMpGetLobbyFactionSlotsFromMeta({ maxHumans: maxL, seatTypes: stRe });
        gameData.mp = {
            enabled: true,
            isHost: !!d.isHost,
            localSlot: mySlot,
            humanSlots: pl.humanSlots || factionsRe.slice(),
            factionSlots: factionsRe,
            connectedSlots: conn,
            seatTypes: stRe,
            maxLobbySlots: maxL,
            eliminatedSlots: [],
            allReady: false,
            expectedReady: expectedReady.slice().sort((a, b) => a - b),
            readySlots: {},
            playerPublic: (pl.playerPublic && typeof pl.playerPublic === 'object')
                ? Object.assign({}, pl.playerPublic)
                : {}
        };
        wodMpInitSyncState(expectedReady);
        if(pl.aiCount != null) gameData.aiCount = pl.aiCount;
        hidePanels();
        gameState = 'PLAYING';
        pauseMenuBackgroundBattle();
        wodPrepareForNewMatch({ keepMp: true, keepLifetimeMatch: true });
        wodClearLiveMapForNewMatch();
        UI.mainMenu.classList.add('hidden');
        UI.panels.forEach(p => p.classList.add('hidden'));
        UI.escMenu.classList.add('hidden');
        UI.inGameUI.style.display = 'block';
        UI.canvas.style.display = 'block';
        if(window.wodMusic) {
            try { window.wodMusic.bindUi(); window.wodMusic.start(); } catch(e) { console.warn(e); }
        }
        wodSetMpMatchUiFlag(true);
        wodResetMobileHud();
        wodMpEnsureDefaultMatchLayers();
        gameData.selection = [];
        setGameSpeed(0, true);
        wodMpRefreshSyncOverlay();
        let syncMsg = document.querySelector('#wodMpSyncOverlay .wod-mp-sync-msg');
        if(syncMsg) syncMsg.textContent = 'Loading host map…';
        const observer=!!WodMultiplayer.api.spectating,saved=observer?wodReadSpectatorReport():null;
        if(observer){gameData._restoringSpectator=true;gameData._lifetimeMatch={...(saved?.match||{}),mode:'multiplayer',finished:true,mpOutcomeRecorded:true,outcome:'defeat',reason:saved?.match?.reason||'eliminated',applied:{}};}
        try {
            await wodMpApplyMatchStartPayload(pl, { asyncHexes: true, resumeMatch: true });
        } catch(err) {
            console.error(err);
            gameData._restoringSpectator=false;showNotification('Failed to load host map on rejoin.');
            gameState = 'MENU';
            return;
        }
        if(!observer)wodBeginLifetimeMatch();
        wodMpApplyDeferredSnapshot(d.snap?.payload);
        gameData._restoringSpectator=false;
        if(observer&&saved&&saved.ledger===wodBattleLedger().id&&gameData._spectator&&!gameData._spectator.finished){
            document.getElementById('campaignSummaryTitle').textContent=saved.title||'Defeat';document.getElementById('campaignSummarySub').textContent=saved.sub||'';document.getElementById('campaignSummaryStats').innerHTML=saved.stats||'';
            if(saved.active)wodStartSpectating();else wodSaveSpectatorReport();
        }
        wodMpEnsureLocalSlotConnected();
        if(!gameData.hexList || !gameData.hexList.length) {
            showNotification('Host map data was empty — cannot rejoin.');
            gameState = 'MENU';
            return;
        }
        wodMpFreezeSeatPlayerMap();
        gameData.mp.allReady = true;
        if(gameData.mp.isHost) wodMpHostMarkSlotReconnected(gameData.mp.localSlot);
        wodMpRefreshSyncOverlay();
        if(!gameData._campaignEnded&&!gameData._spectator?.finished)setGameSpeed(1, true);
        wodMpFlushStatsToServer();
        wodMpRefreshMatchViewportAndTerrain();
        wodTerrainBakeNextMs = 0;
        lastTime = performance.now();
        if(animationFrameId) cancelAnimationFrame(animationFrameId);
        gameLoop(lastTime);
        requestAnimationFrame(() => draw());
        wodSyncDesktopLayersPanelExpanded();
        syncInGameLayerToolbar();
        wodApplyPlayViewportLock(true);
        let sc = gameData.cities.find(c => c.owner === gameData.mp.localSlot);
        if(sc) {
            let vw = canvas.clientWidth || UI.wrapper.clientWidth || 1;
            let vh = canvas.clientHeight || UI.wrapper.clientHeight || 1;
            gameData.camera.x = sc.x * gameData.camera.zoom - vw / 2;
            gameData.camera.y = sc.y * gameData.camera.zoom - vh / 2;
        }
        if(WodMultiplayer.sendMatchReady) WodMultiplayer.sendMatchReady();
        wodMpSaveSession();
        showNotification('Rejoined match — resuming your seat.');
    })();
}

/** Relay event wod-mp-Peers. */
function wodMpOnPeers(ev, st) {
    let d = ev.detail || {};
    if(d.count != null) wodMpLobbyCount = d.count;
    if(window.wodMpRoomMeta && typeof window.wodMpRoomMeta === 'object') {
        if(d.t === 'peer_joined' && d.slot) {
            let occ = Array.isArray(window.wodMpRoomMeta.occupiedSlots)
                ? window.wodMpRoomMeta.occupiedSlots.slice() : [];
            if(occ.indexOf(d.slot) < 0) occ.push(d.slot);
            window.wodMpRoomMeta.occupiedSlots = occ;
        } else if(d.t === 'peer_left' && d.slot) {
            let occ = Array.isArray(window.wodMpRoomMeta.occupiedSlots)
                ? window.wodMpRoomMeta.occupiedSlots.filter(s => s !== d.slot) : [];
            window.wodMpRoomMeta.occupiedSlots = occ;
        }
    }
    wodMpRenderGameLobbyScreen();
    wodMpRefreshMpPanelState();
    if(st && WodMultiplayer.api && WodMultiplayer.api.code)
        st.textContent = 'Lobby: ' + (wodMpLobbyCount | 0) + ' player(s)' + (WodMultiplayer.api.isHost ? ' — you host' : ' — waiting for host');
    if(wodMpIsLobbyPreviewHost() && gameState !== 'PLAYING') {
        requestAnimationFrame(() => {
            let meta = window.wodMpRoomMeta || {};
            if(d.t === 'peer_left') {
                wodMpTryPaintLobbyPreviewCanvas(meta);
                return;
            }
            if(d.t === 'peer_joined') {
                let prevFp = wodMpLobbyFactionFingerprint(meta);
                if(wodMpSyncSeatsToLobbyPopulation(meta)) {
                    wodMpPushLobbyMetaFromCurrentUi();
                    if(prevFp !== wodMpLobbyFactionFingerprint(meta)) {
                        wodMpRefreshLobbyMapPreviewAfterMetaChange(meta, {
                            politicsOnly: !!_wodMpLobbyPreviewLastTerrainFp
                        });
                        return;
                    }
                }
                if(wodMpLobbyPreviewMapValid(meta, _wodMpCommittedLobbyMap && _wodMpCommittedLobbyMap.data))
                    wodMpTryPaintLobbyPreviewCanvas(meta);
                else
                    wodMpRefreshLobbyMapPreviewAfterMetaChange(meta, { politicsOnly: !!_wodMpLobbyPreviewLastTerrainFp });
            }
        });
    }
}

function wodMpWireNetworkEvents() {
    let st = document.getElementById('mpStatus');
    addEventListener('wod-mp-Error', (ev) => {
        let m = ev && ev.detail && ev.detail.msg ? String(ev.detail.msg) : 'Error';
        showNotification(m);
    });
    addEventListener('wod-mp-Kicked', (ev) => {
        let m = ev && ev.detail && ev.detail.msg ? String(ev.detail.msg) : 'Removed from lobby';
        showNotification(m);
        if(typeof WodMultiplayer !== 'undefined')
            WodMultiplayer.requestLobbyList();
        window.wodMpRoomMeta = {};
        wodMpLobbyCount = 1;
        if(typeof wodMpClearLobbyPreviewDedupeState === 'function') wodMpClearLobbyPreviewDedupeState();
        wodMpRefreshMpPanelState();
        let stKick = document.getElementById('mpStatus');
        if(stKick) stKick.textContent = 'You were removed from the lobby.';
        wodMpRenderLobbyList(typeof WodMultiplayer !== 'undefined' ? WodMultiplayer.api.lobbies : []);
    });

    addEventListener('wod-mp-FriendPresence', (ev) => {
        let d = ev.detail || {};
        wodMpSetFriendPresence(d.online);
        wodMpRenderFriendsList();
        wodMpRefreshFriendsLeaderboardIfVisible();
        let seatDlg = document.getElementById('mpSeatInviteDlg');
        if(seatDlg && !seatDlg.classList.contains('hidden') && _wodMpSeatInviteSlot)
            wodMpOpenSeatInviteDlg(_wodMpSeatInviteSlot);
    });
    addEventListener('wod-mp-LobbyList', (ev) => {
        let d = ev.detail || {};
        wodMpUpdateOnline(d.online);
        wodMpRenderLobbyList(d.lobbies);
        wodMpRefreshMpPanelState();
    });
    addEventListener('wod-mp-Joined', (ev) => {
        let d = ev.detail || {};
        let pl = d.players;
        if(pl != null) wodMpLobbyCount = pl;
        else wodMpLobbyCount = Math.max(1, (WodMultiplayer.api && WodMultiplayer.api.slot) | 0);
        if(d.meta) wodMpApplyRoomMeta(d.meta);
        wodMpRefreshMpPanelState();
        wodMpRenderLobbyList(WodMultiplayer.api.lobbies);
        wodMpPushLobbyProfile();
        if(wodMpIsLobbyPreviewHost())
            requestAnimationFrame(() => {
                wodClearLiveMapForNewMatch();
                if(!wodMpHostPaintLobbyPreviewFromCommitted(window.wodMpRoomMeta))
                    wodMpRefreshLobbyMapPreview();
            });
        else {
            wodArmMapPreviewSpinner('mpLobbyMapPreview');
            wodMpRenderGuestLobbyPreviewPlaceholder();
        }
    });
    addEventListener('wod-mp-LobbyPreview', (ev) => {
        let d = ev.detail || {};
        if(!d.payload) return;
        if(d.fp && !d.payload.fp) d.payload.fp = d.fp;
        wodMpPaintSyncedLobbyPreview(d.payload);
    });
    addEventListener('wod-mp-RoomMeta', (ev) => {
        let m = ev.detail && ev.detail.meta;
        if(m) {
            let prevFactionFp = wodMpLobbyFactionFingerprint(window.wodMpRoomMeta || {});
            let prevTerrainFp = wodMpLobbyTerrainFingerprint(window.wodMpRoomMeta || {});
            wodMpApplyRoomMeta(m);
            wodMpRenderGameLobbyScreen();
            if(wodMpIsLobbyPreviewHost()) {
                requestAnimationFrame(() => {
                    let terrainFp = wodMpLobbyTerrainFingerprint(m);
                    let factionFp = wodMpLobbyFactionFingerprint(m);
                    if(terrainFp === prevTerrainFp && factionFp === prevFactionFp) {
                        wodMpRefreshLobbyMapPreviewAfterMetaChange(m, { repaintOnly: true });
                        return;
                    }
                    wodMpRefreshLobbyMapPreviewAfterMetaChange(m, {
                        politicsOnly: terrainFp === prevTerrainFp && !!_wodMpLobbyPreviewLastTerrainFp
                    });
                });
            } else if(!wodMpGuestPreviewMatchesMeta(m)) {
                _wodMpGuestLobbyPreviewFp = '';
                wodArmMapPreviewSpinner('mpLobbyMapPreview');
                wodMpRenderGuestLobbyPreviewPlaceholder();
            }
        }
    });
    addEventListener('wod-mp-PlayerLinkLost', (ev) => {
        let slot = ev.detail && ev.detail.slot | 0;
        if(!gameData.mp || !gameData.mp.enabled || gameState !== 'PLAYING' || !slot) return;
        let grace = (ev.detail && ev.detail.graceMs) ? Math.round(ev.detail.graceMs / 1000) : 45;
        showNotification('Seat ' + slot + ' connection lost — ' + grace + 's to reconnect before AI takes over.');
    });
    addEventListener('wod-mp-PlayerForfeited',ev=>{if(gameData.mp?.enabled&&gameState==='PLAYING')wodMpApplyForfeitSlot(ev.detail.slot);});
    addEventListener('wod-mp-PlayerDisconnected', (ev) => {
        let slot = ev.detail && ev.detail.slot | 0;
        if(!gameData.mp || !gameData.mp.enabled || gameState !== 'PLAYING' || !slot) return;
        if(gameData.mp.isHost) wodMpHostMarkSlotDisconnected(slot);
        else {
            if(!gameData.mp.connectedSlots) gameData.mp.connectedSlots = (gameData.mp.humanSlots || []).slice();
            let i = gameData.mp.connectedSlots.indexOf(slot);
            if(i >= 0) gameData.mp.connectedSlots.splice(i, 1);
            if(!gameData.mp.aiControlledSlots) gameData.mp.aiControlledSlots = [];
            if(gameData.mp.aiControlledSlots.indexOf(slot) < 0) gameData.mp.aiControlledSlots.push(slot);
            showNotification('Seat ' + slot + ' disconnected — AI is controlling their forces.');
        }
    });
    addEventListener('wod-mp-PlayerReconnected', (ev) => {
        let slot = ev.detail && ev.detail.slot | 0;
        if(!gameData.mp || !gameData.mp.enabled || gameState !== 'PLAYING' || !slot) return;
        if(gameData.mp.isHost) wodMpHostMarkSlotReconnected(slot);
        else {
            if(!gameData.mp.connectedSlots) gameData.mp.connectedSlots = [];
            if(gameData.mp.connectedSlots.indexOf(slot) < 0) gameData.mp.connectedSlots.push(slot);
            if(gameData.mp.aiControlledSlots) {
                let ai = gameData.mp.aiControlledSlots.indexOf(slot);
                if(ai >= 0) gameData.mp.aiControlledSlots.splice(ai, 1);
            }
            if(slot === gameData.mp.localSlot)
                showNotification('Reconnected — you have control of your forces again.');
            else
                showNotification('Seat ' + slot + ' reconnected.');
        }
    });
    addEventListener('wod-mp-RejoinMatch', (ev) => wodMpOnRejoinMatch(ev));
    addEventListener('wod-mp-LeftLobby', () => {
        window.wodMpRoomMeta = {};
        _wodMpGuestLobbyPreviewFp = '';
        if(typeof wodMpClearLobbyPreviewDedupeState === 'function') wodMpClearLobbyPreviewDedupeState();
        wodMpRefreshMpPanelState();
        if(typeof WodMultiplayer !== 'undefined' && WodMultiplayer.api.socketOpen)
            WodMultiplayer.requestLobbyList();
    });
    addEventListener('wod-mp-Peers', (ev) => wodMpOnPeers(ev, st));
    addEventListener('wod-mp-SlotSync', () => {
        if(typeof WodMultiplayer === 'undefined') return;
        if(gameData && gameData.mp && gameData.mp.enabled && gameState === 'PLAYING') {
            gameData.mp.localSlot = WodMultiplayer.api.slot;
            gameData.mp.isHost = WodMultiplayer.api.isHost;
        }
        wodMpRefreshMpPanelState();
        if(WodMultiplayer.api && WodMultiplayer.api.code && gameState !== 'PLAYING') wodMpRenderGameLobbyScreen();
    });
    addEventListener('wod-mp-HostMigrated', (ev) => {
        if(typeof WodMultiplayer === 'undefined') return;
        let d = ev && ev.detail;
        let isHost = !!(d && d.isHost) || !!WodMultiplayer.api.isHost;
        if(gameData && gameData.mp && gameData.mp.enabled) {
            gameData.mp.isHost = isHost;
            gameData.mp.localSlot = WodMultiplayer.api.slot;
        }
        if(isHost && gameState === 'PLAYING')
            showNotification('You are now the match host.');
        else if(gameState === 'PLAYING' && d && d.slot)
            showNotification('Seat ' + d.slot + ' is now hosting the match.');
        wodMpRefreshMpPanelState();
    });
    addEventListener('wod-mp-HostTakeover', (ev) => {
        if(typeof WodMultiplayer === 'undefined') return;
        let d = ev && ev.detail;
        if(!d || gameState !== 'PLAYING' || !gameData.mp || !gameData.mp.enabled) return;
        gameData.mp.isHost = true;
        gameData.mp.localSlot = WodMultiplayer.api.slot;
        gameData.mp.allReady = true;
        if(d.snap && d.snap.payload) wodMpApplySnapPayload(d.snap.payload);
        wodMpEnsureLocalSlotConnected();
        wodMpHostEmitSnapshot();
        wodMpFreezeSeatPlayerMap();
        wodMpRefreshSyncOverlay();
        if(!gameData._campaignEnded&&!gameData._spectator?.finished)setGameSpeed(1, true);
        wodMpSaveSession();
        showNotification('You are now the host — the battle continues on your machine.');
    });
    addEventListener('wod-mp-MatchStart', (ev) => wodMpOnMatchStart(ev));
    addEventListener('wod-mp-MpResultDisputed', (ev) => {
        showNotification((ev.detail && ev.detail.msg) || 'The match result was disputed and not recorded.');
    });
    addEventListener('wod-mp-PlayerReady', (ev) => {
        if(!gameData.mp || !gameData.mp.enabled || !gameData.mp.isHost) return;
        let slot = ev.detail && ev.detail.slot != null ? (ev.detail.slot | 0) : 0;
        if(slot > 0) wodMpTryMarkReady(slot);
    });
    addEventListener('wod-mp-MatchGo', () => {
        if(!gameData.mp || !gameData.mp.enabled || gameData.mp.isHost) return;
        wodMpFinalizeMatchStart();
    });
    addEventListener('wod-mp-Snap', (ev) => {
        if(!gameData.mp || !gameData.mp.enabled || gameData.mp.isHost) return;
        if(ev.detail && ev.detail.payload) wodMpScheduleClientSnapApply(ev.detail.payload);
    });
    addEventListener('wod-mp-RemoteCmd', (ev) => wodMpHostHandleRemoteCmd(ev));
}
function wodMergeMpStatsMax(a, b) {
    let out = Object.assign({ gamesPlayed: 0, wins: 0, losses: 0 }, a || {});
    if(!b || typeof b !== 'object') return out;
    out.gamesPlayed = Math.max(out.gamesPlayed | 0, b.gamesPlayed | 0);
    out.wins = Math.max(out.wins | 0, b.wins | 0);
    out.losses = Math.max(out.losses | 0, b.losses | 0);
    return out;
}
function wodCaptureSoloPreviewSnapshot() {
    try {
        let hexList = wodDeepClonePlain(gameData.hexList || []);
        if(!hexList) return false;
        gameData._soloPreviewSnapshot = {
            fingerprint: wodComputeMapFingerprint(),
            mapRadius: gameData.mapRadius,
            mapShape: gameData.mapShape,
            aiCount: gameData._mapGenLockedAiCount != null ? gameData._mapGenLockedAiCount : gameData.aiCount,
            mapGenSeed: gameData._mapGenSeed || 0,
            citiesPerPlayer: wodCitiesPerPlayerSetting(),
            hexList: hexList,
            cities: wodDeepClonePlain(gameData.cities || []),
            roads: wodDeepClonePlain(gameData.roads || []),
            entities: wodDeepClonePlain(gameData.entities || []),
            camera: wodDeepClonePlain(gameData.camera || { x: 0, y: 0, zoom: 0.5 }),
            citySplitAnglePhase: gameData._wodCitySplitAnglePhase,
        };
        return true;
    } catch(e) {
        console.warn(e);
        gameData._soloPreviewSnapshot = null;
        return false;
    }
}
function wodRestoreSoloPreviewSnapshot(newRadius, requestedShape) {
    let snap = gameData._soloPreviewSnapshot;
    if(!snap) return false;
    if(!wodSoloSnapshotValidForMatchStart(snap)) return false;
    if(snap.mapRadius !== newRadius || snap.mapShape !== requestedShape) return false;
    if(snap.aiCount != null && snap.aiCount !== gameData.aiCount) return false;
    // The preview was made for another towns-per-player setting: generate again.
    if(snap.citiesPerPlayer != null && snap.citiesPerPlayer !== wodCitiesPerPlayerSetting()) return false;

    gameData.mapRadius = snap.mapRadius;
    gameData.mapShape = snap.mapShape;
    gameData.loadedCustomMap = false;
    gameData._mapGenSeed = snap.mapGenSeed || gameData._mapGenSeed;
    gameData._lastMapFingerprint = wodComputeMapFingerprint(snap.mapRadius, snap.mapShape, snap.aiCount);
    gameData._wodCitySplitAnglePhase = snap.citySplitAnglePhase;
    gameData.hexList = wodDeepClonePlain(snap.hexList);
    gameData.hexes = {};
    for(let h of gameData.hexList) gameData.hexes[`${h.q},${h.r}`] = h;
    gameData.cities = wodDeepClonePlain(snap.cities);
    gameData.roads = wodDeepClonePlain(snap.roads);
    gameData.entities = wodDeepClonePlain(snap.entities);
    wodRelinkSnapshotRoads();

    let startMoney = parseInt(document.getElementById('setupMoney').value, 10) || 10000;
    let owners = wodOwnersListActiveForProcgen();
    let locO = (!gameData.mp || !gameData.mp.enabled) ? 1 : (gameData.mp.localSlot || 1);
    gameData.money = startMoney;
    gameData.manpower = 5000;
    gameData.aiMoneyByOwner = {};
    gameData.aiManpowerByOwner = {};
    for(let owner of owners) {
        gameData.aiMoneyByOwner[owner] = owner === locO ? 0 : startMoney;
        gameData.aiManpowerByOwner[owner] = owner === locO ? 0 : 5000;
    }
    gameData._landIncomeCacheDirty = true;
    gameData._wodProcgenBorderFirstApplied = true;
    wodMarkTerrainFullDirty();
    return true;
}
function wodRelinkSnapshotRoads() {
    let byId = {};
    let byQr = {};
    for(let c of gameData.cities || []) {
        if(!c) continue;
        if(c.id) byId[c.id] = c;
        byQr[c.q + ',' + c.r] = c;
    }
    for(let r of gameData.roads || []) {
        if(!r) continue;
        let from = r.from, to = r.to;
        if(from) r.from = (from.id && byId[from.id]) || byQr[from.q + ',' + from.r] || from;
        if(to) r.to = (to.id && byId[to.id]) || byQr[to.q + ',' + to.r] || to;
    }
}
function wodSoloSnapshotValidForMatchStart(snap) {
    if(!snap || !snap.hexList || !snap.hexList.length) return false;
    let owners = new Set();
    for(let c of snap.cities || []) {
        if(c && c.owner > 0) owners.add(c.owner);
    }
    if(owners.size === 0) {
        for(let h of snap.hexList) {
            if(h && h.owner > 0) owners.add(h.owner);
        }
    }
    if(!owners.has(1)) return false;
    if(owners.has(3) && owners.has(4) && !owners.has(2)) return false;
    return true;
}
function wodSnapshotMenuTerrain() {
    menuTerrainSnap = {
        base: wodCloneCanvas(terrainBaseCanvas),
        composite: wodCloneCanvas(terrainCanvas),
        overlay: wodCloneCanvas(territoryOverlayCanvas),
        borders: wodCloneCanvas(wodBorderLayerCanvas),
        bounds: { minX: terrainBounds.minX, maxX: terrainBounds.maxX, minY: terrainBounds.minY, maxY: terrainBounds.maxY }
    };
}
function wodDevActivitySnapshot() {
    let now = performance.now();
    let rows = [];
    for(let i = 0; i < wodDevActivityOrder.length; i++) {
        let name = wodDevActivityOrder[i];
        let slot = wodDevActivity[name];
        if(!slot) continue;
        let age = now - (slot.last || 0);
        if(age > 4000 && name !== 'gameLoop') continue;
        rows.push({ name, count: slot.count | 0, ageMs: Math.round(age) });
    }
    rows.sort((a, b) => a.ageMs - b.ageMs);
    return rows.slice(0, 14);
}
