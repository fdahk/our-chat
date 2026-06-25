import Dependencies
import DependenciesMacros
import Foundation

// 搜索结果:微信「添加朋友」式精确查找(按微信号/手机号/用户名命中单个用户)。
struct SearchResult: Equatable, Sendable, Identifiable {
    var id: Int { userId }
    let userId: Int
    let username: String
    let avatarURL: URL?
    let isFriend: Bool
}

// 用户搜索:GET /searchUser。命中返回单个用户,未命中返回 nil。
@DependencyClient
struct SearchClient: Sendable {
    var search: @Sendable (_ keyword: String) async throws -> SearchResult?
}

// /searchUser 的 data:无论 success 真假都带 data(已是好友/不存在也走 success:false),
// 因此手动解信封读 data,而非 sendUnwrapping(后者 success:false 即抛)。
private struct SearchDataDTO: Decodable {
    let isFriend: Bool?
    let friendInfo: FriendInfo?

    struct FriendInfo: Decodable {
        let id: Int
        let username: String
        let avatar: String?
    }
}

extension SearchClient: DependencyKey {
    static let liveValue = SearchClient(
        search: { keyword in
            @Dependency(\.apiClient) var apiClient
            @Dependency(\.sessionClient) var session
            guard let userId = session.currentUserId() else { throw AuthError.notAuthenticated }
            let envelope = try await apiClient.send(
                APIRequest.get("/searchUser", query: [
                    URLQueryItem(name: "keyword", value: keyword),
                    URLQueryItem(name: "userId", value: String(userId)),
                ]),
                decoding: APIResponse<SearchDataDTO>.self
            )
            guard let info = envelope.data?.friendInfo else { return nil }
            return SearchResult(
                userId: info.id,
                username: info.username,
                avatarURL: info.avatar.flatMap(URL.init(string:)),
                isFriend: envelope.data?.isFriend ?? false
            )
        }
    )

    static let previewValue = SearchClient(
        search: { _ in SearchResult(userId: 1024, username: "duanyuhao", avatarURL: nil, isFriend: false) }
    )
}

extension DependencyValues {
    var searchClient: SearchClient {
        get { self[SearchClient.self] }
        set { self[SearchClient.self] = newValue }
    }
}
