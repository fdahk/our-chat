import Foundation

struct APIEnvironment: Sendable, Equatable {
    var baseURLString: String
}

extension APIEnvironment {
    static let dev = APIEnvironment(baseURLString: "http://localhost:3007")
}
