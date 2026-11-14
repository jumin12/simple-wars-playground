// The Ashen Front campaign: world, panels, battle launch and resolution.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

/* ============================================================================
 * THE ASHEN FRONT — roguelike campaign (v2: fully generated worlds).
 * Every campaign generates its own war map: continent, regions, node graph,
 * names, briefs and garrisons all come from the campaign seed. One persistent
 * army bought with requisition points; losses and veterancy are permanent.
 * A continuous war is simulated between battles. One local save, deletable.
 * ========================================================================== */
const WOD_ROGUE_LS_KEY = 'simplewarsRogueCampaign.v2';
const WOD_ROGUE_LS_KEY_V1 = 'simplewarsRogueCampaign.v1';
const WOD_ROGUE_MAX_ROSTER = 30;
const WOD_ROGUE_UNIT_COSTS = { light: 400, motorized:720,mountaineer:520,marine: 520, heavy: 960, ship: 840, transport:300, supply:360 };
const WOD_ROGUE_UNIT_LABEL = { light: 'Infantry', motorized:'Motorized infantry',mountaineer:'Mountaineers',marine: 'Marines', heavy: 'Armor', ship: 'Warship', transport:'Transport',supply:'Supply ship' };
function wodRogueUnitLabel(type){return WOD_SPECIALIST_UNITS[type]?wodSpecialistLabel(type,wodRogueLoad()?.settings?.gamePeriod||wodGetRenderPeriod()):WOD_ROGUE_UNIT_LABEL[type]||type;}
/** Campaign balance (the former "Normal" difficulty; there is no difficulty
 *  choice). Saves made at another difficulty load and play with these values;
 *  garrisons already baked into a saved world stay as generated.
 *  Opening requisition is WOD_ROGUE_DEFAULT_POINTS; the defense clock is
 *  WOD_ROGUE_BATTLE_HOLD_SEC. */
const WOD_ROGUE_BALANCE = { mult: 1.0, counterChance: 0.55, rewardMult: 1.0, blockChance: 0.38 };
/** Defense-only survival clock; assaults use normal skirmish objectives. */
const WOD_ROGUE_BATTLE_HOLD_SEC = 600;
const WOD_ROGUE_MAX_FORCED_DEFENSES = 5;
const WOD_ROGUE_MAX_CONSECUTIVE_DEFENSES = 2;
const WOD_ROGUE_REQ_PER_TERRITORY = 50;
/** Campaign research tree — costly lasting upgrades bought with requisition. */
const WOD_ROGUE_RESEARCH = {
    treasury: {
        id: 'treasury',
        name: 'War Chest',
        desc: 'Begin each battle with extra $ for recruitment and structures.',
        max: 3,
        costs: [1000, 1600, 2400],
        moneyBonus: [3500, 7000, 11000]
    },
    reserves: {
        id: 'reserves',
        name: 'Manpower Reserves',
        desc: 'Begin each battle with extra manpower stockpiles.',
        max: 3,
        costs: [900, 1500, 2200],
        mpBonus: [2200, 4500, 7500]
    },
    logistics: {
        id: 'logistics',
        name: 'Supply Lines',
        desc: 'Raise requisition income from every held region.',
        max: 3,
        costs: [1200, 1900, 2800],
        reqBonus: [12, 25, 40]
    }
};
function wodRogueEnsureResearch(c) {
    if(!c) return { treasury: 0, reserves: 0, logistics: 0 };
    if(!c.research || typeof c.research !== 'object') c.research = { treasury: 0, reserves: 0, logistics: 0 };
    for(let k of Object.keys(WOD_ROGUE_RESEARCH)) {
        let max = WOD_ROGUE_RESEARCH[k].max;
        c.research[k] = Math.max(0, Math.min(max, c.research[k] | 0));
    }
    return c.research;
}
function wodRogueResearchLevel(c, id) {
    let r = wodRogueEnsureResearch(c);
    return r[id] | 0;
}
function wodRogueResearchNextCost(c, id) {
    let def = WOD_ROGUE_RESEARCH[id];
    if(!def) return null;
    let lvl = wodRogueResearchLevel(c, id);
    if(lvl >= def.max) return null;
    return def.costs[lvl] * 2;
}
function wodRogueResearchMoneyBonus(c) {
    let def = WOD_ROGUE_RESEARCH.treasury;
    let lvl = wodRogueResearchLevel(c, 'treasury');
    return lvl > 0 ? (def.moneyBonus[lvl - 1] || 0) : 0;
}
function wodRogueResearchManpowerBonus(c) {
    let def = WOD_ROGUE_RESEARCH.reserves;
    let lvl = wodRogueResearchLevel(c, 'reserves');
    return lvl > 0 ? (def.mpBonus[lvl - 1] || 0) : 0;
}
function wodRogueResearchReqPerTerritory(c) {
    let def = WOD_ROGUE_RESEARCH.logistics;
    let lvl = wodRogueResearchLevel(c, 'logistics');
    let bonus = lvl > 0 ? (def.reqBonus[lvl - 1] || 0) : 0;
    return WOD_ROGUE_REQ_PER_TERRITORY + bonus;
}
function wodRogueBuyResearch(id) {
    let c = wodRogueLoad();
    if(!c || c.over) return false;
    let def = WOD_ROGUE_RESEARCH[id];
    if(!def) return false;
    wodRogueEnsureResearch(c);
    let cost = wodRogueResearchNextCost(c, id);
    if(cost == null) { showNotification(def.name + ' is fully researched.'); return false; }
    if(c.points < cost) { showNotification('Need ' + cost + ' requisition for ' + def.name + '.'); return false; }
    c.points -= cost;
    c.research[id] = (c.research[id] | 0) + 1;
    wodRogueLogPush('Research complete: ' + def.name + ' Lv ' + c.research[id] + ' (-' + cost + ' req).');
    wodRogueSave();
    return true;
}
function wodCloseCampResearchDlg() {
    let dlg = document.getElementById('wodCampResearchDlg');
    if(!dlg) return;
    dlg.classList.add('hidden');
    dlg.setAttribute('aria-hidden', 'true');
}
function wodOpenCampResearchDlg() {
    let c = wodRogueLoad();
    if(!c) return;
    wodRogueRenderResearch(c);
    let dlg = document.getElementById('wodCampResearchDlg');
    if(!dlg) return;
    dlg.classList.remove('hidden');
    dlg.setAttribute('aria-hidden', 'false');
}
function wodRogueRenderResearch(c) {
    let list = document.getElementById('wodCampResearchList');
    let ptsEl = document.getElementById('wodCampResearchDlgPoints');
    let researchBtn = document.getElementById('wodCampResearchBtn');
    if(researchBtn) {
        researchBtn.disabled = !c || !!c.over;
        researchBtn.style.display = c ? '' : 'none';
    }
    if(ptsEl) {
        if(c) ptsEl.textContent = (c.points | 0) + ' requisition available';
        else ptsEl.textContent = '0 requisition';
    }
    if(!list) return;
    if(!c) {
        list.innerHTML = '';
        return;
    }
    wodRogueEnsureResearch(c);
    list.innerHTML = '';
    for(let id of ['treasury', 'reserves', 'logistics']) {
        let def = WOD_ROGUE_RESEARCH[id];
        let lvl = wodRogueResearchLevel(c, id);
        let next = wodRogueResearchNextCost(c, id);
        let row = document.createElement('div');
        row.className = 'wod-camp-research-row' + (lvl >= def.max ? ' owned' : '');
        let effect = '';
        if(id === 'treasury') effect = 'Battle $ +' + (lvl > 0 ? def.moneyBonus[lvl - 1] : 0).toLocaleString() + (next != null ? ' → +$' + def.moneyBonus[lvl].toLocaleString() : '');
        else if(id === 'reserves') effect = 'Battle manpower +' + (lvl > 0 ? def.mpBonus[lvl - 1] : 0).toLocaleString() + (next != null ? ' → +' + def.mpBonus[lvl].toLocaleString() : '');
        else effect = 'Req/region ' + wodRogueResearchReqPerTerritory(c) + (next != null ? ' → ' + (WOD_ROGUE_REQ_PER_TERRITORY + def.reqBonus[lvl]) : '');
        let meta = document.createElement('div');
        meta.className = 'wod-camp-research-meta';
        meta.innerHTML = '<strong>' + def.name + '</strong><em>' + def.desc + '<br>' + effect + '</em>';
        row.appendChild(meta);
        if(lvl >= def.max) {
            let tag = document.createElement('span');
            tag.className = 'wod-camp-research-lvl';
            tag.textContent = 'MAX';
            row.appendChild(tag);
        } else {
            let btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'wod-camp-research-buy';
            btn.textContent = 'Lv ' + lvl + '/' + def.max + ' — ' + next;
            btn.disabled = !!c.over || c.points < next;
            btn.addEventListener('click', () => {
                if(wodRogueBuyResearch(id)) {
                    wodRogueRenderResearch(wodRogueLoad());
                    wodRefreshCampaignPanel();
                }
            });
            row.appendChild(btn);
        }
        list.appendChild(row);
    }
}
function wodFormatHoldClock(sec) {
    sec = Math.max(0, Math.ceil(sec || 0));
    let m = (sec / 60) | 0;
    let s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
}
const WOD_ROGUE_LENGTH_PRESETS = {
    short: { label: 'Short — 9 regions', nodes: 9, W: 170, H: 104 },
    medium: { label: 'Standard — 13 regions', nodes: 13, W: 210, H: 128 },
    long: { label: 'Long — 18 regions', nodes: 18, W: 252, H: 152 },
    epic: { label: 'Epic — 24 regions', nodes: 24, W: 300, H: 180 }
};
const WOD_ROGUE_DEFAULT_POINTS = 4500;
const WOD_ROGUE_FLAVOR = [
    'Skirmishes flare along the front; no ground changes hands.',
    'Concord bombers hit our supply columns overnight.',
    'Partisans blow a Concord fuel depot behind the lines.',
    'Refugees stream west; the roads are choked for miles.',
    'Both armies dig in as rain turns the front to mud.',
    'Our scouts report Concord conscription sweeps in the east.',
    'A ceasefire rumor spreads through the trenches, then dies.',
    'Artillery duels echo across the front all night.',
    'A Concord supply convoy is ambushed on the coast road.',
    'Deserters trickle across the lines with wild stories.',
    'Staff intercept: Morren has shifted the Field Army toward the river towns.',
    'Ashcoast signals — Venn’s boats are working the night shore.',
    'Tal has closed the highland roads. No traffic, no prisoners.',
    'A Concord courier is taken. The orders are Morren’s: towns first.'
];
const WOD_ROGUE_TERRAIN_CODE = { water: 'w', sand: 's', grass: 'g', forest: 'f', hill: 'h', mountain: 'm', swamp: 'p' };
const WOD_ROGUE_TERRAIN_DECODE = { w: 'water', s: 'sand', g: 'grass', f: 'forest', h: 'hill', m: 'mountain', p: 'swamp' };
let wodRogue = null;
     // active save (null = no campaign yet)
let _wodRogueDraft = null;
       // pre-start settings + seed for the setup screen
let _wodRogueWorldCache = null;
  // { key, world } decoded/generated world cells

