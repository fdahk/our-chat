# OAuth 一键登录:第三方应用复用 our-chat 会话与联合身份

> 第三方应用 **agent-server**(AI 助手后端)不自建登录,而是复用用户在 **our-chat** 的已登录会话,
> "一键"换出一枚 agent-server 专用的访问令牌,首次访问 zero-touch 建号并登录。
> 本文给出完整实现方案、关键设计取舍、安全分析,并回答"这和微信 OAuth 一样吗"。
>
> 代码现状(2026-06):链路已落地并可用。本文基于实际代码,关键处给出文件引用。

---

## 1. 背景与目标

our-chat web 里有一个「AI 助手」独立 tab,点进去要用 agent-server 的能力(文档 RAG、对话、agent 任务)。
agent-server 是**独立微服务**(独立进程、独立库),它需要知道"当前是哪个用户"且要做**多租户隔离**。

两个朴素做法都不好:
- **让 agent-server 自己再登录一次**:用户已经登录了 our-chat,还要再输一遍账号密码,体验割裂;agent-server 还得维护一套密码体系。
- **两边共享同一个 session**:agent-server 和 our-chat 不同源、不同库,共享 cookie/session 既不安全也不解耦。

目标:**用户在 our-chat 已登录的前提下,进入 AI 助手 = 自动获得 agent-server 的身份,无需任何额外登录动作**。这就是"微信式一键登录"的体验。

---

## 2. 角色与信任模型

| 角色 | 是谁 | 职责 |
|---|---|---|
| **IdP(身份提供方)** | our-chat 服务端(`server`,:3007) | 持 RS256 **私钥**,为已登录用户**签发** agent-server 作用域的访问令牌;暴露 **JWKS 公钥**端点 |
| **触发方(BFF 首方前端)** | our-chat web(:5173 / 同源) | 用已登录会话(cookie)向自己后端换令牌,缓存并作为 Bearer 调 agent-server |
| **RS(资源服务 / 第三方)** | agent-server(`apps/node-server`,:3101) | 只持 our-chat **公钥**(经 JWKS),**验签**令牌、校验 `iss`/`aud`,按 `(iss, sub)` 映射本地用户 |

**信任根:非对称密钥(方案 D)**。our-chat 用私钥签,agent-server 用公钥验。

```
            私钥签发 RS256 JWT
 our-chat ───────────────────────► (令牌随前端流转)
 (IdP)                                      │
   │ 公钥发布                                │ Authorization: Bearer <jwt>
   ▼                                        ▼
 GET /.well-known/jwks.json  ◄──拉公钥──  agent-server(RS)
                                          按 header.kid 选公钥 → 验签 → 校验 iss/aud
```

要点:
- **agent-server 不持任何密钥/密码**,公钥泄漏无害;
- **无状态验签**:agent-server 验令牌不需要回查 our-chat 数据库;
- **可扩展**:将来再加第三方服务,直接拉同一个 JWKS 即可,不必分发共享密钥。

(对应文档:`agent-server/docs/跨服务鉴权方案/方案D-非对称密钥JWKS.md`)

---

## 3. 端到端时序

```
用户(浏览器,已登录 our-chat)
   │
   │ 打开「AI 助手」tab(our-chat web)
   ▼
our-chat web ──①POST /oauth/agent-token (credentials:include + X-CSRF-Token)──► our-chat server(:3007)
                                                                                  │ authenticateToken:
                                                                                  │  · 校验 HttpOnly session cookie(HS256)
                                                                                  │  · 校验 CSRF 双提交(cookie==header)
                                                                                  │ 取 req.user.id = 当前登录用户
                                                                                  │ 用 RS256 私钥签 JWT
                                                                                  │  claims: iss/sub/aud=[agent-server]/scope/exp...
   ◄──② { access_token, token_type:Bearer, expires_in } ──────────────────────────┘
   │
   │ 前端缓存 token(localStorage + 内存记过期时刻)
   ▼
our-chat web ──③GET /api/auth/me  Authorization: Bearer <jwt> ──► agent-server(:3101)
                                                                    │ JwtStrategy:
                                                                    │  · 解 header.kid → 从 JWKS 拉 our-chat 公钥(缓存)
                                                                    │  · RS256 验签 + 校验 iss / aud=agent-server / exp
                                                                    │ validate(): payload.iss 存在 →
                                                                    │  federated.resolveLocalUserId(iss, sub)
                                                                    │   · 按 (issuer, subject) 查本地 user
                                                                    │   · 没有 → zero-touch 建号(passwordHash='')
                                                                    │ → AuthedUser{ userId, ... }
   ◄──④ { id, username, displayName, roleCode } ─────────────────────┘
   │
   ▼
前端 status='ready' → 渲染 AI 助手;后续所有 agent-server 请求都带同一个 Bearer
```

