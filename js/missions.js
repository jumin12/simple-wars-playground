// Mission and scenario helpers.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

/** Marks the active mission as completed in persistent progress (unlocks the next one). */
function wodRecordMissionCompleted() {
    if(gameState !== 'PLAYING' || gameData.menuAttractMode) return;
    let entry = gameData._selectedMissionEntry;
    if(!entry || !entry.id || !gameData.mission) return;
    if(!wodProgress) return;
    if(entry.storeMission) {
        if(!wodProgress.storeMissions) wodProgress.storeMissions = { completed: {}, spent: {} };
        if(!wodProgress.storeMissions.completed) wodProgress.storeMissions.completed = {};
        if(!wodProgress.storeMissions.spent) wodProgress.storeMissions.spent = {};
        if(wodProgress.storeMissions.completed[entry.id]) return;
        wodProgress.storeMissions.completed[entry.id] = true;
        if(entry.packId) {
            const pack=wodShopMapCatalog.find(p=>p.id===entry.packId);
            if(pack?.stages?.every(s=>wodIsStoreMissionCompleted(s.id)))wodProgress.storeMissions.completed[pack.id]=true;
        }
        // One-shot store missions are consumed on victory (mini-campaigns stay replayable).
        if(wodIsStoreMissionOneShot(entry)) {
            wodProgress.storeMissions.spent[entry.id] = true;
            showNotification('Store mission complete — one-shot cleared.');
        } else {
            showNotification(entry.packId?(wodIsStoreMissionCompleted(entry.packId)?'Campaign pack complete!':'Stage complete — next stage unlocked!'):'Store mission complete!');
        }
        wodBumpLifetime('missionsCompleted', 1);
        persistWodProgressNow();
        checkWodAchievements();
        return;
    }
    if(!wodProgress.missions) wodProgress.missions = { completed: {} };
    if(!wodProgress.missions.completed) wodProgress.missions.completed = {};
    if(wodProgress.missions.completed[entry.id]) return;
    wodProgress.missions.completed[entry.id] = true;
    wodBumpLifetime('missionsCompleted', 1);
    persistWodProgressNow();
    checkWodAchievements();
    showNotification('Mission complete — next mission unlocked!');
}
function wodIsMissionCompleted(missionId) {
    return !!(wodProgress && wodProgress.missions && wodProgress.missions.completed && wodProgress.missions.completed[missionId]);
}
function wodIsStoreMissionCompleted(missionId) {
    return !!(wodProgress && wodProgress.storeMissions && wodProgress.storeMissions.completed && wodProgress.storeMissions.completed[missionId]);
}
function wodIsStoreMissionSpent(missionId) {
    return !!(wodProgress && wodProgress.storeMissions && wodProgress.storeMissions.spent && wodProgress.storeMissions.spent[missionId]);
}
function wodIsStoreMissionOneShot(entry) {
    if(!entry) return true;
    let pack = entry.packType || entry.pack || 'oneshot';
    return pack !== 'mini_campaign' && pack !== 'campaign' && pack !== 'replayable';
}
function wodStoreMissionPlayable(entry) {
    if(!entry || !entry.id) return false;
    if(!wodOwnsShopVisual(wodShopMapShopId(entry.packId||entry.id))) return false;
    if(entry.packId) {
        const pack=wodShopMapCatalog.find(p=>p.id===entry.packId),index=pack?.stages?.findIndex(s=>s.id===entry.id);
        if(!pack||index==null||index<0||!pack.stages.slice(0,index).every(s=>wodIsStoreMissionCompleted(s.id)))return false;
    }
    if(wodIsStoreMissionOneShot(entry) && wodIsStoreMissionSpent(entry.id)) return false;
    return true;
}
/** Mission N is playable when it is the first mission or the previous one is completed. */
function wodIsMissionUnlocked(index, catalog) {
    if(index <= 0) return true;
    let prev = catalog[index - 1];
    return !!(prev && wodIsMissionCompleted(prev.id));
}
let wodMissionCatalog = [];
let wodMissionCatalogLoaded = false;
let wodMissionRenderToken = 0;
let _wodSelectedMissionId = null;
let _wodMissionListTab = 'campaign';
 // 'campaign' | 'store'
