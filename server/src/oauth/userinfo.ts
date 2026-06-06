// GET /oauth/userinfo,OIDC Core 1.0
// 返回字段取决于 access_token 的 scope:openid → sub;profile → name 等;email → email

import type { RequestHandler } from 'express';
import { prisma } from '../database/prisma.js';
import { asOAuthError, OAuthError, sendOAuthErrorJson } from './errors.js';
import type { KeyStore } from './keys.js';
import { verifyAccessToken, type IssuerConfig } from './tokens.js';

interface MakeUserInfoOptions {
  store: KeyStore;
  issuer: IssuerConfig;
}

export function makeUserInfoHandler(opts: MakeUserInfoOptions): RequestHandler {
  return async (req, res) => {
    try {
      const h = req.headers.authorization;
      if (!h || !h.startsWith('Bearer ')) {
        throw new OAuthError('invalid_request', '缺少 Bearer token');
      }
      const at = h.slice(7).trim();
      const claims = await verifyAccessToken(opts.store, opts.issuer, at);
      if (!claims) throw new OAuthError('invalid_grant', 'access_token 无效');

      const scopes = new Set(claims.scope.split(/\s+/));
      if (!scopes.has('openid')) {
        throw new OAuthError('invalid_request', 'access_token 未授予 openid scope');
      }

      const user = await prisma.user.findUnique({
        where: { id: BigInt(Number(claims.sub)) },
        select: { id: true, username: true, nickname: true, email: true, avatar: true },
      });
      if (!user) throw new OAuthError('invalid_grant', '用户不存在');

      const body: Record<string, unknown> = { sub: String(user.id) };
      if (scopes.has('profile')) {
        body.name = user.nickname ?? user.username;
        body.preferred_username = user.username;
        body.picture = user.avatar;
      }
      if (scopes.has('email')) {
        body.email = user.email;
        body.email_verified = false;
      }
      return res.json(body);
    } catch (e) {
      return sendOAuthErrorJson(res, asOAuthError(e));
    }
  };
}
