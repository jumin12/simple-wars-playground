// Shared state helpers: factions and alliances, names, noise, colours, generals, unit speed and experience.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

function wodIsFrontlineStyle(id) {
    return !!(id && WOD_FRONTLINE_STYLES[id]);
}
function wodIsCommandArrowStyle(id) {
    return !!(id && WOD_COMMAND_ARROW_STYLES[id]);
}
function wodCommandArrowStyleDef() {
    wodEnsureUiShopDefaults();
    return WOD_COMMAND_ARROW_STYLES[gameData.uiSettings.commandArrowStyle] || WOD_COMMAND_ARROW_STYLES.default;
}
function wodNormalizeAlliances(raw) {
    if(!Array.isArray(raw)) return [];
    let seen = Object.create(null);
    let out = [];
    for(let i = 0; i < raw.length; i++) {
        let p = raw[i];
        if(!p) continue;
        let a = (p.a != null ? p.a : p[0]) | 0;
        let b = (p.b != null ? p.b : p[1]) | 0;
        if(a < 1 || b < 1 || a === b) continue;
        if(a > b) { let t = a; a = b; b = t; }
        let k = a + ':' + b;
        if(seen[k]) continue;
        seen[k] = 1;
        out.push([a, b]);
    }
    return out;
}
function wodAreAllies(a, b) {
    a = a | 0; b = b | 0;
    if(a < 1 || b < 1 || a === b) return false;
    let list = gameData.alliances;
    if(!list || !list.length) return false;
    if(a > b) { let t = a; a = b; b = t; }
    for(let i = 0; i < list.length; i++) {
        let p = list[i];
        if(p && (p[0] | 0) === a && (p[1] | 0) === b) return true;
    }
    return false;
}
function wodIsFriendlyOwner(a, b) {
    a = a | 0; b = b | 0;
    if(a < 1 || b < 1) return false;
    return a === b || wodAreAllies(a, b);
}
function wodIsHostileOwner(a, b) {
    a = a | 0; b = b | 0;
    if(a < 1 || b < 1 || a === b) return false;
    return !wodAreAllies(a, b);
}
function wodAddAlliance(a, b) {
    a = a | 0; b = b | 0;
    if(a < 1 || b < 1 || a === b) return false;
    gameData.alliances = wodNormalizeAlliances((gameData.alliances || []).concat([[a, b]]));
    return true;
}
function wodRemoveAlliance(a, b) {
    a = a | 0; b = b | 0;
    if(a > b) { let t = a; a = b; b = t; }
    let list = gameData.alliances || [];
    let next = [];
    for(let i = 0; i < list.length; i++) {
        let p = list[i];
        if(!p || (p[0] | 0) !== a || (p[1] | 0) !== b) next.push(p);
    }
    gameData.alliances = next;
    return next.length !== list.length;
}
function loadUiSettingsFromStorage() {
    try {
        let raw = localStorage.getItem(SL_UI_SETTINGS_KEY) || localStorage.getItem(SL_UI_SETTINGS_LEGACY);
        if(raw) {
            let s = JSON.parse(raw);
            if(typeof s.showOrdersWhenDeselected === 'boolean')
                gameData.uiSettings.showOrdersWhenDeselected = s.showOrdersWhenDeselected;
            gameData.uiSettings.orderArrowsUsePathfinding = typeof s.orderArrowsUsePathfinding === 'boolean'
                ? s.orderArrowsUsePathfinding : true;
            if(wodIsFrontlineStyle(s.frontlineStyle))
                gameData.uiSettings.frontlineStyle = s.frontlineStyle;
            if(wodIsCommandArrowStyle(s.commandArrowStyle))
                gameData.uiSettings.commandArrowStyle = s.commandArrowStyle;
            if(typeof s.frontlineColor === 'string')
                gameData.uiSettings.frontlineColor = s.frontlineColor === 'yellow' ? 'gold' : s.frontlineColor;
            else if(typeof s.lineColor === 'string')
                gameData.uiSettings.frontlineColor = s.lineColor === 'yellow' ? 'gold' : s.lineColor;
            if(typeof s.commandArrowColor === 'string')
                gameData.uiSettings.commandArrowColor = s.commandArrowColor === 'yellow' ? 'gold' : s.commandArrowColor;
            else if(typeof s.lineColor === 'string')
                gameData.uiSettings.commandArrowColor = s.lineColor === 'yellow' ? 'gold' : s.lineColor;
            if(typeof s.mapSkin === 'string')
                gameData.uiSettings.mapSkin = s.mapSkin;
        }
    } catch(e) {}
    wodEnsureUiShopDefaults();
}
function saveUiSettings() {
    wodEnsureUiShopDefaults();
    try {
        localStorage.setItem(SL_UI_SETTINGS_KEY, JSON.stringify({
            showOrdersWhenDeselected: gameData.uiSettings.showOrdersWhenDeselected !== false,
            orderArrowsUsePathfinding: !!gameData.uiSettings.orderArrowsUsePathfinding,
            frontlineStyle: gameData.uiSettings.frontlineStyle,
            commandArrowStyle: gameData.uiSettings.commandArrowStyle,
            frontlineColor: gameData.uiSettings.frontlineColor,
            commandArrowColor: gameData.uiSettings.commandArrowColor,
            mapSkin: gameData.uiSettings.mapSkin
        }));
    } catch(e) {}
}
const WOD_MP_LOBBY_PALETTE = [
    ['#2ecc71', 'Green'], ['#3498db', 'Blue'], ['#e74c3c', 'Red'], ['#9b59b6', 'Purple'],
    ['#e67e22', 'Orange'], ['#f1c40f', 'Yellow'], ['#1abc9c', 'Teal'], ['#ecf0f1', 'Light gray']
];
function wodLocalPlayerOwner() {
    if(gameData.mp && gameData.mp.enabled && gameData.mp.localSlot) return gameData.mp.localSlot;
    return 1;
}
function wodPlayerTreasury(owner) {
    if(owner === 1) return gameData.money || 0;
    return (gameData.aiMoneyByOwner && gameData.aiMoneyByOwner[owner]) || 0;
}
function wodDeductPlayerMoney(owner, amt) {
    amt = Math.max(0, amt | 0);
    wodBattleMetric(owner,'moneySpent',amt);
    if(owner === 1) gameData.money = Math.max(0, (gameData.money || 0) - amt);
    else {
        if(!gameData.aiMoneyByOwner) gameData.aiMoneyByOwner = {};
        gameData.aiMoneyByOwner[owner] = Math.max(0, wodPlayerTreasury(owner) - amt);
    }
}
function wodSyncCampaignBattleHud() {
    let root = document.getElementById('inGameUI');
    if(!root) return;
    let camp = !!(gameData && gameData._campaignRun);
    root.classList.toggle('wod-campaign-battle', camp);
    if(!camp) {
        root.querySelectorAll('button[onclick^="buyUnit"]').forEach(b => b.disabled = false);
        wodApplyPeriodUiLabels();
    }
    let label = document.getElementById('wodPcProdTabUnits');
    if(label) label.title = camp ? 'Recruit units or call existing reserves' : 'Train units';
    wodRefreshCommandHud(true);
}
// --- Math & Map Utils ---
const cityPrefixes = ["New ", "Old ", "Fort ", "Port ", "Saint ", "Lake ", "Mount ", "San ", "Los ", "Las ", "El ", "La ", "Grand "];
const cityRoots = ["town", "ville", "city", "burg", "borough", "grad", "mouth", "chester", "ton", "land", "field", "haven", "cross", "gate", "depot", "harbor", "bridge", "heights", "works", "junction", "wood", "mont", "view", "brook", "springs", "falls", "ridge", "point", "ford", "park", "hill"];
const cityStarts = ["Ash", "Oak", "Pine", "Maple", "River", "Stone", "Iron", "Gold", "Silver", "Copper", "Wind", "Storm", "Thunder", "Red", "Black", "White", "East", "West", "North", "South", "Fox", "Eagle", "Wolf", "Cedar", "Briar", "Dover", "Arden", "Kessel", "Roth", "Vale", "Crown", "Rose", "Clear", "Fair", "Green", "Blue", "High", "Low", "Middle", "Center"];
function generateCityName() {
    let name = "";
    let r = Math.random();
    if (r > 0.8) name += cityPrefixes[Math.floor(Math.random() * cityPrefixes.length)];
    name += cityStarts[Math.floor(Math.random() * cityStarts.length)];
    if (r < 0.9 || name.indexOf(" ") !== -1) {
        let root = cityRoots[Math.floor(Math.random() * cityRoots.length)];
        if (Math.random() > 0.8) name += " " + root.charAt(0).toUpperCase() + root.slice(1);
        else name += root.toLowerCase();
    }
    return name;
}
function wodOrdinal(n) {
    n = Math.floor(Math.abs(n));
    let mod10 = n % 10;
    let mod100 = n % 100;
    if(mod100 >= 11 && mod100 <= 13) return n + 'th';
    if(mod10 === 1) return n + 'st';
    if(mod10 === 2) return n + 'nd';
    if(mod10 === 3) return n + 'rd';
    return n + 'th';
}
function wodUnitNameSerialKey(type) {
    if(type==='motorized'||type==='mountaineer')return type;
    if(type === 'heavy' || type === 'ship' || type === 'convoy' || type === 'light' || type === 'marine' || type==='transport'||type==='supply') return type;
    return 'other';
}
function wodFormatUnitName(type, num, convoySea) {
    let f = wodPeriodFlavor(wodGetMatchPeriod());
    let label = 'Unit';
    if(WOD_SPECIALIST_UNITS[type])label=wodSpecialistLabel(type,wodGetMatchPeriod());
    else if(type === 'light') label = f.light;
    else if(type === 'marine') label = f.marine;
    else if(type === 'heavy') label = f.heavy;
    else if(type === 'ship') label = f.ship;
    else if(type === 'transport')label=wodTransportLabel();
    else if(type === 'supply')label=wodSupplyShipLabel();
    else if(type === 'convoy') label = convoySea ? f.convoySea : f.convoyLand;
    return wodOrdinal(num) + ' ' + label;
}
function wodAllocateUnitName(type, owner, convoySea) {
    owner = owner || 1;
    if(!gameData._unitNameSerial) gameData._unitNameSerial = {};
    if(!gameData._unitNameSerial[owner]) gameData._unitNameSerial[owner] = {};
    let key = wodUnitNameSerialKey(type);
    let n = (gameData._unitNameSerial[owner][key] || 0) + 1;
    gameData._unitNameSerial[owner][key] = n;
    return wodFormatUnitName(type, n, convoySea);
}
function wodRenumberOwnerUnits(owner) {
    let groups = {};
    for(let u of gameData.entities) {
        if(!u || u.owner !== owner || u.hp <= 0 || u.nameCustom) continue;
        let key = wodUnitNameSerialKey(u.type);
        if(!groups[key]) groups[key] = [];
        groups[key].push(u);
    }
    for(let key of Object.keys(groups)) {
        groups[key].sort((a, b) => (a._nameOrder || 0) - (b._nameOrder || 0));
        for(let i = 0; i < groups[key].length; i++) {
            let u = groups[key][i];
            u.name = wodFormatUnitName(u.type, i + 1, !!u.convoySeaRoute);
        }
    }
}
function wodRenumberAllFactionUnits() {
    let owners = new Set();
    for(let u of gameData.entities) if(u && u.owner > 0 && u.hp > 0) owners.add(u.owner);
    for(let owner of owners) wodRenumberOwnerUnits(owner);
}
function generateUnitName(type, convoySea, owner) {
    return wodAllocateUnitName(type, owner || 1, convoySea);
}
// Simple hash-based 2D noise for terrain
function hash(n) {
    let x = Math.sin(n) * 43758.5453;
    return x - Math.floor(x);
}
function mix(a, b, t) { return a + (b - a) * t; }
function noise(x, y) {
    let p = [Math.floor(x), Math.floor(y)];
    let f = [x - p[0], y - p[1]];
    f[0] = f[0]*f[0]*(3.0-2.0*f[0]);
    f[1] = f[1]*f[1]*(3.0-2.0*f[1]);
    let n = p[0] + p[1]*57.0;
    return mix(
        mix(hash(n+0.0), hash(n+1.0), f[0]),
        mix(hash(n+57.0), hash(n+58.0), f[0]),
        f[1]
    );
}
function fbm(x, y, octaves) {
    let v = 0, a = 0.5;
    for (let i = 0; i < octaves; i++) {
        v += a * noise(x, y);
        x *= 2; y *= 2; a *= 0.5;
    }
    return v;
}
// Hex Math
const terrainHelp = [
    {type: 'grass', label: 'grass', note: 'standard land'},
    {type: 'sand', label: 'sand', note: 'coastal dry land'},
    {type: 'forest', label: 'forest', note: 'dense land'},
    {type: 'swamp', label: 'swamp', note: 'wet lowland'},
    {type: 'hill', label: 'hill', note: 'rough highland'},
    {type: 'mountain', label: 'mountain', note: 'mountaineers only'},
    {type: 'urban', label: 'town', note: 'city/town area'},
    {type: 'water', label: 'ocean', note: 'naval tiles'}
];
function getTerrainColor(type) {
    const board=wodBoardMapActive();if(board){const p=WodBoardArt.palette(board);return p[type]||(type==='deep_water'?p.surface:type==='snow'?p.mountain:p.grass);}
    if(wodHdMapActive() && WOD_HD_PALETTE[type])return WOD_HD_PALETTE[type];
    if(type === 'deep_water') return '#0f4f8c';
    if(type === 'water') return '#1563a8';
    if(type === 'sand') return '#c9923a';
    if(type === 'grass') return '#4ea053';
    if(type === 'forest') return '#2a6b3c';
    if(type === 'swamp') return '#457a55';
    if(type === 'hill') return '#8b6d4e';
    if(type === 'snow') return '#8a9590';
    if(type === 'mountain') return '#8a7d6c';
    if(type === 'urban') return getUrbanTerrainColor(wodGetRenderPeriod());
    if(type === 'bridge') return '#c0392b';
    return '#000';
}
function normalizeTerrainHexes() {
    if(!gameData.hexList) return;
    let changed = false;
    for(let hex of gameData.hexList) {
        if(isWaterHex(hex))hex.owner=0;
        if(hex.type === 'deep_water') {
            hex.type = 'water';
            hex.baseColor = getTerrainColor('water');
            hex.renderColor = hex.baseColor;
            changed = true;
        } else if(hex.type === 'snow') {
            hex.type = 'hill';
            hex.baseColor = getTerrainColor('hill');
            hex.renderColor = hex.baseColor;
            changed = true;
        }
    }
    if(changed) wodMarkTerrainFullDirty();
}
function terrainLabel(type) {
    let entry = terrainHelp.find(t => t.type === type);
    return entry ? entry.label : type.replace('_', ' ');
}
function terrainSwatchArt(type) {
    if(type === 'forest') {
        return `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                    <rect width="16" height="16" fill="${getTerrainColor(type)}"/>
                    <path d="M3 11.4h3.3L4.65 8.9h1.1L4.1 6.5h.9L3.8 4.2 2.6 6.5h.9L1.9 8.9H3l-1.7 2.5H3z" fill="#0b5f32"/>
                    <path d="M8 12.3h4.6l-2.2-3.2h1.4L9.6 6h1.1L9 3.1 7.3 6h1.1L6.2 9.1h1.4L5.4 12.3H8z" fill="#0f7a3b"/>
                    <path d="M12.5 11.7h2.7L13.8 9.5h.9l-1.4-2h.7l-1-1.9-1.1 1.9h.8l-1.4 2h.9l-1.4 2.2h1.7z" fill="#0b5f32"/>
                </svg>`;
    }
    if(type === 'urban') {
        let us = wodUrbanPeriodStyle(wodGetRenderPeriod());
        return `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                    <rect width="16" height="16" fill="${us.base}"/>
                    <rect x="1.6" y="1.4" width="4.2" height="4.2" rx=".35" fill="${us.blockB}" stroke="${us.stroke}" stroke-width=".35"/>
                    <rect x="10.2" y="1.7" width="4" height="3.7" rx=".35" fill="${us.blockA}" stroke="${us.stroke}" stroke-width=".35"/>
                    <rect x="2" y="10.3" width="3.7" height="4" rx=".35" fill="${us.blockA}" stroke="${us.stroke}" stroke-width=".35"/>
                    <rect x="10.4" y="10.1" width="4.1" height="4.2" rx=".35" fill="${us.blockB}" stroke="${us.stroke}" stroke-width=".35"/>
                    <rect x="2.8" y="2.6" width="1" height="1.4" fill="rgba(18,22,28,.55)"/><rect x="5" y="3" width="1" height="1.4" fill="rgba(18,22,28,.55)"/>
                    <rect x="11.4" y="2.9" width="1" height="1.4" fill="rgba(18,22,28,.55)"/><rect x="13.6" y="2.9" width="1" height="1.4" fill="rgba(18,22,28,.55)"/>
                    <rect x="3.2" y="11.5" width="1" height="1.4" fill="rgba(18,22,28,.55)"/><rect x="5.4" y="11.8" width="1" height="1.4" fill="rgba(18,22,28,.55)"/>
                    <rect x="11.6" y="11.3" width="1" height="1.4" fill="rgba(18,22,28,.55)"/><rect x="13.8" y="11.6" width="1" height="1.4" fill="rgba(18,22,28,.55)"/>
                </svg>`;
    }
    return '';
}
function terrainRowHtml(type, includeNote) {
    let entry = terrainHelp.find(t => t.type === type) || {type, label: terrainLabel(type), note: ''};
    let note = includeNote && entry.note ? ` - ${entry.note}` : '';
    return `<div class="${includeNote ? 'help-terrain-row' : 'terrain-key-row'}"><span class="terrain-swatch" style="background:${getTerrainColor(type)}">${terrainSwatchArt(type)}</span><span>${entry.label}${note}</span></div>`;
}
function formatDollarRate(value) {
    let n = Number(value) || 0;
    let sign = n >= 0 ? '+' : '-';
    return sign + '$' + Math.abs(n).toFixed(1) + '/s';
}
function formatManpowerRate(value) {
    let n = Number(value) || 0;
    let sign = n >= 0 ? '+' : '-';
    return sign + Math.abs(n).toFixed(1) + ' MP/s';
}
let _uiTextElCache = {};
let _dataUiSyncLists = null;
function setUiText(id, value) {
    let s = value == null ? '' : String(value);
    let el = _uiTextElCache[id];
    if(el === undefined) {
        el = document.getElementById(id);
        _uiTextElCache[id] = el || null;
    }
    if(el && el._lastUiText !== s) {
        el._lastUiText = s;
        el.textContent = s;
    }
    if(_dataUiSyncLists === null) {
        _dataUiSyncLists = new Map();
        document.querySelectorAll('[data-ui-sync]').forEach(node => {
            let sid = node.getAttribute('data-ui-sync');
            if(!sid) return;
            if(!_dataUiSyncLists.has(sid)) _dataUiSyncLists.set(sid, []);
            _dataUiSyncLists.get(sid).push(node);
        });
    }
    let syncList = _dataUiSyncLists.get(id);
    if(syncList) {
        for(let i = 0, sl = syncList.length; i < sl; i++) {
            let node = syncList[i];
            if(node._lastUiText !== s) {
                node._lastUiText = s;
                node.textContent = s;
            }
        }
    }
}
function updateTerrainKey(opts) {
    opts = opts || {};
    normalizeTerrainHexes();
    let body = document.getElementById('terrainKeyBody');
    if(body) {
        let skipKey = { snow: 1, deep_water: 1 };
        let list = gameData.hexList || [];
        let present = [...new Set(list.map(h => h.type))]
            .filter(t => !skipKey[t])
            .sort((a, b) => terrainLabel(a).localeCompare(terrainLabel(b)));
        let compactRows = present.map(type => terrainRowHtml(type, false)).join('');
        body.innerHTML = compactRows;

        let escCompact = document.getElementById('escCompactTerrainKey');
        if(escCompact) escCompact.innerHTML = compactRows;
        let menuCompact = document.getElementById('menuCompactTerrainKey');
        if(menuCompact) menuCompact.innerHTML = compactRows;
    }

    if(!opts.skipHelp) {
        fillHelpEffectsGuide();
        renderHelpMiniDiagrams();
        fillTerrainCombatHelpTables();
        wodFillHelpTerrainSwatches();
    }
}
function blendColorsFast(c1, c2, alpha) {
    let r1 = parseInt(c1.slice(1,3), 16), g1 = parseInt(c1.slice(3,5), 16), b1 = parseInt(c1.slice(5,7), 16);
    let r2 = parseInt(c2.slice(1,3), 16), g2 = parseInt(c2.slice(3,5), 16), b2 = parseInt(c2.slice(5,7), 16);
    let r = Math.round(r1 * (1 - alpha) + r2 * alpha);
    let g = Math.round(g1 * (1 - alpha) + g2 * alpha);
    let b = Math.round(b1 * (1 - alpha) + b2 * alpha);
    return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).padStart(6, '0');
}
const factionColors = [
    '#000', // 0 = Neutral
    '#2ecc71', // 1 = Player (Green) — Federation Remnant
    '#e74c3c', // 2 = AI 1 (Red) — Morren, Concord Field Army
    '#9b59b6', // 3 = AI 2 (Purple) — Venn, Ashcoast League
    '#e67e22', // 4 = AI 3 (Orange) — Tal, Highland Host
    '#3498db', // 5 = AI 4 (Blue)
    '#f1c40f'  // 6 = AI 5 (Yellow)
];
/** One war. The Remnant fights Concord, and later the Ashcoast League and Highland Host as allied countries. */
const WOD_WORLD = {
    war: 'the Ashen Front',
    player: {
        short: 'Remnant',
        name: 'Federation Remnant',
        you: 'You — Remnant command'
    },
    enemy: {
        short: 'Concord',
        name: 'Iron Concord'
    },
    pact: 'the Concord Pact'
};
const WOD_GENERALS = {
    2: {
        id: 'morren',
        name: 'Kade Morren',
        rank: 'General',
        command: 'Field Army',
        side: 'concord',
        country: 'Iron Concord',
        countryShort: 'Concord',
        line: 'Towns first. Then the road between them.',
        doctrine: 'cities',
        mainMul: 1.12,
        raidMul: 0.72,
        holdMul: 0.88,
        strikeMul: 1.28,
        defendMul: 1.0,
        reserveMul: 1.0
    },
    3: {
        id: 'venn',
        name: 'Lira Venn',
        rank: 'Admiral',
        command: 'Ashcoast Command',
        side: 'concord',
        country: 'Ashcoast League',
        countryShort: 'Ashcoast',
        line: 'She will not hold a line she can go around.',
        doctrine: 'raid',
        mainMul: 0.86,
        raidMul: 1.55,
        holdMul: 0.7,
        strikeMul: 1.08,
        defendMul: 0.88,
        reserveMul: 0.9
    },
    4: {
        id: 'tal',
        name: 'Oren Tal',
        rank: 'Marshal',
        command: 'Highland Host',
        side: 'concord',
        country: 'Highland Host',
        countryShort: 'Highlands',
        line: 'Given the high ground. Means to die on it.',
        doctrine: 'hold',
        mainMul: 0.82,
        raidMul: 0.55,
        holdMul: 1.42,
        strikeMul: 0.78,
        defendMul: 1.38,
        reserveMul: 1.1
    },
    vos: {
        id: 'vos',
        name: 'Harren Vos',
        rank: 'Colonel',
        command: '7th Corps',
        side: 'remnant',
        country: 'Federation Remnant',
        countryShort: 'Remnant',
        line: 'Same drill as ours. He took the 7th across the river.',
        doctrine: 'cities',
        mainMul: 1.08,
        raidMul: 0.85,
        holdMul: 1.05,
        strikeMul: 1.12,
        defendMul: 1.08,
        reserveMul: 1.0
    }
};
function wodGeneralById(id) {
    if(id == null) return null;
    if(typeof id === 'object' && id.name) return id;
    if(WOD_GENERALS[id]) return WOD_GENERALS[id];
    for(let k in WOD_GENERALS) {
        if(WOD_GENERALS[k] && WOD_GENERALS[k].id === id) return WOD_GENERALS[k];
    }
    return null;
}
function wodAssignMatchGenerals(ids) {
    if(!gameData) return;
    if(!ids || !ids.length) {
        gameData._generalByOwner = null;
        return;
    }
    let map = {};
    for(let i = 0; i < ids.length; i++) map[2 + i] = ids[i];
    gameData._generalByOwner = map;
}
function wodMatchUsesWorldLore() {
    return !!(gameData && gameData._campaignRun);
}
function wodGeneralForOwner(owner) {
    if(!wodMatchUsesWorldLore()) return null;
    let o = owner | 0;
    if(o <= 1) return null;
    let ov = gameData && gameData._generalByOwner && gameData._generalByOwner[o];
    if(ov) return wodGeneralById(ov);
    return WOD_GENERALS[o] || WOD_GENERALS[((o - 2) % 3) + 2] || null;
}
function wodSideLabel(owner, opts) {
    opts = opts || {};
    let o = owner | 0;
    if(gameData && gameData.mp && gameData.mp.enabled && typeof wodMpIsHumanOwner === 'function' && wodMpIsHumanOwner(o)) {
        if(typeof wodMpDisplayNameForSlot === 'function')
            return wodMpDisplayNameForSlot(o, { gameDataMp: gameData.mp });
        return o === 1 ? 'You' : ('Player ' + o);
    }
    if(o === 1 || (typeof wodLocalPlayerOwner === 'function' && o === wodLocalPlayerOwner()))
        return 'You';
    if(wodMatchUsesWorldLore()) {
        let g = wodGeneralForOwner(o);
        if(g) {
            if(opts.short) return g.countryShort || g.name.split(' ').pop();
            if(g.country) return g.country;
            return g.rank + ' ' + g.name;
        }
    }
    return 'AI ' + (o - 1);
}
// The computer's commanders. One is drawn at random for each computer faction at the start of a match and kept
// secret; it is the whole of that faction's personality: the planners read its numbers and the field command
// fights its doctrine (js/ai/field-command.js, WOD_OPS_DOCTRINES), adjusted by its aggression. forts: how
// strongly it fortifies (2 = twice the forts, built twice as often and on more approaches).
const WOD_AI_COMMANDERS = {
    balanced:{name:'Field Marshal Rowan',style:'Balanced',doctrine:'hunter',aggression:{edge:-.06,patience:.6,relief:.6},line:'Combined arms and steady pressure: hunts down armies in the open and attacks without waiting for perfect odds.',defense:.28,flank:.2,ratio:1.05,motor:.18,mountain:.18,armor:.16,land:.35,traits:['Adaptable','Combined arms']},
    deliberate:{name:'General Vale',style:'Deliberate offensive',doctrine:'methodical',line:'Concentrates reserves and only pushes with a clear advantage.',defense:.24,flank:.15,ratio:1.4,motor:.22,mountain:.16,armor:.22,land:.3,traits:['Patient','Concentrated assaults']},
    defensive:{name:'Marshal Stone',style:'Defensive',doctrine:'methodical',forts:2,line:'Fortifies every threatened approach, holds strong screens and counterattacks with economical reserves.',defense:.44,flank:.12,ratio:1.5,motor:.12,mountain:.24,armor:.12,land:.25,traits:['Entrenched','Fortifier']},
    maneuver:{name:'General Swift',style:'Maneuver',doctrine:'raider',line:'Mobile groups raid weak towns and take land away from the fighting.',defense:.25,flank:.3,ratio:1.12,motor:.34,mountain:.12,armor:.13,land:.75,traits:['Mobile','Raider']},
    amphibious:{name:'Admiral Keel',style:'Amphibious',doctrine:'raider',line:'Builds fleets for real crossings, raids coasts and supports beachheads.',defense:.28,flank:.2,ratio:1.25,motor:.14,mountain:.14,armor:.14,land:.4,traits:['Naval logistics','Coastal raids']},
    highland:{name:'General Ridge',style:'Highland',doctrine:'hunter',line:'Uses mountaineers, high ground and passes, and falls on armies in the open.',defense:.34,flank:.24,ratio:1.25,motor:.1,mountain:.38,armor:.1,land:.6,traits:['Terrain specialist','Hunter']},
    blitz:{name:'General Hale',style:'Blitz',doctrine:'blitz',line:'Strikes early and often, before the enemy has dug in.',defense:.22,flank:.26,ratio:1.05,motor:.3,mountain:.12,armor:.2,land:.45,traits:['Aggressive','Early pressure']}
};
// Computer difficulty: how quickly it reacts, how big an edge it wants before attacking, how much of its bag of tricks
// it uses and how long it trusts what it saw under fog; and, on Hard and Brutal only, more money and manpower from its
// towns (bonus: Hard 10%, Brutal 25%; js/sim.js wodStepAiEconomy). Every description and difficulty picker says so.
// Easy and Normal get the same economy as the player. None sees through fog. Read through wodAiDifficulty (js/ai/brain.js).
// (Hard had no bonus until 2026-11-22: head to head it was no stronger than Normal, 183-201 towns over 96 lab matches.)
const WOD_AI_DIFFICULTIES = {
    easy:{label:'Easy',line:'Recruits slowly, reacts slowly, attacks only with a big advantage and keeps to plain attacks: no flanking wings, supply cuts, ambushes or baiting. Forgets what it saw under fog quickly.',
        pulseEvery:2,edge:.3,tricks:false,memory:20,buyEvery:5000,movesPerFrame:1,recruitGap:12000},
    normal:{label:'Normal',line:'The full computer opponent, with the same rules, money and manpower as you.',pulseEvery:1,edge:0,tricks:true,memory:45,buyEvery:2500,movesPerFrame:3},
    hard:{label:'Hard',line:'Reacts faster, accepts thinner odds and trusts what it saw under fog for longer. It gets 10% more money and manpower than the same towns and land would give you.',
        pulseEvery:1,pulseScale:.8,edge:-.06,tricks:true,memory:75,buyEvery:2000,movesPerFrame:5,bonus:1.1},
    brutal:{label:'Brutal',line:'Plays as Hard, but it gets 25% more money and manpower than the same towns and land would give you. It still cannot see through fog.',
        pulseEvery:1,pulseScale:.8,edge:-.06,tricks:true,memory:75,buyEvery:2000,movesPerFrame:5,bonus:1.25}
};
// The economy bonus of a level as players read it ('' for none), e.g. "+10% money and manpower".
function wodAiDifficultyBonusText(id) {
    const d = WOD_AI_DIFFICULTIES[id];
    return d && d.bonus && d.bonus !== 1 ? '+' + Math.round((d.bonus - 1) * 100) + '% money and manpower' : '';
}
// The line under every difficulty picker (skirmish, the lobby's rules, the campaign's new war and the war in progress)
// says what the chosen level does, its economy bonus included.
const WOD_DIFFICULTY_PICKERS = [['setupAiDifficulty', 'setupAiDifficultyDetail'], ['mpCfgAiDifficulty', 'mpCfgAiDifficultyDetail'],
    ['wodCampSetDifficulty', 'wodCampSetDifficultyDetail'], ['wodCampActiveDifficulty', 'wodCampActiveDifficultyDetail']];
