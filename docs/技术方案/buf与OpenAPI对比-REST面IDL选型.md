# buf(Protobuf) vs OpenAPI —— REST 面 IDL 选型对比

> 范围:在**明确约定"实时/WS 事件层另行处理、本报告只比较 REST/JSON 接口面"**的前提下,对比 our-chat 当前的 **buf + Protobuf** 工具链与 **OpenAPI** 工具链,回答:就 REST 面而言,OpenAPI 是不是更优、是不是本项目这种情况下的最佳实践。配套《跨端 IDL 与代码生成选型分析》《实时通信契约边界》两篇。
> 结论先行:**就 REST/JSON 面、且三端含 Swift(一方产物)而言,OpenAPI 明显更优,且是本场景的最佳实践。** 胜负手有二:(1) **传输原生**——OpenAPI 就是描述 HTTP/JSON 的语言,而 Protobuf 是二进制 IDL,JSON 是它的附加映射;(2) **Swift 代码生成**——`swift-openapi-generator`(Apple 官方,出惯用 Codable)远胜 SwiftProtobuf(二进制类、命名分叉、非 Codable)。**且本项目服务端已用 zod 做运行时校验,走 `zod → OpenAPI → 三端生成` 可让"运行时校验"与"跨端契约"收敛到同一个源头,这是 OpenAPI 在本场景独有的低摩擦红利。** 诚实地说,buf 在"破坏性变更检测、schema 治理、未来二进制/gRPC 覆盖"上更强,但这些维度在"只做 REST 面"的约束下不构成胜负。

---

## 0. 术语表(可独立阅读)

| 术语 | 全称 / 含义 | 通俗解释 |
|---|---|---|
| **IDL** | Interface Definition Language | 与语言无关的接口/数据结构定义,写一次生成各端代码。 |
| **Protobuf** | Protocol Buffers | Google 的 IDL + 二进制序列化;`.proto` 定义,protoc/buf 配插件生成代码。默认二进制 wire,另有"proto3 JSON 映射"。 |
| **buf** | — | Protobuf 的现代工程化工具:依赖管理、`buf lint`、`buf breaking`、远程插件、BSR。**Protobuf 治理的事实标准**。 |
| **BSR** | Buf Schema Registry | buf 的 schema 中央仓库 + 托管远程插件市场(`remote: buf.build/...`)。 |
| **proto3 JSON 映射** | — | Protobuf 官方规定的"消息↔JSON"编码。**int64/uint64 编码为字符串**、`Timestamp` 为 RFC3339 字符串——与"惯用 JSON"有出入。 |
| **SwiftProtobuf** | `buf.build/apple/swift` | 把 proto 生成**二进制消息类**(`struct Xxx: SwiftProtobuf.Message`)。为二进制/gRPC 设计;**非 Codable**;把 `xxxId` 生成 `xxxID`(大写)。 |
| **ts-proto** | 社区 TS 插件 | 把 proto 生成**惯用 TS interface**;web/server 现用,JSON 解析丝滑。 |
| **OpenAPI** | 原 Swagger | 描述 **HTTP/JSON REST 接口**的 IDL:路径 + 动词 + 请求体 + 按状态码的响应;`components/schemas` 即 JSON Schema。 |
| **swift-openapi-generator** | Apple 官方 | 读 OpenAPI,生成**惯用 Codable 类型 + 客户端**(传输可插拔:URLSession 等)。**Swift 在 OpenAPI 阵营是一等公民**。 |
| **oapi-codegen / openapi-typescript** | Go / TS 的 OpenAPI 生成器 | OpenAPI → 惯用 Go / TS 代码,均成熟。 |
| **zod** | TS 运行时校验库 | 用代码定义 schema 并在运行时校验入参(`z.object({...})`)。**本项目服务端所有入参用 zod 校验**——它是服务端的"运行时真相"。 |
| **zod-to-openapi** | — | 从 zod schema 自动产出 OpenAPI 文档的工具(如 `@asteasolutions/zod-to-openapi`)。让 zod 同时充当"校验源"和"契约源"。 |
| **spectral** | — | OpenAPI/AsyncAPI 的 lint 工具(规范风格检查),对标 `buf lint`。 |
| **oasdiff / openapi-diff** | — | OpenAPI 版本差异 + 破坏性变更检测工具,对标 `buf breaking`。 |
| **破坏性变更(breaking change)** | — | 改 schema 导致老客户端解析失败(删字段、改类型、改必填)。 |
| **DTO** | Data Transfer Object | 专用于收发网络数据的结构体;iOS 现手写了一批 `Decodable` DTO。 |

---

## 1. 前提与现状(把对比放进正确的约束里)

