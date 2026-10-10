import Charts
import SwiftUI

struct ChartBlock: View {
    @EnvironmentObject private var store: RatesStore
    let code: String
    @State private var scrub: RatePoint?

    private var points: [RatePoint] { store.series(code) }

    private var tone: Color {
        guard let first = points.first, let last = points.last else { return .gray }
        if last.value - first.value > 0.00005 { return Color(red: 0.204, green: 0.780, blue: 0.349) }
        if first.value - last.value > 0.00005 { return Color(red: 1, green: 0.231, blue: 0.188) }
        return .gray
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if points.count >= 2 {
                chart
                HStack {
                    Text(pretty(points.first?.day))
                    Spacer()
                    Text(pretty(points.last?.day))
                }
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
                .monospacedDigit()
            } else {
                Text("Keine Kurse in diesem Zeitraum.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            spanPicker
        }
    }

    private var chart: some View {
        let hi = points.map(\.value).max() ?? 0
        let lo = points.map(\.value).min() ?? 0
        let span = max(hi - lo, 0.004)
        let pad = span * 0.42
        return Chart {
            ForEach(points) { point in
                AreaMark(x: .value("Zeit", point.date), y: .value("Kurs", point.value))
                    .interpolationMethod(.monotone)
                    .foregroundStyle(LinearGradient(colors: [tone.opacity(0.17), tone.opacity(0)], startPoint: .top, endPoint: .bottom))
                LineMark(x: .value("Zeit", point.date), y: .value("Kurs", point.value))
                    .interpolationMethod(.monotone)
                    .foregroundStyle(tone)
                    .lineStyle(StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
            }
            if let first = points.first {
                RuleMark(y: .value("Beginn", first.value))
                    .foregroundStyle(Color.gray.opacity(0.7))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
            }
            if let last = points.last {
                PointMark(x: .value("Zeit", last.date), y: .value("Kurs", last.value))
                    .foregroundStyle(tone)
                    .symbolSize(28)
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .chartXScale(range: .plotDimension(startPadding: 0, endPadding: 3))
        .chartYScale(domain: (lo - pad)...(hi + pad), range: .plotDimension(padding: 0))
        .chartOverlay { proxy in
            GeometryReader { geo in
                Rectangle().fill(.clear).contentShape(Rectangle())
                    .gesture(DragGesture(minimumDistance: 0).onChanged { value in
                        guard let plotFrame = proxy.plotFrame else { return }
                        let origin = geo[plotFrame].origin
                        let x = value.location.x - origin.x
                        if let date = proxy.value(atX: x, as: Date.self) {
                            scrub = nearest(to: date)
                        }
                    }.onEnded { _ in scrub = nil })
                if let scrub, let plotFrame = proxy.plotFrame, let x = proxy.position(forX: scrub.date) {
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
        .frame(height: 112)
        .frame(maxWidth: .infinity)
        .overlay(alignment: .topTrailing) {
            Text("Hoch \(formatRate(hi))")
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
                .monospacedDigit()
                .allowsHitTesting(false)
        }
        .overlay(alignment: .bottomTrailing) {
            Text("Tief \(formatRate(lo))")
                .font(.system(size: 10))
                .foregroundStyle(.secondary)
                .monospacedDigit()
                .allowsHitTesting(false)
        }
    }

    private var spanPicker: some View {
        Picker("Zeitraum", selection: $store.span) {
            ForEach(ChartSpan.allCases) { item in
                Text(item.rawValue).tag(item)
            }
        }
        .pickerStyle(.segmented)
        .onChange(of: store.span) { _ in
            store.saveView()
            Task { await store.loadHistoryIfNeeded() }
        }
    }

    private func bubble(_ point: RatePoint) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(rateLine(point.value)).font(.system(size: 11, weight: .semibold))
            Text(bubbleDate(point)).font(.system(size: 11))
            Text("\(formatRate(point.raw)) \(store.base)").font(.system(size: 11))
        }
        .monospacedDigit()
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(.black.opacity(0.9), in: RoundedRectangle(cornerRadius: 8))
        .foregroundStyle(.white)
    }

    private func nearest(to date: Date) -> RatePoint? {
        points.min { abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date)) }
    }

    private func rateLine(_ value: Double) -> String {
        let unit = code == store.base ? store.base : code
        return "\(formatRate(value)) \(unit)"
    }

    private func pretty(_ day: String?) -> String {
        guard let day, let date = RatesStore.dayDate(day) else { return "" }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "de_CH")
        fmt.timeZone = TimeZone(identifier: "Europe/Zurich")
        fmt.dateFormat = "d. MMM yyyy"
        return fmt.string(from: date)
    }

    private func bubbleDate(_ point: RatePoint) -> String {
        if let hour = point.hour { return "\(pretty(point.day)) \(String(format: "%02d:00", hour))" }
        return pretty(point.day)
    }
}