任一步失败(②非 200 或 ④为 401)→ 前端 `status='error'`,提示「需要先登录 our-chat」。

---

## 4. 各环节详解(附代码引用)

### 4.1 our-chat 铸令牌:`POST /oauth/agent-token`

**路由与守卫**(`server/src/oauth/index.ts`):
```ts
r.post('/agent-token', authenticateToken, makeAgentTokenHandler({ store, issuer }));
```

`authenticateToken`(`server/src/middleware/auth.ts`)做两件事:
1. **CSRF 双提交**(非安全方法才查):请求头 `X-CSRF-Token` 必须等于 cookie `csrfToken`,否则 403。
   ```ts
   const headerToken = req.headers['x-csrf-token'];
   const cookieToken  = req.cookies?.[CSRF_COOKIE];      // csrfToken(non-HttpOnly,JS 可读)
   if (!cookieToken || !headerToken || headerToken !== cookieToken) { res.status(403)...; }
   ```
2. **会话令牌校验**:HttpOnly cookie `token`(HS256,our-chat 自己的 session token,**不是** OAuth token)→ `jwt.verify(token, jwtSecret)` → 查用户存在 → 填 `req.user`。

> session cookie 与 csrf cookie 在登录时由 `setAuthCookies()` 一起下发(`server/src/utils/authCookies.ts`):`token` 走 HttpOnly,`csrfToken` 非 HttpOnly 供前端回填请求头。

**铸令牌**(`server/src/oauth/agentToken.ts` → `server/src/oauth/tokens.ts`):用 `jose` 签 RS256。
```ts
const token = await new SignJWT(claims)
  .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: store.active.kid })
  .sign(store.active.privateKey);
```

令牌 claims(`server/src/oauth/types.ts`):

| claim | 值 | 来源 |
|---|---|---|
| `iss` | `http://localhost:3007`(默认) | env `OAUTH_ISSUER_BASE_URL` |
| `sub` | 当前登录用户 id(字符串) | `req.user.id` |
| `aud` | `['agent-server']` | scope→aud 映射 `SCOPE_TO_AUDIENCE` |
| `scope` | `agent-server` | 端点硬编码 |
| `client_id` | `our-chat-web` | 默认 |
| `iat` / `exp` | 签发/过期 | `exp = iat + OAUTH_AT_TTL_SEC`(默认 **900s**) |
| `jti` | 唯一 ID | `newJti('at')` |
| header `kid` | 当前活跃密钥 ID | env `OAUTH_ACTIVE_KID` |

响应体:`{ access_token, token_type: 'Bearer', expires_in }`。

**作用域→受众**(`server/src/oauth/types.ts` / `tokens.ts`):
```ts
SCOPE_TO_AUDIENCE = { 'agent-server': 'agent-server' };  // TOKEN_AUDIENCES.RESOURCE_AGENT_SERVER
deriveAccessTokenAudience('agent-server') // → ['agent-server']
```
> `aud` 限定令牌**只能给 agent-server 用**:其它资源服务即使拿到也会因 `aud` 不匹配而拒签。

### 4.2 our-chat 发布公钥:JWKS

`server/src/oauth/index.ts` 注册:
```ts
app.get('/.well-known/openid-configuration', makeDiscoveryHandler(issuer));
app.get('/.well-known/jwks.json',            makeJwksHandler(store));
```
JWKS 把 KeyStore 里所有公钥(active + retired)序列化成 `{ keys: [{ kty, n, e, alg:'RS256', use:'sig', kid }] }`,`Cache-Control: public, max-age=600`(`server/src/oauth/jwks.ts` / `keys.ts`)。

**密钥与轮换**(`server/src/oauth/keys.ts`):
- `OAUTH_ACTIVE_KID`:当前签发用的 kid(必填);
- `OAUTH_RETIRED_KIDS`:已退役 kid(逗号分隔),**仍发布公钥用于验签**、但不再用于新签发 → 平滑轮换;
- `OAUTH_PRIVATE_KEY_FILE` / `OAUTH_KEY_DIR`:私钥 PEM 来源。

### 4.3 前端一键触发:`agentAuth.ts`(BFF 首方)

