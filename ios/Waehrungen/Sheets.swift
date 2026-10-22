import SwiftUI
import PhotosUI
import MessageUI
import StoreKit
import UIKit
import GameController

struct SheetClose: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Button { dismiss() } label: {
            Image(systemName: "xmark")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Color.primary.opacity(0.85))
                .frame(width: 28, height: 28)
                .background(Color.primary.opacity(0.08), in: Circle())
        }
        .accessibilityLabel("Schliessen")
    }
}

/// Offers the sheet column at least the visible height, so a flexible preview can fill the space under the switches.
private struct SheetColumn: Layout {
    var minHeight: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? subviews.first?.sizeThatFits(.unspecified).width ?? 0
        return CGSize(width: width, height: minHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews.first?.place(
            at: CGPoint(x: bounds.minX, y: bounds.minY),
            anchor: .topLeading,
            proposal: ProposedViewSize(width: bounds.width, height: bounds.height)
        )
    }
}

struct AnsichtSheet: View {
    @EnvironmentObject private var store: RatesStore
    @EnvironmentObject private var pro: ProStore
    @State private var showPaywall = false

    var body: some View {
        NavigationStack {
            GeometryReader { geo in
                ScrollView {
                    SheetColumn(minHeight: geo.size.height) {
                        VStack(alignment: .leading, spacing: 0) {
                            toggle("Entwicklung der Währungen anzeigen", on: store.showCompare, hint: "Gegenüber der Berichtswährung. Zeitraum: Grafik antippen.", stacked: true) {
                                store.showCompare = $0
                                store.saveView()
                                Task { await store.loadHistoryIfNeeded() }
                            }
                            toggle("Grafik für Fremdwährungen anzeigen", on: store.showChart, hint: "Zeitraum kann durch Tippen auf die Grafik verändert werden.", stacked: true) { store.showChart = $0; store.saveView() }
                            toggle("Gleicher Zeitraum für alle Fremdwährungen", on: store.sameSpan, hint: "Aus: Jede Währung merkt sich ihren eigenen Zeitraum.", stacked: true) { store.setSameSpan($0) }
                            colorSection
                                .padding(.top, 10)
                                .padding(.bottom, 10)
                            toggle("Intervalle anzeigen", on: store.showIntervals, hint: nil) { store.showIntervals = $0; store.saveView() }
                            subNote("Intervall je Währung: auf die Intervall-Zeilen tippen.")
                            toggle("Prognose", on: store.showForecast, hint: "Heute und in 7 Tagen") { store.showForecast = $0; store.saveView() }
                            subNote(shortDisclaimerText)
                            toggle("Referenzkurse anzeigen", on: store.showReference, hint: nil) { store.showReference = $0; store.saveView() }
                            proEntry
                                .padding(.top, 8)
                            Text("Vorschau")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .padding(.top, 8)
                            preview
                                .padding(.top, 6)
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 16)
                        .padding(.top, 4)   // content ~12 pt higher, more room for the preview
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    }
                }
            }
            .scrollIndicatorsFlash(onAppear: true)
            .sheet(isPresented: $showPaywall) { PaywallSheet().environmentObject(pro) }
            .navigationTitle("Ansicht")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { SheetClose() } }
            .toolbarBackground(Color(uiColor: .systemGroupedBackground), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .background(Color(uiColor: .systemGroupedBackground))
        }
        .presentationDragIndicator(.visible)
    }