function wodRogueMul32(a, b) { return Math.imul(a >>> 0, b >>> 0) >>> 0; }
function wodRogueRng(seed) {
    let a = seed >>> 0;
    return function() {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/* ------------------------- world generation ------------------------- */
/** Paint the campaign continent on a coarse cell grid — same fbm language as the
 * in-game maps, with per-seed silhouette variety. */
function wodRogueBuildCells(seed, W, H) {
    let rng = wodRogueRng((seed ^ 0x51ab77e1) >>> 0);
    let so = (seed % 9973) + 11.7;
    let stretchX = 0.56 + rng() * 0.22;
    let stretchY = 0.88 + rng() * 0.35;
    let broken = rng() < 0.3;
    let waterTh = 0.435 + rng() * 0.03;
    let mountTh = 0.9 + rng() * 0.05;
    let cells = new Array(W * H);
    for(let gy = 0; gy < H; gy++) {
        for(let gx = 0; gx < W; gx++) {
            let nx = gx / W, ny = gy / H;
            let sx = (nx - 0.5) * 2 / stretchX * 0.62, sy = (ny - 0.5) * 2 / stretchY;
            let dist = Math.sqrt(sx * sx * 0.62 + sy * sy);
            let ang = Math.atan2(sy, sx);
            let warp = (fbm(Math.cos(ang) * 2.2 + so, Math.sin(ang) * 2.2 + so, 4) - 0.5) * 0.46;
            let mask = 1.16 - dist + warp;
            if(broken) {
                let cuts = fbm(nx * 3.4 + so + 777, ny * 3.4 + so + 777, 4);
                mask -= Math.max(0, cuts - 0.42) * 0.75;
            }
            let elev = fbm(nx * 5.2 + so, ny * 5.2 + so, 5) * 0.82 + (mask - 0.52);
            let moist = fbm(nx * 4.4 + so + 50, ny * 4.4 + so + 50, 4);
            let t;
            if(elev < waterTh) t = 'water';
            else if(elev < waterTh + 0.045) t = 'sand';
            else if(elev > mountTh) t = 'mountain';
            else if(elev > mountTh - 0.07) t = 'hill';
            else if(moist > 0.66) t = 'swamp';
            else if(moist > 0.56) t = 'forest';
            else if(moist < 0.33) t = 'sand';
            else t = 'grass';
            cells[gy * W + gx] = t;
        }
    }
    // Speckle smoothing on the cell grid (same rules as the hex maps).
    for(let pass = 0; pass < 2; pass++) {
        let changes = [];
        for(let gy = 1; gy < H - 1; gy++) {
            for(let gx = 1; gx < W - 1; gx++) {
                let i = gy * W + gx;
                let t = cells[i];
                let counts = {}, same = 0, landN = 0, waterN = 0;
                for(let dy = -1; dy <= 1; dy++) {
                    for(let dx = -1; dx <= 1; dx++) {
                        if(!dx && !dy) continue;
                        let n = cells[(gy + dy) * W + gx + dx];
                        if(n === 'water') { waterN++; continue; }
                        landN++;
                        counts[n] = (counts[n] || 0) + 1;
                        if(n === t) same++;
                    }
                }
                if(t === 'water') {
                    if(waterN <= 1 && landN >= 5) {
                        let bt = 'grass', bc = 0;
                        for(let k in counts) { if(counts[k] > bc) { bc = counts[k]; bt = k; } }
                        changes.push([i, bt]);
                    }
                    continue;
                }
                if(same === 0 && landN >= 3) {
                    let bt = t, bc = 0;
                    for(let k in counts) { if(counts[k] > bc) { bc = counts[k]; bt = k; } }
                    changes.push([i, bt]);
                }
            }
        }
        for(let c of changes) cells[c[0]] = c[1];
    }
    return cells;
}
const WOD_ROGUE_NAME_A = ['Kar', 'Vel', 'Gray', 'Ash', 'Iron', 'Storm', 'Bleak', 'Salt', 'Wind', 'Thorn', 'Kes', 'Mal', 'Bran', 'Cor', 'Nor', 'Ost', 'Hal', 'Dun', 'Fen', 'Ryn', 'Vor', 'Eld'];
const WOD_ROGUE_NAME_B = ['mark', 'holm', 'stad', 'wick', 'gate', 'fell', 'moor', 'burg', 'haven', 'ford', 'rock', 'dale', 'spire', 'keep', 'crag', 'reach', 'den', 'wall'];
function wodRogueMakeName(rng, terr, used) {
    for(let tries = 0; tries < 30; tries++) {
        let base = WOD_ROGUE_NAME_A[(rng() * WOD_ROGUE_NAME_A.length) | 0] + WOD_ROGUE_NAME_B[(rng() * WOD_ROGUE_NAME_B.length) | 0];
        let name;
        if(terr === 'water') name = rng() < 0.5 ? 'Port ' + base : base + ' Isles';
        else if(terr === 'mountain' || terr === 'hill') name = rng() < 0.5 ? base + ' Pass' : 'Fort ' + base;
        else if(terr === 'forest') name = base + (rng() < 0.5 ? ' Forest' : ' Woods');
        else if(terr === 'swamp') name = base + ' Fens';
        else if(terr === 'sand') name = base + (rng() < 0.5 ? ' Wastes' : ' Dunes');
        else name = rng() < 0.3 ? base + ' Fields' : base;
        if(!used.has(name)) { used.add(name); return name; }
    }
    let fallback = 'Sector ' + (used.size + 1);
    used.add(fallback);
    return fallback;
}
function wodRogueEffectiveAiCount(node) {
    if(!node || node.hq) return Math.max(1, node && node.ai ? (node.ai | 0) : 1);
    let baked = Math.max(0, node.ai | 0);
    let fromDiff = 1;
    if(node.capital || (node.diff | 0) >= 4) fromDiff = 3;
    else if((node.diff | 0) >= 2) fromDiff = 2;
    return Math.max(1, Math.min(3, Math.max(baked, fromDiff)));
}
function wodRogueScaleMapSize(baseSize, aiCount) {
    let size = (baseSize === 40 || baseSize === 80) ? baseSize : 60;
    let ai = Math.max(1, aiCount | 0);
    if(ai >= 3) return 80;
    if(ai >= 2) return size === 40 ? 60 : 80;
    return size;
}
function wodRogueAllyAiOwners(aiCount) {
    let n = Math.max(0, aiCount | 0);
    let pairs = [];
    for(let a = 2; a <= n + 1; a++) {
        for(let b = a + 1; b <= n + 1; b++) pairs.push([a, b]);
    }
    return pairs;
}
function wodRogueCountryNames(node) {
    let ids = wodRoguePickGenerals(node);
    let names = [];
    let seen = new Set();
    for(let i = 0; i < ids.length; i++) {
        let g = typeof wodGeneralById === 'function' ? wodGeneralById(ids[i]) : null;
        let nm = (g && g.country) || WOD_WORLD.enemy.name;
        if(seen.has(nm)) continue;
        seen.add(nm);
        names.push(nm);
    }
    return names;
}
function wodRoguePickGenerals(node, force) {
    let n = wodRogueEffectiveAiCount(node);
    if(!force && node && node.generals && node.generals.length >= n) return node.generals.slice(0, n);
    let primary = 'morren';
    if(node) {
        if(node.shape === 'island' || node.shape === 'archipelago') primary = 'venn';
        else if(node.shape === 'mountain') primary = 'tal';
        else if(node.capital) primary = 'morren';
    }
    let rest = ['morren', 'venn', 'tal'].filter(id => id !== primary);
    let ids = [primary];
    for(let i = 0; i < n - 1 && i < rest.length; i++) ids.push(rest[i]);
    return ids;
}
function wodRogueGeneralNames(node, opts) {
    opts = opts || {};
    let ids = wodRoguePickGenerals(node);
    let names = [];
    for(let i = 0; i < ids.length; i++) {
        let g = typeof wodGeneralById === 'function' ? wodGeneralById(ids[i]) : null;
        if(!g) continue;
        names.push(opts.short ? g.name.split(' ').pop() : (g.rank + ' ' + g.name));
    }
    return names;
}
function wodRogueJoinList(items) {
    if(!items || !items.length) return '';
    if(items.length === 1) return items[0];
    if(items.length === 2) return items[0] + ' and ' + items[1];
    return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
}
function wodRogueGeneralBriefLine(node, kind) {
    let countries = wodRogueCountryNames(node);
    let names = wodRogueGeneralNames(node);
    if(!countries.length && !names.length) return '';
    let pact = wodRogueJoinList(countries);
    let cmds = wodRogueJoinList(names);
    if(kind === 'capital') {
        if(countries.length <= 1) return (cmds || pact) + ' holds the palace.';
        return pact + ' stand allied at the palace. ' + cmds + ' share the defense.';
    }
    if(countries.length <= 1) return ' ' + (cmds || pact) + ' commands here.';
    return ' ' + pact + ' are allied against the Remnant. ' + cmds + ' hold the line together.';
}
function wodRogueMakeBrief(rng, node) {
    let by = {
        island: ['A Concord garrison holds the beaches of NAME. Land, secure a foothold, and push inland.',
            'NAME sits across open water. Marines lead; the fleet covers the crossing.'],
        archipelago: ['NAME is scattered across a dozen islets. Whoever rules the water rules the region.',
            'Island-hopping through NAME — take every anchorage the Concord holds.'],
        mountain: ['NAME guards the only passes for miles. Expect dug-in defenders at every gate.',
            'High country. The Concord holds the peaks of NAME; force the passes.'],
        forest: ['Deep timber around NAME crawls with patrols. Clear the logging roads.',
            'The woods of NAME hide guns and men. Advance carefully and burn them out.'],
        desert: ['The open wastes of NAME favor armor and bold moves. Watch your supply line.',
            'Heat, dust and Concord armor — NAME will be won by maneuver.'],
        rectangle: ['Open country at NAME — farmland, towns, and a dug-in garrison.',
            'NAME is the hinge of the Concord line here. Break it and the front moves.']
    };
    let pool = by[node.shape] || by.rectangle;
    let s = pool[(rng() * pool.length) | 0];
    return s.replace('NAME', node.name);
}
/** Generate the full campaign world from seed + settings: cells, nodes, edges. */
function wodRogueIsLandCell(cells, W, H, gx, gy) {
    if(gx < 0 || gy < 0 || gx >= W || gy >= H) return false;
    return cells[gy * W + gx] !== 'water';
}
function wodRogueSnapToLand(cells, W, H, gx, gy, maxR) {
    if(wodRogueIsLandCell(cells, W, H, gx, gy)) return { gx, gy };
    maxR = maxR || 14;
    let best = null, bd = Infinity;
    for(let r = 1; r <= maxR; r++) {
        for(let dy = -r; dy <= r; dy++) {
            for(let dx = -r; dx <= r; dx++) {
                if(Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                let x = gx + dx, y = gy + dy;
                if(!wodRogueIsLandCell(cells, W, H, x, y)) continue;
                let d = dx * dx + dy * dy;
                if(d < bd) { bd = d; best = { gx: x, gy: y }; }
            }
        }
        if(best) return best;
    }
    return { gx: Math.max(1, Math.min(W - 2, gx)), gy: Math.max(1, Math.min(H - 2, gy)) };
}
function wodRogueGenerateWorld(seed, lengthKey) {
    let L = WOD_ROGUE_LENGTH_PRESETS[lengthKey] || WOD_ROGUE_LENGTH_PRESETS.medium;
    let D = WOD_ROGUE_BALANCE;
    let W = L.W, H = L.H;
    let cells = wodRogueBuildCells(seed, W, H);
    let rng = wodRogueRng((seed ^ 0xbeef1234) >>> 0);
    let used = new Set();
    let cellAt = (gx, gy) => cells[gy * W + gx];
    function landNear(gx, gy, r) {
        let land = 0, tot = 0;
        for(let dy = -r; dy <= r; dy++) {
            for(let dx = -r; dx <= r; dx++) {
                let x = gx + dx, y = gy + dy;
                if(x < 0 || y < 0 || x >= W || y >= H) continue;
                tot++;
                if(cellAt(x, y) !== 'water') land++;
            }
        }
        return tot ? land / tot : 0;
    }
    // Node positions: HQ far west, capital far east, others poisson-ish on/near land.
    let count = L.nodes;
    let pts = [];
    function pickAnchor(fracX, band) {
        let best = null, bs = -Infinity;
        for(let tries = 0; tries < 400; tries++) {
            let gx = Math.round((fracX + (rng() - 0.5) * 0.08) * W);
            let gy = Math.round((0.2 + rng() * 0.6) * H);
            gx = Math.max(6, Math.min(W - 7, gx));
            gy = Math.max(6, Math.min(H - 7, gy));
            if(!wodRogueIsLandCell(cells, W, H, gx, gy)) continue;
            let lf = landNear(gx, gy, 5);
            let sc = lf - Math.abs(gx / W - fracX) * (band || 2);
            if(sc > bs) { bs = sc; best = { gx, gy }; }
            if(lf > 0.55 && Math.abs(gx / W - fracX) < 0.05) break;
        }
        if(!best) best = wodRogueSnapToLand(cells, W, H, Math.round(fracX * W), Math.round(H * 0.5));
        else best = wodRogueSnapToLand(cells, W, H, best.gx, best.gy);
        return best;
    }
    let hqP = pickAnchor(0.08);
    let capP = pickAnchor(0.93);
    pts.push({ gx: hqP.gx, gy: hqP.gy, hq: true });
    pts.push({ gx: capP.gx, gy: capP.gy, capital: true });
    // Poisson-ish scatter with ADAPTIVE spacing: worlds with lots of ocean can't
    // fit every region at full spacing, so the radius (and the land requirement)
    // relaxes until the full node count fits — but never collapses into clumps.
    let minD0 = Math.sqrt((W * H) / count) * 0.92;
    let minD = minD0;
    let minDFloor = minD0 * 0.62;
    let landReq = 0.42;
    let guard = 0;
    while(pts.length < count && guard++ < 20000) {
        if(guard % 900 === 0) {
            minD = Math.max(minDFloor, minD * 0.92);
            landReq = Math.max(0.28, landReq - 0.03);
        }
        let gx = Math.round((0.06 + rng() * 0.88) * W);
        let gy = Math.round((0.08 + rng() * 0.84) * H);
        gx = Math.max(6, Math.min(W - 7, gx));
        gy = Math.max(6, Math.min(H - 7, gy));
        if(!wodRogueIsLandCell(cells, W, H, gx, gy)) continue;
        if(landNear(gx, gy, 4) < landReq) continue;
        let ok = true;
        for(let p of pts) {
            let dx = p.gx - gx, dy = p.gy - gy;
            if(dx * dx + dy * dy < minD * minD) { ok = false; break; }
        }
        if(ok) pts.push({ gx, gy });
    }
    for(let p of pts) {
        let snapped = wodRogueSnapToLand(cells, W, H, p.gx, p.gy);
        p.gx = snapped.gx;
        p.gy = snapped.gy;
    }
    // Snap-to-land can pull neighbors together — push them back apart on land.
    let enforceMin = minDFloor;
    let enforceMin2 = enforceMin * enforceMin;
    for(let pass = 0; pass < 10; pass++) {
        let moved = false;
        for(let i = 0; i < pts.length; i++) {
            for(let j = i + 1; j < pts.length; j++) {
                let a = pts[i], b = pts[j];
                let dx = b.gx - a.gx, dy = b.gy - a.gy;
                let d2 = dx * dx + dy * dy;
                if(d2 >= enforceMin2 || d2 < 1e-6) continue;
                let d = Math.sqrt(d2) || 1;
                let push = (enforceMin - d) * 0.55;
                let ux = dx / d, uy = dy / d;
                a.gx = Math.round(a.gx - ux * push);
                a.gy = Math.round(a.gy - uy * push);
                b.gx = Math.round(b.gx + ux * push);
                b.gy = Math.round(b.gy + uy * push);
                let sa = wodRogueSnapToLand(cells, W, H, a.gx, a.gy);
                let sb = wodRogueSnapToLand(cells, W, H, b.gx, b.gy);
                a.gx = sa.gx; a.gy = sa.gy;
                b.gx = sb.gx; b.gy = sb.gy;
                moved = true;
            }
        }
        if(!moved) break;
    }
    // Terrain profile per node → battle shape/size, name, brief, garrison.
    let nodes = [];
    for(let i = 0; i < pts.length; i++) {
        let p = pts[i];
        let water = 0, mount = 0, forest = 0, sand = 0, tot = 0;
        let r = 8;
        for(let dy = -r; dy <= r; dy++) {
            for(let dx = -r; dx <= r; dx++) {
                let x = p.gx + dx, y = p.gy + dy;
                if(x < 0 || y < 0 || x >= W || y >= H) continue;
                let t = cellAt(x, y);
                tot++;
                if(t === 'water') water++;
                else if(t === 'mountain' || t === 'hill') mount++;
                else if(t === 'forest' || t === 'swamp') forest++;
                else if(t === 'sand') sand++;
            }
        }
        water /= tot; mount /= tot; forest /= tot; sand /= tot;
        let shape;
        if(water > 0.56) shape = 'archipelago';
        else if(water > 0.4) shape = 'island';
        else if(mount > 0.13) shape = 'mountain';
        else if(forest > 0.24) shape = 'forest';
        else if(sand > 0.3) shape = 'desert';
        else shape = rng() < 0.45 ? 'island' : 'rectangle';
        let terr = water > 0.4 ? 'water' : mount > 0.13 ? 'mountain' : forest > 0.24 ? 'forest' : sand > 0.3 ? 'sand' : 'grass';
        // Difficulty ramps west→east.
        let prog = Math.max(0, Math.min(1, (p.gx / W - hqP.gx / W) / Math.max(0.2, capP.gx / W - hqP.gx / W)));
        let diff = p.hq ? 0 : p.capital ? 5 : Math.min(5, Math.round(prog * 4.6 + rng() * 0.7));
        let aiN = p.hq ? 1 : (p.capital || diff >= 4 ? 3 : (diff >= 2 ? 2 : 1));
        let size = diff <= 1 ? 40 : diff >= 4 ? (rng() < 0.55 ? 80 : 60) : (rng() < 0.3 ? 40 : 60);
        size = wodRogueScaleMapSize(size, aiN);
        // Garrison composition (bakes the campaign balance in).
        let m = D.mult * (0.82 + 0.22 * aiN);
        let gar = {
            light: Math.max(2, Math.round((3 + diff * 1.9 + rng() * 2) * m)),
            heavy: Math.max(0, Math.round((diff * 0.65 + rng() * 0.8) * m)),
            ship: shape === 'archipelago' || shape === 'island' ? Math.max(0, Math.round((0.6 + diff * 0.5) * m)) : 0
        };
        let node = {
            id: i,
            name: p.hq ? null : p.capital ? null : wodRogueMakeName(rng, terr, used),
            x: (p.gx + 0.5) / W,
            y: (p.gy + 0.5) / H,
            gx: p.gx,
            gy: p.gy,
            shape, size, diff,
            ai: aiN,
            hq: !!p.hq,
            capital: !!p.capital,
            industry: false,
            gar,
            towns: []
        };
        if(p.hq) {
            node.name = wodRogueMakeName(rng, 'grass', used).replace(/ .*/, '') + ' Landing';
            node.gar = { light: 0, heavy: 0, ship: 0 };
        }
        if(p.capital) node.name = wodRogueMakeName(rng, 'grass', used);
        // Named settlements inside this region — reused as battle-map city names.
        let townN = node.hq ? 2 : (2 + aiN * 2 + (node.capital ? 1 : 0) + (rng() < 0.4 ? 1 : 0));
        node.towns.push(node.name);
        while(node.towns.length < townN) {
            let tn = wodRogueMakeName(rng, terr, used);
            if(node.towns.indexOf(tn) < 0) node.towns.push(tn);
        }
        nodes.push(node);
    }
    // Industry nodes: 1 (short) or 2 elsewhere, from the middle of the map.
    let mids = nodes.filter(n => !n.hq && !n.capital && n.diff >= 2 && n.diff <= 4)
        .sort((a, b) => Math.abs(a.x - 0.55) - Math.abs(b.x - 0.55));
    let indN = count <= 9 ? 1 : 2;
    for(let i = 0; i < Math.min(indN, mids.length); i++) mids[i].industry = true;
    // Briefs (need final names/industry flags).
    for(let n of nodes) {
        n.generals = wodRoguePickGenerals(n, true);
        if(n.hq) n.brief = 'Our last foothold on this coast. From ' + n.name + ' the Federation Remnant strikes back — if it falls, the war is over.';
        else if(n.capital) n.brief = (wodRogueEffectiveAiCount(n) > 1 ? WOD_WORLD.pact : WOD_WORLD.enemy.name) +
            '\u2019s capital, ' + n.name + '. ' + wodRogueGeneralBriefLine(n, 'capital') + ' End this war.';
        else n.brief = wodRogueMakeBrief(rng, n) + wodRogueGeneralBriefLine(n, 'field') + (n.industry ? ' Its foundries mark a vital industrial region.' : '');
    }
    // Edges: 2-3 nearest neighbors + union-find connectivity repair.
    let edges = [];
    let eSet = new Set();
    function addEdge(a, b) {
        let k = Math.min(a, b) + '_' + Math.max(a, b);
        if(eSet.has(k) || a === b) return;
        eSet.add(k);
        edges.push([Math.min(a, b), Math.max(a, b)]);
    }
    for(let i = 0; i < nodes.length; i++) {
        let ds = nodes.map((n, j) => ({ j, d: (n.x - nodes[i].x) * (n.x - nodes[i].x) + (n.y - nodes[i].y) * (n.y - nodes[i].y) }))
            .filter(e => e.j !== i)
            .sort((a, b) => a.d - b.d);
        let want = 2 + ((wodRogueMul32(seed, i + 7) & 3) === 0 ? 1 : 0);
        for(let k = 0; k < Math.min(want, ds.length); k++) addEdge(i, ds[k].j);
    }
    // Connectivity repair.
    let parent = nodes.map((_, i) => i);
    function find(a) { while(parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }
    function union(a, b) { let ra = find(a), rb = find(b); if(ra !== rb) parent[ra] = rb; }
    for(let [a, b] of edges) union(a, b);
    let guard2 = 0;
    while(guard2++ < 60) {
        let comps = new Map();
        for(let i = 0; i < nodes.length; i++) {
            let r2 = find(i);
            if(!comps.has(r2)) comps.set(r2, []);
            comps.get(r2).push(i);
        }
        if(comps.size <= 1) break;
        let groups = [...comps.values()];
        let a = groups[0], bestPair = null, bestD = Infinity;
        for(let i of a) {
            for(let g = 1; g < groups.length; g++) {
                for(let j of groups[g]) {
                    let dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
                    let d = dx * dx + dy * dy;
                    if(d < bestD) { bestD = d; bestPair = [i, j]; }
                }
            }
        }
        if(!bestPair) break;
        addEdge(bestPair[0], bestPair[1]);
        union(bestPair[0], bestPair[1]);
    }
    return { W, H, cells, nodes, edges };
}
function wodRogueEncodeCells(cells) {
    let out = '';
    for(let i = 0; i < cells.length; i++) out += WOD_ROGUE_TERRAIN_CODE[cells[i]] || 'g';
    return out;
}
function wodRogueDecodeCells(str) {
    let out = new Array(str.length);
    for(let i = 0; i < str.length; i++) out[i] = WOD_ROGUE_TERRAIN_DECODE[str[i]] || 'grass';
    return out;
}
/* ------------------------- save / load / draft ------------------------- */
function wodRogueFreshDraft() {
    return {
        seed: ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0) || 0x1234abcd,
        length: 'medium',
        startPoints: WOD_ROGUE_DEFAULT_POINTS
    };
}
function wodRogueDraft() {
    if(!_wodRogueDraft) _wodRogueDraft = wodRogueFreshDraft();
    // Every campaign opens with the same requisition (no custom budget).
    _wodRogueDraft.startPoints = WOD_ROGUE_DEFAULT_POINTS;
    return _wodRogueDraft;
}
function wodRogueLoad() {
    if(wodRogue) {
        wodRogue.roster?.forEach(wodNormalizeNavalStats);
        wodRogueEnsureResearch(wodRogue);
        return wodRogue;
    }
    try {
        localStorage.removeItem(WOD_ROGUE_LS_KEY_V1);
        let raw = localStorage.getItem(WOD_ROGUE_LS_KEY);
        if(raw) {
            let o = JSON.parse(raw);
            if(o && o.version === 2 && o.world && Array.isArray(o.roster)) {
                // Campaign difficulty was removed: older saves play at the standard balance.
                if(o.settings) delete o.settings.difficulty;
                wodRogue = o;
                wodRogue.roster.forEach(wodNormalizeNavalStats);
                wodRogueEnsureResearch(wodRogue);
                return wodRogue;
            }
        }
    } catch(e) { console.warn('wodRogueLoad', e); }
    return null;
}
function wodRogueSave() {
    if(!wodRogue) return;
    try { localStorage.setItem(WOD_ROGUE_LS_KEY, JSON.stringify(wodRogue)); }
    catch(e) { console.warn('wodRogueSave', e); }
}
function wodRogueDeleteSave() {
    wodRosterUndo = null;
    try { localStorage.removeItem(WOD_ROGUE_LS_KEY); } catch(e) {}
    wodRogue = null;
    _wodRogueWorldCache = null;
    wodRogueInvalidateMapCache();
    _wodRogueSelectedNode = null;
    _wodRogueSelectedFromNode = null;
    _wodRogueDraft = wodRogueFreshDraft();
}
/** Begin a campaign from the current draft: generate the world, persist the save. */
function wodRogueBegin() {
    wodRosterUndo = null;
    let d = wodRogueDraft();
    let world = wodRogueGenerateWorld(d.seed, d.length);
    let nodesState = {};
    for(let n of world.nodes) nodesState[n.id] = { owner: n.hq ? 'player' : 'enemy', battles: 0 };
    let campPeriod = wodGetCampaignGamePeriod();
    let startPts = WOD_ROGUE_DEFAULT_POINTS;
    wodRogue = {
        version: 2,
        seed: d.seed,
        settings: {
            length: d.length,
            startPoints: startPts,
            gamePeriod: campPeriod
        },
        worldEnc: { W: world.W, H: world.H, cells: wodRogueEncodeCells(world.cells) },
        world: { nodes: world.nodes, edges: world.edges },
        points: startPts,
        unitSeq: 0,
        roster: [],
        nodesState,
        turn: 1,
        alerts: {},
        blockedAdvance: false,
        forcedDefenses: 0,
        consecutiveDefenses: 0,
        research: { treasury: 0, reserves: 0, logistics: 0 },
        log: ['The Federation Remnant lands. Morren, Venn, and Tal already hold the interior. Starting requisition: ' + startPts + '.'],
        stats: { battles: 0, wins: 0, defeats: 0, unitsLost: 0, unitsKilled: 0, unitsBought: 0, kills: 0, losses: 0 },
        over: false,
        won: false
    };
    _wodRogueWorldCache = null;
    wodRogueInvalidateMapCache();
    _wodRogueSelectedNode = null;
    _wodRogueSelectedFromNode = null;
    wodRogueSave();
}
/* ------------------------- accessors ------------------------- */
function wodRogueNodes() {
    let c = wodRogueLoad();
    return c ? c.world.nodes : [];
}
function wodRogueEdgesList() {
    let c = wodRogueLoad();
    return c ? c.world.edges : [];
}
function wodRogueNodeTemplate(id) { return wodRogueNodes().find(n => n.id === id) || null; }
function wodRogueNeighbors(id) {
    let out = [];
    for(let [a, b] of wodRogueEdgesList()) {
        if(a === id) out.push(b);
        else if(b === id) out.push(a);
    }
    return out;
}
/** Normalize alert payload (legacy number → {turn, fromId}). */
function wodRogueAlertEntry(c, id) {
    if(!c || !c.alerts) return null;
    let a = c.alerts[id];
    if(a == null) return null;
    if(typeof a === 'number') return { turn: a, fromId: null };
    return { turn: a.turn | 0, fromId: a.fromId != null ? a.fromId : null };
}
function wodRogueHasAlert(c, id) {
    return !!wodRogueAlertEntry(c, id);
}
function wodRogueAlertTurn(c, id) {
    let e = wodRogueAlertEntry(c, id);
    return e ? e.turn : -1;
}
function wodRogueNodeMapXY(n) {
    if(!n) return { x: 0, y: 0 };
    if(n.gx != null && n.gy != null) return { x: +n.gx, y: +n.gy };
    return { x: +(n.x || 0), y: +(n.y || 0) };
}
/** Which battle-map edge the attacker enters from, based on war-map geometry. */
function wodRogueAttackSide(fromNode, toNode) {
    let a = wodRogueNodeMapXY(fromNode);
    let b = wodRogueNodeMapXY(toNode);
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    if(Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'east' : 'west';
    return dy >= 0 ? 'south' : 'north';
}
function wodRogueOppositeSide(side) {
    if(side === 'west') return 'east';
    if(side === 'east') return 'west';
    if(side === 'north') return 'south';
    return 'north';
}
function wodRogueSideLabel(side) {
    if(side === 'west') return 'west';
    if(side === 'east') return 'east';
    if(side === 'north') return 'north';
    if(side === 'south') return 'south';
    return side || 'west';
}
/** Provinces the player can choose as the attack / enemy-advance origin. */
function wodRogueBattleOriginOptions(nodeId) {
    let c = wodRogueLoad();
    if(!c) return [];
    let st = c.nodesState[nodeId];
    if(!st) return [];
    if(wodRogueHasAlert(c, nodeId)) {
        return wodRogueNeighbors(nodeId).filter(nb =>
            c.nodesState[nb] && c.nodesState[nb].owner === 'enemy');
    }
    if(st.owner === 'enemy') {
        return wodRogueNeighbors(nodeId).filter(nb =>
            c.nodesState[nb] && c.nodesState[nb].owner === 'player');
    }
    return [];
}
function wodRogueHasActiveAlerts(c) {
    if(!c || !c.alerts) return false;
    return Object.keys(c.alerts).some(id => c.nodesState[id] && c.nodesState[id].owner === 'player');
}
/** When a roadblock is up, only the threatened region(s) can be fought — no advancing. */
function wodRogueAdvanceBlocked(c) {
    return !!(c && c.blockedAdvance && wodRogueHasActiveAlerts(c));
}
function wodRogueNodePlayable(id) {
    let c = wodRogueLoad();
    if(!c || c.over) return false;
    let st = c.nodesState[id];
    if(!st) return false;
    let alert = wodRogueHasAlert(c, id);
    if(wodRogueAdvanceBlocked(c)) return alert && st.owner === 'player';
    if(st.owner === 'enemy') return wodRogueNeighbors(id).some(n => c.nodesState[n] && c.nodesState[n].owner === 'player');
    return alert;
}
function wodRogueHqNode() { return wodRogueNodes().find(n => n.hq) || null; }
function wodRogueCapitalNode() { return wodRogueNodes().find(n => n.capital) || null; }
function wodRogueLogPush(msg) {
    if(!wodRogue) return;
    wodRogue.log.push(msg);
    if(wodRogue.log.length > 50) wodRogue.log.splice(0, wodRogue.log.length - 50);
}
function wodRogueRenumberRoster(c) {
    if(!c || !c.roster) return;
    let groups = {};
    for(let u of c.roster) {
        if(!u || u.nameCustom) continue;
        let key = u.type || 'light';
        if(!groups[key]) groups[key] = [];
        groups[key].push(u);
    }
    for(let key of Object.keys(groups)) {
        groups[key].sort((a, b) => (a._nameOrder || 0) - (b._nameOrder || 0));
        for(let i = 0; i < groups[key].length; i++)
            groups[key][i].name = wodFormatUnitName(key, i + 1, false);
    }
}
let wodRosterUndo = null;
function wodRogueMoveRoster(id, targetId, after) {
    let c = wodRogueLoad();
    if(!c || c.over || id === targetId) return;
    let from = c.roster.findIndex(u => u.id === id);
    if(from < 0 || !c.roster.some(u => u.id === targetId)) return;
    let [u] = c.roster.splice(from, 1);
    let to = c.roster.findIndex(u => u.id === targetId);
    c.roster.splice(to + (after ? 1 : 0), 0, u);
    wodRogueSave(); wodRefreshCampaignPanel();
}
function wodRogueRosterAdd(type) {
    let c = wodRogueLoad();
    if(!c) return null;
    c.unitSeq++;
    let base = 'Unit';
    let maxHp = WOD_SPECIALIST_UNITS[type]?.hp || (type === 'heavy' ? 300 : type === 'ship' ? 300 : ['transport','supply'].includes(type) ? 50 : 100);
    let unit = {
        id: 'rg_' + c.unitSeq,
        type,
        name: base,
        _nameOrder: c.unitSeq,
        hp: maxHp, maxHp,
        manpower: type === 'ship' ? 5000 : ['transport','supply'].includes(type)?500:1000,
        maxManpower: type === 'ship' ? 5000 : ['transport','supply'].includes(type)?500:1000,
        tanks: type === 'heavy' ? 500 : 0,
        maxTanks: type === 'heavy' ? 500 : 0,
        xp: 0, kills: 0, losses: 0, tankKills: 0, tankLosses: 0,
        veteran: false,
        battles: 0
    };
    c.roster.push(unit);
    wodRogueRenumberRoster(c);
    c.stats.unitsBought++;
    return unit;
}
function wodRogueIsRosterVeteran(u) {
    return !!(u && (u.veteran || (u.xp || 0) >= WOD_VETERAN_XP_THRESHOLD));
}
/** Rename a roster unit from the campaign army panel. */
function wodRogueRosterRename(unitId) {
    let c = wodRogueLoad();
    if(!c || c.over) return;
    let unit = c.roster.find(u => u && u.id === unitId);
    if(!unit) return;
    if(typeof window.wodShowNameInputDialog !== 'function') return;
    window.wodShowNameInputDialog({
        title: 'Rename unit',
        hint: 'Name shown on the war map roster and in battles.',
        label: 'Display name',
        defaultValue: unit.name || 'Unit',
        confirmLabel: 'Apply',
        maxLength: 32,
        requireNonEmpty: 'Name cannot be empty.'
    }).then(nextName => {
        if(nextName == null) return;
        nextName = String(nextName).trim();
        if(nextName.length === 0) { showNotification('Name cannot be empty.'); return; }
        unit.name = nextName.slice(0, 32);
        unit.nameCustom = true;
        wodRogueSave();
        wodRefreshCampaignPanel();
    });
}
function wodRogueDismissRefund(unit) {
    return unit?.battlefieldRecruit?0:Math.floor((WOD_ROGUE_UNIT_COSTS[unit?.type]||0)*0.5);
}
/** Refund only requisition actually spent, never battlefield cash recruits. */
function wodRogueRosterDelete(unitId) {
    let c = wodRogueLoad();
    if(!c || c.over || !unitId) return false;
    let idx = c.roster.findIndex(u => u && u.id === unitId);
    if(idx < 0) return false;
    let u = c.roster[idx];
    let refund = wodRogueDismissRefund(u);
    c.roster.splice(idx, 1);
    wodRogueRenumberRoster(c);
    c.points += refund;
    wodRogueLogPush('Dismissed ' + u.name + (refund ? ' (+' + refund + ' req refund).' : '.'));
    wodRogueSave();
    return true;
}
/* ------------------------- campaign map painting ------------------------- */
function wodRogueEnsureWorldCells() {
    let c = wodRogueLoad();
    let key, W, H, cells, nodes;
    if(c) {
        key = 'save_' + c.seed + '_' + c.settings.length;
        if(_wodRogueWorldCache && _wodRogueWorldCache.key === key) return _wodRogueWorldCache;
        W = c.worldEnc.W; H = c.worldEnc.H;
        cells = wodRogueDecodeCells(c.worldEnc.cells);
        nodes = c.world.nodes;
    } else {
        let d = wodRogueDraft();
        key = 'draft_' + d.seed + '_' + d.length;
        if(_wodRogueWorldCache && _wodRogueWorldCache.key === key) return _wodRogueWorldCache;
        let world = wodRogueGenerateWorld(d.seed, d.length);
        W = world.W; H = world.H;
        cells = world.cells;
        nodes = world.nodes;
        _wodRogueDraftWorld = world;
    }
    // Raise land under any node the noise left offshore.
    for(let n of nodes) {
        let cx = Math.round(n.x * W), cy = Math.round(n.y * H);
        let rad = 6;
        for(let dy = -rad; dy <= rad; dy++) {
            for(let dx = -rad; dx <= rad; dx++) {
                let gx = cx + dx, gy = cy + dy;
                if(gx < 1 || gy < 1 || gx >= W - 1 || gy >= H - 1) continue;
                let d2 = Math.sqrt(dx * dx + dy * dy);
                if(d2 > rad) continue;
                let i = gy * W + gx;
                if(cells[i] !== 'water') continue;
                let wob = fbm(gx * 0.3 + 91, gy * 0.3 + 91, 2);
                if(d2 < rad - 2.4 + wob * 2) cells[i] = d2 > rad - 3.4 ? 'sand' : 'grass';
            }
        }
    }
    _wodRogueWorldCache = { key, W, H, cells, nodes };
    return _wodRogueWorldCache;
}
let _wodRogueDraftWorld = null;
function wodRogueNodeCanvasPos(node, cw, ch) {
    return { x: node.x * cw, y: node.y * ch };
}
let _wodRogueMapBaseCache = null;
let _wodRogueMapBaseKey = '';
function wodRogueMapCacheKey(c, cw, ch, W, H, nodes, edges) {
    let own = '';
    let alerts = '';
    if(c && c.nodesState) {
        for(let n of nodes) {
            let st = c.nodesState[n.id];
            own += n.id + (st && st.owner === 'player' ? 'p' : 'e');
            if(c.alerts && c.alerts[n.id] != null) alerts += n.id + ',';
        }
    }
    return [
        cw, ch, W, H,
        c ? (c.seed | 0) : 'd',
        c ? (c.turn | 0) : 0,
        !!(c && wodRogueAdvanceBlocked(c)),
        own,
        alerts,
        edges.length
    ].join('|');
}
function wodRogueInvalidateMapCache() {
    _wodRogueMapBaseCache = null;
    _wodRogueMapBaseKey = '';
}
function wodRoguePaintMapBase(ctx2,c,W,H,cells,nodes,edges,cw,ch) {
    wodCampaignPaintAtlas(ctx2,c,W,H,cells,nodes,edges,cw,ch);
}
function wodRoguePaintMapNodes(ctx2,c,nodes,cw,ch) {
    wodCampaignPaintMarkers(ctx2,c,nodes,cw,ch);
}
function wodRoguePaintMap(opts) {
    opts = opts || {};
    let cv = document.getElementById('wodCampMapCanvas');
    if(!cv || !cv.getContext) return;
    let ctx2 = cv.getContext('2d');
    let c = wodRogueLoad();
    let { W, H, cells, nodes } = wodRogueEnsureWorldCells();
    let edges = c ? c.world.edges : (_wodRogueDraftWorld ? _wodRogueDraftWorld.edges : []);
    let cw = cv.width, ch = cv.height;
    let key = wodRogueMapCacheKey(c, cw, ch, W, H, nodes, edges);
    let needBase = opts.force || !_wodRogueMapBaseCache || _wodRogueMapBaseKey !== key
        || _wodRogueMapBaseCache.width !== cw || _wodRogueMapBaseCache.height !== ch;
    if(needBase) {
        let off = document.createElement('canvas');
        off.width = cw;
        off.height = ch;
        wodRoguePaintMapBase(off.getContext('2d'), c, W, H, cells, nodes, edges, cw, ch);
        _wodRogueMapBaseCache = off;
        _wodRogueMapBaseKey = key;
    }
    // Blit cached terrain/tint/edges, then redraw only the lightweight node markers.
    // Avoids a full cell-by-cell rebuild (and mobile flash) on every selection click.
    ctx2.drawImage(_wodRogueMapBaseCache, 0, 0);
    wodRoguePaintMapNodes(ctx2, c, nodes, cw, ch);
}
/* --------------------------- panel UI --------------------------- */
let _wodRogueSelectedNode = null;
let _wodRogueSelectedFromNode = null;
let _wodRoguePanelWired = false;
function wodRogueSelectableNodeAtCanvas(mx, my) {
    let cv = document.getElementById('wodCampMapCanvas');
    if(!cv) return null;
    let best = null, bd = Infinity;
    let { nodes } = wodRogueEnsureWorldCells();
    for(let n of nodes) {
        let p = wodRogueNodeCanvasPos(n, cv.width, cv.height);
        let dx = mx - p.x, dy = my - p.y;
        let d = dx * dx + dy * dy;
        const hit=Math.min(60,Math.max(22,22*cv.width/(cv.clientWidth||cv.width)));
        if(d < hit * hit && d < bd) { bd = d; best = n; }
    }
    return best;
}
function wodRogueWirePanelOnce() {
    if(_wodRoguePanelWired) return;
    _wodRoguePanelWired = true;
    wodInitCampaignPeriodBinding();
    window.addEventListener('resize', () => {
        if(document.getElementById('campaignPanel') &&
            !document.getElementById('campaignPanel').classList.contains('hidden'))
            wodCampFitEventLog();
    });
    let cv = document.getElementById('wodCampMapCanvas');
    if(cv) cv.addEventListener('click', (ev) => {
        if(!wodRogueLoad()) return;
        const {x:mx,y:my}=wodCampaignMapPoint(ev,cv);
        let n = wodRogueSelectableNodeAtCanvas(mx, my);
        if(!n || n.id === _wodRogueSelectedNode) return;
        _wodRogueSelectedNode = n.id;
        _wodRogueSelectedFromNode = null;
        // Selection-only: blit cached map + update side info. Avoids mobile flash
        // from rebuilding the whole campaign panel / terrain every tap.
        wodRoguePaintMap();
        wodRefreshCampaignNodeInfoOnly();
    });
    let infoEl = document.getElementById('wodCampNodeInfo');
    if(infoEl) infoEl.addEventListener('change', (ev) => {
        let t = ev.target;
        if(!t || t.id !== 'wodCampFromSelect') return;
        let v = parseInt(t.value, 10);
        _wodRogueSelectedFromNode = Number.isFinite(v) ? v : null;
        wodRefreshCampaignNodeInfoOnly();
    });
    let launch = document.getElementById('wodCampLaunchBtn');
    if(launch) launch.addEventListener('click', () => {
        if(_wodRogueSelectedNode == null) return;
        wodRogueStartBattle(_wodRogueSelectedNode, _wodRogueSelectedFromNode);
    });
    let heal = document.getElementById('wodCampHealBtn');
    if(heal) heal.addEventListener('click', () => {
        let c = wodRogueLoad();
        if(!c) return;
        let cost = wodRogueHealCost();
        if(cost <= 0) { showNotification('The army is at full strength.'); return; }
        if(c.points < cost) { showNotification('Not enough requisition for full repairs.'); return; }
        c.points -= cost;
        for(let u of c.roster) {
            u.hp = u.maxHp;
            u.manpower = u.maxManpower;
            u.tanks = u.maxTanks;
        }
        wodRogueLogPush('Field workshops restore the army to full strength (-' + cost + ' req).');
        wodRogueSave();
        wodRefreshCampaignPanel();
    });
    let reset = document.getElementById('wodCampResetBtn');
    if(reset) reset.addEventListener('click', () => {
        let c = wodRogueLoad();
        if(!c) return;
        wodCloseCampResearchDlg();
        wodRogueDeleteSave();
        wodRefreshCampaignPanel();
    });
    let researchBtn = document.getElementById('wodCampResearchBtn');
    if(researchBtn) researchBtn.addEventListener('click', () => wodOpenCampResearchDlg());
    let researchClose = document.getElementById('wodCampResearchDlgClose');
    if(researchClose) researchClose.addEventListener('click', () => wodCloseCampResearchDlg());
    let researchDlg = document.getElementById('wodCampResearchDlg');
    if(researchDlg && !researchDlg._wodResearchWired) {
        researchDlg._wodResearchWired = true;
        researchDlg.addEventListener('click', (ev) => {
            if(ev.target === researchDlg) wodCloseCampResearchDlg();
        });
        document.addEventListener('keydown', (ev) => {
            if(ev.key !== 'Escape') return;
            if(!researchDlg.classList.contains('hidden')) {
                ev.preventDefault();
                wodCloseCampResearchDlg();
            }
        });
    }
    // Setup controls.
    let begin = document.getElementById('wodCampBeginBtn');
    if(begin) begin.addEventListener('click', () => {
        let d = wodRogueDraft();
        let lenEl = document.getElementById('wodCampSetLen');
        if(lenEl) d.length = lenEl.value;
        wodApplyGamePeriod(wodGetCampaignGamePeriod(), { saveProfile: true });
        wodRogueBegin();
        wodRefreshCampaignPanel();
    });
    let regen = document.getElementById('wodCampRegenBtn');
    if(regen) regen.addEventListener('click', () => {
        let d = wodRogueDraft();
        d.seed = ((d.seed ^ (Math.random() * 0xffffffff)) >>> 0) || 0xabcd1234;
        _wodRogueWorldCache = null;
        wodRogueInvalidateMapCache();
        wodRefreshCampaignPanel();
    });
    let lenSelect = document.getElementById('wodCampSetLen');
    if(lenSelect) lenSelect.addEventListener('change', () => {
        let d = wodRogueDraft();
        d.length = lenSelect.value;
        _wodRogueWorldCache = null;
        wodRogueInvalidateMapCache();
        wodRefreshCampaignPanel();
    });
}
function wodRogueHealCost() {
    let c = wodRogueLoad();
    if(!c) return 0;
    let missing = 0;
    for(let u of c.roster) {
        missing += 1 - (u.hp / u.maxHp);
        if(u.maxTanks > 0) missing += (1 - u.tanks / u.maxTanks) * 0.5;
        missing += (1 - u.manpower / u.maxManpower) * 0.5;
    }
    return Math.ceil(missing * 180);
}
function wodRogueArmyValue() {
    let c = wodRogueLoad();
    if(!c) return 0;
    let v = 0;
    for(let u of c.roster) v += WOD_ROGUE_UNIT_COSTS[u.type] || 200;
    return v;
}
/** In-battle cash upkeep rate for a roster unit type ($/s). */
function wodRogueUnitUpkeepRate(type) {
    if(WOD_SPECIALIST_UNITS[type])return WOD_SPECIALIST_UNITS[type].upkeep;
    if(type === 'heavy') return 4.0;
    if(type==='supply')return .65;
    if(type === 'transport')return .6;
    if(type === 'ship') return 1.5;
    return 0.45; // light + marine
}
function wodRogueRosterUpkeep(roster) {
    let total = 0;
    for(let u of roster || []) total += wodRogueUnitUpkeepRate(u && u.type);
    return total;
}
// The roster order selects the opening half; undeployed paid troops remain safe.
function wodRogueFieldRoster(c) {
    return c.roster.slice(0, Math.ceil(c.roster.length / 2));
}
function wodCampaignReserveUnits(type) {
    let run = gameData._campaignRun, c = wodRogueLoad();
    if(!run || !c || !run.deployedRosterIds) return [];
    let used = new Set(run.deployedRosterIds);
    for(let j of gameData.constructionJobs || []) if(j.rosterId) used.add(j.rosterId);
    return c.roster.filter(r => !used.has(r.id) && (!type || r.type === type));
}
function wodApplyCampaignUnitStats(unit, r) {
    for(let key of ['name', 'nameCustom', 'maxHp', 'maxManpower', 'maxTanks', 'xp', 'kills', 'losses', 'tankKills', 'tankLosses']) unit[key] = r[key];
    unit.hp = Math.max(1, Math.min(r.maxHp, r.hp));
    unit.manpower = Math.max(50, Math.min(r.maxManpower, r.manpower));
    unit.tanks = Math.min(r.maxTanks, r.tanks);
    unit.veteran = !!(r.veteran || (r.xp || 0) >= WOD_VETERAN_XP_THRESHOLD);
    unit._campRosterId = r.id;
}
function wodRogueFormatUpkeep(rate) {
    let n = Math.round((rate || 0) * 100) / 100;
    let body = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return '$' + body + '/s';
}
function wodRogueBattleStartMoney(c) {
    return 12000 + wodRogueResearchMoneyBonus(c);
}
function wodRogueBattleStartManpower(c) {
    return 8000 + wodRogueResearchManpowerBonus(c);
}
/** Deterministic fuzzy garrison intel for a node ("4-6 infantry"). */
function wodRogueNodeIntel(node) {
    let c = wodRogueLoad();
    if(!c || !node || !node.gar) return '';
    let rng = wodRogueRng((c.seed ^ wodRogueMul32(node.id + 101, 0x9e3779b9)) >>> 0);
    function fuzz(nv) {
        if(nv <= 0) return null;
        let lo = Math.max(1, nv - 1 - (rng() < 0.4 ? 1 : 0));
        let hi = nv + 1 + (rng() < 0.4 ? 1 : 0);
        return lo === hi ? String(nv) : lo + '-' + hi;
    }
    let parts = [];
    let fl = fuzz(node.gar.light);
    let fh = fuzz(node.gar.heavy);
    let fs = fuzz(node.gar.ship);
    if(fl) parts.push(fl + ' infantry');
    if(fh) parts.push(fh + ' armor');
    if(fs) parts.push(fs + ' warships');
    if(!parts.length) parts.push('light patrols only');
    return parts.join(' · ');
}
/** Fuzzy enemy battle upkeep estimate from garrison counts. */
function wodRogueNodeEnemyUpkeepIntel(node) {
    let c = wodRogueLoad();
    if(!c || !node || !node.gar) return '';
    let rng = wodRogueRng((c.seed ^ wodRogueMul32(node.id + 707, 0x85ebca6b)) >>> 0);
    let gar = node.gar;
    let exact = (gar.light || 0) * wodRogueUnitUpkeepRate('light')
        + (gar.heavy || 0) * wodRogueUnitUpkeepRate('heavy')
        + (gar.ship || 0) * wodRogueUnitUpkeepRate('ship');
    if(exact <= 0) return '~0/s';
    let spread = Math.max(0.3, exact * 0.12);
    let lo = Math.max(0.1, exact - spread - (rng() < 0.5 ? 0.2 : 0));
    let hi = exact + spread + (rng() < 0.5 ? 0.2 : 0);
    lo = Math.round(lo * 10) / 10;
    hi = Math.round(hi * 10) / 10;
    if(lo === hi) return '~' + wodRogueFormatUpkeep(lo);
    return '~' + lo + '-' + hi + '/s';
}
function wodRogueShapeLabel(shape) {
    return { island: 'Island', archipelago: 'Archipelago', mountain: 'Mountains', forest: 'Forest', desert: 'Desert', rectangle: 'Open country' }[shape] || shape;
}
/** Update only the selected-node card + launch button (used after map taps). */
function wodRefreshCampaignNodeInfoOnly() {
    let c = wodRogueLoad();
    let info = document.getElementById('wodCampNodeInfo');
    let launch = document.getElementById('wodCampLaunchBtn');
    if(!c) {
        if(info) info.innerHTML = '';
        if(launch) { launch.disabled = true; launch.textContent = 'Launch battle'; }
        return;
    }
    let node = _wodRogueSelectedNode != null ? wodRogueNodeTemplate(_wodRogueSelectedNode) : null;
    if(info) {
        if(c.over) {
            info.innerHTML = c.won
                ? '<h3>The war is won</h3><p>' + (wodRogueCapitalNode() || {}).name + ' has fallen after ' + c.turn + ' turns. The Ashen Front is quiet at last.</p>'
                : '<h3>The war is lost</h3><p>The Federation Remnant can no longer field an army. History will remember that you tried.</p>';
        } else if(!node) {
            info.innerHTML = wodRogueAdvanceBlocked(c)
                ? '<p>The Concord has sealed the roads. Select the ⚠ region and defend it before you can advance.</p>'
                : '<p>Select a region on the map. Highlighted regions can be attacked or must be defended.</p>';
        } else {
            let st = c.nodesState[node.id];
            let alert = wodRogueHasAlert(c, node.id);
            let blocked = wodRogueAdvanceBlocked(c);
            let origins = wodRogueBattleOriginOptions(node.id);
            let alertEnt = wodRogueAlertEntry(c, node.id);
            if(origins.length) {
                if(_wodRogueSelectedFromNode == null || origins.indexOf(_wodRogueSelectedFromNode) < 0) {
                    if(alertEnt && alertEnt.fromId != null && origins.indexOf(alertEnt.fromId) >= 0)
                        _wodRogueSelectedFromNode = alertEnt.fromId;
                    else
                        _wodRogueSelectedFromNode = origins[0];
                }
            } else if(_wodRogueSelectedNode === node.id) {
                _wodRogueSelectedFromNode = null;
            }
            let fromNode = _wodRogueSelectedFromNode != null
                ? wodRogueNodeTemplate(_wodRogueSelectedFromNode) : null;
            let approachSide = fromNode ? wodRogueAttackSide(fromNode, node) : null;
            let tag = alert ? '<span class="wod-camp-node-tag alert">UNDER ATTACK — defend it</span>'
                : st.owner === 'player' ? '<span class="wod-camp-node-tag friendly">Held by the Remnant</span>'
                : '<span class="wod-camp-node-tag hostile">' +
                  (wodRogueCountryNames(node).join(' + ') || WOD_WORLD.enemy.name) +
                  (wodRogueEffectiveAiCount(node) > 1 ? ' — allied' : '') +
                  ' · ' + '★'.repeat(node.diff + 1) + '</span>';
            let myUpkeep = wodRogueRosterUpkeep(wodRogueFieldRoster(c));
            let startCash = wodRogueBattleStartMoney(c);
            let startMp = wodRogueBattleStartManpower(c);
            let startEcon = wodRogueEstimateBattleStartIncome(node, _wodRogueSelectedFromNode);
            let incomeLine = startEcon
                ? '<p class="wod-camp-intel"><strong>Starting income:</strong> +' +
                  wodRogueFormatUpkeep(startEcon.cashIncome) +
                  ' <span style="opacity:.85">(cities +' + wodRogueFormatUpkeep(startEcon.cityIncome) +
                  ' · land +' + wodRogueFormatUpkeep(startEcon.landIncome) +
                  ' · ' + startEcon.cities + ' towns)</span></p>'
                : '';
            let netHint = startEcon
                ? '<p class="wod-camp-intel"><strong>Net after upkeep:</strong> ' +
                  (startEcon.cashIncome - myUpkeep >= 0 ? '+' : '') +
                  wodRogueFormatUpkeep(startEcon.cashIncome - myUpkeep) + '</p>'
                : '';
            let missionInfo = '<p class="wod-camp-intel"><strong>Opening reserves:</strong> $' + startCash.toLocaleString() +
                ' · ' + startMp.toLocaleString() + ' manpower</p>' +
                incomeLine +
                netHint;
            let intel = '';
            if(st.owner === 'enemy' || alert) {
                intel = '<p class="wod-camp-intel"><strong>Enemy strength:</strong> ' + wodRogueNodeIntel(node) +
                    (wodRogueEffectiveAiCount(node) > 1
                        ? ' · ' + wodRogueJoinList(wodRogueCountryNames(node)) + ' allied vs the Remnant'
                        : '') + '</p>' +
                    '<p class="wod-camp-intel"><strong>Commanders:</strong> ' +
                    (wodRogueJoinList(wodRogueGeneralNames(node)) || 'unknown garrison') + '</p>' +
                    '<p class="wod-camp-intel"><strong>Enemy upkeep (est.):</strong> ' + wodRogueNodeEnemyUpkeepIntel(node) + '</p>';
            }
            let holdClock = wodFormatHoldClock(WOD_ROGUE_BATTLE_HOLD_SEC);
            let blockNote = '';
            if(blocked && st.owner === 'enemy')
                blockNote = '<p style="color:#ff9d8f">Advance blocked — clear the Concord counterattack first.</p>';
            else if(blocked && alert)
                blockNote = '<p style="color:#ffd968">This defense must be fought before the front can move again. Hold ' +
                    holdClock + ' while retaining a friendly town.</p>';
            else if(alert)
                blockNote = '<p style="color:#ffd968">Defense: hold ' + holdClock +
                    ' while retaining a friendly town, even if you clear the enemy early.</p>';
            else if(st.owner === 'enemy')
                blockNote = '<p style="color:#ffd968">Assault: capture every enemy city. Recruit and build as in skirmish. There is no time limit.</p>';
            let fromPicker = '';
            if(origins.length && (alert || st.owner === 'enemy')) {
                let opts = origins.map(oid => {
                    let on = wodRogueNodeTemplate(oid);
                    let side = on ? wodRogueAttackSide(on, node) : 'west';
                    let sel = oid === _wodRogueSelectedFromNode ? ' selected' : '';
                    return '<option value="' + oid + '"' + sel + '>' +
                        (on ? on.name : ('Region ' + oid)) +
                        ' (' + wodRogueSideLabel(side) + ')</option>';
                }).join('');
                let lbl = alert ? 'Enemy advances from' : 'Attack from';
                let approachHint = approachSide
                    ? '<p class="wod-camp-intel">Battle map orients with the ' +
                      (alert ? 'Concord' : 'Remnant') + ' entering from the ' +
                      wodRogueSideLabel(approachSide) + '.</p>'
                    : '';
                fromPicker = '<div class="wod-camp-from-row"><label for="wodCampFromSelect">' + lbl + '</label>' +
                    '<select id="wodCampFromSelect">' + opts + '</select></div>' + approachHint;
            }
            info.innerHTML = '<h3>' + node.name + (node.industry ? ' 🏭' : node.capital ? ' ★' : node.hq ? ' ⚑' : '') + '</h3>' +
                tag +
                '<p class="wod-camp-intel">' + wodRogueShapeLabel(node.shape) + ' · ' +
                  (wodRogueScaleMapSize(node.size || 60, wodRogueEffectiveAiCount(node)) >= 80 ? 'vast' :
                    (wodRogueScaleMapSize(node.size || 60, wodRogueEffectiveAiCount(node)) >= 60 ? 'large' : 'compact')) +
                  ' battlefield' +
                  (wodRogueEffectiveAiCount(node) > 1 ? ' · ' + (wodRogueEffectiveAiCount(node) + 1) + ' factions' : '') +
                  (alert ? ' · survive ' + holdClock : ' · untimed assault') + '</p>' +
                '<p>' + node.brief + '</p>' +
                (node.industry ? '<p style="color:#d4af37">Industrial region — still worth +' + WOD_ROGUE_REQ_PER_TERRITORY + ' requisition each turn while held.</p>' : '') +
                blockNote +
                fromPicker +
                missionInfo +
                intel;
        }
    }
    if(launch) {
        let playable = node && wodRogueNodePlayable(node.id) && c.roster.length > 0;
        if(playable && wodRogueBattleOriginOptions(node.id).length && _wodRogueSelectedFromNode == null)
            playable = false;
        launch.disabled = !playable;
        if(!node) launch.textContent = 'Launch battle';
        else if(c.roster.length === 0) launch.textContent = 'Recruit an army first';
        else if(wodRogueHasAlert(c, node.id)) launch.textContent = 'Defend ' + node.name;
        else if(wodRogueAdvanceBlocked(c) && c.nodesState[node.id].owner === 'enemy')
            launch.textContent = 'Roads blocked — defend first';
        else if(c.nodesState[node.id].owner === 'enemy') launch.textContent = 'Attack ' + node.name;
        else launch.textContent = 'Launch battle';
    }
}
function wodRefreshCampaignPanel() {
    wodRogueWirePanelOnce();
    let c = wodRogueLoad();
    const panel=document.querySelector('#campaignPanel .wod-camp-panel'),panelScroll=panel?.scrollTop||0;
    document.getElementById('campaignPanel').dataset.phase=c?'active':'setup';
    let setup = document.getElementById('wodCampSetup');
    let active = document.getElementById('wodCampSideActive');
    if(setup) setup.style.display = c ? 'none' : 'flex';
    if(active) active.style.display = c ? 'flex' : 'none';
    let sub = document.getElementById('wodCampSubtitle');
    if(!c) {
        // ---------- setup mode ----------
        let d = wodRogueDraft();
        if(sub) sub.textContent = 'The Remnant’s last war against the Iron Concord.';
        let lenEl = document.getElementById('wodCampSetLen');
        if(lenEl && lenEl.value !== d.length) lenEl.value = d.length;
        let hint = document.getElementById('wodCampSetHint');
        if(hint) hint.textContent = 'Opening requisition: ' + WOD_ROGUE_DEFAULT_POINTS + '.';
        let status = document.getElementById('wodCampStatus');
        if(status) { status.innerHTML = ''; status.style.display = 'none'; }
        let orders = document.getElementById('wodCampOrders');
        if(orders) orders.style.display = 'none';
        let statsEl = document.getElementById('wodCampStats');
        if(statsEl) statsEl.innerHTML = '';
        let log = document.getElementById('wodCampLog');
        if(log) { log.innerHTML = ''; log.style.display = 'none'; }
        wodCloseCampResearchDlg();
        wodRogueRenderResearch(null);
        let resetSetup = document.getElementById('wodCampResetBtn');
        if(resetSetup) resetSetup.style.display = 'none';
        wodSyncAllPeriodSelects();
        wodRoguePaintMap();
        return;
    }
    // ---------- active mode ----------
    let side = document.querySelector('#campaignPanel .wod-camp-side');
    let sideScroll = side ? side.scrollTop : 0;
    if(c.settings && c.settings.gamePeriod) wodSyncPeriodSelectEl(document.getElementById('wodCampActiveGamePeriod'), c.settings.gamePeriod);
    if(_wodRogueSelectedNode == null || (!wodRogueNodeTemplate(_wodRogueSelectedNode))) {
        let firstPlayable = null;
        if(wodRogueAdvanceBlocked(c)) {
            firstPlayable = wodRogueNodes().find(n => c.alerts[n.id] && c.nodesState[n.id] && c.nodesState[n.id].owner === 'player');
        }
        if(!firstPlayable) firstPlayable = wodRogueNodes().find(n => wodRogueNodePlayable(n.id));
        _wodRogueSelectedNode = firstPlayable ? firstPlayable.id : null;
    } else if(wodRogueAdvanceBlocked(c) && !wodRogueNodePlayable(_wodRogueSelectedNode)) {
        let alertNode = wodRogueNodes().find(n => c.alerts[n.id] && c.nodesState[n.id] && c.nodesState[n.id].owner === 'player');
        if(alertNode) _wodRogueSelectedNode = alertNode.id;
    }
    wodRoguePaintMap();
    let orders = document.getElementById('wodCampOrders');
    if(orders) orders.style.display = 'flex';
    let status = document.getElementById('wodCampStatus');
    if(status) {
        let held = Object.values(c.nodesState).filter(n => n.owner === 'player').length;
        let per = wodRogueResearchReqPerTerritory(c);
        let turnIncome = held * per;
        status.style.display = 'flex';
        status.innerHTML =
            '<span class="wod-camp-chip"><b>' + c.points + '</b> requisition</span>' +
            '<span class="wod-camp-chip">Turn <b>' + c.turn + '</b></span>' +
            '<span class="wod-camp-chip"><b>' + held + '/' + wodRogueNodes().length + '</b> regions</span>' +
            '<span class="wod-camp-chip"><b>+' + turnIncome + '</b> / turn</span>';
    }
    let statsEl = document.getElementById('wodCampStats');
    if(statsEl) {
        let s = c.stats || {};
        statsEl.innerHTML =
            '<span><strong>' + (s.battles || 0) + '</strong> battles (' + (s.wins || 0) + 'W-' + (s.defeats || 0) + 'L)</span>' +
            '<span><strong>' + Math.round(s.kills || 0).toLocaleString() + '</strong> enemy troops killed</span>' +
            '<span><strong>' + Math.round(s.losses || 0).toLocaleString() + '</strong> troops lost</span>' +
            '<span><strong>' + (s.unitsKilled || 0) + '</strong> units killed</span>' +
            '<span><strong>' + (s.unitsLost || 0) + '</strong> units lost</span>' +
            '<span><strong>' + (s.unitsBought || 0) + '</strong> units recruited</span>';
    }
    if(sub) {
        if(c.over) sub.textContent = c.won ? 'Victory — the Iron Concord has fallen. Surrender the save to wage a new war.' : 'Campaign over — the Remnant is spent. Surrender the save to try again.';
        else if(wodRogueAdvanceBlocked(c))
            sub.textContent = 'Roads blocked — defend the threatened region before the front can advance again.';
        else sub.textContent = 'One army, one war — every casualty is permanent.';
    }
    // Node info + intel.
    wodRefreshCampaignNodeInfoOnly();
    // Roster.
    let roster = document.getElementById('wodCampRoster');
    let count = document.getElementById('wodCampArmyCount');
    if(count) {
        let upkeep = wodRogueRosterUpkeep(wodRogueFieldRoster(c));
        count.textContent = c.roster.length + '/' + WOD_ROGUE_MAX_ROSTER + ' units · worth ' +
            wodRogueArmyValue() + ' · ' + Math.ceil(c.roster.length/2) + ' fielded / ' + Math.floor(c.roster.length/2) + ' reserve · upkeep ' + wodRogueFormatUpkeep(upkeep);
    }
    if(roster) {
        let rosterScroll = roster.scrollTop;
        roster.innerHTML = '';
        if(!c.roster.length) {
            roster.innerHTML = '<div class="wod-camp-unit" style="justify-content:center;color:#95a5a6">None yet.</div>';
        }
        for(let [rosterIndex, u] of c.roster.entries()) {
            let row = document.createElement('div');
            let isVet = wodRogueIsRosterVeteran(u);
            row.className = 'wod-camp-unit' + (isVet ? ' wod-camp-unit--vet' : '');
            let hpFrac = Math.max(0, Math.min(1, u.hp / u.maxHp));
            let vetLabel = isVet
                ? '<span class="wod-camp-vet-tag">★ Veteran' + ((u.xp | 0) ? ' · ' + Math.floor(u.xp) + ' XP' : '') + '</span>'
                : ((u.xp | 0) > 0 ? '<span class="wod-camp-vet-tag" style="color:#95a5a6;font-weight:500">' + Math.floor(u.xp) + ' XP</span>' : '');
            row.innerHTML =
                '<div class="wod-camp-unit-meta">' +
                    '<span class="wod-camp-unit-title">' + (isVet ? '<span class="vet">★</span> ' : '') + u.name + '</span>' +
                    '<span style="color:#7f9bb3;font-size:10px">' + (rosterIndex < Math.ceil(c.roster.length/2) ? 'Fielded' : 'Reserve') + ' · ' + wodRogueUnitLabel(u.type) + '</span>' +
                    vetLabel +
                '</div>' +
                '<div class="wod-camp-unit-right">' +
                    '<span class="hpbar"><i class="' + (hpFrac < 0.45 ? 'low' : '') + '" style="width:' + Math.round(hpFrac * 100) + '%"></i></span>' +
                    (c.over ? '' : '<button type="button" class="wod-camp-rename" data-camp-rename="' + u.id + '" title="Rename unit">✎</button>') +
                    (c.over ? '' : '<button type="button" class="wod-camp-del" data-camp-del="' + u.id + '" title="'+(u.battlefieldRecruit?'Dismiss battlefield recruit (no requisition refund)':'Dismiss unit (50% refund)')+'">✕</button>') +
                '</div>';
            row.dataset.rosterId = u.id;
            row.draggable = !c.over;
            row.tabIndex = 0;
            row.title = 'Drag to reorder; Alt + Up/Down also moves this unit.';
            let handle = document.createElement('span');
            handle.textContent = '⠿'; handle.style.cssText = 'cursor:grab;font-size:22px;padding:8px;touch-action:none';
            handle.setAttribute('aria-label', 'Drag to reorder');
            row.prepend(handle);
            row.addEventListener('dragstart', ev => {
                ev.dataTransfer.setData('application/x-wod-roster', u.id);
                ev.dataTransfer.setData('text/plain', u.id);
                ev.dataTransfer.effectAllowed = 'move';
            });
            row.addEventListener('dragover', ev => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; });
            row.addEventListener('drop', ev => {
                ev.preventDefault();
                let id = ev.dataTransfer.getData('application/x-wod-roster');
                wodRogueMoveRoster(id, u.id, ev.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2);
            });
            row.addEventListener('keydown', ev => {
                if(!ev.altKey || !['ArrowUp', 'ArrowDown'].includes(ev.key)) return;
                ev.preventDefault();
                let i = c.roster.findIndex(r => r.id === u.id), j = i + (ev.key === 'ArrowUp' ? -1 : 1);
                if(c.roster[j]) wodRogueMoveRoster(u.id, c.roster[j].id, j > i);
            });
            // Touch dragging uses the handle, leaving list scrolling on the row.
            handle.addEventListener('pointerdown', ev => {
                if(ev.pointerType === 'mouse' || c.over) return;
                ev.preventDefault(); handle.setPointerCapture(ev.pointerId);
            });
            handle.addEventListener('pointerup', ev => {
                if(ev.pointerType === 'mouse' || !handle.hasPointerCapture(ev.pointerId)) return;
                let target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-roster-id]');
                if(target) wodRogueMoveRoster(u.id, target.dataset.rosterId, ev.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2);
            });
            roster.appendChild(row);
        }
        roster.querySelectorAll('[data-camp-rename]').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                let id = btn.getAttribute('data-camp-rename');
                if(id) wodRogueRosterRename(id);
            });
        });
        roster.querySelectorAll('[data-camp-del]').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                let id = btn.getAttribute('data-camp-del');
                if(!id) return;
                let idx = c.roster.findIndex(u => u.id === id);
                let unit = c.roster[idx];
                if(unit && wodRogueRosterDelete(id)) {
                    wodRosterUndo = { unit, idx, refund: wodRogueDismissRefund(unit) };
                    wodRefreshCampaignPanel();
                }
            });
        });
        if(wodRosterUndo && !c.over) {
            let undo = document.createElement('button');
            undo.type = 'button'; undo.className = 'menu-btn'; undo.textContent = 'Undo last dismissal';
            undo.disabled = c.points < wodRosterUndo.refund || c.roster.length >= WOD_ROGUE_MAX_ROSTER;
            undo.onclick = () => {
                if(undo.disabled) return;
                c.points -= wodRosterUndo.refund;
                c.roster.splice(Math.min(wodRosterUndo.idx, c.roster.length), 0, wodRosterUndo.unit);
                wodRosterUndo = null; wodRogueSave(); wodRefreshCampaignPanel();
            };
            roster.appendChild(undo);
        }
        roster.scrollTop = rosterScroll;
    }
    // Shop.
    let shop = document.getElementById('wodCampShop');
    const shopStamp=c.settings.gamePeriod||'modern';
    if(shop&&shop.dataset.catalogPeriod!==shopStamp) {
        shop.dataset.catalogPeriod=shopStamp;shop.innerHTML = '';
        for(let t of ['light','motorized','mountaineer','marine','heavy','ship','transport','supply']) {
            let b = document.createElement('button');
            b.type = 'button';
            b.className = 'menu-btn';b.dataset.recruitType=t;
            let cost = WOD_ROGUE_UNIT_COSTS[t];
            let unitUp = wodRogueUnitUpkeepRate(t);
            b.textContent = wodRogueUnitLabel(t) + ' — ' + cost + ' · +' + wodRogueFormatUpkeep(unitUp);
            b.title = wodRogueUnitLabel(t) + ' costs ' + cost + ' requisition and adds ' +
                wodRogueFormatUpkeep(unitUp) + ' $ upkeep in battle.';
            b.disabled = c.over || c.points < cost || c.roster.length >= WOD_ROGUE_MAX_ROSTER;
            b.addEventListener('click', () => {
                let cc = wodRogueLoad();
                if(!cc || cc.points < cost || cc.roster.length >= WOD_ROGUE_MAX_ROSTER) return;
                cc.points -= cost;
                let u = wodRogueRosterAdd(t);
                if(u) wodRogueLogPush(u.name + ' (' + wodRogueUnitLabel(t) + ') joins the army (-' + cost + ' req).');
                wodRogueSave();
                wodRefreshCampaignPanel();
            });
            shop.appendChild(b);
        }
    }
    if(shop)for(const b of shop.querySelectorAll('[data-recruit-type]'))b.disabled=c.over||c.points<WOD_ROGUE_UNIT_COSTS[b.dataset.recruitType]||c.roster.length>=WOD_ROGUE_MAX_ROSTER;
    let healBtn = document.getElementById('wodCampHealBtn');
    if(healBtn) {
        let hc = wodRogueHealCost();
        healBtn.textContent = hc > 0 ? 'Field repairs — ' + hc : 'Army at full strength';
        healBtn.disabled = c.over || hc <= 0 || c.points < hc;
    }
    let resetBtn = document.getElementById('wodCampResetBtn');
    if(resetBtn) {
        resetBtn.textContent = 'Surrender';
        resetBtn.style.display = '';
    }
    wodRogueRenderResearch(c);
    // War log (newest first).
    let log = document.getElementById('wodCampLog');
    if(log) {
        log.style.display = '';
        log.innerHTML = c.log.slice().reverse().map((l, i) =>
            '<p>' + (i === 0 ? '<strong>' + l + '</strong>' : l) + '</p>').join('');
    }
    if(side) side.scrollTop = sideScroll;
    if(panel)panel.scrollTop=panelScroll;
    // Keep the chronicle scroll box flush with the side panel (research / heal row).
    requestAnimationFrame(() => wodCampFitEventLog());
}
/** Cap the campaign event log so it never hangs below the side panel actions. */
function wodCampFitEventLog() {
    let mapCol = document.querySelector('#campaignPanel .wod-camp-map-col');
    let log = document.getElementById('wodCampLog');
    if(mapCol) mapCol.style.maxHeight = '';
    if(log) {
        log.style.maxHeight = '';
        log.style.minHeight = '';
    }
}
/* --------------------------- battle launch --------------------------- */
function wodRogueEnsureNodeTowns(node, c) {
    if(!node) return [];
    if(Array.isArray(node.towns) && node.towns.length) return node.towns;
    let used = new Set();
    for(let n of (c && c.world && c.world.nodes) || []) {
        if(n && n.name) used.add(n.name);
        if(n && Array.isArray(n.towns)) for(let t of n.towns) used.add(t);
    }
    let seed = ((c && c.seed) || 1) ^ wodRogueMul32((node.id || 0) + 17, 0x9e3779b9);
    let rng = wodRogueRng(seed >>> 0 || 0x51ed270b);
    let terr = node.shape === 'archipelago' || node.shape === 'island' ? 'water'
        : node.shape === 'mountain' ? 'mountain'
        : node.shape === 'forest' ? 'forest'
        : node.shape === 'desert' ? 'sand' : 'grass';
    let towns = [node.name || 'Front'];
    let want = node.hq ? 2 : (2 + wodRogueEffectiveAiCount(node) * 2 + (node.capital ? 1 : 0));
    while(towns.length < want) {
        let tn = wodRogueMakeName(rng, terr, used);
        if(towns.indexOf(tn) < 0) towns.push(tn);
    }
    node.towns = towns;
    return towns;
}
/**
 * Build a battle map by zooming into the war-map cells around a region node.
 * City names come from the node's towns list so the battlefield matches the
 * area being attacked rather than a random similarly-shaped map.
 */
