import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

// 把数据库换成可控 mock，避免真实连接
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    user: { findFirst: vi.fn() },
  },
}));

import { prisma } from '../src/database/prisma.js';
import { config } from '../src/config/config.js';
import { authenticateToken } from '../src/middleware/auth.js';

const findFirstMock = prisma.user.findFirst as unknown as ReturnType<typeof vi.fn>;

const sign = (payload: object, opts?: jwt.SignOptions) =>
  jwt.sign(payload, config.jwtSecret, opts);

const makeRes = () => {
  const res = {} as Response & { _status?: number };
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const run = async (req: Partial<Request>) => {
  const res = makeRes();
  const next = vi.fn() as unknown as NextFunction;
  await authenticateToken(req as Request, res, next);
  return { res, next };
};

beforeEach(() => {
  findFirstMock.mockReset();
});

describe('authenticateToken', () => {
  it('变更类请求缺少 CSRF 头 → 403', async () => {
    const { res, next } = await run({ method: 'POST', headers: {}, cookies: {} });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('CSRF 头与 cookie 不一致 → 403', async () => {
    const { res } = await run({
      method: 'POST',
      headers: { 'x-csrf-token': 'a' },
      cookies: { csrfToken: 'b' },
    });
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('GET 跳过 CSRF，但缺少 token → 401', async () => {
    const { res, next } = await run({ method: 'GET', headers: {}, cookies: {} });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('合法 token 且用户存在 → next 并挂载 req.user', async () => {
    findFirstMock.mockResolvedValue({
      id: 7n,
      username: 'neo',
      email: null,
      nickname: null,
      avatar: null,
      status: 'online',
    });
    const token = sign({ id: 7, username: 'neo' });
    const req = { method: 'GET', headers: {}, cookies: { token } } as Partial<Request>;
    const { res, next } = await run(req);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect((req as Request).user).toMatchObject({ id: 7, username: 'neo', status: 'online' });
  });

  it('合法 token 但用户不存在 → 401', async () => {
    findFirstMock.mockResolvedValue(null);
    const token = sign({ id: 99, username: 'ghost' });
    const { res, next } = await run({ method: 'GET', headers: {}, cookies: { token } });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('过期 token → 401 且 code=TOKEN_EXPIRED', async () => {
    const token = sign({ id: 1, username: 'a' }, { expiresIn: -10 });
    const { res } = await run({ method: 'GET', headers: {}, cookies: { token } });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_EXPIRED' }));
  });

  it('非法 token → 401 且 code=TOKEN_INVALID', async () => {
    const { res } = await run({
      method: 'GET',
      headers: {},
      cookies: { token: 'not-a-jwt' },
    });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_INVALID' }));
  });
});

describe('authenticateToken — Authorization: Bearer 双鉴权', () => {
  it('变更类请求带 Bearer 且用户存在 → 免 CSRF,next 并挂载 req.user', async () => {
    findFirstMock.mockResolvedValue({
      id: 7n, username: 'neo', email: null, nickname: null, avatar: null, status: 'online',
    });
    const token = sign({ id: 7, username: 'neo' });
    const req = {
      method: 'POST', // 变更类:cookie 鉴权会要求 CSRF,Bearer 应跳过
      headers: { authorization: `Bearer ${token}` },
      cookies: {}, // 无 cookie、无 csrf
    } as Partial<Request>;
    const { res, next } = await run(req);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect((req as Request).user).toMatchObject({ id: 7, username: 'neo', status: 'online' });
  });

  it('Bearer 优先于 cookie', async () => {
    findFirstMock.mockResolvedValue({
      id: 8n, username: 'bearer-user', email: null, nickname: null, avatar: null, status: 'online',
    });
    const bearer = sign({ id: 8, username: 'bearer-user' });
    const req = {
      method: 'GET',
      headers: { authorization: `Bearer ${bearer}` },
      cookies: { token: 'ignored-cookie' },
    } as Partial<Request>;
    const { next } = await run(req);
    expect(next).toHaveBeenCalledTimes(1);
    expect((req as Request).user).toMatchObject({ id: 8, username: 'bearer-user' });
  });

  it('Bearer token 非法 → 401 且 code=TOKEN_INVALID', async () => {
    const { res } = await run({
      method: 'GET',
      headers: { authorization: 'Bearer not-a-jwt' },
      cookies: {},
    });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_INVALID' }));
  });
});
