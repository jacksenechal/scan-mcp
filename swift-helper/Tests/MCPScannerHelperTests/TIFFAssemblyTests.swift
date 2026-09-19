import XCTest
import ImageIO
import UniformTypeIdentifiers
@testable import mcp_scanner_helper

final class TIFFAssemblyTests: XCTestCase {
    private func makeTIFF(at url: URL, width: Int) throws {
        let context = try XCTUnwrap(CGContext(data: nil, width: width, height: 10, bitsPerComponent: 8,
            bytesPerRow: width, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue))
        let image = try XCTUnwrap(context.makeImage())
        let destination = try XCTUnwrap(CGImageDestinationCreateWithURL(url as CFURL, UTType.tiff.identifier as CFString, 1, nil))
        let properties = [kCGImagePropertyDPIWidth: 300, kCGImagePropertyDPIHeight: 300] as CFDictionary
        CGImageDestinationAddImage(destination, image, properties)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
    }

    func testPreservesEveryPageAndOrder() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let first = dir.appendingPathComponent("first.tiff")
        let second = dir.appendingPathComponent("second.tiff")
        let output = dir.appendingPathComponent("document.tiff")
        try makeTIFF(at: first, width: 20)
        try makeTIFF(at: second, width: 30)
        try TIFFAssembly.assemble(pages: [second, first], output: output)
        let source = try XCTUnwrap(CGImageSourceCreateWithURL(output as CFURL, nil))
        XCTAssertEqual(CGImageSourceGetCount(source), 2)
        XCTAssertEqual(CGImageSourceCreateImageAtIndex(source, 0, nil)?.width, 30)
        XCTAssertEqual(CGImageSourceCreateImageAtIndex(source, 1, nil)?.width, 20)
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        XCTAssertEqual(properties?[kCGImagePropertyDPIWidth] as? Int, 300)
    }

    func testBadPageDoesNotPublishPartialDocument() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let first = dir.appendingPathComponent("first.tiff")
        let output = dir.appendingPathComponent("document.tiff")
        try makeTIFF(at: first, width: 20)
        XCTAssertThrowsError(try TIFFAssembly.assemble(pages: [first, dir.appendingPathComponent("missing.tiff")], output: output))
        XCTAssertFalse(FileManager.default.fileExists(atPath: output.path))
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: dir.path), ["first.tiff"])
        XCTAssertThrowsError(try TIFFAssembly.assemble(pages: [], output: output))
    }
}
