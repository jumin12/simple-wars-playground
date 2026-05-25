/**
 * Ancient civilization unit-counter emblems — SVG art in skins/art/ with player-color tinting.
 */
(function (global) {
    const WOD_ANCIENT_CIV_ART = {
        civRome: {
            file: 'skins/art/rome1.svg',
            label: 'Rome — Vexilloid eagle',
            fill: '#6e1210', fillHi: '#9a1c18', rim: '#e8c84a', rimInner: '#4a0806',
            emblem: '#f5e6a8', emblemStroke: '#2a0604', emblemHi: '#fff8dc'
        },
        civRome2: {
            file: 'skins/art/rome2.svg',
            label: 'Rome — Imperial eagle',
            fill: '#6e1210', fillHi: '#9a1c18', rim: '#e8c84a', rimInner: '#4a0806',
            emblem: '#f5e6a8', emblemStroke: '#2a0604', emblemHi: '#fff8dc'
        },
        civCarthage: {
            file: 'skins/art/carthage1.svg',
            label: 'Carthage — Tanit',
            fill: '#5c2d68', fillHi: '#7a4490', rim: '#d4b878', rimInner: '#3e1e48',
            emblem: '#f2ebe0', emblemStroke: '#1e0c28', emblemHi: '#ffffff'
        },
        civCarthage2: {
            file: 'skins/art/carthage2.svg',
            label: 'Carthage — Tanit outline',
            fill: '#5c2d68', fillHi: '#7a4490', rim: '#d4b878', rimInner: '#3e1e48',
            emblem: '#f2ebe0', emblemStroke: '#1e0c28', emblemHi: '#ffffff'
        },
        civGaul: {
            file: 'skins/art/gaul1.svg',
            label: 'Gaul — Triskelion',
            fill: '#1e4a2c', fillHi: '#2d6640', rim: '#ddb840', rimInner: '#123420',
            emblem: '#f2d858', emblemStroke: '#0c2418', emblemHi: '#fff4b0'
        },
        civEgypt: {
            file: 'skins/art/egypt1.svg',
            label: 'Egypt — Ankh',
            fill: '#8b6914', fillHi: '#b08828', rim: '#d4af37', rimInner: '#5c4010',
            emblem: '#fff4c8', emblemStroke: '#1a1408', emblemHi: '#ffffff'
        },
        civEgypt2: {
            file: 'skins/art/egypt2.svg',
            label: 'Egypt — Eye of Horus',
            fill: '#1a4a6e', fillHi: '#286890', rim: '#c9a227', rimInner: '#0e2840',
            emblem: '#f0e8d0', emblemStroke: '#0a1828', emblemHi: '#ffffff'
        },
        civMacedon: {
            file: 'skins/art/macedon1.svg',
            label: 'Macedon — Vergina sun',
            fill: '#1a2848', fillHi: '#283868', rim: '#d4af37', rimInner: '#0e1830',
            emblem: '#f5e6a8', emblemStroke: '#0a1020', emblemHi: '#fff8dc'
        },
        civMacedon2: {
            file: 'skins/art/macedon2.svg',
            label: 'Macedon — Vergina sun (B&W)',
            fill: '#1a2848', fillHi: '#283868', rim: '#d4af37', rimInner: '#0e1830',
            emblem: '#f5e6a8', emblemStroke: '#0a1020', emblemHi: '#fff8dc'
        },
        civSparta: {
            file: 'skins/art/sparta1.svg',
            label: 'Sparta — Lambda',
            fill: '#8b2020', fillHi: '#b03030', rim: '#c9a227', rimInner: '#5c1010',
            emblem: '#f5e6c8', emblemStroke: '#1a0808', emblemHi: '#ffffff'
        },
        civSparta2: {
            file: 'skins/art/sparta2.svg',
            label: 'Sparta — Lambda shield',
            fill: '#8b2020', fillHi: '#b03030', rim: '#c9a227', rimInner: '#5c1010',
            emblem: '#f5e6c8', emblemStroke: '#1a0808', emblemHi: '#ffffff'
        }
    };

    const WOD_ANCIENT_CIV_SKIN_IDS = Object.keys(WOD_ANCIENT_CIV_ART);
    const WOD_EMBLEM_CANVAS = 512;
    const WOD_EMBLEM_PAD = 0.11;
    /** emblem half-size as a fraction of unit counter radius (fits inside inner ring) */
    const WOD_CHIP_EMBLEM_RATIO = 0.68;

    const _svgRaw = Object.create(null);
    const _svgNormalized = Object.create(null);
    const _imgCache = Object.create(null);
    const _pendingKeys = new Set();
    let _repaintScheduled = false;

    function wodHexBlend(a, b, t) {
        t = Math.max(0, Math.min(1, t));
        let parse = (h) => {
            h = (h || '#000000').replace('#', '');
            if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
            return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
        };
        let ca = parse(a), cb = parse(b);
        let r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
        let g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
        let bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
        return '#' + [r, g, bl].map(v => v.toString(16).padStart(2, '0')).join('');
    }

    function wodParseSvgViewBox(svgText) {
        let m = svgText.match(/viewBox\s*=\s*["']([^"']+)["']/i);
        if (m) {
            let p = m[1].trim().split(/[\s,]+/).map(Number);
            if (p.length >= 4 && p.every(n => isFinite(n) && n !== 0 || n === 0)) {
                return { x: p[0], y: p[1], w: Math.abs(p[2]), h: Math.abs(p[3]) };
            }
        }
        let wM = svgText.match(/\bwidth\s*=\s*["']([\d.]+)/i);
        let hM = svgText.match(/\bheight\s*=\s*["']([\d.]+)/i);
        if (wM && hM) {
            let w = parseFloat(wM[1]), h = parseFloat(hM[1]);
            if (w > 0 && h > 0) return { x: 0, y: 0, w, h };
        }
        return { x: 0, y: 0, w: WOD_EMBLEM_CANVAS, h: WOD_EMBLEM_CANVAS };
    }

    function wodExtractSvgInner(svgText) {
        let start = svgText.search(/<svg[\s>]/i);
        if (start < 0) return svgText;
        let openEnd = svgText.indexOf('>', start);
        if (openEnd < 0) return svgText;
        let close = svgText.lastIndexOf('</svg>');
        if (close < 0) return svgText.slice(openEnd + 1);
        return svgText.slice(openEnd + 1, close).trim();
    }

    function wodNormalizeSvg(svgText) {
        let vb = wodParseSvgViewBox(svgText);
        let inner = wodExtractSvgInner(svgText);
        let target = WOD_EMBLEM_CANVAS;
        let innerSize = target * (1 - 2 * WOD_EMBLEM_PAD);
        let scale = Math.min(innerSize / vb.w, innerSize / vb.h);
        let cx = vb.x + vb.w / 2;
        let cy = vb.y + vb.h / 2;
        let tx = target / 2 - cx * scale;
        let ty = target / 2 - cy * scale;
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + target + ' ' + target + '" width="' + target + '" height="' + target + '">' +
            '<g transform="translate(' + tx.toFixed(3) + ',' + ty.toFixed(3) + ') scale(' + scale.toFixed(6) + ')">' +
            inner + '</g></svg>';
    }

    function wodAncientCivPalette(civId) {
        let art = WOD_ANCIENT_CIV_ART[civId];
        if (!art) return null;
        return {
            fill: art.fill, fillHi: art.fillHi, rim: art.rim, rimInner: art.rimInner,
            emblem: art.emblem, emblemStroke: art.emblemStroke, emblemHi: art.emblemHi
        };
    }

    function wodAncientCivEmblemTint(pal, playerColor, owner) {
        let blend = owner === 1 ? 0.34 : 0.5;
        return {
            emblem: wodHexBlend(pal.emblem, playerColor, blend),
            emblemStroke: wodHexBlend(pal.emblemStroke, playerColor, Math.min(0.62, blend + 0.1)),
            emblemHi: wodHexBlend(pal.emblemHi, playerColor, Math.max(0.14, blend - 0.14))
        };
    }

    function wodRecolorSvg(svgText, emblem, emblemStroke, emblemHi) {
        let s = svgText;
        s = s.replace(/fill:\s*#(?:9[bB]000[bB]|8[bB]0000|cc0000|ff0000|700010|800080|a00000)/gi, 'fill:none');
        s = s.replace(/fill="(?:#(?:9[bB]000[bB]|8[bB]0000|cc0000|ff0000))"/gi, 'fill="none"');
        s = s.replace(/fill:\s*#(?:000(?:000)?|111(?:111)?|222(?:222)?|1a1a1a|2a0604)/gi, 'fill:' + emblem);
        s = s.replace(/fill="#(?:000(?:000)?|111(?:111)?|222(?:222)?)"/gi, 'fill="' + emblem + '"');
        s = s.replace(/fill='#(?:000(?:000)?|111(?:111)?)'/gi, "fill='" + emblem + "'");
        s = s.replace(/fill:\s*black\b/gi, 'fill:' + emblem);
        s = s.replace(/fill:#000000/gi, 'fill:' + emblem);
        s = s.replace(/fill:#000\b/gi, 'fill:' + emblem);
        s = s.replace(/fill:\s*#(?:fff(?:fff)?|ffffff)\b/gi, 'fill:' + emblemHi);
        s = s.replace(/fill="#(?:fff(?:fff)?)"/gi, 'fill="' + emblemHi + '"');
        s = s.replace(/fill='#(?:fff(?:fff)?)'/gi, "fill='" + emblemHi + "'");
        s = s.replace(/stroke:\s*#(?:000(?:000)?|111(?:111)?)/gi, 'stroke:' + emblemStroke);
        s = s.replace(/stroke="#(?:000(?:000)?|111(?:111)?)"/gi, 'stroke="' + emblemStroke + '"');
        s = s.replace(/stroke='#(?:000(?:000)?)'/gi, "stroke='" + emblemStroke + "'");
        s = s.replace(/stroke:#000(?:000)?/gi, 'stroke:' + emblemStroke);
        s = s.replace(/stroke:\s*black\b/gi, 'stroke:' + emblemStroke);
        /* filled silhouettes only — skip stroke-only shapes */
        s = s.replace(/<path(?![^>]*\bfill=)(?![^>]*\bstroke=)([^>]*)\/>/gi, '<path fill="' + emblem + '"$1/>');
        s = s.replace(/<path(?![^>]*\bfill=)(?![^>]*\bstroke=)([^>]*)>/gi, '<path fill="' + emblem + '"$1>');
        s = s.replace(/<text(?![^>]*\bfill=)([^>]*)>/gi, '<text fill="' + emblem + '"$1>');
        return s;
    }

    function wodEmblemCacheKey(skinId, tint) {
        return skinId + '|' + tint.emblem + '|' + tint.emblemStroke + '|' + tint.emblemHi;
    }

    function wodScheduleAncientCivRepaint() {
        if (_repaintScheduled) return;
        _repaintScheduled = true;
        requestAnimationFrame(() => {
            _repaintScheduled = false;
            if (typeof global.renderSkinShopGridCanvases === 'function') global.renderSkinShopGridCanvases();
            if (typeof global.renderShopArmyCanvases === 'function') global.renderShopArmyCanvases();
        });
    }

    async function wodLoadAncientCivSvg(skinId) {
        if (_svgNormalized[skinId]) return;
        let art = WOD_ANCIENT_CIV_ART[skinId];
        if (!art) return;
        try {
            let resp = await fetch(art.file);
            if (resp.ok) {
                _svgRaw[skinId] = await resp.text();
                _svgNormalized[skinId] = wodNormalizeSvg(_svgRaw[skinId]);
            }
        } catch (e) { /* offline / file:// */ }
    }

    function wodBuildEmblemImage(skinId, tint) {
        let key = wodEmblemCacheKey(skinId, tint);
        if (_imgCache[key]) return Promise.resolve(_imgCache[key]);
        if (_pendingKeys.has(key)) {
            return new Promise(resolve => {
                let tries = 0;
                let poll = () => {
                    if (_imgCache[key]) resolve(_imgCache[key]);
                    else if (++tries > 120) resolve(null);
                    else requestAnimationFrame(poll);
                };
                poll();
            });
        }
        let base = _svgNormalized[skinId];
        if (!base) return Promise.resolve(null);
        _pendingKeys.add(key);
        return new Promise(resolve => {
            let colored = wodRecolorSvg(base, tint.emblem, tint.emblemStroke, tint.emblemHi);
            let blob = new Blob([colored], { type: 'image/svg+xml;charset=utf-8' });
            let url = URL.createObjectURL(blob);
            let img = new Image();
            img.onload = () => {
                _imgCache[key] = img;
                _pendingKeys.delete(key);
                URL.revokeObjectURL(url);
                wodScheduleAncientCivRepaint();
                resolve(img);
            };
            img.onerror = () => {
                _pendingKeys.delete(key);
                URL.revokeObjectURL(url);
                resolve(null);
            };
            img.src = url;
        });
    }

    function wodEnsureAncientCivEmblemImage(skinId, tint) {
        wodBuildEmblemImage(skinId, tint);
    }

    async function wodPreloadAncientCivArt() {
        await Promise.all(WOD_ANCIENT_CIV_SKIN_IDS.map(wodLoadAncientCivSvg));
        let playerColor = (global.factionColors && global.factionColors[1]) || '#2ecc71';
        await Promise.all(WOD_ANCIENT_CIV_SKIN_IDS.map(id => {
            let pal = wodAncientCivPalette(id);
            if (!pal) return Promise.resolve();
            return wodBuildEmblemImage(id, wodAncientCivEmblemTint(pal, playerColor, 1));
        }));
        wodScheduleAncientCivRepaint();
    }

    function wodPaintAncientCivEmblem(ctx, civId, radius, playerColor, owner) {
        let pal = wodAncientCivPalette(civId);
        if (!pal) return;
        let tint = wodAncientCivEmblemTint(pal, playerColor || '#2ecc71', owner == null ? 1 : owner);
        wodEnsureAncientCivEmblemImage(civId, tint);
        let img = _imgCache[wodEmblemCacheKey(civId, tint)];
        if (!img || !img.complete || !img.naturalWidth) return;
        ctx.save();
        let art = WOD_ANCIENT_CIV_ART[civId];
        let scaleMul = (art && art.emblemScale) || 1;
        let half = radius * WOD_CHIP_EMBLEM_RATIO * scaleMul;
        ctx.imageSmoothingEnabled = true;
        if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, -half, -half, half * 2, half * 2);
        ctx.restore();
    }

    function wodAncientCivShopMetaList() {
        return WOD_ANCIENT_CIV_SKIN_IDS.map(id => ({
            id,
            label: WOD_ANCIENT_CIV_ART[id].label
        }));
    }

    global.WOD_ANCIENT_CIV_ART = WOD_ANCIENT_CIV_ART;
    global.WOD_ANCIENT_CIV_SKIN_IDS = WOD_ANCIENT_CIV_SKIN_IDS;
    global.wodAncientCivPalette = wodAncientCivPalette;
    global.wodPaintAncientCivEmblem = wodPaintAncientCivEmblem;
    global.wodPreloadAncientCivArt = wodPreloadAncientCivArt;
    global.wodAncientCivShopMetaList = wodAncientCivShopMetaList;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
