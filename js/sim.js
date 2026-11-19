// The simulation step (update) and the frame loop (gameLoop).
// Part of the game script; loaded by index.html in a fixed order (see the list there).

function update(dt) {
    gameData._aiEconomyClock = (gameData._aiEconomyClock || 0) + dt;
    gameData.cityCombatBlockForProd = gameData._cityCombatStagingKeys instanceof Set ? gameData._cityCombatStagingKeys : new Set();
    gameData._cityCombatStagingKeys = new Set();
    wodUpdateConstruction(dt);
    if(!gameData._wodPfFrameActive)wodBeginSimPfBudget(gameData.entities.length);
    wodStepAiDefenseWork();
    wodDrainAiMoveQueue();
    wodStepTradeConvoySpawns();
    wodStepBridgeRouteRefresh();
    wodRefreshCombatCamBounds();
    let movingN = 0;
    let playerMovingN = 0;
    for(let mi = 0, ml = gameData.entities.length; mi < ml; mi++) {
        let mu = gameData.entities[mi];
        if(mu && mu.hp > 0 && mu.target) {
            movingN++;
            if(wodMpIsHumanOwner(mu.owner)) playerMovingN++;
        }
    }
    gameData._wodMovingN = movingN;
    gameData._wodPlayerMovingN = playerMovingN;
    if((gameData._wodPrevPlayerMovingN || 0) > 0 && playerMovingN === 0) {
        gameData._terrDirtyPending = false;
        gameData._terrDirtyNext = 0;
        wodTerrainPoliticalDirty = true;
        terrainNeedsUpdate = true;
        wodTerrainPolWork = null;
    }
    gameData._wodPrevPlayerMovingN = playerMovingN;
    gameData._combatShotBudget = WOD_COMBAT_SHOTS_PER_FRAME;
    let entN = gameData.entities.length;
    if(touchCamGesture) gameData._combatShotBudget = 0;
    else if(entN > 220) gameData._combatShotBudget = 10;
    else if(entN > 140) gameData._combatShotBudget = 14;
    wodUpdateCombatFx(dt);
    if(wodPlayerOrderQueue.length && !wodPlayerOrderPumpScheduled) wodSchedulePlayerOrderPump();
    if(gameState === 'PLAYING') {wodRefreshFogVision(dt);if(!gameData.menuAttractMode){const ledger=wodBattleLedger();ledger.seconds+=Math.max(0,dt);if(gameData.speed>0)ledger.activeSeconds=(ledger.activeSeconds||0)+Math.max(0,dt)/gameData.speed;}}

    const { incomeTick, upkeepByOwner, netMoney } = wodStepPlayerEconomy(dt);
    const { aiCitiesByOwner, aiIncomeByOwner, playerBrokeByOwner } = wodStepAiEconomy(dt, incomeTick, upkeepByOwner, netMoney);
    wodStepAiSpawnAndGuards(dt, upkeepByOwner, aiCitiesByOwner, aiIncomeByOwner);

    // Unit Collision (Separation) — grid built first; separation runs after movement below.
    gameData._wodSimTick = (gameData._wodSimTick | 0) + 1;
    let wodHeavyEnts = gameData.entities.length > 160;
    let wodMob = wodUsesVisualViewportLayout();
    let wodSkipSep = wodMob && wodHeavyEnts && (gameData._wodSimTick % 2 === 0);
    let sepPad = wodMob && wodHeavyEnts ? 32 : 42;
    let gridCell = wodMob ? 120 : 96;
    for(let ui = 0; ui < gameData.entities.length; ui++) {
        let u = gameData.entities[ui];
        if(!u || u.hp <= 0 || wodIsNavalUnit(u) || u.target) continue;
        let terrainCheckStride = wodHeavyEnts ? 5 : 3;
        if(((ui + gameData._wodSimTick) % terrainCheckStride) !== 0) continue;
        let hh = getNearestHexToPoint(u.x, u.y);
        if(!hh || !canUnitEnterHex(u, hh)) ensureUnitPixelOnWalkableHex(u, 28);
    }
    gameData.unitSpatialGrid = buildUnitSpatialGrid(gridCell);
    wodRebuildHexCombatOccupancy();
    if(!gameData.citySpatialGrid || !gameData.citySpatialGrid.cells)
        gameData.citySpatialGrid = buildCitySpatialGrid(wodMob ? 280 : 260);

    wodStepTradeConvoys(dt);

    // Units
    wodUpdateTransports(dt);
    wodStepAiBridgeSearches();
    updateAiStrategy(dt);
    if(!gameData.mp?.enabled||gameData.mp.isHost)wodAiSweepTownCells(dt);
    if(!gameData.mp || !gameData.mp.enabled || gameData.mp.isHost) updateEncirclements(dt);

    let wodMobHexClaimBatch = !batchHexOwner;
    let wodSavedBatchHexOwner = batchHexOwner;
    let wodSavedBatchHexOwnerDirty = batchHexOwnerDirty;
    if(wodMobHexClaimBatch) {
        batchHexOwner = true;
        batchHexOwnerDirty = false;
    }
    gameData._wodClaimBatch = new Map();

    wodStepUnits(dt, playerBrokeByOwner);

    // Rebuild grid after movement so separation / late queries see current positions.
    gameData.unitSpatialGrid = buildUnitSpatialGrid(gridCell);
    wodRunUnitSeparation(wodSkipSep, sepPad, gridCell);
    wodRebuildHexCombatOccupancy();

    wodApplyTerritoryClaimBatch();
    wodCleanupTinyTerritoryPockets();
    wodUpdateWaterPolitics();
    gameData._cityCapTimer = (gameData._cityCapTimer || 0) + dt;
    if(gameData._cityCapTimer >= WOD_CITY_CAPTURE_EVAL_INTERVAL) {
        gameData._cityCapTimer = 0;
        wodEvaluateAllCityCaptures();
    }

    if(wodMobHexClaimBatch) {
        let changedOwners = batchHexOwnerDirty;
        batchHexOwner = wodSavedBatchHexOwner;
        batchHexOwnerDirty = wodSavedBatchHexOwnerDirty || (wodSavedBatchHexOwner && changedOwners);
        if(changedOwners && !batchHexOwner) wodMarkTerrainPoliticalDirty();
    }

    if(gameData._uiTroopCache === undefined) {
        let loHudSim = wodLocalPlayerOwner();
        gameData._uiTroopCache = getOwnerTroopManpower(loHudSim);
        gameData._uiTankCache = getOwnerTanks(loHudSim);
        gameData._uiShipCache = getOwnerShipCount(loHudSim);
    } else {
        wodMobileUiStatTimer += dt;
        let hudEvery = wodUsesVisualViewportLayout() ? 0.22 : 0.2;
        if((gameData._wodPlayerMovingN || 0) > 0) hudEvery = Math.max(hudEvery, 0.38);
        if(wodMobileUiStatTimer >= hudEvery) {
            wodMobileUiStatTimer = 0;
            let loHudSim = wodLocalPlayerOwner();
            gameData._uiTroopCache = getOwnerTroopManpower(loHudSim);
            gameData._uiTankCache = getOwnerTanks(loHudSim);
            gameData._uiShipCache = getOwnerShipCount(loHudSim);
        }
    }
    wodSyncFortOwnershipFromTerrain();
    checkCampaignEndConditions(dt);
    wodUpdateMissionEvents(dt);
    if(gameData.mp && gameData.mp.enabled && gameData.mp.isHost) {
        gameData._mpSnapAcc = (gameData._mpSnapAcc || 0) + dt;
        let hexN = (gameData.hexList && gameData.hexList.length) || 0;
        let entN = (gameData.entities && gameData.entities.length) || 0;
        let snapEvery = hexN > 12000 ? 0.18 : (hexN > 8000 ? 0.14 : 0.1);
        if(entN > 350) snapEvery += 0.04;
        if(gameData._mpSnapAcc >= snapEvery) {
            gameData._mpSnapAcc = 0;
            wodMpHostEmitSnapshot();
        }
    }
}