- **约束**:实时/WS 事件层(`receiveMessage`、`message.send`、`call:*`…)**不在本报告范围**——它由 AsyncAPI/手写契约 + 契约测试单独处理(详见《实时通信契约边界》)。本报告**只比较 REST/JSON 接口面**。
- **三端产物**:Swift(iOS,**一方产物,不可降级为"二等"**)、TypeScript(web/server)、Go(gateway)。
- **现状**:`buf.gen.yaml` 用 Protobuf,各端不同插件;**web/server 顺(ts-proto 出惯用 JSON 类型),iOS 别扭(SwiftProtobuf 出二进制类),结果 iOS 手写了 DTO、绕过 IDL,且生成的 `.pb.swift` 零引用 = 死代码**。
- **服务端校验**:**所有入参用 zod**(`server/src/contracts/*.ts`)。即当前其实有**两套 schema 源**:proto(当类型用)与 zod(当运行时校验用),二者各写各的——本身是个待收敛的点。

> 关键认知:**"只做 REST 面"这一约束,正好抽掉了 Protobuf 的两大长板(二进制高效、流式),只留下"JSON 接口的类型契约 + 多端生成"这一战场——而这正是 OpenAPI 的主场、Protobuf 的客场。**

---

## 2. 一句话判断 + 为什么

**REST 面、Swift 一方,OpenAPI 更优,且是最佳实践。** 两个决定性原因:

1. **传输原生**:REST 走的就是 HTTP/JSON,**OpenAPI 就是描述它的语言**;Protobuf 是二进制 IDL,JSON 只是它的"附加映射"(还自带 int64-as-string 这类与项目实际 JSON 的出入)。用 Protobuf 描述 JSON-REST,是"拿二进制工具配 JSON 传输"。
2. **Swift 代码生成**:`swift-openapi-generator`(Apple 官方、出惯用 `Codable`、传输可插拔)直接落进现有 `APIResponse<Decodable>` 路径、**让 iOS 手写 DTO 整批删除**;SwiftProtobuf 出的是二进制消息类(非 Codable、`senderID` 大写命名分叉、`Int64`/`Google_Protobuf_Struct` 笨重),**iOS 这端永远别扭**。

---

## 3. 逐维对比(头对头)

| 维度 | buf + Protobuf(现状) | OpenAPI | 谁更优(REST 面) |
|---|---|---|---|
| **与 REST/JSON 传输契合** | JSON 是附加映射(int64→string 等坑) | **就是 HTTP/JSON 的原生描述** | **OpenAPI** |
| **Swift 代码生成** | SwiftProtobuf:二进制类、非 Codable、`senderID` 命名分叉、类型笨重 | **swift-openapi-generator:惯用 Codable + 客户端,官方一等** | **OpenAPI(决定性)** |
| TS 生成 | ts-proto(强) | openapi-typescript / orval(强) | 平 |
| Go 生成 | protoc-gen-go(强) | oapi-codegen(强) | 平 |
| **删除 iOS 手写 DTO** | 理论可但形状别扭(还得映射领域模型) | **可且舒服,直接替换** | **OpenAPI** |
| **契约可读性 / 可调试** | proto + 二进制思维,JSON 形状要脑补 | **直接描述 HTTP 路径/状态码,curl 即所见** | **OpenAPI** |
| **与现有 zod 的协同** | proto 与 zod 两套 schema 各写各的 | **zod → OpenAPI 可让校验源=契约源,收敛单一真相** | **OpenAPI(本项目独有红利)** |
| 破坏性变更检测 | **`buf breaking`(成熟、强)** | oasdiff / openapi-diff(可用,稍逊) | buf 略强 |
| schema 治理 / lint | **`buf lint`(强)** | spectral(可用,需自行编排) | buf 略强 |
| 注册中心 / 远程插件 | **BSR(顺滑)** | 各语言生成器自行编排 CI | buf 略强 |
| schema 演进规则 | **字段号机制使后向兼容规则极清晰** | JSON 演进靠约定(加字段安全,无字段号强约束) | buf 略强 |
| 未来二进制 / gRPC 覆盖 | **已覆盖**(gateway 真要二进制时) | 不覆盖(REST 专用) | buf 强(但本约束外) |
| 改造成本 | —(现状) | 中(REST 面接生成器 + 定源头) | — |

**读法**:OpenAPI 在**与本场景强相关的维度**(传输契合、Swift 生成、删 DTO、可读性、与 zod 协同)上**完胜**;buf 更强的维度(破坏性检测、lint、BSR、字段号演进、未来二进制)**要么在"只做 REST"的约束外,要么有 OpenAPI 侧的替代品(oasdiff/spectral)可补**。所以**在本约束下,天平明确偏 OpenAPI**。

---

## 4. 三个决定性维度,深挖

