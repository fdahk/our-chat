import ComposableArchitecture
import SwiftUI

struct AppView: View {
    @Bindable var store: StoreOf<RootFeature>
    // 外观设置:全 App 根部统一应用,SettingsView 写同一 key 即可一键切换。
    @AppStorage("appearanceMode") private var appearance: AppearanceMode = .system

    var body: some View {
        content
            .preferredColorScheme(appearance.colorScheme)
    }

    @ViewBuilder private var content: some View {
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
