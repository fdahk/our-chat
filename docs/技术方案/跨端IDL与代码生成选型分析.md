# 跨端 IDL 与代码生成选型分析

> 范围:our-chat 在 **Swift(iOS)/ TypeScript(web、server)/ Go(gateway)** 四个产物之间,如何用一份"接口定义"驱动各端类型与客户端代码生成,消除手写 DTO 带来的跨端漂移。
> 结论先行:**buf 不是坏选择,它是 Protobuf 路线的业界最佳实践。真正的错配在两处——(1) Protobuf 的 Swift 代码生成是"二进制消息"导向,对 JSON 不友好;(2) 本项目的传输是手写 JSON(REST + Socket.io),而非 gRPC/Connect。拿"二进制 IDL 工具链"配"JSON 传输",Swift 这条缝就裂了。** 长期看,按"传输范式"二选一:要么把传输统一到 **Connect**(留住 Protobuf+buf),要么承认是 **JSON-REST** 体质、REST 面改用 **OpenAPI**(Swift 反而一等公民)、事件面用 **AsyncAPI**。

---

## 0. 术语表(先读)

> 后文反复用到这些词,先一次性讲清楚,读者不必另开搜索。

| 术语 | 全称 / 含义 | 通俗解释 |
|---|---|---|
| **IDL** | Interface Definition Language,接口定义语言 | 一份与编程语言无关的"接口/数据结构定义"。写一次,生成各语言的类型与客户端代码。Protobuf 文件、OpenAPI 文档都是 IDL。 |
| **代码生成(codegen)** | — | 用工具读 IDL,机器产出某语言的源码(类型、序列化、客户端 stub)。目的是让"线上数据形状"成为**单一真相**,各端不再手写、不会各写各的。 |
| **DTO** | Data Transfer Object,数据传输对象 | 专门用来"接收/发送网络数据"的贫血结构体。本项目 iOS 现在手写了一批 `Decodable` DTO(如 `MessageDTO`)。 |
| **wire format(线格式)** | — | 数据"在网线上"真正长什么样的字节编码。两大类:**二进制**(Protobuf binary、紧凑高效、不可读)与 **文本/JSON**(可读、通用、稍胖)。**同一份 IDL 可以走不同 wire format**——这是理解本报告的关键。 |
| **序列化 / 反序列化** | serialize / deserialize | 把内存对象 ↔ wire format 字节互转。codegen 生成的代码核心就是这套转换逻辑。 |
| **schema** | — | "数据有哪些字段、什么类型、是否必填"的结构约束。IDL 本质是写 schema。 |
| **RPC** | Remote Procedure Call,远程过程调用 | 把"调远端方法"伪装成"调本地函数"的范式(`getUser(id)` 背后是网络请求)。强调**动作/方法**。 |
| **REST** | Representational State Transfer | 以**资源 + HTTP 动词**组织接口的范式(`GET /users/1`)。强调**资源/URL**。本项目业务后端基本是 REST 风格的 JSON 接口。 |
| **Protobuf** | Protocol Buffers | Google 的 IDL + 二进制序列化格式。`.proto` 文件定义消息,`protoc` 编译器配插件生成各语言代码。默认走二进制 wire,也定义了一套"proto3 JSON 映射"。 |
| **proto3 JSON 映射** | — | Protobuf 官方规定的"如何把 proto 消息编码成 JSON"。**注意:int64/uint64 在该规范里编码为字符串**(避免 JS 大数精度丢失),`Timestamp` 编码为 RFC3339 字符串。这条规则后面会咬人。 |
| **gRPC** | Google RPC | 基于 Protobuf + HTTP/2 的 RPC 框架,默认二进制 wire。高性能、强类型,但浏览器原生不能直连(需代理),且 wire 不可读。 |
| **Connect (ConnectRPC)** | buf 出品的 RPC 框架 | "对 gRPC 的现代化重做"。同一份 proto,既能走 gRPC,也能走**普通 HTTP/1.1 + JSON**,浏览器可直连。有 `connect-go / connect-es / connect-swift` 三端实现。 |
| **buf** | — | Protobuf 的现代工程化工具:依赖管理、`buf lint`(规范检查)、`buf breaking`(破坏性变更检测)、远程插件、BSR。**它是治理 Protobuf 的事实标准**,本身与 wire 无关。 |
| **BSR** | Buf Schema Registry | buf 的"schema 中央仓库 + 远程插件市场",`buf.gen.yaml` 里 `remote: buf.build/...` 就是调 BSR 上的托管插件,免本地装 protoc 插件。 |
| **plugin(代码生成插件)** | — | 真正"把 proto 翻成某语言代码"的程序。**同一份 proto,换插件 = 换产物形状**。选型的关键就在这里。 |
| **protoc-gen-go** | — | 官方 Go 插件,生成惯用 Go struct。Go 这端体验一等。 |
| **ts-proto** | `protoc-gen-ts_proto`(社区,stephenh) | 把 proto 生成**惯用的 TS interface**(`interface Message { id: number; ... }`),配 `forceLong=number` 把 int64 当 JS number。web/server 现用此插件,**所以 JSON 解析丝滑**。 |
| **protobuf-es / Connect-ES** | buf 官方 TS 实现 | 现代 TS Protobuf 运行时,JSON 支持完善,是 ts-proto 的"官方对手"。 |
| **SwiftProtobuf** | `buf.build/apple/swift`,Apple 官方 | 把 proto 生成 **二进制消息类**(`struct Ourchat_Message_V1_Message: SwiftProtobuf.Message`)。**为二进制/gRPC 设计**,虽支持 proto3 JSON,但类型不是 `Codable`,且把 `xxxId` 命名成 `xxxID`(大写)。iOS 现用此插件——**这正是错配点**。 |
| **OpenAPI** | 原 Swagger | 描述 **HTTP/JSON REST 接口**的 IDL 标准(路径、动词、请求/响应 schema)。JSON-REST 世界的"Protobuf"。 |
| **swift-openapi-generator** | Apple 官方 | 读 OpenAPI 文档,生成**惯用 Codable 类型 + 客户端**(传输可插拔:URLSession 等)。**Swift 在 OpenAPI 阵营是一等公民**——恰好补上 Protobuf-Swift 的短板。 |
| **oapi-codegen / openapi-typescript** | Go / TS 的 OpenAPI 生成器 | OpenAPI → 惯用 Go / TS 代码,均成熟。 |
| **AsyncAPI** | — | OpenAPI 的"事件版":描述 **WebSocket / Socket.io / Kafka / MQTT 等异步消息**的 IDL。REST 用 OpenAPI、实时事件用 AsyncAPI 是常见组合。 |
| **JSON Schema** | — | 描述"一段 JSON 的结构约束"的标准。OpenAPI / AsyncAPI 的字段 schema 底层就是 JSON Schema。 |
| **TypeSpec**(原 Cadl) | 微软 | 新兴的"上游 IDL":写一份 TypeSpec,**emit(产出)OpenAPI / JSON Schema / Protobuf**。用于"一份源头,多种下游标准"。 |
| **破坏性变更(breaking change)** | — | 改 schema 导致老客户端解析失败(如删字段、改类型)。`buf breaking` / OpenAPI diff 工具能在 CI 拦截。 |

