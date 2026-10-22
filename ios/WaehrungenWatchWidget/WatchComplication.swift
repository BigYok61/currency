import SwiftUI
import WidgetKit

// Build 36: watch-face complication with one currency (the first foreign currency of the list).

struct WatchEntry: TimelineEntry {
    var date: Date
    var row: WRow?
    var locked: Bool
}

struct WatchProvider: TimelineProvider {
    func placeholder(in context: Context) -> WatchEntry {
        WatchEntry(date: Date(), row: WRow(code: "EUR", rate: 0.9312, delta: 0.0011, percent: 0.12, week: []), locked: false)
    }

    func getSnapshot(in context: Context, completion: @escaping (WatchEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : cachedEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WatchEntry>) -> Void) {
        Task {
            let shared = WidgetShared.read()
            let code = shared.foreign.first ?? "EUR"
            let fresh = await WFetch.load(base: shared.base, codes: shared.foreign)
            var entry = cachedEntry()
            if !fresh.failed {
                WatchCache.save(fresh)
                entry = WatchEntry(date: Date(), row: fresh.row(code), locked: ProShared.locked)
            }
            let next = Date().addingTimeInterval(fresh.failed ? 15 * 60 : 30 * 60)
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }

    private func cachedEntry() -> WatchEntry {
        let code = WidgetShared.read().foreign.first ?? "EUR"
        return WatchEntry(date: Date(), row: WatchCache.load()?.snapshot.row(code) ?? WRow(code: code, week: []), locked: ProShared.locked)
    }
}

struct WatchComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WatchEntry

    var body: some View {
        let code = entry.row?.code ?? "EUR"
        let rate = WatchFmt.rate(entry.row?.rate)
        let pct = WatchFmt.percent(entry.row?.percent)
        if entry.locked {
            switch family {
            case .accessoryInline: Text("Pro-Funktion")
            case .accessoryCircular: VStack(spacing: 0) { Image(systemName: "sparkles"); Text("Pro").font(.system(size: 12, weight: .semibold)) }
            default: VStack(alignment: .leading) { Text("Pro-Funktion").font(.headline); Text("Auf dem iPhone freischalten").font(.system(size: 12)) }
            }
        } else {
            switch family {
            case .accessoryInline:
                Text("\(code) \(rate) \(pct)")
            case .accessoryCircular:
                VStack(spacing: 0) {
                    Text(code).font(.system(size: 11, weight: .semibold))
                    Text(String(format: "%.3f", entry.row?.rate ?? 0)).font(.system(size: 12, weight: .semibold)).minimumScaleFactor(0.6)
                    Text(pct).font(.system(size: 9)).foregroundStyle(WatchFmt.tone(entry.row?.percent)).minimumScaleFactor(0.6)
                }
                .monospacedDigit()
            default:
                VStack(alignment: .leading, spacing: 1) {
                    HStack {
                        Text(code).font(.headline)
                        Spacer()
                        Text(rate).font(.headline).monospacedDigit()
                    }
                    Text(pct).foregroundStyle(WatchFmt.tone(entry.row?.percent)).monospacedDigit()
                    Text(WatchFmt.name(code)).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
                }
            }
        }
    }
}

@main
struct WaehrungenWatchComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WaehrungenWatchComplication", provider: WatchProvider()) { entry in
            WatchComplicationView(entry: entry)
                .containerBackground(for: .widget) { Color.clear }
        }
        .configurationDisplayName("Währungen")
        .description("Kurs und Tagesveränderung der ersten Währung Ihrer Liste.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}
