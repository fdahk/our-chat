// OAuth IdP 模块的装配入口
// 在 app.ts 里调用 mountOAuth(app, store, issuer) 即可挂载全部端点

import { Router, type Application, type Router as ExpressRouter } from 'express';
import { makeAuthorizeHandler } from './authorize.js';
import { makeDiscoveryHandler } from './discovery.js';
import { makeIntrospectHandler } from './introspect.js';
import { makeJwksHandler } from './jwks.js';
import { makeRevokeHandler } from './revoke.js';
import { makeTokenHandler } from './token.js';
import { makeUserInfoHandler } from './userinfo.js';
import type { KeyStore } from './keys.js';
import type { IssuerConfig } from './tokens.js';

export interface MountOptions {
  codeTtlSec?: number;
  loginPath?: string;
}

export function mountOAuth(
  app: Application,
  store: KeyStore,
  issuer: IssuerConfig,
  opts: MountOptions = {},
): void {
  const codeTtlSec = opts.codeTtlSec ?? 60;
  const loginPath = opts.loginPath ?? '/login';

  // Discovery + JWKS 不挂在 /oauth 下,放 .well-known 根路径
  app.get('/.well-known/openid-configuration', makeDiscoveryHandler(issuer));
  app.get('/.well-known/jwks.json', makeJwksHandler(store));

  const r: ExpressRouter = Router();
  r.get('/authorize', makeAuthorizeHandler({ codeTtlSec, loginPath }));
  r.post('/token', makeTokenHandler({ store, issuer }));
  r.post('/revoke', makeRevokeHandler({ store, issuer }));
  r.post('/introspect', makeIntrospectHandler({ store, issuer }));
  r.get('/userinfo', makeUserInfoHandler({ store, issuer }));
  app.use('/oauth', r);
}

export * from './keys.js';
export * from './tokens.js';
export * from './types.js';
export * from './errors.js';
export * from './init.js';
