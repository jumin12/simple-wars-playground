// The AI: one per computer faction. This file holds its entry points and the gate every faction's work passes.
//
// The AI is split by concern:
//   brain.js          entry points, the per-faction gate, suspension, the commander's personality, diagnostics
//   knowledge.js      what a faction knows and expects: seen and remembered enemies, reach, forecasts, threats
//   orders.js         moving units: the move queue, kept intents, formation slots, fire control
//   economy.js        opening build order, recruitment, healing allowance, forts and bridges
//   defence.js        towns, forts and hospitals under threat, supply corridors, troops that are cut off
//   task-forces.js    the land task forces: plans, sectors and jobs for land units the field command does not hold
//   fronts.js         fronts, offensives, envelopments, ambushes and frontage for those task forces
//   navy.js           ships, ferries, marines, landings, evacuations by sea
//   medical.js        the wounded: recovery, hospitals, medical ferries
//   field-command.js  the field command: one commander per faction running every land unit in a land war
//
// Who runs what: every strategy pulse the field command claims the land army of each faction that has a land war
// in reach (leases, see field-command.js). What it does not claim is planned by the rest: ships, ferries and troops
// aboard or waiting for one by the navy, the wounded by the medical service, other land units (an army with no land
// road to the enemy, say) by the land task forces; routed troops run as the engine makes them. While the field
// command holds every land unit and the faction has nothing at sea, the task-force pass is skipped.
//
// Called by the engine (js/sim.js update(), in this order each frame unless noted):
//   wodStepAiDefenseWork()            defence plans, spread over frames
//   wodDrainAiMoveQueue()             applies queued AI moves, a few per frame (also for a suspended faction)
//   wodRunAiSpawnBurstForOwner(...)   one faction's economy turn, one faction per frame every 2.35 s
//   wodAiMaintainFortGuards(owner)    one faction every 6.5 s
//   wodAiStepFerries(...)             from wodUpdateTransports, every 2 s
//   wodStepAiBridgeSearches()         bridge sites, spread over frames
//   updateAiStrategy(dt)              the strategy pulse (every 1.85 s): medical, field command, task forces
//   wodAiSweepTownCells(dt)           walks AI troops into the empty streets of towns they are taking
// plus helpers the engine asks (healing allowance, reach, task-force job of a unit, operation clock).
//
// Errors: each faction's share of each of these runs through wodAiFaction (or the same try/catch inline): a throw
// is reported with wodReportRuntimeError and ends that faction's step for this pulse; the next pulse runs as usual.
// The order of the steps matters for exact replays (headless/golden.cjs): factions share one pathfinding budget.
'use strict';

// ---------- one faction at a time
// Every per-faction AI step runs through wodAiFaction. A suspended faction (wodAiSetSuspended) is skipped; a throw
// is reported (js/errors.js) and ends that step for that faction only. The rest of the pulse, and the next pulse,
// run as usual; nothing is handed to other code.
function wodAiFaction(owner, step, fn, a, b, c) {
    if(wodAiIsSuspended(owner)) return undefined;
    try { return fn(a, b, c); }
    catch(e) { wodAiReportError(owner, step, e); return undefined; }
}

function wodAiReportError(owner, step, err) {
    wodReportRuntimeError(err, 'AI ' + step + ' (faction ' + owner + ')');
}

// Scripted scenes (the tutorial) can take one faction's AI off: while suspended it plans, recruits and builds
// nothing. Its units still fight, break and retreat as the engine makes them, and orders given to them with
// wodAiMoveUnitToward are carried out. Kept per map, so a new match always starts with every AI awake.
function wodAiSetSuspended(owner, on) {
    owner = Number(owner);
    let rec = gameData._aiSuspended;
    if(!rec || rec.hexes !== gameData.hexes) rec = gameData._aiSuspended = { hexes: gameData.hexes, owners: new Set() };
    if(!on) { rec.owners.delete(owner); return; }
    rec.owners.add(owner);
    // Release the field command's leases so scripted orders apply at once, and drop moves the AI queued but has
    // not applied yet.
    for(const u of gameData.entities) if(u.owner === owner) u._opsUntil = 0;
    const queue = gameData._aiMoveQueue;
    if(queue) for(const [u, job] of queue) if(job.owner === owner) queue.delete(u);
}

