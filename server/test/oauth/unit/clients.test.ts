import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/database/mySql.js', () => ({
  mySql: { execute: vi.fn() },
}));
vi.mock('bcrypt', () => ({
  default: { compare: vi.fn() },
}));

import bcrypt from 'bcrypt';
import { mySql } from '../../../src/database/mySql.js';
import {
  assertGrantAllowed,
  assertRedirectUriAllowed,
  authenticateClient,
  findClient,
  normalizeAndAssertScope,
  requireActiveClient,
} from '../../../src/oauth/clients.js';
import { OAuthError } from '../../../src/oauth/errors.js';

const exec = mySql.execute as unknown as ReturnType<typeof vi.fn>;
const compare = bcrypt.compare as unknown as ReturnType<typeof vi.fn>;

const publicClient = {
  client_id: 'web',
  client_name: 'Web',
  client_type: 'public',
  client_secret_hash: null,
  redirect_uris: ['https://app.example.com/cb'],
  allowed_scopes: ['openid', 'profile', 'agent-server'],
  allowed_grant_types: ['authorization_code', 'refresh_token'],
  token_lifetime_sec: 900,
  refresh_lifetime_sec: 2592000,
  require_pkce: 1,
  disabled: 0,
};

beforeEach(() => {
  exec.mockReset();
  compare.mockReset();
});

describe('findClient / requireActiveClient', () => {
  it('未注册 client → invalid_client', async () => {
    exec.mockResolvedValueOnce([[], []]);
    await expect(requireActiveClient('unknown')).rejects.toMatchObject({
      code: 'invalid_client',
    });
  });

  it('client_id 缺失 → invalid_request', async () => {
    await expect(requireActiveClient(undefined)).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });

  it('disabled = 1 → invalid_client', async () => {
    exec.mockResolvedValueOnce([[{ ...publicClient, disabled: 1 }], []]);
    await expect(requireActiveClient('web')).rejects.toMatchObject({
      code: 'invalid_client',
    });
  });

  it('正常返回',  async () => {
    exec.mockResolvedValueOnce([[publicClient], []]);
    const c = await requireActiveClient('web');
    expect(c.client_id).toBe('web');
    expect(c.require_pkce).toBe(true);
  });

  it('JSON 字段是字符串时自动 parse', async () => {
    exec.mockResolvedValueOnce([[{
      ...publicClient,
      redirect_uris: JSON.stringify(publicClient.redirect_uris),
      allowed_scopes: JSON.stringify(publicClient.allowed_scopes),
      allowed_grant_types: JSON.stringify(publicClient.allowed_grant_types),
    }], []]);
    const c = await findClient('web');
    expect(c?.redirect_uris).toEqual(publicClient.redirect_uris);
  });
});

describe('authenticateClient', () => {
  it('public client 不应带 client_secret', async () => {
    const c = { ...publicClient, client_type: 'public' } as never;
    await expect(authenticateClient(c, 'oops')).rejects.toMatchObject({
      code: 'invalid_client',
    });
  });

  it('public 不提供 secret → 通过', async () => {
    const c = { ...publicClient, client_type: 'public' } as never;
    await expect(authenticateClient(c, undefined)).resolves.toBeUndefined();
  });

  it('confidential 缺 secret → invalid_client', async () => {
    const c = { ...publicClient, client_type: 'confidential', client_secret_hash: 'h' } as never;
    await expect(authenticateClient(c, undefined)).rejects.toMatchObject({
      code: 'invalid_client',
    });
  });

  it('confidential 错 secret → invalid_client', async () => {
    compare.mockResolvedValueOnce(false);
    const c = { ...publicClient, client_type: 'confidential', client_secret_hash: 'h' } as never;
    await expect(authenticateClient(c, 'bad')).rejects.toMatchObject({
      code: 'invalid_client',
    });
  });

  it('confidential 正确 secret → 通过', async () => {
    compare.mockResolvedValueOnce(true);
    const c = { ...publicClient, client_type: 'confidential', client_secret_hash: 'h' } as never;
    await expect(authenticateClient(c, 'good')).resolves.toBeUndefined();
  });
});

describe('assertRedirectUriAllowed', () => {
  it('exact match 通过', () => {
    expect(() =>
      assertRedirectUriAllowed(publicClient as never, 'https://app.example.com/cb'),
    ).not.toThrow();
  });

  it('尾部斜杠不同 → 拒绝', () => {
    expect(() =>
      assertRedirectUriAllowed(publicClient as never, 'https://app.example.com/cb/'),
    ).toThrowError(OAuthError);
  });

  it('查询参数后缀 → 拒绝', () => {
    expect(() =>
      assertRedirectUriAllowed(publicClient as never, 'https://app.example.com/cb?x=1'),
    ).toThrowError(OAuthError);
  });

  it('子域伪装 → 拒绝', () => {
    expect(() =>
      assertRedirectUriAllowed(publicClient as never, 'https://app.example.com.evil.com/cb'),
    ).toThrowError(OAuthError);
  });

  it('缺失 → invalid_request', () => {
    expect(() =>
      assertRedirectUriAllowed(publicClient as never, undefined),
    ).toThrowError(OAuthError);
  });
});

describe('assertGrantAllowed', () => {
  it('允许的 grant → 通过', () => {
    expect(() =>
      assertGrantAllowed(publicClient as never, 'authorization_code'),
    ).not.toThrow();
  });

  it('未允许的 grant → unauthorized_client', () => {
    const c = { ...publicClient, allowed_grant_types: ['authorization_code'] } as never;
    expect(() => assertGrantAllowed(c, 'refresh_token')).toThrowError(OAuthError);
  });
});

describe('normalizeAndAssertScope', () => {
  it('返回去重的 scope 字符串', () => {
    const s = normalizeAndAssertScope(publicClient as never, 'openid profile openid');
    const set = new Set(s.split(' '));
    expect(set.size).toBe(2);
    expect(set.has('openid')).toBe(true);
    expect(set.has('profile')).toBe(true);
  });

  it('请求超出允许范围 → invalid_scope', () => {
    expect(() =>
      normalizeAndAssertScope(publicClient as never, 'openid admin'),
    ).toThrowError(OAuthError);
  });

  it('scope 为空 → invalid_scope', () => {
    expect(() => normalizeAndAssertScope(publicClient as never, undefined)).toThrowError(OAuthError);
  });
});
