import Foundation

@MainActor
final class RatesStore: ObservableObject {
    static let origin = URL(string: "https://waehrungen.bigyok61.workers.dev")!

    @Published var base = "CHF"
    @Published var order: [String] = ["CHF", "EUR", "USD", "GBP"]
    @Published var hidden: Set<String> = []
    @Published var showChart = false
    @Published var showIntervals = false
    @Published var showForecast = false
    @Published var showReference = false
    @Published var span: ChartSpan = .month
    @Published var hours: [Int] = [7, 12, 17]
    @Published var timesUserSet = false
    @Published var timeStart = 7
    @Published var timeEnd = 17
    @Published var timeStep: Int? = nil
    @Published var alertsMaster = true
    @Published var thresholds: [String: AlarmThreshold] = [:]
    @Published var topic = ""
    @Published var fired: [String: String] = [:]
    @Published var updated = ""
    @Published var errorText = ""
    /// Session-only converter. Never written to UserDefaults; a launch starts at 1 of the reporting currency.
    @Published var convertSource = "CHF"
    @Published var convertAmount = 1.0
    @Published var convertDraft = "1"
    @Published var convertEditing = false
    var convertReplace = false

    private var days: [String: DayFile] = [:]
    private var historyCache: [String: [RatePoint]] = [:]
    private let defaults = UserDefaults.standard

    struct AlarmThreshold: Codable {
        var enabled: Bool
        var down: Double
        var up: Double
    }

    struct DayFile: Decodable {
        var slots: [String: [String: Double]]?
        var ecb: [String: Double]?
        var forecast: [String: Double]?
        var forecast7: [String: Double]?
        var forecastBasis: [String: Int]?
        var forecast7Basis: [String: Int]?
    }

    struct RatesFile: Decodable {
        var days: [String: DayFile]
        var updated: String?
    }

    struct HistoryFile: Decodable {
        var points: [[HistoryValue]]
    }

    enum HistoryValue: Decodable {
        case text(String)
        case number(Double)
        init(from decoder: Decoder) throws {
            let box = try decoder.singleValueContainer()
            if let text = try? box.decode(String.self) { self = .text(text); return }
            self = .number(try box.decode(Double.self))
        }
    }

    var visible: [String] {
        order.filter { !hidden.contains($0) }
    }

    var sourceLine: String {
        showReference ? "Quelle: biquote.io (Mittelkurs), EZB" : "Quelle: biquote.io (Mittelkurs)"
    }

