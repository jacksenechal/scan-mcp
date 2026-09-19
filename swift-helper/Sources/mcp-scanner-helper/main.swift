import ArgumentParser

struct MCPScannerHelper: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "mcp-scanner-helper",
        abstract: "ImageCaptureCore scanner helper for scan-mcp (macOS 15+)",
        subcommands: [ListDevices.self, DeviceOptions.self, Scan.self, AssembleTIFF.self]
    )
}

MCPScannerHelper.main()
