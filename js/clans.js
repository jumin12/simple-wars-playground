// Clans and clan wars: clan emblems (preset badges and country flags), the Clan and Clan wars tabs of the multiplayer
// screen, clan badges beside player names, the clan leaderboard, and the clan-war lobby, which the matched players'
// games set up and start on their own. The relay (server/clans.js, server/index.js) keeps clans and runs the queues.
'use strict';

// ---------------------------------------------------------------- emblems
const WOD_CLAN_PRESETS = {
    swords: ['Crossed swords', '#7a1f1f', '#f4d58d', '<g stroke="{F}" stroke-linecap="round"><path d="M17 47L47 17M47 47L17 17" stroke-width="4.5"/><path d="M15 39l10 10M39 49l10-10" stroke-width="3.5"/></g><circle cx="13" cy="51" r="3" fill="{F}"/><circle cx="51" cy="51" r="3" fill="{F}"/>'],
    shield: ['Shield', '#1f3a6b', '#e8eef7', '<path d="M32 10L50 16.5V31C50 42.5 41.5 50 32 55C22.5 50 14 42.5 14 31V16.5Z" fill="{F}"/><path d="M32 14.5L46 19.6V31C46 40.3 39.3 46.6 32 50.5C24.7 46.6 18 40.3 18 31V19.6Z" fill="{B}"/><rect x="29.5" y="15" width="5" height="35" fill="{F}"/><rect x="18" y="27" width="28" height="5" fill="{F}"/>'],
    star: ['Star', '#1d4d2b', '#f1c40f', '<polygon points="32,11 37.6,25.3 52.9,26.2 41,35.9 44.9,50.8 32,42.5 19.1,50.8 23,35.9 11.1,26.2 26.4,25.3" fill="{F}"/>'],
    crown: ['Crown', '#4b2a6b', '#f1c40f', '<path d="M14 44L16 21L25 31L32 16L39 31L48 21L50 44Z" fill="{F}"/><rect x="14" y="46" width="36" height="5" rx="1.5" fill="{F}"/><circle cx="32" cy="37" r="3" fill="{B}"/><circle cx="22" cy="39" r="2" fill="{B}"/><circle cx="42" cy="39" r="2" fill="{B}"/>'],
    eagle: ['Eagle', '#5a3b1a', '#f3e3c3', '<path d="M32 16C29.8 16 28.3 17.6 28.3 19.6L26.5 22.4L28.8 22.8L29.3 26.5L22 21.5H18L11.5 15.5L12.6 20.6L7.5 18.8L10.8 23.8H5.8L9.8 27.8L5.8 29.8L11.8 31.8L9.8 34.8L16.8 33.8L22 33L26.8 36L26 43.5L21.5 50L26.8 48L29 52.5L32 49L35 52.5L37.2 48L42.5 50L38 43.5L37.2 36L42 33L47.2 33.8L54.2 34.8L52.2 31.8L58.2 29.8L54.2 27.8L58.2 23.8H53.2L56.5 18.8L51.4 20.6L52.5 15.5L46 21.5H42L34.7 26.5L35.2 22.8L37.5 22.4L35.7 19.6C35.7 17.6 34.2 16 32 16Z" fill="{F}"/><circle cx="30.8" cy="19.4" r="1" fill="{B}"/>'],
    wolf: ['Wolf', '#2c3e50', '#cfd8dc', '<path d="M15 9L25 21Q32 18 39 21L49 9L50 27Q52 31 50 35L44.5 41Q40.5 49.5 32 54.5Q23.5 49.5 19.5 41L14 35Q12 31 14 27Z" fill="{F}"/><path d="M18.5 14.5L23.8 21.8L20.5 24ZM45.5 14.5L40.2 21.8L43.5 24Z" fill="{B}" opacity=".5"/><path d="M21.5 30.5L28.5 32.8L23 34.6ZM42.5 30.5L35.5 32.8L41 34.6Z" fill="{B}"/><path d="M28.2 43.8Q32 41 35.8 43.8L32 47.6Z" fill="{B}"/><path d="M32 47.6V51" stroke="{B}" stroke-width="1.5"/>'],
    tower: ['Tower', '#3d3d3d', '#d7ccc8', '<rect x="22" y="24" width="20" height="25" fill="{F}"/><rect x="19" y="15" width="6" height="10" fill="{F}"/><rect x="29" y="15" width="6" height="10" fill="{F}"/><rect x="39" y="15" width="6" height="10" fill="{F}"/><rect x="17" y="48" width="30" height="5" rx="1" fill="{F}"/><path d="M28 49V40A4 4 0 0 1 36 40V49Z" fill="{B}"/>'],
    anchor: ['Anchor', '#0b3d5c', '#e0f2f1', '<circle cx="32" cy="14" r="4.5" stroke="{F}" stroke-width="3.5" fill="none"/><rect x="30" y="18" width="4" height="32" fill="{F}"/><rect x="21" y="23" width="22" height="4" rx="2" fill="{F}"/><path d="M15 35C17 47 27 52 32 52C37 52 47 47 49 35" stroke="{F}" stroke-width="4" fill="none"/><path d="M11 37L19 32L20 41Z M53 37L45 32L44 41Z" fill="{F}"/>'],
    bolt: ['Lightning', '#222831', '#ffd54f', '<polygon points="37,7 17,36 30,36 25,57 47,26 34,26 41,7" fill="{F}"/>'],
    flame: ['Flame', '#5d1a0a', '#ff8f3a', '<path d="M32 7C36 18 47 22 47 37C47 47 40 55 32 55C24 55 17 47 17 38C17 30 23 26 26 19C28 26 30 28 32 30C34 23 34 15 32 7Z" fill="{F}"/><path d="M32 33C34 39 39 41 39 46C39 50 36 53 32 53C28 53 25 50 25 46C25 42 29 40 32 33Z" fill="{B}" opacity=".55"/>'],
    tank: ['Tank', '#3b4a2a', '#c5d6a0', '<rect x="22" y="26" width="18" height="11" rx="3" fill="{F}"/><rect x="39" y="29.5" width="17" height="4" rx="1.5" fill="{F}"/><path d="M11 37H53L49 45H15Z" fill="{F}"/><rect x="13" y="44" width="38" height="7" rx="3.5" fill="{F}"/><g fill="{B}"><circle cx="19" cy="47.5" r="1.8"/><circle cx="26" cy="47.5" r="1.8"/><circle cx="33" cy="47.5" r="1.8"/><circle cx="40" cy="47.5" r="1.8"/><circle cx="46" cy="47.5" r="1.8"/></g>'],
    skull: ['Skull', '#111418', '#eceff1', '<circle cx="32" cy="28" r="15" fill="{F}"/><rect x="23" y="37" width="18" height="12" rx="3" fill="{F}"/><circle cx="26" cy="28" r="4.2" fill="{B}"/><circle cx="38" cy="28" r="4.2" fill="{B}"/><path d="M32 33L29.5 38H34.5Z" fill="{B}"/><path d="M27 44V49M32 44V49M37 44V49" stroke="{B}" stroke-width="1.6"/>'],
    lion: ['Lion', '#7a4a0c', '#ffcc66', '<circle cx="49.5" cy="33.0" r="6.2" fill="{F}"/><circle cx="47.8" cy="40.6" r="6.2" fill="{F}"/><circle cx="42.9" cy="46.7" r="6.2" fill="{F}"/><circle cx="35.9" cy="50.1" r="6.2" fill="{F}"/><circle cx="28.1" cy="50.1" r="6.2" fill="{F}"/><circle cx="21.1" cy="46.7" r="6.2" fill="{F}"/><circle cx="16.2" cy="40.6" r="6.2" fill="{F}"/><circle cx="14.5" cy="33.0" r="6.2" fill="{F}"/><circle cx="16.2" cy="25.4" r="6.2" fill="{F}"/><circle cx="21.1" cy="19.3" r="6.2" fill="{F}"/><circle cx="28.1" cy="15.9" r="6.2" fill="{F}"/><circle cx="35.9" cy="15.9" r="6.2" fill="{F}"/><circle cx="42.9" cy="19.3" r="6.2" fill="{F}"/><circle cx="47.8" cy="25.4" r="6.2" fill="{F}"/><circle cx="32" cy="33" r="18" fill="{F}"/><circle cx="32" cy="34" r="12.5" fill="{B}"/><circle cx="23.5" cy="23.5" r="3.6" fill="{B}"/><circle cx="40.5" cy="23.5" r="3.6" fill="{B}"/><circle cx="27.5" cy="31.5" r="1.9" fill="{F}"/><circle cx="36.5" cy="31.5" r="1.9" fill="{F}"/><path d="M28.8 37H35.2L32 40.6Z" fill="{F}"/><path d="M32 40.6Q29.6 43.6 27.2 42.4M32 40.6Q34.4 43.6 36.8 42.4" stroke="{F}" stroke-width="1.5" fill="none" stroke-linecap="round"/>'],
    axe: ['Battle axe', '#4a2412', '#e0e0e0', '<g transform="translate(32 32) scale(.84) rotate(32) translate(-38.5 -32)"><rect x="29.6" y="7" width="4.8" height="50" rx="2.2" fill="#b08a5a"/><rect x="29.6" y="46" width="4.8" height="3" fill="{B}" opacity=".5"/><path d="M34 13C40 11.5 45.5 9 50 6.5Q57.5 21 51 36.5Q48.5 40.5 45 42.5C43.5 35 39 29.5 34 28Z" fill="{F}"/><path d="M50 9.5Q55.5 21.5 49.5 34.5" stroke="#fff" stroke-width="1.6" fill="none" opacity=".75"/><path d="M29.6 15L20 18.5L29.6 23.5Z" fill="{F}"/><circle cx="32" cy="20.5" r="1.6" fill="{B}"/></g>'],
    sun: ['Sun', '#0d47a1', '#ffd54f', '<circle cx="32" cy="32" r="10" fill="{F}"/><g fill="{F}"><polygon points="32,8 35,19 29,19"/><polygon points="32,56 35,45 29,45"/><polygon points="8,32 19,29 19,35"/><polygon points="56,32 45,29 45,35"/><polygon points="15,15 23.5,21 21,23.5"/><polygon points="49,49 40.5,43 43,40.5"/><polygon points="49,15 43,23.5 40.5,21"/><polygon points="15,49 21,40.5 23.5,43"/></g>'],
    trident: ['Trident', '#004d40', '#80cbc4', '<rect x="30" y="22" width="4" height="34" rx="1.5" fill="{F}"/><path d="M19 12V25C19 30 24 33 32 33C40 33 45 30 45 25V12" stroke="{F}" stroke-width="4" fill="none"/><rect x="30" y="8" width="4" height="22" fill="{F}"/><path d="M15 14L19 6L23 14ZM28 10L32 2L36 10ZM41 14L45 6L49 14Z" fill="{F}"/>'],
};
function wodFlagStripes(dir, cols, weights) {
    weights = weights || cols.map(() => 1);
    const total = weights.reduce((a, b) => a + b, 0);
    let at = 0, out = '';
    cols.forEach((c, i) => {
        const size = (dir === 'h' ? 40 : 60) * weights[i] / total;
        out += dir === 'h' ? '<rect x="0" y="' + at.toFixed(2) + '" width="60" height="' + (size + 0.05).toFixed(2) + '" fill="' + c + '"/>' : '<rect x="' + at.toFixed(2) + '" y="0" width="' + (size + 0.05).toFixed(2) + '" height="40" fill="' + c + '"/>';
        at += size;
    });
    return out;
}
function wodFlagStar(cx, cy, R, fill, rot) {
    const pts = [];
    for(let i = 0; i < 10; i++) { const r = i % 2 ? R * 0.382 : R, a = (rot == null ? -90 : rot) * Math.PI / 180 + i * Math.PI / 5; pts.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2)); }
    return '<polygon points="' + pts.join(' ') + '" fill="' + fill + '"/>';
}
function wodFlagNordic(bg, cross, inner) {
    let s = '<rect width="60" height="40" fill="' + bg + '"/><rect x="16" y="0" width="9" height="40" fill="' + cross + '"/><rect x="0" y="15.5" width="60" height="9" fill="' + cross + '"/>';
    if(inner) s += '<rect x="18.5" y="0" width="4" height="40" fill="' + inner + '"/><rect x="0" y="18" width="60" height="4" fill="' + inner + '"/>';
    return s;
}
function wodFlagJack() {
    return '<rect width="60" height="40" fill="#012169"/><path d="M0,0L60,40M60,0L0,40" stroke="#fff" stroke-width="8"/><path d="M0,0L60,40M60,0L0,40" stroke="#C8102E" stroke-width="2.7"/><path d="M30,0V40M0,20H60" stroke="#fff" stroke-width="13"/><path d="M30,0V40M0,20H60" stroke="#C8102E" stroke-width="7.5"/>';
}
// A crescent (a disc with a disc of the background cut out of it), as on several flags.
function wodFlagCrescent(cx, cy, r, fill, bg, shift) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '"/><circle cx="' + (cx + (shift == null ? r * 0.28 : shift)) + '" cy="' + cy + '" r="' + (r * 0.8).toFixed(2) + '" fill="' + bg + '"/>'; }
function wodFlagSun(cx, cy, r, fill, rays) {
    let s = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '"/>';
    for(let i = 0; i < (rays || 12); i++) { const a = i / (rays || 12) * Math.PI * 2, b = a + Math.PI / (rays || 12); s += '<polygon points="' + [[cx + Math.cos(a - .12) * r * 1.1, cy + Math.sin(a - .12) * r * 1.1], [cx + Math.cos(b) * r * 1.75, cy + Math.sin(b) * r * 1.75], [cx + Math.cos(a + Math.PI * 2 / (rays || 12) + .12) * r * 1.1, cy + Math.sin(a + Math.PI * 2 / (rays || 12) + .12) * r * 1.1]].map(p => p.map(n => n.toFixed(2)).join(',')).join(' ') + '" fill="' + fill + '"/>'; }
    return s;
}
// Diagonal band from the bottom left to the top right (or the other way), for several flags.
function wodFlagDiag(color, width, down) { return '<path d="' + (down ? 'M0,0L60,40' : 'M0,40L60,0') + '" stroke="' + color + '" stroke-width="' + width + '"/>'; }
function wodFlagHoist(color, depth) { return '<polygon points="0,0 ' + (depth || 26) + ',20 0,40" fill="' + color + '"/>'; }
const wodFlagCanton = inner => '<svg x="0" y="0" width="30" height="20" viewBox="0 0 60 40">' + inner + '</svg>';
const WOD_CLAN_FLAGS = {
    us: ['United States', () => { let s = ''; for(let i = 0; i < 13; i++) s += '<rect x="0" y="' + (i * 40 / 13).toFixed(2) + '" width="60" height="' + (40 / 13 + 0.05).toFixed(2) + '" fill="' + (i % 2 ? '#fff' : '#b22234') + '"/>'; s += '<rect width="25" height="21.5" fill="#3c3b6e"/>'; for(let r = 0; r < 5; r++) for(let c = 0; c < 6; c++) s += '<circle cx="' + (2.4 + c * 4 + (r % 2) * 2).toFixed(1) + '" cy="' + (2.6 + r * 4.1).toFixed(1) + '" r="0.9" fill="#fff"/>'; return s; }],
    gb: ['United Kingdom', wodFlagJack],
    ca: ['Canada', () => wodFlagStripes('v', ['#d52b1e', '#fff', '#d52b1e'], [1, 2, 1]) + '<path d="M30 8L32 13L35 11.5L34 17L38 15L37 19L40 20L34.5 24.5L35.5 27L31 26V32H29V26L24.5 27L25.5 24.5L20 20L23 19L22 15L26 17L25 11.5L28 13Z" fill="#d52b1e"/>'],
    au: ['Australia', () => '<rect width="60" height="40" fill="#012169"/>' + wodFlagCanton(wodFlagJack()) + wodFlagStar(15, 30, 4.5, '#fff', -90) + wodFlagStar(45, 33, 2.2, '#fff') + wodFlagStar(38, 18, 2.2, '#fff') + wodFlagStar(45, 8, 2.2, '#fff') + wodFlagStar(51, 16, 2.2, '#fff') + wodFlagStar(47, 22, 1.3, '#fff')],
    fr: ['France', () => wodFlagStripes('v', ['#0055a4', '#fff', '#ef4135'])],
    de: ['Germany', () => wodFlagStripes('h', ['#000', '#dd0000', '#ffce00'])],
    it: ['Italy', () => wodFlagStripes('v', ['#009246', '#fff', '#ce2b37'])],
    es: ['Spain', () => wodFlagStripes('h', ['#aa151b', '#f1bf00', '#aa151b'], [1, 2, 1])],
    pt: ['Portugal', () => wodFlagStripes('v', ['#006600', '#ff0000'], [2, 3]) + '<circle cx="24" cy="20" r="6.5" fill="#ffcc00"/><circle cx="24" cy="20" r="4" fill="#ff0000" stroke="#fff" stroke-width="1"/>'],
    nl: ['Netherlands', () => wodFlagStripes('h', ['#ae1c28', '#fff', '#21468b'])],
    be: ['Belgium', () => wodFlagStripes('v', ['#000', '#fae042', '#ed2939'])],
    ie: ['Ireland', () => wodFlagStripes('v', ['#169b62', '#fff', '#ff883e'])],
    ch: ['Switzerland', () => '<rect width="60" height="40" fill="#d52b1e"/><rect x="26" y="8" width="8" height="24" fill="#fff"/><rect x="18" y="16" width="24" height="8" fill="#fff"/>'],
    at: ['Austria', () => wodFlagStripes('h', ['#ed2939', '#fff', '#ed2939'])],
    pl: ['Poland', () => wodFlagStripes('h', ['#fff', '#dc143c'])],
    ua: ['Ukraine', () => wodFlagStripes('h', ['#0057b7', '#ffd700'])],
    ru: ['Russia', () => wodFlagStripes('h', ['#fff', '#0039a6', '#d52b1e'])],
    se: ['Sweden', () => wodFlagNordic('#006aa7', '#fecc00')],
    no: ['Norway', () => wodFlagNordic('#ba0c2f', '#fff', '#00205b')],
    dk: ['Denmark', () => wodFlagNordic('#c60c30', '#fff')],
    fi: ['Finland', () => wodFlagNordic('#fff', '#003580')],
    is: ['Iceland', () => wodFlagNordic('#02529c', '#fff', '#dc1e35')],
    gr: ['Greece', () => { let s = ''; for(let i = 0; i < 9; i++) s += '<rect x="0" y="' + (i * 40 / 9).toFixed(2) + '" width="60" height="' + (40 / 9 + 0.05).toFixed(2) + '" fill="' + (i % 2 ? '#fff' : '#0d5eaf') + '"/>'; return s + '<rect width="22.2" height="22.2" fill="#0d5eaf"/><rect x="8.9" y="0" width="4.4" height="22.2" fill="#fff"/><rect x="0" y="8.9" width="22.2" height="4.4" fill="#fff"/>'; }],
    tr: ['Türkiye', () => '<rect width="60" height="40" fill="#e30a17"/><circle cx="22" cy="20" r="10" fill="#fff"/><circle cx="24.6" cy="20" r="8" fill="#e30a17"/>' + wodFlagStar(35, 20, 5, '#fff', 180)],
    jp: ['Japan', () => '<rect width="60" height="40" fill="#fff"/><circle cx="30" cy="20" r="12" fill="#bc002d"/>'],
    kr: ['South Korea', () => '<rect width="60" height="40" fill="#fff"/><path d="M20 20A10 10 0 0 1 40 20Z" fill="#cd2e3a"/><path d="M20 20A10 10 0 0 0 40 20Z" fill="#0047a0"/><circle cx="25" cy="20" r="5" fill="#cd2e3a"/><circle cx="35" cy="20" r="5" fill="#0047a0"/><g stroke="#000" stroke-width="1.6"><path d="M8 8l6 -4M9.5 10l6 -4M11 12l6 -4M43 4l6 4M44.5 2l6 4M41.5 6l6 4M8 32l6 4M9.5 30l6 4M11 28l6 4M43 36l6 -4M44.5 38l6 -4M41.5 34l6 -4"/></g>'],
    cn: ['China', () => '<rect width="60" height="40" fill="#de2910"/>' + wodFlagStar(10, 10, 6, '#ffde00') + wodFlagStar(20, 4, 2, '#ffde00', -60) + wodFlagStar(24, 8, 2, '#ffde00', -80) + wodFlagStar(24, 14, 2, '#ffde00', -100) + wodFlagStar(20, 18, 2, '#ffde00', -120)],
    in: ['India', () => wodFlagStripes('h', ['#ff9933', '#fff', '#138808']) + '<circle cx="30" cy="20" r="5" fill="none" stroke="#000080" stroke-width="1.2"/><circle cx="30" cy="20" r="1" fill="#000080"/>'],
    br: ['Brazil', () => '<rect width="60" height="40" fill="#009c3b"/><polygon points="30,4 55,20 30,36 5,20" fill="#ffdf00"/><circle cx="30" cy="20" r="8.5" fill="#002776"/><path d="M22 18.5Q30 16 38.4 21.5" stroke="#fff" stroke-width="1.4" fill="none"/>'],
    ar: ['Argentina', () => wodFlagStripes('h', ['#74acdf', '#fff', '#74acdf']) + '<circle cx="30" cy="20" r="4" fill="#f6b40e"/>'],
    mx: ['Mexico', () => wodFlagStripes('v', ['#006847', '#fff', '#ce1126']) + '<circle cx="30" cy="20" r="4.5" fill="#8c5a2b"/><path d="M26 22Q30 26 34 22" stroke="#006847" stroke-width="1.4" fill="none"/>'],
    co: ['Colombia', () => wodFlagStripes('h', ['#fcd116', '#003893', '#ce1126'], [2, 1, 1])],
    cl: ['Chile', () => wodFlagStripes('h', ['#fff', '#d52b1e']) + '<rect width="20" height="20" fill="#0039a6"/>' + wodFlagStar(10, 10, 4.5, '#fff')],
    za: ['South Africa', () => '<rect width="60" height="20" fill="#e03c31"/><rect y="20" width="60" height="20" fill="#001489"/><polygon points="0,-3 10,-3 31,12 60,12 60,28 31,28 10,43 0,43" fill="#fff"/><polygon points="0,0 5,0 28,15 60,15 60,25 28,25 5,40 0,40" fill="#007749"/><polygon points="0,4 22,20 0,36" fill="#ffb81c"/><polygon points="0,7.5 17,20 0,32.5" fill="#000"/>'],
    ng: ['Nigeria', () => wodFlagStripes('v', ['#008751', '#fff', '#008751'])],
    eg: ['Egypt', () => wodFlagStripes('h', ['#ce1126', '#fff', '#000']) + '<circle cx="30" cy="20" r="3.5" fill="#c09300"/>'],
    il: ['Israel', () => '<rect width="60" height="40" fill="#fff"/><rect y="4" width="60" height="5" fill="#0038b8"/><rect y="31" width="60" height="5" fill="#0038b8"/><g fill="none" stroke="#0038b8" stroke-width="1.6"><polygon points="30,12.5 36.5,23.75 23.5,23.75"/><polygon points="30,27.5 36.5,16.25 23.5,16.25"/></g>'],
    ro: ['Romania', () => wodFlagStripes('v', ['#002b7f', '#fcd116', '#ce1126'])],
    hu: ['Hungary', () => wodFlagStripes('h', ['#ce2939', '#fff', '#477050'])],
    cz: ['Czechia', () => wodFlagStripes('h', ['#fff', '#d7141a']) + '<polygon points="0,0 30,20 0,40" fill="#11457e"/>'],
    nz: ['New Zealand', () => '<rect width="60" height="40" fill="#012169"/>' + wodFlagCanton(wodFlagJack()) + [[45, 9], [40, 19], [51, 17], [45, 32]].map(([x, y]) => wodFlagStar(x, y, 2.9, '#fff') + wodFlagStar(x, y, 2.1, '#c8102e')).join('')],
    vn: ['Vietnam', () => '<rect width="60" height="40" fill="#da251d"/>' + wodFlagStar(30, 21, 10, '#ffcd00')],
    id: ['Indonesia', () => wodFlagStripes('h', ['#ce1126', '#fff'])],
    ph: ['Philippines', () => wodFlagStripes('h', ['#0038a8', '#ce1126']) + '<polygon points="0,0 34.6,20 0,40" fill="#fff"/><circle cx="11" cy="20" r="3.5" fill="#fcd116"/>' + wodFlagStar(3.5, 5, 1.6, '#fcd116') + wodFlagStar(3.5, 35, 1.6, '#fcd116') + wodFlagStar(28, 20, 1.6, '#fcd116')],
    th: ['Thailand', () => wodFlagStripes('h', ['#a51931', '#f4f5f8', '#2d2a4a', '#f4f5f8', '#a51931'], [1, 1, 2, 1, 1])],
    bd: ['Bangladesh', () => '<rect width="60" height="40" fill="#006a4e"/><circle cx="27" cy="20" r="8.5" fill="#f42a41"/>'],
    pe: ['Peru', () => wodFlagStripes('v', ['#d91023', '#fff', '#d91023'])],
    ee: ['Estonia', () => wodFlagStripes('h', ['#0072ce', '#000', '#fff'])],
    lt: ['Lithuania', () => wodFlagStripes('h', ['#fdb913', '#006a44', '#c1272d'])],
    lv: ['Latvia', () => wodFlagStripes('h', ['#9e3039', '#fff', '#9e3039'], [2, 1, 2])],
    eng: ['England', () => '<rect width="60" height="40" fill="#fff"/><rect x="26" y="0" width="8" height="40" fill="#ce1124"/><rect x="0" y="16" width="60" height="8" fill="#ce1124"/>'],
    sct: ['Scotland', () => '<rect width="60" height="40" fill="#005eb8"/><path d="M0,0L60,40M60,0L0,40" stroke="#fff" stroke-width="7"/>'],
    bg: ['Bulgaria', () => wodFlagStripes('h', ['#fff', '#00966e', '#d62612'])],
    lu: ['Luxembourg', () => wodFlagStripes('h', ['#ed2939', '#fff', '#00a1de'])],
    rs: ['Serbia', () => wodFlagStripes('h', ['#c6363c', '#0c4076', '#fff']) + '<path d="M17 11H27V22Q27 28 22 30Q17 28 17 22Z" fill="#c6363c" stroke="#fff" stroke-width="1.2"/><path d="M22 14V26M18.5 19H25.5" stroke="#fff" stroke-width="1.6"/>'],
    hr: ['Croatia', () => { let c = ''; for(let r = 0; r < 4; r++) for(let k = 0; k < 4; k++) c += '<rect x="' + (24 + k * 3) + '" y="' + (12 + r * 3) + '" width="3" height="3" fill="' + ((r + k) % 2 ? '#fff' : '#ff0000') + '"/>'; return wodFlagStripes('h', ['#ff0000', '#fff', '#171796']) + '<path d="M24 12H36V24Q36 29 30 31Q24 29 24 24Z" fill="#fff"/>' + c + '<path d="M24 24Q24 29 30 31Q36 29 36 24Z" fill="#ff0000"/><path d="M24 24H36" stroke="#fff" stroke-width=".6"/>'; }],
    si: ['Slovenia', () => wodFlagStripes('h', ['#fff', '#005da4', '#ed1c24']) + '<path d="M12 8H22V17Q22 22 17 24Q12 22 12 17Z" fill="#005da4" stroke="#ed1c24" stroke-width="1"/><path d="M13 18L15.5 14L17 16L18.5 13L21 18Z" fill="#fff"/>'],
    sk: ['Slovakia', () => wodFlagStripes('h', ['#fff', '#0b4ea2', '#ee1c25']) + '<path d="M14 10H28V22Q28 29 21 32Q14 29 14 22Z" fill="#ee1c25" stroke="#fff" stroke-width="1.4"/><path d="M21 13V27M17.5 17H24.5M18.5 21H23.5" stroke="#fff" stroke-width="1.8"/><path d="M15.5 27Q21 22 26.5 27Q24 30.5 21 31.5Q18 30.5 15.5 27Z" fill="#0b4ea2"/>'],
    al: ['Albania', () => '<rect width="60" height="40" fill="#e41e20"/><g transform="translate(10.8 -0.6) scale(.6)"><path d="M32 16C29.8 16 28.3 17.6 28.3 19.6L26.5 22.4L28.8 22.8L29.3 26.5L22 21.5H18L11.5 15.5L12.6 20.6L7.5 18.8L10.8 23.8H5.8L9.8 27.8L5.8 29.8L11.8 31.8L9.8 34.8L16.8 33.8L22 33L26.8 36L26 43.5L21.5 50L26.8 48L29 52.5L32 49L35 52.5L37.2 48L42.5 50L38 43.5L37.2 36L42 33L47.2 33.8L54.2 34.8L52.2 31.8L58.2 29.8L54.2 27.8L58.2 23.8H53.2L56.5 18.8L51.4 20.6L52.5 15.5L46 21.5H42L34.7 26.5L35.2 22.8L37.5 22.4L35.7 19.6C35.7 17.6 34.2 16 32 16Z" fill="#000"/></g>'],
    ge: ['Georgia', () => '<rect width="60" height="40" fill="#fff"/><rect x="26" y="0" width="8" height="40" fill="#ff0000"/><rect x="0" y="16" width="60" height="8" fill="#ff0000"/>' + [[13, 8], [47, 8], [13, 32], [47, 32]].map(([x, y]) => '<rect x="' + (x - 1) + '" y="' + (y - 4) + '" width="2" height="8" fill="#ff0000"/><rect x="' + (x - 4) + '" y="' + (y - 1) + '" width="8" height="2" fill="#ff0000"/>').join('')],
    am: ['Armenia', () => wodFlagStripes('h', ['#d90012', '#0033a0', '#f2a800'])],
    az: ['Azerbaijan', () => wodFlagStripes('h', ['#0092bc', '#e4002b', '#00af66']) + wodFlagCrescent(28, 20, 5, '#fff', '#e4002b', 1.4) + wodFlagStar(34.5, 20, 2.6, '#fff', -90)],
    md: ['Moldova', () => wodFlagStripes('v', ['#003da5', '#ffd200', '#cc092f']) + '<path d="M25 13H35V22Q35 27 30 29Q25 27 25 22Z" fill="#8c5a2b"/><path d="M25 21H35" stroke="#cc092f" stroke-width="2"/>'],
    mt: ['Malta', () => wodFlagStripes('v', ['#fff', '#cf142b']) + '<rect x="4" y="4" width="8" height="8" fill="#ccc" stroke="#cf142b" stroke-width=".7"/><path d="M8 5V11M5 8H11" stroke="#999" stroke-width="1.6"/>'],
    mc: ['Monaco', () => wodFlagStripes('h', ['#ce1126', '#fff'])],
    eu: ['European Union', () => { let s = '<rect width="60" height="40" fill="#003399"/>'; for(let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; s += wodFlagStar(30 + Math.cos(a) * 11, 20 + Math.sin(a) * 11, 2, '#ffcc00'); } return s; }],
    ve: ['Venezuela', () => { let s = wodFlagStripes('h', ['#ffcc00', '#00247d', '#cf142b']); for(let i = 0; i < 8; i++) { const a = Math.PI * (1.15 + i * 0.7 / 7); s += wodFlagStar(30 + Math.cos(a) * 9, 22 + Math.sin(a) * 9, 1.3, '#fff'); } return s; }],
    ec: ['Ecuador', () => wodFlagStripes('h', ['#ffd100', '#0072ce', '#ef3340'], [2, 1, 1]) + '<ellipse cx="30" cy="20" rx="4.5" ry="5.5" fill="#6fb7e3" stroke="#8c5a2b" stroke-width="1"/>'],
    bo: ['Bolivia', () => wodFlagStripes('h', ['#d52b1e', '#f9e300', '#007934'])],
    py: ['Paraguay', () => wodFlagStripes('h', ['#d52b1e', '#fff', '#0038a8']) + '<circle cx="30" cy="20" r="4" fill="none" stroke="#0038a8" stroke-width="1"/>' + wodFlagStar(30, 20, 2, '#ffd100')],
    uy: ['Uruguay', () => { let s = ''; for(let i = 0; i < 9; i++) s += '<rect x="0" y="' + (i * 40 / 9).toFixed(2) + '" width="60" height="' + (40 / 9 + 0.05).toFixed(2) + '" fill="' + (i % 2 ? '#0038a8' : '#fff') + '"/>'; return s + '<rect width="22.2" height="22.2" fill="#fff"/>' + wodFlagSun(11.1, 11.1, 4, '#fcd116', 12); }],
    cu: ['Cuba', () => wodFlagStripes('h', ['#002a8f', '#fff', '#002a8f', '#fff', '#002a8f']) + '<polygon points="0,0 30,20 0,40" fill="#cf142b"/>' + wodFlagStar(10, 20, 5, '#fff')],
    jm: ['Jamaica', () => '<rect width="60" height="40" fill="#009b3a"/><polygon points="0,0 30,20 0,40" fill="#000"/><polygon points="60,0 30,20 60,40" fill="#000"/><path d="M0,0L60,40M60,0L0,40" stroke="#fed100" stroke-width="5"/>'],
    cr: ['Costa Rica', () => wodFlagStripes('h', ['#002b7f', '#fff', '#ce1126', '#fff', '#002b7f'], [1, 1, 2, 1, 1])],
    pa: ['Panama', () => '<rect width="60" height="40" fill="#fff"/><rect x="30" y="0" width="30" height="20" fill="#da121a"/><rect x="0" y="20" width="30" height="20" fill="#072357"/>' + wodFlagStar(15, 10, 4, '#072357') + wodFlagStar(45, 30, 4, '#da121a')],
    gt: ['Guatemala', () => wodFlagStripes('v', ['#4997d0', '#fff', '#4997d0']) + '<circle cx="30" cy="20" r="5" fill="none" stroke="#4b8a3e" stroke-width="1.6"/><circle cx="30" cy="20" r="2" fill="#4997d0"/>'],
    do: ['Dominican Republic', () => '<rect width="60" height="40" fill="#fff"/><rect width="26" height="16" fill="#002d62"/><rect x="34" y="24" width="26" height="16" fill="#002d62"/><rect x="34" width="26" height="16" fill="#ce1126"/><rect y="24" width="26" height="16" fill="#ce1126"/><circle cx="30" cy="20" r="2.5" fill="#007a3d"/>'],
    pr: ['Puerto Rico', () => wodFlagStripes('h', ['#ed0000', '#fff', '#ed0000', '#fff', '#ed0000']) + '<polygon points="0,0 30,20 0,40" fill="#0050f0"/>' + wodFlagStar(10, 20, 5, '#fff')],
    pk: ['Pakistan', () => '<rect width="60" height="40" fill="#01411c"/><rect width="15" height="40" fill="#fff"/>' + wodFlagCrescent(37, 21, 9, '#fff', '#01411c', 3) + wodFlagStar(42, 15, 3, '#fff', -60)],
    my: ['Malaysia', () => { let s = ''; for(let i = 0; i < 14; i++) s += '<rect x="0" y="' + (i * 40 / 14).toFixed(2) + '" width="60" height="' + (40 / 14 + 0.05).toFixed(2) + '" fill="' + (i % 2 ? '#fff' : '#cc0001') + '"/>'; return s + '<rect width="30" height="22.86" fill="#010066"/>' + wodFlagCrescent(12, 11.4, 7, '#fc0', '#010066', 2.4) + wodFlagStar(22, 11.4, 4.2, '#fc0'); }],
    sg: ['Singapore', () => wodFlagStripes('h', ['#ef3340', '#fff']) + wodFlagCrescent(12, 10, 6, '#fff', '#ef3340', 2.2) + [[17, 6], [20.5, 9], [19, 13.2], [15, 13.2], [13.5, 9]].map(([x, y]) => wodFlagStar(x + 1.5, y, 1.3, '#fff')).join('')],
    tw: ['Taiwan', () => '<rect width="60" height="40" fill="#fe0000"/><rect width="30" height="20" fill="#000095"/>' + wodFlagSun(15, 10, 3.6, '#fff', 12) + '<circle cx="15" cy="10" r="3.6" fill="#fff" stroke="#000095" stroke-width=".7"/>'],
    kz: ['Kazakhstan', () => '<rect width="60" height="40" fill="#00afca"/>' + wodFlagSun(32, 16, 5, '#fec50c', 16) + '<path d="M20 28Q32 22 44 28Q38 26 32 27Q26 26 20 28Z" fill="#fec50c"/><rect x="5" y="2" width="2.5" height="36" fill="#fec50c" opacity=".85"/>'],
    sa: ['Saudi Arabia', () => '<rect width="60" height="40" fill="#006c35"/><path d="M15 14Q18 11 21 14T27 14T33 14T39 14T45 14M17 18Q20 16 23 18T29 18T35 18T41 18" stroke="#fff" stroke-width="1.6" fill="none"/><path d="M16 27H44L46 25.5" stroke="#fff" stroke-width="1.8" fill="none"/><path d="M16 25V29" stroke="#fff" stroke-width="1.5"/>'],
    ae: ['United Arab Emirates', () => wodFlagStripes('h', ['#00732f', '#fff', '#000']) + '<rect width="15" height="40" fill="#ff0000"/>'],
    qa: ['Qatar', () => { let p = 'M0,0 H18'; for(let i = 0; i < 9; i++) { p += ' L24,' + (i * 40 / 9 + 40 / 18).toFixed(2) + ' L18,' + ((i + 1) * 40 / 9).toFixed(2); } return '<rect width="60" height="40" fill="#8a1538"/><path d="' + p + ' H0Z" fill="#fff"/>'; }],
    kw: ['Kuwait', () => wodFlagStripes('h', ['#007a3d', '#fff', '#ce1126']) + '<polygon points="0,0 15,13.3 15,26.7 0,40" fill="#000"/>'],
    jo: ['Jordan', () => wodFlagStripes('h', ['#000', '#fff', '#007a3d']) + '<polygon points="0,0 28,20 0,40" fill="#ce1126"/>' + wodFlagStar(9, 20, 3.2, '#fff')],
    lb: ['Lebanon', () => wodFlagStripes('h', ['#ed1c24', '#fff', '#ed1c24'], [1, 2, 1]) + '<path d="M30 11L37 23H33L38 28H22L27 23H23Z" fill="#00a651"/><rect x="29" y="27" width="2" height="3" fill="#00a651"/>'],
    ir: ['Iran', () => wodFlagStripes('h', ['#239f40', '#fff', '#da0000']) + '<path d="M27 16Q30 21 27 24.5M33 16Q30 21 33 24.5M30 15V25" stroke="#da0000" stroke-width="1.5" fill="none"/>'],
    la: ['Laos', () => wodFlagStripes('h', ['#ce1126', '#002868', '#ce1126'], [1, 2, 1]) + '<circle cx="30" cy="20" r="8" fill="#fff"/>'],
    mm: ['Myanmar', () => wodFlagStripes('h', ['#fecb00', '#34b233', '#ea2839']) + wodFlagStar(30, 21.5, 13, '#fff')],
    gh: ['Ghana', () => wodFlagStripes('h', ['#ce1126', '#fcd116', '#006b3f']) + wodFlagStar(30, 20.5, 6.5, '#000')],
    ke: ['Kenya', () => wodFlagStripes('h', ['#000', '#fff', '#bb0000', '#fff', '#006600'], [6, 1, 6, 1, 6]) + '<ellipse cx="30" cy="20" rx="5" ry="11" fill="#bb0000" stroke="#000" stroke-width="1.6"/><path d="M30 10V30" stroke="#fff" stroke-width="1.2"/>'],
    et: ['Ethiopia', () => wodFlagStripes('h', ['#078930', '#fcdd09', '#da121a']) + '<circle cx="30" cy="20" r="8" fill="#0f47af"/><polygon points="30,13.5 31.6,18.4 36.6,18.4 32.6,21.4 34.1,26.4 30,23.3 25.9,26.4 27.4,21.4 23.4,18.4 28.4,18.4" fill="none" stroke="#fcdd09" stroke-width="1.2"/>'],
    ma: ['Morocco', () => '<rect width="60" height="40" fill="#c1272d"/><polygon points="30,10.5 32.8,18.5 41.2,18.5 34.4,23.6 37,31.6 30,26.6 23,31.6 25.6,23.6 18.8,18.5 27.2,18.5" fill="none" stroke="#006233" stroke-width="1.8"/>'],
    dz: ['Algeria', () => wodFlagStripes('v', ['#006233', '#fff']) + wodFlagCrescent(30, 20, 8, '#d21034', '#fff', 2.4) + wodFlagStar(33.5, 20, 3.6, '#d21034', -90)],
    tn: ['Tunisia', () => '<rect width="60" height="40" fill="#e70013"/><circle cx="30" cy="20" r="10" fill="#fff"/>' + wodFlagCrescent(29, 20, 7, '#e70013', '#fff', 2) + wodFlagStar(32, 20, 3.4, '#e70013', -90)],
    sn: ['Senegal', () => wodFlagStripes('v', ['#00853f', '#fdef42', '#e31b23']) + wodFlagStar(30, 20.5, 5, '#00853f')],
    cm: ['Cameroon', () => wodFlagStripes('v', ['#007a5e', '#ce1126', '#fcd116']) + wodFlagStar(30, 20.5, 5, '#fcd116')],
    ci: ['Côte d\'Ivoire', () => wodFlagStripes('v', ['#f77f00', '#fff', '#009e60'])],
    ml: ['Mali', () => wodFlagStripes('v', ['#14b53a', '#fcd116', '#ce1126'])],
    td: ['Chad', () => wodFlagStripes('v', ['#002664', '#fecb00', '#c60c30'])],
    bw: ['Botswana', () => wodFlagStripes('h', ['#75aadb', '#fff', '#000', '#fff', '#75aadb'], [9, 1, 4, 1, 9])],
    so: ['Somalia', () => '<rect width="60" height="40" fill="#4189dd"/>' + wodFlagStar(30, 21, 9, '#fff')],
    tz: ['Tanzania', () => '<rect width="60" height="40" fill="#1eb53a"/><polygon points="60,0 60,40 0,40" fill="#00a3dd"/><path d="M0,40L60,0" stroke="#fcd116" stroke-width="14"/><path d="M0,40L60,0" stroke="#000" stroke-width="9"/>'],
    fj: ['Fiji', () => '<rect width="60" height="40" fill="#68bfe5"/>' + wodFlagCanton(wodFlagJack()) + '<path d="M38 10H52V22Q52 30 45 33Q38 30 38 22Z" fill="#fff" stroke="#ce1126" stroke-width=".8"/><rect x="38" y="10" width="14" height="4.5" fill="#ce1126"/>'],
    ad: ["Andorra", () => wodFlagStripes('v', ["#10069f","#fedf00","#d50032"], [8,9,8]) + '<path d="M25.5 14H34.5V22Q34.5 27 30 29Q25.5 27 25.5 22Z" fill="#c7b37f" stroke="#7a5a1e" stroke-width=".8"/><path d="M30 14V29M25.5 21H34.5" stroke="#d50032" stroke-width="1"/>'],
    by: ["Belarus", () => wodFlagStripes('h', ["#c8313e","#4aa657"], [2,1]) + '<rect width="7" height="40" fill="#fff"/>' + [3, 9, 15, 21, 27, 33].map(y => '<polygon points="3.5,' + (y - 2.5) + ' 6,' + y + ' 3.5,' + (y + 2.5) + ' 1,' + y + '" fill="#c8313e"/>').join('')],
    ba: ["Bosnia and Herzegovina", () => '<rect width="60" height="40" fill="#002395"/><polygon points="16,0 44,0 44,40" fill="#fecb00"/>' + [0, 1, 2, 3, 4, 5, 6, 7].map(i => wodFlagStar(12 + i * 4.3, 1.5 + i * 5.3, 2, '#fff')).join('')],
    cy: ["Cyprus", () => '<rect width="60" height="40" fill="#fff"/><path d="M14 17Q22 11 33 13Q41 12 47 9L44 14Q38 18 31 20Q22 21 17 22Z" fill="#d57800"/><path d="M20 30Q30 35 40 30" stroke="#4e5b31" stroke-width="2" fill="none"/>'],
    li: ["Liechtenstein", () => wodFlagStripes('h', ["#002b7f","#ce1126"]) + '<path d="M9 13L10 7L13 10L15 5L17 10L20 7L21 13Z" fill="#ffd83d"/><circle cx="15" cy="4.5" r="1" fill="#ffd83d"/>'],
    me: ["Montenegro", () => '<rect width="60" height="40" fill="#c4a000"/><rect x="2" y="2" width="56" height="36" fill="#c40308"/><g transform="translate(14.3 4) scale(.5)"><path d="M32 16C29.8 16 28.3 17.6 28.3 19.6L26.5 22.4L28.8 22.8L29.3 26.5L22 21.5H18L11.5 15.5L12.6 20.6L7.5 18.8L10.8 23.8H5.8L9.8 27.8L5.8 29.8L11.8 31.8L9.8 34.8L16.8 33.8L22 33L26.8 36L26 43.5L21.5 50L26.8 48L29 52.5L32 49L35 52.5L37.2 48L42.5 50L38 43.5L37.2 36L42 33L47.2 33.8L54.2 34.8L52.2 31.8L58.2 29.8L54.2 27.8L58.2 23.8H53.2L56.5 18.8L51.4 20.6L52.5 15.5L46 21.5H42L34.7 26.5L35.2 22.8L37.5 22.4L35.7 19.6C35.7 17.6 34.2 16 32 16Z" fill="#d4af3a"/></g>'],
    mk: ["North Macedonia", () => '<rect width="60" height="40" fill="#d20000"/><g fill="#ffe600"><polygon points="0,0 9,0 30,20 0,6"/><polygon points="60,0 51,0 30,20 60,6"/><polygon points="0,40 9,40 30,20 0,34"/><polygon points="60,40 51,40 30,20 60,34"/><polygon points="27,0 33,0 30,20"/><polygon points="27,40 33,40 30,20"/><polygon points="0,17 0,23 30,20"/><polygon points="60,17 60,23 30,20"/></g><circle cx="30" cy="20" r="6" fill="#ffe600" stroke="#d20000" stroke-width="1.4"/>'],
    sm: ["San Marino", () => wodFlagStripes('h', ["#fff","#5eb6e4"]) + '<path d="M26.5 13H33.5V21Q33.5 25 30 27Q26.5 25 26.5 21Z" fill="#5eb6e4" stroke="#c7a24a" stroke-width="1"/><path d="M28 19L29 15.5L30 18L31 15.5L32 19Z" fill="#fff"/>'],
    va: ["Vatican City", () => wodFlagStripes('v', ["#ffe000","#fff"]) + '<path d="M38 26L50 14M50 26L38 14" stroke="#c7a24a" stroke-width="2"/><path d="M38 26L50 14" stroke="#b5b5b5" stroke-width="1.2"/><path d="M41.5 10L44 7.5L46.5 10L44 12Z" fill="#c7a24a"/>'],
    xk: ["Kosovo", () => '<rect width="60" height="40" fill="#244aa5"/><path d="M24 17L30 14L37 16L39 21L35 27L28 28L23 23Z" fill="#d0a650"/>' + [0, 1, 2, 3, 4, 5].map(i => wodFlagStar(18.5 + i * 4.6, 10 - Math.sin((i + .5) / 6 * Math.PI) * 3, 1.7, '#fff')).join('')],
    ag: ["Antigua and Barbuda", () => '<rect width="60" height="40" fill="#ce1126"/><polygon points="0,0 60,0 49.5,14 10.5,14" fill="#000"/>' + wodFlagSun(30, 14, 5, '#fcd116', 12) + '<polygon points="10.5,14 49.5,14 44.25,21 15.75,21" fill="#0072c6"/><polygon points="15.75,21 44.25,21 30,40" fill="#fff"/>'],
    bs: ["Bahamas", () => wodFlagStripes('h', ["#00abc9","#fae042","#00abc9"]) + wodFlagHoist('#000', 26)],
    bb: ["Barbados", () => wodFlagStripes('v', ["#00267f","#ffc726","#00267f"]) + '<path d="M30 30V12M24 13Q24 21 30 21Q36 21 36 13M30 9L28.5 12H31.5ZM24 10L22.8 13H25.2ZM36 10L34.8 13H37.2Z" stroke="#000" stroke-width="1.6" fill="#000"/>'],
    bz: ["Belize", () => '<rect width="60" height="40" fill="#003f87"/><rect width="60" height="4" fill="#ce1126"/><rect y="36" width="60" height="4" fill="#ce1126"/><circle cx="30" cy="20" r="11" fill="#fff"/><circle cx="30" cy="20" r="9" fill="none" stroke="#4e8c3a" stroke-width="1.6" stroke-dasharray="2 1"/><path d="M27 18H33V22Q33 25 30 26Q27 25 27 22Z" fill="#00599f"/>'],
    dm: ["Dominica", () => '<rect width="60" height="40" fill="#006b3f"/><rect x="24" y="0" width="4" height="40" fill="#fcd116"/><rect x="28" y="0" width="4" height="40" fill="#000"/><rect x="32" y="0" width="4" height="40" fill="#fff"/><rect x="0" y="14" width="60" height="4" fill="#fcd116"/><rect x="0" y="18" width="60" height="4" fill="#000"/><rect x="0" y="22" width="60" height="4" fill="#fff"/><circle cx="30" cy="20" r="9" fill="#d41c30"/>' + [...Array(10)].map((_, i) => wodFlagStar(30 + Math.cos(i * Math.PI / 5) * 6.8, 20 + Math.sin(i * Math.PI / 5) * 6.8, 1.1, '#4aa657')).join('') + '<circle cx="30" cy="20" r="2.6" fill="#7a3f99"/>'],
    sv: ["El Salvador", () => wodFlagStripes('h', ["#0047ab","#fff","#0047ab"]) + '<circle cx="30" cy="20" r="4" fill="none" stroke="#3a7d44" stroke-width="1.2"/><polygon points="30,17 33,22 27,22" fill="#ffd200"/>'],
    gd: ["Grenada", () => '<rect width="60" height="40" fill="#ce1126"/><polygon points="5,5 55,5 30,20" fill="#fcd116"/><polygon points="5,35 55,35 30,20" fill="#fcd116"/><polygon points="5,5 5,35 30,20" fill="#007a5e"/><polygon points="55,5 55,35 30,20" fill="#007a5e"/><circle cx="30" cy="20" r="5" fill="#ce1126"/>' + wodFlagStar(30, 20, 3.5, '#fcd116') + [15, 30, 45].map(x => wodFlagStar(x, 2.5, 1.6, '#fcd116') + wodFlagStar(x, 37.5, 1.6, '#fcd116')).join('')],
    gy: ["Guyana", () => '<rect width="60" height="40" fill="#009e49"/><polygon points="0,0 60,20 0,40" fill="#fff"/><polygon points="0,2 55,20 0,38" fill="#fcd116"/><polygon points="0,0 30,20 0,40" fill="#000"/><polygon points="0,2.5 27,20 0,37.5" fill="#ce1126"/>'],
    ht: ["Haiti", () => wodFlagStripes('h', ["#00209f","#d21034"]) + '<rect x="22" y="13" width="16" height="14" fill="#fff"/><path d="M26 24H34L30 16Z" fill="#016a16"/>'],
    hn: ["Honduras", () => wodFlagStripes('h', ["#0073cf","#fff","#0073cf"]) + [[30, 20], [24, 17], [24, 23], [36, 17], [36, 23]].map(([x, y]) => wodFlagStar(x, y, 2, '#0073cf')).join('')],
    ni: ["Nicaragua", () => wodFlagStripes('h', ["#0067c6","#fff","#0067c6"]) + '<polygon points="30,16 34.5,23.5 25.5,23.5" fill="none" stroke="#c7a24a" stroke-width="1"/><circle cx="30" cy="20.5" r="5.5" fill="none" stroke="#c7a24a" stroke-width=".6"/>'],
    kn: ["Saint Kitts and Nevis", () => '<polygon points="0,0 60,0 0,40" fill="#009e49"/><polygon points="60,0 60,40 0,40" fill="#ce1126"/>' + wodFlagDiag('#fcd116', 16) + wodFlagDiag('#000', 11) + wodFlagStar(21, 26, 3.5, '#fff') + wodFlagStar(39, 14, 3.5, '#fff')],
    lc: ["Saint Lucia", () => '<rect width="60" height="40" fill="#65cfff"/><polygon points="30,5 41,34 19,34" fill="#fff"/><polygon points="30,8 39,34 21,34" fill="#000"/><polygon points="30,20 41,34 19,34" fill="#fcd116"/>'],
    vc: ["Saint Vincent and the Grenadines", () => wodFlagStripes('v', ["#002674","#fcd116","#009e60"], [1,2,1]) + [[25, 14], [35, 14], [30, 26]].map(([x, y]) => '<polygon points="' + x + ',' + (y - 5) + ' ' + (x + 3.4) + ',' + y + ' ' + x + ',' + (y + 5) + ' ' + (x - 3.4) + ',' + y + '" fill="#009e60"/>').join('')],
    sr: ["Suriname", () => wodFlagStripes('h', ["#377e3f","#fff","#b40a2d","#fff","#377e3f"], [2,1,4,1,2]) + wodFlagStar(30, 20.5, 6, '#ecc81d')],
    tt: ["Trinidad and Tobago", () => '<rect width="60" height="40" fill="#da1a35"/>' + wodFlagDiag('#fff', 15, true) + wodFlagDiag('#000', 10, true)],
    af: ["Afghanistan", () => wodFlagStripes('v', ["#000","#d32011","#007a36"]) + '<circle cx="30" cy="20" r="6.5" fill="none" stroke="#fff" stroke-width="1.2"/><path d="M27 23V18.5L30 16L33 18.5V23Z" fill="#fff"/>'],
    bh: ["Bahrain", () => { let p = 'M0,0H14'; for(let i = 0; i < 5; i++) p += ' L22,' + (i * 8 + 4) + ' L14,' + ((i + 1) * 8); return '<rect width="60" height="40" fill="#ce1126"/><path d="' + p + ' H0Z" fill="#fff"/>'; }],
    bt: ["Bhutan", () => '<polygon points="0,0 60,0 0,40" fill="#ffd520"/><polygon points="60,0 60,40 0,40" fill="#ff4e12"/><path d="M14 30Q20 22 28 22Q34 22 38 17Q42 12 48 11" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M14 30Q20 22 28 22Q34 22 38 17Q42 12 48 11" stroke="#d9d9d9" stroke-width="1" fill="none" stroke-dasharray="2 2"/>'],
    bn: ["Brunei", () => '<rect width="60" height="40" fill="#f7e017"/><path d="M0,8L60,26" stroke="#fff" stroke-width="7"/><path d="M0,15L60,33" stroke="#000" stroke-width="6"/><path d="M24 26Q30 32 36 26M30 14V28M26 16H34" stroke="#cf1126" stroke-width="2" fill="none"/>'],
    kh: ["Cambodia", () => wodFlagStripes('h', ["#032ea1","#e00025","#032ea1"], [1,2,1]) + '<path d="M18 28H42V26H40V22H38V19H36V22H34V17H32V14L30 11L28 14V17H26V22H24V19H22V22H20V26H18Z" fill="#fff"/>'],
    iq: ["Iraq", () => wodFlagStripes('h', ["#ce1126","#fff","#000"]) + '<path d="M21 22Q23 18 25 22T29 22M31 18V22H35M37 18V22Q39 22 39 20" stroke="#007a3d" stroke-width="1.4" fill="none"/>'],
    kg: ["Kyrgyzstan", () => '<rect width="60" height="40" fill="#e8112d"/>' + wodFlagSun(30, 20, 6, '#ffef00', 20) + '<circle cx="30" cy="20" r="5" fill="#e8112d"/><circle cx="30" cy="20" r="4" fill="#ffef00"/><path d="M26.5 18.5Q30 16.5 33.5 18.5M26.2 21.5Q30 19.5 33.8 21.5M28 17V23M32 17V23" stroke="#e8112d" stroke-width=".8" fill="none"/>'],
    mv: ["Maldives", () => '<rect width="60" height="40" fill="#d21034"/><rect x="10" y="7" width="40" height="26" fill="#007e3a"/>' + wodFlagCrescent(31, 20, 7, '#fff', '#007e3a', 2.6)],
    mn: ["Mongolia", () => wodFlagStripes('v', ["#c4272f","#015197","#c4272f"]) + '<g fill="#f9cf02"><circle cx="10" cy="12" r="2"/><path d="M10 6L11 9.5H9Z"/><rect x="7" y="16" width="6" height="1.5"/><polygon points="10,18.5 13,20 10,21.5 7,20"/><rect x="7" y="23" width="6" height="1.5"/><rect x="7" y="27" width="6" height="1.5"/><rect x="5" y="15" width="1.4" height="14"/><rect x="13.6" y="15" width="1.4" height="14"/></g>'],
    np: ["Nepal", () => '<path d="M14 2L42 21H22L42 38H14Z" fill="#dc143c" stroke="#003893" stroke-width="2" stroke-linejoin="round"/><circle cx="21" cy="15" r="3" fill="#fff"/><path d="M17.5 13Q21 16.5 24.5 13" fill="none" stroke="#dc143c" stroke-width="1"/>' + wodFlagSun(21, 29, 2.6, '#fff', 10)],
    kp: ["North Korea", () => wodFlagStripes('h', ["#024fa2","#fff","#ed1c27","#fff","#024fa2"], [6,1,15,1,6]) + '<circle cx="21" cy="20" r="6.5" fill="#fff"/>' + wodFlagStar(21, 20.5, 6, '#ed1c27')],
    om: ["Oman", () => wodFlagStripes('h', ["#fff","#db161b","#008000"]) + '<rect width="16" height="40" fill="#db161b"/><path d="M4 5L12 11M12 5L4 11M8 3V12" stroke="#fff" stroke-width="1.3"/>'],
    ps: ["Palestine", () => wodFlagStripes('h', ["#000","#fff","#149954"]) + wodFlagHoist('#e4312b', 22)],
    lk: ["Sri Lanka", () => '<rect width="60" height="40" fill="#ffbe29"/><rect x="2.5" y="2.5" width="6.5" height="35" fill="#00534e"/><rect x="9" y="2.5" width="6.5" height="35" fill="#eb7400"/><rect x="18" y="2.5" width="39.5" height="35" fill="#8d153a"/><path d="M28 30V22Q28 16 34 15Q40 14 42 18L46 17L44 21Q46 25 44 30Z" fill="#ffbe29"/><path d="M44 15L50 9" stroke="#ffbe29" stroke-width="1.6"/>'],
    sy: ["Syria", () => wodFlagStripes('h', ["#ce1126","#fff","#000"]) + wodFlagStar(23, 20, 3.4, '#007a3d') + wodFlagStar(37, 20, 3.4, '#007a3d')],
    tj: ["Tajikistan", () => wodFlagStripes('h', ["#cc0000","#fff","#006600"], [2,3,2]) + '<path d="M26 22L27 18.5L28.5 20L30 17.5L31.5 20L33 18.5L34 22Z" fill="#f8c300"/>' + [0, 1, 2, 3, 4, 5, 6].map(i => wodFlagStar(30 + Math.cos(Math.PI * (1.15 + i * .7 / 6)) * 7.5, 19.5 + Math.sin(Math.PI * (1.15 + i * .7 / 6)) * 7.5, 1, '#f8c300')).join('')],
    tl: ["Timor-Leste", () => '<rect width="60" height="40" fill="#dc241f"/>' + wodFlagHoist('#ffc726', 30) + wodFlagHoist('#000', 20) + wodFlagStar(7, 20, 4, '#fff', -60)],
    tm: ["Turkmenistan", () => '<rect width="60" height="40" fill="#00843d"/><rect x="7" y="0" width="10" height="40" fill="#d22630"/>' + [5, 13, 21, 29, 37].map(y => '<polygon points="12,' + (y - 3) + ' 15.5,' + y + ' 12,' + (y + 3) + ' 8.5,' + y + '" fill="#ffc72c" opacity=".85"/>').join('') + wodFlagCrescent(26, 10, 4.5, '#fff', '#00843d', 1.8) + [[31, 6], [34, 9], [33, 13], [30, 14], [31, 10]].map(([x, y]) => wodFlagStar(x + 1, y, 1, '#fff')).join('')],
    uz: ["Uzbekistan", () => '<rect width="60" height="13.3" fill="#0099b5"/><rect y="13.3" width="60" height="13.4" fill="#fff"/><rect y="26.7" width="60" height="13.3" fill="#1eb53a"/><rect y="13.3" width="60" height="1" fill="#ce1126"/><rect y="25.7" width="60" height="1" fill="#ce1126"/>' + wodFlagCrescent(8, 6.6, 4.5, '#fff', '#0099b5', 1.6) + [...Array(12)].map((_, i) => wodFlagStar(15.5 + (i % 4) * 3.4 + (i < 4 ? 3.4 * (1 - Math.min(1, i)) : 0), 3 + Math.floor(i / 4) * 3.4, .9, '#fff')).join('')],
    ye: ["Yemen", () => wodFlagStripes('h', ["#ce1126","#fff","#000"])],
    ao: ["Angola", () => wodFlagStripes('h', ["#cc092f","#000"]) + '<path d="M24 26A8 8 0 1 1 36 16" stroke="#ffcb00" stroke-width="2.4" fill="none"/><path d="M26 25L35 17" stroke="#ffcb00" stroke-width="2.2"/>' + wodFlagStar(30, 14, 2.4, '#ffcb00')],
    bj: ["Benin", () => wodFlagStripes('h', ["#fcd116","#e8112d"]) + '<rect width="24" height="40" fill="#008751"/>'],
    bf: ["Burkina Faso", () => wodFlagStripes('h', ["#ef2b2d","#009e49"]) + wodFlagStar(30, 20.5, 6, '#fcd116')],
    bi: ["Burundi", () => '<polygon points="0,0 60,0 30,20" fill="#ce1126"/><polygon points="0,40 60,40 30,20" fill="#ce1126"/><polygon points="0,0 0,40 30,20" fill="#1eb53a"/><polygon points="60,0 60,40 30,20" fill="#1eb53a"/><path d="M0,0L60,40M60,0L0,40" stroke="#fff" stroke-width="5"/><circle cx="30" cy="20" r="9" fill="#fff"/>' + [[30, 16], [26.5, 22], [33.5, 22]].map(([x, y]) => wodFlagStar(x, y, 2.4, '#ce1126')).join('')],
    cv: ["Cabo Verde", () => '<rect width="60" height="40" fill="#003893"/><rect y="21" width="60" height="2.6" fill="#fff"/><rect y="23.6" width="60" height="2.6" fill="#cf2027"/><rect y="26.2" width="60" height="2.6" fill="#fff"/>' + [...Array(10)].map((_, i) => wodFlagStar(22 + Math.cos(i * Math.PI / 5) * 8, 25 + Math.sin(i * Math.PI / 5) * 8, 1.4, '#f7d116')).join('')],
    cf: ["Central African Republic", () => wodFlagStripes('h', ["#003082","#fff","#289728","#ffce00"]) + '<rect x="26" width="8" height="40" fill="#d21034"/>' + wodFlagStar(10, 5, 3.2, '#ffce00')],
    km: ["Comoros", () => wodFlagStripes('h', ["#ffd100","#fff","#ce1126","#3a75c4"]) + wodFlagHoist('#3d8e33', 22) + wodFlagCrescent(7, 20, 5.5, '#fff', '#3d8e33', 2) + [15, 18, 22, 25].map((y, i) => wodFlagStar(10.5, y, 1, '#fff')).join('')],
    cd: ["DR Congo", () => '<rect width="60" height="40" fill="#007fff"/>' + wodFlagDiag('#f7d618', 13) + wodFlagDiag('#ce1021', 9) + wodFlagStar(10, 8, 5, '#f7d618')],
    cg: ["Congo", () => '<polygon points="0,0 40,0 0,40" fill="#009543"/><polygon points="60,0 60,40 20,40" fill="#dc241f"/><polygon points="40,0 60,0 20,40 0,40" fill="#fbde4a"/>'],
    dj: ["Djibouti", () => wodFlagStripes('h', ["#6ab2e7","#12ad2b"]) + '<polygon points="0,0 30,20 0,40" fill="#fff"/>' + wodFlagStar(10, 20, 3.8, '#d7141a')],
    gq: ["Equatorial Guinea", () => wodFlagStripes('h', ["#3e9a00","#fff","#e32118"]) + wodFlagHoist('#0073ce', 14) + '<path d="M28 18H32V23Q32 25 30 25.5Q28 25 28 23Z" fill="#c4c4c4"/><path d="M30 15.5V20" stroke="#3e9a00" stroke-width="2"/>'],
    er: ["Eritrea", () => '<polygon points="0,0 60,0 60,20" fill="#12ad2b"/><polygon points="0,40 60,40 60,20" fill="#4189dd"/><polygon points="0,0 60,20 0,40" fill="#ea0437"/><circle cx="14" cy="20" r="6" fill="none" stroke="#ffc726" stroke-width="1.6"/><path d="M14 26V14" stroke="#ffc726" stroke-width="1.2"/>'],
    sz: ["Eswatini", () => wodFlagStripes('h', ["#3e5eb9","#ffd900","#b10c0c","#ffd900","#3e5eb9"], [3,1,8,1,3]) + '<path d="M16 20H44" stroke="#c4a56c" stroke-width="1.2"/><ellipse cx="30" cy="20" rx="10" ry="5.5" fill="#fff"/><path d="M30 14.5A10 5.5 0 0 1 30 25.5A10 5.5 0 0 1 20 20A10 5.5 0 0 1 30 14.5Z" fill="#000"/>'],
    ga: ["Gabon", () => wodFlagStripes('h', ["#009e60","#fcd116","#3a75c4"])],
    gm: ["Gambia", () => wodFlagStripes('h', ["#ce1126","#fff","#0c1c8c","#fff","#3a7728"], [6,1,4,1,6])],
    gn: ["Guinea", () => wodFlagStripes('v', ["#ce1126","#fcd116","#009460"])],
    gw: ["Guinea-Bissau", () => wodFlagStripes('h', ["#fcd116","#009e49"]) + '<rect width="20" height="40" fill="#ce1126"/>' + wodFlagStar(10, 20.5, 5, '#000')],
    ls: ["Lesotho", () => wodFlagStripes('h', ["#00209f","#fff","#009543"], [3,4,3]) + '<path d="M24 23Q30 19 36 23L33 22.5L30 14.5L27 22.5Z" fill="#000"/>'],
    lr: ["Liberia", () => { let s = ''; for(let i = 0; i < 11; i++) s += '<rect x="0" y="' + (i * 40 / 11).toFixed(2) + '" width="60" height="' + (40 / 11 + 0.05).toFixed(2) + '" fill="' + (i % 2 ? '#fff' : '#bf0a30') + '"/>'; return s + '<rect width="18.2" height="18.2" fill="#002868"/>' + wodFlagStar(9.1, 9.6, 5.5, '#fff'); }],
    ly: ["Libya", () => wodFlagStripes('h', ["#e70013","#000","#239e46"], [1,2,1]) + wodFlagCrescent(28, 20, 5, '#fff', '#000', 1.6) + wodFlagStar(33.5, 20, 2.4, '#fff', -90)],
    mg: ["Madagascar", () => wodFlagStripes('h', ["#fc3d32","#007e3a"]) + '<rect width="20" height="40" fill="#fff"/>'],
    mw: ["Malawi", () => wodFlagStripes('h', ["#000","#ce1126","#339e35"]) + '<path d="M21 13.3A9 9 0 0 1 39 13.3Z" fill="#ce1126"/>' + [...Array(13)].map((_, i) => { const a = Math.PI * (1 + i / 12); return '<path d="M' + (30 + Math.cos(a) * 9.5).toFixed(1) + ' ' + (13.3 + Math.sin(a) * 9.5).toFixed(1) + 'L' + (30 + Math.cos(a) * 12.5).toFixed(1) + ' ' + (13.3 + Math.sin(a) * 12.5).toFixed(1) + '" stroke="#ce1126" stroke-width="1.2"/>'; }).join('')],
    mr: ["Mauritania", () => '<rect width="60" height="40" fill="#00a95c"/><rect width="60" height="6" fill="#d01c1f"/><rect y="34" width="60" height="6" fill="#d01c1f"/><path d="M21 17A9 9 0 0 0 39 17A9 7 0 0 1 21 17Z" fill="#ffd700"/>' + wodFlagStar(30, 15.5, 3.4, '#ffd700')],
    mu: ["Mauritius", () => wodFlagStripes('h', ["#ea2839","#1a206d","#ffd500","#00a551"])],
    mz: ["Mozambique", () => wodFlagStripes('h', ["#007168","#fff","#000","#fff","#fce100"], [6,0.8,6,0.8,6]) + wodFlagHoist('#d21034', 24) + wodFlagStar(9, 20.5, 5, '#fce100')],
    na: ["Namibia", () => '<polygon points="0,0 60,0 0,40" fill="#003580"/><polygon points="60,0 60,40 0,40" fill="#009543"/>' + wodFlagDiag('#fff', 14) + wodFlagDiag('#d21034', 10) + wodFlagSun(11, 10, 3, '#ffce00', 12)],
    ne: ["Niger", () => wodFlagStripes('h', ["#e05206","#fff","#0db02b"]) + '<circle cx="30" cy="20" r="4" fill="#e05206"/>'],
    rw: ["Rwanda", () => wodFlagStripes('h', ["#00a1de","#fad201","#20603d"], [2,1,1]) + wodFlagSun(50, 8, 3, '#e5be01', 16)],
    st: ["São Tomé and Príncipe", () => wodFlagStripes('h', ["#12ad2b","#ffce00","#12ad2b"], [2,3,2]) + wodFlagHoist('#d21034', 16) + wodFlagStar(30, 20.5, 4.5, '#000') + wodFlagStar(44, 20.5, 4.5, '#000')],
    sc: ["Seychelles", () => '<polygon points="0,40 0,0 20,0" fill="#003f87"/><polygon points="0,40 20,0 40,0" fill="#fcd856"/><polygon points="0,40 40,0 60,0 60,13.3" fill="#d62828"/><polygon points="0,40 60,13.3 60,26.7" fill="#fff"/><polygon points="0,40 60,26.7 60,40" fill="#007a3d"/>'],
    sl: ["Sierra Leone", () => wodFlagStripes('h', ["#1eb53a","#fff","#0072c6"])],
    ss: ["South Sudan", () => wodFlagStripes('h', ["#000","#fff","#da121a","#fff","#078930"], [6,1,6,1,6]) + wodFlagHoist('#0f47af', 26) + wodFlagStar(8.5, 20, 4.5, '#fcdd09')],
    sd: ["Sudan", () => wodFlagStripes('h', ["#d21034","#fff","#000"]) + wodFlagHoist('#007229', 22)],
    tg: ["Togo", () => wodFlagStripes('h', ["#006a4e","#ffce00","#006a4e","#ffce00","#006a4e"]) + '<rect width="24" height="24" fill="#d21034"/>' + wodFlagStar(12, 12.5, 6.5, '#fff')],
    ug: ["Uganda", () => wodFlagStripes('h', ["#000","#fcdc04","#d90000","#000","#fcdc04","#d90000"]) + '<circle cx="30" cy="20" r="7.5" fill="#fff"/><path d="M27 25L29 17Q30 13 33 14Q31 16 31.5 18L33 25" stroke="#9ca69c" stroke-width="2" fill="none"/><circle cx="31.5" cy="14.5" r="1.4" fill="#d90000"/>'],
    zm: ["Zambia", () => '<rect width="60" height="40" fill="#198a00"/><rect x="40" y="16" width="6.6" height="24" fill="#de2010"/><rect x="46.6" y="16" width="6.7" height="24" fill="#000"/><rect x="53.3" y="16" width="6.7" height="24" fill="#ef7d00"/><path d="M42 10Q47 6 50 9Q53 6 58 10Q53 9 51 12L50 14L49 12Q47 9 42 10Z" fill="#ef7d00"/>'],
    zw: ["Zimbabwe", () => wodFlagStripes('h', ["#006400","#ffd200","#d40000","#000","#d40000","#ffd200","#006400"]) + '<polygon points="0,0 28,20 0,40" fill="#fff" stroke="#000" stroke-width="1"/>' + wodFlagStar(9, 20, 5, '#d40000') + '<path d="M8 16L10 13L11 15L10.5 22L9 24Z" fill="#ffd200"/>'],
    ki: ["Kiribati", () => '<rect width="60" height="40" fill="#fff"/><rect width="60" height="20" fill="#ce1126"/>' + wodFlagSun(30, 20, 6, '#fcd116', 14) + '<rect y="20" width="60" height="20" fill="#003f87"/>' + [24, 29, 34].map(y => '<path d="M0 ' + y + 'Q7.5 ' + (y - 2) + ' 15 ' + y + 'T30 ' + y + 'T45 ' + y + 'T60 ' + y + '" stroke="#fff" stroke-width="2" fill="none"/>').join('') + '<path d="M20 9Q30 3 40 9Q33 7 30 10Q27 7 20 9Z" fill="#fcd116"/>'],
    mh: ["Marshall Islands", () => '<rect width="60" height="40" fill="#003893"/><path d="M0,40L60,4" stroke="#fff" stroke-width="5"/><path d="M0,36L60,0" stroke="#dd7500" stroke-width="5"/>' + [...Array(12)].map((_, i) => { const a = i * Math.PI / 6; return '<polygon points="' + (11 + Math.cos(a) * 7).toFixed(1) + ',' + (11 + Math.sin(a) * 7).toFixed(1) + ' ' + (11 + Math.cos(a + 1.4) * 2).toFixed(1) + ',' + (11 + Math.sin(a + 1.4) * 2).toFixed(1) + ' ' + (11 + Math.cos(a - 1.4) * 2).toFixed(1) + ',' + (11 + Math.sin(a - 1.4) * 2).toFixed(1) + '" fill="#fff"/>'; }).join('')],
    fm: ["Micronesia", () => '<rect width="60" height="40" fill="#75b2dd"/>' + [[30, 10], [20, 20], [40, 20], [30, 30]].map(([x, y]) => wodFlagStar(x, y, 3.5, '#fff')).join('')],
    nr: ["Nauru", () => '<rect width="60" height="40" fill="#002b7f"/><rect y="18.5" width="60" height="3" fill="#ffc61e"/>' + [...Array(12)].map((_, i) => { const a = i * Math.PI / 6; return '<polygon points="' + (16 + Math.cos(a) * 5.5).toFixed(1) + ',' + (29 + Math.sin(a) * 5.5).toFixed(1) + ' ' + (16 + Math.cos(a + 1.3) * 2).toFixed(1) + ',' + (29 + Math.sin(a + 1.3) * 2).toFixed(1) + ' ' + (16 + Math.cos(a - 1.3) * 2).toFixed(1) + ',' + (29 + Math.sin(a - 1.3) * 2).toFixed(1) + '" fill="#fff"/>'; }).join('') + '<circle cx="16" cy="29" r="2.4" fill="#fff"/>'],
    pw: ["Palau", () => '<rect width="60" height="40" fill="#4aadd6"/><circle cx="26" cy="20" r="11" fill="#ffde00"/>'],
    pg: ["Papua New Guinea", () => '<polygon points="0,0 60,0 60,40" fill="#ce1126"/><polygon points="0,0 0,40 60,40" fill="#000"/>' + [[12, 18, 2.6], [8, 25, 2.2], [17, 26, 2.2], [12, 33, 2.6], [14, 28, 1.3]].map(([x, y, r]) => wodFlagStar(x, y, r, '#fff')).join('') + '<path d="M36 14Q42 8 50 10Q46 12 47 15Q52 14 54 18Q48 17 46 19Q42 22 38 20Q40 17 36 14Z" fill="#fcd116"/>'],
    ws: ["Samoa", () => '<rect width="60" height="40" fill="#ce1126"/><rect width="30" height="20" fill="#002b7f"/>' + [[15, 4.5, 2.6], [9.5, 10, 2.6], [21, 9, 2.6], [15, 16, 2.6], [17.5, 12, 1.5]].map(([x, y, r]) => wodFlagStar(x, y, r, '#fff')).join('')],
    sb: ["Solomon Islands", () => '<polygon points="0,0 60,0 0,40" fill="#0051ba"/><polygon points="60,0 60,40 0,40" fill="#215b33"/>' + wodFlagDiag('#fcd116', 3) + [[7, 5], [17, 5], [12, 10], [7, 15], [17, 15]].map(([x, y]) => wodFlagStar(x, y, 2.4, '#fff')).join('')],
    to: ["Tonga", () => '<rect width="60" height="40" fill="#c10000"/><rect width="24" height="20" fill="#fff"/><rect x="10" y="3" width="4" height="14" fill="#c10000"/><rect x="5" y="8" width="14" height="4" fill="#c10000"/>'],
    tv: ["Tuvalu", () => '<rect width="60" height="40" fill="#5b97b1"/>' + wodFlagCanton(wodFlagJack()) + [[37, 6], [44, 10], [52, 7], [40, 17], [48, 20], [55, 15], [42, 27], [50, 31], [56, 25]].map(([x, y]) => wodFlagStar(x, y, 1.8, '#ffce00')).join('')],
    vu: ["Vanuatu", () => wodFlagStripes('h', ["#d21034","#009543"]) + '<polygon points="0,-2 31,18 60,18 60,22 31,22 0,42" fill="#000"/><polygon points="0,1 30,19.2 60,19.2 60,20.8 30,20.8 0,39" fill="#fdce12"/><polygon points="0,4 27,20 0,36" fill="#000"/><circle cx="9" cy="20" r="4" fill="none" stroke="#fdce12" stroke-width="1.3"/>'],
};
const WOD_CLAN_EMBLEM_IDS = [...Object.keys(WOD_CLAN_PRESETS).map(k => 'p:' + k), ...Object.keys(WOD_CLAN_FLAGS).map(k => 'f:' + k)];
const wodClanEmblemCache = new Map();
function wodClanEmblemLabel(id) {
    const [kind, key] = String(id || '').split(':');
    if(kind === 'f' && WOD_CLAN_FLAGS[key]) return WOD_CLAN_FLAGS[key][0] + ' flag';
    if(kind === 'p' && WOD_CLAN_PRESETS[key]) return WOD_CLAN_PRESETS[key][0];
    return 'Clan emblem';
}
function wodClanEmblemSvg(id) {
    id = String(id || '');
    if(wodClanEmblemCache.has(id)) return wodClanEmblemCache.get(id);
    const [kind, key] = id.split(':');
    let svg;
    if(kind === 'f' && WOD_CLAN_FLAGS[key]) {
        svg = '<svg class="wod-clan-emblem wod-clan-emblem--flag" viewBox="0 0 60 40" role="img" aria-label="' + WOD_CLAN_FLAGS[key][0] + ' flag">' + WOD_CLAN_FLAGS[key][1]() + '<rect x=".5" y=".5" width="59" height="39" fill="none" stroke="rgba(0,0,0,.35)"/></svg>';
    } else {
        const p = WOD_CLAN_PRESETS[key] || WOD_CLAN_PRESETS.shield;
        svg = '<svg class="wod-clan-emblem wod-clan-emblem--preset" viewBox="0 0 64 64" role="img" aria-label="' + p[0] + '"><circle cx="32" cy="32" r="30.5" fill="' + p[1] + '" stroke="' + p[2] + '" stroke-opacity=".7" stroke-width="2.5"/><circle cx="32" cy="32" r="26" fill="none" stroke="' + p[2] + '" stroke-opacity=".22" stroke-width="1.2"/>' + p[3].replace(/\{F\}/g, p[2]).replace(/\{B\}/g, p[1]) + '</svg>';
    }
    wodClanEmblemCache.set(id, svg);
    return svg;
}
function wodClanEsc(s) { return typeof wodMpEscapeHtml === 'function' ? wodMpEscapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
/** A clan's emblem and name, for beside a player's name (variant: 'sm' in lists, 'seat' in the lobby). */
function wodClanBadgeHtml(clan, variant) {
    if(!clan || !clan.name) return '';
    return '<span class="wod-clan-badge wod-clan-badge--' + (variant || 'sm') + '" title="Clan: ' + wodClanEsc(clan.name) + '"><span class="wod-clan-badge-mark">' + wodClanEmblemSvg(clan.emblem) + '</span><span class="wod-clan-badge-name">' + wodClanEsc(clan.name) + '</span></span>';
}

// ---------------------------------------------------------------- state and relay messages
const WodClans = {
    mine: null, detail: null, pending: { applications: [], invitations: [] }, list: [], searchQuery: '',
    lb: { kind: 'war', sort: 'wins', rows: [] }, lbKind: 'players',
    cw: { counts: null, queued: null, war: null, party: null, partyInvite: null, partyInvitesSent: [] },
    form: { mode: 'create', emblem: 'p:swords', tab: 'presets', visibility: 'public', name: '', description: '', flagQuery: '' },
    listPage: 0, listPages: 1, listTotal: 0, listFilter: 'all', queuedBy: '', queuedAt: 0, error: '', launchTimer: 0, launching: '', unread: 0,
    // the clan browser (its own search, filter, order and page, apart from the Clan tab's search for a clan to join)
    browse: { query: '', filter: 'all', sort: 'members', page: 0, pages: 1, total: 0, allClans: 0, rows: [], loaded: false, timer: 0 },
};
try { WodClans.mine = JSON.parse(localStorage.getItem('simplewarsClanCache') || 'null'); } catch(_) {}
function wodClanOnline() { return typeof WodMultiplayer !== 'undefined' && WodMultiplayer.api && WodMultiplayer.api.socketOpen && WodMultiplayer.api.registered; }
function wodClanSend(msg) {
    if(!wodClanOnline()) return false;
    WodMultiplayer.clanSend(msg);
    return true;
}
function wodClanSetMine(summary) {
    WodClans.mine = summary || null;
    try { localStorage.setItem('simplewarsClanCache', JSON.stringify(WodClans.mine)); } catch(_) {}
    wodClanRenderProfileBadge();
}
function wodClanRefresh(opts) {
    if(!wodClanOnline()) return;
    wodClanSend({ t: 'clan_mine' });
    if(opts && opts.list) wodClanSearch();
    if(opts && opts.wars) wodClanSend({ t: 'cw_status', watch: true });
    if(opts && opts.board) wodClanSend({ t: 'clan_leaderboard', kind: WodClans.lb.kind, sort: WodClans.lb.sort });
}
const WOD_CLAN_DONE = {
    clan_create: () => 'Clan founded. Invite your friends from the Clan tab.',
    clan_join: m => 'You joined ' + (m.mine ? m.mine.name : 'the clan') + '.',
    clan_apply: () => 'Application sent: the clan\'s leader will approve or decline it.',
    clan_app_cancel: () => 'Application withdrawn.',
    clan_leave: () => 'You left the clan.',
    clan_update: () => 'Clan updated.',
    clan_kick: () => 'Member removed.',
    clan_approve: () => 'Application approved: they are in the clan.',
    clan_decline: () => 'Application declined.',
    clan_invite: () => 'Invitation sent.',
    clan_invite_declined: () => 'Invitation declined.',
};
function wodClanOnMessage(m) {
    if(!m || !m.t) return;
    switch(m.t) {
        case 'clan_info':
            if(m.view) { wodClanShowView(m.clan); break; }
            wodClanSetMine(m.mine);
            WodClans.detail = m.clan && m.clan.youAreMember ? m.clan : null;
            if(m.pending) WodClans.pending = m.pending;
            if(m.done) {
                WodClans.error = '';
                const say = WOD_CLAN_DONE[m.done];
                if(say) showNotification(say(m));
                if(m.done === 'clan_update') WodClans.form.mode = 'create';
                if(['clan_leave', 'clan_join', 'clan_create', 'clan_apply', 'clan_app_cancel'].includes(m.done)) { wodClanSearch(); if(wodClanBrowserShown()) wodClanBrowse(WodClans.browse.page); }
            }
            if(m.notice) showNotification(m.notice);
            wodClanRenderAll();
            break;
        case 'clan_list':
            if(m.browse) {
                Object.assign(WodClans.browse, { rows: m.clans || [], page: m.page | 0, pages: Math.max(1, m.pages | 0), total: m.total | 0, allClans: m.allClans | 0, loaded: true });
                wodClanRenderBrowser();
                break;
            }
            WodClans.list = m.clans || []; WodClans.listPage = m.page | 0; WodClans.listPages = Math.max(1, m.pages | 0); WodClans.listTotal = m.total | 0;
            if(document.getElementById('clanSearchResults')) wodClanRenderSearchResults(); else wodClanRenderPane();
            break;
        case 'clan_leaderboard': WodClans.lb = { kind: m.kind || 'war', sort: m.sort || 'wins', rows: m.rows || [] }; wodClanRenderLeaderboard(); break;
        case 'clan_chat': {
            const d = WodClans.detail, mine = m.message && m.message.playerId === WodMultiplayer.api.playerId;
            if(!d || d.id !== m.clanId || !m.message) break;
            (d.chat ||= []).push(m.message);
            if(d.chat.length > 80) d.chat.splice(0, d.chat.length - 80);
            if(mine) WodClans.chatJumpToEnd = true;
            wodClanRenderChat();
            if(!mine && !wodClanChatVisible()) wodClanSetUnread((WodClans.unread || 0) + 1);
            break;
        }
        case 'clan_error': case 'cw_error':
            if(m.reason === 'outdated') { if(typeof wodShowUpdateNotice === 'function') void wodShowUpdateNotice('multiplayer'); wodCwRenderPane(); break; }
            if(m.chat || m.t === 'cw_error') { showNotification(m.msg || 'That did not work.'); if(m.t === 'cw_error') wodCwRenderPane(); break; }
            WodClans.error = m.msg || 'That did not work.';
            showNotification(WodClans.error);
            wodClanRenderAll();
            break;
        case 'cw_status':
            WodClans.cw = { counts: m.counts || null, queued: m.queued || null, war: m.war || (WodMultiplayer.api.code ? WodClans.cw.war : null) || null, party: m.party || null, partyInvite: m.partyInvite || null, partyInvitesSent: m.partyInvitesSent || [] };
            WodClans.queuedAt = m.queued ? Date.now() - Math.max(0, m.queuedFor | 0) : 0;
            WodClans.queuedBy = m.queuedBy || '';
            wodCwSetBadge();
            wodCwRenderPane();
            break;
        case 'cw_party_invite':
            showNotification(m.name + ' invites you to a 2v2 party. Open Clan wars to accept.');
            break;
        case 'cw_party_ended':
            if(m.msg) showNotification(m.msg);
            break;
        case 'cw_match':
            wodCwClosePicker();
            WodClans.cw.war = m.war; WodClans.cw.queued = null; WodClans.queuedAt = 0;
            showNotification('Clan war found: ' + m.war.sides.map(s => s.clan ? s.clan.name : 'Clan').join(' vs ') + ' (' + m.war.tier + '). Setting up the battlefield…');
            wodCwRenderPane();
            if(m.role === 'host') void wodCwHostWar(m);
            break;
        case 'cw_join': void wodCwJoinWar(m); break;
        case 'cw_cancelled':
            WodClans.cw.war = null; WodClans.launching = '';
            showNotification(m.msg || 'The clan war was called off.');
            wodCwRenderPane();
            break;
        case 'cw_result': {
            const mine = (m.sides || []).find(s => s.clan && WodClans.mine && s.clan.id === WodClans.mine.id);
            WodClans.lastResult = m; WodClans.cw.war = null;
            if(mine) showNotification(mine.outcome === 'won' ? 'Clan war won! ' + mine.clan.name + ' takes the ' + m.tier + ' war.' : 'Clan war lost: the ' + m.tier + ' war goes to the other clan.');
            wodClanRefresh({ board: WodClans.lbKind === 'clans' });
            wodCwRenderPane();
            break;
        }
    }
}
addEventListener('wod-mp-Clan', ev => wodClanOnMessage(ev.detail));
addEventListener('wod-mp-Registered', ev => {
    wodClanSetMine(ev.detail && ev.detail.clan);
    wodClanRefresh({ wars: true });
});

// ---------------------------------------------------------------- the multiplayer hub: profile badge, tabs
function wodClanRenderProfileBadge() {
    const el = document.getElementById('mpProfileClan');
    if(!el) return;
    const c = WodClans.mine;
    el.innerHTML = c ? '<span class="mp-profile-clan-label">Clan</span>' + wodClanBadgeHtml(c, 'md') + '<button type="button" class="wod-editor-btn mp-profile-clan-open">View</button>'
        : '<span class="mp-profile-clan-label">Clan</span><span class="mp-profile-clan-none">No clan yet</span><button type="button" class="wod-editor-btn mp-profile-clan-open">Find a clan</button>';
    el.querySelector('.mp-profile-clan-open').onclick = () => wodMpSwitchHubTab('clan');
}
function wodClanOnHubTab(tabId) {
    if(tabId === 'clan') { wodClanSetUnread(0); wodClanRefresh({ list: true }); wodClanRenderPane(); }
    if(tabId === 'clans') { wodClanRenderBrowser(); wodClanBrowse(WodClans.browse.page); }
    if(tabId === 'wars') { wodClanRefresh({ wars: true }); wodCwRenderPane(); }
    if(tabId === 'rankings') { wodClanSyncLbKind(); if(WodClans.lbKind === 'clans') wodClanRefresh({ board: true }); }
}
function wodClanRenderAll() { wodClanRenderProfileBadge(); wodClanRenderPane(); wodCwRenderPane(); wodClanRenderBrowser(); wodClanSetUnread(WodClans.unread); }
function wodTabBadge(tabId, n, label) {
    const tab = document.getElementById(tabId);
    if(!tab) return;
    let badge = tab.querySelector('.mp-tab-badge');
    if(!n) { if(badge) badge.remove(); return; }
    if(!badge) { badge = document.createElement('span'); badge.className = 'mp-tab-badge'; tab.appendChild(badge); }
    badge.textContent = n > 9 ? '9+' : String(n);
    badge.setAttribute('aria-label', label);
}
// The Clan tab's badge counts unread chat, waiting applications (for the leader) and open invitations.
function wodClanSetUnread(n) {
    WodClans.unread = Math.max(0, n | 0);
    const apps = WodClans.detail && WodClans.detail.youAreLeader ? (WodClans.detail.applications || []).length : 0;
    const invites = !WodClans.detail ? (WodClans.pending.invitations || []).length : 0;
    const total = WodClans.unread + apps + invites;
    wodTabBadge('mpTabClan', total, total + ' new in your clan');
}
function wodCwSetBadge() { wodTabBadge('mpTabWars', WodClans.cw.partyInvite ? 1 : 0, 'A 2v2 party invitation'); }

// ---------------------------------------------------------------- Clan tab
function wodClanNum(n) { return typeof formatLifetimeBig === 'function' ? formatLifetimeBig(n | 0) : String(n | 0); }
function wodClanStatCard(label, value, note) {
    return '<div class="clan-stat"><span class="clan-stat-val">' + value + '</span><span class="clan-stat-lbl">' + label + '</span>' + (note ? '<span class="clan-stat-note">' + note + '</span>' : '') + '</div>';
}
function wodClanDate(t) { try { return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch(_) { return ''; } }
function wodClanAgo(t) {
    const d = Math.floor((Date.now() - (t || 0)) / 86400000);
    return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago';
}
function wodClanHistoryHtml(history, empty) {
    if(!history || !history.length) return '<p class="clan-empty">' + empty + '</p>';
    return '<ol class="clan-history-list">' + history.map(h => '<li class="clan-war-row clan-war-row--' + h.outcome + '">' +
        '<span class="clan-war-outcome">' + (h.outcome === 'won' ? 'Won' : 'Lost') + '</span>' +
        '<span class="clan-tier-chip">' + wodClanEsc(h.tier) + '</span>' +
        '<span class="clan-war-vs">vs ' + wodClanBadgeHtml(h.opponent, 'sm') + '</span>' +
        '<span class="clan-war-players">' + wodClanEsc((h.players || []).join(', ')) + '</span>' +
        '<span class="clan-war-rating" title="Kills and losses in this war">' + wodClanNum(h.kills) + ' kills · ' + wodClanNum(h.losses) + ' lost</span>' +
        '<span class="clan-war-date">' + wodClanDate(h.at) + '</span></li>').join('') + '</ol>';
}
// Clan-war stats count clan wars only; normal play is the members' multiplayer totals, as on the player leaderboard.
function wodClanWarStatsHtml(d) {
    const s = d.stats || {}, t1 = (s.byTier || {})['1v1'] || {}, t2 = (s.byTier || {})['2v2'] || {};
    return '<section class="clan-section"><h4>Clan war stats <span class="clan-h4-note">clan wars only</span></h4>' +
        '<div class="clan-stat-grid">' + wodClanStatCard('Wins', s.wins | 0) + wodClanStatCard('1v1 wins', t1.wins | 0) + wodClanStatCard('2v2 wins', t2.wins | 0) +
        wodClanStatCard('Defeats', s.defeats | 0) + wodClanStatCard('Kills', wodClanNum(s.kills)) + wodClanStatCard('Losses', wodClanNum(s.losses)) + '</div>' +
        '<p class="clan-stat-foot">' + ((s.played | 0) ? (s.played | 0) + ((s.played | 0) === 1 ? ' war' : ' wars') + ' fought · 1v1 ' + (t1.wins | 0) + '–' + (t1.defeats | 0) + ' · 2v2 ' + (t2.wins | 0) + '–' + (t2.defeats | 0) : 'No clan wars yet: queue in the Clan wars tab.') + '</p></section>';
}
function wodClanNormalStatsHtml(d) {
    const t = d.totals || {};
    return '<section class="clan-section"><h4>Normal play <span class="clan-h4-note">all members combined, as on the player leaderboard</span></h4>' +
        '<div class="clan-stat-grid clan-stat-grid--4">' + wodClanStatCard('Wins', wodClanNum(t.wins)) + wodClanStatCard('Kills', wodClanNum(t.kills)) + wodClanStatCard('Losses', wodClanNum(t.losses)) + wodClanStatCard('Defeats', wodClanNum(t.defeats)) + '</div></section>';
}
function wodClanMembersHtml(d, canKick) {
    if(!d.memberList) return '<section class="clan-section"><h4>Members (' + d.members + ')</h4><p class="clan-empty">This clan is private: only its members see who is in it.</p></section>';
    const myId = WodMultiplayer.api.playerId || '';
    return '<section class="clan-section"><h4>Members (' + d.members + ' / 30) <span class="clan-h4-note">ranked by clan-war wins, then wins</span></h4><ul class="clan-member-list">' + d.memberList.map(m =>
        '<li class="clan-member"><span class="clan-member-rank">#' + m.rank + '</span><span class="clan-online ' + (m.online ? 'is-online' : '') + '" title="' + (m.online ? 'Online' : 'Offline') + '"></span>' +
        '<span class="clan-member-name">' + wodClanEsc(m.name) + (m.playerId === myId ? ' <em>(you)</em>' : '') + '</span>' +
        (m.role === 'leader' ? '<span class="clan-role">Leader</span>' : '') +
        '<span class="clan-member-stat" title="Clan wars won / fought">' + (m.warWins | 0) + '/' + (m.warsPlayed | 0) + ' wars</span>' +
        '<span class="clan-member-stat" title="Multiplayer wins">' + (m.wins | 0) + ' wins</span>' +
        (m.lastSeenAt && !m.online ? '<span class="clan-member-stat" title="Last seen">' + wodClanAgo(m.lastSeenAt) + '</span>' : '') +
        (canKick && m.role !== 'leader' ? '<button type="button" class="wod-editor-btn clan-kick" data-pid="' + wodClanEsc(m.playerId) + '">Remove</button>' : '') + '</li>').join('') + '</ul></section>';
}
function wodClanHeroHtml(d, actions) {
    const s = d.stats || {};
    return '<header class="clan-hero"><div class="clan-hero-emblem">' + wodClanEmblemSvg(d.emblem) + '</div><div class="clan-hero-text"><h3>' + wodClanEsc(d.name) + '</h3>' +
        (d.description ? '<p class="clan-hero-desc">' + wodClanEsc(d.description) + '</p>' : '') +
        '<p>' + (d.visibility === 'private' ? 'Private clan · apply to join' : 'Public clan · anyone can join') + ' · ' + d.members + (d.members === 1 ? ' member' : ' members') + ' · led by ' + wodClanEsc(d.leaderName || '—') + ' · founded ' + wodClanDate(d.createdAt) + '</p>' +
        '<div class="clan-hero-pills"><span class="clan-pill clan-pill--gold">' + (s.wins | 0) + ((s.wins | 0) === 1 ? ' war win' : ' war wins') + '</span><span class="clan-pill">' + (s.defeats | 0) + ((s.defeats | 0) === 1 ? ' defeat' : ' defeats') + '</span><span class="clan-pill">' + (d.visibility === 'private' ? '🔒 Private' : 'Public') + '</span></div></div>' +
        '<div class="clan-hero-actions">' + (actions || '') + '</div></header>';
}
function wodClanAppKind(a) { return a.kind === 'random' ? 'Applied from search' : a.invitedBy === 'code' ? 'Used your invite code' : 'Invited by ' + wodClanEsc(a.invitedByName || 'a member'); }
function wodClanApplicationsHtml(d) {
    const q = d.queue || {}, apps = d.applications || [];
    // (a public clan is joined straight away, so its leader only sees this box when someone is waiting)
    if(!d.youAreLeader || (d.visibility !== 'private' && !apps.length)) return '';
    return '<section class="clan-section clan-apps"><h4>Applications <span class="clan-h4-note">' + apps.length + ' / ' + ((q.maxFromSearch | 0) + (q.maxInvited | 0)) + ' waiting · from search ' + (q.fromSearch | 0) + '/' + (q.maxFromSearch | 0) + ' · invited ' + (q.invited | 0) + '/' + (q.maxInvited | 0) + '</span></h4>' +
        (apps.length ? '<ul class="clan-app-list">' + apps.map(a => '<li class="clan-app"><div class="clan-app-main"><strong>' + wodClanEsc(a.name) + '</strong><span>' + wodClanAppKind(a) + ' · ' + (a.stats.wins | 0) + ' wins · ' + wodClanNum(a.stats.kills) + ' kills · ' + wodClanAgo(a.at) + '</span></div>' +
            '<button type="button" class="build-btn clan-approve" data-pid="' + wodClanEsc(a.playerId) + '">Approve</button><button type="button" class="wod-editor-btn clan-decline" data-pid="' + wodClanEsc(a.playerId) + '">Decline</button></li>').join('') + '</ul>'
            : '<p class="clan-empty">No applications waiting. ' + (d.visibility === 'private' ? 'Players find your clan in search and apply; friends your members invite, or anyone with your code, wait here for you too.' : 'Your clan is public, so players join it straight away.') + '</p>') + '</section>';
}
function wodClanInviteFriendsHtml(d) {
    const friends = typeof wodMpGetFriendsList === 'function' ? wodMpGetFriendsList() : [];
    const members = new Set((d.memberList || []).map(m => m.playerId)), invited = new Map((d.invited || []).map(i => [i.playerId, i]));
    const rows = friends.filter(f => f && f.playerId && !members.has(f.playerId));
    return '<section class="clan-section clan-invite-friends"><h4>Invite friends</h4><p class="clan-card-lead">' + (d.visibility === 'private' ? 'A friend who accepts waits for the leader\'s approval.' : 'A friend who accepts joins at once.') + '</p>' +
        (rows.length ? '<ul class="clan-friend-list">' + rows.map(f => '<li><span class="clan-friend-name">' + wodClanEsc(f.displayName || f.playerId) + '</span>' +
            (invited.has(f.playerId) ? '<span class="clan-tag">Invited · waiting</span>' : '<button type="button" class="build-btn clan-invite-btn" data-pid="' + wodClanEsc(f.playerId) + '">Invite</button>') + '</li>').join('') + '</ul>'
            : '<p class="clan-empty">' + (friends.length ? 'All your friends are in this clan.' : 'Add friends in the Friends tab, then invite them here.') + '</p>') + '</section>';
}
function wodClanHomeHtml(d) {
    const lead = d.youAreLeader;
    return '<div class="clan-home">' + wodClanHeroHtml(d, (lead ? '<button type="button" class="wod-editor-btn" id="clanEditBtn">Edit clan</button>' : '') + '<button type="button" class="wod-editor-btn clan-danger" id="clanLeaveBtn">Leave clan</button>') +
        (lead ? '<section class="clan-invite"><div><span class="clan-invite-label">Invite code</span><code id="clanInviteCode">' + wodClanEsc(d.code || '') + '</code></div>' +
            '<div class="clan-invite-actions"><button type="button" class="wod-editor-btn" id="clanCopyCode">Copy</button><button type="button" class="wod-editor-btn" id="clanNewCode">New code</button></div>' +
            '<p>' + (d.visibility === 'private' ? 'Only you hold this code. A player who uses it is queued as an invited applicant for you to approve; a new code stops the old one working.' : 'Players can join from the clan list, or with this code.') + '</p></section>'
            : '<p class="clan-invite-note">' + (d.visibility === 'private' ? '🔒 Private clan: players apply or are invited, and the leader, ' + wodClanEsc(d.leaderName || '') + ', approves them.' : 'Public clan: anyone can join from the clan list.') + '</p>') +
        wodClanApplicationsHtml(d) +
        '<div class="clan-home-cols"><div>' + wodClanWarStatsHtml(d) + wodClanNormalStatsHtml(d) + '<section class="clan-section"><h4>Recent clan wars</h4>' + wodClanHistoryHtml(d.history, 'No clan wars yet. Queue for one in the Clan wars tab.') + '</section></div>' +
        '<div>' + wodClanChatHtml(d) + wodClanMembersHtml(d, lead) + wodClanInviteFriendsHtml(d) + '</div></div></div>';
}
// ---- clan chat
function wodClanChatTime(t) { try { const d = new Date(t), today = new Date().toDateString() === d.toDateString(); return (today ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ') + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); } catch(_) { return ''; } }
function wodClanChatItemsHtml(list) {
    const myId = WodMultiplayer.api.playerId || '';
    if(!list || !list.length) return '<li class="clan-chat-empty">No messages yet. Say hello to your clan.</li>';
    return list.map(m => m.system
        ? '<li class="clan-chat-msg clan-chat-msg--system"><span class="clan-chat-text">' + wodClanEsc(m.text) + '</span><time>' + wodClanChatTime(m.at) + '</time></li>'
        : '<li class="clan-chat-msg' + (m.playerId === myId ? ' clan-chat-msg--mine' : '') + '"><span class="clan-chat-head"><strong>' + wodClanEsc(m.name || 'Player') + '</strong><time>' + wodClanChatTime(m.at) + '</time></span><span class="clan-chat-text">' + wodClanEsc(m.text) + '</span></li>').join('');
}
function wodClanChatHtml(d) {
    return '<section class="clan-section clan-chat"><h4>Clan chat</h4><ol class="clan-chat-list" id="clanChatList" aria-live="polite">' + wodClanChatItemsHtml(d.chat) + '</ol>' +
        '<form class="clan-chat-form" id="clanChatForm" autocomplete="off"><input type="text" id="clanChatInput" maxlength="200" placeholder="Message your clan" aria-label="Message your clan"><button type="submit" class="build-btn">Send</button></form></section>';
}
/** Redraw only the message list (keeps what is being typed), and stay at the newest message when already there. */
function wodClanRenderChat() {
    const list = document.getElementById('clanChatList');
    if(!list || !WodClans.detail) return;
    const atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    list.innerHTML = wodClanChatItemsHtml(WodClans.detail.chat);
    if(atEnd || WodClans.chatJumpToEnd) list.scrollTop = list.scrollHeight;
    WodClans.chatJumpToEnd = false;
}
function wodClanChatVisible() {
    const pane = document.getElementById('mpPaneClan'), panel = document.getElementById('multiplayerPanel');
    return !!(pane && !pane.hidden && panel && !panel.classList.contains('hidden') && document.getElementById('clanChatList'));
}
function wodClanFormHtml(mode, d) {
    const f = WodClans.form, isEdit = mode === 'edit';
    if(isEdit && !f.editing) { f.editing = true; f.name = d.name; f.emblem = d.emblem; f.visibility = d.visibility; f.description = d.description || ''; }
    const fq = (f.flagQuery || '').trim().toLowerCase();
    const ids = f.tab === 'flags' ? Object.keys(WOD_CLAN_FLAGS).filter(k => !fq || WOD_CLAN_FLAGS[k][0].toLowerCase().includes(fq)).map(k => 'f:' + k) : Object.keys(WOD_CLAN_PRESETS).map(k => 'p:' + k);
    return '<section class="clan-card clan-form">' +
        '<h3>' + (isEdit ? 'Edit your clan' : 'Found a clan') + '</h3>' + (isEdit ? '' : '<p class="clan-card-lead">You lead the clan you found. Name it, pick its emblem, and choose who can join.</p>') +
        '<label class="clan-field"><span class="clan-field-label">Clan name</span><input type="text" id="clanNameInput" maxlength="24" placeholder="3 to 24 characters" value="' + wodClanEsc(f.name || '') + '" autocomplete="off"></label>' +
        '<label class="clan-field"><span class="clan-field-label">Description <span class="clan-field-count" id="clanDescCount">' + (f.description || '').length + ' / 200</span></span><textarea id="clanDescInput" maxlength="200" rows="2" placeholder="What is your clan about? Who should join? (optional)">' + wodClanEsc(f.description || '') + '</textarea></label>' +
        '<div class="clan-field"><span class="clan-field-label">Emblem</span>' +
        '<div class="clan-emblem-tabs" role="tablist"><button type="button" class="mp-hub-tab' + (f.tab !== 'flags' ? ' active' : '') + '" data-etab="presets">Emblems</button><button type="button" class="mp-hub-tab' + (f.tab === 'flags' ? ' active' : '') + '" data-etab="flags">Country flags (' + Object.keys(WOD_CLAN_FLAGS).length + ')</button></div>' +
        (f.tab === 'flags' ? '<input type="search" id="clanFlagSearch" class="clan-search clan-flag-search" placeholder="Find a country" value="' + wodClanEsc(f.flagQuery || '') + '" autocomplete="off">' : '') +
        '<div class="clan-emblem-grid' + (f.tab === 'flags' ? ' clan-emblem-grid--flags' : '') + '">' + (ids.length ? '' : '<p class="clan-empty">No country matches that.</p>') + ids.map(id => '<button type="button" class="clan-emblem-opt' + (id === f.emblem ? ' is-selected' : '') + '" data-emblem="' + id + '" title="' + wodClanEsc(wodClanEmblemLabel(id)) + '" aria-label="' + wodClanEsc(wodClanEmblemLabel(id)) + '" aria-pressed="' + (id === f.emblem) + '">' + wodClanEmblemSvg(id) + '</button>').join('') + '</div></div>' +
        '<div class="clan-field"><span class="clan-field-label">Who can join</span><div class="clan-visibility">' +
        '<button type="button" class="clan-vis-opt' + (f.visibility !== 'private' ? ' is-selected' : '') + '" data-vis="public"><strong>Public</strong><span>Anyone can join straight from the clan list.</span></button>' +
        '<button type="button" class="clan-vis-opt' + (f.visibility === 'private' ? ' is-selected' : '') + '" data-vis="private"><strong>Private</strong><span>Listed and searchable, but players apply and the leader approves them.</span></button></div></div>' +
        '<div class="clan-form-foot"><div class="clan-preview">' + wodClanBadgeHtml({ name: f.name || 'Your clan', emblem: f.emblem }, 'md') + '</div>' +
        (isEdit ? '<button type="button" class="wod-editor-btn" id="clanEditCancel">Cancel</button>' : '') +
        '<button type="button" class="menu-btn clan-primary" id="clanSubmitBtn">' + (isEdit ? 'Save changes' : 'Found clan') + '</button></div>' +
        (WodClans.error ? '<p class="clan-form-error" role="alert">' + wodClanEsc(WodClans.error) + '</p>' : '') + '</section>';
}
// The player's open invitations and applications (only shown while not in a clan).
function wodClanPendingHtml() {
    const p = WodClans.pending || {}, inv = p.invitations || [], apps = p.applications || [];
    if(!inv.length && !apps.length) return '';
    return '<section class="clan-card clan-pending"><h3>Your invitations and applications</h3><ul class="clan-app-list">' +
        inv.map(i => '<li class="clan-app"><span class="clan-list-emblem">' + wodClanEmblemSvg(i.clan.emblem) + '</span><div class="clan-app-main"><strong>' + wodClanEsc(i.clan.name) + '</strong><span>Invited by ' + wodClanEsc(i.byName) + (i.clan.visibility === 'private' ? ' · then the leader approves you' : ' · you join at once') + '</span></div>' +
            '<button type="button" class="build-btn clan-inv-accept" data-clan="' + wodClanEsc(i.clan.id) + '">Accept</button><button type="button" class="wod-editor-btn clan-inv-decline" data-clan="' + wodClanEsc(i.clan.id) + '">Decline</button></li>').join('') +
        apps.map(a => '<li class="clan-app"><span class="clan-list-emblem">' + wodClanEmblemSvg(a.clan.emblem) + '</span><div class="clan-app-main"><strong>' + wodClanEsc(a.clan.name) + '</strong><span>Waiting for the leader · ' + (a.kind === 'invite' ? 'invited' : 'applied') + ' ' + wodClanAgo(a.at) + '</span></div>' +
            '<button type="button" class="wod-editor-btn clan-app-cancel" data-clan="' + wodClanEsc(a.clan.id) + '">Withdraw</button></li>').join('') + '</ul></section>';
}
function wodClanListAction(c) {
    if(c.visibility === 'public') return '<button type="button" class="build-btn clan-join-btn" data-clan="' + wodClanEsc(c.id) + '">Join</button>';
    if(c.applied) return '<button type="button" class="wod-editor-btn clan-app-cancel" data-clan="' + wodClanEsc(c.id) + '" title="Withdraw your application">Applied ✓</button>';
    if(c.queueFull) return '<button type="button" class="build-btn" disabled title="Its leader has 3 applications from search waiting already">Queue full</button>';
    return '<button type="button" class="build-btn clan-apply-btn" data-clan="' + wodClanEsc(c.id) + '">Apply</button>';
}
// Ask the relay for a page of clans matching the search (name) and filter.
function wodClanSearch(page) {
    WodClans.listPage = page == null ? 0 : Math.max(0, page | 0);
    wodClanSend({ t: 'clan_list', query: WodClans.searchQuery || '', page: WodClans.listPage, filter: WodClans.listFilter });
}
function wodClanSearchResultsHtml() {
    const rows = WodClans.list || [], q = (WodClans.searchQuery || '').trim(), total = WodClans.listTotal | 0, pages = WodClans.listPages || 1, page = WodClans.listPage | 0;
    const what = WodClans.listFilter === 'public' ? 'public clan' : WodClans.listFilter === 'private' ? 'private clan' : 'clan';
    const head = '<p class="clan-results-head" aria-live="polite">' + (total ? total + ' ' + what + (total === 1 ? '' : 's') + (q ? ' matching “' + wodClanEsc(q) + '”' : '') : '') + '</p>';
    const list = rows.length ? rows.map(c => '<div class="clan-list-row">' + '<span class="clan-list-emblem">' + wodClanEmblemSvg(c.emblem) + '</span>' +
        '<span class="clan-list-main"><strong>' + wodClanEsc(c.name) + (c.visibility === 'private' ? ' <span class="clan-lock" title="Private: apply to join">🔒</span>' : '') + '</strong>' +
        (c.description ? '<span class="clan-list-desc">' + wodClanEsc(c.description) + '</span>' : '') +
        '<span>' + c.members + (c.members === 1 ? ' member' : ' members') + ' · ' + (c.wins | 0) + ((c.wins | 0) === 1 ? ' war win' : ' war wins') + ' · ' + (c.visibility === 'private' ? 'private: apply' : 'public: join now') + '</span></span>' +
        '<button type="button" class="wod-editor-btn clan-view" data-clan="' + wodClanEsc(c.id) + '">View</button>' + wodClanListAction(c) + '</div>').join('')
        : '<p class="clan-empty">' + (!wodClanOnline() ? 'Connecting to the multiplayer server…' : q ? 'No ' + what + 's match “' + wodClanEsc(q) + '”. Check the spelling, or try part of the name.' : WodClans.listFilter !== 'all' ? 'No ' + what + 's yet.' : 'No clans yet: found the first one.') + '</p>';
    const pager = pages > 1 ? '<div class="clan-pager"><button type="button" class="wod-editor-btn clan-page-prev" aria-label="Previous page"' + (page <= 0 ? ' disabled' : '') + '>←</button><span class="clan-page-label">Page ' + (page + 1) + ' / ' + pages + '</span><button type="button" class="wod-editor-btn clan-page-next" aria-label="Next page"' + (page >= pages - 1 ? ' disabled' : '') + '>→</button></div>' : '';
    return head + '<div class="clan-list">' + list + '</div>' + pager;
}
function wodClanRenderSearchResults() {
    const box = document.getElementById('clanSearchResults');
    if(!box) return;
    box.innerHTML = wodClanSearchResultsHtml();
    wodClanWireListButtons(box);
    const prev = box.querySelector('.clan-page-prev'), next = box.querySelector('.clan-page-next');
    if(prev) prev.onclick = () => wodClanSearch(WodClans.listPage - 1);
    if(next) next.onclick = () => wodClanSearch(WodClans.listPage + 1);
}
function wodClanJoinHtml() {
    return '<section class="clan-card clan-join"><h3>Find a clan</h3><p class="clan-card-lead">Search by name. Join a public clan at once, or apply to a private one for its leader to approve.</p>' +
        '<div class="clan-search-row"><input type="search" id="clanSearchInput" class="clan-search" placeholder="Search clans by name" value="' + wodClanEsc(WodClans.searchQuery || '') + '" autocomplete="off" aria-label="Search clans by name"></div>' +
        '<div class="clan-filter" role="group" aria-label="Show">' + [['all', 'All'], ['public', 'Public'], ['private', 'Private']].map(([k, label]) => '<button type="button" class="mp-hub-tab' + (WodClans.listFilter === k ? ' active' : '') + '" data-clan-filter="' + k + '">' + label + '</button>').join('') + '</div>' +
        '<div id="clanSearchResults">' + wodClanSearchResultsHtml() + '</div>' +
        '<details class="clan-code-box"><summary>Have an invite code?</summary><div class="clan-code-row"><input type="text" id="clanCodeInput" maxlength="16" placeholder="CLAN-1A2B3C4D" autocomplete="off"><button type="button" class="build-btn" id="clanCodeJoin">Use code</button></div></details></section>';
}
function wodClanRenderPane() {
    const root = document.getElementById('mpClanRoot');
    if(!root || root.closest('[hidden]')) return;
    const d = WodClans.detail;
    const focus = document.activeElement && root.contains(document.activeElement) ? document.activeElement.id : '';
    const draft = (document.getElementById('clanChatInput') || {}).value || '';
    const scrollTop = root.closest('.mp-hub-main') ? root.closest('.mp-hub-main').scrollTop : 0;
    if(d && d.youAreMember && WodClans.form.mode === 'edit') root.innerHTML = '<div class="clan-edit-wrap">' + wodClanFormHtml('edit', d) + '</div>';
    else if(d && d.youAreMember) { WodClans.form.editing = false; root.innerHTML = wodClanHomeHtml(d); }
    else { WodClans.form.editing = false; if(WodClans.form.mode === 'edit') WodClans.form.mode = 'create'; root.innerHTML = wodClanPendingHtml() + '<div class="clan-start">' + wodClanFormHtml('create') + wodClanJoinHtml() + '</div>'; }
    wodClanWirePane(root);
    const chatInput = document.getElementById('clanChatInput');
    if(chatInput && draft) chatInput.value = draft;
    const chatList = document.getElementById('clanChatList');
    if(chatList) chatList.scrollTop = chatList.scrollHeight;
    if(root.closest('.mp-hub-main')) root.closest('.mp-hub-main').scrollTop = scrollTop;
    if(focus) { const el = document.getElementById(focus); if(el) { el.focus(); if(el.setSelectionRange && el.value != null) el.setSelectionRange(el.value.length, el.value.length); } }
}
function wodClanWireListButtons(root) {
    root.querySelectorAll('.clan-join-btn').forEach(b => b.onclick = () => wodClanSend({ t: 'clan_join', clanId: b.dataset.clan }));
    root.querySelectorAll('.clan-apply-btn').forEach(b => b.onclick = () => wodClanSend({ t: 'clan_join', clanId: b.dataset.clan }));
    root.querySelectorAll('.clan-app-cancel').forEach(b => b.onclick = () => wodClanSend({ t: 'clan_app_cancel', clanId: b.dataset.clan }));
    root.querySelectorAll('.clan-view').forEach(b => b.onclick = () => wodClanSend({ t: 'clan_get', clanId: b.dataset.clan }));
}
function wodClanWirePane(root) {
    const f = WodClans.form, $ = id => root.querySelector('#' + id);
    const name = $('clanNameInput');
    if(name) name.oninput = () => { f.name = name.value; const pv = root.querySelector('.clan-preview'); if(pv) pv.innerHTML = wodClanBadgeHtml({ name: f.name || 'Your clan', emblem: f.emblem }, 'md'); };
    root.querySelectorAll('[data-etab]').forEach(b => b.onclick = () => { f.tab = b.dataset.etab; wodClanRenderPane(); });
    root.querySelectorAll('[data-emblem]').forEach(b => b.onclick = () => { f.emblem = b.dataset.emblem; wodClanRenderPane(); });
    root.querySelectorAll('[data-vis]').forEach(b => b.onclick = () => { f.visibility = b.dataset.vis; wodClanRenderPane(); });
    const submit = $('clanSubmitBtn');
    if(submit) submit.onclick = () => {
        WodClans.error = '';
        const payload = { name: (f.name || '').trim(), emblem: f.emblem, visibility: f.visibility, description: (f.description || '').trim() };
        if(payload.name.length < 3) { WodClans.error = 'Clan names need at least 3 characters.'; wodClanRenderPane(); return; }
        if(!wodClanSend({ t: f.mode === 'edit' ? 'clan_update' : 'clan_create', ...payload })) { WodClans.error = 'Not connected to the multiplayer server.'; wodClanRenderPane(); }
    };
    const cancel = $('clanEditCancel');
    if(cancel) cancel.onclick = () => { f.mode = 'create'; f.editing = false; WodClans.error = ''; wodClanRenderPane(); };
    const edit = $('clanEditBtn');
    if(edit) edit.onclick = () => { f.mode = 'edit'; f.editing = false; f.tab = String(WodClans.detail.emblem).startsWith('f:') ? 'flags' : 'presets'; wodClanRenderPane(); };
    const leave = $('clanLeaveBtn');
    if(leave) leave.onclick = async () => {
        const d = WodClans.detail;
        const solo = d && d.members === 1;
        if(await wodShowConfirmDialog({ title: 'Leave ' + (d ? d.name : 'clan') + '?', body: solo ? 'You are its only member, so the clan and its records will be disbanded.' : d && d.youAreLeader ? 'Your highest-ranked member becomes leader.' : 'To come back you will have to join or apply again.', confirmLabel: solo ? 'Disband clan' : 'Leave clan', danger: true }))
            wodClanSend({ t: 'clan_leave' });
    };
    const chatForm = $('clanChatForm');
    if(chatForm) chatForm.onsubmit = e => {
        e.preventDefault();
        const input = $('clanChatInput'), text = (input.value || '').trim();
        if(!text) return;
        if(wodClanSend({ t: 'clan_chat', text })) { input.value = ''; WodClans.chatJumpToEnd = true; }
        else showNotification('Not connected to the multiplayer server.');
    };
    const copy = $('clanCopyCode');
    if(copy) copy.onclick = () => { const code = (WodClans.detail || {}).code || ''; try { navigator.clipboard.writeText(code); showNotification('Invite code copied.'); } catch(_) { showNotification('Invite code: ' + code); } };
    const newCode = $('clanNewCode');
    if(newCode) newCode.onclick = () => wodClanSend({ t: 'clan_update', newCode: true });
    root.querySelectorAll('.clan-kick').forEach(b => b.onclick = async () => {
        if(await wodShowConfirmDialog({ title: 'Remove this member?', body: 'They leave the clan; to come back they have to join or apply again.', confirmLabel: 'Remove', danger: true }))
            wodClanSend({ t: 'clan_kick', playerId: b.dataset.pid });
    });
    root.querySelectorAll('.clan-approve').forEach(b => b.onclick = () => wodClanSend({ t: 'clan_app_answer', playerId: b.dataset.pid, approve: true }));
    root.querySelectorAll('.clan-decline').forEach(b => b.onclick = () => wodClanSend({ t: 'clan_app_answer', playerId: b.dataset.pid, approve: false }));
    root.querySelectorAll('.clan-invite-btn').forEach(b => b.onclick = () => wodClanSend({ t: 'clan_invite', playerId: b.dataset.pid }));
    root.querySelectorAll('.clan-inv-accept').forEach(b => b.onclick = () => wodClanSend({ t: 'clan_invite_answer', clanId: b.dataset.clan, accept: true }));
    root.querySelectorAll('.clan-inv-decline').forEach(b => b.onclick = () => wodClanSend({ t: 'clan_invite_answer', clanId: b.dataset.clan, accept: false }));
    const codeJoin = $('clanCodeJoin'), codeInput = $('clanCodeInput');
    if(codeJoin) codeJoin.onclick = () => { const code = (codeInput.value || '').trim(); if(!code) { showNotification('Enter a clan invite code.'); return; } wodClanSend({ t: 'clan_join', code }); };
    if(codeInput) codeInput.onkeydown = e => { if(e.key === 'Enter') codeJoin.click(); };
    const search = $('clanSearchInput');
    if(search) {
        search.oninput = () => { WodClans.searchQuery = search.value; clearTimeout(WodClans.searchTimer); WodClans.searchTimer = setTimeout(() => wodClanSearch(0), 220); };
        search.onkeydown = e => { if(e.key === 'Enter') { clearTimeout(WodClans.searchTimer); wodClanSearch(0); } };
    }
    root.querySelectorAll('[data-clan-filter]').forEach(b => b.onclick = () => { WodClans.listFilter = b.dataset.clanFilter; root.querySelectorAll('[data-clan-filter]').forEach(x => x.classList.toggle('active', x === b)); wodClanSearch(0); });
    const prev = root.querySelector('.clan-page-prev'), next = root.querySelector('.clan-page-next');
    if(prev) prev.onclick = () => wodClanSearch(WodClans.listPage - 1);
    if(next) next.onclick = () => wodClanSearch(WodClans.listPage + 1);
    const desc = $('clanDescInput');
    if(desc) desc.oninput = () => { f.description = desc.value; const n = $('clanDescCount'); if(n) n.textContent = desc.value.length + ' / 200'; };
    const flagSearch = $('clanFlagSearch');
    if(flagSearch) flagSearch.oninput = () => { f.flagQuery = flagSearch.value; wodClanRenderPane(); };
    wodClanWireListButtons(root);
}
// ---------------------------------------------------------------- Clan browser
// Every clan on the server, for every player (in a clan or not): search by name, show public or private ones, order by
// members, clan-war wins, members online, age or name, and page through. View opens a clan's page; a player without a
// clan can join or apply from the row.
const WOD_CLAN_BROWSE_SORTS = [['members', 'Most members'], ['wins', 'Most war wins'], ['online', 'Most online now'], ['newest', 'Newest'], ['name', 'Name (A to Z)']];
const WOD_CLAN_BROWSE_PAGE = 12;
function wodClanBrowserShown() { const root = document.getElementById('mpClanBrowserRoot'); return !!root && !root.closest('[hidden]'); }
function wodClanBrowse(page) {
    const b = WodClans.browse;
    b.page = page == null ? 0 : Math.max(0, page | 0);
    if(!wodClanSend({ t: 'clan_list', browse: true, query: b.query || '', page: b.page, filter: b.filter, sort: b.sort, pageSize: WOD_CLAN_BROWSE_PAGE })) { b.loaded = false; wodClanRenderBrowser(); }
}
function wodClanBrowserRowHtml(c) {
    const mine = !!(WodClans.mine && WodClans.mine.id === c.id), n = c.members | 0, on = c.online | 0, wins = c.wins | 0;
    const action = mine ? '<span class="clan-browse-yours">Your clan</span>' : !WodClans.mine ? wodClanListAction(c) : '';
    const meta = [n + (n === 1 ? ' member' : ' members'), on ? '<span class="clan-browse-online">' + on + ' online</span>' : 'none online', wins + (wins === 1 ? ' war win' : ' war wins')];
    const more = [c.leaderName ? 'Led by ' + wodClanEsc(c.leaderName) : '', c.createdAt ? 'founded ' + wodClanAgo(c.createdAt) : '', c.visibility === 'private' ? 'private: apply to join' : 'public: anyone can join'].filter(Boolean);
    return '<div class="clan-list-row clan-browse-row' + (mine ? ' is-mine' : '') + '" data-clan-row="' + wodClanEsc(c.id) + '"><span class="clan-list-emblem">' + wodClanEmblemSvg(c.emblem) + '</span>' +
        '<span class="clan-list-main"><strong>' + wodClanEsc(c.name) + (c.visibility === 'private' ? ' <span class="clan-lock" title="Private: apply to join">🔒</span>' : '') + '</strong>' +
        (c.description ? '<span class="clan-list-desc">' + wodClanEsc(c.description) + '</span>' : '') +
        '<span class="clan-browse-meta">' + meta.join(' · ') + '</span><span class="clan-browse-meta">' + more.join(' · ') + '</span></span>' +
        '<span class="clan-browse-actions"><button type="button" class="wod-editor-btn clan-view" data-clan="' + wodClanEsc(c.id) + '">View</button>' + action + '</span></div>';
}
function wodClanBrowserResultsHtml() {
    const b = WodClans.browse, q = (b.query || '').trim(), what = b.filter === 'public' ? 'public clan' : b.filter === 'private' ? 'private clan' : 'clan';
    if(!wodClanOnline()) return '<p class="clan-empty">Connecting to the multiplayer server…</p>';
    if(!b.loaded) return '<p class="clan-empty">Loading clans…</p>';
    const head = '<p class="clan-results-head" aria-live="polite">' + (b.total ? b.total + ' ' + what + (b.total === 1 ? '' : 's') + (q ? ' matching “' + wodClanEsc(q) + '”' : '') + (b.allClans > b.total ? ' (of ' + b.allClans + ' clans)' : '') : '') + '</p>';
    const list = b.rows.length ? b.rows.map(wodClanBrowserRowHtml).join('')
        : '<p class="clan-empty">' + (q ? 'No ' + what + 's match “' + wodClanEsc(q) + '”. Check the spelling, or try part of the name.' : b.filter !== 'all' ? 'No ' + what + 's yet.' : 'No clans yet. Found the first one in the Clan tab.') + '</p>';
    const pager = b.pages > 1 ? '<div class="clan-pager"><button type="button" class="wod-editor-btn clan-browse-prev" aria-label="Previous page"' + (b.page <= 0 ? ' disabled' : '') + '>←</button><span class="clan-page-label">Page ' + (b.page + 1) + ' / ' + b.pages + '</span><button type="button" class="wod-editor-btn clan-browse-next" aria-label="Next page"' + (b.page >= b.pages - 1 ? ' disabled' : '') + '>→</button></div>' : '';
    return head + '<div class="clan-list">' + list + '</div>' + pager;
}
function wodClanBrowserLeadHtml() {
    const m = WodClans.mine;
    return m ? 'You are in ' + wodClanBadgeHtml(m, 'sm') + '. To join another clan, leave yours first in the Clan tab.' : 'Join a public clan at once, or apply to a private one for its leader to approve. View a clan to see its members and record.';
}
function wodClanRenderBrowser() {
    const root = document.getElementById('mpClanBrowserRoot');
    if(!root || root.closest('[hidden]')) return;
    const b = WodClans.browse;
    if(!root.querySelector('#clanBrowseResults')) {
        root.innerHTML = '<section class="clan-card clan-browser"><h3>Clan browser</h3><p class="clan-card-lead" id="clanBrowseLead"></p>' +
            '<div class="clan-browser-controls"><input type="search" id="clanBrowseSearch" class="clan-search" placeholder="Search clans by name" autocomplete="off" aria-label="Search clans by name">' +
            '<div class="clan-filter" role="group" aria-label="Show">' + [['all', 'All'], ['public', 'Public'], ['private', 'Private']].map(([k, label]) => '<button type="button" class="mp-hub-tab" data-browse-filter="' + k + '">' + label + '</button>').join('') + '</div>' +
            '<label class="clan-browse-sort">Sort by <select id="clanBrowseSort">' + WOD_CLAN_BROWSE_SORTS.map(([k, label]) => '<option value="' + k + '">' + label + '</option>').join('') + '</select></label></div>' +
            '<div id="clanBrowseResults"></div></section>';
        const search = root.querySelector('#clanBrowseSearch');
        search.value = b.query || '';
        search.oninput = () => { b.query = search.value; clearTimeout(b.timer); b.timer = setTimeout(() => wodClanBrowse(0), 220); };
        search.onkeydown = e => { if(e.key === 'Enter') { clearTimeout(b.timer); wodClanBrowse(0); } };
        root.querySelectorAll('[data-browse-filter]').forEach(btn => btn.onclick = () => { b.filter = btn.dataset.browseFilter; wodClanRenderBrowser(); wodClanBrowse(0); });
        const sort = root.querySelector('#clanBrowseSort');
        sort.onchange = () => { b.sort = sort.value; wodClanBrowse(0); };
    }
    root.querySelector('#clanBrowseLead').innerHTML = wodClanBrowserLeadHtml();
    root.querySelectorAll('[data-browse-filter]').forEach(btn => { const on = btn.dataset.browseFilter === b.filter; btn.classList.toggle('active', on); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    root.querySelector('#clanBrowseSort').value = b.sort;
    const box = root.querySelector('#clanBrowseResults');
    box.innerHTML = wodClanBrowserResultsHtml();
    wodClanWireListButtons(box);
    const prev = box.querySelector('.clan-browse-prev'), next = box.querySelector('.clan-browse-next');
    if(prev) prev.onclick = () => wodClanBrowse(b.page - 1);
    if(next) next.onclick = () => wodClanBrowse(b.page + 1);
}
// Another clan, from the list or the leaderboard.
function wodClanShowView(d) {
    let dlg = document.getElementById('clanViewDlg');
    if(!d) { showNotification('That clan no longer exists.'); return; }
    if(!dlg) {
        dlg = document.createElement('div');
        dlg.id = 'clanViewDlg';
        dlg.className = 'clan-view-dlg';
        dlg.setAttribute('role', 'dialog');
        dlg.setAttribute('aria-modal', 'true');
        document.body.appendChild(dlg);
    }
    const free = !WodClans.mine && !d.youAreMember;
    const action = !free ? '' : d.visibility === 'public' ? '<button type="button" class="build-btn clan-join-btn" data-clan="' + wodClanEsc(d.id) + '">Join clan</button>'
        : d.youApplied ? '<button type="button" class="wod-editor-btn clan-app-cancel" data-clan="' + wodClanEsc(d.id) + '">Withdraw application</button>'
        : '<button type="button" class="build-btn clan-apply-btn" data-clan="' + wodClanEsc(d.id) + '">Apply to join</button>';
    dlg.innerHTML = '<div class="clan-view-backdrop"></div><div class="clan-view-card">' + wodClanHeroHtml(d, action + '<button type="button" class="wod-editor-btn" id="clanViewClose">Close</button>') +
        '<div class="clan-home-cols"><div>' + wodClanWarStatsHtml(d) + wodClanNormalStatsHtml(d) + '<section class="clan-section"><h4>Recent clan wars</h4>' + wodClanHistoryHtml(d.history, 'No clan wars yet.') + '</section></div><div>' + wodClanMembersHtml(d, false) + '</div></div></div>';
    dlg.hidden = false;
    const close = () => { dlg.hidden = true; };
    dlg.querySelector('#clanViewClose').onclick = close;
    dlg.querySelector('.clan-view-backdrop').onclick = close;
    wodClanWireListButtons(dlg);
    dlg.querySelectorAll('.clan-join-btn, .clan-apply-btn, .clan-app-cancel').forEach(b => b.addEventListener('click', close));
}

// ---------------------------------------------------------------- Rankings: clans
const WOD_CLAN_BOARDS = {
    war: { label: 'Clan wars', lead: 'Clan war results only.', sorts: [['wins', 'Wins'], ['wins1v1', '1v1 wins'], ['wins2v2', '2v2 wins'], ['defeats', 'Defeats'], ['kills', 'Kills'], ['losses', 'Losses']] },
    normal: { label: 'Normal play', lead: 'All members\' multiplayer stats added together, as on the player leaderboard.', sorts: [['wins', 'Wins'], ['kills', 'Kills'], ['losses', 'Losses'], ['defeats', 'Defeats']] },
};
function wodClanSyncLbKind() {
    const kind = WodClans.lbKind;
    document.querySelectorAll('#mpLbKind [data-lb-kind]').forEach(b => { const on = b.dataset.lbKind === kind; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
    const players = document.getElementById('mpLbPlayersView'), clansView = document.getElementById('mpLbClansView');
    if(players) players.hidden = kind !== 'players';
    if(clansView) clansView.hidden = kind !== 'clans';
    wodClanRenderLbControls();
}
function wodClanRenderLbControls() {
    const lb = WodClans.lb, board = WOD_CLAN_BOARDS[lb.kind] || WOD_CLAN_BOARDS.war;
    const kinds = document.getElementById('mpClanLbKind'), sorts = document.getElementById('mpClanLbSort'), lead = document.getElementById('mpClanLbLead');
    if(kinds) kinds.innerHTML = Object.entries(WOD_CLAN_BOARDS).map(([k, b]) => '<button type="button" class="mp-hub-tab' + (k === lb.kind ? ' active' : '') + '" data-clan-board="' + k + '">' + b.label + '</button>').join('');
    if(sorts) sorts.innerHTML = board.sorts.map(([k, label]) => '<button type="button" class="mp-hub-tab' + (k === lb.sort ? ' active' : '') + '" data-clan-sort="' + k + '">' + label + '</button>').join('');
    if(lead) lead.textContent = board.lead;
    document.querySelectorAll('#mpClanLbKind [data-clan-board]').forEach(b => b.onclick = () => { WodClans.lb = { kind: b.dataset.clanBoard, sort: 'wins', rows: [] }; wodClanRenderLeaderboard(); wodClanRefresh({ board: true }); });
    document.querySelectorAll('#mpClanLbSort [data-clan-sort]').forEach(b => b.onclick = () => { WodClans.lb.sort = b.dataset.clanSort; wodClanRenderLbControls(); wodClanRefresh({ board: true }); });
}
function wodClanRenderLeaderboard() {
    wodClanRenderLbControls();
    const host = document.getElementById('mpClanLeaderboardList');
    if(!host) return;
    const lb = WodClans.lb, rows = lb.rows || [], mineId = WodClans.mine && WodClans.mine.id;
    if(!rows.length) { host.innerHTML = '<p class="mp-hub-pane-lead">No clans yet. Found one in the Clan tab.</p>'; return; }
    const labels = Object.fromEntries((WOD_CLAN_BOARDS[lb.kind] || WOD_CLAN_BOARDS.war).sorts);
    const values = r => {
        if(lb.kind === 'normal') { const t = r.totals || {}; return { wins: t.wins, kills: t.kills, losses: t.losses, defeats: t.defeats }; }
        const s = r.stats || {}, bt = s.byTier || {};
        return { wins: s.wins, wins1v1: (bt['1v1'] || {}).wins, wins2v2: (bt['2v2'] || {}).wins, defeats: s.defeats, kills: s.kills, losses: s.losses };
    };
    host.innerHTML = rows.map((r, i) => {
        const v = values(r), order = [lb.sort, ...Object.keys(labels).filter(k => k !== lb.sort)];
        return '<div class="mp-lb-row clan-lb-row' + (r.id === mineId ? ' is-mine' : '') + '"><span class="mp-lb-rank">' + (i + 1) + '</span><span class="clan-lb-emblem">' + wodClanEmblemSvg(r.emblem) + '</span>' +
            '<div class="mp-lb-meta"><div class="mp-lb-name">' + wodClanEsc(r.name) + (r.visibility === 'private' ? ' <span class="clan-lock" title="Private clan">🔒</span>' : '') + (r.id === mineId ? ' <span class="mp-lb-friend-tag">Your clan</span>' : '') + '</div>' +
            '<div class="mp-lb-val">' + order.map((k, j) => j ? labels[k] + ' ' + wodClanNum(v[k]) : '<span class="mp-lb-val-primary">' + labels[k] + ' ' + wodClanNum(v[k]) + '</span>').join(' · ') + '</div>' +
            '<div class="mp-lb-status">' + r.members + (r.members === 1 ? ' member' : ' members') + ' · led by ' + wodClanEsc(r.leaderName || '—') + '</div></div>' +
            '<div class="mp-lb-actions"><button type="button" class="wod-editor-btn clan-view" data-clan="' + wodClanEsc(r.id) + '">View</button></div></div>';
    }).join('');
    host.querySelectorAll('.clan-view').forEach(b => b.onclick = () => wodClanSend({ t: 'clan_get', clanId: b.dataset.clan }));
}
function wodClanWireRankings() {
    document.querySelectorAll('#mpLbKind [data-lb-kind]').forEach(b => b.onclick = () => {
        WodClans.lbKind = b.dataset.lbKind;
        wodClanSyncLbKind();
        if(WodClans.lbKind === 'clans') wodClanRefresh({ board: true });
    });
    wodClanRenderLbControls();
}

// ---------------------------------------------------------------- Clan wars tab
function wodCwCountHtml(tier) {
    const c = ((WodClans.cw.counts || {})[tier]) || { players: 0, clans: 0, parties: 0 };
    const extra = tier === '2v2' ? ((c.parties | 0) === 1 ? ' · 1 party' : ' · ' + (c.parties | 0) + ' parties') : '';
    return '<div class="cw-tier-count" aria-live="polite"><strong class="cw-count-num" data-tier-count="' + tier + '">' + (c.players | 0) + '</strong><span>' + ((c.players | 0) === 1 ? 'player' : 'players') + ' in this queue now' + ((c.players | 0) ? extra + ' · from ' + (c.clans | 0) + ((c.clans | 0) === 1 ? ' clan' : ' clans') : '') + '</span></div>';
}
function wodCw1v1Html() {
    const cw = WodClans.cw, queued = cw.queued === '1v1', busy = !!(cw.war || WodMultiplayer.api.code);
    return '<section class="cw-tier' + (queued ? ' is-queued' : '') + '"><div class="cw-tier-top"><span class="clan-tier-chip clan-tier-chip--lg">1v1</span><h4>1v1 duel</h4></div>' +
        '<p class="cw-tier-lead">You against one member of another clan. You are never matched with a clanmate.</p>' + wodCwCountHtml('1v1') +
        (queued ? '<p class="cw-searching"><span class="cw-pulse"></span>Searching for an opposing clan… <span id="cwWait">' + wodCwWaitText() + '</span></p><button type="button" class="wod-editor-btn cw-leave">Leave queue</button>'
            : cw.party ? '<p class="cw-note">You are in a 2v2 party: leave it to fight 1v1.</p><button type="button" class="menu-btn clan-primary" disabled>Join 1v1 queue</button>'
            : '<button type="button" class="menu-btn clan-primary cw-join" data-tier="1v1"' + (busy || cw.queued ? ' disabled' : '') + '>Join 1v1 queue</button>') + '</section>';
}
function wodCw2v2Html() {
    const cw = WodClans.cw, party = cw.party, queued = cw.queued === '2v2', myId = WodMultiplayer.api.playerId || '';
    let body = '';
    if(party && party.members.length === 2) {
        const mate = party.members.find(m => m.playerId !== myId) || {};
        body = '<div class="cw-party"><span class="cw-party-label">Your party</span><span class="cw-party-member">You</span><span class="cw-party-plus">+</span><span class="cw-party-member">' + wodClanEsc(mate.name || 'Teammate') + (mate.online === false ? ' (offline)' : '') + '</span><button type="button" class="wod-editor-btn cw-party-leave">Leave party</button></div>' +
            (queued ? '<p class="cw-searching"><span class="cw-pulse"></span>Your party is searching' + (cw.queuedBy || WodClans.queuedBy ? ' (started by ' + wodClanEsc(WodClans.queuedBy) + ')' : '') + '… <span id="cwWait">' + wodCwWaitText() + '</span></p><button type="button" class="wod-editor-btn cw-leave">Stop searching</button>'
                : '<button type="button" class="menu-btn clan-primary cw-join" data-tier="2v2"' + (cw.war || WodMultiplayer.api.code ? ' disabled' : '') + '>Search for a 2v2 war</button>');
    } else {
        const inv = cw.partyInvite, sent = cw.partyInvitesSent || [];
        body = (inv ? '<div class="cw-party-invite"><strong>' + wodClanEsc(inv.name) + '</strong> invites you to their 2v2 party.<button type="button" class="build-btn cw-party-accept" data-from="' + wodClanEsc(inv.from) + '">Accept</button><button type="button" class="wod-editor-btn cw-party-decline" data-from="' + wodClanEsc(inv.from) + '">Decline</button></div>' : '') +
            '<p class="cw-note">' + (sent.length ? 'Invited ' + sent.map(s => wodClanEsc(s.name)).join(', ') + ': waiting for an answer.' : 'You need a teammate: press Search to pick an online clanmate for your party.') + '</p>' +
            // (alone, Search opens the list of online clanmates to invite; the search itself starts once the party is two)
            '<button type="button" class="menu-btn clan-primary cw-2v2-pick"' + (cw.war || WodMultiplayer.api.code || cw.queued ? ' disabled' : '') + '>Search for a 2v2 war</button>';
    }
    return '<section class="cw-tier' + (queued ? ' is-queued' : '') + '"><div class="cw-tier-top"><span class="clan-tier-chip clan-tier-chip--lg">2v2</span><h4>2v2 party</h4></div>' +
        '<p class="cw-tier-lead">You and a clanmate, as allies, against a party of two from another clan. Only a party of two can search.</p>' + wodCwCountHtml('2v2') + body + '</section>';
}
// ---- the teammate picker: 2v2 Search pressed without a party lists the clanmates online now, to invite one
function wodCwOpenTeammatePicker() {
    WodClans.picker = true;
    wodClanSend({ t: 'clan_mine' });                  // (who is online now)
    wodClanSend({ t: 'cw_status', watch: true });
    wodCwRenderPicker();
}
function wodCwClosePicker() {
    WodClans.picker = false;
    const dlg = document.getElementById('cwPickDlg');
    if(dlg) dlg.hidden = true;
}
function wodCwRenderPicker() {
    if(!WodClans.picker) return;
    let dlg = document.getElementById('cwPickDlg');
    if(!dlg) {
        dlg = document.createElement('div');
        dlg.id = 'cwPickDlg';
        dlg.className = 'clan-view-dlg cw-pick-dlg';
        dlg.setAttribute('role', 'dialog');
        dlg.setAttribute('aria-modal', 'true');
        dlg.setAttribute('aria-labelledby', 'cwPickTitle');
        document.body.appendChild(dlg);
    }
    const cw = WodClans.cw, party = cw.party, myId = WodMultiplayer.api.playerId || '';
    let body;
    if(party && party.members.length === 2) {
        const mate = party.members.find(m => m.playerId !== myId) || {};
        body = '<h3 id="cwPickTitle">Party ready</h3><p class="cw-pick-lead"><strong>' + wodClanEsc(mate.name || 'Your teammate') + '</strong> joined your 2v2 party.</p>' +
            '<div class="cw-pick-foot"><button type="button" class="wod-editor-btn" id="cwPickClose">Not yet</button><button type="button" class="menu-btn clan-primary" id="cwPickSearch">Search for a 2v2 war</button></div>';
    } else {
        const sent = new Set((cw.partyInvitesSent || []).map(s => s.playerId));
        const members = (WodClans.detail && WodClans.detail.memberList) || [];
        const online = members.filter(m => m.online && m.playerId !== myId), offline = members.filter(m => !m.online && m.playerId !== myId).length;
        body = '<h3 id="cwPickTitle">Pick a teammate</h3><p class="cw-pick-lead">2v2 is fought as a party of two. Invite a clanmate who is online now; when they accept, your party can search.</p>' +
            (online.length ? '<ul class="cw-mate-list">' + online.map(m => '<li><span class="clan-online is-online"></span><span class="clan-member-name">' + wodClanEsc(m.name) + '</span><span class="clan-member-stat">' + (m.warWins | 0) + ' war wins</span>' +
                (sent.has(m.playerId) ? '<span class="clan-tag">Invited · waiting</span>' : '<button type="button" class="build-btn cw-party-invite-btn" data-pid="' + wodClanEsc(m.playerId) + '">Invite</button>') + '</li>').join('') + '</ul>'
                : '<p class="clan-empty">' + (members.length ? 'None of your clanmates are online right now' + (offline ? ' (' + offline + ' offline)' : '') + '.' : 'Checking who is online…') + ' You can still fight a 1v1, or invite friends to your clan in the Clan tab.</p>') +
            '<div class="cw-pick-foot"><button type="button" class="wod-editor-btn" id="cwPickClose">Close</button></div>';
    }
    dlg.innerHTML = '<div class="clan-view-backdrop"></div><div class="clan-view-card cw-pick-card">' + body + '</div>';
    dlg.hidden = false;
    dlg.querySelector('.clan-view-backdrop').onclick = wodCwClosePicker;
    dlg.querySelector('#cwPickClose').onclick = wodCwClosePicker;
    const search = dlg.querySelector('#cwPickSearch');
    if(search) search.onclick = () => { WodClans.queuedAt = Date.now(); wodClanSend({ t: 'cw_queue', tier: '2v2' }); wodCwClosePicker(); };
    dlg.querySelectorAll('.cw-party-invite-btn').forEach(b => b.onclick = () => { b.disabled = true; wodClanSend({ t: 'cw_party_invite', playerId: b.dataset.pid }); });
}
function wodCwRenderPane() {
    wodCwRenderPicker();
    const root = document.getElementById('mpWarsRoot');
    if(!root || root.closest('[hidden]')) return;
    const mine = WodClans.mine, cw = WodClans.cw || {};
    let html = '<div class="cw-root"><header class="cw-head"><div class="cw-head-text"><h3>Clan wars</h3><p>Fight for your clan against other clans. Every war counts towards both clans\' clan-war stats and the clan-war leaderboard.</p></div>' +
        '<div class="cw-head-clan">' + (mine ? '<span class="cw-head-label">Fighting for</span>' + wodClanBadgeHtml(mine, 'md') : '') + '</div></header>';
    if(!mine) {
        html += '<section class="clan-card cw-noclan"><h3>Join a clan first</h3><p>Clan wars are fought between clans. Found a clan or join one, then come back to queue.</p><button type="button" class="menu-btn clan-primary" id="cwGoClan">Find or found a clan</button></section>';
    } else {
        if(cw.war) {
            const w = cw.war;
            html += '<section class="cw-war-found"><span class="clan-tier-chip">' + wodClanEsc(w.tier) + '</span><h3>War found</h3><div class="cw-war-sides">' + w.sides.map(s => '<div class="cw-war-side">' + wodClanEmblemSvg(s.clan && s.clan.emblem) + '<strong>' + wodClanEsc(s.clan ? s.clan.name : 'Clan') + '</strong><span>' + s.players.map(p => wodClanEsc(p.name)).join(' & ') + '</span></div>').join('<span class="cw-vs">vs</span>') + '</div>' +
                '<p>' + (WodMultiplayer.api.code ? 'In the war lobby: the war starts as soon as every player is in and the map is ready.' : 'Setting up the war lobby…') + '</p></section>';
        }
        html += '<div class="cw-tiers">' + wodCw1v1Html() + wodCw2v2Html() + '</div>';
        if(WodMultiplayer.api.code && !cw.war) html += '<p class="cw-note">Leave your current lobby to queue for a clan war.</p>';
        html += '<section class="clan-section cw-history"><h4>Your clan\'s recent wars</h4>' + wodClanHistoryHtml(WodClans.detail && WodClans.detail.history, 'No clan wars yet: queue above to fight the first.') + '</section>';
    }
    html += '<p class="cw-rules">Wars use a balanced map with no AI seats. Leaving a war gives your seat to the computer; if everyone on your side leaves, your clan loses the war.</p></div>';
    root.innerHTML = html;
    root.querySelectorAll('.cw-join').forEach(b => b.onclick = () => { WodClans.queuedAt = Date.now(); wodClanSend({ t: 'cw_queue', tier: b.dataset.tier }); });
    root.querySelectorAll('.cw-leave').forEach(b => b.onclick = () => wodClanSend({ t: 'cw_leave_queue' }));
    root.querySelectorAll('.cw-party-invite-btn').forEach(b => b.onclick = () => wodClanSend({ t: 'cw_party_invite', playerId: b.dataset.pid }));
    root.querySelectorAll('.cw-party-accept').forEach(b => b.onclick = () => wodClanSend({ t: 'cw_party_answer', from: b.dataset.from, accept: true }));
    root.querySelectorAll('.cw-party-decline').forEach(b => b.onclick = () => wodClanSend({ t: 'cw_party_answer', from: b.dataset.from, accept: false }));
    root.querySelectorAll('.cw-party-leave').forEach(b => b.onclick = () => wodClanSend({ t: 'cw_party_leave' }));
    root.querySelectorAll('.cw-2v2-pick').forEach(b => b.onclick = wodCwOpenTeammatePicker);
    const go = root.querySelector('#cwGoClan');
    if(go) go.onclick = () => wodMpSwitchHubTab('clan');
    clearInterval(WodClans.waitTimer);
    if(cw.queued) WodClans.waitTimer = setInterval(() => { const el = document.getElementById('cwWait'); if(el) el.textContent = wodCwWaitText(); else clearInterval(WodClans.waitTimer); }, 1000);
}
function wodCwWaitText() { const s = WodClans.queuedAt ? Math.floor((Date.now() - WodClans.queuedAt) / 1000) : 0; return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

// ---------------------------------------------------------------- the war lobby
function wodCwEnsureMpPanel(warId) {
    // (in another game by now: the war is called off at once rather than left waiting for this player)
    if(gameState !== 'MENU') { wodClanSend({ t: 'cw_decline', warId }); return false; }
    const panel = document.getElementById('multiplayerPanel');
    if(panel && panel.classList.contains('hidden')) showPanel('multiplayer');
    return true;
}
// The war's first player hosts: a private lobby with the war's seats and a balanced map; the relay sends the others in.
async function wodCwHostWar(m) {
    if(!wodCwEnsureMpPanel(m.war.id)) return;
    if(typeof wodMpWireLobbyUi === 'function' && !document.getElementById('mpBtnHostCreate').onclick) wodMpWireLobbyUi();
    const bal = document.getElementById('mpCfgMapBalance');
    if(bal) bal.checked = true;
    const vic = document.getElementById('mpCfgVictoryMode');
    if(vic) vic.value = 'domination';
    window._wodCwHostOpts = { warId: m.war.id, password: m.secret, name: 'Clan war · ' + m.war.sides.map(s => s.clan ? s.clan.name : 'Clan').join(' vs '), seatTypes: m.war.tier === '1v1' ? ['human', 'human', 'closed', 'closed'] : ['human', 'human', 'human', 'human'] };
    try { await document.getElementById('mpBtnHostCreate').onclick(); }
    finally { window._wodCwHostOpts = null; }
}
async function wodCwJoinWar(m) {
    if(!wodCwEnsureMpPanel(m.warId)) return;
    try {
        await WodMultiplayer.joinLobby(m.code, m.password, { seat: m.seat, playerId: wodEnsurePlayerId() });
        wodMpLobbyCount = Math.max(wodMpLobbyCount, WodMultiplayer.api.slot | 0, 1);
        wodMpRefreshMpPanelState();
        wodMpRenderLobbyList(WodMultiplayer.api.lobbies);
    } catch(e) { showNotification('Could not join the war lobby: ' + (e && e.message || e)); }
}
/** Called whenever the game lobby redraws: the clan-war banner, and (for the host) starting the war once ready. */
function wodCwSyncLobby(meta) {
    const cw = meta && meta.cw, screen = document.getElementById('mpGameLobbyScreen'), banner = document.getElementById('mpGlWarBanner');
    if(screen) screen.classList.toggle('mp-gl--clan-war', !!cw);
    if(banner) {
        banner.hidden = !cw;
        if(cw) {
            const occ = new Set(meta.occupiedSlots || []), need = cw.sides.flatMap(s => s.slots), missing = need.filter(s => !occ.has(s)).length;
            banner.innerHTML = '<span class="clan-tier-chip">' + wodClanEsc(cw.tier) + ' clan war</span>' + cw.sides.map(s => '<span class="mp-gl-war-side">' + wodClanBadgeHtml(s.clan, 'md') + '</span>').join('<span class="cw-vs">vs</span>') +
                '<span class="mp-gl-war-status">' + (missing ? 'Waiting for ' + missing + (missing === 1 ? ' player' : ' players') + '…' : 'Everyone is here: the war starts when the map is ready.') + '</span>';
        }
    }
    const api = WodMultiplayer.api;
    if(cw && api.isHost && gameState === 'MENU') { if(!WodClans.launchTimer) WodClans.launchTimer = setInterval(wodCwTryLaunch, 600); }
    else if(WodClans.launchTimer) { clearInterval(WodClans.launchTimer); WodClans.launchTimer = 0; }
}
function wodCwTryLaunch() {
    const api = WodMultiplayer.api, meta = window.wodMpRoomMeta || {}, cw = meta.cw;
    if(!cw || !api.isHost || !api.code || gameState !== 'MENU') { clearInterval(WodClans.launchTimer); WodClans.launchTimer = 0; return; }
    const occ = new Set(meta.occupiedSlots || []);
    if(!cw.sides.flatMap(s => s.slots).every(s => occ.has(s))) return;
    if(wodIsMapPreviewGenerating()) return;
    if(!wodMpCommittedIsCurrentForMeta(meta)) {
        if(WodClans.previewKick !== api.code) { WodClans.previewKick = api.code; wodMpRefreshLobbyMapPreview({ force: true }); }
        return;
    }
    if(WodClans.launching === api.code) return;
    WodClans.launching = api.code;
    setTimeout(() => { if(gameState === 'MENU' && WodClans.launching === api.code) WodClans.launching = ''; }, 15000);
    const btn = document.getElementById('mpBtnGlLaunch');
    if(btn && btn.onclick) btn.onclick();
}
/** A 2v2 war's teams are allies. */
function wodCwAlliances() {
    const cw = window.wodMpRoomMeta && window.wodMpRoomMeta.cw;
    return cw && Array.isArray(cw.alliances) && cw.alliances.length && gameData.mp && gameData.mp.enabled ? cw.alliances : null;
}
document.addEventListener('DOMContentLoaded', () => { wodClanWireRankings(); wodClanRenderProfileBadge(); });
