# 安全加固:安全响应头(helmet)与可信代理(trust proxy)

本次在 server 的 `app.ts` 做了两项安全加固——引入 **helmet 安全响应头** 和设置
**`trust proxy`**(并配套认证端点限流)。本文解释它们各自解决什么问题、为什么这么配、
以及中间件顺序背后的原因。

## 1. 背景

server 是 Express + JSON API,生产部署在 nginx 边缘入口之后:**浏览器 → nginx → server**
(见 `docs/技术方案/工程组织与部署编排.md`)。这个拓扑直接决定了下面 trust proxy 的必要性。

## 2. 改动位置与中间件顺序(`app.ts`)

```ts
const app = express();

// ① 信任前置 nginx 一层代理,使 req.ip 取到真实客户端 IP
app.set('trust proxy', 1);

// ② 安全响应头(最前置,确保每个响应都带上,含 /health 与错误响应)
app.use(helmet());

// ③ CORS(同源生产其实不触发,dev 跨源用)
app.use(cors({ /* 白名单 + credentials */ }));

// ④ 解析 cookie / body ...
// ⑤ 认证端点限流(在 trust proxy 之后,才能按真实 IP 计数)
app.use('/api/login', authRateLimiter);
app.use('/api/register', authRateLimiter);
```

顺序不是随意的:
- `trust proxy` 必须在**限流之前**生效,否则限流读到的 `req.ip` 是 nginx 的 IP(见 §4.5)。
- `helmet` 放**最前**,保证所有路径(包括健康检查、错误返回)都带安全头。

## 3. helmet:安全响应头

### 3.1 什么是"安全响应头"

浏览器会根据响应头调整自身的安全行为(是否允许被 iframe 嵌、是否嗅探 MIME、是否强制
HTTPS……)。**不设这些头,就等于把这些行为交给浏览器的宽松默认**。helmet 是一组"按最佳
实践设置安全相关响应头"的中间件集合,一行 `app.use(helmet())` 即开启一整套。

### 3.2 `helmet()` 默认设了哪些头,各防什么

| 响应头 | 作用 | 防的攻击 |
|---|---|---|
| `X-Content-Type-Options: nosniff` | 禁止浏览器猜测 MIME 类型 | 防把上传的文本/图片当成脚本执行(MIME 嗅探绕过) |
| `X-Frame-Options` / CSP `frame-ancestors` | 禁止被别的站点 iframe 嵌入 | 点击劫持(clickjacking) |
| `Strict-Transport-Security`(HSTS) | 告诉浏览器之后只走 HTTPS | SSL 剥离/降级中间人 |
| `Content-Security-Policy`(默认 `default-src 'self'`) | 限制可加载的资源来源 | 缓解 XSS、数据注入 |
| `Referrer-Policy: no-referrer` | 限制 Referer 头泄露 | URL 里的敏感信息随跳转外泄 |
| `Cross-Origin-{Resource,Opener,Embedder}-Policy` | 跨源隔离 | 跨源资源滥用 / Spectre 类侧信道 |
| `Origin-Agent-Cluster` | 请求进程级隔离 | 同上,纵深 |
| 移除 `X-Powered-By` | 不再暴露 `Express` 指纹 | 减少攻击者的针对性信息收集 |

(还有 `X-DNS-Prefetch-Control`、`X-Download-Options`、`X-Permitted-Cross-Domain-Policies`
等杂项收敛,影响小,从略。)

### 3.3 为什么"用默认就够",不定制

本服务**只返回 JSON,不直接发 HTML**(SPA 由 nginx 托管)。因此:
- CSP / HSTS 这类主要保护"浏览器渲染的 HTML 页面"的头,在 server 这里更多是**纵深防御**
  ——真正面向页面渲染的那层在 nginx(见 §7 边界划分);
- helmet 默认对一个 JSON API 是安全且无副作用的,不需要为它放开/定制 CSP。

> HSTS 在 dev 的 http 下浏览器会忽略,无害;真正生效需 HTTPS(见 §7)。

### 3.4 验证

`test/security-headers.test.ts`:对 `/health` 断言响应带 `X-Content-Type-Options: nosniff`、
且 **不含** `X-Powered-By`。

## 4. trust proxy:让 `req.ip` 拿到真实客户端 IP

### 4.1 问题:nginx 后面,`req.ip` 是 nginx 的 IP

