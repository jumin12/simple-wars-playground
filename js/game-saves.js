// Saved games: five named slots each for skirmish battles, the campaign and missions, in one menu with a tab for each,
// kept in this browser (IndexedDB, the same store as the map library, js/saves.js).
// Part of the game script; loaded by index.html in a fixed order (see the list there).
//
// - A battle save holds the whole running match: gameData's match state (not the player's settings, profile or the
//   caches the game rebuilds), written by wodSaveEncode. That keeps shared and circular references (a unit's target cell
//   is the very cell in the map, an AI plan points at the units in it) and walks the state without recursion: map cells
//   link to their neighbours, far deeper than the browser's own copy (structuredClone) can follow.
// - A campaign save holds the campaign (wodRogue) and, when made during a campaign battle, that battle as well.
// - Multiplayer matches and the tutorial cannot be saved.
// - Quitting straight after saving is "continue later": the match is not counted as lost (and a campaign battle is not
//   counted as a failed assault). Loading the save picks the same match up, and it is counted when it ends.

const WOD_GAME_SAVE_SLOTS = 5;
const WOD_GAME_SAVE_TABS = ['skirmish', 'campaign', 'missions'];
const WOD_GAME_SAVE_TAB_LABEL = { skirmish: 'Skirmish', campaign: 'Campaign', missions: 'Missions' };
const WOD_GAME_SAVE_INDEX_KEY = 'wodGameSaves.index.v1';
const WOD_GAME_SAVE_FORMAT = 1;
const WOD_GAME_SAVE_NAME_MAX = 40;
function wodGameSaveKey(tab, slot) { return 'wodGameSave.v1:' + tab + ':' + slot; }

/* ------------------------------------------------------------------------------------------------------------------
 * Encoding: a graph of plain objects, arrays, Maps, Sets, Dates and typed arrays, kept as a flat table.
 * { shapes: [[key...]...], objs: [entry...], root: value }. A value is a string, number, boolean or null as it is, or
 * one of {r: index} (an object in the table), {u: 1} (undefined), {n: 0 | 1 | -1} (NaN, Infinity, -Infinity).
 * Entries: [0, shape, ...values] object; [1, ...values] array; [2, key, value, ...] Map; [3, ...values] Set;
 * [4, time] Date; [5, type, [numbers]] typed array. Functions, canvases, WeakMaps and other class instances are left out.
 * ------------------------------------------------------------------------------------------------------------------ */
const WOD_SAVE_TYPED = { Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array };
function wodSaveEncode(root, opts) {
    const omit = (opts && opts.omitKeys) || null;
    const ids = new Map(), objs = [], shapes = [], shapeIds = new Map(), queue = [], SKIP = wodSaveEncode;
    let skipped = 0;
    const kindOf = v => {
        if(Array.isArray(v)) return 1;
        if(v instanceof Map) return 2;
        if(v instanceof Set) return 3;
        if(v instanceof Date) return 4;
        if(ArrayBuffer.isView(v)) return WOD_SAVE_TYPED[v.constructor && v.constructor.name] ? 5 : -1;
        const p = Object.getPrototypeOf(v);
        return p === Object.prototype || p === null ? 0 : -1;
    };
    const kinds = new Map();
    const enc = v => {
        if(v === null) return null;
        const t = typeof v;
        if(t === 'string' || t === 'boolean') return v;
        if(t === 'number') return Number.isFinite(v) ? v : { n: Number.isNaN(v) ? 0 : v > 0 ? 1 : -1 };
        if(t === 'undefined') return { u: 1 };
        if(t !== 'object') { skipped++; return SKIP; }
        let id = ids.get(v);
        if(id === undefined) {
            const k = kindOf(v);
            if(k < 0) { skipped++; return SKIP; }
            id = objs.length; ids.set(v, id); kinds.set(id, k); objs.push(null); queue.push(v);
        }
        return { r: id };
    };
    const rootValue = enc(root);
    for(let qi = 0; qi < queue.length; qi++) {
        const v = queue[qi], id = ids.get(v), k = kinds.get(id);
        let e;
        if(k === 0) {
            const keys = [], vals = [];
            for(const key of Object.keys(v)) {
                if(omit && omit.has(key)) continue;
                const x = enc(v[key]);
                if(x === SKIP) continue;
                keys.push(key); vals.push(x);
            }
            const sig = keys.join('\u0001');
            let s = shapeIds.get(sig);
            if(s === undefined) { s = shapes.length; shapes.push(keys); shapeIds.set(sig, s); }
            e = [0, s];
            for(let i = 0; i < vals.length; i++) e.push(vals[i]);
        } else if(k === 1) {
            e = [1];
            for(let i = 0; i < v.length; i++) { const x = enc(v[i]); e.push(x === SKIP ? null : x); }
        } else if(k === 2) {
            e = [2];
            for(const [a, b] of v) { const x = enc(a); if(x === SKIP) continue; const y = enc(b); if(y === SKIP) continue; e.push(x, y); }
        } else if(k === 3) {
            e = [3];
            for(const a of v) { const x = enc(a); if(x !== SKIP) e.push(x); }
        } else if(k === 4) e = [4, v.getTime()];
        else e = [5, v.constructor.name, Array.from(v, x => Number.isFinite(x) ? x : 0)];
        objs[id] = e;
    }
    return { shapes, objs, root: rootValue === SKIP ? null : rootValue, skipped };
}
function wodSaveDecode(data) {
    if(!data || !Array.isArray(data.objs) || !Array.isArray(data.shapes)) throw new Error('The save is damaged.');
    const { shapes, objs } = data, out = new Array(objs.length);
    for(let i = 0; i < objs.length; i++) {
        const e = objs[i];
        switch(e && e[0]) {
            case 0: out[i] = {}; break;
            case 1: out[i] = []; break;
            case 2: out[i] = new Map(); break;
            case 3: out[i] = new Set(); break;
            case 4: out[i] = new Date(e[1]); break;
            case 5: { const C = WOD_SAVE_TYPED[e[1]]; out[i] = C ? C.from(e[2] || []) : (e[2] || []).slice(); break; }
            default: throw new Error('The save is damaged.');
        }
    }
    const dec = x => {
        if(x === null || typeof x !== 'object') return x;
        if(x.r !== undefined) { const o = out[x.r]; if(o === undefined) throw new Error('The save is damaged.'); return o; }
        if(x.u) return undefined;
        if(x.n !== undefined) return x.n === 0 ? NaN : x.n > 0 ? Infinity : -Infinity;
        throw new Error('The save is damaged.');
    };
    for(let i = 0; i < objs.length; i++) {
        const e = objs[i], o = out[i];
        if(e[0] === 0) {
            const keys = shapes[e[1]];
            if(!keys) throw new Error('The save is damaged.');
            for(let j = 0; j < keys.length; j++) {
                const v = dec(e[j + 2]);
                if(keys[j] === '__proto__') Object.defineProperty(o, '__proto__', { value: v, enumerable: true, writable: true, configurable: true });
                else o[keys[j]] = v;
            }
        } else if(e[0] === 1) {
            o.length = e.length - 1;
            for(let j = 1; j < e.length; j++) o[j - 1] = dec(e[j]);
        } else if(e[0] === 2) {
            for(let j = 1; j + 1 < e.length; j += 2) o.set(dec(e[j]), dec(e[j + 1]));
        } else if(e[0] === 3) {
            for(let j = 1; j < e.length; j++) o.add(dec(e[j]));
        }
    }
    return dec(data.root);
}

