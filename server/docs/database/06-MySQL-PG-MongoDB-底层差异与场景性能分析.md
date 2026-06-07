# 06 · MySQL / PostgreSQL / MongoDB 底层设计差异与业务场景性能分析

> 本文从存储引擎、索引、MVCC、查询优化、复制等**底层机制**出发,推导 8 个业务场景下三库的性能差异。**不是 feature 对比,而是从原理到现象的因果链**。

---

## 0. 三库一句话定位(贯穿全文)

| 库 | 一句话定位 | 核心抽象 |
|---|---|---|
| **MySQL (InnoDB)** | 行存关系库,**聚簇索引**,事务靠 undo log 链 | 表 = 主键 B+tree(叶子就是数据行) |
| **PostgreSQL** | 对象-关系库,**heap + 独立索引**,MVCC 旧版本就地保留 | 表 = 无序 heap file + 多种独立索引 |
| **MongoDB (WiredTiger)** | 文档库,B-tree 索引,集合 = BSON 文档堆 | 集合 = `_id` 索引 + 文档堆 + 二级索引 |

三句话决定了后面所有差异:**数据在磁盘上怎么组织,索引怎么找到数据,旧版本怎么处理**。

---

## 1. 存储引擎层 ── 决定 90% 性能特征

### 1.1 InnoDB(MySQL):聚簇索引,数据就是索引

```
表数据布局(物理):
       ┌──────────────────────────────┐
       │   主键 B+tree                 │
       │   ┌──┐   ┌──┐                │
       │   │A │…  │M │                │
       │   └─┬┘   └─┬┘                │
       │     │       │                 │
       │   ┌─▼──┐ ┌─▼──┐               │
       │   │叶 1│ │叶 2│ ← 叶子节点就是完整数据行
       │   │行A │ │行M │   按主键顺序物理排列
       │   │行B │ │行N │
       │   └────┘ └────┘
       └──────────────────────────────┘

       二级索引(如 idx_email):
       ┌──────────────────┐
       │  B+tree on email │
       │      ↓           │
       │   叶子存:        │
       │   email → 主键   │ ← 不存数据指针,而是存主键值
       └──────────────────┘
```

#### 关键推论

- **主键查询极快**:一次 B+tree 索引扫描直达数据
- **二级索引查询要走两次 B+tree**:先 email → 主键,再主键 → 数据(称为 "回表")
- **覆盖索引(covering index)优化**:如果 SELECT 的字段都在二级索引里,不回表
- **主键应该单调**:UUID v4 做主键会让 B+tree 频繁页分裂,性能崩;改 UUID v7 / Snowflake / auto_increment 才正常
- **表数据按主键物理排序**:范围扫主键 = 顺序读磁盘,极快

#### redo log + undo log

- **redo log**:WAL,记录"页改了什么",崩溃恢复用。**预写式日志,先写日志再写数据页**
- **undo log**:记录每行的"旧版本",用于事务回滚 + MVCC 读旧版本
- 一行的多个历史版本经 undo log 形成链:`v3 → v2 → v1`,读旧 snapshot 沿链找

### 1.2 PostgreSQL:Heap + 独立索引

```
表数据布局:
       ┌──────────────────────────────┐
       │   heap file(无序追加)      │
       │   ┌────┐┌────┐┌────┐         │
       │   │行 1││行 2││行 3│ …       │ ← ctid(页号 + 偏移)
       │   └────┘└────┘└────┘         │   定位每行,无序
       └──────────────────────────────┘

       主键索引(独立的 B-tree):
       ┌──────────────────┐
       │  B-tree on id    │
       │      ↓           │
       │   叶子存:        │
       │   id → ctid      │ ← 指向 heap 物理位置
       └──────────────────┘

       email 索引(同样独立):
       ┌──────────────────┐
       │  B-tree on email │
       │      ↓           │
       │   email → ctid   │
       └──────────────────┘
```

#### 关键推论

