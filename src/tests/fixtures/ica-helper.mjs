#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const options = { sources: ['ADF'], resolutions: [200, 300], color_modes: ['Color', 'Gray', 'Lineart'], adf: true, duplex: false,
  per_source: { ADF: { resolutions: [200, 300], color_modes: ['Color', 'Gray', 'Lineart'] } } };
if (args[0] === 'list-devices') {
  console.log(JSON.stringify({ devices: [{ id: 'test', vendor: 'Test', model: 'Scanner' }] }));
} else if (args[0] === 'device-options') {
  console.log(JSON.stringify(options));
} else if (args[0] === 'assemble-tiff') {
  const output = option('--output');
  const pages = args.slice(args.indexOf('--output') + 2);
  const contents = pages.map(p => fs.readFileSync(p, 'utf8'));
  if (contents.includes('WAIT_FOR_ASSEMBLY_ABORT')) {
    fs.writeFileSync(output + '.pid', String(process.pid));
    setInterval(() => {}, 1000);
  } else {
    fs.writeFileSync(output, contents.join('|'));
  }
} else if (args[0] === 'scan') {
  const params = JSON.parse(option('--params'));
  const scenario = params.device_id;
  if (scenario === 'invalid-json') { console.log('{broken'); process.exit(0); }
  if (scenario === 'helper-error') { console.log(JSON.stringify({ type: 'error', message: 'paper jam' })); process.exit(0); }
  if (scenario === 'exit-failure') process.exit(3);
  const dir = option('--out-dir');
  const pages = [1, 2].map(i => path.join(dir, `page_${String(i).padStart(4, '0')}.tiff`));
  const events = [{ type: 'stage', stage: 'scanning' }];
  if (scenario === 'wait') {
    console.log(JSON.stringify(events[0]));
    setInterval(() => {}, 1000);
  } else {
    for (const [i, page] of pages.entries()) {
      fs.writeFileSync(page, scenario === 'assembly-wait' ? 'WAIT_FOR_ASSEMBLY_ABORT' : `PAGE_${i + 1}`);
      events.push({ type: 'page_scanned', index: i + 1, path: page });
    }
    if (scenario !== 'no-complete') events.push({ type: 'complete', pages: scenario === 'mismatch' ? [pages[0]] : pages });
    // Exercise UTF-8 chunk boundaries and a final event without a newline.
    events.splice(1, 0, { type: 'warning', message: 'scanner prêt' });
    const bytes = Buffer.from(events.map(event => JSON.stringify(event)).join('\n'));
    for (let i = 0; i < bytes.length; i += 7) process.stdout.write(bytes.subarray(i, i + 7));
  }
}