/* ------------------------------------------------------------------------------------------------------------------
 * What a battle save keeps. Everything in gameData belongs to the match except these: the player's settings and
 * profile (a save must not change them), multiplayer, the menu battle and map preview, and caches the game rebuilds
 * on its own (several hold page-clock times, which start again from zero when a save is loaded).
 * ------------------------------------------------------------------------------------------------------------------ */
const WOD_GAME_SAVE_SKIP_KEYS = new Set([
    // the player's settings, profile and shop
    'uiSettings', 'citySkin', 'unitSkin', 'aiUnitSkin', 'shopPreviewPlayerColor', 'shopPreviewAiColor', 'ownedUnitSkins',
    'ownedShopVisuals', 'supporterPack', '_equippedShopMapId', '_periodPreferenceChangedAt', 'gold', 'terrainViewMode',
    // multiplayer and spectating
    'mp', '_spectator', '_mpSurrenderedToAi',
    // the menu battle, map generation and the setup preview
    'menuAttractMode', '_wodSkipMapGenLoader', '_mapGenOptions', '_wodFastMapGenLobby', '_mapGenInProgress', '_mapGenLockedAiCount',
    '_wodFastMapGen', '_genProfile', '_mapSym', '_soloPreviewSnapshot', '_soloPreviewGenerating', '_soloMapPreviewMatchesStart',
    '_soloPreviewEpoch', '_wodPreviewSpinnerCanvasIds', '_wodReuseMapGenSeed', '_launchingMission', '_lastMapFingerprint', '_wodDeepEpoch',
    // what is selected or being drawn now
    'selection', 'buildMode', 'pathStrokePreview', 'playerShiftWaypoints', '_cityUnitStackTap', '_placementPickCache',
    // caches, canvases and per-frame scratch
    '_unitSpriteCache', '_fogCanvas', '_fogCtx', '_fogCloudPattern', '_topoShadeCanvas', '_fogCanvasDirty', '_fogVisible',
    '_fogViewNextAt', '_fogVisionTimer', '_fogOwner', '_fogRevision', '_hudDomAt', '_lastUpdateMs', '_terrDirtyNext',
    '_terrDirtyPending', '_frameSimDt', '_wodPfCache', '_wodPfFrameActive', '_unitGridScratch', 'unitSpatialGrid',
    '_cityGridScratch', 'citySpatialGrid', '_wodCombatDrawScratch', '_combatFx', '_combatFxPool', '_combatBumps', '_combatFxPeriod', '_combatFxSeq', '_aiLocalSituation',
    '_uiTroopCache', '_uiTankCache', '_uiShipCache', '_enemyDistField', '_aiFrontlineHexCache', '_landIncomeCache',
    '_citySupplyCache', '_healingCombatRange', '_generalAuraCache', '_aiArrivalCache', '_hdRegionGeometry',
    '_combatCamBounds', '_wodBootSettledUntil', '_wodSaveClock', '_wodSavedSlot', '_fogSeenAt',
]);
// Fields left out wherever they occur: map-cell caches stamped against counters that start again in a new page, and
// unit deadlines kept in page-clock time (a unit would wait out the difference before it pathed again).
const WOD_GAME_SAVE_OMIT_FIELDS = new Set([
    '_nbrs', '_supplyStamp', '_deepRev', '_deep',
    '_wodPfRelaxUntil', '_wodAmpFailUntil', '_wodPathGiveUpUntil', '_wodReplanLandUntil', '_wodPfDeepAt', '_wodBlockedRepathUntil',
    '_netAt', '_netFromX', '_netFromY', 'selected',
]);
// (and every "...Cache": the game rebuilds its caches, and one holding a WeakMap came back without it, so the computer's
// naval planning threw on every turn of a loaded game, _harborUtilityCache)
function wodGameSaveSkipKey(k) {
    return WOD_GAME_SAVE_SKIP_KEYS.has(k) || k.startsWith('_mp') || k.endsWith('FrameDone') || k.endsWith('Cache');
}

/* ------------------------------------------------------------------------------------------------------------------
 * When a game can be saved, and into which tab.
 * ------------------------------------------------------------------------------------------------------------------ */