    /// Own section after «Gleicher Zeitraum …»: colour on/off, then the indented threshold stepper.
    private var colorSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            toggle("Kursschwankungen farbig anzeigen", on: store.colorChanges, hint: nil) { store.setColorChanges($0) }
            if store.colorChanges {
                HStack(spacing: 12) {
                    Text("ab ±\(String(format: "%.2f", store.colorThreshold)) %")
                        .monospacedDigit()
                        .foregroundStyle(.primary)
                    Spacer(minLength: 4)
                    Stepper("Schwelle", value: Binding(get: { store.colorThreshold }, set: { store.setColorThreshold($0) }), in: 0...2, step: 0.01)
                        .labelsHidden()
                }
                .padding(.leading, 34)
                .padding(.vertical, 2)
            }
            Text("Kleinere Veränderungen grau, bei 0.00 % alle farbig.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.leading, 34)
                .padding(.top, 2)
        }
    }

    /// «Währungen Pro» entry (Build 35): opens the paywall, or shows that Pro is active.
    private var proEntry: some View {
        Button { showPaywall = true } label: {
            HStack(spacing: 12) {
                Image(systemName: pro.isPro ? "checkmark.seal.fill" : "sparkles")
                    .font(.system(size: 20))
                    .foregroundStyle(pro.isPro ? Color.green : Color.blue)
                    .frame(width: 22)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Währungen Pro").foregroundStyle(.primary)
                    Text(pro.isPro ? "Aktiv – danke!" : "FX-Alarme, Apple Watch, alle Widgets · \(pro.priceText)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
            }
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// Small grey note directly under a switch, aligned with its title.
    private func subNote(_ text: String) -> some View {
        Text(text)
            .font(.footnote)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.leading, 34)
            .padding(.top, -4)
            .padding(.bottom, 4)
    }

    private func toggle(_ title: String, on: Bool, hint: String?, stacked: Bool = false, set: @escaping (Bool) -> Void) -> some View {
        Button {
            set(!on)
        } label: {
            HStack(alignment: stacked ? .top : .center, spacing: 12) {
                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22))
                    .foregroundStyle(Color.blue)
                if stacked {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(title).foregroundStyle(.primary)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        if let hint {
                            Text(hint).font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                } else {
                    HStack(spacing: 6) {
                        Text(title).foregroundStyle(.primary)
                        if let hint { Text(hint).font(.subheadline).foregroundStyle(.secondary) }
                    }
                }
                Spacer()
            }
            .padding(.vertical, 6)
        }
        .buttonStyle(.plain)
    }

    /// Reporting currency, then the first two foreign rows still on the user's list. Blocks follow the ticked options.
    private var previewCodes: [String] {
        [store.base] + store.visible.filter { $0 != store.base }.prefix(2)
    }

    private var preview: some View {
        FadingPreview(codes: previewCodes)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct PreviewMetrics: Equatable {
    var height: CGFloat = 0
    var minY: CGFloat = 0
}

private struct PreviewMetricsKey: PreferenceKey {
    static var defaultValue = PreviewMetrics()
    static func reduce(value: inout PreviewMetrics, nextValue: () -> PreviewMetrics) { value = nextValue() }
}

/// The same list as the main screen. When the next currency runs past the card, it clips under a soft fade.
private struct FadingPreview: View {
    @EnvironmentObject private var store: RatesStore
    let codes: [String]
    @State private var contentHeight: CGFloat = 0
    @State private var contentTop: CGFloat = 0

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
        GeometryReader { geo in
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(Array(codes.enumerated()), id: \.element) { index, code in
                        CurrencyCard(code: code, preview: true)
                            .padding(.top, 8)
                            .padding(.bottom, 8)
                            .padding(.leading, 20)
                            .padding(.trailing, 8)
                        if code == store.base && store.showCompare {
                            CompareChartCard(preview: true)
                                .padding(.horizontal, 12)
                                .padding(.bottom, 8)
                        }
                        if index < codes.count - 1 {
                            Divider().padding(.leading, 20)
                        }
                    }
                }
                .background(
                    GeometryReader { proxy in
                        Color.clear.preference(
                            key: PreviewMetricsKey.self,
                            value: PreviewMetrics(height: proxy.size.height, minY: proxy.frame(in: .named("ansichtPreview")).minY)
                        )
                    }
                )
            }
            .scrollIndicators(.hidden)
            .scrollBounceBehavior(.basedOnSize)
            .coordinateSpace(name: "ansichtPreview")
            .onPreferenceChange(PreviewMetricsKey.self) { value in
                contentHeight = value.height
                contentTop = value.minY
            }
            .overlay(alignment: .bottom) {
                if contentHeight + contentTop > geo.size.height + 8 {
                    LinearGradient(
                        colors: [
                            Color(uiColor: .secondarySystemGroupedBackground).opacity(0),
                            Color(uiColor: .secondarySystemGroupedBackground)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: 44)
                    .allowsHitTesting(false)
                }
            }
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: shape)
            .clipShape(shape)
        }
    }
}