- **所有索引地位平等**(没有"聚簇"特殊地位)── 主键查询和二级索引查询性能相似
- **数据物理无序**:范围扫主键不是顺序读
- **每次 UPDATE 创建新行,旧行打 dead 标记**(MVCC,见 §3)
- **HOT (Heap-Only Tuple) 优化**:如果 UPDATE 的字段没索引,且新行能放在原 heap 页里,索引不需要更新,旧 ctid 链到新 ctid

#### WAL + Shared Buffers + 检查点

- **WAL** 同 InnoDB 的 redo log,预写日志
- **Shared Buffers** 是 PG 的缓冲池(InnoDB 是 Buffer Pool)
- **Checkpoint** 把 dirty page 刷盘,WAL 才能被回收
- **重要差异**:PG 是**双缓冲**(Shared Buffers + OS Page Cache),InnoDB 是**单缓冲**(只信任自己的 Buffer Pool,绕开 OS Cache 用 O_DIRECT)。所以 InnoDB 的 Buffer Pool 通常配大(70-80% RAM),PG 的 Shared Buffers 通常配中等(25%),其余靠 OS Cache

### 1.3 WiredTiger(MongoDB):B-tree(非 B+tree)+ 文档原生

```
集合布局:
       ┌──────────────────────────────┐
       │   _id 索引(B-tree)          │
       │                              │
       │   B-tree 叶子节点直接存 BSON │ ← 数据 + 索引耦合,类似 InnoDB 聚簇
       │   按 _id 顺序组织            │
       └──────────────────────────────┘

       二级索引:
       ┌──────────────────────────┐
       │  B-tree on field         │
       │  叶子存:field → RecordId │ ← RecordId 指向主存储位置
       └──────────────────────────┘
```

#### 关键差异

- **WiredTiger 实际用 B-tree,不是 B+tree**(B-tree 内部节点也存数据,B+tree 只在叶子)。区别在范围扫描:B+tree 叶子有链表指针顺序扫,B-tree 没有,要回到上层。**对应 MongoDB 范围查询略逊于 InnoDB 顺序读**
- **默认 Snappy 压缩**:每个 chunk(块)独立压缩,读取时按块解压。压缩率高的场景(JSON 字段重复 key)有显著存储节省
- **Checkpoint + Journal**:Checkpoint 默认 60 秒,Journal 是 WAL
- **MMAPv1 已废弃**(MongoDB 4.0),不再讨论

---

## 2. 索引实现 ── 决定查询的灵活性

### 2.1 B+tree / B-tree(三库都有)

通用结构,前面已讲。重点差异:

| 库 | 主索引 | 二级索引指向 |
|---|---|---|
| MySQL InnoDB | 聚簇 B+tree | 主键值 |
| PostgreSQL | heap | ctid(物理位置) |
| MongoDB WT | B-tree(数据 + 索引耦合) | RecordId |

### 2.2 PostgreSQL 独特索引(MySQL / Mongo 没有或弱)

#### GIN(Generalized Inverted Index)

倒排索引。**为多值字段设计**:数组、tsvector(全文)、JSONB。

```sql
CREATE INDEX ON messages USING GIN (mentions);          -- 数组
CREATE INDEX ON messages USING GIN (extra);             -- JSONB(整个文档)
CREATE INDEX ON messages USING GIN (extra jsonb_path_ops);  -- JSONB(只索引路径)
CREATE INDEX ON articles USING GIN (to_tsvector('english', body));  -- 全文
```

**底层**:对每个值/词建一个 posting list(包含该值的所有行的 ctid)。查询 `extra @> '{"k":"v"}'` 时,先在 GIN 查"包含 k=v 的 posting list",再交集 / 取并集。

MySQL 5.7+ 也有 JSON 列,但**没有等价 GIN**,只能给 generated column 加 B-tree,只索引特定路径,不能对未知路径高效查询。

#### GiST(Generalized Search Tree)

通用树索引框架。**为有"层次包含"语义的数据设计**:几何(点 / 矩形 / 多边形)、范围类型、ip 网段。

```sql
CREATE INDEX ON locations USING GiST (geo_point);       -- 几何点
CREATE INDEX ON reservations USING GiST (during);       -- 时间范围
```

