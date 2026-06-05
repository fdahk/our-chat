// POST /oauth/revoke,RFC 7009
// 行为:无论 token 是否存在,始终返回 200(防探测)。仅 refresh_token 真实撤销

import type { RequestHandler } from 'express';
import { audit, reqContext } from './audit.js';
import { authenticateClient, requireActiveClient } from './clients.js';
import { asOAuthError, sendOAuthErrorJson } from './errors.js';
import type { KeyStore } from './keys.js';
import { revokeRefreshTokenByJti } from './storage.js';
import { verifyRefreshToken, type IssuerConfig } from './tokens.js';

interface MakeRevokeOptions {
  store: KeyStore;
  issuer: IssuerConfig;
}

export function makeRevokeHandler(opts: MakeRevokeOptions): RequestHandler {
  return async (req, res) => {
    try {
      const body = req.body as Record<string, string | undefined>;
      const client = await requireActiveClient(body.client_id);
      await authenticateClient(client, body.client_secret);
      const token = body.token;
      const hint = body.token_type_hint;

      if (!token) {
        // RFC 7009 §2.2:token 缺失也返回 200(不允许探测)
        return res.status(200).end();
      }

      // 仅当 hint 不是 access_token 时尝试撤销 refresh_token(AT 走自然过期,本系统不维护黑名单)
      if (hint !== 'access_token') {
        try {
          const claims = await verifyRefreshToken(opts.store, opts.issuer, token);
          if (claims.client_id === client.client_id) {
            const revoked = await revokeRefreshTokenByJti(claims.jti, 'logout');
            if (revoked) {
              audit({
                event: 'token_revoked',
                jti: claims.jti,
                user_id: Number(claims.sub),
                client_id: client.client_id,
                reason: 'logout',
                ...reqContext(req),
              });
            }
          }
        } catch {
          // 无效 token 也静默 200,不暴露原因
        }
      }
      return res.status(200).end();
    } catch (e) {
      // client 校验失败这种情况按 OAuth 错误响应(RFC 7009 §2.2.1 允许 invalid_client)
      return sendOAuthErrorJson(res, asOAuthError(e));
    }
  };
}
