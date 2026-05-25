/**
 * Ancient civilization unit-counter emblems — SVG art in skins/art/ with player-color tinting.
 * Shop sells civilization packs (200g for two emblem styles; Gaul is 100g for one).
 */
(function (global) {
    const WOD_ANCIENT_CIV_ART = {
        civRome: {
            file: 'skins/art/rome1.svg',
            label: 'Rome — Eagle',
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
            label: 'Macedon — Vergina sun (outline)',
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
            label: 'Sparta — Lambda in circle',
            fill: '#8b2020', fillHi: '#b03030', rim: '#c9a227', rimInner: '#5c1010',
            emblem: '#f5e6c8', emblemStroke: '#1a0808', emblemHi: '#ffffff'
        }
    };

    const WOD_ANCIENT_CIV_PACKS = {
        civRome: {
            cost: 200,
            shopLabel: 'Rome — 2 emblems',
            preview: 'civRome',
            variants: ['civRome', 'civRome2']
        },
        civCarthage: {
            cost: 200,
            shopLabel: 'Carthage — 2 emblems',
            preview: 'civCarthage',
            variants: ['civCarthage', 'civCarthage2']
        },
        civEgypt: {
            cost: 200,
            shopLabel: 'Egypt — 2 emblems',
            preview: 'civEgypt',
            variants: ['civEgypt', 'civEgypt2']
        },
        civMacedon: {
            cost: 200,
            shopLabel: 'Macedon — 2 emblems',
            preview: 'civMacedon',
            variants: ['civMacedon', 'civMacedon2']
        },
        civSparta: {
            cost: 200,
            shopLabel: 'Sparta — 2 emblems',
            preview: 'civSparta',
            variants: ['civSparta', 'civSparta2']
        },
        civGaul: {
            cost: 100,
            shopLabel: 'Gaul — Triskelion',
            preview: 'civGaul',
            variants: ['civGaul']
        }
    };

    const WOD_ANCIENT_CIV_PACK_IDS = Object.keys(WOD_ANCIENT_CIV_PACKS);
    const WOD_ANCIENT_CIV_SKIN_IDS = Object.keys(WOD_ANCIENT_CIV_ART);

    const _svgRaw = Object.create(null);
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

    function wodAncientCivPackCost(packId) {
        return WOD_ANCIENT_CIV_PACKS[packId] ? WOD_ANCIENT_CIV_PACKS[packId].cost : 100;
    }

    function wodAncientCivPackVariants(packId) {
        let pack = WOD_ANCIENT_CIV_PACKS[packId];
        return pack ? pack.variants.slice() : [];
    }

    function wodGrantAncientCivPack(ownedUnitSkins, packId) {
        if (!ownedUnitSkins || !packId) return;
        ownedUnitSkins[packId] = true;
        for (let variantId of wodAncientCivPackVariants(packId)) ownedUnitSkins[variantId] = true;
    }

    function wodAncientCivPackOwned(ownedUnitSkins, packId) {
        if (!ownedUnitSkins || !packId) return false;
        if (ownedUnitSkins[packId]) return true;
        let variants = wodAncientCivPackVariants(packId);
        return variants.length > 0 && variants.every((id) => !!ownedUnitSkins[id]);
    }

    function wodAncientCivVariantOwned(ownedUnitSkins, variantId) {
        if (!ownedUnitSkins || !variantId) return false;
        if (ownedUnitSkins[variantId]) return true;
        for (let packId of WOD_ANCIENT_CIV_PACK_IDS) {
            let pack = WOD_ANCIENT_CIV_PACKS[packId];
            if (pack.variants.includes(variantId)) return wodAncientCivPackOwned(ownedUnitSkins, packId);
        }
        return false;
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
        s = s.replace(/stroke:\s*#(?:000(?:000)?|111(?:111)?)/gi, 'stroke:' + emblemStroke);
        s = s.replace(/stroke="#(?:000(?:000)?)"/gi, 'stroke="' + emblemStroke + '"');
        s = s.replace(/stroke:#000(?:000)?/gi, 'stroke:' + emblemStroke);
        s = s.replace(/stroke:\s*black\b/gi, 'stroke:' + emblemStroke);
        s = s.replace(/<path(?![^>]*\bfill=)([^>]*)\/>/gi, '<path fill="' + emblem + '"$1/>');
        s = s.replace(/<path(?![^>]*\bfill=)([^>]*)>/gi, '<path fill="' + emblem + '"$1>');
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
        if (_svgRaw[skinId]) return;
        let art = WOD_ANCIENT_CIV_ART[skinId];
        if (!art) return;
        try {
            let resp = await fetch(art.file);
            if (resp.ok) _svgRaw[skinId] = await resp.text();
        } catch (e) { /* offline / file:// */ }
    }

    async function wodPreloadAncientCivArt() {
        await Promise.all(WOD_ANCIENT_CIV_SKIN_IDS.map(wodLoadAncientCivSvg));
        wodScheduleAncientCivRepaint();
    }

    function wodEnsureAncientCivEmblemImage(skinId, tint) {
        let key = wodEmblemCacheKey(skinId, tint);
        if (_imgCache[key] || _pendingKeys.has(key)) return;
        let raw = _svgRaw[skinId];
        if (!raw) {
            wodLoadAncientCivSvg(skinId).then(() => wodEnsureAncientCivEmblemImage(skinId, tint));
            return;
        }
        _pendingKeys.add(key);
        let colored = wodRecolorSvg(raw, tint.emblem, tint.emblemStroke, tint.emblemHi);
        let blob = new Blob([colored], { type: 'image/svg+xml;charset=utf-8' });
        let url = URL.createObjectURL(blob);
        let img = new Image();
        img.onload = () => {
            _imgCache[key] = img;
            _pendingKeys.delete(key);
            URL.revokeObjectURL(url);
            wodScheduleAncientCivRepaint();
        };
        img.onerror = () => {
            _pendingKeys.delete(key);
            URL.revokeObjectURL(url);
        };
        img.src = url;
    }

    function wodPaintAncientCivEmblem(ctx, civId, radius, playerColor, owner) {
        let pal = wodAncientCivPalette(civId);
        if (!pal) return;
        let tint = wodAncientCivEmblemTint(pal, playerColor || '#2ecc71', owner == null ? 1 : owner);
        wodEnsureAncientCivEmblemImage(civId, tint);
        let img = _imgCache[wodEmblemCacheKey(civId, tint)];
        if (!img || !img.complete || !img.naturalWidth) return;
        ctx.save();
        let sz = radius * 1.62;
        ctx.imageSmoothingEnabled = true;
        if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, -sz, -sz, sz * 2, sz * 2);
        ctx.restore();
    }

    function wodAncientCivShopMetaList() {
        return WOD_ANCIENT_CIV_SKIN_IDS.map((id) => ({
            id,
            label: WOD_ANCIENT_CIV_ART[id].label
        }));
    }

    function wodAncientCivShopPackMetaList() {
        return WOD_ANCIENT_CIV_PACK_IDS.map((id) => ({
            id,
            label: WOD_ANCIENT_CIV_PACKS[id].shopLabel,
            preview: WOD_ANCIENT_CIV_PACKS[id].preview,
            cost: WOD_ANCIENT_CIV_PACKS[id].cost
        }));
    }

    global.WOD_ANCIENT_CIV_ART = WOD_ANCIENT_CIV_ART;
    global.WOD_ANCIENT_CIV_PACKS = WOD_ANCIENT_CIV_PACKS;
    global.WOD_ANCIENT_CIV_PACK_IDS = WOD_ANCIENT_CIV_PACK_IDS;
    global.WOD_ANCIENT_CIV_SKIN_IDS = WOD_ANCIENT_CIV_SKIN_IDS;
    global.wodAncientCivPackCost = wodAncientCivPackCost;
    global.wodAncientCivPackVariants = wodAncientCivPackVariants;
    global.wodGrantAncientCivPack = wodGrantAncientCivPack;
    global.wodAncientCivPackOwned = wodAncientCivPackOwned;
    global.wodAncientCivVariantOwned = wodAncientCivVariantOwned;
    global.wodAncientCivPalette = wodAncientCivPalette;
    global.wodPaintAncientCivEmblem = wodPaintAncientCivEmblem;
    global.wodPreloadAncientCivArt = wodPreloadAncientCivArt;
    global.wodAncientCivShopMetaList = wodAncientCivShopMetaList;
    global.wodAncientCivShopPackMetaList = wodAncientCivShopPackMetaList;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
