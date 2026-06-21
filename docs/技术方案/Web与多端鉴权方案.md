# Web 与多端鉴权方案:业界实践与本项目选型

本文系统梳理浏览器 SPA + 原生移动端 + 下游服务共用一套后端时,**令牌存放、传递、
防护、跨端统一**的主流方案,逐个分析其机制与权衡,最后落到 our-chat 的现状评估与
演进建议。

## 0. 一个必须先澄清的前提

**CORS、SameSite cookie、同源策略都是「浏览器」概念。原生 App(iOS/Android)不受
它们约束**——原生 HTTP 客户端不做 CORS 预检、没有 SameSite 限制、没有"第三方
cookie 封杀"。

这条决定了多端选型的底层逻辑:**浏览器侧的麻烦(CORS/cookie 限制)对移动端根本不
存在**;移动端天然适合 `Authorization: Bearer` + 安全存储。所以"web 用什么"和"mobile
用什么"是两个可以独立决策、共享同一后端的问题,不是非此即彼。

---

## 1. 浏览器侧:令牌存放与传递

浏览器要解决两件事:token **存哪**、请求时怎么**带**。四种主流做法,核心差异在
**抗 XSS** 与 **抗 CSRF**。

### 1.1 localStorage / sessionStorage + `Authorization: Bearer`
- **机制**:登录拿到 token 存 `localStorage`,每次请求 JS 手动加 `Authorization` 头。
- **抗 XSS**:✗ 最弱。`localStorage` JS 可读,一旦 XSS,token 直接被读走外带。
- **抗 CSRF**:✓ 天然免疫。token 不是浏览器自动带的,攻击者站点无法让它带上。
- **跨域**:✓ 简单。Bearer 头跨域无 cookie 那套限制(CORS 配好即可)。
- **适用**:多端/开放 API、对 XSS 有较强其他防护(强 CSP)的场景。**纯 Web 不推荐
  单用**——XSS 失窃面太大。

### 1.2 非 HttpOnly cookie(JS 可读 cookie)
- 等于"换个地方的 localStorage":JS 能读 → 同样 XSS 可失窃,且 cookie 自动带 → 还
  多了 CSRF 风险。**两头不讨好,基本不用**。

### 1.3 HttpOnly + Secure + SameSite cookie （our-chat web 现状）
- **机制**:服务端 `Set-Cookie` 下发,标 `HttpOnly`(JS 读不到)、`Secure`(仅
  HTTPS)、`SameSite`;浏览器自动随同源/同站请求携带。
- **抗 XSS**:✓ 强。JS 读不到 token,XSS 偷不走(但 XSS 仍可"借浏览器之手"发请求,
  见 1.5)。
- **抗 CSRF**:✗ 需额外防护。cookie 自动携带 → 攻击者站点可诱发"带着你 cookie 的
  请求"。必须配 SameSite + CSRF token(见 §5.1)。
- **跨域**:✗ 受限。跨站要 `SameSite=None; Secure`,且受第三方 cookie 封杀影响 →
  **强烈倾向同源部署**(见 §3.1)。
- **适用**:自家 Web + 同源后端。**安全性优于 localStorage**,是浏览器侧首选。

### 1.4 In-memory access token + HttpOnly refresh cookie（silent refresh）
- **机制**:access token 只存 JS 内存变量(不落 `localStorage`),刷新页面即丢;
  用一个 HttpOnly 的 refresh cookie 静默换新 AT。
- **抗 XSS**:✓✓ 最强组合之一。AT 不落持久存储(XSS 抓取窗口极小),RT 在 HttpOnly
  cookie 里读不到。
- **抗 CSRF**:RT 走 cookie → refresh 端点仍需 CSRF/SameSite 防护。
- **复杂度**:高(要处理刷新竞态、并发请求排队、页面刷新重新静默登录)。
- **适用**:对 XSS 极敏感、愿付复杂度的高安全 Web 应用。

### 浏览器侧四方案对比

| 方案 | 抗 XSS | 抗 CSRF | 跨域友好 | 复杂度 | 一句话 |
|---|---|---|---|---|---|
| localStorage + Bearer | ✗ | ✓ | ✓ | 低 | 简单但 XSS 怕失窃 |
| 非 HttpOnly cookie | ✗ | ✗ | ✗ | 低 | 两头不讨好,别用 |
| HttpOnly+SameSite cookie | ✓ | 需 CSRF | ✗(倾向同源) | 中 | 自家 Web 首选 |
| 内存 AT + RT cookie | ✓✓ | 需 CSRF | ✗ | 高 | 高安全场景 |

