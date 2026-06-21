# 02 · agent-server 接入契约对齐复盘

> 8 个契约 bug 一次性被审计出来后的全量修复记录,以及为什么"47 个测试全过"反而误导了我。
> 适用读者:做"前后端跨服务集成"的任何工程师;校招学生面试可作"测试套自欺欺人"案例。

---

## 0. TL;DR

我自己根据 agent-server 的**审计报告**(高层文字描述)写了 web 客户端,**没逐字段对源码**。47 个单元测试全过,但是测试用的 mock 是我自己脑补的契约形状,服务端真实 DTO 跟我想的对不上。8 个 bug 中 5 个会让功能完全崩。修复后用 **fixture 层**把测试的 mock 数据集中到 `__fixtures__/agentServer.ts`,所有 mock 派生于此,**服务端契约一改 → TS 编译挂 / 测试联动失败**,把"测试自我证明"这个反模式堵死。

---

## 1. 8 个 bug 全表

| # | 严重度 | 我以为 | 服务端真实(file:line) | 表现 |
|---|---|---|---|---|
| 1 | 致命 | `{ accessToken, tokenType, expiresIn, user }` | `{ token, user }`<br>`auth/dto/auth-response.dto.ts:9-12` | 登录 `setToken(undefined)`,后续全 401 |
| 2 | 致命 | `agentRegister(u, p)` 2 参 | DTO 三字段全必填 `(u, p, displayName)`<br>`auth/dto/register.dto.ts:26-33` | 注册 400 validation error |
| 3 | 致命 | 客户端密码 ≥6 | 服务端 `@MinLength(8)`<br>`register.dto.ts:19` | 客户端过、服务端拒 |
| 4 | 高 | `AgentDocument.byteSize / errorMessage` | Prisma `sizeBytes / errorMsg`<br>`prisma/schema.prisma:36,40` | 文档列表大小 `undefined B`,错误信息不显示 |
| 5 | 致命 | run SSE 用 `es.onmessage` | NestJS `@Sse()` 发 `event: <type>\ndata: ...\n\n`<br>`runs.controller.ts:65,91` | **所有 run 事件静默丢弃,任务时间线永远空** |
| 6 | 致命 | chat error 帧 `{ type: 'error', message }` | `event: error\ndata: { message }\n\n`<br>`conversations.controller.ts:85` | error 帧 fall through,UI 卡 placeholder |
| 7 | 中 | username 正则允许中文 | `^[A-Za-z0-9_-]+$`<br>`register.dto.ts:10` | 前端校验通过、服务端拒 |
| 8 | 低 | `RunEvent.id: number`,`Number(lastEventId)` | `id: String(sequenceNo)`,实际是 string<br>`runs.controller.ts:91` | 非纯数字 id 被吞成 0,丢序号 |

---

## 2. 为什么 47 个测试全过却照样错

### 2.1 测试的反模式

```
我写的 type.ts ──→ 我写的 mock 数据 ──→ 我写的测试 ──→ 我写的实现
       ↑________________________________________________│
                  闭环,跟服务端无关
```

测试在验证 "我的代码跟我的 type 一致",**没在验证 "我的 type 跟服务端 DTO 一致"**。这是经典的契约自我证明。

具体例子:
```ts
// 我的测试
mockedLogin.mockResolvedValue({
  accessToken: 'TK',          // ← 我脑补的字段
  tokenType: 'Bearer',
  expiresIn: 3600,
  user: { id: 1, username: 'alice' },
});
// 我的实现
setToken(data.accessToken);   // ← 在 mock 数据里有,所以测试过
// 真实服务端返回
{ token: 'TK', user: {...} }  // ← 上线后 data.accessToken === undefined
```

### 2.2 一般工程怎么避免

| 级别 | 工具 | 成本 | 何时引 |
|---|---|---|---|
| L1 手工 | 跑一遍服务,curl 收 JSON 做 fixture,所有 mock 派生于此 | 极低 | 起步阶段就该有 |
| L2 类型同步 | `pnpm openapi-typescript` 或 `nest-cli openapi` 生成 TS 类型 | 低 | 服务端有 OpenAPI |
| L3 契约测试 | Pact / msw + OpenAPI fixtures + 服务端验证 provider 实现 | 中 | 跨团队协作 |
| L4 端到端 | Playwright 起真服务跑 e2e | 高 | 关键流程兜底 |

**我跳过了 L1**,直接靠"我以为的契约"做 mock。这次修复后落到 L1,代价为零。L2/L3 留作后续。

---

## 3. 8 个修复对照(代码层面)

### 3.1 登录 token 字段

```diff
- export interface AgentLoginResp {
-   accessToken: string;
-   tokenType: 'Bearer';
-   expiresIn: number;
-   user: AgentUser;
- }
+ export interface AgentLoginResp { token: string; user: AgentUser; }
```

```diff
  const data = await request<AgentLoginResp>('/auth/login', { ... });
- setToken(data.accessToken);
+ setToken(data.token);
```

