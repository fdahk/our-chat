import Dependencies
import DependenciesMacros
import Foundation
import SocketIO

// 待发送的一条消息(上行 message.send)。senderId 由服务端以握手身份为准,故不带。
struct OutgoingMessage: Equatable, Sendable {
    var conversationId: String
    var clientMsgId: String
    var content: String
    var type: String = "text"
}

// 实时通道:一条共享 socket.io 长连接,收发聊天消息。
// connect 幂等(已连则忽略),token 取 Keychain 里的 accessToken,作为握手 auth 上报,
// 与服务端 extractHandshakeToken(handshake.auth.token) 对齐。incomingMessages 多订阅者各取一份。
@DependencyClient
struct SocketClient: Sendable {
    var connect: @Sendable () -> Void
    var disconnect: @Sendable () -> Void
    var send: @Sendable (_ message: OutgoingMessage) -> Void
    var incomingMessages: @Sendable () -> AsyncStream<ChatMessage> = { .finished }
}

extension SocketClient: DependencyKey {
    static let liveValue: SocketClient = {
        let connection = SocketConnection(baseURL: URL(string: APIEnvironment.dev.baseURLString)!)
        return SocketClient(
            connect: {
                @Dependency(\.keychain) var keychain
                guard let token = (try? keychain.load(.accessToken)) ?? nil else { return }
                Task { await connection.connect(token: token) }
            },
            disconnect: { Task { await connection.disconnect() } },
            send: { message in Task { await connection.send(message) } },
            incomingMessages: {
                let (stream, continuation) = AsyncStream<ChatMessage>.makeStream()
                Task { await connection.subscribe(continuation) }
                return stream
            }
        )
    }()

    static let previewValue = SocketClient(
        connect: {},
        disconnect: {},
        send: { _ in },
        incomingMessages: { .finished }
    )
}

extension DependencyValues {
    var socketClient: SocketClient {
        get { self[SocketClient.self] }
        set { self[SocketClient.self] = newValue }
    }
}

// 进程内单例连接:非 Sendable 的 SocketManager/SocketIOClient 全程被 actor 隔离持有,
// receiveMessage 回调里同步解析成 Sendable 的 ChatMessage 再扇出给各订阅者。
private actor SocketConnection {
    private let baseURL: URL
    private var manager: SocketManager?
    private var socket: SocketIOClient?
    private var subscribers: [UUID: AsyncStream<ChatMessage>.Continuation] = [:]

    init(baseURL: URL) { self.baseURL = baseURL }

    func connect(token: String) {
        guard socket == nil else { return }
        let manager = SocketManager(
            socketURL: baseURL,
            config: [.log(false), .forceWebsockets(true), .reconnects(true)]
        )
        let socket = manager.defaultSocket
        socket.on("receiveMessage") { [weak self] data, _ in
            guard let self, let first = data.first,
                  let message = SocketMessageParser.parse(first) else { return }
            Task { await self.emit(message) }
        }
        socket.connect(withPayload: ["token": token])
        self.manager = manager
        self.socket = socket
    }

    func disconnect() {
        socket?.disconnect()
        socket = nil
        manager = nil
    }

    func send(_ message: OutgoingMessage) {
        socket?.emit("message.send", [
            "clientMsgId": message.clientMsgId,
            "conversationId": message.conversationId,
            "content": message.content,
            "type": message.type,
        ])
    }

    func subscribe(_ continuation: AsyncStream<ChatMessage>.Continuation) {
        let id = UUID()
        subscribers[id] = continuation
        continuation.onTermination = { [weak self] _ in
            Task { await self?.unsubscribe(id) }
        }
    }

    private func unsubscribe(_ id: UUID) { subscribers[id] = nil }

    private func emit(_ message: ChatMessage) {
        for continuation in subscribers.values { continuation.yield(message) }
    }
}

// 把 socket.io 投递的 receiveMessage 原始字典解析成领域消息(纯函数,可单测)。
// id/seq 经服务端 BigInt→Number 序列化,这里按 NSNumber/Int/String 多形态兜底取整。
enum SocketMessageParser {
    static func parse(_ raw: Any) -> ChatMessage? {
        guard let dict = raw as? [String: Any],
              let conversationId = dict["conversationId"] as? String,
              let serverId = intValue(dict["id"]) else { return nil }
        return ChatMessage(
            serverId: serverId,
            conversationId: conversationId,
            senderId: intValue(dict["senderId"]) ?? 0,
            seq: intValue(dict["seq"]),
            content: dict["content"] as? String ?? "",
            type: dict["type"] as? String ?? "text",
            timestamp: ConversationAssembler.parseISO(dict["timestamp"] as? String),
            clientMsgId: dict["clientMsgId"] as? String
        )
    }

    static func intValue(_ any: Any?) -> Int? {
        switch any {
        case let n as Int: return n
        case let n as NSNumber: return n.intValue
        case let s as String: return Int(s)
        default: return nil
        }
    }
}