### 4.1 传输原生:为什么"Protobuf 配 JSON-REST"是别扭的
- Protobuf 的世界观是**二进制 + 字段号 + 强类型**;它**也定义**了 proto3 JSON,但那是"为了能落 JSON 而加的映射",不是它的母语。
- 落到细节就咬人:**proto3 JSON 规范把 int64 编码为字符串**(防 JS 大数精度丢失),而本项目服务端实际下发**数字**(`bigint-json` 把 BigInt `toJSON` 成 Number、ts-proto `forceLong=number` 也按数字)。两边都"能解",但**"规范形状 ≠ 项目实际形状"**,每个这类细节都要逐个确认、各端各自当心。
- OpenAPI 没有这层错位:**它描述的就是"这个 URL 这个动词,请求体/响应体的 JSON 长这样"**,所见即所传。

### 4.2 Swift 代码生成:这是整盘棋的胜负手
- **现状痛点(实测)**:SwiftProtobuf 生成的 `Ourchat_Message_V1_Message` 是 `SwiftProtobuf.Message`,**不是 `Codable`**,用 `Int64`/`Google_Protobuf_Struct`/`Google_Protobuf_Timestamp`,且把 `client_msg_id`→`clientMsgID`(大写,和 web 的 `clientMsgId` 分叉)。它**塞不进现有 `APIResponse<Decodable>` 解码路径**,当 UI 模型也笨重。结果就是 iOS 干脆手写 DTO。
- **OpenAPI 侧**:`swift-openapi-generator` 是 **Apple 官方**项目,生成**惯用 `Codable` 类型 + 一个 `Client` 协议(传输可插拔:URLSession/AsyncHTTPClient)**。
  - 采用方式可**渐进**:先只用它生成的**数据类型**(`Components.Schemas.Message` 等 Codable)**替换手写 DTO**,沿用现有 `APIClient` 传输;以后再决定要不要换用它生成的整套客户端。
  - 这恰好补上《IDL 选型》里指出的"Swift 在 Protobuf 阵营无一等 Codable 生成器"的空缺。
- **结论**:只要 Swift 是一方产物,**OpenAPI 在生成体验上对 Protobuf 是碾压级优势**,这一条几乎单独定胜负。

### 4.3 单一真相从哪来:`zod → OpenAPI`(本项目的独有红利)
- 现状**两套 schema 源**:proto(类型)+ zod(运行时校验),各写各的——这是"伪统一"。
- **关键洞察**:服务端**已经**用 zod 校验所有入参,zod 本就是服务端的"运行时真相"。用 **zod-to-openapi**(如 `@asteasolutions/zod-to-openapi`)从 zod 直接产出 OpenAPI 文档,就能把链路收敛成:

```
   zod(服务端运行时校验,单一真相)
        │  zod-to-openapi
        ▼
   OpenAPI 文档
        ├── swift-openapi-generator ──→ iOS 惯用 Codable(删手写 DTO)
        ├── openapi-typescript ───────→ web/server 类型
        └── oapi-codegen ─────────────→ gateway Go 类型
```

- 好处:**"运行时校验"和"跨端契约"从此是同一个源头**——改 zod，OpenAPI 与三端类型一起变,**漂移从根上消失**;而且**不必另起一份手维护的 OpenAPI**。
- 这是 Protobuf 路线给不了的:proto 和 zod 是两套体系,你要么让 proto 当源头(那 zod 校验得另接生成)、要么维持两套(现状)。**OpenAPI + 现有 zod 的契合度,是本项目特有的加分项。**

> 备选:也可反过来"OpenAPI 当源头 → 生成 zod 校验器"。但既然 zod 已存在且在用,`zod → OpenAPI` 摩擦更小。具体工具的成熟度需选型时核实。

---

## 5. 诚实:buf 更强、但本约束下不决定胜负的维度

不吹不黑,这些地方 Protobuf/buf 确实更强:

1. **破坏性变更检测**:`buf breaking` 是同类最佳、久经考验;OpenAPI 侧 `oasdiff` 可用但生态稍逊。→ 缓解:CI 接 `oasdiff` 也能拦截大部分。
2. **schema 治理 / lint**:`buf lint` 开箱即用;OpenAPI 用 `spectral`,需自己编排规则集。→ 缓解:spectral 规则成熟,一次配好即可。
3. **演进规则更刚性**:Protobuf 字段号机制让"绝不复用号、加字段安全"等后向兼容规则非常清晰;JSON/OpenAPI 靠约定(通常"加字段安全、删/改字段危险"),约束力弱些。→ 缓解:用 oasdiff 在 CI 把"删/改字段"判为 breaking。
4. **未来二进制 / gRPC**:若 gateway 内部链路要上 gRPC,Protobuf 已覆盖;OpenAPI 是 REST 专用。→ 但这**在"只做 REST 面"的约束之外**;真有这需求可**分链路并存**(gateway 用 proto,客户端 REST 用 OpenAPI)。

