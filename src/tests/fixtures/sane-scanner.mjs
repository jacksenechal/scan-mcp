#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const mode = process.argv[process.argv.indexOf('-d') + 1];
if (mode === 'wait' || mode === 'stubborn') {
  process.on('SIGTERM', () => {
    fs.writeFileSync('scanner-stopped', 'SIGTERM');
    if (mode !== 'stubborn') process.exit(0);
  });
  setInterval(() => {}, 1000);
} else if (mode === 'failure') {
  process.stderr.write('paper jam\n');
  process.exitCode = 2;
} else {
  const pattern = process.argv.find(arg => arg.startsWith('--batch=')).slice('--batch='.length);
  fs.writeFileSync(path.resolve(pattern.replace('%04d', '0001')), 'PAGE_1');
}
fs.writeFileSync('scanner-started', String(process.pid));
