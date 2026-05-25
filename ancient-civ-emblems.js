/**
 * Ancient civilization unit-counter emblems — SVG art in skins/art/ with player-color tinting.
 */
(function (global) {
    const WOD_ANCIENT_CIV_ART = {
        civRome: {
            file: 'skins/art/rome1.svg',
            label: 'Rome — Vexilloid eagle',
            fill: '#6e1210', fillHi: '#9a1c18', rim: '#e8c84a', rimInner: '#4a0806',
            emblem: '#f5e6a8', emblemStroke: '#2a0604', emblemHi: '#fff8dc',
            emblemPad: 0.84, emblemScale: 0.66
        },
        civRome2: {
            file: 'skins/art/rome2.svg',
            label: 'Rome — Imperial eagle',
            fill: '#6e1210', fillHi: '#9a1c18', rim: '#e8c84a', rimInner: '#4a0806',
            emblem: '#f5e6a8', emblemStroke: '#2a0604', emblemHi: '#fff8dc',
            emblemPad: 0.80, emblemScale: 0.66
        },
        civCarthage: {
            file: 'skins/art/carthage1.svg',
            label: 'Carthage — Tanit',
            fill: '#5c2d68', fillHi: '#7a4490', rim: '#d4b878', rimInner: '#3e1e48',
            emblem: '#f2ebe0', emblemStroke: '#1e0c28', emblemHi: '#ffffff',
            emblemScale: 0.66
        },
        civCarthage2: {
            file: 'skins/art/carthage2.svg',
            label: 'Carthage — Tanit outline',
            fill: '#5c2d68', fillHi: '#7a4490', rim: '#d4b878', rimInner: '#3e1e48',
            emblem: '#f2ebe0', emblemStroke: '#1e0c28', emblemHi: '#ffffff',
            strokeOnly: true, emblemScale: 0.66
        },
        civGaul: {
            file: 'skins/art/gaul1.svg',
            label: 'Gaul — Triskelion',
            fill: '#1e4a2c', fillHi: '#2d6640', rim: '#ddb840', rimInner: '#123420',
            emblem: '#f2d858', emblemStroke: '#0c2418', emblemHi: '#fff4b0',
            emblemPad: 0.88, emblemScale: 0.66
        },
        civEgypt: {
            file: 'skins/art/egypt1.svg',
            label: 'Egypt — Ankh',
            fill: '#8b6914', fillHi: '#b08828', rim: '#d4af37', rimInner: '#5c4010',
            emblem: '#fff4c8', emblemStroke: '#1a1408', emblemHi: '#ffffff',
            emblemPad: 0.90, emblemScale: 0.66
        },
        civEgypt2: {
            file: 'skins/art/egypt2.svg',
            label: 'Egypt — Eye of Horus',
            fill: '#1a4a6e', fillHi: '#286890', rim: '#c9a227', rimInner: '#0e2840',
            emblem: '#f0e8d0', emblemStroke: '#0a1828', emblemHi: '#ffffff',
            emblemPad: 0.86, emblemScale: 0.66
        },
        civMacedon: {
            file: 'skins/art/macedon1.svg',
            label: 'Macedon — Vergina sun',
            fill: '#1a2848', fillHi: '#283868', rim: '#d4af37', rimInner: '#0e1830',
            emblem: '#f5e6a8', emblemStroke: '#0a1020', emblemHi: '#fff8dc',
            emblemScale: 0.66
        },
        civMacedon2: {
            file: 'skins/art/macedon2.svg',
            label: 'Macedon — Vergina sun (B&W)',
            fill: '#1a2848', fillHi: '#283868', rim: '#d4af37', rimInner: '#0e1830',
            emblem: '#f5e6a8', emblemStroke: '#0a1020', emblemHi: '#fff8dc',
            emblemScale: 0.66
        },
        civSparta: {
            file: 'skins/art/sparta1.svg',
            label: 'Sparta — Lambda',
            fill: '#8b2020', fillHi: '#b03030', rim: '#c9a227', rimInner: '#5c1010',
            emblem: '#f5e6c8', emblemStroke: '#1a0808', emblemHi: '#ffffff',
            emblemScale: 0.66
        },
        civSparta2: {
            file: 'skins/art/sparta2.svg',
            label: 'Sparta — Lambda shield',
            fill: '#8b2020', fillHi: '#b03030', rim: '#c9a227', rimInner: '#5c1010',
            emblem: '#f5e6c8', emblemStroke: '#1a0808', emblemHi: '#ffffff',
            strokeOnly: true, emblemScale: 0.66
        }
    };

    const WOD_ANCIENT_CIV_SKIN_IDS = Object.keys(WOD_ANCIENT_CIV_ART);
    const WOD_EMBLEM_RASTER_SIZE = 512;

    const _svgRaw = Object.create(null);
    const _svgBounds = Object.create(null);
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
            if (p.length === 4 && p.every(n => Number.isFinite(n))) return { x: p[0], y: p[1], w: p[2], h: p[3] };
        }
        let wm = svgText.match(/\bwidth\s*=\s*["']([\d.]+)/i);
        let hm = svgText.match(/\bheight\s*=\s*["']([\d.]+)/i);
        if (wm && hm) return { x: 0, y: 0, w: +wm[1], h: +hm[1] };
        return { x: 0, y: 0, w: 512, h: 512 };
    }

    function wodExtractSvgInner(svgText) {
        return svgText
            .replace(/<\?xml[^?]*\?>/gi, '')
            .replace(/<!DOCTYPE[^>]*>/gi, '')
            .replace(/<svg[^>]*>/i, '')
            .replace(/<\/svg>\s*$/i, '');
    }

    function wodMeasureSvgBounds(svgText) {
        return new Promise((resolve) => {
            if (typeof document === 'undefined') { resolve(null); return; }
            try {
                let wrap = document.createElement('div');
                wrap.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;visibility:hidden;pointer-events:none';
                document.body.appendChild(wrap);
                wrap.innerHTML = svgText;
                let svg = wrap.querySelector('svg');
                if (!svg) {
                    document.body.removeChild(wrap);
                    resolve(null);
                    return;
                }
                let bb;
                try { bb = svg.getBBox(); } catch (e) { bb = null; }
                document.body.removeChild(wrap);
                if (!bb || bb.width < 1 || bb.height < 1) resolve(null);
                else resolve({ x: bb.x, y: bb.y, w: bb.width, h: bb.height });
            } catch (e) {
                resolve(null);
            }
        });
    }

    function wodNormalizeSvg(svgText, bounds, pad) {
        pad = pad == null ? 0.86 : pad;
        let vb = bounds || wodParseSvgViewBox(svgText);
        let inner = wodExtractSvgInner(svgText);
        let size = WOD_EMBLEM_RASTER_SIZE;
        let scale = Math.min(size / vb.w, size / vb.h) * pad;
        let tx = (size - vb.w * scale) / 2 - vb.x * scale;
        let ty = (size - vb.h * scale) / 2 - vb.y * scale;
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '">' +
            '<g transform="translate(' + tx + ',' + ty + ') scale(' + scale + ')">' + inner + '</g></svg>';
    }

    function wodRecolorSvg(svgText, emblem, emblemStroke, emblemHi, strokeOnly) {
        let s = svgText;
        s = s.replace(/fill:\s*#(?:9[bB]000[bB]|8[bB]0000|cc0000|ff0000|700010|800080|a00000)/gi, 'fill:none');
        s = s.replace(/fill="(?:#(?:9[bB]000[bB]|8[bB]0000|cc0000|ff0000))"/gi, 'fill="none"');

        let darkFill = /#(?:000(?:000)?|111(?:111)?|222(?:222)?|1a1a1a|2a0604)\b|black/gi;
        let lightFill = /#(?:fff(?:fff)?|ffffff)\b|white/gi;
        let darkStroke = /#(?:000(?:000)?|111(?:111)?)\b|black/gi;

        if (strokeOnly) {
            s = s.replace(/stroke:\s*#(?:000(?:000)?|111(?:111)?)/gi, 'stroke:' + emblemStroke);
            s = s.replace(/stroke="#(?:000(?:000)?|111(?:111)?)"/gi, 'stroke="' + emblemStroke + '"');
            s = s.replace(/stroke='#(?:000(?:000)?|111(?:111)?)'/gi, "stroke='" + emblemStroke + "'");
            s = s.replace(/stroke:#000(?:000)?/gi, 'stroke:' + emblemStroke);
            s = s.replace(/stroke:\s*black\b/gi, 'stroke:' + emblemStroke);
            return s;
        }

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
        s = s.replace(/stroke="#(?:000(?:000)?)"/gi, 'stroke="' + emblemStroke + '"');
        s = s.replace(/stroke:#000(?:000)?/gi, 'stroke:' + emblemStroke);
        s = s.replace(/stroke:\s*black\b/gi, 'stroke:' + emblemStroke);

        s = s.replace(/(<(?:path|circle|rect|ellipse|polygon|polyline|text|tspan))(?![^>]*\bfill=)([^>]*?\/>)/gi,
            '$1 fill="' + emblem + '"$2');
        s = s.replace(/(<(?:path|circle|rect|ellipse|polygon|polyline|text|tspan))(?![^>]*\bfill=)([^>]*?>)/gi,
            '$1 fill="' + emblem + '"$2');

        s = s.replace(/fill="none" fill="/gi, 'fill="');
        s = s.replace(/fill='none' fill='/gi, "fill='");
        return s;
    }

    function wodEmblemCacheKey(skinId, tint) {
        return skinId + '|v2|' + tint.emblem + '|' + tint.emblemStroke + '|' + tint.emblemHi;
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

    async function wodEnsureSvgBounds(skinId) {
        if (_svgBounds[skinId]) return _svgBounds[skinId];
        let art = WOD_ANCIENT_CIV_ART[skinId];
        if (art && art.viewBox) {
            _svgBounds[skinId] = art.viewBox;
            return _svgBounds[skinId];
        }
        let raw = _svgRaw[skinId];
        if (!raw) return null;
        let measured = await wodMeasureSvgBounds(raw);
        _svgBounds[skinId] = measured || wodParseSvgViewBox(raw);
        return _svgBounds[skinId];
    }

    async function wodLoadAncientCivSvg(skinId) {
        if (_svgRaw[skinId]) return;
        let art = WOD_ANCIENT_CIV_ART[skinId];
        if (!art) return;
        try {
            let resp = await fetch(art.file);
            if (resp.ok) {
                _svgRaw[skinId] = await resp.text();
                await wodEnsureSvgBounds(skinId);
            }
        } catch (e) { /* offline / file:// */ }
    }

    async function wodPreloadAncientCivArt() {
        await Promise.all(WOD_ANCIENT_CIV_SKIN_IDS.map(wodLoadAncientCivSvg));
        wodScheduleAncientCivRepaint();
    }

    function wodRasterizeSvgToCanvas(svgText, cb) {
        let blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
        let url = URL.createObjectURL(blob);
        let img = new Image();
        img.onload = () => {
            let c = document.createElement('canvas');
            c.width = WOD_EMBLEM_RASTER_SIZE;
            c.height = WOD_EMBLEM_RASTER_SIZE;
            let cx = c.getContext('2d');
            cx.clearRect(0, 0, c.width, c.height);
            cx.imageSmoothingEnabled = true;
            if (cx.imageSmoothingQuality) cx.imageSmoothingQuality = 'high';
            cx.drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            cb(c);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            cb(null);
        };
        img.src = url;
    }

    async function wodEnsureAncientCivEmblemImage(skinId, tint) {
        let key = wodEmblemCacheKey(skinId, tint);
        if (_imgCache[key] || _pendingKeys.has(key)) return;
        let raw = _svgRaw[skinId];
        if (!raw) {
            await wodLoadAncientCivSvg(skinId);
            raw = _svgRaw[skinId];
        }
        if (!raw) return;

        _pendingKeys.add(key);
        let art = WOD_ANCIENT_CIV_ART[skinId];
        let bounds = await wodEnsureSvgBounds(skinId);
        let normalized = wodNormalizeSvg(raw, bounds, art.emblemPad);
        let colored = wodRecolorSvg(normalized, tint.emblem, tint.emblemStroke, tint.emblemHi, !!art.strokeOnly);
        wodRasterizeSvgToCanvas(colored, (canvas) => {
            _pendingKeys.delete(key);
            if (canvas) _imgCache[key] = canvas;
            wodScheduleAncientCivRepaint();
        });
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

    function wodPaintAncientCivEmblem(ctx, civId, radius, playerColor, owner) {
        let art = WOD_ANCIENT_CIV_ART[civId];
        let pal = wodAncientCivPalette(civId);
        if (!art || !pal) return;
        let tint = wodAncientCivEmblemTint(pal, playerColor || '#2ecc71', owner == null ? 1 : owner);
        wodEnsureAncientCivEmblemImage(civId, tint);
        let canvas = _imgCache[wodEmblemCacheKey(civId, tint)];
        if (!canvas) return;
        ctx.save();
        let fit = radius * (art.emblemScale == null ? 0.66 : art.emblemScale);
        ctx.imageSmoothingEnabled = true;
        if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, -fit, -fit, fit * 2, fit * 2);
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
