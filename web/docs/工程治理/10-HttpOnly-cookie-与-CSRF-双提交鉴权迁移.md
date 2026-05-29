# 10 · HttpOnly cookie + CSRF 双提交鉴权迁移

> 类别：安全（凭据存储 / 会话鉴权）
> 前置：本报告是 [09 · localStorage 存 token 的 XSS 风险分析](./09-localStorage-存-token-的-XSS-风险分析.md) 的落地实现。09 论证了"为什么要迁、迁到哪、为什么前端单方面改不了"；本文记录"怎么迁的、每一处为什么这么写、踩了哪些坑"。
> 涉及文件（后端）：`server/src/utils/authCookies.js`（新增）、`server/src/routes/login.js`、`server/src/middleware/auth.js`
> 涉及文件（前端）：`web/src/utils/http.ts`、`web/src/views/loginView/index.tsx`、`web/src/views/loginView/api.ts`、`web/src/views/layout/index.tsx`、`web/src/utils/requireAuth.tsx`、`web/src/utils/token.ts`（删除）

## 一、改了什么（总览）

把 JWT 从"前端 `localStorage` 持有 + `Authorization: Bearer` 手动发送"，整体迁移为"后端写入 `HttpOnly` cookie + 浏览器自动携带"。换来的代价是重新引入 CSRF 风险，因此同步加上**双提交 Cookie（double-submit cookie）**防护。一句话概括威胁模型的转换：

> **localStorage ↔ XSS（凭据可被任意 JS 读取外带）** 换成 **cookie ↔ CSRF（凭据自动携带、需防跨站伪造请求）**。

后者有成熟解法且凭据无法被外带，净收益为正——论证详见报告 09 第六、九节。

## 二、概念扫盲

### 2.1 HttpOnly cookie
带 `HttpOnly` 标志的 cookie，浏览器**禁止任何 JavaScript 读取**（`document.cookie` 读不到，也没有别的 API 能取）。它只能由服务端通过响应头 `Set-Cookie` 下发。这正是它能挡住 XSS 外带的根本：脚本拿不到不存在于 JS 世界的东西。配套三个属性：

- `Secure`：只在 HTTPS 下发送。**开发是 http，必须 `secure:false`，否则浏览器根本不写入这个 cookie**（一个经典坑，见第六节）。
- `SameSite=Strict`：跨站请求一律不携带此 cookie——这是 CSRF 的第一道、也是最强的一道闸。
- `path=/`：整站可用。

### 2.2 CSRF 与双提交 Cookie
**CSRF（跨站请求伪造）**：你登录了 A 站（cookie 在浏览器里），攻击者诱导你访问 B 站，B 站偷偷向 A 站发请求——浏览器会**自动带上 A 站的 cookie**，于是请求"看起来像你本人发的"。这正是 cookie 鉴权的固有风险，也是当年很多项目改用 `localStorage + Bearer` 想躲开的东西（Bearer 头不会被浏览器自动携带）。

**双提交 Cookie** 的解法：登录时除了 `HttpOnly` 的 token cookie，再下发一个**可被 JS 读取**的 `csrfToken` cookie（随机串）。前端在每个**变更类请求**里，把这个值读出来回填到自定义请求头 `X-CSRF-Token`。服务端校验"头里的值 == cookie 里的值"。

为什么这能挡住 CSRF？因为攻击者站点**能让浏览器自动带上 cookie，却读不到 `csrfToken` 的值**（同源策略隔离了 B 站对 A 站 cookie 的读取），自然无法伪造出正确的 `X-CSRF-Token` 头。**注意：这里 csrfToken 故意设成可读（`httpOnly:false`），它本来就不是机密——它的安全性来自"跨站读不到"，不是"保密"。**

## 三、后端实现

### 3.1 `authCookies.js`（新增）— 统一 cookie 策略
把 cookie 的写入/清除/CSRF 生成收口到一个工具，避免散落各处属性不一致：

