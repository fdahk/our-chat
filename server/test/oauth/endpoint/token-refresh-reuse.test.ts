// 重头戏:refresh_token grant rotation + reuse 检测
// 验证攻击者偷一根 RT 用过后,受害者再用会触发整 family 被烧

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import express from 'express';
import request from 'supertest';

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
import { signRefreshToken } from '../../../src/oauth/tokens.js';

const FIXTURE = resolve(__dirname, '../fixtures/test-rsa-private.pem');

const ISSUER: IssuerConfig = {
  issuer: 'http://test.example.com',
  atTtlSec: 900,
  rtTtlSec: 2592000,
  idTtlSec: 900,
};

const exec = mySql.execute as unknown as ReturnType<typeof vi.fn>;
const getConn = mySql.getConnection as unknown as ReturnType<typeof vi.fn>;
// @ts-expect-error mock 暴露内部 conn
const conn = mySql.__conn as {
  beginTransaction: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
  rollback: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
};

const publicClient = {
  client_id: 'web',
  client_name: 'Web',
  client_type: 'public',
  client_secret_hash: null,
  redirect_uris: ['https://app/cb'],
  allowed_scopes: ['openid', 'agent-server'],
  allowed_grant_types: ['authorization_code', 'refresh_token'],
  token_lifetime_sec: 900,
  refresh_lifetime_sec: 2592000,
  require_pkce: 1,
  disabled: 0,
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

  // 预签一根 valid RT,jti=rt-victim,family=fam-1
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
  exec.mockReset();
  conn.execute.mockReset();
  conn.beginTransaction.mockClear();
  conn.commit.mockClear();
  conn.rollback.mockClear();
  conn.release.mockClear();
  getConn.mockClear();
});

// 模拟 DB 行:client 查询 + RT 行查询。
function setupDbForActiveRt() {
  exec.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM oauth_clients')) return [[publicClient], []];
    if (sql.includes('FROM oauth_refresh_tokens')) {
      return [
        [{
          jti: 'rt-victim',
          family_id: 'fam-1',
          client_id: 'web',
          user_id: 7,
          scope: 'agent-server',
          issued_at: new Date(),
          expires_at: new Date(Date.now() + 60_000),
          revoked: 0,
          rotated_to: null,
          rotated_at: null,
          revoke_reason: null,
        }],
        [],
      ];
    }
    return [[], []];
  });
}

function setupTxRotateSuccess() {
  conn.execute.mockImplementation(async (sql: string) => {
    if (sql.includes('INSERT INTO oauth_refresh_tokens')) return [{ affectedRows: 1 }, []];
    if (sql.includes('UPDATE oauth_refresh_tokens')) return [{ affectedRows: 1 }, []];
    return [{ affectedRows: 0 }, []];
  });
}

function setupTxRotateRace() {
  conn.execute.mockImplementation(async (sql: string) => {
    if (sql.includes('INSERT INTO oauth_refresh_tokens')) return [{ affectedRows: 1 }, []];
    // 关键:UPDATE 影响 0 行,模拟并发已被抢
    if (sql.includes('UPDATE oauth_refresh_tokens')) return [{ affectedRows: 0 }, []];
    return [{ affectedRows: 0 }, []];
  });
}

describe('POST /oauth/token grant_type=refresh_token', () => {
  it('正常 refresh:返回新 AT + 新 RT,旧 RT rotation 写入', async () => {
    setupDbForActiveRt();
    setupTxRotateSuccess();
    // 孤儿清理 + 任何其他 execute 默认成功
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
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
  });

  it('reuse 检测(场景 A:DB 行已 rotated_to):family invalidate + invalid_grant', async () => {
    // 已 rotation 过的 RT
    exec.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM oauth_clients')) return [[publicClient], []];
      if (sql.includes('FROM oauth_refresh_tokens')) {
        return [[{
          jti: 'rt-victim',
          family_id: 'fam-1',
          client_id: 'web',
          user_id: 7,
          scope: 'agent-server',
          issued_at: new Date(),
          expires_at: new Date(Date.now() + 60_000),
          revoked: 0,
          rotated_to: 'rt-already-used',
          rotated_at: new Date(),
          revoke_reason: 'rotation',
        }], []];
      }
      if (sql.includes('UPDATE oauth_refresh_tokens')) return [{ affectedRows: 3 }, []];
      return [[], []];
    });
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
    // 验证 family invalidate 被触发
    const sqlCalls = exec.mock.calls.map((c) => c[0] as string);
    expect(sqlCalls.some((s) => s.includes('UPDATE oauth_refresh_tokens') && s.includes('family_id'))).toBe(true);
  });

  it('reuse 检测(场景 B:DB 已 revoked):invalid_grant', async () => {
    exec.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM oauth_clients')) return [[publicClient], []];
      if (sql.includes('FROM oauth_refresh_tokens')) {
        return [[{
          jti: 'rt-victim',
          family_id: 'fam-1',
          client_id: 'web',
          user_id: 7,
          scope: 'agent-server',
          issued_at: new Date(),
          expires_at: new Date(Date.now() + 60_000),
          revoked: 1,
          rotated_to: null,
          rotated_at: null,
          revoke_reason: 'logout',
        }], []];
      }
      if (sql.includes('UPDATE oauth_refresh_tokens')) return [{ affectedRows: 0 }, []];
      return [[], []];
    });
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

  it('reuse 检测(场景 C:并发 race rotation UPDATE 影响 0):family invalidate', async () => {
    setupDbForActiveRt();
    setupTxRotateRace();
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
    expect(conn.rollback).toHaveBeenCalled();
  });

  it('client_id 不匹配 RT.client_id → invalid_grant', async () => {
    setupDbForActiveRt();
    const otherClient = { ...publicClient, client_id: 'other' };
    exec.mockImplementationOnce(async () => [[otherClient], []]);
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
    exec.mockResolvedValue([[publicClient], []]);
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', client_id: 'web' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
  });

  it('scope 收缩允许', async () => {
    setupDbForActiveRt();
    setupTxRotateSuccess();
    // 多 scope RT 收缩到一个 scope
    const store = await loadKeyStore({
      activeKid: 'test-1',
      retiredKids: [],
      privateKeyFile: FIXTURE,
    });
    const rt2 = await signRefreshToken(store, ISSUER, {
      sub: 7,
      scope: 'openid agent-server',
      client_id: 'web',
      jti: 'rt-victim',
      family_id: 'fam-1',
      expiresAt: new Date(Date.now() + 60_000),
    });
    // DB 存的 stored.scope 是 'openid agent-server'
    exec.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM oauth_clients')) return [[publicClient], []];
      if (sql.includes('FROM oauth_refresh_tokens')) {
        return [[{
          jti: 'rt-victim',
          family_id: 'fam-1',
          client_id: 'web',
          user_id: 7,
          scope: 'openid agent-server',
          issued_at: new Date(),
          expires_at: new Date(Date.now() + 60_000),
          revoked: 0,
          rotated_to: null,
          rotated_at: null,
          revoke_reason: null,
        }], []];
      }
      return [[], []];
    });
    const res = await request(app)
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: rt2,
        client_id: 'web',
        scope: 'agent-server',
      });
    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('agent-server');
  });

  it('scope 扩展拒绝(invalid_scope)', async () => {
    setupDbForActiveRt();
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
