import Foundation

// 会话列表项(微信首页一行)。UI 无关:头像用 url 或系统图标块,时间已格式化为展示串。
struct Conversation: Identifiable, Equatable, Sendable {
    let id: String
    var title: String
    var preview: String // 最后一条消息预览,可含 "[12条]"/"昵称: " 等前缀
    var timeText: String // 右上角时间展示串:"01:55" / "昨天" / "周二" / "6月18日"
    var unreadCount: Int = 0
    var hasRedDot: Bool = false // 免打扰会话用小红点而非数字角标
    var isMuted: Bool = false
    var isPinned: Bool = false
    var avatarURL: URL?
    var isGroup: Bool = false
    var systemTile: SystemTile? // 非 nil 时用纯色图标块(如文件传输助手)
}

// 系统会话的图标块样式(微信用品牌色方块 + 图标,而非头像)。
enum SystemTile: Equatable, Sendable {
    case fileTransfer
}
