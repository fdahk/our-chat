// 连接注册表(presence registry):记「每个用户当前有哪些活跃连接、在哪台副本上」。
// 多副本共享(放 Redis),下行扇出时据此把消息投到一个用户的所有在线设备(docs 15 §5.1)。
//
// 存储结构(每用户两把键):
//   presence:{userId}        ZSET  member=deviceId, score=过期时刻(ms)  —— 用 score 实现按设备 TTL
//   presence:{userId}:meta   HASH  field=deviceId,  value="{replica}:{socketId}"
//
// 为什么用 ZSET 的 score 当 TTL,而不是每设备一个带 EXPIRE 的 key:
//   - 单键即可枚举一个用户的全部设备(ZRANGEBYSCORE),无需 SCAN 整个 keyspace;
//   - 心跳=更新 score,过期=score 落在 now 之前,读取时惰性摘除,语义清晰且并发安全。

import { redis } from '../database/redis.js';
import os from 'os';

// 副本标识:多副本部署时用于区分「这条连接的 socket 在哪台 server 上」。
// 跨副本投递(P2.2)据此决定本地直投还是 pub/sub 代投。
export const REPLICA_ID = process.env.REPLICA_ID || os.hostname();

// 设备在线判定的 TTL。心跳间隔 25~30s,这里给 60s 容差(docs 16 §5.2)。
export const PRESENCE_TTL_MS = 60_000;

export interface DeviceEntry {
  deviceId: string;
  replica: string;
  socketId: string;
}

const zkey = (userId: bigint | number): string => `presence:${userId}`;
const mkey = (userId: bigint | number): string => `presence:${userId}:meta`;

// 上线/重连:登记一台设备,并刷新其过期时刻。register 与 refresh 等价于「续约」。
export async function register(
  userId: bigint | number,
  device: DeviceEntry,
  ttlMs: number = PRESENCE_TTL_MS
): Promise<void> {
  const expireAt = Date.now() + ttlMs;
  await redis
    .multi()
    .zadd(zkey(userId), expireAt, device.deviceId)
    .hset(mkey(userId), device.deviceId, `${device.replica}:${device.socketId}`)
    .exec();
}

// 心跳:仅推后过期时刻(不动 meta)。设备不在册时 zadd 会重新加回,等价于补登记。
export async function refresh(
  userId: bigint | number,
  deviceId: string,
  ttlMs: number = PRESENCE_TTL_MS
): Promise<void> {
  await redis.zadd(zkey(userId), Date.now() + ttlMs, deviceId);
}

// 优雅断开:即时摘除该设备(非优雅断开靠读取时的惰性过期兜底)。
export async function remove(userId: bigint | number, deviceId: string): Promise<void> {
  await redis.multi().zrem(zkey(userId), deviceId).hdel(mkey(userId), deviceId).exec();
}

// 枚举一个用户当前在线的全部设备。读取前先惰性摘除已过期项(score < now),
// 保证返回的都是「TTL 内有心跳」的活跃连接。
export async function getDevices(userId: bigint | number): Promise<DeviceEntry[]> {
  const now = Date.now();

  // 先清过期:取出 score 在 [0, now) 的设备,从 ZSET 与 meta 一并删掉。
  const expired = await redis.zrangebyscore(zkey(userId), 0, now);
  if (expired.length) {
    const tx = redis.multi().zremrangebyscore(zkey(userId), 0, now);
    tx.hdel(mkey(userId), ...expired);
    await tx.exec();
  }

  const alive = await redis.zrangebyscore(zkey(userId), now, '+inf');
  if (!alive.length) return [];

  const metas = await redis.hmget(mkey(userId), ...alive);
  const result: DeviceEntry[] = [];
  for (let i = 0; i < alive.length; i++) {
    const raw = metas[i];
    if (!raw) continue;
    const sep = raw.indexOf(':');
    if (sep === -1) continue;
    result.push({
      deviceId: alive[i],
      replica: raw.slice(0, sep),
      socketId: raw.slice(sep + 1),
    });
  }
  return result;
}
