// oauth_codes / oauth_refresh_tokens CRUD,核心是 RT rotation + reuse 检测

import { randomBytes, randomUUID } from 'node:crypto';
import { prisma } from '../database/prisma.js';
import type {
  CodeChallengeMethod,
  OAuthCode,
  OAuthRefreshToken,
  RevokeReason,
} from './types.js';

// 64 字节随机 → base64url,约 86 字符
function generateOpaqueId(): string {
  return randomBytes(48).toString('base64url');
}

export function newJti(prefix: 'at' | 'rt'): string {
  return `${prefix}-${randomUUID()}`;
}

export function newFamilyId(): string {
  return `fam-${randomUUID()}`;
}

type CodeRow = Awaited<ReturnType<typeof prisma.oAuthCode.findUnique>>;

function rowToCode(row: NonNullable<CodeRow>): OAuthCode {
  return {
    code: row.code,
    client_id: row.clientId,
    user_id: Number(row.userId),
    redirect_uri: row.redirectUri,
    code_challenge: row.codeChallenge,
    code_challenge_method: row.codeChallengeMethod as CodeChallengeMethod,
    scope: row.scope,
    nonce: row.nonce,
    expires_at: row.expiresAt,
    used: row.used,
  };
}

export async function createCode(input: {
  client_id: string;
  user_id: number;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: CodeChallengeMethod;
  scope: string;
  nonce: string | null;
  ttlSec: number;
}): Promise<string> {
  const code = generateOpaqueId();
  const expiresAt = new Date(Date.now() + input.ttlSec * 1000);
  await prisma.oAuthCode.create({
    data: {
      code,
      clientId: input.client_id,
      userId: BigInt(input.user_id),
      redirectUri: input.redirect_uri,
      codeChallenge: input.code_challenge,
      codeChallengeMethod: input.code_challenge_method,
      scope: input.scope,
      nonce: input.nonce,
      expiresAt,
    },
  });
  return code;
}

// 原子地 "取出 + 标 used":updateMany 的 where 含 used=false 防并发重放
export async function consumeCode(code: string): Promise<OAuthCode | null> {
  const res = await prisma.oAuthCode.updateMany({
    where: { code, used: false },
    data: { used: true },
  });
  if (res.count === 0) return null;
  const row = await prisma.oAuthCode.findUnique({ where: { code } });
  return row ? rowToCode(row) : null;
}

type RtRow = Awaited<ReturnType<typeof prisma.oAuthRefreshToken.findUnique>>;

function rowToRt(row: NonNullable<RtRow>): OAuthRefreshToken {
  return {
    jti: row.jti,
    family_id: row.familyId,
    client_id: row.clientId,
    user_id: Number(row.userId),
    scope: row.scope,
    issued_at: row.issuedAt,
    expires_at: row.expiresAt,
    revoked: row.revoked,
    rotated_to: row.rotatedTo,
    rotated_at: row.rotatedAt,
    revoke_reason: row.revokeReason as RevokeReason | null,
  };
}

export async function findRefreshToken(jti: string): Promise<OAuthRefreshToken | null> {
  const row = await prisma.oAuthRefreshToken.findUnique({ where: { jti } });
  return row ? rowToRt(row) : null;
}

export async function insertRefreshToken(rt: {
  jti: string;
  family_id: string;
  client_id: string;
  user_id: number;
  scope: string;
  expiresAt: Date;
}): Promise<void> {
  await prisma.oAuthRefreshToken.create({
    data: {
      jti: rt.jti,
      familyId: rt.family_id,
      clientId: rt.client_id,
      userId: BigInt(rt.user_id),
      scope: rt.scope,
      expiresAt: rt.expiresAt,
    },
  });
}

// 原子 rotation:updateMany WHERE rotatedTo IS NULL AND revoked = false
// 影响行数为 0 = 已被并发抢走 = 重用攻击
export async function rotateRefreshToken(input: {
  oldJti: string;
  newJti: string;
}): Promise<boolean> {
  const res = await prisma.oAuthRefreshToken.updateMany({
    where: { jti: input.oldJti, rotatedTo: null, revoked: false },
    data: { rotatedTo: input.newJti, rotatedAt: new Date(), revokeReason: 'rotation' },
  });
  return res.count === 1;
}

export async function invalidateFamily(familyId: string, reason: RevokeReason): Promise<number> {
  const res = await prisma.oAuthRefreshToken.updateMany({
    where: { familyId, revoked: false },
    data: { revoked: true, revokeReason: reason },
  });
  return res.count;
}

export async function revokeRefreshTokenByJti(
  jti: string,
  reason: RevokeReason,
): Promise<boolean> {
  const res = await prisma.oAuthRefreshToken.updateMany({
    where: { jti, revoked: false },
    data: { revoked: true, revokeReason: reason },
  });
  return res.count === 1;
}

export async function revokeAllUserRefreshTokens(
  userId: number,
  reason: RevokeReason,
): Promise<number> {
  const res = await prisma.oAuthRefreshToken.updateMany({
    where: { userId: BigInt(userId), revoked: false },
    data: { revoked: true, revokeReason: reason },
  });
  return res.count;
}

// 后台定时 5 min 一次:删过期 code + 已用但旧于一天
export async function cleanupExpiredCodes(): Promise<number> {
  const now = new Date();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const res = await prisma.oAuthCode.deleteMany({
    where: {
      OR: [
        { used: false, expiresAt: { lt: now } },
        { used: true, expiresAt: { lt: oneDayAgo } },
      ],
    },
  });
  return res.count;
}

// revoked 保留 7 天作审计
export async function cleanupExpiredRefreshTokens(): Promise<number> {
  const now = new Date();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const res = await prisma.oAuthRefreshToken.deleteMany({
    where: {
      OR: [
        { revoked: false, expiresAt: { lt: now } },
        { revoked: true, issuedAt: { lt: sevenDaysAgo } },
      ],
    },
  });
  return res.count;
}
