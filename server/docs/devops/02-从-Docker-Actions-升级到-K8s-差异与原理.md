# 02 · 从 Docker + Actions 升级到 K8s ── 差异、收益与底层原理

> 当前栈:`GitHub Actions(build)→ GHCR(image)→ Docker Compose / 手工 docker run(runtime)`
> 目标栈:`GitHub Actions(build only)→ GHCR → Kubernetes(runtime + lifecycle + orchestration)`
> 本文回答:具体差什么、解决什么问题、底层原理是什么、本地 K8s 跟生产 K8s 差在哪。

---

## 1. 当前模式的工作模型(数学化)

抽象后:

```
Actions:      source ──build──► image
Docker:       image ──run─────► process(单容器)
Compose:      image set ──up──► process set(单机多容器,启动序由 depends_on 决定)
```

部署一个 server 到生产,我们需要解决 7 件事:

| 问题 | Docker / Compose 怎么答 | 是否够 |
|---|---|---|
| 进程崩了怎么办 | `restart: unless-stopped`(docker daemon 重启容器) | 单机够,机器挂了完蛋 |
| 多副本横向扩展 | 不能(compose 是单机) | ❌ |
| 流量怎么进来 | 自己装 nginx / Caddy 手工 reverse proxy | ⚠ 手工,易漂移 |
| 配置 / 密钥注入 | env / volume,手工 | ⚠ 不声明、不审计 |
| 跨机器调度 | 不能 | ❌ |
| 零宕机升级 | `docker stop && docker pull && docker run`,有秒级窗口 | ❌ |
| 故障自愈 | 机器挂 = 服务挂 | ❌ |

**Compose 是单机进程管理器,本质上是"docker run + 启动序声明"的封装。** 一旦业务要做多副本 / 跨机器 / 零宕机,Compose 模型直接破产。

---

## 2. K8s 的底层模型:声明式 API + 控制循环

K8s **不是"更高级的 docker run"**,而是**期望状态驱动的分布式协调系统**。理解这一句话比理解 100 个 kubectl 命令重要。

### 2.1 模型

```
你提交一份 YAML 说:"我要 3 个 nginx Pod 在 80 端口提供服务"
                          │
                          ▼ kubectl apply
                  ┌─────────────────┐
                  │ kube-apiserver  │ ← 唯一入口,REST API
                  └────────┬────────┘
                           │ 写入
                           ▼
                       ┌───────┐
                       │ etcd  │ ← 唯一真相源,一致性数据库
                       └───┬───┘
                           │
                           │ watch(长连接)
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
    ┌──────────────┐ ┌──────────┐ ┌───────────┐
    │ ReplicaSet   │ │Scheduler │ │ kubelet   │
    │ Controller   │ │          │ │ (每节点) │
    └──────┬───────┘ └────┬─────┘ └─────┬─────┘
           │ 比较期望 vs 实际,差异就 reconcile
           ▼
       少 1 个 → 创建 Pod 对象
                     │
                     ▼
               Scheduler 给它选个节点
                     │
                     ▼
               kubelet 在节点上拉镜像、起容器
```

### 2.2 三条底层原理

#### 原理 1:声明式而非命令式

| 命令式(Docker) | 声明式(K8s) |
|---|---|
| `docker run -d --name nginx nginx:latest` | `apiVersion: apps/v1\nkind: Deployment\nspec:\n  replicas: 3` |
| 你说"现在做这件事" | 你说"我想要这个状态长期成立" |
| 没人帮你维持 | Controller 持续驱动到该状态 |
| 节点挂了容器没了 | 节点挂了 Controller 自动在别处重起 |

声明式让"运维状态"变成 Git 可 review 的 YAML,而不是 SSH 历史里的命令。**GitOps 全建立在此基础上**。

#### 原理 2:控制循环(Reconciliation Loop)

每个 Controller 是一个无限循环:

