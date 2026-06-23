import React, { useEffect, useRef } from 'react';
import { Button, Avatar, Typography, Space } from 'antd';
import { PhoneOutlined, AudioMutedOutlined, AudioOutlined, VideoCameraOutlined } from '@ant-design/icons';
import type { CallState } from '../../store/callStore';
import styles from './style.module.scss';

const { Text, Title } = Typography;

interface VideoCallPanelProps {
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

// 把媒体流绑定到 video 元素并主动 play():srcObject 是异步设置,muted 的视频虽允许自动播放,
// 但流后到/元素后挂时不一定触发,显式 play() 才稳。stream 变化(含 null 清理)时重绑。
const useBindStream = (
  ref: React.RefObject<HTMLVideoElement | null>,
  stream: MediaStream | null,
) => {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) el.play().catch(() => {});
  }, [ref, stream]);
};

// 视频通话面板:远程画面铺满 + 本地画面 PIP + 控制条。自己持有 video 元素并绑定媒体流。
const VideoCallPanel: React.FC<VideoCallPanelProps> = ({
  callState,
  onAccept,
  onReject,
  onHangup,
  onToggleMute,
}) => {
  const user = callState.remoteUser;
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  // 远程画面静音:声音走容器里的 audio 元素,避免双份音频;本地画面始终静音不自听
  useBindStream(remoteVideoRef, callState.remoteStream);
  useBindStream(localVideoRef, callState.localStream);

  if (!user) return null;

  return (
    <div className={styles.videoStage}>
      <video ref={remoteVideoRef} className={styles.remoteVideo} autoPlay playsInline muted />

      {callState.status !== 'connected' && (
        <div className={styles.videoPlaceholder}>
          <Avatar size={96} src={user.avatar} />
          <Title level={4} className={styles.username}>{user.nickname}</Title>
          <Text className={styles.status}>
            {callState.status === 'calling'
              ? '正在等待对方接受...'
              : callState.status === 'ringing'
              ? '邀请你视频通话'
              : callState.error
              ? `通话失败: ${callState.error}`
              : '通话已结束'}
          </Text>
        </div>
      )}

      <video ref={localVideoRef} className={styles.localVideo} autoPlay playsInline muted />

      {callState.status === 'connected' && (
        <div className={styles.videoTopBar}>{formatDuration(callState.duration)}</div>
      )}

      {callState.status !== 'ended' && (
        <div className={styles.videoControls}>
          {callState.status === 'ringing' ? (
            <Space size="large">
              <Button danger shape="circle" size="large" icon={<PhoneOutlined />} onClick={onReject} className={styles.rejectBtn} />
              <Button type="primary" shape="circle" size="large" icon={<VideoCameraOutlined />} onClick={onAccept} className={styles.acceptBtn} />
            </Space>
          ) : (
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
          )}
        </div>
      )}
    </div>
  );
};

export default VideoCallPanel;