/// Build 33: per-currency interval sheet (tap on a currency's interval rows).
/// Start/end are global, the hour step is per currency (iCloud-synced), below the rates of several trading days.
struct IntervalSheet: View {
    @EnvironmentObject private var store: RatesStore
    let code: String
    @State private var start = 7
    @State private var end = 17
    @State private var width: CGFloat = 0

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Stepper("Start \(String(format: "%02d:00", start))", value: $start, in: 0...22)
                    Stepper("Ende \(String(format: "%02d:00", end))", value: $end, in: 1...23)
                } footer: {
                    Text("gilt für alle Währungen")
                }
                Section {
                    Picker("Intervall", selection: Binding(
                        get: { store.step(for: code) },
                        set: { store.setStep($0, for: code) }
                    )) {
                        ForEach(RatesStore.pickerSteps, id: \.self) { step in
                            // narrow no-break space keeps all 7 segments within small iPhones
                            Text("\(step)\u{202F}h").tag(step)
                        }
                    }
                    .pickerStyle(.segmented)
                    .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
                } header: {
                    Text("Intervall \(code)")
                }
                Section {
                    table
                        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                } header: {
                    Text("Kurse in \(store.base)")
                }
            }
            .listStyle(.insetGrouped)
            .background(GeometryReader { geo in Color.clear.onAppear { width = geo.size.width }.onChange(of: geo.size.width) { _, w in width = w } })
            .navigationTitle("Intervalle \(CurrencyNames.name(code))")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { SheetClose() } }
        }
        .presentationDragIndicator(.visible)
        .onAppear {
            start = store.timeStart
            end = store.timeEnd
        }
        .onChange(of: start) {
            if end <= start { end = min(start + 1, 23) }
            store.setTimeRange(start: start, end: end)
        }
        .onChange(of: end) {
            if start >= end { start = max(end - 1, 0) }
            store.setTimeRange(start: start, end: end)
        }
    }

    private static let columnWidth: CGFloat = 68

    /// At least 2 days on small iPhones, 3+ on wider screens; «Heute» always on the far right.
    private var days: [String] {
        let usable = max(width - 32 - 32 - 50, 0)   // list margins, row insets, time column
        let fit = Int(usable / (Self.columnWidth + 8))
        let count = min(max(fit, 2), store.intervalDays.count)
        return Array(store.intervalDays.prefix(count)).reversed()
    }

    private var table: some View {
        let today = store.intervalDays.first
        let shownDays = days
        return VStack(spacing: 6) {
            HStack(spacing: 8) {
                Text("").frame(width: 50, alignment: .leading)
                Spacer(minLength: 0)
                ForEach(shownDays, id: \.self) { day in
                    Text(day == today ? "Heute" : store.pastDayHeader(day))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(width: Self.columnWidth, alignment: .trailing)
                }
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
            ForEach(store.hours(for: code), id: \.self) { hour in
                HStack(spacing: 8) {
                    Text(String(format: "%02d:00", hour))
                        .frame(width: 50, alignment: .leading)
                    Spacer(minLength: 0)
                    ForEach(shownDays, id: \.self) { day in
                        Text(value(hour, day: day, isToday: day == today))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .frame(width: Self.columnWidth, alignment: .trailing)
                    }
                }
                .font(.subheadline)
                .monospacedDigit()
            }
        }
    }

    private func value(_ hour: Int, day: String, isToday: Bool) -> String {
        if isToday {
            guard store.hourReached(hour), let v = store.intervalValue(code, hour: hour, on: day) ?? store.intervalValue(code, hour: hour) else { return "–" }
            return formatRate(v)
        }
        guard let v = store.intervalValue(code, hour: hour, on: day) else { return "–" }
        return formatRate(v)
    }
}

