#!/usr/bin/env bash
# Exercise the actual npm payload from a directory outside the source checkout.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT
npm pack --ignore-scripts --pack-destination "$STAGING" --cache "$ROOT/.npm-cache-pack" >/dev/null
cd "$STAGING"
tar -xzf ./*.tgz
cd package
npm install --omit=dev --ignore-scripts --no-audit --no-fund --cache "$ROOT/.npm-cache-pack"
test -s dist/notices/LICENSE-scanline
test -s dist/notices/LICENSE-argument-parser
lipo dist/bin/mcp-scanner-helper -verify_arch arm64 x86_64
codesign --verify --strict dist/bin/mcp-scanner-helper
dist/bin/mcp-scanner-helper --help
env -u MCP_SCANNER_HELPER_BIN SCAN_MOCK=false SCAN_BACKEND=ica node bin/scan-mcp --preflight-only
