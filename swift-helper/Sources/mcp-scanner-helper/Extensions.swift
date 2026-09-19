import Foundation
import ImageCaptureCore

extension ICScannerFunctionalUnit {
    /// ICA's delegate callbacks declare `functionalUnit` as non-optional, but in
    /// release builds the parameter can arrive at address 0 before the real
    /// selection completes. `unsafeBitCast` lets us detect that without Swift
    /// short-circuiting the nil check (since the parameter type is non-optional).
    var icaIsReallyNil: Bool {
        unsafeBitCast(self, to: Int.self) == 0
    }
}
