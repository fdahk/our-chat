import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/database/mySql.js', () => ({
  mySql: { execute: vi.fn(), query: vi.fn() },
}));
vi.mock('bcrypt', () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
}));

import bcrypt from 'bcrypt';
import { mySql } from '../src/database/mySql.js';
import app from '../src/app.js';

const execMock = mySql.execute as unknown as ReturnType<typeof vi.fn>;
const compareMock = bcrypt.compare as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  execMock.mockReset();
  compareMock.mockReset();
});

describe('POST /api/login', () => {
  it('用户不存在 → 400', async () => {
    execMock.mockResolvedValue([[], []]);
    const res = await request(app).post('/api/login').send({ username: 'nobody', password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, message: '用户不存在' });
  });

  it('密码错误 → 400', async () => {
    execMock.mockResolvedValue([[{ id: 1, username: 'neo', password: 'hash' }], []]);
    compareMock.mockResolvedValue(false);
    const res = await request(app).post('/api/login').send({ username: 'neo', password: 'wrong' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('密码错误');
  });

  it('登录成功 → 200，下发鉴权 cookie 且响应体不含密码', async () => {
    execMock.mockResolvedValue([
      [{ id: 1, username: 'neo', password: 'hash', nickname: 'N' }],
      [],
    ]);
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
