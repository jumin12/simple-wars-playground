// In-game HUD, unit cards, codex, notices and battle report pieces.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

function syncShowOrdersCheckbox() {
    let on = gameData.uiSettings.showOrdersWhenDeselected !== false;
    document.querySelectorAll('.opt-show-orders-sync').forEach(el => { el.checked = on; });
}
function wireShowOrdersCheckbox() {
    if(window._wodShowOrdersCheckboxBound) {
        syncShowOrdersCheckbox();
        return;
    }
    window._wodShowOrdersCheckboxBound = true;
    document.addEventListener('change', (e) => {
        let t = e.target;
        if(!t || !t.classList || !t.classList.contains('opt-show-orders-sync')) return;
        let on = !!t.checked;
        gameData.uiSettings.showOrdersWhenDeselected = on;
        document.querySelectorAll('.opt-show-orders-sync').forEach(el => { el.checked = on; });
        saveUiSettings();
    });
    syncShowOrdersCheckbox();
}
function syncOrderArrowsPathfindingCheckbox() {
    let on = !!(gameData.uiSettings && gameData.uiSettings.orderArrowsUsePathfinding);
    document.querySelectorAll('.opt-order-arrows-follow-pathfinding-sync').forEach(el => { el.checked = on; });
}
function wireOrderArrowsPathfindingCheckbox() {
    if(window._wodOrderArrowPathCheckboxBound) {
        syncOrderArrowsPathfindingCheckbox();
        return;
    }
    window._wodOrderArrowPathCheckboxBound = true;
    document.addEventListener('change', (e) => {
        let t = e.target;
        if(!t || !t.classList || !t.classList.contains('opt-order-arrows-follow-pathfinding-sync')) return;
        let on = !!t.checked;
        gameData.uiSettings.orderArrowsUsePathfinding = on;
        document.querySelectorAll('.opt-order-arrows-follow-pathfinding-sync').forEach(el => { el.checked = on; });
        saveUiSettings();
    });
    syncOrderArrowsPathfindingCheckbox();
}
function getUnitFacingAngle(unit) {
    if(!unit) return 0;
    let tx, ty;
    if(unit.target && unit.target.x != null && unit.target.y != null) {
        tx = unit.target.x;
        ty = unit.target.y;
    } else if(unit.path && unit.path.length > 0) {
        tx = unit.path[0].x;
        ty = unit.path[0].y;
    } else {
        return unit._lastFacingAngle || 0;
    }
    let ang = Math.atan2(ty - unit.y, tx - unit.x);
    unit._lastFacingAngle = ang;
    return ang;
}
function unitHasActiveMoveOrder(unit) {
    if(!unit || unit.hp <= 0) return false;
    if(unit.target) return true;
    if(unit.path && unit.path.length > 0) return true;
    if(unit.fullMarchWaypoints && unit.fullMarchWaypoints.length > 0) return true;
    const explicit=unit.orderTarget&&getNearestHexToPoint(unit.orderTarget.x,unit.orderTarget.y);
    if(explicit&&isWaterHex(explicit)&&!isBridgeHex(explicit)&&unit.orderTarget.intoWater)return true;
    if(unit.orderTarget && unit.orderTarget.x != null && unit.orderTarget.y != null) return true;
    return false;
}
function shouldDrawPlayerUnitOrderPath(unit) {
    let lo = wodLocalPlayerOwner();
    if(!unit || unit.owner !== lo || unit.type === 'convoy' || unit.hp <= 0) return false;
    if(!unitHasActiveMoveOrder(unit)) return false;
    let pts = getDisplayedUnitOrderPathPoints(unit);
    if(pts.length < 2) return false;
    if(unit.selected) return true;
    return gameData.uiSettings && gameData.uiSettings.showOrdersWhenDeselected !== false;
}
function shouldDrawConvoyMovementPath(unit) {
    if(!unit || unit.type !== 'convoy' || unit.hp <= 0 || !unit.selected) return false;
    return getDisplayedUnitOrderPathPoints(unit).length >= 2;
}
function getLayerToggleButtonId(layer) {
    if(layer === 'cityNames') return 'btnLayerCityNames';
    if(layer === 'terrain') return 'btnLayerTerrain';
    if(layer === 'diplomacy') return 'btnLayerDiplomacy';
    if(layer === 'territory') return 'btnLayerTerritory';
    if(layer === 'cities') return 'btnLayerCities';
    if(layer === 'units') return 'btnLayerUnits';
    if(layer === 'structures') return 'btnLayerStructures';
    return 'btnLayer' + layer.charAt(0).toUpperCase() + layer.slice(1);
}
function syncInGameLayerToolbar() {
    if(gameData.layers && gameData.layers.structures === undefined) gameData.layers.structures = true;
    for(let k of ['terrain', 'diplomacy', 'territory', 'cities', 'cityNames', 'structures', 'units']) {
        let btn = document.getElementById(getLayerToggleButtonId(k));
        if(btn && gameData.layers[k] !== undefined) {
            btn.classList.toggle('active', !!gameData.layers[k]);
        }
    }
    let tbtn = document.getElementById('btnLayerTerrain');
    if(tbtn) {
        if(gameData.layers.terrain) tbtn.title = 'Terrain: full color — click for white land / blue water map';
        else tbtn.title = 'Terrain: simplified map — click for full color';
    }
}
function toggleLayer(layer) {
    if(layer === 'terrain') {
        gameData.layers.terrain = !gameData.layers.terrain;
        gameData.terrainViewMode = gameData.layers.terrain ? 'natural' : 'schematic';
    } else {
        gameData.layers[layer] = !gameData.layers[layer];
    }
    syncInGameLayerToolbar();
    if(layer === 'terrain' || layer === 'diplomacy' || layer === 'territory') {
        if(layer === 'terrain') wodMarkTerrainFullDirty();
        else wodMarkTerrainPoliticalDirty();
        wodTerrainBakeNextMs = 0;
    }
    if(typeof window.refreshEditorGameplayLayerButtons === 'function') window.refreshEditorGameplayLayerButtons();
}
function wodSyncDesktopLayersPanelExpanded() {
    try {
        if(typeof matchMedia !== 'function' || !matchMedia('(min-width: 901px)').matches) return;
        let lt = document.querySelector('#inGameUI .layer-toggles');
        if(lt) lt.classList.remove('collapsed');
    } catch(_) {}
}
function toggleLayerPanel() {
    document.querySelector('.layer-toggles').classList.toggle('collapsed');
}
function purchaseUnitSkin(skin) {
    if(skin==='atlasUnits'){switchShopTab('mapSkins');wodPreviewMapPack('atlas_hd');return;}
    if(!gameData.ownedUnitSkins) gameData.ownedUnitSkins = { nato: true };
    if(WodStoreCatalog.premiumBase(skin) === 'supporterGold') {
        if(!wodHasSupporterPack()) { switchShopTab('gold'); document.getElementById('supporterPackCard')?.scrollIntoView({block:'start'}); }
        else showNotification('Patron Gold is yours. Choose its era in the army style dropdown.');
        return;
    }
    if(skin === 'goldenChip') {
        showNotification('Complete all achievements to unlock Sovereign chip.');
        return;
    }
    if(skin === 'nato') {
        showNotification('Modern NATO counters are free for everyone.');
        return;
    }
    if(gameData.ownedUnitSkins[skin] || wodShopSkinOwned(skin)) {
        if(WOD_PERIOD_SKIN_IDS.includes(skin)) {
            gameData.unitSkin = skin;
            wodApplyGamePeriod(skin, { saveProfile: true });
            updateSkinShop();
            showNotification(wodPeriodLabel(skin) + ' era equipped.');
            return;
        }
        showNotification('Already unlocked. Use the dropdowns to equip.');
        return;
    }
    if(WodSteamStore.native() || wodCloudCanSync()) {
        void wodCloudTryPurchase({ kind: 'skin', itemId: skin }).then(ok => {
            if(!ok) return;
            if(WOD_PERIOD_SKIN_IDS.includes(skin)) {
                gameData.unitSkin = skin;
                wodApplyGamePeriod(skin, { saveProfile: true });
                showNotification(wodPeriodLabel(skin) + ' era unlocked and equipped!');
            } else showNotification('Skin unlocked! Choose it for you and/or the AI above.');
            updateSkinShop();
            wodSyncAllPeriodSelects();
            wodRefreshPeriodSelectorVisibility();
        });
        return;
    }
    let skinCost = wodShopSkinCost(skin);
    if((gameData.gold || 0) < skinCost) { showNotification('Not enough gold! Need ' + skinCost + 'g.'); return; }
    gameData.gold -= skinCost;
    if(WOD_ANCIENT_CIV_PACK_IDS.includes(skin)) wodGrantAncientCivPack(gameData.ownedUnitSkins, skin);
    else gameData.ownedUnitSkins[skin] = true;
    if(WOD_PERIOD_SKIN_IDS.includes(skin)) {
        wodGrantPeriodSkinAchievement(skin);
        gameData.unitSkin = skin;
        wodApplyGamePeriod(skin, { saveProfile: true });
        showNotification(wodPeriodLabel(skin) + ' era unlocked and equipped!');
    } else {
        showNotification('Skin unlocked! Choose it for you and/or the AI above.');
    }
    updateSkinShop();
    wodSyncAllPeriodSelects();
    wodRefreshPeriodSelectorVisibility();
    scheduleSaveWodProgress();
}
let wodCanvasAllocSize = {w: -1, h: -1, dpr: -1};
let wodInputRect = {left: 0, top: 0, width: 1, height: 1, layoutWidth: 1, layoutHeight: 1};
function wodGetBackingStoreDpr() {
    let d = window.devicePixelRatio || 1;
    if(!isFinite(d) || d <= 0) d = 1;
    let cap = wodUsesVisualViewportLayout() ? 1 : 3;
    return Math.min(cap, Math.max(1, d));
}
function wodRefreshInputRect() {
    if(!canvas) return;
    let r = canvas.getBoundingClientRect();
    wodInputRect.left = r.left;
    wodInputRect.top = r.top;
    wodInputRect.width = r.width || 1;
    wodInputRect.height = r.height || 1;
    wodInputRect.layoutWidth = canvas.clientWidth || (UI.wrapper && UI.wrapper.clientWidth) || r.width;
    wodInputRect.layoutHeight = canvas.clientHeight || (UI.wrapper && UI.wrapper.clientHeight) || r.height;
}
function wodClientToCanvasLocal(clientX, clientY) {
    let x = clientX - wodInputRect.left;
    let y = clientY - wodInputRect.top;
    let lw = wodInputRect.layoutWidth || wodInputRect.width;
    let lh = wodInputRect.layoutHeight || wodInputRect.height;
    if(wodInputRect.width > 0 && Math.abs(lw - wodInputRect.width) > 0.5) {
        x *= lw / wodInputRect.width;
        y *= lh / wodInputRect.height;
    }
    return { x, y };
}
function wodOverlayCoordScale() {
    let sx = 1;
    let sy = 1;
    if(wodInputRect.width > 0 && wodInputRect.layoutWidth > 0)
        sx = wodInputRect.layoutWidth / wodInputRect.width;
    if(wodInputRect.height > 0 && wodInputRect.layoutHeight > 0)
        sy = wodInputRect.layoutHeight / wodInputRect.height;
    return { sx, sy };
}
function wodApplyScreenPanDelta(dx, dy) {
    let sc = wodOverlayCoordScale();
    gameData.camera.x = cameraStart.x - dx * sc.sx;
    gameData.camera.y = cameraStart.y - dy * sc.sy;
}
function wodUpdateSelectionBoxClients(x1, y1, x2, y2) {
    if(!UI.selectionBox) return;
    let a = wodClientToCanvasLocal(x1, y1);
    let b = wodClientToCanvasLocal(x2, y2);
    let left = Math.min(a.x, b.x);
    let top = Math.min(a.y, b.y);
    UI.selectionBox.style.left = left + 'px';
    UI.selectionBox.style.top = top + 'px';
    UI.selectionBox.style.width = Math.abs(b.x - a.x) + 'px';
    UI.selectionBox.style.height = Math.abs(b.y - a.y) + 'px';
}
function wodShowSelectionBoxAtClient(x, y) {
    if(!UI.selectionBox) return;
    let p = wodClientToCanvasLocal(x, y);
    UI.selectionBox.style.display = 'block';
    UI.selectionBox.style.left = p.x + 'px';
    UI.selectionBox.style.top = p.y + 'px';
    UI.selectionBox.style.width = '0px';
    UI.selectionBox.style.height = '0px';
}
function resizeCanvas() {
    let w = UI.wrapper.clientWidth | 0;
    let h = UI.wrapper.clientHeight | 0;
    if(w <= 0 || h <= 0) return;
    let dpr = wodGetBackingStoreDpr();
    if(w === wodCanvasAllocSize.w && h === wodCanvasAllocSize.h && dpr === wodCanvasAllocSize.dpr) {
        wodRefreshInputRect();
        return;
    }
    wodCanvasAllocSize.w = w;
    wodCanvasAllocSize.h = h;
    wodCanvasAllocSize.dpr = dpr;
    let bw = Math.max(1, Math.round(w * dpr));
    let bh = Math.max(1, Math.round(h * dpr));
    canvas.width = bw;
    canvas.height = bh;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if(typeof ctx.imageSmoothingEnabled === 'boolean')
        ctx.imageSmoothingEnabled = true;
    wodRefreshInputRect();
}
let _wodVvLayoutCache = null;
function wodUsesVisualViewportLayout() {
    // matchMedia() is surprisingly expensive and this runs in per-frame hot loops — cache
    // the MediaQueryList once and just read .matches (kept live by the browser).
    if(!_wodVvLayoutCache)
        _wodVvLayoutCache = window.matchMedia('(max-width: 900px), (max-height: 520px), (hover: none) and (pointer: coarse)');
    return _wodVvLayoutCache.matches;
}
function wodApplyPlayViewportLock(playLocked) {
    let meta = document.querySelector('meta[name="viewport"]');
    if(!meta) return;
    const relaxed = 'width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content';
    const locked = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content';
    let useLock = !!playLocked && wodUsesVisualViewportLayout();
    meta.setAttribute('content', useLock ? locked : relaxed);
    if(typeof wodSyncViewportAndCanvas === 'function')
        wodSyncViewportAndCanvas();
}
let wodVvFrameQueued = false;
let wodLastVvBox = null;
let wodVvDebounceTimer = null;
function wodApplyVisualViewportInner() {
    const wrap = UI.wrapper;
    if(!wrap) return;
    if(window._wodBootSettledUntil && performance.now() < window._wodBootSettledUntil) return;
    const vv = window.visualViewport;
    if(vv && wodUsesVisualViewportLayout()) {
        let w = Math.round(vv.width);
        let h = Math.round(vv.height);
        let l = Math.round(vv.offsetLeft);
        let t = Math.round(vv.offsetTop);
        // Responsive CSS uses real screen pixels, preserving readable type and 44px targets.
        let scale = 1, layoutW = w, layoutH = h;
        if(!wodLastVvBox || wodLastVvBox.w !== w || wodLastVvBox.h !== h || wodLastVvBox.l !== l || wodLastVvBox.t !== t || wodLastVvBox.scale !== scale) {
            wodLastVvBox = {w, h, l, t, scale};
            wrap.style.position = 'fixed';
            wrap.style.left = l + 'px';
            wrap.style.top = t + 'px';
            wrap.style.width = layoutW + 'px';
            wrap.style.height = layoutH + 'px';
            wrap.style.maxWidth = 'none';
            wrap.style.maxHeight = 'none';
            wrap.style.margin = '0';
            if(scale < 0.999) {
                wrap.style.transformOrigin = '0 0';
                wrap.style.transform = 'scale(' + scale + ')';
            } else {
                wrap.style.transformOrigin = '';
                wrap.style.transform = '';
            }
        }
    } else {
        wodLastVvBox = null;
        wrap.style.position = '';
        wrap.style.left = '';
        wrap.style.top = '';
        wrap.style.width = '';
        wrap.style.height = '';
        wrap.style.transform = '';
        wrap.style.transformOrigin = '';
        wrap.style.maxWidth = '';
        wrap.style.maxHeight = '';
        wrap.style.margin = '';
    }
    resizeCanvas();
    if(typeof gameState !== 'undefined' && gameState === 'MENU' && gameData.menuAttractMode && typeof menuDemoSeeded !== 'undefined' && menuDemoSeeded)
        wodCenterCameraOnLandmassForMenu();
}
function wodApplyVisualViewport() {
    if(wodVvFrameQueued) return;
    wodVvFrameQueued = true;
    requestAnimationFrame(() => {
        wodVvFrameQueued = false;
        wodApplyVisualViewportInner();
    });
}
function wodQueueVisualViewportBurst() {
    if(window._wodBootSettledUntil && performance.now() < window._wodBootSettledUntil) return;
    if(wodVvDebounceTimer) clearTimeout(wodVvDebounceTimer);
    wodVvDebounceTimer = setTimeout(() => {
        wodVvDebounceTimer = null;
        wodApplyVisualViewport();
    }, wodUsesVisualViewportLayout() ? 120 : 48);
}
function wodSyncViewportAndCanvas() {
    wodVvFrameQueued = false;
    wodApplyVisualViewportInner();
}
function wodSuppressSafariDocumentPinch(e) {
    if(gameState === 'PLAYING') e.preventDefault();
}
function wodPositionFxTip(anchorRect, floater) {
    let pad = 10;
    floater.hidden = false;
    floater.style.visibility = 'hidden';
    floater.style.left = Math.round(anchorRect.left + anchorRect.width * 0.5) + 'px';
    floater.style.top = Math.round(anchorRect.bottom + pad) + 'px';
    let fr = floater.getBoundingClientRect();
    let left = anchorRect.left + anchorRect.width * 0.5;
    let top = anchorRect.bottom + pad;
    if(top + fr.height > window.innerHeight - pad)
        top = Math.max(pad, anchorRect.top - fr.height - pad);
    left = Math.max(pad + fr.width * 0.5, Math.min(window.innerWidth - pad - fr.width * 0.5, left));
    floater.style.left = Math.round(left) + 'px';
    floater.style.top = Math.round(top) + 'px';
    floater.style.visibility = '';
}
function wodBuildEconomyBreakdownHtml(owner) {
    let lines = [];
    let cityTotal = 0;
    for(let city of gameData.cities) {
        if(city.owner !== owner) continue;
        let inc = getCityIncome(city);
        cityTotal += inc;
        let bd = getCityIncomeBreakdown(city);
        let label = city.name || 'Town';
        let detail = 'Base ' + formatDollarRate(bd.base);
        if(bd.factory > 0) detail += ' · Factory ' + formatDollarRate(bd.factory);
        if(bd.harbor > 0) detail += ' · Harbor ' + formatDollarRate(bd.harbor);
        if(bd.bonus > 0) detail += ' · Bonus ' + formatDollarRate(bd.bonus);
        lines.push({ label, value: formatDollarRate(inc), detail, expense: false });
    }
    let land = getOwnerLandIncome(owner);
    lines.push({ label: 'Land tiles', value: formatDollarRate(land), detail: 'Territory $ income.', expense: false });
    let tradeLines = wodBuildTradeRouteLines(owner);
    for(let tr of tradeLines) lines.push(Object.assign({ expense: false }, tr));
    let command = getOwnerCommandIncome(owner);
    lines.push({label:'Command income', value:formatDollarRate(command), detail:'Base funding while you control a town.', expense:false});
    let income = cityTotal + land + command;
    let upkeep = getOwnerExpenses(owner);
    let upkeepByType = { light: 0, motorized:0,mountaineer:0,marine: 0, heavy: 0, ship: 0 };
    for(let unit of gameData.entities) {
        if(unit.owner !== owner || unit.hp <= 0 || unit.type === 'convoy') continue;
        upkeepByType[unit.type] = (upkeepByType[unit.type] || 0) + getUnitUpkeep(unit);
    }
    let pf = wodPeriodFlavor(wodGetMatchPeriod());
    if(upkeepByType.light > 0) lines.push({ label: pf.light + ' upkeep', value: formatDollarRate(-upkeepByType.light), expense: true });
    if(upkeepByType.marine > 0) lines.push({ label: pf.marine + ' upkeep', value: formatDollarRate(-upkeepByType.marine), expense: true });
    if(upkeepByType.heavy > 0) lines.push({ label: pf.heavy + ' upkeep', value: formatDollarRate(-upkeepByType.heavy), expense: true });
    if(upkeepByType.ship > 0) lines.push({ label: pf.ship + ' upkeep', value: formatDollarRate(-upkeepByType.ship), expense: true });
    if(upkeepByType.supply>0)lines.push({label:'Supply ships upkeep',value:formatDollarRate(-upkeepByType.supply),expense:true});
    if(upkeepByType.transport>0)lines.push({label:'Transports & passengers upkeep',value:formatDollarRate(-upkeepByType.transport),expense:true});
    let net = income - upkeep;
    let html = '<div class="wod-hud-tip-title">$ ' + formatDollarRate(net) + '</div>';
    for(let row of lines) {
        html += '<div class="wod-hud-tip-row' + (row.expense ? ' wod-hud-tip-row--expense' : '') + '" title="' + wodEscapeEffectInner(row.detail) + '"><span>' + wodEscapeEffectInner(row.label) + '</span><span>' + wodEscapeEffectInner(row.value) + '</span></div>';
    }
    html += '<div class="wod-hud-tip-row wod-hud-tip-row--total"><span>Net $</span><span>' + wodEscapeEffectInner(formatDollarRate(net)) + '</span></div>';
    return html;
}
function wodBuildManpowerBreakdownHtml(owner) {
    let lines = [];
    let growth = 0;
    for(let city of gameData.cities) {
        if(city.owner !== owner) continue;
        let mp = getCityManpowerIncome(city);
        growth += mp;
        let bd = getCityManpowerBreakdown(city);
        let label = city.name || 'Town';
        let detail = 'Base ' + formatManpowerRate(bd.base);
        if(bd.factory > 0) detail += ' · Factory ' + formatManpowerRate(bd.factory);
        if(bd.farm > 0) detail += ' · Farm ' + formatManpowerRate(bd.farm);
        if(bd.bonus > 0) detail += ' · Bonus ' + formatManpowerRate(bd.bonus);
        lines.push({ label, value: formatManpowerRate(mp), detail, expense: false });
    }
    let html = '<div class="wod-hud-tip-title">Manpower ' + formatManpowerRate(growth) + '</div>';
    for(let row of lines) {
        html += '<div class="wod-hud-tip-row" title="' + wodEscapeEffectInner(row.detail) + '"><span>' + wodEscapeEffectInner(row.label) + '</span><span>' + wodEscapeEffectInner(row.value) + '</span></div>';
    }
    html += '<div class="wod-hud-tip-row wod-hud-tip-row--total"><span>Reserve growth</span><span>' + wodEscapeEffectInner(formatManpowerRate(growth)) + '</span></div>';
    html += '<div class="wod-hud-tip-row"><span>Field troops</span><span>' + wodEscapeEffectInner(formatFullCount(getOwnerTroopManpower(owner))) + '</span></div>';
    html += '<div class="wod-hud-tip-row"><span>Armor in field</span><span>' + wodEscapeEffectInner(formatTanks(getOwnerTanks(owner))) + '</span></div>';
    return html;
}
function wodBindHudResourceTooltips() {
    if(wodBindHudResourceTooltips._bound) return;
    wodBindHudResourceTooltips._bound = true;
    document.querySelectorAll('.wod-hud-tip-host[data-hud-tip]').forEach((host) => {
        host.addEventListener('mouseenter', () => {
            let kind = host.getAttribute('data-hud-tip');
            if(!kind || gameState !== 'PLAYING') return;
            let owner = wodLocalPlayerOwner();
            let floater = wodEnsureFxTipEl();
            floater.classList.add('wod-hud-tip-panel');
            floater.innerHTML = kind === 'economy'
                ? wodBuildEconomyBreakdownHtml(owner)
                : wodBuildManpowerBreakdownHtml(owner);
            wodPositionFxTip(host.getBoundingClientRect(), floater);
        });
        host.addEventListener('mouseleave', () => {
            let floater = wodEnsureFxTipEl();
            floater.hidden = true;
            floater.classList.remove('wod-hud-tip-panel');
            floater.textContent = '';
        });
    });
}
function getOwnerIncome(owner) {
    let total = 0;
    for(let city of gameData.cities) {
        if(city.owner !== owner) continue;
        total += getCityIncome(city);
    }
    return Math.round((total + getOwnerLandIncome(owner) + getOwnerCommandIncome(owner)) * 1000) / 1000;
}
function getOwnerCommandIncome(owner) {
    return gameData.cities.some(c => c.owner === owner) ? WOD_COMMAND_INCOME : 0;
}
function getOwnerLandIncome(owner) {
    if(!gameData._landIncomeCache || gameData._landIncomeCacheDirty) {
        let counts = {};
        for(let h of gameData.hexList) {
            if(!wodHexCountsTowardLandPoliticsBalance(h) || h.owner <= 0) continue;
            counts[h.owner] = (counts[h.owner] || 0) + 1;
        }
        gameData._landIncomeCache = counts;
        gameData._landIncomeCacheDirty = false;
    }
    let tiles = (gameData._landIncomeCache && gameData._landIncomeCache[owner]) || 0;
    return Math.round(tiles * WOD_LAND_INCOME_PER_HEX * WOD_INCOME_MULT * 1000) / 1000;
}
function getOwnerManpowerIncome(owner) {
    let total = 0;
    for(let city of gameData.cities) {
        if(city.owner !== owner) continue;
        total += getCityManpowerIncome(city);
    }
    return total;
}
function getCityIncome(city) {
    let total = 5;
    if(city.hasFactory) total += 15;
    if(city.hasHarbor) total += 3;
    total += city.incomeBonus || 0;
    return Math.round(total * WOD_CITY_ECON_TICK_MULT * WOD_INCOME_MULT * 1000) / 1000;
}
// A town raises 15 manpower (20 until 2026-11-19), a farm 15 more; a factory adds money, not men (it added 5).
const WOD_CITY_BASE_MANPOWER = 15;
function getCityManpowerIncome(city) {
    let total = WOD_CITY_BASE_MANPOWER;
    if(city.hasFarm) total += 15;
    total += city.manpowerBonus || 0;
    return Math.round(total * WOD_CITY_ECON_TICK_MULT * WOD_INCOME_MULT * 1000) / 1000;
}
function getCityIncomeBreakdown(city) {
    let mult = WOD_CITY_ECON_TICK_MULT * WOD_INCOME_MULT;
    let base = 5;
    let factory = city.hasFactory ? 15 : 0;
    let harbor = city.hasHarbor ? 3 : 0;
    let bonus = city.incomeBonus || 0;
    let round = (v) => Math.round(v * mult * 1000) / 1000;
    return {
        base: round(base),
        factory: round(factory),
        harbor: round(harbor),
        bonus: round(bonus),
        total: getCityIncome(city)
    };
}
function getCityManpowerBreakdown(city) {
    let mult = WOD_CITY_ECON_TICK_MULT * WOD_INCOME_MULT;
    let base = WOD_CITY_BASE_MANPOWER;
    let factory = 0;
    let farm = city.hasFarm ? 15 : 0;
    let bonus = city.manpowerBonus || 0;
    let round = (v) => Math.round(v * mult * 1000) / 1000;
    return {
        base: round(base),
        factory: round(factory),
        farm: round(farm),
        bonus: round(bonus),
        total: getCityManpowerIncome(city)
    };
}
function wodFillCodexRow(host, cardSelector, size, gap) {
    if(!window._wodCodexResizeBound) {
        window._wodCodexResizeBound = true;
        window.addEventListener('resize', () => {
            let shop = document.getElementById('shopMapOptions');
            if(shop && shop.querySelector('.shop-codex-card')) wodFillCodexRow(shop, '.shop-codex-card', 148, 12);
        });
    }
    if(!host) return;
    host.querySelectorAll('.shop-codex-unknown').forEach(n => n.remove());
    if(host.id==='shopMapOptions')return;
    let cards = host.querySelectorAll(cardSelector);
    if(!cards.length) return;
    let width = host.clientWidth;
    if(width < size) return;
    let cols = Math.max(1, Math.floor((width + gap) / (size + gap)));
    let rem = cards.length % cols;
    if(rem === 0) return;
    let pads = cols - rem;
    for(let i = 0; i < pads; i++) {
        let slot = document.createElement('div');
        slot.className = 'shop-codex-unknown';
        slot.textContent = '?';
        slot.setAttribute('aria-hidden', 'true');
        host.appendChild(slot);
    }
}
function wodLiveMarchPathPoints(unit) {
    if(!unit) return null;
    let pts = [{x: unit.x, y: unit.y}];
    let tgt = unit.target;
    if(tgt && tgt.x != null && tgt.y != null)
        pts.push({x: tgt.x, y: tgt.y});
    if(unit.path && unit.path.length > 0) {
        for(let pi = 0; pi < unit.path.length; pi++) {
            let p = unit.path[pi];
            pts.push({x: p.x, y: p.y});
        }
    }
    if(unit.fullMarchWaypoints && unit.fullMarchWaypoints.length > 0) {
        let c = (unit.marchWpCursor || 0) + 1;
        for(let i = c; i < unit.fullMarchWaypoints.length; i++) {
            let w = unit.fullMarchWaypoints[i];
            pts.push({x: w.x, y: w.y});
        }
    } else if(unit.orderTarget && unit.orderTarget.x != null && unit.orderTarget.y != null) {
        pts.push({x: unit.orderTarget.x, y: unit.orderTarget.y});
    }
    let out = dedupeNearOrderPathPoints(pts);
    return out.length >= 2 ? out : null;
}
function wodWaypointOrderArrowPoints(unit) {
    if(!unit || !unit.fullMarchWaypoints || unit.fullMarchWaypoints.length === 0) return null;
    let c = unit.marchWpCursor || 0;
    let pts = [{x: unit.x, y: unit.y}];
    for(let i = c; i < unit.fullMarchWaypoints.length; i++) {
        let w = unit.fullMarchWaypoints[i];
        pts.push({x: w.x, y: w.y});
    }
    let out = dedupeNearOrderPathPoints(pts);
    return out.length >= 2 ? out : null;
}
function wodSliceFrozenOrderArrowPath(unit, frozenPts) {
    if(!frozenPts || frozenPts.length < 2) return null;
    let idx = unit._routeArrowProgressIdx || 0;
    if(idx >= frozenPts.length - 1) return null;
    let closeR2 = Math.pow(Math.max(12, (gameData.hexRadius || 20) * 0.72), 2);
    while(idx < frozenPts.length - 1) {
        let p = frozenPts[idx + 1];
        let dx = unit.x - p.x;
        let dy = unit.y - p.y;
        if(dx * dx + dy * dy > closeR2) break;
        idx++;
    }
    // A unit that cut a corner or stepped round traffic never comes that close to the point it passed, and the arrow
    // went on reaching back to it: the unit is on whichever of the next stretches of the route it is nearest.
    {const seg=(a,b)=>{const vx=b.x-a.x,vy=b.y-a.y,L=vx*vx+vy*vy||1,t=Math.max(0,Math.min(1,((unit.x-a.x)*vx+(unit.y-a.y)*vy)/L));return Math.hypot(unit.x-a.x-vx*t,unit.y-a.y-vy*t);};
     let best=idx,bd=seg(frozenPts[idx],frozenPts[idx+1]);
     for(let j=idx+1;j<Math.min(frozenPts.length-1,idx+10);j++){const d=seg(frozenPts[j],frozenPts[j+1]);if(d<bd-1){bd=d;best=j;}}
     idx=best;}
    unit._routeArrowProgressIdx = idx;
    if(idx >= frozenPts.length - 1) {
        let end = frozenPts[frozenPts.length - 1];
        let edx = unit.x - end.x;
        let edy = unit.y - end.y;
        if(edx * edx + edy * edy <= closeR2 * 2.5) return null;
    }
    let pts = [{x: unit.x, y: unit.y}];
    for(let i = idx + 1; i < frozenPts.length; i++) {
        let p = frozenPts[i];
        if(pts.length === 1) {
            pts.push(p);
            continue;
        }
        let q = pts[pts.length - 1];
        let dx = p.x - q.x;
        let dy = p.y - q.y;
        if(dx * dx + dy * dy > 2) pts.push(p);
    }
    return pts.length >= 2 ? pts : null;
}
function dedupeNearOrderPathPoints(pts) {
    let deduped = [];
    for(let i = 0; i < pts.length; i++) {
        let p = pts[i];
        if(deduped.length === 0) {
            deduped.push(p);
            continue;
        }
        let q = deduped[deduped.length - 1];
        let dx = p.x - q.x;
        let dy = p.y - q.y;
        if(dx * dx + dy * dy > 2) deduped.push(p);
    }
    return deduped;
}
function wodUnitUsesLegBridgeMarch(unit) {
    return false;
}
function wodBuildStrokePreviewPath(strokePts, unit) {
    if(!strokePts || strokePts.length < 2 || !unit) return strokePts;
    if(!gameData.uiSettings || !gameData.uiSettings.orderArrowsUsePathfinding) return strokePts;
    try {
        let simplified = simplifyPathStrokeForOrders(strokePts);
        if(simplified.length < 2) return strokePts;
        let seg = buildConcatenatedHexPath(unit, simplified.slice(1), { x: unit.x, y: unit.y }, true);
        if(seg.length > 1) {
            let out = wodWorldPointsFromHexMarchPath(unit, seg, { x: unit.x, y: unit.y });
            if(out.length >= 2) return out;
        }
    } catch(_) {}
    return strokePts;
}
function wodRefreshPathStrokePreview() {
    if(!pathOrderStroke.active || !pathOrderStroke.pts || pathOrderStroke.pts.length === 0) {
        gameData.pathStrokePreview = null;
        return;
    }
    if(pathOrderStroke.pts.length < 2) {
        gameData.pathStrokePreview = pathOrderStroke.pts.slice();
        return;
    }
    let now = performance.now();
    if(now - pathStrokePreviewAt < 100) {
        gameData.pathStrokePreview = pathOrderStroke.pts.slice();
        return;
    }
    pathStrokePreviewAt = now;
    let lead = getMovableSelectedUnits()[0];
    gameData.pathStrokePreview = lead
        ? wodBuildStrokePreviewPath(pathOrderStroke.pts, lead)
        : pathOrderStroke.pts.slice();
}
function computePathfindingOrderArrowPoints(unit) {
    if(!unit || unit.hp <= 0) return null;
    try {
        let liveCorridor = wodPlayerMarchArrowPoints(unit);
        if(liveCorridor) return liveCorridor;
        if(wodUnitUsesLegBridgeMarch(unit))
            return wodWaypointOrderArrowPoints(unit);
        if(unit.fullMarchWaypoints && unit.fullMarchWaypoints.length > 0) {
            wodEnsureOrderArrowFrozen(unit);
            let marchSig = wodMarchArrowSignature(unit);
            if(unit._routeArrowFrozenPts && unit._routeArrowMarchSig === marchSig) {
                if(unit._routeArrowFrozenReady) {
                    let sliced = wodSliceFrozenOrderArrowPath(unit, unit._routeArrowFrozenPts);
                    if(sliced && sliced.length >= 2) return sliced;
                    return null;
                }
                let sliced = wodSliceFrozenOrderArrowPath(unit, unit._routeArrowFrozenPts);
                if(sliced && sliced.length >= 2) return sliced;
                return wodWaypointOrderArrowPoints(unit);
            }
            return wodWaypointOrderArrowPoints(unit);
        }
        return wodLiveMarchPathPoints(unit);
    } catch(_) {
        return null;
    }
}
function getDisplayedUnitOrderPathPoints(unit) {
    let pts = null;
    if(gameData.uiSettings && gameData.uiSettings.orderArrowsUsePathfinding) {
        let alt = computePathfindingOrderArrowPoints(unit);
        if(alt && alt.length >= 2) pts = alt;
    }
    if(!pts) pts = getUnitPathPoints(unit);
    // Unless the unit is selected, only the leg it is on: up to its next waypoint (select it to see the whole route).
    const wps = unit && unit.fullMarchWaypoints, cursor = (unit && unit.marchWpCursor) || 0;
    if(unit && !unit.selected && pts.length > 2 && wps && wps.length - cursor > 1) {
        const wp = wps[cursor];let k = -1, bd = Infinity;
        for(let i = 1; i < pts.length; i++) {const d = Math.hypot(pts[i].x - wp.x, pts[i].y - wp.y);if(d < bd) {bd = d;k = i;}}
        if(k > 0) pts = pts.slice(0, k + 1);
    }
    return pts;
}
function drawStrokePreviewArrows(ctx, previewPts, units) {
    if(!previewPts || previewPts.length < 2 || !units || units.length === 0) return;
    let cx = 0, cy = 0;
    for(let u of units) {
        cx += u.x;
        cy += u.y;
    }
    cx /= units.length;
    cy /= units.length;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let lw = units.length > 4 ? 2 : 2.8;
    for(let unit of units) {
        let ox = unit.x - cx, oy = unit.y - cy;
        let pts = previewPts.map(p => ({x: p.x + ox, y: p.y + oy}));
        ctx.strokeStyle = wodCommandArrowStrokeRgba(unit, 0.88);
        wodStrokeCommandOrderPath(ctx, pts, unit, lw, 12);
    }
    ctx.restore();
}
function drawUnitMovementPath(ctx, unit) {
    let points = getDisplayedUnitOrderPathPoints(unit);
    if(points.length < 2) return;
    ctx.save();
    let isConvoy = unit.type === 'convoy';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = wodCommandArrowStrokeRgba(unit, isConvoy ? 0.92 : 0.85);
    wodStrokeCommandOrderPath(ctx, points, unit, isConvoy ? 3.5 : 4, 14);
    ctx.restore();
}
function drawCombatBurstIcon(ctx, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.fillStyle = '#f1c40f';
    ctx.strokeStyle = '#050505';
    ctx.lineWidth = Math.max(1.25, size * 0.16);
    let pts = 16;
    ctx.beginPath();
    for(let i = 0; i < pts; i++) {
        let a = (Math.PI * 2 * i) / pts;
        let r = (i % 2 === 0) ? size : size * 0.48;
        let px = Math.cos(a) * r;
        let py = Math.sin(a) * r;
        if(i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.fillStyle = '#fff3a3';
    ctx.beginPath();
    ctx.arc(-size * 0.18, -size * 0.18, size * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}
/** The "fighting" icon above units and besieged towns: crossed swords in the ancient and medieval eras, which fought
 *  hand to hand; the burst of gunfire from the Napoleonic era on (and with the modern and WW2 skins). */
function drawCombatEraIcon(ctx, x, y, size) {
    const playing = gameState === 'PLAYING' || gameState === 'PAUSED';
    const period = playing && gameData._combatFxPeriod || wodGetRenderPeriod();
    if(period === 'ancient' || period === 'medieval') drawCrossedSwordsIcon(ctx, x, y, size);
    else drawCombatBurstIcon(ctx, x, y, size);
}
function drawCrossedSwordsIcon(ctx, x, y, size) {
    const L = size * 1.12, g = L * 0.42, bw = size * 0.32;
    // one sword along +x: pommel, grip, crossguard, then the blade to its point
    const sword = (angle) => {
        ctx.save();
        ctx.rotate(angle);
        const blade = () => { ctx.beginPath(); ctx.moveTo(-g, -bw / 2); ctx.lineTo(L - bw * 0.9, -bw / 2); ctx.lineTo(L, 0); ctx.lineTo(L - bw * 0.9, bw / 2); ctx.lineTo(-g, bw / 2); ctx.closePath(); };
        const guard = () => { ctx.beginPath(); ctx.rect(-g - size * 0.1, -size * 0.44, size * 0.2, size * 0.88); };
        const grip = () => { ctx.beginPath(); ctx.rect(-L + size * 0.14, -size * 0.11, L - g - size * 0.14, size * 0.22); };
        const pommel = () => { ctx.beginPath(); ctx.arc(-L + size * 0.1, 0, size * 0.17, 0, Math.PI * 2); };
        ctx.strokeStyle = '#050505';
        ctx.lineWidth = Math.max(1.25, size * 0.16);
        for(const part of [blade, grip, guard, pommel]) { part(); ctx.stroke(); }
        ctx.fillStyle = '#7a4a24'; grip(); ctx.fill();
        ctx.fillStyle = '#e9eef2'; blade(); ctx.fill();
        ctx.fillStyle = '#f1c40f'; guard(); ctx.fill(); pommel(); ctx.fill();
        // the fuller down the middle of the blade
        ctx.strokeStyle = 'rgba(120, 132, 145, 0.85)';
        ctx.lineWidth = Math.max(0.5, size * 0.07);
        ctx.beginPath(); ctx.moveTo(-g + size * 0.12, 0); ctx.lineTo(L - bw * 1.4, 0); ctx.stroke();
        ctx.restore();
    };
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    sword(-Math.PI * 0.75);
    sword(-Math.PI * 0.25);
    ctx.restore();
}
let wodPlayerSummarySig = '';
function wodBattleLedger() {
    if(!gameData._battleLedger||gameData._battleLedgerMap!==gameData.hexes) {
        gameData._battleLedger=wodNewBattleLedger();gameData._battleLedgerMap=gameData.hexes;
    }
    if(!gameData._battleLedger.id)gameData._battleLedger.id=wodNewBattleLedger().id;
    return gameData._battleLedger;
}
function wodNewBattleLedger(){return {id:'match-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)),seconds:0,activeSeconds:0,byOwner:{}};}
function wodBattleMetric(owner,key,amount=1) {
    if(owner<=0||!amount||gameState!=='PLAYING'||gameData.menuAttractMode||gameData.mp?.enabled&&!gameData.mp.isHost)return;
    const ledger=wodBattleLedger(),row=ledger.byOwner[owner]||(ledger.byOwner[owner]={});
    row[key]=(row[key]||0)+amount;
}
function wodLandTileCounts() {
    const counts={};let total=0;
    for(const h of gameData.hexList)if(!isWaterHex(h)) {total++;if(h.owner>0)counts[h.owner]=(counts[h.owner]||0)+1;}
    return {counts,total};
}
function wodFactionBattleStats(owner,complete=false,land=wodLandTileCounts()) {
    const fog=wodFogActive()&&!complete&&!wodIsFriendlyOwner(owner,wodLocalPlayerOwner());
    const visibleUnits=gameData.entities.filter(u=>u.hp>0&&u.owner===owner&&(!fog||wodOwnerCanSee(wodLocalPlayerOwner(),u)));
    const units=visibleUnits.flatMap(u=>[u,...(!fog&&u.cargo?[u.cargo]:[])]).filter(u=>u.type!=='convoy');
    const byType={light:0,motorized:0,mountaineer:0,marine:0,heavy:0,ship:0,transport:0,supply:0};
    for(const u of units)byType[u.type]=(byType[u.type]||0)+1;
    const cities=gameData.cities.filter(c=>c.owner===owner&&(!fog||wodOwnerCanSee(wodLocalPlayerOwner(),c)));
    const forts=(gameData.forts||[]).filter(f=>f.owner===owner&&(!fog||wodOwnerCanSee(wodLocalPlayerOwner(),f)));
    const jobs=(gameData.constructionJobs||[]).filter(j=>j.owner===owner);
    const metrics=fog?{}:(wodBattleLedger().byOwner[owner]||{});
    const income=fog?null:getOwnerIncome(owner),upkeep=fog?null:visibleUnits.reduce((n,u)=>n+getUnitUpkeep(u),0);
    return {owner,fog,land:land.counts[owner]||0,share:land.total?100*(land.counts[owner]||0)/land.total:0,totalLand:land.total,
        units,byType,cities,forts,jobs,metrics,income,upkeep,net:income==null?null:income-upkeep,
        money:fog?null:wodPlayerTreasury(owner),pool:fog?null:wodPlayerMpPool(owner),
        mpGrowth:fog?null:cities.reduce((n,c)=>n+getCityManpowerIncome(c),0),
        manpower:units.reduce((n,u)=>n+(u.manpower||0),0),tanks:units.reduce((n,u)=>n+(u.tanks||0),0),
        motorizedPersonnel:units.filter(u=>u.type==='motorized').reduce((n,u)=>n+(u.manpower||0),0),
        mountaineerPersonnel:units.filter(u=>u.type==='mountaineer').reduce((n,u)=>n+(u.manpower||0),0),
        motorizedEquipment:units.reduce((n,u)=>n+wodMotorizedEquipment(u).count,0),
        readiness:units.length?100*units.reduce((n,u)=>n+Math.max(0,Math.min(1,u.hp/u.maxHp)),0)/units.length:100,
        fighting:units.filter(u=>u._combatEngaged||(u.activeCombatVisual||0)>.1).length,
        moving:units.filter(u=>u.target).length,healing:units.filter(wodUnitHealingIcon).length,
        embarked:units.filter(u=>!wodIsNavalUnit(u)&&isWaterHex(getNearestHexToPoint(u.x,u.y))).length,
        cargo:visibleUnits.filter(u=>u.cargo).length,
        cut:units.filter(u=>{if(visibleUnits.some(t=>t.cargo===u))return false;const h=getNearestHexToPoint(u.x,u.y);return h&&!wodIsNavalUnit(u)&&(wodUnitInUnsuppliedWater(u,h)||wodGetUnitEncirclementState(u,h));}).length,
        casualties:fog?null:getOwnerCasualties(owner),tankLosses:fog?null:getOwnerTankCasualties(owner),shipLosses:fog?null:getOwnerShipCasualties(owner),
        kills:fog?null:(gameData.killsByOwner?.[owner]||(owner===1?gameData.playerKills:0)||0),
        tankKills:fog?null:(gameData.tankKillsByOwner?.[owner]||0),shipKills:fog?null:(gameData.shipKillsByOwner?.[owner]||0)};
}
function wodStatNumber(n,digits=0) {return n===null?'Unknown':Number(n||0).toLocaleString('en-US',{maximumFractionDigits:digits});}
function wodStatMoney(n) {return n===null?'Unknown':'$'+wodStatNumber(n);}
function wodStatTiles(label,value,note='') {
    return `<div class="battle-stat"><span>${wodEscapeHtmlLite(label)}</span><strong>${value}</strong>${note?`<small>${wodEscapeHtmlLite(note)}</small>`:''}</div>`;
}
function wodStatSection(title,content,note='') {
    return `<section class="battle-section"><h3>${title}</h3>${note?`<p class="battle-note">${note}</p>`:''}<div class="battle-stat-grid">${content}</div></section>`;
}
function wodBattleOwnerLabel(owner) {
    if(owner===wodLocalPlayerOwner())return 'You';
    return wodSummaryOwnerLabel(owner,wodLocalPlayerOwner(),!!gameData.mp?.enabled);
}
function wodRenderFactionStats(complete=false) {
    const land=wodLandTileCounts(),local=wodLocalPlayerOwner();
    const owners=new Set([local,...Object.keys(land.counts).map(Number),...gameData.cities.map(c=>c.owner),...Object.keys(wodBattleLedger().byOwner).map(Number)]);
    for(const u of gameData.entities)if(u.owner>0)owners.add(u.owner);
    const group=(title,rows)=>`<section class="battle-faction-group"><h4>${title}</h4><dl>${rows.map(([label,value,type])=>`<div${type?' data-stats-unit-type="'+type+'"':''}><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl></section>`;
    const num=wodStatNumber,money=wodStatMoney;
    return `<div class="battle-factions">${[...owners].filter(o=>o>0).sort((a,b)=>a===local?-1:b===local?1:a-b).map(owner=>{
                const r=wodFactionBattleStats(owner,complete,land),m=r.metrics,color=factionColors[owner]||'#94a3b8';
                const holdings=group('TERRITORY & HOLDINGS',[
                    [r.fog?'Spotted towns':'Towns',num(r.cities.length)],[r.fog?'Spotted forts':'Forts',num(r.forts.length)],
                    ['Land gained',r.fog?'Unknown':num(m.landGained)],['Land lost',r.fog?'Unknown':num(m.landLost)],
                    ['Towns captured',r.fog?'Unknown':num(m.citiesCaptured)]
                ]);
                const army=group(r.fog?'SPOTTED FORCES':'ARMY IN THE FIELD',[
                    [r.fog?'Visible units':'Field units',num(r.units.length)],
                    ...['light','marine','motorized','mountaineer','heavy','ship','transport','supply'].map(type=>[wodProductionLabel(type),num(r.byType[type]),type]),
                    ['Field personnel',num(r.manpower)],['Average strength',r.readiness.toFixed(1)+'%'],
                    ['Out of supply',num(r.cut)]
                ]);
                const specialists=group('EQUIPMENT & SPECIALISTS',[
                    [wodMotorizedEquipment().label+' in service',num(r.motorizedEquipment)],
                    [wodSpecialistLabel('motorized')+' personnel',num(r.motorizedPersonnel)],
                    [wodSpecialistLabel('mountaineer')+' personnel',num(r.mountaineerPersonnel)],
                    [wodMotorizedEquipment().label+' lost',r.fog?'Unknown':num(m['own'+wodMotorizedEquipment().kind+'Losses'])],
                    [wodMotorizedEquipment().label+' destroyed',r.fog?'Unknown':num(m['enemy'+wodMotorizedEquipment().kind+'Kills'])],
                    [wodSpecialistLabel('motorized')+' personnel lost',r.fog?'Unknown':num(m.ownMotorizedLosses)],
                    [wodSpecialistLabel('motorized')+' personnel killed',r.fog?'Unknown':num(m.enemyMotorizedKills)],
                    [wodSpecialistLabel('mountaineer')+' lost',r.fog?'Unknown':num(m.ownMountaineerLosses)],
                    [wodSpecialistLabel('mountaineer')+' killed',r.fog?'Unknown':num(m.enemyMountaineerKills)]
                ]);
                const economy=group('ECONOMY & RESERVES',[
                    ['Treasury',money(r.money)],['Net income',r.fog?'Unknown':formatDollarRate(r.net)],['Manpower reserve',num(r.pool)],
                    ['Factories',r.fog?'Unknown':num(r.cities.filter(c=>c.hasFactory).length)],['Harbors',r.fog?'Unknown':num(r.cities.filter(c=>c.hasHarbor).length)],
                    ['Production orders',r.fog?'Unknown':num(r.jobs.length)]
                ]);
                const combat=group('COMBAT RECORD',[
                    ['Personnel killed',num(r.kills)],['Personnel lost',num(r.casualties)],
                    ['Units destroyed',r.fog?'Unknown':num(m.unitsDestroyed)],['Units lost',r.fog?'Unknown':num(m.unitsLost)],
                    ['Armor lost',num(r.tankLosses)],['Vessels lost',num(r.shipLosses)]
                ]);
                const attrition=group('ATTRITION LOSSES',[
                    [wodMotorizedEquipment().label+' lost',r.fog?'Unknown':num(m['attrition'+wodMotorizedEquipment().label+'Lost'])],
                    [wodSpecialistLabel('mountaineer')+' lost',r.fog?'Unknown':num(m.attritionMountaineerPersonnelLost)],
                    ['Personnel lost',r.fog?'Unknown':num(m.attritionPersonnelLost)],['Armor lost',r.fog?'Unknown':num(m.attritionArmorLost)],
                    ['Units lost',r.fog?'Unknown':num(m.attritionUnitsLost)],['Vessels lost',r.fog?'Unknown':num(m.attritionVesselsLost)],
                    ['Attrition damage',r.fog?'Unknown':num(m.attritionDamage,1)]
                ]);
                const final=complete?group('BATTLE TOTALS',[
                    ['Damage dealt',num(m.damageDealt,1)],['Combat damage received',num(m.combatDamageTaken,1)],
                    ['Money spent',money(m.moneySpent)],['Personnel restored',num(m.personnelRestored)]
                ]):'';
                return `<article class="battle-faction${owner===local?' battle-faction--local':''}" data-stats-owner="${owner}" style="--side:${color}">
                    <header><i></i><h3>${wodBattleOwnerLabel(owner)}</h3><span>${owner===local?'Your faction':r.fog?'Spotted forces':'Faction totals'}</span></header>
                    <div class="battle-land"><strong data-land-tiles="${owner}">${num(r.land)}</strong><span>land tiles <b>${r.share.toFixed(1)}%</b></span></div>
                    <div class="battle-share" role="img" aria-label="${r.share.toFixed(1)} percent of land"><i style="width:${r.share}%"></i></div>
                    <div class="battle-faction-groups">${holdings+army+specialists+economy+combat+attrition+final}</div>
                    ${r.fog?'<p class="battle-note">Only spotted forces are shown. Enemy reserves, production and losses remain hidden; land totals are public.</p>':''}
                </article>`;
            }).join('')}</div>`;
}
function wodRefreshBattleStats() {
    const root=UI.statsMenu;if(!root||root.classList.contains('hidden'))return;
    const r=wodFactionBattleStats(wodLocalPlayerOwner()),m=r.metrics,stat=wodStatTiles,num=wodStatNumber;
    document.getElementById('wodStatsIdentity').innerHTML=`<strong style="--side:${factionColors[r.owner]||'#94a3b8'}"><i></i>${wodBattleOwnerLabel(r.owner)} · Your faction</strong><span>${wodPeriodLabel(wodGetMatchPeriod())} · ${formatGameDurationForSummary(wodBattleLedger().seconds)}</span>`;
    document.getElementById('wodStatsOverview').innerHTML=stat('Land controlled',num(r.land),r.share.toFixed(1)+'% of all land')+stat('Field units',r.units.length,num(r.manpower)+' personnel')+stat('Towns',r.cities.length,r.forts.length+' forts')+stat('Net income',formatDollarRate(r.net),formatGameDurationForSummary(wodBattleLedger().seconds)+' battle time');
    for(const [id,value] of Object.entries({'ui-money':wodStatMoney(r.money),'ui-income':formatDollarRate(r.income),'ui-land-income':formatDollarRate(getOwnerLandIncome(r.owner)),'ui-expenses':formatDollarRate(-r.upkeep),'ui-manpower':num(r.pool),'ui-manpower-income':formatManpowerRate(r.mpGrowth),'ui-troops':num(r.manpower),'ui-motorized-equipment-label':wodMotorizedEquipment().label+' in service','ui-motorized-equipment':num(r.motorizedEquipment),'ui-motorized-personnel-label':wodSpecialistLabel('motorized')+' personnel','ui-motorized-personnel':num(r.motorizedPersonnel),'ui-mountaineer-personnel-label':wodSpecialistLabel('mountaineer')+' personnel','ui-mountaineer-personnel':num(r.mountaineerPersonnel),'ui-tanks':num(r.tanks),'ui-warships-label':wodProductionLabel('ship'),'ui-supply-ships-label':wodProductionLabel('supply'),'ui-ships':r.byType.ship,'ui-transports':r.byType.transport,'ui-supply-ships':r.byType.supply,
        'ui-casualties':num(r.casualties),'ui-tank-casualties':num(r.tankLosses),'ui-ship-casualties':num(r.shipLosses),'ui-enemy-casualties':num(r.kills),'ui-tank-kills':num(r.tankKills),'ui-ship-kills':num(r.shipKills)})) {
        const el=document.getElementById(id);if(el)el.textContent=value;
    }
    const jobs=r.jobs.filter(j=>['light','motorized','mountaineer','marine','heavy','ship','transport','supply'].includes(j.mode));
    document.getElementById('wodStatsEconomyDetail').innerHTML=
        wodStatSection('Revenue & reserves',stat('Net cash flow',formatDollarRate(r.net))+stat('Town income',formatDollarRate(r.cities.reduce((n,c)=>n+getCityIncome(c),0)))+stat('Command income',formatDollarRate(getOwnerCommandIncome(r.owner)))+stat('Manpower growth',formatManpowerRate(r.mpGrowth))+stat('Gross revenue earned',wodStatMoney(Math.max(0,gameData._sessionIncomeAcc?.byOwner?.[r.owner]||0)))+stat('Money spent',wodStatMoney(m.moneySpent))+stat('Recruitment manpower',num(m.manpowerCommitted))+stat('Replacement loss value',wodStatMoney(getOwnerCasualtyReplacementCost(r.owner))))+
        wodStatSection('Infrastructure & production',stat('Factories',r.cities.filter(c=>c.hasFactory).length)+stat('Harbors',r.cities.filter(c=>c.hasHarbor).length)+stat('Farms',r.cities.filter(c=>c.hasFarm).length)+stat('Forts',r.forts.length)+stat('Bridges',(gameData.bridges||[]).filter(b=>b.owner===r.owner).length)+stat('Units mobilizing',jobs.length)+stat('Structures building',r.jobs.length-jobs.length)+stat('Towns under siege',r.cities.filter(isCitySiegeBlockedForProduction).length))+
        wodStatSection('Construction completed',['factoriesBuilt','harborsBuilt','farmsBuilt','fortsBuilt','hospitalsBuilt','bridgesBuilt'].map(k=>stat(({factoriesBuilt:'Factories',harborsBuilt:'Harbors',farmsBuilt:'Farms',fortsBuilt:'Forts',hospitalsBuilt:'Hospitals',bridgesBuilt:'Bridges'})[k],num(m[k]))).join(''))+
        wodStatSection('Orders in progress',r.jobs.length?r.jobs.map(j=>stat(wodProductionLabel(j.mode),Math.ceil(j.remaining)+'s',j.rosterId?'Reserve reinforcement':'In production')).join(''):'<p class="battle-note">No production orders queued.</p>');
    const built=['light','motorized','mountaineer','marine','heavy','ship','transport','supply'].map(t=>stat(wodProductionLabel(t),num(m['unitsBuilt'+({light:'Light',motorized:'Motorized',mountaineer:'Mountaineer',marine:'Marine',heavy:'Heavy',ship:'Ship',transport:'Transport',supply:'Supply'})[t]]))).join('');
    document.getElementById('wodStatsForcesDetail').innerHTML=
        wodStatSection('Army composition',['light','motorized','mountaineer','marine','heavy','ship','transport','supply'].map(t=>stat(wodProductionLabel(t),r.byType[t])).join('')+stat('Convoys',gameData.entities.filter(u=>u.owner===r.owner&&u.type==='convoy'&&u.hp>0).length))+
        wodStatSection('Equipment & specialist personnel',stat(wodMotorizedEquipment().label+' in service',num(r.motorizedEquipment))+stat(wodSpecialistLabel('motorized')+' personnel',num(r.motorizedPersonnel))+stat(wodSpecialistLabel('mountaineer')+' personnel',num(r.mountaineerPersonnel)))+
        wodStatSection('Readiness & supply',stat('Average strength',r.readiness.toFixed(1)+'%')+stat('In combat',r.fighting)+stat('Marching',r.moving)+stat('Recovering',r.healing)+stat('Out of supply',r.cut)+stat('Embarked troops',r.embarked)+stat('Transport passengers',r.cargo)+stat('Personnel restored',num(m.personnelRestored)))+
        wodStatSection('Units mobilized this battle',built,'Opening armies and editor placements are excluded.');
    document.getElementById('wodStatsCombatDetail').innerHTML=
        wodStatSection('Combat record',stat('Units destroyed',num(m.unitsDestroyed))+stat('Units lost',num(m.unitsLost))+stat('Damage dealt',num(m.damageDealt,1))+stat('Combat damage received',num(m.combatDamageTaken,1))+stat('Other damage received',num(m.otherDamageTaken,1))+stat('Enemy armor destroyed',num(r.tankKills))+stat('Enemy vessels sunk',num(r.shipKills))+stat('Towns captured',num(m.citiesCaptured)))+
        wodStatSection('Specialist & equipment losses',stat(wodMotorizedEquipment().label+' lost',num(m['own'+wodMotorizedEquipment().kind+'Losses']))+stat('Enemy '+wodMotorizedEquipment().label.toLowerCase()+' destroyed',num(m['enemy'+wodMotorizedEquipment().kind+'Kills']))+stat(wodSpecialistLabel('motorized')+' personnel lost',num(m.ownMotorizedLosses))+stat(wodSpecialistLabel('motorized')+' personnel killed',num(m.enemyMotorizedKills))+stat(wodSpecialistLabel('mountaineer')+' lost',num(m.ownMountaineerLosses))+stat(wodSpecialistLabel('mountaineer')+' killed',num(m.enemyMountaineerKills)))+
        wodStatSection('Attrition losses',stat(wodMotorizedEquipment().label+' lost',num(m['attrition'+wodMotorizedEquipment().label+'Lost']))+stat(wodSpecialistLabel('mountaineer')+' lost',num(m.attritionMountaineerPersonnelLost))+stat('Personnel lost',num(m.attritionPersonnelLost))+stat('Armor lost',num(m.attritionArmorLost))+stat('Units lost',num(m.attritionUnitsLost))+stat('Vessels lost',num(m.attritionVesselsLost))+stat('Attrition damage',num(m.attritionDamage,1))+stat('Land supply damage',num(m.supplyAttritionDamage,1))+stat('Water attrition damage',num(m.waterAttritionDamage,1))+stat('Unpaid upkeep damage',num(m.unpaidAttritionDamage,1)))+
        wodStatSection('Territory movement',stat('Land tiles gained',num(m.landGained))+stat('Land tiles lost',num(m.landLost))+stat('Current land',num(r.land))+stat('Land share',r.share.toFixed(1)+'%'));
    document.getElementById('playerSummaryBody').innerHTML=wodRenderFactionStats();
    const opp=document.getElementById('wodStatsOpponents');if(opp)opp.innerHTML=wodAiOpponentsHtml();
}
function updatePlayerSummary() {wodRefreshBattleStats();}
// The difficulty the computer opponents play at. (Their commanders are drawn at random and kept secret.)
function wodAiOpponentsHtml() {
    const ai=new Set();
    for(const c of gameData.cities)if(c.owner>0&&!wodMpIsHumanOwner(c.owner)&&c.owner!==wodLocalPlayerOwner())ai.add(c.owner);
    for(const u of gameData.entities)if(u.owner>0&&u.hp>0&&!wodMpIsHumanOwner(u.owner)&&u.owner!==wodLocalPlayerOwner())ai.add(u.owner);
    if(!ai.size)return '';
    const diff=WOD_AI_DIFFICULTIES[gameData.aiDifficulty]||WOD_AI_DIFFICULTIES.normal;
    return '<section class="battle-section report-opponents"><h3>Computer opponents</h3><p class="report-opp-difficulty">Difficulty: <strong>'+diff.label+'</strong> · '+wodEscapeHtml(diff.line)+'</p></section>';
}
let _infoCardDomCache = null;
let _infoCardUiThrottle = { s: null, t: 0 };
let _infoCardPageIndex = 0;
const _infoCardPageLabels = ['Overview', 'Service record', 'Terrain effects'];
function getInfoCardDom() {
    if(_infoCardDomCache) return _infoCardDomCache;
    let effects = document.getElementById('infoEffects');
    wodBindEffectTooltipDelegation(effects);
    return _infoCardDomCache = {
        card: document.getElementById('infoCard'),
        pages: document.getElementById('infoCardPages'),
        emblem: document.getElementById('infoEmblem'),
        veteranBadge: document.getElementById('infoVeteranBadge'),
        effects: effects,
        morale: document.getElementById('infoMorale'),
        name: document.getElementById('infoName'),
        type: document.getElementById('infoType'),
        hp: document.getElementById('infoHP'),
        action: document.getElementById('infoAction'),
        statusDot: document.getElementById('infoStatusDot'),
        kpiPersonnel: document.getElementById('infoKpiPersonnel'),
        kpiCondition: document.getElementById('infoKpiCondition'),
        kpiTerrain: document.getElementById('infoKpiTerrain'),
        kpiTerrainBtn: document.getElementById('infoKpiTerrainBtn'),
        kpiRow: document.getElementById('infoKpiRow'),
        tanks: document.getElementById('infoStatTanks'),
        rename: document.getElementById('infoRename'),
        pager: document.getElementById('infoCardPager'),
        pagePrev: document.getElementById('infoCardPagePrev'),
        pageNext: document.getElementById('infoCardPageNext'),
        pageLabel: document.getElementById('infoCardPageLabel'),
        page0: document.getElementById('infoCardPage0'),
        page1: document.getElementById('infoCardPage1'),
        page2: document.getElementById('infoCardPage2'),
        recordName: document.getElementById('infoRecordName'),
        recordKills: document.getElementById('infoRecordKills'),
        recordLosses: document.getElementById('infoRecordLosses'),
        recordTankKills: document.getElementById('infoRecordTankKills'),
        recordTankLosses: document.getElementById('infoRecordTankLosses'),
        recordTankKillsRow: document.getElementById('infoRecordTankKillsRow'),
        recordTankLossesRow: document.getElementById('infoRecordTankLossesRow'),
        recordXp: document.getElementById('infoRecordXp'),
        recordRank: document.getElementById('infoRecordRank')
    };
}
function wodSyncInfoCardKpis(sel, actionText) {
    let els = getInfoCardDom();
    if(!els.kpiPersonnel) return;
    if(!sel) {
        els.kpiPersonnel.innerText = '—';
        els.kpiCondition.innerText = '—';
        els.kpiTerrain.innerText = '—';
        if(els.statusDot) els.statusDot.className = 'info-status-dot';
        return;
    }
    if(sel.id) {
        let mpBd = typeof getCityManpowerBreakdown === 'function' ? getCityManpowerBreakdown(sel) : null;
        els.kpiPersonnel.innerText = mpBd ? ('+' + mpBd.total + '/s') : '—';
        els.kpiCondition.innerText = sel.owner === 0 ? 'Neutral' : 'Held';
        els.kpiTerrain.innerText = 'Urban';
    } else if(sel.type === 'convoy') {
        els.kpiPersonnel.innerText = '—';
        els.kpiCondition.innerText = '100%';
        let hex = getNearestHexToPoint(sel.x, sel.y);
        els.kpiTerrain.innerText = hex ? terrainLabel(hex.type) : '—';
    } else {
        let maxMp = sel.maxManpower || sel.maxHp || 1000;
        let mp = sel.manpower !== undefined ? sel.manpower : maxMp;
        els.kpiPersonnel.innerText = formatPeople(mp);
        let maxHp = Math.max(1, sel.maxHp || 100);
        let cond = Math.max(0, Math.min(100, Math.round((sel.hp / maxHp) * 100)));
        els.kpiCondition.innerText = cond + '%';
        let hex = getNearestHexToPoint(sel.x, sel.y);
        els.kpiTerrain.innerText = hex ? terrainLabel(hex.type) : '—';
    }
    if(els.statusDot) {
        let t = (actionText || '').toLowerCase();
        let cls = 'info-status-dot';
        if(t.indexOf('rout') >= 0 || t.indexOf('enemy') >= 0) cls += ' is-danger';
        else if(t.indexOf('fight') >= 0) cls += ' is-warn';
        else if(t.indexOf('mov') >= 0) cls += ' is-busy';
        els.statusDot.className = cls;
    }
}
function wodResetInfoCardPage() {
    _infoCardPageIndex = 0;
    wodApplyInfoCardPage();
}
function wodApplyInfoCardPage() {
    let els = getInfoCardDom();
    let singleUnit = gameData.selection.length === 1 && gameData.selection[0] && !gameData.selection[0].id && gameData.selection[0].type !== 'convoy';
    if(!singleUnit && _infoCardPageIndex === 1) _infoCardPageIndex = 0;
    if(els.card) els.card.classList.toggle('info-card--paged', _infoCardPageIndex > 0 || !!singleUnit);
    if(els.pager) els.pager.hidden = true;
    if(els.page0) {
        els.page0.classList.toggle('info-card-page--active', _infoCardPageIndex === 0);
        els.page0.hidden = _infoCardPageIndex !== 0;
    }
    if(els.page1) {
        els.page1.classList.toggle('info-card-page--active', _infoCardPageIndex === 1);
        els.page1.hidden = _infoCardPageIndex !== 1;
    }
    if(els.page2) {
        els.page2.classList.toggle('info-card-page--active', _infoCardPageIndex === 2);
        els.page2.hidden = _infoCardPageIndex !== 2;
    }
    if(els.pageLabel) els.pageLabel.textContent = _infoCardPageLabels[_infoCardPageIndex] || 'Overview';
    if(els.pagePrev) els.pagePrev.disabled = _infoCardPageIndex <= 0;
    if(els.pageNext) els.pageNext.disabled = _infoCardPageIndex >= 2;
    document.querySelectorAll('#infoCard .info-order-btn[data-mo="stats"]').forEach(btn => {
        btn.classList.toggle('active', _infoCardPageIndex === 1);
    });
    if(els.kpiTerrainBtn) els.kpiTerrainBtn.classList.toggle('active', _infoCardPageIndex === 2);
}
function wodStepInfoCardPage(delta) {
    let singleUnit = gameData.selection.length === 1 && gameData.selection[0] && !gameData.selection[0].id && gameData.selection[0].type !== 'convoy';
    if(!singleUnit && _infoCardPageIndex !== 2) return;
    _infoCardPageIndex = Math.max(0, Math.min(2, _infoCardPageIndex + delta));
    if(_infoCardPageIndex === 1 && !singleUnit) _infoCardPageIndex = delta > 0 ? 2 : 0;
    wodApplyInfoCardPage();
}
function wodUnitCombatStatsMarkup(unit,preview=false) {
    const command=wodGeneralStatMultiplier(unit),morale=unit.morale??WOD_MORALE_MAX;
    const combat=unit._combatEngaged&&!unit.moraleBroken?(unit.retreating?.75:1/3):1;
    const speed=wodUnitBaseSpeed(unit)/WOD_UNIT_BASE_SPEED*getUnitSpeedMultiplier(unit)*wodFortEnemyMovementSlowdownMultiplier(unit)*combat;
    const values=[['Attack',(unit.damage*command*wodVeteranStatMult(unit)*(preview?1:.18+.82*Math.min(1,morale/WOD_MORALE_MAX))).toFixed(1)],
        ['Effective HP',(unit.maxHp*command).toFixed(0)],['Weapon range',(unit.range*command).toFixed(1)],['Speed',speed.toFixed(2)+'×'],
        ['Morale',Math.round(morale)+' / '+Math.round(WOD_MORALE_MAX*command)],['Attack interval',(unit.attackCooldown*WOD_ATTACK_INTERVAL_MULT/command).toFixed(1)+'s']];
    let html=values.map(([label,value])=>'<div class="info-record-item"><span>'+label+'</span><strong>'+value+'</strong></div>').join('');
    if(!preview&&unit.preferredTargetUid){const e=gameData.entities.find(e=>e.uid===unit.preferredTargetUid&&e.hp>0),visible=e&&wodOwnerCanSee(unit.owner,e);
        const label=visible?wodProductionLabel(e.type):'Outside vision';html+='<div class="info-record-item info-record-item--wide"><span>Attack target</span><strong>'+wodEscapeEffectInner(label)+'</strong>'+(unit.owner===wodLocalPlayerOwner()?'<button type="button" onclick="wodIssuePreferredTarget(null)" aria-label="Clear preferred target">Clear target</button>':'')+'</div>';
    }
    return html;
}
function wodSyncUnitCombatStats(unit) {
    for(const id of ['infoCombatStats','infoRecordCombatStats']){const el=document.getElementById(id);if(!el)continue;
        el.hidden=!unit||!!unit.id||unit.type==='convoy';if(el.hidden)continue;const html=wodUnitCombatStatsMarkup(unit);if(el.innerHTML!==html)el.innerHTML=html;
    }
}
function wodOpenInfoStatsPage() {
    if(gameData.selection.length !== 1) return;
    let singleUnit = gameData.selection.length === 1 && gameData.selection[0] && !gameData.selection[0].id && gameData.selection[0].type !== 'convoy';
    if(!singleUnit) return;
    _infoCardPageIndex = 1;
    wodApplyInfoCardPage();
}
function wodOpenInfoTerrainPage() {
    if(gameState !== 'PLAYING') return;
    wodSyncUnitTerrainPage(gameData.selection[0]);
    _infoCardPageIndex = 2;
    wodApplyInfoCardPage();
}
function wodSyncUnitTerrainPage(unit) {
    const root=document.getElementById('infoTerrainEffectsMount');if(!root)return;
    if(!unit||unit.id){root._html=null;root.innerHTML='<p>Select one unit to see its terrain effects.</p>';return;}
    const naval=wodIsNavalUnit(unit),marine=unit.type==='marine';
    const probe={...unit,x:1e9,y:1e9,morale:100,moraleBroken:false,veteran:false,xp:0};
    const pct=n=>Math.round(n*100)+'%';
    const rows=['grass','sand','forest','hill','swamp','urban','mountain','bridge','water'].map(type=>{
        const water=type==='water',blocked=naval?!water:type==='mountain'&&!wodCanClimb(unit);
        const u={...probe,inWater:water&&!marine&&!naval,amphibInWater:water&&marine};
        const h={type},attack=getTerrainAttackModifier(u,h),damage=getTerrainDefenseModifier(u,h);
        const note=blocked?'Cannot enter':water?(naval?'Repairs within 2 town tiles or a hospital radius · No water attrition':marine?'No water attrition · Cannot heal afloat':'10s grace, then −3.5% max HP/s · Cannot heal · Supply ships do not protect swimmers'):type==='bridge'?'Completed bridges count as land':'Supply from a connected friendly town or nearby supply ship';
        return '<div class="info-terrain-entry" style="border-bottom:1px solid #60778755;padding:9px 0"><strong>'+wodEscapeEffectInner(terrainLabel(type))+'</strong><div style="display:flex;flex-wrap:wrap;gap:6px 12px;margin:5px 0;color:#d9e5ec">'+(blocked?'Movement blocked':'<span>Attack '+pct(attack)+'</span><span>Damage taken '+pct(damage)+'</span><span>Speed '+(pct(getUnitSpeedMultiplier({...u,inWater:water&&!naval,amphibInWater:water&&marine},h)))+'</span>')+'</div><small style="color:#a9c1cc">'+note+'</small></div>';
    }).join('');
    const html='<p><strong>'+wodEscapeEffectInner(wodProductionLabel(unit.type))+'</strong> · This unit’s terrain modifiers. 100% is normal; lower damage taken means better cover.</p><h4>Current effects</h4><div class="info-terrain-active-effects effect-list"></div><h4>Terrain by tile</h4>'+rows;
    if(root._html!==html){wodHideEffectTooltip();root.innerHTML=html;root._html=html;wodBindEffectTooltipDelegation(root);}
    wodSetInfoEffectsHtml({effects:root.querySelector('.info-terrain-active-effects')},getUnitEffects(unit).map(wodFmtInfoEffectMarkup).join(''));
    const note=document.querySelector('.info-terrain-page-note');if(note)note.textContent='Terrain, movement, supply and active effects for this unit.';
}
function wodOpenInfoOverviewPage() {
    _infoCardPageIndex = 0;
    wodApplyInfoCardPage();
}
function wodSyncInfoCardServiceRecord(sel) {
    let els = getInfoCardDom();
    if(!els.recordKills) return;
    let kills = Math.round(sel.kills || 0);
    let losses = Math.round(sel.losses || 0);
    let xp = Math.round(sel.xp || 0);
    els.recordKills.textContent = formatFullCount(kills);
    els.recordLosses.textContent = formatFullCount(losses);
    els.recordXp.textContent = formatFullCount(xp) + (xp<100?' / 100':'')+' XP';
    els.recordRank.textContent = wodUnitExperience(sel).rank.name+(wodIsUnitVeteran(sel)?' (+10%)':'');
    let showTankKills = sel.type !== 'convoy';
    let showTankLosses = sel.type === 'heavy';
    if(els.recordTankKillsRow) {
        els.recordTankKillsRow.hidden = !showTankKills;
        els.recordTankKillsRow.style.display = showTankKills ? '' : 'none';
        els.recordTankKillsRow.classList.toggle('info-record-item--wide', showTankKills && !showTankLosses);
    }
    if(els.recordTankLossesRow) {
        els.recordTankLossesRow.hidden = !showTankLosses;
        els.recordTankLossesRow.style.display = showTankLosses ? '' : 'none';
    }
    if(showTankKills && els.recordTankKills)
        els.recordTankKills.textContent = formatFullCount(Math.round(sel.tankKills || 0));
    else if(els.recordTankKills) els.recordTankKills.textContent = '0';
    if(showTankLosses && els.recordTankLosses)
        els.recordTankLosses.textContent = formatFullCount(Math.round(sel.tankLosses || 0));
    else if(els.recordTankLosses) els.recordTankLosses.textContent = '0';
    document.getElementById('infoRecordAttritionPersonnel').textContent=formatFullCount(Math.round(sel.attritionLosses||0));
    document.getElementById('infoRecordAttritionArmor').textContent=formatFullCount(Math.round(sel.attritionTankLosses||0));
}
function wodEnsureFxTipEl() {
    let el = document.getElementById('wodFxTip');
    if(el) return el;
    el = document.createElement('div');
    el.id = 'wodFxTip';
    el.setAttribute('role', 'tooltip');
    el.hidden = true;
    document.body.appendChild(el);
    return el;
}
function wodHideEffectTooltip() {
    const tip=document.getElementById('wodFxTip');if(tip){tip.hidden=true;tip._effectAnchor=null;}
}
function wodRefreshEffectTooltipOnScroll() {
    const tip=document.getElementById('wodFxTip'),anchor=tip?._effectAnchor;
    if(anchor?.isConnected&&(anchor.matches(':hover')||anchor===document.activeElement)){
        const box=anchor.getBoundingClientRect();if(box.bottom>0&&box.top<window.innerHeight){wodPositionFxTip(box,tip);return;}
    }
    wodHideEffectTooltip();
}
function wodBindEffectTooltipDelegation(root) {
    if(!root || root._wodFxTipBound) return;
    root._wodFxTipBound = true;
    root.addEventListener('mouseover', (e) => {
        let pill = e.target.closest('.effect-pill--has-tip');
        if(!pill || !root.contains(pill)) return;
        let tip = pill.querySelector('.effect-pill-tip');
        if(!tip) return;
        let floater = wodEnsureFxTipEl();
        floater._effectAnchor=pill;
        floater.classList.remove('wod-hud-tip-panel');
        floater.textContent = tip.textContent;
        wodPositionFxTip(pill.getBoundingClientRect(), floater);
    });
    root.addEventListener('mouseout', (e) => {
        let pill = e.target.closest('.effect-pill--has-tip');
        if(!pill || !root.contains(pill)) return;
        let rel = e.relatedTarget;
        if(rel && pill.contains(rel)) return;
        wodHideEffectTooltip();
    });
    root.addEventListener('scroll',wodRefreshEffectTooltipOnScroll,{passive:true});
    root.addEventListener('pointerleave',wodHideEffectTooltip);
    if(!wodBindEffectTooltipDelegation._global){
        wodBindEffectTooltipDelegation._global=true;
        document.addEventListener('pointermove',e=>{const tip=document.getElementById('wodFxTip'),anchor=tip?._effectAnchor;if(anchor&&(!anchor.isConnected||!anchor.contains(e.target)))wodHideEffectTooltip();},{passive:true});
        window.addEventListener('blur',wodHideEffectTooltip);window.addEventListener('resize',wodHideEffectTooltip);
        document.addEventListener('scroll',wodRefreshEffectTooltipOnScroll,{capture:true,passive:true});
    }
}
function wodEscapeEffectInner(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function wodFmtInfoEffectMarkup(effect) {
    let cls = 'effect-pill';
    if(effect.block) cls += ' effect-pill--block';
    if(effect.warn) cls += ' effect-pill--warn';
    if(effect.terrain) cls += ' effect-pill--terrain';
    let tipText = effect.detail || effect.stats || effect.label || '';
    if(tipText) cls += ' effect-pill--has-tip';
    let inner;
    if(effect.render === 'terrainCombat' && effect.atkPct != null && effect.defPct != null) {
        inner = '<span class="effect-pill-label">' + wodEscapeEffectInner(effect.label) + '</span><span class="effect-pill-stat effect-pill-stat-chart">' + wodChartCombatStatMarkup(effect.atkPct | 0, effect.defPct | 0) + '</span>';
    } else if(effect.render === 'fortDmg' && effect.fortDmgPct != null) {
        inner = '<span class="effect-pill-label">' + wodEscapeEffectInner(effect.label) + '</span><span class="effect-pill-stat effect-pill-stat-chart"><span class="wod-help-terrain-matrix-def">Dmg taken ' + (effect.fortDmgPct | 0) + '%</span></span>';
    } else if(effect.stats) {
        inner = '<span class="effect-pill-label">' + wodEscapeEffectInner(effect.label) + '</span><span class="effect-pill-stat">' + wodEscapeEffectInner(effect.stats) + '</span>';
    } else {
        inner = wodEscapeEffectInner(effect.label);
    }
    let tipHtml = tipText
        ? '<span class="effect-pill-tip" role="tooltip">' + wodEscapeEffectInner(tipText) + '</span>'
        : '';
    return '<span class="' + cls + '" data-effect-key="'+encodeURIComponent(effect.label||'')+'" tabindex="0">' + inner + tipHtml + '</span>';
}
function wodSetInfoEffectsHtml(els, html) {
    if(!els || !els.effects) return;
    let next = html || '';
    if(els.effects.innerHTML === next) return;
    let pages = els.pages || document.getElementById('infoCardPages');
    let list = els.effects;
    let pageScroll = pages ? pages.scrollTop : 0;
    let listScroll = list.scrollTop || 0;
    // Keep hovered/focused pills alive as countdowns and stats update.
    const template=document.createElement('template');template.innerHTML=next;
    const old=new Map([...list.children].filter(n=>n.dataset.effectKey).map(n=>[n.dataset.effectKey,n])),keep=[];
    for(const fresh of template.content.children){
        const node=old.get(fresh.dataset.effectKey)||fresh;
        if(node!==fresh){node.className=fresh.className;if(node.innerHTML!==fresh.innerHTML)node.innerHTML=fresh.innerHTML;}
        keep.push(node);
    }
    for(let i=0;i<keep.length;i++)if(list.children[i]!==keep[i])list.insertBefore(keep[i],list.children[i]||null);
    for(const node of [...list.children])if(!keep.includes(node))node.remove();
    const tip=document.getElementById('wodFxTip'),anchor=tip?._effectAnchor;
    if(anchor&&!anchor.isConnected)wodHideEffectTooltip();
    else if(anchor&&list.contains(anchor)){tip.textContent=anchor.querySelector('.effect-pill-tip')?.textContent||'';wodPositionFxTip(anchor.getBoundingClientRect(),tip);}
    if(pages) pages.scrollTop = pageScroll;
    if(list) list.scrollTop = listScroll;
}
function wodSyncUnitExperienceCard(unit) {
    const box=document.getElementById('infoUnitXp');
    if(!box)return;
    box.hidden=!unit||unit.id!=null||unit.hp==null||unit.type==='convoy';if(box.hidden)return;
    const e=wodUnitExperience(unit);
    document.getElementById('infoUnitRank').textContent=e.rank.name+' · Rank '+e.level+'/'+e.maxLevel;
    document.getElementById('infoUnitXpValue').textContent=Math.floor(e.xp).toLocaleString()+(e.next?' / '+WOD_VETERAN_XP_THRESHOLD:'')+' XP';
    const track=document.getElementById('infoUnitXpTrack');track.setAttribute('aria-valuenow',String(e.progress));track.firstElementChild.style.width=e.progress+'%';
    document.getElementById('infoUnitXpNote').textContent=e.next?Math.max(0,Math.ceil(e.next.xp-e.xp))+' XP to '+e.next.name+' · Combat earns experience':'+10% damage · Maximum rank';
}
function syncInfoCardPanel() {
    wodSyncDisbandButton(gameData.selection.length===1?gameData.selection[0]:null);
    wodSyncUnitCombatStats(gameData.selection.length===1?gameData.selection[0]:null);
    wodSyncUnitExperienceCard(gameData.selection.length===1?gameData.selection[0]:null);
    const tip=document.getElementById('wodFxTip');
    if(tip?._effectAnchor&&(gameState!=='PLAYING'||!tip._effectAnchor.isConnected||!tip._effectAnchor.getClientRects().length||!gameData.selection.length))wodHideEffectTooltip();
    if(_infoCardPageIndex===2)wodSyncUnitTerrainPage(gameData.selection.length===1?gameData.selection[0]:null);
    wodSyncTransportControls();
    let els = getInfoCardDom();
    if(!els.card) return;
    let infoMorale = els.morale;
    let infoTanks = els.tanks;
    let lo = wodLocalPlayerOwner();
    let prevLen = syncInfoCardPanel._lastSelLen;
    let prevUid = syncInfoCardPanel._lastSelUid;
    if(gameData.selection.length === 1) {
        let sel = gameData.selection[0];
        let nextUid = sel.uid || sel.id || '';
        if(prevLen !== 1 || prevUid !== nextUid) {
            wodHideEffectTooltip();
            if(typeof wodCloseOpenGameMenusOnUnitSelect === 'function')
                wodCloseOpenGameMenusOnUnitSelect();
            wodResetInfoCardPage();
            if(typeof toggleInfoCardMore === 'function') toggleInfoCardMore(false);
        }
        syncInfoCardPanel._lastSelLen = 1;
        syncInfoCardPanel._lastSelUid = sel.uid || sel.id || '';
        els.card.classList.add('visible');
        if(els.veteranBadge) els.veteranBadge.hidden = !(sel.hp !== undefined && !sel.id && sel.type !== 'convoy' && wodIsUnitVeteran(sel));

        if(sel.id) {
            if(els.veteranBadge) els.veteranBadge.hidden = true;
            delete els.emblem.dataset.unitType;
            els.emblem.style.removeProperty('--unit-color');
            els.emblem.innerText = "T";
            els.emblem.style.background = sel.owner === 0 ? '#bdc3c7' : factionColors[sel.owner];
            els.name.innerText = sel.name || "City";
            if(els.recordName) els.recordName.innerText = sel.name || "City";
            let pf = wodPeriodFlavor(wodGetMatchPeriod());
            let type = pf.cityTown;
            if(sel.hasFactory && sel.hasHarbor) type = pf.cityPortIndustrial;
            else if(sel.hasFactory) type = pf.cityIndustrial;
            else if(sel.hasHarbor) type = pf.cityPort;
            els.type.innerText = type;
            let incBd = getCityIncomeBreakdown(sel);
            let mpBd = getCityManpowerBreakdown(sel);
            els.hp.innerText = 'Income: ' + formatDollarRate(incBd.total);
            if(infoMorale) infoMorale.innerText = 'Manpower: ' + formatManpowerRate(mpBd.total);
            els.action.innerText = sel.owner === lo ? "Player Controlled" : (sel.owner > 0 ? "Enemy Controlled" : "Neutral");
            wodSyncInfoCardKpis(sel, els.action.innerText);
            if(infoTanks) { infoTanks.innerText = ''; infoTanks.style.display = 'none'; infoTanks.setAttribute('aria-hidden', 'true'); }
            let cityEffects = [
                { label: 'Town base', stats: formatDollarRate(incBd.base), detail: 'Base $ income from this settlement.' },
                { label: 'Town base MP', stats: formatManpowerRate(mpBd.base), detail: 'Base manpower growth from this settlement.' }
            ];
            if(sel.hasFactory) {
                cityEffects.push({ label: 'Factory', stats: formatDollarRate(incBd.factory), detail: 'Factory bonus to $ income.' });
            }
            if(sel.hasFarm) {
                cityEffects.push({ label: 'Farm', stats: formatManpowerRate(mpBd.farm), detail: 'Farm bonus to manpower growth.' });
            }
            if(sel.hasHarbor) {
                cityEffects.push({ label: 'Harbor', stats: formatDollarRate(incBd.harbor), detail: 'Harbor bonus to $ income.' });
            }
            if(incBd.bonus > 0) cityEffects.push({ label: 'Income bonus', stats: formatDollarRate(incBd.bonus), detail: 'Extra $ income.' });
            if(mpBd.bonus > 0) cityEffects.push({ label: 'Manpower bonus', stats: formatManpowerRate(mpBd.bonus), detail: 'Extra manpower growth.' });
            wodSetInfoEffectsHtml(els, cityEffects.map(wodFmtInfoEffectMarkup).join(''));
        } else {
            els.emblem.innerText = '';
            els.emblem.dataset.unitType = sel.type || 'light';
            els.emblem.style.background = '';
            els.emblem.style.setProperty('--unit-color', factionColors[sel.owner] || '#6f7b72');
            els.emblem.style.color = '';
            els.emblem.style.fontSize = '';
            els.name.innerText = (sel.isGeneral ? "General · " : "") + (sel.name || "Unit");
            if(els.recordName) els.recordName.innerText = sel.name || "Unit";
            let uf = wodPeriodFlavor(wodGetMatchPeriod());
            els.type.innerText = sel.type === 'supply'?wodSupplyShipLabel():sel.type === 'transport'?wodTransportLabel()+' · '+(sel.cargo?'1/1':'0/1'):sel.type === 'ship' ? uf.ship
                : (sel.type === 'heavy' ? uf.heavy
                    : (WOD_SPECIALIST_UNITS[sel.type]?wodSpecialistLabel(sel.type):sel.type === 'light' ? uf.light
                        : (sel.type === 'marine' ? uf.marine
                            : (sel.type === 'convoy' ? (sel.convoySeaRoute ? uf.convoySea : uf.convoyLand) : sel.type + ' unit'))));
            let maxMp = sel.maxManpower || 1000;
            els.hp.innerText = sel.type === 'convoy'
                ? `Trade value: $${sel.tradeValue || 150}`
                : `Manpower: ${formatPeople(sel.manpower !== undefined ? sel.manpower : maxMp)} / ${formatPeople(maxMp)}`;
            if(infoTanks) {
                if(sel.type === 'heavy') {
                    let hf = wodPeriodFlavor(wodGetMatchPeriod());
                    infoTanks.innerText = `${hf.heavyCount}: ${Math.round(sel.tanks || 0)} / ${sel.maxTanks || 500}`;
                    infoTanks.style.display = '';
                    infoTanks.setAttribute('aria-hidden', 'false');
                } else if(sel.type==='motorized'){
                    const gear=wodMotorizedEquipment(sel);infoTanks.innerText=gear.label+': '+Math.round(gear.count)+' / '+gear.capacity;
                    infoTanks.style.display='';infoTanks.setAttribute('aria-hidden','false');
                } else {
                    infoTanks.innerText = '';
                    infoTanks.style.display = 'none';
                    infoTanks.setAttribute('aria-hidden', 'true');
                }
            }
            let fighting = sel.damage > 0 && (sel.activeCombatVisual || 0) > 0.04;
            els.action.innerText = sel.type === 'convoy'
                ? (sel.owner === lo ? "Your trade convoy (cannot command)" : "Enemy trade convoy (view only)")
                : (sel.owner !== lo
                    ? ("Enemy (view only) · " + (sel.moraleBroken ? "Routed — retreating"
                        : (sel.retreating ? "Retreating"
                            : (fighting ? "Fighting" : (sel.target ? "Moving" : "Idle")))))
                    : (sel.moraleBroken ? "Routed — retreating"
                        : (sel.retreating ? "Retreating"
                            : (fighting ? "Fighting"
                                : (sel.target ? "Moving" : "Idle")))));
            wodSyncInfoCardKpis(sel, els.action.innerText);
            document.querySelectorAll('#infoCard .info-order-btn[data-mo="retreat"]').forEach(btn => {
                let on = !!(sel.owner === lo && sel.retreating && !sel.moraleBroken);
                btn.classList.toggle('active', on);
            });
            if(infoMorale) {
                if(sel.type === 'convoy') infoMorale.innerText = "";
                else {
                    const cap=WOD_MORALE_MAX*wodGeneralStatMultiplier(sel),morale=sel.morale??WOD_MORALE_MAX;
                    infoMorale.innerText = `Morale ${Math.round(morale/cap*100)}% (${Math.round(morale)} / ${Math.round(cap)})` + (sel.moraleBroken ? " • ROUT" : "");
                }
            }
            let effects = getUnitEffects(sel);
            wodSetInfoEffectsHtml(els, effects.length
                ? effects.map(wodFmtInfoEffectMarkup).join('')
                : '<span class="effect-pill effect-pill--block">No active effects listed for this hex.</span>');
            wodSyncInfoCardServiceRecord(sel);
        }
        if(els.rename) {
            let canRename = sel.owner === lo && (sel.id || sel.hp !== undefined);
            els.rename.hidden = !canRename;
        }
        let movablePick = gameData.selection.filter(s => s.hp !== undefined && !s.id && s.type !== 'convoy' && s.owner === lo);
        els.card.classList.toggle('info-card--mobile-orders', gameState === 'PLAYING' && movablePick.length > 0);
        els.card.classList.remove('info-card--multi');
        wodApplyInfoCardPage();
    } else if(gameData.selection.length > 1) {
        if(prevLen !== gameData.selection.length || prevUid !== '') {
            if(typeof wodCloseOpenGameMenusOnUnitSelect === 'function')
                wodCloseOpenGameMenusOnUnitSelect();
            wodResetInfoCardPage();
            if(typeof toggleInfoCardMore === 'function') toggleInfoCardMore(false);
        }
        syncInfoCardPanel._lastSelLen = gameData.selection.length;
        syncInfoCardPanel._lastSelUid = '';
        els.card.classList.add('visible');
        if(els.veteranBadge) els.veteranBadge.hidden = true;
        let movablePick = gameData.selection.filter(s => s.hp !== undefined && !s.id && s.type !== 'convoy' && s.owner === lo);
        els.card.classList.toggle('info-card--mobile-orders', gameState === 'PLAYING' && movablePick.length > 0);
        els.card.classList.add('info-card--multi');
        els.emblem.innerText = "×" + gameData.selection.length;
        els.emblem.style.background = '#f1c40f';
        if(_infoCardPageIndex === 0) wodSetInfoEffectsHtml(els, '');
        els.name.innerText = "Multiple Selected";
        els.type.innerText = gameData.selection.length + " Items";
        els.hp.innerText = "";
        els.action.innerText = "Group";
        if(els.kpiPersonnel) {
            let mpSum = 0, hpSum = 0, hpMax = 0;
            let pool = movablePick.length ? movablePick : gameData.selection;
            for(let s of pool) {
                if(s.hp === undefined || s.id) continue;
                mpSum += (s.manpower !== undefined ? s.manpower : (s.maxManpower || 0));
                hpSum += s.hp || 0;
                hpMax += s.maxHp || 0;
            }
            els.kpiPersonnel.innerText = mpSum ? formatPeople(mpSum) : String(gameData.selection.length);
            els.kpiCondition.innerText = hpMax > 0 ? (Math.round((hpSum / hpMax) * 100) + '%') : '—';
            els.kpiTerrain.innerText = 'Mixed';
            if(els.statusDot) els.statusDot.className = 'info-status-dot is-busy';
        }
        document.querySelectorAll('#infoCard .info-order-btn[data-mo="retreat"]').forEach(btn => {
            let on = movablePick.some(u => u && u.owner === lo && u.retreating && !u.moraleBroken);
            btn.classList.toggle('active', on);
        });
        if(infoMorale) infoMorale.innerText = "";
        if(infoTanks) { infoTanks.innerText = ''; infoTanks.style.display = 'none'; infoTanks.setAttribute('aria-hidden', 'true'); }
        if(els.rename) els.rename.hidden = true;
        wodApplyInfoCardPage();
    } else {
        wodResetInfoCardPage();
        if(typeof toggleInfoCardMore === 'function') toggleInfoCardMore(false);
        syncInfoCardPanel._lastSelLen = 0;
        syncInfoCardPanel._lastSelUid = '';
        els.card.classList.remove('visible');
        if(els.veteranBadge) els.veteranBadge.hidden = true;
        if(infoMorale) infoMorale.innerText = "";
        if(infoTanks) { infoTanks.innerText = ''; infoTanks.style.display = 'none'; infoTanks.setAttribute('aria-hidden', 'true'); }
        if(els.rename) els.rename.hidden = true;
        els.card.classList.remove('info-card--mobile-orders');
        els.card.classList.remove('info-card--multi');
        wodSyncInfoCardKpis(null);
    }
}
function syncInfoCardPanelThrottled() {
    wodRefreshCommandHud();
    let sel = gameData.selection;
    let now = performance.now();
    let sig;
    if(sel.length === 1) {
        let s = sel[0];
        sig = '1|' + (s.id || '') + '|' + (s.uid || '') + '|' + (s.name || '') + '|' + (s.type || '') + '|' + Math.floor((s.hp || 0) / 3)
            + '|' + Math.floor((s.morale || 0) / 2) + '|' + Math.floor((s.manpower || 0) / 35) + '|' + ((s.activeCombatVisual || 0) > 0.04 ? 1 : 0)
            + '|' + (s.convoySeaRoute ? 1 : 0) + '|' + ((s.encircledFlash || 0) > 0 ? 1 : 0)
            + '|' + ((s.healingFlash || 0) > 0 ? 1 : 0) + '|' + (s.type === 'heavy' ? Math.floor((s.tanks || 0) / 3) : '')
            + '|xp:' + Math.floor(s.xp || 0) + '|k:' + Math.floor((s.kills || 0) / 5) + '|l:' + Math.floor((s.losses || 0) / 5)
            + '|v:' + (wodIsUnitVeteran(s) ? 1 : 0) + '|pg:' + _infoCardPageIndex;
        if(!s.id && s.hp !== undefined) {
            let hx = getNearestHexToPoint(s.x, s.y);
            sig += '|h:' + (hx ? `${hx.q},${hx.r},${hx.type}` : 'none') + '|w:' + (s.inWater ? 1 : 0) + '|a:' + (s.amphibInWater ? 1 : 0);
            sig += '|f:' + (wodFortDefenseDamageMultiplier(s) < 1 ? '1' : '0')
                + '|e:' + ((hx && wodGetUnitEncirclementState(s, hx)) ? '1' : '0');
            if(hx && s.type !== 'convoy') {
                sig += '|td:' + Math.round(getTerrainAttackModifier(s, hx) * 100) + ':' + Math.round(getTerrainDefenseModifier(s, hx) * 100);
                sig += '|spd:' + Math.round(getUnitSpeedMultiplier(s) * wodFortEnemyMovementSlowdownMultiplier(s) * 100);
            }
        }
    } else sig = 'n|' + sel.length;
    if(sig === _infoCardUiThrottle.s && now - _infoCardUiThrottle.t < (wodUsesVisualViewportLayout() ? 165 : 95)) return;
    _infoCardUiThrottle.s = sig;
    _infoCardUiThrottle.t = now;
    syncInfoCardPanel();
}
let wodToastTimer=0;
function showNotification(msg,tone='warning') {
    if(wodEscMenuOpen() || wodMissionPopupOpen() || !msg) return;
    // Repeated errors used to stack directly on top of one another.
    let el=document.querySelector('.wod-toast-note');
    if(!el){el=document.createElement('div');el.className='wod-toast-note';document.body.appendChild(el);}
    el.dataset.tone=tone;el.setAttribute('role',tone==='warning'?'alert':'status');el.textContent=msg;
    clearTimeout(wodToastTimer);wodToastTimer=setTimeout(()=>el.remove(),3500);
}
// The skull beside a unit's name on its card disbands it: a first press arms it (red for three seconds), a second press
// disbands. Only the player's own units, not convoys or a loaded transport.
let _wodDisbandArm = null;
function wodDisbandableUnit(u) {
    return !!u && !u.id && u.hp > 0 && u.type !== 'convoy' && u.owner === wodLocalPlayerOwner() && !gameData._spectator && gameState === 'PLAYING';
}
function wodDisarmDisband() {
    if(_wodDisbandArm) { clearTimeout(_wodDisbandArm.timer); _wodDisbandArm = null; }
    const b = document.getElementById('infoDisband');
    if(b) { b.classList.remove('is-armed'); b.title = 'Disband this unit'; b.setAttribute('aria-label', 'Disband unit'); }
}
function wodSyncDisbandButton(sel) {
    const b = document.getElementById('infoDisband');
    if(!b) return;
    const ok = gameData.selection.length === 1 && wodDisbandableUnit(sel);
    b.hidden = !ok;
    if(!ok || (_wodDisbandArm && _wodDisbandArm.uid !== sel.uid)) wodDisarmDisband();
}
function wodDisbandSelected() {
    if(gameData.selection.length !== 1) return;
    const u = gameData.selection[0];
    if(!wodDisbandableUnit(u)) return;
    if(u.cargo) { showNotification('Unload the transport before disbanding it.'); return; }
    const uid = ensureUnitId(u), name = u.name || 'Unit';
    if(!_wodDisbandArm || _wodDisbandArm.uid !== uid) {
        wodDisarmDisband();
        _wodDisbandArm = { uid, timer: setTimeout(wodDisarmDisband, 3000) };
        const b = document.getElementById('infoDisband');
        if(b) { b.classList.add('is-armed'); b.title = 'Click again to disband'; b.setAttribute('aria-label', 'Confirm: disband unit'); }
        showNotification('Click the skull again to disband ' + name + '.');
        return;
    }
    wodDisarmDisband();
    if(gameData.mp && gameData.mp.enabled && !gameData.mp.isHost) {
        if(gameData.mp.enabled && !wodMpMatchCanPlay()) return;
        if(wodMpSendCmd({ kind: 'disband', uids: [uid] })) showNotification(name + ' disbanded.');
        return;
    }
    if(wodDisbandUnit(u)) { showNotification(name + ' disbanded.'); _infoCardUiThrottle.s = null; }
}
function renameSelected() {
    if(gameData.selection.length !== 1) { showNotification("Select one unit or town to rename."); return; }
    let sel = gameData.selection[0];
    if(sel.owner !== wodLocalPlayerOwner()) { showNotification("You can only rename your own units and towns."); return; }
    let currentName = sel.name || (sel.id ? "Town" : "Unit");
    if(typeof window.wodShowNameInputDialog !== 'function') return;
    window.wodShowNameInputDialog({
        title: sel.id ? 'Rename town' : 'Rename unit',
        hint: sel.id ? 'Town name shown on the map and city labels.' : 'Unit name shown on the map and unit card.',
        label: 'Display name',
        defaultValue: currentName,
        confirmLabel: 'Apply',
        maxLength: 32,
        requireNonEmpty: 'Name cannot be empty.'
    }).then(nextName => {
        if(nextName == null) return;
        nextName = String(nextName).trim();
        if(nextName.length === 0) { showNotification('Name cannot be empty.'); return; }
        sel.name = nextName.slice(0, 32);
        sel.nameCustom = true;
        if(sel._campRosterId) {
            let camp = typeof wodRogueLoad === 'function' ? wodRogueLoad() : null;
            if(camp && Array.isArray(camp.roster)) {
                let rosterUnit = camp.roster.find(r => r && r.id === sel._campRosterId);
                if(rosterUnit) {
                    rosterUnit.name = sel.name;
                    if(typeof wodRogueSave === 'function') wodRogueSave();
                }
            }
        }
        _infoCardUiThrottle.s = null;
        syncInfoCardPanel();
    });
}
// Game guide (main menu panel). returnTo is a panel id for showPanel; empty means the main menu.
// The panel remembers it in data-return-to, which showPanel('helpGuide') sets.
function wodOpenHelpGuide(returnTo, section) {
    showPanel('helpGuide', { helpReturnTo: typeof returnTo === 'string' ? returnTo : '' });
    const panel = document.getElementById('helpGuidePanel');
    const scroller = panel && panel.querySelector('.help-guide');
    if(!scroller) return;
    scroller.scrollTop = 0;
    const target = section ? document.getElementById('helpGuide-' + section) : null;
    if(target) wodHelpGuideScrollTo(target, false);
    try { scroller.focus({ preventScroll: true }); } catch(e) {}
}
/** Scroll only the guide's own scroll box (not the menus around it) so target sits under the sticky header. */
function wodHelpGuideScrollTo(target, smooth) {
    let box = target.parentElement;
    while(box && box !== document.body) {
        const overflow = getComputedStyle(box).overflowY;
        if((overflow === 'auto' || overflow === 'scroll') && box.scrollHeight > box.clientHeight + 1) break;
        box = box.parentElement;
    }
    if(!box || box === document.body) { target.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' }); return; }
    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    const top = box.scrollTop + target.getBoundingClientRect().top - box.getBoundingClientRect().top - margin;
    box.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
}
function wodCloseHelpGuide() {
    const panel = document.getElementById('helpGuidePanel');
    const back = panel ? panel.dataset.returnTo || '' : '';
    if(panel) panel.dataset.returnTo = '';
    if(back && back !== 'helpGuide' && back !== 'mainMenu' && document.getElementById(back + 'Panel')) showPanel(back);
    else hidePanels();
}
function wodHelpGuideOpen() {
    const panel = document.getElementById('helpGuidePanel');
    return !!(panel && !panel.classList.contains('hidden'));
}
/** Contents links: scroll the section into view inside whichever copy of the guide holds the link. */
function wodHelpGuideJump(link) {
    const id = String((link && link.getAttribute('href')) || '').replace(/^#/, '');
    const target = id ? document.getElementById(id) : null;
    if(!target) return false;
    let smooth = true;
    try { smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e) {}
    wodHelpGuideScrollTo(target, smooth);
    try { target.focus({ preventScroll: true }); } catch(e) {}
    return false;
}
/** Terrain swatches in the guide's terrain table follow the current map colors. */
function wodFillHelpTerrainSwatches() {
    for(const el of document.querySelectorAll('[data-help-swatch]')) {
        const type = el.dataset.helpSwatch;
        el.style.background = getTerrainColor(type);
        el.innerHTML = terrainSwatchArt(type);
    }
}
