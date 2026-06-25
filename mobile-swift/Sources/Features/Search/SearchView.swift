import ComposableArchitecture
import SwiftUI

// 搜索页:输入微信号/手机号/用户名,精确查找用户。经 fullScreenCover 呈现。
struct SearchView: View {
    @Bindable var store: StoreOf<SearchFeature>

    var body: some View {
        VStack(spacing: 0) {
            topBar
            content
            Spacer()
        }
        .background(WeChatColor.background.ignoresSafeArea())
    }

    private var topBar: some View {
        HStack(spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(WeChatColor.textTertiary)
                TextField(
                    "",
                    text: $store.query,
                    prompt: Text("微信号/手机号/用户名").foregroundStyle(WeChatColor.textTertiary)
                )
                .foregroundStyle(WeChatColor.textPrimary)
                .font(.system(size: 15))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            }
            .padding(.horizontal, 10)
            .frame(height: 38)
            .background(WeChatColor.elevated)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

            Button("取消") { store.send(.closeTapped) }
                .font(.system(size: 15))
                .foregroundStyle(WeChatColor.brand)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    @ViewBuilder private var content: some View {
        if store.isSearching {
            ProgressView()
                .tint(WeChatColor.textSecondary)
                .padding(.top, 32)
        } else if let result = store.result {
            ResultRow(result: result)
                .padding(.top, 8)
        } else if store.notFound {
            Text("未找到相关用户")
                .font(.system(size: 14))
                .foregroundStyle(WeChatColor.textSecondary)
                .padding(.top, 32)
        }
    }
}

private struct ResultRow: View {
    let result: SearchResult

    var body: some View {
        HStack(spacing: 12) {
            Avatar(url: result.avatarURL, size: 48)
            VStack(alignment: .leading, spacing: 4) {
                Text(result.username)
                    .font(.system(size: 16))
                    .foregroundStyle(WeChatColor.textPrimary)
                Text("微信号:\(result.userId)")
                    .font(.system(size: 13))
                    .foregroundStyle(WeChatColor.textSecondary)
            }
            Spacer()
            Text(result.isFriend ? "已是好友" : "添加")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(result.isFriend ? WeChatColor.textSecondary : .white)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(
                    result.isFriend ? Color.clear : WeChatColor.brand,
                    in: RoundedRectangle(cornerRadius: 6, style: .continuous)
                )
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(WeChatColor.background)
    }
}

#Preview {
    SearchView(
        store: Store(
            initialState: SearchFeature.State(
                query: "1024",
                result: SearchResult(userId: 1024, username: "duanyuhao", avatarURL: nil, isFriend: false)
            )
        ) {
            SearchFeature()
        }
    )
    .preferredColorScheme(.dark)
}
