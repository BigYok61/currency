import Foundation
import SwiftUI
import StoreKit

// Build 36: shared by the Watch app and the Watch complication (both targets compile this file,
// plus Shared/WidgetShared.swift and WaehrungenWidget/WidgetData.swift for the rate source).

/// Codable copy of the last good snapshot, stored in the Watch's App Group so the app and the
/// complication show the last rates offline.
struct WatchCache: Codable {
    struct Row: Codable {
        var code: String
        var rate: Double?
        var delta: Double?
        var percent: Double?
        var week: [Double]
    }
    var base: String
    var rows: [Row]
    var updated: Date?

    init(_ snap: WSnapshot) {
        base = snap.base
        rows = snap.rows.map { Row(code: $0.code, rate: $0.rate, delta: $0.delta, percent: $0.percent, week: $0.week) }
        updated = snap.updated
    }

    var snapshot: WSnapshot {
        WSnapshot(base: base, rows: rows.map { WRow(code: $0.code, rate: $0.rate, delta: $0.delta, percent: $0.percent, week: $0.week) }, updated: updated)
    }

    static let key = "watch.cache"

    static func load() -> WatchCache? {
        guard let data = WidgetShared.defaults?.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(WatchCache.self, from: data)
    }

    static func save(_ snap: WSnapshot) {
        guard !snap.failed, let data = try? JSONEncoder().encode(WatchCache(snap)) else { return }
        WidgetShared.defaults?.set(data, forKey: key)
    }
}

/// Selection, colour setting and Pro flag come from the iPhone through iCloud key-value storage
/// (the store the iPhone app already syncs its settings with). Copied into the Watch App Group.
enum WatchSync {
    static func pullFromCloud() {
        let cloud = NSUbiquitousKeyValueStore.default
        cloud.synchronize()
        let base = cloud.string(forKey: "wu.baseCurrency") ?? WidgetShared.read().base
        var order = WidgetShared.defaults?.stringArray(forKey: WidgetShared.orderKey) ?? ["CHF", "EUR", "USD", "GBP"]
        if let data = cloud.data(forKey: "wu.currencyOrder"), let list = try? JSONDecoder().decode([String].self, from: data), !list.isEmpty {
            var hidden: Set<String> = []
            if let h = cloud.data(forKey: "wu.currencyHidden"), let list = try? JSONDecoder().decode([String].self, from: h) { hidden = Set(list) }
            order = list.filter { !hidden.contains($0) }
        }
        WidgetShared.publish(base: base, visible: order)
        if let t = cloud.object(forKey: "wu.colorThreshold") as? Double { WidgetShared.defaults?.set(t, forKey: WidgetShared.colorThresholdKey) }
        if cloud.object(forKey: "wu.colorChanges") != nil { WidgetShared.defaults?.set(cloud.bool(forKey: "wu.colorChanges"), forKey: WidgetShared.colorEnabledKey) }
        if cloud.bool(forKey: ProShared.cloudKey) { WidgetShared.defaults?.set(true, forKey: ProShared.isProKey) }
    }

    /// Pro on the Watch: the App Store entitlement (shared with the iPhone purchase) or the flag the iPhone synced.
    static func refreshPro() async -> Bool {
        var owned = false
        for await result in Transaction.currentEntitlements {
            if case .verified(let t) = result, t.productID == ProShared.productID, t.revocationDate == nil { owned = true }
        }
        let cloud = NSUbiquitousKeyValueStore.default.bool(forKey: ProShared.cloudKey)
        let pro = owned || cloud
        WidgetShared.defaults?.set(pro, forKey: ProShared.isProKey)
        return pro
    }
}

enum WatchFmt {
    static func rate(_ value: Double?) -> String {
        guard let value else { return "–" }
        return String(format: "%.4f", value)
    }

    static func percent(_ value: Double?) -> String {
        guard let value else { return "–" }
        let sign = value > 0.005 ? "+" : value < -0.005 ? "−" : ""
        return "\(sign)\(String(format: "%.2f", abs(value))) %"
    }

    static func tone(_ percent: Double?) -> Color {
        switch WidgetShared.direction(percent: percent) {
        case 1: return Color(red: 0.204, green: 0.780, blue: 0.349)
        case -1: return Color(red: 1, green: 0.231, blue: 0.188)
        default: return .secondary
        }
    }

    static func updated(_ date: Date?) -> String {
        guard let date else { return "" }
        let day = DateFormatter()
        day.locale = Locale(identifier: "de_CH")
        day.dateFormat = "dd.MM.yyyy"
        let time = DateFormatter()
        time.locale = .current
        time.setLocalizedDateFormatFromTemplate("jmm")
        return "Kurs zuletzt aktualisiert am: \(day.string(from: date)) \(time.string(from: date))"
    }

    static func name(_ code: String) -> String {
        (Locale(identifier: "de_CH").localizedString(forCurrencyCode: code) ?? code).replacingOccurrences(of: "ß", with: "ss")
    }
}
