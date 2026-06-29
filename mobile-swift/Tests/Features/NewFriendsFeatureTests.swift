import ComposableArchitecture
import Foundation
import Testing
@testable import OurChat

@MainActor
struct NewFriendsFeatureTests {
    @Test
    func onAppearLoadsRequests() async {
        let requests = [
            FriendRequest(peerId: 2, username: "段宇皓", avatarURL: nil, status: .pending),
            FriendRequest(peerId: 3, username: "王博扬", avatarURL: nil, status: .sent),
        ]
        let store = TestStore(initialState: NewFriendsFeature.State()) {
            NewFriendsFeature()
        } withDependencies: {
            $0.friendRequestClient.list = { requests }
        }
        await store.send(.onAppear) { $0.isLoading = true }
        await store.receive(\.requestsResponse) {
            $0.isLoading = false
            $0.requests = requests
        }
    }

    @Test
    func acceptRepliesAndMarksAccepted() async {
        let requests = [
            FriendRequest(peerId: 2, username: "段宇皓", avatarURL: nil, status: .pending),
        ]
        let store = TestStore(initialState: NewFriendsFeature.State(requests: requests)) {
            NewFriendsFeature()
        } withDependencies: {
            $0.friendRequestClient.reply = { _, _ in }
        }
        await store.send(.acceptTapped(peerId: 2))
        await store.receive(\.accepted) {
            $0.requests[0] = FriendRequest(peerId: 2, username: "段宇皓", avatarURL: nil, status: .accepted)
        }
    }
}
