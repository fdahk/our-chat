# 实时通信契约边界 —— 为何 OpenAPI 盖不住事件流

> 范围:讲透"为什么 REST 接口能用 OpenAPI 一份契约生成各端代码,而 Socket.io / WebSocket 的实时事件不能",以及"把 Socket.io 换成原生 WebSocket 自封装应用层协议,能不能让 OpenAPI 变完美"。配套上一篇《跨端 IDL 与代码生成选型分析》。
> 结论先行:**能不能被 OpenAPI 描述,取决于"交互模型"(一问一答 vs 事件流),不取决于"用哪个 WS 库"。OpenAPI 的数据模型骨子里就是 HTTP 的"客户端发起、一问一答、传输层自动配对、按 URL+动词寻址";WebSocket/Socket.io 是"服务端可主动推、一条连接无限条异步事件、应用层自己配对、按事件名路由"——这是模型层的不可调和,换原生 WS 也一样。正确做法是分层:REST 面用 OpenAPI、数据形状用共享 JSON Schema(REST 与 WS 复用)、事件面用 AsyncAPI 或受契约测试守护的手写协议。**

---

## 0. 术语表(先读)

| 术语 | 全称 / 含义 | 通俗解释 |
|---|---|---|
| **交互模型(interaction model)** | — | "谁先开口、一次开口对应几次回话、连接活多久"的范式。本报告的核心轴:一问一答 vs 事件流。 |
| **unary(一元)** | — | 最经典的一问一答:client 发 1 个请求,server 回 1 个响应,然后这次交互结束。REST 的 `GET/POST`、gRPC 的普通调用都是。 |
| **streaming(流式)** | — | 一次交互里有"多条"消息。细分:server-streaming(1 请求→N 响应)、client-streaming(N 请求→1 响应)、bidirectional(双向、各发各的)。 |
| **pub/sub(发布订阅)** | publish / subscribe | server 把事件"扇出"给一批订阅者,**与任何单个 client 的请求解耦**。IM 群消息广播、Kafka、MQTT 都是这模型。 |
| **HTTP** | HyperText Transfer Protocol | 万维网的请求/响应协议。client 发 request,server 回 response,**一次请求一个响应**。 |
| **HTTP/2 多路复用** | multiplexing | 一条 TCP 连接上并行跑多个 HTTP 请求/响应流,但**应用语义仍是一问一答**。 |
| **SSE** | Server-Sent Events | 基于 HTTP 的"服务端→客户端单向推送流"。client 发一次请求,server 持续往回写事件。是 HTTP 世界里的"半个实时"。 |
| **WebSocket(WS)** | — | RFC 6455 定义的全双工协议。先用一次 HTTP 握手"升级",之后这条 TCP 连接变成**双向、基于帧(frame)的通道**,两端任何时刻都能发数据,**没有请求/响应语义**。 |
| **帧(frame)** | — | WebSocket 在 TCP 之上的最小传输单元:含 opcode(文本/二进制/ping/pong/close)+ payload。WS 收发的就是一个个帧,不是"请求"和"响应"。 |
| **HTTP Upgrade 握手** | — | WS 建连第一步:client 发一个带 `Upgrade: websocket` 头的 HTTP 请求,server 回 `101 Switching Protocols`,**之后该连接不再是 HTTP**。 |
| **Engine.IO** | Socket.io 的传输层 | 负责"建连、心跳、WebSocket↔长轮询降级"。Socket.io 跑在它上面。 |
| **Socket.io** | — | 在 WS(经 Engine.IO)之上加了**事件名、ack 回调、rooms(广播分组)、namespaces、自动重连**的库。wire 帧形如 `42["receiveMessage",{...}]`(4=message、2=EVENT)。**它是"协议之上的协议"。** |
| **ack(确认回调)** | acknowledgement | Socket.io 里"发一个事件并等对端回一个值"的机制——这是**库在应用层模拟出来的一问一答**,不是传输层提供的。 |
| **OpenAPI** | 原 Swagger | 描述 **HTTP/JSON REST 接口**的 IDL:`paths → 动词 → 请求体 → 按状态码组织的响应`。 |
| **callbacks / webhooks(OpenAPI)** | — | OpenAPI 里描述"服务端反过来对客户端发起 HTTP 请求"的特性(如回调 URL)。**注意:它仍是 HTTP 请求/响应,不是 socket 事件。** |
| **AsyncAPI** | — | OpenAPI 的"事件版"姊妹规范,专描述异步消息系统(WebSocket / Kafka / MQTT / AMQP…):有 `channels`(通道)、收发方向、`messages`(事件类型)、`bindings`(协议绑定)。 |
| **JSON Schema** | — | 描述"一段 JSON 的结构约束"的标准。**OpenAPI 的 `components/schemas` 与 AsyncAPI 的 `payload` 底层都是它**——所以数据形状可跨两者共享。 |
| **discriminator / tagged union(判别联合)** | — | 用一个 `type` 字段区分一组形状不同的消息(`{type:"receiveMessage", payload:...}`)。对应 Swift 的 `enum` 关联值、TS 的可辨识联合。自研 WS 协议时的关键设计。 |
| **wire format(线格式)** | — | 数据在网线上真正的字节编码。 |
| **契约测试(contract test)** | — | 用"黄金样例(golden fixture)"断言"代码解析出的结构与契约一致",在 CI 拦截漂移。手写协议时用它兜底。 |

