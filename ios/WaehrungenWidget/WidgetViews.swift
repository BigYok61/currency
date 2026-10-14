import SwiftUI

// MARK: - Format and colors (widget-local, same rules as the app)

enum WFmt {
    static func rate(_ value: Double?) -> String {
        guard let value else { return "–" }
        let fmt = NumberFormatter()
        fmt.locale = Locale(identifier: "de_CH")
        fmt.numberStyle = .decimal
        fmt.minimumFractionDigits = 4
        fmt.maximumFractionDigits = 4
        return fmt.string(from: NSNumber(value: value)) ?? String(format: "%.4f", value)
    }

    static func delta(_ value: Double?) -> String {
        guard let value else { return "" }
        let body = rate(abs(value))
        if value > 0.00005 { return "+\(body)" }
        if value < -0.00005 { return "−\(body)" }
        return body
    }

    static func percent(_ value: Double?) -> String {
        guard let value else { return "–" }
        let fmt = NumberFormatter()
        fmt.locale = Locale(identifier: "de_CH")
        fmt.numberStyle = .decimal
        fmt.minimumFractionDigits = 2
        fmt.maximumFractionDigits = 2
        let body = fmt.string(from: NSNumber(value: abs(value))) ?? String(format: "%.2f", abs(value))
        let sign = value > 0.005 ? "+" : value < -0.005 ? "−" : ""
        return "\(sign)\(body) %"
    }

    static func time(_ date: Date?) -> String {
        guard let date else { return "–" }
        let fmt = DateFormatter()
        fmt.locale = .current
        fmt.timeZone = .current
        fmt.setLocalizedDateFormatFromTemplate("jmm")
        return fmt.string(from: date)
    }

    static func dayMonth(_ date: Date?) -> String {
        guard let date else { return "" }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "de_CH")
        fmt.timeZone = .current
        fmt.dateFormat = "d.M."
        return fmt.string(from: date)
    }

    static func name(_ code: String) -> String {
        let value = Locale(identifier: "de_CH").localizedString(forCurrencyCode: code) ?? code
        let name = value.replacingOccurrences(of: "ß", with: "ss")
        let lot = WFetch.lotSize(code)
        return lot == 1 ? name : "\(name) (\(Int(lot)))"
    }

    static func symbol(_ code: String) -> String {
        let known = ["CHF": "Fr", "USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥", "CAD": "$", "AUD": "$",
                     "NZD": "$", "SEK": "kr", "NOK": "kr", "DKK": "kr", "CNY": "¥", "INR": "₹", "TRY": "₺",
                     "PLN": "zł", "HKD": "$", "SGD": "$", "MXN": "$", "ZAR": "R", "HUF": "Ft"]
        return known[code] ?? String(code.prefix(1))
    }
}

enum WColor {
    static let up = Color(red: 0.204, green: 0.780, blue: 0.349)
    static let down = Color(red: 1, green: 0.231, blue: 0.188)
    static let blue = Color(red: 0, green: 0.478, blue: 1)
    static let palette: [Color] = [
        Color(red: 0.000, green: 0.478, blue: 1.000),
        Color(red: 1.000, green: 0.584, blue: 0.000),
        Color(red: 0.686, green: 0.322, blue: 0.871),
        Color(red: 1.000, green: 0.231, blue: 0.188),
        Color(red: 0.204, green: 0.780, blue: 0.349),
        Color(red: 0.353, green: 0.784, blue: 0.980),
        Color(red: 1.000, green: 0.176, blue: 0.333),
        Color(red: 0.345, green: 0.337, blue: 0.839),
    ]
    static func code(_ index: Int) -> Color { palette[max(0, index) % palette.count] }
    /// `percent` = change in percent; coloured only from the app's threshold on.
    static func tone(_ percent: Double?) -> Color {
        switch WidgetShared.direction(percent: percent) {
        case 1: return up
        case -1: return down
        default: return .secondary
        }
    }
    static func triangle(_ percent: Double?) -> String {
        guard percent != nil else { return "" }
        switch WidgetShared.direction(percent: percent) {
        case 1: return "▲"
        case -1: return "▼"
        default: return "■"
        }
    }
    static func weekPercent(_ week: [Double]) -> Double? {
        guard week.count > 1, let first = week.first, let last = week.last, abs(first) > 0 else { return nil }
        return (last / first - 1) * 100
    }
}

