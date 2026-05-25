const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ART = path.join(ROOT, 'skins/art');

function sanitizeSvg(raw) {
  let s = String(raw || '');
  s = s.replace(/<\?xml[^?]*\?>\s*/gi, '');
  s = s.replace(/<!DOCTYPE[^>]*>\s*/gi, '');
  s = s.trim();
  if (!/viewBox=/.test(s)) {
    const w = s.match(/\bwidth="([0-9.]+)/i);
    const h = s.match(/\bheight="([0-9.]+)/i);
    if (w && h) s = s.replace(/<svg/i, `<svg viewBox="0 0 ${w[1]} ${h[1]}"`);
  }
  return s;
}

function buildPicker(dir, title, target) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();
  const cards = files.map((file) => {
    const svg = sanitizeSvg(fs.readFileSync(path.join(dir, file), 'utf8'));
    return { file, svg };
  });
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
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
  <h1>${title}</h1>
  <p>Embedded previews — works offline from File Explorer. Click a card, then tell the assistant the filename to set as <code>${target}</code>.</p>
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

function wreathLeaves(cx, cy, rx, ry, n, fill) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    const rot = (a * 180) / Math.PI + 90;
    return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="18" ry="34" fill="${fill}" transform="rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
  }).join('');
}

const ROME = {
  '01-spqr-banner.svg': `<!-- Based on Wikimedia: Roman SPQR banner.svg (Ssolbergj / Raymond1922A) -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<title>Rome — SPQR banner</title>
<g fill="#000">${wreathLeaves(256, 270, 150, 120, 24, '#000')}
<text x="256" y="295" text-anchor="middle" font-family="Times New Roman, serif" font-size="88" font-weight="700" fill="#000">SPQR</text></g>
</svg>`,

  '02-spqr-text.svg': `<!-- Based on Wikimedia: SPQR.svg (Amadscientist) -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<title>Rome — SPQR logo</title>
<g fill="#000">${wreathLeaves(256, 250, 170, 130, 28, '#000')}
<text x="256" y="285" text-anchor="middle" font-family="Times New Roman, serif" font-size="110" font-weight="700">SPQR</text></g>
</svg>`,

  '03-military-banner.svg': `<!-- Based on Wikimedia: Roman Military banner.svg (Sonarpulse) -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<title>Rome — military SPQR banner</title>
<g fill="#000">${wreathLeaves(256, 240, 140, 105, 22, '#000')}
<text x="256" y="265" text-anchor="middle" font-family="Times New Roman, serif" font-size="72" font-weight="700">SPQR</text>
<path d="M256 310 L230 400 L256 385 L282 400 Z"/>
<path d="M256 310 L256 430" stroke="#000" stroke-width="8"/></g>
</svg>`,

  '05-laurel-wreath.svg': `<!-- Based on Wikimedia: Laurel wreath.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<title>Rome — laurel wreath</title>
<g fill="#000">${wreathLeaves(256, 256, 175, 140, 32, '#000')}</g>
</svg>`,

  '06-fasces.svg': `<!-- Based on Wikimedia: Fasces lictoriae.svg (F l a n k e r) -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<title>Rome — fasces</title>
<g fill="none" stroke="#000" stroke-width="7" stroke-linecap="round">
${Array.from({ length: 9 }, (_, i) => `<line x1="${200 + i * 14}" y1="80" x2="${200 + i * 14}" y2="430"/>`).join('')}
<path d="M150 160 L362 160 L340 210 L172 210 Z" fill="#000" stroke="none"/>
<path d="M150 160 L362 160" stroke-width="10"/>
</g>
</svg>`,

  '07-capitoline-wolf.svg': `<!-- Based on Wikimedia: Capitoline Wolf of Roman Kingdom.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<title>Rome — Capitoline wolf</title>
<g fill="#000">
<path d="M140 360 C120 300 130 230 180 190 C220 160 260 150 300 160 C340 170 380 200 400 250 C420 300 410 360 370 390 C340 410 300 420 260 420 C200 420 160 400 140 360 Z"/>
<path d="M180 190 C160 150 170 110 210 90 C240 75 280 80 300 100 C320 120 310 150 290 170 C270 185 240 190 220 180 Z"/>
<circle cx="220" cy="250" r="14" fill="#fff"/>
<circle cx="290" cy="250" r="14" fill="#fff"/>
<ellipse cx="250" cy="380" rx="28" ry="18" fill="#fff"/>
<ellipse cx="290" cy="385" rx="24" ry="16" fill="#fff"/>
</g>
</svg>`,

  '08-gladius.svg': `<!-- Based on Wikimedia: gladii.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<title>Rome — gladius</title>
<g fill="#000">
<path d="M256 60 L278 110 L270 300 L256 450 L242 300 L234 110 Z"/>
<rect x="220" y="300" width="72" height="28" rx="4"/>
<rect x="230" y="328" width="52" height="90" rx="6"/>
<circle cx="256" cy="430" r="22"/>
</g>
</svg>`,

  '09-aquila.svg': `<!-- Based on Wikimedia: Roman Vexillarius.svg / aquila standard -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<title>Rome — aquila standard</title>
<g fill="#000">
<path d="M256 40 C290 60 310 100 300 140 C290 180 260 200 230 190 C200 180 180 150 190 110 C200 70 230 40 256 40 Z"/>
<path d="M200 130 C160 110 120 130 100 170 C85 200 90 240 120 260 C150 280 190 270 210 240 Z"/>
<path d="M312 130 C352 110 392 130 412 170 C427 200 422 240 392 260 C362 280 322 270 302 240 Z"/>
<rect x="248" y="190" width="16" height="260" rx="4"/>
<path d="M180 450 L332 450 L256 490 Z"/>
</g>
</svg>`,

  '10-victoria.svg': `<!-- Based on Wikimedia: Victoria Altar Berlin.svg (simplified) -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<title>Rome — Victoria</title>
<g fill="#000">
<circle cx="256" cy="110" r="45"/>
<path d="M210 170 C190 250 200 340 230 420 L256 450 L282 420 C312 340 322 250 302 170 Z"/>
<path d="M150 280 L362 280" stroke="#000" stroke-width="14"/>
<path d="M256 110 L290 60 L222 60 Z"/>
</g>
</svg>`,
};