---

## 2. 架构层:前端与 API 怎么摆

### 2.1 同源反向代理 + cookie （our-chat web 现状）
SPA 静态资源与 API **挂同一个 origin**,由反向代理(nginx)内部转发 `/api`。对浏览器
全是同源 → cookie 自动带(`SameSite=Lax` 即可)、无 CORS 预检、不碰第三方 cookie。
- **优点**:cookie 方案的所有跨站坑一次消除;HttpOnly 抗 XSS 白嫖;运维简单。
- **缺点**:只服务"浏览器经反代访问"的场景;对原生端无意义(原生不走反代同源)。

### 2.2 BFF(Backend-for-Frontend)
为前端单独建一个后端中间层:**BFF 持有真正的 token(服务端),只给浏览器下发会话
cookie**;浏览器永远拿不到 token,BFF 在转发时把 cookie 翻译成 Bearer 调下游。
- **优点**:浏览器侧零 token,XSS 失窃面最小;IETF《OAuth for Browser-Based Apps》
  推荐方向。§2.1 的"同源反代"是 BFF 的轻量形态。
- **缺点**:多一层服务要维护;BFF 需管理 token 生命周期。

### 2.3 前后端分离 + CORS + Bearer
前端、API 不同源,前端用 Bearer 头跨域调 API,服务端配 CORS。
- **优点**:前后端彻底解耦,API 天然服务多端/多域/第三方;无 CSRF(Bearer 非自动带)。
- **缺点**:token 一般落 `localStorage` → XSS 风险;CORS 配置心智负担。

### 2.4 API 网关统一鉴权（规模化形态）
大规模下,"同源/鉴权"不再是每个应用塞 nginx,而是**共享域名 + API 网关 / Ingress /
CDN**:网关统一做 TLS 终止、令牌校验、限流、路由。§2.1 的 nginx 就是它的自托管雏形。

---

## 3. 会话与令牌体系

### 3.1 服务端 Session(有状态) vs JWT(无状态)
- **Session**:服务端存会话,cookie 只放 sid。易撤销(删服务端记录即失效),但需共享
  会话存储(Redis),横向扩展依赖它。
- **JWT**:自包含、无状态、可被任意副本/下游本地验签;**但难即时撤销**(签出去就有效
  到过期)→ 必须配短 TTL + refresh + 黑名单/版本号等补偿。

### 3.2 Access Token + Refresh Token 轮换
- 短命 **AT**(分钟级)+ 长命 **RT**(天级);AT 过期用 RT 换新。
- **RT 轮换 + reuse detection**:每次刷新换新 RT 并作废旧的;若旧 RT 被再次使用(说明
  被盗用),整条令牌家族失效。这是 OAuth 2.1 的推荐实践。

### 3.3 OAuth 2.1 / OIDC + JWKS（多服务/下游)
- IdP 用**非对称密钥**签 JWT,对外暴露 **JWKS 公钥**;下游服务用公钥本地验签,无需
  回调 IdP、不共享私钥。配合 `kid` 滚动轮换。
- 适用"一个 IdP,多个资源服务"的体系。

---

## 4. 横切防护(任何方案都要)

### 4.1 CSRF(cookie 方案必做)
cookie 自动携带 → 必须防 CSRF,三种手段常组合:
- **SameSite**:`Lax`(默认,挡跨站子请求)/ `Strict`(更严)/ `None`(放开,需 Secure)。
- **双提交 token(double-submit)**:变更请求带 `X-CSRF-Token` 头,值与一个可读 CSRF
  cookie 一致。攻击者能让浏览器带 cookie,但跨域读不到该值、也设不了自定义头。
  *注意*:若攻击者能在子域写 cookie,double-submit 可被绕过;更强的是
  **synchronizer token**(服务端会话绑定)。
- **Origin/Referer 校验**:辅助。

### 4.2 XSS(token 方案核心)
- **CSP**:限制脚本来源,降低注入执行面。
- **HttpOnly**:令牌不被 JS 读。
- 输入校验 + 输出转义。
- 提醒:HttpOnly 防"读 token",但防不住"XSS 借浏览器之手发请求"——所以 CSP + 短 TTL
  仍重要。

### 4.3 令牌生命周期
短 AT + 长 RT + 轮换 + 可撤销 + JWKS `kid` 轮换 + 登出清服务端态。

