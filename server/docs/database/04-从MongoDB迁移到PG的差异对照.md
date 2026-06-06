# 04 · 从 MongoDB 迁移到 PostgreSQL 的差异对照

> 实操配套手册:决策见 [03-PG统一替换MongoDB决策记录](./03-PG统一替换MongoDB决策记录.md)
> 本文给读者讲清楚 Mongoose 调用如何映射到 Prisma + PG,以及典型查询写法差异

## 1. Schema 映射

### 1.1 Message 集合 → `messages` 表

| Mongoose Schema 字段 | PG `messages` 列 | 备注 |
|---|---|---|
| `_id`(ObjectId) | `id BIGSERIAL` | 主键改 BigInt 自增,跟其他表对齐 |
| `conversationId String` | `conversation_id VARCHAR(100)` | + 外键 → `conversations(id)` |
| `senderId Number` | `sender_id BIGINT` | + 外键 → `users(id)` |
| `content String` | `content TEXT` | 同 |
| `type String 'text'` | `type VARCHAR(32) 'text'` | 同 |
| `status String 'sent'` | `status VARCHAR(32) 'sent'` | 同 |
| `mentions Array []` | `mentions JSONB DEFAULT '[]'` | **JSONB,可加 GIN 索引** |
| `isEdited Boolean false` | `is_edited BOOLEAN DEFAULT false` | 同 |
| `isDeleted Boolean false` | `is_deleted BOOLEAN DEFAULT false` | 同 |
| `extra Object {}` | `extra JSONB DEFAULT '{}'` | **JSONB 取代 Mixed** |
| `fileInfo Object {}` | `file_info JSONB DEFAULT '{}'` | 同 |
| `editHistory Array []` | `edit_history JSONB DEFAULT '[]'` | 同 |
| `timestamp Date now` | `timestamp TIMESTAMPTZ DEFAULT now()` | TIMESTAMPTZ 带时区,推荐 |
| `createdAt Date now` | `created_at TIMESTAMPTZ DEFAULT now()` | 同 |
| `updatedAt Date now` | `updated_at TIMESTAMPTZ + @updatedAt` | Prisma 自动维护 |

### 1.2 索引对照

| Mongoose | PG | 备注 |
|---|---|---|
| `schema.index({ conversationId: 1, timestamp: -1 })` | `@@index([conversationId, timestamp(sort: Desc)])` | **核心索引**,DISTINCT ON 命中 Index-Only Scan |
| `schema.index({ senderId: 1, timestamp: -1 })` | `@@index([senderId, timestamp(sort: Desc)])` | 取某用户消息流 |
| `schema.index({ 'replyTo.messageId': 1 })` | 暂未迁移 ── replyTo 字段在 Mongoose 是 schemaless,迁移时观察实际用法再加 |
| `schema.index({ mentions: 1 })` | `GIN(mentions)` 推荐(JSONB 数组查询) | 未来加 migration |

### 1.3 其他 3 个集合

`ConversationCache` / `UserConversationState` / `FileInfo` 全部按 schema 等价映射到 PG 表,见 `prisma/schema.prisma`。

## 2. 查询 API 对照

### 2.1 取会话全部消息(按时间升序)

**Mongoose**:
```ts
const messages = await Message.find({ conversationId: { $in: [conversationId] } })
  .sort({ timestamp: 1 })
  .lean();
```

**Prisma + PG**:
```ts
const messages = await prisma.message.findMany({
  where: { conversationId },
  orderBy: { timestamp: 'asc' },
});
```

返回值类型自动推导,字段 camelCase。

### 2.2 取每个会话的最后一条消息 ── 性能改善最显著的查询

**Mongoose** ── 4 阶段 aggregate pipeline:
```ts
const lastMessagesArray = await Message.aggregate([
  { $match: { conversationId: { $in: userConversationIds } } },
  { $sort: { timestamp: -1 } },
  { $group: { _id: '$conversationId', lastMessage: { $first: '$$ROOT' } } },
  { $replaceRoot: { newRoot: '$lastMessage' } },
]);
```

**Prisma + PG** ── 一句 `DISTINCT ON` 命中复合索引:
```ts
const rows = await prisma.$queryRaw<Array<Record<string, unknown> & { conversation_id: string }>>`
  SELECT DISTINCT ON (conversation_id) *
  FROM messages
  WHERE conversation_id = ANY(${userConversationIds}::text[])
  ORDER BY conversation_id, timestamp DESC
`;
```

**为什么快**:
- PG `DISTINCT ON` 在 `(conversation_id, timestamp DESC)` 索引上是 Skip Scan,只取每个 conversation_id 的第一行(即最新的)
- 不需要扫全部行再 group
- 实测数据集 100 万 / 1 万会话:Mongo 200-400ms → PG 10-30ms,**10-50×** 加速(详见 03 文档 §3.1)

### 2.3 发送消息 + 同时维护会话状态 ── ACID 事务收益

**Mongoose + 双库时代**:
```ts
// MongoDB
const savedMsg = await Message.create(msg);
// MySQL
for (const uid of [user1, user2]) {
  await mySql.execute(`INSERT INTO user_conversations ... ON DUPLICATE KEY ...`);
}
// ⚠ 中间崩了 → Mongo 写了消息但 MySQL 没建会话关系,需要手动补偿
```

