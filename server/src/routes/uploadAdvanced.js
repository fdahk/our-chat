// 高级文件上传路由（支持单文件、多文件、大文件分片、断点续传、秒传、压缩等）
// 作用：为前端文件上传组件提供RESTful API，处理所有上传相关的后端逻辑
// 在整个文件上传模块中的意义：
// - 统一管理所有上传相关的后端接口，便于维护和扩展
// - 支持多种上传场景（单文件、多文件、大文件、分片、断点续传、秒传、压缩等）
// - 负责文件的存储、分片合并、MD5校验、压缩处理等核心后端功能

import express from 'express';
import fs from 'fs';
import path from 'path';
import { 
    upload,                // multer实例，处理文件接收和存储
    calculateFileMD5,      // 计算文件MD5（buffer）
    calculateStreamMD5,    // 计算文件MD5（流）
    compressImage,         // 图片压缩
    compressToZip,         // 文件压缩为zip
    mergeChunks,           // 合并分片
    checkFileExists        // 检查文件是否已存在（秒传）
} from '../utils/uploadHandler.js';

const router = express.Router();

// ==================== 1. 单文件上传 ====================
// 接口：POST /api/upload/single
// 功能：接收单个文件，存储到uploads目录，返回文件信息
router.post('/single', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: '没有上传文件'
            });
        }

        const filePath = req.file.path; // 文件实际存储路径
        const url = `/user/uploads/${req.file.filename}`; // 静态资源访问URL
        const fileMD5 = await calculateStreamMD5(filePath); // 计算MD5

        res.json({
            success: true,
            data: {
                url,                        // 文件访问URL
                filename: req.file.filename, // 存储文件名
                originalName: req.file.originalname, // 原始文件名
                size: req.file.size,        // 文件大小
                md5: fileMD5                // 文件MD5
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== 2. 多文件上传 ====================
// 接口：POST /api/upload/multiple
// 功能：批量上传文件，最多10个，返回每个文件的信息
router.post('/multiple', upload.array('files', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: '没有上传文件'
            });
        }

        // 并发处理每个文件，返回详细信息
        const results = await Promise.all(
            req.files.map(async (file) => {
                const url = `/user/uploads/${file.filename}`;
                const fileMD5 = await calculateStreamMD5(file.path);
                return {
                    url,
                    filename: file.filename,
                    originalName: file.originalname,
                    size: file.size,
                    md5: fileMD5
                };
            })
        );

        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== 3. 秒传检查 ====================
// 接口：POST /api/upload/check
// 功能：前端上传前先计算MD5，后端查找是否已存在该文件，实现秒传
router.post('/check', async (req, res) => {
    try {
        const { fileMD5, fileName, fileSize } = req.body;
        
        if (!fileMD5) {
            return res.status(400).json({
                success: false,
                message: '缺少文件MD5'
            });
        }

        const result = await checkFileExists(fileMD5);
        
        if (result.exists) {
            // 文件已存在，直接返回URL，实现秒传
            res.json({
                success: true,
                data: {
                    exists: true,
                    url: result.url,
                    message: '文件已存在，秒传成功'
                }
            });
        } else {
            // 文件不存在，需要正常上传
            res.json({
                success: true,
                data: {
                    exists: false,
                    message: '文件不存在，需要上传'
                }
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== 4. 分片上传 ====================
// 接口：POST /api/upload/chunk
// 功能：接收单个分片，存储到chunks目录，等待合并
router.post('/chunk', upload.single('chunk'), async (req, res) => {
    try {
        const { fileId, chunkIndex, totalChunks, fileName } = req.body;
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: '没有上传分片'
            });
        }

        // 分片上传只负责存储分片，合并由/merge接口完成
        res.json({
            success: true,
            data: {
                fileId,
                chunkIndex: parseInt(chunkIndex),
                message: '分片上传成功'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== 5. 合并分片 ====================
// 接口：POST /api/upload/merge
// 功能：将所有分片合并为完整文件，返回最终文件信息
router.post('/merge', async (req, res) => {
    try {
        const { fileId, fileName, totalChunks } = req.body;
        
        if (!fileId || !fileName || !totalChunks) {
            return res.status(400).json({
                success: false,
                message: '缺少必要参数'
            });
        }

        // 合并所有分片，生成最终文件
        const outputPath = await mergeChunks(fileId, fileName, parseInt(totalChunks));
        const url = `/user/uploads/${fileName}`;
        const fileMD5 = await calculateStreamMD5(outputPath);

        res.json({
            success: true,
            data: {
                url,
                fileName,
                md5: fileMD5,
                message: '文件合并成功'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== 6. 流式上传 ====================
// 接口：POST /api/upload/stream
// 功能：支持流式数据上传，适合特殊场景
router.post('/stream', (req, res) => {
    try {
        const { fileName } = req.query;
        if (!fileName) {
            return res.status(400).json({
                success: false,
                message: '缺少文件名'
            });
        }

        const filePath = path.join('../uploads', fileName);
        const writeStream = fs.createWriteStream(filePath);
        
        req.pipe(writeStream);
        
        writeStream.on('finish', async () => {
            const url = `/user/uploads/${fileName}`;
            const fileMD5 = await calculateStreamMD5(filePath);
            const stats = fs.statSync(filePath);
            
            res.json({
                success: true,
                data: {
                    url,
                    fileName,
                    size: stats.size,
                    md5: fileMD5,
                    message: '流式上传成功'
                }
            });
        });

        writeStream.on('error', (error) => {
            res.status(500).json({
                success: false,
                message: error.message
            });
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== 7. 压缩上传（图片） ====================
// 接口：POST /api/upload/compress
// 功能：图片上传时自动压缩，减少存储和带宽
router.post('/compress', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: '没有上传文件'
            });
        }

        const { quality = 80 } = req.body;
        const ext = path.extname(req.file.originalname);
        const compressedName = `compressed-${req.file.filename}`;
        const compressedPath = path.join('../uploads', compressedName);

        // 压缩图片，生成新文件
        await compressImage(req.file.path, compressedPath, parseInt(quality));
        
        // 删除原文件，节省空间
        fs.unlinkSync(req.file.path);

        const url = `/user/uploads/${compressedName}`;
        const stats = fs.statSync(compressedPath);
        const fileMD5 = await calculateStreamMD5(compressedPath);

        res.json({
            success: true,
            data: {
                url,
                filename: compressedName,
                originalName: req.file.originalname,
                size: stats.size,
                originalSize: req.file.size,
                compressionRatio: ((req.file.size - stats.size) / req.file.size * 100).toFixed(2) + '%',
                md5: fileMD5
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== 8. 断点续传 - 查询已上传分片 ====================
// 接口：GET /api/upload/resume/:fileId
// 功能：前端分片上传前查询已上传分片，实现断点续传
router.get('/resume/:fileId', (req, res) => {
    try {
        const { fileId } = req.params;
        const chunksDir = path.resolve('../uploads/chunks');
        
        if (!fs.existsSync(chunksDir)) {
            return res.json({
                success: true,
                data: { uploadedChunks: [] }
            });
        }

        // 查找所有已上传的分片文件
        const files = fs.readdirSync(chunksDir);
        const uploadedChunks = files
            .filter(file => file.startsWith(`${fileId}-`))
            .map(file => parseInt(file.split('-')[1]))
            .sort((a, b) => a - b);

        res.json({
            success: true,
            data: { uploadedChunks }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

export default router;