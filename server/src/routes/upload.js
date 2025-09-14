import express from 'express';
import { multerInstance } from '../utils/multer.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

export default router;

// 上传图片接口
router.post('/uploadImg', authenticateToken, multerInstance.single('file'), (req, res) => {
    // console.log(req.file); //调试
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: '没有上传文件'
        });
    }
    // 生成访问 URL
    // app.js 里有 app.use('/user/uploads', express.static('uploads'))
    const url = `/user/uploads/${req.file.filename}`;
    res.json({
        success: true,
        data: { url }
    });
});
