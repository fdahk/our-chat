import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// 用户不存在 → 命中限流前每次返回 400;不连库
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

let app: Express;

beforeAll(async () => {
  // 收紧阈值便于测试;在 import app 之前设置,确保 limiter 构造时读到
  process.env.AUTH_RATE_LIMIT_MAX = '3';
  app = (await import('../src/app.js')).default;
});

describe('认证端点限流(防爆破)', () => {
  it('login 连续请求超过阈值后返回 429', async () => {
    const hit = () => request(app).post('/api/login').send({ username: 'x', password: 'y' });
    await hit();
    await hit();
    await hit(); // 3 次达上限
    const res = await hit(); // 第 4 次应被限流
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ success: false });
  });
});