`web/src/views/agentView/agentAuth.ts`:
```ts
async function mint(): Promise<string> {
  const res = await fetch(`${SERVER_ORIGIN}/oauth/agent-token`, {
    method: 'POST',
    credentials: 'include',                 // 自动带 our-chat 的 session/csrf cookie
    headers: { 'X-CSRF-Token': readCsrfCookie() },  // 从 cookie 读出回填(双提交)
  });
  if (!res.ok) { setToken(null); expiresAtMs = 0; throw new Error(`mint failed: ${res.status}`); }
  const data = await res.json();
  setToken(data.access_token);
  expiresAtMs = Date.now() + data.expires_in * 1000;
  return data.access_token;
}

export async function ensureAgentToken(): Promise<string> {
  const cached = getToken();
  if (cached && Date.now() < expiresAtMs - EXPIRY_SKEW_MS) return cached;  // 命中有效缓存
  if (inflight) return inflight;                                           // 并发去重
  inflight = mint().finally(() => { inflight = null; });
  return inflight;
}
```
- **缓存**:token 存 `localStorage('agentServer.token')`;过期时刻 `expiresAtMs` 记在内存(刷新页面后丢失 → 触发一次重铸,可接受)。
- **提前量** `EXPIRY_SKEW_MS=30s`:避免边界上拿到刚好失效的令牌。
- **并发去重** `inflight`:多处同时 `ensureAgentToken()` 只打一次 `/oauth/agent-token`。
- `refreshAgentToken()`:`expiresAtMs=0` 强制重铸(401 后用)。
- `SERVER_ORIGIN`(`web/src/utils/runtime.ts`):`VITE_SERVER_ORIGIN` 优先,dev 回退 `window.location.origin`,否则按协议+host+端口(默认 3007)拼。

`web/src/views/agentView/api.ts`:
```ts
const BASE = import.meta.env.VITE_AGENT_API_BASE ?? 'http://localhost:3101/api';
// request() 统一加: headers.set('Authorization', `Bearer ${getToken()}`)
// 收到 401 → setToken(null) + throw 'unauthorized'
```

`web/src/views/agentView/index.tsx` 挂载即一键:
```ts
await ensureAgentToken();      // ① 铸/取令牌
const u = await agentMe();     // ② 验活(/auth/me)
setMe(...); setStatus('ready');// ③ 成功
// catch → setStatus('error') → 文案「需要先登录 our-chat 才能使用 AI 助手」
```

### 4.4 agent-server 验签 + zero-touch 建号

**验签策略**(`apps/node-server/src/modules/auth/jwt.strategy.ts`,passport-jwt):
```ts
super({
  jwtFromRequest: ExtractJwt.fromExtractors([
    ExtractJwt.fromAuthHeaderAsBearerToken(),       // Authorization: Bearer
    ExtractJwt.fromUrlQueryParameter('access_token'),// ?access_token=(SSE 兜底:EventSource 不能带 header)
  ]),
  algorithms: ['RS256', 'HS256'],
  ...(process.env.OAUTH_JWKS_URI ? { audience: ['agent-server'] } : {}),   // 强制 aud
  ...(process.env.OAUTH_ISSUER  ? { issuer:  process.env.OAUTH_ISSUER } : {}), // 强制 iss
  jsonWebTokenOptions: { clockTolerance: 30 },
  secretOrKeyProvider, // 按 header.alg 选公钥/密钥
});
```
**双模式**:
- **RS256(生产路径)**:按 `header.kid` 经 `jwks-rsa` 拉 our-chat 公钥(缓存 10min、限流)验签;
- **HS256(dev/test 兜底)**:用共享 `JWT_SECRET` 验本地 `/auth/login` 旧令牌。

```ts
if (header.alg === 'RS256') return (await client.getSigningKey(header.kid)).getPublicKey();
if (header.alg === 'HS256') return hsSecret;
```

**联合身份映射**(`validate()` → `federated-identity.service.ts`):
```ts
async validate(payload) {
  if (payload.iss) {                                  // 外部 IdP 令牌
    const userId = await this.federated.resolveLocalUserId({
      issuer: payload.iss, subject: payload.sub, usernameHint, displayNameHint,
    });
    return { userId, username: username || `oc_${payload.sub}`, role, scope };
  }
  return { userId: Number(payload.sub), ... };         // 本地 HS256 令牌
}
```
`resolveLocalUserId` → `findOrCreate`(按 `(issuer, subject)` 唯一约束):
```ts
const existing = await prisma.user.findUnique({ where: { issuer_subject: { issuer, subject } } });
if (existing) return existing.id;
// 首见 → zero-touch 建号
const created = await prisma.user.create({ data: {
  username: usernameHint ?? `oc_${subject}`,
  displayName: ...,
  passwordHash: '',          // 空哨兵:无本地密码,bcrypt 永不匹配 → 该号不能用密码登录
  roleCode: 'USER',
  issuer, subject,
}});
// 并发首见撞 P2002 → 重查收敛(幂等)
```
Prisma `User`(`apps/node-server/prisma/schema.prisma`):`issuer`/`subject` 可空,`@@unique([issuer, subject])`。
- 本地注册用户:`issuer=NULL, subject=NULL`(NULL 在唯一索引下互不相等,可多行);
- 联合用户:`(http://localhost:3007, <our-chat userId>)` 一一对应,**不复用外部 sub 作主键**,避免与本地自增 id 撞号。