function wodGameSaveMatchTab() {
    if(gameData._campaignRun) return 'campaign';
    // (a mission is one started from the Missions menu; a skirmish on an editor map with scripted events stays a skirmish)
    if(gameData._selectedMissionEntry) return 'missions';
    return 'skirmish';
}
/** Why the running match cannot be saved now ('' when it can). */
function wodGameSaveBlockReason() {
    if(gameState !== 'PLAYING' || gameData.menuAttractMode) return 'There is no battle to save.';
    if(gameData.mp && gameData.mp.enabled) return 'Multiplayer matches can’t be saved.';
    if(typeof wodTutorial !== 'undefined' && wodTutorial) return 'The tutorial can’t be saved.';
    if(gameData._spectator && gameData._spectator.active) return 'The battle is over for you.';
    if(gameData._campaignEnded) return 'The battle is over.';
    if(typeof wodMatchLoadActive === 'function' && wodMatchLoadActive()) return 'Wait for the battle to load.';
    if(typeof wodCampaignDeployActive === 'function' && wodCampaignDeployActive()) return 'Finish deployment with Begin battle first.';
    if(!gameData._matchReadyForEndChecks) return 'Wait for the battle to begin.';
    if(!gameData.hexList || !gameData.hexList.length) return 'There is no battle to save.';
    return '';
}
/** Whether the match has run on since it was last saved here (quitting right after a save is "continue later"). */
function wodGameSavedAndUnchanged() {
    return gameData._wodSaveClock != null && Math.abs((gameData._aiEconomyClock || 0) - gameData._wodSaveClock) < 0.01;
}

/* ------------------------------------------------------------------------------------------------------------------
 * The slot list (one small record for all three tabs; each save's data is its own record).
 * ------------------------------------------------------------------------------------------------------------------ */
function wodGameSaveEmptyIndex() {
    const slots = {};
    for(const t of WOD_GAME_SAVE_TABS) slots[t] = new Array(WOD_GAME_SAVE_SLOTS).fill(null);
    return { v: 1, slots };
}
async function wodGameSaveReadIndex() {
    let idx = null;
    try { idx = await wodIdbKvGet(WOD_GAME_SAVE_INDEX_KEY); } catch(e) { console.warn('saved games index', e); }
    const out = wodGameSaveEmptyIndex();
    if(idx && idx.slots) for(const t of WOD_GAME_SAVE_TABS) {
        const list = Array.isArray(idx.slots[t]) ? idx.slots[t] : [];
        for(let i = 0; i < WOD_GAME_SAVE_SLOTS; i++) out.slots[t][i] = list[i] && typeof list[i] === 'object' ? list[i] : null;
    }
    return out;
}
function wodGameSaveWriteIndex(idx) { return wodIdbKvPut(WOD_GAME_SAVE_INDEX_KEY, idx); }

/* ------------------------------------------------------------------------------------------------------------------
 * What a slot shows: a name, what kind of game it is, how far in, and a picture of the map.
 * ------------------------------------------------------------------------------------------------------------------ */
function wodGameSaveOptionLabel(selectId, value) {
    const sel = document.getElementById(selectId);
    const opt = sel && [...sel.options].find(o => o.value === String(value));
    return opt ? opt.textContent.trim().replace(/\s+[—-]\s.*$/, '') : '';
}
function wodGameSaveClockLabel(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
}
function wodGameSaveTownsLabel() {
    const me = wodLocalPlayerOwner(), all = gameData.cities || [];
    return all.filter(c => c.owner === me).length + ' of ' + all.length + ' towns';
}
function wodGameSaveCampaignSummary(c) {
    if(!c) return [];
    const nodes = (c.world && c.world.nodes) || [], held = nodes.filter(n => c.nodesState && c.nodesState[n.id] && c.nodesState[n.id].owner === 'player').length;
    return ['Turn ' + (c.turn || 1) + ' · ' + held + ' of ' + nodes.length + ' regions held',
        (c.roster ? c.roster.length : 0) + ' units in the army · ' + Math.round(c.points || 0) + ' requisition'];
}
function wodGameSaveMatchSummary(tab) {
    const lines = [];
    const period = typeof wodPeriodLabel === 'function' ? wodPeriodLabel(gameData._matchPeriod || gameData.gamePeriod || 'modern') : '';
    if(tab === 'campaign') {
        const run = gameData._campaignRun, node = run && typeof wodRogueNodeTemplate === 'function' ? wodRogueNodeTemplate(run.nodeId) : null;
        lines.push((run && run.defense ? 'Defending ' : 'Battle for ') + ((node && node.name) || 'a region'));
    } else if(tab === 'missions') {
        const e = gameData._selectedMissionEntry;
        lines.push((e && e.name) || (gameData.mission && (gameData.mission.name || gameData.mission.title)) || 'Mission');
    } else {
        const shape = wodGameSaveOptionLabel('setupMapShape', gameData.mapShape) || gameData.mapShape || 'Map';
        const size = wodGameSaveOptionLabel('setupMapSize', gameData.mapRadius);
        const ai = gameData.aiCount || 1;
        lines.push([shape, size, ai + (ai === 1 ? ' opponent' : ' opponents')].filter(Boolean).join(' · '));
    }
    lines.push([wodGameSaveClockLabel(gameData._aiEconomyClock) + ' played', wodGameSaveTownsLabel(), period, gameData.fogOfWar ? 'Fog of war' : ''].filter(Boolean).join(' · '));
    return lines;
}
function wodGameSaveDefaultName(tab, kind) {
    if(kind === 'campaign-map') { const c = wodRogueLoad(); return 'Ashen Front, turn ' + ((c && c.turn) || 1); }
    if(tab === 'campaign') { const node = gameData._campaignRun && wodRogueNodeTemplate(gameData._campaignRun.nodeId); return (node && node.name ? node.name : 'Campaign battle') + ', turn ' + ((wodRogueLoad() || {}).turn || 1); }
    if(tab === 'missions') { const e = gameData._selectedMissionEntry; return ((e && e.name) || 'Mission').slice(0, WOD_GAME_SAVE_NAME_MAX); }
    const shape = wodGameSaveOptionLabel('setupMapShape', gameData.mapShape) || 'Skirmish';
    return shape + ' skirmish, ' + wodGameSaveClockLabel(gameData._aiEconomyClock);
}
function wodGameSaveThumb(kind) {
    try {
        if(kind === 'campaign-map') {
            const src = document.getElementById('wodCampMapCanvas');
            if(!src || src.width < 2) return '';
            const c = document.createElement('canvas'); c.width = 220; c.height = Math.round(220 * src.height / src.width);
            c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
            return c.toDataURL('image/jpeg', 0.8);
        }
        const c = document.createElement('canvas'); c.width = 220; c.height = 124;
        wodPaintMapDataOnCanvas(c, { hexList: gameData.hexList, cities: gameData.cities, entities: gameData.entities, hexRadius: gameData.hexRadius });
        return c.toDataURL('image/jpeg', 0.8);
    } catch(e) { return ''; }
}

