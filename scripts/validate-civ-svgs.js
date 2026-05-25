const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'skins/art');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();
let ok = true;

for (const f of files) {
  const s = fs.readFileSync(path.join(dir, f), 'utf8');
  const issues = [];
  if (!/^<svg[\s>]/i.test(s.trim())) issues.push('no svg root');
  if (!/viewBox="0 0 512 512"/i.test(s)) issues.push('missing 512 viewBox');
  if (/<sodipodi:namedview/i.test(s) && !/xmlns:sodipodi=/.test(s)) issues.push('namedview without sodipodi xmlns');
  if (/<rdf:/i.test(s) && !/xmlns:rdf=/.test(s)) issues.push('rdf without xmlns');
  if (!/<\/svg>\s*$/i.test(s.trim())) issues.push('bad closing');
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(s)) issues.push('invalid control characters');
  if (issues.length) {
    ok = false;
    console.log('FAIL', f, '-', issues.join(', '));
  } else {
    console.log('OK  ', f);
  }
}

process.exit(ok ? 0 : 1);
