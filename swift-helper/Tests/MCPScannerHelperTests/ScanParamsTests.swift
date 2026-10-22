import XCTest
@testable import mcp_scanner_helper

final class ScanParamsTests: XCTestCase {
    func testDecodeWireParameters() throws {
        let json = #"{"device_id":"scanner","resolution_dpi":300,"color_mode":"Color","source":"ADF Duplex","duplex":true,"page_size":"Letter","output_format":"tiff"}"#
        let params = try JSONDecoder().decode(ScanParams.self, from: Data(json.utf8))
        try params.validate()
        XCTAssertEqual(params.device_id, "scanner")
        XCTAssertEqual(params.resolution_dpi, 300)
        XCTAssertEqual(params.color_mode, .color)
        XCTAssertEqual(params.output_format, .tiff)
        XCTAssertTrue(try XCTUnwrap(params.source).wantsADF)
        XCTAssertTrue(try XCTUnwrap(params.source).wantsDuplex)
        XCTAssertEqual(params.pageSizeInches, CGSize(width: 8.5, height: 11))
        let copy = try JSONDecoder().decode(ScanParams.self, from: JSONEncoder().encode(params))
        XCTAssertEqual(copy.source, params.source)
    }

    func testRejectUnsupportedCustomSizeAndOutput() throws {
        let params = try JSONDecoder().decode(ScanParams.self, from: Data(#"{"page_size":"Custom","custom_size_mm":{"width":210,"height":297}}"#.utf8))
        XCTAssertThrowsError(try params.validate())
        XCTAssertThrowsError(try JSONDecoder().decode(ScanParams.self, from: Data(#"{"output_format":"pdf"}"#.utf8)))
    }

    func testStandardPageDimensions() throws {
        var params = ScanParams()
        XCTAssertNil(params.pageSizeInches)
        params.page_size = .a4
        XCTAssertEqual(try XCTUnwrap(params.pageSizeInches).width, 210 / 25.4, accuracy: 0.001)
        params.page_size = .legal
        XCTAssertEqual(params.pageSizeInches, CGSize(width: 8.5, height: 14))
        params.resolution_dpi = -1
        XCTAssertThrowsError(try params.validate())
    }
}
