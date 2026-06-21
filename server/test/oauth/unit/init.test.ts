import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/database/prisma.js', () => ({
  prisma: {
    oAuthClient: { upsert: vi.fn() },
  },
}));

import { prisma } from '../../../src/database/prisma.js';
import { DEFAULT_WEB_CLIENT, seedDefaultClient } from '../../../src/oauth/init.js';

const upsert = prisma.oAuthClient.upsert as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => upsert.mockReset());

describe('seedDefaultClient', () => {
  it('默认 client 配置:public + S256 + 完整 scope', () => {
    expect(DEFAULT_WEB_CLIENT.client_id).toBe('our-chat-web');
    expect(DEFAULT_WEB_CLIENT.client_type).toBe('public');
    expect(DEFAULT_WEB_CLIENT.allowed_scopes).toContain('openid');
    expect(DEFAULT_WEB_CLIENT.allowed_scopes).toContain('agent-server');
    expect(DEFAULT_WEB_CLIENT.allowed_grant_types).toEqual([
      'authorization_code',
      'refresh_token',
    ]);
  });

  it('upsert(create + update)允许 dev 重启更新 env 配置', async () => {
    upsert.mockResolvedValue({});
    await seedDefaultClient();
    const arg = upsert.mock.calls[0][0];
    expect(arg.where.clientId).toBe('our-chat-web');
    expect(arg.create.clientType).toBe('public');
    expect(arg.create.clientId).toBe('our-chat-web');
    expect(arg.update.redirectUris).toBeDefined();
    expect(arg.update.allowedScopes).toEqual(DEFAULT_WEB_CLIENT.allowed_scopes);
  });

  it('接受自定义 client 参数', async () => {
    upsert.mockResolvedValue({});
    await seedDefaultClient({
      client_id: 'custom',
      client_name: 'C',
      client_type: 'confidential',
      redirect_uris: ['https://x.com/cb'],
      allowed_scopes: ['openid'],
      allowed_grant_types: ['authorization_code'],
    });
    const arg = upsert.mock.calls[0][0];
    expect(arg.where.clientId).toBe('custom');
    expect(arg.create.clientType).toBe('confidential');
  });
});
