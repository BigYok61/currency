import SwiftUI

@main
struct WaehrungenApp: App {
    @StateObject private var store = RatesStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .task { await store.reload() }
        }
    }
}
