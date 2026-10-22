import SwiftUI
import Charts
import WidgetKit

@main
struct WaehrungenWatchApp: App {
    @StateObject private var model = WatchModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            WatchRootView()
                .environmentObject(model)
                .task { await model.refresh() }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { Task { await model.refresh() } }
                }
        }
    }
}

@MainActor
final class WatchModel: ObservableObject {
    @Published var snap: WSnapshot?
    @Published var offline = false
    @Published var loading = false
    @Published var isPro = ProShared.isPro

    init() {
        snap = WatchCache.load()?.snapshot
    }

    /// Pro feature that is actually blocked (never while ProShared.enforcementEnabled is false).
    var locked: Bool { ProShared.enforcementEnabled && !isPro }

    func refresh() async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        WatchSync.pullFromCloud()
        isPro = await WatchSync.refreshPro()
        let shared = WidgetShared.read()
        let fresh = await WFetch.load(base: shared.base, codes: shared.foreign)
        if fresh.failed {
            offline = true
            if snap == nil { snap = fresh }
        } else {
            offline = false
            snap = fresh
            WatchCache.save(fresh)
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}

struct WatchRootView: View {
    @EnvironmentObject private var model: WatchModel

    var body: some View {
        NavigationStack {
            if model.locked {
                WatchProLockedView()
            } else {
                list
            }
        }
    }

    private var list: some View {
        List {
            if let snap = model.snap {
                ForEach(snap.rows) { row in
                    NavigationLink {
                        WatchDetailView(row: row, base: snap.base)
                    } label: {
                        WatchRow(row: row)
                    }
                }
                Section {
                    if !WatchFmt.updated(snap.updated).isEmpty {
                        Text(WatchFmt.updated(snap.updated))
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                    }
                    if model.offline {
                        Text("Offline – zeigt die zuletzt geladenen Kurse.")
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                    }
                } footer: {
                    Text("Preise in \(snap.base)")
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Währungen")
        .refreshable { await model.refresh() }
    }
}

struct WatchRow: View {
    let row: WRow
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(row.code).font(.headline)
                Spacer()
                Text(WatchFmt.rate(row.rate)).font(.headline).monospacedDigit()
            }
            HStack {
                Text(WatchFmt.name(row.code))
                    .lineLimit(1)
                    .foregroundStyle(.secondary)
                Spacer(minLength: 4)
                Text(WatchFmt.percent(row.percent))
                    .monospacedDigit()
                    .foregroundStyle(WatchFmt.tone(row.percent))
            }
            .font(.system(size: 13))
        }
    }
}

struct WatchDetailView: View {
    let row: WRow
    let base: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                Text(WatchFmt.rate(row.rate) + " " + base)
                    .font(.title3.weight(.semibold))
                    .monospacedDigit()
                Text(WatchFmt.percent(row.percent) + " heute")
                    .font(.footnote)
                    .foregroundStyle(WatchFmt.tone(row.percent))
                if row.week.count > 1 {
                    let lo = row.week.min() ?? 0, hi = row.week.max() ?? 1
                    let pad = max((hi - lo) * 0.1, 0.0001)
                    Chart(Array(row.week.enumerated()), id: \.offset) { item in
                        LineMark(x: .value("Zeit", item.offset), y: .value("Kurs", item.element))
                            .interpolationMethod(.catmullRom)
                            .foregroundStyle(Color.blue)
                    }
                    .chartYScale(domain: (lo - pad)...(hi + pad))
                    .chartXAxis(.hidden)
                    .chartYAxis { AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) }
                    .frame(height: 90)
                    Text("Verlauf 7 Tage")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                } else {
                    Text("Noch kein Verlauf verfügbar.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 4)
        }
        .navigationTitle(row.code)
    }
}

struct WatchProLockedView: View {
    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Image(systemName: "sparkles").font(.title2).foregroundStyle(Color.blue)
                Text("Pro-Funktion").font(.headline)
                Text("Die Watch-App gehört zur Vollversion. Sie können die Vollversion in der App auf dem iPhone kaufen.")
                    .font(.footnote)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }
            .padding()
        }
    }
}
