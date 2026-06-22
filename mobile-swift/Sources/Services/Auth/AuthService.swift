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

private struct RefreshBody: Encodable {
    var refreshToken: String
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
            let tokens = try await apiClient.send(request, decoding: AuthTokens.self)
            try keychain.save(tokens.accessToken, .accessToken)
            try keychain.save(tokens.refreshToken, .refreshToken)
            return tokens
        },
        refresh: {
            @Dependency(\.baseAPIClient) var apiClient
            @Dependency(\.keychain) var keychain
            guard let refreshToken = try keychain.load(.refreshToken) else {
                throw AuthError.notAuthenticated
            }
            let request = try APIRequest.post("/oauth/refresh", json: RefreshBody(refreshToken: refreshToken))
            let tokens = try await apiClient.send(request, decoding: AuthTokens.self)
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