**底层**:支持自定义"包含"操作符。索引节点存"该子树所有值的最小包围盒",查询时按包围盒剪枝。

MySQL 有 SPATIAL 索引但仅限几何;Mongo 有 2dsphere 仅限地理。

#### BRIN(Block Range Index)

块范围索引。**为大表 + 物理顺序天然相关的列设计**(典型:时间戳)。

```sql
CREATE INDEX ON metrics USING BRIN (timestamp);
```

**底层**:每 128 个 heap 页存一条"该页范围的 min / max 时间戳"。索引大小是 B-tree 的 **1/1000**,但查询时按范围剪枝,只扫相关页。

适用场景:时序数据,新行总是追加到末尾,timestamp 物理顺序基本递增。

#### Hash

仅等值查询,B-tree 的子集,PG 12+ 加 WAL 后可用。

MySQL InnoDB 有"自适应哈希索引",但是引擎内部自动维护,用户不可控。

### 2.3 MongoDB 索引

- **单字段 / 复合 / 多键**(数组字段每个值都索引一遍)/ **文本** / **2dsphere**(地理)/ **哈希**(分片用)/ **通配符**(`{ "extra.$**": 1 }`,索引所有路径)

**通配符索引**对应"灵活 schema"场景,可索引未知字段路径。**PG JSONB GIN 是更精细的等价物**。

---

## 3. MVCC 与事务模型 ── 决定并发读写性能

### 3.1 MVCC 的核心思想

读不阻塞写,写不阻塞读。每个事务看到一个**一致快照**,旧版本不会被即时覆盖。

三库都用 MVCC,但**实现机制完全不同**。

### 3.2 InnoDB MVCC:undo log 链

每行有隐藏字段:
- `DB_TRX_ID`:最后修改它的事务 ID
- `DB_ROLL_PTR`:指向 undo log 中的"上一版本"

```
表中实际只存最新行:
    [行: id=1, value="C", trx=300, roll_ptr → undo]
                                         ↓
    undo log:
        v3(trx=300) → v2(trx=200) → v1(trx=100)
```

读旧 snapshot 时,沿 `DB_ROLL_PTR` 链找符合可见性的版本。

#### 关键特点

- **就地更新**:UPDATE 直接改行,旧版本进 undo log
- **undo log 由 purge thread 异步清理**(没被任何活跃事务用到时)
- **行膨胀小**:大部分时候表本身只有最新版本

### 3.3 PostgreSQL MVCC:旧版本就地保留

每行存:
- `xmin`:创建该行的事务 ID
- `xmax`:删除/更新它的事务 ID(没被改时是 0)

```
UPDATE 一行时:
    旧行: [xmin=100, xmax=300, value="B"]    ← 标记"在 trx 300 被删"
    新行: [xmin=300, xmax=0,   value="C"]    ← 追加到 heap

读 snapshot at trx=250 看到:
    旧行(因为 250 在 xmin=100 之后,在 xmax=300 之前)
读 snapshot at trx=400 看到:
    新行
```

#### 关键特点

- **不就地更新**:每次 UPDATE 都创建新行,旧行变 dead tuple
- **没有 undo log**:历史版本直接在 heap 里,占空间
- **VACUUM 清死元组**:周期性扫表,把 xmax 已小于"最旧活跃事务 ID"的行物理删除
- **HOT 优化**:如果 UPDATE 不改任何被索引的字段,且新行能放在原 heap 页,索引指针不变,新行 ctid 链到旧 ctid。**避免索引膨胀**

#### 后果(著名的 "PG 表膨胀"问题)

频繁 UPDATE 的表:dead tuples 堆积 → 表物理变大(即使 SELECT COUNT(*) 显示行数不变)→ 全表扫变慢 → 需要 VACUUM / autovacuum 持续运行。

**典型坑**:不当心关掉 autovacuum,表膨胀到 100GB,实际有效数据只有 1GB。

### 3.4 MongoDB(WiredTiger)MVCC

