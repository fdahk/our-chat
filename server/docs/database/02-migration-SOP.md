# 02 · Migration 操作 SOP

> 所有 schema 变更必须经此流程,**严禁直接** `ALTER TABLE` / `CREATE TABLE` 改库

## 1. 工具栈

- **Prisma** 7.8+(`prisma migrate dev` / `deploy` / `status`)
- **Schema 源**:`prisma/schema.prisma`
- **Migration 文件**:`prisma/migrations/<timestamp>_<name>/migration.sql`(Prisma 生成)
- **应用记录表**:`_prisma_migrations`(Prisma 自动维护)

## 2. 三种典型场景

### 2.1 全新空库(开发首次 / 全新部署)

```bash
# 设置 DATABASE_URL 后:
pnpm db:migrate:deploy
# 应用全部 migration → _prisma_migrations 写入每条记录
```

### 2.2 已存在 DB(接管现有数据库)

如果数据库里已有 our-chat 历史表(`users`/`user_groups` 等),且**没有** `_prisma_migrations` 表:

```bash
# Step 1:假装 0_initial 已应用(不执行 SQL,只写记录)
pnpm db:baseline

# Step 2:之后正常 deploy(若有更新 migration)
pnpm db:migrate:deploy
```

这是 Prisma 官方推荐的 "Adding Prisma Migrate to an existing project" 流程:
<https://www.prisma.io/docs/orm/prisma-migrate/getting-started>

### 2.3 开发新 schema 变更

```bash
# Step 1:改 prisma/schema.prisma(加字段 / 改类型 / 加 model)

# Step 2:生成 migration 文件并应用到本地 dev 库
pnpm db:migrate:dev --name <短描述>
# 例:pnpm db:migrate:dev --name add_user_avatar_url

# Prisma 会:
# 1. 检测 schema 与 _prisma_migrations 的差异
# 2. 在 prisma/migrations/<ts>_<name>/ 生成 migration.sql
# 3. 应用到 dev 库
# 4. 重新生成 Prisma Client(@prisma/client)

# Step 3:commit migration 文件 + schema 改动
git add prisma/schema.prisma prisma/migrations/<新目录>
git commit -m "migration: <说明>"
```

## 3. 危险操作清单

下面这些操作**严禁直接做**,必须经 migration 经过 review:

| 操作 | 替代 |
|---|---|
| `ALTER TABLE` 改字段类型 | 改 `schema.prisma` → `pnpm db:migrate:dev` |
| `DROP TABLE` 删表 | 改 `schema.prisma` 删 model → `pnpm db:migrate:dev` |
| 手动 `CREATE INDEX` | 改 `schema.prisma` 加 `@@index` → `pnpm db:migrate:dev` |
| 改已应用 migration 的 SQL | **绝对禁止** ── Prisma 会因 checksum 不一致报错;改了就新建一个反向 migration |

## 4. 生产部署

```bash
# CI / 生产构建阶段:
pnpm db:generate     # 生成 Prisma Client
pnpm build           # tsc 编译

# 生产启动前(或应用启动逻辑自动跑):
pnpm db:migrate:deploy
# 只应用 pending,不创建新 migration,不需要 shadow database
```

server.ts 启动时已自动调 `applyPendingMigrations()`(包装 `prisma migrate deploy`)。如果 production 想关掉自动跑(由 CI 独立执行),改环境开关。

## 5. 状态查询

```bash
pnpm db:migrate:status
# 输出:
#   ✓ 0_initial (applied)
#   ✓ 20260606_add_avatar_url (applied)
#   ! 20260710_xxx (pending)
```

`status` 是只读的,适合 CI/CD 健康检查。

## 6. 回滚

Prisma migrate **不自带 down migration**(设计哲学是 forward-only)。回滚需要:

```bash
# 方法 A:写一个反向 migration
# 在 schema.prisma 里把改动撤掉
pnpm db:migrate:dev --name revert_xxx

# 方法 B(开发环境破坏性):reset 全部
pnpm db:migrate:reset
# 警告:删整库重建,数据全丢
```

## 7. 常见错误

### 7.1 `P3018: The migration could not be applied`

通常是 SQL 语法错误或者目标库已经有同名对象。

```bash
# 看具体出错 SQL
pnpm db:migrate:status
# 修 migration.sql(若 migration 还没在生产跑过)或新增反向 migration
```

### 7.2 `P3015: Could not find the migration file at ...`

migration 目录被改名 / 文件被删除。**绝不要删已应用的 migration 目录**(checksum 校验会失败)。

### 7.3 schema drift

`pnpm db:migrate:status` 报 "Drift detected: Your database schema is not in sync with your migration history"。

可能原因:
- 有人手动 `ALTER TABLE` 了
- 多人协作时另一个分支也加了 migration

解决:
```bash
# 看 drift 详情
prisma migrate diff --from-migrations prisma/migrations --to-config-datasource --script
# 手动 reconcile 或新加 migration 弥补差异
```

### 7.4 BigInt 序列化报错

`TypeError: Do not know how to serialize a BigInt` —— `src/database/bigint-json.ts` 的 polyfill 没被加载。

确认:
- `app.ts` 顶部第一行 `import './database/bigint-json.js';`
- `vitest.setup.ts` 也 import 了
- `prisma.ts` 顶部 import

## 8. 命名约定

- migration 目录名:`<timestamp>_<verb>_<object>`,如 `20260606_add_user_gender`
- 一个 migration 解决一件事(便于 review、回滚)
- migration 命名严格小写 snake_case,与 Prisma 生成的约定一致

## 9. 文件清单

```
prisma/
├── schema.prisma            schema 唯一来源
└── migrations/
    ├── 0_initial/           baseline:7 个 our-chat 表 + 3 个 OAuth 表
    │   └── migration.sql
    └── <后续>/
        └── migration.sql
prisma.config.ts             Prisma 7 配置入口(读 DATABASE_URL)
src/database/prisma.ts       PrismaClient 单例
src/database/bigint-json.ts  BigInt → number JSON polyfill
src/generated/prisma/        生成的 client(不进 git,见 .gitignore)
```
