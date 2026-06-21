# CI/CD 自动部署（GitHub Actions → GHCR → 服务器）

> 目标：**推送到 `main` 即自动部署到指定服务器，服务器零手工维护配置**。
> 工作流：`.github/workflows/deploy.yml`；生产编排：`docker/docker-compose.prod.yml`。

## 1. 工作原理

```
push main ─┬─► [build] 并行构建 server/gateway/web 三镜像 ──► 推 GHCR(ghcr.io/fdahk/our-chat-*)
           │
           └─► [deploy] scp 同步 compose+nginx ──► SSH 到服务器：
                         按 Secrets/Variables 生成 .env + 解码写 OAuth 私钥 → compose pull → up → prune
```

关键取舍：

- **镜像在 CI 构建、服务器只 pull**：不在生产机上 `docker build`。
- **用 commit SHA 作镜像 tag 部署**：确定性，避免 `latest` 竞态；同时也推 `:latest` 作手动兜底。
- **配置三层，服务器零手工维护**：
  - ① **通用、非机密**（端口、各 TTL、`DATABASE_URL`、`REDIS_URL`、`JWT_EXPIRES_IN`、`S3_FORCE_PATH_STYLE` 等）→ 写进 `docker-compose.prod.yml` 的 `environment:` 默认值 `${VAR:-默认}`，不传也能跑。
  - ② **机密**（DB 密码、`JWT_SECRET`、网关令牌、S3 密钥、OAuth 私钥）→ **GitHub Secrets**。
  - ③ **因环境而异的非机密**（公开域名、COS endpoint/region/bucket、`OAUTH_ACTIVE_KID`）→ **GitHub Variables**。
  - ②③ 由 deploy job 在服务器**生成 `/opt/our-chat/.env`**，OAuth 私钥由 `OAUTH_PRIVATE_KEY_B64` 解码写到 `keys/`。**服务器上没有任何需要手工编辑的配置文件。**
- **公开地址只配一个**：`WEB_PUBLIC_ORIGIN` 一个变量，Action 自动派生 `CLIENT_ORIGINS / OAUTH_ISSUER_BASE_URL / OAUTH_WEB_REDIRECT_URI`，三处天然一致。
- **DB 迁移随容器启动自动执行**：`server` 镜像启动命令为 `prisma migrate deploy && node dist/server.js`，幂等。
- **GHCR 拉取用本次 workflow 的 `GITHUB_TOKEN`**：短时有效、拉完即登出，无需长期 PAT。

## 2. 服务器一次性准备（极简）

```bash
# 1) 装 Docker（含 compose v2）
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # 重新登录生效

# 2) 建部署目录并授权给 SSH 登录用户
sudo mkdir -p /opt/our-chat
sudo chown -R $USER:$USER /opt/our-chat
```

完成。`.env`、`keys/oauth-private-prod.pem`、compose、nginx 全部由 Action 部署时写入，**无需手工放置**。
（复用现有服务器登录密钥时，也无需再往 `~/.ssh/authorized_keys` 加部署公钥。）

## 3. GitHub 配置（Settings → Secrets and variables → Actions）

### Secrets（机密 + 连接）
| 名称 | 说明 |
|---|---|
| `SSH_HOST` | 服务器 IP/域名 |
| `SSH_USER` | SSH 登录用户（须在 docker 组） |
| `SSH_PRIVATE_KEY` | 登录私钥全文（如现有 `tujiang.pem`） |
| `SSH_PORT` | 端口（可选，默认 22） |
| `POSTGRES_PASSWORD` | 生产 DB 密码 |
| `JWT_SECRET` | JWT 签名密钥（`openssl rand -hex 32`） |
| `GATEWAY_INTERNAL_TOKEN` | server↔gateway 内部令牌 |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | 腾讯云 COS SecretId/SecretKey |
| `OAUTH_PRIVATE_KEY_B64` | OAuth 私钥 PEM 的 base64（`base64 < oauth-private-prod.pem`） |

> `GITHUB_TOKEN` 是 Actions 自带的（推/拉 GHCR），无需手动配。

### Variables（非机密，明文）
| 名称 | 示例 | 必填 |
|---|---|---|
| `WEB_PUBLIC_ORIGIN` | `https://chat.example.com` 或 `http://IP:8080` | **必填**（构建期 + 派生 CLIENT_ORIGINS/OAUTH_*） |
| `OAUTH_ACTIVE_KID` | `prod-202606` | 是 |
| `S3_ENDPOINT` | `https://cos.ap-guangzhou.myqcloud.com` | 是 |
| `S3_REGION` | `ap-guangzhou` | 是 |
| `S3_BUCKET` | `<bucket>` | 是 |
| `S3_PUBLIC_BASE_URL` | `https://<bucket>.cos.<region>.myqcloud.com` | 是 |
| `POSTGRES_USER` | `postgres` | 可选（默认 postgres） |
| `POSTGRES_DB` | `our_chat` | 可选（默认 our_chat） |
| `DEPLOY_PATH` | `/opt/our-chat` | 可选（默认即此） |

## 4. 触发与切分支

- 默认 **push 到 `main`** 自动部署；Actions 页可手动 `Run workflow`。
- 想用 `dev` 触发：把 `deploy.yml` 的 `on.push.branches: [main]` 改成 `[dev]`。

## 5. 回滚
```bash
cd /opt/our-chat
export SERVER_IMAGE=ghcr.io/fdahk/our-chat-server:<好的SHA> \
       GATEWAY_IMAGE=ghcr.io/fdahk/our-chat-gateway:<好的SHA> \
       WEB_IMAGE=ghcr.io/fdahk/our-chat-web:<好的SHA>
docker compose -f docker-compose.prod.yml up -d
```
（`.env`/`keys` 仍是上次部署写入的；只换镜像 tag 即回滚。）

## 6. 常见排错

| 现象 | 排查 |
|---|---|
| 前端打开但 API 连不上 | `WEB_PUBLIC_ORIGIN` 改了要重新 push（前端构建期烤入）；确认它等于浏览器地址 |
| 拉镜像 `denied` | 确认 workflow `packages: write` 已声明；或把 GHCR 包设 public |
| server 反复重启 | 多为迁移失败/DB 连不上：`docker logs our-chat-server`；检查 `POSTGRES_PASSWORD` Secret |
| OAuth 回跳失败 | 由 `WEB_PUBLIC_ORIGIN` 自动派生，一般不会错；确认它带正确协议(http/https)与端口 |
