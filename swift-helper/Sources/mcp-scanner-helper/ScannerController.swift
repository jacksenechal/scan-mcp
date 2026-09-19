// Adapted from scanline (https://github.com/klep/scanline), MIT licensed.
// See LICENSE-scanline and NOTICE.md for attribution.

import Foundation
import ImageCaptureCore
import UniformTypeIdentifiers

@MainActor
final class ScannerController: NSObject, @preconcurrency ICScannerDeviceDelegate {
    let scanner: ICScannerDevice
    let params: ScanParams
    private(set) var scannedURLs: [URL] = []
    private var pageCounter = 0
    private let outDir: URL
    private let emitEvents: Bool
    private var onComplete: ((Result<[URL], Error>) -> Void)?
    private var sessionTimer: Timer?
    private var scanningStarted = false

    private var wantsADF: Bool { params.source?.wantsADF ?? false }

    init(scanner: ICScannerDevice, params: ScanParams, outDir: URL, emitEvents: Bool) {
        self.scanner = scanner
        self.params = params
        self.outDir = outDir
        self.emitEvents = emitEvents
        super.init()
        self.scanner.delegate = self
    }

    /// Begin scanning. `onComplete` is called once at the end (success or failure).
    func start(onComplete: @escaping (Result<[URL], Error>) -> Void) {
        self.onComplete = onComplete
        if emitEvents {
            JSONOut.line(ScanEvent.stage("opening_session"))
        }
        Log.controller.debug("requesting session on \(scanner.name ?? "[unnamed]")")
        // 30s watchdog so a denied Local Network permission (or any other stall)
        // surfaces as an error event rather than a silent hang.
        sessionTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self = self, !self.scanningStarted else { return }
                self.fail("session open timed out after 30s — likely a macOS permissions issue. Try running once interactively to trigger the Privacy & Security prompt, or check System Settings → Privacy & Security → Local Network.")
            }
        }
        scanner.requestOpenSession()
    }

    // MARK: - ICScannerDeviceDelegate

    func device(_ device: ICDevice, didOpenSessionWithError error: Error?) {
        Log.controller.debug("didOpenSessionWithError error=\(error?.localizedDescription ?? "nil")")
        if let error = error {
            fail("opening session failed: \(error.localizedDescription)")
            return
        }
        // Wait for deviceDidBecomeReady before issuing further commands.
    }

    func device(_ device: ICDevice, didCloseSessionWithError error: Error?) {
        Log.controller.debug("didCloseSessionWithError error=\(error?.localizedDescription ?? "nil")")
    }

    func device(_ device: ICDevice, didEncounterError error: Error?) {
        Log.controller.error("didEncounterError error=\(error?.localizedDescription ?? "nil")")
        fail("device error: \(error?.localizedDescription ?? "unknown")")
    }

    func didRemove(_ device: ICDevice) {
        fail("scanner disconnected during capture")
    }

    func deviceDidBecomeReady(_ device: ICDevice) {
        guard onComplete != nil, !scanningStarted else { return }
        Log.controller.debug("deviceDidBecomeReady, wantsADF=\(wantsADF)")
        if emitEvents {
            JSONOut.line(ScanEvent.stage("selecting_functional_unit"))
        }
        let unitType: ICScannerFunctionalUnitType = wantsADF ? .documentFeeder : .flatbed
        scanner.requestSelect(unitType)
    }

    func scannerDevice(_ scanner: ICScannerDevice, didSelect functionalUnit: ICScannerFunctionalUnit, error: Error?) {
        guard onComplete != nil, !scanningStarted else { return }
        if let error = error {
            fail("selecting functional unit failed: \(error.localizedDescription)")
            return
        }
        // ICA sometimes delivers a nil-address or wrong-type unit before the real
        // one; in either case wait for the next callback.
        let wantedType: ICScannerFunctionalUnitType = wantsADF ? .documentFeeder : .flatbed
        guard !functionalUnit.icaIsReallyNil, functionalUnit.type == wantedType else {
            Log.controller.debug("waiting for requested functional unit")
            return
        }
        guard configure(functionalUnit: functionalUnit) else { return }
        scanningStarted = true
        sessionTimer?.invalidate()
        sessionTimer = nil
        if emitEvents {
            JSONOut.line(ScanEvent.stage("scanning"))
        }
        scanner.requestScan()
    }

    func scannerDevice(_ scanner: ICScannerDevice, didScanTo url: URL) {
        guard onComplete != nil else { return }
        Log.controller.debug("didScanTo \(url.path)")
        pageCounter += 1
        let dest = outDir.appendingPathComponent(String(format: "page_%04d.tiff", pageCounter))
        do {
            if url.standardizedFileURL != dest.standardizedFileURL {
                try FileManager.default.moveItem(at: url, to: dest)
            }
            scannedURLs.append(dest)
            if emitEvents {
                JSONOut.line(ScanEvent.pageScanned(index: pageCounter, path: dest.path))
            }
        } catch {
            scanner.cancelScan()
            fail("failed to preserve page \(pageCounter): \(error.localizedDescription)")
        }
    }

    func scannerDevice(_ scanner: ICScannerDevice, didCompleteScanWithError error: Error?) {
        Log.controller.debug("didCompleteScanWithError error=\(error?.localizedDescription ?? "nil") pages=\(scannedURLs.count)")
        if let error = error {
            // ADF "no more pages" is a normal end-of-batch — surface as success.
            let nsError = error as NSError
            // Never treat communication timeouts (-9923) as successful capture.
            let msg = nsError.localizedDescription.lowercased()
            let endOfBatch = msg.contains("no more pages")
                || msg.contains("nothing to scan")
            if endOfBatch && !scannedURLs.isEmpty {
                succeed()
                return
            }
            fail("scan failed: \(nsError.localizedDescription) [code=\(nsError.code)]")
            return
        }
        succeed()
    }

    // MARK: - Configuration

    private func configure(functionalUnit unit: ICScannerFunctionalUnit) -> Bool {
        let desiredDPI = params.resolution_dpi ?? 300
        guard unit.supportedResolutions.contains(desiredDPI) else {
            fail("unsupported resolution: \(desiredDPI) dpi"); return false
        }
        unit.resolution = desiredDPI

        switch params.color_mode {
        case .lineart:
            unit.pixelDataType = .BW
            unit.bitDepth = .depth1Bit
        case .gray:
            unit.pixelDataType = .gray
            unit.bitDepth = .depth8Bits
        case .color, .none:
            unit.pixelDataType = .RGB
            unit.bitDepth = .depth8Bits
        }

        if let feeder = unit as? ICScannerFunctionalUnitDocumentFeeder {
            if let pageSize = params.page_size {
                let type = mapDocumentType(pageSize)
                guard feeder.supportedDocumentTypes.contains(Int(type.rawValue)) else {
                    fail("requested page size is not supported by the feeder"); return false
                }
                feeder.documentType = type
            }
            if ((params.duplex ?? false) || (params.source?.wantsDuplex ?? false)) && !feeder.supportsDuplexScanning {
                fail("this feeder does not support duplex capture"); return false
            }
            feeder.duplexScanningEnabled = (params.duplex ?? false) || (params.source?.wantsDuplex ?? false)
        }

        if let flatbed = unit as? ICScannerFunctionalUnitFlatbed {
            flatbed.measurementUnit = .inches
            let physical = flatbed.physicalSize
            let size = params.pageSizeInches ?? CGSize(width: physical.width, height: physical.height)
            guard size.width <= physical.width + 0.01, size.height <= physical.height + 0.01 else {
                fail("requested page size exceeds the flatbed area"); return false
            }
            flatbed.scanArea = NSMakeRect(0, 0, min(size.width, physical.width), min(size.height, physical.height))
        }

        // ICA writes per-page files into downloadsDirectory; didScanTo renames them.
        scanner.transferMode = .fileBased
        scanner.downloadsDirectory = outDir
        scanner.documentName = "ica_scratch"
        // The parent assembles these single-page TIFFs after capture.
        scanner.documentUTI = UTType.tiff.identifier
        return true
    }

    private func mapDocumentType(_ pageSize: ScanParams.PageSize?) -> ICScannerDocumentType {
        switch pageSize {
        case .legal: return .typeUSLegal
        case .a4: return .typeA4
        case .letter: return .typeUSLetter
        default: return .typeUSLetter
        }
    }

    // MARK: - Completion

    private func succeed() {
        guard !scannedURLs.isEmpty else { fail("scanner produced no pages"); return }
        sessionTimer?.invalidate()
        scanner.requestCloseSession()
        let cb = onComplete
        onComplete = nil
        cb?(.success(scannedURLs))
    }

    private func fail(_ msg: String) {
        sessionTimer?.invalidate()
        scanner.requestCloseSession()
        let cb = onComplete
        onComplete = nil
        cb?(.failure(NSError(domain: "mcp-scanner-helper", code: 1, userInfo: [NSLocalizedDescriptionKey: msg])))
    }
}
