import Foundation

struct Currency: Identifiable, Hashable {
    var code: String
    var id: String { code }
}

enum ChartSpan: String, CaseIterable, Identifiable {
    case day = "Tag"
    case week = "Woche"
    case month = "Monat"
    case year = "360 Tage"
    case five = "5 Jahre"
    case ten = "10 Jahre"

    var id: String { rawValue }

    var query: String {
        switch self {
        case .day: return "1T"
        case .week: return "1W"
        case .month: return "1M"
        case .year: return "1J"
        case .five: return "5J"
        case .ten: return "10J"
        }
    }

    var dayCount: Int {
        switch self {
        case .day: return 1
        case .week: return 7
        case .month: return 30
        case .year: return 360
        case .five: return 1825
        case .ten: return 3650
        }
    }
}

struct RatePoint: Identifiable {
    var id: String { "\(day)-\(hour.map(String.init) ?? "d")-\(value)" }
    var day: String
    var hour: Int?
    var value: Double
    var raw: Double
    var date: Date
}

struct Quote {
    var value: Double?
    var raw: Double?
}

struct ForecastLine {
    var today: Double?
    var week: Double?
    var todayDelta: Double?
    var weekDelta: Double?
}

enum ViewBlock: String, CaseIterable, Identifiable {
    case current = "Nur aktuelle Kurse anzeigen"
    case chart = "Grafik anzeigen"
    case intervals = "Intervalle anzeigen"
    case forecast = "Prognose"
    case reference = "Referenzkurse anzeigen"

    var id: String { rawValue }
    var locked: Bool { self == .current }
    var hint: String? { self == .forecast ? "heute und 7 Tage" : nil }
}

let disclaimerText = "Prognosen sind unverbindliche, automatisch berechnete Schätzungen und keine Anlage- oder Finanzberatung. Für Entscheidungen auf Basis dieser Angaben wird keine Haftung übernommen."

let alertIntroText = "Die Alarmeinstellungen gelten nur für dieses Gerät. Wenn sich der Kurs gegenüber der Standardwährung innerhalb des Tages stärker als die unten gesetzten Schwellen verändert, werden Sie mit einer Push-Mitteilung gewarnt. Je Währung und Richtung gibt es höchstens eine Warnung am Tag."

let appStoreURL = URL(string: "https://apps.apple.com/app/ntfy/id1625396347")!
let playStoreURL = URL(string: "https://play.google.com/store/apps/details?id=io.heckel.ntfy")!

enum CurrencyNames {
    static func name(_ code: String) -> String {
        let value = Locale(identifier: "de_CH").localizedString(forCurrencyCode: code) ?? code
        return value.replacingOccurrences(of: "ß", with: "ss")
    }

    static func symbol(_ code: String) -> String {
        let known = [
            "CHF": "CHF", "USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥",
            "CAD": "C$", "AUD": "A$", "NZD": "NZ$", "SEK": "kr", "NOK": "kr", "DKK": "kr",
        ]
        if let hit = known[code] { return hit }
        return code
    }

    static func flag(_ code: String) -> String {
        let flags = [
            "EUR": "🇪🇺", "USD": "🇺🇸", "GBP": "🇬🇧", "CHF": "🇨🇭", "JPY": "🇯🇵",
            "CAD": "🇨🇦", "AUD": "🇦🇺", "NZD": "🇳🇿", "SEK": "🇸🇪", "NOK": "🇳🇴",
            "DKK": "🇩🇰", "PLN": "🇵🇱", "HUF": "🇭🇺", "TRY": "🇹🇷", "SGD": "🇸🇬",
            "MXN": "🇲🇽", "ZAR": "🇿🇦", "CNY": "🇨🇳", "INR": "🇮🇳", "HKD": "🇭🇰",
        ]
        return flags[code] ?? "🏳️"
    }
}

func cardRate(_ raw: Double?) -> Double? {
    guard let raw, abs(raw) > 0.00005 else { return nil }
    return 1 / raw
}

func formatRate(_ value: Double?) -> String {
    guard let value else { return "–" }
    let fmt = NumberFormatter()
    fmt.locale = Locale(identifier: "de_CH")
    fmt.minimumFractionDigits = 4
    fmt.maximumFractionDigits = 4
    fmt.numberStyle = .decimal
    return fmt.string(from: NSNumber(value: value)) ?? String(format: "%.4f", value)
}

func formatDelta(_ value: Double?) -> String {
    guard let value else { return "" }
    let body = formatRate(abs(value))
    if value > 0.00005 { return "+\(body)" }
    if value < -0.00005 { return "−\(body)" }
    return body
}

func arrow(_ value: Double?) -> String {
    guard let value else { return "" }
    if value > 0.00005 { return "↑" }
    if value < -0.00005 { return "↓" }
    return "→"
}
