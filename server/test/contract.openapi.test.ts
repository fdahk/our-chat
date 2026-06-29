import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { components } from '../src/contracts/openapi/schema';

// 契约符合性:用真实路由处理器的输出(supertest)断言其符合 OpenAPI 单一契约生成的类型。
// 这把"生产方(server)实际响应"与"消费方(iOS/web)所用契约"闭环——服务端响应漂移时此测试会红。
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    user: { findFirst: vi.fn() },
    message: { findMany: vi.fn() },
    userConversation: { findMany: vi.fn() },
  },
}));

import { prisma } from '../src/database/prisma.js';
import { config } from '../src/config/config.js';
import app from '../src/app.js';

const findFirstMock = prisma.user.findFirst as unknown as ReturnType<typeof vi.fn>;
const messagesMock = prisma.message.findMany as unknown as ReturnType<typeof vi.fn>;
const userConvMock = prisma.userConversation.findMany as unknown as ReturnType<typeof vi.fn>;
const sign = () => jwt.sign({ id: 7, username: 'neo' }, config.jwtSecret);

// authenticateToken 选出的当前用户(email/avatar 可空 —— 契约如实标 nullable)
const authUser = { id: 7n, username: 'neo', email: 'neo@x.io', nickname: '尼奥', avatar: null, status: 'online' };

beforeEach(() => {
  findFirstMock.mockReset();
  messagesMock.mockReset();
  userConvMock.mockReset();
});

describe('OpenAPI 契约符合性(真实响应 ↔ 生成类型)', () => {
  it('GET /user/userConversations 响应符合 UserConversation[] 契约', async () => {
    findFirstMock.mockResolvedValue(authUser);
    userConvMock.mockResolvedValue([
      { id: 1n, userId: 7n, conversationId: 'single_1_2', unreadCount: 3, isMuted: false, isPinned: false, lastActivity: new Date('2026-06-25T10:00:00.000Z') },
    ]);
    const res = await request(app)
      .get('/user/userConversations?userId=7')
      .set('Authorization', `Bearer ${sign()}`);

    expect(res.status).toBe(200);
    const list = res.body.data as components['schemas']['UserConversation'][];
    expect(Array.isArray(list)).toBe(true);
    const uc = list[0];
    expect(typeof uc.conversationId).toBe('string');
    expect(typeof uc.unreadCount).toBe('number');
    expect(typeof uc.isMuted).toBe('boolean');
  });

  it('GET /user/messages 响应符合 Message[] 契约', async () => {
    findFirstMock.mockResolvedValue(authUser);
    messagesMock.mockResolvedValue([
      {
        id: 5n,
        conversationId: 'single_1_2',
        senderId: 2n,
        seq: 7n,
        clientMsgId: 'c1',
        content: 'hi',
        type: 'text',
        status: 'sent',
        mentions: [],
        isEdited: false,
        isDeleted: false,
        extra: {},
        fileInfo: {},
        timestamp: new Date('2026-06-25T10:00:00.000Z'),
        createdAt: new Date('2026-06-25T10:00:00.000Z'),
        updatedAt: new Date('2026-06-25T10:00:00.000Z'),
        editHistory: [],
      },
    ]);
    const res = await request(app)
      .get('/user/messages?conversationId=single_1_2')
      .set('Authorization', `Bearer ${sign()}`);

    expect(res.status).toBe(200);
    const list = res.body.data as components['schemas']['Message'][];
    expect(Array.isArray(list)).toBe(true);
    const m = list[0];
    expect(typeof m.id).toBe('number');
    expect(typeof m.conversationId).toBe('string');
    expect(typeof m.senderId).toBe('number');
    expect(typeof m.seq).toBe('number');
    expect(typeof m.content).toBe('string');
    expect(typeof m.type).toBe('string');
    expect(typeof m.timestamp).toBe('string'); // date-time → ISO 字符串(契约 type:string format:date-time)
  });
});
