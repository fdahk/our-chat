// GET /oauth/authorize
// PKCE 授权码端点。未登录时跳 our-chat 登录页,登录后回流继续

import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { TOKEN_COOKIE } from '../utils/authCookies.js';
import { config as appConfig } from '../config/config.js';
import { audit, reqContext } from './audit.js';
import {
  assertGrantAllowed,
  assertRedirectUriAllowed,
  normalizeAndAssertScope,
  requireActiveClient,
} from './clients.js';
import { buildRedirectError, OAuthError, sendOAuthErrorJson } from './errors.js';
import { createCode } from './storage.js';
import type { AuthorizeQuery } from './types.js';
import { OIDC_SCOPES } from './types.js';

interface SessionPayload {
  id: number;
}

interface MakeAuthorizeOptions {
  codeTtlSec: number;
  loginPath?: string;       // 默认 /login
}

export function makeAuthorizeHandler(opts: MakeAuthorizeOptions): RequestHandler {
  const loginPath = opts.loginPath ?? '/login';
  return async (req, res) => {
    const q = req.query as AuthorizeQuery;

    // 1. 校验 client_id + redirect_uri:任一失败 → 400,绝不重定向(防 open redirect)
    let client;
    try {
      client = await requireActiveClient(q.client_id);
      assertRedirectUriAllowed(client, q.redirect_uri);
      assertGrantAllowed(client, 'authorization_code');
    } catch (e) {
      const err = e instanceof OAuthError ? e : new OAuthError('server_error');
      audit({ event: 'param_invalid', client_id: q.client_id, reason: err.code, ...reqContext(req) });
      return sendOAuthErrorJson(res, err);
    }

    // 2. 校验其他参数 → 走 redirect 回带 error
    const state = typeof q.state === 'string' ? q.state : undefined;
    try {
      if (q.response_type !== 'code') {
        throw new OAuthError('unsupported_response_type', 'response_type 必须为 code');
      }
      if (!state) {
        throw new OAuthError('invalid_request', 'state 缺失');
      }
      if (client.require_pkce) {
        if (!q.code_challenge) throw new OAuthError('invalid_request', 'code_challenge 缺失');
        if (q.code_challenge_method !== 'S256') {
          throw new OAuthError('invalid_request', 'code_challenge_method 必须为 S256');
        }
      }
      const scope = normalizeAndAssertScope(client, q.scope);
      // OIDC scope 时 nonce 强制(RFC OIDC Core §3.1.2.1)
      const isOidc = scope.split(/\s+/).some((s) => OIDC_SCOPES.has(s));
      if (isOidc && !q.nonce) {
        throw new OAuthError('invalid_request', 'nonce 缺失(OIDC scope 强制)');
      }

      // 3. 校验登录态:读 our-chat HttpOnly token cookie
      const sessionToken = req.cookies?.[TOKEN_COOKIE] as string | undefined;
      if (!sessionToken) {
        const next = encodeURIComponent(req.originalUrl);
        return res.redirect(302, `${loginPath}?next=${next}`);
      }
      let userId: number;
      try {
        const decoded = jwt.verify(sessionToken, appConfig.jwtSecret) as SessionPayload;
        userId = decoded.id;
      } catch {
        const next = encodeURIComponent(req.originalUrl);
        return res.redirect(302, `${loginPath}?next=${next}`);
      }

      // 4. 生成 code 入库
      const code = await createCode({
        client_id: client.client_id,
        user_id: userId,
        redirect_uri: q.redirect_uri!,
        code_challenge: q.code_challenge!,
        code_challenge_method: 'S256',
        scope,
        nonce: typeof q.nonce === 'string' ? q.nonce : null,
        ttlSec: opts.codeTtlSec,
      });

      audit({
        event: 'code_issued',
        client_id: client.client_id,
        user_id: userId,
        scope,
        ...reqContext(req),
      });

      const url = new URL(q.redirect_uri!);
      url.searchParams.set('code', code);
      url.searchParams.set('state', state);
      return res.redirect(302, url.toString());
    } catch (e) {
      const err = e instanceof OAuthError ? e : new OAuthError('server_error');
      audit({
        event: err.code === 'server_error' ? 'internal_error' : 'param_invalid',
        client_id: client.client_id,
        reason: err.code,
        ...reqContext(req),
      });
      return res.redirect(302, buildRedirectError(q.redirect_uri!, err, state));
    }
  };
}
