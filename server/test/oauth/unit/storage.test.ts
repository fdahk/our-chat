import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/database/mySql.js', () => ({
  mySql: { execute: vi.fn() },
}));

import { mySql } from '../../../src/database/mySql.js';
import {
  cleanupExpiredCodes,
  cleanupExpiredRefreshTokens,
  consumeCode,
  createCode,
  findRefreshToken,
  insertRefreshToken,
  invalidateFamily,
  newFamilyId,
  newJti,
  revokeAllUserRefreshTokens,
  revokeRefreshTokenByJti,
  rotateRefreshToken,
} from '../../../src/oauth/storage.js';

const exec = mySql.execute as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => exec.mockReset());

describe('id 生成', () => {
  it('newJti 加前缀', () => {
    expect(newJti('at')).toMatch(/^at-/);
    expect(newJti('rt')).toMatch(/^rt-/);
  });

  it('newFamilyId 加前缀', () => {
    expect(newFamilyId()).toMatch(/^fam-/);
  });
});

describe('createCode', () => {
  it('成功返回高熵字符串,SQL 携带全部字段', async () => {
    exec.mockResolvedValue([{ affectedRows: 1 }, []]);
    const code = await createCode({
      client_id: 'web',
      user_id: 7,
      redirect_uri: 'https://app/cb',
      code_challenge: 'CHAL',
      code_challenge_method: 'S256',
      scope: 'openid',
      nonce: 'nonce-1',
      ttlSec: 60,
    });
    expect(code.length).toBeGreaterThan(40);
    const [sql, params] = exec.mock.calls[0];
    expect(sql).toContain('INSERT INTO oauth_codes');
    expect(params).toContain('web');
    expect(params).toContain('CHAL');
    expect(params).toContain('S256');
  });
});

describe('consumeCode', () => {
  it('UPDATE 影响 0 → null(已被用 / 不存在)', async () => {
    exec.mockResolvedValueOnce([{ affectedRows: 0 }, []]);
    const c = await consumeCode('xxx');
    expect(c).toBeNull();
  });

  it('UPDATE 影响 1 + SELECT 命中 → 返回 OAuthCode', async () => {
    exec
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([
        [{
          code: 'c1',
          client_id: 'web',
          user_id: 7,
          redirect_uri: 'https://app/cb',
          code_challenge: 'CHAL',
          code_challenge_method: 'S256',
          scope: 'openid',
          nonce: null,
          expires_at: new Date(Date.now() + 60_000),
          used: 1,
        }],
        [],
      ]);
    const c = await consumeCode('c1');
    expect(c?.code).toBe('c1');
    expect(c?.used).toBe(true);
  });
});

describe('findRefreshToken', () => {
  it('不存在 → null', async () => {
    exec.mockResolvedValueOnce([[], []]);
    expect(await findRefreshToken('rt-x')).toBeNull();
  });

  it('存在 → 返回行', async () => {
    exec.mockResolvedValueOnce([[{
      jti: 'rt-1',
      family_id: 'fam-1',
      client_id: 'web',
      user_id: 1,
      scope: 'agent-server',
      issued_at: new Date(),
      expires_at: new Date(),
      revoked: 0,
      rotated_to: null,
      rotated_at: null,
      revoke_reason: null,
    }], []]);
    const rt = await findRefreshToken('rt-1');
    expect(rt?.jti).toBe('rt-1');
    expect(rt?.revoked).toBe(false);
  });
});

describe('insertRefreshToken', () => {
  it('SQL INSERT 带全部字段', async () => {
    exec.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    await insertRefreshToken({
      jti: 'rt-new',
      family_id: 'fam-1',
      client_id: 'web',
      user_id: 7,
      scope: 'agent-server',
      expiresAt: new Date(),
    });
    const [sql] = exec.mock.calls[0];
    expect(sql).toContain('INSERT INTO oauth_refresh_tokens');
  });
});

describe('rotateRefreshToken', () => {
  it('UPDATE 影响 1 → true(rotation 成功)', async () => {
    exec.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const ok = await rotateRefreshToken({ oldJti: 'rt-1', newJti: 'rt-2' });
    expect(ok).toBe(true);
  });

  it('UPDATE 影响 0 → false(并发被抢 / 已 rotated_to / 已 revoked)', async () => {
    exec.mockResolvedValueOnce([{ affectedRows: 0 }, []]);
    const ok = await rotateRefreshToken({ oldJti: 'rt-1', newJti: 'rt-2' });
    expect(ok).toBe(false);
  });

  it('WHERE 含 rotated_to IS NULL + revoked = 0', async () => {
    exec.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    await rotateRefreshToken({ oldJti: 'rt-1', newJti: 'rt-2' });
    const [sql] = exec.mock.calls[0];
    expect(sql).toMatch(/rotated_to IS NULL/);
    expect(sql).toMatch(/revoked = 0/);
  });
});

describe('invalidateFamily', () => {
  it('返回影响行数,reason 写入', async () => {
    exec.mockResolvedValueOnce([{ affectedRows: 3 }, []]);
    const n = await invalidateFamily('fam-1', 'reuse_detected');
    expect(n).toBe(3);
    const [sql, params] = exec.mock.calls[0];
    expect(sql).toContain('UPDATE oauth_refresh_tokens');
    expect(params[0]).toBe('reuse_detected');
  });
});

describe('revokeRefreshTokenByJti', () => {
  it('影响 1 → true', async () => {
    exec.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    expect(await revokeRefreshTokenByJti('rt-1', 'logout')).toBe(true);
  });

  it('影响 0 → false', async () => {
    exec.mockResolvedValueOnce([{ affectedRows: 0 }, []]);
    expect(await revokeRefreshTokenByJti('rt-1', 'logout')).toBe(false);
  });
});

describe('revokeAllUserRefreshTokens', () => {
  it('返回影响行数', async () => {
    exec.mockResolvedValueOnce([{ affectedRows: 5 }, []]);
    expect(await revokeAllUserRefreshTokens(7, 'logout_all')).toBe(5);
  });
});

describe('cleanup tasks', () => {
  it('cleanupExpiredCodes 删 used=0 已过期 + used=1 旧于一天', async () => {
    exec.mockResolvedValueOnce([{ affectedRows: 2 }, []]);
    const n = await cleanupExpiredCodes();
    expect(n).toBe(2);
    const [sql] = exec.mock.calls[0];
    expect(sql).toMatch(/INTERVAL 1 DAY/);
  });

  it('cleanupExpiredRefreshTokens 保留 revoked 7 天作审计', async () => {
    exec.mockResolvedValueOnce([{ affectedRows: 4 }, []]);
    const n = await cleanupExpiredRefreshTokens();
    expect(n).toBe(4);
    const [sql] = exec.mock.calls[0];
    expect(sql).toMatch(/INTERVAL 7 DAY/);
  });
});
