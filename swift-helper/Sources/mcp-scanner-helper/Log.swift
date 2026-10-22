import Foundation
import os

/// Logging facade for `mcp-scanner-helper`. Each call always emits through
/// Apple's unified logging system (`os.Logger`), so messages survive in
/// Console.app and `log stream --predicate 'subsystem == "org.scan-mcp.scanner-helper"'`
/// even when our stdout/stderr pipes are gone (the silent-hang scenario).
///
/// When `--verbose` is set, debug-level messages are also mirrored to stderr so
/// the operator sees them inline in the terminal.
///
/// Tail logs live in a separate stream from `JSONOut.line/diagnostic`, which
/// emit the helper's protocol output (stdout for events, stderr for failures
/// the caller must see regardless of verbosity).
struct Log {
    nonisolated(unsafe) static var mirrorToStderr = false

    private static let subsystem = "org.scan-mcp.scanner-helper"

    static let browser = Log(category: "browser")
    static let controller = Log(category: "controller")
    static let prober = Log(category: "prober")

    private let category: String
    private let osLogger: Logger

    private init(category: String) {
        self.category = category
        self.osLogger = Logger(subsystem: Log.subsystem, category: category)
    }

    /// Verbose tracing. Always recorded by os.Logger; mirrored to stderr when --verbose.
    func debug(_ message: @autoclosure () -> String) {
        let msg = message()
        osLogger.debug("\(msg, privacy: .public)")
        if Self.mirrorToStderr {
            FileHandle.standardError.write(Data("[\(category)] \(msg)\n".utf8))
        }
    }

    /// Higher-priority informational messages. Always recorded; mirrored when --verbose.
    func info(_ message: @autoclosure () -> String) {
        let msg = message()
        osLogger.info("\(msg, privacy: .public)")
        if Self.mirrorToStderr {
            FileHandle.standardError.write(Data("[\(category)] \(msg)\n".utf8))
        }
    }

    /// Recoverable error. Always recorded; mirrored to stderr (regardless of --verbose)
    /// because the operator should see errors immediately.
    func error(_ message: @autoclosure () -> String) {
        let msg = message()
        osLogger.error("\(msg, privacy: .public)")
        FileHandle.standardError.write(Data("[\(category)] ERROR: \(msg)\n".utf8))
    }
}
