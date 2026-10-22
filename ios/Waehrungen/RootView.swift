import SwiftUI
import UIKit

struct RootView: View {
    @EnvironmentObject private var store: RatesStore
    @EnvironmentObject private var pro: ProStore
    @State private var showPaywall = false
    @State private var showView = false
    @State private var showAlerts = false
    @State private var showAdd = false
    @State private var showAbout = false
    @Environment(\.horizontalSizeClass) private var sizeClass
    /// Duo (regular width): entry shown on the right. nil = reporting currency.
    @State private var duoSelection: String?
    @State private var duoColumns: NavigationSplitViewVisibility = .all
    @State private var refreshing = false
    @State private var capturedFlash = false

    private var isWide: Bool {
        #if DEBUG
        if UserDefaults.standard.bool(forKey: "wuWide") { return true }
        #endif
        return sizeClass == .regular
    }

    var body: some View {
        Group {
            if isWide {
                NavigationSplitView(columnVisibility: $duoColumns) {
                    mainList
                        .environment(\.duoSelect, { code in duoSelection = code })
                        .environment(\.duoSelected, duoSelection ?? store.base)
                        .navigationSplitViewColumnWidth(min: 340, ideal: 420, max: 520)
                } detail: {
                    DuoDetail(code: duoSelection ?? store.base)
                        .id(duoSelection ?? store.base)
                }
                .navigationSplitViewStyle(.balanced)
            } else {
                NavigationStack { mainList }
            }
        }
        .sheet(isPresented: $showView) { AnsichtSheet().environmentObject(store).environmentObject(pro) }
        .sheet(isPresented: $showAlerts) { AlertsSheet().environmentObject(store).environmentObject(pro) }
        .sheet(isPresented: $showPaywall) { PaywallSheet().environmentObject(pro) }
        // one-time notice when Pro enforcement switched the alarms off (never while enforcement is off)
        .alert("FX-Alarme sind jetzt eine Pro-Funktion", isPresented: $store.proAlarmNotice) {
            Button("Mehr zur Vollversion") { showPaywall = true }
            Button("OK", role: .cancel) {}
        } message: {
            Text("Ihre Alarme wurden pausiert, die Schwellen bleiben gespeichert. Mit der Vollversion sind sie sofort wieder aktiv.")
        }
        .sheet(isPresented: $showAdd) { AddSheet().environmentObject(store) }
        .sheet(isPresented: $showAbout) { AboutSheet() }
        #if DEBUG
        .task {
            if ScreenshotMode.shot == "alerts" { await ScreenshotMode.wait(); showAlerts = true }
            if ScreenshotMode.shot == "ansicht" { await ScreenshotMode.wait(); showView = true }
            // -wuSelect USD: Duo layout with that currency on the right
            if let sel = UserDefaults.standard.string(forKey: "wuSelect") { await ScreenshotMode.wait(); duoSelection = sel }
        }
        #endif
    }

