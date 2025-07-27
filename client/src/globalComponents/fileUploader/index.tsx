// 文件上传组件
// 功能：
// 1. 单文件/多文件上传
// 2. 大文件分片上传，突破浏览器和服务器对单次请求大小的限制
// 3. 文件秒传（MD5校验）
// 4. 断点续传
// 5. 实时进度显示
// 6. 文件压缩上传
// 7. 错误处理和重试机制
import React, { useState, useCallback } from 'react';
// antD UI组件库：文件上传 按钮 进度条 全局提示 列表 卡片容器 标签 间距
import { Upload, Button, Progress, message, List, Card, Tag, Space } from 'antd';
// antD图标库
import { 
  UploadOutlined,  // 上传
  DeleteOutlined,  // 删除
  FileOutlined     // 文件
} from '@ant-design/icons';
// 工具函数和类型定义
import { 
  type FileItem,        // 文件项类型定义
  type UploadConfig,    // 上传配置类型定义
  defaultConfig,        // 默认配置
  calculateFileMD5,     // 计算文件MD5
  createChunks,         // 创建文件分片
  generateFileId,       // 生成文件唯一ID
  validateFile,         // 验证文件
  formatFileSize,       // 格式化文件大小
  request               // HTTP请求工具
} from '../../utils/upload';

import './style.module.scss';

// props参数
interface FileUploaderProps {
  config?: Partial<UploadConfig>;           // 可选的配置参数（部分配置）
  multiple?: boolean;                       // 是否允许多文件选择
  onSuccess?: (files: FileItem[]) => void;  // 上传成功回调函数
  onError?: (error: string) => void;        // 上传失败回调函数
}