---

## 1. 先回答那个直觉:"换原生 WS 自封装,OpenAPI 是不是就完美了?"

**不会。** 因为你混淆了两个不同的层:

- **Socket.io vs 原生 WS** 的差别在「**库 / 帧封装**」层。
- 「**能否被 OpenAPI 描述**」取决于「**交互模型**」层。

原生 WS 和 Socket.io 都是同一种交互模型:**持久连接、双向、服务端可主动推、一条连接上跑无限条异步事件**。你自封装应用层协议,只是把 Socket.io 已经提供的东西(事件名、ack、广播)**重造一个子集**——交互模型一个字没变,所以**照样在 OpenAPI 的模型之外**。

> 类比:OpenAPI 是"表格(一行一个请求,一列一个响应)"的语言。事件流是"一条永不挂断的电话,两边随时插话"。你把电话从座机换成手机(Socket.io→原生 WS),它还是电话,不会因此变成能填进表格的东西。

要理解为什么,得先把"交互模型"这根轴讲清楚。

---

## 2. 交互模型光谱(全文的核心框架)

把"通信"按"谁发起、一次交互几条消息、连接活多久"排成一条谱:

| 模型 | 形态 | 谁发起 | 典型协议/技术 | OpenAPI 能描述? |
|---|---|---|---|---|
| **unary 一元** | 1 请求 → 1 响应,结束 | 客户端 | REST `GET/POST`、gRPC 普通调用 | ✅ |
| **server-streaming** | 1 请求 → N 响应(server 持续推) | 客户端发起 | SSE、gRPC server-stream | ❌(OpenAPI 无流概念) |
| **client-streaming** | N 请求 → 1 响应 | 客户端 | gRPC client-stream | ❌ |
| **bidirectional 双向流** | N ↔ N,两端随时发 | 任一端 | **WebSocket**、gRPC bidi | ❌ |
| **pub/sub 发布订阅** | server 扇出事件给一批订阅者,**与单个请求解耦** | **服务端主动** | **Socket.io rooms**、Kafka、MQTT | ❌ |

- **OpenAPI 只覆盖最左一档(unary)**。
- **gRPC/Connect 覆盖 unary + 三种 streaming**(这就是上一篇说"全面 Connect 能一套盖住"的根据)。
- **ourchat 的实时面(`receiveMessage` 广播、`message.send`/`ack`、`call:*` 信令)落在最右两档**——bidi + pub/sub。

**一句话:OpenAPI 盖不住实时,不是因为"socket.io 特殊",而是因为实时面在"一元"档之外。**

---

## 3. OpenAPI 的模型边界:四条焊死的假设

OpenAPI 这份规范自身的结构:

```
paths:
  /user/messages:        # ① 地址 = URL
    get:                 # ② 地址 = HTTP 动词
      requestBody: ...   # ③ 恰好一个请求体
      responses:         # ④ 按 HTTP 状态码组织的响应
        '200': { content: { application/json: { schema: { $ref: Message } } } }
```

它把四条假设**写进了数据结构**,无处安放例外:

1. **客户端发起**:一切以 client 发 request 起头。→ 没有"服务端没被请求就推"的位置。
2. **一问一答**:每个 operation 一个 request、一组按状态码的 response。→ 没有"一次交互 N 条消息"的位置。
3. **传输层自动配对**:哪个 response 对应哪个 request,HTTP 协议天然管好。→ 没有"应用层用 `clientMsgId` 自己配对 ack"的位置。
4. **按 URL+动词寻址**:接口的"键"是 `path + method`。→ 没有"按事件名(`receiveMessage`)路由"的位置。

