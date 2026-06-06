// Prisma Client 单例。应用层唯一 DB 入口,所有 SQL 都经此走(model API 或 $queryRaw)

import './bigint-json.js';
import { PrismaClient } from '../generated/prisma/index.js';

// 跨 hot-reload 复用同一个实例,避免每次 nodemon/tsx watch 重启都新建连接池
const globalForPrisma = globalThis as unknown as {
  __prisma__?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.__prisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma__ = prisma;
}