```
while true:
  desired = etcd.read("我要什么状态")
  actual  = api.read("当前是什么状态")
  if desired != actual:
    api.fix(desired - actual)
  sleep(short_interval)
```

这就是为什么 K8s 故障自愈:
- 节点宕机 → Pod 实际状态消失 → ReplicaSet Controller 发现少了 → 创建新 Pod → Scheduler 调度到健康节点 → kubelet 起容器
- 全程**无需人介入**,且**幂等**(重复 reconcile 不会出错)

Docker 没这层,**容器死了就死了**(`restart: always` 只在原机器重启,机器挂了无解)。

#### 原理 3:扁平的资源 API

K8s 把所有运维概念抽象成 **resource**,每种 resource 有自己的 Controller:

| Resource | Controller 干的事 |
|---|---|
| `Pod` | kubelet 在节点上跑容器 |
| `ReplicaSet` | 维持 N 个 Pod 副本 |
| `Deployment` | 滚动升级 ReplicaSet,旧 ReplicaSet → 新 ReplicaSet |
| `Service` | 把流量从虚拟 IP 路由到匹配标签的 Pod |
| `Ingress` | 把外部 HTTP 路由到 Service(由 Ingress Controller 实现) |
| `ConfigMap / Secret` | 注入配置 / 凭据到 Pod |
| `PersistentVolumeClaim` | 申请存储,由 CSI driver 满足 |
| `Job / CronJob` | 一次性 / 定时任务 |
| `HorizontalPodAutoscaler` | 根据 CPU / 自定义指标自动扩缩 |

**Custom Resource Definition (CRD)** 允许你定义自己的 resource + Controller,这就是 ArgoCD / cert-manager / Prometheus Operator 的实现基础。**Operator pattern 让"运维知识"也变成代码**(你可以写一个 Controller 自动管理 PG 集群的备份 / failover)。

Docker 没这个抽象。Docker 的世界就是"容器 + 网络 + 卷",任何高阶概念(自愈 / 扩缩 / 升级策略)都要在外面写脚本。

---

## 3. 4 个常见认知偏差(把直觉理解修正过来)

刚接触 K8s 时,工程师最常用以下心智模型理解:

> 「K8s 是单独跑在一个服务器上的服务,拿着 yml 声明文件,根据指定好的配置和地址,去其他服务器上拉起相应的服务并保持长连接监听运行状况。」

**方向对一半,但有 4 处关键偏差,这些偏差恰好是 K8s 设计的精髓**。一一拆解:

### 偏差 ① "K8s 拿着 yml 文件"

**实际上 K8s 内部不持有任何 yml 文件**。yml 是外部输入:

```
你的笔记本 ──kubectl apply -f xxx.yml──► apiserver ──存到──► etcd
                                                              ↓
                                          之后 K8s 只看 etcd,yml 文件用完即弃
```

**K8s 的"真相源"是 etcd 里的对象状态**,不是 yml 文件。你也可以用 Web UI / SDK / Terraform / ArgoCD 等任何方式提交期望状态,本质完全等价 ── 全部最终落到 etcd。

**后果**:理解了这点,**GitOps 就直觉自洽** ── yml 在 Git 里,ArgoCD 持续把"Git 状态"同步到"etcd 状态",etcd 才是 K8s 真正消费的。

### 偏差 ② "根据指定好的地址"

**K8s 用户绝对不指定地址**。这是声明式哲学的核心体现:

| 你说 | 你不说 |
|---|---|
| "我要 3 个 nginx 副本,每个 256MB RAM" | "在 192.168.1.5 起 nginx-1,在 192.168.1.6 起 nginx-2" |
| "我要 1 个 PG,挂 10GB SSD 存储" | "PG 跑在 node-3,卷挂 /mnt/data" |
| "我要这些 Pod 分布在不同可用区" | "Pod-1 在 az-a,Pod-2 在 az-b" |

