import ComposableArchitecture
import Foundation

// 聊天详情:加载历史消息(REST)。实时收发(socket)在 M4b 接入。
@Reducer
struct ChatDetailFeature {
    @ObservableState
    struct State: Equatable {
        let conversationId: String
        var title: String
        var messages: [ChatMessage] = []
        var currentUserId: Int = 0
        var isLoading = false
        var draft = ""
    }

    enum Action: BindableAction {
        case binding(BindingAction<State>)
        case onAppear
        case messagesResponse([ChatMessage])
    }

    @Dependency(\.chatClient) var chatClient
    @Dependency(\.sessionClient) var sessionClient

    var body: some ReducerOf<Self> {
        BindingReducer()
        Reduce { state, action in
            switch action {
            case .onAppear:
                state.currentUserId = sessionClient.currentUserId() ?? 0
                state.isLoading = true
                let conversationId = state.conversationId
                return .run { send in
                    let messages = try await chatClient.messages(conversationId)
                    await send(.messagesResponse(messages))
                } catch: { _, send in
                    await send(.messagesResponse([]))
                }

            case let .messagesResponse(messages):
                state.isLoading = false
                state.messages = messages
                return .none

            case .binding:
                return .none
            }
        }
    }
}