---

## 1. 问题陈述与现状剖析

### 1.1 现象
web、server 都"消费 IDL 生成的类型",唯独 iOS 手写了一批 `Decodable` DTO(`MessageDTO`、`FileInfoDTO`、`ProfileDTO`、`FriendReqDTO`…),**绕过了统一 IDL**,重新引入了"线上字段一改、iOS 手写结构悄悄漂移"的风险。

### 1.2 根因(基于仓库实据)
看 `buf.gen.yaml`:**同一份 proto,各端用不同插件**:

| 产物 | 插件 | 产物形状 |
|---|---|---|
| `server/` (TS) | `ts-proto`(`onlyTypes, forceLong=number, useDate=string`) | 惯用 JSON interface,int64→number,**与线上 JSON 一一对应** |
| `web/` (TS) | 同上 | 同上 |
| `gateway/` (Go) | `protocolbuffers/go` | 惯用 Go struct |
| `mobile-swift/` | **`buf.build/apple/swift`(SwiftProtobuf)** | **二进制 protobuf 消息类** |

iOS 生成物是给**二进制传输(gRPC)**用的,而 ourchat 实际走 **JSON over REST + Socket.io**。错配体现在三处实锤:

1. **类型形状不匹配**:生成的 `Ourchat_Message_V1_Message` 用 `Int64` 装 id、`Google_Protobuf_Struct` 装 `extra`、`Google_Protobuf_Timestamp` 装时间,**且不是 `Codable`**(用自带的 `init(jsonString:)`)。它塞不进现有的 `APIResponse<T: Decodable>` 信封解码路径,也对不上 Socket.io 投递的 `[String: Any]` 字典。
2. **连生成的字段名都漂移**:SwiftProtobuf 按 Swift API 规范把 `client_msg_id` 生成成 `clientMsgID`、`sender_id` → `senderID`、`conversation_id` → `conversationID`(**大写 ID**);而 web 的 ts-proto 是 `clientMsgId / senderId / conversationId`(小写)。**同一 IDL,两端属性名不一致**,跨端对照时反而增加心智负担。
3. **当前是"最差状态"**:生成的 `.pb.swift` **零业务引用 = 纯死代码**,还为此白白链接了一个 `SwiftProtobuf` 依赖;与此同时我又手写了 DTO。"看着像统一了,其实没用"——这是最该消除的误导。

