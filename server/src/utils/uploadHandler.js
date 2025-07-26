import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { promisify } from 'util';
import sharp from 'sharp'; // 用于图片压缩
import archiver from 'archiver'; // 用于文件压缩

const writeFileAsync = promisify(fs.writeFile);
const readFileAsync = promisify(fs.readFile);

// 配置存储路径
const uploadDir = path.resolve('../uploads');
const chunksDir = path.resolve('../uploads/chunks');
const tempDir = path.resolve('../uploads/temp');

// 确保目录存在
[uploadDir, chunksDir, tempDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// 计算文件MD5
export const calculateFileMD5 = (buffer) => {
    return crypto.createHash('md5').update(buffer).digest('hex');
};

// 计算文件流MD5
export const calculateStreamMD5 = (filePath) => {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('md5');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
};

// 压缩图片
export const compressImage = async (inputPath, outputPath, quality = 80) => {
    await sharp(inputPath)
        .jpeg({ quality })
        .png({ compressionLevel: 9 })
        .toFile(outputPath);
};

// 压缩文件到zip
export const compressToZip = (files, outputPath) => {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve(archive.pointer()));
        archive.on('error', reject);

        archive.pipe(output);
        
        files.forEach(file => {
            if (typeof file === 'string') {
                archive.file(file, { name: path.basename(file) });
            } else {
                archive.file(file.path, { name: file.name });
            }
        });
        
        archive.finalize();
    });
};

// Multer配置
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadType = req.body.uploadType || 'default';
        const targetDir = uploadType === 'chunk' ? chunksDir : uploadDir;
        cb(null, targetDir);
    },
    filename: (req, file, cb) => {
        if (req.body.uploadType === 'chunk') {
            // 分片文件命名: fileId-chunkIndex
            const { fileId, chunkIndex } = req.body;
            cb(null, `${fileId}-${chunkIndex}`);
        } else {
            const ext = path.extname(file.originalname);
            const basename = path.basename(file.originalname, ext);
            const uniqueName = `${basename}-${Date.now()}${ext}`;
            cb(null, uniqueName);
        }
    }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
    const allowedTypes = req.body.allowedTypes;
    if (allowedTypes) {
        const types = allowedTypes.split(',');
        const isAllowed = types.some(type => file.mimetype.includes(type));
        if (!isAllowed) {
            return cb(new Error(`文件类型不允许: ${file.mimetype}`), false);
        }
    }
    cb(null, true);
};

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
        files: 10 // 最多10个文件
    }
});

// 合并分片
export const mergeChunks = async (fileId, fileName, totalChunks) => {
    const outputPath = path.join(uploadDir, fileName);
    const writeStream = fs.createWriteStream(outputPath);

    for (let i = 0; i < totalChunks; i++) {
        const chunkPath = path.join(chunksDir, `${fileId}-${i}`);
        if (!fs.existsSync(chunkPath)) {
            throw new Error(`分片 ${i} 不存在`);
        }
        
        const chunkBuffer = await readFileAsync(chunkPath);
        writeStream.write(chunkBuffer);
        
        // 删除分片文件
        fs.unlinkSync(chunkPath);
    }
    
    writeStream.end();
    return outputPath;
};

// 检查文件是否已存在（秒传功能）
export const checkFileExists = async (fileMD5) => {
    const files = fs.readdirSync(uploadDir);
    for (const file of files) {
        const filePath = path.join(uploadDir, file);
        if (fs.statSync(filePath).isFile()) {
            const existingMD5 = await calculateStreamMD5(filePath);
            if (existingMD5 === fileMD5) {
                return {
                    exists: true,
                    url: `/user/uploads/${file}`,
                    path: filePath
                };
            }
        }
    }
    return { exists: false };
};