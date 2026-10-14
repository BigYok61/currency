import SwiftUI
import UIKit
import UserNotifications

@main
struct WaehrungenApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var store = RatesStore()

    init() {
        let blue = UIColor(red: 0, green: 122.0 / 255.0, blue: 1, alpha: 1)
        UISegmentedControl.appearance().selectedSegmentTintColor = blue
        UISegmentedControl.appearance().setTitleTextAttributes([.foregroundColor: UIColor.white], for: .selected)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .task {
                    appDelegate.store = store
                    await store.refreshPushAuthorization()
                    #if DEBUG
                    if let shot = ScreenshotMode.shot {
                        store.showChart = true; store.showCompare = true; store.showIntervals = true
                        _ = shot
                    }
                    #endif
                    await store.reload()
                    #if DEBUG
                    if ScreenshotMode.shot == "intervals" { store.dayOffset = 1 }
                    #endif
                }
                // widget taps open the app (waehrungen://currency/<code>); the list itself is the destination
                .onOpenURL { _ in }
                #if DEBUG
                .task {
                    if UserDefaults.standard.bool(forKey: "wuWidgetShots") { await WidgetSnapshots.render() }
                }
                #endif
                .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
                    Task { await store.refreshPushAuthorization() }
                }
        }
    }
}

/// APNs registration callbacks and foreground presentation.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    weak var store: RatesStore?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        store?.didRegisterPushToken(deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("APNs-Registrierung fehlgeschlagen: \(error.localizedDescription)")
    }

    /// FX alarms also show while the app is open: banner with sound.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }
}

#if DEBUG
/// DEBUG-only: `-wuShot overview|detail|intervals|alerts|compare` opens a screen for App Store screenshots.
enum ScreenshotMode {
    static let shot: String? = UserDefaults.standard.string(forKey: "wuShot")
    static func wait() async { try? await Task.sleep(nanoseconds: 5_000_000_000) }
}
#endif

#if DEBUG
/// DEBUG-only: `-wuWidgetShots YES` renders the widget layouts with live data into Documents/widget_*.png.
@MainActor
enum WidgetSnapshots {
    static func render() async {
        let shared = WidgetShared.read()
        let snap = await WFetch.load(base: shared.base, codes: shared.foreign)
        let code = shared.foreign.first ?? "EUR"
        let cards: [(String, AnyView, CGSize, Bool)] = [
            ("small_single", AnyView(SingleCurrencyView(snap: snap, code: code, colorIndex: 0)), CGSize(width: 170, height: 170), false),
            ("small_triple", AnyView(TripleCurrencyView(snap: snap)), CGSize(width: 170, height: 170), false),
            ("medium", AnyView(MediumOverviewView(snap: snap)), CGSize(width: 364, height: 170), false),
            ("large", AnyView(LargeOverviewView(snap: snap)), CGSize(width: 364, height: 382), false),
            ("lock", AnyView(LockRectView(snap: snap)), CGSize(width: 172, height: 76), true),
        ]
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        for (name, view, size, lock) in cards {
            let pad: CGFloat = lock ? 8 : 16
            let card = view
                .padding(pad)
                .frame(width: size.width, height: size.height)
                .background(lock ? Color.white.opacity(0.18) : Color.white, in: RoundedRectangle(cornerRadius: lock ? 14 : 22))
                .foregroundStyle(lock ? Color.white : Color.primary)
                .environment(\.colorScheme, lock ? .dark : .light)
                .padding(20)
                .background(LinearGradient(colors: [Color(red: 0.25, green: 0.35, blue: 0.7), Color(red: 0.7, green: 0.35, blue: 0.6)], startPoint: .top, endPoint: .bottom))
            let renderer = ImageRenderer(content: card)
            renderer.scale = 3
            if let data = renderer.uiImage?.pngData() {
                try? data.write(to: dir.appendingPathComponent("widget_\(name).png"))
            }
        }
        try? "done".write(to: dir.appendingPathComponent("widget_done.txt"), atomically: true, encoding: .utf8)
    }
}
#endif
