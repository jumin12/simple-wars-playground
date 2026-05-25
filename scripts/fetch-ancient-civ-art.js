const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const ART = path.join(ROOT, 'skins/art');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'WOD-Art-Fetch/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.setTimeout(25000, () => req.destroy(new Error('timeout')));
  });
}

function wikiPath(fileName) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}`;
}

function extractGroupContent(s, id) {
  const openRe = new RegExp(`<g\\s+id="${id}"[^>]*>`, 'i');
  const open = openRe.exec(s);
  if (!open) return null;
  let depth = 1;
  let i = open.index + open[0].length;
  while (i < s.length && depth > 0) {
    const nextOpen = s.indexOf('<g', i);
    const nextClose = s.indexOf('</g>', i);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + 2;
    } else {
      depth -= 1;
      i = nextClose + 4;
    }
  }
  return s.slice(open.index + open[0].length, i - 4);
}

function flattenInternalUse(s) {
  return s.replace(/<use\b[^>]*xlink:href="#([^"]+)"([^>]*)\/>/g, (full, id, attrs) => {
    const inner = extractGroupContent(s, id);
    if (!inner) return full;
    const transform = attrs.match(/transform="([^"]*)"/);
    const t = transform ? ` transform="${transform[1]}"` : '';
    return `<g${t}>${inner}</g>`;
  });
}

function sanitizeSvg(raw) {
  let s = String(raw || '');
  s = s.replace(/<\?xml[^?]*\?>\s*/gi, '');
  s = s.replace(/<!DOCTYPE[^>]*>\s*/gi, '');
  s = s.trim();
  if (!/^<svg[\s>]/i.test(s)) return null;
  if (/<html/i.test(s)) return null;
  if (!/xmlns=/.test(s)) s = s.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  if (!/xmlns:xlink=/.test(s) && /xlink:href/.test(s)) {
    s = s.replace(/<svg/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  }
  if (!/viewBox=/.test(s)) {
    const w = s.match(/\bwidth="([0-9.]+)/i);
    const h = s.match(/\bheight="([0-9.]+)/i);
    if (w && h) s = s.replace(/<svg/i, `<svg viewBox="0 0 ${w[1]} ${h[1]}"`);
  }
  if (/<use\b[^>]*xlink:href="#[^"]+"/.test(s)) s = flattenInternalUse(s);
  return s;
}

function wrapSvg(title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<title>${title}</title>
${body}
</svg>`;
}

function rays(n, inner, outer, fill) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i * (360 / n) * Math.PI) / 180;
    const x2 = Math.round(Math.cos(a) * outer);
    const y2 = Math.round(Math.sin(a) * outer);
    const x1 = Math.round(Math.cos(a - 0.2) * inner);
    const y1 = Math.round(Math.sin(a - 0.2) * inner);
    const x3 = Math.round(Math.cos(a + 0.2) * inner);
    const y3 = Math.round(Math.sin(a + 0.2) * inner);
    return `<polygon points="0,0 ${x1},${y1} ${x2},${y2} ${x3},${y3}" fill="${fill}"/>`;
  }).join('');
}

