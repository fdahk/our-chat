// 文件上传处理工具模块
// 作用：提供文件上传的后端核心功能，包括文件存储、分片处理、压缩、MD5校验等
// 在整个文件上传模块中的意义：
// - 作为后端文件处理的核心工具库，提供所有上传相关的底层功能
// - 处理文件存储、分片合并、压缩、校验等复杂逻辑
// - 为路由层提供可靠的文件处理能力

// 必要的Node.js模块
import multer from 'multer';                    // 处理multipart/form-data文件上传
import path from 'path';                        // 路径处理工具
import fs from 'fs';                           // 文件系统操作
import crypto from 'crypto';                   // 加密模块，用于计算MD5
import { promisify } from 'util';              // 将回调函数转换为Promise
import sharp from 'sharp';                     // 图片处理库，用于图片压缩
import archiver from 'archiver';               // 文件压缩库，用于创建zip文件

// 将fs的同步方法转换为Promise形式，便于使用async/await
const writeFileAsync = promisify(fs.writeFile);
const readFileAsync = promisify(fs.readFile);

// ==================== 存储路径配置 ====================

// 配置各种存储路径（相对于server目录的绝对路径）
const uploadDir = path.resolve('../uploads');        // 主文件存储目录
const chunksDir = path.resolve('../uploads/chunks'); // 分片文件临时存储目录
const tempDir = path.resolve('../uploads/temp');     // 临时文件存储目录

// 确保所有必要的目录都存在，如果不存在则创建
[uploadDir, chunksDir, tempDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });  // recursive: true 表示递归创建父目录
    }
});

// ==================== MD5计算工具 ====================


// 计算文件buffer的MD5值
// @param {Buffer} buffer - 文件内容buffer
// @returns {string} MD5哈希值
export const calculateFileMD5 = (buffer) => {
    return crypto.createHash('md5').update(buffer).digest('hex');
};

// 计算文件流的MD5值（适用于大文件）
// @param {string} filePath - 文件路径
// @returns {Promise<string>} MD5哈希值的Promise
export const calculateStreamMD5 = (filePath) => {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('md5');           // 创建MD5哈希对象
        const stream = fs.createReadStream(filePath);   // 创建文件读取流
        
        // 监听数据事件，将文件内容更新到哈希对象
        stream.on('data', (data) => hash.update(data));
        // 监听结束事件，获取最终的MD5值
        stream.on('end', () => resolve(hash.digest('hex')));
        // 监听错误事件，处理读取错误
        stream.on('error', reject);
    });
};

// ==================== 文件压缩工具 ====================

// 压缩图片文件
// @param {string} inputPath - 输入图片路径
// @param {string} outputPath - 输出图片路径
// @param {number} quality - 压缩质量（1-100）
export const compressImage = async (inputPath, outputPath, quality = 80) => {
    await sharp(inputPath)                    // 读取输入图片
        .jpeg({ quality })                    // 转换为JPEG格式，设置质量
        .png({ compressionLevel: 9 })         // 转换为PNG格式，设置最高压缩级别
        .toFile(outputPath);                  // 保存到输出路径
};

// 将多个文件压缩为zip格式
// @param {Array} files - 文件列表（可以是文件路径字符串或文件对象）
// @param {string} outputPath - 输出zip文件路径
// @returns {Promise<number>} 压缩后文件大小的Promise
export const compressToZip = (files, outputPath) => {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outputPath);     // 创建输出流
        const archive = archiver('zip', { zlib: { level: 9 } }); // 创建zip压缩器，最高压缩级别

        // 监听压缩完成事件
        output.on('close', () => resolve(archive.pointer()));
        // 监听压缩错误事件
        archive.on('error', reject);

        // 将压缩器管道连接到输出流
        archive.pipe(output);
        
        // 遍历文件列表，将每个文件添加到压缩包中
        files.forEach(file => {
            if (typeof file === 'string') {
                // 如果是字符串，直接添加文件路径
                archive.file(file, { name: path.basename(file) });
            } else {
                // 如果是对象，使用对象的path和name属性
                archive.file(file.path, { name: file.name });
            }
        });
        
        // 完成压缩
        archive.finalize();
    });
};

// ==================== Multer配置 ====================