function wodRogueBuildRegionBattleMap(nodeId, fromNodeId) {
    let c = wodRogueLoad();
    let node = wodRogueNodeTemplate(nodeId);
    if(!c || !node) return null;
    let world = wodRogueEnsureWorldCells();
    if(!world || !world.cells || !world.W) return null;
    let W = world.W, H = world.H, cells = world.cells;
    let aiCount = wodRogueEffectiveAiCount(node);
    let sizeVal = wodRogueScaleMapSize(node.size || 60, aiCount);
    let preset = wodMapSizePreset(sizeVal);
    let mapR = preset.mapRadius;
    let hr = preset.hexRadius;
    let rows = Math.floor(mapR * (preset.rowsMul || 0.8));
    let spacing = hr * 1.35;
    let cx = node.gx != null ? (node.gx | 0) : Math.round(node.x * W);
    let cy = node.gy != null ? (node.gy | 0) : Math.round(node.y * H);
    // Zoom window: cover the battle grid with a bit of padding so coasts stay visible.
    let zoomPad = aiCount >= 3 ? 0.5 : (aiCount >= 2 ? 0.46 : 0.42);
    let halfCellsX = Math.max(10, Math.ceil(mapR * zoomPad));
    let halfCellsY = Math.max(8, Math.ceil(rows * zoomPad));
    let x0 = Math.max(0, Math.min(W - 1, cx - halfCellsX));
    let x1 = Math.max(0, Math.min(W - 1, cx + halfCellsX));
    let y0 = Math.max(0, Math.min(H - 1, cy - halfCellsY));
    let y1 = Math.max(0, Math.min(H - 1, cy + halfCellsY));
    // If the window is clipped by the world edge, shift it back toward the node.
    if(x1 - x0 < halfCellsX * 2) {
        if(x0 === 0) x1 = Math.min(W - 1, x0 + halfCellsX * 2);
        else x0 = Math.max(0, x1 - halfCellsX * 2);
    }
    if(y1 - y0 < halfCellsY * 2) {
        if(y0 === 0) y1 = Math.min(H - 1, y0 + halfCellsY * 2);
        else y0 = Math.max(0, y1 - halfCellsY * 2);
    }
    let cellW = Math.max(1, x1 - x0 + 1);
    let cellH = Math.max(1, y1 - y0 + 1);
    let seed = (c.seed ^ wodRogueMul32(nodeId + 91, 0x85ebca6b)) >>> 0;
    let rng = wodRogueRng(seed || 0x51ed270b);
    let owners = [1];
    for(let o = 2; o <= aiCount + 1; o++) owners.push(o);
    let defense = wodRogueHasAlert(c, nodeId);
    let origins = wodRogueBattleOriginOptions(nodeId);
    let resolvedFrom = fromNodeId;
    if(resolvedFrom == null || origins.indexOf(resolvedFrom) < 0) {
        let alertEnt = wodRogueAlertEntry(c, nodeId);
        if(alertEnt && alertEnt.fromId != null && origins.indexOf(alertEnt.fromId) >= 0)
            resolvedFrom = alertEnt.fromId;
        else if(origins.length) resolvedFrom = origins[0];
        else resolvedFrom = null;
    }
    let fromNode = resolvedFrom != null ? wodRogueNodeTemplate(resolvedFrom) : null;
    // Attacker enters from the war-map direction of the chosen origin province.
    let attackerSide = fromNode ? wodRogueAttackSide(fromNode, node) : 'west';
    let playerSide = defense ? wodRogueOppositeSide(attackerSide) : attackerSide;

    let hexList = [];
    let hexes = {};
    for(let r = -rows; r <= rows; r++) {
        for(let q = -mapR; q <= mapR; q++) {
            let u = (q + mapR) / Math.max(1, mapR * 2);
            let v = (r + rows) / Math.max(1, rows * 2);
            let gx = Math.max(x0, Math.min(x1, x0 + Math.floor(u * (cellW - 0.0001))));
            let gy = Math.max(y0, Math.min(y1, y0 + Math.floor(v * (cellH - 0.0001))));
            let t = cells[gy * W + gx] || 'grass';
            // Soften pure mountain walls so battles stay playable.
            if(t === 'mountain' && rng() < 0.18) t = 'hill';
            let x = q * spacing, y = r * spacing;
            let hex = {
                q, r, x, y,
                type: t,
                owner: 0,
                baseColor: null,
                renderColor: null
            };
            hexList.push(hex);
            hexes[`${q},${r}`] = hex;
        }
    }

    function isLandHex(h) {
        return h && h.type !== 'water' && h.type !== 'mountain';
    }
    function sideDepth(h, side) {
        if(side === 'west') return -h.q;
        if(side === 'east') return h.q;
        if(side === 'north') return -h.r;
        return h.r;
    }
    function sideBand(h, side) {
        return (side === 'west' || side === 'east') ? h.r : h.q;
    }
    function sideDepthSpan(side) {
        return (side === 'west' || side === 'east') ? mapR : Math.max(rows, 1);
    }
    /** Pick cities in each side's rear (behind the front), spread along the front — not map-edge deep. */
    function pickLandSites(side, count, avoid) {
        let rowSpan = Math.max(rows, 1);
        let depthSpan = sideDepthSpan(side);
        // Mid-rear band: behind the front, but not jammed against the outer rim.
        let idealDepth = depthSpan * 0.38;
        let maxDepth = depthSpan * 0.55;
        let rimQ = mapR * 0.88;
        let rimR = rowSpan * 0.88;
        function siteScore(h) {
            let depth = sideDepth(h, side);
            // Prefer a mid-rear band — not the front, not the far back wall.
            let score = depth * 1.6 - Math.abs(depth - idealDepth) * 2.4;
            if(depth > maxDepth) score -= (depth - maxDepth) * 5.5;
            // Keep clear of the central front strip.
            let frontClear = depthSpan * 0.18;
            if(depth < frontClear) score -= (frontClear - depth) * 5.5;
            // Soft rim penalty so towns are not jammed on the map edge.
            if(Math.abs(h.q) > rimQ) score -= (Math.abs(h.q) - rimQ) * 6;
            if(Math.abs(h.r) > rimR) score -= (Math.abs(h.r) - rimR) * 5;
            // Prefer solid land with a little local footprint room.
            let neighbors = 0;
            for(let dq = -1; dq <= 1; dq++) {
                for(let dr = -1; dr <= 1; dr++) {
                    if(!dq && !dr) continue;
                    let n = hexes[`${h.q + dq},${h.r + dr}`];
                    if(n && isLandHex(n)) neighbors++;
                }
            }
            score += neighbors * 0.35;
            return score;
        }
        function tooCloseTo(h, list, minDist) {
            for(let c of list) {
                let dx = c.x - h.x, dy = c.y - h.y;
                if(Math.sqrt(dx * dx + dy * dy) < minDist) return true;
            }
            return false;
        }
        // Keep towns clearly separated (urban footprints are ~2 hexes wide).
        let minDistBase = Math.max(hr * 26, mapR * hr * 0.42);
        let minDistFloor = Math.max(hr * 18, mapR * hr * 0.28);
        let depthFracs = [0.28, 0.22, 0.16, 0.10, 0.06];
        let bestPartial = [];

        for(let di = 0; di < depthFracs.length; di++) {
            let minDepth = depthSpan * depthFracs[di];
            let pool = [];
            for(let h of hexList) {
                if(!isLandHex(h)) continue;
                if(sideDepth(h, side) < minDepth) continue;
                // Cap how far back towns can sit.
                if(sideDepth(h, side) > depthSpan * 0.62) continue;
                if(Math.abs(h.r) > rowSpan * 0.92) continue;
                if(Math.abs(h.q) > mapR * 0.92) continue;
                pool.push(h);
            }
            if(pool.length < Math.max(1, count)) continue;

            let bMin = Infinity, bMax = -Infinity;
            for(let h of pool) {
                let bc = sideBand(h, side);
                if(bc < bMin) bMin = bc;
                if(bc > bMax) bMax = bc;
            }
            let bRange = Math.max(1, bMax - bMin);

            for(let sepPass = 0; sepPass < 5; sepPass++) {
                let minDist = Math.max(minDistFloor, minDistBase * (1 - sepPass * 0.08));
                let avoidDist = minDist * 0.95;
                let out = [];
                let bandPad = bRange * (0.08 + sepPass * 0.03);

                for(let bi = 0; bi < count; bi++) {
                    let t0 = bi / Math.max(1, count);
                    let t1 = (bi + 1) / Math.max(1, count);
                    let bandLo = bMin + bRange * t0 - bandPad;
                    let bandHi = bMin + bRange * t1 + bandPad;
                    // Stagger depth slightly so cities aren't on one line.
                    let depthBias = idealDepth * (0.88 + (bi % 3) * 0.08);
                    let band = pool.filter(h => {
                        let bc = sideBand(h, side);
                        return bc >= bandLo && bc <= bandHi;
                    });
                    if(band.length < 3) band = pool;
                    band.sort((a, b) => {
                        let sa = siteScore(a) - Math.abs(sideDepth(a, side) - depthBias) * 0.4;
                        let sb = siteScore(b) - Math.abs(sideDepth(b, side) - depthBias) * 0.4;
                        return sb - sa;
                    });
                    let picked = null;
                    for(let h of band) {
                        if(tooCloseTo(h, out, minDist)) continue;
                        if(avoid && avoid.length && tooCloseTo(h, avoid, avoidDist)) continue;
                        picked = h;
                        break;
                    }
                    if(picked) out.push(picked);
                }

                if(out.length < count) {
                    let rest = pool.slice().sort((a, b) => siteScore(b) - siteScore(a));
                    for(let h of rest) {
                        if(out.length >= count) break;
                        if(out.indexOf(h) >= 0) continue;
                        if(tooCloseTo(h, out, minDist * 0.88)) continue;
                        if(avoid && avoid.length && tooCloseTo(h, avoid, avoidDist * 0.88)) continue;
                        out.push(h);
                    }
                }

                if(out.length > bestPartial.length) bestPartial = out.slice();
                if(out.length >= count) return out.slice(0, count);
            }
        }

        // Prefer fewer well-spaced towns over a packed cluster.
        if(bestPartial.length) return bestPartial.slice(0, count);
        let fallback = [];
        for(let h of hexList) {
            if(!isLandHex(h)) continue;
            if(sideDepth(h, side) <= 0) continue;
            if(tooCloseTo(h, fallback, minDistFloor)) continue;
            if(avoid && avoid.length && tooCloseTo(h, avoid, minDistFloor * 0.9)) continue;
            fallback.push(h);
            if(fallback.length >= count) break;
        }
        if(fallback.length) return fallback.slice(0, count);
        // Absolute last resort: deepest land, still trying to keep spacing.
        let deep = [];
        for(let h of hexList) {
            if(!isLandHex(h)) continue;
            if(sideDepth(h, side) <= 0) continue;
            deep.push(h);
        }
        deep.sort((a, b) => siteScore(b) - siteScore(a));
        let spaced = [];
        for(let h of deep) {
            if(spaced.length >= count) break;
            if(tooCloseTo(h, spaced, minDistFloor * 0.75)) continue;
            spaced.push(h);
        }
        return spaced.length ? spaced : deep.slice(0, Math.min(count, 1));
    }

    let townNames = wodRogueEnsureNodeTowns(node, c).slice();
    let townWant = Math.max(4, 2 + aiCount * 2 + (node.capital ? 1 : 0));
    while(townNames.length < townWant) {
        let used = new Set(townNames);
        for(let n of c.world.nodes || []) if(n && n.name) used.add(n.name);
        townNames.push(wodRogueMakeName(rng, node.shape === 'desert' ? 'sand' : 'grass', used));
    }
    if(c) wodRogueSave();
    let citiesPerPlayer = aiCount >= 3 ? 3 : (aiCount >= 2 ? 3 : Math.max(2, Math.min(4, Math.ceil(townNames.length / 2))));
    let citiesPerAi = aiCount >= 3 ? 2 : (aiCount >= 2 ? 2 : citiesPerPlayer);
    let enemySide = wodRogueOppositeSide(playerSide);
    let playerSites = pickLandSites(playerSide, citiesPerPlayer, []);
    let enemySites = pickLandSites(enemySide, citiesPerAi * aiCount, playerSites);
    // Capitals/factories first: deepest sites in each rear.
    function orderDeepestFirst(sites, side) {
        return (sites || []).slice().sort((a, b) => {
            let da = sideDepth(a, side);
            let db = sideDepth(b, side);
            if(db !== da) return db - da;
            let ba = sideBand(a, side);
            let bb = sideBand(b, side);
            return ba - bb;
        });
    }
    playerSites = orderDeepestFirst(playerSites, playerSide);
    enemySites = orderDeepestFirst(enemySites, enemySide);
    // Ensure at least one city each.
    if(!playerSites.length) {
        let any = hexList.find(isLandHex);
        if(any) playerSites = [any];
    }
    if(!enemySites.length) {
        let any = hexList.find(h => isLandHex(h) && playerSites.indexOf(h) < 0);
        if(any) enemySites = [any];
    }

    let cities = [];
    let nameIdx = 0;
    function addCity(site, owner, isCapital) {
        if(!site) return;
        let nm = townNames[nameIdx % townNames.length] || (node.name + ' ' + (nameIdx + 1));
        nameIdx++;
        // First player city keeps the region name when attacking/defending that region.
        if(owner === 1 && isCapital) nm = node.name || nm;
        let cid = 'city_' + cities.length;
        let city = {
            id: cid,
            name: nm,
            x: site.x, y: site.y, q: site.q, r: site.r,
            owner,
            hasFactory: false,
            hasHarbor: false,
            hasFarm: false,
            hp: 1000, maxHp: 1000,
            urbanStyle: (seed + cities.length) % 4,
            incomeBonus: 0,
            manpowerBonus: 0
        };
        cities.push(city);
        site.owner = owner;
        // Stamp a compact urban footprint.
        for(let dq = -2; dq <= 2; dq++) {
            for(let dr = -2; dr <= 2; dr++) {
                if(dq * dq + dr * dr > 5) continue;
                let th = hexes[`${site.q + dq},${site.r + dr}`];
                if(!th || th.type === 'water' || th.type === 'mountain') continue;
                th.type = 'urban';
                th.cityId = cid;
                th.urbanVariant = (seed + Math.abs(dq) + Math.abs(dr)) % 5;
                th.owner = owner;
            }
        }
        // Claim a hinterland blob around each town.
        let claimR = Math.max(5, Math.floor(mapR * (aiCount >= 3 ? 0.15 : (aiCount >= 2 ? 0.17 : 0.2))));
        for(let dq = -claimR; dq <= claimR; dq++) {
            for(let dr = -claimR; dr <= claimR; dr++) {
                if(dq * dq + dr * dr > claimR * claimR) continue;
                let th = hexes[`${site.q + dq},${site.r + dr}`];
                if(!th || th.type === 'water' || th.type === 'mountain') continue;
                if(th.owner === 0) th.owner = owner;
            }
        }
    }
    for(let i = 0; i < playerSites.length; i++) addCity(playerSites[i], 1, i === 0);
    // Each allied country holds a sector of the enemy rear, not a shared pile.
    let aiOwners = owners.filter(o => o > 1);
    let enemySorted = enemySites.slice().sort((a, b) => sideBand(a, enemySide) - sideBand(b, enemySide));
    let firstCityForOwner = {};
    for(let i = 0; i < enemySorted.length; i++) {
        let slot = aiOwners.length
            ? Math.min(aiOwners.length - 1, Math.floor(i * aiOwners.length / Math.max(1, enemySorted.length)))
            : 0;
        let ow = aiOwners[slot] || 2;
        addCity(enemySorted[i], ow, !firstCityForOwner[ow]);
        firstCityForOwner[ow] = true;
    }

    // Fill remaining unclaimed land by nearest city (keeps a clear front).
    for(let h of hexList) {
        if(h.owner !== 0 || h.type === 'water' || h.type === 'mountain') continue;
        let best = null, bd = Infinity;
        for(let city of cities) {
            let dx = city.x - h.x, dy = city.y - h.y;
            let d = dx * dx + dy * dy;
            if(d < bd) { bd = d; best = city; }
        }
        if(best) h.owner = best.owner;
    }
    // Full-map water/mountain ownership from nearest land (same idea as skirmish Voronoi seas).
    let waterQ = [];
    let waterSeen = new Set();
    for(let h of hexList) {
        if(!h || h.owner <= 0) continue;
        if(h.type === 'water' || h.type === 'deep_water' || h.type === 'mountain') continue;
        waterSeen.add(`${h.q},${h.r}`);
        waterQ.push(h);
    }
    for(let qi = 0; qi < waterQ.length; qi++) {
        let cur = waterQ[qi];
        for(let di = 0; di < cardinalHexDirections.length; di++) {
            let dir = cardinalHexDirections[di];
            let nb = hexes[`${cur.q + dir.q},${cur.r + dir.r}`];
            if(!nb) continue;
            if(nb.type !== 'water' && nb.type !== 'deep_water' && nb.type !== 'mountain') continue;
            let nk = `${nb.q},${nb.r}`;
            if(waterSeen.has(nk)) continue;
            waterSeen.add(nk);
            nb.owner = cur.owner;
            waterQ.push(nb);
        }
    }

    let roads = [];
    for(let i = 0; i < cities.length; i++) {
        let c1 = cities[i];
        let best = null, bd = Infinity;
        for(let j = 0; j < cities.length; j++) {
            if(i === j) continue;
            let c2 = cities[j];
            let dx = c1.x - c2.x, dy = c1.y - c2.y;
            let d = dx * dx + dy * dy;
            if(d < bd) { bd = d; best = c2; }
        }
        if(best) roads.push({ from: c1, to: best });
    }

    return {
        mapSize: mapR,
        mapShape: node.shape || 'rectangle',
        hexList,
        cities,
        roads,
        entities: [],
        forts: [],
        bridges: [],
        alliances: wodRogueAllyAiOwners(aiCount),
        savedStartEconomy: false,
        _campaignRegion: true,
        _regionNodeId: nodeId,
        _regionFromNodeId: resolvedFrom,
        _regionPlayerSide: playerSide,
        _regionAttackerSide: attackerSide,
        _regionName: node.name
    };
}
let _wodRogueStartIncomeCache = { key: '', econ: null };
/** Estimate opening city + land cash income for a selected campaign region battle. */
function wodRogueEstimateBattleStartIncome(node, fromNodeId) {
    let c = wodRogueLoad();
    if(!c || !node) return null;
    let defense = wodRogueHasAlert(c, node.id);
    let battles = (c.nodesState[node.id] && c.nodesState[node.id].battles) || 0;
    let fromKey = fromNodeId != null ? fromNodeId : 'auto';
    let key = c.seed + ':' + node.id + ':' + fromKey + ':' + (defense ? 1 : 0) + ':' + battles + ':' +
        wodRogueScaleMapSize(node.size || 0, wodRogueEffectiveAiCount(node)) + ':' + wodRogueEffectiveAiCount(node);
    if(_wodRogueStartIncomeCache.key === key && _wodRogueStartIncomeCache.econ)
        return _wodRogueStartIncomeCache.econ;
    let regionMap = null;
    try { regionMap = wodRogueBuildRegionBattleMap(node.id, fromNodeId); } catch(_) { regionMap = null; }
    if(!regionMap || !regionMap.cities) return null;
    let cityIncome = 0;
    let cityN = 0;
    let mult = WOD_CITY_ECON_TICK_MULT * WOD_INCOME_MULT;
    for(let city of regionMap.cities) {
        if(!city || city.owner !== 1) continue;
        cityN++;
        let total = 5;
        if(city.hasFactory) total += 15;
        if(city.hasHarbor) total += 3;
        total += city.incomeBonus || 0;
        cityIncome += Math.round(total * mult * 1000) / 1000;
    }
    let landTiles = 0;
    for(let h of regionMap.hexList || []) {
        if(!h || h.owner !== 1) continue;
        if(h.type === 'water' || h.type === 'deep_water') continue;
        landTiles++;
    }
    let landIncome = Math.round(landTiles * WOD_LAND_INCOME_PER_HEX * WOD_INCOME_MULT * 1000) / 1000;
    let cashIncome = Math.round((cityIncome + landIncome + (cityN > 0 ? WOD_COMMAND_INCOME : 0)) * 1000) / 1000;
    let econ = { cashIncome, cityIncome, landIncome, cities: cityN, landTiles };
    _wodRogueStartIncomeCache = { key, econ };
    return econ;
}
function wodRogueStartBattle(nodeId, fromNodeId) {
    let c = wodRogueLoad();
    let node = wodRogueNodeTemplate(nodeId);
    if(!c || !node || c.over || !wodRogueNodePlayable(nodeId) || !c.roster.length) return;
    let defense = wodRogueHasAlert(c, nodeId);
    let origins = wodRogueBattleOriginOptions(nodeId);
    let resolvedFrom = fromNodeId;
    if(resolvedFrom == null || origins.indexOf(resolvedFrom) < 0) {
        let alertEnt = wodRogueAlertEntry(c, nodeId);
        if(alertEnt && alertEnt.fromId != null && origins.indexOf(alertEnt.fromId) >= 0)
            resolvedFrom = alertEnt.fromId;
        else if(origins.length) resolvedFrom = origins[0];
        else resolvedFrom = null;
    }
    if(origins.length && resolvedFrom == null) return;
    let holdSec = defense ? WOD_ROGUE_BATTLE_HOLD_SEC : 0;
    gameData._campaignRun = {
        nodeId,
        fromNodeId: resolvedFrom,
        defense,
        synced: false,
        holdSec,
        holdElapsed: 0,
        battleLive: false,
        deploying: false
    };
    gameData._matchReadyForEndChecks = false;
    gameData._selectedMissionEntry = null;
    gameData.mission = null;
    let st = c.nodesState[nodeId];
    gameData._mapGenSeed = (c.seed ^ wodRogueMul32(nodeId + 13, 0x9e3779b9) ^ wodRogueMul32((st.battles || 0) + 1, 0x85ebca6b) ^ wodRogueMul32((resolvedFrom || 0) + 7, 0xc2b2ae35)) >>> 0;
    if(!gameData._mapGenSeed) gameData._mapGenSeed = 0x51ed270b;
    gameData._wodReuseMapGenSeed = true;
    let aiN = wodRogueEffectiveAiCount(node);
    let battleSize = wodRogueScaleMapSize(node.size || 60, aiN);
    let sizeEl = document.getElementById('setupMapSize');
    if(sizeEl) sizeEl.value = String(battleSize);
    let aiEl = document.getElementById('setupAI');
    if(aiEl) aiEl.value = String(aiN);
    gameData.aiCount = aiN;
    wodAssignMatchGenerals(wodRoguePickGenerals(node));
    gameData.alliances = wodNormalizeAlliances(wodRogueAllyAiOwners(aiN));
    gameData.victoryMode = 'domination';
    let vmEl = document.getElementById('setupVictoryMode');
    if(vmEl) vmEl.value = 'domination';
    wodApplyGamePeriod(wodGetCampaignGamePeriod(), { saveProfile: true });
    // Zoom the war-map region into a playable battle map (same terrain + town names).
    let regionMap = wodRogueBuildRegionBattleMap(nodeId, resolvedFrom);
    if(regionMap && window.WOD && typeof WOD.loadMapData === 'function') {
        WOD.loadMapData(regionMap);
        gameData.loadedCustomMap = true;
        gameData._campaignRegionMap = regionMap;
        gameData._mapGenOptions = { units: false, cities: false, territory: false };
    } else {
        gameData.loadedCustomMap = false;
        gameData._campaignRegionMap = null;
        gameData._mapGenOptions = { mapShape: node.shape };
    }
    startGame('ai');
}
/** Campaign AI start placement: keep Concord armies on their frontages and around
 *  cities they already hold (not deep backline skirmish spawn). */
