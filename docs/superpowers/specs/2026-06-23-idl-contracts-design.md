# 跨端契约 IDL 方案设计(Protobuf + buf)

## 1. 目标与背景

our-chat 的 server(TS)、web(TS)、gateway(Go)、mobile-swift(Swift) 四端各自手写契约,
已出现不一致:消息 `senderId` 在 server 为 BigInt、web 为 number;web 缺 `seq/lastSyncedSeq/
lastReadSeq` 等核心字段;`fileInfo` 结构各端不同;`call:*` 信令完全无 schema。无单一真相源,
新增字段靠手动对齐。

引入一套 IDL 作为**唯一契约真相源**,自动生成各端类型,CI 防止再次漂移。

## 2. 范围

- **覆盖端**:server、web、gateway(Go)、mobile-swift(Swift) 四端。
- **覆盖契约**:REST 请求/响应、数据模型 DTO、Socket.io/WS 实时事件(message.send / receiveMessage /
  read.report / read.sync / mention / presence / call:* 信令)。
- **传输不变**:HTTP/Socket.io 上仍走 JSON。IDL 只做 schema 与类型/校验单一源,**不引入 gRPC/二进制**。
- **不改 DB 真相源**:Prisma 仍是数据库 schema 真相源;proto 只定义线上 wire DTO,二者映射在 server 做。

## 3. 选型:Protobuf + buf

语言中立的 `.proto` 作单一源,buf 编排生成四端类型:
- TS(server+web):`protoc-gen-es`(protobuf-es,TS 原生、tree-shakable)
- Go(gateway):官方 `protoc-gen-go`
- Swift(mobile):Apple 官方 `protoc-gen-swift`(SwiftProtobuf)

选 Protobuf 而非 Zod-first / TypeSpec 的理由:四端含 Go + 覆盖实时事件 + 要 CI 级防漂移时,
Protobuf 的多语言 codegen 最成熟,且 `buf breaking` 可在 CI 拦截不兼容改动。

**校验策略(A2)**:proto 只管类型单一源;server 在 socket/REST 边界保留薄 Zod 做运行时校验;
其余端只消费生成类型。(后续可升级 protovalidate 把约束也写进 proto,本期不做。)

## 4. 架构与目录

单一源置于仓库根 `proto/`,生成物**入库**(各端构建无需安装 buf):

```
proto/
  buf.yaml                       # 模块 + lint/breaking 规则
  buf.gen.yaml                   # 插件 → 各端输出路径
  ourchat/
    common/v1/common.proto       # Id 包装、分页、错误、时间戳约定
    user/v1/user.proto           # AuthUser、登录 DTO
    message/v1/message.proto     # Message DTO + message.send/receiveMessage 事件
    conversation/v1/conversation.proto
    read/v1/read.proto           # read.report / read.sync
    presence/v1/presence.proto
    call/v1/call.proto           # call:* 信令

生成 →
  server/src/contracts/gen/         (protobuf-es)
  web/src/contracts/gen/            (protobuf-es)
  gateway/internal/contracts/gen/   (protoc-gen-go)
  mobile-swift/Sources/Contracts/Gen/ (protoc-gen-swift)
```

- 领域一文件,带 `v1` 版本号便于演进。
- 根 `Makefile` 加 `make proto`:`buf generate` 一键重生成全部四端。
- 生成插件优先用 buf **远程插件**(BSR),本地只需 buf;离线/CI 可改本地插件。

## 5. Schema 约定

- **JSON 映射**:proto3 JSON。字段驼峰(clientMsgId/conversationId,与现状一致)。
- **int64 → string**:所有 id(int64)在 JSON 中序列化为 string,统一 id 类型、根治 BigInt vs number。
  这是 id 线上类型的变更(number→string),需四端协同更新解析,按域分批滚动。
- **时间戳**:用 `google.protobuf.Timestamp`(JSON 为 RFC3339 字符串);现有毫秒时间戳在 server 端转换。
- **JSON 自由字段**:`extra`、`fileInfo` 等用 `google.protobuf.Struct` 或显式 message;`fileInfo` 趁机
  统一为显式 message(fileName/fileSize/fileUrl/fileType/fileMd5)。
- **枚举**:消息 type、消息 status 等用 proto enum(默认值留 `*_UNSPECIFIED = 0`)。
- **事件建模**:每个 Socket.io 事件的 payload 定义为一个 message;事件名("message.send" 等)用集中
  常量/枚举登记,name→payload 类型一一对应。`call:*` 补齐 schema。

## 6. 校验、CI、迁移

- **校验(A2)**:server 边界保留 Zod;客户端消费类型。
- **CI 防漂移**:`buf lint` + `buf breaking`(对上一版 proto 比对,不兼容则失败)+ 生成物新鲜度检查
  (`buf generate` 后 `git diff --exit-code`)。
- **增量迁移(零回归)**:按域推进
  1. `message`:先建 proto + 生成四端 → 替换 server/web 手写类型为生成类型(保持 wire JSON 不变)。
  2. 补 mobile-swift / gateway 消费 message 类型。
  3. conversation / read / presence。
  4. call 信令(从裸 emit 补成 schema)。
  - id 改 string 的切换单独作为一步,四端协同;在此之前生成类型保持与现状兼容。

## 7. 不在本期范围

- 不切 gRPC / protobuf 二进制传输。
- 不用 proto 取代 Prisma 作 DB 真相源。
- 不引入 protovalidate(校验进 proto)——留作后续升级。
- 不覆盖 mobile-flutter(Dart);如需,后续加一个生成目标即可。

## 8. 成功标准

- `proto/` 下一份 message 契约,`make proto` 一键生成四端类型且各端可编译。
- server 与 web 的消息相关手写类型被生成类型替换,二者字段一致。
- CI 能在 proto 不兼容改动或生成物过期时失败。
