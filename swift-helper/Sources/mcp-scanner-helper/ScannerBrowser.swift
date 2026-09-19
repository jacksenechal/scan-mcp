// Adapted from scanline (https://github.com/klep/scanline), MIT licensed.
// See LICENSE-scanline and NOTICE.md for attribution.

import Foundation
import ImageCaptureCore

@MainActor
final class ScannerBrowser: NSObject, @preconcurrency ICDeviceBrowserDelegate {
    private let deviceBrowser = ICDeviceBrowser()
    private(set) var discovered: [ICScannerDevice] = []
    private var onTimeout: (() -> Void)?
    private var timer: Timer?
    private var browseSeconds: TimeInterval

    init(browseSeconds: TimeInterval = 5.0) {
        self.browseSeconds = browseSeconds
        super.init()
        deviceBrowser.delegate = self
        // USB (local) + Bonjour/AirScan + macOS-shared — same mask Image Capture uses.
        let mask = ICDeviceTypeMask(rawValue:
            ICDeviceTypeMask.scanner.rawValue |
            ICDeviceLocationTypeMask.local.rawValue |
            ICDeviceLocationTypeMask.bonjour.rawValue |
            ICDeviceLocationTypeMask.shared.rawValue
        )!
        deviceBrowser.browsedDeviceTypeMask = mask
    }

    /// Begin browsing. `onTimeout` fires after `browseSeconds`.
    func start(onTimeout: @escaping () -> Void) {
        self.onTimeout = onTimeout
        Log.browser.debug("starting (mask=scanner|local|bonjour|shared, window=\(browseSeconds)s)")
        deviceBrowser.start()
        timer = Timer.scheduledTimer(withTimeInterval: browseSeconds, repeats: false) { [weak self] _ in
            // Timer fires on the main runloop; `assumeIsolated` tells Swift 6 we're safe.
            MainActor.assumeIsolated {
                Log.browser.debug("timeout window reached, stopping")
                self?.stopBrowsing()
                self?.onTimeout?()
            }
        }
    }

    func stopBrowsing() {
        timer?.invalidate()
        timer = nil
        // Do NOT call deviceBrowser.stop(): icdd treats the active ICDeviceBrowser
        // connection as our session-event subscription. Stopping unregisters us
        // and ICADeviceAddedCmd no longer reaches our process.
    }

    /// Wait for a scanner matching `id` (matched against persistentIDString first,
    /// then name) to appear in `discovered`, polling every 250ms. Calls `onFound`
    /// with the match on the main actor and stops browsing. If `id` is nil, takes
    /// the first discovered scanner.
    func waitForDevice(matching id: String?, onFound: @escaping @MainActor (ICScannerDevice) -> Void) {
        let pollTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] timer in
            let matched: Bool = MainActor.assumeIsolated {
                guard let self = self else { return true }
                let device: ICScannerDevice?
                if let id = id {
                    device = self.discovered.first { $0.persistentIDString == id || $0.name == id }
                } else {
                    device = self.discovered.first
                }
                guard let scanner = device else { return false }
                self.stopBrowsing()
                onFound(scanner)
                return true
            }
            if matched { timer.invalidate() }
        }
        _ = pollTimer
    }

    // MARK: - ICDeviceBrowserDelegate

    func deviceBrowser(_ browser: ICDeviceBrowser, didAdd device: ICDevice, moreComing: Bool) {
        guard let scanner = device as? ICScannerDevice else { return }
        Log.browser.debug("added \(scanner.name ?? "[unnamed]") (id=\(scanner.persistentIDString ?? "?"))")
        discovered.append(scanner)
    }

    func deviceBrowser(_ browser: ICDeviceBrowser, didRemove device: ICDevice, moreGoing: Bool) {
        guard let scanner = device as? ICScannerDevice else { return }
        discovered.removeAll { $0 === scanner }
    }
}
