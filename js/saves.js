// Browser save slots and the saved-map library.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

function wodApplySaveBundle(bundle, opts) {
    opts = opts || {};
    if(!bundle || bundle.format !== 'simplewars_save') throw new Error('Not a Simple Wars save file.');
    let o = bundle.progress;
    if(!o || typeof o !== 'object') throw new Error('Save file missing progress.');
    wodProgress = wodMergeProgressObject(o);
    if(bundle.uiSettings) {
        if(typeof bundle.uiSettings.showOrdersWhenDeselected === 'boolean')
            gameData.uiSettings.showOrdersWhenDeselected = bundle.uiSettings.showOrdersWhenDeselected;
        if(typeof bundle.uiSettings.orderArrowsUsePathfinding === 'boolean')
            gameData.uiSettings.orderArrowsUsePathfinding = bundle.uiSettings.orderArrowsUsePathfinding;
        if(wodIsFrontlineStyle(bundle.uiSettings.frontlineStyle))
            gameData.uiSettings.frontlineStyle = bundle.uiSettings.frontlineStyle;
        if(wodIsCommandArrowStyle(bundle.uiSettings.commandArrowStyle))
            gameData.uiSettings.commandArrowStyle = bundle.uiSettings.commandArrowStyle;
        if(typeof bundle.uiSettings.frontlineColor === 'string')
            gameData.uiSettings.frontlineColor = bundle.uiSettings.frontlineColor === 'yellow' ? 'gold' : bundle.uiSettings.frontlineColor;
        else if(typeof bundle.uiSettings.lineColor === 'string')
            gameData.uiSettings.frontlineColor = bundle.uiSettings.lineColor === 'yellow' ? 'gold' : bundle.uiSettings.lineColor;
        if(typeof bundle.uiSettings.commandArrowColor === 'string')
            gameData.uiSettings.commandArrowColor = bundle.uiSettings.commandArrowColor === 'yellow' ? 'gold' : bundle.uiSettings.commandArrowColor;
        else if(typeof bundle.uiSettings.lineColor === 'string')
            gameData.uiSettings.commandArrowColor = bundle.uiSettings.lineColor === 'yellow' ? 'gold' : bundle.uiSettings.lineColor;
        if(typeof bundle.uiSettings.mapSkin === 'string')
            gameData.uiSettings.mapSkin = bundle.uiSettings.mapSkin;
        wodEnsureUiShopDefaults();
        saveUiSettings();
    }
    applyWodProfileToGame();
    persistWodProgressNow();
    updateSkinShop();
    if(typeof renderAchievementsUi === 'function') renderAchievementsUi();
    if(!opts.silent) showNotification('Save loaded.');
}
function wodSaveFilenameStamp() {
    let d = new Date();
    let pad = function(n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes());
}
function wodIdbKvGet(key) {
    if(!window.indexedDB) return Promise.resolve(null);
    return wodOpenSavedMapsIdb().then(function(db) {
        return new Promise(function(resolve, reject) {
            let tx = db.transaction(WOD_IDB_STORE, 'readonly');
            let g = tx.objectStore(WOD_IDB_STORE).get(key);
            g.onsuccess = function() { resolve(g.result); };
            g.onerror = function() { reject(g.error); };
        });
    });
}
function wodIdbKvPut(key, val) {
    if(!window.indexedDB) return Promise.reject(new Error('indexedDB unavailable'));
    return wodOpenSavedMapsIdb().then(function(db) {
        return new Promise(function(resolve, reject) {
            let tx = db.transaction(WOD_IDB_STORE, 'readwrite');
            tx.oncomplete = function() { resolve(true); };
            tx.onerror = function() { reject(tx.error); };
            tx.objectStore(WOD_IDB_STORE).put(val, key);
        });
    });
}
function wodIdbKvDelete(key) {
    if(!window.indexedDB) return Promise.resolve(false);
    return wodOpenSavedMapsIdb().then(function(db) {
        return new Promise(function(resolve, reject) {
            let tx = db.transaction(WOD_IDB_STORE, 'readwrite');
            tx.oncomplete = function() { resolve(true); };
            tx.onerror = function() { reject(tx.error); };
            tx.objectStore(WOD_IDB_STORE).delete(key);
        });
    });
}
function wodEscapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}
function wodFormatSaveSlotWhen(iso) {
    try { return new Date(iso).toLocaleString(); } catch (e) { return iso || ''; }
}
async function wodCreateBrowserSaveSlot() {
    let nameEl = document.getElementById('wodSaveSlotName');
    let name = (nameEl && nameEl.value || '').trim();
    if(!name) name = 'Save ' + wodSaveFilenameStamp();
    persistWodProgressNow();
    let bundle = wodBuildSaveBundle();
    let id = 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    let entry = { id: id, name: name.slice(0, 64), savedAt: bundle.savedAt };
    try {
        let index = await wodIdbGetProgressSlotIndex();
        index.unshift(entry);
        await wodIdbKvPut(WOD_IDB_PROGRESS_SLOT_PREFIX + id, bundle);
        await wodIdbPutProgressSlotIndex(index);
        if(nameEl) nameEl.value = '';
        wodRefreshBrowserSaveList();
        showNotification('Saved slot: ' + entry.name);
    } catch (e) {
        showNotification('Could not save slot: ' + (e.message || e));
    }
}
async function wodLoadBrowserSaveSlot(id) {
    let bundle = await wodIdbKvGet(WOD_IDB_PROGRESS_SLOT_PREFIX + id);
    if(!bundle) throw new Error('Slot not found.');
    wodApplySaveBundle(bundle);
}
async function wodDeleteBrowserSaveSlot(id) {
    if(!confirm('Delete this save slot?')) return;
    let index = await wodIdbGetProgressSlotIndex();
    index = index.filter(function(e) { return e && e.id !== id; });
    await wodIdbKvDelete(WOD_IDB_PROGRESS_SLOT_PREFIX + id);
    await wodIdbPutProgressSlotIndex(index);
    wodRefreshBrowserSaveList();
    showNotification('Slot deleted.');
}
function wodLoadBrowserSaveSlotBtn(btn) {
    let id = btn && btn.getAttribute('data-slot-id');
    if(!id) return;
    void wodLoadBrowserSaveSlot(id).catch(function(e) {
        showNotification('Load failed: ' + (e.message || e));
    });
}
function wodDeleteBrowserSaveSlotBtn(btn) {
    let id = btn && btn.getAttribute('data-slot-id');
    if(!id) return;
    void wodDeleteBrowserSaveSlot(id).catch(function(e) {
        showNotification('Delete failed: ' + (e.message || e));
    });
}
function wodRefreshBrowserSaveStatus() {
    let status = document.getElementById('wodBrowserSaveStatus');
    if(!status) return;
    let storageOk = true;
    try {
        localStorage.setItem('__wod_quota_probe__', '1');
        localStorage.removeItem('__wod_quota_probe__');
    } catch (e) { storageOk = false; }
    let slotHint = window.indexedDB
        ? ' Named backup slots use extra browser storage (very large capacity).'
        : ' Named slots need a modern browser with IndexedDB.';
    status.textContent = storageOk
        ? 'Auto-save is on in localStorage for this site.' + slotHint
        : 'Browser storage is blocked or full. Export a backup below.' + slotHint;
}
function wodRefreshBrowserSaveList() {
    let list = document.getElementById('wodBrowserSaveList');
    wodRefreshBrowserSaveStatus();
    if(!list) return;
    if(!window.indexedDB) {
        list.innerHTML = '<p class="wod-save-list-empty">Use Export / Import for backups in this browser.</p>';
        return;
    }
    list.innerHTML = '<p class="wod-save-list-empty">Loading…</p>';
    void wodIdbGetProgressSlotIndex().then(function(index) {
        if(!index.length) {
            list.innerHTML = '<p class="wod-save-list-empty">No slots yet. Enter a name and click Save slot.</p>';
            return;
        }
        list.innerHTML = index.map(function(entry) {
            let safeName = wodEscapeHtml(entry.name || 'Untitled');
            let when = wodEscapeHtml(wodFormatSaveSlotWhen(entry.savedAt));
            let id = String(entry.id || '').replace(/"/g, '');
            return '<div class="wod-save-file-row"><div><strong>' + safeName + '</strong><br><span style="color:#95a5a6;font-size:0.82rem">' + when + '</span></div>'
                + '<span style="display:flex;gap:6px;flex-shrink:0">'
                + '<button type="button" class="menu-btn" data-slot-id="' + id + '" onclick="wodLoadBrowserSaveSlotBtn(this)">Load</button>'
                + '<button type="button" class="menu-btn" data-slot-id="' + id + '" onclick="wodDeleteBrowserSaveSlotBtn(this)">Delete</button>'
                + '</span></div>';
        }).join('');
    }).catch(function() {
        list.innerHTML = '<p class="wod-save-list-empty">Could not read slots.</p>';
    });
}
function wodExportSaveDownload(filename, bundle) {
    bundle = bundle || wodBuildSaveBundle();
    filename = filename || (WOD_SAVE_FILE_PREFIX + wodSaveFilenameStamp() + '.json');
    let blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    let a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    showNotification('Downloaded ' + filename);
}
function wodImportSaveFromInput(input) {
    let file = input && input.files && input.files[0];
    if(!file) return;
    let reader = new FileReader();
    reader.onload = function() {
        try {
            wodApplySaveBundle(JSON.parse(reader.result));
        } catch (e) {
            showNotification('Import failed: ' + (e.message || e));
        }
        input.value = '';
    };
    reader.onerror = function() { showNotification('Could not read file.'); };
    reader.readAsText(file);
}
async function wodClearAllBrowserSaveSlots() {
    let index = await wodIdbGetProgressSlotIndex();
    await Promise.all(index.map(function(e) {
        return wodIdbKvDelete(WOD_IDB_PROGRESS_SLOT_PREFIX + e.id);
    }));
    await wodIdbPutProgressSlotIndex([]);
}
function wodInitBrowserSaves() {}
function wodIsNavalUnit(unit) { return !!unit && (unit.type==='ship'||unit.type==='transport'||unit.type==='supply'); }
function wodIsNavalType(type) { return type==='ship'||type==='transport'||type==='supply'; }
function isWaterHex(hex) {
    return hex && (hex.type === 'water' || hex.type === 'deep_water');
}
let _wodEditorSaveDomPrewarmed = false;
/** In-memory list; thumbs may exist for maps saved this session (persisted copies omit thumbs). */
let _wodSavedMapsCache = null;
let _wodSavedMapsHydrateStarted = false;
let _wodSavedMapsPersistTimer = null;
function wodStripThumbsForPersist(arr) {
    if(!Array.isArray(arr)) return [];
    return arr.map(e => {
        if(!e || typeof e !== 'object') return e;
        let o = Object.assign({}, e);
        delete o.thumb;
        if(o.thumbnail) delete o.thumbnail;
        return o;
    });
}
function wodOpenSavedMapsIdb() {
    return new Promise((resolve, reject) => {
        if(!window.indexedDB) {
            reject(new Error('indexedDB unavailable'));
            return;
        }
        let req = indexedDB.open(WOD_IDB_NAME, WOD_IDB_VERSION);
        req.onupgradeneeded = function(ev) {
            let db = ev.target.result;
            if(!db.objectStoreNames.contains(WOD_IDB_STORE))
                db.createObjectStore(WOD_IDB_STORE);
        };
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error || new Error('indexedDB open failed')); };
    });
}
function wodIdbGetSavedMapsList() {
    return wodOpenSavedMapsIdb().then(function(db) {
        return new Promise(function(resolve, reject) {
            let tx = db.transaction(WOD_IDB_STORE, 'readonly');
            let g = tx.objectStore(WOD_IDB_STORE).get(WOD_IDB_SAVED_MAPS_KEY);
            g.onsuccess = function() { resolve(g.result); };
            g.onerror = function() { reject(g.error); };
        });
    });
}
function wodIdbPutSavedMapsList(arr) {
    return wodOpenSavedMapsIdb().then(function(db) {
        return new Promise(function(resolve, reject) {
            let tx = db.transaction(WOD_IDB_STORE, 'readwrite');
            tx.oncomplete = function() { resolve(true); };
            tx.onerror = function() { reject(tx.error); };
            tx.objectStore(WOD_IDB_STORE).put(arr, WOD_IDB_SAVED_MAPS_KEY);
        });
    });
}
function wodMigrateLegacyEditorMapsArray(arr) {
    return (Array.isArray(arr) ? arr : []).map((m, i) => ({
        id: 'mig_' + (Date.now() + i) + '_' + i,
        name: m.name || 'Imported map',
        savedAt: m.date || new Date().toISOString(),
        thumb: m.thumbnail || '',
        mapSize: m.data && m.data.mapSize,
        data: m.data
    }));
}
/** Sync read of localStorage (v2 + legacy editor key). Keeps the largest list found. */
function wodReadLegacySavedMapsFromLocalStorageSync() {
    try {
        let best = [];
        let raw = localStorage.getItem(WOD_SAVED_MAPS_V2_KEY);
        if(raw) {
            let p = JSON.parse(raw);
            if(Array.isArray(p) && p.length > best.length) best = p;
        }
        let old = localStorage.getItem(WOD_SAVED_MAPS_LEGACY_EDITOR);
        if(old) {
            let mig = wodMigrateLegacyEditorMapsArray(JSON.parse(old));
            if(mig.length > best.length) {
                best = mig;
                try {
                    localStorage.setItem(WOD_SAVED_MAPS_V2_KEY, JSON.stringify(mig));
                    localStorage.removeItem(WOD_SAVED_MAPS_LEGACY_EDITOR);
                } catch(eW) {}
            }
        }
        return best;
    } catch(e) {
        return [];
    }
}
function wodPickBestSavedMapsList() {
    let mem = Array.isArray(_wodSavedMapsCache) ? _wodSavedMapsCache : [];
    let ls = wodReadLegacySavedMapsFromLocalStorageSync();
    let best = mem;
    if(ls.length > best.length) best = ls;
    return best;
}
async function wodHydrateSavedMapsFromIdb() {
    if(!window.indexedDB) return;
    try {
        let idbVal = await wodIdbGetSavedMapsList();
        let mem = wodPickBestSavedMapsList();
        let idbArr = Array.isArray(idbVal) ? idbVal : [];
        let best = mem;
        if(idbArr.length > best.length) best = idbArr;
        let stripped = wodStripThumbsForPersist(best);
        _wodSavedMapsCache = stripped;
        if(stripped.length > 0 || idbVal === undefined) {
            await wodIdbPutSavedMapsList(stripped);
            try { localStorage.setItem(WOD_SAVED_MAPS_V2_KEY, JSON.stringify(stripped)); } catch(eLS) {}
        }
    } catch(e) {
        console.warn('wodHydrateSavedMapsFromIdb', e);
    }
    try {
        if(typeof wodRefreshMapLibraryPanel === 'function') {
            let pan = document.getElementById('mapLibraryPanel');
            if(pan && !pan.classList.contains('hidden')) wodRefreshMapLibraryPanel();
        }
    } catch(e2) {}
    if(typeof window.renderMapBrowser === 'function') try { window.renderMapBrowser(); } catch(e3) {}
}
async function wodFlushSavedMapsToDisk() {
    let stripped = wodStripThumbsForPersist(_wodSavedMapsCache || []);
    let ok = false;
    if(window.indexedDB) {
        try {
            await wodIdbPutSavedMapsList(stripped);
            ok = true;
        } catch(e) {
            console.warn('IndexedDB save failed, trying localStorage', e);
        }
    }
    try {
        localStorage.setItem(WOD_SAVED_MAPS_V2_KEY, JSON.stringify(stripped));
        ok = true;
    } catch(e2) {
        console.warn('wodFlushSavedMapsToDisk localStorage failed', e2);
    }
    return ok;
}
function wodSchedulePersistSavedMaps() {
    clearTimeout(_wodSavedMapsPersistTimer);
    _wodSavedMapsPersistTimer = setTimeout(function() {
        void wodFlushSavedMapsToDisk().then(function(ok) {
            if(!ok && typeof showNotification === 'function')
                showNotification('Could not save map library (storage full or blocked). Delete old maps or export backups.');
        });
    }, 0);
}
function wodGetSavedMapsList() {
    if(_wodSavedMapsCache === null) {
        _wodSavedMapsCache = wodReadLegacySavedMapsFromLocalStorageSync();
        if(!_wodSavedMapsHydrateStarted) {
            _wodSavedMapsHydrateStarted = true;
            void wodHydrateSavedMapsFromIdb();
        }
    }
    return Array.isArray(_wodSavedMapsCache) ? _wodSavedMapsCache.slice() : [];
}
function wodSetSavedMapsList(arr) {
    _wodSavedMapsCache = Array.isArray(arr) ? arr : [];
    wodSchedulePersistSavedMaps();
    return true;
}
/** Ensures map payload is JSON-serializable (drops live object refs / cycles before localStorage). */
function wodCloneMapDataForStorage(mapData) {
    if(mapData == null || typeof mapData !== 'object') return null;
    try {
        return JSON.parse(JSON.stringify(mapData));
    } catch(e) {
        console.warn('wodCloneMapDataForStorage', e);
        return null;
    }
}
function wodHexKeyFromQR(q, r) {
    return q + ',' + r;
}
// A town-candidate batch asks the same nearest-water question for
// thousands of cells. One exact multi-source flood answers that batch.
// The field is local to the caller, so terrain edits never leave a stale cache.
function wodWaterDistanceField() {
    const distance=new Map(),queue=[];
    for(const h of gameData.hexList)if(isWaterHex(h)){distance.set(h,0);queue.push(h);}
    for(let i=0;i<queue.length;i++){
        const h=queue[i],next=distance.get(h)+1;
        for(const n of getNeighborHexes(h))if(!distance.has(n)){distance.set(n,next);queue.push(n);}
    }
    return distance;
}
function wodBfsStepsToWater(startHex, maxSteps) {
    if(!startHex || isWaterHex(startHex)) return 0;
    let q = [{ h: startHex, s: 0 }];
    let seen = new Set([wodHexKeyFromQR(startHex.q, startHex.r)]);
    for(let i=0;i<q.length;i++) {
        let cur = q[i];
        let h = cur.h, s = cur.s;
        if(s >= maxSteps) continue;
        for(let nb of getNeighborHexes(h)) {
            if(!nb) continue;
            if(isWaterHex(nb)) return s + 1;
            let k = wodHexKeyFromQR(nb.q, nb.r);
            if(seen.has(k)) continue;
            seen.add(k);
            q.push({ h: nb, s: s + 1 });
        }
    }
    return maxSteps + 1;
}
function wodLandCentroidMaxRadius(landHexes) {
    let cx = 0, cy = 0, n = landHexes.length;
    if(!n) return { cx: 0, cy: 0, maxR: 1 };
    for(let h of landHexes) {
        cx += h.x;
        cy += h.y;
    }
    cx /= n;
    cy /= n;
    let maxR = 1;
    for(let h of landHexes) {
        let dx = h.x - cx, dy = h.y - cy;
        maxR = Math.max(maxR, Math.sqrt(dx * dx + dy * dy));
    }
    return { cx, cy, maxR };
}
/** Round-robin wedges from centroid; same rotation as Political splitPhase; favors hexes nearer each wedge’s focal arc (fewer stray towns deep in hostile cores).
 * Rectangle neutral fallback: 2D stratified shuffle so towns sample the map instead of wedge round-robin chains. */
