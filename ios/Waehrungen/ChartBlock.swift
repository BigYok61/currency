import Charts
import SwiftUI

struct ChartBlock: View {
    @EnvironmentObject private var store: RatesStore
    let code: String
    var preview: Bool = false
    @State private var showDetail = false

    var body: some View {
        let span = store.span(for: code)
        let points = store.series(code)
        return VStack(alignment: .leading, spacing: 2) {
            if points.count >= 2 {
                ChartBoxHeader(caption: span.caption, percent: periodPercent(points), tone: chartTone(points),
                               range: ChartFormat.range(points.first?.date, points.last?.date))
                InlinePlot(points: points, tone: chartTone(points), height: 120, scrubbing: false, code: code, base: store.base, showDates: true, span: span)
                    .allowsHitTesting(false)
                    .padding(.top, 4)
            } else {
                Text("Keine Kurse in diesem Zeitraum.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .chartBox()
        .contentShape(Rectangle())
        .onTapGesture { openDetail() }
        .sheet(isPresented: $showDetail) {
            ChartDetailSheet(code: code).environmentObject(store)
        }
        #if DEBUG
        .task {
            if ScreenshotMode.shot == "detail" && code == "EUR" && !preview { await ScreenshotMode.wait(); showDetail = true }
        }
        #endif
    }

    private func openDetail() {
        guard !preview else { return }
        showDetail = true
    }
}

func periodPercent(_ points: [RatePoint]) -> Double? {
    guard let first = points.first?.value, let last = points.last?.value, abs(first) > 0.00005 else { return nil }
    return (last / first - 1) * 100
}

/// Grey rounded box shared by every list chart (currency charts and the comparison chart).
private struct ChartBoxStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 8)
            .padding(.top, 8)
            .padding(.bottom, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(uiColor: .secondarySystemFill), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .padding(.leading, -8)   // text inside keeps the row's leading edge
            .padding(.vertical, 4)
    }
}

extension View {
    fileprivate func chartBox() -> some View { modifier(ChartBoxStyle()) }
}

/// Blue period label, period change in the same size, date range underneath.
private struct ChartBoxHeader: View {
    let caption: String
    var percent: Double?
    var tone: Color = .secondary
    let range: String

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(caption).foregroundStyle(Color.blue)
                    .accessibilityLabel("Zeitraum \(caption)")
                if let percent {
                    Text(formatComparePercent(percent)).foregroundStyle(tone).monospacedDigit()
                }
            }
            .font(.system(size: 12, weight: .semibold))
            if !range.isEmpty {
                Text(range)
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}

struct ChartDetailSheet: View {
    @EnvironmentObject private var store: RatesStore
    let code: String

    var body: some View {
        let span = store.span(for: code)
        let points = store.series(code)
        let tone = chartTone(points)
        let move = periodMove(points, tone: tone)
        return NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ViewThatFits(in: .horizontal) {
                        HStack(alignment: .center, spacing: 10) {
                            rateText
                            dayPill
                        }
                        VStack(alignment: .leading, spacing: 6) {
                            rateText
                            dayPill
                        }
                    }
                    Text(store.secondaryText(code))
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Color.blue)
                        .monospacedDigit()
                        .padding(.top, 6)
                    if let move {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(span.caption).foregroundStyle(.secondary)
                            Text(move.text).foregroundStyle(move.tone)
                        }
                        .font(.system(size: 15, weight: .semibold))
                        .monospacedDigit()
                        .padding(.top, 8)
                    }
                    spanPicker
                        .padding(.top, 16)
                    if points.count >= 2, let move {
                        InlinePlot(points: points, tone: tone, height: 220, scrubbing: true, code: code, base: store.base, showDates: true, longDates: true, span: span)
                            .padding(.top, 40)
                        HStack {
                            Text(ChartFormat.pretty(points.first?.day))
                            Spacer()
                            Text(ChartFormat.pretty(points.last?.day))
                        }
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                        .padding(.top, 6)
                        VStack(spacing: 0) {
                            statRow("Eröffnung", move.open)
                            Divider().padding(.leading, 14)
                            statRow("Hoch", move.high)
                            Divider().padding(.leading, 14)
                            statRow("Tief", move.low)
                            Divider().padding(.leading, 14)
                            statRow("Schluss", move.close)
                        }
                        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .padding(.top, 16)
                    } else {
                        Text("Keine Kurse in diesem Zeitraum.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .padding(.top, 40)
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle(CurrencyNames.name(code))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { SheetClose() } }
            .toolbarBackground(Color(uiColor: .systemGroupedBackground), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .background(Color(uiColor: .systemGroupedBackground))
        }
        .presentationDragIndicator(.visible)
    }