function wodAiIsSuspended(owner) {
    const rec = gameData._aiSuspended;
    return !!rec && rec.hexes === gameData.hexes && rec.owners.has(Number(owner));
}

// ---------- the strategy pulse
function updateAiStrategy(dt) {
    if(wodCampaignDeployActive()) {
        gameData._aiStratWork = null;
        return;
    }
    if(gameData._aiStratWork) {
        if(wodDeferHeavySimDuringMarch() && (gameData._wodSimTick & 1)) return;
        wodDrainAiStratFormationAndUnits();
        return;
    }
    if(!gameData.aiStrategyTimer) gameData.aiStrategyTimer = 0;
    gameData.aiStrategyTimer += dt;
    // Slightly slower pulses: task forces are sticky, so units need less retasking.
    let stratEvery = 1.85;
    if(gameData._campaignRun || gameData._campaignAiAggressive) stratEvery *= 0.72;
    if(gameData.aiStrategyTimer < stratEvery) return;
    gameData.aiStrategyTimer = 0;

    gameData.aiStrategySerial = (gameData.aiStrategySerial || 0) + 1;
    wodBuildAiStratTroopPow();
    if(!gameData.aiFocusTimer) gameData.aiFocusTimer = 0;
    gameData.aiFocusTimer += stratEvery;
    if(gameData.aiFocusTimer > 4) {
        gameData.aiFocusTimer = 0;
        updateAiFrontFocus();
    }

    let aiGroups = {};
    for(let unit of gameData.entities) {
        if(unit.owner > 0 && unit.type !== 'convoy' && unit.hp > 0 && !wodMpIsHumanOwner(unit.owner) && !wodAiIsSuspended(unit.owner)) {
            if(!aiGroups[unit.owner]) aiGroups[unit.owner] = [];
            aiGroups[unit.owner].push(unit);
        }
    }

    for(const owner of Object.keys(aiGroups))wodAiFaction(+owner,'medical',wodAiMedicalLogistics,+owner);
    for(const owner of Object.keys(aiGroups))wodAiFaction(+owner,'field command',wodOpsCommand,+owner,aiGroups[owner]);
    let mobMemo = wodUsesVisualViewportLayout();
    let formationKeys = Object.keys(aiGroups);
    gameData._aiStratWork = {
        phase: 'form',
        formationKeys,
        fi: 0,
        aiGroups,
        serial: gameData.aiStrategySerial,
        mobMemo,
        sectorsByOwner: {},
        ei: 0
    };
    wodDrainAiStratFormationAndUnits();
}