const FileUploader: React.FC<FileUploaderProps> = ({
  config = {},        // 默认空配置对象
  multiple = true,    // 默认允许多文件选择
  onSuccess,          // 成功回调
  onError             // 错误回调
}) => {
  // ==================== 状态管理 ====================
  
  // 文件列表状态
  // 存储所有待上传、上传中、已完成的文件信息
  const [files, setFiles] = useState<FileItem[]>([]);
  
  // 上传状态
  // 控制整体上传流程的状态，用于显示loading状态
  const [uploading, setUploading] = useState(false);
  
  // 合并配置
  // 将用户传入的配置与默认配置合并，用户配置优先级更高
  const uploadConfig = { ...defaultConfig, ...config };

  // ==================== 核心功能 ====================

  // 文件选择处理
  // 作用：处理用户选择的文件，进行初步验证和状态初始化
  // 意义：确保只有符合要求的文件进入上传队列，避免无效文件进入上传流程
  // @param selectedFiles - 用户选择的文件列表
  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    // 如果没有选择文件，直接返回
    if (!selectedFiles) return;

    const newFiles: FileItem[] = []; // 新文件数组
    
    // 遍历所有选择的文件，逐个处理
    Array.from(selectedFiles).forEach(file => {
      // 验证文件是否符合配置要求（大小、类型等）
      const errors = validateFile(file, uploadConfig);
      
      // 如果有验证错误，显示错误信息并跳过该文件
      if (errors.length > 0) {
        message.error(errors.join(', '));
        return; // 跳过这个文件
      }

      // 创建文件项对象，包含文件的完整信息
      const fileItem: FileItem = {
        id: generateFileId(file),    // 生成唯一标识符
        file,                        // 原始文件对象
        name: file.name,             // 文件名
        size: file.size,             // 文件大小
        type: file.type,             // 文件类型
        status: 'waiting',           // 初始状态：等待上传
        progress: 0                  // 初始进度：0%
      };

      newFiles.push(fileItem); // 添加到新文件数组
    });

    // 更新文件列表状态
    // 如果允许多选，则追加到现有列表；否则替换整个列表
    setFiles(prev => multiple ? [...prev, ...newFiles] : newFiles);
  }, [uploadConfig, multiple]); // 依赖项：配置变化或多选设置变化时重新创建函数

  // 检查文件是否已存在（秒传功能）
  // 通过计算文件MD5并与服务器已有文件对比，实现秒传
  // @param file - 要检查的文件项
  // @returns 检查结果，包含是否存在、URL、MD5等信息
  const checkFileExists = async (file: FileItem) => {
    try {
      // 计算文件的MD5值
      const md5 = await calculateFileMD5(file.file);
      
      // 发送检查请求到服务器
      const response = await request('/upload/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileMD5: md5,        // 文件MD5
          fileName: file.name,  // 文件名
          fileSize: file.size   // 文件大小
        })
      });

      // 如果文件已存在，返回秒传信息
      if (response.success && response.data.exists) {
        return {
          exists: true,           // 文件存在
          url: response.data.url, // 文件访问URL
          md5                    // 文件MD5
        };
      }

      // 文件不存在，需要正常上传
      return { exists: false, md5 };
    } catch (error) {
      console.error('检查文件失败:', error);
      return { exists: false, md5: '' };
    }
  };

  // 单文件上传函数
  // 处理小文件的直接上传，支持进度跟踪和错误处理
  // @param fileItem - 要上传的文件项
  const uploadSingleFile = async (fileItem: FileItem) => {
    try {
      // 更新文件状态为上传中
      setFiles(prev => prev.map(f => 
        f.id === fileItem.id 
          ? { ...f, status: 'uploading', progress: 0 }
          : f
      ));

      // 检查是否可以秒传
      const checkResult = await checkFileExists(fileItem);
      if (checkResult.exists) {
        // 秒传成功，直接更新状态为完成
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id 
            ? { ...f, status: 'success', progress: 100, url: checkResult.url, md5: checkResult.md5 }
            : f
        ));
        message.success(`${fileItem.name} 秒传成功！`);
        return; // 秒传成功，无需继续上传
      }

      // 创建FormData对象，用于文件上传
      const formData = new FormData();
      formData.append('file', fileItem.file);
      
      // 如果是图片且需要压缩，添加压缩质量参数
      if (uploadConfig.compress && fileItem.type.startsWith('image/')) {
        formData.append('quality', uploadConfig.quality?.toString() || '80');
      }

      // 使用XMLHttpRequest来支持进度监听
      const xhr = new XMLHttpRequest();
      
      // 监听上传进度事件
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          // 计算上传进度百分比
          const progress = Math.round((e.loaded / e.total) * 100);
          // 更新文件进度状态
          setFiles(prev => prev.map(f => 
            f.id === fileItem.id 
              ? { ...f, progress }
              : f
          ));
        }
      };

      // 监听上传完成事件
      xhr.onload = () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          if (response.success) {
            // 上传成功，更新文件状态
            setFiles(prev => prev.map(f => 
              f.id === fileItem.id 
                ? { 
                    ...f, 
                    status: 'success', 
                    progress: 100,
                    url: response.data.url,    // 文件访问URL
                    md5: response.data.md5     // 文件MD5
                  }
                : f
            ));
            message.success(`${fileItem.name} 上传成功！`);
          } else {
            // 服务器返回错误
            throw new Error(response.message);
          }
        } else {
          // HTTP状态码错误
          throw new Error(`HTTP ${xhr.status}`);
        }
      };

      // 监听上传错误事件
      xhr.onerror = () => {
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id 
            ? { ...f, status: 'error', error: '上传失败' }
            : f
        ));
      };

      // 确定上传端点
      // 如果是图片且需要压缩，使用压缩上传接口
      const endpoint = uploadConfig.compress && fileItem.type.startsWith('image/')
        ? 'http://localhost:3007/api/upload/compress'
        : 'http://localhost:3007/api/upload/single';

      // 发送上传请求
      xhr.open('POST', endpoint);
      xhr.send(formData);

    } catch (error) {
      // 处理上传过程中的错误
      const errorMsg = error instanceof Error ? error.message : '上传失败';
      setFiles(prev => prev.map(f => 
        f.id === fileItem.id 
          ? { ...f, status: 'error', error: errorMsg }
          : f
      ));
      message.error(`${fileItem.name} ${errorMsg}`);
    }
  };

  // 分片上传函数（用于大文件）
  // 将大文件分割成小块，逐个上传，支持断点续传
  // @param fileItem - 要上传的文件项
  const uploadFileWithChunks = async (fileItem: FileItem) => {
    try {
      // 更新文件状态为上传中
      setFiles(prev => prev.map(f => 
        f.id === fileItem.id 
          ? { ...f, status: 'uploading', progress: 0 }
          : f
      ));

      // 检查是否可以秒传
      const checkResult = await checkFileExists(fileItem);
      if (checkResult.exists) {
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id 
            ? { ...f, status: 'success', progress: 100, url: checkResult.url, md5: checkResult.md5 }
            : f
        ));
        message.success(`${fileItem.name} 秒传成功！`);
        return;
      }

      // 创建文件分片
      const chunks = createChunks(fileItem.file, uploadConfig.chunkSize);
      const fileId = fileItem.id;
      const fileName = `${Date.now()}-${fileItem.name}`; // 生成唯一文件名

      // 检查断点续传 - 获取已上传的分片信息
      const resumeResponse = await request(`/upload/resume/${fileId}`);
      const uploadedChunks = resumeResponse.success ? resumeResponse.data.uploadedChunks : [];

      let uploadedCount = uploadedChunks.length; // 已上传分片数量

      // 逐个上传分片
      for (let i = 0; i < chunks.length; i++) {
        // 跳过已上传的分片（断点续传）
        if (uploadedChunks.includes(i)) {
          continue;
        }

        // 创建分片上传的FormData
        // 注：由于后端解析顺序的问题，上传类型参数放在查询参数处，其他参数正常放在请求体中
        const formData = new FormData();
        formData.append('chunk', chunks[i]);                    // 分片数据
        // formData.append('fileId', fileId);                      // 文件ID
        // formData.append('chunkIndex', i.toString());            // 分片索引
        formData.append('totalChunks', chunks.length.toString()); // 总分片数
        formData.append('fileName', fileName);                  // 文件名
        // formData.append('uploadType', 'chunk');                 // 上传类型标识

        // 上传分片
        await request(`/upload/chunk?uploadType=chunk&fileId=${fileId}&chunkIndex=${i}`, {
          method: 'POST',
          body: formData
        });

        uploadedCount++;
        // 计算整体进度
        const progress = Math.round((uploadedCount / chunks.length) * 100);
        
        // 更新文件进度
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id 
            ? { ...f, progress }
            : f
        ));
      }

      // 所有分片上传完成后，请求服务器合并分片
      const mergeResponse = await request('/upload/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,                    // 文件ID
          fileName,                  // 文件名
          totalChunks: chunks.length // 总分片数
        })
      });

      if (mergeResponse.success) {
        // 合并成功，更新文件状态
        setFiles(prev => prev.map(f => 
          f.id === fileItem.id 
            ? { 
                ...f, 
                status: 'success', 
                progress: 100,
                url: mergeResponse.data.url,
                md5: mergeResponse.data.md5
              }
            : f
        ));
        message.success(`${fileItem.name} 上传成功！`);
      }

    } catch (error) {
      // 处理分片上传过程中的错误
      const errorMsg = error instanceof Error ? error.message : '上传失败';
      setFiles(prev => prev.map(f => 
        f.id === fileItem.id 
          ? { ...f, status: 'error', error: errorMsg }
          : f
      ));
      message.error(`${fileItem.name} ${errorMsg}`);
    }
  };

  // 开始上传函数
  // 批量处理所有等待上传的文件，根据文件大小选择上传方式
  const startUpload = async () => {
    // 获取所有等待上传的文件
    const waitingFiles = files.filter(f => f.status === 'waiting');
    if (waitingFiles.length === 0) {
      message.warning('没有待上传的文件');
      return;
    }

    setUploading(true); // 设置整体上传状态

    try {
      // 根据文件大小选择上传方式
      const uploadPromises = waitingFiles.map(file => {
        if (file.size > uploadConfig.chunkSize) {
          // 大文件使用分片上传
          return uploadFileWithChunks(file);
        } else {
          // 小文件使用单文件上传
          return uploadSingleFile(file);
        }
      });

      // 并行上传所有文件
      await Promise.all(uploadPromises);
      
      // 获取上传成功的文件
      const successFiles = files.filter(f => f.status === 'success');
      onSuccess?.(successFiles); // 调用成功回调函数
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '批量上传失败';
      onError?.(errorMsg); // 调用错误回调函数
    } finally {
      setUploading(false); // 重置上传状态
    }
  };

  // 删除文件函数
  // 从文件列表中移除指定文件
  // @param fileId - 要删除的文件ID
  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // 重试上传函数
  // 重新上传失败的文件
  // @param fileItem - 要重试的文件项
  const retryUpload = (fileItem: FileItem) => {
    if (fileItem.size > uploadConfig.chunkSize) {
      // 大文件使用分片上传重试
      uploadFileWithChunks(fileItem);
    } else {
      // 小文件使用单文件上传重试
      uploadSingleFile(fileItem);
    }
  };

  // ==================== 组件渲染 ====================

  return (
    <div className="file-uploader">
      <Card title="文件上传" size="small">
        <Space direction="vertical" style={{ width: '100%' }}>
          {/* 拖拽上传区域 */}
          <Upload.Dragger
            multiple={multiple}           // 是否允许多文件选择
            showUploadList={false}        // 不显示默认的上传列表
            beforeUpload={() => false}    // 阻止默认上传行为，由我们自己控制
            onChange={(info) => {
              // 处理文件选择变化事件
              if (info.fileList.length > 0) {
                // 提取原始文件对象
                const files = info.fileList.map(item => item.originFileObj!).filter(Boolean);
                // 转换为FileList格式并处理
                handleFileSelect(files as unknown as FileList);
              }
            }}
          >
            {/* 上传区域的内容 */}
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
            <p className="ant-upload-hint">
              支持单个或批量上传，大文件自动分片上传
            </p>
          </Upload.Dragger>

          {/* 控制按钮区域 */}
          <Space>
            <Button 
              type="primary" 
              onClick={startUpload}
              loading={uploading}
              disabled={files.length === 0}
            >
              开始上传
            </Button>
            <Button onClick={() => setFiles([])}>清空列表</Button>
          </Space>

          {/* 文件列表显示区域 */}
          {files.length > 0 && (
            <List
              size="small"
              dataSource={files}
              renderItem={(file) => (
                <List.Item
                  actions={[
                    // 删除按钮
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => removeFile(file.id)}
                    />,
                    // 重试按钮（仅在错误状态显示）
                    file.status === 'error' && (
                      <Button
                        type="text"
                        size="small"
                        onClick={() => retryUpload(file)}
                      >
                        重试
                      </Button>
                    )
                  ].filter(Boolean)} // 过滤掉false值，只显示有效的按钮
                >
                  {/* 文件信息显示 */}
                  <List.Item.Meta
                    avatar={<FileOutlined />}
                    title={
                      <Space>
                        <span>{file.name}</span>
                        {/* 状态标签 */}
                        <Tag color={
                          file.status === 'success' ? 'green' :
                          file.status === 'error' ? 'red' :
                          file.status === 'uploading' ? 'blue' : 'default'
                        }>
                          {file.status === 'waiting' && '等待上传'}
                          {file.status === 'uploading' && '上传中'}
                          {file.status === 'success' && '已完成'}
                          {file.status === 'error' && '上传失败'}
                        </Tag>
                      </Space>
                    }
                    description={
                      <Space direction="vertical" style={{ width: '100%' }}>
                        {/* 文件大小 */}
                        <span>{formatFileSize(file.size)}</span>
                        {/* 进度条（仅在上传中显示） */}
                        {file.status === 'uploading' && (
                          <Progress percent={file.progress} size="small" />
                        )}
                        {/* 错误信息（仅在错误状态显示） */}
                        {file.status === 'error' && (
                          <span style={{ color: 'red' }}>{file.error}</span>
                        )}
                        {/* 文件链接（仅在成功状态显示） */}
                        {file.status === 'success' && file.url && (
                          <a href={file.url} target="_blank" rel="noopener noreferrer">
                            查看文件
                          </a>
                        )}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Space>
      </Card>
    </div>
  );
};

export default FileUploader;