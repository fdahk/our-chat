// OAuth IdP 模块共享类型

export type ClientType = 'public' | 'confidential';
export type GrantType = 'authorization_code' | 'refresh_token';
export type CodeChallengeMethod = 'S256';
export type RevokeReason = 'rotation' | 'reuse_detected' | 'logout' | 'logout_all' | 'admin';

export interface OAuthClient {
  client_id: string;
  client_name: string;
  client_type: ClientType;
  client_secret_hash: string | null;
  redirect_uris: string[];
  allowed_scopes: string[];
  allowed_grant_types: GrantType[];
  token_lifetime_sec: number;
  refresh_lifetime_sec: number;
  require_pkce: boolean;
  disabled: boolean;
}

export interface OAuthCode {
  code: string;
  client_id: string;
  user_id: number;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: CodeChallengeMethod;
  scope: string;
  nonce: string | null;
  expires_at: Date;
  used: boolean;
}

export interface OAuthRefreshToken {
  jti: string;
  family_id: string;
  client_id: string;
  user_id: number;
  scope: string;
  issued_at: Date;
  expires_at: Date;
  revoked: boolean;
  rotated_to: string | null;
  rotated_at: Date | null;
  revoke_reason: RevokeReason | null;
}

// JWT claims

export interface AccessTokenClaims {
  iss: string;
  sub: string;
  aud: string[];
  iat: number;
  exp: number;
  scope: string;
  client_id: string;
  jti: string;
}

export interface RefreshTokenClaims {
  iss: string;
  sub: string;
  aud: string[];
  iat: number;
  exp: number;
  scope: string;
  client_id: string;
  jti: string;
  family_id: string;
}

export interface IdTokenClaims {
  iss: string;
  sub: string;
  aud: string;
  iat: number;
  exp: number;
  auth_time: number;
  nonce?: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  email_verified?: boolean;
  picture?: string | null;
}

// 端点请求 / 响应

export interface AuthorizeQuery {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  nonce?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  id_token?: string;
  scope: string;
}

// AT/RT/Code 的 audience 常量

export const TOKEN_AUDIENCES = {
  RESOURCE_AGENT_SERVER: 'agent-server',
  REFRESH_TOKEN_ENDPOINT: '/oauth/token',
} as const;

// scope → resource server audience 映射

export const SCOPE_TO_AUDIENCE: Record<string, string> = {
  'agent-server': TOKEN_AUDIENCES.RESOURCE_AGENT_SERVER,
};

export const OIDC_SCOPES = new Set(['openid', 'profile', 'email']);
