import ComposableArchitecture
import Foundation

@Reducer
struct ContactsFeature {
    @ObservableState
    struct State: Equatable {
        var contacts: [Contact] = []
        var isLoading = false
        // 「新的朋友」页(导航推入)。
        @Presents var newFriends: NewFriendsFeature.State?
    }

    enum Action {
        case onAppear
        case contactsResponse([Contact])
        case newFriendsTapped
        case newFriends(PresentationAction<NewFriendsFeature.Action>)
    }

    @Dependency(\.contactsClient) var contactsClient

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .onAppear:
                guard state.contacts.isEmpty else { return .none }
                state.isLoading = true
                return .run { send in
                    let contacts = try await contactsClient.contacts()
                    await send(.contactsResponse(contacts))
                } catch: { _, send in
                    await send(.contactsResponse([]))
                }

            case let .contactsResponse(contacts):
                state.isLoading = false
                state.contacts = contacts
                return .none

            case .newFriendsTapped:
                state.newFriends = NewFriendsFeature.State()
                return .none

            case .newFriends:
                return .none
            }
        }
        .ifLet(\.$newFriends, action: \.newFriends) {
            NewFriendsFeature()
        }
    }
}
