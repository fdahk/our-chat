// OAuth 标准错误,RFC 6749 §5.2

import type { Response } from 'express';

export type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'unsupported_response_type'
  | 'invalid_scope'
  | 'access_denied'
  | 'server_error'
  | 'temporarily_unavailable';

const HTTP_STATUS: Record<OAuthErrorCode, number> = {
  invalid_request: 400,
  invalid_client: 401,
  invalid_grant: 400,
  unauthorized_client: 400,
  unsupported_grant_type: 400,
  unsupported_response_type: 400,
  invalid_scope: 400,
  access_denied: 403,
  server_error: 500,
  temporarily_unavailable: 503,
};

export class OAuthError extends Error {
  readonly code: OAuthErrorCode;
  readonly description: string | undefined;
  readonly status: number;

  constructor(code: OAuthErrorCode, description?: string) {
    super(description ?? code);
    this.code = code;
    this.description = description;
    this.status = HTTP_STATUS[code];
  }
}

// 直接送 JSON 响应。redirect 模式由调用方自己拼 redirect_uri,这里只管 JSON
export function sendOAuthErrorJson(res: Response, err: OAuthError): void {
  res.status(err.status).json({
    error: err.code,
    error_description: err.description,
  });
}

// 把任意异常映射成 OAuthError;已经是的直接返回
export function asOAuthError(e: unknown): OAuthError {
  if (e instanceof OAuthError) return e;
  return new OAuthError('server_error', e instanceof Error ? e.message : String(e));
}

// 在 redirect_uri 上回挂错误参数(RFC 6749 §4.1.2.1)
export function buildRedirectError(
  redirectUri: string,
  err: OAuthError,
  state: string | undefined,
): string {
  const url = new URL(redirectUri);
  url.searchParams.set('error', err.code);
  if (err.description) url.searchParams.set('error_description', err.description);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}
