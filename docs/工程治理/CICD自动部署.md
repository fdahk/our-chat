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

## 7. 三个配置项详解

这三个名字不直观，单独说清楚「是什么 / 在本项目怎么用 / 设错会怎样 / 怎么取值」。

### 7.1 `GATEWAY_INTERNAL_TOKEN` —— 网关↔后端的「内部接头暗号」

**是什么**：Go `gateway` 和 Node `server` 之间的一把**共享密钥**，用来证明「这个内部请求确实来自我们自己的网关，不是外人伪造的」。它是**服务器之间**的认证，跟终端用户的登录 token 是两回事。

**在本项目怎么用**（架构见 `docs` 重构方案 16 §5.4）：
- 分工：Go 网关只扛 WebSocket 长连接，**不做业务**；客户端发来的消息帧，网关「上行透传」给后端的内部端点 `POST /internal/gateway/uplink`（网关侧 `gateway/internal/upstream/upstream.go` 直连 `UPSTREAM_BASE_URL`=`http://server:3007`；后端侧 `server/src/routes/internal.ts`，挂在 `app.use('/internal', ...)`），由 Node 复用落库/发号/去重/扩散逻辑，再经 Redis `gw:downlink` 把下行投回网关代发。
- 这个内部端点**绝不能被外部直接调到**（否则任何人都能伪造「这条消息是用户 X 发的」）。所以：
  - 网关调它时带请求头 `X-Gateway-Token: <GATEWAY_INTERNAL_TOKEN>`（`gateway/internal/config/config.go` 读同名环境变量，`upstream` 携带）；
  - 后端校验 `req.header('X-Gateway-Token') !== INTERNAL_TOKEN` 就回 `401 内部令牌校验失败`（`internal.ts:40`）；
  - 真正的用户身份取自网关验签后写的 `X-User-Id`，**不信帧里自报的发送者**。
- server 和 gateway 读的是**同一个**环境变量。本部署里生成的 `.env` 会把它同时注入两个容器，自动一致。

**设错/用默认值的代价**：
- 两边值不一致 → 每次上行都 401 → **走 Go 网关的那条消息链路静默失败**。
- 生产沿用 dev 默认值 `dev-internal-token` → 这是公开可知的串，外人可直接打内部端点、配上伪造的 `X-User-Id` **冒充任意用户发消息**，是严重越权。所以**生产必须是强随机串**。

**怎么取值**：`openssl rand -hex 32`。属真机密 → 放 **GitHub Secrets**。（已为你生成一个，见 docx。）

---

### 7.2 `WEB_PUBLIC_ORIGIN` —— 用户「在浏览器里实际访问的那个地址」

**是什么**：整套系统对外的**唯一公开 URL**，就是用户地址栏里敲的那个，例如 `https://chat.example.com` 或 `http://1.2.3.4:8080`。它不是某个内部地址，而是「从外面看，这个应用住在哪」。

**为什么要单独配、还分两处用**：本项目所有流量都**同源**经 nginx 反代（API、socket.io、Go 的 `/ws`、OAuth 都走同一个域名/端口），所以这个公开地址要在两个时机用到：
1. **构建期（前端）**：Vite 把它作为 `VITE_SERVER_ORIGIN` 烤进 JS 包，前端运行时用作 `API_BASE_URL` / `SOCKET_URL`（`web/src/utils/runtime.ts`）。于是浏览器把请求发到 `<WEB_PUBLIC_ORIGIN>/api`、`/socket.io`、`/ws` → 同源 → nginx 代理到后端。**不设它**，前端会退化成请求 `http://<主机名>:3007`（直连后端端口），而生产只暴露 nginx、不暴露 3007 → **全部请求失败**。这就是它必须在构建期就确定的原因。
2. **部署期（后端 CORS + OAuth 签发者）**：Action 用它**自动派生**三个后端值，省得你分别配、还天然一致：
   - `CLIENT_ORIGINS` → 后端 CORS 白名单（允许哪个浏览器源带 Cookie 调 API）；
   - `OAUTH_ISSUER_BASE_URL` → IdP 的 `issuer`（token 里的 `iss` 声明，以及 `/.well-known/openid-configuration` 发现端点和 JWKS 的基地址）；
   - `OAUTH_WEB_REDIRECT_URI` → `<它>/oauth/callback`，OAuth 回跳地址。

**设错的代价**：协议（http/https）或端口对不上，就会：HttpOnly 同源 Cookie 不被带上、CORS 拦截、OAuth 的 `iss`/回跳不匹配 → **登录直接坏掉**。所以它必须**和用户实际敲的地址逐字一致**。

**怎么取值**：你最终对外提供服务的地址。非机密 → 放 **GitHub Variables**。改了它要重新 push（因为前端是构建期烤入）。

---

### 7.3 `OAUTH_ACTIVE_KID` —— 当前 OAuth 签名密钥的「编号(kid)」

**是什么**：server 自己是 OAuth IdP，用 RS256 私钥**签发 JWT**。每把签名密钥有个字符串编号叫 **kid**（key id）。`OAUTH_ACTIVE_KID` 就是「现在正在用哪把密钥签发」的那个编号标签。它本身**不是密钥、也不是文件名**，只是个标识。

**在本项目怎么用**（`server/src/oauth/keys.ts` / `tokens.ts` / `jwks.ts`）：
- 启动时 `loadKeyStore` 加载「活跃密钥」：读私钥文件（活跃密钥的文件路径由 `OAUTH_PRIVATE_KEY_FILE` 给，**与 kid 文本无关**），并打上 `kid = OAUTH_ACTIVE_KID`。
- 签发 token 时，JWT 头里写 `kid: store.active.kid`（`tokens.ts`）——每个 token 都标明「我是被哪把密钥签的」。
- JWKS 端点 `/.well-known/jwks.json` 把公钥按各自的 `kid` 公开。
- 下游验签方（Go 网关、agent-server）拉 JWKS，按 token 头里的 `kid` 找到对应公钥验签（验签侧 `store.all.get(kid)`）。
- 配套的 `OAUTH_RETIRED_KIDS`（逗号分隔，本项目默认空）= 已不再用于签发、但仍留在 JWKS 里的旧密钥，好让「旧密钥签发、尚未过期」的 token 还能验过——这就是**密钥轮换不中断登录**的机制：上新 kid 当 active → 旧 kid 移入 retired → 等旧 token 全过期再删。

**设错的代价**：
- `OAUTH_ACTIVE_KID` 找不到对应私钥 → `loadKeyStore` 抛错，**server 启动即失败**（设计成 fail-fast）。
- 只改 kid 文本、没换密钥：已签发的 token 带旧 kid，而新 JWKS 只有新 kid → 现存会话的 token 验不过（除非把旧 kid 放进 retired）。所以**别随手改 kid**。
- 它要和你实际部署的私钥一致即可（本项目：`OAUTH_ACTIVE_KID=prod-202606`，Action 把对应私钥写到 `keys/oauth-private-prod.pem`，`OAUTH_PRIVATE_KEY_FILE=/app/keys/oauth-private-prod.pem`）。注意 kid 文本 `prod-202606` 与文件名 `prod` 不必相同——文件靠 `OAUTH_PRIVATE_KEY_FILE` 找，kid 只是写进 token/JWKS 的标识。

**怎么取值**：一个**稳定、每把密钥唯一**的字符串即可，建议带启用月份便于轮换追溯，如 `prod-202606`。非机密 → 放 **GitHub Variables**。换密钥时才需要改它（同时把旧值放进 `OAUTH_RETIRED_KIDS`）。
