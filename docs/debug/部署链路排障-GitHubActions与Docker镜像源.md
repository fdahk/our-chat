# 部署链路排障:GitHub Actions + 服务器 Docker 镜像源

> 一次"推 main 自动部署"从红到绿的完整排障记录。按出现顺序记三个坎:
> ① CI 读不到配置 → ② workflow 解析失败 → ③ 服务器拉不到 Docker Hub 基础镜像。
> 涉及文件:`.github/workflows/deploy.yml`、部署服务器 `/etc/docker/daemon.json`。

---

## 坎 1:CI 预检报「缺少 Variable」

**现象**(deploy 的「预检」步骤):
```
❌ 缺少 Variable:WEB_PUBLIC_ORIGIN
❌ 缺少 Variable:OAUTH_ACTIVE_KID
❌ 缺少 Variable:S3_ENDPOINT / S3_REGION / S3_BUCKET / S3_PUBLIC_BASE_URL
```

**根因**:这些值在 workflow 里用 `${{ vars.X }}`(GitHub Actions **Variables**)读取,但 environment『pro』的 **Variables 页**没配(只配了 Secrets)。GitHub 把 Secrets 和 Variables 分成两个独立页,`vars.*` 读不到 Secrets 页的值。

**决定**:不维护两套来源 —— **全部统一放 Secrets**,workflow 里不再用 `vars`。

**修复**(`deploy.yml`):所有 `${{ vars.X }}` → `${{ secrets.X }}`(含 6 个报错项 + `POSTGRES_USER`/`POSTGRES_DB`/`DEPLOY_PATH`);预检的两段循环(Secret + Variable)合并为单一 Secrets 校验;顶部"配置分层"注释同步改为"机密 + 因环境而异的非机密统一放 Secrets"。

**需要人工做的**:把这些键配到 GitHub repo → Settings → Environments → `pro` → **Secrets**(原来误放 Variables 页的删掉)。`SSH_PORT`/`DEPLOY_PATH` 不配走默认(22 / `/opt/our-chat`)。

**备注**:`POSTGRES_USER`/`POSTGRES_DB` 本不算机密,放进 Secrets 只是图"单一来源";代价是 CI 日志里会被打码,功能无影响。

---

## 坎 2:Invalid workflow file —— `secrets` 不能用于 matrix

**现象**(改完坎 1 后,workflow 直接解析失败):
```
Invalid workflow file (Line: 38, Col: 25): Unrecognized named-value: 'secrets'.
Located at position 1 within expression: secrets.WEB_PUBLIC_ORIGIN
```

**根因**:出错的 `secrets.WEB_PUBLIC_ORIGIN` 写在 `strategy.matrix.include` 里(web 条目的 `build_args`)。**`secrets` 上下文在 `strategy.matrix` 中不可用**(matrix 在 job 装配早期求值)。坎 1 之前用的是 `vars.*` —— `vars` 恰好**能**用在 matrix 里,所以那时没报解析错;一换成 `secrets` 就炸。

> 速记:`secrets` 可用于 job/step 的 `if`/`env`/`with`/`run`,但**不可用于** `strategy.matrix`、`concurrency`、`runs-on` 等 job 装配早期字段。

**修复**(`deploy.yml`):把 build-arg 移出 matrix,放到构建 step 的 `with.build-args`(step `with` 里 `secrets` 可用),按 `matrix.name` 条件注入:
```yaml
# matrix 只留 name/context,不放任何 secrets
build-args: ${{ matrix.name == 'web' && format('VITE_SERVER_ORIGIN={0}', secrets.WEB_PUBLIC_ORIGIN) || '' }}
```
`format()` 仅在 web 时拼出 `VITE_SERVER_ORIGIN=<值>`,其它服务求值为空串(build-push-action 忽略)。前提:该 job 已声明 `environment: pro`(否则 environment 作用域的 secret 读不到)。

> 多个 build-arg 时用 `|` 块标量,每个 arg 各占一行,非目标服务那行求值为空串即可。

---

## 坎 3:部署服务器拉不到 Docker Hub(i/o timeout)

**现象**(deploy 的 SSH「拉取镜像」步骤):
```
Login Succeeded                              # GHCR 正常
Image ghcr.io/.../our-chat-server  Pulling   # 三个应用镜像都在拉
Image postgres:16-alpine  Error failed to resolve reference
  "docker.io/library/postgres:16-alpine": ... dial tcp 199.59.150.40:443: i/o timeout
Image redis:7-alpine  Interrupted
Error: Process completed with exit code 1.
```

**根因**:GHCR 通(应用镜像拉到了),但基础镜像 `postgres:16-alpine`/`redis:7-alpine` 走 `registry-1.docker.io`(Docker Hub)**超时** —— 国内服务器访问 Docker Hub 受阻。这是**服务器网络层**问题,改 workflow 解决不了。

**修复**:给服务器 Docker daemon 配**镜像加速源**(对 compose 透明,不绑定到某个 mirror,不改仓库代码)。在部署服务器上(本例:`ubuntu` 用户、免密 sudo、Docker 29.6、**无现有 daemon.json**):

```bash
# 1) 写镜像源(若已有 daemon.json,需手动合并 registry-mirrors,勿整体覆盖)
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://docker.1ms.run",
    "https://dockerproxy.com"
  ]
}
EOF
# 2) 重载 + 重启 docker(会短暂重启服务器上所有容器,一次性影响)
sudo systemctl daemon-reload
sudo systemctl restart docker
# 3) 验证
docker info | grep -A4 "Registry Mirrors"          # 能看到三个 mirror
docker pull postgres:16-alpine && docker pull redis:7-alpine && echo OK
```

**验证结果**:`Registry Mirrors` 三个生效;`postgres:16-alpine`、`redis:7-alpine` 经镜像源拉取成功(原先超时的镜像现在能拉)。随后回 GitHub Actions **手动重跑 deploy**(workflow_dispatch / Re-run jobs),`docker compose pull` 不再超时。

**注意**:
- 镜像源会偶发失效,配多个备选;`docker pull` 会自动顺延尝试。某个都不通就换源。
- 若服务器原本已有 `/etc/docker/daemon.json`(配过 `data-root`/`log-opts` 等),**不要用上面的 `tee` 整体覆盖**,只把 `"registry-mirrors": [...]` 合并进去。
- 这是**一次性服务器配置**,不进 workflow(避免每次部署重启 docker + 依赖 sudo)。

**更彻底的替代**(本次未做,留作演进):把 postgres/redis 也镜像进 GHCR(`pull → retag ghcr.io/... → push`),compose 改引 GHCR 版,部署期完全不依赖 Docker Hub。

---

## 小结:排查顺序与定位法

1. **看 CI 日志在哪一步红**:预检红 → 配置缺失(坎 1);整个 workflow 不跑 → 解析错(坎 2);SSH 拉取红 → 服务器网络/镜像(坎 3)。
2. **GHCR 通而 Docker Hub 超时** = 服务器网络问题,不是 CI 配置问题 → 去服务器配镜像源,别在 workflow 里绕。
3. **GitHub Actions 上下文可用域**踩坑:`secrets` 不能进 `strategy.matrix`;拿不准就放 step 的 `with`/`env`,那里 `secrets`/`vars` 都能用。
