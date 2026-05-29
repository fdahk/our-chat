# 13 · CORS 收敛为白名单并启用 cookie-parser

> 类别：安全（跨域策略 / 凭据传输基础设施）
> 涉及文件：`server/src/app.js`、`server/src/utils/socket.js`（cors 部分）
> 关联：本条是 [报告 10（cookie 鉴权）](./10-HttpOnly-cookie-与-CSRF-双提交鉴权迁移.md) 的基础设施前提——不收敛 CORS、不解析 cookie，cookie 鉴权根本跑不起来。

## 一、问题本体

改造前后端用 `app.use(cors())`——**默认放行所有来源（`Access-Control-Allow-Origin: *`）**，且没有启用 cookie 解析中间件。两个问题：

1. **CORS 通配 `*`**：任意网站的 JS 都能跨域调本后端的 API。在改 cookie 鉴权后这尤其致命——但即便在旧的 Bearer 方案下，通配也意味着任何站点都能尝试调用接口。
2. **未解析 cookie**：Express 默认不解析 `Cookie` 头，`req.cookies` 是 `undefined`。cookie 鉴权要从 `req.cookies[TOKEN_COOKIE]` 读 token，没有 `cookie-parser` 就读不到。

更关键的是一条**浏览器硬性规则**：

> **当请求携带凭据（`withCredentials: true` / cookie）时，`Access-Control-Allow-Origin` 不允许是 `*`，必须是具体来源，且要配 `Access-Control-Allow-Credentials: true`。**

也就是说，一旦走 cookie 鉴权（报告 10），`cors()` 的通配模式会让浏览器直接拒收响应——**CORS 收敛不是可选优化，是 cookie 方案的强制前提。**

## 二、概念扫盲

### 2.1 CORS 是什么、防什么
**同源策略（Same-Origin Policy）** 是浏览器的基础安全机制：A 源的 JS 默认不能读取 B 源的响应。**CORS（跨源资源共享）** 是 B 源服务端"显式开口子"的协议——通过 `Access-Control-Allow-*` 响应头声明"我允许哪些源跨域读我"。

要厘清一个常见误解：**CORS 是服务端授权"谁能读我的响应"，不是"谁能给我发请求"。** 请求其实已经到达服务端了，CORS 控制的是浏览器要不要把响应交给发起页面的 JS。所以 CORS **不能替代鉴权**——它防的是"恶意站点的 JS 读到你的数据"，不防直接的服务器对服务器请求（那种没有浏览器，不受 CORS 约束）。

### 2.2 凭据请求与 `*` 的冲突
普通 CORS 可以用 `*` 通配。但带凭据（cookie）的请求，浏览器要求服务端**指名道姓**回 `Allow-Origin: <具体源>` + `Allow-Credentials: true`。这是为防止"任意站点都能带着用户 cookie 调你的接口并读结果"——等于强制服务端明确列出可信前端。

### 2.3 cookie-parser
Express 中间件，解析请求的 `Cookie` 头，填充 `req.cookies`。鉴权中间件、刷新接口都依赖它读 HttpOnly token cookie 和 csrfToken cookie。

## 三、实现

### 3.1 CORS 白名单（`app.js`）
```js
const allowedOrigins = (
  process.env.CLIENT_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173'
).split(',').map((o) => o.trim()).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`不允许的跨域来源: ${origin}`));
  },
  credentials: true,        // 允许携带 cookie
}));
app.use(cookieParser());    // 解析 cookie，供鉴权中间件读取
```
- 白名单来自环境变量 `CLIENT_ORIGINS`（逗号分隔），开发默认放行本机 Vite 的两个地址。生产改环境变量即可，无需动代码。
- `credentials: true`：配合 cookie 鉴权，让浏览器允许带 cookie 并接收响应。
- **`!origin` 放行**：无 `Origin` 头的请求（同源经 Vite 代理转发、移动端原生、curl、服务端对服务端）不是跨域浏览器请求，放行。注意这不削弱安全——CORS 本就只约束浏览器跨源场景。

### 3.2 socket.io 的 CORS（`socket.js`）
socket.io 有**独立的** cors 配置，必须同样收敛（同一套 `allowedOrigins` + `credentials:true`），否则 WebSocket 握手时浏览器不带 cookie，握手鉴权（报告 11）拿不到 token。

## 四、取舍

| 方案 | 安全性 | 灵活性 | 评价 |
|------|------|------|------|
| `cors()` 通配 `*`（旧） | ❌ 任意源可读 + 与凭据请求不兼容 | 高 | cookie 方案下根本不可用 |
| 硬编码单一 origin | ✅ | ❌ 改地址要改代码、多环境难管 | 过死 |
| 环境变量白名单（本次） | ✅ 只放行已知前端 | ✅ 改 env 即可，多环境友好 | 最优 |
| 反射 Origin（回显请求的 Origin 并允许 credentials） | ❌ 等价于通配且更隐蔽，安全审计常见红线 | 高 | 危险，禁用 |

最后一行特别值得记：有些图省事的写法是"把请求的 `Origin` 原样回显到 `Allow-Origin`"，看似动态实则等于通配——任何源都会被回显放行，配合 `credentials:true` 就是把用户凭据对全网开放。本次的白名单 `includes` 校验正是避免这个陷阱。

## 五、踩坑记录

1. **带凭据时 `*` 会被浏览器拒收**：报错形如 "The value of the 'Access-Control-Allow-Origin' header must not be the wildcard '*' when the request's credentials mode is 'include'"。这是从 Bearer 迁到 cookie 时第一个会撞上的错。
2. **socket.io 的 cors 是独立的**，改了 `app.use(cors())` 不会自动作用到 WebSocket，得在 `new Server(server, { cors: {...} })` 里单独配。漏配会表现为"HTTP 接口正常但 socket 连不上/不带 cookie"。
3. **中间件顺序**：`cookieParser()` 必须在用到 `req.cookies` 的路由/鉴权中间件**之前** `use`，否则读到 `undefined`。
4. **`localhost` 与 `127.0.0.1` 是不同的 origin**，浏览器视作两个源。白名单要把实际用到的都列上，否则换个地址访问就被拦。
5. **预检（preflight）**：带自定义头（如 `X-CSRF-Token`）的请求会触发 `OPTIONS` 预检，`cors` 中间件会自动处理，但白名单逻辑同样作用于预检——源不在白名单则预检就失败，真正请求都发不出。

## 六、业界对比与 Web vs Native

- **业界**：CORS 白名单 + 环境变量配置是标准做法；生产严禁 `*` + credentials 组合；反射 Origin 是安全审计明确的红线。更完善的做法会区分不同环境用不同白名单、配合 API 网关统一管理跨域策略。
- **Web vs Native**：**CORS 是纯浏览器机制，原生 App 完全不受其约束**——原生 HTTP 客户端没有同源策略，CORS 头对它无意义。所以"后端配了 CORS 就安全了"是错觉：它只挡浏览器里的跨源 JS，挡不住原生客户端、脚本、爬虫的直接请求。真正的访问控制永远靠鉴权（报告 10/11），CORS 只是浏览器场景下的一层附加防护。这也解释了为什么 `!origin`（无 Origin 头，常见于非浏览器客户端）放行不算降低安全：那些请求本就不在 CORS 的职责范围内，安全由鉴权兜底。

## 七、验证

- `node --check src/app.js`、`node --check src/utils/socket.js` 通过；`cookie-parser` 已在 `package.json` 依赖且已安装。
- **未做运行验证**：需起前后端确认跨域携带 cookie 的实际请求/预检/socket 握手均通过，本次环境不具备完整依赖。
