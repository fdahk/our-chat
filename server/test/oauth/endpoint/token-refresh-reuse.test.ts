// refresh_token grant rotation + reuse 检测
// 攻击者偷一根 RT 用过后,受害者再用会触发整 family 被烧

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import express from 'express';
import request from 'supertest';

const txCallback = { fn: vi.fn() };

vi.mock('../../../src/database/prisma.js', () => {
  const oAuthClient = { findUnique: vi.fn() };
  const oAuthRefreshToken = {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  };
  const user = { findUnique: vi.fn() };
  return {
    prisma: {
      oAuthClient,
      oAuthRefreshToken,
      user,
      $transaction: vi.fn(
        (callback: (tx: unknown) => Promise<unknown>) => {
          txCallback.fn = callback as never;
          // tx 对象暴露同样的 model 方法
          return callback({
            oAuthRefreshToken,
          });
        },
      ),
    },
  };
});

import { prisma } from '../../../src/database/prisma.js';
import { mountOAuth, loadKeyStore, type IssuerConfig } from '../../../src/oauth/index.js';
import { signRefreshToken } from '../../../src/oauth/tokens.js';

const FIXTURE = resolve(__dirname, '../fixtures/test-rsa-private.pem');
const ISSUER: IssuerConfig = {
  issuer: 'http://test.example.com',
  atTtlSec: 900,
  rtTtlSec: 2592000,
  idTtlSec: 900,
};

const clientFind = prisma.oAuthClient.findUnique as unknown as ReturnType<typeof vi.fn>;
const rtFind = prisma.oAuthRefreshToken.findUnique as unknown as ReturnType<typeof vi.fn>;
const rtUpdate = prisma.oAuthRefreshToken.updateMany as unknown as ReturnType<typeof vi.fn>;
const rtCreate = prisma.oAuthRefreshToken.create as unknown as ReturnType<typeof vi.fn>;

const prismaPublicRow = {
  clientId: 'web',
  clientName: 'Web',
  clientType: 'public',
  clientSecretHash: null,
  redirectUris: ['https://app/cb'],
  allowedScopes: ['openid', 'agent-server'],
  allowedGrantTypes: ['authorization_code', 'refresh_token'],
  tokenLifetimeSec: 900,
  refreshLifetimeSec: 2592000,
  requirePkce: true,
  disabled: false,
};

let app: express.Express;
let signedRt: string;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  const store = await loadKeyStore({
    activeKid: 'test-1',
    retiredKids: [],
    privateKeyFile: FIXTURE,
  });
  mountOAuth(app, store, ISSUER);

  signedRt = await signRefreshToken(store, ISSUER, {
    sub: 7,
    scope: 'agent-server',
    client_id: 'web',
    jti: 'rt-victim',
    family_id: 'fam-1',
    expiresAt: new Date(Date.now() + 60_000),
  });
});

beforeEach(() => {
  clientFind.mockReset();
  rtFind.mockReset();
  rtUpdate.mockReset();
  rtCreate.mockReset();
});

const activeRt = {
  jti: 'rt-victim',
  familyId: 'fam-1',
  clientId: 'web',
  userId: 7n,
  scope: 'agent-server',
  issuedAt: new Date(),
  expiresAt: new Date(Date.now() + 60_000),
  revoked: false,
  rotatedTo: null,
  rotatedAt: null,
  revokeReason: null,
};

describe('POST /oauth/token grant_type=refresh_token', () => {
  it('正常 refresh:返回新 AT + 新 RT,事务路径上 update 成功', async () => {
    clientFind.mockResolvedValue(prismaPublicRow);
    rtFind.mockResolvedValue(activeRt);
    rtCreate.mockResolvedValue({});
    rtUpdate.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: signedRt,
        client_id: 'web',
      });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.refresh_token).toBeTruthy();
    expect(res.body.refresh_token).not.toBe(signedRt);
    expect(res.body.token_type).toBe('Bearer');
    expect(res.body.scope).toBe('agent-server');
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('reuse 检测(场景 A:DB 行已 rotated_to):family invalidate + invalid_grant', async () => {
    clientFind.mockResolvedValue(prismaPublicRow);
    rtFind.mockResolvedValue({
      ...activeRt,
      rotatedTo: 'rt-already-used',
      rotatedAt: new Date(),
      revokeReason: 'rotation',
    });
    rtUpdate.mockResolvedValue({ count: 3 });

    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: signedRt,
        client_id: 'web',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_grant');

    // family invalidate 被触发
    const invalidateCall = rtUpdate.mock.calls.find(
      (c) => (c[0] as { where: { familyId?: string } }).where.familyId === 'fam-1',
    );
    expect(invalidateCall).toBeDefined();
  });

  it('reuse 检测(场景 B:DB 已 revoked):invalid_grant', async () => {
    clientFind.mockResolvedValue(prismaPublicRow);
    rtFind.mockResolvedValue({ ...activeRt, revoked: true, revokeReason: 'logout' });
    rtUpdate.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: signedRt,
        client_id: 'web',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('reuse 检测(场景 C:事务里 rotation update count=0):family invalidate', async () => {
    clientFind.mockResolvedValue(prismaPublicRow);
    rtFind.mockResolvedValue(activeRt);
    rtCreate.mockResolvedValue({});
    // 事务里 updateMany 命中 0 行 → 抛 sentinel → 事务回滚 → 上层触发 family invalidate
    rtUpdate.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: signedRt,
        client_id: 'web',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('client_id 不匹配 RT.client_id → invalid_grant', async () => {
    clientFind.mockResolvedValue({ ...prismaPublicRow, clientId: 'other' });
    rtFind.mockResolvedValue(activeRt);

    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: signedRt,
        client_id: 'other',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('refresh_token 缺失 → invalid_request', async () => {
    clientFind.mockResolvedValue(prismaPublicRow);
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', client_id: 'web' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
  });

  it('scope 扩展拒绝(invalid_scope)', async () => {
    clientFind.mockResolvedValue(prismaPublicRow);
    rtFind.mockResolvedValue(activeRt);

    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: signedRt,
        client_id: 'web',
        scope: 'agent-server openid',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_scope');
  });
});
