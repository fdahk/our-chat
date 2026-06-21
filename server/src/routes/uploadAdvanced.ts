// 高级文件上传路由(单文件、多文件、大文件分片、断点续传、秒传、压缩、流式)
// 存储后端为 S3 兼容对象存储(dev=MinIO / prod=COS),业务只调 StorageService,不碰文件系统。
// 秒传/分片会话元数据落 Postgres(UploadedFile / UploadSession)。
// 前端接口契约保持不变(见 web/src/globalComponents/fileUploader)。

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { prisma } from '../database/prisma.js';
import {
  buildObjectKey,
  putObject,
  putObjectStream,
  publicUrl,
  headObject,
  createMultipartUpload,
  uploadPart,
  listUploadedParts,
  completeMultipartUpload,
} from '../storage/storage.js';
import { upload, calculateFileMD5, compressImageBuffer } from '../utils/uploadHandler.js';

const router = express.Router();

// 落库一个内存 buffer:先按 MD5 秒传去重,未命中则上传对象存储并登记 UploadedFile。
// 对象键用 MD5 派生(同内容同 key),并发重复上传幂等。
async function persistBuffer(buffer: Buffer, originalName: string, mimeType?: string) {
  const md5 = calculateFileMD5(buffer);
  const existing = await prisma.uploadedFile.findUnique({ where: { md5 } });
  if (existing) {
    return { url: publicUrl(existing.objectKey), md5, size: buffer.length };
  }
  const key = buildObjectKey(originalName, md5);
  await putObject(key, buffer, mimeType);
  const row = await prisma.uploadedFile.upsert({
    where: { md5 },
    create: { md5, objectKey: key, size: BigInt(buffer.length), mimeType },
    update: {},
  });
  return { url: publicUrl(row.objectKey), md5, size: buffer.length };
}

// ==================== 1. 单文件上传 ====================
// POST /api/upload/single
router.post('/single', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '没有上传文件' });
    }
    const { url, md5, size } = await persistBuffer(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
    );
    res.json({
      success: true,
      data: { url, originalName: req.file.originalname, size, md5 },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

// ==================== 2. 多文件上传 ====================
// POST /api/upload/multiple(最多 10 个)
router.post('/multiple', authenticateToken, upload.array('files', 10), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: '没有上传文件' });
    }
    const results = await Promise.all(
      files.map(async (file) => {
        const { url, md5, size } = await persistBuffer(file.buffer, file.originalname, file.mimetype);
        return { url, originalName: file.originalname, size, md5 };
      }),
    );
    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

