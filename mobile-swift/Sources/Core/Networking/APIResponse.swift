import Foundation

// our-chat REST 统一信封:{ success, data, message }。
struct APIResponse<T: Decodable>: Decodable {
    let success: Bool
    let data: T?
    let message: String?
}

extension APIClient {
    // 解信封并取出 data;success=false 或 data 缺失则抛 server 错误(带服务端 message)。
    // 所有领域接口(好友/会话/消息…)统一走这个,避免每处重复解信封。
    func sendUnwrapping<T: Decodable>(
        _ request: APIRequest,
        as _: T.Type,
        decoder: JSONDecoder = JSONDecoder()
    ) async throws -> T {
        let envelope = try await send(request, decoding: APIResponse<T>.self, decoder: decoder)
        guard envelope.success, let data = envelope.data else {
            throw APIError.server(message: envelope.message ?? "请求失败")
        }
        return data
    }
}