/** Player income, upkeep and lifetime peaks for this step. */
function wodStepPlayerEconomy(dt) {
    let incomeTick = getOwnerIncome(1);
    let manpowerTick = 0;
    for(let ci = 0, cl = gameData.cities.length; ci < cl; ci++) {
        let city = gameData.cities[ci];
        if(city.owner !== 1) continue;
        manpowerTick += getCityManpowerIncome(city);
    }
    let upkeepByOwner = {};
    for(let ei = 0, elen = gameData.entities.length; ei < elen; ei++) {
        let u = gameData.entities[ei];
        if(u.hp <= 0) continue;
        let ow = u.owner;
        let up = getUnitUpkeep(u);
        upkeepByOwner[ow] = (upkeepByOwner[ow] || 0) + up;
    }
    let expensesTick = upkeepByOwner[1] || 0;
    gameData.income = incomeTick;
    gameData.expenses = expensesTick;
    gameData.manpowerIncome = manpowerTick;
    let netMoney = gameData.income - gameData.expenses;
    gameData.money = Math.max(0, gameData.money + (netMoney * dt));
    gameData.manpower = Math.max(0, (gameData.manpower || 0) + manpowerTick * dt);
    if(wodProgress && !gameData.menuAttractMode && gameState === 'PLAYING') {
        let dirty = false;
        let fielded = gameData._uiTroopCache;
        if(fielded === undefined || wodLocalPlayerOwner()!==1) fielded = getOwnerTroopManpower(wodLocalPlayerOwner());
        if(fielded > (wodProgress.lifetime.peakFieldManpower || 0)) {
            wodBumpLifetimeMax('peakFieldManpower', fielded);
            dirty = true;
        }
        let cash = Math.floor(wodHudMoney());
        if(cash > (wodProgress.lifetime.peakMoneyHeld || 0)) {
            wodBumpLifetimeMax('peakMoneyHeld', cash);
            dirty = true;
        }
        if(dirty) {
            checkWodAchievements();
            scheduleSaveWodProgress();
        }
    }
    return { incomeTick, upkeepByOwner, netMoney };
}

