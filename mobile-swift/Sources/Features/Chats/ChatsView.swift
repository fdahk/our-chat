import ComposableArchitecture
import SwiftUI

struct ChatsView: View {
    @Bindable var store: StoreOf<ChatsFeature>

    var body: some View {
        NavigationStack(path: $store.scope(state: \.path, action: \.path)) {
            List {
                if store.otherDeviceCount > 0 {
                    DeviceBanner(count: store.otherDeviceCount)
                        .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                        .listRowBackground(WeChatColor.background)
                        .listRowSeparatorTint(WeChatColor.separator)
                        .alignmentGuide(.listRowSeparatorLeading) { _ in 60 }
                }
                ForEach(store.conversations) { conversation in
                    Button { store.send(.conversationTapped(conversation)) } label: {
                        ConversationRow(conversation: conversation)
                    }
                    .buttonStyle(.plain)
                    .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                    .listRowBackground(WeChatColor.background)
                    .listRowSeparatorTint(WeChatColor.separator)
                    .alignmentGuide(.listRowSeparatorLeading) { _ in 60 }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(WeChatColor.background)
            .navigationTitle("微信")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(WeChatColor.navBar, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 22) {
                        Button { store.send(.searchButtonTapped) } label: {
                            Image(systemName: "magnifyingglass")
                        }
                        Button {} label: { Image(systemName: "plus.circle") }
                    }
                    .font(.system(size: 18))
                    .foregroundStyle(WeChatColor.textPrimary)
                }
            }
            .fullScreenCover(item: $store.scope(state: \.search, action: \.search)) { searchStore in
                SearchView(store: searchStore)
            }
            .task { store.send(.onAppear) }
        } destination: { store in
            ChatDetailView(store: store)
        }
    }
}

private struct DeviceBanner: View {
    let count: Int

    var body: some View {
        HStack(spacing: 12) {
            IconTile(systemName: "laptopcomputer", color: Color(hex: 0x3A3A3A), size: 40, cornerRadius: 5)
            Text("已登录\(count)台其他设备")
                .font(WeChatFont.subheadline)
                .foregroundStyle(WeChatColor.textSecondary)
            Spacer()
        }
        .padding(.vertical, 10)
    }
}

private struct ConversationRow: View {
    let conversation: Conversation

    var body: some View {
        HStack(spacing: 12) {
            avatar
                .frame(width: 48, height: 48)
                .overlay(alignment: .topTrailing) { unreadBadge }
            VStack(alignment: .leading, spacing: 4) {
                Text(conversation.title)
                    .font(WeChatFont.body)
                    .foregroundStyle(WeChatColor.textPrimary)
                    .lineLimit(1)
                Text(conversation.preview)
                    .font(WeChatFont.footnote)
                    .foregroundStyle(WeChatColor.textSecondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 6) {
                Text(conversation.timeText)
                    .font(WeChatFont.caption)
                    .foregroundStyle(WeChatColor.textTertiary)
                if conversation.isMuted {
                    Image(systemName: "bell.slash.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(WeChatColor.textTertiary)
                }
            }
        }
        .padding(.vertical, 10)
    }

    @ViewBuilder private var avatar: some View {
        switch conversation.systemTile {
        case .fileTransfer:
            IconTile(systemName: "folder.fill", color: WeChatColor.brand)
        case .none:
            Avatar(url: conversation.avatarURL)
        }
    }

    @ViewBuilder private var unreadBadge: some View {
        if conversation.unreadCount > 0 {
            Text("\(min(conversation.unreadCount, 99))")
                .font(WeChatFont.caption2Medium)
                .foregroundStyle(.white)
                .padding(.horizontal, 5)
                .frame(minWidth: 18, minHeight: 18)
                .background(WeChatColor.badge, in: Capsule())
                .offset(x: 6, y: -6)
        } else if conversation.hasRedDot {
            Circle()
                .fill(WeChatColor.badge)
                .frame(width: 9, height: 9)
                .overlay(Circle().stroke(WeChatColor.background, lineWidth: 1.5))
                .offset(x: 3, y: -3)
        }
    }
}

#Preview {
    ChatsView(
        store: Store(initialState: ChatsFeature.State()) {
            ChatsFeature()
        }
    )
    .preferredColorScheme(.dark)
}