**具体演示**:试着在 OpenAPI 里表达"**有人发消息时,服务端推一条 Message 给我**"——你写在哪?
- 它没有 URL(不是某个 `path`);
- 没有动词(不是 GET/POST);
- 没有状态码(不是 `200/404`);
- 没有客户端请求(不是任何 operation 的触发)。

**OpenAPI 的语法树里根本没有那个槽。** 这不是"工具不够强",是规范的数据模型就是 unary HTTP 形状。

> **连 OpenAPI 的 `callbacks`/`webhooks` 也救不了**:它们描述的是"服务端反过来对一个 URL 发起一次 **HTTP 请求**"(如支付回调),本质仍是**请求/响应**,不是"一条 socket 上的事件"。所以即便用上 OpenAPI 最"反向"的特性,它依然在 req/resp 模型里。**——再次证明是模型问题,不是功能缺失。**

---

## 4. WebSocket 到底是什么(wire 层讲透)

为什么 WS"协议层就没有请求/响应语义"?看它的生命周期:

1. **握手(唯一一次用到 HTTP)**:client 发一个带 `Upgrade: websocket`、`Connection: Upgrade`、`Sec-WebSocket-Key` 头的 **HTTP/1.1 请求**;server 回 `101 Switching Protocols`。
2. **升级后,这条 TCP 连接不再是 HTTP**:它变成 RFC 6455 的**帧协议**。之后两端来回发的是一个个 **帧(frame)**:每帧带一个 opcode(`0x1` 文本 / `0x2` 二进制 / `0x9` ping / `0xA` pong / `0x8` close)+ payload。
3. **没有"请求""响应"这两个概念**:帧就是帧。client 可以连发 3 个帧不等任何回应;server 可以在 client 一言不发时主动推 10 个帧。**配对、顺序、语义,全是应用层自己的事**。

对比 HTTP:

| | HTTP/1.1 | WebSocket |
|---|---|---|
| 谁能主动发 | 只有 client 起头 | 两端任意时刻 |
| 一次交互 | 1 请求 ↔ 1 响应 | 一条连接无限帧 |
| 配对 | 协议层自动(响应跟着请求回) | **应用层自己做** |
| 寻址 | URL + 动词 | **应用层自己定**(帧里塞个 type) |
| 连接寿命 | 短(一问一答即可关) | **长(持续存活)** |

**所以 WS 在协议层只给你"一根能双向随便发字节的管子",至于"管子里跑什么消息、叫什么名、谁回谁",全得应用层自己规定。** 这层"自己规定的东西"就是契约——而它的形状(事件、方向、扇出)正好是 OpenAPI 没有、AsyncAPI 才有的。

---

## 5. Socket.io = WebSocket 之上的一层

很多人以为 Socket.io 是"另一种 WS",其实它是**架在 WS(经 Engine.IO)之上的应用层协议 + 库**,补了原生 WS 没有的东西:

- **事件名**:把"裸帧"包成 `42["receiveMessage", {payload}]`(Engine.IO 包类型 4=message,Socket.IO 包类型 2=EVENT,后面跟 `[事件名, 数据]`)。
- **ack 回调**:`emit(event, data, cb)`——发一个事件并等对端回值。**这是库在应用层模拟的一问一答**,传输层并不提供。
- **rooms / 广播**:`io.to(room).emit(...)`,把一条事件扇给一批连接——**pub/sub 就是这么来的**。
- **namespaces、自动重连、心跳、二进制、长轮询降级**。

**关键**:Socket.io 加的这些(事件名、ack、广播)恰恰是"事件流契约"要描述的内容,而它们**全在 WS 协议之上的应用层**。

---

## 6. 为什么"Socket.io vs 原生 WS"对"可被 OpenAPI 描述"毫无影响

现在把第 4、5 节拼起来:

- 原生 WS:给你一根双向管子,**应用层契约(事件名/方向/配对)要你自己定**。
- Socket.io:在管子上**替你定了**一套(事件名 + ack + 广播)。

无论哪种,**最终都存在一份"应用层事件契约"**,且这份契约描述的是**双向 + 服务端可推 + pub/sub** ——**OpenAPI 的模型里没有承载它的结构**。

> 你换原生 WS 自封装,等于**把 Socket.io 替你定的那套,改成你自己定一套**。契约的**内容载体变了(从库默认变成你的设计),但契约的"形状"(事件流)没变**,所以 OpenAPI 依旧装不下。

