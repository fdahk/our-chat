# gateway/ — Go 长连接网关（先读根 CLAUDE.md）

栈：Go 1.22 + gorilla/websocket + golang-jwt v5 + prometheus client。

## 要点
- 职责：承载 WebSocket 长连接、JWT 验签、消息转发；运行指标走 Prometheus。
- JWT **只验签不签发**，对齐 `server` 的 JWKS（公钥验签）。
- 完工门禁：`go build ./... && go test ./...`（gofmt 已由 PostToolUse hook 自动跑）。
