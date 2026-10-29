/* Release credential guard. Reports locations/rule names only, never secret values. */
'use strict';
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const CHUNK = 1024 * 1024;
const OVERLAP = 16384;
const RULES = [
  // sk_ also prefixes ordinary Skia shader identifiers in Electron. Real secret
  // formats use long key material or the explicit Stripe live/test prefix.
  ['provider-secret', /\b(?:sk-[A-Za-z0-9_-]{20,}|sk_(?:(?:live|test)_[A-Za-z0-9]{20,}|[A-Za-z0-9]{32,})|rk_live_[A-Za-z0-9]{20,}|AIza[\w-]{30,}|(?:AKIA|ASIA)[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9-]{20,}|SG\.[\w-]{20,}\.[\w-]{20,})\b/g],
  ['private-key', /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/g],
  ['credential-literal', /["']?(?:api[_-]?key|xi-api-key|client[_-]?secret|secret[_-]?access[_-]?key|access[_-]?token|auth[_-]?token|password)["']?\s*[:=]\s*["']([^"'\r\n]{20,512})["']/gi],
  ['authorization-literal', /["'](?:Bearer|Basic) ([A-Za-z0-9_./+=-]{24,})["']/g],
  ['credential-query', /[?&](?:api[_-]?key|access[_-]?token|client[_-]?secret)=([A-Za-z0-9_./+=%-]{20,})/gi],
  ['credential-url', /\b(?:https?|wss?|postgres(?:ql)?|mongodb(?:\+srv)?):\/\/[^\s/:@]+:([^\s/@]{8,})@/gi],
];

function placeholder(value) {
  return /^(?:your[_ -]|example|placeholder|dummy|test[_ -]|replace[_ -]|\$\{|process\.env\.|<)/i.test(value)
    || /^[A-Z][A-Z0-9_]*_(?:API_KEY|TOKEN|SECRET|PASSWORD|ACCESS_KEY_ID|SECRET_ACCESS_KEY)$/.test(value)
    || /(?:\.repeat\(|\+\s*['"]|\bfunction\b)/.test(value);
}
function sensitivePath(file) {
  const parts = file.replace(/\\/g, '/').split('/');
  return parts.some(part => /^(?:\.env(?:\..+)?|\.npmrc|\.netrc|\.git|\.aws|\.ssh|\.codex|\.agents|id_rsa|id_ed25519|credentials(?:\.json)?|service-account(?:[-.].+)?\.json)$/i.test(part)
    && !/^\.env\.(?:example|sample|template)$/.test(part))
    || /\.(?:p12|pfx|jks|keystore)$/i.test(file);
}
function scanText(text, file, findings, encoding = 'utf8', lineOffset = 0) {
  for (const [rule, regex] of RULES) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text))) {
      if (placeholder(match[1] || match[0])) continue;
      const line = encoding === 'binary' ? undefined : lineOffset + 1 + (text.slice(0, match.index).match(/\n/g) || []).length;
      findings.push({file, rule, ...(line ? {line} : {})});
      // One location per rule/chunk is sufficient; don't retain matching values.
      break;
    }
  }
}
function scanBuffer(buffer, file, findings) {
  scanText(buffer.toString('utf8'), file, findings);
  if (buffer.includes(0)) {
    scanText(buffer.toString('utf16le'), file, findings, 'binary');
    scanText(buffer.subarray(1).toString('utf16le'), file, findings, 'binary');
  }
}
function archivePaths(file, label, findings) {
  // Electron ASAR uses two Chromium Pickles, then uncompressed file bytes.
  const fd = fs.openSync(file, 'r');
  try {
    const prefix = Buffer.alloc(16);
    if (fs.readSync(fd, prefix, 0, 16, 0) !== 16) throw new Error('header');
    const headerSize = prefix.readUInt32LE(4);
    const jsonSize = prefix.readUInt32LE(12);
    if (jsonSize > headerSize - 8 || headerSize > 64 * CHUNK) throw new Error('size');
    const json = Buffer.alloc(jsonSize);
    if (fs.readSync(fd, json, 0, jsonSize, 16) !== jsonSize) throw new Error('truncated');
    const visit = (node, parent = '') => {
      for (const [name, entry] of Object.entries(node.files || {})) {
        const rel = parent + name;
        if (sensitivePath(rel)) findings.push({file: label + '!' + rel, rule: 'credential-file'});
        if (entry.link) findings.push({file: label + '!' + rel, rule: 'archive-link'});
        if (entry.files) visit(entry, rel + '/');
      }
    };
    visit(JSON.parse(json.toString('utf8')));
  } catch {
    findings.push({file: label, rule: 'unreadable-archive'});
  } finally { fs.closeSync(fd); }
}
function collectFiles(target, files = []) {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) throw new Error('Refusing release symlink: ' + target);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(target)) collectFiles(path.join(target, name), files);
  } else if (stat.isFile()) files.push(target);
  return files;
}
function scanFiles(files, {base = ROOT, checkPaths = true} = {}) {
  const findings = [];
  const uniqueFiles = [...new Set(files.map(file => path.resolve(file)))];
  let bytes = 0;
  for (const file of uniqueFiles) {
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Refusing release symlink: ' + file);
    const label = path.relative(base, file).replace(/\\/g, '/');
    if (checkPaths && sensitivePath(label)) findings.push({file: label, rule: 'credential-file'});
    if (/\.asar$/i.test(file)) archivePaths(file, label, findings);
    const fd = fs.openSync(file, 'r');
    let tail = Buffer.alloc(0);
    let lineOffset = 0;
    try {
      const chunk = Buffer.alloc(CHUNK);
      let count;
      while ((count = fs.readSync(fd, chunk, 0, CHUNK, null))) {
        bytes += count;
        const buffer = Buffer.concat([tail, chunk.subarray(0, count)]);
        scanText(buffer.toString('utf8'), label, findings, 'utf8', lineOffset);
        if (buffer.includes(0)) {
          scanText(buffer.toString('utf16le'), label, findings, 'binary');
          scanText(buffer.subarray(1).toString('utf16le'), label, findings, 'binary');
        }
        const retained = Math.min(OVERLAP, buffer.length);
        lineOffset += (buffer.subarray(0, buffer.length - retained).toString('utf8').match(/\n/g) || []).length;
        tail = Buffer.from(buffer.subarray(buffer.length - retained));
      }
    } finally { fs.closeSync(fd); }
  }
  return {files: uniqueFiles.length, bytes, findings: [...new Map(findings.map(f => [JSON.stringify(f), f])).values()]};
}
function trackedFiles(root = ROOT) {
  return execFileSync('git', ['ls-files', '-z'], {cwd: root}).toString('utf8').split('\0').filter(Boolean).map(rel => path.join(root, rel));
}
function steamFiles(root = path.resolve(ROOT, '..', 'simple wars steam')) {
  return ['game', 'dist/win-unpacked', 'dist-ship/win-unpacked', 'electron', 'scripts', 'package.json']
    .flatMap(rel => collectFiles(path.join(root, rel)));
}
function scanHistory(root = ROOT) {
  const objects = execFileSync('git', ['rev-list', '--objects', '--all'], {cwd: root, maxBuffer: 32 * CHUNK}).toString('utf8').trim().split('\n');
  const labels = new Map(objects.map(line => [line.slice(0, 40), line.slice(41)]));
  const info = execFileSync('git', ['cat-file', '--batch-check'], {cwd: root, input: [...labels.keys()].join('\n') + '\n', maxBuffer: 32 * CHUNK}).toString('utf8').trim().split('\n');
  const blobs = info.map(line => line.split(' ')).filter(fields => fields[1] === 'blob');
  const findings = [];
  let bytes = 0;
  for (let i = 0; i < blobs.length;) {
    const batch = [];
    let size = 0;
    do { const fields = blobs[i++]; batch.push(fields); size += Number(fields[2]); } while (i < blobs.length && size + Number(blobs[i][2]) < 16 * CHUNK);
    const data = execFileSync('git', ['cat-file', '--batch'], {cwd: root, input: batch.map(fields => fields[0]).join('\n') + '\n', maxBuffer: size + CHUNK});
    let offset = 0;
    for (const [sha, , length] of batch) {
      const start = data.indexOf(10, offset) + 1;
      const end = start + Number(length);
      const label = 'history/' + sha.slice(0, 12) + '/' + labels.get(sha);
      scanBuffer(data.subarray(start, end), label, findings);
      bytes += Number(length);
      offset = end + 1;
    }
  }
  return {files: blobs.length, bytes, findings};
}
function assertClean(result, label = 'Release') {
  if (result.findings.length) {
    for (const finding of result.findings) console.error(JSON.stringify(finding));
    throw new Error(label + ': credential check failed (' + result.findings.length + ' locations; values redacted).');
  }
  console.log(`${label}: no credentials detected in ${result.files} files (${result.bytes} bytes).`);
  return result;
}
module.exports = {ROOT, CHUNK, OVERLAP, scanText, scanBuffer, scanFiles, scanHistory, trackedFiles, steamFiles, collectFiles, assertClean, sensitivePath};
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg.startsWith('--') && !['--history', '--steam'].includes(arg))) throw new Error('Unknown credential-audit option.');
    const targets = args.filter(arg => !arg.startsWith('--'));
    assertClean(scanFiles(targets.length ? targets.flatMap(target => collectFiles(path.resolve(target))) : trackedFiles()), 'Current files');
    if (args.includes('--steam')) assertClean(scanFiles(steamFiles()), 'Steam packages');
    if (args.includes('--history')) assertClean(scanHistory(), 'Reachable Git history');
  } catch (error) {
    // Never include file contents, command stdout or matching credentials in errors.
    console.error(error.code ? `Credential audit could not complete (${error.code}).` : error.message);
    process.exitCode = 1;
  }
}
