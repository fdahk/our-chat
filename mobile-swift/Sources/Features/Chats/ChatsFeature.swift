import ComposableArchitecture
import Foundation

@Reducer
struct ChatsFeature {
    @ObservableState
    struct State: Equatable {
        var conversations: [Conversation] = []
        var otherDeviceCount = 0
        var isLoading = false
        // 搜索页(全屏覆盖呈现)。
        @Presents var search: SearchFeature.State?
        // 导航栈:点会话推入聊天详情页。
        var path = StackState<ChatDetailFeature.State>()
    }

    enum Action: BindableAction {
        case binding(BindingAction<State>)
        case onAppear
        case conversationsResponse([Conversation], deviceCount: Int)
        case conversationTapped(Conversation)
        case searchButtonTapped
        case search(PresentationAction<SearchFeature.Action>)
        case path(StackActionOf<ChatDetailFeature>)
    }

    @Dependency(\.chatClient) var chatClient

    var body: some ReducerOf<Self> {
        BindingReducer()
        Reduce { state, action in
            switch action {
            case .onAppear:
                guard state.conversations.isEmpty else { return .none }
                state.isLoading = true
                return .run { send in
                    let conversations = try await chatClient.conversations()
                    let deviceCount = try await chatClient.otherDeviceCount()
                    await send(.conversationsResponse(conversations, deviceCount: deviceCount))
                } catch: { _, send in
                    // 拉取失败:收敛到空态,不让 loading 卡死(样本数据不会触发,真实接入后兜底)。
                    await send(.conversationsResponse([], deviceCount: 0))
                }

            case let .conversationsResponse(conversations, deviceCount):
                state.isLoading = false
                state.conversations = conversations
                state.otherDeviceCount = deviceCount
                return .none

            case let .conversationTapped(conversation):
                state.path.append(
                    ChatDetailFeature.State(conversationId: conversation.id, title: conversation.title)
                )
                return .none

            case .searchButtonTapped:
                state.search = SearchFeature.State()
                return .none

            case .search(.presented(.delegate(.close))):
                state.search = nil
                return .none

            case .binding, .path, .search:
                return .none
            }
        }
        .ifLet(\.$search, action: \.search) {
            SearchFeature()
        }
        .forEach(\.path, action: \.path) {
            ChatDetailFeature()
        }
    }
}
