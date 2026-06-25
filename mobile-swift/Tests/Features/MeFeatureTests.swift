import ComposableArchitecture
import Foundation
import Testing
@testable import OurChat

@MainActor
struct MeFeatureTests {
    @Test
    func onAppearLoadsProfile() async {
        let profile = MeProfile(name: "尼奥", wxid: "7", avatarURL: nil, friendCount: 3)
        let store = TestStore(initialState: MeFeature.State()) {
            MeFeature()
        } withDependencies: {
            $0.meClient.profile = { profile }
        }
        await store.send(.onAppear)
        await store.receive(\.profileResponse) {
            $0.profile = profile
        }
    }

    @Test
    func logoutTappedEmitsDelegate() async {
        let store = TestStore(initialState: MeFeature.State()) {
            MeFeature()
        }
        await store.send(.logoutTapped)
        await store.receive(\.delegate)
    }
}