/** AI money and manpower, who cannot pay upkeep, and session income totals. */
function wodStepAiEconomy(dt, incomeTick, upkeepByOwner, netMoney) {
    if(!gameData.aiMoneyByOwner || typeof gameData.aiMoneyByOwner !== 'object') gameData.aiMoneyByOwner = {};
    if(!gameData.aiManpowerByOwner || typeof gameData.aiManpowerByOwner !== 'object') gameData.aiManpowerByOwner = {};
    let aiCitiesByOwner = {};
    let aiIncomeByOwner = {};
    let aiManpowerIncomeByOwner = {};
    for(let city of gameData.cities) {
        if(city.owner > 1) {
            if(!aiCitiesByOwner[city.owner]) {
                aiCitiesByOwner[city.owner] = [];
                aiIncomeByOwner[city.owner] = 0;
                aiManpowerIncomeByOwner[city.owner] = 0;
            }
            aiManpowerIncomeByOwner[city.owner] += getCityManpowerIncome(city);
            aiCitiesByOwner[city.owner].push(city);
        }
    }
    for(let owner in aiCitiesByOwner) aiIncomeByOwner[owner] = getOwnerIncome(parseInt(owner, 10));
    for(let owner in aiCitiesByOwner) {
        if(gameData.aiMoneyByOwner[owner] === undefined) gameData.aiMoneyByOwner[owner] = 1000;
        if(gameData.aiManpowerByOwner[owner] === undefined) gameData.aiManpowerByOwner[owner] = 5000;
        gameData.aiMoneyByOwner[owner] = Math.max(0, gameData.aiMoneyByOwner[owner] + (aiIncomeByOwner[owner] - (upkeepByOwner[parseInt(owner)] || 0)) * dt);
        gameData.aiManpowerByOwner[owner] = Math.max(0, gameData.aiManpowerByOwner[owner] + (aiManpowerIncomeByOwner[owner] || 0) * dt);
    }

    let playerBrokeByOwner = { 1: gameData.money <= 0 && netMoney < 0 };
    if(gameData.mp && gameData.mp.enabled && gameData.mp.humanSlots) {
        for(let o of gameData.mp.humanSlots) {
            if(o === 1) continue;
            let inc = aiIncomeByOwner[o] || 0;
            let exp = upkeepByOwner[o] || 0;
            let net = inc - exp;
            let bal = gameData.aiMoneyByOwner[o] || 0;
            playerBrokeByOwner[o] = bal <= 0 && net < 0;
        }
    }
    // The same rule for computer factions: out of money and still paying more upkeep than comes in, their
    // troops go unpaid too.
    for(let o in gameData.aiMoneyByOwner) {
        if(playerBrokeByOwner[o] != null) continue;
        playerBrokeByOwner[o] = (gameData.aiMoneyByOwner[o] || 0) <= 0 && (aiIncomeByOwner[o] || 0) - (upkeepByOwner[parseInt(o, 10)] || 0) < 0;
    }

    if(gameState === 'PLAYING' && !gameData.menuAttractMode && !gameData._campaignEnded) {
        if(!gameData._sessionIncomeAcc) gameData._sessionIncomeAcc = { player: 0, ai: 0, byOwner: {} };
        if(!gameData._sessionIncomeAcc.byOwner) gameData._sessionIncomeAcc.byOwner = {};
        if(gameData.mp && gameData.mp.enabled) {
            let ownersSeen = new Set();
            for(let ci = 0, cl = gameData.cities.length; ci < cl; ci++) {
                let ow = gameData.cities[ci].owner;
                if(ow > 0) ownersSeen.add(ow);
            }
            // Owners of land, from the land-income tile counts rather than a scan of every cell each step.
            getOwnerLandIncome(0);
            for(let k in gameData._landIncomeCache) if(+k > 0) ownersSeen.add(+k);
            for(let ow of ownersSeen) {
                let inc = getOwnerIncome(ow) * dt;
                gameData._sessionIncomeAcc.byOwner[ow] = (gameData._sessionIncomeAcc.byOwner[ow] || 0) + inc;
            }
        } else {
            gameData._sessionIncomeAcc.player += incomeTick * dt;
            gameData._sessionIncomeAcc.byOwner[1] = (gameData._sessionIncomeAcc.byOwner[1] || 0) + incomeTick * dt;
            let aiGross = 0;
            for(let k in aiIncomeByOwner) {
                let v = aiIncomeByOwner[k] || 0;
                aiGross += v;
                let ow = parseInt(k, 10);
                if(ow > 1) gameData._sessionIncomeAcc.byOwner[ow] = (gameData._sessionIncomeAcc.byOwner[ow] || 0) + v * dt;
            }
            gameData._sessionIncomeAcc.ai += aiGross * dt;
        }
    }
    return { aiCitiesByOwner, aiIncomeByOwner, playerBrokeByOwner };
}