// ==================== 3. 秒传检查 ====================
// POST /api/upload/check { fileMD5 } → 命中返回已有 URL
router.post('/check', authenticateToken, async (req, res) => {
  try {
    const { fileMD5 } = req.body;
    if (!fileMD5) {
      return res.status(400).json({ success: false, message: '缺少文件MD5' });
    }
    const hit = await prisma.uploadedFile.findUnique({ where: { md5: fileMD5 } });
    if (hit) {
      return res.json({
        success: true,
        data: { exists: true, url: publicUrl(hit.objectKey), message: '文件已存在，秒传成功' },
      });
    }
    res.json({ success: true, data: { exists: false, message: '文件不存在，需要上传' } });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

// ==================== 4. 分片上传 ====================
// POST /api/upload/chunk?fileId=&chunkIndex=  body: chunk(file), fileName, totalChunks
// 首片初始化 S3 multipart 并登记 UploadSession;后续片直传到该 uploadId。
// 约束:S3 multipart 除最后一片外每片最小 5MB(前端切片 5MB/片,正好满足)。
// partNumber 从 1 开始,前端 chunkIndex 从 0,映射 +1。
router.post('/chunk', authenticateToken, upload.single('chunk'), async (req, res) => {
  try {
    const fileId = req.query.fileId as string | undefined;
    const chunkIndex = parseInt(req.query.chunkIndex as string, 10);
    const { fileName, totalChunks } = req.body as { fileName?: string; totalChunks?: string };

    if (!req.file) {
      return res.status(400).json({ success: false, message: '没有上传分片' });
    }
    if (!fileId || Number.isNaN(chunkIndex) || !fileName) {
      return res.status(400).json({ success: false, message: '缺少分片参数(fileId/chunkIndex/fileName)' });
    }

    let session = await prisma.uploadSession.findUnique({ where: { fileId } });
    if (!session) {
      const key = buildObjectKey(fileName);
      const uploadId = await createMultipartUpload(key, req.file.mimetype);
      session = await prisma.uploadSession.create({
        data: {
          fileId,
          uploadId,
          objectKey: key,
          fileName,
          mimeType: req.file.mimetype,
          totalChunks: Number(totalChunks) || 0,
        },
      });
    }

    await uploadPart(session.objectKey, session.uploadId, chunkIndex + 1, req.file.buffer);

    res.json({ success: true, data: { fileId, chunkIndex, message: '分片上传成功' } });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

// ==================== 5. 合并分片 ====================
// POST /api/upload/merge { fileId, fileName, totalChunks }
// 用 S3 completeMultipartUpload 服务端合并,无需后端读写字节;清理会话。
router.post('/merge', authenticateToken, async (req, res) => {
  try {
    const { fileId, totalChunks } = req.body as { fileId?: string; totalChunks?: number | string };
    if (!fileId) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    const session = await prisma.uploadSession.findUnique({ where: { fileId } });
    if (!session) {
      return res.status(404).json({ success: false, message: '分片会话不存在(请重新上传)' });
    }

    const parts = await listUploadedParts(session.objectKey, session.uploadId);
    const expected = Number(totalChunks);
    if (expected && parts.length !== expected) {
      return res.status(400).json({
        success: false,
        message: `分片不完整:已上传 ${parts.length}/${expected}`,
      });
    }

    await completeMultipartUpload(session.objectKey, session.uploadId, parts);
    await prisma.uploadSession.delete({ where: { fileId } });

    res.json({
      success: true,
      data: { url: publicUrl(session.objectKey), fileName: session.fileName, message: '文件合并成功' },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

// ==================== 6. 流式上传 ====================
// POST /api/upload/stream?fileName= —— 边收边传,不在内存聚合整文件(前端未用,低优先级)
router.post('/stream', authenticateToken, async (req, res) => {
  try {
    const fileName = req.query.fileName as string | undefined;
    if (!fileName) {
      return res.status(400).json({ success: false, message: '缺少文件名' });
    }
    const key = buildObjectKey(fileName);
    await putObjectStream(key, req, req.headers['content-type']);
    const meta = await headObject(key);
    res.json({
      success: true,
      data: { url: publicUrl(key), fileName, size: meta?.size ?? 0, message: '流式上传成功' },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

// ==================== 7. 压缩上传(图片) ====================
// POST /api/upload/compress  body: file, quality —— buffer→buffer 压缩为 JPEG 后直传
router.post('/compress', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '没有上传文件' });
    }
    const quality = parseInt((req.body as { quality?: string }).quality ?? '80', 10);
    const compressed = await compressImageBuffer(req.file.buffer, quality);

    const { url, md5, size } = await persistBuffer(compressed, 'image.jpg', 'image/jpeg');
    const originalSize = req.file.size;

    res.json({
      success: true,
      data: {
        url,
        originalName: req.file.originalname,
        size,
        originalSize,
        compressionRatio: (((originalSize - size) / originalSize) * 100).toFixed(2) + '%',
        md5,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

// ==================== 8. 断点续传 - 查询已上传分片 ====================
// GET /api/upload/resume/:fileId → { uploadedChunks: number[] }(0-based,前端跳过已传)
router.get('/resume/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const session = await prisma.uploadSession.findUnique({ where: { fileId } });
    if (!session) {
      return res.json({ success: true, data: { uploadedChunks: [] } });
    }
    const parts = await listUploadedParts(session.objectKey, session.uploadId);
    const uploadedChunks = parts.map((p) => p.partNumber - 1).sort((a, b) => a - b);
    res.json({ success: true, data: { uploadedChunks } });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
});

export default router;
