import Foundation

enum APIError: Error, Equatable, Sendable {
    case invalidURL
    case transport(message: String)
    case unauthorized
    case http(status: Int, body: Data?)
    case decoding(message: String)
}
