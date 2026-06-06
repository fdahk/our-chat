# 02 · 生产部署 SOP

> 给运维 / SRE / 自助部署到云上的工程师。本地开发见 [01-本地开发环境搭建.md](./01-本地开发环境搭建.md)。

## 1. 部署架构

```
┌─────────────────────────────────────────────────────────┐
│                  Load Balancer / nginx                  │
│                  HTTPS termination + WS upgrade         │
└─────────────────────────────────────────────────────────┘
                          ↓
              ┌───────────────────────┐
              │  our-chat server N+   │  ← 无状态,水平扩展
              │  Container(Dockerfile)│
              └───────────────────────┘
                          ↓
          ┌────────────────────────────────────┐
          │  PostgreSQL 16(云托管推荐)         │
          │  RDS / Cloud SQL / Aiven / Neon    │
          │  HA(读写分离 + 自动备份)           │
          └────────────────────────────────────┘
```

## 2. 关键约定

| 项 | 生产配置 | 说明 |
|---|---|---|
| `NODE_ENV` | `production` | Prisma + Express 切生产行为 |
| `DATABASE_URL` | 云 PG 连接串 | 含密码,经 secret manager 注入 |
| 私钥 | secret volume 挂载 | `/secrets/oauth-private-*.pem`,不进镜像 |
| `OAUTH_ISSUER_BASE_URL` | `https://api.your-domain.com` | 公网可达,resource server 据此校验 iss |
| `JWT_SECRET` | 高熵随机 32+ 字节 | 经 secret manager 注入,绝不进 git |
| 端口 | 3007(默认) | 反向代理统一终止 TLS |
| 日志 | stdout JSON | 容器编排收集 → ELK/Loki/CloudWatch |

## 3. 镜像构建

### 3.1 自动构建(推荐 ── GitHub Actions)

推 main 或打 tag 会自动 build 并推到 GHCR(GitHub Container Registry):

```
push to main      → ghcr.io/<owner>/our-chat-server:latest + sha-<short>
push tag v1.2.3   → ghcr.io/<owner>/our-chat-server:1.2.3 / 1.2 / 1 / latest
```

详见 `.github/workflows/cd.yml`。GHCR 私有镜像免费,完美对接 K8s ImagePullSecret。

### 3.2 手动构建(应急 / 离线环境)

```bash
docker build --target runner -t our-chat-server:$(git rev-parse --short HEAD) ./server
docker tag our-chat-server:$(git rev-parse --short HEAD) registry.your-domain.com/our-chat-server:latest
docker push registry.your-domain.com/our-chat-server:latest
```

镜像大小 ~250 MB(node:22-alpine 基础)。生产可考虑 distroless 进一步瘦到 ~120 MB。

### 3.3 GHCR 镜像拉取

```bash
# 需要先 GitHub Token 登录(只读权限即可)
echo $GITHUB_PAT | docker login ghcr.io -u <your-username> --password-stdin
docker pull ghcr.io/<owner>/our-chat-server:latest
```

## 4. 数据库部署

### 4.1 推荐:云托管 PG(零运维)

- **AWS RDS PostgreSQL 16**:Multi-AZ + 自动备份 + 慢查询日志
- **GCP Cloud SQL for PostgreSQL**:同上
- **Aiven for PostgreSQL** / **Neon** / **Supabase**:Serverless 风格,按使用量计费

### 4.2 自建:看清责任清单

| 责任 | 是否你自己做 |
|---|---|
| 主从复制 / 高可用 | 是(Patroni / repmgr / Stolon) |
| 自动备份 + PITR | 是(pgBackRest / Barman) |
| 定时 VACUUM / autovacuum 调优 | 是 |
| 监控(连接数 / 慢查询 / 复制延迟) | 是(prometheus-postgres-exporter) |
| 主版本升级 | 是 |
| 安全补丁 | 是 |

⚠ 强烈建议**生产用云托管**。自建除非有 DBA 专职。

## 5. 首次部署(全新生产环境)

```bash
# (1) 配置 secret manager(以 AWS Secrets Manager 为例)
aws secretsmanager create-secret --name our-chat/db-url --secret-string "postgresql://..."
aws secretsmanager create-secret --name our-chat/jwt --secret-string "$(openssl rand -hex 32)"

# (2) 在 secret volume 准备 OAuth 私钥(生产用新生成,不复用 dev)
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out oauth-private-prod.pem
# 上传到 secret manager / K8s Secret / 等

# (3) 应用 Migration(独立任务,不要等应用启动时跑)
docker run --rm \
  -e DATABASE_URL=$DB_URL \
  our-chat-server:latest \
  npx prisma migrate deploy

# (4) 启动应用
docker run -d \
  -p 3007:3007 \
  -e DATABASE_URL=$DB_URL \
  -e JWT_SECRET=$JWT_SECRET \
  -e OAUTH_ISSUER_BASE_URL=https://api.your-domain.com \
  -e OAUTH_PRIVATE_KEY_FILE=/secrets/oauth-private-prod.pem \
  -e OAUTH_ACTIVE_KID=prod-2026-06 \
  -v /var/secrets/our-chat:/secrets:ro \
  --name our-chat-server-1 \
  our-chat-server:latest
```

