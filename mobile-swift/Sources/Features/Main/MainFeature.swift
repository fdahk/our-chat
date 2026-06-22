import ComposableArchitecture
import Foundation

@Reducer
struct MainFeature {
    @ObservableState
    struct State: Equatable {}

    enum Action: Equatable {
        case logoutButtonTapped
        case delegate(Delegate)

        enum Delegate: Equatable {
            case loggedOut
        }
    }

    @Dependency(\.authService) var authService

    var body: some ReducerOf<Self> {
        Reduce { _, action in
            switch action {
            case .logoutButtonTapped:
                return .run { send in
                    try? await authService.logout()
                    await send(.delegate(.loggedOut))
                }

            case .delegate:
                return .none
            }
        }
    }
}
