// oauth_codes / oauth_refresh_tokens CRUD,核心是 RT rotation + reuse 检测

import { randomBytes, randomUUID } from 'node:crypto';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { mySql } from '../database/mySql.js';
import type { CodeChallengeMethod, OAuthCode, OAuthRefreshToken, RevokeReason } from './types.js';

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

// oauth_codes

interface CodeRow extends RowDataPacket {
  code: string;
  client_id: string;
  user_id: number;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: CodeChallengeMethod;
  scope: string;
  nonce: string | null;
  expires_at: Date;
  used: number;
}

function rowToCode(row: CodeRow): OAuthCode {
  return {
    code: row.code,
    client_id: row.client_id,
    user_id: row.user_id,
    redirect_uri: row.redirect_uri,
    code_challenge: row.code_challenge,
    code_challenge_method: row.code_challenge_method,
    scope: row.scope,
    nonce: row.nonce,
    expires_at: row.expires_at,
    used: row.used === 1,
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
  await mySql.execute(
    `INSERT INTO oauth_codes (code, client_id, user_id, redirect_uri,
       code_challenge, code_challenge_method, scope, nonce, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      code,
      input.client_id,
      input.user_id,
      input.redirect_uri,
      input.code_challenge,
      input.code_challenge_method,
      input.scope,
      input.nonce,
      expiresAt,
    ],
  );
  return code;
}

// 原子地"取出 + 标 used":先 UPDATE used=1 WHERE used=0,再 SELECT。
// 影响行数 = 0 表示码不存在或已被用,统一返回 null
export async function consumeCode(code: string): Promise<OAuthCode | null> {
  const [upd] = await mySql.execute<ResultSetHeader>(
    'UPDATE oauth_codes SET used = 1 WHERE code = ? AND used = 0',
    [code],
  );
  if (upd.affectedRows === 0) return null;
  const [rows] = await mySql.execute<CodeRow[]>(
    'SELECT * FROM oauth_codes WHERE code = ? LIMIT 1',
    [code],
  );
  if (rows.length === 0) return null;
  return rowToCode(rows[0]);
}

// oauth_refresh_tokens

interface RtRow extends RowDataPacket {
  jti: string;
  family_id: string;
  client_id: string;
  user_id: number;
  scope: string;
  issued_at: Date;
  expires_at: Date;
  revoked: number;
  rotated_to: string | null;
  rotated_at: Date | null;
  revoke_reason: RevokeReason | null;
}

function rowToRt(row: RtRow): OAuthRefreshToken {
  return {
    jti: row.jti,
    family_id: row.family_id,
    client_id: row.client_id,
    user_id: row.user_id,
    scope: row.scope,
    issued_at: row.issued_at,
    expires_at: row.expires_at,
    revoked: row.revoked === 1,
    rotated_to: row.rotated_to,
    rotated_at: row.rotated_at,
    revoke_reason: row.revoke_reason,
  };
}

export async function findRefreshToken(jti: string): Promise<OAuthRefreshToken | null> {
  const [rows] = await mySql.execute<RtRow[]>(
    'SELECT * FROM oauth_refresh_tokens WHERE jti = ? LIMIT 1',
    [jti],
  );
  if (rows.length === 0) return null;
  return rowToRt(rows[0]);
}

export async function insertRefreshToken(rt: {
  jti: string;
  family_id: string;
  client_id: string;
  user_id: number;
  scope: string;
  expiresAt: Date;
}): Promise<void> {
  await mySql.execute(
    `INSERT INTO oauth_refresh_tokens (jti, family_id, client_id, user_id, scope, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [rt.jti, rt.family_id, rt.client_id, rt.user_id, rt.scope, rt.expiresAt],
  );
}

// 原子地 rotation:UPDATE WHERE rotated_to IS NULL,影响行数为 0 = 已被并发抢走 = 重用攻击
export async function rotateRefreshToken(input: {
  oldJti: string;
  newJti: string;
}): Promise<boolean> {
  const [res] = await mySql.execute<ResultSetHeader>(
    `UPDATE oauth_refresh_tokens
        SET rotated_to = ?, rotated_at = NOW(), revoke_reason = 'rotation'
      WHERE jti = ? AND rotated_to IS NULL AND revoked = 0`,
    [input.newJti, input.oldJti],
  );
  return res.affectedRows === 1;
}

// 一旦检测到 reuse,立即把整 family 全部 revoke
export async function invalidateFamily(familyId: string, reason: RevokeReason): Promise<number> {
  const [res] = await mySql.execute<ResultSetHeader>(
    `UPDATE oauth_refresh_tokens
        SET revoked = 1, revoke_reason = ?
      WHERE family_id = ? AND revoked = 0`,
    [reason, familyId],
  );
  return res.affectedRows;
}

// 单条 revoke(用户登出 / 撤销端点用)
export async function revokeRefreshTokenByJti(
  jti: string,
  reason: RevokeReason,
): Promise<boolean> {
  const [res] = await mySql.execute<ResultSetHeader>(
    `UPDATE oauth_refresh_tokens
        SET revoked = 1, revoke_reason = ?
      WHERE jti = ? AND revoked = 0`,
    [reason, jti],
  );
  return res.affectedRows === 1;
}

// 全设备登出 / 改密码触发
export async function revokeAllUserRefreshTokens(
  userId: number,
  reason: RevokeReason,
): Promise<number> {
  const [res] = await mySql.execute<ResultSetHeader>(
    `UPDATE oauth_refresh_tokens
        SET revoked = 1, revoke_reason = ?
      WHERE user_id = ? AND revoked = 0`,
    [reason, userId],
  );
  return res.affectedRows;
}

// TTL 清理任务,后台定时 5 min 一次
export async function cleanupExpiredCodes(): Promise<number> {
  const [res] = await mySql.execute<ResultSetHeader>(
    `DELETE FROM oauth_codes
      WHERE (used = 0 AND expires_at < NOW())
         OR (used = 1 AND expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY))`,
  );
  return res.affectedRows;
}

export async function cleanupExpiredRefreshTokens(): Promise<number> {
  const [res] = await mySql.execute<ResultSetHeader>(
    `DELETE FROM oauth_refresh_tokens
      WHERE (revoked = 0 AND expires_at < NOW())
         OR (revoked = 1 AND issued_at < DATE_SUB(NOW(), INTERVAL 7 DAY))`,
  );
  return res.affectedRows;
}