地址由 **Scheduler** 自动选 ── 看每个节点剩余 CPU/RAM / 亲和性 / 反亲和性 / 污点容忍 / 拓扑分布 / Pod 优先级 等数十个约束做装箱决策。

Pod 死了被换到别的节点 → IP 全变 → **对应用透明**(应用看到的是 Service 虚拟 IP,不是 Pod 真实 IP)。

**后果**:理解了这点,**Service / Ingress / HPA / Affinity 的设计意图**就清楚 ── 全是为"用户不指定地址"这个约束服务的。

### 偏差 ③ "去其他服务器上拉起服务"(方向反了)

**不是 control plane 推到 worker,是 worker 主动拉**:

```
            ┌─────────────────────────┐
            │   control plane node    │
            │   ┌──────────────┐      │
            │   │ apiserver    │ ◄────┼─── 被动等连接,不主动 push
            │   │ etcd         │      │
            │   │ scheduler    │      │
            │   │ controller-* │      │
            │   └──────┬───────┘      │
            └──────────┼──────────────┘
                       │
                       │ 长连接(watch),节点主动建立
                       │ ← ── ← ── ← ── ← ──
              ┌────────┼─────────┐
              │        │         │
        ┌─────▼────┐┌──▼───┐┌────▼───┐
        │ Node 1   ││Node 2││ Node 3 │
        │ kubelet  ││kubelet││kubelet│  ← 每个节点常驻 daemon
        │ "我节点  ││  ……  ││  ……   │  ← 问 apiserver:
        │  跑啥?" ││      ││       │     "这节点应该跑哪些 Pod?"
        │ containerd││...  ││ ...    │  ← 拿到 Pod spec → 拉镜像 → 起容器
        └──────────┘└──────┘└────────┘
```

每个 worker 节点跑一个 daemon 叫 **kubelet**,**主动**跟 apiserver 建 watch 长连接,问"我节点应该跑哪些 Pod"。apiserver 把对应 Pod spec 推过来,kubelet 在本机调 container runtime(containerd / CRI-O)拉镜像、起容器、上报状态。

#### 为什么是 pull 而不是 push

| 设计点 | 收益 |
|---|---|
| 节点可以在 NAT / 防火墙后 | 只需节点能出网到 apiserver,不需要 control plane 能直连节点。**边缘节点 / 混合云 / 私有 IP 节点都能加入** |
| 节点故障重连不需中央管理 | kubelet 重启自己重建 watch,control plane 不维护"哪些节点活着"的连接表 |
| 水平扩展 | 新节点启动自己来"自注册"(`kubeadm join` 或 K3s agent 启动),control plane 不需要管拓扑 |

**后果**:理解了"节点自报到"这点,**为什么 K8s 跨防火墙 / 边缘节点 / 多云方便,为什么节点加入只需一行命令** 就都通了。

### 偏差 ④ "声明文件 + 去拉起" 隐含的命令式心智

上面那句总结隐含的模型是:**"系统拿着指令清单跑去各处执行一遍。"** 这是命令式的、一次性的。

K8s 是**声明式 + 持续控制循环**:

```
while true:
  期望状态 = etcd.read()          ← 你的 yml 变成的对象
  实际状态 = apiserver.read()     ← kubelet 持续上报
  if 期望 != 实际:
    apiserver.write(差异操作)
                ↓ watch 推送
              kubelet 看到自己节点多/少了 Pod
                ↓
              containerd 起/停容器
                ↓
              kubelet 报新状态回 apiserver
  ── 继续下一轮 ──
```

**没有"一次性下发"这回事**。Controller 永远在跑,持续比对、持续修复。你 yml 提交完就走了,K8s 在背后一直跑这个 reconcile 循环。

**后果**:理解了"reconcile 是无限循环",**为什么 K8s 自愈 / 滚动升级 / 扩缩 / Operator / GitOps 都是同一个模式的延伸** 就全通了 ── 都是"声明期望状态,Controller 持续驱动"。

