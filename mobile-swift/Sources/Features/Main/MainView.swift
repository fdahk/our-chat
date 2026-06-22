import ComposableArchitecture
import SwiftUI

struct MainView: View {
    let store: StoreOf<MainFeature>

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 56))
                    .foregroundStyle(.green)
                Text("已登录")
                    .font(.title2.weight(.semibold))
                Text("聊天功能开发中")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .navigationTitle("OurChat")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("退出登录") {
                        store.send(.logoutButtonTapped)
                    }
                }
            }
        }
    }
}

#Preview {
    MainView(
        store: Store(initialState: MainFeature.State()) {
            MainFeature()
        }
    )
}