同时 `AgentUser` 的 `displayName / roleCode` 从可选改成必填(对齐 `AuthUserDto`):
```diff
  export interface AgentUser {
    id: number;
    username: string;
-   displayName?: string | null;
-   roleCode?: string;
+   displayName: string;
+   roleCode: string;
  }
```

### 3.2 register 三参 + 密码 ≥8

```diff
- export async function agentRegister(username, password, displayName?) {
-   return request<{ id: number }>('/auth/register', { ... });
- }
+ export async function agentRegister(
+   username: string, password: string, displayName: string,
+ ): Promise<AgentLoginResp> {
+   return request<AgentLoginResp>('/auth/register', {
+     method: 'POST',
+     body: JSON.stringify({ username, password, displayName }),
+   });
+ }
```

LoginGate 加 displayName 输入(仅注册态) + 客户端校验对齐 DTO:
- username:`^[A-Za-z0-9_-]+$`,3-64 字符
- password:8-128 字符
- displayName(仅注册):1-128 字符

### 3.3 文档字段名

```diff
  export interface AgentDocument {
    id: number;
    filename: string;
    mimeType: string;
-   byteSize: number;
-   errorMessage?: string | null;
+   sizeBytes: number;    // @map size_bytes
+   errorMsg?: string | null;  // @map error_msg
    status: DocStatus;
    chunkCount: number;
    createdAt: string;
    updatedAt: string;
  }
```

DocumentsTab 同步更新两处读取。

### 3.4 run stream 改 addEventListener

**根因**:NestJS `@Sse()` 接受 `Observable<MessageEvent { id, type, data }>`,内部按 SSE 规范输出 `event: <type>\n`。浏览器 `EventSource.onmessage` 只接默认事件(`event: message` 或无 event 行)。

```diff
- es.onmessage = (e) => {
-   const data = JSON.parse(e.data);
-   onEvent({ id: Number(e.lastEventId) || 0, type: data.type, data });
- };
+ const RUN_EVENT_TYPES = [
+   'run_started', 'run_completed', 'run_failed', 'progress',
+   'tool_called', 'tool_result', 'final_answer',
+   'ingestion_parsed', 'ingestion_chunked', 'ingestion_embedded',
+ ] as const;
+ const dispatch = (evtType: RunEvent['type']) => (e: MessageEvent) => {
+   try {
+     const data = JSON.parse(e.data);
+     onEvent({ id: e.lastEventId || '', type: evtType, data });
+   } catch { /* skip */ }
+ };
+ for (const t of RUN_EVENT_TYPES) es.addEventListener(t, dispatch(t));
```

`RunEvent.id` 从 `number` 改 `string`,跟 SSE 协议保持一致,不再 `Number()` 吞精度。

### 3.5 chat SSE 解析 event 行

readSSE 升级:从 yield 裸 JSON 改为 yield 结构化帧 `{ event?, id?, data }`:

```diff
- export async function* readSSE(body): AsyncGenerator<unknown> {
-   ...
-   const dataLines = frame.split('\n')
-     .filter((l) => l.startsWith('data:'))
-     .map((l) => l.slice(5).trim());
-   yield JSON.parse(dataLines.join('\n'));  // event/id 丢失
- }
+ export interface SSEFrame { event?: string; id?: string; data: unknown }
+ export async function* readSSE(body): AsyncGenerator<SSEFrame> {
+   // 逐行解析 event / id / data,event/id 保留
+ }
```

streamChat 以 event 名为权威,补全 type:

```diff
+ for await (const frame of readSSE(res.body)) {
+   if (frame.event === 'error') {
+     // 服务端 error 帧 data 只有 { message },必须用 event: 行还原 type
+     const m = (frame.data as { message?: string }) ?? {};
+     yield { type: 'error', message: m.message ?? 'unknown error' };
+     continue;
+   }
+   yield frame.data as ChatStreamEvent;
+ }
```

### 3.6 切会话 abort

```diff
  useEffect(() => {
+   abortRef.current?.abort();
+   abortRef.current = null;
    if (activeId == null) { setMessages([]); return; }
    ...
  }, [activeId, toast, t]);
```

旧会话的 token 不会再串到新会话渲染。

---

## 4. fixture 层 ── 防回归的核心架构补丁

新增 `src/views/agentView/__fixtures__/agentServer.ts`,作用:

1. **每条 fixture 直接对应 agent-server 的真实响应**(注释里写了源文件路径)
2. **用 `satisfies` 校验**:类型对不上 → TS 编译挂 → CI 红
3. **所有测试 mock 从 fixture 派生**,不允许 inline 自造

例子:
```ts
export const authLoginRespFixture = {
  token: 'eyJhbGc...',
  user: { id: 1, username: 'alice', displayName: 'Alice', roleCode: 'user' },
} satisfies AgentLoginResp;
```

如果服务端把 `token` 改回 `accessToken`:
1. fixture 里的字段名跟 type.ts 对不上 → TS 编译挂
2. 改 type.ts → 实现 setToken(data.token) 编译挂
3. 改实现 → 一致

