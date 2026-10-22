import ArgumentParser
import Foundation
import ImageCaptureCore

// See Scan.swift — same pattern, ICA delegates are weak.
nonisolated(unsafe) private var activeProber: AnyObject?

@MainActor
struct DeviceOptions: @preconcurrency ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "device-options",
        abstract: "Open a session with a scanner and report its supported sources, resolutions, and color modes."
    )

    @Option(name: .customLong("device-id"), help: "persistentIDString of the target scanner.")
    var deviceId: String

    @Option(name: .customLong("browse-seconds"), help: "Browse window before giving up.")
    var browseSeconds: Double = 5.0

    @Flag(name: .shortAndLong, help: "Emit verbose diagnostic logs to stderr.")
    var verbose: Bool = false

    func run() throws {
        Log.mirrorToStderr = verbose
        let browser = ScannerBrowser(browseSeconds: browseSeconds)
        var didMatch = false
        var succeeded = false

        browser.start {
            if !didMatch {
                JSONOut.diagnostic("scanner not found")
                CFRunLoopStop(CFRunLoopGetCurrent())
            }
        }
        browser.waitForDevice(matching: deviceId) { device in
            didMatch = true
            Self.probe(device: device) { succeeded = $0 }
        }
        CFRunLoopRun()
        if !succeeded { throw ExitCode.failure }
    }

    private static func probe(device: ICScannerDevice, done: @escaping (Bool) -> Void) {
        let prober = OptionsProber(scanner: device)
        activeProber = prober
        prober.start { result in
            activeProber = nil
            switch result {
            case .success(let options):
                JSONOut.line(options)
                done(true)
            case .failure(let err):
                JSONOut.diagnostic("device-options failed: \(err.localizedDescription)")
                done(false)
            }
            CFRunLoopStop(CFRunLoopGetCurrent())
        }
    }
}

struct OptionsJSON: Encodable {
    let sources: [String]
    let color_modes: [String]
    let resolutions: [Int]
    let adf: Bool
    let duplex: Bool
    /// Per-source capabilities (keyed by source name: "Flatbed", "ADF", "ADF Duplex").
    /// Source/resolution/color combos can differ per functional unit on multifunction
    /// scanners — flatbed might support 600 dpi while the ADF only goes to 300.
    let per_source: [String: SourceCaps]

    struct SourceCaps: Encodable {
        let resolutions: [Int]
        let color_modes: [String]
    }
}

@MainActor
private final class OptionsProber: NSObject, @preconcurrency ICScannerDeviceDelegate {
    /// ICA does not expose an enumerable set of supported pixel types. These are
    /// the modes this helper can request; a device may reject a mode at scan time.
    private static let canonicalColorModes = ["Color", "Gray", "Lineart"]

    let scanner: ICScannerDevice
    private var onComplete: ((Result<OptionsJSON, Error>) -> Void)?

    // State machine state — built up across multiple didSelect callbacks.
    private var unitsToProbe: [ICScannerFunctionalUnitType] = []
    private var currentTarget: ICScannerFunctionalUnitType?
    private var perUnitCaps: [ICScannerFunctionalUnitType: OptionsJSON.SourceCaps] = [:]
    private var hasDuplex = false
    private var probingStarted = false

    init(scanner: ICScannerDevice) {
        self.scanner = scanner
        super.init()
        scanner.delegate = self
    }

    func start(_ onComplete: @escaping (Result<OptionsJSON, Error>) -> Void) {
        self.onComplete = onComplete
        Log.prober.debug("requesting session on \(scanner.name ?? "[unnamed]")")
        scanner.requestOpenSession()
    }

    func device(_ device: ICDevice, didOpenSessionWithError error: Error?) {
        Log.prober.debug("didOpenSessionWithError error=\(error?.localizedDescription ?? "nil")")
        if let error = error {
            fail(error); return
        }
    }