**env 对齐**(必须):agent-server `OAUTH_ISSUER` == our-chat `OAUTH_ISSUER_BASE_URL`;agent-server `OAUTH_JWKS_URI` 指向 our-chat 的 `/.well-known/jwks.json`;`aud` 两边都用 `agent-server`。

---

## 5. 关键设计取舍(为什么这么做)

### 5.1 为什么是"BFF 首方直铸",不走标准 OAuth2 授权码 + PKCE 重定向?
- our-chat web 是 our-chat 的**第一方**前端,用户已在本域登录 → 不存在"第三方拿不到用户授权"的问题,**没必要**做浏览器重定向、授权码、用户同意页那一整套。
- 直接用已登录会话(cookie)向**自己后端**换一枚"窄作用域、短时效"的令牌,本质是 **token 交换 / 会话降权**(近似 RFC 8693 Token Exchange 的简化首方版),最少往返、零跳转。
- 代价:这套**只适合第一方**。真正的第三方(非自家前端)接入要走标准授权码 + PKCE。
- **重要澄清**:our-chat **本就实现了完整的授权码 + PKCE + refresh 的 OAuth2.1/OIDC IdP**(`/oauth/authorize`、`/oauth/token`、`/oauth/userinfo` 等,详见 §11)。`agent-token` 不是"缺了授权码流的简化品",而是在这套已有 IdP 之上、**为第一方场景刻意加的快捷端点**(省掉重定向 + 同意页)。两条路径共用同一套密钥 / claims / 受众映射。

### 5.2 为什么 RS256 + JWKS,不用 HS256 共享密钥?
- HS256 要求双方共享同一个密钥 → agent-server 一旦泄漏即可**伪造** our-chat 令牌;每加一个服务都要安全分发密钥。
- RS256:our-chat 独持私钥,agent-server 只读公钥(JWKS),泄漏无害、可无限扩展服务、支持 kid 轮换。这是跨服务鉴权的业界标准(方案 D)。
- HS256 仅作 dev/test 兜底(兼容旧本地登录),生产走 RS256。

### 5.3 为什么用 `(iss, sub)` 联合身份,而不是直接用 our-chat 的 userId?
- 直接拿 our-chat userId 当 agent-server 主键,会与 agent-server **本地注册用户**的自增 id 撞号。
- 用 `(issuer, subject)` 作外部主体标识、映射到一行本地用户,既隔离号段,又支持"同一外部用户多次进入幂等收敛"。zero-touch 让用户**第一次进就自动有号**,无感。

### 5.4 令牌自包含(JWT)而非不透明令牌
- agent-server 验签即拿到 `sub/scope`,**无需回查 IdP**,降耦合、抗 IdP 抖动。代价是吊销不即时 → 用**短 TTL(900s)** 兜。

---

## 6. 安全性分析

| 威胁 | 防护 |
|---|---|
| **CSRF**(诱导浏览器自动带 cookie 调 /oauth/agent-token) | 双提交 token:攻击者读不到 `csrfToken` cookie(跨站),无法构造匹配的 `X-CSRF-Token` 头 |
| **令牌伪造** | RS256 非对称:无私钥造不出有效签名;agent-server 只验公钥 |
| **令牌越权到别的服务** | `aud=['agent-server']` 限定,其它服务验签时 aud 不匹配即拒 |
| **跨租户数据泄露** | agent-server 检索强制 `user_id` 过滤,写死在 RAG 检索唯一出口;`userId` 来自验签后的 `(iss,sub)` 映射,前端改不了 |
| **令牌长期有效被盗用** | TTL 900s;前端 30s 提前重铸;无 refresh,过期必回 our-chat 会话重铸 |
| **私钥泄漏 / 轮换** | kid 多密钥:换 active kid 即轮换,旧 kid 退役期内仍可验旧令牌 |
| **会话失效后仍可用** | 会话失效 → `/oauth/agent-token` 401 → 铸不出新令牌 → 前端 error 引导重登 |

---

## 7. 这和微信 OAuth 一样吗?

**结论:目标/精神相通,协议过程不同——是"微信式联合一键登录"的简化首方版。**

相同的"魂"(都属于联合身份 OAuth 家族):
- 用户**不在第三方重新输密码**,复用已登录的身份源(微信 / our-chat);
- 第三方**不存密码**,用**外部主体标识**映射本地账号(微信 `openid`/`unionid` ↔ 我们的 `(iss, sub)`);
- **首次自动建号**(zero-touch),之后幂等命中;
- 存在权威 **IdP**,第三方信任它。

不同的"形"(协议机制):

