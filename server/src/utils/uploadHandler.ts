import multer from 'multer';
import crypto from 'crypto';
import sharp from 'sharp';

// ==================== MD5 计算 ====================

// 计算内存 buffer 的 MD5(秒传去重用)。文件已在内存,无需读盘。
export const calculateFileMD5 = (buffer: Buffer): string => {
  return crypto.createHash('md5').update(buffer).digest('hex');
};

// ==================== 图片压缩 ====================

// buffer → buffer 压缩为 JPEG。文件本就在内存,无需临时文件中转。
export const compressImageBuffer = (buffer: Buffer, quality = 80): Promise<Buffer> => {
  return sharp(buffer).jpeg({ quality }).toBuffer();
};

// ==================== Multer(内存存储)====================

// 文件进内存 buffer,由业务层交给 StorageService 上传对象存储,不落盘。
const storage = multer.memoryStorage();

// 文件类型过滤器(沿用原有 allowedTypes 约定)
const fileFilter: multer.Options['fileFilter'] = (req, file, cb) => {
  const allowedTypes = (req.body as { allowedTypes?: string }).allowedTypes;
  if (allowedTypes) {
    const types = allowedTypes.split(',');
    const isAllowed = types.some((type) => file.mimetype.includes(type));
    if (!isAllowed) {
      return cb(new Error(`文件类型不允许: ${file.mimetype}`));
    }
  }
  cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 10,
  },
});
