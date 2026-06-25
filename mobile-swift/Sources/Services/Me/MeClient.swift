import Dependencies
import DependenciesMacros
import Foundation

// 「我」页数据源:GET /user/profile 取当前用户资料,好友数复用 ContactsClient。
// previewValue 用样本供 SwiftUI 预览离线渲染。
@DependencyClient
struct MeClient: Sendable {
    var profile: @Sendable () async throws -> MeProfile
}

// GET /user/profile 回的当前用户(authenticateToken 选出的字段,camelCase)。
private struct ProfileDTO: Decodable {
    let id: Int
    let username: String
    let nickname: String?
    let avatar: String?
}

extension MeClient: DependencyKey {
    static let liveValue = MeClient(
        profile: {
            @Dependency(\.apiClient) var apiClient
            @Dependency(\.contactsClient) var contactsClient
            // 绑成本地 Sendable 值,供并发 async let 安全捕获。
            let client = apiClient
            let contacts = contactsClient

            async let profileTask = client.sendUnwrapping(APIRequest.get("/user/profile"), as: ProfileDTO.self)
            async let friendsTask = contacts.contacts()
            let (dto, friends) = try await (profileTask, friendsTask)

            let nickname = dto.nickname ?? ""
            return MeProfile(
                name: nickname.isEmpty ? dto.username : nickname,
                wxid: String(dto.id), // 微信号即数字 id
                avatarURL: dto.avatar.flatMap(URL.init(string:)),
                friendCount: friends.count
            )
        }
    )

    static let previewValue = MeClient(profile: { .sample })
}

extension DependencyValues {
    var meClient: MeClient {
        get { self[MeClient.self] }
        set { self[MeClient.self] = newValue }
    }
}