    @ViewBuilder private var rateText: some View {
        if let value = store.quote(code).value {
            Text("\(formatRate(value)) \(store.base)")
                .font(.system(size: 34, weight: .bold))
                .foregroundStyle(.primary)
                .monospacedDigit()
                .lineLimit(1)
                .fixedSize()
        }
    }

    /// Today's change vs. the previous close as a tinted pill.
    @ViewBuilder private var dayPill: some View {
        if let day = store.dayChange(code), let close = store.quote(code).value {
            let open = close - day.delta
            let pct = abs(open) > 0.00005 ? day.delta / open * 100 : 0
            let up = day.delta > 0.00005
            let down = day.delta < -0.00005
            let tone = dayChangeTone(day.delta)
            let fill: Color = up ? Color(red: 0.204, green: 0.780, blue: 0.349).opacity(0.16)
                : down ? Color(red: 1, green: 0.231, blue: 0.188).opacity(0.13) : Color.gray.opacity(0.16)
            Text("\(up ? "▲ " : down ? "▼ " : "")\(formatDelta(day.delta)) (\(formatComparePercent(pct)))")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(tone)
                .monospacedDigit()
                .lineLimit(1)
                .fixedSize()
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(fill, in: Capsule())
        }
    }

    /// Writes the span only when it actually changes, so a second tap cannot re-enter the picker update.
    private var spanPicker: some View {
        Picker("Zeitraum", selection: Binding(
            get: { store.span(for: code) },
            set: { store.setSpan($0, for: code) }
        )) {
            ForEach(ChartSpan.allCases) { item in
                Text(item.rawValue).tag(item)
            }
        }
        .pickerStyle(.segmented)
    }

    private func periodMove(_ points: [RatePoint], tone: Color) -> (text: String, tone: Color, open: Double, close: Double, high: Double, low: Double)? {
        guard let first = points.first?.value, let last = points.last?.value, abs(first) > 0.00005 else { return nil }
        let delta = last - first
        let percent = delta / first * 100
        let high = points.map(\.value).max() ?? last
        let low = points.map(\.value).min() ?? last
        return (ChartFormat.change(delta, percent: percent), tone, first, last, high, low)
    }

    private func statRow(_ label: String, _ value: Double) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text("\(formatRate(value)) \(store.base)")
                .foregroundStyle(.secondary)
                .monospacedDigit()
        }
        .font(.system(size: 16))
        .padding(.horizontal, 14)
        .frame(minHeight: 40)
    }
}

/// Compact chart window that slides down from the top when a currency name is tapped (list without charts).
struct CompactChartPanel: View {
    @EnvironmentObject private var store: RatesStore
    let code: String
    var onClose: () -> Void
    @State private var showDetail = false
    @State private var drag: CGFloat = 0