**这就是你"没理解"的那个点:OpenAPI 装不下的,从来不是"Socket.io 这个库",而是"事件流这种交互模型"。换库不换模型,等于没换。**

---

## 7. 什么能共享、什么不能:契约分层

把契约拆成两层,边界就清楚了:

```
                        ┌──────────────────────────────────────────┐
                        │  数据形状层(JSON Schema)                  │
   REST 与 WS 共享 ────→ │  Message / FileInfo / Conversation / ...   │
                        │  —— 只是 JSON 对象的结构,与传输无关         │
                        └───────────────┬──────────────┬─────────────┘
                                        │              │
                    ┌───────────────────┘              └────────────────────┐
                    ▼                                                        ▼
        ┌───────────────────────┐                          ┌────────────────────────────┐
        │ REST 端点(一问一答)   │                          │ 事件目录(事件流)            │
        │ 路径 + 动词 + 状态码    │                          │ 事件名 + 方向 + 配对/广播     │
        │ → OpenAPI 完美承载      │                          │ → OpenAPI 无槽;AsyncAPI/手写 │
        └───────────────────────┘                          └────────────────────────────┘
```

- **数据形状层**:`Message`、`FileInfo` 这些**只是 JSON 对象的 schema**,与"走 REST 还是 WS"无关。OpenAPI 的 `components/schemas` 和 AsyncAPI 的 `payload` 底层**都是 JSON Schema**,所以这一份**写一次、两边复用**。
  - 对 ourchat 的直接好处:`GET /user/messages`(历史)和 `receiveMessage`(实时)**是同一个 `Message` 实体**——OpenAPI 生成的 `Message` Codable 类型,**可以直接拿去解 socket 的 payload**。
- **接口层**才分叉:
  - REST 端点(一问一答)→ OpenAPI 完美承载。
  - 事件目录(事件流)→ OpenAPI 无槽 → AsyncAPI 或手写契约 + 契约测试。

**所以"OpenAPI 盖不住实时"要说精确:它盖不住的只是"事件/通道那一层(名字、方向、扇出)",不是数据本身。数据形状照样能统一。缺口比"实时全都管不了"小得多。**

---

## 8. AsyncAPI:正好补上 OpenAPI 缺的那几个槽

AsyncAPI 的结构,恰好有第 3 节里 OpenAPI 没有的维度:

```yaml
# 概念示意(AsyncAPI 3.0 用 operations 的 send/receive;2.x 用 publish/subscribe,语义同此)
channels:
  chat:                       # ① 通道(那条连接)
    messages:
      receiveMessage:         # ② 事件名
        payload: { $ref: '#/components/schemas/Message' }   # 复用同一份 JSON Schema
      messageSend:
        payload: { $ref: '#/components/schemas/SendMessageInput' }
operations:
  onReceiveMessage:
    action: receive           # ③ 方向:客户端"收"
    channel: { $ref: '#/channels/chat' }
    messages: [ { $ref: '#/channels/chat/messages/receiveMessage' } ]
  sendMessage:
    action: send              # 方向:客户端"发"
    channel: { $ref: '#/channels/chat' }
```

它有:
- `channels`(通道/连接)——OpenAPI 没有;
- `action: send/receive`(方向)——OpenAPI 没有;
- `messages`(事件类型,按名字)——OpenAPI 按 URL+动词,没有"事件名";
- `bindings`(协议绑定:`ws`/`kafka`/`mqtt`…的特有参数)——OpenAPI 没有。

**代价(诚实说)**:AsyncAPI 的**代码生成成熟度**远不如 OpenAPI,**Swift 侧尤其弱**。现实里它常被当作"**事件契约的文档 + 校验源**",生成部分仍需手写 + 契约测试兜底。所以它解决的是"**事件有没有单一真相**",不是"**事件代码能不能全自动生成**"。

---

## 9. 映射到 ourchat:三类接口分别归谁

| 接口 | 例子 | 归属 |
|---|---|---|
| **REST(一问一答)** | `/api/login`、`/api/refresh`、`/user/profile`、`/user/getFriendList`、`/user/searchUser`、`/user/addFriend`、`/user/getFriendReqs`、`/user/replyFriendReq`、`/user/userConversations`、`/user/conversations`、`/user/messages`、`/user/lastMessages`、`/api/upload/single` | **OpenAPI** 完美覆盖;iOS 手写 DTO 几乎全删 |
| **实时事件的「数据」** | `receiveMessage` 的 payload(= `Message`) | **复用 OpenAPI/JSON Schema 生成的 `Message` 类型** |
| **实时事件的「语义」** | `message.send` / `message.ack` / `message.error`、`read.report` / `read.sync`、`call:start/accept/reject/end/ice/rejoin`、`call:peer-reconnecting` 等的**事件名 + 方向 + 配对** | **AsyncAPI 或 手写契约 + 契约测试** |

