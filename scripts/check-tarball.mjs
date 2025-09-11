#!/usr/bin/env node
// Check the npm publish tarball contents via `npm pack --json --dry-run`
// Ensures key runtime files are included.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const run = (cmd, args) => {
  const res = spawnSync(cmd, args, { encoding: 'utf8' });
  if (res.error) {
    console.error(`[check-tarball] failed to run ${cmd}:`, res.error.message);
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error(`[check-tarball] ${cmd} exited with ${res.status}\n`, res.stderr || res.stdout);
    process.exit(res.status);
  }
  return res.stdout;
};

// Use a local cache dir to avoid permissions issues with ~/.npm in some environments
const cacheDir = join(process.cwd(), '.npm-cache-pack');
if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

const out = run('npm', ['pack', '--json', '--dry-run', '--cache', cacheDir]);
let payload;
try {
  payload = JSON.parse(out);
} catch {
  console.error('[check-tarball] could not parse JSON output from npm pack');
  console.error(out);
  process.exit(1);
}

if (!Array.isArray(payload) || payload.length === 0) {
  console.error('[check-tarball] unexpected npm pack payload');
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

const files = payload[0]?.files?.map(f => f.path) ?? [];

const required = [
  'bin/scan-mcp',
  'dist/mcp.js',
  'schemas/manifest.schema.json',
  'resources/ORIENTATION.md'
];

const missing = required.filter(p => !files.includes(p));
if (missing.length) {
  console.error('[check-tarball] missing required files in pack:', missing);
  console.error('Included files sample:', files.slice(0, 20));
  process.exit(2);
}

console.log('[check-tarball] ok. files included:', required.join(', '));