/* ------------------------------------------------------------------------------------------------------------------
 * Saving
 * ------------------------------------------------------------------------------------------------------------------ */
function wodCampaignStateCopy() {
    const c = typeof wodRogueLoad === 'function' ? wodRogueLoad() : null;
    return c ? JSON.parse(JSON.stringify(c)) : null;
}
function wodBuildMatchSavePayload(tab) {
    const state = {};
    for(const k of Object.keys(gameData)) if(!wodGameSaveSkipKey(k)) state[k] = gameData[k];
    const encoded = wodSaveEncode(state, { omitKeys: WOD_GAME_SAVE_OMIT_FIELDS });
    return {
        format: WOD_GAME_SAVE_FORMAT, kind: 'match', tab, build: wodClientBuild(), version: wodClientVersion(),
        speed: gameData.speed || 0,
        factionColors: factionColors.slice(),
        seq: { fort: wodFortPlacementSeq, bridge: wodBridgePlacementSeq },
        sessionMs: Math.max(0, performance.now() - (gameData.gameSessionStartedPerfMs || performance.now())),
        rogue: tab === 'campaign' ? wodCampaignStateCopy() : null,
        state: encoded
    };
}
/** Write the running match (or, with kind 'campaign-map', the campaign between battles) into a slot. */
async function wodWriteGameSave(tab, slot, name, kind) {
    kind = kind || 'match';
    if(!window.indexedDB) throw new Error('This browser cannot store saved games.');
    if(!(slot >= 0 && slot < WOD_GAME_SAVE_SLOTS) || !WOD_GAME_SAVE_TABS.includes(tab)) throw new Error('No such save slot.');
    let payload, lines;
    if(kind === 'campaign-map') {
        const rogue = wodCampaignStateCopy();
        if(!rogue) throw new Error('There is no campaign to save.');
        if(rogue.over) throw new Error('This campaign is over.');
        payload = { format: WOD_GAME_SAVE_FORMAT, kind, tab: 'campaign', build: wodClientBuild(), version: wodClientVersion(), rogue };
        lines = ['On the war map'].concat(wodGameSaveCampaignSummary(rogue));
    } else {
        const why = wodGameSaveBlockReason();
        if(why) throw new Error(why);
        if(wodGameSaveMatchTab() !== tab) throw new Error('This battle saves under ' + WOD_GAME_SAVE_TAB_LABEL[wodGameSaveMatchTab()] + '.');
        payload = wodBuildMatchSavePayload(tab);
        lines = wodGameSaveMatchSummary(tab);
    }
    const text = JSON.stringify(payload);
    const entry = {
        name: String(name || '').trim().slice(0, WOD_GAME_SAVE_NAME_MAX) || wodGameSaveDefaultName(tab, kind),
        savedAt: new Date().toISOString(), kind, lines, thumb: wodGameSaveThumb(kind), version: wodClientVersion(), bytes: text.length
    };
    await wodIdbKvPut(wodGameSaveKey(tab, slot), text);
    const idx = await wodGameSaveReadIndex();
    idx.slots[tab][slot] = entry;
    await wodGameSaveWriteIndex(idx);
    if(kind === 'match') { gameData._wodSaveClock = gameData._aiEconomyClock || 0; gameData._wodSavedSlot = { tab, slot }; }
    return entry;
}
async function wodRenameGameSave(tab, slot, name) {
    const idx = await wodGameSaveReadIndex(), entry = idx.slots[tab] && idx.slots[tab][slot];
    if(!entry) throw new Error('That slot is empty.');
    entry.name = String(name || '').trim().slice(0, WOD_GAME_SAVE_NAME_MAX) || entry.name;
    await wodGameSaveWriteIndex(idx);
    return entry;
}
async function wodDeleteGameSave(tab, slot) {
    const idx = await wodGameSaveReadIndex();
    await wodIdbKvDelete(wodGameSaveKey(tab, slot));
    if(idx.slots[tab]) idx.slots[tab][slot] = null;
    await wodGameSaveWriteIndex(idx);
}

/* ------------------------------------------------------------------------------------------------------------------
 * Loading
 * ------------------------------------------------------------------------------------------------------------------ */
