import Foundation
import UIKit
import UserNotifications
import WidgetKit

@MainActor
final class RatesStore: ObservableObject {
    static let origin = URL(string: "https://waehrungen.bigyok61.workers.dev")!

    @Published var base = "CHF"
    @Published var order: [String] = ["CHF", "EUR", "USD", "GBP"]
    @Published var hidden: Set<String> = []
    @Published var showCompare = false
    @Published var showChart = false
    @Published var showIntervals = false
    @Published var showForecast = false
    @Published var showReference = false
    @Published var span: ChartSpan = .month
    /// Own period of the comparison chart ('Entwicklung der Währungen'), independent of `span`.
    @Published var compareSpan: ChartSpan = .month
    /// ON (default): one period for every currency chart. OFF: each currency keeps its own (`codeSpans`).
    @Published var sameSpan = true
    @Published var codeSpans: [String: ChartSpan] = [:]
    /// Percent move from which changes are coloured (0.00…2.00, default 0.10).
    @Published var colorThreshold = 0.10
    @Published var colorChanges = true
    private var reloading = false
    private var lastReload = Date.distantPast
    /// Currency whose detail sheet is open (transient), so its history loads even without list charts.
    @Published var detailCode: String?
    /// Duo: the comparison chart is shown on the right (transient), so its history loads even when the list chart is off.
    @Published var compareWanted = false
    @Published var hours: [Int] = [7, 12, 17]
    @Published var timesUserSet = false
    @Published var timeStart = 7
    @Published var timeEnd = 17
    @Published var timeStep: Int? = nil
    @Published var alertsMaster = true
    @Published var thresholds: [String: AlarmThreshold] = [:]
    @Published var topic = ""
    /// Apple push for FX alarms on this device. Per device, never synced via iCloud.
    @Published var pushEnabled = true
    @Published var pushAuthorization: UNAuthorizationStatus = .notDetermined
    /// APNs device token (hex). Per device, never synced.
    private(set) var pushToken: String?
    @Published var alertId = ""
    @Published var alertSyncError: String?
    @Published var fired: [String: String] = [:]
    @Published var updated = ""
    @Published var errorText = ""
    /// Session-only converter. Never written to UserDefaults; a launch starts at one quote lot of the reporting currency.
    @Published var convertSource = "CHF"
    @Published var convertAmount = 1.0
    @Published var convertDraft = "1"
    @Published var convertEditing = false
    /// Past-days swipe: number of trading days swiped back (0 = only today). Shared by every currency, never persisted.
    @Published var dayOffset = 0
    var convertReplace = false

    private var days: [String: DayFile] = [:]
    /// Latest 15-minute live mid from the worker (CHF per unit), if any.
    private var live: LiveBlock?
    private var historyCache: [String: [RatePoint]] = [:]
    private var alertSyncTask: Task<Void, Never>?
    private var alertSyncGeneration = 0
    /// Local thresholds are newer than the last successful Worker POST. A later GET must not overwrite them.
    private var alertsDirty = false
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

    struct LiveBlock: Decodable {
        var at: String
        var rates: [String: Double]
    }

    struct RatesFile: Decodable {
        var days: [String: DayFile]
        var updated: String?
        var live: LiveBlock?
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
        let day = DateFormatter()
        day.locale = Locale(identifier: "de_CH")
        day.timeZone = .current
        day.dateFormat = "dd.MM.yyyy"
        // Time follows the device's region: 14:32 or 2:32 PM
        let time = DateFormatter()
        time.locale = .current
        time.timeZone = .current
        time.setLocalizedDateFormatFromTemplate("jmm")
        return "Kurs zuletzt aktualisiert am: \(day.string(from: date))   \(time.string(from: date))"
    }

    init() {
        loadLocal()
        WidgetShared.publish(base: base, visible: visible)
        let localAlerts = (alertsMaster, try? JSONEncoder().encode(thresholds))
        let adopted = startCloudSync()
        if !adopted && defaults.object(forKey: "wu.baseCurrency") == nil && defaults.object(forKey: "wu.currencyOrder") == nil {
            applyFirstInstall()
        }
        ensureAlertIdentity()
        resetConvert()
        if !adopted {
            pushToCloud()
        } else if localAlerts.0 != alertsMaster || localAlerts.1 != (try? JSONEncoder().encode(thresholds)) {
            // thresholds came from another device: register them with the worker for this device
            scheduleAlertSync()
        }
    }

    // MARK: - iCloud key-value sync

    /// Settings shared across the user's devices. Per-device identities (wu.alertTopic, wu.alertId,
    /// wu.apnsToken, wu.pushEnabled)
    /// and transient state (dayOffset) are deliberately not synced.
    static let cloudKeys: [String] = [
        "wu.baseCurrency", "wu.currencyOrder", "wu.currencyHidden",
        "wu.showCompare", "wu.showChart", "wu.showIntervals", "wu.showForecast", "wu.showReference",
        "wu.chartSpan", "wu.compareSpan", "wu.sameSpan", "wu.codeSpans", "wu.colorThreshold", "wu.colorChanges",
        "wu.hours", "wu.timesUserSet", "wu.timeStart", "wu.timeEnd", "wu.timeStep",
        "wu.alertsMaster", "wu.thresholds",
    ]
    private static let cloudAlertKeys: Set<String> = ["wu.alertsMaster", "wu.thresholds"]
    private let cloud = NSUbiquitousKeyValueStore.default
    private var applyingCloud = false
    private var cloudObserver: NSObjectProtocol?

    /// Observes remote changes, synchronizes, and adopts iCloud data when there is any. Returns true if adopted.
    private func startCloudSync() -> Bool {
        cloudObserver = NotificationCenter.default.addObserver(
            forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: NSUbiquitousKeyValueStore.default,
            queue: .main
        ) { [weak self] note in
            let reason = note.userInfo?[NSUbiquitousKeyValueStoreChangeReasonKey] as? Int
            let keys = note.userInfo?[NSUbiquitousKeyValueStoreChangedKeysKey] as? [String] ?? []
            MainActor.assumeIsolated {
                self?.cloudChanged(reason: reason, keys: keys)
            }
        }
        cloud.synchronize()
        let present = Self.cloudKeys.filter { cloud.object(forKey: $0) != nil }
        guard !present.isEmpty else { return false }
        applyCloud(keys: present, notifyWorker: false)
        return true
    }

