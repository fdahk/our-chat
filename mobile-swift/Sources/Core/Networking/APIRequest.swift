import Foundation

struct APIRequest: Sendable, Equatable {
    enum Method: String, Sendable, Equatable {
        case get = "GET"
        case post = "POST"
        case put = "PUT"
        case patch = "PATCH"
        case delete = "DELETE"
    }

    var method: Method
    var path: String
    var query: [URLQueryItem]
    var headers: [String: String]
    var body: Data?

    init(
        method: Method = .get,
        path: String,
        query: [URLQueryItem] = [],
        headers: [String: String] = [:],
        body: Data? = nil
    ) {
        self.method = method
        self.path = path
        self.query = query
        self.headers = headers
        self.body = body
    }
}

extension APIRequest {
    static func get(_ path: String, query: [URLQueryItem] = []) -> APIRequest {
        APIRequest(method: .get, path: path, query: query)
    }

    static func post(
        _ path: String,
        json body: some Encodable,
        encoder: JSONEncoder = JSONEncoder()
    ) throws -> APIRequest {
        APIRequest(
            method: .post,
            path: path,
            headers: ["Content-Type": "application/json"],
            body: try encoder.encode(body)
        )
    }

    static func put(
        _ path: String,
        json body: some Encodable,
        encoder: JSONEncoder = JSONEncoder()
    ) throws -> APIRequest {
        APIRequest(
            method: .put,
            path: path,
            headers: ["Content-Type": "application/json"],
            body: try encoder.encode(body)
        )
    }
}
