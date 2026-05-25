const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const ART = path.join(ROOT, 'skins/art');

function fetchText(url, retries = 4) {
  return new Promise((resolve, reject) => {
    const attempt = (left) => {
      const req = https.get(url, { headers: { 'User-Agent': 'WOD-Art-Fetch/1.0' } }, (res) => {
        if (res.statusCode === 429 && left > 0) {
          res.resume();
          setTimeout(() => attempt(left - 1), 8000 * (5 - left));
          return;
        }
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchText(res.headers.location, left).then(resolve).catch(reject);
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      });
      req.on('error', reject);
      req.setTimeout(45000, () => req.destroy(new Error('timeout')));
    };
    attempt(retries);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

const GENS = {
  rome: {
    '01-spqr-banner': () => wrapSvg('Rome — SPQR banner', `<g fill="#000"><ellipse cx="256" cy="300" rx="150" ry="120" fill="none" stroke="#000" stroke-width="8"/><text x="256" y="320" text-anchor="middle" font-size="72" font-family="serif" font-weight="700">SPQR</text></g>`),
    '02-spqr-text': () => wrapSvg('Rome — SPQR', `<text x="256" y="300" text-anchor="middle" font-size="120" font-family="serif" font-weight="700" fill="#000">SPQR</text>`),
    '03-military-banner': () => wrapSvg('Rome — military SPQR', `<g fill="#000"><text x="256" y="280" text-anchor="middle" font-size="64" font-family="serif">SPQR</text><path d="M200 320 L256 380 L312 320 Z"/></g>`),
    '04-vexilloid': () => wrapSvg('Rome — vexilloid', `<g fill="#000"><path d="M256 80 L276 160 L256 140 L236 160 Z"/><rect x="220" y="160" width="72" height="140" rx="4"/><text x="256" y="250" text-anchor="middle" font-size="36" font-family="serif" fill="#fff">SPQR</text><line x1="256" y1="300" x2="256" y2="420" stroke="#000" stroke-width="10"/></g>`),
    '05-laurel-wreath': () => wrapSvg('Rome — laurel wreath', `<g fill="none" stroke="#000" stroke-width="8"><ellipse cx="256" cy="280" rx="150" ry="115"/><path d="M130 260 Q256 130 382 260"/></g>`),
    '06-fasces': () => wrapSvg('Rome — fasces', `<g fill="none" stroke="#000" stroke-width="8"><line x1="220" y1="120" x2="220" y2="400"/><line x1="256" y1="100" x2="256" y2="400"/><line x1="292" y1="120" x2="292" y2="400"/><path d="M180 180 L332 180 L310 220 L202 220 Z" fill="#000" stroke="none"/></g>`),
    '07-capitoline-wolf': () => wrapSvg('Rome — Capitoline wolf', `<g fill="#000"><path d="M180 360 C160 280 200 200 280 180 C360 200 400 280 380 360 C340 340 300 320 280 300 C260 320 220 340 180 360 Z"/><circle cx="220" cy="240" r="12" fill="#fff"/><circle cx="292" cy="240" r="12" fill="#fff"/></g>`),
    '08-gladius': () => wrapSvg('Rome — gladius', `<path fill="#000" d="M256 80 L280 120 L270 360 L256 420 L242 360 L232 120 Z"/>`),
    '09-aquila': () => wrapSvg('Rome — aquila eagle', `<g fill="#000"><path d="M256 100 C200 140 160 220 180 300 C200 380 256 420 312 380 C332 300 312 220 256 180 C300 140 340 120 380 140 C340 100 300 80 256 100 Z"/></g>`),
    '10-victoria': () => wrapSvg('Rome — Victoria', `<g fill="#000"><circle cx="256" cy="120" r="40"/><path d="M220 180 L256 400 L292 180 Z"/><path d="M160 280 L352 280" stroke="#000" stroke-width="12"/></g>`),
  },
  gaul: {
    '01-triskelion-spiral': () => wrapSvg('Gaul — spiral triskelion', `<g fill="none" stroke="#000" stroke-width="14" stroke-linecap="round"><path d="M256 256 C256 160 340 100 420 120"/><path d="M256 256 C160 256 100 340 120 420"/><path d="M256 256 C352 256 412 172 392 92"/></g>`),
    '02-triskelion-wheeled': () => wrapSvg('Gaul — wheeled triskelion', `<circle cx="256" cy="256" r="170" fill="none" stroke="#000" stroke-width="10"/><g fill="none" stroke="#000" stroke-width="12"><path d="M256 256 L256 120"/><path d="M256 256 L138 324"/><path d="M256 256 L374 324"/></g>`),
    '03-triple-spiral': () => wrapSvg('Gaul — triple spiral', `<g fill="none" stroke="#000" stroke-width="10"><path d="M256 380 C180 380 120 320 120 256 C120 192 180 132 256 132"/><path d="M380 320 C320 380 256 380 200 340"/><path d="M340 180 C380 240 380 320 320 360"/></g>`),
    '04-triskelion-manx': () => wrapSvg('Gaul — Manx triskelion', `<g fill="#000"><path d="M256 256 C256 168 312 108 388 88 C420 80 438 108 424 142 C392 218 332 248 256 256 Z"/><path d="M256 256 C168 256 108 312 88 388 C80 420 108 438 142 424 C218 392 248 332 256 256 Z"/><path d="M256 256 C344 256 404 200 424 124 C432 92 404 74 370 88 C294 120 264 180 256 256 Z"/></g>`),
    '05-carnyx': () => wrapSvg('Gaul — carnyx', `<g fill="none" stroke="#000" stroke-width="10" stroke-linecap="round"><path d="M180 400 L180 220 Q180 140 256 120 Q332 140 332 220 L332 400"/><path d="M256 120 Q280 80 320 60"/><circle cx="320" cy="60" r="35" fill="#000" stroke="none"/></g>`),
    '06-torc': () => wrapSvg('Gaul — torc', `<ellipse cx="256" cy="280" rx="160" ry="100" fill="none" stroke="#000" stroke-width="16"/><circle cx="120" cy="280" r="35" fill="#000"/><circle cx="392" cy="280" r="35" fill="#000"/>`),
    '07-boar': () => wrapSvg('Gaul — boar', `<path fill="#000" d="M140 340 C140 260 200 200 280 200 C340 200 380 240 380 300 C380 360 340 400 280 400 C220 400 140 380 140 340 Z M300 240 L380 200"/>`),
    '08-pictish-beast': () => wrapSvg('Gaul — Pictish beast', `<path fill="none" stroke="#000" stroke-width="12" d="M120 300 C160 200 240 160 320 180 C380 200 400 260 360 320 C320 380 240 400 180 360 C140 340 120 320 120 300 Z"/>`),
    '09-triquetra': () => wrapSvg('Gaul — triquetra', `<g fill="none" stroke="#000" stroke-width="12"><path d="M256 140 C200 140 160 200 160 256 C160 312 200 372 256 372"/><path d="M256 140 C312 140 352 200 352 256 C352 312 312 372 256 372"/><path d="M160 256 C200 220 312 220 352 256"/></g>`),
    '10-celtic-cross': () => wrapSvg('Gaul — Celtic cross', `<g fill="none" stroke="#000" stroke-width="14"><circle cx="256" cy="256" r="150"/><line x1="256" y1="80" x2="256" y2="432"/><line x1="80" y1="256" x2="432" y2="256"/></g>`),
  },
};

const CIVS = [
  {
    slug: 'egypt',
    title: 'Egypt emblem options',
    target: 'skins/art/egypt.svg',
    keepOnly: ['01-ankh.svg', '02-eye-horus.svg'],
    items: [
      { file: '01-ankh.svg', wiki: 'Ankh.svg', fallback: null, keep: true },
      { file: '02-eye-horus.svg', wiki: 'Eye of Horus bw.svg', fallback: null, keep: true },
    ],
  },
  {
    slug: 'macedon',
    title: 'Macedon emblem options',
    target: 'skins/art/macedon.svg',
    keepOnly: ['01-vergina-8ray.svg', '02-vergina-sun.svg'],
    items: [
      { file: '01-vergina-8ray.svg', local: '01-vergina-8ray', keep: true },
      { file: '02-vergina-sun.svg', wiki: 'Vergina Sun.svg', fallback: '02-vergina-sun', keep: true },
    ],
  },
  {
    slug: 'sparta',
    title: 'Sparta emblem options',
    target: 'skins/art/sparta.svg',
    keepOnly: ['03-lambda-simple.svg', '04-lambda-circle.svg'],
    items: [
      { file: '03-lambda-simple.svg', local: '03-lambda-simple', keep: true },
      { file: '04-lambda-circle.svg', local: '04-lambda-circle', keep: true },
    ],
  },
  {
    slug: 'rome',
    title: 'Rome emblem options',
    target: 'skins/art/rome.svg',
    items: [
      { file: '01-spqr-banner.svg', wiki: 'Roman SPQR banner.svg', fallback: '01-spqr-banner' },
      { file: '02-spqr-text.svg', wiki: 'SPQR.svg', fallback: '02-spqr-text' },
      { file: '03-military-banner.svg', wiki: 'Roman Military banner.svg', fallback: '03-military-banner' },
      { file: '04-vexilloid.svg', wiki: 'Vexilloid of the Roman Empire.svg', fallback: '04-vexilloid' },
      { file: '05-laurel-wreath.svg', wiki: 'Laurel wreath.svg', fallback: '05-laurel-wreath' },
      { file: '06-fasces.svg', wiki: 'Fasces lictoriae.svg', fallback: '06-fasces' },
      { file: '07-capitoline-wolf.svg', wiki: 'Capitoline Wolf of Roman Kingdom.svg', fallback: '07-capitoline-wolf' },
      { file: '08-gladius.svg', wiki: 'gladii.svg', fallback: '08-gladius' },
      { file: '09-aquila.svg', wiki: 'Roman Vexillarius.svg', fallback: '09-aquila' },
      { file: '10-victoria.svg', wiki: 'Victoria Altar Berlin.svg', fallback: '10-victoria' },
    ],
  },
  {
    slug: 'gaul',
    title: 'Gaul emblem options',
    target: 'skins/art/gaul.svg',
    items: [
      { file: '01-triskelion-spiral.svg', wiki: 'Triskele-Symbol-spiral.svg', fallback: '01-triskelion-spiral' },
      { file: '02-triskelion-wheeled.svg', wiki: 'Triskelion-spiral-threespoked-inspiral.svg', fallback: '02-triskelion-wheeled' },
      { file: '03-triple-spiral.svg', wiki: 'Triple-Spiral-Symbol.svg', fallback: '03-triple-spiral' },
      { file: '04-triskelion-manx.svg', wiki: 'Manx3.svg', fallback: '04-triskelion-manx' },
      { file: '05-carnyx.svg', wiki: 'Carnyx.svg', fallback: '05-carnyx' },
      { file: '06-torc.svg', wiki: 'Torque.svg', fallback: '06-torc' },
      { file: '07-boar.svg', wiki: 'Boar.svg', fallback: '07-boar' },
      { file: '08-pictish-beast.svg', wiki: 'Pictish Beast.svg', fallback: '08-pictish-beast' },
      { file: '09-triquetra.svg', wiki: 'Triquetra.svg', fallback: '09-triquetra' },
      { file: '10-celtic-cross.svg', wiki: 'Celtic cross 2.svg', fallback: '10-celtic-cross' },
    ],
  },
];

// Minimal gens for kept macedon/sparta (wiki/local copies preserved on disk)
GENS.macedon = {
  '01-vergina-8ray': () => wrapSvg('Macedon — 8-ray sun', `<g fill="#000"><circle cx="256" cy="256" r="48"/><g transform="translate(256 256)">${Array.from({ length: 8 }, (_, i) => { const a = (i * 45 * Math.PI) / 180; return `<polygon points="0,0 ${Math.round(Math.cos(a - 0.2) * 28)},${Math.round(Math.sin(a - 0.2) * 28)} ${Math.round(Math.cos(a) * 180)},${Math.round(Math.sin(a) * 180)} ${Math.round(Math.cos(a + 0.2) * 28)},${Math.round(Math.sin(a + 0.2) * 28)}" fill="#000"/>`; }).join('')}</g></g>`),
  '02-vergina-sun': () => wrapSvg('Macedon — Vergina sun', `<g fill="#000"><circle cx="256" cy="256" r="50"/><g transform="translate(256 256)">${Array.from({ length: 16 }, (_, i) => { const a = (i * 22.5 * Math.PI) / 180; return `<polygon points="0,0 ${Math.round(Math.cos(a - 0.15) * 24)},${Math.round(Math.sin(a - 0.15) * 24)} ${Math.round(Math.cos(a) * 175)},${Math.round(Math.sin(a) * 175)} ${Math.round(Math.cos(a + 0.15) * 24)},${Math.round(Math.sin(a + 0.15) * 24)}" fill="#000"/>`; }).join('')}</g></g>`),
};
GENS.sparta = {
  '03-lambda-simple': () => wrapSvg('Sparta — lambda', `<text x="256" y="340" text-anchor="middle" font-size="280" font-family="serif" fill="#000">Λ</text>`),
  '04-lambda-circle': () => wrapSvg('Sparta — lambda in circle', `<circle cx="256" cy="256" r="180" fill="none" stroke="#000" stroke-width="12"/><text x="256" y="320" text-anchor="middle" font-size="220" font-family="serif" fill="#000">Λ</text>`),
};

const REMOVE_FOLDERS = [
  'athens-options', 'seleucid-options', 'assyria-options', 'babylon-options',
  'persia-options', 'sassanid-options',
];

async function resolveWikiSvgUrl(wikiFile) {
  await sleep(2000);
  const title = `File:${wikiFile.replace(/ /g, '_')}`;
  const api = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&format=json`;
  const raw = await fetchText(api);
  if (/too many requests/i.test(raw)) return null;
  const json = JSON.parse(raw);
  const pages = json.query && json.query.pages;
  if (!pages) return null;
  const page = pages[Object.keys(pages)[0]];
  if (page.missing) return null;
  const url = page.imageinfo && page.imageinfo[0] && page.imageinfo[0].url;
  return url && /\.svg(\?|$)/i.test(url) ? url : null;
}

async function downloadWiki(outPath, wikiFile) {
  try {
    let raw = null;
    const direct = await resolveWikiSvgUrl(wikiFile);
    if (direct) {
      await sleep(3000);
      raw = await fetchText(direct);
    }
    if (!raw || !/^<svg/i.test(raw.trim())) {
      const alt = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(wikiFile.replace(/ /g, '_'))}`;
      raw = await fetchText(alt);
    }
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

function pruneDir(dir, keepOnly) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'pick.html') continue;
    if (keepOnly && !keepOnly.includes(name)) {
      fs.unlinkSync(path.join(dir, name));
    }
  }
}

