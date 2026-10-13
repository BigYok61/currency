import SwiftUI
import UIKit

struct RootView: View {
    @EnvironmentObject private var store: RatesStore
    @State private var showView = false
    @State private var showTimes = false
    @State private var showAlerts = false
    @State private var showAdd = false
    @State private var showAbout = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    let boardIDs: [String] = store.visible.flatMap { code in
                        code == store.base && store.showCompare ? [code, "compare"] : [code]
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
                await store.reload()
            }
            .background(KeypadDismiss(editing: store.convertEditing) {
                store.finishConvert()
                UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
            })
            .navigationTitle("Währungen")
            .safeAreaInset(edge: .bottom, spacing: 0) { sourceBar }
            .toolbar {
                headerTools
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
        .sheet(isPresented: $showAbout) { AboutSheet() }
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
            Button { showView = true } label: { Image(systemName: "square.grid.2x2") }
                .accessibilityLabel("Ansicht")
            Button { showTimes = true } label: { Image(systemName: "clock") }
                .accessibilityLabel("Erfassungszeiten und Intervalle")
            Button { showAlerts = true } label: { Image(systemName: "bell") }
                .accessibilityLabel("FX-Alarme")
        }
        .buttonStyle(.plain)
        .font(.system(size: 19))
        .foregroundStyle(Color.blue)
    }

    private var sourceBar: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                if !store.capturedLine.isEmpty {
                    Text(store.capturedLine)
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
    /// One-time swipe hint for the interval area (set after the first nudge, never shown again).
    @AppStorage("wu.swipeHintShown") private var swipeHintShown = false
    @State private var hintOffset: CGFloat = 0

    var body: some View {
        let unitRates = preview || store.showsUnitRates
        let editing = !preview && store.convertEditing && store.convertSource == code
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(CurrencyNames.name(code)).font(.system(size: 16, weight: .semibold))
                        if let time = store.fired[code] {
                            Image(systemName: "bell.fill")
                                .font(.system(size: 11))
                                .foregroundStyle(Color(red: 1, green: 0.231, blue: 0.188))
                            Text(time).font(.system(size: 11)).foregroundStyle(.secondary)
                        }
                    }
                    Spacer(minLength: 8)
                    priceLabel(unitRates: unitRates, editing: editing)
                    if code != store.base && !preview { handle }
                }
                quoteMeta
            }
            if code != store.base {
                if store.showChart { ChartBlock(code: code, preview: preview).environmentObject(store) }
                if store.showIntervals { intervals }
                if store.showForecast { forecast.padding(.trailing, priceInset) }
                if store.showReference { reference.padding(.trailing, priceInset) }
            }
        }
    }

    /// Today's column stays at the right. Swiping right shows one earlier trading day in a single column to its left.
    private var intervals: some View {
        let past = preview ? [] : store.visiblePastDays(capacity: pastCapacity)
        let anyPast = !past.isEmpty
        return VStack(spacing: 3) {
            if anyPast {
                HStack(spacing: 14) {
                    Spacer(minLength: 0)
                    ForEach(past, id: \.self) { day in
                        Text(store.pastDayHeader(day))
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                            .frame(width: Self.pastColumnWidth, alignment: .trailing)
                    }
                    Button {
                        page(-store.dayOffset)
                    } label: {
                        Text("Heute")
                            .foregroundStyle(anyPast ? Color.blue : Color.secondary)
                            .frame(minWidth: 44, alignment: .trailing)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(!anyPast)
                    .accessibilityHint(anyPast ? "Frühere Tage ausblenden" : "")
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
                ForEach(store.hours, id: \.self) { hour in
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
                            .lineLimit(1)
                            .fixedSize()
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
                        canForward: store.dayOffset > 0
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
        return store.hours.contains { store.intervalValue(code, hour: $0, on: day) != nil }
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

    /// One past column next to today; each swipe moves it one trading day further back.
    private var pastCapacity: Int { 1 }

    private func pastValue(_ hour: Int, _ day: String) -> String {
        guard let value = store.intervalValue(code, hour: hour, on: day) else { return "–" }
        return rateText(value)
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
                            .foregroundStyle(dayChangeTone(change.delta))
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
                        .foregroundStyle(dayChangeTone(change.delta))
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
