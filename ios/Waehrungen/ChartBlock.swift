import Charts
import SwiftUI

struct ChartBlock: View {
    @EnvironmentObject private var store: RatesStore
    let code: String
    var preview: Bool = false
    @State private var showDetail = false

    private var points: [RatePoint] { store.series(code) }

    private var tone: Color {
        guard let first = points.first, let last = points.last else { return .gray }
        if last.value - first.value > 0.00005 { return Color(red: 0.204, green: 0.780, blue: 0.349) }
        if first.value - last.value > 0.00005 { return Color(red: 1, green: 0.231, blue: 0.188) }
        return .gray
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            periodLabel
            if points.count >= 2 {
                plot(height: 112, scrubbing: false)
                    .contentShape(Rectangle())
                    .onTapGesture { openDetail() }
                dateRow
            } else {
                Text("Keine Kurse in diesem Zeitraum.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .sheet(isPresented: $showDetail) {
            ChartDetailSheet(code: code).environmentObject(store)
        }
    }

    private var periodLabel: some View {
        Group {
            if preview {
                Text(store.span.caption)
            } else {
                Button { openDetail() } label: {
                    Text(store.span.caption)
                }
                .buttonStyle(.plain)
            }
        }
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(Color.blue)
        .accessibilityLabel("Zeitraum \(store.span.caption)")
    }

    private func openDetail() {
        guard !preview else { return }
        showDetail = true
    }

    private func plot(height: CGFloat, scrubbing: Bool) -> some View {
        InlinePlot(points: points, tone: tone, height: height, scrubbing: scrubbing, code: code, base: store.base)
    }

    private var dateRow: some View {
        HStack {
            Text(ChartFormat.pretty(points.first?.day))
            Spacer()
            Text(ChartFormat.pretty(points.last?.day))
        }
        .font(.system(size: 10))
        .foregroundStyle(.secondary)
        .monospacedDigit()
    }
}

struct ChartDetailSheet: View {
    @EnvironmentObject private var store: RatesStore
    let code: String

    private var points: [RatePoint] { store.series(code) }

    private var tone: Color {
        guard let first = points.first, let last = points.last else { return .gray }
        if last.value - first.value > 0.00005 { return Color(red: 0.204, green: 0.780, blue: 0.349) }
        if first.value - last.value > 0.00005 { return Color(red: 1, green: 0.231, blue: 0.188) }
        return .gray
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if let value = store.quote(code).value {
                        Text("\(formatRate(value)) \(store.base)")
                            .font(.system(size: 34, weight: .bold))
                            .foregroundStyle(tone)
                            .monospacedDigit()
                    }
                    Text(store.secondaryText(code))
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Color.blue)
                        .monospacedDigit()
                    if points.count >= 2 {
                        InlinePlot(points: points, tone: tone, height: 260, scrubbing: true, code: code, base: store.base)
                        HStack {
                            Text(ChartFormat.pretty(points.first?.day))
                            Spacer()
                            Text(ChartFormat.pretty(points.last?.day))
                        }
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                    } else {
                        Text("Keine Kurse in diesem Zeitraum.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
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
}

/// Shared thin chart. Scrubbing is only used on the detail sheet.
private struct InlinePlot: View {
    let points: [RatePoint]
    let tone: Color
    let height: CGFloat
    let scrubbing: Bool
    let code: String
    let base: String
    @State private var scrub: RatePoint?

    var body: some View {
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
                if scrubbing {
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
        }
        .frame(height: height)
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

    private func bubble(_ point: RatePoint) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("\(formatRate(point.value)) \(base)").font(.system(size: 11, weight: .semibold))
            Text(ChartFormat.bubbleDate(point)).font(.system(size: 11))
            if point.raw > 0 {
                Text("\(formatRate(1 / point.raw)) \(code)").font(.system(size: 11))
            }
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
}

private enum ChartFormat {
    static func pretty(_ day: String?) -> String {
        guard let day, let date = RatesStore.dayDate(day) else { return "" }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "de_CH")
        fmt.timeZone = TimeZone(identifier: "Europe/Zurich")
        fmt.dateFormat = "d. MMM yyyy"
        return fmt.string(from: date)
    }

    static func bubbleDate(_ point: RatePoint) -> String {
        if let hour = point.hour { return "\(pretty(point.day)) \(String(format: "%02d:00", hour))" }
        return pretty(point.day)
    }
}