**Prisma + PG 单事务**:
```ts
const savedMsg = await prisma.$transaction(async (tx) => {
  await tx.conversation.upsert({
    where: { id: msg.conversationId },
    create: { id: msg.conversationId, convType: 'single' },
    update: {},
  });
  const created = await tx.message.create({ data: { ... } });
  for (const uid of [user1, user2]) {
    await tx.userConversation.upsert({
      where: { userId_conversationId: { ... } },
      create: { ... },
      update: {},
    });
  }
  return created;
});
// 全部原子,中间任何一步失败 → 整体回滚
```

### 2.4 JSON 字段查询

**Mongoose**:
```ts
Message.find({ 'extra.platform': 'mobile' });
```

**Prisma + PG**:
```ts
prisma.message.findMany({
  where: { extra: { path: ['platform'], equals: 'mobile' } },
});
```

或直接 raw SQL:
```ts
prisma.$queryRaw<Message[]>`
  SELECT * FROM messages WHERE extra->>'platform' = 'mobile'
`;
```

加 GIN 索引后这种查询亚毫秒级。

### 2.5 Insert 单条 + 返回

**Mongoose**:
```ts
const savedMsg = await Message.create(msg);
console.log(savedMsg._id);    // ObjectId
```

**Prisma + PG**:
```ts
const savedMsg = await prisma.message.create({ data: { ... } });
console.log(savedMsg.id);     // BigInt
```

## 3. 类型安全对比

### 3.1 之前(Mongoose)

```ts
const msg = await Message.findOne({ ... });
// msg.foobar → 编译期不报错(Schema.Types.Mixed 默认 any)
// 直到 runtime 才发现字段不存在
```

### 3.2 之后(Prisma)

```ts
const msg = await prisma.message.findUnique({ where: { id } });
// msg.foobar → 编译期立即报错
// 字段名、类型、可空性全有 IDE 提示
```

类型安全是 Prisma 接管最直接的工程收益,比性能收益更日常。

## 4. 已删除的依赖

```diff
- mongoose: 8.16.1
- mysql2: 3.14.1(上次重构已删)
+ @prisma/client: 7.8.0(已有)
+ prisma: 7.8.0(已有)
```

依赖瘦身约 80MB(mongoose + 其子依赖)。

## 5. 仍保留的 4 个 Mongoose schemaless 字段(用 JSONB 承接)

| 字段 | 原 Mongoose 定义 | PG JSONB 默认值 | 备注 |
|---|---|---|---|
| `mentions` | `Array []` | `'[]'` | 提及的用户 ID 数组 |
| `extra` | `Object {}` | `'{}'` | 业务扩展字段 |
| `fileInfo` | `Object {}` | `'{}'` | 文件消息附加信息 |
| `editHistory` | `Array []` | `'[]'` | 编辑历史 |

**这是 PG + JSONB 替代 Mongo 的核心**:稳定字段进列,灵活字段进 JSONB。**两者并行 + 都有索引能力 + 都有事务**。

## 6. 业务行为变化清单

| 路由 / 函数 | Mongoose 时代 | PG 时代 | 行为差异 |
|---|---|---|---|
| `GET /user/messages` | `Message.find().sort().lean()` | `prisma.message.findMany()` | 无,返回字段一致 |
| `GET /user/lastMessages` | aggregate 4 阶段 | DISTINCT ON raw SQL | 字段名 snake_case → camelCase 边界处理(详见代码注释) |
| `socket.on('sendMessage')` | `Message.create` + 分散的 SQL upsert | `prisma.$transaction` 原子 | **原子性提升**,中途异常自动回滚 |
| `server.ts startup` | `await connectDb()` connect Mongo | (移除) | 一个进程少一种连接 |

## 7. 字段命名边界处理

PG 列名 snake_case(`conversation_id`),Prisma model camelCase(`conversationId`),Prisma Client 自动 map。

**但 raw SQL 拿到的字段是 snake_case**,需要在边界处理:

```ts
const rows = await prisma.$queryRaw<{ conversation_id: string; content: string }[]>`
  SELECT DISTINCT ON (conversation_id) * FROM messages ...
`;
// rows[0].conversation_id 而非 .conversationId
```

`chat.ts` 的 `/lastMessages` 处理已就位。

## 8. 测试 mock 变化

| Mongoose 时代 mock | Prisma 时代 mock |
|---|---|
| `vi.mock('mongoose')` | `vi.mock('../../src/database/prisma.js')` |
| `Message.find.mockResolvedValue([])` | `prisma.message.findMany.mockResolvedValue([])` |
| `Message.aggregate.mockResolvedValue([])` | `prisma.$queryRaw.mockResolvedValue([])` |

测试范围本次重构未引入新 spec(`chat.ts` / `socket.ts` 没有现有 spec),保留作 follow-up。

## 9. 生产迁移(本次不实现)

dev 环境直接 reset 即可:

```bash
DROP DATABASE our_chat;
CREATE DATABASE our_chat;
pnpm db:migrate:deploy
```

production 需要 ETL:

```bash
# 1. mongoexport
mongoexport --uri ... --collection messages --out messages.json --jsonArray

# 2. PG 导入(Node 脚本,把 ObjectId 转 BigInt,字段名 snake_case)
node scripts/etl-mongo-to-pg.ts --input messages.json

# 3. 校验 row count
psql -c "SELECT COUNT(*) FROM messages;"
mongosh --eval "db.messages.countDocuments()"
```

(ETL 脚本不在本次范围,作为生产部署的独立工作项)

## 10. 回滚

本重构不可热回滚(MongoDB 数据已不再写入)。生产回滚需要:

1. `git revert <commit>`
2. ETL 反向(PG → Mongo)
3. 启动旧代码

**所以**生产部署前**必须**在 staging 跑完整流量回放,确认 PG 性能 + 行为符合预期。
