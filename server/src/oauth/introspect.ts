// POST /oauth/introspect,RFC 7662
// 仅 confidential client 可调,响应不区分"不存在"与"已撤销"——一律 active=false

import type { RequestHandler } from 'express';
import { authenticateClient, requireActiveClient } from './clients.js';
import { asOAuthError, OAuthError, sendOAuthErrorJson } from './errors.js';
import type { KeyStore } from './keys.js';
import { findRefreshToken } from './storage.js';
import {
  verifyAccessToken,
  verifyRefreshToken,
  type IssuerConfig,
} from './tokens.js';

interface MakeIntrospectOptions {
  store: KeyStore;
  issuer: IssuerConfig;
}

export function makeIntrospectHandler(opts: MakeIntrospectOptions): RequestHandler {
  return async (req, res) => {
    try {
      const body = req.body as Record<string, string | undefined>;
      const client = await requireActiveClient(body.client_id);

      // 只允许 confidential client(RFC 7662 §2.1)
      if (client.client_type !== 'confidential') {
        throw new OAuthError('invalid_client', '仅 confidential client 可调用 introspect');
      }
      await authenticateClient(client, body.client_secret);

      const token = body.token;
      const hint = body.token_type_hint;
      if (!token) {
        return res.json({ active: false });
      }

      // 按 hint 先试一遍,失败再试另一种
      const tryOrder = hint === 'refresh_token'
        ? ['refresh_token', 'access_token']
        : ['access_token', 'refresh_token'];

      for (const kind of tryOrder) {
        if (kind === 'access_token') {
          const claims = await verifyAccessToken(opts.store, opts.issuer, token);
          if (claims) {
            return res.json({
              active: true,
              token_type: 'Bearer',
              scope: claims.scope,
              client_id: claims.client_id,
              sub: claims.sub,
              aud: claims.aud,
              iss: claims.iss,
              exp: claims.exp,
              iat: claims.iat,
              jti: claims.jti,
            });
          }
        } else {
          try {
            const claims = await verifyRefreshToken(opts.store, opts.issuer, token);
            const stored = await findRefreshToken(claims.jti);
            if (stored && !stored.revoked && !stored.rotated_to
              && stored.expires_at.getTime() > Date.now()) {
              return res.json({
                active: true,
                token_type: 'refresh_token',
                scope: claims.scope,
                client_id: claims.client_id,
                sub: claims.sub,
                aud: claims.aud,
                iss: claims.iss,
                exp: claims.exp,
                iat: claims.iat,
                jti: claims.jti,
              });
            }
          } catch {
            // 继续尝试下一种
          }
        }
      }
      return res.json({ active: false });
    } catch (e) {
      return sendOAuthErrorJson(res, asOAuthError(e));
    }
  };
}
