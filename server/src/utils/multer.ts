import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = path.resolve('../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置 multer 磁盘存储
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    // 用时间戳+原始名防止重名
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    const uniqueName = `${basename}-${Date.now()}${ext}`;
    cb(null, uniqueName);
  },
});

export const multerInstance = multer({ storage });
