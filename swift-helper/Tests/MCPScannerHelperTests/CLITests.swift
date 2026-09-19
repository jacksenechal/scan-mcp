import XCTest
@testable import mcp_scanner_helper

final class CLITests: XCTestCase {
    func testHelpAndInvalidParameters() throws {
        // SwiftPM test executable and helper are siblings, regardless of build configuration.
        let binary = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent().appendingPathComponent("mcp-scanner-helper")
        // On macOS the XCTest executable sits inside the .xctest bundle.
        let bundleSibling = Bundle(for: Self.self).bundleURL.deletingLastPathComponent().appendingPathComponent("mcp-scanner-helper")
        let helper = FileManager.default.isExecutableFile(atPath: binary.path) ? binary : bundleSibling
        XCTAssertTrue(FileManager.default.isExecutableFile(atPath: helper.path), helper.path)
        for args in [["--help"], ["scan", "--params", "not-json", "--out-dir", NSTemporaryDirectory()]] {
            let process = Process()
            process.executableURL = helper
            process.arguments = args
            let stdout = Pipe()
            process.standardOutput = stdout
            process.standardError = FileHandle.nullDevice
            try process.run()
            let data = stdout.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()
            let text = String(decoding: data, as: UTF8.self)
            if args[0] == "--help" {
                XCTAssertEqual(process.terminationStatus, 0)
                XCTAssertTrue(text.contains("assemble-tiff"))
            } else {
                XCTAssertNotEqual(process.terminationStatus, 0)
                let event = try JSONSerialization.jsonObject(with: data) as? [String: Any]
                XCTAssertEqual(event?["type"] as? String, "error")
            }
        }
    }
}
