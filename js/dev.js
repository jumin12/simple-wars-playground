// In-game developer menu.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

/* ========== In-game dev menu (``` triple backtick) ========== */
let wodDevFps = 0;
let wodDevFrameMs = 0;
let wodDevFpsSamples = [];
let wodDevLastFramePerf = 0;
let wodDevBacktickTimes = [];
let wodDevUiTimer = null;
let wodDevActivityOrder = [];
let wodDevWired = false;
function wodDevMark(name) {
    if(!name) return;
    let now = performance.now();
    let slot = wodDevActivity[name];
    if(!slot) {
        slot = { count: 0, last: 0 };
        wodDevActivity[name] = slot;
        wodDevActivityOrder.push(name);
        if(wodDevActivityOrder.length > 24) {
            let drop = wodDevActivityOrder.shift();
            delete wodDevActivity[drop];
        }
    }
    slot.count++;
    slot.last = now;
}
function wodDevNoteFrame(time, dt) {
    let now = (typeof time === 'number' && time > 0) ? time : performance.now();
    let frameMs = dt > 0 ? dt * 1000 : (wodDevLastFramePerf ? (now - wodDevLastFramePerf) : 16.7);
    wodDevLastFramePerf = now;
    wodDevFrameMs = frameMs;
    let inst = frameMs > 0.1 ? (1000 / frameMs) : 0;
    // Ignore bogus samples from the slow UI poll (menu / paused).
    if(frameMs >= 100) {
        wodDevMark('gameLoop');
        return;
    }
    wodDevFpsSamples.push(inst);
    if(wodDevFpsSamples.length > 30) wodDevFpsSamples.shift();
    let sum = 0;
    for(let i = 0; i < wodDevFpsSamples.length; i++) sum += wodDevFpsSamples[i];
    wodDevFps = sum / Math.max(1, wodDevFpsSamples.length);
    wodDevMark('gameLoop');
}
function wodDevMenuOpen() {
    let el = document.getElementById('wodDevMenu');
    return !!(el && !el.classList.contains('hidden'));
}
function wodSetDevMenuOpen(open) {
    let el = document.getElementById('wodDevMenu');
    if(!el) return;
    if(open) {
        el.classList.remove('hidden');
        wodRefreshDevMenu();
        if(!wodDevUiTimer) {
            wodDevUiTimer = setInterval(() => {
                if(!wodDevMenuOpen()) return;
                // Sample FPS even on the main menu (gameLoop only runs while PLAYING).
                if(gameState !== 'PLAYING') wodDevNoteFrame(performance.now(), 0.25);
                wodRefreshDevMenu();
            }, 250);
        }
    } else {
        el.classList.add('hidden');
        if(wodDevUiTimer) {
            clearInterval(wodDevUiTimer);
            wodDevUiTimer = null;
        }
    }
}
function wodToggleDevMenu() {
    wodSetDevMenuOpen(!wodDevMenuOpen());
}
/** Returns true when the triple-tap fired (caller should preventDefault). */
function wodDevNoteBacktick() {
    let now = performance.now();
    wodDevBacktickTimes.push(now);
    while(wodDevBacktickTimes.length && now - wodDevBacktickTimes[0] > 900) wodDevBacktickTimes.shift();
    if(wodDevBacktickTimes.length >= 3) {
        wodDevBacktickTimes = [];
        wodToggleDevMenu();
        return true;
    }
    return false;
}
function wodDevSpawnNearCamera(type) {
    if(gameState !== 'PLAYING' || gameData.menuAttractMode) {
        showNotification('Start a match to spawn units.');
        return;
    }
    let owner = typeof wodLocalPlayerOwner === 'function' ? wodLocalPlayerOwner() : 1;
    let cx = (gameData.camera && gameData.camera.x) || 0;
    let cy = (gameData.camera && gameData.camera.y) || 0;
    if(typeof createUnitAt === 'function') {
        let u = createUnitAt(type || 'light', cx, cy, owner);
        if(u) {
            showNotification('Spawned ' + (type || 'light') + '.');
            wodDevMark('cheat:spawn');
            return;
        }
    }
    showNotification('Could not spawn unit here.');
}
function wodDevRunCheat(id) {
    switch(id) {
        case 'gold100':
            wodGrantGold(100, 'Dev: +100 gold');
            wodDevMark('cheat:gold');
            break;
        case 'gold1000':
            wodGrantGold(1000, 'Dev: +1000 gold');
            wodDevMark('cheat:gold');
            break;
        case 'money10k':
            if(gameState === 'PLAYING') {
                gameData.money = (gameData.money || 0) + 10000;
                showNotification('Dev: +10,000 money');
                wodDevMark('cheat:money');
            } else showNotification('Start a match for battle money.');
            break;
        case 'mp5k':
            if(gameState === 'PLAYING') {
                gameData.manpower = (gameData.manpower || 0) + 5000;
                showNotification('Dev: +5,000 manpower');
                wodDevMark('cheat:manpower');
            } else showNotification('Start a match for manpower.');
            break;
        case 'heal': {
            let n = 0;
            for(let e of (gameData.entities || [])) {
                if(!e || !e.selected || e.hp <= 0) continue;
                e.hp = e.maxHp || e.hp;
                if(e.manpower != null && e.maxManpower != null) e.manpower = e.maxManpower;
                if(e.tanks != null && e.maxTanks != null) e.tanks = e.maxTanks;
                n++;
            }
            showNotification(n ? ('Dev: healed ' + n + ' selected') : 'Select units first.');
            wodDevMark('cheat:heal');
            break;
        }
        case 'spawnLight':
            wodDevSpawnNearCamera('light');
            break;
        case 'spawnHeavy':
            wodDevSpawnNearCamera('heavy');
            break;
        case 'win':
            if(gameState === 'PLAYING' && !gameData.menuAttractMode && typeof triggerCampaignVictory === 'function') {
                triggerCampaignVictory('Dev victory', true);
                wodDevMark('cheat:win');
            } else showNotification('No active match to win.');
            break;
        case 'pause':
            if(gameState === 'PLAYING' && typeof setGameSpeed === 'function') {
                setGameSpeed((gameData.speed || 0) > 0 ? 0 : 1, true);
                showNotification((gameData.speed || 0) > 0 ? 'Dev: resumed' : 'Dev: paused');
                wodDevMark('cheat:pause');
            } else showNotification('No active match.');
            break;
        case 'unlockStore':
            void (async () => {
                await wodLoadShopMapCatalog();
                wodEnsureOwnedShopVisuals();
                let n = 0;
                for(let entry of (wodShopMapCatalog || [])) {
                    let sid = wodShopMapShopId(entry.id);
                    if(!wodOwnsShopVisual(sid)) {
                        gameData.ownedShopVisuals[sid] = true;
                        n++;
                    }
                }
                flushGameProfileToWod();
                scheduleSaveWodProgress();
                if(typeof updateSkinShop === 'function') updateSkinShop();
                showNotification(n ? ('Dev: unlocked ' + n + ' store mission(s)') : 'Store missions already owned.');
                wodDevMark('cheat:unlockStore');
                wodRefreshDevMenu();
            })();
            break;
        default:
            showNotification('Unknown cheat.');
    }
    wodRefreshDevMenu();
}
function wodRefreshDevMenu() {
    let fpsEl = document.getElementById('wodDevFps');
    let msEl = document.getElementById('wodDevFrameMs');
    let statsEl = document.getElementById('wodDevStats');
    let actEl = document.getElementById('wodDevActivity');
    if(!fpsEl || !statsEl) return;
    let fps = Math.round(wodDevFps || 0);
    let fpsLive = (performance.now() - (wodDevLastFramePerf || 0)) < 1500 && fps > 0;
    fpsEl.textContent = fpsLive ? (fps + ' FPS') : '— FPS';
    fpsEl.classList.toggle('wod-dev-fps-warn', fpsLive && fps < 45);
    fpsEl.classList.toggle('wod-dev-fps-bad', fpsLive && fps < 25);
    if(msEl) msEl.textContent = fpsLive ? ((Math.round((wodDevFrameMs || 0) * 10) / 10) + ' ms/frame') : '(open in a match for live FPS)';

    let lo = typeof wodLocalPlayerOwner === 'function' ? wodLocalPlayerOwner() : 1;
    let sel = 0;
    for(let e of (gameData.entities || [])) if(e && e.selected) sel++;
    let lines = [
        'state: ' + gameState + (gameData.menuAttractMode ? ' (attract)' : ''),
        'speed: ' + (gameData.speed == null ? '—' : gameData.speed) + 'x',
        'gold: ' + (gameData.gold | 0),
        'money: ' + Math.floor(gameData.money || 0) + '  manpower: ' + Math.floor(gameData.manpower || 0),
        'units: ' + (gameData.entities ? gameData.entities.length : 0) + '  cities: ' + (gameData.cities ? gameData.cities.length : 0),
        'hexes: ' + (gameData.hexList ? gameData.hexList.length : 0) + '  moving: ' + (gameData._wodMovingN | 0),
        'simTick: ' + (gameData._wodSimTick | 0) + '  owner: ' + lo + '  selected: ' + sel,
        'terrainBake: ' + (Math.round((wodTerrainLastBakeCostMs || 0) * 10) / 10) + ' ms',
        'mission: ' + ((gameData.mission && gameData.mission.title) || '—')
    ];
    if(gameData.mp && gameData.mp.enabled) {
        lines.push('mp: ' + (gameData.mp.isHost ? 'host' : 'client') + (typeof wodMpMatchCanPlay === 'function' && wodMpMatchCanPlay() ? ' playing' : ' waiting'));
    }
    statsEl.textContent = lines.join('\n');

    if(actEl) {
        let rows = wodDevActivitySnapshot();
        if(!rows.length) actEl.textContent = 'No recent activity yet — open during play.';
        else {
            actEl.textContent = rows.map(r => {
                let tag = r.ageMs < 80 ? '●' : (r.ageMs < 500 ? '○' : '·');
                return tag + ' ' + r.name + '  ×' + r.count + '  ' + r.ageMs + 'ms ago';
            }).join('\n');
        }
    }
}
function wodWireDevMenuOnce() {
    if(wodDevWired) return;
    wodDevWired = true;
    let close = document.getElementById('wodDevCloseBtn');
    if(close) close.addEventListener('click', () => wodSetDevMenuOpen(false));
    let host = document.getElementById('wodDevCheats');
    if(host) {
        host.addEventListener('click', (ev) => {
            let btn = ev.target && ev.target.closest ? ev.target.closest('[data-cheat]') : null;
            if(!btn) return;
            wodDevRunCheat(btn.getAttribute('data-cheat'));
        });
    }
    window.wodToggleDevMenu = wodToggleDevMenu;
    window.wodSetDevMenuOpen = wodSetDevMenuOpen;
}
function rebuildEditorTradeRoutesFromCities() {
    let cities = gameData.cities || [];
    gameData.roads = [];
    for(let i = 0; i < cities.length; i++) {
        let c1 = cities[i];
        let nearest = null, minDist = Infinity;
        for(let j = 0; j < cities.length; j++) {
            if(i === j) continue;
            let c2 = cities[j];
            let dx = c1.x - c2.x, dy = c1.y - c2.y;
            let d = dx * dx + dy * dy;
            if(d < minDist) { minDist = d; nearest = c2; }
        }
        if(nearest) gameData.roads.push({ from: c1, to: nearest });
    }
    gameData._landIncomeCacheDirty = true;
}
function wodRoadRouteFields(road) {
    const points=(Array.isArray(road?.points)?road.points:[]).filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<100000&&Math.abs(p.y)<100000).slice(0,128).map(p=>({x:p.x,y:p.y}));
    return points.length>1?{points}:{};
}
function snapEditorRoadRefsToCities() {
    let cities = gameData.cities || [];
    if(!cities.length) {
        gameData.roads = [];
        return;
    }
    let byId = new Map(cities.map(c => [String(c.id), c]));
    let byQR = new Map(cities.map(c => [`${c.q},${c.r}`, c]));
    function resolveEnd(end) {
        if(!end) return null;
        let byI = byId.get(String(end.id));
        if(byI) return byI;
        return byQR.get(`${end.q},${end.r}`) || null;
    }
    let next = [];
    for(let r of gameData.roads || []) {
        let f = resolveEnd(r.from);
        let t = resolveEnd(r.to);
        if(f && t && f !== t) next.push({ from: f, to: t,...wodRoadRouteFields(r) });
    }
    gameData.roads = next;
    if(!gameData.roads.length && cities.length >= 2 && !gameData.mission?.battlefield)
        rebuildEditorTradeRoutesFromCities();
}
function wodEditorFactionStats(owner) {
    let income = getOwnerIncome(owner);
    let manpowerIncome = getOwnerManpowerIncome(owner);
    let expenses = getOwnerExpenses(owner);
    let territoryHexes = (gameData._landIncomeCache && gameData._landIncomeCache[owner]) || 0;
    let troopManpower = 0;
    for(let u of gameData.entities || []) {
        if(!u || u.hp <= 0 || u.owner !== owner || u.type === 'convoy') continue;
        troopManpower += u.manpower !== undefined ? u.manpower : Math.round((u.hp / Math.max(u.maxHp || 1, 1)) * 1000);
    }
    return { income, manpowerIncome, expenses, territoryHexes, troopManpower };
}
