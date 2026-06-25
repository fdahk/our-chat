import ComposableArchitecture
import Foundation

// 聊天详情:加载历史消息(REST)+ 实时收发(socket)。
// 发送走乐观更新(先本地插一条,再 emit),服务端回显的 receiveMessage 按 clientMsgId 替换回填真实 id/seq。
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
        case sendButtonTapped
        case messageReceived(ChatMessage)
        case delegate(Delegate)

        enum Delegate: Equatable {
            // 本会话已读至 uptoSeq:父 reducer 据此清列表未读角标。
            case didRead(conversationId: String, uptoSeq: Int)
        }
    }

    @Dependency(\.chatClient) var chatClient
    @Dependency(\.sessionClient) var sessionClient
    @Dependency(\.socketClient) var socketClient
    @Dependency(\.uuid) var uuid
    @Dependency(\.date) var date

    private enum CancelID { case incoming }

    var body: some ReducerOf<Self> {
        BindingReducer()
        Reduce { state, action in
            switch action {
            case .onAppear:
                state.currentUserId = sessionClient.currentUserId() ?? 0
                state.isLoading = true
                let conversationId = state.conversationId
                return .merge(
                    .run { send in
                        let messages = try await chatClient.messages(conversationId)
                        await send(.messagesResponse(messages))
                    } catch: { _, send in
                        await send(.messagesResponse([]))
                    },
                    .run { send in
                        socketClient.connect()
                        for await message in socketClient.incomingMessages() {
                            await send(.messageReceived(message))
                        }
                    }
                    .cancellable(id: CancelID.incoming, cancelInFlight: true)
                )

            case let .messagesResponse(messages):
                state.isLoading = false
                state.messages = messages
                return markRead(conversationId: state.conversationId, messages: messages)

            case .sendButtonTapped:
                let content = state.draft.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !content.isEmpty else { return .none }
                let outgoing = OutgoingMessage(
                    conversationId: state.conversationId,
                    clientMsgId: uuid().uuidString,
                    content: content
                )
                let optimistic = ChatMessage(
                    serverId: 0,
                    conversationId: outgoing.conversationId,
                    senderId: state.currentUserId,
                    seq: nil,
                    content: content,
                    type: outgoing.type,
                    timestamp: date.now,
                    clientMsgId: outgoing.clientMsgId
                )
                mergeMessage(into: &state.messages, optimistic)
                state.draft = ""
                return .run { _ in socketClient.send(outgoing) }

            case let .messageReceived(message):
                guard message.conversationId == state.conversationId else { return .none }
                mergeMessage(into: &state.messages, message)
                // 对方发来的消息:页面在前台即视为已读,上报并清角标。自己的回显不触发。
                guard message.senderId != state.currentUserId else { return .none }
                return markRead(conversationId: state.conversationId, messages: state.messages)

            case .binding, .delegate:
                return .none
            }
        }
    }

    // 取已加载消息的最大 seq 作为已读位点:socket 上报 + 通知父清未读。无 seq(纯乐观)则不发。
    private func markRead(conversationId: String, messages: [ChatMessage]) -> Effect<Action> {
        guard let uptoSeq = messages.compactMap(\.seq).max(), uptoSeq > 0 else { return .none }
        return .merge(
            .run { _ in socketClient.reportRead(conversationId, uptoSeq) },
            .send(.delegate(.didRead(conversationId: conversationId, uptoSeq: uptoSeq)))
        )
    }
}

// 去重合并:优先按 clientMsgId 命中(乐观消息被服务端回显替换),否则按 serverId 命中,都不中则追加。
private func mergeMessage(into messages: inout [ChatMessage], _ message: ChatMessage) {
    if let clientMsgId = message.clientMsgId,
       let index = messages.firstIndex(where: { $0.clientMsgId == clientMsgId }) {
        messages[index] = message
    } else if message.serverId != 0,
              let index = messages.firstIndex(where: { $0.serverId == message.serverId }) {
        messages[index] = message
    } else {
        messages.append(message)
    }
}
