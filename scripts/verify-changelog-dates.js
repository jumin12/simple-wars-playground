'use strict';
// The changelog's dates. Each update is one entry, dated when it is released: no entry may be dated ahead of now (it
// would read as a version not out yet, and its date is the build the multiplayer relay holds every game to), no two
// entries share a date, and every entry has a title and at least one line. The newest date is the build stamp tests
// send the relay (scripts/lib/harness.js relayHello).
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const H = require('./lib/harness');
const list = require('vm').runInNewContext(fs.readFileSync(path.join(H.ROOT, 'js/changelog.js'), 'utf8') + '\n;WOD_CHANGELOG', {});
const AHEAD_MS = 60 * 60 * 1000;
assert(Array.isArray(list) && list.length > 100, 'the whole changelog is there');
const seen = new Map(), now = Date.now();
for(const e of list) {
    const t = Date.parse(e && e.at);
    assert(Number.isFinite(t), 'a readable date: ' + JSON.stringify(e && e.at));
    assert(typeof e.title === 'string' && e.title.trim(), 'a title for ' + e.at);
    assert(Array.isArray(e.items) && e.items.length && e.items.every(x => typeof x === 'string' && x.trim()), 'lines for ' + e.at);
    assert(!seen.has(t), 'one entry per date: "' + e.title + '" and "' + seen.get(t) + '" share ' + e.at);
    seen.set(t, e.title);
    assert(t <= now + AHEAD_MS, '"' + e.title + '" is dated ' + e.at + ', ahead of now (' + new Date(now).toISOString() + '): date an update when it is released');
}
const newest = Math.max(...seen.keys());
assert.equal(H.relayHello().build, new Date(newest).toISOString());
// the relay's copy (it deploys from server/ alone): current, or the relay would hold games to an older build
const relayCopy = JSON.parse(fs.readFileSync(path.join(H.ROOT, 'server/game-build.json'), 'utf8'));
const count = list.length + 9;
assert.deepEqual(relayCopy, { build: new Date(newest).toISOString(), version: Math.floor(count / 10) + '.' + count % 10 }, 'server/game-build.json is stale: run node scripts/stamp-assets.js');
console.log(JSON.stringify({ entries: list.length, newest: new Date(newest).toISOString(), title: seen.get(newest) }));
console.log('verify-changelog-dates: OK');
