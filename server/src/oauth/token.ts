// POST /oauth/token
// 同时处理 authorization_code 和 refresh_token 两种 grant

import type { Request, RequestHandler, Response } from 'express';
import { prisma } from '../database/prisma.js';
import { audit, reqContext } from './audit.js';
import {
  assertGrantAllowed,
  authenticateClient,
  normalizeAndAssertScope,
  requireActiveClient,
} from './clients.js';
import { OAuthError, asOAuthError, sendOAuthErrorJson } from './errors.js';
import type { KeyStore } from './keys.js';
import { verifyS256 } from './pkce.js';
import {
  consumeCode,
  findRefreshToken,
  insertRefreshToken,
  invalidateFamily,
  newFamilyId,
  newJti,
  rotateRefreshToken,
} from './storage.js';
import {
  signAccessToken,
  signIdToken,
  signRefreshToken,
  verifyRefreshToken,
  type IssuerConfig,
} from './tokens.js';
import type { OAuthClient, TokenResponse } from './types.js';
import { OIDC_SCOPES } from './types.js';

interface MakeTokenOptions {
  store: KeyStore;
  issuer: IssuerConfig;
}

export function makeTokenHandler(opts: MakeTokenOptions): RequestHandler {
  return async (req, res) => {
    try {
      const body = req.body as Record<string, string | undefined>;
      const grantType = body.grant_type;

      // confidential client 既支持 form body 的 client_secret,也支持 Basic Auth(RFC 6749 §2.3.1)
      const basic = parseBasicAuth(req);
      const clientId = basic?.clientId ?? body.client_id;
      const clientSecret = basic?.clientSecret ?? body.client_secret;

      const client = await requireActiveClient(clientId);
      await authenticateClient(client, clientSecret);

      if (grantType === 'authorization_code') {
        assertGrantAllowed(client, 'authorization_code');
        return await handleAuthorizationCode(req, res, client, body, opts);
      }
      if (grantType === 'refresh_token') {
        assertGrantAllowed(client, 'refresh_token');
        return await handleRefreshToken(req, res, client, body, opts);
      }
      throw new OAuthError('unsupported_grant_type', `grant_type=${grantType ?? ''}`);
    } catch (e) {
      const err = asOAuthError(e);
      audit({
        event: err.code === 'invalid_client' ? 'client_rejected' : 'grant_rejected',
        reason: err.code,
        ...reqContext(req),
      });
      return sendOAuthErrorJson(res, err);
    }
  };
}

