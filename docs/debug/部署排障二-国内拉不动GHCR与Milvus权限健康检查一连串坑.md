# 部署排障(二)：国内服务器拉不动 GHCR + Milvus/权限/健康检查一连串坑

> 这是继 `部署链路排障-GitHubActions与Docker镜像源.md`（第一轮：CI 配置、matrix、Docker Hub 基础镜像加速）之后的**第二轮**记录。
> 第一轮解决的是"CI 能不能跑、基础镜像能不能拉"；这一轮解决的是"**镜像构建成功之后，国内服务器到底能不能把应用镜像拉回来并真正把服务跑起来**"。
> 涉及两个仓库：`our-chat`（IM）和 `agent-server`（AI 后端），二者同机部署、经 external 网络 `oc-shared` 互通。文档放这里统一记，因为根因是共享的。
>
> 读这篇你能搞清楚：为什么部署反复失败、每个坑的根因和"为什么"、最终怎么修、以及国内单机部署在镜像/网络上的决策取舍。

---

## 0. 一句话总览

排障顺序（按踩到的先后）：

1. **构建失败** —— agent 的 Dockerfile 跑不了 prisma（多阶段构建 + 依赖分层）。
2. **etcd 拉不到** —— quay.io 国内超时，而 daemon 的 `registry-mirrors` 只代理 Docker Hub、不含 quay。
3. **部署超时** —— milvus 镜像大 + ssh-action 默认 `command_timeout` 只有 10 分钟。
4. **`compose pull` 卡死/快失败** —— 它会对**每个**镜像（含已缓存的）去镜像源做 manifest 复检，镜像源一抖动就崩。
5. **（核心根因）GHCR 的镜像层 blob 国内被墙** —— API/manifest 通，但 blob 下载 0 进度。应用镜像改走 **Docker Hub**。
6. **milvus 连不上 COS** —— 端口用了 MinIO 默认的 `:9000`，腾讯 COS 是 `:443`。
7. **node-server 被判 unhealthy** —— 健康检查打 `/api`（404），应打 `/api/health`；连带 worker 起不来。
8. **our-chat-server 崩溃重启** —— OAuth 私钥 `chmod 600`，容器内非 root 用户读不到（EACCES）。

前 4 个是"次要的、把路扫平"的坑；第 5 个是**真正让两套部署都失败的主因**；6/7/8 是镜像终于拉下来、容器跑起来之后才暴露的"最后一公里"。

---

## 1. agent 镜像构建失败：prisma + 多阶段构建

详见 agent-server 仓库 `docs/debug/prisma迁移在生产镜像跑不起来-多阶段构建与依赖分层.md`，这里只给结论：

- 运行镜像曾用 `pnpm install --prod`（跳过 devDependencies → 缺 prisma CLI），且只 `COPY dist`（没拷 `prisma/`）→ 启动时 `prisma migrate deploy` 无从执行。修法：runtime 复用 builder 的全量 `node_modules` + 拷 `prisma/` + 装 `openssl`。
- builder 阶段还有个顺序坑：`pnpm install` 的 `postinstall`(=`prisma generate`) 需要 schema 先就位，但 `COPY . .` 在 install 之后 → generate 找不到 schema 致构建失败。修法：install 前先 `COPY prisma ./prisma`。

> 这部分只影响 agent-server，our-chat 的 server/web 不涉及 prisma 的这个形态。

---

## 2. etcd 拉不到：registry-mirrors 只管 Docker Hub

**现象**：agent 部署时 `docker compose pull` 卡在 `quay.io/coreos/etcd:v3.5.18`，i/o timeout。

**根因**：第一轮我们给服务器配了 `registry-mirrors`（daocloud 等）加速 Docker Hub。但 **`registry-mirrors` 是 Docker 的硬规则——它只对 `docker.io`（Docker Hub）的拉取生效，不会代理 `quay.io` / `gcr.io` / `ghcr.io`**。etcd 来自 quay.io，完全没走加速，直连被墙。

