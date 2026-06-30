#!/usr/bin/env bash
# 实际的本地构建 + 滚动重启。由 ci-deploy.sh 以 setsid 脱离 SSH 会话后台调用。
# 为何脱离会话:runner(海外)→服务器(国内)的 SSH 在几分钟长构建期间(尤其拉基础镜像时控制通道静默)
# 易被 GFW 重置;build 一旦脱离会话,即便 SSH 断了也能跑完(实测会话断后 build 仍在服务器续跑)。
# 依赖 WEB_PUBLIC_ORIGIN(web 构建期 build-arg)从环境继承。--progress plain 让日志逐行可读(写入 deploy.log)。
set -euo pipefail
cd "$(dirname "$0")"
docker compose -f docker-compose.prod.yml build --progress plain
docker compose -f docker-compose.prod.yml up -d --remove-orphans
docker image prune -f