```js
const baseCookie = (maxAge) => ({
  secure: isProduction,      // 开发 http 必须 false，否则不写入
  sameSite: 'strict',        // 跨站不携带，CSRF 第一道闸
  path: '/',
  maxAge,
});
export const setAuthCookies = (res, token, csrfToken, maxAge) => {
  res.cookie(TOKEN_COOKIE, token,    { ...baseCookie(maxAge), httpOnly: true  }); // JS 读不到
  res.cookie(CSRF_COOKIE,  csrfToken,{ ...baseCookie(maxAge), httpOnly: false }); // 故意可读，供前端回填
};
```

`generateCsrfToken` 用 `crypto.randomBytes(24).toString('hex')`——密码学随机，不可预测。

`REMEMBER_MAX_AGE`（7 天）/ `SESSION_MAX_AGE`（1 小时）两档，与 JWT 的 `expiresIn` 对齐：**cookie 的存活时间和 token 的有效期必须一致**，否则会出现"cookie 还在但 token 已过期"或反之的撕裂状态。

### 3.2 `login.js`— 登录/刷新/登出
- **登录**：验密通过后，`remember` 勾选签 7 天否则 1 小时；`setAuthCookies` 写入两个 cookie；**响应体只回 `userInfo`（剔除密码），绝不再回传 token**。这一步是迁移的眼——前端从此拿不到 token 字符串。
- **刷新 `/refresh`**：从 cookie 读旧 token（过期也用 `jwt.decode` 解出 id），做 CSRF 校验，校验用户仍存在后重签并重设 cookie。刷新本身是变更类请求，所以也要过 CSRF。
- **登出 `/logout`（新增）**：`clearAuthCookies` 清掉两个 cookie。因为 HttpOnly cookie 前端删不掉，登出**必须由后端清**——这是 cookie 方案相比 localStorage 多出来的一个必需接口。

### 3.3 `auth.js`— 鉴权中间件 + CSRF 校验
```js
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']); // 读操作不改状态，免 CSRF
const verifyCsrf = (req, res) => {
  if (SAFE_METHODS.has(req.method)) return true;
  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  if (!cookieToken || !headerToken || headerToken !== cookieToken) { res.status(403)...; return false; }
  return true;
};
```
`authenticateToken` 先 `verifyCsrf`，再从 `req.cookies?.[TOKEN_COOKIE]` 读 token（**不再信任 `Authorization` 头**），其余验签逻辑不变。读 cookie 依赖 `cookie-parser`（见报告 13）。

## 四、前端实现

### 4.1 `http.ts`
- `axios.create({ withCredentials: true })`：跨域时也带上 cookie（同源经 Vite 代理则无所谓，但显式声明更稳）。
- 请求拦截器：**删掉手动塞 `Authorization`**；改为对非安全方法读取可读的 `csrfToken` cookie，回填到 `X-CSRF-Token` 头。读 cookie 用一个转义安全的正则 `readCookie` 工具。
- 401 处理：`TOKEN_EXPIRED` 时调 `/api/refresh`（新 token 由后端写回 cookie，**前端无需也无法改请求头**），刷新成功后重放原请求；刷新失败跳登录。整个重试链路里不再出现 token 字符串。

### 4.2 登录/登出/路由守卫
- `loginView/index.tsx`：删掉 `localStorage.setItem('token', ...)`——token 已在 cookie 里。
- `loginView/api.ts`：`LoginResponse` 去掉 `token` 字段（响应体不再含 token）。
- `layout/index.tsx`：登出改为 `await post('/api/logout')` 让后端清 cookie，再清 redux 与 `persist:root`、跳登录。
- `requireAuth.tsx`：**这是认知上最关键的一处**。原来它读 `localStorage` 的 token 解析 `exp` 来判断是否过期。现在 token 是 HttpOnly，**前端 JS 根本读不到、无法在客户端判断过期**。所以路由守卫降级为"乐观守卫"：只看 redux 的 `isAuthenticated` 标志决定能否进受保护页；**真正的过期与失效由后端每次请求校验，401 触发 http 拦截器刷新或跳登录**。这是 cookie 方案的一个本质转变——**鉴权判定的权威从前端搬回了后端**。
- 删除 `token.ts`：它所有的 `getToken/parseToken/isTokenExpired` 等都建立在"JS 能读 token"之上，迁移后全部失效。确认 `requireAuth` 是唯一消费方后整文件删除（死代码不留）。