生产链路是"浏览器 → nginx → server"。Express 的 `req.ip` 默认取 **TCP 对端 IP**,而 server
的对端是 **nginx**(docker 内网 IP),不是真实用户。结果:**所有请求看起来都来自同一个
IP(nginx)**。

### 4.2 后果(两个真实问题)

1. **限流失效/误伤**:认证限流按 IP 计数。若所有人都是"nginx 这个 IP",要么一个攻击者
   打满后**全体用户被连坐限流**,要么阈值形同虚设——防爆破直接失效。
2. **日志/审计失真**:访问日志、风控拿不到真实来源 IP,排障与溯源无依据。

### 4.3 解法:`app.set('trust proxy', 1)`

nginx 在转发时已写入真实来源(本仓库 `docker/nginx/conf.d/default.conf`):

```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

设置 `trust proxy` 后,Express 会**信任 `X-Forwarded-For` 头**,并据此把 `req.ip` 解析为
**真实客户端 IP**。

### 4.4 为什么是 `1`,而不是 `true`(安全关键)

- **`1`** = 信任"最靠近的 **1** 层代理"(就是我们的 nginx)。Express 从 `X-Forwarded-For`
  右侧去掉这 1 跳,取到真实客户端 IP。**最小授权**。
- **`true`** = 信任**所有**代理。这意味着 server 会无条件相信整条 `X-Forwarded-For`——
  攻击者只要自己加一个 `X-Forwarded-For: 1.2.3.4`,就能**把自己伪装成任意 IP**,从而
  **绕过限流、污染日志**。所以在 XFF 不完全可信时,`true` 是个安全漏洞。
- 我们的拓扑就是"一层 nginx",`1` 既正确又安全。将来若在 nginx 前再加 CDN/LB,就把这个
  数字相应调大(信任的可信代理跳数)。

> `express-rate-limit` 会主动校验 `trust proxy`:设成 `true` 它会告警甚至拒绝,因为它知道
> 那会让"按 IP 限流"被 XFF 伪造绕过。我们设 `1` 不会触发该告警。

### 4.5 顺序:trust proxy 必须在限流之前

`app.set('trust proxy', 1)` 在 `app.use(authRateLimiter)` **之前**执行,限流中间件读到的
`req.ip` 才是真实 IP。这就是 §2 里把它放在最前的原因。

## 5. 配套:认证端点限流

`src/middleware/rateLimit.ts` 用 `express-rate-limit` 对 `/api/login`、`/api/register`
按 **真实客户端 IP**(依赖 §4)计数,超阈值返回 **429**,缓解撞库/暴力破解:

- 窗口与阈值经 env 可调:`AUTH_RATE_LIMIT_WINDOW_MS`(默认 15 min)、`AUTH_RATE_LIMIT_MAX`
  (默认 10)。
- **局限**:默认是「每副本」内存计数;多副本部署时若要全局精确,需换 Redis store
  (`rate-limit-redis`)。单副本/中小流量下已能显著抬高爆破成本。
- 验证:`test/routes.rate-limit.test.ts` 收紧阈值后,第 N+1 次 login → 429。

## 6. 与既有 CSRF 的关系

认证用 HttpOnly cookie + 双提交 CSRF(见 `web/docs/工程治理/10-HttpOnly-cookie-与-CSRF-双提交鉴权迁移.md`)。
本次 helmet/限流是**与之正交的纵深加固**:CSRF 防"借用户 cookie 的跨站请求",helmet 防
"浏览器层面的注入/嵌套/嗅探",限流防"针对认证端点的爆破"。三者叠加。

## 7. 边界划分(谁该设什么)

- **server(helmet)**:API 响应的安全头——纵深防御,本期已覆盖。
- **nginx(边缘)**:面向浏览器的 **HTML/SPA** 的 CSP、HSTS 最好在**终止 TLS 的边缘**统一设;
  当前 SPA 由 nginx 托管,后续可在 nginx 为 HTML 响应补 CSP/HSTS(本期先由 server 侧 helmet
  覆盖 API)。
- **HSTS 生效前提是 HTTPS**:生产 TLS 一般终止在 nginx/LB;server 的 helmet HSTS 头经代理
  透传,或由边缘统一下发。

## 8. 后续(本期未做)

- 限流多副本精确化:接 Redis store。
- nginx 边缘为 HTML 响应补 CSP / HSTS。
