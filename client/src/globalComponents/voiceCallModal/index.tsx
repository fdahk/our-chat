import React, { useEffect, useRef } from 'react';
// Modal（模态框）、Typography （排版）、Space（间距）等组件
import { Modal, Button, Avatar, Typography, Space } from 'antd';
import { PhoneOutlined, AudioMutedOutlined, AudioOutlined } from '@ant-design/icons';
import { useVoiceCall } from '../../hooks/useVoiceCall';
import styles from './style.module.scss';

const { Text, Title } = Typography; // Typography 组件

export const VoiceCallModal: React.FC = () => {

  // 获取通话的状态和挂断、接受、拒绝通话等方法
  const { callState, acceptCall, rejectCall, terminateCall, toggleMute } = useVoiceCall();

  // 获取音频远程播放器的ref
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  // 播放远程音频
  useEffect(() => {
    if (callState.remoteStream && remoteAudioRef.current) {
      console.log('设置远程音频流');
      // 将远程音频流（ callState.remoteStream ）绑定到页面中的 <audio> 元素（通过 remoteAudioRef 引用），实现远程通话音频的播放
      remoteAudioRef.current.srcObject = callState.remoteStream;
      
      // 尝试自动播放
      const playAudio = async () => {
        try {
          await remoteAudioRef.current?.play();
          console.log('远程音频播放成功');
        } catch (error) {
          console.warn('自动播放被阻止', error);
        }
      };
      
      playAudio();
    }
  }, [callState.remoteStream]);

  // 格式化通话时长
  const formatDuration = (duration: number) => {
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  //获取对方信息进行渲染
  const getDisplayUser = () => {
    if (!callState.localUser || !callState.remoteUser) return null;
    return callState.remoteUser; // 始终显示对方的信息
  };

  const displayUser = getDisplayUser();

  // 渲染通话内容
  const renderCallContent = () => {
    if (!displayUser) return null;

    switch (callState.status) {
      case 'calling':
        return (
          <div className={styles.callContent}>
            <Avatar size={120} src={displayUser.avatar} className={styles.avatar} />
            <Title level={3} className={styles.username}>{displayUser.nickname}</Title>
            <Text className={styles.status}>正在呼叫...</Text>
            <div className={styles.controls}>
              <Button 
                type="primary" 
                danger 
                shape="circle" 
                size="large"
                icon={<PhoneOutlined />}
                onClick={terminateCall}
                className={styles.hangupBtn}
              >
              </Button>
            </div>
          </div>
        );

      case 'ringing':
        return (
          <div className={styles.callContent}>
            <Avatar size={120} src={displayUser.avatar} className={styles.avatar} />
            <Title level={3} className={styles.username}>{displayUser.nickname}</Title>
            <Text className={styles.status}>语音通话邀请</Text>
            <div className={styles.controls}>
              <Space size="large">
                <Button 
                  type="primary" 
                  danger 
                  shape="circle" 
                  size="large"
                  icon={<PhoneOutlined />}
                  onClick={rejectCall}
                  className={styles.rejectBtn}
                />
                <Button 
                  type="primary" 
                  shape="circle" 
                  size="large"
                  icon={<PhoneOutlined />}
                  onClick={acceptCall}
                  className={styles.acceptBtn}
                />
              </Space>
            </div>
          </div>
        );

      case 'connected':
        return (
          <div className={styles.callContent}>
            <Avatar size={120} src={displayUser.avatar} className={styles.avatar} />
            <Title level={3} className={styles.username}>{displayUser.nickname}</Title>
            <Text className={styles.status}>通话中</Text>
            <Text className={styles.duration}>{formatDuration(callState.duration)}</Text>
            <div className={styles.controls}>
              <Space size="large">
                <Button 
                  type={callState.isMuted ? "primary" : "default"}
                  shape="circle" 
                  size="large"
                  icon={callState.isMuted ? <AudioMutedOutlined /> : <AudioOutlined />}
                  onClick={toggleMute}
                  className={styles.muteBtn}
                />
                <Button 
                  type="primary" 
                  danger 
                  shape="circle" 
                  size="large"
                  icon={<PhoneOutlined />}
                  onClick={terminateCall}
                  className={styles.hangupBtn}
                />
              </Space>
            </div>
          </div>
        );

      case 'ended':
        return (
          <div className={styles.callContent}>
            <Avatar size={120} src={displayUser.avatar} className={styles.avatar} />
            <Title level={3} className={styles.username}>{displayUser.nickname}</Title>
            <Text className={styles.status}>
              {callState.error ? `通话失败: ${callState.error}` : '通话已结束'}
            </Text>
            {callState.duration > 0 && (
              <Text className={styles.duration}>
                通话时长: {formatDuration(callState.duration)}
              </Text>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <Modal
        open={callState.isActive}
        footer={null} //不能有底部 footer={null}
        closable={false}
        centered //居中弹窗
        width={400}
        className={styles.voiceCallModal}
        maskClosable={false} //点击遮罩层不能关闭
      >
        {renderCallContent()}
      </Modal>
      
      {/* 远程音频播放器 */}
      <audio 
        ref={remoteAudioRef} 
        autoPlay //自动播放
        playsInline //在浏览器控制台展示播放器控件
        style={{ display: 'none' }}
      />
    </>
  );
};

export default VoiceCallModal;