| 维度 | 微信网页/扫码 OAuth | our-chat 一键登录(本方案) |
|---|---|---|
| 关系 | 真·第三方(开放平台 appid/appsecret) | **第一方前端**(our-chat 自家 web) |
| 浏览器重定向 | **有**(跳 `open.weixin.qq.com/connect/oauth2/authorize`) | **无**(同域 POST,零跳转) |
| 授权码 code | **有**(回调带 `?code=`) | **无** |
| 换 token 的凭证 | 后端用 **appsecret** 拿 code 后端换 token | 浏览器用**已登录 session cookie + CSRF** 直接换 |
| 用户同意页 | `snsapi_userinfo` 显式授权;`snsapi_base` 静默 | 无(第一方,默认信任) |
| 令牌类型 | **不透明** access_token(要再调微信 API 用) | **自包含 JWT**(资源服务本地验签即用) |
| 验证方式 | 第三方持 appsecret(对称、走微信后端校验) | 资源服务持**公钥**(RS256/JWKS,非对称、本地验签) |
| 身份标识 | `openid`(+ 跨应用 `unionid`) | `(iss, sub)` 联合主体 |
| 用户信息 | 调 `sns/userinfo` 拉取 | JWT claims +(可)调 `/auth/me` |

一句话:**微信因为是"陌生第三方",必须走"重定向 + 授权码 + appsecret 后端换不透明 token + 拉 userinfo"的完整授权码流;我们因为是"自家第一方 + 资源服务用公钥验签",把它压成了"同域换一枚自包含 JWT"的最短路径**。

> 注意:那套"完整授权码流"our-chat **也有**(§11)——只是 agent 一键登录没走它。要接真正的外部第三方,主要是补 consent 页 / 限流 / client 准入(§13–§15),而**不是**从头实现授权码流。

---

## 8. 边界行为与演进

**失效/边界**:
- our-chat 会话过期/登出 → `/oauth/agent-token` 401 → 前端清令牌、`status='error'` 引导回 our-chat 登录;
- agent-server 令牌过期 → 请求 401 → 前端 `setToken(null)`,下次 `ensureAgentToken()` 重铸;
- **agent 一键路径不用 refresh token**:agent-token 是纯 access token,靠"复用 our-chat 会话重铸"续期。注意 **IdP 本身有 `refresh_token` grant(带轮换 + 重用检测,见 §11)**,只是 agent 一键路径选了更简单的"重铸"而没用它。

**演进方向**(按需,不提前做):
- **agent 路径无感续期**:把"重铸"换成 IdP 已有的 `refresh_token` grant,省掉每次回 our-chat 会话校验;
- **真·第三方接入**:授权码 + PKCE + refresh **已实现**(§11),要做的是补 consent 页 / 限流 / client 准入审批(§13–§15),不是从头写 flow;
- **多端等价**(如移动端):移动端拿不到浏览器 cookie,改走 IdP 已具备的授权码 + PKCE,或补设备授权码流(device flow)。

---

## 9. 配置对照表

| our-chat(IdP) | agent-server(RS) | 说明 |
|---|---|---|
| `OAUTH_ISSUER_BASE_URL=http://localhost:3007` | `OAUTH_ISSUER=http://localhost:3007` | 两者必须一致(iss 校验) |
| `OAUTH_ACTIVE_KID` / `OAUTH_RETIRED_KIDS` | —(从 JWKS 动态按 kid 取) | 密钥轮换 |
| `OAUTH_PRIVATE_KEY_FILE` / `OAUTH_KEY_DIR` | —(只持公钥) | 私钥不出 IdP |
| `OAUTH_AT_TTL_SEC=900` | —(信任令牌 exp) | access token 时效 |
| 暴露 `/.well-known/jwks.json` | `OAUTH_JWKS_URI=http://localhost:3007/.well-known/jwks.json` | 公钥发现 |
| `aud='agent-server'`(SCOPE_TO_AUDIENCE) | `aud='agent-server'`(RESOURCE_AUDIENCE) | 受众限定 |
| 前端 `VITE_SERVER_ORIGIN`(默认 3007) | 前端 `VITE_AGENT_API_BASE`(默认 :3101/api) | 前端寻址 |

---

## 10. 关键文件清单

