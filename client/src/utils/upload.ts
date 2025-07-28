// 文件上传工具函数与类型定义

// crypto-js 是一个纯 JavaScript 实现的加密库
// 支持多种加密算法：哈希加密：MD5、SHA1、SHA256  对称加密： AES、DES 等
// 可以在浏览器和 Node.js 环境中使用
import CryptoJS from 'crypto-js';

// 单个文件的结构
export interface FileItem {
  id: string;                // 文件唯一ID（前端生成）
  file: File;                // 原生File对象
  name: string;              // 文件名
  size: number;              // 文件大小（字节）
  type: string;              // MIME类型
  status: 'waiting' | 'uploading' | 'success' | 'error' | 'paused'; // 当前状态
  progress: number;          // 上传进度（0-100）
  url?: string;              // 上传成功后返回的文件URL
  md5?: string;              // 文件MD5（用于秒传）
  error?: string;            // 错误信息
}

// 上传配置项类型
export interface UploadConfig {
  chunkSize: number;         // 分片大小，单位字节，默认5MB
  concurrent: number;        // 并发上传分片数
  maxRetries: number;        // 最大重试次数
  allowedTypes?: string[];   // 允许的文件类型
  maxSize?: number;          // 最大文件大小（字节）
  compress?: boolean;        // 是否对图片进行压缩
  quality?: number;          // 压缩质量（0-100）
}


// 默认上传配置
export const defaultConfig: UploadConfig = {
  chunkSize: 5 * 1024 * 1024, // 5MB，适合大多数场景
  concurrent: 3,              // 默认3个分片并发上传
  maxRetries: 3,              // 默认每个分片最多重试3次
  maxSize: 100 * 1024 * 1024, // 100MB最大文件
  compress: false,            // 默认不压缩
  quality: 80                 // 默认压缩质量80
};

// 计算文件的MD5值（用于秒传）
// 返回一个 Promise，最终值是字符串（MD5 值）
export const calculateFileMD5 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); // 创建文件读取器，FileReader：浏览器内置的 API，可以读取文件格式：文本、二进制、DataURL 等
    // onload：文件读取完成时触发的事件，e：事件对象，包含读取结果
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer; // 读取为ArrayBuffer
      const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer); // 转为CryptoJS格式
      const md5 = CryptoJS.MD5(wordArray).toString(); // 计算MD5，toString()：将结果转换为十六进制字符串
      resolve(md5);
    };
    reader.onerror = reject; //onerror：文件读取失败时触发的事件，直接调用 reject 函数
    reader.readAsArrayBuffer(file); // 以二进制方式开始读取，注：这行代码实际上是最早执行的，上面的代码都是在读取完后自动触发的
  });
};

// 将文件分片，返回Blob数组
export const createChunks = (file: File, chunkSize: number) => {
  // 为什么采用二进制格式：二进制格式是处理文件的唯一正确方式
  // MD5 计算需要原始二进制数据，
  // 分片上传需要精确的字节级操作，二进制分片可以实现
  // HTTP 协议本身就是基于二进制的，文件上传时，浏览器会将文件转换为二进制流
  // 性能优势：二进制处理很高效、 二进制分片只引用原始数据，不复制、而文本处理需要解码和编码
  //通用性：可以处理任何类型的文件，本质都是二进制文件
  const chunks: Blob[] = []; // Blob: Binary Large Object
  let start = 0;
  // 循环切分文件
  while (start < file.size) {
    const end = Math.min(start + chunkSize, file.size); // 计算分片结束位置
    chunks.push(file.slice(start, end)); // 截取分片
    start = end;
  }
  return chunks; // 返回所有分片
};

// 生成文件唯一ID（用于分片上传和断点续传）
export const generateFileId = (file: File) => {
  // 由文件名、大小、最后修改时间拼接，保证唯一性
  return `${file.name}_${file.size}_${file.lastModified}`;
};

// 文件大小格式化（字节转为可读字符串）
export const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 校验文件是否合法（类型、大小等）
export const validateFile = (file: File, config: UploadConfig) => {
  const errors: string[] = [];
  // 校验文件大小
  if (config.maxSize && file.size > config.maxSize) {
    errors.push(`文件大小超过限制 ${formatFileSize(config.maxSize)}`);
  }

  // 校验文件类型
  if (config.allowedTypes && config.allowedTypes.length > 0) {
    const isAllowed = config.allowedTypes.some(type => 
      file.type.includes(type) || file.name.toLowerCase().endsWith(`.${type}`)
    );
    if (!isAllowed) {
      errors.push(`不支持的文件类型: ${file.type}`);
    }
  }

  return errors; // 返回所有校验错误
};

// JS原生fetch HTTP请求
// export const request = async (url: string, options: RequestInit = {}) => {
//     // fetch 是原生 JS 提供的网络请求 API,支持跨域（需要后端允许）比 XMLHttpRequest 更现代、语法更简洁
//     // fetch(url, options)
//     // options：可选参数对象（如 method、headers、body 等）
//     // 常见返回值处理:
//     // response.json()：解析返回的 JSON 数据
//     // response.text()：解析返回的文本数据
//     // response.blob()：解析返回的二进制数据（如图片、文件）
//   const response = await fetch(`http://127.0.0.1:3007/api${url}`, {
//     ...options,
//     headers: {
//       ...options.headers,
//     }
//   });

//   // 错误处理
//   if (!response.ok) {
//     throw new Error(`HTTP error! status: ${response.status}`);
//   }

//   // 返回JSON结果
//   return response.json();
// };


// 使用封装了的 axios http请求，
import { post, get } from './http';
export const request = async (url: string, options: RequestInit = {}) => {
    url = 'api' + url; // 添加前缀
    const method = options.method || 'GET';
    // post 
    if (method === 'POST') {
      let data;
      const headers = options.headers as Record<string, string>;
      
      if (options.body instanceof FormData) {
        // 文件上传：FormData 对象
        data = options.body;
      } else if (options.body && headers?.['Content-Type']?.includes('application/json')) {
        // 其他数据：JSON 数据
        data = JSON.parse(options.body as string);
      } else {
        // 不处理
        data = options.body;
      }
      
      return await post(url, data);
    } else {
      // GET 请求
      return await get(url);
    }
};