# OpenAPI 单一契约源

`openapi/openapi.yaml` 是 our-chat **REST 接口的唯一契约源**。四端从它生成类型,消除手写/proto 重复定义。
实时 WS 事件(`call:*`、`message.send`/`ack`、`agent` 等)不在此文件——OpenAPI 描述不了事件流,那部分仍由 `proto/` 描述
(详见 `docs/技术方案/实时通信契约边界-为何OpenAPI盖不住事件流.md`)。

## 各端再生成

| 端 | 命令 | 产物 |
|---|---|---|
| **web / server** | `npx openapi-typescript openapi/openapi.yaml -o web/src/contracts/openapi/schema.d.ts`(server 同理) | `schema.d.ts`(`components['schemas']`) |
| **mobile-swift** | `cd mobile-swift/openapi-codegen && cp ../../openapi/openapi.yaml Sources/Contracts/openapi.yaml && swift package --allow-writing-to-package-directory generate-code-from-openapi --target Contracts`,再把 `Sources/Contracts/GeneratedSources/Types.swift` 拷到 `../Sources/Contracts/OpenAPI/Types.swift` | `Types.swift`(惯用 Codable) |
| **gateway** | WS 中继,不消费 REST 实体,无需生成 | — |

## 消费方式
- **web**:`web/src/contracts/openapi/index.ts` 具名再导出;`globalType/*` 取 REST 实体于此。
- **iOS**:`mobile-swift/Sources/Contracts/OpenAPI/Aliases.swift` 起别名(`APIUser`/`APIMessage`…);各 client 直接解码到这些类型。
- **server**:生产方(Prisma+zod),不消费;`test/contract.openapi.test.ts` 校验真实响应符合本契约。

## 单一真相纪律
- 改 REST 实体形状 → 只改 `openapi/openapi.yaml`,再各端再生成。
- 事件类型(WS)→ 改 `proto/`,`buf generate`。
- 二者**零重叠**:REST 实体只在 OpenAPI;事件只在 proto。
