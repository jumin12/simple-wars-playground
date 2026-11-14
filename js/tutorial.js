// Guided tutorial: a small scripted first battle that teaches the basics step by step.
// Part of the game script; loaded by index.html before js/main.js (functions and plain constants only).
//
// The tutorial loads a hand-built island like a mission, places its own troops once the match has started,
// keeps the enemy's AI suspended (wodAiSetSuspended) and moves the enemy itself when the script calls for
// it. Each step has a short text, an optional highlight (a part of the HUD or a place on the map) and a
// condition that completes it. Steps check the game state rather than counting clicks, so a player who
// runs ahead (takes a town early, recruits before being asked) simply skips the steps already done.

const WOD_TUTORIAL_CELL = 27; // world pixels per map cell at hexRadius 20
const WOD_TUTORIAL_PLAYER = 1;
const WOD_TUTORIAL_ENEMY = 2;
const WOD_TUTORIAL_TOWNS = {
    dawn: { id: 'tut_dawn', name: 'Fort Dawn', q: -18, r: 2, owner: 1 },
    mill: { id: 'tut_mill', name: 'Millbrook', q: -5, r: -5, owner: 2 },
    red: { id: 'tut_red', name: 'Redwater', q: 7, r: 4, owner: 2 },
    iron: { id: 'tut_iron', name: 'Ironhold', q: 19, r: -1, owner: 2 },
};
let wodTutorial = null;

// ---------- map ----------

/** The tutorial island in the saved-map format that WOD.loadMapData reads. */
function wodTutorialMapData() {
    const R = 40, ROWS = 32, cell = WOD_TUTORIAL_CELL;
    const hexes = new Map();
    const key = (q, r) => q + ',' + r;
    const near = (q, r, cq, cr, rad) => (q - cq) * (q - cq) + (r - cr) * (r - cr) <= rad * rad;
    const isLand = (q, r) => {
        const wobble = 1 + 0.06 * Math.sin(q * 0.7) + 0.05 * Math.cos(r * 0.9);
        return (q / 27) * (q / 27) + (r / 14) * (r / 14) <= wobble && !near(q, r, 1, -10, 2.6);
    };
    for(let r = -ROWS; r <= ROWS; r++) {
        for(let q = -R; q <= R; q++) {
            let type = isLand(q, r) ? 'grass' : 'water';
            if(type === 'grass') {
                if(near(q, r, -11, -2, 3.2) || near(q, r, 4, 0, 2.2)) type = 'forest';
                else if(near(q, r, 8, 3, 3.6)) type = 'hill';
                else if(near(q, r, -2, 7, 2.3)) type = 'swamp';
                else if(q >= 12 && q <= 13 && r >= 5 && r <= 9) type = 'mountain';
            }
            const owner = type === 'water' ? 0 : (q <= -10 ? WOD_TUTORIAL_PLAYER : WOD_TUTORIAL_ENEMY);
            hexes.set(key(q, r), { q, r, x: q * cell, y: r * cell, type, owner });
        }
    }
    // Sandy shore on land cells that touch water.
    for(const h of hexes.values()) {
        if(h.type !== 'grass') continue;
        for(const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = hexes.get(key(h.q + dq, h.r + dr));
            if(n && n.type === 'water') { h.type = 'sand'; break; }
        }
    }
    const cities = [];
    for(const t of Object.values(WOD_TUTORIAL_TOWNS)) {
        for(let dq = -1; dq <= 1; dq++) for(let dr = -1; dr <= 1; dr++) {
            const h = hexes.get(key(t.q + dq, t.r + dr));
            h.type = 'urban'; h.owner = t.owner; h.cityId = t.id; h.urbanVariant = 1 + ((dq + dr + 3) % 3);
        }
        cities.push({ id: t.id, name: t.name, x: t.q * cell, y: t.r * cell, q: t.q, r: t.r, owner: t.owner,
            hasFactory: false, hasHarbor: false, hp: 1000, maxHp: 1000, urbanStyle: 1, incomeBonus: 0, manpowerBonus: 0 });
    }
    return {
        format: 'simple-wars-mission', version: 1,
        mapSize: 40, mapShape: 'rectangle', hexRadius: 20,
        hexList: [...hexes.values()], cities, roads: [], entities: [], forts: [], bridges: [], alliances: [],
        savedStartEconomy: true, money: 9000, manpower: 9000,
        aiMoneyByOwner: { 1: 0, 2: 0 }, aiManpowerByOwner: { 1: 0, 2: 0 },
        mission: { version: 1, title: 'Tutorial', victoryMode: 'domination', events: [] },
    };
}

// ---------- helpers ----------