    private var mainList: some View {
            List {
                Section {
                    let boardIDs: [String] = store.visible.flatMap { code in
                        code == store.base && store.showCompare && !isWide ? [code, "compare"] : [code]
                    }
                    ForEach(boardIDs, id: \.self) { id in
                        if id == "compare" {
                            CompareChartCard()
                                .moveDisabled(true)
                                .listRowInsets(EdgeInsets(top: 0, leading: 20, bottom: 0, trailing: 8))
                                .listRowBackground(Color(uiColor: .secondarySystemGroupedBackground))
                        } else {
                            CurrencyCard(code: id, preview: false)
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    if id != store.base {
                                        Button(role: .destructive) { store.remove(id) } label: {
                                            Label("Entfernen", systemImage: "trash")
                                        }
                                    }
                                }
                                .listRowInsets(EdgeInsets(top: 8, leading: 20, bottom: 8, trailing: 8))
                                .listRowBackground(
                                    Color(uiColor: .secondarySystemGroupedBackground)
                                        .overlay(store.convertEditing && store.convertSource == id ? Color.blue.opacity(0.12) : Color.clear)
                                        .overlay(isWide && (duoSelection ?? store.base) == id && !store.convertEditing ? Color.blue.opacity(0.08) : Color.clear)
                                )
                        }
                    }
                    .onMove { from, to in
                        store.moveBoard(ids: boardIDs, from: from, to: to)
                    }
                } header: {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("Währung")
                            Spacer()
                            Text("Preis in \(store.base)")
                        }
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        if store.showConvertPill {
                            HStack(spacing: 6) {
                                Text(store.convertPillText)
                                Button {
                                    store.resetConvert()
                                    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                                } label: {
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
                    .listRowInsets(EdgeInsets(top: 2, leading: 20, bottom: 8, trailing: 16))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                }
                .listSectionSpacing(6)
            }
            .listStyle(.insetGrouped)
            .scrollDismissesKeyboard(.interactively)
            .refreshable {
                guard !store.convertEditing else { return }
                // Build 34: visible spinner below the custom title, at least ~0.5 s, light haptic and a flash of the «aktualisiert» line
                refreshing = true
                let started = Date()
                await store.reload()
                let left = 0.5 - Date().timeIntervalSince(started)
                if left > 0 { try? await Task.sleep(for: .seconds(left)) }
                refreshing = false
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                withAnimation(.easeOut(duration: 0.2)) { capturedFlash = true }
                try? await Task.sleep(for: .milliseconds(900))
                withAnimation(.easeIn(duration: 0.5)) { capturedFlash = false }
            }
            .background(KeypadDismiss(editing: store.convertEditing) {
                store.finishConvert()
                UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
            })
            .navigationTitle("Währungen")
            .toolbar(.hidden, for: .navigationBar)
            .safeAreaInset(edge: .top, spacing: 0) { titleRow }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 0) {
                    if pro.showHint { proHint }
                    sourceBar
                }
            }
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Fertig") {
                        store.finishConvert()
                        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                    }
                }
            }
    }

    /// Pinned header: large title and the three tools in one row, outside the list; never collapses or scrolls.
    private var titleRow: some View {
        HStack(alignment: .lastTextBaseline) {
            Text("Währungen")
                .font(.system(size: 34, weight: .bold))
                .foregroundStyle(Color(uiColor: .label))
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            headerButtons
                // icons' bottom edge sits on the title's text baseline (not the descender)
                .alignmentGuide(.lastTextBaseline) { d in d[.bottom] - 1.5 }  // -1.5pt: SF Symbol glyph inset
        }
        .padding(.leading, 20)
        .padding(.trailing, 24)
        .padding(.top, 8)
        .padding(.bottom, 6)
        .frame(maxWidth: .infinity)
        .overlay(alignment: .bottom) {
            // the system refresh control sits under this pinned title, so show our own spinner while refreshing
            if refreshing {
                ProgressView()
                    .controlSize(.regular)
                    .padding(8)
                    .background(.regularMaterial, in: Circle())
                    .offset(y: 40)
                    .transition(.opacity)
            }
        }
        .zIndex(1)
        .background(Color(uiColor: .systemGroupedBackground).ignoresSafeArea(edges: .top))
    }

    @ToolbarContentBuilder
    private var headerTools: some ToolbarContent {
        if #available(iOS 26.0, *) {
            ToolbarItem(placement: .topBarTrailing) {
                headerButtons
            }
            .sharedBackgroundVisibility(.hidden)
        } else {
            ToolbarItem(placement: .topBarTrailing) {
                headerButtons
            }
        }
    }

    private var headerButtons: some View {
        HStack(spacing: 22) {
            Button { showView = true } label: { Image(systemName: "slider.horizontal.3") }
                .accessibilityLabel("Ansicht")
            // Build 37: the bell opens the alarm settings for everyone; the paywall comes only when switching an alarm on
            Button { showAlerts = true } label: {
                Image(systemName: "bell")
                    .overlay(alignment: .topTrailing) { ProBadge().scaleEffect(0.8).offset(x: 12, y: -8) }
            }
                .accessibilityLabel("FX-Alarme")
        }
        .buttonStyle(.plain)
        .font(.system(size: 19))
        .foregroundStyle(Color.blue)
    }

    /// Subtle one-time hint (5th day of use). Tap opens the paywall, × hides it for good.
    private var proHint: some View {
        HStack(spacing: 8) {
            Button { showPaywall = true; pro.showHint = false } label: {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                    Text("Pro-Funktionen: FX-Alarme, Apple Watch, alle Widgets")
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.blue)
            Spacer(minLength: 4)
            Button { withAnimation { pro.showHint = false } } label: {
                Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Hinweis schliessen")
        }
        .font(.system(size: 13, weight: .medium))
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Color.blue.opacity(0.08), in: Capsule())
        .padding(.horizontal, 16)
        .padding(.bottom, 6)
    }

    private var sourceBar: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                if !store.capturedLine.isEmpty {
                    Text(store.capturedLine)
                        .foregroundStyle(capturedFlash ? Color.blue : Color.secondary)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 1)
                        .background(Color.blue.opacity(capturedFlash ? 0.12 : 0), in: RoundedRectangle(cornerRadius: 4))
                        .padding(.horizontal, -4)
                }
                Text(store.sourceLine)
            }
            .font(.system(size: 11))
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            Button { showAbout = true } label: {
                Image(systemName: "info.circle")
                    .font(.system(size: 18))
                    .foregroundStyle(Color.blue)
                    .frame(width: 44, height: 32)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.trailing, -2)
            .accessibilityLabel("Über Währungen")
        }
        .padding(.leading, 36)   // in line with the currency names
        .padding(.trailing, 16)
        .padding(.top, 6)
        .padding(.bottom, -12)   // sit lower, closer to the home indicator
        .background {
            ZStack {
                Rectangle().fill(.regularMaterial)
                Rectangle().fill(Color(uiColor: .systemGroupedBackground).opacity(0.95))
            }
            .ignoresSafeArea(edges: .bottom)
        }
        .overlay(alignment: .top) {
            Rectangle()
                .fill(Color(uiColor: .separator))
                .frame(height: 1 / UIScreen.main.scale)
        }
    }
}

