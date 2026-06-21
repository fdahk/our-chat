# 本地代理链路与后端 CORS:为什么"用了本地代理还会跨域"

记录一个容易踩的认知坑:开发时前端明明走了 vite 本地代理(看似同源),后端却仍报
`不允许的跨域来源: https://localhost:5173`。本文讲清两套链路的区别、CORS 在哪一层被
触发、以及为什么修的是 `CLIENT_ORIGINS` 而不是代理。

## 1. 先厘清两套链路(dev ≠ prod)

很多误解源于把 dev 和 prod 的链路混为一谈:

```
dev (make dev):
  浏览器 ──→ vite(:5173, https)── 代理 ──→ 直连 server:3007 / gateway:8090
            └ nginx 不参与 dev ┘

prod (docker compose):
  浏览器 ──→ nginx(web 容器, :8080)── 反代 ──→ server:3007 / gateway:8090
            └ vite 不参与 prod ┘
```

- **dev 链路里没有 nginx**;同源反代的活由 **vite 的 `server.proxy`** 干。
- **prod 链路里没有 vite**;由 **nginx** 干。
- 两者是"同源反向代理"这同一角色的两个不同实现。所以"前端→nginx→业务"是 **prod** 的
  链路,不是你本地 `make dev` 跑的链路。

## 2. 关键:"浏览器同源" ≠ "后端不校验 Origin"

CORS 其实是**两层独立**的东西,别混:

| 层 | 谁做 | 何时触发 |
|---|---|---|
| 浏览器侧 CORS | 浏览器 | 对**跨源**请求做预检/拦截。走相对路径 `/api` 经代理 = 同源 → 浏览器**不拦、不预检** |
| 服务端 Origin 白名单 | server 的 `cors()` 中间件 | 它**自己**读请求头里的 `Origin`,对照 `CLIENT_ORIGINS` 校验。与浏览器是否同源无关 |

踩坑的核心机制:

> **代理会把浏览器的 `Origin` 头原样透传给后端。**
> vite/nginx 代理的 `changeOrigin: true` 只改 `Host` 头(改成上游地址),**不动 `Origin` 头**。

于是即便浏览器认为同源、没做任何 CORS 拦截,后端依然能看到
`Origin: https://localhost:5173`,并用自己的白名单去校验。白名单里没有这个值 → **后端
主动抛 `不允许的跨域来源` 并返回 500**。

**结论:那次报错不是"浏览器跨域拦截",是"后端 CORS 中间件按白名单拒了代理透传来的
Origin"。** 所以修复点在后端的 `CLIENT_ORIGINS`,而不是代理配置。

## 3. 实证(可复现)

同一路径、只改 `Origin` 头,对比"直连后端"与"经 vite 代理":

```bash
# 直连 server:3007(绕过代理)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3007/api/login -H "Origin: https://localhost:5173"  # 404 放行(白名单已含)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3007/api/login -H "Origin: https://evil.com"          # 500 拒绝(不在白名单)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3007/api/login                                        # 404 放行(无 Origin 不校验)

# 经 vite 代理:5173
curl -sk -o /dev/null -w "%{http_code}\n" https://localhost:5173/api/login -H "Origin: https://evil.com"        # 500 拒绝
```

两个关键证据:

- **经代理打 `Origin: https://evil.com` → 后端 500**:证明 **代理确实把 Origin 透传到了后端**
  (否则后端看不到 evil.com,不会拒)。
- **无 `Origin` 头 → 404 放行**:证明后端只对**带 Origin 的请求**做白名单校验
  (`cors()` 的逻辑:`if (!origin || allowedOrigins.includes(origin)) 放行`)。

> 说明:`GET /api/login` 没有对应路由,CORS 通过后返回 404;CORS 被拒时走全局错误处理返回
> 500。所以这里用 404/500 区分"放行/拒绝"。

## 4. 根因与修复

- **根因**:dev 的 vite 跑在 **https**(`https://localhost:5173`),浏览器 Origin 是 https;
  但 `CLIENT_ORIGINS`(`docker/.env.debug`)当时只配了 `http://...` 两个 → https 被后端拒。
- `server/src/app.ts` 的默认值本就含 http+https 四个变体;**但一旦 `CLIENT_ORIGINS` 被显式
  设置,就以它为准**,默认值不再生效 → 它漏了 https。
- **修复**:把 `CLIENT_ORIGINS` 补齐为四个变体:
  ```
  CLIENT_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://localhost:5173,https://127.0.0.1:5173
  ```
- **⚠️ 必须重启才生效**:`CLIENT_ORIGINS` 在进程启动时读一次(`app.ts` 顶层 `const`),
  `tsx watch` 只监听 `.ts` 不监听 `.env` → 改完 env 必须 `Ctrl-C` 重启 `make dev`。

## 5. 为什么同源了还要保留后端 CORS 白名单

既然 dev/prod 都同源,后端 `cors()` 看似多余。保留它是为了:

- **纵深防御**:挡住直接打到后端的非法 Origin(上面 `evil.com → 500` 就是它在干活)。
- **兼容非代理客户端**:移动端(Bearer 直连)、第三方、curl 等不走代理的来源。

代价就是:**白名单必须包含"代理会透传上来的真实浏览器 Origin"**,否则自家前端会被自家
后端拒(本次的坑)。

## 6. 附:同源请求何时也带 Origin 头

- 浏览器对**跨源**请求一定带 `Origin`;
- **同源**请求中,非 GET/HEAD(POST/PUT/DELETE)通常**也带** `Origin`,同源 GET 一般不带。
- 经代理后,这些 `Origin` 都会原样透传到后端 → 所以同源的 POST(如登录)也会触发后端的
  白名单校验。这就是为什么"明明同源的登录请求"也会因白名单缺项而被拒。