    func deviceDidBecomeReady(_ device: ICDevice) {
        guard onComplete != nil, !probingStarted else { return }
        probingStarted = true
        Log.prober.debug("deviceDidBecomeReady, availableFunctionalUnitTypes=\(scanner.availableFunctionalUnitTypes)")
        unitsToProbe = scanner.availableFunctionalUnitTypes
            .compactMap { ICScannerFunctionalUnitType(rawValue: UInt(truncating: $0)) }
            .filter { Self.sourceName(for: $0) != nil }
        probeNextUnit()
    }

    private func probeNextUnit() {
        guard let next = unitsToProbe.first else {
            finish()
            return
        }
        currentTarget = next
        Log.prober.debug("probing functional unit type=\(next.rawValue)")
        scanner.requestSelect(next)
    }

    func scannerDevice(_ scanner: ICScannerDevice, didSelect functionalUnit: ICScannerFunctionalUnit, error: Error?) {
        guard onComplete != nil, currentTarget != nil else { return }
        if let error = error {
            fail(error); return
        }
        // ICA quirk — wait for the real callback.
        guard !functionalUnit.icaIsReallyNil, functionalUnit.type == currentTarget else {
            Log.prober.debug("waiting for requested functional unit")
            return
        }

        let resolutions = functionalUnit.supportedResolutions.map { $0 }.sorted()
        perUnitCaps[functionalUnit.type] = OptionsJSON.SourceCaps(
            resolutions: resolutions,
            color_modes: Self.canonicalColorModes
        )

        if let feeder = functionalUnit as? ICScannerFunctionalUnitDocumentFeeder, feeder.supportsDuplexScanning {
            hasDuplex = true
        }

        unitsToProbe.removeFirst()
        currentTarget = nil
        probeNextUnit()
    }

    private func finish() {
        var sources = perUnitCaps.keys.compactMap(Self.sourceName(for:))
        // Stable order: Flatbed before ADF before ADF Duplex.
        sources.sort { Self.sourceOrder($0) < Self.sourceOrder($1) }

        var perSource = Dictionary(uniqueKeysWithValues: perUnitCaps.compactMap { (type, caps) -> (String, OptionsJSON.SourceCaps)? in
            guard let name = Self.sourceName(for: type) else { return nil }
            return (name, caps)
        })

        // ADF Duplex shares ADF's caps — same physical scan path, just both sides.
        if hasDuplex, let adfCaps = perSource["ADF"] {
            sources.append("ADF Duplex")
            perSource["ADF Duplex"] = adfCaps
        }

        // Union for backward compatibility with consumers that don't look at per_source.
        let unionResolutions = Array(Set(perUnitCaps.values.flatMap(\.resolutions))).sorted()

        succeed(OptionsJSON(
            sources: sources,
            color_modes: Self.canonicalColorModes,
            resolutions: unionResolutions,
            adf: sources.contains("ADF"),
            duplex: hasDuplex,
            per_source: perSource
        ))
    }

    private static func sourceName(for type: ICScannerFunctionalUnitType) -> String? {
        switch type {
        case .documentFeeder: return "ADF"
        case .flatbed: return "Flatbed"
        default: return nil
        }
    }

    private static func sourceOrder(_ name: String) -> Int {
        switch name {
        case "Flatbed": return 0
        case "ADF": return 1
        case "ADF Duplex": return 2
        default: return 99
        }
    }

    func device(_ device: ICDevice, didEncounterError error: Error?) {
        if let error = error {
            fail(error)
        }
    }

    func device(_ device: ICDevice, didCloseSessionWithError error: Error?) {}
    func didRemove(_ device: ICDevice) {
        fail(NSError(domain: "scan-mcp", code: 1, userInfo: [NSLocalizedDescriptionKey: "scanner disconnected while reading options"]))
    }
    func scannerDevice(_ scanner: ICScannerDevice, didScanTo url: URL) {}
    func scannerDevice(_ scanner: ICScannerDevice, didCompleteScanWithError error: Error?) {}

    private func succeed(_ opts: OptionsJSON) {
        scanner.requestCloseSession()
        let cb = onComplete
        onComplete = nil
        cb?(.success(opts))
    }

    private func fail(_ error: Error) {
        scanner.requestCloseSession()
        let cb = onComplete
        onComplete = nil
        cb?(.failure(error))
    }
}
