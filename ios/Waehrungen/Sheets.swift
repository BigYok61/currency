import SwiftUI
import PhotosUI
import MessageUI
import StoreKit
import UIKit

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
                            toggle("Entwicklung der Währungen anzeigen", on: store.showCompare, hint: "Bezogen auf die Berichtswährung.\nZeitraum kann durch Tippen auf die Grafik verändert werden.", stacked: true) {
                                store.showCompare = $0
                                store.saveView()
                                Task { await store.loadHistoryIfNeeded() }
                            }
                            toggle("Grafik für Fremdwährungen anzeigen", on: store.showChart, hint: "Zeitraum kann durch Tippen auf die Grafik verändert werden.", stacked: true) { store.showChart = $0; store.saveView() }
                            toggle("Gleicher Zeitraum für alle Währungen", on: store.sameSpan, hint: "Aus: Jede Währung merkt sich ihren eigenen Zeitraum.", stacked: true) { store.setSameSpan($0) }
                            toggle("Intervalle anzeigen", on: store.showIntervals, hint: nil) { store.showIntervals = $0; store.saveView() }
                            toggle("Prognose", on: store.showForecast, hint: "Heute und in 7 Tagen") { store.showForecast = $0; store.saveView() }
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
                    Text("Intervalle anzeigen")
                    Stepper("von \(String(format: "%02d:00", start))", value: $start, in: 0...22)
                    Stepper("bis \(String(format: "%02d:00", end))", value: $end, in: 1...23)
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
                    Text("Gilt nur für die Zeilen in der Intervall-Ansicht. Kurse und Alarme werden rund um die Uhr verfolgt.")
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
    @State private var message = ""
    @State private var busy = false

    var body: some View {
        NavigationStack {
            list
            .navigationTitle("FX-Alarme")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 10) {
                        Toggle("Alle Alarme", isOn: $store.alertsMaster)
                            .labelsHidden()
                            .tint(Color(red: 0.204, green: 0.780, blue: 0.349))
                            .onChange(of: store.alertsMaster) {
                                store.saveView()
                                store.scheduleAlertSync()
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
                #if DEBUG
                // Xcode dev builds only: APNs test push (hidden in App Store screenshot mode)
                if ScreenshotMode.shot == nil {
                    Button("Test-Push senden") { Task { await sendTest() } }
                        .buttonStyle(.bordered)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .disabled(busy || !store.pushEnabled)
                }
                #endif
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

    /// Apple push on this device. Off removes the server subscription.
    private var notifications: some View {
        VStack(alignment: .leading, spacing: 8) {
            Toggle(isOn: Binding(get: { store.pushEnabled }, set: { store.setPushEnabled($0) })) {
                Text("Mitteilungen").font(.headline)
            }
            .tint(Color(red: 0.204, green: 0.780, blue: 0.349))
            if store.pushEnabled && denied {
                Text("Mitteilungen sind in den iOS-Einstellungen ausgeschaltet. Ohne sie kommen keine Alarme an.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Einstellungen öffnen") {
                    if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
                .buttonStyle(.bordered)
            } else if !store.pushEnabled {
                Text("Aus: Dieses iPhone erhält keine FX-Alarme.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .background(.background, in: RoundedRectangle(cornerRadius: 12))
    }

    #if DEBUG
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
    #endif

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

struct AboutSheet: View {
    @Environment(\.requestReview) private var requestReview
    @State private var mail: AboutMail?

    private var versionText: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "–"
        let year = Calendar.current.component(.year, from: .now)
        return "Version \(version) · © \(year) ComputerWorks AG"
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
