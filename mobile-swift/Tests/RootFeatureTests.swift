import ComposableArchitecture
import Testing
@testable import OurChat

@MainActor
struct RootFeatureTests {
    @Test
    func initialStateIsEmpty() async {
        let store = TestStore(initialState: RootFeature.State()) {
            RootFeature()
        }
        #expect(store.state == RootFeature.State())
    }
}
