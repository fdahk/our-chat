# our-chat 本地开发编排
#
# 一键启动:  make dev
#   首次自动:建集中 env + 软链 server/.env + 装依赖 + 生成 Prisma Client + 起中间件,
#   随后并发跑 server(:3007)/ gateway(:8090)/ web(:5173),合并输出,Ctrl-C 一起停。
# 其它:      make middleware(只起中间件) · make down(停中间件) · make env(只建 env)

DEV_COMPOSE := docker/docker-compose.dev.yml
ENV_DEBUG   := docker/.env.debug

.PHONY: dev middleware down env deps

# 一键起全部:env/依赖就绪 → 起中间件 → 等 PG → 并发跑三个业务(Ctrl-C 一起退出)
dev: env deps middleware
	@printf '⏳ 等待 PostgreSQL'; \
	until docker compose -f $(DEV_COMPOSE) exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do printf '.'; sleep 1; done; echo ' ✓'
	@echo '▶ server:3007 · gateway:8090 · web:5173(Ctrl-C 全部停止)'
	@trap 'kill 0' INT TERM EXIT; \
	( cd server && pnpm dev ) & \
	( set -a; . $(ENV_DEBUG); set +a; cd gateway && go run ./cmd/gateway ) & \
	( cd web && pnpm start ) & \
	wait

# 只起中间件(postgres + redis + minio)
middleware:
	docker compose -f $(DEV_COMPOSE) up -d

# 停中间件
down:
	docker compose -f $(DEV_COMPOSE) down

# 生成集中 dev env + 软链 server/.env(幂等;test -f X || cmd = 不存在才建)
env:
	@test -f $(ENV_DEBUG) || { cp docker/.env.debug.example $(ENV_DEBUG); echo "✓ 已生成 $(ENV_DEBUG)(请填 JWT_SECRET)"; }
	@test -e server/.env  || { ln -s ../docker/.env.debug server/.env; echo "✓ 已软链 server/.env → ../docker/.env.debug"; }

# 首次装依赖 + 生成 Prisma Client(已就绪则跳过)
deps:
	@test -d server/node_modules || (cd server && pnpm install)
	@test -d web/node_modules || (cd web && pnpm install)
	@test -d server/src/generated/prisma || (cd server && pnpm db:generate)