async function handleAuthorizationCode(
  req: Request,
  res: Response,
  client: OAuthClient,
  body: Record<string, string | undefined>,
  opts: MakeTokenOptions,
): Promise<void> {
  const { store, issuer } = opts;
  const codeStr = body.code;
  const redirectUri = body.redirect_uri;
  const verifier = body.code_verifier;

  if (!codeStr) throw new OAuthError('invalid_request', 'code 缺失');
  if (!redirectUri) throw new OAuthError('invalid_request', 'redirect_uri 缺失');

  // 原子取出并标 used = 1
  const code = await consumeCode(codeStr);
  if (!code) throw new OAuthError('invalid_grant', 'code 不存在或已使用');
  if (code.expires_at.getTime() < Date.now()) {
    throw new OAuthError('invalid_grant', 'code 已过期');
  }
  if (code.client_id !== client.client_id) {
    throw new OAuthError('invalid_grant', 'code 不属于此 client');
  }
  if (code.redirect_uri !== redirectUri) {
    // RFC 6749 §4.1.3
    throw new OAuthError('invalid_grant', 'redirect_uri 与 authorize 时不一致');
  }
  if (client.require_pkce) {
    if (!verifier) throw new OAuthError('invalid_grant', 'code_verifier 缺失');
    if (!verifyS256(verifier, code.code_challenge)) {
      throw new OAuthError('invalid_grant', 'code_verifier 校验失败');
    }
  }

  // 取用户档案(签 id_token 用)
  const profile = await loadProfile(code.user_id);
  const familyId = newFamilyId();
  const atJti = newJti('at');
  const rtJti = newJti('rt');
  const rtExpires = new Date(Date.now() + client.refresh_lifetime_sec * 1000);

  await insertRefreshToken({
    jti: rtJti,
    family_id: familyId,
    client_id: client.client_id,
    user_id: code.user_id,
    scope: code.scope,
    expiresAt: rtExpires,
  });

  const at = await signAccessToken(store, issuer, {
    sub: code.user_id,
    scope: code.scope,
    client_id: client.client_id,
    jti: atJti,
  });
  const rt = await signRefreshToken(store, issuer, {
    sub: code.user_id,
    scope: code.scope,
    client_id: client.client_id,
    jti: rtJti,
    family_id: familyId,
    expiresAt: rtExpires,
  });

  const wantsOidc = code.scope.split(/\s+/).some((s) => OIDC_SCOPES.has(s));
  let idToken: string | undefined;
  if (wantsOidc) {
    idToken = await signIdToken(store, issuer, {
      sub: code.user_id,
      client_id: client.client_id,
      auth_time: Math.floor(Date.now() / 1000),
      nonce: code.nonce,
      profile,
      scope: code.scope,
    });
  }

  audit({
    event: 'code_exchanged',
    client_id: client.client_id,
    user_id: code.user_id,
    new_rt_jti: rtJti,
    scope: code.scope,
    ...reqContext(req),
  });

  const resp: TokenResponse = {
    access_token: at.token,
    token_type: 'Bearer',
    expires_in: at.expiresIn,
    refresh_token: rt,
    scope: code.scope,
    ...(idToken ? { id_token: idToken } : {}),
  };
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.json(resp);
}

async function handleRefreshToken(
  req: Request,
  res: Response,
  client: OAuthClient,
  body: Record<string, string | undefined>,
  opts: MakeTokenOptions,
): Promise<void> {
  const { store, issuer } = opts;
  const rt = body.refresh_token;
  if (!rt) throw new OAuthError('invalid_request', 'refresh_token 缺失');

  // 1. JWT 签名 / aud / exp 校验
  const claims = await verifyRefreshToken(store, issuer, rt);

  // 2. 校验 client 一致
  if (claims.client_id !== client.client_id) {
    throw new OAuthError('invalid_grant', 'refresh_token 不属于此 client');
  }

  // 3. DB 查 jti
  const stored = await findRefreshToken(claims.jti);
  if (!stored) throw new OAuthError('invalid_grant', 'refresh_token 不存在');

  // 4. reuse 检测:revoked 或 已被 rotation
  if (stored.revoked || stored.rotated_to) {
    await invalidateFamily(stored.family_id, 'reuse_detected');
    audit({
      event: 'rt_reuse_detected',
      family_id: stored.family_id,
      old_rt_jti: stored.jti,
      user_id: stored.user_id,
      client_id: client.client_id,
      ...reqContext(req),
    });
    throw new OAuthError('invalid_grant', 'refresh_token 已撤销或已被使用');
  }
  if (stored.expires_at.getTime() < Date.now()) {
    throw new OAuthError('invalid_grant', 'refresh_token 已过期');
  }

  // 5. scope 收缩(允许小于原 scope,不可扩展)
  let scope = stored.scope;
  if (body.scope) {
    const requested = normalizeAndAssertScope(client, body.scope);
    const requestedSet = new Set(requested.split(/\s+/));
    const originalSet = new Set(stored.scope.split(/\s+/));
    for (const s of requestedSet) {
      if (!originalSet.has(s)) {
        throw new OAuthError('invalid_scope', `scope 超出原范围: ${s}`);
      }
    }
    scope = Array.from(requestedSet).join(' ');
  }

  // 6. 签发新 AT + 新 RT,然后原子地完成 rotation
  const newRtJti = newJti('rt');
  const newAtJti = newJti('at');
  const newRtExpires = new Date(Date.now() + client.refresh_lifetime_sec * 1000);

  // 先尝试 rotation;若并发抢失败 → reuse 触发
  const ok = await tryRotateInTransaction({
    oldJti: stored.jti,
    newRt: {
      jti: newRtJti,
      family_id: stored.family_id,
      client_id: client.client_id,
      user_id: stored.user_id,
      scope,
      expiresAt: newRtExpires,
    },
  });
  if (!ok) {
    await invalidateFamily(stored.family_id, 'reuse_detected');
    audit({
      event: 'rt_reuse_detected',
      family_id: stored.family_id,
      old_rt_jti: stored.jti,
      user_id: stored.user_id,
      client_id: client.client_id,
      reason: 'concurrent_rotation',
      ...reqContext(req),
    });
    throw new OAuthError('invalid_grant', 'refresh_token 已被使用');
  }

  const at = await signAccessToken(store, issuer, {
    sub: stored.user_id,
    scope,
    client_id: client.client_id,
    jti: newAtJti,
  });
  const newRt = await signRefreshToken(store, issuer, {
    sub: stored.user_id,
    scope,
    client_id: client.client_id,
    jti: newRtJti,
    family_id: stored.family_id,
    expiresAt: newRtExpires,
  });

  audit({
    event: 'token_refreshed',
    family_id: stored.family_id,
    old_rt_jti: stored.jti,
    new_rt_jti: newRtJti,
    client_id: client.client_id,
    user_id: stored.user_id,
    ...reqContext(req),
  });

  const resp: TokenResponse = {
    access_token: at.token,
    token_type: 'Bearer',
    expires_in: at.expiresIn,
    refresh_token: newRt,
    scope,
  };
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.json(resp);
}

