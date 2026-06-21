// AT/RT/ID Token 签发与验证,RS256 + jose

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { OAuthError } from './errors.js';
import type { KeyStore } from './keys.js';
import { SCOPE_TO_AUDIENCE, TOKEN_AUDIENCES } from './types.js';
import type {
  AccessTokenClaims,
  IdTokenClaims,
  RefreshTokenClaims,
} from './types.js';

export interface IssuerConfig {
  issuer: string;            // OAUTH_ISSUER_BASE_URL
  atTtlSec: number;
  rtTtlSec: number;
  idTtlSec: number;          // 默认与 atTtlSec 一致
}

export function readIssuerConfigFromEnv(): IssuerConfig {
  const issuer = (process.env.OAUTH_ISSUER_BASE_URL ?? 'http://localhost:3007').replace(
    /\/+$/,
    '',
  );
  return {
    issuer,
    atTtlSec: Number(process.env.OAUTH_AT_TTL_SEC ?? 900),
    rtTtlSec: Number(process.env.OAUTH_RT_TTL_SEC ?? 2592000),
    idTtlSec: Number(process.env.OAUTH_ID_TTL_SEC ?? 900),
  };
}

// scope → resource server audience 列表(scope 里出现的 resource scope 才进 aud)
export function deriveAccessTokenAudience(scope: string): string[] {
  const aud = new Set<string>();
  for (const s of scope.split(/\s+/)) {
    const mapped = SCOPE_TO_AUDIENCE[s];
    if (mapped) aud.add(mapped);
  }
  return Array.from(aud);
}

// 签 access_token
export async function signAccessToken(
  store: KeyStore,
  cfg: IssuerConfig,
  input: { sub: number; scope: string; client_id: string; jti: string },
): Promise<{ token: string; expiresIn: number }> {
  const aud = deriveAccessTokenAudience(input.scope);
  const claims: AccessTokenClaims = {
    iss: cfg.issuer,
    sub: String(input.sub),
    aud,
    iat: nowSec(),
    exp: nowSec() + cfg.atTtlSec,
    scope: input.scope,
    client_id: input.client_id,
    jti: input.jti,
  };
  const token = await new SignJWT(claims as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: store.active.kid })
    .sign(store.active.privateKey);
  return { token, expiresIn: cfg.atTtlSec };
}

// 签 refresh_token,aud 锁定到 token 端点(避免被当 access_token 用)
export async function signRefreshToken(
  store: KeyStore,
  cfg: IssuerConfig,
  input: {
    sub: number;
    scope: string;
    client_id: string;
    jti: string;
    family_id: string;
    expiresAt: Date;
  },
): Promise<string> {
  const claims: RefreshTokenClaims = {
    iss: cfg.issuer,
    sub: String(input.sub),
    aud: [TOKEN_AUDIENCES.REFRESH_TOKEN_ENDPOINT],
    iat: nowSec(),
    exp: Math.floor(input.expiresAt.getTime() / 1000),
    scope: input.scope,
    client_id: input.client_id,
    jti: input.jti,
    family_id: input.family_id,
  };
  return new SignJWT(claims as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'RS256', typ: 'rt+jwt', kid: store.active.kid })
    .sign(store.active.privateKey);
}

// 签 id_token(OIDC),aud = client_id,不是 resource server
export async function signIdToken(
  store: KeyStore,
  cfg: IssuerConfig,
  input: {
    sub: number;
    client_id: string;
    auth_time: number;
    nonce: string | null;
    profile: {
      name?: string | null;
      preferred_username?: string | null;
      email?: string | null;
      email_verified?: boolean;
      picture?: string | null;
    };
    scope: string;
  },
): Promise<string> {
  const scopes = new Set(input.scope.split(/\s+/));
  const claims: IdTokenClaims = {
    iss: cfg.issuer,
    sub: String(input.sub),
    aud: input.client_id,
    iat: nowSec(),
    exp: nowSec() + cfg.idTtlSec,
    auth_time: input.auth_time,
    ...(input.nonce ? { nonce: input.nonce } : {}),
    ...(scopes.has('profile')
      ? {
          name: input.profile.name ?? undefined,
          preferred_username: input.profile.preferred_username ?? undefined,
          picture: input.profile.picture ?? undefined,
        }
      : {}),
    ...(scopes.has('email')
      ? {
          email: input.profile.email ?? undefined,
          email_verified: input.profile.email_verified ?? undefined,
        }
      : {}),
  };
  return new SignJWT(claims as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: store.active.kid })
    .sign(store.active.privateKey);
}

// 验证 refresh_token(用于 /oauth/token refresh_token grant + /oauth/revoke)
// 失败统一抛 invalid_grant(防探测)
export async function verifyRefreshToken(
  store: KeyStore,
  cfg: IssuerConfig,
  rt: string,
): Promise<RefreshTokenClaims> {
  try {
    const { payload } = await jwtVerify(rt, async (header) => {
      const kid = header.kid;
      if (!kid) throw new Error('missing kid');
      const k = store.all.get(kid);
      if (!k) throw new Error(`unknown kid: ${kid}`);
      return k.publicKey;
    }, {
      issuer: cfg.issuer,
      audience: TOKEN_AUDIENCES.REFRESH_TOKEN_ENDPOINT,
      clockTolerance: 30,
    });
    return payload as unknown as RefreshTokenClaims;
  } catch {
    throw new OAuthError('invalid_grant', 'refresh_token 无效或已过期');
  }
}

// 验证 access_token(introspect 用)
export async function verifyAccessToken(
  store: KeyStore,
  cfg: IssuerConfig,
  at: string,
): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(at, async (header) => {
      const kid = header.kid;
      if (!kid) throw new Error('missing kid');
      const k = store.all.get(kid);
      if (!k) throw new Error(`unknown kid: ${kid}`);
      return k.publicKey;
    }, {
      issuer: cfg.issuer,
      clockTolerance: 30,
    });
    return payload as unknown as AccessTokenClaims;
  } catch {
    return null;
  }
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}