---

## 5. 多端(Web + Mobile)共用一套服务:怎么落地

前提(§0):原生 App 不受 CORS/SameSite 约束,**天然用 Bearer + 安全存储**
(iOS Keychain / Android Keystore),不需要、也不适合套 cookie/同源那套。

于是统一后端只需提供**两道前门**,共享同一套用户体系与令牌签发:

| 客户端 | 前门 | 令牌存放 | CSRF |
|---|---|---|---|
| 浏览器 Web | 同源 + HttpOnly cookie | 浏览器 cookie jar | 需(双提交/SameSite) |
| 原生 Mobile | `Authorization: Bearer` | Keychain/Keystore | 不需要(Bearer 非自动带) |
| 第三方/下游 | Bearer(OAuth+JWKS) | 各自保管 | 不需要 |

两种实现模式:

- **模式 A — Token-first API + BFF for Web**:API 只认 Bearer;移动端/下游直连;Web 走
  BFF,BFF 服务端持 token、对浏览器只给 cookie。最"干净"、安全性最高,但要维护 BFF。
- **模式 B — Dual-accept API**:同一鉴权中间件**同时接受两种凭证**——请求带
  `Authorization: Bearer` 就按 Bearer 验签(免 CSRF);否则回退读 cookie(并校验
  CSRF)。实现最轻,落地最快;代价是要把两条路径的安全语义都写对。

> 关键结论:**"多端共用后端" ≠ "必须放弃 cookie/同源"**。cookie/同源是给 Web 客户端
> 的安全优化,移动端走 Bearer 直连同一后端即可,两者并存。

---

## 6. our-chat 现状评估与建议

### 6.1 现状(代码事实)
- **Web API**(`authenticateToken`):**仅从 HttpOnly cookie 取 token,显式不信任
  `Authorization` 头**;变更类请求做**双提交 CSRF 校验**(已实现)。
- **登录**:`Set-Cookie` 下发 token cookie + CSRF cookie,带 maxAge(记住我)。
- **网关 WS**:握手时从 **cookie** 取 token(浏览器经 nginx 同源握手,cookie 自动带)。
- **下游/IdP**:已具备 **OAuth 2.1 / OIDC + JWKS**、JWT 签发、**RT 轮换 + reuse
  detection**。
- **部署**:nginx 同源反代(§2.1)。

对照本文:**Web 侧采用的是"同源 + HttpOnly cookie + 双提交 CSRF",是浏览器侧的
稳妥首选,并且 CSRF 已正确落地**——不是不合理,反而比"localStorage 裸 Bearer"更稳。

### 6.2 多端规划下,当前架构合理吗?
**结论:不是不合理,也不需要重构;但有一个明确缺口要补。**

- 缺口:**Web API 目前是 cookie-only,主动拒收 `Authorization` 头**。原生移动端不走
  浏览器同源、不适合套 cookie,直接被这条挡在外面。
- 但这**不是架构错误**,只是"只开了 Web 这道前门、还没开 Bearer 那道前门"。而且
  令牌地基(IdP / JWT 签发 / JWKS / RT 轮换)**已经齐了**——补前门是增量,不是推倒。

### 6.3 建议演进路径(从小到大)
1. **鉴权中间件改 dual-accept(模式 B)**:`authenticateToken` 先看
   `Authorization: Bearer`——有则按 Bearer 验签(**这条不校验 CSRF**,因为 Bearer 非
   浏览器自动携带);没有则回退现有 cookie + CSRF 路径。Web 完全不动,移动端即可用。
2. **移动端**:AT/RT 存 Keychain/Keystore;`Authorization: Bearer` 调用;AT 过期用 RT
   静默刷新(复用现有 RT 轮换 + reuse detection)。
3. **网关 WS 握手兼容 Bearer**:当前只读 cookie;为原生端补充从 query 或
   `Authorization` 取 token(原生 WS 无 cookie jar)。
4. **Web 维持现状**:同源 + HttpOnly cookie + 双提交 CSRF,不改。
5. (可选,长期)若 Web 安全要求升级,再考虑模式 A 的 BFF / 内存 AT + RT cookie。

### 6.4 一句话
当前架构在"自家 Web"维度是对的且偏稳;面向多端,**只需把后端从"cookie-only"扩成
"cookie(Web)+ Bearer(Mobile/下游)双前门"**,令牌体系已就绪,属增量演进而非重构。
