import SwiftUI
import UIKit

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
                            .listRowBackground(
                                Color(uiColor: .secondarySystemGroupedBackground)
                                    .overlay(store.convertEditing && store.convertSource == code ? Color.blue.opacity(0.12) : Color.clear)
                            )
                    }
                } header: {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("Währung")
                            Spacer()
                            Text("Kurse zu \(store.base)")
                        }
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        if store.showConvertPill {
                            HStack(spacing: 6) {
                                Text(store.convertPillText)
                                Button { store.resetConvert() } label: {
                                    Text("×")
                                        .font(.system(size: 15, weight: .semibold))
                                        .frame(width: 18, height: 18)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Umrechnung zurücksetzen")
                            }
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(.primary)
                            .padding(.leading, 12)
                            .padding(.trailing, 6)
                            .padding(.vertical, 4)
                            .background(Color(uiColor: .secondarySystemFill), in: Capsule())
                            .textCase(nil)
                        }
                    }
                    .textCase(nil)
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
                    .listRowBackground(Color.clear)
                }
            }
            .listStyle(.insetGrouped)
            .refreshable { await store.reload() }
            .navigationTitle("Währungen")
            .safeAreaInset(edge: .bottom, spacing: 0) { sourceBar }
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
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Fertig") {
                        store.finishConvert()
                        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                    }
                }
            }
        }
        .sheet(isPresented: $showView) { AnsichtSheet().environmentObject(store) }
        .sheet(isPresented: $showTimes) { TimesSheet().environmentObject(store) }
        .sheet(isPresented: $showAlerts) { AlertsSheet().environmentObject(store) }
        .sheet(isPresented: $showAdd) { AddSheet().environmentObject(store) }
    }

    private var sourceBar: some View {
        VStack(spacing: 2) {
            if !store.capturedLine.isEmpty {
                Text(store.capturedLine)
            }
            Text(store.sourceLine)
        }
        .font(.system(size: 11))
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity)
        .padding(.top, 6)
        .padding(.bottom, 4)
        .background(.background)
    }
}

struct CurrencyCard: View {
    @EnvironmentObject private var store: RatesStore
    let code: String
    var preview: Bool
    @State private var dragOffset: CGFloat = 0
    @FocusState private var amountFocused: Bool

    var body: some View {
        let unitRates = preview || store.showsUnitRates
        let editing = !preview && store.convertEditing && store.convertSource == code
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
                amountColumn(unitRates: unitRates, editing: editing)
                if code != store.base && !preview { handle }
            }
            if code != store.base {
                if store.showChart { ChartBlock(code: code).environmentObject(store) }
                if store.showIntervals { intervals }
                if store.showForecast { forecast }
                if store.showReference { reference }
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
                    Text(shownInterval(hour))
                }
                .font(.system(size: 13))
                .monospacedDigit()
            }
        }
    }

    private var forecast: some View {
        let line = preview ? illustratedForecast() : store.forecast(code)
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
                Text(shownReference()).monospacedDigit()
            }
            .font(.system(size: 13))
            Text("Quelle EZB").font(.system(size: 11)).foregroundStyle(.secondary)
        }
    }

    private func amountColumn(unitRates: Bool, editing: Bool) -> some View {
        let muted = unitRates && code == store.base
        return VStack(alignment: .trailing, spacing: 1) {
            if editing {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    TextField("0", text: draftBinding)
                        .focused($amountFocused)
                        .keyboardType(.decimalPad)
                        .textFieldStyle(.plain)
                        .multilineTextAlignment(.trailing)
                        .font(.system(size: 17, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(Color.blue)
                        .frame(minWidth: 36)
                        .fixedSize(horizontal: true, vertical: false)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .onAppear { DispatchQueue.main.async { amountFocused = true } }
                    Text(code)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Color.blue)
                        .accessibilityHidden(true)
                }
            } else {
                Text(store.primaryText(code, unitRates: unitRates))
                    .font(.system(size: 17, weight: muted ? .medium : .semibold))
                    .monospacedDigit()
                    .foregroundStyle(muted ? Color.secondary : Color.primary)
                    .contentShape(Rectangle())
                    .onTapGesture { if !preview { store.beginConvert(code) } }
                    .accessibilityAddTraits(.isButton)
                    .accessibilityLabel("\(store.primaryText(code, unitRates: unitRates)) bearbeiten")
            }
            if code != store.base {
                Text(store.secondaryText(code))
                    .font(.system(size: 12))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var draftBinding: Binding<String> {
        Binding(
            get: { store.convertDraft },
            set: { new in
                var next = new
                if store.convertReplace {
                    store.convertReplace = false
                    let old = store.convertDraft
                    if next.hasPrefix(old), next.count == old.count + 1 {
                        next = String(next.suffix(1))
                    }
                }
                store.applyDraft(next)
            }
        )
    }

    private var handle: some View {
        Image(systemName: "line.3.horizontal")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(.secondary)
            .frame(width: 22, height: 28)
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

    private func shownInterval(_ hour: Int) -> String {
        if let real = store.intervalValue(code, hour: hour) { return rateText(real) }
        guard preview, let anchor = previewAnchor(excluding: hour) else { return "–" }
        return rateText(anchor + previewNudge(hour))
    }

    private func illustratedForecast() -> ForecastLine? {
        let line = store.forecast(code)
        guard let anchor = previewAnchor(excluding: nil) else { return line }
        var today = line?.today
        var week = line?.week
        var todayDelta = line?.todayDelta
        var weekDelta = line?.weekDelta
        if today == nil { today = anchor + 0.0006; todayDelta = 0.0006 }
        if week == nil { week = anchor - 0.0002; weekDelta = -0.0002 }
        return ForecastLine(today: today, week: week, todayDelta: todayDelta, weekDelta: weekDelta)
    }

    private func shownReference() -> String {
        if let real = store.reference(code) { return rateText(real) }
        guard preview, let anchor = previewAnchor(excluding: nil) else { return "–" }
        return rateText(anchor - 0.0005)
    }

    private func previewAnchor(excluding hour: Int?) -> Double? {
        let known = store.hours.compactMap { item -> (Int, Double)? in
            if item == hour { return nil }
            guard let value = store.intervalValue(code, hour: item) else { return nil }
            return (item, value)
        }
        if let hour {
            return known.min { abs($0.0 - hour) < abs($1.0 - hour) }?.1 ?? store.quote(code).value
        }
        return known.min { abs($0.0 - 12) < abs($1.0 - 12) }?.1 ?? store.quote(code).value
    }

    private func previewNudge(_ hour: Int) -> Double {
        if hour == 7 { return 0.0003 }
        if hour == 17 { return 0.0014 }
        return Double((hour % 5) - 2) * 0.00035
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
