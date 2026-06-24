import ComposableArchitecture
import Foundation

@Reducer
struct ContactsFeature {
    @ObservableState
    struct State: Equatable {
        var contacts: [Contact] = []
        var isLoading = false
    }

    enum Action {
        case onAppear
        case contactsResponse([Contact])
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
            }
        }
    }
}
