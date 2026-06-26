import ComposableArchitecture
import SwiftUI

struct NewFriendsView: View {
    let store: StoreOf<NewFriendsFeature>

    var body: some View {
        List {
            ForEach(store.requests) { request in
                RequestRow(request: request) {
                    store.send(.acceptTapped(peerId: request.peerId))
                }
                .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                .listRowBackground(WeChatColor.background)
                .listRowSeparatorTint(WeChatColor.separator)
                .alignmentGuide(.listRowSeparatorLeading) { _ in 60 }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(WeChatColor.background)
        .navigationTitle("新的朋友")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(WeChatColor.navBar, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .task { store.send(.onAppear) }
    }
}

private struct RequestRow: View {
    let request: FriendRequest
    let onAccept: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Avatar(url: request.avatarURL, size: 44)
            Text(request.username)
                .font(.system(size: 16))
                .foregroundStyle(WeChatColor.textPrimary)
                .lineLimit(1)
            Spacer()
            trailing
        }
        .padding(.vertical, 9)
    }

    @ViewBuilder private var trailing: some View {
        switch request.status {
        case .pending:
            Button(action: onAccept) {
                Text("接受")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
                    .background(WeChatColor.brand, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            }
            .buttonStyle(.plain)
        case .sent:
            statusText("等待验证")
        case .accepted:
            statusText("已添加")
        case .blocked:
            statusText("已拒绝")
        }
    }

    private func statusText(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 14))
            .foregroundStyle(WeChatColor.textSecondary)
    }
}

#Preview {
    NavigationStack {
        NewFriendsView(
            store: Store(initialState: NewFriendsFeature.State()) {
                NewFriendsFeature()
            } withDependencies: {
                $0.friendRequestClient = .previewValue
            }
        )
    }
    .preferredColorScheme(.dark)
}
