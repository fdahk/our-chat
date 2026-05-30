import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

// 把数据库换成可控 mock，避免真实连接
vi.mock('../src/database/mySql.js', () => ({
  mySql: { execute: vi.fn() },
}));

import { mySql } from '../src/database/mySql.js';
import { config } from '../src/config/config.js';
import { authenticateToken } from '../src/middleware/auth.js';

const execMock = mySql.execute as unknown as ReturnType<typeof vi.fn>;

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
  execMock.mockReset();
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
    execMock.mockResolvedValue([
      [{ id: 7, username: 'neo', email: null, nickname: null, avatar: null, status: 'online' }],
      [],
    ]);
    const token = sign({ id: 7, username: 'neo' });
    const req = { method: 'GET', headers: {}, cookies: { token } } as Partial<Request>;
    const { res, next } = await run(req);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect((req as Request).user).toMatchObject({ id: 7, username: 'neo', status: 'online' });
  });

  it('合法 token 但用户不存在 → 401', async () => {
    execMock.mockResolvedValue([[], []]);
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