function wodCampaignSpawnAiStartingUnits(owners, gar, spawnRng) {
    gameData.entities = [];
    gameData._generalMap = null;
    gameData._enemyDistField = null;
    if(!owners || !owners.length) return;
    let rng = typeof spawnRng === 'function' ? spawnRng : Math.random;
    let hr = Math.max(gameData.hexRadius || 20, 12);
    let minSepSq = Math.pow(hr * 2.15, 2);
    let used = [];
    function tooClose(x, y) {
        for(let p of used) {
            let dx = p.x - x, dy = p.y - y;
            if(dx * dx + dy * dy < minSepSq) return true;
        }
        return false;
    }
    function pushUsed(x, y) { used.push({ x, y }); }
    function cityAnchorsFor(owner) {
        let out = [];
        for(let cc of gameData.cities || []) {
            if(!cc || cc.owner !== owner) continue;
            out.push(cc);
        }
        return out;
    }
    function frontAnchorsFor(owner) {
        let fronts = typeof wodGetOwnerSpawnAnchorHexes === 'function'
            ? wodGetOwnerSpawnAnchorHexes(owner)
            : [];
        if(fronts && fronts.length) return fronts;
        // Fallback: owned land nearest any foreign land.
        let scored = [];
        for(let h of gameData.hexList) {
            if(!h || h.owner !== owner || h.type === 'mountain') continue;
            if(typeof isClaimableLand === 'function' && !isClaimableLand(h)) continue;
            if(isWaterHex(h)) continue;
            let d = typeof wodMinDistSqToEnemyTerritory === 'function'
                ? wodMinDistSqToEnemyTerritory(h.x, h.y, owner)
                : Infinity;
            scored.push({ h, d });
        }
        scored.sort((a, b) => a.d - b.d);
        return scored.slice(0, Math.min(48, scored.length)).map(s => s.h);
    }
    function pickLandNearAnchors(owner, type, anchors, radiusMax) {
        let probe = { type: type === 'heavy' ? 'heavy' : 'light', owner };
        if(!anchors || !anchors.length) return null;
        let rMax = Math.max(1, radiusMax | 0);
        for(let attempt = 0; attempt < 90; attempt++) {
            let a = anchors[(rng() * anchors.length) | 0];
            if(!a) continue;
            let aq = a.q, ar = a.r;
            if(aq == null || ar == null) {
                let c = pixelToHex(a.x, a.y);
                aq = c.q; ar = c.r;
            }
            let rad = 1 + ((rng() * rMax) | 0);
            let pts = getHexesInRadius(aq, ar, rad);
            for(let n = 0; n < pts.length; n++) {
                let pt = pts[((rng() * pts.length) | 0)];
                let h = wodHexAt(pt.q,pt.r);
                if(!h || h.owner !== owner) continue;
                if(typeof isArmyStartSpawnHex === 'function') {
                    if(!isArmyStartSpawnHex(probe, h)) continue;
                } else if(h.type === 'mountain' || isWaterHex(h)) continue;
                if(tooClose(h.x, h.y)) continue;
                return h;
            }
        }
        // Last resort: any owned claimable land for this owner.
        for(let h of gameData.hexList) {
            if(!h || h.owner !== owner) continue;
            if(typeof isArmyStartSpawnHex === 'function' && !isArmyStartSpawnHex(probe, h)) continue;
            if(tooClose(h.x, h.y)) continue;
            return h;
        }
        return null;
    }
    function placeOne(owner, type, preferFront) {
        if(type === 'ship') {
            let cities = cityAnchorsFor(owner);
            let fronts = frontAnchorsFor(owner);
            let pool = cities.length ? cities : fronts;
            if(!pool.length) return null;
            for(let attempt = 0; attempt < 40; attempt++) {
                let a = pool[(rng() * pool.length) | 0];
                let w = wodRogueFindDeployWaterHex(a.x, a.y, attempt);
                if(!w || tooClose(w.x, w.y)) continue;
                // Prefer water that still belongs to this AI when ownership exists.
                if(w.owner && w.owner !== owner && attempt < 28) continue;
                let u = createUnitAt(type, w.x, w.y, owner, { startSpawn: true });
                if(u) pushUsed(u.x, u.y);
                return u;
            }
            return null;
        }
        let fronts = frontAnchorsFor(owner);
        let cities = cityAnchorsFor(owner);
        let anchors = preferFront
            ? (fronts.length ? fronts : cities)
            : (cities.length ? cities : fronts);
        let hex = pickLandNearAnchors(owner, type, anchors, preferFront ? 3 : 4);
        if(!hex && anchors !== fronts) hex = pickLandNearAnchors(owner, type, fronts, 3);
        if(!hex && anchors !== cities) hex = pickLandNearAnchors(owner, type, cities, 4);
        if(!hex) return null;
        let u = createUnitAt(type, hex.x, hex.y, owner, { startSpawn: true });
        if(u) pushUsed(u.x, u.y);
        return u;
    }

    let unitsPerOwner = Math.max(10, Math.min(24, Math.floor((gameData.mapRadius || 40) / (3.1 + owners.length * 0.35))));
    for(let owner of owners) {
        for(let i = 0; i < unitsPerOwner; i++) {
            // Mostly on the frontage; every 5th unit garrisons a city.
            let preferFront = (i % 5) === 0;
            placeOne(owner, 'light', preferFront);
        }
        for(let h = 0; h < 2; h++) placeOne(owner, 'heavy', false);
    }

    let need = gar || { light: 0, heavy: 0, ship: 0 };
    let have = { light: 0, heavy: 0, ship: 0 };
    for(let u of gameData.entities) {
        if(u && u.hp > 0 && u.owner > 1 && have[u.type] != null) have[u.type]++;
    }
    for(let t of ['light', 'heavy', 'ship']) {
        let needTotal = Math.max(0, (need[t] || 0) - have[t]);
        for(let k = 0; k < needTotal; k++) {
            let o = owners[k % owners.length];
            // Garrison leftovers: mostly cities, with a frontline mix for land.
            let preferFront = t !== 'ship' && t !== 'heavy' && (k % 5) === 0;
            placeOne(o, t, preferFront);
        }
    }
}
/** Called from startGame after initGame when a campaign battle is active:
 * replace the default player army with the persistent roster, freeze recruiting,
 * field the node's garrison, and show the story briefing. */
