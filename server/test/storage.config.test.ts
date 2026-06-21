import { describe, it, expect } from 'vitest';
import { resolveS3Config } from '../src/storage/storage.js';

describe('resolveS3Config', () => {
  it('生产环境缺 S3 凭证时 fail-fast 抛错(不静默回落到 minioadmin@localhost)', () => {
    expect(() => resolveS3Config({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(
      /对象存储/,
    );
  });

  it('生产环境配齐则正常返回配置', () => {
    const cfg = resolveS3Config({
      NODE_ENV: 'production',
      S3_ENDPOINT: 'https://cos.ap-guangzhou.myqcloud.com',
      S3_ACCESS_KEY: 'id',
      S3_SECRET_KEY: 'secret',
      S3_BUCKET: 'prod-bucket',
    } as NodeJS.ProcessEnv);
    expect(cfg.bucket).toBe('prod-bucket');
    expect(cfg.endpoint).toBe('https://cos.ap-guangzhou.myqcloud.com');
  });

  it('开发环境缺配置时用本地 MinIO 默认值,不抛', () => {
    const cfg = resolveS3Config({} as NodeJS.ProcessEnv);
    expect(cfg.endpoint).toBe('http://localhost:9000');
    expect(cfg.accessKeyId).toBe('minioadmin');
    expect(cfg.bucket).toBe('our-chat');
  });
});