let wodMissionTabsBound = false;
async function wodLoadMissionCatalog() {
    if(wodMissionCatalogLoaded) return wodMissionCatalog;
    try {
        let res = await fetch(WOD_MISSIONS_DIR + 'manifest.json', { cache: 'no-cache' });
        if(!res.ok) throw new Error('manifest missing');
        let json = await res.json();
        wodMissionCatalog = (json.missions || []).filter(m => m && m.id && m.file).map(m => Object.assign({}, m, { storeMission: false }));
    } catch(e) {
        wodMissionCatalog = [];
        console.warn('wodLoadMissionCatalog', e);
    }
    wodMissionCatalogLoaded = true;
    return wodMissionCatalog;
}
function wodGetActiveMissionCatalog() {
    if(_wodMissionListTab === 'store') {
        return wodShopMissionStages().map(m => Object.assign({}, m, {
            storeMission: true,
            packType: m.packType || m.pack || 'oneshot'
        }));
    }
    return wodMissionCatalog;
}
function wodFindMissionEntryById(id) {
    if(!id) return null;
    let camp = wodMissionCatalog.find(m => m.id === id);
    if(camp) return Object.assign({}, camp, { storeMission: false });
    let store = wodShopMissionStages().find(m => m.id === id);
    if(store) return Object.assign({}, store, { storeMission: true, packType: store.packType || store.pack || 'oneshot' });
    return null;
}
function wodInitMissionSourceTabs() {
    if(wodMissionTabsBound) return;
    wodMissionTabsBound = true;
    document.querySelectorAll('#missionsPanel [data-mission-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            let tab = btn.getAttribute('data-mission-tab') || 'campaign';
            if(tab === _wodMissionListTab) return;
            _wodMissionListTab = tab;
            document.querySelectorAll('#missionsPanel [data-mission-tab]').forEach(b => {
                let on = b.getAttribute('data-mission-tab') === tab;
                b.classList.toggle('active', on);
                b.setAttribute('aria-selected', on ? 'true' : 'false');
            });
            void wodRefreshMissionsPanel();
        });
    });
}
function wodMissionDataLooksValid(data) {
    if(!data || !Array.isArray(data.hexList) || !data.hexList.length) return false;
    let mission = typeof wodNormalizeMission === 'function' ? wodNormalizeMission(data.mission) : data.mission;
    return !!(mission && Array.isArray(mission.events));
}
function wodPaintMissionPreviewPlaceholder(cnv, msg) {
    if(!cnv || !cnv.getContext) return;
    let ctx = cnv.getContext('2d');
    ctx.fillStyle = '#0f1823';
    ctx.fillRect(0, 0, cnv.width, cnv.height);
    ctx.fillStyle = '#9db3c7';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg || 'Loading…', cnv.width / 2, cnv.height / 2);
}
async function wodFetchMissionData(entry, opts) {
    opts = opts || {};
    if(!entry || !entry.id) return null;
    if(!opts.force && wodMissionDataCache[entry.id]) return wodMissionDataCache[entry.id];
    let file = entry.file || (entry.id + '.json');
    let dir = entry.storeMission ? WOD_SHOP_MAPS_DIR : WOD_MISSIONS_DIR;
    try {
        let res = await fetch(dir + file, { cache: 'no-cache' });
        if(!res.ok) throw new Error('mission file missing (' + res.status + ')');
        let data = await res.json();
        if(!wodMissionDataLooksValid(data)) throw new Error('invalid mission export');
        wodMissionDataCache[entry.id] = data;
        return data;
    } catch(e) {
        console.warn('wodFetchMissionData', entry.id, e);
        if(opts.force) delete wodMissionDataCache[entry.id];
        return null;
    }
}
function wodMissionTriggerSummary(data) {
    if(!data || !data.mission || !Array.isArray(data.mission.events)) return '';
    let types = [];
    for(let evt of data.mission.events) {
        let t = evt && evt.trigger && evt.trigger.type;
        if(t && !types.includes(t)) types.push(t);
    }
    let labels = { timer: 'timer', time_survived: 'survival', troops_killed: 'kill goal' };
    return types.map(t => labels[t] || t).join(', ');
}
function wodSelectMissionEntry(entry) {
    _wodSelectedMissionId = entry && entry.id ? entry.id : null;
    let startBtn = document.getElementById('wodMissionStartBtn');
    if(startBtn) startBtn.disabled = !_wodSelectedMissionId || !!(entry?.storeMission&&!wodStoreMissionPlayable(entry));
    let list = document.getElementById('wodMissionList');
    if(list) {
        list.querySelectorAll('.wod-mission-row, .wod-mission-codex-card').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.missionId === _wodSelectedMissionId);
        });
    }
    let meta = document.getElementById('wodMissionMeta');
    let cv = document.getElementById('wodMissionPreview');
    if(!entry) {
        if(meta) meta.innerHTML = '<p class="wod-map-lib-meta-empty">Select a mission to preview.</p>';
        if(cv) {
            let ctx = cv.getContext('2d');
            if(ctx) ctx.clearRect(0, 0, cv.width, cv.height);
        }
        return;
    }
    if(meta) meta.innerHTML = '<p><strong>' + (entry.name || entry.id) + '</strong></p><p class="wod-map-lib-meta-sub">Loading preview…</p>';
    if(cv) wodPaintMissionPreviewPlaceholder(cv, 'Loading map…');
    void wodFetchMissionData(entry).then(data => {
        if(_wodSelectedMissionId !== entry.id) return;
        if(!data) {
            if(meta) meta.innerHTML = '<p><strong>' + (entry.name || entry.id) + '</strong></p><p class="wod-map-lib-meta-sub" style="color:#e74c3c">Could not load this mission. Try again from the main menu.</p>';
            if(cv) wodPaintMissionPreviewPlaceholder(cv, 'Load failed');
            return;
        }
        let evtN = (data.mission && data.mission.events) ? data.mission.events.length : 0;
        let trig = wodMissionTriggerSummary(data);
        let html = '<p><strong>' + (entry.name || data.mission.title || entry.id) + '</strong></p>';
        if(entry.date)html+='<p class="wod-map-lib-meta-sub">'+wodEscapeHtml(entry.date)+' · '+wodEscapeHtml(wodPeriodLabel(entry.gamePeriod||'modern'))+'</p>';
        if(entry.description&&entry.description!==entry.history) html += '<p>' + wodEscapeHtml(entry.description) + '</p>';
        let vic = data.mission?.objective?.label || ((data.mission && data.mission.victoryMode === 'annihilation') ? 'Annihilation' : 'Domination');
        html += '<p class="wod-map-lib-meta-sub">Victory: ' + vic + ' · ' + evtN + ' battle event' + (evtN === 1 ? '' : 's');
        if(trig) html += ' · ' + trig;
        html += '</p>';
        if(entry.storeMission) {
            let oneshot = wodIsStoreMissionOneShot(entry);
            html += '<p class="wod-map-lib-meta-sub">' + (entry.packId?wodEscapeHtml(entry.packName)+' · Stage '+(entry.stageIndex+1)+' / '+entry.stageCount+' · Complete stages in order. Unlocked stages are replayable.':oneshot?'One-shot store mission — cleared after a win.':'Replayable mission.') + '</p>';
            if(entry.packId&&!wodStoreMissionPlayable(entry))html+='<p class="wod-map-lib-meta-sub">Locked — complete all preceding stages first.</p>';
            if(wodIsStoreMissionSpent(entry.id)) html += '<p class="wod-map-lib-meta-sub" style="color:#e67e22">Already completed (one-shot spent).</p>';
            if(entry.history)html+='<p><strong>Historical context:</strong> '+wodEscapeHtml(entry.history)+'</p>';
            if(data.mission?.battlefield?.note)html+='<p><strong>Battlefield:</strong> '+wodEscapeHtml(data.mission.battlefield.note)+'</p>';
            if(entry.adaptation)html+='<p class="wod-map-lib-meta-sub">'+wodEscapeHtml(entry.adaptation)+'</p>';
            if(entry.sources?.length)html+='<p class="wod-map-lib-meta-sub">Sources: '+entry.sources.map((url,i)=>'<a href="'+wodEscapeHtml(url)+'" target="_blank" rel="noopener">Historical reference '+(i+1)+'</a>').join(' · ')+'</p>';
        }
        if(meta) meta.innerHTML = html;
        if(cv) {
            cv.width=960;cv.height=560;
            try { wodPaintMapDataOnCanvas(cv, data); }
            catch(e) {
                console.warn('wodSelectMissionEntry preview', e);
                wodPaintMissionPreviewPlaceholder(cv, 'Preview unavailable');
            }
        }
    });
}
async function wodRefreshMissionsPanel() {
    let token = ++wodMissionRenderToken;
    wodInitMissionSourceTabs();
    document.querySelectorAll('#missionsPanel [data-mission-tab]').forEach(b => {
        let on = b.getAttribute('data-mission-tab') === _wodMissionListTab;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    let list = document.getElementById('wodMissionList');
    let empty = document.getElementById('wodMissionEmpty');
    let emptyHint = document.getElementById('wodMissionEmptyHint');
    let layout = document.querySelector('#missionsPanel .wod-map-lib-layout');
    let sub = document.getElementById('wodMissionPanelSub');
    if(!list) return;
    list.innerHTML = '';
    _wodSelectedMissionId = null;
    let startBtn = document.getElementById('wodMissionStartBtn');
    if(startBtn) startBtn.disabled = true;
    wodSelectMissionEntry(null);
    await wodLoadMissionCatalog();
    await wodLoadShopMapCatalog();
    if(token !== wodMissionRenderToken) return;

    let storeTab = _wodMissionListTab === 'store';
    if(sub) {
        sub.textContent = storeTab
            ? 'Purchased missions and historical campaigns. Win each campaign stage to unlock the next; unlocked stages remain replayable.'
            : 'Ten linked battles across land and sea. Win each mission to unlock the next.';
    }

    let catalog = wodGetActiveMissionCatalog();
    if(storeTab) {
        catalog = catalog.filter(e => wodOwnsShopVisual(wodShopMapShopId(e.packId||e.id)));
    }

    if(!catalog.length) {
        list.classList.remove('wod-mission-codex');
        let missionPanel = document.getElementById('missionsPanel');
        if(missionPanel) missionPanel.classList.toggle('wod-store-codex', storeTab);
        if(empty) empty.classList.remove('hidden');
        if(emptyHint) {
            emptyHint.textContent = storeTab
                ? 'Buy missions in the Shop → Missions tab. Owned store missions will show up here.'
                : 'Missions could not be loaded. Return to the main menu and try again.';
        }
        if(layout) layout.style.display = 'none';
        return;
    }
    if(empty) empty.classList.add('hidden');
    if(layout) layout.style.display = '';
    list.classList.toggle('wod-mission-codex', storeTab);
    let missionPanel = document.getElementById('missionsPanel');
    if(missionPanel) missionPanel.classList.toggle('wod-store-codex', storeTab);

    let previousPack=null;
    for(let entry of catalog) {
        if(storeTab&&entry.packId&&entry.packId!==previousPack) {
            const heading=document.createElement('header');heading.className='wod-store-pack-heading';
            const pack=wodShopMapCatalog.find(p=>p.id===entry.packId),done=pack.stages.filter(s=>wodIsStoreMissionCompleted(s.id)).length;
            heading.innerHTML='<strong>'+wodEscapeHtml(entry.packName)+'</strong><span>'+done+' / '+pack.stages.length+' stages complete · play in order</span>';list.appendChild(heading);
        }
        previousPack=entry.packId||null;
        let btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.missionId = entry.id;
        if(storeTab) {
            let spent = wodIsStoreMissionSpent(entry.id);
            let done = wodIsStoreMissionCompleted(entry.id);
            let playable = wodStoreMissionPlayable(entry);
            btn.className = 'wod-mission-codex-card' + (playable ? '' : ' locked') + (spent ? ' spent' : '');
            let tag = entry.packId?(done?'Complete':playable?'Ready':'Locked'):(spent?'Spent':done?'Done':wodIsStoreMissionOneShot(entry)?'Once':'Replay');
            btn.title = entry.description || entry.name || entry.id;
            btn.innerHTML =
                '<span class="shop-codex-art"><canvas width="148" height="148" aria-hidden="true"></canvas></span>' +
                '<span class="shop-codex-tag">' + tag + '</span>' +
                '<span class="shop-codex-name">' + (entry.packId?(entry.stageIndex+1)+'. ':'') + wodEscapeHtml(entry.name || entry.id) + '</span>';
            void wodFetchMissionData(entry).then(data => {
                if(!btn.isConnected || !data) return;
                let cv = btn.querySelector('canvas');
                if(cv) {
                    try { wodPaintMapDataOnCanvas(cv, data); } catch(_) {}
                }
            });
            btn.dataset.locked=playable?'false':'true';
            btn.setAttribute('aria-label',(playable?'Preview ':'Preview locked stage: ')+(entry.name||entry.id));
            btn.addEventListener('click',()=>wodSelectMissionEntry(entry));
        } else {
            let idx = wodMissionCatalog.indexOf(entry);
            let unlocked = wodIsMissionUnlocked(idx, wodMissionCatalog);
            let done = wodIsMissionCompleted(entry.id);
            btn.className = 'wod-mission-row' + (unlocked ? '' : ' locked') + (done ? ' completed' : '');
            let badge = done ? '<span class="wod-mission-row-badge done">✓ Completed</span>'
                : (unlocked ? '' : '<span class="wod-mission-row-badge lock">🔒 Locked</span>');
            btn.innerHTML =
                '<span class="wod-mission-row-title">' + (entry.name || entry.id) + badge + '</span>' +
                (unlocked && entry.description ? '<span class="wod-mission-row-desc">' + entry.description + '</span>'
                    : (!unlocked ? '<span class="wod-mission-row-desc">Complete the previous mission to unlock.</span>' : ''));
            if(unlocked) btn.addEventListener('click', () => wodSelectMissionEntry(entry));
            else btn.addEventListener('click', () => showNotification('Locked — complete the previous mission first.'));
        }
        list.appendChild(btn);
    }

    let auto = null;
    if(storeTab) {
        for(let e of catalog) {
            if(wodStoreMissionPlayable(e)&&!wodIsStoreMissionCompleted(e.id)) { auto = e; break; }
        }
        if(!auto)auto=catalog.find(wodStoreMissionPlayable);
    } else {
        for(let i = 0; i < wodMissionCatalog.length; i++) {
            if(!wodIsMissionUnlocked(i, wodMissionCatalog)) break;
            auto = wodMissionCatalog[i];
            if(!wodIsMissionCompleted(auto.id)) break;
        }
    }
    if(auto) wodSelectMissionEntry(auto);
}
async function wodApplyMissionEntry(entry) {
    if(!entry || !entry.id) return false;
    if(entry.storeMission&&!wodStoreMissionPlayable(entry)){showNotification('Locked — own the pack and complete the preceding stages first.');return false;}
    let data = await wodFetchMissionData(entry, { force: true });
    if(!data) return false;
    if(window.WOD && typeof WOD.loadMapData === 'function') WOD.loadMapData(data);
    else return false;
    gameData.loadedCustomMap = true;
    gameData._selectedMissionEntry = entry;
    gameData._soloMapPreviewMatchesStart = true;
    gameData._soloPreviewSnapshot = null;
    wodSyncSetupControlsFromLoadedMap();
    wodAssignMatchGenerals(null);
    if(entry.aiCount != null) {
        let n = Math.max(1, Math.min(WOD_MAX_AI_OPPONENTS, parseInt(entry.aiCount, 10) || 1));
        gameData.aiCount = n;
        let aiEl = document.getElementById('setupAI');
        if(aiEl) aiEl.value = String(n);
    } else {
        let owners = new Set();
        for(let c of gameData.cities || []) if(c && c.owner > 1) owners.add(c.owner);
        let aiN = Math.max(1, Math.min(WOD_MAX_AI_OPPONENTS, owners.size || 1));
        gameData.aiCount = aiN;
        let aiEl = document.getElementById('setupAI');
        if(aiEl) aiEl.value = String(aiN);
    }
    if(!gameData.mission) {
        console.warn('wodApplyMissionEntry: mission definition missing after load');
        return false;
    }
    return true;
}
function wodWireMissionStartButtonOnce() {
    let btn = document.getElementById('wodMissionStartBtn');
    if(!btn || btn.dataset.wired === '1') return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
        let entry = wodFindMissionEntryById(_wodSelectedMissionId);
        if(!entry) {
            showNotification('Select a mission first.');
            return;
        }
        if(entry.storeMission) {
            if(!wodStoreMissionPlayable(entry)) {
                showNotification(wodIsStoreMissionSpent(entry.id)
                    ? 'This one-shot store mission was already completed.'
                    : 'Unlock this mission in the Shop first.');
                return;
            }
        } else {
            let idx = wodMissionCatalog.findIndex(m => m.id === entry.id);
            if(!wodIsMissionUnlocked(idx, wodMissionCatalog)) {
                showNotification('Locked — complete the previous mission first.');
                return;
            }
        }
        btn.disabled = true;
        btn.textContent = 'Loading…';
        gameData._launchingMission = true;
        let missionPeriod = document.getElementById('wodMissionGamePeriod');
        if(missionPeriod && missionPeriod.value) wodApplyGamePeriod(missionPeriod.value, { saveProfile: true });
        else if(entry.periodHint) wodApplyGamePeriod(entry.periodHint, { saveProfile: true });
        showNotification('Loading mission map…');
        void wodApplyMissionEntry(entry).then(ok => {
            btn.textContent = 'Start mission';
            btn.disabled = !_wodSelectedMissionId;
            if(!ok) {
                gameData._launchingMission = false;
                showNotification('Could not load the selected mission.');
                return;
            }
            startGame('ai', { mission: true });
        });
    });
}
function wodNormalizeMission(raw) {
    if(!raw || typeof raw !== 'object') return null;
    let events = Array.isArray(raw.events) ? raw.events.map((evt, i) => {
        if(!evt || typeof evt !== 'object') return null;
        let trig = evt.trigger && typeof evt.trigger === 'object' ? evt.trigger : {};
        let type = ['timer', 'time_survived', 'troops_killed'].includes(trig.type) ? trig.type : 'timer';
        let trigger = { type };
        if(type === 'troops_killed') trigger.count = Math.max(1, parseInt(trig.count, 10) || 100);
        else trigger.seconds = Number.isFinite(parseFloat(trig.seconds)) ? Math.max(0,parseFloat(trig.seconds)) : 60;
        let popup = evt.popup && typeof evt.popup === 'object' ? evt.popup : {};
        let reps = Array.isArray(evt.reinforcements) ? evt.reinforcements.map(r => {
            if(!r || typeof r !== 'object') return null;
            return {
                owner: Math.max(1, parseInt(r.owner, 10) || 2),
                type: ['light','motorized','mountaineer','marine','heavy','ship','transport','supply'].includes(r.type) ? r.type : 'light',
                count: Math.max(1, Math.min(48, parseInt(r.count, 10) || 1)),
                anchor: ['enemy_city', 'player_city', 'faction_city', 'map_center', 'coords'].includes(r.anchor) ? r.anchor : 'enemy_city',
                cityOwner: parseInt(r.cityOwner, 10) || 0,
                x: Number.isFinite(r.x) ? r.x : null,
                y: Number.isFinite(r.y) ? r.y : null
            };
        }).filter(Boolean) : [];
        let pathOrders = Array.isArray(evt.pathOrders) ? evt.pathOrders.map(p => {
            if(!p || typeof p !== 'object') return null;
            if(!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
            return {
                owner: Math.max(1, parseInt(p.owner, 10) || 2),
                scope: p.scope === 'reinforcements' ? 'reinforcements' : 'all',
                x: p.x,
                y: p.y
            };
        }).filter(Boolean) : [];
        return {
            id: String(evt.id || ('evt_' + (i + 1))),
            name: String(evt.name || ('Event ' + (i + 1))).slice(0, 64),
            once: evt.once !== false,
            trigger,
            popup: {
                title: String(popup.title || '').slice(0, 80),
                body: String(popup.body || '').slice(0, 1200),
                style: ['briefing', 'alert', 'victory'].includes(popup.style) ? popup.style : 'briefing',
                kicker: String(popup.kicker || '').slice(0, 48)
            },
            reinforcements: reps,
            pathOrders
        };
    }).filter(Boolean) : [];
    const goal=raw.objective,objective=goal&&['capture','hold','evacuate','fleet'].includes(goal.type)?{
        type:goal.type,label:String(goal.label||'Complete the mission objective.').slice(0,180),
        cityIds:Array.isArray(goal.cityIds)?goal.cityIds.slice(0,32).map(id=>String(id).slice(0,64)):[],
        duration:Math.max(0,Math.min(7200,Number(goal.duration)||0)),minUnits:Math.max(1,Math.min(48,Number(goal.minUnits)||1)),
        unitPrefix:String(goal.unitPrefix||'').slice(0,64),owner:Math.max(1,Math.min(8,Number(goal.owner)||2)),
        zone:goal.zone&&Number.isFinite(goal.zone.x)&&Number.isFinite(goal.zone.y)?{x:goal.zone.x,y:goal.zone.y,radius:Math.max(1,Math.min(2000,Number(goal.zone.radius)||100))}:null
    }:null;
    const battlefield=raw.battlefield&&typeof raw.battlefield==='object'?{version:1,northUp:raw.battlefield.northUp!==false,note:String(raw.battlefield.note||'').slice(0,600),features:(Array.isArray(raw.battlefield.features)?raw.battlefield.features:[]).filter(f=>f&&Number.isFinite(f.x)&&Number.isFinite(f.y)).slice(0,32).map(f=>({name:String(f.name||'').slice(0,80),x:f.x,y:f.y,kind:f.kind==='water'?'water':'land'}))}:null;
    return {version:1,title:String(raw.title||'').slice(0,80),victoryMode:raw.victoryMode==='annihilation'?'annihilation':'domination',...(objective?{objective}:{}),...(battlefield?{battlefield}:{}),...(raw.fullStartingArmy===true?{fullStartingArmy:true}:{}),...(Number.isFinite(raw.enemyManpowerRate)?{enemyManpowerRate:Math.max(0,Math.min(1,raw.enemyManpowerRate))}:{}),events};
}
function wodMissionHasEvents() {
    return !!(gameData.mission && Array.isArray(gameData.mission.events) && gameData.mission.events.length);
}
function wodCheckScriptedMissionEnd(dt) {
    const goal=gameData.mission?.objective,rt=gameData._missionRuntime,lo=wodLocalPlayerOwner();if(!goal||!rt)return;
    const friendly=gameData.entities.filter(u=>u.owner===lo&&u.hp>0&&u.type!=='convoy');
    if(wodTickEndCountdown('missionArmyLost',friendly.length===0,dt,'Your army is destroyed! Defeat in',true)){triggerCampaignDefeat('Defeat — your field force was lost.');return;}
    const cities=goal.cityIds.map(id=>gameData.cities.find(c=>c.id===id));
    const held=cities.length>0&&cities.every(c=>c&&wodIsFriendlyOwner(c.owner,lo));
    let success=false,progress='';
    if(goal.type==='capture'){
        const complete=cities.filter(c=>c&&wodIsFriendlyOwner(c.owner,lo)&&getCityUrbanTerrainHexes(c).every(h=>wodIsFriendlyOwner(h.owner,lo))).length;
        success=held&&complete===cities.length;progress=complete+' / '+cities.length+' sectors secure';
    }
    if(goal.type==='hold') {
        if(wodTickEndCountdown('missionPositionLost',!held,dt,'The protected position is lost! Defeat in',true)){triggerCampaignDefeat('Defeat — the protected position was lost.');return;}
        success=held&&rt.elapsed>=goal.duration;
        progress=wodFormatHoldClock(Math.max(0,goal.duration-rt.elapsed))+' remaining';
    }
    if(goal.type==='evacuate'&&goal.zone) {
        const original=u=>u&&u.hp>0&&(rt.evacueeUids?rt.evacueeUids.has(u.uid):!goal.unitPrefix||String(u.name||'').startsWith(goal.unitPrefix));
        const survivors=friendly.reduce((n,u)=>n+(original(u)?1:0)+(original(u.cargo)?1:0),0);
        if(wodTickEndCountdown('missionEvacueesLost',survivors<goal.minUnits,dt,'Too few evacuees survive! Defeat in',true)){triggerCampaignDefeat('Defeat — too few original formations survive to evacuate.');return;}
        const evacuated=friendly.filter(u=>!wodIsNavalUnit(u)&&original(u)&&
            !isWaterHex(getNearestHexToPoint(u.x,u.y))&&Math.hypot(u.x-goal.zone.x,u.y-goal.zone.y)<=goal.zone.radius);
        success=rt.elapsed>=goal.duration&&evacuated.length>=goal.minUnits;
        progress=evacuated.length+' / '+goal.minUnits+' evacuated'+(rt.elapsed<goal.duration?' · nightfall in '+wodFormatHoldClock(goal.duration-rt.elapsed):'');
    }
    // (a fleet is beaten when its warships are sunk: transports and supply ships, which run rather than fight, and the
    // transport carrying its commander, do not have to be hunted down)
    if(goal.type==='fleet'){const left=gameData.entities.filter(u=>u.owner===goal.owner&&u.hp>0&&u.type==='ship').length;success=left===0;progress=left+' enemy warships remaining';}
    if(rt.progressText!==progress){rt.progressText=progress;syncHudObjectiveDisplay();}
    if(success&&friendly.length)triggerCampaignVictory('Mission complete — '+goal.label,true);
}
function wodInitMissionRuntime() {
    gameData._missionRuntime = null;
    if(!wodMissionHasEvents()) return;
    if(gameData.mp && gameData.mp.enabled) return;
    let lo = wodLocalPlayerOwner();
    gameData._missionRuntime = {
        elapsed: 0,
        ...(gameData.mission.objective?.type==='evacuate'?{evacueeUids:new Set(gameData.entities.filter(u=>u.owner===lo&&!wodIsNavalUnit(u)&&(!gameData.mission.objective.unitPrefix||String(u.name||'').startsWith(gameData.mission.objective.unitPrefix))).map(u=>u.uid))}:{}),
        fired: new Set(),
        killsBaseline: (getOwnerTroopKills(lo) | 0) + (getOwnerTankKills(lo) | 0) + (getOwnerShipKills(lo) | 0),
        popupOpen: false,
        resumeSpeed: 1
    };
}
function wodMissionPlayerAlive() {
    let lo = wodLocalPlayerOwner();
    if(factionControlsAnyCity(lo)) return true;
    for(let u of gameData.entities) {
        if(u.owner === lo && u.hp > 0 && u.type !== 'convoy') return true;
    }
    return false;
}
function wodMissionKillsSinceStart() {
    let rt = gameData._missionRuntime;
    if(!rt) return 0;
    let lo = wodLocalPlayerOwner();
    let total = (getOwnerTroopKills(lo) | 0) + (getOwnerTankKills(lo) | 0) + (getOwnerShipKills(lo) | 0);
    return Math.max(0, total - (rt.killsBaseline | 0));
}
function wodMissionTriggerMet(evt, rt) {
    let t = evt.trigger || {};
    if(t.type === 'timer') return rt.elapsed >= (parseFloat(t.seconds) || 0);
    if(t.type === 'time_survived') return rt.elapsed >= (parseFloat(t.seconds) || 0) && wodMissionPlayerAlive();
    if(t.type === 'troops_killed') return wodMissionKillsSinceStart() >= (parseInt(t.count, 10) || 0);
    return false;
}
function wodMissionSpawnPoint(spec) {
    let owner = parseInt(spec.owner, 10) || 2;
    let anchor = spec.anchor || 'enemy_city';
    let cx = spec.x, cy = spec.y;
    if(Number.isFinite(cx) && Number.isFinite(cy)) return { x: cx, y: cy };
    let lo = wodLocalPlayerOwner();
    let pool = (gameData.cities || []).filter(c => c && c.owner > 0);
    if(anchor === 'player_city') pool = pool.filter(c => c.owner === lo);
    else if(anchor === 'enemy_city') pool = pool.filter(c => c.owner !== lo);
    else if(anchor === 'faction_city') {
        let fo = parseInt(spec.cityOwner, 10) || owner;
        pool = pool.filter(c => c.owner === fo);
    } else if(anchor === 'map_center') {
        let sx = 0, sy = 0, n = 0;
        for(let h of gameData.hexList || []) {
            if(!h || isWaterHex(h)) continue;
            sx += h.x; sy += h.y; n++;
        }
        if(n) return { x: sx / n, y: sy / n };
    }
    if(pool.length) {
        let pick = pool[Math.floor(Math.random() * pool.length)];
        return { x: pick.x, y: pick.y };
    }
    if(gameData.cities && gameData.cities.length) {
        let c = gameData.cities[0];
        return { x: c.x, y: c.y };
    }
    return { x: 0, y: 0 };
}
function wodSpawnMissionReinforcementGroup(spec) {
    let spawned = [];
    if(!spec) return spawned;
    let owner = parseInt(spec.owner, 10) || 2;
    let type = spec.type || 'light';
    let count = Math.max(1, Math.min(48, parseInt(spec.count, 10) || 1));
    let pt = wodMissionSpawnPoint(spec);
    if(wodIsNavalType(type)){const sea=gameData.hexList.filter(wodIsOpenWaterHex).sort((a,b)=>(a.x-pt.x)**2+(a.y-pt.y)**2-((b.x-pt.x)**2+(b.y-pt.y)**2))[0];if(!sea)return [];pt={x:sea.x,y:sea.y};}
    let spacing = Math.max(28, (gameData.hexRadius || 20) * 1.35);
    for(let i = 0; i < count; i++) {
        let ang = (i / Math.max(1, count)) * Math.PI * 2 + Math.random() * 0.35;
        let r = spacing * (0.55 + (i % 4) * 0.28);
        let u = createUnitAt(type, pt.x + Math.cos(ang) * r, pt.y + Math.sin(ang) * r, owner, { startSpawn: true });
        if(u) spawned.push(u);
    }
    return spawned;
}
function wodMissionApplyPathOrder(spec, spawnedUnits) {
    if(!spec || !Number.isFinite(spec.x) || !Number.isFinite(spec.y)) return;
    let owner = parseInt(spec.owner, 10) || 2;
    // Never auto-order the local player's troops from mission events.
    let localOwner = typeof wodLocalPlayerOwner === 'function' ? wodLocalPlayerOwner() : 1;
    if(owner === localOwner || owner === 1) return;
    let units = [];
    if(spec.scope === 'reinforcements' && spawnedUnits && spawnedUnits.length) {
        units = spawnedUnits.filter(u => u && u.owner === owner && u.hp > 0 && u.type !== 'convoy');
    } else {
        units = (gameData.entities || []).filter(u => u && u.owner === owner && u.hp > 0 && u.type !== 'convoy');
    }
    for(let unit of units) {
        assignUnitMoveAlongWaypoints(unit, [{ x: spec.x, y: spec.y }]);
        unit._missionMarch = { x: spec.x, y: spec.y, until: (typeof wodAiOperationTime === 'function' ? wodAiOperationTime() : 0) + 150000 };
    }
}
function wodFireMissionEvent(evt) {
    let rt = gameData._missionRuntime;
    if(!rt || !evt) return;
    rt.popupOpen = true;
    rt.resumeSpeed = gameData.speed > 0 ? gameData.speed : (rt.resumeSpeed || 1);
    gameData.speed = 0;
    let spawnedUnits = [];
    if(evt.reinforcements && evt.reinforcements.length) {
        for(let r of evt.reinforcements) {
            let batch = wodSpawnMissionReinforcementGroup(r);
            if(batch && batch.length) spawnedUnits = spawnedUnits.concat(batch);
        }
    }
    if(evt.pathOrders && evt.pathOrders.length) {
        for(let po of evt.pathOrders) wodMissionApplyPathOrder(po, spawnedUnits);
    }
    let popup = evt.popup || {};
    if(popup.title || popup.body) {
        wodShowMissionPopupDialog(popup, () => {
            rt.popupOpen = false;
            setGameSpeed(rt.resumeSpeed || 1, true);
        });
    } else {
        rt.popupOpen = false;
        setGameSpeed(rt.resumeSpeed || 1, true);
    }
}
function wodUpdateMissionEvents(dt) {
    if(gameState !== 'PLAYING' || gameData.menuAttractMode || gameData._campaignEnded) return;
    if(gameData.mp && gameData.mp.enabled) return;
    if(!wodMissionHasEvents() || !gameData._missionRuntime) return;
    let rt = gameData._missionRuntime;
    if(rt.popupOpen) return;
    if(gameData.speed > 0) rt.elapsed += dt;
    for(let evt of gameData.mission.events) {
        if(!evt || !evt.id) continue;
        if(evt.once !== false && rt.fired.has(evt.id)) continue;
        if(!wodMissionTriggerMet(evt, rt)) continue;
        rt.fired.add(evt.id);
        wodFireMissionEvent(evt);
        break;
    }
}