### 修正后的"K8s 本质一句话"

> **K8s 是一组跑在 control plane 节点的服务**(apiserver / etcd / scheduler / controller-manager),**接受用户用 yml/API 提交的"期望状态"声明,存到 etcd。每个 worker 节点的 kubelet daemon 主动跟 apiserver 建 watch 长连接,认领自己节点该跑的 Pod,本地起容器,并持续上报实际状态。多个 Controller 持续 reconcile 期望 vs 实际,差异立即修复。**

### 4 个偏差的影响一览

| 偏差 | 影响后续理解的范围 |
|---|---|
| 以为 K8s 持有 yml | 不理解 GitOps 为什么是"Git ↔ etcd 同步",ArgoCD 为什么必要 |
| 以为用户指定地址 | 不理解 Scheduler / Service / 亲和性 / 拓扑约束的价值,做 anti-pattern 设计 |
| 以为 control plane 推到节点 | 不理解为什么节点能跨防火墙加入,为什么"节点自注册"是 K8s 的扩展性来源 |
| 以为声明 = 一次性命令 | 不理解 Operator / HPA / 滚动升级 / 自愈是同一个 reconcile 模式 |

把这 4 点改过来,K8s 80% 的设计直觉自洽 ── Service / Ingress / Operator / GitOps / HPA / Argo Rollouts 都是控制循环 + 声明式 + Pull 模型的延伸。

---

## 4. 升级到 K8s,具体差什么(7 个维度对照)

### 4.1 进程生命周期管理

| | Docker / Compose | K8s | 底层原理差异 |
|---|---|---|---|
| 容器崩了 | docker daemon 重启(本机) | ReplicaSet Controller 保证 N 个 Pod | 单机 restart vs 集群级别 reconcile |
| 节点崩了 | 服务挂 | Pod 被驱逐 → Scheduler 调度到健康节点 | Controller + Scheduler 协作 |
| OOM | 容器死,daemon restart | 容器死,kubelet restart,反复 OOM 标记 `OOMKilled` 报警 | kubelet 状态机 + Event 机制 |

### 4.2 横向扩展

Docker:**只能** `docker run nginx_1 nginx_2 nginx_3 ...` 手工跑多个,跨机器无解。
K8s:`replicas: 3` 一行配置,Controller 自动维持,可以分布在多个节点上,挂了自动顶上。

底层原理:**Scheduler** 看每个 Pod 的资源 requests 和节点剩余容量,做装箱调度;有 affinity / anti-affinity / topology spread 等约束语义。

### 4.3 流量入口

| | Docker / Compose | K8s |
|---|---|---|
| 容器互通 | 同 compose network DNS | Service(虚拟 IP + DNS) |
| 单机暴露端口 | `ports: 80:80` | `Service Type: NodePort` |
| 外部 LB | 自己装 nginx 反代 | `Service Type: LoadBalancer` 云厂商自动给 LB |
| HTTP 路由(基于 host/path) | nginx config 手撸 | `Ingress` + Ingress Controller(声明式) |
| TLS | nginx + certbot 手工续 | cert-manager 自动签 + 续 Let's Encrypt |

底层原理:K8s Service 用 **iptables / IPVS / eBPF** 在每个节点写转发规则,Pod 调度到哪都能路由。Ingress Controller 是普通 Pod,watch Ingress 资源,动态改自己的 nginx config。

**关键差异**:Docker 世界你**自己**装 nginx 当 LB,容器 IP 变了你得改 config。K8s 世界 Service 是**声明的稳定虚拟 IP**,Pod IP 变了 kube-proxy 自动更新转发规则,**应用代码看到的就是固定 DNS**(`our-chat-server.production.svc.cluster.local`)。

### 4.4 配置与密钥

