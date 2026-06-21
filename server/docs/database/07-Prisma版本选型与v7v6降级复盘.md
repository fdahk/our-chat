# 07 · Prisma 版本选型与 v7→v6 降级复盘

> 一次因 "图省事用 latest 版" 引发的 server 启动失败,与据此做的版本退坡。
> 适用读者:本项目维护者,以及"用 Prisma 但不在 serverless / edge 环境"的任何 Node 后端团队。

---

## 0. TL;DR(一句话)

**Prisma 7 把默认查询引擎换成了 rust-free 的 "client" 引擎,强制要求传 `adapter` 或 `accelerateUrl`,否则构造期即崩。该改动是为 serverless / edge 设计的,Node 长寿命服务用不到这层 upside,只承担 setup pain,故本项目从 `^7.8.0` 降到 `^6.19.3`(Prisma 6 LTS)。**

---

## 1. 故障表象

`docker compose up` 后:

```
NAMES               STATUS
our-chat-server     Up 11 minutes (unhealthy)
our-chat-postgres   Up 11 minutes (healthy)
```

健康检查失败,前端注册返回 500 "服务器内部错误"。
`docker logs our-chat-server`:

```
PrismaClientConstructorValidationError: Using engine type "client" requires either
"adapter" or "accelerateUrl" to be provided to PrismaClient constructor.
    at Rm (/app/src/generated/prisma/runtime/client.js:70:4137)
    at new t (/app/src/generated/prisma/runtime/client.js:74:1808)
    at <anonymous> (/app/src/database/prisma.ts:13:3)
```

Server 在 `new PrismaClient()` 构造期就抛了 ── 根本没起到 listen,所有请求自然 500。

---

## 2. 根因 ── Prisma 7 的架构断代

### 2.1 历史 ── Prisma ≤ 6 怎么连 DB

```
+------------------+      +-------------------------+      +------+
| @prisma/client   |  →   | query-engine-{platform} |  →   |  PG  |
| (TS, ~5 MB)      |      | (Rust binary, ~30 MB)   |      +------+
+------------------+      +-------------------------+
```

Rust binary 引擎随包打进 `node_modules/@prisma/engines/`,内部用 libpq 直连 DB。
`new PrismaClient()` 零配置,因为引擎自己知道怎么连。

代价:30 MB 的 native binary,跨平台要 platform-specific build,**serverless 冷启动重**、**Edge runtime 装不下**。

### 2.2 Prisma 7 ── 默认换成 "client" 引擎

```
+------------------+      +------------------+      +-----------+      +------+
| @prisma/client   |  →   | "client" engine  |  →   | pg driver |  →   |  PG  |
| (TS, ~5 MB)      |      | (TS,~200 KB)     |      | (Node)    |      +------+
+------------------+      +------------------+      +-----------+
                                                    ↑
                                          你必须提供 adapter
```

引擎不再连 DB,**把连接外包给 Node 驱动**(pg / mysql2 / planetscale / d1 …)。
连接桥是 `@prisma/adapter-pg`、`@prisma/adapter-mysql2` 等"驱动适配器"。

**这就是为什么 v7 构造期会校验**:
```js
// runtime/client.js (Prisma 7)
if (!hasAdapter && !hasAccelerateUrl) {
  throw new S('Using engine type "client" requires either "adapter" or "accelerateUrl" ...');
}
```

> 注 ── `accelerateUrl` 指 Prisma Accelerate(官方托管 connection-pooler + edge cache),收费。

### 2.3 设计动机(站在 Prisma 团队角度)

- **拆 Rust binary** → 让 Prisma 能跑在 Cloudflare Workers / Vercel Edge / Deno Deploy 这些不能装 native binary 的环境
- **可换驱动** → 谁连 DB 由用户挑,Prisma 不再绑 libpq
- **更轻的冷启动** → serverless lambda 解 30 MB 的延迟没了
- **TypeScript-native** → 引擎用 TS 重写,更易扩展插件

