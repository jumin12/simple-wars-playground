const fs = require('fs');
const path = require('path');

const ART = path.join(__dirname, '..', 'skins/art');
const TARGET = 512;
const PAD = 0.11;

function parseViewBox(svgText) {
  const m = svgText.match(/viewBox\s*=\s*["']([^"']+)["']/i);
  if (m) {
    const p = m[1].trim().split(/[\s,]+/).map(Number);
    if (p.length >= 4 && p.every((n) => Number.isFinite(n))) {
      return { x: p[0], y: p[1], w: Math.abs(p[2]), h: Math.abs(p[3]) };
    }
  }
  const wM = svgText.match(/\bwidth\s*=\s*["']([\d.]+)/i);
  const hM = svgText.match(/\bheight\s*=\s*["']([\d.]+)/i);
  if (wM && hM) {
    const w = parseFloat(wM[1]);
    const h = parseFloat(hM[1]);
    if (w > 0 && h > 0) return { x: 0, y: 0, w, h };
  }
  return { x: 0, y: 0, w: TARGET, h: TARGET };
}

function extractSvgOpenTag(svgText) {
  const start = svgText.search(/<svg[\s>]/i);
  if (start < 0) return '';
  const end = svgText.indexOf('>', start);
  return end < 0 ? '' : svgText.slice(start, end + 1);
}

function extractNamespaces(openTag) {
  const ns = {};
  const re = /xmlns(?::([A-Za-z0-9_-]+))?="([^"]+)"/g;
  let m;
  while ((m = re.exec(openTag))) {
    ns[m[1] || ''] = m[2];
  }
  if (!ns['']) ns[''] = 'http://www.w3.org/2000/svg';
  return ns;
}

function extractInner(svgText) {
  const start = svgText.search(/<svg[\s>]/i);
  if (start < 0) return svgText;
  const openEnd = svgText.indexOf('>', start);
  if (openEnd < 0) return svgText;
  const close = svgText.lastIndexOf('</svg>');
  if (close < 0) return svgText.slice(openEnd + 1);
  return svgText.slice(openEnd + 1, close);
}

function extractTitle(svgText) {
  const m = svgText.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : '';
}

function cleanInner(inner) {
  return inner
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?xml[^?]*\?>\s*/gi, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
    .replace(/<sodipodi:namedview[\s\S]*?\/>/gi, '')
    .replace(/<sodipodi:namedview[\s\S]*?<\/sodipodi:namedview>/gi, '')
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
    .trim();
}

function buildRootOpen(namespaces) {
  let attrs = '';
  for (const [prefix, uri] of Object.entries(namespaces)) {
    attrs += prefix ? ` xmlns:${prefix}="${uri}"` : ` xmlns="${uri}"`;
  }
  return `<svg${attrs} viewBox="0 0 ${TARGET} ${TARGET}" width="${TARGET}" height="${TARGET}">`;
}

function isAlreadyNormalized(svgText, vb) {
  if (!/viewBox\s*=\s*["']0\s+0\s+512\s+512["']/i.test(svgText)) return false;
  if (!/\bwidth\s*=\s*["']512["']/i.test(svgText)) return false;
  if (!/\bheight\s*=\s*["']512["']/i.test(svgText)) return false;
  if (/<g\s+transform="translate\([^"]+\)\s*scale\(/i.test(svgText)) return true;
  return Math.abs(vb.w - TARGET) < 0.5 && Math.abs(vb.h - TARGET) < 0.5 && Math.abs(vb.x) < 0.5 && Math.abs(vb.y) < 0.5;
}

function normalizeFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const vb = parseViewBox(raw);
  if (isAlreadyNormalized(raw, vb)) {
    console.log('skip (already 512 centered):', path.basename(filePath));
    return false;
  }

  const openTag = extractSvgOpenTag(raw);
  const namespaces = extractNamespaces(openTag);
  const title = extractTitle(raw);
  let inner = cleanInner(extractInner(raw));
  if (!inner) {
    console.log('skip (empty content):', path.basename(filePath));
    return false;
  }

  const innerSize = TARGET * (1 - 2 * PAD);
  const scale = Math.min(innerSize / vb.w, innerSize / vb.h);
  const cx = vb.x + vb.w / 2;
  const cy = vb.y + vb.h / 2;
  const tx = TARGET / 2 - cx * scale;
  const ty = TARGET / 2 - cy * scale;

  const out =
    buildRootOpen(namespaces) +
    (title ? `\n<title>${title}</title>` : '') +
    `\n<g transform="translate(${tx.toFixed(3)},${ty.toFixed(3)}) scale(${scale.toFixed(6)})">` +
    inner +
    `\n</g>\n</svg>\n`;

  fs.writeFileSync(filePath, out, 'utf8');
  console.log('normalized:', path.basename(filePath), `(${vb.w.toFixed(1)}x${vb.h.toFixed(1)} -> 512x512)`);
  return true;
}

const files = fs.readdirSync(ART).filter((f) => f.endsWith('.svg')).sort();
let count = 0;
for (const f of files) {
  if (normalizeFile(path.join(ART, f))) count += 1;
}
console.log(`\nDone: ${count} updated, ${files.length - count} unchanged`);
