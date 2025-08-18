import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../store/rootStore';
import { WebRTCManager } from '../utils/webrtc';
import { WebRTCDiagnostics } from '../utils/webrtcDiagnostics';
import SocketService from '../utils/socket';
import {
  startCall,
  receiveCall,
  connectCall,
  endCall,
  resetCall,
  setLocalStream,
  setRemoteStream,
  toggleMute as toggleMuteAction,
  updateDuration,
  setError,
} from '../store/callStore';
import type { CallUser, ICECandidate } from '../globalType/call';
import { message } from 'antd';

// Socket事件类型定义
interface CallStartEvent {
  callId: string;
  from: CallUser;
  to: CallUser;
  offer: RTCSessionDescriptionInit;
}

interface CallAcceptEvent {
  callId: string;
  from: number;
  to: number;
  answer: RTCSessionDescriptionInit;
}

interface CallRejectEvent {
  callId: string;
}

interface CallEndEvent {
  callId: string;
}

interface CallIceEvent {
  callId: string;
  candidate: ICECandidate;
}

export const useVoiceCall = () => {
  const dispatch = useDispatch();
  const callState = useSelector((state: RootState) => state.call);
  const currentUser = useSelector((state: RootState) => state.user);
  
  const webrtcRef = useRef<WebRTCManager | null>(null);
  const socketRef = useRef(SocketService.getInstance());
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 添加事件处理标记，防止重复处理
  const processedEvents = useRef<Set<string>>(new Set());

  // 初始化WebRTC管理器
  useEffect(() => {
    console.log('初始化语音通话服务');
    
    // 运行初始诊断
    WebRTCDiagnostics.runFullDiagnostics().then(result => {
      if (!result.success) {
        console.warn('WebRTC诊断发现问题:', result.issues);
        // 不阻止初始化，只是警告
      }
    });
    
    webrtcRef.current = new WebRTCManager();
    const webrtc = webrtcRef.current;
    
    // 远程流回调
    webrtc.onRemoteStream = (stream) => {
      console.log('收到远程音频流');
      dispatch(setRemoteStream(stream));
    };
    
    // ICE候选回调
    webrtc.onICECandidate = (candidate) => {
      if (callState.callId) {
        console.log('发送ICE候选');
        socketRef.current.emit('call:ice', {
          callId: callState.callId,
          candidate,
        });
      }
    };
    
    // 连接状态变化回调
    webrtc.onConnectionStateChange = async (state) => {
      console.log('WebRTC连接状态变化:', state);
      
      if (state === 'connected') {
        dispatch(connectCall());
        startDurationTimer();
        message.success('通话连接成功');
      } else if (state === 'failed' || state === 'disconnected') {
        // 运行诊断找出问题
        const issues = await webrtc.diagnoseConnection();
        if (issues.length > 0) {
          console.error('连接问题诊断:', issues);
          dispatch(setError('连接问题: ' + issues.join(', ')));
        }
        handleConnectionFailed();
      }
    };
    
    // 错误回调
    webrtc.onError = (error) => {
      console.error('WebRTC错误:', error);
      dispatch(setError(error.message));
      message.error(`通话错误: ${error.message}`);
    };

    return () => {
      console.log('清理语音通话服务');
      if (webrtcRef.current) {
        webrtcRef.current.cleanup();
        webrtcRef.current = null;
      }
      stopDurationTimer();
    };
  }, []);

  // Socket事件监听
  useEffect(() => {
    const socket = socketRef.current;

    // 收到通话邀请
    const handleCallStart = async (event: CallStartEvent) => {
      console.log('收到通话邀请:', event.callId);
      
      try {
        if (!currentUser) {
          throw new Error('用户未登录');
        }

        // 更新状态，保存offer
        dispatch(receiveCall({
          callId: event.callId,
          localUser: {
            id: currentUser.id,
            username: currentUser.username,
            nickname: currentUser.nickname,
            avatar: currentUser.avatar,
          },
          remoteUser: event.from,
          offer: event.offer, // 保存offer
        }));

        // 显示通话邀请
        message.info(`${event.from.nickname} 向您发起语音通话`);
        
      } catch (error) {
        console.error(' 处理通话邀请失败:', error);
        message.error('处理通话邀请失败');
      }
    };

    // 通话被接受 - 修复版本
    const handleCallAccept = async (event: CallAcceptEvent) => {
      const eventKey = `accept_${event.callId}`;
      
      // 防重复处理
      if (processedEvents.current.has(eventKey)) {
        console.log('重复的accept事件，跳过处理');
        return;
      }
      processedEvents.current.add(eventKey);
      
      console.log('通话被接受:', event.callId, '当前callId:', callState.callId);
      
      try {
        if (!webrtcRef.current) {
          console.error('WebRTC管理器不存在');
          return;
        }
        
        if (event.callId !== callState.callId) {
          console.warn('忽略无关的accept事件', { eventCallId: event.callId, currentCallId: callState.callId });
          return;
        }

        // 详细状态检查
        const state = webrtcRef.current.getDetailedState();
        console.log('处理Answer前的详细状态:', state);

        // 检查Answer有效性
        if (!event.answer || event.answer.type !== 'answer') {
          console.error('无效的Answer:', event.answer);
          throw new Error('收到无效的Answer');
        }

        // 状态检查和重试逻辑
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          const currentState = webrtcRef.current.getDetailedState();
          console.log(`尝试 ${retryCount + 1}/${maxRetries}, 当前状态:`, currentState);
          
          if (currentState?.signalingState === 'have-local-offer') {
            // 状态正确，处理Answer
            await webrtcRef.current.handleAnswer(event.answer);
            console.log('Answer处理完成，等待连接建立');
            return;
          } else if (currentState?.signalingState === 'stable') {
            console.log('连接已稳定，跳过Answer处理');
            return;
          } else {
            console.log(`状态不正确: ${currentState?.signalingState}, 等待中...`);
            await new Promise(resolve => setTimeout(resolve, 300));
            retryCount++;
          }
        }
        
        throw new Error(`经过${maxRetries}次重试后，PeerConnection状态仍然异常`);
        
      } catch (error) {
        console.error('处理Answer失败:', error);
        dispatch(setError('连接建立失败: ' + (error as Error).message));
        message.error('连接建立失败');
        
        // 清理事件标记，允许重试
        processedEvents.current.delete(eventKey);
      }
    };

    // 通话被拒绝
    const handleCallReject = (event: CallRejectEvent) => {
      console.log('通话被拒绝:', event.callId);
      if (event.callId === callState.callId) {
        dispatch(endCall());
        message.info('对方拒绝了通话');
        cleanup();
      }
    };

    // 通话结束
    const handleCallEnd = (event: CallEndEvent) => {
      console.log('通话结束:', event.callId);
      if (event.callId === callState.callId) {
        dispatch(endCall());
        message.info('通话已结束');
        cleanup();
      }
    };

    // ICE候选交换
    const handleCallIce = async (event: CallIceEvent) => {
      try {
        if (webrtcRef.current && event.callId === callState.callId) {
          console.log('处理ICE候选');
          await webrtcRef.current.addIceCandidate(event.candidate);
        }
      } catch (error) {
        console.warn('处理ICE候选失败:', error);
      }
    };

    // 绑定事件监听器
    socket.on('call:start', handleCallStart);
    socket.on('call:accept', handleCallAccept);
    socket.on('call:reject', handleCallReject);
    socket.on('call:end', handleCallEnd);
    socket.on('call:ice', handleCallIce);

    // 清理监听器
    return () => {
      console.log('清理Socket事件监听器');
      processedEvents.current.clear();
      socket.off('call:start', handleCallStart);
      socket.off('call:accept', handleCallAccept);
      socket.off('call:reject', handleCallReject);
      socket.off('call:end', handleCallEnd);
      socket.off('call:ice', handleCallIce);
    };
  }, [callState.callId, currentUser, dispatch]);

  // 工具函数
  const startDurationTimer = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
    }
    durationTimerRef.current = setInterval(() => {
      dispatch(updateDuration());
    }, 1000);
  }, [dispatch]);

  const stopDurationTimer = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  const handleConnectionFailed = useCallback(() => {
    console.warn('WebRTC连接失败');
    dispatch(setError('网络连接失败'));
    message.error('网络连接失败，请检查网络设置');
    cleanup();
  }, [dispatch]);

  const cleanup = useCallback(() => {
    console.log('清理通话资源');
    
    stopDurationTimer();
    
    if (webrtcRef.current) {
      webrtcRef.current.cleanup();
    }
    
    dispatch(setLocalStream(null));
    dispatch(setRemoteStream(null));
    
    setTimeout(() => {
      dispatch(resetCall());
    }, 3000);
  }, [dispatch, stopDurationTimer]);

  // 发起通话
  const initiateCall = useCallback(async (targetUser: CallUser) => {
    console.log('发起通话给:', targetUser.username);
    
    try {
      if (!currentUser) {
        throw new Error('用户未登录');
      }

      if (!webrtcRef.current) {
        throw new Error('WebRTC服务不可用');
      }

      const callId = `call_${currentUser.id}_${targetUser.id}_${Date.now()}`;
      
      // 1. 先更新状态
      dispatch(startCall({
        callId,
        localUser: {
          id: currentUser.id,
          username: currentUser.username,
          nickname: currentUser.nickname,
          avatar: currentUser.avatar,
        },
        remoteUser: targetUser,
      }));

      // 2. 重置WebRTC状态，确保干净开始
      console.log('重置WebRTC状态');
      webrtcRef.current.reset();
      await new Promise(resolve => setTimeout(resolve, 100));

      // 3. 获取本地音频流
      console.log('获取麦克风权限');
      const localStream = await webrtcRef.current.getUserMedia();
      dispatch(setLocalStream(localStream));

      // 4. 创建offer (不要提前添加stream，让createOffer自己处理)
      console.log('创建通话请求');
      const offer = await webrtcRef.current.createOffer();
      
      // 5. 验证offer创建后的状态
      const stateAfterOffer = webrtcRef.current.getDetailedState();
      console.log('Offer创建后状态:', stateAfterOffer);
      
      if (stateAfterOffer?.signalingState !== 'have-local-offer') {
        throw new Error(`Offer创建后状态异常: ${stateAfterOffer?.signalingState}`);
      }

      // 6. 发送通话邀请
      console.log('发送通话邀请，Offer状态已确认');
      socketRef.current.emit('call:start', {
        callId,
        from: {
          id: currentUser.id,
          username: currentUser.username,
          nickname: currentUser.nickname,
          avatar: currentUser.avatar,
        },
        to: targetUser,
        offer,
      });

      console.log('通话发起成功，等待对方接受');
      
    } catch (error) {
      console.error('发起通话失败:', error);
      const errorMessage = error instanceof Error ? error.message : '发起通话失败';
      dispatch(setError(errorMessage));
      message.error(errorMessage);
      cleanup();
    }
  }, [currentUser, dispatch, cleanup]);

  // 接受通话
  const acceptCall = useCallback(async () => {
    console.log('接受通话');
    
    try {
      if (!webrtcRef.current || !callState.callId || !callState.pendingOffer) {
        throw new Error('通话状态异常');
      }

      // 重置WebRTC状态，确保干净的开始
      console.log('重置WebRTC状态');
      webrtcRef.current.reset();
      
      // 等待重置完成
      await new Promise(resolve => setTimeout(resolve, 200));

      // 1. 获取本地音频流
      console.log('获取麦克风权限');
      const localStream = await webrtcRef.current.getUserMedia();
      dispatch(setLocalStream(localStream));

      // 2. 显示状态检查
      const stateBefore = webrtcRef.current.getDetailedState();
      console.log('处理Offer前状态:', stateBefore);

      // 3. 处理offer并创建answer
      console.log('处理Offer并创建Answer');
      const answer = await webrtcRef.current.handleOffer(callState.pendingOffer);

      // 4. 显示状态检查
      const stateAfter = webrtcRef.current.getDetailedState();
      console.log('创建Answer后状态:', stateAfter);

      // 5. 发送answer
      console.log('发送Answer');
      socketRef.current.emit('call:accept', {
        callId: callState.callId,
        from: callState.localUser?.id,
        to: callState.remoteUser?.id,
        answer,
      });

      console.log('通话接受成功');
      
    } catch (error) {
      console.error('接受通话失败:', error);
      const errorMessage = error instanceof Error ? error.message : '接受通话失败';
      dispatch(setError(errorMessage));
      message.error(errorMessage);
      cleanup();
    }
  }, [callState.callId, callState.pendingOffer, callState.localUser, callState.remoteUser, dispatch, cleanup]);

  // 拒绝通话
  const rejectCall = useCallback(() => {
    console.log('拒绝通话');
    
    if (callState.callId) {
      socketRef.current.emit('call:reject', {
        callId: callState.callId,
      });
    }
    
    dispatch(endCall());
    cleanup();
  }, [callState.callId, dispatch, cleanup]);

  // 结束通话
  const terminateCall = useCallback(() => {
    console.log('结束通话');
    
    if (callState.callId) {
      socketRef.current.emit('call:end', {
        callId: callState.callId,
      });
    }
    
    dispatch(endCall());
    cleanup();
  }, [callState.callId, dispatch, cleanup]);

  // 切换静音
  const toggleMute = useCallback(() => {
    if (webrtcRef.current) {
      const isMuted = webrtcRef.current.toggleMute();
      dispatch(toggleMuteAction());
      return isMuted;
    }
    return false;
  }, [dispatch]);

  // WebRTC状态监听
  useEffect(() => {
    if (webrtcRef.current) {
      const interval = setInterval(() => {
        const state = webrtcRef.current?.getDetailedState();
        if (state && callState.isActive) {
          console.log('WebRTC状态监控:', state);
        }
      }, 2000);
      
      return () => clearInterval(interval);
    }
  }, [callState.isActive]);

  return {
    callState,
    initiateCall,
    acceptCall,
    rejectCall,
    terminateCall,
    toggleMute,
  };
};