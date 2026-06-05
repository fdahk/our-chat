import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/database/mySql.js', () => ({
  mySql: { execute: vi.fn() },
}));

import { mySql } from '../../../src/database/mySql.js';
import {
  DEFAULT_WEB_CLIENT,
  initOAuthSchema,
  seedDefaultClient,
} from '../../../src/oauth/init.js';

const exec = mySql.execute as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => exec.mockReset());

describe('initOAuthSchema', () => {
  it('依次执行三条 CREATE TABLE IF NOT EXISTS', async () => {
    exec.mockResolvedValue([{ affectedRows: 0 }, []]);
    await initOAuthSchema();
    expect(exec).toHaveBeenCalledTimes(3);
    const stmts = exec.mock.calls.map((c) => c[0] as string);
    expect(stmts[0]).toMatch(/CREATE TABLE IF NOT EXISTS oauth_clients/);
    expect(stmts[1]).toMatch(/CREATE TABLE IF NOT EXISTS oauth_codes/);
    expect(stmts[2]).toMatch(/CREATE TABLE IF NOT EXISTS oauth_refresh_tokens/);
  });

  it('每条 DDL 都是单条语句(避免 mysql2 多语句风险)', async () => {
    exec.mockResolvedValue([{ affectedRows: 0 }, []]);
    await initOAuthSchema();
    for (const [stmt] of exec.mock.calls) {
      const trailing = (stmt as string).split(';').map((s) => s.trim()).filter(Boolean);
      expect(trailing).toHaveLength(1);
    }
  });
});

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

  it('INSERT ... ON DUPLICATE KEY UPDATE 允许 dev 重启', async () => {
    exec.mockResolvedValue([{ affectedRows: 1 }, []]);
    await seedDefaultClient();
    const [sql, params] = exec.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO oauth_clients/);
    expect(sql).toMatch(/ON DUPLICATE KEY UPDATE/);
    expect(params).toContain('our-chat-web');
    // JSON 字段必须 CAST 否则 MySQL 会把字符串当 VARCHAR
    expect(sql).toMatch(/CAST\(\? AS JSON\)/);
  });

  it('接受自定义 client 参数', async () => {
    exec.mockResolvedValue([{ affectedRows: 1 }, []]);
    await seedDefaultClient({
      client_id: 'custom',
      client_name: 'C',
      client_type: 'confidential',
      redirect_uris: ['https://x.com/cb'],
      allowed_scopes: ['openid'],
      allowed_grant_types: ['authorization_code'],
    });
    const [, params] = exec.mock.calls[0];
    expect(params).toContain('custom');
    expect(params).toContain('confidential');
  });
});
