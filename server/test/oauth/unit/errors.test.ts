import { describe, it, expect } from 'vitest';
import {
  asOAuthError,
  buildRedirectError,
  OAuthError,
  sendOAuthErrorJson,
} from '../../../src/oauth/errors.js';

function makeRes() {
  const captured: { status?: number; body?: unknown } = {};
  return {
    captured,
    status(s: number) { captured.status = s; return this; },
    json(b: unknown) { captured.body = b; return this; },
  };
}

describe('OAuthError', () => {
  it('每个 error code 映射到正确 HTTP status', () => {
    expect(new OAuthError('invalid_request').status).toBe(400);
    expect(new OAuthError('invalid_client').status).toBe(401);
    expect(new OAuthError('invalid_grant').status).toBe(400);
    expect(new OAuthError('access_denied').status).toBe(403);
    expect(new OAuthError('server_error').status).toBe(500);
    expect(new OAuthError('temporarily_unavailable').status).toBe(503);
  });
});

describe('sendOAuthErrorJson', () => {
  it('写入 status 和 RFC 6749 §5.2 格式 body', () => {
    const r = makeRes();
    sendOAuthErrorJson(r as never, new OAuthError('invalid_grant', 'code 已用'));
    expect(r.captured.status).toBe(400);
    expect(r.captured.body).toMatchObject({
      error: 'invalid_grant',
      error_description: 'code 已用',
    });
  });
});

describe('asOAuthError', () => {
  it('OAuthError 透传', () => {
    const e = new OAuthError('invalid_request');
    expect(asOAuthError(e)).toBe(e);
  });

  it('其他错误包装成 server_error', () => {
    const e = asOAuthError(new Error('boom'));
    expect(e.code).toBe('server_error');
    expect(e.description).toBe('boom');
  });

  it('非 Error 也能包装', () => {
    expect(asOAuthError('string err').description).toBe('string err');
    expect(asOAuthError(42).description).toBe('42');
  });
});

describe('buildRedirectError', () => {
  it('在 redirect_uri 上挂 error/error_description/state', () => {
    const url = buildRedirectError(
      'https://app.example.com/cb',
      new OAuthError('invalid_scope', 'foo 不允许'),
      'abc123',
    );
    const u = new URL(url);
    expect(u.searchParams.get('error')).toBe('invalid_scope');
    expect(u.searchParams.get('error_description')).toBe('foo 不允许');
    expect(u.searchParams.get('state')).toBe('abc123');
  });

  it('description 缺失则不挂', () => {
    const url = buildRedirectError(
      'https://app.example.com/cb',
      new OAuthError('invalid_request'),
      undefined,
    );
    const u = new URL(url);
    expect(u.searchParams.get('error')).toBe('invalid_request');
    expect(u.searchParams.has('state')).toBe(false);
  });
});