**修复**：把 etcd 镜像默认改成 daocloud 的 quay 代理：
```yaml
# agent compose
image: ${ETCD_IMAGE:-quay.m.daocloud.io/coreos/etcd:v3.5.18}
```
实测经 `quay.m.daocloud.io` 能拉下来（86MB）。

**记住**：`registry-mirrors` ≠ 万能加速。它只管 Docker Hub。quay / gcr / ghcr 要各自找代理或换源。

---

## 3. 部署超时：milvus 大 + ssh 默认 10 分钟

**现象**：部署日志 `2026/... Run Command Timeout`，前面一堆镜像层 `Downloading` 反复刷。

**根因**：`appleboy/ssh-action` 的 `command_timeout` 默认 **10m**。milvus standalone 镜像约 1.5G，走（会抖的）镜像源拉，10 分钟拉不完就被杀。

**修复**：
- 两个 workflow 的 ssh-action 加 `command_timeout: 30m`。
- 在服务器**一次性预拉 milvus 进缓存**（2.39G），之后部署直接命中缓存。

> 后来第 4、5 条把"部署期还要不要现拉大镜像"这件事从根上改掉了，超时就更不容易触发了。

---

## 4. `compose pull` 卡死：它会复检每一个镜像

**现象**：换了端口/超时后，部署有时**快速失败**（几秒退出、无输出），有时**卡死**（pull 进程挂住直到超时）。

**根因**：`docker compose pull` 会对编排里**所有**服务的镜像（**包括已经在本地缓存的基础镜像**）去 registry/镜像源做一次 manifest 复检。第三方镜像源一旦抽风：
- 快速返回错误 → `pull` 整体失败（任意一个镜像失败就带崩整次 `pull`）；
- 或挂起不响应 → `pull` 一直等（`--ignore-pull-failures` 也救不了"挂起"，它只容忍"失败"）。

**修复**：**不再做整体 `pull`，改用 `up -d --pull missing`**：
```bash
docker compose -f docker-compose.prod.yml up -d --remove-orphans --pull missing
```
- `--pull missing`：**只拉本地没有的镜像**（每次部署变化的、新 sha 的应用镜像），已缓存的基础镜像**根本不去碰镜像源**。
- 这样既保证应用镜像是新版，又彻底避开了"对一堆已缓存大镜像做无谓复检"导致的抖动/卡死。

**对比**：`pull` + `up` vs `up --pull missing` —— 前者每次部署都要把所有镜像对一遍源，后者只补缺失的。对"基础镜像很大、镜像源不稳"的国内场景，后者明显更稳。

---

## 5. 【核心根因】GHCR 的镜像层在国内被墙 → 改用 Docker Hub

这是**这一整轮反复失败的真正主因**，前面几条某种意义上都是被它的表象带偏的。

### 现象
部署在"生成 .env"之后快速失败、且日志里看不到拉取输出。隔离测试：在服务器上 `docker pull ghcr.io/fdahk/agent-server-node:<sha>`——
- manifest 能拿到（打印 `Pulling from ...`），
- 但所有层卡在 `Pulling fs layer`，**105 秒 0 字节、0 层完成**；
- 同时 `curl https://ghcr.io/v2/` 0.09s 就 401（即 API 端点是通的）。

### 根因
**GHCR 的 registry API 和镜像层 blob 是分开托管的**：
- `ghcr.io`（API/manifest）国内可达；
- 但层数据走 GitHub 的 **blob CDN**，**这个 CDN 在国内被墙/极慢** → 层下载卡死。

也就是说：GitHub Actions 构建并推镜像到 GHCR 没问题（runner 在海外），但**国内服务器从 GHCR 把镜像拉回来这一步**被网络卡死。our-chat 和 agent-server 两套部署都挂在这同一根线上（它们的应用镜像都在 GHCR）。

> 顺带验证过 daocloud 的 GHCR 代理 `ghcr.m.daocloud.io`——对这个镜像返回 **403 Forbidden**，走不通。

