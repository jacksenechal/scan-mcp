import ArgumentParser
import Foundation
import ImageCaptureCore

@MainActor
struct ListDevices: @preconcurrency ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "list-devices",
        abstract: "Discover connected scanners (USB, AirScan / Bonjour, macOS-shared)."
    )

    @Option(name: .customLong("browse-seconds"), help: "How long to browse for devices.")
    var browseSeconds: Double = 5.0

    @Flag(name: .shortAndLong, help: "Emit verbose diagnostic logs to stderr.")
    var verbose: Bool = false

    func run() throws {
        Log.mirrorToStderr = verbose
        let browser = ScannerBrowser(browseSeconds: browseSeconds)
        browser.start {
            let devices = browser.discovered.map(Self.toJSON)
            JSONOut.line(DevicesResponse(devices: devices))
            CFRunLoopStop(CFRunLoopGetCurrent())
        }
        CFRunLoopRun()
    }

    private static func toJSON(_ device: ICScannerDevice) -> DeviceJSON {
        // persistentIDString is the canonical stable identifier across reboots/reconnections.
        let id = device.persistentIDString ?? device.name ?? UUID().uuidString
        let name = device.name ?? "Unknown scanner"
        // Best-effort vendor/model split: ICA gives us a combined name.
        let parts = name.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true).map(String.init)
        let vendor = parts.first
        let model = parts.count > 1 ? parts[1] : nil
        return DeviceJSON(id: id, vendor: vendor, model: model, name: name)
    }
}

private struct DevicesResponse: Encodable {
    let devices: [DeviceJSON]
}

struct DeviceJSON: Encodable {
    let id: String
    let vendor: String?
    let model: String?
    let name: String
}