/** Finishes chunked AI tactic pass (assigns one formation owner per call, then batches unit retarget). */
function wodDrainAiStratFormationAndUnits() {
    let w = gameData._aiStratWork;
    if(!w) return;
    let keys = w.formationKeys;
    let t0 = performance.now();
    let budgetMs = wodUsesVisualViewportLayout() ? 1.15 : 2.35;
    function overBudget() {
        return performance.now() - t0 >= budgetMs;
    }
    if(w.phase === 'form') {
        while(w.fi < keys.length) {
            let k = keys[w.fi];
            // a faction whose pass throws is reported and counted as done for this pulse
            let done = wodAiFaction(parseInt(k, 10), 'task forces', assignAiFormationOrders, parseInt(k, 10), w.aiGroups[k], w.serial) !== false;
            if(!done) return;
            w.fi++;
            if(overBudget()) return;
        }
        gameData._aiFormChunk = null;
        w.phase = 'units';
        w.ei = 0;
    }
    if(w.phase === 'units') {
        let ents = gameData.entities;
        let mobMemo = w.mobMemo;
        // Keep AI pulses incremental on every platform; a full-faction pulse was the source of periodic hitches.
        let BATCH = wodUsesVisualViewportLayout() ? 22 : 52;
        let nExamined = 0;
        while(w.ei < ents.length && nExamined < BATCH) {
            if(nExamined>0&&overBudget())break;
            let unit = ents[w.ei++];
            nExamined++;
            if(unit&&(w.failed?.has(unit.owner)||wodAiIsSuspended(unit.owner)))continue;
            try {
            if(unit?.hp>0&&!wodMpIsHumanOwner(unit.owner))wodAiSelectCombatTarget(unit,w.fireControl||=( {} ));
            if(['transport','supply'].includes(unit?.type)||unit?.boardTransportUid||unit?._navalAssaultUntil>wodAiOperationTime()||unit?._navalEscortUntil>wodAiOperationTime()||unit?._aiScoutUntil>wodAiOperationTime()||unit?._aiCareYieldUntil>wodAiOperationTime()||unit?._opsUntil>wodAiOperationTime())continue;
            if(unit.type === 'convoy' || unit.hp <= 0) continue;
            if(wodMpIsHumanOwner(unit.owner)) continue;
            if(unit.moraleBroken) continue;
            let hpRatio = unit.hp / unit.maxHp;

            if(wodIsNavalUnit(unit)) {
                let naval = wodAiGetUnitTaskJob(unit);
                if(naval && hpRatio >= 0.42 && !unit.retreating) {
                    if(!wodAiShouldKeepCurrentOrder(unit)) wodAiIssueTaskForceOrder(unit, naval, hpRatio);
                    continue;
                }
                if(hpRatio < 0.38) {
                    let wh = findNearestFriendlyWaterHex(unit.owner, unit.x, unit.y);
                    if(wh) {
                        unit.path = null;
                        unit.orderTarget = null;
                        unit.fullMarchWaypoints = null;
                        unit.marchWpCursor = 0;
                        unit.target = {x: wh.x, y: wh.y};
                        unit.retreating = true;
                        unit.holding = false;
                    }
                    continue;
                }
                if(unit.retreating && hpRatio > 0.72) unit.retreating = false;
                if(unit.aiFormationSerial === w.serial) continue;
                let prey = findBestAiShipPrey(unit);
                if(prey) {
                    unit.path = null;
                    unit.orderTarget = null;
                    unit.fullMarchWaypoints = null;
                    unit.marchWpCursor = 0;
                    unit.target = {x: prey.x, y: prey.y};
                    unit.holding = false;
                } else {
                    let coastal = findAiCoastalObjective(unit.owner, unit.x, unit.y);
                    if(coastal) {
                        unit.path = null;
                        unit.orderTarget = null;
                        unit.fullMarchWaypoints = null;
                        unit.marchWpCursor = 0;
                        unit.target = {x: coastal.x, y: coastal.y};
                        unit.holding = false;
                    }
                }
                continue;
            }

            const relief=wodAiGetUnitTaskJob(unit);
            if(relief?.response&&relief.kind==='relief'&&relief.pocketKeys.has(getHexKey(getNearestHexToPoint(unit.x,unit.y)))) {
                unit.retreating=false;
                if(!wodAiShouldKeepCurrentOrder(unit))wodAiIssueTaskForceOrder(unit,relief,hpRatio);
                continue;
            }
            if(hpRatio < 0.3) {
                let retreatPoint = findRetreatPoint(unit);
                if(retreatPoint) {
                    wodAiMoveUnitToward(unit, retreatPoint.x, retreatPoint.y, false);
                    unit.retreating = true;
                    unit.holding = false;
                    unit.aiTfKind = '';
                }
                continue;
            }

            if(unit.retreating && hpRatio > 0.65) unit.retreating = false;
            if(unit.retreating) {
                if(!unit.target) {
                    let retreatPoint = findRetreatPoint(unit);
                    if(retreatPoint) wodAiMoveUnitToward(unit, retreatPoint.x, retreatPoint.y, false);
                }
                continue;
            }
            // Watchdog: catch-all for every jam the timers miss. A unit with a FAR
            // target that hasn't physically moved a hex in ~9s is wedged (terrain
            // grind, separation ping-pong, replan loops) — clear its orders and open
            // the ghost-through-friendlies window so the fresh order can execute.
            {
                let nowW = wodAiOperationTime();
                if(!unit._wodAiWatch) unit._wodAiWatch = { x: unit.x, y: unit.y, t: nowW };
                else if(nowW - unit._wodAiWatch.t > 9000) {
                    let wdx = unit.x - unit._wodAiWatch.x, wdy = unit.y - unit._wodAiWatch.y;
                    let hrW = gameData.hexRadius || 20;
                    let ftW = unit.orderTarget || (unit.target && unit.target.finalTarget) || unit.target;
                    let farW = ftW && Math.hypot(ftW.x - unit.x, ftW.y - unit.y) > hrW * 5;
                    if(unit.target && farW && wdx * wdx + wdy * wdy < Math.pow(hrW * 2.2, 2) &&
                        (unit.activeCombatVisual || 0) < 0.2) {
                        unit.target = null;
                        unit.path = null;
                        unit.orderTarget = null;
                        unit.fullMarchWaypoints = null;
                        unit.marchWpCursor = 0;
                        unit.holding = false;
                        unit.stuckTimer = 0;
                        unit.blockedTimer = 0;
                        // Ghost through the friendly stack for a while and spread it.
                        unit._wodAiFriendBlockT = Math.max(unit._wodAiFriendBlockT || 0, 6);
                        snapUnitApartFromNeighbors(unit);
                    }
                    unit._wodAiWatch = { x: unit.x, y: unit.y, t: nowW };
                }
            }
            // Serial skip only applies to units that are actually MOVING — a jammed
            // unit ordered this pulse used to skip the stuck-recovery block below.
            if(unit.aiFormationSerial === w.serial && unit.target && !unit.holding && !wodAiGetUnitTaskJob(unit)?.objectiveCity && !wodAiGetUnitTaskJob(unit)?.objectiveHex &&
                (unit.stuckTimer || 0) < 0.35 && (unit.blockedTimer || 0) < 0.28 &&
                (unit._wodAiFriendBlockT || 0) < 2.2) continue;
            if(wodAiShouldKeepCurrentOrder(unit)) continue;

            if(unit.target && ((unit.stuckTimer || 0) >= 0.35 || (unit.blockedTimer || 0) >= 0.28)) {
                let ft = unit.orderTarget || (unit.target.finalTarget
                    ? { x: unit.target.finalTarget.x, y: unit.target.finalTarget.y }
                    : { x: unit.target.x, y: unit.target.y });
                unit.path = null;
                unit.orderTarget = ft;
                unit.target = null;
                unit.fullMarchWaypoints = null;
                unit.marchWpCursor = 0;
                unit.stuckTimer = 0;
                unit.blockedTimer = 0;
            }

            // Prefer sticky task-force job. Emergency: peel nearby units onto a
            // threatened own city even if their job was attack/hold.
            let tfJob = wodAiGetUnitTaskJob(unit);
            if(!tfJob) {
                let grp = w.aiGroups[unit.owner];
                if(grp) wodAiEnsureTaskForcePlan(unit.owner, grp);
                tfJob = wodAiGetUnitTaskJob(unit);
            }
            // Emergency loans are resolved by the shared mission controller.
            if(tfJob) {
                wodAiIssueTaskForceOrder(unit, tfJob, hpRatio);
                continue;
            }

            let sectors = w.sectorsByOwner[unit.owner];
            if(!sectors) {
                let readyN = (w.aiGroups[unit.owner] || []).filter(u =>
                    u.type !== 'convoy' && u.type !== 'ship' && u.hp > u.maxHp * 0.42 && !u.moraleBroken && !u.retreating
                ).length;
                sectors = buildAiFrontlineSectors(unit.owner, Math.min(24, Math.max(8, Math.ceil(readyN * 0.42))));
                w.sectorsByOwner[unit.owner] = sectors;
            }
            let assignment = wodPickAiSectorForUnit(unit, sectors) || findAiFrontlineAssignment(unit);
            if(!assignment) {
                let fallback = findNearestOwnedHex(unit.owner, unit.x, unit.y, true);
                if(fallback) {
                    wodAiMoveUnitTowardHex(unit, fallback, false, 0.15);
                    wodAiStampOrder(unit, false, fallback);
                }
                continue;
            }
            wodAiIssueSectorOrder(unit, assignment, hpRatio);
            } catch(e) {
                // reported once; the faction's other units wait for the next pulse
                (w.failed || (w.failed = new Set())).add(unit.owner);
                wodAiReportError(unit.owner, 'unit orders', e);
            }
        }
        if(w.ei < ents.length) return;
    }
    gameData._aiStratWork = null;
}

