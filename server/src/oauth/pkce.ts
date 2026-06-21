// PKCE 校验工具,RFC 7636

import { createHash } from 'crypto';

// RFC 7636 §4.1:verifier 是 [A-Z][a-z][0-9]-._~ 字符,长度 43-128
const VERIFIER_REGEX = /^[A-Za-z0-9\-._~]{43,128}$/;

export function isValidVerifier(verifier: string): boolean {
  return VERIFIER_REGEX.test(verifier);
}

// base64url(SHA256(verifier))
export function deriveS256Challenge(verifier: string): string {
  const hash = createHash('sha256').update(verifier).digest();
  return hash.toString('base64url');
}

// 比对(timing-safe 不是必需,因为 challenge 不是 secret——但代价低就用)
export function verifyS256(
  verifier: string,
  storedChallenge: string,
): boolean {
  if (!isValidVerifier(verifier)) return false;
  const derived = deriveS256Challenge(verifier);
  return timingSafeEqualStr(derived, storedChallenge);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
