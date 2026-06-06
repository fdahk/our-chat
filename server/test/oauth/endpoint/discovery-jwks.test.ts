import { describe, it, expect, beforeAll, vi } from 'vitest';
import { resolve } from 'node:path';
import express from 'express';
import request from 'supertest';

// discovery/jwks 端点不查 DB,但 oauth/index.js 传递性 import prisma,需 stub 避免真实例化
vi.mock('../../../src/database/prisma.js', () => ({ prisma: {} }));

import { mountOAuth, loadKeyStore, type IssuerConfig } from '../../../src/oauth/index.js';

const FIXTURE = resolve(__dirname, '../fixtures/test-rsa-private.pem');

const ISSUER: IssuerConfig = {
  issuer: 'http://test.example.com',
  atTtlSec: 900,
  rtTtlSec: 2592000,
  idTtlSec: 900,
};

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

describe('GET /.well-known/openid-configuration', () => {
  it('返回标准 Discovery 文档,issuer 与端点 URL 一致', async () => {
    const res = await request(app).get('/.well-known/openid-configuration');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      issuer: ISSUER.issuer,
      authorization_endpoint: `${ISSUER.issuer}/oauth/authorize`,
      token_endpoint: `${ISSUER.issuer}/oauth/token`,
      revocation_endpoint: `${ISSUER.issuer}/oauth/revoke`,
      introspection_endpoint: `${ISSUER.issuer}/oauth/introspect`,
      userinfo_endpoint: `${ISSUER.issuer}/oauth/userinfo`,
      jwks_uri: `${ISSUER.issuer}/.well-known/jwks.json`,
    });
    expect(res.body.response_types_supported).toEqual(['code']);
    expect(res.body.code_challenge_methods_supported).toEqual(['S256']);
    expect(res.body.id_token_signing_alg_values_supported).toEqual(['RS256']);
  });

  it('带 1 小时缓存头', async () => {
    const res = await request(app).get('/.well-known/openid-configuration');
    expect(res.headers['cache-control']).toContain('max-age=3600');
  });
});

describe('GET /.well-known/jwks.json', () => {
  it('返回公钥 JWK,kid/alg/use 齐全,不含私钥参数', async () => {
    const res = await request(app).get('/.well-known/jwks.json');
    expect(res.status).toBe(200);
    expect(res.body.keys).toHaveLength(1);
    const k = res.body.keys[0];
    expect(k.kid).toBe('test-1');
    expect(k.alg).toBe('RS256');
    expect(k.use).toBe('sig');
    expect(k.kty).toBe('RSA');
    expect(k.n).toBeTruthy();
    expect(k.e).toBe('AQAB');
    expect(k).not.toHaveProperty('d');
    expect(k).not.toHaveProperty('p');
    expect(k).not.toHaveProperty('q');
  });

  it('10 分钟缓存头', async () => {
    const res = await request(app).get('/.well-known/jwks.json');
    expect(res.headers['cache-control']).toContain('max-age=600');
  });
});