/** AI recruitment bursts and fort guard posting. */
function wodStepAiSpawnAndGuards(dt, upkeepByOwner, aiCitiesByOwner, aiIncomeByOwner) {
    if(!gameData.aiTimer) gameData.aiTimer = Math.random() * 0.85;
    let aiBurstEvery = 2.35;
    if(!gameData._aiSpawnBurst) {
        gameData.aiTimer += dt;
        if(gameData.aiTimer > aiBurstEvery) {
            gameData.aiTimer = 0;
            let keys = Object.keys(aiCitiesByOwner).filter(k => !wodMpIsHumanOwner(parseInt(k, 10)));
            if(keys.length > 0) gameData._aiSpawnBurst = { keys, idx: 0 };
        }
    }
    if(gameData._aiSpawnBurst && gameData._aiSpawnBurst.keys.length) {
        let b = gameData._aiSpawnBurst;
        if(b.idx >= b.keys.length) {
            gameData._aiSpawnBurst = null;
            gameData._aiSpawnPulse = null;
        } else {
            let ownerKey = b.keys[b.idx];
            if(wodRunAiSpawnBurstForOwner(ownerKey, aiCitiesByOwner, aiIncomeByOwner, upkeepByOwner) !== false)
                b.idx++;
        }
    }

    if(!gameData._aiFortGuardTimer) gameData._aiFortGuardTimer = 0;
    gameData._aiFortGuardTimer += dt;
    if(gameData._aiFortGuardTimer > 6.5) {
        gameData._aiFortGuardTimer = 0;
        if(!gameData._aiFortGuardOwners) {
            gameData._aiFortGuardOwners = [];
            let seen = new Set();
            let forts = gameData.forts;
            if(forts) {
                for(let fi = 0, fl = forts.length; fi < fl; fi++) {
                    let ft = forts[fi];
                    if(ft && ft.owner > 1 && !wodMpIsHumanOwner(ft.owner)) seen.add(ft.owner);
                }
            }
            gameData._aiFortGuardOwners = [...seen];
        }
        if(gameData._aiFortGuardOwners.length) {
            let o = gameData._aiFortGuardOwners.shift();
            wodAiMaintainFortGuards(o);
            gameData._aiFortGuardOwners.push(o);
        } else {
            gameData._aiFortGuardOwners = null;
        }
    }
}

/** Trade convoys: spawning and routes between towns. */
function wodStepTradeConvoys(dt) {
    if(!gameData.menuAttractMode) {
        if(!gameData.tradeTimer) gameData.tradeTimer = 0;
        gameData.tradeTimer += dt;
        if(gameData.tradeTimer > 22) {
            gameData.tradeTimer = 0;
            if(gameData.mp && gameData.mp.enabled && gameData.mp.humanSlots) {
                for(let o of gameData.mp.humanSlots) {
                    let pCities = gameData.cities.filter(c => c.owner === o);
                    if(pCities.length > 1) trySpawnTradeConvoysForOwner(o);
                }
            } else {
                let pCities = gameData.cities.filter(c => c.owner === 1);
                if(pCities.length > 1) trySpawnTradeConvoysForOwner(1);
            }
            let aiOwners = new Set();
            for(let c of gameData.cities) {
                if(c.owner > 1) aiOwners.add(c.owner);
            }
            for(let o of aiOwners) {
                if(wodMpIsHumanOwner(o)) continue;
                if(Math.random() < 0.32) trySpawnTradeConvoysForOwner(o);
            }
        }
    }
}

/** Every unit, last to first (dead units are swapped out of the list as they are found). */
function wodStepUnits(dt, playerBrokeByOwner) {
    for (let i = gameData.entities.length - 1; i >= 0; i--) {
        let unit = gameData.entities[i];
        ensureUnitId(unit);
        if (unit.hp <= 0) {
            wodRemoveDeadUnitAt(unit, i);
            continue;
        }
        wodStepUnit(unit, i, dt, playerBrokeByOwner);
    }
}