### 为什么"以前的老服务器没这问题"
对照老项目 `paaawow`（同在国内腾讯云）：它的应用镜像名是 `paaawow_backend-backend`（无 registry 前缀、项目名打头）——这是 **`docker compose build` 在服务器本地构建**的签名；源码来自 **Gitee**（国内 git）。也就是它**从不从 GHCR 拉应用镜像**，自然没有这个问题。这反过来印证了：问题就出在"从 GHCR 拉应用镜像"这条路上。

### 方案对比（为什么选 Docker Hub）
| 方案 | 做法 | 取舍 | 是否保留"CI 构建、不在服务器 build" |
|---|---|---|---|
| **② Docker Hub + 现成镜像源**（采用） | CI 推 `docker.io/fdahk/*`，服务器经已验证的 daemon `registry-mirrors` 拉 | 改动最小、复用已稳的路径、**已实测拉通**；镜像须 public、Docker Hub 免费有限速 | ✅ |
| ① 腾讯 TCR 个人版 | CI 推 TCR，服务器同云内网拉 | 最快、无限速；要开通+凭据，未实测 | ✅ |
| ④ 复刻老服务器 | 源码推 Gitee，服务器 `git pull` + 本地 build | 已被老项目证明可行；但回退到"服务器构建"，且加重 RAM 紧的 agent 机负担 | ❌ |
| ⑤ 配梯子(Docker daemon HTTP proxy) | 让 docker 走境外代理拉 GHCR | 要额外养一台境外机器、把部署稳定性绑在代理上、易被干扰 | —— 不推荐 |

**选 ②** 的关键证据：`milvusdb/milvus`（非官方组织命名空间、1.5G）和实测的 `traefik/whoami`（非官方命名空间、7s 拉完）都经这台服务器的 daocloud `docker.io` 镜像源成功拉下来 → 说明镜像源**代理任意 `<命名空间>/<镜像>`**，你自己的 `fdahk/agent-server-node` 走的是同一条路。

### 改了什么
- **CI（两个 workflow 的 build job）**：登录从 GHCR 改 Docker Hub（`DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN`，配在 environment `pro`）；镜像 tag `ghcr.io/...` → `docker.io/fdahk/...`。
- **compose**：应用镜像默认值 `ghcr.io/fdahk/*` → `docker.io/fdahk/*`。
- **部署脚本**：去掉 GHCR 登录（公开镜像免登录拉），配合第 4 条的 `up --pull missing`。
- 镜像须设为 **public**（Docker Hub 免费 push 新仓库默认 public；私有的话镜像源拉不到）。

> 注意：每次新 commit = 新 tag，对 daocloud 镜像源是 cache-miss → 首次由镜像源回源 Docker Hub 拉一次再喂服务器（milvus 证明大镜像也能流过）。曾观察到"刚推完立即部署"因镜像源还没缓存新 tag 而短暂失败，**稍后重试即过**。

---

## 6. milvus 连不上 COS：端口 :9000 vs :443

镜像终于拉下来、容器建起来后，milvus 起不来（unhealthy），连带 node-server（`depends_on milvus healthy`）不启动。

**现象**（milvus 日志）：
```
failed to check blob bucket exist [bucket=oc-milvus-1374053421]
  error="Head \"https://oc-milvus-1374053421.cos.ap-guangzhou.myqcloud.com:9000/\": dial tcp ...:9000: i/o timeout"
```
（后面一堆 `find no available datacoord` 是**下游症状**——datacoord/datanode 依赖对象存储初始化，存储连不上它们就起不来。）

**根因（拆开讲清楚）**

