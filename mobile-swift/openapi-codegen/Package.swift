// swift-tools-version: 6.0
import PackageDescription

// 一次性代码生成包:用 swift-openapi-generator 的 build 插件,从 openapi.yaml 生成 Swift Codable 类型,
// 再把产物拷进 Tuist 的 Sources/Contracts/OpenAPI。不参与 App 构建。
let package = Package(
    name: "ContractsGen",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-generator", from: "1.0.0"),
        .package(url: "https://github.com/apple/swift-openapi-runtime", from: "1.0.0"),
    ],
    targets: [
        .target(
            name: "Contracts",
            dependencies: [
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
            ],
            plugins: [
                .plugin(name: "OpenAPIGenerator", package: "swift-openapi-generator"),
            ]
        ),
    ]
)