// The game has one AI difficulty (wodStoredAiDifficulty): skirmish, the missions and the campaign play at it, and each of
// these pickers shows and sets it. (The lobby's picker is the room's own setting, which starts from it.)
const WOD_SHARED_DIFFICULTY_PICKERS = ['setupAiDifficulty', 'wodCampSetDifficulty', 'wodCampActiveDifficulty'];
function wodSyncSharedDifficultyPickers() {
    // (each picker gets its own listener: a change event that does not bubble still counts)
    for(const [p] of WOD_DIFFICULTY_PICKERS) {
        const el = document.getElementById(p);
        if(!el || el._wodDifficultyBound) continue;
        el._wodDifficultyBound = true;
        el.addEventListener('change', () => {
            if(WOD_SHARED_DIFFICULTY_PICKERS.includes(p) && WOD_AI_DIFFICULTIES[el.value]) { wodStoreAiDifficulty(el.value); wodSyncSharedDifficultyPickers(); }
            else wodSyncDifficultyDetails();
        });
    }
    const id = wodStoredAiDifficulty();
    for(const p of WOD_SHARED_DIFFICULTY_PICKERS) { const el = document.getElementById(p); if(el && el.value !== id) el.value = id; }
    wodSyncDifficultyDetails();
}
function wodSyncDifficultyDetails() {
    for(const [selId, hintId] of WOD_DIFFICULTY_PICKERS) {
        const sel = document.getElementById(selId), hint = document.getElementById(hintId);
        if(sel && hint) hint.textContent = (WOD_AI_DIFFICULTIES[sel.value] || WOD_AI_DIFFICULTIES.normal).line;
    }
}
if(typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', () => wodSyncSharedDifficultyPickers());
}
// Skirmish setup: the AI difficulty is remembered between sessions. (Each opponent's commander is drawn at random
// when the match starts and kept secret: see wodAiAssignCommanders.)
const WOD_AI_DIFFICULTY_KEY = 'simplewarsAiDifficulty';
function wodStoredAiDifficulty() {
    try { const v = localStorage.getItem(WOD_AI_DIFFICULTY_KEY); if(WOD_AI_DIFFICULTIES[v]) return v; } catch(_) {}
    return 'normal';
}
function wodStoreAiDifficulty(id) {
    if(!WOD_AI_DIFFICULTIES[id]) return;
    try { localStorage.setItem(WOD_AI_DIFFICULTY_KEY, id); } catch(_) {}
}
function wodAiDifficultyLabel(id) {return (WOD_AI_DIFFICULTIES[id] || WOD_AI_DIFFICULTIES.normal).label;}
function wodSyncSetupAiDifficulty() {
    const sel = document.getElementById('setupAiDifficulty'), hint = document.getElementById('setupAiDifficultyDetail');
    if(!sel) return;
    if(!sel._wodBound) {
        sel._wodBound = true;
        sel.addEventListener('change', () => { wodStoreAiDifficulty(sel.value); wodSyncSetupAiDifficulty(); });
    }
    sel.value = wodStoredAiDifficulty(); // (one setting for the whole game: it may have been changed in the campaign)
    wodSyncSharedDifficultyPickers();
    if(hint) hint.textContent = (WOD_AI_DIFFICULTIES[sel.value] || WOD_AI_DIFFICULTIES.normal).line;
    wodSyncDifficultyDetails();
}
// The difficulty chosen in skirmish setup (also used for authored missions).
function wodSetupAiDifficulty() {
    const sel = document.getElementById('setupAiDifficulty');
    return sel && WOD_AI_DIFFICULTIES[sel.value] ? sel.value : wodStoredAiDifficulty();
}
function wodSyncSetupOpponentsBrief() {
    let el = document.getElementById('setupOpponentsBrief');
    if(!el) return;
    wodSyncSetupAiDifficulty();
    let n = 1;
    let sel = document.getElementById('setupAI');
    if(sel) n = Math.max(1, Math.min(3, parseInt(sel.value, 10) || 1));
    // A roster: who plays, in their colours, with the computer's difficulty beside each opponent.
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const colourOf = o => { let c = typeof factionColors !== 'undefined' && factionColors[o]; return /^#[0-9A-Fa-f]{6}$/.test(c || '') ? c : '#888888'; };
    let you = document.getElementById('setupPlayerColor'), youColour = you && /^#[0-9A-Fa-f]{6}$/.test(you.value) ? you.value : colourOf(1);
    let level = (WOD_AI_DIFFICULTIES[wodSetupAiDifficulty()] || WOD_AI_DIFFICULTIES.normal).label;
    const line = (colour, name, tag, cls) => '<li class="wod-roster-line' + (cls ? ' ' + cls : '') + '"><span class="wod-roster-dot" style="background:' + colour + '"></span><span class="wod-roster-name">' + esc(name) + '</span><span class="wod-roster-tag">' + esc(tag) + '</span></li>';
    let lines = [line(youColour, wodMatchUsesWorldLore() ? WOD_WORLD.player.name : 'Player', 'You', 'wod-roster-line--you')];
    for(let i = 0; i < n; i++) lines.push(line(colourOf(2 + i), wodSideLabel(2 + i), 'Opponent ' + (i + 1) + ' · ' + level));
    el.innerHTML = '<ul class="wod-roster" aria-label="Players in this match">' + lines.join('') + '</ul>';
}
const WOD_FACTION_COLOR_OPTIONS = [
    { value: '#2ecc71', label: 'Green' },
    { value: '#3498db', label: 'Blue' },
    { value: '#e74c3c', label: 'Red' },
    { value: '#9b59b6', label: 'Purple' },
    { value: '#e67e22', label: 'Orange' },
    { value: '#f1c40f', label: 'Yellow' },
    { value: '#1abc9c', label: 'Teal' },
    { value: '#ecf0f1', label: 'Light gray' }
];
function applyPlayerFactionColorFromSetup() {
    let el = document.getElementById('setupPlayerColor');
    let hex = el && el.value;
    if(hex && /^#[0-9A-Fa-f]{6}$/.test(hex)) {
        factionColors[1] = hex;
        gameData.shopPreviewPlayerColor = hex;
        syncShopColorSwatch('player');
    } else factionColors[1] = '#2ecc71';
    ensureAiFactionColorsDistinctFromPlayer();
}
function colorRgbDistance(hexA, hexB) {
    if(!hexA || !hexB || hexA[0] !== '#' || hexB[0] !== '#') return 999;
    let a = hexA.slice(1), b = hexB.slice(1);
    if(a.length !== 6 || b.length !== 6) return 999;
    let ar = parseInt(a.slice(0, 2), 16), ag = parseInt(a.slice(2, 4), 16), ab = parseInt(a.slice(4, 6), 16);
    let br = parseInt(b.slice(0, 2), 16), bg = parseInt(b.slice(2, 4), 16), bb = parseInt(b.slice(4, 6), 16);
    let dr = ar - br, dg = ag - bg, db = ab - bb;
    return Math.sqrt(dr * dr + dg * dg + db * db);
}
function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    let c = (1 - Math.abs(2 * l - 1)) * s;
    let x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    let m = l - c / 2;
    let rp = 0, gp = 0, bp = 0;
    if(h < 60) { rp = c; gp = x; }
    else if(h < 120) { rp = x; gp = c; }
    else if(h < 180) { gp = c; bp = x; }
    else if(h < 240) { gp = x; bp = c; }
    else if(h < 300) { rp = x; bp = c; }
    else { rp = c; bp = x; }
    let r = Math.round((rp + m) * 255), g = Math.round((gp + m) * 255), b = Math.round((bp + m) * 255);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).padStart(6, '0');
}
function ensureAiFactionColorsDistinctFromPlayer() {
    let playerHex = factionColors[1] || '#2ecc71';
    let pool = [
        '#e74c3c', '#9b59b6', '#e67e22', '#3498db', '#f1c40f', '#1abc9c',
        '#c0392b', '#8e44ad', '#d35400', '#2980b9', '#f39c12', '#27ae60', '#16a085',
        '#34495e', '#95a5a6', '#6c5ce7', '#00b894', '#fd79a8', '#636e72'
    ];
    let used = new Set([String(playerHex).toLowerCase()]);
    let minDist = 52;
    for(let i = 2; i < factionColors.length; i++) {
        let cur = factionColors[i];
        let curL = cur ? String(cur).toLowerCase() : '';
        let tooClose = cur ? colorRgbDistance(cur, playerHex) < minDist : true;
        let dup = curL && used.has(curL);
        if(tooClose || dup) {
            let pick = null;
            for(let c of pool) {
                let cl = c.toLowerCase();
                if(used.has(cl)) continue;
                if(colorRgbDistance(c, playerHex) < minDist) continue;
                pick = c;
                break;
            }
            if(!pick) {
                for(let c of pool) {
                    let cl = c.toLowerCase();
                    if(used.has(cl)) continue;
                    pick = c;
                    break;
                }
            }
            if(!pick) {
                for(let k = 0; k < 40; k++) {
                    let hue = (i * 137 + k * 47) % 360;
                    let hex = hslToHex(hue, 64, 47);
                    let hl = hex.toLowerCase();
                    if(used.has(hl)) continue;
                    if(colorRgbDistance(hex, playerHex) < 40 && k < 36) continue;
                    pick = hex;
                    break;
                }
            }
            factionColors[i] = pick || '#e74c3c';
        }
        used.add(String(factionColors[i]).toLowerCase());
    }
}
const hexDirections = [
    {q: 1, r: 0}, {q: -1, r: 0}, {q: 0, r: 1}, {q: 0, r: -1},
    {q: 1, r: 1}, {q: -1, r: -1}, {q: 1, r: -1}, {q: -1, r: 1}
];
// 4-neighbor edges only — diagonal borders duplicate corners with cardinal edges,
// produce odd-degree vertices T-junctions when stitched with thick strokes.
const cardinalHexDirections = [
    {q: 1, r: 0}, {q: -1, r: 0}, {q: 0, r: 1}, {q: 0, r: -1}
];
// Overall pacing — deliberate marches and combat cadence.
const WOD_UNIT_BASE_SPEED = 15;
const WOD_MOVE_SPEED_FACTOR = 0.432;
const WOD_ATTACK_INTERVAL_MULT = 2.65;
const WOD_MORALE_MAX = 100;
const WOD_MORALE_ROUT_AT = 20;
const WOD_MORALE_RALLY_AT = 50;
function wodUnitBaseSpeed(unit) {return WOD_UNIT_BASE_SPEED*({heavy:.9,motorized:1.1}[unit?.type]||1);}
const WOD_UNIT_SPAWN_FX_DUR = 2.0;
const WOD_OVERHEAD_POP_DUR = 0.55;
const WOD_COMBAT_FX_CAP = 80;
const WOD_COMBAT_SHOTS_PER_FRAME = 20;
const WOD_SPAWN_FX_DRAW_CAP = 8;
const WOD_SPAWN_FX_FRAME_COUNT = 20;
const WOD_COMBAT_SPRITE_CACHE_COUNT = 100;
const WOD_SPAWN_FX_REF_R = 10;
const WOD_SPAWN_FX_CANVAS_SIZE = 112;
const WOD_CITY_CAPTURE_EVAL_INTERVAL = 0.2;
let wodFxCache = null;
const WOD_VETERAN_XP_THRESHOLD = 100;
const WOD_VETERAN_STAT_MULT = 1.1;
const WOD_UNIT_RANKS = [{xp:0,name:'Regular'},{xp:25,name:'Trained'},{xp:50,name:'Seasoned'},{xp:100,name:'Veteran'}];
function wodUnitExperience(unit) {
    const xp=Math.max(0,Number(unit?.xp)||0),effective=unit?.veteran?Math.max(100,xp):xp;
    let level=0;for(let i=1;i<WOD_UNIT_RANKS.length;i++)if(effective>=WOD_UNIT_RANKS[i].xp)level=i;
    return {xp,level,maxLevel:WOD_UNIT_RANKS.length-1,rank:WOD_UNIT_RANKS[level],next:WOD_UNIT_RANKS[level+1],progress:Math.min(100,effective)};
}
const SL_PROGRESS_LS_KEY = 'simplewarsProgress.v1';
const SL_PROGRESS_LS_BACKUP_KEY = 'simplewarsProgress.backup.v1';
const SL_PROGRESS_LS_LEGACY = 'wodProgress.v2';