先扫盲三个角色：
- **MinIO**：开源、可自托管的对象存储，兼容 S3 协议。它的 S3 API **默认端口就是 `9000`**。milvus standalone 的"标准"部署里本来就自带一个 minio 容器（监听 9000）当对象存储——所以 **milvus 的对象存储客户端默认就是按"连一个 9000 上的 MinIO"来配的**（配置项 `minio.port` 默认值 = `9000`）。
- **腾讯 COS**：云上的对象存储，也兼容 S3，但它是**云服务、走标准 HTTPS、端口 `443`**（和所有 https 网站一样），根本没有 9000 这个口。
- 我们这套是"**拿 COS 顶替自托管 MinIO**"：compose 把 milvus 的 `MINIO_ADDRESS` 指向 COS 域名、凭据用 COS 的 AK/SK。

问题就出在端口：`MILVUS_COS_ENDPOINT = cos.ap-guangzhou.myqcloud.com` **只有主机名、没有端口**。milvus 的 `minio.address` 拿到一个不带端口的主机名时，**不会去覆盖 `minio.port` 的默认值 9000**，于是它拼出来的实际地址是 `<bucket>.cos.ap-guangzhou.myqcloud.com:9000`。COS 不在 9000 上监听 → TCP 连接超时（`dial tcp ...:9000: i/o timeout`）→ 对象存储初始化失败 → milvus 的 datacoord/datanode 起不来 → 整个 milvus unhealthy。

一个**看似能救场但其实不行**的点：compose 里已经设了 `MINIO_USE_SSL: 'true'`。但 **`useSSL=true` 只决定"用不用 TLS"，并不会自动把端口推导成 443**——端口该是多少还得你显式给。所以光开 SSL、不给端口，照样去连 9000。

实测佐证：`curl https://oc-milvus-...cos.ap-guangzhou.myqcloud.com/`（默认 443）→ 0.2s 返回 403（HTTP 层是通的，403 只是没带签名）；同名加 `:9000` → 超时。**印证就是端口的事，不是域名/凭据/网络的事**。

**修复**：`MILVUS_COS_ENDPOINT` 必须带端口 `:443`：
```
MILVUS_COS_ENDPOINT = cos.ap-guangzhou.myqcloud.com:443
```
COS 在 443 上提供 HTTPS，写成 `host:443` 后客户端连 443、配合 `useSSL=true` 做 TLS → 通。改后 milvus 0 超时、healthy，node-server 启动并打印 `Milvus collection "knowledge_chunks" created (dim=1024)`。

**为什么必须你手动写 `:443`（通用踩坑）**：milvus 是为"自托管 MinIO（9000）"设计的，它不知道你把后端换成了跑在 443 上的云 S3。把一个"面向自托管 MinIO 的客户端"指向"云对象存储（COS / 阿里 OSS / AWS S3）"时，**端口要手动对齐到云服务的 HTTPS 端口 443**——这是 milvus/MinIO-client 接云存储的通用坑，不止 COS。

> ⚠️ 这是个**需要你在 GitHub Secret 里改**的值（agent-server 仓库 → environment pro）。服务器 `.env` 由 CI 每次按 Secret 重写，所以 Secret 不带 `:443` 的话，下次部署又会退回 `:9000`。`agent.docx` 里这个值也要同步改。

---

## 7. node-server 被判 unhealthy：健康检查打错路径

**现象**：node-server 日志明明 `Nest application successfully started`，但容器状态是 `unhealthy`；node-worker 一直 `Created` 起不来。

**根因**：
- compose 健康检查是 `wget -qO- http://localhost:3101/api`。
- 但应用没有 `GET /api` 这个裸路由（只有 `/api/runs`、`/api/documents`…）→ `/api` 返回 **404**。
- `wget` 遇到 4xx **默认退出码非 0（8）** → 健康检查判失败 → `unhealthy`。
- node-worker `depends_on: node-server 健康` → 上游 unhealthy，worker 永远不启动。

**修复**：改打真正返回 200 的健康端点（应用已有 `/api/health`，返回 postgres/redis/milvus 状态）：
```yaml
test: ['CMD-SHELL', 'wget -qO- http://localhost:3101/api/health || exit 1']
```
改后 node-server healthy、node-worker 启动并消费 runs 队列。

**教训**：健康检查的 URL 必须命中一个会返回 2xx 的端点；`wget`/`curl` 对 4xx 默认算失败。

