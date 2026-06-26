import ComposableArchitecture
import Testing
@testable import OurChat

@MainActor
struct ContactsFeatureTests {
    @Test
    func onAppearLoadsContacts() async {
        let sample = [
            Contact(id: "1", name: "Alice", avatarURL: nil, sectionKey: "A"),
            Contact(id: "2", name: "Bob", avatarURL: nil, sectionKey: "B"),
        ]
        let store = TestStore(initialState: ContactsFeature.State()) {
            ContactsFeature()
        } withDependencies: {
            $0.contactsClient.contacts = { sample }
        }
        await store.send(.onAppear) { $0.isLoading = true }
        await store.receive(\.contactsResponse) {
            $0.isLoading = false
            $0.contacts = sample
        }
    }

    @Test
    func onAppearNoOpWhenAlreadyLoaded() async {
        var state = ContactsFeature.State()
        state.contacts = [Contact(id: "1", name: "Alice", avatarURL: nil, sectionKey: "A")]
        let store = TestStore(initialState: state) {
            ContactsFeature()
        }
        // 已有数据 → onAppear 不再重复拉取(无后续 action)。
        await store.send(.onAppear)
    }

    @Test
    func newFriendsTappedPresentsPage() async {
        let store = TestStore(initialState: ContactsFeature.State()) {
            ContactsFeature()
        }
        await store.send(.newFriendsTapped) {
            $0.newFriends = NewFriendsFeature.State()
        }
    }
}
