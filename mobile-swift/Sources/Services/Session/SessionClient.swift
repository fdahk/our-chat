import Dependencies
import DependenciesMacros
import Foundation

// 当前会话:从 Keychain 里的 JWT 解出当前用户 id。好友/会话/消息等接口都要带 userId,统一从这里取。
@DependencyClient
struct SessionClient: Sendable {
    var currentUserId: @Sendable () -> Int?
}

extension SessionClient: DependencyKey {
    static let liveValue = SessionClient(
        currentUserId: {
            @Dependency(\.keychain) var keychain
            guard let token = (try? keychain.load(.accessToken)) ?? nil else { return nil }
            return JWT.decodeUserId(token)
        }
    )
}

extension DependencyValues {
    var sessionClient: SessionClient {
        get { self[SessionClient.self] }
        set { self[SessionClient.self] = newValue }
    }
}