    var body: some View {
        let span = store.span(for: code)
        let points = store.series(code)
        let tone = chartTone(points)
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 6) {
                Text(CurrencyNames.name(code)).font(.system(size: 20, weight: .bold))
                Text(code).font(.system(size: 15)).foregroundStyle(.secondary)
                Spacer(minLength: 8)
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 32, height: 32)
                        .background(Color(uiColor: .tertiarySystemFill), in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Schliessen")
            }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("\(formatRate(store.quote(code).value)) \(store.base)")
                    .font(.system(size: 28, weight: .bold))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 8)
                Text(span.caption).foregroundStyle(.secondary)
                if let pct = periodPercent(points) {
                    Text(formatComparePercent(pct)).foregroundStyle(tone).monospacedDigit()
                }
            }
            .font(.system(size: 15, weight: .semibold))
            Group {
                if points.count >= 2 {
                    InlinePlot(points: points, tone: tone, height: 170, scrubbing: false, code: code, base: store.base, showDates: true, span: span)
                        .allowsHitTesting(false)
                } else {
                    Text("Keine Kurse in diesem Zeitraum.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, minHeight: 170)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture { showDetail = true }
            .padding(.top, 10)
            Picker("Zeitraum", selection: Binding(get: { store.span(for: code) }, set: { store.setSpan($0, for: code) })) {
                ForEach(ChartSpan.allCases) { item in
                    Text(item.short).tag(item)
                }
            }
            .pickerStyle(.segmented)
            .padding(.top, 10)
            Button { showDetail = true } label: {
                Text("Tippen für weitere Details")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Color.blue)
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.top, 12)
            Capsule()
                .fill(Color(uiColor: .tertiaryLabel))
                .frame(width: 36, height: 5)
                .frame(maxWidth: .infinity)
                .padding(.top, 10)
        }
        .padding(.horizontal, 16)
        .padding(.top, 6)
        .padding(.bottom, 8)
        .background(
            UnevenRoundedRectangle(bottomLeadingRadius: 24, bottomTrailingRadius: 24, style: .continuous)
                .fill(Color(uiColor: .systemBackground))
                .shadow(color: .black.opacity(0.15), radius: 12, y: 4)
                .ignoresSafeArea(edges: .top)
        )
        .offset(y: min(drag, 0))
        .gesture(
            DragGesture(minimumDistance: 12)
                .onChanged { drag = $0.translation.height }
                .onEnded { value in
                    if value.translation.height < -50 || value.predictedEndTranslation.height < -120 { onClose() }
                    withAnimation(.spring(response: 0.3)) { drag = 0 }
                }
        )
        .sheet(isPresented: $showDetail) {
            ChartDetailSheet(code: code).environmentObject(store)
        }
    }
}

/// Shared line chart with grid. Scrubbing is only used on the detail sheet.
private struct InlinePlot: View {
    let points: [RatePoint]
    let tone: Color
    let height: CGFloat
    let scrubbing: Bool
    let code: String
    let base: String
    /// A small date (or time for the 1-day span) under Hoch/Tief.
    var showDates: Bool = false
    /// Detail sheet: "30.9.2026" instead of "30.9.".
    var longDates: Bool = false
    var span: ChartSpan = .month
    @State private var scrubIndex: Int?

    static let gridColor = Color(red: 198 / 255, green: 198 / 255, blue: 204 / 255)

