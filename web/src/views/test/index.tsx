import React from 'react';
import { Card, Row, Col, message } from 'antd';
// 导入自定义的文件上传组件
import FileUploader from '../../globalComponents/fileUploader';
// 导入文件项类型定义
import { type FileItem } from '../../utils/upload';


// 文件上传测试页面组件
// 展示三种不同配置的文件上传场景
const UploadDemo: React.FC = () => {
  
  // 上传成功回调函数
  // @param files 成功上传的文件列表
  const handleSuccess = (files: FileItem[]) => {
    message.success(`成功上传 ${files.length} 个文件`);
    console.log('上传成功的文件:', files);
  };

  // 上传失败回调函数
  // @param error 错误信息
  const handleError = (error: string) => {
    message.error(`上传失败: ${error}`);
  };

  return (
    <div style={{width: "100%", height: "100%",overflow: "auto"}}>
    <div style={{ padding: 24 }}>
        {/* antD的栅格系统进行响应式布局 */}
        {/* gutter属性设置列间距为16px */}
      <Row gutter={[16, 16]}>
          {/* 第一列：图片上传 */}
        <Col span={12}>
            {/* 卡片容器：标题为"图片上传（压缩）" */}
          <Card title="图片上传（压缩）">
              {/* 专门用于图片上传，启用压缩功能 */}
            <FileUploader
              config={{
                  allowedTypes: ['image'],           // 只允许上传图片类型文件
                  maxSize: 10 * 1024 * 1024,         // 最大文件大小：10MB
                  compress: true,                    // 启用图片压缩功能
                  quality: 80                        // 压缩质量：80%（平衡文件大小和图片质量）
              }}
                multiple={true}                      // 支持多文件选择
                onSuccess={handleSuccess}            // 上传成功回调
                onError={handleError}                // 上传失败回调
            />
          </Card>
        </Col>
        
          {/* 第二列：大文件上传*/}
        <Col span={12}>
            {/* 卡片容器：标题为"大文件上传（分片）" */}
          <Card title="大文件上传（分片）">
              {/* 专门用于大文件上传，使用分片技术 */}
            <FileUploader
              config={{
                  chunkSize: 2 * 1024 * 1024,        // 分片大小：2MB（适合大文件分片上传）
                  maxSize: 1024 * 1024 * 1024,       // 最大文件大小：1GB
                  concurrent: 3                      // 并发上传分片数：3个（提高上传速度）
              }}
                multiple={false}                     // 只允许单文件选择（大文件通常单个上传）
                onSuccess={handleSuccess}            // 上传成功回调
                onError={handleError}                // 上传失败回调
            />
          </Card>
        </Col>
        
          {/* 第三行：通用文件上传 */}
        <Col span={24}>
          <Card title="通用文件上传">
              {/* 文件上传组件：通用配置，支持各种类型文件 */}
            <FileUploader
              config={{
                  maxSize: 100 * 1024 * 1024,        // 最大文件大小：100MB
                  chunkSize: 5 * 1024 * 1024         // 分片大小：5MB（默认分片大小）
              }}
                multiple={true}                      // 支持多文件选择
                onSuccess={handleSuccess}            // 上传成功回调
                onError={handleError}                // 上传失败回调
            />
          </Card>
        </Col>
          
      </Row>
    </div>
    </div>
  );
};

// 导出组件，供路由使用
export default UploadDemo;