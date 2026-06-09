# 01 · 前端 dev proxy vs 后端 CORS:选型决策与本项目实践

> 一次"图省事用 vite proxy 接 agent-server"被指出有问题,据此重做的选型框架。
> 适用读者:前端工程师在做"多服务集成"时,纠结 proxy / CORS / BFF 怎么选。

---

## 0. TL;DR

| 场景 | 选什么 | 为什么 |
|---|---|---|
| 后端用 HttpOnly cookie 鉴权(同源约束) | **dev proxy** + 生产同款 nginx 反代 | 浏览器要带 cookie 必须同源 |
| 后端用 Bearer token / API key 鉴权 | **后端 CORS 白名单** + 前端直连 | 无 cookie 约束,proxy 是多余间接层 |
| 多前端共用一个后端 | **后端 CORS 白名单** | 每家前端搭 proxy 是重复劳动 + dev/prod 行为漂移 |
| 改不了后端(老服务 / 第三方) | dev proxy 作为唯一选择 | 没的选 |
| 生产用 BFF 网关聚合 | dev proxy 镜像生产网关拓扑 | 保持 dev / prod 对称性 |

本项目当下:
- `/api/*`(our-chat 主后端)→ **dev proxy**(它用 HttpOnly cookie)
- `/socket.io/*`(WebSocket)→ **dev proxy**(WS 也走 cookie)
- `/agent-api/*`(agent-server)→ ❌ **删除**,改成 `VITE_AGENT_API_BASE` 直连 + agent-server 自管 CORS 白名单

---

## 1. 概念扫盲:proxy 与 CORS 到底各管什么

### 1.1 Vite dev proxy 是什么

```
浏览器
  ├─ 请求 http://localhost:5173/api/login   ← 看起来"同源"
  ▼
Vite dev server (Node)
  ├─ proxy 拦截 /api/* 前缀
  ▼
真实后端 http://127.0.0.1:3007/api/login  ← 实际转发
```

**关键事实:**
- proxy 跑在 **Vite dev server** 进程里(Node)
- 浏览器**看不见**这层转发,它只知道在跟 `localhost:5173` 通信
- 因此**绕开了 CORS**(浏览器视角下就是同源)
- 也**绕开了第三方 cookie 拦截**(Safari ITP、Chrome 后续版本)

**致命缺点:**
- **只在 dev 存在**。`pnpm build` 出的是静态包,没有 Node 进程,proxy 消失
- 生产必须用其他手段:nginx 反代 / CORS / BFF

### 1.2 CORS 是什么

```
浏览器
  ├─ 发出 https://app.com/data 的 fetch,但页面 origin 是 https://other.com
  ▼
CORS 预检(OPTIONS) → 服务器返回 Access-Control-Allow-Origin: https://other.com
  ▼
浏览器允许实际请求继续
```

**关键事实:**
- CORS 是**浏览器端的安全规则**,服务器只是按规则告诉浏览器"我允许谁来"
- 跟服务器实际处理请求无关 ── curl / Postman 没 CORS 限制(它们不实现 origin 校验)
- 三个核心 header:`Access-Control-Allow-Origin` / `-Methods` / `-Headers`
- 带 cookie 跨源需 `Access-Control-Allow-Credentials: true` 且 `Allow-Origin` 不能是 `*`

**简单 vs 预检请求:**
- 简单请求(GET / 简单 POST + 标准 header)→ 浏览器直接发,然后看响应头
- 复杂请求(自定义 header / PUT / DELETE 等)→ 先发 OPTIONS 预检,确认后再发真正请求
- 预检结果可以 cache(`Access-Control-Max-Age`)

---

## 2. 我最初的错误选择 + 原因

我加 agent-server 接入时无脑加了 vite proxy:

```ts
// vite.config.ts(已删除)
'/agent-api': {
  target: 'http://127.0.0.1:3101',
  changeOrigin: true,
  rewrite: (p) => p.replace(/^\/agent-api/, '/api'),
},
```

