import ComposableArchitecture
import Testing
@testable import OurChat

@MainActor
struct ChatDetailFeatureTests {
    @Test
    func onAppearLoadsHistoryAndCurrentUser() async {
        let history = [
            ChatMessage(id: 1, conversationId: "single_1_2", senderId: 2, seq: 1, content: "hi", type: "text", timestamp: nil, clientMsgId: nil),
            ChatMessage(id: 2, conversationId: "single_1_2", senderId: 1, seq: 2, content: "yo", type: "text", timestamp: nil, clientMsgId: nil),
        ]
        let store = TestStore(
            initialState: ChatDetailFeature.State(conversationId: "single_1_2", title: "段宇皓")
        ) {
            ChatDetailFeature()
        } withDependencies: {
            $0.chatClient.messages = { _ in history }
            $0.sessionClient.currentUserId = { 1 }
        }
        await store.send(.onAppear) {
            $0.currentUserId = 1
            $0.isLoading = true
        }
        await store.receive(\.messagesResponse) {
            $0.isLoading = false
            $0.messages = history
        }
    }
}