WiredTiger 类似 PG 风格:行级 MVCC,旧版本保留,后台 garbage collection。

#### 事务支持的演进

- **单文档操作**:始终原子(WiredTiger 行级事务)
- **多文档事务(4.0+)**:跨集合 / 跨数据库事务,**底层用 oplog + read concern + write concern 协调**
- **分片集群事务**:慢得多(跨分片两阶段提交),官方文档明确说性能损失

#### 关键限制

- 默认事务 60 秒超时
- Oplog 不能存"过大的事务"(老版本约 16MB,新版本可调)
- **MongoDB 的事务跟 PG / MySQL 不是一个量级**

### 3.5 隔离级别差异

| 隔离级别 | InnoDB 默认 | PG 默认 | Mongo |
|---|---|---|---|
| Read Uncommitted | 支持 | 支持 | — |
| Read Committed | 支持 | **默认** | 默认 |
| Repeatable Read | **默认**(实际类 Snapshot Isolation,通过 next-key lock 阻止 phantom) | 支持(真 SI) | snapshot |
| Serializable | 支持(锁实现) | **SSI**(Serializable Snapshot Isolation,无锁) | — |

**PG 的 SSI 是学术界推崇的实现**:不靠 2PL(两阶段锁),靠运行时检测"读写依赖图"是否产生 cycle,有 cycle 就 abort 其中一个事务。**读不阻塞写,写不阻塞读**,但有的事务会 abort 重试(应用层要处理 serialization_failure)。

---

## 4. 数据模型差异 ── 决定建模哲学

### 4.1 关系模型(MySQL / PG)

- **第三范式优先**:消除冗余,关联用外键
- **JOIN 是核心**:查询语义靠 JOIN 表达
- **schema 严格**:列名、类型、约束在 DDL 中固定

### 4.2 文档模型(Mongo)

- **反范式优先**:嵌入式文档,一次查询拿全
- **JOIN 是反模式**(`$lookup` 性能差,语义弱)
- **schema 灵活**:每条文档字段可不同,模式在应用层

### 4.3 PG JSONB:混血模式

PG 的 JSONB 不是"JSON 字符串",是**二进制 JSON,可索引、可路径查询、可部分更新**。

```sql
CREATE TABLE messages (
  id          BIGSERIAL PRIMARY KEY,
  sender_id   BIGINT NOT NULL,     -- 关系字段
  timestamp   TIMESTAMPTZ NOT NULL,
  extra       JSONB                -- 文档字段
);

-- 路径查询
SELECT * FROM messages WHERE extra @> '{"platform":"mobile"}';
SELECT extra->>'platform' FROM messages;

-- GIN 索引让上面查询亚毫秒
CREATE INDEX ON messages USING GIN (extra);

-- 部分更新(只改 JSONB 内的某字段)
UPDATE messages SET extra = jsonb_set(extra, '{read}', 'true');
```

**这是 PG 在 2024 蚕食 Mongo 市场的核心武器**:稳定字段进列(有约束 + 关系),灵活字段进 JSONB(等价 Mongo 文档),**同一表内并存**,且都进 ACID 事务。

MySQL 8 也有 JSON 类型,但:
- 无等价 GIN(没倒排索引)
- 路径索引必须经 generated column + B-tree
- 操作符语义不如 PG 完整

---

## 5. 查询优化器与 JOIN ── 决定复杂查询性能

### 5.1 PostgreSQL 优化器

业界公认**最强的开源优化器**:

- **基于代价**:从 `pg_stats` 直方图估行数
- **支持所有 JOIN 算法**:Nested Loop / Hash Join / Merge Join,优化器按 cost 选
- **物化视图**(`MATERIALIZED VIEW`)
- **并行查询**(单 query 多 worker 进程)
- **CTE 优化**(PG 12+ inline CTE)
- **JIT 编译**(LLVM,PG 11+)

### 5.2 MySQL 优化器

历史上较弱:

- **8.0 前几乎只用 Nested Loop**
- **Hash Join 是 8.0.18 才加的**(2019)
- **没有真正 Merge Join**
- **统计信息相对简陋**