**反思:为什么会犯这个错**
1. 看到项目里 `/api` 已经用 proxy 了,**直觉复制粘贴**
2. 没去看 agent-server 是否已配 CORS(实际它早就 `app.enableCors({ origin: true })` 了)
3. 没区分两种后端鉴权模型:our-chat 是 HttpOnly cookie(必须同源),agent-server 是 Bearer token(无同源约束)

**这个错的实际危害**
- **生产构建后 404**:`/agent-api/*` 在 nginx / CDN 静态产物里找不到目标,得在 nginx 重写 ── 一套配置两个地方
- **dev / prod 行为不对称**:dev 看不到的 CORS 问题(后端 origin 配错),上线才爆
- **隐式耦合 vite 配置和部署拓扑**:换部署方式(K8s ingress / Cloudflare Pages / Vercel)都要改 vite proxy,本质是**把部署知识揉进了前端构建工具**

---

## 3. 业界主流做法

### 3.1 真实公司怎么处理"前端 + 多个后端"

| 公司 / 框架 | 做法 | 原因 |
|---|---|---|
| **Next.js 默认** | rewrites + API routes,**等价 BFF** | App 路由原生支持,无 CORS 烦恼 |
| **Vercel 部署 Vite SPA** | 配 `_redirects` / vercel.json 重写 | edge 层做反代,前后端同域 |
| **Cloudflare Pages + Workers** | Pages Functions(BFF)或 Workers route | edge 网关聚合 |
| **大厂内网** | nginx ingress + service mesh,各服务 CORS 也配 | 多层防御 |
| **Vite + 自管 nginx** | 前端 nginx 反代 `/api/*` `/agent-api/*` 到对应 service | dev 用 vite proxy 镜像同款规则 |

### 3.2 经验法则

> **"代理"是部署形态的一部分,不是前端构建的一部分。**
> 
> 前端 dev proxy 的存在意义是 dev/prod 对称(镜像 nginx),不是为了消除 CORS。
> 如果生产没反代,dev 用 proxy 就是制造行为差异。

---

## 4. 修正后的方案

### 4.1 agent-server 侧:CORS 收紧到 env 白名单

`apps/node-server/src/main.ts`:

```ts
app.enableCors({
  origin: buildCorsOrigin(),
  credentials: true,
  exposedHeaders: ['Last-Event-ID'],   // SSE 重连支持
});

export function buildCorsOrigin(): string[] | boolean {
  const raw = process.env.CORS_ORIGINS?.trim();
  const list = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (list.length > 0) return list;
  // dev 不配 = 反射任意 origin(方便);prod 不配 = 禁所有跨源(强制 ops 显式配)
  return process.env.NODE_ENV !== 'production';
}
```

**为什么是 `string[]` 而不是 `* / true`:**
- `*` 不能配合 `credentials: true`(浏览器明令禁止)
- `true`(反射任意 origin)只适合 dev
- 精确列表 = **生产可审计**,改 origin 要走配置变更流程

### 4.2 web 侧:env-driven base URL

`src/views/agentView/api.ts`:

```ts
export const BASE: string =
  (import.meta.env.VITE_AGENT_API_BASE as string | undefined)
  ?? 'http://localhost:3101/api';
```

`.env.example`:
```
VITE_AGENT_API_BASE=http://localhost:3101/api
```

部署各环境差异化:
- dev:`http://localhost:3101/api`
- staging:`https://agent-staging.your-domain.com/api`
- prod:`https://agent.your-domain.com/api`

vite 编译期内联 `import.meta.env.VITE_*` ── 没运行时开销,bundle 里就是字面量 URL。

### 4.3 vite.config.ts:proxy 只留必要的

```ts
proxy: {
  // 必须同源:用 HttpOnly cookie
  '/api':       { target: 'http://127.0.0.1:3007', changeOrigin: true },
  '/user':      { target: 'http://127.0.0.1:3007', changeOrigin: true },
  '/socket.io': { target: 'http://127.0.0.1:3007', changeOrigin: true, ws: true },
  // agent-server 走 CORS,不在这里
},
```

