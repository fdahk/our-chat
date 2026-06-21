import { describe, it, expect } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { deriveS256Challenge, isValidVerifier, verifyS256 } from '../../../src/oauth/pkce.js';

function genVerifier(len = 64): string {
  return randomBytes(len).toString('base64url').slice(0, len);
}

describe('pkce.isValidVerifier', () => {
  it('43 字符是合法长度下界', () => {
    expect(isValidVerifier('A'.repeat(43))).toBe(true);
  });

  it('42 字符不合法', () => {
    expect(isValidVerifier('A'.repeat(42))).toBe(false);
  });

  it('128 字符是合法长度上界', () => {
    expect(isValidVerifier('A'.repeat(128))).toBe(true);
  });

  it('129 字符不合法', () => {
    expect(isValidVerifier('A'.repeat(129))).toBe(false);
  });

  it('含非允许字符不合法', () => {
    const bad = 'A'.repeat(42) + '!';
    expect(isValidVerifier(bad)).toBe(false);
  });

  it('允许 [A-Za-z0-9-._~]', () => {
    expect(isValidVerifier('A'.repeat(40) + '-._~')).toBe(true);
  });
});

describe('pkce.deriveS256Challenge', () => {
  it('结果与原始 SHA256 base64url 一致', () => {
    const v = genVerifier(64);
    const expected = createHash('sha256').update(v).digest('base64url');
    expect(deriveS256Challenge(v)).toBe(expected);
  });

  it('已知向量(RFC 7636 §B)', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const expected = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    expect(deriveS256Challenge(verifier)).toBe(expected);
  });
});

describe('pkce.verifyS256', () => {
  it('正确 verifier 对应 challenge → true', () => {
    const v = genVerifier();
    const c = deriveS256Challenge(v);
    expect(verifyS256(v, c)).toBe(true);
  });

  it('错误 verifier → false', () => {
    const v1 = genVerifier();
    const v2 = genVerifier();
    const c = deriveS256Challenge(v1);
    expect(verifyS256(v2, c)).toBe(false);
  });

  it('非法格式 verifier 直接 false,不走 hash', () => {
    expect(verifyS256('short', 'whatever')).toBe(false);
  });

  it('长度不等 challenge → false(无 timing leak)', () => {
    const v = genVerifier();
    expect(verifyS256(v, 'short')).toBe(false);
  });
});
