import Foundation

// 文件/图片消息附带的文件信息(线上 camelCase:fileName/fileSize/fileUrl)。
struct MessageFileInfo: Equatable, Sendable {
    var fileName: String
    var fileSize: Int
    var fileUrl: String
}

// 一条聊天消息(GET /user/messages 走 prisma,camelCase)。是否"我发的"由上层比对 currentUserId 决定。
struct ChatMessage: Identifiable, Equatable, Sendable {
    // 服务端 message.id;乐观发送(尚无回执)时为 0,收到 receiveMessage/ack 后回填真值。
    let serverId: Int
    let conversationId: String
    let senderId: Int
    let seq: Int?
    let content: String
    let type: String
    let timestamp: Date?
    // 客户端幂等键:乐观消息与服务端回显共用同键,用于去重/替换。
    let clientMsgId: String?
    // type=file 时携带文件名/大小/地址,供气泡渲染。
    var fileInfo: MessageFileInfo? = nil

    // 列表稳定标识:优先 clientMsgId(乐观消息与其回显同键,替换不抖动),否则退回服务端 id。
    var id: String { clientMsgId ?? "srv-\(serverId)" }
}