function wodCampaignOnBattleStart() {
    let run = gameData._campaignRun;
    if(!run) return;
    let c = wodRogueLoad();
    if(!c) return;
    let node = wodRogueNodeTemplate(run.nodeId);
    if(!node) return;
    c.nodesState[run.nodeId].battles = (c.nodesState[run.nodeId].battles || 0) + 1;
    wodRogueSave();
    // Field AI armies first around their frontlines + controlled cities.
    gameData.entities = [];
    gameData._generalMap = null;
    gameData.selection = [];
    let owners = [];
    let aiN = wodRogueEffectiveAiCount(node);
    for(let o = 2; o <= aiN + 1; o++) owners.push(o);
    gameData.aiCount = aiN;
    gameData.alliances = wodNormalizeAlliances(wodRogueAllyAiOwners(aiN));
    let diff = node.diff || 0;
    let D = WOD_ROGUE_BALANCE;
    for(let o of owners) {
        gameData.aiMoneyByOwner[o] = Math.round((5200 + diff * 3400) * D.mult);
        gameData.aiManpowerByOwner[o] = Math.round((4600 + diff * 2400) * D.mult);
    }
    let gar = Object.assign({}, node.gar || { light: 0, heavy: 0, ship: 0 });
    let bakedAi = Math.max(1, node.ai | 0);
    if(aiN > bakedAi) {
        let sc = aiN / bakedAi;
        gar.light = Math.round((gar.light || 0) * sc);
        gar.heavy = Math.round((gar.heavy || 0) * sc);
        gar.ship = Math.round((gar.ship || 0) * sc);
    }
    let spawnRng = wodRogueRng((c.seed ^ wodRogueMul32(run.nodeId + 31, 0x27d4eb2f)) >>> 0);
    if(owners.length) {
        try { wodCampaignSpawnAiStartingUnits(owners, gar, spawnRng); }
        catch(_) {
            if(typeof spawnInitialFrontlineUnits === 'function') {
                try { spawnInitialFrontlineUnits(owners); } catch(__) {}
            }
        }
    }
    // Halve each AI's complete opening army, including scenario garrisons.
    for(let owner of owners) {
        let army = gameData.entities.filter(u => u.owner === owner);
        let keep = new Set(army.filter((u, i) => i % 2 === 0));
        gameData.entities = gameData.entities.filter(u => u.owner !== owner || keep.has(u));
    }
    // Strip any leftover player units, then split the roster across owned cities.
    gameData.entities = gameData.entities.filter(u => !(u && u.owner === 1));
    let playerCities = gameData.cities.filter(cc => cc && cc.owner === 1);
    if(!playerCities.length) {
        let home = gameData.cities.find(cc => cc.owner === 1 && cc.hasFactory) || gameData.cities.find(cc => cc.owner === 1);
        if(home) playerCities = [home];
    }
    let spacing = Math.max(30, (gameData.hexRadius || 20) * 1.6);
    let landByCity = playerCities.map(() => 0);
    let shipIdx = 0;
    let cityCursor = 0;
    let fieldRoster = wodRogueFieldRoster(c);
    run.deployedRosterIds = fieldRoster.map(r => r.id);
    for(let ri = 0; ri < fieldRoster.length; ri++) {
        let r = fieldRoster[ri];
        let unit;
        if(wodIsNavalType(r.type)) {
            let home = playerCities[cityCursor % Math.max(1, playerCities.length)] || playerCities[0];
            let hx = home ? home.x : 0, hy = home ? home.y : 0;
            let w = wodRogueFindDeployWaterHex(hx, hy, shipIdx++);
            unit = createUnitAt(r.type, w ? w.x : hx, w ? w.y : hy, 1, { startSpawn: true });
            cityCursor++;
        } else {
            let city = playerCities[cityCursor % Math.max(1, playerCities.length)] || playerCities[0];
            cityCursor++;
            if(!city) continue;
            let ci = playerCities.indexOf(city);
            if(ci < 0) ci = 0;
            let slot = landByCity[ci] || 0;
            landByCity[ci] = slot + 1;
            let col = slot % 4, row = (slot / 4) | 0;
            unit = createUnitAt(r.type,
                city.x + (col - 1.5) * spacing,
                city.y + spacing * 1.2 + row * spacing,
                1, { startSpawn: true });
        }
        if(!unit) continue;
        unit.name = r.name;
        unit.nameCustom = !!r.nameCustom;
        unit.hp = Math.max(1, Math.min(r.maxHp, r.hp));
        unit.maxHp = r.maxHp;
        unit.manpower = Math.max(50, Math.min(r.maxManpower, r.manpower));
        unit.maxManpower = r.maxManpower;
        unit.tanks = Math.min(r.maxTanks, r.tanks);
        unit.maxTanks = r.maxTanks;
        unit.xp = r.xp || 0;
        unit.kills = r.kills || 0;
        unit.losses = r.losses || 0;
        unit.tankKills = r.tankKills || 0;
        unit.tankLosses = r.tankLosses || 0;
        unit.veteran = !!(r.veteran || (r.xp || 0) >= WOD_VETERAN_XP_THRESHOLD);
        unit._campRosterId = r.id;
    }
    wodNormalizeStartingCityEconomy([1, ...owners]);
    gameData._generalMap=null;
    wodDeployStartingArmy([1, ...owners]);
    // Paid reserves are free arrivals; cash/MP recruits additional troops and structures.
    // Research upgrades raise the opening war chest / manpower reserves.
    gameData.money = wodRogueBattleStartMoney(c);
    gameData.manpower = wodRogueBattleStartManpower(c);
    gameData.playerUnitsKilled = 0;
    if(run) run.rosterAtStart = fieldRoster.length;
    wodSyncCampaignBattleHud();
    // Campaign AI should press the attack, not sit on hold lines — after deployment.
    gameData._campaignAiAggressive = true;
    gameData.aiStrategyTimer = 99;
    // Story briefing, then interactive deployment in friendly territory.
    let kicker = run.defense ? 'Counterattack at ' + node.name : 'War turn ' + c.turn;
    let title = run.defense ? 'Hold ' + node.name : node.name;
    let holdSec = run.defense ? WOD_ROGUE_BATTLE_HOLD_SEC : 0;
    run.holdSec = holdSec;
    let myUpkeep = wodRogueRosterUpkeep(fieldRoster);
    let startCash = wodRogueBattleStartMoney(c);
    let startMp = wodRogueBattleStartManpower(c);
    let startEcon = wodRogueEstimateBattleStartIncome(node, run.fromNodeId);
    let incomeLine = startEcon
        ? '\nStarting income: +' + wodRogueFormatUpkeep(startEcon.cashIncome) +
          ' (net ' + (startEcon.cashIncome - myUpkeep >= 0 ? '+' : '') +
          wodRogueFormatUpkeep(startEcon.cashIncome - myUpkeep) + ' after army upkeep).'
        : '';
    let enemyLine = (run.defense || (node.gar && (node.gar.light || node.gar.heavy || node.gar.ship)))
        ? '\n\nEnemy strength: ' + wodRogueNodeIntel(node) +
          ' · est. upkeep ' + wodRogueNodeEnemyUpkeepIntel(node)
        : '';
    let fromNodeBrief = run.fromNodeId != null ? wodRogueNodeTemplate(run.fromNodeId) : null;
    let approachBrief = fromNodeBrief
        ? '\nApproach: ' + (run.defense ? 'Concord columns from ' : 'Launching from ') +
          fromNodeBrief.name + ' (' + wodRogueSideLabel(wodRogueAttackSide(fromNodeBrief, node)) + ').'
        : '';
    if(run) {
        run.battleLive = false;
        run.deploying = false;
    }
    gameData._matchReadyForEndChecks = false;
    wodResetEndCountdowns();
    let cmdNames = wodRogueGeneralNames(node);
    let countries = wodRogueCountryNames(node);
    let cmdLead = wodRogueJoinList(countries) || cmdNames[0] || WOD_WORLD.enemy.name;
    let allyNote = countries.length > 1
        ? '\n\n' + wodRogueJoinList(countries) + ' are allied against you here. ' +
          (wodRogueJoinList(cmdNames) || 'Their commanders') + ' will not fight each other.'
        : '';
    let body = (run.defense
        ? cmdLead + ' is counterattacking ' + node.name + '. Hold for ' +
          wodFormatHoldClock(holdSec) + ' while keeping at least one town. You can rebuild your army during the defense.'
        : (node.brief + '\n\nAssault: capture every enemy city, just like a domination skirmish. There is no time limit.')) +
        allyNote +
        approachBrief +
        '\n\nYour army: ' + fieldRoster.length + ' fielded / ' + (c.roster.length-fieldRoster.length) + ' in reserve · battle upkeep ' + wodRogueFormatUpkeep(myUpkeep) +
        ' · opening reserves $' + startCash.toLocaleString() + ' / ' + startMp.toLocaleString() + ' manpower.' +
        incomeLine +
        enemyLine +
        '\n\nRecruit additional troops with money and manpower using the normal unit buttons. Armor and motorized troops need factories; ships need harbors. Use Call reserves for troops already in your army, without paying again. Survivors join your persistent army up to its roster limit; undeployed reserves stay safe. Every battlefield loss is permanent.' +
        '\n\nDeployment: place your troops in your territory — right-click, drag a formation line, or stroke a path — then Begin battle. Pan with WASD or arrow keys.';
    setGameSpeed(0, true);
    wodShowMissionPopupDialog({ kicker, title, body, style: run.defense ? 'alert' : 'briefing' }, () => {
        wodEnterCampaignDeployPhase();
    });
}
function wodCampaignDeployActive() {
    return !!(gameData && gameData._campaignRun && gameData._campaignRun.deploying);
}
function wodCampaignDeployHexOk(unit, hex) {
    if(!unit || !hex || hex.owner !== 1) return false;
    if(wodIsNavalUnit(unit)) return wodIsOpenWaterHex(hex);
    if(unit.type === 'marine') {
        if(hex.type === 'mountain' && !wodCanClimb(unit)) return false;
        return isWaterHex(hex) || (typeof isClaimableLand === 'function' ? isClaimableLand(hex) : !isWaterHex(hex));
    }
    if(hex.type === 'mountain' && !wodCanClimb(unit)) return false;
    if(isWaterHex(hex) && !isBridgeHex(hex)) return false;
    return typeof isClaimableLand === 'function' ? isClaimableLand(hex) : true;
}
function wodCampaignDeployFindHex(unit, tx, ty) {
    let hex = getNearestHexToPoint(tx, ty);
    if(wodCampaignDeployHexOk(unit, hex)) return hex;
    let coord = pixelToHex(tx, ty);
    let best = null, bd = Infinity;
    for(let pt of getHexesInRadius(coord.q, coord.r, 5)) {
        let h = wodHexAt(pt.q,pt.r);
        if(!wodCampaignDeployHexOk(unit, h)) continue;
        let dx = h.x - tx, dy = h.y - ty;
        let d = dx * dx + dy * dy;
        if(d < bd) { bd = d; best = h; }
    }
    return best;
}
function wodCampaignDeploySnapUnit(unit, tx, ty) {
    let hex = wodCampaignDeployFindHex(unit, tx, ty);
    if(!hex) return false;
    wodClearUnitOrdersInstant(unit);
    unit.x = hex.x;
    unit.y = hex.y;
    unit._drawX = hex.x;
    unit._drawY = hex.y;
    return true;
}
function wodCampaignDeployGetUnits() {
    let units = typeof getMovableSelectedUnits === 'function' ? getMovableSelectedUnits() : [];
    return (units || []).filter(u => u && u.owner === 1 && u.hp > 0 && u.type !== 'convoy');
}
function wodCampaignDeployNotify(units, placed, blocked) {
    if(placed === 0) showNotification('Place units only in your territory' + (units.some(u => u.type === 'ship') ? ' (naval units need water)' : '') + '.');
    else if(blocked > 0) showNotification('Deployed ' + placed + ' · ' + blocked + ' could not fit in friendly ground');
    else showNotification(placed === 1 ? 'Unit deployed' : placed + ' units deployed');
}
/** Instant-place selected units on a square grid around a click (single right-click). */
function wodCampaignDeployUnitsAt(worldPos) {
    if(!wodCampaignDeployActive()) return false;
    let units = wodCampaignDeployGetUnits();
    if(!units.length) {
        showNotification('Select your units, then right-click or drag a formation in friendly territory.');
        return true;
    }
    let spacing = Math.max(22, (gameData.hexRadius || 20) * 1.25);
    let cols = Math.ceil(Math.sqrt(units.length));
    let midCol = (cols - 1) / 2;
    let midRow = (Math.ceil(units.length / cols) - 1) / 2;
    let placed = 0, blocked = 0;
    for(let i = 0; i < units.length; i++) {
        let r = Math.floor(i / cols), c = i % cols;
        let tx = worldPos.x + (c - midCol) * spacing;
        let ty = worldPos.y + (r - midRow) * spacing;
        if(wodCampaignDeploySnapUnit(units[i], tx, ty)) placed++;
        else blocked++;
    }
    wodCampaignDeployNotify(units, placed, blocked);
    return true;
}
/** Instant-place selected units evenly along a drawn formation line. */
function wodCampaignDeployUnitsAlongLine(start, end) {
    if(!wodCampaignDeployActive()) return false;
    if(!start || !end) return wodCampaignDeployUnitsAt(end || start || { x: 0, y: 0 });
    let units = wodCampaignDeployGetUnits();
    if(!units.length) {
        showNotification('Select your units, then drag a formation line in friendly territory.');
        return true;
    }
    let dx = end.x - start.x, dy = end.y - start.y;
    let len = Math.sqrt(dx * dx + dy * dy);
    if(len < 28) return wodCampaignDeployUnitsAt(end);
    // Sort along the line so relative order matches the preview slots.
    units = units.slice().sort((a, b) => {
        let ax = ((a.x - start.x) * dx + (a.y - start.y) * dy) / len;
        let bx = ((b.x - start.x) * dx + (b.y - start.y) * dy) / len;
        return ax - bx;
    });
    let placed = 0, blocked = 0;
    for(let i = 0; i < units.length; i++) {
        let t = units.length === 1 ? 0.5 : i / (units.length - 1);
        let tx = start.x + dx * t;
        let ty = start.y + dy * t;
        if(wodCampaignDeploySnapUnit(units[i], tx, ty)) placed++;
        else blocked++;
    }
    wodCampaignDeployNotify(units, placed, blocked);
    return true;
}
/** Instant-place selected units along a freehand stroke / path. */
function wodCampaignDeployUnitsAlongStroke(worldPtsRaw) {
    if(!wodCampaignDeployActive()) return false;
    let pts = worldPtsRaw;
    if(typeof simplifyPathStrokeForOrders === 'function' && pts && pts.length >= 2)
        pts = simplifyPathStrokeForOrders(pts);
    if(!pts || pts.length < 2) {
        let end = worldPtsRaw && worldPtsRaw.length ? worldPtsRaw[worldPtsRaw.length - 1] : null;
        return end ? wodCampaignDeployUnitsAt(end) : false;
    }
    let units = wodCampaignDeployGetUnits();
    if(!units.length) {
        showNotification('Select your units, then stroke a formation path in friendly territory.');
        return true;
    }
    // Arc-length sample so units spread evenly along the drawn path.
    let segLens = [0], total = 0;
    for(let i = 1; i < pts.length; i++) {
        let sx = pts[i].x - pts[i - 1].x, sy = pts[i].y - pts[i - 1].y;
        total += Math.sqrt(sx * sx + sy * sy);
        segLens.push(total);
    }
    if(total < 28) return wodCampaignDeployUnitsAt(pts[pts.length - 1]);
    let placed = 0, blocked = 0;
    for(let i = 0; i < units.length; i++) {
        let t = units.length === 1 ? 0.5 : i / (units.length - 1);
        let want = t * total;
        let si = 1;
        while(si < segLens.length - 1 && segLens[si] < want) si++;
        let a = pts[si - 1], b = pts[si];
        let seg = segLens[si] - segLens[si - 1];
        let u = seg > 0.0001 ? (want - segLens[si - 1]) / seg : 0;
        let tx = a.x + (b.x - a.x) * u;
        let ty = a.y + (b.y - a.y) * u;
        if(wodCampaignDeploySnapUnit(units[i], tx, ty)) placed++;
        else blocked++;
    }
    wodCampaignDeployNotify(units, placed, blocked);
    return true;
}
function wodEnterCampaignDeployPhase() {
    let run = gameData._campaignRun;
    if(!run) return;
    run.deploying = true;
    run.holdElapsed = 0;
    setGameSpeed(0, true);
    // Freeze AI / economy while the player arranges the army.
    gameData._campaignAiAggressive = false;
    let banner = document.getElementById('wodDeployBanner');
    if(banner) banner.classList.remove('hidden');
    let btn = document.getElementById('wodDeployBeginBtn');
    if(btn && !btn._wodDeployWired) {
        btn._wodDeployWired = true;
        btn.addEventListener('click', () => wodFinishCampaignDeployPhase());
    }
    showNotification('Deployment — right-click, drag a line, or stroke a path to form up, then Begin battle.');
}
function wodFinishCampaignDeployPhase() {
    let run = gameData._campaignRun;
    if(!run || !run.deploying) return;
    run.deploying = false;
    run.battleLive = true;
    run.holdElapsed = 0;
    gameData._matchReadyForEndChecks = true;
    wodResetEndCountdowns();
    let banner = document.getElementById('wodDeployBanner');
    if(banner) banner.classList.add('hidden');
    // Clear any leftover march orders from placement clicks.
    for(let u of gameData.entities || []) {
        if(u && u.owner === 1) wodClearUnitOrdersInstant(u);
    }
    gameData._campaignAiAggressive = true;
    gameData.aiStrategyTimer = 99;
    setGameSpeed(1, true);
    wodUpdateCampaignDefenseHoldBanner();
    showNotification('Battle begun!');
}
function wodRogueFindDeployWaterHex(x, y, idx) {
    let coord = pixelToHex(x, y);
    let best = null, bd = Infinity;
    for(let pt of getHexesInRadius(coord.q, coord.r, 16)) {
        let h = wodHexAt(pt.q,pt.r);
        if(!h || !isWaterHex(h) || isBridgeHex(h)) continue;
        let dx = h.x - x, dy = h.y - y;
        let d = dx * dx + dy * dy + idx * 900;
        if(d < bd) { bd = d; best = h; }
    }
    return best;
}
/* --------------------------- battle resolution --------------------------- */
function wodCampaignAfterBattle(won) {
    let run = gameData._campaignRun;
    if(!run || run.synced) return;
    run.synced = true;
    let c = wodRogueLoad();
    if(!c) return;
    let node = wodRogueNodeTemplate(run.nodeId);
    if(!node) return;
    let D = WOD_ROGUE_BALANCE;
    // Sync roster from the battlefield: survivors keep wounds and experience,
    // the dead are struck from the rolls.
    let survivors = new Map();
    for(let u of gameData.entities.flatMap(t=>t.cargo?[t,t.cargo]:[t])) {
        if(u && u._campRosterId && u.hp > 0 && u.owner === 1) survivors.set(u._campRosterId, u);
    }
    let before = c.roster.length;
    let kept = [];
    for(let r of c.roster) {
        if(run.deployedRosterIds && !run.deployedRosterIds.includes(r.id)) { kept.push(r); continue; }
        let u = survivors.get(r.id);
        if(!u) continue;
        if(u.name) r.name = u.name;
        r.hp = Math.max(1, Math.round(u.hp));
        r.maxHp = u.maxHp;
        r.manpower = Math.max(50, Math.round(u.manpower));
        r.maxManpower = u.maxManpower;
        r.tanks = Math.round(u.tanks || 0);
        r.maxTanks = u.maxTanks || 0;
        r.xp = u.xp || 0;
        r.kills = u.kills || 0;
        r.losses = u.losses || 0;
        r.tankKills = u.tankKills || 0;
        r.tankLosses = u.tankLosses || 0;
        r.veteran = !!(u.veteran || (u.xp || 0) >= WOD_VETERAN_XP_THRESHOLD);
        if(r.veteran) u.veteran = true;
        r.battles = (r.battles || 0) + 1;
        kept.push(r);
    }
    let lost = before - kept.length;
    c.roster = kept;
    const recruits=gameData.entities.flatMap(t=>t.cargo?[t,t.cargo]:[t]).filter(u=>u.owner===1&&u.hp>0&&u._campRecruited&&!u._campRosterId)
        .sort((a,b)=>(b.xp||0)-(a.xp||0)||b.hp/b.maxHp-a.hp/a.maxHp);
    lost+=Math.max(0,(run.recruitsBuilt||0)-recruits.length);
    let retained=0;
    for(const u of recruits) {
        if(c.roster.length>=WOD_ROGUE_MAX_ROSTER)break;
        const r=wodRogueRosterAdd(u.type);
        for(const key of ['name','nameCustom','hp','maxHp','manpower','maxManpower','tanks','maxTanks','xp','kills','losses','tankKills','tankLosses','veteran'])
            if(u[key]!=null)r[key]=u[key];
        r.battles=1;r.battlefieldRecruit=true;u._campRosterId=r.id;retained++;
    }
    if(recruits.length)wodRogueLogPush(retained+' battlefield recruit'+(retained===1?'':'s')+' joined the campaign army.'+(recruits.length>retained?' '+(recruits.length-retained)+' remain as local garrison: army limit '+WOD_ROGUE_MAX_ROSTER+'.':''));
    wodRogueRenumberRoster(c);
    // Campaign stats.
    if(!c.stats) c.stats = { battles: 0, wins: 0, defeats: 0, unitsLost: 0, unitsKilled: 0, unitsBought: 0, kills: 0, losses: 0 };
    if(c.stats.unitsKilled == null) c.stats.unitsKilled = 0;
    c.stats.battles++;
    if(won) c.stats.wins++;
    else c.stats.defeats++;
    c.stats.unitsLost += lost;
    c.stats.unitsKilled += (gameData.playerUnitsKilled || 0);
    c.stats.kills += (gameData.playerKills || 0);
    c.stats.losses += (gameData.casualties || 0);
    gameData._lastCampaignBattleMeta = {
        defense: !!run.defense,
        holdSec: run.holdSec || 0,
        unitsLost: lost,
        recruitsRetained: retained,
        recruitsGarrisoned: recruits.length-retained,
        unitsLostTotal: c.stats.unitsLost,
        unitsKilled: gameData.playerUnitsKilled || 0,
        unitsKilledTotal: c.stats.unitsKilled
    };
    // Outcome.
    let nodeState = c.nodesState[run.nodeId];
    if(c.consecutiveDefenses == null) c.consecutiveDefenses = 0;
    if(run.defense) c.consecutiveDefenses = (c.consecutiveDefenses | 0) + 1;
    else c.consecutiveDefenses = 0;
    if(won) {
        wodBumpLifetime('campaignBattlesWon', 1);
        checkWodAchievements();
        scheduleSaveWodProgress();
        if(run.defense) {
            delete c.alerts[run.nodeId];
            c.blockedAdvance = false;
            wodRogueLogPush('Turn ' + c.turn + ': the counterattack on ' + node.name + ' is thrown back.' + (lost ? ' Lost ' + lost + ' unit' + (lost === 1 ? '' : 's') + '.' : ''));
        } else {
            nodeState.owner = 'player';
            wodRogueLogPush('Turn ' + c.turn + ': ' + node.name + ' falls to the Remnant!' + (lost ? ' Lost ' + lost + ' unit' + (lost === 1 ? '' : 's') + '.' : ''));
        }
        // Wins and successful defenses both grant requisition; defenses pay a bit more.
        // Scales with the region's star rating and the campaign balance.
        let baseReward = 320 + (node.diff || 0) * 90 + (run.defense ? 140 : 0);
        let reward = Math.max(200, Math.round(baseReward * D.rewardMult));
        c.points = (c.points | 0) + reward;
        wodRogueLogPush('+' + reward + ' requisition from high command. (Army budget: ' + c.points + ')');
    } else {
        if(run.defense) {
            delete c.alerts[run.nodeId];
            c.blockedAdvance = false;
            nodeState.owner = 'enemy';
            wodRogueLogPush('Turn ' + c.turn + ': ' + node.name + ' is overrun by the Concord counterattack.');
        } else {
            wodRogueLogPush('Turn ' + c.turn + ': the assault on ' + node.name + ' fails.' + (lost ? ' Lost ' + lost + ' unit' + (lost === 1 ? '' : 's') + '.' : ''));
        }
        c.points = (c.points | 0) + Math.max(80, Math.round(120 * D.rewardMult));
    }
    wodRogueWarTick(c);
    // End-of-run checks.
    let cap = wodRogueCapitalNode();
    let hq = wodRogueHqNode();
    if(cap && c.nodesState[cap.id] && c.nodesState[cap.id].owner === 'player') {
        c.over = true;
        c.won = true;
        wodBumpLifetime('campaignsWon', 1);
        checkWodAchievements();
        scheduleSaveWodProgress();
        wodRogueLogPush(cap.name.toUpperCase() + ' HAS FALLEN. The Iron Concord signs the surrender aboard your flagship. The war is over.');
    } else if(hq && c.nodesState[hq.id] && c.nodesState[hq.id].owner === 'enemy') {
        c.over = true;
        wodRogueLogPush(hq.name + ' has fallen. The Remnant has no home shore left — the campaign is lost.');
    } else if(!c.roster.length && c.points < Math.min(...Object.values(WOD_ROGUE_UNIT_COSTS))) {
        c.over = true;
        wodRogueLogPush('The army is spent and the coffers are empty. The campaign is lost.');
    }
    wodRogueSave();
    gameData._campaignRun = null;
    gameData.constructionJobs = [];
    gameData._campaignRegionMap = null;
    gameData._campaignAiAggressive = false;
    gameData._wodReturnToCampaign = true;
    let deployBanner = document.getElementById('wodDeployBanner');
    if(deployBanner) deployBanner.classList.add('hidden');
    wodSyncCampaignBattleHud();
}
/** The living war: each turn the front moves without you — income ticks, the
 * Concord probes your lines, and unanswered counterattacks take ground back. */
