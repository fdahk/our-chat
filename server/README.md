# our-chat server

> 后端服务:Express 4 + Prisma 7 + PostgreSQL 16 + Socket.IO + OAuth 2.1/OIDC IdP
> Node 22 LTS + TypeScript + ESM

## Quick Start

**方式 A:完全容器化(零依赖,只需 Docker)**

```bash
git clone <repo>
cd server
cp .env.example .env       # 必填 JWT_SECRET,可用 openssl rand -hex 32
mkdir -p keys && openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
  -out keys/oauth-private-dev.pem
pnpm docker:dev            # 起 PG + server,bind mount + 热重载
```

**方式 B:半容器化(本机有 Node 22 + pnpm,IDE 调试友好)**

```bash
pnpm setup                 # 装依赖 / 起 PG / migration / 生成密钥(~1 分钟)
pnpm dev                   # 本机进程启动 server
```

打开 <http://localhost:3007/health>。**详见 [`docs/onboarding/01-本地开发环境搭建.md`](./docs/onboarding/01-本地开发环境搭建.md)**。

## 命令速查

| 类别 | 命令 | 说明 |
|---|---|---|
| 环境 | `pnpm setup` | 一键搭建(检测依赖 + 起 PG + Migration + 私钥) |
|  | `pnpm docker:up` / `docker:down` | 仅起/停 PostgreSQL |
|  | `pnpm clean:db` | 重置(删 PG 数据卷) |
| 开发 | `pnpm dev` | tsx watch 热重载 |
|  | `pnpm test` / `test:watch` | Vitest |
|  | `pnpm typecheck` | TypeScript 严格检查 |
| 数据库 | `pnpm db:migrate:dev` | 开发新 schema 变更 |
|  | `pnpm db:migrate:deploy` | 生产/CI 应用 pending |
|  | `pnpm db:studio` | Prisma Studio Web UI |
| 构建 | `pnpm build` | 编译 TS + 生成 Prisma Client |
|  | `pnpm start` | `node dist/server.js`(生产) |

## 文档导航

- **入门** [docs/onboarding/01](./docs/onboarding/01-本地开发环境搭建.md) · [02 生产部署](./docs/onboarding/02-生产部署SOP.md)
- **数据库** [docs/database/](./docs/database/) · 重构记录 / Migration SOP / PG 决策记录
- **OAuth IdP** [docs/oauth/](./docs/oauth/) · 9 篇设计 + 集成指南

## 架构(关键决策)

| 维度 | 选择 | 来源 |
|---|---|---|
| 关系/消息层 | **PostgreSQL 16**(JSONB)单库 | [db/03-PG统一替换MongoDB决策记录](./docs/database/03-PG统一替换MongoDB决策记录.md) |
| ORM | **Prisma 7**(schema-as-code + migration + 强类型 client) | [db/01-数据库管理重构记录](./docs/database/01-数据库管理重构记录.md) |
| OAuth | **2.1 + OIDC + PKCE + Refresh Rotation + JWKS**(self-hosted IdP) | [oauth/](./docs/oauth/) |
| 鉴权传输 | HttpOnly cookie + 双提交 CSRF(业务 API)/ Bearer JWT(OAuth) | [oauth/01-架构设计](./docs/oauth/01-架构设计.md) |
| 消息持久化 | PG `messages` 表 + 复合索引 `(conversation_id, timestamp DESC)`,DISTINCT ON 命中 Index-Only Scan | [db/04-从MongoDB迁移到PG的差异对照](./docs/database/04-从MongoDB迁移到PG的差异对照.md) |
| 实时通道 | Socket.IO,鉴权复用 HttpOnly cookie | `src/utils/socket.ts` |

## 仓库结构

```
src/
├── server.ts           启动入口(migrate → seed → mount → listen)
├── app.ts              Express 装配
├── config/             env 配置加载
├── database/           PrismaClient 单例 + BigInt JSON polyfill
├── middleware/         鉴权 + CSRF 中间件
├── oauth/              OAuth 2.1/OIDC IdP 模块
├── routes/             业务路由(login/register/chat/friend/user/upload)
└── utils/socket.ts     Socket.IO 通信层

prisma/
├── schema.prisma       16 个 model schema 唯一来源
└── migrations/         schema 演进历史

docs/
├── onboarding/         新人入门(本地 + 生产)
├── database/           数据库重构记录
└── oauth/              IdP 完整文档

scripts/setup-dev.sh    一键搭建脚本
docker-compose.yml      本地 PG(+ 可选 pgAdmin)
Dockerfile              生产镜像(多阶段构建)
```