| | Docker | K8s |
|---|---|---|
| 注入方式 | env / volume,手工 | ConfigMap / Secret,声明式 |
| 修改后 | 重启容器 | ConfigMap 修改自动同步到 Pod 文件系统(env 形式需 rollout) |
| 密钥加密 | 自己想办法(env 通常明文) | etcd 静态加密 + RBAC 控制读权限 + Sealed Secrets / External Secrets 配合外部 KMS |
| 跨副本一致 | 手工保证 | 自动(同一个 ConfigMap 注入所有 Pod) |

### 4.5 升级策略

Docker:`docker stop && docker pull && docker run`。**秒级宕机**,无法 Canary。

K8s 内建三种(Deployment 控制器实现):
- **RollingUpdate**(默认):新 ReplicaSet 起一个 → 老 ReplicaSet 减一个,直到全部替换。期间 readiness 探针保证只有 ready 的 Pod 收流量。**真正零宕机**。
- **Recreate**:全停再全起(DB schema 不兼容时用)。
- **Blue-Green / Canary**:用 Argo Rollouts 扩展。

底层原理:Deployment Controller 管理两个 ReplicaSet(旧/新),按 `maxSurge` 和 `maxUnavailable` 参数严格控制。新 Pod 通过 readiness probe 才进 Service 后端列表,旧 Pod 通过 `terminationGracePeriodSeconds` 优雅退出。

### 4.6 存储

| | Docker | K8s |
|---|---|---|
| 持久卷 | `volume`(本机目录) | PersistentVolumeClaim(申请存储) |
| 跨机器 | 不行,容器调度到新机器后数据没了 | PV 由 CSI driver 提供(云盘自动 attach 到 Pod 所在节点) |
| 多类存储 | 自己挂 | StorageClass 抽象不同后端(SSD / HDD / 跨可用区) |

### 4.7 资源管理

| | Docker | K8s |
|---|---|---|
| 限 CPU/RAM | `--cpus --memory`(本机) | `resources.requests` + `limits` |
| 装箱调度 | 没有,你自己决定哪个容器跑哪台机器 | Scheduler 按 requests 装箱 |
| 自动扩缩 | 没有 | HorizontalPodAutoscaler 看指标自动 +/- 副本数 |

底层原理:**requests** 是调度时的资源预订(Scheduler 用),**limits** 是 cgroups 实际的硬上限(超 RAM 立刻 OOMKilled,超 CPU 被节流)。

---

## 5. K8s 解决的"7 个问题"对照表

回到 §1 那 7 个问题:

| 问题 | Docker 答 | K8s 答 | 收益 |
|---|---|---|---|
| 进程崩了 | restart(本机) | ReplicaSet 集群级保证 | 节点挂也能恢复 |
| 多副本 | 不能 | replicas 一行 | 无限横向 |
| 流量入口 | 手撸 nginx | Ingress 声明 | 配置进 Git,可 review |
| 配置/密钥 | env(漂移) | ConfigMap/Secret(声明) | 跨副本一致 + 可审计 |
| 跨机器 | 不能 | Scheduler 自动 | 容量边界由集群规模决定 |
| 零宕机升级 | 不能 | RollingUpdate 内建 | 业务连续性 |
| 故障自愈 | 不能 | Controller 持续 reconcile | 半夜节点挂了不用爬起来 |

---

## 6. 升级的"代价"(诚实账)

不全是收益,K8s 引入新成本:

| 成本 | 程度 |
|---|---|
| 学习曲线 | 需要理解 5-10 个核心 resource + 控制循环模型,~2-3 周到能写正确 YAML |
| 工具链复杂度 | kubectl / Helm / Kustomize / ArgoCD,生态大但碎 |
| 调试复杂度 | "Pod 没起来"可能是 image pull / 资源不足 / 探针失败 / 网络 / Secret 缺等十几种原因,要会看 `describe / events / logs` |
| 运维门槛 | 自管 K8s 控制平面是真活(故 99% 用云托管或 K3s) |
| 资源开销 | K3s ~ 300MB RAM,vanilla K8s ~ 1-2GB control plane,小机器吃力 |
| YAML 膨胀 | 一个简单服务 100+ 行 YAML,Compose 20 行能搞定 |

