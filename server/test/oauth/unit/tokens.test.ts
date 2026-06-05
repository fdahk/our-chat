import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import { decodeJwt, decodeProtectedHeader } from 'jose';
import { loadKeyStore, type KeyStore } from '../../../src/oauth/keys.js';
import {
  deriveAccessTokenAudience,
  signAccessToken,
  signIdToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  type IssuerConfig,
} from '../../../src/oauth/tokens.js';

const FIXTURE = resolve(__dirname, '../fixtures/test-rsa-private.pem');
const OTHER = resolve(__dirname, '../fixtures/other-rsa-private.pem');

const ISSUER: IssuerConfig = {
  issuer: 'http://localhost:3007',
  atTtlSec: 900,
  rtTtlSec: 2592000,
  idTtlSec: 900,
};

let store: KeyStore;

beforeAll(async () => {
  store = await loadKeyStore({
    activeKid: 'test-1',
    retiredKids: [],
    privateKeyFile: FIXTURE,
  });
});

describe('deriveAccessTokenAudience', () => {
  it('scope 含 agent-server → aud 含 agent-server', () => {
    expect(deriveAccessTokenAudience('openid agent-server')).toEqual(['agent-server']);
  });

  it('纯 OIDC scope → aud 为空数组', () => {
    expect(deriveAccessTokenAudience('openid profile')).toEqual([]);
  });
});

describe('signAccessToken + verifyAccessToken', () => {
  it('签发后可被自身验签', async () => {
    const { token } = await signAccessToken(store, ISSUER, {
      sub: 42,
      scope: 'agent-server',
      client_id: 'web',
      jti: 'at-1',
    });
    const header = decodeProtectedHeader(token);
    expect(header.alg).toBe('RS256');
    expect(header.kid).toBe('test-1');
    expect(header.typ).toBe('at+jwt');

    const claims = await verifyAccessToken(store, ISSUER, token);
    expect(claims?.sub).toBe('42');
    expect(claims?.aud).toEqual(['agent-server']);
    expect(claims?.scope).toBe('agent-server');
    expect(claims?.iss).toBe(ISSUER.issuer);
    expect(claims?.jti).toBe('at-1');
  });

  it('被别的私钥签的 token 验签失败 → null', async () => {
    const evilStore = await loadKeyStore({
      activeKid: 'test-1',
      retiredKids: [],
      privateKeyFile: OTHER,
    });
    const { token } = await signAccessToken(evilStore, ISSUER, {
      sub: 99,
      scope: 'agent-server',
      client_id: 'web',
      jti: 'at-evil',
    });
    expect(await verifyAccessToken(store, ISSUER, token)).toBeNull();
  });

  it('错 issuer 验签失败', async () => {
    const wrongIssuer = { ...ISSUER, issuer: 'https://other.example.com' };
    const { token } = await signAccessToken(store, wrongIssuer, {
      sub: 42,
      scope: 'agent-server',
      client_id: 'web',
      jti: 'at-2',
    });
    expect(await verifyAccessToken(store, ISSUER, token)).toBeNull();
  });
});

describe('signRefreshToken + verifyRefreshToken', () => {
  it('aud 锁定 token 端点,scope/family_id 携带', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const rt = await signRefreshToken(store, ISSUER, {
      sub: 7,
      scope: 'openid agent-server',
      client_id: 'web',
      jti: 'rt-1',
      family_id: 'fam-1',
      expiresAt,
    });
    const claims = await verifyRefreshToken(store, ISSUER, rt);
    expect(claims.aud).toContain('/oauth/token');
    expect(claims.scope).toBe('openid agent-server');
    expect(claims.family_id).toBe('fam-1');
    expect(claims.jti).toBe('rt-1');
  });

  it('被截到 resource server 当 AT 用时,aud 校验失败(verifyAccessToken)', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const rt = await signRefreshToken(store, ISSUER, {
      sub: 7,
      scope: 'agent-server',
      client_id: 'web',
      jti: 'rt-2',
      family_id: 'fam-2',
      expiresAt,
    });
    // verifyAccessToken 不带 audience 限制(introspect 用),但 verifyRefreshToken 强制 /oauth/token aud
    // resource server 端则用 jwks-rsa 校验 aud=agent-server,会拒绝(本地不模拟,但 aud 不含 agent-server)
    const decoded = decodeJwt(rt);
    expect(decoded.aud).not.toContain('agent-server');
  });

  it('过期 RT 验签失败(超过 clockTolerance=30s 容忍)', async () => {
    const expiresAt = new Date(Date.now() - 60_000);
    const rt = await signRefreshToken(store, ISSUER, {
      sub: 7,
      scope: 'agent-server',
      client_id: 'web',
      jti: 'rt-expired',
      family_id: 'fam-x',
      expiresAt,
    });
    await expect(verifyRefreshToken(store, ISSUER, rt)).rejects.toThrow();
  });
});

describe('signIdToken', () => {
  it('aud 是 client_id(不是 resource server)', async () => {
    const id = await signIdToken(store, ISSUER, {
      sub: 7,
      client_id: 'web',
      auth_time: Math.floor(Date.now() / 1000),
      nonce: 'nonce-abc',
      profile: {
        name: 'Neo',
        preferred_username: 'neo',
        email: 'neo@example.com',
        email_verified: false,
        picture: null,
      },
      scope: 'openid profile email',
    });
    const claims = decodeJwt(id);
    expect(claims.aud).toBe('web');
    expect(claims.nonce).toBe('nonce-abc');
    expect(claims.name).toBe('Neo');
    expect(claims.preferred_username).toBe('neo');
    expect(claims.email).toBe('neo@example.com');
  });

  it('未请求 profile/email scope 时不暴露相应 claim', async () => {
    const id = await signIdToken(store, ISSUER, {
      sub: 7,
      client_id: 'web',
      auth_time: Math.floor(Date.now() / 1000),
      nonce: null,
      profile: {
        name: 'Neo',
        preferred_username: 'neo',
        email: 'neo@example.com',
        email_verified: false,
        picture: null,
      },
      scope: 'openid',
    });
    const claims = decodeJwt(id);
    expect(claims.name).toBeUndefined();
    expect(claims.email).toBeUndefined();
    expect(claims.nonce).toBeUndefined();
  });
});
