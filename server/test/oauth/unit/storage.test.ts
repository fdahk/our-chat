import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/database/prisma.js', () => ({
  prisma: {
    oAuthCode: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
    oAuthRefreshToken: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../../src/database/prisma.js';
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

const code = prisma.oAuthCode;
const rt = prisma.oAuthRefreshToken;

const codeCreate = code.create as unknown as ReturnType<typeof vi.fn>;
const codeUpdate = code.updateMany as unknown as ReturnType<typeof vi.fn>;
const codeFind = code.findUnique as unknown as ReturnType<typeof vi.fn>;
const codeDelete = code.deleteMany as unknown as ReturnType<typeof vi.fn>;
const rtCreate = rt.create as unknown as ReturnType<typeof vi.fn>;
const rtUpdate = rt.updateMany as unknown as ReturnType<typeof vi.fn>;
const rtFind = rt.findUnique as unknown as ReturnType<typeof vi.fn>;
const rtDelete = rt.deleteMany as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  codeCreate.mockReset();
  codeUpdate.mockReset();
  codeFind.mockReset();
  codeDelete.mockReset();
  rtCreate.mockReset();
  rtUpdate.mockReset();
  rtFind.mockReset();
  rtDelete.mockReset();
});

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
  it('返回高熵字符串,prisma.create 携带全部字段', async () => {
    codeCreate.mockResolvedValue({});
    const c = await createCode({
      client_id: 'web',
      user_id: 7,
      redirect_uri: 'https://app/cb',
      code_challenge: 'CHAL',
      code_challenge_method: 'S256',
      scope: 'openid',
      nonce: 'nonce-1',
      ttlSec: 60,
    });
    expect(c.length).toBeGreaterThan(40);
    const arg = codeCreate.mock.calls[0][0];
    expect(arg.data.clientId).toBe('web');
    expect(arg.data.codeChallenge).toBe('CHAL');
    expect(arg.data.codeChallengeMethod).toBe('S256');
  });
});

describe('consumeCode', () => {
  it('UPDATE count = 0 → null(已被用 / 不存在)', async () => {
    codeUpdate.mockResolvedValueOnce({ count: 0 });
    expect(await consumeCode('xxx')).toBeNull();
  });

  it('UPDATE count = 1 + findUnique 命中 → 返回 OAuthCode', async () => {
    codeUpdate.mockResolvedValueOnce({ count: 1 });
    codeFind.mockResolvedValueOnce({
      code: 'c1',
      clientId: 'web',
      userId: 7n,
      redirectUri: 'https://app/cb',
      codeChallenge: 'CHAL',
      codeChallengeMethod: 'S256',
      scope: 'openid',
      nonce: null,
      expiresAt: new Date(Date.now() + 60_000),
      used: true,
    });
    const c = await consumeCode('c1');
    expect(c?.code).toBe('c1');
    expect(c?.used).toBe(true);
    expect(c?.user_id).toBe(7);
  });
});

describe('findRefreshToken', () => {
  it('不存在 → null', async () => {
    rtFind.mockResolvedValueOnce(null);
    expect(await findRefreshToken('rt-x')).toBeNull();
  });

  it('存在 → 返回行,user_id 是 number', async () => {
    rtFind.mockResolvedValueOnce({
      jti: 'rt-1',
      familyId: 'fam-1',
      clientId: 'web',
      userId: 1n,
      scope: 'agent-server',
      issuedAt: new Date(),
      expiresAt: new Date(),
      revoked: false,
      rotatedTo: null,
      rotatedAt: null,
      revokeReason: null,
    });
    const r = await findRefreshToken('rt-1');
    expect(r?.jti).toBe('rt-1');
    expect(r?.revoked).toBe(false);
    expect(r?.user_id).toBe(1);
  });
});

describe('insertRefreshToken', () => {
  it('prisma.create 带 BigInt user_id', async () => {
    rtCreate.mockResolvedValue({});
    await insertRefreshToken({
      jti: 'rt-new',
      family_id: 'fam-1',
      client_id: 'web',
      user_id: 7,
      scope: 'agent-server',
      expiresAt: new Date(),
    });
    const arg = rtCreate.mock.calls[0][0];
    expect(arg.data.jti).toBe('rt-new');
    expect(arg.data.userId).toBe(7n);
  });
});

describe('rotateRefreshToken', () => {
  it('updateMany count = 1 → true', async () => {
    rtUpdate.mockResolvedValueOnce({ count: 1 });
    const ok = await rotateRefreshToken({ oldJti: 'rt-1', newJti: 'rt-2' });
    expect(ok).toBe(true);
  });

  it('updateMany count = 0 → false(并发被抢 / 已 rotated_to / 已 revoked)', async () => {
    rtUpdate.mockResolvedValueOnce({ count: 0 });
    expect(await rotateRefreshToken({ oldJti: 'rt-1', newJti: 'rt-2' })).toBe(false);
  });

  it('WHERE 含 rotatedTo:null + revoked:false', async () => {
    rtUpdate.mockResolvedValueOnce({ count: 1 });
    await rotateRefreshToken({ oldJti: 'rt-1', newJti: 'rt-2' });
    const arg = rtUpdate.mock.calls[0][0];
    expect(arg.where.rotatedTo).toBeNull();
    expect(arg.where.revoked).toBe(false);
  });
});

describe('invalidateFamily', () => {
  it('返回影响行数,reason 写入', async () => {
    rtUpdate.mockResolvedValueOnce({ count: 3 });
    const n = await invalidateFamily('fam-1', 'reuse_detected');
    expect(n).toBe(3);
    const arg = rtUpdate.mock.calls[0][0];
    expect(arg.where.familyId).toBe('fam-1');
    expect(arg.data.revokeReason).toBe('reuse_detected');
  });
});

describe('revokeRefreshTokenByJti', () => {
  it('count = 1 → true', async () => {
    rtUpdate.mockResolvedValueOnce({ count: 1 });
    expect(await revokeRefreshTokenByJti('rt-1', 'logout')).toBe(true);
  });

  it('count = 0 → false', async () => {
    rtUpdate.mockResolvedValueOnce({ count: 0 });
    expect(await revokeRefreshTokenByJti('rt-1', 'logout')).toBe(false);
  });
});

describe('revokeAllUserRefreshTokens', () => {
  it('返回影响行数,where 用 BigInt user_id', async () => {
    rtUpdate.mockResolvedValueOnce({ count: 5 });
    expect(await revokeAllUserRefreshTokens(7, 'logout_all')).toBe(5);
    const arg = rtUpdate.mock.calls[0][0];
    expect(arg.where.userId).toBe(7n);
  });
});

describe('cleanup tasks', () => {
  it('cleanupExpiredCodes 删过期 + 已用旧于一天', async () => {
    codeDelete.mockResolvedValueOnce({ count: 2 });
    const n = await cleanupExpiredCodes();
    expect(n).toBe(2);
    const arg = codeDelete.mock.calls[0][0];
    expect(arg.where.OR).toHaveLength(2);
  });

  it('cleanupExpiredRefreshTokens 保留 revoked 7 天作审计', async () => {
    rtDelete.mockResolvedValueOnce({ count: 4 });
    expect(await cleanupExpiredRefreshTokens()).toBe(4);
    const arg = rtDelete.mock.calls[0][0];
    expect(arg.where.OR).toHaveLength(2);
  });
});