/** Books a dead unit's losses, clears it from the selection and swaps it out of the entity list. */
function wodRemoveDeadUnitAt(unit, i) {
    // (a disbanded unit, wodDisbandUnit, sent its men home: no casualties)
    if(unit.type !== 'convoy' && !unit._disbanded && (unit.manpower || 0) > 0) {
        addCasualties(unit.owner, unit.manpower, 0, unit.type === 'marine' ? 'marine' : 'light');
        if(unit.type === 'heavy' && (unit.tanks || 0) > 0) addTankCasualties(unit.owner, unit.tanks);
    }
    unit.target = null;
    unit.path = null;
    unit.orderTarget = null;
    // Drop dead units from the current selection so the info card count updates.
    if(unit.selected || (gameData.selection && gameData.selection.indexOf(unit) >= 0)) {
        unit.selected = false;
        if(gameData.selection && gameData.selection.length) {
            gameData.selection = gameData.selection.filter(s => s && s !== unit && !(s.hp !== undefined && !s.id && s.hp <= 0));
            _infoCardUiThrottle.s = null;
        }
    }
    // Swap-and-pop: O(1) vs splice O(n) during mass casualties.
    let last = gameData.entities.length - 1;
    if(i !== last) {
        gameData.entities[i] = gameData.entities[last];
        if(gameData.entities[i]) gameData.entities[i]._gridIndex = i;
    }
    gameData.entities.pop();
}

/** One living unit's step: morale, movement, convoy capture, combat, terrain, supply, healing and ground claims. */
function wodStepUnit(unit, i, dt, playerBrokeByOwner) {

    wodResumeTrafficYield(unit);
    if(unit.type==='convoy'){
        const destination=unit.convoyToKey&&gameData.cities.find(c=>convoyCityKey(c)===unit.convoyToKey);
        if(unit.convoyToKey&&(!destination||destination.owner!==unit.owner||unit.convoySeaRoute&&!destination.hasHarbor)||
            !unit.target&&(gameData._aiEconomyClock||0)>=(unit._convoyRetryAt||0))rerouteConvoyAfterOwnerChange(unit,unit.convoyFromKey);
    }
    const startHex=getNearestHexToPoint(unit.x,unit.y);
    const startedInWater=wodUnitInUnsuppliedWater(unit,startHex),startedUnsupplied=!!wodGetUnitEncirclementState(unit,startHex);
    // Decrease combat visuals
    unit.activeCombatVisual = Math.max(0, (unit.activeCombatVisual || 0) - dt);
    if(unit.spawnFx > 0) unit.spawnFx = Math.max(0, unit.spawnFx - dt);
    wodUpdateUnitOverheadPops(unit, dt);

    wodUpdateUnitMorale(unit,dt);
    wodVesselEvade(unit);
    wodWadeAshoreIfIdle(unit,dt);
    wodUpdateUnitAttackOrder(unit);

    // Movement
    moveUnitTowardTarget(unit, dt);
    if(unit.type==='convoy'&&unit.hp<=0)return;

    wodStepConvoyCapture(unit, dt);

    wodStepUnitCombat(unit, dt);

    if(unit.owner > 1 && !wodMpIsHumanOwner(unit.owner) && !unit.target && unit.type !== 'convoy' && !wodIsNavalUnit(unit) && !unit.moraleBroken && !unit.retreating) {
        unit.aiFormationSerial = -1;
    }

    applyTerrainUnitEffects(unit, dt);

    let currentHex = getNearestHexToPoint(unit.x, unit.y);
    let encState = wodGetUnitEncirclementState(unit, currentHex);
    const attritionDt=wodAdvanceSupplyExposure(unit,startedUnsupplied?dt:0,encState);
    wodAdvanceWaterExposure(unit,startedInWater?dt:0,currentHex);
    if(encState) {
        let encRate = 0.035;
        if(encState.relief) encRate *= 0.5;
        applyDamage(unit, unit.maxHp * encRate * attritionDt, 0, encState.water?'water':'supply');
    }
    unit.encircledFlash = encState&&unit.supplyPendingSeconds>=WOD_SUPPLY_CONFIRM_SECONDS ? 0.35 : 0;

    if(playerBrokeByOwner[unit.owner] && unit.type !== 'convoy') {
        applyDamage(unit, unit.maxHp * 0.025 * dt, 0,'unpaid');
        unit.unpaidFlash = 0.35;
    } else if(unit.unpaidFlash) {
        unit.unpaidFlash = Math.max(0, unit.unpaidFlash - dt);
    }

    updateUnitHealing(unit, dt);
    wodUpdateRecoveredRetreat(unit, dt);
    // Moving units cross tiles between claim ticks, and a pocket that surrenders flips the
    // tiles under the troops inside it: put the unit's own tile right every tick.
    if(currentHex && currentHex.owner !== unit.owner) wodClaimStandingTile(unit, currentHex);
    // Stagger idle claims; fighting units still claim every 4th tick.
    let claimTick = gameData._wodSimTick | 0;
    let claimStride = gameData.entities.length > 220 ? 5 : (gameData.entities.length > 120 ? 4 : 3);
    if(!unit.target) {
        if(((unit._gridIndex || i) + claimTick) % claimStride === 0)
            claimTerritoryAroundUnit(unit);
    } else if((unit.activeCombatVisual || 0) > 0.25 && (claimTick & 3) === 0) {
        // Attackers wedged in a firefight never cross a tile boundary, so the
        // hex-crossing claim path never fires — the frontline looked frozen even
        // though the push was working. Claim around fighting units too.
        claimTerritoryAroundUnit(unit);
    }
}