const GENS = {
  macedon: {
    '01-vergina-8ray': () => wrapSvg('Macedon — 8-ray sun', `<g fill="#000"><circle cx="256" cy="256" r="48"/><g transform="translate(256 256)">${rays(8, 28, 180, '#000')}</g></g>`),
    '02-vergina-sun': () => wrapSvg('Macedon — Vergina sun', `<g fill="#000"><circle cx="256" cy="256" r="50"/><g transform="translate(256 256)">${rays(16, 24, 175, '#000')}</g></g>`),
    '03-vergina-black': () => wrapSvg('Macedon — Vergina sun black', `<g fill="#000"><circle cx="256" cy="256" r="52"/><g transform="translate(256 256)">${rays(8, 32, 175, '#000')}</g></g>`),
    '04-helmet': () => wrapSvg('Macedon — crested helmet', `<g fill="none" stroke="#000" stroke-width="10" stroke-linejoin="round"><path d="M160 340 C160 220 200 140 256 120 C312 140 352 220 352 340 Z" fill="#fff"/><path d="M256 120 L256 80 M220 100 L180 60 M292 100 L332 60"/><ellipse cx="256" cy="200" rx="70" ry="45" fill="#fff"/></g>`),
    '05-laurel-wreath': () => wrapSvg('Macedon — laurel wreath', `<g fill="none" stroke="#000" stroke-width="8"><ellipse cx="256" cy="280" rx="150" ry="120"/><path d="M130 250 Q256 120 382 250"/></g>`),
    '06-phalanx-spears': () => wrapSvg('Macedon — phalanx spears', `<g stroke="#000" stroke-width="8" stroke-linecap="round"><line x1="180" y1="400" x2="180" y2="120"/><line x1="256" y1="400" x2="256" y2="100"/><line x1="332" y1="400" x2="332" y2="120"/><polygon points="256,90 240,130 272,130" fill="#000"/></g>`),
    '07-16-ray-outline': () => wrapSvg('Macedon — 16-ray outline', `<g fill="none" stroke="#000" stroke-width="6"><circle cx="256" cy="256" r="40"/>${Array.from({ length: 16 }, (_, i) => { const a = (i * 22.5 * Math.PI) / 180; return `<line x1="256" y1="256" x2="${256 + Math.round(Math.cos(a) * 190)}" y2="${256 + Math.round(Math.sin(a) * 190)}"/>`; }).join('')}</g>`),
    '08-sun-disc': () => wrapSvg('Macedon — rayed disc', `<circle cx="256" cy="256" r="160" fill="#000"/><circle cx="256" cy="256" r="70" fill="#fff"/>`),
    '09-star-burst': () => wrapSvg('Macedon — star burst', `<polygon fill="#000" points="256,60 290,190 420,190 315,270 350,400 256,320 162,400 197,270 92,190 222,190"/>`),
    '10-game-schematic': () => wrapSvg('Macedon — game schematic', `<g fill="#000"><circle cx="256" cy="256" r="44"/><g transform="translate(256 256)">${rays(8, 18, 130, '#000')}</g></g>`),
  },
  egypt: {
    '01-ankh': () => wrapSvg('Egypt — ankh', `<path fill="#000" d="M230 120 C230 80 270 80 270 120 L270 220 L310 220 L310 260 L270 260 L270 400 L230 400 L230 260 L190 260 L190 220 L230 220 Z"/>`),
    '02-eye-horus': () => wrapSvg('Egypt — Eye of Horus', `<g fill="none" stroke="#000" stroke-width="10"><path d="M256 140 C180 140 120 200 120 256 C120 312 180 372 256 372 C332 372 392 312 392 256 C392 200 332 140 256 140 Z"/><circle cx="256" cy="256" r="55" fill="#000" stroke="none"/><path d="M220 240 L256 280 L292 240"/></g>`),
    '03-ankh-eye': () => wrapSvg('Egypt — ankh and eye', `<g fill="#000"><path d="M230 120 C230 80 270 80 270 120 L270 220 L310 220 L310 260 L270 260 L270 400 L230 400 L230 260 L190 260 L190 220 L230 220 Z"/><circle cx="360" cy="250" r="70" fill="none" stroke="#000" stroke-width="10"/><circle cx="340" cy="240" r="12" fill="#000"/></g>`),
    '04-scarab': () => wrapSvg('Egypt — scarab', `<ellipse cx="256" cy="280" rx="120" ry="90" fill="#000"/><ellipse cx="256" cy="240" rx="70" ry="50" fill="#000"/>`),
    '05-pyramid': () => wrapSvg('Egypt — pyramid', `<polygon fill="#000" points="256,100 120,400 392,400"/>`),
    '06-djed': () => wrapSvg('Egypt — djed pillar', `<g fill="none" stroke="#000" stroke-width="12" stroke-linecap="round"><line x1="256" y1="120" x2="256" y2="400"/><line x1="180" y1="180" x2="332" y2="180"/><line x1="190" y1="240" x2="322" y2="240"/><line x1="200" y1="300" x2="312" y2="300"/></g>`),
    '07-winged-sun': () => wrapSvg('Egypt — winged sun disk', `<g fill="#000"><circle cx="256" cy="256" r="55"/><path d="M80 256 C120 180 120 332 80 256 Z M432 256 C392 180 392 332 432 256 Z"/></g>`),
    '08-was-scepter': () => wrapSvg('Egypt — was scepter', `<g fill="none" stroke="#000" stroke-width="10" stroke-linecap="round"><line x1="256" y1="100" x2="256" y2="400"/><path d="M256 100 C200 100 180 60 220 50 C260 40 292 70 256 100 Z"/></g>`),
    '09-scarab-outline': () => wrapSvg('Egypt — scarab outline', `<g fill="none" stroke="#000" stroke-width="10"><ellipse cx="256" cy="270" rx="130" ry="95"/><ellipse cx="256" cy="220" rx="75" ry="55"/></g>`),
    '10-game-schematic': () => wrapSvg('Egypt — game schematic', `<g fill="#000"><rect x="230" y="100" width="52" height="180" rx="26"/><circle cx="256" cy="120" r="40"/><path d="M200 300 L256 420 L312 300 Z"/></g>`),
  },
  sparta: {
    '01-shield': () => wrapSvg('Sparta — lambda shield', `<circle cx="256" cy="256" r="190" fill="none" stroke="#000" stroke-width="14"/><rect x="96" y="96" width="320" height="320" fill="none" stroke="#000" stroke-width="6" rx="8"/><text x="256" y="310" text-anchor="middle" font-size="200" font-family="serif" fill="#000">Λ</text>`),
    '02-hoplite-shield': () => wrapSvg('Sparta — hoplite shield', `<circle cx="256" cy="256" r="180" fill="#ddd" stroke="#000" stroke-width="12"/><text x="256" y="305" text-anchor="middle" font-size="170" font-family="serif" fill="#000">Λ</text>`),
    '03-lambda-simple': () => wrapSvg('Sparta — lambda', `<text x="256" y="340" text-anchor="middle" font-size="280" font-family="serif" fill="#000">Λ</text>`),
    '04-lambda-circle': () => wrapSvg('Sparta — lambda in circle', `<circle cx="256" cy="256" r="180" fill="none" stroke="#000" stroke-width="12"/><text x="256" y="320" text-anchor="middle" font-size="220" font-family="serif" fill="#000">Λ</text>`),
    '05-lambda-outline': () => wrapSvg('Sparta — lambda outline', `<g fill="none" stroke="#000" stroke-width="16" stroke-linejoin="round"><path d="M256 120 L180 400 L256 320 L332 400 Z"/></g>`),
    '06-helmet-crest': () => wrapSvg('Sparta — helmet crest', `<g fill="none" stroke="#000" stroke-width="10"><path d="M170 360 C170 220 210 150 256 130 C302 150 342 220 342 360 Z" fill="#fff"/><path d="M256 130 L256 70"/></g>`),
    '07-spear-shield': () => wrapSvg('Sparta — spear and shield', `<circle cx="220" cy="280" r="110" fill="none" stroke="#000" stroke-width="10"/><text x="220" y="310" text-anchor="middle" font-size="90" font-family="serif" fill="#000">Λ</text><line x1="340" y1="400" x2="340" y2="120" stroke="#000" stroke-width="8"/>`),
    '08-gorgon-simple': () => wrapSvg('Sparta — gorgon mask', `<circle cx="256" cy="256" r="140" fill="#000"/><circle cx="200" cy="230" r="28" fill="#fff"/><circle cx="312" cy="230" r="28" fill="#fff"/>`),
    '09-meander-ring': () => wrapSvg('Sparta — meander ring', `<rect x="96" y="96" width="320" height="320" fill="none" stroke="#000" stroke-width="12"/><text x="256" y="310" text-anchor="middle" font-size="180" font-family="serif" fill="#000">Λ</text>`),
    '10-game-schematic': () => wrapSvg('Sparta — game schematic', `<circle cx="256" cy="256" r="168" fill="none" stroke="#000" stroke-width="12"/><path d="M256 150 L200 360 L256 300 L312 360 Z" fill="#000"/>`),
  },
  athens: {
    '01-owl-coin': () => wrapSvg('Athens — owl of Athena', `<g fill="#000"><ellipse cx="256" cy="290" rx="110" ry="130"/><circle cx="220" cy="250" r="22" fill="#fff"/><circle cx="292" cy="250" r="22" fill="#fff"/><polygon points="256,160 220,210 292,210"/></g>`),
    '02-owl-minimal': () => wrapSvg('Athens — minimal owl', `<g fill="none" stroke="#000" stroke-width="12"><circle cx="230" cy="250" r="18" fill="#000"/><circle cx="282" cy="250" r="18" fill="#000"/><path d="M180 280 C180 380 332 380 332 280 C332 200 256 160 180 200 Z"/></g>`),
    '03-alpha': () => wrapSvg('Athens — alpha Α', `<text x="256" y="340" text-anchor="middle" font-size="260" font-family="serif" fill="#000">Α</text>`),
    '04-olive-wreath': () => wrapSvg('Athens — olive wreath', `<g fill="none" stroke="#000" stroke-width="8"><ellipse cx="256" cy="280" rx="150" ry="115"/><path d="M140 260 Q256 140 372 260"/></g>`),
    '05-owl-branch': () => wrapSvg('Athens — owl on branch', `<line x1="120" y1="360" x2="392" y2="360" stroke="#000" stroke-width="10"/><g fill="#000"><ellipse cx="280" cy="260" rx="80" ry="95"/><circle cx="252" cy="230" r="14" fill="#fff"/><circle cx="308" cy="230" r="14" fill="#fff"/></g>`),
    '06-helmet': () => wrapSvg('Athens — Attic helmet', `<g fill="none" stroke="#000" stroke-width="10"><path d="M160 340 C160 200 200 130 256 120 C312 130 352 200 352 340 Z" fill="#fff"/><path d="M120 260 L160 240 M392 260 L352 240"/></g>`),
    '07-owl-silhouette': () => wrapSvg('Athens — owl silhouette', `<path fill="#000" d="M256 130 C180 170 160 280 180 380 L332 380 C352 280 332 170 256 130 Z M220 250 a20 20 0 1 0 40 0 a20 20 0 1 0 -40 0 M272 250 a20 20 0 1 0 40 0 a20 20 0 1 0 -40 0"/>`),
    '08-tripod': () => wrapSvg('Athens — tripod', `<g fill="none" stroke="#000" stroke-width="10" stroke-linecap="round"><line x1="256" y1="140" x2="256" y2="380"/><line x1="256" y1="380" x2="160" y2="420"/><line x1="256" y1="380" x2="352" y2="420"/><ellipse cx="256" cy="130" rx="80" ry="25"/></g>`),
    '09-a-the': () => wrapSvg('Athens — ΑΘΕ', `<text x="256" y="300" text-anchor="middle" font-size="120" font-family="serif" fill="#000">ΑΘΕ</text>`),
    '10-game-schematic': () => wrapSvg('Athens — game schematic', `<g fill="#000"><ellipse cx="256" cy="280" rx="90" ry="105"/><circle cx="224" cy="248" r="16" fill="#fff"/><circle cx="288" cy="248" r="16" fill="#fff"/><polygon points="256,170 220,220 292,220"/></g>`),
  },
  seleucid: {
    '01-anchor': () => wrapSvg('Seleucid — anchor', `<g fill="none" stroke="#000" stroke-width="14" stroke-linecap="round"><path d="M256 120 L256 360"/><path d="M180 300 Q256 420 332 300"/><line x1="200" y1="200" x2="312" y2="200"/></g>`),
    '02-anchor-wreath': () => wrapSvg('Seleucid — anchor in wreath', `<ellipse cx="256" cy="280" rx="160" ry="130" fill="none" stroke="#000" stroke-width="10"/><g fill="none" stroke="#000" stroke-width="12" stroke-linecap="round"><path d="M256 160 L256 360"/><path d="M190 310 Q256 410 322 310"/><line x1="210" y1="230" x2="302" y2="230"/></g>`),
    '03-tripod': () => wrapSvg('Seleucid — Apollo tripod', `<g fill="none" stroke="#000" stroke-width="10"><line x1="256" y1="150" x2="256" y2="390"/><line x1="256" y1="390" x2="170" y2="430"/><line x1="256" y1="390" x2="342" y2="430"/><circle cx="256" cy="130" r="60" fill="none"/></g>`),
    '04-bull-head': () => wrapSvg('Seleucid — bull head', `<path fill="#000" d="M256 120 C180 120 120 200 120 280 C120 360 180 400 256 400 C332 400 392 360 392 280 C392 200 332 120 256 120 Z M180 200 L140 140 M332 200 L372 140"/>`),
    '05-dolphin-anchor': () => wrapSvg('Seleucid — dolphin and anchor', `<path fill="#000" d="M160 280 Q220 180 300 220 Q360 250 340 320 Q300 380 220 340 Q160 320 160 280 Z"/><g fill="none" stroke="#000" stroke-width="8"><path d="M340 180 L340 320"/><path d="M300 280 Q340 330 380 280"/></g>`),
    '06-radiate-head': () => wrapSvg('Seleucid — radiate Apollo', `<circle cx="256" cy="260" r="90" fill="#000"/>${Array.from({ length: 12 }, (_, i) => { const a = (i * 30 * Math.PI) / 180; return `<line x1="256" y1="260" x2="${256 + Math.round(Math.cos(a) * 150)}" y2="${260 + Math.round(Math.sin(a) * 150)}" stroke="#000" stroke-width="6"/>`; }).join('')}`),
    '07-double-anchor': () => wrapSvg('Seleucid — double anchor', `<g fill="none" stroke="#000" stroke-width="10" stroke-linecap="round"><path d="M200 140 L200 340"/><path d="M160 290 Q200 370 240 290"/><path d="M312 140 L312 340"/><path d="M272 290 Q312 370 352 290"/></g>`),
    '08-star-anchor': () => wrapSvg('Seleucid — star and anchor', `<polygon fill="#000" points="256,80 280,180 380,180 300,240 330,340 256,280 182,340 212,240 132,180 232,180"/>`),
    '09-anchor-bold': () => wrapSvg('Seleucid — bold anchor', `<path fill="#000" d="M240 100 h32 v220 a80 80 0 1 1 -32 0 Z M180 260 h152 v32 H180 Z"/>`),
    '10-game-schematic': () => wrapSvg('Seleucid — game schematic', `<g fill="none" stroke="#000" stroke-width="12" stroke-linecap="round"><line x1="256" y1="140" x2="256" y2="360"/><path d="M190 300 Q256 390 322 300"/><line x1="210" y1="210" x2="302" y2="210"/></g>`),
  },
  assyria: {
    '01-lamassu-profile': () => wrapSvg('Assyria — lamassu profile', `<g fill="#000"><path d="M120 400 L120 220 C120 160 180 120 240 120 L320 120 C380 120 400 180 400 240 L400 400 Z"/><path d="M240 120 C240 80 260 60 300 60 L360 60 L400 120 L360 180 L300 180 C260 180 240 160 240 120 Z"/><path d="M120 260 C80 240 60 200 80 160 L120 180 Z"/><circle cx="300" cy="90" r="20" fill="#fff"/></g>`),
    '02-winged-bull': () => wrapSvg('Assyria — winged bull', `<g fill="#000"><ellipse cx="256" cy="300" rx="140" ry="90"/><path d="M80 280 C40 220 60 160 120 140 L180 160 C140 200 130 250 160 290 Z M432 280 C472 220 452 160 392 140 L332 160 C372 200 382 250 352 290 Z"/><circle cx="210" cy="260" r="18" fill="#fff"/></g>`),
    '03-winged-disk': () => wrapSvg('Assyria — winged disk', `<g fill="#000"><circle cx="256" cy="256" r="50"/><path d="M60 256 C100 180 100 332 60 256 Z M452 256 C412 180 412 332 452 256 Z"/></g>`),
    '04-sacred-tree': () => wrapSvg('Assyria — sacred tree', `<g fill="none" stroke="#000" stroke-width="10"><line x1="256" y1="380" x2="256" y2="140"/><path d="M256 180 Q180 220 160 280 Q180 340 256 300 Q332 340 352 280 Q332 220 256 180 Z"/><circle cx="256" cy="120" r="30" fill="#000"/></g>`),
    '05-rosette': () => wrapSvg('Assyria — rosette', `<g fill="#000">${Array.from({ length: 8 }, (_, i) => { const a = (i * 45 * Math.PI) / 180; return `<circle cx="${256 + Math.round(Math.cos(a) * 80)}" cy="${256 + Math.round(Math.sin(a) * 80)}" r="45"/>`; }).join('')}<circle cx="256" cy="256" r="35" fill="#fff"/></g>`),
    '06-lion': () => wrapSvg('Assyria — lion', `<path fill="#000" d="M140 340 C140 240 200 180 280 180 C340 180 380 220 380 280 C380 340 340 380 280 380 C220 380 140 360 140 340 Z"/>`),
    '07-standard': () => wrapSvg('Assyria — standard', `<line x1="256" y1="420" x2="256" y2="100" stroke="#000" stroke-width="12"/><circle cx="256" cy="90" r="40" fill="#000"/><path d="M256 150 L320 200 L256 180 L192 200 Z" fill="#000"/>`),
    '08-bow-warrior': () => wrapSvg('Assyria — archer silhouette', `<path fill="#000" d="M220 400 L220 220 L280 180 L280 400 Z"/><path d="M280 220 Q360 180 380 240" fill="none" stroke="#000" stroke-width="10"/>`),
    '09-lamassu-face': () => wrapSvg('Assyria — lamassu face', `<g fill="#000"><circle cx="256" cy="240" r="120"/><circle cx="210" cy="220" r="22" fill="#fff"/><circle cx="302" cy="220" r="22" fill="#fff"/><path d="M120 280 L80 220 M392 280 L432 220"/></g>`),
    '10-game-schematic': () => wrapSvg('Assyria — game schematic', `<g fill="#000"><rect x="180" y="200" width="152" height="180" rx="20"/><path d="M120 280 C80 240 80 200 120 180 L180 200 Z M392 280 C432 240 432 200 392 180 L332 200 Z"/><circle cx="256" cy="160" r="35"/></g>`),
  },
  babylon: {
    '01-ishtar-stroke': () => wrapSvg('Babylon — Ishtar star stroke', `<polygon fill="none" stroke="#000" stroke-width="14" points="256,90 286,210 406,210 306,280 336,400 256,320 176,400 206,280 106,210 226,210"/>`),
    '02-ishtar-filled': () => wrapSvg('Babylon — Ishtar star filled', `<polygon fill="#000" points="256,90 286,210 406,210 306,280 336,400 256,320 176,400 206,280 106,210 226,210"/>`),
    '03-ishtar-transparent': () => wrapSvg('Babylon — Ishtar star light', `<polygon fill="none" stroke="#000" stroke-width="10" points="256,100 280,220 400,220 300,280 330,400 256,320 182,400 212,280 112,220 232,220"/>`),
    '04-dragon': () => wrapSvg('Babylon — mushhushu dragon', `<path fill="#000" d="M160 360 C140 280 180 200 256 180 C332 200 372 280 352 360 C320 340 280 320 256 300 C232 320 192 340 160 360 Z M256 140 L280 100 L232 100 Z"/>`),
    '05-lion': () => wrapSvg('Babylon — striding lion', `<path fill="#000" d="M120 340 L180 220 L260 200 L340 240 L380 340 L300 320 L240 300 L180 340 Z"/>`),
    '06-gate-pattern': () => wrapSvg('Babylon — gate brick pattern', `<g fill="#000"><rect x="96" y="96" width="320" height="320" fill="none" stroke="#000" stroke-width="8"/><rect x="120" y="160" width="80" height="80"/><rect x="312" y="160" width="80" height="80"/><rect x="216" y="256" width="80" height="80"/></g>`),
    '07-star-circle': () => wrapSvg('Babylon — star in circle', `<circle cx="256" cy="256" r="170" fill="none" stroke="#000" stroke-width="10"/><polygon fill="#000" points="256,80 280,200 400,200 300,270 340,390 256,310 172,390 212,270 112,200 232,200"/>`),
    '08-star-minimal': () => wrapSvg('Babylon — minimal 8-point star', `<polygon fill="none" stroke="#000" stroke-width="12" points="256,100 290,220 410,220 310,290 350,410 256,330 162,410 202,290 102,220 222,220"/>`),
    '09-cuneiform-wedge': () => wrapSvg('Babylon — cuneiform wedge', `<g fill="#000"><polygon points="180,140 220,140 200,400"/><polygon points="260,180 300,180 280,400"/><polygon points="340,120 380,120 360,400"/></g>`),
    '10-game-schematic': () => wrapSvg('Babylon — game schematic', `<polygon fill="#000" points="256,100 280,220 400,220 300,280 330,400 256,320 182,400 212,280 112,220 232,220"/>`),
  },
  persia: {
    '01-faravahar': () => wrapSvg('Persia — faravahar', `<g fill="#000"><circle cx="256" cy="220" r="45"/><path d="M256 265 L256 390"/><path d="M175 300 L337 300"/><path d="M110 240 C150 180 150 300 110 240 Z M402 240 C362 180 362 300 402 240 Z"/><path d="M256 110 L276 175 L256 155 L236 175 Z"/></g>`),
    '02-faravahar-neu': () => wrapSvg('Persia — faravahar Persepolis style', `<g fill="none" stroke="#000" stroke-width="8"><circle cx="256" cy="210" r="42" fill="#000" stroke="none"/><path d="M256 252 L256 380"/><path d="M170 300 L342 300"/><path d="M90 250 C140 170 140 330 90 250 Z M422 250 C372 170 372 330 422 250 Z"/><path d="M256 90 L280 160 L256 135 L232 160 Z" fill="#000" stroke="none"/></g>`),
    '03-winged-disc': () => wrapSvg('Persia — Achaemenid winged disc', `<g fill="#000"><circle cx="256" cy="256" r="55"/><path d="M70 256 C110 170 110 342 70 256 Z M442 256 C402 170 402 342 442 256 Z"/><path d="M256 130 L270 210 L256 190 L242 210 Z"/></g>`),
    '04-lion': () => wrapSvg('Persia — lion', `<path fill="#000" d="M150 360 C150 260 210 200 280 200 C340 200 380 240 380 300 C380 360 340 400 280 400 C220 400 150 380 150 360 Z M310 240 L370 200"/>`),
    '05-griffin': () => wrapSvg('Persia — griffin', `<path fill="#000" d="M180 360 C160 280 200 200 280 180 C360 200 400 280 380 360 C340 340 300 320 280 300 C260 320 220 340 180 360 Z M280 140 L300 80 L260 80 Z"/>`),
    '06-lotus': () => wrapSvg('Persia — lotus', `<g fill="#000"><ellipse cx="256" cy="300" rx="100" ry="60"/><ellipse cx="200" cy="260" rx="50" ry="80" transform="rotate(-30 200 260)"/><ellipse cx="312" cy="260" rx="50" ry="80" transform="rotate(30 312 260)"/><rect x="246" y="300" width="20" height="100"/></g>`),
    '07-spear-bearer': () => wrapSvg('Persia — spear bearer', `<g fill="#000"><rect x="230" y="180" width="52" height="200" rx="10"/><line x1="256" y1="120" x2="256" y2="400" stroke="#000" stroke-width="8"/><circle cx="256" cy="150" r="35" fill="#fff"/></g>`),
    '08-cyrus-symbol': () => wrapSvg('Persia — cylinder seal style', `<g fill="none" stroke="#000" stroke-width="10"><rect x="180" y="120" width="152" height="280" rx="76"/><circle cx="256" cy="200" r="40" fill="#000"/></g>`),
    '09-sun-lion': () => wrapSvg('Persia — lion and sun', `<circle cx="320" cy="180" r="50" fill="#000"/><path fill="#000" d="M120 360 C120 280 180 220 260 220 C320 220 360 260 360 320 L120 360 Z"/>`),
    '10-game-schematic': () => wrapSvg('Persia — game schematic', `<g fill="#000"><circle cx="256" cy="170" r="50"/><rect x="180" y="250" width="152" height="20"/><path d="M256 270 L220 400 L292 400 Z"/></g>`),
  },
  sassanid: {
    '01-derafsh-kaviani': () => wrapSvg('Sassanid — Derafsh Kaviani', `<g fill="#000"><rect x="230" y="80" width="52" height="280" rx="8"/><path d="M120 200 C180 120 180 320 120 200 Z M392 200 C332 120 332 320 392 200 Z"/><circle cx="256" cy="390" r="45"/><path d="M256 120 L276 180 L256 160 L236 180 Z"/></g>`),
    '02-crown-wings': () => wrapSvg('Sassanid — winged crown', `<g fill="#000"><path d="M180 320 L220 180 L256 240 L292 180 L332 320 Z"/><path d="M100 280 C140 220 140 340 100 280 Z M412 280 C372 220 372 340 412 280 Z"/><circle cx="256" cy="360" r="40"/></g>`),
    '03-fire-altar': () => wrapSvg('Sassanid — fire altar', `<g fill="none" stroke="#000" stroke-width="10"><rect x="196" y="280" width="120" height="100"/><path d="M220 280 L256 160 L292 280"/><path d="M256 160 Q280 120 300 140 Q260 100 256 160 Q252 100 212 140 Q236 120 256 160 Z" fill="#000" stroke="none"/></g>`),
    '04-simurgh': () => wrapSvg('Sassanid — simurgh bird', `<path fill="#000" d="M256 100 C200 140 160 220 180 300 C200 380 256 420 312 380 C332 300 312 220 256 180 C300 140 340 120 380 140 C340 100 300 80 256 100 Z"/>`),
    '05-crescent-star': () => wrapSvg('Sassanid — crescent and star', `<path fill="#000" d="M300 180 A80 80 0 1 0 300 340 A60 60 0 1 1 300 180 Z"/><polygon points="256,120 268,160 310,160 276,186 288,226 256,200 224,226 236,186 202,160 244,160" fill="#000"/>`),
    '06-orb-cross': () => wrapSvg('Sassanid — royal orb', `<circle cx="256" cy="256" r="100" fill="none" stroke="#000" stroke-width="10"/><line x1="256" y1="156" x2="256" y2="356" stroke="#000" stroke-width="10"/><line x1="156" y1="256" x2="356" y2="256" stroke="#000" stroke-width="10"/><circle cx="256" cy="256" r="30" fill="#000"/>`),
    '07-elephant': () => wrapSvg('Sassanid — war elephant', `<path fill="#000" d="M180 360 C160 300 180 240 240 220 L280 220 C340 240 360 300 340 360 Z M240 220 C240 180 260 160 280 160 C300 160 320 180 320 220"/><path d="M320 240 Q380 220 400 260" fill="none" stroke="#000" stroke-width="8"/>`),
    '08-shield-clipeus': () => wrapSvg('Sassanid — clipeus shield', `<circle cx="256" cy="256" r="160" fill="none" stroke="#000" stroke-width="12"/><circle cx="256" cy="256" r="60" fill="#000"/><path d="M256 96 L276 176 L256 156 L236 176 Z" fill="#000"/>`),
    '09-faravahar-bold': () => wrapSvg('Sassanid — bold faravahar', `<g fill="#000"><circle cx="256" cy="220" r="45"/><path d="M256 265 L256 380"/><path d="M180 300 L332 300"/><path d="M120 240 C160 180 160 300 120 240 Z M392 240 C352 180 352 300 392 240 Z"/><path d="M256 120 L276 180 L256 160 L236 180 Z"/></g>`),
    '10-game-schematic': () => wrapSvg('Sassanid — game schematic', `<g fill="#000"><rect x="220" y="140" width="72" height="200" rx="8"/><path d="M120 260 C160 200 160 320 120 260 Z M392 260 C352 200 352 320 392 260 Z"/><circle cx="256" cy="200" r="35"/></g>`),
  },
};

