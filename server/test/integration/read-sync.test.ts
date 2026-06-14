import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type { Server as IoServer } from 'socket.io';
import app from '../../src/app.js';
import { initSocket } from '../../src/utils/socket.js';
import { persistMessage } from '../../src/services/message.js';
import { prisma, createUser, authCookies, cleanup } from './helpers.js';
import { redis } from '../../src/database/redis.js';

// P2.3 多端一致:已读跨端同步(read.sync 只推同用户其它端)+ per-device synced 态(DeviceSyncState)。
describe('多端已读同步与 per-device synced(集成,真 PG+Redis)', () => {
  let u1: { id: bigint; username: string };
  let u2: { id: bigint; username: string };
  let conv: string;
  let http: HttpServer;
  let io: IoServer;
  let port: number;
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    u1 = await createUser();
    u2 = await createUser();
    conv = `single_${u1.id}_${u2.id}`;
    // 建会话 + 双方成员关系,并写 3 条消息(seq 1..3)。
    for (let i = 0; i < 3; i++) {
      await persistMessage({
        conversationId: conv,
        senderId: u1.id,
        clientMsgId: randomUUID(),
        content: `m${i}`,
        participantIds: [u1.id, u2.id],
      });
    }
    await new Promise<void>((resolve) => {
      http = createServer();
      io = initSocket(http);
      http.listen(0, () => {
        port = (http.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    await io.close();
    await new Promise<void>((r) => http.close(() => r()));
    await prisma.deviceSyncState.deleteMany({ where: { userId: { in: [u1.id, u2.id] } } });
    await cleanup([conv], [u1.id, u2.id]);
    await prisma.$disconnect();
    await redis.quit();
  });

  function connect(user: { id: bigint; username: string }, deviceId: string): Promise<ClientSocket> {
    const { cookie } = authCookies(user);
    const sock = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      extraHeaders: { Cookie: cookie },
      auth: { deviceId },
      reconnection: false,
    });
    sockets.push(sock);
    return new Promise((resolve, reject) => {
      sock.on('connect', () => resolve(sock));
      sock.on('connect_error', reject);
      setTimeout(() => reject(new Error(`连接超时: ${deviceId}`)), 10000);
    });
  }

  it('一端上报已读 → 同用户其它端收到 read.sync,操作端自己不回声', async () => {
    const dev1 = await connect(u1, 'web');
    const dev2 = await connect(u1, 'phone');

    const dev2Got = new Promise<{ conversationId: string; uptoSeq: number }>((resolve) => {
      dev2.on('read.sync', (p) => resolve(p));
    });
    let dev1Echo = false;
    dev1.on('read.sync', () => {
      dev1Echo = true;
    });

    dev1.emit('read.report', { conversationId: conv, uptoSeq: '3' });

    const got = await Promise.race([
      dev2Got,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('其它端未收到 read.sync')), 8000)),
    ]);
    expect(got.conversationId).toBe(conv);
    expect(Number(got.uptoSeq)).toBe(3);

    // 给可能的回声一点时间;操作端不应收到自己的 read.sync。
    await new Promise((r) => setTimeout(r, 200));
    expect(dev1Echo).toBe(false);

    // 用户级 lastReadSeq 落库推进到 3。
    const uc = await prisma.userConversation.findUnique({
      where: { userId_conversationId: { userId: u1.id, conversationId: conv } },
      select: { lastReadSeq: true },
    });
    expect(Number(uc!.lastReadSeq)).toBe(3);
  });

  it('/sync 带 device → 记录 per-device synced 位点,两设备各自独立', async () => {
    const { cookie } = authCookies(u2);

    // 设备 A 一次拉全(seq 到 3);设备 B 限 2 条(只到 seq 2)。
    await request(app).get('/user/sync').query({ conv, since: '0', device: 'devA' }).set('Cookie', cookie);
    await request(app)
      .get('/user/sync')
      .query({ conv, since: '0', limit: '2', device: 'devB' })
      .set('Cookie', cookie);

    // recordDeviceSync 是 fire-and-forget,轮询等落库。
    const read = async (deviceId: string) =>
      prisma.deviceSyncState.findUnique({
        where: {
          userId_deviceId_conversationId: { userId: u2.id, deviceId, conversationId: conv },
        },
        select: { lastSyncedSeq: true },
      });

    let a = await read('devA');
    let b = await read('devB');
    for (let i = 0; i < 20 && (!a || !b); i++) {
      await new Promise((r) => setTimeout(r, 50));
      a = await read('devA');
      b = await read('devB');
    }
    expect(Number(a!.lastSyncedSeq)).toBe(3);
    expect(Number(b!.lastSyncedSeq)).toBe(2); // per-device:B 落后于 A,互不污染
  });
});
