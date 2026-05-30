import { describe, it, expect, vi } from 'vitest';
import type { Response } from 'express';
import {
  generateCsrfToken,
  setAuthCookies,
  clearAuthCookies,
  TOKEN_COOKIE,
  CSRF_COOKIE,
  REMEMBER_MAX_AGE,
  SESSION_MAX_AGE,
} from '../src/utils/authCookies.js';

const makeRes = () =>
  ({
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  }) as unknown as Response;

describe('authCookies', () => {
  it('generateCsrfToken 产出 48 位十六进制（24 字节）', () => {
    const token = generateCsrfToken();
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    expect(generateCsrfToken()).not.toBe(token);
  });

  it('setAuthCookies：token 走 HttpOnly，csrf 可读，二者 sameSite=strict', () => {
    const res = makeRes();
    setAuthCookies(res, 'tok', 'csrf', REMEMBER_MAX_AGE);

    expect(res.cookie).toHaveBeenCalledTimes(2);
    const calls = (res.cookie as ReturnType<typeof vi.fn>).mock.calls;

    const tokenCall = calls.find((c) => c[0] === TOKEN_COOKIE)!;
    expect(tokenCall[1]).toBe('tok');
    expect(tokenCall[2]).toMatchObject({ httpOnly: true, sameSite: 'strict', maxAge: REMEMBER_MAX_AGE });

    const csrfCall = calls.find((c) => c[0] === CSRF_COOKIE)!;
    expect(csrfCall[1]).toBe('csrf');
    expect(csrfCall[2]).toMatchObject({ httpOnly: false, sameSite: 'strict' });
  });

  it('SESSION_MAX_AGE 为 1 小时、REMEMBER_MAX_AGE 为 7 天', () => {
    expect(SESSION_MAX_AGE).toBe(60 * 60 * 1000);
    expect(REMEMBER_MAX_AGE).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('clearAuthCookies 清掉两个鉴权 cookie', () => {
    const res = makeRes();
    clearAuthCookies(res);
    expect(res.clearCookie).toHaveBeenCalledWith(TOKEN_COOKIE, { path: '/' });
    expect(res.clearCookie).toHaveBeenCalledWith(CSRF_COOKIE, { path: '/' });
  });
});
