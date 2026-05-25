const fs = require('fs');
const path = require('path');

const ART = path.join(__dirname, '..', 'skins/art');

const KEEP = {
  egypt: [
    ['egypt-options/01-ankh.svg', 'egypt1.svg'],
    ['egypt-options/02-eye-horus.svg', 'egypt2.svg'],
  ],
  macedon: [
    ['macedon-options/01-vergina-8ray.svg', 'macedon1.svg'],
    ['macedon-options/02-vergina-sun.svg', 'macedon2.svg'],
  ],
  sparta: [
    ['sparta-options/03-lambda-simple.svg', 'sparta1.svg'],
    ['sparta-options/04-lambda-circle.svg', 'sparta2.svg'],
  ],
};

function sortedOptionSvgs(folder) {
  const dir = path.join(ART, folder);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.svg') && !f.endsWith('.source.svg'))
    .sort((a, b) => {
      const na = parseInt(a.match(/^(\d+)/)?.[1] || '0', 10);
      const nb = parseInt(b.match(/^(\d+)/)?.[1] || '0', 10);
      return na - nb || a.localeCompare(b);
    });
}

function move(srcRel, destName) {
  const src = path.join(ART, srcRel);
  const dest = path.join(ART, destName);
  if (!fs.existsSync(src)) {
    console.warn('missing', srcRel);
    return false;
  }
  fs.copyFileSync(src, dest);
  console.log(`${srcRel} -> ${destName}`);
  return true;
}

// Ensure Rome/Gaul sets are complete before flattening
require('./build-civ-emblem-options.js');

// Collect Rome/Gaul renames from option folders
for (const [folder, prefix] of [['rome-options', 'rome'], ['gaul-options', 'gaul']]) {
  const files = sortedOptionSvgs(folder);
  files.forEach((file, i) => {
    KEEP[prefix] = KEEP[prefix] || [];
    KEEP[prefix].push([`${folder}/${file}`, `${prefix}${i + 1}.svg`]);
  });
}

// Write kept files to art root
for (const entries of Object.values(KEEP)) {
  for (const [src, dest] of entries) move(src, dest);
}

// Remove everything else under skins/art
for (const name of fs.readdirSync(ART)) {
  const full = path.join(ART, name);
  const keptNames = new Set(Object.values(KEEP).flat().map(([, d]) => d));
  if (keptNames.has(name)) continue;
  if (fs.statSync(full).isDirectory()) {
    fs.rmSync(full, { recursive: true, force: true });
    console.log('removed dir', name);
  } else {
    fs.unlinkSync(full);
    console.log('removed', name);
  }
}

console.log('\nFinal SVGs:');
fs.readdirSync(ART)
  .filter((f) => f.endsWith('.svg'))
  .sort()
  .forEach((f) => console.log(' ', f));
