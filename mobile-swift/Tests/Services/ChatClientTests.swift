import Dependencies
import Foundation
import Testing
@testable import OurChat

struct ChatClientTests {
    @Test
    func assemblerResolvesSingleAndGroup() {
        let friends = ["2": Contact(id: "2", name: "段宇皓", avatarURL: URL(string: "https://x/a.png"), sectionKey: "D")]
        let result = ConversationAssembler.assemble(
            userConvs: [
                .init(conversationId: "single_1_2", unreadCount: 3, isMuted: false, lastActivity: nil),
                .init(conversationId: "group_9", unreadCount: 5, isMuted: true, lastActivity: nil),
            ],
            metas: ["group_9": .init(convType: "group", title: "线代群", avatar: nil)],
            lasts: [
                "single_1_2": .init(content: "OK", type: "text", timestamp: nil),
                "group_9": .init(content: nil, type: "image", timestamp: nil),
            ],
            friends: friends,
            myUserId: 1
        )

        let single = result.first { $0.id == "single_1_2" }
        #expect(single?.title == "段宇皓") // 单聊取另一方好友名
        #expect(single?.preview == "OK")
        #expect(single?.unreadCount == 3)
        #expect(single?.isGroup == false)
        #expect(single?.avatarURL == URL(string: "https://x/a.png"))

        let group = result.first { $0.id == "group_9" }
        #expect(group?.title == "线代群")
        #expect(group?.isGroup == true)
        #expect(group?.preview == "[图片]")
        #expect(group?.unreadCount == 0) // 免打扰 → 不显示数字
        #expect(group?.hasRedDot == true) // 免打扰 + 有未读 → 红点
    }

    @Test
    func liveAggregatesThreeEndpoints() async throws {
        let userConvs = #"{"success":true,"data":[{"conversationId":"single_1_2","unreadCount":1,"isMuted":false}]}"#
        let convs = #"{"success":true,"data":{"single_1_2":{"convType":"single"}}}"#
        let lasts = #"{"success":true,"data":{"single_1_2":{"content":"hi","type":"text"}}}"#
        try await withDependencies {
            $0.sessionClient.currentUserId = { 1 }
            $0.contactsClient.contacts = { [Contact(id: "2", name: "段宇皓", avatarURL: nil, sectionKey: "D")] }
            $0.apiClient.perform = { request in
                if request.path.contains("userConversations") { return Data(userConvs.utf8) }
                if request.path.contains("lastMessages") { return Data(lasts.utf8) }
                if request.path.contains("conversations") { return Data(convs.utf8) }
                return Data(#"{"success":true,"data":{}}"#.utf8)
            }
        } operation: {
            let result = try await ChatClient.liveValue.conversations()
            #expect(result.count == 1)
            #expect(result.first?.title == "段宇皓")
            #expect(result.first?.preview == "hi")
            #expect(result.first?.unreadCount == 1)
        }
    }

    @Test
    func messagesDecodesHistory() async throws {
        let json = #"{"success":true,"data":[{"id":1,"conversationId":"single_1_2","senderId":2,"seq":5,"content":"hi","type":"text","clientMsgId":"c1"}]}"#
        try await withDependencies {
            $0.apiClient.perform = { _ in Data(json.utf8) }
        } operation: {
            let messages = try await ChatClient.liveValue.messages("single_1_2")
            #expect(messages.count == 1)
            #expect(messages.first?.serverId == 1)
            #expect(messages.first?.senderId == 2)
            #expect(messages.first?.content == "hi")
            #expect(messages.first?.type == "text")
        }
    }

    @Test
    func messagesDecodesFileInfoWithStringSize() async throws {
        // fileSize 以字符串下发(int64 线上常为 string)也要能解。
        let json = #"{"success":true,"data":[{"id":5,"conversationId":"single_1_2","senderId":2,"type":"file","content":"[文件]","fileInfo":{"fileName":"a.pdf","fileSize":"4096","fileUrl":"https://cdn/a.pdf"}}]}"#
        try await withDependencies {
            $0.apiClient.perform = { _ in Data(json.utf8) }
        } operation: {
            let messages = try await ChatClient.liveValue.messages("single_1_2")
            #expect(messages.first?.type == "file")
            #expect(messages.first?.fileInfo?.fileName == "a.pdf")
            #expect(messages.first?.fileInfo?.fileSize == 4096)
            #expect(messages.first?.fileInfo?.fileUrl == "https://cdn/a.pdf")
        }
    }
}
