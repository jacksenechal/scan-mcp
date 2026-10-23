#!/usr/bin/env node
// Fails after printing output, like a tool that dumps diagnostics before exiting non-zero.
process.stdout.write('NOISY_STDOUT\n');
process.stderr.write('NOISY_STDERR\n');
process.exitCode = 1;
