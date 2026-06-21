import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID, createHash } from 'crypto';
import app from '../../src/app.js';
import { prisma, createUser, authCookies, cleanup } from './helpers.js';
import { getObjectStream, deleteObject } from '../../src/storage/storage.js';

// 上传链路集成:真 MinIO(对象存储)+ 真 PG(UploadedFile/UploadSession)。
// 覆盖 single(落对象+登记+秒传去重)、check(秒传命中/未命中)、chunk→resume→merge(S3 multipart)。
describe('上传链路集成(真 MinIO + PG)', () => {
  const userIds: bigint[] = [];
  const md5s: string[] = [];
  const objectKeys: string[] = [];
  let auth: { cookie: string; csrf: string };

  const keyFromUrl = (url: string): string => url.split('/our-chat/')[1] ?? '';

  beforeAll(async () => {
    const user = await createUser();
    userIds.push(user.id);
    auth = authCookies(user);
  });

  afterAll(async () => {
    if (md5s.length) {
      await prisma.uploadedFile.deleteMany({ where: { md5: { in: md5s } } });
    }
    for (const key of objectKeys) {
      if (key) await deleteObject(key).catch(() => undefined);
    }
    await cleanup([], userIds);
  });

  it('单文件上传:存入 MinIO + 登记 UploadedFile + 返回可访问 URL', async () => {
    const content = Buffer.from(`single-${randomUUID()}`);
    const md5 = createHash('md5').update(content).digest('hex');

    const res = await request(app)
      .post('/api/upload/single')
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrf)
      .attach('file', content, 'hello.txt');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.md5).toBe(md5);
    expect(res.body.data.url).toContain('/our-chat/');
    md5s.push(md5);

    // DB 落了一条 UploadedFile
    const row = await prisma.uploadedFile.findUnique({ where: { md5 } });
    expect(row).not.toBeNull();
    objectKeys.push(row!.objectKey);

    // 对象确实在 MinIO 里(可取流)
    const stream = await getObjectStream(row!.objectKey);
    expect(stream).toBeTruthy();
  });

  it('秒传 check:已上传 md5 命中,随机 md5 未命中', async () => {
    const md5 = md5s[0];

    const hit = await request(app)
      .post('/api/upload/check')
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrf)
      .send({ fileMD5: md5 });
    expect(hit.status).toBe(200);
    expect(hit.body.data.exists).toBe(true);
    expect(hit.body.data.url).toContain('/our-chat/');

    const miss = await request(app)
      .post('/api/upload/check')
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrf)
      .send({ fileMD5: 'f'.repeat(32) });
    expect(miss.status).toBe(200);
    expect(miss.body.data.exists).toBe(false);
  });

  it('分片上传 → resume → merge(单片 multipart)', async () => {
    const fileId = `it-${randomUUID()}`;
    const fileName = `${Date.now()}-chunk.bin`;
    const content = Buffer.from(`chunk-${randomUUID()}`);

    // 上传第 0 片(单片即末片,不受 5MB 最小分片限制)
    const chunkRes = await request(app)
      .post(`/api/upload/chunk?fileId=${fileId}&chunkIndex=0`)
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrf)
      .field('fileName', fileName)
      .field('totalChunks', '1')
      .attach('chunk', content, 'chunk-0');
    expect(chunkRes.status).toBe(200);

    // 断点续传查询:已传分片 = [0]
    const resumeRes = await request(app)
      .get(`/api/upload/resume/${fileId}`)
      .set('Cookie', auth.cookie);
    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body.data.uploadedChunks).toEqual([0]);

    // 合并
    const mergeRes = await request(app)
      .post('/api/upload/merge')
      .set('Cookie', auth.cookie)
      .set('X-CSRF-Token', auth.csrf)
      .send({ fileId, fileName, totalChunks: 1 });
    expect(mergeRes.status).toBe(200);
    expect(mergeRes.body.data.url).toContain('/our-chat/');
    objectKeys.push(keyFromUrl(mergeRes.body.data.url));

    // 合并后会话已清理
    const session = await prisma.uploadSession.findUnique({ where: { fileId } });
    expect(session).toBeNull();

    // 合并产物确实在 MinIO
    const stream = await getObjectStream(keyFromUrl(mergeRes.body.data.url));
    expect(stream).toBeTruthy();
  });
});