这就是"消费侧契约测试"的轻量版。重量版(Pact / msw + OpenAPI)等团队扩张时再上。

---

## 5. 业界做法对照

| 公司 / 项目 | 怎么防契约漂移 |
|---|---|
| Stripe / 大部分支付 | OpenAPI spec 是 source of truth,server + client 都从此生成 |
| GraphQL 项目(Apollo / Relay) | schema.graphql + codegen,**根本不可能契约不一致** |
| gRPC 项目 | .proto 文件双端共享 |
| 普通 REST + TS | fixture / Pact / msw,本文方案就属此类 |
| 没任何防护(常见) | 上线发现 + 紧急回滚 + postmortem |

**经验法则**:跨服务集成时,**找一个 source of truth**,要么是 OpenAPI/proto/GraphQL schema,要么是手工 fixture。**没有 source of truth 时,你的测试一定在自我证明**。

---

## 6. Web vs Native(顺手对比)

| | Web TS 客户端 | iOS Swift / Android Kotlin |
|---|---|---|
| 契约同步常见做法 | OpenAPI + openapi-typescript | OpenAPI + Swagger codegen 生成 Swift/Kotlin client |
| 字段映射 | 手写 type.ts 风险高(本文场景) | codegen 默认行为,字段对不上编译挂 |
| 字符串 enum | 手维 union literal,易漂 | Swift enum / Kotlin sealed class,编译期校验 |
| 测试 fixture | 本文方案 | XCTest + JSON fixtures 同款 |
| 端到端 | Playwright | XCUITest / Espresso |

**面试 follow-up**:为什么 Web 端社区里"手写 type + 不上 OpenAPI"还很常见?
- 早期 / 个人项目:服务端可能没 spec,前端比后端跑得快
- TS 类型够灵活,看起来"我也手写得过来"
- 直到契约漂移咬人(本文场景)

**专业建议**:**新项目第一天就该有 OpenAPI 或等价 source of truth**,即使简陋。手写 type 是技术债。

---

## 7. 完整修复清单(实施记录)

| 项 | 状态 |
|---|---|
| `type.ts` AgentLoginResp / AgentUser 对齐 | ✅ |
| `api.ts` agentLogin 改用 `data.token` | ✅ |
| `api.ts` agentRegister 三参必填 + 返 AuthResponseDto | ✅ |
| `api.ts` agentMe 返回类型用 AgentUser | ✅ |
| `type.ts` AgentDocument `sizeBytes / errorMsg` | ✅ |
| `DocumentsTab` 字段读取同步 | ✅ |
| `api.ts` streamRun 改 `addEventListener` 多类型 | ✅ |
| `type.ts` RunEvent.id 改 string | ✅ |
| `api.ts` readSSE 升级 `SSEFrame { event?, id?, data }` | ✅ |
| `api.ts` streamChat 据 event 名补 type | ✅ |
| `LoginGate` 加 displayName 输入 + 客户端校验 | ✅ |
| `LoginGate` username 正则对齐 `[A-Za-z0-9_-]+` | ✅ |
| `ConversationsTab` 切会话 abort 当前流 | ✅ |
| `__fixtures__/agentServer.ts` 新增 | ✅ |
| 所有测试改用 fixture 派生 mock | ✅ |
| 加 LoginGate 新校验路径测试 / readSSE event 行测试 / streamChat error 帧测试 | ✅ |
| **54 个测试全过**(原 47 + 7 新增) | ✅ |
| 复盘文档(本文) | ✅ |

---

## 8. 留账(下一轮 / OAuth phase 再做)

- `LoginGate` 抽 `AuthStrategy` 接口为 OAuth 留口子 ── 当下 YAGNI
- `DocumentsTab` 5s 轮询改退避状态机 ── UX polish
- SSE token 走 query 是安全妥协(URL 进 access log)── 后续生产应该:
  - 用 cookie 鉴权 SSE,或
  - 一次性短 TTL SSE token endpoint
- 升 L2 契约同步(openapi-typescript 自动生成 TS)── 服务端有 swagger,值得做

---

## 9. 关键认知(全文压缩)

1. **测试只能验证你写的东西自洽,不能验证你写的东西跟外部对得上**。需要 source of truth。
2. **fixture 层**是零成本的 L1 契约防护 ── 测试 mock 全部派生于"来自真实服务的样本"
3. **SSE 不只是 `data:` 行**。`event:` / `id:` 行决定事件路由,NestJS `@Sse()` 一定带 `event:`
4. **`EventSource.onmessage` 只接 default event**,带 `event:` 头的事件必须 `addEventListener`
5. **服务端 DTO 字段名 ≠ 你脑补的命名**。`size_bytes` 还是 `byteSize`、`error_msg` 还是 `errorMessage`,**不读源码就是赌**
6. **客户端校验必须跟服务端 DTO 约束对齐**,否则前端过、后端拒,UX 一坨
7. **新接入服务,第一步永远是 curl 真实接口收 JSON 样本**,不是"看完 README 开干"
