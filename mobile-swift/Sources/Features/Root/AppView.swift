import ComposableArchitecture
import SwiftUI

struct AppView: View {
    @Bindable var store: StoreOf<RootFeature>

    var body: some View {
        switch store.state {
        case .loading:
            ProgressView()
                .task {
                    store.send(.onAppear)
                }

        case .login:
            if let loginStore = store.scope(state: \.login, action: \.login) {
                LoginView(store: loginStore)
            }

        case .main:
            if let mainStore = store.scope(state: \.main, action: \.main) {
                MainView(store: mainStore)
            }
        }
    }
}

#Preview {
    AppView(
        store: Store(initialState: RootFeature.State()) {
            RootFeature()
        }
    )
}