**所以买 OpenAPI,不是因为 buf 差**——buf 是 Protobuf 治理的最佳实践;而是**本场景(JSON-REST + Swift 一方)抽掉了 Protobuf 的长板、放大了它的短板**。

---

## 6. 最佳实践判断

- **现代客户端 facing 的 REST,最佳实践 = "REST 传输 + OpenAPI 契约 + 多端代码生成"**,不是裸手写、也不是把二进制 IDL 硬套 JSON。
- **当 Swift 是一方产物**时,`swift-openapi-generator`(官方一等)把天平进一步压向 OpenAPI——Swift 在 Protobuf 阵营天生别扭,在 OpenAPI 阵营天生顺。
- 因此:**就 our-chat 的 REST 面而言,OpenAPI 是更优解,也是本场景的最佳实践。** buf+Protobuf 的最佳实践地位仍然成立——只是它的主场是 **RPC / 二进制 / gRPC / 服务间**,不是本场景。

---

## 7. 落地路径(REST 面)

1. **止血(立即、低风险)**:从 `buf.gen.yaml` 删 `apple/swift` 段、删零引用 `.pb.swift`、从 `Package.swift` 去掉 `SwiftProtobuf` 依赖。消除死代码与"伪统一"的误导。iOS 手写 DTO 暂留,补**契约测试**钉住与服务端 JSON 的一致。
2. **定源头**:选 **`zod → OpenAPI`**——服务端 zod 加 `zod-to-openapi`,产出权威 OpenAPI 文档(REST 面)。
3. **三端接生成器**:`swift-openapi-generator`(iOS)、`openapi-typescript`(web/server)、`oapi-codegen`(gateway)。**iOS 手写 DTO 由生成的 Codable 替换、整批删除**。
4. **CI 守护**:`spectral`(lint)+ `oasdiff`(破坏性变更检测)接入流水线,补齐相对 `buf` 的治理短板。
5. **(WS 事件面)** 按《实时通信契约边界》单独立约(AsyncAPI/手写 + 契约测试),数据形状复用 OpenAPI 的 JSON Schema。

> 跨仓同步:`buf.gen.yaml` / 契约工程属两仓共享,生成管线改动两仓同步 + 评审。

---

## 8. 风险与未决项

| 项 | 说明 | 处置 |
|---|---|---|
| `zod → OpenAPI` 工具成熟度 | `@asteasolutions/zod-to-openapi` 等需覆盖全部路由/类型,且 zod 写法要可被映射 | 选型前以官方文档 + 小样例验证覆盖度 |
| `swift-openapi-generator` 对本项目 JSON 形状的处理 | 数字 int64、`{success,data,message}` 信封、multipart 上传等 | spike:用真实响应跑一遍生成 + 解码 |
| 信封 `{success,data,message}` 怎么进 OpenAPI | 统一信封需在 OpenAPI 里建模(响应包一层),或保留现有解信封逻辑只生成 `data` 的类型 | 二选一,建议后者(生成 data 类型,沿用现有 `sendUnwrapping`) |
| 破坏性检测/lint 的编排 | OpenAPI 侧需自行配 oasdiff/spectral | 一次性配好 CI |
| 版本/维护现状 | 本报告基于既有认知 | 选定后以各工具官方文档为准核实版本与活跃度 |

---

## 9. 一页结论 + 速查

**结论**:约束为"只做 REST 面、Swift 一方"时——
- **OpenAPI 更优,且是最佳实践**;胜负手 = 传输原生 + Swift 一等生成 + 与现有 zod 收敛单一真相。
- **buf 不背锅**:它是 Protobuf 治理最佳实践,只是主场是 RPC/二进制,本场景抽掉了它的长板。
- **当务之急**:先删零引用的 SwiftProtobuf 生成物与依赖(止血),再走 `zod → OpenAPI → 三端生成`,删 iOS 手写 DTO,CI 补 oasdiff/spectral。

**速查**

| 问题 | 答 |
|---|---|
| REST 面 OpenAPI 比 buf 好吗? | 是。传输原生 + Swift 生成一等 + 与 zod 协同。 |
| 是本场景最佳实践吗? | 是(现代 REST = OpenAPI + codegen,且 Swift 一方更偏 OpenAPI)。 |
| buf 哪里仍更强? | 破坏性检测、lint、BSR、字段号演进、未来二进制——但本约束外或有替代(oasdiff/spectral)。 |
| 单一真相放哪? | `zod → OpenAPI`,复用服务端现有 zod,收敛校验源=契约源。 |
| 信封怎么办? | OpenAPI 只描述 `data` 的类型,沿用现有解信封逻辑,最省。 |
| 第一步做什么? | 删零引用 `.pb.swift` + `SwiftProtobuf` 依赖,止血。 |
