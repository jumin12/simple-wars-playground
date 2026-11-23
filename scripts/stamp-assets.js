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

// The multiplayer relay deploys from server/ alone (render.yaml rootDir), so it reads the game's build from a copy
// there: the date of the newest changelog entry and the version number the game shows for it (js/main.js). The relay
// keeps older games out of multiplayer (server/index.js), and a new copy here is also what redeploys it.
function gameBuildJson() {
  const list = require('vm').runInNewContext(fs.readFileSync(path.join(ROOT, 'js/changelog.js'), 'utf8') + '\n;WOD_CHANGELOG', {}, { timeout: 1000 });
  const times = list.map(e => Date.parse(e && e.at)).filter(Number.isFinite), n = times.length + 9;
  return JSON.stringify({ build: new Date(Math.max(...times)).toISOString(), version: Math.floor(n / 10) + '.' + n % 10 }, null, 2) + '\n';
}

// The worker is stamped first: index.html loads js/workers.js, whose own hash changes with the worker URL.
const targets = [
  ['server/game-build.json', gameBuildJson],
  ['js/workers.js', stampWorkerUrls],
  ['index.html', stampHtml],
];
let stale = [];
for (const [rel, fn] of targets) {
  const file = path.join(ROOT, rel);
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const after = fn(before);
  if (after === before || after.replace(/\r\n/g, '\n') === before.replace(/\r\n/g, '\n')) continue;
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
