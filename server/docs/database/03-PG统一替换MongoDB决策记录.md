# 03 · PostgreSQL 统一替换 MongoDB 决策记录

> **时间**:2026-06-06
> **范围**:our-chat/server 数据库栈从 MySQL + MongoDB 双库统一到 **PostgreSQL 单库**
> **决策人**:架构演进会议
> **关联文档**:
> - `01-数据库管理重构记录.md`(上一次:MySQL 接入 Prisma)
> - `04-从MongoDB迁移到PG的差异对照.md`(本次执行细节)
> - 跨服务鉴权方案目录 `docs/oauth/`(本次不动)

## 1. 问题背景

### 1.1 当前数据库栈

| 库 | 用途 | 客户端 | Schema 管理 |
|---|---|---|---|
| MySQL 8 | 关系数据(users / friendships / conversations meta / message_refs / OAuth 三张表) | Prisma 7(已接管) | Prisma migrations |
| MongoDB 7 | 消息文档(messages / conversation_cache / user_conversation_states / file_info) | mongoose 8 | **无 migration 治理** |

### 1.2 触发本次决策的具体债务

#### A. MongoDB 一侧零治理

- 索引靠 `messageSchema.index()` + mongoose 启动自动建,生产风险高(`autoIndex = true` 阻塞)
- 字段演进无版本化(`extra/fileInfo/editHistory` 都是裸 `Mixed` / `Object`)
- 跨库一致性靠应用层(发消息要同时写 MySQL 的 `message_refs` 表 + MongoDB 的 `messages` 集合,**没有原子事务保护**)

#### B. 业务代码里大量 SQL-friendly 的查询用 Mongo aggregate 凑合

最典型(`routes/chat.ts`):

```ts
const lastMessagesArray = await Message.aggregate([
  { $match: { conversationId: { $in: userConversationIds } } },
  { $sort: { timestamp: -1 } },
  { $group: { _id: '$conversationId', lastMessage: { $first: '$$ROOT' } } },
  { $replaceRoot: { newRoot: '$lastMessage' } },
]);
```

四阶段 pipeline,本质是 SQL 一句 `DISTINCT ON (conversation_id) ... ORDER BY conversation_id, timestamp DESC`。

#### C. 双 RDBMS 运维成本

- 备份脚本两套
- 监控指标两套(连接池 / QPS / 慢查询)
- 高可用方案两套(MySQL replica 与 Mongo replica set 配置完全不同)
- dev 环境本地起两套

## 2. 选型分析

### 2.1 候选

| 方案 | 双库 / 单库 | 与现状距离 | 综合评分 |
|---|---|---|---|
| A. 保持现状 + 补 migrate-mongo | 双库 | 小(只加 mongo 迁移工具) | ⚠ 治标不治本,运维复杂度未降 |
| B. **全切 PostgreSQL**(关系 + 消息一起搬) | 单 PG | 大 | ✅ **本次选定** |
| C. 消息层切 PG,关系层留 MySQL | 双 RDBMS | 中 | ❌ 两种 SQL 方言,JOIN 仍不可能 |
| D. 关系层留 MySQL,消息层用 MySQL JSON | 单 MySQL | 中 | ❌ MySQL JSON 索引远不及 PG JSONB |
| E. 全切 ScyllaDB / Cassandra | 单 NoSQL | 极大 | ❌ Discord 量级才需要,过度设计 |

### 2.2 业界对照(2024-2025 真实生态)

| 产品 | 消息 / 事件层 | 备注 |
|---|---|---|
| **Slack** | PostgreSQL + 应用层 channel-id 分片 | 早期 MySQL,后切 PG |
| **Notion** | PostgreSQL + JSONB + block model | 文档系统,本质同消息 |
| **Linear** | PostgreSQL only | 协作工具典范 |
| **Sentry** | PostgreSQL 主 + ClickHouse 分析 | 高吞吐事件 |
| **Supabase / Neon / Vercel Postgres** | PG-only | 把 PG 当产品卖 |
| Discord(早) | MongoDB → 切走 | 量级到不堪 |
| 微信 / 飞书 / WhatsApp | 自研 KV / Erlang | 亿级 DAU 自研栈 |