---

## 5. 决策流(给后人 / 自己回查)

```
新加一个后端服务接入,前端怎么调?
├─ 鉴权方式?
│   ├─ HttpOnly cookie (SameSite=Lax/Strict)
│   │   └─ 必须同源 → 用反代(dev proxy + prod nginx)
│   │
│   ├─ Bearer token / API key
│   │   └─ 走 CORS 白名单(让后端自描述允许的 origin)
│   │
│   └─ Session cookie (SameSite=None;Secure)
│       └─ 跨源可带 cookie,但很多浏览器拦截,生产慎用
│       └─ 倾向反代
│
├─ 后端我能改吗?
│   ├─ 能 → CORS 是更标准的做法,各前端自治
│   └─ 不能 → 只能用 dev proxy(且 prod 必须有反代兜底)
│
└─ 生产部署形态?
    ├─ 同域(nginx 反代 / BFF / Edge Functions)→ dev proxy 镜像一样
    ├─ 跨域(独立子域)→ CORS 白名单
    └─ 还没定 → 先用 CORS,等架构定型再决定是否套 BFF
```

---

## 6. Web vs Native(顺手对比)

| | Web 浏览器 | iOS / Android 原生 |
|---|---|---|
| CORS | **存在**,浏览器强制 | **不存在**,原生 HTTP 库不管 origin |
| Cookie 跨域 | 受 SameSite / CORP / Third-party 拦截 | 不受限,自己管 cookie jar |
| 鉴权惯例 | HttpOnly cookie 或 Bearer in header | 几乎全用 Bearer token + Keychain 持久化 |
| dev proxy | vite / webpack-dev-server / next dev | 没有这概念,直连 + DNS / Hosts 改写 |

校招面试 follow-up 问:"原生 app 为啥不用 CORS"
答:CORS 是**浏览器的同源策略实现**,目的是保护用户在 A 站登录的凭证不被 B 站的 JS 滥用。原生 app 没有"网页 origin"概念,API 调用是 app 内部代码,鉴权用 keychain 持久化 token 加 Bearer header,信任边界是 **app 自身**而非 origin。

---

## 7. 当前实施(2026-06)

| 项 | 状态 |
|---|---|
| agent-server `main.ts` 改 `buildCorsOrigin()` | ✅ |
| agent-server `.env.example` 加 `CORS_ORIGINS` | ✅ |
| `vite.config.ts` 删 `/agent-api` proxy | ✅ |
| `agentView/api.ts` 用 `import.meta.env.VITE_AGENT_API_BASE` | ✅ |
| `web/.env.example` 新增 `VITE_AGENT_API_BASE` | ✅ |
| api.test.ts(SSE parser / 401 / 流式)| ✅ 21 测试 |
| 组件 smoke tests | ✅ AgentView / LoginGate / DocumentsTab / ConversationsTab / TasksTab |
| 覆盖率 | 78.84% statements,bug 重灾区(SSE / 401 / 状态机)100% |

---

## 8. 关键认知(全文压缩)

1. **proxy ≠ CORS 替代品**,它是 dev 镜像 prod 反代拓扑的工具
2. **CORS 是浏览器规则**,服务器只是按规则自描述允许哪些 origin
3. **HttpOnly cookie 鉴权 → 必须同源 → 反代**;**Bearer token 鉴权 → 走 CORS 即可**
4. **`origin: true` 是 dev 用的**,生产必须白名单,且不能配 `*` + `credentials: true`
5. **base URL 用 env 注入**,部署变化只动 env,不动代码
6. **行业惯例:dev / prod 行为对称**;能不让 dev 引入额外间接就不要引
7. **"我看别处这么写就抄"是反模式**,先问"那个场景跟我一样吗"
8. **bug 重灾区必须有单元测试**(SSE 分帧 / 401 清 token / 流式状态机)── 这些手测覆盖不到
