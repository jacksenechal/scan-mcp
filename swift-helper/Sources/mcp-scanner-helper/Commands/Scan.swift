import ArgumentParser
import Foundation
import ImageCaptureCore

// ICA's delegate is weak. Retain the controller until the scan finishes.
nonisolated(unsafe) private var activeScanController: ScannerController?

@MainActor
struct Scan: @preconcurrency ParsableCommand {
    static let configuration = CommandConfiguration(commandName: "scan", abstract: "Capture per-page TIFFs, emitting JSON events on stdout.")

    @Option(name: .customLong("params")) var paramsJSON: String
    @Option(name: .customLong("out-dir")) var outDir: String
    @Option(name: .customLong("browse-seconds")) var browseSeconds: Double = 8
    @Flag(name: .shortAndLong) var verbose: Bool = false

    func run() throws {
        Log.mirrorToStderr = verbose
        let params: ScanParams
        do {
            params = try JSONDecoder().decode(ScanParams.self, from: Data(paramsJSON.utf8))
            try params.validate()
        } catch {
            JSONOut.line(ScanEvent.error("invalid scan parameters: \(error.localizedDescription)"))
            throw ExitCode.failure
        }
        let output = URL(fileURLWithPath: outDir, isDirectory: true)
        try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
        JSONOut.line(ScanEvent.stage("discovering"))
        let browser = ScannerBrowser(browseSeconds: browseSeconds)
        var started = false
        var succeeded = false
        browser.start {
            if !started {
                JSONOut.line(ScanEvent.error("no matching scanner found within \(browseSeconds)s"))
                CFRunLoopStop(CFRunLoopGetCurrent())
            }
        }
        browser.waitForDevice(matching: params.device_id) { scanner in
            started = true
            let controller = ScannerController(scanner: scanner, params: params, outDir: output, emitEvents: true)
            activeScanController = controller
            controller.start { result in
                switch result {
                case .success(let pages):
                    succeeded = true
                    JSONOut.line(ScanEvent.complete(pages))
                case .failure(let error):
                    JSONOut.line(ScanEvent.error(error.localizedDescription))
                }
                activeScanController = nil
                CFRunLoopStop(CFRunLoopGetCurrent())
            }
        }
        CFRunLoopRun()
        if !succeeded { throw ExitCode.failure }
    }
}