// MARK: - Small pieces

struct WBadge: View {
    var code: String
    var color: Color
    var size: CGFloat = 18
    var round = false
    var body: some View {
        Text(WFmt.symbol(code))
            .font(.system(size: size * 0.6, weight: .bold))
            .minimumScaleFactor(0.5)
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(color, in: RoundedRectangle(cornerRadius: round ? size / 2 : size * 0.28))
    }
}

struct WSpark: View {
    var values: [Double]
    var color: Color
    var fill = false
    var body: some View {
        GeometryReader { geo in
            if values.count >= 2, let lo = values.min(), let hi = values.max() {
                let span = max(hi - lo, 0.0000001)
                let pts = values.enumerated().map { i, v in
                    CGPoint(x: geo.size.width * CGFloat(i) / CGFloat(values.count - 1),
                            y: geo.size.height * (1 - CGFloat((v - lo) / span)) * 0.9 + geo.size.height * 0.05)
                }
                ZStack {
                    if fill {
                        Path { p in
                            p.move(to: CGPoint(x: 0, y: geo.size.height))
                            pts.forEach { p.addLine(to: $0) }
                            p.addLine(to: CGPoint(x: geo.size.width, y: geo.size.height))
                            p.closeSubpath()
                        }
                        .fill(LinearGradient(colors: [color.opacity(0.25), color.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                    }
                    Path { p in
                        p.move(to: pts[0])
                        pts.dropFirst().forEach { p.addLine(to: $0) }
                    }
                    .stroke(color, style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
                }
            }
        }
    }
}

struct WPill: View {
    var percent: Double?
    var body: some View {
        Text(WFmt.percent(percent))
            .font(.system(size: 12, weight: .semibold))
            .monospacedDigit()
            .foregroundStyle(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .frame(width: 62, height: 22)
            .background(percent == nil ? Color.gray : WColor.tone(percent), in: RoundedRectangle(cornerRadius: 6))
    }
}

// MARK: - Widget layouts

/// Small A: one currency with change and 1-week sparkline.
struct SingleCurrencyView: View {
    var snap: WSnapshot
    var code: String
    var colorIndex: Int
    var body: some View {
        let row = snap.row(code) ?? WRow(code: code, week: [])
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 5) {
                WBadge(code: code, color: WColor.code(colorIndex), size: 20)
                Text(code).font(.system(size: 16, weight: .bold))
                Spacer(minLength: 2)
                Text(WFmt.time(snap.updated)).font(.system(size: 11)).foregroundStyle(.secondary)
            }
            Text(WFmt.rate(row.rate))
                .font(.system(size: 30, weight: .bold))
                .monospacedDigit()
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .padding(.top, 6)
            Text(snap.base).font(.system(size: 12)).foregroundStyle(.secondary)
            HStack(spacing: 3) {
                Text(WColor.triangle(row.percent)).font(.system(size: 9))
                Text("\(WFmt.delta(row.delta)) (\(WFmt.percent(row.percent)))")
                    .font(.system(size: 11.5, weight: .medium))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .foregroundStyle(WColor.tone(row.percent))
            .padding(.top, 4)
            WSpark(values: row.week, color: WColor.tone(WColor.weekPercent(row.week)) == .secondary ? WColor.up : WColor.tone(WColor.weekPercent(row.week)), fill: true)
                .frame(maxHeight: .infinity)
                .padding(.top, 4)
        }
    }
}

/// Small B: three currencies stacked.
struct TripleCurrencyView: View {
    var snap: WSnapshot
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("in \(snap.base)").font(.system(size: 12, weight: .semibold)).foregroundStyle(WColor.blue)
                Spacer()
                Text(WFmt.time(snap.updated)).font(.system(size: 11)).foregroundStyle(.secondary)
            }
            .padding(.bottom, 4)
            let rows = Array(snap.rows.prefix(3))
            ForEach(Array(rows.enumerated()), id: \.element.code) { index, row in
                if index > 0 { Divider() }
                HStack(alignment: .center, spacing: 6) {
                    WBadge(code: row.code, color: WColor.code(index), size: 16, round: true)
                    Text(row.code).font(.system(size: 14, weight: .semibold))
                    Spacer(minLength: 2)
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(WFmt.rate(row.rate)).font(.system(size: 15, weight: .bold)).monospacedDigit()
                            .lineLimit(1).minimumScaleFactor(0.7)
                        Text("\(WColor.triangle(row.percent))\(WFmt.percent(row.percent))")
                            .font(.system(size: 10.5, weight: .medium)).monospacedDigit()
                            .foregroundStyle(WColor.tone(row.percent))
                    }
                }
                .frame(maxHeight: .infinity)
            }
        }
    }
}

