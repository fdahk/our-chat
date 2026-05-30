import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { promisify } from 'util';
import sharp from 'sharp';
import archiver from 'archiver';

const readFileAsync = promisify(fs.readFile);

// ==================== 存储路径配置 ====================
const uploadDir = path.resolve('../uploads');
const chunksDir = path.resolve('../uploads/chunks');
const tempDir = path.resolve('../uploads/temp');

[uploadDir, chunksDir, tempDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ==================== MD5计算工具 ====================

// 计算文件buffer的MD5值
export const calculateFileMD5 = (buffer: Buffer): string => {
  return crypto.createHash('md5').update(buffer).digest('hex');
};

// 计算文件流的MD5值（适用于大文件）
export const calculateStreamMD5 = (filePath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
};

// ==================== 文件压缩工具 ====================

// 压缩图片文件
export const compressImage = async (
  inputPath: string,
  outputPath: string,
  quality = 80
): Promise<void> => {
  await sharp(inputPath)
    .jpeg({ quality })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
};

type ZipFileInput = string | { path: string; name: string };

// 将多个文件压缩为zip格式
export const compressToZip = (files: ZipFileInput[], outputPath: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve(archive.pointer()));
    archive.on('error', reject);

    archive.pipe(output);

    files.forEach((file) => {
      if (typeof file === 'string') {
        archive.file(file, { name: path.basename(file) });
      } else {
        archive.file(file.path, { name: file.name });
      }
    });

    void archive.finalize();
  });
};

// ==================== Multer配置 ====================

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    // 只能调用 query，前端参数此时只有 URL 参数被解析；分片上传时 uploadType=chunk
    const uploadType = (req.query.uploadType as string | undefined) || 'default';
    const targetDir = uploadType === 'chunk' ? chunksDir : uploadDir;
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    if (req.query.uploadType === 'chunk') {
      const { fileId, chunkIndex } = req.query as { fileId?: string; chunkIndex?: string };
      cb(null, `${fileId}-${chunkIndex}`);
    } else {
      const ext = path.extname(file.originalname);
      const basename = path.basename(file.originalname, ext);
      const uniqueName = `${basename}-${Date.now()}${ext}`;
      cb(null, uniqueName);
    }
  },
});

// 文件类型过滤器
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

// ==================== 分片处理工具 ====================

// 合并文件分片
export const mergeChunks = async (
  fileId: string,
  fileName: string,
  totalChunks: number
): Promise<string> => {
  const outputPath = path.join(uploadDir, fileName);
  const writeStream = fs.createWriteStream(outputPath);

  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = path.join(chunksDir, `${fileId}-${i}`);

    if (!fs.existsSync(chunkPath)) {
      throw new Error(`分片 ${i} 不存在`);
    }

    const chunkBuffer = await readFileAsync(chunkPath);
    writeStream.write(chunkBuffer);

    fs.unlinkSync(chunkPath);
  }

  writeStream.end();
  return outputPath;
};

// ==================== 秒传功能工具 ====================

export interface FileExistsResult {
  exists: boolean;
  url?: string;
  path?: string;
}

// 检查文件是否已存在（用于秒传功能）
export const checkFileExists = async (fileMD5: string): Promise<FileExistsResult> => {
  const files = fs.readdirSync(uploadDir);

  for (const file of files) {
    const filePath = path.join(uploadDir, file);

    if (fs.statSync(filePath).isFile()) {
      const existingMD5 = await calculateStreamMD5(filePath);

      if (existingMD5 === fileMD5) {
        return {
          exists: true,
          url: `/user/uploads/${file}`,
          path: filePath,
        };
      }
    }
  }

  return { exists: false };
};
