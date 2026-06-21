// POST /oauth/agent-token:首方令牌铸造(BFF)happy path + 鉴权/CSRF 拒绝分支
//
// 已登录会话(token cookie + CSRF 双提交)直接换一枚 agent-server-scoped access_token,
// 免去 authorization_code + PKCE 的浏览器重定向往返。

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { decodeJwt } from 'jose';

vi.mock('../../../src/database/prisma.js', () => ({
  prisma: {
    user: { findFirst: vi.fn() },
  },
}));

import { prisma } from '../../../src/database/prisma.js';
import { config } from '../../../src/config/config.js';
import { mountOAuth, loadKeyStore, type IssuerConfig } from '../../../src/oauth/index.js';
import { TOKEN_COOKIE, CSRF_COOKIE } from '../../../src/utils/authCookies.js';

const FIXTURE = resolve(__dirname, '../fixtures/test-rsa-private.pem');
const ISSUER: IssuerConfig = {
  issuer: 'http://test.example.com',
  atTtlSec: 900,
  rtTtlSec: 2592000,
  idTtlSec: 900,
};

const userFindFirst = prisma.user.findFirst as unknown as ReturnType<typeof vi.fn>;
const USER_ID = 880088;
const CSRF = 'csrf-token-1';

let app: express.Express;

function sessionCookie(): string {
  const token = jwt.sign({ id: USER_ID, username: 'neo' }, config.jwtSecret, {
    expiresIn: '1h',
  });
  return `${TOKEN_COOKIE}=${token}; ${CSRF_COOKIE}=${CSRF}`;
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(cookieParser());
  const store = await loadKeyStore({
    activeKid: 'test-1',
    retiredKids: [],
    privateKeyFile: FIXTURE,
  });
  mountOAuth(app, store, ISSUER);
});

beforeEach(() => {
  userFindFirst.mockReset();
});

describe('POST /oauth/agent-token', () => {
  it('happy path:已登录会话换出 agent-server-scoped RS256 token', async () => {
    userFindFirst.mockResolvedValue({
      id: BigInt(USER_ID),
      username: 'neo',
      email: null,
      nickname: null,
      avatar: null,
      status: 'online',
    });
    const res = await request(app)
      .post('/oauth/agent-token')
      .set('Cookie', sessionCookie())
      .set('X-CSRF-Token', CSRF);

    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.token_type).toBe('Bearer');
    expect(res.body.expires_in).toBe(900);
    expect(res.headers['cache-control']).toContain('no-store');

    const at = decodeJwt(res.body.access_token);
    expect(at.sub).toBe(String(USER_ID));
    expect(at.aud).toContain('agent-server');
    expect(at.scope).toBe('agent-server');
    expect(at.iss).toBe(ISSUER.issuer);
  });

  it('缺少 CSRF 头 → 403,不铸造 token', async () => {
    const res = await request(app)
      .post('/oauth/agent-token')
      .set('Cookie', sessionCookie());
    expect(res.status).toBe(403);
    expect(res.body.access_token).toBeUndefined();
  });

  it('无会话 cookie → 401', async () => {
    const res = await request(app)
      .post('/oauth/agent-token')
      .set('Cookie', `${CSRF_COOKIE}=${CSRF}`)
      .set('X-CSRF-Token', CSRF);
    expect(res.status).toBe(401);
  });

  it('会话用户已不存在 → 401', async () => {
    userFindFirst.mockResolvedValue(null);
    const res = await request(app)
      .post('/oauth/agent-token')
      .set('Cookie', sessionCookie())
      .set('X-CSRF-Token', CSRF);
    expect(res.status).toBe(401);
  });
});
