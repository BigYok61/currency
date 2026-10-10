import SwiftUI

struct RootView: View {
    @EnvironmentObject private var store: RatesStore
    @State private var showView = false
    @State private var showTimes = false
    @State private var showAlerts = false
    @State private var showAdd = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(store.visible, id: \.self) { code in
                        CurrencyCard(code: code, preview: false)
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                if code != store.base {
                                    Button(role: .destructive) { store.remove(code) } label: {
                                        Label("Entfernen", systemImage: "trash")
                                    }
                                }
                            }
                            .listRowInsets(EdgeInsets(top: 8, leading: 20, bottom: 8, trailing: 8))
                    }
                } header: {
                    HStack {
                        Text("Währung")
                        Spacer()
                        Text("Kurse zu \(store.base)")
                    }
                    .font(.subheadline)
                    .textCase(nil)
                    .foregroundStyle(.secondary)
                }
                Section {
                    Button { showAdd = true } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 22, height: 22)
                            .background(Color(red: 0.204, green: 0.780, blue: 0.349), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Währung hinzufügen")
                    .listRowInsets(EdgeInsets(top: 8, leading: 20, bottom: 8, trailing: 16))
                    .listRowSeparator(.hidden)
                }
            }
            .listStyle(.plain)
            .refreshable { await store.reload() }
            .navigationTitle("Währungen")
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { showView = true } label: { Image(systemName: "square.grid.2x2") }
                        .accessibilityLabel("Ansicht")
                    Button { showTimes = true } label: { Image(systemName: "clock") }
                        .accessibilityLabel("Erfassungszeiten und Intervalle")
                    Button { showAlerts = true } label: { Image(systemName: "bell") }
                        .accessibilityLabel("FX-Alarme")
                    Button { Task { await store.reload() } } label: { Image(systemName: "arrow.clockwise") }
                        .accessibilityLabel("Aktualisieren")
                }
            }
        }
        .sheet(isPresented: $showView) { AnsichtSheet().environmentObject(store) }
        .sheet(isPresented: $showTimes) { TimesSheet().environmentObject(store) }
        .sheet(isPresented: $showAlerts) { AlertsSheet().environmentObject(store) }
        .sheet(isPresented: $showAdd) { AddSheet().environmentObject(store) }
    }
}

struct CurrencyCard: View {
    @EnvironmentObject private var store: RatesStore
    let code: String
    var preview: Bool
    @State private var dragOffset: CGFloat = 0

    var body: some View {
        let quote = store.quote(code)
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(CurrencyNames.name(code)).font(.system(size: 16, weight: .semibold))
                        if let time = store.fired[code] {
                            Image(systemName: "bell.fill")
                                .font(.system(size: 11))
                                .foregroundStyle(Color(red: 1, green: 0.231, blue: 0.188))
                            Text(time).font(.system(size: 11)).foregroundStyle(.secondary)
                        }
                    }
                    Text(code == store.base ? "\(store.base) · Berichtswährung" : "\(code) · \(CurrencyNames.symbol(code))")
                        .font(.system(size: 13))
                        .foregroundStyle(code == store.base ? Color.blue : Color.secondary)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 1) {
                    Text(rateText(quote.value))
                        .font(.system(size: 17, weight: code == store.base ? .medium : .semibold))
                        .monospacedDigit()
                        .foregroundStyle(code == store.base ? Color.secondary : Color.primary)
                    Text(invText(quote.raw))
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
            }
            if code != store.base {
                if store.showChart { ChartBlock(code: code).environmentObject(store) }
                if store.showIntervals { intervals }
                if store.showForecast { forecast }
                if store.showReference { reference }
                if !preview { handle }
            }
        }
        .offset(y: preview ? 0 : dragOffset)
    }

    private var intervals: some View {
        VStack(spacing: 3) {
            ForEach(store.hours, id: \.self) { hour in
                HStack {
                    Text(String(format: "%02d:00", hour)).foregroundStyle(.secondary)
                    Spacer()
                    Text(store.intervalValue(code, hour: hour).map { rateText($0) } ?? "–")
                }
                .font(.system(size: 13))
                .monospacedDigit()
            }
        }
    }

    private var forecast: some View {
        let line = store.forecast(code)
        return HStack(alignment: .top, spacing: 6) {
            Text("Prognose")
            pair(tag: "heute", value: line?.today, delta: line?.todayDelta)
            Text("·").foregroundStyle(.secondary)
            pair(tag: "7 Tage", value: line?.week, delta: line?.weekDelta)
        }
        .font(.system(size: 13, weight: .medium))
    }

    private func pair(tag: String, value: Double?, delta: Double?) -> some View {
        VStack(spacing: 1) {
            HStack(spacing: 4) {
                Text(tag).fontWeight(.regular).foregroundStyle(.secondary)
                Text(valueText(value, delta: delta)).monospacedDigit()
            }
            Text(formatDelta(delta))
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
                .monospacedDigit()
        }
    }

    private var reference: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack {
                Text("EZB-Referenzkurs")
                Spacer()
                Text(store.reference(code).map { rateText($0) } ?? "–").monospacedDigit()
            }
            .font(.system(size: 13))
            Text("Quelle EZB").font(.system(size: 11)).foregroundStyle(.secondary)
        }
    }

    private var handle: some View {
        HStack {
            Spacer()
            Image(systemName: "line.3.horizontal")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.secondary)
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
                .gesture(
                    LongPressGesture(minimumDuration: 0.3)
                        .sequenced(before: DragGesture(minimumDistance: 1))
                        .onChanged { value in
                            if case .second(true, let drag) = value {
                                dragOffset = drag?.translation.height ?? 0
                            }
                        }
                        .onEnded { value in
                            let height: CGFloat
                            if case .second(true, let drag) = value { height = drag?.translation.height ?? 0 } else { height = 0 }
                            let steps = Int((height / 72).rounded())
                            if steps != 0 { store.move(code, by: steps) }
                            dragOffset = 0
                        }
                )
                .accessibilityLabel("\(CurrencyNames.name(code)) verschieben")
        }
    }

    private func rateText(_ value: Double?) -> String {
        guard let value else { return "–" }
        let unit = code == store.base ? store.base : code
        return "\(formatRate(value)) \(unit)"
    }

    private func invText(_ raw: Double?) -> String {
        guard let raw else { return "–" }
        return "\(formatRate(raw)) \(store.base)"
    }

    private func valueText(_ value: Double?, delta: Double?) -> String {
        guard let value else { return "–" }
        let mark = arrow(delta)
        return mark.isEmpty ? formatRate(value) : "\(mark) \(formatRate(value))"
    }
}