    var body: some View {
        // Trading-time axis: x is the point's position in the series, so weekends and
        // no-data gaps take no width and are not drawn as long flat lines.
        let drawn = downsampleIndices(points, max: 240)
        let lastX = max(points.count - 1, 1)
        let hi = points.map(\.value).max() ?? 0
        let lo = points.map(\.value).min() ?? 0
        let range = max(hi - lo, 0.004)
        let pad = range * 0.3
        let yLo = lo - pad
        let yHi = hi + pad
        let yTicks = Self.yTicks(yLo, yHi)
        let xTicks = Self.xTicks(points, span: span)
        let highIndex = points.indices.max(by: { points[$0].value < points[$1].value }) ?? 0
        let lowIndex = points.indices.min(by: { points[$0].value < points[$1].value }) ?? 0
        return Chart {
            ForEach(drawn, id: \.self) { index in
                let point = points[index]
                LineMark(x: .value("Zeit", index), y: .value("Kurs", point.value))
                    .interpolationMethod(.monotone)
                    .foregroundStyle(tone)
                    .lineStyle(StrokeStyle(lineWidth: 1.75, lineCap: .butt, lineJoin: .round))
            }
            if let first = points.first {
                RuleMark(y: .value("Beginn", first.value))
                    .foregroundStyle(Color.gray.opacity(0.7))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
            }
            if let last = points.last {
                PointMark(x: .value("Zeit", points.count - 1), y: .value("Kurs", last.value))
                    .foregroundStyle(tone)
                    .symbolSize(14)
            }
        }
        .chartXAxis {
            AxisMarks(values: xTicks) { value in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 0.8, dash: [3, 3]))
                    .foregroundStyle(Self.gridColor)
                AxisValueLabel {
                    if let i = value.as(Int.self), i >= 0, i < points.count {
                        Text(Self.xLabel(points[i], span: span))
                            .font(.system(size: 9))
                            .foregroundStyle(Color.secondary)
                            .monospacedDigit()
                    }
                }
            }
        }
        .chartYAxis {
            AxisMarks(position: .leading, values: yTicks) { value in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 0.8))
                    .foregroundStyle(Self.gridColor)
                AxisValueLabel {
                    if let v = value.as(Double.self) {
                        Text(formatRate(v))
                            .font(.system(size: 9))
                            .foregroundStyle(Color.secondary)
                            .monospacedDigit()
                    }
                }
            }
        }
        .chartXScale(domain: 0...lastX, range: .plotDimension(startPadding: 0, endPadding: 3))
        .chartYScale(domain: yLo...yHi, range: .plotDimension(padding: 0))
        .chartPlotStyle { $0.clipped() }
        .chartOverlay { proxy in
            GeometryReader { geo in
                if let plotFrame = proxy.plotFrame, points.count >= 2 {
                    let frame = geo[plotFrame]
                    extremeLabel("Hoch \(formatRate(hi))", index: highIndex, value: hi, above: true, labelColor: hi > (points.first?.value ?? hi) ? Color(red: 0.13, green: 0.6, blue: 0.25) : Color.secondary, sub: subText(points[highIndex]), proxy: proxy, frame: frame)
                    extremeLabel("Tief \(formatRate(lo))", index: lowIndex, value: lo, above: false, labelColor: lo < (points.first?.value ?? lo) ? Color.red : Color.secondary, sub: subText(points[lowIndex]), proxy: proxy, frame: frame)
                }
                if scrubbing {
                    Rectangle().fill(.clear).contentShape(Rectangle())
                        .gesture(DragGesture(minimumDistance: 0).onChanged { value in
                            guard let plotFrame = proxy.plotFrame, !points.isEmpty else { return }
                            let origin = geo[plotFrame].origin
                            let x = value.location.x - origin.x
                            if let position = proxy.value(atX: x, as: Double.self) {
                                scrubIndex = min(max(Int(position.rounded()), 0), points.count - 1)
                            }
                        }.onEnded { _ in scrubIndex = nil })
                    if let scrubIndex, scrubIndex < points.count, let plotFrame = proxy.plotFrame, let x = proxy.position(forX: scrubIndex) {
                        let scrub = points[scrubIndex]
                        let frame = geo[plotFrame]
                        Rectangle()
                            .fill(Color.primary.opacity(0.35))
                            .frame(width: 1, height: frame.height)
                            .position(x: frame.minX + x, y: frame.midY)
                        bubble(scrub)
                            .position(x: min(frame.maxX - 54, max(frame.minX + 54, frame.minX + x + 8)), y: frame.minY + 28)
                    }
                }
            }
        }
        .frame(height: height)
        .frame(maxWidth: .infinity)
    }

    /// 3–4 round rate levels inside the visible range.
    static func yTicks(_ lo: Double, _ hi: Double) -> [Double] {
        let raw = (hi - lo) / 4
        guard raw > 0 else { return [] }
        let mag = pow(10, floor(log10(raw)))
        let step = max([1, 2, 2.5, 5, 10].map { $0 * mag }.first { $0 >= raw } ?? 10 * mag, 0.0001)
        var out: [Double] = []
        var v = (lo / step).rounded(.up) * step
        while v <= hi {
            if v > lo + step * 0.2 && v < hi - step * 0.2 { out.append(v) }
            v += step
        }
        return out
    }

    private static let zurichCalendar: Calendar = {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Europe/Zurich") ?? .current
        cal.firstWeekday = 2
        return cal
    }()

    /// Indices where a new step starts: 3 h (Tag), day (Woche), week (Monat), 2 months (Jahr), year (5J), 2 years (10J).
    static func xTicks(_ points: [RatePoint], span: ChartSpan) -> [Int] {
        let cal = zurichCalendar
        var out: [Int] = []
        var lastKey: Int?
        for (i, p) in points.enumerated() {
            let c = cal.dateComponents([.year, .month, .day, .hour, .weekOfYear, .yearForWeekOfYear], from: p.date)
            let key: Int
            switch span {
            case .day: key = (c.day ?? 0) * 100 + (c.hour ?? 0) / 3
            case .week: key = (c.month ?? 0) * 100 + (c.day ?? 0)
            case .month: key = (c.yearForWeekOfYear ?? 0) * 100 + (c.weekOfYear ?? 0)
            case .year: key = (c.year ?? 0) * 100 + ((c.month ?? 1) - 1) / 2
            case .five: key = c.year ?? 0
            case .ten: key = (c.year ?? 0) / 2
            }
            if key != lastKey {
                if lastKey != nil { out.append(i) }
                lastKey = key
            }
        }
        // a series that starts exactly on a step (e.g. a Monday for Monat) gets its first line too
        if let first = points.first, span == .month, cal.component(.weekday, from: first.date) == 2 { out.insert(0, at: 0) }
        if out.count > 6 {
            let stride = Int((Double(out.count) / 5).rounded(.up))
            out = out.enumerated().filter { $0.offset % stride == 0 }.map(\.element)
        }
        return out
    }

    private static let labelFormatters: [ChartSpan: DateFormatter] = {
        var map: [ChartSpan: DateFormatter] = [:]
        for span in ChartSpan.allCases {
            let fmt = DateFormatter()
            fmt.locale = Locale(identifier: "de_CH")
            fmt.timeZone = TimeZone(identifier: "Europe/Zurich")
            switch span {
            case .day: fmt.dateFormat = "HH:mm"
            case .week, .month: fmt.dateFormat = "d.M."
            case .year: fmt.dateFormat = "MMM"
            case .five, .ten: fmt.dateFormat = "yyyy"
            }
            map[span] = fmt
        }
        return map
    }()

    static func xLabel(_ point: RatePoint, span: ChartSpan) -> String {
        labelFormatters[span]?.string(from: point.date) ?? ""
    }

    /// Small label with a dot at the high (above the line) or the low (below it), kept inside the plot.
    @ViewBuilder
    private func extremeLabel(_ text: String, index: Int, value: Double, above: Bool, labelColor: Color, sub: String?, proxy: ChartProxy, frame: CGRect) -> some View {
        if let px = proxy.position(forX: index), let py = proxy.position(forY: value) {
            let x = frame.minX + px
            let y = frame.minY + py
            let half = CGFloat(max(text.count, sub?.count ?? 0)) * 2.7 + 2
            let lift: CGFloat = sub == nil ? 9 : 15
            let edge: CGFloat = sub == nil ? 6 : 12
            Circle().fill(tone).frame(width: 5, height: 5).overlay(Circle().stroke(Color.white, lineWidth: 1.5)).position(x: x, y: y)
            VStack(spacing: 0) {
                Text(text)
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(labelColor)
                if let sub {
                    Text(sub)
                        .font(.system(size: 8))
                        .foregroundStyle(.secondary)
                }
            }
            .monospacedDigit()
            .fixedSize()
            .position(x: min(max(x, frame.minX + half), frame.maxX - half),
                      y: min(max(above ? y - lift : y + lift, frame.minY + edge), frame.maxY - edge))
        }
    }

    private func subText(_ point: RatePoint) -> String? {
        guard showDates else { return nil }
        return span == .day ? ChartFormat.time.string(from: point.date) : (longDates ? ChartFormat.shortDate : ChartFormat.dayMonth).string(from: point.date)
    }

    private func bubble(_ point: RatePoint) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("\(formatRate(point.value)) \(base)").font(.system(size: 11, weight: .semibold))
            Text(ChartFormat.bubbleDate(point)).font(.system(size: 11))
            if point.raw > 0 {
                Text("1 \(base) = \(formatRate(1 / point.raw)) \(code)").font(.system(size: 11))
            }
        }
        .monospacedDigit()
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(.black.opacity(0.9), in: RoundedRectangle(cornerRadius: 8))
        .foregroundStyle(.white)
    }

}

