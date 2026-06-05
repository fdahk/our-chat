// authorization_code grant happy path + 关键拒绝分支

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import express from 'express';
import request from 'supertest';
import { decodeJwt } from 'jose';

vi.mock('../../../src/database/mySql.js', () => {
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    execute: vi.fn(),
  };
  return {
    mySql: {
      execute: vi.fn(),
      getConnection: vi.fn(async () => conn),
      __conn: conn,
    },
  };
});

import { mySql } from '../../../src/database/mySql.js';
import { mountOAuth, loadKeyStore, type IssuerConfig } from '../../../src/oauth/index.js';
import { deriveS256Challenge } from '../../../src/oauth/pkce.js';

const FIXTURE = resolve(__dirname, '../fixtures/test-rsa-private.pem');

const ISSUER: IssuerConfig = {
  issuer: 'http://test.example.com',
  atTtlSec: 900,
  rtTtlSec: 2592000,
  idTtlSec: 900,
};

const exec = mySql.execute as unknown as ReturnType<typeof vi.fn>;
// @ts-expect-error mock 暴露 conn
const conn = mySql.__conn as {
  execute: ReturnType<typeof vi.fn>;
  beginTransaction: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
  rollback: ReturnType<typeof vi.fn>;
};

const publicClient = {
  client_id: 'web',
  client_name: 'Web',
  client_type: 'public',
  client_secret_hash: null,
  redirect_uris: ['https://app/cb'],
  allowed_scopes: ['openid', 'profile', 'agent-server'],
  allowed_grant_types: ['authorization_code', 'refresh_token'],
  token_lifetime_sec: 900,
  refresh_lifetime_sec: 2592000,
  require_pkce: 1,
  disabled: 0,
};

let app: express.Express;

const VERIFIER = 'A'.repeat(64);
const CHALLENGE = deriveS256Challenge(VERIFIER);

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
  exec.mockReset();
  conn.execute.mockReset();
});

function setupValidCodeFlow(scope = 'openid agent-server') {
  exec.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM oauth_clients')) return [[publicClient], []];
    // consumeCode 的 UPDATE
    if (sql.includes('UPDATE oauth_codes')) return [{ affectedRows: 1 }, []];
    // consumeCode 的 SELECT
    if (sql.includes('FROM oauth_codes')) {
      return [
        [{
          code: 'auth-code-1',
          client_id: 'web',
          user_id: 42,
          redirect_uri: 'https://app/cb',
          code_challenge: CHALLENGE,
          code_challenge_method: 'S256',
          scope,
          nonce: 'nonce-1',
          expires_at: new Date(Date.now() + 60_000),
          used: 1,
        }],
        [],
      ];
    }
    if (sql.includes('INSERT INTO oauth_refresh_tokens')) return [{ affectedRows: 1 }, []];
    // loadProfile
    if (sql.includes('FROM users')) {
      return [
        [{
          id: 42,
          username: 'neo',
          nickname: 'Neo',
          email: 'neo@example.com',
          avatar: null,
        }],
        [],
      ];
    }
    return [[], []];
  });
}

describe('POST /oauth/token grant_type=authorization_code', () => {
  it('happy path:返回 access_token + refresh_token + id_token(OIDC scope)', async () => {
    setupValidCodeFlow('openid profile agent-server');
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

    // 校验 access_token claims
    const at = decodeJwt(res.body.access_token);
    expect(at.sub).toBe('42');
    expect(at.iss).toBe(ISSUER.issuer);
    expect(at.aud).toContain('agent-server');
    expect(at.scope).toContain('agent-server');

    // 校验 id_token claims
    const id = decodeJwt(res.body.id_token);
    expect(id.aud).toBe('web');
    expect(id.nonce).toBe('nonce-1');
    expect(id.name).toBe('Neo');
    expect(id.preferred_username).toBe('neo');
  });

  it('无 OIDC scope 时不返回 id_token', async () => {
    setupValidCodeFlow('agent-server');
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
    setupValidCodeFlow();
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

  it('code 已被用(UPDATE 影响 0)→ invalid_grant', async () => {
    exec.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM oauth_clients')) return [[publicClient], []];
      if (sql.includes('UPDATE oauth_codes')) return [{ affectedRows: 0 }, []];
      return [[], []];
    });
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
    setupValidCodeFlow();
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

  it('code 与 client 不一致 → invalid_grant', async () => {
    setupValidCodeFlow();
    // 替换 publicClient.client_id
    exec.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM oauth_clients')) return [[{ ...publicClient, client_id: 'other' }], []];
      if (sql.includes('UPDATE oauth_codes')) return [{ affectedRows: 1 }, []];
      if (sql.includes('FROM oauth_codes')) {
        return [[{
          code: 'auth-code-1',
          client_id: 'web', // 跟 publicClient.client_id 'other' 不一致
          user_id: 42,
          redirect_uri: 'https://app/cb',
          code_challenge: CHALLENGE,
          code_challenge_method: 'S256',
          scope: 'agent-server',
          nonce: null,
          expires_at: new Date(Date.now() + 60_000),
          used: 1,
        }], []];
      }
      return [[], []];
    });
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: 'auth-code-1',
        redirect_uri: 'https://app/cb',
        client_id: 'other',
        code_verifier: VERIFIER,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('grant_type 错 → unsupported_grant_type', async () => {
    exec.mockResolvedValue([[publicClient], []]);
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'password',
        client_id: 'web',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unsupported_grant_type');
  });
});
