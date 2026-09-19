import Foundation
import ArgumentParser

/// JSON shape matching the TS-side StartScanInput.
/// Decoded from `--params <json>` on the `scan` subcommand.
struct ScanParams: Codable {
    var device_id: String?
    var resolution_dpi: Int?
    var color_mode: ColorMode?
    var source: Source?
    var duplex: Bool?
    var page_size: PageSize?
    var custom_size_mm: SizeMM?
    var output_format: OutputFormat?

    func validate() throws {
        if page_size == .custom || custom_size_mm != nil {
            throw ValidationError("custom page sizes are not yet supported by ICA")
        }
        if let dpi = resolution_dpi, dpi <= 0 { throw ValidationError("resolution must be positive") }
    }

    var pageSizeInches: CGSize? {
        switch page_size {
        case .letter: return CGSize(width: 8.5, height: 11)
        case .a4: return CGSize(width: 210 / 25.4, height: 297 / 25.4)
        case .legal: return CGSize(width: 8.5, height: 14)
        default: return nil
        }
    }

    struct SizeMM: Codable {
        var width: Double
        var height: Double
    }

    /// ICA color modes; the parent resolves the document-first default.
    enum ColorMode: String, Codable {
        case color = "Color"
        case gray = "Gray"
        case lineart = "Lineart"
    }

    enum Source: String, Codable {
        case flatbed = "Flatbed"
        case adf = "ADF"
        case adfDuplex = "ADF Duplex"

        var wantsADF: Bool { self == .adf || self == .adfDuplex }
        var wantsDuplex: Bool { self == .adfDuplex }
    }

    enum PageSize: String, Codable {
        case letter = "Letter"
        case a4 = "A4"
        case legal = "Legal"
        case custom = "Custom"
    }

    enum OutputFormat: String, Codable {
        case tiff = "tiff"
    }
}