## 五、各方案取舍

| 维度 | localStorage + Bearer（旧） | HttpOnly cookie + CSRF（新） |
|------|------|------|
| XSS 下凭据可否被外带 | ❌ 任意 JS 可读、可上传到攻击者服务器 | ✅ JS 读不到，最多在受害页"借用"会话，无法外带 |
| CSRF 风险 | 无（不自动携带） | 有 → 用 SameSite=Strict + 双提交 token 化解 |
| 前端是否手动管理凭据 | 是（存、读、塞头、判过期） | 否（浏览器自动携带，过期判定归后端） |
| 登出 | 前端删 localStorage 即可 | 需后端 `/logout` 清 cookie |
| 跨域复杂度 | 简单 | 需 `withCredentials` + CORS 不能用 `*`（见报告 13） |

**为什么没上"内存存 access + HttpOnly 存 refresh"这一更高档？** 报告 09 第九节已论证：OurChat 是第一方自签 JWT、非 OAuth 应用，"自签 JWT 进 HttpOnly cookie + CSRF"已拿到 BFF 原则 90% 的收益，再上双 token 内存方案的复杂度收益比不划算，留待接入第三方登录时再评估。

## 六、踩坑记录

1. **`secure:true` 在开发环境会让 cookie 静默不写入**。本地是 http，若 `secure` 写死 true，浏览器收到 `Set-Cookie` 直接丢弃，表现为"登录接口 200 但下一个请求就 401"，且无任何报错。本项目用 `secure: isProduction` 按环境切换。
2. **CSRF 校验对安全方法要放行**，否则所有 GET 都得带头，徒增负担且无意义（GET 不该改状态）。
3. **登出必须打后端**。HttpOnly cookie 前端 `document.cookie` 删不掉，只清 redux 会留下"后端仍认、前端已忘"的幽灵会话。
4. **路由守卫不能再判过期**。读不到 token 就别假装能判过期；强行解析会一直当成"已过期"导致死循环跳登录。把过期判定彻底交给后端的 401。
5. **cookie maxAge 必须和 JWT expiresIn 对齐**，否则两者过期时间错位，出现一方还在一方已失效的撕裂。
6. **csrfToken cookie 不能设 HttpOnly**——它必须被前端读出来回填到头里，设了 HttpOnly 整个双提交就废了。容易因"看到 token 就想加 HttpOnly"而误设。

## 七、业界对比与 Web vs Native

- **业界**：OWASP 明确不建议用 Web Storage 存会话凭据；HttpOnly cookie 是 SPA 会话鉴权的主流推荐。双提交 cookie 是无状态服务（不存 server session）下最常用的 CSRF 方案；若有服务端 session，则用 synchronizer token 模式。SameSite=Strict 已被所有现代浏览器支持，可独立挡住绝大多数 CSRF，双提交是纵深冗余。
- **Web vs Native**：原生端没有"任意脚本同源执行"的 XSS 模型，凭据存于系统安全区（iOS Keychain / Android Keystore），且没有 cookie 自动携带导致的 CSRF——原生通常就用 `Authorization` 头手动带 token，反而是 Web 里被诟病的方式。所以"原生这么做没事"不能照搬到 Web：两边的威胁模型根本不同。Web 的核心约束是"同源 JS 全开放 + cookie 自动携带"这一对，才催生了 HttpOnly + CSRF 这套组合拳。

## 八、验证与局限

- 前端 `pnpm build`、`pnpm lint` 均通过（0 error）。
- 后端各文件 `node --check` 语法通过。
- **未做端到端运行验证**：完整鉴权链路需同时起 MySQL + MongoDB + 后端 + 前端代理，本次环境不具备。登录→受保护请求→刷新→登出的实际联调，留待具备完整依赖的环境补测。
