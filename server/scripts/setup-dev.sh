#!/usr/bin/env bash
# 一键搭建本地开发环境
# 幂等:可重复执行,已就绪的步骤会被跳过

set -euo pipefail

cd "$(dirname "$0")/.."

step() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m✗ %s\033[0m\n' "$*"; exit 1; }

step '检查依赖'
command -v node >/dev/null 2>&1 || fail '缺 node(需 >= 22)'
command -v pnpm >/dev/null 2>&1 || fail '缺 pnpm(npm i -g pnpm)'
command -v docker >/dev/null 2>&1 || fail '缺 docker'
docker compose version >/dev/null 2>&1 || fail '缺 docker compose 插件'
command -v openssl >/dev/null 2>&1 || fail '缺 openssl'
ok '依赖齐全'

step '准备 .env'
if [ ! -f .env ]; then
  cp .env.example .env
  ok '从 .env.example 创建 .env(请按需调整)'
else
  ok '.env 已存在,跳过'
fi

step '生成 OAuth dev 私钥'
mkdir -p keys
if [ ! -f keys/oauth-private-dev.pem ]; then
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out keys/oauth-private-dev.pem
  chmod 600 keys/oauth-private-dev.pem
  ok '生成 keys/oauth-private-dev.pem(600 权限,已 .gitignore)'
else
  ok '已存在,跳过'
fi

step '安装依赖'
pnpm install

step '启动 PostgreSQL(Docker)'
docker compose up -d postgres
printf '等待 PG 就绪'
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U postgres -d our_chat >/dev/null 2>&1; then
    printf '\n'
    ok 'PostgreSQL 就绪'
    break
  fi
  printf '.'
  sleep 1
  if [ "$i" -eq 30 ]; then
    printf '\n'
    fail 'PG 30 秒内未就绪,检查 docker compose logs postgres'
  fi
done

step '生成 Prisma Client'
pnpm db:generate >/dev/null
ok 'Prisma Client 已生成'

step '应用 Migration'
pnpm db:migrate:deploy

step '完成'
cat <<HINT

\033[1;32m✓ 开发环境就绪!\033[0m

下一步:
  $ pnpm dev                启动 server(端口 3007)
  $ pnpm dev               看实时日志

工具:
  $ pnpm db:studio         Prisma Studio 浏览数据
  $ docker compose --profile tools up -d   起 pgAdmin(http://localhost:5050)
  $ docker compose logs -f postgres        看 PG 日志

清理 / 重置:
  $ pnpm clean:db          停 PG 并删数据卷(下次 setup-dev 会重建表)

HINT
