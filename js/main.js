// Startup: state that needs other code, event wiring and boot, in the original order. Loads last.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

// --- Core UI & State ---
const UI = {
    mainMenu: document.getElementById('mainMenu'),
    inGameUI: document.getElementById('inGameUI'),
    canvas: document.getElementById('gameCanvas'),
    wrapper: document.getElementById('gameWrapper'),
    selectionBox: document.getElementById('selectionBox'),
    terrainKey: document.getElementById('terrainKey'),
    playerSummary: document.getElementById('playerSummary'),
    escMenu: document.getElementById('escMenu'),
    statsMenu: document.getElementById('statsMenu'),
    panels: document.querySelectorAll('.overlay:not(#mainMenu):not(#escMenu):not(#statsMenu):not(#citiesMenu):not(#campaignSummaryOverlay)'),
    citiesMenu: document.getElementById('citiesMenu')
};
// Inserting a new release at the front keeps every existing version stable.
// Integer tenths avoid floating-point gaps (1.9 is followed by 2.0).
WOD_CHANGELOG.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).forEach((entry,index,all)=>{
    const number=10+all.length-1-index;
    entry.version=Math.floor(number/10)+'.'+number%10;
});
wodInitChangelog();
window._wodDeferMusic = true;
(function wodWireChangelogPopup() {
    let closeBtn = document.getElementById('wodChangelogClose');
    let backdrop = document.getElementById('wodChangelogBackdrop');
    if(closeBtn) closeBtn.addEventListener('click', wodDismissChangelogPopup);
    if(backdrop) backdrop.addEventListener('click', wodDismissChangelogPopup);
})();
wodEnsureEscMenuDom();
window.wodSyncPcTopUiClearance = wodSyncPcTopUiClearance;
window.wodCollapsePcProductionDock = wodCollapsePcProductionDock;
window.wodCloseOpenGameMenusOnUnitSelect = wodCloseOpenGameMenusOnUnitSelect;
initPlayerSummaryToggle();
initTerrainKeyToggle();
initWodMobileHud();
wodInitStatsMobileTabs();
wodInitCitiesPanelClicks();
initWodPcProductionDock();
initWodHudDeselectOnClick();
wodSyncPcTopUiClearance();
window.addEventListener('resize', () => {
    if(typeof wodSyncPcTopUiClearance === 'function') wodSyncPcTopUiClearance();
});
if(typeof ResizeObserver === 'function') {
    let topBar = document.querySelector('#inGameUI .wod-hud-top');
    if(topBar) {
        try {
            new ResizeObserver(() => {
                if(typeof wodSyncPcTopUiClearance === 'function') wodSyncPcTopUiClearance();
            }).observe(topBar);
        } catch(_) {}
    }
}
window.toggleEscMenu = toggleEscMenu;
window.openMenuFromGame = openMenuFromGame;
window.openHelpFromGame = openHelpFromGame;
window.showEscSection = showEscSection;
// --- Game Setup ---
const canvas = UI.canvas;
const ctx = canvas.getContext('2d', { alpha: false });
let wodPowParts = new Array(WOD_POW_PARTS).fill(null);
loadUiSettingsFromStorage();
if(window.visualViewport) {
    window.visualViewport.addEventListener('resize', wodQueueVisualViewportBurst);
    window.visualViewport.addEventListener('scroll', wodQueueVisualViewportBurst);
}
window.addEventListener('resize', wodApplyVisualViewport);
window.addEventListener('orientationchange', () => {
    if(wodVvDebounceTimer) {
        clearTimeout(wodVvDebounceTimer);
        wodVvDebounceTimer = null;
    }
    setTimeout(wodSyncViewportAndCanvas, 200);
});
document.addEventListener('gesturestart', wodSuppressSafariDocumentPinch, {passive: false});
document.addEventListener('gesturechange', wodSuppressSafariDocumentPinch, {passive: false});
document.addEventListener('gestureend', wodSuppressSafariDocumentPinch, {passive: false});
window.wodCreateBrowserSaveSlot = wodCreateBrowserSaveSlot;
window.wodLoadBrowserSaveSlotBtn = wodLoadBrowserSaveSlotBtn;
window.wodDeleteBrowserSaveSlotBtn = wodDeleteBrowserSaveSlotBtn;
window.persistWodProgressNow = persistWodProgressNow;
window.wodExportSaveDownload = wodExportSaveDownload;
window.wodImportSaveFromInput = wodImportSaveFromInput;
window.wodIssueRetreatOrder = wodIssueRetreatOrder;
if(typeof window !== 'undefined') {
    window.addEventListener('beforeunload', function() {
        try {
            wodSyncLocalMatchLifetime();wodFlushLifetimeProgress();
            if(gameState === 'PLAYING' && gameData.mp && gameData.mp.enabled && typeof wodMpFlushStatsToServer === 'function')
                wodMpFlushStatsToServer();
            void wodFlushSavedMapsToDisk();
        } catch(e) {}
    });
    window.addEventListener('pagehide', function() {
        try {
            wodSyncLocalMatchLifetime();wodFlushLifetimeProgress();
            void wodFlushSavedMapsToDisk();
        } catch(e) {}
    });
}
(function wireWodNameInputDialogAndExports() {
    let dlg = document.getElementById('wodNameInputDlg');
    let fld = document.getElementById('wodNameInputFld');
    let ttl = document.getElementById('wodNameInputDlgTitle');
    let hint = document.getElementById('wodNameInputDlgHint');
    let lbl = document.getElementById('wodNameInputLbl');
    let okBtn = document.getElementById('wodNameInputOk');
    let cancelBtn = document.getElementById('wodNameInputCancel');
    let resolveFn = null;

    function finish(val) {
        let r = resolveFn;
        resolveFn = null;
        if(!dlg || !fld) return;
        dlg.classList.add('hidden');
        dlg.setAttribute('aria-hidden', 'true');
        document.removeEventListener('keydown', onKey, true);
        if(fld.type==='password')fld.value='';
        if(r) r(val);
    }

    function onKey(e) {
        if(resolveFn === null || !dlg || dlg.classList.contains('hidden')) return;
        if(e.key === 'Escape') {
            e.preventDefault();
            finish(null);
            return;
        }
        if(e.key !== 'Enter') return;
        if(e.target === cancelBtn && !e.ctrlKey) return;
        e.preventDefault();
        confirmDialog();
    }

    let lastRequireNonEmpty = false;

    function confirmDialog() {
        if(!resolveFn || !fld) return;
        let v = fld.type==='password'?String(fld.value||''):String(fld.value||'').trim();
        let maxLen = parseInt(fld.getAttribute('maxlength'), 10) || 96;
        if(v.length > maxLen) v = v.slice(0, maxLen);
        if(lastRequireNonEmpty && !v.length) {
            showNotification(typeof lastRequireNonEmpty === 'string' ? lastRequireNonEmpty : 'Enter a name first.');
            return;
        }
        finish(v.length ? v : null);
    }

    function wire() {
        if(!dlg || !fld || !ttl) return false;
        if(okBtn && !okBtn._wodWiredNameDlg) {
            okBtn._wodWiredNameDlg = true;
            okBtn.addEventListener('click', confirmDialog);
        }
        if(cancelBtn && !cancelBtn._wodWiredNameDlg) {
            cancelBtn._wodWiredNameDlg = true;
            cancelBtn.addEventListener('click', () => finish(null));
        }
        if(!dlg._wodWiredBackdrop) {
            dlg._wodWiredBackdrop = true;
            dlg.addEventListener('click', (ev) => {
                if(ev.target === dlg) finish(null);
            });
        }
        return true;
    }

    window.wodShowNameInputDialog = function (opts) {
        opts = opts || {};
        return new Promise(resolve => {
            if(!wire() || !dlg || !fld) {
                resolve(null);
                return;
            }
            if(resolveFn)finish(null);
            resolveFn = resolve;
            fld.type=opts.inputType==='password'?'password':'text';
            fld.setAttribute('autocomplete',fld.type==='password'?'current-password':'off');
            lastRequireNonEmpty = opts.requireNonEmpty === true ? true : opts.requireNonEmpty || false;
            ttl.textContent = opts.title || 'Name this save';
            if(hint) {
                let htxt = opts.hint != null ? String(opts.hint) : '';
                hint.textContent = htxt;
                hint.style.display = htxt ? '' : 'none';
            }
            if(lbl) lbl.textContent = opts.label || 'Name';
            if(okBtn) okBtn.textContent = opts.confirmLabel || 'Save';
            let maxLen = opts.maxLength != null ? opts.maxLength : 96;
            fld.setAttribute('maxlength', String(Math.max(1, Math.min(200, maxLen))));
            fld.value = opts.defaultValue != null ? String(opts.defaultValue) : '';
            dlg.classList.remove('hidden');
            dlg.setAttribute('aria-hidden', 'false');
            document.addEventListener('keydown', onKey, true);
            setTimeout(() => {
                try {
                    fld.focus();
                    fld.select();
                } catch (e2) {}
            }, 48);
        });
    };

    wire();
})();
window.wodShowConfirmDialog = wodShowConfirmDialog;
window.wodGetSavedMapsList = wodGetSavedMapsList;
window.wodSaveMapToLibraryWithName = wodSaveMapToLibraryWithName;
window.wodDeleteSavedMapById = wodDeleteSavedMapById;
window.wodMapDataToThumbnailDataUrl = wodMapDataToThumbnailDataUrl;
window.wodSavedMapThumbUrl = wodSavedMapThumbUrl;
document.addEventListener('visibilitychange', () => {
    if(document.hidden) pauseMenuBackgroundBattleVisibility();
    else resumeMenuBackgroundBattleVisibility();
});
let terrainCanvas = document.createElement('canvas');
let terrainCtx = terrainCanvas.getContext('2d', {alpha: false});
let terrainBaseCanvas = document.createElement('canvas');
let terrainBaseCtx = terrainBaseCanvas.getContext('2d', {alpha: false});
const WOD_ANCIENT_CIV_SKIN_IDS = (typeof globalThis !== 'undefined' && globalThis.WOD_ANCIENT_CIV_SKIN_IDS)
    ? globalThis.WOD_ANCIENT_CIV_SKIN_IDS.slice()
    : ['civRome', 'civCarthage', 'civGaul'];
