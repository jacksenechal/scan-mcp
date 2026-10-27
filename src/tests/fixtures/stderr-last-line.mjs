#!/usr/bin/env node
// Writes diagnostics to both streams, ending with distinctive final lines, then exits non-zero.
// The last lines arrive right before exit, which is when an un-flushed log file would miss them.
for (let i = 0; i < 200; i++) process.stderr.write(`stderr filler ${i}\n`);
process.stderr.write('LAST_STDERR_LINE\n');
process.stdout.write('LAST_STDOUT_LINE\n');
process.exitCode = 1;
