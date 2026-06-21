# OAuth 2.1 / OIDC IdP 模块

> our-chat server 兼任的轻量 IdP(Identity Provider)。给 agent-server 等独立 resource server 签发标准 OAuth 2.1 + OIDC access token,支持 PKCE / refresh rotation / JWKS / Discovery / Revocation / Introspection 全套。

## 设计目标

1. **生产标准实现**,不是 MVP——所有 OAuth 2.1 / OIDC Core 强制项必须有,可选项除明确标注外都做
2. **资源服务器零信任**——agent-server 永远只持公钥,任何泄漏不影响 our-chat 安全
3. **多端等价**——Web SPA / Native / 服务端 集成路径一致,皆走 `Authorization: Bearer`
4. **可观测可审计**——所有 token 签发 / 撤销 / 重用检测都有结构化日志 + 入库审计

## 关键决策一览

| 维度 | 决策 | 理由 |
|---|---|---|
| 签名算法 | RS256 | 非对称分发;后续可加 ES256(略快) |
| PKCE | 强制 + S256 only | OAuth 2.1 默认;`plain` 已废弃 |
| `state` | 强制 | 防 CSRF |
| `nonce` | 强制(OIDC scope 时) | 防 id_token 重放 |
| Refresh Rotation | 是 + family invalidation on reuse | OAuth 2.1 BCP,详见 [05-安全模型](./05-安全模型.md) |
| AT TTL | 15 min | 短到能容忍泄漏,长到避免频繁 refresh |
| RT TTL | 30 day(rolling) | 用户体验 vs 安全的平衡点 |
| `redirect_uri` 校验 | exact match,no wildcards | RFC 8252 强制 |
| Client 注册 | DB 表(`oauth_clients`) | 不写死 config,支持后续多 client |
| Discovery | 是(`.well-known/openid-configuration`) | 客户端零配置 |
| JWKS | 是(`.well-known/jwks.json`) | 多 kid 支持密钥轮换 |
| Introspection | 是(RFC 7662) | 给 confidential resource server 撤销实时反映 |
| Revocation | 是(RFC 7009) | 用户登出端点用 |
| UserInfo | 是(OIDC Core) | id_token 之外补全 claim |

## 文档清单

| 文档 | 内容 |
|---|---|
| [01-架构设计.md](./01-架构设计.md) | 角色 / 模块拆分 / 数据流 / 时序图 |
| [02-数据模型.md](./02-数据模型.md) | 三张表 schema + 索引策略 + TTL 清理 |
| [03-API契约.md](./03-API契约.md) | 全部端点的请求 / 响应 / 错误码 |
| [04-密钥管理.md](./04-密钥管理.md) | RSA 密钥对生成 / 加载 / 轮换 SOP |
| [05-安全模型.md](./05-安全模型.md) | 威胁模型 + 各类攻击的防御点 + 残留风险 |
| [06-开发规范.md](./06-开发规范.md) | 代码风格 / 错误码 / 日志 / 测试覆盖标准 |
| [07-集成指南-agent-server.md](./07-集成指南-agent-server.md) | resource server 如何对接 JWKS 验签 |
| [08-集成指南-web.md](./08-集成指南-web.md) | SPA 如何跑 PKCE 流 |

## 相关文档

- agent-server 跨服务鉴权方案总论:`agent-server/docs/backend/跨服务鉴权方案/跨服务鉴权方案分析.md`
- 本模块对应方案 F 的"our-chat 兼任 IdP"简化变体(详见 [方案 F §8](../../../../agent-server/docs/backend/跨服务鉴权方案/方案F-OAuth2授权码PKCE.md))
- 关于 RT rotation 和 session 失效的细节澄清:[方案 G §5](../../../../agent-server/docs/backend/跨服务鉴权方案/方案G-BFF会话.md)