struct CurrencyCard: View {
    @EnvironmentObject private var store: RatesStore
    let code: String
    var preview: Bool
    @FocusState private var amountFocused: Bool
    @State private var showDetail = false
    @State private var showIntervalSheet = false
    @State private var rowWidth: CGFloat = 0
    /// One-time swipe hint for the interval area (set after the first nudge, never shown again).
    @AppStorage("wu.swipeHintShown") private var swipeHintShown = false
    @State private var hintOffset: CGFloat = 0
    @Environment(\.duoSelect) private var duoSelect

    var body: some View {
        let unitRates = preview || store.showsUnitRates
        let editing = !preview && store.convertEditing && store.convertSource == code
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(CurrencyNames.name(code)).font(.system(size: 16, weight: .semibold))
                        if store.showIntervals && !store.showChart && code != store.base && duoSelect == nil {
                            // only with intervals on and the per-currency chart off: the big rate is the live one, above the hourly slots (style of «‹ Heute»)
                            Text("Aktuell")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                                .fixedSize()
                        }
                        if let time = store.fired[code] {
                            Image(systemName: "bell.fill")
                                .font(.system(size: 11))
                                .foregroundStyle(Color(red: 1, green: 0.231, blue: 0.188))
                            Text(time).font(.system(size: 11)).foregroundStyle(.secondary)
                        } else if !preview && store.hasActiveAlarm(code) {
                            // alarm set: same symbol and tint as Aktien Pro's alarm marker
                            Image(systemName: DuoConfig.alarmSymbol)
                                .font(.system(size: 11))
                                .foregroundStyle(Color.orange)
                                .accessibilityLabel("Alarm gesetzt")
                        }
                    }
                    Spacer(minLength: 8)
                    priceLabel(unitRates: unitRates, editing: editing)
                    if code != store.base && !preview { handle }
                }
                quoteMeta
            }
            if code != store.base {
                if store.showChart && duoSelect == nil {
                    // the whole small chart (left, middle, right) opens the large chart view
                    ChartBlock(code: code, preview: preview).environmentObject(store)
                        .contentShape(Rectangle())
                        .onTapGesture { if !preview && !editing { openDetail() } }
                }
                if store.showIntervals && duoSelect == nil {
                    // Build 33: tapping the interval area opens the per-currency interval sheet; swiping and «Heute» keep working
                    intervals
                        .contentShape(Rectangle())
                        .onTapGesture { if !preview && !editing { showIntervalSheet = true } }
                }
                if store.showForecast { forecast.padding(.trailing, priceInset) }
                if store.showReference { reference.padding(.trailing, priceInset) }
            }
        }
        // tap zones (name/rate header and rows without their own tap): left 40 % opens the detail sheet, right 40 % the conversion, middle 20 % nothing.
        // Child controls (reorder handle, amount field, interval paging) keep priority.
        .background(GeometryReader { geo in Color.clear.onAppear { rowWidth = geo.size.width }.onChange(of: geo.size.width) { _, w in rowWidth = w } })
        .contentShape(Rectangle())
        .onTapGesture(coordinateSpace: .local) { location in
            guard !preview, !editing, rowWidth > 0 else { return }
            let share = location.x / rowWidth
            if share <= 0.4 {
                if let duoSelect { duoSelect(code) } else if code != store.base { showDetail = true }
            } else if share >= 0.6 {
                store.beginConvert(code)
            }
        }
        .sheet(isPresented: $showDetail) {
            ChartDetailSheet(code: code).environmentObject(store)
        }
        .sheet(isPresented: $showIntervalSheet) {
            IntervalSheet(code: code).environmentObject(store)
        }
        #if DEBUG
        .task {
            // -wuShot intervalsheet [-wuSelect EUR]: opens the interval sheet of that currency (default EUR)
            if !preview && ScreenshotMode.shot == "intervalsheet" && code == (UserDefaults.standard.string(forKey: "wuIntervalCode") ?? "EUR") {
                await ScreenshotMode.wait(); showIntervalSheet = true
            }
        }
        #endif
    }

    private func openDetail() {
        if let duoSelect { duoSelect(code) } else { showDetail = true }
    }

    /// Today's column stays at the right. Swiping right adds earlier trading days to its left (up to `pastCapacity` columns).
    private var intervals: some View {
        // Build 35: the Ansicht preview shows an illustrated previous-day column too (non-interactive)
        let past = preview ? Array(store.intervalDays.dropFirst().prefix(1)) : store.visiblePastDays(capacity: pastCapacity)
        let anyPast = !past.isEmpty
        return VStack(spacing: 3) {
            if anyPast {
                HStack(spacing: 14) {
                    Spacer(minLength: 0)
                    ForEach(past, id: \.self) { day in
                        // blue «‹» before the oldest shown day: swipe right for earlier days
                        HStack(spacing: 2) {
                            if day == past.first && store.dayOffset < store.intervalDays.count - 1 {
                                Text("‹").foregroundStyle(Color.blue).accessibilityHidden(true)
                            }
                            Text(store.pastDayHeader(day)).foregroundStyle(.secondary)
                        }
                        .minimumScaleFactor(0.8)
                        .monospacedDigit()
                        .frame(width: Self.pastColumnWidth, alignment: .trailing)
                    }
                    Button {
                        page(1 - store.dayOffset)
                    } label: {
                        Text("Heute")
                            .foregroundStyle(store.dayOffset > 1 ? Color.blue : Color.secondary)
                            .frame(minWidth: Self.pastColumnWidth, alignment: .trailing)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(preview || store.dayOffset <= 1)
                    .accessibilityHint(store.dayOffset > 1 ? "Frühere Tage ausblenden" : "")
                }
                .font(.system(size: 11, weight: .medium))
                .lineLimit(1)
            } else if !preview {
                // only today: small grey header, no extra columns
                HStack(spacing: 4) {
                    Spacer()
                    if hasEarlierDays {
                        Text("‹").accessibilityHidden(true)
                    }
                    Text("Heute")
                }
                .foregroundStyle(.secondary)
                .font(.system(size: 11, weight: .medium))
            }
            VStack(spacing: 3) {
                ForEach(store.hours(for: code), id: \.self) { hour in
                    HStack(spacing: 14) {
                        Text(String(format: "%02d:00", hour))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .fixedSize()
                        Spacer(minLength: 4)
                        ForEach(past, id: \.self) { day in
                            Text(pastValue(hour, day))
                                .foregroundStyle(.primary)
                                .lineLimit(1)
                                .fixedSize()
                                .frame(minWidth: Self.pastColumnWidth, alignment: .trailing)
                        }
                        Text(shownInterval(hour))
                            .foregroundStyle(!preview && !store.hourReached(hour) ? Color.secondary : Color.primary)
                            .lineLimit(1)
                            .fixedSize()
                            // fixed today column so «–» keeps the earlier columns aligned
                            .frame(minWidth: anyPast ? Self.pastColumnWidth : 0, alignment: .trailing)
                    }
                    // one small size for the whole interval area (times, both columns, headers)
                    .font(.system(size: 11))
                    .monospacedDigit()
                }
            }
            .overlay {
                if !preview {
                    DayPagingPan(
                        canBack: store.dayOffset < store.intervalDays.count - 1,
                        canForward: store.dayOffset > 1
                    ) { step in
                        page(step)
                    }
                }
            }
        }
        .monospacedDigit()
        .offset(x: hintOffset)
        .onAppear { runSwipeHint() }
        // keep today's column under the price, clear of the reorder handle (22pt + 8pt spacing)
        .padding(.trailing, priceInset)
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: page(-1)
            case .decrement: page(1)
            @unknown default: break
            }
        }
    }

    static let pastColumnWidth: CGFloat = 66

    private var hasEarlierDays: Bool {
        guard !preview, store.intervalDays.count > 1 else { return false }
        let day = store.intervalDays[1]
        return store.hours(for: code).contains { store.intervalValue(code, hour: $0, on: day) != nil }
    }

    /// The first time the interval area appears with earlier days, it nudges right and back once.
    private func runSwipeHint() {
        guard hasEarlierDays, !swipeHintShown, !UIAccessibility.isReduceMotionEnabled else { return }
        swipeHintShown = true
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(600))
            withAnimation(.easeOut(duration: 0.25)) { hintOffset = 18 }
            try? await Task.sleep(for: .milliseconds(280))
            withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) { hintOffset = 0 }
        }
    }

    /// Trailing inset that lines values up with the price column: reorder handle (22pt) + spacing (8pt).
    /// The preview card and the reporting-currency row have no handle, so their price sits at the edge.
    private var priceInset: CGFloat { preview || code == store.base ? 0 : 30 }

    /// Earlier-day columns next to today: two when the row is wide enough at the normal font size
    /// (e.g. Pro Max / Plus), otherwise one. Each further swipe moves the window one trading day back.
    private var pastCapacity: Int {
        // hour label + gap, today's value, trailing inset, slack for wide values (e.g. 1'234.56)
        let fixed: CGFloat = 44 + 72 + priceInset + 40
        let perColumn = Self.pastColumnWidth + 14
        return rowWidth >= fixed + 2 * perColumn ? 2 : 1
    }

    private func pastValue(_ hour: Int, _ day: String) -> String {
        guard let value = store.intervalValue(code, hour: hour, on: day) else {
            guard preview, let anchor = previewAnchor(excluding: hour) else { return "–" }
            return formatRate(anchor + previewNudge(hour) - 0.0011)   // illustrated previous day
        }
        return formatRate(value)   // Build 34: no unit in the interval columns
    }

    private func page(_ step: Int) {
        withAnimation(.easeInOut(duration: 0.2)) {
            if store.pageDays(by: step) {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
        }
    }

    private var forecast: some View {
        let line = preview ? illustratedForecast() : store.forecast(code)
        return HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text("Prognose")
                .font(.system(size: 13, weight: .medium))
            Spacer(minLength: 8)
            pair(tag: "Heute", value: line?.today, delta: line?.todayDelta)
            Text("·")
                .font(.system(size: 11, weight: .regular))
            pair(tag: "7 Tage", value: line?.week, delta: line?.weekDelta)
        }
        .monospacedDigit()
        .foregroundStyle(.secondary)
    }

    private func pair(tag: String, value: Double?, delta: Double?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(tag)
                .font(.system(size: 11, weight: .regular))
            VStack(alignment: .trailing, spacing: 1) {
                Text(valueText(value, delta: delta))
                    .font(.system(size: 11, weight: .regular))
                    .monospacedDigit()
                Text(formatDelta(delta))
                    .font(.system(size: 9, weight: .regular))
                    .monospacedDigit()
            }
        }
    }

    private var reference: some View {
        HStack {
            Text("EZB-Referenzkurs")
            // ECB data carries only the reference date (no time), so only the date is shown
            if !preview, let day = store.referenceDay(code) {
                Text(RatesStore.ecbDateText(day))
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(shownReference()).monospacedDigit()
        }
        .font(.system(size: 13))
        .monospacedDigit()
    }

    private func priceLabel(unitRates: Bool, editing: Bool) -> some View {
        let hint = code == store.base && (preview || !store.convertEditing)
        return Group {
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
                        .onChange(of: amountFocused) { _, focused in
                            if !focused && store.convertEditing && store.convertSource == code {
                                store.finishConvert()
                            }
                        }
                    Text(code)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Color.blue)
                        .accessibilityHidden(true)
                }
            } else {
                TappableAmount(
                    text: store.primaryText(code, unitRates: unitRates),
                    blue: hint,
                    enabled: !preview
                ) {
                    store.beginConvert(code)
                }
            }
        }
    }

    /// 76pt keeps every arrow on the same x, with the comparison dot inside that column.
    private var lotCaption: some View {
        HStack(alignment: .center, spacing: 4) {
            if code != store.base && store.showCompare {
                Circle()
                    .fill(ComparePalette.color(store.compareIndex(code)))
                    .frame(width: 8, height: 8)
            }
            Text(code == store.base ? "\(store.base) · Berichtswährung" : CurrencyNames.lotLine(code))
                .font(.system(size: 13))
                .foregroundStyle(code == store.base ? Color.blue : Color.secondary)
                .lineLimit(1)
                .minimumScaleFactor(code == store.base ? 1 : 0.75)
        }
        .frame(width: code == store.base ? nil : 76, alignment: .leading)
    }

    /// One line when the change and the inverse both fit. Otherwise the change drops to the next line, still at x = 84pt.
    @ViewBuilder
    private var quoteMeta: some View {
        if code == store.base {
            Text("\(store.base) · Berichtswährung")
                .font(.system(size: 13))
                .foregroundStyle(Color.blue)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            // Day change always sits right-aligned under the price and the blue inverse.
            quoteLine(stacked: true)
        }
    }

    /// The wide row reports the full text width, so `ViewThatFits` keeps it only when nothing has to compress.
    @ViewBuilder
    private func quoteLine(stacked: Bool) -> some View {
        let change = store.dayChange(code)
        let grip = !preview
        if stacked {
            VStack(alignment: .leading, spacing: 1) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    lotCaption
                    Spacer(minLength: 8)
                    inverseLabel
                    if grip { Color.clear.frame(width: 22, height: 1) }
                }
                if let change {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Spacer(minLength: 0)
                        // fixed-width box, text left-aligned inside: right edge under the price,
                        // and the arrows of all rows still start at the same x
                        Text(change.text)
                            .font(.system(size: 12))
                            .foregroundStyle(changeTone(percent: change.percent))
                            .monospacedDigit()
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                            .frame(width: 150, alignment: .trailing)
                        if grip { Color.clear.frame(width: 22, height: 1) }
                    }
                }
            }
        } else {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                lotCaption
                if let change {
                    Text(change.text)
                        .font(.system(size: 12))
                        .foregroundStyle(changeTone(percent: change.percent))
                        .monospacedDigit()
                        .lineLimit(1)
                        .fixedSize(horizontal: true, vertical: false)
                }
                Spacer(minLength: 8)
                inverseLabel
                    .fixedSize(horizontal: true, vertical: false)
                if grip { Color.clear.frame(width: 22, height: 1) }
            }
        }
    }

    private var inverseLabel: some View {
        TappableAmount(
            text: store.secondaryText(code),
            blue: true,
            enabled: !preview,
            fontSize: 12,
            weight: .regular
        ) {
            store.beginConvert(code)
            amountFocused = true
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
            .accessibilityLabel("\(CurrencyNames.name(code)) verschieben")
    }

    private func shownInterval(_ hour: Int) -> String {
        if let real = store.intervalValue(code, hour: hour) { return formatRate(real) }
        guard preview, let anchor = previewAnchor(excluding: hour) else { return "–" }
        return formatRate(anchor + previewNudge(hour))
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
        let known = store.hours(for: code).compactMap { item -> (Int, Double)? in
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
        return "\(formatRate(value)) \(store.base)"
    }

    private func valueText(_ value: Double?, delta: Double?) -> String {
        guard let value else { return "–" }
        let mark = arrow(delta)
        return mark.isEmpty ? formatRate(value) : "\(mark) \(formatRate(value))"
    }
}

/// The idle and result amount. A real UILabel so a list tap can tell it apart from the row background.
struct TappableAmount: UIViewRepresentable {
    var text: String
    var blue: Bool
    var enabled: Bool
    var fontSize: CGFloat = 17
    var weight: UIFont.Weight = .semibold
    var onTap: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> AmountLabel {
        let label = AmountLabel()
        label.isUserInteractionEnabled = true
        label.setContentHuggingPriority(.required, for: .horizontal)
        label.setContentCompressionResistancePriority(.required, for: .horizontal)
        label.font = .monospacedDigitSystemFont(ofSize: context.coordinator.fontSize, weight: context.coordinator.weight)
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.tap))
        label.addGestureRecognizer(tap)
        return label
    }

    func updateUIView(_ uiView: AmountLabel, context: Context) {
        uiView.font = .monospacedDigitSystemFont(ofSize: fontSize, weight: weight)
        uiView.text = text
        uiView.textColor = blue ? .systemBlue : .label
        uiView.accessibilityLabel = "\(text) bearbeiten"
        uiView.accessibilityTraits = .button
        uiView.isAccessibilityElement = true
        context.coordinator.onTap = onTap
        context.coordinator.enabled = enabled
        context.coordinator.fontSize = fontSize
        context.coordinator.weight = weight
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: AmountLabel, context: Context) -> CGSize? {
        let size = uiView.intrinsicContentSize
        return CGSize(width: ceil(size.width), height: ceil(size.height))
    }

    final class Coordinator: NSObject {
        var onTap: () -> Void = {}
        var enabled = true
        var fontSize: CGFloat = 17
        var weight: UIFont.Weight = .semibold
        @objc func tap() { if enabled { onTap() } }
    }
}

