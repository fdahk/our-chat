import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));
vi.mock('bcrypt', () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
}));

import bcrypt from 'bcrypt';
import { prisma } from '../src/database/prisma.js';
import app from '../src/app.js';

const findUniqueMock = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const findFirstMock = prisma.user.findFirst as unknown as ReturnType<typeof vi.fn>;
const compareMock = bcrypt.compare as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  findUniqueMock.mockReset();
  findFirstMock.mockReset();
  compareMock.mockReset();
});

describe('POST /api/login', () => {
  it('缺少用户名/密码 → 400 且不查库(防 undefined 进 Prisma 崩溃)', async () => {
    const res = await request(app).post('/api/login').send({});
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false });
    // 根因防护:入参缺失时绝不能把 undefined 传给 prisma.findUnique
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it('查库异常 → 500 兜底(不让未捕获 rejection 崩进程)', async () => {
    findUniqueMock.mockRejectedValue(new Error('db boom'));
    const res = await request(app).post('/api/login').send({ username: 'neo', password: 'x' });
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ success: false });
  });

  it('用户不存在 → 400', async () => {
    findUniqueMock.mockResolvedValue(null);
    const res = await request(app).post('/api/login').send({ username: 'nobody', password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, message: '用户不存在' });
  });

  it('密码错误 → 400', async () => {
    findUniqueMock.mockResolvedValue({ id: 1n, username: 'neo', password: 'hash' });
    compareMock.mockResolvedValue(false);
    const res = await request(app).post('/api/login').send({ username: 'neo', password: 'wrong' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('密码错误');
  });

  it('登录成功 → 200，下发鉴权 cookie 且响应体不含密码', async () => {
    findUniqueMock.mockResolvedValue({
      id: 1n,
      username: 'neo',
      password: 'hash',
      nickname: 'N',
    });
    compareMock.mockResolvedValue(true);
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'neo', password: 'right', remember: true });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
    expect(res.body.data.password).toBeUndefined();
    expect(res.body.data).toMatchObject({ id: 1, username: 'neo' });

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const joined = setCookie.join(';');
    expect(joined).toContain('token=');
    expect(joined).toContain('csrfToken=');
  });
});

describe('POST /api/logout', () => {
  it('清除 cookie 并返回 success', async () => {
    const res = await request(app).post('/api/logout').send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
  });
});
