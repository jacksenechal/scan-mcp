#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist/notices
install -m 644 swift-helper/NOTICE.md dist/notices/NOTICE.md
install -m 644 swift-helper/LICENSE-scanline dist/notices/LICENSE-scanline
install -m 644 swift-helper/.build/checkouts/swift-argument-parser/LICENSE.txt dist/notices/LICENSE-argument-parser