final class AmountLabel: UILabel {}

/// Closes the keypad on a tap that is not another amount, and keeps pull-to-refresh off while it is open.
private struct KeypadDismiss: UIViewRepresentable {
    var editing: Bool
    var onTapOutside: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.editing = editing
        context.coordinator.onTapOutside = onTapOutside
        DispatchQueue.main.async {
            guard let scroll = Self.listScroll(from: uiView) else { return }
            scroll.keyboardDismissMode = .interactive
            context.coordinator.attach(to: scroll)
            if let window = uiView.window { context.coordinator.attachWindow(window) }
            scroll.refreshControl?.isEnabled = !context.coordinator.editing && !context.coordinator.blockRefresh
        }
    }

    private static func listScroll(from view: UIView) -> UIScrollView? {
        var current: UIView? = view
        while let node = current {
            if let scroll = node as? UIScrollView { return scroll }
            current = node.superview
        }
        var root: UIView = view
        while let parent = root.superview { root = parent }
        return firstTallScroll(in: root)
    }

    private static func firstTallScroll(in view: UIView) -> UIScrollView? {
        if let scroll = view as? UIScrollView, scroll.bounds.height > 200 { return scroll }
        for sub in view.subviews {
            if let found = firstTallScroll(in: sub) { return found }
        }
        return nil
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var editing = false
        var blockRefresh = false
        var onTapOutside: () -> Void = {}
        weak var scroll: UIScrollView?

        func attach(to scroll: UIScrollView) {
            guard self.scroll !== scroll else { return }
            let tap = UITapGestureRecognizer(target: self, action: #selector(tapped(_:)))
            tap.cancelsTouchesInView = false
            tap.delaysTouchesBegan = false
            tap.delaysTouchesEnded = false
            tap.delegate = self
            tap.name = "wae.keypadDismiss"
            scroll.addGestureRecognizer(tap)
            scroll.panGestureRecognizer.addTarget(self, action: #selector(panned(_:)))
            self.scroll = scroll
        }

        weak var window: UIWindow?

        /// A tap anywhere in the app window (header, empty space, footer) also closes the keypad.
        /// The keypad itself lives in the system keyboard window, so taps on it never land here.
        func attachWindow(_ window: UIWindow) {
            guard self.window !== window else { return }
            let tap = UITapGestureRecognizer(target: self, action: #selector(tapped(_:)))
            tap.cancelsTouchesInView = false
            tap.delaysTouchesBegan = false
            tap.delaysTouchesEnded = false
            tap.delegate = self
            tap.name = "wae.keypadDismiss.window"
            window.addGestureRecognizer(tap)
            self.window = window
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            guard editing else { return false }
            var view: UIView? = touch.view
            while let current = view {
                if current is UITextField || current is AmountLabel { return false }
                view = current.superview
            }
            return true
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            true
        }

        private var lastClose = Date.distantPast

        @objc func tapped(_ gesture: UITapGestureRecognizer) {
            guard editing, gesture.state == .ended else { return }
            // list and window recognisers can both fire for one tap
            guard Date().timeIntervalSince(lastClose) > 0.3 else { return }
            lastClose = Date()
            onTapOutside()
        }

        @objc func panned(_ pan: UIPanGestureRecognizer) {
            guard let scroll else { return }
            if pan.state == .began { blockRefresh = editing }
            if blockRefresh {
                scroll.refreshControl?.isEnabled = false
                if pan.state == .ended || pan.state == .cancelled || pan.state == .failed {
                    scroll.refreshControl?.endRefreshing()
                    blockRefresh = false
                    scroll.refreshControl?.isEnabled = !editing
                }
            }
        }
    }
}

/// Horizontal-only pan over the interval rows. It begins only for a clearly horizontal swipe in a
/// direction that can still page, so vertical scrolling, long-press reorder and (on today, swiping left)
/// the row's delete action keep working.
private struct DayPagingPan: UIViewRepresentable {
    var canBack: Bool
    var canForward: Bool
    /// +1 = one trading day back (swipe right), -1 = toward today (swipe left)
    var onPage: (Int) -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        let pan = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.panned(_:)))
        pan.delegate = context.coordinator
        pan.cancelsTouchesInView = true
        pan.name = "wae.dayPaging"
        view.addGestureRecognizer(pan)
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.canBack = canBack
        context.coordinator.canForward = canForward
        context.coordinator.onPage = onPage
    }

    @MainActor
    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var canBack = false
        var canForward = false
        var onPage: (Int) -> Void = { _ in }
        private let threshold: CGFloat = 40

        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            guard let pan = gestureRecognizer as? UIPanGestureRecognizer else { return false }
            let v = pan.velocity(in: pan.view)
            guard abs(v.x) > abs(v.y) * 1.5 else { return false }
            return v.x > 0 ? canBack : canForward
        }

        /// While our pan is possible, the list's swipe-to-delete pan waits for it.
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
            guard other is UIPanGestureRecognizer, !(other.view is UIScrollView && other === (other.view as? UIScrollView)?.panGestureRecognizer) else { return false }
            return true
        }

        @objc func panned(_ pan: UIPanGestureRecognizer) {
            guard pan.state == .ended else { return }
            let dx = pan.translation(in: pan.view).x
            let vx = pan.velocity(in: pan.view).x
            if dx > threshold || (dx > 15 && vx > 500) {
                if canBack { onPage(1) }
            } else if dx < -threshold || (dx < -15 && vx < -500) {
                if canForward { onPage(-1) }
            }
        }
    }
}

