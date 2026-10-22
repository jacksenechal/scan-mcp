#!/usr/bin/env bash
# Build the universal macOS helper. Linux publishing retains the downloaded artifact.
set -euo pipefail
if [[ "$(uname -s)" != Darwin ]]; then
  echo "build:helper: skipping native compilation on non-macOS"
  exit 0
fi
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
# Individual slices also build with Command Line Tools; SwiftPM's multi-arch
# Xcode backend requires a full Xcode installation.
swift_build() {
  if [[ -n "${SWIFT_BUILD_SYSTEM:-}" ]]; then
    swift build --build-system "$SWIFT_BUILD_SYSTEM" "$@"
  else
    swift build "$@"
  fi
}
for ARCH in arm64 x86_64; do
  swift_build --package-path swift-helper -c release --arch "$ARCH"
done
ARM_BIN="$(swift_build --package-path swift-helper -c release --arch arm64 --show-bin-path)/mcp-scanner-helper"
INTEL_BIN="$(swift_build --package-path swift-helper -c release --arch x86_64 --show-bin-path)/mcp-scanner-helper"
mkdir -p dist/bin
lipo -create "$ARM_BIN" "$INTEL_BIN" -output dist/bin/mcp-scanner-helper
chmod +x dist/bin/mcp-scanner-helper

# ICA session access requires an application identity even for local ad-hoc builds.
# A Developer ID release must set this to TEAM_ID.bundle_identifier for its signer.
APP_IDENTIFIER="${MACOS_APP_IDENTIFIER:-org.scan-mcp.scanner-helper}"
if [[ ! "$APP_IDENTIFIER" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo 'MACOS_APP_IDENTIFIER must contain only letters, digits, dots and hyphens' >&2
  exit 1
fi
ENTITLEMENTS="$(mktemp -t scan-mcp-entitlements)"
trap 'rm -f "$ENTITLEMENTS"' EXIT
cat > "$ENTITLEMENTS" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>com.apple.application-identifier</key><string>$APP_IDENTIFIER</string></dict></plist>
PLIST
SIGN_ARGS=(--force --options=runtime --identifier org.scan-mcp.scanner-helper --entitlements "$ENTITLEMENTS")
if [[ -n "${DEVELOPER_ID_APPLICATION:-}" ]]; then
  if [[ -z "${MACOS_APP_IDENTIFIER:-}" ]]; then
    echo 'Developer ID signing requires MACOS_APP_IDENTIFIER=TEAM_ID.bundle_identifier' >&2
    exit 1
  fi
  codesign "${SIGN_ARGS[@]}" --timestamp --sign "$DEVELOPER_ID_APPLICATION" dist/bin/mcp-scanner-helper
else
  codesign "${SIGN_ARGS[@]}" --sign - dist/bin/mcp-scanner-helper
fi
codesign --verify --strict dist/bin/mcp-scanner-helper
lipo dist/bin/mcp-scanner-helper -verify_arch arm64 x86_64
bash scripts/package-helper-notices.sh