struct AlertsSheet: View {
    @EnvironmentObject private var store: RatesStore
    @EnvironmentObject private var pro: ProStore
    @State private var showPaywall = false
    /// Set by tapping the version number in «Über» three times (Build 37).
    @AppStorage("wu.dev.testPush") private var testPushUnlocked = false
    @State private var message = ""
    @State private var busy = false

    var body: some View {
        NavigationStack {
            list
            .navigationTitle("FX-Alarme")
            .toolbar { ToolbarItem(placement: .topBarLeading) { ProBadge() } }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    SheetClose()
                }
            }
            .toolbarBackground(Color(uiColor: .systemGroupedBackground), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .background(Color(uiColor: .systemGroupedBackground))
        }
        .presentationDragIndicator(.visible)
        .sheet(isPresented: $showPaywall) { PaywallSheet().environmentObject(pro) }
        .task {
            // first alarm setup: ask for permission while Mitteilungen are on
            #if DEBUG
            if store.pushEnabled && ScreenshotMode.shot == nil { await store.requestPushPermission() }
            #else
            if store.pushEnabled { await store.requestPushPermission() }
            #endif
            if let error = await store.loadRemoteAlerts() {
                message = error
            }
        }
        .onDisappear {
            store.saveView()
            Task { await store.flushAlertSync() }
        }
    }

    private var list: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(alertIntroText).font(.footnote).foregroundStyle(.secondary)
                notifications
                ForEach(store.visible.filter { $0 != store.base }, id: \.self) { code in
                    AlarmCard(code: code)
                }
                if !message.isEmpty { Text(message).font(.footnote) }
                else if let err = store.alertSyncError, !err.isEmpty { Text(err).font(.footnote) }
            }
            .padding(16)
        }
    }

    private var denied: Bool { store.pushAuthorization == .denied }

    /// Apple push on this device. Off removes the server subscription (setPushEnabled → alert sync DELETE).
    private var notifications: some View {
        VStack(alignment: .leading, spacing: 0) {
            Toggle(isOn: Binding(
                get: { store.pushEnabled && !pro.locked },
                set: { on in
                    // Build 37: switching on without Pro opens the paywall instead
                    if on && pro.locked { showPaywall = true } else { store.setPushEnabled(on) }
                }
            )) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Alarme aktivieren")
                    Text(store.pushEnabled ? "\(deviceSubject) erhält FX-Alarme" : "\(deviceSubject) erhält keine FX-Alarme")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .tint(Color(red: 0.204, green: 0.780, blue: 0.349))
            .padding(.vertical, 10)
            if denied {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Mitteilungen für Währungen sind in den Systemeinstellungen ausgeschaltet. Ohne sie kommen keine Alarme an.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Einstellungen öffnen") {
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            UIApplication.shared.open(url)
                        }
                    }
                    .buttonStyle(.bordered)
                }
                .padding(.bottom, 10)
            }
            // Build 37: hidden; shown after tapping the version in «Über» 3 times (iPhone/iPad),
            // on a Mac only while the Option key is held.
            if showsTestPush {
                Divider()
                Button { Task { await sendTest() } } label: {
                    Text("Test-Push senden")
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 11)
                        .contentShape(Rectangle())
                }
                .foregroundStyle(busy || !store.pushEnabled ? Color.secondary : Color.blue)
                .disabled(busy || !store.pushEnabled)
            }
        }
        .onReceive(Timer.publish(every: 0.3, on: .main, in: .common).autoconnect()) { _ in
            guard isMac else { return }
            let held = GCKeyboard.coalesced?.keyboardInput?.button(forKeyCode: .leftAlt)?.isPressed == true
                || GCKeyboard.coalesced?.keyboardInput?.button(forKeyCode: .rightAlt)?.isPressed == true
            if held != optionHeld { optionHeld = held }
        }
        .padding(.horizontal, 16)
        .background(.background, in: RoundedRectangle(cornerRadius: 12))
    }

    /// «Dieses iPhone», «Dieses iPad», «Dieser Mac».
    private var deviceSubject: String { deviceSubjectText() }

    @State private var optionHeld = false
    private var isMac: Bool { ProcessInfo.processInfo.isiOSAppOnMac || ProcessInfo.processInfo.isMacCatalystApp }
    private var showsTestPush: Bool {
        #if DEBUG
        if ScreenshotMode.shot != nil { return false }
        #endif
        return isMac ? optionHeld : testPushUnlocked
    }

    private func sendTest() async {
        guard !busy else { return }
        resignField()
        try? await Task.sleep(nanoseconds: 80_000_000)
        busy = true
        message = "Sende Test-Push …"
        defer { busy = false }
        await store.requestPushPermission()
        do {
            try await store.sendRemoteTestPush()
            message = "Test-Push gesendet. Die Mitteilung «TEST» sollte gleich erscheinen."
        } catch {
            message = "Test-Push fehlgeschlagen: \(error.localizedDescription)"
        }
    }

    private func resignField() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