const WOD_ANCIENT_CIV_PACK_IDS = (typeof globalThis !== 'undefined' && globalThis.WOD_ANCIENT_CIV_PACK_IDS)
    ? globalThis.WOD_ANCIENT_CIV_PACK_IDS.slice()
    : ['civRome', 'civCarthage', 'civGaul'];
const WOD_SHOP_PURCHASABLE_SECTIONS = {
    standard: ['napoleonic', 'medieval', 'ancient'],
    ancientCiv: WOD_ANCIENT_CIV_PACK_IDS.slice(),
    countryballs: WOD_COUNTRYBALL_SKIN_IDS.slice(),
    ruse: WOD_RUSE_SKIN_IDS.slice()
};
let wodMissionDataCache = Object.create(null);
window.wodOpenSkirmishSetup = wodOpenSkirmishSetup;
window.wodBackFromSkirmishSetup = wodBackFromSkirmishSetup;
window.wodRogueRosterRename = wodRogueRosterRename;
window.wodRogueRosterDelete = wodRogueRosterDelete;
window.wodRefreshCampaignPanel = wodRefreshCampaignPanel;
let wodShopMapDataCache = Object.create(null);
window.wodOpenInfoStatsPage = wodOpenInfoStatsPage;
window.wodOpenInfoTerrainPage = wodOpenInfoTerrainPage;
window.wodOpenInfoOverviewPage = wodOpenInfoOverviewPage;
window.setMobileOrderMode = setMobileOrderMode;
window.toggleMobileOrderMode = toggleMobileOrderMode;
window.wodIsMobileOrderModeArmed = wodIsMobileOrderModeArmed;
window.toggleInfoCardMore = toggleInfoCardMore;
window.deselectAllSelection = deselectAllSelection;
canvas.addEventListener('mousedown', (e) => {
    if (gameState !== 'PLAYING') return;
    if(performance.now() < wodSuppressCanvasMouseUntil) {
        e.preventDefault();
        return;
    }
    let worldPos = getMouseWorldPos(e);
    let local = wodClientToCanvasLocal(e.clientX, e.clientY);
    let cx = local.x;
    let cy = local.y;

    if(gameData.buildMode === 'bridge' && gameData.bridgePlacement && (e.button === 0 || e.button === 2)) {
        // The bridge tool owns both buttons: left drags the span from bank to bank, right
        // cancels. A right-drag still pans the map; selected units take no orders meanwhile.
        e.preventDefault();
        if(e.button === 0) { wodBridgeDragBegin(worldPos); return; }
        const bp = gameData.bridgePlacement;
        bp.rightDown = { x: e.clientX, y: e.clientY, cancelledDrag: !!(bp.dragging || bp.anchored) };
        if(bp.rightDown.cancelledDrag) wodBridgeDragCancel();
        isPanning = true;
        panStart = {x: e.clientX, y: e.clientY};
        cameraStart = {x: gameData.camera.x, y: gameData.camera.y};
        return;
    }

    if (e.button === 0) {
        const movers=getMovableSelectedUnits(),picked=pickInspectableUnitAt(worldPos);
        if(!gameData.buildMode&&!e.shiftKey&&!e.altKey&&movers.length&&picked&&wodIsHostileOwner(picked.owner,wodLocalPlayerOwner())&&wodIssuePreferredTarget(picked)){e.preventDefault();return;}
        if(!gameData.buildMode&&movers.length&&(wodIsMobileOrderModeArmed()||(e.shiftKey&&(!picked||picked.owner!==wodLocalPlayerOwner())))) {
            leftMapOrderDrag={active:true,mode:e.shiftKey?'waypoint':mobileOrderMode,startWorld:{...worldPos}};
            formationDrag.active=true;formationDrag.startWorld={...worldPos};formationDrag.endWorld={...worldPos};
            e.preventDefault();return;
        }
        let strokeHit = null;
        let lo = wodLocalPlayerOwner();
        if(!e.shiftKey) {
            for(let u of gameData.entities) {
                if(u.owner !== lo || u.hp <= 0 || u.type === 'convoy') continue;
                let dx = worldPos.x - u.x;
                let dy = worldPos.y - u.y;
                if(dx * dx + dy * dy < Math.pow((u.radius || 10) * 1.68, 2)) {
                    strokeHit = u;
                    break;
                }
            }
        }
        if(strokeHit && strokeHit.selected && getMovableSelectedUnits().length > 0) {
            pathOrderStroke.active = true;
            pathOrderStroke.pts = [{x: worldPos.x, y: worldPos.y}];
            pathOrderStroke.moved = false;
            gameData.pathStrokePreview = [{x: worldPos.x, y: worldPos.y}];
            return;
        }

        isDragging = true;
        dragStart = {x: cx, y: cy};
        dragStartClient = { x: e.clientX, y: e.clientY };
        wodShowSelectionBoxAtClient(e.clientX, e.clientY);

        if(!e.shiftKey) {
            gameData.selection.forEach(s => s.selected = false);
            gameData.selection = [];
        }
    } else if (e.button === 2 && (e.shiftKey||mobileOrderMode==='waypoint') && getMovableSelectedUnits().length > 0) {
        shiftWaypointDrag.active = true;
        shiftWaypointDrag.startClient = {x: cx, y: cy};
        shiftWaypointDrag.startWorld = {x: worldPos.x, y: worldPos.y};
        formationDrag.active = true;
        formationDrag.startWorld = {x: worldPos.x, y: worldPos.y};
        formationDrag.endWorld = {x: worldPos.x, y: worldPos.y};
    } else if (e.button === 2 && getMovableSelectedUnits().length > 0) {
        formationDrag.active = true;
        formationDrag.startWorld = worldPos;
        formationDrag.endWorld = worldPos;
    } else if (e.button === 1 || e.button === 2) {
        isPanning = true;
        panStart = {x: e.clientX, y: e.clientY};
        cameraStart = {x: gameData.camera.x, y: gameData.camera.y};
    }
});
canvas.addEventListener('mousemove', (e) => {
    if (isDragging) {
        let local = wodClientToCanvasLocal(e.clientX, e.clientY);
        let cx = local.x;
        let cy = local.y;
        wodUpdateSelectionBoxClients(dragStartClient.x, dragStartClient.y, e.clientX, e.clientY);
    } else if(pathOrderStroke.active) {
        let w = getMouseWorldPos(e);
        let last = pathOrderStroke.pts[pathOrderStroke.pts.length - 1];
        let dx = w.x - last.x;
        let dy = w.y - last.y;
        if(dx * dx + dy * dy > 110) {
            pathOrderStroke.pts.push(w);
            pathOrderStroke.moved = true;
            wodRefreshPathStrokePreview();
        }
    } else if (formationDrag.active) {
        formationDrag.endWorld = getMouseWorldPos(e);
    } else if (isPanning) {
        let dx = e.clientX - panStart.x;
        let dy = e.clientY - panStart.y;
        wodApplyScreenPanDelta(dx, dy);
    } else if(gameState === 'PLAYING' && gameData.buildMode === 'bridge' && gameData.bridgePlacement) {
        wodBridgeDragMove(getMouseWorldPos(e));
    }
});
canvas.addEventListener('mouseup', (e) => {
    if(gameState !== 'PLAYING') return;
    if(performance.now() < wodSuppressCanvasMouseUntil) {
        e.preventDefault();
        return;
    }
    if(gameData.buildMode === 'bridge' && gameData.bridgePlacement) {
        const bp = gameData.bridgePlacement;
        if(e.button === 0 && bp.dragging) { wodBridgeDragEnd(getMouseWorldPos(e)); e.preventDefault(); return; }
        if(e.button === 2 && bp.rightDown) {
            // A right-click that did not pan: drop the span being dragged, or leave the tool if there was none.
            const down = bp.rightDown;
            bp.rightDown = null;
            isPanning = false;
            if(Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 && !down.cancelledDrag) exitBuildPlacementMode();
            e.preventDefault();
            return;
        }
    }
    if(e.button===0&&leftMapOrderDrag.active) {
        const order=leftMapOrderDrag,end=getMouseWorldPos(e),start=order.startWorld;
        leftMapOrderDrag.active=false;formationDrag.active=false;
        const line=getMovableSelectedUnits().length>1&&wodFormationGestureIsLine(start,end);
        if(order.mode==='waypoint') {if(line)wodCommitShiftFormationWaypoint(start,end);else wodCommitShiftWaypointAt(end);}
        else if(order.mode==='formation')issueLineFormationOrder(start,end);
        else issueMoveOrder(end);
        e.preventDefault();return;
    }
    if(e.button === 0 && pathOrderStroke.active) {
        if(pathOrderStroke.moved && pathOrderStroke.pts.length >= 2)
            issueStrokeMoveOrder(pathOrderStroke.pts);
        pathOrderStroke.active = false;
        pathOrderStroke.pts = [];
        pathOrderStroke.moved = false;
        gameData.pathStrokePreview = null;
        return;
    }
    if (e.button === 0 && isDragging) {
        isDragging = false;
        UI.selectionBox.style.display = 'none';

        let local = wodClientToCanvasLocal(e.clientX, e.clientY);
        let cx = local.x;
        let cy = local.y;

        if(Math.abs(cx - dragStart.x) < 5 && Math.abs(cy - dragStart.y) < 5) {
            let worldPos = getMouseWorldPos(e);
            if(gameData.buildMode) {
                wodHandleProductionPlacementClick(worldPos);
                return;
            }
            if(e.altKey){const inspect=pickInspectableUnitAt(worldPos);if(inspect)wodReplaceMapSelection(inspect);return;}
            if(e.shiftKey) {
                const friendly=pickInspectableUnitAt(worldPos);
                if(friendly&&friendly.owner===wodLocalPlayerOwner()){wodApplyMapSelection(friendly);return;}
            }
            if(wodMovableSelectionHasActiveMarch() && getMovableSelectedUnits().length > 0) {
                issueMoveOrder(worldPos);
                return;
            }
            let pickSel = wodPickCityOrUnitForMapSelection(worldPos);
            if(pickSel.city) { wodApplyMapSelection(pickSel.city); return; }
            if(pickSel.unit) { wodApplyMapSelection(pickSel.unit); return; }
        } else {
            const worldL = (Math.min(cx, dragStart.x) + gameData.camera.x) / gameData.camera.zoom;
            const worldR = (Math.max(cx, dragStart.x) + gameData.camera.x) / gameData.camera.zoom;
            const worldT = (Math.min(cy, dragStart.y) + gameData.camera.y) / gameData.camera.zoom;
            const worldB = (Math.max(cy, dragStart.y) + gameData.camera.y) / gameData.camera.zoom;

            let lo = wodLocalPlayerOwner();
            let batch = [];
            for(let unit of gameData.entities) {
                if(unit.owner === lo && unit.x >= worldL && unit.x <= worldR && unit.y >= worldT && unit.y <= worldB)
                    batch.push(unit);
            }
            if(batch.length) wodApplyMapSelectionBatch(batch);
        }
    } else if (e.button === 2 && shiftWaypointDrag.active) {
        shiftWaypointDrag.active = false;
        formationDrag.active = false;
        let endWorld = getMouseWorldPos(e);
        let startWorld = shiftWaypointDrag.startWorld || endWorld;
        if(getMovableSelectedUnits().length > 1 && wodFormationGestureIsLine(startWorld,endWorld))
            wodCommitShiftFormationWaypoint(startWorld, endWorld);
        else if(getMovableSelectedUnits().length > 0)
            wodCommitShiftWaypointAt(endWorld);
    } else if (e.button === 2 && formationDrag.active) {
        let endWorld = getMouseWorldPos(e);
        formationDrag.endWorld = endWorld;
        if(mobileOrderMode==='formation'||getMovableSelectedUnits().length > 1 && wodFormationGestureIsLine(formationDrag.startWorld,endWorld)) {
            issueLineFormationOrder(formationDrag.startWorld, formationDrag.endWorld);
        } else {
            issueMoveOrder(formationDrag.endWorld);
        }
        formationDrag.active = false;
    } else if ((e.button === 1 || e.button === 2) && isPanning) {
        isPanning = false;
    }
});
window.addEventListener('mouseup',e=>{
    if(e.target===canvas)return;
    // A bridge drag released outside the map is dropped.
    wodBridgeDragAbort();
    if(gameData.bridgePlacement)gameData.bridgePlacement.rightDown=null;
    leftMapOrderDrag.active=false;shiftWaypointDrag.active=false;formationDrag.active=false;isDragging=false;isPanning=false;
    pathOrderStroke.active=false;gameData.pathStrokePreview=null;if(UI.selectionBox)UI.selectionBox.style.display='none';
});
canvas.addEventListener('touchstart', (e) => {
    if(gameState !== 'PLAYING') return;
    if(e.touches.length === 2) {
        e.preventDefault();
        wodNoteCanvasTouchInteraction();
        wodCancelMobileNavTouch();
        wodMobileOrderGesture = null;
        let t0 = e.touches[0], t1 = e.touches[1];
        let midX = (t0.clientX + t1.clientX) / 2, midY = (t0.clientY + t1.clientY) / 2;
        let dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        touchCamGesture = {
            lastDist: Math.max(24, dist),
            lastMidX: midX,
            lastMidY: midY,
            latestPinch: null,
            rafArm: false
        };
        wodBumpCamInteract(140);
        if(isDragging) {
            isDragging = false;
            UI.selectionBox.style.display = 'none';
        }
        pathOrderStroke.active = false;
        gameData.pathStrokePreview = null;
        shiftWaypointDrag.active = false;
        formationDrag.active = false;
        isPanning = false;
        gameTouchTrackId = null;
        // A second finger turns a bridge drag into a pinch: drop the span, keep the tool open.
        wodBridgeDragAbort();
        return;
    }
    if(e.touches.length !== 1) return;
    e.preventDefault();
    wodNoteCanvasTouchInteraction();
    wodRefreshInputRect();
    let touch = e.touches[0];
    gameTouchTrackId = touch.identifier;
    let worldPos = getWorldPosFromClientXY(touch.clientX, touch.clientY);
    let local = wodClientToCanvasLocal(touch.clientX, touch.clientY);
    let cx = local.x;
    let cy = local.y;

    if(gameData.buildMode === 'bridge' && gameData.bridgePlacement) {
        // One finger drags the bridge from bank to bank (or taps each bank in turn);
        // two fingers still pan and zoom the map.
        wodCancelMobileNavTouch();
        wodBridgeDragBegin(worldPos);
        return;
    }

    if(mobileOrderMode === 'formation' && getMovableSelectedUnits().length > 0) {
        wodCancelMobileNavTouch();
        formationDrag.active = true;
        formationDrag.startWorld = worldPos;
        formationDrag.endWorld = worldPos;
        return;
    }

    let strokeHit = null;
    let loStroke = wodLocalPlayerOwner();
    for(let u of gameData.entities) {
        if(u.owner !== loStroke || u.hp <= 0 || u.type === 'convoy') continue;
        let dx = worldPos.x - u.x;
        let dy = worldPos.y - u.y;
        if(dx * dx + dy * dy < Math.pow((u.radius || 10) * 1.68, 2)) {
            strokeHit = u;
            break;
        }
    }
    if(mobileOrderMode === 'move' && strokeHit && strokeHit.selected && getMovableSelectedUnits().length > 0) {
        wodCancelMobileNavTouch();
        pathOrderStroke.active = true;
        pathOrderStroke.pts = [{x: worldPos.x, y: worldPos.y}];
        pathOrderStroke.moved = false;
        gameData.pathStrokePreview = [{x: worldPos.x, y: worldPos.y}];
        return;
    }

    if(wodUsesVisualViewportLayout() && (mobileOrderMode === 'move' || mobileOrderMode === 'waypoint') && getMovableSelectedUnits().length > 0 && (mobileOrderMode === 'waypoint' || !pickAnyUnitAt(worldPos))) {
        wodCancelMobileNavTouch();
        wodMobileOrderGesture = { startClientX: touch.clientX, startClientY: touch.clientY };
        return;
    }

    wodCancelMobileNavTouch();
    wodMobileNavTouch = {
        startClientX: touch.clientX,
        startClientY: touch.clientY,
        startCx: cx,
        startCy: cy,
        phase: 'pending',
        armedSelect: false,
        timer: null
    };
    wodMobileNavTouch.timer = setTimeout(() => {
        if(!wodMobileNavTouch || wodMobileNavTouch.phase !== 'pending') return;
        wodMobileNavTouch.armedSelect = true;
    }, 400);
}, {passive: false});
canvas.addEventListener('touchmove', (e) => {
    if(gameState !== 'PLAYING') return;
    if(e.touches.length >= 2 && touchCamGesture) {
        e.preventDefault();
        let t0 = e.touches[0], t1 = e.touches[1];
        let midX = (t0.clientX + t1.clientX) / 2, midY = (t0.clientY + t1.clientY) / 2;
        let dist = Math.max(24, Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY));
        touchCamGesture.latestPinch = {dist, midX, midY};
        wodSchedulePinchCameraFrame();
        return;
    }
    if(e.touches.length !== 1 || gameTouchTrackId === null) return;
    let touch = e.touches[0];
    if(touch.identifier !== gameTouchTrackId) return;
    e.preventDefault();
    wodRefreshInputRect();
    if(pathOrderStroke.active) {
        let w = getWorldPosFromClientXY(touch.clientX, touch.clientY);
        let last = pathOrderStroke.pts[pathOrderStroke.pts.length - 1];
        let dx = w.x - last.x;
        let dy = w.y - last.y;
        if(dx * dx + dy * dy > 110) {
            pathOrderStroke.pts.push(w);
            pathOrderStroke.moved = true;
            wodRefreshPathStrokePreview();
        }
    } else if(formationDrag.active) {
        formationDrag.endWorld = getWorldPosFromClientXY(touch.clientX, touch.clientY);
    } else if(gameData.buildMode === 'bridge' && gameData.bridgePlacement) {
        wodBridgeDragMove(getWorldPosFromClientXY(touch.clientX, touch.clientY));
    } else if(isPanning && wodUsesVisualViewportLayout()) {
        let dx = touch.clientX - panStart.x;
        let dy = touch.clientY - panStart.y;
        wodApplyScreenPanDelta(dx, dy);
    } else if(wodMobileOrderGesture) {
        let g = wodMobileOrderGesture;
        let mdx = touch.clientX - g.startClientX;
        let mdy = touch.clientY - g.startClientY;
        if(Math.hypot(mdx, mdy) >= (mobileOrderMode==='waypoint'?4:24)) {
            if(mobileOrderMode === 'waypoint' && getMovableSelectedUnits().length > 1) {
                let start = getWorldPosFromClientXY(g.startClientX, g.startClientY);
                let now = getWorldPosFromClientXY(touch.clientX, touch.clientY);
                wodMobileOrderGesture = null;
                shiftWaypointDrag.active = true;
                shiftWaypointDrag.startWorld = { x: start.x, y: start.y };
                formationDrag.active = true;
                formationDrag.startWorld = { x: start.x, y: start.y };
                formationDrag.endWorld = { x: now.x, y: now.y };
            } else {
                wodMobileOrderGesture = null;
                isPanning = true;
                panStart = { x: touch.clientX, y: touch.clientY };
                cameraStart = { x: gameData.camera.x, y: gameData.camera.y };
                wodBumpCamInteract(140);
            }
        }
    } else if(wodMobileNavTouch && wodUsesVisualViewportLayout()) {
        let g = wodMobileNavTouch;
        let mdx = touch.clientX - g.startClientX;
        let mdy = touch.clientY - g.startClientY;
        let dist = Math.hypot(mdx, mdy);
        if(g.phase === 'pending' && !g.armedSelect && dist > 14) {
            if(g.timer) { clearTimeout(g.timer); g.timer = null; }
            wodCancelMobileNavTouch();
            isPanning = true;
            panStart = { x: touch.clientX, y: touch.clientY };
            cameraStart = { x: gameData.camera.x, y: gameData.camera.y };
            wodBumpCamInteract(140);
        } else if(g.phase === 'pending' && g.armedSelect && dist > 8) {
            if(g.timer) { clearTimeout(g.timer); g.timer = null; }
            wodMobileNavTouch = null;
            gameData.selection.forEach(s => { s.selected = false; });
            gameData.selection = [];
            isDragging = true;
            dragStart = { x: g.startCx, y: g.startCy };
            dragStartClient = { x: g.startClientX, y: g.startClientY };
            wodShowSelectionBoxAtClient(g.startClientX, g.startClientY);
            wodUpdateSelectionBoxClients(g.startClientX, g.startClientY, touch.clientX, touch.clientY);
        }
    } else if(isDragging) {
        wodUpdateSelectionBoxClients(dragStartClient.x, dragStartClient.y, touch.clientX, touch.clientY);
    }
}, {passive: false});
canvas.addEventListener('touchend', (e) => {
    if(gameState !== 'PLAYING') return;
    if(e.touches.length < 2) {
        wodCancelPinchCameraRaf();
        wodFlushPendingPinchCamera();
        touchCamGesture = null;
    }
    if(e.touches.length > 0) return;
    let t = e.changedTouches[0];
    if(!t) return;
    e.preventDefault();
    finishGameTouchEnd(t);
}, {passive: false});
canvas.addEventListener('touchcancel', (e) => {
    if(gameState !== 'PLAYING') return;
    wodCancelPinchCameraRaf();
    wodFlushPendingPinchCamera();
    touchCamGesture = null;
    gameTouchTrackId = null;
    wodMobileOrderGesture = null;
    wodCancelMobileNavTouch();
    isPanning = false;
    if(pathOrderStroke.active) {
        pathOrderStroke.active = false;
        pathOrderStroke.pts = [];
        pathOrderStroke.moved = false;
        gameData.pathStrokePreview = null;
    }
    isDragging = false;
    UI.selectionBox.style.display = 'none';
    formationDrag.active = false;
    wodBridgeDragAbort();
});
canvas.addEventListener('wheel', (e) => {
    if (gameState !== 'PLAYING') return;
    // The wheel zooms as usual while the bridge tool is open: a bridge's direction now comes from the drag.
    e.preventDefault();
    wodBumpCamInteract(220);
    if(wodUsesVisualViewportLayout()) {
        if(!wodWheelBatch) wodWheelBatch = { dy: 0, lx: e.clientX, ly: e.clientY };
        wodWheelBatch.dy += e.deltaY;
        wodWheelBatch.lx = e.clientX;
        wodWheelBatch.ly = e.clientY;
        if(!wodWheelZoomRaf)
            wodWheelZoomRaf = requestAnimationFrame(wodApplyWheelZoomBatch);
        return;
    }
    const zoomFactor = 1.1;
    const oldZoom = gameData.camera.zoom;
    if (e.deltaY > 0) {
        gameData.camera.zoom = Math.max(0.1, gameData.camera.zoom / zoomFactor);
    } else {
        gameData.camera.zoom = Math.min(25.0, gameData.camera.zoom * zoomFactor);
    }

    let local = wodClientToCanvasLocal(e.clientX, e.clientY);
    let mx = local.x;
    let my = local.y;

    let worldX = (mx + gameData.camera.x) / oldZoom;
    let worldY = (my + gameData.camera.y) / oldZoom;

    gameData.camera.x = worldX * gameData.camera.zoom - mx;
    gameData.camera.y = worldY * gameData.camera.zoom - my;
});
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});
window.addEventListener('keydown', e => {
    let typingGroup = e.target?.closest?.('input, textarea, select, [contenteditable="true"]');
    let digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
    if(gameState === 'PLAYING' && digit && !typingGroup && !e.altKey && !e.metaKey && (!UI.escMenu || UI.escMenu.classList.contains('hidden'))) {
        e.preventDefault();
        if(e.ctrlKey) {
            let members = gameData.selection.filter(u => u.owner === wodLocalPlayerOwner() && u.hp > 0 && gameData.entities.includes(u) && u.type !== 'convoy');
            for(let u of members) ensureUnitId(u);
            if(!gameData.controlGroups) gameData.controlGroups = {};
            gameData.controlGroups[digit[1]] = members.map(u => u.uid);
            wodRefreshCommandHud(true);
        } else wodSelectControlGroup(digit[1]);
        return;
    }
    // Triple-backtick (```) anytime opens/closes the in-game dev menu.
    if(e.code === 'Backquote' || e.key === '`' || e.key === '~') {
        let tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        let typing = tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable);
        if(!typing && !e.ctrlKey && !e.altKey && !e.metaKey) {
            if(wodDevNoteBacktick()) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }
    }
    if(e.key === 'Escape') {
        if(wodDevMenuOpen()) {
            e.preventDefault();
            wodSetDevMenuOpen(false);
            return;
        }
        if(wodHelpGuideOpen()) {
            e.preventDefault();
            wodCloseHelpGuide();
            return;
        }
        if(gameState === 'PLAYING' && gameData.buildMode) {
            e.preventDefault();
            exitBuildPlacementMode();
            return;
        }
        if(gameState === 'PLAYING' && wodStatsMenuOpen()) {
            e.preventDefault();
            toggleWodStatsPanel(false);
            return;
        }
        if(gameState === 'PLAYING' && wodCitiesMenuOpen()) {
            e.preventDefault();
            toggleWodCitiesPanel(false);
            return;
        }
        if(gameState === 'PLAYING' && UI.escMenu && !UI.escMenu.classList.contains('hidden')) {
            e.preventDefault();
            let helpOpen = document.getElementById('helpSection') && document.getElementById('helpSection').classList.contains('visible');
            if(helpOpen) {
                for(let section of UI.escMenu.querySelectorAll('.esc-section')) section.classList.remove('visible');
            } else {
                toggleEscMenu(false);
            }
            return;
        }
        if(gameState === 'PLAYING') {
            e.preventDefault();
            toggleEscMenu();
            return;
        }
    }
    if((e.code === 'Space' || e.key === ' ') && gameState === 'PLAYING') {
        let tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        let typing = tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable);
        if(!typing && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            // Toggle pause (same as the HUD Pause control). Resume to 1×.
            setGameSpeed(gameData.speed === 0 ? 1 : 0);
            return;
        }
    }
    keys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
