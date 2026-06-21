# our-chat

实时 IM + WebRTC 音视频通话。多语言、多服务单仓(monorepo),主开发分支 `dev`。

## 服务地图

| 服务 | 栈 | 端口 | 职责 |
|---|---|---|---|
| `server/` | Node + Express + Prisma + Socket.io + Redis | 3007 | 业务 / 信令 / OAuth IdP |
| `gateway/` | Go 1.22 + gorilla/websocket + JWT + Prometheus | 8090 | WebSocket 长连接接入层 |
| `web/` | React + Redux Toolkit + antd + Vite + i18next | 5173(dev) | Web 端 |
| `mobile-swift/` | iOS Swift | — | 移动端 |

> 部署相关的一切(compose / nginx / 部署 env)收口在顶层 `docker/`。

## 架构总览

生产环境单一对外入口是 `web` 容器里的 nginx:既托管 SPA 静态资源,又**同源反向代理**
到后端,后端服务只在内网。同源消除跨域 cookie/CORS 问题。

```
            浏览器 / iOS
                 │ :8080(唯一对外)
                 ▼
        nginx(web 容器,边缘入口)
          ├─ /api /user /oauth /api/upload ─→ server:3007
          ├─ /socket.io/                   ─→ server:3007   (Socket.io)
          ├─ /ws                           ─→ gateway:8090  (原生 WebSocket)
          └─ /(其余)                       ─→ 本地静态 SPA
                 │                                  │
            server ── Prisma ────→ PostgreSQL       │
              │   ── ioredis ───────┐                │
            gateway ── go-redis ────┴─→ Redis(pub/sub backplane + presence)
            文件 ──→ S3 兼容对象存储(dev=MinIO / prod=COS)
```

- **实时层**:server 用 Socket.io(+ Redis adapter 多实例广播);gateway 用原生
  WebSocket(有界缓冲背压 + Redis backplane 下行 + presence 镜像)。
- **鉴权**:server 是 IdP——自家 API 用 HS256 JWT(HttpOnly cookie);对下游用
  OAuth 2.1 / OIDC,提供 JWKS 公钥验签;gateway 共享 `JWT_SECRET` 只验签不签发。
- **文件存储**:上传协议编排(分片 / 秒传 / 断点续传)在 server,字节交给对象存储。

## 快速开始(本地开发)

一条命令拉起全部(中间件跑容器,业务跑宿主机热重载):

```bash
make dev
```

`make dev` 会自动:生成集中 dev env `docker/.env.debug`(并软链 `server/.env` 复用同一份)
→ 首次装依赖 + 生成 Prisma Client → 起中间件(postgres/redis/minio)→ 等 PG 就绪 →
并发跑 server(:3007)/ gateway(:8090)/ web(:5173),**Ctrl-C 一起停止**。

首次记得在 `docker/.env.debug` 填好 `JWT_SECRET`(`openssl rand -hex 32`)。
其它:`make middleware`(只起中间件)、`make down`(停中间件)。详见
`server/docs/onboarding/01-本地开发环境搭建.md`。

## 生产编排

```bash
cd docker && cp .env.example .env         # 填生产凭证(JWT_SECRET / DB / 对象存储)
docker compose up -d --build              # 中间件 + server + gateway + web/nginx
```

只有 `web` 暴露端口(`${WEB_PORT:-8080}:80`),其余服务仅内网可达。

## 端口

| 端口 | 用途 |
|---|---|
| 8080 | web/nginx(生产对外入口) |
| 5173 | web Vite dev server |
| 3007 | server(HTTP / Socket.io) |
| 8090 | gateway(WebSocket / `/metrics` / `/healthz`) |
| 5432 / 6379 | PostgreSQL / Redis |
| 9000 / 9001 | MinIO API / 控制台(仅 dev) |

## 目录结构

```
our-chat/
├── server/        Node 业务/信令后端(见 server/CLAUDE.md)
├── gateway/       Go 长连接网关(见 gateway/CLAUDE.md)
├── web/           React Web 端(见 web/CLAUDE.md)
├── mobile-swift/  iOS 客户端
├── docker/        部署 infra:compose(dev/prod) + nginx + .env.example
└── docs/          技术方案与设计记录
```

## 完工门禁

提交前各服务自测:

| 服务 | 命令 |
|---|---|
| server | `pnpm typecheck && pnpm test` |
| gateway | `go build ./... && go test ./...` |
| web | `pnpm lint && pnpm test` |

> CI:`.github/workflows/perf.yml` 对改动 `web/` 的 PR 跑体积预算 + Lighthouse。
> (正确性门禁的 CI 尚未接入。)

## 文档

- 工程组织与部署编排 — `docs/技术方案/工程组织与部署编排.md`
- 文件存储(S3 兼容对象存储)— `docs/技术方案/文件存储改造-迁移到S3兼容对象存储.md`
- OAuth IdP / 数据库 / 部署 / 上手 — `server/docs/{oauth,database,devops,onboarding}/`
- 各服务约定 — 各目录下 `CLAUDE.md`
