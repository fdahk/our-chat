import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import {
  buildJwksResponse,
  loadKeyStore,
  readKeyOptionsFromEnv,
} from '../../../src/oauth/keys.js';

const FIXTURE = resolve(__dirname, '../fixtures/test-rsa-private.pem');

describe('keys.loadKeyStore', () => {
  it('单 kid:active 加载并暴露公钥 JWK', async () => {
    const store = await loadKeyStore({
      activeKid: 'test-1',
      retiredKids: [],
      privateKeyFile: FIXTURE,
    });
    expect(store.active.kid).toBe('test-1');
    expect(store.active.publicJwk.kid).toBe('test-1');
    expect(store.active.publicJwk.kty).toBe('RSA');
    expect(store.active.publicJwk.alg).toBe('RS256');
    expect(store.active.publicJwk.use).toBe('sig');
    // 公钥不应包含私钥参数
    expect(store.active.publicJwk).not.toHaveProperty('d');
    expect(store.active.publicJwk).not.toHaveProperty('p');
    expect(store.active.publicJwk).not.toHaveProperty('q');
  });

  it('文件不存在直接抛错(fail-fast)', async () => {
    await expect(
      loadKeyStore({
        activeKid: 'absent',
        retiredKids: [],
        privateKeyFile: '/no/such/file.pem',
      }),
    ).rejects.toThrow();
  });

  it('非 PEM 私钥拒绝', async () => {
    await expect(
      loadKeyStore({
        activeKid: 'bad',
        retiredKids: [],
        privateKeyFile: resolve(__dirname, 'keys.test.ts'),
      }),
    ).rejects.toThrow();
  });
});

describe('keys.buildJwksResponse', () => {
  it('返回的 keys 数组包含全部 kid 的公钥', async () => {
    const store = await loadKeyStore({
      activeKid: 'test-1',
      retiredKids: [],
      privateKeyFile: FIXTURE,
    });
    const jwks = buildJwksResponse(store);
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0].kid).toBe('test-1');
  });
});

describe('keys.readKeyOptionsFromEnv', () => {
  it('缺少 OAUTH_ACTIVE_KID 抛错', () => {
    const prev = process.env.OAUTH_ACTIVE_KID;
    delete process.env.OAUTH_ACTIVE_KID;
    try {
      expect(() => readKeyOptionsFromEnv()).toThrow();
    } finally {
      if (prev !== undefined) process.env.OAUTH_ACTIVE_KID = prev;
    }
  });

  it('OAUTH_RETIRED_KIDS 逗号分隔解析', () => {
    process.env.OAUTH_ACTIVE_KID = 'a';
    process.env.OAUTH_RETIRED_KIDS = 'b, c , d';
    const o = readKeyOptionsFromEnv();
    expect(o.activeKid).toBe('a');
    expect(o.retiredKids).toEqual(['b', 'c', 'd']);
  });
});
