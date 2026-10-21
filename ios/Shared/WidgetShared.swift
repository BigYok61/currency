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

    static let colorThresholdKey = "widget.colorThreshold"
    static let colorEnabledKey = "widget.colorEnabled"

    /// App setting «Kursschwankungen farbig anzeigen» (default on). Off: every change grey.
    static var colorEnabled: Bool {
        (defaults?.object(forKey: colorEnabledKey) as? Bool) ?? true
    }

    /// Percent move from which a change is coloured green/red (app setting, default 0.10 %).
    static var colorThreshold: Double {
        (defaults?.object(forKey: colorThresholdKey) as? Double) ?? 0.10
    }

    /// +1 up, −1 down, 0 grey. At 0.00 % every non-zero move is coloured.
    static func direction(percent: Double?) -> Int {
        guard colorEnabled, let p = percent, p.isFinite else { return 0 }
        let t = colorThreshold
        if t <= 0 { return p > 0 ? 1 : p < 0 ? -1 : 0 }
        let r = (p * 10000).rounded() / 10000
        return r >= t - 1e-9 ? 1 : r <= -t + 1e-9 ? -1 : 0
    }

    static func url(for code: String?) -> URL {
        URL(string: "\(urlScheme)://currency/\(code ?? "")") ?? URL(string: "\(urlScheme)://")!
    }
}

/// Währungen Pro state shared by the app and the widget extension (App Group).
enum ProShared {
    /// CENTRAL PRO SWITCH. Keep `false` until «Währungen Pro» is live in the App Store.
    /// false: nothing is locked or removed – FX alarms, server subscriptions and all widgets work as before;
    ///        only badges, the paywall and the Ansicht entry are shown.
    /// true:  non-Pro users lose FX alarms (server subscription deleted, not grandfathered) and the
    ///        medium/large widgets show a «Währungen Pro» placeholder.
    static let enforcementEnabled = false

    static let productID = "ch.computerworks.waehrungen.pro"
    static let isProKey = "pro.isPro"

    /// Last verified entitlement, written by the app's ProStore.
    static var isPro: Bool { WidgetShared.defaults?.bool(forKey: isProKey) ?? false }

    /// A Pro feature is actually blocked (only ever true once enforcement is on).
    static var locked: Bool { enforcementEnabled && !isPro }
}
