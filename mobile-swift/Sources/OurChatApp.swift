import ComposableArchitecture
import SwiftUI

@main
struct OurChatApp: App {
    @MainActor static let store = Store(initialState: RootFeature.State()) {
        RootFeature()
    }

    var body: some Scene {
        WindowGroup {
            AppView(store: Self.store)
        }
    }
}
