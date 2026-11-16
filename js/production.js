// Recruitment, construction and placement on the map.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

// --- Production / map placement ---
function syncBuildPlacementMobileUi() {
    let root = document.getElementById('inGameUI');
    if(!root) return;
    if(gameData.buildMode && gameState === 'PLAYING' && typeof wodUsesVisualViewportLayout === 'function' && wodUsesVisualViewportLayout()) {
        root.setAttribute('data-build-picking', gameData.buildMode);
        root.removeAttribute('data-mtab');
        let pop = document.getElementById('wodSpeedPop');
        let trig = document.getElementById('wodSpeedTrigger');
        if(pop) pop.hidden = true;
        if(trig) trig.setAttribute('aria-expanded', 'false');
        document.querySelectorAll('.wod-m-tab').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
        });
    } else {
        root.removeAttribute('data-build-picking');
    }
}
function exitBuildPlacementMode() {
    gameData.buildMode = null;
    gameData.bridgePlacement = null;
    if(UI.wrapper) UI.wrapper.style.cursor = 'default';
    let root = document.getElementById('inGameUI');
    if(root) {
        root.removeAttribute('data-build-picking');
        if(typeof wodUsesVisualViewportLayout === 'function' && wodUsesVisualViewportLayout())
            root.removeAttribute('data-mtab');
        document.querySelectorAll('.wod-m-tab').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
        });
    }
}
let wodFortPlacementSeq = 0;
function fortAtHexKey(q, r) {
    let list = gameData.forts;
    if(!list || !list.length) return null;
    for(let f of list) {
        if(f.q === q && f.r === r) return f;
    }
    return null;
}
function hexEligibleForFortTerrain(hex, owner) {
    if(!hex || hex.owner !== owner || !owner) return false;
    if(isWaterHex(hex) || hex.type === 'mountain') return false;
    if(!isClaimableLand(hex)) return false;
    if(hex.cityId && hex.type === 'urban') return false;
    return true;
}
function hexEligibleForFortPlacementForOwner(hex, owner) {
    if(!hexEligibleForFortTerrain(hex, owner)) return false;
    if((gameData.hospitals||[]).some(h=>h.q===hex.q&&h.r===hex.r))return false;
    if(fortAtHexKey(hex.q, hex.r)) return false;
    if((gameData.constructionJobs || []).some(j => j.mode === 'fort' && j.q === hex.q && j.r === hex.r)) return false;
    return wodPlayerTreasury(owner) >= WOD_PRICE_FORT;
}
function wodFortCombatAuraRadiusPx() {
    return (gameData.hexRadius || 10) * WOD_FORT_DEFENSE_TILES;
}
/** How far a supply ship's supply reaches (twice a fort's aura). */
function wodSupplyShipRadiusPx() {
    return wodFortCombatAuraRadiusPx() * WOD_SUPPLY_SHIP_RADIUS_MULT;
}
function wodEffectiveFortOwner(ft) {
    if(!ft) return 0;
    let h = wodHexAt(ft.q,ft.r);
    return h&&h.owner===ft.owner?ft.owner|0:0;
}
/** Same-side troops in any one friendly fort aura take ×0.8 damage (does not stack with multiple forts). */
function wodFortDefenseDamageMultiplier(defenderUnit) {
    if(!defenderUnit || defenderUnit.hp <= 0 || defenderUnit.type === 'convoy') return 1;
    let ox = defenderUnit.owner | 0;
    if(ox <= 0) return 1;
    let list = gameData.forts;
    if(!list || !list.length) return 1;
    let radius = wodFortCombatAuraRadiusPx(),
        r2 = radius * radius;
    for(let i = list.length - 1; i >= 0; i--) {
        let ft = list[i];
        if(!ft || wodEffectiveFortOwner(ft) !== ox) continue;
        let dx = defenderUnit.x - ft.x,
            dy = defenderUnit.y - ft.y;
        if(dx * dx + dy * dy <= r2) return 0.8;
    }
    return 1;
}
/** Enemy units inside a hostile fort aura move 20% slower (×0.8). Friendly forts never slow allies. */
function wodFortEnemyMovementSlowdownMultiplier(mover) {
    if(!mover || mover.hp <= 0 || mover.type === 'convoy') return 1;
    let ox = mover.owner | 0;
    if(ox <= 0) return 1;
    let list = gameData.forts;
    if(!list || !list.length) return 1;
    let radius = wodFortCombatAuraRadiusPx(),
        r2 = radius * radius;
    for(let i = list.length - 1; i >= 0; i--) {
        let ft = list[i];
        if(!ft) continue;
        let fo = wodEffectiveFortOwner(ft);
        if(fo <= 0 || fo === ox) continue;
        let dx = mover.x - ft.x,
            dy = mover.y - ft.y;
        if(dx * dx + dy * dy <= r2) return 0.8;
    }
    return 1;
}
/** Compact heater shield silhouette (fort defense badge). */
function drawWodFortShieldBadge(ctx, cx, cy, rad) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rad / 12.5, rad / 12.5);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -12.2);
    ctx.lineTo(-9.2, -11.15);
    ctx.bezierCurveTo(-10.95, -11, -11.25, -8.5, -11.08, -5.85);
    ctx.bezierCurveTo(-10.82, 3.2, -7.35, 10.5, 0, 15.6);
    ctx.bezierCurveTo(7.35, 10.5, 10.82, 3.2, 11.08, -5.85);
    ctx.bezierCurveTo(11.25, -8.5, 10.95, -11, 9.2, -11.15);
    ctx.lineTo(0, -12.2);
    ctx.closePath();
    let g = ctx.createLinearGradient(-10, -13, 11, 17);
    g.addColorStop(0, '#eef8ff');
    g.addColorStop(0.28, '#6eb8f0');
    g.addColorStop(0.62, '#2a78c8');
    g.addColorStop(1, '#153c64');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.15;
    ctx.strokeStyle = '#0a2744';
    ctx.stroke();
    ctx.lineWidth = 1.05;
    ctx.strokeStyle = 'rgba(220, 240, 255, 0.72)';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-1.2, -8.4);
    ctx.bezierCurveTo(-4.2, -8.1, -5.95, -3.4, -6.05, 0.9);
    ctx.bezierCurveTo(-6.18, 6.4, -3.85, 11.2, 0, 14.15);
    ctx.bezierCurveTo(3.85, 11.2, 6.18, 6.4, 6.05, 0.9);
    ctx.bezierCurveTo(5.95, -3.4, 4.2, -8.1, 1.2, -8.4);
    ctx.quadraticCurveTo(0.15, -9.35, -1.2, -8.4);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -5.2, 2.1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fill();
    ctx.restore();
}
function wodEaseOutBack(t) {
    let c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function wodOverheadPopScale(remaining, total) {
    if(!remaining || remaining <= 0) return 1;
    let p = 1 - remaining / total;
    return wodEaseOutBack(Math.min(1, Math.max(0, p)));
}
function wodUpdateUnitOverheadPops(unit, dt) {
    if(!unit || unit.hp <= 0 || unit.type === 'convoy') return;
    if(!unit._ohPop) unit._ohPop = {};
    if(!unit._ohWasActive) unit._ohWasActive = {};
    let combatOn = unit.damage > 0 &&
        (unit.activeCombatVisual || 0) > 0.04;
    let active = {};
    if(combatOn) active.combat = true;
    if(wodFortDefenseDamageMultiplier(unit) < 1) active.fort = true;
    if((unit.encircledFlash || 0) > 0) active.encircled = true;
    if((unit.unpaidFlash || 0) > 0) active.unpaid = true;
    if(wodUnitHealingIcon(unit)) active.heal = true;
    if((unit.waterFlash || 0) > 0 && !wodUnitOnBridgeDeck(unit)) active.water = true;
    for(let k in active) {
        if(active[k] && !unit._ohWasActive[k]) unit._ohPop[k] = WOD_OVERHEAD_POP_DUR;
    }
    unit._ohWasActive = active;
    for(let k in unit._ohPop) {
        if(unit._ohPop[k] > 0) unit._ohPop[k] = Math.max(0, unit._ohPop[k] - dt);
    }
}
function drawWodWrenchGlyph(ctx, size) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.1, size * 0.2);
    ctx.strokeStyle = '#7f8c8d';
    ctx.fillStyle = '#bdc3c7';
    ctx.beginPath();
    ctx.moveTo(-size * 0.34, size * 0.38);
    ctx.lineTo(size * 0.22, -size * 0.18);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(size * 0.34, -size * 0.34, size * 0.27, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#566573';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(size * 0.34, -size * 0.34, size * 0.11, 0, Math.PI * 2);
    ctx.fillStyle = '#95a5a6';
    ctx.fill();
    ctx.restore();
}
function drawWodUnitSpawnFx(ctx, unit, ur, gfxLite, layer) {
    let rem = unit.spawnFx;
    if(!rem || rem <= 0) return;
    let p = 1 - rem / WOD_UNIT_SPAWN_FX_DUR;
    let uid = parseInt((unit.uid || '0').replace(/\D/g, '').slice(-4), 10) || 0;
    ctx.save();
    if(layer === 'back') {
        let ringR = ur * (0.38 + p * 2.1);
        let ringA = (1 - p * 0.85) * (gfxLite ? 0.38 : 0.58);
        ctx.globalCompositeOperation = 'lighter';
        let grad = ctx.createRadialGradient(0, 0, ringR * 0.08, 0, 0, ringR);
        grad.addColorStop(0, 'rgba(255, 248, 225, ' + ringA + ')');
        grad.addColorStop(0.42, 'rgba(210, 228, 255, ' + (ringA * 0.55) + ')');
        grad.addColorStop(1, 'rgba(210, 228, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, ringR, 0, Math.PI * 2);
        ctx.fill();
        let puffN = gfxLite ? 4 : 7;
        for(let i = 0; i < puffN; i++) {
            let ang = (i / puffN) * Math.PI * 2 + uid * 0.13;
            let dist = ur * (0.22 + p * 1.35);
            let px = Math.cos(ang) * dist;
            let py = Math.sin(ang) * dist - p * ur * 0.32;
            let pr = ur * (0.2 + (1 - p * 0.75) * 0.42);
            ctx.fillStyle = 'rgba(220, 228, 238, ' + ((1 - p * 0.8) * 0.34) + ')';
            ctx.beginPath();
            ctx.arc(px, py, pr, 0, Math.PI * 2);
            ctx.fill();
        }
    } else {
        let wrenchN = 3;
        for(let i = 0; i < wrenchN; i++) {
            let ang = (i / wrenchN) * Math.PI * 2 - Math.PI * 0.5 + p * 2.4;
            let dist = ur * (0.15 + p * 1.35);
            let wx = Math.cos(ang) * dist;
            let wy = Math.sin(ang) * dist - p * ur * 0.3;
            let ws = ur * (0.38 + (1 - p) * 0.14);
            let wa = (1 - p) * 0.9;
            ctx.save();
            ctx.translate(wx, wy);
            ctx.rotate(ang + p * 5.5 + i * 0.7);
            ctx.globalAlpha = wa;
            drawWodWrenchGlyph(ctx, ws);
            ctx.restore();
        }
        let sparkN = gfxLite ? 3 : 5;
        for(let si = 0; si < sparkN; si++) {
            let sang = uid * 0.19 + si * 1.37 + p * 3.2;
            let sd = ur * (0.55 + p * 1.1);
            let sx = Math.cos(sang) * sd;
            let sy = Math.sin(sang) * sd - p * ur * 0.5;
            let sa = (1 - p) * 0.85;
            ctx.strokeStyle = 'rgba(255, 236, 160, ' + sa + ')';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(sx - 3, sy);
            ctx.lineTo(sx + 3, sy);
            ctx.moveTo(sx, sy - 3);
            ctx.lineTo(sx, sy + 3);
            ctx.stroke();
        }
    }
    ctx.restore();
}
/** One horizontal row above the unit: combat star + badges (never stacked vertically). */
function drawWodUnitOverheadRow(ctx, unit, ur, gfxLite, combatBurstOn) {
    if(!unit || unit.hp <= 0 || unit.type === 'convoy') return;
    const grace=(unit.encircledFlash||0)>0?Math.max(0,WOD_SUPPLY_GRACE_SECONDS-(unit.outOfSupplySeconds||0)):0;
    const countdownFont=Math.max(gfxLite?7.3:8.9,8/Math.max(.25,gameData.camera.zoom||1));
    let kinds = [];
    if(wodFortDefenseDamageMultiplier(unit) < 1) kinds.push('fort');
    if((unit.encircledFlash || 0) > 0) kinds.push('encircled');
    if((unit.unpaidFlash || 0) > 0) kinds.push('unpaid');
    if(wodUnitHealingIcon(unit)) kinds.push('heal');
    if((unit.waterFlash || 0) > 0 && !wodUnitOnBridgeDeck(unit)) kinds.push('water');
    let hasAny = combatBurstOn || kinds.length > 0;
    if(!hasAny) return;
    let glyphR = gfxLite ? 3.59 : 4.41;
    let gap = gfxLite ? 1.37 : 1.68;
    let rowY = -ur - (gfxLite ? 6.85 : 7.92);
    let burstSz = gfxLite ? 4.51 : 5.21;
    let burstSlotW = burstSz * 1.64;
    let slots = [];
    if(combatBurstOn) slots.push({ k: 'combat', w: burstSlotW });
    for(let kk = 0; kk < kinds.length; kk++) {
        let t = kinds[kk];
        let sw=t==='encircled'&&grace>0?countdownFont*1.9:(t==='fort'?glyphR*2.06:glyphR*1.54);
        slots.push({ k: t, w: sw });
    }
    let tw = slots.reduce(function(a, s) { return a + s.w; }, 0) + (slots.length > 1 ? gap * (slots.length - 1) : 0);
    let pops = unit._ohPop || {};
    ctx.save();
    ctx.direction = 'ltr';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.imageSmoothingEnabled = true;
    let x = -tw / 2;
    for(let si = 0; si < slots.length; si++) {
        let s = slots[si];
        let cx = x + s.w * 0.5;
        x += s.w + (si < slots.length - 1 ? gap : 0);
        let popRem = pops[s.k] || 0;
        let sc = wodOverheadPopScale(popRem, WOD_OVERHEAD_POP_DUR);
        if(popRem > 0) {
            let glowA = (popRem / WOD_OVERHEAD_POP_DUR) * 0.38;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = 'rgba(255, 255, 255, ' + glowA + ')';
            ctx.beginPath();
            ctx.arc(cx, rowY, s.w * 0.72 * sc, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        ctx.save();
        ctx.translate(cx, rowY);
        ctx.scale(sc, sc);
        if(s.k === 'combat')
            drawCombatBurstIcon(ctx, 0, 0, burstSz);
        else if(s.k === 'fort')
            drawWodFortShieldBadge(ctx, 0, 0, glyphR);
        else {
            let ch = s.k === 'encircled' ? (grace>0?Math.ceil(grace)+'s':'!') : s.k === 'unpaid' ? '$' : s.k === 'heal' ? '+' : '~';
            let fill = s.k === 'encircled' ? (grace>0?'#f1c40f':'#e74c3c') : s.k === 'unpaid' ? '#f39c12' : s.k === 'heal' ? '#2ecc71' : '#3498db';
            ctx.font = 'bold ' + Math.round(s.k==='encircled'&&grace>0?countdownFont:glyphR*2.02) + 'px Arial, sans-serif';
            ctx.lineJoin = 'round';
            ctx.miterLimit = 2;
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#050505';
            ctx.fillStyle = fill;
            ctx.strokeText(ch, 0, 0);
            ctx.fillText(ch, 0, 0);
        }
        ctx.restore();
    }
    ctx.restore();
}
function drawWodOverheadTextBadge(ctx, cx, cy, ch, fill) {
    let glyphR = 4.41;
    ctx.font = 'bold ' + Math.round(glyphR * 2.02) + 'px Arial, sans-serif';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#050505';
    ctx.fillStyle = fill;
    ctx.strokeText(ch, cx, cy);
    ctx.fillText(ch, cx, cy);
}
function wodSyncFortOwnershipFromTerrain() {
    let list = gameData.forts;
    if(!list || !list.length) return;
    for(let ft of list) {
        wodEffectiveFortOwner(ft);
        if(ft && ft._lastOwner == null) ft._lastOwner = ft.owner | 0;
    }
}
function wodDrawFortBunkerCore(ctx, w, h, fxLite, pal) {
    ctx.fillStyle = pal.wall;
    ctx.strokeStyle = pal.stroke;
    ctx.lineWidth = fxLite ? 1.35 : 1.75;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.rect(-w, -h, w * 2, h * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = pal.wallHi;
    ctx.lineWidth = fxLite ? 0.9 : 1.05;
    ctx.beginPath();
    ctx.rect(-w * 0.58, -h * 0.56, w * 1.16, h * 1.02);
    ctx.fill();
    ctx.stroke();
    let br = fxLite ? 2.6 : 3.35;
    for(let iy = -1; iy <= 1; iy += 2) {
        for(let ix = -1; ix <= 1; ix += 2) {
            ctx.beginPath();
            ctx.arc(ix * (w + br * 0.42), iy * (h + br * 0.42), br, 0, Math.PI * 2);
            ctx.fillStyle = pal.wall;
            ctx.fill();
            ctx.stroke();
        }
    }
    ctx.fillStyle = pal.roof;
    let gw = fxLite ? 4.8 : 5.8, gh = fxLite ? 3.2 : 3.9;
    ctx.fillRect(-gw * 0.5, -h * 1.05, gw, gh);
    ctx.strokeRect(-gw * 0.5, -h * 1.05, gw, gh);
}
function drawFortSticker(ctx, f, factionCol, fxLite, culPadFn, period) {
    if(wodBoardMapActive()){if(!culPadFn||culPadFn(f.x,f.y,30))WodBoardArt.structure(ctx,wodBoardMapActive(),'fort',f.x,f.y,factionCol,fxLite?.8:1,period||wodGetRenderPeriod());return;}
    period = period || wodGetRenderPeriod();
    let footprint = fxLite ? 20 : 26;
    if(typeof culPadFn === 'function' && !culPadFn(f.x, f.y, footprint)) return;
    factionCol = factionCol || '#2ecc71';
    let pal = wodPeriodStructurePalette(period);
    ctx.save();
    ctx.translate(f.x, f.y + (fxLite ? 0.5 : 1));
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0.5, fxLite ? 9.5 : 12, fxLite ? 12.5 : 16, fxLite ? 6.5 : 8.5, 0, 0, Math.PI * 2);
    ctx.fill();
    let w = fxLite ? 10 : 12;
    let h = fxLite ? 7.2 : 9;
    if(period === 'napoleonic') {
        ctx.fillStyle = pal.wallHi;
        ctx.strokeStyle = pal.stroke;
        ctx.lineWidth = fxLite ? 1.35 : 1.75;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-w * 1.15, h * 0.55);
        ctx.lineTo(-w * 0.15, -h * 0.15);
        ctx.lineTo(w * 0.15, -h * 0.15);
        ctx.lineTo(w * 1.15, h * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = pal.wall;
        ctx.fillRect(-w * 0.72, -h * 0.62, w * 1.44, h * 0.95);
        ctx.strokeRect(-w * 0.72, -h * 0.62, w * 1.44, h * 0.95);
        wodDrawStructureWindows(ctx, -w * 0.55, -h * 0.5, w * 1.1, h * 0.82);
        let brN = fxLite ? 2.2 : 2.8;
        for(let iy = -1; iy <= 1; iy += 2) {
            for(let ix = -1; ix <= 1; ix += 2) {
                ctx.beginPath();
                ctx.arc(ix * (w * 0.95), iy * (h * 0.72), brN, 0, Math.PI * 2);
                ctx.fillStyle = pal.wall;
                ctx.fill();
                ctx.stroke();
            }
        }
    } else if(period === 'ancient') {
        ctx.strokeStyle = pal.stroke;
        ctx.lineWidth = fxLite ? 1.2 : 1.5;
        ctx.fillStyle = pal.wallHi;
        for(let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(i * (w * 0.36), h * 0.95);
            ctx.lineTo(i * (w * 0.36) + w * 0.11, -h * 0.85);
            ctx.lineTo(i * (w * 0.36) - w * 0.11, -h * 0.85);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        ctx.fillStyle = pal.wall;
        ctx.fillRect(-w * 0.55, -h * 0.35, w * 1.1, h * 0.75);
        ctx.strokeRect(-w * 0.55, -h * 0.35, w * 1.1, h * 0.75);
        ctx.fillStyle = pal.accent;
        ctx.fillRect(-w * 0.22, -h * 0.2, w * 0.44, h * 0.5);
        ctx.strokeRect(-w * 0.22, -h * 0.2, w * 0.44, h * 0.5);
    } else if(period === 'medieval') {
        wodDrawFortBunkerCore(ctx, w, h, fxLite, pal);
        ctx.fillStyle = pal.wallHi;
        let bw = (w * 2) / 5;
        for(let i = 0; i < 5; i++) {
            if(i % 2 === 0) ctx.fillRect(-w + i * bw, -h - (fxLite ? 2.8 : 3.4), bw + 0.5, fxLite ? 3 : 3.6);
        }
    } else {
        wodDrawFortBunkerCore(ctx, w, h, fxLite, pal);
    }
    let px = w * 0.48,
        poleTop = -h - (fxLite ? 2.8 : 3.8),
        poleBase = -h + 4;
    ctx.strokeStyle = 'rgba(20,26,38,1)';
    ctx.lineWidth = fxLite ? 0.88 : 1.02;
    ctx.beginPath();
    ctx.moveTo(px, poleBase);
    ctx.lineTo(px, poleTop);
    ctx.stroke();
    let fs = fxLite ? 7.35 : 9.35;
    ctx.fillStyle = factionCol;
    ctx.strokeStyle = 'rgba(14,21,34,1)';
    ctx.lineWidth = fxLite ? 0.78 : 0.92;
    ctx.fillRect(px + 1, poleTop + 0.45, fs, fs);
    ctx.strokeRect(px + 1, poleTop + 0.45, fs, fs);
    ctx.restore();
}
function drawBridgeSticker(ctx, br, fxLite, culPadFn, alphaMul) {
    br = wodNormalizeBridgeRecord(br);
    if(!br) return;
    let w = br.w || (gameData.hexRadius || 20) * 1.8;
    let h = br.h || (gameData.hexRadius || 20) * 0.65;
    let footprint = Math.max(w, h) * 0.58;
    if(typeof culPadFn === 'function' && !culPadFn(br.x, br.y, footprint)) return;
    if(wodBoardMapActive()){WodBoardArt.bridge(ctx,wodBoardMapActive(),br,alphaMul==null?1:alphaMul);return;}
    alphaMul = alphaMul == null ? 1 : alphaMul;
    ctx.save();
    ctx.globalAlpha = alphaMul;
    ctx.translate(br.x, br.y);
    if(br.angle) ctx.rotate(br.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, h * 0.42, w * 0.46, h * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a89272';
    ctx.strokeStyle = '#4a3828';
    ctx.lineWidth = fxLite ? 1.15 : 1.45;
    ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
    ctx.strokeRect(-w * 0.5, -h * 0.5, w, h);
    ctx.strokeStyle = '#6f5438';
    ctx.lineWidth = fxLite ? 0.85 : 1.05;
    let planks = Math.max(5, Math.min(14, Math.round(w / (fxLite ? 10 : 8))));
    let step = w / planks;
    for(let pi = 1; pi < planks; pi++) {
        let px = -w * 0.5 + pi * step;
        ctx.beginPath();
        ctx.moveTo(px, -h * 0.5);
        ctx.lineTo(px, h * 0.5);
        ctx.stroke();
    }
    ctx.restore();
}
function wodFortPlacementRingRadiusSq() {
    let hr = gameData.hexRadius || 10,
        tiles = Math.max(WOD_FORT_DEFENSE_TILES, 3.2),
        spacing = hr * 1.35;
    let rad = spacing * tiles;
    return rad * rad;
}
function wodFortPlacementError(hex,owner,opts={}) {
    if(!hex||!owner)return 'Choose an owned land tile for the fort.';
    if(hex.owner!==owner)return 'You can only fortify your own territory.';
    if(!hexEligibleForFortTerrain(hex,owner))return 'Forts require open land outside water, mountains and town centers.';
    if(fortAtHexKey(hex.q,hex.r))return 'There is already a fort here.';
    if((gameData.hospitals||[]).some(h=>h.q===hex.q&&h.r===hex.r)||(gameData.constructionJobs||[]).some(j=>j.mode==='hospital'&&j.q===hex.q&&j.r===hex.r))return 'A hospital already occupies this site.';
    if(!opts.editor&&!opts.prepaid) {
        if((gameData.constructionJobs||[]).some(j=>j.mode==='fort'&&j.q===hex.q&&j.r===hex.r))return 'A fort is already under construction here.';
        if(wodPlayerTreasury(owner)<WOD_PRICE_FORT)return wodExplainBuildBlockReason('fort',owner,null);
    }
    return null;
}
function placeFortAtHex(hex, owner, opts) {
    opts = opts || {};
    if(!gameData.forts) gameData.forts = [];
    let noisy = !opts.suppressNotes;
    const error=wodFortPlacementError(hex,owner,opts);
    if(error){if(noisy)showNotification(error);return false;}
    if(!opts.editor&&!opts.prepaid) {
        wodDeductPlayerMoney(owner, WOD_PRICE_FORT);
        return wodQueueProduction('fort', owner, { q: hex.q, r: hex.r, x: hex.x, y: hex.y });
    }
    wodFortPlacementSeq++;
    gameData.forts.push({
        id: 'fort_' + wodFortPlacementSeq,
        owner,
        q: hex.q,
        r: hex.r,
        x: hex.x,
        y: hex.y,
        _lastOwner: owner
    });
    if(noisy && !opts.editor) {
        if(wodFortInsideFriendlyAura(hex, owner))
            showNotification('Fort built. You may place forts close together — overlapping auras do not stack (+20% defense once).');
        else
            showNotification('+20% defense aura for allied troops surrounding this fort.');
    }
    if(!opts.editor && wodProgress && gameState === 'PLAYING' && !gameData.menuAttractMode) {
        wodRecordOwnerLifetime(owner,'fortsBuilt',1);
        scheduleSaveWodProgress();
    }
    return true;
}
function attemptFortPlacementForOwner(hex, owner, suppressNotes) {
    return placeFortAtHex(hex, owner, { suppressNotes: !!suppressNotes });
}
function tryApplyFortBuildAtWorld(worldPos) {
    let hex = getNearestHexToPoint(worldPos.x, worldPos.y);
    if(!hex) {
        showNotification('No terrain hex there.');
        return true;
    }
    let tol = Math.max(10, gameData.hexRadius || 15) * 0.92;
    let dx = worldPos.x - hex.x,
        dy = worldPos.y - hex.y;
    if(dx * dx + dy * dy > tol * tol) {
        showNotification('Click closer to a land tile to pave a fort footprint.');
        return true;
    }
    let lo = wodLocalPlayerOwner();
    const error=wodFortPlacementError(hex,lo);if(error){showNotification(error);return true;}
    if(gameData.mp && gameData.mp.enabled && !gameData.mp.isHost) {
        if(wodMpSendCmd({ kind: 'build', mode: 'fort', hq: hex.q, hr: hex.r })) {
            exitBuildPlacementMode();
            return true;
        }
    }
    if(attemptFortPlacementForOwner(hex, lo)) exitBuildPlacementMode();

    return true;
}
// Drag-to-build state. `a` is the cell that was pressed, `b` the cell now under the pointer,
// `hover` the cell under an idle pointer. `anchored` means the start was set by a tap, so the
// next press picks the far bank (two taps work as well as one drag, which matters on phones).
function wodInitBridgePlacementPreview() {
    gameData.bridgePlacement = { a: null, b: null, hover: null, dragging: false, anchored: false, plan: null, planKey: '', rightDown: null };
}
function wodBridgeCellAtWorld(worldPos) {
    const h = worldPos && getNearestHexToPoint(worldPos.x, worldPos.y);
    return h ? { q: h.q, r: h.r } : null;
}
function wodBridgeDragBegin(worldPos) {
    const p = gameData.bridgePlacement, cell = wodBridgeCellAtWorld(worldPos);
    if(!p || !cell) return;
    if(!(p.anchored && p.a)) p.a = cell;
    p.b = cell;
    p.dragging = true;
}
function wodBridgeDragMove(worldPos) {
    const p = gameData.bridgePlacement, cell = wodBridgeCellAtWorld(worldPos);
    if(!p || !cell) return;
    if(p.dragging || p.anchored) p.b = cell;
    else p.hover = cell;
}
function wodBridgeDragCancel() {
    const p = gameData.bridgePlacement;
    if(!p) return;
    p.a = p.b = null;
    p.dragging = p.anchored = false;
    p.plan = null;
    p.planKey = '';
}
/** An interrupted press (second finger, pointer released off the map, touch cancelled):
 * drop the span being dragged, but keep a start that was set by a tap. */
function wodBridgeDragAbort() {
    const p = gameData.bridgePlacement;
    if(!p || !p.dragging) return;
    if(p.anchored) { p.dragging = false; p.b = p.a; }
    else wodBridgeDragCancel();
}
function wodBridgeDragEnd(worldPos) {
    const p = gameData.bridgePlacement;
    if(!p || !p.dragging) return;
    const cell = wodBridgeCellAtWorld(worldPos);
    if(cell) p.b = cell;
    p.dragging = false;
    if(!p.a || !p.b) { wodBridgeDragCancel(); return; }
    if(p.a.q === p.b.q && p.a.r === p.b.r) {
        // Released where it was pressed: keep the cell as the start, or clear it on a second tap.
        if(p.anchored) { wodBridgeDragCancel(); return; }
        const h = wodHexAt(p.a.q, p.a.r);
        if(!h || isWaterHex(h)) { showNotification('Start the bridge on land, then drag across the water.'); wodBridgeDragCancel(); return; }
        p.anchored = true;
        showNotification('Bridge start set. Pick the far bank, or drag across in one motion.', 'info');
        return;
    }
    tryApplyBridgeSpan(p.a, p.b);
}
/** The span between the two cells of a drag, laid out once per change of either end.
 * Judging a site scans the map for other bridges, far too much to repeat every frame. */
function wodBridgeDragPlan(p) {
    const lo = wodLocalPlayerOwner();
    const key = [p.a.q, p.a.r, p.b.q, p.b.r, lo, gameData._bridgeIndexSig, (gameData.constructionJobs || []).length, gameData._supplyTopologyVersion || 0].join('|');
    if(!p.plan || p.planKey !== key) { p.plan = wodBridgeSpanPlan(p.a.q, p.a.r, p.b.q, p.b.r, lo, { skipCost: true }); p.planKey = key; }
    return p.plan;
}
/** Live preview of a dragged bridge: the cells it crosses, the deck, length, price and what is wrong with it. */
function wodDrawBridgeDragPreview(ctx, lite) {
    const p = gameData.bridgePlacement;
    if(!p) return;
    const sp = (gameData.hexRadius || 20) * 1.35, zoom = Math.max(0.05, gameData.camera.zoom || 1);
    const cellBox = (h, fill, stroke) => {
        if(!h) return;
        if(fill) { ctx.fillStyle = fill; ctx.fillRect(h.x - sp / 2, h.y - sp / 2, sp, sp); }
        if(stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = (lite ? 1.6 : 2.2) / zoom; ctx.strokeRect(h.x - sp / 2, h.y - sp / 2, sp, sp); }
    };
    ctx.save();
    if(!p.a || !(p.dragging || p.anchored) || !p.b) {
        // Idle: show the cell the bridge would start from. Yellow on land (green vanishes
        // on grass), red on water and mountains, where a bridge cannot start.
        const h = p.hover && wodHexAt(p.hover.q, p.hover.r);
        if(h) cellBox(h, null, isWaterHex(h) || h.type === 'mountain' ? 'rgba(231, 76, 60, 0.85)' : '#f1c40f');
        ctx.restore();
        return;
    }
    const plan = wodBridgeDragPlan(p), lo = wodLocalPlayerOwner();
    let err = plan.error;
    if(!err && wodPlayerTreasury(lo) < plan.cost) err = 'Not enough money (you have $' + Math.floor(wodPlayerTreasury(lo)).toLocaleString('en-US') + ')';
    const good = 'rgba(46, 204, 113, 0.95)', bad = 'rgba(231, 76, 60, 0.95)';
    for(const h of plan.cells) cellBox(h, err ? 'rgba(231, 76, 60, 0.28)' : 'rgba(46, 204, 113, 0.28)', err ? bad : good);
    for(const h of plan.banks) cellBox(h, null, '#f1c40f');
    const startHex = wodHexAt(p.a.q, p.a.r), endHex = wodHexAt(p.b.q, p.b.r);
    if(plan.record) {
        const r = plan.record;
        drawBridgeSticker(ctx, r, lite, null, err ? 0.4 : 0.7);
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.rotate(r.angle || 0);
        ctx.strokeStyle = err ? bad : good;
        ctx.lineWidth = (lite ? 2.2 : 3) / zoom;
        ctx.setLineDash([8 / zoom, 6 / zoom]);
        ctx.strokeRect(-r.w / 2, -r.h / 2, r.w, r.h);
        ctx.setLineDash([]);
        ctx.restore();
    } else if(startHex && endHex) {
        // No deck yet (the pointer is still over water, or never left the bank): show the pull.
        cellBox(startHex, null, '#f1c40f');
        ctx.strokeStyle = bad;
        ctx.lineWidth = 2.4 / zoom;
        ctx.setLineDash([8 / zoom, 6 / zoom]);
        ctx.beginPath();
        ctx.moveTo(startHex.x, startHex.y);
        ctx.lineTo(endHex.x, endHex.y);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    // Label beside the pointer end: length and price, then the reason when the span is not allowed.
    const lines = [];
    if(plan.count) lines.push(plan.count + (plan.count === 1 ? ' cell' : ' cells') + ' · $' + plan.cost.toLocaleString('en-US'));
    if(err) lines.push(err);
    const at = endHex || startHex;
    if(lines.length && at) {
        const fs = 13 / zoom, pad = 5 / zoom;
        ctx.font = 'bold ' + fs + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const width = Math.max(...lines.map(t => ctx.measureText(t).width)) + pad * 2, height = lines.length * fs * 1.25 + pad * 2;
        // On a phone the finger rests on the end cell, so the label sits well clear of it.
        const top = at.y - sp * (typeof wodUsesVisualViewportLayout === 'function' && wodUsesVisualViewportLayout() ? 2.4 : 0.9) - height;
        ctx.fillStyle = 'rgba(16, 30, 43, 0.92)';
        ctx.fillRect(at.x - width / 2, top, width, height);
        ctx.strokeStyle = err ? bad : good;
        ctx.lineWidth = 1.5 / zoom;
        ctx.strokeRect(at.x - width / 2, top, width, height);
        lines.forEach((t, i) => { ctx.fillStyle = err && i === lines.length - 1 ? '#ffb4a8' : '#ffffff'; ctx.fillText(t, at.x, top + pad + fs * 0.625 + i * fs * 1.25); });
    }
    ctx.restore();
}
let wodBridgePlacementSeq = 0;
/** Build a bridge between two cells: the entry point for the player's drag, the AI and network
 * clients. Checks the site, charges $1,000 per water cell crossed and queues the construction. */
function placeBridgeSpan(owner, aq, ar, bq, br, opts) {
    opts = opts || {};
    const plan = wodBridgeSpanPlan(aq, ar, bq, br, opts.editor ? null : owner, { editor: !!opts.editor, skipCost: !!opts.editor });
    if(plan.error) {
        if(!opts.suppressNotes) showNotification(plan.error);
        return false;
    }
    const r = plan.record;
    return placeBridgeAt(owner, r.x, r.y, r.angle, r.w, r.h, Object.assign({}, opts, { cells: plan.count }));
}
function placeBridgeAt(owner, x, y, angle, w, h, opts) {
    opts = opts || {};
    if(!gameData.bridges) gameData.bridges = [];
    let noisy = !opts.suppressNotes;
    let br = { x, y, angle: angle || 0, w, h, owner: owner || 0 };
    // A planned span brings its cell count; any other deck is measured where it lies.
    const cells = opts.cells > 0 ? Math.round(opts.cells) : wodBridgeRecordCells(br), cost = cells * WOD_PRICE_BRIDGE_PER_CELL;
    let err = wodBridgePlacementError(br, opts.editor ? null : owner, !!opts.prepaid, cost);
    if(err) {
        if(noisy) showNotification(err);
        return false;
    }
    if(!opts.editor && !opts.prepaid) {
        if(wodBridgePendingJobConflict(br)){if(noisy)showNotification('A bridge is already under construction at this crossing.');return false;}
        wodDeductPlayerMoney(owner, cost);
        // The job remembers what was paid so a cancelled bridge refunds exactly that.
        return wodQueueProduction('bridge', owner, { x, y, angle, w, h, cells, cost });
    }
    br = wodNormalizeBridgeRecord(br);
    if(opts.cells > 0) br.cells = cells;
    wodSyncBridgeWorldCoords(br);
    wodBridgePlacementSeq++;
    br.id = 'bridge_' + wodBridgePlacementSeq;
    br.owner = owner || 0;
    gameData.bridges.push(br);wodBattleMetric(br.owner,'bridgesBuilt');
    wodRebuildBridgeHexIndex();
    if(!opts.editor) {
        // Adding a crossing does not invalidate routes already in use. Clearing
        // every army's path here caused a synchronized re-path spike at completion.
        const refresh=gameData._bridgeRouteRefresh||(gameData._bridgeRouteRefresh=[]);
        for(const u of gameData.entities)if(u&&u.hp>0&&wodUnitUsesLandBridges(u)&&u.orderTarget&&!u.path?.length&&
            (u._needsTransport||u.stuckTimer>.5||u.target?.landGreedy||u.target?.ampGreedy))refresh.push({unit:u,hexes:gameData.hexes});
    }
    if(noisy) showNotification('Bridge built — troops cross it like open ground.','success');
    return true;
}
function wodStepBridgeRouteRefresh() {
    if(gameData._wodBridgeRouteFrameDone||!wodCanSpendPf())return;
    const refresh=gameData._bridgeRouteRefresh;if(!refresh?.length)return;
    gameData._wodBridgeRouteFrameDone=true;
    while(refresh.length) {
        const {unit,hexes}=refresh.shift();if(hexes!==gameData.hexes||unit.hp<=0||!unit.orderTarget||unit.boardTransportUid||!gameData.entities.includes(unit))continue;
        replanUnitOrder(unit);break;
    }
}
/** Releasing a drag (or the second tap): build the span between the two cells if the site allows it. */
function tryApplyBridgeSpan(a, b) {
    if(gameData.mp && gameData.mp.enabled && !wodMpMatchCanPlay()) { wodBridgeDragCancel(); return false; }
    const lo = wodLocalPlayerOwner(), plan = wodBridgeSpanPlan(a.q, a.r, b.q, b.r, lo);
    if(plan.error) {
        // Stay in the tool: the player corrects the drag rather than reopening the build menu.
        showNotification(plan.error);
        wodBridgeDragCancel();
        return false;
    }
    const r = plan.record;
    if(gameData.mp && gameData.mp.enabled && !gameData.mp.isHost) {
        // Only the two bank cells travel. The host lays the span out again from them,
        // applies the same rules and charges for the cells it finds.
        if(wodMpSendCmd({ kind: 'build', mode: 'bridge', aq: r.aq, ar: r.ar, bq: r.bq, br: r.br })) {
            exitBuildPlacementMode();
            return true;
        }
    }
    if(placeBridgeSpan(lo, r.aq, r.ar, r.bq, r.br)) { exitBuildPlacementMode(); return true; }
    wodBridgeDragCancel();
    return false;
}
/** A plain click or tap while the bridge tool is open counts as press and release on one cell. */
function tryApplyBridgeBuildAtWorld(worldPos) {
    if(!gameData.bridgePlacement) return true;
    wodBridgeDragBegin(worldPos);
    wodBridgeDragEnd(worldPos);
    return true;
}
function wodHandleProductionPlacementClick(worldPos) {
    if(gameData.mp && gameData.mp.enabled && !wodMpMatchCanPlay()) return false;
    let mode = gameData.buildMode;
    if(!mode) return false;
    if(mode==='hospital') {
        const hex=getNearestHexToPoint(worldPos.x,worldPos.y),owner=wodLocalPlayerOwner();
        const error=wodHospitalPlacementError(hex,owner);if(error){showNotification(error);return true;}
        if(gameData.mp?.enabled&&!gameData.mp.isHost){if(wodMpSendCmd({kind:'build',mode,hq:hex.q,hr:hex.r}))exitBuildPlacementMode();}
        else if(placeHospitalAtHex(hex,owner))exitBuildPlacementMode();
        return true;
    }
    if(mode === 'fort') {
        tryApplyFortBuildAtWorld(worldPos);
        return true;
    }
    if(mode === 'bridge') {
        tryApplyBridgeBuildAtWorld(worldPos);
        return true;
    }
    let city = pickPlayerCityAtWorld(worldPos);
    if(city) tryApplyBuildPlacementAtCity(city);
    return true;
}
function pickPlayerCityAtWorld(worldPos) {
    let lo = wodLocalPlayerOwner();
    let best = null;
    let bestD2 = 400;
    for(let i = 0, cl = gameData.cities.length; i < cl; i++) {
        let city = gameData.cities[i];
        if(city.owner !== lo || !city.id) continue;
        let dx = worldPos.x - city.x, dy = worldPos.y - city.y;
        let d2 = dx * dx + dy * dy;
        if(d2 < bestD2) {
            bestD2 = d2;
            best = city;
        }
    }
    return best;
}
function cityEligibleForBuildPlacementForOwner(city, mode, owner) {
    if(!city || city.owner !== owner || !city.id || !mode || wodCityProductionJob(city)) return false;
    if(isCitySiegeBlockedForProduction(city))return false;
    const reserveType=wodCampaignReserveType(mode);
    if(reserveType) {
        return !!(owner===1 && gameData._campaignRun?.battleLive && wodCampaignReserveUnits(reserveType).length &&
            !isCityEncircledForProduction(city) && findSpawnHex(reserveType, city, owner));
    }
    if(owner===1 && gameData._campaignRun && !gameData._campaignRun.battleLive)return false;
    if(mode === 'factory') {
        if(city.hasFactory) return false;
        return wodPlayerTreasury(owner) >= WOD_PRICE_FACTORY;
    }
    if(mode === 'farm') {
        if(city.hasFarm) return false;
        return wodPlayerTreasury(owner) >= WOD_PRICE_FARM;
    }
    if(mode === 'harbor') {
        if(city.hasHarbor) return false;
        if(wodPlayerTreasury(owner) < WOD_PRICE_HARBOR) return false;
        return cityHasWaterNeighbor(city);
    }
    let cost = getUnitCost(mode);
    if(wodPlayerTreasury(owner) < cost.money || wodPlayerMpPool(owner) < cost.manpower) return false;
    if(isCitySiegeBlockedForProduction(city) && (mode === 'light' || mode === 'marine' || mode === 'heavy' || mode === 'ship' || mode === 'transport'))
        return false;
    if(['light','mountaineer','motorized'].includes(mode))return (mode!=='motorized'||city.hasFactory)&&!!findSpawnHex(mode,city,owner);
    if(mode === 'marine')
        return !!(cityHasWaterNeighbor(city) && !!findSpawnHex('marine', city, owner));
    if(mode === 'heavy')
        return !!city.hasFactory && !!findSpawnHex('heavy', city, owner);
    if(mode === 'supply')return !!city.hasHarbor && !!findSpawnHex('supply',city,owner);
    if(mode === 'transport')return !!city.hasHarbor && !!findSpawnHex('transport',city,owner);
    if(mode === 'ship')
        return !!city.hasHarbor && !!findSpawnHex('ship', city, owner);
    return false;
}
function cityEligibleForBuildPlacement(city, mode) {
    return cityEligibleForBuildPlacementForOwner(city, mode, wodLocalPlayerOwner());
}
/** Human-readable reason a train/build action is blocked (money, MP, city requirements). */
function wodExplainBuildBlockReason(mode, owner, city) {
    if(!mode) return 'That action is not available right now.';
    if(mode==='hospital')return wodPlayerTreasury(owner)<WOD_PRICE_HOSPITAL?'Not enough money for a hospital — needs $'+WOD_PRICE_HOSPITAL+'.':'Hospitals require a free owned land tile outside towns, mountains and water.';
    if(city&&(!city.id||city.owner!==owner))return 'Choose one of your own towns.';
    if(city&&isCitySiegeBlockedForProduction(city))return 'This town is under attack — construction and mobilization pause until the siege clears.';
    if(city && wodCityProductionJob(city)) return 'This town is busy: ' + wodProductionLabel(wodCityProductionJob(city).mode) + ' · ' + Math.ceil(wodCityProductionJob(city).remaining) + 's remaining.';
    const reserveType=wodCampaignReserveType(mode);
    if(reserveType) {
        if(owner!==1||!gameData._campaignRun?.battleLive) return 'Begin a campaign battle before calling reinforcements.';
        if(!wodCampaignReserveUnits(reserveType).length) return 'No ' + wodProductionLabel(reserveType) + ' reserves remain. Recruit additional troops with the normal unit buttons.';
        return 'Reinforcements need a free friendly town with a safe arrival area (ships need water).';
    }
    if(owner===1&&gameData._campaignRun&&!gameData._campaignRun.battleLive)return 'Begin the battle before recruiting or building.';
    let money = Math.floor(wodPlayerTreasury(owner) || 0);
    let mp = Math.floor(wodPlayerMpPool(owner) || 0);
    if(!city&&['factory','farm','harbor'].includes(mode)) {
        const towns=gameData.cities.filter(c=>c.id&&c.owner===owner),field={factory:'hasFactory',farm:'hasFarm',harbor:'hasHarbor'}[mode];
        const price={factory:WOD_PRICE_FACTORY,farm:WOD_PRICE_FARM,harbor:WOD_PRICE_HARBOR}[mode],name=wodProductionLabel(mode).toLowerCase();
        if(money<price)return 'Not enough money for a '+name+' — needs $'+price+' (you have $'+money+').';
        if(!towns.length)return 'Capture a town before building a '+name+'.';
        let available=towns.filter(c=>!c[field]);
        if(!available.length)return 'All your towns already have a '+name+'.';
        if(mode==='harbor') {available=available.filter(cityHasWaterNeighbor);if(!available.length)return 'Harbors require a coastal town with water next to it.';}
        if(available.every(isCitySiegeBlockedForProduction))return 'All eligible towns are under attack. Construction resumes when the siege clears.';
        if(available.filter(c=>!isCitySiegeBlockedForProduction(c)).every(c=>wodCityProductionJob(c)))return 'All eligible towns are busy. Wait for their current orders to finish.';
    }
    if(mode === 'factory') {
        if(city && city.hasFactory) return 'This town already has a factory.';
        if(money < WOD_PRICE_FACTORY)
            return 'Not enough money for a factory — needs $' + WOD_PRICE_FACTORY + ' (you have $' + money + ').';
        return 'No town can build a factory right now.';
    }
    if(mode === 'farm') {
        if(city && city.hasFarm) return 'This town already has a farm.';
        if(money < WOD_PRICE_FARM)
            return 'Not enough money for a farm — needs $' + WOD_PRICE_FARM + ' (you have $' + money + ').';
        return 'No town can build a farm right now.';
    }
    if(mode === 'harbor') {
        if(city && city.hasHarbor) return 'This town already has a harbor.';
        if(money < WOD_PRICE_HARBOR)
            return 'Not enough money for a harbor — needs $' + WOD_PRICE_HARBOR + ' (you have $' + money + ').';
        if(city && !cityHasWaterNeighbor(city)) return 'Harbors require water next to the town.';
        return 'No coastal town can build a harbor right now.';
    }
    if(mode === 'fort') return money<WOD_PRICE_FORT
        ? 'Not enough money for a fort — needs $'+WOD_PRICE_FORT+' (you have $'+money+').'
        : 'No free owned land for a fort. Choose ground outside water, mountains and town centers.';
    if(mode === 'bridge') {
        if(money < WOD_PRICE_BRIDGE_PER_CELL)
            return 'Not enough money for a bridge — needs $' + WOD_PRICE_BRIDGE_PER_CELL + ' per water cell crossed (you have $' + money + ').';
        return 'Drag from one bank to the other across clear water, with both bridge ends on land.';
    }
    let cost = getUnitCost(mode);
    let unitName = wodProductionLabel(mode).toLowerCase();
    let shortMoney = money < cost.money;
    let shortMp = mp < cost.manpower;
    if(shortMoney && shortMp) {
        return 'Not enough money or manpower to train ' + unitName
            + ' — needs $' + cost.money + ' and ' + formatPeople(cost.manpower) + ' MP'
            + ' (you have $' + money + ' and ' + formatPeople(mp) + ' MP).';
    }
    if(shortMoney) {
        return 'Not enough money to train ' + unitName
            + ' — needs $' + cost.money + ' (you have $' + money + ').';
    }
    if(shortMp) {
        return 'Not enough manpower to train ' + unitName
            + ' — needs ' + formatPeople(cost.manpower) + ' MP (you have ' + formatPeople(mp) + ' MP).';
    }
    if(city) {
        if((mode === 'heavy'||mode==='motorized') && !city.hasFactory) return wodProductionLabel(mode)+' requires a factory in this town.';
        if(wodIsNavalType(mode) && !city.hasHarbor) return 'Ships require a harbor in this town.';
        if(mode === 'marine' && !cityHasWaterNeighbor(city)) return 'Marines train only at coastal towns (water adjacent).';
        if(isCityEncircledForProduction(city)) return 'This town is encircled — training and shipbuilding are cut off until a corridor reopens.';
        if(isCitySiegeBlockedForProduction(city)) return 'Urban combat at this town — training and shipbuilding are paused until the battle clears.';
        return wodIsNavalType(mode) ? 'No water nearby to launch a ship from this town.' : 'No clear spawn area near this town.';
    }
    // Global: resources OK but no city can host this unit type.
    let owned = 0, factoryOk = 0, harborOk = 0, coastOk = 0, clearOk = 0, blocked = 0;
    for(let i = 0, cl = gameData.cities.length; i < cl; i++) {
        let c = gameData.cities[i];
        if(!c || c.owner !== owner || !c.id) continue;
        owned++;
        if(isCitySiegeBlockedForProduction(c)) { blocked++; continue; }
        if((mode === 'heavy'||mode==='motorized') && c.hasFactory) factoryOk++;
        if(wodIsNavalType(mode) && c.hasHarbor) harborOk++;
        if(mode === 'marine' && cityHasWaterNeighbor(c)) coastOk++;
        let ut = mode;
        if((!['heavy','motorized'].includes(mode) || c.hasFactory) && (!wodIsNavalType(mode) || c.hasHarbor)
            && (mode !== 'marine' || cityHasWaterNeighbor(c)) && findSpawnHex(ut, c, owner))
            clearOk++;
    }
    const eligible=gameData.cities.filter(c=>c.id&&c.owner===owner&&(!['heavy','motorized'].includes(mode)||c.hasFactory)&&(!wodIsNavalType(mode)||c.hasHarbor)&&(mode!=='marine'||cityHasWaterNeighbor(c)));
    if(eligible.length&&eligible.every(c=>wodCityProductionJob(c)))return 'All eligible towns are busy. Wait for their current orders to finish.';
    if(!owned) return 'You need a town before you can train ' + unitName + '.';
    if(['heavy','motorized'].includes(mode) && !factoryOk) return wodProductionLabel(mode)+' requires a factory — build one in a town first.';
    if(wodIsNavalType(mode) && !harborOk) return 'Ships require a harbor — build one at a coastal town first.';
    if(mode === 'marine' && !coastOk) return 'Marines need a coastal town (water adjacent).';
    if(blocked && !clearOk) return 'All eligible towns are under attack — mobilization resumes when the siege clears.';
    if(!clearOk) return 'No clear spawn area near your towns for ' + unitName + '.';
    return 'No towns can train ' + unitName + ' right now.';
}
const WOD_PRODUCTION_SECONDS = { factory: 60, harbor: 60, farm: 60, fort: 60, hospital:60, bridge: 60, light: 15, motorized:23,mountaineer:20,marine: 20, heavy: 25, ship: 30, transport: 18, supply: 22 };
function wodProductionLabel(mode) {
    const reserve=wodCampaignReserveType(mode);if(reserve)return 'Call '+wodProductionLabel(reserve)+' reserves';
    let f = wodActivePeriodFlavor();
    return ({factory:f.factory, harbor:f.harbor, farm:f.farm || 'Farm', fort:f.fort || 'Fort', hospital:'Hospital', bridge:'Bridge',
        light:f.light,motorized:wodSpecialistLabel('motorized'),mountaineer:wodSpecialistLabel('mountaineer'),marine:f.marine, heavy:f.heavy, ship:f.ship, transport:'Transport', supply:wodSupplyShipLabel()})[mode] || mode;
}
function wodCityProductionJob(city) {
    return (gameData.constructionJobs || []).find(j => j.cq === city.q && j.cr === city.r);
}
function wodQueueProduction(mode, owner, location) {
    if(!gameData.constructionJobs) gameData.constructionJobs = [];
    let total = WOD_PRODUCTION_SECONDS[mode];
    if(!total) return false;
    gameData.constructionJobs.push(Object.assign({ mode, owner, remaining: total, total }, location));
    if(owner === wodLocalPlayerOwner()) showNotification(wodProductionLabel(mode) + (location.rosterId ? ' reinforcements called · ' : ' queued · ') + (mode === 'bridge' && location.cost ? location.cells + (location.cells === 1 ? ' cell · $' : ' cells · $') + location.cost.toLocaleString('en-US') + ' · ' : '') + total + 's','info');
    wodRefreshCommandHud(true);
    return true;
}
function wodApplyBuildAtCityForOwner(city, mode, owner) {
    if(!cityEligibleForBuildPlacementForOwner(city, mode, owner)) return false;
    const reserveType=wodCampaignReserveType(mode);
    if(reserveType) {
        let reserve = wodCampaignReserveUnits(reserveType)[0];
        if(!reserve) return false;
        return wodQueueProduction(reserveType, owner, { cq:city.q, cr:city.r, x:city.x, y:city.y, rosterId:reserve.id });
    }
    let price = { factory: WOD_PRICE_FACTORY, harbor: WOD_PRICE_HARBOR, farm: WOD_PRICE_FARM }[mode];
    if(price != null) wodDeductPlayerMoney(owner, price);
    else if(!spendForUnit(owner, mode)) return false;
    return wodQueueProduction(mode, owner, { cq: city.q, cr: city.r, x: city.x, y: city.y });
}
function wodUpdateConstruction(dt) {
    if(!dt || (gameData.mp?.enabled && !gameData.mp.isHost) || wodCampaignDeployActive()) return;
    let jobs = gameData.constructionJobs || [];
    for(let i = jobs.length - 1; i >= 0; i--) {
        let j = jobs[i];
        let city = j.cq != null ? gameData.cities.find(c => c.q === j.cq && c.r === j.cr) : null;
        let hex = getNearestHexToPoint(j.x, j.y);
        if(j.mode==='bridge'&&!wodBridgeEndTouchesLand(j,-1,j.owner)&&!wodBridgeEndTouchesLand(j,1,j.owner)){
            // Refund what this bridge cost. Jobs saved before per-cell pricing paid the flat price.
            const paid=j.cost>0?j.cost:WOD_PRICE_BRIDGE;
            if(j.owner===1)gameData.money+=paid;
            else{gameData.aiMoneyByOwner||={};gameData.aiMoneyByOwner[j.owner]=wodPlayerTreasury(j.owner)+paid;}
            wodBattleMetric(j.owner,'moneySpent',-paid);jobs.splice(i,1);
            if(j.owner===wodLocalPlayerOwner())showNotification('Bridge cancelled and refunded: neither bank is still yours.','info');continue;
        }
        if((j.cq != null && (!city || city.owner !== j.owner)) || (!city && j.mode!=='bridge' && (!hex || hex.owner !== j.owner))) {
            jobs.splice(i, 1); continue;
        }
        if(city && isCitySiegeBlockedForProduction(city)) continue;
        j.remaining = Math.max(0, j.remaining - dt);
        if(j.remaining > 0) continue;
        let done = true;
        if(j.mode === 'hospital') done = placeHospitalAtHex(hex,j.owner,{prepaid:true});
        else if(j.mode === 'fort') done = placeFortAtHex(hex, j.owner, { prepaid: true, suppressNotes: true });
        else if(j.mode === 'bridge') done = placeBridgeAt(j.owner, j.x, j.y, j.angle, j.w, j.h, { prepaid: true, suppressNotes: true, cells: j.cells });
        else if(['factory', 'harbor', 'farm'].includes(j.mode)) {
            city[{ factory: 'hasFactory', harbor: 'hasHarbor', farm: 'hasFarm' }[j.mode]] = true;
            wodRecordOwnerLifetime(j.owner,{factory:'factoriesBuilt',harbor:'harborsBuilt',farm:'farmsBuilt'}[j.mode],1);
        } else if(j.rosterId) {
            let run = gameData._campaignRun, r = wodRogueLoad()?.roster.find(r => r.id === j.rosterId);
            if(!run || !r || run.deployedRosterIds.includes(r.id)) { jobs.splice(i,1); continue; }
            let unit = spawnUnit(j.mode, city, j.owner);
            done = !!unit;
            if(unit) {
                wodApplyCampaignUnitStats(unit, r);
                run.deployedRosterIds.push(r.id);
                run.rosterAtStart = run.deployedRosterIds.length;
            }
        } else {
            const unit=spawnUnit(j.mode, city, j.owner);done=!!unit;
            if(unit&&j._aiReinforceFor){unit._aiRequestedGroup=j._aiReinforceGroup;unit._aiRequestedSquad=j._aiReinforceSquad;unit._aiFrontAssignment={hexes:gameData.hexes,enemy:j._aiReinforceFront,at:wodAiOperationTime()};}
            if(unit&&j.owner===1&&gameData._campaignRun){unit._campRecruited=true;gameData._campaignRun.recruitsBuilt=(gameData._campaignRun.recruitsBuilt||0)+1;}
        }
        // Training waits at zero for a free spawn slot rather than losing paid troops.
        if(!done) continue;
        jobs.splice(i, 1);
        if(j.owner === wodLocalPlayerOwner() && done) showNotification(wodProductionLabel(j.mode) + (j.rosterId ? ' reinforcements ready' : ' ready'),'success');
    }
}
function enterBuildPlacementMode(mode) {
    if(gameData._spectator)return;
    if(gameState !== 'PLAYING') return;
    if(gameData.buildMode === mode) {
        exitBuildPlacementMode();
        return;
    }
    let lo = wodLocalPlayerOwner();
    let any = false;
    if(mode==='hospital') {
        if(wodPlayerTreasury(lo)<WOD_PRICE_HOSPITAL){showNotification(wodExplainBuildBlockReason(mode,lo));return;}
        any=gameData.hexList.some(h=>!wodHospitalPlacementError(h,lo));
    } else if(mode === 'fort') {
        if(wodPlayerTreasury(lo)<WOD_PRICE_FORT){showNotification(wodExplainBuildBlockReason(mode,lo,null));return;}
        if(!gameData.hexList || !gameData.hexList.length) {
            showNotification('No usable map yet.');
            return;
        }
        for(let ix = gameData.hexList.length - 1; ix >= 0; ix--) {
            let hh = gameData.hexList[ix];
            if(hexEligibleForFortPlacementForOwner(hh, lo)) {
                any = true;
                break;
            }
        }
    } else if(mode === 'bridge') {
        // The shortest bridge crosses one cell; longer ones are checked against the treasury as they are dragged.
        if(wodPlayerTreasury(lo) < WOD_PRICE_BRIDGE_PER_CELL) {
            showNotification('Not enough money for a bridge ($' + WOD_PRICE_BRIDGE_PER_CELL.toLocaleString('en-US') + ' per water cell).');
            return;
        }
        wodInitBridgePlacementPreview();
        any = true;
    } else {
        for(let i = 0, cl = gameData.cities.length; i < cl; i++) {
            let c = gameData.cities[i];
            if(c.owner !== lo || !c.id) continue;
            if(cityEligibleForBuildPlacementForOwner(c, mode, lo)) {
                any = true;
                break;
            }
        }
    }
    if(!any) {
        showNotification(wodExplainBuildBlockReason(mode, lo, null));
        return;
    }
    gameData.buildMode = mode;
    if(mode === 'bridge') showNotification('Press on one bank and drag to the other: $' + WOD_PRICE_BRIDGE_PER_CELL.toLocaleString('en-US') + ' per water cell, up to ' + WOD_BRIDGE_MAX_CELLS + ' cells. At least one bank must be yours · '
        + (typeof wodUsesVisualViewportLayout === 'function' && wodUsesVisualViewportLayout() ? 'tap a menu tab to cancel.' : 'Esc or right-click cancels.'),'info');
    if(UI.wrapper) UI.wrapper.style.cursor = 'crosshair';
    syncBuildPlacementMobileUi();
}
function tryApplyBuildPlacementAtCity(city) {
    let mode = gameData.buildMode;
    if(!mode || gameState !== 'PLAYING') return false;
    let lo = wodLocalPlayerOwner();
    if(!city || city.owner !== lo || !city.id) {
        showNotification('Choose one of your towns on the map.');
        return true;
    }
    if(!cityEligibleForBuildPlacementForOwner(city, mode, lo)) {
        showNotification(wodExplainBuildBlockReason(mode, lo, city));
        return true;
    }
    if(gameData.mp && gameData.mp.enabled && !gameData.mp.isHost) {
        if(wodMpSendCmd({ kind: 'build', mode, cq: city.q, cr: city.r })) {
            exitBuildPlacementMode();
            return true;
        }
    }
    if(!wodApplyBuildAtCityForOwner(city,mode,lo)){showNotification(wodExplainBuildBlockReason(mode,lo,city));return true;}
    exitBuildPlacementMode();
    return true;
}
function beginFactoryBuild() {
    enterBuildPlacementMode('factory');
}
function beginHarborBuild() {
    enterBuildPlacementMode('harbor');
}
function beginFarmBuild() {
    enterBuildPlacementMode('farm');
}
function beginFortBuild() {
    enterBuildPlacementMode('fort');
}
function beginHospitalBuild() {enterBuildPlacementMode('hospital');}
function wodHospitalPlacementError(hex,owner,opts={}) {
    if(!hexEligibleForFortTerrain(hex,owner))return 'Place the hospital on owned land outside towns, water and mountains.';
    if(fortAtHexKey(hex.q,hex.r)||(gameData.hospitals||[]).some(h=>h.q===hex.q&&h.r===hex.r))return 'A structure already occupies this tile.';
    if(!opts.prepaid&&!opts.editor){
        if((gameData.constructionJobs||[]).some(j=>['fort','hospital'].includes(j.mode)&&j.q===hex.q&&j.r===hex.r))return 'Construction is already underway here.';
        if(wodPlayerTreasury(owner)<WOD_PRICE_HOSPITAL)return wodExplainBuildBlockReason('hospital',owner);
    }
    return null;
}
function placeHospitalAtHex(hex,owner,opts={}) {
    if(wodHospitalPlacementError(hex,owner,opts))return false;
    if(!opts.prepaid&&!opts.editor){wodDeductPlayerMoney(owner,WOD_PRICE_HOSPITAL);return wodQueueProduction('hospital',owner,{q:hex.q,r:hex.r,x:hex.x,y:hex.y});}
    gameData.hospitals||=[];gameData.hospitals.push({id:'hospital_'+owner+'_'+hex.q+'_'+hex.r,owner,q:hex.q,r:hex.r,x:hex.x,y:hex.y});
    if(!opts.editor)wodRecordOwnerLifetime(owner,'hospitalsBuilt',1);
    return true;
}
function wodDrawHospital(ctx,h) {
    if(wodBoardMapActive()){WodBoardArt.structure(ctx,wodBoardMapActive(),'hospital',h.x,h.y,'#db739e',.6);return;}
    ctx.save();ctx.translate(h.x,h.y);ctx.scale(.5,.5);ctx.lineJoin='round';
    ctx.fillStyle='#071b2360';ctx.beginPath();ctx.ellipse(3,17,29,12,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#a8b0a3';ctx.strokeStyle='#48595a';ctx.lineWidth=1.1;ctx.beginPath();ctx.roundRect(-26,-9,52,31,4);ctx.fill();ctx.stroke();
    // Two wards flank a taller central entrance, with shaded wall faces.
    const ward=(x,y,w,hh)=>{ctx.fillStyle='#e2e1cc';ctx.fillRect(x,y,w,hh);ctx.fillStyle='#b4c0b8';ctx.fillRect(x+w-4,y,4,hh);ctx.fillStyle='#718a89';ctx.beginPath();ctx.moveTo(x-2,y);ctx.lineTo(x+2,y-5);ctx.lineTo(x+w+2,y-5);ctx.lineTo(x+w,y);ctx.closePath();ctx.fill();ctx.strokeStyle='#3e595e';ctx.stroke();ctx.fillStyle='#294d5c';for(let wx=x+3;wx<x+w-4;wx+=7){ctx.fillRect(wx,y+5,4,5);ctx.fillStyle='#a8d7cf';ctx.fillRect(wx,y+5,3,1);ctx.fillStyle='#294d5c';}};
    ward(-24,-4,17,20);ward(7,-4,17,20);ward(-10,-13,20,31);
    ctx.fillStyle='#4d6470';ctx.beginPath();ctx.roundRect(-13,-22,26,15,2);ctx.fill();ctx.strokeStyle='#344955';ctx.stroke();
    ctx.fillStyle='#f2e9dc';ctx.beginPath();ctx.roundRect(-7,-20,14,12,2);ctx.fill();ctx.fillStyle='#e775a7';ctx.fillRect(-1.8,-18,3.6,8);ctx.fillRect(-4,-15.8,8,3.6);
    ctx.fillStyle='#244454';ctx.fillRect(-4,7,8,11);ctx.fillStyle='#9ab8bb';ctx.fillRect(-3,8,2.5,6);ctx.fillRect(.5,8,2.5,6);
    ctx.fillStyle='#bec3b4';ctx.fillRect(-8,18,16,3);ctx.fillStyle='#e2dfcc';ctx.fillRect(-11,21,22,2);
    ctx.strokeStyle='#d5d8c7';ctx.beginPath();ctx.moveTo(27,12);ctx.lineTo(27,-17);ctx.stroke();ctx.fillStyle=factionColors[h.owner]||'#93aaa8';ctx.beginPath();ctx.moveTo(27,-17);ctx.lineTo(37,-14);ctx.lineTo(27,-10);ctx.fill();ctx.restore();
}
function wodDrawMedicalAndCommandAuras(ctx,structures=true,lite=false) {
    const radius=wodFortCombatAuraRadiusPx(),local=wodLocalPlayerOwner();
    const ring=(s,color,fill)=>{ctx.save();ctx.fillStyle=fill;ctx.strokeStyle=color;ctx.lineWidth=lite?2:2.7;ctx.setLineDash([11,8]);ctx.beginPath();ctx.arc(s.x,s.y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();};
    if(structures)for(const h of gameData.hospitals||[])if(wodOwnerCanSee(local,h)){wodEffectiveHospitalOwner(h);ring(h,'#f58abb','rgba(240,110,175,.1)');wodDrawHospital(ctx,h);}
    if(gameData.layers?.units!==false)for(const u of gameData.entities)if((u.isGeneral||u.cargo?.isGeneral&&u.cargo.hp>0)&&u.hp>0&&wodOwnerCanSee(local,u)){
        ring(u,'#b885f4','rgba(159,98,229,.1)');ctx.save();ctx.fillStyle='#ffdf73';ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.fillText('★',u.x,u.y-(u.radius||16)-10);ctx.restore();
    }
}
function beginBridgeBuild() {
    enterBuildPlacementMode('bridge');
}
function wodRecruitUnitSpec(type) {
    const hp=type==='heavy'||type==='ship'?300:['transport','supply'].includes(type)?50:100;
    const mp=type==='ship'?5000:['transport','supply'].includes(type)?500:1000;
    return {type,owner:-1,x:1e9,y:1e9,hp,maxHp:hp,manpower:mp,maxManpower:mp,morale:100,maxMorale:100,xp:0,
        damage:({heavy:18,ship:14,transport:4,supply:4})[type]||8,range:({heavy:60,ship:80})[type]||50,
        attackCooldown:({heavy:2.8,ship:2.4})[type]||2,radius:({heavy:16,ship:20,transport:16,supply:16})[type]||12,
        tanks:type==='heavy'?500:0,maxTanks:type==='heavy'?500:0,...(wodSpecialistStats(type)||{}),speed:wodUnitBaseSpeed({type})};
}
function wodInitRecruitInfoButtons(root) {
    const buttons=root?[...root.querySelectorAll('button[data-city-build]')]:
        (wodInitRecruitInfoButtons.buttons||=[...document.querySelectorAll('button[onclick^="buyUnit"],button[onclick^="begin"]')]);
    for(const button of buttons){
        const action=button.getAttribute('onclick')||'',type=/buyUnit\('([^']+)'\)/.exec(action)?.[1];
        const building=button.dataset.mode||({beginFactoryBuild:'factory',beginHarborBuild:'harbor',beginFarmBuild:'farm',beginFortBuild:'fort',beginHospitalBuild:'hospital',beginBridgeBuild:'bridge'})[/^(\w+)\(/.exec(action)?.[1]];
        const mode=type||building;if(!mode)continue;
        const label=(type?'Unit':'Building')+' information: '+wodProductionLabel(mode);
        const existing=button.closest('.unit-recruit-tile')?.querySelector('.unit-recruit-info');
        if(existing){if(existing.getAttribute('aria-label')!==label)existing.setAttribute('aria-label',label);continue;}
        const tile=document.createElement('div');tile.className='unit-recruit-tile';button.before(tile);tile.append(button);
        const info=document.createElement('button');info.type='button';info.className='unit-recruit-info';if(type)info.dataset.unitType=type;else info.dataset.buildingType=building;
        info.textContent='i';info.setAttribute('aria-label',label);info.setAttribute('aria-haspopup','dialog');info.setAttribute('aria-controls','wodRecruitInfo');
        info.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();if(type)wodOpenRecruitInfo(type);else wodOpenBuildingInfo(building);});tile.append(info);
    }
}
function wodProductionInfoDialog() {
    let dialog=document.getElementById('wodRecruitInfo');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='wodRecruitInfo';dialog.setAttribute('aria-labelledby','wodRecruitInfoTitle');document.body.append(dialog);dialog.addEventListener('keydown',e=>e.stopPropagation());dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});}
    return dialog;
}
function wodOpenBuildingInfo(mode) {
    const cash=flag=>getCityIncome({[flag]:true})-getCityIncome({}),mp=flag=>getCityManpowerIncome({[flag]:true})-getCityManpowerIncome({});
    const cards={
        factory:{price:WOD_PRICE_FACTORY,role:'An industrial upgrade for a town. Unlocks armor and motorized infantry, and improves its economy.',values:[['Money income',formatDollarRate(cash('hasFactory'))],['Manpower income',formatManpowerRate(mp('hasFactory'))]],notes:['Build once in an owned town. Armor and motorized infantry still need their own money, manpower and mobilization time.','The town can process one production order at a time. Hostile troops or combat in the town pause its queue.']},
        harbor:{price:WOD_PRICE_HARBOR,role:'A coastal town upgrade for recruiting a fleet and establishing sea trade.',values:[['Money income',formatDollarRate(cash('hasHarbor'))],['Unlocks','Warships, transports, supply ships']],notes:['Requires an owned coastal town with accessible water. New vessels launch into water.','Transports carry one land unit; supply ships support beachheads. A harbor does not supply ordinary troops swimming in water.']},
        farm:{price:WOD_PRICE_FARM,role:'A town upgrade that raises the flow of replacement manpower and supports a larger army.',values:[['Manpower income',formatManpowerRate(mp('hasFarm'))],['Limit','One per town']],notes:['Build in an owned town. Extra manpower funds recruits and replaces losses at safe towns and hospitals.','A farm does not heal troops or create another supply source.']},
        fort:{price:WOD_PRICE_FORT,role:'A defended position that protects nearby friendly troops and slows hostile movement.',values:[['Combat damage taken','80% of normal'],['Coverage','Fort radius']],notes:['Place on eligible owned land near troops and behind the front. Its blue ring shows coverage.','A fort does not replace a city for supply or provide medical care. It is destroyed with an explosion when captured.']},
        hospital:{price:WOD_PRICE_HOSPITAL,role:'A field medical site for restoring friendly units inside its pink ring.',values:[['HP / manpower recovery','3% of maximum per second'],['Coverage','Same radius as a fort']],notes:['Patients need supply and replacement manpower. Treatment stops for a patient while it fights or receives enemy fire.','Safe patients elsewhere in the radius can still heal. Infantry and marines cannot heal afloat; ships can repair in coverage.','Hospitals give no defense or supply bonus and are destroyed when captured. Keep them safely behind the front.']},
        bridge:{price:WOD_PRICE_BRIDGE_PER_CELL,cost:'$'+WOD_PRICE_BRIDGE_PER_CELL.toLocaleString()+' per water cell',role:'A land corridor across water, connecting routes and extending an existing city supply network.',values:[['Length','1 to '+WOD_BRIDGE_MAX_CELLS+' water cells'],['Crossing','Land movement and supply'],['Placement','At least one friendly bank']],notes:['Press on one bank and drag to the other, in any direction. The preview shows the cells crossed, the length and the price; release to build, Esc or right-click to cancel. Tapping one bank and then the other works too.','A bridge costs $'+WOD_PRICE_BRIDGE_PER_CELL.toLocaleString()+' for each water cell it crosses and spans at most '+WOD_BRIDGE_MAX_CELLS+' cells (fewer on a slant). At least one bank must be yours; the far bank can be hostile.','A construction ghost counts down before the bridge opens. An unfinished bridge cannot carry units.','The bridge never produces supply. Its land route must reach a city your side controls, and units still need friendly territory beyond it.']}
    },card=cards[mode];if(!card)return;
    const dialog=wodProductionInfoDialog(),values=[['Cost',card.cost||'$'+card.price.toLocaleString()],['Construction',WOD_PRODUCTION_SECONDS[mode]+' seconds'],...card.values];
    dialog.innerHTML='<header><h3 id="wodRecruitInfoTitle">'+wodEscapeEffectInner(wodProductionLabel(mode))+'</h3><button type="button" onclick="this.closest(\'dialog\').close()" aria-label="Close building information">×</button></header><p>'+card.role+'</p><div class="info-record-grid">'+values.map(([k,v])=>'<div class="info-record-item"><span>'+wodEscapeEffectInner(k)+'</span><strong>'+wodEscapeEffectInner(v)+'</strong></div>').join('')+'</div><h4>Using this building</h4>'+card.notes.map(note=>'<p>'+note+'</p>').join('');
    if(!dialog.open)dialog.showModal();
}
function wodOpenRecruitInfo(type) {
    if(!['light','motorized','mountaineer','marine','heavy','ship','transport','supply'].includes(type))return;
    const dialog=wodProductionInfoDialog();
    const unit=wodRecruitUnitSpec(type),cost=getUnitCost(type),role={light:'Flexible infantry for holding ground and towns.',motorized:'Stronger than infantry, faster on open ground; rough ground slows it.',mountaineer:'A light specialist that crosses mountains and excels on hills and mountains.',marine:'Amphibious infantry: no water attrition, but vulnerable afloat and unable to heal in water.',heavy:'Heavy armor for breakthroughs; vulnerable in rough terrain.',ship:'Warship with armor-like toughness. Repairs near friendly towns or hospitals.',transport:'Fragile landing craft carrying one land unit safely across water.',supply:'Fragile support ship supplying landed troops within twice a fort\'s radius (about six cells); cannot supply ordinary swimmers.'}[type];
    const rows=['grass','sand','forest','hill','mountain','swamp','urban','water'].map(type=>{const h={type},blocked=wodIsNavalUnit(unit)?!isWaterHex(h):type==='mountain'&&!wodCanClimb(unit),probe={...unit,inWater:isWaterHex(h)&&!wodIsNavalUnit(unit),amphibInWater:isWaterHex(h)&&unit.type==='marine'};return '<tr><th>'+terrainLabel(type)+'</th><td>'+(blocked?'Blocked':Math.round(getTerrainAttackModifier(probe,h)*100)+'%')+'</td><td>'+(blocked?'—':Math.round(getTerrainDefenseModifier(probe,h)*100)+'%')+'</td><td>'+(blocked?'—':(getUnitSpeedMultiplier(probe,h)*wodUnitBaseSpeed(probe)/WOD_UNIT_BASE_SPEED).toFixed(2)+'×')+'</td></tr>';}).join('');
    dialog.innerHTML='<header><h3 id="wodRecruitInfoTitle">'+wodEscapeEffectInner(wodProductionLabel(type))+'</h3><button type="button" onclick="this.closest(\'dialog\').close()" aria-label="Close unit information">×</button></header><p>'+role+'</p><p class="recruit-cost">$'+cost.money.toLocaleString()+' · '+formatPeople(cost.manpower)+' manpower · '+WOD_PRODUCTION_SECONDS[type]+'s mobilization</p><div class="info-record-grid">'+wodUnitCombatStatsMarkup(unit,true)+'</div><p>Speed is relative to infantry on open ground. Morale, terrain, combat, enemy forts and a general can change current speed. General command: +5% attack, firing rate, toughness, range and morale capacity/recovery; +10% speed.</p><div class="recruit-terrain"><table><thead><tr><th>Terrain</th><th>Attack</th><th>Damage taken</th><th>Speed</th></tr></thead><tbody>'+rows+'</tbody></table></div><p>HP and manpower recover only at a supplied, safe town or hospital. Morale can recover away from towns when out of combat.</p>';
    if(!dialog.open)dialog.showModal();
}
function buyUnit(type) {
    enterBuildPlacementMode(type);
}
function snapUnitApartFromNeighbors(unit) {
    let gap = 6;
    for(let iter = 0; iter < 14; iter++) {
        let moved = false;
        for(let u of gameData.entities) {
            if(u === unit || u.hp <= 0 || u.type === 'convoy') continue;
            let dx = unit.x - u.x;
            let dy = unit.y - u.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if(dist<.001){const a=iter*2.399963+(String(unit.uid||'').length%7);dx=Math.cos(a);dy=Math.sin(a);dist=1;}
            let minD = (unit.radius || 10) + (u.radius || 10) + gap;
            if(dist < minD) {
                let push = (minD - dist) * 0.72;
                // Spawn/watchdog spreading must obey the same shoreline,
                // mountain and bridge rules as ordinary separation. An
                // unchecked push here could knock a waiting passenger
                // into the sea and start a fatal water rescue.
                for(const angle of [0,.65,-.65,1.2,-1.2,Math.PI/2,-Math.PI/2]) {
                    const c=Math.cos(angle),s=Math.sin(angle),nx=unit.x+(dx*c-dy*s)/dist*push,ny=unit.y+(dx*s+dy*c)/dist*push;
                    if(!wodPassiveDisplacementAllowed(unit,nx,ny)||!wodSegmentClearsTerrainForUnit(unit,unit.x,unit.y,nx,ny))continue;
                    unit.x=nx;unit.y=ny;moved=true;break;
                }
            }
        }
        if(!moved) break;
    }
    ensureUnitPixelOnWalkableHex(unit, 24);
}
function wodNormalizeNavalStats(u) {
    if(u?.type==='ship'&&u.maxHp===200){u.hp=u.hp*1.5;u.maxHp=300;}
    if(u?.cargo)wodNormalizeNavalStats(u.cargo);
}
function wodSupplyShipLabel() {
    return ({modern:'Supply ship',napoleonic:'Stores ship',medieval:'Supply cog',ancient:'Supply barge'})[wodGetRenderPeriod()]||'Supply ship';
}
function wodSupplyShipForUnit(unit) {
    if(!unit||unit.hp<=0||unit.type==='convoy')return null;
    const tick=gameData._wodSimTick||0;let cache=gameData._supplyShipRoster;
    if(!cache||cache.entities!==gameData.entities||cache.n!==gameData.entities.length||cache.tick!==tick)
        cache=gameData._supplyShipRoster={entities:gameData.entities,n:gameData.entities.length,tick,ships:gameData.entities.filter(s=>s.type==='supply')};
    if(!cache.ships.length)return null;
    const hex=getNearestHexToPoint(unit.x,unit.y);
    if(wodUnitInUnsuppliedWater(unit,hex))return null;
    const radius=wodSupplyShipRadiusPx();
    return cache.ships.find(s=>s.hp>0&&wodIsFriendlyOwner(s.owner,unit.owner)&&Math.hypot(s.x-unit.x,s.y-unit.y)<=radius)||null;
}
function wodDrawSupplyMark(ctx,r) {
    ctx.save();ctx.strokeStyle='#243d49';ctx.fillStyle='#e9dba8';ctx.lineWidth=Math.max(1,r*.09);
    ctx.fillRect(-r*.5,-r*.26,r*.46,r*.52);ctx.strokeRect(-r*.5,-r*.26,r*.46,r*.52);ctx.fillRect(r*.04,-r*.26,r*.46,r*.52);ctx.strokeRect(r*.04,-r*.26,r*.46,r*.52);ctx.restore();
}
function wodDrawSupplyBadge(ctx,r) {
    ctx.save();ctx.translate(r*.6,r*.55);ctx.fillStyle='#326e88';ctx.strokeStyle='#d8e9ed';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,r*.42,0,Math.PI*2);ctx.fill();ctx.stroke();wodDrawSupplyMark(ctx,r*.55);ctx.restore();
}
function wodDrawSupplyVessel(ctx,u,r,color) {
    wodDrawTransport(ctx,u,r,color);
    const era=wodGetRenderPeriod();ctx.save();ctx.rotate(getUnitFacingAngle(u));ctx.scale(r/20,r/20);ctx.lineWidth=.9;ctx.strokeStyle='#443a2c';
    if(era==='ancient'){
        // Open grain barge with earthenware amphorae and a raised bow.
        for(const x of [-5,0,5]){ctx.fillStyle='#b97f4b';ctx.beginPath();ctx.ellipse(x,0,2,3,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#523d2d';ctx.fillRect(x-1,-3,2,1);}
        ctx.beginPath();ctx.moveTo(12,0);ctx.quadraticCurveTo(18,-1,18,-7);ctx.stroke();
    }else if(era==='medieval'){
        // Broad square sail and a raised cargo stern distinguish the cog.
        ctx.fillStyle='#c7ae70';ctx.fillRect(-5,-16,9,8);ctx.strokeRect(-5,-16,9,8);ctx.strokeStyle='#76613d';ctx.beginPath();ctx.moveTo(-1,-17);ctx.lineTo(-1,4);ctx.stroke();ctx.fillStyle='#886343';ctx.fillRect(-13,-5,5,10);
        ctx.fillStyle='#b5a071';for(const x of [2,6])ctx.fillRect(x,-2,3,5);
    }else if(era==='napoleonic'){
        // Twin-masted stores tender with pale canvas and barrel cargo.
        for(const x of [-5,5]){ctx.strokeStyle='#493c2c';ctx.beginPath();ctx.moveTo(x,4);ctx.lineTo(x,-19);ctx.stroke();ctx.fillStyle='#eee4c7';ctx.beginPath();ctx.moveTo(x+1,-18);ctx.lineTo(x+7,-8);ctx.lineTo(x+1,-7);ctx.closePath();ctx.fill();ctx.stroke();}
        ctx.fillStyle='#88613f';for(const x of [-3,2,7]){ctx.beginPath();ctx.ellipse(x,1,1.5,2,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
    }else{
        // Steel cargo deck, containers and an aft loading crane.
        ctx.fillStyle='#89a9b6';ctx.fillRect(-4,-4,13,8);ctx.strokeStyle='#1e4654';for(const x of [-3,2,7]){ctx.fillStyle=x===2?'#b79c6e':'#5b8b97';ctx.fillRect(x,-3,4,6);ctx.strokeRect(x,-3,4,6);}
        ctx.strokeStyle='#c8d2cc';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-9,3);ctx.lineTo(-9,-10);ctx.lineTo(-2,-10);ctx.lineTo(-2,-5);ctx.stroke();
    }ctx.restore();
}
function wodTransportLabel() {
    return ({modern:'Landing craft',napoleonic:'Troop transport',medieval:'Transport galley',ancient:'Troop barge'})[wodGetRenderPeriod()]||'Transport';
}
function wodDrawTransport(ctx,u,r,color) {
    ctx.save();ctx.scale(r/12,r/12);ctx.rotate(getUnitFacingAngle(u));
    const era=wodGetRenderPeriod(),old=era!=='modern';
    ctx.fillStyle='rgba(9,21,27,.3)';ctx.beginPath();ctx.ellipse(1,3,18,9,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=old?'#654c32':'#586a6a';ctx.strokeStyle='#172c36';ctx.lineWidth=1.2;
    ctx.beginPath();ctx.moveTo(17,-6);ctx.lineTo(17,6);ctx.lineTo(-12,8);ctx.quadraticCurveTo(-19,0,-12,-8);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle=old?'#b19a6d':'#9caaa0';ctx.fillRect(-10,-5,23,10);
    ctx.strokeStyle=old?'#725a39':'#65766e';ctx.lineWidth=.7;
    for(let x=-8;x<=12;x+=3){ctx.beginPath();ctx.moveTo(x,-5);ctx.lineTo(x,5);ctx.stroke();}
    if(old){for(const y of [-10,10])for(let x=-8;x<=8;x+=5){ctx.beginPath();ctx.moveTo(x,y*.7);ctx.lineTo(x+2,y);ctx.stroke();}}
    else {ctx.fillStyle='#ccd2bf';ctx.fillRect(-12,-4,5,8);ctx.fillStyle='#354c57';ctx.fillRect(-10,-2,2,4);ctx.strokeStyle='#c4ccc0';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(16,-6);ctx.lineTo(16,6);ctx.stroke();}
    if(era==='napoleonic'||era==='medieval'){ctx.strokeStyle='#493e2b';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(-3,-13);ctx.lineTo(-3,5);ctx.stroke();ctx.fillStyle='#ddd1ae';ctx.beginPath();ctx.moveTo(-2,-12);ctx.lineTo(5,-3);ctx.lineTo(-2,1);ctx.fill();}
    ctx.fillStyle=color;ctx.fillRect(-13,-7,8,2);
    if(u.cargo){ctx.fillStyle='#d5c89e';if(u.cargo.type==='heavy'){ctx.fillRect(-3,-3,10,6);ctx.fillStyle='#647052';ctx.fillRect(0,-2,5,4);}else for(let x=-1;x<=6;x+=5)for(const y of [-2,2]){ctx.beginPath();ctx.arc(x,y,1.4,0,Math.PI*2);ctx.fill();}}
    ctx.restore();
}
function wodClearTransportMove(u) {
    if(!u._trafficMoving)u._trafficYield=null;
    u.target=null;u.path=null;u.orderTarget=null;u.fullMarchWaypoints=null;u.marchWpCursor=0;u.holding=false;u._wodOrderIntoWater=false;
}
function wodNavalDestinationClear(unit,point) {
    return !isWorldPositionBlockedByUnits(unit,point.x,point.y)&&!gameData.entities.some(u=>u!==unit&&u.hp>0&&wodIsNavalUnit(u)&&
        wodIsFriendlyOwner(u.owner,unit.owner)&&u.target&&u.orderTarget&&Math.hypot(u.orderTarget.x-point.x,u.orderTarget.y-point.y)<(u.radius||12)+(unit.radius||12)+2);
}
function wodTransportLandingRegion(unit,goal) {
    const root=goal&&getNearestHexToPoint(goal.x,goal.y);if(!root||wodIsOpenWaterHex(root)||root.type==='mountain'&&!wodCanClimb(unit))return null;
    // Physical connectivity is independent of ownership. Reuse the same component
    // for every town/coast on an island, invalidating on terrain/bridge edits.
    const revision=(gameData.landGeometryRevision||0)+'|'+(gameData._wodPfVer||0),type=unit.type||'light';
    let cache=gameData._transportLandComponents;
    if(!cache||cache.hexes!==gameData.hexes||cache.revision!==revision)cache=gameData._transportLandComponents={hexes:gameData.hexes,revision,types:new Map()};
    let components=cache.types.get(type);if(!components)cache.types.set(type,components=new Map());
    const rootKey=getHexKey(root);if(components.has(rootKey))return components.get(rootKey);
    const keys=new Set([rootKey]),queue=[root];
    for(let i=0;i<queue.length;i++)for(const d of hexDirections){const h=queue[i],n=wodHexAt(h.q+d.q,h.r+d.r);if(!n||wodIsOpenWaterHex(n)||n.type==='mountain'&&!wodCanClimb(unit)||keys.has(getHexKey(n))||!wodCanStepBetweenHexes(unit,h,n,true))continue;keys.add(getHexKey(n));queue.push(n);}
    for(const key of keys)components.set(key,keys);return keys;
}
function wodTransportShorePairs(unit,transport,goal,landing=false,nearGoal=false) {
    const rows=[],sp=gameData.hexRadius*1.35;
    const reachable=landing?wodTransportLandingRegion(unit,goal):null;
    const seaRegion=wodNavalWaterRegionKeys(transport,getNearestHexToPoint(transport.x,transport.y));
    for(const h of gameData.hexList) {
        if(isWaterHex(h)||h.type==='mountain'&&!wodCanClimb(unit))continue;
        if(reachable&&!reachable.has(getHexKey(h)))continue;
        const gd=(h.x-goal.x)**2+(h.y-goal.y)**2;
        for(const d of cardinalHexDirections) {
            const w=wodHexAt(h.q+d.q,h.r+d.r);if(!w||!wodIsOpenWaterHex(w)||seaRegion&&!seaRegion.has(getHexKey(w)))continue;
            const sea=(w.x-transport.x)**2+(w.y-transport.y)**2;
            // A player coast click chooses that beach, not the beach closest
            // to the boat. AI balances actual sailing/walking distances.
            const score=landing?(wodMpIsHumanOwner(transport.owner)||nearGoal?gd+sea*.00001:Math.sqrt(gd)*1.5+Math.sqrt(sea)):gd+sea*.06;
            rows.push({land:h,water:w,score});
        }
    }
    rows.sort((a,b)=>a.score-b.score);return rows.filter(p=>(transport._ferryBlockedShores?.[getHexKey(p.land)]||0)<=(transport._ferryElapsed||0)).slice(0,transport._ferryRepairing?160:40);
}
function wodOrderBoardTransport(unit,transport) {
    if(!unit||!transport||unit.hp<=0||transport.hp<=0||unit.owner!==transport.owner||wodIsNavalUnit(unit)||unit.type==='convoy'||transport.type!=='transport'||transport.cargo||transport.pickupUid&&transport.pickupUid!==unit.uid)return false;
    const aiBoarding=!wodMpIsHumanOwner(unit.owner),boardingNow=wodAiOperationTime();
    if(aiBoarding&&unit._aiBoardingRetryAfter>boardingNow)return false;
    const from=getNearestHexToPoint(unit.x,unit.y),water=getNearestHexToPoint(transport.x,transport.y);
    if(from&&isWaterHex(from)&&water&&isWaterHex(water)) {
        const route=wodWaterBfsPath(transport,water,from,22000);if(!route.length||!wodHexKeysEqual(route[route.length-1],from))return false;
        ensureUnitId(unit);ensureUnitId(transport);unit.boardTransportUid=transport.uid;unit._wodBoardingNoWater=false;transport.pickupUid=unit.uid;transport.pickupLandKey=null;wodClearTransportMove(unit);
        assignUnitMoveAlongWaypoints(transport,[{x:unit.x,y:unit.y}],{transportInternal:true});return true;
    }
    let pair=null,path=null,seaPath=null;
    for(const p of wodTransportShorePairs(unit,transport,unit).slice(0,transport._ferryRepairing?80:16)) {
        if(aiBoarding&&unit._aiEmbarkAvoid?.[getHexKey(p.land)]>boardingNow)continue;
        if(!wodNavalDestinationClear(transport,p.water))continue;
        const dry=wodLandBfsPath(unit,from,p.land,16000,true);
        if(!dry.length||!wodHexKeysEqual(dry[dry.length-1],p.land))continue;
        const sea=wodWaterBfsPath(transport,water,p.water,18000);
        if(!sea.length||!wodHexKeysEqual(sea[sea.length-1],p.water))continue;
        pair=p;path=dry;seaPath=sea;break;
    }
    if(!pair)return false;
    ensureUnitId(unit);ensureUnitId(transport);unit.boardTransportUid=transport.uid;unit._wodBoardingNoWater=true;transport.pickupUid=unit.uid;transport.pickupLandKey=getHexKey(pair.land);
    wodClearTransportMove(unit);unit.path=wodHexPathToWorldWaypoints(unit,path,pair.land).map(p=>({...p,pathPrepared:true}));unit.orderTarget={x:pair.land.x,y:pair.land.y};unit.fullMarchWaypoints=[{x:pair.land.x,y:pair.land.y}];unit.marchWpCursor=0;
    if(unit.path.length)wodTakeNextPathTarget(unit);else unit.target={x:pair.land.x,y:pair.land.y,pathPrepared:true};
    assignUnitMoveAlongWaypoints(transport,[{x:pair.water.x,y:pair.water.y}],{transportInternal:true,preparedPath:seaPath});
    _infoCardUiThrottle.s=null;return true;
}
function wodOrderUnloadTransport(transport,goal) {
    if(!transport?.cargo||transport.hp<=0)return false;
    const start=getNearestHexToPoint(transport.x,transport.y);
    const region=transport._aiFerryMission?wodTransportLandingRegion(transport.cargo,goal):null;
    const beachhead=region&&gameData.entities.some(u=>u.owner===transport.owner&&u._navalLanded&&region.has(getHexKey(getNearestHexToPoint(u.x,u.y))));
    const pairs=wodTransportShorePairs(transport.cargo,transport,goal||transport,true,!!beachhead);
    if(beachhead){const covered=p=>gameData.entities.some(s=>s.owner===transport.owner&&s.type==='supply'&&s.hp>0&&!s.retreating&&Math.hypot(s.x-p.land.x,s.y-p.land.y)<wodSupplyShipRadiusPx()*.93);
        pairs.sort((a,b)=>Number(!covered(a))-Number(!covered(b))||a.score-b.score);}
    for(const p of pairs) {
        if(!wodNavalDestinationClear(transport,p.water))continue;
        if(transport.cargo._navalEvacuating&&!wodCurrentSupplyComponent(p.land,transport.owner).city)continue;
        if(gameData.entities.some(u=>u!==transport&&u.hp>0&&Math.hypot(u.x-p.land.x,u.y-p.land.y)<(u.radius||12)+(transport.cargo.radius||12)+5))continue;
        if(gameData.entities.some(t=>t!==transport&&t.type==='transport'&&t.hp>0&&t.cargo&&t.unloadHexKey&&Math.hypot((gameData.hexes[t.unloadHexKey]?.x??Infinity)-p.land.x,(gameData.hexes[t.unloadHexKey]?.y??Infinity)-p.land.y)<(t.cargo.radius||12)+(transport.cargo.radius||12)+8))continue;
        const path=wodWaterBfsPath(transport,start,p.water,22000);
        if(!path.length||!wodHexKeysEqual(path[path.length-1],p.water))continue;
        if(!assignUnitMoveAlongWaypoints(transport,[{x:p.water.x,y:p.water.y}],{transportInternal:true,preparedPath:path}))continue;
        transport.unloadHexKey=getHexKey(p.land);transport.unloadGoal=goal?{x:goal.x,y:goal.y}:null;
        return true;
    }return false;
}
function wodTryUnloadTransport(t) {
    const cargo=t.cargo,land=gameData.hexes[t.unloadHexKey];if(!cargo||!land)return false;
    if(t._aiFerryMission&&cargo.type!=='marine'&&!wodCurrentSupplyComponent(land,t.owner).city&&
        !gameData.entities.some(s=>s.owner===t.owner&&s.type==='supply'&&s.hp>0&&!s.retreating&&Math.hypot(s.x-land.x,s.y-land.y)<wodSupplyShipRadiusPx()*.93))return false;
    const sp=gameData.hexRadius*1.35,sea=getNearestHexToPoint(t.x,t.y);
    for(const h of [land,...getNeighborHexes(land)]) {
        if(!sea||!cardinalHexDirections.some(d=>h.q===sea.q+d.q&&h.r===sea.r+d.r))continue;
        if(isWaterHex(h)||h.type==='mountain'&&!wodCanClimb(cargo)||Math.hypot(h.x-t.x,h.y-t.y)>sp*1.85)continue;
        const ang=Math.atan2(h.y-t.y,h.x-t.x);
        for(const offset of [sp*.27,0,-sp*.2]) {
            const x=h.x+Math.cos(ang)*offset,y=h.y+Math.sin(ang)*offset;
            if(getNearestHexToPoint(x,y)!==h||!gameData.entities.every(e=>e===cargo||e.hp<=0||e.type==='convoy'||Math.hypot(e.x-x,e.y-y)>=(cargo.radius||12)+(e.radius||12)+2))continue;
            const goal=t.unloadGoal;if(goal&&!wodMpIsHumanOwner(cargo.owner)){cargo._navalAssaultGoal={...goal};cargo._navalAssaultUntil=wodAiOperationTime()+60000;cargo._navalLanded=true;}cargo._navalEvacuating=false;t.cargo=null;t.unloadHexKey=null;t.unloadGoal=null;t.ferryGoal=null;wodClearTransportMove(cargo);cargo.boardTransportUid=null;cargo._wodBoardingNoWater=false;cargo._needsTransport=false;cargo.waterExposureSeconds=0;cargo.outOfSupplySeconds=0;cargo.supplyPendingSeconds=0;cargo.waterFlash=0;cargo.encircledFlash=0;cargo.healingFlash=0;cargo.x=cargo._drawX=x;cargo.y=cargo._drawY=y;cargo.selected=false;
            gameData.entities.push(cargo);gameData._unitSpriteCache?.clear();wodClearTransportMove(t);
            if(!wodMpIsHumanOwner(t.owner))wodAiRecord(t.owner,'ferry-unloaded',{unit:t.uid,cargo:cargo.uid,target:getHexKey(h),supplied:!!wodCurrentSupplyComponent(h,t.owner).city});
            if(!wodMpIsHumanOwner(t.owner)&&t._ferryHome)assignUnitMoveAlongWaypoints(t,[{...t._ferryHome}],{transportInternal:true});
            // Human orders continue inland. AI beachheads wait for the
            // support plan before advancing beyond the landing zone.
            if(goal&&wodMpIsHumanOwner(cargo.owner))assignUnitMoveAlongWaypoints(cargo,[goal]);claimTerritoryAroundUnit(cargo);_infoCardUiThrottle.s=null;return true;
        }
    }return false;
}
function wodUpdateTransports(dt) {
    if(gameData.mp?.enabled&&!gameData.mp.isHost)return;
    const transports=gameData.entities.filter(t=>t.type==='transport');
    for(const t of transports) {
        if(t.hp<=0){if(t.pickupUid){const waiting=gameData.entities.find(u=>u.uid===t.pickupUid);if(waiting){waiting.boardTransportUid=null;waiting._wodBoardingNoWater=false;wodClearTransportMove(waiting);}t.pickupUid=null;}if(t.cargo){t.cargo.x=t.x;t.cargo.y=t.y;applyDamage(t.cargo,t.cargo.maxHp*2,t.lastAttackerOwner||0);t.cargo=null;}continue;}
        if(t.pickupUid) {
            const u=gameData.entities.find(u=>u.uid===t.pickupUid);
            if(!u||u.hp<=0||u.owner!==t.owner||u.boardTransportUid!==t.uid){t.pickupUid=null;t.pickupLandKey=null;t._ferryProgress=null;wodClearTransportMove(t);continue;}
            const land=gameData.hexes[t.pickupLandKey],uh=getNearestHexToPoint(u.x,u.y),th=getNearestHexToPoint(t.x,t.y);
            if(uh&&((land&&!isWaterHex(uh))||(isWaterHex(uh)&&wodOpenWaterChordClear(t,u.x,u.y,t.x,t.y)))&&th&&isWaterHex(th)&&Math.hypot(u.x-t.x,u.y-t.y)<=gameData.hexRadius*1.35*1.8) {
                t._ferryHome={x:t.x,y:t.y};t.cargo=u;t.pickupUid=null;u.boardTransportUid=null;u._wodBoardingNoWater=false;u.selected=false;wodClearTransportMove(u);wodClearTransportMove(t);
                if(!wodMpIsHumanOwner(t.owner))wodAiRecord(t.owner,'ferry-boarded',{unit:t.uid,cargo:u.uid,kind:u._medicalEvacuating?'medical':u._navalEvacuating?'evacuation':'invasion'});
                gameData.entities=gameData.entities.filter(e=>e!==u);gameData.selection=gameData.selection.filter(e=>e!==u);gameData._unitSpriteCache?.clear();_infoCardUiThrottle.s=null;
                if(t.ferryGoal&&wodAiFerryCanSail(t))wodOrderUnloadTransport(t,t.ferryGoal);
            }
        }
        if(t.cargo){
            if(!t.unloadHexKey&&t.ferryGoal&&wodAiFerryCanSail(t))wodOrderUnloadTransport(t,t.ferryGoal);
            t.cargo.x=t.x;t.cargo.y=t.y;t.cargo.waterExposureSeconds=0;t.cargo.outOfSupplySeconds=0;t.cargo.supplyPendingSeconds=0;t.cargo.healingFlash=0;
            if(t.unloadHexKey){const land=gameData.hexes[t.unloadHexKey],close=land&&Math.hypot(t.x-land.x,t.y-land.y)<gameData.hexRadius*3;
                if(!wodTryUnloadTransport(t)&&(close||!t.target)){t._unloadWait=(t._unloadWait||0)+dt;if(t._unloadWait>=3){t._unloadWait=0;wodOrderUnloadTransport(t,t.unloadGoal||land);}}else t._unloadWait=0;
            }
        }
        wodRepairFerryProgress(t,dt);
    }
    if(transports.length)gameData.unitSpatialGrid=buildUnitSpatialGrid();
    wodAiStepFerries(transports,dt); // the AI's crossings and boarding (js/ai/navy.js)
}
function wodSendTransportCommand(kind,unit,transport,goal) {
    if(gameData.mp?.enabled&&!gameData.mp.isHost)return wodMpSendCmd({kind,uid:unit?.uid,transportUid:transport?.uid,x:goal?.x,y:goal?.y});
    return kind==='boardTransport'?wodOrderBoardTransport(unit,transport):wodOrderUnloadTransport(transport,goal);
}
function wodTransportBoardSelected() {
    const units=getMovableSelectedUnits().filter(u=>!wodIsNavalUnit(u));let n=0;
    const boats=gameData.entities.filter(t=>t.owner===wodLocalPlayerOwner()&&t.type==='transport'&&t.hp>0&&!t.cargo&&!t.pickupUid);
    for(const u of units){boats.sort((a,b)=>wodAiDist2(a.x,a.y,u.x,u.y)-wodAiDist2(b.x,b.y,u.x,u.y));const t=boats.shift();if(t&&wodSendTransportCommand('boardTransport',u,t))n++;}
    showNotification(n?'Boarding transports':'No empty transport with a reachable shore');
}
function wodTransportUnloadSelected() {
    let n=0;for(const t of getMovableSelectedUnits())if(t.type==='transport'&&t.cargo&&wodSendTransportCommand('unloadTransport',null,t))n++;
    showNotification(n?'Unloading at the nearest clear shore':'No accessible landing site');
}
function wodSyncTransportControls() {
    const card=document.getElementById('infoCard');if(!card)return;
    let row=document.getElementById('wodTransportControls');
    if(!row){row=document.createElement('div');row.id='wodTransportControls';row.setAttribute('aria-label','Transport orders');row.innerHTML='<span data-transport-state></span><button type="button" class="info-order-btn" data-board-transport title="Board one land unit per transport"><span class="info-order-ico" aria-hidden="true"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M1 10h14l-2 4H4zm6-9h2v5h3L8 10 4 6h3z"/></svg></span>Board</button><button type="button" class="info-order-btn" data-unload-transport title="Unload at a clear shore"><span class="info-order-ico" aria-hidden="true"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M1 10h14l-2 4H4zM7 9V4H4l4-4 4 4H9v5z"/></svg></span>Unload</button>';(card.querySelector('#infoCardPage0')||card).appendChild(row);row.querySelector('[data-board-transport]').onclick=wodTransportBoardSelected;row.querySelector('[data-unload-transport]').onclick=wodTransportUnloadSelected;}
    const orders=card.querySelector('.info-mobile-orders-row');if(orders&&row.parentNode!==orders)orders.appendChild(row);
    const units=gameData.selection.filter(u=>u.owner===wodLocalPlayerOwner()&&u.hp>0&&!u.id),ship=units.length===1&&units[0].type==='transport'?units[0]:null;
    const land=units.some(u=>!wodIsNavalUnit(u)&&u.type!=='convoy'),boats=gameData.entities.filter(t=>t.owner===wodLocalPlayerOwner()&&t.type==='transport'&&t.hp>0);
    const board=row.querySelector('[data-board-transport]');board.hidden=!land||!boats.length;board.disabled=!boats.some(t=>!t.cargo&&!t.pickupUid);
    row.style.display=units.length&&(ship||land&&boats.length||units.some(u=>u.type==='transport'&&u.cargo))?'contents':'none';row.querySelector('[data-unload-transport]').hidden=!units.some(u=>u.type==='transport'&&u.cargo);
    row.querySelector('[data-transport-state]').textContent=ship?(ship.cargo?'1 / 1 · '+((ship.cargo.isGeneral?'General · ':'')+(ship.cargo.name||ship.cargo.type)):ship.pickupUid?'Boarding · 0 / 1':'Empty · 0 / 1'):'';
    if(!ship&&!units.some(u=>!wodIsNavalUnit(u)))row.style.display='none';
    card.classList.toggle('wod-has-transport-controls',row.style.display!=='none');
    const count=row.style.display==='none'?0:[...row.querySelectorAll('button')].filter(b=>!b.hidden).length;
    if(orders)orders.style.gridTemplateColumns=count?'repeat('+(5+count)+',minmax(0,1fr))':'';
    wodPositionCommandHud();
}
function createUnitAt(type, x, y, owner, opts) {
    opts = opts || {};
    let unit = {
        type: type, owner: owner,
        name: wodAllocateUnitName(type, owner, false),
        x: x, y: y, target: null, hp: 100, maxHp: 100, manpower: 1000, maxManpower: 1000, tanks: 0, maxTanks: 0, selected: false,
        shake: 0, activeCombatVisual: 0
    };

    if(WOD_SPECIALIST_UNITS[type]) {
        Object.assign(unit,wodSpecialistStats(type));
    } else if(type === 'transport'||type === 'supply') {
        unit.hp=unit.maxHp=50;unit.manpower=unit.maxManpower=500;unit.speed=WOD_UNIT_BASE_SPEED;unit.damage=4;unit.range=50;unit.attackCooldown=2;unit.radius=16;
    } else if(type === 'light') {
        unit.speed = WOD_UNIT_BASE_SPEED; unit.damage = 8; unit.range = 50; unit.attackCooldown = 2.0; unit.radius = 12;
    } else if(type === 'marine') {
        unit.speed = WOD_UNIT_BASE_SPEED; unit.damage = 8; unit.range = 50; unit.attackCooldown = 2.0; unit.radius = 12;
    } else if(type === 'heavy') {
        unit.hp = 300; unit.maxHp = 300; unit.speed = WOD_UNIT_BASE_SPEED; unit.damage = 18; unit.range = 60; unit.attackCooldown = 2.8; unit.radius = 16;
        unit.manpower = 1000; unit.maxManpower = 1000; unit.tanks = 500; unit.maxTanks = 500;
    } else if(['ship','transport','supply'].includes(type)) {
        unit.hp = 300; unit.maxHp = 300; unit.speed = WOD_UNIT_BASE_SPEED; unit.damage = 14; unit.range = 80; unit.attackCooldown = 2.4; unit.radius = 20;
        unit.manpower = 5000; unit.maxManpower = 5000;
    }
    unit.morale = WOD_MORALE_MAX;
    unit.maxMorale = WOD_MORALE_MAX;
    unit.moraleBroken = false;
    unit.xp = 0;
    unit.kills = 0;
    unit.losses = 0;
    unit.tankKills = 0;
    unit.tankLosses = 0;
    unit.veteran = false;
    ensureUnitId(unit);
    if(type !== 'convoy' && !opts.startSpawn) unit.spawnFx = WOD_UNIT_SPAWN_FX_DUR;
    if(!['ship','transport','supply'].includes(type)) {
        let safeHex = opts.startSpawn
            ? getNearestArmyStartSpawnHex(unit, x, y, 12)
            : getNearestWalkableHexForUnit(unit, unit.x, unit.y, 10);
        if(safeHex) {
            let j = opts.startSpawn ? wodSpawnJitterRange() * 0.32 : wodSpawnJitterRange();
            unit.x = safeHex.x + (Math.random() * j * 2 - j);
            unit.y = safeHex.y + (Math.random() * j * 2 - j);
        }
    }
    if(!gameData._unitNameOrderSeq) gameData._unitNameOrderSeq = 1;
    unit._nameOrder = gameData._unitNameOrderSeq++;
    gameData.entities.push(unit);
    if(!opts.keepName) wodRenumberOwnerUnits(unit.owner);
    if(!['ship','transport','supply'].includes(type)) {
        if(opts.startSpawn) ensureStartUnitOnLandHex(unit, getNearestArmyStartSpawnHex(unit, unit.x, unit.y, 8));
        snapUnitApartFromNeighbors(unit);
        if(opts.startSpawn) ensureStartUnitOnLandHex(unit, null);
        else ensureUnitPixelOnWalkableHex(unit, 14);
    }
    if(wodIsNavalUnit(unit))snapUnitApartFromNeighbors(unit);
    if(!opts.startSpawn) {
        const field={light:'unitsBuiltLight',motorized:'unitsBuiltMotorized',mountaineer:'unitsBuiltMountaineer',marine:'unitsBuiltMarine',heavy:'unitsBuiltHeavy',ship:'unitsBuiltShip',transport:'unitsBuiltTransport',supply:'unitsBuiltSupply'}[type];
        if(field)wodRecordOwnerLifetime(owner,field,1);
    }
    return unit;
}
function spawnUnit(type, city, owner) {
    if(isCityEncircledForProduction(city)) {
        if(owner === 1) showNotification('This town is encircled — cannot produce combat units until a corridor reopens.');
        return;
    }
    if(isCitySiegeBlockedForProduction(city)) {
        if(owner === 1) showNotification('Urban combat at this town — cannot produce combat units until the plaza is clear.');
        return;
    }
    let spawnHex = findSpawnHex(type, city, owner);
    if(!spawnHex) {
        if(owner === 1) showNotification(['ship','transport','supply'].includes(type) ? "No water nearby!" : "No clear spawn area near this city!");
        return;
    }

    let sj = wodSpawnJitterRange();
    let sx = spawnHex.x + (Math.random() * sj * 2 - sj);
    let sy = spawnHex.y + (Math.random() * sj * 2 - sj);

    if(['ship','transport','supply'].includes(type)) {
        sx = spawnHex.x;
        sy = spawnHex.y;
    }

    return createUnitAt(type, sx, sy, owner);
}
