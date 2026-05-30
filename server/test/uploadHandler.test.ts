import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  calculateFileMD5,
  calculateStreamMD5,
  mergeChunks,
  checkFileExists,
} from '../src/utils/uploadHandler.js';

// uploadHandler 内部把 chunks 写到 path.resolve('../uploads/chunks')、合并产物写到 '../uploads'
const uploadDir = path.resolve('../uploads');
const chunksDir = path.resolve('../uploads/chunks');
const createdFiles: string[] = [];

afterAll(() => {
  for (const f of createdFiles) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
});

describe('uploadHandler MD5', () => {
  it('calculateFileMD5 对 "hello" 给出已知 md5', () => {
    expect(calculateFileMD5(Buffer.from('hello'))).toBe('5d41402abc4b2a76b9719d911017c592');
  });

  it('calculateStreamMD5 与 buffer 版结果一致', async () => {
    const tmp = path.join(os.tmpdir(), `md5-${Date.now()}.txt`);
    fs.writeFileSync(tmp, 'hello');
    try {
      expect(await calculateStreamMD5(tmp)).toBe(calculateFileMD5(Buffer.from('hello')));
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});

describe('mergeChunks', () => {
  it('缺少分片时抛错', async () => {
    await expect(mergeChunks(`nope-${Date.now()}`, 'x.bin', 3)).rejects.toThrow('分片 0 不存在');
  });

  it('合并后删除分片并返回目标路径', async () => {
    const fileId = `mc-${Date.now()}`;
    const fileName = `${fileId}.bin`;
    const c0 = path.join(chunksDir, `${fileId}-0`);
    const c1 = path.join(chunksDir, `${fileId}-1`);
    fs.writeFileSync(c0, 'foo');
    fs.writeFileSync(c1, 'bar');

    const out = await mergeChunks(fileId, fileName, 2);
    createdFiles.push(out);

    expect(out).toBe(path.join(uploadDir, fileName));
    // 分片合并后应被逐个删除
    expect(fs.existsSync(c0)).toBe(false);
    expect(fs.existsSync(c1)).toBe(false);
  });
});

describe('checkFileExists', () => {
  it('不存在的 md5 返回 exists:false', async () => {
    const result = await checkFileExists('0'.repeat(32));
    expect(result.exists).toBe(false);
  });
});
