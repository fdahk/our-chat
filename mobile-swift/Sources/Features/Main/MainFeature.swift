import ComposableArchitecture
import Foundation

@Reducer
struct MainFeature {
    enum Tab: Equatable {
        case chats, contacts, discover, me
    }

    @ObservableState
    struct State: Equatable {
        var selectedTab: Tab = .chats
        var chats = ChatsFeature.State()
        var contacts = ContactsFeature.State()
        var me = MeFeature.State()
    }

    enum Action: BindableAction {
        case binding(BindingAction<State>)
        case chats(ChatsFeature.Action)
        case contacts(ContactsFeature.Action)
        case me(MeFeature.Action)
        case delegate(Delegate)

        enum Delegate: Equatable {
            case loggedOut
        }
    }

    @Dependency(\.authService) var authService

    var body: some ReducerOf<Self> {
        BindingReducer()
        Scope(state: \.chats, action: \.chats) { ChatsFeature() }
        Scope(state: \.contacts, action: \.contacts) { ContactsFeature() }
        Scope(state: \.me, action: \.me) { MeFeature() }
        Reduce { _, action in
            switch action {
            case .me(.delegate(.logout)):
                // 退出登录:清本地凭据后上抛 loggedOut,由 RootFeature 切回登录页。
                return .run { send in
                    try? await authService.logout()
                    await send(.delegate(.loggedOut))
                }

            case .binding, .chats, .contacts, .me, .delegate:
                return .none
            }
        }
    }
}