## 6. 滚动升级

```bash
# (1) 拉新版本
docker pull registry.your-domain.com/our-chat-server:v1.2.3

# (2) 先应用 migration(关键:在新代码部署前先升 DB)
docker run --rm -e DATABASE_URL=$DB_URL \
  registry.your-domain.com/our-chat-server:v1.2.3 \
  npx prisma migrate deploy

# (3) 滚动重启容器(K8s rolling update / Nomad / 等)
kubectl set image deployment/our-chat-server server=registry.../our-chat-server:v1.2.3
```

**强制顺序**:**migration 先于代码部署**。否则新 schema 还没就绪,旧代码连了新库就报错。

## 7. 健康检查与就绪探针

应用提供两个端点(待实现):

```
GET /health        ──  always 200(进程活着)
GET /ready         ──  200 if DB reachable + migrations applied
```

K8s 配置参考:

```yaml
livenessProbe:
  httpGet: { path: /health, port: 3007 }
  initialDelaySeconds: 30
  periodSeconds: 10
readinessProbe:
  httpGet: { path: /ready, port: 3007 }
  initialDelaySeconds: 10
  periodSeconds: 5
```

## 8. 密钥轮换

详见 [../oauth/04-密钥管理.md](../oauth/04-密钥管理.md)。摘要:

```bash
# (1) 生成新密钥(本地或 secret manager)
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out oauth-private-2026-12.pem

# (2) 上传到 secret volume

# (3) 滚动重启,双 kid 共存(env 同时含旧新)
OAUTH_ACTIVE_KID=2026-06          # 仍签发用旧
OAUTH_RETIRED_KIDS=               # 旧 kid 已停用,这步不变
OAUTH_KEY_DIR=/secrets            # 改用目录扫描多 kid

# (4) 等 10 分钟(让 resource server 拉到新公钥)

# (5) 切签发到新 kid
OAUTH_ACTIVE_KID=2026-12
OAUTH_RETIRED_KIDS=2026-06        # 旧仍发公钥,但不签新 token

# (6) 等 30 天(让旧 token 自然过期)

# (7) 下线旧 kid
OAUTH_RETIRED_KIDS=               # 清空
```

## 9. 监控指标

最低应监控:

| 指标 | 告警阈值 |
|---|---|
| HTTP 5xx 率 | > 1% / 5min |
| HTTP P95 延迟 | > 500ms / 5min |
| OAuth `rt_reuse_detected` 事件 | **任一即触发**(可能是攻击) |
| PG 连接数 | > 80% 池大小 |
| PG 慢查询 | > 1 秒 |
| PG 复制延迟 | > 5 秒 |
| 磁盘 | > 75% |

## 10. 备份与灾难恢复

| 项 | 频率 | 保留期 |
|---|---|---|
| PG 全量备份 | 每日 | 30 天 |
| PG WAL 持续归档 | 实时 | 7 天(PITR 时间窗) |
| 灾难恢复演练 | 每季度 | — |

RTO / RPO 目标(根据业务定):
- RPO ≤ 5 分钟(WAL 归档间隔)
- RTO ≤ 30 分钟(从最新备份恢复)

## 11. 安全核对

- [ ] 私钥经 secret volume 注入,**不进** Docker 镜像 / git
- [ ] `JWT_SECRET` 高熵随机
- [ ] HTTPS 强制(HSTS 头)
- [ ] CORS 白名单严格(`CLIENT_ORIGINS`)
- [ ] PG `pg_hba.conf` 限 server IP 网段
- [ ] 容器以非 root 跑(Dockerfile 加 `USER node`)
- [ ] 日志不打印 token / 密码 / cookie 值
- [ ] OAuth reuse detection 告警接入 PagerDuty / OnCall

## 12. 回滚预案

```bash
# (1) 立即 rollback 镜像
kubectl rollout undo deployment/our-chat-server

# (2) 评估是否要回滚 schema
# Prisma migrate 是 forward-only,回滚 schema 需要:
#   方案 A:新建反向 migration(慢但安全)
#   方案 B:手动 SQL ROLLBACK(快但风险大)
```

详见 [../database/02-migration-SOP.md](../database/02-migration-SOP.md) §6。