/** A convoy that an armed enemy reaches changes hands and heads for its new owner's towns. */
function wodStepConvoyCapture(unit, dt) {
    if(unit.type === 'convoy') {
        if((unit.convoyCaptureCd || 0) > 0) unit.convoyCaptureCd = Math.max(0, unit.convoyCaptureCd - dt);
        if((unit.convoyCaptureCd || 0) <= 0) {
            let captor = null;
            let capDist = (unit.radius || 6) + 22;
            let capDist2 = capDist * capDist;
            forEachNearbyUnit(gameData.unitSpatialGrid, unit.x, unit.y, capDist + 48, (other) => {
                if(captor || !wodIsHostileOwner(other.owner, unit.owner) || other.type === 'convoy' || other.hp <= 0) return;
                if(wodIsNavalUnit(other) && !unit.convoySeaRoute) return;
                if((other.damage || 0) <= 0) return;
                let dx = other.x - unit.x;
                let dy = other.y - unit.y;
                if(dx * dx + dy * dy < capDist2) {
                    captor = other;
                    return true;
                }
            });
            if(captor) {
                let prevConvOwner = unit.owner;
                unit.owner = captor.owner;
                unit.name = "Captured " + generateUnitName('convoy', !!unit.convoySeaRoute, unit.owner);
                if(prevConvOwner>0&&prevConvOwner!==captor.owner)wodRecordOwnerLifetime(captor.owner,'convoysCaptured',1);
                let ownedCities = gameData.cities.filter(city => city.owner === unit.owner);
                let staging = null;
                let best = Infinity;
                for(let city of ownedCities) {
                    let dx = city.x - unit.x;
                    let dy = city.y - unit.y;
                    let d = dx * dx + dy * dy;
                    if(d < best) {
                        best = d;
                        staging = city;
                    }
                }
                if(staging) {
                    let sk = convoyCityKey(staging);
                    unit.convoyFromKey = sk;
                    let otherCities = ownedCities.filter(c => convoyCityKey(c) !== sk);
                    if(otherCities.length > 0)
                        rerouteConvoyAfterOwnerChange(unit, sk);
                    else {
                        unit.orderTarget = null;
                        unit.path = null;
                        unit.target = null;
                    }
                }
                unit.convoyCaptureCd = 0.55;
            }
        }
    }
}