// MARK: - Duo (regular width: unfolded foldable iPhone, iPad)

enum DuoConfig {
    /// Trading days shown in the Duo detail: today plus 5 earlier ones.
    static let dayCount = 6
    /// Alarm marker in the list, same SF Symbol as Aktien Pro's alarm marker.
    static let alarmSymbol = "bell.fill"
}

private struct DuoSelectKey: EnvironmentKey {
    static let defaultValue: ((String) -> Void)? = nil
}

private struct DuoSelectedKey: EnvironmentKey {
    static let defaultValue: String? = nil
}

extension EnvironmentValues {
    /// Set only in the Duo layout: a tap on a row selects it for the right column instead of opening a sheet.
    var duoSelect: ((String) -> Void)? {
        get { self[DuoSelectKey.self] }
        set { self[DuoSelectKey.self] = newValue }
    }
    var duoSelected: String? {
        get { self[DuoSelectedKey.self] }
        set { self[DuoSelectedKey.self] = newValue }
    }
}

/// Right column of the Duo layout.
struct DuoDetail: View {
    @EnvironmentObject private var store: RatesStore
    let code: String

    var body: some View {
        NavigationStack {
            if code == store.base {
                DuoBaseDetail()
            } else {
                ChartDetailSheet(code: code, embedded: true, footer: AnyView(DuoIntervals(code: code)))
            }
        }
    }
}