function wodBuildAiStratTroopPow() {
    let merged = gameData._wodWorkerTroopMerged;
    if(merged) {
        gameData._aiStratPowPlayer = merged[1] || 0;
        gameData._aiStratPowByOwner = {};
        for(let o = 2; o < 16; o++) {
            if(merged[o] > 0) gameData._aiStratPowByOwner[o] = merged[o];
        }
        gameData._wodWorkerTroopMerged = null;
        return;
    }
    if(gameData._aiStratPowCacheTick != null && (gameData._wodSimTick | 0) - gameData._aiStratPowCacheTick < 12)
        return;
    let p = 0;
    let by = {};
    for(let i = 0, el = gameData.entities.length; i < el; i++) {
        let unit = gameData.entities[i];
        if(unit.hp <= 0 || unit.type === 'convoy') continue;
        let mp = unit.manpower !== undefined ? unit.manpower : Math.round((unit.hp / unit.maxHp) * 1000);
        let ow = unit.owner;
        if(ow === 1) p += mp;
        else if(ow > 1) by[ow] = (by[ow] || 0) + mp;
    }
    gameData._aiStratPowPlayer = p;
    gameData._aiStratPowByOwner = by;
    gameData._aiStratPowCacheTick = gameData._wodSimTick | 0;
}