function wodRogueWarTick(c) {
    c.turn++;
    if(c.forcedDefenses == null) c.forcedDefenses = 0;
    if(c.blockedAdvance == null) c.blockedAdvance = false;
    if(c.consecutiveDefenses == null) c.consecutiveDefenses = 0;
    let D = WOD_ROGUE_BALANCE;
    let rng = wodRogueRng((c.seed ^ wodRogueMul32(c.turn, 0xc2b2ae35)) >>> 0);
    // Unanswered alerts fall.
    for(let idStr of Object.keys(c.alerts)) {
        let id = parseInt(idStr, 10);
        if(wodRogueAlertTurn(c, id) <= c.turn - 2) {
            delete c.alerts[id];
            if(c.nodesState[id] && c.nodesState[id].owner === 'player') {
                c.nodesState[id].owner = 'enemy';
                let n = wodRogueNodeTemplate(id);
                wodRogueLogPush('Left undefended, ' + (n ? n.name : 'a region') + ' is retaken by the Concord.');
            }
        }
    }
    if(!wodRogueHasActiveAlerts(c)) c.blockedAdvance = false;
    // Turn income: base + research bonus per controlled territory.
    let held = Object.values(c.nodesState).filter(n => n.owner === 'player').length;
    let per = wodRogueResearchReqPerTerritory(c);
    let income = held * per;
    c.points += income;
    if(held > 0) wodRogueLogPush('+' + income + ' requisition from ' + held + ' held region' + (held === 1 ? '' : 's') + ' (+' + per + ' each).');
    // New counterattack: a player border region (HQ exempt until the endgame).
    // Never more than 2 defense battles in a row; sometimes seals the roads (forced defense).
    let total = wodRogueNodes().length;
    let canSpawnDefense = (c.consecutiveDefenses | 0) < WOD_ROGUE_MAX_CONSECUTIVE_DEFENSES;
    if(!canSpawnDefense && wodRogueHasActiveAlerts(c)) {
        c.alerts = {};
        c.blockedAdvance = false;
        wodRogueLogPush('High command grants a breathing space — no further counterattacks until you press the attack.');
    }
    if(canSpawnDefense && c.turn > 2 && rng() < D.counterChance && !wodRogueHasActiveAlerts(c)) {
        let targets = wodRogueNodes().filter(n =>
            c.nodesState[n.id].owner === 'player' &&
            !wodRogueHasAlert(c, n.id) &&
            (!n.hq || held > total * 0.6) &&
            wodRogueNeighbors(n.id).some(nb => c.nodesState[nb] && c.nodesState[nb].owner === 'enemy'));
        if(targets.length) {
            let t = targets[(rng() * targets.length) | 0];
            let enemyOrigins = wodRogueNeighbors(t.id).filter(nb =>
                c.nodesState[nb] && c.nodesState[nb].owner === 'enemy');
            let fromId = enemyOrigins.length ? enemyOrigins[(rng() * enemyOrigins.length) | 0] : null;
            c.alerts[t.id] = { turn: c.turn, fromId };
            let fromName = fromId != null ? (wodRogueNodeTemplate(fromId) || {}).name : null;
            let canForce = (c.forcedDefenses | 0) < WOD_ROGUE_MAX_FORCED_DEFENSES;
            let forceChance = D.blockChance != null ? D.blockChance : 0.38;
            if(canForce && rng() < forceChance) {
                c.blockedAdvance = true;
                c.forcedDefenses = (c.forcedDefenses | 0) + 1;
                wodRogueLogPush('Concord columns seal the roads around ' + t.name +
                    (fromName ? ' from ' + fromName : '') +
                    ' — defend it before the front can advance again (' +
                    c.forcedDefenses + '/' + WOD_ROGUE_MAX_FORCED_DEFENSES + ').');
            } else {
                wodRogueLogPush('Concord columns are massing against ' + t.name +
                    (fromName ? ' from ' + fromName : '') +
                    ' — defend it this turn or lose it.');
            }
        }
    }
    // Flavor.
    if(rng() < 0.65) wodRogueLogPush(WOD_ROGUE_FLAVOR[(rng() * WOD_ROGUE_FLAVOR.length) | 0]);
}
const WOD_SHOP_MAP_DEFAULT_PRICE = 750;
function wodCampaignReserveType(mode) {
    const type=typeof mode==='string'&&mode.startsWith('reserve:')?mode.slice(8):null;
    return ['light','motorized','mountaineer','marine','heavy','ship','transport','supply'].includes(type)?type:null;
}