async function wodReadGameSave(tab, slot) {
    const text = await wodIdbKvGet(wodGameSaveKey(tab, slot));
    if(!text) throw new Error('That slot is empty.');
    let payload;
    try { payload = typeof text === 'string' ? JSON.parse(text) : text; } catch(e) { throw new Error('The save is damaged.'); }
    if(!payload || typeof payload !== 'object' || !payload.kind) throw new Error('The save is damaged.');
    if(payload.format > WOD_GAME_SAVE_FORMAT) throw new Error('This save was made by a newer version of Simple Wars. Update the game to load it.');
    return payload;
}
function wodAdoptCampaignState(rogue) {
    if(!rogue || rogue.version !== 2 || !rogue.world || !Array.isArray(rogue.roster)) throw new Error('The campaign in this save is damaged.');
    wodRosterUndo = null;
    wodRogue = JSON.parse(JSON.stringify(rogue));
    wodRogue.roster.forEach(wodNormalizeNavalStats);
    wodRogueEnsureResearch(wodRogue);
    wodRogueSave();
    _wodRogueWorldCache = null;
    wodRogueInvalidateMapCache();
    _wodRogueSelectedNode = null;
    _wodRogueSelectedFromNode = null;
}
/** Put a decoded battle back into gameData and rebuild what the game keeps beside it. */
function wodApplySavedMatchState(state, payload) {
    for(const k of Object.keys(state)) {
        // (what a save leaves out is not taken from an older save either: saves made before a cache was left out carry it)
        if(wodGameSaveSkipKey(k)) continue;
        if(k === 'camera' && state.camera && gameData.camera) { Object.assign(gameData.camera, state.camera); continue; }
        gameData[k] = state[k];
    }
    if(!Array.isArray(gameData.hexList) || !gameData.hexList.length) throw new Error('The save has no map.');
    if(!gameData.hexes || typeof gameData.hexes !== 'object') {
        gameData.hexes = {};
        for(const h of gameData.hexList) gameData.hexes[h.q + ',' + h.r] = h;
    }
    if(Array.isArray(payload.factionColors)) for(let i = 0; i < Math.min(payload.factionColors.length, factionColors.length); i++)
        if(typeof payload.factionColors[i] === 'string') factionColors[i] = payload.factionColors[i];
    if(payload.seq) {
        wodFortPlacementSeq = Math.max(wodFortPlacementSeq, payload.seq.fort | 0);
        wodBridgePlacementSeq = Math.max(wodBridgePlacementSeq, payload.seq.bridge | 0);
    }
    gameData.mp = null; gameData._spectator = null; gameData.menuAttractMode = false;
    // (no end checks until the loading screen lifts, as in a new match)
    gameData._matchReadyForEndChecks = false; gameData._campaignEnded = false;
    gameData.selection = []; gameData.buildMode = null; gameData.pathStrokePreview = null; gameData.playerShiftWaypoints = [];
    for(const u of (gameData.entities || []).flatMap(t => t && t.cargo ? [t, t.cargo] : [t])) if(u) u.selected = false;
    gameData._wodPfCache = new Map(); gameData._wodPfVer = (gameData._wodPfVer | 0) + 1;
    gameData._aiLocalSituation = new WeakMap();
    if(!(gameData._aiMoveQueue instanceof Map)) gameData._aiMoveQueue = new Map();
    if(!(gameData._aiDefenseWork instanceof Map)) gameData._aiDefenseWork = new Map();
    // vision: rebuilt at once from the units; what each side has explored is kept
    gameData._fogVisible = null; gameData._fogCanvasDirty = true; gameData._fogVisionTimer = 1;
    for(const rec of Object.values(gameData._factionIntel || {})) if(rec && typeof rec === 'object') rec.at = -1e15;
    gameData._landIncomeCacheDirty = true;
    gameData.gameSessionStartedPerfMs = performance.now() - (payload.sessionMs || 0);
    gameData._wodSaveClock = gameData._aiEconomyClock || 0;
    if(typeof wodRebuildBridgeHexIndex === 'function') { for(const br of gameData.bridges || []) wodSyncBridgeWorldCoords(br); wodRebuildBridgeHexIndex(); }
    wodInvalidateAiFrontlineHexCache();
    wodCombatFxClear();
    wodMarkTerrainFullDirty();
    updateTerrainKey();
    wodApplyPeriodUiLabels();
    syncHudObjectiveDisplay();
    wodBindHudResourceTooltips();
}
/** Open a saved battle behind the loading screen, the way startGame opens a new one. */
function wodStartSavedMatch(state, payload, from) {
    if(typeof wodAbandonSoloPreviewForLaunch === 'function') wodAbandonSoloPreviewForLaunch();
    wodMatchLoadBegin('Loading saved game');
    gameState = 'PLAYING';
    pauseMenuBackgroundBattle();
    wodPrepareForNewMatch({ keepMp: false });
    gameData._cityUnitStackTap = null;
    gameData._campaignEnded = false;
    gameData._matchReadyForEndChecks = false;
    hideCampaignSummaryOverlay();
    wodResetEndCountdowns();
    UI.mainMenu.classList.add('hidden');
    UI.panels.forEach(p => p.classList.add('hidden'));
    UI.escMenu.classList.add('hidden');
    document.body.classList.remove('wod-esc-open');
    UI.inGameUI.style.display = 'block';
    UI.canvas.style.display = 'block';
    if(window.wodMusic) { try { window.wodMusic.bindUi(); window.wodMusic.start(); } catch(e) { console.warn(e); } }
    setGameSpeed(0, true);
    wodResetMobileHud();
    return (async function() {
        try {
            await wodMatchLoadStep('wait', 0, 4, 'Preparing…', 0.1);
            let guard = 0;
            while((window._wodBootBusy || window._wodMenuBootstrapBusy) && guard++ < 600) await new Promise(r => setTimeout(r, 100));
            if(typeof wodAwaitMapGenIdle === 'function') await wodAwaitMapGenIdle();
            await wodMatchLoadStep('savedgame', 4, 62, 'Opening the saved game', 0.6);
            await wodEnsureFxPrecache();
            wodTerrainBakeNextMs = 0; wodTerrainPolWork = null; gameData._wodPolBakeAgain = false;
            wodGfxLiteLatch = false; wodGfxSimplifyLatch = false;
            wodSyncViewportAndCanvas();
            wodClearLiveMapForNewMatch();
            wodApplySavedMatchState(state, payload);
            gameData._wodSavedSlot = from || null;
            await wodMatchLoadStep('terrain', 62, 80, 'Painting the terrain', 0.9);
            if(terrainNeedsUpdate && UI.canvas && UI.canvas.style.display !== 'none') { try { updateTerrainCache(); } catch(_) {} }
            lastTime = performance.now();
            if(animationFrameId) cancelAnimationFrame(animationFrameId);
            gameLoop(lastTime);
            await wodWarmMatchForPlay(80, 99);
            await wodMatchLoadEnd();
            if(gameState !== 'PLAYING') return;
            // (the match goes on from the save: it was counted as started when it first began)
            if(!gameData._lifetimeMatch) wodBeginLifetimeMatch();
            gameData._matchReadyForEndChecks = true;
            // (it opens paused, to look round before carrying on; the speed it was saved at is the one 1x/2x/3x pick up)
            setGameSpeed(0, true);
            wodSyncCampaignBattleHud();
            if(typeof wodUpdateCampaignDefenseHoldBanner === 'function') wodUpdateCampaignDefenseHoldBanner();
            showNotification('Saved game loaded and paused. Pick a speed to carry on.', 'info');
        } catch(e) {
            console.error(e);
            wodMatchLoadHide();
            showNotification('Could not load the saved game: ' + (e.message || e));
            returnToMenu();
        }
        wodSyncDesktopLayersPanelExpanded();
        syncInGameLayerToolbar();
        wodApplyPlayViewportLock(true);
    })();
}
async function wodLoadGameSave(tab, slot) {
    const payload = await wodReadGameSave(tab, slot);
    if(payload.kind === 'campaign-map') {
        wodAdoptCampaignState(payload.rogue);
        showPanel('campaign');
        showNotification('Campaign loaded.');
        return;
    }
    if(payload.kind !== 'match') throw new Error('The save is damaged.');
    const state = wodSaveDecode(payload.state);
    if(!state || typeof state !== 'object') throw new Error('The save is damaged.');
    if(payload.tab === 'campaign') {
        if(!state._campaignRun) throw new Error('The save is damaged.');
        wodAdoptCampaignState(payload.rogue);
    }
    gameData._campaignRun = null; gameData._selectedMissionEntry = null; gameData.mission = null;
    await wodStartSavedMatch(state, payload, { tab, slot });
}

