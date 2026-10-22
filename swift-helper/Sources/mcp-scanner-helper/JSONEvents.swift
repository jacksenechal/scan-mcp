import Foundation

enum JSONOut {
    nonisolated(unsafe) static let iso8601 = ISO8601DateFormatter()

    static func encode<T: Encodable>(_ value: T) throws -> Data {
        try JSONEncoder().encode(value)
    }

    static func line<T: Encodable>(_ value: T) {
        guard let data = try? encode(value) else { return }
        FileHandle.standardOutput.write(data + Data([0x0A]))
    }

    static func diagnostic(_ message: String) {
        FileHandle.standardError.write(Data((message + "\n").utf8))
    }
}

struct ScanEvent: Encodable {
    let type: String
    let timestamp: String
    var stage: String? = nil
    var index: Int? = nil
    var path: String? = nil
    var message: String? = nil
    var pages: [String]? = nil

    private init(_ type: String) {
        self.type = type
        self.timestamp = JSONOut.iso8601.string(from: Date())
    }

    static func stage(_ value: String) -> Self {
        var event = Self("stage"); event.stage = value; return event
    }
    static func pageScanned(index: Int, path: String) -> Self {
        var event = Self("page_scanned"); event.index = index; event.path = path; return event
    }
    static func error(_ message: String) -> Self {
        var event = Self("error"); event.message = message; return event
    }
    static func complete(_ pages: [URL]) -> Self {
        var event = Self("complete"); event.pages = pages.map(\.path); return event
    }
}
