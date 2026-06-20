# server/ — IM 业务/信令后端（先读根 CLAUDE.md）

栈：Node + Express + Prisma + Knex + Socket.io(`@socket.io/redis-adapter`) + ioredis + JWT(`jsonwebtoken` / `jose`) + zod + bcrypt + multer/sharp。

## 命令
- 开发 `npm run dev`｜构建 `npm run build`｜类型 `npm run typecheck`｜测试 `npm test`
- 迁移(Prisma) `npm run db:migrate:dev` / `db:migrate:deploy` / `db:migrate:status` / `db:studio`；`db:generate` 生成 client

## 要点
- 本服务是 **IdP**：签发 JWT，对外提供 JWKS 公钥供下游验签（见 跨服务鉴权方案 方案D），自身不验别人签发的 token
- 实时消息走 Socket.io + Redis adapter（多实例广播）；所有入参用 zod 校验
- 完工门禁：`npm run typecheck && npm test`
