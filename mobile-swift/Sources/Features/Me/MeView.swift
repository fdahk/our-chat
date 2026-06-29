import ComposableArchitecture
import SwiftUI

struct MeView: View {
    @Bindable var store: StoreOf<MeFeature>

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    ProfileHeader(profile: store.profile)

                    SettingsCard(items: [
                        SettingsItem(icon: "checkmark.bubble.fill", iconColor: WeChatColor.brand, title: "服务"),
                    ])

                    SettingsCard(items: [
                        SettingsItem(icon: "star.square.fill", iconColor: Color(hex: 0xF5B838), title: "收藏"),
                        SettingsItem(icon: "photo.fill", iconColor: Color(hex: 0x3B7BF0), title: "朋友圈"),
                        SettingsItem(icon: "play.rectangle.fill", iconColor: Color(hex: 0x3B7BF0), title: "作品", detail: "添加第1个作品", showDot: true),
                        SettingsItem(icon: "wallet.pass.fill", iconColor: Color(hex: 0xEB6F43), title: "小店与卡包", detail: "[618优惠返场]小熊迷你多功能电饭煲", showDot: true),
                        SettingsItem(icon: "face.smiling.fill", iconColor: Color(hex: 0xF5B838), title: "表情"),
                    ])

                    SettingsCard(items: [
                        SettingsItem(icon: "gearshape.fill", iconColor: Color(hex: 0x3B7BF0), title: "设置"),
                    ]) { _ in store.send(.settingsTapped) }
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 24)
            }
            .background(WeChatColor.background)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(isPresented: $store.settingsPresented) {
                SettingsView(onLogout: { store.send(.logoutTapped) })
            }
        }
    }
}

private struct ProfileHeader: View {
    let profile: MeProfile

    var body: some View {
        HStack(spacing: 16) {
            Avatar(url: profile.avatarURL, size: 64, cornerRadius: 8)
            VStack(alignment: .leading, spacing: 8) {
                Text(profile.name)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(WeChatColor.textPrimary)
                HStack(spacing: 4) {
                    Text("微信号:\(profile.wxid)")
                        .font(.system(size: 14))
                        .foregroundStyle(WeChatColor.textSecondary)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11))
                        .foregroundStyle(WeChatColor.textTertiary)
                }
                HStack(spacing: 8) {
                    pill {
                        HStack(spacing: 3) {
                            Image(systemName: "plus").font(.system(size: 10))
                            Text("状态").font(.system(size: 12))
                        }
                    }
                    pill {
                        HStack(spacing: 4) {
                            Text("等\(profile.friendCount)个朋友").font(.system(size: 12))
                            Circle().fill(WeChatColor.badge).frame(width: 6, height: 6)
                        }
                    }
                }
                .foregroundStyle(WeChatColor.textSecondary)
            }
            Spacer()
            VStack {
                Image(systemName: "qrcode")
                    .font(.system(size: 18))
                    .foregroundStyle(WeChatColor.textSecondary)
            }
            Image(systemName: "chevron.right")
                .font(.system(size: 13))
                .foregroundStyle(WeChatColor.textTertiary)
        }
        .padding(16)
    }

    private func pill(@ViewBuilder _ content: () -> some View) -> some View {
        content()
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .overlay(Capsule().stroke(WeChatColor.separator, lineWidth: 1))
    }
}

private struct SettingsView: View {
    let onLogout: () -> Void
    @AppStorage("appearanceMode") private var appearance: AppearanceMode = .system

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                SettingsCard(items: [
                    SettingsItem(icon: "person.crop.circle.fill", iconColor: Color(hex: 0x3B7BF0), title: "账号与安全"),
                    SettingsItem(icon: "bell.fill", iconColor: Color(hex: 0xEB6F43), title: "新消息通知"),
                    SettingsItem(icon: "lock.fill", iconColor: Color(hex: 0x3B7BF0), title: "隐私"),
                    SettingsItem(icon: "gearshape.2.fill", iconColor: WeChatColor.textSecondary, title: "通用"),
                ])

                appearanceCard

                Button(action: onLogout) {
                    Text("退出登录")
                        .font(.system(size: 16))
                        .foregroundStyle(WeChatColor.badge)
                        .frame(maxWidth: .infinity)
                        .frame(height: 53)
                        .background(WeChatColor.elevated)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 16)
        }
        .background(WeChatColor.background)
        .navigationTitle("设置")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(WeChatColor.navBar, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
    }

    // 外观切换:跟随系统 / 浅色 / 深色,写入 @AppStorage 后根视图即时应用。
    private var appearanceCard: some View {
        VStack(alignment: .leading, spacing: WeChatSpacing.s) {
            Text("外观")
                .font(WeChatFont.footnote)
                .foregroundStyle(WeChatColor.textSecondary)
            Picker("外观", selection: $appearance) {
                ForEach(AppearanceMode.allCases, id: \.self) { mode in
                    Text(mode.label).tag(mode)
                }
            }
            .pickerStyle(.segmented)
        }
        .padding(WeChatSpacing.m)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(WeChatColor.elevated)
        .clipShape(RoundedRectangle(cornerRadius: WeChatRadius.l, style: .continuous))
    }
}

#Preview {
    MeView(
        store: Store(initialState: MeFeature.State()) {
            MeFeature()
        }
    )
    .preferredColorScheme(.dark)
}