function wodWedgeFocusedCityCandidateOrder(landHexes, wedgeCount, lcm, anglePhase, mapShape) {
    if(!landHexes || landHexes.length === 0) return [];
    if(wodMapShapeUsesRectanglePipeline(mapShape)) {
        let hxs = landHexes;
        let minX = Infinity,
            maxX = -Infinity,
            minY = Infinity,
            maxY = -Infinity;
        for(let h of hxs) {
            if(h.x < minX) minX = h.x;
            if(h.x > maxX) maxX = h.x;
            if(h.y < minY) minY = h.y;
            if(h.y > maxY) maxY = h.y;
        }
        let gw = Math.max(3, Math.min(11, Math.round(Math.pow(Math.max(hxs.length, 1) / 42, 0.5) * 5)));
        let gh = gw;
        let spanX = maxX - minX + 1e-9,
            spanY = maxY - minY + 1e-9,
            nc = gw * gh;
        let buckets = [];
        for(let i = 0; i < nc; i++) buckets.push([]);
        for(let h of hxs) {
            let gx = Math.min(gw - 1, Math.floor(((h.x - minX) / spanX) * gw));
            let gy = Math.min(gh - 1, Math.floor(((h.y - minY) / spanY) * gh));
            buckets[gy * gw + gx].push(h);
        }
        let keys = [];
        for(let i = 0; i < nc; i++) keys.push(i);
        for(let i = keys.length - 1; i > 0; i--) {
            let j = Math.floor(Math.random() * (i + 1));
            let tmp = keys[i];
            keys[i] = keys[j];
            keys[j] = tmp;
        }
        let order = [];
        for(let k of keys) {
            let b = buckets[k];
            for(let i = b.length - 1; i > 0; i--) {
                let j = Math.floor(Math.random() * (i + 1));
                let t = b[i];
                b[i] = b[j];
                b[j] = t;
            }
            for(let h of b) order.push(h);
        }
        return order.length ? order : hxs.slice();
    }
    let w = Math.max(1, wedgeCount | 0);
    let cx = lcm.cx, cy = lcm.cy;
    let twoPi = Math.PI * 2;
    let phase = typeof anglePhase === 'number' && !Number.isNaN(anglePhase) ? anglePhase : 0;
    let focalR = lcm.maxR * Math.min(0.52, Math.max(0.22, 0.42 - (w - 2) * 0.038));
    let focals = [];
    for(let k = 0; k < w; k++) {
        let ang = ((k + 0.5) / w) * twoPi + phase;
        focals.push({ x: cx + Math.cos(ang) * focalR, y: cy + Math.sin(ang) * focalR });
    }
    let buckets = Array.from({ length: w }, () => []);
    for(let h of landHexes) {
        let raw = Math.atan2(h.y - cy, h.x - cx) - phase;
        raw = raw + twoPi * 4;
        raw = raw % twoPi;
        if(raw < 0) raw += twoPi;
        let b = Math.min(w - 1, Math.floor(raw / twoPi * w));
        buckets[b].push(h);
    }
    for(let b = 0; b < w; b++) {
        let fx = focals[b].x, fy = focals[b].y;
        buckets[b].sort((a, b2) => {
            let da = (a.x - fx) * (a.x - fx) + (a.y - fy) * (a.y - fy);
            let db = (b2.x - fx) * (b2.x - fx) + (b2.y - fy) * (b2.y - fy);
            if(da !== db) return da - db;
            return Math.random() - 0.5;
        });
    }
    let order = [];
    let qi = Array(w).fill(0);
    for(;;) {
        let any = false;
        for(let fidx = 0; fidx < w; fidx++) {
            if(qi[fidx] < buckets[fidx].length) {
                order.push(buckets[fidx][qi[fidx]++]);
                any = true;
            }
        }
        if(!any) break;
    }
    return order.length ? order : landHexes.slice().sort(() => Math.random() - 0.5);
}
/** Map preview diplomacy borders match in-game smoothing (same chain walk + quadratic hybrid stroke). */
function wodPaintMapPreviewPolitical(pCtx, hexList, cities, ownerSmooth, cx, cy, scale, hr, hexLookupOpt) {
    if(!pCtx || !hexList) return;
    let lk = hexLookupOpt;
    if(!lk) {
        lk = {};
        for(let h of hexList) lk[`${h.q},${h.r}`] = h;
    }
    /* ownerSmooth retained for callers; chain builder uses hex.owner (smooth map not wired into politics). */
    void ownerSmooth;
    let spacingW = (hr || 10) * 1.35;
    let chains = wodCollectDiplomacyBorderChains(hexList, lk, 0, 0, spacingW);
    let spScreen = spacingW * scale;
    pCtx.strokeStyle = 'rgba(7,14,26,0.9)';
    pCtx.fillStyle = 'rgba(7,14,26,0.9)';
    pCtx.lineJoin = 'round';
    pCtx.lineCap = 'round';
    pCtx.lineWidth = Math.max(1.2, spScreen * 0.62);
    for(let ch of chains) {
        let scr = [];
        for(let p of ch.pts) scr.push({ x: cx + p.x * scale, y: cy + p.y * scale });
        drawPaintStroke(pCtx, scr, spScreen, {
            closedLoop: ch.closed,
            suppressDegenerate: true,
            openLineCap: 'round',
            hybridBorder: true
        });
    }
    if(cities && cities.length) {
        for(let city of cities) {
            if(!city || !city.owner) continue;
            let col = (typeof city.owner === 'number' && factionColors[city.owner]) ? factionColors[city.owner] : '#ecf0f1';
            let px = cx + city.x * scale;
            let py = cy + city.y * scale;
            let rad = Math.max(2.1, scale * 3.0);
            pCtx.fillStyle = col;
            pCtx.strokeStyle = 'rgba(0,0,0,0.52)';
            pCtx.lineWidth = 1;
            pCtx.beginPath();
            pCtx.arc(px, py, rad, 0, Math.PI * 2);
            pCtx.fill();
            pCtx.stroke();
        }
    }
}
function wodPaintMapPreviewEntities(pCtx, entities, cx, cy, scale, hr) {
    if(!pCtx || !entities || entities.length === 0) return;
    for(let unit of entities) {
        if(!unit || unit.hp <= 0) continue;
        if(unit.type === 'convoy') continue;
        let px = cx + unit.x * scale;
        let py = cy + unit.y * scale;
        pCtx.save();
        pCtx.translate(px, py);
        let ur = Math.max(1.35, (hr || 10) * scale * 0.42);
        let col = factionColors[unit.owner] || '#ecf0f1';
        drawNatoCounter(pCtx, unit, ur, col);
        pCtx.restore();
    }
}
const wodAuthoredPreviewGeometry=new WeakMap();
function wodPaintMapDataOnCanvas(cnv, mapData) {
    if(!cnv || !cnv.getContext || !mapData) return;
    let hexList = mapData.hexList || [];
    if(hexList.length === 0) return;
    let pCtx = cnv.getContext('2d');
    let w = cnv.width, h = cnv.height;
    pCtx.fillStyle = '#154360';
    pCtx.fillRect(0, 0, w, h);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, hasLand = false;
    for(let hex of hexList) {
        if(!isWaterHex(hex)) {
            if(hex.x < minX) minX = hex.x;
            if(hex.x > maxX) maxX = hex.x;
            if(hex.y < minY) minY = hex.y;
            if(hex.y > maxY) maxY = hex.y;
            hasLand = true;
        }
    }
    if(!hasLand) return;
    for(const unit of mapData.entities||[])if(unit.hp>0&&Number.isFinite(unit.x)&&Number.isFinite(unit.y)) {
        minX=Math.min(minX,unit.x);maxX=Math.max(maxX,unit.x);minY=Math.min(minY,unit.y);maxY=Math.max(maxY,unit.y);
    }
    let landW = Math.max(27,maxX - minX), landH = Math.max(27,maxY - minY);
    let scale = Math.min((w - 16) / landW, (h - 16) / landH);
    let cx = w / 2 - ((minX + maxX) / 2) * scale;
    let cy = h / 2 - ((minY + maxY) / 2) * scale;
    const lk=Object.fromEntries(hexList.map(h=>[`${h.q},${h.r}`,h]));
    const first=hexList.find(h=>lk[`${h.q+1},${h.r}`]);
    const neighbor=first&&lk[`${first.q+1},${first.r}`];
    let hr = mapData.hexRadius || (neighbor?Math.abs(neighbor.x-first.x)/1.35:20);
    if(mapData.mission?.battlefield) {
        let geometry=wodAuthoredPreviewGeometry.get(mapData);
        if(!geometry){const land=new Set(hexList.filter(h=>!isWaterHex(h)).map(getHexKey)),regions=new Map();for(const h of hexList)if(!isWaterHex(h)&&h.type!=='grass'){if(!regions.has(h.type))regions.set(h.type,new Set());regions.get(h.type).add(getHexKey(h));}geometry={land:wodCellRegionLoops(land),regions:[...regions].map(([type,keys])=>[type,wodCellRegionLoops(keys)])};wodAuthoredPreviewGeometry.set(mapData,geometry);}
        pCtx.save();wodTraceCellRegion(pCtx,geometry.land,hr*1.35*scale,cx,cy);pCtx.fillStyle=getTerrainColor('grass');pCtx.fill();pCtx.clip();
        for(const [type,loops]of geometry.regions){wodTraceCellRegion(pCtx,loops,hr*1.35*scale,cx,cy);pCtx.fillStyle=getTerrainColor(type);pCtx.fill();}pCtx.restore();
    } else for(let hex of hexList) {
        if(!isWaterHex(hex)) {
            pCtx.fillStyle = getTerrainColor(hex.type);
            let pSize = Math.max(1, hr * scale * 1.45);
            pCtx.fillRect(cx + hex.x * scale - pSize / 2, cy + hex.y * scale - pSize / 2, pSize + 1, pSize + 1);
        }
    }
    let smooth = null;
    wodPaintMapPreviewPolitical(pCtx, hexList, mapData.cities, smooth, cx, cy, scale, hr, lk);
    if(mapData.mission?.battlefield) {
        pCtx.save();pCtx.lineWidth=Math.max(.6,w/1000);pCtx.strokeStyle='rgba(231,211,166,.7)';
        for(const road of mapData.roads||[]){const ps=road.points||[road.from,road.to];if(ps.length<2)continue;pCtx.beginPath();ps.forEach((p,i)=>{const x=cx+p.x*scale,y=cy+p.y*scale;if(i)pCtx.lineTo(x,y);else pCtx.moveTo(x,y);});pCtx.stroke();}
        if(cnv.clientWidth>=500){pCtx.font='600 '+Math.max(9,Math.min(20,w/cnv.clientWidth*11))+'px "Segoe UI",Arial';pCtx.textAlign='center';pCtx.textBaseline='middle';pCtx.lineJoin='round';
            for(const f of mapData.mission.battlefield.features||[]){const x=cx+f.x*scale,y=cy+f.y*scale;if(x<20||x>w-20||y<12||y>h-12)continue;pCtx.strokeStyle='#10202b';pCtx.lineWidth=3;pCtx.strokeText(f.name,x,y);pCtx.fillStyle=f.kind==='water'?'#b7ddf2':'#e2ddc7';pCtx.fillText(f.name,x,y);}
        }pCtx.restore();
    }
    wodPaintMapPreviewEntities(pCtx, mapData.entities || [], cx, cy, scale, hr);
}
function wodMapDataToThumbnailDataUrl(mapData, tw, th) {
    let c = document.createElement('canvas');
    c.width = tw || 280;
    c.height = th || 168;
    wodPaintMapDataOnCanvas(c, mapData);
    try { return c.toDataURL('image/png'); } catch(e) { return ''; }
}
function wodSavedMapThumbUrl(m, tw, th) {
    if(!m) return '';
    if(m.thumb && String(m.thumb).length) return m.thumb;
    if(m.thumbnail && String(m.thumbnail).length) return m.thumbnail;
    if(m.data) {
        try {
            return wodMapDataToThumbnailDataUrl(m.data, tw || 120, th || 72);
        } catch(e) {
            return '';
        }
    }
    return '';
}
function wodBuildMapPayloadFromGame() {
    return {
        mapSize: gameData.mapRadius,
        mapShape: gameData.mapShape || 'island',
        hexList: gameData.hexList,
        cities: gameData.cities,
        roads: gameData.roads,
        entities: gameData.entities
    };
}
/** Same rich shape as the map editor (faction colors, start economy when applicable); falls back for early boot. */
function wodDefaultMapPayloadForLibrary() {
    if(typeof WOD !== 'undefined' && WOD && typeof WOD.exportMapData === 'function') {
        try { return WOD.exportMapData(); } catch(e) { console.warn('wodDefaultMapPayloadForLibrary', e); }
    }
    return wodBuildMapPayloadFromGame();
}
function wodSaveMapToLibraryWithName(name, custom) {
    custom = custom || {};
    let mapDataRaw = custom.mapData != null ? custom.mapData : wodDefaultMapPayloadForLibrary();
    let thumb = custom.thumb !== undefined && custom.thumb !== null ? custom.thumb : wodMapDataToThumbnailDataUrl(mapDataRaw, 280, 168);
    let mapData = wodCloneMapDataForStorage(mapDataRaw);
    if(!mapData) {
        alert('Could not serialize this map for storage. Try saving again after reloading the page.');
        return null;
    }
    let list = wodGetSavedMapsList();
    let entry = {
        id: 'wmap_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9),
        name: (name || 'Saved map').trim() || 'Saved map',
        savedAt: new Date().toISOString(),
        thumb,
        mapSize: mapData.mapSize,
        data: mapData
    };
    list.unshift(entry);
    wodSetSavedMapsList(list);
    return entry;
}
function wodOverwriteSavedMapById(id, custom) {
    custom = custom || {};
    let list = wodGetSavedMapsList();
    let i = list.findIndex(e => e && String(e.id) === String(id));
    if(i < 0) return null;
    let mapDataRaw = custom.mapData != null ? custom.mapData : wodDefaultMapPayloadForLibrary();
    let thumb = custom.thumb !== undefined && custom.thumb !== null ? custom.thumb : wodMapDataToThumbnailDataUrl(mapDataRaw, 280, 168);
    let mapData = wodCloneMapDataForStorage(mapDataRaw);
    if(!mapData) {
        alert('Could not serialize this map for storage. Try saving again after reloading the page.');
        return null;
    }
    let prev = list[i];
    let name = custom.name != null && String(custom.name).trim() ? String(custom.name).trim() : (prev.name || 'Saved map');
    list[i] = {
        ...prev,
        id: prev.id,
        name,
        savedAt: new Date().toISOString(),
        thumb,
        mapSize: mapData.mapSize || mapData.mapRadius,
        data: mapData
    };
    wodSetSavedMapsList(list);
    return list[i];
}
function wodDeleteSavedMapById(id) {
    if(!id) return;
    let list = wodGetSavedMapsList().filter(e => e && e.id !== id);
    wodSetSavedMapsList(list);
}
function wodApplyMapExportToSetup(mapData) {
    if(!mapData || !mapData.hexList || !mapData.hexList.length) return false;
    let sz = mapData.mapSize || mapData.mapRadius || 60;
    let ms = document.getElementById('setupMapSize');
    if(ms) ms.value = String(sz);
    wodApplyMapSizePreset(sz);
    gameData.mapShape = mapData.mapShape || 'custom';
    let shapeEl = document.getElementById('setupMapShape');
    if(shapeEl) {
        let hasCustom = false;
        for(let i = 0; i < shapeEl.options.length; i++) {
            if(shapeEl.options[i].value === 'custom') { hasCustom = true; break; }
        }
        if(hasCustom) shapeEl.value = 'custom';
    }
    if(window.WOD && typeof WOD.loadMapData === 'function') WOD.loadMapData(mapData);
    else {
        gameData.loadedCustomMap = true;
        gameData.hexList = mapData.hexList || [];
        gameData.cities = mapData.cities || [];
        gameData.roads = mapData.roads || [];
        gameData.entities = mapData.entities || [];
        gameData.entities.forEach(wodNormalizeNavalStats);
        gameData.hospitals = (mapData.hospitals || []).map(h => ({...h}));
        gameData.forts = (mapData.forts || []).map(f => Object.assign({}, f));
        gameData.bridges = (mapData.bridges || []).map(b => wodNormalizeBridgeRecord(b)).filter(Boolean);
        for(let br of gameData.bridges) wodSyncBridgeWorldCoords(br);
        wodRebuildBridgeHexIndex();
        gameData.hexes = {};
        for(let hex of gameData.hexList) {
            hex.baseColor = getTerrainColor(hex.type);
            hex.renderColor = hex.baseColor;
            if(hex.owner === undefined || hex.owner === null) hex.owner = 0;
            gameData.hexes[`${hex.q},${hex.r}`] = hex;
        }
        normalizeTerrainHexes();
    }
    gameData._soloMapPreviewMatchesStart = false;
    previewLoadedMap();
    return true;
}
function wodApplyMapDataToSetup(mapData) {
    wodApplyMapExportToSetup(mapData);
}
function wodWireMapLibraryPanelOnce() {
    if(!_wodMapLib.pagerWired) {
        _wodMapLib.pagerWired = true;
        let prevBtn = document.getElementById('wodMapLibPagePrev');
        let nextBtn = document.getElementById('wodMapLibPageNext');
        if(prevBtn) prevBtn.addEventListener('click', () => {
            _wodMapLib.listPage = Math.max(0, (_wodMapLib.listPage | 0) - 1);
            wodRefreshMapLibraryPanel();
        });
        if(nextBtn) nextBtn.addEventListener('click', () => {
            _wodMapLib.listPage = (_wodMapLib.listPage | 0) + 1;
            wodRefreshMapLibraryPanel();
        });
    }
    if(_wodMapLib.wired) return;
    _wodMapLib.wired = true;
    let loadB = document.getElementById('wodMapLibLoadBtn');
    let delB = document.getElementById('wodMapLibDeleteBtn');
    if(loadB) loadB.onclick = () => {
        let ent = _wodMapLib.list.find(e => e.id === _wodMapLib.selectedId);
        if(!ent || !ent.data) return;
        if(_wodMapLib.context === 'editor' && window.WOD && WOD.loadMapData) {
            WOD.loadMapData(ent.data);
            document.getElementById('mapLibraryPanel').classList.add('hidden');
            _wodMapLib.returnTo = null;
            if(typeof window.wodNotifyEditorMapChanged === 'function') window.wodNotifyEditorMapChanged();
            if(typeof window.renderMapBrowser === 'function') window.renderMapBrowser();
        } else if(window._wodMapLibFromMpHost) {
            wodApplyMapDataToSetup(ent.data);
            let mps = document.getElementById('mpCfgMapSize');
            let su = document.getElementById('setupMapSize');
            if(su && mps) mps.value = su.value;
            document.getElementById('mapLibraryPanel').classList.add('hidden');
            showPanel('multiplayer');
            if(typeof WodMultiplayer !== 'undefined' && WodMultiplayer.sendLobbyMeta)
                WodMultiplayer.sendLobbyMeta(wodMpBuildLobbyMetaFromSetup());
            if(typeof wodMpRenderGameLobbyScreen === 'function') wodMpRenderGameLobbyScreen();
            wodMpRefreshLobbyMapPreview({ force: true });
            window._wodMapLibFromMpHost = false;
            _wodMapLib.returnTo = null;
        } else {
            wodApplyMapDataToSetup(ent.data);
            document.getElementById('mapLibraryPanel').classList.add('hidden');
            showPanel('setup', { preserveMap: true, fromMpHost: false });
        }
    };
    if(delB) delB.onclick = () => {
        if(!_wodMapLib.selectedId) return;
        wodDeleteSavedMapById(_wodMapLib.selectedId);
        _wodMapLib.selectedId = null;
        wodRefreshMapLibraryPanel();
        if(typeof window.renderMapBrowser === 'function') window.renderMapBrowser();
    };
}
function wodRefreshMapLibraryPanel() {
    wodWireMapLibraryPanelOnce();
    _wodMapLib.list = wodGetSavedMapsList();
    let listEl = document.getElementById('wodMapLibList');
    let meta = document.getElementById('wodMapLibMeta');
    let prev = document.getElementById('wodMapLibPreview');
    let loadB = document.getElementById('wodMapLibLoadBtn');
    let pager = document.getElementById('wodMapLibPager');
    let pageLabel = document.getElementById('wodMapLibPageLabel');
    let prevBtn = document.getElementById('wodMapLibPagePrev');
    let nextBtn = document.getElementById('wodMapLibPageNext');
    if(loadB) {
        loadB.textContent = _wodMapLib.context === 'editor' ? 'Load into editor' : 'Load into setup';
    }
    if(!listEl) return;
    if(_wodMapLib.list.length === 0) {
        if(pager) pager.hidden = true;
        listEl.innerHTML = '<div class="wod-map-lib-sub" style="padding:12px">No saves yet. Generate a map and press <strong>Save Map</strong>, or create one in the map editor.</div>';
        if(meta) meta.textContent = '';
        if(prev && prev.getContext) {
            let gx = prev.getContext('2d');
            gx.fillStyle = '#154360';
            gx.fillRect(0, 0, prev.width, prev.height);
        }
        return;
    }
    let n = _wodMapLib.list.length;
    let totalPages = Math.max(1, Math.ceil(n / WOD_MAP_LIB_PAGE_SIZE));
    _wodMapLib.listPage = Math.max(0, Math.min((_wodMapLib.listPage | 0), totalPages - 1));
    let p = _wodMapLib.listPage;
    let start = p * WOD_MAP_LIB_PAGE_SIZE;
    let end = Math.min(start + WOD_MAP_LIB_PAGE_SIZE, n);
    let pageSlice = _wodMapLib.list.slice(start, end);
    if(pager) {
        pager.hidden = false;
        if(pageLabel) pageLabel.textContent = 'Page ' + (p + 1) + ' / ' + totalPages + ' (' + n + ' saves)';
        if(prevBtn) {
            prevBtn.disabled = p <= 0;
            prevBtn.toggleAttribute('disabled', p <= 0);
        }
        if(nextBtn) {
            let last = p >= totalPages - 1;
            nextBtn.disabled = last;
            nextBtn.toggleAttribute('disabled', last);
        }
    }
    if(!pageSlice.some(x => x.id === _wodMapLib.selectedId))
        _wodMapLib.selectedId = pageSlice[0] ? pageSlice[0].id : null;
    listEl.innerHTML = '';
    for(let e of pageSlice) {
        let card = document.createElement('div');
        card.className = 'wod-map-lib-card' + (e.id === _wodMapLib.selectedId ? ' active' : '');
        card.dataset.id = e.id;
        card.innerHTML = `<img alt="" class="wod-map-lib-card-thumb"><div class="wod-map-lib-card-text"><div class="wod-map-lib-card-name"></div><div class="wod-map-lib-card-date"></div></div>`;
        card.querySelector('.wod-map-lib-card-name').textContent = e.name || 'Map';
        card.querySelector('.wod-map-lib-card-date').textContent = (e.mapSize ? 'Size ' + e.mapSize + ' — ' : '') + new Date(e.savedAt || Date.now()).toLocaleString();
        let imgEl = card.querySelector('img');
        if(e.data) {
            try {
                imgEl.src = wodMapDataToThumbnailDataUrl(e.data, 148, 90);
            } catch(err) {
                imgEl.src = e.thumb || '';
            }
        } else imgEl.src = e.thumb || '';
        card.onclick = () => {
            _wodMapLib.selectedId = e.id;
            wodRefreshMapLibraryPanel();
        };
        listEl.appendChild(card);
    }
    let sel = _wodMapLib.list.find(x => x.id === _wodMapLib.selectedId) || _wodMapLib.list[0];
    _wodMapLib.selectedId = sel.id;
    if(meta) {
        meta.innerHTML = '<strong>' + (sel.name || '').replace(/</g, '') + '</strong><br>Towns: ' + ((sel.data && sel.data.cities) ? sel.data.cities.length : 0) + ' — saved ' + new Date(sel.savedAt || Date.now()).toLocaleString();
    }
    if(prev) wodPaintMapDataOnCanvas(prev, sel.data || {});
    listEl.querySelectorAll('.wod-map-lib-card').forEach(c => {
        c.classList.toggle('active', c.dataset.id === _wodMapLib.selectedId);
    });
}
/** Styled confirm dialog (replaces native confirm() for campaign / destructive actions). */
function wodShowConfirmDialog(opts) {
    opts = opts || {};
    return new Promise(resolve => {
        let dlg = document.getElementById('wodConfirmDlg');
        let ttl = document.getElementById('wodConfirmDlgTitle');
        let body = document.getElementById('wodConfirmDlgBody');
        let okBtn = document.getElementById('wodConfirmDlgOk');
        let cancelBtn = document.getElementById('wodConfirmDlgCancel');
        if(!dlg || !okBtn || !cancelBtn) {
            resolve(!!window.confirm(opts.body || opts.title || 'Confirm?'));
            return;
        }
        if(ttl) ttl.textContent = opts.title || 'Confirm';
        if(body) body.textContent = opts.body || '';
        okBtn.textContent = opts.confirmLabel || 'Confirm';
        cancelBtn.textContent = opts.cancelLabel || 'Cancel';
        dlg.classList.toggle('wod-confirm-danger', !!opts.danger);
        okBtn.classList.toggle('wod-confirm-ok-danger', !!opts.danger);
        okBtn.classList.toggle('danger-btn', !!opts.danger);
        let done = false;
        const returnFocus=document.activeElement;
        function finish(val) {
            if(done) return;
            done = true;
            dlg.classList.add('hidden');
            dlg.setAttribute('aria-hidden', 'true');
            document.removeEventListener('keydown', onKey, true);
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            dlg.removeEventListener('click', onBackdrop);
            try {if(returnFocus?.isConnected)returnFocus.focus();}catch(_){}
            resolve(!!val);
        }
        function onOk(e) { e.preventDefault(); finish(true); }
        function onCancel(e) { e.preventDefault(); finish(false); }
        function onBackdrop(e) { if(e.target === dlg) finish(false); }
        function onKey(e) {
            if(dlg.classList.contains('hidden')) return;
            if(e.key === 'Escape') { e.preventDefault(); finish(false); }
            else if(e.key === 'Enter') { e.preventDefault(); finish(document.activeElement!==cancelBtn); }
        }
        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        dlg.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onKey, true);
        dlg.classList.remove('hidden');
        dlg.setAttribute('aria-hidden', 'false');
        setTimeout(() => { try { (opts.danger ? cancelBtn : okBtn).focus(); } catch(_) {} }, 40);
    });
}
function wodPromptSaveMapToLibrary() {
    if(wodIsMapPreviewGenerating()) return;
    if(!gameData.hexList || gameData.hexList.length === 0) {
        alert('Generate or load a map first.');
        return;
    }
    function tryOpenEditorSave() {
        if(typeof window.wodShowEditorSaveToLibraryDialog !== 'function') return false;
        window.wodShowEditorSaveToLibraryDialog();
        return true;
    }
    if(tryOpenEditorSave()) return;
    requestAnimationFrame(() => {
        if(tryOpenEditorSave()) return;
        setTimeout(() => {
            if(tryOpenEditorSave()) return;
            window.wodShowNameInputDialog({
                title: 'Save map to library',
                hint: 'Stored in this browser (IndexedDB — much larger than old localStorage limits). For backups, export maps as JSON from the setup panel.',
                defaultValue: 'My map ' + new Date().toLocaleDateString(),
                confirmLabel: 'Save',
                maxLength: 96
            }).then(name => {
                if(!name || !String(name).trim()) return;
                let ent = wodSaveMapToLibraryWithName(name);
                if(!ent) return;
                showNotification('Map saved to library.');
                if(typeof window.wodNotifySavedMapsChanged === 'function') window.wodNotifySavedMapsChanged();
                else if(typeof window.renderMapBrowser === 'function') window.renderMapBrowser();
            });
        }, 0);
    });
}