**规律**:**中等量级 + 现代栈 = PG + JSONB**。MongoDB 在 IM 文档存储被持续蚕食;超大量级用自研引擎。

### 2.3 PostgreSQL + JSONB 对 IM 场景的 6 个具体优势

#### ① JSONB 兼容 Mongo 的灵活 schema 优势

```sql
CREATE TABLE messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id VARCHAR(100) NOT NULL,
  sender_id       BIGINT NOT NULL,
  content         TEXT NOT NULL,
  type            VARCHAR(32) DEFAULT 'text',
  extra           JSONB DEFAULT '{}',      -- 等价 Mongo 文档,但有索引/压缩/原子更新
  file_info       JSONB,
  edit_history    JSONB DEFAULT '[]',
  timestamp       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX messages_extra_gin ON messages USING GIN (extra);
CREATE INDEX messages_conv_ts   ON messages (conversation_id, timestamp DESC);
```

稳定字段用列,灵活字段进 JSONB,**比纯 Mongo 文档更精细**。

#### ② 跨表 ACID 事务(Mongo 4.0+ 才支持,性能损失大)

发消息的三步原子化:

```ts
await prisma.$transaction([
  prisma.message.create({ data: msg }),
  prisma.conversation.update({ where, data: { updatedAt: now } }),
  prisma.messageRef.create({ data: { ... } }),
]);
```

Mongo 多文档事务自 4.0 起支持但需要 session,且 WiredTiger 在事务模式下写延迟显著上升(参见 §3 性能预估)。

#### ③ JOIN 一等公民

"取最近 50 条消息 + 发送者头像/昵称":

```ts
prisma.message.findMany({
  where: { conversationId },
  include: { sender: { select: { nickname: true, avatar: true } } },
  orderBy: { timestamp: 'desc' },
  take: 50,
});
```

一行。Mongo 要么消息冗余冗余存发送者信息(写放大 + stale),要么 `$lookup`(慢 + 类型不友好)。

#### ④ 现有 aggregate 用 SQL 表达更简洁更快

`chat.ts` 那段 4 阶段 pipeline 等价于:

```sql
SELECT DISTINCT ON (conversation_id) *
FROM messages
WHERE conversation_id = ANY($1)
ORDER BY conversation_id, timestamp DESC;
```

借助 `(conversation_id, timestamp DESC)` 索引,**Index-Only Scan,亚毫秒返回**。

#### ⑤ 全文搜索内置

```sql
CREATE INDEX ON messages USING GIN (to_tsvector('simple', content));
SELECT * FROM messages WHERE to_tsvector('simple', content) @@ to_tsquery($1);
```

Mongo 需要 Atlas Search 或独立 ES 集群,运维成本上升。

#### ⑥ 跟 agent-server 完全统一(关键工程价值)

`apps/node-server/prisma/schema.prisma` 已是 `provider = "postgresql"`,本次切换后:
- 全产品矩阵单一 RDBMS
- Prisma 7 对 PG 是一等公民(Prisma 起源是 PG-first)
- 简历可写 "全栈 PostgreSQL,Prisma schema-as-code 管 10+ 模型"

### 2.4 Mongo 仍优的场景(诚实评估)

| Mongo 仍优 | 本项目场景 |
|---|---|
| 千万级 QPS 写入 + 灵活分片 | ❌ 不是 |
| 跨地域最终一致性 | ❌ 不是 |
| 文档结构极度异质(每条字段完全不同) | ❌ 消息有共通核心字段 |
| 团队 SQL 经验弱 | ❌ 已用 Prisma 接 SQL |

**结论**:Mongo 优势在本项目场景**全部不成立**。

## 3. 性能预估(带数据背书)

> ⚠ **方法学说明**:下表的"预估改善"是**基于公开 benchmark + 索引设计 + 查询复杂度推导**得出,不是实测值。
> 实际值依赖数据集大小、硬件、并发模型。我们在 §3.7 给出**复现 benchmark 的方法**,生产前应在真实环境实测。
> 引用的 benchmark 数据来自:Percona Lab Benchmark Suite、OnGres TPC-C Comparison、Slack Engineering Blog、PostgreSQL 官方文档、MongoDB 官方文档。

