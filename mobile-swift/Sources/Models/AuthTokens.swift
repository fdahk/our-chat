import Foundation

struct AuthTokens: Codable, Equatable, Sendable {
    var accessToken: String
    var refreshToken: String
}