**对 our-chat 这种规模的真实判断**:
- 单机演示 → Compose 够,不必上 K8s
- 想学 / 校招 portfolio / 想体验完整生产范式 → 上 K8s 收益大
- 真要给真用户跑 → 上 K8s(尤其是 K3s 起步,门槛低)

---

## 7. 本地 K8s vs 部署 K8s ── 差异详表

**API、kubectl、YAML、所有工具完全一致。** 差异仅在底层 infra:

| 维度 | 本地(kind / OrbStack / Docker Desktop K8s) | 生产(EKS / GKE / DOKS / 自管 K3s) |
|---|---|---|
| **节点** | 1 个(或 kind 容器假节点) | 多个真节点,跨 AZ |
| **`Service Type: LoadBalancer`** | 不工作(没云 LB)── 用 `port-forward` / NodePort / metallb 模拟 | 云厂商自动给一个公网 IP |
| **`Ingress`** | 装 ingress-nginx 自己跑,通过 localhost 访问 | 走真域名 + DNS + 真 LB |
| **TLS** | mkcert 假证书 或 cert-manager + 内网 CA | cert-manager + Let's Encrypt + 真域名 |
| **PV(持久卷)** | hostPath / local-path-provisioner(本机目录) | 云盘 CSI(EBS / GCE PD / Azure Disk) |
| **跨节点 Pod 调度** | 单节点,Scheduler 没得选 | 真的跨节点装箱 |
| **节点故障容错** | 没法演示(只有一个节点) | 节点挂了 Pod 自动迁移 |
| **HorizontalPodAutoscaler** | 能配,但单机节点资源有限 | 配合 Cluster Autoscaler 真正弹性扩缩 |
| **网络** | CNI 跑在 Docker 里(kind)/ VZ 虚拟机(OrbStack) | 真 overlay 网络(Calico / Cilium / 云原生) |
| **可观测性** | 装得起 Prometheus + Grafana + Loki,看自己集群 | 同样,但数据量大 / 多 namespace |

### 7.1 YAML 95% 一致,差异用 Kustomize overlay

```
k8s/
├── base/                          ← 通用部分,本地+生产都用
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   └── kustomization.yaml
└── overlays/
    ├── local/                     ← 本地差异
    │   ├── kustomization.yaml     ← Service 改 NodePort,Ingress host 改 localhost
    │   └── patches.yaml
    └── production/                ← 生产差异
        ├── kustomization.yaml     ← Service 改 LoadBalancer,replicas: 3,resources 更大
        └── patches.yaml
```

`kubectl apply -k k8s/overlays/local`(本地)/ `kubectl apply -k k8s/overlays/production`(生产)。

### 7.2 工作流闭环

```
本地 kind 开发     ✓ 改 YAML,kubectl apply,看效果
       ↓
CI(GHA + kind)   ✓ build → push GHCR → 在 GHA 起 kind 跑 e2e
       ↓
生产(K3s/DOKS)   ✓ ArgoCD 看 Git 仓库,自动 reconcile,你只 push 不部署
```

**学一次,4 个环境通用**。Docker Compose 的工作流则在 dev / prod 之间有明显割裂。

---

## 8. 演进路径具象化(从当前栈到 K8s)

### 现状(已有)
```
.github/workflows/ci.yml          typecheck + test + docker build 验证
.github/workflows/cd.yml          push main / tag → 多架构 build → 推 GHCR
Dockerfile                        多阶段:deps / dev / build / runner
docker-compose.yml                单机 server + postgres
docker-compose.dev.yml            dev override(bind mount + 热重载)
```

### Step 1:把 docker-compose.yml 改写成 K8s YAML

