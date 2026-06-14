// dotenv 必须先于任何会构造 PrismaClient 的 import 执行。
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import app from '../../src/app.js';
import { persistMessage, getConversationMembers, markMentions } from '../../src/services/message.js';
import { countReadMembers } from '../../src/services/read.js';
import { prisma, createUser, authCookies, cleanup } from './helpers.js';

// P4 读扩散群聊真库集成测试:成员读取、消息只落 1 行各自补拉、@提醒旁路、已读人数聚合。
// 同 describe 内 it 顺序执行,读位点/消息数跨用例累积(注释已标注每步状态)。
describe('群消息读扩散 + @提醒 + 已读聚合(集成,真 PG)', () => {
  let owner: { id: bigint; username: string };
  let m2: { id: bigint; username: string };
  let m3: { id: bigint; username: string };
  let outsider: { id: bigint; username: string };
  let groupId: bigint;
  let conv: string;

  beforeAll(async () => {
    owner = await createUser();
    m2 = await createUser();
    m3 = await createUser();
    outsider = await createUser();
    const group = await prisma.userGroup.create({ data: { name: 'P4群', ownerId: owner.id } });
    groupId = group.id;
    conv = `group_${groupId}`;
    await prisma.groupMember.createMany({
      data: [owner, m2, m3].map((u) => ({ groupId, userId: u.id })),
    });
  });

  afterAll(async () => {
    await prisma.conversation.deleteMany({ where: { id: conv } }); // 级联 user_conversations + messages
    await prisma.userGroup.deleteMany({ where: { id: groupId } }); // 级联 group_members
    await cleanup([], [owner.id, m2.id, m3.id, outsider.id]);
    await prisma.$disconnect();
  });

  it('getConversationMembers 群会话返回全体成员(权威花名册)', async () => {
    const members = await getConversationMembers(conv, owner.id);
    expect(new Set(members.map(String))).toEqual(
      new Set([owner.id, m2.id, m3.id].map(String))
    );
  });

  it('群消息只落 1 行,会话标 group,为每个成员建 UserConversation,各成员 /sync 都能拉到', async () => {
    const participantIds = await getConversationMembers(conv, owner.id);
    const { message } = await persistMessage({
      conversationId: conv,
      senderId: owner.id,
      clientMsgId: randomUUID(),
      content: '群发一条',
      participantIds,
    });

    // 读扩散:写 1 份。会话内只有这 1 行。
    const rows = await prisma.message.findMany({ where: { conversationId: conv } });
    expect(rows).toHaveLength(1);

    // 会话被推断为 group(并发兜底建会话时不误标 single)。
    const c = await prisma.conversation.findUnique({ where: { id: conv } });
    expect(c?.convType).toBe('group');

    // 每个成员各一行 UserConversation(per-member 位点的载体)。
    const ucs = await prisma.userConversation.findMany({ where: { conversationId: conv } });
    expect(new Set(ucs.map((u) => u.userId.toString()))).toEqual(
      new Set([owner, m2, m3].map((u) => u.id.toString()))
    );

    // 各成员按各自 synced(此处皆 0)从同一条会话流补拉,都能拿到这条。
    for (const u of [owner, m2, m3]) {
      const { cookie } = authCookies(u);
      const res = await request(app).get('/user/sync').query({ conv, since: '0' }).set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.data.messages.map((mm: { seq: string }) => Number(mm.seq))).toEqual([
        Number(message.seq),
      ]);
    }

    // 非成员拉群会话 → 403,不泄露群消息。
    const { cookie } = authCookies(outsider);
    const res = await request(app).get('/user/sync').query({ conv, since: '0' }).set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('@提醒旁路:被 @ 成员 /mentions 单独可查,未被 @ 者查不到,读过即清', async () => {
    const participantIds = await getConversationMembers(conv, owner.id);
    const { message } = await persistMessage({
      conversationId: conv,
      senderId: owner.id,
      clientMsgId: randomUUID(),
      content: '@m2 看下', // 第 2 条消息 → seq=2
      participantIds,
    });
    await markMentions(conv, message.seq, [m2.id]);

    // m2 被 @,能在 /mentions 查到该会话。
    const { cookie: m2cookie, csrf: m2csrf } = authCookies(m2);
    const r1 = await request(app).get('/user/mentions').set('Cookie', m2cookie);
    expect(r1.status).toBe(200);
    expect(r1.body.data.map((x: { conversationId: string }) => x.conversationId)).toContain(conv);

    // m3 没被 @,查不到(不被淹没也不误报)。
    const { cookie: m3cookie } = authCookies(m3);
    const r2 = await request(app).get('/user/mentions').set('Cookie', m3cookie);
    expect(r2.body.data.map((x: { conversationId: string }) => x.conversationId)).not.toContain(conv);

    // m2 读过该 seq → mentionSeq 不再 > lastReadSeq,/mentions 自动不再返回(无需单独清标)。
    await request(app)
      .post('/user/read')
      .set('Cookie', m2cookie)
      .set('X-CSRF-Token', m2csrf)
      .send({ conversationId: conv, uptoSeq: message.seq.toString() });
    const r3 = await request(app).get('/user/mentions').set('Cookie', m2cookie);
    expect(r3.body.data.map((x: { conversationId: string }) => x.conversationId)).not.toContain(conv);
  });

  it('群已读人数聚合:只算读到 seq 的人数,不做逐人逐条', async () => {
    // 当前 conv 有 2 条消息(seq 1、2)。m2 在上一用例已读到 2。让 owner 读到 2,m3 读到 1。
    const { cookie: oc, csrf: ocsrf } = authCookies(owner);
    await request(app)
      .post('/user/read')
      .set('Cookie', oc)
      .set('X-CSRF-Token', ocsrf)
      .send({ conversationId: conv, uptoSeq: '2' });
    const { cookie: m3c, csrf: m3csrf } = authCookies(m3);
    await request(app)
      .post('/user/read')
      .set('Cookie', m3c)
      .set('X-CSRF-Token', m3csrf)
      .send({ conversationId: conv, uptoSeq: '1' });

    // 读到 ≥2 的:owner、m2(共 2);m3 在 1 不计。
    const at2 = await countReadMembers(conv, 2n);
    expect(at2).toEqual({ readCount: 2, total: 3 });
    // 读到 ≥1 的:三人全到。
    const at1 = await countReadMembers(conv, 1n);
    expect(at1).toEqual({ readCount: 3, total: 3 });

    // REST 端点同义,且要求是会话成员。
    const res = await request(app).get('/user/readCount').query({ conv, seq: '2' }).set('Cookie', oc);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ readCount: 2, total: 3 });

    // 非成员查已读人数 → 403,不泄露群规模。
    const { cookie: outc } = authCookies(outsider);
    const resOut = await request(app).get('/user/readCount').query({ conv, seq: '2' }).set('Cookie', outc);
    expect(resOut.status).toBe(403);
  });
});
