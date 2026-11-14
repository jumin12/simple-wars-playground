#!/usr/bin/env node
'use strict';
/**
 * Run a tier of the test manifest (scripts/tests.json) with a concurrency limit and per-test timeout.
 *
 *   node scripts/run-tests.js [tier|test ...] [-j N] [--timeout SEC] [--root DIR] [--logs DIR] [--list]
 *   npm test / npm run test:all / test:ui / test:mp / test:game / test:ai
 *
 *   tier         a tier from tests.json, or "all" (every tier except those in all.excludeTiers); default "fast"
 *   test         a test name from tests.json (several may be given, mixed with tiers)
 *   -j N         run N tests at once (default: a third of the CPU cores, at most 10)
 *   --timeout S  override every test's timeout (seconds)
 *   --root DIR   serve this game copy over the playground (sets SW_EXTRA_ROOTS, see scripts/lib/harness.js)
 *   --logs DIR   where logs go (default output/test-logs, or output/test-logs-<root name> with --root)
 *   --list       print the selected tests and exit
 *
 * Each test's output goes to <logs>/<name>.log; a summary table is printed and saved as <logs>/summary.json.
 * Exits 1 if any test failed or timed out. Tests write their artifacts under output/, so do not run two
 * runners over the same tests at once.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'tests.json'), 'utf8'));
let LOGS = path.join(ROOT, 'output', 'test-logs');

function parseArgs(argv) {
  const opts = { selectors: [], jobs: Math.max(1, Math.min(10, Math.floor(os.cpus().length / 3))), timeout: null, root: null, list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-j' || a === '--jobs' || a === '--concurrency') opts.jobs = Math.max(1, parseInt(argv[++i], 10) || 1);
    else if (a === '--timeout') opts.timeout = parseFloat(argv[++i]);
    else if (a === '--root') { opts.root = argv[++i]; LOGS = path.join(ROOT, 'output', 'test-logs-' + path.basename(path.resolve(opts.root))); }
    else if (a === '--logs') opts.logs = argv[++i];
    else if (a === '--list') opts.list = true;
    else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
    else opts.selectors.push(a);
  }
  if (!opts.selectors.length) opts.selectors.push('fast');
  if (opts.logs) LOGS = path.resolve(opts.logs);
  return opts;
}

function select(selectors) {
  const names = new Set();
  const excluded = new Set((manifest.all && manifest.all.excludeTiers) || []);
  for (const sel of selectors) {
    const entries = Object.entries(manifest.tests);
    if (sel === 'all') entries.filter(([, t]) => !t.tiers.some(tier => excluded.has(tier))).forEach(([n]) => names.add(n));
    else if (manifest.tiers[sel]) entries.filter(([, t]) => t.tiers.includes(sel)).forEach(([n]) => names.add(n));
    else if (manifest.tests[sel]) names.add(sel);
    else { console.error(`Unknown tier or test "${sel}". Tiers: all, ${Object.keys(manifest.tiers).join(', ')}`); process.exit(2); }
  }
  return [...names];
}

function killTree(child) {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else try { process.kill(-child.pid, 'SIGKILL'); } catch (_) { child.kill('SIGKILL'); }
}

function lastLines(text, n) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(-n).join(' | ');
}

function runOne(name, opts, running) {
  const test = manifest.tests[name];
  const script = path.join(__dirname, test.script || name + '.js');
  if (!fs.existsSync(script)) return Promise.resolve({ name, status: 'MISSING', code: null, seconds: 0, note: 'no such script: ' + path.relative(ROOT, script) + ' (remove it from tests.json)' });
  const timeoutSec = opts.timeout || test.timeout || manifest.defaultTimeout || 600;
  const env = { ...process.env, SW_TEST_RUNNER: '1' };
  if (opts.root) env.SW_EXTRA_ROOTS = [path.resolve(opts.root), env.SW_EXTRA_ROOTS].filter(Boolean).join(path.delimiter);
  const log = fs.createWriteStream(path.join(LOGS, name + '.log'));
  const started = Date.now();
  return new Promise(resolve => {
    const child = spawn(process.execPath, [script, ...(test.args || [])], { cwd: ROOT, env, windowsHide: true, detached: process.platform !== 'win32' });
    running.add(child);
    let tail = '', timedOut = false;
    const keep = chunk => { log.write(chunk); tail = (tail + chunk.toString()).slice(-4000); };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutSec * 1000);
    child.on('close', code => {
      clearTimeout(timer);
      running.delete(child);
      log.end();
      const seconds = (Date.now() - started) / 1000;
      const status = timedOut ? 'TIMEOUT' : code === 0 ? 'PASS' : 'FAIL';
      resolve({ name, status, code, seconds, note: status === 'PASS' ? '' : (timedOut ? `killed after ${timeoutSec}s; ` : '') + lastLines(tail, 3) });
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const names = select(opts.selectors);
  // Longest first (times from earlier runs), so a slow test does not start last.
  const durationsFile = path.join(LOGS, 'durations.json');
  let previous = {};
  try { previous = JSON.parse(fs.readFileSync(durationsFile, 'utf8')); } catch (_) {}
  names.sort((a, b) => (previous[b] || 0) - (previous[a] || 0));
  if (opts.list) {
    for (const n of names) console.log(n.padEnd(40) + ' ' + manifest.tests[n].desc);
    return;
  }
  fs.mkdirSync(LOGS, { recursive: true });
  console.log(`Running ${names.length} test(s) [${opts.selectors.join(' ')}] with ${opts.jobs} at a time${opts.root ? ', game root ' + opts.root : ''}. Logs: ${path.relative(ROOT, LOGS)}`);
  const running = new Set();
  const stop = () => { for (const child of running) killTree(child); process.exit(130); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const started = Date.now(), queue = [...names], results = [];
  await Promise.all(Array.from({ length: Math.min(opts.jobs, queue.length) }, async () => {
    while (queue.length) {
      const result = await runOne(queue.shift(), opts, running);
      results.push(result);
      console.log(`${result.status.padEnd(7)} ${result.name} (${result.seconds.toFixed(1)}s)${result.note ? '  ' + result.note.slice(0, 300) : ''}`);
    }
  }));
  results.sort((a, b) => a.name.localeCompare(b.name));
  const width = Math.max(...results.map(r => r.name.length), 4);
  console.log('\n' + 'Test'.padEnd(width) + '  Result   Time');
  console.log('-'.repeat(width) + '  -------  -------');
  for (const r of results) console.log(r.name.padEnd(width) + '  ' + r.status.padEnd(7) + '  ' + (r.seconds.toFixed(1) + 's').padStart(7));
  const failed = results.filter(r => r.status !== 'PASS');
  const total = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed in ${total}s.`);
  for (const r of failed) console.log(`  ${r.status} ${r.name}: ${r.note.slice(0, 400)}\n    log: ${path.relative(ROOT, path.join(LOGS, r.name + '.log'))}`);
  fs.writeFileSync(path.join(LOGS, 'summary.json'), JSON.stringify({ selectors: opts.selectors, root: opts.root, finished: new Date().toISOString(), results }, null, 2));
  for (const r of results) previous[r.name] = Math.round(r.seconds);
  fs.writeFileSync(durationsFile, JSON.stringify(previous, null, 2));
  process.exitCode = failed.length ? 1 : 0;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
