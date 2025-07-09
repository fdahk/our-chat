import multer from 'multer'; //专门用于处理 HTTP 请求中的 multipart/form-data 类型数据，主要用于文件上传。
import path from 'path'; //node内置模块，处理文件路径
import fs from 'fs'; //node内置模块，处理文件系统
const uploadDir = path.resolve('../uploads'); //传入相对路径得到 uploads 目录的绝对路径

//如果不存在就递归创建（即使父目录不存在也能自动创建）。
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置 multer 磁盘存储
const storage = multer.diskStorage({
    // 文件存储的目录。
    // 参数说明：
    // req：本次 HTTP 请求对象
    // file：本次上传的文件对象
    // cb：回调函数，格式是 cb(error, destinationPath)
    // 你的写法 cb(null, uploadDir); 表示：
    // 没有错误（null）
    // 文件存到 uploadDir 这个目录下（通常是 'uploads/' 的绝对路径）
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // 用时间戳+原始名防止重名
        const ext = path.extname(file.originalname);
        const basename = path.basename(file.originalname, ext);
        const uniqueName = `${basename}-${Date.now()}${ext}`;
        cb(null, uniqueName);
    }
});

// 用上面的配置创建一个 multer 实例
export const multerInstance = multer({ storage }); 