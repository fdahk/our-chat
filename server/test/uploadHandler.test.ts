import { describe, it, expect } from 'vitest';
import { calculateFileMD5, compressImageBuffer } from '../src/utils/uploadHandler.js';
import { buildObjectKey } from '../src/storage/storage.js';
import sharp from 'sharp';

describe('calculateFileMD5', () => {
  it('对 "hello" 给出已知 md5', () => {
    expect(calculateFileMD5(Buffer.from('hello'))).toBe('5d41402abc4b2a76b9719d911017c592');
  });
});

describe('compressImageBuffer', () => {
  it('输出 JPEG buffer', async () => {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();
    const out = await compressImageBuffer(png, 70);
    // JPEG 文件头魔数 FF D8 FF
    expect(out[0]).toBe(0xff);
    expect(out[1]).toBe(0xd8);
    expect(out[2]).toBe(0xff);
  });
});

describe('buildObjectKey', () => {
  it('用 md5 作为对象键基名,保留扩展名并归到 uploads/{yyyymm}/', () => {
    const key = buildObjectKey('photo.PNG', 'a'.repeat(32));
    expect(key).toMatch(/^uploads\/\d{6}\/a{32}\.png$/);
  });

  it('不传基名时用随机 uuid', () => {
    const k1 = buildObjectKey('x.bin');
    const k2 = buildObjectKey('x.bin');
    expect(k1).not.toBe(k2);
    expect(k1).toMatch(/^uploads\/\d{6}\/[0-9a-f-]{36}\.bin$/);
  });
});
