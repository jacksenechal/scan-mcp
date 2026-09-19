import XCTest
@testable import mcp_scanner_helper

final class JSONEventsTests: XCTestCase {
    func testScanWireContract() throws {
        let events = [
            ScanEvent.stage("selecting_functional_unit"),
            ScanEvent.pageScanned(index: 1, path: "/tmp/page_0001.tiff"),
            ScanEvent.complete([URL(fileURLWithPath: "/tmp/page_0001.tiff")]),
            ScanEvent.error("scan failed"),
        ]
        let objects = try events.map { try XCTUnwrap(JSONSerialization.jsonObject(with: JSONOut.encode($0)) as? [String: Any]) }
        XCTAssertEqual(objects[0]["stage"] as? String, "selecting_functional_unit")
        XCTAssertEqual(objects[1]["type"] as? String, "page_scanned")
        XCTAssertEqual(objects[1]["index"] as? Int, 1)
        XCTAssertEqual(objects[1]["path"] as? String, "/tmp/page_0001.tiff")
        XCTAssertEqual(objects[2]["type"] as? String, "complete")
        XCTAssertEqual(objects[2]["pages"] as? [String], ["/tmp/page_0001.tiff"])
        XCTAssertEqual(objects[3]["message"] as? String, "scan failed")
        for object in objects {
            XCTAssertNotNil(ISO8601DateFormatter().date(from: try XCTUnwrap(object["timestamp"] as? String)))
        }
        XCTAssertEqual(Set(objects[1].keys), ["type", "timestamp", "index", "path"])
    }
}
