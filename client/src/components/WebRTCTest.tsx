import React, { useState, useRef } from 'react';
import { Button, Card, Typography, Alert, Space } from 'antd';
import { WebRTCManager } from '../utils/webrtc';
import { WebRTCDiagnostics } from '../utils/webrtcDiagnostics';

const { Title, Paragraph, Text } = Typography;

export const WebRTCTest: React.FC = () => {
  const [diagnosticResult, setDiagnosticResult] = useState<any>(null);
  const [isRunningDiagnostic, setIsRunningDiagnostic] = useState(false);
  const [webrtcState, setWebrtcState] = useState<any>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  
  const webrtcRef = useRef<WebRTCManager | null>(null);

  // 运行诊断
  const runDiagnostics = async () => {
    setIsRunningDiagnostic(true);
    try {
      const result = await WebRTCDiagnostics.runFullDiagnostics();
      setDiagnosticResult(result);
    } catch (error) {
      console.error('诊断失败:', error);
    } finally {
      setIsRunningDiagnostic(false);
    }
  };

  // 测试麦克风
  const testMicrophone = async () => {
    try {
      if (!webrtcRef.current) {
        webrtcRef.current = new WebRTCManager();
      }
      
      const stream = await webrtcRef.current.getUserMedia();
      setMicStream(stream);
      console.log('麦克风测试成功');
      
      // 显示WebRTC状态
      const state = webrtcRef.current.getDetailedState();
      setWebrtcState(state);
    } catch (error) {
      console.error('麦克风测试失败:', error);
      alert('麦克风测试失败: ' + (error as Error).message);
    }
  };

  // 停止麦克风
  const stopMicrophone = () => {
    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
      setMicStream(null);
    }
    if (webrtcRef.current) {
      webrtcRef.current.cleanup();
      webrtcRef.current = null;
    }
    setWebrtcState(null);
  };

  // 创建测试连接
  const testConnection = async () => {
    try {
      if (!webrtcRef.current) {
        webrtcRef.current = new WebRTCManager();
      }

      // 获取音频流
      await webrtcRef.current.getUserMedia();
      
      // 创建offer
      const offer = await webrtcRef.current.createOffer();
      console.log('Offer创建成功:', offer);
      
      // 显示状态
      const state = webrtcRef.current.getDetailedState();
      setWebrtcState(state);
      
      alert('WebRTC连接测试成功！');
    } catch (error) {
      console.error('连接测试失败:', error);
      alert('连接测试失败: ' + (error as Error).message);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <Title level={2}>WebRTC 功能测试</Title>
      
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 诊断部分 */}
        <Card title="系统诊断" size="small">
          <Space>
            <Button 
              type="primary" 
              onClick={runDiagnostics}
              loading={isRunningDiagnostic}
            >
              运行诊断
            </Button>
          </Space>
          
          {diagnosticResult && (
            <div style={{ marginTop: '16px' }}>
              <Alert
                type={diagnosticResult.success ? 'success' : 'error'}
                message={diagnosticResult.success ? '诊断通过' : '发现问题'}
                description={
                  diagnosticResult.issues.length > 0 ? (
                    <ul>
                      {diagnosticResult.issues.map((issue: string, index: number) => (
                        <li key={index}>{issue}</li>
                      ))}
                    </ul>
                  ) : '所有检查都通过'
                }
              />
            </div>
          )}
        </Card>

        {/* 麦克风测试 */}
        <Card title="麦克风测试" size="small">
          <Space>
            <Button onClick={testMicrophone} disabled={!!micStream}>
              测试麦克风
            </Button>
            <Button onClick={stopMicrophone} disabled={!micStream}>
              停止麦克风
            </Button>
          </Space>
          
          {micStream && (
            <div style={{ marginTop: '16px' }}>
              <Alert type="success" message="麦克风正常工作" />
              <Paragraph>
                <Text code>音频轨道数: {micStream.getAudioTracks().length}</Text>
              </Paragraph>
            </div>
          )}
        </Card>

        {/* WebRTC连接测试 */}
        <Card title="WebRTC连接测试" size="small">
          <Space>
            <Button onClick={testConnection}>
              测试WebRTC连接
            </Button>
          </Space>
        </Card>

        {/* WebRTC状态显示 */}
        {webrtcState && (
          <Card title="WebRTC状态" size="small">
            <pre style={{ background: '#f5f5f5', padding: '12px', borderRadius: '4px' }}>
              {JSON.stringify(webrtcState, null, 2)}
            </pre>
          </Card>
        )}

        {/* 使用说明 */}
        <Card title="使用说明" size="small">
          <Paragraph>
            <Text strong>诊断步骤：</Text>
          </Paragraph>
          <ol>
            <li>点击"运行诊断"检查系统兼容性</li>
            <li>点击"测试麦克风"验证音频权限</li>
            <li>点击"测试WebRTC连接"验证连接创建</li>
          </ol>
          
          <Paragraph>
            <Text strong>常见问题：</Text>
          </Paragraph>
          <ul>
            <li>如果是HTTPS问题，请使用localhost或HTTPS环境</li>
            <li>如果麦克风权限被拒绝，请在浏览器设置中允许</li>
            <li>如果网络连接失败，请检查防火墙设置</li>
          </ul>
        </Card>
      </Space>
    </div>
  );
};