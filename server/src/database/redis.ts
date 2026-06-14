// Redis 客户端单例。承载连接注册表(presence)与跨副本 backplane(pub/sub)。
// 与 prisma.ts 同构:跨 hot-reload 复用同一连接,避免 tsx watch 重启时连接泄漏。

import { Redis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const globalForRedis = globalThis as unknown as {
  __redis__?: Redis;
};

// lazyConnect:false 让连接在创建时即建立;maxRetriesPerRequest:null 配合长连接命令(订阅)。
export const redis: Redis =
  globalForRedis.__redis__ ??
  new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.__redis__ = redis;
}

// pub/sub 的订阅连接必须独立于命令连接(进入订阅态后该连接不能再发普通命令)。
// 用 duplicate() 复制同配置,供 backplane(P2.2)的 subscribe 侧使用。
export function createSubscriber(): Redis {
  return redis.duplicate();
}
