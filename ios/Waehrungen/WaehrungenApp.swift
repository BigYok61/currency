import SwiftUI
import UIKit

@main
struct WaehrungenApp: App {
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
                .task { await store.reload() }
        }
    }
}