/** Fire at the enemy in range (damage, experience, shot effects), or reset the shot timer. */
function wodStepUnitCombat(unit, dt) {
    // Combat — reuse proximity scan from movement slowdown when available.
    if(unit.retreating&&!unit.moraleBroken&&!unit.target)wodClearRetreatOnArrival(unit);
    if((unit._combatProxTick | 0) !== (gameData._wodSimTick | 0))
        wodRefreshUnitCombatProximity(unit, gameData.unitSpatialGrid);
    let enemy = unit._combatEnemy || null;

    unit.combatTargetUid=null;
    // Returning fire never changes the retreat destination or starts
    // pursuit. Routed troops retain their existing morale penalty.
    if(enemy && enemy.hp>0 && unit.damage > 0) {
        ensureUnitId(enemy);unit.combatTargetUid=enemy.uid;
        if(isLandArmyUnit(unit)){unit._aiLastCombatUid=enemy.uid;unit._aiLastCombatAt=wodAiOperationTime();}
        const modifiers=wodCombatModifiers(unit,enemy),attackerHex=modifiers.from,defenderHex=modifiers.to;
        const atkMod=modifiers.attack,defMod=modifiers.cover;
        unit._combatHex=attackerHex;enemy._combatHex=defenderHex;
        unit._combatAtkMod=atkMod;enemy._combatDefMod=defMod;
        let m = unit.morale != null ? unit.morale : WOD_MORALE_MAX;
        let moraleAtk = 0.18 + 0.82 * Math.max(0, Math.min(1, m / WOD_MORALE_MAX));
        let interval = unit.attackCooldown * WOD_ATTACK_INTERVAL_MULT / wodGeneralStatMultiplier(unit);
        if(interval < 0.05) interval = 0.05;
        let shotInterval = wodCombatShotVisualInterval(unit);
        let meanRng = 0.95;
        let dmgPerSec = (unit.damage * atkMod * defMod * meanRng * moraleAtk * wodVeteranStatMult(unit)) / interval;
        let prevEnemyTanks = enemy.type === 'heavy' ? (enemy.tanks || 0) : 0;
        let dealtCas = applyDamage(enemy, dmgPerSec * dt * wodFortDefenseDamageMultiplier(enemy)*modifiers.command, unit.owner);
        if(enemy.type === 'heavy' && unit.type !== 'convoy') {
            let tk = Math.max(0, prevEnemyTanks - (enemy.tanks || 0));
            if(tk > 0) unit.tankKills = (unit.tankKills || 0) + tk;
        }
        wodGrantUnitCombatXp(unit, dealtCas, dmgPerSec * dt);
        wodStagingMarkCombatOnCityUrbanTile(unit, enemy);
        if(unit._combatShotTimer == null) {
            unit._combatShotTimer = wodCombatShotPhase(unit) * shotInterval * 1.35;
        }
        if(unit._combatShotSlot == null) unit._combatShotSlot = (wodCombatShotPhase(unit) * 5) | 0;
        unit._combatShotTimer += dt;
        let shotCap = 1;
        let canEmitThisFrame = (unit._combatShotSlot % 5) === (gameData._wodSimTick % 5);
        while(canEmitThisFrame && unit._combatShotTimer >= shotInterval && shotCap-- > 0 && (gameData._combatShotBudget || 0) > 0) {
            unit._combatShotTimer -= shotInterval;
            wodEmitCombatShot(unit, enemy);
            gameData._combatShotBudget--;
        }
        unit.activeCombatVisual = Math.min(1, (unit.activeCombatVisual || 0) + dt * 2.2);
        enemy.activeCombatVisual = Math.min(1, (enemy.activeCombatVisual || 0) + dt * 2.2);
    } else {
        unit._combatShotTimer = null;
    }
}
let wodDrawHexSet = null;
let wodSuppressTerrainBake = false;
let wodEditorPatchCanvas = null;
let wodEditorPatchCtx = null;
let wodBorderLayerCanvas = null;
let wodBorderLayerCtx = null;
let wodEditorBordersDirty = false;
let wodEditorOverlayDirty = false;
let territoryOverlayCanvas = null;
let terrainBounds = {minX: 0, maxX: 0, minY: 0, maxY: 0};
let terrainNeedsUpdate = true;
let wodTerrainBakeNextMs = 0;
let wodTerrainPoliticalDirty = true;
let wodTerrainNeedFullRebuild = true;
let wodTerrainBaseBuilt = false;
let wodTerrainLastBakeCostMs = 0;
let wodTerrainPolWork = null;
// A frame that throws is reported and the next frame is still scheduled, so one bad frame cannot
// freeze the match. gameLoopFrame schedules the next frame itself on every normal path.
function gameLoop(time) {
    try {
        gameLoopFrame(time);
    } catch (err) {
        gameData._wodPfFrameActive = false;
        wodReportRuntimeError(err, 'frame');
        animationFrameId = requestAnimationFrame(gameLoop);
    }
}
function gameLoopFrame(time) {
    if (gameState !== 'PLAYING') return;
    if (typeof document !== 'undefined' && document.hidden) {
        lastTime = time;
        animationFrameId = requestAnimationFrame(gameLoop);
        return;
    }
    let dt = (time - lastTime) / 1000;
    // Tighter cap while armies are marching so popup/lag spikes never dump a
    // huge catch-up burst into unit positions.
    let dtCap = (gameData._wodPlayerMovingN || 0) > 0 || (gameData._wodMovingN || 0) > 40
        ? 0.05 : 0.08;
    if (dt > dtCap) dt = dtCap;
    lastTime = time;
    wodDevNoteFrame(time, dt);
    let mpWaiting = gameData.mp && gameData.mp.enabled && !wodMpMatchCanPlay();
    if(gameData.mp && gameData.mp.enabled && !gameData.mp.isHost) {
        let simDt = dt * (gameData.speed || 0);
        gameData._frameSimDt = simDt > 0 ? simDt : (1 / 60);
        if(UI.escMenu.classList.contains('hidden'))
            updateCamera(dt);
        gameData._mpClientHudAcc = (gameData._mpClientHudAcc || 0) + dt;
        if(gameData._mpClientHudAcc >= 0.22) {
            gameData._mpClientHudAcc = 0;
            let lo = wodLocalPlayerOwner();
            gameData._uiTroopCache = getOwnerTroopManpower(lo);
            gameData._uiTankCache = getOwnerTanks(lo);
            gameData._uiShipCache = getOwnerShipCount(lo);
        }
        gameData._mpClientMoveScanAcc = (gameData._mpClientMoveScanAcc || 0) + dt;
        if(gameData._mpClientMoveScanAcc >= 0.15) {
            gameData._mpClientMoveScanAcc = 0;
            let mn = 0, pn = 0, loM = wodLocalPlayerOwner();
            let ents = gameData.entities;
            for(let ei = 0, el = ents ? ents.length : 0; ei < el; ei++) {
                let e = ents[ei];
                if(!e || e.hp <= 0) continue;
                if(e.target || (e.path && e.path.length)) {
                    mn++;
                    if(e.owner === loM) pn++;
                }
            }
            gameData._wodMovingN = mn;
            gameData._wodPlayerMovingN = pn;
        }
        // (gunfire: the host's shots are not in its snapshots; see wodGuestCombatFx)
        try { wodGuestCombatFx(simDt > 0 ? simDt : 0); } catch(err) { wodReportRuntimeError(err, 'guest combat fx'); }
        wodDevMark('draw');
        draw();
        animationFrameId = requestAnimationFrame(gameLoop);
        return;
    }
    if(mpWaiting) {
        if(UI.escMenu.classList.contains('hidden'))
            updateCamera(dt);
        wodDevMark('draw');
        draw();
        animationFrameId = requestAnimationFrame(gameLoop);
        return;
    }
    if(gameData.mp && gameData.mp.enabled && wodMpMatchCanPlay()) {
        gameData._mpStatsSyncAcc = (gameData._mpStatsSyncAcc || 0) + dt;
        if(gameData._mpStatsSyncAcc >= 45) {
            gameData._mpStatsSyncAcc = 0;
            wodMpFlushStatsToServer();
        }
    }
    if(UI.escMenu.classList.contains('hidden')) {
        updateCamera(dt);
    }
    if(UI.escMenu.classList.contains('hidden') && gameData.speed > 0) {
        let uiPaused = (UI.statsMenu && !UI.statsMenu.classList.contains('hidden')) ||
            (UI.citiesMenu && !UI.citiesMenu.classList.contains('hidden')) ||
            (UI.escMenu && !UI.escMenu.classList.contains('hidden')) ||
            (wodUsesVisualViewportLayout() && UI.inGameUI && UI.inGameUI.getAttribute('data-mtab'));
        if(!uiPaused) {
            let simDt = dt * gameData.speed;
            // Fixed-ish substeps keep movement continuous across map sizes / troop counts.
            let baseChunk = wodUsesVisualViewportLayout() ? 0.033 : 0.036;
            let maxSingleStep = baseChunk * 1.35;
            gameData._frameSimDt = 0;
            let entNLoop = (gameData.entities && gameData.entities.length) || 0;
            let lastUp = gameData._lastUpdateMs || 0;
            // Heavy battles: one full-dt step instead of stacking updates (3x death spiral).
            let forceOne = entNLoop > 260 || lastUp > 11;
            wodBeginSimPfBudget(entNLoop);gameData._wodPfFrameActive=true;
            try {
            if(forceOne || simDt <= maxSingleStep) {
                let t0 = performance.now();
                wodDevMark('update');
                update(simDt);
                gameData._lastUpdateMs = performance.now() - t0;
                gameData._frameSimDt = simDt;
            } else {
                let simChunk = baseChunk * Math.max(1, Math.min(2, gameData.speed || 1));
                let simRemain = simDt;
                // Prefer more small steps over a few large ones — smoother marches.
                let marchCap = (gameData._wodPlayerMovingN || 0) > 0 ? 3 : 8;
                if(entNLoop > 180 || lastUp > 8) marchCap = Math.min(marchCap, 2);
                let steps = 0;
                let t0 = performance.now();
                while(simRemain > 0.0001 && steps++ < marchCap) {
                    let step = Math.min(simRemain, simChunk);
                    wodDevMark('update');
                    update(step);
                    gameData._frameSimDt += step;
                    simRemain -= step;
                }
                gameData._lastUpdateMs = (performance.now() - t0) / Math.max(1, steps);
            }
            } finally {gameData._wodPfFrameActive=false;}
        } else {
            gameData._frameSimDt = 0;
            // UI overlays pause sim — don't accumulate a catch-up debt.
            lastTime = time;
        }
    } else {
        gameData._frameSimDt = 0;
    }
    wodDevMark('draw');
    draw();
    animationFrameId = requestAnimationFrame(gameLoop);
}
