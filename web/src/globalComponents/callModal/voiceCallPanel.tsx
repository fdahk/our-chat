import React from 'react';
import { Button, Avatar, Typography, Space } from 'antd';
import { PhoneOutlined, AudioMutedOutlined, AudioOutlined } from '@ant-design/icons';
import type { CallState } from '../../store/callStore';
import styles from './style.module.scss';

const { Text, Title } = Typography;

interface VoiceCallPanelProps {
  callState: CallState;
  onAccept: () => void;
  onReject: () => void;
  onHangup: () => void;
  onToggleMute: () => void;
}

const formatDuration = (duration: number) => {
  const minutes = Math.floor(duration / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

// 语音通话面板:头像 + 状态文案 + 控制按钮。纯展示,不含信令逻辑。
const VoiceCallPanel: React.FC<VoiceCallPanelProps> = ({
  callState,
  onAccept,
  onReject,
  onHangup,
  onToggleMute,
}) => {
  const user = callState.remoteUser; // 始终显示对方信息
  if (!user) return null;

  return (
    <div className={styles.callContent}>
      <Avatar size={120} src={user.avatar} className={styles.avatar} />
      <Title level={3} className={styles.username}>{user.nickname}</Title>

      {callState.status === 'calling' && <Text className={styles.status}>正在呼叫...</Text>}
      {callState.status === 'ringing' && <Text className={styles.status}>语音通话邀请</Text>}
      {callState.status === 'connected' && (
        <>
          <Text className={styles.status}>通话中</Text>
          <Text className={styles.duration}>{formatDuration(callState.duration)}</Text>
        </>
      )}
      {callState.status === 'ended' && (
        <>
          <Text className={styles.status}>
            {callState.error ? `通话失败: ${callState.error}` : '通话已结束'}
          </Text>
          {callState.duration > 0 && (
            <Text className={styles.duration}>通话时长: {formatDuration(callState.duration)}</Text>
          )}
        </>
      )}

      {callState.status === 'calling' && (
        <div className={styles.controls}>
          <Button type="primary" danger shape="circle" size="large" icon={<PhoneOutlined />} onClick={onHangup} className={styles.hangupBtn} />
        </div>
      )}
      {callState.status === 'ringing' && (
        <div className={styles.controls}>
          <Space size="large">
            <Button type="primary" danger shape="circle" size="large" icon={<PhoneOutlined />} onClick={onReject} className={styles.rejectBtn} />
            <Button type="primary" shape="circle" size="large" icon={<PhoneOutlined />} onClick={onAccept} className={styles.acceptBtn} />
          </Space>
        </div>
      )}
      {callState.status === 'connected' && (
        <div className={styles.controls}>
          <Space size="large">
            <Button
              type={callState.isMuted ? 'primary' : 'default'}
              shape="circle"
              size="large"
              icon={callState.isMuted ? <AudioMutedOutlined /> : <AudioOutlined />}
              onClick={onToggleMute}
              className={styles.muteBtn}
            />
            <Button type="primary" danger shape="circle" size="large" icon={<PhoneOutlined />} onClick={onHangup} className={styles.hangupBtn} />
          </Space>
        </div>
      )}
    </div>
  );
};

export default VoiceCallPanel;