---

## 8. our-chat-server 崩溃重启：私钥权限 + 容器非 root 用户

部署"成功"（`up` 返回 0），但 `our-chat-server` 其实在**崩溃重启**——因为部署脚本 `up -d` 之后只 `ps`，不校验容器是否稳定，崩溃是在那之后才发生的。

**现象**（server 日志）：
```
服务启动失败: Error: EACCES: permission denied, open '/app/keys/oauth-private-prod.pem'
```

**根因**：
- 部署脚本把 OAuth 私钥写盘后 `chmod 600`（仅属主可读），属主是宿主的 `ubuntu`（uid 1000）。
- 但 **server 容器是以非 root 用户 `app` 运行的**（Dockerfile 里 `USER app`），其 uid ≠ 1000。
- 文件 `:ro` 挂进容器后，`app` 用户既不是属主、也无 group/other 读权限 → 读私钥 EACCES → 启动崩溃 → `restart: unless-stopped` 无限重启。

**修复**：把私钥改成对其他用户可读：
```bash
chmod 644 keys/oauth-private-prod.pem   # 原来是 600
```
单租户服务器 + `:ro` 只读挂载，644 可接受。改后 server `OAuth IdP ready ... port 3007`、healthy。

**取舍**：更"安全"的做法是让私钥只对容器用户可读（按容器 uid chown / 共享 gid），但容器内 `app` 的 uid 对宿主是不确定的、且镜像可能变，跨 uid 最稳的办法就是 644（others 可读）。在单租户机上这是常见且可接受的权衡。

---

## 9. 小结：国内单机部署的镜像/网络决策清单

- **应用镜像别放 GHCR**（blob 国内被墙）。放 Docker Hub（public，经 `registry-mirrors` 拉）或腾讯 TCR（同云内网）。
- **`registry-mirrors` 只代理 Docker Hub**。quay/gcr/ghcr 各自找代理（如 `quay.m.daocloud.io`）或换源。
- **部署用 `up -d --pull missing`**，别做整体 `compose pull`——避免对已缓存大镜像做无谓 manifest 复检。
- **大基础镜像（milvus）一次性预拉缓存**；`ssh-action command_timeout` 放宽到 30m。
- **腾讯 COS 给 milvus 的 endpoint 必须带 `:443`**（否则默认 `:9000` 超时）；给 milvus 单独建 bucket。
- **健康检查打一个会返回 2xx 的端点**（`/api/health`，不是 `/api`）。
- **挂进容器的密钥要考虑容器运行用户的 uid**：容器非 root 用户时，`chmod 600` 属主-only 会让它读不到，单租户机上用 644。

### 排查顺序速记
1. CI 哪一步红：预检红=配置缺失；解析红=workflow 语法；build 红=Dockerfile；deploy(ssh) 红=服务器/网络/镜像。
2. **GHCR API 通但 blob 0 进度** = blob CDN 被墙，换 Docker Hub，别在镜像源上死磕。
3. 容器起来了但 unhealthy/重启：看 `docker logs <容器>`，区分"依赖连不上(COS/DB)"、"健康检查路径错"、"文件权限(EACCES)"。

---

## 10. 附：需要人工维护的（服务器零手工的例外）

这些是机密/环境相关、必须在 GitHub Secret 里配的（agent-server 与 our-chat 各自 environment `pro`）：

- **`DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN`**（两个仓库都要）——CI push 应用镜像到 Docker Hub 用；token 选 Read & Write；镜像仓库设 public。
- **`MILVUS_COS_ENDPOINT = cos.ap-guangzhou.myqcloud.com:443`**（agent-server）——务必带 `:443`。
- 其余机密（`MILVUS_COS_*`、`OAUTH_*`、`POSTGRES_*` 等）见各自仓库的配置清单文档。

> 服务器 `.env`、私钥都由 CI 每次部署按 Secret 重新生成，所以**改这些值改 Secret，不要手改服务器**（手改下次部署会被覆盖）。
