// Menus, match setup, starting and stopping matches.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

function wodChangelogEscape(text) {
    return String(text).replace(/[&<>]/g, function(ch) {
        if(ch === '&') return '&amp;';
        if(ch === '<') return '&lt;';
        return '&gt;';
    });
}
function wodChangelogFormatStamp(iso) {
    let when = new Date(iso);
    if(isNaN(when.getTime())) return String(iso || '');
    let rounded = new Date(Math.round(when.getTime() / 60000) * 60000);
    let months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let hour24 = rounded.getHours();
    let hour12 = hour24 % 12;
    if(hour12 === 0) hour12 = 12;
    let minute = String(rounded.getMinutes()).padStart(2, '0');
    let suffix = hour24 >= 12 ? 'PM' : 'AM';
    return months[rounded.getMonth()] + ' ' + rounded.getDate() + ', ' + rounded.getFullYear()
        + ', ' + hour12 + ':' + minute + ' ' + suffix;
}
// This copy of the game: its build is the date of the newest changelog entry (ISO), its version the number the changelog
// shows for that entry (js/main.js). The multiplayer relay compares the build with the newest one it knows.
function wodClientBuild() {
    let best = NaN;
    for(const e of (typeof WOD_CHANGELOG !== 'undefined' ? WOD_CHANGELOG : [])) { const t = Date.parse(e && e.at); if(Number.isFinite(t) && !(t <= best)) best = t; }
    return Number.isFinite(best) ? new Date(best).toISOString() : '';
}
function wodClientVersion() {
    const build = wodClientBuild();
    const e = (typeof WOD_CHANGELOG !== 'undefined' ? WOD_CHANGELOG : []).find(x => Number.isFinite(Date.parse(x.at)) && new Date(Date.parse(x.at)).toISOString() === build);
    return (e && e.version) || '';
}
function wodChangelogHtml() {
    return WOD_CHANGELOG.map(function(entry) {
        let items = (entry.items || []).map(function(line) {
            return '<li>' + wodChangelogEscape(line) + '</li>';
        }).join('');
        let stamp = wodChangelogFormatStamp(entry.at);
        return '<article class="wod-changelog-entry"><div class="wod-changelog-meta"><span class="wod-changelog-version">Version ' + wodChangelogEscape(entry.version) + '</span><time datetime="' + wodChangelogEscape(entry.at) + '">'
            + wodChangelogEscape(stamp) + '</time></div><h3>'
            + wodChangelogEscape(entry.title) + '</h3><ul>' + items + '</ul></article>';
    }).join('');
}
function wodInitChangelog() {
    let html = wodChangelogHtml();
    let list = document.getElementById('wodChangelogList');
    if(list) list.innerHTML = html;
    let pop = document.getElementById('wodChangelogPopupBody');
    if(pop) pop.innerHTML = html;
}
function wodShowChangelogPopup() {
    let pop = document.getElementById('wodChangelogPopup');
    if(!pop) return;
    pop.classList.remove('hidden');
}
function wodDismissChangelogPopup() {
    let pop = document.getElementById('wodChangelogPopup');
    if(!pop || pop.classList.contains('hidden')) return;
    pop.classList.add('hidden');
    window._wodDeferMusic = false;
    wodStartMenuMusic();
    // (an out-of-date game is told so once the changelog is out of the way: js/multiplayer.js)
    if(typeof wodMaybeWarnOutdatedOnMenu === 'function') setTimeout(wodMaybeWarnOutdatedOnMenu, 250);
}
function wodQuitApplication() {
    if(window.simpleWarsDesktop && typeof window.simpleWarsDesktop.quit === 'function') {
        window.simpleWarsDesktop.quit();
        return;
    }
    window.close();
}
function wodStatsMenuOpen() {
    return UI.statsMenu && !UI.statsMenu.classList.contains('hidden');
}
function wodCitiesMenuOpen() {
    return UI.citiesMenu && !UI.citiesMenu.classList.contains('hidden');
}
function wodEnsureEscMenuDom() {
    let esc = UI.escMenu;
    let stats = UI.statsMenu;
    let wrap = UI.wrapper;
    if(!esc || !wrap) return;
    if(stats && esc.parentElement === stats) wrap.appendChild(esc);
}
function initPlayerSummaryToggle() {
    let panel = document.getElementById('playerSummary');
    let btn = document.getElementById('playerSummaryToggle');
    if(!panel || !btn) return;
    const key = 'simplewarsPlayerSummaryCollapsed';
    const keyLegacy = 'wodPlayerSummaryCollapsed';
    function apply(collapsed) {
        panel.classList.toggle('collapsed', collapsed);
        btn.textContent = collapsed ? '+' : '−';
        btn.title = collapsed ? 'Expand players chart' : 'Collapse players chart';
        btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        try { localStorage.setItem(key, collapsed ? '1' : '0'); } catch(err) {}
    }
    let collapsed = false;
    try {
        let v = localStorage.getItem(key);
        if(v == null) v = localStorage.getItem(keyLegacy);
        collapsed = v === '1';
    } catch(err) {}
    apply(collapsed);
    btn.addEventListener('click', ev => {
        ev.preventDefault();
        apply(!panel.classList.contains('collapsed'));
    });
}
function wodSyncPcTopUiClearance() {
    let ui = document.getElementById('inGameUI');
    let top = ui && ui.querySelector('.wod-hud-top');
    if(!ui || !top) return;
    if(typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 900px)').matches) return;
    let h = Math.ceil(top.getBoundingClientRect().height || 0);
    if(h < 48) h = 96;
    ui.style.setProperty('--wod-pc-top-ui-h', h + 'px');
}
function initTerrainKeyToggle() {
    let panel = document.getElementById('terrainKey');
    let btn = document.getElementById('terrainKeyToggle');
    if(!panel || !btn) return;
    const lsKey = 'simplewarsTerrainKeyCollapsed';
    const lsKeyLegacy = 'wodTerrainKeyCollapsed';
    function apply(collapsed) {
        panel.classList.toggle('collapsed', collapsed);
        btn.textContent = collapsed ? '+' : '−';
        btn.title = collapsed ? 'Expand map key' : 'Collapse map key';
        btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        try { localStorage.setItem(lsKey, collapsed ? '1' : '0'); } catch(err) {}
    }
    let collapsed = false;
    try {
        let v = localStorage.getItem(lsKey);
        if(v == null) v = localStorage.getItem(lsKeyLegacy);
        collapsed = v === '1';
    } catch(err) {}
    apply(collapsed);
    btn.addEventListener('click', ev => {
        ev.preventDefault();
        apply(!panel.classList.contains('collapsed'));
    });
}
function wodCollapsePcProductionDock() {
    let root = document.getElementById('wodPcProdRoot');
    if(root) root.classList.add('wod-pc-collapsed');
}
function wodCloseOpenGameMenusOnUnitSelect() {
    wodCollapsePcProductionDock();
    let ui = document.getElementById('inGameUI');
    if(ui && ui.getAttribute('data-mtab')) {
        ui.removeAttribute('data-mtab');
        ui.querySelectorAll('.wod-m-tab').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
        });
    }
    if(typeof wodStatsMenuOpen === 'function' && wodStatsMenuOpen() && typeof toggleWodStatsPanel === 'function')
        toggleWodStatsPanel(false);
    if(typeof wodCitiesMenuOpen === 'function' && wodCitiesMenuOpen() && typeof toggleWodCitiesPanel === 'function')
        toggleWodCitiesPanel(false);
    if(UI && UI.escMenu && !UI.escMenu.classList.contains('hidden'))
        UI.escMenu.classList.add('hidden');
}
function initWodPcProductionDock() {
    let root = document.getElementById('wodPcProdRoot');
    if(!root) return;
    let tabs = root.querySelectorAll('.wod-pc-prod-tab');
    let panes = root.querySelectorAll('.wod-pc-prod-pane');

    function openExpanded() {
        root.classList.remove('wod-pc-collapsed');
    }

    function setPane(panelId, expand) {
        tabs.forEach(t => {
            let on = t.getAttribute('data-wod-pc-pane') === panelId;
            t.classList.toggle('active', on);
            t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        panes.forEach(p => {
            let on = p.getAttribute('data-wod-pc-pane') === panelId;
            p.classList.toggle('active', on);
            if(on) p.removeAttribute('hidden');
            else p.setAttribute('hidden', '');
        });
        if(expand !== false) openExpanded();
    }
    tabs.forEach(t => {
        t.addEventListener('click', ev => {
            ev.preventDefault();
            let id = t.getAttribute('data-wod-pc-pane');
            let open = !root.classList.contains('wod-pc-collapsed');
            let already = t.classList.contains('active') && open;
            if(already) wodCollapsePcProductionDock();
            else setPane(id, true);
        });
    });
    setPane('structures', false);
    root.classList.add('wod-pc-collapsed');
}
function initWodMobileHud() {
    let root = document.getElementById('inGameUI');
    let backdrop = document.getElementById('wodMobileBackdrop');
    if(!root || !backdrop) return;
    function wodCloseSpeedPop() {
        let pop = document.getElementById('wodSpeedPop');
        let trig = document.getElementById('wodSpeedTrigger');
        if(pop) pop.hidden = true;
        if(trig) trig.setAttribute('aria-expanded', 'false');
    }
    function wodNormalizeLegacyMobileMtab() {
        let t = root.getAttribute('data-mtab');
        if(t === 'stats' || t === 'players' || t === 'intel') root.removeAttribute('data-mtab');
        else if(t === 'layers') root.setAttribute('data-mtab', 'map');
    }
    wodNormalizeLegacyMobileMtab();
    function syncTabAria() {
        let t = root.getAttribute('data-mtab');
        document.querySelectorAll('.wod-m-tab').forEach(b => {
            let id = b.getAttribute('data-wod-mtab');
            let on = id === 'intel' ? wodStatsMenuOpen()
                : (id === 'cities' ? wodCitiesMenuOpen() : (!!t && id === t));
            b.classList.toggle('active', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
    }
    document.querySelectorAll('.wod-m-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            wodCloseSpeedPop();
            if(root.getAttribute('data-build-picking') && typeof exitBuildPlacementMode === 'function')
                exitBuildPlacementMode();
            let id = btn.getAttribute('data-wod-mtab');
            if(id === 'intel') {
                toggleWodStatsPanel();
                syncTabAria();
                return;
            }
            if(id === 'cities') {
                toggleWodCitiesPanel();
                syncTabAria();
                return;
            }
            let cur = root.getAttribute('data-mtab');
            if(cur === id) root.removeAttribute('data-mtab');
            else root.setAttribute('data-mtab', id);
            syncTabAria();
        });
    });
    backdrop.addEventListener('click', () => {
        if(typeof exitBuildPlacementMode === 'function')
            exitBuildPlacementMode();
        if(wodStatsMenuOpen()) toggleWodStatsPanel(false);
        if(wodCitiesMenuOpen()) toggleWodCitiesPanel(false);
        root.removeAttribute('data-mtab');
        wodCloseSpeedPop();
        syncTabAria();
    });
    let trig = document.getElementById('wodSpeedTrigger');
    let pop = document.getElementById('wodSpeedPop');
    if(trig && pop) {
        trig.addEventListener('click', ev => {
            ev.stopPropagation();
            let open = pop.hasAttribute('hidden');
            if(open) {
                pop.removeAttribute('hidden');
                trig.setAttribute('aria-expanded', 'true');
            } else {
                pop.hidden = true;
                trig.setAttribute('aria-expanded', 'false');
            }
        });
        pop.querySelectorAll('.wod-m-speed-opt').forEach(opt => {
            opt.addEventListener('click', ev => {
                ev.stopPropagation();
                setGameSpeed(parseInt(opt.getAttribute('data-speed'), 10));
            });
        });
    }
    document.addEventListener('click', ev => {
        let p = document.getElementById('wodSpeedPop');
        let t = document.getElementById('wodSpeedTrigger');
        if(!p || !t || p.hidden) return;
        if(t.contains(ev.target) || p.contains(ev.target)) return;
        wodCloseSpeedPop();
    });
    syncTabAria();
    let dockTog = document.getElementById('wodDockToggle');
    if(dockTog) {
        dockTog.addEventListener('click', (ev) => {
            ev.stopPropagation();
            let hid = root.getAttribute('data-mdock') === 'hid';
            if(hid) {
                root.removeAttribute('data-mdock');
                dockTog.setAttribute('aria-expanded', 'true');
                dockTog.title = 'Hide bottom bar';
            } else {
                root.setAttribute('data-mdock', 'hid');
                dockTog.setAttribute('aria-expanded', 'false');
                dockTog.title = 'Show bottom bar';
                root.removeAttribute('data-mtab');
                wodCloseSpeedPop();
                syncTabAria();
            }
            if(typeof wodSyncViewportAndCanvas === 'function')
                wodSyncViewportAndCanvas();
        });
    }
    let icTog = document.getElementById('wodInfoCardToggle');
    if(icTog) {
        icTog.style.display = 'none';
        icTog.setAttribute('aria-hidden', 'true');
        icTog.tabIndex = -1;
    }
    root.removeAttribute('data-infocard');
    let icPrev = document.getElementById('infoCardPagePrev');
    let icNext = document.getElementById('infoCardPageNext');
    if(icPrev) icPrev.addEventListener('click', (ev) => { ev.stopPropagation(); wodStepInfoCardPage(-1); });
    if(icNext) icNext.addEventListener('click', (ev) => { ev.stopPropagation(); wodStepInfoCardPage(1); });
}
function wodResetMobileHud() {
    let root = document.getElementById('inGameUI');
    if(!root) return;
    root.removeAttribute('data-mtab');
    if(UI.statsMenu) UI.statsMenu.classList.add('hidden');
    if(UI.citiesMenu) UI.citiesMenu.classList.add('hidden');
    root.removeAttribute('data-mdock');
    root.removeAttribute('data-infocard');
    root.removeAttribute('data-build-picking');
    if(typeof gameData !== 'undefined' && gameData) {
        gameData.buildMode = null;
        if(UI && UI.wrapper) UI.wrapper.style.cursor = 'default';
    }
    wodPlayerSummarySig = '';
    let dockTog = document.getElementById('wodDockToggle');
    if(dockTog) {
        dockTog.setAttribute('aria-expanded', 'true');
        dockTog.title = 'Hide bottom bar';
    }
    let pop = document.getElementById('wodSpeedPop');
    let trig = document.getElementById('wodSpeedTrigger');
    if(pop) pop.hidden = true;
    if(trig) trig.setAttribute('aria-expanded', 'false');
    document.querySelectorAll('.wod-m-tab').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
    });
}
let gameState = 'MENU';
let menuDemoSeeded = false;
/** Snapshot of the running menu background battle (preserved while browsing menus or playing). */
let menuBattleLive = null;
let menuBattleHexListRef = null;
let menuTerrainSnap = null;
let menuBattlePrepared = null;
let menuPrewarmGeneration = 0;
let menuDemoAnimId = 0;
let menuDemoLastTime = 0;
let menuDemoPausedByVisibility = false;
/** Applies to per-city income & manpower (/s); global economic slowdown multiplier. */
const WOD_CITY_ECON_TICK_MULT = 2 / 3;
const WOD_LAND_INCOME_PER_HEX = 0.004;
/** Global multiplier on all money and manpower income rates. */
const WOD_INCOME_MULT = 1;
const WOD_COMMAND_INCOME = 12;
/** Match production menu / economy balance. */
const WOD_PRICE_FACTORY = 4000;
const WOD_PRICE_HARBOR = 2000;
const WOD_PRICE_FARM = 2400;
const WOD_PRICE_FORT = 3000;
const WOD_PRICE_HOSPITAL = 3000;
// Bridges are dragged from bank to bank and priced by the water cells they cross.
// The caps keep the reach of the old fixed deck: four water cells, banks at most
// 5.4 cell widths apart (centre to centre), in any direction.
const WOD_PRICE_BRIDGE_PER_CELL = 1000;
const WOD_BRIDGE_MAX_CELLS = 4;
const WOD_BRIDGE_MAX_BANK_TILES = 5.4;
// A full-length span. Also the price assumed for bridge jobs saved before per-cell pricing.
const WOD_PRICE_BRIDGE = WOD_PRICE_BRIDGE_PER_CELL * WOD_BRIDGE_MAX_CELLS;
const WOD_PRICE_LIGHT = 1000;
const WOD_PRICE_MARINE = 1000;
const WOD_SPECIALIST_UNITS = {
    motorized: {label:'Motorized infantry',money:3000,manpowerCost:2400,hp:180,speed:15,damage:12,range:55,attackCooldown:2.3,radius:14,upkeep:1.25,seconds:23},
    mountaineer: {label:'Mountaineers',money:1600,manpowerCost:2000,hp:85,speed:15,damage:6,range:50,attackCooldown:2,radius:12,upkeep:.55,seconds:20}
};
function wodSpecialistStats(type) {
    const d=WOD_SPECIALIST_UNITS[type];
    return d?{hp:d.hp,maxHp:d.hp,speed:d.speed,damage:d.damage,range:d.range,attackCooldown:d.attackCooldown,radius:d.radius,manpower:1000,maxManpower:1000,tanks:0,maxTanks:0}:null;
}
function wodCanClimb(unit){return unit?.type==='mountaineer';}
const WOD_SPECIALIST_ERAS = {
    ancient:{motorized:'Cavalry',mountaineer:'Skirmishers',mobileMark:'horse',mountainMark:'javelins'},
    medieval:{motorized:'Mounted men-at-arms',mountaineer:'Rangers',mobileMark:'lance',mountainMark:'bow'},
    napoleonic:{motorized:'Dragoons',mountaineer:'Chasseurs',mobileMark:'saber',mountainMark:'horn'},
    modern:{motorized:'Motorized infantry',mountaineer:'Mountaineers',mobileMark:'wheels',mountainMark:'peak'}
};
function wodSpecialistLabel(type,period=wodGetRenderPeriod()){return WOD_SPECIALIST_ERAS[period]?.[type]||WOD_SPECIALIST_UNITS[type]?.label||type;}
function wodMotorizedEquipment(unit,period=wodGetMatchPeriod()) {
    const modern=period==='modern',capacity=modern?100:1000;
    return {label:modern?'Trucks':'Horses',kind:modern?'Truck':'Horse',capacity,
        count:unit?.type==='motorized'?capacity*Math.max(0,Math.min(1,(unit.hp||0)/Math.max(1,unit.maxHp||180))):0};
}
const WOD_PRICE_HEAVY = 8000;
const WOD_PRICE_SHIP = 7600;
const WOD_PRICE_TRANSPORT = 2000;
const WOD_PRICE_SUPPLY = 2400;
const WOD_MANPOWER_INFANTRY = 1000;
const WOD_MANPOWER_SHIP = 5000;
const WOD_MANPOWER_ARMOR_DIV = 1000;
const WOD_ARMOR_DIV_TANKS = 500;
/** Radius in tiles (fractional × hexSpacing) fort aura for +20% defense (damage × 0.8). */
const WOD_FORT_DEFENSE_TILES = 4.95;
/** A supply ship supplies troops within this many fort-aura radii (2: about six cells, so a landing can fight a coastal
 *  town's streets from the ship's cover). A `let` so lab batches can compare against the old rule (1). */
