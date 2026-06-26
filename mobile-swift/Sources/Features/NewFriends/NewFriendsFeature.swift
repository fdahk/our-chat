import ComposableArchitecture
import Foundation

// 新的朋友:展示我收到(pending)/发出(sent)/已成(accepted)的好友关系,可接受 pending 请求。
@Reducer
struct NewFriendsFeature {
    @ObservableState
    struct State: Equatable {
        var requests: [FriendRequest] = []
        var isLoading = false
    }

    enum Action {
        case onAppear
        case requestsResponse([FriendRequest])
        case acceptTapped(peerId: Int)
        case accepted(peerId: Int)
    }

    @Dependency(\.friendRequestClient) var friendRequestClient

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .onAppear:
                state.isLoading = true
                return .run { send in
                    let requests = try await friendRequestClient.list()
                    await send(.requestsResponse(requests))
                } catch: { _, send in
                    await send(.requestsResponse([]))
                }

            case let .requestsResponse(requests):
                state.isLoading = false
                state.requests = requests
                return .none

            case let .acceptTapped(peerId):
                return .run { send in
                    try await friendRequestClient.reply(peerId, true)
                    await send(.accepted(peerId: peerId))
                } catch: { _, _ in
                    // 接受失败保持原状,可重试。
                }

            case let .accepted(peerId):
                // 本地把该请求标为已接受(已是好友),无需整列重拉。
                if let index = state.requests.firstIndex(where: { $0.peerId == peerId }) {
                    let old = state.requests[index]
                    state.requests[index] = FriendRequest(
                        peerId: old.peerId, username: old.username, avatarURL: old.avatarURL, status: .accepted
                    )
                }
                return .none
            }
        }
    }
}