### 1.3 一个反直觉的实测结论
我写过探针:用 `Ourchat_Message_V1_Message(jsonString:)` 去解**服务端真实 JSON**(数字 int64、ISO 时间字符串、`fileInfo`)——**能解通**。所以并不是"生成类型无法消费线上数据",而是**形状别扭**:解出来还得再映射成适合 UI 的领域模型,Socket 那路还得把字典重新序列化成 JSON 字节再喂给它。可行,但不优雅。

> 补充一个潜在地雷:proto 文件注释自己写着"id JSON string""seq JSON string"——作者清楚 **proto3 JSON 规范把 int64 编码成字符串**。但服务端实际下发的是**数字**(因为 `bigint-json` 把 BigInt `toJSON` 成 Number,且 ts-proto `forceLong=number` 也按数字处理)。`SwiftProtobuf` 的 JSON 扫描器对 int64 **既收字符串也收数字**,所以没炸;但这说明"proto3 JSON 规范"与"项目实际 JSON"本就有出入,纯 Protobuf 路线下这类细节要逐个确认。

---

## 2. IDL 与代码生成的原理(讲透"为什么 Swift 这端别扭")

### 2.1 一份 IDL,两个独立维度:schema 与 wire
初学者容易把"用 Protobuf"理解成"必须走二进制"。其实 **schema(数据长什么样)与 wire format(在网线上怎么编码)是两个正交维度**:

- Protobuf 默认 **二进制 wire**(紧凑、快),但**也定义了 proto3 JSON 映射**(可读、通用)。
- gRPC = Protobuf schema + 二进制 wire + HTTP/2。
- Connect = Protobuf schema + (二进制 **或** JSON wire) + 普通 HTTP。
- ourchat 现状 = Protobuf schema(只当类型定义用)+ **手写 JSON wire** + REST/Socket.io。

**问题不在 schema 用 Protobuf,而在"schema 工具链假设的 wire"和"项目实际 wire"不一致,且这种不一致在 Swift 插件上代价最大。**

### 2.2 codegen 插件决定一切
`protoc` / buf 只是"把 proto 解析成中间表示",真正决定产物形状的是**插件**。同一份 `message.proto`:
- ts-proto(`onlyTypes`)→ 一个 `interface`,**零运行时**,直接当 `JSON.parse` 的类型断言用 → 与 JSON wire 天然契合。
- SwiftProtobuf → 一个**带二进制编解码引擎的 struct**(`decodeMessage`/`traverse`、`_StorageClass` 存储类、`@unchecked Sendable`)→ 与二进制 wire 契合,与 JSON-REST 体质格格不入。

