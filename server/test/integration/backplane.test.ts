import 'dotenv/config';
import { describe, it, expect, afterAll } from 'vitest';
import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type { Server as IoServer } from 'socket.io';
import { initSocket } from '../../src/utils/socket.js';
import { authCookies } from './helpers.js';
import { redis } from '../../src/database/redis.js';

// 跨副本 backplane 集成测试(两个 io 实例 + 共享 Redis adapter):
// 客户端连副本 A,从副本 B 向其房间 emit,客户端应收到 —— 证明 io.to(room).emit 跨副本透明代投。
describe('跨副本 backplane(集成,真 Redis adapter)', () => {
  const servers: HttpServer[] = [];
  const ios: IoServer[] = [];
  let clientSock: ClientSocket | undefined;

  afterAll(async () => {
    clientSock?.disconnect();
    for (const io of ios) await io.close();
    for (const s of servers) await new Promise<void>((r) => s.close(() => r()));
    await redis.quit();
  });

  function bootReplica(): Promise<{ io: IoServer; port: number }> {
    return new Promise((resolve) => {
      const http = createServer();
      const io = initSocket(http);
      servers.push(http);
      ios.push(io);
      http.listen(0, () => resolve({ io, port: (http.address() as AddressInfo).port }));
    });
  }

  it('副本 B 向用户房间 emit → 连在副本 A 的该用户设备收到', async () => {
    const a = await bootReplica();
    const b = await bootReplica();

    const user = { id: 990123, username: 'backplane_tester' };
    const { cookie } = authCookies({ id: BigInt(user.id), username: user.username });

    clientSock = ioClient(`http://localhost:${a.port}`, {
      transports: ['websocket'],
      extraHeaders: { Cookie: cookie },
      reconnection: false,
    });

    await new Promise<void>((resolve, reject) => {
      clientSock!.on('connect', () => resolve());
      clientSock!.on('connect_error', (e) => reject(e));
      setTimeout(() => reject(new Error('连接副本 A 超时')), 10000);
    });

    const received = new Promise<{ content: string }>((resolve) => {
      clientSock!.on('receiveMessage', (m) => resolve(m));
    });

    // 关键:从副本 B(客户端并未连它)向用户房间投递。房间号沿用 socket.ts 的数值房间约定。
    // 连接处理器已让客户端 socket 自动 join 该房间;adapter 把这次 emit 经 Redis 代投到副本 A。
    // Redis pub/sub 无消息积压:若 B 在 A 的 adapter 完成 subscribe 之前就 publish 会丢。
    // 因此周期性重发直到送达 —— 跨副本投递本就是逐条消息触发,重发等价于多来一条新消息。
    const timer = setInterval(() => {
      b.io.to(user.id as unknown as string).emit('receiveMessage', { content: '来自副本B' });
    }, 150);
    try {
      const msg = await received;
      expect(msg.content).toBe('来自副本B');
    } finally {
      clearInterval(timer);
    }
  }, 15000);
});