/// Medium: up to 4 currencies with sparkline and percent pill.
struct MediumOverviewView: View {
    var snap: WSnapshot
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Währungen").font(.system(size: 14, weight: .bold))
                Spacer()
                Text("in \(snap.base) · 1 Woche · \(WFmt.time(snap.updated))").font(.system(size: 11)).foregroundStyle(.secondary)
            }
            .padding(.bottom, 4)
            let rows = Array(snap.rows.prefix(4))
            ForEach(Array(rows.enumerated()), id: \.element.code) { index, row in
                if index > 0 { Divider().padding(.leading, 16) }
                Link(destination: WidgetShared.url(for: row.code)) {
                    HStack(spacing: 8) {
                        Circle().fill(WColor.code(index)).frame(width: 8, height: 8)
                        Text(row.code).font(.system(size: 14, weight: .semibold)).frame(width: 40, alignment: .leading)
                        Text(WFmt.rate(row.rate)).font(.system(size: 14, weight: .semibold)).monospacedDigit()
                            .frame(maxWidth: .infinity, alignment: .trailing)
                        WSpark(values: row.week, color: WColor.tone(row.percent) == .secondary ? .gray : WColor.tone(row.percent))
                            .frame(width: 74, height: 18)
                            .padding(.horizontal, 6)
                        WPill(percent: row.percent)
                    }
                    .frame(maxHeight: .infinity)
                }
                .buttonStyle(.plain)
            }
        }
        .foregroundStyle(.primary)
    }
}

/// Large: comparison chart and list.
struct LargeOverviewView: View {
    var snap: WSnapshot
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(WFmt.name(snap.base)) · \(snap.base)").font(.system(size: 15, weight: .bold)).lineLimit(1)
                Spacer()
                Text("1 Woche").font(.system(size: 12, weight: .medium)).foregroundStyle(WColor.blue)
            }
            HStack {
                Text("\(snap.base) · Berichtswährung").font(.system(size: 12)).foregroundStyle(WColor.blue)
                Spacer()
                Text("Entwicklung").font(.system(size: 12)).foregroundStyle(.secondary)
            }
            .padding(.bottom, 6)
            CompareChart(rows: Array(snap.rows.prefix(4)))
                .frame(height: 130)
                .padding(8)
                .background(Color.gray.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                .accessibilityLabel("Entwicklung der Währungen, 1 Woche")
            let rows = Array(snap.rows.prefix(4))
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.code) { index, row in
                    if index > 0 { Divider().padding(.leading, 18) }
                    Link(destination: WidgetShared.url(for: row.code)) {
                        HStack(alignment: .top, spacing: 8) {
                            Circle().fill(WColor.code(index)).frame(width: 9, height: 9).padding(.top, 5)
                            VStack(alignment: .leading, spacing: 0) {
                                Text(row.code).font(.system(size: 15, weight: .bold))
                                Text(WFmt.name(row.code)).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1)
                            }
                            Spacer(minLength: 4)
                            Text("\(WFmt.rate(row.rate)) \(snap.base)").font(.system(size: 15, weight: .semibold)).monospacedDigit()
                                .lineLimit(1).minimumScaleFactor(0.8)
                            VStack(alignment: .trailing, spacing: 0) {
                                Text(WFmt.percent(row.percent)).font(.system(size: 14, weight: .semibold))
                                HStack(spacing: 3) {
                                    Text(WColor.triangle(row.percent)).font(.system(size: 8))
                                    Text(WFmt.delta(row.delta)).font(.system(size: 11))
                                }
                            }
                            .monospacedDigit()
                            .foregroundStyle(WColor.tone(row.percent))
                            .frame(width: 74, alignment: .trailing)
                        }
                        .frame(maxHeight: .infinity)
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(maxHeight: .infinity)
            .padding(.top, 4)
            HStack {
                Text("Stand \(WFmt.time(snap.updated))")
                Spacer()
                Text("Berichtswährung \(snap.base)")
            }
            .font(.system(size: 10.5))
            .foregroundStyle(.secondary)
        }
        .foregroundStyle(.primary)
    }
}