### 2.3 Swift 为什么是 Protobuf 路线的弱项
- **生态现实**:TS 有 ts-proto / protobuf-es 两套成熟的"出惯用 JSON 类型"的插件;Go 官方插件就很惯用;**Swift 在 BSR / 社区里没有一个一等的"Protobuf → 惯用 Codable 结构"生成器**。`SwiftProtobuf` 是唯一成熟选择,但它为二进制而生。
- **命名规范冲突**:Swift API 设计指南要求缩写词全大写(`ID`/`URL`),SwiftProtobuf 遵此把 `xxxId` 写成 `xxxID`,与其它端的 `xxxId` 天然分叉。
- **类型笨重**:`Google_Protobuf_Struct`/`Timestamp`/`Int64`/存储类,既不适合直接当 SwiftUI 的视图模型,也给 Swift 6 严格并发引入噪音(`@unchecked Sendable`)。

**反观 OpenAPI 阵营:`swift-openapi-generator` 是 Apple 官方、出惯用 `Codable` + 可插拔传输的客户端——Swift 在这条路上是一等公民。** 这就是"换范式能让 Swift 从最痛变最省"的根据。

---

## 3. 候选 IDL 体系详解

### 3.1 Protobuf + buf(现状)
- **原理**:`.proto` 定义 schema,buf 管理依赖/lint/breaking + 调 BSR 远程插件生成各端代码。
- **强项**:强 schema、二进制高效、`buf breaking` 在 CI 拦截破坏性变更、Go/TS 生成质量一等、生态最成熟。
- **弱项(对本项目)**:Swift 生成物为二进制设计,JSON-REST 下别扭;**纯 Protobuf 不覆盖 Socket.io 事件**(它不是 RPC 调用)。
- **结论**:作为 schema 治理工具,buf **保留有价值**;但要让它在 JSON 传输下各端都顺,需配 Connect(见 3.2)。

### 3.2 Connect(ConnectRPC)
- **原理**:同一份 proto,生成 `connect-go/es/swift` 客户端与服务端;wire **可选二进制或 JSON**,走**普通 HTTP**,浏览器可直连(无需 gRPC-Web 代理)。
- **强项**:把"Protobuf schema"与"HTTP/JSON 传输"正式打通;三端官方实现;wire 可读(JSON 模式);保留 buf 全套治理。
- **弱项**:`connect-swift` 底层仍用 SwiftProtobuf 类型(命名/笨重问题部分仍在,但**传输与序列化被框架收口**,不用你手撕);**要改造现有传输层**(REST handler / Socket 信令迁到 Connect 调用),改动面大;实时**单向推送**(服务端主动推 `receiveMessage`)需用 Connect 的 server-streaming,与现有 Socket.io 广播模型不完全对齐。
- **结论**:**"全面 RPC 化"的自洽终点**。适合"打算让 gateway 上 gRPC、各端 RPC 化"的团队。

### 3.3 OpenAPI(+ AsyncAPI 补事件)
- **原理**:OpenAPI 文档(YAML/JSON)描述 REST 接口;各端用生成器产类型 + 客户端。事件(Socket.io)用 AsyncAPI 描述。
- **强项**:
  - **与本项目传输天然契合**(本来就是 JSON-REST)。
  - **Swift 一等公民**:`swift-openapi-generator`(Apple 官方)出惯用 `Codable` + 客户端,直接落进现有 `APIResponse<Decodable>` 路径,**手写 DTO 可全删**。
  - Go(`oapi-codegen`)、TS(`openapi-typescript`/`orval`)生成质量一等。
  - OpenAPI diff 工具可做 breaking 检测。
- **弱项**:
  - OpenAPI **只管 HTTP**,Socket.io 事件覆盖不到 → 需 **AsyncAPI**(其 Swift/TS/Go 代码生成成熟度不如 OpenAPI,可能事件契约仍需小量手写 + 契约测试守护)。
  - 与现有 Protobuf 投资是**两套体系**;若 gateway 还想要二进制,得并存。
- **结论**:**"承认是 JSON-REST 店"的自洽终点**,且让 Swift 从最痛变最省。

### 3.4 AsyncAPI(事件面专用)
- **原理**:用类 OpenAPI 的语法描述 channel/message(对应 Socket.io 的 `receiveMessage`/`call:*` 等事件 payload)。
- **强项**:补上 OpenAPI 的盲区(实时事件),让 `message.send` / `receiveMessage` 的 payload 也有单一真相。
- **弱项**:各语言代码生成成熟度参差,Swift 侧尤其弱;现实里常**只用它做 schema 文档 + 校验**,生成仍部分手写。
- **结论**:与 OpenAPI 搭配用于事件面;期望值放在"文档 + 校验 + 契约测试",而非"完美生成"。