实际后果:**MySQL 上多表 JOIN 比 PG 慢 5-30 倍是常见现象**,业务上常见解法是"应用层 JOIN"或"反范式预聚合"。

### 5.3 MongoDB 没有传统 JOIN

`$lookup` 实现:对外层每个文档,在内层集合查一次(等价 Nested Loop Join,没有 Hash / Merge 算法)。

对 1000 × 1000 的 JOIN:
- PG Hash Join:亚秒
- Mongo $lookup:5-60 秒

**Mongo 文档建模就是要避免 JOIN**:把相关数据嵌入。

---

## 6. 复制与高可用

### 6.1 MySQL Binlog 复制

- **Binlog**:记录所有变更(语句 / 行 / 混合三种格式)
- **异步复制**(默认):主提交不等从,有数据丢失风险
- **半同步**:主等至少一个从确认收到 binlog
- **Group Replication / InnoDB Cluster**(8.0):基于 Paxos 的真同步

### 6.2 PG WAL 流复制

- **物理复制**:从库重放主库的 WAL(每个备库是逻辑上的二进制副本)
- **synchronous_commit**:可选 off / local / remote_write / on / remote_apply,从最弱到最强一致
- **逻辑复制**:解析 WAL 转成 SQL 语句,可跨版本复制 / 只复制某些表 / 给下游 CDC(Debezium 基础)

### 6.3 MongoDB Oplog 复制

- **Replica Set**:典型 1 主 2 从,自动选主
- **Oplog 是 capped collection**(环形覆盖),所有写操作都有 oplog 条目
- **从库 tail oplog 重放**
- **Sharding**:把数据按 shard key 分到不同 replica set,每个 shard 独立 replica + 主从

**关键差异**:MySQL / PG 复制是节点级别(每个节点全量数据);Mongo Sharding 是数据级别(每个节点只有一部分)。**Mongo 的水平扩展模型在 DB 层是一等公民**,MySQL / PG 通常需要应用层分片或 Vitess / Citus 等中间件。

---

## 7. 业务场景下的性能差异(从原理推现象)

下面 8 个场景,**用前 6 节的原理推导差异**。

### 场景 1:高频次单行 UPDATE(账户余额扣减)

**典型**:`UPDATE accounts SET balance = balance - 10 WHERE user_id = 7`

| 库 | 行为 | 性能 |
|---|---|---|
| InnoDB | 就地修改,旧版本进 undo log,行锁 | **极快**,undo 链短时清理也快 |
| PG | 创建新行 + 旧行打 dead 标记 | 单次 OK,**但高频更新会持续产生 dead tuple,autovacuum 跟不上则表膨胀**;HOT 优化能缓解(若 balance 没索引) |
| Mongo | 单文档原子更新 | 快,无锁(WT 行级 MVCC) |

**真实差异**:PG 的 MVCC 在"频繁单行 UPDATE"场景下是潜在劣势,需要 autovacuum 跟上。InnoDB 因 undo log 设计更适配这场景 ── 这是为什么 PayPal / 银行类应用历史上偏好 MySQL/Oracle。**PG 的应对是 HOT + autovacuum 调优**。

### 场景 2:复杂多表 JOIN(订单 + 用户 + 商品 + 库存,4 表)

| 库 | 行为 | 性能 |
|---|---|---|
| PG | Hash Join 自动选,亚秒 | **强** |
| MySQL 5.7 | 只 Nested Loop,慢 5-30× | 弱 |
| MySQL 8.0+ | 加了 Hash Join,但优化器仍弱于 PG | 中 |
| Mongo | 4 个 `$lookup` 嵌套,慢且不优雅 | **极弱** |

**原理**:Hash Join 的复杂度是 O(N+M),Nested Loop 是 O(N×M)。优化器是否选对算法,决定一切。

### 场景 3:全文搜索(中文消息搜索)