/// Reporting currency: name, rates of all listed foreign currencies, source and time.
struct DuoBaseDetail: View {
    @EnvironmentObject private var store: RatesStore

    var body: some View {
        let foreign = store.visible.filter { $0 != store.base }
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text(CurrencyNames.name(store.base))
                    .font(.system(size: 34, weight: .bold))
                Text("\(store.base) · Berichtswährung")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Color.blue)
                    .padding(.top, 4)
                Text("Alle Kurse in \(store.base), Mittelkurs. Tagesveränderung seit Mitternacht.")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                    .padding(.top, 10)

                VStack(spacing: 0) {
                    HStack {
                        Text("Währung")
                        Spacer()
                        Text("Preis in \(store.base)").frame(width: 110, alignment: .trailing)
                        Text("1 \(store.base) =").frame(width: 140, alignment: .trailing)
                        Text("Heute").frame(width: 140, alignment: .trailing)
                    }
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    ForEach(foreign, id: \.self) { code in
                        Divider().padding(.leading, 14)
                        row(code)
                    }
                }
                .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .padding(.top, 24)

                if foreign.contains(where: { store.reference($0) != nil }) {
                    VStack(spacing: 0) {
                        ForEach(foreign.filter { store.reference($0) != nil }, id: \.self) { code in
                            if code != foreign.first(where: { store.reference($0) != nil }) { Divider().padding(.leading, 14) }
                            HStack {
                                Text("EZB-Referenzkurs \(code)")
                                Spacer()
                                Text("\(formatRate(store.reference(code))) \(store.base)").monospacedDigit()
                            }
                            .font(.system(size: 14))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                        }
                    }
                    .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .padding(.top, 20)
                }

