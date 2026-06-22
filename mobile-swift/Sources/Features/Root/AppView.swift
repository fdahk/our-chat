import ComposableArchitecture
import SwiftUI

struct AppView: View {
    let store: StoreOf<RootFeature>

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "bubble.left.and.bubble.right.fill")
                .font(.system(size: 48))
                .foregroundStyle(.tint)
            Text("OurChat")
                .font(.title2.weight(.semibold))
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
