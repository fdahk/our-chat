-- OAuth IdP 三张表
-- 回滚:DROP TABLE oauth_refresh_tokens; DROP TABLE oauth_codes; DROP TABLE oauth_clients;

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id            VARCHAR(64)  PRIMARY KEY,
  client_name          VARCHAR(128) NOT NULL,
  client_type          ENUM('public', 'confidential') NOT NULL,
  client_secret_hash   VARCHAR(255) NULL                COMMENT 'confidential 必填 bcrypt 哈希',
  redirect_uris        JSON         NOT NULL            COMMENT '允许的回调地址数组,exact match',
  allowed_scopes       JSON         NOT NULL,
  allowed_grant_types  JSON         NOT NULL,
  token_lifetime_sec   INT          NOT NULL DEFAULT 900,
  refresh_lifetime_sec INT          NOT NULL DEFAULT 2592000,
  require_pkce         TINYINT      NOT NULL DEFAULT 1,
  disabled             TINYINT      NOT NULL DEFAULT 0,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OAuth client 注册表';

CREATE TABLE IF NOT EXISTS oauth_codes (
  code                  VARCHAR(64)  PRIMARY KEY        COMMENT '高熵随机',
  client_id             VARCHAR(64)  NOT NULL,
  user_id               BIGINT       NOT NULL           COMMENT '对应 users.id',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='OAuth 授权码,一次性短期';

CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  jti           VARCHAR(64)  PRIMARY KEY,
  family_id     VARCHAR(64)  NOT NULL                   COMMENT '同一登录会话的 RT 链',
  client_id     VARCHAR(64)  NOT NULL,
  user_id       BIGINT       NOT NULL,
  scope         VARCHAR(512) NOT NULL,
  issued_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at    DATETIME     NOT NULL,
  revoked       TINYINT      NOT NULL DEFAULT 0,
  rotated_to    VARCHAR(64)  NULL                       COMMENT '下一根 RT 的 jti',
  rotated_at    DATETIME     NULL,
  revoke_reason VARCHAR(64)  NULL                       COMMENT 'rotation/reuse_detected/logout/admin',
  INDEX idx_family (family_id),
  INDEX idx_user_active (user_id, revoked, expires_at),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Refresh token family,支持 rotation 重用检测';