    private func cloudChanged(reason: Int?, keys: [String]) {
        if reason == NSUbiquitousKeyValueStoreQuotaViolationChange || reason == NSUbiquitousKeyValueStoreAccountChange && keys.isEmpty {
            return
        }
        let relevant = keys.filter { Self.cloudKeys.contains($0) }
        guard !relevant.isEmpty else { return }
        applyCloud(keys: relevant, notifyWorker: true)
    }

    /// Copies iCloud values into UserDefaults and re-reads them. Never writes back (no echo).
    private func applyCloud(keys: [String], notifyWorker: Bool) {
        applyingCloud = true
        defer { applyingCloud = false }
        for key in keys {
            if let value = cloud.object(forKey: key) {
                defaults.set(value, forKey: key)
            } else {
                defaults.removeObject(forKey: key)
            }
        }
        if keys.contains("wu.timeStep") && cloud.object(forKey: "wu.timeStep") == nil { timeStep = nil }
        loadLocal()
        if notifyWorker {
            if !Self.cloudAlertKeys.isDisjoint(with: keys) { scheduleAlertSync() }
            dayOffset = min(dayOffset, intervalDays.count - 1)
            dataGeneration += 1
            seriesCache.removeAll()
            Task { await self.loadHistoryIfNeeded() }
        }
    }

    /// Mirrors the synced keys from UserDefaults to iCloud. Called after every local save.
    private func pushToCloud() {
        guard !applyingCloud else { return }
        for key in Self.cloudKeys {
            if let value = defaults.object(forKey: key) {
                cloud.set(value, forKey: key)
            } else {
                cloud.removeObject(forKey: key)
            }
        }
    }

    var isDefaultConvert: Bool {
        convertSource == base && abs(convertAmount - quoteLot(base)) < 0.0000005
    }

    var showConvertPill: Bool { !isDefaultConvert }

    /// True while the entered money is still one quote lot of the reporting currency, so the list keeps the unit rates.
    var showsUnitRates: Bool {
        guard let value = valueInBase() else { return isDefaultConvert }
        return abs(value - quoteLot(base)) < 0.0000005
    }

    var convertPillText: String {
        "\(Self.formatPill(convertAmount)) \(convertSource) umgerechnet"
    }

    func beginConvert(_ code: String) {
        if convertEditing && convertSource == code { return }
        convertSource = code
        convertAmount = 0
        convertDraft = ""
        convertReplace = false
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
        if let value = Self.parseAmount(convertDraft), value > 0 {
            convertAmount = value
            convertEditing = false
            convertReplace = false
        } else {
            resetConvert()
        }
    }