window.render_game_to_text = function() {
    let territory = {};
    for(let hex of gameData.hexList) {
        if(!isClaimableLand(hex) || !hex.owner) continue;
        territory[hex.owner] = (territory[hex.owner] || 0) + 1;
    }
    return JSON.stringify({
        mode: gameState, money: Math.floor(gameData.money), income: gameData.income, expenses: gameData.expenses || 0,
        manpower: Math.floor(gameData.manpower || 0), manpowerIncome: gameData.manpowerIncome || 0,
        casualties: {player: gameData.casualties || 0, enemies: gameData.enemyCasualties || 0},
        camera: gameData.camera,
        territory,
        landCells: Object.values(territory).reduce((sum, count) => sum + count, 0),
        construction: (gameData.constructionJobs || []).filter(j=>wodOwnerCanSee(wodLocalPlayerOwner(),j)),
        fog:{enabled:wodFogActive(),visible:gameData._fogVisible?.size||0,explored:gameData._fogExplored?.size||0},
        battleTime:wodBattleLedger().seconds,
        attrition:Object.fromEntries(['attritionPersonnelLost','attritionArmorLost','attritionUnitsLost','attritionVesselsLost'].map(k=>[k,wodBattleLedger().byOwner[wodLocalPlayerOwner()]?.[k]||0])),
        controlGroups: gameData.controlGroups || {},
        mission:gameData.mission?{title:gameData.mission.title,packId:gameData._selectedMissionEntry?.packId||null,stage:gameData._selectedMissionEntry?.stageIndex!=null?gameData._selectedMissionEntry.stageIndex+1:null,objective:gameData.mission.objective||null,elapsed:Math.floor(gameData._missionRuntime?.elapsed||0),progress:gameData._missionRuntime?.progressText||'',briefing:!!gameData._missionRuntime?.popupOpen}:null,
        audio: window.wodBattleAudio?.debug(),
        cities: gameData.cities.filter(wodFogCanSeeCity).map(c => ({id: c.id, owner: c.owner, factory: !!c.hasFactory, harbor: !!c.hasHarbor, farm: !!c.hasFarm})),
        units: gameData.entities.filter(wodFogCanSeeUnit).map(e => ({type: e.type, owner: e.owner, x: Math.round(e.x), y: Math.round(e.y), hp: e.hp, morale:e.morale, moraleCap:e.maxMorale, routing:!!e.moraleBroken, baseSpeed:wodUnitBaseSpeed(e)/WOD_UNIT_BASE_SPEED, speedMultiplier:getUnitSpeedMultiplier(e), preferredTarget:e.preferredTargetUid||null, attackOrder:e._wodAttackOrder?.uid||null, approachingTarget:!!e._wodAttackApproaching, outOfSupplySeconds:Math.round((e.outOfSupplySeconds||0)*10)/10, group: e.aiTfJobId, role: e.aiTfKind, combatTarget:e.combatTargetUid||null, deployment: e._startDeployment})),
        ui: {
            selectionCount: gameData.selection.length,
            mobileOrderMode: mobileOrderMode || null,
            infoCardPage: _infoCardPageIndex,
            layers: {
                cities: !!gameData.layers.cities,
                cityNames: !!gameData.layers.cityNames,
                units: !!gameData.layers.units
            }
        },
        gold: gameData.gold | 0,
        fps: Math.round(wodDevFps || 0),
        devMenu: wodDevMenuOpen(),
        campaign: gameData._campaignRun ? {
            nodeId: gameData._campaignRun.nodeId,
            fromNodeId: gameData._campaignRun.fromNodeId != null ? gameData._campaignRun.fromNodeId : null,
            defense: !!gameData._campaignRun.defense,
            deploying: !!gameData._campaignRun.deploying,
            holdSec: gameData._campaignRun.holdSec || 0,
            holdElapsed: Math.round(gameData._campaignRun.holdElapsed || 0)
        } : null
    });
};
window.__wodGetGameData = function() { return gameData; };
window.__wodDebug = function() {
    return {
        gameState,
        speed: gameData.speed,
        mpEnabled: !!(gameData.mp && gameData.mp.enabled),
        mpIsHost: !!(gameData.mp && gameData.mp.isHost),
        mpAllReady: !!(gameData.mp && gameData.mp.allReady),
        menuAttract: !!gameData.menuAttractMode,
        entities: gameData.entities.length,
        hexes: gameData.hexList.length,
        simTick: gameData._wodSimTick | 0,
        sepWorker: !!wodSepWorker,
        terrainLastBakeMs: wodTerrainLastBakeCostMs,
        campaignEnded: !!gameData._campaignEnded,
        playerCities: gameData.cities.filter(c => c.owner === 1).length,
        totalCities: gameData.cities.length,
        fps: Math.round(wodDevFps || 0),
        frameMs: Math.round((wodDevFrameMs || 0) * 10) / 10,
        gold: gameData.gold | 0,
        activity: wodDevActivitySnapshot()
    };
};
let wodDevActivity = Object.create(null);
wodWireDevMenuOnce();
window.advanceTime = function(ms) {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i++) {
        wodDevNoteFrame(performance.now(), 1 / 60);
        wodDevMark('update');
        update(1/60);
    }
    wodDevMark('draw');
    draw();
};
window.wodNormalizeMission = wodNormalizeMission;
window.WOD = {
    gameData,
    specialistStats:wodSpecialistStats,
    maxLobbyPlayers: WOD_MP_MAX_PLAYERS,
    maxAiOpponents: WOD_MAX_AI_OPPONENTS,
    canvas,
    factionColors,
    getTerrainColor,
    getHexesInRadius,
    pixelToHex,
    generateMap,
    previewLoadedMap,
    assignStartingCities,
    updateTerrainKey,
    setHexOwner,
    createUnitAt,
    terrainHelp,
    isWaterHex,
    isClaimableLand,
    beginHexOwnerBatch() { batchHexOwner = true; batchHexOwnerDirty = false; },
    endHexOwnerBatch() {
        batchHexOwner = false;
        if(batchHexOwnerDirty) wodMarkTerrainPoliticalDirty();
        batchHexOwnerDirty = false;
    },
    syncTerrainCacheForEditorView(over) {
        let keys = ['terrain', 'territory', 'diplomacy'];
        let prev = {};
        for(let k of keys) prev[k] = gameData.layers[k];
        let prevMode = gameData.terrainViewMode;
        for(let k of keys) if(over[k] !== undefined) gameData.layers[k] = over[k];
        if(over.terrainViewMode !== undefined) gameData.terrainViewMode = over.terrainViewMode;
        wodMarkTerrainFullDirty();
        updateTerrainCache();
        for(let k of keys) gameData.layers[k] = prev[k];
        gameData.terrainViewMode = prevMode;
        wodMarkTerrainFullDirty();
    },
    getTerrainBitmap() {
        return { img: terrainCanvas, minX: terrainBounds.minX, minY: terrainBounds.minY, width: terrainCanvas.width, height: terrainCanvas.height };
    },
    getEditorTerrainParts() {
        return {
            base: terrainBaseCanvas,
            overlay: territoryOverlayCanvas,
            borders: wodBorderLayerCanvas,
            minX: terrainBounds.minX,
            minY: terrainBounds.minY
        };
    },
    ensureEditorBorderLayer() {
        if(!wodEditorBordersDirty && wodBorderLayerCanvas && wodBorderLayerCanvas.width === terrainBaseCanvas.width && wodBorderLayerCanvas.height === terrainBaseCanvas.height)
            return;
        wodRedrawBorderLayer();
        wodEditorBordersDirty = false;
    },
    ensureEditorTerritoryOverlay() {
        if(!wodEditorOverlayDirty && territoryOverlayCanvas && territoryOverlayCanvas.width === terrainBaseCanvas.width && territoryOverlayCanvas.height === terrainBaseCanvas.height)
            return;
        drawTerritoryOverlay(terrainCtx, -terrainBounds.minX, -terrainBounds.minY);
        wodEditorOverlayDirty = false;
    },
    invalidateTerrain() {
        gameData._wodPfVer=(gameData._wodPfVer||0)+1;
        gameData._wodPfCache?.clear();
        wodMarkTerrainFullDirty();
    },
    setEditorSuppressTerrainBake(on) { wodSuppressTerrainBake = !!on; },
    patchEditorPaint(hexes, opts) { wodPatchEditorTerrain(hexes, opts || {}); },
    resizeCanvas,
    returnToMenu,
    showPanel,
    hidePanels,
    startGame,
    cityName: generateCityName,
    unitName: generateUnitName,
    makeBlankMap(size) {
        gameData.hexes = {}; gameData.hexList = []; gameData.cities = []; gameData.roads = []; gameData.entities = []; gameData.forts = []; gameData.bridges = [];
        gameData.hospitals = [];
        gameData._generalMap = null;
        gameData.loadedCustomMap = false;
        gameData.alliances = [];
        gameData.mission=null;gameData._missionRuntime=null;
        delete gameData._loadedMapGamePeriod;
        gameData.selection=[];gameData.constructionJobs=[];
        gameData.money=10000;gameData.manpower=5000;
        gameData.aiMoneyByOwner={};gameData.aiManpowerByOwner={};
        delete gameData._mapExportHadStartEconomy;
        let p = wodApplyMapSizePreset(size);
        let spacing = p.hexRadius * 1.35;
        let rows = Math.floor(p.mapRadius * p.rowsMul);
        for(let r = -rows; r <= rows; r++) {
            for(let q = -p.mapRadius; q <= p.mapRadius; q++) {
                let x = q * spacing, y = r * spacing;
                let hex = {q, r, x, y, type: 'grass', owner: 0, baseColor: getTerrainColor('grass'), renderColor: getTerrainColor('grass')};
                gameData.hexes[`${q},${r}`] = hex;
                gameData.hexList.push(hex);
            }
        }
        wodMarkTerrainFullDirty();
        updateTerrainKey();
    },
    loadMapData(mapData) {
        // Validate and detach before changing the current scenario. A bad
        // import must leave the editor and saved-library payload intact.
        if(!mapData||!Array.isArray(mapData.hexList)||!mapData.hexList.length)
            throw new Error('The file has no map cells.');
        const keys=new Set();
        for(const h of mapData.hexList) {
            if(!h||!Number.isInteger(h.q)||!Number.isInteger(h.r))throw new Error('Map cells need integer grid coordinates.');
            const key=`${h.q},${h.r}`;
            if(keys.has(key))throw new Error('The file contains duplicate map cells.');
            keys.add(key);
        }
        for(const key of ['cities','roads','entities','forts','bridges'])
            if(mapData[key]!=null&&!Array.isArray(mapData[key]))throw new Error('Invalid '+key+' list.');
        for(const c of mapData.cities||[])
            if(!c||!Number.isInteger(c.q)||!Number.isInteger(c.r)||!keys.has(`${c.q},${c.r}`))throw new Error('A town is outside the map.');
        for(const u of mapData.entities||[]) {
            if(!u||!['light','motorized','mountaineer','marine','heavy','ship','transport','supply','convoy'].includes(u.type)||!Number.isFinite(u.x)||!Number.isFinite(u.y))throw new Error('Invalid unit placement.');
            if(u.cargo&&(u.type!=='transport'||!['light','motorized','mountaineer','heavy','marine'].includes(u.cargo.type)||u.cargo.cargo||u.cargo.owner!==u.owner||!Number.isFinite(u.cargo.hp)))throw new Error('A transport can carry only one friendly land unit.');
        }
        mapData=JSON.parse(JSON.stringify(mapData,(key,value)=>key.startsWith('_')?undefined:value));
        gameData.selection=[];gameData.constructionJobs=[];gameData._missionRuntime=null;
        delete gameData.aiCommanderStyle;gameData.aiCommanderProfiles={};
        wodApplyMapSizePreset(mapData.mapSize || mapData.mapRadius || gameData.mapRadius || 60);
        gameData.mapShape = mapData.mapShape || gameData.mapShape || 'island';
        gameData.hexList = mapData.hexList || [];
        gameData.cities = mapData.cities || [];
        gameData.roads = mapData.roads || [];
        gameData.entities = mapData.entities || [];
        gameData.entities.forEach(wodNormalizeNavalStats);
        gameData.hospitals = (mapData.hospitals || []).map(h => ({...h}));
        gameData.forts = (mapData.forts || []).map(f => Object.assign({}, f));
        gameData.bridges = (mapData.bridges || []).map(b => Object.assign({},b));
        gameData.hexes = {};
        const savedRadius=Number.isFinite(mapData.hexRadius)&&mapData.hexRadius>0?mapData.hexRadius:gameData.hexRadius;
        for(let hex of gameData.hexList) {
            if(!Number.isFinite(hex.x))hex.x=hex.q*savedRadius*1.35;
            if(!Number.isFinite(hex.y))hex.y=hex.r*savedRadius*1.35;
            hex.baseColor = getTerrainColor(hex.type);
            hex.renderColor = hex.baseColor;
            if(hex.owner === undefined || hex.owner === null) hex.owner = 0;
            gameData.hexes[`${hex.q},${hex.r}`] = hex;
        }
        // Trust the DATA's grid spacing over the size preset: mission/editor maps are
        // authored at a fixed spacing, and a preset mismatch (e.g. size-40 preset says
        // hexRadius 18 but the file was built at hexRadius 20) skews every pixel→hex
        // lookup — pathfinding, terrain clamps, walkability — so units marched into
        // mountains and got stuck on the smaller mission maps.
        gameData._loadedMapHexRadius = Number.isFinite(mapData.hexRadius)&&mapData.hexRadius>0?mapData.hexRadius:null;
        for(let hex of gameData.hexList) {
            let nb = wodHexAt(hex.q + 1,hex.r);
            if(nb) {
                let sp = Math.abs(nb.x - hex.x);
                if(sp > 4) gameData._loadedMapHexRadius = sp / 1.35;
                break;
            }
        }
        if(gameData._loadedMapHexRadius) gameData.hexRadius = gameData._loadedMapHexRadius;
        gameData.bridges=gameData.bridges.map(wodNormalizeBridgeRecord).filter(Boolean);
        for(const br of gameData.bridges)wodSyncBridgeWorldCoords(br);
        wodRebuildBridgeHexIndex();
        for(const u of gameData.entities.flatMap(t=>t.cargo?[t,t.cargo]:[t])) {
            const n=/^unit_(\d+)$/.exec(u.uid||'');
            if(n)gameData.nextUnitId=Math.max(gameData.nextUnitId||0,Number(n[1]));
        }
        const ids=new Set();
        for(const u of gameData.entities.flatMap(t=>t.cargo?[t,t.cargo]:[t])) {
            if(ids.has(u.uid))delete u.uid;
            ensureUnitId(u);ids.add(u.uid);u.selected=false;
        }
        gameData.loadedCustomMap = true;
        gameData._loadedMapGamePeriod=WOD_PERIOD_IDS.includes(mapData.gamePeriod)?mapData.gamePeriod:null;
        if(gameData._loadedMapGamePeriod)
            wodApplyGamePeriod(mapData.gamePeriod,{saveProfile:false,allowAnyPeriod:true});
        if(mapData.factionColors && mapData.factionColors.length) {
            for(let i = 0; i < Math.min(mapData.factionColors.length, factionColors.length); i++)
                factionColors[i] = mapData.factionColors[i];
        }
        if(mapData.savedStartEconomy) {
            if(typeof mapData.money === 'number') gameData.money = mapData.money;
            if(typeof mapData.manpower === 'number') gameData.manpower = mapData.manpower;
            gameData.aiMoneyByOwner = Object.assign({}, mapData.aiMoneyByOwner || {});
            gameData.aiManpowerByOwner = Object.assign({}, mapData.aiManpowerByOwner || {});
            gameData._mapExportHadStartEconomy = true;
        } else delete gameData._mapExportHadStartEconomy;
        gameData.mission = wodNormalizeMission(mapData.mission);
        gameData.alliances = wodNormalizeAlliances(mapData.alliances);
        snapEditorRoadRefsToCities();
        normalizeTerrainHexes();
        wodMarkTerrainFullDirty();
        updateTerrainKey();
        if (typeof window.wodEditorAfterLoadMapData === "function") window.wodEditorAfterLoadMapData();
    },
    exportMapData() {
        let out = {
            format: 'simple-wars-map',version:1,
            mapSize: gameData.mapRadius,
            hexRadius: gameData.hexRadius,
            gamePeriod: gameData.gamePeriod||'modern',
            mapShape: gameData.mapShape || 'island',
            aiCommanderStyle:gameData.aiCommanderStyle||'varied',aiCommanderProfiles:gameData.aiCommanderProfiles||{},
            hexList: gameData.hexList,
            cities: gameData.cities,
            roads: gameData.roads,
            entities: gameData.entities,
            hospitals: (gameData.hospitals || []).map(h => ({...h})),
            forts: (gameData.forts || []).map(f => ({ id: f.id, owner: f.owner, q: f.q, r: f.r, x: f.x, y: f.y })),
            bridges: (gameData.bridges || []).map(wodStripBridgeForNet).filter(Boolean),
            factionColors: factionColors.slice(),
            savedStartEconomy: true,
            money: gameData.money,
            manpower: gameData.manpower,
            aiMoneyByOwner: Object.assign({}, gameData.aiMoneyByOwner || {}),
            aiManpowerByOwner: Object.assign({}, gameData.aiManpowerByOwner || {}),
            alliances: wodNormalizeAlliances(gameData.alliances),
        };
        if(gameData.mission)out.mission=wodNormalizeMission(gameData.mission);
        // Snapshots and saved maps must never retain live arrays or private
        // pathfinding/UI caches from the editor or an active match.
        return JSON.parse(JSON.stringify(out,(key,value)=>key.startsWith('_')?undefined:value));
    },
    rebuildEditorTradeRoutes() { rebuildEditorTradeRoutesFromCities(); },
    snapEditorRoadRefsToCities() { snapEditorRoadRefsToCities(); },
    getEditorFactionEconomy(owner) { return wodEditorFactionStats(owner); },
    normalizeAlliances: wodNormalizeAlliances,
    areAllies: wodAreAllies,
    addAlliance: wodAddAlliance,
    removeAlliance: wodRemoveAlliance,
    drawEditorUnitAtScreen(ctx, canvasX, canvasY, pxPerWorld, unit) {
        let uColor = unit.colorOverride || factionColors[unit.owner] || '#cccccc';
        let ur = Math.max(8, (unit.radius || 10) * pxPerWorld);
        ctx.save();
        ctx.translate(canvasX, canvasY);
        let drawn = (unit.type !== 'convoy'||wodHdMapActive()||wodBoardMapActive()) && drawUnitSkin(ctx, unit, ur, uColor);
        if(!drawn) {
            if(unit.type === 'convoy') {
                drawClassicUnitShape(ctx, 'convoy', ur, uColor, unit);
            } else if(wodIsNavalUnit(unit)) {
                drawClassicUnitShape(ctx, 'ship', ur, uColor, unit);
            } else if(unit.type === 'marine') {
                drawClassicUnitShape(ctx, 'marine', ur, uColor, unit);
            } else if(unit.type === 'heavy') {
                ctx.fillStyle = uColor;
                ctx.fillRect(-ur, -ur, ur * 2, ur * 2);
                ctx.strokeStyle = '#000';
                ctx.lineWidth = Math.max(1, ur * 0.12);
                ctx.strokeRect(-ur, -ur, ur * 2, ur * 2);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(ur * 1.2, 0);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.arc(0, 0, ur, 0, Math.PI * 2);
                ctx.fillStyle = uColor;
                ctx.fill();
                ctx.strokeStyle = '#000';
                ctx.lineWidth = Math.max(1, ur * 0.12);
                ctx.stroke();
            }
        }
        ctx.restore();
    },
    toggleGameplayLayer(layer) {
        toggleLayer(layer);
    },
    drawEditorCityAtScreen(ctx, sx, sy, px, city) {
        paintEditorCityScreen(ctx, sx, sy, px, city);
    },
    drawEditorFortAtScreen(ctx, sx, sy, pxPerWorld, fort) {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(pxPerWorld, pxPerWorld);
        drawFortSticker(ctx, Object.assign({}, fort, { x: 0, y: 0 }), factionColors[fort.owner] || '#2ecc71', false, null);
        ctx.restore();
    },
    placeFortAtHex, placeHospitalAtHex, wodDrawHospital,
    placeBridgeAt,
    placeBridgeSpan,
    beginBridgeBuild,
    fortAtHexKey,
    drawFortSticker,
    drawBridgeSticker,
    bootstrapMenuBackgroundBattle,
    pauseMenuBackgroundBattle,
    resumeMenuBackgroundBattle,
    wodApplyGamePeriod,
    wodRefreshPeriodSelectorVisibility,
    wodHasAnyEraSkinUnlocked,
    wodRebuildPeriodSelectEl,
    wodRebuildEditorPeriodSelectEl,
    wodListAllPeriodIds,
    getUrbanTerrainColor,
};
loadWodProgress();
wodEnsurePlayerId();
wodMpInitGlobalHandlers();
void wodMpBackgroundConnect();
wodMpApplyInviteQueryFromUrl();
applyWodProfileToGame();
wodApplySupporterFromLaunch();
wodInitBrowserSaves();
checkWodAchievements();
updateSkinShop();
wodInitShopTabs();
wodWireMissionStartButtonOnce();
wodLoadShopMapCatalog().then(() => {
    renderShopMapsTab();
    wodSyncSetupShopMapButton();
});
void wodLoadMissionCatalog();
renderAchievementsUi();
wodRefreshMainMenuOrder();
initSetupPanelBindings();
wodInitPeriodSettingsBinding();
wodSyncAllPeriodSelects();
wodApplyPeriodUiLabels();
wireShowOrdersCheckbox();
wireOrderArrowsPathfindingCheckbox();
wodSyncViewportAndCanvas();
if (new URLSearchParams(window.location.search).get('autostart') === '1') {
    let bo = document.getElementById('wodBootOverlay');
    if(bo) {
        bo.classList.add('hidden');
        bo.setAttribute('aria-busy', 'false');
    }
    startGame('ai');
} else {
    wodRunInitialBootToMenu();
}
