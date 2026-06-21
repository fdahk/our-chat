import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { redis } from '../../src/database/redis.js';
import { register, refresh, remove, getDevices, filterOnline } from '../../src/realtime/presence.js';

// presence 注册表真 Redis 集成测试:多端登记、心跳续约、断开摘除、TTL 惰性过期。
describe('连接注册表 presence(集成,真 Redis)', () => {
  const userId = 9_900_000_001n;

  beforeAll(async () => {
    await redis.del(`presence:${userId}`, `presence:${userId}:meta`);
  });

  afterAll(async () => {
    await redis.del(`presence:${userId}`, `presence:${userId}:meta`);
    await redis.quit();
  });

  it('多端登记 → getDevices 返回全部在线设备及其 replica/socketId', async () => {
    await register(userId, { deviceId: 'web', replica: 'r1', socketId: 's_web' });
    await register(userId, { deviceId: 'phone', replica: 'r2', socketId: 's_phone' });

    const devices = await getDevices(userId);
    const byId = Object.fromEntries(devices.map((d) => [d.deviceId, d]));
    expect(Object.keys(byId).sort()).toEqual(['phone', 'web']);
    expect(byId.web).toMatchObject({ replica: 'r1', socketId: 's_web' });
    expect(byId.phone).toMatchObject({ replica: 'r2', socketId: 's_phone' });
  });

  it('断开摘除 → 该设备不再出现在在线列表', async () => {
    await remove(userId, 'phone');
    const devices = await getDevices(userId);
    expect(devices.map((d) => d.deviceId)).toEqual(['web']);
  });

  it('TTL 过期 → getDevices 惰性摘除并清理 meta', async () => {
    // 用极短 TTL 登记一台设备,稍候即过期。
    await register(userId, { deviceId: 'stale', replica: 'r1', socketId: 's_stale' }, 30);
    await new Promise((r) => setTimeout(r, 60));

    const devices = await getDevices(userId);
    expect(devices.map((d) => d.deviceId)).not.toContain('stale');
    // 过期项的 meta 也应被一并清掉。
    expect(await redis.hexists(`presence:${userId}:meta`, 'stale')).toBe(0);
  });

  it('心跳续约 → 推后过期时刻,设备保持在线', async () => {
    await register(userId, { deviceId: 'beat', replica: 'r1', socketId: 's_beat' }, 40);
    await new Promise((r) => setTimeout(r, 25));
    await refresh(userId, 'beat', 60_000); // 续约一大段
    await new Promise((r) => setTimeout(r, 25)); // 累计 50ms,若没续约早已过期

    const devices = await getDevices(userId);
    expect(devices.map((d) => d.deviceId)).toContain('beat');
  });

  it('filterOnline 批量返回在线子集,离线/过期成员被剔除(群扩散只推在线)', async () => {
    const on1 = 9_900_000_101n;
    const on2 = 9_900_000_102n;
    const off = 9_900_000_103n;
    const keys = [on1, on2, off].flatMap((u) => [`presence:${u}`, `presence:${u}:meta`]);
    await redis.del(...keys);

    await register(on1, { deviceId: 'd', replica: 'r', socketId: 's1' });
    await register(on2, { deviceId: 'd', replica: 'r', socketId: 's2' });
    // off 只有一台极短 TTL 设备,稍候过期 → 视为离线。
    await register(off, { deviceId: 'stale', replica: 'r', socketId: 's3' }, 20);
    await new Promise((r) => setTimeout(r, 40));

    const set = await filterOnline([on1, on2, off]);
    expect(set.has(Number(on1))).toBe(true);
    expect(set.has(Number(on2))).toBe(true);
    expect(set.has(Number(off))).toBe(false);
    // 空入参快速短路。
    expect(await filterOnline([])).toEqual(new Set());

    await redis.del(...keys);
  });
});