| 环节 | 文件 |
|---|---|
| IdP 装配/路由 | `our-chat/server/src/oauth/index.ts` |
| 授权端点(授权码) | `our-chat/server/src/oauth/authorize.ts`、`pkce.ts` |
| 令牌端点(交换+刷新) | `our-chat/server/src/oauth/token.ts` |
| 撤销/内省/用户信息 | `our-chat/server/src/oauth/revoke.ts`、`introspect.ts`、`userinfo.ts` |
| 发现/JWKS/密钥 | `our-chat/server/src/oauth/discovery.ts`、`jwks.ts`、`keys.ts` |
| 客户端注册表/初始化 | `our-chat/server/src/oauth/clients.ts`、`init.ts` |
| 存储(码/refresh) | `our-chat/server/src/oauth/storage.ts`(Prisma → Postgres) |
| 令牌签发/claims/类型 | `our-chat/server/src/oauth/tokens.ts`、`types.ts` |
| 审计/错误 | `our-chat/server/src/oauth/audit.ts`、`errors.ts` |
| 首方一键铸令牌 | `our-chat/server/src/oauth/agentToken.ts` |
| 会话+CSRF 守卫 | `our-chat/server/src/middleware/auth.ts`、`utils/authCookies.ts` |
| 前端一键铸造 | `our-chat/web/src/views/agentView/agentAuth.ts` |
| 前端请求/令牌存储 | `our-chat/web/src/views/agentView/api.ts` |
| 前端入口三态 | `our-chat/web/src/views/agentView/index.tsx` |
| 验签策略(JWKS 双模) | `agent-server/apps/node-server/src/modules/auth/jwt.strategy.ts` |
| 联合身份 zero-touch | `agent-server/apps/node-server/src/modules/auth/federated-identity.service.ts` |
| 用户模型(iss/sub) | `agent-server/apps/node-server/prisma/schema.prisma` |
| 信任模型 | `agent-server/docs/跨服务鉴权方案/方案D-非对称密钥JWKS.md` |

---

## 11. our-chat IdP 现状全貌(它本就是一套 OAuth2.1/OIDC IdP)

> §1–§10 讲的是「agent 一键登录」这条首方快捷路径。但 our-chat 的 `server/src/oauth/`
> **本身就是一套完整的 OAuth2.1 + OIDC 身份提供方**,一键铸造只是它的一个端点。
> 本节据代码盘清它的真实能力(文件见 §10 清单)。

### 11.1 端点全集

| 端点 | 标准 | 职责 |
|---|---|---|
| `GET /oauth/authorize` | OAuth2.1 | 授权码签发(仅 `code`,PKCE 强制) |
| `POST /oauth/token` | OAuth2.1 | `authorization_code` 交换 + `refresh_token` 刷新 |
| `POST /oauth/revoke` | RFC 7009 | 撤销 refresh token |
| `POST /oauth/introspect` | RFC 7662 | 令牌内省(仅 confidential client 可调) |
| `GET /oauth/userinfo` | OIDC | 按 scope 返回用户信息(Bearer) |
| `POST /oauth/agent-token` | 首方扩展 | 已登录会话直铸 agent-scoped token(本文 §4) |
| `GET /.well-known/openid-configuration` | OIDC Discovery | 元数据发现 |
| `GET /.well-known/jwks.json` | RFC 7517 | 公钥发布 |

### 11.2 授权码流(/authorize → /token)
- **/authorize**:`response_type` 仅 `code`(OAuth2.1 实践);`require_pkce` 的 client 强制 PKCE,只收 `S256`(拒 `plain`);`state` 必需;含 `openid/profile/email` scope 时 `nonce` 强制;未登录 → 302 到 `/login` 带 `next` 回流;**无显式 consent(登录即同意)**;授权码为 opaque 随机串(48B base64url)存 Postgres,TTL 60s;`consumeCode()` 原子标 `used` **防重放**;client/redirect_uri/scope 任一非法 → 400 JSON(**不走 redirect,防 open redirect**)。
- **/token(authorization_code)**:校验 code、redirect_uri **精确匹配**、PKCE `code_verifier`(timing-safe 比对)、client 认证;发 `access_token` + `refresh_token` +(OIDC)`id_token`;`Cache-Control: no-store`。

### 11.3 Refresh 轮换 + 重用检测(安全核心)
- 每次刷新**必轮换**:发新 RT、旧 RT 记 `rotatedTo`;`family_id` 串联整条轮换链。
- **重用检测**:一旦用到「已轮换 / 已撤销」的 RT → **整个 family 撤销**(`reuse_detected`,核弹式失效),挡住「RT 被盗后新旧并用」。
- 轮换在**一个 DB 事务**里完成(`updateMany WHERE rotatedTo IS NULL` 乐观锁),并发抢只有一个成功,另一个触发 family 失效。
- scope 只能**收窄不能扩**。