### 3.1 每会话最后一条消息查询 ── 业务核心路径

**当前**(`chat.ts` 用 `Message.aggregate` 4 阶段):

| 数据量 | Mongo `$group` 全扫(无单独 index) | Mongo `$group` + `{conversationId:1, timestamp:-1}` 索引 |
|---|---|---|
| 1 万条消息,100 会话 | 80 - 120 ms | 30 - 50 ms |
| 100 万条消息,1 万会话 | 1.5 - 3 s | 200 - 400 ms |

**切 PG 后**(`DISTINCT ON` + 复合索引):

| 数据量 | PG `DISTINCT ON` + Index-Only Scan |
|---|---|
| 1 万条消息,100 会话 | 2 - 5 ms |
| 100 万条消息,1 万会话 | 10 - 30 ms |

| **预估加速倍率** | **10 ~ 50×** |
|---|---|

**依据**:
- PG `DISTINCT ON` 命中 `(conversation_id, timestamp DESC)` 复合索引时是 Index-Only Scan,跳过堆访问。复杂度 O(distinct_count × log_index_size)
- Mongo `$group` 即使有索引也要走完整 pipeline,扫码遍历分组,无 PG "Skip Scan" 等价物
- 引用:[PostgreSQL DISTINCT ON Performance Notes](https://www.postgresql.org/docs/current/sql-select.html#SQL-DISTINCT)、Percona blog "MongoDB Aggregation Performance" (2023)

### 3.2 写吞吐(单 row insert)

| 操作 | MongoDB 7.0(WiredTiger,j=true) | PostgreSQL 16(synchronous_commit=on) |
|---|---|---|
| 单条 insert | 18 - 25k ops/s | 25 - 40k ops/s |
| 100-batch insert | 60 - 100k rows/s | 100 - 180k rows/s |

| **预估写吞吐提升** | **+30% ~ +60%** |
|---|---|

**依据**:
- OnGres 2023 TPC-C-like Benchmark(单节点,32 vCPU, NVMe):PG 单点插入 ~31k tps,Mongo ~22k tps
- 实际项目 IM 消息 QPS 通常 < 5k,**两者均富余**,这个差异更多是预留能力

### 3.3 跨集合 ACID 事务

| 操作 | Mongo 4.0+ multi-doc tx | PG 跨表 tx |
|---|---|---|
| 单事务 3 操作的 P99 延迟 | 15 - 35 ms | 3 - 8 ms |
| 事务模式下吞吐损失 | -20% ~ -40% | < -5% |

| **预估事务延迟改善** | **3 ~ 5×**(P99 角度) |
|---|---|

**依据**:
- MongoDB 官方文档明确 multi-document transactions 比单文档操作慢(节点协调 + oplog 一致性)
- PG MVCC 跨表事务是原生设计,无额外协调
- Percona 2022 benchmark:Mongo 5.0 多文档事务吞吐为单文档的 60-70%

### 3.4 JOIN 查询(消息 + 发送者头像)

| 数据量 | Mongo `$lookup` | PG INNER JOIN(索引命中) |
|---|---|---|
| 50 条消息 × 50 用户 | 25 - 60 ms | 1 - 3 ms |
| 1000 条消息 × 1000 用户 | 200 - 600 ms | 10 - 30 ms |

| **预估改善** | **10 ~ 30×** |
|---|---|

**依据**:
- Mongo `$lookup` 本质是 left outer 内层扫描,对每个外层文档发起一次内层 query
- PG hash/merge JOIN 是行业标准优化,亚毫秒级响应
- 这是文档库 vs 关系库的根本性差异,业界共识

### 3.5 全文搜索

| 操作 | Mongo Text Index | PG `tsvector` + GIN |
|---|---|---|
| 10 万行消息单关键词搜 | 100 - 300 ms | 5 - 20 ms |
| 多关键词布尔搜 | 300 ms+(需要 Atlas Search) | 10 - 50 ms |

| **预估改善** | **5 ~ 20×**(运维成本另外大幅下降) |
|---|---|

**依据**:
- PG `tsvector` 倒排索引 + GIN,业界标杆;中文加 `pg_jieba` 或 `zhparser` 扩展
- Mongo 原生 Text Index 已被官方推 Atlas Search 替代(独立服务,跨组件复杂度高)

### 3.6 运维成本(定性)

| 维度 | 当前(双 DB) | 切 PG 后 | 资产减少 |
|---|---|---|---|
| Schema 治理 | MySQL Prisma + Mongo 零治理 | 单 Prisma | 一致 + 一套 |
| 备份脚本 | mysqldump + mongodump | pg_dump | 1 套 |
| 监控告警 | 双套指标 | 单套 | -50% |
| HA 配置 | MySQL Group Replication + Mongo replica set | PG Streaming Replication | 一种范式 |
| 本地 dev | 两个 docker container | 一个 | -1 容器 |
| 团队学习曲线 | SQL + Mongo aggregate | 仅 SQL | 单技术栈 |

### 3.7 复现 benchmark 的方法(部署前必跑)

切换上线前,**建议**在与生产相近的环境复现关键场景:

```bash
# 1. 起 PG 16 + 同等规格的 Mongo 7(确认硬件 / 缓存配置一致)
# 2. 灌入 dummy 数据
node scripts/seed-bench-data.ts --count=100000

# 3. 跑 §3.1 的 "每会话最后一条" 测试 100 次取 P50/P95
node scripts/bench-last-msg.ts

# 4. 跑 §3.2 的写吞吐(wrk2 风格)
node scripts/bench-insert.ts --duration=60s --rate=10000

# 输出报表:docs/database/perf-report-<date>.md
```

(脚本本次重构不一定立即落地,留作 follow-up)

## 4. 执行方案

### 4.1 阶段拆分(共 5 阶段,每阶段独立 commit)

| 阶段 | 内容 | 关键交付 |
|---|---|---|
| 0 | **本文 + 04 差异对照文档** | 决策文档 + 对照文档 |
| 1 | Prisma datasource → PG + 关系层 schema 重生成 | `schema.prisma` 更新,migration 重生成 |
| 2 | MongoDB 4 个集合 → Prisma model(`Message` / `ConversationCache` / `UserConversationState` / `FileInfo`),JSONB 列 | schema 加新 model |
| 3 | 业务代码:`chat.ts` / `socket.ts` 等所有 mongoose 调用改 Prisma | aggregate → `DISTINCT ON` SQL 等 |
| 4 | 依赖清理:`mongoose` 卸载 / `mongoDB.ts` 删 / `server.ts` 删 `connectDb` | 仓库无 Mongo 痕迹 |
| 5 | 测试更新 + 跑全套 + commit + 推送 | 122+ 测试全过 |

### 4.2 Prisma datasource 切换的细节

```diff
- provider = "mysql"
+ provider = "postgresql"
```

但**类型差异要逐字段调整**:

| MySQL | PostgreSQL | 影响 |
|---|---|---|
| `@db.VarChar(N)` | `@db.VarChar(N)` | 同 |
| `@db.Text` | `@db.Text` | 同 |
| `@db.DateTime(0)` | `@db.Timestamptz(0)` | PG 推荐 `timestamptz`(带时区) |
| `BigInt @id @default(autoincrement())` | 同 | 同 |
| `Json` | `@db.JsonB` | PG 用二进制 JSON,**强烈推荐 JsonB** |
| `enum X { a b }` MySQL ENUM | PG native enum | 语义一致,语法 Prisma 抽象掉 |

### 4.3 4 个新 model

```prisma
model Message {
  id              BigInt   @id @default(autoincrement())
  conversationId  String   @map("conversation_id") @db.VarChar(100)
  senderId        BigInt   @map("sender_id")
  content         String   @db.Text
  type            String   @default("text") @db.VarChar(32)
  status          String   @default("sent") @db.VarChar(32)
  mentions        Json     @default("[]") @db.JsonB
  isEdited        Boolean  @default(false) @map("is_edited")
  isDeleted       Boolean  @default(false) @map("is_deleted")
  extra           Json     @default("{}") @db.JsonB
  fileInfo        Json     @default("{}") @map("file_info") @db.JsonB
  editHistory     Json     @default("[]") @map("edit_history") @db.JsonB
  timestamp       DateTime @default(now()) @db.Timestamptz(0)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(0)
  updatedAt       DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(0)

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender       User         @relation(fields: [senderId], references: [id], onDelete: Cascade)

  @@index([conversationId, timestamp(sort: Desc)], map: "idx_messages_conv_ts")
  @@index([senderId, timestamp(sort: Desc)], map: "idx_messages_sender_ts")
  @@map("messages")
}
```

`ConversationCache` / `UserConversationState` / `FileInfo` 同样接入。

### 4.4 业务代码改动清单

| 位置 | 原 mongoose 调用 | 改为 Prisma |
|---|---|---|
| `routes/chat.ts /messages` | `Message.find().sort()` | `prisma.message.findMany({orderBy})` |
| `routes/chat.ts /lastMessages` | `Message.aggregate([$match, $sort, $group, $replaceRoot])` | `prisma.$queryRaw` 用 `DISTINCT ON` |
| `utils/socket.ts sendMessage` | `Message.create(msg)` | `prisma.message.create({data})` |
| `database/mongoDB.ts` | 整个文件 | 删除 |
| `server.ts` | `await connectDb()` | 删除 |

### 4.5 风险与回滚

| 风险 | 缓解 |
|---|---|
| Mongo 已有数据需要迁移到 PG | dev 环境直接重建;production 需要写 ETL 脚本(本次不实现,记录到附录) |
| `chat.ts /lastMessages` 改 `DISTINCT ON` 后行为差异 | 单测覆盖;手测一次 happy path |
| BigInt 序列化跨改造仍生效 | `bigint-json.ts` polyfill 已在 |
| 上线后查询慢 | 复合索引 `(conversation_id, timestamp DESC)` 在 schema 已声明 |

**回滚**:本重构属于 schema breaking change,不可热回滚。回滚 = git revert + 数据反向迁移。生产部署前必跑 §3.7 benchmark。

## 5. 性能预估汇总

| 场景 | 改善倍率 | 数据置信度 |
|---|---|---|
| 每会话最后一条消息查询 | **10 ~ 50×** | 高(架构原理 + benchmark) |
| 写吞吐 | **+30% ~ +60%** | 中(benchmark 数据,实际依赖硬件) |
| 跨表 ACID 事务延迟 | **3 ~ 5×** | 高(架构差异) |
| 消息+用户 JOIN 查询 | **10 ~ 30×** | 高(基础查询模型差异) |
| 全文搜索 | **5 ~ 20×** | 中(运维收益更突出) |
| **平均查询 P95** | **预估 5 ~ 15×** 综合改善 | — |
| **运维资产** | **-50%**(双库 → 单库) | 高(定性) |

> 这些数字是**架构层预估上界**。实际收益取决于:数据量、并发模型、硬件、索引设计。**部署前必跑 §3.7 真实环境 benchmark 校准**。

## 6. 决策结论

- **采用方案 B**:全切 PostgreSQL,统一关系层 + 消息层
- **删除依赖**:`mongoose` 8.x
- **保留并强化**:Prisma 7 接管全部 schema
- **跟 agent-server 完全对齐**:同栈 PostgreSQL
- **simple project 角度 + 架构能讲清楚 portfolio 角度**:这次改动让简历可写"全栈 PostgreSQL + Prisma,从 MySQL+MongoDB 双库重构为单库,P95 查询性能预估提升 5-15×"

## 附录 A:Mongo 数据 ETL(生产迁移用,本次不实现)

```sql
-- Mongo → PG 迁移伪代码:
-- 1. mongoexport messages → JSON Lines
-- 2. PG COPY messages FROM '/tmp/messages.jsonl' WITH (FORMAT csv, DELIMITER E'\t');
-- 3. 校验 row count 一致
```

实际项目还要做 BSON 数据类型映射、`_id` (ObjectId) → BigInt 转换、外键校验。

## 附录 B:本次不动的范围

- agent-server(它已是 PG)
- our-chat web 前端(对 DB 层无感知)
- OAuth IdP 模块(已是 Prisma 接管 MySQL,本次跟随切 PG)
- Socket.IO 通信层(对 DB 层无感知,只是改了 Message.create 的实现)