    var capturedLine: String {
        let fmtIn = ISO8601DateFormatter()
        fmtIn.formatOptions = [.withInternetDateTime]
        guard let date = fmtIn.date(from: updated) else { return "" }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "de_CH")
        fmt.timeZone = TimeZone(identifier: "Europe/Zurich")
        fmt.dateFormat = "dd.MM.yyyy, HH:mm"
        return "Erfasst: \(fmt.string(from: date))"
    }

    init() {
        loadLocal()
        if defaults.object(forKey: "wu.baseCurrency") == nil && defaults.object(forKey: "wu.currencyOrder") == nil {
            applyFirstInstall()
        }
        if topic.isEmpty { topic = "wae-" + Self.hex(16) }
        convertSource = base
    }

    var isDefaultConvert: Bool {
        convertSource == base && abs(convertAmount - 1) < 0.0000005
    }

    var showConvertPill: Bool { !isDefaultConvert }

    /// True while the entered money is still exactly 1 of the reporting currency, so the list keeps the unit rates.
    var showsUnitRates: Bool {
        guard let value = valueInBase() else { return isDefaultConvert }
        return abs(value - 1) < 0.0000005
    }

    var convertPillText: String {
        "\(Self.formatPill(convertAmount)) \(convertSource) umgerechnet"
    }

    func beginConvert(_ code: String) {
        if convertEditing && convertSource == code { return }
        let next: Double
        if convertSource == code {
            next = convertAmount
        } else if showsUnitRates {
            if let per = reportingPerUnit(code), per > 0 { next = 1 / per }
            else { next = quote(code).value ?? 1 }
        } else {
            next = converted(code) ?? 1
        }
        convertSource = code
        convertAmount = next
        convertDraft = Self.draftString(next)
        convertReplace = true
        convertEditing = true
    }

    func applyDraft(_ text: String) {
        convertDraft = text
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            convertAmount = 0
            return
        }
        if let value = Self.parseAmount(text) {
            convertAmount = value
        }
    }

    func finishConvert() {
        guard convertEditing else { return }
        if let value = Self.parseAmount(convertDraft) {
            convertAmount = value
        }
        convertEditing = false
        convertReplace = false
    }

    func resetConvert() {
        convertSource = base
        convertAmount = 1
        convertDraft = "1"
        convertEditing = false
        convertReplace = false
    }

    /// Units of the reporting currency for 1 unit of `code`, using the latest CHF mid on both sides.
    func reportingPerUnit(_ code: String) -> Double? {
        if code == base { return 1 }
        guard let own = chfPerUnit(code), let den = chfPerUnit(base), abs(den) > 0.00005 else { return nil }
        return own / den
    }

    func valueInBase() -> Double? {
        guard let per = reportingPerUnit(convertSource) else { return nil }
        return convertAmount * per
    }

    func converted(_ code: String) -> Double? {
        guard let total = valueInBase(), let per = reportingPerUnit(code), abs(per) > 0.00005 else { return nil }
        return total / per
    }

    func primaryText(_ code: String, unitRates: Bool) -> String {
        if unitRates {
            guard let value = quote(code).value else { return "–" }
            return "\(formatRate(value)) \(code == base ? base : code)"
        }
        guard let value = converted(code) else { return "–" }
        return "\(Self.formatMoney(value)) \(code)"
    }

    /// Per-unit inverse, unchanged while converting. The reporting-currency row has no second line.
    func secondaryText(_ code: String) -> String {
        if code == base { return "" }
        guard let raw = quote(code).raw else { return "–" }
        return "\(formatRate(raw)) \(base)"
    }

    private func chfPerUnit(_ code: String) -> Double? {
        if code == "CHF" { return 1 }
        let today = Self.todayKey()
        for offset in 0..<12 {
            guard let day = Self.addDays(today, -offset), let slots = days[day]?.slots else { continue }
            let hours = slots.keys.compactMap(Int.init).sorted(by: >)
            for hour in hours {
                if let raw = slots[String(format: "%02d", hour)]?[code], raw > 0 { return raw }
            }
        }
        return nil
    }

    static func parseAmount(_ text: String) -> Double? {
        var s = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let drop: [Character] = ["'", "’", " ", "\u{00a0}", "\u{202f}"]
        s = String(s.filter { !drop.contains($0) })
        guard !s.isEmpty else { return nil }
        let dots = s.filter { $0 == "." }.count
        let commas = s.filter { $0 == "," }.count
        if dots > 0 && commas > 0 {
            if let lastDot = s.lastIndex(of: "."), let lastComma = s.lastIndex(of: ",") {
                if lastDot > lastComma {
                    s = s.replacingOccurrences(of: ",", with: "")
                } else {
                    s = s.replacingOccurrences(of: ".", with: "")
                    s = s.replacingOccurrences(of: ",", with: ".")
                }
            }
        } else if commas == 1 {
            s = s.replacingOccurrences(of: ",", with: ".")
        } else if commas > 1 {
            s = s.replacingOccurrences(of: ",", with: "")
        } else if dots > 1 {
            s = s.replacingOccurrences(of: ".", with: "")
        }
        if s.hasSuffix(".") { s.removeLast() }
        guard !s.isEmpty, s != "-", let value = Double(s), value.isFinite, value >= 0 else { return nil }
        return value
    }

    static func draftString(_ value: Double) -> String {
        let fmt = NumberFormatter()
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.numberStyle = .decimal
        fmt.usesGroupingSeparator = false
        fmt.minimumFractionDigits = 0
        fmt.maximumFractionDigits = 4
        fmt.decimalSeparator = "."
        return fmt.string(from: NSNumber(value: value)) ?? "1"
    }

    static func formatMoney(_ value: Double) -> String {
        let fmt = NumberFormatter()
        fmt.locale = Locale(identifier: "de_CH")
        fmt.numberStyle = .decimal
        fmt.minimumFractionDigits = 2
        fmt.maximumFractionDigits = 2
        return fmt.string(from: NSNumber(value: value)) ?? "–"
    }

    static func formatPill(_ value: Double) -> String {
        let fmt = NumberFormatter()
        fmt.locale = Locale(identifier: "de_CH")
        fmt.numberStyle = .decimal
        fmt.minimumFractionDigits = 0
        fmt.maximumFractionDigits = 4
        return fmt.string(from: NSNumber(value: value)) ?? draftString(value)
    }

    func reload() async {
        do {
            let url = Self.origin.appendingPathComponent("data/rates.json")
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                throw URLError(.badServerResponse)
            }
            let file = try JSONDecoder().decode(RatesFile.self, from: data)
            days = file.days
            updated = file.updated ?? ""
            errorText = ""
            await loadHistoryIfNeeded()
        } catch {
            errorText = "Die Kurse konnten nicht geladen werden."
        }
    }

    func loadHistoryIfNeeded() async {
        guard showChart, span != .day, span != .week else { return }
        let codes = visible.filter { $0 != base }
        let span = self.span
        for code in codes {
            let key = "\(code)|\(span.query)"
            if historyCache[key] != nil { continue }
            await fetchHistory(code: code, span: span)
        }
        objectWillChange.send()
    }

    private func fetchHistory(code: String, span: ChartSpan) async {
        var parts = URLComponents(url: Self.origin.appendingPathComponent("data/history/\(code).json"), resolvingAgainstBaseURL: false)
        parts?.queryItems = [URLQueryItem(name: "range", value: span.query)]
        guard let url = parts?.url else { return }
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return }
            let file = try JSONDecoder().decode(HistoryFile.self, from: data)
            let points = file.points.compactMap { row -> RatePoint? in
                guard row.count >= 2, case .text(let day) = row[0], case .number(let raw) = row[1], raw > 0 else { return nil }
                guard let value = cardRate(raw), let date = Self.dayDate(day) else { return nil }
                return RatePoint(day: day, hour: nil, value: value, raw: raw, date: date)
            }
            historyCache["\(code)|\(span.query)"] = points
        } catch { /* lokale Reihe bleibt die Anzeige */ }
    }

    func quote(_ code: String) -> Quote {
        if code == base { return Quote(value: 1, raw: 1) }
        let today = Self.todayKey()
        for offset in 0..<12 {
            guard let day = Self.addDays(today, -offset), let slots = days[day]?.slots else { continue }
            let hours = slots.keys.compactMap(Int.init).sorted(by: >)
            for hour in hours {
                let key = String(format: "%02d", hour)
                if let raw = slots[key]?[code] {
                    return Quote(value: cardRate(raw), raw: raw)
                }
            }
        }
        return Quote(value: nil, raw: nil)
    }

    func intervalValue(_ code: String, hour: Int) -> Double? {
        if code == base { return 1 }
        let today = Self.todayKey()
        let key = String(format: "%02d", hour)
        for offset in 0..<12 {
            guard let day = Self.addDays(today, -offset) else { continue }
            if let raw = days[day]?.slots?[key]?[code] { return cardRate(raw) }
        }
        return nil
    }

    func forecast(_ code: String) -> ForecastLine? {
        if code == base { return nil }
        let today = Self.todayKey()
        var dayKey = today
        var found = false
        for offset in 0..<12 {
            guard let day = Self.addDays(today, -offset) else { continue }
            if days[day]?.forecast != nil || days[day]?.forecast7 != nil {
                dayKey = day
                found = true
                break
            }
        }
        guard found, let day = days[dayKey] else { return nil }
        let basisHour = day.forecastBasis?[code] ?? day.forecast7Basis?[code]
        let basisRaw = basisHour.flatMap { day.slots?[String(format: "%02d", $0)]?[code] }
        let basis = cardRate(basisRaw)
        let todayV = cardRate(day.forecast?[code])
        let weekV = cardRate(day.forecast7?[code])
        return ForecastLine(
            today: todayV,
            week: weekV,
            todayDelta: (todayV != nil && basis != nil) ? todayV! - basis! : nil,
            weekDelta: (weekV != nil && basis != nil) ? weekV! - basis! : nil
        )
    }

    func reference(_ code: String) -> Double? {
        if code == base { return 1 }
        let today = Self.todayKey()
        for offset in 0..<12 {
            guard let day = Self.addDays(today, -offset) else { continue }
            if let raw = days[day]?.ecb?[code] { return cardRate(raw) }
        }
        return nil
    }

    func series(_ code: String) -> [RatePoint] {
        if span == .day || span == .week {
            return hourlySeries(code, daysBack: span.dayCount)
        }
        let remote = historyCache["\(code)|\(span.query)"] ?? []
        let local = dailySeries(code, daysBack: span.dayCount)
        if code != base, remote.count > local.count { return remote }
        return local
    }

    func move(_ code: String, by steps: Int) {
        guard steps != 0, let index = order.firstIndex(of: code) else { return }
        var next = order
        next.remove(at: index)
        let target = min(max(0, index + steps), next.count)
        next.insert(code, at: target)
        order = next
        saveLocal()
    }

    func remove(_ code: String) {
        guard code != base else { return }
        hidden.insert(code)
        if code == convertSource { resetConvert() }
        saveLocal()
    }

    func add(_ code: String) {
        hidden.remove(code)
        if !order.contains(code) { order.append(code) }
        saveLocal()
    }

    func saveView() { saveLocal() }

    func saveTimes(start: Int, end: Int, step: Int?) {
        if let step, let hours = Self.expand(start: start, end: end, step: step), !hours.isEmpty {
            self.hours = hours
            timeStart = start
            timeEnd = end
            timeStep = step
            timesUserSet = true
        } else {
            timesUserSet = true
        }
        saveLocal()
    }

    func threshold(for code: String) -> AlarmThreshold {
        thresholds[code] ?? AlarmThreshold(enabled: false, down: 0.5, up: 0.25)
    }

    func setThreshold(_ value: AlarmThreshold, for code: String) {
        thresholds[code] = value
        saveLocal()
    }

    var catalog: [String] {
        let known = ["EUR", "USD", "GBP", "JPY", "CAD", "AUD", "NZD", "SEK", "NOK", "DKK", "PLN", "HUF", "TRY", "SGD", "MXN", "ZAR", "CNY", "HKD", "INR"]
        return known.filter { !visible.contains($0) }.sorted {
            CurrencyNames.name($0).localizedCompare(CurrencyNames.name($1)) == .orderedAscending
        }
    }

    private func hourlySeries(_ code: String, daysBack: Int) -> [RatePoint] {
        let today = Self.todayKey()
        guard let from = Self.addDays(today, -(daysBack - 1)) else { return [] }
        var points: [RatePoint] = []
        var day = from
        while day <= today {
            if let slots = days[day]?.slots {
                for hour in slots.keys.compactMap(Int.init).sorted() {
                    let key = String(format: "%02d", hour)
                    if code == base {
                        guard slots[key]?["EUR"] != nil || slots[key]?["USD"] != nil, let date = Self.dayDate(day, hour: hour) else { continue }
                        points.append(RatePoint(day: day, hour: hour, value: 1, raw: 1, date: date))
                    } else if let raw = slots[key]?[code], let value = cardRate(raw), let date = Self.dayDate(day, hour: hour) {
                        points.append(RatePoint(day: day, hour: hour, value: value, raw: raw, date: date))
                    }
                }
            }
            guard let next = Self.addDays(day, 1) else { break }
            day = next
        }
        if points.isEmpty, daysBack == 1 {
            for offset in 1..<12 {
                guard let older = Self.addDays(today, -offset) else { continue }
                let olderPoints = hourlySeries(code, on: older)
                if !olderPoints.isEmpty { return olderPoints }
            }
        }
        return points
    }

    private func hourlySeries(_ code: String, on day: String) -> [RatePoint] {
        guard let slots = days[day]?.slots else { return [] }
        return slots.keys.compactMap(Int.init).sorted().compactMap { hour in
            let key = String(format: "%02d", hour)
            if code == base {
                guard let date = Self.dayDate(day, hour: hour) else { return nil }
                return RatePoint(day: day, hour: hour, value: 1, raw: 1, date: date)
            }
            guard let raw = slots[key]?[code], let value = cardRate(raw), let date = Self.dayDate(day, hour: hour) else { return nil }
            return RatePoint(day: day, hour: hour, value: value, raw: raw, date: date)
        }
    }

    private func dailySeries(_ code: String, daysBack: Int) -> [RatePoint] {
        let today = Self.todayKey()
        guard let from = Self.addDays(today, -(daysBack - 1)) else { return [] }
        var points: [RatePoint] = []
        var day = from
        while day <= today {
            if code == base {
                if days[day]?.slots?["12"]?["EUR"] != nil || days[day]?.ecb?["EUR"] != nil, let date = Self.dayDate(day) {
                    points.append(RatePoint(day: day, hour: nil, value: 1, raw: 1, date: date))
                }
            } else if let raw = lastRaw(code, day), let value = cardRate(raw), let date = Self.dayDate(day) {
                points.append(RatePoint(day: day, hour: nil, value: value, raw: raw, date: date))
            }
            guard let next = Self.addDays(day, 1) else { break }
            day = next
        }
        return points
    }

    private func lastRaw(_ code: String, _ day: String) -> Double? {
        if let slots = days[day]?.slots {
            for hour in slots.keys.compactMap(Int.init).sorted(by: >) {
                if let raw = slots[String(format: "%02d", hour)]?[code] { return raw }
            }
        }
        return days[day]?.ecb?[code]
    }

    private func applyFirstInstall() {
        let region = Locale.current.region?.identifier ?? "CH"
        let europe: Set<String> = ["DE", "FR", "IT", "AT", "ES", "NL", "BE", "PT", "IE", "FI", "GR", "LU"]
        if region == "CH" || region == "LI" {
            base = "CHF"
            order = ["CHF", "EUR", "USD", "GBP"]
        } else if europe.contains(region) {
            base = "EUR"
            order = ["EUR", "USD", "GBP", "CHF"]
        } else if region == "GB" {
            base = "GBP"
            order = ["GBP", "EUR", "USD", "CHF"]
        } else if region == "US" || region == "CA" {
            base = region == "CA" ? "CAD" : "USD"
            order = [base, "USD", "EUR", "GBP", "CHF"].reduce(into: [String]()) { acc, code in
                if !acc.contains(code) { acc.append(code) }
            }
        } else {
            base = "CHF"
            order = ["CHF", "EUR", "USD", "GBP"]
        }
        saveLocal()
    }

    private func loadLocal() {
        if let saved = defaults.string(forKey: "wu.baseCurrency"), saved.count == 3 { base = saved }
        if let data = defaults.data(forKey: "wu.currencyOrder"),
           let list = try? JSONDecoder().decode([String].self, from: data), !list.isEmpty {
            order = list
        }
        if let data = defaults.data(forKey: "wu.currencyHidden"),
           let list = try? JSONDecoder().decode([String].self, from: data) {
            hidden = Set(list)
        }
        if defaults.object(forKey: "wu.showChart") != nil { showChart = defaults.bool(forKey: "wu.showChart") }
        if defaults.object(forKey: "wu.showIntervals") != nil { showIntervals = defaults.bool(forKey: "wu.showIntervals") }
        if defaults.object(forKey: "wu.showForecast") != nil { showForecast = defaults.bool(forKey: "wu.showForecast") }
        if defaults.object(forKey: "wu.showReference") != nil { showReference = defaults.bool(forKey: "wu.showReference") }
        if let raw = defaults.string(forKey: "wu.chartSpan"), let span = ChartSpan(rawValue: raw) { self.span = span }
        if let data = defaults.data(forKey: "wu.hours"), let list = try? JSONDecoder().decode([Int].self, from: data), !list.isEmpty {
            hours = list
            timesUserSet = defaults.bool(forKey: "wu.timesUserSet")
        }
        timeStart = defaults.object(forKey: "wu.timeStart") as? Int ?? 7
        timeEnd = defaults.object(forKey: "wu.timeEnd") as? Int ?? 17
        if defaults.object(forKey: "wu.timeStep") != nil { timeStep = defaults.integer(forKey: "wu.timeStep") }
        if defaults.object(forKey: "wu.alertsMaster") != nil { alertsMaster = defaults.bool(forKey: "wu.alertsMaster") }
        if let data = defaults.data(forKey: "wu.thresholds"),
           let map = try? JSONDecoder().decode([String: AlarmThreshold].self, from: data) {
            thresholds = map
        }
        topic = defaults.string(forKey: "wu.alertTopic") ?? ""
    }

    private func saveLocal() {
        defaults.set(base, forKey: "wu.baseCurrency")
        if let data = try? JSONEncoder().encode(order) { defaults.set(data, forKey: "wu.currencyOrder") }
        if let data = try? JSONEncoder().encode(Array(hidden)) { defaults.set(data, forKey: "wu.currencyHidden") }
        defaults.set(showChart, forKey: "wu.showChart")
        defaults.set(showIntervals, forKey: "wu.showIntervals")
        defaults.set(showForecast, forKey: "wu.showForecast")
        defaults.set(showReference, forKey: "wu.showReference")
        defaults.set(span.rawValue, forKey: "wu.chartSpan")
        if let data = try? JSONEncoder().encode(hours) { defaults.set(data, forKey: "wu.hours") }
        defaults.set(timesUserSet, forKey: "wu.timesUserSet")
        defaults.set(timeStart, forKey: "wu.timeStart")
        defaults.set(timeEnd, forKey: "wu.timeEnd")
        if let timeStep { defaults.set(timeStep, forKey: "wu.timeStep") }
        defaults.set(alertsMaster, forKey: "wu.alertsMaster")
        if let data = try? JSONEncoder().encode(thresholds) { defaults.set(data, forKey: "wu.thresholds") }
        defaults.set(topic, forKey: "wu.alertTopic")
    }

    static func expand(start: Int, end: Int, step: Int) -> [Int]? {
        let steps = [1, 2, 3, 4, 5, 8, 12, 24]
        guard steps.contains(step), start < end, start >= 0, end <= 23 else { return nil }
        return Array(stride(from: start, through: end, by: step))
    }

    static func todayKey() -> String {
        let fmt = DateFormatter()
        fmt.calendar = Calendar(identifier: .gregorian)
        fmt.timeZone = TimeZone(identifier: "Europe/Zurich")
        fmt.dateFormat = "yyyy-MM-dd"
        return fmt.string(from: Date())
    }

    static func addDays(_ key: String, _ count: Int) -> String? {
        let fmt = DateFormatter()
        fmt.calendar = Calendar(identifier: .gregorian)
        fmt.timeZone = TimeZone(identifier: "UTC")
        fmt.dateFormat = "yyyy-MM-dd"
        guard let date = fmt.date(from: key), let next = Calendar(identifier: .gregorian).date(byAdding: .day, value: count, to: date) else { return nil }
        return fmt.string(from: next)
    }

    static func dayDate(_ key: String, hour: Int? = nil) -> Date? {
        var parts = DateComponents()
        let bits = key.split(separator: "-")
        guard bits.count == 3, let y = Int(bits[0]), let m = Int(bits[1]), let d = Int(bits[2]) else { return nil }
        parts.year = y
        parts.month = m
        parts.day = d
        parts.hour = hour ?? 12
        parts.timeZone = TimeZone(identifier: "Europe/Zurich")
        return Calendar(identifier: .gregorian).date(from: parts)
    }

    static func hex(_ bytes: Int) -> String {
        (0..<bytes).map { _ in String(format: "%02x", UInt8.random(in: 0...255)) }.joined()
    }
}