/* ------------------------------------------------------------------------------------------------------------------
 * The saved games menu: three tabs of five slots. From the main menu it loads; from a battle (pause menu) or the
 * campaign map it saves. Rename and Delete work in both.
 * ------------------------------------------------------------------------------------------------------------------ */
const wodGameSavesUi = { mode: 'load', tab: 'skirmish', saveTab: null, kind: 'match', returnTo: 'menu', busy: false, idx: null };
function wodGameSavesPanel() { return document.getElementById('savesPanel'); }
function wodGameSavesOpen() { const p = wodGameSavesPanel(); return !!(p && !p.classList.contains('hidden')); }
/** Open the menu. opts: mode 'load' | 'save', tab, kind ('match' | 'campaign-map'), returnTo ('game', 'menu', or the
 *  panel to go back to, such as 'campaign' or 'playMode'). */
function wodOpenGameSaves(opts) {
    opts = opts || {};
    const ui = wodGameSavesUi, panel = wodGameSavesPanel();
    if(!panel) return;
    wodWireGameSavesOnce();
    ui.mode = opts.mode === 'save' ? 'save' : 'load';
    ui.kind = opts.kind || 'match';
    ui.saveTab = ui.mode === 'save' ? (opts.tab || 'skirmish') : null;
    ui.tab = WOD_GAME_SAVE_TABS.includes(opts.tab) ? opts.tab : (ui.tab || 'skirmish');
    ui.returnTo = opts.returnTo || (gameState === 'PLAYING' ? 'game' : 'menu');
    if(ui.returnTo === 'game') {
        panel.classList.add('wod-saves-ingame');
        panel.classList.remove('hidden');
    } else {
        panel.classList.remove('wod-saves-ingame');
        showPanel('saves');
    }
    void wodRefreshGameSavesPanel();
}
function wodCloseGameSaves() {
    const ui = wodGameSavesUi, panel = wodGameSavesPanel();
    if(!panel) return;
    if(ui.returnTo === 'game') { panel.classList.add('hidden'); panel.classList.remove('wod-saves-ingame'); wodSyncEscSaveButton(); return; }
    if(ui.returnTo && ui.returnTo !== 'menu' && document.getElementById(ui.returnTo + 'Panel')) { showPanel(ui.returnTo); return; }
    hidePanels();
}
/** Pause menu → Saved games. The menu opens over the pause menu, which keeps the battle paused while a slot is picked.
 *  It saves this battle when it can be saved, and loads any save (leaving this battle). */
