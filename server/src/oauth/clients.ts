// oauth_clients 表查询 + client_secret 校验

import bcrypt from 'bcrypt';
import type { RowDataPacket } from 'mysql2';
import { mySql } from '../database/mySql.js';
import { OAuthError } from './errors.js';
import type { GrantType, OAuthClient } from './types.js';

interface ClientRow extends RowDataPacket {
  client_id: string;
  client_name: string;
  client_type: 'public' | 'confidential';
  client_secret_hash: string | null;
  redirect_uris: string | string[];          // mysql2 可能返回字符串或已 parse
  allowed_scopes: string | string[];
  allowed_grant_types: string | string[];
  token_lifetime_sec: number;
  refresh_lifetime_sec: number;
  require_pkce: number;
  disabled: number;
}

function parseJsonField<T>(v: unknown): T {
  if (typeof v === 'string') return JSON.parse(v) as T;
  return v as T;
}

function rowToClient(row: ClientRow): OAuthClient {
  return {
    client_id: row.client_id,
    client_name: row.client_name,
    client_type: row.client_type,
    client_secret_hash: row.client_secret_hash,
    redirect_uris: parseJsonField<string[]>(row.redirect_uris),
    allowed_scopes: parseJsonField<string[]>(row.allowed_scopes),
    allowed_grant_types: parseJsonField<GrantType[]>(row.allowed_grant_types),
    token_lifetime_sec: row.token_lifetime_sec,
    refresh_lifetime_sec: row.refresh_lifetime_sec,
    require_pkce: row.require_pkce === 1,
    disabled: row.disabled === 1,
  };
}

export async function findClient(clientId: string): Promise<OAuthClient | null> {
  const [rows] = await mySql.execute<ClientRow[]>(
    'SELECT * FROM oauth_clients WHERE client_id = ? LIMIT 1',
    [clientId],
  );
  if (rows.length === 0) return null;
  return rowToClient(rows[0]);
}

export async function requireActiveClient(clientId: string | undefined): Promise<OAuthClient> {
  if (!clientId) throw new OAuthError('invalid_request', 'client_id 缺失');
  const c = await findClient(clientId);
  if (!c) throw new OAuthError('invalid_client', 'client 未注册');
  if (c.disabled) throw new OAuthError('invalid_client', 'client 已停用');
  return c;
}

// confidential client 必须提供 client_secret,public 不允许提供
export async function authenticateClient(
  client: OAuthClient,
  clientSecret: string | undefined,
): Promise<void> {
  if (client.client_type === 'public') {
    if (clientSecret !== undefined) {
      throw new OAuthError('invalid_client', 'public client 不应提供 client_secret');
    }
    return;
  }
  if (!clientSecret) {
    throw new OAuthError('invalid_client', '缺少 client_secret');
  }
  if (!client.client_secret_hash) {
    throw new OAuthError('invalid_client', 'client 未设置 secret');
  }
  const ok = await bcrypt.compare(clientSecret, client.client_secret_hash);
  if (!ok) throw new OAuthError('invalid_client', 'client_secret 无效');
}

// redirect_uri 必须 exact match,RFC 8252
export function assertRedirectUriAllowed(
  client: OAuthClient,
  redirectUri: string | undefined,
): asserts redirectUri is string {
  if (!redirectUri) {
    throw new OAuthError('invalid_request', 'redirect_uri 缺失');
  }
  if (!client.redirect_uris.includes(redirectUri)) {
    throw new OAuthError('invalid_request', 'redirect_uri 未注册');
  }
}

export function assertGrantAllowed(client: OAuthClient, grantType: GrantType): void {
  if (!client.allowed_grant_types.includes(grantType)) {
    throw new OAuthError('unauthorized_client', `不允许的 grant_type: ${grantType}`);
  }
}

// 校验请求 scope 全部在 client 允许范围内,返回去重后的有效 scope 字符串
export function normalizeAndAssertScope(
  client: OAuthClient,
  requested: string | undefined,
): string {
  if (!requested) throw new OAuthError('invalid_scope', 'scope 缺失');
  const wanted = Array.from(new Set(requested.split(/\s+/).filter(Boolean)));
  for (const s of wanted) {
    if (!client.allowed_scopes.includes(s)) {
      throw new OAuthError('invalid_scope', `不允许的 scope: ${s}`);
    }
  }
  return wanted.join(' ');
}
