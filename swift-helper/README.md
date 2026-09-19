# Native macOS scanner helper

This Swift 6 CLI uses ImageCaptureCore on macOS 15+ for scanner discovery,
per-functional-unit options, and TIFF capture. It retains the browser/controller
while the main runloop delivers delegate callbacks. It is derived in part from
scanline; see `NOTICE.md` and `LICENSE-scanline`.

Commands:

```sh
mcp-scanner-helper list-devices --browse-seconds 3
mcp-scanner-helper device-options --device-id ID --browse-seconds 5
mcp-scanner-helper scan --params '{"device_id":"ID","source":"ADF","output_format":"tiff"}' --out-dir /tmp/scan
mcp-scanner-helper assemble-tiff --output /tmp/document.tiff /tmp/scan/page_0001.tiff /tmp/scan/page_0002.tiff
```

Discovery/options emit JSON. Capture emits newline-delimited `stage`,
`page_scanned`, `error`, and `complete` objects. Completion contains the ordered
page paths; failures exit nonzero. Diagnostics use stderr. Custom sizes and
non-TIFF formats fail before discovery. Named sizes are checked against the
selected functional unit. The Node parent enforces discovery/probe/capture
subprocess timeouts and cancellation.

`assemble-tiff` uses ImageIO to copy all single-page TIFF inputs in order,
preserving image properties. It verifies the output page count and publishes
only a finalized file, leaving no partial document on failure.

## Build, test, and distribution

From the repository root:

```sh
npm run build
npm run test:swift
bash scripts/check-macos-package.sh
```

Build compiles both architectures, combines them with `lipo`, and signs and
verifies `dist/bin/mcp-scanner-helper`. If a newer Swift toolchain needs the
native SwiftPM build system, set `SWIFT_BUILD_SYSTEM=native`. Tests require
full Xcode with its license accepted; building does not install Xcode or alter
system toolchain settings.

The release workflow builds/tests on macOS and transfers the universal helper
and third-party notices to the existing Linux npm publisher. The publisher's
pack check requires those files. The package smoke check unpacks the tarball
outside the checkout and verifies signing, architectures, helper launch, and
ICA preflight without operating a scanner.

By default builds are ad-hoc signed. They are **not notarized**. To build with a
maintainer's Developer ID certificate, set `DEVELOPER_ID_APPLICATION` and
`MACOS_APP_IDENTIFIER=TEAM_ID.bundle_identifier`. The repository does not embed
any contributor's Apple team ID. Notarization and certificate management are
separate release responsibilities; this PR does not configure signing secrets.

The original fork's ICA compatibility work was tested with a network scanner.
The extracted implementation still needs a physical-device smoke check before
release: list devices, inspect options, capture at least two ADF pages and one
flatbed page, verify named sizes and TIFF page order, and test cancellation and
disconnection. Include a fresh machine/install when validating signing and
privacy permissions. Do not use CI's hardware-free tests as evidence that
permissions or every scanner model work.

ICA does not enumerate supported pixel types. The helper advertises Color, Gray,
and Lineart as requestable modes; a device may reject a mode during capture.
