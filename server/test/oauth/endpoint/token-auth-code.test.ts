// authorization_code grant happy path + 关键拒绝分支

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import express from 'express';
import request from 'supertest';
import { decodeJwt } from 'jose';

vi.mock('../../../src/database/prisma.js', () => {
  const oAuthClient = { findUnique: vi.fn() };
  const oAuthCode = {
    create: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    deleteMany: vi.fn(),
  };
  const oAuthRefreshToken = { create: vi.fn(), updateMany: vi.fn() };
  const user = { findUnique: vi.fn() };
  return {
    prisma: {
      oAuthClient,
      oAuthCode,
      oAuthRefreshToken,
      user,
    },
  };
});

import { prisma } from '../../../src/database/prisma.js';
import { mountOAuth, loadKeyStore, type IssuerConfig } from '../../../src/oauth/index.js';
import { deriveS256Challenge } from '../../../src/oauth/pkce.js';

const FIXTURE = resolve(__dirname, '../fixtures/test-rsa-private.pem');
const ISSUER: IssuerConfig = {
  issuer: 'http://test.example.com',
  atTtlSec: 900,
  rtTtlSec: 2592000,
  idTtlSec: 900,
};

const clientFind = prisma.oAuthClient.findUnique as unknown as ReturnType<typeof vi.fn>;
const codeUpdate = prisma.oAuthCode.updateMany as unknown as ReturnType<typeof vi.fn>;
const codeFind = prisma.oAuthCode.findUnique as unknown as ReturnType<typeof vi.fn>;
const rtCreate = prisma.oAuthRefreshToken.create as unknown as ReturnType<typeof vi.fn>;
const userFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;

const prismaPublicRow = {
  clientId: 'web',
  clientName: 'Web',
  clientType: 'public',
  clientSecretHash: null,
  redirectUris: ['https://app/cb'],
  allowedScopes: ['openid', 'profile', 'agent-server'],
  allowedGrantTypes: ['authorization_code', 'refresh_token'],
  tokenLifetimeSec: 900,
  refreshLifetimeSec: 2592000,
  requirePkce: true,
  disabled: false,
};

const VERIFIER = 'A'.repeat(64);
const CHALLENGE = deriveS256Challenge(VERIFIER);

let app: express.Express;

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
});

beforeEach(() => {
  clientFind.mockReset();
  codeUpdate.mockReset();
  codeFind.mockReset();
  rtCreate.mockReset();
  userFind.mockReset();
});

function setupHappyPath(scope = 'openid agent-server') {
  clientFind.mockResolvedValue(prismaPublicRow);
  codeUpdate.mockResolvedValue({ count: 1 });
  codeFind.mockResolvedValue({
    code: 'auth-code-1',
    clientId: 'web',
    userId: 42n,
    redirectUri: 'https://app/cb',
    codeChallenge: CHALLENGE,
    codeChallengeMethod: 'S256',
    scope,
    nonce: 'nonce-1',
    expiresAt: new Date(Date.now() + 60_000),
    used: true,
  });
  rtCreate.mockResolvedValue({});
  userFind.mockResolvedValue({
    username: 'neo',
    nickname: 'Neo',
    email: 'neo@example.com',
    avatar: null,
  });
}

describe('POST /oauth/token grant_type=authorization_code', () => {
  it('happy path:返回 access_token + refresh_token + id_token(OIDC scope)', async () => {
    setupHappyPath('openid profile agent-server');
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: 'auth-code-1',
        redirect_uri: 'https://app/cb',
        client_id: 'web',
        code_verifier: VERIFIER,
      });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.refresh_token).toBeTruthy();
    expect(res.body.id_token).toBeTruthy();
    expect(res.body.token_type).toBe('Bearer');
    expect(res.body.expires_in).toBe(900);
    expect(res.body.scope).toBe('openid profile agent-server');
    expect(res.headers['cache-control']).toContain('no-store');

    const at = decodeJwt(res.body.access_token);
    expect(at.sub).toBe('42');
    expect(at.aud).toContain('agent-server');

    const id = decodeJwt(res.body.id_token);
    expect(id.aud).toBe('web');
    expect(id.nonce).toBe('nonce-1');
    expect(id.name).toBe('Neo');
    expect(id.preferred_username).toBe('neo');
  });

  it('无 OIDC scope 时不返回 id_token', async () => {
    setupHappyPath('agent-server');
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: 'auth-code-1',
        redirect_uri: 'https://app/cb',
        client_id: 'web',
        code_verifier: VERIFIER,
      });
    expect(res.status).toBe(200);
    expect(res.body.id_token).toBeUndefined();
  });

  it('PKCE 不匹配 → invalid_grant', async () => {
    setupHappyPath();
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: 'auth-code-1',
        redirect_uri: 'https://app/cb',
        client_id: 'web',
        code_verifier: 'B'.repeat(64),
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('code 已被用(updateMany count=0)→ invalid_grant', async () => {
    clientFind.mockResolvedValue(prismaPublicRow);
    codeUpdate.mockResolvedValue({ count: 0 });
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: 'used-code',
        redirect_uri: 'https://app/cb',
        client_id: 'web',
        code_verifier: VERIFIER,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('redirect_uri 与 authorize 时不一致 → invalid_grant', async () => {
    setupHappyPath();
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: 'auth-code-1',
        redirect_uri: 'https://app/different',
        client_id: 'web',
        code_verifier: VERIFIER,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('grant_type 错 → unsupported_grant_type', async () => {
    clientFind.mockResolvedValue(prismaPublicRow);
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'password', client_id: 'web' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unsupported_grant_type');
  });
});
