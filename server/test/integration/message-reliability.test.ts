// dotenv 必须先于任何会构造 PrismaClient 的 import 执行(prisma 在模块加载时读 DATABASE_URL)。
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import app from '../../src/app.js';
import { persistMessage, deriveParticipants } from '../../src/services/message.js';
import { prisma, createUser, authCookies, cleanup } from './helpers.js';

// 可靠性命脉的真库集成测试:幂等去重、seq 单调、/sync 范围补拉、已读不倒退、越权拦截。
describe('消息可靠性核心(集成,真 PG)', () => {
  let u1: { id: bigint; username: string };
  let u2: { id: bigint; username: string };
  let outsider: { id: bigint; username: string };
  let conv: string;

  beforeAll(async () => {
    u1 = await createUser();
    u2 = await createUser();
    outsider = await createUser();
    conv = `single_${u1.id}_${u2.id}`;
  });

  afterAll(async () => {
    await cleanup([conv], [u1.id, u2.id, outsider.id]);
    await prisma.$disconnect();
  });

  it('同 clientMsgId 并发重发 → 恰好入库一条,所有结果 seq 一致', async () => {
    const clientMsgId = randomUUID();
    const participantIds = deriveParticipants(conv, u1.id);

    const results = await Promise.all(
      Array.from({ length: 30 }, () =>
        persistMessage({
          conversationId: conv,
          senderId: u1.id,
          clientMsgId,
          content: '重发去重',
          participantIds,
        })
      )
    );

    const rows = await prisma.message.findMany({ where: { conversationId: conv, clientMsgId } });
    expect(rows).toHaveLength(1);

    const seqs = new Set(results.map((r) => r.message.seq.toString()));
    expect(seqs.size).toBe(1);
    expect(seqs.has(rows[0].seq.toString())).toBe(true);
    // 30 次里恰好 1 次真写入,其余命中幂等。
    expect(results.filter((r) => !r.deduped)).toHaveLength(1);
  });

  it('单会话并发写多条 → seq 连续无洞无重', async () => {
    const c = `single_${u1.id}_${u2.id}_seqtest`;
    const participantIds = [u1.id, u2.id];
    const N = 25;

    await Promise.all(
      Array.from({ length: N }, () =>
        persistMessage({
          conversationId: c,
          senderId: u1.id,
          clientMsgId: randomUUID(),
          content: 'seq',
          participantIds,
        })
      )
    );

    const rows = await prisma.message.findMany({
      where: { conversationId: c },
      orderBy: { seq: 'asc' },
      select: { seq: true },
    });
    const seqs = rows.map((r) => Number(r.seq));
    expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1));

    await prisma.conversation.delete({ where: { id: c } });
  });

  it('GET /sync 按 since 范围分页返回 seq>since', async () => {
    // 专用会话写 3 条,验证分页与 since 游标语义。
    const c = `single_${u1.id}_${u2.id}_synctest`;
    for (let i = 0; i < 3; i++) {
      await persistMessage({
        conversationId: c,
        senderId: u1.id,
        clientMsgId: randomUUID(),
        content: `m${i}`,
        participantIds: [u1.id, u2.id],
      });
    }
    const { cookie } = authCookies(u1);

    // 第一页:since=0 limit=2 → seq 1,2,页满 hasMore=true。
    const page1 = await request(app)
      .get('/user/sync')
      .query({ conv: c, since: '0', limit: '2' })
      .set('Cookie', cookie);
    expect(page1.status).toBe(200);
    expect(page1.body.data.messages.map((m: { seq: string }) => Number(m.seq))).toEqual([1, 2]);
    expect(page1.body.data.hasMore).toBe(true);

    // 第二页:since=2 → 只剩 seq 3,未满 hasMore=false。
    const page2 = await request(app)
      .get('/user/sync')
      .query({ conv: c, since: '2', limit: '2' })
      .set('Cookie', cookie);
    expect(page2.body.data.messages.map((m: { seq: string }) => Number(m.seq))).toEqual([3]);
    expect(page2.body.data.hasMore).toBe(false);

    await prisma.conversation.delete({ where: { id: c } });
  });

  it('GET /sync 拉非成员会话 → 403', async () => {
    const { cookie } = authCookies(outsider);
    const res = await request(app).get('/user/sync').query({ conv, since: '0' }).set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('POST /read 单调推进,乱序旧值不让位点倒退', async () => {
    const { cookie, csrf } = authCookies(u1);

    const high = await request(app)
      .post('/user/read')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ conversationId: conv, uptoSeq: '5' });
    expect(high.status).toBe(200);

    const low = await request(app)
      .post('/user/read')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ conversationId: conv, uptoSeq: '3' });
    expect(low.status).toBe(200);
    expect(low.body.data.advanced).toBe(false); // 旧值不推进

    const uc = await prisma.userConversation.findUnique({
      where: { userId_conversationId: { userId: u1.id, conversationId: conv } },
      select: { lastReadSeq: true },
    });
    expect(Number(uc!.lastReadSeq)).toBe(5);
  });
});
