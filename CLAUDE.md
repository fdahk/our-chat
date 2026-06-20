# our-chat — AI 工作入口

> 全局行为约束见 `~/.claude/CLAUDE.md`。本文件只给：定位 + 服务地图 + 跨服务约束 + 各服务入口。
> 重构计划与跨服务鉴权方案文档在 **agent-server 仓库** `docs/项目重构方案/`、`docs/跨服务鉴权方案/`。

## 这是什么
实时 IM + WebRTC 音视频通话。多语言 monorepo（分支 `dev`）。

## 服务地图
| 服务 | 栈 | 说明 |
|---|---|---|
| `server/` | Node + Express + Prisma + Knex + Socket.io + Redis | 业务/信令后端（见 `server/CLAUDE.md`） |
| `gateway/` | Go 1.22 + gorilla/websocket + JWT + Prometheus | 长连接网关（见 `gateway/CLAUDE.md`） |
| `web/` | React + Redux Toolkit + antd + socket.io-client + i18next | Web 端（见 `web/CLAUDE.md`） |
| `mobile-swift/` | iOS Swift | 移动端 |

## 跨服务约束
- **鉴权走 JWKS**：our-chat 自身是 IdP（签发 JWT），下游（agent-server 等）用 JWKS 公钥验签。改鉴权先读 `跨服务鉴权方案/方案D-非对称密钥JWKS.md`。
- **重构分阶段推进，不砍既有功能**；长连接统一走 Go `gateway/`。
- 实时层：`server` 用 Socket.io(+Redis adapter 多实例广播)，`gateway` 用原生 WebSocket；消息可靠性/时序见重构方案深度篇（11–16）。