struct AlarmCard: View {
    @EnvironmentObject private var store: RatesStore
    @EnvironmentObject private var pro: ProStore
    @State private var showPaywall = false
    let code: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("\(code)/\(store.base)").font(.headline)
                Spacer()
                Toggle("Aktiv", isOn: Binding(
                    get: { store.threshold(for: code).enabled && !pro.locked },
                    set: { on in
                        // Build 37: without Pro, switching an alarm on opens the paywall
                        if on && pro.locked { showPaywall = true; return }
                        var entry = store.threshold(for: code)
                        entry.enabled = on
                        store.setThreshold(entry, for: code)
                    }
                ))
                    .labelsHidden()
            }
            if store.threshold(for: code).enabled && !store.pushEnabled {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("\(deviceSubjectText()) erhält keine FX-Alarme.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 4)
                    Button("Alarme aktivieren") { store.setPushEnabled(true) }
                        .font(.footnote.weight(.semibold))
                        .buttonStyle(.bordered)
                }
            }
            HStack {
                Text("Steigt um mehr als")
                Spacer()
                TextField("0.25", value: binding(\.up), format: .number)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 72)
                Text("%")
            }
            HStack {
                Text("Fällt um mehr als")
                Spacer()
                TextField("0.50", value: binding(\.down), format: .number)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 72)
                Text("%")
            }
        }
        .padding(12)
        .background(.background, in: RoundedRectangle(cornerRadius: 12))
        .sheet(isPresented: $showPaywall) { PaywallSheet().environmentObject(pro) }
    }

    private func binding(_ keyPath: WritableKeyPath<RatesStore.AlarmThreshold, Bool>) -> Binding<Bool> {
        Binding {
            store.threshold(for: code)[keyPath: keyPath]
        } set: { newValue in
            var entry = store.threshold(for: code)
            entry[keyPath: keyPath] = newValue
            store.setThreshold(entry, for: code)
        }
    }

    private func binding(_ keyPath: WritableKeyPath<RatesStore.AlarmThreshold, Double>) -> Binding<Double> {
        Binding {
            store.threshold(for: code)[keyPath: keyPath]
        } set: { newValue in
            var entry = store.threshold(for: code)
            entry[keyPath: keyPath] = newValue
            store.setThreshold(entry, for: code)
        }
    }
}