const CIVS = [
  { slug: 'macedon', title: 'Macedon emblem options', target: 'skins/art/macedon.svg', items: [
    { file: '01-vergina-8ray.svg', local: '01-vergina-8ray' },
    { file: '02-vergina-sun.svg', wiki: 'Vergina Sun.svg', fallback: '02-vergina-sun' },
    { file: '03-vergina-black.svg', wiki: 'Sun of Vergina black.svg', fallback: '03-vergina-black' },
    { file: '04-helmet.svg', local: '04-helmet' },
    { file: '05-laurel-wreath.svg', local: '05-laurel-wreath' },
    { file: '06-phalanx-spears.svg', local: '06-phalanx-spears' },
    { file: '07-16-ray-outline.svg', local: '07-16-ray-outline' },
    { file: '08-sun-disc.svg', local: '08-sun-disc' },
    { file: '09-star-burst.svg', local: '09-star-burst' },
    { file: '10-game-schematic.svg', local: '10-game-schematic' },
  ]},
  { slug: 'egypt', title: 'Egypt emblem options', target: 'skins/art/egypt.svg', items: [
    { file: '01-ankh.svg', wiki: 'Ankh.svg', fallback: '01-ankh' },
    { file: '02-eye-horus.svg', wiki: 'Eye of Horus bw.svg', fallback: '02-eye-horus' },
    { file: '03-ankh-eye.svg', wiki: 'Ankh and Eye of Horus.svg', fallback: '03-ankh-eye' },
    { file: '04-scarab.svg', local: '04-scarab' },
    { file: '05-pyramid.svg', local: '05-pyramid' },
    { file: '06-djed.svg', local: '06-djed' },
    { file: '07-winged-sun.svg', local: '07-winged-sun' },
    { file: '08-was-scepter.svg', local: '08-was-scepter' },
    { file: '09-scarab-outline.svg', local: '09-scarab-outline' },
    { file: '10-game-schematic.svg', local: '10-game-schematic' },
  ]},
  { slug: 'sparta', title: 'Sparta emblem options', target: 'skins/art/sparta.svg', items: [
    { file: '01-shield.svg', wiki: 'Sparta shield.svg', fallback: '01-shield' },
    { file: '02-hoplite-shield.svg', wiki: 'Spartan hoplite shield.svg', fallback: '02-hoplite-shield' },
    { file: '03-lambda-simple.svg', local: '03-lambda-simple' },
    { file: '04-lambda-circle.svg', local: '04-lambda-circle' },
    { file: '05-lambda-outline.svg', local: '05-lambda-outline' },
    { file: '06-helmet-crest.svg', local: '06-helmet-crest' },
    { file: '07-spear-shield.svg', local: '07-spear-shield' },
    { file: '08-gorgon-simple.svg', local: '08-gorgon-simple' },
    { file: '09-meander-ring.svg', local: '09-meander-ring' },
    { file: '10-game-schematic.svg', local: '10-game-schematic' },
  ]},
  { slug: 'athens', title: 'Athens emblem options', target: 'skins/art/athens.svg', items: [
    { file: '01-owl-coin.svg', local: '01-owl-coin' },
    { file: '02-owl-minimal.svg', local: '02-owl-minimal' },
    { file: '03-alpha.svg', local: '03-alpha' },
    { file: '04-olive-wreath.svg', local: '04-olive-wreath' },
    { file: '05-owl-branch.svg', local: '05-owl-branch' },
    { file: '06-helmet.svg', local: '06-helmet' },
    { file: '07-owl-silhouette.svg', local: '07-owl-silhouette' },
    { file: '08-tripod.svg', local: '08-tripod' },
    { file: '09-a-the.svg', local: '09-a-the' },
    { file: '10-game-schematic.svg', local: '10-game-schematic' },
  ]},
  { slug: 'seleucid', title: 'Seleucid emblem options', target: 'skins/art/seleucid.svg', items: [
    { file: '01-anchor.svg', local: '01-anchor' },
    { file: '02-anchor-wreath.svg', local: '02-anchor-wreath' },
    { file: '03-tripod.svg', local: '03-tripod' },
    { file: '04-bull-head.svg', local: '04-bull-head' },
    { file: '05-dolphin-anchor.svg', local: '05-dolphin-anchor' },
    { file: '06-radiate-head.svg', local: '06-radiate-head' },
    { file: '07-double-anchor.svg', local: '07-double-anchor' },
    { file: '08-star-anchor.svg', local: '08-star-anchor' },
    { file: '09-anchor-bold.svg', local: '09-anchor-bold' },
    { file: '10-game-schematic.svg', local: '10-game-schematic' },
  ]},
  { slug: 'assyria', title: 'Assyria emblem options', target: 'skins/art/assyria.svg', items: [
    { file: '01-lamassu-profile.svg', local: '01-lamassu-profile' },
    { file: '02-winged-bull.svg', local: '02-winged-bull' },
    { file: '03-winged-disk.svg', local: '03-winged-disk' },
    { file: '04-sacred-tree.svg', local: '04-sacred-tree' },
    { file: '05-rosette.svg', local: '05-rosette' },
    { file: '06-lion.svg', local: '06-lion' },
    { file: '07-standard.svg', local: '07-standard' },
    { file: '08-bow-warrior.svg', local: '08-bow-warrior' },
    { file: '09-lamassu-face.svg', local: '09-lamassu-face' },
    { file: '10-game-schematic.svg', local: '10-game-schematic' },
  ]},
  { slug: 'babylon', title: 'Babylon emblem options', target: 'skins/art/babylon.svg', items: [
    { file: '01-ishtar-stroke.svg', wiki: 'Ishtar-star-symbol-simplified.svg', fallback: '01-ishtar-stroke' },
    { file: '02-ishtar-filled.svg', wiki: 'Ishtar-star-symbol-simplified-filled.svg', fallback: '02-ishtar-filled' },
    { file: '03-ishtar-transparent.svg', wiki: 'Ishtar star symbol (simplified transparent).svg', fallback: '03-ishtar-transparent' },
    { file: '04-dragon.svg', local: '04-dragon' },
    { file: '05-lion.svg', local: '05-lion' },
    { file: '06-gate-pattern.svg', local: '06-gate-pattern' },
    { file: '07-star-circle.svg', local: '07-star-circle' },
    { file: '08-star-minimal.svg', local: '08-star-minimal' },
    { file: '09-cuneiform-wedge.svg', local: '09-cuneiform-wedge' },
    { file: '10-game-schematic.svg', local: '10-game-schematic' },
  ]},
  { slug: 'persia', title: 'Persia (Achaemenid) emblem options', target: 'skins/art/persia.svg', items: [
    { file: '01-faravahar.svg', wiki: 'Faravahar.svg', fallback: '01-faravahar' },
    { file: '02-faravahar-neu.svg', wiki: 'Faravahar neu.svg', fallback: '02-faravahar-neu' },
    { file: '03-winged-disc.svg', local: '03-winged-disc' },
    { file: '04-lion.svg', local: '04-lion' },
    { file: '05-griffin.svg', local: '05-griffin' },
    { file: '06-lotus.svg', local: '06-lotus' },
    { file: '07-spear-bearer.svg', local: '07-spear-bearer' },
    { file: '08-cyrus-symbol.svg', local: '08-cyrus-symbol' },
    { file: '09-sun-lion.svg', local: '09-sun-lion' },
    { file: '10-game-schematic.svg', local: '10-game-schematic' },
  ]},
  { slug: 'sassanid', title: 'Sassanid emblem options', target: 'skins/art/sassanid.svg', items: [
    { file: '01-derafsh-kaviani.svg', wiki: 'Derafsh Kaviani flag of the late Sassanid Empire.svg', fallback: '01-derafsh-kaviani' },
    { file: '02-crown-wings.svg', local: '02-crown-wings' },
    { file: '03-fire-altar.svg', local: '03-fire-altar' },
    { file: '04-simurgh.svg', local: '04-simurgh' },
    { file: '05-crescent-star.svg', local: '05-crescent-star' },
    { file: '06-orb-cross.svg', local: '06-orb-cross' },
    { file: '07-elephant.svg', local: '07-elephant' },
    { file: '08-shield-clipeus.svg', local: '08-shield-clipeus' },
    { file: '09-faravahar-bold.svg', local: '09-faravahar-bold' },
    { file: '10-game-schematic.svg', local: '10-game-schematic' },
  ]},
];

