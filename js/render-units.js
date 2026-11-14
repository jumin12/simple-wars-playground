// Unit counters, skins, town markers and structure art.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

function wodDrawStructureWindows(ctx, bx, by, bw, bh) {
    ctx.fillStyle = 'rgba(18, 22, 28, 0.62)';
    for(let wx = bx + 2.5; wx < bx + bw - 2; wx += 5) {
        for(let wy = by + 3; wy < by + bh - 2.5; wy += 6.5) {
            ctx.fillRect(wx, wy, 2.2, 3);
        }
    }
}
function drawPeriodCityMarker(ctx, city, period) {
    if(city.owner === 0) return;
    let ownerColor = factionColors[city.owner];
    let us = wodUrbanPeriodStyle(period);
    let pal = wodPeriodStructurePalette(period);
    ctx.save();
    ctx.translate(city.x, city.y);
    ctx.strokeStyle = us.stroke;
    ctx.lineWidth = 2.2;
    let skin = (!period || period === 'modern') && city.owner === 1 ? gameData.citySkin : 'classic';
    let blocks = skin === 'fort'
        ? [[-22,-12,13,28],[-7,-20,14,36],[10,-10,12,26],[-24,-23,8,10],[16,-22,8,10]]
        : skin === 'ring'
            ? [[-20,-8,10,18],[-8,-18,16,10],[10,-8,10,18],[-8,10,16,10],[-5,-5,10,10]]
            : [[-20,-12,10,26],[-7,-18,14,32],[10,-10,11,24],[-18,16,34,8]];
    for(let i = 0; i < blocks.length; i++) {
        let b = blocks[i];
        ctx.fillStyle = i % 2 === 0 ? pal.wall : pal.wallHi;
        ctx.fillRect(b[0], b[1], b[2], b[3]);
        ctx.strokeRect(b[0], b[1], b[2], b[3]);
        wodDrawStructureWindows(ctx, b[0], b[1], b[2], b[3]);
        if(period === 'medieval' && i === 0) {
            let bw = b[2] / 5;
            ctx.fillStyle = pal.wallHi;
            for(let t = 0; t < 5; t++) {
                if(t % 2 === 0) ctx.fillRect(b[0] + t * bw, b[1] - 3.5, bw + 0.5, 4);
            }
        }
        if(period === 'ancient' && i < 3) {
            ctx.fillStyle = pal.accent;
            ctx.globalAlpha = 0.45;
            ctx.fillRect(b[0] + b[2] * 0.32, b[1] + 2, 2.5, b[3] - 4);
            ctx.globalAlpha = 1;
        }
        if(period === 'napoleonic' && i === 1) {
            ctx.fillStyle = pal.roof;
            ctx.fillRect(b[0] - 1, b[1] - 4, b[2] + 2, 4);
            ctx.strokeRect(b[0] - 1, b[1] - 4, b[2] + 2, 4);
        }
    }
    ctx.fillStyle = ownerColor;
    ctx.strokeStyle = us.stroke;
    if(period === 'ancient') {
        ctx.beginPath();
        ctx.moveTo(12, -26);
        ctx.lineTo(22, -18);
        ctx.lineTo(20, -8);
        ctx.lineTo(14, -8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    } else if(period === 'medieval') {
        ctx.fillRect(12, -30, 18, 12);
        ctx.strokeRect(12, -30, 18, 12);
        ctx.beginPath();
        ctx.moveTo(12, -30);
        ctx.lineTo(12, -6);
        ctx.stroke();
        let mw = 18 / 4;
        ctx.fillStyle = pal.wallHi;
        for(let t = 0; t < 4; t++) {
            if(t % 2 === 0) ctx.fillRect(12 + t * mw, -33, mw + 0.5, 3.5);
        }
    } else {
        ctx.fillRect(14, -28, 16, 10);
        ctx.strokeRect(14, -28, 16, 10);
        ctx.beginPath();
        ctx.moveTo(14, -28);
        ctx.lineTo(14, -7);
        ctx.stroke();
    }
    ctx.restore();
}
function drawCitySkinMarker(ctx, city) {
    if(wodBoardMapActive()){WodBoardArt.structure(ctx,wodBoardMapActive(),'city',city.x,city.y,factionColors[city.owner]||'#999',1,wodGetRenderPeriod());return;}
    if(wodHdMapActive()) {
        ctx.save();ctx.translate(city.x,city.y);
        ctx.fillStyle='rgba(20,27,23,.35)';ctx.fillRect(-16,-9,34,22);
        ctx.fillStyle='#c4bba2';ctx.fillRect(-18,-11,32,19);
        ctx.fillStyle='#767e6d';ctx.fillRect(-16,-9,28,15);
        ctx.strokeStyle='#a7ac94';ctx.lineWidth=1;for(let x=-12;x<=8;x+=5){ctx.beginPath();ctx.moveTo(x,-9);ctx.lineTo(x,6);ctx.stroke();}
        ctx.fillStyle='#d2ccb6';ctx.fillRect(-9,-5,14,7);ctx.fillStyle='#444e43';ctx.fillRect(-7,-3,10,3);
        ctx.strokeStyle='#ddd4ba';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(18,4);ctx.lineTo(18,-18);ctx.stroke();ctx.fillStyle=factionColors[city.owner]||'#b8b8a0';ctx.fillRect(18,-18,10,6);
        ctx.restore();return;
    }
    drawPeriodCityMarker(ctx, city, wodGetRenderPeriod());
}
function drawPeriodFactoryIcon(ctx, x, y, period, lite) {
    if(wodBoardMapActive()){WodBoardArt.structure(ctx,wodBoardMapActive(),'factory',x,y,WodBoardArt.palette(wodBoardMapActive()).ink,lite?.8:1,period);return;}
    let s = lite ? 0.82 : 1;
    let pal = wodPeriodStructurePalette(period);
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = pal.stroke;
    ctx.lineWidth = Math.max(1, 1.2 * s);
    ctx.lineJoin = 'round';
    let bw = 14 * s, bh = 10 * s, bx = -7 * s, by = -5 * s;
    ctx.fillStyle = pal.wallHi;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);
    wodDrawStructureWindows(ctx, bx, by, bw, bh);
    if(period === 'napoleonic') {
        ctx.fillStyle = pal.wall;
        ctx.fillRect(-3.5 * s, -12 * s, 3 * s, 8 * s);
        ctx.strokeRect(-3.5 * s, -12 * s, 3 * s, 8 * s);
        ctx.fillRect(1.5 * s, -11 * s, 3 * s, 7 * s);
        ctx.strokeRect(1.5 * s, -11 * s, 3 * s, 7 * s);
        ctx.fillStyle = 'rgba(40, 32, 24, 0.35)';
        ctx.fillRect(-2.5 * s, -13.5 * s, 2 * s, 1.5 * s);
        ctx.fillRect(2.5 * s, -12.5 * s, 2 * s, 1.5 * s);
    } else if(period === 'medieval') {
        ctx.fillStyle = pal.roof;
        ctx.beginPath();
        ctx.moveTo(-8 * s, -5 * s);
        ctx.lineTo(0, -11 * s);
        ctx.lineTo(8 * s, -5 * s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = pal.accent;
        ctx.fillRect(-2.5 * s, 1 * s, 5 * s, 2 * s);
        ctx.strokeRect(-2.5 * s, 1 * s, 5 * s, 2 * s);
    } else if(period === 'ancient') {
        ctx.fillStyle = pal.accent;
        for(let i = -1; i <= 1; i++) {
            ctx.fillRect(i * 4.2 * s - 1.2 * s, -9 * s, 2.4 * s, 6 * s);
            ctx.strokeRect(i * 4.2 * s - 1.2 * s, -9 * s, 2.4 * s, 6 * s);
        }
        ctx.beginPath();
        ctx.moveTo(-8 * s, -5 * s);
        ctx.lineTo(0, -10 * s);
        ctx.lineTo(8 * s, -5 * s);
        ctx.stroke();
    } else {
        ctx.fillStyle = pal.accent;
        ctx.fillRect(-2 * s, -12 * s, 4 * s, 8 * s);
        ctx.strokeRect(-2 * s, -12 * s, 4 * s, 8 * s);
        ctx.fillStyle = 'rgba(210, 215, 220, 0.55)';
        ctx.fillRect(-1 * s, -11 * s, 2 * s, 3 * s);
    }
    ctx.restore();
}
function drawPeriodHarborIcon(ctx, x, y, period, lite) {
    if(wodBoardMapActive()){WodBoardArt.structure(ctx,wodBoardMapActive(),'harbor',x,y,WodBoardArt.palette(wodBoardMapActive()).ink,lite?.8:1,period);return;}
    let s = lite ? 0.82 : 1;
    let pal = wodPeriodStructurePalette(period);
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = pal.stroke;
    ctx.lineWidth = Math.max(1, 1.15 * s);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = pal.water;
    ctx.beginPath();
    ctx.moveTo(-9 * s, 5 * s);
    ctx.quadraticCurveTo(0, 10 * s, 9 * s, 5 * s);
    ctx.lineTo(9 * s, 8 * s);
    ctx.quadraticCurveTo(0, 12 * s, -9 * s, 8 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = pal.wallHi;
    ctx.fillRect(-8 * s, -2 * s, 16 * s, 4 * s);
    ctx.strokeRect(-8 * s, -2 * s, 16 * s, 4 * s);
    if(period === 'napoleonic') {
        ctx.fillStyle = pal.wall;
        ctx.fillRect(-7 * s, -7 * s, 3 * s, 6 * s);
        ctx.fillRect(4 * s, -7 * s, 3 * s, 6 * s);
        ctx.strokeRect(-7 * s, -7 * s, 3 * s, 6 * s);
        ctx.strokeRect(4 * s, -7 * s, 3 * s, 6 * s);
        ctx.beginPath();
        ctx.moveTo(-8 * s, -7 * s);
        ctx.lineTo(8 * s, -7 * s);
        ctx.stroke();
    } else if(period === 'medieval') {
        ctx.fillStyle = pal.wall;
        ctx.fillRect(-9 * s, -1 * s, 3.5 * s, 7 * s);
        ctx.fillRect(5.5 * s, -1 * s, 3.5 * s, 7 * s);
        ctx.strokeRect(-9 * s, -1 * s, 3.5 * s, 7 * s);
        ctx.strokeRect(5.5 * s, -1 * s, 3.5 * s, 7 * s);
        ctx.beginPath();
        ctx.moveTo(-10 * s, 6 * s);
        ctx.lineTo(10 * s, 6 * s);
        ctx.stroke();
    } else if(period === 'ancient') {
        ctx.strokeStyle = pal.accent;
        ctx.beginPath();
        ctx.moveTo(0, -9 * s);
        ctx.lineTo(0, 2 * s);
        ctx.moveTo(-6 * s, -4 * s);
        ctx.quadraticCurveTo(0, -10 * s, 6 * s, -4 * s);
        ctx.stroke();
        ctx.fillStyle = pal.wall;
        ctx.beginPath();
        ctx.moveTo(-5 * s, 0);
        ctx.lineTo(0, -4 * s);
        ctx.lineTo(5 * s, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    } else {
        ctx.fillStyle = pal.accent;
        ctx.beginPath();
        ctx.arc(0, -3 * s, 2.5 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-4 * s, -1 * s);
        ctx.lineTo(4 * s, -1 * s);
        ctx.stroke();
    }
    ctx.restore();
}
function drawPeriodFarmIcon(ctx, x, y, period, lite) {
    if(wodBoardMapActive()){WodBoardArt.structure(ctx,wodBoardMapActive(),'farm',x,y,WodBoardArt.palette(wodBoardMapActive()).ink,lite?.8:1,period);return;}
    let s = lite ? 0.82 : 1;
    let pal = wodPeriodStructurePalette(period);
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = pal.stroke;
    ctx.lineWidth = Math.max(1, 1.1 * s);
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#6b9b3a';
    ctx.beginPath();
    ctx.moveTo(-8 * s, 4 * s);
    ctx.quadraticCurveTo(0, 8 * s, 8 * s, 4 * s);
    ctx.lineTo(8 * s, 6 * s);
    ctx.quadraticCurveTo(0, 10 * s, -8 * s, 6 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = pal.wallHi || '#c9a66b';
    ctx.fillRect(-3 * s, -6 * s, 6 * s, 8 * s);
    ctx.strokeRect(-3 * s, -6 * s, 6 * s, 8 * s);
    ctx.fillStyle = pal.roof || '#8b5a2b';
    ctx.beginPath();
    ctx.moveTo(-4.5 * s, -6 * s);
    ctx.lineTo(0, -11 * s);
    ctx.lineTo(4.5 * s, -6 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#d4b45a';
    for(let i = -2; i <= 2; i++) {
        if(i === 0) continue;
        ctx.fillRect(i * 2.6 * s - 0.7 * s, 1 * s, 1.4 * s, 3 * s);
    }
    ctx.restore();
}
function drawWodCityStructureIcons(ctx, city, gfxLite, atLocalOrigin) {
    if(!city || city.owner === 0) return;
    let period = wodGetRenderPeriod();
    let x = atLocalOrigin ? 0 : city.x;
    let y = atLocalOrigin ? (gfxLite ? 10 : 12) : city.y + (gfxLite ? 10 : 12);
    let icons = [];
    if(city.hasFactory) icons.push('factory');
    if(city.hasFarm) icons.push('farm');
    if(city.hasHarbor) icons.push('harbor');
    if(!icons.length) return;
    let spacing = icons.length >= 3 ? 12 : 9;
    let start = -((icons.length - 1) * spacing) / 2;
    for(let i = 0; i < icons.length; i++) {
        let ix = x + start + i * spacing;
        if(icons[i] === 'factory') drawPeriodFactoryIcon(ctx, ix, y, period, gfxLite);
        else if(icons[i] === 'farm') drawPeriodFarmIcon(ctx, ix, y, period, gfxLite);
        else drawPeriodHarborIcon(ctx, ix, y, period, gfxLite);
    }
}
function paintEditorCityScreen(ctx, screenX, screenY, pxPerWorld, city) {
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.scale(pxPerWorld, pxPerWorld);
    if(city.owner === 0 && !(gameData.layers && gameData.layers.cityNames && city.name)) {
        ctx.restore();
        return;
    }
    if(city.owner !== 0) drawCitySkinMarker(ctx, {...city, x: 0, y: 0});
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if(gameData.layers && gameData.layers.cityNames) {
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 4;
        ctx.fillStyle = city.owner === 0 ? '#bdc3c7' : factionColors[city.owner];
        ctx.fillText(city.name || '', 0, -10);
        ctx.shadowBlur = 0;
        if(city.hasFactory || city.hasHarbor || city.hasFarm) drawWodCityStructureIcons(ctx, city, false, true);
    } else if(city.owner !== 0) {
        ctx.beginPath();
        ctx.arc(0, -10, 8, 0, Math.PI * 2);
        ctx.fillStyle = factionColors[city.owner];
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    if(city.maxHp && city.hp < city.maxHp) {
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(-20, 20, 40, 4);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(-20, 20, 40 * (city.hp / city.maxHp), 4);
    }
    ctx.restore();
}
function roundRect(ctx, x, y, w, h, rr) {
    rr = Math.min(rr, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
}
function drawCombatUnitResourceBars(ctx, unit, ur, simpleMode, zoomWorld) {
    if(unit.type === 'convoy') return;
    drawUnitExperienceBars(ctx,unit,ur,simpleMode);
    let hpFrac = Math.max(0, Math.min(1, unit.maxHp > 0 ? unit.hp / unit.maxHp : 0));
    let mpCap = unit.maxManpower || 1000;
    let mpNow = unit.manpower != null ? unit.manpower : Math.round(mpCap * hpFrac);
    let mpFrac = Math.max(0, Math.min(1, mpCap > 0 ? mpNow / mpCap : 0));
    let lifeFrac = Math.max(0, Math.min(1, (hpFrac + mpFrac) / 2));
    let morCap = unit.maxMorale != null ? unit.maxMorale : WOD_MORALE_MAX;
    let morNow = unit.morale != null ? unit.morale : morCap;
    let morFrac = Math.max(0, Math.min(1, morCap > 0 ? morNow / morCap : 1));

    let bw = Math.max(18, ur * 2.4);
    let bh = Math.max(2.5, ur * 0.19);
    let gap = Math.max(1, ur * 0.048);
    let bx = -bw / 2;
    let halfCh = ur * 0.69;
    let by = halfCh + ur * 0.08;
    let z = zoomWorld > 0 && isFinite(zoomWorld) ? zoomWorld : 1;
    function snapW(w) {
        return Math.max(0, Math.round(w * z) / z);
    }

    if(simpleMode) {
        let y1 = by;
        let wLife = snapW(bw * lifeFrac);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(bx - 0.5, y1 - 0.5, bw + 1, bh + 1);
        ctx.fillStyle = '#241818';
        ctx.fillRect(bx, y1, bw, bh);
        ctx.fillStyle = lifeFrac > 0.38 ? '#1e8449' : '#d68910';
        if(wLife > 0) ctx.fillRect(bx, y1, wLife, bh);
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, y1 + 0.5, bw - 1, bh - 1);
        let y2 = y1 + bh + gap;
        let wMor = snapW(bw * morFrac);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(bx - 0.5, y2 - 0.5, bw + 1, bh + 1);
        ctx.fillStyle = '#241818';
        ctx.fillRect(bx, y2, bw, bh);
        ctx.fillStyle = unit.moraleBroken ? '#922b21' : '#2874a6';
        if(wMor > 0) ctx.fillRect(bx, y2, wMor, bh);
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.strokeRect(bx + 0.5, y2 + 0.5, bw - 1, bh - 1);
        return;
    }

    function paintRow(y, fillFrac, fillStyleFn) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        roundRect(ctx, bx - 0.5, y - 0.5, bw + 1, bh + 1, bh * 0.35);
        ctx.fill();
        ctx.fillStyle = '#241818';
        roundRect(ctx, bx, y, bw, bh, bh * 0.3);
        ctx.fill();
        let fillW = snapW(bw * Math.max(0, Math.min(1, fillFrac)));
        ctx.fillStyle = fillStyleFn();
        roundRect(ctx, bx, y, fillW, bh, bh * 0.3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1;
        roundRect(ctx, bx, y, bw, bh, bh * 0.3);
        ctx.stroke();
    }

    let greenRowY = by;
    paintRow(by, lifeFrac, () => {
        let g = ctx.createLinearGradient(bx, greenRowY, bx + bw, greenRowY);
        g.addColorStop(0, lifeFrac > 0.38 ? '#1e8449' : '#d68910');
        g.addColorStop(1, lifeFrac > 0.62 ? '#28b463' : '#cb4335');
        return g;
    });
    by += bh + gap;

    let morRowY = by;
    paintRow(by, morFrac, () => {
        if(unit.moraleBroken) return '#922b21';
        let g = ctx.createLinearGradient(bx, morRowY, bx + bw, morRowY);
        g.addColorStop(0, '#85c1e9');
        g.addColorStop(1, morFrac > 0.45 ? '#1f618d' : '#2874a6');
        return g;
    });
}
function drawUnitExperienceBars(ctx,unit,ur,simpleMode) {
    const {level,maxLevel}=wodUnitExperience(unit);if(!level||unit.type==='convoy')return;
    const width=Math.max(18,ur*2.4),gap=Math.max(1.5,ur*.09),segment=(width-gap*(maxLevel-1))/maxLevel;
    const total=level*segment+(level-1)*gap,height=Math.max(2.3,ur*.17),y=-ur*.9-height-2;
    ctx.save();ctx.lineWidth=.8;ctx.strokeStyle='#423211';
    const gold=simpleMode?'#f4cd63':ctx.createLinearGradient(0,y,0,y+height);
    if(!simpleMode){gold.addColorStop(0,'#fff0ac');gold.addColorStop(.45,'#e6bd52');gold.addColorStop(1,'#a77820');}
    ctx.fillStyle=gold;
    for(let i=0;i<level;i++){roundRect(ctx,-total/2+i*(segment+gap),y,segment,height,Math.min(1,height/3));ctx.fill();ctx.stroke();}
    ctx.restore();
}
function paintCountryBallSkinPattern(ctx, skin, r) {
    if(skin === 'usa') {
        let H = r * 2;
        let stripe = H / 13;
        for(let i = 0; i < 13; i++) {
            ctx.fillStyle = (i % 2 === 0) ? '#b22234' : '#fff';
            ctx.fillRect(-r, -r + i * stripe, r * 2, stripe + 0.5);
        }
        let cw = r * 0.98;
        let ch = stripe * 7;
        ctx.fillStyle = '#3c3b6e';
        ctx.fillRect(-r, -r, cw, ch);
        ctx.fillStyle = '#fff';
        let gap = stripe * 0.58;
        let starOx = -r + stripe * 0.42;
        let starOy = -r + stripe * 0.48;
        for(let row = 0; row < 9; row++) {
            let count = row % 2 === 0 ? 6 : 5;
            let oy2 = starOy + row * gap * 0.86;
            for(let c = 0; c < count; c++) {
                let ox2 = starOx + (row % 2 === 0 ? 0 : gap * 0.52) + c * gap;
                if(ox2 > -r + cw - stripe * 0.3) continue;
                ctx.beginPath();
                ctx.arc(ox2, oy2, stripe * 0.14, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    } else if(skin === 'uk') {
        let B = '#012169', W = '#ffffff', R = '#C8102E';
        ctx.fillStyle = B;
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.strokeStyle = W;
        ctx.lineWidth = r * 0.42;
        ctx.beginPath();
        ctx.moveTo(-r * 1.02, -r * 1.02); ctx.lineTo(r * 1.02, r * 1.02);
        ctx.moveTo(r * 1.02, -r * 1.02); ctx.lineTo(-r * 1.02, r * 1.02);
        ctx.stroke();
        ctx.strokeStyle = R;
        ctx.lineWidth = r * 0.14;
        ctx.beginPath();
        ctx.moveTo(-r * 0.06, r * 1.02); ctx.lineTo(r * 0.06, -r * 1.02);
        ctx.moveTo(r * 0.06, r * 1.02); ctx.lineTo(-r * 0.06, -r * 1.02);
        ctx.stroke();
        ctx.strokeStyle = W;
        ctx.lineWidth = r * 0.34;
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.02); ctx.lineTo(0, r * 1.02);
        ctx.moveTo(-r * 1.02, 0); ctx.lineTo(r * 1.02, 0);
        ctx.stroke();
        ctx.strokeStyle = R;
        ctx.lineWidth = r * 0.22;
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.02); ctx.lineTo(0, r * 1.02);
        ctx.moveTo(-r * 1.02, 0); ctx.lineTo(r * 1.02, 0);
        ctx.stroke();
    } else if(skin === 'germany') {
        ctx.fillStyle = '#000'; ctx.fillRect(-r, -r, r * 2, r * 0.67);
        ctx.fillStyle = '#dd0000'; ctx.fillRect(-r, -r * 0.33, r * 2, r * 0.67);
        ctx.fillStyle = '#ffce00'; ctx.fillRect(-r, r * 0.33, r * 2, r * 0.67);
    } else if(skin === 'france') {
        ctx.fillStyle = '#0055a4'; ctx.fillRect(-r, -r, r * 0.67, r * 2);
        ctx.fillStyle = '#fff'; ctx.fillRect(-r * 0.33, -r, r * 0.67, r * 2);
        ctx.fillStyle = '#ef4135'; ctx.fillRect(r * 0.33, -r, r * 0.67, r * 2);
    } else if(skin === 'japan') {
        ctx.fillStyle = '#fff'; ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.fillStyle = '#bc002d'; ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.fill();
    } else if(skin === 'ussr') {
        ctx.fillStyle = '#cc1d1d';
        ctx.fillRect(-r, -r, r * 2, r * 2);
        wodPaintHammerSickleEmblem(ctx, 0, 0, r * 1.05, '#ffd700', null);
    } else if(skin === 'italy') {
        ctx.fillStyle = '#009246'; ctx.fillRect(-r, -r, r * 0.67, r * 2);
        ctx.fillStyle = '#fff'; ctx.fillRect(-r * 0.33, -r, r * 0.67, r * 2);
        ctx.fillStyle = '#ce2b37'; ctx.fillRect(r * 0.33, -r, r * 0.67, r * 2);
    } else if(skin === 'china') {
        ctx.fillStyle = '#de2910';
        ctx.fillRect(-r, -r, r * 2, r * 2);
        wodPaintChinaFlagStars(ctx, 0, 0, r * 0.52);
    }
}
function wodSkinShapeType(unit) {
    if(!unit) return 'light';
    if(unit.type === 'heavy') return 'heavy';
    if(wodIsNavalUnit(unit)) return 'ship';
    if(unit.type === 'marine') return 'marine';
    return 'light';
}
function strokeCountryBallSilhouette(ctx, radius, unitType) {
    let g = Math.max(1.052, 1 + radius * 0.0044);
    let rg = radius * g;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(1.18, rg * 0.092);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    if(unitType === 'heavy') {
        let w = rg * 2.15, h = rg * 1.42;
        roundRect(ctx, -w / 2, -h / 2, w, h, rg * 0.24);
    } else if(unitType === 'ship') {
        ctx.moveTo(rg * 0.92, 0);
        ctx.lineTo(-rg * 0.58, rg * 0.78);
        ctx.lineTo(-rg * 0.58, -rg * 0.78);
        ctx.closePath();
    } else if(unitType === 'marine') {
        let w = rg * 1.78, h = rg * 2.02;
        ctx.moveTo(-w * 0.22, -h * 0.48);
        ctx.lineTo(w * 0.52, -h * 0.12);
        ctx.lineTo(w * 0.38, h * 0.52);
        ctx.lineTo(-w * 0.38, h * 0.48);
        ctx.lineTo(-w * 0.55, h * 0.05);
        ctx.closePath();
    } else {
        ctx.arc(0, 0, rg, 0, Math.PI * 2);
    }
    ctx.stroke();
}
function drawCountryBall(ctx, skin, radius, unitType) {
    unitType = unitType || 'light';
    let patternR = radius;
    ctx.save();
    if(unitType === 'heavy') {
        let w = radius * 2.15, h = radius * 1.42;
        roundRect(ctx, -w / 2, -h / 2, w, h, radius * 0.24);
        ctx.clip();
        patternR = Math.min(w, h) / 2;
    } else if(unitType === 'ship') {
        ctx.beginPath();
        ctx.moveTo(radius * 0.92, 0);
        ctx.lineTo(-radius * 0.58, radius * 0.78);
        ctx.lineTo(-radius * 0.58, -radius * 0.78);
        ctx.closePath();
        ctx.clip();
        patternR = radius * 0.95;
    } else if(unitType === 'marine') {
        let w = radius * 1.78, h = radius * 2.02;
        ctx.beginPath();
        ctx.moveTo(-w * 0.22, -h * 0.48);
        ctx.lineTo(w * 0.52, -h * 0.12);
        ctx.lineTo(w * 0.38, h * 0.52);
        ctx.lineTo(-w * 0.38, h * 0.48);
        ctx.lineTo(-w * 0.55, h * 0.05);
        ctx.closePath();
        ctx.clip();
        patternR = radius * 1.02;
    } else {
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.clip();
    }
    paintCountryBallSkinPattern(ctx, skin, patternR);
    ctx.restore();
    strokeCountryBallSilhouette(ctx, radius, unitType);
    drawCountryballMemeEyes(ctx, skin, radius, unitType);
}
function drawCountryballMemeEyes(ctx, skin, r, unitType) {
    unitType = unitType || 'light';
    let y = -r * 0.05;
    let lx = -r * 0.36, rx = r * 0.36;
    if(unitType === 'heavy') {
        y -= r * 0.06;
        lx *= 0.88;
        rx *= 0.88;
    }
    if(unitType === 'ship') {
        y += r * 0.07;
        lx += r * 0.14;
        rx += r * 0.14;
    }
    if(unitType === 'marine') {
        y += r * 0.03;
        lx *= 0.9;
        rx *= 0.9;
    }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if(skin === 'usa') {
        ctx.fillStyle = '#0d0d0d';
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = Math.max(1, r * 0.07);
        let h = r * 0.2, w = r * 1.05;
        roundRect(ctx, -w / 2, y - h / 2, w, h, r * 0.06);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,240,0.55)';
        ctx.fillRect(lx - r * 0.06, y - r * 0.07, r * 0.14, r * 0.06);
        ctx.fillRect(rx - r * 0.08, y - r * 0.07, r * 0.14, r * 0.06);
    } else if(skin === 'uk') {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#111';
        ctx.lineWidth = Math.max(1, r * 0.05);
        ctx.beginPath(); ctx.arc(lx, y, r * 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.arc(lx, y + r * 0.02, r * 0.045, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#c9a227';
        ctx.lineWidth = Math.max(2, r * 0.07);
        ctx.beginPath(); ctx.arc(rx, y, r * 0.12, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(rx, y, r * 0.06, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#151515';
        ctx.beginPath(); ctx.arc(rx, y + r * 0.015, r * 0.028, 0, Math.PI * 2); ctx.fill();
    } else if(skin === 'germany') {
        let ew = r * 0.22, eh = r * 0.16;
        ctx.fillStyle = '#f0f4f8';
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = Math.max(1.2, r * 0.06);
        ctx.fillRect(lx - ew / 2, y - eh / 2, ew, eh);
        ctx.strokeRect(lx - ew / 2, y - eh / 2, ew, eh);
        ctx.fillRect(rx - ew / 2, y - eh / 2, ew, eh);
        ctx.strokeRect(rx - ew / 2, y - eh / 2, ew, eh);
        ctx.beginPath();
        ctx.moveTo(lx + ew / 2, y);
        ctx.lineTo(rx - ew / 2, y);
        ctx.stroke();
        ctx.fillStyle = '#0a0a0a';
        ctx.beginPath(); ctx.arc(lx, y + r * 0.02, r * 0.04, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(rx, y + r * 0.02, r * 0.04, 0, Math.PI * 2); ctx.fill();
    } else if(skin === 'france') {
        ctx.strokeStyle = '#111';
        ctx.lineWidth = Math.max(1.5, r * 0.055);
        ctx.beginPath();
        ctx.moveTo(lx - r * 0.1, y + r * 0.04);
        ctx.quadraticCurveTo(lx - r * 0.02, y - r * 0.14, lx + r * 0.1, y + r * 0.02);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(rx - r * 0.1, y + r * 0.04);
        ctx.quadraticCurveTo(rx + r * 0.02, y - r * 0.14, rx + r * 0.1, y + r * 0.02);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(lx, y + r * 0.02, r * 0.08, r * 0.06, 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(rx, y + r * 0.02, r * 0.08, r * 0.06, -0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath(); ctx.arc(lx + r * 0.02, y + r * 0.03, r * 0.035, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(rx - r * 0.02, y + r * 0.03, r * 0.035, 0, Math.PI * 2); ctx.fill();
    } else if(skin === 'japan') {
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = Math.max(1.5, r * 0.06);
        ctx.beginPath();
        ctx.arc(lx, y + r * 0.05, r * 0.11, Math.PI * 1.12, Math.PI * 1.88);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(rx, y + r * 0.05, r * 0.11, Math.PI * 1.12, Math.PI * 1.88);
        ctx.stroke();
        ctx.lineWidth = Math.max(1, r * 0.04);
        ctx.strokeStyle = '#333';
        ctx.beginPath();
        ctx.moveTo(lx - r * 0.08, y - r * 0.12);
        ctx.quadraticCurveTo(lx, y - r * 0.18, lx + r * 0.08, y - r * 0.12);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(rx - r * 0.08, y - r * 0.12);
        ctx.quadraticCurveTo(rx, y - r * 0.18, rx + r * 0.08, y - r * 0.12);
        ctx.stroke();
    } else if(skin === 'ussr') {
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(lx, y, r * 0.09, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(rx, y, r * 0.09, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd700';
        ctx.beginPath(); ctx.arc(lx - r * 0.02, y - r * 0.02, r * 0.035, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(rx + r * 0.02, y - r * 0.02, r * 0.035, 0, Math.PI * 2); ctx.fill();
    } else if(skin === 'italy') {
        ctx.strokeStyle = '#111';
        ctx.lineWidth = Math.max(1.5, r * 0.055);
        ctx.beginPath();
        ctx.arc(lx, y + r * 0.05, r * 0.11, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(rx, y + r * 0.05, r * 0.11, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath(); ctx.arc(lx, y + r * 0.04, r * 0.04, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(rx, y + r * 0.04, r * 0.04, 0, Math.PI * 2); ctx.fill();
    } else if(skin === 'china') {
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(lx, y, r * 0.09, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(rx, y, r * 0.09, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffde00';
        ctx.beginPath(); ctx.arc(lx - r * 0.02, y - r * 0.02, r * 0.03, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(rx + r * 0.02, y - r * 0.02, r * 0.03, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}
const WOD_PERIOD_IDS = ['modern', 'napoleonic', 'medieval', 'ancient'];
const WOD_PERIOD_SKIN_IDS = ['napoleonic', 'medieval', 'ancient'];
const WOD_RUSE_SKIN_IDS = ['ruseUsa', 'ruseUk', 'ruseFrance', 'ruseGermany', 'ruseUssr', 'ruseJapan', 'ruseItaly', 'ruseChina'];
const WOD_COUNTRYBALL_SKIN_IDS = ['usa', 'uk', 'germany', 'france', 'japan', 'ussr', 'italy', 'china'];
function getUrbanTerrainColor(period) {
    return wodUrbanPeriodStyle(period).base;
}
function wodSetChipPrefix(chipValueId, prefix) {
    let val = document.getElementById(chipValueId);
    if(!val || !val.parentElement) return;
    let chip = val.parentElement;
    for(let n of [...chip.childNodes]) {
        if(n.nodeType === 3) chip.removeChild(n);
    }
    chip.insertBefore(document.createTextNode(prefix + ' '), val);
}
function wodStatsForMode(mode,period='all') {
    const block=wodProgress?.statsByMode?.[mode]||{};return Object.assign({},wodDefaultLifetimeStats(),period==='all'?block.totals:block.byPeriod?.[period]);
}
function wodNapoleonicBlockSize(unit, r) {
    if(unit.type === 'heavy') return { w: r * 2.05, h: r * 2.05 };
    if(wodIsNavalUnit(unit)) return { w: r * 2.35, h: r * 1.15 };
    if(unit.type === 'convoy') return { w: r * 1.38, h: r * 1.38 };
    if(unit.type === 'marine') return { w: r * 1.72, h: r * 1.72 };
    return { w: r * 2.05, h: r * 1.22 };
}
function wodDrawSpecialistMark(ctx,type,r,period=wodGetRenderPeriod()) {
    const era=WOD_SPECIALIST_ERAS[period]||WOD_SPECIALIST_ERAS.modern;
    const mark=era[type==='motorized'?'mobileMark':'mountainMark'];
    ctx.save();ctx.scale(r,r);ctx.lineWidth=Math.max(.075,ctx.lineWidth/r);ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();
    if(mark==='horse'){
        ctx.moveTo(-.35,.48);ctx.lineTo(-.35,.05);ctx.lineTo(-.18,-.48);ctx.lineTo(.03,-.61);ctx.lineTo(.08,-.34);ctx.lineTo(.4,-.12);ctx.lineTo(.38,.1);ctx.lineTo(.13,.04);ctx.lineTo(.28,.48);ctx.closePath();
    }else if(mark==='lance'){
        ctx.moveTo(-.4,.5);ctx.lineTo(.35,-.55);ctx.lineTo(.2,-.32);ctx.lineTo(.4,-.28);ctx.closePath();ctx.moveTo(-.24,-.05);ctx.lineTo(.15,.23);ctx.moveTo(-.32,.48);ctx.lineTo(.25,.48);
    }else if(mark==='saber'){
        ctx.moveTo(-.36,.5);ctx.quadraticCurveTo(.4,-.02,.35,-.57);ctx.quadraticCurveTo(.1,-.08,-.5,.32);ctx.moveTo(-.54,.18);ctx.lineTo(-.1,.5);
    }else if(mark==='javelins'){
        for(const x of[-.23,.23]){ctx.moveTo(x-.13,.5);ctx.lineTo(x+.13,-.5);ctx.moveTo(x-.02,-.27);ctx.lineTo(x+.13,-.5);ctx.lineTo(x+.2,-.24);}
    }else if(mark==='bow'){
        ctx.moveTo(-.28,-.5);ctx.quadraticCurveTo(.55,0,-.28,.5);ctx.lineTo(-.28,-.5);ctx.moveTo(-.5,0);ctx.lineTo(.5,0);ctx.moveTo(.29,-.16);ctx.lineTo(.5,0);ctx.lineTo(.29,.16);
    }else if(mark==='horn'){
        ctx.moveTo(-.45,-.18);ctx.bezierCurveTo(-.1,.65,.55,.43,.35,-.17);ctx.lineTo(.12,-.4);ctx.lineTo(.5,-.4);ctx.lineTo(.35,-.17);ctx.moveTo(-.45,-.18);ctx.lineTo(-.28,-.3);
    }else if(mark==='peak'){
        ctx.moveTo(-.5,.4);ctx.lineTo(-.04,-.5);ctx.lineTo(.5,.4);ctx.moveTo(-.2,-.17);ctx.lineTo(.02,-.04);ctx.lineTo(.16,-.18);
    }else{
        ctx.strokeRect(-.52,-.3,1.04,.55);ctx.moveTo(-.35,-.24);ctx.lineTo(.35,.18);ctx.moveTo(.35,-.24);ctx.lineTo(-.35,.18);
        for(const x of[-.36,0,.36]){ctx.moveTo(x+.09,.48);ctx.arc(x,.48,.09,0,Math.PI*2);}
    }
    ctx.stroke();ctx.restore();
}
function wodNapoleonicDrawMark(ctx, unit, r) {
    let ink = 'rgba(12, 10, 8, 0.72)';
    let inkFill = 'rgba(12, 10, 8, 0.58)';
    ctx.strokeStyle = ink;
    ctx.fillStyle = inkFill;
    ctx.lineWidth = Math.max(1.35, r * 0.1);
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    let ut = unit.type;
    if(WOD_SPECIALIST_UNITS[ut]){wodDrawSpecialistMark(ctx,ut,r);return;}
    if(ut === 'supply') {
        wodDrawSupplyMark(ctx,r);
    } else if(ut === 'transport') {
        wodDrawTransportMark(ctx,r);
    } else if(ut === 'heavy') {
        ctx.beginPath();
        ctx.moveTo(-r * 0.55, -r * 0.55); ctx.lineTo(r * 0.55, r * 0.55);
        ctx.moveTo(r * 0.55, -r * 0.55); ctx.lineTo(-r * 0.55, r * 0.55);
        ctx.stroke();
    } else if(ut === 'marine') {
        ctx.beginPath();
        ctx.moveTo(-r * 0.52, -r * 0.22); ctx.lineTo(r * 0.52, -r * 0.22);
        ctx.moveTo(-r * 0.52, r * 0.18); ctx.lineTo(r * 0.52, r * 0.18);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, r * 0.42, r * 0.14, 0, Math.PI, false);
        ctx.fill();
    } else if(ut === 'ship') {
        ctx.beginPath();
        ctx.moveTo(-r * 0.62, r * 0.2); ctx.lineTo(0, -r * 0.42); ctx.lineTo(r * 0.62, r * 0.2);
        ctx.closePath();
        ctx.fill();
    } else if(ut === 'convoy') {
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
    } else {
        for(let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(i * r * 0.22, -r * 0.44);
            ctx.lineTo(i * r * 0.22, r * 0.44);
            ctx.stroke();
        }
    }
}
function drawNapoleonicCounter(ctx, unit, radius, color) {
    let r = radius;
    let sz = wodNapoleonicBlockSize(unit, r);
    let w = sz.w, h = sz.h;
    let x = -w / 2, y = -h / 2;
    let blockCol = blendColorsFast(factionColors[unit.owner] || color, '#000000', unit.owner === wodLocalPlayerOwner() ? 0.05 : 0.12);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = Math.max(2, r * 0.14);
    ctx.shadowOffsetY = r * 0.05;
    ctx.fillStyle = blockCol;
    ctx.fillRect(x, y, w, h);
    ctx.shadowColor = 'transparent';
    wodNapoleonicDrawMark(ctx, unit, r);
    ctx.lineWidth = Math.max(1.5, r * 0.11);
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
}
function wodNatoDrawIcon(ctx, unit, r) {
    let lw = Math.max(1.35, r * 0.11);
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#000000';
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let ut = unit.type;
    if(WOD_SPECIALIST_UNITS[ut]){wodDrawSpecialistMark(ctx,ut,r);return;}
    if(ut === 'supply') {
        wodDrawSupplyMark(ctx,r);
    } else if(ut === 'transport') {
        wodDrawTransportMark(ctx,r);
    } else if(ut === 'heavy') {
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.56, r * 0.3, 0, 0, Math.PI * 2);
        ctx.stroke();
    } else if(ut === 'marine') {
        ctx.beginPath();
        ctx.moveTo(-r * 0.5, -r * 0.36); ctx.lineTo(r * 0.5, r * 0.36);
        ctx.moveTo(r * 0.5, -r * 0.36); ctx.lineTo(-r * 0.5, r * 0.36);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-r * 0.42, r * 0.38);
        ctx.bezierCurveTo(-r * 0.2, r * 0.5, r * 0.2, r * 0.26, r * 0.42, r * 0.38);
        ctx.stroke();
    } else if(ut === 'ship') {
        ctx.beginPath();
        ctx.arc(0, -r * 0.14, r * 0.11, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.02); ctx.lineTo(0, r * 0.44);
        ctx.moveTo(-r * 0.36, r * 0.2); ctx.quadraticCurveTo(0, r * 0.52, r * 0.36, r * 0.2);
        ctx.moveTo(-r * 0.26, -r * 0.06); ctx.lineTo(r * 0.26, -r * 0.06);
        ctx.stroke();
    } else if(ut === 'convoy') {
        ctx.beginPath();
        ctx.rect(-r * 0.18, -r * 0.18, r * 0.36, r * 0.36);
        ctx.stroke();
    } else {
        ctx.beginPath();
        ctx.moveTo(-r * 0.52, -r * 0.4); ctx.lineTo(r * 0.52, r * 0.4);
        ctx.moveTo(r * 0.52, -r * 0.4); ctx.lineTo(-r * 0.52, r * 0.4);
        ctx.stroke();
    }
}
function drawPeriodCounter(ctx, unit, radius, color, period, civSkinId) {
    if(period === 'napoleonic') {
        drawNapoleonicCounter(ctx, unit, radius, color);
        return;
    }
    if(civSkinId) period = 'ancient';
    let civPal = civSkinId && typeof wodAncientCivPalette === 'function' ? wodAncientCivPalette(civSkinId) : null;
    let w = radius * 2.15, h = radius * 1.38, x = -w / 2, y = -h / 2;
    let rr = Math.max(2, radius * 0.22);
    if(period === 'ancient') { w = radius * 2.22; h = radius * 2.22; x = -w / 2; y = -h / 2; rr = w * 0.5; }
    if(period === 'medieval') { w = radius * 2.18; h = radius * 1.48; x = -w / 2; y = -h / 2; rr = Math.max(2, radius * 0.1); }
    let fillBase = '#f7fafc';
    if(period === 'ancient') fillBase = '#ebe4d4';
    else if(period === 'medieval') fillBase = '#d5d0c4';
    if(civPal) fillBase = civPal.fill;
    let fillCol = unit.owner === 1 ? blendColorsFast(fillBase, color, period === 'medieval' ? 0.14 : 0.08)
        : blendColorsFast(fillBase, factionColors[unit.owner] || color, 0.42);
    if(civPal) {
        fillCol = unit.owner === 1
            ? blendColorsFast(civPal.fillHi, color, 0.1)
            : blendColorsFast(civPal.fill, factionColors[unit.owner] || color, 0.32);
    }
    let strokeCol = color;
    if(civPal) strokeCol = civPal.rim;
    else if(period === 'ancient') strokeCol = blendColorsFast('#6b4a1e', color, 0.28);
    else if(period === 'medieval') strokeCol = blendColorsFast('#3d3028', color, 0.32);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.38)';
    ctx.shadowBlur = Math.max(3, radius * 0.25);
    ctx.shadowOffsetY = radius * 0.08;
    ctx.fillStyle = fillCol;
    if(period === 'medieval') {
        roundRect(ctx, x, y + radius * 0.14, w, h - radius * 0.14, rr);
        ctx.fill();
        ctx.fillStyle = blendColorsFast(fillCol, '#8a7f72', 0.22);
        let bw = w / 5, bt = radius * 0.2;
        for(let i = 0; i < 5; i++) {
            if(i % 2 === 0) ctx.fillRect(x + i * bw, y, bw + 0.5, bt);
        }
    } else if(period === 'ancient') {
        ctx.beginPath();
        ctx.arc(0, 0, w * 0.5, 0, Math.PI * 2);
        ctx.fill();
    } else {
        roundRect(ctx, x, y, w, h, rr);
        ctx.fill();
    }
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = Math.max(2, radius * 0.22);
    ctx.strokeStyle = strokeCol;
    if(period === 'medieval') {
        roundRect(ctx, x, y + radius * 0.14, w, h - radius * 0.14, rr);
        ctx.stroke();
        ctx.strokeRect(x, y, w, radius * 0.22);
    } else if(period === 'ancient') {
        ctx.beginPath();
        ctx.arc(0, 0, w * 0.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = Math.max(1.2, radius * 0.1);
        ctx.strokeStyle = civPal ? civPal.rimInner : 'rgba(90,62,28,0.55)';
        ctx.beginPath();
        ctx.arc(0, 0, w * 0.38, 0, Math.PI * 2);
        ctx.stroke();
    } else {
        roundRect(ctx, x, y, w, h, rr);
        ctx.stroke();
    }
    let symCol = civPal ? civPal.emblem : (unit.owner !== 1 ? blendColorsFast('#243040', factionColors[unit.owner] || color, 0.42) : '#1a2634');
    ctx.strokeStyle = symCol;
    ctx.lineWidth = Math.max(2, radius * 0.13);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let r = radius;
    if(period === 'medieval') {
        if(unit.type === 'heavy') {
            ctx.moveTo(0, -r * 0.55); ctx.lineTo(r * 0.42, r * 0.45); ctx.lineTo(-r * 0.42, r * 0.45); ctx.closePath();
        } else if(unit.type === 'marine') {
            ctx.moveTo(-r * 0.5, r * 0.2); ctx.quadraticCurveTo(0, -r * 0.5, r * 0.5, r * 0.2);
        } else if(wodIsNavalUnit(unit)) {
            ctx.moveTo(-r * 0.55, r * 0.15); ctx.lineTo(0, -r * 0.45); ctx.lineTo(r * 0.55, r * 0.15);
            ctx.moveTo(-r * 0.35, r * 0.35); ctx.lineTo(r * 0.35, r * 0.35);
        } else {
            ctx.moveTo(-r * 0.15, -r * 0.55); ctx.lineTo(r * 0.15, -r * 0.55);
            ctx.moveTo(0, -r * 0.55); ctx.lineTo(0, r * 0.45);
        }
    } else if(period === 'ancient') {
        if(civSkinId && typeof wodPaintAncientCivEmblem === 'function') {
            wodPaintAncientCivEmblem(ctx, civSkinId, r, color, unit.owner);
        } else if(unit.type === 'heavy') {
            ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
            ctx.moveTo(-r * 0.55, 0); ctx.lineTo(r * 0.55, 0);
        } else if(unit.type === 'marine') {
            ctx.moveTo(0, -r * 0.55); ctx.lineTo(r * 0.35, r * 0.45); ctx.lineTo(-r * 0.35, r * 0.45); ctx.closePath();
        } else if(wodIsNavalUnit(unit)) {
            ctx.moveTo(-r * 0.65, r * 0.25); ctx.lineTo(0, -r * 0.4); ctx.lineTo(r * 0.65, r * 0.25);
            for(let i = -1; i <= 1; i++) { ctx.moveTo(i * r * 0.22, -r * 0.05); ctx.lineTo(i * r * 0.22, r * 0.35); }
        } else {
            ctx.moveTo(-r * 0.2, -r * 0.55); ctx.lineTo(r * 0.2, -r * 0.55);
            for(let i = -2; i <= 2; i++) { ctx.moveTo(i * r * 0.18, -r * 0.55); ctx.lineTo(i * r * 0.18, r * 0.45); }
        }
    }
    if(!(period === 'ancient' && civSkinId)) ctx.stroke();
    ctx.lineWidth = Math.max(1.12, radius * 0.084);
    ctx.strokeStyle = 'rgba(10, 12, 18, 0.96)';
    if(period === 'ancient') {
        ctx.beginPath();
        ctx.arc(0, 0, w * 0.5 + Math.max(1.12, radius * 0.084), 0, Math.PI * 2);
        ctx.stroke();
    } else if(period === 'medieval') {
        roundRect(ctx, x - 1, y + radius * 0.14 - 1, w + 2, h - radius * 0.14 + 2, rr + 0.5);
        ctx.stroke();
    } else {
        roundRect(ctx, x - 1, y - 1, w + 2, h + 2, rr + 0.5);
        ctx.stroke();
    }
    ctx.restore();
}
function drawNatoCounter(ctx, unit, radius, color) {
    let w = radius * 2.64;
    let h = radius * 2.72;
    let x = -w / 2;
    let y = -h / 2;
    let rr = Math.max(1.5, radius * 0.16);
    let fillCol = blendColorsFast(color || '#2ecc71', '#101922', 0.18);
    let faceInset = Math.max(1.1, radius * 0.11);
    let faceH = h * 0.62;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.56)';
    ctx.shadowBlur = Math.max(3.5, radius * 0.32);
    ctx.shadowOffsetY = radius * 0.18;
    let bodyGrad = ctx.createLinearGradient(0, y, 0, y + h);
    bodyGrad.addColorStop(0, blendColorsFast(fillCol, '#eef4e8', 0.13));
    bodyGrad.addColorStop(0.58, fillCol);
    bodyGrad.addColorStop(1, blendColorsFast(fillCol, '#08110e', 0.28));
    ctx.fillStyle = bodyGrad;
    roundRect(ctx, x, y, w, h, rr);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = Math.max(1.1, radius * 0.085);
    ctx.strokeStyle = 'rgba(8,12,16,0.82)';
    roundRect(ctx, x, y, w, h, rr);
    ctx.stroke();
    let faceX = x + faceInset;
    let faceY = y + faceInset;
    let faceW = w - faceInset * 2;
    let faceGrad = ctx.createLinearGradient(faceX, faceY, faceX, faceY + faceH);
    faceGrad.addColorStop(0, '#fbfaef');
    faceGrad.addColorStop(1, '#d8ded5');
    ctx.fillStyle = faceGrad;
    roundRect(ctx, faceX, faceY, faceW, faceH, Math.max(1, rr * 0.62));
    ctx.fill();
    ctx.lineWidth = Math.max(1.05, radius * 0.075);
    ctx.strokeStyle = 'rgba(18,24,22,0.92)';
    roundRect(ctx, faceX, faceY, faceW, faceH, Math.max(1, rr * 0.62));
    ctx.stroke();
    ctx.save();
    ctx.translate(0, -h * 0.115);
    wodNatoDrawIcon(ctx, unit, radius * 1.1);
    ctx.restore();
    let plateY = y + h * 0.79;
    ctx.fillStyle = 'rgba(6, 16, 15, 0.5)';
    roundRect(ctx, -radius * 0.44, plateY, radius * 0.88, radius * 0.16, radius * 0.05);
    ctx.fill();
    ctx.fillStyle = 'rgba(226, 239, 218, 0.8)';
    ctx.beginPath();
    ctx.arc(radius * 0.28, plateY + radius * 0.08, Math.max(0.7, radius * 0.04), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}
function wodDrawNatoSelectionBrackets(ctx, radius) {
    let w = radius * 3.22;
    let h = radius * 3.32;
    let x = -w / 2, y = -h / 2;
    let arm = Math.max(4, radius * 0.42);
    let lw = Math.max(2.2, radius * 0.18);
    ctx.save();
    ctx.strokeStyle = '#fff8e0';
    ctx.lineWidth = lw;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    ctx.shadowColor = 'rgba(241, 196, 15, 0.65)';
    ctx.shadowBlur = Math.max(3, radius * 0.2);
    // TL
    ctx.beginPath();
    ctx.moveTo(x, y + arm); ctx.lineTo(x, y); ctx.lineTo(x + arm, y);
    ctx.stroke();
    // TR
    ctx.beginPath();
    ctx.moveTo(x + w - arm, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + arm);
    ctx.stroke();
    // BL
    ctx.beginPath();
    ctx.moveTo(x, y + h - arm); ctx.lineTo(x, y + h); ctx.lineTo(x + arm, y + h);
    ctx.stroke();
    // BR
    ctx.beginPath();
    ctx.moveTo(x + w - arm, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - arm);
    ctx.stroke();
    ctx.restore();
}
const WOD_HAMMER_SICKLE_SVG = {
    gX: 18, gY: -824,
    sickle: 'm 157.54301,922.36336 -16.97149,16.9707 -45.256019,45.2539 -56.570993,56.57034 62.227502,62.2246 56.571,-56.5684 299.82842,299.8124 a 32.001491,31.999993 0 0 0 45.25601,0 32.001491,31.999993 0 0 0 0,-45.2539 l -299.82646,-299.8143 16.9715,-16.97074 50.91448,-50.91015 z',
    hammer: 'm 255.989,844.0001 c 0,0 168.00781,127.99997 168.00783,256 C 423.99684,1164 367.99425,1236 271.98975,1236 c -64.00296,0 -104.24119,-47.7637 -104.24119,-47.7637 l -11.31302,11.3125 a 16.000745,15.999996 0 0 0 -22.62801,0 16.000745,15.999996 0 0 0 -2.47863,3.2227 32.001491,31.999993 0 0 0 -31.464359,8.0918 32.001491,31.999993 0 0 0 -9.330512,21.5449 C 65.101725,1246.1605 22.969246,1272.9834 4.2643862,1308 l 0.029298,0.029 A 32.001491,31.999993 0 0 0 4.2643862,1340 32.001491,31.999993 0 0 0 47.979313,1351.7129 c 35.025561,-18.708 61.854737,-60.8518 75.605087,-86.2813 a 32.001491,31.999993 0 0 0 21.53616,-9.3144 32.001491,31.999993 0 0 0 7.93201,-13.2012 c 24.51647,23.0544 71.44493,57.084 134.93792,57.084 96.00451,0 200.00932,-72 200.00932,-199.9999 0,-160.00002 -232.01081,-256 -232.01081,-256 z'
};
function wodPaintHammerSickleEmblem(ctx, cx, cy, size, fill, stroke) {
    let sc = Math.max(10, size) / 550;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sc, sc);
    ctx.translate(-275, -275);
    ctx.translate(WOD_HAMMER_SICKLE_SVG.gX, WOD_HAMMER_SICKLE_SVG.gY);
    ctx.fillStyle = fill || '#ffd700';
    if(stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2 / sc;
        ctx.lineJoin = 'round';
    }
    ctx.fill(new Path2D(WOD_HAMMER_SICKLE_SVG.sickle));
    ctx.fill(new Path2D(WOD_HAMMER_SICKLE_SVG.hammer));
    if(stroke) {
        ctx.stroke(new Path2D(WOD_HAMMER_SICKLE_SVG.sickle));
        ctx.stroke(new Path2D(WOD_HAMMER_SICKLE_SVG.hammer));
    }
    ctx.restore();
}
function wodRusePaintUnionJackEmblem(ctx, cx, cy, half) {
    let r = half;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    let B = '#012169', W = '#ffffff', R = '#C8102E';
    ctx.fillStyle = B;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.strokeStyle = W;
    ctx.lineWidth = r * 0.4;
    ctx.beginPath();
    ctx.moveTo(-r, -r); ctx.lineTo(r, r);
    ctx.moveTo(r, -r); ctx.lineTo(-r, r);
    ctx.stroke();
    ctx.strokeStyle = R;
    ctx.lineWidth = r * 0.13;
    ctx.beginPath();
    ctx.moveTo(-r * 0.05, r); ctx.lineTo(r * 0.05, -r);
    ctx.moveTo(r * 0.05, r); ctx.lineTo(-r * 0.05, -r);
    ctx.stroke();
    ctx.strokeStyle = W;
    ctx.lineWidth = r * 0.32;
    ctx.beginPath();
    ctx.moveTo(0, -r); ctx.lineTo(0, r);
    ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
    ctx.stroke();
    ctx.strokeStyle = R;
    ctx.lineWidth = r * 0.2;
    ctx.beginPath();
    ctx.moveTo(0, -r); ctx.lineTo(0, r);
    ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
    ctx.stroke();
    ctx.restore();
}
function wodRusePaintTricolorEmblem(ctx, cx, cy, radius) {
    let r = radius;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    let col = (r * 2) / 3;
    ctx.fillStyle = '#0055a4';
    ctx.fillRect(-r, -r, col, r * 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-r + col, -r, col, r * 2);
    ctx.fillStyle = '#ef4135';
    ctx.fillRect(-r + col * 2, -r, col, r * 2);
    ctx.restore();
}
function wodRusePaintItalyTricolorEmblem(ctx, cx, cy, half) {
    let r = half;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    let col = (r * 2) / 3;
    ctx.fillStyle = '#009246';
    ctx.fillRect(-r, -r, col, r * 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-r + col, -r, col, r * 2);
    ctx.fillStyle = '#ce2b37';
    ctx.fillRect(-r + col * 2, -r, col, r * 2);
    ctx.restore();
}
function wodRuseNationPalette(skinId) {
    if(skinId === 'ruseUsa') return { face: '#6b7356', hi: '#8f9a72', rim: '#2a2f22', rimHi: '#4d5640', mark: '#e8e4dc', markStyle: 'star' };
    if(skinId === 'ruseUk') return { face: '#646b58', hi: '#828c70', rim: '#252820', rimHi: '#454d3c', mark: '#012169', markStyle: 'unionjack' };
    if(skinId === 'ruseFrance') return { face: '#686f5c', hi: '#868f74', rim: '#282c22', rimHi: '#484f3e', mark: '#0055a4', markStyle: 'tricolor' };
    if(skinId === 'ruseGermany') return { face: '#5e6358', hi: '#7a8074', rim: '#222420', rimHi: '#3e4238', mark: '#1a1a1a', markStyle: 'cross' };
    if(skinId === 'ruseUssr') return { face: '#6e4a42', hi: '#8c5e54', rim: '#2a1814', rimHi: '#4a3028', mark: '#ffd700', markStyle: 'soviet' };
    if(skinId === 'ruseJapan') return { face: '#8a7a58', hi: '#a89870', rim: '#302818', rimHi: '#524830', mark: '#bc002d', markStyle: 'sun' };
    if(skinId === 'ruseItaly') return { face: '#686f5c', hi: '#868f74', rim: '#282c22', rimHi: '#484f3e', mark: '#009246', markStyle: 'tricolorIt' };
    if(skinId === 'ruseChina') return { face: '#6e483e', hi: '#8a5c50', rim: '#2a1814', rimHi: '#4a3028', mark: '#ffde00', markStyle: 'ccstar' };
    return { face: '#646860', hi: '#7e8478', rim: '#242620', rimHi: '#42463c', mark: '#111', markStyle: 'none' };
}
function wodWw2DrawCounterBody(ctx, shape, rx, ry, pal, radius) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, ry * 0.48, rx * 0.88, ry * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    let faceG = ctx.createRadialGradient(-rx * 0.22, -ry * 0.28, radius * 0.05, 0, 0, Math.max(rx, ry) * 1.06);
    faceG.addColorStop(0, pal.hi);
    faceG.addColorStop(0.7, pal.face);
    faceG.addColorStop(1, pal.face);
    ctx.fillStyle = faceG;
    wodRuseBeginChipPath(ctx, shape, rx, ry);
    ctx.fill();
    ctx.lineWidth = Math.max(2, radius * 0.13);
    ctx.strokeStyle = pal.rim;
    wodRuseBeginChipPath(ctx, shape, rx, ry);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, radius * 0.055);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    wodRuseBeginChipPath(ctx, shape, rx * 0.9, ry * 0.9);
    ctx.stroke();
    ctx.lineWidth = Math.max(1.2, radius * 0.07);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    wodRuseBeginChipPath(ctx, shape, rx * 0.78, ry * 0.78);
    ctx.stroke();
}
function wodRuseChipDimensions(unit, radius) {
    let ut = wodSkinShapeType(unit);
    if(ut === 'light') return { shape: 'circle', rx: radius * 0.68, ry: radius * 0.68 };
    if(ut === 'heavy') return { shape: 'circle', rx: radius * 1.08, ry: radius * 1.08 };
    if(ut === 'marine') return { shape: 'rect', rx: radius * 0.92, ry: radius * 0.56 };
    if(ut === 'ship') return { shape: 'square', rx: radius * 1.02, ry: radius * 1.02 };
    return { shape: 'circle', rx: radius * 0.75, ry: radius * 0.75 };
}
function wodRuseBeginChipPath(ctx, shape, rx, ry) {
    ctx.beginPath();
    if(shape === 'circle') {
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    } else if(shape === 'square') {
        let side = Math.min(rx, ry) * 2;
        roundRect(ctx, -side / 2, -side / 2, side, side, side * 0.1);
    } else {
        roundRect(ctx, -rx, -ry, rx * 2, ry * 2, Math.min(rx, ry) * 0.14);
    }
}
function wodRusePaintFivePointStar(ctx, cx, cy, outerR, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    for(let i = 0; i < 5; i++) {
        let a = -Math.PI / 2 + i * Math.PI * 2 / 5;
        let x = cx + Math.cos(a) * outerR;
        let y = cy + Math.sin(a) * outerR;
        if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        a += Math.PI / 5;
        x = cx + Math.cos(a) * outerR * 0.42;
        y = cy + Math.sin(a) * outerR * 0.42;
        ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
}
function wodPaintChinaFlagStars(ctx, cx, cy, scale) {
    wodRusePaintFivePointStar(ctx, cx, cy, scale * 0.62, '#ffde00');
}
function wodRuseEmblemSpan(emblemR) {
    return emblemR * 1.92;
}
function wodRusePaintNationEmblem(ctx, skinId, emblemR) {
    let pal = wodRuseNationPalette(skinId);
    let span = wodRuseEmblemSpan(emblemR);
    let half = span * 0.5;
    if(pal.markStyle === 'star') {
        wodRusePaintFivePointStar(ctx, 0, 0, half * 0.96, pal.mark);
    } else if(pal.markStyle === 'cross') {
        ctx.fillStyle = pal.mark;
        let cw = half * 0.34, cl = half * 1.0;
        ctx.fillRect(-cw / 2, -cl / 2, cw, cl);
        ctx.fillRect(-cl / 2, -cw / 2, cl, cw);
    } else if(pal.markStyle === 'soviet') {
        let discR = half * 0.96;
        if(skinId === 'ruseUssr') {
            ctx.fillStyle = '#b42323';
            ctx.beginPath();
            ctx.arc(0, 0, discR, 0, Math.PI * 2);
            ctx.fill();
        }
        wodPaintHammerSickleEmblem(ctx, 0, 0, discR * 1.76, pal.mark, null);
    } else if(pal.markStyle === 'sun') {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, half * 0.94, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = pal.mark;
        ctx.beginPath();
        ctx.arc(0, 0, half * 0.58, 0, Math.PI * 2);
        ctx.fill();
    } else if(pal.markStyle === 'unionjack') {
        wodRusePaintUnionJackEmblem(ctx, 0, 0, half * 0.96);
    } else if(pal.markStyle === 'tricolor') {
        wodRusePaintTricolorEmblem(ctx, 0, 0, half * 0.96);
    } else if(pal.markStyle === 'tricolorIt') {
        wodRusePaintItalyTricolorEmblem(ctx, 0, 0, half * 0.96);
    } else if(pal.markStyle === 'ccstar') {
        let discR = half * 0.96;
        ctx.fillStyle = '#de2910';
        ctx.beginPath();
        ctx.arc(0, 0, discR, 0, Math.PI * 2);
        ctx.fill();
        wodPaintChinaFlagStars(ctx, 0, 0, discR * 0.78);
    }
}
function wodStrokeRuseChipSelection(ctx, unit, ur, pad) {
    pad = pad == null ? 4 : pad;
    let dims = wodRuseChipDimensions(unit, ur);
    wodRuseBeginChipPath(ctx, dims.shape, dims.rx + pad, dims.ry + pad);
    ctx.stroke();
    return true;
}
function drawRuseChip(ctx, unit, radius, skinId) {
    const pal = wodRuseNationPalette(skinId), dims = wodRuseChipDimensions(unit, radius);
    ctx.save();
    ctx.shadowColor = '#0008'; ctx.shadowBlur = radius*.18; ctx.shadowOffsetY = radius*.1;
    wodWw2DrawCounterBody(ctx, dims.shape, dims.rx, dims.ry, pal, radius);
    ctx.shadowColor = 'transparent';
    ctx.save(); ctx.scale(.88,.88);
    wodRuseBeginChipPath(ctx,dims.shape,dims.rx,dims.ry);
    ctx.strokeStyle = '#e8d3a174'; ctx.lineWidth = Math.max(.7,radius*.035); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = '#f4ecd6'; ctx.fillStyle = '#f4ecd6';
    wodDrawPremiumMark(ctx,unit,radius*.63,wodGetRenderPeriod());
    ctx.save(); ctx.translate(dims.rx*.65,-dims.ry*.65);
    ctx.fillStyle = '#17212a';ctx.beginPath();ctx.arc(0,0,radius*.38,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle = '#e0c98d';ctx.lineWidth = radius*.035;ctx.stroke();
    ctx.save();ctx.beginPath();ctx.arc(0,0,radius*.3,0,Math.PI*2);ctx.clip();
    wodRusePaintNationEmblem(ctx,skinId,radius*.29);ctx.restore();ctx.restore();
    ctx.restore();
}
function drawGoldenChipUnit(ctx, unit, radius, accentColor) {
    wodDrawPremiumChip(ctx, unit, radius, accentColor, false);
}
function getEffectiveUnitSkin(unit) {
    const board=wodBoardMapActive();if(board&&!unit._skinPreview)return 'board_'+board;
    if(wodHdMapActive()&&!unit._skinPreview)return 'atlasUnits';
    let fromOv = null;
    if(unit.skinOverride) {
        fromOv = unit.skinOverride;
        if(fromOv === 'default') fromOv = 'nato';
        return fromOv;
    }
    let skin = unit.owner === 1 ? gameData.unitSkin : (gameData.aiUnitSkin || 'nato');
    if(skin!=='atlasUnits'&&!WodStoreCatalog.premiumBase(skin)&&gameData.loadedCustomMap&&gameData._selectedMissionEntry?.storeMission&&WOD_PERIOD_SKIN_IDS.includes(gameData._loadedMapGamePeriod))return gameData._loadedMapGamePeriod;
    if(!skin || skin === 'default' || skin === 'atlasUnits') skin = 'nato';
    return skin;
}
function classicShipTrianglePath(ctx, ur) {
    let r = ur;
    ctx.beginPath();
    ctx.moveTo(r * 0.92, 0);
    ctx.lineTo(-r * 0.58, r * 0.78);
    ctx.lineTo(-r * 0.58, -r * 0.78);
    ctx.closePath();
}
function drawClassicFactionShipTriangle(ctx, ur, uColor) {
    ctx.fillStyle = uColor;
    classicShipTrianglePath(ctx, ur);
    ctx.fill();
    let olw = Math.max(1.42, ur * 0.1);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = olw;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.save();
    ctx.scale(1.059, 1.059);
    ctx.beginPath();
    classicShipTrianglePath(ctx, ur);
    ctx.stroke();
    ctx.restore();
}
function drawClassicGoldTriangle(ctx, ur) {
    ctx.fillStyle = '#f1c40f';
    classicShipTrianglePath(ctx, ur);
    ctx.fill();
    let olw = Math.max(1.42, ur * 0.1);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = olw;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.save();
    ctx.scale(1.059, 1.059);
    ctx.beginPath();
    classicShipTrianglePath(ctx, ur);
    ctx.stroke();
    ctx.restore();
}
function drawClassicUnitShape(ctx, type, ur, uColor, unitOpt) {
    if(type==='transport'){
        drawClassicFactionShipTriangle(ctx,ur,uColor);wodDrawTransportBadge(ctx,ur,uColor);return;
    }
    if(type === 'ship') {
        ctx.save();
        ctx.rotate(getUnitFacingAngle(unitOpt));
        drawClassicFactionShipTriangle(ctx, ur, uColor);
        ctx.restore();
    } else if(type === 'heavy') {
        ctx.fillStyle = uColor;
        ctx.fillRect(-ur, -ur, ur * 2, ur * 2);
        ctx.strokeStyle = '#000';
        let hlw = Math.max(1.4, ur * 0.1);
        let hpad = hlw * 0.62;
        ctx.lineWidth = hlw;
        ctx.strokeRect(-ur - hpad, -ur - hpad, ur * 2 + hpad * 2, ur * 2 + hpad * 2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(ur * 1.2, 0);
        ctx.lineWidth = Math.max(1, ur * 0.084);
        ctx.stroke();
    } else if(type === 'convoy') {
        let sea = unitOpt && unitOpt.convoySeaRoute;
        if(sea) {
            ctx.save();
            ctx.rotate(getUnitFacingAngle(unitOpt));
            drawClassicGoldTriangle(ctx, ur);
            ctx.restore();
        } else {
            let s = ur * 0.92;
            let clw = Math.max(1.22, ur * 0.088);
            let cp = clw * 0.62;
            ctx.fillStyle = '#f1c40f';
            ctx.fillRect(-s * 0.5, -s * 0.5, s, s);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = clw;
            ctx.strokeRect(-s * 0.5 - cp, -s * 0.5 - cp, s + cp * 2, s + cp * 2);
        }
    } else if(type === 'marine') {
        ctx.beginPath();
        ctx.arc(0, 0, ur, 0, Math.PI * 2);
        ctx.fillStyle = uColor;
        ctx.fill();
        let mlw = Math.max(1.38, ur * 0.1);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = mlw;
        ctx.beginPath();
        ctx.arc(0, 0, ur + mlw * 0.64, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(25,55,82,0.95)';
        ctx.lineWidth = Math.max(2, ur * 0.15);
        ctx.beginPath();
        ctx.arc(0, ur * 0.26, ur * 0.42, Math.PI * 1.05, Math.PI * 1.95);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = Math.max(1.2, ur * 0.085);
        ctx.beginPath();
        ctx.moveTo(-ur * 0.48, ur * 0.02);
        ctx.lineTo(ur * 0.48, ur * 0.02);
        ctx.stroke();
    } else {
        ctx.beginPath();
        ctx.arc(0, 0, ur, 0, Math.PI * 2);
        ctx.fillStyle = uColor;
        ctx.fill();
        let lw = Math.max(1.38, ur * 0.1);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.arc(0, 0, ur + lw * 0.64, 0, Math.PI * 2);
        ctx.stroke();
    }
}
function renderHelpMiniDiagrams() {
    for(const e of document.querySelectorAll('[data-wod-specialist-name]'))e.textContent=wodSpecialistLabel(e.dataset.wodSpecialistName)+(e.dataset.suffix||'');
    let col = factionColors[1] || '#2ecc71';
    function fillHelpUnitCanvas(id, type, extra) {
        let canvas = document.getElementById(id);
        if(!canvas || !canvas.getContext) return;
        let ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0f1823';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        let eu = Object.assign({
            type: type, owner: 1,
            hp: 100, maxHp: 100, manpower: 1000, tanks: 0,
        }, extra || {});
        let ur = 13;
        drawHelpUnitMarker(ctx, eu, ur, col);
        ctx.restore();
    }
    function fillFormationCanvas(id) {
        let c = document.getElementById(id);
        if(!c || !c.getContext) return;
        let ctx = c.getContext('2d');
        ctx.fillStyle = '#0f1823';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.strokeStyle = 'rgba(52, 152, 219, 0.72)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(18, 52);
        ctx.lineTo(178, 22);
        ctx.stroke();
        for(let i = 0; i < 4; i++) {
            let t = i / 3;
            let x = 18 + (178 - 18) * t;
            let y = 52 + (22 - 52) * t;
            ctx.beginPath();
            ctx.fillStyle = col;
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#0d0d0d';
            ctx.lineWidth = 1.2;
            ctx.stroke();
        }
    }
    for(let prefix of ['menuHelpCanvas', 'escHelpCanvas']) {
        fillHelpUnitCanvas(prefix + 'UnitLight', 'light');fillHelpUnitCanvas(prefix+'UnitMotorized','motorized');fillHelpUnitCanvas(prefix+'UnitMountaineer','mountaineer');
        fillHelpUnitCanvas(prefix + 'UnitMarine', 'marine');
        fillHelpUnitCanvas(prefix + 'UnitHeavy', 'heavy');
        fillHelpUnitCanvas(prefix+'UnitTransport','transport',{x:0,y:0});
        fillHelpUnitCanvas(prefix+'UnitSupply','supply',{x:0,y:0});
        fillHelpUnitCanvas(prefix + 'UnitShip', 'ship', { x: 0, y: 0, target: { x: 28, y: -9 } });
        fillFormationCanvas(prefix + 'Formation');
    }
    renderHelpEffectCards();
}
function wodDrawTransportMark(ctx,r) {
    // A cargo box aboard a hull, drawn with the counter's own ink.
    ctx.beginPath();ctx.moveTo(-r*.62,r*.12);ctx.lineTo(-r*.40,r*.42);
    ctx.lineTo(r*.40,r*.42);ctx.lineTo(r*.62,r*.12);ctx.closePath();ctx.stroke();
    ctx.strokeRect(-r*.25,-r*.42,r*.50,r*.48);
    ctx.beginPath();ctx.moveTo(0,-r*.42);ctx.lineTo(0,r*.06);ctx.stroke();
}
function wodDrawTransportBadge(ctx,r,color) {
    ctx.save();ctx.translate(r*.68,r*.57);
    ctx.fillStyle='#eee7d4';ctx.strokeStyle='#25323a';ctx.lineWidth=Math.max(1,r*.07);
    roundRect(ctx,-r*.35,-r*.30,r*.70,r*.60,r*.08);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,-r*.30);ctx.lineTo(0,r*.30);ctx.stroke();ctx.restore();
}
function wodDrawUnitBodyUncached(ctx, unit, radius, color, skin) {
    if(skin.startsWith('board_')){WodBoardArt.unit(ctx,skin.slice(6),unit,radius,color,wodGetRenderPeriod());return;}
    const premium = WodStoreCatalog.premiumBase(skin);
    if(premium) { wodDrawPremiumChip(ctx, unit, radius, color, premium === 'supporterGold'); return; }
    if(WOD_RUSE_SKIN_IDS.includes(skin)) { drawRuseChip(ctx, unit, radius, skin); return; }
    if(WOD_SPECIALIST_UNITS[unit.type]&&skin!=='nato'){
        if(skin==='atlasUnits'&&unit.type==='motorized'&&wodGetRenderPeriod()==='modern'){
            const r=radius;ctx.save();ctx.rotate(getUnitFacingAngle(unit)+Math.PI/2);ctx.fillStyle='#182126';for(const x of [-.48,.48])for(const y of [-.52,.05,.49]){ctx.fillRect(x*r-r*.12,y*r-r*.11,r*.24,r*.22);}
            ctx.fillStyle=color;ctx.strokeStyle='#202d2e';ctx.lineWidth=Math.max(1,r*.08);roundRect(ctx,-r*.43,-r*.72,r*.86,r*1.38,r*.1);ctx.fill();ctx.stroke();ctx.fillStyle='#365864';ctx.fillRect(-r*.32,-r*.57,r*.64,r*.23);ctx.fillStyle='#b9ab83';ctx.fillRect(-r*.33,-r*.14,r*.66,r*.66);ctx.restore();
        }else wodDrawUnitBodyUncached(ctx,{...unit,type:unit.type==='motorized'?'heavy':'light'},radius,color,skin);
        ctx.save();ctx.translate(radius*.57,-radius*.59);ctx.fillStyle='#15232b';ctx.strokeStyle='#ead9a6';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(0,0,radius*.46,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.strokeStyle='#f5edce';ctx.lineWidth=Math.max(1,radius*.08);
        wodDrawSpecialistMark(ctx,unit.type,radius*.6);
        ctx.restore();return;
    }
    if(unit.type==='supply'){if(skin==='atlasUnits')wodDrawSupplyVessel(ctx,unit,radius,color);else wodDrawUnitBodyUncached(ctx,{...unit,type:'transport'},radius,color,skin);wodDrawSupplyBadge(ctx,radius);return;}
    if(skin==='atlasUnits') {
        if(unit.type==='transport')wodDrawTransport(ctx,unit,radius,color);
        else wodDrawHdUnit(ctx,unit,radius,color);
        return;
    }
    // Transports inherit the pack's body, frame and emblem. A small cargo
    // badge distinguishes them from warships without replacing the skin.
    if(unit.type==='transport' && skin!=='nato' && skin!=='napoleonic') {
        wodDrawUnitBodyUncached(ctx,{...unit,type:'ship'},radius,color,skin);
        wodDrawTransportBadge(ctx,radius,color);
        return;
    }
    if(skin === 'goldenChip') {
        drawGoldenChipUnit(ctx, unit, radius, color);
        return;
    }
    if(WOD_COUNTRYBALL_SKIN_IDS.includes(skin)) {
        drawCountryBall(ctx, skin, radius, wodSkinShapeType(unit));
        return;
    }
    if(WOD_RUSE_SKIN_IDS.includes(skin)) {
        drawRuseChip(ctx, unit, radius, skin);
        return;
    }
    if(WOD_ANCIENT_CIV_SKIN_IDS.includes(skin)) {
        drawPeriodCounter(ctx, unit, radius, color, 'ancient', skin);
        return;
    }
    if(WOD_PERIOD_SKIN_IDS.includes(skin)) {
        drawPeriodCounter(ctx, unit, radius, color, skin);
        return;
    }
    drawNatoCounter(ctx, unit, radius, color);
}
function wodEnsureUnitBodySprite(unit, radius, color) {
    let skin = getEffectiveUnitSkin(unit);
    let rQ = Math.round((radius || 10) * 2) / 2;
    let type = unit.type || 'light';
    let faceQ = 0;
    if(skin==='atlasUnits' || (wodIsNavalType(type) && skin === 'goldenChip')) {
        let ang = (typeof getUnitFacingAngle === 'function') ? getUnitFacingAngle(unit) : 0;
        faceQ = Math.round(ang / (Math.PI / 16)) & 31;
    }
    let key = (unit.isGeneral?'general:':'')+(WOD_ANCIENT_CIV_SKIN_IDS.includes(skin)?'emblem'+(globalThis.WOD_ANCIENT_CIV_ART_REVISION||0)+':':'')+((skin.startsWith('board_')||skin==='atlasUnits'||WodStoreCatalog.premiumBase(skin)||WOD_RUSE_SKIN_IDS.includes(skin)||WOD_SPECIALIST_UNITS[type])?wodGetRenderPeriod()+':':'')+skin + '|' + type + '|' + (color || '') + '|' + rQ + '|' + faceQ +
        (unit.convoySeaRoute ? '|s' : '')+(unit.cargo?'|cargo:'+unit.cargo.type:'|empty');
    let cache = gameData._unitSpriteCache;
    if(!cache) cache = gameData._unitSpriteCache = new Map();
    let hit = cache.get(key);
    if(hit) return hit;
    let pad = Math.ceil(Math.max(16, rQ * 2.2));
    let tw = Math.ceil(rQ * 4.2 + pad * 2);
    let th = Math.ceil(rQ * 4.4 + pad * 2);
    let scale = 2;
    let c = document.createElement('canvas');
    c.width = Math.max(2, tw * scale);
    c.height = Math.max(2, th * scale);
    let cctx = c.getContext('2d');
    cctx.scale(scale, scale);
    cctx.translate(tw * 0.5, th * 0.5);
    wodDrawUnitBodyUncached(cctx, unit, rQ, color, skin);
    let rec = { c: c, ox: tw * 0.5, oy: th * 0.5, dw: tw, dh: th };
    if(cache.size > 280) {
        let first = cache.keys().next().value;
        if(first != null) cache.delete(first);
    }
    cache.set(key, rec);
    return rec;
}
function wodCrowdedUnitMarkerRadius(unit) {
    // Crowd spacing is solved by movement, never by resizing the art.
    // Crossing density thresholds used to make marching armies pulse.
    return unit.radius||10;
}
function drawUnitSkin(ctx, unit, radius, color) {
    let spr = wodEnsureUnitBodySprite(unit, radius, color);
    if(spr) {
        ctx.drawImage(spr.c, -spr.ox, -spr.oy, spr.dw, spr.dh);
        if(unit.moraleBroken&&unit.type!=='convoy'){
            if(!spr.routed){
                const c=document.createElement('canvas');c.width=spr.c.width;c.height=spr.c.height;
                const g=c.getContext('2d');g.filter='brightness(8) grayscale(1)';g.drawImage(spr.c,0,0);spr.routed=c;
            }
            ctx.save();ctx.globalAlpha*=Math.sin(performance.now()*.012+((unit.uid||'').length*.31))*.5+.5;
            ctx.drawImage(spr.routed,-spr.ox,-spr.oy,spr.dw,spr.dh);ctx.restore();
        }
        return true;
    }
    wodDrawUnitBodyUncached(ctx, unit, radius, color, getEffectiveUnitSkin(unit));
    return true;
}
function wodSkinCardPreviewSize() {
    if(window.matchMedia('(orientation: portrait)').matches && window.innerWidth <= 640)
        return { w: 168, h: 105 };
    if(window.matchMedia('(max-width: 900px)').matches)
        return { w: 148, h: 96 };
    return { w: 120, h: 80 };
}
const WOD_LINE_COLOR_PRESETS = [
    { id: 'black', label: 'Black', rgb: [5, 5, 5], shopId: null },
    { id: 'gold', label: 'Gold', rgb: [212, 175, 55], shopId: 'viz_color_gold' },
    { id: 'white', label: 'White', rgb: [236, 240, 241], shopId: 'viz_color_white' },
    { id: 'red', label: 'Red', rgb: [192, 57, 43], shopId: 'viz_color_red' },
    { id: 'blue', label: 'Blue', rgb: [41, 128, 185], shopId: 'viz_color_blue' }
];
const WOD_SHOP_VISUAL_COST = 500;
const WOD_MISSIONS_DIR = 'missions/';
const WOD_SHOP_MAPS_DIR = 'custom-maps/';
function wodSyncSetupControlsFromLoadedMap() {
    let ms = document.getElementById('setupMapSize');
    let radius = gameData.mapRadius || 60;
    if(ms) {
        let val = String(radius);
        if(ms.value !== val) ms.value = val;
    }
    wodApplyMapSizePreset(radius);
    let shape = gameData.mapShape || 'island';
    let shapeEl = document.getElementById('setupMapShape');
    if(shapeEl) {
        let has = false;
        for(let i = 0; i < shapeEl.options.length; i++) {
            if(shapeEl.options[i].value === shape) { has = true; break; }
        }
        if(!has && shape !== 'custom') {
            let opt = document.createElement('option');
            opt.value = shape;
            opt.textContent = shape;
            shapeEl.appendChild(opt);
        }
        shapeEl.value = shape;
    }
}
