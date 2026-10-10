import SwiftUI

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

    var body: some View {
        NavigationStack {
            GeometryReader { geo in
                ScrollView {
                    SheetColumn(minHeight: geo.size.height) {
                        VStack(alignment: .leading, spacing: 0) {
                            toggle("Grafik anzeigen", on: store.showChart, hint: nil) { store.showChart = $0; store.saveView() }
                            toggle("Intervalle anzeigen", on: store.showIntervals, hint: nil) { store.showIntervals = $0; store.saveView() }
                            toggle("Prognose", on: store.showForecast, hint: "heute und 7 Tage") { store.showForecast = $0; store.saveView() }
                            toggle("Referenzkurse anzeigen", on: store.showReference, hint: nil) { store.showReference = $0; store.saveView() }
                            Text(disclaimerText)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .padding(.top, 12)
                            Text("Vorschau")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .padding(.top, 12)
                            preview
                                .padding(.top, 6)
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    }
                }
            }
            .navigationTitle("Ansicht")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { SheetClose() } }
            .toolbarBackground(Color(uiColor: .systemGroupedBackground), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .background(Color(uiColor: .systemGroupedBackground))
        }
        .presentationDragIndicator(.visible)
    }

    private func toggle(_ title: String, on: Bool, hint: String?, set: @escaping (Bool) -> Void) -> some View {
        Button {
            set(!on)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22))
                    .foregroundStyle(Color.blue)
                HStack(spacing: 6) {
                    Text(title).foregroundStyle(.primary)
                    if let hint { Text(hint).font(.subheadline).foregroundStyle(.secondary) }
                }
                Spacer()
            }
            .padding(.vertical, 10)
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

struct TimesSheet: View {
    @EnvironmentObject private var store: RatesStore
    @State private var start = 7
    @State private var end = 17
    @State private var step: Int?
    private let steps = [1, 2, 3, 4, 5, 8, 12, 24]

    private var previewHours: [Int] {
        if let step, let hours = RatesStore.expand(start: start, end: end, step: step) { return hours }
        return store.hours
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Gilt nur für die Anzeige auf diesem Gerät.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Stepper("Von \(String(format: "%02d:00", start))", value: $start, in: 0...22)
                    Stepper("Bis \(String(format: "%02d:00", end))", value: $end, in: 1...23)
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Intervall")
                        HStack(spacing: 2) {
                            ForEach(steps, id: \.self) { value in
                                Button("\(value) h") { step = value }
                                    .font(.system(size: 12, weight: .semibold))
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.7)
                                    .frame(maxWidth: .infinity)
                                    .buttonStyle(.borderedProminent)
                                    .tint(step == value ? .blue : Color.primary.opacity(0.08))
                                    .foregroundStyle(step == value ? Color.white : Color.primary)
                            }
                        }
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(previewHours, id: \.self) { hour in
                            HStack {
                                Text(String(format: "%02d:00", hour))
                                    .foregroundStyle(.secondary)
                                Spacer()
                                Text(previewRate(hour))
                            }
                            .font(.footnote.monospacedDigit())
                        }
                    }
                    Text(previewHours.count == 1 ? "1 Messung pro Tag" : "\(previewHours.count) Messungen pro Tag")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(16)
            }
            .navigationTitle("Erfassungszeiten und Intervalle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { SheetClose() } }
            .toolbarBackground(Color(uiColor: .systemGroupedBackground), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .background(Color(uiColor: .systemGroupedBackground))
        }
        .presentationDragIndicator(.visible)
        .onAppear {
            start = store.timesUserSet ? store.timeStart : 7
            end = store.timesUserSet ? store.timeEnd : 17
            step = store.timesUserSet ? (store.timeStep ?? 5) : 5
        }
        .onChange(of: start) { store.saveTimes(start: start, end: end, step: step) }
        .onChange(of: end) { store.saveTimes(start: start, end: end, step: step) }
        .onChange(of: step) { store.saveTimes(start: start, end: end, step: step) }
    }

    /// Same illustrative fill as the Ansicht preview when that hour has not been captured yet.
    private func previewRate(_ hour: Int) -> String {
        if let real = store.intervalValue("EUR", hour: hour) {
            return "\(formatRate(real)) \(store.base)"
        }
        guard let anchor = store.quote("EUR").value else { return "–" }
        let nudge: Double
        if hour == 7 { nudge = 0.0003 }
        else if hour == 17 { nudge = 0.0014 }
        else { nudge = Double((hour % 5) - 2) * 0.00035 }
        return "\(formatRate(anchor + nudge)) \(store.base)"
    }
}

