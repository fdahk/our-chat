# OurChat iOS · mobile-swift

> our-chat 项目的 iOS 原生客户端。技术栈贴合 2026 业界最佳实践,与 `mobile-flutter/` 并列、互不依赖。

## 一行环境概览

- **Xcode 26** · **Swift 6** strict concurrency · **iOS 18.0** 最低部署目标
- **Tuist** 管理工程 · **SPM** 管理依赖 · **TCA** 做状态管理与架构
- **SwiftUI** 单 UI 栈(无 UIKit 兜底,有需求再桥接)
- **Swift Testing**(WWDC 2024,非 XCTest)

## 5 分钟跑起来

```bash
# 1. 装工具(只需一次)
brew install tuist swiftlint swiftformat

# 2. 拉依赖 + 生成 Xcode 工程
cd mobile-swift
tuist install      # 拉 SPM 依赖到 Tuist/Dependencies/
tuist generate     # 生成 OurChat.xcworkspace

# 3. 打开
open OurChat.xcworkspace
# 在 Xcode 里 Cmd+R 跑模拟器
```

跑通后看到一个最小占位界面。本仓库**只交付框架**:
- 工程清单(Tuist + SPM 依赖锁定)
- 编译/Lint/Format 配置
- 资源目录骨架(AppIcon / AccentColor 占位)
- 全套文档(选型 / 工程结构 / 流程 / 依赖 / 排错)

所有业务代码(Feature / Model / Service / Tests)请按 [docs/02-工程结构.md](docs/02-工程结构.md) 的约定自行添加到 `Sources/` 和 `Tests/` 目录。