struct AddSheet: View {
    @EnvironmentObject private var store: RatesStore
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var matches: [String] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return store.catalog.filter { code in
            q.isEmpty || CurrencyNames.name(code).lowercased().contains(q) || code.lowercased().contains(q)
        }
    }

    var body: some View {
        NavigationStack {
            List(matches, id: \.self) { code in
                Button {
                    store.add(code)
                    dismiss()
                } label: {
                    HStack(spacing: 10) {
                        RoundFlag(code: code)
                        VStack(alignment: .leading) {
                            Text(CurrencyNames.name(code)).foregroundStyle(.primary)
                            Text(CurrencyNames.lotLine(code)).font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .searchable(text: $query, prompt: "Suchen")
            .navigationTitle("Währung")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { SheetClose() } }
        }
        .presentationDragIndicator(.visible)
    }
}

struct AboutSheet: View {
    @Environment(\.requestReview) private var requestReview
    @State private var mail: AboutMail?

    private var versionText: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "–"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "–"
        let year = Calendar.current.component(.year, from: .now)
        return "Version \(version) (\(build)) · © \(year) ComputerWorks AG"
    }

    var body: some View {
        NavigationStack {
            ViewThatFits(in: .vertical) {
                aboutColumn(expands: true)
                ScrollView { aboutColumn(expands: false) }
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Über Währungen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { SheetClose() } }
        }
        .sheet(item: $mail) { AboutMessageSheet(kind: $0) }
        .presentationDragIndicator(.visible)
    }

    private func aboutColumn(expands: Bool) -> some View {
        VStack(spacing: 18) {
            aboutIcon
                .padding(.top, 8)
            VStack(spacing: 4) {
                Text("Währungen")
                    .font(.system(size: 28, weight: .semibold))
                Text(versionText)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    // Build 37: three taps reveal «Test-Push senden» in the FX-Alarme
                    .onTapGesture(count: 3) {
                        UserDefaults.standard.set(true, forKey: "wu.dev.testPush")
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    }
            }
            Text("Entwickelt von Jörg A. Weber, [ComputerWorks\u{00A0}AG](\(computerWorksAppURL.absoluteString))")
                .font(.system(size: 14))
                .multilineTextAlignment(.center)
                .tint(Color.blue)
            Text("Wir freuen uns über Ihr Feedback und Ihre Anregungen. Danke für Ihr Vertrauen!")
                .font(.body)
                .multilineTextAlignment(.center)
            HStack(alignment: .center, spacing: 10) {
                aboutMailButton(.feedback)
                aboutMailButton(.support)
            }
            Text("Widgets: Home-Bildschirm gedrückt halten › Bearbeiten › Widget hinzufügen › Währungen. Wische dort nach links für weitere Varianten, z. B. «Eine Währung» mit Grafik.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            if let appStoreID, !appStoreID.isEmpty {
                Button("App bewerten") { requestReview() }
                    .buttonStyle(.bordered)
                    .frame(maxWidth: .infinity)
            }
            if expands { Spacer(minLength: 16) }
            VStack(spacing: 8) {
                Text("biquote.io (Mittelkurs), EZB (Referenzkurse)")
                    .foregroundStyle(.secondary)
                Text(disclaimerText)
                    .foregroundStyle(.secondary)
                Link("Datenschutzerklärung", destination: privacyPolicyURL)
                    .foregroundStyle(Color.blue)
            }
            .font(.system(size: 11))
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, maxHeight: expands ? .infinity : nil, alignment: .top)
    }

    private var aboutIcon: some View {
        Group {
            if let image = UIImage(named: "AboutIcon"), image.size.width > 0 {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                ZStack {
                    Color(red: 0.043, green: 0.361, blue: 0.678)
                    Image(systemName: "plus")
                        .font(.system(size: 34, weight: .bold))
                        .foregroundStyle(.white)
                }
            }
        }
        .frame(width: 84, height: 84)
        .clipShape(RoundedRectangle(cornerRadius: 19, style: .continuous))
        .accessibilityHidden(true)
    }

    private func aboutMailButton(_ kind: AboutMail) -> some View {
        Button { mail = kind } label: {
            Text(kind.title)
                .font(.system(size: 13, weight: .semibold))
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.85)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
    }
}

private enum AboutMail: Identifiable {
    case feedback, support

    var id: String { title }
    var address: String { self == .feedback ? feedbackAddress : supportAddress }
    var subject: String { self == .feedback ? "Feedback Währungen" : "Support Währungen" }
    var title: String { self == .feedback ? "Feedback senden" : "Support kontaktieren" }
}

private struct AboutPhoto: Identifiable {
    let id: String
    let jpeg: Data
    let preview: UIImage
}

private struct AboutMessageSheet: View {
    @Environment(\.openURL) private var openURL
    let kind: AboutMail

    @State private var draft = ""
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var photos: [AboutPhoto] = []
    @State private var loadToken = 0
    @State private var showMail = false
    @State private var hint: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    messageField
                    PhotosPicker(selection: $pickerItems, maxSelectionCount: 3, matching: .images) {
                        Label("Bild oder Screenshot hinzufügen", systemImage: "photo")
                            .font(.system(size: 15))
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                            .minimumScaleFactor(0.85)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    if !photos.isEmpty {
                        photoRow
                    }
                    if let hint {
                        Text(hint)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Button { send() } label: {
                        Text("Senden")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && photos.isEmpty)
                }
                .padding(20)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle(kind.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { SheetClose() }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Fertig") {
                        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                    }
                }
            }
        }
        .presentationDragIndicator(.visible)
        .onChange(of: pickerItems) { _, items in
            Task { await loadPhotos(items) }
        }
        .sheet(isPresented: $showMail) {
            MailComposeView(
                recipient: kind.address,
                subject: kind.subject,
                body: messageBody,
                attachments: photos.map(\.jpeg)
            ) {
                showMail = false
            }
        }
    }

    private var messageField: some View {
        TextEditor(text: $draft)
            .frame(minHeight: 140)
            .padding(8)
            .scrollContentBackground(.hidden)
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(alignment: .topLeading) {
                if draft.isEmpty {
                    Text("Ihre Nachricht")
                        .foregroundStyle(.tertiary)
                        .padding(.horizontal, 13)
                        .padding(.vertical, 16)
                        .allowsHitTesting(false)
                }
            }
    }

    private var photoRow: some View {
        HStack(spacing: 12) {
            ForEach(Array(photos.enumerated()), id: \.element.id) { index, photo in
                Image(uiImage: photo.preview)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 72, height: 72)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay(alignment: .topTrailing) {
                        Button { removePhoto(at: index) } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 18, height: 18)
                                .background(.black.opacity(0.6), in: Circle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Bild entfernen")
                        .offset(x: 6, y: -6)
                    }
                    .padding(.top, 6)
                    .padding(.trailing, 6)
            }
            Spacer(minLength: 0)
        }
    }

    private var messageBody: String {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty { return diagnostics }
        return "\(text)\n\n—\n\(diagnostics)"
    }

    /// App version, iOS version, and the hardware identifier. Main-actor because it reads `UIDevice`.
    private var diagnostics: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "–"
        return "Währungen \(version)\niOS \(UIDevice.current.systemVersion)\n\(machineIdentifier())"
    }

    private func machineIdentifier() -> String {
        var system = utsname()
        uname(&system)
        return withUnsafeBytes(of: system.machine) { raw in
            let bytes = raw.prefix { $0 != 0 }
            return String(decoding: bytes, as: UTF8.self)
        }
    }

    private func loadPhotos(_ items: [PhotosPickerItem]) async {
        loadToken += 1
        let token = loadToken
        var loaded: [AboutPhoto] = []
        for item in items.prefix(3) {
            let id = item.itemIdentifier ?? UUID().uuidString
            guard let data = try? await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data),
                  let jpeg = image.jpegData(compressionQuality: 0.85) else { continue }
            loaded.append(AboutPhoto(id: id, jpeg: jpeg, preview: image))
        }
        guard token == loadToken else { return }
        photos = loaded
    }

    private func removePhoto(at index: Int) {
        guard photos.indices.contains(index) else { return }
        let photo = photos[index]
        photos.remove(at: index)
        if let match = pickerItems.firstIndex(where: { $0.itemIdentifier == photo.id }) {
            pickerItems.remove(at: match)
        } else if pickerItems.indices.contains(index) {
            pickerItems.remove(at: index)
        }
    }

    private func send() {
        hint = nil
        if MFMailComposeViewController.canSendMail() {
            showMail = true
            return
        }
        if let url = mailtoURL(address: kind.address, subject: kind.subject, body: messageBody) {
            openURL(url)
        }
        hint = photos.isEmpty
            ? "Kein E-Mail-Konto eingerichtet. Die Nachricht wird in der Mail-App geöffnet."
            : "Kein E-Mail-Konto eingerichtet. Bilder müssen in der Mail-App manuell angehängt werden."
    }

    private func mailtoURL(address: String, subject: String, body: String) -> URL? {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        func encode(_ value: String) -> String {
            value.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
        }
        return URL(string: "mailto:\(address)?subject=\(encode(subject))&body=\(encode(body))")
    }
}

