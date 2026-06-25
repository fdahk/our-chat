import Foundation

// 一条聊天消息(GET /user/messages 走 prisma,camelCase)。是否"我发的"由上层比对 currentUserId 决定。
struct ChatMessage: Identifiable, Equatable, Sendable {
    let id: Int
    let conversationId: String
    let senderId: Int
    let seq: Int?
    let content: String
    let type: String
    let timestamp: Date?
    let clientMsgId: String?
}