struct AlertsSheet: View {
    @EnvironmentObject private var store: RatesStore
    @State private var page = "list"
    @State private var message = ""
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Group {
                if page == "setup" { setup } else { list }
            }
            .navigationTitle(page == "setup" ? "" : "FX-Alarme")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if page == "setup" {
                        Button { page = "list" } label: { Label("FX-Alarme", systemImage: "chevron.left") }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 10) {
                        if page == "list" {
                            Toggle("Alle Alarme", isOn: $store.alertsMaster)
                                .labelsHidden()
                                .tint(Color(red: 0.204, green: 0.780, blue: 0.349))
                                .onChange(of: store.alertsMaster) {
                                    store.saveView()
                                    store.scheduleAlertSync()
                                }
                        }
                        SheetClose()
                    }
                }
            }
            .toolbarBackground(Color(uiColor: .systemGroupedBackground), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .background(Color(uiColor: .systemGroupedBackground))
        }
        .presentationDragIndicator(.visible)
        .task {
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
                HStack(spacing: 8) {
                    Button("Währungsalarme einrichten") { page = "setup" }
                        .buttonStyle(.bordered)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Button("Test-Push senden") { Task { await sendTest() } }
                        .buttonStyle(.bordered)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .disabled(busy)
                }
                ForEach(store.visible.filter { $0 != store.base }, id: \.self) { code in
                    AlarmCard(code: code)
                }
                if !message.isEmpty { Text(message).font(.footnote) }
                else if let err = store.alertSyncError, !err.isEmpty { Text(err).font(.footnote) }
            }
            .padding(16)
        }
    }

    private var setup: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("So installieren Sie die Währungsalarme:")
                    .font(.title3.weight(.bold))
                Text("1. Laden Sie die ntfy-App auf Ihr iPhone.")
                Link("Im App Store laden", destination: appStoreURL)
                    .buttonStyle(.borderedProminent)
                    .tint(.black)
                Text("2. Starten Sie die ntfy-App und geben Sie folgenden Code ein:")
                HStack {
                    Text(store.topic)
                        .font(.system(.footnote, design: .monospaced))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.primary.opacity(0.08), in: Capsule())
                    Button { UIPasteboard.general.string = store.topic; message = "Code kopiert." } label: {
                        Image(systemName: "doc.on.doc")
                    }
                    .accessibilityLabel("Code kopieren")
                }
                ntfyHint
                Text("3. Tippen Sie unten auf „Test-Push“, um die Alarmeinstellung zu testen.")
                Button("Test-Push senden") { Task { await sendTest() } }
                    .buttonStyle(.bordered)
                    .disabled(busy)
                if !message.isEmpty { Text(message).font(.footnote) }
                else if let err = store.alertSyncError, !err.isEmpty { Text(err).font(.footnote) }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// Where the copied code is pasted in ntfy. Same hint as the web sheet.
    private var ntfyHint: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text("+")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 16, height: 16)
                    .background(Color(red: 0.204, green: 0.780, blue: 0.349), in: RoundedRectangle(cornerRadius: 4))
                Text("ntfy")
                    .font(.system(size: 11, weight: .semibold))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("Thema")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                Text("wae-…")
                    .font(.system(size: 11, design: .monospaced))
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
        }
        .padding(8)
        .frame(width: 168, alignment: .leading)
        .background(.background, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.primary.opacity(0.12), lineWidth: 0.5))
        .accessibilityHidden(true)
    }

    private func sendTest() async {
        guard !busy else { return }
        resignField()
        try? await Task.sleep(nanoseconds: 80_000_000)
        busy = true
        message = "Sende Test-Push …"
        defer { busy = false }
        do {
            try await store.sendRemoteTestPush()
            message = "Test-Push gesendet. In ntfy sollte «TEST» erscheinen."
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
    let code: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("\(code)/\(store.base)").font(.headline)
                Spacer()
                Toggle("Aktiv", isOn: binding(\.enabled))
                    .labelsHidden()
                    .disabled(!store.alertsMaster)
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
            HStack {
                Text("Steigt um mehr als")
                Spacer()
                TextField("0.25", value: binding(\.up), format: .number)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 72)
                Text("%")
            }
        }
        .padding(12)
        .background(.background, in: RoundedRectangle(cornerRadius: 12))
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