这些都是真实价值,只对**特定部署形态**有意义。

---

## 3. 我们的场景值不值得吃这套架构税?

| 维度 | Prisma 7 收益 | our-chat 现状 |
|---|---|---|
| 包体积 −30 MB | Lambda cold start 友好 | ❌ 长寿命 Docker 容器,启一次跑很久 |
| Rust-free | Edge runtime 兼容 | ❌ Express + socket.io,装不进 Edge |
| 驱动可替换 | 想用 `postgres.js` / `pgx` | ❌ 无此诉求 |
| 连接池外部化 | PgBouncer / Hyperdrive | ❌ Docker 内 PG,Prisma 自带连接池够用 |

**结论:四条 upside 全 miss,而 downside(多两个依赖、adapter init、生态文档缺位)全要承担。**

这是典型的"为了用 latest 而用 latest"。`pnpm add prisma` 默认拿 7.x,选型时没读 release note。

---

## 4. 三条出路对比(决策表)

### A) 留 v7,加 `@prisma/adapter-pg`

```ts
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
export const prisma = new PrismaClient({ adapter });
```

| 项 | 评估 |
|---|---|
| 改动量 | 小(2 个依赖 + 5 行 init) |
| 长期方向 | ✓ 跟官方推荐路径 |
| 短期成本 | 多一层桥,故障路径变长 |
| 教程/Issue 量 | **极少**(v7 刚发布几个月) |

### B) 降到 Prisma 6 LTS ← **本次选择**

```diff
- "prisma": "^7.8.0"
+ "prisma": "^6.19.3"
- "@prisma/client": "^7.8.0"
+ "@prisma/client": "^6.19.3"
```

`new PrismaClient()` 零配置即可用。

| 项 | 评估 |
|---|---|
| 改动量 | 改 package.json + 重新 generate |
| 长期方向 | LTS 仍维护(Prisma 6 是 2024 主线,会持续到至少 2026Q3) |
| 短期成本 | 0 代码改动(回到行业标配) |
| 教程/Issue 量 | **海量**,踩坑成本最低 |

### C) 换 Drizzle / Kysely

| 项 | 评估 |
|---|---|
| 改动量 | 整个 DB 层重写 |
| 学习曲线 | Drizzle 更接近 SQL,Kysely 是查询构造器,跟 Prisma model API 心智不同 |
| 收益 | bundle 更小、零运行时迁移、SQL-first | 

不在本次时窗内,先放弃。

---

## 5. 选 Prisma 6 的判断流(给后人)

```
你是不是 serverless / edge runtime?
├─ 是(Vercel Functions / Cloudflare Workers / Deno Deploy / Lambda)
│   └─ Prisma 7 + driver adapter   ← 必须,无 Rust binary 你装不下
│
└─ 否(VPS / Docker / K8s / 自建)
    └─ Prisma 6 LTS               ← 这是 our-chat 的归宿
```

简化版规则:**包大小敏感 + 冷启动敏感 → Prisma 7。其它一切场景 → Prisma 6。**

---

## 6. 降级执行的踩坑

### 坑 1:`prisma.config.ts` 是 v7 特性

Prisma 7 引入 `prisma.config.ts` 取代 `.env`:

```ts
import { defineConfig } from 'prisma/config';
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: process.env.DATABASE_URL },
});
```

降到 v6 后 CLI 仍会读这个文件(为前向兼容),但 schema 验证用的是 v6 规则,**v6 schema 必须自己声明 `url`**,否则:

```
Error: P1012 Argument "url" is missing in data source block "db".
```

**处理方式**:
1. 删 `prisma.config.ts`
2. schema 里改回标准声明:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
3. 保留 `.env` / docker-compose env 注入 `DATABASE_URL`

### 坑 2:Docker named volume 缓存旧依赖