function updateAiFrontFocus() {
    if(!gameData.aiFrontFocus) gameData.aiFrontFocus = {};
    let owners = new Set(gameData.entities.filter(e => e.owner > 1 && e.type !== 'convoy').map(e => e.owner));
    for(let owner of owners) {
        let oldFocus = gameData.aiFrontFocus[owner];
        let centroid = findFrontlineCentroid(owner);
        let best = null;
        let bestScore = -Infinity;
        let frontHexes = wodCachedFrontlineHexes(owner);
        if(frontHexes.length > 52) {
            let step = frontHexes.length / 52;
            let sampled = [];
            for(let si = 0; si < 52; si++) sampled.push(frontHexes[Math.floor(si * step)]);
            frontHexes = sampled;
        }
        for(let hi = 0, hl = frontHexes.length; hi < hl; hi++) {
            let hex = frontHexes[hi];
            let enemyNeighbors = getNeighborHexes(hex).filter(nHex => isClaimableLand(nHex) && wodIsHostileOwner(nHex.owner, owner)).length;
            let playerAdj = getNeighborHexes(hex).some(nHex => nHex && nHex.owner === 1) ? 22 : 0;
            let playerUnits = countPlayerThreatNear(hex.x, hex.y, 200, owner);
            let support = countNearbyUnits(owner, hex.x, hex.y, 260);
            let enemyUnits = countNearbyUnits(owner, hex.x, hex.y, 260, true);
            let score = enemyNeighbors * 12 + support * 8 - enemyUnits * 5 + playerAdj + playerUnits * 9;
            if(oldFocus) {
                let dx = hex.x - oldFocus.x;
                let dy = hex.y - oldFocus.y;
                score -= Math.sqrt(dx * dx + dy * dy) * 0.015;
            } else if(centroid) {
                let dx = hex.x - centroid.x;
                let dy = hex.y - centroid.y;
                score -= Math.sqrt(dx * dx + dy * dy) * 0.005;
            }
            if(score > bestScore) {
                bestScore = score;
                best = hex;
            }
        }
        if(best) gameData.aiFrontFocus[owner] = {x: best.x, y: best.y};
    }
}

// ---------- clock, personality and diagnostics
/**
 * Build sticky multi-job task forces for one AI owner.
 * Multiple pushes through weak sectors, flank attacks, a reinforced contact line,
 * permanent town guards, and infantry screens behind the advance.
 */
function wodAiOperationTime() { return (gameData._aiEconomyClock || 0)*1000; }