async function resolveWikiSvgUrl(wikiFile) {
  const title = `File:${wikiFile.replace(/ /g, '_')}`;
  const api = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&format=json`;
  const raw = await fetchUrl(api);
  const json = JSON.parse(raw);
  const pages = json.query && json.query.pages;
  if (!pages) return null;
  const page = pages[Object.keys(pages)[0]];
  const url = page.imageinfo && page.imageinfo[0] && page.imageinfo[0].url;
  return url && /\.svg(\?|$)/i.test(url) ? url : null;
}

async function downloadWiki(outPath, wikiFile) {
  try {
    let raw = null;
    const direct = await resolveWikiSvgUrl(wikiFile);
    if (direct) raw = await fetchUrl(direct);
    if (!raw) raw = await fetchUrl(wikiPath(wikiFile.replace(/ /g, '_')));
    const clean = sanitizeSvg(raw);
    if (!clean) return false;
    fs.writeFileSync(outPath, clean, 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

function buildPicker(dir, civ) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();
  const cards = files.map((file) => {
    const svg = sanitizeSvg(fs.readFileSync(path.join(dir, file), 'utf8')) || '';
    return { file, svg };
  });
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${civ.title}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #1a1a1a; color: #eee; margin: 0; padding: 1.5rem; }
    h1 { margin: 0 0 0.25rem; font-size: 1.35rem; }
    p { color: #aaa; margin: 0 0 1.25rem; max-width: 52rem; line-height: 1.45; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
    .card { background: #2a2a2a; border: 2px solid #444; border-radius: 10px; padding: 0.75rem; cursor: pointer; }
    .card:hover, .card.selected { border-color: #d4b878; }
    .thumb { background: #f5f0e6; border-radius: 6px; height: 160px; display: flex; align-items: center; justify-content: center; padding: 0.5rem; overflow: hidden; }
    .thumb svg { width: 100%; height: 100%; max-height: 140px; display: block; }
    .name { font-weight: 600; font-size: 0.85rem; word-break: break-all; }
    .pick { margin-top: 1.5rem; padding: 1rem; background: #2a2a2a; border-radius: 8px; font-family: monospace; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>${civ.title}</h1>
  <p>Embedded previews — works offline from File Explorer. Click a card, then tell the assistant the filename to set as <code>${civ.target}</code>.</p>
  <div class="grid">
${cards.map((c) => `    <div class="card" data-file="${c.file}"><div class="thumb">${c.svg}</div><div class="name">${c.file}</div></div>`).join('\n')}
  </div>
  <div class="pick" id="pick">Selected: (none)</div>
  <script>
    document.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        document.getElementById('pick').textContent = 'Selected: ' + card.dataset.file;
      });
    });
  </script>
</body>
</html>`;
  fs.writeFileSync(path.join(dir, 'pick.html'), html, 'utf8');
}

