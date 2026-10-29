'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {CHUNK, scanBuffer, scanFiles, assertClean, sensitivePath} = require('./verify-no-secrets');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'simple-wars-secrets-'));
let checks = 0;
function detects(value, rule = 'provider-secret', encoding = 'utf8') {
  const findings = [];
  scanBuffer(Buffer.from(value, encoding), 'fixture', findings);
  assert(findings.some(f => f.rule === rule));
  assert(!JSON.stringify(findings).includes(value));
  checks++;
}
try {
  const key = 'sk_' + 'a1'.repeat(20);
  detects(key);
  detects('sk-' + 'Ab9'.repeat(16));
  detects('sk_' + 'live_' + 'Ab9'.repeat(12));
  detects('AIza' + 'Ab9'.repeat(12));
  detects('AKIA' + 'A1'.repeat(8));
  detects('ghp_' + 'Ab9'.repeat(12));
  detects('github_pat_' + 'Ab9'.repeat(16));
  detects('xoxb-' + 'Ab9'.repeat(12));
  detects('SG.' + 'Ab9'.repeat(8) + '.' + 'Cd8'.repeat(8));
  detects('-----BEGIN ' + 'OPENSSH PRIVATE KEY-----', 'private-key');
  detects('apiKey: "' + 'a1'.repeat(20) + '"', 'credential-literal');
  detects('"Bearer ' + 'Ab9'.repeat(12) + '"', 'authorization-literal');
  detects('?api_key=' + 'Ab9'.repeat(12), 'credential-query');
  detects('https://user:' + 'Ab9'.repeat(12) + '@example.invalid', 'credential-url');
  detects(key, 'provider-secret', 'utf16le');
  const clean = [];
  scanBuffer(Buffer.from('const key = process.env.ELEVENLABS_API_KEY; apiKey: "YOUR_ELEVENLABS_API_KEY"; steamAppId: 5043620; sk_FragCoord_Workaround; sk_color_dodge_component;'), 'clean.js', clean);
  assert.deepEqual(clean, []);
  checks++;
  for (const file of ['.env', 'assets/.env.production', '.npmrc', '.aws/credentials', 'private.pfx', 'id_ed25519']) assert(sensitivePath(file));
  for (const file of ['.env.example', 'sounds/sfx/manifest.json', 'package.json', 'favicon.ico']) assert(!sensitivePath(file));
  checks++;
  const boundary = path.join(temp, 'boundary.bin');
  fs.writeFileSync(boundary, Buffer.concat([Buffer.alloc(CHUNK - 4, 0), Buffer.from(key)]));
  const boundaryResult = scanFiles([boundary], {base: temp});
  assert(boundaryResult.findings.some(f => f.rule === 'provider-secret'));
  checks++;
  fs.writeFileSync(path.join(temp, '.env'), 'EMPTY=1');
  assert(scanFiles([path.join(temp, '.env')], {base: temp}).findings.some(f => f.rule === 'credential-file'));
  checks++;
  // A tiny valid ASAR with a hidden credential sidecar must also be rejected.
  const header = Buffer.from(JSON.stringify({files: {'.env.production': {size: 0, offset: '0'}}}));
  const padding = (4 - header.length % 4) % 4;
  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(8 + header.length + padding, 4);
  prefix.writeUInt32LE(4 + header.length + padding, 8);
  prefix.writeUInt32LE(header.length, 12);
  const archive = path.join(temp, 'fixture.asar');
  fs.writeFileSync(archive, Buffer.concat([prefix, header, Buffer.alloc(padding)]));
  assert(scanFiles([archive], {base: temp}).findings.some(f => f.file.endsWith('!.env.production')));
  checks++;
  fs.writeFileSync(archive, Buffer.from('not an archive'));
  assert(scanFiles([archive], {base: temp}).findings.some(f => f.rule === 'unreadable-archive'));
  checks++;
  const logged = [];
  const previous = console.error;
  try {
    console.error = value => logged.push(value);
    assert.throws(() => assertClean(boundaryResult), /credential check failed/);
  } finally { console.error = previous; }
  assert(!logged.join('\n').includes(key));
  assert(logged.join('\n').includes('boundary.bin'));
  checks++;
  console.log(`Credential guard: ${checks} checks passed (synthetic keys, redaction, boundary, UTF-16, ASAR and filenames).`);
} finally {
  const resolved = path.resolve(temp);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('simple-wars-secrets-')) throw new Error('Unsafe fixture cleanup');
  fs.rmSync(resolved, {recursive: true, force: true});
}
