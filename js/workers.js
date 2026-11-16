// Web workers and the per-frame pathfinding budget.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

let lastTime = 0;
let animationFrameId;
let wodUnitsDrawOrderScratch = [];
let wodMobileUiStatTimer = 0;
let wodWheelZoomRaf = 0;
let wodWheelBatch = null;
const WOD_MAP_GEN_POOL = 4;
// (The troop-power tally for the AI and unit separation used to have Web Worker versions: sixteen threads
// to add up a few hundred numbers, posted a copy of the arrays every few ticks, and a separation worker
// nothing sent work to. Their results arrived whenever the threads got round to them, so two runs of one
// match differed. Both are worked out inline, as they always were where Web Workers are unavailable.)
let wodPfBudgetMs = 4.5;
let wodPfSpentMs = 0;
let wodMapGenWorker = null;
let wodMapGenWorkers = [];
let wodMapGenJobId = 0;
function wodEnsureMapGenWorker() {
    wodEnsureMapGenWorkerPool();
    if(!wodMapGenWorker && wodMapGenWorkers.length) wodMapGenWorker = wodMapGenWorkers[0];
    if(wodMapGenWorker || typeof Worker === 'undefined') return wodMapGenWorker;
    try {
        wodMapGenWorker = new Worker('map-gen-worker.js?v=52e8877b7e');
    } catch(_) {
        wodMapGenWorker = null;
    }
    return wodMapGenWorker;
}
function wodEnsureMapGenWorkerPool() {
    if(wodMapGenWorkers.length > 0 || typeof Worker === 'undefined') return wodMapGenWorkers;
    for(let i = 0; i < WOD_MAP_GEN_POOL; i++) {
        try {
            wodMapGenWorkers.push(new Worker('map-gen-worker.js?v=52e8877b7e'));
        } catch(_) {}
    }
    if(!wodMapGenWorker && wodMapGenWorkers.length) wodMapGenWorker = wodMapGenWorkers[0];
    return wodMapGenWorkers;
}
function wodMapGenWorkerCall(w, payload) {
    return new Promise(function(resolve, reject) {
        if(!w) {
            reject(new Error('no worker'));
            return;
        }
        let jobId = ++wodMapGenJobId;
        let done = false;
        function finish(err, hexList) {
            if(done) return;
            done = true;
            w.removeEventListener('message', onMsg);
            w.removeEventListener('error', onErr);
            if(err) reject(err);
            else resolve(hexList);
        }
        function onMsg(ev) {
            let d = ev.data;
            if(!d || d.jobId !== jobId) return;
            if(d.ok) finish(null, d.hexList || []);
            else finish(new Error(d.err || 'worker failed'));
        }
        function onErr() { finish(new Error('worker error')); }
        w.addEventListener('message', onMsg);
        w.addEventListener('error', onErr);
        try {
            let msg = Object.assign({}, payload, { jobId: jobId });
            w.postMessage(msg);
        } catch(e) {
            finish(e);
        }
    });
}
function wodGenerateTerrainCellsInWorker(payload) {
    return new Promise(function(resolve, reject) {
        let pool = wodEnsureMapGenWorkerPool();
        if(pool.length >= 2 && payload && payload.rows != null) {
            let rows = payload.rows | 0;
            let bands = pool.length;
            let jobs = [];
            for(let bi = 0; bi < bands; bi++) {
                let span = (rows * 2 + 1) / bands;
                let rMin = Math.round(-rows + span * bi);
                let rMax = Math.round(-rows + span * (bi + 1)) - 1;
                if(bi === bands - 1) rMax = rows;
                jobs.push(wodMapGenWorkerCall(pool[bi], Object.assign({}, payload, {
                    cmd: 'terrain',
                    rowMin: rMin,
                    rowMax: rMax
                })));
            }
            Promise.all(jobs).then(function(parts) {
                let merged = [];
                for(let pi = 0; pi < parts.length; pi++) {
                    let chunk = parts[pi];
                    if(chunk && chunk.length) merged = merged.concat(chunk);
                }
                if(!merged.length) {
                    reject(new Error('empty terrain'));
                    return;
                }
                wodMapGenWorkerCall(pool[0], { cmd: 'smooth', hexList: merged, jobId: ++wodMapGenJobId })
                    .then(resolve)
                    .catch(function() { resolve(merged); });
            }).catch(reject);
            return;
        }
        let w = wodEnsureMapGenWorker();
        if(!w) {
            reject(new Error('no worker'));
            return;
        }
        let jobId = ++wodMapGenJobId;
        let settled = false;
        function finish(err, hexList) {
            if(settled) return;
            settled = true;
            w.removeEventListener('message', onMsg);
            w.removeEventListener('error', onErr);
            if(err) reject(err);
            else resolve(hexList);
        }
        function onMsg(ev) {
            let d = ev.data;
            if(!d || d.jobId !== jobId) return;
            if(d.ok) finish(null, d.hexList);
            else finish(new Error(d.err || 'terrain worker failed'));
        }
        function onErr(e) { finish(e || new Error('terrain worker error')); }
        w.addEventListener('message', onMsg);
        w.addEventListener('error', onErr);
        try {
            w.postMessage(Object.assign({ cmd: 'terrain', jobId: jobId }, payload));
        } catch(e) { finish(e); }
    });
}
function wodPassiveDisplacementAllowed(unit,x,y) {
    if(!wodSamplePosOnWalkableTerrain(unit,x,y))return false;
    if(wodIsNavalUnit(unit)||unit.type==='convoy')return true;
    // The corner tolerance of a diagonal pass exists for marching through the pass. A
    // shove or sidestep must not park a unit in it on the peak's side of the corner.
    const cell=getNearestHexToPoint(x,y);
    if(cell&&cell.type==='mountain'&&!wodCanClimb(unit))return false;
    const next=wodUnitSupplyHex({type:unit.type,owner:unit.owner,x,y},cell);
    const here=wodUnitSupplyHex(unit,getNearestHexToPoint(unit.x,unit.y));
    if(here&&!isWaterHex(here)&&isWaterHex(next)&&!wodPointOnBridgeForUnit(unit,x,y,1.05))return false;
    if(next&&wodIsFriendlyOwner(next.owner,unit.owner)||wodPointOnBridgeForUnit(unit,x,y,1.05)){
        if(here&&wodIsFriendlyOwner(here.owner,unit.owner)){
            const samples=Math.ceil(Math.hypot(x-unit.x,y-unit.y)/((gameData.hexRadius||20)*.3));
            for(let i=1;i<samples;i++){
                const px=unit.x+(x-unit.x)*i/samples,py=unit.y+(y-unit.y)*i/samples;
                const h=wodUnitSupplyHex({type:unit.type,owner:unit.owner,x:px,y:py},getNearestHexToPoint(px,py));
                if((!h||!wodIsFriendlyOwner(h.owner,unit.owner))&&!wodPointOnBridgeForUnit(unit,px,py,1.05))return false;
            }
        }
        return true;
    }
    if(here&&wodIsFriendlyOwner(here.owner,unit.owner))return false;
    // A shove off a bridge must not turn a withdrawal into a swim.
    if(wodUnitOnBridgeDeck(unit)&&isWaterHex(next))return false;
    return true;
}
function wodRunUnitSeparationSync(sepPad,cellSize) {
    const units=gameData.entities,cs=cellSize||96;
    for(let pass=0;pass<32;pass++) {
        gameData.unitSpatialGrid=buildUnitSpatialGrid(cs);let overlaps=0;
        for(let i=0;i<units.length;i++) {
            const a=units[i];if(a.hp<=0||a.type==='convoy')continue;
            forEachNearbyUnit(gameData.unitSpatialGrid,a.x,a.y,(a.radius||10)+65,b=>{
                if(b===a||b.hp<=0||b.type==='convoy'||b._gridIndex<=i)return;
                let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),min=(a.radius||10)+(b.radius||10)+2;
                if(d>=min-.001)return;overlaps++;
                if(d<.0001){const hash=String(ensureUnitId(a)+ensureUnitId(b)).split('').reduce((n,c)=>n*31+c.charCodeAt(0),0)>>>0;const angle=(hash%360)*Math.PI/180;dx=Math.cos(angle);dy=Math.sin(angle);d=1;}
                const len=Math.hypot(dx,dy),nx=dx/len,ny=dy/len,over=min-Math.hypot(b.x-a.x,b.y-a.y)+.002;
                const move=(u,x,y)=>{if(!wodPassiveDisplacementAllowed(u,x,y))return false;u.x=x;u.y=y;u._drawX=x;u._drawY=y;return true;};
                const movingA=!!a.target,movingB=!!b.target,aw=movingA&&!movingB?1:!movingA&&movingB?0:.5,bw=1-aw;
                let am=aw>0&&move(a,a.x-nx*over*aw,a.y-ny*over*aw),bm=bw>0&&move(b,b.x+nx*over*bw,b.y+ny*over*bw);
                if(am&&!bm&&bw)move(a,a.x-nx*over*bw,a.y-ny*over*bw);
                if(bm&&!am&&aw)move(b,b.x+nx*over*aw,b.y+ny*over*aw);
                if(!am&&!bm)for(const turn of [Math.PI/2,-Math.PI/2,Math.PI,-Math.PI/4,Math.PI/4]) {
                    const cx=nx*Math.cos(turn)-ny*Math.sin(turn),cy=nx*Math.sin(turn)+ny*Math.cos(turn);
                    if(move(b,a.x+cx*min,a.y+cy*min))break;
                }
            });
        }
        if(!overlaps)break;
    }
    gameData.unitSpatialGrid=buildUnitSpatialGrid(cs);
}
function wodBeginSimPfBudget(entCount) {
    wodPfSpentMs = 0;gameData._wodBridgeSearchFrameDone=false;gameData._wodAiRouteFrameDone=false;gameData._wodTradeSpawnFrameDone=false;gameData._wodBridgeRouteFrameDone=false;gameData._trafficPlanFrameDone=false;gameData._wodDefenseFrameDone=false;
    let n = entCount | 0;
    let mapCells = (gameData && gameData.hexList) ? gameData.hexList.length : 0;
    // Larger maps need a bit more PF headroom so columns don't fall back to
    // greedy/straight hops that look like weird zig-zag movement.
    wodPfBudgetMs = n > 200 ? 2.8 : (n > 120 ? 3.4 : (n > 70 ? 4.2 : 5.2));
    if(mapCells > 12000) wodPfBudgetMs *= 1.25;
    else if(mapCells > 7000) wodPfBudgetMs *= 1.12;
    if(wodUsesVisualViewportLayout()) wodPfBudgetMs *= 0.78;
    if((gameData._wodPlayerMovingN || 0) > 0) wodPfBudgetMs *= 1.2;
    // This is CPU time per rendered frame, not simulation time. Fast-forward
    // must not triple the work or refresh this budget for each substep.
    wodPfBudgetMs = Math.min(wodUsesVisualViewportLayout()?4:6.5,wodPfBudgetMs);
}
function wodCanSpendPf() {
    return wodPfSpentMs < wodPfBudgetMs;
}
function wodPfChargeMs(ms) {
    wodPfSpentMs += ms;
}
function wodRunUnitSeparation(wodSkipSep,sepPad,cellSize) {
    // The same current-frame constraints apply to every owner (the old worker result and
    // narrow-lane ghosting both allowed visible stacks).
    wodRunUnitSeparationSync(sepPad,cellSize);
}
let gameData = {
    money: 10000, income: 10, expenses: 0, manpower: 5000, manpowerIncome: 0, gold: 100, speed: 1,
    entities: [], cities: [], roads: [], forts: [], hospitals: [], bridges: [], constructionJobs: [],
    hexes: {}, hexList: [],
    camera: { x: 0, y: 0, zoom: 0.5 },
    selection: [], buildMode: null,
    hexRadius: 20, mapRadius: 40,
    mapShape: 'island',
    /** Starting towns per player on generated maps (setup option, 1-4). */
    citiesPerPlayer: 2,
    loadedCustomMap: false,
    alliances: [],
    mission: null,
    layers: { terrain: true, diplomacy: true, territory: false, cities: false, cityNames: true, structures: true, units: true },
    aiCount: 1,
    victoryMode: 'domination',
    fogOfWar: false,
    _fogVisible: null,
    _fogExplored: null,
    _fogVisionTimer: 0,
    _fogCanvas: null,
    _fogCtx: null,
    _fogCanvasDirty: true,
    _campaignEnded: false,
    casualties: 0,
    enemyCasualties: 0,
    casualtiesByOwner: {},
    killsByOwner: {},
    tankKillsByOwner: {},
    shipKillsByOwner: {},
    casualtyReplacementCostByOwner: {},
    aiMoneyByOwner: {},
    aiManpowerByOwner: {},
    citySkin: 'classic',
    unitSkin: 'nato',
    aiUnitSkin: 'nato',
    shopPreviewPlayerColor: '#2ecc71',
    shopPreviewAiColor: '#e74c3c',
    ownedUnitSkins: { nato: true },
    ownedShopVisuals: {},
    gamePeriod: 'modern',
    terrainViewMode: 'natural',
    menuAttractMode: false,
    playerShiftWaypoints: [],
    pathStrokePreview: null,
    uiSettings: {
        showOrdersWhenDeselected: true,
        orderArrowsUsePathfinding: true,
        frontlineStyle: 'solid',
        commandArrowStyle: 'default',
        frontlineColor: 'black',
        commandArrowColor: 'black',
        mapSkin: 'default'
    },
    mp: null,
    _wodSkipMapGenLoader: false,
    /** When set, `generateMap` reads `{ mapShape?, cities?, territory?, units? }` then clears in `finally`. */
    _mapGenOptions: null,
};
const SL_UI_SETTINGS_KEY = 'simplewars_ui_settings.v1';
const SL_UI_SETTINGS_LEGACY = 'wod_ui_settings_v1';
const WOD_FRONTLINE_STYLES = {
    solid: { shopId: null },
    dotted: { shopId: 'viz_frontline_dotted' },
    double: { shopId: 'viz_frontline_double' },
    dashed: { shopId: 'viz_frontline_dashed' },
    dashdot: { shopId: 'viz_frontline_dashdot' },
    thick: { shopId: 'viz_frontline_thick' },
    glow: { shopId: 'viz_frontline_glow' }
};
const WOD_COMMAND_ARROW_STYLES = {
    default: { shopId: null, head: 'open' },
    dotted: { shopId: 'viz_arrow_dotted', head: 'open', dash: [6, 7] },
    line: { shopId: 'viz_arrow_line', head: 'none' },
    dashed: { shopId: 'viz_arrow_dashed', head: 'open', dash: [30, 9] },
    chevron: { shopId: 'viz_arrow_chevron', head: 'chevron' },
    bold: { shopId: 'viz_arrow_bold', head: 'filled', widthMul: 1.65 },
    rail: { shopId: 'viz_arrow_rail', head: 'open', rail: true }
};