| 库 | 实现 | 性能 |
|---|---|---|
| PG | `tsvector` + GIN 内置,中文加 `pg_jieba` | 10 万行亚秒 |
| MySQL | InnoDB FULLTEXT(5.6+),中文需 ngram parser | 慢于 PG,且 ngram 召回率差 |
| Mongo | Text 索引(简单)/ Atlas Search(强但独立服务) | 简单 OK,复杂场景要 Atlas Search 增成本 |

**原理**:GIN 倒排索引 + 词典 + 词形归一是几十年信息检索的成熟方案,PG 把 ES 的核心能力做进了 SQL DB。

### 场景 4:时序数据(日志 / 监控,每秒万条插入)

| 库 | 行为 | 性能 |
|---|---|---|
| PG + BRIN + 分区 | BRIN 索引几乎零开销,分区按月划分 | **强** |
| PG + TimescaleDB | 自动分区 + 压缩 + 物化视图聚合 | 极强(专门优化) |
| MySQL + 分区 | RANGE 分区按时间 | 中等 |
| Mongo Time Series Collections (5.0+) | 专门优化的时序集合 | 良好 |

### 场景 5:文档型数据(动态字段)

**典型**:商品规格,每种商品字段不同(衣服有尺码颜色,手机有内存芯片)

| 库 | 行为 |
|---|---|
| Mongo | 天然适合,字段差异零成本 |
| PG + JSONB | 稳定字段进列,变化字段进 JSONB + GIN |
| MySQL JSON | 能存但索引能力弱,生态差 |

**真实差异**:**PG JSONB 在大部分 Mongo 场景下是等效甚至更优解**,因为还能配合关系字段做事务和 JOIN。

### 场景 6:IM 消息(本项目)

**特征**:append-only 高吞吐,字段灵活,需要按 conversation_id 取 last message 等关系性查询。

| 库 | 适配 |
|---|---|
| Mongo | 早期合适,aggregate pipeline 笨重 |
| PG + JSONB | **当前业界主流**:稳定字段列 + 灵活 JSONB,DISTINCT ON 处理 last message |
| MySQL | 不如 PG(JSON 弱 + 优化器弱) |
| ScyllaDB / Cassandra | 亿级 DAU 才需要 |

我们项目从 Mongo 切 PG 的依据(见 docs/database/03)。

### 场景 7:OLAP 聚合分析

| 库 | 行为 |
|---|---|
| PG | 窗口函数 / CTE / 物化视图 / 并行查询 / JIT,中等数据量强 |
| MySQL 8.0+ | 有窗口函数,弱于 PG |
| Mongo | Aggregation Pipeline,大集合慢 |
| ClickHouse / DuckDB | 列存 OLAP 专精,远超三者 |

**结论**:三库都不是真正的 OLAP,严肃场景上 ClickHouse / DuckDB / Snowflake。

### 场景 8:多租户 / Schema 隔离

| 库 | 实现 |
|---|---|
| PG | `schema` 一等公民,租户 = schema,RBAC 控制访问 |
| MySQL | `database` 当 namespace,跨 db 查可以但语义弱 |
| Mongo | `database` / `collection` 分,无强 schema 约束 |

PG 的 schema 在多租户场景明显胜出。

---

## 8. 真实业界选型对照

| 公司 / 产品 | 选择 | 关键依据 |
|---|---|---|
| **Stripe** | 早期 MongoDB → PostgreSQL | 财务一致性需求,多文档事务慢 |
| **Notion** | PostgreSQL + block model | 文档 + 关系混合,JSONB 一等公民 |
| **Slack** | MySQL → PostgreSQL(部分新业务) | 消息分片 |
| **Linear** | PostgreSQL only | 全栈现代 PG |
| **Discord** | MongoDB → Cassandra → ScyllaDB | 消息量级超 PG / Mongo 上限 |
| **Vercel / Neon / Supabase** | PG-only(把 PG 当产品卖) | PG 是 cloud-native 黄金标准 |
| **微信 / 飞书 / WhatsApp** | 自研 KV / Erlang | 亿级 DAU 自研栈 |
| **Airbnb** | MySQL + Vitess(分片) | 历史遗留 + 工具链投资 |
| **Uber** | MySQL → PostgreSQL → 自研 → MySQL(反复) | 内部博客详细记录原因,涉及 schema 演进 / 复制 / 分片 |
| **GitHub** | MySQL + 自研工具 | 早期 Rails 默认 + 不切换 |
| **Twitter / X** | MySQL + Manhattan(自研 KV) | 大规模分布式存储 |