### 3.5 TypeSpec(上游统一层,可选对冲)
- **原理**:写一份 TypeSpec,**emit OpenAPI(给 REST)+ Protobuf(给需要二进制的链路)+ JSON Schema**。一个源头,多种下游。
- **强项**:避免"OpenAPI 和 Protobuf 两份手维护";面向未来。
- **弱项**:新增一层抽象与学习成本;团队需接受较新工具;最终各端仍走 OpenAPI/Protobuf 的生成器,Swift 体验取决于下游选 OpenAPI(好)还是 Protobuf(弱)。
- **结论**:若既要 REST(OpenAPI)又确有二进制需求(Protobuf),用 TypeSpec 统一上游是现代解法,但属"加分项"而非当务之急。

---

## 4. 多维对比

### 4.1 各 IDL 体系 × 关键维度

| 维度 | Protobuf+buf(现状) | Connect | OpenAPI(+AsyncAPI) | TypeSpec→下游 |
|---|---|---|---|---|
| 适配的传输 | 二进制/gRPC(JSON 需另接) | 二进制 **或** JSON over HTTP | **JSON-REST(天然)** | 取决于 emit 目标 |
| 覆盖实时事件 | 否 | server-streaming(需改造) | 否 → 配 AsyncAPI | 经下游 |
| **Swift 生成体验** | **弱(二进制类/命名分叉/非 Codable)** | 中(框架收口,但底层仍 SwiftProtobuf) | **强(官方 Codable 生成器)** | 取决于下游 |
| TS 生成体验 | 强(ts-proto) | 强(connect-es) | 强(openapi-typescript) | 强 |
| Go 生成体验 | 强(官方) | 强(connect-go) | 强(oapi-codegen) | 强 |
| 破坏性变更检测 | 强(buf breaking) | 强(buf) | 中(OpenAPI diff 工具) | 取决于下游 |
| 改造本项目的工作量 | —(现状) | **大**(重做传输层) | 中(REST 面接生成器,事件面补契约) | 大 |
| 是否消除 iOS 手写 DTO | 理论可(但形状别扭) | 可 | **可且舒服** | 取决于下游 |

### 4.2 各端代码生成成熟度速查

| 端 | Protobuf 插件 | OpenAPI 生成器 |
|---|---|---|
| Go | protoc-gen-go(一等) | oapi-codegen(一等) |
| TS | ts-proto / protobuf-es(一等) | openapi-typescript / orval(一等) |
| **Swift** | **SwiftProtobuf(弱,二进制导向)** | **swift-openapi-generator(一等,Apple 官方)** |

> 一句话:**Protobuf 阵营 Go/TS 强、Swift 弱;OpenAPI 阵营三端都强,Swift 尤其受益。** 这正是 ourchat 选型的胜负手。

---

## 5. ourchat 适配性分析(回到自身体质)

ourchat 的真实传输是**混合**:
- 业务 REST 接口:JSON over HTTP(`/user/*`、`/api/*`)。
- 实时消息/信令:Socket.io 事件(`receiveMessage`、`message.send`、`read.report`、`call:*`),JSON payload。
- gateway:Go 长连接网关(原生 WebSocket),未来**可能**上 gRPC 内部链路。

由此推导:
- 业务面**本质是 JSON-REST**,不是 RPC/二进制。用二进制 IDL 工具链(纯 Protobuf+SwiftProtobuf)是"工具假设 ≠ 实际传输",Swift 这端代价最大。
- 实时面**本质是事件广播**,既不是 REST 也不是 RPC 调用,Protobuf/OpenAPI 都不直接覆盖,**需要事件契约(AsyncAPI 或受测试守护的手写契约)**。
- gateway 若真要二进制/gRPC,Protobuf 在那条链路仍有价值——**不必非黑即白,可分链路选型**。

---

## 6. 推荐方案与落地路径

