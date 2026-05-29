import React from 'react';
import { Card, Row, Col, message } from 'antd';
import FileUploader from '@/globalComponents/fileUploader';
import { type FileItem } from '@/utils/upload';

// 文件上传调试页：展示三种不同配置的 FileUploader（图片压缩 / 大文件分片 / 通用上传），
// 用于开发期手测上传组件。仅在 /debug 下、仅开发构建可达。
const UploadDemo: React.FC = () => {
  const handleSuccess = (files: FileItem[]) => {
    message.success(`成功上传 ${files.length} 个文件`);
  };

  const handleError = (error: string) => {
    message.error(`上传失败: ${error}`);
  };

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto' }}>
      <div style={{ padding: 24 }}>
        <Row gutter={[16, 16]}>
          <Col span={12}>
            <Card title="图片上传（压缩）">
              <FileUploader
                config={{
                  allowedTypes: ['image'],
                  maxSize: 10 * 1024 * 1024,
                  compress: true,
                  quality: 80,
                }}
                multiple={true}
                onSuccess={handleSuccess}
                onError={handleError}
              />
            </Card>
          </Col>

          <Col span={12}>
            <Card title="大文件上传（分片）">
              <FileUploader
                config={{
                  chunkSize: 2 * 1024 * 1024,
                  maxSize: 1024 * 1024 * 1024,
                  concurrent: 3,
                }}
                multiple={false}
                onSuccess={handleSuccess}
                onError={handleError}
              />
            </Card>
          </Col>

          <Col span={24}>
            <Card title="通用文件上传">
              <FileUploader
                config={{
                  maxSize: 100 * 1024 * 1024,
                  chunkSize: 5 * 1024 * 1024,
                }}
                multiple={true}
                onSuccess={handleSuccess}
                onError={handleError}
              />
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  );
};

export default UploadDemo;