function wodTutorialTown(k) {
    return gameData.cities.find(c => c.id === WOD_TUTORIAL_TOWNS[k].id) || null;
}
function wodTutorialWorld(q, r) { return { x: q * WOD_TUTORIAL_CELL, y: r * WOD_TUTORIAL_CELL }; }
function wodTutorialOwnArmy() {
    return gameData.entities.filter(u => u.owner === WOD_TUTORIAL_PLAYER && u.hp > 0 && u.type !== 'convoy');
}
function wodTutorialPlayerJob(mode) {
    return (gameData.constructionJobs || []).some(j => j.owner === WOD_TUTORIAL_PLAYER && j.mode === mode);
}
function wodTutorialUnitHeadingNear(u, pt, cells) {
    const lim = cells * WOD_TUTORIAL_CELL;
    const g = u.orderTarget || (u.target && !u.target.isCity ? (u.target.finalTarget || u.target) : null);
    if(g && Number.isFinite(g.x) && Math.hypot(g.x - pt.x, g.y - pt.y) < lim) return true;
    if(Array.isArray(u.path) && u.path.length) {
        const end = u.path[u.path.length - 1];
        if(end && Number.isFinite(end.x) && Math.hypot(end.x - pt.x, end.y - pt.y) < lim) return true;
    }
    return Math.hypot(u.x - pt.x, u.y - pt.y) < lim;
}
function wodTutorialTouch() {
    try { return matchMedia('(pointer: coarse)').matches || wodUsesVisualViewportLayout(); } catch(_) { return false; }
}
/** First element of the selectors that is on screen. */
function wodTutorialVisibleEl(selectors) {
    for(const sel of selectors) {
        for(const el of document.querySelectorAll(sel)) {
            const r = el.getBoundingClientRect();
            if(r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden') return el;
        }
    }
    return null;
}
function wodTutorialCenterCamera(pt) {
    const vw = canvas.clientWidth || 1, vh = canvas.clientHeight || 1;
    gameData.camera.x = pt.x * gameData.camera.zoom - vw / 2;
    gameData.camera.y = pt.y * gameData.camera.zoom - vh / 2;
}
function wodTutorialSetPaused(paused) {
    const t = wodTutorial;
    if(!t) return;
    if(paused && !t.pausedByTutorial) {
        t.speedBefore = gameData.speed > 0 ? gameData.speed : 1;
        t.pausedByTutorial = true;
        setGameSpeed(0, true);
    } else if(!paused && t.pausedByTutorial) {
        t.pausedByTutorial = false;
        setGameSpeed(t.speedBefore || 1, true);
    }
}

// ---------- the steps ----------
// Each step: id, title, text (string or function of the tutorial state), what to point at (worldTarget: a map
// point, or target: HUD selectors; the map point wins while it returns one), done(t) for action steps, optional
// enter(t), and info: true for steps that only need Next (the battle is paused while they are read).

function wodTutorialSteps() {
    const touch = wodTutorialTouch();
    const T = WOD_TUTORIAL_TOWNS;
    const at = k => wodTutorialWorld(T[k].q, T[k].r);
    return [
        { id: 'welcome', info: true, title: 'Welcome, Commander',
          text: 'This short battle teaches the basics: moving troops, taking towns, recruiting and supply. It takes about ten minutes, and you can leave at any time from Menu.<br><br>Your goal in every battle is the same: <b>capture every enemy town</b>.' },
        { id: 'camera', title: 'Look around',
          text: touch ? 'Drag with one finger to move the map and pinch to zoom.'
              : 'Move the map with <b>W A S D</b> or the <b>arrow keys</b>, or drag it with the right mouse button. Zoom with the <b>mouse wheel</b>.',
          enter: t => { t.cam0 = { x: gameData.camera.x, y: gameData.camera.y, z: gameData.camera.zoom }; },
          done: t => Math.hypot(gameData.camera.x - t.cam0.x, gameData.camera.y - t.cam0.y) > 140 || Math.abs(gameData.camera.zoom - t.cam0.z) > t.cam0.z * 0.12 },
        { id: 'select', title: 'Select your troops', worldTarget: () => wodTutorialArmyCentre(), radius: 4,
          text: touch ? 'Your regiments wait outside Fort Dawn. <b>Tap a regiment</b> to select it.'
              : 'Your regiments wait outside Fort Dawn. <b>Click</b> a regiment to select it, or <b>drag a box</b> around several to select a group.',
          enter: () => wodTutorialCenterCamera(wodTutorialArmyCentre()),
          done: () => gameData.selection.some(s => s.owner === WOD_TUTORIAL_PLAYER && !s.isCity && s.hp > 0) },
        { id: 'card', info: true, title: 'The unit card', target: ['#infoCard'],
          text: 'The card shows the selected regiment: its <b>strength</b>, <b>manpower</b>, <b>morale</b> and experience. Morale drops under fire; a regiment whose morale breaks runs back on its own. The terrain page lists the ground it stands on.' },
        { id: 'move', title: 'Give an order', worldTarget: () => at('mill'), radius: 3,
          text: touch ? 'With troops selected, tap <b>Move</b> on the unit card, then tap the ground near the highlighted town, <b>Millbrook</b>.'
              : 'With troops selected, <b>right-click</b> the ground to move there. Send them toward the highlighted town, <b>Millbrook</b>.',
          enter: () => wodTutorialCenterCamera({ x: (at('dawn').x + at('mill').x) / 2, y: (at('dawn').y + at('mill').y) / 2 }),
          done: () => wodTutorialOwnArmy().some(u => wodTutorialUnitHeadingNear(u, at('mill'), 6)) },
        { id: 'capture', title: 'Take a town', worldTarget: () => wodTutorialTownFocus('mill'), radius: 2.6,
          text: () => 'Millbrook belongs to the enemy but nobody guards it. A town changes hands when you hold <b>every one of its streets</b>, so walk your troops into it. Towns give money and manpower, and they are where you recruit.'
              + wodTutorialStreetsHint('mill'),
          enter: () => wodTutorialShowTerritory(),
          done: () => wodTutorialTown('mill')?.owner === WOD_TUTORIAL_PLAYER },
        { id: 'economy', info: true, title: 'Money and manpower', targetAll: true,
          target: ['.wod-hud-compact-group', '.wod-m-resource-card'],
          text: 'Everything costs <b>money</b> and <b>manpower</b>. Both come in every second from your towns and your land; the green number is your income. Capturing more towns and ground raises it.' },
        { id: 'recruit', title: 'Recruit a regiment',
          worldTarget: () => gameData.buildMode === 'light' ? wodTutorialNearestOwnTown() : null, radius: 2.4,
          target: () => wodTutorialProductionTarget('units', "button[onclick=\"buyUnit('light')\"]"),
          text: () => gameData.buildMode === 'light'
              ? (wodTutorialTouch() ? 'Now <b>tap one of your towns</b> (they are circled). The new regiment appears beside it after 15 seconds.'
                  : 'Now <b>click one of your towns</b> (they are circled). The new regiment appears beside it after 15 seconds.')
              : (wodTutorialTouch() ? 'Open <b>Units</b> at the bottom and tap <b>Train Infantry</b>.'
                  : 'Open <b>Units</b> at the bottom of the screen and press <b>Train Infantry</b>.'),
          enter: t => { t.light0 = wodTutorialOwnArmy().filter(u => u.type === 'light').length; },
          done: t => wodTutorialPlayerJob('light') || wodTutorialOwnArmy().filter(u => u.type === 'light').length > t.light0 },
        { id: 'factory', title: 'Build a factory',
          worldTarget: () => gameData.buildMode === 'factory' ? wodTutorialNearestOwnTown() : null, radius: 2.4,
          target: () => wodTutorialProductionTarget('structures', 'button[onclick="beginFactoryBuild()"]'),
          text: () => gameData.buildMode === 'factory'
              ? 'Now <b>' + (wodTutorialTouch() ? 'tap' : 'click') + ' one of your towns</b> to build the factory there. A town works on one order at a time, so pick one that is not training troops. Every building takes 60 seconds.'
              : 'Factories unlock armour and motorized infantry. Open <b>Buildings</b> and press <b>Build Factory</b>.',
          done: () => wodTutorialPlayerJob('factory') || gameData.cities.some(c => c.owner === WOD_TUTORIAL_PLAYER && c.hasFactory) },
        { id: 'terrain', info: true, title: 'Ground matters', worldTarget: () => at('red'), radius: 4.2,
          enter: () => wodTutorialCenterCamera(at('red')),
          text: '<b>Redwater</b> sits on hills with a wood in front of it. Troops in woods, on hills and in towns take less damage, so a defended town needs more attackers. Open ground suits fast troops; rough ground slows them.' },
        { id: 'attack', title: 'Attack Redwater', worldTarget: () => wodTutorialTownFocus('red'), radius: 2.6,
          text: () => 'Two enemy regiments hold Redwater. Bring <b>at least three</b> of yours and take the town. Units fire on their own at enemies in range; '
              + (wodTutorialTouch() ? 'tap an enemy with troops selected to focus fire on it.' : '<b>left-click an enemy</b> with troops selected to focus fire on it.')
              + (wodTutorial && wodTutorial.sawFight ? '<br><br><i>Under fire, morale falls. Pull a regiment out before it breaks: select it and press Retreat.</i>' : '')
              + wodTutorialStreetsHint('red'),
          done: () => wodTutorialTown('red')?.owner === WOD_TUTORIAL_PLAYER },
        { id: 'supply', info: true, title: 'Supply lines', target: () => wodTutorialLayerButton('territory'),
          text: 'Troops need a <b>land route through your own ground</b> to one of your towns. A regiment that is cut off gets a warning, then a 10-second countdown, and then it loses strength every second until the route is open again.<br><br>So keep your line joined up, and do not march deep into enemy land alone. The <b>Territory</b> layer shows who owns what.' },
        { id: 'heal', info: true, title: 'Healing',
          worldTarget: () => at('red'), radius: 2.6,
          text: 'Damaged regiments recover inside your towns, and near hospitals, as long as no enemy is attacking there. A town under attack stops recruiting and healing until the fight is over.' },
        { id: 'counter', title: 'Hold Redwater', worldTarget: () => at('red'), radius: 3.2,
          enter: t => wodTutorialLaunchCounterattack(t),
          text: () => (wodTutorialTown('red')?.owner === WOD_TUTORIAL_PLAYER
              ? 'The enemy is counterattacking Redwater! <b>Hold the town.</b> '
              : 'The enemy has retaken Redwater. <b>Win it back!</b> ')
              + (wodTutorialTouch() ? 'Use the speed menu at the top to pause while you give orders.' : 'Press <b>Space</b> to pause while you give orders; the speed buttons at the top make time run faster.'),
          done: t => wodTutorialWaveBeaten(t) && wodTutorialTown('red')?.owner === WOD_TUTORIAL_PLAYER },
        { id: 'final', title: 'Take Ironhold', worldTarget: () => wodTutorialTownFocus('iron'), radius: 2.8,
          enter: () => wodTutorialCenterCamera(at('iron')),
          text: () => 'Last step: capture <b>Ironhold</b>, the enemy capital. When the enemy has no towns left, you win. Recruit more troops first if you need them.'
              + wodTutorialStreetsHint('iron'),
          done: () => false },
    ];
}
function wodTutorialArmyCentre() {
    const army = wodTutorialOwnArmy();
    if(!army.length) return wodTutorialWorld(WOD_TUTORIAL_TOWNS.dawn.q, WOD_TUTORIAL_TOWNS.dawn.r);
    return { x: army.reduce((s, u) => s + u.x, 0) / army.length, y: army.reduce((s, u) => s + u.y, 0) / army.length };
}
/** Streets of a tutorial town the player does not hold yet. */
function wodTutorialEnemyStreets(k) {
    const t = wodTutorial;
    if(!t) return [];
    if(!t.streets || t.streets.hexList !== gameData.hexList) { // each town's street cells, found once per map
        t.streets = { hexList: gameData.hexList };
        for(const key of Object.keys(WOD_TUTORIAL_TOWNS))
            t.streets[key] = gameData.hexList.filter(h => h.cityId === WOD_TUTORIAL_TOWNS[key].id);
    }
    return t.streets[k].filter(h => h.owner !== WOD_TUTORIAL_PLAYER);
}
/** True once the player's troops stand in or right beside the town. */
function wodTutorialArmyAtTown(k) {
    const t = WOD_TUTORIAL_TOWNS[k], c = wodTutorialWorld(t.q, t.r);
    return wodTutorialOwnArmy().some(u => Math.hypot(u.x - c.x, u.y - c.y) < 2.6 * WOD_TUTORIAL_CELL);
}
/** Where to point for a town: the town, or the last street still held by the enemy once troops are there. */
function wodTutorialTownFocus(k) {
    const t = WOD_TUTORIAL_TOWNS[k];
    const left = wodTutorialEnemyStreets(k);
    if(left.length && left.length <= 4 && wodTutorialArmyAtTown(k)) return { x: left[0].x, y: left[0].y, radius: 0.9 };
    return wodTutorialWorld(t.q, t.r);
}
function wodTutorialStreetsHint(k) {
    const left = wodTutorialEnemyStreets(k).length;
    if(!left || left > 4 || !wodTutorialArmyAtTown(k)) return '';
    return '<br><br><b>Almost there:</b> ' + (left === 1 ? 'one street is' : left + ' streets are')
        + ' still the enemy\'s (circled). Move a regiment onto ' + (left === 1 ? 'it' : 'each of them') + '.';
}
/** The player's town nearest the middle of the screen (for "click one of your towns"). */
function wodTutorialNearestOwnTown() {
    const vw = canvas.clientWidth || 1, vh = canvas.clientHeight || 1, z = gameData.camera.zoom;
    const cx = (gameData.camera.x + vw / 2) / z, cy = (gameData.camera.y + vh / 2) / z;
    let best = null, bestD = Infinity;
    for(const c of gameData.cities) {
        if(c.owner !== WOD_TUTORIAL_PLAYER) continue;
        const d = Math.hypot(c.x - cx, c.y - cy);
        if(d < bestD) { bestD = d; best = c; }
    }
    return best ? { x: best.x, y: best.y } : null;
}
function wodTutorialShowTerritory() {
    if(!gameData.layers) gameData.layers = {};
    gameData.layers.territory = true;
    gameData.layers.cities = true;
    try { syncInGameLayerToolbar(); } catch(_) {}
}
function wodTutorialLayerButton(layer) {
    return ['#btnLayer' + layer[0].toUpperCase() + layer.slice(1), '[data-wod-mtab="map"]'];
}
/** The production tab first, then the button inside it once the tab is open. */
function wodTutorialProductionTarget(pane, buttonSel) {
    const btn = wodTutorialVisibleEl([buttonSel]);
    if(btn) return [buttonSel];
    return pane === 'units'
        ? ['#wodPcProdTabUnits', '#wodMTabUnits']
        : ['.wod-pc-prod-tab[data-wod-pc-pane="structures"]', '[data-wod-mtab="build"]'];
}
function wodTutorialLaunchCounterattack(t) {
    if(t.wave) return;
    const T = WOD_TUTORIAL_TOWNS, goal = wodTutorialWorld(T.red.q, T.red.r);
    t.wave = [];
    for(let i = 0; i < 3; i++) {
        const p = wodTutorialWorld(T.iron.q - 4, T.iron.r + 2 + i * 1.4);
        const u = createUnitAt('light', p.x, p.y, WOD_TUTORIAL_ENEMY);
        if(!u) continue;
        t.wave.push(u.uid);
        wodTutorialOrder(u, goal.x + (i - 1) * 18, goal.y);
    }
    t.waveAt = gameData._wodSimTick || 0;
}
function wodTutorialOrder(u, x, y) {
    try { wodAiMoveUnitToward(u, x, y, false); } catch(err) { wodReportRuntimeError(err, 'tutorial order'); }
}
function wodTutorialWaveBeaten(t) {
    if(!t.wave) return false;
    const alive = gameData.entities.filter(u => t.wave.includes(u.uid) && u.hp > 0);
    // Survivors that were driven off count as beaten once the town has held for a minute.
    const held = ((gameData._wodSimTick || 0) - (t.waveAt || 0)) * 0.05 > 60;
    return alive.length === 0 || (held && alive.every(u => u.moraleBroken || u.retreating));
}

// ---------- setup once the match is running ----------

function wodTutorialSetupBattle(t) {
    const T = WOD_TUTORIAL_TOWNS;
    gameData.entities = gameData.entities.filter(u => u.type === 'convoy');
    const place = (type, owner, q, r) => { const p = wodTutorialWorld(q, r); return createUnitAt(type, p.x, p.y, owner); };
    for(const [q, r] of [[-14, 0], [-14, 2], [-13, 4], [-15, -2]]) place('light', WOD_TUTORIAL_PLAYER, q, r);
    for(const [q, r] of [[6, 4], [8, 3]]) place('light', WOD_TUTORIAL_ENEMY, q, r);
    for(const [q, r] of [[18, -2], [20, 0], [18, 1]]) place('light', WOD_TUTORIAL_ENEMY, q, r);
    for(const c of gameData.cities) { c.hasFactory = false; c.hasHarbor = false; c.hasFarm = false; }
    gameData.money = 9000;
    gameData.manpower = 9000;
    if(!gameData.aiMoneyByOwner) gameData.aiMoneyByOwner = {};
    if(!gameData.aiManpowerByOwner) gameData.aiManpowerByOwner = {};
    gameData.aiMoneyByOwner[WOD_TUTORIAL_ENEMY] = 0;
    gameData.aiManpowerByOwner[WOD_TUTORIAL_ENEMY] = 0;
    gameData.fogOfWar = false;
    if(typeof wodAiSetSuspended === 'function') wodAiSetSuspended(WOD_TUTORIAL_ENEMY, true);
    gameData.camera.zoom = Math.max(0.55, Math.min(1, (canvas.clientWidth || 1280) / 1500));
    wodTutorialCenterCamera(wodTutorialWorld(T.dawn.q + 4, T.dawn.r));
    t.ready = true;
}

// ---------- start, run, finish ----------

/** Start the guided tutorial from the menu. */
async function wodStartTutorial() {
    if(wodTutorial) wodEndTutorial();
    // The menu's background battle may still be generating its map at boot; it shares gameData, so wait
    // for it, then pause it (which stores its state) before the tutorial map replaces the live map.
    for(let i = 0; (window._wodBootBusy || window._wodMenuBootstrapBusy) && i < 600; i++)
        await new Promise(r => setTimeout(r, 100));
    pauseMenuBackgroundBattle();
    let data;
    try {
        data = wodTutorialMapData();
        WOD.loadMapData(data);
    } catch(err) {
        wodReportRuntimeError(err, 'tutorial map');
        showNotification('The tutorial could not be loaded.');
        return;
    }
    gameData.loadedCustomMap = true;
    gameData._selectedMissionEntry = null;
    gameData._soloMapPreviewMatchesStart = true;
    gameData._soloPreviewSnapshot = null;
    gameData.aiCount = 1;
    gameData.victoryMode = 'domination';
    gameData.fogOfWar = false;
    try { wodSyncSetupControlsFromLoadedMap(); } catch(_) {}
    const fog = document.getElementById('setupFogOfWar');
    if(fog) fog.checked = false;
    const vic = document.getElementById('setupVictoryMode');
    if(vic) vic.value = 'domination';
    wodTutorial = { steps: wodTutorialSteps(), index: -1, ready: false, startedAt: Date.now() };
    wodTutorialBuildDom();
    gameData._launchingMission = true;
    startGame('ai', { mission: true });
    requestAnimationFrame(wodTutorialFrame);
}

function wodTutorialFrame() {
    const t = wodTutorial;
    if(!t) return;
    try { wodTutorialTick(t); } catch(err) { wodReportRuntimeError(err, 'tutorial'); }
    if(wodTutorial === t) requestAnimationFrame(wodTutorialFrame);
}

function wodTutorialTick(t) {
    if(gameState === 'MENU' && t.ready) { wodEndTutorial(); return; }
    if(gameState !== 'PLAYING') return;
    if(!t.ready) {
        if(gameData._matchReadyForEndChecks && gameData.cities.some(c => c.id === WOD_TUTORIAL_TOWNS.dawn.id)) {
            wodTutorialSetupBattle(t);
            wodTutorialGoTo(t, 0);
        }
        return;
    }
    if(gameData._campaignEnded) {
        wodTutorialFinish(t);
        // The tutorial's own end card replaces the usual battle summary.
        if(document.getElementById('campaignSummaryOverlay')?.classList.contains('hidden') === false) hideCampaignSummaryOverlay();
        return;
    }
    if(!t.sawFight && wodTutorialOwnArmy().some(u => u._combatEngaged)) { t.sawFight = true; t.textDirty = true; }
    const step = t.steps[t.index];
    if(!step) return;
    if(!step.info && step.done && step.done(t)) { wodTutorialGoTo(t, t.index + 1); return; }
    if(typeof step.text === 'function' && (t.textDirty || ((t.frames = (t.frames || 0) + 1) % 30 === 0))) { t.textDirty = false; wodTutorialRenderPanel(t); }
    wodTutorialPlaceSpot(t, step);
}

function wodTutorialGoTo(t, index) {
    // Later steps whose goal is already met are skipped (a player who runs ahead loses nothing).
    while(index < t.steps.length) {
        const s = t.steps[index];
        if(s.info || !s.done) break;
        if(s.enter) s.enter(t);
        if(!s.done(t)) break;
        index++;
    }
    t.index = index;
    const step = t.steps[index];
    if(!step) return;
    if(step.info && step.enter) step.enter(t);
    wodTutorialSetPaused(!!step.info);
    wodTutorialRenderPanel(t);
    wodTutorialPlaceSpot(t, step);
}

function wodTutorialNext() {
    const t = wodTutorial;
    if(!t) return;
    wodTutorialGoTo(t, t.index + 1);
}

function wodTutorialFinish(t) {
    if(t.finished) return;
    t.finished = true;
    wodTutorialSetPaused(false);
    const won = gameData.cities.some(c => c.owner === WOD_TUTORIAL_PLAYER) && !gameData.cities.some(c => c.owner === WOD_TUTORIAL_ENEMY);
    if(won && wodProgress) {
        wodProgress.tutorial = { completed: true, at: Date.now() };
        try { scheduleSaveWodProgress(); } catch(_) {}
    }
    t.result = won ? 'won' : 'lost';
    wodTutorialRenderPanel(t);
    wodTutorialPlaceSpot(t, null);
}

/** Leave the tutorial: removes its panel and gives the enemy its AI back. */
function wodEndTutorial() {
    const t = wodTutorial;
    wodTutorial = null;
    if(!t) return;
    if(typeof wodAiSetSuspended === 'function') wodAiSetSuspended(WOD_TUTORIAL_ENEMY, false);
    if(t.pausedByTutorial && gameState === 'PLAYING') setGameSpeed(t.speedBefore || 1, true);
    document.getElementById('wodTutPanel')?.remove();
    document.getElementById('wodTutSpot')?.remove();
}

function wodTutorialExit() {
    wodEndTutorial();
    returnToMenu();
}

function wodTutorialRestart() {
    wodEndTutorial();
    returnToMenu();
    setTimeout(wodStartTutorial, 50);
}

function wodTutorialToSkirmish() {
    wodEndTutorial();
    returnToMenu();
    showPanel('setup');
}

// ---------- DOM ----------

function wodTutorialBuildDom() {
    document.getElementById('wodTutPanel')?.remove();
    document.getElementById('wodTutSpot')?.remove();
    const spot = document.createElement('div');
    spot.id = 'wodTutSpot';
    spot.className = 'wod-tut-spot hidden';
    spot.setAttribute('aria-hidden', 'true');
    document.body.appendChild(spot);
    const panel = document.createElement('section');
    panel.id = 'wodTutPanel';
    panel.className = 'wod-tut-panel hidden';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-live', 'polite');
    panel.setAttribute('aria-labelledby', 'wodTutTitle');
    document.body.appendChild(panel);
}

function wodTutorialRenderPanel(t) {
    const panel = document.getElementById('wodTutPanel');
    if(!panel) return;
    panel.classList.remove('hidden');
    if(t.result) {
        const won = t.result === 'won';
        panel.className = 'wod-tut-panel wod-tut-panel--end';
        panel.innerHTML = '<p class="wod-tut-kicker">Tutorial</p>'
            + '<h2 id="wodTutTitle">' + (won ? 'Tutorial complete' : 'Not this time') + '</h2>'
            + '<p class="wod-tut-text">' + (won
                ? 'Well done, Commander. You know the basics now. Next, try a <b>Skirmish</b> against the computer on a small map. The <b>Guide</b> in Tutorial &amp; help explains everything else, including ships and supply in detail.'
                : 'The enemy took your towns. Try again: keep your troops together and attack with more regiments than the defenders.') + '</p>'
            + '<div class="wod-tut-actions">'
            + (won ? '<button type="button" class="wod-tut-btn wod-tut-btn--primary" onclick="wodTutorialToSkirmish()">Play a skirmish</button>'
                   : '<button type="button" class="wod-tut-btn wod-tut-btn--primary" onclick="wodTutorialRestart()">Try again</button>')
            + '<button type="button" class="wod-tut-btn" onclick="wodTutorialExit()">Main menu</button></div>';
        return;
    }
    const step = t.steps[t.index];
    if(!step) { panel.classList.add('hidden'); return; }
    const body = typeof step.text === 'function' ? step.text(t) : step.text;
    const shown = t.steps.length;
    panel.className = 'wod-tut-panel' + (step.info ? ' wod-tut-panel--info' : '');
    panel.innerHTML = '<div class="wod-tut-head"><p class="wod-tut-kicker">Tutorial · step ' + (t.index + 1) + ' of ' + shown + '</p>'
        + '<button type="button" class="wod-tut-exit" onclick="wodTutorialExit()" title="Leave the tutorial">Exit</button></div>'
        + '<h2 id="wodTutTitle">' + step.title + '</h2>'
        + '<p class="wod-tut-text">' + body + '</p>'
        + '<div class="wod-tut-actions">'
        + (step.info ? '<button type="button" class="wod-tut-btn wod-tut-btn--primary" onclick="wodTutorialNext()">' + (t.index === 0 ? 'Start' : 'Next') + '</button>' : '')
        + (!step.info && step.worldTarget && step.worldTarget() ? '<button type="button" class="wod-tut-btn" onclick="wodTutorialShowMe()">Show me</button>' : '')
        + (!step.info && step.id !== 'final' ? '<button type="button" class="wod-tut-btn wod-tut-btn--quiet" onclick="wodTutorialNext()">Skip step</button>' : '')
        + '</div>'
        + (step.info && t.index > 0 ? '<p class="wod-tut-paused">The battle is paused while you read.</p>' : '');
    const primary = panel.querySelector('.wod-tut-btn--primary');
    if(primary && step.info) primary.focus({ preventScroll: true });
}

function wodTutorialShowMe() {
    const t = wodTutorial;
    const step = t && t.steps[t.index];
    const p = step && step.worldTarget ? step.worldTarget() : null;
    if(p) wodTutorialCenterCamera(p);
}

function wodTutorialTargetRect(step) {
    const p = step.worldTarget ? step.worldTarget() : null;
    if(p) {
        const cr = canvas.getBoundingClientRect(), z = gameData.camera.zoom;
        const rad = Math.max(26, (p.radius || step.radius || 2) * WOD_TUTORIAL_CELL * z);
        const x = cr.left + p.x * z - gameData.camera.x, y = cr.top + p.y * z - gameData.camera.y;
        return { left: x - rad, top: y - rad, width: rad * 2, height: rad * 2, round: true };
    }
    const sel = typeof step.target === 'function' ? step.target(wodTutorial) : step.target;
    const el = sel && sel.length ? wodTutorialVisibleEl(sel) : null;
    if(!el) return null;
    let r = el.getBoundingClientRect();
    if(step.targetAll) { // one box around every visible match of the selector that matched
        const s = sel.find(q => el.matches(q));
        const rects = [...document.querySelectorAll(s)].map(e => e.getBoundingClientRect()).filter(b => b.width > 2 && b.height > 2);
        const left = Math.min(...rects.map(b => b.left)), top = Math.min(...rects.map(b => b.top));
        r = { left, top, width: Math.max(...rects.map(b => b.right)) - left, height: Math.max(...rects.map(b => b.bottom)) - top };
    }
    return { left: r.left - 6, top: r.top - 6, width: r.width + 12, height: r.height + 12, round: false };
}
/** Height of the bottom bars and open production dock, which the panel must not cover. */
function wodTutorialBottomInset() {
    let inset = 0;
    for(const sel of ['#wodPcProdRoot', '#wodDockPack', '.wod-m-sheet:not([hidden])', '#wodMobileDock']) {
        for(const el of document.querySelectorAll(sel)) {
            const r = el.getBoundingClientRect();
            if(r.width > 2 && r.height > 2 && r.top > window.innerHeight * 0.4) inset = Math.max(inset, window.innerHeight - r.top);
        }
    }
    return inset;
}

function wodTutorialPlaceSpot(t, step) {
    const spot = document.getElementById('wodTutSpot');
    const panel = document.getElementById('wodTutPanel');
    if(!spot || !panel) return;
    const rect = step ? wodTutorialTargetRect(step) : null;
    if(!rect) {
        spot.classList.add('hidden');
        panel.classList.toggle('wod-tut-panel--bottom', false);
        return;
    }
    spot.classList.remove('hidden');
    spot.classList.toggle('wod-tut-spot--round', rect.round);
    spot.style.left = Math.round(rect.left) + 'px';
    spot.style.top = Math.round(rect.top) + 'px';
    spot.style.width = Math.round(rect.width) + 'px';
    spot.style.height = Math.round(rect.height) + 'px';
    // Keep the panel away from whatever it points at: below it goes to the bottom-left corner, above the
    // bottom bars and any open production dock (the unit card sits bottom-right).
    const centreY = rect.top + rect.height / 2;
    const bottom = centreY < window.innerHeight * 0.45;
    panel.classList.toggle('wod-tut-panel--bottom', bottom);
    panel.style.bottom = bottom ? Math.round(wodTutorialBottomInset() + 12) + 'px' : '';
}

// ---------- menu ----------

/** True once the player has started any battle (solo or online). */
function wodHasPlayedAnyMatch() {
    if(!wodProgress) return false;
    const L = wodProgress.lifetime || {};
    const mp = wodProgress.multiplayer || {};
    const modes = wodProgress.statsByMode || {};
    const started = (L.gamesStarted || 0) + (L.matchesCompleted || 0) + (mp.gamesPlayed || 0)
        + (modes.multiplayer?.totals?.gamesStarted || 0) + (modes.singleplayer?.totals?.gamesStarted || 0);
    return started > 0 || !!wodProgress.tutorial?.completed;
}

/** New players see Tutorial & help first; everyone else finds it after Achievements. */
function wodRefreshMainMenuOrder() {
    const box = document.querySelector('#mainMenu .main-menu-btns');
    const btn = document.getElementById('wodTutorialHelpBtn');
    if(!box || !btn) return;
    const fresh = !wodHasPlayedAnyMatch();
    btn.classList.toggle('wod-menu-new-player', fresh);
    if(fresh) {
        if(box.firstElementChild !== btn) box.insertBefore(btn, box.firstElementChild);
    } else {
        const after = document.getElementById('wodAchievementsBtn');
        if(after && after.nextElementSibling !== btn) after.after(btn);
    }
}

function wodOpenTutorialHelp() {
    showPanel('tutorialHelp');
}

function wodTutorialHelpOpenGuide() {
    if(typeof wodOpenHelpGuide === 'function') wodOpenHelpGuide('tutorialHelp');
    else showPanel('helpGuide');
}