// 事务保证 rotation + insert 原子。并发情况下,新 INSERT 唯一性约束没冲突,
// 但 UPDATE 的 WHERE rotatedTo IS NULL 会命中已抢的状态 → 影响 0 → 抛错回滚清理 INSERT
async function tryRotateInTransaction(input: {
  oldJti: string;
  newRt: {
    jti: string;
    family_id: string;
    client_id: string;
    user_id: number;
    scope: string;
    expiresAt: Date;
  };
}): Promise<boolean> {
  const SENTINEL = Symbol('rotate-failed');
  try {
    await prisma.$transaction(async (tx) => {
      await tx.oAuthRefreshToken.create({
        data: {
          jti: input.newRt.jti,
          familyId: input.newRt.family_id,
          clientId: input.newRt.client_id,
          userId: BigInt(input.newRt.user_id),
          scope: input.newRt.scope,
          expiresAt: input.newRt.expiresAt,
        },
      });
      const upd = await tx.oAuthRefreshToken.updateMany({
        where: { jti: input.oldJti, rotatedTo: null, revoked: false },
        data: { rotatedTo: input.newRt.jti, rotatedAt: new Date(), revokeReason: 'rotation' },
      });
      if (upd.count !== 1) {
        // 抛 sentinel 触发事务回滚,新 INSERT 自动撤销;上层把 false 返回触发 family invalidate
        throw SENTINEL;
      }
    });
    return true;
  } catch (e) {
    if (e === SENTINEL) return false;
    throw e;
  }
}

// 取用户档案(给 id_token / userinfo 用)
async function loadProfile(userId: number): Promise<{
  name: string | null;
  preferred_username: string | null;
  email: string | null;
  email_verified: boolean;
  picture: string | null;
}> {
  const row = await prisma.user.findUnique({
    where: { id: BigInt(userId) },
    select: { username: true, nickname: true, email: true, avatar: true },
  });
  return {
    name: row?.nickname ?? null,
    preferred_username: row?.username ?? null,
    email: row?.email ?? null,
    email_verified: false,
    picture: row?.avatar ?? null,
  };
}

// HTTP Basic Auth 解析(RFC 6749 §2.3.1)
function parseBasicAuth(req: Request): { clientId: string; clientSecret: string } | null {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Basic ')) return null;
  const decoded = Buffer.from(h.slice(6).trim(), 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx < 0) return null;
  return {
    clientId: decodeURIComponent(decoded.slice(0, idx)),
    clientSecret: decodeURIComponent(decoded.slice(idx + 1)),
  };
}
