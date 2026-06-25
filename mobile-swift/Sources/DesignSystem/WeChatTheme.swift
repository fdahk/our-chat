import SwiftUI

// 微信暗色主题色板。取值参照官方微信暗色模式:近黑页面底、微信品牌绿、低饱和分隔线。
// 集中成令牌,避免散落的魔法色值;后续要做亮色模式时在这里加一层即可。
enum WeChatColor {
    static let brand = Color(hex: 0x07C160) // 微信品牌绿(选中态/主操作)
    static let background = Color(hex: 0x111111) // 页面底色
    static let elevated = Color(hex: 0x1E1E1E) // 分组/卡片/输入框底
    static let navBar = Color(hex: 0x1A1A1A) // 导航栏/标签栏底
    static let separator = Color(hex: 0x2A2A2A) // 分隔线
    static let textPrimary = Color(hex: 0xEDEDED) // 主文本
    static let textSecondary = Color(hex: 0x7F7F7F) // 次要文本(预览/时间)
    static let textTertiary = Color(hex: 0x5A5A5A) // 占位/弱提示
    static let badge = Color(hex: 0xFA5151) // 未读红点
    static let avatarPlaceholder = Color(hex: 0x2C2C2C) // 头像占位底
}

extension Color {
    // 16 进制构造,便于直接用设计稿色值(0xRRGGBB)。
    init(hex: UInt32, alpha: Double = 1) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8) & 0xFF) / 255
        let b = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: alpha)
    }
}