                if !foreign.isEmpty {
                    Text("Entwicklung der Währungen")
                        .font(.system(size: 20, weight: .bold))
                        .padding(.top, 28)
                    CompareDetailSheet(embedded: true)
                        .padding(.top, 8)
                    VStack(alignment: .leading, spacing: 20) {
                        ForEach(foreign, id: \.self) { code in
                            DuoIntervals(code: code, title: "Intervalle \(CurrencyNames.name(code))")
                        }
                    }
                    .padding(.top, 28)
                }

                VStack(alignment: .leading, spacing: 4) {
                    if !store.capturedLine.isEmpty { Text(store.capturedLine) }
                    Text(store.sourceLine)
                    Text("Erfassungszeiten: \(store.hours.map { String(format: "%02d:00", $0) }.joined(separator: ", "))")
                }
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .padding(.top, 20)
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle(CurrencyNames.name(store.base))
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color(uiColor: .systemGroupedBackground), for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .background(Color(uiColor: .systemGroupedBackground))
        .onAppear { store.wantCompare(true) }
        .onDisappear { store.wantCompare(false) }
    }

    private func row(_ code: String) -> some View {
        let change = store.dayChange(code)
        return HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(CurrencyNames.name(code)).font(.system(size: 16, weight: .semibold)).lineLimit(2).fixedSize(horizontal: false, vertical: true)
                    if store.hasActiveAlarm(code) {
                        Image(systemName: DuoConfig.alarmSymbol).font(.system(size: 11)).foregroundStyle(Color.orange)
                    }
                }
                Text(CurrencyNames.lotLine(code)).font(.system(size: 13)).foregroundStyle(.secondary)
            }
            .frame(minWidth: 120, alignment: .leading)
            .layoutPriority(1)
            Spacer(minLength: 8)
            Text(store.primaryText(code, unitRates: store.showsUnitRates))
                .font(.system(size: 17, weight: .semibold))
                .lineLimit(1)
                .frame(width: 110, alignment: .trailing)
            Text(store.secondaryText(code))
                .font(.system(size: 13))
                .foregroundStyle(Color.blue)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
                .frame(width: 140, alignment: .trailing)
            Text(change?.text ?? "–")
                .font(.system(size: 12))
                .foregroundStyle(changeTone(percent: change?.percent))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(width: 140, alignment: .trailing)
        }
        .monospacedDigit()
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }
}