**净效果**:OpenAPI 这一步就能让 iOS 把绝大多数手写 DTO 换成生成的 Codable;实时面的"数据"白拿(复用类型),只剩"事件目录"这薄薄一层要单独立约。

---

## 10. 如果决定"自研原生 WS 应用层协议":设计建议

换原生 WS 不是为了"让 OpenAPI 完美"(做不到),而可能是为了**去 socket.io 库锁定、自己掌控 wire、让契约/生成更顺**。若走这条,协议应这样设计才对生成友好:

1. **统一信封 + 判别字段**:所有事件统一成
   ```json
   { "type": "receiveMessage", "id": "evt-123", "ts": 1719500000, "payload": { ... } }
   ```
   - `type` 作判别字段 → Swift 端可生成一个 `enum Event { case receiveMessage(Message); ... }`(可辨识联合),一个通用解码器吃所有事件。
   - `id` 用于**应用层 ack 配对**(替代 Socket.io 的 ack 回调)。
   - `payload` 用**与 REST 共享的 JSON Schema 实体**。
2. **方向显式**:契约里标清每个 `type` 是上行(client→server)、下行(server→client)还是双向。
3. **一份事件契约**(AsyncAPI 或一份带 schema 的清单)+ **契约测试**:用 golden JSON 钉住"每个 `type` 的 payload 形状",CI 防漂移。
4. **自己补 Socket.io 的电池**:重连(带退避)、心跳、断线缓冲、必要的"广播/分组"在服务端实现。

**这样做的收益**:wire 可控、无库锁定、判别联合让多端事件解码都很整齐、契约更利于(哪怕半自动的)生成。**代价**:Socket.io 现成的重连/ack/rooms/降级都要自己实现并测。**但请记住:即便如此,事件契约仍在 OpenAPI 之外——这一步省不掉。**

---

## 11. 决策结论

1. **"换 WS 实现让 OpenAPI 一统"是个伪命题**:OpenAPI 的边界由**交互模型**(unary)决定,与 WS 库无关。事件流(bidi + pub/sub)永远在它之外。
2. **唯一"单一工具盖全"的理论解是全面 Connect/gRPC**(unary + streaming 一套盖住 REST 和实时),代价是替换 Socket.io + 重做传输 + Connect-Swift 仍非最惯用 + streaming ≠ 现有广播扇出模型。对已运转的 IM 性价比低。
3. **务实最优 = 分层契约**:
   - REST 面 → **OpenAPI**(Swift 一等公民,删手写 DTO)。
   - 数据形状 → **共享 JSON Schema**(REST 与 WS 复用,实时面"数据"白拿)。
   - 事件语义 → **AsyncAPI 或手写协议 + 契约测试**(无论 Socket.io 还是自研 WS 都需要这层)。
4. **是否换原生 WS**,按"要不要去库锁定/掌控 wire"独立决策,**与 OpenAPI 完不完美无关**;若换,用"统一信封 + 判别字段"设计,对契约与生成最友好。

---

## 12. 对比速查表

| 问题 | 答案 |
|---|---|
| OpenAPI 为什么盖不住实时? | 它的数据模型是 unary HTTP(客户端发起/一问一答/传输配对/URL 寻址),没有承载"服务端推/事件流/事件名/方向"的结构。 |
| 换原生 WS 能让 OpenAPI 完美吗? | 不能。库变了,交互模型(事件流)没变,照样在 OpenAPI 之外。 |
| 那什么能跨 REST/WS 共享? | **数据形状(JSON Schema 实体)**,如 `Message`、`FileInfo`。OpenAPI 生成的类型可复用去解 socket payload。 |
| 事件那层谁来管? | AsyncAPI(有 channels/方向/事件名/绑定),或手写协议 + 契约测试。Swift 代码生成成熟度低,期望放在"契约 + 校验"。 |
| 想一套工具全盖怎么办? | 全面 Connect/gRPC(unary+streaming),但要重做传输、替换 Socket.io,性价比看团队是否走 RPC 化。 |
| 自研 WS 协议怎么设计才对? | 统一信封 `{type,id,ts,payload}` + 判别字段(判别联合)+ 显式方向 + 共享 payload schema + 契约测试。 |