// 文件存储配置
// 定义文件如何存储到磁盘
const storage = multer.diskStorage({
    // 定义文件存储目录
    destination: (req, file, cb) => {
        // const uploadType = req.body.uploadType || 'default';  // 获取上传类型
        // 这里只能调用query，前端参数此时只有URL参数被解析
        const uploadType = req.query.uploadType || 'default';  // 获取上传类型,只有分片上传时，uploadType 为 chunk，其他都是undefined
        // 如果是分片上传，存储到chunks目录，否则存储到主目录
        const targetDir = uploadType === 'chunk' ? chunksDir : uploadDir;
        cb(null, targetDir);  // 回调函数，第一个参数是错误，第二个是目标目录
    },
    // 定义文件命名规则
    filename: (req, file, cb) => {
        if (req.query.uploadType === 'chunk') {
            // 分片文件命名格式：fileId-chunkIndex
            // const { fileId, chunkIndex } = req.body;
            const { fileId, chunkIndex } = req.query;
            cb(null, `${fileId}-${chunkIndex}`);
        } else {
            // 普通文件命名格式：原文件名-时间戳.扩展名
            const ext = path.extname(file.originalname);      // 获取文件扩展名
            const basename = path.basename(file.originalname, ext); // 获取文件名（不含扩展名）
            const uniqueName = `${basename}-${Date.now()}${ext}`;   // 生成唯一文件名
            cb(null, uniqueName);
        }
    }
});

// 文件类型过滤器
// 验证上传的文件类型是否允许
const fileFilter = (req, file, cb) => {
    const allowedTypes = req.body.allowedTypes;  // 从请求体中获取允许的文件类型
    if (allowedTypes) {
        const types = allowedTypes.split(',');   // 将类型字符串分割为数组
        // 检查文件MIME类型是否在允许列表中
        const isAllowed = types.some(type => file.mimetype.includes(type));
        if (!isAllowed) {
            // 如果类型不允许，返回错误
            return cb(new Error(`文件类型不允许: ${file.mimetype}`), false);
        }
    }
    cb(null, true);  // 类型检查通过
};

// 导出配置好的multer实例
// 用于处理文件上传请求
export const upload = multer({
    storage,                    // 使用自定义存储配置
    fileFilter,                 // 使用自定义文件过滤器
    limits: {
        fileSize: 100 * 1024 * 1024,  // 单个文件最大100MB
        files: 10                      // 最多同时上传10个文件
    }
});

// ==================== 分片处理工具 ====================

// 合并文件分片
// @param {string} fileId - 文件唯一标识
// @param {string} fileName - 最终文件名
// @param {number} totalChunks - 总分片数
// @returns {Promise<string>} 合并后文件路径的Promise
export const mergeChunks = async (fileId, fileName, totalChunks) => {
    const outputPath = path.join(uploadDir, fileName);  // 输出文件路径
    const writeStream = fs.createWriteStream(outputPath); // 创建写入流

    // 按顺序合并所有分片
    for (let i = 0; i < totalChunks; i++) {
        const chunkPath = path.join(chunksDir, `${fileId}-${i}`); // 分片文件路径
        
        // 检查分片文件是否存在
        if (!fs.existsSync(chunkPath)) {
            throw new Error(`分片 ${i} 不存在`);
        }
        
        // 读取分片文件内容
        const chunkBuffer = await readFileAsync(chunkPath);
        // 将分片内容写入输出文件
        writeStream.write(chunkBuffer);
        
        // 删除已合并的分片文件，释放存储空间
        fs.unlinkSync(chunkPath);
    }
    
    // 结束写入流
    writeStream.end();
    return outputPath;
};

// ==================== 秒传功能工具 ====================

// 检查文件是否已存在（用于秒传功能）
// @param {string} fileMD5 - 文件的MD5值
// @returns {Promise<Object>} 检查结果的Promise
export const checkFileExists = async (fileMD5) => {
    const files = fs.readdirSync(uploadDir);  // 读取上传目录中的所有文件
    
    // 遍历所有文件，计算MD5并与目标文件比较
    for (const file of files) {
        const filePath = path.join(uploadDir, file);
        
        // 只处理文件，跳过目录
        if (fs.statSync(filePath).isFile()) {
            const existingMD5 = await calculateStreamMD5(filePath);  // 计算现有文件的MD5
            
            // 如果MD5相同，说明文件已存在
            if (existingMD5 === fileMD5) {
                return {
                    exists: true,                           // 文件存在
                    url: `/user/uploads/${file}`,           // 文件访问URL
                    path: filePath                          // 文件物理路径
                };
            }
        }
    }
    
    // 文件不存在
    return { exists: false };
};