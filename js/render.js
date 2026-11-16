// The frame draw: map, units, effects and city names.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

function wodDrawFogOverlay(ctx) {
    if(gameData._spectator?.active)return;
    if(!wodFogActive() || !gameData._fogVisible) return;
    if(gameData._fogCanvasDirty) wodTryRebuildFogCanvas();
    if(!gameData._fogCanvas || gameData._fogCanvas.width <= 0) return;
    ctx.save();
    ctx.drawImage(gameData._fogCanvas, terrainBounds.minX, terrainBounds.minY);
    ctx.restore();
}
function wodDrawCityName(ctx,city,gfxLite) {
    const text=city.name||'',color=city.owner===0?'#bdc3c7':factionColors[city.owner],font=gfxLite?'bold 12px Arial':'bold 16px Arial';
    const scale=Math.min(4,Math.max(1,Math.ceil((window.devicePixelRatio||1)*(gameData.camera.zoom||1))));
    const key=JSON.stringify([text,color,font,scale]);let sprite=wodCityNameSpriteCache.get(key);
    if(!sprite){
        const c=document.createElement('canvas'),g=c.getContext('2d');g.font=font;
        const w=Math.ceil(g.measureText(text).width)+18,h=gfxLite?30:38;c.width=w*scale;c.height=h*scale;
        g.scale(scale,scale);g.font=font;g.fillStyle=color;g.textAlign='center';g.textBaseline='middle';
        if(!gfxLite){g.shadowColor='black';g.shadowBlur=4*scale;}
        g.fillText(text,w/2,h/2);sprite={canvas:c,w,h};
        if(wodCityNameSpriteCache.size>=192)wodCityNameSpriteCache.delete(wodCityNameSpriteCache.keys().next().value);
        wodCityNameSpriteCache.set(key,sprite);
    }
    ctx.drawImage(sprite.canvas,city.x-sprite.w/2,city.y-10-sprite.h/2,sprite.w,sprite.h);
}
let wodAudioScene = null;
function wodAudioVisibleUnits() {
    return gameData.entities.filter(wodFogCanSeeUnit);
}
function wodAudioVisibleJobs() {
    const out = [];
    for(const j of gameData.constructionJobs || []) {
        if(!wodFogHexVisible(getNearestHexToPoint(j.x, j.y))) continue;
        out.push({ ...j, key: [j.owner, j.cq, j.cr, j.x, j.y, j.mode, j.rosterId || ''].join(':') });
    }
    return out;
}
/** Whether a job that left the queue finished (for the completion sound), as far as the player can see. */
function wodAudioJobCompleted(j) {
    if(!wodFogHexVisible(getNearestHexToPoint(j.x, j.y))) return false;
    const c = gameData.cities.find(c => c.q === j.cq && c.r === j.cr && c.owner === j.owner);
    if(['factory', 'harbor', 'farm'].includes(j.mode)) return !!c?.[{ factory: 'hasFactory', harbor: 'hasHarbor', farm: 'hasFarm' }[j.mode]];
    if(j.mode === 'fort') return gameData.forts.some(f => f.owner === j.owner && wodAiDist2(f.x, f.y, j.x, j.y) < 100);
    if(j.mode === 'bridge') return (gameData.bridges || []).some(b => b.owner === j.owner && wodAiDist2(b.x, b.y, j.x, j.y) < 100);
    return false;
}
/** Cells where the fort or hospital being placed may go, recomputed at most four times a second. */
function wodPlacementPickHexes(mode, owner) {
    const c = gameData._placementPickCache, now = performance.now();
    if(c && c.mode === mode && c.owner === owner && c.hexList === gameData.hexList && now < c.until) return c.hexes;
    const hexes = [];
    for(const hx of gameData.hexList)
        if(mode === 'hospital' ? !wodHospitalPlacementError(hx, owner) : hexEligibleForFortPlacementForOwner(hx, owner)) hexes.push(hx);
    gameData._placementPickCache = { mode, owner, hexList: gameData.hexList, until: now + 250, hexes };
    return hexes;
}
/** Towns, their names and bars, production countdowns, selection and construction rings. */
function wodDrawCitiesLayer(ctx, view) {
    const { camL, camR, camT, camB, camZ, culPad, wodCull, gfxLite, gfxDecorSkip } = view;
    const wodInView = (wx, wy, pad) => wx >= camL - pad && wx <= camR + pad && wy >= camT - pad && wy <= camB + pad;
    const snapCityBar = w => Math.max(0, Math.round(w * camZ) / camZ);
    // Draw Cities
    // Construction rings are independent of the Cities layer — players still need
    // to see eligible towns while placing factories/farms/harbors/units.
    let bmPick =
        gameState === 'PLAYING' &&
        gameData.buildMode &&
        gameData.buildMode !== 'fort' &&
        gameData.buildMode !== 'hospital' &&
        gameData.buildMode !== 'bridge';
    let bmPickEligible = null;
    if(bmPick) {
        bmPickEligible = new Set();
        for(let ci = 0, cl = gameData.cities.length; ci < cl; ci++) {
            let c = gameData.cities[ci];
            if(c.owner === wodLocalPlayerOwner() && c.id && cityEligibleForBuildPlacement(c, gameData.buildMode))
                bmPickEligible.add(c.id);
        }
    }
    let showCities = !!gameData.layers.cities;
    let showCityNames = !!gameData.layers.cityNames;
    if(showCities || showCityNames) {
        for(let city of gameData.cities) {
            if(!wodFogCanSeeCity(city)) continue;
            let isSel = !!city.selected;
            if(wodCull && !isSel && !wodInView(city.x, city.y, culPad)) continue;
            if(showCities) {
                drawCitySkinMarker(ctx, city);

                if(citySiegeShowsCombatIndicator(city)) {
                    ctx.save();
                    let py = city.y - (!gfxLite ? 52 : 44);
                    if(showCityNames) py = city.y - (!gfxLite ? 58 : 50);
                    drawCombatBurstIcon(ctx, city.x, py, gfxLite ? 8 : 10);
                    ctx.restore();
                }
            }

            if(showCityNames) {
                wodDrawCityName(ctx,city,gfxLite);

                if(showCities && (city.hasFactory || city.hasHarbor || city.hasFarm)) drawWodCityStructureIcons(ctx, city, gfxLite);
            } else if(showCities && !gfxLite) {
                ctx.beginPath();
                ctx.arc(city.x, city.y - 10, 8, 0, Math.PI*2);
                ctx.fillStyle = city.owner === 0 ? '#bdc3c7' : factionColors[city.owner];
                ctx.fill();
                ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
            } else if(showCities && gfxLite && city.owner === 0) {
                ctx.beginPath();
                ctx.arc(city.x, city.y - 8, 6, 0, Math.PI*2);
                ctx.fillStyle = '#bdc3c7';
                ctx.fill();
            }

            if(showCities && city.hp < city.maxHp) {
                let barW = 40;
                let fillW = snapCityBar(barW * (city.hp / city.maxHp));
                ctx.fillStyle = '#e74c3c';
                ctx.fillRect(city.x - 20, city.y + 20, barW, 4);
                ctx.fillStyle = '#2ecc71';
                ctx.fillRect(city.x - 20, city.y + 20, fillW, 4);
            }
        }
    }
    // Small countdown clocks beside each owned production site; effects begin on completion.
    ctx.save();
    let timerScale = Math.max(0.05, gameData.camera.zoom || 1);
    for(let j of gameData.constructionJobs || []) {
        if(j.owner !== wodLocalPlayerOwner()) continue;
        if(j.mode==='hospital'){ctx.save();ctx.globalAlpha=.4;wodDrawHospital(ctx,j);ctx.restore();}
        if(j.mode==='bridge'){drawBridgeSticker(ctx,j,gfxLite,null,.35);ctx.save();ctx.translate(j.x,j.y);ctx.rotate(j.angle||0);ctx.strokeStyle='#f1c40f';ctx.lineWidth=2/timerScale;ctx.setLineDash([6/timerScale,4/timerScale]);ctx.strokeRect(-j.w/2,-j.h/2,j.w,j.h);ctx.restore();}
        let x=j.x+38/timerScale, y=j.y-22/timerScale, r=12/timerScale;
        ctx.fillStyle='#101e2bee'; ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='#526779';ctx.lineWidth=2/timerScale;ctx.stroke();
        ctx.strokeStyle='#f1c40f';ctx.beginPath();ctx.arc(x,y,r,-Math.PI/2,-Math.PI/2+Math.PI*2*(1-j.remaining/j.total));ctx.stroke();
        ctx.fillStyle='#fff';ctx.font='bold '+(10/timerScale)+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(String(Math.ceil(j.remaining)),x,y);
    }
    ctx.restore();
    // Selection + construction rings: always draw (Cities layer off must not hide them).
    ctx.save();
    for(let ci = 0, cl = gameData.cities.length; ci < cl; ci++) {
        let city = gameData.cities[ci];
        if(!city || !city.selected) continue;
        if(!wodFogCanSeeCity(city)) continue;
        if(wodCull && !wodInView(city.x, city.y, culPad)) continue;
        ctx.beginPath();
        ctx.arc(city.x, city.y, 35, 0, Math.PI * 2);
        ctx.strokeStyle = '#f1c40f';
        ctx.lineWidth = gfxLite ? 3 : 4;
        ctx.setLineDash([]);
        ctx.stroke();
    }
    if(bmPickEligible && bmPickEligible.size) {
        ctx.strokeStyle = 'rgba(241, 196, 15, 0.95)';
        ctx.lineWidth = gfxLite ? 2.5 : 3;
        ctx.setLineDash([9, 7]);
        for(let ci = 0, cl = gameData.cities.length; ci < cl; ci++) {
            let city = gameData.cities[ci];
            if(!city || !city.id || !bmPickEligible.has(city.id)) continue;
            if(!wodFogCanSeeCity(city)) continue;
            if(wodCull && !wodInView(city.x, city.y, culPad)) continue;
            ctx.beginPath();
            ctx.arc(city.x, city.y, 40, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }
    ctx.restore();
}

/** Forts, hospital and command auras, bridges and the bridge tool preview. */
function wodDrawStructuresLayer(ctx, view) {
    const { camL, camR, camT, camB, camZ, culPad, wodCull, gfxLite, gfxDecorSkip } = view;
    const wodInView = (wx, wy, pad) => wx >= camL - pad && wx <= camR + pad && wy >= camT - pad && wy <= camB + pad;
    let structsOn = !(gameData.layers && gameData.layers.structures === false);
    if(structsOn && gameData.forts && gameData.forts.length) {
        let auraR = wodFortCombatAuraRadiusPx();
        let auraPad = auraR + 52,
            fortAuraFill = gfxLite ? 'rgba(56, 168, 255, 0.1)' : 'rgba(52, 155, 240, 0.14)',
            fortAuraStroke = gfxLite ? 'rgba(94, 198, 255, 0.88)' : 'rgba(74, 184, 255, 0.92)';
        for(let fti = 0, ftl = gameData.forts.length; fti < ftl; fti++) {
            let ftf = gameData.forts[fti];
            if(!wodFogCanSeeFort(ftf)) continue;
            if(wodCull && !wodInView(ftf.x, ftf.y, auraPad)) continue;
            let fcol = factionColors[ftf.owner] || '#95a5a6';
            ctx.save();
            ctx.beginPath();
            ctx.arc(ftf.x, ftf.y, auraR, 0, Math.PI * 2);
            ctx.fillStyle = fortAuraFill;
            ctx.fill();
            ctx.strokeStyle = fortAuraStroke;
            ctx.lineWidth = gfxLite ? 2.05 : 2.95;
            ctx.setLineDash([11, 8]);
            ctx.beginPath();
            ctx.arc(ftf.x, ftf.y, auraR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
            drawFortSticker(ctx, ftf, fcol, gfxLite, null);
        }
    }
    wodDrawMedicalAndCommandAuras(ctx,structsOn,gfxLite);
    if(structsOn && gameData.bridges && gameData.bridges.length) {
        for(let bri = 0, brl = gameData.bridges.length; bri < brl; bri++) {
            let brg = gameData.bridges[bri];
            if(wodCull && !wodInView(brg.x, brg.y, Math.max(brg.w || 40, brg.h || 20))) continue;
            drawBridgeSticker(ctx, brg, gfxLite, null);
        }
    }
    // The bridge tool's preview is drawn even with the structures layer hidden: it is the tool's only feedback.
    if(gameState === 'PLAYING' && gameData.buildMode === 'bridge' && gameData.bridgePlacement)
        wodDrawBridgeDragPreview(ctx, gfxLite);
}

/** Units, order previews and their markers. */
function wodDrawUnitsLayer(ctx, view) {
    const { camL, camR, camT, camB, camZ, culPad, wodCull, gfxLite, gfxDecorSkip } = view;
    const wodInView = (wx, wy, pad) => wx >= camL - pad && wx <= camR + pad && wy >= camT - pad && wy <= camB + pad;
    // Draw Units
    if(gameData.layers.units) {
        if(!gfxDecorSkip && gameData.pathStrokePreview && gameData.pathStrokePreview.length >= 2) {
            drawStrokePreviewArrows(ctx, gameData.pathStrokePreview, getMovableSelectedUnits());
        }
        let uo = wodUnitsDrawOrderScratch;
        uo.length = 0;
        let combatScratch = gameData._wodCombatDrawScratch;
        if(!combatScratch) combatScratch = gameData._wodCombatDrawScratch = [];
        combatScratch.length = 0;
        for(let i = 0, el = gameData.entities.length; i < el; i++) {
            let u = gameData.entities[i];
            if(u.hp <= 0) continue;
            if(u.type === 'convoy') uo.push(u);
            else combatScratch.push(u);
        }
        for(let i = 0, cl = combatScratch.length; i < cl; i++) uo.push(combatScratch[i]);
        for(let ui = 0, ul = uo.length; ui < ul; ui++) {
            let unit = uo[ui];
            if(!wodFogCanSeeUnit(unit)) continue;
            if(unit.type==='supply'&&unit.selected){ctx.save();ctx.strokeStyle=wodCommandArrowStrokeRgba(unit,.65);ctx.fillStyle='rgba(90,180,210,.08)';ctx.lineWidth=2/(gameData.camera.zoom||1);ctx.setLineDash([7,5]);ctx.beginPath();ctx.arc(unit.x,unit.y,wodSupplyShipRadiusPx(),0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();}
            if(shouldDrawPlayerUnitOrderPath(unit) || shouldDrawConvoyMovementPath(unit)) {
                // Cull against both auth and smooth-draw positions so MP snap
                // lag cannot hide a unit the moment it is deselected.
                let dx = unit._drawX != null ? unit._drawX : unit.x;
                let dy = unit._drawY != null ? unit._drawY : unit.y;
                if(wodCull && !unit.selected && !wodInView(unit.x, unit.y, culPad) && !wodInView(dx, dy, culPad)) continue;
                drawUnitMovementPath(ctx, unit);
            }
        }

        let spawnFxDrawn = 0;
        const focusTargets=new Set(gameData.selection.filter(u=>u.owner===wodLocalPlayerOwner()).map(u=>u.preferredTargetUid).filter(Boolean));
        for(let ui = 0, ul = uo.length; ui < ul; ui++) {
            let unit = uo[ui];
            if(!wodFogCanSeeUnit(unit)) continue;
            let dx = unit._drawX != null ? unit._drawX : unit.x;
            let dy = unit._drawY != null ? unit._drawY : unit.y;
            if(wodCull && !unit.selected && !wodInView(unit.x, unit.y, culPad) && !wodInView(dx, dy, culPad)) continue;
            ctx.save();
            let dp = wodUnitSmoothDrawXY(unit, gameData._frameSimDt);
            ctx.translate(dp.x, dp.y);

            let uColor = factionColors[unit.owner];
            let ur = wodCrowdedUnitMarkerRadius(unit);

            let spawnScale = 1;
            if((unit.spawnFx || 0) > 0) {
                let spawnP = 1 - unit.spawnFx / WOD_UNIT_SPAWN_FX_DUR;
                spawnScale = 0.48 + wodEaseOutBack(spawnP) * 0.52;
                ctx.scale(spawnScale, spawnScale);
            }

            if((unit.type !== 'convoy'||wodHdMapActive()||wodBoardMapActive()) && drawUnitSkin(ctx, unit, ur, uColor)) {
                // Drawn by selected unit skin.
            } else if(wodIsNavalUnit(unit)) {
                drawClassicUnitShape(ctx, 'ship', ur, uColor, unit);
            } else if(unit.type === 'convoy') {
                drawClassicUnitShape(ctx, 'convoy', ur, uColor, unit);
            } else if(unit.type === 'heavy') {
                drawClassicUnitShape(ctx, 'heavy', ur, uColor);
            } else if(unit.type === 'marine') {
                drawClassicUnitShape(ctx, 'marine', ur, uColor);
            } else {
                drawClassicUnitShape(ctx, 'light', ur, uColor);
            }

            if((unit.spawnFx || 0) > 0 && !gfxDecorSkip && spawnFxDrawn < WOD_SPAWN_FX_DRAW_CAP) {
                ctx.save();
                ctx.scale(1 / spawnScale, 1 / spawnScale);
                wodDrawSpawnFxCached(ctx, unit, ur);
                ctx.restore();
                spawnFxDrawn++;
            }

            if(focusTargets.has(unit.uid)){ctx.save();ctx.strokeStyle='#ff6b63';ctx.lineWidth=2/(gameData.camera.zoom||1);ctx.beginPath();ctx.arc(0,0,ur*1.8,0,Math.PI*2);ctx.moveTo(-ur*2.2,0);ctx.lineTo(-ur*1.4,0);ctx.moveTo(ur*1.4,0);ctx.lineTo(ur*2.2,0);ctx.moveTo(0,-ur*2.2);ctx.lineTo(0,-ur*1.4);ctx.stroke();ctx.restore();}
            if(unit.selected) {
                let effSkin = getEffectiveUnitSkin(unit);
                if(effSkin === 'nato') {
                    wodDrawNatoSelectionBrackets(ctx, ur);
                } else if(WOD_COUNTRYBALL_SKIN_IDS.includes(effSkin)) {
                    ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
                    if(unit.type === 'heavy') {
                        let pad = ur * 0.18;
                        let w = ur * 2.15 + pad * 2, h = ur * 1.42 + pad * 2;
                        roundRect(ctx, -w / 2, -h / 2, w, h, ur * 0.26 + pad * 0.4);
                        ctx.stroke();
                    } else if(wodIsNavalUnit(unit)) {
                        let s = ur + 5;
                        ctx.beginPath();
                        ctx.moveTo(s * 0.92, 0);
                        ctx.lineTo(-s * 0.58, s * 0.78);
                        ctx.lineTo(-s * 0.58, -s * 0.78);
                        ctx.closePath();
                        ctx.stroke();
                    } else if(unit.type === 'marine') {
                        let w = ur * 1.78 * 1.08, h = ur * 2.02 * 1.08;
                        ctx.beginPath();
                        ctx.moveTo(-w * 0.22, -h * 0.48);
                        ctx.lineTo(w * 0.52, -h * 0.12);
                        ctx.lineTo(w * 0.38, h * 0.52);
                        ctx.lineTo(-w * 0.38, h * 0.48);
                        ctx.lineTo(-w * 0.55, h * 0.05);
                        ctx.closePath();
                        ctx.stroke();
                    } else {
                        ctx.beginPath();
                        ctx.arc(0, 0, ur + 4, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                    ctx.setLineDash([]);
                } else if(WOD_RUSE_SKIN_IDS.includes(effSkin)) {
                    ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
                    wodStrokeRuseChipSelection(ctx, unit, ur, 4);
                    ctx.setLineDash([]);
                } else if(WOD_ANCIENT_CIV_SKIN_IDS.includes(effSkin) || (WOD_PERIOD_SKIN_IDS.includes(effSkin) && effSkin === 'ancient')) {
                    ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
                    ctx.beginPath();
                    ctx.arc(0, 0, ur * 1.12 + 4, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                } else if(WOD_PERIOD_SKIN_IDS.includes(effSkin)) {
                    let wr = ur * 2.35;
                    let hr = ur * 1.62;
                    ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 3; ctx.setLineDash([6, 4]);
                    roundRect(ctx, -wr / 2, -hr / 2, wr, hr, ur * 0.28);
                    ctx.stroke(); ctx.setLineDash([]);
                } else if(WodStoreCatalog.premiumBase(effSkin)) {
                    wodDrawPremiumSelection(ctx, ur, wodGetRenderPeriod());
                } else {
                    ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2;
                    if(wodIsNavalUnit(unit)) {
                        ctx.save();
                        ctx.rotate(getUnitFacingAngle(unit));
                        let s = ur + 5;
                        ctx.beginPath();
                        ctx.moveTo(s * 0.92, 0);
                        ctx.lineTo(-s * 0.58, s * 0.78);
                        ctx.lineTo(-s * 0.58, -s * 0.78);
                        ctx.closePath();
                        ctx.stroke();
                        ctx.restore();
                    } else if(unit.type === 'heavy') {
                        ctx.strokeRect(-ur - 4, -ur - 4, (ur + 4) * 2, (ur + 4) * 2);
                    } else if(unit.type === 'marine') {
                        let w = ur * 1.78 * 1.12, h = ur * 2.02 * 1.12;
                        ctx.beginPath();
                        ctx.moveTo(-w * 0.22, -h * 0.48);
                        ctx.lineTo(w * 0.52, -h * 0.12);
                        ctx.lineTo(w * 0.38, h * 0.52);
                        ctx.lineTo(-w * 0.38, h * 0.48);
                        ctx.lineTo(-w * 0.55, h * 0.05);
                        ctx.closePath();
                        ctx.stroke();
                    } else {
                        ctx.beginPath();
                        ctx.arc(0, 0, ur + 4, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                }
            }

            if(unit.type !== 'convoy') {
                let cvThRow = gfxLite ? 0.04 : 0.06,
                    combatBurstOn = unit.damage > 0 &&
                    (unit.activeCombatVisual || 0) > cvThRow;
                drawWodUnitOverheadRow(ctx, unit, ur, gfxLite, combatBurstOn);
            }

            drawCombatUnitResourceBars(ctx, unit, ur, gfxLite, camZ);

            ctx.restore();
        }
    }
}

/** Top-bar numbers, troop counts, the player summary and the unit card (throttled DOM work). */
function wodSyncHudDom() {
    if(gameState !== 'PLAYING') return;

    let wodMobileHud = wodUsesVisualViewportLayout();
    let wodPinchHudOff = wodMobileHud && wodIsCamInteracting();
    let wodSheetOpen = wodMobileHud && UI.inGameUI && UI.inGameUI.getAttribute('data-mtab');
    if(!wodPinchHudOff && !wodSheetOpen) {
    // UI (hidden while on main menu — skip DOM work for attract-mode performance)
    let entN = gameData.entities.length;
    let hudNow = performance.now();
    let hudGap = entN > 280 ? 180 : (entN > 160 ? 110 : 0);
    let skipHudDom = hudGap > 0 && (hudNow - (gameData._hudDomAt || 0)) < hudGap;
    if(!skipHudDom) gameData._hudDomAt = hudNow;
    let hudOwner = wodLocalPlayerOwner();
    if(!skipHudDom) {
    syncHudObjectiveDisplay();
    setUiText('ui-money', Math.floor(wodHudMoney()));
    setUiText('ui-income', formatDollarRate(gameData.income || 0));
    setUiText('ui-land-income', formatDollarRate(getOwnerLandIncome(hudOwner)));
    setUiText('ui-expenses', formatDollarRate(-(gameData.expenses || 0)));
    setUiText('ui-manpower', formatFullCount(wodHudManpower()));
    setUiText('ui-manpower-income', formatManpowerRate(gameData.manpowerIncome || 0));
    wodSyncHudCompactRates();

    // Update troops count (values cached in update() while simulating)
    let tc = gameData._uiTroopCache;
    let tk = gameData._uiTankCache;
    let loHud = hudOwner;
    if(tc === undefined) tc = getOwnerTroopManpower(loHud);
    if(tk === undefined) tk = getOwnerTanks(loHud);
    setUiText('ui-troops', formatFullCount(tc));
    setUiText('ui-tanks', formatTanks(tk));
    const navalCounts={ship:0,transport:0,supply:0};
    for(const u of gameData.entities)if(u.owner===loHud&&u.hp>0&&u.type in navalCounts)navalCounts[u.type]++;
    setUiText('ui-ships', navalCounts.ship);
    setUiText('ui-transports', navalCounts.transport);
    setUiText('ui-supply-ships', navalCounts.supply);
    setUiText('ui-ship-casualties', formatTanks(getOwnerShipCasualties(loHud)));
    setUiText('ui-ship-kills', formatTanks(getOwnerShipKills(loHud)));
    setUiText('ui-casualties', formatFullCount(getOwnerCasualties(loHud)));
    setUiText('ui-tank-casualties', formatTanks(getOwnerTankCasualties(loHud)));
    setUiText('ui-enemy-casualties', formatFullCount(getOwnerTroopKills(loHud)));
    setUiText('ui-tank-kills', formatTanks(getOwnerTankKills(loHud)));
    }
    let nowSm = performance.now();
    let smInt = wodUsesVisualViewportLayout()
        ? (entN > 350 ? 2200 : entN > 180 ? 1600 : 950)
        : 400;
    let playerMarching = (gameData._wodPlayerMovingN || 0) > 0;
    if(nowSm - lastPlayerSummaryMs > smInt && (!playerMarching || nowSm - lastPlayerSummaryMs > smInt * 2.5)) {
        lastPlayerSummaryMs = nowSm;
        updatePlayerSummary();
    }

    }

    if(!wodPinchHudOff && !wodSheetOpen)
        syncInfoCardPanelThrottled();
}

function draw() {
    if(wodFogActive()&&performance.now()>(gameData._fogViewNextAt||0)) {
        gameData._fogViewNextAt=performance.now()+220;wodRefreshFogVision(.23);
    }
    wodRefreshCommandHud();
    let viewW = canvas.clientWidth || UI.wrapper.clientWidth || wodCanvasAllocSize.w || 1;
    let viewH = canvas.clientHeight || UI.wrapper.clientHeight || wodCanvasAllocSize.h || 1;

    if(window.wodBattleAudio) {
        // One reused scene; the unit and job lists are built by the audio code only when it ticks (10/s).
        const scene = wodAudioScene || (wodAudioScene = { units: wodAudioVisibleUnits, jobs: wodAudioVisibleJobs, completed: wodAudioJobCompleted });
        scene.selectionEnabled = gameState === 'PLAYING' && !gameData.menuAttractMode && UI.escMenu.classList.contains('hidden');
        scene.enabled = scene.selectionEnabled && gameData.speed > 0;
        scene.era = wodGetMatchPeriod();
        scene.zoom = gameData.camera.zoom;
        scene.cameraX = gameData.camera.x;
        scene.cameraY = gameData.camera.y;
        scene.width = viewW;
        scene.height = viewH;
        window.wodBattleAudio.update(scene);
    }

    // Fill background with deep ocean color
    ctx.fillStyle = '#154360';
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.save();
    ctx.translate(-gameData.camera.x, -gameData.camera.y);
    ctx.scale(gameData.camera.zoom, gameData.camera.zoom);

    let camL = gameData.camera.x / gameData.camera.zoom;
    let camR = camL + viewW / gameData.camera.zoom;
    let camT = gameData.camera.y / gameData.camera.zoom;
    let camB = camT + viewH / gameData.camera.zoom;

    let gfxDecorSkip = wodShouldSimplifyDraw();
    let gfxLite = wodShouldGfxLite();
    let fxN = gameData._combatFx ? gameData._combatFx.length : 0;
    if(fxN > 36) gfxLite = true;
    let camZ = gameData.camera.zoom > 0 && isFinite(gameData.camera.zoom) ? gameData.camera.zoom : 1;
    // Always cull to the camera frustum: without this, desktop "small" battles still iterated/drew every entity every frame — very costly when zoomed in.
    let wodCull = true;
    let culPad = Math.max(50, 110 / camZ);
    function wodInView(wx, wy, pad) {
        return wx >= camL - pad && wx <= camR + pad && wy >= camT - pad && wy <= camB + pad;
    }

    // Draw Hexes
    drawHexes(ctx, gameData.hexList, camL, camR, camT, camB, true);
    if(gameData.layers.cityNames&&gameData.mission?.battlefield) {
        ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';
        ctx.font='600 '+Math.max(12,Math.min(24,11/camZ))+'px "Segoe UI",Arial';ctx.lineWidth=Math.max(2,2/camZ);ctx.strokeStyle='rgba(7,20,24,.8)';
        for(const f of gameData.mission.battlefield.features){
            if(!wodInView(f.x,f.y,30)||wodFogActive()&&!wodFogHexExplored(getNearestHexToPoint(f.x,f.y))||gameData.cities.some(c=>Math.hypot(c.x-f.x,c.y-f.y)<gameData.hexRadius*4))continue;
            ctx.strokeText(f.name,f.x,f.y);ctx.fillStyle=f.kind==='water'?'#c2e5f5':'#e5e0c9';ctx.fillText(f.name,f.x,f.y);
        }ctx.restore();
    }

    // Draw Roads
    if(gameData.layers.cities) {
        ctx.strokeStyle = wodBoardMapActive()?WodBoardArt.palette(wodBoardMapActive()).muted:(gfxLite ? 'rgba(255, 255, 255, 0.32)' : 'rgba(255, 255, 255, 0.4)');
        ctx.lineWidth = gfxLite ? 1.25 : 3;
        if(gfxLite) ctx.setLineDash([]);
        else ctx.setLineDash([5, 5]);
        for(let road of gameData.roads) {
            let mx = (road.from.x + road.to.x) * 0.5;
            let my = (road.from.y + road.to.y) * 0.5;
            if(wodCull && !wodInView(mx, my, culPad)) continue;
            ctx.beginPath();
            ctx.moveTo(road.from.x, road.from.y);
            if(Array.isArray(road.points)&&road.points.length>1)for(const p of road.points.slice(1))ctx.lineTo(p.x,p.y);
            else ctx.lineTo(road.to.x, road.to.y);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    let fortPlacementPick = gameState === 'PLAYING' && ['fort','hospital'].includes(gameData.buildMode) && gameData.hexList && gameData.hexList.length;
    let fortPickHexes = fortPlacementPick ? wodPlacementPickHexes(gameData.buildMode, wodLocalPlayerOwner()) : null;
    if(fortPickHexes && fortPickHexes.length) {
        ctx.save();
        ctx.strokeStyle = 'rgba(241, 196, 15, 0.92)';
        ctx.lineWidth = gfxLite ? 2 : 2.75;
        ctx.setLineDash([7, 6]);
        let ringR = Math.max(14, (gameData.hexRadius || 10) * 0.42);
        for(const hh of fortPickHexes) {
            if(wodCull && !wodInView(hh.x, hh.y, culPad)) continue;
            ctx.beginPath();
            ctx.arc(hh.x, hh.y, gfxLite ? Math.min(16, ringR) : ringR, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
    }

    const view = { camL, camR, camT, camB, camZ, culPad, wodCull, gfxLite, gfxDecorSkip };
    wodDrawCitiesLayer(ctx, view);

    wodDrawStructuresLayer(ctx, view);

    if(wodFogActive()) wodDrawFogOverlay(ctx);

    wodDrawUnitsLayer(ctx, view);

    wodDrawCombatFx(ctx, camL, camR, camT, camB, culPad, gfxLite, wodCull);

    if(formationDrag.active) {
        const units=getMovableSelectedUnits(),plan=wodFormationDragPlan(units);
        if(plan.layout){
            ctx.beginPath();ctx.moveTo(plan.layout.start.x,plan.layout.start.y);ctx.lineTo(plan.layout.end.x,plan.layout.end.y);
            ctx.strokeStyle='rgba(241,196,15,.95)';ctx.lineWidth=4;ctx.lineCap='round';ctx.stroke();
        }
        for(const unit of units){
            const point=plan.slots.get(unit);if(!point)continue;
            ctx.beginPath();ctx.arc(point.x,point.y,unit.radius||12,0,Math.PI*2);
            ctx.fillStyle='rgba(241,196,15,.3)';ctx.fill();ctx.strokeStyle='#f1c40f';ctx.lineWidth=2;ctx.stroke();
        }
    }

    ctx.restore();

    wodSyncHudDom();
}
