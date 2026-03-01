#!/usr/bin/env node

const { execSync } = require('node:child_process');

function fail(msg) {
  console.error(`[pack-check] ${msg}`);
  process.exit(1);
}

const raw = execSync('npm pack --dry-run --json', { encoding: 'utf8' }).trim();
if (!raw) fail('npm pack returned empty output');

let data;
try {
  data = JSON.parse(raw);
} catch {
  fail('failed to parse npm pack --dry-run --json output');
}

const pack = Array.isArray(data) ? data[0] : data;
if (!pack || !Array.isArray(pack.files)) {
  fail('pack metadata missing files array');
}

const filePaths = pack.files.map((f) => f.path);

const required = [
  'dist/cli/index.js',
  'package.json'
];

for (const req of required) {
  if (!filePaths.includes(req)) {
    fail(`required file missing from package: ${req}`);
  }
}

const forbiddenPrefixes = [
  '.env',
  '.env.local',
  '.DS_Store',
  'node_modules/'
];

for (const fp of filePaths) {
  if (forbiddenPrefixes.some((p) => fp.startsWith(p))) {
    fail(`forbidden file included in package: ${fp}`);
  }
}

console.log('[pack-check] package dry-run passed');
console.log(`[pack-check] files: ${filePaths.length}`);