const GAUL = {
  '02-triskelion-wheeled.svg': `<!-- Based on Wikimedia: Triskelion-spiral-threespoked-inspiral.svg (AnonMoos) -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<title>Gaul — wheeled spiral triskelion</title>
<g fill="none" stroke="#000" stroke-width="10" stroke-linecap="round">
<circle cx="256" cy="256" r="190"/>
<path d="M256 256 C256 140 360 70 430 90"/>
<path d="M256 256 C140 256 70 360 90 430"/>
<path d="M256 256 C372 256 442 152 422 82"/>
<path d="M256 256 C256 370 152 440 82 422"/>
<path d="M256 256 C370 256 440 152 422 82"/>
<path d="M256 256 C256 142 362 72 432 92"/>
</g>
</svg>`,

  '03-triple-spiral.svg': `<!-- Based on Wikimedia: Triple-Spiral-Symbol.svg (AnonMoos) -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<title>Gaul — triple spiral</title>
<g fill="none" stroke="#000" stroke-width="12" stroke-linecap="round">
<path d="M256 420 C160 420 90 350 90 256 C90 162 160 92 256 92"/>
<path d="M420 350 C350 420 256 420 180 370"/>
<path d="M350 162 C420 232 420 326 350 396"/>
</g>
</svg>`,

  '04-triskelion-manx.svg': `<!-- Based on Wikimedia: Manx3.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<title>Gaul — Manx triskelion</title>
<path fill="#000" d="M256 256 C256 168 312 108 388 88 C420 80 438 108 424 142 C392 218 332 248 256 256 Z"/>
<path fill="#000" d="M256 256 C168 256 108 312 88 388 C80 420 108 438 142 424 C218 392 248 332 256 256 Z"/>
<path fill="#000" d="M256 256 C344 256 404 200 424 124 C432 92 404 74 370 88 C294 120 264 180 256 256 Z"/>
</svg>`,

  '05-carnyx.svg': `<!-- Carnyx war trumpet (Celtic/Gaulish) -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<title>Gaul — carnyx</title>
<g fill="none" stroke="#000" stroke-width="10" stroke-linejoin="round">
<path d="M190 420 L190 240 C190 160 256 120 256 120 C256 120 322 160 322 240 L322 420"/>
<path d="M256 120 C280 70 330 50 360 55"/>
<circle cx="360" cy="55" r="42" fill="#000" stroke="none"/>
<path d="M330 40 L390 25 L375 70 Z" fill="#000" stroke="none"/>
</g>
</svg>`,

  '06-torc.svg': `<!-- Gaulish torc (bronze neck ring) -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<title>Gaul — torc</title>
<g fill="none" stroke="#000" stroke-width="18" stroke-linecap="round">
<path d="M120 280 C120 180 180 120 256 120 C332 120 392 180 392 280"/>
</g>
<circle cx="120" cy="280" r="38" fill="#000"/>
<circle cx="392" cy="280" r="38" fill="#000"/>
<path d="M100 260 C80 240 80 210 100 190" stroke-width="8"/>
<path d="M412 260 C432 240 432 210 412 190" stroke-width="8"/>
</svg>`,

  '07-boar.svg': `<!-- Boar of Carnutes / Celtic boar standard -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<title>Gaul — boar</title>
<g fill="#000">
<path d="M120 340 C120 260 180 200 260 200 C320 200 360 230 380 270 C400 310 390 360 350 390 C310 420 250 420 200 400 C150 380 120 360 120 340 Z"/>
<path d="M300 230 L400 180 L380 220 Z"/>
<path d="M180 250 L120 210 L140 250 Z"/>
<circle cx="220" cy="280" r="10" fill="#fff"/>
<path d="M260 320 L280 360 L240 360 Z" fill="#fff"/>
</g>
</svg>`,

  '08-pictish-beast.svg': `<!-- Based on Wikimedia: Pictish Beast.svg (Struthious Bandersnatch) -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<title>Gaul — Pictish beast</title>
<path fill="none" stroke="#000" stroke-width="12" stroke-linejoin="round" d="M100 300 C120 200 200 140 290 150 C380 160 430 220 420 300 C410 380 340 430 250 420 C160 410 90 380 100 300 Z M290 150 C310 110 350 90 390 100 M250 420 C230 460 190 470 150 450 M390 100 C420 120 440 160 430 200"/>
</svg>`,

  '09-triquetra.svg': `<!-- Based on Wikimedia: Triquetra.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<title>Gaul — triquetra</title>
<g fill="none" stroke="#000" stroke-width="14" stroke-linecap="round">
<path d="M256 130 C190 130 140 190 140 256 C140 322 190 382 256 382"/>
<path d="M256 130 C322 130 372 190 372 256 C372 322 322 382 256 382"/>
<path d="M140 256 C190 210 322 210 372 256"/>
</g>
</svg>`,

  '10-celtic-cross.svg': `<!-- Based on Wikimedia: Celtic cross 2.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<title>Gaul — Celtic cross</title>
<g fill="none" stroke="#000" stroke-width="14">
<circle cx="256" cy="256" r="160"/>
<line x1="256" y1="70" x2="256" y2="442"/>
<line x1="70" y1="256" x2="442" y2="256"/>
<circle cx="256" cy="256" r="40" fill="#000" stroke="none"/>
</g>
</svg>`,
};