async function buildCiv(civ) {
  const dir = path.join(ART, `${civ.slug}-options`);
  fs.mkdirSync(dir, { recursive: true });
  let ok = 0;
  let fail = 0;

  for (const item of civ.items) {
    const outPath = path.join(dir, item.file);
    let written = false;
    if (item.wiki) {
      const got = await downloadWiki(outPath, item.wiki);
      if (got) { ok += 1; written = true; console.log('  wiki OK', item.file); }
      else {
        fail += 1;
        console.log('  wiki FAIL', item.file);
        const fb = item.fallback || item.local;
        const gen = fb && GENS[civ.slug] && GENS[civ.slug][fb];
        if (gen) {
          fs.writeFileSync(outPath, gen(), 'utf8');
          written = true;
          console.log('  fallback local', item.file);
        }
      }
    } else if (item.local) {
      const gen = GENS[civ.slug] && GENS[civ.slug][item.local];
      if (!gen) { console.warn('  missing gen', item.local); fail += 1; continue; }
      fs.writeFileSync(outPath, gen(), 'utf8');
      ok += 1;
      written = true;
      console.log('  local', item.file);
    }
    if (!written) continue;
    if (fs.existsSync(outPath)) {
      const clean = sanitizeSvg(fs.readFileSync(outPath, 'utf8'));
      if (clean) fs.writeFileSync(outPath, clean, 'utf8');
    }
  }

  buildPicker(dir, civ);
  const count = fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).length;
  console.log(`  => ${count} SVGs (${ok} ok, ${fail} wiki fails)`);
}

(async () => {
  for (const civ of CIVS) {
    console.log('\n===', civ.slug, '===');
    await buildCiv(civ);
  }
  console.log('\nAll done.');
})();