function wodOpenGameSavesFromGame() {
    if((gameData.mp && gameData.mp.enabled) || (typeof wodTutorial !== 'undefined' && wodTutorial)) { showNotification(wodGameSaveBlockReason() || 'Saved games are not available here.'); return; }
    const why = wodGameSaveBlockReason();
    wodGameSavesUi.saveBlocked = why;
    wodOpenGameSaves({ mode: why ? 'load' : 'save', tab: wodGameSaveMatchTab(), kind: 'match', returnTo: 'game' });
}
/** Campaign map → Save campaign / Saved games. */
function wodOpenCampaignSaves(save) {
    if(save) {
        const c = wodRogueLoad();
        if(!c) { showNotification('Begin a campaign first.'); return; }
        if(c.over) { showNotification('This campaign is over.'); return; }
    }
    wodOpenGameSaves({ mode: save ? 'save' : 'load', tab: 'campaign', kind: save ? 'campaign-map' : 'match', returnTo: 'campaign' });
}
function wodSyncEscSaveButton() {
    const btn = document.getElementById('wodEscSaveBtn');
    if(!btn) return;
    const hidden = !!(gameData.mp && gameData.mp.enabled) || (typeof wodTutorial !== 'undefined' && !!wodTutorial);
    btn.classList.toggle('hidden', hidden);
    const why = hidden ? '' : wodGameSaveBlockReason();
    btn.disabled = false;
    btn.title = why ? why + ' You can still load a saved game.' : 'Save this battle, or load a saved game';
}
function wodSyncCampaignSaveButtons() {
    const save = document.getElementById('wodCampSaveBtn');
    if(!save) return;
    const c = typeof wodRogueLoad === 'function' ? wodRogueLoad() : null;
    save.classList.toggle('hidden', !c || !!c.over);
}
function wodWireGameSavesOnce() {
    const panel = wodGameSavesPanel();
    if(!panel || panel._wodWired) return;
    panel._wodWired = true;
    panel.querySelectorAll('[data-save-tab]').forEach(btn => btn.addEventListener('click', () => {
        wodGameSavesUi.tab = btn.getAttribute('data-save-tab');
        void wodRefreshGameSavesPanel();
    }));
    document.getElementById('wodSavesBack')?.addEventListener('click', wodCloseGameSaves);
    document.getElementById('wodSavesQuit')?.addEventListener('click', () => {
        if(gameState === 'PLAYING' && wodGameSavedAndUnchanged()) { panel.classList.add('hidden'); returnToMenu(); }
    });
    panel.addEventListener('click', ev => {
        const b = ev.target.closest && ev.target.closest('[data-save-act]');
        if(!b || b.disabled || !panel.contains(b)) return;
        void wodGameSaveAction(b.getAttribute('data-save-act'), b.getAttribute('data-save-tab-of'), parseInt(b.getAttribute('data-save-slot'), 10));
    });
    // Escape closes this menu (and nothing under it)
    document.addEventListener('keydown', ev => {
        if(ev.key !== 'Escape' || !wodGameSavesOpen()) return;
        const dlg = document.querySelector('#wodConfirmDlg:not(.hidden), #wodNameInputDlg:not(.hidden)');
        if(dlg) return;
        ev.preventDefault(); ev.stopImmediatePropagation();
        wodCloseGameSaves();
    }, true);
}
function wodGameSaveWhen(iso) {
    try { return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch(e) { return iso || ''; }
}
function wodGameSaveSlotHtml(tab, i, entry) {
    const ui = wodGameSavesUi, esc = wodEscapeHtml, saving = ui.mode === 'save' && tab === ui.saveTab && !ui.busy;
    const btn = (act, label, cls) => '<button type="button" class="menu-btn wod-save-slot-btn' + (cls ? ' ' + cls : '') + '" data-save-act="' + act + '" data-save-tab-of="' + tab + '" data-save-slot="' + i + '"' + (ui.busy ? ' disabled' : '') + '>' + label + '</button>';
    const current = gameData._wodSavedSlot && gameData._wodSavedSlot.tab === tab && gameData._wodSavedSlot.slot === i && gameState === 'PLAYING';
    if(!entry) {
        return '<div class="wod-save-slot is-empty" data-slot="' + i + '"><div class="wod-save-slot-num">' + (i + 1) + '</div>'
            + '<div class="wod-save-slot-thumb is-blank" aria-hidden="true"></div>'
            + '<div class="wod-save-slot-body"><div class="wod-save-slot-name">Empty slot</div></div>'
            + '<div class="wod-save-slot-actions">' + (saving ? btn('save', 'Save here', 'wod-save-slot-primary') : '') + '</div></div>';
    }
    const lines = (Array.isArray(entry.lines) ? entry.lines : []).map(l => '<div class="wod-save-slot-meta">' + esc(l) + '</div>').join('');
    const when = '<div class="wod-save-slot-meta wod-save-slot-when">Saved ' + esc(wodGameSaveWhen(entry.savedAt)) + '</div>';
    const thumb = entry.thumb && /^data:image\/(png|jpeg);base64,/.test(entry.thumb)
        ? '<img class="wod-save-slot-thumb" alt="" src="' + entry.thumb + '">' : '<div class="wod-save-slot-thumb is-blank" aria-hidden="true"></div>';
    let acts = '';
    if(saving) acts += btn('overwrite', 'Overwrite', 'wod-save-slot-primary');
    if(ui.mode === 'load' || ui.returnTo === 'game') acts += btn('load', 'Load', saving ? '' : 'wod-save-slot-primary');
    acts += btn('rename', 'Rename') + btn('delete', 'Delete', 'wod-save-slot-danger');
    return '<div class="wod-save-slot' + (current ? ' is-current' : '') + '" data-slot="' + i + '"><div class="wod-save-slot-num">' + (i + 1) + '</div>' + thumb
        + '<div class="wod-save-slot-body"><div class="wod-save-slot-name">' + esc(entry.name || 'Saved game') + (current ? ' <span class="wod-save-slot-tag">This battle</span>' : '') + '</div>' + lines + when + '</div>'
        + '<div class="wod-save-slot-actions">' + acts + '</div></div>';
}
async function wodRefreshGameSavesPanel() {
    const ui = wodGameSavesUi, panel = wodGameSavesPanel();
    if(!panel) return;
    const list = document.getElementById('wodSavesSlots'), lead = document.getElementById('wodSavesLead'), title = document.getElementById('wodSavesTitle');
    panel.querySelectorAll('[data-save-tab]').forEach(b => {
        const on = b.getAttribute('data-save-tab') === ui.tab;
        b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if(title) title.textContent = ui.mode === 'save' ? (ui.kind === 'campaign-map' ? 'Save campaign' : 'Save game') : 'Saved games';
    if(lead) {
        const where = WOD_GAME_SAVE_TAB_LABEL[ui.saveTab] || '';
        lead.textContent = ui.mode !== 'save' ? (ui.returnTo === 'game' && ui.saveBlocked ? ui.saveBlocked + ' You can load a saved game instead.' : 'Five slots each for skirmish battles, campaigns and missions. Load one to carry on where you left off.')
            : ui.tab !== ui.saveTab ? 'This ' + (ui.kind === 'campaign-map' ? 'campaign' : 'battle') + ' saves under ' + where + '. You can rename or delete saves here.'
            : ui.kind === 'campaign-map' ? 'Pick a slot for this campaign. A save keeps the war map, your army and research.'
            : 'Pick a slot for this battle. Five slots for ' + where.toLowerCase() + (ui.saveTab === 'campaign' ? ' (the campaign is saved with it).' : '.');
    }
    const quit = document.getElementById('wodSavesQuit');
    if(quit) quit.classList.toggle('hidden', !(ui.returnTo === 'game' && gameState === 'PLAYING' && wodGameSavedAndUnchanged()));
    const back = document.getElementById('wodSavesBack');
    if(back) back.textContent = ui.returnTo === 'game' ? 'Back to game' : 'Back';
    if(!list) return;
    if(!window.indexedDB) { list.innerHTML = '<p class="wod-save-list-empty">This browser cannot store saved games.</p>'; list.dataset.tab = ''; return; }
    // (drawn at once from the last list read, so switching tabs never shows the previous tab's slots; then read afresh)
    const render = () => {
        const slots = ui.idx.slots[ui.tab] || [];
        let html = '';
        for(let i = 0; i < WOD_GAME_SAVE_SLOTS; i++) html += wodGameSaveSlotHtml(ui.tab, i, slots[i]);
        list.innerHTML = html;
        list.dataset.tab = ui.tab;
    };
    if(ui.idx) render();
    else { list.innerHTML = '<p class="wod-save-list-empty">Loading…</p>'; list.dataset.tab = ''; }
    try { ui.idx = await wodGameSaveReadIndex(); }
    catch(e) { list.innerHTML = '<p class="wod-save-list-empty">Could not read saved games.</p>'; list.dataset.tab = ''; return; }
    render();
}
async function wodGameSaveAction(act, tab, slot) {
    const ui = wodGameSavesUi;
    if(ui.busy || !WOD_GAME_SAVE_TABS.includes(tab) || !(slot >= 0 && slot < WOD_GAME_SAVE_SLOTS)) return;
    const idx = ui.idx || await wodGameSaveReadIndex(), entry = idx.slots[tab][slot];
    const run = async (fn, busyNote) => {
        ui.busy = true; void wodRefreshGameSavesPanel();
        if(busyNote) showNotification(busyNote);
        try { return await fn(); }
        finally { ui.busy = false; }
    };
    try {
        if(act === 'save' || act === 'overwrite') {
            if(act === 'overwrite' && entry) {
                const ok = await wodShowConfirmDialog({ title: 'Overwrite this save?', body: '“' + entry.name + '” will be replaced by this ' + (ui.kind === 'campaign-map' ? 'campaign' : 'battle') + '.', confirmLabel: 'Overwrite', danger: true });
                if(!ok) return;
            }
            const name = await window.wodShowNameInputDialog({ title: 'Name this save', label: 'Save name', defaultValue: entry ? entry.name : wodGameSaveDefaultName(tab, ui.kind), confirmLabel: 'Save', maxLength: WOD_GAME_SAVE_NAME_MAX });
            if(name == null) return;
            const saved = await run(() => wodWriteGameSave(tab, slot, name, ui.kind));
            showNotification('Saved “' + saved.name + '” in slot ' + (slot + 1) + '.');
        } else if(act === 'load') {
            if(!entry) return;
            if(gameState === 'PLAYING' && ui.returnTo === 'game') {
                const kept = wodGameSavedAndUnchanged();
                const ok = await wodShowConfirmDialog({ title: 'Leave this battle?', confirmLabel: 'Load', danger: !kept,
                    body: 'Load “' + entry.name + '”. ' + (kept ? 'This battle is saved as it stands.' : 'This battle has not been saved since it moved on, so leaving it counts as a loss.') + (tab === 'campaign' ? ' The save replaces the campaign you are fighting now.' : '') });
                if(!ok) return;
                const panel = wodGameSavesPanel();
                if(panel) { panel.classList.add('hidden'); panel.classList.remove('wod-saves-ingame'); }
                returnToMenu();
                await run(() => wodLoadGameSave(tab, slot));
                return;
            }
            if(tab === 'campaign' && wodRogueLoad()) {
                const ok = await wodShowConfirmDialog({ title: 'Load this campaign save?', body: 'It replaces the campaign you are fighting now. Save that one first if you want to keep it.', confirmLabel: 'Load' });
                if(!ok) return;
            }
            await run(() => wodLoadGameSave(tab, slot));
            return;
        } else if(act === 'rename') {
            if(!entry) return;
            const name = await window.wodShowNameInputDialog({ title: 'Rename save', label: 'Save name', defaultValue: entry.name, confirmLabel: 'Rename', maxLength: WOD_GAME_SAVE_NAME_MAX, requireNonEmpty: true });
            if(name == null || !String(name).trim()) return;
            await run(() => wodRenameGameSave(tab, slot, name));
        } else if(act === 'delete') {
            if(!entry) return;
            const ok = await wodShowConfirmDialog({ title: 'Delete this save?', body: '“' + entry.name + '” will be deleted. This cannot be undone.', confirmLabel: 'Delete', danger: true });
            if(!ok) return;
            await run(() => wodDeleteGameSave(tab, slot));
            if(gameData._wodSavedSlot && gameData._wodSavedSlot.tab === tab && gameData._wodSavedSlot.slot === slot) gameData._wodSavedSlot = null;
            showNotification('Save deleted.');
        }
    } catch(e) {
        console.warn('saved games', e);
        showNotification((act === 'load' ? 'Could not load: ' : act === 'delete' ? 'Could not delete: ' : act === 'rename' ? 'Could not rename: ' : 'Could not save: ') + (e.message || e));
    }
    if(wodGameSavesOpen()) void wodRefreshGameSavesPanel();
}
