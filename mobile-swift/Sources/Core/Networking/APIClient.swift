import Dependencies
import DependenciesMacros
import Foundation

@DependencyClient
struct APIClient: Sendable {
    var perform: @Sendable (_ request: APIRequest) async throws -> Data
}

extension APIClient {
    func send<Response: Decodable>(
        _ request: APIRequest,
        decoding _: Response.Type,
        decoder: JSONDecoder = JSONDecoder()
    ) async throws -> Response {
        let data = try await perform(request)
        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw APIError.decoding(message: String(describing: error))
        }
    }
}

extension APIClient {
    static func live(environment: APIEnvironment, session: URLSession = .shared) -> APIClient {
        APIClient(perform: { request in
            let urlRequest = try makeURLRequest(request, environment: environment)
            let data: Data
            let response: URLResponse
            do {
                (data, response) = try await session.data(for: urlRequest)
            } catch {
                throw APIError.transport(message: error.localizedDescription)
            }
            return try mapResponse(data: data, response: response)
        })
    }

    static func makeURLRequest(_ request: APIRequest, environment: APIEnvironment) throws -> URLRequest {
        guard var components = URLComponents(string: environment.baseURLString) else {
            throw APIError.invalidURL
        }
        let base = components.path.hasSuffix("/") ? String(components.path.dropLast()) : components.path
        let path = request.path.hasPrefix("/") ? request.path : "/" + request.path
        components.path = base + path
        if !request.query.isEmpty {
            components.queryItems = request.query
        }
        guard let url = components.url else {
            throw APIError.invalidURL
        }
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = request.method.rawValue
        urlRequest.httpBody = request.body
        for (key, value) in request.headers {
            urlRequest.setValue(value, forHTTPHeaderField: key)
        }
        return urlRequest
    }

    static func mapResponse(data: Data, response: URLResponse) throws -> Data {
        guard let http = response as? HTTPURLResponse else {
            throw APIError.transport(message: "Non-HTTP response")
        }
        switch http.statusCode {
        case 200 ..< 300:
            return data
        case 401:
            throw APIError.unauthorized
        default:
            throw APIError.http(status: http.statusCode, body: data)
        }
    }
}

extension APIClient: DependencyKey {
    static let liveValue: APIClient = {
        let coordinator = RefreshCoordinator()
        return APIClient(perform: { request in
            @Dependency(\.baseAPIClient) var base
            @Dependency(\.keychain) var keychain
            @Dependency(\.authService) var authService
            return try await authenticatedPerform(
                request,
                base: base,
                keychain: keychain,
                coordinator: coordinator,
                refresh: { _ = try await authService.refresh() },
                onRefreshFailure: { try? await authService.logout() }
            )
        })
    }()
}

extension DependencyValues {
    var apiClient: APIClient {
        get { self[APIClient.self] }
        set { self[APIClient.self] = newValue }
    }
}
