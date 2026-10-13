import Foundation

/// One currency row as shown in the widgets. Prices are per bank lot in the reporting currency.
struct WRow: Sendable, Hashable, Identifiable {
    var code: String
    var rate: Double?
    var delta: Double?
    var percent: Double?
    /// Hourly prices of the last 7 days, oldest first.
    var week: [Double]
    var weekStart: Date?
    var weekEnd: Date?
    var id: String { code }
}

struct WSnapshot: Sendable {
    var base: String
    var rows: [WRow]
    var updated: Date?
    var failed: Bool = false

    func row(_ code: String) -> WRow? { rows.first { $0.code == code } }
}

enum WFetch {
    static let origin = URL(string: "https://waehrungen.bigyok61.workers.dev")!

    private struct DayFile: Decodable {
        var slots: [String: [String: Double]]?
        var ecb: [String: Double]?
    }

    private struct RatesFile: Decodable {
        var days: [String: DayFile]
        var updated: String?
    }

    private struct Slot {
        var date: Date
        var chf: [String: Double]
    }

    /// Fetches rates.json (same source as the app) and builds rows for `codes`.
    static func load(base: String, codes: [String]) async -> WSnapshot {
        do {
            let url = origin.appendingPathComponent("data/rates.json")
            var request = URLRequest(url: url)
            request.timeoutInterval = 20
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { throw URLError(.badServerResponse) }
            let file = try JSONDecoder().decode(RatesFile.self, from: data)
            return build(file: file, base: base, codes: codes, now: Date())
        } catch {
            return WSnapshot(base: base, rows: codes.map { WRow(code: $0, week: []) }, updated: nil, failed: true)
        }
    }

    private static func build(file: RatesFile, base: String, codes: [String], now: Date) -> WSnapshot {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Europe/Zurich") ?? .current
        var slots: [Slot] = []
        var latestECB: [String: Double] = [:]
        for key in file.days.keys.sorted() {
            guard let day = file.days[key] else { continue }
            if let ecb = day.ecb { latestECB.merge(ecb) { _, new in new } }
            let parts = key.split(separator: "-").compactMap { Int($0) }
            guard parts.count == 3 else { continue }
            for (hourKey, values) in day.slots ?? [:] {
                guard let hour = Int(hourKey),
                      let date = cal.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: hour)),
                      date <= now.addingTimeInterval(3600) else { continue }
                slots.append(Slot(date: date, chf: values))
            }
        }
        slots.sort { $0.date < $1.date }

        func chf(_ code: String, _ slot: Slot) -> Double? {
            if code == "CHF" { return 1 }
            guard let v = slot.chf[code], v > 0 else { return nil }
            return v
        }

        var local = Calendar(identifier: .gregorian)
        local.timeZone = .current
        let weekFrom = now.addingTimeInterval(-7 * 86400)

        let rows: [WRow] = codes.map { code in
            let lot = lotSize(code)
            let series: [(Date, Double)] = slots.compactMap { slot in
                guard let own = chf(code, slot), let den = chf(base, slot), den > 0.0000001 else { return nil }
                return (slot.date, own / den * lot)
            }
            guard let last = series.last else {
                // only ECB reference known
                if let own = code == "CHF" ? 1 : latestECB[code], let den = base == "CHF" ? 1 : latestECB[base], den > 0 {
                    return WRow(code: code, rate: own / den * lot, week: [])
                }
                return WRow(code: code, week: [])
            }
            // first rate of the newest local day that has rates (same rule as the app's day change)
            let lastDay = local.startOfDay(for: last.0)
            let open = series.first { $0.0 >= lastDay }?.1
            let delta = open.map { last.1 - $0 }
            let pct = (open != nil && open! > 0) ? (last.1 - open!) / open! * 100 : nil
            let week = series.filter { $0.0 >= weekFrom }
            return WRow(code: code, rate: last.1, delta: delta, percent: pct,
                        week: downsample(week.map(\.1), to: 72),
                        weekStart: week.first?.0, weekEnd: week.last?.0)
        }

        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        let updated = file.updated.flatMap { iso.date(from: $0) } ?? slots.last?.date
        return WSnapshot(base: base, rows: rows, updated: updated)
    }

    private static func downsample(_ values: [Double], to count: Int) -> [Double] {
        guard values.count > count, count > 1 else { return values }
        let step = Double(values.count - 1) / Double(count - 1)
        return (0..<count).map { values[Int((Double($0) * step).rounded())] }
    }

    static func lotSize(_ code: String) -> Double {
        switch code {
        case "JPY", "KRW", "HUF", "IDR", "ISK": return 100
        default: return 1
        }
    }

    /// Offline / gallery preview values.
    static func sample(base: String, codes: [String]) -> WSnapshot {
        let demo: [String: (Double, Double)] = ["EUR": (0.9323, 0.15), "USD": (0.8332, -0.16), "GBP": (1.1035, 0.11), "JPY": (0.5512, -0.05)]
        let rows = codes.map { code -> WRow in
            let (rate, pct) = demo[code] ?? (1.0, 0.0)
            let week = (0..<48).map { i in rate * (1 + (sin(Double(i) / 5) * 0.002) + Double(i) * pct / 4800) }
            return WRow(code: code, rate: rate, delta: rate * pct / 100, percent: pct, week: week,
                        weekStart: Date().addingTimeInterval(-6 * 86400), weekEnd: Date())
        }
        return WSnapshot(base: base, rows: rows, updated: Date())
    }
}
