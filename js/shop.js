// Shop, skins and gold.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

function wodEnsureUiShopDefaults() {
    let u = gameData.uiSettings;
    if(!u) gameData.uiSettings = {};
    u = gameData.uiSettings;
    if(!wodIsFrontlineStyle(u.frontlineStyle))
        u.frontlineStyle = 'solid';
    if(!wodIsCommandArrowStyle(u.commandArrowStyle))
        u.commandArrowStyle = 'default';
    if(u.lineColor && !u.frontlineColor) u.frontlineColor = u.lineColor === 'yellow' ? 'gold' : u.lineColor;
    if(u.lineColor && !u.commandArrowColor) u.commandArrowColor = u.lineColor === 'yellow' ? 'gold' : u.lineColor;
    if(typeof u.commandArrowColor === 'string' && u.commandArrowColor === 'yellow') u.commandArrowColor = 'gold';
    if(u.frontlineColor === 'silver') u.frontlineColor = 'black';
    if(u.commandArrowColor === 'silver') u.commandArrowColor = 'black';
    if(!['gold', 'black', 'white', 'red', 'blue'].includes(u.frontlineColor)) u.frontlineColor = 'black';
    if(!['gold', 'black', 'white', 'red', 'blue'].includes(u.commandArrowColor)) u.commandArrowColor = 'black';
    if(!['default','atlas_hd',...Object.keys(WodStoreCatalog.mapPacks)].includes(u.mapSkin)) u.mapSkin = 'default';
}
function wodHasSupporterPack() {
    // The Supporter Pack is no longer sold. Existing owners (Steam DLC or a
    // granted, unreversed order) keep Patron Gold and the era unlocks; the
    // Steam wallet reports that ownership as wallet.supporter.
    return !!window.WodSteamStore?.state.wallet?.supporter;
}
function wodApplySupporterFromLaunch() {
    // Paid ownership is restored by Steam verification, never URL flags.
    gameData.supporterPack = false;
}
function wodEnsureOwnedShopVisuals() {
    if(!gameData.ownedShopVisuals) gameData.ownedShopVisuals = {};
}
function wodOwnsShopVisual(shopId) {
    if(!shopId) return true;
    wodEnsureOwnedShopVisuals();
    return !!gameData.ownedShopVisuals[shopId]||(shopId==='map_atlas_hd'&&!!gameData.ownedUnitSkins?.atlasUnits);
}
function purchaseAllShopSkins(sectionKey) {
    if(!gameData.ownedUnitSkins) gameData.ownedUnitSkins = { nato: true };
    let ids = WOD_SHOP_PURCHASABLE_SECTIONS[sectionKey];
    if(!ids || !ids.length) return;
    let toBuy = ids.filter(id => !wodShopSkinOwned(id));
    if(toBuy.length === 0) {
        showNotification('You already own everything in this section.');
        return;
    }
    if(WodSteamStore.native() || wodCloudCanSync()) {
        void wodCloudTryPurchase({ kind: 'skin_bulk', section: sectionKey }).then(ok => {
            if(!ok) return;
            showNotification('Unlocked skins! Equip them from the dropdowns above.');
            updateSkinShop();
            wodSyncAllPeriodSelects();
            wodRefreshPeriodSelectorVisibility();
        });
        return;
    }
    let cost = toBuy.reduce((sum, id) => sum + wodShopSkinCost(id), 0);
    if((gameData.gold || 0) < cost) {
        showNotification('Not enough gold! Need ' + cost + 'g for ' + toBuy.length + ' item(s).');
        return;
    }
    gameData.gold -= cost;
    for(let id of toBuy) {
        if(WOD_ANCIENT_CIV_PACK_IDS.includes(id)) wodGrantAncientCivPack(gameData.ownedUnitSkins, id);
        else gameData.ownedUnitSkins[id] = true;
    }
    showNotification('Unlocked ' + toBuy.length + ' skin(s)! Equip them from the dropdowns above.');
    updateSkinShop();
    wodSyncAllPeriodSelects();
    wodRefreshPeriodSelectorVisibility();
    scheduleSaveWodProgress();
}
function wodCloudTryPurchase(req) {
    if(window.WodSteamStore?.native()) return WodSteamStore.spend(req);
    return new Promise(resolve => {
        if(!wodCloudCanSync()) { resolve(false); return; }
        wodEnsurePlayerId();
        let pid = wodProgress.profile.playerId;
        let done = false;
        function finish(ok) {
            if(done) return;
            done = true;
            clearTimeout(to);
            removeEventListener('wod-mp-ShopPurchaseOk', onOk);
            removeEventListener('wod-mp-ShopFailed', onFail);
            resolve(ok);
        }
        function onOk(ev) {
            if(ev.detail && ev.detail.profile) wodApplyServerProfile(ev.detail.profile, { shopPurchase: true });
            finish(true);
        }
        function onFail(ev) {
            if(ev.detail && ev.detail.msg) showNotification(ev.detail.msg);
            finish(false);
        }
        addEventListener('wod-mp-ShopPurchaseOk', onOk);
        addEventListener('wod-mp-ShopFailed', onFail);
        let to = setTimeout(() => finish(false), 8000);
        WodMultiplayer.shopPurchase(pid, req || {});
    });
}
function wodShopSkinCost(skin) {
    return WodStoreCatalog.skinCost(skin);
}
function wodShopSkinOwned(skin) {
    const premium = WodStoreCatalog.premiumBase(skin);
    if(premium === 'supporterGold') return wodHasSupporterPack();
    if(premium === 'goldenChip') return !!gameData.ownedUnitSkins?.goldenChip;
    if(!gameData.ownedUnitSkins) return false;
    if(WOD_ANCIENT_CIV_PACK_IDS.includes(skin) && typeof wodAncientCivPackOwned === 'function')
        return wodAncientCivPackOwned(gameData.ownedUnitSkins, skin);
    if(WOD_ANCIENT_CIV_SKIN_IDS.includes(skin) && typeof wodAncientCivVariantOwned === 'function')
        return wodAncientCivVariantOwned(gameData.ownedUnitSkins, skin);
    return !!gameData.ownedUnitSkins[skin];
}
function ownedShopSkinMetaList() {
    if(!gameData.ownedUnitSkins) gameData.ownedUnitSkins = { nato: true };
    return shopSkinMetaList().filter(row => wodShopSkinOwned(row.id));
}
function shopSkinMetaList() {
    let civRows = typeof wodAncientCivShopMetaList === 'function'
        ? wodAncientCivShopMetaList()
        : [
            { id: 'civRome', label: 'Rome — Eagle' },
            { id: 'civCarthage', label: 'Carthage — Tanit' },
            { id: 'civGaul', label: 'Gaul — Triskelion' }
        ];
    return [
        { id: 'nato', label: 'NATO counters (default)' },
        { id: 'napoleonic', label: 'Napoleonic' },
        { id: 'medieval', label: 'Medieval era' },
        { id: 'ancient', label: 'Ancient era' },
        ...civRows,
        { id: 'usa', label: 'USA countryball' },
        { id: 'uk', label: 'UK countryball' },
        { id: 'germany', label: 'Germany countryball' },
        { id: 'france', label: 'France countryball' },
        { id: 'japan', label: 'Japan countryball' },
        { id: 'ussr', label: 'Soviet Union countryball' },
        { id: 'italy', label: 'Italy countryball' },
        { id: 'china', label: 'China countryball' },
        { id: 'ruseUsa', label: 'WW2 — USA' },
        { id: 'ruseUk', label: 'WW2 — United Kingdom' },
        { id: 'ruseFrance', label: 'WW2 — France' },
        { id: 'ruseGermany', label: 'WW2 — Germany' },
        { id: 'ruseUssr', label: 'WW2 — Soviet Union' },
        { id: 'ruseJapan', label: 'WW2 — Japan' },
        { id: 'ruseItaly', label: 'WW2 — Italy' },
        { id: 'ruseChina', label: 'WW2 — China' },
        ...['supporterGold', 'goldenChip'].flatMap(base => WodStoreCatalog.premiumVariants(base).map(id => ({id, label: (base === 'supporterGold' ? 'Patron Gold' : 'Sovereign') + ' · ' + ({modern:'Modern',napoleonic:'Napoleonic',medieval:'Medieval',ancient:'Ancient'}[WodStoreCatalog.premiumPeriod(id)])})))
    ];
}
function wodSkinShopCardId(skin) {
    if(skin === 'uk') return 'skinUk';
    if(skin === 'goldenChip') return 'skinGoldenChip';
    if(skin === 'napoleonic') return 'skinNapoleonic';
    if(skin === 'ancient') return 'skinAncient';
    if(skin === 'medieval') return 'skinMedieval';
    if(skin === 'ussr') return 'skinUssr';
    if(skin === 'ruseUsa') return 'skinRuseUsa';
    if(skin === 'ruseUk') return 'skinRuseUk';
    if(skin === 'ruseFrance') return 'skinRuseFrance';
    if(skin === 'ruseGermany') return 'skinRuseGermany';
    if(skin === 'ruseUssr') return 'skinRuseUssr';
    if(skin === 'ruseJapan') return 'skinRuseJapan';
    if(skin === 'civRome') return 'skinCivRome';
    if(skin === 'civCarthage') return 'skinCivCarthage';
    if(skin === 'civEgypt') return 'skinCivEgypt';
    if(skin === 'civMacedon') return 'skinCivMacedon';
    if(skin === 'civSparta') return 'skinCivSparta';
    if(skin === 'civGaul') return 'skinCivGaul';
    if(skin === 'ruseItaly') return 'skinRuseItaly';
    if(skin === 'ruseChina') return 'skinRuseChina';
    return 'skin' + skin.charAt(0).toUpperCase() + skin.slice(1);
}
function wodShopPreviewColor(which) {
    let hex = which === 'player'
        ? (gameData.shopPreviewPlayerColor || factionColors[1] || '#2ecc71')
        : (gameData.shopPreviewAiColor || factionColors[2] || '#e74c3c');
    return /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : (which === 'player' ? '#2ecc71' : '#e74c3c');
}
function wodEnsureShopPreviewColors() {
    if(!/^#[0-9A-Fa-f]{6}$/.test(gameData.shopPreviewPlayerColor || ''))
        gameData.shopPreviewPlayerColor = factionColors[1] || '#2ecc71';
    if(!/^#[0-9A-Fa-f]{6}$/.test(gameData.shopPreviewAiColor || ''))
        gameData.shopPreviewAiColor = factionColors[2] || '#e74c3c';
}
function syncShopColorSwatch(which) {
    wodEnsureShopPreviewColors();
    let sw = document.getElementById(which === 'player' ? 'shopColorSwatchPlayer' : 'shopColorSwatchAi');
    if(sw) sw.style.background = wodShopPreviewColor(which);
}
function closeShopColorMenus() {
    ['shopColorMenuPlayer', 'shopColorMenuAi'].forEach(mid => {
        let m = document.getElementById(mid);
        if(m) m.classList.remove('open');
    });
    ['shopColorTriggerPlayer', 'shopColorTriggerAi'].forEach(tid => {
        let t = document.getElementById(tid);
        if(t) t.setAttribute('aria-expanded', 'false');
    });
}
function setShopPreviewColor(which, hex) {
    if(!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
    if(which === 'player') {
        gameData.shopPreviewPlayerColor = hex;
        factionColors[1] = hex;
        let setup = document.getElementById('setupPlayerColor');
        if(setup) setup.value = hex;
        let mpSetup = document.getElementById('mpCfgPlayerColor');
        if(mpSetup) mpSetup.value = hex;
        ensureAiFactionColorsDistinctFromPlayer();
    } else {
        gameData.shopPreviewAiColor = hex;
    }
    syncShopColorSwatch(which);
    syncShopSkinBar(which);
    renderShopArmyCanvases();
    renderSkinShopGridCanvases();
    scheduleSaveWodProgress();
}
function buildShopColorMenu(which) {
    let menuId = which === 'player' ? 'shopColorMenuPlayer' : 'shopColorMenuAi';
    let menu = document.getElementById(menuId);
    if(!menu) return;
    let cur = wodShopPreviewColor(which);
    menu.innerHTML = '';
    for(let row of WOD_FACTION_COLOR_OPTIONS) {
        let btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'shop-color-picker-option' + (row.value.toLowerCase() === cur.toLowerCase() ? ' active' : '');
        let dot = document.createElement('span');
        dot.className = 'shop-color-picker-swatch';
        dot.style.background = row.value;
        let txt = document.createElement('span');
        txt.textContent = row.label;
        btn.append(dot, txt);
        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            setShopPreviewColor(which, row.value);
            closeShopColorMenus();
        });
        menu.appendChild(btn);
    }
}
function initShopColorPickers() {
    wodEnsureShopPreviewColors();
    syncShopColorSwatch('player');
    syncShopColorSwatch('ai');
    buildShopColorMenu('player');
    buildShopColorMenu('ai');
    let tP = document.getElementById('shopColorTriggerPlayer');
    let tA = document.getElementById('shopColorTriggerAi');
    if(tP && !tP._shopColorBound) {
        tP._shopColorBound = true;
        tP.addEventListener('click', (ev) => {
            ev.stopPropagation();
            let menu = document.getElementById('shopColorMenuPlayer');
            let open = menu && menu.classList.contains('open');
            closeShopColorMenus();
            closeShopSkinMenus();
            if(menu && !open) {
                buildShopColorMenu('player');
                menu.classList.add('open');
                tP.setAttribute('aria-expanded', 'true');
            }
        });
    }
    if(tA && !tA._shopColorBound) {
        tA._shopColorBound = true;
        tA.addEventListener('click', (ev) => {
            ev.stopPropagation();
            let menu = document.getElementById('shopColorMenuAi');
            let open = menu && menu.classList.contains('open');
            closeShopColorMenus();
            closeShopSkinMenus();
            if(menu && !open) {
                buildShopColorMenu('ai');
                menu.classList.add('open');
                tA.setAttribute('aria-expanded', 'true');
            }
        });
    }
    if(!window._shopColorCloseBound) {
        window._shopColorCloseBound = true;
        document.addEventListener('click', (e) => {
            if(e.target.closest && e.target.closest('.shop-color-picker')) return;
            closeShopColorMenus();
        });
    }
}
function renderShopSkinThumbCanvas(cnv, skinId, previewColor) {
    if(!cnv || typeof cnv.getContext !== 'function') return;
    let ctx = cnv.getContext('2d');
    let w = cnv.width, h = cnv.height, m = Math.min(w, h);
    ctx.save();
    if(skinId === 'goldenChip' && !(gameData.ownedUnitSkins && gameData.ownedUnitSkins.goldenChip)) {
        ctx.fillStyle = '#1c2833';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#5d6d7e';
        ctx.font = 'bold ' + Math.floor(m * 0.42 + 8) + 'px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', w / 2, h / 2);
        ctx.restore();
        return;
    }
    ctx.fillStyle = '#0f1823';
    ctx.fillRect(0, 0, w, h);
    let u = {
        type: 'light',
        owner: 1,
        hp: 100,
        maxHp: 100,
        manpower: 1000,
        tanks: 0,
        skinOverride: skinId, _skinPreview:true
    };
    let col = previewColor || factionColors[1];
    ctx.translate(w / 2, h / 2);
    ctx.scale(m / 50, m / 50);
    let rDraw = 15;
    let drawn = drawUnitSkin(ctx, u, rDraw, col);
    if(!drawn) {
        ctx.beginPath();
        ctx.arc(0, 0, rDraw, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.strokeStyle = '#050505';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    ctx.restore();
}
function renderShopAncientCivPackPreview(cnv, packId, previewColor) {
    if(!cnv || typeof cnv.getContext !== 'function') return;
    let variants = (typeof wodAncientCivPackVariants === 'function')
        ? wodAncientCivPackVariants(packId)
        : [packId];
    if(variants.length <= 1) {
        renderShopSkinThumbCanvas(cnv, variants[0], previewColor);
        return;
    }
    let ctx = cnv.getContext('2d');
    let w = cnv.width, h = cnv.height;
    ctx.save();
    ctx.fillStyle = '#0f1823';
    ctx.fillRect(0, 0, w, h);
    let col = previewColor || factionColors[1];
    let gap = Math.max(2, Math.round(w * 0.02));
    let halfW = (w - gap) / 2;
    let m = Math.min(halfW, h);
    for(let i = 0; i < 2; i++) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(i * (halfW + gap), 0, halfW, h);
        ctx.clip();
        ctx.translate(i * (halfW + gap) + halfW / 2, h / 2);
        ctx.scale(m / 50, m / 50);
        let u = {
            type: 'light',
            owner: 1,
            hp: 100,
            maxHp: 100,
            manpower: 1000,
            tanks: 0,
            skinOverride: variants[i], _skinPreview:true
        };
        drawUnitSkin(ctx, u, 15, col);
        ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(halfW + gap / 2, 4);
    ctx.lineTo(halfW + gap / 2, h - 4);
    ctx.stroke();
    ctx.restore();
}
function renderSkinShopGridCanvases() {
    let dim = wodSkinCardPreviewSize();
    [
        ['skinNatoPreview', 'nato'],
        ['skinUsaPreview', 'usa'],
        ['skinUkPreview', 'uk'],
        ['skinGermanyPreview', 'germany'],
        ['skinFrancePreview', 'france'],
        ['skinJapanPreview', 'japan'],
        ['skinGoldenChipPreview', 'goldenChip'],
        ['skinSupporterGoldPreview', 'supporterGold'],
        ['skinNapoleonicPreview', 'napoleonic'],
        ['skinMedievalPreview', 'medieval'],
        ['skinAncientPreview', 'ancient'],
        ['skinUssrPreview', 'ussr'],
        ['skinRuseUsaPreview', 'ruseUsa'],
        ['skinRuseUkPreview', 'ruseUk'],
        ['skinRuseFrancePreview', 'ruseFrance'],
        ['skinRuseGermanyPreview', 'ruseGermany'],
        ['skinRuseUssrPreview', 'ruseUssr'],
        ['skinRuseJapanPreview', 'ruseJapan'],
        ['skinItalyPreview', 'italy'],
        ['skinChinaPreview', 'china'],
        ['skinCivRomePreview', 'civRome'],
        ['skinCivCarthagePreview', 'civCarthage'],
        ['skinCivEgyptPreview', 'civEgypt'],
        ['skinCivMacedonPreview', 'civMacedon'],
        ['skinCivSpartaPreview', 'civSparta'],
        ['skinCivGaulPreview', 'civGaul'],
        ['skinRuseItalyPreview', 'ruseItaly'],
        ['skinRuseChinaPreview', 'ruseChina']
    ].forEach(([cid, packOrSkinId]) => {
        let c = document.getElementById(cid);
        if(!c) return;
        if(c.width !== dim.w || c.height !== dim.h) {
            c.width = dim.w;
            c.height = dim.h;
        }
        if(WOD_ANCIENT_CIV_PACK_IDS.includes(packOrSkinId)) {
            renderShopAncientCivPackPreview(c, packOrSkinId, wodShopPreviewColor('player'));
        } else {
            renderShopSkinThumbCanvas(c, packOrSkinId);
        }
    });
}
function shopSkinThumbClassList(id, baseClass) {
    let c = baseClass || 'shop-skin-picker-flag';
    if(id === 'goldenChip') return [c, 'shop-thumb-golden'];
    if(id === 'nato') return [c, 'nato-preview'];
    return [c, 'ball-preview', 'ball-' + id];
}
function setShopSkinPickerFlag(el, id, which) {
    if(!el) return;
    let col = wodShopPreviewColor(which || 'player');
    if(el.tagName === 'CANVAS') renderShopSkinThumbCanvas(el, id, col);
    else el.className = shopSkinThumbClassList(id, 'shop-skin-picker-flag').join(' ');
}
function syncShopSkinBar(which) {
    let skinId = which === 'player' ? gameData.unitSkin : (gameData.aiUnitSkin || 'nato');
    if(!wodShopSkinOwned(skinId)) skinId = 'nato';
    let meta = shopSkinMetaList().find(r => r.id === skinId) || shopSkinMetaList()[0];
    let flag = document.getElementById(which === 'player' ? 'shopSkinFlagPlayer' : 'shopSkinFlagAi');
    let lab = document.getElementById(which === 'player' ? 'shopSkinLabelPlayer' : 'shopSkinLabelAi');
    let sel = document.getElementById(which === 'player' ? 'shopSelectPlayer' : 'shopSelectAi');
    setShopSkinPickerFlag(flag, skinId, which);
    if(lab) lab.textContent = meta.label;
    if(sel && wodShopSkinOwned(skinId)) sel.value = skinId;
}
function closeShopSkinMenus() {
    ['shopSkinMenuPlayer', 'shopSkinMenuAi'].forEach(mid => {
        let m = document.getElementById(mid);
        if(m) m.classList.remove('open');
    });
    ['shopSkinTriggerPlayer', 'shopSkinTriggerAi'].forEach(tid => {
        let t = document.getElementById(tid);
        if(t) { t.setAttribute('aria-expanded', 'false'); }
    });
}
function buildShopSkinMenu(which) {
    let menuId = which === 'player' ? 'shopSkinMenuPlayer' : 'shopSkinMenuAi';
    let menu = document.getElementById(menuId);
    if(!menu) return;
    menu.innerHTML = '';
    for(let row of ownedShopSkinMetaList()) {
        let btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'shop-skin-option';
        let thumb = document.createElement('canvas');
        thumb.className = 'shop-skin-option-canvas';
        thumb.width = 36;
        thumb.height = 36;
        thumb.setAttribute('role', 'presentation');
        renderShopSkinThumbCanvas(thumb, row.id, wodShopPreviewColor(which));
        let txt = document.createElement('span');
        txt.textContent = row.label;
        btn.append(thumb, txt);
        btn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            equipShopSkinChoice(which, row.id);
        });
        menu.appendChild(btn);
    }
}
function equipShopSkinChoice(which, skinId) {
    if(!wodShopSkinOwned(skinId)) return;
    let sel = document.getElementById(which === 'player' ? 'shopSelectPlayer' : 'shopSelectAi');
    if(sel) sel.value = skinId;
    if(which === 'player') gameData.unitSkin = skinId;
    else gameData.aiUnitSkin = skinId;
    if(which === 'player') syncSetupPlayerColorRow();
    const period = WodStoreCatalog.premiumBase(skinId) ? WodStoreCatalog.premiumPeriod(skinId) : WOD_PERIOD_SKIN_IDS.includes(skinId) ? skinId : WOD_ANCIENT_CIV_SKIN_IDS.includes(skinId) ? 'ancient' : 'modern';
    wodApplyGamePeriod(period, {saveProfile:true});
    syncShopSkinBar(which);
    closeShopSkinMenus();
    renderShopArmyCanvases();
    scheduleSaveWodProgress();
    wodMpRefreshProfileCard();
}
function populateShopEquipSelects() {
    let selP = document.getElementById('shopSelectPlayer');
    let selA = document.getElementById('shopSelectAi');
    if(!selP || !selA) return;
    let rows = ownedShopSkinMetaList();
    let optHtml = rows.map(({ id, label }) =>
        `<option value="${id}">${label}</option>`
    ).join('');
    selP.innerHTML = optHtml;
    selA.innerHTML = optHtml;

    let curP = gameData.unitSkin || 'nato';
    let curA = gameData.aiUnitSkin || 'nato';
    if(!wodShopSkinOwned(curP)) curP = 'nato';
    if(!wodShopSkinOwned(curA)) curA = 'nato';
    selP.value = curP;
    selA.value = curA;
    gameData.unitSkin = curP;
    gameData.aiUnitSkin = curA;

    buildShopSkinMenu('player');
    buildShopSkinMenu('ai');
    syncShopSkinBar('player');
    syncShopSkinBar('ai');
    initShopColorPickers();
    syncSetupPlayerColorRow();

    let tP = document.getElementById('shopSkinTriggerPlayer');
    let tA = document.getElementById('shopSkinTriggerAi');
    if(tP && !tP._shopBound) {
        tP._shopBound = true;
        tP.addEventListener('click', (ev) => {
            ev.stopPropagation();
            let menu = document.getElementById('shopSkinMenuPlayer');
            let open = menu && menu.classList.contains('open');
            closeShopSkinMenus();
            if(menu && !open) {
                buildShopSkinMenu('player');
                menu.classList.add('open');
                tP.setAttribute('aria-expanded', 'true');
            }
        });
    }
    if(tA && !tA._shopBound) {
        tA._shopBound = true;
        tA.addEventListener('click', (ev) => {
            ev.stopPropagation();
            let menu = document.getElementById('shopSkinMenuAi');
            let open = menu && menu.classList.contains('open');
            closeShopSkinMenus();
            if(menu && !open) {
                buildShopSkinMenu('ai');
                menu.classList.add('open');
                tA.setAttribute('aria-expanded', 'true');
            }
        });
    }
    if(!window._shopSkinCloseBound) {
        window._shopSkinCloseBound = true;
        document.addEventListener('click', (e) => {
            if(e.target.closest && e.target.closest('.shop-skin-picker')) return;
            closeShopSkinMenus();
        });
    }
}
function wodShopArmyCanvasPx() {
    let iw = window.innerWidth || 800;
    if(iw < 380) return 52;
    if(iw < 520) return 58;
    if(iw < 900) return 64;
    return 72;
}
function renderShopArmyCanvases() {
    let map = wodShopUnitPreviewEntries();
    wodUpdateShopUnitLabels();
    let skinPlayer = gameData.unitSkin || 'nato';
    let skinAi = gameData.aiUnitSkin || 'nato';
    if(!wodShopSkinOwned(skinPlayer)) skinPlayer = 'nato';
    if(!wodShopSkinOwned(skinAi)) skinAi = 'nato';
    let px = wodShopArmyCanvasPx(),dpr=Math.min(2,window.devicePixelRatio||1);
    for(let [cid, ut] of map) {
        let cnv = document.getElementById(cid);
        if(!cnv) continue;
        if(cnv.width !== Math.round(px*dpr) || cnv.height !== Math.round(px*dpr)) {
            cnv.width = Math.round(px*dpr);
            cnv.height = Math.round(px*dpr);
        }
        let ctx2 = cnv.getContext('2d');
        let w = cnv.width, h = cnv.height;
        ctx2.save();
        ctx2.scale(cnv.width/px,cnv.height/px);
        w=px;h=px;
        ctx2.fillStyle = '#0f1823';
        ctx2.fillRect(0, 0, w, h);
        let owner = cid.indexOf('shopPv') === 0 ? 1 : 2;
        let skinOv = owner === 1 ? skinPlayer : skinAi;
        let u = {
            type: ut, owner: owner, x: 0, y: 0,
            target: ['ship','transport','supply'].includes(ut) ? { x: 48, y: -8 } : undefined,
            hp: WOD_SPECIALIST_UNITS[ut]?.hp || (ut === 'heavy' ? 300 : (ut === 'ship' ? 200 : 100)),
            maxHp: WOD_SPECIALIST_UNITS[ut]?.hp || (ut === 'heavy' ? 300 : (ut === 'ship' ? 200 : 100)),
            manpower: 1000, tanks: ut === 'heavy' ? 500 : 0, radius: 22,
            skinOverride: skinOv, _skinPreview:true
        };
        ctx2.translate(w / 2, h / 2);
        let drawScale = w <= 58 ? 0.72 : (w <= 64 ? 0.78 : 0.84);
        ctx2.scale(drawScale, drawScale);
        let uCol = owner === 1 ? wodShopPreviewColor('player') : wodShopPreviewColor('ai');
        let ur = u.radius || 22;
        if(!drawUnitSkin(ctx2, u, ur, uCol)) drawClassicUnitShape(ctx2, ut, ur, uCol, ut === 'ship' ? u : null);
        ctx2.restore();
    }
}
function wodShopUnitPreviewEntries() {
    return ['shopPv','shopAi'].flatMap(prefix=>['light','motorized','mountaineer','marine','heavy','ship','transport','supply'].map(type=>[prefix+type[0].toUpperCase()+type.slice(1),type]));
}
function wodUpdateShopUnitLabels() {
    for(const [id,type] of wodShopUnitPreviewEntries()) {
        const cnv=document.getElementById(id);if(!cnv)continue;
        const name=type==='transport'?wodTransportLabel():wodProductionLabel(type);
        cnv.setAttribute('role','img');cnv.setAttribute('aria-label',name+' skin preview');
        cnv.dataset.unitType=type;
        const label=cnv.parentElement.querySelector('.shop-unit-cell-label');if(label)label.textContent=name;
    }
}
let wodShopMapCatalog = [];
let wodShopMapCatalogLoaded = false;
let wodShopMapRenderToken = 0;
function wodShopMapShopId(mapId) {
    return 'shop_map_' + mapId;
}
function wodShopMissionStages() {
    return (wodShopMapCatalog||[]).flatMap(entry=>Array.isArray(entry.stages)&&entry.stages.length?
        entry.stages.map((s,i)=>({...s,storeMission:true,packType:'campaign',packId:entry.id,packName:entry.name,stageIndex:i,stageCount:entry.stages.length})):[entry]);
}
function wodNormalizeShopMissionEntry(raw) {
    if(!raw || !raw.id || !raw.file) return null;
    return Object.assign({}, raw, {
        storeMission: true,
        packType: raw.packType || raw.pack || 'oneshot',
        kind: raw.kind || 'mission',
        price: raw.priceVersion === 2 ? raw.price : WodStoreCatalog.price(raw.price || 150), priceVersion: 2
    });
}
async function wodLoadShopMapCatalog() {
    if(wodShopMapCatalogLoaded) return wodShopMapCatalog;
    try {
        let res = await fetch(WOD_SHOP_MAPS_DIR + 'manifest.json', { cache: 'no-cache' });
        if(!res.ok) throw new Error('manifest missing');
        let json = await res.json();
        let fromMissions = (json.missions || []).map(wodNormalizeShopMissionEntry).filter(Boolean);
        let fromMaps = (json.maps || []).map(wodNormalizeShopMissionEntry).filter(Boolean);
        // Prefer missions[] entries; merge unique map entries for legacy packs.
        let byId = Object.create(null);
        for(let m of fromMaps) byId[m.id] = m;
        for(let m of fromMissions) byId[m.id] = m;
        wodShopMapCatalog = Object.keys(byId).map(k => byId[k]);
    } catch(e) {
        wodShopMapCatalog = [];
        console.warn('wodLoadShopMapCatalog', e);
    }
    wodShopMapCatalogLoaded = true;
    return wodShopMapCatalog;
}
async function wodFetchShopMapData(entry) {
    if(!entry || !entry.id) return null;
    if(wodShopMapDataCache[entry.id]) return wodShopMapDataCache[entry.id];
    // Store missions may include full mission event blocks — reuse mission fetch when valid.
    if(entry.kind === 'mission' || entry.storeMission) {
        let missionData = await wodFetchMissionData(Object.assign({}, entry, { storeMission: true }));
        if(missionData) {
            wodShopMapDataCache[entry.id] = missionData;
            return missionData;
        }
    }
    let file = entry.file || (entry.id + '.json');
    try {
        let res = await fetch(WOD_SHOP_MAPS_DIR + file, { cache: 'no-cache' });
        if(!res.ok) throw new Error('map file missing');
        let data = await res.json();
        if(!data || !Array.isArray(data.hexList) || !data.hexList.length) throw new Error('invalid map export');
        wodShopMapDataCache[entry.id] = data;
        return data;
    } catch(e) {
        console.warn('wodFetchShopMapData', entry.id, e);
        return null;
    }
}
function purchaseShopMap(entry) {
    if(!entry || !entry.id) return false;
    let shopId = wodShopMapShopId(entry.id);
    if(wodOwnsShopVisual(shopId)) return true;
    if(WodSteamStore.native() || wodCloudCanSync()) {
        void wodCloudTryPurchase({ kind: 'map', itemId: shopId, price: Math.max(0, entry.price | 0) || WOD_SHOP_MAP_DEFAULT_PRICE }).then(ok => {
            if(!ok) return;
            showNotification('Mission unlocked! Open Missions → Store to play.');
            updateSkinShop();
            wodSyncSetupShopMapButton();
            if(typeof wodRefreshMissionsPanel === 'function') void wodRefreshMissionsPanel();
        });
        return false;
    }
    let price = Math.max(0, entry.price | 0) || WOD_SHOP_MAP_DEFAULT_PRICE;
    if((gameData.gold || 0) < price) {
        showNotification('Not enough gold!');
        return false;
    }
    gameData.gold -= price;
    wodEnsureOwnedShopVisuals();
    gameData.ownedShopVisuals[shopId] = true;
    showNotification('Mission unlocked! Open Missions → Store to play.');
    scheduleSaveWodProgress();
    updateSkinShop();
    wodSyncSetupShopMapButton();
    if(typeof wodRefreshMissionsPanel === 'function') void wodRefreshMissionsPanel();
    return true;
}
function wodGetOwnedShopMapEntries() {
    wodEnsureOwnedShopVisuals();
    return wodShopMapCatalog.filter(entry => entry && entry.id && wodOwnsShopVisual(wodShopMapShopId(entry.id)));
}
async function wodSyncSetupShopMapButton() {
    let btn = document.getElementById('setupBtnShopMaps');
    if(!btn || btn.style.display === 'none') return;
    await wodLoadShopMapCatalog();
    let owned = wodGetOwnedShopMapEntries();
    btn.disabled = owned.length === 0;
    btn.title = owned.length ? 'Choose an unlocked shop mission' : 'Unlock missions in the Shop first';
}
async function wodOpenSetupShopMapPicker() {
    await wodLoadShopMapCatalog();
    let owned = wodGetOwnedShopMapEntries();
    if(!owned.length) {
        showNotification('Unlock a mission in the Shop first.');
        return;
    }
    wodRenderShopMapPicker(owned);
    let pan = document.getElementById('shopMapPickerPanel');
    if(pan) pan.classList.remove('hidden');
}
function wodShopMapPickerBack() {
    let pan = document.getElementById('shopMapPickerPanel');
    if(pan) pan.classList.add('hidden');
}
async function wodApplyOwnedShopMapToSetup(entry) {
    if(!entry || !entry.id) return false;
    if(!wodOwnsShopVisual(wodShopMapShopId(entry.id))) {
        showNotification('Unlock this mission in the Shop first.');
        return false;
    }
    // Prefer launching store missions from the Missions panel.
    if(entry.kind === 'mission' || entry.storeMission || (entry.packType && entry.file)) {
        showNotification('Open Missions → Store to play purchased missions.');
        wodShopMapPickerBack();
        _wodMissionListTab = 'store';
        showPanel('missions');
        return false;
    }
    let data = await wodFetchShopMapData(entry);
    if(!data) {
        showNotification('Could not load mission file.');
        return false;
    }
    if(!wodApplyMapExportToSetup(data)) {
        showNotification('Mission data could not be applied.');
        return false;
    }
    gameData._equippedShopMapId = entry.id;
    if(wodProgress && wodProgress.profile) {
        wodProgress.profile.equippedShopMapId = entry.id;
        scheduleSaveWodProgress();
    }
    try {
        wodCaptureSoloPreviewSnapshot();
        gameData._soloMapPreviewMatchesStart = true;
    } catch(_) {
        gameData._soloMapPreviewMatchesStart = false;
    }
    wodShopMapPickerBack();
    showNotification((entry.name || entry.id) + ' loaded.');
    renderShopMapsTab();
    return true;
}
function wodRenderShopMapPicker(ownedEntries) {
    let host = document.getElementById('shopMapPickerList');
    let empty = document.getElementById('shopMapPickerEmpty');
    if(!host) return;
    host.innerHTML = '';
    if(!ownedEntries || !ownedEntries.length) {
        if(empty) empty.classList.remove('hidden');
        return;
    }
    if(empty) empty.classList.add('hidden');
    for(let entry of ownedEntries) {
        let equipped = gameData._equippedShopMapId === entry.id;
        let card = document.createElement('button');
        card.type = 'button';
        card.className = 'shop-option-card shop-map-card' + (equipped ? ' active' : '');
        card.title = entry.description || entry.name || entry.id;
        card.innerHTML =
            '<span class="shop-map-preview"><canvas width="280" height="96" aria-hidden="true"></canvas></span>' +
            '<span class="shop-map-meta">' +
            '<span class="shop-option-title">' + (entry.name || entry.id) + '</span>' +
            (entry.description ? '<span class="shop-option-desc">' + entry.description + '</span>' : '') +
            '<span class="shop-option-badge">' + (equipped ? 'Selected' : 'Owned') + '</span>' +
            '</span>';
        card.addEventListener('click', () => { wodApplyOwnedShopMapToSetup(entry); });
        host.appendChild(card);
        wodFetchShopMapData(entry).then(data => {
            if(!data || !card.isConnected) return;
            let cv = card.querySelector('canvas');
            if(cv) wodPaintMapDataOnCanvas(cv, data);
        });
    }
}
async function wodEquipShopMap(entry) {
    if(!entry || !entry.id) return false;
    let shopId = wodShopMapShopId(entry.id);
    if(!wodOwnsShopVisual(shopId)) {
        if(!purchaseShopMap(entry)) return false;
        // Cloud purchase is async — stop here; ack refreshes the shop.
        if(wodCloudCanSync() && !wodOwnsShopVisual(shopId)) return false;
    }
    // Purchased store missions are played from Missions → Store, not skirmish setup.
    if(entry.kind === 'mission' || entry.storeMission !== false) {
        showNotification('Owned! Open Missions → Store to deploy.');
        renderShopMapsTab();
        return true;
    }
    let data = await wodFetchShopMapData(entry);
    if(!data) {
        showNotification('Could not load mission file.');
        return false;
    }
    if(!wodApplyMapExportToSetup(data)) {
        showNotification('Mission data could not be applied.');
        return false;
    }
    gameData._equippedShopMapId = entry.id;
    if(wodProgress && wodProgress.profile) {
        wodProgress.profile.equippedShopMapId = entry.id;
        scheduleSaveWodProgress();
    }
    showNotification('Mission loaded for your next skirmish.');
    renderShopMapsTab();
    return true;
}
async function renderShopMapsTab() {
    let host = document.getElementById('shopMapOptions');
    if(!host) return;
    let token = ++wodShopMapRenderToken;
    await wodLoadShopMapCatalog();
    if(token !== wodShopMapRenderToken) return;
    host.innerHTML = '';
    if(!wodShopMapCatalog.length) {
        host.innerHTML = '<div class="shop-empty-state"><p><strong>Missions coming soon</strong></p></div>';
        return;
    }
    for(let entry of wodShopMapCatalog) {
        let shopId = wodShopMapShopId(entry.id);
        let owned = wodOwnsShopVisual(shopId);
        let price = Math.max(0, entry.price | 0) || WOD_SHOP_MAP_DEFAULT_PRICE;
        let spent = wodIsStoreMissionSpent(entry.id);
        let oneshot = wodIsStoreMissionOneShot(entry);
        let card = document.createElement('button');
        card.type = 'button';
        card.dataset.missionId=entry.id;
        card.className = 'shop-codex-card shop-mission-card' + (owned ? '' : ' shop-visual-locked') + (spent ? ' shop-mission-spent' : '');
        card.title = entry.description || entry.name || entry.id;
        let badge;
        if(!owned) badge = price + 'g';
        else if(spent && oneshot) badge = 'Done';
        else badge = entry.stages?entry.stages.filter(s=>wodIsStoreMissionCompleted(s.id)).length+' / '+entry.stages.length+' complete':'Owned';
        card.innerHTML =
            '<span class="shop-codex-art"><canvas width="560" height="300" aria-hidden="true"></canvas></span>' +
            '<span class="shop-codex-tag">' + badge + '</span>' +
            '<span class="shop-codex-name">' + wodEscapeHtml(entry.name || entry.id) + '</span>' +
            '<span class="shop-mission-meta">' + wodEscapeHtml([entry.date,wodPeriodLabel(entry.gamePeriod||'modern'),entry.difficulty,entry.stages?.length?entry.stages.length+'-stage campaign':oneshot?'One-shot':'Replayable'].filter(Boolean).join(' · ')) + '</span>' +
            '<span class="shop-mission-description">' + wodEscapeHtml(entry.stages?entry.description:entry.objective||entry.description||'') + '</span>';
        card.addEventListener('click', () => {
            if(owned) {
                showNotification(spent && oneshot
                    ? 'Already completed — one-shot missions cannot be replayed.'
                    : 'Open Missions → Store to play this mission.');
                if(!spent || !oneshot) {
                    _wodMissionListTab = 'store';
                    showPanel('missions');
                    void wodRefreshMissionsPanel().then(()=>{
                        const stages=wodShopMissionStages().filter(s=>s.packId===entry.id||s.id===entry.id);
                        const next=stages.find(s=>wodStoreMissionPlayable(s)&&!wodIsStoreMissionCompleted(s.id))||stages.find(wodStoreMissionPlayable);
                        if(next){wodSelectMissionEntry(next);document.querySelector('#wodMissionList [data-mission-id="'+next.id+'"]')?.scrollIntoView({block:'nearest'});}
                    });
                }
                return;
            }
            wodEquipShopMap(entry);
        });
        host.appendChild(card);
        wodFetchShopMapData(entry).then(data => {
            if(token !== wodShopMapRenderToken || !data || !card.isConnected) return;
            let cv = card.querySelector('canvas');
            if(cv) wodPaintMapDataOnCanvas(cv, data);
        });
    }
    requestAnimationFrame(() => {
        if(token !== wodShopMapRenderToken) return;
        wodFillCodexRow(host, '.shop-codex-card', 148, 12);
    });
}
let wodShopTabsBound = false;
function wodShopColorRgb(settingKey) {
    wodEnsureUiShopDefaults();
    let colorId = gameData.uiSettings[settingKey] || 'gold';
    let preset = WOD_LINE_COLOR_PRESETS.find(c => c.id === colorId) || WOD_LINE_COLOR_PRESETS[0];
    return preset.rgb;
}
function wodShopColorRgba(settingKey, alpha) {
    let rgb = wodShopColorRgb(settingKey);
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
}
function purchaseShopVisual(shopId) {
    if(!shopId || wodOwnsShopVisual(shopId)) return true;
    if(WodSteamStore.native() || wodCloudCanSync()) {
        void wodCloudTryPurchase({ kind: 'visual', itemId: shopId }).then(ok => {
            if(!ok) return;
            showNotification('Unlocked!');
            updateSkinShop();
        });
        return false;
    }
    const cost=WodStoreCatalog.visualCost(shopId);
    if((gameData.gold || 0) < cost) {
        showNotification('Not enough gold!');
        return false;
    }
    gameData.gold -= cost;
    wodEnsureOwnedShopVisuals();
    gameData.ownedShopVisuals[shopId] = true;
    showNotification('Unlocked!');
    updateSkinShop();
    scheduleSaveWodProgress();
    return true;
}
function wodSelectShopVisual(shopId, settingKey, value) {
    if(shopId && !wodOwnsShopVisual(shopId)) {
        if(!purchaseShopVisual(shopId)) return;
    }
    wodEnsureUiShopDefaults();
    gameData.uiSettings[settingKey] = value;
    saveUiSettings();
    if((settingKey === 'frontlineStyle' || settingKey === 'frontlineColor') && typeof wodMarkTerrainPoliticalDirty === 'function')
        wodMarkTerrainPoliticalDirty();
    syncShopVisualOptionsUi();
}
function wodSelectShopColor(colorId, settingKey) {
    let preset = WOD_LINE_COLOR_PRESETS.find(c => c.id === colorId);
    if(!preset || (settingKey !== 'frontlineColor' && settingKey !== 'commandArrowColor')) return;
    if(preset.shopId && !wodOwnsShopVisual(preset.shopId)) {
        if(!purchaseShopVisual(preset.shopId)) return;
    }
    wodEnsureUiShopDefaults();
    gameData.uiSettings[settingKey] = colorId;
    saveUiSettings();
    if(settingKey === 'frontlineColor' && typeof wodMarkTerrainPoliticalDirty === 'function')
        wodMarkTerrainPoliticalDirty();
    syncShopVisualOptionsUi();
}
function wodApplyShopLinePreviewColors() {
    wodEnsureUiShopDefaults();
    let pane = document.getElementById('shopTabCommand');
    if(!pane) return;
    pane.style.setProperty('--shop-frontline-color', wodRgbToHex(wodShopColorRgb('frontlineColor')));
    pane.style.setProperty('--shop-command-color', wodRgbToHex(wodShopColorRgb('commandArrowColor')));
    wodRefreshShopCommandPreviews();
}
function wodPaintShopCommandPreview(canvas, styleId) {
    if(!canvas || !wodIsCommandArrowStyle(styleId)) return;
    let ctx = canvas.getContext('2d');
    if(!ctx) return;
    let w = canvas.width || 280;
    let h = canvas.height || 80;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    let prevStyle = gameData.uiSettings.commandArrowStyle;
    gameData.uiSettings.commandArrowStyle = styleId;
    try {
        let pts = [
            { x: w * 0.09, y: h * 0.70 },
            { x: w * 0.38, y: h * 0.50 },
            { x: w * 0.64, y: h * 0.44 },
            { x: w * 0.84, y: h * 0.34 }
        ];
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = wodShopColorRgba('commandArrowColor', 0.92);
        wodStrokeCommandOrderPath(ctx, pts, { type: 'light' }, 7.2, 25);
        ctx.restore();
    } finally {
        gameData.uiSettings.commandArrowStyle = prevStyle;
    }
}
function wodRefreshShopCommandPreviews() {
    document.querySelectorAll('#shopCommandStyleOptions canvas[data-command-preview]').forEach(cv => {
        wodPaintShopCommandPreview(cv, cv.getAttribute('data-command-preview'));
    });
}
function wodBuildShopColorSwatchGrid(hostId, settingKey) {
    let swatchHost = document.getElementById(hostId);
    if(!swatchHost) return;
    swatchHost.innerHTML = '';
    for(let c of WOD_LINE_COLOR_PRESETS) {
        let b = document.createElement('button');
        b.type = 'button';
        b.className = 'shop-color-swatch';
        b.setAttribute('data-line-color', c.id);
        b.setAttribute('data-color-setting', settingKey);
        if(c.shopId) b.setAttribute('data-shop-visual', c.shopId);
        b.title = c.label;
        let hex = wodRgbToHex(c.rgb);
        let footer = c.shopId
            ? '<span class="shop-visual-footer"><span class="shop-visual-state">Locked</span><span class="shop-visual-price">'+WOD_SHOP_VISUAL_COST+'g</span></span>'
            : '<span class="shop-option-badge">Default</span>';
        b.innerHTML = '<span class="shop-swatch-row"><span class="swatch-dot" style="--swatch:' + hex + '"></span><span>' + c.label + '</span></span>' + footer;
        b.addEventListener('click', () => wodSelectShopColor(c.id, settingKey));
        swatchHost.appendChild(b);
    }
}
function wodInitShopTabs() {
    wodEnsureUiShopDefaults();
    if(!wodShopTabsBound) {
        document.querySelectorAll('#shopPanel .shop-tab').forEach(btn => {
            btn.addEventListener('click', () => switchShopTab(btn.getAttribute('data-shop-tab')));
        });
        wodBuildShopColorSwatchGrid('shopFrontlineColorSwatches', 'frontlineColor');
        wodBuildShopColorSwatchGrid('shopCommandColorSwatches', 'commandArrowColor');
        wodShopTabsBound = true;
    }
    syncShopVisualOptionsUi();
}
function switchShopTab(tabId) {
    if(!tabId) return;
    document.querySelectorAll('#shopPanel .shop-tab').forEach(btn => {
        let on = btn.getAttribute('data-shop-tab') === tabId;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('#shopPanel .shop-tab-pane').forEach(pane => {
        let on = pane.getAttribute('data-shop-pane') === tabId;
        pane.classList.toggle('active', on);
        if(on) pane.removeAttribute('hidden');
        else pane.setAttribute('hidden', '');
    });
    if(tabId === 'missions' || tabId === 'maps') renderShopMapsTab();
    if(tabId === 'command') wodRefreshShopCommandPreviews();
    if(tabId === 'mapSkins')document.querySelectorAll('[data-board-thumb]').forEach(c=>{WodBoardArt.thumbnail(c,c.dataset.boardThumb,wodMapPackPreviewArt());});
}
function syncShopVisualOptionsUi() {
    wodEnsureUiShopDefaults();
    wodEnsureOwnedShopVisuals();
    let u = gameData.uiSettings;
    let changed = false;
    if(u.mapSkin==='atlas_hd'&&!wodOwnsShopVisual('map_atlas_hd')) {u.mapSkin='default';changed=true;}
    if(WodStoreCatalog.mapPacks[u.mapSkin]?.shopId&&!wodOwnsShopVisual(WodStoreCatalog.mapPacks[u.mapSkin].shopId)){u.mapSkin='default';changed=true;}
    if(gameData.unitSkin==='atlasUnits')gameData.unitSkin='nato';if(gameData.aiUnitSkin==='atlasUnits')gameData.aiUnitSkin='nato';
    document.querySelectorAll('#shopFrontlineOptions .shop-option-card, #shopCommandStyleOptions .shop-option-card').forEach(btn => {
        let shopId = btn.getAttribute('data-shop-visual');
        let owned = wodOwnsShopVisual(shopId);
        btn.classList.toggle('shop-visual-locked', !!shopId && !owned);
        let st = btn.querySelector('.shop-visual-state');
        let pr = btn.querySelector('.shop-visual-price');
        if(st) st.textContent = shopId ? (owned ? 'Unlocked' : 'Locked') : '';
        if(pr) pr.textContent = shopId && !owned ? WOD_SHOP_VISUAL_COST+'g' : '';
    });
    document.querySelectorAll('#shopFrontlineColorSwatches .shop-color-swatch, #shopCommandColorSwatches .shop-color-swatch').forEach(btn => {
        let shopId = btn.getAttribute('data-shop-visual');
        let owned = wodOwnsShopVisual(shopId);
        let settingKey = btn.getAttribute('data-color-setting');
        btn.classList.toggle('shop-visual-locked', !!shopId && !owned);
        let st = btn.querySelector('.shop-visual-state');
        if(st) st.textContent = shopId ? (owned ? 'Unlocked' : 'Locked') : '';
        btn.classList.toggle('active', btn.getAttribute('data-line-color') === u[settingKey]);
    });
    document.querySelectorAll('#shopFrontlineOptions .shop-option-card').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-frontline-style') === u.frontlineStyle);
    });
    document.querySelectorAll('#shopCommandStyleOptions .shop-option-card').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-command-style') === u.commandArrowStyle);
    });
    document.querySelectorAll('#shopMapSkinOptions .shop-option-card').forEach(btn => {
        const skin=btn.getAttribute('data-map-skin'),hd=skin==='atlas_hd',pack=WodStoreCatalog.mapPacks[skin],shopId=pack?.shopId||(hd?'map_atlas_hd':null),owned=!shopId||wodOwnsShopVisual(shopId);
        const equipped=owned&&btn.getAttribute('data-map-skin')===u.mapSkin;
        btn.classList.toggle('active',equipped);
        btn.classList.toggle('shop-visual-locked',!owned);
        const badge=btn.querySelector('.shop-option-badge');if(badge)badge.textContent=(equipped?'Equipped':owned?'Unlocked':pack.price.toLocaleString()+' gold')+' · All eras';
    });
    for(let id in WOD_FRONTLINE_STYLES) {
        let shopId = WOD_FRONTLINE_STYLES[id].shopId;
        if(shopId && !wodOwnsShopVisual(shopId) && u.frontlineStyle === id) { u.frontlineStyle = 'solid'; changed = true; }
    }
    for(let id in WOD_COMMAND_ARROW_STYLES) {
        let shopId = WOD_COMMAND_ARROW_STYLES[id].shopId;
        if(shopId && !wodOwnsShopVisual(shopId) && u.commandArrowStyle === id) { u.commandArrowStyle = 'default'; changed = true; }
    }
    for(let c of WOD_LINE_COLOR_PRESETS) {
        if(c.shopId && !wodOwnsShopVisual(c.shopId) && u.frontlineColor === c.id) { u.frontlineColor = 'black'; changed = true; }
        if(c.shopId && !wodOwnsShopVisual(c.shopId) && u.commandArrowColor === c.id) { u.commandArrowColor = 'black'; changed = true; }
    }
    if(changed) saveUiSettings();
    wodApplyShopLinePreviewColors();
}
async function setShopMapSkin(skinId) {
    if(!['default','atlas_hd',...Object.keys(WodStoreCatalog.mapPacks)].includes(skinId)) return false;
    const shopId=WodStoreCatalog.mapPacks[skinId]?.shopId||(skinId==='atlas_hd'?'map_atlas_hd':null);
    if(shopId&&!wodOwnsShopVisual(shopId)) {
        if(gameData._mapSkinPurchasePending)return false;
        if(WodSteamStore.native() || wodCloudCanSync()) {
            gameData._mapSkinPurchasePending=true;
            let ok=false;
            try {ok=await wodCloudTryPurchase({kind:'visual',itemId:shopId});}
            finally {gameData._mapSkinPurchasePending=false;}
            if(!ok||!wodOwnsShopVisual(shopId))return false;
        } else if(!purchaseShopVisual(shopId))return false;
    }
    wodEnsureUiShopDefaults();
    gameData.uiSettings.mapSkin = skinId;
    saveUiSettings();
    syncShopVisualOptionsUi();
    wodMarkTerrainFullDirty();
    terrainNeedsUpdate=true;
    if(gameData.hexList && gameData.hexList.length)updateTerrainCache();
    return true;
}
function updateSkinShop() {
    let goldEl = document.getElementById('shopGold');
    if(goldEl) goldEl.innerText = Math.floor(gameData.gold || 0);
    let mapsPane = document.getElementById('shopTabMaps');
    if(mapsPane && !mapsPane.hasAttribute('hidden')) renderShopMapsTab();
    wodSyncSetupShopMapButton();
    syncShopVisualOptionsUi();
    let skinIds = ['nato', 'usa', 'uk', 'germany', 'france', 'japan', 'ussr', 'italy', 'china',
        ...WOD_ANCIENT_CIV_PACK_IDS,
        'ruseUsa', 'ruseUk', 'ruseFrance', 'ruseGermany', 'ruseUssr', 'ruseJapan', 'ruseItaly', 'ruseChina',
        'goldenChip', 'supporterGold', 'napoleonic', 'medieval', 'ancient', 'atlasUnits'];
    for(let skin of skinIds) {
        let id = wodSkinShopCardId(skin);
        let el = document.getElementById(id);
        if(!el) continue;
        let owned = wodShopSkinOwned(skin);
        el.classList.toggle('skin-owned', owned);
        el.classList.toggle('skin-missing', !owned);
        el.classList.toggle('locked', !owned);
        el.classList.toggle('skin-no-buy', skin === 'goldenChip' && !owned);
        let st = el.querySelector('.skin-card-state');
        let pr = el.querySelector('.skin-card-price');
        if(skin === 'supporterGold') {
            // Patron Gold is no longer sold: show the card to existing owners only.
            el.style.display = owned ? '' : 'none';
            if(st) st.textContent = 'Unlocked';
            if(pr) pr.textContent = '';
            continue;
        }
        if(skin === 'goldenChip') {
            if(st) st.textContent = owned ? 'Unlocked' : 'Secret';
            if(pr) pr.textContent = owned ? '' : '?';
            continue;
        }
        if(st) st.textContent = owned ? 'Unlocked' : 'Locked';
        if(pr) {
            pr.textContent = owned ? '' : (wodShopSkinCost(skin) + 'g');
        }
    }
    populateShopEquipSelects();
    renderShopArmyCanvases();
    renderSkinShopGridCanvases();
    updateShopPurchaseAllButtons();
    if(window.WodSteamStore) WodSteamStore.render();
}
function updateShopPurchaseAllButtons() {
    let map = { standard: 'shopBuyAllStandard', ancientCiv: 'shopBuyAllAncientCiv', countryballs: 'shopBuyAllCountryballs', ruse: 'shopBuyAllRuse' };
    for(let key of Object.keys(map)) {
        let btn = document.getElementById(map[key]);
        let ids = WOD_SHOP_PURCHASABLE_SECTIONS[key];
        if(!btn || !ids) continue;
        let remaining = ids.filter(id => !wodShopSkinOwned(id)).length;
        let bulkCost = ids.filter(id => !wodShopSkinOwned(id)).reduce((sum, id) => sum + wodShopSkinCost(id), 0);
        btn.disabled = remaining === 0;
        btn.textContent = remaining === 0 ? 'All owned' : ('Purchase all (' + bulkCost + 'g)');
    }
}