function wodAiCommander(owner) {
    const profiles=gameData.aiCommanderProfiles||(gameData.aiCommanderProfiles={});
    let record=profiles[owner],id=typeof record==='string'?record:record?.id;
    if(!WOD_AI_COMMANDERS[id]){
        const ids=Object.keys(WOD_AI_COMMANDERS);
        id=ids[Math.floor(Math.random()*ids.length)];
        record=profiles[owner]={id,seed:Math.floor(Math.random()*0x7fffffff)};
    }
    // Chosen once per match, never from faction slot, campaign lore or a setup choice.
    const base=WOD_AI_COMMANDERS[id],seed=record?.seed||0;
    const variance=seed?((seed%997)/996-.5):0;
    return {id,...base,seed,defense:base.defense+variance*.06,flank:base.flank-variance*.08,
        ratio:base.ratio+variance*.1,land:Math.max(.15,Math.min(.85,base.land+variance*.18))};
}

function wodAiObjectivePreference(owner,hex) {
    const seed=wodAiCommander(owner).seed||owner*319;
    return ((Math.imul((hex.q||0)+331,73856093)^Math.imul((hex.r||0)+997,19349663)^seed)>>>0)%997/997;
}

// Bounded, local diagnostics. No hidden unit positions, account data or network writes.
function wodAiRecord(owner, event, detail = {}) {
    let log=gameData._aiDecisionLog;
    if(log?.hexes!==gameData.hexes)log=gameData._aiDecisionLog={hexes:gameData.hexes,owners:{}};
    const state=log.owners[owner]||=( {events:[],counts:{},last:{}} ),now=wodAiOperationTime();
    const key=event+':'+(detail.job||detail.unit||detail.city||'');
    const signature=JSON.stringify(detail),old=state.last[key];
    if(old?.signature===signature&&now-old.at<10000)return;
    state.last[key]={signature,at:now};state.counts[event]=(state.counts[event]||0)+1;
    state.events.push({at:now/1000,event,...detail});if(state.events.length>160)state.events.shift();
    if(Object.keys(state.last).length>256)state.last=Object.fromEntries(Object.entries(state.last).slice(-128));
}

function wodAiDiagnostics(owner) {
    const plan=gameData.aiTaskForces?.[owner],economy=gameData._aiEconomyPlans?.[owner];
    const log=gameData._aiDecisionLog?.hexes===gameData.hexes?gameData._aiDecisionLog.owners[owner]:null;
    return {owner,intent:gameData.aiBattlePlans?.[owner]?.intent,
        assignments:gameData.entities.filter(u=>u.owner===owner&&u.hp>0).map(u=>({unit:u.uid,mission:u._aiMission?.id,duty:u._aiWork?.duty,blockedBy:u._aiWork?.blockedBy,idleSeconds:Math.max(0,(wodAiOperationTime()-(u._aiWork?.progressAt??wodAiOperationTime()))/1000),ferry:u.boardTransportUid||u._aiEvacFerry,cargo:u.cargo?.uid})),
        economy:economy&&{desired:economy.desired,savingFor:economy.savingFor,reservation:economy.reservation&&{type:economy.reservation.type,since:economy.reservation.since},opening:economy.openingEconomy,investment:economy.economyReservation,idleReason:economy.idleReason,shortage:economy.shortage},
        defense:plan?.defenseDemand,operations:plan?.jobs.filter(j=>j.stage).map(j=>({id:j.id,stage:j.stage,reason:j.stageReason,members:j.members.length,goal:j.objectiveCity?.id||j.objectiveHex&&getHexKey(j.objectiveHex)})),
        counts:{...log?.counts},events:log?.events.slice()||[]};
}

// Observe physical work independently of command leases. Retrying an order or
// changing its name cannot make a stationary unit look productive.
function wodAiObserveWork(unit,duty,blockedBy=null) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    let w=unit._aiWork;
    if(w?.hexes!==gameData.hexes)w=unit._aiWork={hexes:gameData.hexes,x:unit.x,y:unit.y,hp:unit.hp,progressAt:now};
    if(unit._combatEngaged||unit.hp>w.hp+.1||Math.hypot(unit.x-w.x,unit.y-w.y)>hr*.7){w.x=unit.x;w.y=unit.y;w.progressAt=now;}
    w.hp=unit.hp;w.duty=duty;w.blockedBy=blockedBy;
    return w;
}
