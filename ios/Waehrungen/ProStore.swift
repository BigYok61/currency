import SwiftUI
import StoreKit
import WidgetKit

/// Build 35: «Währungen Pro» (non-consumable, StoreKit 2). Central place for the entitlement.
/// Enforcement is controlled only by `ProShared.enforcementEnabled` (see Shared/WidgetShared.swift).
@MainActor
final class ProStore: ObservableObject {
    static var enforcementEnabled: Bool { ProShared.enforcementEnabled }

    @Published private(set) var isPro: Bool
    @Published private(set) var product: Product?
    @Published var busy = false
    @Published var message = ""
    /// Subtle one-time hint (5th day of use), never repeated.
    @Published var showHint = false

    weak var rates: RatesStore?
    private var updatesTask: Task<Void, Never>?
    private let defaults = UserDefaults.standard

    init() {
        isPro = ProShared.isPro
    }

    /// Pro features are blocked right now (never while enforcement is off).
    var locked: Bool { Self.enforcementEnabled && !isPro }

    var priceText: String { product?.displayPrice ?? "CHF 5.00" }

    func start(rates: RatesStore) {
        self.rates = rates
        rates.setProLocked(locked)
        countLaunchDay()
        guard updatesTask == nil else { return }
        updatesTask = Task { [weak self] in
            for await update in Transaction.updates {
                if case .verified(let transaction) = update { await transaction.finish() }
                await self?.refreshEntitlement()
            }
        }
        Task {
            await refreshEntitlement()
            await loadProduct()
        }
    }

    func loadProduct() async {
        guard product == nil else { return }
        product = try? await Product.products(for: [ProShared.productID]).first
    }

    func refreshEntitlement() async {
        var owned = false
        for await result in Transaction.currentEntitlements {
            if case .verified(let t) = result, t.productID == ProShared.productID, t.revocationDate == nil {
                owned = true
            }
        }
        apply(owned)
    }

    private func apply(_ owned: Bool) {
        let changed = owned != isPro
        isPro = owned
        WidgetShared.defaults?.set(owned, forKey: ProShared.isProKey)
        if changed { WidgetCenter.shared.reloadAllTimelines() }
        rates?.setProLocked(locked)
    }

    func purchase() async {
        await loadProduct()
        guard let product else { message = "Der Kauf ist im Moment nicht verfügbar. Bitte später erneut versuchen."; return }
        busy = true
        defer { busy = false }
        message = ""
        do {
            switch try await product.purchase() {
            case .success(let verification):
                guard case .verified(let transaction) = verification else {
                    message = "Der Kauf konnte nicht bestätigt werden."
                    return
                }
                await transaction.finish()
                await refreshEntitlement()
                message = isPro ? "Danke! Währungen Pro ist aktiv." : ""
            case .pending:
                message = "Der Kauf wartet auf eine Bestätigung."
            case .userCancelled:
                break
            @unknown default:
                break
            }
        } catch {
            message = "Kauf fehlgeschlagen: \(error.localizedDescription)"
        }
    }

    func restore() async {
        busy = true
        defer { busy = false }
        message = ""
        do {
            try await AppStore.sync()
            await refreshEntitlement()
            message = isPro ? "Währungen Pro wurde wiederhergestellt." : "Kein Kauf von Währungen Pro gefunden."
        } catch {
            message = "Wiederherstellen fehlgeschlagen: \(error.localizedDescription)"
        }
    }

    /// Counts distinct days the app was opened; on the 5th day a subtle hint shows once.
    private func countLaunchDay() {
        let today = RatesStore.todayKey()
        var list = defaults.stringArray(forKey: "wu.pro.launchDays") ?? []
        if !list.contains(today) {
            list.append(today)
            defaults.set(Array(list.suffix(10)), forKey: "wu.pro.launchDays")
            let count = defaults.integer(forKey: "wu.pro.launchDayCount") + 1
            defaults.set(count, forKey: "wu.pro.launchDayCount")
        }
        #if DEBUG
        if ScreenshotMode.shot != nil { return }
        #endif
        if !isPro, defaults.integer(forKey: "wu.pro.launchDayCount") >= 5, !defaults.bool(forKey: "wu.pro.hintShown") {
            defaults.set(true, forKey: "wu.pro.hintShown")
            showHint = true
        }
    }
}

/// Small «Pro» badge next to Pro features.
struct ProBadge: View {
    @EnvironmentObject private var pro: ProStore
    var body: some View {
        if !pro.isPro {
            Text("Pro")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 5)
                .padding(.vertical, 1.5)
                .background(Color.orange, in: Capsule())
                .accessibilityLabel("Währungen Pro")
        }
    }
}

struct PaywallSheet: View {
    @EnvironmentObject private var pro: ProStore

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Währungen Pro").font(.system(size: 28, weight: .bold))
                        Text("Einmal kaufen, für immer nutzen – kein Abo. Alle anderen Funktionen bleiben gratis.")
                            .foregroundStyle(.secondary)
                    }
                    VStack(alignment: .leading, spacing: 14) {
                        benefit("bell.badge", "FX-Alarme", "Mitteilung, sobald sich ein Kurs stärker bewegt – auch wenn die App geschlossen ist.")
                        benefit("applewatch", "Apple Watch", "Ihre Kurse am Handgelenk, sobald die Watch-App verfügbar ist.")
                        benefit("square.grid.2x2", "Alle Widgets", "Mittlere und grosse Widgets auf iPhone und iPad. Das kleine Widget bleibt gratis.")
                    }
                    .padding(16)
                    .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    if pro.isPro {
                        Label("Währungen Pro ist aktiv. Danke!", systemImage: "checkmark.seal.fill")
                            .foregroundStyle(Color.green)
                            .font(.headline)
                    } else {
                        Button { Task { await pro.purchase() } } label: {
                            Text("Kaufen für \(pro.priceText)")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 6)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(pro.busy)
                    }
                    Button("Käufe wiederherstellen") { Task { await pro.restore() } }
                        .frame(maxWidth: .infinity)
                        .disabled(pro.busy)
                    if !pro.message.isEmpty {
                        Text(pro.message).font(.footnote).foregroundStyle(.secondary)
                    }
                    Text("Einmaliger Kauf über Ihr Apple-Konto, mit der Familienfreigabe teilbar. Die Kurse bleiben unverbindlich und ohne Gewähr.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(20)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { SheetClose() } }
        }
        .presentationDragIndicator(.visible)
        .task { await pro.loadProduct() }
    }

    private func benefit(_ symbol: String, _ title: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 20))
                .foregroundStyle(Color.blue)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                Text(text).font(.subheadline).foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
