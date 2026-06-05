// GET /oauth/userinfo,OIDC Core 1.0
// 返回字段取决于 access_token 的 scope:openid → sub;profile → name 等;email → email

import type { RequestHandler } from 'express';
import type { RowDataPacket } from 'mysql2';
import { mySql } from '../database/mySql.js';
import { asOAuthError, OAuthError, sendOAuthErrorJson } from './errors.js';
import type { KeyStore } from './keys.js';
import { verifyAccessToken, type IssuerConfig } from './tokens.js';

interface MakeUserInfoOptions {
  store: KeyStore;
  issuer: IssuerConfig;
}

interface UserRow extends RowDataPacket {
  id: number;
  username: string | null;
  nickname: string | null;
  email: string | null;
  avatar: string | null;
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

      const [rows] = await mySql.execute<UserRow[]>(
        'SELECT id, username, nickname, email, avatar FROM users WHERE id = ? LIMIT 1',
        [Number(claims.sub)],
      );
      const user = rows[0];
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