func chartTone(_ points: [RatePoint]) -> Color {
    guard let first = points.first, let last = points.last else { return .gray }
    if last.value - first.value > 0.00005 { return Color(red: 0.204, green: 0.780, blue: 0.349) }
    if first.value - last.value > 0.00005 { return Color(red: 1, green: 0.231, blue: 0.188) }
    return .gray
}

/// Drawing subset. First, last, high, and low stay so the line and the labels still meet the extrema.
func downsample(_ points: [RatePoint], max count: Int) -> [RatePoint] {
    downsampleIndices(points, max: count).map { points[$0] }
}

/// Indices of the drawing subset, ascending.
func downsampleIndices(_ points: [RatePoint], max count: Int) -> [Int] {
    let n = points.count
    guard n > count, count >= 2 else { return Array(0..<n) }
    var high = 0
    var low = 0
    for index in 1..<n {
        if points[index].value > points[high].value { high = index }
        if points[index].value < points[low].value { low = index }
    }
    var keep: Set<Int> = [0, n - 1, high, low]
    let slots = count - 1
    if slots > 0 {
        for step in 0...slots {
            keep.insert(Int((Double(step) * Double(n - 1) / Double(slots)).rounded()))
        }
    }
    if keep.count > count {
        let required: Set<Int> = [0, n - 1, high, low]
        var extras = keep.subtracting(required).sorted()
        while keep.count > count, !extras.isEmpty {
            keep.remove(extras.remove(at: extras.count / 2))
        }
    }
    return keep.sorted()
}