`docker-compose.dev.yml` 把 `node_modules` 挂成 `server_node_modules` named volume(避免被宿主 mount 覆盖)。改 `package.json` 后 **必须显式删卷**,否则容器内还是 v7:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
docker volume rm server_server_node_modules server_server_generated
docker compose -f docker-compose.yml -f docker-compose.dev.yml build --no-cache server
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

`build --no-cache` 也必须 ── 否则 `pnpm install --frozen-lockfile` 那层会用 layer cache 跳过。

### 坑 3:生成的客户端要清

`src/generated/prisma/` 是 v7 产物,降级后必须 `rm -rf` 并重 `prisma generate`,否则运行时 import 的还是 v7 runtime。dev 容器启动脚本 `pnpm db:generate && pnpm db:migrate:deploy && pnpm dev` 已自动跑 generate,所以容器内不用管;**宿主开发**需手动:

```bash
rm -rf src/generated/prisma
pnpm db:generate
```

---

## 7. 执行清单(完整复现路径)

```bash
# 0. 退掉为 v7 临时加的 adapter 依赖(若有)
pnpm remove @prisma/adapter-pg pg @types/pg

# 1. 降版本
pnpm add prisma@^6.19 @prisma/client@^6.19

# 2. 改 schema 声明 url
#    在 datasource db {} 里加 `url = env("DATABASE_URL")`

# 3. 删 v7-only 配置文件
rm prisma.config.ts

# 4. 清旧生成物 + 重 generate
rm -rf src/generated/prisma
pnpm db:generate

# 5. 验证宿主 typecheck
pnpm typecheck

# 6. 清 docker 卷 + 重建镜像
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
docker volume rm server_server_node_modules server_server_generated
docker compose -f docker-compose.yml -f docker-compose.dev.yml build --no-cache server
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# 7. 冒烟验证
curl -sS -X POST http://localhost:3007/api/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"smoke","email":"smoke@x.com","password":"Smoke123","nickname":"smoke"}'
# 期望: {"success":true,"data":{"id":1, ...}}
```

---

## 8. 业界参照(防"我用 6 是不是落伍了")

| 项目 | Prisma 版本 | 部署形态 |
|---|---|---|
| Linear | Prisma 5/6 自管演进 | 自建 PG |
| Vercel(自家) | Prisma 7 + Accelerate | Edge / Serverless |
| Cal.com | Prisma 5 → 6 升级中 | VPS Docker |
| Supabase 范例 | Prisma 6 LTS | 用 Supabase 托管 PG |
| Cloudflare D1 范例 | **Prisma 7 + adapter-d1** | Workers(必须 v7) |

规律:**部署形态决定版本**,不是版本决定先进性。Edge / Serverless 用 7,长寿命服务用 6 ── 这就是 2026 年的行业实况。

---

## 9. 校招视角(可面试讲)

如果面试官问"你们项目用什么 ORM,为什么":

> 我们用的 Prisma 6 LTS。Prisma 7 把引擎做成了 rust-free 的 client 模式,要求传 driver adapter,是为了适配 Cloudflare Workers / Vercel Edge 这些不允许 native binary 的环境。我们部署形态是长寿命 Docker 容器,这层 upside 用不到,反而要承担 adapter 配置 + 文档稀缺的 downside,所以选 6。这是个**部署形态驱动版本选择**的例子,不是新的就一定是好的。

这答案比"我们用了最新的 Prisma 7"更能体现**工程取舍能力**。

---

## 10. 关键认知(全文压缩)

1. **Prisma 7 ≠ Prisma 6 的小升级**,是引擎架构断代:Rust binary → rust-free + driver adapter
2. **driver adapter 是必填,不是可选**,v7 构造期就校验,不传直接崩
3. **场景决定版本**:Edge/serverless 选 7;VPS/Docker/K8s 选 6
4. **`prisma.config.ts` 是 v7 idiom**,降回 v6 要回 `env("DATABASE_URL")` 标准模式
5. **Docker named volume 缓存陷阱**:改 `package.json` 后必须显式删卷 + `build --no-cache`
6. **"用 latest" 不是工程美德**,读 release note 才是
