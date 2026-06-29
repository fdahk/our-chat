import Kingfisher
import SwiftUI

// 头像:微信用圆角矩形(非圆形)。url 为空或加载中显示占位。Kingfisher 负责缓存。
struct Avatar: View {
    let url: URL?
    var size: CGFloat = 48
    var cornerRadius: CGFloat = 6

    var body: some View {
        KFImage(url)
            .placeholder { placeholder }
            .resizable()
            .scaledToFill()
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(WeChatColor.avatarPlaceholder)
            .overlay(
                Image(systemName: "person.fill")
                    .font(.system(size: size * 0.48))
                    .foregroundStyle(WeChatColor.textTertiary)
            )
    }
}

// 纯色图标块:用于「文件传输助手 / 新的朋友 / 群聊」等系统入口(微信用品牌色方块 + 图标)。
struct IconTile: View {
    let systemName: String
    let color: Color
    var size: CGFloat = 48
    var cornerRadius: CGFloat = 6

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(color)
            .frame(width: size, height: size)
            .overlay(
                Image(systemName: systemName)
                    .font(.system(size: size * 0.5, weight: .medium))
                    .foregroundStyle(.white)
            )
    }
}

#Preview {
    HStack(spacing: 16) {
        Avatar(url: nil)
        IconTile(systemName: "folder.fill", color: WeChatColor.brand)
        IconTile(systemName: "person.crop.circle.badge.plus", color: .orange)
    }
    .padding()
    .background(WeChatColor.background)
}