func dayChangeTone(_ delta: Double) -> Color {
    if delta > 0.00005 { return Color(red: 0.204, green: 0.780, blue: 0.349) }
    if delta < -0.00005 { return Color(red: 1, green: 0.231, blue: 0.188) }
    return .secondary
}

private enum ChartFormat {
    /// Shared formatters for the Hoch/Tief sub-labels ("29.9.2026" / "14:00").
    @MainActor static let shortDate: DateFormatter = {
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "de_CH")
        fmt.timeZone = TimeZone(identifier: "Europe/Zurich")
        fmt.dateFormat = "d.M.yyyy"
        return fmt
    }()
    @MainActor static let dayMonth: DateFormatter = {
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "de_CH")
        fmt.timeZone = TimeZone(identifier: "Europe/Zurich")
        fmt.dateFormat = "d.M."
        return fmt
    }()
    @MainActor static let time: DateFormatter = {
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "de_CH")
        fmt.timeZone = TimeZone(identifier: "Europe/Zurich")
        fmt.dateFormat = "HH:mm"
        return fmt
    }()

    static func pretty(_ day: String?) -> String {
        guard let day, let date = RatesStore.dayDate(day) else { return "" }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "de_CH")
        fmt.timeZone = TimeZone(identifier: "Europe/Zurich")
        fmt.dateFormat = "d. MMM yyyy"
        return fmt.string(from: date)
    }

    /// "14.9.2026 – 12.10.2026"
    static func range(_ from: Date?, _ to: Date?) -> String {
        guard let from, let to else { return "" }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "de_CH")
        fmt.timeZone = TimeZone(identifier: "Europe/Zurich")
        fmt.dateFormat = "d.M.yyyy"
        return "\(fmt.string(from: from)) – \(fmt.string(from: to))"
    }

    static func change(_ delta: Double, percent: Double) -> String {
        let pct = NumberFormatter()
        pct.locale = Locale(identifier: "de_CH")
        pct.minimumFractionDigits = 2
        pct.maximumFractionDigits = 2
        pct.numberStyle = .decimal
        let body = pct.string(from: NSNumber(value: abs(percent))) ?? String(format: "%.2f", abs(percent))
        let sign = percent > 0.0005 ? "+" : percent < -0.0005 ? "−" : ""
        return "\(formatDelta(delta)) (\(sign)\(body) %)"
    }

    static func bubbleDate(_ point: RatePoint) -> String {
        if let hour = point.hour { return "\(pretty(point.day)) \(String(format: "%02d:00", hour))" }
        return pretty(point.day)
    }
}

enum ComparePalette {
    static let colors: [Color] = [
        Color(red: 0.000, green: 0.478, blue: 1.000),
        Color(red: 1.000, green: 0.584, blue: 0.000),
        Color(red: 0.686, green: 0.322, blue: 0.871),
        Color(red: 0.204, green: 0.780, blue: 0.349),
        Color(red: 1.000, green: 0.231, blue: 0.188),
        Color(red: 0.353, green: 0.784, blue: 0.980),
        Color(red: 1.000, green: 0.176, blue: 0.333),
        Color(red: 1.000, green: 0.800, blue: 0.000),
        Color(red: 0.188, green: 0.690, blue: 0.780),
        Color(red: 0.345, green: 0.337, blue: 0.839),
        Color(red: 0.635, green: 0.518, blue: 0.369),
        Color(red: 0.557, green: 0.557, blue: 0.576),
        Color(red: 0.000, green: 0.780, blue: 0.745),
        Color(red: 0.910, green: 0.310, blue: 0.600),
        Color(red: 0.400, green: 0.800, blue: 0.200),
        Color(red: 0.550, green: 0.350, blue: 0.150),
        Color(red: 0.250, green: 0.450, blue: 0.850),
        Color(red: 0.850, green: 0.250, blue: 0.150),
    ]

    static func color(_ index: Int) -> Color {
        colors[index % colors.count]
    }
}

private struct CompareReadout: Identifiable {
    var code: String
    var color: Color
    var percent: Double
    var id: String { code }
}

