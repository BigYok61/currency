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
                    .listRowInsets(EdgeInsets(top: 8, leading: 20, bottom: 8, trailing: 16))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                }
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
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.top, 6)
        .padding(.bottom, 4)
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
    @State private var dragOffset: CGFloat = 0
    @FocusState private var amountFocused: Bool

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
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(code == store.base ? "\(store.base) · Berichtswährung" : CurrencyNames.lotLine(code))
                        .font(.system(size: 13))
                        .foregroundStyle(code == store.base ? Color.blue : Color.secondary)
                        .lineLimit(1)
                        .frame(width: code == store.base ? nil : 76, alignment: .leading)
                    if code != store.base, let day = store.dayChange(code) {
                        Text(day.text)
                            .font(.system(size: 12))
                            .foregroundStyle(dayChangeTone(day.delta))
                            .monospacedDigit()
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else if code != store.base {
                        Spacer(minLength: 0)
                    }
                    if code != store.base { inverseLabel }
                    if code != store.base && !preview {
                        Color.clear.frame(width: 22, height: 1)
                    }
                }
            }
            if code != store.base {
                if store.showChart { ChartBlock(code: code, preview: preview).environmentObject(store) }
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
        return HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text("Prognose")
                .font(.system(size: 13, weight: .medium))
            pair(tag: "heute", value: line?.today, delta: line?.todayDelta)
            Text("·")
                .font(.system(size: 11, weight: .regular))
            pair(tag: "7 Tage", value: line?.week, delta: line?.weekDelta)
        }
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

        @objc func tapped(_ gesture: UITapGestureRecognizer) {
            guard editing, gesture.state == .ended else { return }
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
