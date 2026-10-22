# Third-party notices

The scanner browser and controller in this helper adapt MIT-licensed code from
[scanline](https://github.com/klep/scanline) by Scott J. Kleper. Its copyright and
license are reproduced in `LICENSE-scanline`, shipped with this helper.

`ScannerBrowser.swift` and `ScannerController.swift` are derived from scanline's
`libscanline/` sources. They retain its ImageCaptureCore browser/session flow,
with JSON events, Swift concurrency annotations, and job-owned output paths.

The helper also links Apple's [swift-argument-parser](https://github.com/apple/swift-argument-parser),
licensed under Apache 2.0. Its license is included in
`LICENSE-argument-parser` in the npm package.
