#!/usr/bin/env node
// Fake scanimage. Behavior is selected by the device id (-d):
//   success    writes page 1 and exits 0
//   empty      exits 0 without writing a page
//   failure    exits 2 with "paper jam"
//   page-fail  completes page 1, then exits 2
//   page-wait  completes page 1, starts page 2, then waits to be terminated
//   wait       waits; exits on SIGTERM
//   stubborn   waits; ignores SIGTERM
// Like scanimage --batch, a page is written to "<name>.part" and renamed once complete;
// on SIGTERM the in-progress ".part" file is removed.
import fs from 'node:fs';
import path from 'node:path';
const mode = process.argv[process.argv.indexOf('-d') + 1];
const batch = process.argv.find(arg => arg.startsWith('--batch='));
const pagePath = n => path.resolve(batch.slice('--batch='.length).replace('%04d', String(n).padStart(4, '0')));

function completePage(n) {
  fs.writeFileSync(pagePath(n) + '.part', `PAGE_${n}`);
  fs.renameSync(pagePath(n) + '.part', pagePath(n));
}
function wait(onTerm) {
  process.on('SIGTERM', () => {
    fs.writeFileSync('scanner-stopped', 'SIGTERM');
    onTerm();
  });
  setInterval(() => {}, 1000);
}

if (mode === 'wait' || mode === 'stubborn') {
  wait(() => { if (mode !== 'stubborn') process.exit(0); });
} else if (mode === 'page-wait') {
  completePage(1);
  fs.writeFileSync(pagePath(2) + '.part', 'PARTIAL');
  wait(() => { fs.rmSync(pagePath(2) + '.part'); process.exit(1); });
} else if (mode === 'page-fail') {
  completePage(1);
  process.stderr.write('paper jam\n');
  process.exitCode = 2;
} else if (mode === 'failure') {
  process.stderr.write('paper jam\n');
  process.exitCode = 2;
} else if (mode === 'success') {
  completePage(1);
}
// Signal that a scan is under way. Device probes (-A / -n) have no --batch and write nothing.
if (batch) fs.writeFileSync('scanner-started', String(process.pid));