private struct CompareLine {
    var code: String
    var color: Color
    var full: [RatePoint]
    var drawn: [RatePoint]
}

@MainActor private func compareLines(from store: RatesStore) -> [CompareLine] {
    store.compareLines().map { line in
        let full = line.points.map { RatePoint(day: $0.day, hour: nil, value: $0.percent, raw: $0.percent, date: $0.date) }
        return CompareLine(code: line.code, color: ComparePalette.color(store.compareIndex(line.code)), full: full, drawn: downsample(full, max: 240))
    }
}

struct CompareChartCard: View {
    @EnvironmentObject private var store: RatesStore
    var preview: Bool = false
    @State private var showDetail = false

    var body: some View {
        let lines = compareLines(from: store)
        let dates = lines.flatMap { $0.full.map(\.date) }
        return VStack(alignment: .leading, spacing: 2) {
            if lines.contains(where: { $0.drawn.count >= 2 }) {
                ChartBoxHeader(caption: store.compareSpan.caption, range: ChartFormat.range(dates.min(), dates.max()))
                ComparePlot(lines: lines, height: 56, scrubbing: false, caption: store.compareSpan.caption, preview: preview) {
                    open()
                }
                .allowsHitTesting(false)
                .padding(.top, 2)
            } else {
                Text("Keine Kurse in diesem Zeitraum.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
            }
        }
        .chartBox()
        .contentShape(Rectangle())
        .onTapGesture { open() }
        .sheet(isPresented: $showDetail) {
            CompareDetailSheet().environmentObject(store)
        }
        #if DEBUG
        .task {
            if ScreenshotMode.shot == "compare" && !preview { await ScreenshotMode.wait(); showDetail = true }
        }
        #endif
    }

    private func open() {
        guard !preview else { return }
        showDetail = true
    }
}

struct CompareDetailSheet: View {
    @EnvironmentObject private var store: RatesStore

    var body: some View {
        let lines = compareLines(from: store)
        return NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Bezogen auf \(store.base)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    if lines.contains(where: { $0.drawn.count >= 2 }) {
                        ComparePlot(lines: lines, height: 260, scrubbing: true, caption: store.compareSpan.caption, preview: false, onOpen: {})
                        spanPicker
                    } else {
                        Text("Keine Kurse in diesem Zeitraum.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                        spanPicker
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle("Entwicklung")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { SheetClose() } }
            .toolbarBackground(Color(uiColor: .systemGroupedBackground), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .background(Color(uiColor: .systemGroupedBackground))
        }
        .presentationDragIndicator(.visible)
    }

    private var spanPicker: some View {
        Picker("Zeitraum", selection: Binding(
            get: { store.compareSpan },
            set: { newValue in
                guard newValue != store.compareSpan else { return }
                store.compareSpan = newValue
                store.saveView()
                Task { await store.loadHistoryIfNeeded() }
            }
        )) {
            ForEach(ChartSpan.allCases) { item in
                Text(item.rawValue).tag(item)
            }
        }
        .pickerStyle(.segmented)
    }
}

private struct ComparePlot: View {
    let lines: [CompareLine]
    let height: CGFloat
    let scrubbing: Bool
    let caption: String
    var preview: Bool = false
    var onOpen: () -> Void
    @State private var scrubDate: Date?

    var body: some View {
        compareChart
        .frame(height: height)
        .clipped()
        .frame(maxWidth: .infinity)
    }

