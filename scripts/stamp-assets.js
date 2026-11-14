#!/usr/bin/env node
// Cache-busting for the static site: every local script, stylesheet and the map worker get `?v=<hash>`,
// where the hash is taken from the file's contents. Run after changing any game file:
//   npm run stamp           rewrite index.html (and the worker URL in js/workers.js)
//   npm run stamp:check     exit 1 if any stamp is out of date (used by npm test)
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const CHECK = process.argv.includes('--check');

function hashOf(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 10);
}

// <script src="x.js?v=..."> and <link rel="stylesheet" href="x.css?v=...">
function stampHtml(html) {
  return html.replace(/(<(?:script|link)\b[^>]*?\b(?:src|href)=")([^"?#]+\.(?:js|css))(\?v=[^"]*)?(")/g, (all, pre, rel, _old, post) => {
    if (/^(?:https?:)?\/\//.test(rel)) return all;
    const h = hashOf(rel);
    return h ? pre + rel + '?v=' + h + post : all;
  });
}

// new Worker('map-gen-worker.js?v=...')
function stampWorkerUrls(js) {
  return js.replace(/(['"])(map-gen-worker\.js)(\?v=[^'"]*)?\1/g, (all, q, rel) => {
    const h = hashOf(rel);
    return h ? q + rel + '?v=' + h + q : all;
  });
}

// The worker is stamped first: index.html loads js/workers.js, whose own hash changes with the worker URL.
const targets = [
  ['js/workers.js', stampWorkerUrls],
  ['index.html', stampHtml],
];
let stale = [];
for (const [rel, fn] of targets) {
  const file = path.join(ROOT, rel);
  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);
  if (after === before) continue;
  stale.push(rel);
  if (!CHECK) fs.writeFileSync(file, after);
}
if (CHECK) {
  if (stale.length) {
    console.error('Out-of-date cache stamps in: ' + stale.join(', ') + '. Run `npm run stamp`.');
    process.exit(1);
  }
  console.log('Cache stamps are current.');
} else {
  console.log(stale.length ? 'Stamped ' + stale.join(', ') : 'Cache stamps already current.');
}
