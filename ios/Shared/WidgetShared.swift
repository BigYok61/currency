import Foundation

/// Settings the app shares with the widget extension through the App Group.
enum WidgetShared {
    static let appGroup = "group.ch.computerworks.waehrungen"
    static let baseKey = "widget.baseCurrency"
    static let orderKey = "widget.visibleOrder"
    static let urlScheme = "waehrungen"

    static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

    /// Called by the app whenever the reporting currency or the visible list changes.
    static func publish(base: String, visible: [String]) {
        guard let defaults else { return }
        defaults.set(base, forKey: baseKey)
        defaults.set(visible, forKey: orderKey)
    }

    /// Reporting currency and the visible foreign currencies in the app's order.
    static func read() -> (base: String, foreign: [String]) {
        let base = defaults?.string(forKey: baseKey) ?? "CHF"
        let order = defaults?.stringArray(forKey: orderKey) ?? ["CHF", "EUR", "USD", "GBP"]
        let foreign = order.filter { $0 != base }
        return (base, foreign.isEmpty ? ["EUR", "USD", "GBP"].filter { $0 != base } : foreign)
    }

    static func url(for code: String?) -> URL {
        URL(string: "\(urlScheme)://currency/\(code ?? "")") ?? URL(string: "\(urlScheme)://")!
    }
}