async function buildCiv(civ) {
  const dir = path.join(ART, `${civ.slug}-options`);
  fs.mkdirSync(dir, { recursive: true });

  if (civ.keepOnly) {
    pruneDir(dir, civ.keepOnly);
    buildPicker(dir, civ);
    console.log(`  kept ${civ.keepOnly.length} files`);
    return;
  }

  // Full rebuild for rome/gaul
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith('.svg')) fs.unlinkSync(path.join(dir, name));
  }

  let ok = 0;
  let fail = 0;

  for (const item of civ.items) {
    const outPath = path.join(dir, item.file);
    let written = false;

    if (item.wiki) {
      const got = await downloadWiki(outPath, item.wiki);
      if (got) {
        ok += 1;
        written = true;
        console.log('  wiki OK', item.file, '<-', item.wiki);
      } else {
        fail += 1;
        console.log('  wiki FAIL', item.file);
        const fb = item.fallback;
        const gen = fb && GENS[civ.slug] && GENS[civ.slug][fb];
        if (gen) {
          fs.writeFileSync(outPath, gen(), 'utf8');
          written = true;
          console.log('  fallback local', item.file);
        }
      }
    } else if (item.local) {
      const gen = GENS[civ.slug] && GENS[civ.slug][item.local];
      if (gen) {
        fs.writeFileSync(outPath, gen(), 'utf8');
        ok += 1;
        written = true;
        console.log('  local', item.file);
      }
    }

    if (written && fs.existsSync(outPath)) {
      const clean = sanitizeSvg(fs.readFileSync(outPath, 'utf8'));
      if (clean) fs.writeFileSync(outPath, clean, 'utf8');
    }
  }

  buildPicker(dir, civ);
  const count = fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).length;
  console.log(`  => ${count} SVGs (${ok} ok, ${fail} wiki fails)`);
}

(async () => {
  for (const folder of REMOVE_FOLDERS) {
    const p = path.join(ART, folder);
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
      console.log('Removed', folder);
    }
  }

  for (const civ of CIVS) {
    console.log('\n===', civ.slug, '===');
    await buildCiv(civ);
  }
  console.log('\nAll done.');
})();
