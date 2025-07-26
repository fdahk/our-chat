import React from 'react';
import { Card, Row, Col, message } from 'antd';
import FileUploader from '../../globalComponents/fileUploader';
import { type FileItem } from '../../utils/upload';

const UploadDemo: React.FC = () => {
  const handleSuccess = (files: FileItem[]) => {
    message.success(`成功上传 ${files.length} 个文件`);
    console.log('上传成功的文件:', files);
  };

  const handleError = (error: string) => {
    message.error(`上传失败: ${error}`);
  };

  return (
    <div style={{width: "100%", height: "100%",overflow: "auto"}}>
    <div style={{ padding: 24 }}>
      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Card title="图片上传（压缩）">
            <FileUploader
              config={{
                allowedTypes: ['image'],
                maxSize: 10 * 1024 * 1024, // 10MB
                compress: true,
                quality: 80
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
                chunkSize: 2 * 1024 * 1024, // 2MB分片
                maxSize: 1024 * 1024 * 1024, // 1GB
                concurrent: 3
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
                maxSize: 100 * 1024 * 1024, // 100MB
                chunkSize: 5 * 1024 * 1024 // 5MB分片
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