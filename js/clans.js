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
    mine: null, detail: null, list: [], lbRows: [], lbSort: 'rating', lbKind: 'players', cw: { counts: null, queued: null, war: null },
    form: { mode: 'create', emblem: 'p:swords', tab: 'presets', visibility: 'public', name: '' }, queuedAt: 0, error: '', launchTimer: 0, launching: '', lastResult: null,
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
    if(opts && opts.list) wodClanSend({ t: 'clan_list', query: WodClans.searchQuery || '' });
    if(opts && opts.wars) wodClanSend({ t: 'cw_status', watch: true });
    if(opts && opts.board) wodClanSend({ t: 'clan_leaderboard', sort: WodClans.lbSort });
}
function wodClanOnMessage(m) {
    if(!m || !m.t) return;
    switch(m.t) {
        case 'clan_info':
            if(m.view) { wodClanShowView(m.clan); break; }
            wodClanSetMine(m.mine);
            WodClans.detail = m.clan && m.clan.youAreMember ? m.clan : null;
            if(m.done) {
                WodClans.error = '';
                const msg = { clan_create: 'Clan founded. Share its invite code with your friends.', clan_join: 'You joined ' + (m.mine ? m.mine.name : 'the clan') + '.', clan_leave: 'You left the clan.', clan_update: 'Clan updated.', clan_kick: 'Member removed.' }[m.done];
                if(msg) showNotification(msg);
                if(m.done === 'clan_update') WodClans.form.mode = 'create';
                if(m.done === 'clan_leave' || m.done === 'clan_join' || m.done === 'clan_create') wodClanSend({ t: 'clan_list', query: WodClans.searchQuery || '' });
            }
            if(m.notice) showNotification(m.notice);
            wodClanRenderAll();
            break;
        case 'clan_list': WodClans.list = m.clans || []; wodClanRenderPane(); break;
        case 'clan_leaderboard': WodClans.lbRows = m.rows || []; WodClans.lbSort = m.sort || WodClans.lbSort; wodClanRenderLeaderboard(); break;
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
            if(m.chat) { showNotification(m.msg || 'Message not sent.'); break; }
            WodClans.error = m.msg || 'That did not work.';
            showNotification(WodClans.error);
            wodClanRenderAll();
            break;
        case 'cw_status':
            WodClans.cw = { counts: m.counts || null, queued: m.queued || null, war: m.war || WodClans.cw.war || null };
            if(!m.queued) WodClans.queuedAt = 0; else if(!WodClans.queuedAt) WodClans.queuedAt = Date.now();
            if(!m.war && WodClans.cw.war && !WodMultiplayer.api.code) WodClans.cw.war = null;
            wodCwRenderPane();
            break;
        case 'cw_match':
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
    if(tabId === 'wars') { wodClanRefresh({ wars: true }); wodCwRenderPane(); }
    if(tabId === 'rankings') { wodClanSyncLbKind(); if(WodClans.lbKind === 'clans') wodClanRefresh({ board: true }); }
}
function wodClanRenderAll() { wodClanRenderProfileBadge(); wodClanRenderPane(); wodCwRenderPane(); }

// ---------------------------------------------------------------- Clan tab
function wodClanStatCard(label, value, note) {
    return '<div class="clan-stat"><span class="clan-stat-val">' + value + '</span><span class="clan-stat-lbl">' + label + '</span>' + (note ? '<span class="clan-stat-note">' + note + '</span>' : '') + '</div>';
}
function wodClanWinRate(w, p) { return p ? Math.round(100 * w / p) + '%' : '—'; }
function wodClanDate(t) { try { return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch(_) { return ''; } }
function wodClanHistoryHtml(history, empty) {
    if(!history || !history.length) return '<p class="clan-empty">' + empty + '</p>';
    return '<ol class="clan-history-list">' + history.map(h => '<li class="clan-war-row clan-war-row--' + h.outcome + '">' +
        '<span class="clan-war-outcome">' + (h.outcome === 'won' ? 'Won' : 'Lost') + '</span>' +
        '<span class="clan-tier-chip">' + wodClanEsc(h.tier) + '</span>' +
        '<span class="clan-war-vs">vs ' + wodClanBadgeHtml(h.opponent, 'sm') + '</span>' +
        '<span class="clan-war-players">' + wodClanEsc((h.players || []).join(', ')) + '</span>' +
        '<span class="clan-war-rating">' + (h.ratingChange >= 0 ? '+' : '') + (h.ratingChange | 0) + '</span>' +
        '<span class="clan-war-date">' + wodClanDate(h.at) + '</span></li>').join('') + '</ol>';
}
function wodClanStatsHtml(d) {
    const s = d.stats || {}, t1 = (s.byTier || {})['1v1'] || {}, t2 = (s.byTier || {})['2v2'] || {}, tot = d.totals || {};
    const streak = s.streak > 0 ? s.streak + ' won' : s.streak < 0 ? -s.streak + ' lost' : '—';
    return '<section class="clan-section"><h4>Clan stats</h4>' +
        '<div class="clan-stat-grid">' + wodClanStatCard('War rating', Math.round(s.rating || 1000)) + wodClanStatCard('Wars won', s.wins | 0) + wodClanStatCard('Wars lost', s.losses | 0) +
        wodClanStatCard('Win rate', wodClanWinRate(s.wins | 0, s.played | 0)) + wodClanStatCard('Streak', streak) + wodClanStatCard('Best streak', s.bestStreak ? s.bestStreak + ' won' : '—') + '</div>' +
        '<div class="clan-tier-grid">' +
        '<div class="clan-tier-card"><span class="clan-tier-chip">1v1</span><strong>' + (t1.wins | 0) + ' – ' + (t1.losses | 0) + '</strong><span>' + (t1.played ? t1.played + (t1.played === 1 ? ' war' : ' wars') + ' · ' + wodClanWinRate(t1.wins | 0, t1.played | 0) + ' won' : 'No 1v1 wars yet') + '</span></div>' +
        '<div class="clan-tier-card"><span class="clan-tier-chip">2v2</span><strong>' + (t2.wins | 0) + ' – ' + (t2.losses | 0) + '</strong><span>' + (t2.played ? t2.played + (t2.played === 1 ? ' war' : ' wars') + ' · ' + wodClanWinRate(t2.wins | 0, t2.played | 0) + ' won' : 'No 2v2 wars yet') + '</span></div>' +
        '<div class="clan-tier-card clan-tier-card--members"><span class="clan-tier-chip">Members</span><strong>' + formatLifetimeBig(tot.wins | 0) + ' wins</strong><span>' + formatLifetimeBig(tot.gamesPlayed | 0) + ((tot.gamesPlayed | 0) === 1 ? ' match' : ' matches') + ' · ' + formatLifetimeBig(tot.kills | 0) + ' kills in multiplayer</span></div>' +
        '</div></section>';
}
function wodClanMembersHtml(d, canKick) {
    if(!d.memberList) return '<section class="clan-section"><h4>Members (' + d.members + ')</h4><p class="clan-empty">This clan is private: only its members see who is in it.</p></section>';
    const myId = WodMultiplayer.api.playerId || '';
    return '<section class="clan-section"><h4>Members (' + d.members + ' / 30)</h4><ul class="clan-member-list">' + d.memberList.map(m =>
        '<li class="clan-member"><span class="clan-online ' + (m.online ? 'is-online' : '') + '" title="' + (m.online ? 'Online' : 'Offline') + '"></span>' +
        '<span class="clan-member-name">' + wodClanEsc(m.name) + (m.playerId === myId ? ' <em>(you)</em>' : '') + '</span>' +
        (m.role === 'leader' ? '<span class="clan-role">Leader</span>' : '') +
        '<span class="clan-member-stat" title="Clan wars won / fought">' + (m.warWins | 0) + '/' + (m.warsPlayed | 0) + ' wars</span>' +
        '<span class="clan-member-stat" title="Multiplayer wins">' + (m.wins | 0) + ' wins</span>' +
        (canKick && m.role !== 'leader' ? '<button type="button" class="wod-editor-btn clan-kick" data-pid="' + wodClanEsc(m.playerId) + '">Remove</button>' : '') + '</li>').join('') + '</ul></section>';
}
function wodClanHeroHtml(d, actions) {
    return '<header class="clan-hero"><div class="clan-hero-emblem">' + wodClanEmblemSvg(d.emblem) + '</div><div class="clan-hero-text"><h3>' + wodClanEsc(d.name) + '</h3>' +
        '<p>' + (d.visibility === 'private' ? 'Private clan · invite code only' : 'Public clan · anyone can join') + ' · ' + d.members + (d.members === 1 ? ' member' : ' members') + ' · led by ' + wodClanEsc(d.leaderName || '—') + ' · founded ' + wodClanDate(d.createdAt) + '</p>' +
        '<div class="clan-hero-pills"><span class="clan-pill clan-pill--gold">Rating ' + Math.round((d.stats || {}).rating || 1000) + '</span><span class="clan-pill">' + ((d.stats || {}).wins | 0) + ' – ' + ((d.stats || {}).losses | 0) + ' in wars</span><span class="clan-pill">' + (d.visibility === 'private' ? '🔒 Private' : 'Public') + '</span></div></div>' +
        '<div class="clan-hero-actions">' + (actions || '') + '</div></header>';
}
function wodClanHomeHtml(d) {
    const lead = d.youAreLeader;
    return '<div class="clan-home">' + wodClanHeroHtml(d, (lead ? '<button type="button" class="wod-editor-btn" id="clanEditBtn">Edit clan</button>' : '') + '<button type="button" class="wod-editor-btn clan-danger" id="clanLeaveBtn">Leave clan</button>') +
        // (only the leader holds the invite code, so only the leader brings players into a private clan)
        (lead ? '<section class="clan-invite"><div><span class="clan-invite-label">Invite code</span><code id="clanInviteCode">' + wodClanEsc(d.code || '') + '</code></div>' +
            '<div class="clan-invite-actions"><button type="button" class="wod-editor-btn" id="clanCopyCode">Copy</button><button type="button" class="wod-editor-btn" id="clanNewCode">New code</button></div>' +
            '<p>' + (d.visibility === 'private' ? 'Your clan is private: only you can invite. Give this code to the players you want; a new code stops the old one working.' : 'Players can join from the clan list, or with this code.') + '</p></section>'
            : '<p class="clan-invite-note">' + (d.visibility === 'private' ? '🔒 Private clan: only the leader, ' + wodClanEsc(d.leaderName || '') + ', can invite new members.' : 'Public clan: anyone can join from the clan list.') + '</p>') +
        '<div class="clan-home-cols"><div>' + wodClanStatsHtml(d) + '<section class="clan-section"><h4>Recent clan wars</h4>' + wodClanHistoryHtml(d.history, 'No clan wars yet. Queue for one in the Clan wars tab.') + '</section></div>' +
        '<div>' + wodClanChatHtml(d) + wodClanMembersHtml(d, lead) + '</div></div></div>';
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
function wodClanSetUnread(n) {
    WodClans.unread = Math.max(0, n | 0);
    const tab = document.getElementById('mpTabClan');
    if(!tab) return;
    let badge = tab.querySelector('.mp-tab-badge');
    if(!WodClans.unread) { if(badge) badge.remove(); return; }
    if(!badge) { badge = document.createElement('span'); badge.className = 'mp-tab-badge'; tab.appendChild(badge); }
    badge.textContent = WodClans.unread > 9 ? '9+' : String(WodClans.unread);
    badge.setAttribute('aria-label', WodClans.unread + ' unread clan messages');
}
function wodClanFormHtml(mode, d) {
    const f = WodClans.form, isEdit = mode === 'edit';
    if(isEdit && !f.editing) { f.editing = true; f.name = d.name; f.emblem = d.emblem; f.visibility = d.visibility; }
    const ids = f.tab === 'flags' ? Object.keys(WOD_CLAN_FLAGS).map(k => 'f:' + k) : Object.keys(WOD_CLAN_PRESETS).map(k => 'p:' + k);
    return '<section class="clan-card clan-form">' +
        '<h3>' + (isEdit ? 'Edit your clan' : 'Found a clan') + '</h3>' + (isEdit ? '' : '<p class="clan-card-lead">You lead the clan you found. Name it, pick its emblem, and choose who can join.</p>') +
        '<label class="clan-field"><span class="clan-field-label">Clan name</span><input type="text" id="clanNameInput" maxlength="24" placeholder="3 to 24 characters" value="' + wodClanEsc(f.name || '') + '" autocomplete="off"></label>' +
        '<div class="clan-field"><span class="clan-field-label">Emblem</span>' +
        '<div class="clan-emblem-tabs" role="tablist"><button type="button" class="mp-hub-tab' + (f.tab !== 'flags' ? ' active' : '') + '" data-etab="presets">Emblems</button><button type="button" class="mp-hub-tab' + (f.tab === 'flags' ? ' active' : '') + '" data-etab="flags">Country flags</button></div>' +
        '<div class="clan-emblem-grid' + (f.tab === 'flags' ? ' clan-emblem-grid--flags' : '') + '">' + ids.map(id => '<button type="button" class="clan-emblem-opt' + (id === f.emblem ? ' is-selected' : '') + '" data-emblem="' + id + '" title="' + wodClanEsc(wodClanEmblemLabel(id)) + '" aria-label="' + wodClanEsc(wodClanEmblemLabel(id)) + '" aria-pressed="' + (id === f.emblem) + '">' + wodClanEmblemSvg(id) + '</button>').join('') + '</div></div>' +
        '<div class="clan-field"><span class="clan-field-label">Who can join</span><div class="clan-visibility">' +
        '<button type="button" class="clan-vis-opt' + (f.visibility !== 'private' ? ' is-selected' : '') + '" data-vis="public"><strong>Public</strong><span>Listed for everyone; anyone can join.</span></button>' +
        '<button type="button" class="clan-vis-opt' + (f.visibility === 'private' ? ' is-selected' : '') + '" data-vis="private"><strong>Private</strong><span>Hidden from the list; join with the invite code.</span></button></div></div>' +
        '<div class="clan-form-foot"><div class="clan-preview">' + wodClanBadgeHtml({ name: f.name || 'Your clan', emblem: f.emblem }, 'md') + '</div>' +
        (isEdit ? '<button type="button" class="wod-editor-btn" id="clanEditCancel">Cancel</button>' : '') +
        '<button type="button" class="menu-btn clan-primary" id="clanSubmitBtn">' + (isEdit ? 'Save changes' : 'Found clan') + '</button></div>' +
        (WodClans.error ? '<p class="clan-form-error" role="alert">' + wodClanEsc(WodClans.error) + '</p>' : '') + '</section>';
}
function wodClanJoinHtml() {
    const rows = WodClans.list || [];
    return '<section class="clan-card clan-join"><h3>Join a clan</h3>' +
        '<div class="clan-code-row"><input type="text" id="clanCodeInput" maxlength="16" placeholder="Invite code, e.g. CLAN-1A2B3C4D" autocomplete="off"><button type="button" class="build-btn" id="clanCodeJoin">Join with code</button></div>' +
        '<input type="search" id="clanSearchInput" class="clan-search" placeholder="Search public clans" value="' + wodClanEsc(WodClans.searchQuery || '') + '">' +
        '<div class="clan-list">' + (rows.length ? rows.map(c => '<div class="clan-list-row">' + '<span class="clan-list-emblem">' + wodClanEmblemSvg(c.emblem) + '</span>' +
            '<span class="clan-list-main"><strong>' + wodClanEsc(c.name) + '</strong><span>' + c.members + (c.members === 1 ? ' member' : ' members') + ' · rating ' + c.rating + '</span></span>' +
            '<button type="button" class="wod-editor-btn clan-view" data-clan="' + wodClanEsc(c.id) + '">View</button><button type="button" class="build-btn clan-join-btn" data-clan="' + wodClanEsc(c.id) + '">Join</button></div>').join('')
            : '<p class="clan-empty">' + (wodClanOnline() ? 'No public clans' + (WodClans.searchQuery ? ' match that search' : ' yet: found the first one') + '.' : 'Connecting to the multiplayer server…') + '</p>') + '</div></section>';
}
function wodClanRenderPane() {
    const root = document.getElementById('mpClanRoot');
    if(!root || root.closest('[hidden]')) return;
    const d = WodClans.detail;
    const focus = document.activeElement && root.contains(document.activeElement) ? document.activeElement.id : '';
    const draft = (document.getElementById('clanChatInput') || {}).value || '';
    if(d && d.youAreMember && WodClans.form.mode === 'edit') root.innerHTML = '<div class="clan-edit-wrap">' + wodClanFormHtml('edit', d) + '</div>';
    else if(d && d.youAreMember) { WodClans.form.editing = false; root.innerHTML = wodClanHomeHtml(d); }
    else { WodClans.form.editing = false; if(WodClans.form.mode === 'edit') WodClans.form.mode = 'create'; root.innerHTML = '<div class="clan-start">' + wodClanFormHtml('create') + wodClanJoinHtml() + '</div>'; }
    wodClanWirePane(root);
    const chatInput = document.getElementById('clanChatInput');
    if(chatInput && draft) chatInput.value = draft;
    const chatList = document.getElementById('clanChatList');
    if(chatList) chatList.scrollTop = chatList.scrollHeight;
    if(focus) { const el = document.getElementById(focus); if(el) { el.focus(); if(el.setSelectionRange && el.value != null) el.setSelectionRange(el.value.length, el.value.length); } }
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
        const payload = { name: (f.name || '').trim(), emblem: f.emblem, visibility: f.visibility };
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
        if(await wodShowConfirmDialog({ title: 'Leave ' + (d ? d.name : 'clan') + '?', body: solo ? 'You are its only member, so the clan and its records will be disbanded.' : d && d.youAreLeader ? 'The longest-serving member becomes leader.' : 'You can rejoin later if the clan is public, or with its invite code.', confirmLabel: solo ? 'Disband clan' : 'Leave clan', danger: true }))
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
        if(await wodShowConfirmDialog({ title: 'Remove this member?', body: 'They leave the clan; they can only rejoin if it is public or they have the invite code.', confirmLabel: 'Remove', danger: true }))
            wodClanSend({ t: 'clan_kick', playerId: b.dataset.pid });
    });
    const codeJoin = $('clanCodeJoin'), codeInput = $('clanCodeInput');
    if(codeJoin) codeJoin.onclick = () => { const code = (codeInput.value || '').trim(); if(!code) { showNotification('Enter a clan invite code.'); return; } wodClanSend({ t: 'clan_join', code }); };
    if(codeInput) codeInput.onkeydown = e => { if(e.key === 'Enter') codeJoin.click(); };
    const search = $('clanSearchInput');
    if(search) search.oninput = () => { WodClans.searchQuery = search.value; clearTimeout(WodClans.searchTimer); WodClans.searchTimer = setTimeout(() => wodClanSend({ t: 'clan_list', query: WodClans.searchQuery }), 250); };
    root.querySelectorAll('.clan-join-btn').forEach(b => b.onclick = () => wodClanSend({ t: 'clan_join', clanId: b.dataset.clan }));
    root.querySelectorAll('.clan-view').forEach(b => b.onclick = () => wodClanSend({ t: 'clan_get', clanId: b.dataset.clan }));
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
    const canJoin = !WodClans.mine && d.visibility === 'public';
    dlg.innerHTML = '<div class="clan-view-backdrop"></div><div class="clan-view-card">' + wodClanHeroHtml(d, (canJoin ? '<button type="button" class="build-btn" id="clanViewJoin">Join clan</button>' : '') + '<button type="button" class="wod-editor-btn" id="clanViewClose">Close</button>') +
        '<div class="clan-home-cols"><div>' + wodClanStatsHtml(d) + '<section class="clan-section"><h4>Recent clan wars</h4>' + wodClanHistoryHtml(d.history, 'No clan wars yet.') + '</section></div><div>' + wodClanMembersHtml(d, false) + '</div></div></div>';
    dlg.hidden = false;
    const close = () => { dlg.hidden = true; };
    dlg.querySelector('#clanViewClose').onclick = close;
    dlg.querySelector('.clan-view-backdrop').onclick = close;
    const j = dlg.querySelector('#clanViewJoin');
    if(j) j.onclick = () => { wodClanSend({ t: 'clan_join', clanId: d.id }); close(); };
}

// ---------------------------------------------------------------- Rankings: clans
function wodClanSyncLbKind() {
    const kind = WodClans.lbKind;
    document.querySelectorAll('#mpLbKind [data-lb-kind]').forEach(b => { const on = b.dataset.lbKind === kind; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
    const players = document.getElementById('mpLbPlayersView'), clansView = document.getElementById('mpLbClansView');
    if(players) players.hidden = kind !== 'players';
    if(clansView) clansView.hidden = kind !== 'clans';
}
function wodClanRenderLeaderboard() {
    const host = document.getElementById('mpClanLeaderboardList');
    if(!host) return;
    document.querySelectorAll('#mpClanLbSort [data-clan-sort]').forEach(b => b.classList.toggle('active', b.dataset.clanSort === WodClans.lbSort));
    const rows = WodClans.lbRows || [], mineId = WodClans.mine && WodClans.mine.id;
    if(!rows.length) { host.innerHTML = '<p class="mp-hub-pane-lead">No clans yet. Found one in the Clan tab, then fight clan wars to climb this table.</p>'; return; }
    const primary = { rating: r => 'Rating ' + r.rating, wins: r => r.wins + ' wars won', members: r => r.members + ' members', memberWins: r => formatLifetimeBig(r.memberWins) + ' member wins' }[WodClans.lbSort] || (r => 'Rating ' + r.rating);
    host.innerHTML = rows.map((r, i) => '<div class="mp-lb-row clan-lb-row' + (r.id === mineId ? ' is-mine' : '') + '"><span class="mp-lb-rank">' + (i + 1) + '</span><span class="clan-lb-emblem">' + wodClanEmblemSvg(r.emblem) + '</span>' +
        '<div class="mp-lb-meta"><div class="mp-lb-name">' + wodClanEsc(r.name) + (r.visibility === 'private' ? ' <span class="clan-lock" title="Private clan">🔒</span>' : '') + (r.id === mineId ? ' <span class="mp-lb-friend-tag">Your clan</span>' : '') + '</div>' +
        '<div class="mp-lb-val"><span class="mp-lb-val-primary">' + primary(r) + '</span> · ' + r.wins + '–' + r.losses + ' in wars · 1v1 ' + ((r.byTier || {})['1v1'] || {}).wins + '–' + ((r.byTier || {})['1v1'] || {}).losses + ' · 2v2 ' + ((r.byTier || {})['2v2'] || {}).wins + '–' + ((r.byTier || {})['2v2'] || {}).losses + ' · ' + r.members + (r.members === 1 ? ' member' : ' members') + '</div>' +
        '<div class="mp-lb-status">Led by ' + wodClanEsc(r.leaderName || '—') + '</div></div>' +
        '<div class="mp-lb-actions"><button type="button" class="wod-editor-btn clan-view" data-clan="' + wodClanEsc(r.id) + '">View</button></div></div>').join('');
    host.querySelectorAll('.clan-view').forEach(b => b.onclick = () => wodClanSend({ t: 'clan_get', clanId: b.dataset.clan }));
}
function wodClanWireRankings() {
    document.querySelectorAll('#mpLbKind [data-lb-kind]').forEach(b => b.onclick = () => {
        WodClans.lbKind = b.dataset.lbKind;
        wodClanSyncLbKind();
        if(WodClans.lbKind === 'clans') wodClanRefresh({ board: true });
    });
    document.querySelectorAll('#mpClanLbSort [data-clan-sort]').forEach(b => b.onclick = () => { WodClans.lbSort = b.dataset.clanSort; wodClanRefresh({ board: true }); wodClanRenderLeaderboard(); });
}

// ---------------------------------------------------------------- Clan wars tab
const WOD_CW_TIERS = [
    { id: '1v1', title: '1v1 duel', lead: 'One member of your clan against one member of another clan.' },
    { id: '2v2', title: '2v2 squad', lead: 'Two members of your clan, allied, against two of another clan. Both of you join the 2v2 queue; a war starts when two clans each have two players waiting.' },
];
function wodCwRenderPane() {
    const root = document.getElementById('mpWarsRoot');
    if(!root || root.closest('[hidden]')) return;
    const mine = WodClans.mine, cw = WodClans.cw || {}, counts = cw.counts || {};
    let html = '<div class="cw-root"><header class="cw-head"><div class="cw-head-text"><h3>Clan wars</h3><p>Fight for your clan against other clans. Every war counts for both clans\' stats, rating and place on the clan leaderboard.</p></div>' +
        '<div class="cw-head-clan">' + (mine ? '<span class="cw-head-label">Fighting for</span>' + wodClanBadgeHtml(mine, 'md') : '') + '</div></header>';
    if(!mine) {
        html += '<section class="clan-card cw-noclan"><h3>Join a clan first</h3><p>Clan wars are fought between clans. Found a clan or join one, then come back to queue.</p><button type="button" class="menu-btn clan-primary" id="cwGoClan">Find or found a clan</button></section>';
    } else if(cw.war) {
        const w = cw.war;
        html += '<section class="cw-war-found"><span class="clan-tier-chip">' + wodClanEsc(w.tier) + '</span><h3>War found</h3><div class="cw-war-sides">' + w.sides.map(s => '<div class="cw-war-side">' + wodClanEmblemSvg(s.clan && s.clan.emblem) + '<strong>' + wodClanEsc(s.clan ? s.clan.name : 'Clan') + '</strong><span>' + s.players.map(p => wodClanEsc(p.name)).join(' & ') + '</span></div>').join('<span class="cw-vs">vs</span>') + '</div>' +
            '<p>' + (WodMultiplayer.api.code ? 'In the war lobby: the war starts as soon as every player is in and the map is ready.' : 'Setting up the war lobby…') + '</p></section>';
    }
    if(mine) {
        html += '<div class="cw-tiers">' + WOD_CW_TIERS.map(t => {
            const c = counts[t.id] || { players: 0, clans: 0 }, queued = cw.queued === t.id;
            return '<section class="cw-tier' + (queued ? ' is-queued' : '') + '"><div class="cw-tier-top"><span class="clan-tier-chip clan-tier-chip--lg">' + t.id + '</span><h4>' + t.title + '</h4></div><p class="cw-tier-lead">' + t.lead + '</p>' +
                '<div class="cw-tier-count" aria-live="polite"><strong class="cw-count-num" data-tier-count="' + t.id + '">' + (c.players | 0) + '</strong><span>' + ((c.players | 0) === 1 ? 'player' : 'players') + ' in this queue now' + ((c.players | 0) ? ' · from ' + (c.clans | 0) + ((c.clans | 0) === 1 ? ' clan' : ' clans') : '') + '</span></div>' +
                (queued ? '<p class="cw-searching"><span class="cw-pulse"></span>Searching for an opposing clan… <span id="cwWait">' + wodCwWaitText() + '</span></p><button type="button" class="wod-editor-btn cw-leave" data-tier="' + t.id + '">Leave queue</button>'
                    : '<button type="button" class="menu-btn clan-primary cw-join" data-tier="' + t.id + '"' + (cw.war || cw.queued || WodMultiplayer.api.code ? ' disabled' : '') + '>Join ' + t.id + ' queue</button>') + '</section>';
        }).join('') + '</div>';
        if(WodMultiplayer.api.code && !cw.war) html += '<p class="cw-note">Leave your current lobby to queue for a clan war.</p>';
        html += '<section class="clan-section cw-history"><h4>Your clan\'s recent wars</h4>' + wodClanHistoryHtml(WodClans.detail && WodClans.detail.history, 'No clan wars yet: queue above to fight the first.') + '</section>';
    }
    html += '<p class="cw-rules">Wars use a balanced map with no AI seats. Leaving a war gives your seat to the computer; if everyone on your side leaves, your clan loses the war.</p></div>';
    root.innerHTML = html;
    root.querySelectorAll('.cw-join').forEach(b => b.onclick = () => { WodClans.queuedAt = Date.now(); wodClanSend({ t: 'cw_queue', tier: b.dataset.tier }); });
    root.querySelectorAll('.cw-leave').forEach(b => b.onclick = () => wodClanSend({ t: 'cw_leave_queue' }));
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
