import XCTest
@testable import mcp_scanner_helper

/// The OptionsJSON wire shape is the contract with scan-mcp's IcaBackend.
final class OptionsJSONTests: XCTestCase {

    private func decode<T: Encodable>(_ value: T) throws -> [String: Any] {
        let data = try JSONOut.encode(value)
        return try (JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
    }

    func testEmitsUnionAndPerSourceFields() throws {
        let opts = OptionsJSON(
            sources: ["Flatbed", "ADF", "ADF Duplex"],
            color_modes: ["Color", "Gray", "Lineart"],
            resolutions: [100, 200, 300, 600],
            adf: true,
            duplex: true,
            per_source: [
                "Flatbed": .init(resolutions: [100, 200, 300, 600], color_modes: ["Color", "Gray", "Lineart"]),
                "ADF":     .init(resolutions: [200, 300],            color_modes: ["Color", "Gray", "Lineart"]),
                "ADF Duplex": .init(resolutions: [200, 300],         color_modes: ["Color", "Gray", "Lineart"]),
            ]
        )
        let dict = try decode(opts)
        XCTAssertEqual(dict["sources"] as? [String], ["Flatbed", "ADF", "ADF Duplex"])
        XCTAssertEqual(dict["resolutions"] as? [Int], [100, 200, 300, 600])
        XCTAssertEqual(dict["adf"] as? Bool, true)
        XCTAssertEqual(dict["duplex"] as? Bool, true)

        let perSource = dict["per_source"] as? [String: [String: Any]]
        XCTAssertNotNil(perSource)
        XCTAssertEqual(perSource?["Flatbed"]?["resolutions"] as? [Int], [100, 200, 300, 600])
        XCTAssertEqual(perSource?["ADF"]?["resolutions"] as? [Int], [200, 300])
        XCTAssertEqual(perSource?["ADF Duplex"]?["resolutions"] as? [Int], [200, 300])
    }

    func testSingleSourceStillEmitsPerSource() throws {
        // Flatbed-only scanner — per_source has just one entry, but the field is present.
        let opts = OptionsJSON(
            sources: ["Flatbed"],
            color_modes: ["Color", "Gray", "Lineart"],
            resolutions: [200, 300],
            adf: false,
            duplex: false,
            per_source: [
                "Flatbed": .init(resolutions: [200, 300], color_modes: ["Color", "Gray", "Lineart"]),
            ]
        )
        let dict = try decode(opts)
        XCTAssertEqual(dict["adf"] as? Bool, false)
        XCTAssertEqual(dict["duplex"] as? Bool, false)
        let perSource = dict["per_source"] as? [String: Any]
        XCTAssertEqual(perSource?.count, 1)
    }
}
