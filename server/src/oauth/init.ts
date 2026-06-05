// OAuth IdP 启动初始化:跑 migration + seed 默认 client
// 幂等(CREATE TABLE IF NOT EXISTS + ON DUPLICATE KEY UPDATE),可重复执行
// DDL 内联在此,与 src/database/migrations/001_oauth_tables.sql 保持同步

import { mySql } from '../database/mySql.js';

const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS oauth_clients (
    client_id            VARCHAR(64)  PRIMARY KEY,
    client_name          VARCHAR(128) NOT NULL,
    client_type          ENUM('public', 'confidential') NOT NULL,
    client_secret_hash   VARCHAR(255) NULL,
    redirect_uris        JSON         NOT NULL,
    allowed_scopes       JSON         NOT NULL,
    allowed_grant_types  JSON         NOT NULL,
    token_lifetime_sec   INT          NOT NULL DEFAULT 900,
    refresh_lifetime_sec INT          NOT NULL DEFAULT 2592000,
    require_pkce         TINYINT      NOT NULL DEFAULT 1,
    disabled             TINYINT      NOT NULL DEFAULT 0,
    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OAuth client 注册表'`,

  `CREATE TABLE IF NOT EXISTS oauth_codes (
    code                  VARCHAR(64)  PRIMARY KEY,
    client_id             VARCHAR(64)  NOT NULL,
    user_id               BIGINT       NOT NULL,
    redirect_uri          VARCHAR(512) NOT NULL,
    code_challenge        VARCHAR(128) NOT NULL,
    code_challenge_method ENUM('S256') NOT NULL,
    scope                 VARCHAR(512) NOT NULL,
    nonce                 VARCHAR(255) NULL,
    expires_at            DATETIME     NOT NULL,
    used                  TINYINT      NOT NULL DEFAULT 0,
    created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_expires (expires_at),
    INDEX idx_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OAuth 授权码'`,

  `CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
    jti           VARCHAR(64)  PRIMARY KEY,
    family_id     VARCHAR(64)  NOT NULL,
    client_id     VARCHAR(64)  NOT NULL,
    user_id       BIGINT       NOT NULL,
    scope         VARCHAR(512) NOT NULL,
    issued_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at    DATETIME     NOT NULL,
    revoked       TINYINT      NOT NULL DEFAULT 0,
    rotated_to    VARCHAR(64)  NULL,
    rotated_at    DATETIME     NULL,
    revoke_reason VARCHAR(64)  NULL,
    INDEX idx_family (family_id),
    INDEX idx_user_active (user_id, revoked, expires_at),
    INDEX idx_expires (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Refresh token family'`,
];

export async function initOAuthSchema(): Promise<void> {
  for (const stmt of SCHEMA_STATEMENTS) {
    await mySql.execute(stmt);
  }
}

interface SeedClient {
  client_id: string;
  client_name: string;
  client_type: 'public' | 'confidential';
  redirect_uris: string[];
  allowed_scopes: string[];
  allowed_grant_types: ('authorization_code' | 'refresh_token')[];
}

export const DEFAULT_WEB_CLIENT: SeedClient = {
  client_id: 'our-chat-web',
  client_name: 'our-chat Web SPA',
  client_type: 'public',
  // 实际 redirect_uri 由 OAUTH_WEB_REDIRECT_URI 控制,允许多个
  redirect_uris: (process.env.OAUTH_WEB_REDIRECT_URI ?? 'http://localhost:5173/oauth/callback')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  allowed_scopes: ['openid', 'profile', 'email', 'agent-server'],
  allowed_grant_types: ['authorization_code', 'refresh_token'],
};

// INSERT IGNORE 保证 dev 重启不报 PK 冲突;允许 redirect_uris 由 env 变更(运维改后重跑会生效?
// 答:INSERT IGNORE 已存在时不改,需要主动 UPDATE。这里做"插入不存在 + 更新已存在"
export async function seedDefaultClient(client: SeedClient = DEFAULT_WEB_CLIENT): Promise<void> {
  const redirectJson = JSON.stringify(client.redirect_uris);
  const scopesJson = JSON.stringify(client.allowed_scopes);
  const grantsJson = JSON.stringify(client.allowed_grant_types);
  await mySql.execute(
    `INSERT INTO oauth_clients
       (client_id, client_name, client_type, client_secret_hash, redirect_uris,
        allowed_scopes, allowed_grant_types, require_pkce)
     VALUES (?, ?, ?, NULL, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), 1)
     ON DUPLICATE KEY UPDATE
       client_name = VALUES(client_name),
       redirect_uris = VALUES(redirect_uris),
       allowed_scopes = VALUES(allowed_scopes),
       allowed_grant_types = VALUES(allowed_grant_types)`,
    [
      client.client_id,
      client.client_name,
      client.client_type,
      redirectJson,
      scopesJson,
      grantsJson,
    ],
  );
}