### 11.4 客户端与令牌
- **client 注册表**在 Postgres(`OAuthClient`):`public/confidential`、bcrypt `client_secret`、**redirect_uri 精确白名单**、`allowed_scopes/grant_types`、`require_pkce`、`disabled`;启动 seed `our-chat-web`(public + 强制 PKCE)。confidential 走 HTTP Basic / form + bcrypt 校验。
- **AT**:RS256,`aud` 由 scope **动态映射**(`agent-server` scope → `aud=['agent-server']`),含 `jti`,TTL 900s。
- **RT**:`aud=['/oauth/token']`(防被当 AT 用),含 `family_id`,TTL 30d。
- **id_token**(OIDC):`aud=client_id`、`nonce`、`auth_time`、按 scope 的 profile/email claims。

### 11.5 配套设施
- **密钥**:RS256、`kid`、`active/retired` 轮换、PKCS#8 ≥2048、加载失败 **fail-fast**。
- **存储**:Postgres/Prisma(`OAuthClient`/`OAuthCode`/`OAuthRefreshToken`),**可多实例、重启不丢、原子操作**;有过期清理。
- **审计**:结构化 JSON 事件(`code_issued`/`code_exchanged`/`token_refreshed`/`rt_reuse_detected`/`token_revoked`…),含 ip/ua。
- **错误**:RFC 6749 §5.2(`error`/`error_description` + 状态码映射)。

**小结**:授权码+PKCE、refresh 轮换+重用检测、持久化多实例、confidential client 认证、OIDC id_token、内省/撤销/用户信息/发现、密钥轮换、审计 —— **生产级关键项大多已具备**,不是玩具。

---

## 12. 生产级 IdP 的标准架构(大厂参照)

一套「对外可用的生产级 IdP」通常含这几层(不止协议端点):

- **A. 协议面**:authorize / token / userinfo / jwks / discovery / introspect / revoke / **end_session(登出)** /(可选)device flow、动态客户端注册、PAR。
- **B. 授权类型**:authorization_code + PKCE(公网客户端)、**client_credentials(M2M)**、refresh(带轮换);废弃 implicit / 密码模式。
- **C. 令牌与安全**:PKCE 强制、redirect_uri 精确、state/nonce、RT 轮换+重用检测、**短 AT TTL + 撤销策略**、(高保障)**sender-constrained token(DPoP / mTLS)**、consent + scope 管理。
- **D. 身份与会话**:用户库 + **MFA/多因子**、密码策略/无密码(passkey)、**账号联合**(社交/企业 IdP via OIDC/SAML)、**SSO 会话** + 单点登出(front/back-channel logout)。
- **E. 密钥与机密**:非对称签名 + **自动轮换(JWKS 重叠期)**、**私钥进 HSM/KMS**(不落明文文件)、机密集中管理(Vault/KMS)。
- **F. 运维与合规**:持久化 + **高可用/多副本**、**限流/反滥用**(防撞库、爆破)、审计 + **SIEM**、可观测(metrics/trace)、合规留存。
- **G. 管理面**:client 准入/审批、consent 管理、token/session 后台、用户管理。

**关键认知**:身份是**平台级横切能力**,大厂通常**集中一套 IdP**(自建 SSO 或采购),业务线不各自造轮子 —— "每个应用各写一套 OAuth"恰是反模式(实现不一致、漏洞面大)。

---

## 13. 现状 vs 生产级:能力清单与差距

| 生产级关键项 | our-chat 现状 | 备注 |
|---|---|---|
| 授权码 + PKCE(S256 强制) | ✅ 已有 | 拒 plain;state 强制 |
| refresh 轮换 + 重用检测 | ✅ 已有 | family 失效 + 事务乐观锁,生产级 |
| 持久化 + 多实例 | ✅ 已有 | Postgres/Prisma,原子操作 |
| confidential client 认证 | ✅ 已有 | bcrypt secret + Basic/form |
| OIDC id_token(nonce) | ✅ 已有 | 缺 at_hash(见下) |
| 内省 / 撤销 / 用户信息 / 发现 | ✅ 已有 | RFC 7662/7009 + OIDC |
| 密钥轮换(kid + retired) | ✅ 已有 | 私钥仍是本地 PEM(非 KMS) |
| 审计日志 | ✅ 已有 | 结构化 JSON;未接 SIEM |
| RFC 错误 / 防 open redirect | ✅ 已有 | client 非法不走 redirect |
| **consent 同意页** | ❌ 缺 | 登录即同意,对外第三方需补 |
| **限流 / 反滥用** | ❌ 缺 | authorize/token 无限流 |
| **私钥进 KMS/HSM** | ❌ 缺 | 现为本地 PEM |
| **MFA / 多因子** | ❌ 缺 | |
| **at_hash(OIDC 推荐)** | ❌ 缺 | 防授权码 + token 截获 |
| **AT 主动撤销** | ❌ 无黑名单 | JWT 无状态,靠短 TTL(900s)兜 |
| **end_session / 单点登出** | ❌ 缺 | 无 RP-initiated / back-channel logout |
| **per-device RT family** | ⚠️ 偏粗 | family 撤销可能掀掉用户全部设备 |
| **client_credentials(M2M)** | ❌ 无 | 无服务间直连令牌 |
| **DPoP / mTLS 绑定令牌** | ❌ 无 | 高保障场景才需 |
| **动态客户端注册** | ❌ 无 | client 由 `init.ts` 预置 seed |
| **邮箱验证** | ❌ 未实现 | userinfo `email_verified` 恒 false |
| 高可用 / 机密管理 | ⚠️ 取决部署 | 应用层已具备多实例能力 |