let WOD_SUPPLY_SHIP_RADIUS_MULT = 2;
function hideCampaignSummaryOverlay() {
    let el = document.getElementById('campaignSummaryOverlay');
    if(el) el.classList.add('hidden');
}
function wodFinalizePersonalEnd() {
    if(!gameData._spectator)return;
    const slot=gameData._spectator.slot;
    // Keep the personal result frozen while the remaining world lives.
    // (in a match, a faction its player surrendered to the computer plays on: wodMpSurrenderConcedes)
    if(gameData.mp?.enabled){if(!gameData._mpSurrenderedToAi)wodMpApplyForfeitSlot(slot,false);}
    else{
        gameData.entities=gameData.entities.filter(u=>u.owner!==slot);
        for(const c of gameData.cities)if(c.owner===slot)c.owner=0;
        const batch=batchHexOwner;batchHexOwner=true;for(const h of gameData.hexList)if(h.owner===slot)setHexOwner(h,0);batchHexOwner=batch;wodMarkTerrainPoliticalDirty();
    }
    gameData.selection=[];gameData.buildMode=null;gameData._missionRuntime=null;gameData.mission=null;gameData._campaignRun=null;
    gameData.constructionJobs=gameData.constructionJobs.filter(j=>j.owner!==slot);
    if(gameData.mp?.enabled){gameData._campaignEnded=false;setGameSpeed(1,true);}
    wodSyncSpectatorUi();wodSaveSpectatorReport();
}
function dismissCampaignSummaryToMenu() {
    hideCampaignSummaryOverlay();
    returnToMenu();
    // Campaign battles return to the war map, not the main menu.
    if(gameData._wodReturnToCampaign) {
        gameData._wodReturnToCampaign = false;
        showPanel('campaign');
    }
}
async function wodContinueHistoricalPack() {
    const id=document.getElementById('wodNextPackStage')?.dataset.missionId;
    if(!id)return;
    dismissCampaignSummaryToMenu();_wodMissionListTab='store';showPanel('missions');
    await wodRefreshMissionsPanel();
    const entry=wodFindMissionEntryById(id);
    if(entry){wodSelectMissionEntry(entry);document.querySelector('#wodMissionList [data-mission-id="'+id+'"]')?.scrollIntoView({block:'nearest'});}
}
function syncSetupPlayerColorRow() {
    let row = document.getElementById('setupPlayerColorRow');
    if(!row) return;
    row.style.display = '';
}
const WOD_VICTORY_MODE_DETAIL_TEXT = {
    domination: 'Capture every enemy-held city.',
    annihilation: 'Eliminate all enemy combat units (convoys excluded).'
};
const WOD_VICTORY_MODE_HUD = {
    domination: { mode: 'Domination', rule: 'Capture every enemy-held city.' },
    annihilation: { mode: 'Annihilation', rule: 'Eliminate all enemy combat units (convoys excluded).' }
};
const WOD_MP_MAX_PLAYERS = 4;
const WOD_MAX_AI_OPPONENTS = 3;
function wodHudEconomyNetPerSec() {
    let o = wodLocalPlayerOwner();
    if(gameData.mp && gameData.mp.enabled) {
        let h = wodMpEconomyHudForOwner(o);
        return h.income - h.expenses;
    }
    return (gameData.income || 0) - (gameData.expenses || 0);
}
function wodHudManpowerNetPerSec() {
    let o = wodLocalPlayerOwner();
    if(gameData.mp && gameData.mp.enabled) return wodMpEconomyHudForOwner(o).manpowerIncome;
    return gameData.manpowerIncome || 0;
}
function wodSyncHudCompactRates() {
    let econ = wodHudEconomyNetPerSec();
    let mp = wodHudManpowerNetPerSec();
    setUiText('ui-economy-net', formatDollarRate(econ));
    setUiText('ui-manpower-net', formatManpowerRate(mp));
    for(let id of ['ui-economy-net', 'ui-manpower-net']) {
        const cache=wodSyncHudCompactRates.nodes||=(new Map());
        let nodes=cache.get(id);if(!nodes||nodes.some(el=>!el.isConnected)){nodes=[...document.querySelectorAll('[data-ui-sync="' + id + '"],#' + id)];cache.set(id,nodes);}
        nodes.forEach(el => {
            let v = id === 'ui-economy-net' ? econ : mp;
            if(el.classList.contains('positive')!==(v>0.05))el.classList.toggle('positive',v>0.05);
            if(el.classList.contains('negative')!==(v<-.05))el.classList.toggle('negative',v<-.05);
        });
    }
}
function toggleWodStatsPanel(forceOpen) {
    if(gameState !== 'PLAYING' || !UI.statsMenu) return;
    let open = forceOpen === undefined ? UI.statsMenu.classList.contains('hidden') : !!forceOpen;
    if(open && UI.escMenu && !UI.escMenu.classList.contains('hidden'))
        toggleEscMenu(false);
    if(open && wodCitiesMenuOpen()) toggleWodCitiesPanel(false);
    UI.statsMenu.classList.toggle('hidden', !open);
    if(open) {
        wodInitStatsMobileTabs();
        wodShowStatsPage('players');
        if(typeof updatePlayerSummary === 'function') updatePlayerSummary();
    }
    document.querySelectorAll('.wod-m-tab').forEach(b => {
        if(b.getAttribute('data-wod-mtab') !== 'intel') return;
        b.classList.toggle('active', open);
        b.setAttribute('aria-selected', open ? 'true' : 'false');
    });
}
function toggleWodCitiesPanel(forceOpen) {
    if(gameState !== 'PLAYING' || !UI.citiesMenu) return;
    let open = forceOpen === undefined ? UI.citiesMenu.classList.contains('hidden') : !!forceOpen;
    if(open && UI.escMenu && !UI.escMenu.classList.contains('hidden'))
        toggleEscMenu(false);
    if(open && wodStatsMenuOpen()) toggleWodStatsPanel(false);
    UI.citiesMenu.classList.toggle('hidden', !open);
    if(open) refreshWodCitiesPanel();
    document.querySelectorAll('.wod-m-tab').forEach(b => {
        if(b.getAttribute('data-wod-mtab') !== 'cities') return;
        b.classList.toggle('active', open);
        b.setAttribute('aria-selected', open ? 'true' : 'false');
    });
}
function wodEscapeHtmlLite(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function wodOwnedCitiesForLocalPlayer() {
    let lo = wodLocalPlayerOwner();
    let list = [];
    for(let i = 0, n = (gameData.cities || []).length; i < n; i++) {
        let c = gameData.cities[i];
        if(c && c.owner === lo && c.id) list.push(c);
    }
    list.sort((a, b) => {
        let na = String(a.name || ''), nb = String(b.name || '');
        if(na !== nb) return na.localeCompare(nb);
        return String(a.id).localeCompare(String(b.id));
    });
    return list;
}
function refreshWodCitiesPanel() {
    let wrap = document.getElementById('citiesChartWrap');
    if(!wrap) return;
    let cities = wodOwnedCitiesForLocalPlayer();
    if(!cities.length) {
        wrap.innerHTML = '<div class="cities-empty">No owned cities yet.</div>';
        return;
    }
    let lo = wodLocalPlayerOwner();
    let selectedId = null;
    for(let s of gameData.selection || []) {
        if(s && s.id && s.owner === lo) { selectedId = s.id; break; }
    }
    let rows = '';
    let cards = '';
    for(let city of cities) {
        let cash = getCityIncome(city);
        let mp = getCityManpowerIncome(city);
        let canFactory = cityEligibleForBuildPlacementForOwner(city, 'factory', lo);
        let canFarm = cityEligibleForBuildPlacementForOwner(city, 'farm', lo);
        let canHarbor = cityEligibleForBuildPlacementForOwner(city, 'harbor', lo);
        let harborPossible = !!cityHasWaterNeighbor(city);
        let name = wodEscapeHtmlLite(city.name || 'Town');
        let cid = wodEscapeHtmlLite(city.id);
        let sel = city.id === selectedId ? ' cities-row--selected' : '';
        let cashTxt = '+$' + cash.toLocaleString('en-US', { maximumFractionDigits: 1 }) + '/s';
        let mpTxt = '+' + mp.toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' MP/s';
        let factorySlot = city.hasFactory
            ? '<span class="cities-bldg is-built" title="Factory">Factory</span>'
            : '<span class="cities-bldg is-missing" title="No factory">Factory</span>';
        let farmSlot = city.hasFarm
            ? '<span class="cities-bldg is-built" title="Farm">Farm</span>'
            : '<span class="cities-bldg is-missing" title="No farm">Farm</span>';
        let harborSlot = city.hasHarbor
            ? '<span class="cities-bldg is-built" title="Harbor">Harbor</span>'
            : (harborPossible
                ? '<span class="cities-bldg is-missing" title="No harbor">Harbor</span>'
                : '<span class="cities-bldg is-unavailable" title="Inland — harbor unavailable">Harbor</span>');
        let actions = '';
        if(!city.hasFactory) {
            actions += '<button type="button" class="cities-build-btn" data-city-build="' + cid + '" data-mode="factory"' +
                (canFactory ? '' : ' disabled') +
                ' title="Build Factory ($' + WOD_PRICE_FACTORY + ')">+ Factory $' + (WOD_PRICE_FACTORY / 1000) + 'k</button>';
        }
        if(!city.hasFarm) {
            actions += '<button type="button" class="cities-build-btn" data-city-build="' + cid + '" data-mode="farm"' +
                (canFarm ? '' : ' disabled') +
                ' title="Build Farm ($' + WOD_PRICE_FARM + ')">+ Farm $' + (WOD_PRICE_FARM / 1000) + 'k</button>';
        }
        if(!city.hasHarbor && harborPossible) {
            actions += '<button type="button" class="cities-build-btn" data-city-build="' + cid + '" data-mode="harbor"' +
                (canHarbor ? '' : ' disabled') +
                ' title="Build Harbor ($' + WOD_PRICE_HARBOR + ')">+ Harbor $' + (WOD_PRICE_HARBOR / 1000) + 'k</button>';
        }
        let job = wodCityProductionJob(city);
        let actionsOrDone = job ? '<span class="cities-complete">' + wodProductionLabel(job.mode) + ' · ' + Math.ceil(job.remaining) + 's</span>' : (actions || '<span class="cities-complete">Complete</span>');
        rows += '<tr class="cities-row' + sel + '" data-city-id="' + cid + '">' +
            '<td><button type="button" class="cities-name-btn" data-city-focus="' + cid + '">' + name + '</button></td>' +
            '<td><span class="cities-yield">' + cashTxt + '</span></td>' +
            '<td><span class="cities-yield cities-yield-mp">' + mpTxt + '</span></td>' +
            '<td><div class="cities-bldg-slots">' + factorySlot + farmSlot + harborSlot + '</div></td>' +
            '<td><div class="cities-actions">' + actionsOrDone + '</div></td>' +
            '</tr>';
        cards += '<article class="cities-card' + sel + '" data-city-id="' + cid + '">' +
            '<div class="cities-card-head">' +
                '<button type="button" class="cities-name-btn" data-city-focus="' + cid + '">' + name + '</button>' +
                '<div class="cities-card-yields">' +
                    '<span class="cities-yield">' + cashTxt + '</span>' +
                    '<span class="cities-yield cities-yield-mp">' + mpTxt + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="cities-bldg-slots">' + factorySlot + farmSlot + harborSlot + '</div>' +
            '<div class="cities-actions">' + actionsOrDone + '</div>' +
            '</article>';
    }
    wrap.innerHTML =
        '<table class="cities-chart" aria-label="Owned cities">' +
        '<thead><tr><th>City</th><th>Gold</th><th>Manpower</th><th>Buildings</th><th>Construct</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table>' +
        '<div class="cities-card-list" aria-label="Owned cities">' + cards + '</div>';
    wodInitRecruitInfoButtons(wrap);
}
function wodFindOwnedCityById(cityId) {
    if(!cityId) return null;
    let lo = wodLocalPlayerOwner();
    for(let i = 0, n = (gameData.cities || []).length; i < n; i++) {
        let c = gameData.cities[i];
        if(c && c.id === cityId && c.owner === lo) return c;
    }
    return null;
}
function wodFocusOwnedCityFromList(cityId) {
    let city = wodFindOwnedCityById(cityId);
    if(!city) return;
    for(let i = 0, n = gameData.selection.length; i < n; i++) {
        let s = gameData.selection[i];
        if(s) s.selected = false;
    }
    gameData.selection = [];
    city.selected = true;
    gameData.selection.push(city);
    _infoCardUiThrottle.s = null;
    syncInfoCardPanel();
    let vw = (typeof canvas !== 'undefined' && canvas) ? (canvas.clientWidth || UI.wrapper.clientWidth || wodCanvasAllocSize.w || 1) : 1;
    let vh = (typeof canvas !== 'undefined' && canvas) ? (canvas.clientHeight || UI.wrapper.clientHeight || wodCanvasAllocSize.h || 1) : 1;
    let z = gameData.camera.zoom || 1;
    gameData.camera.x = city.x * z - vw / 2;
    gameData.camera.y = city.y * z - vh / 2;
    refreshWodCitiesPanel();
}
function wodBuildAtCityFromList(cityId, mode) {
    if(gameState !== 'PLAYING') return;
    let city = wodFindOwnedCityById(cityId);
    let lo = wodLocalPlayerOwner();
    if(!city || !mode) return;
    if(!cityEligibleForBuildPlacementForOwner(city, mode, lo)) {
        showNotification(wodExplainBuildBlockReason(mode, lo, city));
        refreshWodCitiesPanel();
        return;
    }
    if(gameData.mp && gameData.mp.enabled && !gameData.mp.isHost) {
        if(wodMpSendCmd({ kind: 'build', mode, cq: city.q, cr: city.r })) {
            refreshWodCitiesPanel();
        }
        return;
    }
    if(!wodApplyBuildAtCityForOwner(city,mode,lo))showNotification(wodExplainBuildBlockReason(mode,lo,city));
    refreshWodCitiesPanel();
}
function wodInitCitiesPanelClicks() {
    let wrap = document.getElementById('citiesChartWrap');
    if(!wrap || wrap._wodCitiesBound) return;
    wrap._wodCitiesBound = true;
    wrap.addEventListener('click', (ev) => {
        let t = ev.target;
        if(!t || !t.closest) return;
        let focusBtn = t.closest('[data-city-focus]');
        if(focusBtn) {
            ev.preventDefault();
            wodFocusOwnedCityFromList(focusBtn.getAttribute('data-city-focus'));
            return;
        }
        let buildBtn = t.closest('[data-city-build]');
        if(buildBtn && !buildBtn.disabled) {
            ev.preventDefault();
            wodBuildAtCityFromList(buildBtn.getAttribute('data-city-build'), buildBtn.getAttribute('data-mode'));
        }
    });
}
function wodShowStatsPage(pageId) {
    let root = UI.statsMenu;
    if(!root) return;
    let id = ['players','economy','forces','combat'].includes(pageId)?pageId:'players';
    root.dataset.activeStatsPage=id;
    root.querySelectorAll('.stats-m-tab').forEach(btn => {
        let on = btn.getAttribute('data-stats-page') === id;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
        btn.tabIndex=on?0:-1;
    });
    root.querySelectorAll('.stats-m-page').forEach(page => {
        let on = page.getAttribute('data-stats-page') === id;
        page.classList.toggle('active', on);
        if(on) page.removeAttribute('hidden');
        else page.setAttribute('hidden', '');
    });
    const scroll=root.querySelector('.stats-m-pages');if(scroll)scroll.scrollTop=0;
    wodRefreshBattleStats();
}
function wodInitStatsMobileTabs() {
    let root = UI.statsMenu;
    if(!root || root._wodStatsTabsBound) return;
    root._wodStatsTabsBound = true;
    root.addEventListener('click',ev=>{
        const btn=ev.target.closest?.('.stats-m-tab');if(!btn||!root.contains(btn))return;
        ev.preventDefault();ev.stopPropagation();wodShowStatsPage(btn.dataset.statsPage);
    });
    root.addEventListener('keydown',ev=>{
        if(!ev.target.matches?.('.stats-m-tab')||!['ArrowLeft','ArrowRight','Home','End'].includes(ev.key))return;
        const tabs=[...root.querySelectorAll('.stats-m-tab')],index=tabs.indexOf(ev.target);
        const next=ev.key==='Home'?0:ev.key==='End'?tabs.length-1:(index+(ev.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
        ev.preventDefault();ev.stopPropagation();wodShowStatsPage(tabs[next].dataset.statsPage);tabs[next].focus();
    });
}
function syncHudObjectiveDisplay() {
    if(gameState !== 'PLAYING') return;
    let key = gameData.victoryMode === 'annihilation' ? 'annihilation' : 'domination';
    const goal=gameData.mission?.objective;
    let pack = goal?{mode:({capture:'Sector assault',hold:'Hold the line',evacuate:'Evacuation',fleet:'Naval objective'})[goal.type],rule:goal.label+(gameData._missionRuntime?.progressText?' · '+gameData._missionRuntime.progressText:'')}:WOD_VICTORY_MODE_HUD[key];
    if(!pack) return;
    setUiText('hudObjectiveModeDesktop', pack.mode);
    setUiText('hudObjectiveRuleDesktop', pack.rule);
    setUiText('hudObjectiveModeMobile', pack.mode);
    setUiText('hudObjectiveRuleMobile', pack.rule);
    if(typeof wodSyncPcTopUiClearance === 'function') wodSyncPcTopUiClearance();
}
function syncSetupVictoryDetail() {
    let sel = document.getElementById('setupVictoryMode');
    let span = document.getElementById('setupVictoryModeDetail');
    if(!sel || !span) return;
    let mode = sel.value === 'annihilation' ? 'annihilation' : 'domination';
    span.textContent = WOD_VICTORY_MODE_DETAIL_TEXT[mode] || '';
}
/** What the Balance setting does, as the player reads it (skirmish setup, the lobby's map dialog and its summary). */
const WOD_MAP_BALANCE_TEXT = {
    on: { short: 'Balanced', brief: 'mirrored map, the same ground for everyone', line: 'Mirrored map: everyone gets the same land, cities, terrain and starting army, and the same distances to their rivals. The terrain still looks natural.' },
    off: { short: 'Random', brief: 'random starts, equal land and cities', line: 'Free-form map with random starting spots. Land, cities and starting armies are still equal, but the ground around each player differs.' }
};
function wodMapBalanceText(on) { return WOD_MAP_BALANCE_TEXT[on ? 'on' : 'off']; }
/** A switch's On/Off word beside it. */
function wodSyncSwitchState(input) {
    let st = input && input.closest('.wod-switch-wrap') && input.closest('.wod-switch-wrap').querySelector('.wod-switch-state');
    if(st) st.textContent = input.checked ? 'On' : 'Off';
}
/** A Balance switch's On/Off word and the line under it saying what that means. */
function wodSyncBalanceExplain(inputId, detailId) {
    let el = document.getElementById(inputId);
    if(!el) return;
    wodSyncSwitchState(el);
    let d = document.getElementById(detailId);
    if(d) d.textContent = wodMapBalanceText(el.checked).line;
}
/** Skirmish setup: the switches' words, the Balance line, your colour swatch and the one-line map summary. */
function wodSyncSetupMapUi() {
    wodSyncBalanceExplain('setupMapBalance', 'setupMapBalanceDetail');
    wodSyncSwitchState(document.getElementById('setupFogOfWar'));
    let col = document.getElementById('setupPlayerColor'), sw = document.getElementById('setupPlayerColorSwatch');
    if(col && sw) sw.style.background = col.value;
    let sum = document.getElementById('setupMapSummary');
    if(!sum) return;
    const text = id => { let e = document.getElementById(id); return e && e.options && e.selectedIndex >= 0 ? e.options[e.selectedIndex].text : ''; };
    let players = 1 + (typeof wodCurrentSetupAiCount === 'function' ? wodCurrentSetupAiCount() : 1);
    if(gameData.loadedCustomMap) { sum.textContent = 'Loaded map · ' + players + ' players'; return; }
    let towns = parseInt((document.getElementById('setupCitiesPerPlayer') || {}).value, 10) || 2;
    let bal = document.getElementById('setupMapBalance');
    sum.textContent = [text('setupMapSize') + ' ' + text('setupMapShape').toLowerCase(), players + ' players',
        towns + (towns === 1 ? ' city' : ' cities') + ' each', wodMapBalanceText(!bal || bal.checked).short].join(' · ');
}
function initSetupPanelBindings() {
    let shapeSel = document.getElementById('setupMapShape');
    let sizeSel = document.getElementById('setupMapSize');
    let aiSel = document.getElementById('setupAI');
    let victorySel = document.getElementById('setupVictoryMode');
    function regenerateSetupPreview(ev) {
        let setupPanel = document.getElementById('setupPanel');
        if(!setupPanel || setupPanel.classList.contains('hidden')) return;
        // Player count and towns per player only move borders and towns: keep the terrain.
        let politicsOnly = !!(ev && ev.target && (ev.target.id === 'setupAI' || ev.target.id === 'setupCitiesPerPlayer') && typeof wodCanRegeneratePoliticsOnly === 'function' && wodCanRegeneratePoliticsOnly());
        previewMap(politicsOnly ? { politicsOnly: true } : {});
    }
    // Balance changes the terrain itself (symmetric or free-form): always a new map.
    let balanceBox = document.getElementById('setupMapBalance');
    if(balanceBox && !balanceBox._wodBound) {
        balanceBox._wodBound = true;
        balanceBox.addEventListener('change', regenerateSetupPreview);
    }
    let citiesSel = document.getElementById('setupCitiesPerPlayer');
    if(citiesSel && !citiesSel._wodBound) {
        citiesSel._wodBound = true;
        citiesSel.addEventListener('change', regenerateSetupPreview);
    }
    if(shapeSel && !shapeSel._wodBound) {
        shapeSel._wodBound = true;
        shapeSel.addEventListener('change', regenerateSetupPreview);
    }
    if(sizeSel && !sizeSel._wodBound) {
        sizeSel._wodBound = true;
        sizeSel.addEventListener('change', regenerateSetupPreview);
    }
    if(aiSel && !aiSel._wodBound) {
        aiSel._wodBound = true;
        aiSel.addEventListener('change', () => {
            if(typeof wodRequestSkirmishPreviewForAiChange === 'function')
                wodRequestSkirmishPreviewForAiChange();
            else {
                if(typeof wodApplySetupAiCountFromUi === 'function') wodApplySetupAiCountFromUi();
                if(typeof wodSyncSetupOpponentsBrief === 'function') wodSyncSetupOpponentsBrief();
                regenerateSetupPreview({ target: aiSel });
            }
        });
    }
    let playerColorSel = document.getElementById('setupPlayerColor');
    if(playerColorSel && !playerColorSel._wodShopColorBound) {
        playerColorSel._wodShopColorBound = true;
        playerColorSel.addEventListener('change', () => {
            applyPlayerFactionColorFromSetup();
            renderShopArmyCanvases();
            syncShopSkinBar('player');
        });
    }
    if(victorySel && !victorySel._wodVictoryDetailBound) {
        victorySel._wodVictoryDetailBound = true;
        victorySel.addEventListener('change', syncSetupVictoryDetail);
    }
    syncSetupVictoryDetail();
    let periodSel = document.getElementById('setupGamePeriod');
    if(periodSel && !periodSel._wodBound) {
        periodSel._wodBound = true;
        periodSel.addEventListener('change', () => wodApplyGamePeriod(periodSel.value, { saveProfile: true }));
    }
    wodSyncAllPeriodSelects();
    // (any setting changed: the switches' words, the Balance line, the swatch and the summary follow)
    let panel = document.getElementById('setupPanel');
    if(panel && !panel._wodSummaryBound) {
        panel._wodSummaryBound = true;
        panel.addEventListener('change', () => {
            wodSyncSetupMapUi();
            if(typeof wodSyncSetupOpponentsBrief === 'function') wodSyncSetupOpponentsBrief();
        });
    }
    wodSyncSetupMapUi();
}
function showPanel(panelId, opts) {
    opts = opts || {};
    pauseMenuBackgroundBattle();
    UI.mainMenu.classList.add('hidden');
    UI.panels.forEach(p => p.classList.add('hidden'));
    let pan = document.getElementById(panelId + 'Panel');
    if(pan) pan.classList.remove('hidden');
    if(panelId === 'shop') {
    wodInitMissionPeriodBinding();
    wodInitCampaignPeriodBinding();
        wodSyncAllPeriodSelects();
        wodInitShopTabs();
        updateSkinShop();
        wodApplyPeriodUiLabels();
    }
    if(panelId === 'achievements') renderAchievementsUi();
    if(panelId === 'settings') {
        syncShowOrdersCheckbox();
        syncOrderArrowsPathfindingCheckbox();
        wodInitPeriodSettingsBinding();
        wodSyncAllPeriodSelects();
        if(window.wodMusic) {
            try { window.wodMusic.bindUi(); } catch(e) {}
        }
    }
    if(panelId === 'multiplayer') {
        wodMpWireLobbyUi();
        wodMpEnsureConnected();
        wodMpRefreshProfileCard();
        wodMpQueryFriendPresence();
        wodMpApplyFriendQueryFromUrl();
    }
    if(panelId === 'helpGuide') {
        // Where the guide's Close button returns (see wodOpenHelpGuide); empty means the main menu.
        if(pan) pan.dataset.returnTo = opts.helpReturnTo || '';
        updateTerrainKey();
    }
    if(panelId === 'credits') wodSyncCreditsCoin();
    if(panelId === 'campaign') wodRefreshCampaignPanel();
    if(panelId === 'missions') {
        wodMissionCatalogLoaded = false;
        wodInitMissionPeriodBinding();
        wodSyncAllPeriodSelects();
        void wodRefreshMissionsPanel();
    }
    if(panelId === 'mapLibrary') {
        _wodMapLib.context = opts.libContext || 'setup';
        window._wodMapLibFromMpHost = !!opts.fromMpHost;
        if(opts.returnTo !== undefined && opts.returnTo !== null) _wodMapLib.returnTo = opts.returnTo;
        else if(opts.libContext === 'editor') _wodMapLib.returnTo = 'editor';
        else if(opts.fromMpHost) _wodMapLib.returnTo = 'multiplayer';
        else _wodMapLib.returnTo = 'setup';
        _wodMapLib.listPage = 0;
        wodWireMapLibraryPanelOnce();
        wodRefreshMapLibraryPanel();
    }
    if(panelId === 'setup') {
        wodApplyGamePeriod(wodGetGamePeriod(), { saveProfile: false });
        syncSetupPlayerColorRow();
        initSetupPanelBindings();
        if(typeof wodSyncSetupOpponentsBrief === 'function') wodSyncSetupOpponentsBrief();
        syncSetupVictoryDetail();
        wodSyncAllPeriodSelects();
        wodApplyPeriodUiLabels();
        let sb = document.getElementById('setupBtnStartAi');
        let rb = document.getElementById('setupBtnMpReturn');
        let shopMapBtn = document.getElementById('setupBtnShopMaps');
        if(opts.fromMpHost) {
            if(rb) rb.style.display = '';
            if(sb) sb.style.display = 'none';
            if(shopMapBtn) shopMapBtn.style.display = 'none';
        } else {
            if(rb) rb.style.display = 'none';
            if(sb) sb.style.display = '';
            if(shopMapBtn) shopMapBtn.style.display = '';
            wodSyncSetupShopMapButton();
        }
        if(!opts.fromMpHost && !opts.preserveMap) {
            let shapeEl = document.getElementById('setupMapShape');
            if(shapeEl) shapeEl.value = 'island';
            gameData.loadedCustomMap = false;
            gameData.mission = null;
            gameData._missionRuntime = null;
            gameData._selectedMissionEntry = null;
        }
        if(typeof wodApplySetupAiCountFromUi === 'function') wodApplySetupAiCountFromUi();
        let mapSizeEl = document.getElementById('setupMapSize');
        wodApplyMapSizePreset(mapSizeEl ? mapSizeEl.value : 60);
        if(!opts.preserveMap) {
            let previewEpoch = gameData._soloPreviewEpoch || 0;
            wodArmMapPreviewSpinner('mapPreview');
            gameData._soloPreviewGenerating = true;
            wodRefreshMapPreviewGeneratingUi();
            const otherGen = window._wodBootBusy || window._wodMenuBootstrapBusy || gameData._mapGenInProgress;
            void (otherGen ? wodAwaitOtherMapGen().then(() => (gameData._soloPreviewEpoch || 0) === previewEpoch ? generateMap() : null) : generateMap())
                .then(() => {
                    if((gameData._soloPreviewEpoch || 0) !== previewEpoch) return;
                    previewLoadedMap();
                    try {
                        if(!wodLiveMapLooksLikeMenuAttract()) {
                            wodCaptureSoloPreviewSnapshot();
                            gameData._soloMapPreviewMatchesStart = wodSoloSnapshotValidForMatchStart(gameData._soloPreviewSnapshot);
                        } else {
                            gameData._soloMapPreviewMatchesStart = false;
                        }
                    } catch(_) {
                        gameData._soloMapPreviewMatchesStart = false;
                    }
                })
                .catch(e => {
                    console.warn(e);
                    if((gameData._soloPreviewEpoch || 0) !== previewEpoch) return;
                    previewLoadedMap();
                    gameData._soloMapPreviewMatchesStart = false;
                })
                .finally(() => {
                    if((gameData._soloPreviewEpoch || 0) !== previewEpoch) {
                        gameData._soloPreviewGenerating = false;
                        wodEndMapGenAiLock();
                        wodDisarmMapPreviewSpinner('mapPreview');
                        wodHideMapGenOverlay();
                        wodRefreshMapPreviewGeneratingUi();
                        return;
                    }
                    gameData._soloPreviewGenerating = false;
                    wodEndMapGenAiLock();
                    wodDisarmMapPreviewSpinner('mapPreview');
                    wodHideMapGenOverlay();
                    wodRefreshMapPreviewGeneratingUi();
                });
        } else {
            previewLoadedMap();
            try {
                if(!wodLiveMapLooksLikeMenuAttract()) {
                    wodCaptureSoloPreviewSnapshot();
                    gameData._soloMapPreviewMatchesStart = wodSoloSnapshotValidForMatchStart(gameData._soloPreviewSnapshot);
                } else {
                    gameData._soloMapPreviewMatchesStart = false;
                }
            } catch(_) {
                gameData._soloMapPreviewMatchesStart = false;
            }
        }
        if(!_wodEditorSaveDomPrewarmed && typeof window.wodEnsureMapEditorDom === 'function') {
            _wodEditorSaveDomPrewarmed = true;
            try { window.wodEnsureMapEditorDom(); } catch(e) { console.warn(e); }
        }
    }
}
function wodMapLibraryBack() {
    let pan = document.getElementById('mapLibraryPanel');
    if(pan) pan.classList.add('hidden');
    window._wodMapLibFromMpHost = false;
    let ret = _wodMapLib.returnTo;
    _wodMapLib.returnTo = null;
    if(ret === 'editor') return;
    if(ret === 'multiplayer') {
        pauseMenuBackgroundBattle();
        UI.mainMenu.classList.add('hidden');
        document.getElementById('multiplayerPanel') && document.getElementById('multiplayerPanel').classList.remove('hidden');
        wodMpWireLobbyUi();
        wodMpEnsureConnected();
        return;
    }
    if(ret === 'setup') {
        let sp = document.getElementById('setupPanel');
        if(sp) sp.classList.remove('hidden');
        return;
    }
    hidePanels();
}
function wodOpenSkirmishSetup() {
    gameData.mission = null;
    gameData._missionRuntime = null;
    gameData._selectedMissionEntry = null;
    if(typeof wodAssignMatchGenerals === 'function') wodAssignMatchGenerals(null);
    showPanel('setup');
}
function wodBackFromSkirmishSetup() {
    if(window._wodMapLibFromMpHost) {
        hidePanels();
        return;
    }
    let rb = document.getElementById('setupBtnMpReturn');
    if(rb && rb.style.display !== 'none') {
        hidePanels();
        return;
    }
    UI.panels.forEach(p => p.classList.add('hidden'));
    showPanel('playMode');
}
function hidePanels(resumeMenuDemo) {
    if(wodIsMapPreviewGenerating()) return;
    wodMpCloseHostMapDlg();
    wodMpCloseHostRulesDlg();
    wodMpClosePlayerProfileDlg();
    wodMpCloseFriendInviteDlg();
    wodMpCloseFriendRequestDlg();
    wodMpCloseStatsDetailDlg();
    wodMpCloseSeatInviteDlg();
    UI.panels.forEach(p => p.classList.add('hidden'));
    UI.mainMenu.classList.remove('hidden');
    wodRefreshMainMenuOrder();
    if(resumeMenuDemo !== false) resumeMenuBackgroundBattle();
    else if(gameState === 'MENU') {
        UI.canvas.style.display = 'none';
    }
}
function wodEscMenuOpen() {
    return !!(UI && UI.escMenu && !UI.escMenu.classList.contains('hidden'));
}
function wodMissionPopupOpen() {
    let ov = document.getElementById('wodMissionPopupOverlay');
    return !!(ov && !ov.classList.contains('hidden'));
}
/** Hide in-game banners/toasts while the pause menu is up so they cannot look like defeat popups. */
function wodSyncPopupsForEscMenu(escOpen) {
    document.body.classList.toggle('wod-esc-open', !!escOpen);
    let deployBanner = document.getElementById('wodDeployBanner');
    let endBanner = document.getElementById('wodEndCountdownBanner');
    if(escOpen) {
        if(deployBanner) deployBanner.classList.add('hidden');
        if(endBanner) endBanner.classList.add('hidden');
        document.querySelectorAll('.wod-toast-note').forEach(el => el.remove());
        // Never leave a stale victory/defeat summary sitting under/over pause.
        if(!gameData || !gameData._campaignEnded) hideCampaignSummaryOverlay();
        return;
    }
    if(typeof wodCampaignDeployActive === 'function' && wodCampaignDeployActive() && deployBanner)
        deployBanner.classList.remove('hidden');
    if(typeof wodUpdateEndCountdownBanner === 'function') wodUpdateEndCountdownBanner();
}
function toggleEscMenu(forceOpen, opts) {
    opts = opts || {};
    if(gameState !== 'PLAYING') return;
    // Briefing / mission popups own the input — don't open pause underneath them.
    if(forceOpen !== false && wodMissionPopupOpen()) return;
    let menu = UI.escMenu;
    if(!menu) return;
    let shouldOpen = forceOpen === undefined ? menu.classList.contains('hidden') : !!forceOpen;
    if(shouldOpen && wodStatsMenuOpen()) toggleWodStatsPanel(false);
    if(shouldOpen && wodCitiesMenuOpen()) toggleWodCitiesPanel(false);
    if(!shouldOpen) {
        for(let section of menu.querySelectorAll('.esc-section')) section.classList.remove('visible');
    }
    menu.classList.toggle('hidden', !shouldOpen);
    wodSyncPopupsForEscMenu(shouldOpen);
    if(shouldOpen && opts.skipDefaultSection !== true)
        showEscSection(opts.defaultSection || 'helpSection');
}
const WOD_ESC_HELP_VERSION = '23';
function populateEscHelpGuide() {
    let mount = document.getElementById('escFullHelpGuide');
    if(!mount || mount.dataset.ready === WOD_ESC_HELP_VERSION) return;
    let guide = document.querySelector('#helpGuidePanel .panel');
    if(!guide) return;
    // The pause-menu copy needs its own ids, so its contents links land in this copy.
    mount.innerHTML = guide.innerHTML
        .replaceAll('menuHelpCanvas', 'escHelpCanvas')
        .replaceAll('menuCompactTerrainKey', 'escCompactTerrainKey')
        .replaceAll('helpGuide-', 'escHelpGuide-')
        .replaceAll('wodCloseHelpGuide()', 'toggleEscMenu(false)')
        .replace(/<button[^>]*help-guide-back-only[^>]*>[\s\S]*?<\/button>/i, '');
    mount.dataset.ready = WOD_ESC_HELP_VERSION;
}
function showEscSection(sectionId) {
    if(gameState === 'PLAYING' && UI.escMenu && UI.escMenu.classList.contains('hidden'))
        toggleEscMenu(true);
    let menu = UI.escMenu;
    if(menu) menu.querySelectorAll('.esc-section').forEach(function(s) { s.classList.remove('visible'); });
    let section = document.getElementById(sectionId);
    if(section && menu && menu.contains(section)) section.classList.add('visible');
    if(sectionId === 'helpSection') {
        try {
            populateEscHelpGuide();
            if(typeof updateTerrainKey === 'function') updateTerrainKey();
            if(typeof renderHelpMiniDiagrams === 'function') renderHelpMiniDiagrams();
        } catch(err) {
            console.error('helpSection', err);
        }
    }
    if(sectionId === 'settingsSection') {
        syncShowOrdersCheckbox();
        syncOrderArrowsPathfindingCheckbox();
        if(window.wodMusic) {
            try { window.wodMusic.bindUi(); } catch(e) {}
        }
    }
}
function openMenuFromGame() {
    if(gameState !== 'PLAYING' || !UI.escMenu) return;
    if(wodStatsMenuOpen()) toggleWodStatsPanel(false);
    if(wodCitiesMenuOpen()) toggleWodCitiesPanel(false);
    toggleEscMenu(true);
}
function openHelpFromGame() {
    openMenuFromGame();
}
function confirmSurrender() {
    if(gameData._spectator){dismissCampaignSummaryToMenu();return;}
    if(gameState!=='PLAYING'||gameData._campaignEnded)return;
    if(gameData.mp?.enabled){
        gameData.menuAttractMode=false;toggleEscMenu(false);gameData._lifetimeEndReason='surrender';
        wodFinishLifetimeMatch('defeat','surrender');
        if(!gameData._lifetimeMatch?.mpOutcomeRecorded){if(gameData._lifetimeMatch)gameData._lifetimeMatch.mpOutcomeRecorded=true;wodMpRecordLocalMultiplayerOutcome('lost');}
        if(wodCloudCanSync())WodMultiplayer.syncProgress(wodEnsurePlayerId(),wodBuildCloudSyncPayload());
        const watch=wodSpectatorSurvivors(true).length>1;
        const concede=wodMpSurrenderConcedes();gameData._mpSurrenderedToAi=!concede;WodMultiplayer.forfeitMatch({spectate:watch,surrender:concede});if(!watch)wodMpClearSession();triggerSurrenderDefeat();return;
    }
    if(gameData.menuAttractMode)return;
    toggleEscMenu(false);
    gameData._lifetimeEndReason='surrender';
    wodFinishLifetimeMatch('defeat','surrender');
    if(gameData.mp && gameData.mp.enabled) { returnToMenu(); return; }
    triggerSurrenderDefeat();
}
/** Explicit surrender: always show the defeat summary (bypasses natural end-check gates). */
function triggerSurrenderDefeat() {
    if(gameData._campaignEnded) return;
    if(gameState !== 'PLAYING' || gameData.menuAttractMode) {
        returnToMenu();
        return;
    }
    if(wodEscMenuOpen()) toggleEscMenu(false);
    gameData._lifetimeEndReason='surrender';
    wodPrepareSpectatorChoice('defeat');
    gameData._campaignEnded = true;
    setGameSpeed(0, true);
    wodResetEndCountdowns();
    if(gameData._campaignRun) wodCampaignAfterBattle(false);
    openCampaignBattleSummary(
        'defeat',
        'Defeat — you surrendered.',
        'Defeat — you surrendered the battle.'
    );
    wodFinalizePersonalEnd();
}
function setGameSpeed(speed, allowNonRealtime) {
    if(speed < 0) speed = 0;
    if(speed > 3) speed = 3;
    if(gameData && gameData.mp && gameData.mp.enabled && !allowNonRealtime && speed !== 1)
        speed = 1;
    // Deployment stays paused until the player confirms Begin battle.
    if(wodCampaignDeployActive() && speed > 0 && !allowNonRealtime) {
        showNotification('Finish deployment with Begin battle first.');
        speed = 0;
    }
    let prev = gameData.speed;
    gameData.speed = speed;
    // Resuming from pause/popup: reset the frame clock so catch-up doesn't jump units.
    if(prev === 0 && speed > 0 && typeof lastTime !== 'undefined')
        lastTime = performance.now();
    for(let btn of document.querySelectorAll('.speed-btn')) btn.classList.remove('active');
    let activeId = speed === 0 ? 'speedPause' : (speed === 3 ? 'speed3' : (speed === 2 ? 'speed2' : 'speed1'));
    let activeBtn = document.getElementById(activeId);
    if(activeBtn) activeBtn.classList.add('active');
    let trig = document.getElementById('wodSpeedTrigger');
    if(trig) {
        trig.textContent = speed === 0 ? 'Pause' : Math.max(1, Math.min(3, speed)) + '×';
        trig.setAttribute('aria-expanded', 'false');
    }
    let pop = document.getElementById('wodSpeedPop');
    if(pop) pop.hidden = true;
    document.querySelectorAll('.wod-m-speed-opt').forEach(btn => {
        let s = parseInt(btn.getAttribute('data-speed'), 10);
        btn.classList.toggle('active', s === speed);
    });
}
// ---- Match loading screen ----
// Every match (skirmish, mission, campaign battle, multiplayer) opens behind a loading screen with a progress bar, and the
// clock does not start until it lifts. Its steps are the real work: making the map, painting the terrain and borders,
// then the warm-up (wodWarmMatchForPlay), which builds what the first moments of play used to build mid-game and draws a
// few frames unseen so the graphics card has the big map images before the battle begins. Through a step the bar glides
// on the compositor towards the step's end over the time that step took last time on this device (kept per map size),
// so it keeps moving while the page is busy; it reaches the step's end only when the step is done.
const wodMatchLoad = { active: false, seq: 0, step: null, stepAt: 0, size: 0, timer: 0, shown: 0 };
const WOD_MATCH_LOAD_TIMES_KEY = 'wodMatchLoadTimesV1';
function wodMatchLoadActive() { return wodMatchLoad.active; }
function wodMatchLoadTimes() {
    try { return JSON.parse(localStorage.getItem(WOD_MATCH_LOAD_TIMES_KEY) || '{}') || {}; } catch(e) { return {}; }
}
function wodMatchLoadSetBar(pct, seconds) {
    const inner = document.getElementById('wodMatchLoadBarInner'), bar = document.getElementById('wodMatchLoadBar');
    const p = Math.max(0, Math.min(100, pct));
    if(inner) { inner.style.transitionDuration = Math.max(0, seconds || 0).toFixed(2) + 's'; inner.style.transform = `scaleX(${p / 100})`; }
    if(bar) bar.setAttribute('aria-valuenow', String(Math.round(p)));
    // (a short move is shown at once; through a long glide the ticks follow the bar)
    if(!(seconds > 0.3)) { wodMatchLoad.shown = Math.max(wodMatchLoad.shown, Math.floor(p)); const t = document.getElementById('wodMatchLoadPct'); if(t) t.textContent = wodMatchLoad.shown + '%'; }
}
// The percentage shown is where the bar really is (it moves on the compositor between ticks).
function wodMatchLoadTick() {
    if(!wodMatchLoad.active) return;
    const inner = document.getElementById('wodMatchLoadBarInner'), pct = document.getElementById('wodMatchLoadPct');
    if(!inner || !pct) return;
    let s = 0;
    try { const m = /matrix\(([-\d.e]+)/.exec(getComputedStyle(inner).transform || ''); s = m ? +m[1] : 0; } catch(e) {}
    const p = Math.max(wodMatchLoad.shown, Math.floor(s * 100));
    wodMatchLoad.shown = p; pct.textContent = p + '%';
}
function wodMatchLoadPaintFrame() {
    return new Promise(resolve => {
        let done = false;
        const go = () => { if(!done) { done = true; setTimeout(resolve, 0); } };
        if(typeof requestAnimationFrame === 'function') requestAnimationFrame(go);
        setTimeout(go, 60);
    });
}
function wodMatchLoadBegin(title, size) {
    const m = wodMatchLoad, el = document.getElementById('wodMatchLoadOverlay');
    m.active = true; m.seq++; m.step = null;
    m.size = Math.round(+size || +(document.getElementById('setupMapSize') || {}).value || gameData.mapRadius || 60);
    if(el) { el.classList.remove('hidden', 'wod-match-load-out'); el.setAttribute('aria-busy', 'true'); }
    const t = document.getElementById('wodMatchLoadTitle'); if(t) t.textContent = title || 'Preparing battle';
    const c = document.getElementById('wodMatchLoadCaption'); if(c) c.textContent = 'Preparing…';
    m.shown = 0; wodMatchLoadSetBar(0, 0);
    clearInterval(m.timer); m.timer = setInterval(wodMatchLoadTick, 120);
}
// Begin a step of the loading (from/to in percent of the whole bar); the last step's time is recorded for next time.
async function wodMatchLoadStep(key, from, to, caption, defaultSeconds) {
    const m = wodMatchLoad;
    if(!m.active) return;
    wodMatchLoadFinishStep();
    const times = wodMatchLoadTimes(), est = +times[key + '@' + m.size] || defaultSeconds || 0.5;
    m.step = { key, from, to }; m.stepAt = performance.now();
    const c = document.getElementById('wodMatchLoadCaption'); if(c && caption) c.textContent = caption;
    // jump to the step's start, then glide towards (most of) its end over the time it is expected to take
    wodMatchLoadSetBar(Math.max(from, m.shown), 0.15);
    await wodMatchLoadPaintFrame();
    wodMatchLoadSetBar(from + (to - from) * 0.92, est * 1.1);
    await wodMatchLoadPaintFrame();
}
function wodMatchLoadFinishStep() {
    const m = wodMatchLoad, st = m.step;
    if(!st) return;
    m.step = null;
    const took = (performance.now() - m.stepAt) / 1000;
    try {
        const times = wodMatchLoadTimes(), k = st.key + '@' + m.size, old = +times[k];
        times[k] = +(old > 0 ? old * 0.5 + took * 0.5 : took).toFixed(3);
        localStorage.setItem(WOD_MATCH_LOAD_TIMES_KEY, JSON.stringify(times));
    } catch(e) {}
    wodMatchLoadSetBar(st.to, 0.12);
}
async function wodMatchLoadEnd() {
    const m = wodMatchLoad;
    if(!m.active) return;
    wodMatchLoadFinishStep();
    const c = document.getElementById('wodMatchLoadCaption'); if(c) c.textContent = 'Ready';
    wodMatchLoadSetBar(100, 0.15);
    await new Promise(r => setTimeout(r, 170));
    wodMatchLoadHide();
}
function wodMatchLoadHide() {
    const m = wodMatchLoad, el = document.getElementById('wodMatchLoadOverlay');
    if(!m.active && el && el.classList.contains('hidden')) return;
    m.active = false; m.step = null; clearInterval(m.timer); m.timer = 0;
    if(!el) return;
    el.classList.add('wod-match-load-out'); el.setAttribute('aria-busy', 'false');
    const seq = m.seq;
    setTimeout(() => { if(!m.active && m.seq === seq) el.classList.add('hidden'); }, 280);
}
// The warm-up behind the loading screen, once the map, towns and armies exist and the game loop runs paused: the
// terrain and border paint (otherwise finished a slice per frame through the first seconds of play), the bridge index
// and every faction's supply network, the fog of war, then a few frames drawn unseen (the first draws of a big map
// upload its images to the graphics card, a stall of a few hundred milliseconds). None of it changes the game.
async function wodWarmMatchForPlay(from, to, opts) {
    if(!gameData.hexList || !gameData.hexList.length) return;
    const frames = !(opts && opts.frames === false);
    const span = to - from;let at = from;
    const next = share => { const a = at; at = share >= 1 ? to : at + span * share; return [a, at]; };
    if(terrainNeedsUpdate) {
        await wodMatchLoadStep('paint', ...next(0.45), 'Painting the terrain', 0.8);
        try {
            if(UI.canvas && UI.canvas.style.display !== 'none' && (wodTerrainNeedFullRebuild || !wodTerrainBaseBuilt)) updateTerrainCache();
            for(let i = 0; i < 200 && terrainNeedsUpdate && !wodSuppressTerrainBake; i++) {
                wodStepTerrainPoliticalBake(30);
                if(i % 4 === 3) await wodMatchLoadPaintFrame();
            }
        } catch(e) { console.warn('warm terrain', e); }
    }
    await wodMatchLoadStep('routes', ...next(0.2), 'Laying supply lines', 0.25);
    try {
        wodEnsureBridgePathIndex();
        for(const h of gameData.hexList)
            if(h.owner > 0 && !isWaterHex(h)) wodCurrentSupplyComponent(h, h.owner);
        if(typeof wodRefreshFogVision === 'function') wodRefreshFogVision(0, true);
    } catch(e) { console.warn('warm routes', e); }
    if(!frames) return;
    await wodMatchLoadStep('view', ...next(1), 'Readying the battlefield', 0.5);
    try {
        // the running loop draws behind the screen; give it frames until nothing is left to paint
        const until = performance.now() + 2500;
        // (a tab in the background gets no animation frames: the timeout keeps a player loading there from waiting forever)
        for(let n = 0; n < 4 || terrainNeedsUpdate && performance.now() < until; n++) {
            await new Promise(r => { const t = setTimeout(r, 120); requestAnimationFrame(() => { clearTimeout(t); r(); }); });
            if(n > 40) break;
        }
        if(document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 800))]);
    } catch(e) { console.warn('warm view', e); }
}
function startGame(mode, opts) {
    opts = opts || {};
    if(mode === 'ai' && !opts.mission && typeof wodIsMapPreviewGenerating === 'function' && wodIsMapPreviewGenerating()) {
        showNotification('Map is still generating...');
        return;
    }
    if(mode === 'ai' && !opts.mission && typeof wodAbandonSoloPreviewForLaunch === 'function')
        wodAbandonSoloPreviewForLaunch();
    let launchingMission = !!(opts.mission || gameData._selectedMissionEntry);
    let launchingCampaign = !!(gameData._campaignRun);
    // (the loading screen goes up first, so nothing of the half-made match shows)
    wodMatchLoadBegin(launchingCampaign ? 'Preparing battle' : launchingMission ? 'Loading mission' : 'Preparing battle');
    gameState = 'PLAYING';
    pauseMenuBackgroundBattle();
    if(opts.mission) gameData._launchingMission = true;
    wodPrepareForNewMatch({ keepMp: false, keepLiveMap: launchingMission || launchingCampaign });
    if(launchingCampaign) {
        let runNode = (typeof wodRogueNodeTemplate === 'function' && gameData._campaignRun)
            ? wodRogueNodeTemplate(gameData._campaignRun.nodeId) : null;
        wodAssignMatchGenerals(typeof wodRoguePickGenerals === 'function'
            ? wodRoguePickGenerals(runNode) : null);
    } else
        wodAssignMatchGenerals(null);
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
    if(window.wodMusic) {
        try { window.wodMusic.bindUi(); window.wodMusic.start(); } catch(e) { console.warn(e); }
    }
    // Paused while the match loads (the clock starts when the loading screen lifts); campaign battles stay paused
    // until the roster is fielded and deploy begins, so the loop cannot fire a false "army destroyed" defeat during load.
    setGameSpeed(0, true);
    wodResetMobileHud();
    if(!gameData.layers) gameData.layers = {};
    gameData.layers.territory = false;
    gameData.layers.cities = false;
    void (async function() {
        try {
            // If the boot splash or menu battlefield is still generating, let them finish first —
            // boot warm-up calls update()/generateMap() and would run against the new match's
            // half-initialized state (this could pause a fresh match with a false instant defeat).
            let bootGuard = 0;
            await wodMatchLoadStep('wait', 0, 4, 'Preparing…', 0.1);
            while((window._wodBootBusy || window._wodMenuBootstrapBusy) && bootGuard++ < 600)
                await new Promise(r => setTimeout(r, 100));
            if(mode === 'ai' && !opts.mission && typeof wodAwaitMapGenIdle === 'function')
                await wodAwaitMapGenIdle();
            await initGame();
            // Each computer faction's commander is drawn now, at random, and kept secret.
            wodAiAssignCommanders();
            gameData._campaignEnded = false;
            hideCampaignSummaryOverlay();
            wodResetEndCountdowns();
            // (the loop runs paused from here; the warm-up finishes what the first frames of play would do)
            await wodWarmMatchForPlay(80, 99);
            await wodMatchLoadEnd();
            if(gameState !== 'PLAYING') return;
            wodBeginLifetimeMatch();
            if(gameData._campaignRun) {
                wodCampaignOnBattleStart();
                // End checks stay off until Begin battle; speed remains 0 for deploy.
            } else {
                setGameSpeed(1, true);
                gameData._matchReadyForEndChecks = true;
            }
            wodSyncCampaignBattleHud();
        } catch(e) {
            console.error(e);
            wodMatchLoadHide();
        }
        wodSyncDesktopLayersPanelExpanded();
        syncInGameLayerToolbar();
        wodApplyPlayViewportLock(true);
    })();
}
function returnToMenu() {
    if(gameState==='PLAYING'&&!gameData.menuAttractMode)wodFinishLifetimeMatch('defeat','quit');
    wodFlushLifetimeProgress();
    hideCampaignSummaryOverlay();
    gameData._spectator=null;gameData._mpSurrenderedToAi=false;wodSyncSpectatorUi();
    wodHideMissionPopup();
    let deployBanner = document.getElementById('wodDeployBanner');
    if(deployBanner) deployBanner.classList.add('hidden');
    // Clear any in-progress victory/defeat countdown so it cannot linger on the menu.
    if(typeof wodResetEndCountdowns === 'function') wodResetEndCountdowns();
    else {
        gameData._endCountdowns = null;
        let endBanner = document.getElementById('wodEndCountdownBanner');
        if(endBanner) endBanner.classList.add('hidden');
    }
    // Quitting a campaign battle mid-fight counts as a failed assault: the roster
    // syncs to the units' current state and the node is not captured.
    if(gameData._campaignRun && !gameData._campaignRun.synced && gameState === 'PLAYING')
        wodCampaignAfterBattle(false);
    gameData._campaignRun = null;
    gameData._campaignRegionMap = null;
    gameData._campaignAiAggressive = false;
    gameData._missionRuntime = null;
    gameData._selectedMissionEntry = null;
    gameData._launchingMission = false;
    if(typeof wodAssignMatchGenerals === 'function') wodAssignMatchGenerals(null);
    wodSyncCampaignBattleHud();
    if(gameData && gameData.mp && gameData.mp.enabled && gameState === 'PLAYING')
        wodMpLeaveActiveMatch();
    wodApplyPlayViewportLock(false);
    gameState = 'MENU';
    gameData._soloMapPreviewMatchesStart = false;
    gameData._soloPreviewSnapshot = null;
    wodResetMobileHud();
    UI.inGameUI.style.display = 'none';
    UI.escMenu.classList.add('hidden');
    document.body.classList.remove('wod-esc-open');
    UI.mainMenu.classList.remove('hidden');
    UI.panels.forEach(p => p.classList.add('hidden'));
    wodRefreshMainMenuOrder();
    if(window.wodMusic) {
        try { window.wodMusic.bindUi(); window.wodMusic.start(); } catch(e) {}
    }
    stopGame();
    if(menuBattleLive || menuDemoSeeded) resumeMenuBackgroundBattle();
    else void bootstrapMenuBackgroundBattle();
    // back on the menu with an out-of-date game: the update notice, once per new version (js/multiplayer.js)
    if(typeof wodMaybeWarnOutdatedOnMenu === 'function') setTimeout(wodMaybeWarnOutdatedOnMenu, 600);
}
const WOD_END_COUNTDOWN_SECONDS = 15;
/** Objectives don't end the match instantly: once a win/lose condition holds, a
 * 15-second countdown runs (sim time). If the condition breaks — a city is retaken,
 * a unit survives — the countdown cancels. Returns true when the countdown expires. */
function wodTickEndCountdown(kind, conditionMet, dt, label, danger) {
    if(!gameData._endCountdowns) gameData._endCountdowns = {};
    let cds = gameData._endCountdowns;
    if(!conditionMet) {
        if(cds[kind] != null) {
            delete cds[kind];
            wodUpdateEndCountdownBanner();
        }
        return false;
    }
    if(cds[kind] == null) cds[kind] = { left: WOD_END_COUNTDOWN_SECONDS, label, danger: !!danger };
    else cds[kind].left -= (dt || 0);
    wodUpdateEndCountdownBanner();
    return cds[kind].left <= 0;
}
function wodUpdateEndCountdownBanner() {
    let el = document.getElementById('wodEndCountdownBanner');
    if(!el) return;
    if(wodEscMenuOpen() || wodMissionPopupOpen()) {
        el.classList.add('hidden');
        return;
    }
    let cds = gameData._endCountdowns;
    let active = null;
    if(cds) for(let k in cds) { if(!active || cds[k].left < active.left) active = cds[k]; }
    if(!active || gameData._campaignEnded || gameState !== 'PLAYING' || gameData.menuAttractMode) {
        // Fall through to campaign battle timer when no end-countdown is active.
        if(gameData._campaignRun?.defense && gameData._campaignRun.holdSec > 0 && !gameData._campaignEnded && gameState === 'PLAYING' && !gameData.menuAttractMode) {
            wodUpdateCampaignDefenseHoldBanner();
            return;
        }
        el.classList.add('hidden');
        return;
    }
    let secs = Math.max(0, Math.ceil(active.left));
    el.textContent = active.label + ' — ' + secs + 's';
    el.classList.toggle('wod-endcd-danger', active.danger === true);
    el.classList.remove('hidden');
}
function wodUpdateCampaignDefenseHoldBanner() {
    let el = document.getElementById('wodEndCountdownBanner');
    let run = gameData._campaignRun;
    if(!el || !run?.defense || !(run.holdSec > 0) || gameData._campaignEnded || gameState !== 'PLAYING' || gameData.menuAttractMode) return;
    if(wodEscMenuOpen() || wodMissionPopupOpen()) {
        el.classList.add('hidden');
        return;
    }
    // Prefer end-condition countdowns when they are active.
    let cds = gameData._endCountdowns;
    if(cds) for(let k in cds) { if(cds[k]) return; }
    let need = run.holdSec || WOD_ROGUE_BATTLE_HOLD_SEC;
    let left = Math.max(0, need - (run.holdElapsed || 0));
    el.textContent = 'Survive — ' + wodFormatHoldClock(left) + ' remaining';
    el.classList.remove('wod-endcd-danger');
    el.classList.remove('hidden');
}
function wodResetEndCountdowns() {
    gameData._endCountdowns = null;
    let el = document.getElementById('wodEndCountdownBanner');
    if(el) el.classList.add('hidden');
}
/** Ends solo vs AI matches: domination (default) or annihilation; also handles defeat when the player has no cities. In multiplayer, only the host evaluates end conditions and broadcasts outcomes. */
function checkCampaignEndConditions(dt) {
    if(gameState !== 'PLAYING' || gameData.menuAttractMode || gameData._campaignEnded) return;
    if(wodCampaignDeployActive()) return;
    if(wodEscMenuOpen() || wodMissionPopupOpen()) return;
    if(gameData._matchReadyForEndChecks === false) return;
    if(window._wodBootBusy || window._wodMenuBootstrapBusy || gameData._mapGenInProgress) return;
    if(gameData._spectator&&!gameData.mp?.enabled){wodCheckSpectatorEnd();return;}
    if(gameData.mp && gameData.mp.enabled) {
        if(gameData.mp.isHost) wodMpCheckEndConditionsHost(dt);
        return;
    }
    // dt is already sim-speed-scaled by the main loop.
    let simDt = dt || 0;
    if(gameData.mission?.objective&&gameData._missionRuntime) {wodCheckScriptedMissionEnd(simDt);return;}
    if(wodTickEndCountdown('cityLoss', !playerControlsAnyCity(), simDt, 'All cities lost! Defeat in', true)) {
        triggerCampaignDefeat('Defeat — all cities lost.');
        return;
    }
    if(gameData._endCountdowns && gameData._endCountdowns.cityLoss) return;
    // Campaign assaults use skirmish objectives and allow rebuilding an army.
    if(gameData._campaignRun) {
        // Briefing / load / deploy: roster is not battle-live yet — never arm wipe defeat.
        if(!gameData._campaignRun.battleLive) return;
        let run = gameData._campaignRun;
        if(gameData._endCountdowns) delete gameData._endCountdowns.campArmyLost;
        if(run.defense) {
            const need = WOD_ROGUE_BATTLE_HOLD_SEC;
            run.holdSec = need;
            run.holdElapsed = (run.holdElapsed || 0) + simDt;
            if(gameData._endCountdowns) delete gameData._endCountdowns.domination;
            wodUpdateCampaignDefenseHoldBanner();
            if(run.holdElapsed >= need && playerControlsAnyCity()) {
                triggerCampaignVictory('Victory — held the line for ' + wodFormatHoldClock(need) + '.', false);
            }
            return;
        }
        run.holdSec = 0;
    }
    let mode = gameData.victoryMode === 'annihilation' ? 'annihilation' : 'domination';
    if(mode === 'domination') {
        if(wodTickEndCountdown('domination', !anyEnemyOwnedCityRemains(), simDt, 'All enemy cities captured! Victory in'))
            triggerCampaignVictory('Victory — domination: all enemy cities captured.', false);
        return;
    }
    gameData._annihilationCheckAcc = (gameData._annihilationCheckAcc || 0) + (simDt || 0);
    if(gameData._annihilationCheckAcc < 0.14) {
        wodUpdateEndCountdownBanner();
        return;
    }
    let accDt = gameData._annihilationCheckAcc;
    gameData._annihilationCheckAcc = 0;
    let playerMil = countPlayerCombatUnitsExcludingConvoys();
    let enemyMil = countEnemyCombatUnitsExcludingConvoys();
    if(wodTickEndCountdown('annWin', enemyMil === 0 && playerMil > 0, accDt, 'Enemy forces destroyed! Victory in')) {
        triggerCampaignVictory('Victory — annihilation: all enemy combat forces destroyed.', true);
        return;
    }
    if(wodTickEndCountdown('annLoss', playerMil === 0 && enemyMil > 0, accDt, 'Your army is destroyed! Defeat in', true)) {
        triggerCampaignDefeat('Defeat — annihilation: all your combat forces were destroyed.');
    }
}
/** Tracks lifetime stats when a town changes hands; counts eliminations when prevOwner has zero cities left. */
function handleWodTownCaptureAndElimination(prevOwner, newOwner) {
    if(gameState !== 'PLAYING' || gameData.menuAttractMode) return;
    if(prevOwner === newOwner) return;
    if(newOwner>0&&prevOwner>0)wodRecordOwnerLifetime(newOwner,'citiesCaptured',1);
    if(gameData.mp && gameData.mp.enabled) {
        if(gameData.mp.isHost && newOwner > 0 && prevOwner > 0 && prevOwner !== newOwner) {
            if(!gameData.sessionCitiesCapturedByOwner) gameData.sessionCitiesCapturedByOwner = {};
            gameData.sessionCitiesCapturedByOwner[newOwner] = (gameData.sessionCitiesCapturedByOwner[newOwner] || 0) + 1;
        }
        return;
    }
    if(!wodProgress) return;
    if(newOwner === 1 && prevOwner > 1) {
        gameData.sessionCitiesCaptured = (gameData.sessionCitiesCaptured || 0) + 1;
    }
    if(prevOwner <= 0) {
        checkWodAchievements();
        scheduleSaveWodProgress();
        return;
    }
    if(countCitiesForOwner(prevOwner) > 0) {
        checkWodAchievements();
        scheduleSaveWodProgress();
        return;
    }
    if(newOwner === 1 && prevOwner > 1) {
        wodBumpLifetime('battlesWon', 1);
    }
    checkWodAchievements();
    scheduleSaveWodProgress();
}
// --- Generation ---
function wodArmMapPreviewSpinner(canvasId) {
    if(!canvasId) return;
    if(!gameData._wodPreviewSpinnerCanvasIds) gameData._wodPreviewSpinnerCanvasIds = new Set();
    let cv = document.getElementById(canvasId);
    if(!cv) return;
    cv.dataset.wodMapGenerating = '1';
    let busy = document.getElementById(canvasId + 'Busy');
    if(busy) {
        busy.classList.remove('hidden');
        busy.setAttribute('aria-hidden', 'false');
    }
    let rect = cv.getBoundingClientRect();
    let w = Math.max(80, Math.floor(rect.width) || 320);
    let h = Math.max(60, Math.floor(rect.height) || 220);
    cv.width = w;
    cv.height = h;
    let ctx = cv.getContext('2d');
    if(ctx) {
        ctx.fillStyle = '#154360';
        ctx.fillRect(0, 0, w, h);
    }
    gameData._wodPreviewSpinnerCanvasIds.add(canvasId);
}
function wodDisarmMapPreviewSpinner(canvasId) {
    if(!canvasId || !gameData._wodPreviewSpinnerCanvasIds) return;
    gameData._wodPreviewSpinnerCanvasIds.delete(canvasId);
    let cv = document.getElementById(canvasId);
    if(cv) cv.dataset.wodMapGenerating = '0';
    let busy = document.getElementById(canvasId + 'Busy');
    if(busy) {
        busy.classList.add('hidden');
        busy.setAttribute('aria-hidden', 'true');
    }
}
function previewLoadedMap(canvasOrId) {
    let prevCanvas = canvasOrId;
    if(typeof canvasOrId === 'string') prevCanvas = document.getElementById(canvasOrId);
    if(!prevCanvas) prevCanvas = document.getElementById('mapPreview');
    if(!prevCanvas) return;
    // (the summary under the skirmish preview says what this map is: a new one, or one loaded from the library)
    if(prevCanvas.id === 'mapPreview' && typeof wodSyncSetupMapUi === 'function') wodSyncSetupMapUi();

    let rect = prevCanvas.getBoundingClientRect();
    let w = Math.max(80, Math.floor(rect.width) || 320);
    let h = Math.max(60, Math.floor(rect.height) || 220);
    prevCanvas.width = w;
    prevCanvas.height = h;

    let pCtx = prevCanvas.getContext('2d');
    pCtx.clearRect(0, 0, prevCanvas.width, prevCanvas.height);
    pCtx.fillStyle = '#154360';
    pCtx.fillRect(0, 0, prevCanvas.width, prevCanvas.height);

    // Find bounds of landmass
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let hasLand = false;
    for(let hex of gameData.hexList) {
        if(!isWaterHex(hex)) {
            if(hex.x < minX) minX = hex.x;
            if(hex.x > maxX) maxX = hex.x;
            if(hex.y < minY) minY = hex.y;
            if(hex.y > maxY) maxY = hex.y;
            hasLand = true;
        }
    }

    if(!hasLand) return;

    let landWidth = Math.max(maxX - minX, (gameData.hexRadius || 10) * 0.35);
    let landHeight = Math.max(maxY - minY, (gameData.hexRadius || 10) * 0.35);
    let scale = Math.min((prevCanvas.width - 20) / landWidth, (prevCanvas.height - 20) / landHeight);

    let cx = prevCanvas.width / 2 - ((minX + maxX) / 2) * scale;
    let cy = prevCanvas.height / 2 - ((minY + maxY) / 2) * scale;

    for(let hex of gameData.hexList) {
        if(!isWaterHex(hex)) {
            pCtx.fillStyle = getTerrainColor(hex.type);
            let pSize = Math.max(1, gameData.hexRadius * scale * 1.45);
            pCtx.fillRect(cx + hex.x*scale - pSize/2, cy + hex.y*scale - pSize/2, pSize + 1, pSize + 1);
        }
    }

    let wodPreviewDrawPolitical = prevCanvas.id === 'mpLobbyMapPreview' || prevCanvas.id === 'mapPreview';
    if(wodPreviewDrawPolitical) {
        let hxLookup = gameData.hexes || {};
        wodPaintMapPreviewPolitical(pCtx, gameData.hexList, gameData.cities, null, cx, cy, scale, gameData.hexRadius, hxLookup);
        for(let u of gameData.entities) {
            if(!u.owner || u.hp <= 0 || u.type === 'convoy') continue;
            let col = factionColors[u.owner] || '#bbb';
            let px = cx + u.x * scale;
            let py = cy + u.y * scale;
            let sz = Math.max(1.25, scale * 1.65);
            pCtx.fillStyle = col;
            pCtx.strokeStyle = 'rgba(0,0,0,0.35)';
            pCtx.lineWidth = 0.75;
            pCtx.beginPath();
            pCtx.rect(px - sz / 2, py - sz / 2, sz, sz);
            pCtx.fill();
            pCtx.stroke();
        }
    }
}
function wodJsonCloneReplacer(key, value) {
    // Neighbor caches point at other hexes and cannot be JSON-cloned.
    if(key === '_nbrs') return undefined;
    if(key && key.charAt(0) === '_' && value && typeof value === 'object') return undefined;
    return value;
}
function wodDeepClonePlain(obj) {
    return JSON.parse(JSON.stringify(obj, wodJsonCloneReplacer));
}
function previewMap(opts) {
    opts = opts || {};
    if(wodIsMapPreviewGenerating()) return;
    let politicsOnly = !!(opts.politicsOnly && wodCanRegeneratePoliticsOnly());
    let previewEpoch = gameData._soloPreviewEpoch || 0;
    wodArmMapPreviewSpinner('mapPreview');
    gameData._soloPreviewGenerating = true;
    gameData._soloMapPreviewMatchesStart = false;
    gameData._soloPreviewSnapshot = null;
    wodRefreshMapPreviewGeneratingUi();
    requestAnimationFrame(() => {
        requestAnimationFrame(async () => {
            if((gameData._soloPreviewEpoch || 0) !== previewEpoch) {
                gameData._soloPreviewGenerating = false;
                wodEndMapGenAiLock();
                wodDisarmMapPreviewSpinner('mapPreview');
                wodHideMapGenOverlay();
                wodRefreshMapPreviewGeneratingUi();
                return;
            }
            let ok = true;
            try {
                await wodAwaitOtherMapGen();
                let prevSz = document.getElementById('setupMapSize');
                wodApplyMapSizePreset(prevSz ? prevSz.value : 60);
                wodEndMapGenAiLock();
                wodBeginMapGenAiLock();
                if(typeof wodApplySetupAiCountFromUi === 'function') wodApplySetupAiCountFromUi();
                if(!politicsOnly) {
                    gameData.loadedCustomMap = false;
                    gameData._equippedShopMapId = null;
                    if(wodProgress && wodProgress.profile) wodProgress.profile.equippedShopMapId = null;
                }
                wodMapGenYieldingStart(politicsOnly ? 5 : 26);
                try {
                    if(politicsOnly) {
                        let seed = (gameData._mapGenSeed || 1) >>> 0;
                        wodPushSeededRandom((seed ^ Math.imul(gameData.aiCount | 0, 0x9e3779b9)) >>> 0);
                        try {
                            ok = await wodRegeneratePoliticsOnCurrentTerrain();
                        } finally {
                            wodPopRandom();
                        }
                        if(!ok) {
                            politicsOnly = false;
                            gameData.loadedCustomMap = false;
                            await generateMap();
                            ok = true;
                        }
                    } else {
                        await generateMap();
                    }
                } finally {
                    wodMapGenYieldingStop();
                }
                if((gameData._soloPreviewEpoch || 0) !== previewEpoch) return;
                previewLoadedMap('mapPreview');
            } catch(e) {
                ok = false;
                console.warn(e);
            } finally {
                if((gameData._soloPreviewEpoch || 0) !== previewEpoch) {
                    gameData._soloPreviewGenerating = false;
                    wodEndMapGenAiLock();
                    wodDisarmMapPreviewSpinner('mapPreview');
                    wodHideMapGenOverlay();
                    wodRefreshMapPreviewGeneratingUi();
                    return;
                }
                gameData._soloMapPreviewMatchesStart = ok;
                if(ok) wodCaptureSoloPreviewSnapshot();
                gameData._soloPreviewGenerating = false;
                wodEndMapGenAiLock();
                wodDisarmMapPreviewSpinner('mapPreview');
                wodHideMapGenOverlay();
                wodRefreshMapPreviewGeneratingUi();
            }
        });
    });
}
async function initGame() {
    gameData._encircWork = null;
    gameData._aiSpawnBurst = null;
    gameData._aiSpawnPulse = null;
    gameData._aiStratWork = null;
    wodInvalidateAiFrontlineHexCache();
    wodCombatFxClear();
    await wodEnsureFxPrecache();
    wodTerrainBakeNextMs = 0;
    wodTerrainPolWork = null;
    gameData._wodPolBakeAgain = false;
    wodGfxLiteLatch = false;
    wodGfxSimplifyLatch = false;
    gameData._fogVisible = null;
    gameData._fogExplored = new Set();
    gameData._fogVisionTimer = 0;
    gameData._fogCanvasDirty = true;
    gameData._sessionIncomeAcc = { player: 0, ai: 0, byOwner: {} };

    wodSyncViewportAndCanvas();

    if(gameData.mp && gameData.mp.enabled) {
        wodPrepareForNewMatch({ keepMp: true });
        wodClearLiveMapForNewMatch();
        gameData.loadedCustomMap = false;
        let meta = window.wodMpRoomMeta || {};
        wodMpSyncLaunchSettingsFromMeta(meta);
        if(meta.fogOfWar != null) gameData.fogOfWar = !!meta.fogOfWar;
        await wodMpFinalizeLaunchMapFromLobby(meta);
        if(!gameData.hexList || !gameData.hexList.length)
            throw new Error('Multiplayer map is empty');
        wodCaptureTerrainPoliticsBase();
        gameData.playerShiftWaypoints = [];
        gameData.pathStrokePreview = null;
        syncHudObjectiveDisplay();
        wodBindHudResourceTooltips();
        return;
    }

    // Solo / skirmish — apply Setup panel variables (must not run for multiplayer).
    let launchingMission = !!(gameData._launchingMission || gameData._selectedMissionEntry);
    let launchingCampaign = !!(gameData._campaignRun && gameData._campaignRegionMap);
    wodPrepareForNewMatch({ keepMp: false, keepLiveMap: launchingMission || launchingCampaign });
    let mapSizeEl = document.getElementById('setupMapSize');
    let sizePreset = wodApplyMapSizePreset(mapSizeEl ? mapSizeEl.value : 60);
    let newRadius = sizePreset.mapRadius;

    let aiCount = document.getElementById('setupAI');
    if(aiCount)
        gameData.aiCount = Math.max(1, Math.min(WOD_MAX_AI_OPPONENTS, parseInt(aiCount.value, 10) || 1));
    // Computer difficulty (missions too); a campaign battle has set its own.
    if(!launchingCampaign) gameData.aiDifficulty = wodSetupAiDifficulty();

    let victorySel = document.getElementById('setupVictoryMode');
    if(launchingMission && gameData.mission && gameData.mission.victoryMode)
        gameData.victoryMode = gameData.mission.victoryMode === 'annihilation' ? 'annihilation' : 'domination';
    else
        gameData.victoryMode = (victorySel && victorySel.value === 'annihilation') ? 'annihilation' : 'domination';
    let fogEl = document.getElementById('setupFogOfWar');
    gameData.fogOfWar = !!(fogEl && fogEl.checked);

    let startMoney = document.getElementById('setupMoney');
    if(startMoney && !(gameData.loadedCustomMap&&gameData._mapExportHadStartEconomy))
        gameData.money = parseInt(startMoney.value, 10) || 10000;
    let shapeInput = document.getElementById('setupMapShape');
    let requestedShape = shapeInput ? shapeInput.value : 'island';

    let periodEl = document.getElementById('setupGamePeriod');
    const authoredPeriod=!launchingCampaign&&gameData.loadedCustomMap&&gameData._loadedMapGamePeriod;
    gameData._matchPeriod = authoredPeriod || (periodEl ? periodEl.value : (gameData.gamePeriod || 'modern'));
    if(!authoredPeriod&&!wodIsPeriodUnlocked(gameData._matchPeriod)) gameData._matchPeriod = 'modern';
    gameData.gamePeriod = gameData._matchPeriod;
    wodApplyPeriodUiLabels();

    applyPlayerFactionColorFromSetup();

    await wodMatchLoadStep(launchingMission ? 'mission' : launchingCampaign ? 'campaign' : 'map', 4, 62,
        launchingMission ? 'Loading the mission map' : launchingCampaign ? 'Loading the battlefield' : 'Generating the map', 2);
    {
        if(launchingMission) {
            if(!gameData.loadedCustomMap || !gameData.hexList.length) {
                let ok = await wodApplyMissionEntry(gameData._selectedMissionEntry);
                if(!ok) throw new Error('Mission map could not be loaded');
            }
            wodSyncSetupControlsFromLoadedMap();
            await assignStartingCities();
            wodCaptureTerrainPoliticsBase();
        } else if(launchingCampaign) {
            // Region battle map already loaded in wodRogueStartBattle.
            if(!gameData.loadedCustomMap || !gameData.hexList.length) {
                let regionMap = gameData._campaignRegionMap ||
                    wodRogueBuildRegionBattleMap(gameData._campaignRun.nodeId, gameData._campaignRun.fromNodeId);
                if(regionMap && window.WOD && typeof WOD.loadMapData === 'function') {
                    WOD.loadMapData(regionMap);
                    gameData.loadedCustomMap = true;
                } else {
                    throw new Error('Campaign region map could not be loaded');
                }
            }
            // Keep authored city names/ownership from the zoomed war-map region.
            await assignStartingCities();
            wodCaptureTerrainPoliticsBase();
        } else {
            let shapeChanged = !gameData.loadedCustomMap && gameData.mapShape !== requestedShape;
            if(gameData.loadedCustomMap) {
                if(gameData.hexList.length === 0 || gameData.mapRadius !== newRadius || shapeChanged) {
                    gameData.mapRadius = newRadius;
                    gameData.loadedCustomMap = false;
                    await generateMap();
                } else {
                    await assignStartingCities();
                }
            } else {
                let previewCommitted = !!gameData._soloMapPreviewMatchesStart;
                let snap = gameData._soloPreviewSnapshot;
                let restoredPreviewMap = wodRestoreSoloPreviewSnapshot(newRadius, requestedShape);
                gameData._soloMapPreviewMatchesStart = false;
                if(restoredPreviewMap) {
                    await assignStartingCities();
                } else {
                    if(snap && snap.mapGenSeed && snap.mapRadius === newRadius && snap.mapShape === requestedShape &&
                        (snap.aiCount == null || snap.aiCount === gameData.aiCount)) {
                        gameData._mapGenSeed = snap.mapGenSeed;
                        gameData._wodReuseMapGenSeed = true;
                    } else if(previewCommitted && gameData._mapGenSeed &&
                        gameData.mapRadius === newRadius && gameData.mapShape === requestedShape &&
                        !wodLiveMapLooksLikeMenuAttract()) {
                        gameData._wodReuseMapGenSeed = true;
                    }
                    gameData.mapRadius = newRadius;
                    gameData.mapShape = requestedShape;
                    await generateMap();
                }
                gameData._soloPreviewSnapshot = null;
            }
        }
    }
    // Final launch boundary covers procedural, preview, custom-map and campaign paths.
    wodNormalizeStartingCityEconomy();
    gameData._launchingMission = false;
    updateTerrainKey();

    gameData.playerShiftWaypoints = [];
    gameData.pathStrokePreview = null;

    syncHudObjectiveDisplay();

    wodBindHudResourceTooltips();

    // Pre-bake the full terrain canvas now (loading screen still up) so the first
    // gameplay frame doesn't stall ~350ms on a lazy full rebuild inside draw().
    await wodMatchLoadStep('terrain', 62, 80, 'Painting the terrain', 0.9);
    if(terrainNeedsUpdate && UI.canvas && UI.canvas.style.display !== 'none') {
        try { updateTerrainCache(); } catch(_) {}
    }

    lastTime = performance.now();
    if(animationFrameId) cancelAnimationFrame(animationFrameId);
    gameLoop(lastTime);
}
function stopGame() {
    if(typeof wodResetEndCountdowns === 'function') wodResetEndCountdowns();
    else if(typeof gameData !== 'undefined' && gameData) {
        gameData._endCountdowns = null;
        let endBanner = document.getElementById('wodEndCountdownBanner');
        if(endBanner) endBanner.classList.add('hidden');
    }
    if(typeof gameData !== 'undefined' && gameData && gameData.mp && gameData.mp.enabled) wodMpDisconnectAndReset();
    if(animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    wodUnitsDrawOrderScratch.length = 0;
    wodMobileUiStatTimer = 0;
    wodPlayerOrderQueue.length = 0;
    wodPlayerOrderPumpScheduled = false;
    wodOrderArrowBuildQueue.length = 0;
    wodOrderArrowBuildPumpScheduled = false;
    if(gameData) {
        gameData._aiSpawnBurst = null;
        gameData._aiSpawnPulse = null;
        gameData._aiStratWork = null;
        wodInvalidateAiFrontlineHexCache();
        wodCombatFxClear();
        gameData._lastMapFingerprint = null;
        gameData._mapGenSeed = null;
        gameData._wodReuseMapGenSeed = false;
        gameData._soloMapPreviewMatchesStart = false;
    }
    gameData._uiTroopCache = undefined;
    gameData._uiTankCache = undefined;
    gameData._uiShipCache = undefined;
    if(gameData._unitGridScratch && gameData._unitGridScratch.cells)
        gameData._unitGridScratch.cells.clear();
    if(gameData._cityGridScratch && gameData._cityGridScratch.cells)
        gameData._cityGridScratch.cells.clear();
    if(wodWheelZoomRaf) {
        cancelAnimationFrame(wodWheelZoomRaf);
        wodWheelZoomRaf = 0;
    }
    wodWheelBatch = null;
    wodCancelPinchCameraRaf();
    wodFlushPendingPinchCamera();
    touchCamGesture = null;
    if(gameData) gameData._encircWork = null;
    wodSetMpMatchUiFlag(false);
}
function wodOwnersListActiveForProcgen() {
    let basePlayerCount = wodGetMapPlayerCount();
    let activeOwners = gameData.mp && gameData.mp.enabled ? wodGetLobbyLayoutFactionSlots() : null;
    let ownersList = [];
    if(activeOwners && activeOwners.length > 0) ownersList = activeOwners.slice();
    else for(let o = 1; o <= basePlayerCount; o++) ownersList.push(o);
    return ownersList;
}
function wodFactionPoliticalCentroid(owner) {
    let sx = 0,
        sy = 0,
        n = 0;
    for(let h of gameData.hexList) {
        if(!isClaimableLand(h) || isWaterHex(h)) continue;
        if(h.owner !== owner) continue;
        sx += h.x;
        sy += h.y;
        n++;
    }
    if(!n) return null;
    return { x: sx / n, y: sy / n };
}
function remapAttractBattleFromPlayerSlotsToAis() {
    function mapOwn(o) {
        if(o === 1) return 3;
        if(o === 2) return 4;
        return o;
    }
    for(let h of gameData.hexList) h.owner = mapOwn(h.owner);
    for(let c of gameData.cities) c.owner = mapOwn(c.owner);
    for(let u of gameData.entities) u.owner = mapOwn(u.owner);
    let starter = parseInt(document.getElementById('setupMoney').value, 10) || 10000;
    gameData.aiMoneyByOwner = {};
    gameData.aiManpowerByOwner = {};
    gameData.aiMoneyByOwner[3] = starter;
    gameData.aiMoneyByOwner[4] = starter;
    gameData.aiManpowerByOwner[3] = 5000;
    gameData.aiManpowerByOwner[4] = 5000;
    gameData.money = 0;
    gameData.manpower = 0;
    gameData.casualtiesByOwner = {};
    gameData.casualtyReplacementCostByOwner = {};
    gameData._landIncomeCacheDirty = true;
}
function wodCenterCameraOnLandmassForMenu() {
    if(!gameData.hexList || !canvas) return;
    let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
    let nw = 0;
    for(let h of gameData.hexList) {
        if(isWaterHex(h)) continue;
        if(h.x < minX) minX = h.x;
        if(h.x > maxX) maxX = h.x;
        if(h.y < minY) minY = h.y;
        if(h.y > maxY) maxY = h.y;
        nw++;
    }
    let sx, sy;
    if(nw > 0) {
        sx = (minX + maxX) * 0.5;
        sy = (minY + maxY) * 0.5;
    } else {
        sx = 0;
        sy = 0;
        for(let h of gameData.hexList) {
            sx += h.x;
            sy += h.y;
            nw++;
        }
        if(nw > 0) {
            sx /= nw;
            sy /= nw;
        }
    }
    if(nw === 0) return;
    let vw = canvas.clientWidth || UI.wrapper.clientWidth || wodCanvasAllocSize.w || 1;
    let vh = canvas.clientHeight || UI.wrapper.clientHeight || wodCanvasAllocSize.h || 1;
    let z = gameData.camera.zoom > 0 && isFinite(gameData.camera.zoom) ? gameData.camera.zoom : 1;
    gameData.camera.x = sx * z - vw / 2;
    gameData.camera.y = sy * z - vh / 2;
}
function wodLiveMapLooksLikeMenuAttract() {
    if(!gameData.hexList || !gameData.hexList.length) return false;
    let owners = new Set();
    for(let c of gameData.cities || []) {
        if(c && c.owner > 0) owners.add(c.owner);
    }
    if(owners.size === 0) {
        for(let h of gameData.hexList) {
            if(h && h.owner > 0) owners.add(h.owner);
        }
    }
    if(!owners.size) return false;
    if(owners.has(1)) return false;
    if(owners.has(3) || owners.has(4)) return true;
    return false;
}
function wodClearLiveMapForNewMatch() {
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
    gameData._wodTerrainPoliticsBase = null;
    gameData._wodTerrainPoliticsBaseFp = '';
    gameData.loadedCustomMap = false;
    wodMpClearTerrainCachesForNewMatch();
}
function wodPrepareForNewMatch(opts) {
    gameData._wodDeepEpoch = (gameData._wodDeepEpoch | 0) + 1;
    gameData._spectator=null;gameData._mpSurrenderedToAi=false;wodSyncSpectatorUi();
    if(!opts?.keepLifetimeMatch){gameData._lifetimeMatch=null;gameData._lifetimeStatsByOwner={};gameData._lifetimeEndReason=null;}
    gameData.controlGroups = {};
    gameData._territoryCleanupKeys = new Set();
    gameData._waterPoliticsWork = null;
    gameData._waterPoliticsDirty = true;
    gameData.constructionJobs = [];
    window.wodBattleAudio?.reset();
    gameData._aiEconomyClock = 0;
    gameData._aiDecisionLog=null;gameData._aiArrivalCache=null;
    gameData._aiMoveQueue=new Map();gameData._aiLocalSituation=new WeakMap();gameData._aiCombatContexts={};
    // Per-match timers start afresh (a new match used to inherit them from the last one, or from the frames the
    // previous game ran, so its first AI pulses and supply scans fell at different moments; the AI pulse timer also
    // draws its random offset only when it is unset).
    for(const k of ['aiTimer','encirclementTimer','_townSweepTimer','_transportAiTimer','_aiFortGuardTimer','_cityCapTimer'])delete gameData[k];
    gameData._wodPfCache=new Map();gameData._wodPfVer=(gameData._wodPfVer||0)+1;
    gameData._landIncomeCacheDirty=true;
    gameData.aiCommanderProfiles = {};gameData._aiPulseScale = 1;
    gameData.aiBattlePlans = {};gameData.aiNavalPlans = {};
    gameData._aiDefenseByOwner = {};
    gameData._aiDefenseWork = new Map();
    gameData.marineWaterSupplyHexes = new Set();
    gameData._citySupplyCache = null;
    gameData._supplyTopologyVersion = 0;gameData._supplyDirty = null;
    gameData._aiEconomyPlans = {};
    gameData.aiTaskForces = {};
    gameData.aiBattlePlans = {};gameData.aiNavalPlans = {};
    wodRefreshCommandHud(true);
    opts = opts || {};
    menuBattlePrepared = null;
    menuPrewarmGeneration++;
    gameData.menuAttractMode = false;
    menuDemoPausedByVisibility = false;
    if(menuDemoAnimId) {
        cancelAnimationFrame(menuDemoAnimId);
        menuDemoAnimId = 0;
    }
    if(UI && UI.canvas) UI.canvas.classList.remove('menu-bg-active');
    if(!opts.keepMp) gameData.mp = null;
    gameData._campaignEnded = false;
    wodResetEndCountdowns();
    gameData._enemyDistField = null;
    gameData.aiFrontFocus = {};
    gameData.aiTaskForces = {};
    gameData.aiStrategyTimer = 0;
    gameData.aiFocusTimer = 0;
    gameData._aiStratWork = null;
    gameData._aiSpawnBurst = null;
    gameData._aiSpawnPulse = null;
    gameData._encircWork = null;
    wodInvalidateAiFrontlineHexCache();
    wodCombatFxClear();
    if(gameData._soloPreviewSnapshot && !wodSoloSnapshotValidForMatchStart(gameData._soloPreviewSnapshot))
        gameData._soloPreviewSnapshot = null;
    let keepMissionMap = !!(opts.keepLiveMap || gameData._launchingMission || gameData._selectedMissionEntry);
    if(!keepMissionMap && wodLiveMapLooksLikeMenuAttract())
        wodClearLiveMapForNewMatch();
    if(gameData.camera && Math.abs((gameData.camera.zoom || 0.5) - 0.655) < 0.02)
        gameData.camera.zoom = 0.5;
}
function cloneMenuBattleState() {
    return {
        hexList: gameData.hexList.map(h => Object.assign({}, h)),
        cities: gameData.cities.map(c => Object.assign({}, c)),
        roads: gameData.roads.map(r => Object.assign({}, r)),
        entities: gameData.entities.map(e => Object.assign({}, e, e.target ? { target: Object.assign({}, e.target) } : {})),
        hospitals: (gameData.hospitals || []).map(h => ({...h})),
        forts: (gameData.forts || []).map(f => Object.assign({}, f)),
        bridges: (gameData.bridges || []).map(b => Object.assign({}, b)),
        mapRadius: gameData.mapRadius,
        mapShape: gameData.mapShape,
        camera: Object.assign({}, gameData.camera),
        layers: Object.assign({}, gameData.layers || {}),
        aiMoneyByOwner: Object.assign({}, gameData.aiMoneyByOwner || {}),
        aiManpowerByOwner: Object.assign({}, gameData.aiManpowerByOwner || {}),
        casualtiesByOwner: Object.assign({}, gameData.casualtiesByOwner || {}),
        casualtyReplacementCostByOwner: Object.assign({}, gameData.casualtyReplacementCostByOwner || {}),
        aiStrategyTimer: gameData.aiStrategyTimer || 0,
        aiFocusTimer: gameData.aiFocusTimer || 0,
        aiFrontFocus: gameData.aiFrontFocus ? JSON.parse(JSON.stringify(gameData.aiFrontFocus)) : {},
        constructionJobs: JSON.parse(JSON.stringify(gameData.constructionJobs || [])),
        aiTaskForces: null
    };
}
function captureMenuBattleLive() {
    if(!gameData.hexList || !gameData.hexList.length) return;
    menuBattleLive = cloneMenuBattleState();
    menuBattleHexListRef = gameData.hexList;
    wodQueueMenuTerrainCopy();
}
function wodCloneCanvas(src) {
    if(!src || src.width < 2 || src.height < 2) return null;
    let c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
}
function wodRestoreMenuTerrain() {
    if(wodMenuTerrainCopyDue) {
        // Nothing has painted terrain since the battle was paused: the live canvases still hold its picture.
        wodMenuTerrainCopyDue = false;
        wodTerrainNeedFullRebuild = false;
        wodTerrainPoliticalDirty = false;
        terrainNeedsUpdate = false;
        wodTerrainBaseBuilt = true;
        wodTerrainPolWork = null;
        return true;
    }
    if(!menuTerrainSnap || !menuTerrainSnap.base || !menuTerrainSnap.composite) return false;
    // Adopt preloaded buffers instead of copying/rebaking several large
    // terrain textures in the frame where the summary closes.
    terrainBaseCanvas=menuTerrainSnap.base;terrainBaseCtx=terrainBaseCanvas.getContext('2d');
    terrainCanvas=menuTerrainSnap.composite;terrainCtx=terrainCanvas.getContext('2d');
    territoryOverlayCanvas=menuTerrainSnap.overlay;
    wodBorderLayerCanvas=menuTerrainSnap.borders;
    wodBorderLayerCtx=wodBorderLayerCanvas?.getContext('2d')||null;
    terrainBounds = {...menuTerrainSnap.bounds};
    menuTerrainSnap=null;
    wodTerrainNeedFullRebuild = false;
    wodTerrainPoliticalDirty = false;
    terrainNeedsUpdate = false;
    wodTerrainBaseBuilt = true;
    wodTerrainPolWork = null;
    return true;
}
function wodPrewarmMenuBattleForSummary() {
    const source=menuBattleLive,token=++menuPrewarmGeneration;
    if(!source||!menuTerrainSnap)return;
    const prepared={...source,hexList:[],hexes:{}};let i=0;
    const schedule=fn=>window.requestIdleCallback?requestIdleCallback(fn,{timeout:150}):setTimeout(fn,16);
    schedule(function prepare() {
        if(token!==menuPrewarmGeneration||!gameData._campaignEnded)return;
        const start=performance.now();
        while(i<source.hexList.length&&performance.now()-start<2) {
            const h={...source.hexList[i++]};prepared.hexList.push(h);prepared.hexes[`${h.q},${h.r}`]=h;
        }
        if(i<source.hexList.length){schedule(prepare);return;}
        prepared.cities=source.cities.map(c=>({...c}));
        prepared.roads=source.roads.map(r=>({...r}));
        prepared.entities=source.entities.map(e=>({...e,target:e.target?{...e.target}:null,path:e.path?.map(p=>({...p}))}));
        menuBattlePrepared=prepared;
    });
}
function applyMenuBattleState(s) {
    if(!s || !s.hexList || !s.hexList.length) return false;
    const prepared=menuBattlePrepared;
    menuPrewarmGeneration++;
    menuBattlePrepared=null;
    gameData.hexes = prepared?.hexes || {};
    gameData.hexList = prepared?.hexList || s.hexList.map(h => Object.assign({}, h));
    if(!prepared)for(let h of gameData.hexList) gameData.hexes[`${h.q},${h.r}`] = h;
    gameData.cities = prepared?.cities || s.cities.map(c => Object.assign({}, c));
    gameData.roads = prepared?.roads || s.roads.map(r => Object.assign({}, r));
    gameData.entities = prepared?.entities || s.entities.map(e => Object.assign({}, e, e.target ? { target: Object.assign({}, e.target) } : {}));
    gameData._waterPoliticsWork=null;gameData._waterPoliticsDirty=true;
    gameData._territoryCleanupKeys=new Set();
    gameData.constructionJobs = JSON.parse(JSON.stringify(s.constructionJobs || []));
    gameData.hospitals = (s.hospitals || []).map(h => ({...h}));
    gameData.forts = (s.forts || []).map(f => Object.assign({}, f));
    gameData.bridges = (s.bridges || []).map(b => wodNormalizeBridgeRecord(b)).filter(Boolean);
    for(let br of gameData.bridges) wodSyncBridgeWorldCoords(br);
    wodRebuildBridgeHexIndex();
    gameData.mapRadius = s.mapRadius;
    gameData.mapShape = s.mapShape;
    Object.assign(gameData.camera, s.camera);
    gameData.layers = Object.assign({}, s.layers);
    gameData.aiMoneyByOwner = Object.assign({}, s.aiMoneyByOwner || {});
    gameData.aiManpowerByOwner = Object.assign({}, s.aiManpowerByOwner || {});
    gameData.casualtiesByOwner = Object.assign({}, s.casualtiesByOwner || {});
    gameData.casualtyReplacementCostByOwner = Object.assign({}, s.casualtyReplacementCostByOwner || {});
    gameData.aiStrategyTimer = s.aiStrategyTimer || 0;
    gameData.aiFocusTimer = s.aiFocusTimer || 0;
    gameData.aiFrontFocus = s.aiFrontFocus ? JSON.parse(JSON.stringify(s.aiFrontFocus)) : {};
    gameData.aiTaskForces = {};
    gameData._aiStratWork = null;
    gameData._aiSpawnBurst = null;
    gameData._aiSpawnPulse = null;
    gameData._encircWork = null;
    gameData.money = 0;
    gameData.manpower = 0;
    gameData.selection = [];
    gameData.buildMode = null;
    gameData._landIncomeCacheDirty = true;
    wodMarkTerrainFullDirty();
    return true;
}
function wodIsMainMenuAttractEligible() {
    if(gameState !== 'MENU') return false;
    if(!UI.mainMenu || UI.mainMenu.classList.contains('hidden')) return false;
    for(let p of UI.panels) {
        if(p && !p.classList.contains('hidden')) return false;
    }
    return true;
}
function pauseMenuBackgroundBattleVisibility() {
    if(!gameData.menuAttractMode || gameState !== 'MENU') return;
    menuDemoPausedByVisibility = true;
    if(menuDemoAnimId) cancelAnimationFrame(menuDemoAnimId);
    menuDemoAnimId = 0;
}
function resumeMenuBackgroundBattleVisibility() {
    if(!menuDemoPausedByVisibility) return;
    menuDemoPausedByVisibility = false;
    if(!gameData.menuAttractMode || gameState !== 'MENU') return;
    if(!wodIsMainMenuAttractEligible()) return;
    menuDemoLastTime = performance.now();
    if(menuDemoAnimId) cancelAnimationFrame(menuDemoAnimId);
    menuDemoAnimId = requestAnimationFrame(menuBackgroundLoop);
}
function pauseMenuBackgroundBattle() {
    if(gameData.menuAttractMode && menuDemoSeeded) {
        captureMenuBattleLive();
        menuBattleHexListRef = gameData.hexList;
    }
    menuDemoPausedByVisibility = false;
    gameData.menuAttractMode = false;
    if(menuDemoAnimId) cancelAnimationFrame(menuDemoAnimId);
    menuDemoAnimId = 0;
    UI.canvas.classList.remove('menu-bg-active');
    if(gameState !== 'PLAYING') UI.canvas.style.display = 'none';
}
function resumeMenuBackgroundBattle() {
    if(gameState === 'PLAYING') return;
    if(!wodIsMainMenuAttractEligible()) return;
    menuDemoPausedByVisibility = false;
    if(!menuDemoSeeded && !menuBattleLive) {
        void bootstrapMenuBackgroundBattle();
        return;
    }
    // Only the setup preview (or a match) replaces the menu hex list.
    // Opening a panel and coming back must not rebuild the picture.
    let mapReplaced = !!(menuBattleHexListRef && gameData.hexList && gameData.hexList !== menuBattleHexListRef);
    if(mapReplaced && menuBattleLive) {
        applyMenuBattleState(menuBattleLive);
        wodRestoreMenuTerrain();
    } else wodMenuTerrainCopyDue = false; // (the battle's own canvases were never painted over: no copy needed)
    if(gameData.hexList && gameData.hexList.length) menuBattleHexListRef = gameData.hexList;
    if(!wodTerrainBaseBuilt || !terrainCanvas || terrainCanvas.width < 2)
        wodMarkTerrainFullDirty();
    menuDemoSeeded = true;
    gameData.menuAttractMode = true;
    gameData.speed = Math.max(1, gameData.speed || 1);
    UI.canvas.style.display = 'block';
    UI.canvas.classList.add('menu-bg-active');
    wodCenterCameraOnLandmassForMenu();
    draw();
    menuDemoLastTime = performance.now();
    if(menuDemoAnimId) cancelAnimationFrame(menuDemoAnimId);
    menuDemoAnimId = requestAnimationFrame(menuBackgroundLoop);
}
function kickstartMenuAttractSim() {
    if(gameState !== 'MENU') return;
    gameData.aiStrategyTimer = 1.42;
    gameData.aiFocusTimer = 4.1;
    updateAiFrontFocus();
    let dtSim = 2 / 60;
    for(let step = 0; step < 36; step++) {
        update(dtSim);
    }
    let drainGuard = 0;
    while((gameData._aiStratWork || gameData._aiSpawnBurst) && drainGuard++ < 480)
        update(dtSim);
}
function menuBackgroundLoop(time) {
    if(!gameData.menuAttractMode || gameState !== 'MENU' || menuDemoPausedByVisibility) {
        menuDemoAnimId = 0;
        return;
    }
    if(typeof document !== 'undefined' && document.hidden) {
        pauseMenuBackgroundBattleVisibility();
        return;
    }
    if(!menuDemoLastTime) menuDemoLastTime = time;
    let dt = (time - menuDemoLastTime) / 1000;
    if(dt > 0.1) dt = 0.1;
    menuDemoLastTime = time;
    let speed = gameData.speed > 0 ? gameData.speed : 1;
    let simDt = dt * speed;
    gameData._frameSimDt = simDt;
    try {
        update(simDt);
        draw();
    } catch (err) {
        wodReportRuntimeError(err, 'menu background');
    }
    menuDemoAnimId = requestAnimationFrame(menuBackgroundLoop);
}
/** Black splash: staged boot so users see what is being warmed before the menu appears. */
function wodRunInitialBootToMenu() {
    if(window._wodBootStarted) return;
    window._wodBootStarted = true;
    window._wodBootBusy = true;
    window._wodBootSettledUntil = performance.now() + 2400;
    let ov = document.getElementById('wodBootOverlay');
    let caption = document.getElementById('wodBootCaption');
    let inner = document.getElementById('wodBootBarInner');
    let bootErr = false;
    gameData._wodSkipMapGenLoader = true;
    if(UI.mainMenu) UI.mainMenu.classList.add('hidden');

    let splashT0 = performance.now();
    let displayed = 0;
    if(inner) inner.classList.remove('wod-boot-tween-suppress');
    wodSetBootSplashProgress(displayed);

    function nextFrame() {
        return new Promise(resolve => requestAnimationFrame(() => resolve()));
    }
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async function bootStage(text, pct, work, holdMs) {
        if(caption) caption.textContent = text;
        displayed = Math.max(displayed, Math.min(99, pct));
        wodSetBootSplashProgress(displayed);
        await nextFrame();
        if(holdMs) await sleep(holdMs);
        if(work) {
            let out = work();
            if(out && typeof out.then === 'function') await out;
        }
        await nextFrame();
    }

    let bootPanel = document.getElementById('wodBootPanel');

    function revealMenu() {
        if(inner) inner.classList.remove('wod-boot-tween-suppress');
        requestAnimationFrame(() => {
            if(ov) {
                ov.classList.add('hidden');
                ov.setAttribute('aria-busy', 'false');
            }
            // A match may have started while the splash finished — never pop the
            // main menu (and its attract battle) on top of live gameplay.
            // A failed optional attract battle must not lock players out of the game.
            if(gameState === 'MENU') {
                if(UI.mainMenu) UI.mainMenu.classList.remove('hidden');
                if(!bootErr) {
                    if(menuDemoSeeded) resumeMenuBackgroundBattle();
                    wodShowChangelogPopup();
                }
            }
            gameData._wodSkipMapGenLoader = false;
            window._wodBootSettledUntil = 0;
            window._wodBootBusy = false;
            if(typeof wodPreloadAncientCivArt === 'function') void wodPreloadAncientCivArt();
            // (an out-of-date game, told so on the menu: after the changelog when it opens, else now)
            if(typeof wodMaybeWarnOutdatedOnMenu === 'function') setTimeout(wodMaybeWarnOutdatedOnMenu, 400);
        });
    }

    function showContinuePrompt() {
        if(inner) inner.classList.remove('wod-boot-tween-suppress');
        wodSetBootSplashProgress(100);
        if(caption) caption.textContent = bootErr ? 'Could not finish loading.' : 'Ready.';
        if(bootPanel) bootPanel.classList.add('wod-boot-ready');
        revealMenu();
    }

    (async () => {
        try {
            // Music buffers during the splash. Playback starts when the changelog popup is closed.
            await bootStage('Loading music…', 4, async () => {
                if(!window.wodMusic || typeof window.wodMusic.preloadAll !== 'function') return;
                try {
                    window.wodMusic.bindUi();
                    await window.wodMusic.preloadAll((frac, label) => {
                        let pct = 4 + Math.round(Math.max(0, Math.min(1, frac || 0)) * 40);
                        if(caption && label) caption.textContent = label;
                        wodSetBootSplashProgress(pct);
                    });
                } catch(e) { console.warn(e); }
            }, 8);
            await bootStage('Loading interface…', 48, null, 16);
            await bootStage('Starting worker pool…', 54, () => {
                wodEnsureMapGenWorkerPool();
                try { if(wodProgress) flushGameProfileToWod(); } catch(_) {}
            }, 16);
            await bootStage('Terrain palettes…', 58, () => {
                normalizeTerrainHexes();
                updateTerrainKey({ skipHelp: true });
            }, 18);
            await bootStage('Precaching battle effects…', 62, () => wodEnsureFxPrecache(), 22);
            await bootStage('Menu UI chrome…', 66, null, 14);
            await wodBootRunWithProgress(caption, 68, 84, 'Building menu battlefield', () => bootstrapMenuBackgroundBattle());
            await bootStage('Baking terrain layers…', 88, () => {
                updateTerrainCache();
                draw();
                captureMenuBattleLive();
            }, 20);
            await bootStage('Warming battle AI…', 92, () => {
                let dtSim = 2 / 60;
                for(let i = 0; i < 6; i++) update(dtSim);
            }, 18);
            await bootStage('Pathfinding caches…', 95, () => {
                let movable = gameData.entities.filter(u => u && u.hp > 0 && u.type !== 'convoy').slice(0, 6);
                for(let u of movable) {
                    let h = getNearestWalkableHexForUnit(u, u.x, u.y, 8);
                    if(h) findLocalDetourHex(u, h.x + gameData.hexRadius * 2, h.y);
                }
                syncInfoCardPanelThrottled();
            }, 18);
            await bootStage('Final frame…', 97, () => {
                draw();
            }, 14);

            let elapsed = performance.now() - splashT0;
            if(elapsed < 380) await sleep(380 - elapsed);
            let fillStart = performance.now();
            let fillFrom = Math.max(displayed, 92);
            function fillTick(now) {
                let u = Math.min(1, (now - fillStart) / 560);
                let eased = 1 - Math.pow(1 - u, 2.2);
                wodSetBootSplashProgress(fillFrom + (100 - fillFrom) * eased);
                if(u < 1) requestAnimationFrame(fillTick);
                else setTimeout(showContinuePrompt, 120);
            }
            requestAnimationFrame(fillTick);
        } catch(err) {
            bootErr = true;
            console.error(err);
            pauseMenuBackgroundBattle();
            menuDemoSeeded = false;
            menuBattleLive = null;
            menuBattleHexListRef = null;
            if(inner) inner.classList.remove('wod-boot-tween-suppress');
            gameData._wodSkipMapGenLoader = false;
            window._wodBootBusy = false;
            revealMenu();
        }
    })();
}
/** Wait while another map is being made on the shared map state (the boot warm-up, the menu battlefield, a
 *  preview). generateMap returns at once while one runs, and its caller would take the half-made map as its own. */
async function wodAwaitOtherMapGen(opts) {
    // (the menu battlefield waits only for a generation in progress: boot runs it, and it marks itself busy)
    const busy = () => opts && opts.mapGenOnly ? gameData._mapGenInProgress
        : window._wodBootBusy || window._wodMenuBootstrapBusy || gameData._mapGenInProgress;
    for(let guard = 0; busy() && guard < 1200; guard++) await new Promise(r => setTimeout(r, 50));
}
async function bootstrapMenuBackgroundBattle() {
    pauseMenuBackgroundBattle();
    if(window._wodMenuBootstrapBusy) return;
    if(menuDemoSeeded && menuBattleLive) {
        applyMenuBattleState(menuBattleLive);
        if(wodIsMainMenuAttractEligible()) resumeMenuBackgroundBattle();
        else {
            menuDemoSeeded = true;
            gameData.menuAttractMode = true;
        }
        return;
    }
    if(menuDemoSeeded && gameData.hexList && gameData.hexList.length) {
        if(wodIsMainMenuAttractEligible()) resumeMenuBackgroundBattle();
        return;
    }
    let _wodPrevSkipLoader = gameData._wodSkipMapGenLoader;
    gameData._wodSkipMapGenLoader = true;
    window._wodMenuBootstrapBusy = true;
    try {
    wodSyncViewportAndCanvas();
    gameData.selection = [];
    gameData.buildMode = null;
    syncBuildPlacementMobileUi();
    gameData.speed = 1;
    gameData.citySkin = gameData.citySkin || 'classic';
    let sz = document.getElementById('setupMapSize');
    if(sz) sz.value = '60';
    wodApplyMapSizePreset(sz ? sz.value : 60);
    let shapeEl = document.getElementById('setupMapShape');
    if(shapeEl) shapeEl.value = 'island';
    gameData.aiCount = 1;
    // (a preview still being made would turn this generateMap into a no-op on its half-made map: wait for it, and
    // only then, since even an empty wait lets other code run first; a match begun meanwhile keeps its own map)
    if(gameData._mapGenInProgress) {
        await wodAwaitOtherMapGen({ mapGenOnly: true });
        if(gameState !== 'MENU') return;
    }
    await generateMap();
    remapAttractBattleFromPlayerSlotsToAis();
    gameData.layers = { terrain: true, diplomacy: true, territory: false, cities: false, cityNames: true, structures: true, units: true };
    syncInGameLayerToolbar();
    gameData.camera.zoom = 0.655;
    menuDemoSeeded = true;
    gameData.menuAttractMode = true;
    wodMarkTerrainFullDirty();
    UI.canvas.style.display = 'block';
    UI.canvas.classList.add('menu-bg-active');
    wodCenterCameraOnLandmassForMenu();
    kickstartMenuAttractSim();
    captureMenuBattleLive();
    // A panel opened (or a match started) while this battlefield was being made: it stays seeded and paused, as
    // opening the panel would have left a running one. Started anyway it ran behind the panel, simulating and drawing
    // on the same map state a lobby or skirmish preview was being generated into. (Only an open panel counts: during
    // boot the splash hides the main menu, and the battle must still start so the menu shows it when it appears.)
    if(gameState !== 'MENU' || [...UI.panels].some(p => p && !p.classList.contains('hidden'))) {
        pauseMenuBackgroundBattle();
        return;
    }
    draw();
    menuDemoLastTime = performance.now();
    if(menuDemoAnimId) cancelAnimationFrame(menuDemoAnimId);
    menuDemoAnimId = requestAnimationFrame(menuBackgroundLoop);
    } finally {
        gameData._wodSkipMapGenLoader = _wodPrevSkipLoader;
        window._wodMenuBootstrapBusy = false;
    }
}