    private var compareChart: some View {
        let drawn = lines.flatMap(\.drawn)
        let hi = max(drawn.map(\.value).max() ?? 1, 0)
        let lo = min(drawn.map(\.value).min() ?? -1, 0)
        let span = max(hi - lo, 0.4)
        let pad = span * 0.12
        let readout = scrubbing ? scrubReadout : nil
        // Shared trading-time axis: every date any line has gets one slot; weekends take no width.
        let timeline = Array(Set(lines.flatMap { $0.full.map(\.date) })).sorted()
        let slot = Dictionary(uniqueKeysWithValues: timeline.enumerated().map { ($0.element, $0.offset) })
        let lastX = max(timeline.count - 1, 1)
        return Chart {
            ForEach(lines, id: \.code) { line in
                ForEach(line.drawn) { point in
                    LineMark(
                        x: .value("Zeit", slot[point.date] ?? 0),
                        y: .value("Prozent", point.value),
                        series: .value("Währung", line.code)
                    )
                    .interpolationMethod(.monotone)
                    .foregroundStyle(line.color)
                    .lineStyle(StrokeStyle(lineWidth: 1.25, lineCap: .round, lineJoin: .round))
                }
            }
            RuleMark(y: .value("Null", 0))
                .foregroundStyle(Color.gray.opacity(0.45))
                .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .chartXScale(domain: 0...lastX, range: .plotDimension(startPadding: 0, endPadding: scrubbing ? 3 : Self.endBand))
        .chartYScale(domain: (lo - pad)...(hi + pad), range: .plotDimension(padding: 0))
        .chartPlotStyle { $0.clipped() }
        .chartOverlay { proxy in
            GeometryReader { geo in
                if !scrubbing, let plotFrame = proxy.plotFrame {
                    endLabels(proxy: proxy, frame: geo[plotFrame])
                }
                if scrubbing {
                    Rectangle().fill(.clear).contentShape(Rectangle())
                        .gesture(DragGesture(minimumDistance: 0).onChanged { value in
                            guard let plotFrame = proxy.plotFrame, !timeline.isEmpty else { return }
                            let x = value.location.x - geo[plotFrame].origin.x
                            if let position = proxy.value(atX: x, as: Double.self) {
                                scrubDate = timeline[min(max(Int(position.rounded()), 0), timeline.count - 1)]
                            }
                        }.onEnded { _ in scrubDate = nil })
                }
            }
        }
        .overlay(alignment: .top) {
            if let readout, scrubbing {
                readoutView(readout)
                    .padding(.top, 16)
            }
        }
    }

    /// Room at the right end of the list plot for the end labels.
    static let endBand: CGFloat = 46

    /// Each line's change over the period at its right end, in the line colour, nudged apart vertically.
    private func endLabels(proxy: ChartProxy, frame: CGRect) -> some View {
        var items: [(y: CGFloat, text: String, color: Color)] = lines.compactMap { line in
            guard let last = line.full.last, let y = proxy.position(forY: last.value) else { return nil }
            return (frame.minY + y, formatComparePercent(last.value), line.color)
        }
        items.sort { $0.y < $1.y }
        let gap: CGFloat = 11
        for i in items.indices.dropFirst() where items[i].y - items[i - 1].y < gap {
            items[i].y = items[i - 1].y + gap
        }
        // keep the whole stack inside the plot
        if let last = items.last, last.y > frame.maxY - 5 {
            let shift = last.y - (frame.maxY - 5)
            for i in items.indices { items[i].y -= shift }
        }
        if let first = items.first, first.y < frame.minY + 5 {
            let shift = frame.minY + 5 - first.y
            for i in items.indices { items[i].y += shift }
        }
        return ZStack(alignment: .topLeading) {
            ForEach(items.indices, id: \.self) { i in
                Text(items[i].text)
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(items[i].color)
                    .monospacedDigit()
                    .fixedSize()
                    .frame(width: Self.endBand, alignment: .trailing)
                    .position(x: frame.maxX - Self.endBand / 2, y: items[i].y)
            }
        }
    }

    private var scrubReadout: [CompareReadout]? {
        guard let scrubDate else { return nil }
        return lines.compactMap { line in
            guard let point = line.full.min(by: { abs($0.date.timeIntervalSince(scrubDate)) < abs($1.date.timeIntervalSince(scrubDate)) }) else { return nil }
            return CompareReadout(code: line.code, color: line.color, percent: point.value)
        }
    }

    private func readoutView(_ rows: [CompareReadout]) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(rows) { row in
                HStack(spacing: 6) {
                    Circle().fill(row.color).frame(width: 7, height: 7)
                    Text(row.code)
                    Text(formatComparePercent(row.percent))
                }
            }
        }
        .font(.system(size: 11, weight: .semibold))
        .monospacedDigit()
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(.black.opacity(0.9), in: RoundedRectangle(cornerRadius: 8))
        .foregroundStyle(.white)
    }
}

private func formatComparePercent(_ value: Double) -> String {
    let pct = NumberFormatter()
    pct.locale = Locale(identifier: "de_CH")
    pct.minimumFractionDigits = 2
    pct.maximumFractionDigits = 2
    pct.numberStyle = .decimal
    let body = pct.string(from: NSNumber(value: abs(value))) ?? String(format: "%.2f", abs(value))
    let sign = value > 0.005 ? "+" : value < -0.005 ? "−" : ""
    return "\(sign)\(body) %"
}
