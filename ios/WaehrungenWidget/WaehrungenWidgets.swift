import AppIntents
import SwiftUI
import WidgetKit

// MARK: - Configuration (small widget A)

struct CurrencyEntity: AppEntity {
    let id: String
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Währung"
    static let defaultQuery = CurrencyQuery()
    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(id)", subtitle: "\(WFmt.name(id))")
    }
}

struct CurrencyQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [CurrencyEntity] {
        identifiers.map { CurrencyEntity(id: $0) }
    }

    func suggestedEntities() async throws -> [CurrencyEntity] {
        WidgetShared.read().foreign.map { CurrencyEntity(id: $0) }
    }

    func defaultResult() async -> CurrencyEntity? {
        WidgetShared.read().foreign.first.map { CurrencyEntity(id: $0) }
    }
}

struct SelectCurrencyIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Währung wählen"
    static let description = IntentDescription("Zeigt den Kurs einer Währung in der Berichtswährung.")

    @Parameter(title: "Währung")
    var currency: CurrencyEntity?

    init() {}
}

// MARK: - Timeline

struct WEntry: TimelineEntry, Sendable {
    var date: Date
    var snap: WSnapshot
    var code: String?
}

enum WTimeline {
    static let refresh: TimeInterval = 30 * 60

    static func snapshot(live: Bool) async -> WSnapshot {
        let shared = WidgetShared.read()
        if !live { return WFetch.sample(base: shared.base, codes: shared.foreign) }
        return await WFetch.load(base: shared.base, codes: shared.foreign)
    }

    static func timeline(_ entry: WEntry) -> Timeline<WEntry> {
        // retry sooner after a failed fetch
        let next = Date().addingTimeInterval(entry.snap.failed ? 10 * 60 : refresh)
        return Timeline(entries: [entry], policy: .after(next))
    }
}

struct SingleProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> WEntry {
        WEntry(date: Date(), snap: WFetch.sample(base: "CHF", codes: ["EUR"]), code: "EUR")
    }

    func snapshot(for configuration: SelectCurrencyIntent, in context: Context) async -> WEntry {
        let snap = await WTimeline.snapshot(live: !context.isPreview)
        return WEntry(date: Date(), snap: snap, code: configuration.currency?.id ?? snap.rows.first?.code)
    }

    func timeline(for configuration: SelectCurrencyIntent, in context: Context) async -> Timeline<WEntry> {
        let shared = WidgetShared.read()
        var codes = shared.foreign
        let chosen = configuration.currency?.id ?? codes.first
        if let chosen, !codes.contains(chosen) { codes.append(chosen) }
        let snap = await WFetch.load(base: shared.base, codes: codes)
        return WTimeline.timeline(WEntry(date: Date(), snap: snap, code: chosen))
    }
}

struct ListProvider: TimelineProvider {
    func placeholder(in context: Context) -> WEntry {
        WEntry(date: Date(), snap: WFetch.sample(base: "CHF", codes: ["EUR", "USD", "GBP", "JPY"]))
    }

    func getSnapshot(in context: Context, completion: @escaping (WEntry) -> Void) {
        nonisolated(unsafe) let done = completion
        let live = !context.isPreview
        Task {
            let snap = await WTimeline.snapshot(live: live)
            done(WEntry(date: Date(), snap: snap))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WEntry>) -> Void) {
        nonisolated(unsafe) let done = completion
        Task {
            let snap = await WTimeline.snapshot(live: true)
            done(WTimeline.timeline(WEntry(date: Date(), snap: snap)))
        }
    }
}

// MARK: - Widgets

private extension View {
    func widgetCard() -> some View {
        containerBackground(for: .widget) { Color(uiColor: .systemBackground) }
    }
}

struct SingleCurrencyWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "WaehrungenSingle", intent: SelectCurrencyIntent.self, provider: SingleProvider()) { entry in
            let code = entry.code ?? entry.snap.rows.first?.code ?? "EUR"
            let index = WidgetShared.read().foreign.firstIndex(of: code) ?? 0
            SingleCurrencyView(snap: entry.snap, code: code, colorIndex: index)
                .widgetCard()
                .widgetURL(WidgetShared.url(for: code))
        }
        .configurationDisplayName("Eine Währung")
        .description("Kurs, Tagesveränderung und Verlauf einer Woche.")
        .supportedFamilies([.systemSmall])
    }
}

struct TripleCurrencyWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WaehrungenTriple", provider: ListProvider()) { entry in
            TripleCurrencyView(snap: entry.snap)
                .widgetCard()
                .widgetURL(WidgetShared.url(for: nil))
        }
        .configurationDisplayName("Drei Währungen")
        .description("Die ersten drei Währungen Ihrer Liste.")
        .supportedFamilies([.systemSmall])
    }
}

struct OverviewWidgetView: View {
    @Environment(\.widgetFamily) private var family
    var entry: WEntry
    var body: some View {
        if family == .systemLarge {
            LargeOverviewView(snap: entry.snap)
        } else {
            MediumOverviewView(snap: entry.snap)
        }
    }
}

struct OverviewWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WaehrungenOverview", provider: ListProvider()) { entry in
            OverviewWidgetView(entry: entry)
                .widgetCard()
                .widgetURL(WidgetShared.url(for: nil))
        }
        .configurationDisplayName("Währungen")
        .description("Ihre Währungen mit Verlauf einer Woche.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct LockScreenWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WaehrungenLock", provider: ListProvider()) { entry in
            LockRectView(snap: entry.snap)
                .containerBackground(for: .widget) { Color.clear }
                .widgetURL(WidgetShared.url(for: nil))
        }
        .configurationDisplayName("Währungen")
        .description("Zwei Kurse auf dem Sperrbildschirm.")
        .supportedFamilies([.accessoryRectangular])
    }
}

@main
struct WaehrungenWidgetBundle: WidgetBundle {
    var body: some Widget {
        SingleCurrencyWidget()
        TripleCurrencyWidget()
        OverviewWidget()
        LockScreenWidget()
    }
}