**规律**:**新项目 2024+ 默认 PG**,老项目 MySQL 多。Mongo 在 schema 频繁演进 + 极简写吞吐场景留有阵地,但被 PG JSONB 蚕食严重。

---

## 9. 选型决策路径(基于原理推导)

```
1. 你需要严格 schema + 跨表事务?
   ├─ 是 → MySQL or PG
   └─ 否 → 继续

2. 字段持续高速演进 + 业务从根本上是文档?
   ├─ 是 → Mongo or PG + JSONB
   │   ├─ 团队偏 SQL → PG + JSONB
   │   └─ 团队偏 NoSQL + 写吞吐极高 → Mongo
   └─ 否 → 继续

3. 复杂多表 JOIN / 聚合查询 / 物化视图?
   ├─ 频繁 → PG(优化器最强)
   └─ 简单 → MySQL 也行

4. 数据规模超过单机 RAM 一两个数量级 + 需要水平扩展?
   ├─ 文档型 → Mongo Sharding
   ├─ 关系型 → PG + Citus / Vitess for MySQL
   └─ 时序 → TimescaleDB / InfluxDB / ClickHouse

5. 全文搜索 / 地理 / 数组 / 范围 / 时序?
   ├─ PG 内置 GIN / GiST / BRIN,优势明显
   └─ 其他需独立 ES / Atlas Search

6. 运维生态 / 团队历史习惯?
   ├─ 已有 MySQL DBA 团队 → 留 MySQL
   ├─ 云上 / 现代栈 → PG 是首选
   └─ —

7. 极端场景(亿 DAU)?
   └─ 自研 / ScyllaDB / Cassandra,跟前三都没关系
```

---

## 10. 关键认知(全文压缩)

1. **底层数据布局决定 90% 性能**:InnoDB 聚簇索引让主键查询快但二级索引回表,PG heap 让所有索引平等但无序物理,Mongo B-tree + 文档让单文档读写极快但 JOIN 弱

2. **MVCC 实现哲学差异**:InnoDB 用 undo log 链(就地更新),PG 用 dead tuple + VACUUM(就地保留),Mongo WT 类 PG 风格。**频繁 UPDATE 的表 PG 需要 VACUUM 调优**,这是 PG 的著名运维负担

3. **"Schemaless" 是营销话术,Schema 永远存在**:Mongo 把 schema 推到应用层,不是消除了它

4. **PG 是关系 + 文档的混血**:JSONB + GIN 让 Mongo 优势(灵活字段 + 索引)在 PG 内可得,且保留事务和 JOIN。**这是 PG 在 2024 成为新项目默认的核心原因**

5. **MySQL 的存在感主要靠生态 + 团队习惯**:技术上 PG 大部分维度领先,但 MySQL 工具链 / DBA 人才 / 教程数量更多

6. **MongoDB 在 schema 演进极快 + 写吞吐极高场景仍有位置**,但被 PG 蚕食的速度持续

7. **JOIN 性能在三库间是最大鸿沟**:PG (Hash/Merge) >> MySQL 8 (Hash 8.0.18+) >> MySQL 5.7 (only NL) >> Mongo (only NL via $lookup)

8. **复制模型**:MySQL Binlog 简单灵活,PG WAL 强一致选项更丰富,Mongo Replica Set + Sharding 是水平扩展一等公民

9. **三库都不是 OLAP 库**:严肃聚合分析用 ClickHouse / DuckDB / 数仓

10. **选型决定运维负担**:PG 要 autovacuum,InnoDB 要 Buffer Pool 调优,Mongo 要分片策略。**没有零运维的 DB**,只有"运维负担放在哪个维度"
