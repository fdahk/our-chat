import multer from 'multer';

// 文件进内存 buffer(不落盘),由业务层交给 StorageService 上传到对象存储。
// 头像等小文件场景,限制单文件体积避免内存被打满。
export const multerInstance = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});
