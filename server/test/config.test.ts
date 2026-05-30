import { describe, it, expect } from 'vitest';
import { config } from '../src/config/config.js';

describe('config', () => {
  it('开发环境下无 JWT_SECRET 时回退为随机十六进制密钥', () => {
    // 测试进程未设置 JWT_SECRET，应得到 randomBytes(32) 的 64 位 hex
    expect(typeof config.jwtSecret).toBe('string');
    expect(config.jwtSecret.length).toBeGreaterThanOrEqual(32);
  });

  it('jwtExpiresIn 默认 7d', () => {
    expect(config.jwtExpiresIn).toBe(process.env.JWT_EXPIRES_IN || '7d');
  });
});
