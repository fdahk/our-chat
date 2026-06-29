import Dependencies
import DependenciesMacros
import Foundation

enum AuthError: Error, Equatable {
    case notAuthenticated
}

@DependencyClient
struct AuthService: Sendable {
    var login: @Sendable (_ username: String, _ password: String, _ remember: Bool) async throws -> AuthTokens
    var refresh: @Sendable () async throws -> AuthTokens
    var logout: @Sendable () async throws -> Void
}

private struct LoginBody: Encodable {
    var username: String
    var password: String
    var remember: Bool
}

// 服务端 /api/login、/api/refresh 的 data 形如 { ...user, token }。原生端只取 token 走 Bearer。
private struct TokenData: Decodable {
    var token: String
}

extension AuthService: DependencyKey {
    static let liveValue = AuthService(
        login: { username, password, remember in
            @Dependency(\.baseAPIClient) var apiClient
            @Dependency(\.keychain) var keychain
            let request = try APIRequest.post(
                "/api/login",
                json: LoginBody(username: username, password: password, remember: remember)
            )
            let data = try await apiClient.sendUnwrapping(request, as: TokenData.self)
            // 服务端为单 JWT 模型(刷新即重签),无独立 refresh token;两处都存同一 token 以兼容 Keychain 结构。
            let tokens = AuthTokens(accessToken: data.token, refreshToken: data.token)
            try keychain.save(tokens.accessToken, .accessToken)
            try keychain.save(tokens.refreshToken, .refreshToken)
            return tokens
        },
        refresh: {
            @Dependency(\.baseAPIClient) var apiClient
            @Dependency(\.keychain) var keychain
            guard let current = try keychain.load(.accessToken) else {
                throw AuthError.notAuthenticated
            }
            // /api/refresh 接受 Bearer(免 CSRF),凭当前 token 重签。
            var request = APIRequest(method: .post, path: "/api/refresh")
            request.headers["Authorization"] = "Bearer \(current)"
            let data = try await apiClient.sendUnwrapping(request, as: TokenData.self)
            let tokens = AuthTokens(accessToken: data.token, refreshToken: data.token)
            try keychain.save(tokens.accessToken, .accessToken)
            try keychain.save(tokens.refreshToken, .refreshToken)
            return tokens
        },
        logout: {
            @Dependency(\.keychain) var keychain
            try keychain.delete(.accessToken)
            try keychain.delete(.refreshToken)
        }
    )
}

extension DependencyValues {
    var authService: AuthService {
        get { self[AuthService.self] }
        set { self[AuthService.self] = newValue }
    }
}
