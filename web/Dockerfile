# 构建阶段:编译前端静态产物
# 用 Debian 基镜(非 alpine)规避 sass-embedded 在 musl 上的原生二进制兼容问题
FROM node:22 AS builder
WORKDIR /app
RUN npm install -g pnpm@10
# 先拷依赖清单,利用层缓存
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# 运行阶段:nginx 托管静态资源 + 反向代理
# nginx 配置不烤进镜像,改由 compose 从 docker/nginx/ 以 :ro 挂载(改路由无需重建镜像)
FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