/// Percent move since the first point, one line per currency, end labels.
struct CompareChart: View {
    var rows: [WRow]
    var body: some View {
        let lines: [(Color, [Double])] = rows.enumerated().compactMap { i, row in
            guard let first = row.week.first, first > 0, row.week.count > 1 else { return nil }
            return (WColor.code(i), row.week.map { ($0 - first) / first * 100 })
        }
        let all = lines.flatMap(\.1)
        let lo = min(all.min() ?? -0.1, -0.05), hi = max(all.max() ?? 0.1, 0.05)
        let start = rows.compactMap(\.weekStart).min(), end = rows.compactMap(\.weekEnd).max()
        VStack(spacing: 2) {
            GeometryReader { geo in
                let labelW: CGFloat = 58
                let w = geo.size.width - labelW, h = geo.size.height
                let y: (Double) -> CGFloat = { h * (1 - CGFloat(($0 - lo) / (hi - lo))) }
                ZStack(alignment: .topLeading) {
                    Path { p in p.move(to: CGPoint(x: 0, y: y(0))); p.addLine(to: CGPoint(x: w, y: y(0))) }
                        .stroke(Color.gray.opacity(0.5), style: StrokeStyle(lineWidth: 0.8, dash: [3, 3]))
                    ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                        let pts = line.1.enumerated().map { CGPoint(x: w * CGFloat($0.offset) / CGFloat(line.1.count - 1), y: y($0.element)) }
                        Path { p in p.move(to: pts[0]); pts.dropFirst().forEach { p.addLine(to: $0) } }
                            .stroke(line.0, style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
                        Circle().fill(line.0).frame(width: 6, height: 6).position(pts.last!)
                    }
                    ForEach(Array(endLabels(lines: lines, y: y, h: h).enumerated()), id: \.offset) { _, lab in
                        Text(WFmt.percent(lab.value)).font(.system(size: 10.5, weight: .semibold)).monospacedDigit()
                            .foregroundStyle(lab.color).lineLimit(1).fixedSize()
                            .position(x: w + 6 + labelW / 2 - 4, y: lab.y)
                    }
                }
            }
            HStack {
                Text(WFmt.dayMonth(start))
                Spacer()
                Text(WFmt.dayMonth(end)).padding(.trailing, 58)
            }
            .font(.system(size: 9.5))
            .foregroundStyle(.secondary)
        }
    }

    private func endLabels(lines: [(Color, [Double])], y: (Double) -> CGFloat, h: CGFloat) -> [(color: Color, value: Double, y: CGFloat)] {
        var labels = lines.compactMap { line -> (color: Color, value: Double, y: CGFloat)? in
            guard let last = line.1.last else { return nil }
            return (line.0, last, y(last))
        }.sorted { $0.y < $1.y }
        // keep labels from overlapping
        for i in labels.indices.dropFirst() where labels[i].y - labels[i - 1].y < 13 {
            labels[i].y = labels[i - 1].y + 13
        }
        for i in labels.indices { labels[i].y = min(max(labels[i].y, 6), h - 6) }
        return labels
    }
}

/// Lock screen rectangular, monochrome.
struct LockRectView: View {
    var snap: WSnapshot
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack {
                Text("in \(snap.base)")
                Spacer()
                Text(WFmt.time(snap.updated))
            }
            .font(.system(size: 11))
            .opacity(0.75)
            ForEach(snap.rows.prefix(2)) { row in
                HStack(spacing: 6) {
                    Text(row.code).font(.system(size: 15, weight: .bold))
                    Text(WFmt.rate(row.rate)).font(.system(size: 15, weight: .medium)).monospacedDigit()
                    Spacer(minLength: 2)
                    Text("\(WColor.triangle(row.percent)) \(WFmt.percent(row.percent))")
                        .font(.system(size: 13, weight: .semibold)).monospacedDigit()
                        .lineLimit(1).minimumScaleFactor(0.7)
                }
            }
        }
    }
}