```yaml
# k8s/base/deployment.yaml(对应 compose 的 server service)
apiVersion: apps/v1
kind: Deployment
metadata: { name: server }
spec:
  replicas: 2                              # ← Compose 不能做
  selector: { matchLabels: { app: server } }
  template:
    metadata: { labels: { app: server } }
    spec:
      initContainers:
        - name: migrate                    # ← 解决 docs/database/05 的反模式
          image: ghcr.io/fdahk/our-chat-server:latest
          command: ['npx', '--no-install', 'prisma', 'migrate', 'deploy']
          envFrom: [{ secretRef: { name: db-secret } }]
      containers:
        - name: server
          image: ghcr.io/fdahk/our-chat-server:latest
          ports: [{ containerPort: 3007 }]
          envFrom:
            - { secretRef: { name: db-secret } }
            - { secretRef: { name: app-secret } }
          volumeMounts:
            - { name: keys, mountPath: /app/keys, readOnly: true }
          readinessProbe:
            httpGet: { path: /health, port: 3007 }
          livenessProbe:
            httpGet: { path: /health, port: 3007 }
          resources:
            requests: { cpu: 100m, memory: 256Mi }
            limits:   { cpu: 1000m, memory: 1Gi }
      volumes:
        - name: keys
          secret: { secretName: oauth-keys }
---
# k8s/base/service.yaml(替代 compose 的 ports: 3007:3007)
apiVersion: v1
kind: Service
metadata: { name: server }
spec:
  selector: { app: server }
  ports: [{ port: 80, targetPort: 3007 }]
---
# k8s/base/postgres-statefulset.yaml(替代 compose 的 postgres service)
# 生产建议改用云托管 PG,本地用 StatefulSet
```

### Step 2:CI/CD 改造

```yaml
# .github/workflows/cd.yml 末尾改成
- name: Update image tag in infra repo
  run: |
    # GitOps:不直接 kubectl apply,而是改 infra repo 的 image tag
    cd infra
    yq -i '.spec.template.spec.containers[0].image = "ghcr.io/.../our-chat-server:${{ github.sha }}"' \
      k8s/overlays/production/deployment-patch.yaml
    git commit -am "deploy: $GITHUB_SHA" && git push
```

ArgoCD 在生产集群里 watch infra repo,看到 commit 自动 reconcile。

### Step 3:本地开发用 kind / OrbStack

```bash
# 一次性:装 kind / OrbStack
brew install kind
kind create cluster --config k8s/kind-config.yaml

# 装 ingress-nginx + cert-manager + ArgoCD(本地全套)
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/...

# 改代码 → 构建本地镜像 → kind load → kubectl rollout
docker build -t server:dev .
kind load docker-image server:dev
kubectl rollout restart deployment/server
```

或者更顺畅:用 **Tilt / Skaffold** 自动监听代码变化,自动 build + kind load + rollout,**等价于本地 docker compose dev 的热重载体验**,但用的是 K8s。

---

## 9. 关键认知(一句话总结)

- **Docker** 是单机进程管理器(容器化的 systemd)
- **Compose** 是单机多容器编排器(容器化的 systemd unit set)
- **K8s** 是分布式声明式协调系统,**核心是 Controller + 控制循环 + Resource API**,故能跨机器、自愈、声明式升级 / 配置 / 扩缩

升级到 K8s 不是"换个工具",是**换一个心智模型** ── 从"我执行命令"到"我声明状态,系统持续驱动"。这层心智上的转变想清楚后,后续所有 K8s 概念(Operator / GitOps / Service Mesh)都是同一个模式的延伸。

**本地 K8s 跟生产 K8s 是同一个 K8s,差异仅在底层 infra(节点数 / 真 LB / 云存储 / 真域名),YAML 95% 通用。一次学完,4 个环境通吃。** 这是 K8s 生态压倒 Docker Compose 的最大武器。