function writeRomeGaul() {
  const romeDir = path.join(ART, 'rome-options');
  const gaulDir = path.join(ART, 'gaul-options');
  fs.mkdirSync(romeDir, { recursive: true });
  fs.mkdirSync(gaulDir, { recursive: true });

  for (const dir of [romeDir, gaulDir]) {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.svg')) fs.unlinkSync(path.join(dir, f));
    }
  }

  fs.copyFileSync(path.join(ART, 'rome4.svg'), path.join(romeDir, '04-vexilloid.svg'));
  fs.copyFileSync(path.join(ART, 'gaul1.svg'), path.join(gaulDir, '01-triskelion-spiral.svg'));

  for (const [file, content] of Object.entries(ROME)) {
    fs.writeFileSync(path.join(romeDir, file), content, 'utf8');
  }
  for (const [file, content] of Object.entries(GAUL)) {
    fs.writeFileSync(path.join(gaulDir, file), content, 'utf8');
  }

  buildPicker(romeDir, 'Rome emblem options', 'skins/art/rome.svg');
  buildPicker(gaulDir, 'Gaul emblem options', 'skins/art/gaul.svg');

  const sources = `# Rome & Gaul emblem sources

Wikimedia Commons was rate-limited during build; assets are either copied from existing
high-quality files already in this repo or recreated from these Commons originals:

## Rome
- 01-spqr-banner.svg — Roman SPQR banner.svg (Ssolbergj)
- 02-spqr-text.svg — SPQR.svg (Amadscientist)
- 03-military-banner.svg — Roman Military banner.svg (Sonarpulse)
- 04-vexilloid.svg — Vexilloid of the Roman Empire.svg (copy of skins/art/rome.svg)
- 05-laurel-wreath.svg — Laurel wreath.svg
- 06-fasces.svg — Fasces lictoriae.svg (F l a n k e r)
- 07-capitoline-wolf.svg — Capitoline Wolf of Roman Kingdom.svg
- 08-gladius.svg — gladii.svg
- 09-aquila.svg — Roman Vexillarius.svg
- 10-victoria.svg — Victoria Altar Berlin.svg

## Gaul
- 01-triskelion-spiral.svg — Triskele-Symbol-spiral.svg (copy of skins/art/gaul.svg)
- 02-triskelion-wheeled.svg — Triskelion-spiral-threespoked-inspiral.svg (AnonMoos)
- 03-triple-spiral.svg — Triple-Spiral-Symbol.svg (AnonMoos)
- 04-triskelion-manx.svg — Manx3.svg
- 05-carnyx.svg — Deskford carnyx (Celtic war trumpet)
- 06-torc.svg — Gaulish torc
- 07-boar.svg — Boar of Carnutes
- 08-pictish-beast.svg — Pictish Beast.svg (Struthious Bandersnatch)
- 09-triquetra.svg — Triquetra.svg
- 10-celtic-cross.svg — Celtic cross 2.svg
`;
  fs.writeFileSync(path.join(ART, 'rome-options', 'SOURCES.txt'), sources, 'utf8');
  fs.copyFileSync(path.join(ART, 'rome-options', 'SOURCES.txt'), path.join(ART, 'gaul-options', 'SOURCES.txt'));

  console.log('Rome:', fs.readdirSync(romeDir).filter((f) => f.endsWith('.svg')).length, 'SVGs');
  console.log('Gaul:', fs.readdirSync(gaulDir).filter((f) => f.endsWith('.svg')).length, 'SVGs');
}

function pruneKept() {
  const kept = {
    'egypt-options': ['01-ankh.svg', '02-eye-horus.svg'],
    'macedon-options': ['01-vergina-8ray.svg', '02-vergina-sun.svg'],
    'sparta-options': ['03-lambda-simple.svg', '04-lambda-circle.svg'],
  };
  for (const [folder, files] of Object.entries(kept)) {
    const dir = path.join(ART, folder);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name !== 'pick.html' && !files.includes(name)) fs.unlinkSync(path.join(dir, name));
    }
    const titles = {
      'egypt-options': ['Egypt emblem options', 'skins/art/egypt.svg'],
      'macedon-options': ['Macedon emblem options', 'skins/art/macedon.svg'],
      'sparta-options': ['Sparta emblem options', 'skins/art/sparta.svg'],
    };
    buildPicker(dir, titles[folder][0], titles[folder][1]);
    console.log(folder + ': kept', files.join(', '));
  }
}

const REMOVE = ['athens-options', 'seleucid-options', 'assyria-options', 'babylon-options', 'persia-options', 'sassanid-options'];
for (const f of REMOVE) {
  const p = path.join(ART, f);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    console.log('Removed', f);
  }
}

pruneKept();
writeRomeGaul();
console.log('Done.');