    func resetConvert() {
        convertSource = base
        let lot = quoteLot(base)
        convertAmount = lot
        convertDraft = Self.draftString(lot)
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
            return "\(formatRate(value)) \(base)"
        }
        guard let value = converted(code) else { return "–" }
        return "\(Self.formatMoney(value)) \(code)"
    }

    /// `1 CHF = 1,0728 EUR`. Stays the per-unit inverse while converting.
    func secondaryText(_ code: String) -> String {
        if code == base { return "" }
        guard let per = quote(code).raw, abs(per) > 0.00005 else { return "–" }
        return "1 \(base) = \(formatRate(1 / per)) \(code)"
    }

    /// Hourly capture first. Until that exists, the newest ECB reference (CHF per 1 unit).
    private func chfPerUnit(_ code: String) -> Double? {
        if code == "CHF" { return 1 }
        let today = Self.todayKey()
        for offset in 0..<45 {
            guard let day = Self.addDays(today, -offset), let slots = days[day]?.slots else { continue }
            let hours = slots.keys.compactMap(Int.init).sorted(by: >)
            for hour in hours {
                if let raw = slots[String(format: "%02d", hour)]?[code], raw > 0 {
                    // the 15-minute live mid wins when it is newer than this whole-hour slot
                    if let liveRaw = liveRate(code, newerThan: Self.zurichSlotDate(day, hour: hour)) { return liveRaw }
                    return raw
                }
            }
        }
        if let liveRaw = liveRate(code, newerThan: nil) { return liveRaw }
        for offset in 0..<45 {
            guard let day = Self.addDays(today, -offset),
                  let raw = days[day]?.ecb?[code], raw > 0 else { continue }
            return raw
        }
        return nil
    }

    private static let liveISO: ISO8601DateFormatter = {
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withInternetDateTime]
        return fmt
    }()

    private func liveRate(_ code: String, newerThan slot: Date?) -> Double? {
        guard let live, let raw = live.rates[code], raw > 0, let at = Self.liveISO.date(from: live.at),
              at <= Date().addingTimeInterval(600) else { return nil }
        if let slot, at <= slot { return nil }
        return raw
    }

    static func zurichSlotDate(_ day: String, hour: Int) -> Date? {
        let bits = day.split(separator: "-").compactMap { Int($0) }
        guard bits.count == 3 else { return nil }
        var cal = gregorian
        cal.timeZone = zurichZone
        return cal.date(from: DateComponents(year: bits[0], month: bits[1], day: bits[2], hour: hour))
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

    /// App became active: fetch fresh rates without touching an open conversion. No overlapping reloads.
    func reloadOnActivate() async {
        guard !reloading, Date().timeIntervalSince(lastReload) > 20 else { return }
        await reload(resetUI: false)
    }

    private var liveTimer: Task<Void, Never>?

    /// Foreground only: fresh live rate every 60 s (the Worker caches biquote for 60 s). Stopped in the background.
    func startLiveTimer() {
        guard liveTimer == nil else { return }
        liveTimer = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                guard !Task.isCancelled, let self else { return }
                await self.reload(resetUI: false)
            }
        }
    }

    func stopLiveTimer() {
        liveTimer?.cancel()
        liveTimer = nil
    }

    func reload(resetUI: Bool = true) async {
        guard !reloading else { return }
        reloading = true
        defer { reloading = false; lastReload = Date() }
        if resetUI {
            resetConvert()
            dayOffset = 0
        }
        do {
            let url = Self.origin.appendingPathComponent("data/rates.json")
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                throw URLError(.badServerResponse)
            }
            let file = try JSONDecoder().decode(RatesFile.self, from: data)
            days = file.days
            live = file.live
            dataGeneration += 1
            seriesCache.removeAll()
            updated = file.updated ?? ""
            errorText = ""
            publishToWidgets(force: true)
            await loadHistoryIfNeeded()
        } catch {
            errorText = "Die Kurse konnten nicht geladen werden."
        }
    }

    func loadHistoryIfNeeded() async {
        let foreign = visible.filter { $0 != base }
        var pairs: [(String, ChartSpan)] = []
        if showChart { pairs += foreign.map { ($0, span(for: $0)) } }
        if let detailCode { pairs.append((detailCode, span(for: detailCode))) }
        if showCompare || compareWanted { pairs += foreign.map { ($0, compareSpan) } }
        pairs.removeAll { $0.1 == .day || $0.1 == .week }
        guard !pairs.isEmpty else { return }
        if base != "CHF" {
            var used: [ChartSpan] = []
            for pair in pairs where !used.contains(pair.1) { used.append(pair.1) }
            pairs += used.map { (base, $0) }
        }
        for (code, span) in pairs {
            if historyCache["\(code)|\(span.query)"] != nil { continue }
            await fetchHistory(code: code, span: span)
        }
        objectWillChange.send()
    }

    /// Chart period of one currency: the shared one, or its own when "Gleicher Zeitraum" is off.
    func span(for code: String) -> ChartSpan {
        sameSpan ? span : (codeSpans[code] ?? span)
    }

    func setSpan(_ value: ChartSpan, for code: String) {
        guard value != span(for: code) else { return }
        if sameSpan { span = value } else { codeSpans[code] = value }
        saveView()
        Task { await loadHistoryIfNeeded() }
    }

    func setSameSpan(_ on: Bool) {
        sameSpan = on
        saveView()
        Task { await loadHistoryIfNeeded() }
    }

    func wantCompare(_ on: Bool) {
        compareWanted = on
        if on { Task { await loadHistoryIfNeeded() } }
    }

    func openDetail(_ code: String?) {
        detailCode = code
        if code != nil { Task { await loadHistoryIfNeeded() } }
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
                guard let date = Self.dayDate(day) else { return nil }
                return RatePoint(day: day, hour: nil, value: raw, raw: raw, date: date)
            }
            historyCache["\(code)|\(span.query)"] = points
            dataGeneration += 1
            seriesCache.removeAll()
        } catch { /* lokale Reihe bleibt die Anzeige */ }
    }

    func quote(_ code: String) -> Quote {
        if code == base { return Quote(value: 1, raw: 1) }
        guard let per = reportingPerUnit(code), let value = directPrice(code, per) else { return Quote(value: nil, raw: nil) }
        return Quote(value: value, raw: per)
    }

    /// Move from the first rate after local midnight to the shown price.
    func dayChange(_ code: String) -> (text: String, delta: Double, percent: Double)? {
        guard code != base, let close = quote(code).value, abs(close) > 0.00005 else { return nil }
        guard let open = dayOpen(code), abs(open) > 0.00005 else { return nil }
        let delta = close - open
        let percent = delta / open * 100
        let text = dayChangeText(delta, percent: percent, currency: base)
        return (text, delta, percent)
    }

    func setColorChanges(_ on: Bool) {
        guard on != colorChanges else { return }
        colorChanges = on
        saveView()
        WidgetCenter.shared.reloadAllTimelines()
    }

    func setColorThreshold(_ value: Double) {
        let v = min(max((value * 100).rounded() / 100, 0), 2)
        guard v != colorThreshold else { return }
        colorThreshold = v
        saveView()
        WidgetCenter.shared.reloadAllTimelines()
    }

    private func priceAt(_ code: String, day: String, hour: Int) -> Double? {
        let key = String(format: "%02d", hour)
        guard let chf = days[day]?.slots?[key]?[code], chf > 0,
              let per = reportingFromCHF(chf, day: day, hourKey: key) else { return nil }
        return directPrice(code, per)
    }

    /// First stored Zurich slot at or after local midnight. A half-hour zone uses the next hour, not the one before midnight.
    private func dayOpen(_ code: String) -> Double? {
        let today = Self.localTodayKey()
        for offset in 0..<12 {
            guard let day = Self.addDays(today, -offset),
                  let from = Self.localWall(day, hour: 0),
                  let next = Self.addDays(day, 1),
                  let until = Self.localWall(next, hour: 0),
                  let price = firstPrice(code, from: from, until: until) else { continue }
            return price
        }
        return nil
    }

    static let maxPastTradingDays = 7

    /// Today plus up to 7 previous weekdays (Sa/So skipped), newest first.
    var intervalDays: [String] {
        let today = Self.localTodayKey()
        var keys = [today]
        var cursor = today
        var guardSteps = 0
        while keys.count <= Self.maxPastTradingDays, guardSteps < 20 {
            guardSteps += 1
            guard let prev = Self.addDays(cursor, -1) else { break }
            cursor = prev
            if let date = Self.dayDate(prev, hour: 12) {
                var cal = Self.gregorian
                cal.timeZone = Self.zurichZone
                if cal.isDateInWeekend(date) { continue }
            }
            keys.append(prev)
        }
        return keys
    }

    /// Returns true if the number of swiped-in past days changed.
    @discardableResult
    func pageDays(by step: Int) -> Bool {
        let next = min(max(dayOffset + step, 0), intervalDays.count - 1)
        guard next != dayOffset else { return false }
        dayOffset = next
        return true
    }

    /// Past trading days shown left of today, oldest first. `capacity` = columns that fit.
    func visiblePastDays(capacity: Int) -> [String] {
        let list = intervalDays
        let n = min(dayOffset, list.count - 1)
        guard n > 0, capacity > 0 else { return [] }
        let newest = max(1, n - capacity + 1)
        return (newest...n).reversed().map { list[$0] }
    }

    private static let pastWeekdayFormatter: DateFormatter = {
        let fmt = DateFormatter()
        fmt.locale = .autoupdatingCurrent
        fmt.timeZone = zurichZone
        fmt.setLocalizedDateFormatFromTemplate("EEE")
        return fmt
    }()

    private static let pastDayMonthFormatter: DateFormatter = {
        let fmt = DateFormatter()
        fmt.locale = .autoupdatingCurrent
        fmt.timeZone = zurichZone
        fmt.setLocalizedDateFormatFromTemplate("dM")
        return fmt
    }()

    /// Short column header, e.g. 'Fr 9.10.' (German) or 'Fri 10/9' (US English).
    func pastDayHeader(_ day: String) -> String {
        guard let date = Self.dayDate(day, hour: 12) else { return day }
        var weekday = Self.pastWeekdayFormatter.string(from: date)
        if weekday.hasSuffix(".") { weekday.removeLast() }
        return "\(weekday) \(Self.pastDayMonthFormatter.string(from: date))"
    }

    /// Value of one interval hour on exactly `day` (no fallback to older days).
    func intervalValue(_ code: String, hour: Int, on day: String) -> Double? {
        if code == base { return 1 }
        guard let from = Self.localWall(day, hour: hour) else { return nil }
        let until: Date? = hour < 23 ? Self.localWall(day, hour: hour + 1)
            : Self.addDays(day, 1).flatMap { Self.localWall($0, hour: 0) }
        guard let until else { return nil }
        return firstPrice(code, from: from, until: until)
    }

    /// True when today's slot `hour` has already begun. Later slots must stay empty («–»).
    func hourReached(_ hour: Int, now: Date = Date()) -> Bool {
        guard let start = Self.localWall(Self.localTodayKey(), hour: hour) else { return true }
        return start <= now
    }

    /// Today's column. Only slots already reached: the fallback to earlier days must not fill future hours.
    func intervalValue(_ code: String, hour: Int) -> Double? {
        guard hourReached(hour) else { return nil }
        if code == base { return 1 }
        let today = Self.localTodayKey()
        for offset in 0..<12 {
            guard let day = Self.addDays(today, -offset),
                  let from = Self.localWall(day, hour: hour) else { continue }
            let until: Date?
            if hour < 23 {
                until = Self.localWall(day, hour: hour + 1)
            } else if let next = Self.addDays(day, 1) {
                until = Self.localWall(next, hour: 0)
            } else {
                until = nil
            }
            guard let until, let price = firstPrice(code, from: from, until: until) else { continue }
            return price
        }
        return nil
    }

    /// Earliest stored rate whose Zurich timestamp is in `[from, until)`.
    private func firstPrice(_ code: String, from: Date, until: Date) -> Double? {
        guard let start = Self.addDays(Self.zurichKey(from), -1) else { return nil }
        let end = Self.zurichKey(until)
        var bestAt: Date?
        var best: Double?
        var day = start
        while day <= end {
            if let slots = days[day]?.slots {
                for (key, codes) in slots {
                    guard let hour = Int(key), (codes[code] ?? 0) > 0,
                          let instant = Self.dayDate(day, hour: hour),
                          instant >= from, instant < until,
                          let price = priceAt(code, day: day, hour: hour) else { continue }
                    if bestAt == nil || instant < bestAt! {
                        bestAt = instant
                        best = price
                    }
                }
            }
            guard let next = Self.addDays(day, 1) else { break }
            day = next
        }
        return best
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
        let basis = dayOpen(code)
        let todayV = directPrice(code, forecastInReporting(day.forecast?[code], day: day))
        let weekV = directPrice(code, forecastInReporting(day.forecast7?[code], day: day))
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
            guard let chf = days[day]?.ecb?[code], chf > 0 else { continue }
            let per: Double?
            if base == "CHF" {
                per = chf
            } else if let den = days[day]?.ecb?[base] ?? chfPerUnit(base), abs(den) > 0.00005 {
                per = chf / den
            } else {
                per = nil
            }
            if let price = directPrice(code, per) { return price }
        }
        return nil
    }

    /// Bumped whenever `days` or `historyCache` change; part of the series cache key.
    private var dataGeneration = 0
    private var seriesCache: [String: [RatePoint]] = [:]

    /// `span` nil = the per-currency chart period.
    func series(_ code: String, span requested: ChartSpan? = nil) -> [RatePoint] {
        let span = requested ?? self.span(for: code)
        let key = "\(code)|\(span.query)|\(base)|\(dataGeneration)|\(Self.todayKey())"
        if let hit = seriesCache[key] { return hit }
        let result = computeSeries(code, span: span)
        if seriesCache.count > 200 { seriesCache.removeAll() }
        seriesCache[key] = result
        return result
    }

    private func computeSeries(_ code: String, span: ChartSpan) -> [RatePoint] {
        if span == .day || span == .week {
            return hourlySeries(code, daysBack: span.dayCount)
        }
        let remote = historyCache["\(code)|\(span.query)"] ?? []
        let local = dailySeries(code, daysBack: span.dayCount)
        if code != base, remote.count > local.count {
            let mapped = remote.compactMap { pricedRemote(code, $0, span: span) }
            if mapped.count > local.count { return mapped }
        }
        return local
    }

    /// `ids` includes the comparison-chart row when it is on the list. That row is not a currency.
    func moveBoard(ids: [String], from source: IndexSet, to destination: Int) {
        var rows = ids
        rows.move(fromOffsets: source, toOffset: destination)
        let shown = rows.filter { $0 != "compare" }
        order = shown + order.filter { !shown.contains($0) }
        if let top = shown.first, top != base {
            base = top
            resetConvert()
            scheduleAlertSync()
            Task { await loadHistoryIfNeeded() }
        }
        saveLocal()
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

    /// Stable device id (64 hex) and server alert topic id (`wae-` + 32 hex, used for registration only). Separate from the web app's topic.
    func ensureAlertIdentity() {
        var changed = false
        if !Self.validTopic(topic) {
            topic = "wae-" + Self.hex(16)
            changed = true
        }
        if !Self.validAlertId(alertId) {
            alertId = Self.hex(32)
            changed = true
        }
        if changed { saveLocal() }
    }

    /// Reads this device's subscription. A missing subscription is not an error.
    func loadRemoteAlerts() async -> String? {
        ensureAlertIdentity()
        do {
            guard let remote = try await fetchAlerts() else { return nil }
            if alertsDirty { return nil }
            if let remoteTopic = remote.topic, Self.validTopic(remoteTopic) {
                topic = remoteTopic
            }
            for code in Self.alertCodes {
                guard let level = remote.currencies?[code] else { continue }
                thresholds[code] = AlarmThreshold(enabled: level.enabled, down: level.down, up: level.up)
            }
            saveLocal()
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    /// Stores the current switches locally and registers every biquote currency with the Worker.
    func registerAlerts() async throws {
        ensureAlertIdentity()
        guard pushEnabled else {
            // Mitteilungen aus: Abo auf dem Server entfernen, damit keine Pushes mehr kommen.
            saveLocal()
            _ = try await alertCall(method: "DELETE", body: nil)
            return
        }
        let payload = try alertPayload()
        saveLocal()
        let body = try JSONEncoder().encode(payload)
        _ = try await alertCall(method: "POST", body: body)
    }

    /// Posts the current USD/EUR subscription after edits settle.
    func scheduleAlertSync() {
        alertsDirty = true
        alertSyncError = nil
        alertSyncGeneration += 1
        let generation = alertSyncGeneration
        alertSyncTask?.cancel()
        alertSyncTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled, let self, generation == self.alertSyncGeneration else { return }
            await self.performAlertSync(generation: generation)
        }
    }

    /// Cancels a pending debounce and registers immediately. No-op when nothing changed.
    func flushAlertSync() async {
        alertSyncGeneration += 1
        let generation = alertSyncGeneration
        alertSyncTask?.cancel()
        alertSyncTask = nil
        await performAlertSync(generation: generation)
    }

    private func performAlertSync(generation: Int) async {
        guard alertsDirty else { return }
        do {
            try await registerAlerts()
            guard generation == alertSyncGeneration else { return }
            alertsDirty = false
            alertSyncError = nil
        } catch is CancellationError {
            return
        } catch {
            guard generation == alertSyncGeneration else { return }
            alertSyncError = error.localizedDescription
        }
    }

    func sendRemoteTestPush() async throws {
        guard pushEnabled else { throw AlertSyncError.server("Mitteilungen sind ausgeschaltet.") }
        alertSyncGeneration += 1
        alertSyncTask?.cancel()
        alertSyncTask = nil
        try await registerAlerts()
        alertsDirty = false
        alertSyncError = nil
        _ = try await alertCall(method: "POST", test: true, body: nil)
    }

    private func fetchAlerts() async throws -> RemoteAlerts? {
        do {
            let data = try await alertCall(method: "GET", body: nil)
            return try JSONDecoder().decode(RemoteAlerts.self, from: data)
        } catch AlertSyncError.missing {
            return nil
        }
    }

    /// Worker cron evaluates every biquote code in the subscription. CNY, HKD and INR have no live quote and stay on the device. Master off keeps the subscription and stores `enabled: false`.
    private func alertPayload() throws -> AlertUpload {
        func level(_ code: String) throws -> AlertUpload.Level {
            let entry = threshold(for: code)
            let down = (entry.down * 100).rounded() / 100
            let up = (entry.up * 100).rounded() / 100
            guard down > 0, down <= 20, up > 0, up <= 20 else { throw AlertSyncError.invalidThreshold(code) }
            let enabled = alertsMaster && visible.contains(code) && entry.enabled
            return AlertUpload.Level(enabled: enabled, down: down, up: up)
        }
        var currencies: [String: AlertUpload.Level] = [:]
        for code in Self.alertCodes {
            currencies[code] = try level(code)
        }
        return AlertUpload(
            topic: topic, start: timeStart, base: base, timeZone: TimeZone.current.identifier, currencies: currencies,
            apnsToken: pushToken, apnsEnv: pushToken == nil ? nil : Self.apnsEnvironment
        )
    }

    private func alertCall(method: String, test: Bool = false, body: Data?) async throws -> Data {
        let suffix = test ? "/test" : ""
        guard let url = URL(string: "\(Self.origin.absoluteString)/api/alerts/\(alertId)\(suffix)") else {
            throw AlertSyncError.network
        }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
        request.httpMethod = method
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = body
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw AlertSyncError.network
        }
        guard let http = response as? HTTPURLResponse else { throw AlertSyncError.network }
        if http.statusCode == 404 && method == "GET" { throw AlertSyncError.missing }
        guard (200..<300).contains(http.statusCode) else {
            let detail = (try? JSONDecoder().decode(AlertErrorBody.self, from: data))?.error
            let text = (detail?.isEmpty == false) ? detail! : "HTTP \(http.statusCode)"
            throw AlertSyncError.server(text)
        }
        return data
    }

    static let alertCodes = ["USD", "EUR", "GBP", "AUD", "CAD", "NZD", "SEK", "JPY", "NOK", "DKK", "PLN", "HUF", "TRY", "SGD", "MXN", "ZAR"]

    static func validAlertId(_ id: String) -> Bool {
        id.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil
    }

    // MARK: - Apple push (APNs)

    /// Xcode debug builds talk to the APNs sandbox, everything else (TestFlight, App Store) to production.
    static var apnsEnvironment: String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }

    func refreshPushAuthorization() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        pushAuthorization = settings.authorizationStatus
        if pushEnabled && (pushAuthorization == .authorized || pushAuthorization == .provisional || pushAuthorization == .ephemeral) {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    /// Asks for permission once (system dialog only while undetermined), then registers with APNs.
    func requestPushPermission() async {
        let center = UNUserNotificationCenter.current()
        if (await center.notificationSettings()).authorizationStatus == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
        }
        await refreshPushAuthorization()
    }

    func setPushEnabled(_ on: Bool) {
        guard on != pushEnabled else { return }
        pushEnabled = on
        saveLocal()
        scheduleAlertSync()
        if on { Task { await requestPushPermission() } }
    }

    /// Called from the app delegate with the APNs token.
    func didRegisterPushToken(_ data: Data) {
        let token = data.map { String(format: "%02x", $0) }.joined()
        guard token != pushToken else { return }
        pushToken = token
        defaults.set(token, forKey: "wu.apnsToken")
        if pushEnabled { scheduleAlertSync() }
    }

    static func validTopic(_ topic: String) -> Bool {
        topic.range(of: "^wae-[a-f0-9]{32}$", options: .regularExpression) != nil
    }

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

    /// An enabled FX alarm exists for this shown foreign currency (list bell).
    func hasActiveAlarm(_ code: String) -> Bool {
        guard alertsMaster, code != base, let t = thresholds[code] else { return false }
        return t.enabled
    }

    func threshold(for code: String) -> AlarmThreshold {
        thresholds[code] ?? AlarmThreshold(enabled: false, down: 0.5, up: 0.25)
    }

    func setThreshold(_ value: AlarmThreshold, for code: String) {
        thresholds[code] = value
        saveLocal()
        scheduleAlertSync()
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
        for day in storedDays(from: from, through: today) {
            if let slots = days[day]?.slots {
                for hour in slots.keys.compactMap(Int.init).sorted() {
                    let key = String(format: "%02d", hour)
                    if code == base {
                        guard slots[key]?["EUR"] != nil || slots[key]?["USD"] != nil, let date = Self.dayDate(day, hour: hour) else { continue }
                        points.append(RatePoint(day: day, hour: hour, value: 1, raw: 1, date: date))
                    } else if let chf = slots[key]?[code], chf > 0,
                              let per = reportingFromCHF(chf, day: day, hourKey: key),
                              let value = directPrice(code, per),
                              let date = Self.dayDate(day, hour: hour) {
                        points.append(RatePoint(day: day, hour: hour, value: value, raw: per, date: date))
                    }
                }
            }
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
            guard let chf = slots[key]?[code], chf > 0,
                  let per = reportingFromCHF(chf, day: day, hourKey: key),
                  let value = directPrice(code, per),
                  let date = Self.dayDate(day, hour: hour) else { return nil }
            return RatePoint(day: day, hour: hour, value: value, raw: per, date: date)
        }
    }

    private func dailySeries(_ code: String, daysBack: Int) -> [RatePoint] {
        let today = Self.todayKey()
        guard let from = Self.addDays(today, -(daysBack - 1)) else { return [] }
        var points: [RatePoint] = []
        for day in storedDays(from: from, through: today) {
            if code == base {
                if days[day]?.slots?["12"]?["EUR"] != nil || days[day]?.ecb?["EUR"] != nil, let date = Self.dayDate(day) {
                    points.append(RatePoint(day: day, hour: nil, value: 1, raw: 1, date: date))
                }
            } else if let chf = lastRaw(code, day),
                      let per = reportingFromCHF(chf, day: day, hourKey: nil),
                      let value = directPrice(code, per),
                      let date = Self.dayDate(day) {
                points.append(RatePoint(day: day, hour: nil, value: value, raw: per, date: date))
            }
        }
        return points
    }

    /// Day keys actually present in rates.json within [from, through], oldest first.
    /// "yyyy-MM-dd" sorts the same as the dates.
    private func storedDays(from: String, through: String) -> [String] {
        days.keys.filter { $0 >= from && $0 <= through }.sorted()
    }

    /// Reporting currency per 1 foreign unit, from a CHF mid and the reporting currency's CHF mid.
    private func reportingFromCHF(_ chf: Double, day: String, hourKey: String?) -> Double? {
        if base == "CHF" { return chf }
        guard let den = chfMid(base, day: day, hourKey: hourKey), abs(den) > 0.00005 else { return nil }
        return chf / den
    }

    private func chfMid(_ code: String, day: String, hourKey: String?) -> Double? {
        if code == "CHF" { return 1 }
        if let hourKey, let raw = days[day]?.slots?[hourKey]?[code], raw > 0 { return raw }
        if let raw = lastRaw(code, day), raw > 0 { return raw }
        return chfPerUnit(code)
    }

    /// A stored history point is CHF per 1 unit. Map it onto the direct quote in the reporting currency.
    private func pricedRemote(_ code: String, _ point: RatePoint, span: ChartSpan) -> RatePoint? {
        let per: Double?
        if base == "CHF" {
            per = point.raw
        } else if let den = historyCache["\(base)|\(span.query)"]?.first(where: { $0.day == point.day })?.raw, abs(den) > 0.00005 {
            per = point.raw / den
        } else {
            per = nil
        }
        guard let per, let value = directPrice(code, per) else { return nil }
        return RatePoint(day: point.day, hour: nil, value: value, raw: per, date: point.date)
    }

    private func forecastInReporting(_ chf: Double?, day: DayFile) -> Double? {
        guard let chf, chf > 0 else { return nil }
        if base == "CHF" { return chf }
        let den = day.forecast?[base] ?? day.forecast7?[base] ?? chfPerUnit(base)
        guard let den, abs(den) > 0.00005 else { return nil }
        return chf / den
    }

    private func lastRaw(_ code: String, _ day: String) -> Double? {
        if let slots = days[day]?.slots {
            for hour in slots.keys.compactMap(Int.init).sorted(by: >) {
                if let raw = slots[String(format: "%02d", hour)]?[code] { return raw }
            }
        }
        return days[day]?.ecb?[code]
    }

    /// Region → local currency. Missing regions fall through to CHF.
    static let regionCurrency: [String: String] = [
        "CH": "CHF", "LI": "CHF",
        "AD": "EUR", "AT": "EUR", "BE": "EUR", "CY": "EUR", "DE": "EUR", "EE": "EUR", "ES": "EUR", "FI": "EUR", "FR": "EUR",
        "GR": "EUR", "HR": "EUR", "IE": "EUR", "IT": "EUR", "LT": "EUR", "LU": "EUR", "LV": "EUR", "MC": "EUR", "MT": "EUR",
        "NL": "EUR", "PT": "EUR", "SI": "EUR", "SK": "EUR", "SM": "EUR", "VA": "EUR", "ME": "EUR", "XK": "EUR",
        "GB": "GBP", "SE": "SEK", "NO": "NOK", "DK": "DKK", "PL": "PLN", "CZ": "CZK", "HU": "HUF", "RO": "RON",
        "BG": "BGN", "IS": "ISK", "RS": "RSD", "UA": "UAH", "RU": "RUB", "BY": "BYN", "MD": "MDL", "BA": "BAM",
        "MK": "MKD", "AL": "ALL", "TR": "TRY",
        "US": "USD", "CA": "CAD", "MX": "MXN", "BR": "BRL", "AR": "ARS", "CL": "CLP", "CO": "COP", "PE": "PEN",
        "UY": "UYU", "PY": "PYG", "BO": "BOB", "VE": "VES", "EC": "USD", "PA": "USD", "SV": "USD", "PR": "USD",
        "GT": "GTQ", "HN": "HNL", "NI": "NIO", "CR": "CRC", "DO": "DOP", "CU": "CUP", "HT": "HTG", "JM": "JMD",
        "TT": "TTD", "BS": "BSD", "BB": "BBD", "GY": "GYD", "SR": "SRD", "BZ": "BZD",
        "JP": "JPY", "CN": "CNY", "AU": "AUD", "NZ": "NZD", "IN": "INR", "KR": "KRW", "SG": "SGD", "HK": "HKD",
        "TW": "TWD", "TH": "THB", "ZA": "ZAR", "IL": "ILS", "AE": "AED", "SA": "SAR", "PH": "PHP", "MY": "MYR",
        "ID": "IDR", "VN": "VND",
    ]

    static let europeRegions: Set<String> = [
        "AD", "AL", "AT", "AX", "BA", "BE", "BG", "BY", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FO",
        "FR", "GB", "GG", "GI", "GR", "HR", "HU", "IE", "IM", "IS", "IT", "JE", "LT", "LU", "LV", "MC",
        "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT", "RO", "RS", "RU", "SE", "SI", "SJ", "SK", "SM",
        "TR", "UA", "VA", "XK",
    ]

    static let americasRegions: Set<String> = [
        "AG", "AI", "AR", "AW", "BB", "BL", "BM", "BO", "BQ", "BR", "BS", "BZ", "CA", "CL", "CO", "CR",
        "CU", "CW", "DM", "DO", "EC", "FK", "GD", "GF", "GL", "GP", "GT", "GY", "HN", "HT", "JM", "KN",
        "KY", "LC", "MF", "MQ", "MS", "MX", "NI", "PA", "PE", "PM", "PR", "PY", "SR", "SV", "SX", "TC",
        "TT", "US", "UY", "VC", "VE", "VG", "VI",
    ]

    private func applyFirstInstall() {
        let region = Locale.current.region?.identifier
        let fromRegion = region.flatMap { Self.regionCurrency[$0] }
        let local = Locale.current.currency?.identifier ?? fromRegion ?? "CHF"
        base = local
        let rest: [String]
        if region == "CH" || region == "LI" {
            rest = ["EUR", "USD", "GBP"]
        } else if let region, Self.europeRegions.contains(region) {
            rest = ["EUR", "USD", "GBP", "CHF"]
        } else if let region, Self.americasRegions.contains(region) {
            rest = ["USD", "EUR", "GBP", "CHF"]
        } else {
            rest = ["USD", "EUR", "GBP", "CHF"]
        }
        var next = [local]
        for code in rest where !next.contains(code) {
            next.append(code)
        }
        order = next
        hidden = []
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
        if defaults.object(forKey: "wu.showCompare") != nil { showCompare = defaults.bool(forKey: "wu.showCompare") }
        if defaults.object(forKey: "wu.showChart") != nil { showChart = defaults.bool(forKey: "wu.showChart") }
        if defaults.object(forKey: "wu.showIntervals") != nil { showIntervals = defaults.bool(forKey: "wu.showIntervals") }
        if defaults.object(forKey: "wu.showForecast") != nil { showForecast = defaults.bool(forKey: "wu.showForecast") }
        if defaults.object(forKey: "wu.showReference") != nil { showReference = defaults.bool(forKey: "wu.showReference") }
        if let raw = defaults.string(forKey: "wu.chartSpan"), let span = ChartSpan(rawValue: raw) { self.span = span }
        // migration: before 1.0.1 (4) both charts shared wu.chartSpan
        if let raw = defaults.string(forKey: "wu.compareSpan"), let span = ChartSpan(rawValue: raw) {
            compareSpan = span
        } else {
            compareSpan = span
        }
        if let v = defaults.object(forKey: "wu.colorThreshold") as? Double { colorThreshold = min(max(v, 0), 2) }
        WidgetShared.defaults?.set(colorThreshold, forKey: WidgetShared.colorThresholdKey)
        if defaults.object(forKey: "wu.colorChanges") != nil { colorChanges = defaults.bool(forKey: "wu.colorChanges") }
        WidgetShared.defaults?.set(colorChanges, forKey: WidgetShared.colorEnabledKey)
        if defaults.object(forKey: "wu.sameSpan") != nil { sameSpan = defaults.bool(forKey: "wu.sameSpan") }
        if let data = defaults.data(forKey: "wu.codeSpans"),
           let map = try? JSONDecoder().decode([String: String].self, from: data) {
            codeSpans = map.compactMapValues { ChartSpan(rawValue: $0) }
        }
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
        if defaults.object(forKey: "wu.pushEnabled") != nil { pushEnabled = defaults.bool(forKey: "wu.pushEnabled") }
        pushToken = defaults.string(forKey: "wu.apnsToken")
        alertId = defaults.string(forKey: "wu.alertId") ?? ""
    }

    private func saveLocal() {
        defaults.set(base, forKey: "wu.baseCurrency")
        if let data = try? JSONEncoder().encode(order) { defaults.set(data, forKey: "wu.currencyOrder") }
        if let data = try? JSONEncoder().encode(Array(hidden)) { defaults.set(data, forKey: "wu.currencyHidden") }
        defaults.set(showCompare, forKey: "wu.showCompare")
        defaults.set(showChart, forKey: "wu.showChart")
        defaults.set(showIntervals, forKey: "wu.showIntervals")
        defaults.set(showForecast, forKey: "wu.showForecast")
        defaults.set(showReference, forKey: "wu.showReference")
        defaults.set(span.rawValue, forKey: "wu.chartSpan")
        defaults.set(compareSpan.rawValue, forKey: "wu.compareSpan")
        defaults.set(sameSpan, forKey: "wu.sameSpan")
        defaults.set(colorThreshold, forKey: "wu.colorThreshold")
        WidgetShared.defaults?.set(colorThreshold, forKey: WidgetShared.colorThresholdKey)
        defaults.set(colorChanges, forKey: "wu.colorChanges")
        WidgetShared.defaults?.set(colorChanges, forKey: WidgetShared.colorEnabledKey)
        if let data = try? JSONEncoder().encode(codeSpans.mapValues(\.rawValue)) { defaults.set(data, forKey: "wu.codeSpans") }
        if let data = try? JSONEncoder().encode(hours) { defaults.set(data, forKey: "wu.hours") }
        defaults.set(timesUserSet, forKey: "wu.timesUserSet")
        defaults.set(timeStart, forKey: "wu.timeStart")
        defaults.set(timeEnd, forKey: "wu.timeEnd")
        if let timeStep { defaults.set(timeStep, forKey: "wu.timeStep") } else { defaults.removeObject(forKey: "wu.timeStep") }
        defaults.set(alertsMaster, forKey: "wu.alertsMaster")
        if let data = try? JSONEncoder().encode(thresholds) { defaults.set(data, forKey: "wu.thresholds") }
        defaults.set(topic, forKey: "wu.alertTopic")
        defaults.set(pushEnabled, forKey: "wu.pushEnabled")
        defaults.set(alertId, forKey: "wu.alertId")
        pushToCloud()
        publishToWidgets()
    }

    /// Shares the reporting currency and the visible order with the widgets and refreshes them when it changed.
    private func publishToWidgets(force: Bool = false) {
        let shared = WidgetShared.read()
        let foreign = visible.filter { $0 != base }
        let changed = shared.base != base || shared.foreign != foreign
        WidgetShared.publish(base: base, visible: visible)
        if changed || force { WidgetCenter.shared.reloadAllTimelines() }
    }

    static func expand(start: Int, end: Int, step: Int) -> [Int]? {
        let steps = [1, 2, 3, 4, 5, 8, 12, 24]
        guard steps.contains(step), start < end, start >= 0, end <= 23 else { return nil }
        return Array(stride(from: start, through: end, by: step))
    }

    /// Shared, built once. Creating a DateFormatter per call froze the 5/10-year charts.
    nonisolated static let gregorian = Calendar(identifier: .gregorian)
    nonisolated static let zurichZone = TimeZone(identifier: "Europe/Zurich") ?? .current
    private static func keyFormatter(_ zone: TimeZone) -> DateFormatter {
        let fmt = DateFormatter()
        fmt.calendar = gregorian
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.timeZone = zone
        fmt.dateFormat = "yyyy-MM-dd"
        return fmt
    }
    private static let zurichKeyFormatter = keyFormatter(zurichZone)
    private static let utcKeyFormatter = keyFormatter(TimeZone(identifier: "UTC")!)
    private static let localKeyFormatter = keyFormatter(.autoupdatingCurrent)
    private static let utcCalendar: Calendar = {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return cal
    }()

    static func todayKey() -> String {
        zurichKeyFormatter.string(from: Date())
    }

    /// Device view options. A future iCloud sync of settings should copy every one of these keys.
    static let viewSettingKeys = [
        "wu.showCompare", "wu.showChart", "wu.showIntervals", "wu.showForecast", "wu.showReference", "wu.chartSpan",
        "wu.compareSpan", "wu.sameSpan", "wu.codeSpans", "wu.colorThreshold", "wu.colorChanges",
    ]

    static func localTodayKey() -> String {
        localKeyFormatter.timeZone = .current
        return localKeyFormatter.string(from: Date())
    }

    static func zurichKey(_ date: Date) -> String {
        zurichKeyFormatter.string(from: date)
    }

    static func localWall(_ day: String, hour: Int) -> Date? {
        let bits = day.split(separator: "-")
        guard bits.count == 3, let y = Int(bits[0]), let m = Int(bits[1]), let d = Int(bits[2]) else { return nil }
        var local = gregorian
        local.timeZone = .current
        var parts = DateComponents()
        parts.calendar = local
        parts.timeZone = .current
        parts.year = y
        parts.month = m
        parts.day = d
        parts.hour = hour
        parts.minute = 0
        parts.second = 0
        return local.date(from: parts)
    }

    struct CompareSample: Identifiable {
        var code: String
        var day: String
        var date: Date
        var percent: Double
        var id: String { "\(code)|\(day)|\(date.timeIntervalSince1970)" }
    }

    /// Percent change versus the reporting currency. Every line is 0 at its first point in the selected period.
    func compareLines() -> [(code: String, points: [CompareSample])] {
        visible.filter { $0 != base }.compactMap { code in
            let series = series(code, span: compareSpan)
            guard series.count >= 2, let first = series.first?.value, abs(first) > 0.00005 else { return nil }
            let points = series.map { point in
                CompareSample(code: code, day: point.day, date: point.date, percent: (point.value / first - 1) * 100)
            }
            return (code, points)
        }
    }

    func compareIndex(_ code: String) -> Int {
        visible.filter { $0 != base }.firstIndex(of: code) ?? 0
    }

    static func addDays(_ key: String, _ count: Int) -> String? {
        let fmt = utcKeyFormatter
        guard let date = fmt.date(from: key), let next = utcCalendar.date(byAdding: .day, value: count, to: date) else { return nil }
        return fmt.string(from: next)
    }

    nonisolated static func dayDate(_ key: String, hour: Int? = nil) -> Date? {
        var parts = DateComponents()
        let bits = key.split(separator: "-")
        guard bits.count == 3, let y = Int(bits[0]), let m = Int(bits[1]), let d = Int(bits[2]) else { return nil }
        parts.year = y
        parts.month = m
        parts.day = d
        parts.hour = hour ?? 12
        parts.timeZone = zurichZone
        return gregorian.date(from: parts)
    }

    static func hex(_ bytes: Int) -> String {
        (0..<bytes).map { _ in String(format: "%02x", UInt8.random(in: 0...255)) }.joined()
    }
}

private struct AlertUpload: Encodable {
    var topic: String
    var start: Int
    var base: String
    var timeZone: String
    var currencies: [String: Level]
    /// Omitted while no token is known, so the server keeps the last one.
    var apnsToken: String?
    var apnsEnv: String?

    struct Level: Encodable {
        var enabled: Bool
        var down: Double
        var up: Double
    }
}

private struct RemoteAlerts: Decodable {
    var topic: String?
    var currencies: [String: Level]?

    struct Level: Decodable {
        var enabled: Bool
        var down: Double
        var up: Double
    }
}

private struct AlertErrorBody: Decodable {
    var error: String?
}

private enum AlertSyncError: LocalizedError {
    case invalidThreshold(String)
    case server(String)
    case network
    case missing

    var errorDescription: String? {
        switch self {
        case .invalidThreshold(let code):
            return "Ungültige Schwelle bei \(code) (0.01–20 %)."
        case .server(let message):
            return message
        case .network:
            return "Die Alarme konnten nicht erreicht werden."
        case .missing:
            return "nicht vorhanden"
        }
    }
}