### 6.1 总判断
- **不要动 buf**——它没错,是 Protobuf 治理的最佳实践。
- ourchat 体质更像 **JSON-REST + 实时事件**,故**长期最佳是 OpenAPI(REST 面)+ AsyncAPI/契约测试(事件面)**,Swift 由最痛变最省;Protobuf 仅保留给 gateway 真正需要二进制的内部链路。
- 若团队的既定方向是"全面 RPC 化、gateway 上 gRPC",则**全面 Connect**亦是自洽最佳实践——保留 Protobuf+buf,把传输补齐到 Connect。两者都是"对"的,关键是**先定传输范式**。

### 6.2 分阶段落地(推荐:JSON-REST + OpenAPI 路线)
- **阶段一 · 止血(低风险、立即可做)**:从 `buf.gen.yaml` 删掉 `apple/swift` 插件段,删除零引用的 `.pb.swift`,从 `Package.swift` 去掉 `SwiftProtobuf` 依赖。**消除死代码与误导**。iOS 暂留手写 DTO 作为绑定层,但补**契约测试**(用从 schema 派生的 golden JSON fixture 断言 DTO 字段对齐),把漂移风险用 CI 钉住。
- **阶段二 · REST 面接 OpenAPI**:为业务 REST 接口写/生成 OpenAPI 文档(可由现有 zod schema 或 Prisma 推导起步),三端用 `swift-openapi-generator` / `oapi-codegen` / `openapi-typescript` 生成。**iOS 手写 DTO 由此被生成的 Codable 替换、整批删除**。
- **阶段三 · 事件面定契约**:用 AsyncAPI 描述 Socket.io 事件 payload(或保留精简手写契约),配契约测试守护,让 `receiveMessage`/`message.send` 也有单一真相。
- **阶段四(可选)· 上游统一**:若 REST 与 gateway-gRPC 并存,引入 TypeSpec 作为单一上游,emit OpenAPI + Protobuf。

> 若改走 Connect 路线:阶段一同样先止血;之后把 server 业务接口与 gateway 改造为 Connect handler,各端换 `connect-*` 客户端,实时推送改用 server-streaming。改造面显著更大,需评估是否值得为"全面 RPC 化"投入。

### 6.3 跨仓同步提醒
`buf.gen.yaml`、IDL 工程属**两仓共享**(our-chat 与 agent-server 同属一个项目)。任何对生成管线的改动需**两仓同步 + 评审**,不可只改一边。

---

## 7. 风险与未决项

| 项 | 说明 | 处置 |
|---|---|---|
| OpenAPI 文档的"单一真相"从哪来 | 现有契约散在 zod(server)/ proto / 手写多处,需确定 OpenAPI 由谁派生、谁权威 | 阶段二前先定"OpenAPI 源头",避免又一份手维护 |
| 事件面生成成熟度不足 | AsyncAPI 各语言生成弱,尤其 Swift | 期望值定在"文档 + 校验 + 契约测试",事件 payload 可控量手写 |
| `swift-openapi-generator` / Connect-Swift 的版本与活跃度 | 本报告基于既有认知,**版本/维护现状需以官方文档为准** | 选定方向后,拉官方文档核实当前版本、传输插件、对本项目 JSON 形状(数字 int64 等)的处理 |
| int64 数字 vs proto3 JSON 字符串 | 现状服务端发数字,proto3 JSON 规范发字符串 | 无论哪条路线,都要在契约里明确 int64 的 JSON 表示并加测试 |

---

## 8. 一页结论

- **buf 不背锅**,它是 Protobuf 治理最佳实践。
- 错配是**"二进制 IDL 工具链 × JSON 传输"**,且 **Swift 是 Protobuf 阵营的弱项**(无一等 Codable 生成器、命名分叉、类型笨重)。
- ourchat 体质 ≈ **JSON-REST + 实时事件** → 长期最佳 **OpenAPI + AsyncAPI**,Swift 由 `swift-openapi-generator` 转为一等公民;Protobuf 留给 gateway 真二进制链路。
- 若既定"全面 RPC 化" → **全面 Connect** 亦自洽,改造面更大。
- **当务之急**:无论走哪条,先**删掉零引用的 SwiftProtobuf 生成物与依赖**(消除死代码),再按选定传输范式推进。
