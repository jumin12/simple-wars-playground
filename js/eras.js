// Historical eras (periods): palettes, unlocks and era-specific names.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

function wodInitPeriodSettingsBinding() {
    let sel = document.getElementById('settingsGamePeriod');
    if(sel && !sel._wodBound) {
        sel._wodBound = true;
        sel.addEventListener('change', () => wodApplyGamePeriod(sel.value, { saveProfile: true }));
    }
    wodInitMissionPeriodBinding();
    wodInitCampaignPeriodBinding();
}
let _achStatsPeriodFilter = 'all';
function wodWireAchStatsPeriodFilter() {
    let sel = document.getElementById('achStatsPeriodFilter');
    if(!sel || sel._wodBound) return;
    sel._wodBound = true;
    sel.addEventListener('change', () => {
        _achStatsPeriodFilter = sel.value || 'all';
        renderAchievementsUi();
    });
}
function wodPeriodStructurePalette(period) {
    let us = wodUrbanPeriodStyle(period);
    return {
        wall: us.blockA,
        wallHi: us.blockB,
        stroke: us.stroke,
        window: 'rgba(18, 22, 28, 0.62)',
        accent: period === 'ancient' ? '#d4c4a0' : period === 'medieval' ? '#6d5a48' : period === 'napoleonic' ? '#5c4a38' : '#8a9399',
        water: period === 'ancient' ? '#3d6a7a' : '#2c4f68',
        roof: period === 'medieval' ? '#4a4038' : period === 'ancient' ? '#8b7355' : '#3d4450',
    };
}
function wodPeriodLabel(id) {
    if(id === 'napoleonic') return 'Napoleonic';
    if(id === 'ancient') return 'Ancient';
    if(id === 'medieval') return 'Medieval';
    return 'Modern (NATO)';
}
function wodIsPeriodUnlocked(id) {
    if(!id || id === 'modern') return true;
    if(wodHasSupporterPack()) return true;
    return !!(gameData.ownedUnitSkins && gameData.ownedUnitSkins[id]);
}
function wodGetGamePeriod() {
    let p = gameData.gamePeriod || 'modern';
    if(!wodIsPeriodUnlocked(p)&&!(gameData.loadedCustomMap&&gameData._loadedMapGamePeriod===p)) p = 'modern';
    return p;
}
function wodGetMatchPeriod() {
    let p = gameData._matchPeriod || gameData.gamePeriod || 'modern';
    if(!wodIsPeriodUnlocked(p)&&!(gameData.loadedCustomMap&&gameData._loadedMapGamePeriod===p)) p = 'modern';
    return p;
}
function wodPeriodFlavor(period) {
    period = period || wodGetGamePeriod();
    const F = {
        modern: {
            light: 'Infantry', marine: 'Marine regiment', heavy: 'Armor', ship: 'Naval vessel',
            convoyLand: 'Land trade convoy', convoySea: 'Sea trade convoy',
            trainLight: 'Train Infantry ($1000, 2k MP)', trainMarine: 'Train Marines ($1000, 2k MP)',
            trainHeavy: 'Train Armor ($8k, 2k MP)', trainShip: 'Build Ship ($7.6k, 10k MP)',
            factory: 'Factory', farm: 'Farm', harbor: 'Harbor', fort: 'Fort',
            cityTown: 'Town', cityPort: 'Port City', cityIndustrial: 'Industrial City', cityPortIndustrial: 'Industrial Port City',
            unitLight: (n) => wodOrdinal(n) + ' Infantry Division',
            unitMarine: (n) => wodOrdinal(n) + ' Marine Regiment',
            unitHeavy: (n) => wodOrdinal(n) + ' Armored Division',
            unitShip: (n) => 'USS ' + cityStarts[Math.floor(Math.random() * cityStarts.length)],
            unitConvoy: (n, sea) => (sea ? 'Sea trade convoy ' : 'Land trade convoy ') + n,
            hudHeavy: 'Armor', hudShips: 'Ships', hudInfantryLost: 'Soldiers lost', hudHeavyLost: 'Tanks lost', hudShipsLost: 'Ships lost',
            hudInfantryKills: 'Soldiers', hudHeavyKills: 'Tanks', hudShipsKills: 'Ships',
            heavyCount: 'Tanks', playerSummaryHeavy: 'Tanks', summaryHeavyDestroyed: 'Armor lost',
            statOwnInfantry: 'Infantry lost', statOwnMarine: 'Marines lost', statOwnHeavy: 'Tanks lost', statOwnShips: 'Ships lost',
            statEnemyInfantry: 'Infantry eliminated', statEnemyMarine: 'Marines eliminated', statEnemyHeavy: 'Tanks knocked out', statEnemyShips: 'Ships sunk',
            statFactories: 'Factories built', statHarbors: 'Harbors built', statForts: 'Forts built',
            statTrainLight: 'Infantry trained', statTrainMarine: 'Marines trained', statTrainHeavy: 'Tanks trained', statTrainShip: 'Ships trained',
            achHunter: 'Armor hunter', achHunterDesc: 'Knock out 200 enemy tanks (lifetime).',
            achIndustrial: 'Industrial base', achIndustrialDesc: 'Build 12 factories in towns you control.',
            achAdmiralty: 'Admiralty works', achAdmiraltyDesc: 'Build 12 harbors in towns you control.',
            helpHeavy: 'Armor', matrixHeavy: 'Armor'
        },
        napoleonic: {
            light: 'Musket line', marine: 'Naval infantry', heavy: 'Horse regiments', ship: 'Ship of the line',
            convoyLand: 'Wagon train', convoySea: 'Merchant convoy',
            trainLight: 'Form musket battalion ($1000, 2k MP)', trainMarine: 'Embark naval infantry ($1000, 2k MP)',
            trainHeavy: 'Raise horse regiments ($8k, 2k MP)', trainShip: 'Commission ship of the line ($7.6k, 10k MP)',
            factory: 'Foundry', farm: 'Granary', harbor: 'Naval yard', fort: 'Redoubt',
            cityTown: 'Commune', cityPort: 'Port commune', cityIndustrial: 'Arsenal town', cityPortIndustrial: 'Grand arsenal port',
            unitLight: (n) => n + 'e Bataillon de ligne',
            unitMarine: (n) => n + 'e Infanterie de marine',
            unitHeavy: (n) => n + 'e Régiment de cavalerie',
            unitShip: (n) => 'HMS ' + cityStarts[Math.floor(Math.random() * cityStarts.length)],
            unitConvoy: (n, sea) => (sea ? 'Convoi maritime ' : 'Convoi de vivres ') + n,
            hudHeavy: 'Horses', hudShips: 'Men-of-war', hudInfantryLost: 'Line lost', hudHeavyLost: 'Horses lost', hudShipsLost: 'Ships lost',
            hudInfantryKills: 'Line broken', hudHeavyKills: 'Horses', hudShipsKills: 'Ships',
            heavyCount: 'Horses', playerSummaryHeavy: 'Horses', summaryHeavyDestroyed: 'Horses lost',
            statOwnInfantry: 'Line infantry lost', statOwnMarine: 'Naval infantry lost', statOwnHeavy: 'Horses lost', statOwnShips: 'Ships lost',
            statEnemyInfantry: 'Line infantry broken', statEnemyMarine: 'Naval infantry broken', statEnemyHeavy: 'Horse regiments routed', statEnemyShips: 'Men-of-war sunk',
            statFactories: 'Foundries built', statHarbors: 'Naval yards built', statForts: 'Redoubts built',
            statTrainLight: 'Musket lines formed', statTrainMarine: 'Naval infantry raised', statTrainHeavy: 'Horse regiments raised', statTrainShip: 'Ships commissioned',
            achHunter: 'Cavalry breaker', achHunterDesc: 'Rout 200 enemy horse regiments (lifetime).',
            achIndustrial: 'Arsenal master', achIndustrialDesc: 'Build 12 foundries in towns you control.',
            achAdmiralty: 'Grand admiral', achAdmiraltyDesc: 'Build 12 naval yards in towns you control.',
            helpHeavy: 'Horse regiments', matrixHeavy: 'Cavalry'
        },
        ancient: {
            light: 'Hoplites', marine: 'Marines (oarsmen)', heavy: 'Chariots', ship: 'Trireme',
            convoyLand: 'Supply caravan', convoySea: 'Grain convoy',
            trainLight: 'Levy hoplites ($1000, 2k MP)', trainMarine: 'Embark marines ($1000, 2k MP)',
            trainHeavy: 'Field chariots ($8k, 2k MP)', trainShip: 'Launch trireme ($7.6k, 10k MP)',
            factory: 'Workshop', farm: 'Grain fields', harbor: 'Emporion', fort: 'Palisade',
            cityTown: 'Polis', cityPort: 'Emporion', cityIndustrial: 'Workshop polis', cityPortIndustrial: 'Great emporion',
            unitLight: (n) => wodOrdinal(n) + ' Hoplite Lochos',
            unitMarine: (n) => wodOrdinal(n) + ' Epibatai',
            unitHeavy: (n) => wodOrdinal(n) + ' Hippikon Tagma',
            unitShip: (n) => 'Trireme ' + cityStarts[Math.floor(Math.random() * cityStarts.length)],
            unitConvoy: (n, sea) => (sea ? 'Nautikos konvoi ' : 'Chorēgía konvoi ') + n,
            hudHeavy: 'Chariots', hudShips: 'Triremes', hudInfantryLost: 'Hoplites lost', hudHeavyLost: 'Chariots lost', hudShipsLost: 'Triremes lost',
            hudInfantryKills: 'Hoplites', hudHeavyKills: 'Chariots', hudShipsKills: 'Triremes',
            heavyCount: 'Chariots', playerSummaryHeavy: 'Chariots', summaryHeavyDestroyed: 'Chariots lost',
            statOwnInfantry: 'Hoplites lost', statOwnMarine: 'Marines lost', statOwnHeavy: 'Chariots lost', statOwnShips: 'Triremes lost',
            statEnemyInfantry: 'Hoplites shattered', statEnemyMarine: 'Marines shattered', statEnemyHeavy: 'Chariots destroyed', statEnemyShips: 'Triremes sunk',
            statFactories: 'Workshops built', statHarbors: 'Emporia built', statForts: 'Palisades built',
            statTrainLight: 'Hoplites levied', statTrainMarine: 'Marines embarked', statTrainHeavy: 'Chariots fielded', statTrainShip: 'Triremes launched',
            achHunter: 'Chariot slayer', achHunterDesc: 'Destroy 200 enemy chariots (lifetime).',
            achIndustrial: 'Master artisan', achIndustrialDesc: 'Build 12 workshops in towns you control.',
            achAdmiralty: 'Lord of the waves', achAdmiraltyDesc: 'Build 12 emporia in towns you control.',
            helpHeavy: 'Chariots', matrixHeavy: 'Chariots'
        },
        medieval: {
            light: 'Men-at-arms', marine: 'Sea raiders', heavy: 'Knights', ship: 'War galley',
            convoyLand: 'Pack train', convoySea: 'Hanse convoy',
            trainLight: 'Raise men-at-arms ($1000, 2k MP)', trainMarine: 'Embark sea raiders ($1000, 2k MP)',
            trainHeavy: 'Muster knights ($8k, 2k MP)', trainShip: 'Build war galley ($7.6k, 10k MP)',
            factory: 'Smithy', farm: 'Manor fields', harbor: 'Quay', fort: 'Keep',
            cityTown: 'Bailiwick', cityPort: 'Port town', cityIndustrial: 'Castle town', cityPortIndustrial: 'Castle port',
            unitLight: (n) => wodOrdinal(n) + ' Company of Foot',
            unitMarine: (n) => wodOrdinal(n) + ' Sea Company',
            unitHeavy: (n) => wodOrdinal(n) + ' Order of Knights',
            unitShip: (n) => 'Galley ' + cityStarts[Math.floor(Math.random() * cityStarts.length)],
            unitConvoy: (n, sea) => (sea ? 'Sea pack train ' : 'Land pack train ') + n,
            hudHeavy: 'Knights', hudShips: 'Galleys', hudInfantryLost: 'Foot lost', hudHeavyLost: 'Knights lost', hudShipsLost: 'Galleys lost',
            hudInfantryKills: 'Foot', hudHeavyKills: 'Knights', hudShipsKills: 'Galleys',
            heavyCount: 'Knights', playerSummaryHeavy: 'Knights', summaryHeavyDestroyed: 'Knights lost',
            statOwnInfantry: 'Men-at-arms lost', statOwnMarine: 'Sea raiders lost', statOwnHeavy: 'Knights lost', statOwnShips: 'Galleys lost',
            statEnemyInfantry: 'Men-at-arms slain', statEnemyMarine: 'Sea raiders slain', statEnemyHeavy: 'Knights unhorsed', statEnemyShips: 'Galleys sunk',
            statFactories: 'Smithies built', statHarbors: 'Quays built', statForts: 'Keeps built',
            statTrainLight: 'Men-at-arms raised', statTrainMarine: 'Sea raiders raised', statTrainHeavy: 'Knights mustered', statTrainShip: 'Galleys built',
            achHunter: 'Knight breaker', achHunterDesc: 'Unhorse 200 enemy knights (lifetime).',
            achIndustrial: 'Royal smith', achIndustrialDesc: 'Build 12 smithies in towns you control.',
            achAdmiralty: 'Hanse captain', achAdmiraltyDesc: 'Build 12 quays in towns you control.',
            helpHeavy: 'Knights', matrixHeavy: 'Knights'
        }
    };
    return F[period] || F.modern;
}
function wodCombinedStatsFlavor() {
    return {
        statOwnInfantry: 'Infantry lost', statOwnMarine: 'Marines lost', statOwnHeavy: 'Heavy units lost', statOwnShips: 'Ships lost',
        statEnemyInfantry: 'Infantry eliminated', statEnemyMarine: 'Marines eliminated', statEnemyHeavy: 'Heavy units destroyed', statEnemyShips: 'Ships sunk',
        statFactories: 'Factories built', statHarbors: 'Harbors built', statForts: 'Forts built',
        statTrainLight: 'Light troops trained', statTrainMarine: 'Marines trained', statTrainHeavy: 'Heavy units trained', statTrainShip: 'Ships trained'
    };
}
function wodStatsFlavor(period) {
    if(period === 'all') return wodCombinedStatsFlavor();
    return wodPeriodFlavor(period);
}
function wodHasAnyEraSkinUnlocked() {
    return WOD_PERIOD_SKIN_IDS.some((id) => wodIsPeriodUnlocked(id));
}
function wodListUnlockedPeriodIds() {
    let ids = ['modern'];
    for(let sid of WOD_PERIOD_SKIN_IDS) {
        if(wodIsPeriodUnlocked(sid)) ids.push(sid);
    }
    return ids.filter((id) => WOD_PERIOD_IDS.indexOf(id) >= 0).sort((a, b) => WOD_PERIOD_IDS.indexOf(a) - WOD_PERIOD_IDS.indexOf(b));
}
function wodListAllPeriodIds() {
    return WOD_PERIOD_IDS.slice();
}
function wodGetRenderPeriod() {
    if(gameData._artPreviewPeriod)return gameData._artPreviewPeriod;
    if(gameState === 'PLAYING' || gameState === 'PAUSED') return wodGetMatchPeriod();
    return wodGetGamePeriod();
}
function wodUrbanPeriodStyle(period) {
    period = period || wodGetRenderPeriod();
    const S = {
        modern: { base: '#7f8c8d', blockA: '#5f666b', blockB: '#858d92', stroke: 'rgba(10,12,14,0.55)' },
        napoleonic: { base: '#a89478', blockA: '#6b5744', blockB: '#8f7a62', stroke: 'rgba(28,18,10,0.58)' },
        medieval: { base: '#8f8678', blockA: '#5a5248', blockB: '#746b5e', stroke: 'rgba(18,14,10,0.62)' },
        ancient: { base: '#c9b896', blockA: '#9a8668', blockB: '#b5a07a', stroke: 'rgba(42,32,18,0.55)' }
    };
    return S[period] || S.modern;
}
function wodRefreshUrbanHexColorsForPeriod(period) {
    period = period || wodGetGamePeriod();
    let col = getUrbanTerrainColor(period);
    if(!gameData.hexList) return;
    let changed = false;
    for(let h of gameData.hexList) {
        if(h.type === 'urban' && h.baseColor !== col) {
            h.baseColor = col;
            h.renderColor = col;
            changed = true;
        }
    }
    // Only rebake when a color actually changed — server profile syncs call this
    // repeatedly mid-match, and an unconditional full rebake cost ~330ms per sync
    // (the "small freeze every few seconds" during play).
    if(changed) wodMarkTerrainFullDirty();
}
function wodRebuildEditorPeriodSelectEl(el) {
    if(!el) return;
    let cur = gameData.gamePeriod || 'modern';
    if(!WOD_PERIOD_IDS.includes(cur)) cur = 'modern';
    el.innerHTML = wodListAllPeriodIds().map((pid) =>
        '<option value="' + pid + '">' + wodPeriodLabel(pid) + '</option>'
    ).join('');
    el.value = cur;
}
function wodRebuildPeriodSelectEl(el) {
    if(!el) return;
    let cur = wodIsPeriodUnlocked(gameData.gamePeriod) ? gameData.gamePeriod : 'modern';
    if(!wodHasAnyEraSkinUnlocked()) {
        el.innerHTML = '';
        return;
    }
    el.innerHTML = wodListUnlockedPeriodIds().map((pid) =>
        '<option value="' + pid + '">' + wodPeriodLabel(pid) + '</option>'
    ).join('');
    wodSyncPeriodSelectEl(el, cur);
}
function wodRefreshPeriodSelectorVisibility() {
    let show = wodHasAnyEraSkinUnlocked();
    for(let id of ['setupGamePeriodRow', 'settingsGamePeriodSection', 'mpCfgGamePeriodRow', 'wodCampGamePeriodRow', 'wodCampActiveGamePeriodRow', 'wodMissionGamePeriodRow']) {
        let row = document.getElementById(id);
        if(row) row.classList.toggle('hidden', !show);
    }
    if(show) {
        for(let id of ['setupGamePeriod', 'settingsGamePeriod', 'mpCfgGamePeriod', 'wodCampGamePeriod', 'wodCampActiveGamePeriod', 'wodMissionGamePeriod']) {
            wodRebuildPeriodSelectEl(document.getElementById(id));
        }
    }
    wodRebuildEditorPeriodSelectEl(document.getElementById('editorMapPeriod'));
}
function wodActivePeriodFlavor() {
    let p = (gameState === 'PLAYING' || gameState === 'PAUSED') ? wodGetMatchPeriod() : wodGetGamePeriod();
    return wodPeriodFlavor(p);
}
function wodSyncPeriodSelectEl(el, period) {
    if(!el) return;
    period = period || wodGetGamePeriod();
    for(let opt of el.options) {
        let locked = !wodIsPeriodUnlocked(opt.value);
        opt.disabled = locked;
        opt.hidden = false;
    }
    if(wodIsPeriodUnlocked(period)) el.value = period;
    else el.value = 'modern';
}
function wodSyncAllPeriodSelects() {
    wodRefreshPeriodSelectorVisibility();
    if(!wodHasAnyEraSkinUnlocked()) return;
    wodSyncPeriodSelectEl(document.getElementById('setupGamePeriod'), gameData.gamePeriod);
    wodSyncPeriodSelectEl(document.getElementById('settingsGamePeriod'), gameData.gamePeriod);
    wodSyncPeriodSelectEl(document.getElementById('mpCfgGamePeriod'), gameData.gamePeriod);
    wodSyncPeriodSelectEl(document.getElementById('wodCampGamePeriod'), gameData.gamePeriod);
    wodSyncPeriodSelectEl(document.getElementById('wodCampActiveGamePeriod'), gameData.gamePeriod);
    wodSyncPeriodSelectEl(document.getElementById('wodMissionGamePeriod'), gameData.gamePeriod);
    wodRebuildEditorPeriodSelectEl(document.getElementById('editorMapPeriod'));
}
function wodApplyPeriodUiLabels() {
    let f = wodActivePeriodFlavor();
    document.querySelectorAll('.build-btn').forEach(btn => {
        let oc = btn.getAttribute('onclick') || '';
        if(oc.indexOf('beginFactoryBuild') >= 0) btn.textContent = 'Build ' + f.factory + ' ($4k)';
        else if(oc.indexOf('beginFarmBuild') >= 0) btn.textContent = 'Build ' + (f.farm || 'Farm') + ' ($2.4k)';
        else if(oc.indexOf('beginHarborBuild') >= 0) btn.textContent = 'Build ' + f.harbor + ' ($2k)';
        else if(oc.indexOf('beginFortBuild') >= 0) btn.textContent = 'Build ' + (f.fort || 'Fort') + ' ($3k)';
        else if(oc.indexOf("buyUnit('light')") >= 0) btn.textContent = f.trainLight;
        else if(oc.indexOf("buyUnit('motorized')") >= 0)btn.textContent='Train '+wodSpecialistLabel('motorized')+' ($3k, 2.4k MP)';
        else if(oc.indexOf("buyUnit('mountaineer')") >= 0)btn.textContent='Train '+wodSpecialistLabel('mountaineer')+' ($1.6k, 2k MP)';
        else if(oc.indexOf("buyUnit('marine')") >= 0) btn.textContent = f.trainMarine;
        else if(oc.indexOf("buyUnit('heavy')") >= 0) btn.textContent = f.trainHeavy;
        else if(oc.indexOf("buyUnit('ship')") >= 0) btn.textContent = f.trainShip;
        let unitMode = /buyUnit\('([^']+)'\)/.exec(oc)?.[1];
        let buildMode = Object.entries({ Factory:'factory', Farm:'farm', Harbor:'harbor', Fort:'fort', Hospital:'hospital', Bridge:'bridge' }).find(([name]) => oc.includes('begin'+name+'Build'))?.[1];
        let mode = unitMode || buildMode;
        if(mode) btn.title = btn.textContent + ' · ' + WOD_PRODUCTION_SECONDS[mode] + ' seconds' + (mode === 'bridge' ? ' · drag from one bank to the other, up to ' + WOD_BRIDGE_MAX_CELLS + ' water cells' : '');
        if(mode && btn.closest('.wod-m-sheet--units,.wod-m-sheet--build')) {
            // Stable semantic fields keep long era names separate from price and timing.
            const price=unitMode?getUnitCost(mode).money:({factory:WOD_PRICE_FACTORY,farm:WOD_PRICE_FARM,harbor:WOD_PRICE_HARBOR,fort:WOD_PRICE_FORT,hospital:WOD_PRICE_HOSPITAL,bridge:WOD_PRICE_BRIDGE_PER_CELL})[mode];
            const requirement=mode==='motorized'||mode==='heavy'?f.factory:['ship','transport','supply'].includes(mode)?f.harbor:mode==='marine'?'Coastal town':unitMode?'Town':mode==='bridge'?'Friendly bank':['fort','hospital'].includes(mode)?'Friendly land':mode==='harbor'?'Coastal town':'Town';
            const cost='$'+(price/1000).toLocaleString('en-US',{maximumFractionDigits:1})+'k'+(unitMode?' · '+(getUnitCost(mode).manpower/1000).toLocaleString('en-US',{maximumFractionDigits:1})+'k MP':mode==='bridge'?' per cell':'');
            btn.dataset.productionMode=mode;
            btn.innerHTML='<strong class="production-name">'+wodEscapeHtmlLite(mode==='transport'?wodTransportLabel():wodProductionLabel(mode))+'</strong><span class="production-cost">'+cost+'</span><small class="production-meta">'+WOD_PRODUCTION_SECONDS[mode]+'s · '+wodEscapeHtmlLite(requirement)+'</small>';
        }
    });
    wodUpdateShopUnitLabels();
    wodSetChipPrefix('ui-tanks', f.hudHeavy);
    wodSetChipPrefix('ui-ships', f.hudShips);
    wodSetChipPrefix('ui-casualties', f.hudInfantryLost);
    wodSetChipPrefix('ui-tank-casualties', f.hudHeavyLost);
    wodSetChipPrefix('ui-ship-casualties', f.hudShipsLost);
    wodSetChipPrefix('ui-enemy-casualties', f.hudInfantryKills);
    wodSetChipPrefix('ui-tank-kills', f.hudHeavyKills);
    wodSetChipPrefix('ui-ship-kills', f.hudShipsKills);
    if(typeof renderPlayerSummary === 'function') renderPlayerSummary();
}
function wodInitMissionPeriodBinding() {
    let sel = document.getElementById('wodMissionGamePeriod');
    if(!sel || sel._wodBound) return;
    sel._wodBound = true;
    sel.addEventListener('change', () => wodApplyGamePeriod(sel.value, { saveProfile: true }));
}
function wodInitCampaignPeriodBinding() {
    for(let id of ['wodCampGamePeriod', 'wodCampActiveGamePeriod']) {
        let sel = document.getElementById(id);
        if(!sel || sel._wodBound) continue;
        sel._wodBound = true;
        sel.addEventListener('change', () => {
            wodApplyGamePeriod(sel.value, { saveProfile: true });
            let c = wodRogueLoad();
            if(c && c.settings) {
                c.settings.gamePeriod = gameData.gamePeriod;
                wodRogueSave();
            }
        });
    }
}
function wodGetCampaignGamePeriod() {
    let c = wodRogueLoad();
    if(c && c.settings && c.settings.gamePeriod && wodIsPeriodUnlocked(c.settings.gamePeriod))
        return c.settings.gamePeriod;
    let activeSel = document.getElementById('wodCampActiveGamePeriod');
    if(activeSel && activeSel.value && wodIsPeriodUnlocked(activeSel.value)) return activeSel.value;
    let setupSel = document.getElementById('wodCampGamePeriod');
    if(setupSel && setupSel.value && wodIsPeriodUnlocked(setupSel.value)) return setupSel.value;
    return wodGetGamePeriod();
}
function wodApplyGamePeriod(period, opts) {
    opts = opts || {};
    if(!period || !WOD_PERIOD_IDS.includes(period)) period = 'modern';
    if(!opts.allowAnyPeriod && !wodIsPeriodUnlocked(period)) period = 'modern';
    gameData.gamePeriod = period;
    if(gameState === 'PLAYING' || gameState === 'PAUSED') gameData._matchPeriod = period;
    wodRefreshUrbanHexColorsForPeriod(period);
    wodSyncAllPeriodSelects();
    wodApplyPeriodUiLabels();
    renderShopArmyCanvases();
    renderSkinShopGridCanvases();
    renderHelpMiniDiagrams();
    updateTerrainKey();
    if(typeof scheduleEditorRender === 'function') scheduleEditorRender();
    let achPanel = document.getElementById('achievementsPanel');
    if(achPanel && !achPanel.classList.contains('hidden')) renderAchievementsUi();
    if(opts.saveProfile !== false && wodProgress) {
        if(!wodProgress.profile) wodProgress.profile = {};
        wodProgress.profile.gamePeriod = period;
        gameData._periodPreferenceChangedAt=Date.now();
        wodProgress.profile.gamePeriodChangedAt=gameData._periodPreferenceChangedAt;
        scheduleSaveWodProgress();
    }
}