**判断**:对当前场景(our-chat 自家 web + agent-server,**第一方 + 内部联合身份**),现状**已够用且达到准生产水准**。上面的"缺失项"绝大多数只有在**对外开放给陌生第三方 / 上真生产合规**时才成为硬需求。

---

## 14. 架构选型对比:自研 vs 认证库 vs 托管

实现 IdP 有三条路,按「控制力 ↔ 省心」排:

| 路线 | 代表 | 优点 | 代价 | 适合 |
|---|---|---|---|---|
| **自研**(现状) | 手写 `oauth/` 模块 | 全控、零外部依赖、最贴 BFF+联合身份场景、**简历信号最强** | 协议正确性/安全全自担,边界功能(consent/限流/MFA/KMS)要自己补,维护成本高 | 作品集、强定制、身份即核心能力 |
| **认证库** | panva **`oidc-provider`**(Node,OpenID 认证)、ory **hydra**(Go) | 协议正确性外包给认证过的实现,自己只配**存储 adapter + findAccount + 登录/同意交互**;社区维护安全更新 | 要学库的抽象、定制受其约束 | 多数生产团队的务实选择 |
| **托管/产品** | Keycloak(自托管)、Auth0 / Okta / Azure AD B2C / AWS Cognito / 腾讯云 CIAM | 开箱即用:MFA / 社交登录 / 管理后台 / 合规 / SLA 全齐 | 成本、外部依赖、定制受限、SaaS 数据出域 | 要快速上线、合规要求高、不想自维护身份 |

**大厂怎么选**:身份是横切基础设施,**集中一套**(自建 SSO 或采购),不让每个业务各造。单工程师/中小团队务实序为 **托管 ≳ 认证库 > 自研**,除非身份本身是核心业务或有强定制/合规诉求才自研。

**对本项目的建议**(结合"作品集 + 求职信号"定位):
- **保留自研**:这套手写 IdP 的完成度(授权码+PKCE、RT 轮换+重用检测、持久化多实例、OIDC、内省/撤销)本身就是**很强的简历叙事**,远超"调个 Auth0 SDK"。不建议为了"生产级"推倒改用库 —— 反而削弱信号。
- **要"对外真生产",按 §15 补缺口**,而非换技术栈。
- 若将来身份要扩成"一堆外部第三方 + 合规 + MFA",再评估迁 `oidc-provider` 减负 —— 届时迁移成本可控(你已理解每个端点该做什么)。

---

## 15. 加固路线图(仅当对外开放给陌生第三方 / 上真生产时)

按「安全优先」排序,**当前内部场景无需提前做**:

**P0(安全硬需求)**
1. **限流 / 反滥用**:`/authorize`、`/token`、`/agent-token` 加速率限制,防爆破/枚举(可复用既有认证端点限流)。
2. **私钥入 KMS/Secrets**:把 `OAUTH_PRIVATE_KEY_FILE` 明文 PEM 换成 KMS 托管 + 自动轮换。
3. **consent 同意页**:`/authorize` 对**外部第三方** client 弹显式授权页(第一方 client 静默)。
4. **at_hash**:id_token 补 `at_hash`(OIDC Core §3.1.3.3)。
5. **邮箱验证**:落地验证流程,`email_verified` 反映真实状态。

**P1(健壮性)**
6. **per-device / per-session RT family**:轮换链按设备隔离,避免一次重用检测掀掉用户全部设备。
7. **AT 撤销策略**:维持短 TTL;若需即时吊销,加轻量 `jti` 黑名单(Redis)。
8. **单点登出**:`end_session_endpoint`(RP-initiated)+(可选)back-channel logout。
9. **审计接 SIEM**:结构化日志输出到 ELK/Loki,`rt_reuse_detected` 等告警。
10. **HA**:多副本 + Postgres 主从;清理任务幂等。

**P2(进阶/按需)**
11. **client_credentials**:服务间(M2M)直连令牌。
12. **DPoP / mTLS 绑定令牌**:高保障场景防令牌被盗即用。
13. **动态客户端注册 + 准入审批**:第三方自助接入。
14. **discovery 补字段**:`response_modes_supported`、`claim_types_supported` 等可选元数据。
