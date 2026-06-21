import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

describe('安全响应头(helmet)', () => {
  it('响应带 X-Content-Type-Options: nosniff', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('隐藏 X-Powered-By(不暴露 Express 指纹)', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
