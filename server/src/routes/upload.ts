import express from 'express';
import { multerInstance } from '../utils/multer.js';
import { authenticateToken } from '../middleware/auth.js';
import { buildObjectKey, putObject, publicUrl } from '../storage/storage.js';

const router = express.Router();

export default router;

// 上传图片接口(头像等):内存 buffer → 对象存储 → 返回公开访问 URL
router.post('/uploadImg', authenticateToken, multerInstance.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: '没有上传文件',
    });
  }
  try {
    const key = buildObjectKey(req.file.originalname);
    await putObject(key, req.file.buffer, req.file.mimetype);
    res.json({
      success: true,
      data: { url: publicUrl(key) },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: (error as Error).message,
    });
  }
});