/// Duo detail: the currency's interval hours (own step, global start/end) for today and several earlier trading days, oldest left.
struct DuoIntervals: View {
    @EnvironmentObject private var store: RatesStore
    let code: String
    var title = "Intervalle"

    var body: some View {
        let days = Array(store.intervalDays.prefix(DuoConfig.dayCount))
        let today = days.first
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 15, weight: .semibold))
            Grid(alignment: .trailing, horizontalSpacing: 14, verticalSpacing: 8) {
                GridRow {
                    Text("Zeit").gridColumnAlignment(.leading)
                    ForEach(days.reversed(), id: \.self) { day in
                        Text(day == today ? "Heute" : store.pastDayHeader(day))
                            .foregroundStyle(day == today ? Color.blue : Color.secondary)
                    }
                }
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.secondary)
                Divider()
                ForEach(store.hours(for: code), id: \.self) { hour in
                    GridRow {
                        Text(String(format: "%02d:00", hour)).foregroundStyle(.secondary)
                        ForEach(days.reversed(), id: \.self) { day in
                            Text(value(hour, day: day, isToday: day == today))
                                .frame(minWidth: 70, alignment: .trailing)
                        }
                    }
                    .font(.system(size: 14))
                }
            }
            .monospacedDigit()
            .padding(14)
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            Text("Kurse in \(store.base), erster Kurs ab der jeweiligen Stunde.")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
        }
    }

    private func value(_ hour: Int, day: String, isToday: Bool) -> String {
        let v = isToday ? store.intervalValue(code, hour: hour) : store.intervalValue(code, hour: hour, on: day)
        guard let v else { return "–" }
        return formatRate(v)
    }
}