private struct MailComposeView: UIViewControllerRepresentable {
    var recipient: String
    var subject: String
    var body: String
    var attachments: [Data]
    var onFinish: () -> Void

    func makeUIViewController(context: Context) -> MFMailComposeViewController {
        let controller = MFMailComposeViewController()
        controller.mailComposeDelegate = context.coordinator
        controller.setToRecipients([recipient])
        controller.setSubject(subject)
        controller.setMessageBody(body, isHTML: false)
        for (offset, data) in attachments.enumerated() {
            controller.addAttachmentData(data, mimeType: "image/jpeg", fileName: "Bild-\(offset + 1).jpg")
        }
        return controller
    }

    func updateUIViewController(_ uiViewController: MFMailComposeViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onFinish: onFinish)
    }

    /// Main-actor delegate. `@preconcurrency` keeps the UIKit conformance legal under Swift 6.
    @MainActor
    final class Coordinator: NSObject, @preconcurrency MFMailComposeViewControllerDelegate {
        private let onFinish: () -> Void

        init(onFinish: @escaping () -> Void) {
            self.onFinish = onFinish
        }

        func mailComposeController(
            _ controller: MFMailComposeViewController,
            didFinishWith result: MFMailComposeResult,
            error: Error?
        ) {
            _ = result
            _ = error
            onFinish()
        }
    }
}

/// Emoji flag, scaled so the artwork fills the badge, then clipped to a circle.
private struct RoundFlag: View {
    let code: String

    var body: some View {
        Text(CurrencyNames.flag(code))
            .font(.system(size: 36))
            .frame(width: 28, height: 28)
            .clipped()
            .clipShape(Circle())
            .overlay(Circle().strokeBorder(Color.primary.opacity(0.15), lineWidth: 0.5))
            .accessibilityHidden(true)
    }
}

/// «Dieses iPhone», «Dieses iPad», «Dieser Mac» for the FX-alarm texts.
@MainActor
func deviceSubjectText() -> String {
    if ProcessInfo.processInfo.isiOSAppOnMac || ProcessInfo.processInfo.isMacCatalystApp { return "Dieser Mac" }
    switch UIDevice.current.userInterfaceIdiom {
    case .pad: return "Dieses iPad"
    case .mac: return "Dieser Mac"
    default: return "Dieses iPhone"
    }
}
